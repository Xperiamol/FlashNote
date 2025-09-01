import React, { createContext, useContext, useEffect } from 'react'
import { useStandaloneStore } from '../store/useStandaloneStore'
import { DragAnimationProvider } from './DragAnimationProvider'

export const StandaloneContext = createContext(null)

export const useStandaloneContext = () => {
  const context = useContext(StandaloneContext)
  if (!context) {
    throw new Error('useStandaloneContext must be used within StandaloneProvider')
  }
  return context
}

export const StandaloneProvider = ({ children, windowType, windowData }) => {
  const store = useStandaloneStore()
  const [isLoading, setIsLoading] = React.useState(true)
  
  // 初始化窗口配置
  useEffect(() => {
    const initializeData = async () => {
      if (windowType && windowData) {
        store.setWindowConfig(windowType, windowData)
        
        // 如果是笔记窗口，加载对应的笔记
        if (windowType === 'note' && windowData.noteId) {
          console.log('开始加载笔记数据:', windowData.noteId)
          const result = await store.loadNote(windowData.noteId)
          console.log('笔记数据加载完成，结果:', result)
          console.log('当前 store 状态:', { notes: store.notes, selectedNoteId: store.selectedNoteId })
        }
      }
      setIsLoading(false)
    }
    
    initializeData()
  }, [windowType, windowData]) // 移除store依赖，避免循环更新

  // 订阅主进程推送的笔记更新事件，实现跨窗口同步
  useEffect(() => {
    if (!window.electronAPI?.notes?.onNoteUpdated) return
    
    const unsubscribe = window.electronAPI.notes.onNoteUpdated((updated) => {
      try {
        // 只同步当前独立窗口正在编辑的笔记
        store.applyIncomingNoteUpdate?.(updated)
      } catch (e) {
        console.error('处理主进程笔记更新失败:', e)
      }
    })

    return () => {
      try {
        if (typeof unsubscribe === 'function') unsubscribe()
      } catch (e) {
        // ignore
      }
    }
  }, [])
  
  const contextValue = {
    ...store,
    isStandaloneMode: true,
    isLoading
  }
  
  // 在数据加载完成前不渲染子组件，避免显示空白内容
  if (isLoading) {
    return (
      <StandaloneContext.Provider value={contextValue}>
        <DragAnimationProvider>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            height: '100vh',
            fontSize: '16px',
            color: '#666'
          }}>
            加载中...
          </div>
        </DragAnimationProvider>
      </StandaloneContext.Provider>
    )
  }
  
  return (
    <StandaloneContext.Provider value={contextValue}>
      <DragAnimationProvider>
        {children}
      </DragAnimationProvider>
    </StandaloneContext.Provider>
  )
}

export default StandaloneProvider