/**
 * <cmx-filter-bar> — 搜索 / 筛选条件区（slot 透传风格）。
 *
 * 收敛几乎每页都手搓的「input + select + 搜索/清空按钮」查询条件区。
 * 内置搜索区（show-search 时显示：搜索框 + 搜索/清空按钮）+ 默认 slot 放自定义条件控件 + actions slot 放右侧操作。
 *
 * @component cmx-filter-bar
 * @slot (默认) - 自定义条件控件（ui5-select / ui5-date-picker 等）
 * @slot actions - 右侧操作按钮区
 * @attr {boolean} collapsible - 条件多时可折叠收起
 * @attr {boolean} collapsed - 当前是否折叠
 * @attr {string} search-text - 搜索框文本（双向）
 * @attr {string} search-placeholder - 搜索框占位提示（默认「关键字」）
 * @attr {boolean} show-search - 是否显示内置搜索区（搜索框 + 搜索/清空按钮；默认 true）。
 *   false 时页面用 actions slot 放自己的 查询/重置——内置按钮不同步隐藏会与之重复成 4 按钮。
 * @attr {string} tone - neo 色调
 * @attr {string} data-cmx-skin - 皮肤：neo（默认）| none
 * @attr {string} data-cmx-skin-tone - neo 色调别名
 * @fires cmx-filter-search - 搜索/回车触发，detail: { text }（bubbles + composed）
 * @fires cmx-filter-reset - 清空触发，detail: {}（bubbles + composed）
 */
import '@ui5/webcomponents/dist/Input.js'
import '@ui5/webcomponents/dist/Button.js'
import '@ui5/webcomponents/dist/Icon.js'
import { CMX_FILTER_BAR_NEO_SKIN_CSS } from '../lib/cmx-filter-bar-neo-skin.js'
import { applyNeoSkin, applyPageStyleId } from '../lib/cmx-skin-runtime.js'

export class CmxFilterBar extends HTMLElement {
  static get observedAttributes () {
    return ['collapsible', 'collapsed', 'search-text', 'search-placeholder', 'search-label', 'show-search', 'collapse-overflow', 'tone', 'data-cmx-skin', 'data-cmx-skin-tone']
  }

  constructor () {
    super()
    this._root = null
    this._overflowEls = []   // 折叠隐藏的条件控件（collapse-overflow）
    this._moreOpen = false
    this._relayoutSeq = 0
    this._ro = null
  }

  connectedCallback () {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' })
      this.shadowRoot.innerHTML = `
        <style id="cmx-filter-bar-base">${this._css()}</style>
        <div class="filter-surface" part="surface">
          <div class="filter-row" id="row">
            <slot></slot>
            <span class="filter-search-group">
              <span class="filter-search-label" id="search-label"></span>
              <ui5-input class="filter-search" id="search" part="search"></ui5-input>
            </span>
            <ui5-button id="btn-search" design="Emphasized" icon="search" title="搜索">搜索</ui5-button>
            <ui5-button id="btn-reset" design="Transparent" icon="clear-all" title="清空">清空</ui5-button>
            <ui5-button id="btn-more" design="Transparent" class="filter-more" style="display:none"></ui5-button>
            <slot name="actions"></slot>
            <button type="button" class="filter-toggle" id="toggle" tabindex="0"></button>
          </div>
        </div>
      `
      this._root = this.shadowRoot
      this._bind()
    }
    this._applySkin()
    this._apply()
  }

    attributeChangedCallback (name) {
      if (!this.shadowRoot) return
      if (name === 'data-cmx-skin' || name === 'data-cmx-skin-tone' || name === 'tone') {
        this._applySkin()
      }
      this._apply()
      if (name === 'collapse-overflow') this._scheduleRelayout()
    }

  // ─── 命令式 API ─────────────────────────────────────────────────────
  /** @type {boolean} 可折叠 */
  get collapsible () { return this.hasAttribute('collapsible') }
  set collapsible (v) { v ? this.setAttribute('collapsible', '') : this.removeAttribute('collapsible') }

  /** @type {boolean} 折叠态 */
  get collapsed () { return this.hasAttribute('collapsed') }
  set collapsed (v) { v ? this.setAttribute('collapsed', '') : this.removeAttribute('collapsed') }

  /** @type {string} 搜索文本 */
  get searchText () { return this.getAttribute('search-text') || '' }
  set searchText (v) {
    if (v == null) this.removeAttribute('search-text')
    else this.setAttribute('search-text', String(v))
  }

  /** @type {string} 占位提示 */
  get searchPlaceholder () { return this.getAttribute('search-placeholder') || '关键字' }
  set searchPlaceholder (v) { this.setAttribute('search-placeholder', String(v || '关键字')) }

  /** @type {string} 搜索框标题标签（如「关键字」；空则不显示，与 slot 内条件控件 caption 对齐） */
  get searchLabel () { return this.getAttribute('search-label') || '' }
  set searchLabel (v) {
    if (v == null || v === '') this.removeAttribute('search-label')
    else this.setAttribute('search-label', String(v))
  }

  /** @type {boolean} 溢出条件折叠：首行放不下的 slot 条件控件收起，显示「更多筛选(n)」
   * （Fiori FilterBar 范式；搜索组与按钮恒在首行）。折叠仅隐藏不移动 DOM——
   * 页面对条件控件的 light DOM 查询/事件不受影响。 */
  get collapseOverflow () { return this.hasAttribute('collapse-overflow') }
  set collapseOverflow (v) { v ? this.setAttribute('collapse-overflow', '') : this.removeAttribute('collapse-overflow') }

  /** @type {boolean} 显示搜索框 */
  get showSearch () {
    // 缺省视为 true：未显式设 show-search="false" 即显示
    const v = this.getAttribute('show-search')
    return v == null || v === 'true' || v === ''
  }
  set showSearch (v) {
    if (v) this.setAttribute('show-search', 'true')
    else this.setAttribute('show-search', 'false')
  }

  /** @type {string} neo 色调 */
  get tone () { return this.getAttribute('tone') || '' }
  set tone (v) {
    if (v == null || v === '') this.removeAttribute('tone')
    else this.setAttribute('tone', String(v))
  }

  /**
   * 清空搜索框文本并派发 cmx-filter-reset。
   * 不清空默认 slot 里的自定义条件控件（由调用方自行重置）。
   */
  reset () {
    this.searchText = ''
    this.dispatchEvent(new CustomEvent('cmx-filter-reset', { bubbles: true, composed: true, detail: {} }))
  }

  /** 触发搜索，派发 cmx-filter-search */
  search () {
    this.dispatchEvent(new CustomEvent('cmx-filter-search', {
      bubbles: true, composed: true, detail: { text: this.searchText },
    }))
  }

  // ─── 内部：事件绑定 ─────────────────────────────────────────────────
  _bind () {
    const input = this._root.getElementById('search')
    const btnSearch = this._root.getElementById('btn-search')
    const btnReset = this._root.getElementById('btn-reset')
    const toggle = this._root.getElementById('toggle')
    // 输入双向同步到 search-text 属性（不触发事件，避免每次按键都查询）
    input.addEventListener('input', (e) => {
      this._settingFromInput = true
      this.searchText = e.target.value || ''
      this._settingFromInput = false
    })
    // 回车触发搜索
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.search() }
    })
    btnSearch.addEventListener('click', () => this.search())
    btnReset.addEventListener('click', () => this.reset())
    toggle.addEventListener('click', () => this._toggleCollapsed())
    toggle.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._toggleCollapsed() }
    })
    // 溢出条件折叠：slot 条件变化后重测（rAF 防抖，等布局稳定）
    const slot = this._root.querySelector('slot')
    if (slot) slot.addEventListener('slotchange', () => this._scheduleRelayout())
    const btnMore = this._root.getElementById('btn-more')
    if (btnMore) btnMore.addEventListener('click', () => this._toggleMore())
    // 容器宽度变化（分栏拖动/窗口缩放）时重测。
    // 只看宽度：重测自身会改变行高（隐藏/显示溢出项），不滤掉会抖动循环。
    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver((entries) => {
        const w = entries[0] && entries[0].contentRect ? entries[0].contentRect.width : 0
        if (this._lastRowW != null && Math.abs(w - this._lastRowW) < 1) return
        this._lastRowW = w
        this._scheduleRelayout()
      })
      this._ro.observe(this._root.getElementById('row'))
    }
  }

  disconnectedCallback () {
    if (this._ro) { this._ro.disconnect(); this._ro = null }
  }

  // ─── 内部：溢出条件折叠（collapse-overflow）────────────────────────
  /** 重测防抖：双 rAF 等布局稳定（UI5 组件注册/尺寸收敛有异步性）。 */
  _scheduleRelayout () {
    if (!this._root) return
    const seq = ++this._relayoutSeq
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (seq === this._relayoutSeq) this._relayoutOverflow()
    }))
  }

  /** 恢复被隐藏的条件控件（不动组件外样式属性以外的任何状态）。 */
  _clearOverflow () {
    for (const el of this._overflowEls) el.style.display = ''
    this._overflowEls = []
  }

  /** 测量 slot 条件控件折行情况：超出首行的隐藏 + 显示「更多筛选(n)」。
   *  仅隐藏不移动 DOM（light DOM 查询/事件不受影响）；展开态不重收。 */
  _relayoutOverflow () {
    if (!this._root) return
    const row = this._root.getElementById('row')
    const btnMore = this._root.getElementById('btn-more')
    const slot = this._root.querySelector('slot')
    if (!row || !btnMore || !slot) return
    if (!this.collapseOverflow) {
      this._clearOverflow()
      btnMore.style.display = 'none'
      return
    }
    // 展开态维持展开（用户显式操作优先，收起时再重测）
    if (this._moreOpen) { this._updateMoreLabel(); return }
    // 干净基线：全显 + 藏 more，再测折行
    this._clearOverflow()
    btnMore.style.display = 'none'
    const els = slot.assignedElements({ flatten: true })
      .filter((el) => el instanceof HTMLElement && el.getBoundingClientRect().height > 0)
    // 基准取第一个条件元素的 top（相对 row 会被 padding 下移，直接比 row 会把首行误判成折行）
    const base = els.length ? els[0].getBoundingClientRect().top : 0
    const over = els.filter((el) => el.getBoundingClientRect().top > base + 4)
    if (over.length) {
      for (const el of over) el.style.display = 'none'
      this._overflowEls = over
      btnMore.style.display = ''
    }
    this._updateMoreLabel()
  }

  _updateMoreLabel () {
    const btnMore = this._root && this._root.getElementById('btn-more')
    if (!btnMore) return
    btnMore.textContent = this._moreOpen ? '收起 ▴' : `更多筛选(${this._overflowEls.length}) ▾`
  }

  _toggleMore () {
    this._moreOpen = !this._moreOpen
    if (this._moreOpen) {
      this._clearOverflow()
      this._updateMoreLabel()
    } else {
      this._relayoutOverflow()
    }
  }

  _toggleCollapsed () {
    if (!this.collapsible) return
    if (this.collapsed) this.removeAttribute('collapsed')
    else this.setAttribute('collapsed', '')
  }

  // ─── 内部：皮肤 / 渲染 ──────────────────────────────────────────────
  _applySkin () {
    /* 把 tone 同步到 data-cmx-skin-tone（neo 皮肤按 :host([data-cmx-skin-tone="xxx"]) 匹配色调）；
       值未变时跳过 setAttribute，避免触发 attributeChangedCallback 无限递归 */
    if (this.tone && this.getAttribute('data-cmx-skin-tone') !== this.tone) this.setAttribute('data-cmx-skin-tone', this.tone)
    applyNeoSkin({
      host: this,
      shadow: this.shadowRoot,
      idBase: 'cmx-filter-bar',
      neoCss: CMX_FILTER_BAR_NEO_SKIN_CSS,
      globalKey: '__cmxDefaultFilterBarSkin',
    })
    applyPageStyleId(this, this.shadowRoot, 'cmx-filter-bar')
  }

  _apply () {
    if (!this._root) return
    const input = this._root.getElementById('search')
    const toggle = this._root.getElementById('toggle')
    // 搜索区显隐（show-search=false 整组隐藏，含 搜索/清空 按钮——两者只服务于内置搜索框：
    // search() 仅派发 searchText、reset() 仅清 searchText；留在外面的筛选条件由页面自己的
    // 查询/重置（actions slot）负责，否则同排出现 4 个语义重复的按钮）。
    const show = this.showSearch
    const group = this._root.querySelector('.filter-search-group')
    if (group) group.style.display = show ? '' : 'none'
    const btnSearch = this._root.getElementById('btn-search')
    if (btnSearch) btnSearch.style.display = show ? '' : 'none'
    const btnReset = this._root.getElementById('btn-reset')
    if (btnReset) btnReset.style.display = show ? '' : 'none'
    const label = this._root.getElementById('search-label')
    if (label) {
      const text = this.searchLabel
      label.textContent = text
      label.style.display = text ? '' : 'none'
    }
    input.style.display = show ? '' : 'none'
    input.placeholder = this.searchPlaceholder
    // 同步 searchText 到输入框（避免来自属性设置时反向覆盖）
    if (!this._settingFromInput && input.value !== this.searchText) {
      input.value = this.searchText
    }
    // 折叠切换按钮（仅 collapsible 时显示）
    toggle.style.display = this.collapsible ? '' : 'none'
    toggle.textContent = this.collapsed ? '展开 ▾' : '收起 ▴'
    // 折叠态：隐藏条件行（保留搜索/清空在右侧可用则需更复杂布局；这里简化为整行收起）
    this._root.querySelector('.filter-row').style.display = this.collapsed ? 'none' : ''
  }

  _css () {
    return `
      :host { display: block; box-sizing: border-box; }
      :host([hidden]) { display: none; }
      .filter-surface {
        background: var(--sapGroup_ContentBackground, #fff);
        border: 1px solid var(--sapGroup_ContentBorderColor, #d9d9d9);
        border-radius: 4px;
      }
      .filter-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex-wrap: wrap;
        padding: 0.5rem 0.7rem;
      }
      .filter-search-group {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        flex: 0 1 17rem;
        min-width: 8rem;
      }
      .filter-search-label {
        font-size: 0.74rem;
        color: var(--sapContent_LabelColor, #6a6d70);
        white-space: nowrap;
      }
      .filter-search { flex: 1 1 auto; min-width: 6rem; }
      .filter-toggle {
        margin-left: auto;
        background: none;
        border: none;
        cursor: pointer;
        color: var(--sapContent_LabelColor, #6a6d70);
        font-size: 0.74rem;
        padding: 0.2rem 0.4rem;
      }
    `
  }
}

if (!customElements.get('cmx-filter-bar')) customElements.define('cmx-filter-bar', CmxFilterBar)
