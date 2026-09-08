/**
 * 浮窗拖拽计算。
 */

/**
 * @param {'ball'|'title'} kind
 * @param {PointerEvent} event
 * @param {{ left: number, top: number }} origin
 */
export function startFloatDrag (kind, event, origin) {
  return {
    kind,
    pointerX: event.clientX,
    pointerY: event.clientY,
    left: origin.left,
    top: origin.top,
    moved: false,
  }
}

/**
 * @param {{ kind: 'ball'|'title', pointerX: number, pointerY: number, left: number, top: number, moved?: boolean }|null} dragState
 * @param {PointerEvent} event
 * @param {{ width?: number, height?: number }} viewport
 * @param {{ ballSize: number, titleBarHeight: number, minWindowWidth?: number, moveThreshold?: number }} metrics
 */
export function updateFloatDrag (dragState, event, viewport, metrics) {
  if (!dragState) return null
  const width = viewport.width || 1200
  const height = viewport.height || 800
  const minWindowWidth = metrics.minWindowWidth ?? 60
  const moveThreshold = metrics.moveThreshold ?? 3
  const dx = event.clientX - dragState.pointerX
  const dy = event.clientY - dragState.pointerY
  const moved = !!dragState.moved || Math.abs(dx) > moveThreshold || Math.abs(dy) > moveThreshold
  dragState.moved = moved
  if (dragState.kind === 'ball') {
    return {
      left: Math.max(0, Math.min(width - metrics.ballSize, dragState.left + dx)),
      top: Math.max(0, Math.min(height - metrics.ballSize, dragState.top + dy)),
      moved,
    }
  }
  return {
    left: Math.max(0, Math.min(width - minWindowWidth, dragState.left + dx)),
    top: Math.max(0, Math.min(height - metrics.titleBarHeight, dragState.top + dy)),
    moved,
  }
}

/** @param {{ kind: 'ball'|'title', moved?: boolean }|null} dragState */
export function finishFloatDrag (dragState) {
  return {
    kind: dragState?.kind || null,
    moved: !!dragState?.moved,
    clicked: !dragState?.moved,
  }
}
