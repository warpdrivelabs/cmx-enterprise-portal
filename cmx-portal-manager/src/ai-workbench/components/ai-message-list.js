/**
 * 消息列表 —— opencode 风格:居中列 + 智能粘底 + 回到底部按钮。
 *
 * <ai-message-list .messages=${array} .status=${string} @example-click></ai-message-list>
 *
 * - 智能粘底:用户在底部附近时自动跟随新消息;上滑浏览历史时不打断(不再强制拽回)。
 * - 回到底部按钮:距底超过阈值时浮现(对齐 opencode:distance > max(400, viewport))。
 * - 空状态:示例卡片可点击,派发 example-click 事件(由 ai-app 填入输入框)。
 *
 * 结构: :host(定位上下文,不滚动) > .scroll-area(滚动) + .jump-btn(绝对定位浮层)。
 * 关键: 滚动容器(.scroll-area)与定位上下文(:host)必须分离,否则 .jump-btn 的
 * position:absolute 会随滚动内容一起滚动,钉死在内容流的某个位置而非浮在视口底部。
 */
import { LitElement, html, css } from 'lit'
import { sharedTokens } from '../theme/shared-styles.js'
import './ai-message-item.js'

export class AiMessageList extends LitElement {
  static properties = {
    messages: { type: Array },
    status: { type: String },        // idle / streaming / waiting_answer / error
    _showJump: { state: true },      // 是否显示"回到底部"按钮
    _atBottom: { state: true },      // 是否在底部附近(决定是否自动跟随)
  }

  static styles = [
    sharedTokens,
    css`
      :host {
        display: block;
        position: relative;
        height: 100%;
      }
      /* 滚动区域:独立于 :host,使 .jump-btn 的 absolute 定位不受滚动影响 */
      .scroll-area {
        height: 100%;
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: var(--oc-border-strong) transparent;
      }
      .scroll-area::-webkit-scrollbar { width: 8px; }
      .scroll-area::-webkit-scrollbar-thumb { background: var(--oc-border-strong); border-radius: 4px; }
      .scroll-area::-webkit-scrollbar-track { background: transparent; }

      .list {
        max-width: 800px;
        margin: 0 auto;
        padding: 24px 20px 64px;
        display: flex;
        flex-direction: column;
        gap: 24px;
      }

      /* 回到底部浮层:绝对定位于 :host(不滚动),始终贴在视口底部居中 */
      .jump-btn {
        position: absolute;
        left: 50%;
        transform: translateX(-50%);
        bottom: 16px;
        z-index: 10;
        display: inline-flex; align-items: center; gap: 4px;
        padding: 6px 12px;
        font-size: var(--oc-font-size-small);
        font-family: var(--oc-font-sans);
        color: var(--oc-text-base);
        background: var(--oc-bg-base);
        border: 0.5px solid var(--oc-border-base);
        border-radius: var(--oc-radius-lg);
        box-shadow: var(--oc-shadow-raised);
        cursor: pointer;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.15s ease;
      }
      .jump-btn.show { opacity: 1; pointer-events: auto; }
      .jump-btn:hover { border-color: var(--oc-border-strong); }
      .jump-btn .arrow { font-size: 12px; }

      .empty {
        min-height: 100%;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 16px;
        padding: 48px 20px;
        max-width: 720px;
        margin: 0 auto;
        text-align: center;
      }
      .empty .mark {
        width: 40px; height: 40px;
        border-radius: var(--oc-radius-lg);
        background: var(--oc-accent-fill);
        display: flex; align-items: center; justify-content: center;
        color: #fff; font-weight: 700; font-size: 20px;
        font-family: var(--oc-font-sans);
      }
      .empty .title {
        font-size: var(--oc-font-size-xlarge);
        font-weight: 600;
        color: var(--oc-text-base);
        font-family: var(--oc-font-sans);
      }
      .empty .subtitle {
        font-size: var(--oc-font-size-base);
        color: var(--oc-text-muted);
        max-width: 480px;
        line-height: 1.5;
      }
      .empty .examples {
        margin-top: 12px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        width: 100%;
        max-width: 480px;
      }
      .empty .example {
        text-align: left;
        padding: 10px 14px;
        font-size: var(--oc-font-size-small);
        color: var(--oc-text-muted);
        border: 0.5px solid var(--oc-border-base);
        border-radius: var(--oc-radius-md);
        background: var(--oc-bg-base);
        cursor: pointer;
        transition: border-color 0.15s ease, color 0.15s ease;
        font-family: var(--oc-font-sans);
      }
      .empty .example:hover {
        border-color: var(--oc-accent-focus);
        color: var(--oc-text-base);
      }
    `,
  ]

  constructor () {
    super()
    this.messages = []
    this.status = 'idle'
    this._showJump = false
    this._atBottom = true
    this._programmaticScroll = false   // 程序滚动标记(避免误判为用户滚动)
  }

  /** 滚动区域元素(.scroll-area)。 */
  get _scrollEl () {
    return this.renderRoot?.querySelector('.scroll-area')
  }

  /** 用户滚动:判断是否在底部附近,更新粘底/回到底部状态。 */
  _onScroll () {
    // 程序触发的滚动不计入用户操作
    if (this._programmaticScroll) return
    const el = this._scrollEl
    if (!el) return
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight
    const threshold = Math.max(400, el.clientHeight)
    this._atBottom = dist <= 80
    this._showJump = dist > threshold
  }

  updated (changed) {
    // 消息或流式状态变化时,若用户仍在底部附近 → 跟随到底。
    // 注意:子组件(ai-message-item 等)是独立 LitElement,本 updated 触发时它们
    // 还没渲染完,scrollHeight 是旧值。必须用 requestAnimationFrame 等下一帧
    // (浏览器完成布局/子组件渲染后)再滚动,否则会停在错误位置。
    if ((changed.has('messages') || changed.has('status')) && this._atBottom) {
      this._scrollToBottomNextFrame()
    }
  }

  /** 下一帧滚动到底(等子组件渲染完成)。 */
  _scrollToBottomNextFrame () {
    requestAnimationFrame(() => {
      const el = this._scrollEl
      if (!el) return
      this._programmaticScroll = true
      el.scrollTop = el.scrollHeight
      // 标记在下一帧清除,让 scroll 事件跳过程序滚动
      requestAnimationFrame(() => { this._programmaticScroll = false })
    })
  }

  _jumpToBottom () {
    this._atBottom = true
    this._showJump = false
    this._scrollToBottomNextFrame()
  }

  /** 空状态示例点击。 */
  _onExampleClick (text) {
    this.dispatchEvent(new CustomEvent('example-click', { detail: text }))
  }

  render () {
    // .jump-btn 放在 .scroll-area 外层,使其 absolute 定位基于 :host(不随内容滚动)。
    const jumpBtn = this._showJump
      ? html`<button class="jump-btn show" @click=${this._jumpToBottom}><span class="arrow">↓</span>回到底部</button>`
      : ''
    if (!this.messages || this.messages.length === 0) {
      const examples = [
        '创建员工信息表单,包含姓名、工号、部门、入职日期',
        '生成一个订单录入页面,带客户选择和金额合计',
        '做一个数据字典,包含客户类型和行业分类',
      ]
      return html`<div class="scroll-area" @scroll=${this._onScroll}>
        <div class="empty">
          <div class="mark">C</div>
          <div class="title">智能开发助手</div>
          <div class="subtitle">描述你想要的表单,AI 帮你生成 HTML 页面、数据字典或单据。</div>
          <div class="examples">
            ${examples.map(t => html`<div class="example" @click=${() => this._onExampleClick(t)}>${t}</div>`)}
          </div>
        </div>
      </div>
      ${jumpBtn}`
    }
    return html`<div class="scroll-area" @scroll=${this._onScroll}>
      <div class="list">
        ${this.messages.map(m => html`<ai-message-item .message=${m}></ai-message-item>`)}
      </div>
    </div>
    ${jumpBtn}`
  }
}
customElements.define('ai-message-list', AiMessageList)
