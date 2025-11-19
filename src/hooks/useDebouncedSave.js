import { useRef, useCallback, useEffect } from 'react'

/**
 * 防抖保存 Hook
 * 优化性能，避免频繁的 IPC 调用和 SQLite 写入
 * 
 * @param {Function} saveCallback - 保存函数
 * @param {number} delay - 防抖延迟（毫秒）
 * @returns {Function} debouncedSave - 防抖后的保存函数
 */
export const useDebouncedSave = (saveCallback, delay = 2000) => {
  const timeoutRef = useRef(null)
  const pendingSaveRef = useRef(false)
  const isSavingRef = useRef(false)
  
  // 取消待处理的保存
  const cancelSave = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    pendingSaveRef.current = false
  }, [])
  
  // 立即保存（用于切换笔记或关闭应用）
  const saveNow = useCallback(async () => {
    cancelSave()
    
    if (isSavingRef.current) {
      // 如果正在保存，等待完成
      return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (!isSavingRef.current) {
            clearInterval(checkInterval)
            resolve()
          }
        }, 50)
      })
    }
    
    // 立即保存，无论是否有pendingSave
    isSavingRef.current = true
    try {
      await saveCallback()
      pendingSaveRef.current = false
    } finally {
      isSavingRef.current = false
    }
  }, [saveCallback, cancelSave])
  
  // 防抖保存
  const debouncedSave = useCallback(() => {
    pendingSaveRef.current = true
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    
    timeoutRef.current = setTimeout(async () => {
      if (pendingSaveRef.current && !isSavingRef.current) {
        isSavingRef.current = true
        try {
          await saveCallback()
          pendingSaveRef.current = false
        } catch (error) {
          console.error('自动保存失败:', error)
        } finally {
          isSavingRef.current = false
        }
      }
    }, delay)
  }, [saveCallback, delay])
  
  // 组件卸载时清理
  useEffect(() => {
    return () => {
      cancelSave()
    }
  }, [cancelSave])
  
  return {
    debouncedSave,
    saveNow,
    cancelSave,
    hasPendingSave: () => pendingSaveRef.current,
    isSaving: () => isSavingRef.current
  }
}
