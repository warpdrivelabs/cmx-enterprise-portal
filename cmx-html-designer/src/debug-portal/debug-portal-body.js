/**
 * 自 CMXPortalManager `portal-app.js` 复制：仅保留 ShellBar 以下的中区（活动栏 + Explorer / Content / Bottom / Property）与底栏状态行。
 * 顶栏由 `run-main.js` 的 `ui5-shellbar` 提供，本组件占满其下方区域。
 */
import './portal-activity-bar.js'
import './portal-side-nav.js'
import './portal-content-area.js'
import './portal-property-panel.js'
import './portal-log-panel.js'
import './portal-status-bar.js'

import {
  ensureActivitiesLoaded,
  getCachedActivityEntry,
} from './activities-api.js'
import { WorkspaceNode, applyWorkspaceShell, normalizeWorkspaceRegionViews } from './workspace-node.js'
import { setActiveWorkspace } from './mainapp.js'

const MIN_SIDENAV = 160
const MAX_SIDENAV = 600
const MIN_PROPERTY = 200
const MAX_PROPERTY = 700
const MIN_LOG = 80
const MAX_LOG = 600

/**
 * @param {Record<string, unknown>|null|undefined} sh
 * @param {'property'|'bottom'} key
 */
function shellHasWorkspaceRegionViews (sh, key) {
  if (!sh || typeof sh !== 'object' || !Object.prototype.hasOwnProperty.call(sh, key)) return false
  return normalizeWorkspaceRegionViews(/** @type {import('./workspace-node.js').WorkspaceRegionViewsInput} */ (sh[key])).length > 0
}

/**
 * @param {boolean} shellHasViews
 * @param {boolean|undefined} pref
 */
function dockOpenFromPref (shellHasViews, pref) {
  return !!shellHasViews && pref !== false
}

export class DebugPortalBody extends HTMLElement {
  constructor () {
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
  }

  disconnectedCallback () {
    if (this._onBeforeUnload) {
      window.removeEventListener('beforeunload', this._onBeforeUnload)
      this._onBeforeUnload = null
    }
  }

  async connectedCallback () {
    this._render()
    this._setupSplitters()
    this._setupEvents()
    await this._syncInitialActivityFromDefinitions()
    this._applyLayout()
    queueMicrotask(() => this._syncPropertyAndLogDockFromContentShell())
  }

  _syncPropertyAndLogDockFromContentShell () {
    const ca = this.shadowRoot.getElementById('content-area')
    if (!ca || typeof ca.getActiveWorkspaceShell !== 'function') return
    const sh = ca.getActiveWorkspaceShell()
    const tabId = typeof ca.getActiveTabId === 'function' ? ca.getActiveTabId() : undefined
    const prefs = tabId && typeof ca.getTabWorkspaceDockOpen === 'function' ? ca.getTabWorkspaceDockOpen(tabId) : undefined
    this._propertyVisible = dockOpenFromPref(shellHasWorkspaceRegionViews(sh, 'property'), prefs?.property)
    this._logVisible = dockOpenFromPref(shellHasWorkspaceRegionViews(sh, 'bottom'), prefs?.bottom)
    this._applyLayout()
  }

  /**
   * @param {'property'|'bottom'} region
   * @param {boolean} visible
   */
  _persistActiveTabDockOpen (region, visible) {
    const sr = this.shadowRoot
    const content = sr.getElementById('content-area')
    const sh = content?.getActiveWorkspaceShell?.()
    const id = content?.getActiveTabId?.()
    if (!content || typeof content.setTabWorkspaceDockOpen !== 'function' || !id) return
    if (region === 'property' && !shellHasWorkspaceRegionViews(sh, 'property')) return
    if (region === 'bottom' && !shellHasWorkspaceRegionViews(sh, 'bottom')) return
    content.setTabWorkspaceDockOpen(id, { [region]: !!visible })
  }

  async _syncInitialActivityFromDefinitions () {
    try {
      const list = await ensureActivitiesLoaded()
      if (!list.length) return
      let initialId = this._activeActivity
      if (!list.some((a) => a.id === initialId)) {
        initialId = list[0].id
      }
      this._activeActivity = initialId
      const row = getCachedActivityEntry(initialId) || list[0]
      if (row) {
        this._applyActivity(row.id, this._sideNavVisible, { sideNav: row.sideNav, label: row.label })
      }
    } catch {
      /* 活动栏仍可用内置 fallback */
    }
  }

  _render () {
    this.shadowRoot.innerHTML = `
      <style>
        /*
         * 两段网格：中区 / 状态栏（与 portal-app 中区+底栏一致，无顶栏行）。
         */
        :host {
          display: grid;
          grid-template-rows: minmax(0, 1fr) auto;
          grid-template-columns: minmax(0, 1fr);
          box-sizing: border-box;
          width: 100%;
          height: 100%;
          min-height: 0;
          overflow: hidden;
        }

        .body-row {
          grid-column: 1;
          grid-row: 1;
          display: flex;
          flex-direction: row;
          flex: 1 1 auto;
          min-height: 0;
          min-width: 0;
          overflow: hidden;
        }

        portal-activity-bar {
          flex: 0 0 48px;
          z-index: 5;
        }

        .workspace {
          flex: 1 1 auto;
          display: flex;
          flex-direction: row;
          min-width: 0;
          min-height: 0;
          overflow: hidden;
        }

        .sidenav-pane {
          flex: 0 0 var(--sidenav-width, 240px);
          min-width: 0;
          min-height: 0;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          transition: flex-basis 0s;
        }
        .sidenav-pane[data-hidden] {
          flex-basis: 0 !important;
          display: none;
        }

        .center-pane {
          flex: 1 1 auto;
          display: flex;
          flex-direction: column;
          min-width: 0;
          min-height: 0;
          overflow: hidden;
        }

        .content-pane {
          flex: 1 1 auto;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          min-height: 0;
        }

        .content-pane portal-content-area,
        .log-pane portal-log-panel,
        .property-pane portal-property-panel,
        .sidenav-pane portal-side-nav {
          flex: 1 1 auto;
          min-height: 0;
          min-width: 0;
          align-self: stretch;
        }

        .log-pane {
          flex: 0 0 var(--log-height, 200px);
          min-height: 0;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        .log-pane[data-hidden] {
          flex-basis: 0 !important;
          display: none;
        }

        .property-pane {
          flex: 0 0 var(--property-width, 300px);
          min-width: 0;
          min-height: 0;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        .property-pane[data-hidden] {
          flex-basis: 0 !important;
          display: none;
        }

        .status-row {
          grid-column: 1;
          grid-row: 2;
          z-index: 10;
          display: block;
          min-height: 0;
        }

        .splitter {
          background: var(--sapPageHeader_BorderColor, #ddd);
          position: relative;
          flex-shrink: 0;
          z-index: 2;
          transition: background 0.1s;
        }
        .splitter:hover, .splitter.dragging {
          background: var(--sapHighlightColor, #0070f2);
        }
        .splitter-v {
          width: 1px;
          cursor: col-resize;
          height: 100%;
        }
        .splitter-h {
          height: 1px;
          cursor: row-resize;
          width: 100%;
        }
        .splitter-v[data-hidden], .splitter-h[data-hidden] {
          display: none;
        }
      </style>

      <div class="body-row">
        <portal-activity-bar></portal-activity-bar>

        <div class="workspace">
          <div class="sidenav-pane" id="sidenav-pane">
            <portal-side-nav view="explorer"></portal-side-nav>
          </div>

          <div class="splitter splitter-v" id="splitter-left"></div>

          <div class="center-pane">
            <div class="content-pane">
              <portal-content-area id="content-area" no-welcome></portal-content-area>
            </div>

            <div class="splitter splitter-h" id="splitter-bottom"></div>

            <div class="log-pane" id="log-pane">
              <portal-log-panel id="log-panel"></portal-log-panel>
            </div>
          </div>

          <div class="splitter splitter-v" id="splitter-right"></div>

          <div class="property-pane" id="property-pane">
            <portal-property-panel id="property-panel"></portal-property-panel>
          </div>
        </div>
      </div>

      <div class="status-row">
        <portal-status-bar id="status-bar"></portal-status-bar>
      </div>
    `
  }

  _applyLayout () {
    const root = this.shadowRoot.host
    root.style.setProperty('--sidenav-width', this._sideNavWidth + 'px')
    root.style.setProperty('--property-width', this._propertyWidth + 'px')
    root.style.setProperty('--log-height', this._logHeight + 'px')

    const sidenavPane = this.shadowRoot.getElementById('sidenav-pane')
    const splitterLeft = this.shadowRoot.getElementById('splitter-left')
    if (this._sideNavVisible) {
      sidenavPane.removeAttribute('data-hidden')
      splitterLeft.removeAttribute('data-hidden')
    } else {
      sidenavPane.setAttribute('data-hidden', '')
      splitterLeft.setAttribute('data-hidden', '')
    }

    const propertyPane = this.shadowRoot.getElementById('property-pane')
    const splitterRight = this.shadowRoot.getElementById('splitter-right')
    if (this._propertyVisible) {
      propertyPane.removeAttribute('data-hidden')
      splitterRight.removeAttribute('data-hidden')
    } else {
      propertyPane.setAttribute('data-hidden', '')
      splitterRight.setAttribute('data-hidden', '')
    }

    const logPane = this.shadowRoot.getElementById('log-pane')
    const splitterBottom = this.shadowRoot.getElementById('splitter-bottom')
    if (this._logVisible) {
      logPane.removeAttribute('data-hidden')
      splitterBottom.removeAttribute('data-hidden')
    } else {
      logPane.setAttribute('data-hidden', '')
      splitterBottom.setAttribute('data-hidden', '')
    }
  }

  _setupSplitters () {
    this._initSplitter(
      this.shadowRoot.getElementById('splitter-left'),
      'h',
      () => this._sideNavWidth,
      val => {
        this._sideNavWidth = Math.max(MIN_SIDENAV, Math.min(MAX_SIDENAV, val))
        this.shadowRoot.host.style.setProperty('--sidenav-width', this._sideNavWidth + 'px')
      }
    )
    this._initSplitter(
      this.shadowRoot.getElementById('splitter-right'),
      'h',
      () => this._propertyWidth,
      val => {
        this._propertyWidth = Math.max(MIN_PROPERTY, Math.min(MAX_PROPERTY, val))
        this.shadowRoot.host.style.setProperty('--property-width', this._propertyWidth + 'px')
      },
      true
    )
    this._initSplitter(
      this.shadowRoot.getElementById('splitter-bottom'),
      'v',
      () => this._logHeight,
      val => {
        this._logHeight = Math.max(MIN_LOG, Math.min(MAX_LOG, val))
        this.shadowRoot.host.style.setProperty('--log-height', this._logHeight + 'px')
      },
      true
    )
  }

  _initSplitter (el, direction, getSize, setSize, invert = false) {
    if (!el) return
    el.addEventListener('mousedown', e => {
      e.preventDefault()
      const startPos = direction === 'v' ? e.clientY : e.clientX
      const startSize = getSize()
      el.classList.add('dragging')

      const onMove = e => {
        const delta = (direction === 'v' ? e.clientY : e.clientX) - startPos
        setSize(startSize + (invert ? -delta : delta))
      }
      const onUp = () => {
        el.classList.remove('dragging')
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    })
  }

  _setupEvents () {
    const sr = this.shadowRoot

    sr.addEventListener('activity-change', (e) => {
      const { id, visible, sideNav, label } = e.detail
      this._applyActivity(id, visible, { sideNav, label })
    })

    sr.addEventListener('panel-close', e => {
      const target = e.composedPath().find(el => el.tagName?.toLowerCase() === 'portal-property-panel')
      if (target) {
        this._propertyVisible = false
        this._applyLayout()
        this._persistActiveTabDockOpen('property', false)
      }
      const logTarget = e.composedPath().find(el => el.tagName?.toLowerCase() === 'portal-log-panel')
      if (logTarget) {
        this._logVisible = false
        this._applyLayout()
        this._persistActiveTabDockOpen('bottom', false)
      }
    })

    sr.addEventListener('status-item-click', e => {
      if (e.detail.id === 'bell') {
        const logPanel = sr.getElementById('log-panel')
        this._logVisible = !this._logVisible
        this._applyLayout()
        this._persistActiveTabDockOpen('bottom', this._logVisible)
        if (this._logVisible && logPanel) {
          logPanel.addLog('通知面板已打开', 'info', 'System')
        }
      }
    })

    sr.addEventListener('portal-content-tab-activate', (e) => {
      const d = /** @type {CustomEvent<{ tabId?: string, workspaceShell?: Record<string, unknown>|null|undefined }>} */ (e).detail
      if (!d) return
      setActiveWorkspace(d.tabId ? 'tab:' + d.tabId : null)
      const sideNav = sr.querySelector('portal-side-nav')
      const propertyPanel = sr.getElementById('property-panel')
      const logPanel = sr.getElementById('log-panel')
      const ctx = { sideNav, propertyPanel, logPanel }
      const content = sr.getElementById('content-area')
      const mounts = d.tabId && content && typeof content.takeWorkspaceMountsForTab === 'function'
        ? content.takeWorkspaceMountsForTab(d.tabId)
        : {}
      applyWorkspaceShell(null, ctx)
      const sh = d.workspaceShell
      if (sh != null && typeof sh === 'object' && Object.keys(sh).length > 0) {
        applyWorkspaceShell(sh, ctx, { activate: true, mounts })
      }
      const prefs = d.tabId && content && typeof content.getTabWorkspaceDockOpen === 'function'
        ? content.getTabWorkspaceDockOpen(d.tabId)
        : undefined
      const hasProp = shellHasWorkspaceRegionViews(sh, 'property')
      const hasBottom = shellHasWorkspaceRegionViews(sh, 'bottom')
      this._propertyVisible = dockOpenFromPref(hasProp, prefs?.property)
      this._logVisible = dockOpenFromPref(hasBottom, prefs?.bottom)
      this._applyLayout()
    })

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
      const idx = typeof d.viewIndex === 'number' && !Number.isNaN(d.viewIndex) ? d.viewIndex : 0
      const applyInner = () => {
        if (d.region === 'explorer') {
          sideNav?.activateWorkspaceRegionView?.(idx)
        } else if (d.region === 'property') {
          propertyPanel?.activateWorkspaceRegionView?.(idx)
        } else if (d.region === 'bottom') {
          logPanel?.activateWorkspaceRegionView?.(idx)
        }
      }
      queueMicrotask(() => queueMicrotask(applyInner))
    })

    sr.addEventListener('nav-selection', e => {
      const content = sr.getElementById('content-area')
      const m = e.detail.menu
      const label = (m?.caption && String(m.caption)) || e.detail.text || ''
      if (!content || !label) return
      const node = WorkspaceNode.fromNavSelectionDetail(e.detail)
      node.open_view({
        contentArea: content,
        sideNav: sr.querySelector('portal-side-nav'),
        propertyPanel: sr.getElementById('property-panel'),
        logPanel: sr.getElementById('log-panel'),
      })
      const logPanel = sr.getElementById('log-panel')
      if (logPanel) logPanel.addLog(`导航到: ${label}`, 'info', 'Navigator')
    })

    document.addEventListener('keydown', e => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'b') { e.preventDefault(); this._toggleSideNav() }
        if (e.key === 'j') { e.preventDefault(); this._toggleLog() }
        if (e.key === 'p') { e.preventDefault(); this._toggleProperty() }
      }
    })

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

  _toggleSideNav () {
    this._sideNavVisible = !this._sideNavVisible
    this._applyLayout()
  }

  _toggleLog () {
    this._logVisible = !this._logVisible
    this._applyLayout()
    this._persistActiveTabDockOpen('bottom', this._logVisible)
  }

  _toggleProperty () {
    this._propertyVisible = !this._propertyVisible
    this._applyLayout()
    this._persistActiveTabDockOpen('property', this._propertyVisible)
  }

  /**
   * @param {string} id
   * @param {boolean} visible
   * @param {{ sideNav?: { type: string, menu?: string, template?: string, title?: string }, label?: string }} [extra]
   */
  _applyActivity (id, visible, extra = {}) {
    const sr = this.shadowRoot
    const bar = sr.querySelector('portal-activity-bar')
    bar?.syncFromHost?.(id, visible)
    this._activeActivity = id
    this._sideNavVisible = visible
    let { sideNav, label } = extra
    const row = id ? getCachedActivityEntry(id) : null
    if (!sideNav && id && row) {
      sideNav = row.sideNav
      label = label || row.label
    }
    const sideNavEl = sr.querySelector('portal-side-nav')
    if (sideNavEl && typeof sideNavEl.applyHostActivitySideNav === 'function') {
      sideNavEl.applyHostActivitySideNav({
        sideNav: sideNav ?? null,
        label: label ?? null,
        viewId: id,
        activityIcon: row?.icon ?? null,
      })
    }
    this._applyLayout()
  }
}

customElements.define('cmx-debug-portal-body', DebugPortalBody)
