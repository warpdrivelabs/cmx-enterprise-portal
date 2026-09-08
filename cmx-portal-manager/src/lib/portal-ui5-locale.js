/**
 * Portal Manager 的 UI5 语言配置与顶部文案。
 */
import { ensureCmxUi5Runtime } from 'cmx-ui5-runtime/client'

export const PORTAL_LANG_STORAGE_KEY = '__portal_ui5_lang__'
export const PORTAL_DEFAULT_LANG = 'zh_CN'

export const PORTAL_LANGUAGES = [
  { value: 'zh_CN', flag: '🇨🇳', label: '中文简体' },
  { value: 'en_US', flag: '🇺🇸', label: 'American English' },
]

const PORTAL_UI5_LANGUAGE_MAP = {
  en_US: 'en',
}

const PORTAL_COPY = {
  zh_CN: {
    menu: '菜单',
    help: '帮助',
    searchPlaceholder: '搜索应用、产品',
    refresh: '刷新',
    settings: '设置',
    switchTheme: '切换主题',
    switchLanguage: '切换语言',
    assistant: 'AI 助手',
    profileTitle: '用户与账号',
    profileAccount: '个人信息',
    profilePreferences: '偏好设置',
    profileLogout: '退出登录',
  },
  en_US: {
    menu: 'Menu',
    help: 'Help',
    searchPlaceholder: 'Search Apps, Products',
    refresh: 'Refresh',
    settings: 'Settings',
    switchTheme: 'Switch Theme',
    switchLanguage: 'Switch Language',
    assistant: 'AI Assistant',
    profileTitle: 'User & account',
    profileAccount: 'Account',
    profilePreferences: 'Preferences',
    profileLogout: 'Sign out',
  },
}

/** @param {string} id */
export function portalLanguageInfo (id) {
  return PORTAL_LANGUAGES.find(l => l.value === id) ?? null
}

/** @param {string} langId */
function toUi5LanguageId (langId) {
  return PORTAL_UI5_LANGUAGE_MAP[langId] ?? langId
}

/** @param {string} langId @returns {Promise<boolean>} */
export async function applyPortalUi5Language (langId) {
  if (!portalLanguageInfo(langId)) return false
  const { setLanguage } = await ensureCmxUi5Runtime()
  try {
    sessionStorage.setItem(PORTAL_LANG_STORAGE_KEY, langId)
  } catch {}
  void setLanguage(toUi5LanguageId(langId)).catch((err) => {
    console.warn('[portal-ui5-locale] UI5 language sync failed:', err)
  })
  return true
}

export function getStoredPortalUi5Language () {
  try {
    const s = sessionStorage.getItem(PORTAL_LANG_STORAGE_KEY)
    if (s && PORTAL_LANGUAGES.some(l => l.value === s)) return s
  } catch {}
  return PORTAL_DEFAULT_LANG
}

/** @param {string} langId */
export function getPortalCopy (langId) {
  return PORTAL_COPY[langId] ?? PORTAL_COPY[PORTAL_DEFAULT_LANG]
}

export async function initPortalUi5Language () {
  await applyPortalUi5Language(getStoredPortalUi5Language())
}
