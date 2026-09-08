export const DEFAULT_CAPTION_LOCALE = 'zh_CN'

/**
 * 读取当前界面语言。UI5 由共享运行时（globalThis.__cmxUi5）独占加载，
 * 应用代码不能直接 import '@ui5/webcomponents-base/...'（会被 side-effect-shim 置空）。
 * 故从运行时读取 getLanguage；运行时未就绪或无该方法时回退空串（caption 走 zh_CN 兜底）。
 * @returns {string}
 */
function readCurrentLanguage () {
  try {
    const rt = globalThis.__cmxUi5
    if (rt && typeof rt.getLanguage === 'function') return String(rt.getLanguage() || '')
  } catch { /* ignore */ }
  return ''
}

/**
 * 当前界面语言 → caption 候选键列表（按优先级）。
 * UI5 getLanguage() 返回如 'en' / 'zh-CN' / 'zh_CN'；caption 键多为 'en_US' / 'zh_CN'。
 * 这里把当前语言归一成多个候选键（原值、'-'↔'_' 互换、主语言段），逐个匹配。
 * 例：'en' → ['en','en_US','en-US' 同段...]；'zh-CN' → ['zh-CN','zh_CN','zh']。
 * @returns {string[]} 候选 caption 键（已去重，按优先级）
 */
export function currentLocaleCandidates () {
  const lang = readCurrentLanguage()
  if (!lang) return []
  const cands = []
  const add = (v) => { if (v && !cands.includes(v)) cands.push(v) }
  add(lang)                       // 原值，如 'en' / 'zh-CN'
  add(lang.replace(/-/g, '_'))    // 'zh-CN' → 'zh_CN'
  add(lang.replace(/_/g, '-'))    // 'zh_CN' → 'zh-CN'
  const base = lang.split(/[-_]/)[0]
  add(base)                       // 主语言段：'en' / 'zh'
  // 常见全名键补全：主段 → 地区全名（en→en_US/en-US，zh→zh_CN/zh-CN）
  const REGION = { en: ['en_US', 'en-US'], zh: ['zh_CN', 'zh-CN'] }
  for (const full of (REGION[base] || [])) add(full)
  return cands
}

export function fieldId (field) {
  return String(field?.id ?? '')
}

export function fieldDisplayName (field) {
  const cap = field?.caption
  if (field?.name != null && field.name !== '') return String(field.name)
  if (cap && typeof cap === 'object') return String(cap.en_US ?? cap.en ?? '')
  return ''
}

/**
 * 解析字段标题为当前语言显示串。
 * caption 可为字符串或多语言对象 { zh_CN, en_US, ... }。
 * @param {object} field
 * @param {string} [locale] 显式指定 caption 键；不传则跟随当前界面语言（UI5 getLanguage）
 * @returns {string}
 */
export function fieldCaption (field, locale) {
  const cap = field?.caption
  if (cap && typeof cap === 'object') {
    // 候选键优先级：显式 locale → 当前界面语言候选 → zh_CN 等兜底链
    const keys = []
    if (locale) keys.push(locale, locale.replace(/-/g, '_'), locale.replace(/_/g, '-'))
    else keys.push(...currentLocaleCandidates())
    for (const k of keys) {
      if (cap[k] != null && cap[k] !== '') return String(cap[k])
    }
    return String(
      cap.zh_CN ??
      cap['zh-CN'] ??
      cap.zh ??
      cap.default ??
      Object.values(cap).find((v) => v != null && v !== '') ??
      fieldDisplayName(field) ??
      fieldId(field) ??
      '',
    )
  }
  if (cap != null && cap !== '') return String(cap)
  return fieldDisplayName(field) || fieldId(field)
}

export function setFieldId (field, value) {
  field.id = String(value || '')
}

export function setFieldName (field, value) {
  if (value == null || value === '') delete field.name
  else field.name = String(value)
}

export function setFieldCaption (field, value, locale = DEFAULT_CAPTION_LOCALE) {
  if (value == null || value === '') {
    if (field.caption && typeof field.caption === 'object') {
      delete field.caption[locale]
      if (!Object.keys(field.caption).length) delete field.caption
    } else {
      delete field.caption
    }
    return
  }
  const current = field.caption && typeof field.caption === 'object' ? field.caption : {}
  field.caption = { ...current, [locale]: String(value) }
}

export function normalizeFieldIdentity (field) {
  if (!field || typeof field !== 'object') return field
  return field
}
