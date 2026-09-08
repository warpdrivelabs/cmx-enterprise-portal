/**
 * 活动栏定义（GET /api/activities?name=…），与 cmx-container 后端对齐。
 * 每项须含 `sideNav`：由 `type` 驱动侧栏渲染，不依赖活动 `id` 名称。
 *
 * - `{ "type": "menu-pages", "menu": "<menu 文件名>", "title"?: "…" }` — 走 GET /api/menu-pages?menu=…
 * - `{ "type": "built-in", "template": "search"|"scm"|"extensions", "title"?: "…" }` — 内置占位 UI
 */

import { apiFetch } from 'cmx-ui5-runtime/api-client'

const DEFAULT_ACTIVITIES_URL = '/api/activities?name=portal'

const SAFE_ID = /^[a-zA-Z0-9._-]{1,64}$/
const SAFE_ICON = /^[a-z0-9-]{1,64}$/i
const SAFE_POS = /^(top|bottom)$/
const SAFE_MENU = /^[a-zA-Z0-9._-]{1,128}$/

/** @type {Set<string>} */
const BUILTIN_TEMPLATES = new Set(['search', 'scm', 'extensions'])

/**
 * @typedef {{ type: 'menu-pages', menu: string, title: string }} MenuPagesSideNav
 * @typedef {{ type: 'built-in', template: string, title: string }} BuiltInSideNav
 * @typedef {MenuPagesSideNav | BuiltInSideNav} SideNavSpec
 */

/**
 * @param {unknown} raw
 * @param {string} activityLabel
 * @returns {SideNavSpec | null}
 */
export function normalizeSideNav (raw, activityLabel) {
  if (!raw || typeof raw !== 'object') return null
  const type = String(/** @type {{ type?: unknown }} */ (raw).type ?? '').trim()
  const label = String(activityLabel ?? '').trim()
  if (type === 'menu-pages') {
    const menu = String(/** @type {{ menu?: unknown }} */ (raw).menu ?? '').trim()
    if (!SAFE_MENU.test(menu)) return null
    const title = String(/** @type {{ title?: unknown }} */ (raw).title ?? label).trim() || label
    return { type: 'menu-pages', menu, title }
  }
  if (type === 'built-in') {
    const template = String(/** @type {{ template?: unknown }} */ (raw).template ?? '').trim()
    if (!BUILTIN_TEMPLATES.has(template)) return null
    const title = String(/** @type {{ title?: unknown }} */ (raw).title ?? label).trim() || label
    return { type: 'built-in', template, title }
  }
  return null
}

/**
 * @param {unknown} doc
 * @returns {{ id: string, icon: string, label: string, position: 'top' | 'bottom', sideNav: SideNavSpec }[]}
 */
export function parseActivityEntries (doc) {
  const raw = Array.isArray(doc)
    ? doc
    : (doc && typeof doc === 'object' && Array.isArray(/** @type {{ activities?: unknown }} */ (doc).activities)
        ? /** @type {{ activities: unknown[] }} */ (doc).activities
        : [])
  /** @type {{ id: string, icon: string, label: string, position: 'top' | 'bottom', sideNav: SideNavSpec }[]} */
  const out = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const id = String(/** @type {{ id?: unknown }} */ (row).id ?? '').trim()
    const icon = String(/** @type {{ icon?: unknown }} */ (row).icon ?? '').trim()
    const label = String(/** @type {{ label?: unknown }} */ (row).label ?? '').trim()
    let position = String(/** @type {{ position?: unknown }} */ (row).position ?? 'top').trim().toLowerCase()
    if (!SAFE_ID.test(id)) continue
    if (!SAFE_ICON.test(icon)) continue
    if (!label) continue
    if (!SAFE_POS.test(position)) position = 'top'
    const sideNav = normalizeSideNav(/** @type {{ sideNav?: unknown }} */ (row).sideNav, label)
    if (!sideNav) continue
    out.push({
      id,
      icon,
      label,
      position: /** @type {'top' | 'bottom'} */ (position),
      sideNav,
    })
  }
  return out
}

/**
 * @param {string} [url]
 * @returns {Promise<unknown>}
 */
export async function fetchActivitiesDocument (url = DEFAULT_ACTIVITIES_URL) {
  // apiFetch：拆 ApiResp 信封；HTTP/业务失败抛错（文案取 msg/error，替代原 statusText/error 手拼）。
  return apiFetch(url, { headers: { Accept: 'application/json' } })
}

/** @type {Promise<{ id: string, icon: string, label: string, position: 'top' | 'bottom', sideNav: SideNavSpec }[]>|null} */
let _inflight = null
/** @type {{ id: string, icon: string, label: string, position: 'top' | 'bottom', sideNav: SideNavSpec }[]|null} */
let _cachedEntries = null

/**
 * 去重加载活动定义（供顶栏与侧栏共用）。仅使用 GET /api/activities 返回的数据，无内置回退。
 * @param {string} [url]
 */
export async function ensureActivitiesLoaded (url = DEFAULT_ACTIVITIES_URL) {
  if (_cachedEntries !== null) return _cachedEntries
  if (_inflight) return _inflight
  _inflight = (async () => {
    try {
      const doc = await fetchActivitiesDocument(url)
      _cachedEntries = parseActivityEntries(doc)
    } catch {
      _cachedEntries = []
    } finally {
      _inflight = null
    }
    return _cachedEntries
  })()
  return _inflight
}

/**
 * @param {string} id
 * @returns {{ id: string, icon: string, label: string, position: 'top' | 'bottom', sideNav: SideNavSpec } | null}
 */
export function getCachedActivityEntry (id) {
  const sid = String(id ?? '').trim()
  return _cachedEntries?.find((a) => a.id === sid) ?? null
}

/**
 * 按 menu-pages 的 `menu` 文件名解析活动 id（用于顶栏「设置」等不硬编码活动 id 的场景）。
 * @param {string} menuKey 如 setting-menu
 * @returns {string|null}
 */
export function findActivityIdByMenuPage (menuKey) {
  const key = String(menuKey ?? '').trim()
  if (!SAFE_MENU.test(key)) return null
  const hit = _cachedEntries?.find(
    (a) => a.sideNav?.type === 'menu-pages' && a.sideNav.menu === key
  )
  return hit?.id ?? null
}

/** @returns {ReadonlyArray<{ id: string, icon: string, label: string, position: 'top' | 'bottom', sideNav: MenuPagesSideNav | BuiltInSideNav }>} */
export function getCachedActivityEntries () {
  return _cachedEntries ?? []
}

/**
 * @param {unknown} doc
 * @returns {{ id: string, icon: string, label: string, position: 'top' | 'bottom' }[]}
 */
export function parseActivitiesList (doc) {
  return parseActivityEntries(doc).map(({ id, icon, label, position }) => ({ id, icon, label, position }))
}

export { DEFAULT_ACTIVITIES_URL }
