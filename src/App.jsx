import React, { useEffect, useState } from 'react'
import {
  ThemeProvider,
  CssBaseline,
  Box,
  AppBar,
  useMediaQuery,
  Typography
} from '@mui/material'
import {
  Restore as RestoreIcon,
  DeleteForever as DeleteForeverIcon,
  CheckCircle as CheckCircleIcon
} from '@mui/icons-material'
import { useStore } from './store/useStore'
import { createAppTheme } from './styles/theme'
import Toolbar from './components/Toolbar'
import NoteList from './components/NoteList'
import NoteEditor from './components/NoteEditor'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import TodoView from './components/TodoView'
import CalendarView from './components/CalendarView'
import Settings from './components/Settings'
import SecondarySidebar from './components/SecondarySidebar'
import MultiSelectToolbar from './components/MultiSelectToolbar'
import TagSelectionDialog from './components/TagSelectionDialog'
import DragAnimationProvider from './components/DragAnimationProvider'

function App() {
  const { theme, primaryColor, loadNotes, currentView, initializeSettings, setCurrentView, createNote, batchDeleteNotes, batchDeleteTodos, batchCompleteTodos, batchRestoreNotes, batchPermanentDeleteNotes, getAllTags, batchSetTags } = useStore()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [secondarySidebarOpen, setSecondarySidebarOpen] = useState(true)
  const [showDeleted, setShowDeleted] = useState(false)
  
  // TODO视图相关状态
  const [todoViewMode, setTodoViewMode] = useState('quadrant')
  const [todoShowCompleted, setTodoShowCompleted] = useState(false)
  const [selectedTodo, setSelectedTodo] = useState(null)
  const [showTodoCreateForm, setShowTodoCreateForm] = useState(false)
  const [todoSortBy, setTodoSortBy] = useState('priority')
  
  // 多选状态管理
  const [multiSelectState, setMultiSelectState] = useState({
    isActive: false,
    selectedIds: [],
    selectedCount: 0,
    totalCount: 0,
    itemType: ''
  })
  
  // 存储当前多选实例的引用
  const [currentMultiSelectRef, setCurrentMultiSelectRef] = useState(null)
  
  // 待办事项刷新触发器
  const [todoRefreshTrigger, setTodoRefreshTrigger] = useState(0)
  
  // 永久删除确认状态
  const [permanentDeleteConfirm, setPermanentDeleteConfirm] = useState(false)
  const [todoPermanentDeleteConfirm, setTodoPermanentDeleteConfirm] = useState(false)
  
  // 标签选择对话框状态
  const [tagSelectionDialogOpen, setTagSelectionDialogOpen] = useState(false)
  const [selectedNotesForTagging, setSelectedNotesForTagging] = useState([])
  
  const appTheme = createAppTheme(theme, primaryColor)
  const isMobile = useMediaQuery(appTheme.breakpoints.down('md'))

  // 监听视图切换，自动退出多选模式
  useEffect(() => {
    if (currentMultiSelectRef && currentMultiSelectRef.isMultiSelectMode) {
      currentMultiSelectRef.exitMultiSelectMode();
    }
  }, [currentView]);

  // 处理批量设置标签
  const handleBatchSetTags = async () => {
    if (multiSelectState.selectedIds.length === 0) return;
    
    setSelectedNotesForTagging(multiSelectState.selectedIds);
    setTagSelectionDialogOpen(true);
  };

  // 确认批量设置标签
  const handleConfirmBatchSetTags = async ({ tags, replaceMode, noteIds }) => {
    try {
      const result = await batchSetTags(noteIds, tags, replaceMode);
      if (result.success) {
        console.log(`成功为 ${noteIds.length} 个笔记设置标签`);
        // 退出多选模式
        if (currentMultiSelectRef) {
          currentMultiSelectRef.exitMultiSelectMode();
        }
      } else {
        console.error('批量设置标签失败:', result.error);
      }
    } catch (error) {
      console.error('批量设置标签失败:', error);
    }
  };

  useEffect(() => {
    // 测试 Electron API 连接
    const testElectronAPI = async () => {
      try {
        if (window.electronAPI) {
          const version = await window.electronAPI.getVersion()
          const message = await window.electronAPI.helloWorld()
          console.log('App Version:', version)
          console.log('Hello World:', message)
        }
      } catch (error) {
        console.error('Electron API 测试失败:', error)
      }
    }

    testElectronAPI()
    
    // 初始化设置
    initializeSettings()
    
    // 加载笔记数据
    loadNotes()
    
    // 监听来自托盘菜单的事件
    const handleTrayEvents = () => {
      if (window.electronAPI && window.electronAPI.ipcRenderer) {
        // 监听创建新笔记事件
        window.electronAPI.ipcRenderer.on('create-new-note', async () => {
          try {
            await createNote()
            setCurrentView('notes')
          } catch (error) {
            console.error('创建笔记失败:', error)
          }
        })
        
        // 监听创建新待办事件
        window.electronAPI.ipcRenderer.on('create-new-todo', () => {
          setCurrentView('todo')
          setShowTodoCreateForm(true)
        })
        
        // 监听打开设置事件
        window.electronAPI.ipcRenderer.on('open-settings', () => {
          setCurrentView('settings')
        })
        
        // 监听快速输入事件
        window.electronAPI.ipcRenderer.on('quick-input', () => {
          // 切换到笔记视图并创建新笔记
          setCurrentView('notes')
          createNote()
        })
      }
    }
    
    handleTrayEvents()
    
    // 清理事件监听器
    return () => {
      if (window.electronAPI && window.electronAPI.ipcRenderer) {
        window.electronAPI.ipcRenderer.removeAllListeners('create-new-note')
        window.electronAPI.ipcRenderer.removeAllListeners('create-new-todo')
        window.electronAPI.ipcRenderer.removeAllListeners('open-settings')
        window.electronAPI.ipcRenderer.removeAllListeners('quick-input')
      }
    }
  }, []) // 移除 loadNotes 依赖，避免无限循环

  // 在移动端自动隐藏侧边栏
  useEffect(() => {
    if (isMobile) {
      setSidebarOpen(false)
    }
  }, [isMobile])

  return (
    <ThemeProvider theme={appTheme}>
      <CssBaseline />
      <DragAnimationProvider>
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        {/* 自定义标题栏 */}
        <TitleBar />
        
        {/* 主应用区域 */}
        <Box sx={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {/* 主侧边栏 */}
          <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
          
          {/* 工具栏和内容区域 */}
          <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            {/* 顶部工具栏 */}
            <AppBar
              position="static"
              sx={{
                backgroundColor: 'background.paper',
                color: 'text.primary',
                boxShadow: 1
              }}
            >
              <Toolbar
              onToggleSidebar={() => setSecondarySidebarOpen(!secondarySidebarOpen)}
              sidebarOpen={secondarySidebarOpen}
              showDeleted={showDeleted}
              onToggleDeleted={() => {
                const newShowDeleted = !showDeleted;
                setShowDeleted(newShowDeleted);
                // 根据新的状态重新加载笔记
                loadNotes(newShowDeleted ? { deleted: true } : {});
              }}
              currentView={currentView}
              todoViewMode={todoViewMode}
              onTodoViewModeChange={setTodoViewMode}
              todoShowCompleted={todoShowCompleted}
              onTodoShowCompletedChange={setTodoShowCompleted}
              onCreateTodo={() => setShowTodoCreateForm(true)}
              todoSortBy={todoSortBy}
              onTodoSortByChange={setTodoSortBy}
            />
            </AppBar>

            {/* 多选工具栏 */}
            {multiSelectState.isActive && (
              <MultiSelectToolbar
                visible={multiSelectState.isActive}
                selectedCount={multiSelectState.selectedCount}
                totalCount={multiSelectState.totalCount}
                itemType={multiSelectState.itemType}
                onSelectAll={() => {
                  if (currentMultiSelectRef) {
                    currentMultiSelectRef.selectAll();
                  }
                }}
                onSelectNone={() => {
                  if (currentMultiSelectRef) {
                    currentMultiSelectRef.selectNone();
                  }
                }}
                onDelete={showDeleted || multiSelectState.itemType !== '笔记' ? undefined : async () => {
                  if (multiSelectState.selectedIds.length === 0) return;
                  
                  try {
                    if (multiSelectState.itemType === '笔记') {
                      const result = await batchDeleteNotes(multiSelectState.selectedIds);
                      if (result.success) {
                        console.log(`成功删除 ${multiSelectState.selectedIds.length} 个笔记`);
                      } else {
                        console.error('批量删除笔记失败:', result.error);
                      }
                    } else if (multiSelectState.itemType === '待办事项') {
                      const result = await batchDeleteTodos(multiSelectState.selectedIds);
                      if (result.success) {
                        console.log(`成功删除 ${multiSelectState.selectedIds.length} 个待办事项`);
                        // 触发待办事项列表刷新
                        setTodoRefreshTrigger(prev => prev + 1);
                      } else {
                        console.error('批量删除待办事项失败:', result.error);
                      }
                    }
                  } catch (error) {
                    console.error('批量删除失败:', error);
                  } finally {
                    // 无论成功失败都退出多选模式
                    if (currentMultiSelectRef) {
                      currentMultiSelectRef.exitMultiSelectMode();
                    }
                  }
                }}
                onSetTags={showDeleted || multiSelectState.itemType !== '笔记' ? undefined : handleBatchSetTags}
                onClose={() => {
                  if (currentMultiSelectRef) {
                    currentMultiSelectRef.exitMultiSelectMode();
                  }
                }}
                customActions={
                  showDeleted && multiSelectState.itemType === '笔记' ? [
                    {
                      label: '批量恢复',
                      icon: <RestoreIcon />,
                      onClick: async () => {
                        if (multiSelectState.selectedIds.length === 0) return;
                        
                        try {
                          const result = await batchRestoreNotes(multiSelectState.selectedIds);
                          if (result.success) {
                            console.log(`成功恢复 ${multiSelectState.selectedIds.length} 个笔记`);
                          } else {
                            console.error('批量恢复笔记失败:', result.error);
                          }
                        } catch (error) {
                          console.error('批量恢复失败:', error);
                        } finally {
                          if (currentMultiSelectRef) {
                            currentMultiSelectRef.exitMultiSelectMode();
                          }
                        }
                      },
                      color: 'primary'
                    },
                    {
                      label: permanentDeleteConfirm ? '确认删除' : '永久删除',
                      icon: <DeleteForeverIcon />,
                      onClick: async () => {
                        if (multiSelectState.selectedIds.length === 0) return;
                        
                        if (!permanentDeleteConfirm) {
                          // 第一次点击，设置确认状态
                          setPermanentDeleteConfirm(true);
                          // 3秒后自动重置状态
                          setTimeout(() => {
                            setPermanentDeleteConfirm(false);
                          }, 3000);
                        } else {
                          // 第二次点击，执行删除
                          try {
                            const result = await batchPermanentDeleteNotes(multiSelectState.selectedIds);
                            if (result.success) {
                              console.log(`成功永久删除 ${multiSelectState.selectedIds.length} 个笔记`);
                            } else {
                              console.error('批量永久删除笔记失败:', result.error);
                            }
                          } catch (error) {
                            console.error('批量永久删除失败:', error);
                          } finally {
                            setPermanentDeleteConfirm(false);
                            if (currentMultiSelectRef) {
                              currentMultiSelectRef.exitMultiSelectMode();
                            }
                          }
                        }
                      },
                      color: permanentDeleteConfirm ? 'error' : 'inherit',
                      sx: permanentDeleteConfirm ? {
                        backgroundColor: 'error.main',
                        color: 'error.contrastText',
                        '&:hover': {
                          backgroundColor: 'error.dark'
                        }
                      } : {}
                    }
                  ] : multiSelectState.itemType === '待办事项' ? [
                    {
                      label: '设为完成',
                      icon: <CheckCircleIcon />,
                      onClick: async () => {
                        if (multiSelectState.selectedIds.length === 0) return;
                        
                        try {
                          const result = await batchCompleteTodos(multiSelectState.selectedIds);
                          if (result.success) {
                            console.log(`成功完成 ${multiSelectState.selectedIds.length} 个待办事项`);
                            // 触发待办事项列表刷新
                            setTodoRefreshTrigger(prev => prev + 1);
                          } else {
                            console.error('批量完成待办事项失败:', result.error);
                          }
                        } catch (error) {
                          console.error('批量完成失败:', error);
                        } finally {
                          if (currentMultiSelectRef) {
                            currentMultiSelectRef.exitMultiSelectMode();
                          }
                        }
                      },
                      color: 'success'
                    },
                    {
                      label: todoPermanentDeleteConfirm ? '确认删除' : '永久删除',
                      icon: <DeleteForeverIcon />,
                      onClick: async () => {
                        if (multiSelectState.selectedIds.length === 0) return;
                        
                        if (!todoPermanentDeleteConfirm) {
                          // 第一次点击，设置确认状态
                          setTodoPermanentDeleteConfirm(true);
                          // 3秒后自动重置状态
                          setTimeout(() => {
                            setTodoPermanentDeleteConfirm(false);
                          }, 3000);
                        } else {
                          // 第二次点击，执行删除
                          try {
                            const result = await batchDeleteTodos(multiSelectState.selectedIds);
                            if (result.success) {
                              console.log(`成功永久删除 ${multiSelectState.selectedIds.length} 个待办事项`);
                              // 触发待办事项列表刷新
                              setTodoRefreshTrigger(prev => prev + 1);
                            } else {
                              console.error('批量删除待办事项失败:', result.error);
                            }
                          } catch (error) {
                            console.error('批量删除失败:', error);
                          } finally {
                            setTodoPermanentDeleteConfirm(false);
                            if (currentMultiSelectRef) {
                              currentMultiSelectRef.exitMultiSelectMode();
                            }
                          }
                        }
                      },
                      color: todoPermanentDeleteConfirm ? 'error' : 'inherit',
                      sx: todoPermanentDeleteConfirm ? {
                        backgroundColor: 'error.main',
                        color: 'error.contrastText',
                        '&:hover': {
                          backgroundColor: 'error.dark'
                        }
                      } : {}
                    }
                  ] : []
                }
              />
            )}

            {/* 内容区域 */}
            <Box sx={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
              {/* 二级侧边栏 - 始终渲染以支持动画 */}
              <SecondarySidebar 
                open={secondarySidebarOpen} 
                onClose={() => setSecondarySidebarOpen(false)}
                onTodoSelect={setSelectedTodo}
                onViewModeChange={setTodoViewMode}
                onShowCompletedChange={setTodoShowCompleted}
                viewMode={todoViewMode}
                showCompleted={todoShowCompleted}
                onMultiSelectChange={setMultiSelectState}
                onMultiSelectRefChange={setCurrentMultiSelectRef}
                todoRefreshTrigger={todoRefreshTrigger}
                todoSortBy={todoSortBy}
                onTodoSortByChange={setTodoSortBy}
                showDeleted={showDeleted}
              />
              
              {/* 主内容区域 */}
              <Box sx={{ flex: 1, overflow: 'hidden' }}>
                {currentView === 'notes' && <NoteEditor />}
                {currentView === 'todo' && (
              <TodoView 
                viewMode={todoViewMode}
                showCompleted={todoShowCompleted}
                onViewModeChange={setTodoViewMode}
                onShowCompletedChange={setTodoShowCompleted}
                showCreateForm={showTodoCreateForm}
                onCreateFormClose={() => setShowTodoCreateForm(false)}
                onRefresh={() => setTodoRefreshTrigger(prev => prev + 1)}
                selectedTodo={selectedTodo}
                onTodoSelect={setSelectedTodo}
              />
            )}
                {currentView === 'calendar' && <CalendarView />}
                {currentView === 'settings' && <Settings />}
                {currentView === 'files' && (
                  <Box sx={{ p: 3 }}>
                    <Typography variant="h4">文件管理</Typography>
                    <Typography variant="body1" sx={{ mt: 2 }}>文件管理功能开发中...</Typography>
                  </Box>
                )}
                {currentView === 'plugins' && (
                  <Box sx={{ p: 3 }}>
                    <Typography variant="h4">插件商店</Typography>
                    <Typography variant="body1" sx={{ mt: 2 }}>插件商店功能开发中...</Typography>
                  </Box>
                )}
                {currentView === 'vocabulary' && (
                  <Box sx={{ p: 3 }}>
                    <Typography variant="h4">单词本</Typography>
                    <Typography variant="body1" sx={{ mt: 2 }}>单词本功能开发中...</Typography>
                  </Box>
                )}
                {currentView === 'profile' && (
                  <Box sx={{ p: 3 }}>
                    <Typography variant="h4">个人资料</Typography>
                    <Typography variant="body1" sx={{ mt: 2 }}>个人资料功能开发中...</Typography>
                  </Box>
                )}
              </Box>
            </Box>
          </Box>
        </Box>
      </Box>
      
      {/* 标签选择对话框 */}
      <TagSelectionDialog
        open={tagSelectionDialogOpen}
        onClose={() => {
          setTagSelectionDialogOpen(false);
          setSelectedNotesForTagging([]);
        }}
        onConfirm={handleConfirmBatchSetTags}
        noteIds={selectedNotesForTagging}
        getAllTags={getAllTags}
      />      
      </DragAnimationProvider>
    </ThemeProvider>
  )
}

export default App