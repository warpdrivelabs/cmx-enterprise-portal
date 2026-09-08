import {
  PORTAL_TAB_OVERFLOW_STYLES,
  TAB_OVERFLOW_BTN_RESERVE,
  computeVisibleTabRange,
  hiddenTabIndices,
} from './tab-strip-overflow.js'
import {
  buildExplorerSideNavigation,
  explorerMenuNodeSummary,
  fetchExplorerMenu,
  filterExplorerMenuBySearchText,
  filterExplorerMenuTree,
  getExplorerMenuPayloadForItem,
  getExplorerMenuPermissionContext,
} from './explorer-menu.js'
import {
  activateWorkspaceRegionViewByIndex,
  handleWorkspaceRegionTabBarClick,
  normalizeWorkspaceRegionViews,
  renderWorkspaceRegionViewsHtml,
  safeUi5IconName,
  workspaceRegionOuterTabIcon,
  workspaceRegionOuterTabText,
} from './workspace-node.js'

/** 由 `sideNav.type === "menu-pages"` 使用，DOM id 固定，与具体活动 id 无关 */
const MENU_PAGES_PANEL_HTML = `
  <div class="explorer-menu-view">
    <ui5-message-strip id="portal-menu-strip" design="Negative" hidden></ui5-message-strip>
    <div class="portal-menu-search-row">
      <ui5-input id="portal-menu-search" placeholder="搜索菜单…（/ 或 Alt+S 聚焦）" style="flex:1;min-width:0"></ui5-input>
    </div>
    <div class="explorer-menu-body">
      <ui5-busy-indicator id="portal-menu-busy" active delay="0" class="explorer-menu-busy" text="加载菜单…"></ui5-busy-indicator>
      <ui5-side-navigation id="portal-menu-side-nav" class="explorer-side-nav"></ui5-side-navigation>
    </div>
  </div>
`

/** 内置占位侧栏：`sideNav.type === "built-in"` + `template` */
const BUILTIN_TEMPLATES = {
  search: {
    render: () => `
      <div class="search-view">
        <div class="search-input-row">
          <ui5-input placeholder="搜索页面、组件、服务..." id="search-input" style="flex:1"></ui5-input>
          <ui5-button icon="search" design="Transparent" id="do-search"></ui5-button>
        </div>
        <div class="search-tip">输入关键字并按回车搜索</div>
        <div class="search-results" id="search-results"></div>
      </div>
    `,
  },
  scm: {
    render: () => `
      <div class="scm-view">
        <div class="scm-section-title">更改 (3)</div>
        <ui5-list id="scm-list">
          <ui5-list-item-standard icon="edit" description="已修改" additional-text="M">
            portal-app.js
          </ui5-list-item-standard>
          <ui5-list-item-standard icon="add" description="新增" additional-text="A">
            portal-side-nav.js
          </ui5-list-item-standard>
          <ui5-list-item-standard icon="decline" description="已删除" additional-text="D">
            old-layout.js
          </ui5-list-item-standard>
        </ui5-list>
        <div style="padding: 8px; display:flex; gap:4px;">
          <ui5-button design="Emphasized" style="flex:1">提交</ui5-button>
          <ui5-button design="Default" icon="refresh">刷新</ui5-button>
        </div>
      </div>
    `,
  },
  extensions: {
    render: () => `
      <div class="ext-view">
        <div class="ext-search-row">
          <ui5-input placeholder="搜索扩展..." style="flex:1"></ui5-input>
        </div>
        <div class="ext-section-title">已安装</div>
        <ui5-list>
          <ui5-list-item-standard icon="puzzle" description="表单设计器 v1.2.0" additional-text="✓">
            CMX Form Designer
          </ui5-list-item-standard>
          <ui5-list-item-standard icon="puzzle" description="HTML设计器 v1.1.0" additional-text="✓">
            CMX HTML Designer
          </ui5-list-item-standard>
          <ui5-list-item-standard icon="puzzle" description="节点服务 v1.0.0" additional-text="✓">
            CMX Node Service
          </ui5-list-item-standard>
        </ui5-list>
        <div class="ext-section-title">推荐安装</div>
        <ui5-list>
          <ui5-list-item-standard icon="puzzle" description="流程设计器" additional-text="↓">
            CMX Flow Designer
          </ui5-list-item-standard>
        </ui5-list>
      </div>
    `,
  },
}

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
    this._onMenuPagesDocKeydown = this._onMenuPagesDocKeydown.bind(this)
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
    this._wireOuterTabOverflowRoot()
    this._renderView()
    const row = this.shadowRoot.getElementById('outer-tab-row')
    if (row) {
      this._outerTabOverflowRo = new ResizeObserver(() => this._layoutOuterTabStripOverflow())
      this._outerTabOverflowRo.observe(row)
    }
    queueMicrotask(() => this._layoutOuterTabStripOverflow())
    this.shadowRoot.addEventListener('click', this._boundWorkspaceTabClick)
  }

  disconnectedCallback () {
    this.shadowRoot.removeEventListener('click', this._boundWorkspaceTabClick)
    this._outerTabOverflowRo?.disconnect()
    this._outerTabOverflowRo = null
    this._teardownMenuPagesGlobalShortcuts()
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
   * @returns {{ type: 'menu-pages', menu: string, title: string } | { type: 'built-in', template: string, title: string } | null}
   */
  _parseSideNavSpecFromAttrs () {
    const raw = this.getAttribute('side-nav-spec')?.trim()
    if (!raw) return null
    try {
      const o = JSON.parse(raw)
      if (!o || typeof o !== 'object') return null
      const type = String(o.type ?? '').trim()
      if (type === 'menu-pages') {
        const menu = String(o.menu ?? '').trim()
        const title = String(o.title ?? '').trim()
        if (!menu) return null
        return { type: 'menu-pages', menu, title }
      }
      if (type === 'built-in') {
        const template = String(o.template ?? '').trim()
        const title = String(o.title ?? '').trim()
        if (!template || !BUILTIN_TEMPLATES[template]) return null
        return { type: 'built-in', template, title }
      }
      return null
    } catch {
      return null
    }
  }

  _menuPagesUrl (menuKey) {
    const override = this.getAttribute('menu-pages-url')?.trim()
    if (override) {
      try {
        const u = new URL(override, window.location.href)
        u.searchParams.set('menu', menuKey)
        return u.toString()
      } catch {
        /* fall through */
      }
    }
    const u = new URL('/api/menu-pages', window.location.href)
    u.searchParams.set('menu', menuKey)
    return u.toString()
  }

  _render () {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow: hidden;
          background: var(--sapGroup_ContentBackground, #fafafa);
          border-right: 1px solid var(--sapPageHeader_BorderColor, #ddd);
        }
        .outer-tab-row {
          --portal-tab-row-bg: var(--sapGroup_ContentBackground, #fafafa);
          display: flex;
          flex-direction: row;
          align-items: stretch;
          flex-shrink: 0;
          min-width: 0;
          border-bottom: 1px solid var(--sapPageHeader_BorderColor, #ddd);
          background: var(--portal-tab-row-bg);
        }
        .outer-tab-strip {
          flex: 1 1 auto;
          min-width: 0;
          overflow: hidden;
          display: flex;
          align-items: stretch;
        }
        ${PORTAL_TAB_OVERFLOW_STYLES}
        .outer-tab {
          padding: 0 12px;
          height: 35px;
          display: flex;
          align-items: center;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          color: var(--sapContent_LabelColor, #6a6d70);
          border-bottom: 2px solid transparent;
          white-space: nowrap;
          user-select: none;
          flex-shrink: 0;
        }
        .outer-tab:hover { color: var(--sapTextColor, #333); }
        .outer-tab.active {
          color: var(--sapHighlightColor, #0070f2);
          border-bottom-color: var(--sapHighlightColor, #0070f2);
        }
        .panel-body {
          flex: 1 1 auto;
          min-height: 0;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        #cmx-workspace-explorer-pane > .cmx-ws-tab-cache-root {
          flex: 1 1 auto;
          min-height: 0;
          min-width: 0;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          align-self: stretch;
        }
        ui5-side-navigation {
          height: 100%;
        }
        .explorer-menu-view {
          display: flex;
          flex-direction: column;
          flex: 1 1 auto;
          min-height: 0;
          position: relative;
          overflow-y: auto;
          overflow-x: hidden;
        }
        .explorer-menu-view ui5-message-strip {
          flex-shrink: 0;
        }
        .portal-menu-search-row {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 8px 4px;
          border-bottom: 1px solid var(--sapPageHeader_BorderColor, #ddd);
          box-sizing: border-box;
        }
        .explorer-menu-body {
          flex: 1 1 auto;
          min-height: 0;
          position: relative;
          display: flex;
          flex-direction: column;
        }
        .explorer-menu-busy {
          position: absolute;
          inset: 0;
          z-index: 2;
          justify-content: center;
          align-items: center;
          background: color-mix(in srgb, var(--sapGroup_ContentBackground, #fafafa) 85%, transparent);
        }
        .explorer-menu-busy:not([active]) {
          visibility: hidden;
          pointer-events: none;
        }
        .explorer-side-nav {
          flex: 1 1 auto;
          min-height: 0;
        }
        .explorer-side-nav ui5-side-navigation-item ui5-side-navigation-item,
        .explorer-side-nav ui5-side-navigation-item ui5-side-navigation-sub-item[icon] {
          padding-inline-start: calc(var(--_ui5_side_navigation_group_icon_width, 2.5rem) - 2ch);
          box-sizing: border-box;
        }
        .explorer-side-nav ui5-side-navigation-item[data-cmx-menu-search-hit],
        .explorer-side-nav ui5-side-navigation-sub-item[data-cmx-menu-search-hit] {
          background: color-mix(in srgb, var(--sapHighlightColor, #0070f2) 14%, transparent);
          box-shadow: inset 3px 0 0 var(--sapHighlightColor, #0070f2);
          border-radius: var(--sapElement_BorderCornerRadius, 0.25rem);
        }
        .search-view, .scm-view, .ext-view {
          padding: 8px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .search-input-row, .ext-search-row {
          display: flex;
          gap: 4px;
          align-items: center;
        }
        .search-tip {
          font-size: 12px;
          color: var(--sapContent_LabelColor, #6a6d70);
          padding: 4px 0;
        }
        .scm-section-title, .ext-section-title {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.05em;
          color: var(--sapContent_LabelColor, #6a6d70);
          padding: 8px 4px 4px 4px;
          text-transform: uppercase;
        }
      </style>
      <div class="outer-tab-row" id="outer-tab-row">
        <div class="outer-tab-strip" id="outer-tab-strip"></div>
        <div class="portal-tab-overflow-wrap" id="outer-tab-overflow-wrap" style="display:none">
          <button type="button" class="portal-tab-overflow-trigger" id="outer-tab-overflow-btn" aria-label="更多" title="更多">
            <ui5-icon name="slim-arrow-down"></ui5-icon>
          </button>
        </div>
      </div>
      <ui5-menu id="outer-tab-overflow-menu" horizontal-align="End"></ui5-menu>
      <div class="panel-body" id="panel-body"></div>
    `
  }

  _wireOuterTabOverflowRoot () {
    const menu = this.shadowRoot.getElementById('outer-tab-overflow-menu')
    const btn = this.shadowRoot.getElementById('outer-tab-overflow-btn')
    if (menu && !menu.dataset.portalOverflowBound) {
      menu.dataset.portalOverflowBound = '1'
      menu.addEventListener('item-click', (e) => {
        const item = e.detail?.item
        const oid = item?.getAttribute?.('data-outer-id') || item?.dataset?.outerId
        if (!oid) return
        this.shadowRoot.querySelectorAll('.outer-tab').forEach((el) => {
          el.classList.toggle('active', el.dataset.outerId === oid)
        })
        menu.open = false
        queueMicrotask(() => this._layoutOuterTabStripOverflow())
      })
    }
    if (btn && !btn.dataset.portalOverflowBound) {
      btn.dataset.portalOverflowBound = '1'
      btn.addEventListener('click', () => {
        if (!menu) return
        menu.opener = btn
        menu.open = true
      })
    }
  }

  _buildOuterTabDefs () {
    const fromAttr = this.getAttribute('side-nav-title')?.trim()
    const spec = this._parseSideNavSpecFromAttrs()
    const text = fromAttr || spec?.title || '\u00A0'
    const mainAct =
      this._activityIcon != null && String(this._activityIcon).trim()
        ? safeUi5IconName(this._activityIcon)
        : ''
    /** @type {{ id: string, text: string, icon?: string }[]} */
    const defs = [mainAct ? { id: 'main', text, icon: mainAct } : { id: 'main', text }]
    const w = this._workspaceExplorerSpec
    if (normalizeWorkspaceRegionViews(w).length) {
      defs.push({
        id: 'workspace',
        text: workspaceRegionOuterTabText(w, '工作区'),
        icon: workspaceRegionOuterTabIcon(w, 'document'),
      })
    }
    this._outerTabDefs = defs
  }

  /**
   * 工作区 Explorer：在首个「活动」外层签之后追加一签；`null` 移除追加签与面板。
   * @param {import('../lib/workspace-node.js').WorkspaceRegionViewsInput|null} spec
   * @param {{ activateWorkspace?: boolean, mountRoot?: HTMLElement|null }} [options]
   * `mountRoot`：由 Content 标签缓存的根节点，切换时复用；不传则按 spec 渲染 HTML。Explorer 外层第二签的文案与图标见 {@link workspaceRegionOuterTabText} / {@link workspaceRegionOuterTabIcon}（`workspace.explorer` 的 `caption`/`icon` 或各视图 `tabLabel`/`icon`）；区内底部 Tab 图标仅来自各视图的 `icon`。
   */
  setWorkspaceExplorer (spec, options = {}) {
    const mountRoot = options.mountRoot instanceof HTMLElement ? options.mountRoot : null
    this._workspaceExplorerSpec = spec != null && typeof spec === 'object' ? spec : null
    const body = this.shadowRoot.getElementById('panel-body')
    if (!body) return
    const existing = body.querySelector('#cmx-workspace-explorer-pane')
    const views = normalizeWorkspaceRegionViews(this._workspaceExplorerSpec)
    if (!this._workspaceExplorerSpec || !views.length) {
      this._workspaceExplorerSpec = null
      existing?.remove()
      this._syncOuterTabStrip()
      this._setOuterExplorerActive('main')
      return
    }
    let pane = existing
    if (!pane) {
      pane = document.createElement('div')
      pane.id = 'cmx-workspace-explorer-pane'
      pane.setAttribute('role', 'region')
      pane.setAttribute('aria-label', 'Workspace explorer')
      pane.style.cssText = 'display:none;flex:1 1 auto;flex-direction:column;min-height:0;overflow:hidden;background:var(--sapGroup_ContentBackground,#fafafa)'
      body.appendChild(pane)
    }
    if (mountRoot) {
      while (pane.firstChild) pane.removeChild(pane.firstChild)
      pane.appendChild(mountRoot)
    } else {
      const onlyCache =
        pane.childElementCount === 1 &&
        pane.firstElementChild?.classList?.contains('cmx-ws-tab-cache-root')
      if (!onlyCache) {
        pane.innerHTML = renderWorkspaceRegionViewsHtml('explorer', this._workspaceExplorerSpec)
      }
    }
    this._syncOuterTabStrip()
    if (options.activateWorkspace) {
      this._setOuterExplorerActive('workspace')
    } else {
      this._setOuterExplorerActive('main')
    }
  }

  _setOuterExplorerActive (outerId) {
    this._outerExplorerActive = outerId === 'workspace' ? 'workspace' : 'main'
    const strip = this.shadowRoot.getElementById('outer-tab-strip')
    strip?.querySelectorAll('.outer-tab').forEach((el) => {
      el.classList.toggle('active', el.dataset.outerId === outerId)
    })
    this._applyOuterExplorerPaneVisibility()
    queueMicrotask(() => this._layoutOuterTabStripOverflow())
  }

  _applyOuterExplorerPaneVisibility () {
    const body = this.shadowRoot.getElementById('panel-body')
    if (!body) return
    const showWs = this._outerExplorerActive === 'workspace' && normalizeWorkspaceRegionViews(this._workspaceExplorerSpec).length > 0
    /* built-in 模板未包在 .explorer-menu-view 内，必须按「除工作区 pane 外的所有子节点」切换显隐 */
    for (const el of body.children) {
      if (!(el instanceof HTMLElement)) continue
      if (el.id === 'cmx-workspace-explorer-pane') {
        el.style.display = showWs ? 'flex' : 'none'
      } else {
        el.style.display = showWs ? 'none' : ''
      }
    }
  }

  /**
   * 切换到 Explorer 工作区多视图中的某一签（由 Content 标签右键「视图」菜单触发）。
   * @param {number} viewIndex
   */
  activateWorkspaceRegionView (viewIndex) {
    this._setOuterExplorerActive('workspace')
    const pane = this.shadowRoot.getElementById('cmx-workspace-explorer-pane')
    if (pane) {
      activateWorkspaceRegionViewByIndex(pane, 'explorer', viewIndex)
    }
  }

  _syncOuterTabStrip () {
    const strip = this.shadowRoot.getElementById('outer-tab-strip')
    if (!strip) return
    this._buildOuterTabDefs()
    strip.innerHTML = ''
    this._outerTabDefs.forEach((def) => {
      const t = document.createElement('div')
      const isActive = def.id === this._outerExplorerActive
      t.className = 'outer-tab' + (isActive ? ' active' : '')
      t.dataset.outerId = def.id
      if (def.icon) {
        t.style.display = 'inline-flex'
        t.style.alignItems = 'center'
        t.style.minWidth = '0'
        const ic = document.createElement('ui5-icon')
        ic.name = safeUi5IconName(def.icon)
        ic.style.width = '15px'
        ic.style.height = '15px'
        ic.style.flexShrink = '0'
        ic.style.marginRight = '6px'
        const span = document.createElement('span')
        span.textContent = def.text
        span.style.overflow = 'hidden'
        span.style.textOverflow = 'ellipsis'
        span.style.whiteSpace = 'nowrap'
        t.append(ic, span)
      } else {
        t.textContent = def.text
      }
      t.addEventListener('click', () => {
        this._setOuterExplorerActive(def.id)
      })
      strip.appendChild(t)
    })
    queueMicrotask(() => this._layoutOuterTabStripOverflow())
  }

  _layoutOuterTabStripOverflow () {
    const row = this.shadowRoot.getElementById('outer-tab-row')
    const strip = this.shadowRoot.getElementById('outer-tab-strip')
    const wrap = this.shadowRoot.getElementById('outer-tab-overflow-wrap')
    const btn = this.shadowRoot.getElementById('outer-tab-overflow-btn')
    const menu = this.shadowRoot.getElementById('outer-tab-overflow-menu')
    if (!row || !strip || !wrap || !btn || !menu) return
    const items = [...strip.querySelectorAll('.outer-tab')]
    if (!items.length) {
      wrap.style.display = 'none'
      return
    }
    items.forEach((el) => {
      el.style.display = 'flex'
      el.style.flexShrink = '0'
    })
    const widths = items.map((el) => el.getBoundingClientRect().width)
    const activeEl = strip.querySelector('.outer-tab.active')
    let activeIdx = items.indexOf(activeEl)
    if (activeIdx < 0) activeIdx = 0
    const { start, end, needsOverflow } = computeVisibleTabRange(
      widths,
      activeIdx,
      row.clientWidth,
      TAB_OVERFLOW_BTN_RESERVE
    )
    for (let i = 0; i < items.length; i++) {
      items[i].style.display = i >= start && i < end ? 'flex' : 'none'
    }
    wrap.style.display = needsOverflow ? '' : 'none'
    while (menu.firstChild) menu.removeChild(menu.firstChild)
    if (needsOverflow) {
      for (const i of hiddenTabIndices(this._outerTabDefs.length, start, end)) {
        const def = this._outerTabDefs[i]
        if (!def) continue
        const mi = document.createElement('ui5-menu-item')
        mi.setAttribute('text', def.text)
        mi.setAttribute('icon', safeUi5IconName(def.icon || 'document'))
        mi.setAttribute('data-outer-id', def.id)
        menu.appendChild(mi)
      }
    }
  }

  /** @returns {unknown[]} */
  _getMenuPagesDisplayItems () {
    const base = this._menuPagesBaseItems
    if (!Array.isArray(base) || !base.length) return []
    return filterExplorerMenuBySearchText(/** @type {any} */ (base), this._menuPagesSearchQuery)
  }

  /** @param {HTMLElement} searchEl */
  _focusMenuPagesSearchInput (searchEl) {
    const w = /** @type {{ focusInput?: () => void, focus?: () => void }} */ (/** @type {unknown} */ (searchEl))
    if (typeof w.focusInput === 'function') w.focusInput()
    else w.focus?.()
  }

  _ensureMenuPagesGlobalShortcuts () {
    if (this._menuPagesShortcutOnDoc) return
    document.addEventListener('keydown', this._onMenuPagesDocKeydown, true)
    this._menuPagesShortcutOnDoc = true
  }

  _teardownMenuPagesGlobalShortcuts () {
    if (!this._menuPagesShortcutOnDoc) return
    document.removeEventListener('keydown', this._onMenuPagesDocKeydown, true)
    this._menuPagesShortcutOnDoc = false
  }

  /**
   * @param {KeyboardEvent} e
   */
  _onMenuPagesDocKeydown (e) {
    if (e.defaultPrevented) return
    if (e.isComposing) return
    const body = this.shadowRoot?.getElementById('panel-body')
    const searchEl = body?.querySelector('#portal-menu-search')
    if (!(searchEl instanceof HTMLElement)) return

    const path = e.composedPath()
    const inMenuSearch = path.some(n => n instanceof Element && n.id === 'portal-menu-search')
    if (inMenuSearch) return

    const path0 = path[0]
    if (
      path0 instanceof HTMLInputElement ||
      path0 instanceof HTMLTextAreaElement ||
      path0 instanceof HTMLSelectElement ||
      (path0 instanceof HTMLElement && path0.isContentEditable)
    ) {
      return
    }

    const isAltS = e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 's' || e.key === 'S')
    const isSlash = e.key === '/'
    if (!isAltS && !isSlash) return

    e.preventDefault()
    e.stopPropagation()
    this._focusMenuPagesSearchInput(searchEl)
  }

  /**
   * 在 panel-body 上委托监听：避免 `ui5-input` 的 `value` 用 `'value' in` 误判、
   * noConflict 时仅 `ui5-input` 事件、以及 innerHTML 更新后闭包仍引用旧 sideNav。
   * @param {HTMLElement} body
   */
  _bindMenuPagesSearch (body) {
    if (body.dataset.portalMenuSearchBound === '1') return
    body.dataset.portalMenuSearchBound = '1'
    const apply = () => {
      const sideNav = body.querySelector('#portal-menu-side-nav')
      if (!(sideNav instanceof HTMLElement)) return
      const inpEl = body.querySelector('#portal-menu-search')
      if (!inpEl) return
      const v = String((/** @type {{ value?: unknown }} */ (inpEl)).value ?? '')
      this._menuPagesSearchQuery = v
      buildExplorerSideNavigation(sideNav, this._getMenuPagesDisplayItems(), {
        highlightQuery: this._menuPagesSearchQuery,
      })
    }
    /** @param {Event} e */
    const onMenuSearchInput = (e) => {
      const t = e.target
      if (!(t instanceof Element) || t.id !== 'portal-menu-search') return
      apply()
    }
    body.addEventListener('input', onMenuSearchInput, true)
    body.addEventListener('ui5-input', onMenuSearchInput, true)
    body.addEventListener('change', onMenuSearchInput, true)
  }

  async _loadMenuPagesMenu (menuKey) {
    const body = this.shadowRoot.getElementById('panel-body')
    if (!body) return
    const strip = body.querySelector('#portal-menu-strip')
    const busy = body.querySelector('#portal-menu-busy')
    let sideNav = body.querySelector('#portal-menu-side-nav')
    if (!(sideNav instanceof HTMLElement)) return
    const myGen = ++this._menuPagesLoadGen
    this._menuPagesBaseItems = null
    this._menuPagesSearchQuery = ''
    if (strip) {
      strip.hidden = true
      strip.textContent = ''
    }
    if (busy && 'active' in busy) /** @type {{ active: boolean }} */ (busy).active = true
    try {
      const raw = await fetchExplorerMenu(this._menuPagesUrl(menuKey))
      if (myGen !== this._menuPagesLoadGen) return
      sideNav = body.querySelector('#portal-menu-side-nav')
      if (!(sideNav instanceof HTMLElement) || !sideNav.isConnected) return
      const ctx = getExplorerMenuPermissionContext()
      const items = filterExplorerMenuTree(raw, ctx)
      this._menuPagesBaseItems = items
      const searchEl = body.querySelector('#portal-menu-search')
      if (searchEl) /** @type {{ value?: string }} */ (/** @type {unknown} */ (searchEl)).value = ''
      buildExplorerSideNavigation(sideNav, this._getMenuPagesDisplayItems(), {
        highlightQuery: this._menuPagesSearchQuery,
      })
      this._wireMenuPagesSideNav(sideNav)
      this._bindMenuPagesSearch(body)
      this._ensureMenuPagesGlobalShortcuts()
      if (this._workspaceExplorerSpec) {
        this.setWorkspaceExplorer(this._workspaceExplorerSpec)
      }
    } catch (err) {
      if (myGen !== this._menuPagesLoadGen) return
      const msg = err instanceof Error ? err.message : String(err)
      if (strip) {
        strip.textContent = msg
        strip.hidden = false
      }
      const snErr = body.querySelector('#portal-menu-side-nav')
      if (snErr instanceof HTMLElement) snErr.replaceChildren()
    } finally {
      if (busy && 'active' in busy) /** @type {{ active: boolean }} */ (busy).active = false
    }
  }

  /** @param {HTMLElement} sideNav */
  _wireMenuPagesSideNav (sideNav) {
    if (sideNav.dataset.portalMenuPagesSelectionWired === '1') return
    sideNav.dataset.portalMenuPagesSelectionWired = '1'
    sideNav.addEventListener('selection-change', (e) => {
      const item = e.detail?.item
      const payload = getExplorerMenuPayloadForItem(item)
      this.dispatchEvent(new CustomEvent('nav-selection', {
        bubbles: true,
        composed: true,
        detail: {
          view: this._view,
          text: item?.text,
          menu: payload ? explorerMenuNodeSummary(payload) : null,
          item,
        },
      }))
    })
  }

  /** 内置模板里若含 ui5-side-navigation，绑定占位 selection-change */
  _wireBuiltInSideNavIfAny (body) {
    const sideNav = body.querySelector('ui5-side-navigation')
    if (!sideNav) return
    sideNav.addEventListener('selection-change', (e) => {
      this.dispatchEvent(new CustomEvent('nav-selection', {
        bubbles: true,
        composed: true,
        detail: { text: e.detail?.item?.text, view: this._view, menu: null, item: e.detail?.item },
      }))
    })
  }

  _renderView () {
    const body = this.shadowRoot.getElementById('panel-body')
    if (!body) return
    const spec = this._parseSideNavSpecFromAttrs()
    if (!spec) {
      this._teardownMenuPagesGlobalShortcuts()
      body.innerHTML = `<ui5-message-strip design="Negative" style="margin:8px;">未配置侧栏（缺少有效的 side-nav-spec）。</ui5-message-strip>`
      this._outerTabDefs = [{ id: 'main', text: '\u00A0' }]
      this._syncOuterTabStrip()
      return
    }
    if (spec.type === 'menu-pages') {
      this._menuPagesBaseItems = null
      this._menuPagesSearchQuery = ''
      body.innerHTML = MENU_PAGES_PANEL_HTML
      void this._loadMenuPagesMenu(spec.menu)
    } else if (spec.type === 'built-in') {
      this._teardownMenuPagesGlobalShortcuts()
      const tpl = BUILTIN_TEMPLATES[spec.template]
      body.innerHTML = tpl ? tpl.render() : ''
      this._wireBuiltInSideNavIfAny(body)
      if (this._workspaceExplorerSpec) {
        queueMicrotask(() => this.setWorkspaceExplorer(this._workspaceExplorerSpec))
      }
    }
    this._syncOuterTabStrip()
  }
}

customElements.define('portal-side-nav', PortalSideNav)
