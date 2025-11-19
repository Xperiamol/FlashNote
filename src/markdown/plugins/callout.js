/**
 * Markdown Callout 插件
 * 支持 Obsidian 风格的 Callout 语法
 * 
 * 语法示例:
 * > [!note] 标题
 * > 内容
 * 
 * > [!warning] 警告
 * > 这是警告内容
 */

/**
 * Callout 插件
 * @param {MarkdownIt} md - Markdown-it 实例
 * @param {Object} options - 插件选项
 */
export default function calloutPlugin(md, options = {}) {
  const {
    className = 'markdown-callout',
    types = {
      note: { icon: 'ℹ️', color: '#3b82f6', label: '笔记' },
      tip: { icon: '💡', color: '#22c55e', label: '提示' },
      info: { icon: 'ℹ️', color: '#3b82f6', label: '信息' },
      warning: { icon: '⚠️', color: '#f59e0b', label: '警告' },
      danger: { icon: '🚫', color: '#ef4444', label: '危险' },
      error: { icon: '❌', color: '#ef4444', label: '错误' },
      success: { icon: '✅', color: '#22c55e', label: '成功' },
      question: { icon: '❓', color: '#8b5cf6', label: '问题' },
      quote: { icon: '💬', color: '#6b7280', label: '引用' },
      example: { icon: '📝', color: '#06b6d4', label: '示例' },
      abstract: { icon: '📋', color: '#06b6d4', label: '摘要' },
      todo: { icon: '☑️', color: '#3b82f6', label: '待办' },
      bug: { icon: '🐛', color: '#ef4444', label: 'Bug' }
    },
    ...customOptions
  } = options

  // 合并自定义类型
  const allTypes = { ...types, ...customOptions.customTypes }

  // 覆盖 blockquote 的渲染规则
  const defaultBlockquoteOpen = md.renderer.rules.blockquote_open || function(tokens, idx, options, env, self) {
    return self.renderToken(tokens, idx, options)
  }

  const defaultBlockquoteClose = md.renderer.rules.blockquote_close || function(tokens, idx, options, env, self) {
    return self.renderToken(tokens, idx, options)
  }

  md.renderer.rules.blockquote_open = function(tokens, idx, options, env, self) {
    const token = tokens[idx]
    
    // 检查下一个 token 是否包含 callout 标记
    const nextToken = tokens[idx + 1]
    if (nextToken && nextToken.type === 'paragraph_open') {
      const contentToken = tokens[idx + 2]
      if (contentToken && contentToken.type === 'inline') {
        const match = contentToken.content.match(/^\[!(\w+)\](?:\s+(.+))?/)
        if (match) {
          const type = match[1].toLowerCase()
          const title = match[2] || ''
          const typeConfig = allTypes[type] || allTypes.note

          // 移除 callout 标记，只保留内容
          contentToken.content = contentToken.content.replace(/^\[!\w+\](?:\s+.+)?/, '').trim()

          // 标记这是一个 callout
          token.attrSet('data-callout-type', type)
          token.attrSet('data-callout-title', title)
          token.attrSet('class', `${className} ${className}-${type}`)
          token.attrSet('style', `border-left-color: ${typeConfig.color}`)

          // 生成 callout HTML
          return `<div class="${className} ${className}-${type}" style="border-left: 4px solid ${typeConfig.color}; padding: 1rem; margin: 1rem 0; background-color: ${typeConfig.color}15; border-radius: 4px;">
  <div class="${className}-header" style="display: flex; align-items: center; gap: 0.5rem; font-weight: 600; margin-bottom: ${contentToken.content ? '0.5rem' : '0'}; color: ${typeConfig.color};">
    <span class="${className}-icon">${typeConfig.icon}</span>
    <span class="${className}-title">${title || typeConfig.label}</span>
  </div>
  <div class="${className}-content">`
        }
      }
    }

    return defaultBlockquoteOpen(tokens, idx, options, env, self)
  }

  md.renderer.rules.blockquote_close = function(tokens, idx, options, env, self) {
    // 查找对应的 open token
    let openIdx = idx - 1
    while (openIdx >= 0 && tokens[openIdx].type !== 'blockquote_open') {
      openIdx--
    }

    if (openIdx >= 0) {
      const openToken = tokens[openIdx]
      if (openToken.attrGet('data-callout-type')) {
        return `</div></div>`
      }
    }

    return defaultBlockquoteClose(tokens, idx, options, env, self)
  }

  // 处理多行 callout 内容
  md.core.ruler.after('block', 'callout_processor', function(state) {
    const tokens = state.tokens
    let i = 0

    while (i < tokens.length) {
      if (tokens[i].type === 'blockquote_open') {
        // 检查是否是 callout
        let j = i + 1
        let isCallout = false

        while (j < tokens.length && tokens[j].type !== 'blockquote_close') {
          if (tokens[j].type === 'inline' && tokens[j].content.match(/^\[!\w+\]/)) {
            isCallout = true
            break
          }
          j++
        }

        if (isCallout) {
          // 标记所有相关的 tokens
          for (let k = i; k <= j && k < tokens.length; k++) {
            if (tokens[k].type === 'blockquote_close') {
              break
            }
          }
        }
      }
      i++
    }

    return false
  })
}