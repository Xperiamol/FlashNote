/**
 * 通用样式常量 - 统一管理组件间重复的 sx 样式
 * 减少样式碎片化，提高可维护性
 */

// ========== 间距相关 ==========
export const spacing = {
  mb1: { mb: 1 },
  mb2: { mb: 2 },
  mb3: { mb: 3 },
  mt1: { mt: 1 },
  mt2: { mt: 2 },
  mt3: { mt: 3 },
  mt4: { mt: 4 },
  p3: { p: 3 },
  py4: { py: 4 }
};

// ========== Flexbox 布局 ==========
export const flex = {
  // 基础 flex 容器
  row: { display: 'flex', alignItems: 'center' },
  rowGap1: { display: 'flex', alignItems: 'center', gap: 1 },
  rowGap2: { display: 'flex', alignItems: 'center', gap: 2 },
  
  // 水平布局变体
  rowWrap: { display: 'flex', alignItems: 'center', flexWrap: 'wrap' },
  rowGap1Wrap: { display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' },
  rowGap2Wrap: { display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' },
  
  // 垂直布局
  column: { display: 'flex', flexDirection: 'column' },
  columnGap1: { display: 'flex', flexDirection: 'column', gap: 1 },
  
  // 居中对齐
  center: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
  centerColumn: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
  spaceBetween: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  
  // 伸展容器
  flex1: { flex: 1 },
  flexAuto: { flex: 1, overflow: 'auto' }
};

// ========== 文本样式 ==========
export const text = {
  // 标题样式组合（复用场景：section title + margin）
  sectionTitle: { mb: 1 },
  subsectionTitle: { mb: 1.5, fontWeight: 700 },
  caption: { display: 'block', mb: 2 },
  captionBlock: { display: 'block' }
};

// ========== 容器尺寸 ==========
export const container = {
  fullWidth: { width: '100%' },
  fullHeight: { height: '100%' },
  maxWidth1200: { width: '100%', maxWidth: '1200px', mx: 'auto' },
  textCenter: { textAlign: 'center' }
};

// ========== 图标尺寸（统一 icon fontSize） ==========
export const iconSize = {
  small: { fontSize: 20 },
  medium: { fontSize: 24 },
  large: { fontSize: 28 }
};

// ========== 颜色组合（icon + color 常见组合） ==========
export const iconWithColor = {
  disabled: { fontSize: 20, color: 'text.disabled' },
  warning: { fontSize: 20, color: 'warning.main' },
  primary: { fontSize: 20, color: 'primary.main' },
  error: { fontSize: 20, color: 'error.main' },
  success: { fontSize: 20, color: 'success.main' }
};

// ========== 输入框尺寸 ==========
export const input = {
  width60: { width: 60 },
  minWidth80: { minWidth: 80 },
  minWidth160: { minWidth: 160 },
  minWidth200: { minWidth: 200 }
};

// ========== 组合样式（常用场景预设） ==========
export const combo = {
  // Alert 常见间距
  alertMb2: { mb: 2 },
  
  // Section 容器
  section: { mb: 3 },
  
  // 固定宽度列
  col80: { minWidth: 80, maxWidth: 80 },
  col160: { minWidth: 160, maxWidth: 160 },
  
  // 位置布局
  relative: { position: 'relative' }
};

// ========== 滚动条样式 ==========
const scrollbarBase = {
  scrollbarWidth: 'thin',
  scrollbarColor: 'rgba(150, 150, 150, 0.2) transparent',
  '&::-webkit-scrollbar': {
    width: 6,
    height: 6
  },
  '&::-webkit-scrollbar-track': {
    backgroundColor: 'transparent'
  },
  '&::-webkit-scrollbar-thumb': {
    backgroundColor: 'rgba(150, 150, 150, 0.2)',
    borderRadius: 3,
    transition: 'background-color 0.2s ease'
  },
  '&::-webkit-scrollbar-thumb:hover': {
    backgroundColor: 'rgba(150, 150, 150, 0.4)'
  },
  '&::-webkit-scrollbar-thumb:active': {
    backgroundColor: 'rgba(150, 150, 150, 0.5)'
  }
};

export const scrollbar = {
  default: scrollbarBase,
  auto: {
    overflow: 'auto',
    ...scrollbarBase
  },
  hidden: {
    scrollbarWidth: 'none',
    '&::-webkit-scrollbar': {
      display: 'none'
    }
  }
};

// ========== 合并样式辅助函数 ==========
/**
 * 合并多个样式对象
 * @param  {...Object} styles - 样式对象
 * @returns {Object} 合并后的样式
 */
export const mergeStyles = (...styles) => {
  return Object.assign({}, ...styles);
};
