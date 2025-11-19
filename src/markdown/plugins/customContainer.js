/**
 * Markdown 自定义容器插件
 * 支持 :::type 语法
 * 
 * 语法示例:
 * :::tip 提示标题
 * 这是提示内容
 * :::
 * 
 * :::warning
 * 警告内容
 * :::
 */

import markdownItContainer from 'markdown-it-container'

/**
 * 自定义容器插件
 * @param {MarkdownIt} md - Markdown-it 实例
 * @param {Object} options - 插件选项
 */
export default function customContainerPlugin(md, options = {}) {
  const {
    className = 'markdown-container',
    types = {
      tip: { icon: '💡', label: '提示', color: '#22c55e' },
      info: { icon: 'ℹ️', label: '信息', color: '#3b82f6' },
      warning: { icon: '⚠️', label: '警告', color: '#f59e0b' },
      danger: { icon: '🚫', label: '危险', color: '#ef4444' },
      details: { icon: '📋', label: '详情', color: '#6b7280' },
      note: { icon: '📝', label: '笔记', color: '#8b5cf6' },
      abstract: { icon: '📄', label: '摘要', color: '#06b6d4' },
      summary: { icon: '📊', label: '总结', color: '#06b6d4' },
      tldr: { icon: '⚡', label: 'TL;DR', color: '#f59e0b' },
      success: { icon: '✅', label: '成功', color: '#22c55e' },
      question: { icon: '❓', label: '问题', color: '#8b5cf6' },
      failure: { icon: '❌', label: '失败', color: '#ef4444' },
      bug: { icon: '🐛', label: 'Bug', color: '#ef4444' },
      example: { icon: '📝', label: '示例', color: '#06b6d4' },
      quote: { icon: '💬', label: '引用', color: '#6b7280' }
    },
    ...customOptions
  } = options

  // 合并自定义类型
  const allTypes = { ...types, ...customOptions.customTypes }

  // 为每种类型注册容器
  Object.keys(allTypes).forEach(type => {
    const typeConfig = allTypes[type]
    
    md.use(markdownItContainer, type, {
      validate: function(params) {
        return params.trim().match(new RegExp(`^${type}\\s*(.*)$`))
      },

      render: function(tokens, idx) {
        const token = tokens[idx]
        const info = token.info.trim()
        const match = info.match(new RegExp(`^${type}\\s*(.*)$`))
        
        if (token.nesting === 1) {
          // 开始标签
          const title = match && match[1] ? match[1] : typeConfig.label
          
          return `<div class="${className} ${className}-${type}" style="border-left: 4px solid ${typeConfig.color}; padding: 1rem; margin: 1rem 0; background-color: ${typeConfig.color}15; border-radius: 4px;">
  <div class="${className}-header" style="display: flex; align-items: center; gap: 0.5rem; font-weight: 600; margin-bottom: 0.5rem; color: ${typeConfig.color};">
    <span class="${className}-icon">${typeConfig.icon}</span>
    <span class="${className}-title">${md.utils.escapeHtml(title)}</span>
  </div>
  <div class="${className}-content">\n`
        } else {
          // 结束标签
          return `  </div>
</div>\n`
        }
      }
    })
  })

  // 支持可折叠容器 :::details
  md.use(markdownItContainer, 'details', {
    validate: function(params) {
      return params.trim().match(/^details\s*(.*)$/)
    },

    render: function(tokens, idx) {
      const token = tokens[idx]
      const info = token.info.trim()
      const match = info.match(/^details\s*(.*)$/)
      
      if (token.nesting === 1) {
        const title = match && match[1] ? match[1] : '详情'
        const typeConfig = allTypes.details || { icon: '📋', color: '#6b7280' }
        
        return `<details class="${className} ${className}-details" style="border-left: 4px solid ${typeConfig.color}; padding: 1rem; margin: 1rem 0; background-color: ${typeConfig.color}15; border-radius: 4px;">
  <summary class="${className}-summary" style="cursor: pointer; font-weight: 600; color: ${typeConfig.color}; display: flex; align-items: center; gap: 0.5rem;">
    <span class="${className}-icon">${typeConfig.icon}</span>
    <span>${md.utils.escapeHtml(title)}</span>
  </summary>
  <div class="${className}-content" style="margin-top: 0.5rem;">\n`
      } else {
        return `  </div>
</details>\n`
      }
    }
  })

  // 支持代码组容器 :::code-group
  md.use(markdownItContainer, 'code-group', {
    validate: function(params) {
      return params.trim().match(/^code-group/)
    },

    render: function(tokens, idx) {
      if (tokens[idx].nesting === 1) {
        return `<div class="${className} ${className}-code-group" style="margin: 1rem 0;">
  <div class="${className}-code-tabs" style="display: flex; gap: 0.5rem; border-bottom: 2px solid var(--divider-color, #e5e7eb); margin-bottom: 0;">
  </div>
  <div class="${className}-code-content">\n`
      } else {
        return `  </div>
</div>\n`
      }
    }
  })

  // 支持自定义样式容器 :::custom{style}
  md.use(markdownItContainer, 'custom', {
    validate: function(params) {
      return params.trim().match(/^custom/)
    },

    render: function(tokens, idx) {
      const token = tokens[idx]
      const info = token.info.trim()
      
      if (token.nesting === 1) {
        // 解析自定义样式
        const styleMatch = info.match(/\{([^}]+)\}/)
        const style = styleMatch ? styleMatch[1] : ''
        const titleMatch = info.match(/^custom(?:\{[^}]+\})?\s*(.*)$/)
        const title = titleMatch && titleMatch[1] ? titleMatch[1] : ''
        
        return `<div class="${className} ${className}-custom" style="${style}">
  ${title ? `<div class="${className}-title" style="font-weight: 600; margin-bottom: 0.5rem;">${md.utils.escapeHtml(title)}</div>` : ''}
  <div class="${className}-content">\n`
      } else {
        return `  </div>
</div>\n`
      }
    }
  })
}