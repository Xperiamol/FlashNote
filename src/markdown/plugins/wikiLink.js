/**
 * Markdown Wiki-Link 插件
 * 支持 Obsidian 风格的 Wiki 链接语法
 * 
 * 语法示例:
 * [[Note Title]]           - 基本链接
 * [[Note Title|Display]]   - 带显示文本的链接
 * [[Note#Section]]         - 链接到章节
 * [[Note|Display#Section]] - 完整语法
 */

/**
 * Wiki-Link 插件
 * @param {MarkdownIt} md - Markdown-it 实例
 * @param {Object} options - 插件选项
 * @param {Function} options.onClick - 点击回调函数
 * @param {Function} options.resolveLink - 自定义链接解析函数
 * @param {string} options.className - CSS 类名
 */
export default function wikiLinkPlugin(md, options = {}) {
  const {
    onClick,
    resolveLink,
    className = 'markdown-wiki-link',
    baseUrl = '#',
    ...customOptions
  } = options

  /**
   * 解析 Wiki 链接
   * @param {string} linkText - 链接文本
   * @returns {Object} 解析结果
   */
  function parseWikiLink(linkText) {
    // 移除首尾的 [[ 和 ]]
    const content = linkText.slice(2, -2).trim()
    
    // 分离显示文本和目标
    let target, display, section
    
    if (content.includes('|')) {
      const parts = content.split('|')
      target = parts[0].trim()
      display = parts[1].trim()
      
      // 检查是否有章节标记
      if (display.includes('#')) {
        const sectionParts = display.split('#')
        display = sectionParts[0].trim()
        section = sectionParts[1].trim()
      }
    } else {
      target = content
      display = content
      
      // 检查是否有章节标记
      if (target.includes('#')) {
        const parts = target.split('#')
        target = parts[0].trim()
        section = parts[1].trim()
        display = target // 显示笔记名，不显示章节
      }
    }
    
    return { target, display, section }
  }

  /**
   * 生成链接 URL
   * @param {string} target - 目标笔记
   * @param {string} section - 章节（可选）
   * @returns {string} URL
   */
  function generateUrl(target, section) {
    if (resolveLink) {
      return resolveLink(target, section)
    }
    
    // 默认 URL 生成逻辑
    const encodedTarget = encodeURIComponent(target)
    const url = `${baseUrl}${encodedTarget}`
    return section ? `${url}#${encodeURIComponent(section)}` : url
  }

  // 添加内联规则解析 Wiki 链接
  md.inline.ruler.before('link', 'wiki_link', function(state, silent) {
    const start = state.pos
    const marker = state.src.charCodeAt(start)

    // 检查是否是 [[ 标记
    if (marker !== 0x5B /* [ */) {
      return false
    }

    if (state.src.charCodeAt(start + 1) !== 0x5B) {
      return false
    }

    // 查找结束标记 ]]
    let pos = start + 2
    let found = false
    
    while (pos < state.posMax - 1) {
      if (state.src.charCodeAt(pos) === 0x5D && state.src.charCodeAt(pos + 1) === 0x5D) {
        found = true
        break
      }
      pos++
    }

    if (!found) {
      return false
    }

    const linkText = state.src.slice(start, pos + 2)
    const { target, display, section } = parseWikiLink(linkText)

    if (!target) {
      return false
    }

    if (!silent) {
      const token = state.push('wiki_link', '', 0)
      token.content = display
      token.meta = {
        target,
        section,
        display
      }
    }

    state.pos = pos + 2
    return true
  })

  // 渲染 Wiki 链接
  md.renderer.rules.wiki_link = function(tokens, idx) {
    const token = tokens[idx]
    const { target, section, display } = token.meta
    const url = generateUrl(target, section)
    
    // 构建属性
    const attrs = [
      ['class', `${className}`],
      ['href', url],
      ['data-wiki-target', target]
    ]
    
    if (section) {
      attrs.push(['data-wiki-section', section])
    }
    
    // 如果提供了点击回调，添加点击事件
    if (onClick) {
      attrs.push(['data-wiki-link', 'true'])
    }
    
    const attrsStr = attrs.map(([key, value]) => `${key}="${value}"`).join(' ')
    
    // 检查链接是否存在（可以通过 resolveLink 返回特殊值来标记）
    const exists = !url.includes('__not_found__')
    const existsClass = exists ? '' : ` ${className}-not-found`
    
    return `<a ${attrsStr} class="${className}${existsClass}">${display}</a>`
  }

  // 支持嵌入语法 ![[Note]]
  md.inline.ruler.before('wiki_link', 'wiki_embed', function(state, silent) {
    const start = state.pos
    const marker = state.src.charCodeAt(start)

    // 检查是否是 ![[  标记
    if (marker !== 0x21 /* ! */) {
      return false
    }

    if (state.src.charCodeAt(start + 1) !== 0x5B || state.src.charCodeAt(start + 2) !== 0x5B) {
      return false
    }

    // 查找结束标记 ]]
    let pos = start + 3
    let found = false
    
    while (pos < state.posMax - 1) {
      if (state.src.charCodeAt(pos) === 0x5D && state.src.charCodeAt(pos + 1) === 0x5D) {
        found = true
        break
      }
      pos++
    }

    if (!found) {
      return false
    }

    const linkText = state.src.slice(start + 1, pos + 2) // 移除 !
    const { target, section } = parseWikiLink(linkText)

    if (!target) {
      return false
    }

    if (!silent) {
      const token = state.push('wiki_embed', '', 0)
      token.content = target
      token.meta = {
        target,
        section
      }
    }

    state.pos = pos + 2
    return true
  })

  // 渲染嵌入内容
  md.renderer.rules.wiki_embed = function(tokens, idx) {
    const token = tokens[idx]
    const { target, section } = token.meta
    
    return `<div class="${className}-embed" data-embed-target="${target}" ${section ? `data-embed-section="${section}"` : ''}>
  <div class="${className}-embed-placeholder">
    <span class="${className}-embed-icon">📄</span>
    <span class="${className}-embed-title">${target}${section ? ` > ${section}` : ''}</span>
  </div>
</div>`
  }
}