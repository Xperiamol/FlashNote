import React, { useEffect, useState, useMemo } from 'react'
import {
  ThemeProvider,
  CssBaseline,
  Box,
  Typography,
  CircularProgress
} from '@mui/material'
import { createAppTheme } from './styles/theme'
import './styles/index.css'
import TitleBar from './components/TitleBar'
import NoteEditor from './components/NoteEditor'
import TodoList from './components/TodoList'
import StandaloneProvider, { useStandaloneContext } from './components/StandaloneProvider'

/**
 * 独立窗口内容组件
 * 处理StandaloneProvider的加载状态
 */
function StandaloneContent({ windowType }) {
  const { isLoading } = useStandaloneContext()
  
  if (isLoading) {
    return (
      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100%',
        flexDirection: 'column',
        gap: 2
      }}>
        <CircularProgress />
        <Typography>正在加载数据...</Typography>
      </Box>
    )
  }
  
  return (
    <>
      {windowType === 'note' && (
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <NoteEditor />
        </Box>
      )}
      
      {windowType === 'todo' && (
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <TodoList 
            onTodoSelect={() => {}} 
            onViewModeChange={() => {}} 
            onShowCompletedChange={() => {}} 
            viewMode="list" 
            showCompleted={true} 
            onMultiSelectChange={() => {}} 
            onMultiSelectRefChange={() => {}} 
            refreshTrigger={0} 
            sortBy="createdAt" 
            onSortByChange={() => {}}
          />
        </Box>
      )}
    </>
  )
}

/**
 * 独立窗口组件
 * 根据URL参数决定显示笔记编辑器还是Todo列表
 */
function StandaloneWindow() {
  const [windowType, setWindowType] = useState(null)
  const [windowData, setWindowData] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [themeMode, setThemeMode] = useState('light')
  
  // 创建主题
  const appTheme = createAppTheme(themeMode)
  
  // 检查是否在Electron环境中运行
  const isElectronEnvironment = useMemo(() => {
    return window.electronAPI !== undefined
  }, [])

  useEffect(() => {
    const initializeWindow = async () => {
      try {
        console.log('开始初始化独立窗口...')
        setIsLoading(true)
        
        // 如果不在Electron环境中，直接返回，不进行参数解析
        if (!isElectronEnvironment) {
          setIsLoading(false)
          return
        }
        
        // 解析URL参数
        const urlParams = new URLSearchParams(window.location.search)
        const type = urlParams.get('type')
        const noteIdParam = urlParams.get('noteId')
        const todoData = urlParams.get('todoData')
        
        console.log('独立窗口参数:', { type, noteId: noteIdParam, todoData })
        
        if (type === 'note' && noteIdParam) {
          // 笔记独立窗口
          const parsedNoteId = Number(noteIdParam)
          if (Number.isNaN(parsedNoteId)) {
            console.error('无效的noteId:', noteIdParam)
            setError('无效的窗口参数: noteId')
            return
          }
          console.log('设置笔记窗口类型')
          setWindowType('note')
          setWindowData({ noteId: parsedNoteId })
          
        } else if (type === 'todo' && todoData) {
          // Todo独立窗口
          console.log('设置Todo窗口类型')
          setWindowType('todo')
          try {
            const parsedTodoData = JSON.parse(decodeURIComponent(todoData))
            setWindowData(parsedTodoData)
          } catch (parseError) {
            console.error('解析Todo数据失败:', parseError)
            setError('无效的Todo数据')
            return
          }
          
        } else {
          console.error('无效的窗口参数:', { type, noteId: noteIdParam, todoData })
          setError('无效的窗口参数')
          return
        }
        
        console.log('独立窗口初始化完成')
        
      } catch (error) {
        console.error('初始化独立窗口失败:', error)
        setError('初始化失败: ' + error.message)
      } finally {
        console.log('设置加载状态为false')
        setIsLoading(false)
      }
    }

    // 添加延迟确保DOM完全加载
    const timer = setTimeout(() => {
      initializeWindow()
    }, 100)
    
    return () => clearTimeout(timer)
  }, [isElectronEnvironment])
  
  // 监听页面渲染完成，通知Electron窗口准备就绪
  useEffect(() => {
    if (!isLoading && !error && windowType) {
      console.log('页面渲染完成，通知窗口准备就绪')
      
      // 检查是否在Electron环境中
      if (!isElectronEnvironment) {
        console.warn('独立窗口只能在Electron环境中运行')
        return
      }
      
      // 通知 Electron 窗口页面已准备就绪
      const readyCaller = window.electronAPI?.window?.windowReady
      if (typeof readyCaller === 'function') {
        console.log('通过electronAPI.window.windowReady通知窗口准备就绪')
        try {
          readyCaller().then(() => {
            console.log('windowReady调用成功')
          }).catch((error) => {
            console.error('windowReady调用失败:', error)
          })
        } catch (error) {
          console.error('windowReady调用异常:', error)
        }
      } else {
        console.log('electronAPI.window.windowReady 不可用，手动触发DOMContentLoaded事件')
        // 手动触发 DOMContentLoaded 事件作为备选方案
        const event = new Event('DOMContentLoaded')
        document.dispatchEvent(event)
      }
    }
  }, [isLoading, error, windowType, isElectronEnvironment])
  
  // 窗口关闭时的保存逻辑由 WindowManager 通过 executeJavaScript 同步触发
  // 不需要在这里监听 IPC 事件或 beforeunload 事件
  // WindowManager 会直接在渲染进程中执行保存代码

  // 如果不在Electron环境中，显示提示信息
  if (!isElectronEnvironment) {
    return (
      <ThemeProvider theme={appTheme}>
        <CssBaseline />
        <Box sx={{ 
          height: '100vh', 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center',
          flexDirection: 'column',
          gap: 2,
          p: 3
        }}>
          <Typography color="error" variant="h6">环境错误</Typography>
          <Typography sx={{ textAlign: 'center' }}>独立窗口只能在FlashNote桌面应用中运行</Typography>
          <Typography sx={{ textAlign: 'center' }} color="text.secondary">
            请通过拖拽笔记或Todo列表到窗口中来创建独立窗口
          </Typography>
        </Box>
      </ThemeProvider>
    )
  }

  return (
    <ThemeProvider theme={appTheme}>
      <CssBaseline />
      <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        {/* 使用主应用的TitleBar组件 */}
        <TitleBar />
        {isLoading && (
          <Box sx={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            height: '100vh',
            flexDirection: 'column',
            gap: 2
          }}>
            <CircularProgress />
            <Typography>正在加载独立窗口...</Typography>
          </Box>
        )}
        
        {error && (
          <Box sx={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            height: '100vh',
            flexDirection: 'column',
            gap: 2,
            p: 3
          }}>
            <Typography color="error" variant="h6">加载失败</Typography>
            <Typography sx={{ textAlign: 'center' }}>{error}</Typography>
          </Box>
        )}
        
        {!isLoading && !error && windowType && windowData && (
          <StandaloneProvider windowType={windowType} windowData={windowData}>
            <StandaloneContent windowType={windowType} />
          </StandaloneProvider>
        )}
      </Box>
    </ThemeProvider>
  )
}

export default StandaloneWindow