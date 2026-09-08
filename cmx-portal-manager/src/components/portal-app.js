import './portal-workspace-float-window.js'
import {
  ensureDomainTreeLoaded,
  treeToDomains,
  treeToActivities,
  findActivityIdByMenuPage,
  getCachedActivityEntry,
} from '../api/domains-tree-api.js'
import { getWorkspaceNode } from '../api/workspace-nodes-api.js'
import { showCmxError } from 'cmx-data-comp/lib/cmx-toast.js'
import { handleWorkspaceRegionTabBarClick, applyWorkspaceShell, normalizeWorkspaceRegionViews } from '../lib/workspace-node.js'
import { createShellTemplate } from './portal-app-shell.js'
import * as Layout from './portal-app-layout.js'
import * as Workspace from './portal-app-workspace.js'
import { startGlobalMultiViewReorderAutoWire } from '../lib/tab-strip-reorder.js'
import { getShowWelcomeOnStartup } from './portal-content-area-shell.js'
import { PORTAL_WELCOME_MENU_NODE } from '../lib/welcome-menu-node.js'
import { createPortalDamRegistryMenuNode } from '../lib/dam-registry-menu-node.js'
import { createPortalClusterDatasourceMenuNode } from '../lib/cluster-datasource-menu-node.js'
import { createPortalHelpCenterMenuNode } from '../lib/help-center-menu-node.js'
import { createPortalMenuManagerMenuNode } from '../lib/portal-menu-manager-menu-node.js'
import { createPortalSettingsMenuNode } from '../lib/portal-settings-menu-node.js'
// 菜单管理两段式：explorer 区菜单树 + content 区节点编辑（注册 menu_tree / menu_editor 视图类型）
import './portal-menu-tree.js'
import './portal-menu-editor.js'
import { fetchNotifyCenters, fetchNotifyCounts, subscribeNotifyStream } from '../api/notifications-api.js'
import { createNotifyCenterMenuNode } from '../lib/notify-center-menu-node.js'
import { getPortalRouter, persistDynNode } from '../lib/portal-router.js'
import { saveActiveDam } from '../lib/dam-context.js'
import { syncMenuSelection } from './portal-side-nav-menu.js'

export class PortalApp extends HTMLElement {
  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
    this._sideNavWidth = 240
    this._propertyWidth = 300
    this._logHeight = 200
    this._sideNavVisible = true
    this._propertyVisible = false
    this._logVisible = false
    this._activeActivity = 'explorer'
    /** @type {((e: BeforeUnloadEvent) => void) | null} */
    this._onBeforeUnload = null
    /** @type {null | { node: import('../lib/workspace-node.js').WorkspaceNode, label: string, contentArea: Element, sideNav: Element|null, propertyPanel: Element|null, logPanel: Element|null }} */
    this._pendingWorkspaceOpen = null
    /** @type {((e: KeyboardEvent) => void)|null} */
    this._onGlobalKeydown = null
    /** @type {((e: Event) => void)|null} */
    this._onCmxHelpRequest = null
    /** @type {Set<string>|null} */
    this._floatAutoOpenedTabs = new Set()
  }

  disconnectedCallback () {
    if (this._onBeforeUnload) {
      window.removeEventListener('beforeunload', this._onBeforeUnload)
      this._onBeforeUnload = null
    }
    if (this._onGlobalKeydown) {
      document.removeEventListener('keydown', this._onGlobalKeydown)
      this._onGlobalKeydown = null
    }
    if (this._onCmxHelpRequest) {
      window.removeEventListener('cmx-help-request', this._onCmxHelpRequest)
      this._onCmxHelpRequest = null
    }
    this._floatAutoOpenedTabs?.clear()
  }

  async connectedCallback () {
    // eslint-disable-next-line no-restricted-syntax -- shadow root 模板：静态字面量
    this.shadowRoot.innerHTML = createShellTemplate()
    /* 全局 auto-wire：监听新增的多视图 region tab strip，自动装"同条带 reorder"。 */
    startGlobalMultiViewReorderAutoWire()
    Layout.setupSplitters(this)
    this._setupEvents()
    await Workspace.syncInitialActivityFromDefinitions(this)
    Layout.applyLayout(this)
    queueMicrotask(() => Workspace.syncPropertyAndLogDockFromContentShell(this))
    /* 通知中心：注入计数到 shellbar 并订阅 SSE 实时刷新红色角标（不阻塞首屏）。 */
    this._initNotifications().catch((err) => console.warn('[portal-app] init notifications failed:', err))
    /* 确定性路由：URL 决定首屏。
       - URL 是 <APP_BASE>view/<code>：router 打开对应菜单，跳过欢迎页自动打开
       - URL 是 <APP_BASE>（首页）：保持原行为（按 localStorage 偏好自动打开欢迎页）
       router.attach 同时启动 popstate 监听与菜单索引预拉。 */
    const router = getPortalRouter()
    router.attach(this)
    const handled = await router.handleInitialLocation()
    if (!handled && getShowWelcomeOnStartup()) {
      Workspace.openWorkspaceNode(this, PORTAL_WELCOME_MENU_NODE)
        .catch((err) => console.warn('[portal-app] auto-open welcome failed:', err))
    }
  }

  _setupEvents () {
    const sr = this.shadowRoot

    sr.addEventListener('click', (e) => handleWorkspaceRegionTabBarClick(e))

    /* Activity bar toggle */
    sr.addEventListener('activity-change', (e) => {
      const { id, visible, sideNav, label } = e.detail
      Workspace.applyActivity(this, id, visible, { sideNav, label })
      // 用户在活动栏切换应用 → 持久化 activity id，F5 后恢复到该应用而非 list[0]
      const shellbar = sr.querySelector('portal-shellbar')
      const domainId = shellbar?._activeDomainId || ''
      if (domainId && id) saveActiveDam({ domain: domainId, application: id })
    })

    sr.addEventListener('portal-content-empty-welcome', () => {
      Workspace.openWorkspaceNode(this, PORTAL_WELCOME_MENU_NODE)
        .catch((err) => console.warn('[portal-app] empty-state open welcome failed:', err))
    })

    const shellbar = sr.querySelector('portal-shellbar')
    if (shellbar) {
      shellbar.addEventListener('shellbar-start-click', () => this._toggleSideNav())
      shellbar.addEventListener('shellbar-welcome-click', () => {
        /* shellbar home —— 与启动 auto-open / 菜单点击共享同一条 openWorkspaceNode 链路。
           对同 tabId 重复 open，addTab 内部会自动 reselect 现有 tab，不会重建 CE。 */
        Workspace.openWorkspaceNode(this, PORTAL_WELCOME_MENU_NODE)
          .catch((err) => console.warn('[portal-app] shellbar open welcome failed:', err))
      })
      shellbar.addEventListener('shellbar-dam-registry-click', () => {
        this._openDamRegistryCenter()
          .catch((err) => console.warn('[portal-app] shellbar open DAM registry failed:', err))
      })
      shellbar.addEventListener('shellbar-cluster-datasource-click', () => {
        this._openClusterDatasource()
          .catch((err) => console.warn('[portal-app] shellbar open cluster datasource failed:', err))
      })
      shellbar.addEventListener('shellbar-menu-manager-click', () => {
        this._openMenuManager()
          .catch((err) => console.warn('[portal-app] shellbar open menu manager failed:', err))
      })
      shellbar.addEventListener('shellbar-help-click', () => {
        this._openHelpCenter()
          .catch((err) => console.warn('[portal-app] shellbar open help center failed:', err))
      })
      shellbar.addEventListener('shellbar-notif-center-click', (e) => {
        const center = /** @type {CustomEvent<{ center?: string }>} */ (e).detail?.center
        this._openNotifyCenter(center)
          .catch((err) => console.warn('[portal-app] shellbar open notify center failed:', err))
      })
      shellbar.addEventListener('shellbar-profile-settings', async () => {
        // 「设置」改为 openWorkspaceNode（原 findActivityIdByMenuPage('setting-menu') 在 DAM 派生后已是死代码）
        await this._openSettingsCenter()
      })
      shellbar.addEventListener('shellbar-profile-account', () => Workspace.onProfileAccount(this))
      shellbar.addEventListener('shellbar-profile-logout', () => Workspace.onProfileLogout(this))
      shellbar.addEventListener('shellbar-assistant-click', () => {
        const fw = /** @type {any} */ (sr.getElementById('workspace-float-window'))
        if (!fw) return
        /* 浮动球态 → 展开到 AI tab；视图态 → 收回为球。
           ui5-toggle-button 自己 click 时会切 pressed，但真实开/关由 fw 决定；
           下面的 state-change 监听负责把 pressed 强制对齐到真实状态。 */
        if (typeof fw.isOpen === 'function' && fw.isOpen()) {
          fw.close?.()
        } else {
          fw.activateView?.('ai')
        }
      })
      shellbar.addEventListener('domain-change', async (e) => {
        const d = /** @type {CustomEvent<{ id: string, label: string, application?: string, activitie?: string }>} */ (e).detail
        if (!d.id) return
        // 从树 reduce 出当前域的活动列表（不再调 /api/activities）
        const tree = await ensureDomainTreeLoaded()
        const list = treeToActivities(tree, d.id)
        const activityBar = sr.querySelector('portal-activity-bar')
        if (activityBar && typeof activityBar._setActivities === 'function') {
          activityBar._setActivities(list)
        }
        if (list.length) {
          const row = list[0]
          Workspace.applyActivity(this, row.id, true, { sideNav: row.sideNav, label: row.label })
          // 程序自动选中 list[0]（切域后），补存 application，下次 F5 能恢复该应用
          saveActiveDam({ domain: d.id, application: row.id })
        } else {
          // 域下无应用：仅持久化 domain
          saveActiveDam({ domain: d.id, application: '' })
        }
      })
    }

    /* 浮动窗口 open/close 状态变化 → 同步 shellbar AI 按钮 pressed。
       覆盖：球点击 / 拖拽 drop 自动展开 / 关闭按钮 / shellbar 按钮自身 toggle。 */
    sr.addEventListener('portal-workspace-float-state-change', (e) => {
      const open = !!(/** @type {CustomEvent<{ open?: boolean }>} */ (e).detail?.open)
      const sb = sr.querySelector('portal-shellbar')
      const btn = sb?.shadowRoot?.getElementById?.('assistant-btn')
      if (btn) /** @type {any} */ (btn).pressed = open
    })

    /* Close property / bottom：写入当前 Content 标签的 dock 偏好，切回该标签时保持收起 */
    sr.addEventListener('panel-close', e => {
      const target = e.composedPath().find(el => el.tagName?.toLowerCase() === 'portal-property-panel')
      if (target) {
        this._propertyVisible = false
        Layout.applyLayout(this)
        Layout.persistActiveTabDockOpen(this, 'property', false)
      }
      const logTarget = e.composedPath().find(el => el.tagName?.toLowerCase() === 'portal-log-panel')
      if (logTarget) {
        this._logVisible = false
        Layout.applyLayout(this)
        Layout.persistActiveTabDockOpen(this, 'bottom', false)
      }
    })

    /* content region 内部 view（子 tab）切换时联动右侧 property 栏。
       - view spec 声明 hideProperty: true 时隐藏（如「概览」），其他 view 恢复显示。
       - view spec 声明 syncPropertyView: '<viewId>' 时切到 property region 对应 viewId 的 tab。
       由 handleWorkspaceRegionTabBarClick 在切换时派发 portal-content-view-change 事件。 */
    sr.addEventListener('portal-content-view-change', (e) => {
      const hideProperty = !!e.detail?.hideProperty
      if (this._propertyVisible === hideProperty) {
        this._propertyVisible = !hideProperty
        Layout.applyLayout(this)
      }
      /* 联动 property 内部 tab：按 viewId 找到对应 pane 的 tab-btn 并点击。
         property region 在 portal-property-panel 的 shadowRoot 内，必须通过 panel 实例方法切换。 */
      const syncPropertyView = String(e.detail?.syncPropertyView || '').trim()
      if (syncPropertyView) {
        requestAnimationFrame(() => {
          const propertyPanel = sr.getElementById('property-panel')
          propertyPanel?.activateWorkspaceRegionViewByViewId?.(syncPropertyView)
        })
      }
    })

    /* Status bar item clicks */
    sr.addEventListener('status-item-click', e => {
      if (e.detail.id === 'bell') {
        const logPanel = sr.getElementById('log-panel')
        this._logVisible = !this._logVisible
        Layout.applyLayout(this)
        Layout.persistActiveTabDockOpen(this, 'bottom', this._logVisible)
        if (this._logVisible && logPanel) {
          logPanel.addLog('通知面板已打开', 'info', 'System')
        }
      }
    })

    /* Content 标签切换 → 先清除三区域工作区签，再挂载当前标签缓存的工作区 DOM（各区域只创建一次）；dock 显隐按 shell + 该标签偏好 */
    sr.addEventListener('portal-content-tab-activate', (e) => {
      const d = /** @type {CustomEvent<{ tabId?: string, workspaceShell?: Record<string, unknown>|null|undefined, node?: Record<string, unknown>|null|undefined }>} */ (e).detail
      if (!d) return
      /* 确定性路由：tab 切换同步 URL（tabId 即菜单 code）。
         动态 tab（报表等，不在菜单树）额外透传 node 快照，供 router 存 history.state 以支持前进/回退重建。 */
      if (d.tabId) {
        getPortalRouter().pushTab(d.tabId, d.node)
      } else {
        // 所有 tab 已关闭（如手动关闭最后一个）→ URL 回首页，避免停留在已关闭的 view/<code>
        getPortalRouter().gotoHome()
      }
      /* 记录当前激活 tabId，供 portal-menu-rendered 事件触发时同步菜单选中态。
         深链/刷新场景下菜单异步加载，tab 先激活，需在菜单就位后再同步一次。 */
      if (d.tabId) this._activeTabId = d.tabId
      const sideNav = sr.querySelector('portal-side-nav')
      /* 同步菜单选中态：router/刷新/前进后退打开 tab 时 UI5 side-nav 不自动选中，
         需按 tabId 反查 data-menu-id 显式同步（点击菜单打开走 UI5 自身 selection-change，幂等不冲突）。 */
      if (sideNav && d.tabId) syncMenuSelection(/** @type {HTMLElement} */ (sideNav), d.tabId)
      const propertyPanel = sr.getElementById('property-panel')
      const logPanel = sr.getElementById('log-panel')
      const ctx = { sideNav, propertyPanel, logPanel }
      const content = sr.getElementById('content-area')
      const mounts = d.tabId && content && typeof content.takeWorkspaceMountsForTab === 'function'
        ? content.takeWorkspaceMountsForTab(d.tabId)
        : {}
      const sh = d.workspaceShell
      const shValid = sh != null && typeof sh === 'object' && Object.keys(sh).length > 0
      /* 仅清除在新 shell 中「消失」的区域，保留未变区域现有 DOM；避免 drop 或同标签重激活时整面板重挂触发可见闪烁。 */
      const prevSh = this._lastAppliedShell && typeof this._lastAppliedShell === 'object' ? this._lastAppliedShell : null
      /** @type {Record<string, null>} */
      const clearPatch = {}
      for (const region of ['explorer', 'property', 'bottom']) {
        const prevHas = prevSh ? Object.prototype.hasOwnProperty.call(prevSh, region) && prevSh[region] != null : false
        const nextHas = shValid ? Object.prototype.hasOwnProperty.call(sh, region) && /** @type {Record<string, unknown>} */ (sh)[region] != null : false
        if (prevHas && !nextHas) clearPatch[region] = null
      }
      if (Object.keys(clearPatch).length > 0) {
        applyWorkspaceShell(clearPatch, ctx)
      }
      if (shValid) {
        applyWorkspaceShell(sh, ctx, { activate: true, mounts })
      }
      this._lastAppliedShell = shValid ? sh : null
      const prefs = d.tabId && content && typeof content.getTabWorkspaceDockOpen === 'function'
        ? content.getTabWorkspaceDockOpen(d.tabId)
        : undefined
      const hasProp = Layout.shellHasWorkspaceRegionViews(sh, 'property')
      const hasBottom = Layout.shellHasWorkspaceRegionViews(sh, 'bottom')
      this._propertyVisible = Layout.dockOpenFromPref(hasProp, prefs?.property)
      this._logVisible = Layout.dockOpenFromPref(hasBottom, prefs?.bottom)
      Layout.applyLayout(this)
      /* 把当前激活 outer ws tab id 写到 host dataset，供各面板 DnD/右键菜单校验同 ws；
         layoutId 仅决定 DnD 是否能持久化，不应限制 dataset 写入 */
      const hasWs = sh != null && typeof sh === 'object' && Object.keys(sh).length > 0
      if (hasWs && d.tabId) {
        this.dataset.cmxActiveWsTab = String(d.tabId)
      } else {
        delete this.dataset.cmxActiveWsTab
      }
      Workspace.syncFloatWindow(this, d.tabId, sh, mounts?.floatview)
      /* 首次激活或切回 tab 时，检查 content region 第一个 view 是否声明 hideProperty（如「概览」）。
         通过 tab.contentSpec 拿原始 content views 配置（content region 在 portal-content-area
         shadowRoot 内，跨 shadow 查不到；workspaceShell 不含 content）。
         - hideProperty：强制隐藏 property 栏
         - syncPropertyView：联动 property 内部 tab（通过 portal-property-panel 实例方法） */
      const contentSpec = content && typeof content.getTabContentSpec === 'function' && d.tabId
        ? content.getTabContentSpec(d.tabId)
        : null
      const contentView0 = contentSpec
        ? /** @type {any[]} */ (normalizeWorkspaceRegionViews(/** @type {any} */ (contentSpec)))[0]
        : null
      if (contentView0?.hideProperty && this._propertyVisible) {
        this._propertyVisible = false
        Layout.applyLayout(this)
      }
      const syncView0 = contentView0?.syncPropertyView
      if (typeof syncView0 === 'string' && syncView0) {
        requestAnimationFrame(() => {
          propertyPanel?.activateWorkspaceRegionViewByViewId?.(syncView0)
        })
      }
    })

    /* Content 标签右键「视图」→ 激活对应区域子视图；若目标为属性/底部则同步展开对应 dock */
    sr.addEventListener('portal-workspace-view-focus', (e) => {
      const d = /** @type {CustomEvent<{ tabId?: string, region?: string, viewIndex?: number }>} */ (e).detail
      if (!d?.tabId || !d.region) return
      const content = sr.getElementById('content-area')
      if (content && typeof content.setTabWorkspaceDockOpen === 'function') {
        if (d.region === 'property') content.setTabWorkspaceDockOpen(d.tabId, { property: true })
        if (d.region === 'bottom') content.setTabWorkspaceDockOpen(d.tabId, { bottom: true })
      }
      if (content && typeof content.selectTabById === 'function') {
        content.selectTabById(d.tabId)
      }
      const sideNav = sr.querySelector('portal-side-nav')
      const propertyPanel = sr.getElementById('property-panel')
      const logPanel = sr.getElementById('log-panel')
      const floatWin = sr.getElementById('workspace-float-window')
      const idx = typeof d.viewIndex === 'number' && !Number.isNaN(d.viewIndex) ? d.viewIndex : 0
      const applyInner = () => {
        if (d.region === 'explorer') {
          sideNav?.activateWorkspaceRegionView?.(idx)
        } else if (d.region === 'property') {
          propertyPanel?.activateWorkspaceRegionView?.(idx)
        } else if (d.region === 'bottom') {
          logPanel?.activateWorkspaceRegionView?.(idx)
        } else if (d.region === 'floatview') {
          /** @type {any} */ (floatWin)?.activateView?.(idx)
        }
      }
      queueMicrotask(() => queueMicrotask(applyInner))
    })

    /* 区域 tab 右键：激活视图 / 在 HTML 设计器中打开。由 portal-app 集中分发。
       挂在 host（this）而非 shadowRoot：prepare 对话框被 appendChild 到 document.body，
       从对话框派发的 composed 事件不会进入本组件 shadowRoot，但会冒泡到 host。 */
    this.addEventListener('portal-workspace-view-context-action', (e) => {
      const d = /** @type {CustomEvent<{ tabId?: string, region?: string, viewIndex?: number, action?: string, viewSpec?: Record<string, unknown>|null }>} */ (e).detail
      if (!d?.action) return
      if (d.action === 'activate-view') {
        this.dispatchEvent(new CustomEvent('portal-workspace-view-focus', {
          bubbles: true,
          composed: true,
          detail: { tabId: d.tabId, region: d.region, viewIndex: d.viewIndex },
        }))
        return
      }
      if (d.action === 'edit-html-page') {
        Workspace.openHtmlPageInDesigner(this, d.viewSpec)
      }
    })

    /* Drop（任一面板派发）：mutate ws-like → 写回 contentSpec/shell + storage；按方案 A 重新挂载所有缓存根 */
    sr.addEventListener('portal-workspace-view-dropped', (e) => {
      const detail = /** @type {CustomEvent<{ tabId?: string, sourceRegion?: string, viewKey?: string, targetRegion?: string, targetIndex?: number }>} */ (e).detail
      if (!detail) return
      Workspace.applyViewDrop(this, detail)
    })

    /* 显式右键「保存视图位置」 */
    sr.addEventListener('portal-workspace-save-layout', (e) => {
      const detail = /** @type {CustomEvent<{ tabId?: string }>} */ (e).detail
      if (!detail?.tabId) return
      Workspace.saveCurrentTabDockLayout(this, detail.tabId)
    })

    /* 显式右键「重置视图位置」 */
    sr.addEventListener('portal-workspace-reset-layout', (e) => {
      const detail = /** @type {CustomEvent<{ tabId?: string }>} */ (e).detail
      if (!detail?.tabId) return
      Workspace.resetTabDockLayout(this, detail.tabId)
    })

    /* Nav selection → WorkspaceNode.open_view（菜单 JSON 的 `workspace` 驱动各区域；含 `prepare` 时先弹窗） */
    sr.addEventListener('nav-selection', async (e) => {
      // 非叶子节点（children 非空）只能展开/收起，拒绝打开页面（双保险，配合 side-nav 派发端守卫）
      if (e.detail?.menu?.hasChildren) return
      await Workspace.handleNavSelection(this, sr, e)
      /* 确定性路由：菜单点击后同步 URL（menu.id 即菜单 code；addTab 内部对已激活 tab 不会派发
         tab-activate，故此处补一次 push 保证 URL 始终跟随当前菜单）。 */
      const code = e.detail?.menu?.id
      if (code != null) getPortalRouter().pushMenu(String(code))
    })

    /* side-nav 菜单异步加载完成 → 按 _activeTabId 补一次选中同步。
       深链 / 刷新 / 切 activity 场景下，portal-content-tab-activate 先于菜单渲染派发，
       第一次 syncMenuSelection 因菜单未渲染而 no-op；此处菜单就位后再同步一次。 */
    sr.addEventListener('portal-menu-rendered', () => {
      const tabId = this._activeTabId
      if (!tabId) return
      const sideNav = sr.querySelector('portal-side-nav')
      if (sideNav) syncMenuSelection(/** @type {HTMLElement} */ (sideNav), tabId)
    })

    /* 菜单树右键「编辑菜单节点」→ 用内联节点直接打开工作区节点编辑对话框 */
    sr.addEventListener('nav-edit-node', (e) => {
      const node = /** @type {CustomEvent<{ node?: Record<string, unknown> }>} */ (e).detail?.node
      if (!node) return
      this._openWorkspaceNodeDialogWithNode(node)
        .catch((err) => console.warn('[portal-app] open node editor failed:', err))
    })

    /* 帮助中心正文里的「执行功能」链接（node:/menu:/wsnode:）→ 打开对应工作区节点/菜单。
       事件由 native 页 composed 派发，穿透 shadow DOM 冒泡到此处。 */
    sr.addEventListener('portal-help-action', (e) => {
      const detail = /** @type {CustomEvent<Record<string, unknown>>} */ (e).detail
      if (!detail) return
      this._handleHelpAction(detail)
        .catch((err) => { showCmxError('帮助中心跳转：打开目标功能失败', err) })
    })

    /* 帮助中心把「当前正在看的帮助文档」作为上下文广播 → 存到 app，供 AI 助手浮窗引用。 */
    sr.addEventListener('portal-help-context', (e) => {
      const detail = /** @type {CustomEvent<Record<string, unknown>>} */ (e).detail
      if (!detail || detail.active === false) {
        this._helpContext = null
      } else {
        this._helpContext = detail
      }
    })

    /* 专业信息对话框（cmx-message-dialog）的「获取帮助」→ 打开门户帮助中心。
       对话框挂在 document.body 且事件 composed 派发到 window（非本 shadow root），
       故在 window 上监听；preventDefault 告知对话框「已接管」，使其不再回退 window.open。 */
    if (!this._onCmxHelpRequest) {
      this._onCmxHelpRequest = (e) => {
        try { e.preventDefault() } catch { /* noop */ }
        const detail = /** @type {CustomEvent<{ code?: string, level?: string, title?: string, url?: string }>} */ (e).detail || {}
        this._openHelpCenter(detail)
          .catch((err) => console.warn('[portal-app] open help center from dialog failed:', err))
      }
      window.addEventListener('cmx-help-request', this._onCmxHelpRequest)
    }

    /* Keyboard shortcuts */
    if (!this._onGlobalKeydown) {
      this._onGlobalKeydown = (e) => {
        if (e.ctrlKey || e.metaKey) {
          if (e.key === 'b') { e.preventDefault(); this._toggleSideNav() }
          if (e.key === 'j') { e.preventDefault(); this._toggleLog() }
          if (e.key === 'p') { e.preventDefault(); this._toggleProperty() }
        }
      }
      document.addEventListener('keydown', this._onGlobalKeydown)
    }

    /* 刷新或关闭浏览器窗口：存在已修改的 Content 标签时触发离开确认（具体文案由浏览器决定） */
    if (!this._onBeforeUnload) {
      this._onBeforeUnload = (e) => {
        const content = sr.getElementById('content-area')
        if (content && typeof content.hasAnyDirtyTab === 'function' && content.hasAnyDirtyTab()) {
          e.preventDefault()
          e.returnValue = ''
        }
      }
      window.addEventListener('beforeunload', this._onBeforeUnload)
    }
  }

  /**
   * 打开工作区，与点击侧边菜单项效果相同。
   * 含 html_pages batch 加载、prepare 对话框处理。
   * @param {import('../lib/workspace-node.js').WorkspaceNode | Record<string, unknown>} node
   *   WorkspaceNode 实例（自定义脚本直接构造）或普通菜单节点 JSON 对象（后端返回的菜单结构）。
   * @param {{ initialContext?: Record<string, unknown> }} [extras]
   *   动态跳转传参：开新 tab 时注入 workspace.context 的初始键值。
   *   场景：列表页选行后打开详情页，传 `{ initialContext: { docId: row.id } }`，
   *   详情页 pageFns 经 `host.workspace.context.get('docId')` 读取。
   */
  async openNode (node, extras) {
    // 动态节点（不在菜单的并列页）持久化快照+上下文，供 F5 刷新重建（见 portal-router loadDynNode）
    if (node && typeof node === 'object' && node.id && node.workspace) {
      persistDynNode(node, extras?.initialContext)
    }
    await Workspace.openWorkspaceNode(this, node, extras)
  }

  /**
   * 深链修复：按菜单的 domain/application 切换当前域应用 + 左栏菜单。
   * 与 shellbar「资源域切换」(domain-change) 同链路：加载该域 activities → applyActivity。
   * 若目标域即当前活动则 no-op。
   * @param {string} domain 域 code（如 basic）
   * @param {string} application 应用 code（如 dataplatform）
   */
  async switchActivityForMenu (domain, application) {
    if (!domain) return
    // 从树 reduce 出目标域的活动列表（不再调 /api/activities）
    const tree = await ensureDomainTreeLoaded()
    const list = treeToActivities(tree, domain)
    const activityBar = this.shadowRoot.querySelector('portal-activity-bar')
    if (activityBar && typeof activityBar._setActivities === 'function') {
      activityBar._setActivities(list)
    }
    if (!list.length) return
    const menuRef = `dam:${domain}/${application}`
    const entry = list.find((a) => (a.sideNav?.type === 'module' || a.sideNav?.type === 'menu-pages') && a.sideNav.menu === menuRef)
      || list.find((a) => a.id === application)
      || list[0]
    if (entry && this._activeActivity !== entry.id) {
      Workspace.applyActivity(this, entry.id, true, { sideNav: entry.sideNav, label: entry.label })
    }
    // 同步右上角域选择器选中态（F5 深链时域与当前菜单所属域对齐）
    try {
      const domains = treeToDomains(tree)
      const shellbar = this.shadowRoot.querySelector('portal-shellbar')
      if (shellbar && domains.length && typeof shellbar.setDomains === 'function') {
        const dm = domains.find((d) => d.id === domain)
        if (dm) shellbar.setDomains(domains, dm.id)
      }
    } catch (err) { /* 域选择器同步失败不影响主流程 */ }
  }

  flushMemoryCaches () {
    // 页面复用基于 customElements 注册状态，无需手动清除
  }

  getMemoryDiagnostics () {
    const content = this.shadowRoot?.getElementById('content-area')
    const tabs = Array.isArray(content?._tabs) ? content._tabs : []
    let mountRootCount = 0
    for (const tab of tabs) {
      const roots = tab?.workspaceMountRoots
      if (!roots || typeof roots !== 'object') continue
      mountRootCount += Object.values(roots).filter(Boolean).length
    }
    return {
      floatAutoOpenedTabs: this._floatAutoOpenedTabs?.size || 0,
      contentTabs: tabs.length,
      workspaceMountRoots: mountRootCount,
    }
  }

  /**
   * 打开「工作区节点编辑」对话框（shellbar 按钮与左菜单共用）。
   * 单例挂在 document.body：已挂则复用，避免重复创建。可选 `id` 预加载已有节点。
   * @param {string} [id]
   */
  async _openWorkspaceNodeDialog (id) {
    let dlg = this._wsNodeDialog
    if (!dlg || !dlg.isConnected) {
      await import('./portal-workspace-node-dialog.js')
      dlg = document.createElement('portal-workspace-node-dialog')
      document.body.appendChild(dlg)
      this._wsNodeDialog = dlg
    }
    await dlg.open(id)
  }

  async _openDamRegistryCenter () {
    await Workspace.openWorkspaceNode(this, createPortalDamRegistryMenuNode())
    this._sideNavVisible = true
    Layout.applyLayout(this)
  }

  /** 打开「设置」工作区（原 shellbar「设置」走 activity，DAM 派生后改 openWorkspaceNode）。 */
  async _openSettingsCenter () {
    await Workspace.openWorkspaceNode(this, createPortalSettingsMenuNode())
    this._sideNavVisible = true
    Layout.applyLayout(this)
  }

  async _openClusterDatasource () {
    await Workspace.openWorkspaceNode(this, createPortalClusterDatasourceMenuNode())
    this._sideNavVisible = true
    Layout.applyLayout(this)
  }

  /** 打开菜单管理页（树形 CRUD，渲染 portal-menu-manager）。 */
  async _openMenuManager () {
    await Workspace.openWorkspaceNode(this, createPortalMenuManagerMenuNode())
    this._sideNavVisible = true
    Layout.applyLayout(this)
  }

  /**
   * 打开帮助中心（工作区节点）。
   * @param {{ code?: string, level?: string, title?: string, url?: string }} [ctx]
   *   可选来源上下文（如错误对话框「获取帮助」带来的错误码/标题）→ 存 _helpContext，供 AI 助手就地答疑。
   */
  async _openHelpCenter (ctx) {
    // 错误对话框「获取帮助」带来的上下文：让 AI 助手以「错误码 + 标题」为背景直接答疑。
    if (ctx && (ctx.code || ctx.title)) {
      this._helpContext = { source: 'message-dialog', level: ctx.level || null, code: ctx.code || null, title: ctx.title || '', active: true }
    }
    await Workspace.openWorkspaceNode(this, createPortalHelpCenterMenuNode())
    this._sideNavVisible = true
    Layout.applyLayout(this)
    // 打开帮助中心同时弹出 shellbar AI 助手浮窗，并让其以「当前帮助内容」为上下文。
    try {
      const fw = /** @type {any} */ (this.shadowRoot?.getElementById('workspace-float-window'))
      fw?.activateView?.('ai')
    } catch (err) {
      console.warn('[portal-app] open assistant for help failed:', err)
    }
  }

  /** 打开某通知中心（任务/消息/日志），用 native_pages 列表页展示并支持标记已读。 */
  async _openNotifyCenter (center) {
    await Workspace.openWorkspaceNode(this, createNotifyCenterMenuNode(center))
    this._sideNavVisible = true
    Layout.applyLayout(this)
  }

  /**
   * 初始化通知：拉中心元信息 + 当前未读计数注入 shellbar，并订阅 SSE 实时刷新红色角标。
   * 计数事件来自后端 broadcast（发布/标记已读时推送）。
   */
  async _initNotifications () {
    const shellbar = this.shadowRoot?.querySelector('portal-shellbar')
    if (!shellbar) return
    try {
      const meta = await fetchNotifyCenters()
      if (meta?.centers) shellbar.setNotifyCenters(meta.centers)
    } catch { /* 用内置默认三中心 */ }
    try {
      const counts = await fetchNotifyCounts()
      shellbar.setNotifyCounts(counts)
    } catch { /* 未登录/无数据时保持 0 */ }
    // 避免重复订阅
    if (this._notifyStop) return
    this._notifyStop = subscribeNotifyStream((ev) => {
      const sb = this.shadowRoot?.querySelector('portal-shellbar')
      if (!sb) return
      if (ev.type === 'counts' && ev.data && typeof ev.data === 'object') {
        sb.setNotifyCounts(ev.data)
      }
      // ev.type === 'notify'：新通知到达。计数会随后由 counts 事件刷新；
      // 这里无需额外处理（如需弹消息提示可在此扩展）。
    })
  }

  /**
   * 执行帮助正文里的「执行功能」链接。三种 kind：
   *  - node：按 id 从后端取已保存的工作区节点，打开（等同点左菜单/节点库）。
   *  - menu：按 menu-pages 文件名解析活动并 applyActivity（等同点侧边栏菜单）。
   *  - inlineNode：帮助文档 actions 内联定义的菜单节点对象，直接 seed 打开（无需后端先建节点）。
   * @param {Record<string, unknown>} detail
   */
  async _handleHelpAction (detail) {
    const kind = String(detail?.kind || '')
    if (kind === 'editWorkspaceNode') {
      // 打开工作区节点编辑对话框（workspace-node 模式，存 /api/workspace-nodes）。
      // 供流程设计器等原生页编辑「节点表单工作台」用；id 缺省则新建。
      const id = String(detail.id || '').trim()
      if (typeof this._openWorkspaceNodeDialog === 'function') {
        await this._openWorkspaceNodeDialog(id || undefined)
      }
      return
    }
    if (kind === 'node') {
      const id = String(detail.id || '').trim()
      if (!id) return
      const rec = await getWorkspaceNode(id) // ApiResp 已由 apiFetch 拆 data；这里直接拿记录
      const node = (rec && typeof rec === 'object' && 'data' in rec) ? rec.data : rec
      if (!node || !node.workspace) throw new Error(`工作区节点无 workspace：${id}`)
      // node 记录形如 { id, name, icon, workspace }；openWorkspaceNode 接受「菜单节点对象」。
      // 走 openNode 统一 persistDynNode（节点库页不在菜单树，F5 刷新同样需要快照才能回首页）。
      await this.openNode({
        id: node.id || id,
        caption: node.name || id,
        icon: node.icon || 'create',
        workspace: node.workspace,
      })
      this._sideNavVisible = true
      Layout.applyLayout(this)
      return
    }
    if (kind === 'menu') {
      const key = String(detail.key || '').trim()
      if (!key) return
      // 加载树并对所有域派生 activities（填充缓存），让 findActivityIdByMenuPage 能跨域查找
      const tree = await ensureDomainTreeLoaded()
      for (const d of treeToDomains(tree)) {
        treeToActivities(tree, d.id)
      }
      const sid = findActivityIdByMenuPage(key)
      if (!sid) throw new Error(`未找到菜单对应的活动：${key}`)
      const row = getCachedActivityEntry(sid)
      Workspace.applyActivity(this, sid, true, { sideNav: row?.sideNav, label: row?.label })
      return
    }
    if (kind === 'inlineNode') {
      const node = detail.node
      if (!node || typeof node !== 'object') return
      // 统一走 openNode：persistDynNode 写 sessionStorage 快照（动态 tab F5 刷新按 code 命中
      // 回首页，而非误报"页面不存在"）+ extras.initialContext 透传（html_pages 动态传参）。
      await this.openNode(/** @type {any} */ (node), detail?.extras)
      this._sideNavVisible = true
      Layout.applyLayout(this)
    }
  }

  /**
   * 用一个「菜单节点对象」直接打开编辑对话框（左侧菜单树右键「编辑」用）。
   * 菜单项 workspace 内联在 explorer-menu.json，直接 seed，不查节点库。
   * @param {Record<string, unknown>} node
   */
  async _openWorkspaceNodeDialogWithNode (node) {
    let dlg = this._wsNodeDialog
    if (!dlg || !dlg.isConnected) {
      await import('./portal-workspace-node-dialog.js')
      dlg = document.createElement('portal-workspace-node-dialog')
      document.body.appendChild(dlg)
      this._wsNodeDialog = dlg
    }
    await dlg.openWithNode(node)
  }

  _toggleSideNav () {
    this._sideNavVisible = !this._sideNavVisible
    Layout.applyLayout(this)
  }

  _toggleLog () {
    this._logVisible = !this._logVisible
    Layout.applyLayout(this)
    Layout.persistActiveTabDockOpen(this, 'bottom', this._logVisible)
  }

  _toggleProperty () {
    this._propertyVisible = !this._propertyVisible
    Layout.applyLayout(this)
    Layout.persistActiveTabDockOpen(this, 'property', this._propertyVisible)
  }
}

customElements.define('cmx-portal-app', PortalApp)
