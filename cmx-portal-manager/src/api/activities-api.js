/**
 * @deprecated 已由 ../api/domains-tree-api.js 取代（POST /api/domains/tree 一次返回域→应用→模块树，
 * 前端 reduce 出 activities）。后端 /api/activities 路由已注释弃用。本文件保留以备回退，前端不再调用。
 *
 * 域应用清单（GET /api/activities?name=…），与 cmx-node-server/data/activities/&lt;name&gt;.json 对齐。
 * 根字段：`applications`（新）/ `activities`（兼容）。
 * 每项须含 `sideNav`：由 `type` 驱动侧栏渲染，不依赖 app `id` 名称。
 *
 * - `{ "type": "module",    "menu": "<module 引用>", "title"?: "…" }` — 走 GET /api/menu-pages?menu=…
 *   （【废弃】该路由后端已注释；module 类型现经 domains-tree-api.js DAM 派生。旧 `type: "menu-pages"` 仍兼容读取，语义等价）
 * - `{ "type": "built-in",  "template": "search"|"scm"|"extensions", "title"?: "…" }` — 内置占位 UI
 * - `{ "type": "html_pages","views": WorkspaceViewSpec[], "title"?: "…" }` — 复用工作区 `html_pages` 流水线
 */

import { apiFetch } from 'cmx-ui5-runtime/api-client'

import { portalDisplayText } from '../lib/display-text.js'

const DEFAULT_ACTIVITIES_URL = '/api/activities?name=portal'

const SAFE_ID = /^[a-zA-Z0-9._-]{1,64}$/
const SAFE_ICON = /^[a-z0-9-]{1,64}$/i
const SAFE_POS = /^(top|bottom)$/
const SAFE_MENU = /^(?:[a-zA-Z0-9._-]{1,128}|dam:[a-zA-Z0-9_-]{1,64}(?:\/[a-zA-Z0-9_-]{1,64}){1,2})$/
const SAFE_HTML_PAGE_ID = /^[a-zA-Z0-9._-]{1,128}$/

/** @type {Set<string>} */
const BUILTIN_TEMPLATES = new Set(['search', 'scm', 'extensions'])

/**
 * @typedef {{ tabLabel?: string, type?: string, icon?: string, html_page?: string, data?: Record<string, unknown> }} WorkspaceViewSpec
 * @typedef {{ type: 'module', menu: string, title: string }} ModuleSideNav
 * @typedef {{ type: 'built-in', template: string, title: string }} BuiltInSideNav
 * @typedef {{ type: 'html_pages', views: WorkspaceViewSpec[], title: string }} HtmlPagesSideNav
 * @typedef {ModuleSideNav | BuiltInSideNav | HtmlPagesSideNav} SideNavSpec
 */

/**
 * @param {unknown} raw
 * @param {string} activityLabel
 * @returns {SideNavSpec | null}
 */
export function normalizeSideNav (raw, activityLabel) {
  if (!raw || typeof raw !== 'object') return null
  const type = String(/** @type {{ type?: unknown }} */ (raw).type ?? '').trim()
  const label = portalDisplayText(activityLabel)
  /* `module` 与旧名 `menu-pages` 语义等价：menu 字段指向 module 定义文件。 */
  if (type === 'module' || type === 'menu-pages') {
    const menu = String(/** @type {{ menu?: unknown }} */ (raw).menu ?? '').trim()
    if (!SAFE_MENU.test(menu)) return null
    const title = portalDisplayText(/** @type {{ title?: unknown }} */ (raw).title, label)
    return { type: 'module', menu, title }
  }
  if (type === 'built-in') {
    const template = String(/** @type {{ template?: unknown }} */ (raw).template ?? '').trim()
    if (!BUILTIN_TEMPLATES.has(template)) return null
    const title = portalDisplayText(/** @type {{ title?: unknown }} */ (raw).title, label)
    return { type: 'built-in', template, title }
  }
  if (type === 'html_pages') {
    const o = /** @type {{ views?: unknown }} */ (raw)
    const rawViews = Array.isArray(o.views) ? o.views : []
    /** @type {WorkspaceViewSpec[]} */
    const views = []
    for (const v of rawViews) {
      if (!v || typeof v !== 'object') continue
      const vo = /** @type {Record<string, unknown>} */ (v)
      const vt = String(vo.type ?? '').trim().toLowerCase() || 'html_pages'
      /* 仅校验 html_pages 视图的 ID；其它内置类型透传由渲染层校验。 */
      if (vt === 'html_pages') {
        const pid = String(vo.html_page ?? '').trim()
        if (!SAFE_HTML_PAGE_ID.test(pid)) return null
      }
      views.push(/** @type {WorkspaceViewSpec} */ (v))
    }
    if (!views.length) return null
    const title = portalDisplayText(/** @type {{ title?: unknown }} */ (raw).title, label)
    return { type: 'html_pages', views, title }
  }
  return null
}

/**
 * @param {unknown} doc
 * @returns {{ id: string, domain: string, icon: string, label: string, position: 'top' | 'bottom', sideNav: SideNavSpec }[]}
 */
export function parseActivityEntries (doc) {
  /* 字段兼容：根字段 `applications`（新）或 `activities`（旧）。 */
  const raw = Array.isArray(doc)
    ? doc
    : (doc && typeof doc === 'object'
        && (Array.isArray(/** @type {{ applications?: unknown }} */ (doc).applications)
          || Array.isArray(/** @type {{ activities?: unknown }} */ (doc).activities))
        ? /** @type {unknown[]} */ (
            Array.isArray(/** @type {{ applications?: unknown }} */ (doc).applications)
              ? /** @type {{ applications: unknown[] }} */ (doc).applications
              : /** @type {{ activities: unknown[] }} */ (doc).activities
          )
        : [])
  /** @type {{ id: string, domain: string, icon: string, label: string, position: 'top' | 'bottom', sideNav: SideNavSpec }[]} */
  const out = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const id = String(/** @type {{ id?: unknown }} */ (row).id ?? '').trim()
    const domain = String(/** @type {{ domain?: unknown }} */ (row).domain ?? '').trim()
    const icon = String(/** @type {{ icon?: unknown }} */ (row).icon ?? '').trim()
    const label = portalDisplayText(/** @type {{ label?: unknown }} */ (row).label)
    let position = String(/** @type {{ position?: unknown }} */ (row).position ?? 'top').trim().toLowerCase()
    if (!SAFE_ID.test(id)) continue
    if (!SAFE_ICON.test(icon)) continue
    if (!label) continue
    if (!SAFE_POS.test(position)) position = 'top'
    const sideNav = normalizeSideNav(/** @type {{ sideNav?: unknown }} */ (row).sideNav, label)
    if (!sideNav) continue
    out.push({
      id,
      domain,
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
  // apiFetch 拆 ApiResp 信封，返回 data（{ version, source, applications }）。
  return apiFetch(url)
}

/** @type {Map<string, { id: string, icon: string, label: string, position: 'top' | 'bottom', sideNav: SideNavSpec }[]>} */
const _cacheByUrl = new Map()
/** @type {Map<string, Promise<{ id: string, icon: string, label: string, position: 'top' | 'bottom', sideNav: SideNavSpec }[]>>} */
const _inflightByUrl = new Map()

/** @type {Promise<{ id: string, icon: string, label: string, position: 'top' | 'bottom', sideNav: SideNavSpec }[]>|null} */
let _inflight = null
/** @type {{ id: string, icon: string, label: string, position: 'top' | 'bottom', sideNav: SideNavSpec }[]|null} */
let _cachedEntries = null

/**
 * 去重加载活动定义。相同 URL 命中缓存直接返回；不同 URL（域切换）独立缓存。
 * 同时维护 _cachedEntries（getCachedActivityEntry 等工具读取最近加载的一份）。
 * @param {string} [url]
 * @param {{ force?: boolean }} [options]
 */
export async function ensureActivitiesLoaded (url = DEFAULT_ACTIVITIES_URL, options = {}) {
  const force = !!options.force
  const cached = force ? undefined : _cacheByUrl.get(url)
  if (cached !== undefined) {
    _cachedEntries = cached
    return cached
  }
  if (force) {
    _cacheByUrl.delete(url)
    _inflightByUrl.delete(url)
  }
  const existing = force ? null : _inflightByUrl.get(url)
  if (existing) return existing
  const promise = (async () => {
    try {
      const doc = await fetchActivitiesDocument(url)
      const entries = parseActivityEntries(doc)
      _cacheByUrl.set(url, entries)
      _cachedEntries = entries
      return entries
    } catch {
      const empty = /** @type {{ id: string, icon: string, label: string, position: 'top' | 'bottom', sideNav: SideNavSpec }[]} */ ([])
      _cacheByUrl.set(url, empty)
      _cachedEntries = empty
      return empty
    } finally {
      _inflightByUrl.delete(url)
    }
  })()
  _inflightByUrl.set(url, promise)
  return promise
}

export function clearActivitiesCache (url) {
  if (url) {
    _cacheByUrl.delete(url)
    _inflightByUrl.delete(url)
  } else {
    _cacheByUrl.clear()
    _inflightByUrl.clear()
  }
  _cachedEntries = null
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
    (a) => (a.sideNav?.type === 'module' || a.sideNav?.type === 'menu-pages') && a.sideNav.menu === key
  )
  return hit?.id ?? null
}

/** @returns {ReadonlyArray<{ id: string, icon: string, label: string, position: 'top' | 'bottom', sideNav: SideNavSpec }>} */
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
