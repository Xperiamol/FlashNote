/**
 * Markdown 高亮语法插件
 * 支持 ==text== 语法（已由 markdown-it-mark 提供）
 * 此插件用于自定义高亮样式和行为
 */

/**
 * 高亮插件
 * @param {MarkdownIt} md - Markdown-it 实例
 * @param {Object} options - 插件选项
 * @param {string} options.className - 自定义 CSS 类名
 * @param {Object} options.style - 自定义内联样式
 */
export default function highlightPlugin(md, options = {}) {
  const {
    className = 'markdown-highlight',
    style = {}
  } = options

  // 自定义 mark 标签的渲染规则
  const defaultRender = md.renderer.rules.mark_open || function(tokens, idx, options, env, self) {
    return self.renderToken(tokens, idx, options)
  }

  md.renderer.rules.mark_open = function(tokens, idx, options, env, self) {
    const token = tokens[idx]
    
    // 添加自定义类名
    token.attrPush(['class', className])
    
    // 添加自定义样式
    if (Object.keys(style).length > 0) {
      const styleStr = Object.entries(style)
        .map(([key, value]) => `${key}: ${value}`)
        .join('; ')
      token.attrPush(['style', styleStr])
    }
    
    return defaultRender(tokens, idx, options, env, self)
  }

  // 支持自定义高亮颜色语法: =={color}text==
  md.inline.ruler.before('mark', 'custom_highlight', function(state, silent) {
    const start = state.pos
    const marker = state.src.charCodeAt(start)

    // 检查是否是 == 标记
    if (marker !== 0x3D /* = */) {
      return false
    }

    if (state.src.charCodeAt(start + 1) !== 0x3D) {
      return false
    }

    // 检查是否有颜色标记 =={color}
    const colorMatch = state.src.slice(start).match(/^==\{([a-zA-Z0-9#]+)\}/)
    if (!colorMatch) {
      return false
    }

    const color = colorMatch[1]
    const colorEndPos = start + colorMatch[0].length

    // 查找结束标记
    let pos = colorEndPos
    let found = false
    while (pos < state.posMax - 1) {
      if (state.src.charCodeAt(pos) === 0x3D && state.src.charCodeAt(pos + 1) === 0x3D) {
        found = true
        break
      }
      pos++
    }

    if (!found) {
      return false
    }

    if (!silent) {
      const token = state.push('custom_highlight_open', 'mark', 1)
      token.attrSet('class', `${className} ${className}-${color}`)
      token.attrSet('style', `background-color: ${color.startsWith('#') ? color : `var(--highlight-${color}, ${color})`}`)

      const textToken = state.push('text', '', 0)
      textToken.content = state.src.slice(colorEndPos, pos)

      state.push('custom_highlight_close', 'mark', -1)
    }

    state.pos = pos + 2
    return true
  })

  // 渲染自定义高亮
  md.renderer.rules.custom_highlight_open = function(tokens, idx) {
    const token = tokens[idx]
    const attrs = token.attrs ? token.attrs.map(([key, value]) => `${key}="${value}"`).join(' ') : ''
    return `<mark ${attrs}>`
  }

  md.renderer.rules.custom_highlight_close = function() {
    return '</mark>'
  }
}