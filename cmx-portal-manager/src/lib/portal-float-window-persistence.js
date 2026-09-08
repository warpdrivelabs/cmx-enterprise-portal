/**
 * 浮窗位置与尺寸持久化 / 视口修正。
 */

/** @param {string} storageKey @returns {{ left: number, top: number }|null} */
export function readFloatBallPos (storageKey) {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return null
    const v = JSON.parse(raw)
    if (v && Number.isFinite(v.left) && Number.isFinite(v.top)) return { left: v.left, top: v.top }
  } catch { /* ignore */ }
  return null
}

/** @param {string} storageKey @param {{ left: number, top: number }} pos */
export function writeFloatBallPos (storageKey, pos) {
  try { localStorage.setItem(storageKey, JSON.stringify(pos)) } catch { /* ignore quota */ }
}

/** @param {string} storageKey @returns {{ left: number, top: number, w: number, h: number }|null} */
export function readFloatWindowRect (storageKey) {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return null
    const v = JSON.parse(raw)
    if (v && Number.isFinite(v.left) && Number.isFinite(v.top)
      && Number.isFinite(v.w) && Number.isFinite(v.h)) return v
  } catch { /* ignore */ }
  return null
}

/** @param {string} storageKey @param {{ left: number, top: number, w: number, h: number }} rect */
export function writeFloatWindowRect (storageKey, rect) {
  try { localStorage.setItem(storageKey, JSON.stringify(rect)) } catch { /* ignore quota */ }
}

/**
 * @param {{ width?: number, height?: number }} viewport
 * @param {{ ballSize: number, ballMargin: number, minVisible?: number }} metrics
 */
export function ensureFloatBallPos (pos, viewport, metrics) {
  const width = viewport.width || 1200
  const height = viewport.height || 800
  const { ballSize, ballMargin } = metrics
  const minVisible = metrics.minVisible ?? 12
  const defaultPos = {
    left: Math.max(0, width - ballSize - ballMargin),
    top: Math.max(0, height - ballSize - ballMargin),
  }
  if (!pos || !Number.isFinite(pos.left) || !Number.isFinite(pos.top)) {
    return { pos: defaultPos, shouldPersist: false }
  }
  const visW = Math.min(pos.left + ballSize, width) - Math.max(pos.left, 0)
  const visH = Math.min(pos.top + ballSize, height) - Math.max(pos.top, 0)
  if (visW < minVisible || visH < minVisible) {
    return { pos: defaultPos, shouldPersist: true }
  }
  return {
    pos: { left: pos.left, top: pos.top },
    shouldPersist: false,
  }
}

/**
 * @param {{ width?: number, height?: number }} viewport
 * @param {{ defaultWidth: number, defaultHeight: number, titleBarHeight: number, margin?: number, minVisibleWidth?: number }} metrics
 */
export function ensureFloatWindowRect (rect, viewport, metrics) {
  const width = viewport.width || 1200
  const height = viewport.height || 800
  const margin = metrics.margin ?? 16
  const minVisibleWidth = metrics.minVisibleWidth ?? 60
  const { defaultWidth, defaultHeight, titleBarHeight } = metrics
  const defaultRect = {
    w: Math.min(defaultWidth, Math.max(60, width - margin * 2)),
    h: Math.min(defaultHeight, Math.max(titleBarHeight, height - margin * 2)),
  }
  defaultRect.left = Math.max(margin, width - defaultRect.w - margin - 80)
  defaultRect.top = Math.max(margin, height - defaultRect.h - margin - 80)
  if (!rect
    || !Number.isFinite(rect.left)
    || !Number.isFinite(rect.top)
    || !Number.isFinite(rect.w)
    || !Number.isFinite(rect.h)) {
    return { rect: defaultRect, shouldPersist: false }
  }
  const visW = Math.min(rect.left + rect.w, width) - Math.max(rect.left, 0)
  const visH = Math.min(rect.top + rect.h, height) - Math.max(rect.top, 0)
  if (visW < minVisibleWidth || visH < titleBarHeight) {
    return { rect: defaultRect, shouldPersist: true }
  }
  return {
    rect: {
      left: rect.left,
      top: rect.top,
      w: rect.w,
      h: rect.h,
    },
    shouldPersist: false,
  }
}

/** @param {{ ballPosKey: string, windowRectKey: string }} keys */
export function clearFloatWindowPersistence (keys) {
  try { localStorage.removeItem(keys.ballPosKey) } catch { /* ignore */ }
  try { localStorage.removeItem(keys.windowRectKey) } catch { /* ignore */ }
}
