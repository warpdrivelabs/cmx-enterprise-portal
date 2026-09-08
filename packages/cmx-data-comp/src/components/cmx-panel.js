/**
 * <cmx-panel> — 可折叠面板 / 卡片外壳。
 *
 * 收敛项目中反复手搓的 .panel / .panel-head / .neo-panel / .fico-*-section 类名碎片：
 * 提供统一的「标题栏 + 内容区 + 可选折叠」结构，支持 neo 主题皮肤。
 *
 * @component cmx-panel
 * @slot (默认) - 内容区
 * @slot header-actions - 标题栏右侧操作区（按钮等）
 * @slot summary - 折叠态摘要（collapsed 时显示，替代内容区）
 * @fires cmx-panel-collapse - 折叠状态变化，detail: { collapsed }（bubbles + composed）
 * @attr {string} title - 标题文本
 * @attr {boolean} collapsible - 是否可折叠（出现折叠箭头，点击标题栏切换）
 * @attr {boolean} collapsed - 当前是否折叠
 * @attr {string} icon - ui5 图标名（标题前缀图标）
 * @attr {string} tone - neo 强调色调：cyan | violet | mint | azure（配合 data-cmx-skin="neo"）
 * @attr {string} data-cmx-skin - 皮肤：neo（默认）| flat | none
 * @attr {string} data-cmx-skin-tone - 同 tone，neo 色调别名
 */
import '@ui5/webcomponents/dist/Icon.js'
import { CMX_PANEL_NEO_SKIN_CSS } from '../lib/cmx-panel-neo-skin.js'
import { applyNeoSkin, applyPageStyleId } from '../lib/cmx-skin-runtime.js'

/** ui5 icon 名兜底（空/非法时给一个中性占位） */
function safeIcon (raw) {
  const s = (raw || '').trim()
  return s || 'slim-arrow-down'
}

export class CmxPanel extends HTMLElement {
  /** 监听属性变化（kebab-case） */
  static get observedAttributes () {
    return ['title', 'collapsible', 'collapsed', 'icon', 'tone', 'data-cmx-skin', 'data-cmx-skin-tone']
  }

  constructor () {
    super()
    /** @type {ShadowRoot|null} */
    this._root = null
  }

  /** 挂载：懒创建 shadow DOM + 绑定折叠交互 + 应用皮肤与初始态 */
  connectedCallback () {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' })
      this.shadowRoot.innerHTML = `
        <style id="cmx-panel-base">${this._css()}</style>
        <div class="panel-surface" part="surface">
          <div class="panel-head" id="head" role="${this.hasAttribute('collapsible') ? 'button' : 'heading'}">
            <ui5-icon class="panel-icon" id="icon" part="icon"></ui5-icon>
            <span class="panel-title" id="title" part="title"></span>
            <span class="panel-actions"><slot name="header-actions"></slot></span>
            <slot name="summary" class="panel-summary-slot"></slot>
            <ui5-icon class="panel-arrow" id="arrow" name="slim-arrow-down" part="arrow"></ui5-icon>
          </div>
          <div class="panel-body" id="body"><slot></slot></div>
        </div>
      `
      this._root = this.shadowRoot
      this._bind()
    }
    this._applySkin()
    this._apply()
  }

  /** 属性变化：shadowRoot 就绪后重新应用皮肤与状态 */
  attributeChangedCallback (name) {
    if (!this.shadowRoot) return
    // 皮肤相关属性走 _applySkin，其余走 _apply
    if (name === 'data-cmx-skin' || name === 'data-cmx-skin-tone' || name === 'tone') {
      this._applySkin()
    }
    this._apply()
  }

  // ─── 命令式 API ─────────────────────────────────────────────────────
  /** @type {string} 标题 */
  get title () { return this.getAttribute('title') || '' }
  set title (v) {
    if (v == null || v === '') this.removeAttribute('title')
    else this.setAttribute('title', String(v))
  }

  /** @type {boolean} 是否可折叠 */
  get collapsible () { return this.hasAttribute('collapsible') }
  set collapsible (v) {
    if (v) this.setAttribute('collapsible', '')
    else this.removeAttribute('collapsible')
  }

  /** @type {boolean} 是否折叠 */
  get collapsed () { return this.hasAttribute('collapsed') }
  set collapsed (v) {
    if (v) this.setAttribute('collapsed', '')
    else this.removeAttribute('collapsed')
  }

  /** @type {string} 标题图标 */
  get icon () { return this.getAttribute('icon') || '' }
  set icon (v) {
    if (v == null || v === '') this.removeAttribute('icon')
    else this.setAttribute('icon', String(v))
  }

  /** @type {string} neo 色调 */
  get tone () { return this.getAttribute('tone') || '' }
  set tone (v) {
    if (v == null || v === '') this.removeAttribute('tone')
    else this.setAttribute('tone', String(v))
  }

  /**
   * 切换折叠状态并派发 cmx-panel-collapse 事件。
   * 非可折叠面板调用无效。
   * @param {boolean} [force] 显式指定目标状态；缺省取反
   */
  toggle (force) {
    if (!this.collapsible) return
    const next = typeof force === 'boolean' ? force : !this.collapsed
    if (next) this.setAttribute('collapsed', '')
    else this.removeAttribute('collapsed')
    this.dispatchEvent(new CustomEvent('cmx-panel-collapse', {
      bubbles: true, composed: true, detail: { collapsed: next },
    }))
  }

  // ─── 内部：事件绑定 ─────────────────────────────────────────────────
  _bind () {
    const head = this._root.getElementById('head')
    head.addEventListener('click', () => {
      if (this.collapsible) this.toggle()
    })
    head.addEventListener('keydown', (ev) => {
      if (!this.collapsible) return
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault()
        this.toggle()
      }
    })
  }

  // ─── 内部：皮肤应用 ─────────────────────────────────────────────────
  _applySkin () {
    // 把公开的 tone 属性（用户写 <cmx-panel tone="violet">）同步到 data-cmx-skin-tone。
    // neo 皮肤 CSS 按 :host(.cmx-panel-neo[data-cmx-skin-tone="violet"]) 选择器匹配色调，
    // 故需此同步让 tone 生效；同时也与 form/grid 的 data-cmx-skin-tone 皮肤机制保持一致。
    // 值未变时跳过 setAttribute：data-cmx-skin-tone 在 observedAttributes 里，
    // 重复 setAttribute 会触发 attributeChangedCallback → 再调 _applySkin → 无限递归。
    if (this.tone && this.getAttribute('data-cmx-skin-tone') !== this.tone) this.setAttribute('data-cmx-skin-tone', this.tone)
    applyNeoSkin({
      host: this,
      shadow: this.shadowRoot,
      idBase: 'cmx-panel',
      neoCss: CMX_PANEL_NEO_SKIN_CSS,
      globalKey: '__cmxDefaultPanelSkin',
    })
    applyPageStyleId(this, this.shadowRoot, 'cmx-panel')
  }

  // ─── 内部：状态渲染 ─────────────────────────────────────────────────
  _apply () {
    if (!this._root) return
    const icon = this._root.getElementById('icon')
    const title = this._root.getElementById('title')
    const head = this._root.getElementById('head')
    const arrow = this._root.getElementById('arrow')

    title.textContent = this.title
    const iconName = this.icon ? safeIcon(this.icon) : ''
    if (iconName) {
      icon.name = iconName
      icon.style.display = ''
    } else {
      icon.style.display = 'none'
    }
    // 折叠箭头仅在可折叠时显示
    arrow.style.display = this.collapsible ? '' : 'none'
    head.setAttribute('role', this.collapsible ? 'button' : 'heading')
    if (this.collapsible) {
      head.setAttribute('aria-expanded', this.collapsed ? 'false' : 'true')
      head.setAttribute('tabindex', '0')
    } else {
      head.removeAttribute('aria-expanded')
      head.removeAttribute('tabindex')
    }
  }

  /** 基础样式（主题中立，仅 --sap* + --cmx-*；neo 配色由皮肤层提供） */
  _css () {
    return `
      :host {
        display: block;
        box-sizing: border-box;
        min-width: 0;
      }
      :host([hidden]) { display: none; }
      .panel-surface {
        background: var(--sapGroup_ContentBackground, #fff);
        border: 1px solid var(--sapGroup_ContentBorderColor, #d9d9d9);
        border-radius: 4px;
        overflow: hidden;
      }
      .panel-head {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem 0.75rem;
        border-bottom: 1px solid var(--sapGroup_TitleBorderColor, #d9d9d9);
        min-height: 2rem;
      }
      .panel-head[role="button"] { cursor: pointer; }
      .panel-head[role="button"]:hover { background: var(--sapHoverBackground, #f5f5f5); }
      .panel-icon { color: var(--sapContent_IconColor, #0854a0); flex: 0 0 auto; }
      .panel-title {
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--sapTitleColor, #32363a);
        flex: 1 1 auto;
        min-width: 0;
      }
      .panel-actions { flex: 0 0 auto; display: flex; align-items: center; gap: 0.25rem; }
      .panel-arrow { color: var(--sapContent_IconColor, #0854a0); flex: 0 0 auto; transition: transform 0.18s ease; }
      :host([collapsed]) .panel-arrow { transform: rotate(-90deg); }
      .panel-body { padding: 0.75rem; }
      :host([collapsed]) .panel-body { display: none; }
      :host([collapsed]) .panel-summary-slot { display: block; }
      .panel-summary-slot { display: none; }
      ui5-icon { width: 1rem; height: 1rem; }
    `
  }
}

if (!customElements.get('cmx-panel')) customElements.define('cmx-panel', CmxPanel)
