const fs = require('fs')
const ExternalFileDraftStore = require('./ExternalFileDraftStore')
const path = require('path')
const { pathToFileURL } = require('url')
const { createHash } = require('crypto')
const { writeFileAtomicSync } = require('../utils/atomicFile')
const { convertDocumentIsolated } = require('./documents')

const fileRevision = buffer => createHash('sha256').update(buffer).digest('hex')

// 从系统（双击 / 打开方式 / 拖到 Dock）或「打开文件…」打开的外部文件。
//
// 设计要点：
// - 独立窗口：每个文件在自己的窗口里打开，默认预览；切换到编辑模式后才会写回原文件。
// - 写回：保留原文件的编码（UTF-8 / BOM / UTF-16）和换行符；文件在外部被改过时先提示冲突。
// - 白名单：渲染层只能读取由系统或打开对话框交给主进程的路径，不能借 IPC 读任意文件。
// - 兼容：自动识别 UTF-8 / UTF-8 BOM / UTF-16 / GB18030 编码，统一换行符；
//   Markdown 中引用的本地图片内联为 data URL（CSP 不允许 file://），导入时再落盘。

// 设置 → 笔记与文件：Flota 接受哪些文件（系统打开方式、打开对话框、拖进笔记列表）。
// format=document 的类型转换成 Markdown 只读预览，可导入为笔记，不写回原文件。
const FILE_TYPES = [
  { id: 'markdown', name: 'Markdown', format: 'markdown', extensions: ['md', 'markdown', 'mdown', 'mkd'] },
  { id: 'text', name: '纯文本', format: 'text', extensions: ['txt', 'text', 'log'] },
  { id: 'whiteboard', name: 'Excalidraw 画布', format: 'whiteboard', extensions: ['excalidraw'] },
  { id: 'html', name: '网页', format: 'document', extensions: ['html', 'htm', 'xhtml', 'mht', 'mhtml'] },
  { id: 'word', name: 'Word / WPS 文字', format: 'document', extensions: ['docx', 'doc', 'docm', 'dotx', 'dot', 'wps', 'wpt', 'rtf', 'odt'] },
  { id: 'spreadsheet', name: 'Excel / WPS 表格', format: 'document', extensions: ['xlsx', 'xlsm', 'xls', 'et', 'ett', 'ods', 'csv', 'tsv'] },
  { id: 'presentation', name: 'PowerPoint / WPS 演示', format: 'document', extensions: ['pptx', 'ppsx', 'ppt', 'pps', 'dps', 'dpt', 'odp'] },
  { id: 'pdf', name: 'PDF', format: 'document', extensions: ['pdf'] },
  { id: 'ebook', name: 'EPUB 电子书', format: 'document', extensions: ['epub'] },
]
const TYPE_BY_EXT = new Map(FILE_TYPES.flatMap((type) => type.extensions.map((ext) => [`.${ext}`, type])))
const DEFAULT_FILE_TYPES = FILE_TYPES.map((type) => type.id)
const FILE_TYPES_SETTING_KEY = 'openable_file_types'
// 用户保存设置时已见过的类型；之后新增的类型默认开启，不被旧的开启列表关掉
const FILE_TYPES_KNOWN_KEY = 'openable_file_types_known'
const LEGACY_KNOWN_TYPES = ['markdown', 'text', 'html', 'whiteboard']
let enabledFileTypes = new Set(DEFAULT_FILE_TYPES)

const setEnabledFileTypes = (ids, known = DEFAULT_FILE_TYPES) => {
  const knownList = Array.isArray(known) ? known : String(known || '').split(',').map((id) => id.trim())
  const list = (Array.isArray(ids) ? ids : String(ids || '').split(','))
    .map((id) => String(id).trim())
    .filter((id) => DEFAULT_FILE_TYPES.includes(id))
  const added = DEFAULT_FILE_TYPES.filter((id) => !knownList.includes(id))
  enabledFileTypes = new Set([...list, ...added])
  return [...enabledFileTypes]
}
const getEnabledFileTypes = () => [...enabledFileTypes]
/** 当前允许打开的扩展名（打开对话框的过滤器用） */
const getEnabledExtensions = () => FILE_TYPES
  .filter((type) => enabledFileTypes.has(type.id))
  .flatMap((type) => type.extensions)

const MAX_TEXT_BYTES = 20 * 1024 * 1024
const MAX_DOCUMENT_BYTES = 100 * 1024 * 1024
const MAX_WHITEBOARD_BYTES = 60 * 1024 * 1024
const MAX_INLINE_IMAGE_BYTES = 15 * 1024 * 1024
const MAX_INLINE_IMAGES_TOTAL = 60 * 1024 * 1024

const IMAGE_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif'
}

const getFormat = (filePath) => {
  const type = TYPE_BY_EXT.get(path.extname(String(filePath || '')).toLowerCase())
  return type && enabledFileTypes.has(type.id) ? type.format : null
}

const isSupportedFile = (filePath) => {
  if (!filePath || !getFormat(filePath)) return false
  try {
    return fs.statSync(filePath).isFile()
  } catch {
    return false
  }
}

// 从命令行参数中挑出可打开的文件（Windows / Linux 双击文件时通过 argv 传入）
const extractFilesFromArgv = (argv = []) => argv
  .slice(1)
  .filter((arg) => typeof arg === 'string' && !arg.startsWith('-'))
  .map((arg) => path.resolve(arg))
  .filter(isSupportedFile)

const decodeText = (buffer) => {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return { text: buffer.subarray(3).toString('utf8'), encoding: 'UTF-8 (BOM)' }
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return { text: new TextDecoder('utf-16le').decode(buffer.subarray(2)), encoding: 'UTF-16 LE' }
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return { text: new TextDecoder('utf-16be').decode(buffer.subarray(2)), encoding: 'UTF-16 BE' }
  }
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(buffer), encoding: 'UTF-8' }
  } catch {
    // 常见于 Windows 记事本保存的中文文本
    try {
      return { text: new TextDecoder('gb18030').decode(buffer), encoding: 'GB18030' }
    } catch {
      return { text: buffer.toString('utf8'), encoding: 'UTF-8 (有损)' }
    }
  }
}

// 简单 YAML front-matter：只取 title / tags / created（或 date），其他字段原样保留在正文中不处理
const parseFrontMatter = (text) => {
  const match = text.match(/^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/)
  if (!match) return { frontMatter: null, body: text }
  const meta = {}
  const lines = match[1].split('\n')
  for (let i = 0; i < lines.length; i++) {
    const kv = lines[i].match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/)
    if (!kv) continue
    const key = kv[1].toLowerCase()
    let value = kv[2].trim()
    if (key === 'tags' || key === 'tag') {
      let tags = []
      if (value.startsWith('[') && value.endsWith(']')) {
        tags = value.slice(1, -1).split(',')
      } else if (value) {
        tags = value.split(/[,，\s]+/)
      } else {
        // YAML 列表写法
        while (i + 1 < lines.length && /^\s*-\s+/.test(lines[i + 1])) {
          tags.push(lines[++i].replace(/^\s*-\s+/, ''))
        }
      }
      meta.tags = tags.map((t) => t.trim().replace(/^['"#]|['"]$/g, '')).filter(Boolean)
    } else if (key === 'title') {
      meta.title = value.replace(/^['"]|['"]$/g, '')
    } else if ((key === 'created' || key === 'date') && !meta.created) {
      const created = value.replace(/^['"]|['"]$/g, '')
      if (created && !Number.isNaN(new Date(created).getTime())) meta.created = created
    }
  }
  return { frontMatter: meta, body: text.slice(match[0].length) }
}

const isExternalRef = (target) => /^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(target)

// 把 Markdown 里引用的本地图片（相对路径 / 绝对路径 / file://）内联为 data URL
const inlineLocalImages = (markdown, baseDir) => {
  let total = 0
  let missing = 0
  const cache = new Map()
  const toDataUrl = (rawTarget) => {
    let target = rawTarget.trim().replace(/^<|>$/g, '')
    try { target = decodeURI(target) } catch {}
    let absolute
    if (/^file:\/\//i.test(target)) {
      try { absolute = new URL(target).pathname } catch { return null }
      if (process.platform === 'win32') absolute = absolute.replace(/^\/([A-Za-z]:)/, '$1')
    } else if (isExternalRef(target)) {
      return null
    } else {
      absolute = path.isAbsolute(target) ? target : path.resolve(baseDir, target)
    }
    const mime = IMAGE_MIME[path.extname(absolute).toLowerCase()]
    if (!mime) return null
    if (cache.has(absolute)) return cache.get(absolute)
    let result = null
    try {
      const stat = fs.statSync(absolute)
      if (stat.isFile() && stat.size <= MAX_INLINE_IMAGE_BYTES && total + stat.size <= MAX_INLINE_IMAGES_TOTAL) {
        total += stat.size
        result = `data:${mime};base64,${fs.readFileSync(absolute).toString('base64')}`
      }
    } catch {
      missing += 1
    }
    cache.set(absolute, result)
    return result
  }

  const content = markdown
    // ![alt](path "title")
    .replace(/(!\[[^\]]*\]\()\s*(<[^>]+>|[^)\s]+)((?:\s+"[^"]*")?\s*\))/g, (all, head, target, tail) => {
      const dataUrl = toDataUrl(target)
      // 去掉可选的 "title"：导入时按 ![alt](data:...) 形式把图片落盘
      return dataUrl ? `${head}${dataUrl})` : all
    })
    // <img src="path">
    .replace(/(<img\b[^>]*?\ssrc=)(["'])([^"']+)\2/gi, (all, head, quote, target) => {
      const dataUrl = toDataUrl(target)
      return dataUrl ? `${head}${quote}${dataUrl}${quote}` : all
    })
  return { content, missingImages: missing }
}

const parseWhiteboard = (text) => {
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('不是有效的 Excalidraw 文件（JSON 解析失败）')
  }
  if (!data || !Array.isArray(data.elements)) {
    throw new Error('不是有效的 Excalidraw 文件（缺少 elements）')
  }
  return {
    elements: data.elements.filter((el) => el && !el.isDeleted),
    appState: { viewBackgroundColor: data.appState?.viewBackgroundColor || '#ffffff' },
    files: data.files && typeof data.files === 'object' ? data.files : {}
  }
}

// 把规范化为 \n 的文本按原文件的编码和换行符编码回去
const encodeText = (text, { encoding, eol }) => {
  const body = eol === '\r\n' ? text.replace(/\n/g, '\r\n') : text
  if (encoding === 'UTF-8 (BOM)') {
    return { buffer: Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(body, 'utf8')]), encoding }
  }
  if (encoding === 'UTF-16 LE') {
    return { buffer: Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(body, 'utf16le')]), encoding }
  }
  if (encoding === 'UTF-16 BE') {
    return { buffer: Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from(body, 'utf16le').swap16()]), encoding }
  }
  // GB18030 等 Node 无法编码的格式统一存为 UTF-8
  return { buffer: Buffer.from(body, 'utf8'), encoding: 'UTF-8' }
}

class ExternalFileService {
  constructor({ draftDirectory } = {}) {
    this.drafts = new ExternalFileDraftStore(draftDirectory)
    this.allowedPaths = new Set()
    this.pendingPaths = []
    this.deliver = null
    this.ready = false
  }

  // deliver(path) 负责为文件打开窗口；窗口管理器就绪（setReady）前的文件先排队
  attach(deliver) {
    this.deliver = deliver
  }

  setReady() {
    this.ready = true
    const list = this.pendingPaths
    this.pendingPaths = []
    list.forEach((filePath) => this.deliver?.(filePath))
  }

  // 只登记白名单（打开对话框的结果由渲染层自己打开）
  allow(filePath) {
    const resolved = path.resolve(String(filePath || ''))
    if (!isSupportedFile(resolved)) return null
    this.allowedPaths.add(resolved)
    return resolved
  }

  // 系统交来的文件：登记白名单，渲染层就绪则直接投递，否则排队
  open(filePath) {
    const resolved = this.allow(filePath)
    if (!resolved) return false
    if (this.ready && this.deliver?.(resolved)) return true
    if (!this.pendingPaths.includes(resolved)) this.pendingPaths.push(resolved)
    return true
  }

  isAllowed(filePath) {
    return this.allowedPaths.has(path.resolve(String(filePath || '')))
  }

  resolveAllowed(filePath) {
    const resolved = path.resolve(String(filePath || ''))
    if (!this.isAllowed(resolved)) throw new Error('无权访问该文件')
    return resolved
  }

  stageDraft(filePath, draft) {
    const resolved = this.resolveAllowed(filePath)
    if (draft?.format !== getFormat(resolved)) throw new Error('草稿与文件类型不匹配')
    return this.drafts.stage(resolved, draft)
  }

  clearDraft(filePath, token) { return this.drafts.clear(this.resolveAllowed(filePath), token) }

  // Office / PDF / 网页等需要异步转换，返回 Promise；可编辑格式同步返回
  read(filePath) {
    if (getFormat(this.resolveAllowed(filePath)) === 'document') return this.readDocument(filePath)
    const data = this.readFile(filePath)
    try {
      return { ...data, draft: this.drafts.read(data.path) }
    } catch (error) {
      if (error.code === 'ENOENT') throw error
      return { ...data, draft: null, draftError: `恢复草稿已损坏，已另存为 ${this.drafts.quarantine(data.path)}` }
    }
  }

  // 读取文件字节和通用信息（大小、修订、时间）
  loadFile(resolved, limit) {
    const stat = fs.statSync(resolved)
    if (stat.size > limit) {
      throw new Error(`文件过大（${(stat.size / 1024 / 1024).toFixed(1)} MB），最多支持 ${limit / 1024 / 1024} MB`)
    }
    const buffer = fs.readFileSync(resolved)
    return {
      buffer,
      base: {
        path: resolved,
        name: path.basename(resolved),
        title: path.basename(resolved, path.extname(resolved)),
        ext: path.extname(resolved).toLowerCase(),
        format: getFormat(resolved),
        size: stat.size,
        modifiedAt: stat.mtimeMs,
        revision: fileRevision(buffer),
        // 复制过的文件创建时间是复制那一刻，修改时间通常保留，取较早的那个
        createdAt: stat.birthtimeMs > 0 ? Math.min(stat.birthtimeMs, stat.mtimeMs) : stat.mtimeMs,
        fileUrl: pathToFileURL(resolved).href
      }
    }
  }

  // Office / WPS / PDF / 网页：转换为 Markdown 只读预览（图片内联），导入为笔记后可编辑
  async readDocument(filePath) {
    const resolved = this.resolveAllowed(filePath)
    const { buffer, base } = this.loadFile(resolved, MAX_DOCUMENT_BYTES)
    const result = await convertDocumentIsolated({ buffer, name: base.name, baseDir: path.dirname(resolved) })
    return {
      ...base,
      title: result.title || base.title,
      sourceType: result.sourceType,
      sourceLabel: result.sourceLabel,
      skippedImages: result.skippedImages,
      writable: false,
      raw: result.markdown,
      content: result.markdown,
      draft: null
    }
  }

  readFile(filePath) {
    const resolved = this.resolveAllowed(filePath)
    const format = getFormat(resolved)
    if (!format || format === 'document') throw new Error('不支持的文件格式')

    const { buffer, base: info } = this.loadFile(resolved, format === 'whiteboard' ? MAX_WHITEBOARD_BYTES : MAX_TEXT_BYTES)
    const { text: rawText, encoding } = decodeText(buffer)
    const eol = /\r\n/.test(rawText) ? '\r\n' : '\n'
    const text = rawText.replace(/\r\n?/g, '\n')
    let writable = false
    try {
      fs.accessSync(resolved, fs.constants.W_OK)
      writable = true
    } catch {}

    const base = { ...info, encoding, eol, writable }

    if (format === 'whiteboard') {
      return { ...base, whiteboard: parseWhiteboard(text) }
    }
    // raw：编辑模式用的原文（含 front-matter、图片路径不内联）；content：预览用
    if (format === 'text') {
      return { ...base, raw: text, content: text }
    }
    const { frontMatter, body } = parseFrontMatter(text)
    const { content, missingImages } = inlineLocalImages(body, path.dirname(resolved))
    return {
      ...base,
      title: frontMatter?.title || base.title,
      tags: frontMatter?.tags || [],
      frontMatterCreated: frontMatter?.created || null,
      raw: text,
      content,
      missingImages
    }
  }

  // 编辑中的草稿生成预览内容（去掉 front-matter、内联本地图片），不写盘
  render(filePath, text) {
    const resolved = this.resolveAllowed(filePath)
    const normalized = String(text ?? '').replace(/\r\n?/g, '\n')
    if (getFormat(resolved) !== 'markdown') return { content: normalized, missingImages: 0 }
    const { body } = parseFrontMatter(normalized)
    return inlineLocalImages(body, path.dirname(resolved))
  }

  // 写盘前检查：可写、且没有在外部被改过（expectedMtime 为打开 / 上次保存时的修改时间）
  checkWritable(resolved, { expectedMtime, expectedRevision, force } = {}, previous) {
    try {
      fs.accessSync(resolved, fs.constants.W_OK)
    } catch {
      throw new Error('文件是只读的，无法保存')
    }
    const stat = fs.statSync(resolved)
    if (!force && (expectedRevision
      ? fileRevision(previous || fs.readFileSync(resolved)) !== expectedRevision
      : expectedMtime != null && Math.abs(stat.mtimeMs - expectedMtime) > 1)) {
      return { conflict: true, modifiedAt: stat.mtimeMs }
    }
    return null
  }

  // 保留符号链接，替换真实目标；临时写入失败时原文件仍完整。
  // 强制覆盖只接受用户已确认的旧冲突，写入期间出现的新改动仍须重试。
  replaceFile(resolved, previous, buffer) {
    const target = fs.realpathSync(resolved)
    const original = fs.statSync(target)
    if (original.nlink > 1) throw new Error('文件有多个硬链接，无法安全替换；请另存为独立文件后编辑')
    writeFileAtomicSync(target, buffer, {
      mode: original.mode & 0o777,
      beforeCommit: () => {
        const current = fs.statSync(resolved)
        if (fs.realpathSync(resolved) !== target || current.ino !== original.ino || current.dev !== original.dev ||
          !fs.readFileSync(resolved).equals(previous)) {
          throw new Error('文件在保存期间被其他程序修改，请重新载入或重试')
        }
      }
    })
    const stat = fs.statSync(target)
    return { modifiedAt: stat.mtimeMs, size: stat.size, revision: fileRevision(buffer) }
  }

  write(filePath, text, options = {}) {
    const resolved = this.resolveAllowed(filePath)
    const format = getFormat(resolved)
    if (!format || format === 'whiteboard' || format === 'document') throw new Error('不支持的文件格式')
    const previous = fs.readFileSync(resolved)
    const conflict = this.checkWritable(resolved, options, previous)
    if (conflict) return conflict

    // 按磁盘上当前文件的编码和换行符写回
    const current = decodeText(previous)
    const eol = /\r\n/.test(current.text) ? '\r\n' : '\n'
    const normalized = String(text ?? '').replace(/\r\n?/g, '\n')
    const { buffer, encoding } = encodeText(normalized, { encoding: current.encoding, eol })
    return {
      ...this.replaceFile(resolved, previous, buffer),
      encoding,
      convertedFrom: encoding !== current.encoding ? current.encoding : null
    }
  }

  // 白板：只替换 elements / files / 背景色，文件里其他字段（appState 其余项、source 等）原样保留
  writeWhiteboard(filePath, scene = {}, options = {}) {
    const resolved = this.resolveAllowed(filePath)
    if (getFormat(resolved) !== 'whiteboard') throw new Error('不是白板文件')
    const previous = fs.readFileSync(resolved)
    const conflict = this.checkWritable(resolved, options, previous)
    if (conflict) return conflict

    if (!Array.isArray(scene.elements) || !scene.files || typeof scene.files !== 'object' || Array.isArray(scene.files)) {
      throw new Error('白板保存数据不完整')
    }
    const text = decodeText(previous).text
    parseWhiteboard(text)
    const data = JSON.parse(text)
    const next = {
      ...data,
      type: data.type || 'excalidraw',
      version: data.version || 2,
      source: data.source || 'Flota',
      elements: scene.elements,
      appState: {
        ...(data.appState && typeof data.appState === 'object' ? data.appState : {}),
        ...(scene.appState?.viewBackgroundColor ? { viewBackgroundColor: scene.appState.viewBackgroundColor } : {})
      },
      files: scene.files
    }
    return this.replaceFile(resolved, previous, Buffer.from(JSON.stringify(next, null, 2)))
  }
}

module.exports = {
  ExternalFileService,
  SUPPORTED_EXTENSIONS: [...TYPE_BY_EXT.keys()].map((ext) => ext.slice(1)),
  FILE_TYPES,
  FILE_TYPES_SETTING_KEY,
  FILE_TYPES_KNOWN_KEY,
  LEGACY_KNOWN_TYPES,
  setEnabledFileTypes,
  getEnabledFileTypes,
  getEnabledExtensions,
  extractFilesFromArgv,
  isSupportedFile
}
