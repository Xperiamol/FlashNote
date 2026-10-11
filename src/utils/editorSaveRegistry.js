// 一个窗口可以同时挂载笔记、画布和嵌入编辑器，不能用一个会互相覆盖的回调。
const savers = new Set()
const savesInFlight = new Map()
// 卸载编辑器后，关闭/同步仍必须等待已经发出的保存；失败记录由同一编辑器重试成功清除。
export function trackEditorSave(key, promise) {
  savesInFlight.set(key, promise)
  promise.then(() => {
    if (savesInFlight.get(key) === promise) savesInFlight.delete(key)
  }, () => {})
}
export function registerEditorSaver(flush, priority = 0, isPending = () => false) {
  const entry = { flush, priority, isPending }
  savers.add(entry)
  return () => savers.delete(entry)
}
export async function flushEditorSaves(options = {}) {
  // 串行让外层元数据和内层画布各自完成；任何失败都传给关闭/同步调用者。
  do {
    for (const { flush } of [...savers].sort((a, b) => a.priority - b.priority)) await flush(options)
    while (savesInFlight.size) await Promise.all([...savesInFlight.values()])
  } while ([...savers].some(entry => entry.isPending()))
}
if (typeof window !== 'undefined') {
  window.__flushEditorSaves = flushEditorSaves
  window.__saveBeforeClose = flushEditorSaves
}
