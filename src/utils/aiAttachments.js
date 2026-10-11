export const MAX_AI_ATTACHMENTS = 6
const IMAGE_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }
const TEXT_EXTENSIONS = new Set('txt md markdown csv tsv json jsonl log yaml yml xml html htm css js jsx ts tsx py java c cpp h hpp rs go sh sql toml ini'.split(' '))
export const AI_ATTACHMENT_ACCEPT = [...Object.keys(IMAGE_TYPES), ...TEXT_EXTENSIONS].map(ext => `.${ext}`).join(',')

export const readAIAttachment = async (file, { visionEnabled = false } = {}) => {
  const name = file.name || '粘贴的图片'
  const ext = name.split('.').pop().toLowerCase()
  const mime = IMAGE_TYPES[ext] || (Object.values(IMAGE_TYPES).includes(file.type) ? file.type : null)
  const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`
  if (mime) {
    if (!visionEnabled) throw new Error('请先在 AI 设置中开启图片理解，并选择支持图片的模型')
    if (file.size > 6 * 1024 * 1024) throw new Error(`${name} 超过图片大小限制（6 MB）`)
    const bytes = new Uint8Array(await file.arrayBuffer())
    let binary = ''
    for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768))
    return { id, kind: 'image', name, dataUrl: `data:${mime};base64,${btoa(binary)}` }
  }
  if (!TEXT_EXTENSIONS.has(ext)) throw new Error(`${name} 暂不支持读取；可拖入 PNG/JPEG/WebP/GIF 图片、文本、Markdown、CSV 或代码文件`)
  if (file.size > 1024 * 1024) throw new Error(`${name} 超过文本大小限制（1 MB）`)
  const text = await file.text()
  if (text.includes('\0')) throw new Error(`${name} 不是可读取的文本文件`)
  if (!text.trim()) throw new Error(`${name} 内容为空`)
  if (text.length > 30000) throw new Error(`${name} 超过 30,000 字符，请拆分后发送`)
  return { id, kind: 'text', name, text }
}

export const buildAttachmentMessage = (text, attachments) => {
  const images = attachments.filter(item => item.kind === 'image')
  const body = [String(text || '').trim(), ...attachments.filter(item => item.kind === 'text')
    .map(item => `附件「${item.name}」内容：\n${item.text}`)].filter(Boolean).join('\n\n') || '请查看这些图片。'
  return images.length ? [{ type: 'text', text: body }, ...images.map(item => ({ type: 'image_url', image_url: { url: item.dataUrl } }))] : body
}
