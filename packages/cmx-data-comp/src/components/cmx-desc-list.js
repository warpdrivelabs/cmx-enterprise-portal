/**
 * <cmx-desc-list> — 描述 / 键值清单。
 *
 * 收敛 portal 里 class="kv" 重复模板与 240+ 处「详情/基本信息」手搓的 label:value 两列清单。
 * 子元素用 <cmx-desc-item label="状态">启用</cmx-desc-item>，组件扫描渲染为响应式网格。
 *
 * @component cmx-desc-list
 * @slot (默认) - 放 cmx-desc-item 子元素
 * @attr {number} columns - 列数（默认 1）
 * @attr {string} label-width - 标签列宽（CSS，默认 '6rem'）
 * @attr {boolean} border - 项间显示分隔线
 * @attr {string} tone - neo 色调
 * @attr {string} data-cmx-skin - 皮肤：neo（默认）| none
 * @attr {string} data-cmx-skin-tone - neo 色调别名
 *
 * @component cmx-desc-item
 * @slot (默认) - 值
 * @attr {string} label - 标签文本
 */
import { CMX_DESC_LIST_NEO_SKIN_CSS } from '../lib/cmx-desc-list-neo-skin.js'
import { applyNeoSkin, applyPageStyleId } from '../lib/cmx-skin-runtime.js'

/**
 * <cmx-desc-item> — 描述清单的子项（轻量容器，渲染由父组件接管）。
 * 本元素只承载 label 属性 + 值（slot），不自行渲染 shadow DOM，由 cmx-desc-list 扫描读取。
 */
export class CmxDescItem extends HTMLElement {
  static get observedAttributes () { return ['label'] }

  get label () { return this.getAttribute('label') || '' }
  set label (v) {
    if (v == null || v === '') this.removeAttribute('label')
    else this.setAttribute('label', String(v))
  }
}
if (!customElements.get('cmx-desc-item')) customElements.define('cmx-desc-item', CmxDescItem)

export class CmxDescList extends HTMLElement {
  static get observedAttributes () {
    return ['columns', 'label-width', 'border', 'tone', 'data-cmx-skin', 'data-cmx-skin-tone']
  }

  constructor () {
    super()
    this._root = null
    /** 子项变化观察器（cmx-desc-item 增删 / label 变化时重渲染） */
    this._mo = null
  }

  connectedCallback () {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' })
      this.shadowRoot.innerHTML = `
        <style id="cmx-desc-list-base">${this._css()}</style>
        <div class="desclist-surface" part="surface">
          <div class="desclist-grid" id="grid"></div>
        </div>
      `
      this._root = this.shadowRoot
      // 观察子元素 cmx-desc-item 的增删与属性变化，自动重建渲染
      this._mo = new MutationObserver(() => this._renderItems())
      this._mo.observe(this, { childList: true, subtree: false, attributes: true, attributeFilter: ['label'] })
    }
    this._applySkin()
    this._apply()
    this._renderItems()
  }

  disconnectedCallback () {
    if (this._mo) { this._mo.disconnect(); this._mo = null }
  }

  attributeChangedCallback (name) {
    if (!this.shadowRoot) return
    if (name === 'data-cmx-skin' || name === 'data-cmx-skin-tone' || name === 'tone') {
      this._applySkin()
    }
    this._apply()
  }

  // ─── 命令式 API ─────────────────────────────────────────────────────
  /** @type {number} 列数 */
  get columns () {
    const n = parseInt(this.getAttribute('columns'), 10)
    return Number.isFinite(n) && n > 0 ? n : 1
  }
  set columns (v) { this.setAttribute('columns', String(v)) }

  /** @type {string} 标签列宽 */
  get labelWidth () { return this.getAttribute('label-width') || '6rem' }
  set labelWidth (v) { this.setAttribute('label-width', String(v)) }

  /** @type {boolean} 分隔线 */
  get border () { return this.hasAttribute('border') }
  set border (v) { v ? this.setAttribute('border', '') : this.removeAttribute('border') }

  /** @type {string} neo 色调 */
  get tone () { return this.getAttribute('tone') || '' }
  set tone (v) {
    if (v == null || v === '') this.removeAttribute('tone')
    else this.setAttribute('tone', String(v))
  }

  // ─── 内部：皮肤 / 布局 / 子项渲染 ───────────────────────────────────
  _applySkin () {
    /* 把 tone 同步到 data-cmx-skin-tone（neo 皮肤按 :host([data-cmx-skin-tone="xxx"]) 匹配色调）；
       值未变时跳过 setAttribute，避免触发 attributeChangedCallback 无限递归 */
    if (this.tone && this.getAttribute('data-cmx-skin-tone') !== this.tone) this.setAttribute('data-cmx-skin-tone', this.tone)
    applyNeoSkin({
      host: this,
      shadow: this.shadowRoot,
      idBase: 'cmx-desc-list',
      neoCss: CMX_DESC_LIST_NEO_SKIN_CSS,
      globalKey: '__cmxDefaultDescListSkin',
    })
    applyPageStyleId(this, this.shadowRoot, 'cmx-desc-list')
  }

  _apply () {
    if (!this._root) return
    // 列数 + 标签宽通过 CSS 变量驱动皮肤
    this.style.setProperty('--cmx-desclist-cols', String(this.columns))
    this.style.setProperty('--cmx-desclist-label-w', this.labelWidth)
  }

  /** 扫描 cmx-desc-item 子元素，渲染为 grid 内的 label:value 行 */
  _renderItems () {
    if (!this._root) return
    const grid = this._root.getElementById('grid')
    const items = Array.from(this.querySelectorAll('cmx-desc-item'))
    grid.innerHTML = items.map((it) => {
      const label = it.getAttribute('label') || ''
      // 值取 item 的 textContent（含其 slot 内容）
      const value = (it.textContent || '').trim()
      return `<div class="desclist-item"><span class="desclist-label">${escapeHtml(label)}</span><span class="desclist-value">${escapeHtml(value)}</span></div>`
    }).join('')
  }

  _css () {
    return `
      :host { display: block; box-sizing: border-box; }
      :host([hidden]) { display: none; }
      .desclist-surface {
        background: var(--sapGroup_ContentBackground, #fff);
        border: 1px solid var(--sapGroup_ContentBorderColor, #d9d9d9);
        border-radius: 4px;
        overflow: hidden;
      }
      .desclist-grid { display: grid; grid-template-columns: repeat(var(--cmx-desclist-cols, 1), 1fr); }
      .desclist-item { display: flex; align-items: baseline; gap: 0.5rem; padding: 0.5rem 0.85rem; }
      :host([border]) .desclist-item { border-bottom: 1px solid var(--sapGroup_TitleBorderColor, #e5e5e5); }
      :host([border]) .desclist-item:last-child { border-bottom: none; }
      .desclist-label {
        font-size: 0.74rem; font-weight: 600; color: var(--sapContent_LabelColor, #6a6d70);
        flex: 0 0 var(--cmx-desclist-label-w, 6rem);
      }
      .desclist-value { font-size: 0.8rem; color: var(--sapTextColor, #32363a); flex: 1 1 auto; min-width: 0; word-break: break-word; }
    `
  }
}

/** 最小 HTML 转义（值来自子元素 textContent，避免注入） */
function escapeHtml (s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
}

if (!customElements.get('cmx-desc-list')) customElements.define('cmx-desc-list', CmxDescList)
