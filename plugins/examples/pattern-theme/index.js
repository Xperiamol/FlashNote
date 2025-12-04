/**
 * 主题外观插件
 * 
 * 为 FlashNote 添加炫酷的几何花纹背景效果
 * 支持多种花纹样式、透明度调节、动态切换
 */

// 可用的花纹样式
const PATTERN_STYLES = {
  custom: {
    name: '自定义图片',
    css: '', // 将在运行时动态生成
    isCustom: true
  },
  dots: {
    name: '圆点',
    css: `
      background-image: radial-gradient(circle, rgba(99, 102, 241, 0.06) 1px, transparent 1px);
      background-size: 20px 20px;
    `
  },
  grid: {
    name: '网格',
    css: `
      background-image: 
        linear-gradient(rgba(99, 102, 241, 0.04) 1px, transparent 1px),
        linear-gradient(90deg, rgba(99, 102, 241, 0.04) 1px, transparent 1px);
      background-size: 30px 30px;
    `
  },
  diagonal: {
    name: '斜纹',
    css: `
      background-image: repeating-linear-gradient(
        45deg,
        transparent,
        transparent 10px,
        rgba(99, 102, 241, 0.03) 10px,
        rgba(99, 102, 241, 0.03) 20px
      );
    `
  },
  hexagon: {
    name: '蜂窝',
    css: `
      background-image: 
        linear-gradient(30deg, transparent 49%, rgba(99, 102, 241, 0.04) 49%, rgba(99, 102, 241, 0.04) 51%, transparent 51%),
        linear-gradient(-30deg, transparent 49%, rgba(99, 102, 241, 0.04) 49%, rgba(99, 102, 241, 0.04) 51%, transparent 51%),
        linear-gradient(90deg, transparent 49%, rgba(99, 102, 241, 0.04) 49%, rgba(99, 102, 241, 0.04) 51%, transparent 51%);
      background-size: 40px 70px;
    `
  },
  waves: {
    name: '波浪',
    css: `
      background-image: 
        radial-gradient(ellipse at 50% 50%, transparent 60%, rgba(99, 102, 241, 0.03) 60%),
        radial-gradient(ellipse at 50% 50%, rgba(99, 102, 241, 0.02) 0%, transparent 50%);
      background-size: 50px 50px;
      background-position: 0 0, 25px 25px;
    `
  },
  circuit: {
    name: '电路',
    css: `
      background-image: 
        linear-gradient(rgba(99, 102, 241, 0.02) 2px, transparent 2px),
        linear-gradient(90deg, rgba(99, 102, 241, 0.02) 2px, transparent 2px),
        linear-gradient(rgba(99, 102, 241, 0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(99, 102, 241, 0.03) 1px, transparent 1px);
      background-size: 50px 50px, 50px 50px, 10px 10px, 10px 10px;
      background-position: -2px -2px, -2px -2px, -1px -1px, -1px -1px;
    `
  },
  zigzag: {
    name: '之字形',
    css: `
      background-image: 
        linear-gradient(135deg, transparent 25%, rgba(99, 102, 241, 0.03) 25%, rgba(99, 102, 241, 0.03) 50%, transparent 50%, transparent 75%, rgba(99, 102, 241, 0.03) 75%),
        linear-gradient(45deg, transparent 25%, rgba(99, 102, 241, 0.03) 25%, rgba(99, 102, 241, 0.03) 50%, transparent 50%, transparent 75%, rgba(99, 102, 241, 0.03) 75%);
      background-size: 30px 30px;
      background-position: 0 0, 15px 15px;
    `
  },
  diamonds: {
    name: '菱形',
    css: `
      background-image: 
        linear-gradient(45deg, transparent 40%, rgba(99, 102, 241, 0.04) 40%, rgba(99, 102, 241, 0.04) 60%, transparent 60%),
        linear-gradient(-45deg, transparent 40%, rgba(99, 102, 241, 0.04) 40%, rgba(99, 102, 241, 0.04) 60%, transparent 60%);
      background-size: 40px 40px;
    `
  },
  trees: {
    name: '森林',
    css: `
      background-image: 
        radial-gradient(ellipse 3px 25px at 50% 85%, rgba(99, 102, 241, 0.06) 0%, rgba(99, 102, 241, 0.04) 40%, transparent 70%),
        radial-gradient(ellipse 4px 30px at 50% 82%, rgba(99, 102, 241, 0.05) 0%, rgba(99, 102, 241, 0.03) 50%, transparent 80%),
        radial-gradient(ellipse 2.5px 20px at 50% 87%, rgba(99, 102, 241, 0.04) 0%, rgba(99, 102, 241, 0.02) 45%, transparent 75%),
        radial-gradient(ellipse 15px 20px at 50% 70%, rgba(99, 102, 241, 0.03) 0%, transparent 60%),
        radial-gradient(ellipse 12px 18px at 50% 72%, rgba(99, 102, 241, 0.04) 0%, transparent 55%),
        radial-gradient(ellipse 10px 15px at 50% 74%, rgba(99, 102, 241, 0.02) 0%, transparent 50%);
      background-size: 45px 120px, 35px 100px, 28px 90px, 45px 120px, 35px 100px, 28px 90px;
      background-position: 0 100%, 15px 100%, 32px 100%, 0 100%, 15px 100%, 32px 100%;
    `
  },
  mountains: {
    name: '群山',
    css: `
      background-image: 
        radial-gradient(ellipse 100px 60px at 50% 100%, rgba(99, 102, 241, 0.02) 0%, rgba(99, 102, 241, 0.04) 30%, rgba(99, 102, 241, 0.06) 50%, transparent 70%),
        radial-gradient(ellipse 80px 50px at 50% 100%, rgba(99, 102, 241, 0.03) 0%, rgba(99, 102, 241, 0.05) 40%, transparent 65%),
        radial-gradient(ellipse 60px 40px at 50% 100%, rgba(99, 102, 241, 0.04) 0%, rgba(99, 102, 241, 0.06) 35%, transparent 60%),
        linear-gradient(0deg, rgba(99, 102, 241, 0.01) 0%, transparent 40%);
      background-size: 200px 120px, 150px 100px, 100px 80px, 100% 100%;
      background-position: 0 100%, 80px 100%, 140px 100%, 0 0;
    `
  },
  clouds: {
    name: '云朵',
    css: `
      background-image: 
        radial-gradient(circle 18px at 35% 50%, rgba(99, 102, 241, 0.03) 0%, rgba(99, 102, 241, 0.02) 50%, transparent 70%),
        radial-gradient(circle 16px at 65% 50%, rgba(99, 102, 241, 0.03) 0%, rgba(99, 102, 241, 0.02) 50%, transparent 70%),
        radial-gradient(circle 20px at 50% 45%, rgba(99, 102, 241, 0.04) 0%, rgba(99, 102, 241, 0.02) 45%, transparent 65%),
        radial-gradient(circle 14px at 25% 55%, rgba(99, 102, 241, 0.02) 0%, transparent 60%),
        radial-gradient(circle 14px at 75% 55%, rgba(99, 102, 241, 0.02) 0%, transparent 60%);
      background-size: 100px 50px;
      background-position: 0 20px;
    `
  },
  stars: {
    name: '星空',
    css: `
      background-image: 
        radial-gradient(circle at 20% 30%, rgba(99, 102, 241, 0.08) 1px, transparent 1px),
        radial-gradient(circle at 60% 70%, rgba(99, 102, 241, 0.06) 1px, transparent 1px),
        radial-gradient(circle at 40% 50%, rgba(99, 102, 241, 0.07) 2px, transparent 2px),
        radial-gradient(circle at 80% 20%, rgba(99, 102, 241, 0.09) 1px, transparent 1px),
        radial-gradient(circle at 10% 80%, rgba(99, 102, 241, 0.05) 1px, transparent 1px);
      background-size: 100px 100px, 120px 120px, 80px 80px, 140px 140px, 90px 90px;
      background-position: 0 0, 30px 30px, 60px 10px, 20px 50px, 80px 70px;
    `
  },
  cityscape: {
    name: '城市',
    css: `
      background-image: 
        linear-gradient(0deg, transparent 0%, transparent 60%, rgba(99, 102, 241, 0.05) 60%, rgba(99, 102, 241, 0.05) 100%),
        linear-gradient(0deg, transparent 0%, transparent 40%, rgba(99, 102, 241, 0.06) 40%, rgba(99, 102, 241, 0.06) 100%),
        linear-gradient(0deg, transparent 0%, transparent 70%, rgba(99, 102, 241, 0.04) 70%, rgba(99, 102, 241, 0.04) 100%),
        linear-gradient(0deg, transparent 0%, transparent 50%, rgba(99, 102, 241, 0.05) 50%, rgba(99, 102, 241, 0.05) 100%);
      background-size: 40px 100px, 60px 100px, 35px 100px, 50px 100px;
      background-position: 0 100%, 40px 100%, 100px 100%, 135px 100%;
    `
  },
  rain: {
    name: '细雨',
    css: `
      background-image: 
        linear-gradient(180deg, transparent 0%, transparent 90%, rgba(99, 102, 241, 0.06) 90%, rgba(99, 102, 241, 0.06) 100%),
        linear-gradient(180deg, transparent 0%, transparent 85%, rgba(99, 102, 241, 0.05) 85%, rgba(99, 102, 241, 0.05) 100%),
        linear-gradient(180deg, transparent 0%, transparent 88%, rgba(99, 102, 241, 0.04) 88%, rgba(99, 102, 241, 0.04) 100%);
      background-size: 8px 40px, 10px 50px, 6px 35px;
      background-position: 0 0, 15px 10px, 30px 5px;
    `
  },
  leaves: {
    name: '落叶',
    css: `
      background-image: 
        radial-gradient(ellipse 20px 12px at 40% 50%, rgba(99, 102, 241, 0.04) 0%, rgba(99, 102, 241, 0.03) 40%, transparent 65%),
        radial-gradient(ellipse 18px 10px at 60% 50%, rgba(99, 102, 241, 0.03) 0%, rgba(99, 102, 241, 0.02) 45%, transparent 70%),
        linear-gradient(135deg, transparent 48%, rgba(99, 102, 241, 0.02) 48%, rgba(99, 102, 241, 0.02) 52%, transparent 52%),
        radial-gradient(ellipse 15px 9px at 30% 60%, rgba(99, 102, 241, 0.03) 0%, transparent 60%),
        radial-gradient(ellipse 16px 10px at 70% 40%, rgba(99, 102, 241, 0.02) 0%, transparent 55%);
      background-size: 70px 40px, 70px 40px, 70px 40px, 70px 40px, 70px 40px;
      background-position: 0 0, 0 0, 0 0, 35px 20px, 35px 20px;
    `
  },
  ocean: {
    name: '海洋',
    css: `
      background-image: 
        radial-gradient(ellipse 100px 15px at 50% 50%, rgba(99, 102, 241, 0.02) 0%, rgba(99, 102, 241, 0.04) 40%, rgba(99, 102, 241, 0.02) 80%, transparent 100%),
        radial-gradient(ellipse 80px 12px at 50% 50%, rgba(99, 102, 241, 0.03) 0%, rgba(99, 102, 241, 0.05) 45%, rgba(99, 102, 241, 0.02) 85%, transparent 100%),
        radial-gradient(ellipse 60px 10px at 50% 50%, rgba(99, 102, 241, 0.02) 0%, rgba(99, 102, 241, 0.03) 50%, transparent 100%),
        linear-gradient(90deg, transparent 0%, rgba(99, 102, 241, 0.01) 50%, transparent 100%);
      background-size: 200px 30px, 150px 25px, 100px 20px, 100% 15px;
      background-position: 0 0, 75px 15px, 150px 22px, 0 0;
    `
  },
  bokeh: {
    name: '光斑',
    css: `
      background-image: 
        radial-gradient(circle 60px at 20% 30%, rgba(99, 102, 241, 0.03) 0%, rgba(99, 102, 241, 0.03) 50%, transparent 50%),
        radial-gradient(circle 40px at 70% 60%, rgba(99, 102, 241, 0.04) 0%, rgba(99, 102, 241, 0.04) 50%, transparent 50%),
        radial-gradient(circle 50px at 50% 80%, rgba(99, 102, 241, 0.05) 0%, rgba(99, 102, 241, 0.05) 50%, transparent 50%);
      background-size: 120px 120px;
      background-position: 0 0;
    `
  },
  sakura: {
    name: '樱花',
    css: `
      background-image: 
        radial-gradient(ellipse 8px 12px at 50% 45%, rgba(99, 102, 241, 0.05) 0%, rgba(99, 102, 241, 0.03) 60%, transparent 100%),
        radial-gradient(ellipse 8px 12px at 35% 60%, rgba(99, 102, 241, 0.04) 0%, rgba(99, 102, 241, 0.02) 55%, transparent 100%),
        radial-gradient(ellipse 8px 12px at 65% 60%, rgba(99, 102, 241, 0.04) 0%, rgba(99, 102, 241, 0.02) 55%, transparent 100%),
        radial-gradient(ellipse 8px 12px at 42% 75%, rgba(99, 102, 241, 0.03) 0%, rgba(99, 102, 241, 0.02) 50%, transparent 100%),
        radial-gradient(ellipse 8px 12px at 58% 75%, rgba(99, 102, 241, 0.03) 0%, rgba(99, 102, 241, 0.02) 50%, transparent 100%),
        radial-gradient(circle 3px at 50% 62%, rgba(99, 102, 241, 0.06) 0%, rgba(99, 102, 241, 0.04) 40%, transparent 100%);
      background-size: 60px 60px;
      background-position: 0 0;
    `
  },
  geometry: {
    name: '几何',
    css: `
      background-image: 
        linear-gradient(60deg, transparent 0%, transparent 30%, rgba(99, 102, 241, 0.04) 30%, rgba(99, 102, 241, 0.04) 33%, transparent 33%, transparent 100%),
        linear-gradient(120deg, transparent 0%, transparent 30%, rgba(99, 102, 241, 0.04) 30%, rgba(99, 102, 241, 0.04) 33%, transparent 33%, transparent 100%),
        linear-gradient(0deg, transparent 0%, transparent 47%, rgba(99, 102, 241, 0.03) 47%, rgba(99, 102, 241, 0.03) 53%, transparent 53%, transparent 100%);
      background-size: 60px 100px;
    `
  },
  paper: {
    name: '纸张',
    css: `
      background-image: 
        linear-gradient(90deg, transparent 0%, rgba(99, 102, 241, 0.01) 50%, transparent 100%),
        linear-gradient(0deg, transparent 0%, rgba(99, 102, 241, 0.01) 50%, transparent 100%),
        repeating-linear-gradient(0deg, transparent 0px, transparent 1px, rgba(99, 102, 241, 0.02) 1px, rgba(99, 102, 241, 0.02) 2px);
      background-size: 3px 3px, 3px 3px, 100% 2px;
      background-position: 0 0, 0 0, 0 0;
    `
  }
}

const STYLE_IDS = Object.keys(PATTERN_STYLES)
const STORAGE_KEY_ENABLED = 'pattern-theme-enabled'
const STORAGE_KEY_STYLE = 'pattern-theme-style'
const STORAGE_KEY_OPACITY = 'pattern-theme-opacity'
const STORAGE_KEY_PRIMARY_COLOR = 'pattern-theme-primary-color'
const STORAGE_KEY_CUSTOM_IMAGE = 'pattern-theme-custom-image'
const STORAGE_KEY_MASK_MODE = 'pattern-theme-mask-mode'

let currentState = {
  enabled: true,
  styleId: 'dots',
  opacity: 1.0,
  primaryColor: '#1976d2', // 默认蓝色
  customImageUrl: null, // 自定义图片URL
  maskMode: 'full' // 显示模式: 'editor' = 仅覆盖笔记编辑区, 'toolbar' = 仅覆盖按钮/工具栏区, 'full' = 全屏显示
}

/**
 * 从应用获取当前主题色
 */
function getPrimaryColor() {
  // 直接使用存储的主题色
  return currentState.primaryColor
}

/**
 * 将十六进制颜色转换为 RGB
 */
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 99, g: 102, b: 241 } // 默认颜色
}

/**
 * 生成当前样式的CSS
 */
function generatePatternCSS() {
  const style = PATTERN_STYLES[currentState.styleId]
  if (!style) return ''

  let css = ''

  // 如果是自定义图片样式
  if (style.isCustom && currentState.customImageUrl) {
    css = `
      background-image: url('${currentState.customImageUrl}');
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
      opacity: ${currentState.opacity};
    `
  } else {
    // 获取当前主题色并转换为 RGB
    const primaryColor = getPrimaryColor()
    const rgb = hexToRgb(primaryColor)

    // 提取base CSS
    css = style.css.trim()

    // 替换所有硬编码的颜色为主题色
    // 将 rgba(99, 102, 241, x) 替换为主题色
    css = css.replace(/rgba\(99,\s*102,\s*241,\s*([\d.]+)\)/g, (match, alpha) => {
      const newAlpha = parseFloat(alpha) * currentState.opacity
      return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${newAlpha.toFixed(3)})`
    })

    // 也处理其他可能的格式
    css = css.replace(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/g, (match, r, g, b, a) => {
      // 如果是默认的 indigo 色，替换为主题色
      if (r === '99' && g === '102' && b === '241') {
        const newAlpha = parseFloat(a) * currentState.opacity
        return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${newAlpha.toFixed(3)})`
      }
      // 其他颜色保持不变，只调整透明度
      const newAlpha = parseFloat(a) * currentState.opacity
      return `rgba(${r}, ${g}, ${b}, ${newAlpha.toFixed(3)})`
    })
  }

  // 根据显示模式生成不同的CSS
  let modeDescription = '全屏'
  let targetSelector = 'body::before'
  let positionCSS = `
      content: '';
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      ${css}
      background-attachment: fixed;
      pointer-events: none;
      z-index: 0;`

  if (currentState.maskMode === 'editor') {
    // 仅覆盖笔记编辑区
    modeDescription = '仅编辑区'
    return `
    /* FlashNote 主题外观 - ${style.name} (主题色: ${getPrimaryColor()}, 显示模式: ${modeDescription}) */
    
    /* 仅在笔记编辑区域显示花纹 */
    .note-editor-content::before,
    .MuiBox-root[class*="NoteEditor"]::before,
    [class*="editor-container"]::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      ${css}
      background-attachment: local;
      pointer-events: none;
      z-index: 0;
      border-radius: inherit;
    }
    
    .note-editor-content,
    .MuiBox-root[class*="NoteEditor"],
    [class*="editor-container"] {
      position: relative;
    }
  `
  } else if (currentState.maskMode === 'toolbar') {
    // 仅覆盖按钮/工具栏区
    modeDescription = '仅工具栏'
    return `
    /* FlashNote 主题外观 - ${style.name} (主题色: ${getPrimaryColor()}, 显示模式: ${modeDescription}) */
    
    /* 仅在工具栏和侧边栏显示花纹 */
    .MuiToolbar-root::before,
    .MuiDrawer-paper::before,
    .MuiAppBar-root::before,
    [class*="Sidebar"]::before,
    [class*="toolbar"]::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      ${css}
      background-attachment: local;
      pointer-events: none;
      z-index: 0;
      border-radius: inherit;
    }
    
    .MuiToolbar-root,
    .MuiDrawer-paper,
    .MuiAppBar-root,
    [class*="Sidebar"],
    [class*="toolbar"] {
      position: relative;
    }
  `
  }

  // 默认全屏显示
  return `
    /* FlashNote 主题外观 - ${style.name} (主题色: ${getPrimaryColor()}, 显示模式: ${modeDescription}) */
    
    /* 使用伪元素作为壁纸层 */
    body::before {
      ${positionCSS}
    }
    
    /* 确保内容在花纹之上 */
    #root {
      position: relative;
      z-index: 1;
    }
    
    /* 让主要内容区域背景稍微透明，能看到花纹 */
    #root > div {
      position: relative;
    }
  `
}

/**
 * 应用主题外观
 */
async function applyPattern() {
  runtime.logger.info('[applyPattern] 开始应用花纹', { enabled: currentState.enabled, styleId: currentState.styleId })

  if (!currentState.enabled) {
    runtime.logger.info('[applyPattern] 花纹已禁用，移除样式')
    await runtime.theme.unregisterGlobalStyle('main-pattern')
    return
  }

  const css = generatePatternCSS()
  runtime.logger.info('[applyPattern] 生成的CSS长度:', css.length)

  const result = await runtime.theme.registerGlobalStyle('main-pattern', css, {
    priority: 10 // 低优先级，确保不覆盖其他样式
  })

  runtime.logger.info('[applyPattern] 注册结果:', result)
  runtime.logger.info('主题外观已应用', {
    style: PATTERN_STYLES[currentState.styleId].name,
    opacity: currentState.opacity
  })
}

/**
 * 保存状态到存储
 */
async function saveState() {
  await runtime.storage.setItem(STORAGE_KEY_ENABLED, currentState.enabled)
  await runtime.storage.setItem(STORAGE_KEY_STYLE, currentState.styleId)
  await runtime.storage.setItem(STORAGE_KEY_OPACITY, currentState.opacity)
  await runtime.storage.setItem(STORAGE_KEY_PRIMARY_COLOR, currentState.primaryColor)
  await runtime.storage.setItem(STORAGE_KEY_MASK_MODE, currentState.maskMode)
  if (currentState.customImageUrl) {
    await runtime.storage.setItem(STORAGE_KEY_CUSTOM_IMAGE, currentState.customImageUrl)
  }
}

/**
 * 从存储加载状态
 */
async function loadState() {
  try {
    const enabled = await runtime.storage.getItem(STORAGE_KEY_ENABLED)
    const styleId = await runtime.storage.getItem(STORAGE_KEY_STYLE)
    const opacity = await runtime.storage.getItem(STORAGE_KEY_OPACITY)
    const primaryColor = await runtime.storage.getItem(STORAGE_KEY_PRIMARY_COLOR)
    const customImageUrl = await runtime.storage.getItem(STORAGE_KEY_CUSTOM_IMAGE)

    if (enabled !== null) currentState.enabled = enabled
    if (styleId !== null && PATTERN_STYLES[styleId]) currentState.styleId = styleId
    if (opacity !== null && opacity >= 0 && opacity <= 2) currentState.opacity = opacity
    if (primaryColor) currentState.primaryColor = primaryColor
    if (customImageUrl) currentState.customImageUrl = customImageUrl

    runtime.logger.info('主题外观状态已加载', currentState)
  } catch (error) {
    runtime.logger.error('加载状态失败', error)
  }
}

/**
 * 设置主题色
 */
async function setPrimaryColor(color) {
  if (!color || !/^#[0-9A-Fa-f]{6}$/.test(color)) {
    runtime.logger.warn('无效的颜色格式:', color)
    return
  }

  currentState.primaryColor = color
  await saveState()

  // 重新应用花纹
  if (currentState.enabled) {
    await applyPattern()
  }

  runtime.logger.info('主题色已更新:', color)
}

// ============ 插件生命周期 ============

runtime.onActivate(async () => {
  runtime.logger.info('主题外观插件已激活')

  // 加载保存的状态
  await loadState()

  // 记录当前主题色
  runtime.logger.info('当前主题色:', currentState.primaryColor)

  // 应用花纹
  await applyPattern()

  // 注册命令：切换开关
  runtime.registerCommand(
    { id: 'pattern-theme.toggle', title: '切换主题外观' },
    async () => {
      try {
        runtime.logger.info('[toggle] 当前状态:', currentState.enabled)
        currentState.enabled = !currentState.enabled
        runtime.logger.info('[toggle] 切换后状态:', currentState.enabled)

        await saveState()
        await applyPattern()

        await runtime.notifications.show({
          title: '主题外观',
          body: currentState.enabled ? '已启用花纹效果' : '已禁用花纹效果',
          type: 'success'
        })

        return { success: true, enabled: currentState.enabled }
      } catch (error) {
        runtime.logger.error('切换主题外观失败', error)
        return { success: false, error: error.message }
      }
    }
  )

  // 注册命令：切换样式
  runtime.registerCommand(
    { id: 'pattern-theme.next-style', title: '下一个花纹样式' },
    async () => {
      try {
        const currentIndex = STYLE_IDS.indexOf(currentState.styleId)
        const nextIndex = (currentIndex + 1) % STYLE_IDS.length
        currentState.styleId = STYLE_IDS[nextIndex]

        await saveState()

        if (currentState.enabled) {
          await applyPattern()
        }

        const styleName = PATTERN_STYLES[currentState.styleId].name

        await runtime.notifications.show({
          title: '花纹样式',
          body: `已切换到: ${styleName}`,
          type: 'info'
        })

        return { success: true, style: currentState.styleId, name: styleName }
      } catch (error) {
        runtime.logger.error('切换花纹样式失败', error)
        return { success: false, error: error.message }
      }
    }
  )

  // 注册命令：设置（打开设置面板或处理设置更新）
  runtime.registerCommand(
    { id: 'pattern-theme.settings', title: '主题外观设置' },
    async (payload) => {
      try {
        // 如果 payload 明确请求获取设置或更新设置
        if (payload && (payload.getSettings || payload.opacity !== undefined || payload.primaryColor || payload.customImage !== undefined || payload.style || payload.enabled !== undefined || payload.maskMode)) {
          // 接收开关状态
          if (typeof payload.enabled === 'boolean' && payload.enabled !== currentState.enabled) {
            currentState.enabled = payload.enabled
            await saveState()
            await applyPattern()
          }

          // 接收自定义图片（优先处理，因为可能影响样式选择）
          if (payload.customImage !== undefined) {
            currentState.customImageUrl = payload.customImage
            // 如果删除了图片且当前是自定义样式，切换到默认样式
            if (!payload.customImage && currentState.styleId === 'custom') {
              currentState.styleId = 'dots'
            }
            // 如果上传了新图片，自动切换到自定义样式
            else if (payload.customImage && currentState.styleId !== 'custom') {
              currentState.styleId = 'custom'
            }
          }

          // 接收样式设置（在自定义图片之后处理，确保用户选择的样式生效）
          if (payload.style && STYLE_IDS.includes(payload.style)) {
            currentState.styleId = payload.style
          }

          // 接收透明度参数
          if (typeof payload.opacity === 'number') {
            currentState.opacity = Math.max(0, Math.min(2, payload.opacity))
          }

          // 接收显示模式
          if (payload.maskMode && ['editor', 'toolbar', 'full'].includes(payload.maskMode)) {
            currentState.maskMode = payload.maskMode
          }

          // 接收主题色设置
          if (payload.primaryColor) {
            await setPrimaryColor(payload.primaryColor)
            return // setPrimaryColor 已经会保存状态和应用样式
          }

          // 统一保存状态并应用（避免多次重复应用）
          await saveState()
          if (currentState.enabled) {
            await applyPattern()
          }

          const styleName = PATTERN_STYLES[currentState.styleId].name
          const availableStyles = STYLE_IDS.map(id => ({
            id,
            name: PATTERN_STYLES[id].name,
            isCustom: PATTERN_STYLES[id].isCustom || false
          }))

          return {
            success: true,
            currentSettings: {
              enabled: currentState.enabled,
              style: currentState.styleId,
              styleName,
              opacity: currentState.opacity,
              primaryColor: currentState.primaryColor,
              customImageUrl: currentState.customImageUrl,
              maskMode: currentState.maskMode
            },
            availableStyles
          }
        }

        // 如果没有 payload，说明是从命令面板调用，打开设置窗口
        runtime.logger.info('[pattern-theme.settings] 打开设置窗口')
        await runtime.ui.openWindow({
          url: 'settings.html',
          title: '主题外观设置',
          width: 800,
          height: 700
        })

        return { success: true, status: 'opened' }
      } catch (error) {
        runtime.logger.error('设置操作失败', error)
        return { success: false, error: error.message }
      }
    }
  )

  runtime.logger.info('主题外观插件命令已注册')
})

runtime.onDeactivate(async () => {
  // 清理所有样式
  await runtime.theme.unregisterGlobalStyle('main-pattern')
  runtime.logger.info('主题外观插件已停用')
})
