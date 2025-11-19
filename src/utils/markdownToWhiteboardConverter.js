/**
 * Markdown 到白板（Excalidraw）的转换工具
 * 将 Markdown 文本内容转换为 Excalidraw 元素
 */

/**
 * 解析 Markdown 内容，提取标题和段落
 * @param {string} content - Markdown 内容
 * @returns {Array} 解析后的文本块数组
 */
function parseMarkdown(content) {
  if (!content || typeof content !== 'string') {
    return []
  }

  const lines = content.split('\n')
  const blocks = []
  
  for (const line of lines) {
    const trimmedLine = line.trim()
    
    // 跳过空行
    if (trimmedLine === '') continue
    
    // 识别标题级别 (# H1, ## H2, etc.)
    const headerMatch = trimmedLine.match(/^(#{1,6})\s+(.+)$/)
    if (headerMatch) {
      const level = headerMatch[1].length
      const text = headerMatch[2]
      blocks.push({
        type: 'header',
        level: level,
        text: text,
        fontSize: getHeaderFontSize(level)
      })
    } else {
      // 普通文本段落
      blocks.push({
        type: 'paragraph',
        text: trimmedLine,
        fontSize: 16
      })
    }
  }
  
  return blocks
}

/**
 * 根据标题级别获取字体大小
 * @param {number} level - 标题级别 (1-6)
 * @returns {number} 字体大小（px）
 */
function getHeaderFontSize(level) {
  const sizes = {
    1: 32,
    2: 28,
    3: 24,
    4: 20,
    5: 18,
    6: 16
  }
  return sizes[level] || 16
}

/**
 * 生成唯一的元素 ID
 * @returns {string} 唯一 ID
 */
function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

/**
 * 将解析的文本块转换为 Excalidraw 文本元素
 * @param {Array} blocks - 解析后的文本块数组
 * @returns {Array} Excalidraw 元素数组
 */
function generateExcalidrawElements(blocks) {
  const elements = []
  let currentY = 100 // 起始Y坐标
  const startX = 100 // 起始X坐标
  const lineSpacing = 20 // 基础行间距
  const maxWidth = 800 // 文本框最大宽度
  
  blocks.forEach((block) => {
    // 计算文本框高度（根据字体大小）
    const lineHeight = block.fontSize * 1.5
    const estimatedLines = Math.ceil(block.text.length / 50) // 粗略估算行数
    const height = lineHeight * Math.max(1, estimatedLines)
    
    // 创建 Excalidraw 文本元素
    const element = {
      id: generateId(),
      type: 'text',
      x: startX,
      y: currentY,
      width: maxWidth,
      height: height,
      angle: 0,
      strokeColor: '#1e1e1e',
      backgroundColor: 'transparent',
      fillStyle: 'solid',
      strokeWidth: 1,
      strokeStyle: 'solid',
      roughness: 0,
      opacity: 100,
      groupIds: [],
      frameId: null,
      roundness: null,
      seed: Math.floor(Math.random() * 1000000),
      version: 1,
      versionNonce: Math.floor(Math.random() * 1000000),
      isDeleted: false,
      boundElements: null,
      updated: Date.now(),
      link: null,
      locked: false,
      text: block.text,
      fontSize: block.fontSize,
      fontFamily: 1, // Excalidraw 默认字体
      textAlign: 'left',
      verticalAlign: 'top',
      baseline: block.fontSize,
      containerId: null,
      originalText: block.text,
      lineHeight: 1.25
    }
    
    elements.push(element)
    
    // 计算下一个元素的Y坐标
    currentY += height + lineSpacing
    
    // 标题后额外间距
    if (block.type === 'header') {
      currentY += lineSpacing * 1.5
    }
  })
  
  return elements
}

/**
 * 将 Markdown 内容转换为白板数据
 * @param {string} markdownContent - Markdown 文本内容
 * @returns {string} JSON 格式的白板数据
 */
export function convertMarkdownToWhiteboard(markdownContent) {
  try {
    // 1. 解析 Markdown
    const blocks = parseMarkdown(markdownContent)
    
    // 如果没有内容，返回空白板
    if (blocks.length === 0) {
      return JSON.stringify({
        type: 'excalidraw',
        version: 2,
        source: 'flashnote-local',
        elements: [],
        appState: {
          viewBackgroundColor: '#ffffff',
          currentItemFontFamily: 1,
          gridSize: null
        },
        fileMap: {}
      })
    }
    
    // 2. 生成 Excalidraw 元素
    const elements = generateExcalidrawElements(blocks)
    
    // 3. 构建完整的白板数据
    const whiteboardData = {
      type: 'excalidraw',
      version: 2,
      source: 'flashnote-local',
      elements: elements,
      appState: {
        viewBackgroundColor: '#ffffff',
        currentItemFontFamily: 1,
        gridSize: null
      },
      fileMap: {}
    }
    
    return JSON.stringify(whiteboardData)
  } catch (error) {
    console.error('[markdownToWhiteboardConverter] 转换失败:', error)
    throw new Error('Markdown 转换失败: ' + error.message)
  }
}

/**
 * 预览转换结果（用于调试）
 * @param {string} markdownContent - Markdown 文本内容
 * @returns {Object} 包含元素数量和预览信息的对象
 */
export function previewConversion(markdownContent) {
  const blocks = parseMarkdown(markdownContent)
  const elements = generateExcalidrawElements(blocks)
  
  return {
    blockCount: blocks.length,
    elementCount: elements.length,
    blocks: blocks,
    preview: elements.map(el => ({
      type: el.type,
      text: el.text.substring(0, 50) + (el.text.length > 50 ? '...' : ''),
      fontSize: el.fontSize,
      position: { x: el.x, y: el.y }
    }))
  }
}