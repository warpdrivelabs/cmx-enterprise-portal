/**
 * 调试主页 mainapp / workspace 入口（来自 CMXPortalManager `src/lib/mainapp.js` 的精简移植）。
 *
 * 与 portal 同形：唯一全局 `globalThis.mainapp`：
 *
 * - `mainapp.workspaces[wsId]` — 调试 Content 标签对应的 Workspace（wsId 形如 `tab:<contentTabId>`）
 * - `mainapp.activityScopes[scopeId]` — 活动侧栏作用域；调试主页面**不会创建**任何活动作用域，
 *   仍保留入口便于页面脚本读到与门户一致的对象形状（始终为空对象）。
 * - `mainapp.activeWorkspaceId` — 当前激活的 Content tab 对应 wsId（无则 null）
 *
 * 每个 Workspace 含：
 * - `context` 共享上下文（{@link ContextHost}：`get/set/delete/snapshot/on/off`；仅 `set`/`delete` 触发 change）
 * - `views[viewId]` 冻结的 api 对象（来自页面 CE 的 `getPageApi()`，附系统字段 `__viewId/__region/__pageId`）
 * - `regions[region][]` viewId 列表（regions 形状与门户一致：prepare/explorer/content/property/bottom/floatview）
 *
 * 调试主页面**仅**在 `content` 区注册视图（每个 Tab 一个 CE 宿主）；不分发 explorer/property/bottom/floatview，
 * 也不实现 prepare 对话框 / 浮动窗口 / dock 拖动 / 布局持久化。这些是**有意省略**的「分区域机制」。
 *
 * 视图注册由 `run-main.js` 在脚本注入完成后调用 {@link registerView}；
 * 页面 CE 的 `disconnectedCallback`（或外层 tab 关闭）走 {@link unregisterView}。
 *
 * 页面脚本访问 workspace 的两种形态（与门户一致）：
 * 1. 顶层脚本就地捕获注入期间的 `globalThis.workspace`（`run-main.js` 在执行前后管理）。
 * 2. CE 内用 `this.workspace`（注册时给 host 挂 getter）。
 */

/** @typedef {'preparing' | 'open' | 'closed'} WorkspaceState */
/** @typedef {'prepare'|'explorer'|'content'|'property'|'bottom'|'floatview'} Region */

/**
 * 共享上下文 host：只有 `set` / `delete` 触发 `change`；裸赋值（`ctx.foo = 1`）不通知。
 */
export class ContextHost {
  constructor () {
    /** @type {Map<string, unknown>} */
    this._m = new Map()
    /** @type {Set<(ev: { key: string, value: unknown, oldValue: unknown }) => void>} */
    this._changeHandlers = new Set()
  }

  /** @param {string} key */
  get (key) {
    return this._m.get(String(key))
  }

  /** @param {string} key @param {unknown} value */
  set (key, value) {
    const k = String(key)
    const oldValue = this._m.get(k)
    if (oldValue === value) return
    this._m.set(k, value)
    this._emitChange(k, value, oldValue)
  }

  /** @param {string} key */
  delete (key) {
    const k = String(key)
    if (!this._m.has(k)) return
    const oldValue = this._m.get(k)
    this._m.delete(k)
    this._emitChange(k, undefined, oldValue)
  }

  /** @returns {Record<string, unknown>} 浅克隆快照（调用方可解构使用） */
  snapshot () {
    /** @type {Record<string, unknown>} */
    const out = {}
    for (const [k, v] of this._m) out[k] = v
    return out
  }

  /**
   * @param {'change'} evt
   * @param {(ev: { key: string, value: unknown, oldValue: unknown }) => void} handler
   */
  on (evt, handler) {
    if (evt !== 'change' || typeof handler !== 'function') return
    this._changeHandlers.add(handler)
  }

  /**
   * @param {'change'} evt
   * @param {(ev: { key: string, value: unknown, oldValue: unknown }) => void} handler
   */
  off (evt, handler) {
    if (evt !== 'change' || typeof handler !== 'function') return
    this._changeHandlers.delete(handler)
  }

  /** @param {string} key @param {unknown} value @param {unknown} oldValue */
  _emitChange (key, value, oldValue) {
    for (const h of this._changeHandlers) {
      try { h({ key, value, oldValue }) } catch (e) { console.warn('[ContextHost] change handler error', e) }
    }
  }

  _dispose () {
    this._m.clear()
    this._changeHandlers.clear()
  }
}

const EMPTY_REGIONS = () => ({
  prepare: [],
  explorer: [],
  content: [],
  property: [],
  bottom: [],
  floatview: [],
})

/**
 * 工作区作用域：对应 content 区一个 workspace tab。
 */
export class Workspace {
  /** @param {{ id: string, label?: string }} p */
  constructor ({ id, label }) {
    this.id = String(id)
    this.label = label != null ? String(label) : ''
    /** @type {WorkspaceState} */
    this.state = 'open'
    this.context = new ContextHost()
    /** @type {Record<string, Readonly<Record<string, unknown>>>} */
    this.views = Object.create(null)
    /** @type {{ [R in Region]: string[] }} */
    this.regions = EMPTY_REGIONS()
    /** @type {Map<string, HTMLElement>} 仅内部：viewId → host，供 unregister 校对 */
    this._hosts = new Map()
  }

  dispose () {
    this.state = 'closed'
    this.context._dispose()
    this._hosts.clear()
  }
}

/**
 * 活动侧栏作用域：结构同 Workspace 精简版，仅 `explorer` 区域。
 * 调试主页面不会创建此类实例，留作 API 对齐（页面脚本可读到 `mainapp.activityScopes`）。
 */
export class ActivityScope {
  /** @param {{ id: string, label?: string }} p */
  constructor ({ id, label }) {
    this.id = String(id)
    this.label = label != null ? String(label) : ''
    /** @type {'activity'} */
    this.type = 'activity'
    /** @type {'open'} */
    this.state = 'open'
    this.context = new ContextHost()
    /** @type {Record<string, Readonly<Record<string, unknown>>>} */
    this.views = Object.create(null)
    /** @type {{ explorer: string[] }} */
    this.regions = { explorer: [] }
    /** @type {Map<string, HTMLElement>} */
    this._hosts = new Map()
  }

  dispose () {
    this.context._dispose()
    this._hosts.clear()
  }
}

/** @type {{ workspaces: Record<string, Workspace>, activityScopes: Record<string, ActivityScope>, activeWorkspaceId: string | null }} */
const mainapp = {
  workspaces: Object.create(null),
  activityScopes: Object.create(null),
  activeWorkspaceId: null,
}

if (typeof globalThis !== 'undefined') {
  /** @type {any} */ (globalThis).mainapp = mainapp
}

export { mainapp }

/**
 * 创建或复用工作区（同 id 已存在则返回既有实例，仅刷新 label；避免重复建实例覆盖现有 views）。
 * @param {string} id wsId（`tab:<tabId>`）
 * @param {{ label?: string }} [meta]
 * @returns {Workspace}
 */
export function createWorkspace (id, meta = {}) {
  const key = String(id)
  const existing = mainapp.workspaces[key]
  if (existing) {
    if (meta.label != null) existing.label = String(meta.label)
    return existing
  }
  const ws = new Workspace({ id: key, label: meta.label })
  mainapp.workspaces[key] = ws
  return ws
}

/** @param {string} id */
export function disposeWorkspace (id) {
  const key = String(id)
  const ws = mainapp.workspaces[key]
  if (!ws) return
  ws.dispose()
  delete mainapp.workspaces[key]
  if (mainapp.activeWorkspaceId === key) mainapp.activeWorkspaceId = null
}

/**
 * 创建或复用活动侧栏作用域。
 * @param {string} id `actv:<activityId>`
 * @param {{ label?: string }} [meta]
 * @returns {ActivityScope}
 */
export function createActivityScope (id, meta = {}) {
  const key = String(id)
  const existing = mainapp.activityScopes[key]
  if (existing) {
    if (meta.label != null) existing.label = String(meta.label)
    return existing
  }
  const scope = new ActivityScope({ id: key, label: meta.label })
  mainapp.activityScopes[key] = scope
  return scope
}

/** @param {string} id */
export function disposeActivityScope (id) {
  const key = String(id)
  const scope = mainapp.activityScopes[key]
  if (!scope) return
  scope.dispose()
  delete mainapp.activityScopes[key]
}

/**
 * 由 scopeId 返回对应 Workspace 或 ActivityScope（未找到 → null）。
 * @param {string} scopeId
 */
export function getScope (scopeId) {
  const key = String(scopeId ?? '')
  return mainapp.workspaces[key] || mainapp.activityScopes[key] || null
}

/**
 * 注册一个视图到作用域：冻结 api 对象 + 系统字段；已存在同 viewId 时，若仍是同 host 则视为重复 connect（no-op），
 * 否则以新 host 覆盖（与门户行为一致）。
 *
 * @param {string} scopeId wsId / activityScopeId
 * @param {string} viewId
 * @param {Region} region
 * @param {string} pageId
 * @param {HTMLElement} host CE 元素本体
 * @returns {Readonly<Record<string, unknown>> | null} 冻结后的 api 对象（失败返回 null）
 */
export function registerView (scopeId, viewId, region, pageId, host) {
  const scope = getScope(scopeId)
  if (!scope) return null
  const vid = String(viewId)
  if (!vid) return null
  const prevHost = scope._hosts.get(vid)
  if (prevHost === host) return scope.views[vid] ?? null
  /** @type {Record<string, unknown> | null} */
  let userApi = null
  try {
    const api = /** @type {any} */ (host)?.getPageApi?.()
    if (api && typeof api === 'object') userApi = api
  } catch (e) {
    console.warn('[mainapp] getPageApi() threw; registering view with no user api', e)
  }
  const frozen = Object.freeze({
    ...(userApi || {}),
    __viewId: vid,
    __region: region,
    __pageId: pageId,
  })
  scope.views[vid] = frozen
  scope._hosts.set(vid, host)
  const regionList = /** @type {any} */ (scope.regions)[region]
  if (Array.isArray(regionList) && !regionList.includes(vid)) regionList.push(vid)
  /** 让 CE 内通过 `this.workspace` 拿到所属作用域；覆盖 connectedCallback 阶段赋的快照值，确保 getter 始终指向最新 scope。 */
  try {
    Object.defineProperty(host, 'workspace', {
      configurable: true,
      get: () => getScope(scopeId),
    })
  } catch { /* host 被冻结等极端情况忽略 */ }
  return frozen
}

/**
 * 注销视图：仅当 `scope._hosts[viewId] === host` 时才删除，与门户行为一致。
 *
 * @param {string} scopeId
 * @param {string} viewId
 * @param {HTMLElement} host
 */
export function unregisterView (scopeId, viewId, host) {
  const scope = getScope(scopeId)
  if (!scope) return
  const vid = String(viewId)
  const cur = scope._hosts.get(vid)
  if (cur !== host) return
  scope._hosts.delete(vid)
  delete scope.views[vid]
  for (const r of Object.keys(scope.regions)) {
    const list = /** @type {any} */ (scope.regions)[r]
    if (!Array.isArray(list)) continue
    const idx = list.indexOf(vid)
    if (idx >= 0) list.splice(idx, 1)
  }
}

/** @param {string | null} wsId */
export function setActiveWorkspace (wsId) {
  mainapp.activeWorkspaceId = wsId == null ? null : String(wsId)
}

/**
 * 由 DOM 节点上溯 `data-cmx-workspace-id` 定位所属作用域；未找到返回 null。
 * @param {Node | null | undefined} node
 */
export function scopeIdFromDom (node) {
  let cur = /** @type {Element | null} */ (node instanceof Element ? node : (node?.parentNode instanceof Element ? node.parentNode : null))
  while (cur) {
    if (cur instanceof HTMLElement) {
      const id = cur.dataset.cmxWorkspaceId
      if (id) return id
    }
    cur = cur.parentElement
  }
  return null
}
