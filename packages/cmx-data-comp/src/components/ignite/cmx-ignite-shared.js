/**
 * cmx-ignite-* 封装组件的共享工具。
 */
import { configureTheme } from 'igniteui-webcomponents'
/* Ignite 全局 palette：定义 :root 上的 --ig-gray / --ig-surface / --ig-size 等主题变量。
   Ignite 组件自身样式（adoptedStyleSheets）依赖这些变量；不注入则下拉透明、尺寸塌陷、文字叠加。
   ?inline 拿到 CSS 文本，手动注入 document.head，使其能穿透 shadow DOM 作用到 grid/form 内嵌的 combo。
   亮/暗各取一份，跟随门户主题切换（用 Ignite 原生 dark variant，不手写颜色样式）。 */
import IGNITE_PALETTE_LIGHT from 'igniteui-webcomponents/themes/light/bootstrap.css?inline'
import IGNITE_PALETTE_DARK from 'igniteui-webcomponents/themes/dark/bootstrap.css?inline'

let _themeReady = false
let _themeListenerBound = false

/**
 * 检测当前是否暗色主题：优先读 SAP UI5 的 --sapBackgroundColor 亮度，降级到 prefers-color-scheme。
 * 与 cmx-revo-grid 的探测口径一致，保证全套组件暗色判断统一。
 */
function _detectDark () {
  if (typeof getComputedStyle === 'undefined' || typeof document === 'undefined') return false
  try {
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--sapBackgroundColor').trim()
    if (bg) {
      let r, g, b
      const hex = bg.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i)
      if (hex) { r = parseInt(hex[1], 16); g = parseInt(hex[2], 16); b = parseInt(hex[3], 16) }
      else { const m = bg.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/); if (m) { r = +m[1]; g = +m[2]; b = +m[3] } }
      if (r != null) return (0.299 * r + 0.587 * g + 0.114 * b) < 128
    }
  } catch (_) {}
  return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

/** 按当前明暗应用 Ignite 原生主题 variant + 注入对应 palette。 */
function _applyIgniteTheme () {
  const dark = _detectDark()
  try { configureTheme('bootstrap', dark ? 'dark' : 'light') } catch (_) {}
  if (typeof document === 'undefined') return
  let style = document.getElementById('cmx-ignite-theme')
  if (!style) {
    style = document.createElement('style')
    style.id = 'cmx-ignite-theme'
    document.head.appendChild(style)
  }
  const css = dark ? IGNITE_PALETTE_DARK : IGNITE_PALETTE_LIGHT
  if (style.textContent !== css) style.textContent = css
  style.dataset.variant = dark ? 'dark' : 'light'
}

/**
 * 确保 Ignite 主题就绪（幂等）：按门户明暗配置 bootstrap dark/light + 注入对应 palette CSS，
 * 并订阅门户主题切换事件，切到暗色时 Ignite 列表/下拉自动跟随（用组件原生暗色，不手写颜色）。
 * 所有 register-ignite-* 在 defineComponents 前调用。
 */
export function ensureIgniteTheme () {
  if (!_themeReady) {
    _themeReady = true
    _applyIgniteTheme()
  }
  if (!_themeListenerBound && typeof window !== 'undefined') {
    _themeListenerBound = true
    window.addEventListener('cmx-portal-theme-change', _applyIgniteTheme)
  }
}


/** @param {HTMLElement} el @param {string} name */
export function parseJsonAttr (el, name) {
  if (!el.hasAttribute(name)) return undefined
  try {
    return JSON.parse(el.getAttribute(name))
  } catch (e) {
    console.warn(`[cmx-ignite] failed to parse ${name}:`, e?.message || e)
    return undefined
  }
}

/** @param {unknown} v */
export function isCmxDataSet (v) {
  return !!v && typeof v === 'object'
    && Array.isArray(v.rows)
    && typeof v.addRow === 'function'
}

/**
 * 绑定 CmxDataSet 游标与行变更。
 * @param {object} host  组件实例（需 _ds / _cursorListener / _rowChangedListener）
 * @param {import('../../lib/cmx-data-set.js').CmxDataSet|null} ds
 * @param {{ onCursor?: (row: object|null) => void, onRowChanged?: (detail: object) => void }} handlers
 */
export function bindDataSetListeners (host, ds, handlers = {}) {
  unbindDataSetListeners(host)

  if (!isCmxDataSet(ds)) {
    host._ds = null
    return
  }

  host._ds = ds

  if (handlers.onCursor) {
    host._cursorListener = (e) => handlers.onCursor(e.detail?.row ?? null)
    ds.addEventListener('cursor-changed', host._cursorListener)
    if (ds.hasCursor && ds.currentRow) {
      handlers.onCursor(ds.currentRow)
    }
  }

  if (handlers.onRowChanged) {
    host._rowChangedListener = (e) => handlers.onRowChanged(e.detail || {})
    ds.addEventListener('row-changed', host._rowChangedListener)
  }
}

/** @param {object} host */
export function unbindDataSetListeners (host) {
  const ds = host._ds
  if (ds && host._cursorListener) {
    ds.removeEventListener('cursor-changed', host._cursorListener)
  }
  if (ds && host._rowChangedListener) {
    ds.removeEventListener('row-changed', host._rowChangedListener)
  }
  host._cursorListener = null
  host._rowChangedListener = null
}

/**
 * @param {HTMLElement} host
 * @param {string} name
 * @param {object} detail
 */
export function dispatchCmx (host, name, detail) {
  host.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail }))
}
