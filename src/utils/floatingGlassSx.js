// 浮窗统一玻璃风样式（与编辑器右键菜单一致）
// 使用方式：
//   sx={{ ...floatingGlassSx({ radius: '4px', shadow: 'menu' }) }}
export const floatingGlassSx = ({ radius = '4px', shadow = 'default' } = {}) => ({
  borderRadius: radius,
  backgroundColor: (theme) => theme.custom?.glass?.background || (theme.palette.mode === 'dark' ? 'rgba(31,31,35,0.72)' : 'rgba(255,255,255,0.72)'),
  backgroundImage: (theme) => theme.custom?.glass?.backgroundImage || 'none',
  border: (theme) => theme.custom?.glass?.border || `1px solid ${theme.palette.divider}`,
  boxShadow: (theme) => shadow === 'menu'
    ? (theme.custom?.glass?.menuShadow || theme.custom?.glass?.boxShadow || '0 18px 56px rgba(22,22,24, 0.22)')
    : (theme.custom?.glass?.boxShadow || '0 10px 36px rgba(22,22,24, 0.18)'),
  backdropFilter: (theme) => theme.custom?.glass?.backdropFilter || 'blur(24px) saturate(165%)',
  WebkitBackdropFilter: (theme) => theme.custom?.glass?.backdropFilter || 'blur(24px) saturate(165%)',
  backgroundClip: 'padding-box',
})
