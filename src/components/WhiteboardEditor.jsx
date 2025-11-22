import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Box, Alert, CircularProgress, IconButton, Tooltip } from '@mui/material'
import { Save as SaveIcon, GetApp as ExportIcon } from '@mui/icons-material'
import { Excalidraw, exportToBlob, THEME } from '@excalidraw/excalidraw'
import { useStore } from '../store/useStore'
import { useStandaloneContext } from './StandaloneProvider'
import { useDebouncedSave } from '../hooks/useDebouncedSave'
import '@excalidraw/excalidraw/index.css'

/**
 * 白板编辑器组件
 * 直接使用 @excalidraw/excalidraw React 组件
 */
const WhiteboardEditor = ({ noteId, showToolbar = true, isStandaloneMode = false, onSaveWhiteboard, onExportPNG }) => {
  // Get context from either main store or standalone context
  let store
  let actualIsStandaloneMode = isStandaloneMode
  try {
    store = useStandaloneContext()
    actualIsStandaloneMode = true
  } catch (error) {
    // Not in standalone mode, use main store
    store = useStore()
    actualIsStandaloneMode = false
  }
  
  const { notes, updateNote } = store
  const [excalidrawAPI, setExcalidrawAPI] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [initialData, setInitialData] = useState(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [excalidrawKey, setExcalidrawKey] = useState(() => `excalidraw-${noteId || 'unknown'}`)
  const [bridgeActive, setBridgeActive] = useState(false)
  const hasUnsavedChangesRef = useRef(false)
  // 保存上一个noteId，用于检测noteId变化（初始为null，避免首次加载时触发保存）
  const prevNoteIdRef = useRef(null)
  // 当前正在编辑的白板noteId（防止异步保存写错对象）
  const activeNoteIdRef = useRef(noteId)
  // 标记是否正在切换笔记，用于避免组件卸载时的重复保存
  const isSwitchingNoteRef = useRef(false)
  // 记录最近一次成功保存/加载的场景数据，用于变更检测
  const lastSavedSceneRef = useRef(null)
  // 标记当前是否正由系统应用远端数据，避免 onChange 误判
  const isApplyingRemoteDataRef = useRef(true)
  // 记录最近一次渲染的完整场景，用于在组件重挂载时仍能保存
  const latestSceneRef = useRef({ elements: [], appState: {}, files: {} })
  
  // 同步 hasUnsavedChanges 到 ref
  useEffect(() => {
    hasUnsavedChangesRef.current = hasUnsavedChanges
  }, [hasUnsavedChanges])

  // 只在开发环境输出调试日志
  if (process.env.NODE_ENV === 'development') {
    console.log('[WhiteboardEditor] 组件渲染', { 
      noteId, 
      noteIdType: typeof noteId,
      hasExcalidrawAPI: !!excalidrawAPI
    })
  }

  // 定义空白板模板数据
  const blankBoardData = useMemo(() => ({
    elements: [],
    appState: { viewBackgroundColor: '#ffffff' },
    files: {}
  }), [])

  const serializeScene = useCallback((elements = [], appState = {}, files = {}) => {
    const sanitizedAppState = {
      viewBackgroundColor: appState.viewBackgroundColor,
      currentItemFontFamily: appState.currentItemFontFamily,
      gridSize: appState.gridSize
    }

    const sortedFileKeys = Object.keys(files || {}).sort()
    const sanitizedFiles = {}
    sortedFileKeys.forEach((key) => {
      sanitizedFiles[key] = files[key]
    })

    return JSON.stringify({
      elements,
      appState: sanitizedAppState,
      files: sanitizedFiles
    })
  }, [])

  // 重置Excalidraw内容的通用函数
  const resetExcalidrawContent = useCallback(async (api, note) => {
    const applyScene = (elements, appState, files) => {
      if (api && api.updateScene && typeof api.updateScene === 'function') {
        api.updateScene({ elements, appState, files })
      } else if (api && api.resetScene && typeof api.resetScene === 'function') {
        api.resetScene({ elements, appState, files })
      } else {
        setInitialData({ elements, appState, files })
      }

      lastSavedSceneRef.current = serializeScene(elements, appState, files)
      latestSceneRef.current = {
        elements,
        appState,
        files
      }
      setHasUnsavedChanges(false)
      hasUnsavedChangesRef.current = false
    }

    isApplyingRemoteDataRef.current = true

    try {
      const useBlankScene = () => {
        applyScene(
          blankBoardData.elements,
          blankBoardData.appState,
          blankBoardData.files
        )
      }

      // 如果笔记类型不是白板，使用空白板
      if (note.note_type !== 'whiteboard') {
        useBlankScene()
        return
      }

      // 笔记类型是白板，但内容为空
      if (!note.content) {
        useBlankScene()
        return
      }

      // 解析白板数据并更新
      const excalidrawData = JSON.parse(note.content)
      const elements = excalidrawData.elements || []
      const appState = excalidrawData.appState || { viewBackgroundColor: '#ffffff' }
      
      // 从文件系统加载图片
      let files = {}
      if (excalidrawData.fileMap && Object.keys(excalidrawData.fileMap).length > 0) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[WhiteboardEditor] 从文件系统加载图片', {
            filesCount: Object.keys(excalidrawData.fileMap).length
          })
        }
        
        const result = await window.electronAPI.whiteboard.loadImages(excalidrawData.fileMap)
        if (result.success) {
          files = result.data
        } else {
          console.error('[WhiteboardEditor] 加载图片失败', result.error)
        }
      }
      
      applyScene(elements, appState, files)
    } catch (error) {
      console.error('[WhiteboardEditor] 更新Excalidraw内容失败', error)
      applyScene(
        blankBoardData.elements,
        blankBoardData.appState,
        blankBoardData.files
      )
    } finally {
      isApplyingRemoteDataRef.current = false
    }
  }, [blankBoardData, serializeScene, setHasUnsavedChanges, setInitialData])

  // 加载白板数据（仅在首次挂载时执行，后续切换通过 useEffect 处理）
  useEffect(() => {
    // 只在首次加载时执行（prevNoteIdRef 为 null）
    if (prevNoteIdRef.current !== null) {
      return
    }
    
    const loadWhiteboardData = async () => {
      if (process.env.NODE_ENV === 'development') {
        console.log('[WhiteboardEditor] 首次加载数据', { noteId })
      }
      isApplyingRemoteDataRef.current = true
      
      if (!noteId) {
        console.error('[WhiteboardEditor] noteId 无效', { noteId })
        setError('笔记 ID 无效')
        setIsLoading(false)
        isApplyingRemoteDataRef.current = false
        return
      }

      const note = notes.find(n => n.id === noteId)

      if (!note) {
        setError('笔记不存在')
        setIsLoading(false)
        isApplyingRemoteDataRef.current = false
        return
      }

      // 解析白板数据
      try {
        // 如果笔记类型不是白板，使用空白板
        if (note.note_type !== 'whiteboard') {
          setInitialData(blankBoardData)
          lastSavedSceneRef.current = serializeScene(
            blankBoardData.elements,
            blankBoardData.appState,
            blankBoardData.files
          )
          setHasUnsavedChanges(false)
          hasUnsavedChangesRef.current = false
          activeNoteIdRef.current = noteId
          setIsLoading(false)
          isApplyingRemoteDataRef.current = false
          return
        }

        // 笔记类型是白板，但内容为空
        if (!note.content) {
          setInitialData(blankBoardData)
          lastSavedSceneRef.current = serializeScene(
            blankBoardData.elements,
            blankBoardData.appState,
            blankBoardData.files
          )
          setHasUnsavedChanges(false)
          hasUnsavedChangesRef.current = false
          activeNoteIdRef.current = noteId
          setIsLoading(false)
          isApplyingRemoteDataRef.current = false
          return
        }

        // 解析白板数据
        const excalidrawData = JSON.parse(note.content)

        // 从文件系统加载图片
        let files = {}
        if (excalidrawData.fileMap && Object.keys(excalidrawData.fileMap).length > 0) {
          if (process.env.NODE_ENV === 'development') {
            console.log('[WhiteboardEditor] 初始加载 - 从文件系统加载图片', {
              filesCount: Object.keys(excalidrawData.fileMap).length
            })
          }
          
          const result = await window.electronAPI.whiteboard.loadImages(excalidrawData.fileMap)
          if (result.success) {
            files = result.data
            if (process.env.NODE_ENV === 'development') {
              console.log('[WhiteboardEditor] 图片加载成功', {
                filesCount: Object.keys(files).length
              })
            }
          } else {
            console.error('[WhiteboardEditor] 加载图片失败', result.error)
          }
        }

        const initialScene = {
          elements: excalidrawData.elements || [],
          appState: excalidrawData.appState || { viewBackgroundColor: '#ffffff' },
          files: files
        }

        setInitialData(initialScene)
        lastSavedSceneRef.current = serializeScene(
          initialScene.elements,
          initialScene.appState,
          initialScene.files
        )
        latestSceneRef.current = initialScene
        setHasUnsavedChanges(false)
        hasUnsavedChangesRef.current = false
        activeNoteIdRef.current = noteId
        
        setIsLoading(false)
        isApplyingRemoteDataRef.current = false
      } catch (error) {
        console.error('[WhiteboardEditor] 解析白板数据失败，使用空白板', error)
        
        // 解析失败时使用空白板
        setInitialData(blankBoardData)
        lastSavedSceneRef.current = serializeScene(
          blankBoardData.elements,
          blankBoardData.appState,
          blankBoardData.files
        )
        latestSceneRef.current = blankBoardData
        setHasUnsavedChanges(false)
        hasUnsavedChangesRef.current = false
    activeNoteIdRef.current = noteId
        
        // 只在笔记类型确实是白板时才显示错误
        const note = notes.find(n => n.id === noteId)
        if (note?.note_type === 'whiteboard') {
          setError('白板数据格式错误，已使用空白板')
        } else {
          setError(null) // 非白板类型解析失败是预期行为
        }
        
        setIsLoading(false)
        isApplyingRemoteDataRef.current = false
      }
    }

    loadWhiteboardData()
    // 首次加载后设置 prevNoteIdRef
    prevNoteIdRef.current = noteId
  }, [noteId, notes, blankBoardData, serializeScene, setHasUnsavedChanges])

  // 当noteId变化时，先保存旧笔记，再加载新笔记
  useEffect(() => {
    // 跳过首次加载（已在上面的 useEffect 处理）
    if (prevNoteIdRef.current === null) {
      return
    }
    
    // 使用 ref 追踪上一个 noteId
    const prevNoteId = prevNoteIdRef.current
    
    if (excalidrawAPI && noteId && prevNoteId !== noteId) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[WhiteboardEditor] noteId变化，开始切换', { 
          prevNoteId, 
          newNoteId: noteId,
          hasUnsavedChanges: hasUnsavedChangesRef.current
        })
      }
      
      // 标记正在切换笔记
      isSwitchingNoteRef.current = true
      setBridgeActive(true)
      setIsLoading(true)
      setInitialData(null)
      
      // 使用 async IIFE 确保顺序执行
      ;(async () => {
        try {
          // 如果有未保存的更改，先保存旧笔记
          if (hasUnsavedChangesRef.current) {
            if (process.env.NODE_ENV === 'development') {
              console.log('[WhiteboardEditor] 切换前保存旧笔记', { prevNoteId })
            }
            
            const sceneSnapshot = latestSceneRef.current || {}
            const elements = sceneSnapshot.elements || []
            const appState = sceneSnapshot.appState || { viewBackgroundColor: '#ffffff' }
            const files = sceneSnapshot.files || {}

            if (process.env.NODE_ENV === 'development') {
              console.log('[WhiteboardEditor] 获取到的数据', {
                elementsCount: elements?.length || 0,
                filesCount: Object.keys(files || {}).length
              })
            }

            // 将图片保存到文件系统
            let fileMap = {}
            if (files && Object.keys(files).length > 0) {
              const result = await window.electronAPI.whiteboard.saveImages(files)
              if (result.success) {
                fileMap = result.data
              }
            }

            const data = {
              type: 'excalidraw',
              version: 2,
              source: 'flashnote-local',
              elements,
              appState: {
                viewBackgroundColor: appState.viewBackgroundColor,
                currentItemFontFamily: appState.currentItemFontFamily,
                gridSize: appState.gridSize
              },
              fileMap
            }

            await updateNote(prevNoteId, {
              content: JSON.stringify(data),
              note_type: 'whiteboard'
            })
            
            hasUnsavedChangesRef.current = false
            setHasUnsavedChanges(false)
            
            if (process.env.NODE_ENV === 'development') {
              console.log('[WhiteboardEditor] 旧笔记保存完成', { 
                prevNoteId,
                savedElementsCount: elements?.length || 0
              })
            }
          }
          
          // 保存完成后（或无需保存时），加载新笔记
          const note = notes.find(n => n.id === noteId)
          if (note) {
            if (process.env.NODE_ENV === 'development') {
              console.log('[WhiteboardEditor] 开始加载新笔记', { noteId })
            }
            await resetExcalidrawContent(null, note)
            activeNoteIdRef.current = noteId
            setExcalidrawKey(`excalidraw-${noteId || 'unknown'}`)
            setIsLoading(false)
            setBridgeActive(false)
          } else {
            activeNoteIdRef.current = noteId
            setExcalidrawKey(`excalidraw-${noteId || 'unknown'}`)
            setIsLoading(false)
            setBridgeActive(false)
          }
        } catch (error) {
          console.error('[WhiteboardEditor] 切换笔记流程出错', error)
        } finally {
          setIsLoading(false)
          setBridgeActive(false)
          // 更新 prevNoteIdRef
          prevNoteIdRef.current = noteId
          
          // 切换完成，重置标志
          isSwitchingNoteRef.current = false
        }
      })()
    }
  }, [noteId, notes, resetExcalidrawContent, updateNote, setHasUnsavedChanges])

  // 保存函数（稳定引用）
  const performSave = useCallback(async () => {
    // 保存当前正在编辑的noteId的快照，避免切换时写错对象
    const currentNoteId = activeNoteIdRef.current
    const currentExcalidrawAPI = excalidrawAPI

    if (process.env.NODE_ENV === 'development') {
      console.log('[WhiteboardEditor] performSave调用', {
        currentNoteId,
        componentNoteId: noteId,
        hasExcalidrawAPI: !!currentExcalidrawAPI
      })
    }

    if (!currentExcalidrawAPI || !currentNoteId) {
      return
    }

    try {
      const elements = currentExcalidrawAPI.getSceneElements()
      const appState = currentExcalidrawAPI.getAppState()
      const files = currentExcalidrawAPI.getFiles()

      // 将图片保存到文件系统
      let fileMap = {}
      if (files && Object.keys(files).length > 0) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[WhiteboardEditor] 保存图片到文件系统', {
            filesCount: Object.keys(files).length
          })
        }
        
        const result = await window.electronAPI.whiteboard.saveImages(files)
        if (result.success) {
          fileMap = result.data
        } else {
          throw new Error(result.error || '保存图片失败')
        }
      }

      const persistedAppState = {
        viewBackgroundColor: appState.viewBackgroundColor,
        currentItemFontFamily: appState.currentItemFontFamily,
        gridSize: appState.gridSize
      }

      const data = {
        type: 'excalidraw',
        version: 2,
        source: 'flashnote-local',
        elements,
        appState: persistedAppState,
        fileMap // 保存文件映射而非实际图片数据
      }

      await updateNote(currentNoteId, {
        content: JSON.stringify(data),
        note_type: 'whiteboard'
      })
      
      lastSavedSceneRef.current = serializeScene(elements, persistedAppState, files)
      
      // 只有当当前组件的noteId与保存的noteId一致时，才更新状态
      if (noteId === currentNoteId) {
        setHasUnsavedChanges(false)
        hasUnsavedChangesRef.current = false
      }
    } catch (error) {
      console.error('[WhiteboardEditor] 保存失败', error)
      setError('保存失败: ' + error.message)
    }
  }, [excalidrawAPI, noteId, updateNote, serializeScene])

  // 保存开始日志
  const performSaveWithLog = useCallback(async () => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[WhiteboardEditor] 开始保存', { 
        noteId, 
        hasUnsavedChanges: hasUnsavedChangesRef.current,
        hasExcalidrawAPI: !!excalidrawAPI 
      })
    }
    
    const result = await performSave()
    
    if (process.env.NODE_ENV === 'development') {
      console.log('[WhiteboardEditor] 保存完成', { 
        noteId, 
        hasUnsavedChanges: hasUnsavedChangesRef.current 
      })
    }
    
    return result
  }, [performSave, noteId, hasUnsavedChangesRef, excalidrawAPI])

  // 使用防抖保存 Hook，白板保存频率较低（10秒）
  const { debouncedSave, saveNow, cancelSave } = useDebouncedSave(performSaveWithLog, 10000)

  // 独立窗口模式：监听窗口关闭事件
  useEffect(() => {
    if (!actualIsStandaloneMode) {
      console.log('[WhiteboardEditor] 非独立窗口模式，不监听关闭事件')
      return
    }

    console.log('[WhiteboardEditor] 独立窗口模式，开始监听 standalone-window-save 事件')

    const handleWindowSave = async () => {
      console.log('[WhiteboardEditor] 收到 standalone-window-save 事件', { 
        noteId, 
        hasUnsavedChanges: hasUnsavedChangesRef.current 
      })
      
      // 无论是否有未保存的更改，都尝试保存（因为可能有延迟的更改）
      try {
        console.log('[WhiteboardEditor] 开始执行保存...')
        await saveNow()
        console.log('[WhiteboardEditor] 保存完成')
        // 通知主进程保存完成
        window.dispatchEvent(new CustomEvent('standalone-save-complete'))
      } catch (error) {
        console.error('[WhiteboardEditor] 保存失败:', error)
        // 即使失败也通知，避免主进程一直等待
        window.dispatchEvent(new CustomEvent('standalone-save-complete'))
      }
    }

    // 监听独立窗口保存事件
    window.addEventListener('standalone-window-save', handleWindowSave)
    console.log('[WhiteboardEditor] 已添加 standalone-window-save 事件监听器')

    return () => {
      console.log('[WhiteboardEditor] 移除 standalone-window-save 事件监听器')
      window.removeEventListener('standalone-window-save', handleWindowSave)
    }
  }, [actualIsStandaloneMode, noteId, saveNow])

  // 保存白板
  const saveWhiteboard = useCallback(async () => {
    await saveNow()
  }, [saveNow])

  // 导出 PNG
  const exportPNG = useCallback(async () => {
    if (!excalidrawAPI) return

    try {
      console.log('[WhiteboardEditor] 导出 PNG')
      const blob = await exportToBlob({
        elements: excalidrawAPI.getSceneElements(),
        appState: excalidrawAPI.getAppState(),
        files: excalidrawAPI.getFiles(),
      })

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `whiteboard-${noteId}.png`
      a.click()
      URL.revokeObjectURL(url)
      console.log('[WhiteboardEditor] 导出 PNG 成功')
    } catch (error) {
      console.error('[WhiteboardEditor] 导出 PNG 失败', error)
    }
  }, [excalidrawAPI, noteId])

  // 将保存和导出函数暴露给父组件
  useEffect(() => {
    if (onSaveWhiteboard) {
      onSaveWhiteboard(saveWhiteboard)
    }
  }, [saveWhiteboard, onSaveWhiteboard])

  useEffect(() => {
    if (onExportPNG) {
      onExportPNG(exportPNG)
    }
  }, [exportPNG, onExportPNG])

  // 组件卸载时保存当前白板
  useEffect(() => {
    return () => {
      // 如果正在切换笔记，不要在卸载时保存（已在切换逻辑中处理）
      if (isSwitchingNoteRef.current) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[WhiteboardEditor] 组件卸载，但正在切换笔记，跳过保存')
        }
        return
      }
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[WhiteboardEditor] 组件卸载，检查是否需要保存', { 
          noteId: prevNoteIdRef.current,
          hasUnsavedChanges: hasUnsavedChangesRef.current 
        })
      }
      
      if (hasUnsavedChangesRef.current) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[WhiteboardEditor] 组件卸载，自动保存当前内容', { 
            noteId: prevNoteIdRef.current 
          })
        }
        saveNow()
      }
    }
  }, [saveNow])

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    )
  }

  if (isLoading || !initialData || bridgeActive) {
    return (
      <Box sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%'
      }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box sx={{ 
      position: 'relative', 
      width: '100%', 
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }}>
      {/* Excalidraw 画布 */}
      <Box sx={{ 
        flex: 1, 
        minHeight: 0,
        width: '100%',
        position: 'relative',
        '& .excalidraw': {
          height: '100% !important',
          width: '100% !important'
        }
      }}>
        <Excalidraw
          key={excalidrawKey}
          excalidrawAPI={(api) => {
            if (api) {
              console.log('[WhiteboardEditor] Excalidraw API 已设置')
              setExcalidrawAPI(api)
            }
          }}
          initialData={initialData}
          onChange={(elements, appState, files) => {
            if (isApplyingRemoteDataRef.current) {
              return
            }

            const persistedAppState = {
              viewBackgroundColor: appState.viewBackgroundColor,
              currentItemFontFamily: appState.currentItemFontFamily,
              gridSize: appState.gridSize
            }
            latestSceneRef.current = {
              elements,
              appState: persistedAppState,
              files
            }
            const serializedScene = serializeScene(elements, persistedAppState, files)

            if (serializedScene !== lastSavedSceneRef.current) {
              if (!hasUnsavedChangesRef.current) {
                setHasUnsavedChanges(true)
                hasUnsavedChangesRef.current = true
              }
              debouncedSave()
            }
          }}
          theme={THEME.LIGHT}
          langCode="zh-CN"
          viewModeEnabled={false}
          zenModeEnabled={false}
          gridModeEnabled={false}
          UIOptions={{
            canvasActions: {
              loadScene: false, // 禁用加载场景按钮（我们有自己的笔记管理）
              export: false, // 禁用导出按钮（我们有自己的导出功能）
              saveAsImage: false, // 禁用另存为图片（我们有自己的PNG导出）
            },
          }}
        />
      </Box>
    </Box>
  )
}

export default WhiteboardEditor
