import {
  PORTAL_TAB_OVERFLOW_STYLES,
  TAB_OVERFLOW_BTN_RESERVE,
  computeVisibleTabRange,
  hiddenTabIndices,
} from './tab-strip-overflow.js'
import {
  handleWorkspaceRegionTabBarClick,
  normalizeWorkspaceRegionViews,
  renderWorkspaceRegionViewsHtml,
  safeUi5IconName,
  workspaceRegionGroupLabel,
} from './workspace-node.js'

const WELCOME_CONTENT = `
  <div class="welcome-page">
    <div class="welcome-logo">
      <ui5-icon name="grid" style="width:64px;height:64px;color:var(--sapHighlightColor,#0070f2)"></ui5-icon>
    </div>
    <h1 class="welcome-title">CMX Enterprise Portal</h1>
    <p class="welcome-sub">统一门户管理平台</p>
    <div class="welcome-grid">
      <div class="welcome-card" data-action="new-page">
        <ui5-icon name="add" class="card-icon"></ui5-icon>
        <div class="card-label">新建页面</div>
        <div class="card-desc">创建一个新的门户页面</div>
      </div>
      <div class="welcome-card" data-action="open-designer">
        <ui5-icon name="edit" class="card-icon"></ui5-icon>
        <div class="card-label">打开设计器</div>
        <div class="card-desc">使用 CMX Form Designer 设计页面</div>
      </div>
      <div class="welcome-card" data-action="open-service">
        <ui5-icon name="world" class="card-icon"></ui5-icon>
        <div class="card-label">连接服务</div>
        <div class="card-desc">配置后端服务接口</div>
      </div>
      <div class="welcome-card" data-action="open-docs">
        <ui5-icon name="documents" class="card-icon"></ui5-icon>
        <div class="card-label">查看文档</div>
        <div class="card-desc">阅读开发指南与 API 文档</div>
      </div>
    </div>
  </div>
`

let _tabCounter = 0

export class PortalContentArea extends HTMLElement {
  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
    this._tabs = []
    /** @type {string|null} 右键菜单所针对的标签 id */
    this._contextTabId = null
    /** @type {ResizeObserver|null} */
    this._tabOverflowRo = null
    this._boundWorkspaceTabClick = (e) => handleWorkspaceRegionTabBarClick(e)
    /** @type {string|null} 待确认关闭的已修改标签 id */
    this._pendingDirtyCloseId = null
  }

  connectedCallback() {
    this._render()
    this._wireTabContextMenuRoot()
    this._wireTabOverflowRoot()
    if (!this.hasAttribute('no-welcome')) {
      this._addWelcomeTab()
    }
    const row = this.shadowRoot.getElementById('tab-bar-row')
    if (row) {
      this._tabOverflowRo = new ResizeObserver(() => this._layoutTabStripOverflow())
      this._tabOverflowRo.observe(row)
    }
    queueMicrotask(() => this._layoutTabStripOverflow())
    this.shadowRoot.addEventListener('click', this._boundWorkspaceTabClick)
    this._wireDirtyCloseDialog()
  }

  disconnectedCallback() {
    this.shadowRoot.removeEventListener('click', this._boundWorkspaceTabClick)
    this._tabOverflowRo?.disconnect()
    this._tabOverflowRo = null
  }

  /**
   * @param {{
   *   id?: string,
   *   text: string,
   *   icon?: string,
   *   content?: string,
   *   closeable?: boolean,
   *   dirty?: boolean,
   *   workspaceShell?: Record<string, unknown>|null,
   * }} opts
   * dirty === true 表示未保存；关闭「已保存」标签页时会跳过这些。
   * `workspaceShell`：仅含 `explorer`/`property`/`bottom` 的快照。`undefined` 表示未绑定：切换到此标签时会先清除三区域工作区签再保持默认。`null` 显式清除。非空对象由 `portal-app` 在激活时挂载并选中对应工作区签。
   * 各标签对右侧属性 / 底部面板的显隐由 {@link setTabWorkspaceDockOpen} 与宿主 `portal-app` 协同记录（`workspaceDockOpen`）。
   */
  addTab (opts) {
    const { id, text, icon, content, closeable = true, workspaceShell } = opts
    const hasDirtyOpt = Object.prototype.hasOwnProperty.call(opts, 'dirty')
    const dirtyValue = hasDirtyOpt ? !!opts.dirty : false
    const tabId = id || `tab-${++_tabCounter}`
    const existing = this._tabs.find(t => t.id === tabId)
    if (existing) {
      if (workspaceShell !== undefined) {
        if (workspaceShell !== existing.workspaceShell) {
          existing.workspaceMountRoots = undefined
        }
        existing.workspaceShell = workspaceShell === null ? null : workspaceShell
      }
      if (hasDirtyOpt) {
        existing.dirty = dirtyValue
        this._syncTabDirtyVisual(tabId)
      }
      this._selectTab(tabId)
      return tabId
    }
    this._tabs.push({
      id: tabId,
      text,
      icon,
      content,
      closeable,
      dirty: dirtyValue,
      workspaceShell: workspaceShell === undefined ? undefined : workspaceShell,
      /** @type {Partial<Record<'property'|'bottom', boolean>>|undefined} 显式偏好；未设置则宿主按 shell 默认显示 */
      workspaceDockOpen: undefined,
      /** @type {Partial<Record<'explorer'|'property'|'bottom', HTMLDivElement>>|undefined} 各区域视图根节点，仅创建一次 */
      workspaceMountRoots: undefined,
    })
    this._renderTabs()
    this._selectTab(tabId)
    return tabId
  }

  setTabDirty(id, dirty = true) {
    const t = this._tabs.find(x => x.id === id)
    if (t) {
      t.dirty = !!dirty
      this._syncTabDirtyVisual(id)
    }
  }

  getTabDirty(id) {
    return !!this._tabs.find(x => x.id === id)?.dirty
  }

  /** 是否存在「已修改」标签（刷新/关闭窗口前用于 beforeunload 提示）。 */
  hasAnyDirtyTab () {
    return this._tabs.some((t) => t.dirty)
  }

  /** 激活指定 id 的标签（若存在），并派发 `portal-content-tab-activate`。 */
  selectTabById (id) {
    if (this._tabs.some((t) => t.id === id)) {
      this._selectTab(id)
    }
  }

  /**
   * 供宿主同步属性/底部 dock：当前激活标签绑定的 `workspaceShell`。
   * @returns {Record<string, unknown>|null|undefined}
   */
  getActiveWorkspaceShell () {
    const tab = this._tabs.find((t) => t.id === this._activeTab)
    return tab ? tab.workspaceShell : undefined
  }

  /** @returns {string|undefined} */
  getActiveTabId () {
    return this._activeTab
  }

  /**
   * 当前标签对属性 / 底部 dock 的显隐偏好（供 `portal-app` 在切换标签时恢复布局）。
   * @param {string} tabId
   * @returns {Partial<Record<'property'|'bottom', boolean>>|undefined}
   */
  getTabWorkspaceDockOpen (tabId) {
    const t = this._tabs.find((x) => x.id === tabId)
    const o = t?.workspaceDockOpen
    return o && typeof o === 'object' ? { ...o } : undefined
  }

  /**
   * @param {string} tabId
   * @param {Partial<Record<'property'|'bottom', boolean>>} partial `false`：用户已关闭该区域 dock；`true`：强制显示（在 shell 含该区域视图时生效）。
   */
  setTabWorkspaceDockOpen (tabId, partial) {
    const t = this._tabs.find((x) => x.id === tabId)
    if (!t || !partial || typeof partial !== 'object') return
    t.workspaceDockOpen = { ...(t.workspaceDockOpen || {}), ...partial }
  }

  /**
   * 供 `portal-app`：按当前 Content 标签的 `workspaceShell` 取出或首次创建各区域缓存根节点（切换时由面板 `appendChild` 移动挂载）。
   * @param {string} tabId
   * @returns {Partial<Record<'explorer'|'property'|'bottom', HTMLDivElement>>}
   */
  takeWorkspaceMountsForTab (tabId) {
    const tab = this._tabs.find((t) => t.id === tabId)
    if (!tab?.workspaceShell || typeof tab.workspaceShell !== 'object') return {}
    const sh = tab.workspaceShell
    /** @type {Partial<Record<'explorer'|'property'|'bottom', HTMLDivElement>>} */
    const mounts = {}
    for (const region of ['explorer', 'property', 'bottom']) {
      if (!Object.prototype.hasOwnProperty.call(sh, region)) continue
      const spec = sh[region]
      if (spec == null || (typeof spec === 'object' && spec !== null && Object.keys(spec).length === 0)) continue
      const views = normalizeWorkspaceRegionViews(
        /** @type {import('../lib/workspace-node.js').WorkspaceRegionViewsInput} */ (spec),
      )
      if (!views.length) continue
      mounts[region] = this._ensureWorkspaceMountRoot(
        tab,
        region,
        /** @type {import('../lib/workspace-node.js').WorkspaceRegionViewsInput} */ (spec),
      )
    }
    return mounts
  }

  /**
   * @param {{ id: string, workspaceShell?: unknown, workspaceMountRoots?: Partial<Record<string, HTMLDivElement>> }} tab
   * @param {'explorer'|'property'|'bottom'} region
   * @param {import('../lib/workspace-node.js').WorkspaceRegionViewsInput} spec
   */
  _ensureWorkspaceMountRoot (tab, region, spec) {
    if (!tab.workspaceMountRoots) tab.workspaceMountRoots = {}
    let root = tab.workspaceMountRoots[region]
    if (!root) {
      root = document.createElement('div')
      root.className = 'cmx-ws-tab-cache-root'
      root.dataset.cmxWsCacheRegion = region
      root.innerHTML = renderWorkspaceRegionViewsHtml(region, spec)
      tab.workspaceMountRoots[region] = root
    }
    this._syncWorkspaceCacheRootLayout(root)
    return root
  }

  /**
   * 缓存根作为各面板 flex 子项须占满剩余高度；内层 `.cmx-ws-region` 依赖 `height:100%` 才能撑开。
   * @param {HTMLDivElement} root
   */
  _syncWorkspaceCacheRootLayout (root) {
    root.style.boxSizing = 'border-box'
    root.style.display = 'flex'
    root.style.flexDirection = 'column'
    root.style.flex = '1 1 auto'
    root.style.minHeight = '0'
    root.style.minWidth = '0'
    root.style.width = '100%'
    root.style.alignSelf = 'stretch'
    root.style.overflow = 'hidden'
  }

  /** @param {string} tabId */
  _disposeWorkspaceMountsForTab (tabId) {
    const tab = this._tabs.find((t) => t.id === tabId)
    const roots = tab?.workspaceMountRoots
    if (!roots) return
    for (const k of Object.keys(roots)) {
      const el = roots[k]
      el?.remove()
    }
    tab.workspaceMountRoots = undefined
  }

  _addWelcomeTab() {
    this.addTab({ id: 'welcome', text: '欢迎', icon: 'home', content: WELCOME_CONTENT, closeable: false, dirty: false })
  }

  _render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow: hidden;
          background: var(--sapBackgroundColor, #f5f6f7);
        }
        .tab-bar-row {
          --portal-tab-row-bg: var(--sapObjectHeader_Background, #fff);
          display: flex;
          flex-direction: row;
          align-items: stretch;
          flex-shrink: 0;
          height: 35px;
          min-width: 0;
          background: var(--portal-tab-row-bg);
          border-bottom: 1px solid var(--sapGroup_TitleBorderColor, #ddd);
        }
        .tab-bar-strip {
          flex: 1 1 auto;
          min-width: 0;
          overflow: hidden;
          display: flex;
          align-items: stretch;
        }
        ${PORTAL_TAB_OVERFLOW_STYLES}
        .tab-item {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 0 12px;
          cursor: pointer;
          font-size: 13px;
          color: var(--sapContent_LabelColor, #6a6d70);
          border-right: 1px solid var(--sapGroup_TitleBorderColor, #eee);
          white-space: nowrap;
          position: relative;
          user-select: none;
          min-width: 80px;
        }
        .tab-item:hover { background: var(--sapHoverColor, #f0f0f0); color: var(--sapTextColor, #333); }
        .tab-item.active {
          color: var(--sapTextColor, #333);
          background: var(--sapBackgroundColor, #f5f6f7);
          border-bottom: 2px solid var(--sapHighlightColor, #0070f2);
        }
        .tab-item ui5-icon { width: 14px; height: 14px; flex-shrink: 0; }
        .tab-icon-stack {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 18px;
          height: 18px;
          flex-shrink: 0;
        }
        .tab-icon-stack > ui5-icon { width: 14px; height: 14px; }
        .tab-dirty-dlg-body {
          padding: 16px 20px;
          font-size: 14px;
          line-height: 1.5;
          color: var(--sapTextColor, #333);
          max-width: 28rem;
        }
        .tab-dirty-dlg-footer {
          display: flex;
          justify-content: flex-end;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .tab-close {
          width: 16px;
          height: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 3px;
          margin-left: 4px;
          opacity: 0.55;
          flex-shrink: 0;
          position: relative;
        }
        .tab-close:hover { background: rgba(0,0,0,0.12); opacity: 1; }
        .tab-close-inner {
          position: relative;
          width: 16px;
          height: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        /* VS Code 风格：已修改时默认显示圆点，悬停整条标签时再显示关闭 X */
        .tab-close-dot {
          position: absolute;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--sapTextColor, #32363a);
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.06s ease;
        }
        .tab-item.is-dirty .tab-close-dot {
          opacity: 0.92;
        }
        .tab-close-x {
          opacity: 1;
          transition: opacity 0.06s ease;
        }
        .tab-item.is-dirty .tab-close-x {
          opacity: 0;
          pointer-events: none;
        }
        .tab-item.is-dirty:hover .tab-close-dot {
          opacity: 0;
        }
        .tab-item.is-dirty:hover .tab-close-x {
          opacity: 1;
          pointer-events: auto;
        }
        .tab-close ui5-icon.tab-close-x { width: 12px; height: 12px; }
        .tab-body {
          flex: 1 1 auto;
          overflow: auto;
          position: relative;
        }
        .tab-pane {
          display: none;
          height: 100%;
          min-height: 0;
          overflow: auto;
        }
        .tab-pane.active {
          display: flex;
          flex-direction: column;
        }

        /* Welcome page styles */
        .welcome-page {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 48px 24px;
          gap: 16px;
          min-height: 100%;
        }
        .welcome-logo { margin-bottom: 8px; }
        .welcome-title {
          font-size: 28px;
          font-weight: 300;
          color: var(--sapTextColor, #333);
        }
        .welcome-sub {
          font-size: 14px;
          color: var(--sapContent_LabelColor, #6a6d70);
          margin-bottom: 16px;
        }
        .welcome-grid {
          display: grid;
          grid-template-columns: repeat(2, 200px);
          gap: 16px;
        }
        .welcome-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          padding: 20px 16px;
          background: var(--sapObjectHeader_Background, #fff);
          border: 1px solid var(--sapGroup_TitleBorderColor, #ddd);
          border-radius: 8px;
          cursor: pointer;
          transition: box-shadow 0.15s, border-color 0.15s;
          text-align: center;
        }
        .welcome-card:hover {
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
          border-color: var(--sapHighlightColor, #0070f2);
        }
        .card-icon { width: 32px; height: 32px; color: var(--sapHighlightColor, #0070f2); }
        .card-label { font-size: 13px; font-weight: 600; color: var(--sapTextColor, #333); }
        .card-desc { font-size: 12px; color: var(--sapContent_LabelColor, #6a6d70); }
      </style>
      <div class="tab-bar-row" id="tab-bar-row">
        <div class="tab-bar-strip" id="tab-bar-strip"></div>
        <div class="portal-tab-overflow-wrap" id="tab-bar-overflow-wrap" style="display:none">
          <button type="button" class="portal-tab-overflow-trigger" id="tab-bar-overflow-btn" aria-label="更多标签" title="更多标签">
            <ui5-icon name="slim-arrow-down"></ui5-icon>
          </button>
        </div>
      </div>
      <div class="tab-body" id="tab-body"></div>
      <ui5-menu id="tab-overflow-menu" horizontal-align="End"></ui5-menu>
      <ui5-menu id="tab-ctx-menu" horizontal-align="End">
        <ui5-menu-item id="ctx-m-close" text="关闭" icon="decline" data-action="close"></ui5-menu-item>
        <ui5-menu-separator></ui5-menu-separator>
        <ui5-menu-item id="ctx-m-close-others" text="关闭其他" icon="duplicate" data-action="close-others"></ui5-menu-item>
        <ui5-menu-item id="ctx-m-close-left" text="关闭左侧" icon="navigation-left-arrow" data-action="close-left"></ui5-menu-item>
        <ui5-menu-item id="ctx-m-close-right" text="关闭右侧" icon="navigation-right-arrow" data-action="close-right"></ui5-menu-item>
        <ui5-menu-separator></ui5-menu-separator>
        <ui5-menu-item id="ctx-m-close-saved" text="关闭已保存" icon="accept" data-action="close-saved"></ui5-menu-item>
        <ui5-menu-item id="ctx-m-close-all" text="关闭全部" icon="clear-all" data-action="close-all"></ui5-menu-item>
      </ui5-menu>
      <ui5-dialog id="tab-dirty-close-dialog" header-text="关闭标签">
        <div class="tab-dirty-dlg-body">当前标签内容已修改。是否保存后再关闭？</div>
        <div slot="footer" class="tab-dirty-dlg-footer">
          <ui5-button id="dirty-close-cancel" design="Transparent">取消</ui5-button>
          <ui5-button id="dirty-close-discard" design="Negative">不保存</ui5-button>
          <ui5-button id="dirty-close-save" design="Emphasized" icon="save">保存并关闭</ui5-button>
        </div>
      </ui5-dialog>
    `
  }

  _wireDirtyCloseDialog () {
    const dlg = this.shadowRoot.getElementById('tab-dirty-close-dialog')
    if (!dlg || dlg.dataset.cmxDirtyDlgWired === '1') return
    dlg.dataset.cmxDirtyDlgWired = '1'
    dlg.addEventListener('close', () => {
      this._pendingDirtyCloseId = null
    })
    const cancel = () => {
      dlg.open = false
      this._pendingDirtyCloseId = null
    }
    this.shadowRoot.getElementById('dirty-close-cancel')?.addEventListener('click', cancel)
    this.shadowRoot.getElementById('dirty-close-discard')?.addEventListener('click', () => {
      const id = this._pendingDirtyCloseId
      cancel()
      if (id) this._closeTabDirect(id)
    })
    this.shadowRoot.getElementById('dirty-close-save')?.addEventListener('click', () => {
      const id = this._pendingDirtyCloseId
      cancel()
      if (!id) return
      this.dispatchEvent(new CustomEvent('portal-content-tab-save-request', {
        bubbles: true,
        composed: true,
        detail: { tabId: id },
      }))
      this.setTabDirty(id, false)
      this._closeTabDirect(id)
    })
  }

  /**
   * 根据 `dirty` 刷新标签行（圆点 / X，不重建整个标签条）。
   * @param {string} id
   */
  _syncTabDirtyVisual (id) {
    const tab = this._tabs.find((t) => t.id === id)
    const item = [...this.shadowRoot.querySelectorAll('.tab-item')].find((el) => el.dataset.id === id)
    if (!tab || !item) return
    item.classList.toggle('is-dirty', !!tab.dirty)
    const closeEl = item.querySelector('.tab-close')
    if (closeEl) {
      closeEl.title = tab.dirty ? '已修改（悬停标签可显示关闭）' : '关闭'
    }
  }

  _wireTabContextMenuRoot() {
    const menu = this.shadowRoot.getElementById('tab-ctx-menu')
    if (!menu) return
    menu.addEventListener('item-click', (e) => {
      const item = e.detail?.item
      const action = item?.getAttribute?.('data-action') || item?.dataset?.action
      if (action === 'ws-focus') {
        const region = item?.getAttribute?.('data-region') || item?.dataset?.region
        const viewIndex = parseInt(String(item?.getAttribute?.('data-view-index') ?? item?.dataset?.viewIndex ?? '0'), 10)
        const tabId = item?.getAttribute?.('data-context-tab-id') || item?.dataset?.contextTabId
        if (region === 'explorer' || region === 'property' || region === 'bottom') {
          this.dispatchEvent(new CustomEvent('portal-workspace-view-focus', {
            bubbles: true,
            composed: true,
            detail: { tabId, region, viewIndex: Number.isNaN(viewIndex) ? 0 : viewIndex },
          }))
        }
        menu.open = false
        return
      }
      if (!action) return
      this._runTabContextAction(action)
      menu.open = false
    })
    menu.addEventListener('close', () => {
      this._contextTabId = null
    })
  }

  _wireTabOverflowRoot () {
    const menu = this.shadowRoot.getElementById('tab-overflow-menu')
    const btn = this.shadowRoot.getElementById('tab-bar-overflow-btn')
    if (menu && !menu.dataset.portalOverflowBound) {
      menu.dataset.portalOverflowBound = '1'
      menu.addEventListener('item-click', (e) => {
        const item = e.detail?.item
        const tid = item?.getAttribute?.('data-tab-id') || item?.dataset?.tabId
        if (tid) {
          this._selectTab(tid)
          menu.open = false
        }
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

  _layoutTabStripOverflow () {
    const row = this.shadowRoot.getElementById('tab-bar-row')
    const strip = this.shadowRoot.getElementById('tab-bar-strip')
    const wrap = this.shadowRoot.getElementById('tab-bar-overflow-wrap')
    const btn = this.shadowRoot.getElementById('tab-bar-overflow-btn')
    const menu = this.shadowRoot.getElementById('tab-overflow-menu')
    if (!row || !strip || !wrap || !btn || !menu) return
    const items = [...strip.querySelectorAll('.tab-item')]
    if (!items.length) {
      wrap.style.display = 'none'
      return
    }
    items.forEach((el) => {
      el.style.display = 'flex'
      el.style.flexShrink = '0'
    })
    const widths = items.map((el) => el.getBoundingClientRect().width)
    const ai = this._tabs.findIndex(t => t.id === this._activeTab)
    const activeIdx = ai >= 0 ? ai : 0
    const { start, end, needsOverflow } = computeVisibleTabRange(
      widths,
      activeIdx === -1 ? 0 : activeIdx,
      row.clientWidth,
      TAB_OVERFLOW_BTN_RESERVE
    )
    for (let i = 0; i < items.length; i++) {
      items[i].style.display = i >= start && i < end ? 'flex' : 'none'
    }
    wrap.style.display = needsOverflow ? '' : 'none'
    while (menu.firstChild) menu.removeChild(menu.firstChild)
    if (needsOverflow) {
      const hidden = hiddenTabIndices(this._tabs.length, start, end)
      for (const i of hidden) {
        const tab = this._tabs[i]
        if (!tab) continue
        const mi = document.createElement('ui5-menu-item')
        mi.setAttribute('text', tab.text)
        mi.setAttribute('icon', safeUi5IconName(tab.icon))
        mi.setAttribute('data-tab-id', tab.id)
        menu.appendChild(mi)
      }
    }
  }

  _tabIndex(id) {
    return this._tabs.findIndex(t => t.id === id)
  }

  _updateContextMenuState() {
    const id = this._contextTabId
    const idx = id == null ? -1 : this._tabIndex(id)
    const tab = idx >= 0 ? this._tabs[idx] : null

    const closeableLeft = idx > 0 && this._tabs.slice(0, idx).some(t => t.closeable)
    const closeableRight = idx >= 0 && idx < this._tabs.length - 1 && this._tabs.slice(idx + 1).some(t => t.closeable)
    const otherCloseable = this._tabs.some(t => t.closeable && t.id !== id)
    const anySavedCloseable = this._tabs.some(t => t.closeable && !t.dirty)
    const anyCloseable = this._tabs.some(t => t.closeable)

    const setDis = (menuId, dis) => {
      const el = this.shadowRoot.getElementById(menuId)
      if (el) el.disabled = dis
    }

    setDis('ctx-m-close', !tab?.closeable)
    setDis('ctx-m-close-others', idx < 0 || !otherCloseable)
    setDis('ctx-m-close-left', !tab || !closeableLeft)
    setDis('ctx-m-close-right', !tab || !closeableRight)
    setDis('ctx-m-close-saved', !anySavedCloseable)
    setDis('ctx-m-close-all', !anyCloseable)

    this._rebuildTabContextWorkspaceMenu(tab)
  }

  /**
   * 在「关闭」与后续关闭操作之间插入「视图」子菜单（按 explorer / property / bottom，无视图不建项）。
   * @param {{ id: string, workspaceShell?: Record<string, unknown>|null|undefined }|null|undefined} tab
   */
  _rebuildTabContextWorkspaceMenu (tab) {
    const menu = this.shadowRoot.getElementById('tab-ctx-menu')
    if (!menu) return
    menu.querySelector('[data-cmx-ws-ctx="views-root"]')?.remove()

    const shell = tab && typeof tab.workspaceShell === 'object' && tab.workspaceShell != null
      ? /** @type {Record<string, unknown>} */ (tab.workspaceShell)
      : null
    if (!shell) return

    /** @type {('explorer'|'property'|'bottom')[]} */
    const regions = ['explorer', 'property', 'bottom']
    let hasAny = false
    for (const reg of regions) {
      if (normalizeWorkspaceRegionViews(shell[reg]).length) {
        hasAny = true
        break
      }
    }
    if (!hasAny) return

    const closeMi = menu.querySelector('#ctx-m-close')
    if (!closeMi) return

    const viewsRoot = document.createElement('ui5-menu-item')
    viewsRoot.setAttribute('text', '视图')
    viewsRoot.setAttribute('icon', 'detail-view')
    viewsRoot.setAttribute('data-cmx-ws-ctx', 'views-root')

    let firstRegion = true
    for (const reg of regions) {
      const views = normalizeWorkspaceRegionViews(shell[reg])
      if (!views.length) continue
      if (!firstRegion) {
        const sep = document.createElement('ui5-menu-separator')
        viewsRoot.appendChild(sep)
      }
      firstRegion = false
      const title = workspaceRegionGroupLabel(shell[reg], reg)
      views.forEach((v, i) => {
        const lab = String(v.tabLabel || '').trim() || `视图 ${i + 1}`
        const leaf = document.createElement('ui5-menu-item')
        leaf.setAttribute('text', `${title} · ${lab}`)
        const icRaw =
          v && typeof v === 'object' && v.icon != null && String(v.icon).trim() !== ''
            ? String(v.icon).trim()
            : 'detail-view'
        leaf.setAttribute('icon', safeUi5IconName(icRaw))
        leaf.setAttribute('data-action', 'ws-focus')
        leaf.setAttribute('data-region', reg)
        leaf.setAttribute('data-view-index', String(i))
        leaf.setAttribute('data-context-tab-id', String(tab.id))
        viewsRoot.appendChild(leaf)
      })
    }

    menu.insertBefore(viewsRoot, closeMi.nextSibling)
  }

  /**
   * 使用当前标签行作为 opener，避免 1×1 隐形锚点 getBoundingClientRect 异常
   * 触发 Popover.isOpenerOutsideViewport 导致菜单立刻关闭。
   */
  _openTabContextMenu(tabId, openerEl) {
    this._contextTabId = tabId
    this._updateContextMenuState()
    const menu = this.shadowRoot.getElementById('tab-ctx-menu')
    if (!menu || !openerEl) return
    menu.opener = openerEl
    menu.open = true
  }

  _runTabContextAction(action) {
    const id = this._contextTabId
    if (id == null) return
    const idx = this._tabIndex(id)
    if (idx < 0) return

    if (action === 'close') {
      this._requestCloseTab(id)
      return
    }

    if (action === 'close-others') {
      const remove = this._tabs.filter(t => t.closeable && t.id !== id).map(t => t.id)
      this._removeTabIds(remove)
      return
    }

    if (action === 'close-left') {
      const remove = this._tabs.slice(0, idx).filter(t => t.closeable).map(t => t.id)
      this._removeTabIds(remove)
      return
    }

    if (action === 'close-right') {
      const remove = this._tabs.slice(idx + 1).filter(t => t.closeable).map(t => t.id)
      this._removeTabIds(remove)
      return
    }

    if (action === 'close-saved') {
      const remove = this._tabs.filter(t => t.closeable && !t.dirty).map(t => t.id)
      this._removeTabIds(remove)
      return
    }

    if (action === 'close-all') {
      const remove = this._tabs.filter(t => t.closeable).map(t => t.id)
      this._removeTabIds(remove)
    }
  }

  /** @param {string[]} ids */
  _removeTabIds(ids) {
    if (!ids.length) return
    const dirtyToClose = ids.filter((id) => {
      const t = this._tabs.find((x) => x.id === id)
      return !!(t?.closeable && t.dirty)
    })
    if (dirtyToClose.length) {
      const ok = window.confirm(
        `将关闭 ${dirtyToClose.length} 个含未保存修改的标签，确定不保存并关闭吗？`
      )
      if (!ok) return
    }
    for (const id of ids) {
      this._disposeWorkspaceMountsForTab(id)
    }
    const idSet = new Set(ids)
    const prevActive = this._activeTab
    const wasIdx = this._tabIndex(prevActive)
    this._tabs = this._tabs.filter(t => !idSet.has(t.id))
    if (!this._tabs.length) {
      this._activeTab = undefined
    } else if (idSet.has(prevActive)) {
      const ni = Math.min(wasIdx, this._tabs.length - 1)
      this._activeTab = this._tabs[Math.max(0, ni)]?.id
    }
    this._renderTabs()
    this._notifyTabActivate()
  }

  _renderTabs() {
    const strip = this.shadowRoot.getElementById('tab-bar-strip')
    const body = this.shadowRoot.getElementById('tab-body')
    if (!strip || !body) return
    strip.innerHTML = ''
    body.innerHTML = ''
    // debug.html 等多页场景：`cmx-html-pages-*` 用 `__cmxTemplateRoot` 查 `#cmx-page-template-*`。
    // 清空 tab-body 后若仍指向已脱离文档的旧 pane，重建时 connectedCallback 会取错模板 → Shadow 为空。
    if (typeof globalThis !== 'undefined') {
      globalThis.__cmxTemplateRoot = null
    }

    for (const tab of this._tabs) {
      const item = document.createElement('div')
      item.className = 'tab-item' + (tab.dirty ? ' is-dirty' : '')
      item.dataset.id = tab.id
      const closeTitle = tab.dirty ? '已修改（悬停标签可显示关闭）' : '关闭'
      item.innerHTML = `
        <span class="tab-icon-stack"><ui5-icon name="${safeUi5IconName(tab.icon)}"></ui5-icon></span>
        <span>${tab.text}</span>
        ${tab.closeable ? `<span class="tab-close" data-close="${tab.id}" title="${closeTitle}"><span class="tab-close-inner"><span class="tab-close-dot" aria-hidden="true"></span><ui5-icon class="tab-close-x" name="decline"></ui5-icon></span></span>` : ''}
      `
      item.addEventListener('click', e => {
        if (e.target.closest('[data-close]')) return
        this._selectTab(tab.id)
      })
      item.addEventListener('contextmenu', e => {
        if (e.target.closest('[data-close]')) return
        e.preventDefault()
        this._openTabContextMenu(tab.id, item)
      })
      const closeBtn = item.querySelector('[data-close]')
      if (closeBtn) closeBtn.addEventListener('click', () => this._requestCloseTab(tab.id))
      strip.appendChild(item)

      const pane = document.createElement('div')
      pane.className = 'tab-pane'
      pane.dataset.id = tab.id
      pane.dataset.cmxWorkspaceId = 'tab:' + String(tab.id)
      if (typeof globalThis !== 'undefined') {
        globalThis.__cmxTemplateRoot = pane
      }
      pane.innerHTML = tab.content || ''
      body.appendChild(pane)
    }
    this._refreshActive()
    queueMicrotask(() => this._layoutTabStripOverflow())
  }

  _selectTab(id) {
    this._activeTab = id
    this._refreshActive()
    this._notifyTabActivate()
    queueMicrotask(() => this._layoutTabStripOverflow())
  }

  _notifyTabActivate () {
    const tab = this._tabs.find(t => t.id === this._activeTab)
    this.dispatchEvent(new CustomEvent('portal-content-tab-activate', {
      bubbles: true,
      composed: true,
      detail: {
        tabId: this._activeTab,
        workspaceShell: tab ? tab.workspaceShell : undefined,
      },
    }))
  }

  /**
   * 请求关闭标签：若已修改则弹出对话框，否则直接关闭。
   * @param {string} id
   */
  _requestCloseTab (id) {
    const t = this._tabs.find((x) => x.id === id)
    if (!t?.closeable) return
    if (t.dirty) {
      this._pendingDirtyCloseId = id
      const dlg = this.shadowRoot.getElementById('tab-dirty-close-dialog')
      if (dlg) dlg.open = true
      else this._closeTabDirect(id)
      return
    }
    this._closeTabDirect(id)
  }

  /** 直接移除标签（不校验 dirty）。 */
  _closeTabDirect (id) {
    const t = this._tabs.find((x) => x.id === id)
    if (!t?.closeable) return
    this._disposeWorkspaceMountsForTab(id)
    const idx = this._tabs.findIndex((x) => x.id === id)
    this._tabs.splice(idx, 1)
    if (this._activeTab === id) {
      this._activeTab = this._tabs[Math.min(idx, this._tabs.length - 1)]?.id
    }
    this._renderTabs()
    this._notifyTabActivate()
  }

  _refreshActive() {
    this.shadowRoot.querySelectorAll('.tab-item').forEach(el => {
      el.classList.toggle('active', el.dataset.id === this._activeTab)
    })
    this.shadowRoot.querySelectorAll('.tab-pane').forEach(el => {
      el.classList.toggle('active', el.dataset.id === this._activeTab)
    })
  }
}

customElements.define('portal-content-area', PortalContentArea)
