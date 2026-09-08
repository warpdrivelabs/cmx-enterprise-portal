/**
 * cmx-scroll-lock — 文档滚动锁（引用计数，多浮层嵌套安全）。
 *
 * 模块级计数：第一个 acquire 锁定 `document.documentElement` 滚动（视口级），
 * 最后一个 release 恢复原值。`scrollbar-gutter: stable` 与 overflow 一起存/恢复，
 * 防止 Windows 经典滚动条消失引起的页面横向抖动。
 *
 * 收益边界：只消除视口级滚动穿透；滚动发生在内部容器（门户菜单区/内容区各自
 * overflow:auto）时，鼠标悬停在这些容器上仍可滚，属预期行为。
 *
 * 使用方：<cmx-floating-dialog>（lockScroll 配置，默认 true）；
 * 预留 cmx-message-dialog / cmxConfirm 家族后续接入（见方案 20260819 九-2）。
 */

let _count = 0
let _prevOverflow = ''
let _prevGutter = ''

/** 锁定文档滚动（计数 +1；从 0→1 时实际加锁）。 */
export function acquireScrollLock () {
  if (++_count === 1) {
    const html = document.documentElement
    _prevOverflow = html.style.overflow
    _prevGutter = html.style.scrollbarGutter
    html.style.overflow = 'hidden'
    html.style.scrollbarGutter = 'stable'
  }
}

/** 解除文档滚动（计数 -1；归零时恢复加锁前的原始值）。多余 release 无副作用。 */
export function releaseScrollLock () {
  if (_count <= 0) return
  if (--_count === 0) {
    const html = document.documentElement
    html.style.overflow = _prevOverflow
    html.style.scrollbarGutter = _prevGutter
  }
}

/** 当前加锁计数（测试/诊断用）。 */
export function scrollLockCount () {
  return _count
}
