/**
 * Action Registry：声明式按钮 / 菜单 / 工具栏项目状态管理。
 *
 * 设计原则：
 * - **完全事件驱动**：不轮询，不 setInterval；状态变化在 microtask 内同步反映。
 * - **依赖自动追踪**：update 函数中通过 ctx Proxy 读到的 key 自动登记为依赖；
 *   后续 ctx.set(key,...) 只会重算订阅了该 key 的 action。
 * - **逃生路径**：update 不依赖 ctx 时，调用方在状态变化点显式 `action.invalidate()` /
 *   `registry.invalidateAll()`；引擎也在 5 个边界时机做兜底 flush。
 * - **两层 registry**：workspace 级（跨页面共享）与 host 级（页面私有）；同 id 时
 *   host 级覆盖 workspace 级。
 *
 * Action 形状：
 * ```
 * {
 *   id: 'save',
 *   // 单个元素：el 也可写成元素数组，或返回元素的工厂函数（数组中也可混工厂）。
 *   // 注册后可继续追加 / 移除元素：
 *   //   const a = host.actions.register({...})
 *   //   a.addEl(host.shadowRoot.querySelector('#btn2'))
 *   //   a.removeEl(elem)
 *   // 或通过 registry：host.actions.getAction('save').addEl(...)
 *   el: HTMLElement | HTMLElement[] | (() => HTMLElement | null),
 *   update: (action, ctx, helpers) => void,        // 自定义逻辑：读 ctx.x、ctx.workspaceCtx.get、写 action.enabled / visible / props
 *   onActivate?: 'tab' | 'focus' | 'always',       // 何时受兜底 flush 影响（默认 'always'）
 * }
 * ```
 * 在 update 内对 `action` 写：
 * - `action.enabled = bool` → 所有 els 的 disabled 同步
 * - `action.visible = bool` → 所有 els 的 hidden 同步
 * - `action.props = { icon: '...', text: '...' }` → 所有 els 按 attribute 同步
 *
 * 视图字段：
 * - `action.el` → 第一个元素（便利访问）
 * - `action.els` → 所有元素数组
 *
 * 触发时机（五个）：
 * 1. `ctx.set(k, v)` / workspaceCtx.set(k, v) 改了 key
 * 2. tab 激活：portal-content-area 在 _notifyTabActivate 末尾调
 * 3. 对话框 open / close：portal-inner-dialog / prepare 关闭后
 * 4. focus 进入 host：page CE focusin（轻量）
 * 5. `action.invalidate()` / `registry.invalidate(id)` / `registry.invalidateAll()`
 */

/**
 * @typedef {HTMLElement | (() => HTMLElement | null | undefined)} ElLike
 *
 * @typedef {{
 *   id: string,
 *   el?: ElLike | ElLike[],
 *   update?: (action: ActionView, ctx: any, helpers: ActionHelpers) => void,
 *   onActivate?: 'tab' | 'focus' | 'always',
 * }} ActionSpec
 *
 * @typedef {{
 *   enabled: boolean,
 *   visible: boolean,
 *   props: Record<string, unknown>,
 *   el: HTMLElement | null,
 *   els: HTMLElement[],
 *   id: string,
 *   invalidate: () => void,
 *   addEl: (el: ElLike) => void,
 *   removeEl: (el: HTMLElement) => void,
 * }} ActionView
 *
 * @typedef {{
 *   workspaceCtx?: { get: (k: string) => unknown, set: (k: string, v: unknown) => void, on: (e: 'change', f: any) => void, off: (e: 'change', f: any) => void },
 *   pageview?: Record<string, unknown>,
 *   workspace?: unknown,
 * }} ActionHelpers
 */

/**
 * 全局 disconnect 观察器：所有 registry 共享一个 MutationObserver，
 * 任何 DOM 移除都触发"扫一遍所有 registry 的 view.els，摘掉 !isConnected"。
 * 单个观察器对全文档 + subtree 是 O(变更次数)，不会因为 registry 数量上升而放大。
 */
const _allRegistries = new Set()
let _disconnectObserver = null
/* 把 dirty-check 调度到 microtask 合并：一次 menu close 可能产生多个 mutation，无需多扫。 */
let _disconnectScanScheduled = false

function _scanDisconnected () {
  if (_disconnectScanScheduled) return
  _disconnectScanScheduled = true
  queueMicrotask(() => {
    _disconnectScanScheduled = false
    for (const reg of _allRegistries) reg._purgeDisconnectedEls()
  })
}

function _ensureDisconnectObserver () {
  if (_disconnectObserver || typeof MutationObserver === 'undefined' || typeof document === 'undefined') return
  _disconnectObserver = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.removedNodes && m.removedNodes.length) {
        _scanDisconnected()
        return
      }
    }
  })
  _disconnectObserver.observe(document.documentElement || document.body, {
    childList: true, subtree: true,
  })
}

/**
 * 单个 registry：键空间隔离。
 * @param {{ parent?: ActionRegistry | null, helpers?: ActionHelpers }} [opts]
 */
export class ActionRegistry {
  constructor (opts = {}) {
    this._parent = opts.parent || null
    this._helpers = opts.helpers || {}
    /** key -> value */
    this._ctxData = new Map()
    /** key -> Set<actionId>  反向依赖 */
    this._subs = new Map()
    /** actionId -> { spec, state, deps } */
    this._actions = new Map()
    /** 本轮 microtask 内待 update 的 action id */
    this._dirty = new Set()
    this._flushScheduled = false
    /** 父 registry 的 change 监听（仅当传 parent 时建立） */
    this._parentUnsub = null
    if (this._parent) {
      this._parent.onAnyKeyChange((k) => this._onParentKeyChange(k))
    }
    /** 自外部 (e.g. workspace.context) 的订阅清理函数 */
    this._extUnsub = null
    if (this._helpers.workspaceCtx) {
      const h = (ev) => this._invalidateByKey(`ws:${ev.key}`)
      this._helpers.workspaceCtx.on('change', h)
      this._extUnsub = () => this._helpers.workspaceCtx.off('change', h)
    }
    /** 监听本 registry 任意 key 变化的回调（用于 child registry 转发） */
    this._anyKeyHandlers = new Set()

    /* 把自己加入全局集合，启用全局 disconnect 观察器（懒启动）。 */
    _allRegistries.add(this)
    _ensureDisconnectObserver()
  }

  /**
   * 全局 disconnect 观察器触发：清掉所有 view.els 中已脱离 DOM 的元素。
   * 不抛错；不修改 view 其它字段。
   */
  _purgeDisconnectedEls () {
    for (const a of this._actions.values()) {
      const before = a.view.els.length
      if (!before) continue
      a.view.els = a.view.els.filter((el) => el && el.isConnected)
      if (a.view.els.length !== before) {
        a.view.el = a.view.els[0] || null
      }
    }
  }

  /**
   * 注册 action。重复 id 会覆盖。
   * @param {ActionSpec} spec
   * @returns {ActionView}
   */
  register (spec) {
    if (!spec || typeof spec !== 'object' || !spec.id) {
      throw new Error('[actions] register: spec.id is required')
    }
    const id = String(spec.id)
    const self = this
    /** @type {ActionView} */
    const view = {
      id,
      el: null,
      els: [],
      enabled: true,
      visible: true,
      props: {},
      invalidate: () => self.invalidate(id),
      addEl: (el) => self.addElToAction(id, el),
      removeEl: (el) => self.removeElFromAction(id, el),
    }
    /* extraEls：通过 addEl 追加的动态元素（菜单项、临时按钮等），不会被 spec.el 重解析覆盖。 */
    this._actions.set(id, { spec, view, deps: new Set(), extraEls: [] })
    /* 注册即跑一次：建立初始依赖 + 应用初始状态。 */
    this._runUpdate(id)
    return view
  }

  /**
   * 给已注册 action 追加一个可视元素（去重）。元素立即按当前 view 状态同步一次。
   * @param {string} id
   * @param {ElLike} elLike
   */
  addElToAction (id, elLike) {
    const a = this._actions.get(String(id))
    if (!a) return
    const el = this._resolveOneEl(elLike)
    if (!(el instanceof HTMLElement)) return
    if (a.extraEls.includes(el) || a.view.els.includes(el)) return
    a.extraEls.push(el)
    a.view.els.push(el)
    a.view.el = a.view.els[0] || null
    /* 立即对新元素应用当前状态，并装 click 拦截器（防止 disabled 时被点击）。 */
    this._applyToOneEl(a.view, el)
    this._installClickGuard(a, el)
  }

  /**
   * 从已注册 action 解绑一个元素。元素本身不被修改（属性保持当前态）。
   * @param {string} id
   * @param {HTMLElement} el
   */
  removeElFromAction (id, el) {
    const a = this._actions.get(String(id))
    if (!a) return
    const idxExtra = a.extraEls.indexOf(el)
    if (idxExtra >= 0) a.extraEls.splice(idxExtra, 1)
    const idx = a.view.els.indexOf(el)
    if (idx < 0) return
    a.view.els.splice(idx, 1)
    a.view.el = a.view.els[0] || null
  }

  /**
   * 通过 id 取已注册 action 视图（用于注册后追加元素 / 调 invalidate）。不存在返回 null。
   * @param {string} id
   * @returns {ActionView | null}
   */
  getAction (id) {
    const a = this._actions.get(String(id))
    return a ? a.view : null
  }

  /** @param {string} id */
  unregister (id) {
    const a = this._actions.get(String(id))
    if (!a) return
    for (const k of a.deps) {
      const set = this._subs.get(k)
      if (set) {
        set.delete(id)
        if (!set.size) this._subs.delete(k)
      }
    }
    this._actions.delete(String(id))
  }

  /**
   * 读：仅普通读，不追踪依赖（依赖追踪只在 update 中通过 ctx Proxy 进行）。
   * @param {string} key
   */
  get (key) {
    const k = String(key)
    if (this._ctxData.has(k)) return this._ctxData.get(k)
    if (this._parent) return this._parent.get(k)
    return undefined
  }

  /**
   * 写：相等值不触发；不等才登记脏 + 排队 flush。
   * @param {string} key
   * @param {unknown} value
   */
  set (key, value) {
    const k = String(key)
    const prev = this._ctxData.get(k)
    if (prev === value && this._ctxData.has(k)) return
    this._ctxData.set(k, value)
    this._invalidateByKey(k)
    /* 通知 child registry */
    for (const h of this._anyKeyHandlers) {
      try { h(k) } catch (e) { console.warn('[actions] any-key handler error', e) }
    }
  }

  /** 删除一个 key（也会触发依赖此 key 的 action）。 */
  delete (key) {
    const k = String(key)
    if (!this._ctxData.has(k)) return
    this._ctxData.delete(k)
    this._invalidateByKey(k)
    for (const h of this._anyKeyHandlers) {
      try { h(k) } catch (e) { console.warn('[actions] any-key handler error', e) }
    }
  }

  /** 强制重算所有 action（兜底；用于 tab 激活 / 对话框关闭 / focus 进入）。 */
  invalidateAll () {
    for (const id of this._actions.keys()) this._dirty.add(id)
    this._scheduleFlush()
  }

  /** @param {string} id */
  invalidate (id) {
    const k = String(id)
    if (!this._actions.has(k)) return
    this._dirty.add(k)
    this._scheduleFlush()
  }

  /** 内部：父 registry 的某个 key 改了 → 把本 registry 中依赖 `ws:k` / k 的 action 加入脏队列 */
  _onParentKeyChange (key) {
    this._invalidateByKey(String(key))
  }

  /** 让子 registry 订阅本 registry 任意 key 变更（实现层级穿透）。 */
  onAnyKeyChange (h) {
    if (typeof h !== 'function') return () => {}
    this._anyKeyHandlers.add(h)
    return () => this._anyKeyHandlers.delete(h)
  }

  /** 内部：把订阅了某 key 的所有 action 标脏 */
  _invalidateByKey (key) {
    const set = this._subs.get(key)
    if (!set || !set.size) return
    for (const id of set) this._dirty.add(id)
    this._scheduleFlush()
  }

  _scheduleFlush () {
    if (this._flushScheduled) return
    this._flushScheduled = true
    queueMicrotask(() => this._flush())
  }

  _flush () {
    this._flushScheduled = false
    /* 复制后清空：update 内部又调 ctx.set 时不污染本轮。 */
    const ids = Array.from(this._dirty)
    this._dirty.clear()
    for (const id of ids) this._runUpdate(id)
  }

  /**
   * 执行 update：用 Proxy 包 ctx，访问的 key 登记为依赖；写出 enabled/visible/props 同步到所有 els。
   * 若 spec.update 缺省，则按 view 当前值同步一次。
   * @param {string} id
   */
  _runUpdate (id) {
    const a = this._actions.get(id)
    if (!a) return
    const { spec, view } = a

    /* 重解析"spec.el 提供的固定元素"，与"addEl 追加的动态元素 (extraEls)"合并。
       动态元素绝不被 spec.el 重解析覆盖；fallback：spec.el 没传就保留旧 specEls。 */
    if (spec.el !== undefined) {
      a.specEls = this._resolveEls(spec.el)
    } else if (!a.specEls) {
      a.specEls = []
    }
    /* 过滤已脱离 DOM 的元素（避免泄漏）。 */
    a.specEls = a.specEls.filter((el) => el instanceof HTMLElement)
    a.extraEls = a.extraEls.filter((el) => el instanceof HTMLElement)
    view.els = []
    for (const el of a.specEls) if (!view.els.includes(el)) view.els.push(el)
    for (const el of a.extraEls) if (!view.els.includes(el)) view.els.push(el)
    view.el = view.els[0] || null

    if (typeof spec.update === 'function') {
      const readKeys = new Set()
      const ctxProxy = this._makeCtxProxy(readKeys)
      try {
        spec.update(view, ctxProxy, this._helpers)
      } catch (err) {
        console.warn(`[actions] update("${id}") threw`, err)
      }
      this._updateSubs(id, a.deps, readKeys)
    }
    for (const el of view.els) {
      this._applyToOneEl(view, el)
      this._installClickGuard(a, el)
    }
  }

  _resolveOneEl (elLike) {
    if (elLike == null) return null
    if (typeof elLike === 'function') {
      try {
        const r = elLike()
        return r instanceof HTMLElement ? r : null
      } catch { return null }
    }
    return elLike instanceof HTMLElement ? elLike : null
  }

  /**
   * @param {ElLike | ElLike[] | null | undefined} input
   * @returns {HTMLElement[]}
   */
  _resolveEls (input) {
    if (input == null) return []
    const arr = Array.isArray(input) ? input : [input]
    /** @type {HTMLElement[]} */
    const out = []
    for (const item of arr) {
      const el = this._resolveOneEl(item)
      if (el && !out.includes(el)) out.push(el)
    }
    return out
  }

  /**
   * Proxy ctx：get → 登记 readKeys、转 this.get；set → this.set。
   * 还挂上 `workspaceCtx` 透传父级 + workspace.context（合并视图）。
   */
  _makeCtxProxy (readKeys) {
    const self = this
    return new Proxy(Object.create(null), {
      get (_t, prop) {
        if (typeof prop !== 'string') return undefined
        readKeys.add(prop)
        return self.get(prop)
      },
      set (_t, prop, value) {
        if (typeof prop !== 'string') return false
        self.set(prop, value)
        return true
      },
      has (_t, prop) {
        if (typeof prop !== 'string') return false
        readKeys.add(prop)
        return self.get(prop) !== undefined
      },
    })
  }

  _updateSubs (id, prevDeps, nextDeps) {
    for (const k of prevDeps) {
      if (nextDeps.has(k)) continue
      const set = this._subs.get(k)
      if (set) {
        set.delete(id)
        if (!set.size) this._subs.delete(k)
      }
    }
    for (const k of nextDeps) {
      if (prevDeps.has(k)) continue
      let set = this._subs.get(k)
      if (!set) { set = new Set(); this._subs.set(k, set) }
      set.add(id)
    }
    /* 替换 */
    prevDeps.clear()
    for (const k of nextDeps) prevDeps.add(k)
  }

  /**
   * 把 view 的 enabled/visible/props 同步到单个 el。
   * @param {ActionView} view
   * @param {HTMLElement} el
   */
  _applyToOneEl (view, el) {
    if (!(el instanceof HTMLElement)) return
    /* disabled：HTMLButton / ui5-button / ui5-menu-item 都支持 disabled attribute */
    if (view.enabled === false) el.setAttribute('disabled', '')
    else el.removeAttribute('disabled')
    /* visible 用 hidden 属性，最少入侵 layout */
    if (view.visible === false) el.setAttribute('hidden', '')
    else el.removeAttribute('hidden')
    /* props 透传：每个键作为 attribute */
    if (view.props && typeof view.props === 'object') {
      for (const [k, v] of Object.entries(view.props)) {
        if (v === false || v == null) el.removeAttribute(k)
        else if (v === true) el.setAttribute(k, '')
        else el.setAttribute(k, String(v))
      }
    }
  }

  /**
   * 在 capture 阶段拦截 click：当 view.enabled === false 时阻止 user click handler 触发。
   * UI5 web components 的 disabled 只是视觉/ARIA hint，不会阻止 click 派发——必须在事件层拦。
   * 同一个 el 只装一次（用 `__cmxActionGuard` 标记去重）。
   * @param {{ view: ActionView }} actionEntry
   * @param {HTMLElement} el
   */
  _installClickGuard (actionEntry, el) {
    if (!(el instanceof HTMLElement)) return
    const elCheck = /** @type {any} */ (el)
    if (elCheck.__cmxActionGuard) return
    const guard = (e) => {
      if (actionEntry.view.enabled === false) {
        e.stopImmediatePropagation()
        e.preventDefault()
      }
    }
    /* capture: true → 在 user click handler（bubbling 阶段）之前先跑；
       stopImmediatePropagation 阻断同 phase 的其它 listener。 */
    el.addEventListener('click', guard, { capture: true })
    const elAny = /** @type {any} */ (el)
    elAny.__cmxActionGuard = guard
  }

  dispose () {
    this._extUnsub?.()
    this._extUnsub = null
    this._anyKeyHandlers.clear()
    this._actions.clear()
    this._subs.clear()
    this._ctxData.clear()
    this._dirty.clear()
    _allRegistries.delete(this)
  }
}

/**
 * 便利工厂：创建 workspace 级 registry（订阅 workspace.context）。
 * @param {{ get: any, set: any, on: any, off: any }} workspaceContext
 * @param {Record<string, unknown>} extraHelpers
 */
export function createWorkspaceActionRegistry (workspaceContext, extraHelpers = {}) {
  return new ActionRegistry({
    helpers: { workspaceCtx: workspaceContext, ...extraHelpers },
  })
}

/**
 * 便利工厂：创建 host 级 registry，订阅父 (workspace) 级 + workspace.context 二者。
 * @param {ActionRegistry|null} parent
 * @param {{ get: any, set: any, on: any, off: any }|undefined} workspaceContext
 * @param {Record<string, unknown>} extraHelpers
 */
export function createHostActionRegistry (parent, workspaceContext, extraHelpers = {}) {
  return new ActionRegistry({
    parent,
    helpers: { workspaceCtx: workspaceContext, ...extraHelpers },
  })
}
