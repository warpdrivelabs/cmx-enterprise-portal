/**
 * 输入区 —— opencode 风格悬浮卡片 composer。
 *
 * 外层圆角卡片(min-h 96px,raised shadow),textarea 融入无独立边框。
 * 底部工具行:左侧提示,右侧发送(accent 圆形箭头)/中止(危险)。
 *
 * 事件:@send (detail: text) / @abort ()
 * 键盘:Enter 发送 / Shift+Enter 换行 / 双击 ESC 中止。
 */
import { LitElement, html, css } from 'lit'
import { sharedTokens } from '../theme/shared-styles.js'

export class AiPromptInput extends LitElement {
  static properties = {
    status: { type: String },     // idle / streaming / error
    errorMessage: { type: String },
    _value: { state: true },
    _escPressed: { state: true },
    prefill: { type: String },
  }

  static styles = [
    sharedTokens,
    css`
      :host {
        display: block;
        flex-shrink: 0;
        padding: 8px 20px 12px;
      }
      .composer-card {
        max-width: 800px;
        margin: 0 auto;
        background: var(--oc-bg-base);
        border: 0.5px solid var(--oc-border-base);
        border-radius: var(--oc-radius-xl);
        box-shadow: var(--oc-shadow-raised);
        padding: 4px;
        transition: border-color 0.15s ease;
      }
      .composer-card:focus-within { border-color: var(--oc-accent-focus); }

      .editor {
        padding: 10px 12px 4px;
      }
      textarea {
        display: block;
        width: 100%;
        resize: none;
        min-height: 24px;
        max-height: 180px;
        padding: 0;
        margin: 0;
        border: none;
        outline: none;
        background: transparent;
        color: var(--oc-text-base);
        font-family: var(--oc-font-sans);
        font-size: var(--oc-font-size-small);
        font-weight: 400;
        line-height: 1.5;
        scrollbar-width: none;
      }
      textarea::-webkit-scrollbar { display: none; }
      textarea::placeholder { color: var(--oc-text-faint); }
      textarea:disabled { opacity: 0.5; }

      .toolbar {
        display: flex;
        align-items: center;
        gap: 8px;
        height: 36px;
        padding: 0 6px 2px 8px;
      }
      .hint {
        font-size: 12px;
        color: var(--oc-text-faint);
      }
      .hint .kbd {
        padding: 1px 5px;
        border: 0.5px solid var(--oc-border-base);
        border-radius: var(--oc-radius-xs);
        font-family: var(--oc-font-mono);
        font-size: 11px;
        color: var(--oc-text-muted);
        margin: 0 2px;
      }
      .err-msg {
        flex: 1;
        font-size: 12px;
        color: var(--oc-error-fg);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .spacer { flex: 1; }

      .send-btn {
        width: 28px; height: 28px;
        flex-shrink: 0;
        display: inline-flex; align-items: center; justify-content: center;
        border: none;
        border-radius: var(--oc-radius-md);
        cursor: pointer;
        transition: background-color 0.15s ease, opacity 0.15s ease;
        font-size: 14px;
        line-height: 1;
      }
      .send-btn.send {
        background: var(--oc-accent-fill);
        color: #fff;
      }
      .send-btn.send:hover:not(:disabled) { background: var(--oc-accent-fill-hover); }
      .send-btn.send:disabled { opacity: 0.4; cursor: default; }
      .send-btn.stop {
        background: var(--oc-error-fg);
        color: #fff;
      }
      .send-btn.stop:hover { background: color-mix(in srgb, var(--oc-error-fg) 85%, #000); }
    `,
  ]

  constructor () {
    super()
    this.status = 'idle'
    this.errorMessage = ''
    this._value = ''
    this._escPressed = false
    this._escTimer = null
  }

  _onInput (e) {
    this._value = e.target.value
    const ta = e.target
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 180) + 'px'
  }

  _onKeyDown (e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault()
      this._trySend()
      return
    }
    if (e.key === 'Escape' && this.status === 'streaming') {
      if (this._escPressed) {
        clearTimeout(this._escTimer)
        this._escPressed = false
        this._emitAbort()
      } else {
        this._escPressed = true
        this._escTimer = setTimeout(() => { this._escPressed = false }, 3000)
      }
    }
  }

  _trySend () {
    const text = this._value.trim()
    if (!text || this.status === 'streaming') return
    this.dispatchEvent(new CustomEvent('send', { detail: text }))
    this._value = ''
    const ta = this.renderRoot.querySelector('textarea')
    if (ta) { ta.value = ''; ta.style.height = 'auto' }
  }

  _emitAbort () {
    this.dispatchEvent(new CustomEvent('abort'))
  }

  willUpdate (changed) {
    if (changed.has('status') && this.status !== 'error') {
      this.errorMessage = ''
    }
    // 外部预填(空状态示例点击):设值并聚焦 textarea
    if (changed.has('prefill') && this.prefill) {
      this._value = this.prefill
      this.updateComplete.then(() => {
        const ta = this.renderRoot.querySelector('textarea')
        if (ta) {
          ta.value = this._value
          ta.style.height = 'auto'
          ta.style.height = Math.min(ta.scrollHeight, 180) + 'px'
          ta.focus()
        }
      })
    }
  }

  render () {
    const isStreaming = this.status === 'streaming'
    return html`
      <div class="composer-card">
        <div class="editor">
          <textarea
            .value=${this._value}
            @input=${this._onInput}
            @keydown=${this._onKeyDown}
            placeholder="描述你的需求..."
            rows="1"
            ?disabled=${isStreaming}
          ></textarea>
        </div>
        <div class="toolbar">
          ${this.status === 'error' && this.errorMessage
            ? html`<span class="err-msg">${this.errorMessage}</span>`
            : html`<span class="hint"><span class="kbd">Enter</span>发送 · <span class="kbd">Shift+Enter</span>换行</span>`
          }
          <span class="spacer"></span>
          ${isStreaming
            ? html`<button class="send-btn stop" title="中止" @click=${this._emitAbort}>■</button>`
            : html`<button class="send-btn send" title="发送" ?disabled=${!this._value.trim()} @click=${this._trySend}>↑</button>`
          }
        </div>
      </div>
    `
  }
}
customElements.define('ai-prompt-input', AiPromptInput)
