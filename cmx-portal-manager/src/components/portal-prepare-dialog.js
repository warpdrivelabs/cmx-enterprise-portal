/**
 * Prepare 对话框（dialog workspace 模式）：复用 portal-dialog-workspace 的 shell / 拖拽 / 缩放 / 标题栏 / 取消确定按钮，
 * body 直接渲染 `workspace.prepare` 区域视图（renderWorkspaceRegionViewsHtml + hydrate），不走 html_pages batch 流程。
 *
 * 公开属性：
 *   - `prepareRaw` (setter)：WorkspaceRegionViewsInput
 *   - `meta` (setter)：{ caption, icon, width, height }
 *
 * 派发事件：`dialog-close`，detail = { action: 'confirm' | 'cancel' }
 */
import {
  hydrateHtmlPagesWorkspaceViewsInRoot,
  renderWorkspaceRegionViewsHtml,
  safeUi5IconName,
  handleWorkspaceRegionTabBarClick,
} from '../lib/workspace-node.js'
import { wireWorkspaceRegionTabContextMenu } from '../lib/workspace-region-tab-ctxmenu.js'
import { createWorkspace, disposeWorkspace, mainapp } from '../lib/mainapp.js'
import {
  centerDialogBox,
  wireDialogBoxDrag,
  wireDialogBoxResize,
} from '../lib/dialog-workspace-interact.js'
import { createDialogWorkspaceTemplate } from './portal-dialog-workspace-shell.js'

const DLG_MIN_W = 480
const DLG_MIN_H = 300

let _prepareIdCounter = 0

export class PortalPrepareDialog extends HTMLElement {
  constructor () {
    super()
    this.attachShadow({ mode: 'open' })
    this._scopeId = ''
    /** @type {AbortController|null} */
    this._abortInteract = null
    /** @type {((e: KeyboardEvent) => void)|null} */
    this._onKeyDown = null
    /** @type {(() => void)|null} */
    this._ctxMenuUnwire = null
    /** @type {import('../lib/workspace-node.js').WorkspaceRegionViewsInput|null} */
    this._prepareRaw = null
    /** @type {{ caption?: string, icon?: string, width?: string, height?: string }} */
    this._meta = {}
    /** @type {Record<string, unknown>|null} 入参：来自菜单节点的 workspace.params */
    this._params = null
  }

  /** @param {import('../lib/workspace-node.js').WorkspaceRegionViewsInput|null} v */
  set prepareRaw (v) {
    this._prepareRaw = v ?? null
    if (this.isConnected) this._renderBody()
  }

  /** @param {{ caption?: string, icon?: string, width?: string, height?: string }} v */
  set meta (v) {
    this._meta = (v && typeof v === 'object') ? v : {}
    if (this.isConnected) {
      this._applyHeader()
      this._applyDimensions()
    }
  }

  /**
   * 入参：会注入到 prepare scope 的 `workspace.params`（冻结）。
   * @param {Record<string, unknown>|null|undefined} v
   */
  set params (v) {
    this._params = (v && typeof v === 'object') ? v : null
  }

  /**
   * 取出 prepare scope 上脚本写入的 `workspace.result`（浅克隆，关闭前抓取）。
   * @returns {Record<string, unknown>|null}
   */
  getResultSnapshot () {
    const ws = this._scopeId ? mainapp.workspaces[this._scopeId] : null
    const r = ws && /** @type {any} */ (ws).result
    if (r == null || typeof r !== 'object') return null
    return { ...r }
  }

  connectedCallback () {
    // eslint-disable-next-line no-restricted-syntax -- shadow root 模板
    this.shadowRoot.innerHTML = createDialogWorkspaceTemplate()
    this._scopeId = 'prepare:' + (++_prepareIdCounter)
    const ws = /** @type {any} */ (createWorkspace(this._scopeId, { label: this._meta.caption || '工作区' }))
    /* 入参：冻结后挂到 scope；视图脚本读 host.workspace.params。 */
    ws.params = this._params ? Object.freeze({ ...this._params }) : Object.freeze({})
    /* 出参容器：脚本通过 host.workspace.result = {...} 或逐字段赋值写入。 */
    ws.result = {}

    /* prepare 模式不需要 footer-bottom 与 busy 遮罩：footer 仅留取消/确定按钮，busy 直接移除。 */
    const sr = this.shadowRoot
    const footerBottom = sr.getElementById('dlg-footer-bottom')
    if (footerBottom instanceof HTMLElement) {
      footerBottom.remove()
    }
    /* footer-bottom 是 row 布局里的 flex:1 填充块，移除后需显式右对齐 actions。 */
    const footer = sr.getElementById('dlg-footer')
    if (footer instanceof HTMLElement) footer.style.justifyContent = 'flex-end'
    const busy = sr.getElementById('dlg-busy')
    if (busy instanceof HTMLElement) busy.remove()

    const box = sr.getElementById('dlg-box')
    if (box instanceof HTMLElement) box.dataset.cmxWorkspaceId = this._scopeId

    /* prepare body 与 dialog workspace 不同：单一区域，外层不做 splitter，flex 链直接跑通。 */
    const body = sr.getElementById('dlg-body')
    if (body instanceof HTMLElement) {
      body.style.flexDirection = 'column'
      body.style.background = 'var(--sapBaseColor, #fff)'
    }

    this._applyHeader()
    this._applyDimensions()
    this._renderBody()
    this._wireFooterButtons()
    this._wireInteractions()
    this._wireKeyboard()
    this._wireBodyClicks()
    this._wireCtxMenu()

    queueMicrotask(() => {
      requestAnimationFrame(() => {
        this._center()
        requestAnimationFrame(() => this._center())
      })
    })
  }

  disconnectedCallback () {
    if (this._onKeyDown) {
      document.removeEventListener('keydown', this._onKeyDown)
      this._onKeyDown = null
    }
    this._abortInteract?.abort()
    this._abortInteract = null
    this._ctxMenuUnwire?.()
    this._ctxMenuUnwire = null
    if (this._scopeId) {
      disposeWorkspace(this._scopeId)
      this._scopeId = ''
    }
  }

  _applyHeader () {
    const sr = this.shadowRoot
    const barIcon = /** @type {HTMLElement|null} */ (sr.getElementById('dlg-bar-icon'))
    const titleEl = sr.getElementById('dlg-bar-title')
    const descEl = sr.getElementById('dlg-bar-desc')
    if (barIcon) /** @type {any} */ (barIcon).name = safeUi5IconName(this._meta.icon || 'document')
    if (titleEl) titleEl.textContent = this._meta.caption || ''
    if (descEl) {
      descEl.textContent = ''
      descEl.hidden = true
    }
  }

  _applyDimensions () {
    const sr = this.shadowRoot
    const box = sr.getElementById('dlg-box')
    if (!(box instanceof HTMLElement)) return
    const w = String(this._meta.width || '').trim()
    const h = String(this._meta.height || '').trim()
    if (w) box.style.setProperty('--dlg-w', w)
    else box.style.removeProperty('--dlg-w')
    if (h) box.style.setProperty('--dlg-h', h)
    else box.style.removeProperty('--dlg-h')
  }

  _renderBody () {
    const sr = this.shadowRoot
    const body = sr.getElementById('dlg-body')
    if (!(body instanceof HTMLElement)) return
    // eslint-disable-next-line no-restricted-syntax -- renderWorkspaceRegionViewsHtml 内部已 escape
    body.innerHTML = renderWorkspaceRegionViewsHtml(
      'prepare',
      /** @type {any} */ (this._prepareRaw),
    )
    hydrateHtmlPagesWorkspaceViewsInRoot(body)
    queueMicrotask(() => hydrateHtmlPagesWorkspaceViewsInRoot(body))
  }

  _wireFooterButtons () {
    const sr = this.shadowRoot
    const cancelBtn = sr.getElementById('dlg-cancel-btn')
    const confirmBtn = sr.getElementById('dlg-confirm-btn')
    if (cancelBtn) {
      cancelBtn.textContent = '取消'
      cancelBtn.addEventListener('click', () => this._close('cancel'))
    }
    if (confirmBtn) {
      confirmBtn.textContent = '确定'
      confirmBtn.addEventListener('click', () => this._close('confirm'))
    }
  }

  _wireInteractions () {
    const sr = this.shadowRoot
    this._abortInteract?.abort()
    const ac = new AbortController()
    this._abortInteract = ac
    const { signal } = ac

    const bar = sr.getElementById('dlg-bar')
    const box = sr.getElementById('dlg-box')
    const endEl = sr.getElementById('dlg-bar-end')
    if (bar instanceof HTMLElement && box instanceof HTMLElement) {
      wireDialogBoxDrag({
        bar,
        box,
        host: this,
        signal,
        ignoreEnd: endEl instanceof HTMLElement ? endEl : null,
      })
    }
    const root = sr.querySelector('.dlg-resize-root')
    if (root instanceof HTMLElement && box instanceof HTMLElement) {
      wireDialogBoxResize({
        rootEl: root,
        box,
        host: this,
        signal,
        minWidth: DLG_MIN_W,
        minHeight: DLG_MIN_H,
      })
    }
  }

  _wireKeyboard () {
    if (this._onKeyDown) return
    this._onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        this._close('cancel')
      }
    }
    document.addEventListener('keydown', this._onKeyDown)
  }

  _wireBodyClicks () {
    /* 多视图 tab strip 切换：复用与其它工作区签同款 click 委托（仅 .cmx-ws-tab-btn 生效）。 */
    this.shadowRoot.addEventListener('click', (e) => handleWorkspaceRegionTabBarClick(e))
  }

  _wireCtxMenu () {
    if (this._ctxMenuUnwire) return
    const sr = this.shadowRoot
    this._ctxMenuUnwire = wireWorkspaceRegionTabContextMenu(
      sr,
      () => /** @type {HTMLElement|null} */ (sr.getElementById('dlg-body')),
      'prepare',
      () => 'prepare',
      () => /** @type {Record<string, unknown>|null} */ (
        this._prepareRaw && typeof this._prepareRaw === 'object'
          ? /** @type {Record<string, unknown>} */ (this._prepareRaw)
          : null
      ),
      {
        getOuterTab: () => /** @type {HTMLElement|null} */ (sr.getElementById('dlg-bar')),
        dispatchTarget: () => this,
      },
    )
  }

  _center () {
    const box = this.shadowRoot.getElementById('dlg-box')
    if (!(box instanceof HTMLElement)) return
    centerDialogBox(box, this)
  }

  /**
   * @param {'confirm'|'cancel'} action
   */
  _close (action) {
    this.dispatchEvent(new CustomEvent('dialog-close', {
      bubbles: true,
      composed: true,
      detail: { action },
    }))
  }
}

customElements.define('portal-prepare-dialog', PortalPrepareDialog)
