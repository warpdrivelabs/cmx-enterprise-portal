/**
 * 对话框工作区主控：渲染 explorer / content / property / bottom 四区域于浮层对话框。
 * html_pages batch 加载、底部 tab 切换、分栏拖拽调宽、确认 / 取消 / 自定义按钮事件。
 */
import { prepareWorkspaceHtmlPages } from '../lib/workspace-html-pages.js'
import { hydrateHtmlPagesWorkspaceViewsInRoot } from '../lib/workspace-html-page-preview.js'
import { safeUi5IconName } from '../lib/workspace-view-renderer.js'
import { escAttr, escHtml } from '../lib/escape.js'
import { createWorkspace, disposeWorkspace } from '../lib/mainapp.js'
import {
  centerDialogBox,
  snapDialogBoxToPixels,
  wireDialogBoxDrag,
  wireDialogBoxResize,
} from '../lib/dialog-workspace-interact.js'
import {
  createDialogWorkspaceTemplate,
  parseDialogWorkspaceSpec,
} from './portal-dialog-workspace-shell.js'

let _dlgIdCounter = 0

/** 与 shell 中 .dlg-box 的 min-width / min-height 一致 */
const DLG_MIN_W = 480
const DLG_MIN_H = 300

/** @typedef {import('../lib/dialog-workspace-node.js').DialogWorkspaceSpec} DWSpec */
/** @typedef {import('../lib/dialog-workspace-node.js').DialogWorkspaceRegionSpec} DWRegion */

// ---------------------------------------------------------------------------
// html_pages 视图 HTML 生成
// ---------------------------------------------------------------------------

/**
 * 为单个视图生成 html_pages 载荷 HTML（textarea + run-slot）。
 * @param {string} pid
 * @param {string} runnableDoc
 * @param {string} loadError
 * @returns {string}
 */
function viewPayloadHtml (pid, runnableDoc, loadError) {
  if (loadError) {
    return `<div style="padding:10px;font-size:12px;color:var(--sapNegativeTextColor, #bb0000)">${escHtml(loadError)}</div>`
  }
  if (!runnableDoc) {
    return `<div style="padding:10px;font-size:12px;color:var(--sapContent_LabelColor,#6a6d70)">未加载${pid ? `（${escHtml(pid)}）` : ''}</div>`
  }
  return (
    `<div class="cmx-html-pages-view" data-cmx-html-page-id="${escAttr(pid)}" style="display:flex;flex-direction:column;flex:1 1 auto;min-height:0;overflow:hidden">`
    + `<div class="cmx-html-pages-run-slot" data-cmx-html-pages-run-slot style="flex:1 1 auto;min-height:0;display:flex;flex-direction:column;overflow:auto;opacity:0;transition:opacity 140ms ease"></div>`
    + `<textarea hidden readonly tabindex="-1" aria-hidden="true" class="cmx-html-pages-runnable-store" data-cmx-html-pages-payload>${escAttr(runnableDoc)}</textarea>`
    + `</div>`
  )
}

/**
 * 从 wsLike view（经 prepareWorkspaceHtmlPages 填充）取渲染数据。
 * @param {Record<string,unknown>} view
 * @returns {{ pid: string, runnableDoc: string, loadError: string }}
 */
function viewRenderData (view) {
  const d = view.data && typeof view.data === 'object' ? /** @type {Record<string,unknown>} */ (view.data) : {}
  return {
    pid: d.htmlPageId != null ? String(d.htmlPageId) : (view.htmlPageId != null ? String(view.htmlPageId) : ''),
    runnableDoc: d.htmlPageRunnableDoc != null ? String(d.htmlPageRunnableDoc) : '',
    loadError: d.htmlPageLoadError != null ? String(d.htmlPageLoadError) : '',
  }
}

// ---------------------------------------------------------------------------
// 区域面板 HTML 生成
// ---------------------------------------------------------------------------

/**
 * 生成单个区域面板 HTML（header + views + 底部 tab strip）。
 * @param {string} region  'explorer' | 'content' | 'property'
 * @param {DWRegion} regionSpec
 * @param {Record<string,unknown>[]} wsViews  经 prepareWorkspaceHtmlPages 处理的 views
 * @param {number} [initialWidth]
 * @returns {string}
 */
function buildRegionHtml (region, regionSpec, wsViews, initialWidth) {
  const label = regionSpec.label || region
  const icon = safeUi5IconName(regionSpec.icon || 'document')
  const multiView = wsViews.length > 1
  const wStyle = (region !== 'content' && initialWidth) ? ` style="flex:0 0 ${initialWidth}px"` : ''

  let html = `<div class="dlg-region dlg-region-${region}" id="dlg-region-${region}"${wStyle}>`

  // Header
  html += `<div class="dlg-region-header">`
  html += `<ui5-icon name="${escAttr(icon)}" class="dlg-region-hdr-icon"></ui5-icon>`
  html += `<span class="dlg-region-hdr-label">${escHtml(label)}</span>`
  html += `</div>`

  // View slots
  html += `<div class="dlg-region-views">`
  wsViews.forEach((view, i) => {
    const { pid, runnableDoc, loadError } = viewRenderData(view)
    const viewId = pid || `${region}.${i}`
    const active = i === 0 ? ' active' : ''
    html += `<div class="dlg-view-slot${active}" data-view-idx="${i}" data-cmx-region="${escAttr(region)}" data-cmx-view-id="${escAttr(viewId)}">`
    html += viewPayloadHtml(pid, runnableDoc, loadError)
    html += `</div>`
  })
  html += `</div>`

  // Bottom tab strip（多视图时才显示）
  if (multiView) {
    html += `<div class="dlg-tab-strip">`
    wsViews.forEach((view, i) => {
      const sv = regionSpec.views[i] || /** @type {any} */ ({})
      const tabLabel = sv.tabLabel || (view.htmlPageId != null ? String(view.htmlPageId) : `Tab ${i + 1}`)
      const tabIcon = sv.tabIcon ? safeUi5IconName(sv.tabIcon) : ''
      const active = i === 0 ? ' active' : ''
      html += `<div class="dlg-tab${active}" data-tab-idx="${i}">`
      if (tabIcon) html += `<ui5-icon name="${escAttr(tabIcon)}" class="dlg-tab-icon"></ui5-icon>`
      html += `<span>${escHtml(tabLabel)}</span>`
      html += `</div>`
    })
    html += `</div>`
  }

  html += `</div>` // dlg-region
  return html
}

/**
 * 生成 footer bottom 区域 HTML（紧凑行内展示）。
 * @param {DWRegion} regionSpec
 * @param {Record<string,unknown>[]} wsViews
 * @returns {string}
 */
function buildBottomHtml (regionSpec, wsViews) {
  const multiView = wsViews.length > 1
  let html = `<div style="display:flex;flex-direction:column;flex:1 1 auto;min-height:0;overflow:hidden">`
  wsViews.forEach((view, i) => {
    const { pid, runnableDoc, loadError } = viewRenderData(view)
    const viewId = pid || `bottom.${i}`
    const active = i === 0 ? ' active' : ''
    html += `<div class="dlg-view-slot${active}" data-view-idx="${i}" data-cmx-region="bottom" data-cmx-view-id="${escAttr(viewId)}" style="overflow:hidden">`
    html += viewPayloadHtml(pid, runnableDoc, loadError)
    html += `</div>`
  })
  if (multiView) {
    html += `<div class="dlg-tab-strip">`
    wsViews.forEach((view, i) => {
      const sv = regionSpec.views[i] || /** @type {any} */ ({})
      const tabLabel = sv.tabLabel || (view.htmlPageId != null ? String(view.htmlPageId) : `Tab ${i + 1}`)
      const active = i === 0 ? ' active' : ''
      html += `<div class="dlg-tab${active}" data-tab-idx="${i}"><span>${escHtml(tabLabel)}</span></div>`
    })
    html += `</div>`
  }
  html += `</div>`
  return html
}

// ---------------------------------------------------------------------------
// 主控自定义元素
// ---------------------------------------------------------------------------

export class PortalDialogWorkspace extends HTMLElement {
  constructor () {
    super()
    this.attachShadow({ mode: 'open' })
    this._loadGen = 0
    this._scopeId = ''
    /** @type {((e: KeyboardEvent) => void)|null} */
    this._onKeyDown = null
    /** @type {AbortController|null} */
    this._abortDlgInteract = null
  }

  connectedCallback () {
    // eslint-disable-next-line no-restricted-syntax -- shadow root 模板
    this.shadowRoot.innerHTML = createDialogWorkspaceTemplate()
    this._scopeId = 'dlg:' + (++_dlgIdCounter)
    const spec = parseDialogWorkspaceSpec(this)
    createWorkspace(this._scopeId, { label: spec?.title || '' })
    this._setupStatic()
    void this._loadAndRender()
    this._onKeyDown = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); this._close('cancel') }
    }
    document.addEventListener('keydown', this._onKeyDown)
  }

  disconnectedCallback () {
    if (this._onKeyDown) {
      document.removeEventListener('keydown', this._onKeyDown)
      this._onKeyDown = null
    }
    this._abortDlgInteract?.abort()
    this._abortDlgInteract = null
    if (this._scopeId) {
      disposeWorkspace(this._scopeId)
      this._scopeId = ''
    }
  }

  // ---------------------------------------------------------------------------
  // Setup：bar 标题 / 自定义按钮 / cancel+confirm
  // ---------------------------------------------------------------------------

  _setupStatic () {
    const sr = this.shadowRoot
    const spec = parseDialogWorkspaceSpec(this)
    if (!spec) return

    const box = sr.getElementById('dlg-box')
    if (box) {
      if (spec.dialogWidth) /** @type {HTMLElement} */ (box).style.setProperty('--dlg-w', spec.dialogWidth)
      if (spec.dialogHeight) /** @type {HTMLElement} */ (box).style.setProperty('--dlg-h', spec.dialogHeight)
    }

    const barIcon = /** @type {HTMLElement|null} */ (sr.getElementById('dlg-bar-icon'))
    const titleEl = sr.getElementById('dlg-bar-title')
    const descEl = sr.getElementById('dlg-bar-desc')
    const endEl = sr.getElementById('dlg-bar-end')

    if (barIcon) /** @type {any} */ (barIcon).name = safeUi5IconName(spec.icon || 'document')
    if (titleEl) titleEl.textContent = spec.title || ''
    if (descEl) {
      descEl.textContent = spec.description || ''
      descEl.hidden = !spec.description
    }

    // 自定义按钮
    if (endEl && Array.isArray(spec.buttons)) {
      for (const btn of spec.buttons) {
        const b = document.createElement('ui5-button')
        b.setAttribute('design', btn.design || 'Transparent')
        if (btn.icon) b.setAttribute('icon', safeUi5IconName(btn.icon))
        if (btn.disabled) b.setAttribute('disabled', '')
        b.textContent = btn.text || ''
        b.dataset.dlgBtnId = String(btn.id)
        endEl.appendChild(b)
      }
      endEl.addEventListener('click', (e) => {
        const target = e.composedPath().find(
          (el) => el instanceof HTMLElement && el.dataset.dlgBtnId != null,
        )
        if (target instanceof HTMLElement) this._close('button', target.dataset.dlgBtnId)
      })
    }

    const cancelBtn = sr.getElementById('dlg-cancel-btn')
    const confirmBtn = sr.getElementById('dlg-confirm-btn')
    if (cancelBtn) {
      cancelBtn.textContent = spec.cancelText || '取消'
      cancelBtn.addEventListener('click', () => this._close('cancel'))
    }
    if (confirmBtn) {
      confirmBtn.textContent = spec.confirmText || '确定'
      confirmBtn.addEventListener('click', () => this._close('confirm'))
    }

    this._abortDlgInteract?.abort()
    const ac = new AbortController()
    this._abortDlgInteract = ac
    const { signal } = ac
    this._wireDialogDrag(sr, signal)
    this._wireDialogResize(sr, signal)
    queueMicrotask(() => {
      requestAnimationFrame(() => {
        this._centerDialogBox(sr)
        requestAnimationFrame(() => this._centerDialogBox(sr))
      })
    })
  }

  /**
   * 将对话框盒子在宿主视区内居中（首帧尺寸未稳定时会多试几次）。
   * @param {ShadowRoot} sr
   * @param {number} [attempt]
   */
  _centerDialogBox (sr, attempt = 0) {
    const box = sr.getElementById('dlg-box')
    if (!(box instanceof HTMLElement)) return
    centerDialogBox(box, this, attempt)
  }

  /**
   * 将当前对话框尺寸与位置固化为像素（便于拖拽缩放与 CSS 变量混用）。
   * @param {HTMLElement} box
   * @param {HTMLElement} host
   */
  _snapDialogBoxToPixels (box, host) {
    snapDialogBoxToPixels(box, host)
  }

  /**
   * 标题栏（ui5-bar 除右侧 slot 外）拖拽平移对话框。
   * @param {ShadowRoot} sr
   * @param {AbortSignal} signal
   */
  _wireDialogDrag (sr, signal) {
    const bar = sr.getElementById('dlg-bar')
    const box = sr.getElementById('dlg-box')
    const endEl = sr.getElementById('dlg-bar-end')
    if (!(bar instanceof HTMLElement) || !(box instanceof HTMLElement)) return
    wireDialogBoxDrag({
      bar,
      box,
      host: this,
      signal,
      ignoreEnd: endEl instanceof HTMLElement ? endEl : null,
    })
  }

  /**
   * 四边与四角拖拽调整对话框大小（与标题栏移动共用 signal 生命周期）。
   * @param {ShadowRoot} sr
   * @param {AbortSignal} signal
   */
  _wireDialogResize (sr, signal) {
    const root = sr.querySelector('.dlg-resize-root')
    const box = sr.getElementById('dlg-box')
    if (!(root instanceof HTMLElement) || !(box instanceof HTMLElement)) return
    wireDialogBoxResize({
      rootEl: root,
      box,
      host: this,
      signal,
      minWidth: DLG_MIN_W,
      minHeight: DLG_MIN_H,
    })
  }

  // ---------------------------------------------------------------------------
  // 批量加载 html_pages → 渲染区域面板
  // ---------------------------------------------------------------------------

  async _loadAndRender () {
    const sr = this.shadowRoot
    const spec = parseDialogWorkspaceSpec(this)
    if (!spec) return

    const myGen = ++this._loadGen

    // 构造 workspace-like 供 prepareWorkspaceHtmlPages
    /** @type {Record<string, { views: Record<string,unknown>[] }>} */
    const wsLike = {}
    for (const r of /** @type {const} */ (['explorer', 'content', 'property', 'bottom'])) {
      const rs = spec[r]
      if (rs?.views?.length) {
        wsLike[r] = { views: rs.views.map((v) => ({ type: 'html_pages', htmlPageId: v.htmlPageId })) }
      }
    }

    try {
      await prepareWorkspaceHtmlPages(/** @type {any} */ (wsLike))
    } catch (err) {
      console.warn('[portal-dialog-workspace] batch load failed', err)
    }

    if (myGen !== this._loadGen) return

    // 标记 scope ID：dlg-box 是 body 和 footer 的共同祖先，scopeIdFromDom 可从任意 run-slot 上溯至此。
    const box = sr.getElementById('dlg-box')
    if (box instanceof HTMLElement) box.dataset.cmxWorkspaceId = this._scopeId

    // 渲染主体三栏
    const body = sr.getElementById('dlg-body')
    if (body) {
      // eslint-disable-next-line no-restricted-syntax -- 动态区域 HTML
      body.innerHTML = this._buildBodyHtml(spec, wsLike)
      this._wireSplitters(/** @type {HTMLElement} */ (body))
      this._wireTabs(/** @type {HTMLElement} */ (body))
      hydrateHtmlPagesWorkspaceViewsInRoot(body)
      queueMicrotask(() => hydrateHtmlPagesWorkspaceViewsInRoot(body))
    }

    // 渲染 footer bottom
    const footerEl = sr.getElementById('dlg-footer')
    const footerBottom = sr.getElementById('dlg-footer-bottom')
    const bViews = wsLike.bottom?.views
    if (footerBottom && bViews?.length && spec.bottom) {
      const footerH = spec.footerHeight || 120
      if (footerEl instanceof HTMLElement) footerEl.style.height = footerH + 'px'
      // eslint-disable-next-line no-restricted-syntax -- 动态区域 HTML
      footerBottom.innerHTML = buildBottomHtml(spec.bottom, bViews)
      this._wireTabs(footerBottom)
      hydrateHtmlPagesWorkspaceViewsInRoot(footerBottom)
      queueMicrotask(() => hydrateHtmlPagesWorkspaceViewsInRoot(footerBottom))
    } else if (footerEl instanceof HTMLElement) {
      footerEl.style.height = '52px'
    }

    const busy = sr.getElementById('dlg-busy')
    if (busy instanceof HTMLElement) busy.remove()
  }

  /**
   * 构建主体三栏 HTML（explorer ＋ 分栏 ＋ content ＋ 分栏 ＋ property，按 spec 有无决定是否渲染）。
   * @param {DWSpec} spec
   * @param {Record<string, { views: Record<string,unknown>[] }>} wsLike
   * @returns {string}
   */
  _buildBodyHtml (spec, wsLike) {
    /** @type {{ region: string, spec: DWRegion, views: Record<string,unknown>[], w?: number }[]} */
    const panels = []
    if (spec.explorer?.views?.length && wsLike.explorer?.views?.length) {
      panels.push({ region: 'explorer', spec: spec.explorer, views: wsLike.explorer.views, w: spec.explorerWidth || 220 })
    }
    if (spec.content?.views?.length && wsLike.content?.views?.length) {
      panels.push({ region: 'content', spec: spec.content, views: wsLike.content.views })
    }
    if (spec.property?.views?.length && wsLike.property?.views?.length) {
      panels.push({ region: 'property', spec: spec.property, views: wsLike.property.views, w: spec.propertyWidth || 260 })
    }

    if (!panels.length) {
      return '<div style="flex:1;display:flex;align-items:center;justify-content:center;font-size:13px;color:var(--sapContent_LabelColor,#6a6d70)">（未配置区域）</div>'
    }

    let html = ''
    panels.forEach((p, i) => {
      if (i > 0) {
        // data-split-left = 左侧 panel region，用于拖拽时确定调整哪一侧
        html += `<div class="dlg-splitter" data-split-left="${panels[i - 1].region}" data-split-right="${p.region}"></div>`
      }
      html += buildRegionHtml(p.region, p.spec, p.views, p.w)
    })
    return html
  }

  // ---------------------------------------------------------------------------
  // 分栏拖拽
  // ---------------------------------------------------------------------------

  /** @param {HTMLElement} body */
  _wireSplitters (body) {
    body.querySelectorAll('.dlg-splitter').forEach((sp) => {
      if (!(sp instanceof HTMLElement)) return
      sp.addEventListener('pointerdown', (e) => {
        e.preventDefault()
        sp.setPointerCapture(e.pointerId)
        sp.classList.add('dragging')

        const splitLeft = sp.dataset.splitLeft || ''
        const splitRight = sp.dataset.splitRight || ''
        // content 是 flex:1 面板，调整相邻固定宽面板：
        // 左侧非 content → 拖右增宽左侧；左侧为 content → 拖右缩窄右侧
        const fixedRegion = splitLeft !== 'content' ? splitLeft : splitRight
        const invert = splitLeft === 'content' // 拖右 = 右侧缩窄
        const panel = body.querySelector(`.dlg-region-${fixedRegion}`)
        if (!(panel instanceof HTMLElement)) return

        const startX = e.clientX
        const startW = panel.offsetWidth

        const onMove = (e) => {
          const delta = (e.clientX - startX) * (invert ? -1 : 1)
          const newW = Math.max(120, Math.min(600, startW + delta))
          panel.style.flex = `0 0 ${newW}px`
        }
        const onUp = () => {
          sp.classList.remove('dragging')
          sp.releasePointerCapture(e.pointerId)
          sp.removeEventListener('pointermove', onMove)
          sp.removeEventListener('pointerup', onUp)
        }
        sp.addEventListener('pointermove', onMove)
        sp.addEventListener('pointerup', onUp)
      })
    })
  }

  // ---------------------------------------------------------------------------
  // Tab 切换（body 和 footer bottom 通用）
  // ---------------------------------------------------------------------------

  /** @param {HTMLElement} root */
  _wireTabs (root) {
    root.addEventListener('click', (e) => {
      const path = e.composedPath()
      const tab = path.find((el) => el instanceof HTMLElement && el.classList.contains('dlg-tab'))
      if (!(tab instanceof HTMLElement)) return
      const idx = parseInt(tab.dataset.tabIdx || '0', 10)
      if (Number.isNaN(idx)) return

      const strip = tab.closest('.dlg-tab-strip')
      if (!strip) return
      // container = 区域面板（body 栏）或 bottom 包装 div（footer）
      const container = strip.parentElement
      if (!container) return

      strip.querySelectorAll('.dlg-tab').forEach((t) => t.classList.toggle('active', t === tab))
      container.querySelectorAll('.dlg-view-slot').forEach((v) => {
        if (!(v instanceof HTMLElement)) return
        v.classList.toggle('active', parseInt(v.dataset.viewIdx || '-1', 10) === idx)
      })
    })
  }

  // ---------------------------------------------------------------------------
  // 关闭
  // ---------------------------------------------------------------------------

  /**
   * @param {'confirm'|'cancel'|'button'} action
   * @param {string} [buttonId]
   */
  _close (action, buttonId) {
    this.dispatchEvent(new CustomEvent('dialog-close', {
      bubbles: true,
      composed: true,
      detail: { action, buttonId },
    }))
  }
}

customElements.define('portal-dialog-workspace', PortalDialogWorkspace)
