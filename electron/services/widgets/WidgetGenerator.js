const { contentWithReferences } = require('../aiReferences');
const { SDK_DOC } = require('./sdkDoc');
const { parseManifest } = require('./manifest');

const MAX_EXISTING_WIDGETS = 20;
const MAX_ERROR_CHARS = 4000;
// 从零新建时放开一些，让设计更多样；修改已有代码、修复报错时保持保守，避免改坏
const CREATE_TEMPERATURE = 0.6;
const EDIT_TEMPERATURE = 0.3;

/** 从模型输出中取出完整 HTML：优先 ```html 代码块，其次裸露的 <!doctype ... </html> */
const extractHtml = (text) => {
  const source = String(text || '');
  const fenced = /```(?:html)?\s*\n([\s\S]*?)```/i.exec(source);
  const candidate = fenced ? fenced[1] : source;
  const start = candidate.search(/<!doctype html|<html[\s>]/i);
  if (start < 0) return null;
  const end = candidate.toLowerCase().lastIndexOf('</html>');
  if (end < 0) return null;
  return candidate.slice(start, end + '</html>'.length).trim();
};

// 修改已有代码时可以只输出改动：多个 SEARCH/REPLACE 块，按顺序应用，未改动的代码原样保留
const PATCH_RE = /<{7} SEARCH\r?\n([\s\S]*?)\r?\n={7}\r?\n([\s\S]*?)\r?\n?>{7} REPLACE/g;
const MAX_CONTINUATIONS = 3;

const parsePatches = (text) => [...String(text || '').matchAll(PATCH_RE)].map((match) => ({ search: match[1], replace: match[2] }));

const countOccurrences = (haystack, needle) => {
  let count = 0;
  for (let index = haystack.indexOf(needle); index >= 0; index = haystack.indexOf(needle, index + 1)) count++;
  return count;
};

/** 精确匹配不到时，按“每行去掉首尾空白”比较，容忍缩进差异；仍要求唯一 */
const findTrimmedRange = (code, search) => {
  const lines = code.split('\n');
  const wanted = search.split('\n').map((line) => line.trim());
  while (wanted.length && !wanted[0]) wanted.shift();
  while (wanted.length && !wanted[wanted.length - 1]) wanted.pop();
  if (!wanted.length) return null;
  const hits = [];
  for (let start = 0; start + wanted.length <= lines.length; start++) {
    if (wanted.every((line, offset) => lines[start + offset].trim() === line)) hits.push(start);
  }
  if (hits.length !== 1) return { count: hits.length };
  const before = lines.slice(0, hits[0]).join('\n');
  const from = hits[0] === 0 ? 0 : before.length + 1;
  const to = from + lines.slice(hits[0], hits[0] + wanted.length).join('\n').length;
  return { count: 1, from, to };
};

const applyPatches = (code, patches) => {
  let result = String(code);
  patches.forEach((patch, index) => {
    const label = `第 ${index + 1} 个修改块`;
    if (!patch.search.trim()) throw new Error(`${label}的 SEARCH 为空`);
    const exact = countOccurrences(result, patch.search);
    if (exact === 1) {
      result = result.replace(patch.search, () => patch.replace);
      return;
    }
    if (exact > 1) throw new Error(`${label}的 SEARCH 在原代码中出现了 ${exact} 次，请多包含几行使它唯一`);
    const range = findTrimmedRange(result, patch.search);
    if (range?.count === 1) {
      result = `${result.slice(0, range.from)}${patch.replace}${result.slice(range.to)}`;
      return;
    }
    throw new Error(range?.count > 1
      ? `${label}的 SEARCH 在原代码中出现了多次，请多包含几行使它唯一`
      : `${label}的 SEARCH 在原代码中找不到（必须与原代码逐行一致）：${patch.search.split('\n')[0].slice(0, 80)}`);
  });
  return result;
};

// 续写的开头可能重新打开代码块，去掉
const stripContinuationFence = (piece) => String(piece || '').replace(/^\s*```(?:html)?[ \t]*\r?\n/i, '');

const formatErrors = (errors = []) => errors
  .slice(0, 8)
  .map((error, index) => `${index + 1}. ${error.message}${error.stack ? `\n${String(error.stack).split('\n').slice(0, 4).join('\n')}` : ''}`)
  .join('\n')
  .slice(0, MAX_ERROR_CHARS);

/**
 * 组件生成器：根据自然语言需求生成或修改组件代码（单文件 HTML）。
 * 预跑与自修复循环由渲染层驱动（需要在沙箱里真实运行），这里只负责一次“生成/修改”调用。
 */
class WidgetGenerator {
  /**
   * @param {object} deps
   * @param {() => any} deps.getChatService 返回 AIChatService（流式生成，可能尚未初始化）
   * @param {any} deps.aiService 兜底的非流式调用
   * @param {import('./WidgetService')} deps.widgetService
   */
  constructor({ getChatService, aiService, widgetService }) {
    this.getChatService = getChatService;
    this.aiService = aiService;
    this.widgetService = widgetService;
    this.running = new Map();
  }

  // 列出 id、实例与数据集合：既避免做出重复的组件，也让新组件能在 imports 中引用它们的数据
  describeExistingWidgets(excludeId) {
    const widgets = this.widgetService.listWidgets()
      .filter((widget) => widget.id !== excludeId)
      .slice(0, MAX_EXISTING_WIDGETS);
    if (!widgets.length) return '（用户还没有其他组件）';
    return widgets.map((widget) => {
      const instances = this.widgetService.dao.listInstances(widget.id);
      const collections = [...new Set(instances.flatMap((instance) => this.widgetService.dao.listCollections(instance.id).map((item) => item.collection)))];
      const declared = Object.keys(widget.manifest.data || {});
      const names = [...new Set([...declared, ...collections])].slice(0, 12);
      return `- ${widget.name}（id: ${widget.id}）：${widget.manifest.description || '无描述'}；实例：${instances.map((instance) => instance.name).slice(0, 5).join('、') || '无'}；数据集合：${names.join('、') || '无'}`;
    }).join('\n');
  }

  buildSystemPrompt({ widgetId }) {
    const today = new Date();
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return [
      '你是 Flota 的组件工程师，根据用户的需求编写可以直接运行的组件（单文件 HTML 小应用）。',
      '用户的需求千差万别，请准确理解意图，做出真正好用、细节完整的组件，而不是简单的演示。',
      `今天是 ${date}。`,
      '',
      SDK_DOC,
      '',
      '## 用户已有的其他组件（避免做出重复的组件；需要汇总它们的数据时在 imports 中声明 "id.集合名"）',
      this.describeExistingWidgets(widgetId),
      '',
      '不要套用固定闪卡或看板模板。根据当前需求独立设计信息结构、排版和交互，SDK 仅约束数据接口。',
    ].join('\n');
  }

  buildDataSummary(instanceId) {
    if (!instanceId) return '';
    const collections = this.widgetService.dao.listCollections(instanceId);
    if (!collections.length) return '当前实例还没有数据。';
    return collections.map((item) => {
      const samples = this.widgetService.dao.listRecords(instanceId, item.collection).slice(0, 3)
        .map((record) => JSON.stringify(record).slice(0, 400));
      return `- 集合 ${item.collection}：${item.count} 条，示例：\n  ${samples.join('\n  ')}`;
    }).join('\n');
  }

  /**
   * @param {object} params
   * @param {string} params.instruction 用户需求或修改要求
   * @param {string} [params.baseCode] 在此代码基础上修改
   * @param {string} [params.widgetId] 被修改的组件
   * @param {string} [params.instanceId] 提供数据概况的实例（修改时数据必须保持兼容）
   * @param {Array<{message: string, stack?: string}>} [params.errors] 预跑中捕获的错误，要求修复
   * @param {Array<{role: string, content: string}>} [params.history] 本次工作台里之前的需求（不含代码）
   * @param {string} params.requestId
   * @param {(progress: { chars: number }) => void} [params.onProgress]
   */
  async generate({ instruction, baseCode, widgetId, instanceId, errors, history = [], referenceImages = [], requestId, onProgress }) {
    const messages = [{ role: 'system', content: this.buildSystemPrompt({ widgetId }) }];
    for (const item of history.slice(-6)) {
      if (item && typeof item.content === 'string' && (item.role === 'user' || item.role === 'assistant')) {
        messages.push({ role: item.role, content: item.content.slice(0, 2000) });
      }
    }

    const parts = [];
    if (baseCode) {
      parts.push('这是组件当前的完整代码：', '```html', baseCode, '```');
      const dataSummary = this.buildDataSummary(instanceId);
      if (dataSummary) parts.push('', '组件现有数据概况（修改时必须兼容这些数据）：', dataSummary);
    }
    if (errors?.length) {
      parts.push('', '这段代码在运行时出现了下面的问题，请找出原因并修复：', formatErrors(errors));
    }
    if (instruction) parts.push('', baseCode ? `修改要求：${instruction}` : `需求：${instruction}`);
    parts.push('', baseCode
      ? [
        '输出方式（二选一）：',
        '1. 改动不多时，只输出需要修改的片段，每处用下面的格式，可以有多处，按顺序应用；未改动的代码会原样保留：',
        '<<<<<<< SEARCH',
        '（原代码中连续的几行，必须与原代码逐字一致，并且足以唯一定位）',
        '=======',
        '（替换后的内容）',
        '>>>>>>> REPLACE',
        '2. 改动超过一半或需要重写结构时，输出修改后的完整 HTML（```html 代码块）。',
      ].join('\n')
      : '请输出完整 HTML（```html 代码块）。');
    messages.push({ role: 'user', content: contentWithReferences(parts.join('\n'), referenceImages) });

    const controller = new AbortController();
    this.running.set(requestId, controller);
    try {
      const temperature = baseCode || errors?.length ? EDIT_TEMPERATURE : CREATE_TEMPERATURE;
      let lastError
      for (let attempt = 0; attempt < 2; attempt++) {
        const content = await this.complete(messages, { abortSignal: controller.signal, onProgress, temperature });
        if (controller.signal.aborted) throw new Error('已停止生成');
        try {
          const patches = baseCode ? parsePatches(content) : [];
          const code = patches.length ? applyPatches(baseCode, patches) : extractHtml(content);
          if (!code) throw new Error('AI 没有输出完整的 HTML 代码，也没有可用的 SEARCH/REPLACE 修改块');
          const { manifest, found, error } = parseManifest(code);
          if (!found) throw new Error('生成的代码缺少组件清单');
          if (error) throw new Error(error);
          const explanation = content.replace(PATCH_RE, '').replace(/```[\s\S]*?```/g, '').trim().slice(0, 500);
          return { code, sizes: manifest.sizes, explanation };
        } catch (error) {
          lastError = error;
          messages.push({ role: 'assistant', content }, { role: 'user', content: baseCode
            ? `输出未通过：${error.message}。保留原始需求和设计重新输出：可以修正 SEARCH/REPLACE 块（SEARCH 必须与原代码逐字一致），也可以直接输出修改后的完整 HTML（\`\`\`html 代码块）。`
            : `输出格式未通过：${error.message}。保留原始需求和设计，补全有效清单与完整 HTML。只输出一个 html 代码块。` });
        }
      }
      throw new Error(`组件代码格式修复后仍不完整：${lastError.message}`);
    } finally {
      this.running.delete(requestId);
    }
  }

  /** 流式生成；输出被长度上限截断时让模型从中断处续写（最多 3 次），拼成完整结果，复杂组件不再因长度失败 */
  async complete(messages, { abortSignal, onProgress, temperature = EDIT_TEMPERATURE }) {
    const chatService = this.getChatService?.();
    if (chatService?._generatePlainText) {
      let chars = 0;
      let lastReport = 0;
      let content = '';
      for (let part = 0; part <= MAX_CONTINUATIONS; part++) {
        const conversation = part === 0 ? messages : [
          ...messages,
          { role: 'assistant', content },
          { role: 'user', content: '上一条回复在末尾被输出长度上限截断了。请从中断的位置直接接着写：不要重复已经输出的内容，不要重新开始，不要加任何解释。' },
        ];
        const result = await chatService._generatePlainText(conversation, {
          temperature,
          bypassTokenLimit: true,
          abortSignal,
          timeoutMs: 10 * 60 * 1000,
          onToken: (token) => {
            chars += String(token || '').length;
            if (onProgress && chars - lastReport >= 200) {
              lastReport = chars;
              onProgress({ chars });
            }
          },
        });
        const piece = String(result.content || '');
        content += part === 0 ? piece : stripContinuationFence(piece);
        if (!result.truncated) return content;
        if (abortSignal?.aborted) break;
      }
      throw Object.assign(new Error('生成内容续写多次后仍超出输出长度上限，请拆分需求或在设置中调高输出上限'), { code: 'TRUNCATED' });
    }
    const result = await this.aiService.chat(messages, { temperature, bypassTokenLimit: true, timeoutMs: 300000, signal: abortSignal });
    if (!result?.success) throw new Error(result?.error || 'AI 调用失败');
    return String(result.data?.content || '');
  }

  cancel(requestId) {
    const controller = this.running.get(requestId);
    if (!controller) return false;
    controller.abort();
    this.running.delete(requestId);
    return true;
  }
}

WidgetGenerator.extractHtml = extractHtml;
WidgetGenerator.parsePatches = parsePatches;
WidgetGenerator.applyPatches = applyPatches;

module.exports = WidgetGenerator;
