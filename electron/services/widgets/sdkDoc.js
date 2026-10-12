/**
 * 写给模型看的组件开发规范（生成、修改组件时放进系统提示词）。
 * 修改 SDK（runtime/sdk.js）时务必同步这里。
 */

const SDK_DOC = `
# Flota 组件开发规范

组件是运行在 Flota 笔记应用里的小应用。它可以记录和整理数据，也可以联网获取信息、定时提醒、导入导出文件、汇总其他组件和笔记待办的数据。
一个组件就是**一个完整的单文件 HTML**，内联全部 JS/CSS。

## 组件与实例
- 一个组件可以有多个**实例**，比如闪卡组件有「英语单词」「日语五十音」两个实例。
- **数据属于实例**：flota.data 读写的永远是当前实例的数据，不同实例互不影响。不要在代码里区分实例，也不要自己保存“当前是哪一组”。
- 同一个实例可以同时显示在多个地方（组件主页、笔记里、首页、桌面小窗），数据变化通过 subscribe 同步。
- 修改组件代码会作用于它的所有实例，因此数据结构必须保持兼容。

## 运行环境
- 组件运行在沙箱 iframe 中，**不能直接联网**：不能 fetch/XHR/WebSocket，不能加载任何外部 <script>/<link>/<img src="https://...">/字体。
  需要网络数据时用 flota.net.fetch（见下文），由宿主代为请求。
- 禁止使用 localStorage / sessionStorage / IndexedDB / cookie：数据必须用 flota.data 持久化，界面状态用 flota.state。
- 禁止 alert / confirm / prompt（沙箱里不可用）：改用 flota.ui.toast / flota.ui.confirm。
- 不能打开新窗口、不能提交表单跳转页面。
- 宿主已注入：基础样式（见下文）、SDK（全局对象 flota）、清单里声明的预置库。

## 组件清单（必须）
放在 <head> 最前面：
<script type="application/flota-widget">
{
  "name": "组件名称（简短）",
  "description": "一句话说明用途（显示在组件主页顶部）",
  "help": "使用说明（Markdown）：怎么用、各个按钮做什么、数据怎么组织。显示在组件主页的「帮助」里",
  "icon": "图标名（见下方列表）",
  "sizes": ["compact", "medium", "full"],
  "libs": ["preact"],
  "data": { "集合名": { "字段名": "text|number|boolean|date|json|ref:集合名" } },
  "imports": [],
  "permissions": [],
  "network": []
}
</script>
- icon 从这些名字里选一个最贴切的（界面用单色图标，不支持 emoji）：widget（通用）、cards（卡片/闪卡）、board（看板）、book（阅读）、habit（打卡/热力图）、hourglass（倒数）、drop（喝水）、chart（统计）、list（清单）、target（目标）、timer（计时/番茄钟）、star（收藏/评分）、heart（健康/心情）、wallet（记账）、fitness（运动）、leaf（植物/生活）、mood（情绪）、bookmark（书签/剪藏）、code（编程）、note（笔记）、check（待办）、calendar（日程）、tag（标签）、timeline（时间线）、graph（关系图）。
- libs 可选值：preact、dayjs、marked、ts-fsrs、sortablejs、chart.js。只声明真正用到的。
- permissions 可选值：notes:read、notes:write、todos:read、todos:write、ai:complete、net:fetch（联网）、notify（系统通知与定时提醒）、files（打开/保存文件对话框）、clipboard:write（写剪贴板）。只声明真正用到的，最小化。
- network：使用 net:fetch 时必填，列出要访问的域名，如 ["api.open-meteo.com", "*.github.com"]。只能 https，用户首次使用时会看到这些域名并决定是否允许。
  优先选择不需要密钥、可公开访问的接口（如 Open-Meteo 天气、汇率、RSS 转 JSON、GitHub 公共 API、维基百科）；需要密钥时让用户在组件设置里填写并存进 flota.data。
- imports：读取其他组件的数据时声明，格式 "组件id.集合名"（组件 id 见下方“用户已有的其他组件”），只读。没有就保持空数组。
- data：声明本组件用到的集合与字段，仅作说明，不做强校验。

## 三种尺寸（flota.env.size）
- compact：首页的卡片（用户也会叫它“主页面板/首页卡片”），高约 120–200px，最多约 320px。以查看为主：显示最关键的一两个数字或状态，
  可以放一两个高频的一键操作（如打卡、+1、标记完成），点了立即写入数据并刷新；不放表单、列表管理、设置这类编辑功能。
  用户明确要求在首页卡片上放某个功能时照做，但仍要保持紧凑。
- medium：嵌入在笔记正文中、或桌面小窗里，高度随内容（建议不超过 600px），显示主要功能。
- full：在组件主页中打开实例时使用，占满空间，可以包含完整的管理、编辑、统计功能。
根据 flota.env.size 渲染不同布局。根元素上也有 data-size 属性可用于 CSS：:root[data-size="compact"] ...

## SDK：全局对象 flota
所有方法返回 Promise。

### 数据（属于当前实例，自动跨设备同步）
const books = flota.data.collection('books');
await books.query({ where: { status: 'reading' }, orderBy: 'createdAt', desc: true, limit: 50, offset: 0 });
  // where 支持等值，也支持 { field: { gt, gte, lt, lte, ne, in: [...], contains: '文本' } }
  // orderBy 可用任意字段，或系统字段 '_createdAt' / '_updatedAt' / '_sortKey'
await books.get(id);
await books.insert({ title: '三体', status: 'todo' });        // 返回插入的记录；传数组则批量插入并返回数组
await books.update(id, { status: 'done' });                    // 合并更新；字段值传 null 表示删除该字段
await books.replace(id, { title: '新标题' });                  // 整条替换
await books.remove(id);
const unsubscribe = books.subscribe(() => reload());           // 数据变化（本组件、其他窗口、同步）时回调
- 记录形态：业务字段平铺，外加系统字段 _id、_createdAt、_updatedAt（毫秒时间戳）、_sortKey（字符串，可写，用于手动排序）。
- 写入时以下划线开头的字段除 _sortKey 外都会被忽略。
- 日期建议存 ISO 字符串（'2026-09-25'）或毫秒时间戳；对象会原样以 JSON 存储。

### 笔记与待办（需在 permissions 声明）
await flota.notes.list({ search: '关键词', tag: '标签', limit: 50, withContent: false });  // notes:read
await flota.notes.list({ source: 'clip', limit: 100 });        // notes:read，只列出从网页剪藏的笔记（按剪藏时间倒序）
  // 返回的笔记含 source 字段：剪藏笔记为 { type: 'clip', url, site, kind, clippedAt }，其他为 null；打开笔记用 flota.ui.openNote(note.syncId)
await flota.notes.get(id);                                     // notes:read，返回 { id, title, content, tags, ... }
await flota.notes.create({ title, content, tags: [] });        // notes:write
await flota.notes.update(id, { title, content });              // notes:write
await flota.todos.list({ filter: 'all' | 'pending' | 'completed' | 'today', tag, limit });  // todos:read
await flota.todos.create({ content, due_date: '2026-09-30', is_important: true });           // todos:write
await flota.todos.update(id, { is_completed: true });                                         // todos:write

### AI（需声明 ai:complete，每天有调用额度，只在用户主动点击时调用）
const text = await flota.ai.complete('提示词', { system: '可选的系统提示', json: false });
const obj = await flota.ai.complete('请输出 JSON ...', { json: true });  // json:true 时返回解析后的对象

### 联网（需声明 net:fetch 并在 network 中列出域名）
const res = await flota.net.fetch('https://api.open-meteo.com/v1/forecast?latitude=31.2&longitude=121.5&current=temperature_2m', {
  method: 'GET',              // GET / POST / PUT / PATCH / DELETE
  headers: {},                // 可选；不能设置 Cookie / Origin
  body: undefined,            // 可选；对象会自动转成 JSON
  responseType: 'auto',       // auto（按 Content-Type 解析 JSON）/ json / text / base64
});
// res = { ok, status, statusText, url, headers: { 'content-type', ... }, data }
- 首次联网前用户需要点“允许”；在此之前调用会失败（error.code === 'NETWORK_APPROVAL_REQUIRED'），用户允许后组件会自动重新加载。
- 只能访问 network 中声明的 https 域名；不能访问本机或局域网地址。响应最大 5MB，每分钟最多 120 次请求。
- 把拉取到的数据缓存到 flota.data（带上获取时间），界面先显示缓存再刷新；离线、失败、未授权时显示可读的提示和“重试”按钮，不能白屏。

### 通知与定时提醒（需声明 notify）
await flota.notify('该喝水了', '今天还差 3 杯');   // 立即发系统通知，每天最多 30 条
await flota.schedule.set({ id: 'morning', at: '2026-10-13T08:00:00+08:00', repeat: 'daily', title: '晨间复盘', body: '花 2 分钟看看今天的计划', data: { tab: 'today' } });
  // at：ISO 时间或毫秒时间戳；repeat：null（一次性）/ hourly / daily / weekly / monthly；同 id 再次 set 会替换
await flota.schedule.list();      // [{ id, at, repeat, title, body, data }]，at 为下次提醒的毫秒时间戳
await flota.schedule.remove('morning');
flota.on('schedule', (event) => {...});   // 提醒到点时，若组件正在显示会收到 { id, title, body, data }
- 提醒由 Flota 在后台负责：组件没打开、应用最小化时也会按时弹出，点击通知会打开这个组件。提醒只保存在本机。
- 让用户自己设置提醒时间和开关，并在界面上显示下一次提醒；不要在加载时无条件新建提醒。

### 文件（需声明 files，必须由用户点击触发）
const files = await flota.files.pick({ accept: ['.csv', '.json'], multiple: false, as: 'auto' });
  // 返回 [{ name, size, type, lastModified, text }]（文本类文件）或 { ..., base64 }（其他文件，as: 'base64' 可强制）；用户取消返回 []
await flota.files.save({ name: '账单-2026-10.csv', content: csvText });   // 弹出保存对话框；二进制内容传 base64 并设 encoding: 'base64'
  // 返回 { saved: true, name } 或 { saved: false }（用户取消）
- 单个文件最大 10MB。导入时先预览解析结果再写入数据，给出成功 / 跳过的条数。

### 剪贴板（需声明 clipboard:write）
await flota.clipboard.write('要复制的文字');

### 读取其他组件的数据（只读，需在 imports 中声明）
const instances = await flota.widgets.instances('w_xxx');           // [{ id, name, widgetName }]
const books = await flota.data.from(instances[0].id).collection('books').query({ limit: 100 });
flota.data.from(instanceId).collection('books').subscribe(reload);   // 其他组件数据变化时刷新
- 让用户选择要汇总哪个实例，把选择存进 flota.state。被引用的组件可能还没有实例或数据，要有空状态。

### 预览限制
生成后 Flota 会在预览中自动运行检查：预览里联网、通知、提醒、文件、剪贴板、AI、修改笔记待办都会失败（error.code === 'PREVIEW_ONLY'）。
这些调用必须用 try/catch 处理，失败时显示占位内容或提示，不能让界面崩溃或白屏。

### 界面与环境
await flota.ui.toast('已保存', { type: 'success' });  // type: info | success | warning | error
const ok = await flota.ui.confirm('确定删除吗？');
await flota.ui.openNote(noteId);
await flota.state.set('tab', 'stats');  const tab = await flota.state.get('tab');  // 本实例的界面状态
flota.env  // { instanceId, instanceName, size, surface, theme: 'light'|'dark', locale }
flota.on('env', (env) => {...});  // 主题等环境变化

## 预置库（在清单 libs 中声明后可直接使用全局变量）
- preact → 全局 htmPreact：const { html, render, useState, useEffect, useMemo, useRef, useCallback, useReducer } = htmPreact;
  用 html\`<div class="fl-card">\${x}</div>\` 写模板，组件写法：html\`<\${Comp} prop=\${v} />\`。事件用 onClick / onInput。推荐所有组件都用它。
- dayjs → 全局 dayjs
- marked → 全局 marked：marked.parse(markdown)
- ts-fsrs → 全局 FSRS：const { fsrs, createEmptyCard, Rating } = FSRS; const f = fsrs(); const { card } = f.next(oldCard, new Date(), Rating.Good);
  （存储卡片时 due/last_review 会被序列化成字符串，读取时要 new Date() 还原）
- sortablejs → 全局 Sortable：拖拽排序。与 Preact 一起用时，在 onEnd 里先把被拖动的 DOM 放回原处，再通过更新数据触发重新渲染。
- chart.js → 全局 Chart：new Chart(canvas, config)。组件卸载或重绘前要 chart.destroy()。颜色读取 CSS 变量。

## 基础样式（已注入，直接使用）
CSS 变量：--fl-primary、--fl-primary-soft、--fl-surface、--fl-surface-2、--fl-text、--fl-text-2、--fl-border、--fl-hover、
--fl-danger、--fl-success、--fl-warning、--fl-radius（12px）、--fl-radius-sm（8px）、--fl-shadow、--fl-font。
页面背景透明，会融入笔记；深色模式由宿主切换，**只要使用这些变量就自动适配深色模式**，不要写死颜色。
类名：
- .fl-card 卡片容器   .fl-title 标题   .fl-muted 次要文字   .fl-small 小字   .fl-empty 空状态
- .fl-btn 按钮  .fl-btn-primary 主按钮  .fl-btn-ghost 无边框按钮  .fl-btn-danger 危险按钮
- .fl-input / .fl-select / .fl-textarea 输入控件   .fl-chip 标签
- .fl-row 横向 flex（带间距）  .fl-col 纵向 flex  .fl-grow 占满剩余空间   .fl-divider 分割线

## 设计与交互质量
- 先根据用途在内部确定布局和信息层级，再写代码。不要所有需求都套“标题 + 一排渐变卡片”或看板、闪卡、打卡的现成样式。可采用编辑排版、数据工作台、时间线、画廊、分栏、地图式布局、仪表盘、对话流等合适构图。
- 用字号、字重、间距组织层级；一个主操作，一到两个强调色，装饰服务内容。图表使用真实数据，不编造统计数字。
- 自定义 CSS、SVG 插画、Canvas 绘图、渐变与适量动效均可使用，不依赖远程素材。遵守 prefers-reduced-motion。
- compact 宽约 320px，medium 约 480px，full 宽度可从 600 到 1200px 变化；使用容器查询或响应式 CSS，不根据一次读取的宽度硬编码。长中文、空数据、大数字都不得横向溢出。
- 所有显示为可点击的控件必须有真实行为；键盘可达，有可见 focus 状态；保存失败明确提示，不能显示虚假成功。
- 自动修复时原始需求仍然有效。保留外观和功能，不要通过删掉主体界面或屏蔽错误来通过检查。

## 硬性要求
1. 只输出一个完整的 HTML 文档，从 <!doctype html> 开始，到 </html> 结束，用 \`\`\`html 代码块包裹，代码块前后不要多余解释。
2. 界面文字用简体中文（除非用户要求其他语言）。用户没提风格时简洁、留白舒适，与 Flota 一致；用户要求美化或指定了风格（配色、质感、动效、插画感等）时
   充分发挥，可以自定义布局、渐变、阴影、动画，不必拘泥于基础类名。可以定义自己的语义配色、字体层级、布局网格与视觉风格；主题变量是默认值，不是唯一配色。自定义颜色时同时提供 :root[data-theme="dark"] 适配，确保正文对比度至少 4.5:1。
3. 有加载、空数据状态；操作后界面立即反映结果（用 subscribe 或在写入后重新查询）。
4. 不要在 console 打印调试信息；错误要捕获并用 flota.ui.toast 提示。
5. 修改已有组件时：保持已有的集合名与字段名不变（数据要能继续使用），除非用户明确要求；如果必须调整数据结构，
   在组件加载时编写兼容/迁移代码把旧记录转换成新结构。
6. 代码要能直接运行，不能有占位符或“此处省略”。
`.trim();

module.exports = { SDK_DOC };
