/**
 * Explorer 模块手风琴主题：浏览器侧应用（依赖门户 UI5 主题 ID）。
 *
 * 配色策略：模块面板的 accent 色由前端按模块 id 用 MODULE_PALETTE 色板稳定生成
 * （resolveModuleTheme），不再读后端的 theme/themeColor 字段——颜色不受后台控制，
 * 但不同模块仍有各自稳定的 accent 色，并随门户亮/暗主题自动切侧。
 */
import {
  resolveModuleTheme,
} from './portal-module-theme-core.js'
import { getStoredPortalUi5Theme, portalThemeInfo } from './portal-ui5-theme.js'

export {
  MODULE_PALETTE,
  hashString,
  cleanThemeColor,
  buildLightThemeSide,
  buildDarkThemeSide,
  stableModuleTheme,
  normalizeThemeSide,
  resolveModuleTheme,
} from './portal-module-theme-core.js'

/**
 * 是否暗色 UI5 主题：以门户 session 中的 themeId 为准，避免误用 OS prefers-color-scheme。
 * @param {string} [themeId]
 * @returns {boolean}
 */
export function isDarkUi5Theme (themeId) {
  const id = String(themeId || '').trim()
    || (typeof window !== 'undefined' ? getStoredPortalUi5Theme() : '')
  const info = portalThemeInfo(id)
  if (info) return info.dark
  if (typeof document !== 'undefined') {
    const attr = String(
      document.documentElement.getAttribute('data-sap-ui-theme') ||
      document.documentElement.getAttribute('theme') ||
      '',
    ).toLowerCase()
    if (attr) return /(_dark|_hcb|dark|black)$/.test(attr) || attr.includes('_hcb')
  }
  return false
}

/**
 * @param {HTMLElement} panel
 * @param {{ light?: Record<string, string>, dark?: Record<string, string> }|null|undefined} theme
 * @param {string} [portalThemeId]
 */
export function applyModulePanelTheme (panel, theme, portalThemeId) {
  if (!(panel instanceof HTMLElement) || !theme) return
  const dark = isDarkUi5Theme(portalThemeId)
  const side = dark ? theme.dark : theme.light
  if (!side || typeof side !== 'object') return
  panel.dataset.moduleTone = dark ? 'dark' : 'light'
  const map = {
    '--module-accent': side.accent,
    '--module-header-bg': side.headerBg,
    '--module-header-text': side.headerText,
    '--module-content-bg': side.contentBg,
    '--module-border': side.border,
    '--sapList_Background': side.contentBg,
    '--sapGroup_ContentBackground': side.contentBg,
    '--sapList_HeaderBackground': side.headerBg,
    '--sapList_Hover_Background': `color-mix(in srgb, ${side.accent} 10%, ${side.contentBg})`,
    '--sapList_SelectionBackgroundColor': `color-mix(in srgb, ${side.accent} 16%, ${side.contentBg})`,
    '--sapList_Hover_SelectionBackground': `color-mix(in srgb, ${side.accent} 22%, ${side.contentBg})`,
    '--sapHighlightColor': side.accent,
    '--neo-cyan': side.accent,
  }
  for (const [name, value] of Object.entries(map)) {
    const v = String(value || '').trim()
    if (v) panel.style.setProperty(name, v)
  }
}
