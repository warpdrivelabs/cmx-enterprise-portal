/**
 * Inner 对话框：复用 portal-dialog-workspace 的 shell / 拖拽 / 缩放 / 标题栏 / 取消确定按钮，
 * body 直接借入 inner 区缓存根（`#inner-region-host` 里的 cmx-ws-tab-cache-root），
 * 关闭时把根**归还**回原 holder——CE 始终 connected，视图 API 不会被反注册。
 *
 * 多视图时复用 `renderWorkspaceRegionViewsHtml('inner', ...)` 已生成的底部 Tab（cmx-ws-region-tabs-bottom），
 * 由 `handleWorkspaceRegionTabBarClick` 委托切换。
 *
 * 由 `Workspace.openInnerPageView(opts)` 创建并写入以下私有字段：
 *   - `_innerRoot` (HTMLElement) inner mount root（必填）
 *   - `_innerRootHolder` (HTMLElement|null) 隐藏 holder（关闭时归还位置）
 *   - `_openOpts` (object) 可选项 { title, icon, description, width, height, initialViewIndex,
 *                            buttons, confirmText, cancelText, showConfirm, showCancel }
 *
 * 派发事件：`dialog-close`，detail = { action: 'confirm'|'cancel'|'button', buttonId? }
 */
import {
  activateWorkspaceRegionViewByIndex,
  handleWorkspaceRegionTabBarClick,
  safeUi5IconName,
} from '../lib/workspace-node.js'
import {
  centerDialogBox,
  wireDialogBoxDrag,
  wireDialogBoxResize,
} from '../lib/dialog-workspace-interact.js'
import { createDialogWorkspaceTemplate } from './portal-dialog-workspace-shell.js'

const DLG_MIN_W = 480
const DLG_MIN_H = 300

export class PortalInnerDialog extends HTMLElement {
  constructor () {
    super()
    this.attachShadow({ mode: 'open' })
    /** @type {HTMLElement|null} */
    this._innerRoot = null
    /** @type {HTMLElement|null} */
    this._innerRootHolder = null
    /** @type {Record<string, unknown>} */
    this._openOpts = {}
    /** @type {AbortController|null} */
    this._abortInteract = null
    /** @type {((e: KeyboardEvent) => void)|null} */
    this._onKeyDown = null
  }

  connectedCallback () {
    // eslint-disable-next-line no-restricted-syntax -- shadow root 模板
    this.shadowRoot.innerHTML = createDialogWorkspaceTemplate()

    /* inner 模式无加载流程：直接移除 busy；保留 #dlg-footer-bottom 作为左侧空白区，
       message-strip（onConfirm 拒绝提示）会插到这里，按钮组（取消/确定）天然靠右。 */
    const sr = this.shadowRoot
    sr.getElementById('dlg-busy')?.remove()
    const footerBottom = sr.getElementById('dlg-footer-bottom')
    if (footerBottom instanceof HTMLElement) {
      footerBottom.style.display = 'flex'
      footerBottom.style.alignItems = 'center'
      footerBottom.style.padding = '0 12px'
    }

    /* body 单一区域、纵向布局；外层不做 splitter。 */
    const body = sr.getElementById('dlg-body')
    if (body instanceof HTMLElement) {
      body.style.flexDirection = 'column'
      body.style.background = 'var(--sapBaseColor, #fff)'
    }

    this._applyHeader()
    this._applyDimensions()
    this._mountInnerRoot()
    this._applyViewsFilter()
    this._wireFooterButtons()
    this._wireInteractions()
    this._wireKeyboard()
    this._wireBodyClicks()

    queueMicrotask(() => {
      requestAnimationFrame(() => {
        this._center()
        requestAnimationFrame(() => this._center())
      })
    })

    /* 激活初始视图：opts.initialView (id 字符串) 优先，其次 opts.initialViewIndex (数字)，
       再其次落到 _applyViewsFilter 解析出的 keep 集首项（多视图过滤场景）。 */
    queueMicrotask(() => this._activateInitialView())
  }

  disconnectedCallback () {
    if (this._onKeyDown) {
      document.removeEventListener('keydown', this._onKeyDown)
      this._onKeyDown = null
    }
    this._abortInteract?.abort()
    this._abortInteract = null
    this._returnInnerRoot()
  }

  _applyHeader () {
    const sr = this.shadowRoot
    const opts = this._openOpts
    const barIcon = /** @type {HTMLElement|null} */ (sr.getElementById('dlg-bar-icon'))
    const titleEl = sr.getElementById('dlg-bar-title')
    const descEl = sr.getElementById('dlg-bar-desc')
    if (barIcon) /** @type {any} */ (barIcon).name = safeUi5IconName(String(opts.icon || 'document'))
    if (titleEl) titleEl.textContent = String(opts.title || '')
    if (descEl) {
      const d = String(opts.description || '')
      descEl.textContent = d
      descEl.hidden = !d
    }
  }

  _applyDimensions () {
    const sr = this.shadowRoot
    const box = sr.getElementById('dlg-box')
    if (!(box instanceof HTMLElement)) return
    const w = String(this._openOpts.width || '').trim()
    const h = String(this._openOpts.height || '').trim()
    if (w) box.style.setProperty('--dlg-w', w)
    if (h) box.style.setProperty('--dlg-h', h)
  }

  /**
   * 把 inner 缓存根从 holder 借到 dialog body。root 已经 hydrate 过，CE 不会重新初始化。
   * 借出后给它一次"撑满 body"的弹性布局（与 syncWorkspaceCacheRootLayout 等价）。
   */
  _mountInnerRoot () {
    const body = this.shadowRoot.getElementById('dlg-body')
    const root = this._innerRoot
    if (!(body instanceof HTMLElement) || !(root instanceof HTMLElement)) return
    root.style.boxSizing = 'border-box'
    root.style.display = 'flex'
    root.style.flexDirection = 'column'
    root.style.flex = '1 1 auto'
    root.style.minHeight = '0'
    root.style.minWidth = '0'
    root.style.width = '100%'
    root.style.alignSelf = 'stretch'
    root.style.overflow = 'hidden'
    body.appendChild(root)
  }

  /**
   * 把 root 移回 holder：CE 始终连接，视图 API 不丢；holder 隐藏，root 不可见。
   */
  _returnInnerRoot () {
    const root = this._innerRoot
    const holder = this._innerRootHolder
    if (!(root instanceof HTMLElement)) return
    /* 还原 _applyViewsFilter 期间隐藏过的 pane / tab-btn / tab-strip 的 inline display；
       使下一次打开（无 views 限制 / 新 views 限制）从一个干净状态开始。 */
    this._restoreViewsFilter()
    /* holder 可能已被 disposeWorkspaceMountsForTab 清掉；此时不归还，让随后 dispose 自然移除。 */
    if (holder instanceof HTMLElement && holder.isConnected) {
      holder.appendChild(root)
    }
    this._innerRoot = null
    this._innerRootHolder = null
  }

  /**
   * 解析 opts.views 子集，返回匹配规则函数。views 项支持：
   *   - string → 与 [data-cmx-view-id] 匹配
   *   - number → 与 [data-pane-index] 匹配
   * 缺省 / 空数组 → 全部显示，返回 null（调用方据此跳过过滤）。
   * @returns {((idx: number, viewId: string) => boolean) | null}
   */
  _resolveViewsKeepFn () {
    const raw = this._openOpts.views
    if (!Array.isArray(raw) || raw.length === 0) return null
    /** @type {Set<string>} */ const ids = new Set()
    /** @type {Set<number>} */ const indexes = new Set()
    for (const item of raw) {
      if (typeof item === 'number' && Number.isFinite(item)) indexes.add(Math.floor(item))
      else if (item != null) {
        const s = String(item).trim()
        if (s) ids.add(s)
      }
    }
    if (!ids.size && !indexes.size) return null
    return (idx, viewId) => indexes.has(idx) || ids.has(viewId)
  }

  /**
   * 应用 views 过滤：把不在 keep 集里的 pane / tab-btn 隐藏；
   * keep 数 ≤ 1 时连底部 tab-strip 也隐藏（无切换价值）；
   * 记录修改过的 inline display 到 this._filterRestore，关闭时还原。
   */
  _applyViewsFilter () {
    this._filterRestore = []
    this._keepIndexes = null
    const root = this._innerRoot
    if (!(root instanceof HTMLElement)) return
    const region = root.querySelector('.cmx-ws-region[data-cmx-ws-region="inner"]')
    if (!(region instanceof HTMLElement)) return
    const keepFn = this._resolveViewsKeepFn()
    if (!keepFn) return

    const panes = Array.from(region.querySelectorAll('.cmx-ws-tab-pane'))
    const btns = Array.from(region.querySelectorAll('.cmx-ws-tab-btn'))
    /** @type {number[]} */ const keepIdx = []

    for (const pane of panes) {
      if (!(pane instanceof HTMLElement)) continue
      const idx = parseInt(pane.getAttribute('data-pane-index') || '-1', 10)
      const vid = pane.getAttribute('data-cmx-view-id') || ''
      const keep = keepFn(idx, vid)
      if (keep) keepIdx.push(idx)
      else this._hideRestorable(pane)
    }
    for (const btn of btns) {
      if (!(btn instanceof HTMLElement)) continue
      const idx = parseInt(btn.getAttribute('data-pane-index') || '-1', 10)
      const vid = panes.find((p) => parseInt(p.getAttribute('data-pane-index') || '-1', 10) === idx)
        ?.getAttribute('data-cmx-view-id') || ''
      if (!keepFn(idx, vid)) this._hideRestorable(btn)
    }
    /* 单视图：tab-strip 整体隐藏。 */
    if (keepIdx.length <= 1) {
      const strip = region.querySelector('.cmx-ws-region-tabs-bottom, .cmx-ws-region-tabs-top')
      if (strip instanceof HTMLElement) this._hideRestorable(strip)
    }
    keepIdx.sort((a, b) => a - b)
    this._keepIndexes = keepIdx
  }

  _hideRestorable (el) {
    if (!(el instanceof HTMLElement)) return
    /** @type {Array<{el: HTMLElement, prev: string}>} */
    const list = this._filterRestore || (this._filterRestore = [])
    list.push({ el, prev: el.style.display })
    el.style.display = 'none'
  }

  _restoreViewsFilter () {
    const list = this._filterRestore
    if (!Array.isArray(list)) return
    for (const { el, prev } of list) {
      if (el instanceof HTMLElement) el.style.display = prev || ''
    }
    this._filterRestore = null
    this._keepIndexes = null
  }

  /**
   * 选择初始激活视图：opts.initialView (id) → opts.initialViewIndex → keep 集首项 → 不动。
   * 多视图分支才有意义；单视图分支无 tab，无需切换。
   */
  _activateInitialView () {
    const root = this._innerRoot
    if (!(root instanceof HTMLElement)) return
    let target = -1
    const opts = this._openOpts
    if (opts.initialView != null && String(opts.initialView).trim()) {
      const wantId = String(opts.initialView).trim()
      const region = root.querySelector('.cmx-ws-region[data-cmx-ws-region="inner"]')
      const pane = region?.querySelector(`.cmx-ws-tab-pane[data-cmx-view-id="${CSS.escape(wantId)}"]`)
      if (pane instanceof HTMLElement) {
        const n = parseInt(pane.getAttribute('data-pane-index') || '-1', 10)
        if (Number.isFinite(n) && n >= 0) target = n
      }
    }
    if (target < 0) {
      const idx = Number(opts.initialViewIndex)
      if (Number.isFinite(idx) && idx >= 0) target = Math.floor(idx)
    }
    if (target < 0 && Array.isArray(this._keepIndexes) && this._keepIndexes.length) {
      /* 过滤后初始 pane 可能恰好在被隐藏集里，强制切到 keep 集首项。 */
      target = this._keepIndexes[0]
    }
    if (target >= 0) activateWorkspaceRegionViewByIndex(this._innerRoot, 'inner', target)
  }

  _wireFooterButtons () {
    const sr = this.shadowRoot
    const opts = this._openOpts
    const actions = sr.getElementById('dlg-footer-actions')
    const cancelBtn = sr.getElementById('dlg-cancel-btn')
    const confirmBtn = sr.getElementById('dlg-confirm-btn')

    if (cancelBtn) {
      if (opts.showCancel === false) {
        cancelBtn.remove()
      } else {
        cancelBtn.textContent = String(opts.cancelText || '取消')
        cancelBtn.addEventListener('click', () => this._close('cancel'))
      }
    }
    if (confirmBtn) {
      if (opts.showConfirm === false) {
        confirmBtn.remove()
      } else {
        confirmBtn.textContent = String(opts.confirmText || '确定')
        confirmBtn.addEventListener('click', () => this._handleConfirmClick())
      }
    }

    /* 自定义按钮：与 portal-dialog-workspace 同协议，插在 confirm 之前。 */
    if (actions instanceof HTMLElement && Array.isArray(opts.buttons)) {
      for (const btn of opts.buttons) {
        if (!btn || typeof btn !== 'object') continue
        const b = document.createElement('ui5-button')
        b.setAttribute('design', String(btn.design || 'Transparent'))
        if (btn.icon) b.setAttribute('icon', safeUi5IconName(String(btn.icon)))
        if (btn.disabled) b.setAttribute('disabled', '')
        b.textContent = String(btn.text || '')
        b.dataset.dlgBtnId = String(btn.id)
        b.addEventListener('click', () => this._close('button', String(btn.id)))
        actions.insertBefore(b, confirmBtn || null)
      }
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
    /* 多视图 Tab 切换委托（与其它工作区签同款）。 */
    this.shadowRoot.addEventListener('click', (e) => handleWorkspaceRegionTabBarClick(e))
  }

  _center () {
    const box = this.shadowRoot.getElementById('dlg-box')
    if (!(box instanceof HTMLElement)) return
    centerDialogBox(box, this)
  }

  /**
   * 确定按钮点击：先抓取 innerSession.result（脚本写入），可选 await onConfirm 决定是否真的关闭。
   * - hook 缺省 / 返回 true / { ok: true [, result] } → 关闭，detail.result = 浅克隆
   * - hook 返回 false / { ok: false, message } → 不关闭，message-strip 提示
   * - hook 抛错 → 视为 ok=false，message 取 err.message
   */
  async _handleConfirmClick () {
    if (this._confirmInFlight) return
    this._confirmInFlight = true
    const confirmBtn = this.shadowRoot.getElementById('dlg-confirm-btn')
    if (confirmBtn instanceof HTMLElement) confirmBtn.setAttribute('disabled', '')
    try {
      const ws = this._outerWorkspace
      const session = ws && /** @type {any} */ (ws).innerSession
      const result = (session && session.result && typeof session.result === 'object')
        ? { ...session.result }
        : {}
      const params = (session && session.params && typeof session.params === 'object')
        ? session.params
        : {}
      const hook = this._onConfirmHook
      let ok = true
      let message = ''
      let resolved = result
      if (typeof hook === 'function') {
        try {
          const ret = await hook({ result, params, workspace: ws })
          if (ret === false) {
            ok = false
          } else if (ret && typeof ret === 'object') {
            ok = !!ret.ok
            if (!ok && typeof ret.message === 'string') message = ret.message
            if (ok && ret.result && typeof ret.result === 'object') resolved = ret.result
          }
        } catch (err) {
          ok = false
          message = err instanceof Error ? err.message : String(err)
        }
      }
      if (!ok) {
        this._showInlineError(message || '不能关闭')
        return
      }
      this._close('confirm', undefined, resolved)
    } finally {
      this._confirmInFlight = false
      const btn = this.shadowRoot.getElementById('dlg-confirm-btn')
      if (btn instanceof HTMLElement) btn.removeAttribute('disabled')
    }
  }

  /**
   * 在 footer 左侧空白区（取消/确定按钮的左侧 #dlg-footer-bottom）显示一条阻断提示
   * （ui5-message-strip / Negative）。下次 confirm 成功或手动关闭时清除。
   * @param {string} message
   */
  _showInlineError (message) {
    const sr = this.shadowRoot
    const slot = sr.getElementById('dlg-footer-bottom')
    if (!(slot instanceof HTMLElement)) return
    let strip = /** @type {HTMLElement|null} */ (sr.getElementById('dlg-inline-msg'))
    if (!strip) {
      strip = document.createElement('ui5-message-strip')
      strip.id = 'dlg-inline-msg'
      strip.setAttribute('design', 'Negative')
      strip.style.flex = '1 1 auto'
      strip.style.minWidth = '0'
      slot.appendChild(strip)
    }
    strip.textContent = String(message || '')
    strip.hidden = false
    strip.addEventListener('close', () => strip?.remove(), { once: true })
  }

  /**
   * @param {'confirm'|'cancel'|'button'} action
   * @param {string} [buttonId]
   * @param {Record<string, unknown>} [result]
   */
  _close (action, buttonId, result) {
    /** @type {Record<string, unknown>} */
    const detail = { action }
    if (buttonId !== undefined) detail.buttonId = buttonId
    if (result !== undefined) detail.result = result
    this.dispatchEvent(new CustomEvent('dialog-close', {
      bubbles: true,
      composed: true,
      detail,
    }))
  }
}

customElements.define('portal-inner-dialog', PortalInnerDialog)
