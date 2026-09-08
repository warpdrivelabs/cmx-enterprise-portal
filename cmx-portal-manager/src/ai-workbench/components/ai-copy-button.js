/**
 * 统一复制按钮 —— 对齐 opencode MessageActionButton。
 *
 * <ai-copy-button .getText=${asyncFn} label="复制消息" copiedLabel="已复制"></ai-copy-button>
 *
 * - 纯图标:复制态 outline-copy(opencode 同款 SVG),成功态 check,2000ms 恢复。
 * - ghost 按钮,hover 淡背景。
 * - tooltip:hover 显示 label(复制态)/ copiedLabel(成功态)。
 * - 复制内容由 .getText 回调返回(同步字符串或 Promise<string>)。
 *
 * opencode 的 user/assistant 复制按钮用同一个 MessageActionButton(IconV2 outline-copy/check),
 * 仅 label 文案与复制内容来源不同。本组件同理。
 */
import { LitElement, html, css } from 'lit'
import { sharedTokens } from '../theme/shared-styles.js'

export class AiCopyButton extends LitElement {
  static properties = {
    getText: { type: Object },        // () => string | Promise<string>
    label: { type: String },          // 复制态 tooltip
    copiedLabel: { type: String },    // 成功态 tooltip
    _copied: { state: true },
    _showTip: { state: true },
  }

  static styles = [
    sharedTokens,
    css`
      :host {
        display: inline-flex;
        position: relative;
      }
      button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        padding: 0;
        border: none;
        border-radius: var(--oc-radius-sm);
        background: transparent;
        color: var(--oc-text-faint);
        cursor: pointer;
        font-family: var(--oc-font-sans);
        line-height: 1;
        transition: background-color 0.15s ease, color 0.15s ease;
      }
      button:hover {
        background: var(--oc-layer-01);
        color: var(--oc-text-base);
      }
      button.done { color: var(--oc-success); }
      button svg { width: 14px; height: 14px; display: block; }
      button svg path { stroke-linejoin: round; }

      .tip {
        position: absolute;
        bottom: calc(100% + 4px);
        left: 50%;
        transform: translateX(-50%);
        padding: 3px 8px;
        font-size: 11px;
        color: var(--oc-text-base);
        background: var(--oc-layer-03);
        border-radius: var(--oc-radius-sm);
        white-space: nowrap;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.15s ease;
        z-index: 10;
        font-family: var(--oc-font-sans);
      }
      :host(:hover) .tip { opacity: 1; }
    `,
  ]

  constructor () {
    super()
    this.getText = () => ''
    this.label = '复制'
    this.copiedLabel = '已复制'
    this._copied = false
  }

  async _copy (e) {
    e.stopPropagation()
    if (this._copied) return
    let text = ''
    try { text = await this.getText() } catch {}
    if (!text) return
    const done = () => {
      this._copied = true
      setTimeout(() => { this._copied = false }, 2000)
    }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => this._fallback(text, done))
    } else {
      this._fallback(text, done)
    }
  }

  _fallback (text, done) {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    try { document.execCommand('copy') } catch {}
    ta.remove()
    done()
  }

  render () {
    return html`
      <button class=${this._copied ? 'done' : ''} title=${this._copied ? this.copiedLabel : this.label} @click=${this._copy} aria-label=${this._copied ? this.copiedLabel : this.label}>
        ${this._copied ? this._renderCheck() : this._renderCopy()}
      </button>
    `
  }

  _renderCopy () {
    return html`<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M4.14908 11.0081H1.76282V1.51758H9.1038V2.55588M14.2225 4.99681H6.75397V14.4873H14.2225V4.99681Z" stroke="currentColor"/></svg>`
  }

  _renderCheck () {
    return html`<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M3.53613 8.17857L6.39328 11.75L12.4647 4.25" stroke="currentColor"/></svg>`
  }
}
customElements.define('ai-copy-button', AiCopyButton)
