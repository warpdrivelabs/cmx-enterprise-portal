/**
 * <cmx-status-tag> — 状态徽章 / 标签。
 *
 * 收敛项目中 100+ 处 span 手搓的状态色块（chip / ver-badge / props-type-badge / event-chip ...）。
 * tone 决定语义色，variant 决定填充风格，dot 加前缀圆点。
 *
 * @component cmx-status-tag
 * @slot (默认) - 标签文本
 * @attr {string} tone - 语义色：success | warning | danger | info | neutral（默认 neutral）
 * @attr {string} variant - 填充风格：solid（默认）| subtle | outline
 * @attr {boolean} dot - 前缀发光圆点
 * @attr {string} size - 尺寸：sm | md（默认）
 * @attr {string} data-cmx-skin - 皮肤：neo（默认）| none
 */
import { CMX_STATUS_TAG_NEO_SKIN_CSS } from '../lib/cmx-status-tag-neo-skin.js'
import { applyNeoSkin, applyPageStyleId } from '../lib/cmx-skin-runtime.js'

export class CmxStatusTag extends HTMLElement {
  static get observedAttributes () {
    return ['tone', 'variant', 'dot', 'size', 'data-cmx-skin']
  }

  constructor () {
    super()
    this._root = null
  }

  connectedCallback () {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' })
      this.shadowRoot.innerHTML = `
        <style id="cmx-status-tag-base">${this._css()}</style>
        <span class="tag-surface" part="surface">
          <span class="tag-dot"></span>
          <slot></slot>
        </span>
      `
      this._root = this.shadowRoot
    }
    this._applySkin()
    this._apply()
  }

  attributeChangedCallback (name) {
    if (!this.shadowRoot) return
    if (name === 'data-cmx-skin') this._applySkin()
    this._apply()
  }

  // ─── 命令式 API ─────────────────────────────────────────────────────
  /** @type {string} 语义色 */
  get tone () { return this.getAttribute('tone') || 'neutral' }
  set tone (v) { this.setAttribute('tone', String(v || 'neutral')) }

  /** @type {string} 填充风格 */
  get variant () { return this.getAttribute('variant') || 'solid' }
  set variant (v) { this.setAttribute('variant', String(v || 'solid')) }

  /** @type {boolean} 圆点 */
  get dot () { return this.hasAttribute('dot') }
  set dot (v) { v ? this.setAttribute('dot', '') : this.removeAttribute('dot') }

  /** @type {string} 尺寸 */
  get size () { return this.getAttribute('size') || 'md' }
  set size (v) { this.setAttribute('size', String(v || 'md')) }

  // ─── 内部：皮肤 / 渲染 ──────────────────────────────────────────────
  _applySkin () {
    applyNeoSkin({
      host: this,
      shadow: this.shadowRoot,
      idBase: 'cmx-status-tag',
      neoCss: CMX_STATUS_TAG_NEO_SKIN_CSS,
      globalKey: '__cmxDefaultStatusTagSkin',
    })
    applyPageStyleId(this, this.shadowRoot, 'cmx-status-tag')
  }

  _apply () {
    if (!this._root) return
    const dot = this._root.querySelector('.tag-dot')
    dot.style.display = this.dot ? '' : 'none'
  }

  _css () {
    // 基础样式主题中立；neo 下由皮肤接管配色。flat 模式用 sap token 兜底。
    return `
      :host { display: inline-flex; }
      :host([hidden]) { display: none; }
      .tag-surface {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        padding: 0.1rem 0.5rem;
        border-radius: 999px;
        font-size: 0.72rem;
        font-weight: 600;
        line-height: 1.4;
        white-space: nowrap;
        border: 1px solid transparent;
      }
      .tag-dot { display: none; }
      /* flat 兜底（无 neo 皮肤时按 tone 给基础色） */
      :host(:not(.cmx-status-tag-neo)) .tag-surface {
        background: var(--sapButton_Neutral_Background, #f0f0f0);
        color: var(--sapTextColor, #32363a);
      }
    `
  }
}

if (!customElements.get('cmx-status-tag')) customElements.define('cmx-status-tag', CmxStatusTag)
