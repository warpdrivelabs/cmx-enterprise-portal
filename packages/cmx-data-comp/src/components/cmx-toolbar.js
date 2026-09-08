/**
 * <cmx-toolbar> — 声明式命令栏（slot 透传风格）。
 *
 * 收敛项目中 36/118 业务页手搓的「4-6 按钮命令条」（de-toolbar / panel-toolbar / cm-toolbar ...）：
 * 只做横向布局 + 间距 + 分隔符 + 左右分区，内部按钮/输入框一律用 UI5 通过 slot 放入。
 *
 * @component cmx-toolbar
 * @slot (默认) - 主操作区（左/起始，放 ui5-button 等）
 * @slot actions - 右侧次要操作区（导出/更多等）
 * @attr {string} align - 主区对齐：start | center | end（默认 start）
 * @attr {number} gap - 项间间距 px（默认 8）
 * @attr {boolean} wrap - 项过多时是否换行（默认不换行）
 * @attr {boolean} divider - 主区与 actions 区之间显示分隔线
 * @attr {string} tone - neo 色调：cyan | violet | mint | azure
 * @attr {string} data-cmx-skin - 皮肤：neo（默认）| none
 * @attr {string} data-cmx-skin-tone - neo 色调别名
 */
import { CMX_TOOLBAR_NEO_SKIN_CSS } from '../lib/cmx-toolbar-neo-skin.js'
import { applyNeoSkin, applyPageStyleId } from '../lib/cmx-skin-runtime.js'

export class CmxToolbar extends HTMLElement {
  static get observedAttributes () {
    return ['align', 'gap', 'wrap', 'divider', 'tone', 'data-cmx-skin', 'data-cmx-skin-tone']
  }

  constructor () {
    super()
    this._root = null
  }

  connectedCallback () {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' })
      this.shadowRoot.innerHTML = `
        <style id="cmx-toolbar-base">${this._css()}</style>
        <div class="toolbar-surface" part="surface">
          <div class="toolbar-main"><slot></slot></div>
          <div class="toolbar-actions"><slot name="actions"></slot></div>
        </div>
      `
      this._root = this.shadowRoot
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
  /** @type {string} 对齐 */
  get align () { return this.getAttribute('align') || 'start' }
  set align (v) { this.setAttribute('align', String(v || 'start')) }

  /** @type {number} 间距 px */
  get gap () {
    const n = Number(this.getAttribute('gap'))
    return Number.isFinite(n) ? n : 8
  }
  set gap (v) { this.setAttribute('gap', String(v)) }

  /** @type {boolean} 换行 */
  get wrap () { return this.hasAttribute('wrap') }
  set wrap (v) { v ? this.setAttribute('wrap', '') : this.removeAttribute('wrap') }

  /** @type {boolean} 分隔线 */
  get divider () { return this.hasAttribute('divider') }
  set divider (v) { v ? this.setAttribute('divider', '') : this.removeAttribute('divider') }

  /** @type {string} neo 色调 */
  get tone () { return this.getAttribute('tone') || '' }
  set tone (v) {
    if (v == null || v === '') this.removeAttribute('tone')
    else this.setAttribute('tone', String(v))
  }

  // ─── 内部：皮肤 / 渲染 ──────────────────────────────────────────────
  _applySkin () {
    /* 把 tone 同步到 data-cmx-skin-tone（neo 皮肤按 :host([data-cmx-skin-tone="xxx"]) 匹配色调）；
       值未变时跳过 setAttribute，避免触发 attributeChangedCallback 无限递归 */
    if (this.tone && this.getAttribute('data-cmx-skin-tone') !== this.tone) this.setAttribute('data-cmx-skin-tone', this.tone)
    applyNeoSkin({
      host: this,
      shadow: this.shadowRoot,
      idBase: 'cmx-toolbar',
      neoCss: CMX_TOOLBAR_NEO_SKIN_CSS,
      globalKey: '__cmxDefaultToolbarSkin',
    })
    applyPageStyleId(this, this.shadowRoot, 'cmx-toolbar')
  }

  _apply () {
    if (!this._root) return
    const surface = this._root.querySelector('.toolbar-surface')
    // 对齐：只影响 main 区在无 actions 时的水平定位
    const main = this._root.querySelector('.toolbar-main')
    const map = { start: 'flex-start', center: 'center', end: 'flex-end' }
    main.style.justifyContent = map[this.align] || 'flex-start'
    // 间距 + 换行（写 CSS 变量供皮肤消费）
    this.style.setProperty('--cmx-toolbar-gap', this.gap + 'px')
    surface.style.flexWrap = this.wrap ? 'wrap' : 'nowrap'
  }

  _css () {
    return `
      :host { display: block; box-sizing: border-box; }
      :host([hidden]) { display: none; }
      .toolbar-surface {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        flex-wrap: nowrap;
        padding: 0.4rem 0.6rem;
        border-radius: 4px;
        background: var(--sapToolbar_Background, var(--sapGroup_ContentBackground, #fff));
        border-bottom: 1px solid var(--sapGroup_ContentBorderColor, #d9d9d9);
      }
      .toolbar-main { display: flex; align-items: center; gap: 0.4rem; flex: 1 1 auto; min-width: 0; }
      .toolbar-actions { display: flex; align-items: center; gap: 0.3rem; flex: 0 0 auto; margin-left: auto; }
    `
  }
}

if (!customElements.get('cmx-toolbar')) customElements.define('cmx-toolbar', CmxToolbar)
