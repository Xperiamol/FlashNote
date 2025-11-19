/**
 * 花纹主题插件
 * 
 * 为 FlashNote 添加炫酷的几何花纹背景效果
 * 支持多种花纹样式、透明度调节、动态切换
 */

// 可用的花纹样式
const PATTERN_STYLES = {
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
  }
}

const STYLE_IDS = Object.keys(PATTERN_STYLES)
const STORAGE_KEY_ENABLED = 'pattern-theme-enabled'
const STORAGE_KEY_STYLE = 'pattern-theme-style'
const STORAGE_KEY_OPACITY = 'pattern-theme-opacity'
const STORAGE_KEY_PRIMARY_COLOR = 'pattern-theme-primary-color'

let currentState = {
  enabled: true,
  styleId: 'dots',
  opacity: 1.0,
  primaryColor: '#1976d2' // 默认蓝色
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

  // 获取当前主题色并转换为 RGB
  const primaryColor = getPrimaryColor()
  const rgb = hexToRgb(primaryColor)
  
  // 提取base CSS
  let css = style.css.trim()
  
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

  return `
    /* FlashNote 花纹主题 - ${style.name} (主题色: ${primaryColor}) */
    
    /* 在整个应用容器上添加花纹 */
    #root {
      ${css}
      background-attachment: fixed;
      min-height: 100vh;
    }
    
    /* 在 body 上也添加，作为后备 */
    body {
      ${css}
      background-attachment: fixed;
    }
    
    /* 让待办视图背景透明，显示花纹 */
    #root > div > div > div[style*="backgroundColor"] {
      background-color: transparent !important;
    }
    
    /* 针对特定的背景色组件 */
    .MuiBox-root[style*="grey.50"],
    .MuiBox-root[style*="#121212"] {
      background-color: transparent !important;
    }
  `
}

/**
 * 应用花纹主题
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
  runtime.logger.info('花纹主题已应用', {
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

    if (enabled !== null) currentState.enabled = enabled
    if (styleId !== null && PATTERN_STYLES[styleId]) currentState.styleId = styleId
    if (opacity !== null && opacity >= 0 && opacity <= 2) currentState.opacity = opacity
    if (primaryColor) currentState.primaryColor = primaryColor

    runtime.logger.info('花纹主题状态已加载', currentState)
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
  runtime.logger.info('花纹主题插件已激活')
  
  // 加载保存的状态
  await loadState()
  
  // 记录当前主题色
  runtime.logger.info('当前主题色:', currentState.primaryColor)
  
  // 应用花纹
  await applyPattern()
  
  // 注册命令：切换开关
  runtime.registerCommand(
    { id: 'pattern-theme.toggle', title: '切换花纹主题' },
    async () => {
      try {
        runtime.logger.info('[toggle] 当前状态:', currentState.enabled)
        currentState.enabled = !currentState.enabled
        runtime.logger.info('[toggle] 切换后状态:', currentState.enabled)
        
        await saveState()
        await applyPattern()
        
        await runtime.notifications.show({
          title: '花纹主题',
          body: currentState.enabled ? '已启用花纹效果' : '已禁用花纹效果',
          type: 'success'
        })
        
        return { success: true, enabled: currentState.enabled }
      } catch (error) {
        runtime.logger.error('切换花纹主题失败', error)
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
  
  // 注册命令：设置
  runtime.registerCommand(
    { id: 'pattern-theme.settings', title: '花纹主题设置' },
    async (payload) => {
      try {
        // 接收设置参数
        if (payload && typeof payload.opacity === 'number') {
          currentState.opacity = Math.max(0, Math.min(2, payload.opacity))
          await saveState()
          
          if (currentState.enabled) {
            await applyPattern()
          }
        }
        
        // 接收主题色设置
        if (payload && payload.primaryColor) {
          await setPrimaryColor(payload.primaryColor)
        }
        
        const styleName = PATTERN_STYLES[currentState.styleId].name
        const availableStyles = STYLE_IDS.map(id => ({
          id,
          name: PATTERN_STYLES[id].name
        }))
        
        return {
          success: true,
          currentSettings: {
            enabled: currentState.enabled,
            style: currentState.styleId,
            styleName,
            opacity: currentState.opacity,
            primaryColor: currentState.primaryColor
          },
          availableStyles
        }
      } catch (error) {
        runtime.logger.error('获取设置失败', error)
        return { success: false, error: error.message }
      }
    }
  )
  
  runtime.logger.info('花纹主题插件命令已注册')
})

runtime.onDeactivate(async () => {
  // 清理所有样式
  await runtime.theme.unregisterGlobalStyle('main-pattern')
  runtime.logger.info('花纹主题插件已停用')
})
