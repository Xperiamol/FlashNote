// 关闭过渡开始前释放浮层内部焦点，避免 MUI 把仍含焦点的浮层设为 aria-hidden。
// 焦点恢复继续交给 MUI FocusTrap，不禁用无障碍属性。
export const releasePopoverFocus = () => {
  const active = typeof document !== 'undefined' ? document.activeElement : null
  if (active?.closest?.('.MuiPopover-root')) active.blur?.()
}
