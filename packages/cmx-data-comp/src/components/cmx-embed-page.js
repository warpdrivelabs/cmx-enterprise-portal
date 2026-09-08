import { escAttr, escHtml } from '../lib/cmx-page-helpers.js'

/**
 * <cmx-embed-page> — 嵌入展示 workspace.embed 区中定义的 html_pages 视图。
 *
 * 行为：
 *  - connect 时通过 host.workspace.borrowEmbedRoot(viewId, container) 借入每个 view 的 mount root；
 *    CE 不会被重 hydrate（同 document tree 内移动）。
 *  - disconnect / 属性变更时归还所有借出的 root；归还后 root 回到隐藏 holder，CE 仍 connected。
 *  - 多视图：当前激活 view 的 root 可见，其余 display:none；切 tab 仅改 display。
 *  - 视图不存在：渲染 placeholder 提示（design=Negative 风格）。
 *
 * 访问视图 API：
 *   像 inner/content 视图一样，view 脚本通过 host.workspace 访问 mainapp 中的 `tab:<id>` workspace，
 *   `host.workspace.pageview['embed_page1']` 可拿到对应 CE 实例。
 *
 * @component cmx-embed-page
 * @attr {string} pages - viewId 列表（逗号或空白分隔）；单视图就传一个值（对应 workspace.embed.views[].id 或 html_page）
 * @attr {('top'|'bottom'|'left'|'right')} [tab-position=top] - 多视图时 tab 条位置；单视图时不显示 tab 条
 * @attr {string} [initial-view] - 多视图初始激活的 viewId；缺省取列表首项
 */

/** 属性名：pages —— viewId 列表（逗号或空白分隔） */
const ATTR_PAGES = 'pages'
/** 属性名：tab-position —— 多视图时 tab 条的位置（top/bottom/left/right） */
const ATTR_TAB_POS = 'tab-position'
/** 属性名：initial-view —— 多视图初始激活的 viewId */
const ATTR_INITIAL = 'initial-view'

/** 组件 Shadow DOM 内联样式表（shell 容器 + tab 条 + body 区 + placeholder） */
const STYLES = `
:host {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  box-sizing: border-box;
  background: var(--sapBackgroundColor, transparent);
  color: inherit;
  --cmx-embed-tab-bg: var(--sapObjectHeader_Background, #fff);
  --cmx-embed-tab-border: var(--sapPageHeader_BorderColor, #ddd);
  --cmx-embed-tab-active: var(--sapHighlightColor, #0070f2);
  --cmx-embed-tab-color: var(--sapContent_LabelColor, #6a6d70);
  --cmx-embed-tab-color-active: var(--sapTextColor, #333);
}
.shell {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  width: 100%;
  height: 100%;
}
.shell.tab-top    { flex-direction: column; }
.shell.tab-bottom { flex-direction: column-reverse; }
.shell.tab-left   { flex-direction: row; }
.shell.tab-right  { flex-direction: row-reverse; }

.tabs {
  flex-shrink: 0;
  display: flex;
  gap: 0;
  background: var(--cmx-embed-tab-bg);
}
.tab-top .tabs, .tab-bottom .tabs { flex-direction: row; }
.tab-left .tabs, .tab-right .tabs { flex-direction: column; }
.tab-top .tabs    { border-bottom: 1px solid var(--cmx-embed-tab-border); }
.tab-bottom .tabs { border-top:    1px solid var(--cmx-embed-tab-border); }
.tab-left .tabs   { border-right:  1px solid var(--cmx-embed-tab-border); }
.tab-right .tabs  { border-left:   1px solid var(--cmx-embed-tab-border); }

.tab-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  height: 32px;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  border: none;
  background: transparent;
  color: var(--cmx-embed-tab-color);
  font-weight: 400;
  white-space: nowrap;
  user-select: none;
  -webkit-user-select: none;
}
.tab-btn:hover { background: rgba(0,0,0,0.04); }
.tab-btn.active {
  color: var(--cmx-embed-tab-color-active);
  font-weight: 600;
}
.tab-btn.missing { opacity: 0.6; font-style: italic; }
.tab-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  color: currentColor;
}
.tab-label { white-space: nowrap; }
.tab-top    .tab-btn.active { box-shadow: inset 0 -2px 0 var(--cmx-embed-tab-active); }
.tab-bottom .tab-btn.active { box-shadow: inset 0  2px 0 var(--cmx-embed-tab-active); }
.tab-left   .tab-btn.active { box-shadow: inset -2px 0 0 var(--cmx-embed-tab-active); }
.tab-right  .tab-btn.active { box-shadow: inset  2px 0 0 var(--cmx-embed-tab-active); }

/* 左/右侧 tab：文字竖向，节省横向空间。
   writing-mode + text-orientation：CJK 字符正立，西文逐字符旋转。
   .tab-left 用 vertical-lr（字头朝右、读序自上而下），
   .tab-right 用 vertical-rl（字头朝左、读序自上而下）；两侧 active 边线仍朝向内容区。 */
.tab-left .tab-btn,
.tab-right .tab-btn {
  writing-mode: vertical-lr;
  text-orientation: mixed;
  height: auto;
  min-height: 88px;
  width: 32px;
  padding: 8px 0;
  justify-content: flex-start;
  min-width: 0;
}
.tab-right .tab-btn { writing-mode: vertical-rl; }

.body {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}
.slot {
  display: none;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  overflow: auto;
}
.slot.active { display: flex; }
.placeholder {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  justify-content: center;
  padding: 16px;
  color: var(--sapNegativeColor, #bb372a);
  font-size: 13px;
  text-align: center;
  background: color-mix(in srgb, var(--sapNegativeColor, #bb372a) 8%, transparent);
  border-radius: 4px;
  margin: 8px;
}
`

/** tab-position 属性合法值集合，非法值回退为 'top' */
const VALID_TAB_POS = new Set(['top', 'bottom', 'left', 'right'])

export class CmxEmbedPage extends HTMLElement {
  /** 监听三个属性变化：pages / tab-position 变更触发重建，initial-view 仅切换可见 slot */
  static get observedAttributes () {
    return [ATTR_PAGES, ATTR_TAB_POS, ATTR_INITIAL]
  }

  constructor () {
    super()
    this.attachShadow({ mode: 'open' })
    /** @type {string[]} 当前已借出的 viewId 列表（按 tab 顺序） */
    this._borrowed = []
    /** @type {Map<string, HTMLElement>} viewId -> slot 容器 (.slot) */
    this._slots = new Map()
    /** @type {string} */
    this._activeId = ''
    /** @type {boolean} 标记是否已 connect 过；用于属性变更时重建 */
    this._mounted = false
    // 以下字段在 _mount 中懒初始化（workspace 未就绪时才用到）：
    /** @type {number} _mount rAF 重试计数（>30 帧后放弃并落 placeholder） */
    // this._mountRetry  ——  懒初始化，缺省 0
    /** @type {number} _mount 重试的 rAF id（0 = 无未决重试） */
    // this._mountRaf    ——  懒初始化，缺省 0
  }

  /** 元素插入 DOM：渲染骨架并借入所有视图 root */
  connectedCallback () {
    this._render()
    this._mount()
    this._mounted = true
  }

  /** 元素移出 DOM：归还所有借出的 root，清理重试计数 */
  disconnectedCallback () {
    this._unmount()
    this._mounted = false
  }

  /**
   * 属性变更处理。
   * - pages / tab-position：归还 → 重渲染 → 重新借入（结构变化）。
   * - initial-view：仅切换可见 slot（不重新借入）。
   */
  attributeChangedCallback (name, oldVal, newVal) {
    if (!this._mounted) return
    if (oldVal === newVal) return
    /* pages/tab-position 变更：归还所有 root → 重渲染 → 重新借入。 */
    if (name === ATTR_PAGES || name === ATTR_TAB_POS) {
      this._unmount()
      this._render()
      this._mount()
      return
    }
    /* initial-view 变更：仅切换可见 slot（不重借）。 */
    if (name === ATTR_INITIAL && newVal) {
      this._activate(String(newVal).trim())
    }
  }

  /** 解析 pages 属性为 viewId 列表（逗号/空白分隔，去空）。 */
  _viewIds () {
    const pages = this.getAttribute(ATTR_PAGES)
    if (pages == null) return []
    return String(pages).split(/[,\s]+/).map((s) => s.trim()).filter(Boolean)
  }

  /** 读取并校验 tab-position 属性，非法值回退为 'top'。 @returns {('top'|'bottom'|'left'|'right')} */
  _tabPosition () {
    const raw = String(this.getAttribute(ATTR_TAB_POS) || 'top').trim().toLowerCase()
    return VALID_TAB_POS.has(raw) ? raw : 'top'
  }

  /**
   * 找所属 workspace：从自身 closest 一个含 `data-cmx-workspace-id` 的祖先；这套约定与
   * mainapp scopeIdFromDom 一致。同时把找到的 wsId 写到自身的 dataset 上，方便调试。
   * 多页面 / 跨 shadow root 时通过 composedPath / getRootNode 上溯。
   * @returns {{ workspace: any | null, wsId: string }}
   */
  _resolveWorkspace () {
    /** @type {Element | null} */
    let node = this
    while (node) {
      if (node instanceof HTMLElement && node.dataset && node.dataset.cmxWorkspaceId) {
        const wsId = node.dataset.cmxWorkspaceId
        const ma = /** @type {any} */ (globalThis).mainapp
        const ws = ma?.workspaces?.[wsId] || ma?.activityScopes?.[wsId] || null
        return { workspace: ws, wsId }
      }
      /* 跨 shadow root 上溯：先看 parentElement，无则跳到 shadowRoot.host。 */
      const parent = node.parentElement
        || (node.parentNode instanceof ShadowRoot ? node.parentNode.host : null)
      node = parent instanceof Element ? parent : null
    }
    /* 最后兜底：用 mainapp.activeWorkspaceId。 */
    const ma = /** @type {any} */ (globalThis).mainapp
    const wsId = ma?.activeWorkspaceId
    return { workspace: wsId ? ma.workspaces?.[wsId] : null, wsId: wsId || '' }
  }

  /**
   * 渲染骨架 DOM：根据 pages 解析出 viewId 列表，生成 shell + tab strip 占位 + slot 容器。
   * tab 按钮在 _mount 借入后（拿到 icon/label）才生成。未设置 pages 时渲染 placeholder。
   */
  _render () {
    const ids = this._viewIds()
    const pos = this._tabPosition()
    const shellClass = `shell tab-${pos}`
    /* tab strip 留位（多视图时建空 div，_mount 借入后再填充 icon/label）。 */
    const tabsHtml = ids.length > 1
      ? `<div class="tabs" role="tablist"></div>`
      : ''
    const slotsHtml = ids.length
      ? `<div class="body">${ids.map((id) => `<div class="slot" data-view-id="${escAttr(id)}"></div>`).join('')}</div>`
      : `<div class="placeholder">cmx-embed-page：未设置 <code>pages</code> 属性</div>`

    // eslint-disable-next-line no-restricted-syntax -- attribute 值已 escAttr
    this.shadowRoot.innerHTML = `<style>${STYLES}</style><div class="${shellClass}">${tabsHtml}${slotsHtml}</div>`

    /* 收集 slot 引用；tab btn 在 _mount 阶段生成（需要 borrow 返回的 icon/label）。 */
    this._slots = new Map()
    this.shadowRoot.querySelectorAll('.slot').forEach((el) => {
      if (el instanceof HTMLElement) this._slots.set(el.dataset.viewId || '', el)
    })
  }

  /**
   * 多视图模式：基于 borrow 结果生成 tab btn（含 ui5-icon + label）。
   * @param {Array<{ id: string, icon: string, label: string, ok: boolean }>} entries
   */
  _renderTabs (entries) {
    const stripEl = this.shadowRoot.querySelector('.tabs')
    if (!(stripEl instanceof HTMLElement) || entries.length <= 1) return
    // eslint-disable-next-line no-restricted-syntax -- 所有动态值已 escAttr/escHtml
    stripEl.innerHTML = entries.map((e, i) => {
      const icon = safeIconName(e.icon)
      const labelText = e.label || e.id
      const iconHtml = icon ? `<ui5-icon class="tab-icon" name="${escAttr(icon)}"></ui5-icon>` : ''
      const okCls = e.ok ? '' : ' missing'
      return `<button type="button" class="tab-btn${okCls}" data-view-id="${escAttr(e.id)}" data-idx="${i}" title="${escAttr(labelText)}">${iconHtml}<span class="tab-label">${escHtml(labelText)}</span></button>`
    }).join('')
    this.shadowRoot.querySelectorAll('.tab-btn').forEach((btn) => {
      if (!(btn instanceof HTMLElement)) return
      btn.addEventListener('click', () => {
        const id = btn.dataset.viewId
        if (id) this._activate(id)
      })
    })
  }

  /**
   * 借入所有视图的 embed root：遍历 viewId 列表，向 workspace.borrowEmbedRoot 逐个借入并挂到对应 slot。
   * workspace 未就绪时通过 rAF 有限次（≤30 帧）重试；借入后渲染 tab strip 并激活初始视图。
   */
  _mount () {
    const ids = this._viewIds()
    if (!ids.length) return
    const { workspace } = this._resolveWorkspace()
    if (!workspace || typeof workspace.borrowEmbedRoot !== 'function') {
      /* workspace 尚未就绪（content 视图在隐藏 pane 中提前 hydrate、或 activeWorkspaceId 未设）：
         rAF 有限次重试，避免立即落 placeholder。仍未就绪才提示。 */
      if ((this._mountRetry || 0) < 30) {
        this._mountRetry = (this._mountRetry || 0) + 1
        this._mountRaf = requestAnimationFrame(() => this._mount())
        return
      }
      this._showPlaceholder('未找到 workspace（cmx-embed-page 必须放在 portal content 视图中）')
      return
    }
    this._mountRetry = 0
    const available = typeof workspace.listEmbedViewIds === 'function' ? workspace.listEmbedViewIds() : []
    /** @type {string[]} */ const borrowed = []
    /** @type {Array<{ id: string, icon: string, label: string, ok: boolean }>} */
    const entries = []
    for (const id of ids) {
      const slot = this._slots.get(id)
      if (!(slot instanceof HTMLElement)) continue
      const r = workspace.borrowEmbedRoot(id, slot)
      if (!r) {
        entries.push({ id, icon: '', label: id, ok: false })
        slot.innerHTML = `<div class="placeholder">未在 workspace.embed 中找到视图 <strong>${escHtml(id)}</strong>${available.length ? `<br/>可用：${escHtml(available.join(', '))}` : ''}</div>`
      } else {
        entries.push({ id, icon: r.icon || '', label: r.label || id, ok: true })
        /* 关键：借入的 root 是无 flex 的 block，在 slot (flex column) 中高度会塌陷。
           给它撑满布局（与 inner dialog 的 _mountInnerRoot 一致），否则内容不可见。 */
        this._applyBorrowedRootLayout(r.root)
        borrowed.push(id)
      }
    }
    this._borrowed = borrowed
    /* 多视图：用 borrow 返回的 icon/label 渲染 tab strip。 */
    this._renderTabs(entries)
    const initial = String(this.getAttribute(ATTR_INITIAL) || '').trim() || (borrowed[0] || ids[0])
    this._activate(initial)
  }

  /** 借入的 embed root 撑满 slot：flex 链 + min-height:0，避免高度塌陷导致内容不可见。 */
  _applyBorrowedRootLayout (root) {
    if (!(root instanceof HTMLElement)) return
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

  /** 归还所有借出的 embed root：取消未决 rAF、逐个 returnEmbedRoot、重置内部状态。 */
  _unmount () {
    if (this._mountRaf) { cancelAnimationFrame(this._mountRaf); this._mountRaf = 0 }
    this._mountRetry = 0
    if (!this._borrowed.length) return
    const { workspace } = this._resolveWorkspace()
    if (workspace && typeof workspace.returnEmbedRoot === 'function') {
      for (const id of this._borrowed) {
        /* 传自己的 slot 作为 borrower 比对键：若 root 已被新宿主 borrow 走（拖拽重排），
           本次归还会被忽略，不会抢回正在显示的 root。 */
        const slot = this._slots.get(id)
        try { workspace.returnEmbedRoot(id, slot) } catch (e) { console.warn('[cmx-embed-page] return failed', id, e) }
      }
    }
    this._borrowed = []
    this._activeId = ''
  }

  /** 切换激活视图：仅改 slot 的 display 与 tab-btn 的 active 类，不重新借入 root。 @param {string} id 目标 viewId */
  _activate (id) {
    if (!id) return
    if (!this._slots.has(id)) return
    this._activeId = id
    for (const [vid, slot] of this._slots) {
      slot.classList.toggle('active', vid === id)
    }
    this.shadowRoot.querySelectorAll('.tab-btn').forEach((btn) => {
      if (!(btn instanceof HTMLElement)) return
      btn.classList.toggle('active', btn.dataset.viewId === id)
    })
  }

  /** 在 body 区渲染错误提示 placeholder。 @param {string} msg 提示文本（经 escHtml 转义） */
  _showPlaceholder (msg) {
    const body = this.shadowRoot.querySelector('.body, .placeholder')
    if (body instanceof HTMLElement) {
      // eslint-disable-next-line no-restricted-syntax -- msg 经 escHtml
      body.innerHTML = `<div class="placeholder">${escHtml(msg)}</div>`
    }
  }
}

/** ui5-icon name 白名单：与 workspace-view-renderer.safeUi5IconName 同款；非法 → 空（不显示 icon）。 */
function safeIconName (name) {
  const s = String(name ?? '').trim()
  if (!s) return ''
  return /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(s) ? s : ''
}

if (typeof customElements !== 'undefined' && !customElements.get('cmx-embed-page')) {
  customElements.define('cmx-embed-page', CmxEmbedPage)
}
