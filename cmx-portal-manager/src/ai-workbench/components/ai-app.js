/**
 * cmx-ai-workbench 根组件 —— 协调中枢(opencode 风格布局)。
 *
 * 职责:
 * 1. 整体布局:简洁 header + 居中消息列 + 悬浮 composer
 * 2. 会话生命周期:创建会话 → 连 SSE → 发消息 → 接收事件 → store 累积
 * 3. 状态机:idle / streaming / waiting_answer / error
 * 4. 询问卡片:ask_user 事件插入 dock 卡片
 *
 * token 在本组件 :host 定义(sharedTokens),通过 CSS 变量继承穿透 shadow DOM 到所有子组件。
 * 事件流:SSE 事件 → MessageStore.handleSseEvent() → store 更新 → _messages 响应式刷新 → 子组件渲染
 */
import { LitElement, html, css } from 'lit'
import { sharedTokens } from '../theme/shared-styles.js'
import './ai-message-list.js'
import './ai-prompt-input.js'
import './ai-ask-card.js'
import './ai-approval-card.js'
import { AiSseClient, AiEventType } from '../services/sse-client.js'
import { MessageStore } from '../services/message-store.js'
import { normalizeWorkspaceRegionViews, htmlPageIdFromViewSpec } from '../../lib/workspace-view-config.js'
import {
  createSession, sendMessage, answerQuestion, approveDecision,
  abortSession, deleteSession, answerContextRequest,
} from '../lib/ai-api.js'
import { apiFetch } from 'cmx-ui5-runtime/api-client'

export class AiApp extends LitElement {
  static properties = {
    _messages: { state: true },
    _status: { state: true },        // idle / streaming / waiting_answer / error
    _error: { state: true },
    _askCard: { state: true },       // 当前询问卡片数据 (null = 无)
    _approvalCard: { state: true },  // 当前审批卡片数据 (null = 无)
    _sessionId: { state: true },
    _prefill: { state: true },       // 要填入输入框的预填文本(空状态示例点击)
  }

  static styles = [
    sharedTokens,
    css`
      :host {
        display: flex; flex-direction: column; height: 100%;
        background: var(--oc-bg-base);
        color: var(--oc-text-base);
        font-family: var(--oc-font-sans);
        font-size: var(--oc-font-size-base);
      }
      .header {
        flex-shrink: 0;
        display: flex; align-items: center; gap: 8px;
        padding: 10px 20px;
        border-bottom: 0.5px solid var(--oc-border-base);
        background: var(--oc-bg-base);
      }
      .header .mark {
        width: 22px; height: 22px;
        border-radius: var(--oc-radius-sm);
        background: var(--oc-accent-fill);
        color: #fff; font-weight: 700; font-size: 12px;
        display: flex; align-items: center; justify-content: center;
      }
      .title {
        font-size: var(--oc-font-size-base); font-weight: 600;
        color: var(--oc-text-base);
      }
      .new-btn {
        margin-left: auto;
        padding: 4px 12px;
        font-size: 12px;
        cursor: pointer;
        border: 0.5px solid var(--oc-border-base);
        border-radius: var(--oc-radius-sm);
        background: transparent;
        color: var(--oc-text-muted);
        font-family: var(--oc-font-sans);
        transition: border-color 0.15s ease, color 0.15s ease;
      }
      .new-btn:hover { border-color: var(--oc-border-strong); color: var(--oc-text-base); }

      .messages-area {
        flex: 1; overflow: hidden; display: flex; flex-direction: column; min-height: 0;
      }
      ai-message-list { flex: 1; }
      .ask-overlay { padding: 0 20px 12px; }
    `,
  ]

  constructor () {
    super()
    this._messages = []
    this._status = 'idle'
    this._error = ''
    this._askCard = null
    this._approvalCard = null
    this._sessionId = null
    this._prefill = ''
    this._store = new MessageStore()
    this._sse = null
    this._store.subscribe((msgs) => { this._messages = [...msgs] })
  }

  disconnectedCallback () {
    if (this._sse) this._sse.close()
    super.disconnectedCallback()
  }

  async _onSend (e) {
    const text = e.detail
    if (!text) return
    this._error = ''
    if (!this._sessionId) {
      try {
        const data = await createSession()
        this._sessionId = data.sessionId
        this._connectSse()
      } catch (err) {
        this._setError('创建会话失败:' + err.message)
        return
      }
    }
    this._store.addUserMessage(text)
    this._store.startAssistantMessage()
    this._status = 'streaming'
    try {
      await sendMessage(this._sessionId, text)
    } catch (err) {
      if (err.status === 409) this._setError('该会话已有进行中的生成,请等待或中止')
      else if (err.status === 503) this._setError('AI 服务未就绪,请稍后重试')
      else this._setError('发送失败:' + err.message)
    }
  }

  async _onAbort () {
    if (!this._sessionId) return
    // 先本地清理(有内容保留、无内容移除空气泡)，再请求后端中止
    this._store._abortActive()
    this._status = 'idle'
    try { await abortSession(this._sessionId) } catch {}
  }

  async _onNewSession () {
    if (this._sse) { this._sse.close(); this._sse = null }
    if (this._sessionId) { try { await deleteSession(this._sessionId) } catch {} }
    this._sessionId = null
    this._store.clear()
    this._messages = []
    this._status = 'idle'
    this._error = ''
    this._askCard = null
    this._approvalCard = null
  }

  _connectSse () {
    if (this._sse) this._sse.close()
    this._sse = new AiSseClient(this._sessionId)
    for (const t of [AiEventType.TEXT_DELTA, AiEventType.REASONING_DELTA, AiEventType.TOOL_CALL, AiEventType.JSON_CHUNK, AiEventType.RESULT, AiEventType.ERROR, AiEventType.DONE]) {
      this._sse.on(t, (data) => this._store.handleSseEvent(t, data))
    }
    this._sse.on(AiEventType.ASK_USER, (data) => {
      this._askCard = data
      this._status = 'waiting_answer'
    })
    this._sse.on(AiEventType.REQUIRE_APPROVAL, (data) => {
      this._approvalCard = data
      this._status = 'waiting_answer'
    })
    // 隐式上下文请求：插件工具要当前页面信息 → 前端自动收集并回传（无询问框）。
    this._sse.on(AiEventType.CONTEXT_REQUEST, async (data) => {
      const requestId = data?.requestId || data?.request_id || ''
      if (!requestId) return
      try {
        const pageInfo = await this._collectCurrentPageInfo(data?.want)
        await answerContextRequest(this._sessionId, requestId, pageInfo)
      } catch (err) {
        // 回传失败也要响应，否则后端 oneshot 会挂到超时。
        await answerContextRequest(this._sessionId, requestId, {
          error: err instanceof Error ? err.message : String(err),
        }).catch(() => {})
      }
    })
    this._sse.on(AiEventType.DONE, () => { this._status = 'idle' })
    this._sse.on(AiEventType.ERROR, (data) => {
      // code=499 为用户中断，已由 _abortActive 处理，不弹错误态
      if (data && data.code === 499) return
      this._setError((data && (data.message || data.msg)) || '生成出错')
    })
    this._sse.connect()
  }

  /**
   * 收集当前页面的信息（隐式上下文回传用）。
   *
   * 走和浮窗标题同一条链路：content-area.getTabHeader / getTabWorkspaceShell。
   * 这些是 portal-content-area 的现成公开方法，无需 portal-app 加任何新代码。
   *
   * 能拿到：tabId、标题、图标、workspace shell 配置（含各区域 views）、
   * 当前页面引用的 HTML 表单 id 列表（从 shell 的 html_pages 视图提取）。
   *
   * @param {string[]|undefined} want 期望的信息类型
   * @returns {Promise<Record<string, unknown>>} 页面信息对象
   */
  async _collectCurrentPageInfo (want) {
    const wantArr = Array.isArray(want) ? want : []
    const wantAll = wantArr.length === 0
    const wantSet = new Set(wantArr)
    const wantField = (k) => wantAll || wantSet.has(k)

    // 定位 content-area 元素（portal-app shadowRoot 内，id="content-area"）。
    const app = /** @type {any} */ (document.querySelector('cmx-portal-app'))
    const content = /** @type {any} */ (app?.shadowRoot?.getElementById('content-area'))
    if (!content || typeof content.getActiveTabId !== 'function') {
      return { error: '无法获取当前页面信息：门户 content-area 不可达' }
    }

    const tabId = content.getActiveTabId()
    if (!tabId) {
      return { hint: '当前没有打开业务页面。请先在左侧菜单打开一个功能页面。' }
    }

    /** @type {Record<string, unknown>} */
    const info = { tabId }

    // 标题 + 图标（和浮窗标题栏同源：getTabHeader）。
    if (wantField('menuLabel') || wantAll) {
      const header = typeof content.getTabHeader === 'function' ? content.getTabHeader(tabId) : null
      if (header) {
        info.title = String(header.text || '')
        info.icon = String(header.icon || '')
      }
    }

    // 从原始 workspace 配置提取各区域的 HTML 表单（带区域/标签信息）。
    // 注意：getTabWorkspaceShell 不含 content 区域（workspaceShellSnapshot 只取 explorer/property/bottom/floatview），
    // 而 html_page id 在 content.views 里，所以必须用 getTabOriginalWorkspace（完整原始 workspace）。
    const originalWs = typeof content.getTabOriginalWorkspace === 'function'
      ? content.getTabOriginalWorkspace(tabId)
      : null
    const shell = typeof content.getTabWorkspaceShell === 'function'
      ? content.getTabWorkspaceShell(tabId)
      : null
    const fullWs = originalWs || shell

    /** @type {{ region: string, label: string, htmlPageId: string }[]} */
    const forms = []
    if (fullWs && typeof fullWs === 'object') {
      const REGION_LABELS = { content: '主内容区', explorer: '资源管理区', property: '属性区', bottom: '底部区', floatview: '浮动视图', prepare: '准备区', model: '数据模型', inner: '内嵌页', embed: '嵌入页' }
      for (const [regionKey, regionRaw] of Object.entries(fullWs)) {
        if (regionKey === 'float' || !Object.prototype.hasOwnProperty.call(fullWs, regionKey)) continue
        // 跳过非区域字段（caption/icon 等区域级元数据不在此遍历，只取 views）。
        const views = normalizeWorkspaceRegionViews(regionRaw)
        // 区域可能有 caption（如 content.caption），取出来做标签。
        const regionObj = regionRaw && typeof regionRaw === 'object' && !Array.isArray(regionRaw) ? regionRaw : null
        const regionCaption = regionObj?.caption || ''
        for (const v of views) {
          if (String(v.type || '').trim().toLowerCase() !== 'html_pages') continue
          const pid = htmlPageIdFromViewSpec(v)
          if (!pid) continue
          const viewLabel = v.tabLabel || regionCaption || REGION_LABELS[regionKey] || regionKey
          forms.push({ region: regionKey, label: String(viewLabel), htmlPageId: pid })
        }
      }
    }

    // 逐个验证表单 id 是否真实存在于 html-pages 存储。
    /** @type {typeof forms} */
    const validForms = []
    for (const f of forms) {
      try {
        // apiFetch 拆 ApiResp 信封；页面不存在/网络失败抛错 → 跳过该表单。
        const data = await apiFetch(`/api/html-pages/${encodeURIComponent(f.htmlPageId)}`)
        if (data && typeof data === 'object') {
          validForms.push({ ...f, name: String(data.name || '') })
        }
      } catch {
        // 单页校验失败（不存在/网络）：跳过，不影响其余表单。
      }
    }

    if (validForms.length) {
      info.forms = validForms.map(({ region, label, htmlPageId, name }) => ({ region, label, htmlPageId, name }))
      // 兼容：单个表单时仍给顶层 htmlPageId（最常见场景）。
      if (validForms.length === 1) {
        info.htmlPageId = validForms[0].htmlPageId
        info.htmlPageName = validForms[0].name || ''
        if (wantField('htmlPage')) {
          try {
            const data = await apiFetch(`/api/html-pages/${encodeURIComponent(validForms[0].htmlPageId)}`)
            if (data?.html) info.htmlPageContent = data.html
          } catch { /* 内容拉取失败：忽略，仅缺 htmlPageContent */ }
        }
      } else {
        // 多张表单：不自动选，提示 AI 向用户确认改哪张。
        info.htmlPageId = null
        info.note = `当前页面有 ${validForms.length} 张表单，请先向用户确认要修改哪一张：` +
          validForms.map((f, i) => `${i + 1}. ${f.label}（${f.region}区，id: ${f.htmlPageId}）`).join('；')
      }
    } else {
      info.forms = []
      info.htmlPageId = null
      info.note = `当前页面 tabId 为「${tabId}」，但未在 html-pages 存储中找到表单。` +
        '可能是原生页或其他类型，可用 ListHtmlPages 工具查看可编辑的表单列表。'
    }

    if (wantField('workspaceConfig') && fullWs) info.workspaceShell = fullWs

    // 当前 activity 信息（域/应用层级）。
    if (app && (wantField('activityId') || wantField('domain'))) {
      info.activityId = app._activeActivity || ''
    }

    return info
  }

  async _onAnswer (e) {
    const answers = e.detail
    // 后端 camelCase questionId,兼容 snake_case question_id
    const qid = this._askCard?.questionId || this._askCard?.question_id
    this._askCard = null
    this._status = 'streaming'
    if (qid) {
      try { await answerQuestion(this._sessionId, qid, answers) }
      catch (err) { this._setError('回答失败:' + err.message) }
    }
  }

  async _onApproval (e) {
    const { approvalId, decision } = e.detail
    this._approvalCard = null
    this._status = 'streaming'
    if (approvalId) {
      try { await approveDecision(this._sessionId, approvalId, decision) }
      catch (err) { this._setError('审批失败:' + err.message) }
    }
  }

  _setError (msg) {
    this._status = 'error'
    this._error = msg
  }

  /** 空状态示例点击:填入输入框(每次用新字符串触发 prompt-input 响应)。 */
  _onExampleClick (e) {
    this._prefill = e.detail
    // 触发后立即清空,避免重复填入(prompt-input 已在 willUpdate 里消费)
    setTimeout(() => { this._prefill = '' }, 0)
  }

  render () {
    return html`
      <div class="header">
        <span class="mark">C</span>
        <span class="title">智能开发助手</span>
        <button class="new-btn" @click=${this._onNewSession}>新会话</button>
      </div>
      <div class="messages-area">
        <ai-message-list .messages=${this._messages} .status=${this._status} @example-click=${this._onExampleClick}></ai-message-list>
        ${this._askCard ? html`<div class="ask-overlay">
          <ai-ask-card .data=${this._askCard} @answer=${this._onAnswer}></ai-ask-card>
        </div>` : ''}
        ${this._approvalCard ? html`<div class="ask-overlay">
          <ai-approval-card .data=${this._approvalCard} @decision=${this._onApproval}></ai-approval-card>
        </div>` : ''}
      </div>
      <ai-prompt-input
        .status=${this._status}
        .errorMessage=${this._error}
        .prefill=${this._prefill}
        @send=${this._onSend}
        @abort=${this._onAbort}
      ></ai-prompt-input>
    `
  }
}
customElements.define('ai-app', AiApp)

// 同时注册旧标签名 cmx-ai-workbench-app 兼容 index.html
customElements.define('cmx-ai-workbench-app', class extends AiApp {})
