/**
 * Markdown 彩色文本插件
 * 支持语法: {color:red}text{/color} 或 {#FF0000}text{/}
 */

/**
 * 彩色文本插件
 * @param {MarkdownIt} md - Markdown-it 实例
 * @param {Object} options - 插件选项
 * @param {Object} options.colors - 预定义颜色映射
 * @param {string} options.className - CSS 类名前缀
 */
export default function colorTextPlugin(md, options = {}) {
  const {
    colors = {
      red: '#ef4444',
      orange: '#f97316',
      yellow: '#eab308',
      green: '#22c55e',
      blue: '#3b82f6',
      indigo: '#6366f1',
      purple: '#a855f7',
      pink: '#ec4899',
      gray: '#6b7280'
    },
    className = 'markdown-color-text'
  } = options

  /**
   * 解析颜色值
   * @param {string} colorStr - 颜色字符串
   * @returns {string} CSS 颜色值
   */
  function parseColor(colorStr) {
    // 如果是十六进制颜色
    if (colorStr.startsWith('#')) {
      return colorStr
    }
    
    // 如果是 RGB/RGBA
    if (colorStr.startsWith('rgb')) {
      return colorStr
    }
    
    // 如果是预定义颜色名
    if (colors[colorStr.toLowerCase()]) {
      return colors[colorStr.toLowerCase()]
    }
    
    // 默认返回原值（可能是 CSS 颜色名）
    return colorStr
  }

  // 添加内联规则解析彩色文本
  md.inline.ruler.before('emphasis', 'color_text', function(state, silent) {
    const start = state.pos
    const marker = state.src.charCodeAt(start)

    // 检查是否是 { 标记
    if (marker !== 0x7B /* { */) {
      return false
    }

    // 匹配 {color:xxx} 或 {#xxx} 或 {xxx}
    const colorMatch = state.src.slice(start).match(/^\{(?:color:)?([a-zA-Z0-9#]+)\}/)
    if (!colorMatch) {
      return false
    }

    const colorValue = colorMatch[1]
    const colorEndPos = start + colorMatch[0].length

    // 查找结束标记 {/color} 或 {/}
    let pos = colorEndPos
    let found = false
    let endMarkerLength = 0
    
    while (pos < state.posMax) {
      if (state.src.slice(pos).startsWith('{/color}')) {
        found = true
        endMarkerLength = 8
        break
      } else if (state.src.slice(pos).startsWith('{/}')) {
        found = true
        endMarkerLength = 3
        break
      }
      pos++
    }

    if (!found) {
      return false
    }

    if (!silent) {
      const token = state.push('color_text_open', 'span', 1)
      const color = parseColor(colorValue)
      token.attrSet('class', `${className} ${className}-${colorValue}`)
      token.attrSet('style', `color: ${color}`)

      const textToken = state.push('text', '', 0)
      textToken.content = state.src.slice(colorEndPos, pos)

      state.push('color_text_close', 'span', -1)
    }

    state.pos = pos + endMarkerLength
    return true
  })

  // 渲染规则
  md.renderer.rules.color_text_open = function(tokens, idx) {
    const token = tokens[idx]
    const attrs = token.attrs ? token.attrs.map(([key, value]) => `${key}="${value}"`).join(' ') : ''
    return `<span ${attrs}>`
  }

  md.renderer.rules.color_text_close = function() {
    return '</span>'
  }

  // 支持简化语法: @red{text} 或 @#FF0000{text}
  md.inline.ruler.before('emphasis', 'color_text_short', function(state, silent) {
    const start = state.pos
    const marker = state.src.charCodeAt(start)

    // 检查是否是 @ 标记
    if (marker !== 0x40 /* @ */) {
      return false
    }

    // 匹配 @color{...} 或 @#xxx{...}
    const match = state.src.slice(start).match(/^@([a-zA-Z0-9#]+)\{([^}]+)\}/)
    if (!match) {
      return false
    }

    const colorValue = match[1]
    const text = match[2]

    if (!silent) {
      const token = state.push('color_text_open', 'span', 1)
      const color = parseColor(colorValue)
      token.attrSet('class', `${className} ${className}-${colorValue}`)
      token.attrSet('style', `color: ${color}`)

      const textToken = state.push('text', '', 0)
      textToken.content = text

      state.push('color_text_close', 'span', -1)
    }

    state.pos = start + match[0].length
    return true
  })
}