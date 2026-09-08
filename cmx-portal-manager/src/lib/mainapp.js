/**
 * 跨视图页面互通入口。唯一全局 `globalThis.mainapp`：
 *
 * - `mainapp.workspaces[wsId]` — 打开中的工作区（wsId 形如 `tab:<contentTabId>`）
 * - `mainapp.activityScopes[scopeId]` — 活动侧栏 html_pages 作用域（scopeId 形如 `actv:<activityId>`）
 * - `mainapp.activeWorkspaceId` — 当前激活的 content tab 对应 wsId（无则 null）
 *
 * 每个 Workspace / ActivityScope 含：
 * - `context` 共享上下文（{@link ContextHost}：`get/set/delete/snapshot/on/off`；仅 `set` 触发 change）
 * - `views[viewId]` 冻结的 api 对象（来自页面 CE 的 `getPageApi()`，附系统字段 `__viewId/__region/__pageId`）
 * - `regions[region][]` viewId 列表
 * - `pageview[viewId]` 所有已注册的 html_pages CE 宿主元素（HTMLElement 实例，即 `host`）；与 `views` 键空间一致，实时反映注册/注销，支持 `ws.pageview['my-view']` 直接取 host
 *
 * 视图注册由 `cmx-html-pages-<slug>` wrapper 在 `connectedCallback` 调 {@link registerView}、
 * `disconnectedCallback` 调 {@link unregisterView}；host 比对避免 dock 拖动时 disconnect/connect 顺序错乱。
 *
 * 页面脚本访问 workspace 的两种形态：
 * 1. 顶层脚本就地捕获注入期间的 `globalThis.workspace`（由 {@link injectParsedHtmlBodyIntoRunSlot} 前后管理）
 * 2. CE 内用 `this.workspace`：`connectedCallback` 启动时立即从 `globalThis.workspace` 捕获（快照），
 *    随后 {@link registerView} 覆盖为 live getter（始终返回最新 scope）
 */

import { ActionRegistry } from './action-registry.js'

/** @typedef {'preparing' | 'open' | 'closed'} WorkspaceState */
/** @typedef {'prepare'|'explorer'|'content'|'property'|'bottom'|'floatview'|'model'|'inner'|'embed'} Region */

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
  model: [],
  inner: [],
  embed: [],
})

/**
 * 为 _hosts Map 创建 pageview Proxy：
 * - `pv['viewId']` → HTMLElement | undefined
 * - `'viewId' in pv` → boolean
 * - `Object.keys(pv)` / `Object.entries(pv)` → 当前所有已注册 viewId 与 host
 * @param {Map<string, HTMLElement>} hosts
 * @returns {Record<string, HTMLElement>}
 */
function _makePageviewProxy (hosts) {
  return /** @type {any} */ (new Proxy(hosts, {
    get (map, prop) {
      if (typeof prop === 'symbol') return undefined
      return map.get(prop)
    },
    has (map, prop) { return map.has(/** @type {string} */ (prop)) },
    ownKeys (map) { return Array.from(map.keys()) },
    getOwnPropertyDescriptor (map, prop) {
      if (typeof prop === 'string' && map.has(prop)) {
        return { configurable: true, enumerable: true, value: map.get(prop) }
      }
      return undefined
    },
  }))
}

/**
 * 工作区作用域：对应 content 区一个 workspace tab。
 */
export class Workspace {
  /** @param {{ id: string, label?: string }} p */
  constructor ({ id, label }) {
    this.id = String(id)
    this.label = label != null ? String(label) : ''
    /** @type {WorkspaceState} */
    this.state = 'preparing'
    this.context = new ContextHost()
    /** @type {Record<string, Readonly<Record<string, unknown>>>} */
    this.views = Object.create(null)
    /** @type {{ [R in Region]: string[] }} */
    this.regions = EMPTY_REGIONS()
    /** @type {Map<string, HTMLElement>} 仅内部：viewId → host，供 unregister 校对 */
    this._hosts = new Map()
    /** @type {Record<string, HTMLElement>} 所有已注册 CE 宿主的实时视图；`ws.pageview['my-view']` 直接取 host */
    this.pageview = _makePageviewProxy(this._hosts)
    /** @type {HTMLElement | undefined} inner 区缓存根；portal-content-area 在 ensure 时反向登记 */
    this._innerMountRoot = undefined
    /** @type {HTMLElement | null | undefined} inner 区的隐藏 holder（归还位置） */
    this._innerMountHolder = undefined
    /** @type {Map<string, HTMLElement> | undefined} embed 区每 view 独立 cache root（viewId → HTMLElement） */
    this._embedMountRoots = undefined
    /** @type {HTMLElement | null | undefined} embed 区隐藏 holder（归还位置） */
    this._embedMountHolder = undefined
    /** @type {Map<string, HTMLElement> | undefined} 已借出 embed root 的当前 borrower：viewId → 借入容器 */
    this._embedBorrowers = undefined
    /** @type {HTMLElement | null} 当前打开的 portal-inner-dialog 元素 */
    this._innerDialog = null
    /** @type {Promise<{ action: 'confirm'|'cancel'|'button', buttonId?: string }> | null} 当前 open 调用的 promise（并发复用） */
    this._innerDialogPromise = null
    /** @type {import('./action-registry.js').ActionRegistry | null} workspace 级 action registry；首次 ws.actions 访问时懒建 */
    this._actions = null
  }

  /**
   * Workspace 级 action registry：跨页面共享。首次访问懒创建并订阅 workspace.context。
   * @returns {import('./action-registry.js').ActionRegistry}
   */
  get actions () {
    if (!this._actions) {
      this._actions = new ActionRegistry({
        helpers: { workspaceCtx: this.context, workspace: this },
      })
    }
    return this._actions
  }

  /**
   * 打开 inner 区对话框：把 inner 缓存根临时移入对话框；多视图时底部 Tab 切换。
   * 复用 dialogWorkspace 的对话框外壳（拖动 / 缩放 / Esc / 标题栏 / 确定取消按钮）。
   *
   * 重入：已有打开中的对话框时返回**既有 promise**，不会再开第二个。
   *
   * 入参 / 出参 / 拦截关闭：
   * - `opts.params`：注入到外层 workspace 的 `innerSession.params`（冻结）。inner 视图脚本读
   *   `host.workspace.innerSession.params`。
   * - `host.workspace.innerSession.result`（脚本读写）：脚本通过 `ws.innerSession.result.x = ...` 或
   *   `ws.innerSession.result = {...}` 写入；resolve 的 detail.result 是关闭前抓取的浅克隆。
   * - `opts.onConfirm(ctx)`：点"确定"时回调，可同步或异步。`ctx = { result, params, workspace, buttonId? }`。
   *   返回 `true` / `{ ok: true }` / `{ ok: true, result: ... }` → 关闭并 resolve；
   *   返回 `false` / `{ ok: false, message: '...' }` → **不关闭**，对话框内 message-strip 显示提示。
   *   未提供时直接关闭。
   * - 自定义 `buttons`：按钮 click 派发 `dialog-close { action: 'button', buttonId }`，**不**走 onConfirm。
   * - 取消 / Esc：直接关闭，不走 onConfirm。
   *
   * @param {{
   *   title?: string, icon?: string, description?: string,
   *   width?: string, height?: string,
   *   views?: Array<string | number>,
   *   initialView?: string,
   *   initialViewIndex?: number,
   *   buttons?: Array<{ id: string, text: string, icon?: string, design?: string, disabled?: boolean }>,
   *   confirmText?: string, cancelText?: string,
   *   showConfirm?: boolean, showCancel?: boolean,
   *   params?: Record<string, unknown>,
   *   onConfirm?: (ctx: { result: Record<string, unknown>, params: Record<string, unknown>, workspace: Workspace, buttonId?: string })
   *     => (boolean | { ok: boolean, message?: string, result?: Record<string, unknown> }
   *         | Promise<boolean | { ok: boolean, message?: string, result?: Record<string, unknown> }>),
   * }} [opts]
   * `views`：仅展示 inner 区中匹配的子集，元素可为 view id (字符串，匹配 spec.id / html_page) 或
   *   pane-index (数字)；空 / 缺省 → 全部展示。
   * `initialView` / `initialViewIndex`：初始激活的视图。仅 `initialView` 不在 keep 集里时回退到 keep 首项。
   * @returns {Promise<{ action: 'confirm'|'cancel'|'button', buttonId?: string, result?: Record<string, unknown> }>}
   */
  openInnerPageView (opts = {}) {
    if (this._innerDialogPromise) return this._innerDialogPromise
    const root = this._innerMountRoot
    if (!(root instanceof HTMLElement)) {
      return Promise.reject(new Error(`[workspace ${this.id}] inner 区未挂载（先激活 tab 或确认 workspace.inner 配置）`))
    }
    /* 在外层 workspace 上挂 innerSession：params 冻结、result 容器可写。
       与 ws.context 隔离避免污染 content 视图脚本的 context.get/set。 */
    const params = (opts && opts.params && typeof opts.params === 'object')
      ? Object.freeze({ ...opts.params })
      : Object.freeze({})
    const wsAny = /** @type {any} */ (this)
    wsAny.innerSession = { params, result: {} }

    this._innerDialogPromise = (async () => {
      await import('../components/portal-inner-dialog.js')
      return new Promise((resolve) => {
        const el = /** @type {any} */ (document.createElement('portal-inner-dialog'))
        el._innerRoot = root
        el._innerRootHolder = this._innerMountHolder || null
        el._openOpts = opts || {}
        /* 让 dialog 在 confirm 时直接读外层 workspace.innerSession.result，并能调用 onConfirm。 */
        el._outerWorkspace = this
        el._onConfirmHook = typeof opts.onConfirm === 'function' ? opts.onConfirm : null
        this._innerDialog = el
        const onClose = (e) => {
          const d = /** @type {CustomEvent<{ action?: string, buttonId?: string, result?: Record<string, unknown> }>} */ (e).detail || {}
          el.remove()
          this._innerDialog = null
          this._innerDialogPromise = null
          /* 关闭后立即清 innerSession，避免下次打开看到旧 result。 */
          wsAny.innerSession = null
          /* Action 兜底 flush：inner 关闭可能改变了外层视图依赖的状态。 */
          if (this._actions) this._actions.invalidateAll()
          resolve({
            action: d.action === 'confirm' ? 'confirm' : (d.action === 'button' ? 'button' : 'cancel'),
            buttonId: d.buttonId,
            result: d.result,
          })
        }
        el.addEventListener('dialog-close', onClose, { once: true })
        document.body.appendChild(el)
      })
    })()
    return this._innerDialogPromise
  }

  /**
   * 主动关闭 inner 对话框（等同于派发 cancel）。无打开时 no-op。
   */
  closeInnerPageView () {
    const el = this._innerDialog
    if (!(el instanceof HTMLElement)) return
    el.dispatchEvent(new CustomEvent('dialog-close', {
      bubbles: true, composed: true, detail: { action: 'cancel' },
    }))
  }

  /** @returns {boolean} */
  isInnerPageViewOpen () {
    return this._innerDialog instanceof HTMLElement
  }

  /**
   * 借出 embed 区某 view 的 mount root：把 root 从 #embed-region-host 移到调用方提供的容器。
   * **独占**：同一 viewId 同时只能被一个 borrower 占用；二次调用会先归还原 borrower（其容器变空）。
   *
   * @param {string} viewId workspace.embed 中的视图 id（spec.id 或 html_page；多视图重名则自动追加 `#2/#3`）
   * @param {HTMLElement} container 借入目的地（通常是 cmx-embed-page 的 shadowRoot 内某 div）
   * @returns {{ root: HTMLElement, icon: string, label: string } | null} 不存在该 viewId 时返回 null；
   *   icon / label 取自 workspace.embed.views[i] 的 icon / tabLabel（缺省为空串），调用方可用于 tab 显示。
   */
  borrowEmbedRoot (viewId, container) {
    const id = String(viewId || '').trim()
    if (!id) return null
    const roots = this._embedMountRoots
    if (!(roots instanceof Map)) return null
    const entry = roots.get(id)
    if (!entry || !(entry.root instanceof HTMLElement)) return null
    if (!(container instanceof HTMLElement || container instanceof DocumentFragment || /** @type {any} */ (container)?.appendChild)) return null
    if (!this._embedBorrowers) this._embedBorrowers = new Map()
    container.appendChild(entry.root)
    this._embedBorrowers.set(id, container)
    return { root: entry.root, icon: entry.icon || '', label: entry.label || '' }
  }

  /**
   * 归还 embed 区 mount root：从当前 borrower 移回 #embed-region-host。
   * 调用方应在 cmx-embed-page disconnect / page 属性变更时调。
   *
   * **borrower 比对**：传 `container` 时，仅当它仍是当前 borrower 才移回 holder。
   * 防止 dock 拖拽乱序——新宿主先 borrow（root 移入新 slot）后旧宿主才 disconnect 归还，
   * 若无比对，旧归还会把正在显示的 root 抢回 holder 导致页面消失。
   * @param {string} viewId
   * @param {HTMLElement} [container] 归还方的借入容器（cmx-embed-page 的 slot）；不传则无条件归还（向后兼容）
   */
  returnEmbedRoot (viewId, container) {
    const id = String(viewId || '').trim()
    if (!id) return
    const roots = this._embedMountRoots
    if (!(roots instanceof Map)) return
    const entry = roots.get(id)
    if (!entry || !(entry.root instanceof HTMLElement)) return
    const curBorrower = this._embedBorrowers ? this._embedBorrowers.get(id) : undefined
    /* root 已被新的 borrow 接管：忽略旧 borrower 的归还，保留 root 在新容器。 */
    if (container != null && curBorrower != null && curBorrower !== container) return
    const holder = this._embedMountHolder
    if (holder instanceof HTMLElement && holder.isConnected) {
      holder.appendChild(entry.root)
    }
    if (this._embedBorrowers) this._embedBorrowers.delete(id)
  }

  /**
   * 列出 embed 区当前所有 view id；cmx-embed-page 在 page 属性不存在时可用作错误提示。
   * @returns {string[]}
   */
  listEmbedViewIds () {
    const roots = this._embedMountRoots
    if (!(roots instanceof Map)) return []
    return Array.from(roots.keys())
  }

  dispose () {
    this.state = 'closed'
    this.context._dispose()
    this._hosts.clear()
    if (this._actions) {
      try { this._actions.dispose() } catch (e) { console.warn('[mainapp] workspace.actions dispose threw', e) }
      this._actions = null
    }
    /** 交给 mainapp 调用方删 `workspaces[id]`；此处仅清理自身。 */
  }
}

/**
 * 活动侧栏作用域：结构同 Workspace 精简版，仅 `explorer` 区域。
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
    /** @type {Record<string, HTMLElement>} 所有已注册 CE 宿主的实时视图；`scope.pageview['my-view']` 直接取 host */
    this.pageview = _makePageviewProxy(this._hosts)
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
 * 否则以新 host 覆盖并 warn（通常发生在 dock 拖动序列：old disconnect 先于 new connect 时才走替换；反序时见 {@link unregisterView}）。
 *
 * @param {string} scopeId wsId / activityScopeId
 * @param {string} viewId
 * @param {Region} region
 * @param {string} pageId
 * @param {HTMLElement} host CE 元素本体
 * @returns {Readonly<Record<string, unknown>> | null} 冻结后的 api 对象（给调用方做原地读取；失败返回 null）
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
 * 注销视图：仅当 `scope._hosts[viewId] === host` 时才删除，避免 dock 拖动时 old host disconnect 事件
 * 在 new host connect 之后到达、把刚注册的新条目错误删掉。
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
