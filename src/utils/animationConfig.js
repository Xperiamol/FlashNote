/**
 * 统一的动画配置系统
 * 基于 Google Material Design 动画规范
 * https://material.io/design/motion/the-motion-system.html
 */

// Material Design 标准缓动函数
export const EASING = {
  // 标准缓动：快速进入，慢速退出
  standard: 'cubic-bezier(0.4, 0.0, 0.2, 1)',
  // 加速缓动：快速进入
  accelerate: 'cubic-bezier(0.4, 0.0, 1, 1)',
  // 减速缓动：慢速退出
  decelerate: 'cubic-bezier(0.0, 0.0, 0.2, 1)',
  // 强调缓动：更强的缓动效果
  emphasize: 'cubic-bezier(0.05, 0.7, 0.1, 1)',
  // 传统缓动（向后兼容）
  legacy: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'
};

// 动画时长（Google Material Design 标准 - 最快版本）
export const DURATION = {
  // 超快速动画：用于简单状态变化
  fast: '0.1s',
  // 快速动画：用于大多数交互
  normal: '0.15s',
  // 慢速动画：用于复杂或重要状态变化
  slow: '0.2s',
  // 非常慢：用于特殊效果
  verySlow: '0.3s'
};

// 预定义的动画配置
export const ANIMATIONS = {
  // 完成状态动画
  completion: {
    duration: DURATION.fast,
    easing: EASING.standard,
    keyframes: 'greenSweep'
  },

  // 拖拽过渡动画
  dragTransition: {
    duration: DURATION.fast,
    easing: EASING.standard,
    property: 'transform'
  },

  // 悬停效果
  hover: {
    duration: DURATION.fast,
    easing: EASING.standard,
    property: 'all'
  },

  // 状态变化
  stateChange: {
    duration: DURATION.fast,
    easing: EASING.standard,
    property: 'all'
  },

  // 脉冲效果（加载状态）
  pulse: {
    duration: '1s',
    easing: EASING.standard,
    iteration: 'infinite'
  },

  // 按钮交互
  button: {
    duration: DURATION.fast,
    easing: EASING.standard,
    property: 'all'
  },

  // 列表项动画
  listItem: {
    duration: DURATION.fast,
    easing: EASING.standard,
    property: 'all'
  },

  // 卡片动画
  card: {
    duration: DURATION.normal,
    easing: EASING.standard,
    property: 'all'
  }
};

// CSS 动画字符串生成器
export const createAnimationString = (config) => {
  const { duration, easing, keyframes, iteration = 'forwards' } = config;
  return `${keyframes} ${duration} ${easing} ${iteration}`;
};

export const createTransitionString = (config) => {
  const { property = 'all', duration, easing } = config;
  return `${property} ${duration} ${easing}`;
};

// Green Sweep 动画 keyframes 定义
export const GREEN_SWEEP_KEYFRAMES = {
  '@keyframes greenSweep': {
    '0%': {
      transform: 'translateX(-100%)'
    },
    '100%': {
      transform: 'translateX(0%)'
    }
  }
};

// Pulse 动画 keyframes 定义
export const PULSE_KEYFRAMES = {
  '@keyframes pulse': {
    '0%': {
      opacity: 1,
      transform: 'scale(1)'
    },
    '50%': {
      opacity: 0.7,
      transform: 'scale(1.1)'
    },
    '100%': {
      opacity: 1,
      transform: 'scale(1)'
    }
  }
};

// 默认导出所有配置
export default {
  EASING,
  DURATION,
  ANIMATIONS,
  createAnimationString,
  createTransitionString,
  GREEN_SWEEP_KEYFRAMES,
  PULSE_KEYFRAMES
};