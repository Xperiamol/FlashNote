import { create } from 'zustand'

/**
 * 独立窗口状态管理
 * 为独立窗口提供独立的状态管理，避免与主应用状态冲突
 */
export const useStandaloneStore = create((set, get) => ({
  // 窗口类型和数据
  windowType: null,
  windowData: null,
  
  // 笔记相关状态
  selectedNoteId: null,
  notes: [],
  
  // Todo相关状态
  todos: [],
  
  // 主题模式
  themeMode: 'light',
  
  // 设置窗口类型和数据
  setWindowConfig: (type, data) => set({ 
    windowType: type, 
    windowData: data,
    selectedNoteId: type === 'note' ? data?.noteId : null
  }),
  
  // 设置选中的笔记ID
  setSelectedNoteId: (noteId) => set({ selectedNoteId: noteId }),
  
  // 加载笔记
  loadNote: async (noteId) => {
    try {
      if (!window.electronAPI) return null
      
      const response = await window.electronAPI.notes.getById(noteId)
      if (response.success && response.data) {
        const noteRaw = response.data
        // 规范化标签以与主应用保持一致
        let normalizedTags = []
        try {
          const { normalizeTags } = await import('../utils/tagUtils.js')
          normalizedTags = normalizeTags(noteRaw.tags)
        } catch (e) {
          normalizedTags = Array.isArray(noteRaw.tags)
            ? noteRaw.tags
            : (typeof noteRaw.tags === 'string' && noteRaw.tags.trim())
              ? noteRaw.tags.split(',').map(t => t.trim()).filter(Boolean)
              : []
        }
        const note = { ...noteRaw, tags: normalizedTags }
        set({
          notes: [note], // 独立窗口只需要当前笔记
          selectedNoteId: note.id // 使用返回的真实ID
        })
        return note
      }
      return null
    } catch (error) {
      console.error('加载笔记失败:', error)
      return null
    }
  },
  
  // 更新笔记
  updateNote: async (noteId, updates) => {
    try {
      if (!window.electronAPI) return false
      
      const result = await window.electronAPI.notes.update(noteId, updates)
      if (result?.success && result.data) {
        const noteRaw = result.data
        // 规范化标签
        let normalizedTags = []
        try {
          const { normalizeTags } = await import('../utils/tagUtils.js')
          normalizedTags = normalizeTags(noteRaw.tags)
        } catch (e) {
          normalizedTags = Array.isArray(noteRaw.tags)
            ? noteRaw.tags
            : (typeof noteRaw.tags === 'string' && noteRaw.tags.trim())
              ? noteRaw.tags.split(',').map(t => t.trim()).filter(Boolean)
              : []
        }
        const updatedNote = { ...noteRaw, tags: normalizedTags }
        set(state => ({
          notes: state.notes.map(note => 
            note.id === updatedNote.id ? updatedNote : note
          )
        }))
        return true
      }
      
      // 无返回数据时，兜底本地合并
      set(state => ({
        notes: state.notes.map(note => 
          note.id === noteId ? { ...note, ...updates } : note
        )
      }))
      return !!result?.success
    } catch (error) {
      console.error('更新笔记失败:', error)
      return false
    }
  },
  
  // 自动保存笔记
  autoSaveNote: async (noteId, updates) => {
    return get().updateNote(noteId, updates)
  },
  
  // 切换笔记置顶状态
  togglePinNote: async (noteId) => {
    try {
      if (!window.electronAPI) return false
      
      const response = await window.electronAPI.notes.togglePin(noteId)
      if (response?.success) {
        if (response.data) {
          const noteRaw = response.data
          let normalizedTags = []
          try {
            const { normalizeTags } = await import('../utils/tagUtils.js')
            normalizedTags = normalizeTags(noteRaw.tags)
          } catch (e) {
            normalizedTags = Array.isArray(noteRaw.tags)
              ? noteRaw.tags
              : (typeof noteRaw.tags === 'string' && noteRaw.tags.trim())
                ? noteRaw.tags.split(',').map(t => t.trim()).filter(Boolean)
                : []
          }
          const updatedNote = { ...noteRaw, tags: normalizedTags }
          set(state => ({
            notes: state.notes.map(note => 
              note.id === updatedNote.id ? updatedNote : note
            )
          }))
        } else {
          // 没有返回数据，直接翻转is_pinned
          set(state => ({
            notes: state.notes.map(note => 
              note.id === noteId ? { ...note, is_pinned: !note.is_pinned } : note
            )
          }))
        }
        return true
      }
      return false
    } catch (error) {
      console.error('切换笔记置顶状态失败:', error)
      return false
    }
  },
  
  // 外部IPC推送的笔记更新（用于与主窗口同步）
  applyIncomingNoteUpdate: async (incoming) => {
    try {
      if (!incoming || typeof incoming !== 'object') return
      const state = get()
      if (state.selectedNoteId !== incoming.id) return
      
      // 规范化标签
      let normalizedTags = []
      try {
        const { normalizeTags } = await import('../utils/tagUtils.js')
        normalizedTags = normalizeTags(incoming.tags)
      } catch (e) {
        normalizedTags = Array.isArray(incoming.tags)
          ? incoming.tags
          : (typeof incoming.tags === 'string' && incoming.tags.trim())
            ? incoming.tags.split(',').map(t => t.trim()).filter(Boolean)
            : []
      }
      const merged = { ...incoming, tags: normalizedTags }
      set(state => ({
        notes: state.notes.map(n => n.id === merged.id ? merged : n)
      }))
    } catch (e) {
      console.error('应用外部笔记更新失败:', e)
    }
  },
  
  // 设置主题模式
  setThemeMode: (mode) => set({ themeMode: mode }),
  
  // 重置状态
  reset: () => set({
    windowType: null,
    windowData: null,
    selectedNoteId: null,
    notes: [],
    todos: []
  })
}))

export default useStandaloneStore