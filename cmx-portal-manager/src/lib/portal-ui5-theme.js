/**
 * Portal Manager 使用的 UI5 主题列表与持久化逻辑（与 CMXHTMLDesigner 的 Ui5LibraryAdapter 保持一致）。
 */
import { ensureCmxUi5Runtime } from 'cmx-ui5-runtime/client'

export const PORTAL_THEME_STORAGE_KEY = '__portal_ui5_theme__'

/** 默认：Horizon 暗色 */
export const PORTAL_DEFAULT_THEME = 'sap_horizon_dark'

export const PORTAL_THEMES = [
  { value: 'sap_horizon', label: 'Horizon 亮色', dark: false },
  { value: 'sap_horizon_dark', label: 'Horizon 暗色', dark: true },
  { value: 'sap_horizon_hcb', label: 'Horizon 高对比黑', dark: true },
  { value: 'sap_horizon_hcw', label: 'Horizon 高对比白', dark: false },
  { value: 'sap_fiori_3', label: 'Quartz 亮色', dark: false },
  { value: 'sap_fiori_3_dark', label: 'Quartz 暗色', dark: true },
  { value: 'sap_fiori_3_hcb', label: 'Quartz 高对比黑', dark: true },
  { value: 'sap_fiori_3_hcw', label: 'Quartz 高对比白', dark: false },
]

/** @param {string} id */
export function portalThemeInfo (id) {
  return PORTAL_THEMES.find(t => t.value === id) ?? null
}

/**
 * 根据 UI5 主题亮/暗设置 :root 的 color-scheme，驱动原生 <select>/<option> 弹层、滚动条等浏览器控件随主题切换。
 * color-scheme 可继承，穿透所有 Shadow DOM；Firefox / macOS Safari 上原生 option 样式难以用 CSS 覆盖，
 * color-scheme 是这些浏览器下让 shadow 内 select 弹层正确反色的唯一可靠兜底。
 * @param {string} themeId
 */
export function applyNativeColorScheme (themeId) {
  const info = portalThemeInfo(themeId)
  if (!info) return
  document.documentElement.style.setProperty('color-scheme', info.dark ? 'dark' : 'light')
}

/** @param {string} themeId */
export async function applyPortalUi5Theme (themeId) {
  if (!portalThemeInfo(themeId)) return
  const { setTheme } = await ensureCmxUi5Runtime()
  setTheme(themeId)
  try {
    sessionStorage.setItem(PORTAL_THEME_STORAGE_KEY, themeId)
  } catch {}
  // 同步 :root 的 color-scheme：原生 <select>/<option>、滚动条、日期选择器等浏览器控件据此渲染亮/暗。
  // color-scheme 是可继承属性，可穿透所有 Shadow DOM，是跨浏览器覆盖 shadow 内原生 select 弹层的唯一可靠手段。
  applyNativeColorScheme(themeId)
  requestAnimationFrame(() => {
    window.dispatchEvent(new CustomEvent('cmx-portal-theme-change', { detail: { theme: themeId } }))
  })
}

export function getStoredPortalUi5Theme () {
  try {
    const s = sessionStorage.getItem(PORTAL_THEME_STORAGE_KEY)
    if (s && PORTAL_THEMES.some(t => t.value === s)) return s
  } catch {}
  return PORTAL_DEFAULT_THEME
}

export async function initPortalUi5Theme () {
  const theme = getStoredPortalUi5Theme()
  try {
    sessionStorage.setItem(PORTAL_THEME_STORAGE_KEY, theme)
  } catch {}
  const { setTheme } = await ensureCmxUi5Runtime()
  await setTheme(theme)
  // 首次加载即同步 color-scheme，避免首帧原生控件亮/暗与 UI5 主题不一致
  applyNativeColorScheme(theme)
}
