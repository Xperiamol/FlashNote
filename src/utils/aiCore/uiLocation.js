// 用户当前所在位置：AI 只在用户确实打开着某篇笔记时才把它当作“当前笔记”。
// selectedNoteId 是“最后选中的笔记”，切到待办、日历等页面后仍保留，不能直接当成当前笔记。

const VIEW_LABELS = {
  notes: '笔记',
  todo: '待办',
  calendar: '日历',
  timeline: '时间线',
  ai: 'AI 助手',
  settings: '设置',
  plugins: '插件',
  profile: '个人资料',
  graph: '关系图',
}

/** 主窗口里正在显示的笔记；不在笔记页或正在看回收站时为 null */
export const getVisibleNoteId = (state) => (
  state.currentView === 'notes' && !state.noteTrashOpen ? state.selectedNoteId ?? null : null
)

/** @returns {{ view: string, label: string, noteId: string|null }} */
export const getUiLocation = (state) => {
  const noteId = getVisibleNoteId(state)
  return {
    view: state.currentView || 'notes',
    label: state.noteTrashOpen && state.currentView === 'notes' ? '回收站' : (VIEW_LABELS[state.currentView] || state.currentView || '笔记'),
    noteId: noteId == null ? null : String(noteId),
  }
}

/** 独立笔记窗口：窗口里只有这一篇笔记 */
export const noteWindowLocation = (noteId) => ({ view: 'note-window', label: '独立笔记窗口', noteId: noteId == null ? null : String(noteId) })

/** 给上下文包加上位置；注入的笔记不是用户正在看的那篇时标记 visible=false */
export const applyLocation = (contextPackage, location) => {
  if (!location) return contextPackage
  contextPackage.location = { view: location.view, label: location.label, noteOpen: location.noteId != null }
  if (contextPackage.currentNote) contextPackage.currentNote.visible = String(contextPackage.currentNote.id) === String(location.noteId)
  return contextPackage
}
