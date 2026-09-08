import { parseTablerIconName, formatTablerUi5IconName } from './tabler-icon-svg.js'

/**
 * 门户 / 设计器侧栏、Tab 等处的 ui5-icon name 白名单校验。
 * 允许 SAP 单段名称、带集合前缀名称，以及 Tabler（tabler-outline/home）。
 */
export function safeUi5IconName(name) {
  const s = String(name ?? 'document').trim()
  if (!s) return 'document'

  const tabler = parseTablerIconName(s)
  if (tabler) return formatTablerUi5IconName(tabler.variant, tabler.iconName)

  if (/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(s)) return s

  if (/^(tnt|business-suite)\/[a-zA-Z][a-zA-Z0-9_-]+$/i.test(s)) return s

  return 'document'
}
