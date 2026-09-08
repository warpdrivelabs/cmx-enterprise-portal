/**
 * Workspace 视图区域可拖拽布局：viewKey 派生 + localStorage 持久化 + drop 移动算法。
 *
 * 不依赖 DOM。供 {@link WorkspaceNode.open_view} 在打开时 restore，由各面板 drop handler
 * + portal-app 在拖动结束后 mutate workspace、写回 storage。
 *
 * 存储模型：单 key `cmx-portal:wsDockLayout:v1`，值是一个对象，所有 workspace 的布局都在里面，
 * 便于一次性读写、LRU 修剪与重置。
 */

import {
  htmlPageIdFromViewSpec,
  normalizeWorkspaceRegionViews,
  workspaceRegionViewsWrapper,
} from './workspace-node.js'

/** 拖拽 payload MIME，仅本工程内识别。 */
export const PAYLOAD_MIME = 'application/x-cmx-ws-view-move'

const LAYOUT_STORAGE_KEY = 'cmx-portal:wsDockLayout:v1'
const LAYOUT_SCHEMA_VERSION = 1
/** entries 数到达上限时按 savedAt 升序丢弃最老的，避免 localStorage 5MB 配额耗尽。 */
const LAYOUT_MAX_ENTRIES = 200

/** @typedef {'explorer'|'content'|'property'|'bottom'|'floatview'} DockRegion */
const DOCK_REGIONS = /** @type {DockRegion[]} */ (['explorer', 'content', 'property', 'bottom', 'floatview'])

/** @typedef {{ regions: Record<DockRegion, string[]> }} DockLayout */

/**
 * 32-bit FNV-1a hash → base36；用于 viewKey 回退结构化指纹（非安全 hash，仅去重用）。
 * @param {string} s
 * @returns {string}
 */
function hash32 (s) {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0
  }
  return h.toString(36)
}

/**
 * 抽 spec.data 的稳定子集做 hash，避免把 html_pages 注入的运行时大字段（runnableDoc 等）拉进 key。
 * @param {Record<string, unknown>|undefined|null} data
 * @returns {string}
 */
function stableDataKey (data) {
  if (!data || typeof data !== 'object') return ''
  /** @type {string[]} */
  const parts = []
  for (const k of ['title', 'menu', 'url', 'href', 'src', 'html_page']) {
    const v = /** @type {Record<string, unknown>} */ (data)[k]
    if (v != null) parts.push(`${k}=${String(v)}`)
  }
  return parts.join('|')
}

/**
 * 派生单个 viewKey（不去重，调用方在 walk 时统一去重附加 `#<ord>`）。
 * 回退链：html_page id → spec.id → stableHash(type|tabLabel|html_page|dataKey) → __pos:<region>:<index>
 * @param {Record<string, unknown>} spec
 * @param {{ region: DockRegion, index: number }} ctx
 * @returns {string}
 */
function deriveSingleViewKey (spec, ctx) {
  const pageId = htmlPageIdFromViewSpec(/** @type {any} */ (spec))
  if (pageId) return `page:${pageId}`
  const explicit = typeof spec.id === 'string' && spec.id.trim() ? spec.id.trim()
    : (typeof /** @type {any} */ (spec).viewId === 'string' && /** @type {any} */ (spec).viewId.trim()
        ? /** @type {string} */ (/** @type {any} */ (spec).viewId).trim()
        : '')
  if (explicit) return `id:${explicit}`
  const type = String(spec.type || 'placeholder').trim().toLowerCase()
  const label = typeof /** @type {any} */ (spec).tabLabel === 'string'
    ? /** @type {string} */ (/** @type {any} */ (spec).tabLabel).trim()
    : ''
  const dk = stableDataKey(/** @type {Record<string, unknown>} */ (spec.data))
  if (type !== 'placeholder' || label || dk) {
    return `h:${hash32(`${type}|${label}|${dk}`)}`
  }
  return `__pos:${ctx.region}:${ctx.index}`
}

/**
 * 在某 region 视图列表内按顺序派生 viewKey，对碰撞键附加 `#<ord>`（区内一次性去重）。
 * @param {DockRegion} region
 * @param {WorkspaceRegionViewsInput} raw
 * @returns {string[]}
 */
function deriveViewKeysForRegion (region, raw) {
  const views = normalizeWorkspaceRegionViews(raw)
  /** @type {Map<string, number>} */
  const seen = new Map()
  return views.map((v, i) => {
    const base = deriveSingleViewKey(/** @type {Record<string, unknown>} */ (v), { region, index: i })
    const cnt = seen.get(base) || 0
    seen.set(base, cnt + 1)
    return cnt === 0 ? base : `${base}#${cnt}`
  })
}

/**
 * 入口：单条 spec 的 viewKey 派生，**不带去重**——drop payload 用此版本。
 * @param {Record<string, unknown>} spec
 * @param {{ region: DockRegion, index: number }} ctx
 */
export function deriveWorkspaceViewKey (spec, ctx) {
  return deriveSingleViewKey(spec, ctx)
}

/**
 * 从 WorkspaceNode 派生持久化 ID。
 * @param {{ meta?: { tabId?: string }, extensions?: { sourceMenuId?: unknown } }} node
 * @returns {string}
 */
export function deriveWorkspaceLayoutId (node) {
  const ext = node?.extensions || {}
  const sourceMenuId = ext.sourceMenuId != null ? String(ext.sourceMenuId).trim() : ''
  if (sourceMenuId) return `menu:${sourceMenuId}`
  const tabId = node?.meta?.tabId != null ? String(node.meta.tabId).trim() : ''
  if (tabId) return `tab:${tabId}`
  return ''
}

/**
 * 从 ws 派生 layout JSON（drop 后写入 / 显式保存时调用）。
 * @param {Record<string, unknown>|null|undefined} ws
 * @returns {DockLayout}
 */
export function deriveDockLayoutFromWorkspace (ws) {
  /** @type {DockLayout} */
  const out = { regions: { explorer: [], content: [], property: [], bottom: [], floatview: [] } }
  if (!ws || typeof ws !== 'object') return out
  for (const r of DOCK_REGIONS) {
    out.regions[r] = deriveViewKeysForRegion(r, /** @type {any} */ (ws[r]))
  }
  return out
}

/**
 * 应用 layout 到 ws：原地修改各 region。
 * 算法：pool 所有视图（保留 originalRegion + spec 引用 + viewKey）→ 按 layout 顺序认领 →
 * 未被认领的视图按 originalRegion 末尾追加。
 *
 * 不会丢视图：layout 中找不到的旧 key 进入 dropped 列表（一次性 warn 用），未在 layout 出现的新视图自动 append。
 *
 * 写回时：保留 wrapper 形态的 caption / icon 等元字段；content 区强制 wrapper 形态以便后续拖入。
 *
 * @param {Record<string, unknown>} ws
 * @param {DockLayout|null|undefined} layout
 * @returns {{ applied: number, dropped: string[] }}
 */
export function applyDockLayoutToWorkspace (ws, layout) {
  if (!ws || typeof ws !== 'object') return { applied: 0, dropped: [] }
  const layoutRegions = layout && layout.regions && typeof layout.regions === 'object'
    ? /** @type {Record<string, unknown>} */ (layout.regions)
    : {}

  /** @type {{ key: string, spec: Record<string, unknown>, originalRegion: DockRegion, originalIndex: number, claimed: boolean }[]} */
  const pool = []
  /** @type {Partial<Record<DockRegion, Record<string, unknown>>>} 保留各区原 wrapper 的 meta（caption/icon/...） */
  const wrapperMeta = {}

  for (const r of DOCK_REGIONS) {
    if (!Object.prototype.hasOwnProperty.call(ws, r)) continue
    const raw = /** @type {any} */ (ws[r])
    const wrap = workspaceRegionViewsWrapper(raw)
    if (wrap) {
      const meta = { ...wrap }
      delete /** @type {any} */ (meta).views
      wrapperMeta[r] = /** @type {Record<string, unknown>} */ (meta)
    }
    const keys = deriveViewKeysForRegion(r, raw)
    const views = normalizeWorkspaceRegionViews(raw)
    views.forEach((spec, idx) => {
      pool.push({
        key: keys[idx],
        spec: /** @type {Record<string, unknown>} */ (spec),
        originalRegion: r,
        originalIndex: idx,
        claimed: false,
      })
    })
  }

  /** @type {Map<string, { key: string, spec: Record<string, unknown>, originalRegion: DockRegion, originalIndex: number, claimed: boolean }[]>} */
  const byKey = new Map()
  for (const v of pool) {
    let bucket = byKey.get(v.key)
    if (!bucket) {
      bucket = []
      byKey.set(v.key, bucket)
    }
    bucket.push(v)
  }

  /** @type {Record<DockRegion, Record<string, unknown>[]>} */
  const result = { explorer: [], content: [], property: [], bottom: [], floatview: [] }
  /** @type {string[]} */
  const dropped = []

  for (const r of DOCK_REGIONS) {
    const wantKeys = Array.isArray(layoutRegions[r]) ? /** @type {unknown[]} */ (layoutRegions[r]) : []
    for (const k of wantKeys) {
      const key = String(k)
      const bucket = byKey.get(key)
      const entry = bucket?.find((e) => !e.claimed)
      if (entry) {
        entry.claimed = true
        result[r].push(entry.spec)
      } else {
        dropped.push(key)
      }
    }
  }
  for (const v of pool) {
    if (!v.claimed) result[v.originalRegion].push(v.spec)
  }

  for (const r of DOCK_REGIONS) {
    const arr = result[r]
    if (!arr.length) {
      if (Object.prototype.hasOwnProperty.call(ws, r)) ws[r] = null
      continue
    }
    if (wrapperMeta[r]) {
      ws[r] = { ...wrapperMeta[r], views: arr }
    } else if (r === 'content' || r === 'floatview' || arr.length > 1) {
      /* content / floatview 始终 wrapper 形态：后续可能被拖入新视图（floatview 还需 caption/icon meta 占位） */
      ws[r] = { views: arr }
    } else {
      ws[r] = arr[0]
    }
  }

  if (dropped.length && typeof console !== 'undefined') {
    console.warn('[cmx-portal] dock layout 中的部分 viewKey 在新 workspace 中找不到，已丢弃：', dropped)
  }

  return { applied: pool.filter((v) => v.claimed).length, dropped }
}

/**
 * 在 ws 上单步移动：从 source[viewKey 第一处] 取出，插入到 target[targetIndex]。
 * 用于 drop handler 收到事件后改 ws-like 对象。
 * @param {Record<string, unknown>} ws
 * @param {DockRegion} sourceRegion
 * @param {string} viewKey
 * @param {DockRegion} targetRegion
 * @param {number} targetIndex
 * @returns {boolean} 是否实际发生移动
 */
export function moveViewInWorkspace (ws, sourceRegion, viewKey, targetRegion, targetIndex) {
  if (!ws || typeof ws !== 'object') return false
  /** @type {Partial<Record<DockRegion, Record<string, unknown>>>} */
  const wrapperMeta = {}
  /** @type {Record<DockRegion, Record<string, unknown>[]>} */
  const lists = { explorer: [], content: [], property: [], bottom: [], floatview: [] }
  /** @type {Record<DockRegion, string[]>} */
  const keys = { explorer: [], content: [], property: [], bottom: [], floatview: [] }

  for (const r of DOCK_REGIONS) {
    if (Object.prototype.hasOwnProperty.call(ws, r)) {
      const raw = /** @type {any} */ (ws[r])
      const wrap = workspaceRegionViewsWrapper(raw)
      if (wrap) {
        const meta = { ...wrap }
        delete /** @type {any} */ (meta).views
        wrapperMeta[r] = /** @type {Record<string, unknown>} */ (meta)
      }
      const arr = normalizeWorkspaceRegionViews(raw)
      lists[r] = arr.map((v) => /** @type {Record<string, unknown>} */ (v))
      keys[r] = deriveViewKeysForRegion(r, raw)
    }
  }

  const srcArr = lists[sourceRegion]
  const srcKeys = keys[sourceRegion]
  const fromIdx = srcKeys.indexOf(viewKey)
  if (fromIdx < 0) return false
  const [moved] = srcArr.splice(fromIdx, 1)
  if (!moved) return false
  srcKeys.splice(fromIdx, 1)

  const tgtArr = lists[targetRegion]
  let insertAt = Math.max(0, Math.min(targetIndex | 0, tgtArr.length))
  /* 同区移动时若 targetIndex 在原位置之后，需要因 splice 移除补偿 -1（仅当 source/target 同区） */
  if (sourceRegion === targetRegion && fromIdx < insertAt) insertAt -= 1
  if (sourceRegion === targetRegion && insertAt === fromIdx) {
    /* 拖回原位，noop：恢复并返回 false */
    srcArr.splice(fromIdx, 0, moved)
    return false
  }
  tgtArr.splice(insertAt, 0, moved)

  /* 仅写回 source / target 两个区（同区时去重）；其余区保留原引用，
     避免下游 per-region 引用比较误判为「全部变更」从而重建所有缓存根（视觉闪烁）。 */
  const changed = sourceRegion === targetRegion ? [sourceRegion] : [sourceRegion, targetRegion]
  for (const r of changed) {
    const arr = lists[r]
    if (!arr.length) {
      if (Object.prototype.hasOwnProperty.call(ws, r)) ws[r] = null
      continue
    }
    if (wrapperMeta[r]) {
      ws[r] = { ...wrapperMeta[r], views: arr }
    } else if (r === 'content' || r === 'floatview' || arr.length > 1) {
      ws[r] = { views: arr }
    } else {
      ws[r] = arr[0]
    }
  }
  return true
}

/* ========== localStorage ========== */

/** @returns {{ schemaVersion: number, entries: Record<string, { savedAt: number, regions: Record<string, string[]> }> }} */
function readDockLayoutStore () {
  /** @type {Storage|undefined} */
  const ls = typeof localStorage !== 'undefined' ? localStorage : undefined
  if (!ls) return { schemaVersion: LAYOUT_SCHEMA_VERSION, entries: {} }
  let raw = ''
  try {
    raw = ls.getItem(LAYOUT_STORAGE_KEY) || ''
  } catch {
    return { schemaVersion: LAYOUT_SCHEMA_VERSION, entries: {} }
  }
  if (!raw) return { schemaVersion: LAYOUT_SCHEMA_VERSION, entries: {} }
  try {
    const obj = JSON.parse(raw)
    if (!obj || typeof obj !== 'object' || obj.schemaVersion !== LAYOUT_SCHEMA_VERSION) {
      console.warn('[cmx-portal] dock layout storage schemaVersion 不匹配，已丢弃旧数据')
      return { schemaVersion: LAYOUT_SCHEMA_VERSION, entries: {} }
    }
    const entries = obj.entries && typeof obj.entries === 'object' ? obj.entries : {}
    return { schemaVersion: LAYOUT_SCHEMA_VERSION, entries }
  } catch {
    console.warn('[cmx-portal] dock layout storage JSON 解析失败，已丢弃旧数据')
    return { schemaVersion: LAYOUT_SCHEMA_VERSION, entries: {} }
  }
}

/**
 * @param {{ schemaVersion: number, entries: Record<string, { savedAt: number, regions: Record<string, string[]> }> }} store
 */
function writeDockLayoutStore (store) {
  const ls = typeof localStorage !== 'undefined' ? localStorage : undefined
  if (!ls) return
  /* LRU 修剪：超过上限按 savedAt 升序删除最老的若干条 */
  const ids = Object.keys(store.entries)
  if (ids.length > LAYOUT_MAX_ENTRIES) {
    ids.sort((a, b) => (store.entries[a]?.savedAt || 0) - (store.entries[b]?.savedAt || 0))
    const drop = ids.slice(0, ids.length - LAYOUT_MAX_ENTRIES)
    for (const k of drop) delete store.entries[k]
  }
  try {
    ls.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(store))
  } catch (err) {
    console.warn('[cmx-portal] dock layout 写入 localStorage 失败：', err)
  }
}

/**
 * @param {string} workspaceId
 * @returns {DockLayout|null}
 */
export function readDockLayout (workspaceId) {
  if (!workspaceId) return null
  const store = readDockLayoutStore()
  const entry = store.entries[workspaceId]
  if (!entry || !entry.regions) return null
  /** @type {DockLayout} */
  const layout = { regions: { explorer: [], content: [], property: [], bottom: [], floatview: [] } }
  for (const r of DOCK_REGIONS) {
    const v = entry.regions[r]
    layout.regions[r] = Array.isArray(v) ? v.map((x) => String(x)) : []
  }
  return layout
}

/**
 * @param {string} workspaceId
 * @param {DockLayout} layout
 */
export function writeDockLayout (workspaceId, layout) {
  if (!workspaceId || !layout || !layout.regions) return
  const store = readDockLayoutStore()
  /** @type {Record<string, string[]>} */
  const regions = {}
  for (const r of DOCK_REGIONS) {
    regions[r] = Array.isArray(layout.regions[r]) ? layout.regions[r].map((x) => String(x)) : []
  }
  store.entries[workspaceId] = { savedAt: Date.now(), regions }
  writeDockLayoutStore(store)
}

/**
 * @param {string} workspaceId
 */
export function clearDockLayout (workspaceId) {
  if (!workspaceId) return
  const store = readDockLayoutStore()
  if (store.entries[workspaceId]) {
    delete store.entries[workspaceId]
    writeDockLayoutStore(store)
  }
}

/* ========== drag payload ========== */

/**
 * @typedef {{
 *   workspaceTabId: string,
 *   sourceRegion: DockRegion,
 *   sourceIndex: number,
 *   viewKey: string,
 * }} DragPayload
 */

/**
 * @param {DragPayload} p
 * @returns {string}
 */
export function encodeDragPayload (p) {
  return JSON.stringify(p)
}

/**
 * @param {DataTransfer|null} dt
 * @returns {DragPayload|null}
 */
export function decodeDragPayload (dt) {
  if (!dt) return null
  let raw = ''
  try {
    raw = dt.getData(PAYLOAD_MIME) || ''
  } catch {
    return null
  }
  if (!raw) return null
  try {
    const obj = JSON.parse(raw)
    if (!obj || typeof obj !== 'object') return null
    const region = obj.sourceRegion
    if (region !== 'explorer' && region !== 'content' && region !== 'property' && region !== 'bottom' && region !== 'floatview') {
      return null
    }
    return {
      workspaceTabId: String(obj.workspaceTabId ?? ''),
      sourceRegion: region,
      sourceIndex: Number.isFinite(obj.sourceIndex) ? Number(obj.sourceIndex) : 0,
      viewKey: String(obj.viewKey ?? ''),
    }
  } catch {
    return null
  }
}

/** 拖拽过程中各面板加在 region 容器上的高亮 class（统一定义，便于 CSS 共享）。 */
export const DROP_TARGET_CLASS = 'cmx-ws-drop-target'

/** @type {DockRegion[]} */
export const DOCK_REGIONS_LIST = [...DOCK_REGIONS]

/**
 * 各面板共用的 shadowRoot DnD 监听：源是面板内 `.cmx-ws-tab-btn`（如有），目标是 `paneEl`。
 * 跨 workspace 的 drop 由 portal-app 的事件处理器再校验拒绝。
 *
 * @param {ShadowRoot|HTMLElement} sroot 面板的 shadowRoot
 * @param {() => HTMLElement|null} getPane 区内主 pane（含 `.cmx-ws-region` 或单视图）的提供器
 * @param {DockRegion} region 本面板对应的 region key
 * @param {() => string} getActiveWorkspaceTabId 当前激活 outer ws tab id（跨 ws 拒绝判断 + payload tag）
 * @param {() => Record<string, unknown>|null} getCurrentSpec 本面板当前 ws region 的 raw spec（用于派生 viewKey + 禁出空判断）
 * @param {(detail: { sourceRegion: DockRegion, sourceIndex: number, viewKey: string, targetRegion: DockRegion, targetIndex: number, tabId: string }) => void} onDropDetail drop 回调（由面板派发 `portal-workspace-view-dropped` 事件）
 * @returns {() => void} 解绑函数
 */
export function wireWorkspacePanelDnd (sroot, getPane, region, getActiveWorkspaceTabId, getCurrentSpec, onDropDetail) {
  /** @param {DragEvent} e */
  const isWsPayload = (e) => {
    const types = e.dataTransfer?.types
    if (!types) return false
    for (const t of types) if (t === PAYLOAD_MIME) return true
    return false
  }

  /** @param {DragEvent} e */
  const onDragStart = (e) => {
    const t = /** @type {Element|null} */ (e.target)
    if (!(t instanceof Element)) return
    const btn = t.closest('.cmx-ws-tab-btn')
    if (!(btn instanceof HTMLElement)) return
    const pane = getPane()
    if (!pane || !pane.contains(btn)) return
    const wsTabId = getActiveWorkspaceTabId()
    if (!wsTabId) {
      e.preventDefault()
      return
    }
    const spec = getCurrentSpec()
    if (!spec) {
      e.preventDefault()
      return
    }
    const idxStr = btn.getAttribute('data-pane-index') || btn.dataset.paneIndex
    const idx = parseInt(String(idxStr ?? '0'), 10) || 0
    const views = normalizeWorkspaceRegionViews(/** @type {any} */ (spec))
    if (!views.length) {
      e.preventDefault()
      return
    }
    const viewSpec = views[idx]
    if (!viewSpec) {
      e.preventDefault()
      return
    }
    const viewKey = deriveWorkspaceViewKey(/** @type {Record<string, unknown>} */ (viewSpec), { region, index: idx })
    try {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData(PAYLOAD_MIME, encodeDragPayload({
        workspaceTabId: wsTabId,
        sourceRegion: region,
        sourceIndex: idx,
        viewKey,
      }))
    } catch {
      /* 静默忽略 */
    }
  }

  /** @param {DragEvent} e */
  const onDragOver = (e) => {
    if (!isWsPayload(e)) return
    const pane = getPane()
    if (!pane) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    pane.classList.add(DROP_TARGET_CLASS)
  }

  /** @param {DragEvent} e */
  const onDragLeave = (e) => {
    const pane = getPane()
    if (!pane) return
    const rel = /** @type {Element|null} */ (e.relatedTarget)
    if (rel && pane.contains(rel)) return
    pane.classList.remove(DROP_TARGET_CLASS)
  }

  /** @param {DragEvent} e */
  const onDropEvt = (e) => {
    if (!isWsPayload(e)) return
    e.preventDefault()
    const pane = getPane()
    pane?.classList?.remove(DROP_TARGET_CLASS)
    const payload = decodeDragPayload(e.dataTransfer)
    if (!payload) return
    const wsTabId = getActiveWorkspaceTabId()
    if (!wsTabId || payload.workspaceTabId !== wsTabId) return
    /* 落点 index：命中区内某 `.cmx-ws-tab-btn` 时按其水平中线决定前后；否则末尾追加 */
    let insertIndex = Number.MAX_SAFE_INTEGER
    if (pane) {
      const tabBar = pane.querySelector('.cmx-ws-region .cmx-ws-region-tabs-top')
        || pane.querySelector('.cmx-ws-region .cmx-ws-region-tabs-bottom')
        || pane.querySelector('.cmx-ws-region-tabs-top')
        || pane.querySelector('.cmx-ws-region-tabs-bottom')
      if (tabBar instanceof HTMLElement) {
        const btns = tabBar.querySelectorAll('.cmx-ws-tab-btn')
        const x = e.clientX
        for (let i = 0; i < btns.length; i++) {
          const b = btns[i]
          if (!(b instanceof HTMLElement)) continue
          const r = b.getBoundingClientRect()
          if (x < r.left + r.width / 2) {
            insertIndex = i
            break
          }
        }
        if (insertIndex === Number.MAX_SAFE_INTEGER) insertIndex = btns.length
      }
    }
    onDropDetail({
      tabId: wsTabId,
      sourceRegion: payload.sourceRegion,
      sourceIndex: payload.sourceIndex,
      viewKey: payload.viewKey,
      targetRegion: region,
      targetIndex: insertIndex,
    })
  }

  sroot.addEventListener('dragstart', onDragStart)
  sroot.addEventListener('dragover', onDragOver)
  sroot.addEventListener('dragleave', onDragLeave)
  sroot.addEventListener('drop', onDropEvt)
  return () => {
    sroot.removeEventListener('dragstart', onDragStart)
    sroot.removeEventListener('dragover', onDragOver)
    sroot.removeEventListener('dragleave', onDragLeave)
    sroot.removeEventListener('drop', onDropEvt)
  }
}

/**
 * @typedef {import('./workspace-node.js').WorkspaceRegionViewsInput} WorkspaceRegionViewsInput
 */
