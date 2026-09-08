/** 为「更多」控件预留宽度（px），需与 `.portal-tab-overflow-wrap` + 触发器实际占位一致 */
export const TAB_OVERFLOW_BTN_RESERVE = 44

/**
 * 标签条溢出「更多」：外层渐变分隔 + 圆角幽灵按钮（各面板 shadow 内复用）
 */
export const PORTAL_TAB_OVERFLOW_STYLES = `
  .portal-tab-overflow-wrap {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    align-self: stretch;
    padding: 0 8px 0 10px;
    margin-left: 2px;
    border-left: 1px solid var(--sapGroup_TitleBorderColor, rgba(0, 0, 0, 0.08));
    background: linear-gradient(
      90deg,
      transparent 0%,
      var(--portal-tab-row-bg, var(--sapObjectHeader_Background, #fff)) 14px
    );
  }
  .portal-tab-overflow-trigger {
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    margin: 0;
    padding: 0;
    border: none;
    border-radius: var(--sapButton_BorderCornerRadius, 8px);
    cursor: pointer;
    color: var(--sapContent_IconColor, #0854a0);
    background: var(--sapButton_Lite_Background, rgba(0, 112, 242, 0.07));
    box-shadow: inset 0 0 0 1px var(--sapButton_Lite_BorderColor, rgba(0, 112, 242, 0.18));
    transition: background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease, transform 0.12s ease;
  }
  .portal-tab-overflow-trigger:hover {
    color: var(--sapHighlightColor, #0070f2);
    background: var(--sapButton_Hover_Background, rgba(0, 112, 242, 0.11));
    box-shadow:
      inset 0 0 0 1px var(--sapButton_Hover_BorderColor, rgba(0, 112, 242, 0.32)),
      0 1px 3px rgba(0, 0, 0, 0.07);
  }
  .portal-tab-overflow-trigger:active {
    transform: scale(0.96);
    background: var(--sapButton_Active_Background, rgba(0, 112, 242, 0.16));
  }
  .portal-tab-overflow-trigger:focus-visible {
    outline: 2px solid var(--sapContent_FocusColor, #0070f2);
    outline-offset: 2px;
  }
  .portal-tab-overflow-trigger ui5-icon {
    width: 0.875rem;
    height: 0.875rem;
    pointer-events: none;
    opacity: 0.92;
  }
`

/**
 * 在含当前选中项的前提下，选出一段连续下标 [start, end) 使可见标签总宽不超过上限。
 * @param {number[]} widths 各标签自然宽度
 * @param {number} activeIndex 当前选中下标
 * @param {number} containerWidth 条形容器总宽
 * @param {number} reserveForOverflowButton 出现溢出时扣除的按钮预留宽
 */
export function computeVisibleTabRange (widths, activeIndex, containerWidth, reserveForOverflowButton) {
  const n = widths.length
  if (n === 0) return { start: 0, end: 0, needsOverflow: false }
  let best = null
  for (let s = 0; s < n; s++) {
    for (let e = s + 1; e <= n; e++) {
      const sum = widths.slice(s, e).reduce((a, b) => a + b, 0)
      const needBtn = s > 0 || e < n
      const cap = containerWidth - (needBtn ? reserveForOverflowButton : 0)
      if (sum > cap) continue
      if (activeIndex < s || activeIndex >= e) continue
      const len = e - s
      if (!best || len > best.len || (len === best.len && s < best.start)) {
        best = { start: s, end: e, len }
      }
    }
  }
  if (!best) {
    const i = Math.max(0, Math.min(activeIndex, n - 1))
    return { start: i, end: i + 1, needsOverflow: n > 1 }
  }
  return {
    start: best.start,
    end: best.end,
    needsOverflow: best.start > 0 || best.end < n,
  }
}

/** @returns {number[]} 被收进「更多」里的下标，顺序从左到右 */
export function hiddenTabIndices (n, start, end) {
  const out = []
  for (let i = 0; i < start; i++) out.push(i)
  for (let i = end; i < n; i++) out.push(i)
  return out
}
