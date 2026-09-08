/**
 * DAM（domain / app / module）下拉选项渲染工具。
 *
 * 原先散落在 portal-flexible-combination-manager.js 与 portal-definition-manager.js
 * 两处逐字相同的副本，现集中到此供两端复用。纯函数，无副作用。
 */
import { escAttr, escHtml } from './escape.js'

/** DAM 下拉选项文案：名称（ID）。名称取 name/label/title，缺省回退 ID。 */
export const damOptionLabel = (o) => {
  const id = o?.id ?? o?.module ?? ''
  const name = o?.name || o?.label || o?.title || ''
  return name && name !== id ? `${name}（${id}）` : String(id)
}

/** DAM 图标名（供 ui5-option icon 属性）；缺省按层级回退。 */
export const damOptionIcon = (o, fallback) => String(o?.icon || fallback || '')

/** 一个 DAM ui5-option（含图标）。 */
export const damOptionHtml = (o, val, selected, icon) => `<ui5-option value="${escAttr(val)}" icon="${escAttr(damOptionIcon(o, icon))}" ${selected ? 'selected' : ''}>${escHtml(damOptionLabel(o))}</ui5-option>`
