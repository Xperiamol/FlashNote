import { coerceDiagramColor, ensureReadableTextColor, normalizeDiagramColor } from './shared'

// Repair only legacy gradient fills. Valid user-authored colors and geometry
// are preserved; a display preference must not re-layout a saved document.
export const prepareSceneStyle = (elements, styleMode = 'neat') => {
  if (!Array.isArray(elements)) return elements
  const repaired = new Set()
  const result = elements.map(element => {
    if (!element || typeof element !== 'object') return element
    const next = { ...element }
    if (!normalizeDiagramColor(element.backgroundColor)) {
      const fill = coerceDiagramColor(element.backgroundColor)
      if (fill) {
        next.backgroundColor = fill
        repaired.add(next.id)
      }
    }
    if (styleMode === 'neat') {
      if (typeof next.roughness === 'number') next.roughness = 0
      if (next.type === 'arrow' || next.type === 'line') {
        next.roundness = null
        next.strokeStyle = 'solid'
      }
      if (next.type === 'text') next.fontFamily = 2
    }
    return next
  })
  for (let i = 0; i < result.length; i++) {
    const text = result[i]
    if (text?.type !== 'text') continue
    const cx = text.x + text.width / 2, cy = text.y + text.height / 2
    for (let j = i - 1; j >= 0; j--) {
      const shape = result[j]
      if (!shape || !['rectangle', 'ellipse', 'diamond'].includes(shape.type)
        || !shape.backgroundColor || shape.backgroundColor === 'transparent'
        || cx < shape.x || cx > shape.x + shape.width || cy < shape.y || cy > shape.y + shape.height) continue
      if (repaired.has(shape.id)) text.strokeColor = ensureReadableTextColor(text.strokeColor, shape.backgroundColor)
      break
    }
  }
  return result
}
