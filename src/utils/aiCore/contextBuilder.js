import { buildContextPackageFromNotes } from '../aiContextUtils'
import { toListResult } from '../todoDisplayUtils'
import { applyLocation } from './uiLocation'

// 各入口的上下文 profile：决定注入哪几类上下文 + 后端按 scene 召回长期记忆。
// memories 的取数已下沉到后端 memoryContext.js，前端不再自己调 mem0.search。
export const CONTEXT_PROFILES = {
  chat_panel: { scene: 'chat_panel', currentNote: true, relatedNotes: true, todos: true, memories: true },
  floating_panel: { scene: 'floating_panel', currentNote: true, relatedNotes: false, todos: false, memories: true },
  selection_panel: { scene: 'selection_panel', currentNote: true, relatedNotes: true, todos: true, memories: true },
}

const fetchTodos = async () => {
  try {
    const result = await window.electronAPI?.todos?.getAll?.({ includeCompleted: false, limit: 100 })
    return toListResult(result)
  } catch (_) {
    return []
  }
}

// 统一上下文装配：按 contextEnabled 拉取待办并产出 contextPackage；
// memories 由后端按 scene 召回，前端只负责把 query 透传过去。
// location：用户当前所在页面（uiLocation.js）。注入的笔记不是用户正在看的那篇时要标明，避免 AI 误称“当前打开的笔记”。
export const buildContext = async ({ notes = [], selectedNoteId, query = '', contextEnabled, location = null }) => {
  const todos = contextEnabled.todos ? await fetchTodos() : []
  return applyLocation(buildContextPackageFromNotes({ notes, todos, memories: [], selectedNoteId, query, contextEnabled }), location)
}
