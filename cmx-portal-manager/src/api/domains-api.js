/**
 * @deprecated 已由 ../api/domains-tree-api.js 取代（POST /api/domains/tree 一次返回域→应用→模块树）。
 * 后端 /api/domains 路由已注释弃用。本文件保留以备回退，前端不再调用。
 */
import { apiFetch } from 'cmx-ui5-runtime/api-client'

const SAFE_ID = /^[a-zA-Z0-9._-]{1,64}$/
const SAFE_ICON = /^[a-z0-9-]{1,64}$/i
const SAFE_APPLICATION = /^[a-zA-Z0-9._-]{1,128}$/

/**
 * @param {unknown} doc
 * @returns {{ id: string, icon: string, label: string, application: string }[]}
 *   `application` 指向该 domain 的应用清单 JSON 文件名（如 `fiportal.json`）。
 *   兼容旧字段 `activitie`（同义）。
 */
export function parseDomains (doc) {
  const raw = doc && Array.isArray(/** @type {{ domains?: unknown }} */ (doc).domains)
    ? /** @type {{ domains: unknown[] }} */ (doc).domains
    : []
  /** @type {{ id: string, icon: string, label: string, application: string }[]} */
  const out = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const id = String(/** @type {{ id?: unknown }} */ (row).id ?? '').trim()
    const icon = String(/** @type {{ icon?: unknown }} */ (row).icon ?? '').trim()
    const label = String(/** @type {{ label?: unknown }} */ (row).label ?? '').trim()
    /* 字段兼容：新名 application 优先，旧名 activitie 兜底。 */
    const r = /** @type {{ application?: unknown, activitie?: unknown }} */ (row)
    const application = String(r.application ?? r.activitie ?? '').trim()
    if (!SAFE_ID.test(id)) continue
    if (!SAFE_ICON.test(icon)) continue
    if (!label) continue
    if (!SAFE_APPLICATION.test(application)) continue
    out.push({ id, icon, label, application })
  }
  return out
}

/** @type {Promise<{ id: string, icon: string, label: string, application: string }[]>|null} */
let _inflight = null
/** @type {{ id: string, icon: string, label: string, application: string }[]|null} */
let _cached = null

export async function ensureDomainsLoaded () {
  if (_cached !== null) return _cached
  if (_inflight) return _inflight
  _inflight = (async () => {
    try {
      // apiFetch 拆 ApiResp 信封，返回 data（即 { version, source, domains }）。
      const doc = await apiFetch('/api/domains')
      _cached = parseDomains(doc)
    } catch {
      _cached = []
    } finally {
      _inflight = null
    }
    return /** @type {{ id: string, icon: string, label: string, application: string }[]} */ (_cached)
  })()
  return _inflight
}

/** @returns {ReadonlyArray<{ id: string, icon: string, label: string, application: string }>} */
export function getCachedDomains () {
  return _cached ?? []
}
