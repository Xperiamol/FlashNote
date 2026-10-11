// 文档转换入口：按文件内容（而不是只看扩展名）识别真实格式，统一转成 Markdown。
// 图片内联为 data URL，导入为笔记时由渲染层落盘。
const path = require('path')
const { ImageBudget } = require('./textUtils')
const { htmlToMarkdown, mhtToMarkdown, decodeHtml } = require('./htmlConverter')
const office = require('./officeConverters')

const SOURCE_LABELS = {
  html: '网页', mht: '网页（单文件）', docx: 'Word 文档', doc: 'Word 97-2003 文档', wps: 'WPS 文字',
  xlsx: 'Excel 表格', xls: 'Excel 97-2003 表格', et: 'WPS 表格', ods: 'OpenDocument 表格', csv: 'CSV 表格',
  pptx: 'PowerPoint 演示', ppt: 'PowerPoint 97-2003 演示', dps: 'WPS 演示', odt: 'OpenDocument 文本',
  odp: 'OpenDocument 演示', pdf: 'PDF', rtf: 'RTF 文档', epub: 'EPUB 电子书',
}

const EXT_KIND = {
  '.html': 'html', '.htm': 'html', '.xhtml': 'html', '.mht': 'mht', '.mhtml': 'mht',
  '.docx': 'docx', '.docm': 'docx', '.dotx': 'docx', '.doc': 'doc', '.dot': 'doc', '.wps': 'wps', '.wpt': 'wps',
  '.xlsx': 'xlsx', '.xlsm': 'xlsx', '.xls': 'xls', '.et': 'et', '.ett': 'et', '.ods': 'ods', '.csv': 'csv', '.tsv': 'csv',
  '.pptx': 'pptx', '.ppsx': 'pptx', '.ppt': 'ppt', '.pps': 'ppt', '.dps': 'dps', '.dpt': 'dps',
  '.odt': 'odt', '.odp': 'odp', '.pdf': 'pdf', '.rtf': 'rtf', '.epub': 'epub',
}
const DOCUMENT_EXTENSIONS = Object.keys(EXT_KIND).map((ext) => ext.slice(1))

const OLE_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])

// 返回真实容器类型：zip 包看内部结构，OLE 看数据流名，其余看文件头
const sniff = (buffer, ext) => {
  const head = buffer.subarray(0, 8)
  if (head.subarray(0, 4).equals(Buffer.from('PK\x03\x04', 'latin1'))) {
    const { has, text } = office.zipOf(buffer)
    const mimetype = (text('mimetype') || '').trim()
    if (has('word/document.xml')) return 'docx'
    if (has('xl/workbook.xml')) return 'xlsx'
    if (has('ppt/presentation.xml')) return 'pptx'
    if (mimetype === 'application/epub+zip') return 'epub'
    if (/opendocument\.text/.test(mimetype)) return 'odt'
    if (/opendocument\.spreadsheet/.test(mimetype)) return 'ods'
    if (/opendocument\.presentation/.test(mimetype)) return 'odp'
    throw new Error('无法识别这个压缩格式的文档')
  }
  if (head.equals(OLE_MAGIC)) {
    const CFB = require('cfb')
    const container = CFB.read(buffer, { type: 'buffer' })
    if (CFB.find(container, 'WordDocument')) return 'ole-word'
    if (CFB.find(container, 'Workbook') || CFB.find(container, 'Book')) return 'ole-sheet'
    if (CFB.find(container, 'PowerPoint Document')) return 'ole-ppt'
    if (CFB.find(container, 'EncryptedPackage')) throw new Error('文档已加密，请先在 Office / WPS 中取消密码')
    throw new Error('无法识别这个 Office 二进制文档')
  }
  const start = buffer.subarray(0, 1024).toString('latin1').replace(/^﻿|^\xEF\xBB\xBF/, '').trimStart()
  if (start.startsWith('%PDF') || buffer.subarray(0, 1024).includes('%PDF-')) return 'pdf'
  if (start.startsWith('{\\rtf')) return 'rtf'
  if (/^MIME-Version:|^From:|^Content-Type:\s*multipart\/related/im.test(start) && EXT_KIND[ext] === 'mht') return 'mht'
  if (EXT_KIND[ext] === 'csv') return 'csv'
  if (EXT_KIND[ext] === 'html' || /^<(!doctype html|html|head|body)/i.test(start)) return 'html'
  // WPS / Word 有时把网页或 RTF 存成 .doc
  if (/<html/i.test(start)) return 'html'
  throw new Error('无法识别文件格式')
}

/**
 * @param {{ buffer: Buffer|Uint8Array, name: string, baseDir?: string }} input
 * @returns {Promise<{ title: string, markdown: string, sourceType: string, sourceLabel: string, skippedImages: number }>}
 */
const convertDocument = async ({ buffer: input, name, baseDir }) => {
  const buffer = Buffer.from(input)
  const ext = path.extname(String(name || '')).toLowerCase()
  const budget = new ImageBudget()
  const kind = sniff(buffer, ext)
  let result
  switch (kind) {
    case 'html': result = htmlToMarkdown(decodeHtml(buffer), { baseDir, budget }); break
    case 'mht': result = mhtToMarkdown(buffer, { budget }); break
    case 'docx': result = await office.docxToMarkdown(buffer, { budget }); break
    case 'ole-word': result = await office.binaryWordToMarkdown(buffer); break
    case 'xlsx': case 'ods': case 'ole-sheet': result = office.spreadsheetToMarkdown(buffer); break
    case 'csv': result = office.csvToMarkdown(buffer, ext); break
    case 'pptx': result = office.pptxToMarkdown(buffer, { budget }); break
    case 'ole-ppt': result = office.binaryPptToMarkdown(buffer); break
    case 'odt': case 'odp': result = office.odfToMarkdown(buffer, { budget }); break
    case 'epub': result = office.epubToMarkdown(buffer, { budget }); break
    case 'rtf': result = office.rtfToMarkdown(buffer); break
    case 'pdf': result = await require('./pdfConverter').pdfToMarkdown(buffer); break
    default: throw new Error('无法识别文件格式')
  }
  const markdown = office.collapseBlankLines(result.markdown)
  if (!markdown) throw new Error('文件里没有可显示的内容')
  // 标签按扩展名显示（WPS 文件内部可能是 Word 格式，但用户认的是 WPS）
  const sourceType = EXT_KIND[ext] || kind.replace(/^ole-/, '')
  return {
    // Office / PDF 的元数据标题常是模板或导出工具留下的，只采用网页和电子书的标题
    title: ['html', 'mht', 'epub'].includes(sourceType) ? String(result.title || '').trim() : '',
    markdown,
    sourceType,
    sourceLabel: SOURCE_LABELS[sourceType] || '文档',
    skippedImages: budget.skipped,
  }
}

module.exports = { convertDocument, DOCUMENT_EXTENSIONS, EXT_KIND, sniff }
