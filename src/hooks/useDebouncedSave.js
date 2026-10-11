import { useRef, useCallback, useEffect } from 'react'
import { registerEditorSaver, trackEditorSave } from '../utils/editorSaveRegistry'

/**
 * 防抖保存 Hook
 * 优化性能，避免频繁的 IPC 调用和 SQLite 写入
 * 
 * @param {Function} saveCallback - 保存函数
 * @param {number} delay - 防抖延迟（毫秒）
 * @returns {Function} debouncedSave - 防抖后的保存函数
 */
export const useDebouncedSave = (saveCallback, delay = 2000, maxWait = Math.max(delay, 5000), captureDraft) => {
  const timeoutRef = useRef(null)
  const deadlineRef = useRef(null)
  const callbackRef = useRef(saveCallback)
  callbackRef.current = saveCallback
  const pendingSaveRef = useRef(false)
  const isSavingRef = useRef(false)
  const activeSaveRef = useRef(null)
  const changeVersionRef = useRef(0)
  const draftCaptureRef = useRef(captureDraft)
  draftCaptureRef.current = captureDraft
  const draftId = useRef(null)
  if (!draftId.current) draftId.current = crypto.randomUUID()
  const draftRef = useRef(null)
  const draftTimer = useRef(null)
  const draftWrite = useRef(Promise.resolve())

  const stageDraft = useCallback(() => {
    clearTimeout(draftTimer.current)
    draftTimer.current = null
    const draft = draftRef.current
    if (!draft || !window.electronAPI?.notes?.stageDraft) return
    draftWrite.current = draftWrite.current.catch(() => {}).then(async () => {
      const result = await window.electronAPI.notes.stageDraft(draft)
      if (result?.success === false) throw new Error(result.error || '草稿暂存失败')
    })
    draftWrite.current.catch(error => console.error('草稿暂存失败，保留正式保存重试:', error))
  }, [])

  const capturePendingDraft = useCallback(() => {
    const snapshot = draftCaptureRef.current?.()
    if (snapshot?.noteId) {
      draftRef.current = { ...snapshot, key: `${draftId.current}:${snapshot.noteId}`, revision: changeVersionRef.current }
      if (!draftTimer.current) draftTimer.current = setTimeout(stageDraft, 750)
    }
  }, [stageDraft])
  
  // 取消待处理的保存
  const cancelSave = useCallback(() => {
    if (pendingSaveRef.current) stageDraft()
    draftRef.current = null
    clearTimeout(deadlineRef.current)
    deadlineRef.current = null
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    pendingSaveRef.current = false
  }, [stageDraft])

  // 串行执行保存，并且只在保存的是最新版本时清除 pending。
  // 保存期间发生的新输入会增加版本号，随后必须再保存一次。
  const executeSave = useCallback(async () => {
    const previousSave = activeSaveRef.current || Promise.resolve()
    const savePromise = previousSave
      .catch(() => undefined)
      .then(async () => {
        const savingVersion = changeVersionRef.current
        const savedDraft = draftRef.current
        if (pendingSaveRef.current) stageDraft()
        isSavingRef.current = true
        const result = await callbackRef.current()
        if (result === false || result?.success === false || result?.cancelled) throw new Error(result?.error || '保存未完成')
        if (changeVersionRef.current === savingVersion) {
          pendingSaveRef.current = false
        }
        if (savedDraft && window.electronAPI?.notes?.clearDraft) {
          // 清理必须排在草稿写入之后，不能把正在保存期间的新输入清掉。
          await draftWrite.current.catch(() => {})
          await window.electronAPI.notes.clearDraft({ key: savedDraft.key, revision: savedDraft.revision })
          if (draftRef.current === savedDraft) draftRef.current = null
        }
      })
    activeSaveRef.current = savePromise
    trackEditorSave(draftId.current, savePromise)

    try {
      await savePromise
    } finally {
      if (activeSaveRef.current === savePromise) {
        activeSaveRef.current = null
        isSavingRef.current = false
      }
    }
  }, [stageDraft])

  // 立即保存（用于切换笔记或关闭应用）
  const saveNow = useCallback(async () => {
    clearTimeout(deadlineRef.current)
    deadlineRef.current = null
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }

    // 即使已有保存正在进行，也要在其完成后再写入一次最新快照。
    pendingSaveRef.current = true
    changeVersionRef.current += 1
    capturePendingDraft()
    do { await executeSave() } while (pendingSaveRef.current)
  }, [executeSave, capturePendingDraft])

  useEffect(() => registerEditorSaver(async () => {
    if (pendingSaveRef.current || activeSaveRef.current) await saveNow()
  }, 0, () => pendingSaveRef.current || Boolean(activeSaveRef.current)), [saveNow])
  
  // 防抖保存
  const debouncedSave = useCallback(() => {
    changeVersionRef.current += 1
    pendingSaveRef.current = true
    capturePendingDraft()
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    
    const flush = async () => {
      clearTimeout(timeoutRef.current)
      clearTimeout(deadlineRef.current)
      deadlineRef.current = null
      timeoutRef.current = null
      if (pendingSaveRef.current) {
        try {
          await executeSave()
        } catch (error) {
          console.error('自动保存失败:', error)
        }
      }
    }
    timeoutRef.current = setTimeout(flush, delay)
    if (!deadlineRef.current) deadlineRef.current = setTimeout(flush, maxWait)
  }, [executeSave, delay, maxWait, capturePendingDraft])
  
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
