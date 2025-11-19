/**
 * Markdown 标签插件
 * 支持 #tag 语法
 * 
 * 语法示例:
 * #标签名
 * #tag-name
 * #tag_name
 */

/**
 * 标签插件
 * @param {MarkdownIt} md - Markdown-it 实例
 * @param {Object} options - 插件选项
 * @param {Function} options.onClick - 点击回调函数
 * @param {string} options.className - CSS 类名
 * @param {RegExp} options.pattern - 自定义标签匹配模式
 */
export default function tagPlugin(md, options = {}) {
  const {
    onClick,
    className = 'markdown-tag',
    // 默认匹配模式：# 后跟字母、数字、中文、下划线、连字符
    pattern = /^#([\w\u4e00-\u9fa5][\w\u4e00-\u9fa5\-_]*)/,
    allowedChars = /^[\w\u4e00-\u9fa5\-_]+$/,
    ...customOptions
  } = options

  /**
   * 验证标签名是否有效
   * @param {string} tagName - 标签名
   * @returns {boolean} 是否有效
   */
  function isValidTag(tagName) {
    // 标签名不能为空
    if (!tagName || tagName.length === 0) {
      return false
    }
    
    // 标签名不能以数字开头
    if (/^\d/.test(tagName)) {
      return false
    }
    
    // 检查是否只包含允许的字符
    return allowedChars.test(tagName)
  }

  /**
   * 检查字符是否是标签的有效边界
   * @param {number} charCode - 字符码
   * @returns {boolean} 是否是边界
   */
  function isTagBoundary(charCode) {
    // 空格、标点符号、换行等
    return (
      charCode === 0x20 ||  // 空格
      charCode === 0x09 ||  // Tab
      charCode === 0x0A ||  // 换行
      charCode === 0x0D ||  // 回车
      charCode === 0x2C ||  // 逗号
      charCode === 0x2E ||  // 句号
      charCode === 0x3B ||  // 分号
      charCode === 0x3A ||  // 冒号
      charCode === 0x21 ||  // 感叹号
      charCode === 0x3F ||  // 问号
      charCode === 0x29 ||  // 右括号
      charCode === 0x5D ||  // 右方括号
      charCode === 0x7D ||  // 右花括号
      charCode === 0x3E ||  // 大于号
      charCode === undefined // 字符串结尾
    )
  }

  // 添加内联规则解析标签
  md.inline.ruler.before('emphasis', 'hashtag', function(state, silent) {
    const start = state.pos
    const marker = state.src.charCodeAt(start)

    // 检查是否是 # 标记
    if (marker !== 0x23 /* # */) {
      return false
    }

    // 检查 # 前面是否是边界字符（避免匹配 URL 中的 #）
    if (start > 0) {
      const prevChar = state.src.charCodeAt(start - 1)
      if (!isTagBoundary(prevChar)) {
        return false
      }
    }

    // 尝试匹配标签
    const match = state.src.slice(start).match(pattern)
    if (!match) {
      return false
    }

    const tagName = match[1]
    
    // 验证标签名
    if (!isValidTag(tagName)) {
      return false
    }

    // 检查标签后面是否是边界字符
    const endPos = start + match[0].length
    const nextChar = state.src.charCodeAt(endPos)
    if (!isTagBoundary(nextChar)) {
      return false
    }

    if (!silent) {
      const token = state.push('hashtag', '', 0)
      token.content = tagName
      token.meta = {
        tag: tagName
      }
    }

    state.pos = endPos
    return true
  })

  // 渲染标签
  md.renderer.rules.hashtag = function(tokens, idx) {
    const token = tokens[idx]
    const tagName = token.meta.tag
    
    // 构建属性
    const attrs = [
      ['class', className],
      ['data-tag', tagName]
    ]
    
    // 如果提供了点击回调，添加标记
    if (onClick) {
      attrs.push(['data-tag-clickable', 'true'])
    }
    
    const attrsStr = attrs.map(([key, value]) => `${key}="${value}"`).join(' ')
    
    return `<span ${attrsStr}>#${tagName}</span>`
  }

  // 支持多标签语法 #tag1 #tag2 #tag3
  // 这个已经通过上面的规则自动支持了

  // 支持嵌套标签（可选功能）
  if (customOptions.enableNestedTags) {
    md.inline.ruler.before('hashtag', 'nested_hashtag', function(state, silent) {
      const start = state.pos
      const marker = state.src.charCodeAt(start)

      // 检查是否是 # 标记
      if (marker !== 0x23 /* # */) {
        return false
      }

      // 匹配嵌套标签 #parent/child
      const nestedMatch = state.src.slice(start).match(/^#([\w\u4e00-\u9fa5][\w\u4e00-\u9fa5\-_]*(?:\/[\w\u4e00-\u9fa5][\w\u4e00-\u9fa5\-_]*)*)/)
      if (!nestedMatch) {
        return false
      }

      const fullTag = nestedMatch[1]
      const parts = fullTag.split('/')
      
      // 验证所有部分
      if (!parts.every(part => isValidTag(part))) {
        return false
      }

      // 检查标签后面是否是边界字符
      const endPos = start + nestedMatch[0].length
      const nextChar = state.src.charCodeAt(endPos)
      if (!isTagBoundary(nextChar)) {
        return false
      }

      if (!silent) {
        const token = state.push('nested_hashtag', '', 0)
        token.content = fullTag
        token.meta = {
          tag: fullTag,
          parts: parts
        }
      }

      state.pos = endPos
      return true
    })

    md.renderer.rules.nested_hashtag = function(tokens, idx) {
      const token = tokens[idx]
      const { tag, parts } = token.meta
      
      const attrs = [
        ['class', `${className} ${className}-nested`],
        ['data-tag', tag],
        ['data-tag-parts', parts.join(',')]
      ]
      
      if (onClick) {
        attrs.push(['data-tag-clickable', 'true'])
      }
      
      const attrsStr = attrs.map(([key, value]) => `${key}="${value}"`).join(' ')
      
      return `<span ${attrsStr}>#${tag}</span>`
    }
  }
}