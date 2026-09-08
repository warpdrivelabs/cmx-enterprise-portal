/**
 * <cmx-kpi-card> — 统计卡 / KPI 指标卡。
 *
 * 收敛财务模块 125+ 处手搓的 acct-kpi / neo-kpi / fico-kpi 碎片。
 * 统一两种视觉风格（variant）：card（圆角块卡片，neo-kpi 风格）/ inline（行内 label:value，acct-kpi 风格）。
 * tone 统一抽象颜色（合并 acct-kpi 的 data-kind 与 neo-kpi 的修饰符 class）。
 *
 * @component cmx-kpi-card
 * @slot (默认) - 覆盖 value 区域（自定义内容）
 * @attr {string} label - 标签文本（如「资产」「借方」）
 * @attr {string} value - 数值文本（如「12,345.00」）
 * @attr {string} [unit] - 单位（如「万元」「%」），显示在数值后
 * @attr {string} [tone] - 语义色：success|warning|danger|info|neutral|cash-in|cash-out|revenue|expense|asset
 * @attr {string} [variant] - 视觉风格：card（默认，圆角块）| inline（行内 label:value）
 * @attr {string} [trend] - 趋势：up|down|flat（不设则不显示）
 * @attr {string} [delta] - 趋势附带的数值文本（如「+5.2%」），配合 trend 显示
 * @attr {boolean} [clickable] - 是否可点击（acct-kpi 风格的筛选链接；为真时加 role/tabindex 并派发事件）
 * @fires cmx-kpi-click - clickable 时点击派发，detail: { label, value }（bubbles + composed）
 * @attr {string} data-cmx-skin - 皮肤：neo（默认）| none
 * @attr {string} data-cmx-skin-tone - neo 色调别名
 */
import { CMX_KPI_CARD_NEO_SKIN_CSS } from '../lib/cmx-kpi-card-neo-skin.js'
import { applyNeoSkin, applyPageStyleId } from '../lib/cmx-skin-runtime.js'

export class CmxKpiCard extends HTMLElement {
  static get observedAttributes () {
    return ['label', 'value', 'unit', 'tone', 'variant', 'trend', 'delta', 'clickable', 'data-cmx-skin', 'data-cmx-skin-tone']
  }

  constructor () {
    super()
    this._root = null
  }

  connectedCallback () {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' })
      this.shadowRoot.innerHTML = `
        <style id="cmx-kpi-card-base">${this._css()}</style>
        <div class="kpi-surface" part="surface">
          <span class="kpi-label" id="label" part="label"></span>
          <span class="kpi-value-wrap">
            <b class="kpi-value" id="value" part="value"></b><span class="kpi-unit" id="unit"></span>
            <slot></slot>
          </span>
          <span class="kpi-trend" id="trend" part="trend"></span>
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
  }

  // ─── 命令式 API ─────────────────────────────────────────────────────
  /** @type {string} 标签 */
  get label () { return this.getAttribute('label') || '' }
  set label (v) {
    if (v == null || v === '') this.removeAttribute('label')
    else this.setAttribute('label', String(v))
  }

  /** @type {string} 数值 */
  get value () { return this.getAttribute('value') || '' }
  set value (v) {
    if (v == null) this.removeAttribute('value')
    else this.setAttribute('value', String(v))
  }

  /** @type {string} 单位 */
  get unit () { return this.getAttribute('unit') || '' }
  set unit (v) {
    if (v == null || v === '') this.removeAttribute('unit')
    else this.setAttribute('unit', String(v))
  }

  /** @type {string} 语义色 */
  get tone () { return this.getAttribute('tone') || 'neutral' }
  set tone (v) { this.setAttribute('tone', String(v || 'neutral')) }

  /** @type {string} 视觉风格 */
  get variant () { return this.getAttribute('variant') || 'card' }
  set variant (v) { this.setAttribute('variant', String(v || 'card')) }

  /** @type {string} 趋势 */
  get trend () { return this.getAttribute('trend') || '' }
  set trend (v) {
    if (v == null || v === '') this.removeAttribute('trend')
    else this.setAttribute('trend', String(v))
  }

  /** @type {string} 趋势数值 */
  get delta () { return this.getAttribute('delta') || '' }
  set delta (v) {
    if (v == null || v === '') this.removeAttribute('delta')
    else this.setAttribute('delta', String(v))
  }

  /** @type {boolean} 可点击 */
  get clickable () { return this.hasAttribute('clickable') }
  set clickable (v) { v ? this.setAttribute('clickable', '') : this.removeAttribute('clickable') }

  // ─── 内部：事件绑定 ─────────────────────────────────────────────────
  _bind () {
    const surface = this._root.querySelector('.kpi-surface')
    const onClick = () => {
      if (!this.clickable) return
      this.dispatchEvent(new CustomEvent('cmx-kpi-click', {
        bubbles: true, composed: true, detail: { label: this.label, value: this.value },
      }))
    }
    surface.addEventListener('click', onClick)
    surface.addEventListener('keydown', (ev) => {
      if (!this.clickable) return
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onClick() }
    })
  }

  // ─── 内部：皮肤 / 渲染 ──────────────────────────────────────────────
  _applySkin () {
    applyNeoSkin({
      host: this,
      shadow: this.shadowRoot,
      idBase: 'cmx-kpi-card',
      neoCss: CMX_KPI_CARD_NEO_SKIN_CSS,
      globalKey: '__cmxDefaultKpiCardSkin',
    })
    applyPageStyleId(this, this.shadowRoot, 'cmx-kpi-card')
  }

  _apply () {
    if (!this._root) return
    this._root.getElementById('label').textContent = this.label
    this._root.getElementById('value').textContent = this.value
    const unitEl = this._root.getElementById('unit')
    unitEl.textContent = this.unit
    unitEl.style.display = this.unit ? '' : 'none'
    // 趋势
    const trendEl = this._root.getElementById('trend')
    if (this.trend) {
      const arrow = { up: '▲', down: '▼', flat: '─' }[this.trend] || ''
      trendEl.textContent = (arrow ? arrow + ' ' : '') + this.delta
      trendEl.dataset.trend = this.trend
      trendEl.style.display = ''
    } else {
      trendEl.style.display = 'none'
    }
    // clickable 无障碍
    const surface = this._root.querySelector('.kpi-surface')
    if (this.clickable) {
      surface.setAttribute('role', 'link')
      surface.setAttribute('tabindex', '0')
    } else {
      surface.removeAttribute('role')
      surface.removeAttribute('tabindex')
    }
  }

  _css () {
    // 基础样式主题中立；neo 下由皮肤层接管配色
    return `
      :host { display: inline-block; box-sizing: border-box; }
      :host([hidden]) { display: none; }
      .kpi-surface {
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 0.2rem;
        padding: 0.6rem 0.9rem;
        border-radius: 4px;
        min-width: 6rem;
        background: var(--sapGroup_ContentBackground, #fff);
        border: 1px solid var(--sapGroup_ContentBorderColor, #d9d9d9);
      }
      .kpi-label { font-size: 0.74rem; font-weight: 600; color: var(--sapContent_LabelColor, #6a6d70); }
      .kpi-value-wrap { display: inline-flex; align-items: baseline; gap: 0.2rem; }
      .kpi-value {
        font-family: ui-monospace, monospace;
        font-size: 1.4rem; font-weight: 700; font-variant-numeric: tabular-nums;
        color: var(--sapTitleColor, #223548); line-height: 1.2;
      }
      .kpi-unit { font-size: 0.72rem; color: var(--sapContent_LabelColor, #6a6d70); }
      .kpi-trend { font-size: 0.72rem; font-weight: 600; }
      .kpi-trend[data-trend="up"] { color: var(--sapPositiveColor, #107e3e); }
      .kpi-trend[data-trend="down"] { color: var(--sapNegativeColor, #bb0000); }
    `
  }
}

if (!customElements.get('cmx-kpi-card')) customElements.define('cmx-kpi-card', CmxKpiCard)
