/**
 * 消息项 —— 按 role 分流(opencode 风格)。
 *
 * <ai-message-item .message=${msg}></ai-message-item>
 *
 * user:灰色右对齐 bubble,max-width min(82%,64ch),10px 圆角;下方 hover 显现复制按钮。
 * assistant:无 bubble,直接委托 <ai-assistant-message>(内联)。
 */
import { LitElement, html, css } from 'lit'
import { sharedTokens } from '../theme/shared-styles.js'
import './ai-assistant-message.js'
import './ai-copy-button.js'

export class AiMessageItem extends LitElement {
  static properties = {
    message: { type: Object },
  }

  static styles = [
    sharedTokens,
    css`
      :host { display: block; }
      .user-row {
        display: flex;
        justify-content: flex-end;
      }
      .user-col {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        max-width: min(82%, 64ch);
        min-height: 24px;
      }
      .user-bubble {
        padding: 8px 12px;
        border-radius: var(--oc-radius-xl);
        background: var(--oc-layer-02);
        color: var(--oc-text-base);
        font-size: var(--oc-font-size-base);
        line-height: 1.5;
        word-break: break-word;
        white-space: pre-wrap;
      }
      .user-actions {
        display: flex;
        justify-content: flex-end;
        margin-top: 4px;
        min-height: 24px;
        opacity: 0;
        transition: opacity 0.15s ease;
      }
      .user-row:hover .user-actions,
      .user-row:focus-within .user-actions { opacity: 1; }
    `,
  ]

  constructor () {
    super()
    this.message = null
  }

  render () {
    const m = this.message
    if (!m) return ''
    if (m.role === 'user') {
      return html`<div class="user-row">
        <div class="user-col">
          <div class="user-bubble">${m.text || ''}</div>
          <div class="user-actions">
            <ai-copy-button
              .getText=${() => m.text || ''}
              label="复制消息"
              copiedLabel="已复制"
            ></ai-copy-button>
          </div>
        </div>
      </div>`
    }
    return html`<ai-assistant-message
      .parts=${m.parts || []}
      ?done=${!!m.done}
      .error=${m.error || ''}
      ?aborted=${!!m.aborted}
      .result=${m.result || null}
    ></ai-assistant-message>`
  }
}
customElements.define('ai-message-item', AiMessageItem)
