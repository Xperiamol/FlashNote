// One bounded review, only when the configured model has image understanding enabled.
export const reviewCanvas = async (result, description, task) => {
  const config = await window.electronAPI?.ai?.getConfig?.()
  if (![true, 'true'].includes(config?.data?.visionEnabled)) return null
  task?.throwIfCancelled()
  const { exportToBlob } = await import('@excalidraw/excalidraw')
  const blob = await exportToBlob({
    elements: result.elements,
    files: result.files || {},
    appState: { viewBackgroundColor: '#f8fafc', exportBackground: true, exportWithDarkMode: false },
    mimeType: 'image/png',
    maxWidthOrHeight: 1400,
  })
  const image = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('画布预览读取失败'))
    reader.readAsDataURL(blob)
  })
  task?.throwIfCancelled()
  const response = await (task ? task.chat : window.electronAPI.ai.chat)([
    { role: 'system', content: '你是画布视觉审校。检查实际渲染图中的文字遮挡、裁切、过小字号、关系不清、明显不符合用户风格和需求的构图。不要因个人偏好强迫统一风格。返回严格 JSON：{"issues":["具体位置、问题、修正方法"]}；没有实质问题返回空数组，最多3项。不要虚构用户没给的数据。' },
    { role: 'user', content: [{ type: 'text', text: `用户需求：${description}` }, { type: 'image_url', image_url: { url: image } }] },
  ], { temperature: 0.1, timeoutMs: 60000 })
  if (!response?.success) throw new Error(response?.error || '视觉复核失败')
  const text = String(response.data?.content || '').replace(/^\s*```(?:json)?\s*/, '').replace(/\s*```\s*$/, '')
  const review = JSON.parse(text)
  if (!Array.isArray(review.issues)) throw new Error('视觉复核结果格式错误')
  return review.issues.filter(item => typeof item === 'string').slice(0, 3).map(item => item.slice(0, 500))
}
