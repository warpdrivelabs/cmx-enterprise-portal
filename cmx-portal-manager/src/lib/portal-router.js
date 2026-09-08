/**
 * Portal 确定性路由器：URL ↔ 当前激活 tab 双向同步。
 *
 * URL 设计（基于 cmx_menu.code 的确定性路由，前缀随构建期 base 自动适配）：
 *   <APP_BASE>                  → 首页（欢迎页或空状态，dev=/，prod=/portal/）
 *   <APP_BASE>view/<code>       → 业务视图（code = cmx_menu.code，业务唯一稳定标识）
 *   <APP_BASE>view/<code>?<q>   → 带上下文参数的视图（深链传参）
 *   <APP_BASE>view/portal-welcome       → 欢迎页（与首页等价）
 *   <APP_BASE>view/portal-dam-registry  → DAM 注册表（shellbar 内置入口）
 *   <APP_BASE>view/portal-help-center   → 帮助中心
 *   <APP_BASE>view/portal-menu-manager  → 菜单管理
 *   <APP_BASE>view/portal-cluster-datasource → 集群数据源
 *   <APP_BASE>view/portal-notify-<id>   → 通知中心
 *
 * 路由模式（构建期由 VITE_ROUTER_MODE 决定）：
 *   - history（默认）：URL = <APP_BASE>view/<code>，需后端 SPA fallback
 *   - hash           ：URL = <APP_BASE>#/view/<code>，纯静态托管即可
 *
 * APP_BASE 由 vite `base` 选项决定（dev=`/`，prod 同源托管=`/portal/`）。
 * nginx 反向代理或后端 ServeDir 都可改变 base，路由器自动适配，无需修改代码。
 *
 * 工作机制：
 *   1. 启动时通过 menu-cache 单例 fire-and-forget 拉取 /api/menu/tree 全量菜单（与 side-nav 共享同一份缓存）
 *   2. handleInitialLocation：若 URL 是 view/<code>，从缓存查菜单并打开；否则返回 false 让应用走默认欢迎页
 *   3. 监听 URL 变化（popstate / hashchange）：浏览器前进/后退 → 从缓存查菜单 → openNode
 *   4. portal-content-tab-activate 事件 → pushMenu(tabId)
 *   5. nav-selection 事件 → pushMenu(menu.id)
 *
 * 自稳定：push 前会检查 URL 是否已等于目标值（避免 router 驱动打开时反复 push）。
 * history 模式：pushState/replaceState 不触发 popstate；hash 模式：location.hash 赋值会触发 hashchange，
 * 但 _routerDriving 标志会抑制反向同步，故无反馈环。
 *
 * @see cmx-container/docs/sql/init/init_ddl.sql 中 cmx_menu.code 字段（UNIQUE INDEX）
 * @see CMXPortalManager/vite.config.js 中 base 选项（构建期决定 APP_BASE）
 */

import { PORTAL_WELCOME_MENU_NODE } from './welcome-menu-node.js'
import { createPortalDamRegistryMenuNode } from './dam-registry-menu-node.js'
import { createPortalClusterDatasourceMenuNode } from './cluster-datasource-menu-node.js'
import { createPortalHelpCenterMenuNode } from './help-center-menu-node.js'
import { createPortalMenuManagerMenuNode } from './portal-menu-manager-menu-node.js'
import { createNotifyCenterMenuNode } from './notify-center-menu-node.js'
import { getMenuCache } from './menu-cache.js'

/**
 * 应用 base 路径（构建期由 vite `base` 选项决定，dev=`/`，prod 同源托管=`/portal/`）。
 * **必须 base-aware**：否则硬编码 `/view/...` 在 `/portal/` 托管下会落到未托管的 `/view/` → 404。
 * 末尾保留斜杠（vite 约定）。
 */
const APP_BASE = (import.meta.env && import.meta.env.BASE_URL) || '/'
/**
 * 路由模式：'history'（默认）或 'hash'。由 .env 的 VITE_ROUTER_MODE 决定。
 * - history: <APP_BASE>view/<code>（需后端 SPA fallback）
 * - hash:    <APP_BASE>#/view/<code>（纯静态托管即可，base 退化为 './' 也能工作）
 */
const ROUTER_MODE = (import.meta.env && import.meta.env.VITE_ROUTER_MODE) === 'hash' ? 'hash' : 'history'
/**
 * view 前缀的 path 部分（不含 base，不含 query/hash）：
 *   history 模式：`/view/`（前缀 = APP_BASE + 'view/'）
 *   hash 模式：`/view/`（前缀 = '/view/'，因为 hash 内部从根算起）
 */
const VIEW_PATH_PREFIX = 'view/'
/** 欢迎页 code（与 PORTAL_WELCOME_MENU_NODE.id 一致） */
const WELCOME_CODE = 'portal-welcome'
/** 通知中心 code 前缀 */
const NOTIFY_PREFIX = 'portal-notify-'

// ============================================================================
// 路由策略层：抽象 URL 读写与变化监听，history/hash 两套实现
// ============================================================================

/**
 * history 模式策略：使用 History API（pushState/popstate）。
 * 适用于后端配了 SPA fallback 的场景（如 cmx-container main.rs 的 spa=true）。
 */
const historyStrategy = {
  mode: 'history',
  /**
   * 读取当前 URL 的 path 部分（用于 parseMenuUrl）。
   * history 模式下即 pathname，base 前缀已包含在内（如 /portal/view/gl）。
   * @returns {{ path: string, search: string }}
   */
  getLocation () {
    return {
      path: window.location.pathname,
      search: window.location.search,
    }
  },
  /**
   * 取当前完整 URL（pathname + search），用于与目标 URL 比较。
   * @returns {string}
   */
  getCurrentUrl () {
    return window.location.pathname + window.location.search
  },
  /**
   * 构造菜单 URL（含 base）。
   * @param {string} path `/view/<code>` 形式（不含 base，不含 query）
   * @param {string} [search] query string，如 `?docId=123`（含 ?）
   * @returns {string} 完整 URL，如 `/portal/view/gl?docId=123`
   */
  buildUrl (path, search) {
    return `${APP_BASE}${path.replace(/^\//, '')}${search || ''}`
  },
  /**
   * 构造首页 URL。
   * @returns {string}
   */
  buildHomeUrl () {
    return APP_BASE
  },
  /**
   * 从 location 提取 path 与 base 的相对部分（去掉 APP_BASE 前缀，保留前导 /）。
   * @param {string} path
   * @returns {string}
   */
  stripBase (path) {
    if (APP_BASE === '/') return path
    // APP_BASE 形如 /portal/；切掉后保留前导 /（/portal/view/gl → /view/gl）
    const base = APP_BASE.replace(/\/$/, '')  // /portal
    if (path === base) return '/'
    if (path.startsWith(base + '/')) {
      return path.slice(base.length)  // /view/gl
    }
    return path
  },
  /**
   * 是否首页路径。
   * @param {string} path
   * @returns {boolean}
   */
  isHome (path) {
    if (!path) return false
    const normalized = APP_BASE.replace(/\/$/, '') || '/'
    return path === normalized || path === APP_BASE
  },
  pushState (url, state) {
    history.pushState(state || {}, '', url)
  },
  replaceState (url, state) {
    history.replaceState(state || {}, '', url)
  },
  /**
   * 注册 URL 变化监听。返回取消监听函数。
   * @param {() => void} cb
   * @returns {() => void}
   */
  onChange (cb) {
    window.addEventListener('popstate', cb)
    return () => window.removeEventListener('popstate', cb)
  },
}

/**
 * hash 模式策略：使用 location.hash（hashchange）。
 * 适用于纯静态托管（无需后端 SPA fallback）；base 退化为 './' 时也能工作
 * （浏览器以"原访问路径"作为基，# 后是 fragment，资源加载不受影响）。
 */
const hashStrategy = {
  mode: 'hash',
  /**
   * 读取当前 URL 的 path 部分。
   * hash 模式下从 location.hash 解析：`#/view/gl` → `/view/gl`，`` 或 `#/` → `/`
   * @returns {{ path: string, search: string }}
   */
  getLocation () {
    const hash = window.location.hash || ''
    // 去掉前导 #，得到 path?search
    let inner = hash.startsWith('#') ? hash.slice(1) : hash
    if (!inner || inner === '/') return { path: '/', search: '' }
    if (!inner.startsWith('/')) inner = '/' + inner
    // 分离 query（hash 模式下 query 也在 # 后）
    const qIdx = inner.indexOf('?')
    if (qIdx >= 0) {
      return { path: inner.slice(0, qIdx), search: inner.slice(qIdx) }
    }
    return { path: inner, search: '' }
  },
  /**
   * 取当前完整 URL（pathname + search）。
   * hash 模式下：从 hash 解析 path+search，用于与目标 URL 比较。
   * @returns {string}
   */
  getCurrentUrl () {
    const { path, search } = hashStrategy.getLocation()
    return path + search
  },
  /**
   * 构造菜单 URL（含 base 与 #）。
   * @param {string} path `/view/<code>` 形式
   * @param {string} [search] query string（含 ?）
   * @returns {string} 完整 URL，如 `/portal/#/view/gl?docId=123`
   */
  buildUrl (path, search) {
    const cleanPath = path.startsWith('/') ? path : '/' + path
    return `${APP_BASE}#${cleanPath}${search || ''}`
  },
  /**
   * 构造首页 URL。
   * @returns {string}
   */
  buildHomeUrl () {
    return `${APP_BASE}#/`
  },
  /**
   * 从 location 提取 path 与 base 的相对部分。
   * hash 模式下 path 已不含 base（base 在 # 之前）。
   * @param {string} path
   * @returns {string}
   */
  stripBase (path) {
    return path || '/'
  },
  /**
   * 是否首页路径。
   * @param {string} path
   * @returns {boolean}
   */
  isHome (path) {
    return !path || path === '/'
  },
  pushState (url, _state) {
    // location.hash 赋值会自动触发 hashchange（_routerDriving 抑制反向同步）
    window.location.hash = url.split('#')[1] || '/'
  },
  replaceState (url, state) {
    // replaceState 不触发 hashchange，需手动用 history.replaceState 改完整 URL
    history.replaceState(state || {}, '', url)
  },
  /**
   * 注册 URL 变化监听。返回取消监听函数。
   * @param {() => void} cb
   * @returns {() => void}
   */
  onChange (cb) {
    window.addEventListener('hashchange', cb)
    return () => window.removeEventListener('hashchange', cb)
  },
}

/** 当前路由策略（构建期决定，运行时不变） */
const strategy = ROUTER_MODE === 'hash' ? hashStrategy : historyStrategy

// ============================================================================
// URL 解析与构造（基于 strategy，业务无关）
// ============================================================================

/**
 * 内置菜单节点查找：不依赖后端菜单树，shellbar 入口可直接打开。
 * @param {string} code
 * @returns {Record<string, unknown>|null}
 */
function getBuiltinMenuNode (code) {
  switch (code) {
    case 'portal-welcome':
      return PORTAL_WELCOME_MENU_NODE
    case 'portal-dam-registry':
      return createPortalDamRegistryMenuNode()
    case 'portal-cluster-datasource':
      return createPortalClusterDatasourceMenuNode()
    case 'portal-help-center':
      return createPortalHelpCenterMenuNode()
    case 'portal-menu-manager':
      return createPortalMenuManagerMenuNode()
    default:
      if (code.startsWith(NOTIFY_PREFIX)) {
        const centerId = code.slice(NOTIFY_PREFIX.length)
        try { return createNotifyCenterMenuNode(centerId) } catch { return null }
      }
      return null
  }
}

/**
 * 解析 path 为 { code, params } 或 null（当 path 不是菜单路径）。
 * 内部 path 形如 `/view/<code>`（不含 base、不含 hash）。
 * @param {string} path 已剥离 base 的 path（如 /view/gl）
 * @param {string} [search] query string（如 ?docId=123）
 * @returns {{ code: string, params: Record<string, string> } | null}
 */
function parseMenuPath (path, search) {
  // path 应形如 /view/<code>；前缀检查带前导斜杠
  const prefix = `/${VIEW_PATH_PREFIX}`
  if (!path || !path.startsWith(prefix)) return null
  const code = decodeURIComponent(path.slice(prefix.length))
  if (!code) return null
  const params = /** @type {Record<string, string>} */ ({})
  if (search) {
    try {
      const sp = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
      for (const [k, v] of sp.entries()) params[k] = v
    } catch { /* ignore */ }
  }
  return { code, params }
}

/**
 * 构造内部 path（不含 base、不含 hash）。
 * @param {string} code
 * @param {Record<string, string>} [params]
 * @returns {{ path: string, search: string }}
 */
function buildMenuPath (code, params) {
  const safe = encodeURIComponent(code)
  const path = `/${VIEW_PATH_PREFIX}${safe}`
  if (!params || Object.keys(params).length === 0) return { path, search: '' }
  const sp = new URLSearchParams(params)
  return { path, search: `?${sp.toString()}` }
}

/** @param {string} s @returns {string} */
function escapeHtml (s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c] || c)
}

/**
 * 是否为「动态节点」——运行时构造、不在菜单树、findByCode 查不到，故须把快照存进 history.state
 * 才能前进/回退重建（报表应用器 rpt-applier-* 等）。判据：workspace.model.type 为 native_pages/
 * html_pages 这类由宿主动态挂载的视图类型（普通菜单节点走 findByCode，不需存快照）。
 * @param {Record<string, unknown>|null|undefined} node
 * @returns {boolean}
 */
function isDynamicNode (node) {
  if (!node || typeof node !== 'object') return false
  const ws = /** @type {any} */ (node).workspace
  const modelType = ws && ws.model && typeof ws.model === 'object' ? ws.model.type : undefined
  if (modelType === 'native_pages' || modelType === 'html_pages') return true
  // 兼容：workspace.content.views[].type 为 native_pages/html_pages 的动态节点（如 MDM 并列页）
  const views = ws && ws.content && Array.isArray(ws.content.views) ? ws.content.views : []
  return views.some((v) => v && (v.type === 'native_pages' || v.type === 'html_pages'))
}

// ── 动态节点 sessionStorage 注册表（F5 刷新重建不在菜单的并列页）─────────────
// 动态页（如 portal.mdm.cr-form-single）不在菜单树，findByCode 查不到 → F5 报"页面不存在"。
// 打开时把节点快照（含 initialContext）写入 sessionStorage，F5 时按 code 读回重建。
const DYN_PREFIX = 'cmx-dyn-node:'
/** @param {Record<string, unknown>} node @param {Record<string, unknown>} [ctx] */
export function persistDynNode (node, ctx) {
  try {
    if (!node || !node.id) return
    sessionStorage.setItem(DYN_PREFIX + node.id, JSON.stringify({ node, ctx: ctx || null }))
  } catch (err) { /* 隐私模式等忽略 */ }
}
/** @param {string} code @returns {{node: Record<string,unknown>, ctx: Record<string,unknown>|null}|null} */
function loadDynNode (code) {
  try {
    const s = sessionStorage.getItem(DYN_PREFIX + code)
    return s ? /** @type {any} */ (JSON.parse(s)) : null
  } catch { return null }
}

// ============================================================================
// PortalRouter 主类
// ============================================================================

/**
 * Portal 路由器。单例（通过 getPortalRouter 获取）。
 */
export class PortalRouter {
  constructor () {
    /** @type {HTMLElement|null} cmx-portal-app 实例 */
    this._host = null
    /** @type {boolean} handleInitialLocation 是否已调用过 */
    this._initialized = false
    /** @type {boolean} 是否正在由 router 驱动打开（抑制 tab-activate 的 push 反馈） */
    this._routerDriving = false
    /** @type {(() => void)|null} onChange 取消监听函数 */
    this._offChange = null
  }

  /**
   * 绑定到 cmx-portal-app 实例。
   * @param {HTMLElement} host
   */
  attach (host) {
    this._host = host
    if (!this._offChange) {
      const cb = (/** @type {PopStateEvent|Event} */ ev) => {
        // popstate 携带 history.state；hashchange 不带 → 回退读 history.state。
        // 动态节点（报表等）快照在 state.node，供直接重建（findByCode 查不到）。
        const st = /** @type {any} */ (ev)?.state ?? (typeof history !== 'undefined' ? history.state : null)
        const stateNode = st?.node ?? null
        void this._handleLocationChange(stateNode).catch((err) => {
          console.warn('[portal-router] location change handle failed:', err)
        })
      }
      this._offChange = strategy.onChange(cb)
    }
    // 后台预拉菜单索引（与 side-nav 加载并行，不阻塞首屏）。
    // 实际请求由 menu-cache 单例管理：side-nav 也会触发同一加载，自动去重。
    getMenuCache().loadAll().catch((err) => {
      console.warn('[portal-router] menu cache preload failed:', err)
    })
  }

  /** @param {HTMLElement} host */
  detach (host) {
    if (this._host !== host) return
    if (this._offChange) {
      this._offChange()
      this._offChange = null
    }
    this._host = null
  }

  /**
   * 应用启动时按 URL 决定首屏。
   * @returns {Promise<boolean>} true 表示 router 已处理首屏（URL 是 view/<code>）；false 表示是首页让应用走默认逻辑（欢迎页）
   */
  async handleInitialLocation () {
    if (this._initialized) return false
    this._initialized = true
    const { path, search } = strategy.getLocation()
    const relPath = strategy.stripBase(path)
    const parsed = parseMenuPath(relPath, search)
    if (!parsed) {
      // URL 是首页或非菜单路径：让应用走默认欢迎页逻辑
      return false
    }
    // URL 是 view/<code>：fire-and-forget 打开对应菜单，让 connectedCallback 立即返回
    // 等待菜单缓存就绪后再 openNode（避免找不到菜单）
    this._routerDriving = true
    Promise.resolve()
      .then(() => getMenuCache().loadAll())
      .then(() => this._openFromUrl(parsed.code, parsed.params, { replace: true }))
      .catch((err) => console.warn('[portal-router] initial open failed:', err))
      .finally(() => { this._routerDriving = false })
    return true
  }

  /**
   * 菜单点击 / shellbar 入口打开节点后调用：同步 URL。
   * @param {string} code 菜单 code（或 tabId）
   * @param {Record<string, string>} [params]
   * @param {Record<string, unknown>|null} [node] 动态节点快照（报表等不在菜单树的 tab）；存进
   *   history.state 供前进/回退重建。普通菜单 tab 不传，保持 state 轻量。
   */
  pushMenu (code, params, node) {
    if (this._routerDriving) return
    if (!code) return
    // 欢迎页：URL 用首页（更短、更语义）
    if (code === WELCOME_CODE) {
      this._pushState(strategy.buildHomeUrl(), { code: WELCOME_CODE, params: {} })
      return
    }
    const { path, search } = buildMenuPath(code, params)
    const url = strategy.buildUrl(path, search)
    /** @type {{ code: string, params: Record<string, string>, node?: Record<string, unknown> }} */
    const state = { code, params: params || {} }
    // 仅动态节点（workspace.model.type 非普通菜单，如 native_pages）存快照——避免菜单 tab 无谓膨胀 state。
    if (node && isDynamicNode(node)) state.node = node
    this._pushState(url, state)
  }

  /**
   * tab 切换时同步 URL（由 portal-content-tab-activate 事件触发）。
   * tabId 即菜单 code（WorkspaceNode.fromMenuNode 用 node.id 作为 tabId）。
   * @param {string} tabId
   * @param {Record<string, unknown>|null} [node] 动态节点快照（透传给 pushMenu 存 state）
   */
  pushTab (tabId, node) {
    if (!tabId) return
    // 跳过自动生成的 fallback tabId（addTab 中 id || `tab-${++_tabCounter}`）
    if (/^tab-\d+$/.test(tabId)) return
    // 跳过 not-found 占位页 id：它不该写进 URL 制造历史污染（否则回退再查不到 → 叠 __not_found_ 前缀）
    if (tabId.startsWith('__not_found_')) return
    this.pushMenu(tabId, undefined, node)
  }

  /**
   * @param {string} url 目标 URL（相对于 origin，如 /portal/view/gl 或 /portal/#/view/gl）
   * @param {object} state
   */
  _pushState (url, state) {
    // URL 已等于目标 → 跳过（router 驱动打开后 tab-activate 反馈时也会走这里，避免重复 push）
    // 用 href 去除 origin 比较，兼容 history/hash 两种模式
    const currentRelative = window.location.href.substring(window.location.origin.length)
    if (url === currentRelative) return
    try {
      strategy.pushState(url, state)
    } catch (err) {
      console.warn('[portal-router] pushState failed:', err)
    }
  }

  /**
   * @param {string} url
   * @param {object} state
   */
  _replaceState (url, state) {
    try {
      strategy.replaceState(url, state)
    } catch (err) {
      console.warn('[portal-router] replaceState failed:', err)
    }
  }

  /**
   * URL 变化处理：浏览器前进/后退（popstate/hashchange） → 找菜单 → openNode。
   * @param {Record<string, unknown>|null} [stateNode] history.state.node：动态节点快照
   *   （报表等不在菜单树的 tab）。存在则直接重建，跳过 parseMenuPath/findByCode。
   */
  async _handleLocationChange (stateNode) {
    const { path, search } = strategy.getLocation()
    const relPath = strategy.stripBase(path)
    const parsed = parseMenuPath(relPath, search)
    this._routerDriving = true
    try {
      // 动态节点：state 里有完整快照 → 直接重建（菜单缓存查不到 rpt-applier-* 这类运行时节点）。
      if (stateNode && isDynamicNode(stateNode)) {
        const host = this._host
        if (host) {
          // 若该 tab 已在（仅切换即可，避免重复挂载）
          const content = host.shadowRoot?.getElementById('content-area')
          const tabId = /** @type {any} */ (stateNode).id
          const tabs = content && Array.isArray(/** @type {any} */ (content)._tabs)
            ? /** @type {{ id: string }[]} */ (/** @type {any} */ (content)._tabs) : []
          if (tabId && tabs.some((t) => t.id === tabId)) {
            /** @type {any} */ (content)._selectTab(tabId)
          } else {
            await host.openNode(stateNode)
          }
        }
        return
      }
      if (!parsed) {
        // 非 view/<code> 路径：若是应用首页打开欢迎页；否则不处理
        if (strategy.isHome(relPath)) {
          await this._openNodeByCode(WELCOME_CODE, {}, { selectOnly: true })
        }
        return
      }
      await getMenuCache().loadAll()
      await this._openFromUrl(parsed.code, parsed.params, { replace: false })
    } finally {
      this._routerDriving = false
    }
  }

  /**
   * @param {string} code
   * @param {Record<string, string>} params
   * @param {{ replace?: boolean, selectOnly?: boolean }} [opts]
   */
  async _openFromUrl (code, params, opts = {}) {
    await this._openNodeByCode(code, params, opts)
    // replace 模式：替换当前 history 条目（初始加载时避免多一层历史）
    if (opts.replace) {
      const { path, search } = buildMenuPath(code, params)
      const url = code === WELCOME_CODE ? strategy.buildHomeUrl() : strategy.buildUrl(path, search)
      this._replaceState(url, { code, params: params || {} })
    }
  }

  /**
   * 按 code 查找菜单节点并打开。先查内置（welcome/dam/help...），再查菜单索引。
   * @param {string} code
   * @param {Record<string, string>} params
   * @param {{ selectOnly?: boolean }} [opts]
   */
  async _openNodeByCode (code, params, opts = {}) {
    const host = this._host
    if (!host) return
    // 先看内置
    /** @type {Record<string, unknown>|null} */
    let menuNode = getBuiltinMenuNode(code)
    if (!menuNode) {
      // 再查共享菜单缓存（首次访问触发 /api/menu/tree 加载，后续命中内存）
      menuNode = await getMenuCache().findByCode(code)
    }
    if (!menuNode) {
      // 查不到菜单节点：区分两种情况
      //   - 动态页深链刷新（详情页/新建页/报表页等不在菜单树的页面，openNode 时已写
      //     sessionStorage 快照）：F5 后无法重建 → 跳首页（产品需求：动态页刷新不留页）
      //   - 输错 URL / 无权限菜单被删：显示"页面不存在"占位页
      //   判据：loadDynNode(code) 命中说明曾被 openNode 打开过（动态页）。
      if (loadDynNode(code)) {
        console.info(`[portal-router] dynamic page deep-link refresh, goto home: ${code}`)
        this.gotoHome()
      } else {
        console.warn(`[portal-router] menu not found for code: ${code}`)
        this._showNotFound(code)
      }
      return
    }
    const extras = (params && Object.keys(params).length > 0)
      ? { initialContext: params }
      : undefined
    // 深链修复：打开前先按菜单的 domain/application 切换当前域+左栏菜单，
    // 否则跨域深链（如 fi 域下打开 basic 的 MDM 页）侧栏不切换、菜单不选中。
    // 字段兼容：menu-cache 标准化为 camelCase（domainCode），旧代码/动态 node 可能用 snake_case。
    const mn = /** @type {any} */ (menuNode)
    const dCode = mn.domainCode || mn.domain_code
    const aCode = mn.applicationCode || mn.application_code
    if (dCode && typeof host.switchActivityForMenu === 'function') {
      try {
        await host.switchActivityForMenu(dCode, aCode)
        // 域切换会重建侧栏菜单（异步加载），稍候再打开以命中选中同步
        await new Promise((r) => setTimeout(r, 0))
      } catch (err) {
        console.warn('[portal-router] switch activity for deep-link failed:', err)
      }
    }
    // 若该 tab 已存在：仅切换（popstate 回到已打开的菜单时走这条路径）
    const content = host.shadowRoot?.getElementById('content-area')
    const tabs = content && Array.isArray(/** @type {any} */ (content)._tabs)
      ? /** @type {{ id: string }[]} */ (/** @type {any} */ (content)._tabs)
      : []
    if (opts.selectOnly && tabs.some((t) => t.id === code)) {
      // @ts-ignore - _selectTab 是 portal-content-area 实例方法
      content._selectTab(code)
      return
    }
    // openNode 是 fire-and-forget（prepare 对话框等异步流程不应阻塞 router）
    // 但仍 await 以确保 routerDriving 标志在 open_view 完成后才清除
    try {
      await host.openNode(menuNode, extras)
    } catch (err) {
      console.warn(`[portal-router] openNode failed for ${code}:`, err)
    }
  }

  /**
   * 跳回首页（欢迎页）：replaceState 改 URL + 打开欢迎页。
   *
   * 用于：
   *   - 动态页深链刷新（findByCode 查不到、loadDynNode 命中）
   *   - 关闭最后一个 content tab（tabId 变空，URL 应回首页而非停留旧 view/<code>）
   *
   * 不走 pushMenu：首屏场景 _routerDriving=true 会抑制 pushMenu；replaceState 不触发 popstate，
   * 避免 pushMenu→tab-activate→pushMenu 循环。
   */
  gotoHome () {
    const host = this._host
    if (!host) return
    try {
      const homeUrl = strategy.buildHomeUrl()
      strategy.replaceState?.(homeUrl, { code: WELCOME_CODE, params: {} })
    } catch (err) {
      console.warn('[portal-router] goto home replaceState failed:', err)
    }
    host.openNode(PORTAL_WELCOME_MENU_NODE).catch((err) => {
      console.warn('[portal-router] goto home openNode failed:', err)
    })
  }

  /**
   * 显示"页面不存在"占位页。
   * @param {string} code
   */
  _showNotFound (code) {
    const host = this._host
    if (!host) return
    // 剥掉已有 __not_found_ 前缀，杜绝回退再查不到时叠成 __not_found___not_found_...
    const baseCode = String(code).replace(/^(__not_found_)+/, '')
    const { path } = strategy.getLocation()
    const displayPath = strategy.stripBase(path)
    const notFoundNode = {
      id: `__not_found_${baseCode}`,
      name: 'not-found',
      caption: `页面不存在`,
      icon: 'document',
      permissionId: null,
      workspace: {
        content: {
          caption: '页面不存在',
          icon: 'document',
          views: [{
            tabLabel: '未找到',
            icon: 'document',
            type: 'html',
            data: {
              html: `<div style="padding:32px;font-family:var(--sapFontFamily, Arial, sans-serif);color:var(--sapTextColor,#1d2d3e);max-width:560px">
                <h2 style="margin:0 0 12px;font-size:18px;font-weight:600">页面不存在</h2>
                <p style="margin:0 0 8px">路径 <code style="background:var(--sapShell_Background,#f5f6f7);padding:2px 6px;border-radius:4px;font-family:monospace">${escapeHtml(displayPath)}</code> 对应的菜单未找到或无权访问。</p>
                <p style="margin:16px 0 0"><a href="${strategy.buildHomeUrl()}" style="color:var(--sapLinkColor,#0a6ed1);text-decoration:none">← 返回首页</a></p>
              </div>`,
            },
          }],
        },
      },
    }
    host.openNode(notFoundNode).catch((err) => {
      console.warn('[portal-router] open not-found placeholder failed:', err)
    })
  }
}

/** @type {PortalRouter|null} */
let _router = null

/**
 * 获取路由器单例。
 * @returns {PortalRouter}
 */
export function getPortalRouter () {
  if (!_router) _router = new PortalRouter()
  return _router
}
