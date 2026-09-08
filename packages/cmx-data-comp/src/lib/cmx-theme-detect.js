/**
 * 主题（亮/暗）检测工具。
 *
 * 原先 cmx-revo-grid / cmx-tabulator / cmx-web-treeview 三处各自实现了近乎相同的
 * `_detectDarkMode`（读 --sapBackgroundColor 计算亮度，回退 prefers-color-scheme）。
 * 统一到这里，保持行为与原实现一致（取最完整的带 SSR 守卫版本）。
 */

/** 检测当前是否暗色主题：优先读 --sapBackgroundColor 计算相对亮度，回退系统偏好。 */
export function detectDarkMode () {
  if (typeof getComputedStyle === 'undefined') return false
  try {
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--sapBackgroundColor').trim()
    if (bg) {
      let r, g, b
      const hex = bg.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i)
      if (hex) {
        r = parseInt(hex[1], 16); g = parseInt(hex[2], 16); b = parseInt(hex[3], 16)
      } else {
        const rgb = bg.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
        if (rgb) { r = +rgb[1]; g = +rgb[2]; b = +rgb[3] }
      }
      if (r != null) {
        // 相对亮度：< 128 视为暗色
        return (0.299 * r + 0.587 * g + 0.114 * b) < 128
      }
    }
  } catch (_) {}
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}
