export function requireSyncSuccess(result) {
  if (result?.success !== true) {
    const details = (result?.errorDetails || []).map(item => typeof item === 'string' ? item : item.message || item.error).filter(Boolean)
    throw new Error(result?.error || details[0] || '同步未全部完成，未完成的内容会在下次重试')
  }
  return result
}
