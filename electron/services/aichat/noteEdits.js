// AI 局部修改笔记：按 find/replace 只改指定片段，其余内容原样保留。
// 提出修改时校验一次并生成对比预览；用户确认时以最新内容再应用一次，
// 期间用户在别处的编辑会保留，被替换的原文若已变化则拒绝，不会静默覆盖。
const crypto = require('crypto');

const MAX_EDITS = 50;
const PREVIEW_CONTEXT = 40;
const PREVIEW_MAX = 400;

const contentHash = (text) => crypto.createHash('sha1').update(String(text ?? '')).digest('hex');

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const countExact = (haystack, needle) => {
  let count = 0;
  for (let index = haystack.indexOf(needle); index >= 0; index = haystack.indexOf(needle, index + 1)) count++;
  return count;
};

/** 找到 find 在 content 中唯一的位置：先精确匹配，再把连续空白（空格、换行）视为等价 */
const locate = (content, find) => {
  const exact = countExact(content, find);
  if (exact === 1) {
    const from = content.indexOf(find);
    return { from, to: from + find.length };
  }
  if (exact > 1) return { count: exact };
  const pattern = find.trim().split(/\s+/).map(escapeRegExp).join('\\s+');
  if (!pattern) return { count: 0 };
  const matches = [...content.matchAll(new RegExp(pattern, 'g'))];
  if (matches.length !== 1) return { count: matches.length };
  return { from: matches[0].index, to: matches[0].index + matches[0][0].length };
};

const clip = (text, max = PREVIEW_MAX) => (text.length > max ? `${text.slice(0, max)}…` : text);

/**
 * @param {string} content 当前正文
 * @param {{ edits?: Array<{ find: string, replace: string }>, append?: string }} request
 * @returns {{ content: string, changes: Array<{ before: string, after: string, contextBefore: string, contextAfter: string }> }}
 */
const applyNoteEdits = (content, { edits = [], append } = {}) => {
  if (!Array.isArray(edits)) throw new Error('edits 必须是数组');
  if (edits.length > MAX_EDITS) throw new Error(`一次最多 ${MAX_EDITS} 处修改`);
  let result = String(content ?? '');
  const changes = [];
  edits.forEach((edit, index) => {
    const label = `第 ${index + 1} 处修改`;
    const find = typeof edit?.find === 'string' ? edit.find : '';
    const replace = typeof edit?.replace === 'string' ? edit.replace : '';
    if (!find.trim()) throw new Error(`${label}缺少 find（要替换的原文）`);
    const position = locate(result, find);
    if (position.count !== undefined) {
      throw new Error(position.count > 1
        ? `${label}的原文在笔记中出现了 ${position.count} 次，请多带一些上下文使它唯一`
        : `${label}的原文在笔记中找不到：「${clip(find.trim(), 60)}」。请先用 search_in_current_note 或 read_current_note 确认原文后重试`);
    }
    changes.push({
      before: clip(result.slice(position.from, position.to)),
      after: clip(replace),
      contextBefore: result.slice(Math.max(0, position.from - PREVIEW_CONTEXT), position.from),
      contextAfter: result.slice(position.to, position.to + PREVIEW_CONTEXT),
    });
    result = `${result.slice(0, position.from)}${replace}${result.slice(position.to)}`;
  });
  if (typeof append === 'string' && append.trim()) {
    const separator = !result || result.endsWith('\n\n') ? '' : result.endsWith('\n') ? '\n' : '\n\n';
    changes.push({ before: '', after: clip(append), contextBefore: result.slice(-PREVIEW_CONTEXT), contextAfter: '' });
    result = `${result}${separator}${append}`;
  }
  if (!changes.length) throw new Error('没有要应用的修改');
  return { content: result, changes };
};

/** 整篇改写的预览：去掉首尾相同的行，只展示中间真正变化的部分 */
const previewRewrite = (before, after) => {
  const a = String(before ?? '').split('\n');
  const b = String(after ?? '').split('\n');
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length - 1;
  let endB = b.length - 1;
  while (endA >= start && endB >= start && a[endA] === b[endB]) { endA--; endB--; }
  return {
    changedLines: Math.max(endA - start + 1, 0) + Math.max(endB - start + 1, 0),
    changes: [{
      before: clip(a.slice(start, endA + 1).join('\n')),
      after: clip(b.slice(start, endB + 1).join('\n')),
      contextBefore: start > 0 ? clip(a[start - 1], PREVIEW_CONTEXT) : '',
      contextAfter: endA + 1 < a.length ? clip(a[endA + 1], PREVIEW_CONTEXT) : '',
    }],
  };
};

module.exports = { applyNoteEdits, previewRewrite, contentHash };
