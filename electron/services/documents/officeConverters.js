// Office / WPS / ODF / EPUB / RTF → Markdown。只做读取，不回写原格式。
const path = require('path')
const { htmlToMarkdown, decodeHtml } = require('./htmlConverter')
const { textToMarkdown, markdownTable, mimeOfName, collapseBlankLines, decodeBuffer, escapeLine, escapeInline } = require('./textUtils')

const MAX_SHEET_ROWS = 5000
const MAX_SHEET_CELLS = 200000

const xmlDocument = (xml) => {
  const { DOMParser } = require('linkedom')
  return new DOMParser().parseFromString(xml, 'text/xml')
}
// linkedom 的 XML 节点名带命名空间前缀（a:p），按本地名匹配
const localName = (node) => String(node?.tagName || '').split(':').pop()
const elementChildren = (node) => Array.from(node?.childNodes || []).filter((child) => child.nodeType === 1)
const descendants = (node, name) => {
  const found = []
  const walk = (current) => elementChildren(current).forEach((child) => {
    if (localName(child) === name) found.push(child)
    walk(child)
  })
  walk(node)
  return found
}
const attr = (node, name) => {
  for (const item of Array.from(node?.attributes || [])) if (item.name === name || item.name.split(':').pop() === name) return item.value
  return null
}

const zipOf = (buffer) => {
  const AdmZip = require('adm-zip')
  const zip = new AdmZip(Buffer.from(buffer))
  const read = (name) => zip.getEntry(name)?.getData() || null
  return { zip, read, text: (name) => read(name)?.toString('utf8') ?? null, has: (name) => Boolean(zip.getEntry(name)) }
}

// 关系文件 Id → 目标路径（相对 part 所在目录解析）
const relationships = (zip, partPath) => {
  const relsPath = path.posix.join(path.posix.dirname(partPath), '_rels', `${path.posix.basename(partPath)}.rels`)
  const xml = zip.text(relsPath)
  const map = new Map()
  if (!xml) return map
  for (const rel of descendants(xmlDocument(xml), 'Relationship')) {
    const target = attr(rel, 'Target')
    if (!target || attr(rel, 'TargetMode') === 'External') continue
    map.set(attr(rel, 'Id'), { type: attr(rel, 'Type') || '', path: target.startsWith('/') ? target.slice(1) : path.posix.normalize(path.posix.join(path.posix.dirname(partPath), target)) })
  }
  return map
}

// 同一页的多行：连续列表项用单换行，其他行之间空一行（单换行在 Markdown 里会并成一段）
const joinLines = (lines) => lines.reduce((text, line, index) => {
  if (!index) return line
  const list = /^\s*- /
  return text + (list.test(line) && list.test(lines[index - 1]) ? '\n' : '\n\n') + line
}, '')

// ── Word / WPS 文字 ──

const docxToMarkdown = async (buffer, { budget }) => {
  const mammoth = require('mammoth')
  const result = await mammoth.convertToHtml({ buffer: Buffer.from(buffer) }, {
    convertImage: mammoth.images.imgElement(async (image) => {
      const data = await image.read()
      const src = budget.dataUrl(data, image.contentType)
      return src ? { src } : { src: '' }
    }),
  })
  const { markdown } = htmlToMarkdown(result.value, { budget, preferArticle: false })
  const core = zipOf(buffer).text('docProps/core.xml')
  const title = core ? descendants(xmlDocument(core), 'title')[0]?.textContent?.trim() : ''
  return { title, markdown }
}

// .doc / .wps / .wpt：Word 97 二进制结构，只能提取文字
const binaryWordToMarkdown = async (buffer) => {
  const WordExtractor = require('word-extractor')
  const document = await new WordExtractor().extract(Buffer.from(buffer))
  const body = document.getBody() || ''
  if (!body.trim()) throw new Error('没有读到文字内容')
  return { markdown: textToMarkdown(body.replace(/\t/g, '    ')) }
}

// ── 表格：Excel / WPS 表格 / ODS / CSV ──

const workbookToMarkdown = (workbook) => {
  const XLSX = require('xlsx')
  const sections = []
  const notes = []
  let cells = 0
  workbook.SheetNames.forEach((name, index) => {
    if (workbook.Workbook?.Sheets?.[index]?.Hidden) { notes.push(`隐藏工作表「${name}」未显示`); return }
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: false, defval: '', blankrows: false })
    if (!rows.length) return
    let shown = rows.slice(0, MAX_SHEET_ROWS)
    const width = Math.max(...shown.map((row) => row.length), 1)
    if (cells + shown.length * width > MAX_SHEET_CELLS) shown = shown.slice(0, Math.max(1, Math.floor((MAX_SHEET_CELLS - cells) / width)))
    cells += shown.length * width
    const table = markdownTable(shown)
    if (!table) return
    const truncated = shown.length < rows.length ? `\n\n> 共 ${rows.length} 行，只显示前 ${shown.length} 行` : ''
    sections.push(`${workbook.SheetNames.length > 1 ? `## ${escapeInline(name)}\n\n` : ''}${table}${truncated}`)
  })
  if (!sections.length) throw new Error('表格里没有内容')
  return { markdown: [...sections, ...notes.map((note) => `> ${note}`)].join('\n\n') }
}

const spreadsheetToMarkdown = (buffer) => {
  const XLSX = require('xlsx')
  return workbookToMarkdown(XLSX.read(Buffer.from(buffer), { type: 'buffer', cellDates: true, sheetRows: MAX_SHEET_ROWS + 1 }))
}

// CSV 先按编码解码，raw 保留 001 这类前导零
const csvToMarkdown = (buffer, ext) => {
  const XLSX = require('xlsx')
  const text = decodeBuffer(buffer)
  return workbookToMarkdown(XLSX.read(text, { type: 'string', raw: true, sheetRows: MAX_SHEET_ROWS + 1, ...(ext === '.tsv' ? { FS: '\t' } : {}) }))
}

// ── 演示：PowerPoint / WPS 演示 ──

const paragraphText = (paragraph) => descendants(paragraph, 't').map((node) => node.textContent).join('')

const pptxShape = (shape) => {
  const placeholder = descendants(shape, 'ph')[0]
  const isTitle = /title/i.test(attr(placeholder, 'type') || '')
  const texts = descendants(shape, 'p').map((paragraph) => paragraphText(paragraph).trim()).filter(Boolean)
  const lines = descendants(shape, 'p').map((paragraph) => {
    const text = paragraphText(paragraph).trim()
    if (!text) return ''
    const level = Number(attr(descendants(paragraph, 'pPr')[0], 'lvl') || 0)
    const bullet = !isTitle && placeholder && !/title/i.test(attr(placeholder, 'type') || '')
    return bullet ? `${'  '.repeat(level)}- ${escapeLine(text)}` : escapeLine(text)
  }).filter(Boolean)
  return { isTitle, texts, lines }
}

const pptxToMarkdown = (buffer, { budget }) => {
  const zip = zipOf(buffer)
  const presentation = zip.text('ppt/presentation.xml')
  if (!presentation) throw new Error('不是有效的 PowerPoint 文件')
  const rels = relationships(zip, 'ppt/presentation.xml')
  const slidePaths = descendants(xmlDocument(presentation), 'sldId').map((node) => rels.get(attr(node, 'r:id') || attr(node, 'id'))?.path).filter(Boolean)

  const sections = slidePaths.map((slidePath, index) => {
    const xml = zip.text(slidePath)
    if (!xml) return ''
    const slideRels = relationships(zip, slidePath)
    const tree = descendants(xmlDocument(xml), 'spTree')[0]
    let title = ''
    const blocks = []
    const visit = (node) => elementChildren(node).forEach((child) => {
      const name = localName(child)
      if (name === 'grpSp') return visit(child)
      if (name === 'sp') {
        const { isTitle, texts, lines } = pptxShape(child)
        if (isTitle && !title) title = texts.join(' ')
        else if (lines.length) blocks.push(joinLines(lines))
      } else if (name === 'pic') {
        const target = slideRels.get(attr(descendants(child, 'blip')[0], 'r:embed') || attr(descendants(child, 'blip')[0], 'embed'))
        const data = target && zip.read(target.path)
        const src = data && budget.dataUrl(data, mimeOfName(target.path))
        if (src) blocks.push(`![](${src})`)
      } else if (name === 'graphicFrame') {
        const table = descendants(child, 'tbl')[0]
        if (table) blocks.push(markdownTable(descendants(table, 'tr').map((row) => descendants(row, 'tc').map((cell) => descendants(cell, 'p').map(paragraphText).join('\n')))))
      }
    })
    visit(tree)
    const notesTarget = [...slideRels.values()].find((rel) => /notesSlide$/.test(rel.type))
    const notesXml = notesTarget && zip.text(notesTarget.path)
    if (notesXml) {
      const noteShapes = descendants(xmlDocument(notesXml), 'sp').filter((shape) => attr(descendants(shape, 'ph')[0], 'type') === 'body')
      const notes = noteShapes.flatMap((shape) => descendants(shape, 'p').map(paragraphText)).map((text) => text.trim()).filter(Boolean)
      if (notes.length) blocks.push(notes.map((line) => `> ${escapeLine(line)}`).join('\n>\n'))
    }
    return [`## ${title ? escapeInline(title) : `第 ${index + 1} 页`}`, ...blocks].join('\n\n')
  }).filter(Boolean)
  if (!sections.length) throw new Error('演示文稿里没有幻灯片')
  return { markdown: sections.join('\n\n') }
}

// .ppt / .dps / .dpt：PowerPoint 97 二进制。按 SlideListWithText 的幻灯片顺序取占位符文字，
// 再按持久化目录找到每页的 Slide 容器，补上文本框里的文字。
const RT = { SLIDE: 0x03ee, SLIDE_LIST: 0x0ff0, SLIDE_PERSIST: 0x03f3, TEXT_HEADER: 0x0f9f, TEXT_CHARS: 0x0fa0, TEXT_BYTES: 0x0fa8, PERSIST_DIR: 0x1772, NOTES: 0x03f0, MAIN_MASTER: 0x03f8 }

const readRecords = (data, start, end, visit, depth = 0) => {
  let offset = start
  while (offset + 8 <= end) {
    const verInst = data.readUInt16LE(offset)
    const type = data.readUInt16LE(offset + 2)
    const length = data.readUInt32LE(offset + 4)
    const bodyStart = offset + 8
    const bodyEnd = Math.min(bodyStart + length, end)
    const isContainer = (verInst & 0x0f) === 0x0f
    if (visit({ type, instance: verInst >> 4, bodyStart, bodyEnd, isContainer, depth }) !== false && isContainer && depth < 32) {
      readRecords(data, bodyStart, bodyEnd, visit, depth + 1)
    }
    if (length === 0 && !isContainer && bodyStart === offset) break
    offset = bodyStart + length
  }
}

const atomText = (data, record) => (record.type === RT.TEXT_CHARS
  ? data.subarray(record.bodyStart, record.bodyEnd).toString('utf16le')
  : data.subarray(record.bodyStart, record.bodyEnd).toString('latin1')).replace(/\r/g, '\n').replace(/\u000b/g, '\n')

const binaryPptToMarkdown = (buffer) => {
  const CFB = require('cfb')
  const container = CFB.read(Buffer.from(buffer), { type: 'buffer' })
  const entry = CFB.find(container, 'PowerPoint Document')
  if (!entry?.content) throw new Error('不是有效的演示文稿')
  const data = Buffer.from(entry.content)

  // 持久化目录：persistId → 记录偏移（增量保存时后写的覆盖先写的）
  const persist = new Map()
  readRecords(data, 0, data.length, (record) => {
    if (record.type !== RT.PERSIST_DIR) return
    let offset = record.bodyStart
    while (offset + 4 <= record.bodyEnd) {
      const header = data.readUInt32LE(offset)
      const startId = header & 0xfffff
      const count = header >>> 20
      for (let i = 0; i < count && offset + 8 + i * 4 <= record.bodyEnd; i++) persist.set(startId + i, data.readUInt32LE(offset + 4 + i * 4))
      offset += 4 + count * 4
    }
  })

  const slides = []
  readRecords(data, 0, data.length, (record) => {
    if (record.type !== RT.SLIDE_LIST) return record.type !== RT.SLIDE && record.type !== RT.NOTES && record.type !== RT.MAIN_MASTER
    if (record.instance !== 0) return false
    let current = null
    let textType = null
    readRecords(data, record.bodyStart, record.bodyEnd, (child) => {
      if (child.type === RT.SLIDE_PERSIST) {
        current = { persistId: data.readUInt32LE(child.bodyStart), title: '', lines: [] }
        slides.push(current)
      } else if (child.type === RT.TEXT_HEADER) {
        textType = data.readUInt32LE(child.bodyStart)
      } else if (current && (child.type === RT.TEXT_CHARS || child.type === RT.TEXT_BYTES)) {
        const text = atomText(data, child).trim()
        if (!text) return
        if ((textType === 0 || textType === 6) && !current.title) current.title = text.replace(/\n+/g, ' ')
        else current.lines.push(...text.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => (textType === 1 || textType === 5 || textType === 7 ? `- ${escapeLine(line)}` : escapeLine(line))))
      }
    }, 1)
    return false
  })

  // 每页 Slide 容器里的文本框文字（占位符文字已在上面取到，按内容去重）
  for (const slide of slides) {
    const offset = persist.get(slide.persistId)
    if (offset === undefined || offset + 8 > data.length || data.readUInt16LE(offset + 2) !== RT.SLIDE) continue
    const seen = new Set([slide.title, ...slide.lines.map((line) => line.replace(/^- /, ''))])
    readRecords(data, offset + 8, Math.min(offset + 8 + data.readUInt32LE(offset + 4), data.length), (record) => {
      if (record.type !== RT.TEXT_CHARS && record.type !== RT.TEXT_BYTES) return
      atomText(data, record).split('\n').map((line) => line.trim()).filter(Boolean).forEach((line) => {
        const escaped = escapeLine(line)
        if (!seen.has(line) && !seen.has(escaped)) { seen.add(escaped); slide.lines.push(escaped) }
      })
    })
  }

  const sections = slides.map((slide, index) => [`## ${slide.title ? escapeInline(slide.title) : `第 ${index + 1} 页`}`, joinLines(slide.lines)].filter(Boolean).join('\n\n'))
  if (!sections.length) throw new Error('演示文稿里没有读到文字')
  return { markdown: sections.join('\n\n') }
}

// ── OpenDocument：odt / odp（ods 走表格） ──

const odfInline = (node) => Array.from(node.childNodes || []).map((child) => {
  if (child.nodeType === 3) return child.textContent
  const name = localName(child)
  if (name === 's') return ' '.repeat(Number(attr(child, 'c') || 1))
  if (name === 'tab') return '    '
  if (name === 'line-break') return '\n'
  if (name === 'note' || name === 'annotation') return ''
  return odfInline(child)
}).join('')

const odfBlocks = (node, zip, budget, depth = 0) => elementChildren(node).flatMap((child) => {
  const name = localName(child)
  if (name === 'h') return [`${'#'.repeat(Math.min(6, Number(attr(child, 'outline-level') || 1) + 1))} ${escapeInline(odfInline(child).trim())}`]
  if (name === 'p') {
    const images = descendants(child, 'image').map((image) => {
      const href = attr(image, 'href')
      const data = href && zip.read(href)
      const src = data && budget.dataUrl(data, mimeOfName(href))
      return src ? `![](${src})` : ''
    }).filter(Boolean)
    const text = odfInline(child).trim()
    return [text ? escapeLine(text) : '', ...images].filter(Boolean)
  }
  if (name === 'list') {
    return [descendants(child, 'list-item').filter((item) => item.parentNode === child).map((item) => {
      const [first, ...rest] = odfBlocks(item, zip, budget, depth + 1)
      return [`${'  '.repeat(depth)}- ${first || ''}`, ...rest].join('\n')
    }).join('\n')]
  }
  if (name === 'table') return [markdownTable(descendants(child, 'table-row').map((row) => descendants(row, 'table-cell').map((cell) => descendants(cell, 'p').map(odfInline).join('\n'))))]
  if (name === 'page') {
    const title = attr(child, 'name')
    return [`## ${escapeInline(title || '幻灯片')}`, ...odfBlocks(child, zip, budget, depth)]
  }
  if (['section', 'frame', 'text-box', 'custom-shape', 'g', 'presentation', 'text', 'body'].includes(name)) return odfBlocks(child, zip, budget, depth)
  return []
})

const odfToMarkdown = (buffer, { budget }) => {
  const zip = zipOf(buffer)
  const content = zip.text('content.xml')
  if (!content) throw new Error('不是有效的 OpenDocument 文件')
  const body = descendants(xmlDocument(content), 'body')[0]
  const blocks = odfBlocks(body, zip, budget).filter(Boolean)
  if (!blocks.length) throw new Error('文档里没有内容')
  return { markdown: blocks.join('\n\n') }
}

// ── EPUB ──

const epubToMarkdown = (buffer, { budget }) => {
  const zip = zipOf(buffer)
  const container = zip.text('META-INF/container.xml')
  const opfPath = container && attr(descendants(xmlDocument(container), 'rootfile')[0], 'full-path')
  const opfXml = opfPath && zip.text(opfPath)
  if (!opfXml) throw new Error('不是有效的 EPUB 电子书')
  const opf = xmlDocument(opfXml)
  const base = path.posix.dirname(opfPath)
  const manifest = new Map(descendants(opf, 'item').map((item) => [attr(item, 'id'), path.posix.normalize(path.posix.join(base, decodeURIComponent(attr(item, 'href') || '')))]))
  const title = descendants(opf, 'title')[0]?.textContent?.trim() || ''
  const chapters = descendants(opf, 'itemref').map((ref) => manifest.get(attr(ref, 'idref'))).filter(Boolean).map((chapterPath) => {
    const html = zip.read(chapterPath)
    if (!html) return ''
    const resolveImage = (src) => {
      if (/^(https?:|data:image\/)/i.test(src)) return src
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(chapterPath), decodeURIComponent(src.split(/[?#]/)[0])))
      const data = zip.read(target)
      return data ? budget.dataUrl(data, mimeOfName(target)) : null
    }
    return htmlToMarkdown(decodeHtml(html), { resolveImage, budget, preferArticle: false }).markdown
  }).filter(Boolean)
  if (!chapters.length) throw new Error('电子书里没有正文')
  return { title, markdown: chapters.join('\n\n---\n\n') }
}

// ── RTF ──

const RTF_SKIP = new Set(['fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'header', 'footer', 'headerl', 'headerr', 'headerf', 'footerl', 'footerr', 'footerf',
  'xmlnstbl', 'listtable', 'listoverridetable', 'rsidtbl', 'generator', 'themedata', 'colorschememapping', 'datastore', 'latentstyles', 'object', 'fldinst', 'bkmkstart', 'bkmkend', 'filetbl', 'revtbl', 'pgdsctbl'])
const CODEPAGES = { 936: 'gb18030', 950: 'big5', 932: 'shift_jis', 949: 'euc-kr', 1250: 'windows-1250', 1251: 'windows-1251', 1252: 'windows-1252', 10000: 'macintosh', 65001: 'utf-8' }

const rtfToMarkdown = (buffer) => {
  const source = Buffer.from(buffer).toString('latin1')
  if (!source.startsWith('{\\rtf')) throw new Error('不是有效的 RTF 文件')
  let decoder = new TextDecoder('windows-1252')
  const out = []
  let pendingBytes = []
  const flushBytes = () => { if (pendingBytes.length) { out.push(decoder.decode(Uint8Array.from(pendingBytes))); pendingBytes = [] } }
  const stack = []
  let state = { skip: false, uc: 1 }
  let skipChars = 0
  for (let i = 0; i < source.length; i++) {
    const char = source[i]
    if (char === '{') { stack.push(state); state = { ...state }; continue }
    if (char === '}') { flushBytes(); state = stack.pop() || state; continue }
    if (char === '\\') {
      const next = source[i + 1]
      if (next === '\'') {
        const byte = parseInt(source.slice(i + 2, i + 4), 16)
        i += 3
        if (skipChars > 0) { skipChars--; continue }
        if (!state.skip && !Number.isNaN(byte)) pendingBytes.push(byte)
        continue
      }
      if (next === '*') { state.skip = true; i++; continue }
      if (/[\\{}]/.test(next)) { flushBytes(); if (!state.skip) out.push(next); i++; continue }
      if (next === '~') { flushBytes(); if (!state.skip) out.push(' '); i++; continue }
      if (next === '\n' || next === '\r') { flushBytes(); if (!state.skip) out.push('\n'); i++; continue }
      const match = /^([a-zA-Z]+)(-?\d+)? ?/.exec(source.slice(i + 1, i + 40))
      if (!match) { i++; continue }
      i += match[0].length
      flushBytes()
      const [, word, param] = match
      if (RTF_SKIP.has(word)) { state.skip = true; continue }
      if (word === 'ansicpg' && CODEPAGES[param]) { try { decoder = new TextDecoder(CODEPAGES[param]) } catch {} }
      else if (word === 'uc') state.uc = Number(param || 1)
      else if (word === 'u' && !state.skip) { let code = Number(param); if (code < 0) code += 65536; out.push(String.fromCharCode(code)); skipChars = state.uc }
      else if (!state.skip && (word === 'par' || word === 'line' || word === 'row' || word === 'sect' || word === 'page')) out.push('\n')
      else if (!state.skip && (word === 'tab' || word === 'cell')) out.push('\t')
      continue
    }
    if (char === '\r' || char === '\n') continue
    if (skipChars > 0) { skipChars--; continue }
    if (!state.skip) { flushBytes(); out.push(char) }
  }
  flushBytes()
  const text = out.join('')
  if (!text.trim()) throw new Error('没有读到文字内容')
  return { markdown: textToMarkdown(text.replace(/\t/g, '    ')) }
}

module.exports = {
  docxToMarkdown, binaryWordToMarkdown, spreadsheetToMarkdown, csvToMarkdown, pptxToMarkdown,
  binaryPptToMarkdown, odfToMarkdown, epubToMarkdown, rtfToMarkdown, zipOf, collapseBlankLines,
}
