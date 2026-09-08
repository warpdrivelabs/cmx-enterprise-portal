/**
 * <cmx-floating-dialog> — 通用浮层对话框（可拖拽 / 缩放 / 居中）。
 *
 * 外观沿用 CMXPortalManager 的 dialog-worknode（样式真源在 lib/cmx-dialog-shell.js），
 * 但内容注入方式不同：本组件直接吃**实时 DOM**（setContent / setLeftRight），
 * 不依赖 PortalManager 的 html_pages / workspace 机制，因此可在共享包内独立使用。
 *
 * 用法：
 *   const dlg = document.createElement('cmx-floating-dialog')
 *   dlg.configure({ title, icon, description, buttons, confirmText, cancelText,
 *                   dialogWidth, dialogHeight })
 *   dlg.setContent(someEl)                       // 单区内容
 *   // 或 dlg.setLeftRight(treeEl, gridEl, { leftLabel, rightLabel, leftWidth })
 *   document.body.appendChild(dlg)
 *   dlg.addEventListener('cmx-dialog-confirm', ...) // { } 用户点确定
 *   dlg.addEventListener('cmx-dialog-cancel',  ...) // 取消 / Esc / 遮罩
 *   dlg.addEventListener('cmx-dialog-button',  ...) // { id } 自定义按钮
 *
 * 也提供 Promise 风格 openModal()：resolve { action:'confirm'|'cancel'|'button', buttonId? }。
 *
 * @component cmx-floating-dialog
 * @fires cmx-dialog-confirm - 用户点击确定按钮（bubbles + composed）
 * @fires cmx-dialog-cancel - 用户取消 / 按 Esc / 点击遮罩（bubbles + composed）
 * @fires cmx-dialog-button - 用户点击自定义按钮，detail: { id }（bubbles + composed）
 */
import '@ui5/webcomponents/dist/Bar.js'
import '@ui5/webcomponents/dist/Button.js'
import '@ui5/webcomponents/dist/Icon.js'
import {
  createDialogShellTemplate,
  safeDialogIconName,
} from '../lib/cmx-dialog-shell.js'
import {
  centerDialogBox,
  wireDialogBoxDrag,
  wireDialogBoxResize,
} from '../lib/cmx-dialog-interact.js'
import { acquireScrollLock, releaseScrollLock } from '../lib/cmx-scroll-lock.js'

/** 与 shell 中 .dlg-box 的 min-width / min-height 一致 */
const DLG_MIN_W = 480
/** 与 shell 中 .dlg-box 的 min-width / min-height 一致 */
const DLG_MIN_H = 300

export class CmxFloatingDialog extends HTMLElement {
  constructor () {
    super()
    this.attachShadow({ mode: 'open' })
    /** @type {object} 对话框配置（title/icon/buttons/confirmText/beforeClose 等），由 configure() 累积合并 */
    this._spec = {}
    /** @type {AbortController|null} 拖拽 / 缩放交互的信号控制器，disconnect 或重连时 abort */
    this._abort = null
    /** @type {((e: KeyboardEvent) => void)|null} 全局 Esc 按键监听句柄（注册在 document 上） */
    this._onKeyDown = null
    /** @type {((r: { action: string, buttonId?: string }) => void)|null} openModal() 的 Promise resolve 回调 */
    this._resolve = null
    /** @type {boolean} 对话框是否已关闭（防止 _emitClose 重复触发） */
    this._closed = false
    /** @type {boolean} 本实例是否持有文档滚动锁（与 lockScroll 配置严格配对，reconnect 安全） */
    this._scrollLocked = false
    // 以下字段懒初始化：
    /** @type {boolean} Shadow DOM 是否已注入模板并绑定事件（connectedCallback 首次执行后为 true） */
    // this._wired  ——  懒初始化，缺省 undefined（falsy）
    /** @type {{ kind: string, el?: HTMLElement, leftEl?: HTMLElement, rightEl?: HTMLElement, opts?: object }|null} 连接前暂存的内容（connected 后再注入） */
    // this._pendingContent  ——  懒初始化，缺省 undefined
  }

  // ── 配置 API ─────────────────────────────────────────────────────────────

  /**
   * @param {{
   *   title?: string, icon?: string, description?: string,
   *   buttons?: Array<{ id: string, text: string, icon?: string, design?: string, disabled?: boolean }>,
   *   confirmText?: string, cancelText?: string, showConfirm?: boolean, showCancel?: boolean,
   *   dialogWidth?: string, dialogHeight?: string,
   *   dock?: 'right' | 'left',
   *   closable?: boolean, closeOnEsc?: boolean, closeOnMask?: boolean, mask?: boolean,
   *   lockScroll?: boolean, draggable?: boolean, resizable?: boolean, fullscreen?: boolean,
   *   contentPadding?: boolean|string, zIndex?: number,
   *   beforeClose?: (ctx: { action: 'confirm'|'button', buttonId?: string }) => boolean | Promise<boolean>,
   * }} spec
   *
   * dock：贴边抽屉模式（'right' 右侧滑入 / 'left' 左侧滑入）。设置后对话框贴边、高度撑满视口、
   *   宽度默认 420px（可用 dialogWidth 覆盖）、横向滑入动画、禁用拖拽与缩放。
   *   不设（默认）= 居中模态（原行为）。遮罩点击 / Esc 关闭逻辑不受影响。
   *
   * 行为属性（默认值均保持历史行为）：closable 标题栏 ✕（默认 false）；
   *   closeOnEsc / closeOnMask（默认 true，多层叠开时 Esc 仅关栈顶实例）；
   *   mask:false = 非模态（遮罩透明不拦截，建议同时 lockScroll:false）；
   *   lockScroll 打开时锁文档滚动（默认 true，引用计数支持多层嵌套）；
   *   draggable / resizable（默认 true）；fullscreen 铺满视口（与 dock 冲突时忽略）；
   *   contentPadding 内容区默认 padding（true=14px 16px / false / 自定义串，累积合并不传不改）；
   *   zIndex 覆盖默认 900。
   *   注意：新属性须在首次 appendChild 之前 configure（wiring 类属性连接后不重绑）。
   *
   * beforeClose：confirm / 自定义 button 动作关闭前的可拦截钩子（cancel / Esc / 遮罩不触发）。
   *   返回假值则中止关闭（弹窗保持可用、可再次点击）；常用于「确认前做表单校验，不过则不关」。
   *   未注册时维持原行为（直接关闭）。落盘成功后需强制关闭请用 close(action, { force: true })。
   */
  configure (spec) {
    this._spec = { ...this._spec, ...(spec || {}) }
    // host 级属性（mask/zIndex/contentPadding）不依赖 shadow DOM，连接前即可应用
    this._applyHostSpec()
    if (this.shadowRoot && this.shadowRoot.getElementById('dlg-box')) this._applySpec()
    return this
  }

  /**
   * 注入单区实时内容到 body。
   *
   * 内容自动包入标准容器 `.dlg-content`（flex 伸展链 + 默认 padding，
   * 见 shell 样式）：普通内容零布局负担；需要内部滚动/填满的元素写
   * `flex:1; min-height:0` 即可。
   *
   * @param {HTMLElement} el
   * @param {{ padding?: boolean|string }} [opts] padding：缺省用 configure 的
   *   contentPadding（未配置则 14px 16px）；false = 全出血（data-bleed，grid 铺满等）；
   *   CSS padding 字符串 = 写入本次容器自身（每次调用重建容器，无实例级残留）。
   */
  setContent (el, opts = {}) {
    const body = this.shadowRoot?.getElementById('dlg-body')
    if (!body) { this._pendingContent = { kind: 'single', el, opts }; return this }
    body.replaceChildren()
    if (!el) return this
    const container = document.createElement('div')
    container.className = 'dlg-content'
    if (opts.padding === false) container.dataset.bleed = 'true'
    else if (typeof opts.padding === 'string' && opts.padding) container.style.padding = opts.padding
    container.appendChild(el)
    body.appendChild(container)
    return this
  }

  /**
   * 注入「左树 + 右内容」分栏布局（字典 help 用）。左侧固定宽可拖拽，右侧 flex。
   * @param {HTMLElement} leftEl
   * @param {HTMLElement} rightEl
   * @param {{ leftLabel?: string, leftIcon?: string, rightLabel?: string, rightIcon?: string, leftWidth?: number }} [opts]
   */
  setLeftRight (leftEl, rightEl, opts = {}) {
    const body = this.shadowRoot?.getElementById('dlg-body')
    if (!body) { this._pendingContent = { kind: 'leftRight', leftEl, rightEl, opts }; return this }
    body.replaceChildren()

    const leftW = Number(opts.leftWidth) > 0 ? Number(opts.leftWidth) : 240
    const left = this._buildRegion('explorer', opts.leftLabel || '分类', opts.leftIcon || 'tree', leftEl, leftW)
    const splitter = document.createElement('div')
    splitter.className = 'dlg-splitter'
    splitter.dataset.splitLeft = 'explorer'
    splitter.dataset.splitRight = 'content'
    const right = this._buildRegion('content', opts.rightLabel || '数据', opts.rightIcon || 'table', rightEl, 0)

    body.append(left, splitter, right)
    this._wireSplitter(body)
    return this
  }

  /** 仅注入右侧单区（grid 模式，无左树）。 */
  setSingleRegion (el, opts = {}) {
    const body = this.shadowRoot?.getElementById('dlg-body')
    if (!body) { this._pendingContent = { kind: 'singleRegion', el, opts }; return this }
    body.replaceChildren()
    const region = this._buildRegion('content', opts.label || '数据', opts.icon || 'table', el, 0)
    body.appendChild(region)
    return this
  }

  /**
   * 底部左侧额外区（放提示/状态），使用方可自由填充。
   * 空折叠态下调用即恢复 footer 显示（先切换再返回引用——使用方必然先拿引用后填充，
   * 任何基于"返回时检测子节点"的恢复在时序上都不成立）。
   * @returns {HTMLElement}
   */
  getFooterExtra () {
    const footer = this.shadowRoot?.getElementById('dlg-footer')
    if (footer && footer.dataset.collapsed === 'true') footer.removeAttribute('data-collapsed')
    return /** @type {HTMLElement} */ (this.shadowRoot?.getElementById('dlg-footer-extra'))
  }

  /** Promise 风格打开：需在 appendChild 之后调用（或本方法内部自动 append）。 */
  openModal () {
    if (!this.isConnected) document.body.appendChild(this)
    return new Promise((resolve) => { this._resolve = resolve })
  }

  /**
   * 外部主动关闭。force:true 时跳过 beforeClose 钩子（落盘成功后强制关闭用）。
   * @param {'confirm'|'cancel'|'button'} [action]
   * @param {string|{ force?: boolean }} [buttonIdOrOpts]  buttonId 或 { force }
   * @param {{ force?: boolean }} [opts]                    仅当第二参为 buttonId 时用
   */
  close (action = 'cancel', buttonIdOrOpts, opts) {
    let buttonId
    let force = false
    if (typeof buttonIdOrOpts === 'string') {
      buttonId = buttonIdOrOpts
      force = !!(opts && opts.force)
    } else if (buttonIdOrOpts && typeof buttonIdOrOpts === 'object') {
      force = !!buttonIdOrOpts.force
    }
    this._emitClose(action, buttonId, force)
  }

  // ── 生命周期 ─────────────────────────────────────────────────────────────

  /**
   * 首次插入 DOM 时：注入 shell 模板、应用配置、绑定按钮 / 拖拽 / 缩放 / Esc / 遮罩点击，
   * 注入待处理内容，并在首帧居中（多帧重试以应对尺寸未稳定）。
   */
  connectedCallback () {
    // 文档滚动锁：放在 _wired 守卫之前——元素被移动父节点时会触发 disconnected（释放）
    // + reconnected（守卫提前 return），若在守卫之后 acquire 会导致计数泄漏、提前解锁。
    if (!this._scrollLocked && this._spec.lockScroll !== false) {
      acquireScrollLock()
      this._scrollLocked = true
    }
    if (this._wired) return
    this._wired = true
    // eslint-disable-next-line no-restricted-syntax -- shadow root 模板
    this.shadowRoot.innerHTML = createDialogShellTemplate()
    this._applySpec()
    this._wireButtons()
    this._wireInteract()
    // 遮罩点击关闭（点 box 外的 :host 区域；closeOnMask:false 不关闭；
    // mask:false 非模态时 :host pointer-events:none 本就点不到，此处显式跳过以防合成事件路径）
    this.addEventListener('pointerdown', (e) => {
      const box = this.shadowRoot.getElementById('dlg-box')
      if (box && !e.composedPath().includes(box)
        && this._spec.closeOnMask !== false && this._spec.mask !== false) this._emitClose('cancel')
    })
    // Esc 栈顶判定（bubble 阶段监听不变，见各 handler 内注释）：
    // 不能用 capture + stopPropagation——同节点同阶段监听按注册顺序执行、stopPropagation
    // 拦不住同节点监听，且 floating 改 capture 会破坏 message-dialog(capture) 对本组件的屏蔽。
    this._onKeyDown = (e) => {
      if (e.key !== 'Escape') return
      const stack = document.querySelectorAll('cmx-floating-dialog')
      if (stack[stack.length - 1] !== this) return // 非栈顶：让位给最顶层实例
      // 更高层的 message/confirm 家族在场时让位（它们自行响应 Esc）
      if (document.querySelector('[data-cmx-message-dialog], [data-cmx-confirm-dialog]')) return
      if (this._spec.closeOnEsc === false) return // 栈顶禁 Esc：整次按键无弹框响应（吞掉，不穿透关下层）
      e.preventDefault()
      this._emitClose('cancel')
    }
    document.addEventListener('keydown', this._onKeyDown)
    // 应用待注入内容
    if (this._pendingContent) {
      const p = this._pendingContent
      this._pendingContent = null
      if (p.kind === 'single') this.setContent(p.el, p.opts)
      else if (p.kind === 'leftRight') this.setLeftRight(p.leftEl, p.rightEl, p.opts)
      else if (p.kind === 'singleRegion') this.setSingleRegion(p.el, p.opts)
    }
    // 居中（首帧尺寸未稳定时多试几次）；dock 抽屉模式跳过居中，由 CSS 控制贴边定位
    queueMicrotask(() => {
      if (this._spec && this._spec.dock) return
      requestAnimationFrame(() => {
        this._center()
        requestAnimationFrame(() => this._center())
      })
    })
  }

  /** 移出 DOM 时：释放文档滚动锁、移除全局 Esc 监听、abort 所有拖拽 / 缩放交互。 */
  disconnectedCallback () {
    if (this._scrollLocked) {
      releaseScrollLock()
      this._scrollLocked = false
    }
    if (this._onKeyDown) {
      document.removeEventListener('keydown', this._onKeyDown)
      this._onKeyDown = null
    }
    this._abort?.abort()
    this._abort = null
  }

  // ── 内部 ─────────────────────────────────────────────────────────────────

  /** 应用 host 级属性：非模态遮罩 / 层级 / 内容区默认 padding（幂等，连接前可调用）。 */
  _applyHostSpec () {
    const spec = this._spec || {}
    if (spec.mask === false) this.dataset.mask = 'false'
    else this.removeAttribute('data-mask')
    if (spec.zIndex != null) this.style.zIndex = String(spec.zIndex)
    // contentPadding 为累积合并语义：不传不改既有值；显式传 true/string/false 归位/覆盖
    if (spec.contentPadding === false) this.style.setProperty('--dlg-content-padding', '0px')
    else if (typeof spec.contentPadding === 'string' && spec.contentPadding) this.style.setProperty('--dlg-content-padding', spec.contentPadding)
    else if (spec.contentPadding === true) this.style.removeProperty('--dlg-content-padding')
  }

  /** 将 _spec 配置同步到 shell DOM：尺寸 CSS 变量、标题图标 / 文本 / 描述、确认 / 取消按钮、
   * 闭合行为与内容契约相关的新属性（mask/zIndex/contentPadding/fullscreen/closable 等）。 */
  _applySpec () {
    const sr = this.shadowRoot
    const spec = this._spec || {}
    this._applyHostSpec()
    const box = sr.getElementById('dlg-box')
    const isDock = spec.dock === 'right' || spec.dock === 'left'
    if (box instanceof HTMLElement) {
      // dock 抽屉模式：data-dock 触发 CSS 贴边定位；宽度可用 dialogWidth 覆盖默认 420px
      if (isDock) {
        box.dataset.dock = spec.dock
        box.style.setProperty('--dlg-w', spec.dialogWidth || '420px')
      } else {
        box.dataset.dock = ''
        if (spec.dialogWidth) box.style.setProperty('--dlg-w', spec.dialogWidth)
        if (spec.dialogHeight) box.style.setProperty('--dlg-h', spec.dialogHeight)
      }
      // dock 与 fullscreen 冲突：dock 优先，fullscreen 忽略
      if (isDock && spec.fullscreen) {
        console.warn('[cmx-floating-dialog] dock 与 fullscreen 冲突，fullscreen 已忽略（dock 优先）')
      }
      if (!isDock && spec.fullscreen) box.dataset.fullscreen = 'true'
      else box.removeAttribute('data-fullscreen')
      if (spec.resizable === false) box.dataset.noResize = 'true'
      else box.removeAttribute('data-no-resize')
      if (spec.draggable === false) box.dataset.noDrag = 'true'
      else box.removeAttribute('data-no-drag')
    }
    // host 级属性（mask/zIndex/contentPadding）由 _applyHostSpec 处理（见上）
    // closable：标题栏 ✕（按 id 查重幂等，多次 configure 不重复追加）
    const endEl = sr.getElementById('dlg-bar-end')
    let closeX = sr.getElementById('dlg-close-x')
    if (spec.closable && endEl) {
      if (!closeX) {
        closeX = document.createElement('ui5-icon')
        closeX.id = 'dlg-close-x'
        closeX.setAttribute('name', 'decline')
        closeX.setAttribute('title', '关闭')
        closeX.setAttribute('aria-label', '关闭')
        endEl.appendChild(closeX)
      }
    } else if (closeX) {
      closeX.remove()
    }
    const barIcon = sr.getElementById('dlg-bar-icon')
    const titleEl = sr.getElementById('dlg-bar-title')
    const descEl = sr.getElementById('dlg-bar-desc')
    if (barIcon) /** @type {any} */ (barIcon).name = safeDialogIconName(spec.icon || 'document')
    if (titleEl) titleEl.textContent = spec.title || ''
    if (descEl) {
      descEl.textContent = spec.description || ''
      descEl.hidden = !spec.description
    }
    const cancelBtn = sr.getElementById('dlg-cancel-btn')
    const confirmBtn = sr.getElementById('dlg-confirm-btn')
    if (cancelBtn) {
      cancelBtn.textContent = spec.cancelText || '取消'
      cancelBtn.hidden = spec.showCancel === false
    }
    if (confirmBtn) {
      confirmBtn.textContent = spec.confirmText || '确定'
      confirmBtn.hidden = spec.showConfirm === false
    }
    // 空 footer 折叠：无任何按钮且 extra 未填充时不渲染空条（getFooterExtra 调用即恢复）
    const footer = sr.getElementById('dlg-footer')
    if (footer) {
      const extra = sr.getElementById('dlg-footer-extra')
      const noButtons = spec.showConfirm === false && spec.showCancel === false && !Array.isArray(spec.buttons)
      const collapsed = noButtons && !(extra && extra.childNodes.length > 0)
      if (collapsed) footer.dataset.collapsed = 'true'
      else footer.removeAttribute('data-collapsed')
    }
  }

  /** 绑定底部按钮事件：自定义按钮（spec.buttons）、closable ✕、确认 / 取消按钮均触发 _emitClose。 */
  _wireButtons () {
    const sr = this.shadowRoot
    const spec = this._spec || {}
    const endEl = sr.getElementById('dlg-bar-end')
    if (endEl instanceof HTMLElement) {
      if (Array.isArray(spec.buttons)) {
        for (const btn of spec.buttons) {
          const b = document.createElement('ui5-button')
          b.setAttribute('design', btn.design || 'Transparent')
          if (btn.icon) b.setAttribute('icon', safeDialogIconName(btn.icon))
          if (btn.disabled) b.setAttribute('disabled', '')
          b.textContent = btn.text || ''
          b.dataset.dlgBtnId = String(btn.id)
          endEl.appendChild(b)
        }
      }
      // 委托同时覆盖自定义按钮与 closable ✕（✕ 由 _applySpec 创建，可能晚于本 wiring，
      // 委托绑定不依赖元素存在时机）
      endEl.addEventListener('click', (e) => {
        const path = e.composedPath()
        const closeX = sr.getElementById('dlg-close-x')
        if (closeX && path.includes(closeX)) {
          this._emitClose('cancel')
          return
        }
        const target = path.find(
          (el) => el instanceof HTMLElement && el.dataset.dlgBtnId != null,
        )
        if (target instanceof HTMLElement) this._emitClose('button', target.dataset.dlgBtnId)
      })
    }
    const cancelBtn = sr.getElementById('dlg-cancel-btn')
    const confirmBtn = sr.getElementById('dlg-confirm-btn')
    cancelBtn?.addEventListener('click', () => this._emitClose('cancel'))
    confirmBtn?.addEventListener('click', () => this._emitClose('confirm'))
  }

  /** 绑定拖拽（标题栏）与缩放（resize-root 八方位）交互，使用 AbortController 统一管理监听器。
   * draggable / resizable 显式 false 时跳过对应 wiring（dock 模式两者均不 wire）。 */
  _wireInteract () {
    // dock 抽屉模式：固定宽度 + 撑满高度，禁用拖拽与缩放（Esc / 遮罩关闭仍生效）
    if (this._spec && (this._spec.dock === 'right' || this._spec.dock === 'left')) return
    const sr = this.shadowRoot
    this._abort?.abort()
    const ac = new AbortController()
    this._abort = ac
    const { signal } = ac
    const bar = sr.getElementById('dlg-bar')
    const box = sr.getElementById('dlg-box')
    const endEl = sr.getElementById('dlg-bar-end')
    const resizeRoot = sr.querySelector('.dlg-resize-root')
    if (this._spec.draggable !== false && bar instanceof HTMLElement && box instanceof HTMLElement) {
      wireDialogBoxDrag({ bar, box, host: this, signal, ignoreEnd: endEl instanceof HTMLElement ? endEl : null })
    }
    if (this._spec.resizable !== false && resizeRoot instanceof HTMLElement && box instanceof HTMLElement) {
      wireDialogBoxResize({ rootEl: resizeRoot, box, host: this, signal, minWidth: DLG_MIN_W, minHeight: DLG_MIN_H })
    }
  }

  /** 将对话框 box 相对 host 视口居中（fullscreen 时跳过——由 CSS 铺满定位）。 */
  _center () {
    const box = this.shadowRoot.getElementById('dlg-box')
    if (!(box instanceof HTMLElement)) return
    if (box.dataset.fullscreen === 'true') return
    centerDialogBox(box, this)
  }

  /**
   * 构建一个区域面板（header + body 容器，body 内放注入元素）。
   * @param {string} region 'explorer' | 'content'
   * @param {string} label
   * @param {string} icon
   * @param {HTMLElement} contentEl
   * @param {number} fixedWidth >0 时固定宽（左栏），0 则 flex（右栏）
   * @returns {HTMLElement}
   */
  _buildRegion (region, label, icon, contentEl, fixedWidth) {
    const wrap = document.createElement('div')
    wrap.className = `dlg-region dlg-region-${region}`
    wrap.id = `dlg-region-${region}`
    if (fixedWidth > 0) wrap.style.flex = `0 0 ${fixedWidth}px`

    const header = document.createElement('div')
    header.className = 'dlg-region-header'
    const hdrIcon = document.createElement('ui5-icon')
    hdrIcon.setAttribute('name', safeDialogIconName(icon))
    hdrIcon.className = 'dlg-region-hdr-icon'
    const hdrLabel = document.createElement('span')
    hdrLabel.className = 'dlg-region-hdr-label'
    hdrLabel.textContent = label
    header.append(hdrIcon, hdrLabel)

    const bodyWrap = document.createElement('div')
    bodyWrap.className = 'dlg-region-body'
    if (contentEl) bodyWrap.appendChild(contentEl)

    wrap.append(header, bodyWrap)
    return wrap
  }

  /** 左右分栏拖拽：拖动 splitter 调整左栏（explorer）宽度。 */
  _wireSplitter (body) {
    const sp = body.querySelector('.dlg-splitter')
    if (!(sp instanceof HTMLElement)) return
    sp.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      sp.setPointerCapture(e.pointerId)
      sp.classList.add('dragging')
      const panel = body.querySelector('.dlg-region-explorer')
      if (!(panel instanceof HTMLElement)) return
      const startX = e.clientX
      const startW = panel.offsetWidth
      const onMove = (ev) => {
        const newW = Math.max(120, Math.min(600, startW + (ev.clientX - startX)))
        panel.style.flex = `0 0 ${newW}px`
      }
      const onUp = () => {
        sp.classList.remove('dragging')
        try { sp.releasePointerCapture(e.pointerId) } catch (_) {}
        sp.removeEventListener('pointermove', onMove)
        sp.removeEventListener('pointerup', onUp)
      }
      sp.addEventListener('pointermove', onMove)
      sp.addEventListener('pointerup', onUp)
    })
  }

  /**
   * @param {'confirm'|'cancel'|'button'} action
   * @param {string} [buttonId]
   * @param {boolean} [force]  true 跳过 beforeClose（外部 close(action,{force:true}) 用）
   */
  async _emitClose (action, buttonId, force = false) {
    if (this._closed) return
    // confirm / 自定义 button 关闭前给外部一次拦截机会（校验不过返回 false 则不关）；
    // cancel / Esc / 遮罩不拦截（用户取消不应被阻挡）；force 强制放行。
    if (!force && (action === 'confirm' || action === 'button')) {
      const hook = this._spec && this._spec.beforeClose
      if (typeof hook === 'function') {
        const ok = await hook({ action, buttonId })
        if (!ok) return // 不动 _closed、不发事件、不 remove，弹窗可再次操作
      }
    }
    this._closed = true
    const evName = action === 'confirm' ? 'cmx-dialog-confirm'
      : action === 'button' ? 'cmx-dialog-button'
      : 'cmx-dialog-cancel'
    this.dispatchEvent(new CustomEvent(evName, {
      bubbles: true, composed: true, detail: { action, buttonId },
    }))
    if (this._resolve) {
      this._resolve({ action, buttonId })
      this._resolve = null
    }
    this.remove()
  }
}

if (!customElements.get('cmx-floating-dialog')) {
  customElements.define('cmx-floating-dialog', CmxFloatingDialog)
}
