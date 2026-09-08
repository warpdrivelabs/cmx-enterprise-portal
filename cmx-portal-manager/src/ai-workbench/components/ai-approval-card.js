/**
 * 审批卡片 —— 工具执行前的权限确认弹层(对齐 opencode permission 审批)。
 *
 * <ai-approval-card .data=${requireApprovalEvent} @decision=${handler}></ai-approval-card>
 *
 * data 形态(对齐后端 RequireApprovalEvent):
 *   { approvalId, action, title, description?, diff? }
 *
 * 用户点击"允许"/"拒绝"后派发 @decision,detail = { approvalId, decision: 'approve'|'reject' }。
 */
import { LitElement, html, css } from 'lit'
import { sharedTokens } from '../theme/shared-styles.js'

export class AiApprovalCard extends LitElement {
  static properties = {
    data: { type: Object },
    _decided: { state: true },
  }

  static styles = [
    sharedTokens,
    css`
      :host { display: block; }
      .dock {
        max-width: 800px;
        margin: 0 auto;
        background: var(--oc-bg-base);
        border-radius: var(--oc-radius-xl);
        box-shadow: var(--oc-shadow-raised);
        border: 0.5px solid var(--oc-border-base);
        overflow: clip;
      }
      .body { padding: 16px; }
      .title {
        display: flex; align-items: center; gap: 8px;
        font-size: var(--oc-font-size-base);
        font-weight: 600;
        color: var(--oc-text-base);
        font-family: var(--oc-font-sans);
      }
      .title .warn {
        flex-shrink: 0;
        width: 16px; height: 16px;
        color: var(--oc-warning);
      }
      .desc {
        margin-top: 8px;
        font-size: var(--oc-font-size-small);
        color: var(--oc-text-muted);
        line-height: 1.5;
        font-family: var(--oc-font-sans);
      }
      .cmd {
        margin-top: 10px;
        padding: 10px 12px;
        background: var(--oc-code-bg);
        border: 0.5px solid var(--oc-border-base);
        border-radius: var(--oc-radius-md);
        font-family: var(--oc-font-mono);
        font-size: 13px;
        line-height: 1.5;
        color: var(--oc-code-fg);
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        max-height: 200px;
        overflow-y: auto;
        scrollbar-width: none;
        -webkit-user-select: text;
        user-select: text;
      }
      .cmd::-webkit-scrollbar { display: none; }
      .footer {
        display: flex; justify-content: flex-end; gap: 8px;
        padding: 8px;
        background: var(--oc-layer-01);
        border-top: 0.5px solid var(--oc-border-muted);
      }
      .btn {
        padding: 6px 16px;
        font-size: var(--oc-font-size-small);
        font-weight: 500;
        border-radius: var(--oc-radius-md);
        cursor: pointer;
        transition: background-color 0.15s ease, opacity 0.15s ease;
        font-family: var(--oc-font-sans);
        border: none;
      }
      .btn:disabled { opacity: 0.4; cursor: default; }
      .btn-reject {
        background: transparent;
        color: var(--oc-text-muted);
      }
      .btn-reject:hover:not(:disabled) {
        background: var(--oc-error-bg);
        color: var(--oc-error-fg);
      }
      .btn-approve {
        background: var(--oc-accent-fill);
        color: #fff;
      }
      .btn-approve:hover:not(:disabled) { background: var(--oc-accent-fill-hover); }
    `,
  ]

  constructor () {
    super()
    this.data = null
    this._decided = false
  }

  get _approvalId () {
    return this.data?.approvalId || this.data?.approval_id || ''
  }

  _decide (decision) {
    if (this._decided) return
    this._decided = true
    this.dispatchEvent(new CustomEvent('decision', {
      detail: { approvalId: this._approvalId, decision },
    }))
  }

  render () {
    const d = this.data || {}
    return html`
      <div class="dock">
        <div class="body">
          <div class="title">
            <svg class="warn" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M8 1.5L14.5 13H1.5L8 1.5Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
              <path d="M8 6.5V9M8 11V11.01" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
            </svg>
            <span>${d.title || '确认执行操作'}</span>
          </div>
          ${d.description ? html`<div class="desc">${d.description}</div>` : ''}
          ${d.action === 'bash' && d.description ? html`<div class="cmd">${d.description}</div>` : ''}
        </div>
        <div class="footer">
          <button class="btn btn-reject" ?disabled=${this._decided} @click=${() => this._decide('reject')}>拒绝</button>
          <button class="btn btn-approve" ?disabled=${this._decided} @click=${() => this._decide('approve')}>允许</button>
        </div>
      </div>
    `
  }
}
customElements.define('ai-approval-card', AiApprovalCard)
