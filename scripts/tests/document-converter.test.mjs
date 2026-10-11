// 文档转换回归：网页、Word / WPS、表格、演示、PDF、RTF、EPUB、ODF。样例在测试里现场生成。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const AdmZip = require('adm-zip')
const XLSX = require('xlsx')
const CFB = require('cfb')
const { convertDocument, sniff } = require('../../electron/services/documents/DocumentConverter')
const { convertDocumentIsolated } = require('../../electron/services/documents')

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
const convert = (buffer, name, extra = {}) => convertDocument({ buffer, name, ...extra })
const zip = (entries) => {
  const archive = new AdmZip()
  for (const [name, content] of Object.entries(entries)) archive.addFile(name, Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8'))
  return archive.toBuffer()
}
const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'flota-doc-'))

test('网页：文章页去掉导航页脚，GBK 声明正确解码，本地图片内联，远程图片保留', async () => {
  const dir = tempDir()
  try {
    fs.mkdirSync(path.join(dir, 'page_files'))
    fs.writeFileSync(path.join(dir, 'page_files', 'a.png'), PNG)
    const paragraph = `<p>${'This is a long enough article sentence for readability to keep. '.repeat(8)}</p>`
    const before = `<!doctype html><html><head><meta charset="gbk"><title>Test Page</title><script>alert(1)</script></head><body>
      <nav><a href="/">Home</a><a href="/x">NavLink</a></nav>
      <article><h1>Heading</h1><p>`
    const after = `</p>${paragraph}${paragraph}<img src="page_files/a.png"><img src="https://example.com/b.png">
      <table><tr><th>C1</th><th>C2</th></tr><tr><td>a</td><td>b</td></tr></table>${paragraph}</article>
      <footer>Copyright FooterText</footer></body></html>`
    // “中文” 的 GBK 字节
    const buffer = Buffer.concat([Buffer.from(before), Buffer.from([0xd6, 0xd0, 0xce, 0xc4]), Buffer.from(after)])
    const result = await convert(buffer, 'page.html', { baseDir: dir })
    assert.equal(result.title, 'Test Page')
    assert.match(result.markdown, /中文/)
    assert.doesNotMatch(result.markdown, /NavLink|FooterText|alert/)
    assert.match(result.markdown, /!\[\]\(data:image\/png;base64,/)
    assert.match(result.markdown, /!\[\]\(https:\/\/example\.com\/b\.png\)/)
    assert.match(result.markdown, /\| C1 \| C2 \|/)
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('网页：短文档型页面保留全部内容', async () => {
  const result = await convert(Buffer.from('<html><body><h2>会议纪要</h2><ul><li>事项一</li><li>事项二</li></ul></body></html>'), 'notes.htm')
  assert.match(result.markdown, /## 会议纪要/)
  assert.match(result.markdown, /^- 事项一\n- 事项二$/m)
})

test('MHT 单文件网页：quoted-printable 正文与 cid 图片', async () => {
  const image = PNG.toString('base64')
  const mht = [
    'MIME-Version: 1.0', 'Content-Type: multipart/related; boundary="----=_B"', '',
    '------=_B', 'Content-Type: text/html; charset="utf-8"', 'Content-Transfer-Encoding: quoted-printable', 'Content-Location: https://site.test/page.html', '',
    '<html><head><title>=E5=8D=95=E6=96=87=E4=BB=B6</title></head><body><h1>=E4=B8=AD=E6=96=87</h1><img src=3D"img.png"><img src=3D"cid:logo"></b=',
    'ody></html>',
    '------=_B', 'Content-Type: image/png', 'Content-Transfer-Encoding: base64', 'Content-Location: https://site.test/img.png', '', image,
    '------=_B', 'Content-Type: image/png', 'Content-Transfer-Encoding: base64', 'Content-ID: <logo>', '', image,
    '------=_B--', '',
  ].join('\r\n')
  const result = await convert(Buffer.from(mht, 'latin1'), 'page.mht')
  assert.equal(result.title, '单文件')
  assert.match(result.markdown, /# 中文/)
  assert.equal(result.markdown.match(/data:image\/png/g)?.length, 2)
})

const docxFixture = () => zip({
  '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  '_rels/.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  'word/_rels/document.xml.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/><Relationship Id="rId8" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
  'word/styles.xml': '<?xml version="1.0"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="1"><w:name w:val="heading 1"/></w:style></w:styles>',
  'word/media/image1.png': PNG,
  'docProps/core.xml': '<?xml version="1.0"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>模板标题</dc:title></cp:coreProperties>',
  'word/document.xml': `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>
    <w:p><w:pPr><w:pStyle w:val="1"/></w:pPr><w:r><w:t>项目计划</w:t></w:r></w:p>
    <w:p><w:r><w:t xml:space="preserve">第一段 &lt;内容&gt; &amp; 符号</w:t></w:r></w:p>
    <w:tbl><w:tr><w:tc><w:p><w:r><w:t>阶段</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>负责人</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>设计</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>小王</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
    <w:p><w:r><w:drawing><wp:inline><wp:extent cx="9525" cy="9525"/><wp:docPr id="1" name="图片"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="image1.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId9"/></pic:blipFill><pic:spPr/></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>
  </w:body></w:document>`,
})

test('Word docx：标题、转义、表格与图片；元数据标题不采用', async () => {
  const result = await convert(docxFixture(), '计划.docx')
  assert.equal(result.sourceLabel, 'Word 文档')
  assert.equal(result.title, '')
  assert.match(result.markdown, /^# 项目计划/m)
  assert.match(result.markdown, /第一段 <内容> & 符号|第一段 \\<内容> & 符号/)
  assert.match(result.markdown, /\| 阶段 \| 负责人 \|/)
  assert.match(result.markdown, /!\[[^\]]*\]\(data:image\/png;base64,/)
})

test('WPS 文字：内部为 docx 结构的 .wps 按内容识别', async () => {
  const result = await convert(docxFixture(), '计划.wps')
  assert.equal(result.sourceLabel, 'WPS 文字')
  assert.match(result.markdown, /# 项目计划/)
})

test('Word 97 二进制（.doc / .wps）：提取文字', { skip: process.platform !== 'darwin' && '需要 macOS textutil 生成样例' }, async () => {
  const dir = tempDir()
  try {
    fs.writeFileSync(path.join(dir, 'in.html'), '<meta charset="utf-8"><p>第一段中文</p><p>1. 编号行</p><p>Second paragraph</p>')
    const made = spawnSync('textutil', ['-convert', 'doc', path.join(dir, 'in.html'), '-output', path.join(dir, 'out.doc')])
    assert.equal(made.status, 0)
    const buffer = fs.readFileSync(path.join(dir, 'out.doc'))
    assert.equal(sniff(buffer, '.wps'), 'ole-word')
    const result = await convert(buffer, '旧文档.wps')
    assert.equal(result.sourceLabel, 'WPS 文字')
    assert.match(result.markdown, /第一段中文/)
    assert.match(result.markdown, /1\\\. 编号行/)
    assert.match(result.markdown, /Second paragraph/)
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

const workbook = () => {
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['名称', '数量', '备注'], ['苹果', 3, 'a|b'], ['梨', 5, '多行\n文本']]), '水果')
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['机密']]), '隐藏页')
  book.Workbook = { Sheets: [{ Hidden: 0 }, { Hidden: 1 }] }
  return book
}

test('表格：xlsx / WPS 表格(.et，BIFF8) / ods 多工作表，隐藏表跳过，竖线与换行转义', async () => {
  for (const [bookType, name, label] of [['xlsx', 'a.xlsx', 'Excel 表格'], ['biff8', 'a.et', 'WPS 表格'], ['ods', 'a.ods', 'OpenDocument 表格']]) {
    const result = await convert(XLSX.write(workbook(), { type: 'buffer', bookType }), name)
    assert.equal(result.sourceLabel, label, name)
    assert.match(result.markdown, /\| 名称 \| 数量 \| 备注 \|/, name)
    assert.match(result.markdown, /a\\\|b/, name)
    assert.match(result.markdown, /多行<br>文本/, name)
    // SheetJS 写 ods 不保留隐藏属性，只校验 xlsx / et
    if (bookType !== 'ods') {
      assert.doesNotMatch(result.markdown, /机密/, name)
      assert.match(result.markdown, /隐藏工作表「隐藏页」未显示/, name)
    }
  }
})

test('CSV：GBK 编码自动识别，保留前导零', async () => {
  const gbk = Buffer.from([0xb1, 0xe0, 0xba, 0xc5, 0x2c, 0xc3, 0xfb, 0xb3, 0xc6, 0x0a, 0x30, 0x30, 0x31, 0x2c, 0xc6, 0xbb, 0xb9, 0xfb, 0x0a])
  assert.equal(new TextDecoder('gb18030').decode(gbk), '编号,名称\n001,苹果\n')
  const result = await convert(gbk, '清单.csv')
  assert.match(result.markdown, /\| 编号 \| 名称 \|/)
  assert.match(result.markdown, /\| 001 \| 苹果 \|/)
})

const pptxFixture = () => {
  const ns = 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
  const rels = (items) => `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items.map(([id, type, target]) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`).join('')}</Relationships>`
  const para = (text, lvl = 0) => `<a:p><a:pPr lvl="${lvl}"/><a:r><a:t>${text}</a:t></a:r></a:p>`
  return zip({
    'ppt/presentation.xml': `<?xml version="1.0"?><p:presentation ${ns}><p:sldIdLst><p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId1"/></p:sldIdLst></p:presentation>`,
    'ppt/_rels/presentation.xml.rels': rels([['rId1', 'slide', 'slides/slide1.xml'], ['rId2', 'slide', 'slides/slide2.xml']]),
    'ppt/slides/slide2.xml': `<?xml version="1.0"?><p:sld ${ns}><p:cSld><p:spTree>
      <p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody>${para('封面 &amp; &lt;标题&gt;')}</p:txBody></p:sp>
      <p:sp><p:nvSpPr><p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr><p:txBody>${para('要点')}${para('子要点', 1)}</p:txBody></p:sp>
      <p:grpSp><p:sp><p:txBody>${para('组内文字')}</p:txBody></p:sp></p:grpSp>
      <p:pic><p:blipFill><a:blip r:embed="rId3"/></p:blipFill></p:pic>
      <p:graphicFrame><a:graphic><a:graphicData><a:tbl><a:tr><a:tc><a:txBody>${para('季度')}</a:txBody></a:tc><a:tc><a:txBody>${para('收入')}</a:txBody></a:tc></a:tr><a:tr><a:tc><a:txBody>${para('Q1')}</a:txBody></a:tc><a:tc><a:txBody>${para('100')}</a:txBody></a:tc></a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame>
    </p:spTree></p:cSld></p:sld>`,
    'ppt/slides/_rels/slide2.xml.rels': rels([['rId3', 'image', '../media/image1.png'], ['rId4', 'notesSlide', '../notesSlides/notesSlide1.xml']]),
    'ppt/media/image1.png': PNG,
    'ppt/notesSlides/notesSlide1.xml': `<?xml version="1.0"?><p:notes ${ns}><p:cSld><p:spTree><p:sp><p:nvSpPr><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr><p:txBody>${para('演讲备注')}</p:txBody></p:sp></p:spTree></p:cSld></p:notes>`,
    'ppt/slides/slide1.xml': `<?xml version="1.0"?><p:sld ${ns}><p:cSld><p:spTree><p:sp><p:txBody>${para('第二页文字')}${para('另一段')}</p:txBody></p:sp></p:spTree></p:cSld></p:sld>`,
  })
}

test('PowerPoint pptx：按放映顺序，标题、项目符号层级、组合、图片、表格、备注', async () => {
  const { markdown } = await convert(pptxFixture(), 'deck.pptx')
  const first = markdown.indexOf('## 封面')
  const second = markdown.indexOf('## 第 2 页')
  assert.ok(first === 0 && second > first, markdown)
  assert.match(markdown, /## 封面 & \\<标题>/)
  assert.match(markdown, /- 要点\n  - 子要点/)
  assert.match(markdown, /组内文字/)
  assert.match(markdown, /!\[\]\(data:image\/png/)
  assert.match(markdown, /\| 季度 \| 收入 \|/)
  assert.match(markdown, /> 演讲备注/)
  assert.match(markdown, /第二页文字\n\n另一段/)
})

// PowerPoint 97 二进制记录：头 = verInst(2) + type(2) + length(4)
const record = (type, body, { container = false, instance = 0 } = {}) => {
  const header = Buffer.alloc(8)
  header.writeUInt16LE((instance << 4) | (container ? 0x0f : 0), 0)
  header.writeUInt16LE(type, 2)
  header.writeUInt32LE(body.length, 4)
  return Buffer.concat([header, body])
}
const u32 = (value) => { const b = Buffer.alloc(4); b.writeUInt32LE(value); return b }

test('PowerPoint 97 / WPS 演示二进制（.dps）：幻灯片顺序、标题、要点与文本框去重', async () => {
  const slideList = record(0x0ff0, Buffer.concat([
    record(0x03f3, Buffer.concat([u32(7), Buffer.alloc(16)])),
    record(0x0f9f, u32(0)), record(0x0fa0, Buffer.from('季度总结', 'utf16le')),
    record(0x0f9f, u32(1)), record(0x0fa0, Buffer.from('要点一\r要点二', 'utf16le')),
    record(0x0f9f, u32(4)), record(0x0fa8, Buffer.from('Plain bytes', 'latin1')),
  ]), { container: true })
  const document = record(0x03e8, slideList, { container: true })
  const slide = record(0x03ee, record(0xf002, Buffer.concat([
    record(0x0fa0, Buffer.from('文本框里的字', 'utf16le')),
    record(0x0fa0, Buffer.from('要点一', 'utf16le')),
  ]), { container: true }), { container: true })
  const slideOffset = document.length
  const persist = record(0x1772, Buffer.concat([u32(7 | (1 << 20)), u32(slideOffset)]))
  const stream = Buffer.concat([document, slide, persist])
  const container = CFB.utils.cfb_new()
  CFB.utils.cfb_add(container, 'PowerPoint Document', stream)
  const buffer = Buffer.from(CFB.write(container, { type: 'buffer' }))

  const result = await convert(buffer, '汇报.dps')
  assert.equal(result.sourceLabel, 'WPS 演示')
  assert.equal(result.markdown, '## 季度总结\n\n- 要点一\n- 要点二\n\nPlain bytes\n\n文本框里的字')
})

const pdfFixture = (content) => {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ]
  let body = '%PDF-1.4\n'
  const offsets = objects.map((object, index) => {
    const offset = Buffer.byteLength(body)
    body += `${index + 1} 0 obj\n${object}\nendobj\n`
    return offset
  })
  const xref = Buffer.byteLength(body)
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(body, 'latin1')
}

test('PDF：大字号识别为标题，同段换行拼接，段间距分段；无文字时明确报错', async () => {
  const pdf = pdfFixture([
    'BT /F1 28 Tf 72 720 Td (Quarterly Report) Tj ET',
    'BT /F1 11 Tf 72 680 Td (The first paragraph starts here and) Tj 0 -14 Td (continues on the next line.) Tj ET',
    'BT /F1 11 Tf 72 610 Td (A second paragraph.) Tj ET',
  ].join('\n'))
  const result = await convert(pdf, 'report.pdf')
  assert.equal(result.markdown, '# Quarterly Report\n\nThe first paragraph starts here and continues on the next line.\n\nA second paragraph.')
  await assert.rejects(convert(pdfFixture('0 0 m 10 10 l S'), 'scan.pdf'), /没有可提取的文字/)
})

test('RTF：GBK 字节与 \\u 转义都能解码，跳过字体表', async () => {
  const rtf = '{\\rtf1\\ansi\\ansicpg936{\\fonttbl{\\f0 SimSun;}}\\f0 \\\'d6\\\'d0\\\'ce\\\'c4\\par \\uc1\\u20013?\\u25991?\\par 1. item\\par}'
  const result = await convert(Buffer.from(rtf, 'latin1'), 'a.rtf')
  assert.equal(result.markdown, '中文\n\n中文\n\n1\\. item')
})

test('EPUB：按目录顺序转换章节，章节内相对路径图片内联', async () => {
  const epub = zip({
    mimetype: 'application/epub+zip',
    'META-INF/container.xml': '<?xml version="1.0"?><container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>',
    'OEBPS/content.opf': '<?xml version="1.0"?><package xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>小书</dc:title></metadata><manifest><item id="c2" href="text/ch2.xhtml"/><item id="c1" href="text/ch1.xhtml"/></manifest><spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>',
    'OEBPS/text/ch1.xhtml': '<html><body><h1>第一章</h1><p>开始</p><img src="../images/p.png"/></body></html>',
    'OEBPS/text/ch2.xhtml': '<html><body><h1>第二章</h1><p>结束</p></body></html>',
    'OEBPS/images/p.png': PNG,
  })
  const result = await convert(epub, 'book.epub')
  assert.equal(result.title, '小书')
  assert.ok(result.markdown.indexOf('第一章') < result.markdown.indexOf('第二章'))
  assert.match(result.markdown, /data:image\/png/)
})

test('ODT：标题层级、空格与列表', async () => {
  const odt = zip({
    mimetype: 'application/vnd.oasis.opendocument.text',
    'content.xml': '<?xml version="1.0"?><office:document-content xmlns:office="o" xmlns:text="t"><office:body><office:text><text:h text:outline-level="1">总结</text:h><text:p>两个<text:s text:c="2"/>空格</text:p><text:list><text:list-item><text:p>事项</text:p></text:list-item></text:list></office:text></office:body></office:document-content>',
  })
  const result = await convert(odt, 'a.odt')
  assert.equal(result.markdown, '## 总结\n\n两个  空格\n\n- 事项')
})

test('无法识别与加密文档给出明确错误', async () => {
  await assert.rejects(convert(Buffer.from('just bytes'), 'x.docx'), /无法识别/)
  const container = CFB.utils.cfb_new()
  CFB.utils.cfb_add(container, 'EncryptedPackage', Buffer.from('x'))
  await assert.rejects(convert(Buffer.from(CFB.write(container, { type: 'buffer' })), 'secret.xlsx'), /已加密/)
})

test('隔离转换：在工作线程中完成，超时会终止', async () => {
  const result = await convertDocumentIsolated({ buffer: pptxFixture(), name: 'deck.pptx' })
  assert.match(result.markdown, /## 封面/)
  await assert.rejects(convertDocumentIsolated({ buffer: docxFixture(), name: 'a.docx' }, { timeoutMs: 1 }), /超时/)
})

test('外部文件服务：文档只读预览不可写回；新增类型不会被旧的开启列表关掉', async () => {
  const service = require('../../electron/services/ExternalFileService')
  const dir = tempDir()
  try {
    const file = path.join(dir, '计划.docx')
    fs.writeFileSync(file, docxFixture())
    const instance = new service.ExternalFileService({ draftDirectory: path.join(dir, 'drafts') })
    instance.allow(file)
    const data = await instance.read(file)
    assert.equal(data.format, 'document')
    assert.equal(data.writable, false)
    assert.equal(data.title, '计划')
    assert.match(data.content, /# 项目计划/)
    assert.throws(() => instance.write(file, 'x'), /不支持/)

    assert.deepEqual(service.setEnabledFileTypes('markdown,text', service.LEGACY_KNOWN_TYPES).sort(),
      ['ebook', 'markdown', 'pdf', 'presentation', 'spreadsheet', 'text', 'word'])
    assert.deepEqual(service.setEnabledFileTypes(['markdown']), ['markdown'])
  } finally {
    service.setEnabledFileTypes(service.FILE_TYPES.map((type) => type.id))
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
