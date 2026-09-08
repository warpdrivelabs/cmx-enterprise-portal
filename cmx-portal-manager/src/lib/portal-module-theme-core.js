/**
 * Explorer 模块手风琴主题（纯逻辑，Node / 浏览器共用）。
 */

/** SAP / Fiori 友好预设：亮色 accent + 暗色下更亮的 accent */
export const MODULE_PALETTE = [
  { light: 'var(--sapInformationElementColor, #0070f2)', dark: 'var(--sapInformationElementColor, #5cadff)' },
  { light: 'var(--sapPositiveElementColor, #107e3e)', dark: 'var(--sapPositiveElementColor, #7ec76e)' },
  { light: 'var(--sapCriticalElementColor, #e9730c)', dark: '#ffb84d' },
  { light: 'var(--neo-violet, #7c3aed)', dark: '#b794f6' },
  { light: '#0b7285', dark: '#3bc9db' },
  { light: 'var(--sapNegativeElementColor, #c92a2a)', dark: 'var(--sapNegativeElementColor, #ff8787)' },
  { light: 'var(--sapInformationElementColor, #364fc7)', dark: 'var(--sapInformationElementColor, #748ffc)' },
  { light: 'var(--sapNegativeElementColor, #d6336c)', dark: 'var(--sapNegativeElementColor, #faa2c1)' },
]

/** @param {string} value */
export function hashString (value) {
  let h = 2166136261
  const s = String(value || '')
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** @param {unknown} value */
export function cleanThemeColor (value) {
  const s = String(value || '').trim()
  if (!s) return ''
  if (/^(#[0-9a-f]{3,8}|rgb\([^)]*\)|rgba\([^)]*\)|hsl\([^)]*\)|hsla\([^)]*\)|color-mix\(in srgb,[^;{}]*\))$/i.test(s)) return s
  return ''
}

/** @param {string} accent */
export function buildLightThemeSide (accent) {
  return {
    accent,
    headerBg: `color-mix(in srgb, ${accent} 14%, var(--sapList_Background, #ffffff))`,
    headerText: accent,
    contentBg: 'var(--sapList_Background, #ffffff)',
    border: `color-mix(in srgb, ${accent} 24%, #d4d9e1)`,
  }
}

/** @param {string} accentLight @param {string} [accentDark] */
export function buildDarkThemeSide (accentLight, accentDark) {
  const accent = accentDark || accentLight
  return {
    accent,
    headerBg: `color-mix(in srgb, ${accent} 18%, var(--sapInformationElementColor, #1a2332))`,
    headerText: `color-mix(in srgb, ${accent} 82%, #eef0f3)`,
    contentBg: 'var(--sapInformationElementColor, #121a24)',
    border: `color-mix(in srgb, ${accent} 28%, var(--sapInformationElementColor, #2f3d4d))`,
  }
}

/** @param {string} key @param {number} [index] */
export function stableModuleTheme (key, index = 0) {
  const idx = (hashString(key) + index * 137) % MODULE_PALETTE.length
  const pair = MODULE_PALETTE[idx]
  return {
    light: buildLightThemeSide(pair.light),
    dark: buildDarkThemeSide(pair.light, pair.dark),
  }
}

/** @param {Record<string, unknown>|null|undefined} side @param {Record<string, string>} fallback @param {(accent: string) => Record<string, string>} [regenFromAccent] */
export function normalizeThemeSide (side, fallback, regenFromAccent) {
  if (!side || typeof side !== 'object') return fallback
  const o = /** @type {Record<string, unknown>} */ (side)
  const accent = cleanThemeColor(o.accent || o.color) || fallback.accent
  const generated = typeof regenFromAccent === 'function' ? regenFromAccent(accent) : fallback
  return {
    accent,
    headerBg: cleanThemeColor(o.headerBg || o.headerBackground) || generated.headerBg,
    headerText: cleanThemeColor(o.headerText || o.text) || generated.headerText,
    contentBg: cleanThemeColor(o.contentBg || o.contentBackground) || generated.contentBg,
    border: cleanThemeColor(o.border || o.borderColor) || generated.border,
  }
}

/** @param {string} moduleKey @param {Record<string, unknown>|null|undefined} rawTheme @param {number} [index] @param {unknown} [themeColorRaw] */
export function resolveModuleTheme (moduleKey, rawTheme, index = 0, themeColorRaw) {
  const key = String(moduleKey || 'module')
  const fallbackPair = stableModuleTheme(key, index)
  const themeColor = cleanThemeColor(themeColorRaw)
  if (themeColor) {
    const darkAccent = `color-mix(in srgb, ${themeColor} 52%, var(--sapList_Background, #ffffff))`
    return {
      light: buildLightThemeSide(themeColor),
      dark: buildDarkThemeSide(themeColor, darkAccent),
    }
  }
  if (!rawTheme || typeof rawTheme !== 'object') {
    return fallbackPair
  }
  const raw = /** @type {Record<string, unknown>} */ (rawTheme)
  const lightFallback = fallbackPair.light
  const darkFallback = fallbackPair.dark
  const light = normalizeThemeSide(raw.light || raw, lightFallback, buildLightThemeSide)
  const darkAccent = light.accent !== lightFallback.accent
    ? `color-mix(in srgb, ${light.accent} 52%, var(--sapList_Background, #ffffff))`
    : darkFallback.accent
  const dark = normalizeThemeSide(
    raw.dark,
    buildDarkThemeSide(light.accent, darkAccent),
    (a) => buildDarkThemeSide(a, darkAccent),
  )
  return { light, dark }
}
