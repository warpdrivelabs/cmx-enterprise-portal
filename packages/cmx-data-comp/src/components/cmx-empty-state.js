/**
 * <cmx-empty-state> — 空状态占位。
 *
 * 收敛项目中 75 处 class="empty" 高度同构的手搓（图标 + 标题 + 副标题 + 可选动作）。
 * 各部分均可用命名 slot 覆盖。
 *
 * @component cmx-empty-state
 * @slot icon - 覆盖图标（默认按 icon 属性渲染 ui5-icon）
 * @slot title - 覆盖标题文本
 * @slot description - 覆盖副标题
 * @slot (默认) - 动作区（如「去创建」按钮）
 * @attr {string} icon - ui5 图标名（默认 activity-assistance）
 * @attr {string} title - 标题
 * @attr {string} description - 副标题
 * @attr {string} size - 尺寸：sm | md（默认）| lg
 * @attr {string} data-cmx-skin - 皮肤：neo（默认）| none
 * @attr {string} data-cmx-skin-tone - neo 色调
 */
import '@ui5/webcomponents/dist/Icon.js'
import { CMX_EMPTY_STATE_NEO_SKIN_CSS } from '../lib/cmx-empty-state-neo-skin.js'
import { applyNeoSkin, applyPageStyleId } from '../lib/cmx-skin-runtime.js'

export class CmxEmptyState extends HTMLElement {
  static get observedAttributes () {
    return ['icon', 'title', 'description', 'size', 'data-cmx-skin', 'data-cmx-skin-tone']
  }

  constructor () {
    super()
    this._root = null
  }

  connectedCallback () {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' })
      this.shadowRoot.innerHTML = `
        <style id="cmx-empty-state-base">${this._css()}</style>
        <div class="empty-surface" part="surface">
          <div class="empty-icon" part="icon">
            <slot name="icon"><ui5-icon id="icon"></ui5-icon></slot>
          </div>
          <div class="empty-title" id="title" part="title"></div>
          <div class="empty-desc" id="desc" part="description">
            <slot name="description"><span id="desc-text"></span></slot>
          </div>
          <slot></slot>
        </div>
      `
      this._root = this.shadowRoot
    }
    this._applySkin()
    this._apply()
  }

  attributeChangedCallback (name) {
    if (!this.shadowRoot) return
    if (name === 'data-cmx-skin' || name === 'data-cmx-skin-tone') this._applySkin()
    this._apply()
  }

  // ─── 命令式 API ─────────────────────────────────────────────────────
  /** @type {string} 图标 */
  get icon () { return this.getAttribute('icon') || 'activity-assistance' }
  set icon (v) {
    if (v == null || v === '') this.removeAttribute('icon')
    else this.setAttribute('icon', String(v))
  }

  /** @type {string} 标题 */
  get title () { return this.getAttribute('title') || '' }
  set title (v) {
    if (v == null || v === '') this.removeAttribute('title')
    else this.setAttribute('title', String(v))
  }

  /** @type {string} 副标题 */
  get description () { return this.getAttribute('description') || '' }
  set description (v) {
    if (v == null || v === '') this.removeAttribute('description')
    else this.setAttribute('description', String(v))
  }

  /** @type {string} 尺寸 */
  get size () { return this.getAttribute('size') || 'md' }
  set size (v) { this.setAttribute('size', String(v || 'md')) }

  // ─── 内部：皮肤 / 渲染 ──────────────────────────────────────────────
  _applySkin () {
    applyNeoSkin({
      host: this,
      shadow: this.shadowRoot,
      idBase: 'cmx-empty-state',
      neoCss: CMX_EMPTY_STATE_NEO_SKIN_CSS,
      globalKey: '__cmxDefaultEmptyStateSkin',
    })
    applyPageStyleId(this, this.shadowRoot, 'cmx-empty-state')
  }

  _apply () {
    if (!this._root) return
    const icon = this._root.getElementById('icon')
    const title = this._root.getElementById('title')
    const descText = this._root.getElementById('desc-text')
    icon.name = this.icon
    title.textContent = this.title
    descText.textContent = this.description
  }

  _css () {
    return `
      :host { display: block; }
      :host([hidden]) { display: none; }
      .empty-surface {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.6rem;
        padding: 2rem 1rem;
        text-align: center;
        color: var(--sapTextColor, #32363a);
      }
      .empty-icon {
        width: 3rem;
        height: 3rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        color: var(--sapContent_NonInteractiveIconColor, #89919a);
      }
      .empty-icon ui5-icon { width: 1.6rem; height: 1.6rem; }
      .empty-title { font-size: 0.9rem; font-weight: 600; color: var(--sapTitleColor, #223548); }
      .empty-desc { font-size: 0.78rem; color: var(--sapContent_LabelColor, #6a6d70); max-width: 26rem; line-height: 1.5; }
    `
  }
}

if (!customElements.get('cmx-empty-state')) customElements.define('cmx-empty-state', CmxEmptyState)
