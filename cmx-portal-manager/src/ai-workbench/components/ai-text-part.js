/**
 * 文本 part 渲染 —— opencode markdown 排版 + markdown-it/Shiki 高亮。
 *
 * 排版忠实对齐 opencode markdown.css:
 *   容器 14px / line-height 160%;h1 17px/600,h2 15px;inline code padding 2px 4px;
 *   code fence 13px padding 12px radius 6px;border 0.5px。
 *
 * 流式策略不变:text 变化同步渲染(快速预览),debounce 300ms 后 Shiki 高亮替换。
 */
import { LitElement, html, css } from 'lit'
import { sharedTokens } from '../theme/shared-styles.js'
import { renderMarkdownSync, renderMarkdown } from '../utils/markdown.js'
import { handleCodeCopyClick } from '../utils/clipboard.js'

export class AiTextPart extends LitElement {
  static properties = {
    text: { type: String },
    done: { type: Boolean },
  }

  static styles = [
    sharedTokens,
    css`
      :host { display: block; }
      .md {
        font-family: var(--oc-font-sans);
        font-size: var(--oc-font-size-base);
        line-height: 1.6;
        color: var(--oc-text-base);
        word-break: break-word;
        min-width: 0;
        max-width: 100%;
        overflow-wrap: break-word;
      }
      .md :first-child { margin-top: 0; }
      .md :last-child { margin-bottom: 0; }
      .md p { margin: 0 0 12px; }

      .md h1 { font-size: 17px; font-weight: 600; line-height: 1.3; margin: 28px 0 12px; }
      .md h2 { font-size: 15px; font-weight: 600; line-height: 1.3; margin: 24px 0 10px; }
      .md h3 { font-size: 13px; font-weight: 500; margin: 20px 0 8px; color: var(--oc-text-base); }
      .md h4, .md h5, .md h6 { font-size: 13px; font-weight: 500; margin: 16px 0 8px; color: var(--oc-text-muted); }

      .md strong, .md b { font-weight: 600; color: var(--oc-text-base); }

      .md ul, .md ol { margin: 8px 0 12px; padding-left: 32px; }
      .md ul { list-style: disc; }
      .md ol { list-style: decimal; }
      .md li { margin-bottom: 8px; }
      .md li::marker { color: var(--oc-text-muted); }
      .md li:last-child { margin-bottom: 0; }
      .md ul ul, .md ol ol, .md ul ol, .md ol ul { margin: 4px 0; padding-left: 1rem; }

      .md a { color: var(--oc-accent-text); text-decoration: none; }
      .md a:hover { text-decoration: underline; text-underline-offset: 2px; }

      /* 行内代码 */
      .md :not(pre) > code {
        font-family: var(--oc-font-mono);
        font-weight: 500;
        font-size: 0.92em;
        padding: 2px 4px;
        border-radius: var(--oc-radius-sm);
        background: color-mix(in oklch, var(--oc-text-base) 8%, transparent);
      }

      /* 代码块容器(带语言标签 + 复制按钮) */
      .md .code-block {
        position: relative;
        margin: 12px 0 24px;
      }
      .md .code-block .code-copy {
        position: absolute;
        top: 6px;
        right: 6px;
        z-index: 1;
        padding: 2px 8px;
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
      .md .code-block:hover .code-copy,
      .md .code-block:focus-within .code-copy { opacity: 1; }
      .md .code-block .code-copy:hover { color: var(--oc-text-base); }
      .md .code-block .code-copy.copied { color: var(--oc-success); border-color: var(--oc-success); }
      .md .code-block::before {
        content: attr(data-lang);
        position: absolute;
        top: 6px;
        left: 12px;
        z-index: 1;
        font-family: var(--oc-font-mono);
        font-size: 11px;
        color: var(--oc-text-faint);
        text-transform: lowercase;
        pointer-events: none;
      }

      /* 代码块(Shiki 输出 pre.shiki,带内联样式;未高亮时 fallback)。
         背景跟随主题(--oc-code-bg),对齐 opencode:浅色主题浅背景,深色主题深背景。
         占位态与高亮态背景一致,避免闪烁。 */
      .md .code-block pre,
      .md pre {
        font-family: var(--oc-font-mono);
        font-size: var(--oc-font-size-small);
        line-height: 1.5;
        padding: 24px 12px 12px;
        margin: 0;
        border-radius: var(--oc-radius-md);
        border: 0.5px solid var(--oc-border-base);
        background: var(--oc-code-bg);
        overflow-x: auto;
        scrollbar-width: none;
      }
      .md .code-block pre { margin: 0; }
      .md pre::-webkit-scrollbar { display: none; }
      .md .code-block pre code,
      .md pre code {
        font-family: var(--oc-font-mono);
        font-size: var(--oc-font-size-small);
        line-height: 1.5;
        background: none;
        padding: 0;
        /* 占位态(未高亮)文字色跟随主题,高亮后由 shiki 内联 style 覆盖 */
        color: var(--oc-code-fg);
      }

      /* 表格 */
      .md table {
        width: 100%;
        border-collapse: collapse;
        margin: 16px 0;
        display: block;
        overflow-x: auto;
        font-size: var(--oc-font-size-small);
      }
      .md th, .md td {
        border-bottom: 0.5px solid var(--oc-border-base);
        padding: 12px;
        text-align: left;
      }
      .md th { font-weight: 500; border-bottom: 0.5px solid var(--oc-border-strong); }

      .md blockquote {
        border-left: 0.5px solid var(--oc-border-base);
        margin: 8px 0;
        padding-left: 0.5rem;
        color: var(--oc-text-muted);
      }
      .md img { max-width: 100%; border-radius: var(--oc-radius-sm); margin: 16px 0; display: block; }
      .md hr { border: none; height: 0; margin: 32px 0; }
    `,
  ]

  constructor () {
    super()
    this.text = ''
    this.done = false
    this._highlightTimer = null
  }

  willUpdate (changedProps) {
    if (changedProps.has('text')) {
      const el = this.renderRoot?.querySelector('.md')
      if (el) el.innerHTML = renderMarkdownSync(this.text)
    }
  }

  firstUpdated () {
    const el = this.renderRoot.querySelector('.md')
    if (el) el.innerHTML = renderMarkdownSync(this.text)
    this._scheduleHighlight()
    // 事件委托:代码块复制按钮(innerHTML 重渲染后仍生效)
    this.renderRoot.addEventListener('click', handleCodeCopyClick)
  }

  updated (changedProps) {
    if (changedProps.has('text')) {
      // 流式期间不中途高亮 —— 代码块保持占位(纯文本 + 深色背景),避免占位↔高亮反复切换闪烁。
      // 仅在生成结束(done)时一次性高亮,最终视觉效果与 opencode 一致。
    }
    if (changedProps.has('done') && this.done) {
      this._doHighlight()
    }
  }

  _scheduleHighlight () {
    // 兼容 firstUpdated 调用;流式期间不再中途高亮,留空。
    // 真正的高亮由 done → _doHighlight 触发。
  }

  /** 生成完成后:整体 shiki 高亮一次(对齐 opencode 最终视觉效果)。 */
  async _doHighlight () {
    if (this._highlightTimer) { clearTimeout(this._highlightTimer); this._highlightTimer = null }
    const html = await renderMarkdown(this.text)
    const el = this.renderRoot.querySelector('.md')
    if (el) el.innerHTML = html
  }

  render () {
    return html`<div class="md"></div>`
  }
}
customElements.define('ai-text-part', AiTextPart)
