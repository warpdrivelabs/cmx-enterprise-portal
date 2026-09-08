/**
 * AI 助手消息 —— part 驱动渲染,opencode 内联流式(无 bubble)。
 *
 * 内容直接内联,无卡片包裹。parts 纵向堆叠 gap 12px。
 * 错误以 opencode ToolErrorCard 风格(danger bg/border)展示。
 * result 在末尾展示。完成态显示 hover 复制操作。
 */
import { LitElement, html, css } from 'lit'
import { sharedTokens } from '../theme/shared-styles.js'
import { renderTextShimmer, textShimmerCss } from '../utils/text-shimmer.js'
import './ai-text-part.js'
import './ai-reasoning-part.js'
import './ai-tool-part.js'
import './ai-result-viewer.js'
import './ai-copy-button.js'

export class AiAssistantMessage extends LitElement {
  static properties = {
    parts: { type: Array },
    done: { type: Boolean },
    error: { type: String },
    aborted: { type: Boolean },
    result: { type: Object },
  }

  static styles = [
    sharedTokens,
    textShimmerCss,
    css`
      :host { display: block; }
      .parts { display: flex; flex-direction: column; gap: 12px; }
      .error-box {
        margin-top: 4px;
        padding: 8px 12px;
        border-radius: var(--oc-radius-md);
        background: var(--oc-error-bg);
        border: 0.5px solid var(--oc-error-border);
        color: var(--oc-error-fg);
        font-size: var(--oc-font-size-small);
      }
      /* 中断提示:柔和 muted 风格(对齐 opencode 中断态),区别于真实错误的红框 */
      .abort-box {
        margin-top: 4px;
        display: flex;
        align-items: center;
        gap: 6px;
        color: var(--oc-text-muted);
        font-size: var(--oc-font-size-small);
      }
      .abort-box svg { width: 14px; height: 14px; flex-shrink: 0; }
      .actions {
        margin-top: 4px;
        display: flex;
        gap: 4px;
        min-height: 24px;
        opacity: 0;
        transition: opacity 0.15s ease;
      }
      :host(:hover) .actions,
      :host(:focus-within) .actions { opacity: 1; }
      ai-result-viewer { margin-top: 4px; }
      /* 思考中占位(对齐 opencode session-turn-thinking):margin-top 12px,14px,medium,text-weak */
      .thinking {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 12px;
        width: 100%;
        min-width: 0;
        color: var(--oc-text-muted);
        font-size: var(--oc-font-size-base);
        font-weight: 500;
        line-height: 20px;
        min-height: 20px;
      }
    `,
  ]

  constructor () {
    super()
    this.parts = []
    this.done = false
    this.error = ''
    this.aborted = false
    this.result = null
  }

  _renderPart (p) {
    switch (p.type) {
      case 'text':
        return html`<ai-text-part .text=${p.text || ''} ?done=${this.done}></ai-text-part>`
      case 'reasoning':
        return html`<ai-reasoning-part
          .text=${p.text || ''}
          ?running=${!!p.running}
          .startTime=${p.startTime || 0}
          .endTime=${p.endTime || 0}
        ></ai-reasoning-part>`
      case 'tool':
        return html`<ai-tool-part
          .tool=${p.tool || 'unknown'}
          .state=${p.state || 'running'}
          .output=${p.output || ''}
          .input=${p.input || {}}
          .metadata=${p.metadata || {}}
          .startTime=${p.startTime || 0}
          .endTime=${p.endTime || 0}
        ></ai-tool-part>`
      default:
        return ''
    }
  }

  /**
   * 产物类型(html/dct/doc/text)。后端 result_type 经 serde rename 序列化为 "type"。
   * 只有 html/dct/doc 是可预览/可保存的产物,text 是普通回复文本(已由 text_delta 流式渲染,不应再显示 viewer)。
   */
  get _productType () {
    const r = this.result || {}
    if (r.product_type) return r.product_type
    const rt = r.type || r.result_type || ''
    if (rt.includes('html')) return 'html'
    if (rt.includes('dct')) return 'dct'
    if (rt.includes('doc')) return 'doc'
    if (rt.includes('text')) return 'text'
    return 'text'
  }

  /** 仅 html/dct/doc 产物才显示结果 viewer;text 回复不再重复展示。 */
  get _shouldShowResult () {
    if (!this.result) return false
    const pt = this._productType
    return pt === 'html' || pt === 'dct' || pt === 'doc'
  }

  _collectText () {
    return (this.parts || [])
      .filter(p => p.type === 'text')
      .map(p => p.text || '')
      .join('\n\n')
  }

  /** 是否有可见内容 part(text/reasoning/tool 任一非空)。 */
  get _hasVisibleParts () {
    return (this.parts || []).some(p => (p.text && p.text.trim()) || p.type === 'tool' || (p.type === 'reasoning' && p.text && p.text.trim()))
  }

  render () {
    return html`
      <div class="parts">
        ${this.parts.map(p => this._renderPart(p))}
        ${!this.done && !this._hasVisibleParts ? html`<div class="thinking">${renderTextShimmer('思考中', true)}</div>` : ''}
      </div>
      ${this.aborted ? html`<div class="abort-box">
        <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="2.5" y="2.5" width="11" height="11" rx="1.5" stroke="currentColor" stroke-width="1.2"/></svg>
        <span>${this.error || '已中断'}</span>
      </div>` : (this.error ? html`<div class="error-box">${this.error}</div>` : '')}
      ${this._shouldShowResult ? html`<ai-result-viewer .result=${this.result}></ai-result-viewer>` : ''}
      ${this.done && !this.error ? html`
        <div class="actions">
          <ai-copy-button
            .getText=${() => this._collectText()}
            label="复制回复"
            copiedLabel="已复制"
          ></ai-copy-button>
        </div>
      ` : ''}
    `
  }
}
customElements.define('ai-assistant-message', AiAssistantMessage)
