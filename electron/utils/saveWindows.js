// 关闭、退出、同步共用同一保存屏障；超时是失败，绝不能被当作保存完成。
async function saveWindow(window, timeoutMs = 30000, { reason = 'close' } = {}) {
  if (window.isDestroyed()) return
  let timer
  try {
    const result = await Promise.race([
      window.webContents.executeJavaScript(`(async () => {
        const save = window.__flushEditorSaves || window.__saveBeforeClose;
        return save ? await save({ reason: ${JSON.stringify(reason)} }) : undefined;
      })()`),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('保存仍未完成，请稍后重试；窗口已保留')), timeoutMs) }),
    ])
    if (result === false || result?.success === false) throw new Error(result?.error || '保存失败，窗口已保留')
  } finally { clearTimeout(timer) }
}
async function saveAllWindows(windows, options) {
  const results = await Promise.allSettled(windows.map(window => saveWindow(window, 30000, options)))
  const failure = results.find(result => result.status === 'rejected')
  if (failure) throw failure.reason
}
module.exports = { saveWindow, saveAllWindows }
