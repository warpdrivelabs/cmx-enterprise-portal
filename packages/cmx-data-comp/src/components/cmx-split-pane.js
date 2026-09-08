/**
 * <cmx-split-pane> — 轻量级可拖拽调整的双面板分割布局容器。
 *
 * 通过 slot="first" / slot="second" 放置两个子面板，中间分隔条可拖拽改变占比；
 * 拖拽结束后递归刷新子组件（cmx-revo-grid / cmx-tabulator / cmx-ui5-form / cmx-web-treeview）布局。
 *
 * @component
 * @fires cmx-split-change - 拖拽调整结束触发（bubbles + composed），detail: { size }
 * @attr {('horizontal'|'vertical')} orientation - 分割方向：horizontal 为上下布局，vertical 为左右布局
 * @attr {string} size - 首面板尺寸，如 '40%' 或 '240px'
 * @attr {number} min-first - 首面板最小尺寸（px，默认 120）
 * @attr {number} min-second - 次面板最小尺寸（px，默认 120）
 * @attr {number} splitter-size - 分隔条粗细（px，默认 3）
 */
/**
 * 读取元素的数值属性，缺省或非法时返回 fallback。
 * @param {Element} el 元素
 * @param {string} name 属性名
 * @param {number} fallback 缺省值
 * @returns {number}
 */
function numAttr(el, name, fallback) {
  const raw = el.getAttribute(name)
  if (raw == null || raw === '') return fallback
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}

/**
 * 递归刷新子组件布局：优先调 refreshLayout / redraw，并深入 shadowRoot 与 light DOM
 * 查找 cmx-revo-grid / cmx-tabulator / cmx-ui5-form / cmx-web-treeview 同样刷新。
 * @param {Element} el 待刷新的元素
 */
function refreshChild(el) {
  if (!el) return
  try {
    if (typeof el.refreshLayout === 'function') el.refreshLayout()
    else if (typeof el.redraw === 'function') el.redraw()
  } catch (_) {}
  if (el.shadowRoot) {
    el.shadowRoot.querySelectorAll('cmx-revo-grid,cmx-tabulator,cmx-ui5-form,cmx-web-treeview').forEach(refreshChild)
  }
  if (typeof el.querySelectorAll === 'function') {
    el.querySelectorAll('cmx-revo-grid,cmx-tabulator,cmx-ui5-form,cmx-web-treeview').forEach(refreshChild)
  }
}

export class CmxSplitPane extends HTMLElement {
  /** 声明式属性：orientation/size/min-first/min-second/splitter-size 变化时重应用样式。 */
  static get observedAttributes() {
    return ['orientation', 'size', 'min-first', 'min-second', 'splitter-size']
  }

  constructor() {
    super()
    this._drag = null        // {object|null} 拖拽会话状态 { horizontal, start, size }
    // 注：_root / _first / _second / _splitter / _refreshTimer 在 connectedCallback 内赋值
    this._refreshTimer = null // {number|null} 子组件刷新防抖定时器句柄
  }

  /** 元素挂载：首次构建 shadow DOM（含插槽/分隔条）并应用尺寸配置。 */
  connectedCallback() {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' })
      this.shadowRoot.innerHTML = `
        <style>${this._css()}</style>
        <div id="root" class="root">
          <div id="first" class="pane pane-first"><slot name="first"></slot></div>
          <div id="splitter" class="splitter" role="separator" tabindex="0" aria-label="调整区域大小"></div>
          <div id="second" class="pane pane-second"><slot name="second"></slot></div>
        </div>
      `
      this._root = this.shadowRoot.getElementById('root')
      this._first = this.shadowRoot.getElementById('first')
      this._second = this.shadowRoot.getElementById('second')
      this._splitter = this.shadowRoot.getElementById('splitter')
      this._bind()
    }
    this._apply()
  }

  /** 属性变化回调：shadowRoot 就绪后重新应用尺寸/方向配置。 */
  attributeChangedCallback() {
    if (this.shadowRoot) this._apply()
  }

  /**
   * 设置首面板尺寸（写回 size 属性，触发 attributeChangedCallback 统一应用）。
   * @param {string|number} value 尺寸值，如 '40%' / '240px'
   */
  setSize(value) {
    if (value == null || value === '') return
    this.setAttribute('size', String(value))
  }

  /** 手动触发子组件布局刷新（防抖）。 */
  refresh() {
    this._refreshChildren()
  }

  /** 绑定分隔条的拖拽（pointerdown）与键盘（方向键）交互。 */
  _bind() {
    this._splitter.addEventListener('pointerdown', (ev) => this._startDrag(ev))
    this._splitter.addEventListener('keydown', (ev) => {
      // Shift 加速：40px/步；普通 16px/步。按方向调整首面板尺寸。
      const step = ev.shiftKey ? 40 : 16
      if (this._isHorizontal()) {
        if (ev.key === 'ArrowUp') { ev.preventDefault(); this._nudge(-step) }
        if (ev.key === 'ArrowDown') { ev.preventDefault(); this._nudge(step) }
      } else {
        if (ev.key === 'ArrowLeft') { ev.preventDefault(); this._nudge(-step) }
        if (ev.key === 'ArrowRight') { ev.preventDefault(); this._nudge(step) }
      }
    })
  }

  /** 开始拖拽：记录起点/初始尺寸，捕获指针，注册 window 级 move/up 监听。 */
  _startDrag(ev) {
    ev.preventDefault()
    const horizontal = this._isHorizontal()
    const rect = this._first.getBoundingClientRect()
    this._drag = {
      horizontal,
      start: horizontal ? ev.clientY : ev.clientX,
      size: horizontal ? rect.height : rect.width,
    }
    this.classList.add('is-resizing')
    try { this._splitter.setPointerCapture(ev.pointerId) } catch (_) {}
    const move = (e) => {
      // 拖拽中按「初始尺寸 + 位移」实时调整首面板像素尺寸
      const pos = this._drag.horizontal ? e.clientY : e.clientX
      this._setFirstPx(this._drag.size + (pos - this._drag.start))
    }
    const up = (e) => {
      // 拖拽结束：释放指针捕获、移除监听、刷新子组件、派发 cmx-split-change
      try { this._splitter.releasePointerCapture(e.pointerId) } catch (_) {}
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      this.classList.remove('is-resizing')
      this._drag = null
      this._refreshChildren()
      this.dispatchEvent(new CustomEvent('cmx-split-change', { bubbles: true, composed: true, detail: { size: this.getAttribute('size') } }))
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  /** 键盘微调：按 delta 像素调整首面板尺寸并刷新子组件。 */
  _nudge(delta) {
    const rect = this._first.getBoundingClientRect()
    this._setFirstPx((this._isHorizontal() ? rect.height : rect.width) + delta)
    this._refreshChildren()
  }

  /** 按像素设置首面板尺寸（钳制在 [minFirst, total-minSecond] 区间，写 CSS 变量与 size 属性）。 */
  _setFirstPx(px) {
    const total = this._totalSize()
    const minFirst = numAttr(this, 'min-first', 120)
    const minSecond = numAttr(this, 'min-second', 120)
    // 下限 minFirst；上限 = max(minFirst, total - minSecond)（保证次面板最小尺寸）
    const next = Math.max(minFirst, Math.min(Math.max(minFirst, total - minSecond), px))
    this.style.setProperty('--cmx-split-size', `${Math.round(next)}px`)
    this.setAttribute('size', `${Math.round(next)}px`)
    this._splitter.setAttribute('aria-valuenow', String(Math.round(next)))
  }

  /** 计算可用总尺寸（容器尺寸 - 分隔条尺寸，按当前方向取 height 或 width）。 */
  _totalSize() {
    const rect = this._root.getBoundingClientRect()
    const split = this._splitter.getBoundingClientRect()
    return (this._isHorizontal() ? rect.height - split.height : rect.width - split.width)
  }

  /** 应用配置到 CSS 变量与 ARIA：方向 class、尺寸、分隔条粗细、最小尺寸。 */
  _apply() {
    const horizontal = this._isHorizontal()
    this._root.classList.toggle('vertical', !horizontal)
    this._splitter.setAttribute('aria-orientation', horizontal ? 'horizontal' : 'vertical')
    const size = this.getAttribute('size') || '50%'
    this.style.setProperty('--cmx-split-size', size)
    this.style.setProperty('--cmx-splitter-size', `${numAttr(this, 'splitter-size', 3)}px`)
    this.style.setProperty('--cmx-split-min-first', `${numAttr(this, 'min-first', 120)}px`)
    this.style.setProperty('--cmx-split-min-second', `${numAttr(this, 'min-second', 120)}px`)
  }

  /** 是否为上下（horizontal）布局；orientation='vertical' 时为左右布局。 */
  _isHorizontal() {
    return (this.getAttribute('orientation') || 'horizontal').toLowerCase() !== 'vertical'
  }

  /** 防抖刷新子组件布局（30ms 内多次调用合并为一次）。 */
  _refreshChildren() {
    clearTimeout(this._refreshTimer)
    this._refreshTimer = setTimeout(() => {
      this.querySelectorAll('cmx-revo-grid,cmx-tabulator,cmx-ui5-form,cmx-web-treeview').forEach(refreshChild)
    }, 30)
  }

  /** 返回组件内联样式文本（容器/面板/分隔条/拖拽态）。 */
  _css() {
    return `
      :host{display:block;min-width:0;min-height:0;box-sizing:border-box;}
      .root{display:flex;flex-direction:column;width:100%;height:100%;min-width:0;min-height:0;box-sizing:border-box;}
      .root.vertical{flex-direction:row;}
      .pane{min-width:0;min-height:0;box-sizing:border-box;overflow:hidden;}
      .pane slot{display:block;width:100%;height:100%;min-width:0;min-height:0;}
      .pane ::slotted(*){width:100%;height:100%;min-width:0;min-height:0;box-sizing:border-box;}
      .pane-first{flex:0 0 var(--cmx-split-size,50%);}
      .pane-second{flex:1 1 0;}
      .root:not(.vertical) .pane-first{min-height:var(--cmx-split-min-first,120px);}
      .root:not(.vertical) .pane-second{min-height:var(--cmx-split-min-second,120px);}
      .root.vertical .pane-first{min-width:var(--cmx-split-min-first,120px);}
      .root.vertical .pane-second{min-width:var(--cmx-split-min-second,120px);}
      .splitter{flex:0 0 var(--cmx-splitter-size,3px);position:relative;touch-action:none;user-select:none;cursor:row-resize;background:var(--cmx-splitter-bg,transparent);}
      .root.vertical .splitter{cursor:col-resize;}
      .splitter::after{content:'';position:absolute;left:50%;top:50%;width:var(--cmx-splitter-grip-width,30px);height:2px;transform:translate(-50%,-50%);border-radius:2px;background:var(--cmx-splitter-grip,color-mix(in srgb,var(--sapInformationColor,#0a6ed1) 38%,var(--sapContent_LabelColor,#6a6d70)));opacity:.72;}
      .root.vertical .splitter::after{width:2px;height:var(--cmx-splitter-grip-width,30px);}
      .splitter:hover::after,.splitter:focus-visible::after,:host(.is-resizing) .splitter::after{opacity:1;}
      .splitter:focus-visible{outline:2px solid var(--sapContent_FocusColor,#0070f2);outline-offset:-2px;}
      :host(.is-resizing){cursor:row-resize;}
      :host(.is-resizing) ::slotted(*){pointer-events:none;}
    `
  }
}

if (!customElements.get('cmx-split-pane')) customElements.define('cmx-split-pane', CmxSplitPane)
