export const generationGallery = {
  title: '把想法变成清晰的行动',
  layout: { type: 'stack.v', w: 1020, gap: 32 },
  children: [
    { type: 'text', props: { content: 'DESIGN SYSTEM  /  2026', level: 'caption', color: '#64748b' } },
    { type: 'canvas', props: { w: 1020 }, children: [
      { type: 'text', props: { x: 0, y: 0, w: 440, content: '更少噪音。\n更多重点。', fontSize: 54, color: '#172033' } },
      { type: 'group', props: { x: 520, y: 0, w: 500, title: '本周关注', bg: '#eef2ff' }, children: [
        { type: 'card', props: { title: '01  建立清晰的信息层级', body: '保留必要内容，让标题、说明和操作各有位置。', tone: 'primary' } },
        { type: 'card', props: { title: '02  为真实内容留出空间', body: '中文长标题、数据与表格，都应该自然适应布局。' } },
      ] },
    ] },
    { type: 'stack.h', props: { gap: 24 }, children: [
      { type: 'card', props: { w: 324, title: '可靠', body: '失败保留草稿，通过检查后再保存。', tone: 'success' } },
      { type: 'card', props: { w: 324, title: '灵活', body: '可编辑的内容，也可以有自由的构图。', tone: 'accent' } },
      { type: 'card', props: { w: 324, title: '克制', body: '细边框、充足留白和清楚的文字对比。', tone: 'warning' } },
    ] },
    { type: 'table', props: { headers: ['阶段', '验收标准', '状态'], rows: [
      ['构图', '元素对齐，层级清楚；正文完整显示，不遮挡、不越界。', '进行中'],
      ['交互', '停止后不落盘；局部修改保留原有图片、元素和关联。', '已验证'],
    ] } },
  ],
}
