import { handleWorkspaceRegionTabBarClick } from '../lib/workspace-node.js'
import { createContentAreaTemplate } from './portal-content-area-shell.js'
import { syncContentEmptyState, wireContentEmptyState } from '../lib/portal-content-empty-state.js'
import * as Overflow from './portal-content-area-overflow.js'
import * as Workspace from './portal-content-area-workspace.js'
import * as TabMenu from './portal-content-area-tab-menu.js'
import * as Tabs from './portal-content-area-tabs.js'

export class PortalContentArea extends HTMLElement {
  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
    this._tabs = []
    /** @type {string|undefined} */
    this._activeTab = undefined
    /** @type {string|null} */
    this._contextTabId = null
    /** @type {ResizeObserver|null} */
    this._tabOverflowRo = null
    this._boundWorkspaceTabClick = (e) => handleWorkspaceRegionTabBarClick(e)
    /** @type {string|null} */
    this._pendingDirtyCloseId = null
    /** @type {boolean|undefined} */
    this._suppressNextCtxMenuClose = false
    /** @type {(() => void)|null|undefined} */
    this._ctxMenuUnwire = null
  }

  connectedCallback() {
    this._render()
    this._wireTabContextMenuRoot()
    this._wireTabOverflowRoot()
    /* 启动 auto-open 欢迎页已交给 portal-app.connectedCallback 统一调度
       （Workspace.openWorkspaceNode + PORTAL_WELCOME_MENU_NODE），与点菜单 / 点 shellbar home
       走同一条链路；这里不再有 special-case _addWelcomeTab。 */
    const row = this.shadowRoot.getElementById('tab-bar-row')
    if (row) {
      this._tabOverflowRo = new ResizeObserver(() => this._layoutTabStripOverflow())
      this._tabOverflowRo.observe(row)
    }
    queueMicrotask(() => this._layoutTabStripOverflow())
    this.shadowRoot.addEventListener('click', this._boundWorkspaceTabClick)
    this._wireDirtyCloseDialog()
    this._wireWorkspaceDnd()
    this._wireWorkspaceCtxMenu()
    wireContentEmptyState(this)
    syncContentEmptyState(this)
  }

  disconnectedCallback() {
    this.shadowRoot.removeEventListener('click', this._boundWorkspaceTabClick)
    this._tabOverflowRo?.disconnect()
    this._tabOverflowRo = null
    this._ctxMenuUnwire?.()
    this._ctxMenuUnwire = null
  }

  _wireWorkspaceDnd () {
    Workspace.wireWorkspaceDnd(this)
  }

  _wireWorkspaceCtxMenu () {
    Workspace.wireWorkspaceCtxMenu(this)
  }

  /** 刷新指定 tab（缺省为当前活动 tab）：html_pages 重新拉取 + native_pages 清缓存重载 + 重建 pane。
   *  供右键菜单「刷新页面」与其它内部调用复用。 */
  async _refreshActiveTab (tabId) {
    return Tabs.refreshActiveTab(this, tabId)
  }

  addTab (opts) {
    return Tabs.addTab(this, opts)
  }

  setTabDirty(id, dirty = true) {
    Tabs.setTabDirty(this, id, dirty)
  }

  getTabDirty(id) {
    return Tabs.getTabDirty(this, id)
  }

  hasAnyDirtyTab () {
    return Tabs.hasAnyDirtyTab(this)
  }

  selectTabById (id) {
    Tabs.selectTabById(this, id)
  }

  getActiveWorkspaceShell () {
    const tab = this._tabs.find((t) => t.id === this._activeTab)
    return tab ? tab.workspaceShell : undefined
  }

  getActiveTabId () {
    return this._activeTab
  }

  getTabHeader (tabId) {
    const t = this._tabs.find((x) => x.id === tabId)
    if (!t) return undefined
    return { text: String(t.text ?? ''), icon: String(t.icon ?? '') }
  }

  getTabWorkspaceDockOpen (tabId) {
    const t = this._tabs.find((x) => x.id === tabId)
    const o = t?.workspaceDockOpen
    return o && typeof o === 'object' ? { ...o } : undefined
  }

  setTabWorkspaceDockOpen (tabId, partial) {
    const t = this._tabs.find((x) => x.id === tabId)
    if (!t || !partial || typeof partial !== 'object') return
    t.workspaceDockOpen = { ...(t.workspaceDockOpen || {}), ...partial }
  }

  takeWorkspaceMountsForTab (tabId) {
    return Workspace.takeWorkspaceMountsForTab(this, tabId)
  }

  getTabWorkspaceLayoutId (tabId) {
    return this._tabs.find((t) => t.id === tabId)?.workspaceLayoutId
  }

  getTabContentSpec (tabId) {
    return this._tabs.find((t) => t.id === tabId)?.contentSpec
  }

  getTabWorkspaceShell (tabId) {
    const t = this._tabs.find((x) => x.id === tabId)
    return t ? t.workspaceShell : undefined
  }

  getTabOriginalWorkspace (tabId) {
    const t = this._tabs.find((x) => x.id === tabId)
    return t ? t.originalWorkspace : undefined
  }

  rebuildTabWorkspaceContent (tabId, patch) {
    Workspace.rebuildTabWorkspaceContent(this, tabId, patch)
  }

  _disposeWorkspaceMountsForTab (tabId) {
    Workspace.disposeWorkspaceMountsForTab(this, tabId)
  }

  _render() {
    // eslint-disable-next-line no-restricted-syntax -- shadow root 模板：静态字面量
    this.shadowRoot.innerHTML = createContentAreaTemplate()
  }

  _wireDirtyCloseDialog () {
    TabMenu.wireDirtyCloseDialog(this)
  }

  _syncTabDirtyVisual (id) {
    TabMenu.syncTabDirtyVisual(this, id)
  }

  _wireTabContextMenuRoot() {
    TabMenu.wireTabContextMenuRoot(this)
  }

  _wireTabOverflowRoot () {
    Overflow.wireTabOverflowRoot(this)
  }

  _layoutTabStripOverflow () {
    Overflow.layoutTabStripOverflow(this)
  }

  _openTabContextMenu(tabId, openerEl) {
    TabMenu.openTabContextMenu(this, tabId, openerEl)
  }

  _runTabContextAction(action) {
    TabMenu.runTabContextAction(this, action)
  }

  _removeTabIds(ids) {
    Tabs.removeTabIds(this, ids)
  }

  _renderTabs() {
    Tabs.renderTabs(this)
  }

  _selectTab(id) {
    Tabs.selectTab(this, id)
  }

  _notifyTabActivate () {
    Tabs.notifyTabActivate(this)
  }

  _requestCloseTab (id) {
    Tabs.requestCloseTab(this, id)
  }

  _closeTabDirect (id) {
    Tabs.closeTabDirect(this, id)
  }

  _refreshActive() {
    Tabs.refreshActive(this)
  }
}

customElements.define('portal-content-area', PortalContentArea)
