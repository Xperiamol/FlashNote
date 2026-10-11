// ProseMirror 在 React NodeView 挂载前/卸载时也会调用 schema.toDOM。
// 此时相对资源路径必须使用应用协议，不能让浏览器相对 dist/index.html 解析。
export const editorImageSource = (src) => typeof src === 'string'
  && /^(?:\.\/)?(?:images|audio|attachments)\//i.test(src)
  ? `app://${src.replace(/^\.\//, '')}`
  : src


export const imageUploadName = (file, prefix = 'paste') => {
  const extensions = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/bmp': 'bmp', 'image/avif': 'avif' }
  const ext = extensions[file?.type] || String(file?.name || '').match(/\.(png|jpe?g|webp|gif|svg|bmp|avif)$/i)?.[1]?.toLowerCase()
  if (!ext) throw new Error('无法识别图片格式，请使用 PNG、JPEG、WebP 或 GIF 图片')
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`
}
