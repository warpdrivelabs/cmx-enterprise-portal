/**
 * 推理过程 part —— 可折叠卡片:muted 文字 + 折叠摘要。
 *
 * 折叠态:单行摘要("思考中..." 运行时扫光 / "思考 · 3s" 完成后常驻)。
 * 展开态:左侧细边框 + markdown 内容,暗色次要。
 *
 * running 态由 store 管理:当模型从思考转入工具/文本时,store 会把上一段思考的
 * running 置为 false(对齐 opencode reasoning.ended 语义),因此多轮思考时前一轮
 * 会正确变为"思考 · Ns"而非一直显示"思考中"。
 */
import { LitElement, html, css } from 'lit'
import { sharedTokens } from '../theme/shared-styles.js'
import { renderTextShimmer, textShimmerCss } from '../utils/text-shimmer.js'
import { renderMarkdownSync } from '../utils/markdown.js'
import { handleCodeCopyClick } from '../utils/clipboard.js'

export class AiReasoningPart extends LitElement {
  static properties = {
    text: { type: String },
    running: { type: Boolean },
    startTime: { type: Number },
    endTime: { type: Number },
    _expanded: { state: true },
  }

  static styles = [
    sharedTokens,
    textShimmerCss,
    css`
      :host { display: block; margin: 4px 0; }
      .header {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        cursor: pointer;
        font-size: var(--oc-font-size-small);
        color: var(--oc-text-muted);
        padding: 4px 8px;
        border-radius: var(--oc-radius-sm);
        transition: background-color 0.15s ease;
        user-select: none;
        background: transparent;
        border: none;
        font-family: var(--oc-font-sans);
      }
      .header:hover { background: var(--oc-layer-01); }
      .toggle {
        font-size: 10px;
        color: var(--oc-text-faint);
        transition: transform 0.15s ease;
        display: inline-block;
      }
      .toggle.expanded { transform: rotate(90deg); }
      .duration { color: var(--oc-text-faint); margin-left: 4px; font-variant-numeric: tabular-nums; }

      .content {
        margin-top: 8px;
        padding: 8px 12px;
        border-left: 0.5px solid var(--oc-border-base);
        font-size: var(--oc-font-size-small);
        line-height: 1.5;
        color: var(--oc-text-muted);
        max-height: 300px;
        overflow-y: auto;
        scrollbar-width: none;
      }
      .content::-webkit-scrollbar { display: none; }
      /* 内嵌 markdown 排版 */
      .content .md { font-family: var(--oc-font-sans); }
      .content .md :first-child { margin-top: 0; }
      .content .md :last-child { margin-bottom: 0; }
      .content .md p { margin: 0 0 8px; }
      .content .md strong { color: var(--oc-text-muted); font-weight: 600; }
      .content .md code { font-family: var(--oc-font-mono); font-size: 12px; padding: 1px 4px; border-radius: var(--oc-radius-sm); background: color-mix(in oklch, var(--oc-text-base) 8%, transparent); }
      .content .md ul, .content .md ol { margin: 4px 0 8px; padding-left: 24px; }

      /* 代码块容器(带语言标签 + 复制按钮) —— 对齐 text-part，缩放到思考区小字号 */
      .content .md .code-block {
        position: relative;
        margin: 8px 0 12px;
      }
      .content .md .code-block .code-copy {
        position: absolute;
        top: 4px;
        right: 4px;
        z-index: 1;
        padding: 1px 6px;
        font-size: 11px;
        font-family: var(--oc-font-sans);
        color: var(--oc-text-muted);
        background: var(--oc-bg-base);
        border: 0.5px solid var(--oc-border-base);
        border-radius: var(--oc-radius-sm);
        cursor: pointer;
        opacity: 0;
        transition: opacity 0.15s ease, color 0.15s ease;
      }
      .content .md .code-block:hover .code-copy,
      .content .md .code-block:focus-within .code-copy { opacity: 1; }
      .content .md .code-block .code-copy:hover { color: var(--oc-text-base); }
      .content .md .code-block .code-copy.copied { color: var(--oc-success); border-color: var(--oc-success); }
      .content .md .code-block::before {
        content: attr(data-lang);
        position: absolute;
        top: 4px;
        left: 10px;
        z-index: 1;
        font-family: var(--oc-font-mono);
        font-size: 11px;
        color: var(--oc-text-faint);
        text-transform: lowercase;
        pointer-events: none;
      }
      .content .md .code-block pre,
      .content .md pre {
        font-family: var(--oc-font-mono);
        font-size: 12px;
        line-height: 1.5;
        padding: 20px 10px 10px;
        margin: 0;
        border-radius: var(--oc-radius-sm);
        border: 0.5px solid var(--oc-border-base);
        background: var(--oc-code-bg);
        overflow-x: auto;
        scrollbar-width: none;
      }
      .content .md pre::-webkit-scrollbar { display: none; }
      .content .md .code-block pre code,
      .content .md pre code {
        font-family: var(--oc-font-mono);
        font-size: 12px;
        line-height: 1.5;
        background: none;
        padding: 0;
        color: var(--oc-code-fg);
      }
    `,
  ]

  constructor () {
    super()
    this.text = ''
    this.running = false
    this.startTime = 0
    this.endTime = 0
    this._expanded = false
    this._tick = 0
  }

  connectedCallback () {
    super.connectedCallback()
    if (this.running) this._startTick()
    // 事件委托:代码块复制按钮(innerHTML 重渲染后仍生效)
    this.addEventListener('click', handleCodeCopyClick)
  }

  disconnectedCallback () {
    this._stopTick()
    this.removeEventListener('click', handleCodeCopyClick)
    super.disconnectedCallback()
  }

  _startTick () {
    this._stopTick()
    this._timer = setInterval(() => { this._tick++ }, 500)
  }

  _stopTick () {
    if (this._timer) { clearInterval(this._timer); this._timer = null }
  }

  get _durationLabel () {
    const end = this.endTime || (this.running ? Date.now() : 0)
    if (!this.startTime || !end) return ''
    const secs = ((end - this.startTime) / 1000).toFixed(1)
    return `· ${secs}s`
  }

  updated (changed) {
    if (changed.has('running')) {
      if (this.running) this._startTick()
      else this._stopTick()
    }
    // 仅在「展开态变化」或「文本内容变化」时重填 markdown，避免 _tick 每次刷新
    // 覆盖内容（清掉用户选区、重复跑 markdown-it）。
    if ((changed.has('_expanded') || changed.has('text')) && this._expanded) {
      const el = this.renderRoot?.querySelector('.content')
      if (el) el.innerHTML = `<div class="md">${renderMarkdownSync(this.text)}</div>`
    }
  }

  render () {
    return html`
      <button class="header" @click=${() => { this._expanded = !this._expanded }}>
        <span class="toggle ${this._expanded ? 'expanded' : ''}">▶</span>
        ${this.running
          ? html`${renderTextShimmer('思考中', true)}${this._durationLabel ? html`<span class="duration">${this._durationLabel}</span>` : ''}`
          : html`<span>思考</span>${this._durationLabel ? html`<span class="duration">${this._durationLabel}</span>` : ''}`
        }
      </button>
      ${this._expanded ? html`<div class="content"></div>` : ''}
    `
  }
}
customElements.define('ai-reasoning-part', AiReasoningPart)
