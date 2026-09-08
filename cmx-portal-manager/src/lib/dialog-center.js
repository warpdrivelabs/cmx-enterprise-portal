/**
 * ui5-dialog 居中修复（移植自 CMXHTMLDesigner/src/components/designer-app/dialog-center.js）。
 *
 * ui5-dialog 内部用 `_draggedOrResized` 标志：一旦用户拖动或缩放过对话框，该标志被永久置 true，
 * 且**关闭时不重置**。导致下次 open 时 `_resize()`/ResizeObserver 不再 `_center()`，对话框停留在
 * 上次被拖到的位置（常见为右下角）。
 *
 * 另外内容异步填充（表格 / 树 open 后才加载）会让首次 `_center()` 按 0×0 尺寸定位，扩展后偏移。
 *
 * `openDialogCentered(dlg)`：打开前清掉拖拽/缩放标志与 inline 定位样式，强制 ui5 重新居中；
 * open 后再 rAF 触发一次重定位，覆盖异步内容撑开尺寸的情况。
 *
 * @param {HTMLElement & { open?: boolean }} dlg ui5-dialog 元素
 */
export function openDialogCentered (dlg) {
  if (!dlg) return
  resetDialogPosition(dlg)
  dlg.open = true
  /* 内容异步填充后尺寸变化：再请求两帧重新居中（ui5 的 _resize 会在未拖动时自动 _center，
     这里显式兜底，处理 ResizeObserver 触发时机晚于内容渲染的情况）。 */
  requestAnimationFrame(() => {
    recenterDialog(dlg)
    requestAnimationFrame(() => recenterDialog(dlg))
  })
}

/**
 * 重置对话框的拖拽/缩放状态与 inline 定位，使其回到"未定位"初始态。
 * @param {any} dlg
 */
export function resetDialogPosition (dlg) {
  if (!dlg) return
  try {
    dlg._draggedOrResized = false
  } catch { /* 只读等极端情况忽略 */ }
  /* 清 inline top/left，让 _center() 基于自然尺寸重新算（保留 width/height 设计尺寸）。 */
  dlg.style.top = ''
  dlg.style.left = ''
}

/**
 * 在对话框已打开时强制重新居中（基于当前尺寸）。
 * 优先调用 ui5 私有 `_center()`；不可用时回退到手动计算。
 * @param {any} dlg
 */
export function recenterDialog (dlg) {
  if (!dlg || dlg.open === false) return
  if (dlg._draggedOrResized) return /* 用户已手动调整过位置，尊重之 */
  if (typeof dlg._center === 'function') {
    try {
      dlg._center()
      return
    } catch { /* 回退手动 */ }
  }
  const w = dlg.offsetWidth
  const h = dlg.offsetHeight
  if (w < 8 || h < 8) return
  dlg.style.top = `${Math.max(0, Math.round((window.innerHeight - h) / 2))}px`
  dlg.style.left = `${Math.max(0, Math.round((window.innerWidth - w) / 2))}px`
}
