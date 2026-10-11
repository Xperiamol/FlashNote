// 文档转换共用的文本工具：编码识别、纯文本转 Markdown、表格、图片 data URL。

const MAX_IMAGE_BYTES = 15 * 1024 * 1024
const MAX_IMAGES_TOTAL = 60 * 1024 * 1024

const IMAGE_MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  bmp: 'image/bmp', svg: 'image/svg+xml', avif: 'image/avif', emf: null, wmf: null,
}

const mimeOfName = (name) => IMAGE_MIME[String(name || '').split('.').pop().toLowerCase()] || null

// 统一控制单个文档内联图片的体积，超出的图片跳过并计数
class ImageBudget {
  constructor() { this.total = 0; this.skipped = 0 }
  dataUrl(buffer, mime) {
    if (!mime || !buffer?.length) return null
    if (buffer.length > MAX_IMAGE_BYTES || this.total + buffer.length > MAX_IMAGES_TOTAL) { this.skipped++; return null }
    this.total += buffer.length
    return `data:${mime};base64,${Buffer.from(buffer).toString('base64')}`
  }
}

const decoderFor = (label) => {
  const normalized = String(label || '').trim().toLowerCase().replace(/^["']|["']$/g, '')
  if (!normalized) return null
  try { return new TextDecoder(normalized === 'gb2312' || normalized === 'gbk' ? 'gb18030' : normalized) } catch { return null }
}

/** BOM → 声明的字符集 → 合法 UTF-8 → GB18030（中文 Windows 常见） */
const decodeBuffer = (buffer, declared) => {
  const bytes = Buffer.from(buffer)
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return bytes.subarray(3).toString('utf8')
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2))
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2))
  const decoder = decoderFor(declared)
  if (decoder && !/^utf-?8$/.test(decoder.encoding)) return decoder.decode(bytes)
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch {}
  return new TextDecoder('gb18030').decode(bytes)
}

// 行内只需转义反斜杠和尖括号（标题、表格单元等）
const escapeInline = (text) => String(text).replace(/\\/g, '\\\\').replace(/</g, '\\<')

// 纯文本行：另外转义行首的标题、列表、引用标记。有序列表转义标点（1\.），数字本身不能加反斜杠
const escapeLine = (line) => escapeInline(line)
  .replace(/^(\s*)(\d+)([.)])(?=\s|$)/, '$1$2\\$3')
  .replace(/^(\s*)([#>+\-*=])(?=\s|$)/, '$1\\$2')
  .replace(/^(\s*)([-*_]){3,}\s*$/, (match) => match.replace(/([-*_])/g, '\\$1'))

/** 一行一段：保留空行分段，多余空行合并 */
const textToMarkdown = (text) => String(text || '')
  .replace(/\r\n?/g, '\n')
  .split('\n')
  .map((line) => line.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trimEnd())
  .map((line) => (line.trim() ? escapeLine(line) : ''))
  .join('\n\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim()

const cellText = (value) => String(value ?? '')
  .replace(/\r\n?|\n/g, '<br>')
  .replace(/\|/g, '\\|')
  .trim()

/** 二维数组 → GFM 表格；首行作表头，去掉全空的尾列 */
const markdownTable = (rows) => {
  const clean = rows.filter((row) => row.some((cell) => String(cell ?? '').trim()))
  if (!clean.length) return ''
  let width = Math.max(...clean.map((row) => row.length))
  while (width > 1 && clean.every((row) => !String(row[width - 1] ?? '').trim())) width--
  const line = (row) => `| ${Array.from({ length: width }, (_, i) => cellText(row[i]) || ' ').join(' | ')} |`
  return [line(clean[0]), `| ${Array(width).fill('---').join(' | ')} |`, ...clean.slice(1).map(line)].join('\n')
}

const collapseBlankLines = (markdown) => String(markdown || '').replace(/\n{3,}/g, '\n\n').trim()

module.exports = { ImageBudget, mimeOfName, decodeBuffer, textToMarkdown, escapeLine, escapeInline, markdownTable, collapseBlankLines }
