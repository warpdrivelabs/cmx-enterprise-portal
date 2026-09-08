/**
 * 结果展示 —— opencode 风格卡片(result 事件产物)。
 *
 * <ai-result-viewer .result=${resultData}></ai-result-viewer>
 *
 * 预览(iframe srcdoc)+ 代码视图 + 复制。一期 saveable=false 不显示保存。
 */
import { LitElement, html, css } from 'lit'
import { sharedTokens } from '../theme/shared-styles.js'

const PRODUCT_LABELS = { html: 'HTML 页面', dct: 'DCT 字典', doc: 'DOC 单据', text: '文本' }

export class AiResultViewer extends LitElement {
  static properties = {
    result: { type: Object },
    _tab: { state: true },
    _copied: { state: true },
  }

  static styles = [
    sharedTokens,
    css`
      :host { display: block; }
      .viewer {
        border: 0.5px solid var(--oc-border-base);
        border-radius: var(--oc-radius-md);
        overflow: hidden;
        background: var(--oc-bg-deep);
      }
      .toolbar {
        display: flex; align-items: center; gap: 8px;
        padding: 8px 12px;
        background: var(--oc-layer-01);
        border-bottom: 0.5px solid var(--oc-border-muted);
      }
      .badge {
        font-size: 11px; padding: 2px 8px; border-radius: var(--oc-radius-sm);
        font-weight: 500; background: var(--oc-accent-fill); color: #fff;
      }
      .summary {
        flex: 1; font-size: 12px; color: var(--oc-text-muted);
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .tabs { display: flex; gap: 2px; }
      .tab {
        padding: 4px 12px; font-size: 12px; cursor: pointer;
        border: none; background: none; color: var(--oc-text-muted);
        border-radius: var(--oc-radius-sm);
        font-family: var(--oc-font-sans);
        transition: color 0.15s ease, background-color 0.15s ease;
      }
      .tab.active { background: var(--oc-info-tint); color: var(--oc-accent-text); }
      .tab:hover:not(.active) { color: var(--oc-text-base); }
      .copy {
        padding: 4px 10px; font-size: 12px;
        border: 0.5px solid var(--oc-border-base); border-radius: var(--oc-radius-sm);
        background: transparent; color: var(--oc-text-muted); cursor: pointer;
        font-family: var(--oc-font-sans);
        transition: border-color 0.15s ease, color 0.15s ease;
      }
      .copy:hover { border-color: var(--oc-border-strong); color: var(--oc-text-base); }
      .copy.done { border-color: var(--oc-success); color: var(--oc-success); }
      .pane { display: none; }
      .pane.active { display: block; }
      .code {
        max-height: 400px; overflow: auto; padding: 12px; margin: 0;
        font-family: var(--oc-font-mono); font-size: 12px; line-height: 1.5;
        color: var(--oc-text-base); background: var(--oc-bg-deep);
        white-space: pre-wrap; word-break: break-all;
        scrollbar-width: none;
      }
      .code::-webkit-scrollbar { display: none; }
      .preview-frame { width: 100%; height: 400px; border: none; background: var(--sapGroup_ContentBorderColor, #ffffff); }
    `,
  ]

  constructor () {
    super()
    this.result = null
    this._tab = 'preview'
    this._copied = false
  }

  willUpdate (changed) {
    if (changed.has('result') && this.result) {
      this._tab = this._productType === 'html' ? 'preview' : 'code'
    }
  }

  get _productType () {
    const pt = this.result?.product_type
    if (pt) return pt
    // 后端 result_type 经 serde rename 序列化为 "type";兼容两者
    const rt = this.result?.type || this.result?.result_type || ''
    if (rt.includes('dct')) return 'dct'
    if (rt.includes('doc')) return 'doc'
    if (rt.includes('text')) return 'text'
    return 'html'
  }

  get _code () {
    const d = this.result?.data
    if (!d) return ''
    return typeof d === 'string' ? d : JSON.stringify(d, null, 2)
  }

  _switchTab (t) { this._tab = t }

  async _copy () {
    try {
      await navigator.clipboard.writeText(this._code)
      this._copied = true
      setTimeout(() => { this._copied = false }, 2000)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = this._code
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy') } catch {}
      ta.remove()
      this._copied = true
      setTimeout(() => { this._copied = false }, 2000)
    }
  }

  _wrapPreview (fragment) {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
      body{margin:0;padding:16px;font-family:"Segoe UI",sans-serif;background:#f8fafc;color:var(--sapInformationElementColor, #1e293b)}
      cmx-ui5-form,cmx-revo-grid,cmx-dict-select,cmx-combo-box{display:block;padding:8px;border:1px dashed #cbd5e1;color:var(--sapInformationElementColor, #64748b)}
      ui5-bar{display:flex;align-items:center;padding:8px 12px;background:#e2e8f0}
      [data-node-id]::before{content:attr(data-node-id);font-size:10px;color:var(--sapLinkColor, #94a3b8);margin-right:6px}
      script{display:none}
    </style></head><body>${(fragment || '').replace(/<script[\s\S]*?<\/script>/g, '')}</body></html>`
  }

  render () {
    if (!this.result) return ''
    const pt = this._productType
    const isHtml = pt === 'html'
    return html`
      <div class="viewer">
        <div class="toolbar">
          <span class="badge">${PRODUCT_LABELS[pt] || pt}</span>
          <span class="summary">${this.result.summary || ''}</span>
          ${isHtml ? html`<div class="tabs">
            <button class="tab ${this._tab === 'preview' ? 'active' : ''}" @click=${() => this._switchTab('preview')}>预览</button>
            <button class="tab ${this._tab === 'code' ? 'active' : ''}" @click=${() => this._switchTab('code')}>代码</button>
          </div>` : ''}
          <button class="copy ${this._copied ? 'done' : ''}" @click=${this._copy}>${this._copied ? '已复制' : '复制'}</button>
        </div>
        ${isHtml ? html`<div class="pane ${this._tab === 'preview' ? 'active' : ''}">
          <iframe class="preview-frame" .srcdoc=${this._wrapPreview(this.result.data)}></iframe>
        </div>` : ''}
        <pre class="code pane ${this._tab === 'code' || !isHtml ? 'active' : ''}">${this._code}</pre>
      </div>
    `
  }
}
customElements.define('ai-result-viewer', AiResultViewer)
