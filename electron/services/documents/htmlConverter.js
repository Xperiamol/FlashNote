// HTML / MHT → Markdown。网页类页面用 Readability 去掉导航、侧栏；文档类页面（导出的报告、Word 另存的网页）保留全文。
const fs = require('fs')
const path = require('path')
const { fileURLToPath } = require('url')
const { decodeBuffer, mimeOfName, collapseBlankLines, markdownTable } = require('./textUtils')

const REMOVE = 'script, style, noscript, template, iframe, object, embed, link, meta, button, input, select, textarea, canvas'
const PAGE_CHROME = 'nav, header, footer, aside, [role="navigation"], [role="banner"], [role="contentinfo"]'

const declaredCharset = (bytes) => {
  const head = Buffer.from(bytes).subarray(0, 4096).toString('latin1')
  return head.match(/<meta[^>]+charset\s*=\s*["']?([\w-]+)/i)?.[1] || null
}

const decodeHtml = (buffer) => decodeBuffer(buffer, declaredCharset(buffer))

const createTurndown = () => {
  const TurndownService = require('turndown')
  const { gfm } = require('turndown-plugin-gfm')
  const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-', emDelimiter: '*', hr: '---' })
  // 表格统一转 Markdown：gfm 插件只转换有表头的表格，Word / WPS 导出的表格通常没有 <th>，会原样留下 HTML
  turndown.addRule('table', {
    filter: 'table',
    replacement: (_content, node) => {
      const rows = Array.from(node.querySelectorAll('tr')).filter((row) => row.closest('table') === node)
      const cells = rows.map((row) => Array.from(row.children).filter((cell) => /^T[DH]$/.test(cell.nodeName)).flatMap((cell) => {
        const text = turndown.turndown(cell.innerHTML || '').replace(/\n+/g, '\n').trim()
        return [text, ...Array(Math.max(0, Number(cell.getAttribute('colspan') || 1) - 1)).fill('')]
      }))
      const table = markdownTable(cells)
      return table ? `\n\n${table}\n\n` : ''
    },
  })
  // 列表符号后只留一个空格（默认是三个）
  turndown.addRule('listItem', {
    filter: 'li',
    replacement: (content, node) => {
      const parent = node.parentNode
      let prefix = '- '
      if (parent?.nodeName === 'OL') {
        const items = Array.from(parent.children).filter((item) => item.nodeName === 'LI')
        prefix = `${Number(parent.getAttribute('start') || 1) + items.indexOf(node)}. `
      }
      const body = content.replace(/^\n+/, '').replace(/\n+$/, '\n').replace(/\n/gm, `\n${' '.repeat(prefix.length)}`)
      return prefix + body + (node.nextSibling && !/\n$/.test(body) ? '\n' : '')
    },
  })
  turndown.use(gfm)
  // Word 另存的网页带 <o:p> 等命名空间标签，只保留文字
  turndown.addRule('officeNamespace', { filter: (node) => /:/.test(node.nodeName), replacement: (content) => content })
  return turndown
}

/**
 * @param {string} html
 * @param {{ baseDir?: string, resolveImage?: (src: string) => string|null, budget: import('./textUtils').ImageBudget, preferArticle?: boolean }} options
 */
const htmlToMarkdown = (input, { baseDir, resolveImage, budget, preferArticle = true }) => {
  const { parseHTML } = require('linkedom')
  // 片段（mammoth 输出等）没有 body 时 linkedom 会把第一个元素当根节点，需要补上文档外壳
  const html = /<(html|body)[\s>]/i.test(input) ? input : `<!doctype html><html><body>${input}</body></html>`
  const { document } = parseHTML(html)
  const title = document.querySelector('title')?.textContent?.trim() || document.querySelector('h1')?.textContent?.trim() || ''

  let root = document.body || document.documentElement
  root.querySelectorAll(REMOVE).forEach((node) => node.remove())
  const bodyText = (root.textContent || '').replace(/\s+/g, '').length

  // 文章页：Readability 保留的文字占比足够才采用，否则是文档型页面，保留全文去掉页眉页脚
  if (preferArticle && bodyText > 500) {
    try {
      const { Readability } = require('@mozilla/readability')
      const article = new Readability(parseHTML(html).document, { charThreshold: 200 }).parse()
      const kept = (article?.textContent || '').replace(/\s+/g, '').length
      if (article?.content && kept >= bodyText * 0.4) {
        root = parseHTML(`<!doctype html><html><body>${article.content}</body></html>`).document.body
      } else {
        root.querySelectorAll(PAGE_CHROME).forEach((node) => node.remove())
      }
    } catch {}
  }

  root.querySelectorAll('img').forEach((img) => {
    const lazy = img.getAttribute('data-src') || img.getAttribute('data-original') || img.getAttribute('data-lazy-src')
    const src = (lazy && (!img.getAttribute('src') || img.getAttribute('src').startsWith('data:'))) ? lazy : img.getAttribute('src')
    const resolved = src ? (resolveImage?.(src) ?? localImage(src, baseDir, budget)) : null
    if (resolved) img.setAttribute('src', resolved)
    else img.remove()
  })
  root.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href')
    if (!/^(https?:|mailto:|#)/i.test(href)) a.removeAttribute('href')
  })

  const markdown = createTurndown().turndown(root.innerHTML || '')
  return { title, markdown: collapseBlankLines(markdown) }
}

// 远程图片保留链接；本地相对路径（同目录 xxx_files/ 之类）读入为 data URL
const localImage = (src, baseDir, budget) => {
  if (/^(https?:|data:image\/)/i.test(src)) return src
  if (!baseDir) return null
  try {
    const target = src.startsWith('file:') ? fileURLToPath(src) : path.resolve(baseDir, decodeURI(src.split(/[?#]/)[0]))
    return budget.dataUrl(fs.readFileSync(target), mimeOfName(target))
  } catch {
    return null
  }
}

// ── MHT / MHTML（浏览器「保存为单个文件」） ──

const decodeQuotedPrintable = (text) => {
  const bytes = []
  const source = text.replace(/=\r?\n/g, '')
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '=' && /^[0-9A-F]{2}$/i.test(source.slice(i + 1, i + 3))) {
      bytes.push(parseInt(source.slice(i + 1, i + 3), 16))
      i += 2
    } else {
      const code = source.charCodeAt(i)
      if (code < 256) bytes.push(code)
      else bytes.push(...Buffer.from(source[i], 'utf8'))
    }
  }
  return Buffer.from(bytes)
}

const parseHeaders = (block) => {
  const headers = {}
  block.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/).forEach((line) => {
    const index = line.indexOf(':')
    if (index > 0) headers[line.slice(0, index).trim().toLowerCase()] = line.slice(index + 1).trim()
  })
  return headers
}

const mhtToMarkdown = (buffer, { budget }) => {
  const text = Buffer.from(buffer).toString('latin1')
  const split = text.search(/\r?\n\r?\n/)
  const headers = parseHeaders(text.slice(0, split))
  const boundary = headers['content-type']?.match(/boundary="?([^";]+)"?/i)?.[1]
  if (!boundary) throw new Error('不是有效的 MHT 文件')

  const parts = text.split(`--${boundary}`).slice(1).filter((part) => !part.startsWith('--')).map((part) => {
    const index = part.search(/\r?\n\r?\n/)
    const partHeaders = parseHeaders(part.slice(0, index).replace(/^\r?\n/, ''))
    const raw = part.slice(index).replace(/^\r?\n\r?\n/, '').replace(/\r?\n$/, '')
    const encoding = (partHeaders['content-transfer-encoding'] || '').toLowerCase()
    const body = encoding === 'base64' ? Buffer.from(raw.replace(/\s+/g, ''), 'base64')
      : encoding === 'quoted-printable' ? decodeQuotedPrintable(raw) : Buffer.from(raw, 'latin1')
    return { headers: partHeaders, type: (partHeaders['content-type'] || '').split(';')[0].trim().toLowerCase(), body }
  })

  const main = parts.find((part) => part.type === 'text/html')
  if (!main) throw new Error('MHT 文件里没有网页内容')
  const charset = main.headers['content-type']?.match(/charset="?([\w-]+)/i)?.[1]
  const mainLocation = main.headers['content-location']
  const resources = new Map()
  for (const part of parts) {
    if (!part.type.startsWith('image/')) continue
    const keys = [part.headers['content-location'], part.headers['content-id'] && `cid:${part.headers['content-id'].replace(/[<>]/g, '')}`]
    keys.filter(Boolean).forEach((key) => resources.set(key, part))
  }
  const cache = new Map()
  const resolveImage = (src) => {
    if (src.startsWith('data:image/')) return src
    let key = src
    if (!resources.has(key) && mainLocation) { try { key = new URL(src, mainLocation).toString() } catch {} }
    const part = resources.get(key)
    if (!part) return /^https?:/i.test(src) ? src : null
    if (!cache.has(key)) cache.set(key, budget.dataUrl(part.body, part.type))
    return cache.get(key)
  }
  return htmlToMarkdown(decodeBuffer(main.body, charset || declaredCharset(main.body)), { resolveImage, budget })
}

module.exports = { htmlToMarkdown, mhtToMarkdown, decodeHtml }
