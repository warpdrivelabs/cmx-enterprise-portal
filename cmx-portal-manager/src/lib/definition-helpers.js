/**
 * 定义中心（DCT/DOC）的共享辅助函数。
 *
 * 从 portal-definition-manager.js 抽出——主类与尾部配套元素（Source/Schema/Inspector/List）
 * 都依赖这些，抽到 lib 避免循环 import。行为与原文件逐字一致。
 */
import { itemApplication } from './version-stem.js'
import { apiFetch } from 'cmx-ui5-runtime/api-client'

export const itemKey = (it) => `${it.domain}/${itemApplication(it)}/${it.module}/${it.file}`

export const isEditingEl = (root) => { const ae = root && root.activeElement; return ae instanceof HTMLElement && /^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName) }

export const definitionApiKind = (kind) => isBaseDefKind(kind) ? 'BASE' : String(kind || 'DCT').toUpperCase()
export function filterDefinitionItemsForKind (items, kind) {
  const K = String(kind || 'DCT').toUpperCase()
  if (K === 'BASE-DCT') return items.filter((it) => /_dct_/.test(it.file))
  if (K === 'BASE-DOC') return items.filter((it) => /_doc_/.test(it.file))
  return items
}
export async function fetchDefinitionItemsForKind (kind) {
  const data = await apiFetch(`/api/definitions/list?kind=${encodeURIComponent(definitionApiKind(kind))}`)
  return filterDefinitionItemsForKind(Array.isArray(data?.items) ? data.items : [], kind)
}

export function isBaseDefKind (kind) {
  const k = String(kind || '').toUpperCase()
  return k === 'BASE-DCT' || k === 'BASE-DOC'
}

export function syncDefNeoHost (el, _kind) {
  // BASE 系专属 data-def-neo 皮肤已撤（与其他管理页统一默认样式）；保留函数清残留属性
  if (el instanceof HTMLElement) el.removeAttribute('data-def-neo')
}

export function defBaseNeoStyleBlock (_kind) {
  // BASE 系皮肤已撤，与其他管理页统一默认样式；保留签名兼容既有调用点
  return ''
}
