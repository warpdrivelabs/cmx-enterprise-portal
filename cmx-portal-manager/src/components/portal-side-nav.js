/**
 * 侧边导航主控：PortalSideNav 类 + _renderView 调度 + 公共 API。
 */
import { handleWorkspaceRegionTabBarClick } from '../lib/workspace-node.js'
import { createSideNavTemplate, parseSideNavSpecFromAttrs, BUILTIN_TEMPLATES, MENU_PAGES_PANEL_HTML } from './portal-side-nav-shell.js'
import {
  wireOuterTabOverflowRoot,
  syncOuterTabStrip,
  layoutOuterTabStripOverflow,
} from './portal-side-nav-outer-tabs.js'
import {
  wireWorkspaceDnd,
  wireWorkspaceCtxMenu,
  setWorkspaceExplorer,
  activateWorkspaceRegionView,
} from './portal-side-nav-workspace.js'
import {
  loadMenuPagesMenu,
  wireBuiltInSideNavIfAny,
  teardownMenuPagesGlobalShortcuts,
  onMenuPagesDocKeydown,
  applyAccordionThemes,
} from './portal-side-nav-menu.js'
import { loadHtmlPagesSideNav } from './portal-side-nav-html-pages.js'

export class PortalSideNav extends HTMLElement {
  constructor () {
    super()
    this.attachShadow({ mode: 'open' })
    this._view = 'explorer'
    /** @type {{ id: string, text: string }[]} */
    this._outerTabDefs = []
    /** @type {ResizeObserver|null} */
    this._outerTabOverflowRo = null
    /** @type {unknown[]|null} 权限过滤后的菜单根（ExplorerMenuNode[]） */
    this._menuPagesBaseItems = null
    /** @type {string} */
    this._menuPagesSearchQuery = ''
    /** 菜单异步加载世代：避免快速重渲染时旧 fetch 先完成，在已卸载的侧栏上 wire 导致可见侧栏未绑定 selection-change */
    this._menuPagesLoadGen = 0
    /** html-pages 侧栏异步加载世代：同 `_menuPagesLoadGen`，避免切换活动时旧批量拉取覆盖新侧栏。 */
    this._htmlPagesLoadGen = 0
    /** 宿主一次写入多属性时跳过逐次 `_renderView`，避免重复 `GET /api/menu-pages` */
    this._batchHostSideNav = false
    /** @type {import('../lib/workspace-node.js').WorkspaceRegionViewsInput|null} 追加在外层第二签后的 Explorer 工作区（单对象或视图数组） */
    this._workspaceExplorerSpec = null
    this._boundWorkspaceTabClick = (e) => handleWorkspaceRegionTabBarClick(e)
    /** @type {'main'|'workspace'} */
    this._outerExplorerActive = 'main'
    /** @type {string} 当前活动图标（`ui5-icon` name），仅用于 Explorer 外层首个「活动/菜单」签 */
    this._activityIcon = ''
    /** @type {boolean} */
    this._menuPagesShortcutOnDoc = false
    /** @type {((e: KeyboardEvent) => void) | null} */
    this._menuPagesDocKeyHandler = null
    this._onMenuPagesDocKeydown = (e) => onMenuPagesDocKeydown(this, e)
    /** @type {Record<string, unknown>|null} html_pages 活动侧栏当前 spec（供 ctxmenu 读取） */
    this._htmlPagesActiveSpec = null
    /** @type {(() => void)|null} */
    this._dndUnwire = null
    /** @type {(() => void)|null} */
    this._ctxMenuUnwire = null
    /** @type {(() => void)|null} */
    this._htmlPagesCtxMenuUnwire = null
    /** @type {((e: Event) => void)|null} */
    this._onPortalThemeChange = null
    /** 无 spec 占位（加载中）延时器：200ms 内 spec 就绪则占位根本不出现（反闪烁）。 */
    this._specPendingTimer = null
  }

  static get observedAttributes () {
    return ['view', 'side-nav-spec', 'side-nav-title']
  }

  attributeChangedCallback (name, _, val) {
    if (name === 'view') {
      this._view = val
    }
    if (this._batchHostSideNav) return
    this._renderView()
  }

  connectedCallback () {
    this._render()
    wireOuterTabOverflowRoot(this)
    this._renderView()
    const row = this.shadowRoot.getElementById('outer-tab-row')
    if (row) {
      this._outerTabOverflowRo = new ResizeObserver(() => layoutOuterTabStripOverflow(this))
      this._outerTabOverflowRo.observe(row)
    }
    queueMicrotask(() => layoutOuterTabStripOverflow(this))
    this.shadowRoot.addEventListener('click', this._boundWorkspaceTabClick)
    wireWorkspaceDnd(this)
    wireWorkspaceCtxMenu(this)
    // 监听门户主题切换（亮↔暗），重刷模块手风琴配色（配色由前端按 id 稳定生成，需随主题切亮/暗侧）。
    this._onPortalThemeChange = (e) => {
      const themeId = /** @type {{ detail?: { theme?: string } }} */ (e).detail?.theme
      applyAccordionThemes(this, themeId)
    }
    window.addEventListener('cmx-portal-theme-change', this._onPortalThemeChange)
  }

  disconnectedCallback () {
    clearTimeout(this._specPendingTimer)
    this._specPendingTimer = null
    if (this._onPortalThemeChange) {
      window.removeEventListener('cmx-portal-theme-change', this._onPortalThemeChange)
      this._onPortalThemeChange = null
    }
    this.shadowRoot.removeEventListener('click', this._boundWorkspaceTabClick)
    this._outerTabOverflowRo?.disconnect()
    this._outerTabOverflowRo = null
    teardownMenuPagesGlobalShortcuts(this)
    this._dndUnwire?.()
    this._dndUnwire = null
    this._ctxMenuUnwire?.()
    this._ctxMenuUnwire = null
    this._htmlPagesCtxMenuUnwire?.()
    this._htmlPagesCtxMenuUnwire = null
  }

  set view (val) {
    this.setAttribute('view', val == null ? '' : String(val))
  }

  /**
   * 宿主批量写入活动侧栏（`side-nav-spec` / `side-nav-title` / `view`），结束时只 `_renderView` 一次，
   * 避免 `setAttribute` 各触发一次 `_renderView` 导致同一菜单重复请求。
   * @param {{ sideNav?: object|null, label?: string|null, viewId: string, activityIcon?: string|null }} p
   */
  applyHostActivitySideNav (p) {
    const { sideNav, label, viewId, activityIcon } = p
    this._activityIcon =
      activityIcon != null && String(activityIcon).trim() ? String(activityIcon).trim() : ''
    this._batchHostSideNav = true
    try {
      if (sideNav) {
        this.setAttribute('side-nav-spec', JSON.stringify(sideNav))
      } else {
        this.removeAttribute('side-nav-spec')
      }
      if (label) {
        this.setAttribute('side-nav-title', label)
      } else {
        this.removeAttribute('side-nav-title')
      }
      const vid = viewId == null ? '' : String(viewId)
      this.setAttribute('view', vid)
      this._view = vid
    } finally {
      this._batchHostSideNav = false
      this._renderView()
    }
  }

  /**
   * 工作区 Explorer：在首个「活动」外层签之后追加一签；`null` 移除追加签与面板。
   * @param {import('../lib/workspace-node.js').WorkspaceRegionViewsInput|null} spec
   * @param {{ activateWorkspace?: boolean, mountRoot?: HTMLElement|null }} [options]
   */
  setWorkspaceExplorer (spec, options = {}) {
    setWorkspaceExplorer(this, spec, options)
  }

  /**
   * 切换到 Explorer 工作区多视图中的某一签（由 Content 标签右键「视图」菜单触发）。
   * @param {number} viewIndex
   */
  activateWorkspaceRegionView (viewIndex) {
    activateWorkspaceRegionView(this, viewIndex)
  }

  _render () {
    // eslint-disable-next-line no-restricted-syntax -- shadow root 模板：静态字面量
    this.shadowRoot.innerHTML = createSideNavTemplate()
  }

  _renderView () {
    const body = this.shadowRoot.getElementById('panel-body')
    if (!body) return
    /* 切换 sideNav 形态时先解绑 html_pages 侧栏 ctxmenu，旧 ctxmenu 元素会随 helper unwire 一同清除；
       下次进入 html_pages 模式由 wireHtmlPagesSideNavCtxMenu 重新挂上。 */
    this._htmlPagesCtxMenuUnwire?.()
    this._htmlPagesCtxMenuUnwire = null
    this._htmlPagesActiveSpec = null
    const spec = parseSideNavSpecFromAttrs(this)
    if (!spec) {
      teardownMenuPagesGlobalShortcuts(this)
      /* spec 未就绪 ≠ 配置缺失：首屏 /api/domains/tree 还在请求中，这里只做**中性加载占位**，
         不再渲染 Negative 报错条（把加载中当错误是交互错误）。
         反闪烁：延迟 200ms 才显示占位——树请求快（命中缓存/本地）时占位根本不出现；
         spec 一旦写入（applyHostActivitySideNav → attributeChangedCallback → _renderView），下次进入走正常分支。 */
      clearTimeout(this._specPendingTimer)
      // eslint-disable-next-line no-restricted-syntax -- 静态字面量
      body.innerHTML = ''
      this._specPendingTimer = setTimeout(() => {
        this._specPendingTimer = null
        /* 定时器晚到时可能已有 spec 并完成渲染：重查，避免覆盖真实菜单。 */
        if (parseSideNavSpecFromAttrs(this)) return
        const b = this.shadowRoot.getElementById('panel-body')
        if (!b || b.childElementCount) return
        // eslint-disable-next-line no-restricted-syntax -- 静态字面量（全部 var(--sap*) 派生，随主题）
        b.innerHTML =
          '<div style="flex:1;display:flex;align-items:center;justify-content:center;gap:.5rem;'
          + 'font-size:var(--sapFontSize,.875rem);color:var(--sapTextColor,#32363a)">'
          + '<ui5-busy-indicator active size="S" delay="0" style="flex:0 0 auto"></ui5-busy-indicator>'
          + '<span>正在加载菜单…</span></div>'
      }, 200)
      this._outerTabDefs = [{ id: 'main', text: ' ' }]
      syncOuterTabStrip(this)
      return
    }
    clearTimeout(this._specPendingTimer)
    this._specPendingTimer = null
    if (spec.type === 'module' || spec.type === 'menu-pages') {
      this._menuPagesBaseItems = null
      this._menuPagesSearchQuery = ''
      // eslint-disable-next-line no-restricted-syntax -- MENU_PAGES_PANEL_HTML 是模块级常量字面量
      body.innerHTML = MENU_PAGES_PANEL_HTML
      void loadMenuPagesMenu(this, spec.menu)
    } else if (spec.type === 'built-in') {
      teardownMenuPagesGlobalShortcuts(this)
      const tpl = BUILTIN_TEMPLATES[spec.template]
      // eslint-disable-next-line no-restricted-syntax -- 内置模板 render() 输出由本仓库自有模板拼装，不接受外部输入
      body.innerHTML = tpl ? tpl.render() : ''
      wireBuiltInSideNavIfAny(this, body)
      if (this._workspaceExplorerSpec) {
        queueMicrotask(() => setWorkspaceExplorer(this, this._workspaceExplorerSpec))
      }
    } else if (spec.type === 'html_pages') {
      teardownMenuPagesGlobalShortcuts(this)
      void loadHtmlPagesSideNav(this, spec.views)
      if (this._workspaceExplorerSpec) {
        queueMicrotask(() => setWorkspaceExplorer(this, this._workspaceExplorerSpec))
      }
    }
    syncOuterTabStrip(this)
  }
}

customElements.define('portal-side-nav', PortalSideNav)
