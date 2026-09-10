/**
 * 通用分页栏组件（<cmx-pager>），平台级，独立可用，可选协作协调器。
 *
 * 双模式：
 *   ① 独立模式（默认）：组件自管 page/pageSize/total，派发 page-change 事件，
 *      外部监听后自由拉数据（fetch/service/任意），回填 pager.total = N。
 *   ② 协作模式：设 master-slave-id + layer 后，操作转发到协调器，
 *      状态从协调器 page-changed 事件反向同步。
 *
 * @component
 *
 * 用法（独立）：
 *   <cmx-pager page-size="5" page-sizes="5,10,20,50"></cmx-pager>
 *   pager.addEventListener('page-change', e => {
 *     const { page, pageSize, offset } = e.detail
 *     fetchData(page, pageSize).then(({ rows, total }) => {
 *       pager.total = total
 *       renderRows(rows)
 *     })
 *   })
 *
 * 用法（协作）：
 *   <cmx-pager master-slave-id="ms" layer="cv_batch"></cmx-pager>
 *
 * @fires page-change - detail:{ page, pageSize, total, totalPages, offset, reason }
 *                      页码/页大小变化时派发（仅独立模式；协作模式由协调器派发 page-changed）
 *
 * 关键属性（标签属性）：
 *   page            - 当前页码（从 1 起）
 *   page-size       - 每页条数
 *   page-sizes      - 可选每页条数列表（逗号分隔，如 "5,10,20,50"）
 *   total           - 总记录数（null 时显示 '?'）
 *   compact         - 紧凑模式
 *   no-total        - 隐藏总数文案：信息段只显示「第 x / y 页」，不显示「（共 N 条）」。
 *                     默认显示总数。窄容器（侧栏等）关掉它避免换行/截断，总条数可由页面自身计数补足
 *   master-slave-id - 协作模式：绑定的协调器 id
 *   layer           - 协作模式：分页所辖层标识
 *
 * 命令式 API：
 *   pager.nextPage() / prevPage() / firstPage() / lastPage() / gotoPage(n) / setPageSize(n)
 *   pager.total = 1234
 *   pager.getPagingInfo()  // { page, pageSize, total, totalPages, offset }
 */

import '@ui5/webcomponents/dist/Button.js'
import '@ui5/webcomponents/dist/Select.js'
import '@ui5/webcomponents/dist/Option.js'

/** 分页栏内联样式（Shadow DOM 内作用域，跟随 SAP 主题变量） */
const TEMPLATE_CSS = `
  :host { display: inline-flex; }
  .cmx-pager-root {
    display: flex; align-items: center; gap: 4px;
    padding: 2px 4px; font-size: 12px;
    color: var(--sapContent_LabelColor, #6a6d70);
    background: var(--sapList_HeaderBackground, transparent);
    min-height: 24px; box-sizing: border-box;
  }
  .cmx-pager-info {
    flex: 1 1 auto; min-width: 100px; text-align: center;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .cmx-pager-size { width: 72px; }
  .cmx-pager-suffix { color: var(--sapContent_LabelColor, #6a6d70); }
  .cmx-pager-placeholder {
    padding: 4px 8px; font-size: 12px; opacity: 0.6;
    color: var(--sapContent_LabelColor, #6a6d70);
    font-style: italic;
  }
`

const TEMPLATE_HTML = `
  <style>${TEMPLATE_CSS}</style>
  <div class="cmx-pager-root" id="root" part="root">
    <ui5-button id="first" design="Transparent" title="首页" part="first">‹‹</ui5-button>
    <ui5-button id="prev" design="Transparent" title="上一页" part="prev">‹</ui5-button>
    <span class="cmx-pager-info" id="info" part="info">-</span>
    <ui5-button id="next" design="Transparent" title="下一页" part="next">›</ui5-button>
    <ui5-button id="last" design="Transparent" title="末页" part="last">››</ui5-button>
    <ui5-select class="cmx-pager-size" id="size" part="size"></ui5-select>
    <span class="cmx-pager-suffix" part="suffix">条/页</span>
  </div>
  <div class="cmx-pager-placeholder" id="placeholder" hidden></div>
`

export class CmxPager extends HTMLElement {
  /** 返回需要监听的 attribute 列表（驱动 attributeChangedCallback） */
  static get observedAttributes () {
    return ['page', 'page-size', 'page-sizes', 'total', 'compact', 'no-total', 'master-slave-id', 'layer']
  }

  constructor () {
    super()
    this.attachShadow({ mode: 'open' })
    // 内部状态（独立模式权威；协作模式仅作渲染缓存，来源是协调器）
    /** @type {number} 当前页码（从 1 起） */
    this._page = 1
    /** @type {number} 每页条数 */
    this._pageSize = 50
    /** @type {number|null} 总记录数，null 表示未知（显示 '?'） */
    this._total = null        // null = 未知（显示 '?'）
    // 协作模式
    /** @type {object|null} 绑定的协调器实例（master-slave） */
    this._ms = null
    /** @type {string|null} 协作模式所辖层标识 */
    this._boundLayer = null
    /** @type {Function|null} 协调器 page-changed 事件监听句柄 */
    this._boundMsListener = null
    // UI 防抖
    /** @type {boolean} 同步 select 选中项时的防抖标志，避免触发 change 回环 */
    this._syncing = false
    // 协调器连接轮询
    /** @type {number|null} 等待协调器就绪的轮询定时器 id */
    this._waitTimer = null
  }

  // ─── 生命周期 ─────────────────────────────────────────────────────────

  /** 挂载时渲染模板、缓存 DOM、绑定事件、初始化状态并尝试接入协作模式 */
  connectedCallback () {
    this.shadowRoot.innerHTML = TEMPLATE_HTML
    this._cacheDom()
    this._applyCompact()
    this._populateSizeSelect()
    this._wireButtons()
    this._wireSizeChange()
    // 初始状态从属性读（独立模式）
    this._syncStateFromAttrs()
    // 尝试协作模式
    this._tryAttachCoop()
    if (!this._ms && this._isCoopConfigured()) this._startWait()
    this._refresh()
  }

  /** 卸载时停止协调器轮询并解绑协调器监听 */
  disconnectedCallback () {
    this._stopWait()
    this._detachMs()
  }

  /**
   * attribute 变化回调：按属性名分发到对应处理（页大小列表 / 紧凑模式 / 状态同步 / 协作重连）。
   * @param {string} name 变化的属性名
   * @param {string|null} oldV 旧值
   * @param {string|null} newV 新值
   */
  attributeChangedCallback (name, oldV, newV) {
    if (oldV === newV || !this.shadowRoot) return
    switch (name) {
      case 'page-sizes':
        this._populateSizeSelect()
        this._refresh()
        break
      case 'compact':
        this._applyCompact()
        break
      case 'no-total':
        this._refresh()
        break
      case 'page':
      case 'page-size':
      case 'total':
        this._syncStateFromAttrs()
        this._refresh()
        break
      case 'master-slave-id':
      case 'layer':
        // 协作模式配置变化，重连
        this._detachMs()
        this._tryAttachCoop()
        if (!this._ms && this._isCoopConfigured()) this._startWait()
        this._refresh()
        break
    }
  }

  // ─── 公开属性（属性映射 + 命令式 getter/setter） ─────────────────────

  /** @type {number} 当前页码（自动夹紧到 [1, totalPages]） */
  get page () { return this._page }
  set page (n) {
    const total = this._totalPages()
    const next = Math.max(1, Math.min(Number(n) || 1, total || 1))
    if (this._page === next) return
    this._page = next
    this.setAttribute('page', String(next))
  }

  /** @type {number} 每页条数（不小于 1） */
  get pageSize () { return this._pageSize }
  set pageSize (n) {
    const next = Math.max(1, Number(n) || 50)
    if (this._pageSize === next) return
    this._pageSize = next
    this.setAttribute('page-size', String(next))
  }

  /** @type {number|null} 总记录数，null 表示未知 */
  get total () { return this._total }
  set total (n) {
    const next = (n == null || n === '') ? null : Math.max(0, Number(n) || 0)
    if (this._total === next) return
    this._total = next
    if (next == null) this.removeAttribute('total')
    else this.setAttribute('total', String(next))
  }

  /** 计算属性：总页数。total 未知时返回 null。 */
  get totalPages () { return this._totalPages() }

  /**
   * 返回完整分页信息。
   * @returns {{page:number, pageSize:number, total:number|null, totalPages:number|null, offset:number}}
   */
  getPagingInfo () {
    return {
      page: this._page,
      pageSize: this._pageSize,
      total: this._total,
      totalPages: this._totalPages(),
      offset: (this._page - 1) * this._pageSize,
    }
  }

  // ─── 命令式操作 ─────────────────────────────────────────────────────

  /** 跳到下一页（协作模式转发协调器） */
  nextPage () { this._goto(this._page + 1, 'next') }
  /** 跳到上一页（协作模式转发协调器） */
  prevPage () { this._goto(this._page - 1, 'prev') }
  /** 跳到首页（协作模式转发协调器） */
  firstPage () { this._goto(1, 'first') }
  /** 跳到末页（协作模式转发协调器） */
  lastPage () {
    const t = this._totalPages()
    this._goto(t || this._page, 'last')
  }

  /**
   * 跳到指定页码。
   * @param {number} n 目标页码（从 1 起）
   */
  gotoPage (n) { this._goto(Number(n) || 1, 'goto') }

  /**
   * 设置每页大小。默认重置到第 1 页（offset 分页常规行为）。
   * @param {number} n
   * @param {object} [opts] { resetPage?: boolean = true }
   */
  setPageSize (n, opts = {}) {
    const resetPage = opts.resetPage !== false
    const next = Math.max(1, Number(n) || 50)
    if (this._pageSize === next && !resetPage) return
    if (this._isCoop()) {
      // 协作模式：转发到协调器（会重置到第 1 页并 reload），状态由 page-changed 反向同步。
      this._ms?.setPageSize?.(next)
      return
    }
    // 独立模式：本地状态 + 派发事件
    this._pageSize = next
    this.setAttribute('page-size', String(next))
    if (resetPage) this._page = 1
    this._syncSizeSelect(next)
    this._dispatchChange('size')
    this._refresh()
  }

  // ─── 内部：DOM 缓存与事件 ───────────────────────────────────────────

  /** 缓存 Shadow DOM 内各操作元素的引用，避免后续重复查询 */
  _cacheDom () {
    const s = this.shadowRoot
    this._rootEl = s.getElementById('root')
    this._firstBtn = s.getElementById('first')
    this._prevBtn = s.getElementById('prev')
    this._infoEl = s.getElementById('info')
    this._nextBtn = s.getElementById('next')
    this._lastBtn = s.getElementById('last')
    this._sizeSel = s.getElementById('size')
    this._placeholderEl = s.getElementById('placeholder')
  }

  /** compact 模式下隐藏首页/末页按钮 */
  _applyCompact () {
    if (!this._firstBtn) return
    const compact = this.hasAttribute('compact')
    this._firstBtn.style.display = compact ? 'none' : ''
    this._lastBtn.style.display = compact ? 'none' : ''
  }

  /** 根据 page-sizes 属性填充页大小下拉选项，并标记当前选中 */
  _populateSizeSelect () {
    if (!this._sizeSel) return
    const sizes = this._parsePageSizes()
    const current = this._pageSize || sizes[0]
    this._sizeSel.innerHTML = sizes.map((n) =>
      `<ui5-option${n === current ? ' selected' : ''}>${n}</ui5-option>`).join('')
  }

  /** 解析 page-sizes 属性为正整数数组，无效时回退默认 [50,100,200] */
  _parsePageSizes () {
    const raw = String(this.getAttribute('page-sizes') || '50,100,200')
    const arr = raw.split(',').map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0)
    return arr.length ? arr : [50, 100, 200]
  }

  /** 绑定首页/上页/下页/末页按钮的点击事件 */
  _wireButtons () {
    this._firstBtn?.addEventListener('click', () => this.firstPage())
    this._prevBtn?.addEventListener('click', () => this.prevPage())
    this._nextBtn?.addEventListener('click', () => this.nextPage())
    this._lastBtn?.addEventListener('click', () => this.lastPage())
  }

  /** 绑定页大小下拉的 change 事件（防抖期内忽略，避免回环） */
  _wireSizeChange () {
    this._sizeSel?.addEventListener('change', (e) => {
      if (this._syncing) return
      const opt = e.detail?.selectedOption
      const n = parseInt(opt?.textContent, 10)
      if (Number.isFinite(n) && n > 0) this.setPageSize(n)
    })
  }

  /**
   * 同步页大小下拉的选中项（通过切换 option 的 selected 属性实现，规避只读 selectedOption）。
   * @param {number} size 目标页大小
   */
  _syncSizeSelect (size) {
    if (!this._sizeSel || size == null) return
    // ui5-select.selectedOption 是只读 getter（赋值会抛 TypeError）。
    // 改 option 的 selected 属性来切换选中项（与 cmx-ui5-form.js 同样的做法）。
    this._syncing = true
    try {
      const target = String(size)
      for (const o of Array.from(this._sizeSel.children)) {
        const match = String(o.textContent) === target
        if (match && !o.hasAttribute('selected')) o.setAttribute('selected', '')
        else if (!match && o.hasAttribute('selected')) o.removeAttribute('selected')
      }
    } finally {
      this._syncing = false
    }
  }

  // ─── 内部：状态流转 ─────────────────────────────────────────────────

  /** 从标签属性（page/page-size/total）同步到内部状态（仅独立模式初始化用） */
  _syncStateFromAttrs () {
    if (this.hasAttribute('page')) {
      const n = Number(this.getAttribute('page'))
      if (Number.isFinite(n) && n > 0) this._page = Math.floor(n)
    }
    if (this.hasAttribute('page-size')) {
      const n = Number(this.getAttribute('page-size'))
      if (Number.isFinite(n) && n > 0) this._pageSize = Math.floor(n)
    }
    if (this.hasAttribute('total')) {
      const raw = this.getAttribute('total')
      this._total = (raw == null || raw === '') ? null : Math.max(0, Number(raw) || 0)
    } else if (this._total === undefined) {
      this._total = null
    }
  }

  /**
   * 跳页内部实现：协作模式转发协调器，独立模式更新本地状态并派发 page-change。
   * @param {number} targetPage 目标页码
   * @param {string} reason 跳页原因（next/prev/first/last/goto）
   */
  _goto (targetPage, reason) {
    if (this._isCoop()) {
      // 协作模式：转发到协调器，状态由 page-changed 反向同步
      const ms = this._ms
      if (!ms) return
      if (reason === 'next') ms.nextPage?.()
      else if (reason === 'prev') ms.prevPage?.()
      else if (reason === 'first') ms.gotoPage?.(1)
      else if (reason === 'last') {
        const info = ms.getPagingInfo?.()
        ms.gotoPage?.(info?.totalPages ?? info?.page ?? 1)
      } else {
        ms.gotoPage?.(targetPage)
      }
      return
    }
    // 独立模式：本地状态 + 派发事件
    const total = this._totalPages()
    const next = Math.max(1, Math.min(targetPage, total || targetPage))
    if (this._page === next) return
    this._page = next
    this.setAttribute('page', String(next))
    this._dispatchChange(reason)
    this._refresh()
  }

  /**
   * 派发 page-change 自定义事件（协作模式不派发，由协调器派发 page-changed）。
   * @param {string} reason 跳页原因
   */
  _dispatchChange (reason) {
    if (this._isCoop()) return   // 协作模式不派发（由协调器派发 page-changed）
    this.dispatchEvent(new CustomEvent('page-change', {
      detail: { ...this.getPagingInfo(), reason },
      bubbles: true,
      composed: true,
    }))
  }

  /** 计算总页数：total 未知返回 null，total 为 0 返回 0，否则向上取整 */
  _totalPages () {
    if (this._total == null || this._total === 0) return this._total == null ? null : 0
    return Math.max(1, Math.ceil(this._total / this._pageSize))
  }

  // ─── 内部：协作模式连接 ─────────────────────────────────────────────

  /** 是否配置了协作模式（仅凭 master-slave-id 即可，layer 可选） */
  _isCoopConfigured () {
    // 只凭 master-slave-id 即可进协作模式；layer 可选（未配时连上协调器后自动用根层）。
    return !!this.getAttribute('master-slave-id')
  }

  /** 是否已成功接入协作模式（协调器 + 层都已就绪） */
  _isCoop () {
    return !!(this._ms && this._boundLayer)
  }

  /** 定位宿主元素：优先页面 host 标记，其次 shadowRoot 顶层 host，最后 workspace */
  _findHost () {
    // 优先 closest [data-cmx-html-page-host]（设计器预览/运行页都用这个标记）
    const pageHost = this.closest('[data-cmx-html-page-host]')
    if (pageHost) return pageHost
    // 兜底 1：shadowRoot 顶层 host（门户运行时）
    const root = this.getRootNode()
    if (root && root.host) return root.host
    // 兜底 2：closest workspace
    return this.closest('[data-cmx-workspace-id]') || null
  }

  /**
   * 尝试从宿主上取协调器实例并绑定 page-changed 监听。
   * @returns {boolean} 是否接入成功
   */
  _tryAttachCoop () {
    if (!this._isCoopConfigured()) return false
    const host = this._findHost()
    if (!host) return false
    const msId = this.getAttribute('master-slave-id')
    const attrLayer = this.getAttribute('layer')
    const ms = host[msId]
    if (!ms) return false
    if (typeof ms.getPagingInfo !== 'function' || typeof ms.addEventListener !== 'function') {
      this._showPlaceholder('协调器版本过低（缺少分页 API）')
      return false
    }
    this._ms = ms
    // layer 优先取属性值，缺失时用协调器根层 id（分页层永远等于根层）。
    this._boundLayer = attrLayer || ms.getRootId?.() || attrLayer || ''
    this._boundMsListener = () => this._syncFromCoop()
    ms.addEventListener('page-changed', this._boundMsListener)
    this._syncFromCoop()
    return true
  }

  /** 解绑协调器监听并清空协作相关句柄 */
  _detachMs () {
    if (this._ms && this._boundMsListener) {
      this._ms.removeEventListener('page-changed', this._boundMsListener)
    }
    this._ms = null
    this._boundLayer = null
    this._boundMsListener = null
  }

  /** 从协调器拉取分页信息镜像到本地状态（不回写属性，避免循环） */
  _syncFromCoop () {
    if (!this._ms) return
    const info = this._ms.getPagingInfo?.()
    if (!info) {
      this._showPlaceholder('协调器未启用分页（勾选协调器「自动加载」并放置 cmx-pager 即可）')
      return
    }
    this._hidePlaceholder()
    // 协作模式下，本地状态只是协调器状态的镜像（不触发 setAttribute 回写，避免循环）
    this._page = info.page || 1
    this._pageSize = info.pageSize || this._pageSize
    this._total = info.total != null ? info.total : null
    this._syncSizeSelect(this._pageSize)
    this._refresh()
  }

  /** 启动轮询等待协调器就绪（50ms 一次，最多 40 次 = 2s） */
  _startWait () {
    if (this._waitTimer) return
    let tries = 0
    this._waitTimer = setInterval(() => {
      tries++
      if (this._tryAttachCoop() || tries > 40) {        // 40 × 50ms = 2s
        clearInterval(this._waitTimer)
        this._waitTimer = null
        if (tries > 40 && !this._ms) {
          const msId = this.getAttribute('master-slave-id') || '(未设置)'
          this._showPlaceholder(`等待协调器「${msId}」超时，运行时生效`)
        }
      }
    }, 50)
  }

  /** 停止协调器等待轮询 */
  _stopWait () {
    if (this._waitTimer) {
      clearInterval(this._waitTimer)
      this._waitTimer = null
    }
  }

  // ─── 内部：渲染 ─────────────────────────────────────────────────────

  /** 刷新分页栏 UI：信息文案、按钮 disabled 态、页大小下拉选中项、占位态 */
  _refresh () {
    if (!this._infoEl) return

    // 协作模式但协调器还没就绪：显示占位，由 _syncFromCoop / _showPlaceholder 控制
    if (this._isCoopConfigured() && !this._ms) {
      // 占位文字由 _startWait 超时后设置；初次进入时给一个轻量默认
      if (this._placeholderEl.hidden) {
        this._showPlaceholder('正在连接协调器…')
      }
      return
    }
    this._hidePlaceholder()

    // 文案：第 N / M 页（共 X 条）；no-total 时只显示页码部分（隐藏「（共 X 条）」）
    const totalPages = this._totalPages()
    let text
    if (this._total === 0) {
      text = '无数据'
    } else if (this._total == null) {
      // total 未知（独立模式未回填）
      text = `第 ${this._page} 页`
    } else if (this.hasAttribute('no-total')) {
      text = `第 ${this._page} / ${totalPages} 页`
    } else {
      text = `第 ${this._page} / ${totalPages} 页（共 ${this._total} 条）`
    }
    this._infoEl.textContent = text
    this._infoEl.hidden = false

    // 按钮 disabled 规则
    const isFirst = this._page <= 1
    const isLast = totalPages != null && this._page >= totalPages
    if (this._firstBtn) this._firstBtn.disabled = isFirst
    if (this._prevBtn) this._prevBtn.disabled = isFirst
    // total 未知时不禁用 next/last（让用户点了再触发外部拉取）
    if (this._nextBtn) this._nextBtn.disabled = (totalPages === 0) ? true : isLast
    if (this._lastBtn) this._lastBtn.disabled = (totalPages === 0) ? true : isLast

    // 同步 select 当前值
    this._syncSizeSelect(this._pageSize)
  }

  /**
   * 显示占位文案并隐藏主分页栏（协调器未就绪 / 版本过低等场景）。
   * @param {string} [msg] 占位文案
   */
  _showPlaceholder (msg) {
    if (!this._placeholderEl) return
    this._placeholderEl.textContent = msg || '分页栏（运行时生效）'
    this._placeholderEl.hidden = false
    if (this._rootEl) this._rootEl.style.display = 'none'
  }

  /** 隐藏占位区并恢复主分页栏显示 */
  _hidePlaceholder () {
    if (this._placeholderEl) this._placeholderEl.hidden = true
    if (this._rootEl) this._rootEl.style.display = ''
  }
}

if (!customElements.get('cmx-pager')) {
  customElements.define('cmx-pager', CmxPager)
}
