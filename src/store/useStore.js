import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'

const useStore = create(
  persist(
    devtools(
      (set, get) => ({
        // 主题相关状态
        theme: 'light',
        primaryColor: '#1976d2',
        
        // 笔记相关状态
        notes: [],
        selectedNoteId: null,
        searchQuery: '',
        
        // UI 相关状态
        isLoading: false,
        sidebarOpen: true,
        currentView: 'notes', // 当前选中的视图：notes, todo, calendar, files, profile, settings
        userAvatar: '', // 用户头像
        
        // 主题相关 actions
        toggleTheme: () => set((state) => ({
          theme: state.theme === 'light' ? 'dark' : 'light'
        })),
        
        setTheme: (theme) => set({ theme }),
        
        setPrimaryColor: (color) => set({ primaryColor: color }),
        
        // 笔记相关 actions
        loadNotes: async (options = {}) => {
          set({ isLoading: true })
          try {
            if (window.electronAPI?.notes) {
              let notes
              if (options.deleted) {
                // 获取回收站中的笔记
                const result = await window.electronAPI.notes.getDeleted()
                const payload = result?.success ? result.data : null
                notes = payload ? (payload.notes || []) : []
              } else {
                // 获取正常笔记
                const result = await window.electronAPI.notes.getAll(options)
                const payload = result?.success ? result.data : null
                notes = payload ? (payload.notes || []) : []
              }
              // 使用tagUtils规范化标签
              const { normalizeTags } = await import('../utils/tagUtils.js');
              const normalized = (notes || []).map(n => ({
                ...n,
                tags: normalizeTags(n.tags)
              }))
              set({ notes: normalized, isLoading: false })
            } else {
              console.warn('Electron API not available')
              set({ isLoading: false })
            }
          } catch (error) {
            console.error('Failed to load notes:', error)
            set({ isLoading: false })
          }
        },
        
        createNote: async (noteData) => {
          try {
            if (window.electronAPI?.notes) {
              const result = await window.electronAPI.notes.create(noteData)
              if (result?.success && result.data) {
                const { normalizeTags } = await import('../utils/tagUtils.js');
                const newNote = {
                  ...result.data,
                  tags: normalizeTags(result.data.tags)
                }
                set((state) => ({
                  notes: [newNote, ...state.notes],
                  selectedNoteId: newNote.id
                }))
                return { success: true, data: newNote }
              }
            }
            return { success: false, error: 'Failed to create note' }
          } catch (error) {
            console.error('Failed to create note:', error)
            return { success: false, error: error.message }
          }
        },
        
        updateNote: async (id, updates) => {
          try {
            if (window.electronAPI?.notes) {
              const result = await window.electronAPI.notes.update(id, updates)
              if (result?.success && result.data) {
                const updatedNote = {
                  ...result.data,
                  tags: Array.isArray(result.data.tags)
                    ? result.data.tags
                    : (typeof result.data.tags === 'string' && result.data.tags.trim())
                      ? result.data.tags.split(',')
                      : []
                }
                set((state) => ({
                  notes: state.notes.map(note =>
                    note.id === id ? updatedNote : note
                  )
                }))
                return { success: true, data: updatedNote }
              }
            }
            return { success: false, error: 'Failed to update note' }
          } catch (error) {
            console.error('Failed to update note:', error)
            return { success: false, error: error.message }
          }
        },
        
        deleteNote: async (id) => {
          try {
            if (window.electronAPI?.notes) {
              const result = await window.electronAPI.notes.delete(id)
              if (result?.success) {
                set((state) => ({
                  notes: state.notes.filter(note => note.id !== id),
                  selectedNoteId: state.selectedNoteId === id ? null : state.selectedNoteId
                }))
                return { success: true }
              }
            }
            return { success: false, error: 'Failed to delete note' }
          } catch (error) {
            console.error('Failed to delete note:', error)
            return { success: false, error: error.message }
          }
        },
        
        restoreNote: async (id) => {
          try {
            if (window.electronAPI?.notes) {
              const result = await window.electronAPI.notes.restore(id)
              if (result?.success) {
                // 重新加载笔记列表
                get().loadNotes()
                return { success: true }
              }
            }
            return { success: false, error: 'Failed to restore note' }
          } catch (error) {
            console.error('Failed to restore note:', error)
            return { success: false, error: error.message }
          }
        },
        
        permanentDeleteNote: async (id) => {
          try {
            if (window.electronAPI?.notes) {
              const result = await window.electronAPI.notes.permanentDelete(id)
              if (result?.success) {
                set((state) => ({
                  notes: state.notes.filter(note => note.id !== id),
                  selectedNoteId: state.selectedNoteId === id ? null : state.selectedNoteId
                }))
                return { success: true }
              }
            }
            return { success: false, error: 'Failed to permanently delete note' }
          } catch (error) {
            console.error('Failed to permanently delete note:', error)
            return { success: false, error: error.message }
          }
        },
        
        setSelectedNoteId: (id) => set({ selectedNoteId: id }),
        
        // 批量删除笔记
        batchDeleteNotes: async (ids) => {
          try {
            if (window.electronAPI?.notes) {
              const result = await window.electronAPI.notes.batchDelete(ids)
              if (result?.success) {
                set((state) => ({
                  notes: state.notes.filter(note => !ids.includes(note.id)),
                  selectedNoteId: ids.includes(state.selectedNoteId) ? null : state.selectedNoteId
                }))
                return { success: true }
              }
            }
            return { success: false, error: 'Failed to batch delete notes' }
          } catch (error) {
            console.error('Failed to batch delete notes:', error)
            return { success: false, error: error.message }
          }
        },

        // 批量恢复笔记
        batchRestoreNotes: async (ids) => {
          try {
            if (window.electronAPI?.notes) {
              const result = await window.electronAPI.notes.batchRestore(ids)
              if (result?.success) {
                // 重新加载笔记列表
                get().loadNotes()
                return { success: true }
              }
            }
            return { success: false, error: 'Failed to batch restore notes' }
          } catch (error) {
            console.error('Failed to batch restore notes:', error)
            return { success: false, error: error.message }
          }
        },

        // 批量永久删除笔记
        batchPermanentDeleteNotes: async (ids) => {
          try {
            if (window.electronAPI?.notes) {
              const result = await window.electronAPI.notes.batchPermanentDelete(ids)
              if (result?.success) {
                set((state) => ({
                  notes: state.notes.filter(note => !ids.includes(note.id)),
                  selectedNoteId: ids.includes(state.selectedNoteId) ? null : state.selectedNoteId
                }))
                return { success: true }
              }
            }
            return { success: false, error: 'Failed to batch permanent delete notes' }
          } catch (error) {
            console.error('Failed to batch permanent delete notes:', error)
            return { success: false, error: error.message }
          }
        },

        // 批量删除待办事项
        batchDeleteTodos: async (ids) => {
          try {
            if (window.electronAPI?.todos) {
              const result = await window.electronAPI.todos.batchDelete(ids)
              if (result?.success) {
                return { success: true }
              }
            }
            return { success: false, error: 'Failed to batch delete todos' }
          } catch (error) {
            console.error('Failed to batch delete todos:', error)
            return { success: false, error: error.message }
          }
        },

        // 批量完成待办事项
        batchCompleteTodos: async (ids) => {
          try {
            if (window.electronAPI?.todos) {
              const result = await window.electronAPI.todos.batchComplete(ids)
              if (result?.success) {
                return { success: true }
              }
            }
            return { success: false, error: 'Failed to batch complete todos' }
          } catch (error) {
            console.error('Failed to batch complete todos:', error)
            return { success: false, error: error.message }
          }
        },
        
        setSearchQuery: (query) => set({ searchQuery: query }),
        
        // 搜索笔记 - 使用通用搜索API
        searchNotes: async (query) => {
          try {
            const { searchNotesAPI } = await import('../api/searchAPI')
            const result = await searchNotesAPI(query)
            
            if (result?.success) {
              set({ notes: result.data, searchQuery: query })
              return result
            }
            
            return result
          } catch (error) {
            console.error('Failed to search notes:', error)
            return { success: false, error: error.message }
          }
        },
        
        // 切换笔记置顶状态
        togglePinNote: async (id) => {
          try {
            if (window.electronAPI?.notes) {
              const result = await window.electronAPI.notes.togglePin(id)
              if (result?.success && result.data) {
                const updatedNote = {
                  ...result.data,
                  tags: Array.isArray(result.data.tags)
                    ? result.data.tags
                    : (typeof result.data.tags === 'string' && result.data.tags.trim())
                      ? result.data.tags.split(',')
                      : []
                }
                set((state) => ({
                  notes: state.notes.map(note =>
                    note.id === id ? updatedNote : note
                  )
                }))
                return { success: true, data: updatedNote }
              }
            }
            return { success: false, error: 'Failed to toggle pin note' }
          } catch (error) {
            console.error('Failed to toggle pin note:', error)
            return { success: false, error: error.message }
          }
        },
        
        // UI 相关 actions
        setLoading: (loading) => set({ isLoading: loading }),
        
        toggleSidebar: () => set((state) => ({
          sidebarOpen: !state.sidebarOpen
        })),
        
        setCurrentView: (view) => set({ currentView: view }),
        
        // 用户头像相关 actions
        setUserAvatar: (avatar) => set({ userAvatar: avatar }),
        
        // 初始化设置
        initializeSettings: async () => {
          try {
            if (window.electronAPI?.settings) {
              const result = await window.electronAPI.settings.getAll()
              if (result?.success && result.data) {
                const settings = result.data
                if (settings.theme) {
                  set({ theme: settings.theme })
                }
                if (settings.customThemeColor) {
                  set({ primaryColor: settings.customThemeColor })
                }
                if (settings.userAvatar) {
                  set({ userAvatar: settings.userAvatar })
                }
              }
            }
          } catch (error) {
            console.error('Failed to load settings:', error)
          }
        },

        // 标签相关 actions
        getAllTags: async () => {
          try {
            if (window.electronAPI?.tags) {
              const result = await window.electronAPI.tags.getAll()
              if (result?.success) {
                return result.data || []
              }
            }
            return []
          } catch (error) {
            console.error('Failed to get all tags:', error)
            return []
          }
        },

        // 批量设置标签
        batchSetTags: async (noteIds, tags, replaceMode = false) => {
          try {
            if (window.electronAPI?.notes && noteIds.length > 0) {
              const result = await window.electronAPI.notes.batchSetTags({
                noteIds,
                tags,
                replaceMode
              })
              
              if (result?.success) {
                // 重新加载笔记以更新UI
                const { loadNotes } = get()
                await loadNotes()
                return { success: true, data: result.data }
              }
              
              return { success: false, error: result?.error || '批量设置标签失败' }
            }
            return { success: false, error: '无效的参数' }
          } catch (error) {
            console.error('Failed to batch set tags:', error)
            return { success: false, error: error.message }
          }
        }
      }),
      {
        name: 'flashnote-store'
      }
    ),
    {
      name: 'flashnote-theme-settings',
      partialize: (state) => ({
        theme: state.theme,
        primaryColor: state.primaryColor
      })
    }
  )
)

export { useStore }