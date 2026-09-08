import { apiFetch, apiPost } from 'cmx-ui5-runtime/api-client'
import { registerWorkspaceViewType } from '../lib/workspace-view-renderer.js'
import { escAttr, escHtml } from '../lib/escape.js'

const STORAGE_KEY = 'cmx-portal:agent-console:v1'
const MAX_THREADS = 12
const TEXT_FILE_PREVIEW_LIMIT = 20000

const DEFAULT_MODEL_OPTIONS = [
  { id: 'deepseek-chat', label: 'DeepSeek Chat' },
  { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner' },
  { id: 'configured', label: '服务默认' },
]

const DEFAULT_CONTEXT_OPTIONS = [
  { id: 'workspace', label: '当前工作区' },
  { id: 'page', label: '当前页面' },
  { id: 'minimal', label: '精简上下文' },
]

const DEFAULT_EXECUTION_OPTIONS = [
  { id: 'ask', label: '手动确认', desc: '涉及执行操作时先询问' },
  { id: 'auto', label: '自动执行', desc: '允许助手自动执行可用操作' },
  { id: 'read-only', label: '只读模式', desc: '仅分析与读取，不执行变更' },
]

function newId (prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function safeJson (value) {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function initialEvents (text = 'Agent Console 已就绪。') {
  return [
    { type: 'assistant', text, at: new Date().toISOString(), _id: newId('evt') },
    { type: 'plan', items: ['接收目标', '按需调用只读工具', '汇总定位结果'], at: new Date().toISOString(), _id: newId('evt') },
  ]
}

function createThread (title = '新线程') {
  const now = new Date().toISOString()
  return {
    threadId: newId('thread'),
    title,
    conversationId: '',
    messages: [],
    events: initialEvents(title === '新线程' ? '新线程已创建。' : 'Agent Console 已就绪。'),
    updatedAt: now,
    model: 'configured',
    contextMode: 'workspace',
    params: { temperature: 0.2, approvalMode: 'ask' },
  }
}

function summarizeTitle (text) {
  const s = String(text || '').trim().replace(/\s+/g, ' ')
  return s ? s.slice(0, 28) : '新线程'
}

function loadStoredState () {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    const data = raw ? JSON.parse(raw) : null
    if (!data) return null
    if (Array.isArray(data.threads)) {
      const threads = data.threads
        .filter((t) => t && typeof t === 'object' && Array.isArray(t.messages) && Array.isArray(t.events))
        .slice(0, MAX_THREADS)
      if (!threads.length) return null
      return {
        activeThreadId: String(data.activeThreadId || threads[0].threadId || ''),
        threads,
      }
    }
    if (!Array.isArray(data.messages) || !Array.isArray(data.events)) return null
    const migrated = createThread('上一线程')
    migrated.conversationId = String(data.conversationId || '')
    migrated.messages = data.messages.slice(-40)
    migrated.events = data.events.slice(-120)
    migrated.title = summarizeTitle(migrated.messages.find((m) => m.role === 'user')?.content) || '上一线程'
    return {
      activeThreadId: migrated.threadId,
      threads: [migrated],
    }
  } catch {
    return null
  }
}

function storeThread (state) {
  try {
    state._syncActiveThread()
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      activeThreadId: state._activeThreadId,
      threads: state._threads.slice(0, MAX_THREADS).map((t) => ({
        ...t,
        messages: Array.isArray(t.messages) ? t.messages.slice(-40) : [],
        events: Array.isArray(t.events) ? t.events.slice(-120) : [],
      })),
    }))
  } catch {}
}

export class PortalAgentConsole extends HTMLElement {
  constructor () {
    super()
    this.attachShadow({ mode: 'open' })
    const stored = loadStoredState()
    this._threads = stored?.threads || [createThread('默认线程')]
    this._activeThreadId = stored?.activeThreadId || this._threads[0].threadId
    this._activeThread = this._threads.find((t) => t.threadId === this._activeThreadId) || this._threads[0]
    this._conversationId = this._activeThread.conversationId || ''
    this._messages = this._activeThread.messages || []
    this._events = this._activeThread.events || initialEvents()
    this._selectedEventId = ''
    this._loading = false
    this._error = ''
    this._capabilities = null
    this._threadMenuOpen = false
    this._modelMenuOpen = false
    this._contextMenuOpen = false
    this._executionMenuOpen = false
    this._settingsOpen = false
    this._attachments = []
    this._streamAbortController = null
    this._scrollTimers = []
    this._resizeObserver = null
    this._onClick = (e) => this._handleClick(e)
    this._onSubmit = (e) => this._handleSubmit(e)
    this._onKeydown = (e) => this._handleKeydown(e)
    this._onChange = (e) => this._handleChange(e)
  }

  connectedCallback () {
    this._render()
    this._scrollToEnd()
    this._observeThreadResize()
    const sr = this.shadowRoot
    sr.addEventListener('click', this._onClick)
    sr.addEventListener('submit', this._onSubmit)
    sr.addEventListener('keydown', this._onKeydown)
    sr.addEventListener('change', this._onChange)
    void this._loadCapabilities()
  }

  disconnectedCallback () {
    const sr = this.shadowRoot
    sr.removeEventListener('click', this._onClick)
    sr.removeEventListener('submit', this._onSubmit)
    sr.removeEventListener('keydown', this._onKeydown)
    sr.removeEventListener('change', this._onChange)
    this._clearScrollTimers()
    this._resizeObserver?.disconnect()
    this._resizeObserver = null
  }

  async _loadCapabilities () {
    try {
      const data = await apiFetch('/api/agent/capabilities')
      this._capabilities = data
      this._renderStatus()
    } catch (err) {
      this._error = err instanceof Error ? err.message : String(err)
      this._render()
    }
  }

  _handleClick (e) {
    const t = e.target instanceof Element ? e.target.closest('[data-action]') : null
    if (!(t instanceof HTMLElement)) return
    const action = t.dataset.action
    if (action === 'new-thread') this._newThread()
    if (action === 'toggle-thread-menu') this._togglePopover('thread')
    if (action === 'delete-thread') {
      this._deleteThread(t.dataset.threadId || '')
      return
    }
    if (action === 'select-thread') this._selectThread(t.dataset.threadId || '')
    if (action === 'attach') this.shadowRoot.getElementById('agent-file-input')?.click?.()
    if (action === 'remove-attachment') this._removeAttachment(t.dataset.attachmentId || '')
    if (action === 'toggle-model') this._togglePopover('model')
    if (action === 'select-model') this._setModel(t.dataset.model || '')
    if (action === 'toggle-context') this._togglePopover('context')
    if (action === 'select-context') this._setContextMode(t.dataset.context || '')
    if (action === 'toggle-execution') this._togglePopover('execution')
    if (action === 'toggle-settings') this._togglePopover('settings')
    if (action === 'set-approval') this._setApprovalMode(t.dataset.approval || '')
    if (action === 'export-thread') this._exportThreadHtml()
    if (action === 'stop-agent') this._stopStreaming()
    if (action === 'approve' || action === 'reject') {
      void this._decideApproval(t.dataset.approvalId || '', action === 'approve' ? 'approve' : 'reject')
      return
    }
    if (action === 'submit-approval-choice') {
      const approvalId = t.dataset.approvalId || ''
      const selection = this._collectApprovalSelection(approvalId)
      const decision = selection.decision === 'approve' ? 'approve' : 'reject'
      void this._decideApproval(approvalId, decision, selection)
      return
    }
    if (action === 'select-event') {
      if (this._hasActiveTextSelection()) return
      this._selectedEventId = t.dataset.eventId || ''
      this._renderEvents()
      this._renderDetail()
      this._emitDetailChange()
    }
  }

  _handleChange (e) {
    const t = e.target
    if (t instanceof HTMLInputElement && t.id === 'agent-file-input') {
      void this._addFiles(t.files)
      t.value = ''
      return
    }
    if (t instanceof HTMLInputElement && t.dataset.param === 'temperature') {
      const n = Number(t.value)
      this._activeThread.params = { ...(this._activeThread.params || {}), temperature: Number.isFinite(n) ? n : 0.2 }
      this._syncActiveThread()
      storeThread(this)
      this._render()
    }
  }

  _handleKeydown (e) {
    if (!(e.target instanceof HTMLTextAreaElement)) return
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      const form = e.target.closest('form')
      if (form) form.requestSubmit()
    }
  }

  async _handleSubmit (e) {
    e.preventDefault()
    if (this._loading) return
    const textarea = this.shadowRoot.getElementById('agent-input')
    if (!(textarea instanceof HTMLTextAreaElement)) return
    const text = textarea.value.trim()
    if (!text) return
    textarea.value = ''
    await this._send(text)
  }

  async _send (text) {
    this._loading = true
    this._error = ''
    const attachments = this._attachments.slice()
    const fullText = attachments.length ? `${text}\n\n附件：\n${attachments.map((a) => `- ${a.name} (${a.type || 'file'}, ${a.size} bytes)${a.text ? `\n${a.text.slice(0, TEXT_FILE_PREVIEW_LIMIT)}` : ''}`).join('\n')}` : text
    this._messages.push({ role: 'user', content: fullText })
    this._events.push({
      type: 'user',
      text,
      attachments: attachments.map((a) => ({ name: a.name, type: a.type, size: a.size })),
      at: new Date().toISOString(),
    })
    if (this._activeThread.title === '新线程' || this._activeThread.title === '默认线程') {
      this._activeThread.title = summarizeTitle(text)
    }
    this._attachments = []
    this._render()
    // 「打开功能」意图：如“我要录入凭证 / 打开会计核算 / 进入凭证工作台”，直接解析并打开对应功能。
    if (this._looksLikeOpenIntent(text)) {
      let handled = false
      try {
        handled = await this._tryOpenFunction(text)
      } catch (err) {
        // 解析失败不阻断：落到下面的常规问答/agent。
        console.warn('[agent-console] launcher resolve failed:', err)
      }
      if (handled) {
        this._loading = false
        this._render()
        this._scrollToEnd()
        return
      }
    }
    // 帮助中心打开时：走纯问答端点 /api/ai/chat，基于「当前帮助内容」直接作答，
    // 不走本地文件编辑/检索 agent（那个会去文件系统搜关键词，答非所问）。
    const wsCtx = this._workspaceContext()
    if (wsCtx && wsCtx.helpContent) {
      try {
        await this._sendHelpChat(fullText, wsCtx)
      } catch (err) {
        this._error = err instanceof Error ? err.message : String(err)
      } finally {
        this._loading = false
        this._render()
        this._scrollToEnd()
      }
      return
    }
    try {
      await this._sendStream({
        conversationId: this._conversationId,
        messages: this._messages,
        context: wsCtx,
      })
    } catch (err) {
      if (err?.name === 'AbortError') {
        this._events.push({ type: 'assistant', text: '已停止本轮响应。', at: new Date().toISOString(), _id: newId('evt') })
      } else {
        try {
          await this._sendOnceFallback({
            conversationId: this._conversationId,
            messages: this._messages,
            context: this._workspaceContext(),
          })
        } catch (fallbackErr) {
          this._error = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)
        }
      }
    } finally {
      this._streamAbortController = null
      this._loading = false
      this._render()
      this._scrollToEnd()
    }
  }

  /**
   * 帮助问答：调用纯对话端点 /api/ai/chat，基于当前帮助内容直接作答。
   * 与文件编辑 agent 分离——这里不规划工具、不读写文件，只是带上下文的多轮对话。
   * @param {string} _fullText 已 push 到 _messages 的用户文本（此处不再使用，messages 已含）
   * @param {Record<string, unknown>} wsCtx 含 helpContent 的工作区上下文
   */
  async _sendHelpChat (_fullText, wsCtx) {
    // 只发最近若干轮，过滤成 role/content；system 由后端按 context 注入。
    const history = this._messages
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-12)
    // apiPost 拆 ApiResp 信封：HTTP/业务失败抛错（msg 文案），成功返回内层 data。
    const payload = await apiPost('/api/ai/chat', { messages: history, context: wsCtx })
    const content = payload?.message?.content || payload?.content || ''
    if (!content) throw new Error('AI 未返回有效回复')
    this._events.push({ type: 'assistant', text: content, at: new Date().toISOString(), _id: newId('evt') })
    this._messages.push({ role: 'assistant', content })
    storeThread(this)
  }

  /**
   * 粗判是否「打开功能」意图：含打开类动词，或以“我要…”表达想做某事。
   * 只做轻量门槛，真正的匹配交给后端 /api/launcher/resolve（AI 语义 + 关键词兜底）。
   * @param {string} text
   */
  _looksLikeOpenIntent (text) {
    const t = String(text || '').trim()
    if (!t || t.length > 40) return false // 过长更像在提问/描述，不当作打开意图
    // 打开类动词 / 口语化表达
    return /(^|[\s，。、])(打开|进入|跳转到?|去|帮我?(打开|进入|找)|我要|我想|想要|启动|调出|切换到)/.test(t)
  }

  /**
   * 解析「打开功能」意图并执行：调用 /api/launcher/resolve，命中则派发执行事件打开功能。
   * @param {string} text 用户原话
   * @returns {Promise<boolean>} 是否已处理（true 则不再走常规问答）
   */
  async _tryOpenFunction (text) {
    // 解析失败（网络/HTTP/业务错）一律按「未处理」回退常规问答——调用方已 try/catch 兜底。
    let payload = null
    try {
      payload = await apiPost('/api/launcher/resolve', { query: text })
    } catch {
      return false
    }
    if (!payload || !payload.matched || !payload.node) {
      // 未命中：若有候选，给出可点的提示，让用户更明确（仍返回 true，避免误触发文件 agent）。
      const cands = Array.isArray(payload?.candidates) ? payload.candidates : []
      if (cands.length) {
        const lines = cands.slice(0, 6).map((c) => `- ${c.caption}`).join('\n')
        this._pushAssistant(`没找到完全匹配「${text}」的功能。你是不是想打开：\n${lines}\n\n可以说得更具体些，或直接说功能名称。`)
        return true
      }
      return false
    }
    // 命中：提示并派发执行事件（复用 portal-app 的 portal-help-action → openWorkspaceNode）。
    const caption = payload.caption || payload.node.caption || payload.node.name || '该功能'
    this._pushAssistant(`正在为你打开 **${caption}**…`)
    this._dispatchOpenFunction(payload.node)
    return true
  }

  /** 把一段助手文本作为消息追加并落库（供「打开功能」提示用）。 */
  _pushAssistant (content) {
    this._events.push({ type: 'assistant', text: content, at: new Date().toISOString(), _id: newId('evt') })
    this._messages.push({ role: 'assistant', content })
    storeThread(this)
  }

  /** 派发 composed 事件让 portal-app 打开工作区节点（与帮助正文「执行功能」链接同一条链路）。 */
  _dispatchOpenFunction (node) {
    const detail = { kind: 'inlineNode', node }
    try {
      this.dispatchEvent(new CustomEvent('portal-help-action', { detail, bubbles: true, composed: true }))
    } catch {
      try { document.dispatchEvent(new CustomEvent('portal-help-action', { detail, bubbles: true, composed: true })) } catch { /* noop */ }
    }
  }

  async _sendOnceFallback (payload) {
    const data = await apiPost('/api/agent/message', payload)
    this._conversationId = data.conversationId || this._conversationId
    this._activeThread.conversationId = this._conversationId
    const incoming = Array.isArray(data.events) ? data.events : []
    const assistantTexts = []
    for (const it of incoming) {
      const ev = this._applyStreamAgentEvent(it)
      if (ev?.type === 'assistant' && ev.text && !ev._streaming) assistantTexts.push(ev.text)
    }
    const assistantText = assistantTexts.filter(Boolean).pop()
    if (assistantText) this._messages.push({ role: 'assistant', content: assistantText })
    storeThread(this)
  }

  async _sendStream (payload) {
    const controller = new AbortController()
    this._streamAbortController = controller
    const res = await fetch('/api/agent/message/stream', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'text/event-stream',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
    const assistantTexts = []
    await this._readSseStream(res, {
      meta: (data) => {
        this._conversationId = data?.conversationId || this._conversationId
        this._activeThread.conversationId = this._conversationId
        storeThread(this)
      },
      agent_event: (data) => {
        if (!data || typeof data !== 'object') return
        const ev = this._applyStreamAgentEvent(data)
        if (ev?.type === 'assistant' && ev.text && !ev._streaming) assistantTexts.push(ev.text)
        this._renderEvents()
        this._renderDetail()
        this._renderStatus()
        this._scrollToEnd()
        storeThread(this)
      },
      done: (data) => {
        this._conversationId = data?.conversationId || this._conversationId
        this._activeThread.conversationId = this._conversationId
      },
      error: (data) => {
        throw new Error(data?.error || 'Agent 流式请求失败')
      },
    })
    const assistantText = assistantTexts.filter(Boolean).pop()
    if (assistantText) this._messages.push({ role: 'assistant', content: assistantText })
    storeThread(this)
  }

  _applyStreamAgentEvent (data) {
    if (data.type === 'assistant_start') {
      const ev = {
        type: 'assistant',
        text: '',
        at: data.at || new Date().toISOString(),
        _id: newId('evt'),
        _streamId: data.id || newId('stream'),
        _streaming: true,
      }
      this._events.push(ev)
      return ev
    }
    if (data.type === 'assistant_delta') {
      const ev = this._findStreamingAssistant(data.id)
      if (ev) {
        ev.text = `${ev.text || ''}${data.delta || ''}`
        ev.at = data.at || ev.at
        return ev
      }
      const created = {
        type: 'assistant',
        text: String(data.delta || ''),
        at: data.at || new Date().toISOString(),
        _id: newId('evt'),
        _streamId: data.id || newId('stream'),
        _streaming: true,
      }
      this._events.push(created)
      return created
    }
    if (data.type === 'assistant_done') {
      const ev = this._findStreamingAssistant(data.id)
      if (ev) {
        ev.text = data.text || ev.text || ''
        ev.at = data.at || ev.at
        ev._streaming = false
        return ev
      }
      const created = { type: 'assistant', text: data.text || '', at: data.at || new Date().toISOString(), _id: newId('evt'), _streamId: data.id || '' }
      this._events.push(created)
      return created
    }
    if (data.type === 'workflow' && data.id) {
      const existing = this._events.find((it) => it.type === 'workflow' && it.id === data.id)
      if (existing) {
        Object.assign(existing, data)
        return existing
      }
    }
    const ev = { ...data, _id: newId('evt') }
    this._events.push(ev)
    return ev
  }

  _findStreamingAssistant (streamId) {
    const id = String(streamId || '')
    for (let i = this._events.length - 1; i >= 0; i -= 1) {
      const ev = this._events[i]
      if (ev?.type !== 'assistant') continue
      if (id && ev._streamId === id) return ev
      if (!id && ev._streaming) return ev
    }
    return null
  }

  async _readSseStream (res, handlers) {
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let idx
      while ((idx = buffer.indexOf('\n\n')) >= 0) {
        const chunk = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)
        this._handleSseChunk(chunk, handlers)
      }
    }
    buffer += decoder.decode()
    if (buffer.trim()) this._handleSseChunk(buffer, handlers)
  }

  _handleSseChunk (chunk, handlers) {
    const lines = String(chunk || '').split(/\r?\n/)
    let name = 'message'
    const dataLines = []
    for (const line of lines) {
      if (!line || line.startsWith(':')) continue
      if (line.startsWith('event:')) name = line.slice(6).trim()
      if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart())
    }
    if (!dataLines.length) return
    let data = null
    try { data = JSON.parse(dataLines.join('\n')) } catch { data = dataLines.join('\n') }
    const handler = handlers?.[name]
    if (typeof handler === 'function') handler(data)
  }

  _stopStreaming () {
    if (this._streamAbortController) this._streamAbortController.abort()
  }

  async _decideApproval (approvalId, decision, selection = null) {
    if (!approvalId) return
    this._loading = true
    this._error = ''
    this._renderStatus()
    try {
      const data = await apiPost(`/api/agent/approvals/${encodeURIComponent(approvalId)}`, { decision, selection })
      const incoming = Array.isArray(data.events) ? data.events : []
      this._events.push(...incoming.map((it) => ({ ...it, _id: newId('evt') })))
      const assistantText = incoming.filter((it) => it.type === 'assistant').map((it) => it.text).filter(Boolean).pop()
      if (assistantText) this._messages.push({ role: 'assistant', content: assistantText })
      storeThread(this)
    } catch (err) {
      this._error = err instanceof Error ? err.message : String(err)
    } finally {
      this._loading = false
      this._render()
      this._scrollToEnd()
    }
  }

  _workspaceContext () {
    const root = this.getRootNode()
    const host = root?.host
    const title = host?.closest?.('[data-cmx-region]')?.getAttribute?.('data-cmx-view-id') || ''
    const app = document.querySelector('cmx-portal-app')
    const ctx = {
      workspaceTitle: title,
      location: window.location.pathname,
      href: window.location.href,
      documentTitle: document.title || '',
      activeWorkspaceTabId: app instanceof HTMLElement ? (app.dataset?.cmxActiveWsTab || '') : '',
      model: this._activeThread.model || 'configured',
      contextMode: this._activeThread.contextMode || 'workspace',
      params: this._activeThread.params || {},
    }
    // 帮助中心打开时，把「当前正在看的帮助文档」并入上下文，使 AI 就地回答当前帮助内容。
    const help = /** @type {any} */ (app)?._helpContext
    if (help && help.active !== false && (help.title || help.content)) {
      ctx.helpTopic = help.title || ''
      ctx.helpLocation = [help.domain, help.app, help.module].filter(Boolean).join('/') + (help.path ? `/${help.path}` : '')
      if (help.summary) ctx.helpSummary = help.summary
      if (help.content) ctx.helpContent = help.content
    }
    return ctx
  }

  _syncActiveThread () {
    if (!this._activeThread) return
    this._activeThread.conversationId = this._conversationId || ''
    this._activeThread.messages = this._messages.slice(-40)
    this._activeThread.events = this._events.slice(-120)
    this._activeThread.updatedAt = new Date().toISOString()
  }

  _newThread () {
    this._syncActiveThread()
    const thread = createThread()
    this._threads = [thread, ...this._threads.filter((t) => t.threadId !== thread.threadId)].slice(0, MAX_THREADS)
    this._activateThread(thread.threadId)
    this._threadMenuOpen = false
    storeThread(this)
    this._render()
  }

  _activateThread (threadId) {
    const thread = this._threads.find((t) => t.threadId === threadId) || this._threads[0]
    this._activeThreadId = thread.threadId
    this._activeThread = thread
    this._conversationId = thread.conversationId || ''
    this._messages = Array.isArray(thread.messages) ? thread.messages : []
    this._events = Array.isArray(thread.events) ? thread.events : initialEvents()
    this._selectedEventId = ''
    this._error = ''
    this._attachments = []
  }

  _selectThread (threadId) {
    if (!threadId || this._loading) return
    this._syncActiveThread()
    this._activateThread(threadId)
    this._threadMenuOpen = false
    storeThread(this)
    this._render()
  }

  _deleteThread (threadId) {
    if (!threadId || this._threads.length <= 1) return
    this._threads = this._threads.filter((t) => t.threadId !== threadId)
    if (this._activeThreadId === threadId) this._activateThread(this._threads[0].threadId)
    storeThread(this)
    this._render()
  }

  _togglePopover (name) {
    this._threadMenuOpen = name === 'thread' ? !this._threadMenuOpen : false
    this._modelMenuOpen = name === 'model' ? !this._modelMenuOpen : false
    this._contextMenuOpen = name === 'context' ? !this._contextMenuOpen : false
    this._executionMenuOpen = name === 'execution' ? !this._executionMenuOpen : false
    this._settingsOpen = name === 'settings' ? !this._settingsOpen : false
    this._render()
  }

  _setModel (model) {
    if (!model) return
    this._activeThread.model = model
    this._modelMenuOpen = false
    storeThread(this)
    this._render()
  }

  _setContextMode (mode) {
    if (!mode) return
    this._activeThread.contextMode = mode
    this._contextMenuOpen = false
    storeThread(this)
    this._render()
  }

  _setApprovalMode (mode) {
    if (!mode) return
    this._activeThread.params = { ...(this._activeThread.params || {}), approvalMode: mode }
    this._executionMenuOpen = false
    storeThread(this)
    this._render()
  }

  async _addFiles (fileList) {
    const files = Array.from(fileList || [])
    if (!files.length) return
    const added = []
    for (const file of files.slice(0, 8)) {
      const item = {
        id: newId('att'),
        name: file.name,
        type: file.type || '',
        size: file.size,
        kind: file.type.startsWith('image/') ? 'image' : 'file',
      }
      if (file.type.startsWith('text/') || /\.(json|md|txt|csv|xml|html|js|ts|css)$/i.test(file.name)) {
        item.text = await file.text().then((s) => s.slice(0, TEXT_FILE_PREVIEW_LIMIT)).catch(() => '')
      }
      added.push(item)
    }
    this._attachments = [...this._attachments, ...added].slice(-12)
    this._render()
  }

  _removeAttachment (id) {
    this._attachments = this._attachments.filter((a) => a.id !== id)
    this._render()
  }

  _scrollToEnd () {
    this._clearScrollTimers()
    this._scrollThreadToEnd()
    requestAnimationFrame(() => this._scrollThreadToEnd())
    requestAnimationFrame(() => requestAnimationFrame(() => this._scrollThreadToEnd()))
    for (const delay of [0, 80, 180, 360]) {
      this._scrollTimers.push(setTimeout(() => this._scrollThreadToEnd(), delay))
    }
  }

  scrollToLatest () {
    this._scrollToEnd()
  }

  _scrollThreadToEnd () {
    const thread = this.shadowRoot.getElementById('agent-thread')
    if (thread) thread.scrollTop = thread.scrollHeight
  }

  _observeThreadResize () {
    if (typeof ResizeObserver !== 'function') return
    const thread = this.shadowRoot.getElementById('agent-thread')
    if (!(thread instanceof HTMLElement)) return
    this._resizeObserver?.disconnect()
    this._resizeObserver = new ResizeObserver(() => {
      const hasScrollableContent = thread.scrollHeight > thread.clientHeight
      if (hasScrollableContent) this._scrollToEnd()
    })
    this._resizeObserver.observe(thread)
  }

  _clearScrollTimers () {
    for (const id of this._scrollTimers || []) clearTimeout(id)
    this._scrollTimers = []
  }

  _hasActiveTextSelection () {
    const selection = this.shadowRoot.getSelection?.() || window.getSelection?.()
    return Boolean(selection && !selection.isCollapsed && String(selection).trim())
  }

  _afterRender () {
    this._scrollToEnd()
    this._emitDetailChange()
  }

  _render () {
    const compact = this.getAttribute('layout') === 'compact' || this.hasAttribute('compact')
    // eslint-disable-next-line no-restricted-syntax -- 组件模板中所有动态文本、属性和 JSON 均已转义。
    this.shadowRoot.innerHTML = `
      <style>${this._style()}</style>
      <section class="agent-shell">
        <header class="bar">
          <div class="title">
            <ui5-icon name="ai"></ui5-icon>
            <span>CMX Agent</span>
          </div>
          <div id="agent-status" class="status">${this._renderStatusText()}</div>
          <div class="thread-switch">
            <button class="new-thread-main" type="button" data-action="new-thread" title="新线程">
              <ui5-icon name="restart"></ui5-icon><span>新线程</span>
            </button>
            <button class="new-thread-menu" type="button" data-action="toggle-thread-menu" title="历史线程">
              <ui5-icon name="slim-arrow-down"></ui5-icon>
            </button>
            ${this._renderThreadMenu()}
          </div>
        </header>
        <main class="body ${compact ? 'compact' : ''}">
          <section class="thread-wrap">
            <div id="agent-thread" class="thread">${this._renderEventList()}</div>
            ${this._error ? `<ui5-message-strip design="Negative" hide-close-button>${escHtml(this._error)}</ui5-message-strip>` : ''}
            <form class="composer">
              <textarea id="agent-input" rows="3" placeholder="输入目标或问题"></textarea>
              ${this._renderAttachmentChips()}
              <input id="agent-file-input" class="file-input" type="file" multiple accept="image/*,.txt,.md,.json,.csv,.xml,.html,.js,.ts,.css">
              <div class="composer-tools">
                <div class="tool-left">
                  <button class="tool-btn icon-only" type="button" data-action="attach" title="上传文件或图片"><ui5-icon name="add"></ui5-icon></button>
                  <div class="tool-pop-wrap">
                    <button class="tool-btn" type="button" data-action="toggle-model" title="模型"><ui5-icon name="ai"></ui5-icon><span>${escHtml(this._modelLabel())}</span></button>
                    ${this._renderModelMenu()}
                  </div>
                  <div class="tool-pop-wrap">
                    <button class="tool-btn" type="button" data-action="toggle-context" title="上下文"><ui5-icon name="chain-link"></ui5-icon><span>${escHtml(this._contextLabel())}</span></button>
                    ${this._renderContextMenu()}
                  </div>
                  <div class="tool-pop-wrap">
                    <button class="tool-btn" type="button" data-action="toggle-execution" title="执行方式"><ui5-icon name="process"></ui5-icon><span>${escHtml(this._executionLabel())}</span></button>
                    ${this._renderExecutionMenu()}
                  </div>
                  <div class="tool-pop-wrap">
                    <button class="tool-btn icon-only" type="button" data-action="toggle-settings" title="参数设置"><ui5-icon name="action-settings"></ui5-icon></button>
                    ${this._renderSettingsPanel()}
                  </div>
                  <button class="tool-btn icon-only" type="button" data-action="export-thread" title="导出本地 HTML 文件"><ui5-icon name="download"></ui5-icon></button>
                </div>
                <button class="send icon-only ${this._loading ? 'stop' : ''}" type="${this._loading ? 'button' : 'submit'}" ${this._loading ? 'data-action="stop-agent"' : ''} title="${this._loading ? '停止' : '发送'}">
                  <ui5-icon name="${this._loading ? 'stop' : 'paper-plane'}"></ui5-icon>
                </button>
              </div>
            </form>
          </section>
          ${compact ? '' : `
          <aside class="detail">
            <div class="detail-head">
              <ui5-icon name="detail-view"></ui5-icon>
              <span>详情</span>
            </div>
            <div id="agent-detail" class="detail-body">${this._renderSelectedDetail()}</div>
          </aside>`}
        </main>
        ${this._renderApprovalDialog()}
      </section>`
    this._afterRender()
    this._observeThreadResize()
  }

  _renderStatus () {
    const el = this.shadowRoot.getElementById('agent-status')
    if (el) el.textContent = this._renderStatusText()
  }

  _renderStatusText () {
    if (this._loading) return '运行中'
    if (this._capabilities?.mode) return `${this._capabilities.mode} · ${this._capabilities.tools?.length || 0} tools`
    return '连接中'
  }

  _modelLabel () {
    const id = this._activeThread?.model || 'configured'
    return DEFAULT_MODEL_OPTIONS.find((it) => it.id === id)?.label || id
  }

  _contextLabel () {
    // 帮助中心打开时，明示当前以「帮助：<主题>」为上下文，让用户知道是就地答疑。
    const help = /** @type {any} */ (document.querySelector('cmx-portal-app'))?._helpContext
    if (help && help.active !== false && help.title) return `帮助：${help.title}`
    const id = this._activeThread?.contextMode || 'workspace'
    return DEFAULT_CONTEXT_OPTIONS.find((it) => it.id === id)?.label || id
  }

  _executionLabel () {
    const id = String(this._activeThread?.params?.approvalMode || 'ask')
    return DEFAULT_EXECUTION_OPTIONS.find((it) => it.id === id)?.label || id
  }

  _renderThreadMenu () {
    if (!this._threadMenuOpen) return ''
    return `<div class="pop thread-menu">
      ${this._threads.map((t) => `<button type="button" class="thread-item ${t.threadId === this._activeThreadId ? 'on' : ''}" data-action="select-thread" data-thread-id="${escAttr(t.threadId)}">
        <span class="thread-title">${escHtml(t.title || '新线程')}</span>
        <span class="thread-time">${escHtml(this._shortTime(t.updatedAt))}</span>
        ${this._threads.length > 1 ? `<span class="thread-delete" data-action="delete-thread" data-thread-id="${escAttr(t.threadId)}" title="删除"><ui5-icon name="decline"></ui5-icon></span>` : ''}
      </button>`).join('')}
    </div>`
  }

  _renderModelMenu () {
    if (!this._modelMenuOpen) return ''
    return `<div class="pop small-menu">
      ${DEFAULT_MODEL_OPTIONS.map((it) => `<button type="button" class="${it.id === (this._activeThread.model || 'configured') ? 'on' : ''}" data-action="select-model" data-model="${escAttr(it.id)}">${escHtml(it.label)}</button>`).join('')}
    </div>`
  }

  _renderContextMenu () {
    if (!this._contextMenuOpen) return ''
    return `<div class="pop small-menu">
      ${DEFAULT_CONTEXT_OPTIONS.map((it) => `<button type="button" class="${it.id === (this._activeThread.contextMode || 'workspace') ? 'on' : ''}" data-action="select-context" data-context="${escAttr(it.id)}">${escHtml(it.label)}</button>`).join('')}
    </div>`
  }

  _renderExecutionMenu () {
    if (!this._executionMenuOpen) return ''
    const approval = String(this._activeThread.params?.approvalMode || 'ask')
    return `<div class="pop execution-menu">
      ${DEFAULT_EXECUTION_OPTIONS.map((it) => `<button type="button" class="${approval === it.id ? 'on' : ''}" data-action="set-approval" data-approval="${escAttr(it.id)}">
        <span>${escHtml(it.label)}</span>
        <small>${escHtml(it.desc)}</small>
      </button>`).join('')}
    </div>`
  }

  _renderSettingsPanel () {
    if (!this._settingsOpen) return ''
    const params = this._activeThread.params || {}
    const temp = Number.isFinite(Number(params.temperature)) ? Number(params.temperature) : 0.2
    const approval = String(params.approvalMode || 'ask')
    return `<div class="pop settings-panel">
      <label>Temperature <strong>${escHtml(temp.toFixed(1))}</strong></label>
      <input type="range" min="0" max="1" step="0.1" value="${escAttr(temp)}" data-param="temperature">
      <label>执行方式</label>
      <div class="seg">
        ${DEFAULT_EXECUTION_OPTIONS.map((it) => `<button type="button" class="${approval === it.id ? 'on' : ''}" data-action="set-approval" data-approval="${escAttr(it.id)}">${escHtml(it.label)}</button>`).join('')}
      </div>
    </div>`
  }

  _renderAttachmentChips () {
    if (!this._attachments.length) return ''
    return `<div class="attachments">
      ${this._attachments.map((a) => `<span class="chip">
        <ui5-icon name="${a.kind === 'image' ? 'picture' : 'document-text'}"></ui5-icon>
        <span>${escHtml(a.name)}</span>
        <button type="button" data-action="remove-attachment" data-attachment-id="${escAttr(a.id)}" title="移除"><ui5-icon name="decline"></ui5-icon></button>
      </span>`).join('')}
    </div>`
  }

  _pendingApproval () {
    for (let i = this._events.length - 1; i >= 0; i -= 1) {
      const ev = this._events[i]
      if (!ev || ev.type !== 'approval_required' || !ev.id) continue
      if (!this._approvalDecision(ev.id)) return ev
    }
    return null
  }

  _renderApprovalDialog () {
    const ev = this._pendingApproval()
    if (!ev) return ''
    const mode = this._approvalChoiceMode(ev)
    const options = this._approvalChoices(ev)
    const extraOptions = this._approvalExtraOptions(ev)
    const preview = ev.preview?.diff
      ? `<pre class="approval-preview diff">${this._renderDiff(ev.preview.diff)}</pre>`
      : `<div class="approval-args">${this._renderApprovalArgs(ev)}</div>`
    return `<div class="approval-overlay" role="presentation">
      <section class="approval-dialog" role="dialog" aria-modal="true" aria-label="选择执行方式">
        <header class="approval-dialog-head">
          <ui5-icon name="permission"></ui5-icon>
          <div>
            <h3>${escHtml(ev.title || ev.action || '需要确认执行')}</h3>
            <p>${escHtml(ev.risk || '请确认是否允许助手继续执行此操作。')}</p>
          </div>
        </header>
        <div class="approval-dialog-body">
          <fieldset class="approval-choice-group">
            <legend>${mode === 'multiple' ? '选择执行项' : '选择执行路径'}</legend>
            <div class="approval-choices ${escAttr(mode)}">
              ${options.map((it, index) => this._renderApprovalChoice(ev, it, index, mode)).join('')}
            </div>
          </fieldset>
          ${extraOptions.length ? `<fieldset class="approval-choice-group">
            <legend>执行选项</legend>
            <div class="approval-choices multiple">
              ${extraOptions.map((it, index) => this._renderApprovalChoice(ev, it, index, 'multiple', 'extra')).join('')}
            </div>
          </fieldset>` : ''}
          <div class="kv approval-kv">
            <label>Action</label><span>${escHtml(ev.action || '')}</span>
            <label>ID</label><span>${escHtml(ev.id || '')}</span>
          </div>
          ${preview}
        </div>
        <footer class="approval-dialog-actions">
          <button type="button" class="mini" data-action="reject" data-approval-id="${escAttr(ev.id || '')}">取消</button>
          <button type="button" class="mini primary" data-action="submit-approval-choice" data-approval-id="${escAttr(ev.id || '')}">提交选择</button>
        </footer>
      </section>
    </div>`
  }

  _approvalChoiceMode (ev) {
    const raw = String(ev.selectionMode || ev.choiceMode || ev.mode || '').toLowerCase()
    return raw === 'multiple' || raw === 'multi' || raw === 'checkbox' ? 'multiple' : 'single'
  }

  _approvalChoices (ev) {
    const raw = Array.isArray(ev.options) ? ev.options : (Array.isArray(ev.choices) ? ev.choices : null)
    const source = raw && raw.length ? raw : [
      { id: 'execute', label: '执行推荐操作', desc: '按上方预览继续执行当前工具调用。', decision: 'approve', checked: true },
      { id: 'explain-only', label: '不执行，仅说明方案', desc: '不运行工具，让助手只保留说明与建议。', decision: 'reject' },
      { id: 'cancel', label: '取消本次操作', desc: '结束当前待审批动作，不继续执行。', decision: 'reject' },
    ]
    return source.map((it, index) => this._normalizeApprovalChoice(it, index))
  }

  _approvalExtraOptions (ev) {
    const raw = Array.isArray(ev.extraOptions) ? ev.extraOptions : (Array.isArray(ev.flags) ? ev.flags : null)
    const source = raw && raw.length ? raw : [
      { id: 'show-result-detail', label: '完成后显示详细结果', desc: '执行后在时间线中保留更完整的结果上下文。', checked: true },
      { id: 'run-verification', label: '执行后建议验证', desc: '涉及修改时，继续提示运行 lint/build 等验证步骤。', checked: true },
    ]
    return source.map((it, index) => this._normalizeApprovalChoice(it, index))
  }

  _normalizeApprovalChoice (raw, index) {
    if (typeof raw === 'string') {
      return { id: raw || `choice-${index}`, label: raw || `选项 ${index + 1}`, desc: '', decision: 'approve', checked: index === 0 }
    }
    const it = raw && typeof raw === 'object' ? raw : {}
    const id = String(it.id || it.value || `choice-${index}`)
    return {
      id,
      label: String(it.label || it.title || id),
      desc: String(it.desc || it.description || it.hint || ''),
      decision: String(it.decision || it.intent || 'approve').toLowerCase() === 'reject' ? 'reject' : 'approve',
      checked: Boolean(it.checked || it.default || it.selected || index === 0),
    }
  }

  _renderApprovalChoice (ev, choice, index, mode, group = 'path') {
    const inputType = mode === 'multiple' ? 'checkbox' : 'radio'
    const inputName = group === 'extra' ? `approval-extra-${ev.id}` : `approval-choice-${ev.id}`
    const inputId = `approval-${group}-${choice.id}-${index}`.replace(/[^a-zA-Z0-9_-]/g, '-')
    return `<label class="approval-choice" for="${escAttr(inputId)}">
      <input id="${escAttr(inputId)}" type="${inputType}" name="${escAttr(inputName)}" value="${escAttr(choice.id)}" data-decision="${escAttr(choice.decision)}" ${choice.checked ? 'checked' : ''}>
      <span>
        <strong>${escHtml(choice.label)}</strong>
        ${choice.desc ? `<small>${escHtml(choice.desc)}</small>` : ''}
      </span>
    </label>`
  }

  _collectApprovalSelection (approvalId) {
    const root = this.shadowRoot
    const pathInputs = Array.from(root.querySelectorAll(`input[name="approval-choice-${CSS.escape(approvalId)}"]`))
      .filter((el) => el instanceof HTMLInputElement && el.checked)
    const extraInputs = Array.from(root.querySelectorAll(`input[name="approval-extra-${CSS.escape(approvalId)}"]`))
      .filter((el) => el instanceof HTMLInputElement && el.checked)
    const selected = pathInputs.map((el) => el.value)
    const extras = extraInputs.map((el) => el.value)
    const hasApprove = pathInputs.some((el) => el.dataset.decision === 'approve')
    return {
      mode: pathInputs.some((el) => el.type === 'checkbox') ? 'multiple' : 'single',
      selected,
      extras,
      decision: hasApprove ? 'approve' : 'reject',
    }
  }

  _exportThreadHtml () {
    this._syncActiveThread()
    const title = this._activeThread?.title || 'AI 助手对话'
    const doc = this._buildThreadExportHtml(title)
    this._downloadTextFile(`cmx-agent-thread-${this._timestampForFile()}.html`, doc, 'text/html;charset=utf-8')
  }

  /** @param {string} title */
  _buildThreadExportHtml (title) {
    const exportedAt = new Date().toLocaleString()
    const threadHtml = this._staticExportHtml(this._renderEventList())
    const detailHtml = this._staticExportHtml(this._renderSelectedDetail())
    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escHtml(title)} - CMX Agent Export</title>
  <style>
    :root {
      color-scheme: light dark;
      --sapBackgroundColor: Canvas;
      --sapTextColor: CanvasText;
      --sapShell_Background: color-mix(in srgb, CanvasText 5%, Canvas);
      --sapObjectHeader_Background: color-mix(in srgb, CanvasText 3%, Canvas);
      --sapTile_Background: Canvas;
      --sapList_BorderColor: color-mix(in srgb, CanvasText 16%, transparent);
      --sapPageHeader_BorderColor: color-mix(in srgb, CanvasText 14%, transparent);
      --sapGroup_TitleBorderColor: color-mix(in srgb, CanvasText 14%, transparent);
      --sapContent_LabelColor: color-mix(in srgb, CanvasText 68%, transparent);
      --sapHighlightColor: #0a6ed1;
      --sapInformativeColor: #0a6ed1;
      --sapPositiveColor: #188038;
      --sapCriticalColor: #b95000;
      --sapNegativeColor: #b3261e;
      --sapFontFamily: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
    }
    body { margin: 0; padding: 18px; background: var(--sapBackgroundColor); color: var(--sapTextColor); font: 14px/1.45 var(--sapFontFamily); }
    .export-page { max-width: 1120px; margin: 0 auto; display: grid; gap: 12px; }
    .export-head { border: 1px solid var(--sapList_BorderColor); border-radius: 8px; background: var(--sapObjectHeader_Background); padding: 12px; }
    .export-title { margin: 0 0 8px; font-size: 18px; line-height: 1.25; }
    .export-meta { display: flex; flex-wrap: wrap; gap: 6px; color: var(--sapContent_LabelColor); font-size: 12px; }
    .export-meta span { border: 1px solid var(--sapList_BorderColor); border-radius: 999px; padding: 2px 8px; background: var(--sapShell_Background); }
    .export-section { border: 1px solid var(--sapList_BorderColor); border-radius: 8px; background: var(--sapBackgroundColor); overflow: hidden; }
    .export-section h2 { margin: 0; padding: 9px 12px; border-bottom: 1px solid var(--sapPageHeader_BorderColor); font-size: 13px; background: var(--sapObjectHeader_Background); }
    .export-thread { padding: 12px; }
    .export-detail { padding: 12px; }
    .agent-shell { display: contents; }
    .bar,.composer,.pop,.approval-actions { display: none !important; }
    .thread { overflow: visible; padding: 0; }
    .body,.body.compact { display: block; background: transparent; }
    .thread-wrap,.detail { background: transparent; }
    ${this._style()}
    .export-icon { width: 13px; height: 13px; border-radius: 50%; display: inline-grid; place-items: center; font-size: 9px; line-height: 1; font-weight: 800; color: currentColor; }
    .export-icon::before { content: attr(data-mark); }
  </style>
</head>
<body>
  <main class="export-page">
    <header class="export-head">
      <h1 class="export-title">${escHtml(title)}</h1>
      <div class="export-meta">
        <span>导出时间：${escHtml(exportedAt)}</span>
        <span>模型：${escHtml(this._modelLabel())}</span>
        <span>上下文：${escHtml(this._contextLabel())}</span>
        <span>事件：${escHtml(String(this._events.length))}</span>
      </div>
    </header>
    <section class="export-section">
      <h2>时间线</h2>
      <div class="thread export-thread">${threadHtml}</div>
    </section>
    <section class="export-section">
      <h2>当前详情</h2>
      <div class="detail-body export-detail">${detailHtml}</div>
    </section>
  </main>
</body>
</html>`
  }

  /** @param {string} html */
  _staticExportHtml (html) {
    return String(html || '')
      .replace(/<ui5-icon\b([^>]*)name="([^"]+)"([^>]*)><\/ui5-icon>/g, (_m, _pre, name) => {
        const mark = this._exportIconMark(name)
        return `<span class="export-icon" data-icon="${escAttr(name)}" data-mark="${escAttr(mark)}"></span>`
      })
      .replace(/\sdata-action="[^"]*"/g, '')
      .replace(/\sdata-event-id="[^"]*"/g, '')
      .replace(/\sdata-approval-id="[^"]*"/g, '')
  }

  /** @param {string} name */
  _exportIconMark (name) {
    const map = {
      ai: 'A',
      'person-placeholder': 'U',
      list: 'L',
      'command-line-interfaces': '>',
      synchronize: '*',
      'sys-enter-2': '✓',
      error: '!',
      process: 'P',
      permission: '?',
      accept: '✓',
      decline: '×',
      picture: 'I',
      'document-text': 'D',
    }
    return map[name] || '•'
  }

  /**
   * @param {string} filename
   * @param {string} text
   * @param {string} type
   */
  _downloadTextFile (filename, text, type) {
    const blob = new Blob([text], { type })
    const a = document.createElement('a')
    const url = URL.createObjectURL(blob)
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  _timestampForFile () {
    const d = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  }

  _shortTime (value) {
    if (!value) return ''
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return ''
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  _renderEvents () {
    const el = this.shadowRoot.getElementById('agent-thread')
    if (el) {
      // eslint-disable-next-line no-restricted-syntax -- 所有动态文本已转义。
      el.innerHTML = this._renderEventList()
    }
  }

  _renderDetail () {
    const el = this.shadowRoot.getElementById('agent-detail')
    if (el) {
      // eslint-disable-next-line no-restricted-syntax -- JSON 与文本已转义。
      el.innerHTML = this._renderSelectedDetail()
    }
  }

  getDetailHtml () {
    return this._renderSelectedDetail()
  }

  _emitDetailChange () {
    this.dispatchEvent(new CustomEvent('portal-agent-detail-change', {
      bubbles: true,
      composed: true,
      detail: { html: this._renderSelectedDetail() },
    }))
  }

  _eventId (ev, index) {
    if (!ev._id) ev._id = newId(`evt${index}`)
    return ev._id
  }

  _toolCallHasResult (ev, index) {
    if (ev.type !== 'tool_call') return false
    const id = ev.id != null ? String(ev.id) : ''
    for (let i = index + 1; i < this._events.length; i += 1) {
      const next = this._events[i]
      if (!next || next.type !== 'tool_result') continue
      if (id && String(next.id || '') === id) return true
      if (!id) return true
    }
    return false
  }

  _timelineMeta (ev, index = -1) {
    if (ev.type === 'plan') return { icon: 'list', label: 'Plan', state: 'plan' }
    if (ev.type === 'tool_call') {
      const done = this._toolCallHasResult(ev, index)
      return { icon: done ? 'command-line-interfaces' : 'synchronize', label: ev.name || 'Tool', state: done ? 'done' : 'running' }
    }
    if (ev.type === 'tool_result') {
      const status = ev.status === 'error' ? 'error' : (ev.status === 'warning' ? 'warning' : 'done')
      return { icon: status === 'error' ? 'error' : 'sys-enter-2', label: 'Result', state: status }
    }
    if (ev.type === 'workflow') {
      const state = ev.status === 'running' ? 'running' : (ev.status === 'done' ? 'done' : 'workflow')
      return { icon: state === 'done' ? 'sys-enter-2' : 'process', label: 'Workflow', state }
    }
    if (ev.type === 'approval_required') return { icon: 'permission', label: 'Approval', state: this._approvalDecision(ev.id) ? 'done' : 'waiting' }
    if (ev.type === 'approval_decision') return { icon: ev.decision === 'approve' ? 'accept' : 'decline', label: 'Decision', state: ev.decision === 'approve' ? 'done' : 'error' }
    if (ev.type === 'user') return { icon: 'person-placeholder', label: 'You', state: 'user' }
    return { icon: ev._streaming ? 'synchronize' : 'ai', label: 'Agent', state: ev._streaming ? 'running' : 'assistant' }
  }

  _renderTimelineItem (ev, index, bodyHtml) {
    const id = this._eventId(ev, index)
    const selected = id === this._selectedEventId
    const meta = this._timelineMeta(ev, index)
    const running = meta.state === 'running' || (this._loading && index === this._events.length - 1 && ev.type === 'user')
    return `<article class="timeline-item ${escAttr(meta.state)} ${running ? 'running' : ''} ${selected ? 'selected' : ''}" data-action="select-event" data-event-id="${escAttr(id)}">
      <div class="timeline-node"><ui5-icon name="${escAttr(running ? 'synchronize' : meta.icon)}"></ui5-icon></div>
      <div class="event ${escAttr(ev.type || 'event')} ${escAttr(meta.state)}">
        <div class="event-kicker"><span>${escHtml(meta.label)}</span>${running ? '<em>运行中</em>' : ''}</div>
        ${bodyHtml}
      </div>
    </article>`
  }

  _eventRoundGroups () {
    /** @type {{ startIndex: number, items: { ev: Record<string, any>, index: number }[] }[]} */
    const groups = []
    let current = null
    this._events.forEach((ev, index) => {
      if (!current || (ev.type === 'user' && current.items.length > 0)) {
        current = { startIndex: index, items: [] }
        groups.push(current)
      }
      current.items.push({ ev, index })
    })
    return groups
  }

  _renderEventTimelineItem (ev, index) {
    if (ev.type === 'plan') {
      return this._renderTimelineItem(ev, index, `<ol>${(ev.items || []).map((it) => `<li>${escHtml(it)}</li>`).join('')}</ol>`)
    }
    if (ev.type === 'tool_call') {
      return this._renderTimelineItem(ev, index, `<code>${escHtml(safeJson(ev.args || {}))}</code>`)
    }
    if (ev.type === 'tool_result') {
      return this._renderTimelineItem(ev, index, `<p>${escHtml(ev.summary || '')}</p>${this._renderDiagnosticsInline(ev.data?.diagnostics)}`)
    }
    if (ev.type === 'workflow') {
      return this._renderTimelineItem(ev, index, `<p><strong>${escHtml(ev.title || '')}</strong></p><div class="steps">${(ev.steps || []).map((s) => `<cmx-status-tag variant="outline" tone="${({ done: 'success', waiting: 'warning', error: 'danger' })[s.status] || 'neutral'}">${escHtml(s.label || '')}</cmx-status-tag>`).join('')}</div>`)
    }
    if (ev.type === 'approval_required') {
      const decided = this._approvalDecision(ev.id)
      return this._renderTimelineItem(ev, index, `
        <p><strong>${escHtml(ev.title || ev.action || '需要审批')}</strong></p>
        <p class="muted">${escHtml(ev.risk || '')}</p>
        ${this._renderApprovalArgs(ev)}
        ${ev.preview?.diff ? `<pre class="diff">${this._renderDiff(ev.preview.diff)}</pre>` : ''}
        <div class="approval-actions">
          ${decided ? `<span class="decision ${decided}">${decided === 'approve' ? '已同意' : '已拒绝'}</span>` : `
            <button type="button" class="mini primary" data-action="approve" data-approval-id="${escAttr(ev.id || '')}">同意</button>
            <button type="button" class="mini" data-action="reject" data-approval-id="${escAttr(ev.id || '')}">拒绝</button>
          `}
        </div>
      `)
    }
    if (ev.type === 'approval_decision') {
      return this._renderTimelineItem(ev, index, `<p>${ev.decision === 'approve' ? '已同意执行' : '已拒绝执行'}</p>`)
    }
    const who = ev.type === 'user' ? 'user' : 'assistant'
    return this._renderTimelineItem({ ...ev, type: who }, index, `<p>${escHtml(ev.text || '').replace(/\n/g, '<br>')}</p>${this._renderEventAttachments(ev.attachments)}`)
  }

  _renderEventList () {
    const groups = this._eventRoundGroups()
    const lastEvent = this._events[this._events.length - 1]
    const hasVisibleRunning = lastEvent?._streaming || (lastEvent?.type === 'workflow' && lastEvent.status === 'running')
    if (this._loading && !hasVisibleRunning) {
      if (!groups.length) groups.push({ startIndex: 0, items: [] })
      groups[groups.length - 1].items.push({ ev: { type: 'synthetic_running' }, index: -1 })
    }
    return groups.map((group, groupIndex) => {
      const items = group.items.map(({ ev, index }) => {
        if (ev.type !== 'synthetic_running') return this._renderEventTimelineItem(ev, index)
        return `<article class="timeline-item running synthetic">
        <div class="timeline-node"><ui5-icon name="synchronize"></ui5-icon></div>
        <div class="event running">
          <div class="event-kicker"><span>Agent</span><em>运行中</em></div>
          <p class="muted">正在分析上下文、规划步骤并调用可用工具...</p>
          <div class="pulse-row"><span></span><span></span><span></span></div>
        </div>
      </article>`
      })
      return `<div class="timeline-round" data-round="${groupIndex + 1}"><div class="timeline">${items.join('')}</div></div>`
    }).join('')
  }

  _renderEventAttachments (attachments) {
    if (!Array.isArray(attachments) || !attachments.length) return ''
    return `<div class="event-attachments">${attachments.map((a) => `<span><ui5-icon name="${String(a.type || '').startsWith('image/') ? 'picture' : 'document-text'}"></ui5-icon>${escHtml(a.name || '')}</span>`).join('')}</div>`
  }

  _approvalDecision (approvalId) {
    const hit = this._events.find((ev) => ev.type === 'approval_decision' && ev.id === approvalId)
    return hit?.decision || ''
  }

  _selectedEvent () {
    if (!this._selectedEventId) {
      for (let i = this._events.length - 1; i >= 0; i -= 1) {
        if (this._events[i].type === 'tool_result') return this._events[i]
      }
      return this._events[this._events.length - 1]
    }
    return this._events.find((ev, i) => this._eventId(ev, i) === this._selectedEventId) || null
  }

  _renderSelectedDetail () {
    const ev = this._selectedEvent()
    if (!ev) return '<cmx-empty-state icon="message-information" title="暂无事件" description="选择左侧列表中的事件查看详情" size="sm"></cmx-empty-state>'
    if (ev.type === 'tool_result') {
      return `<cmx-desc-list border columns="2">
        <cmx-desc-item label="Status">${escHtml(ev.status || '')}</cmx-desc-item>
        <cmx-desc-item label="Summary">${escHtml(ev.summary || '')}</cmx-desc-item>
      </cmx-desc-list>
      ${this._renderDiagnosticsDetail(ev.data?.diagnostics)}
      <pre>${escHtml(safeJson(ev.data))}</pre>`
    }
    if (ev.type === 'tool_call') {
      return `<cmx-desc-list border columns="2">
        <cmx-desc-item label="Tool">${escHtml(ev.name || '')}</cmx-desc-item>
        <cmx-desc-item label="ID">${escHtml(ev.id || '')}</cmx-desc-item>
      </cmx-desc-list>
      <pre>${escHtml(safeJson(ev.args || {}))}</pre>`
    }
    if (ev.type === 'approval_required') {
      const preview = ev.preview?.diff
        ? `<pre class="diff">${this._renderDiff(ev.preview.diff)}</pre>`
        : `<pre>${escHtml(safeJson(ev.args || {}))}</pre>`
      return `<cmx-desc-list border>
        <cmx-desc-item label="Action">${escHtml(ev.action || '')}</cmx-desc-item>
        <cmx-desc-item label="Risk">${escHtml(ev.risk || '')}</cmx-desc-item>
        <cmx-desc-item label="Status">${escHtml(this._approvalDecision(ev.id) || 'pending')}</cmx-desc-item>
      </cmx-desc-list>
      ${preview}`
    }
    if (ev.type === 'plan') {
      return `<ol class="detail-plan">${(ev.items || []).map((it) => `<li>${escHtml(it)}</li>`).join('')}</ol>`
    }
    if (ev.type === 'workflow') {
      return `<div class="workflow-detail">
        <h3>${escHtml(ev.title || 'Workflow')}</h3>
        <div class="steps">${(ev.steps || []).map((s) => `<cmx-status-tag variant="outline" tone="${({ done: 'success', waiting: 'warning', error: 'danger' })[s.status] || 'neutral'}">${escHtml(s.label || '')}</cmx-status-tag>`).join('')}</div>
      </div>`
    }
    return `<pre>${escHtml(ev.text || safeJson(ev))}</pre>`
  }

  _renderDiagnosticsInline (diagnostics) {
    if (!Array.isArray(diagnostics) || !diagnostics.length) return ''
    const errors = diagnostics.filter((d) => d.severity === 'error').length
    const warnings = diagnostics.filter((d) => d.severity === 'warning').length
    return `<div class="diag-summary">${errors} errors · ${warnings} warnings</div>`
  }

  _renderDiagnosticsDetail (diagnostics) {
    if (!Array.isArray(diagnostics) || !diagnostics.length) return ''
    return `<div class="diagnostics">
      ${diagnostics.slice(0, 30).map((d) => `<div class="diag ${escAttr(d.severity || '')}">
        <strong>${escHtml(d.severity || '')}</strong>
        <span>${escHtml(this._shortPath(d.file || ''))}:${escHtml(String(d.line || ''))}:${escHtml(String(d.column || ''))}</span>
        <p>${escHtml(d.message || '')}</p>
        <code>${escHtml(d.rule || '')}</code>
      </div>`).join('')}
    </div>`
  }

  _shortPath (file) {
    const marker = '/cmx-portal-manager/'
    const idx = String(file || '').indexOf(marker)
    return idx >= 0 ? String(file).slice(idx + marker.length) : String(file || '')
  }

  _renderDiff (diff) {
    return String(diff || '').split('\n').map((line) => {
      const cls = line.startsWith('+') ? 'add' : (line.startsWith('-') ? 'del' : (line.startsWith('@@') ? 'hunk' : 'ctx'))
      return `<span class="${cls}">${escHtml(line)}</span>`
    }).join('\n')
  }

  _renderApprovalArgs (ev) {
    const args = ev.args || {}
    if (ev.action === 'apply_text_replace') {
      return `<div class="patch-args">
        <div><label>File</label><code>${escHtml(args.path || '')}</code></div>
        <div><label>From</label><pre>${escHtml(args.oldText || '')}</pre></div>
        <div><label>To</label><pre>${escHtml(args.newText || '')}</pre></div>
        <div><label>Mode</label><code>${escHtml(args.occurrence || 'first')}</code></div>
      </div>`
    }
    return `<code>${escHtml(safeJson(args))}</code>`
  }

  _style () {
    return `
      :host{display:flex;min-height:0;height:100%;background:var(--sapBackgroundColor,#fff);color:var(--sapTextColor,#1d2d3e);font:14px/1.45 var(--sapFontFamily,Arial,sans-serif)}
      .agent-shell{position:relative;display:flex;flex-direction:column;min-height:0;width:100%;height:100%;background:linear-gradient(180deg,var(--sapBackgroundColor,#fff),var(--sapShell_Background,#f7f9fb))}
      .bar{height:38px;display:flex;align-items:center;gap:8px;padding:0 8px;border-bottom:1px solid var(--sapPageHeader_BorderColor,#d9dfe5);background:var(--sapObjectHeader_Background,#fff);box-sizing:border-box}
      .title{display:inline-flex;align-items:center;gap:8px;font-weight:700;color:var(--sapTextColor,#1d2d3e);min-width:0}
      .title ui5-icon{color:var(--sapHighlightColor,#0a6ed1)}
      .status{font-size:12px;color:var(--sapContent_LabelColor,#6a6d70);margin-left:auto;white-space:nowrap}
      .icon-btn{width:32px;height:32px;border:1px solid var(--sapButton_BorderColor,#bcc3ca);border-radius:6px;background:var(--sapButton_Background,#fff);color:var(--sapButton_TextColor,#0a6ed1);display:inline-grid;place-items:center;cursor:pointer}
      .icon-btn:hover{background:var(--sapButton_Hover_Background,#f5faff)}
      .thread-switch{position:relative;display:inline-flex;align-items:center;flex-shrink:0}
      .new-thread-main,.new-thread-menu{height:26px;border:1px solid var(--sapButton_BorderColor,#bcc3ca);background:var(--sapButton_Background,#fff);color:var(--sapButton_TextColor,#0a6ed1);display:inline-flex;align-items:center;justify-content:center;gap:4px;font:11px var(--sapFontFamily,Arial,sans-serif);font-weight:700;cursor:pointer}
      .new-thread-main{border-radius:6px 0 0 6px;padding:0 7px}
      .new-thread-menu{width:24px;border-left:0;border-radius:0 6px 6px 0;padding:0}
      .new-thread-main:hover,.new-thread-menu:hover,.tool-btn:hover{background:var(--sapButton_Hover_Background,#f5faff)}
      .pop{position:absolute;z-index:20;right:0;bottom:auto;top:36px;border:1px solid var(--sapGroup_TitleBorderColor,#d9dfe5);border-radius:8px;background:var(--sapGroup_ContentBackground,#fff);box-shadow:var(--sapContent_Shadow1,0 10px 28px rgba(0,0,0,.18));padding:6px;box-sizing:border-box;color:var(--sapTextColor,#1d2d3e)}
      .thread-menu{width:260px;max-height:280px;overflow:auto}
      .thread-item{width:100%;display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:8px;border:0;border-radius:6px;background:transparent;color:inherit;text-align:left;padding:8px;cursor:pointer}
      .thread-item:hover,.thread-item.on,.small-menu button:hover,.small-menu button.on{background:color-mix(in srgb,var(--sapHighlightColor,#0a6ed1) 10%,transparent)}
      .thread-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700}
      .thread-time{font-size:11px;color:var(--sapContent_LabelColor,#6a6d70)}
      .thread-delete{width:22px;height:22px;display:inline-grid;place-items:center;border-radius:5px;color:var(--sapContent_LabelColor,#6a6d70)}
      .thread-delete:hover{background:color-mix(in srgb,var(--sapNegativeColor,#bb0000) 10%,transparent);color:var(--sapNegativeTextColor,#bb0000)}
      .body{display:grid;grid-template-columns:minmax(360px,1fr) minmax(300px,38%);gap:1px;flex:1 1 auto;min-height:0;background:var(--sapGroup_TitleBorderColor,#d9dfe5)}
      .body.compact{grid-template-columns:minmax(0,1fr);background:transparent}
      .body.compact .thread{padding:6px}
      .body.compact .composer{padding:6px;gap:5px}
      .body.compact textarea{min-height:42px;padding:6px 8px}
      .body.compact .event{padding:7px 8px;border-radius:7px}
      .body.compact .event::before{left:-8px;top:8px;width:8px;height:12px}
      .body.compact .timeline-item{grid-template-columns:22px minmax(0,1fr)}
      .body.compact .timeline-node{width:18px;height:18px}
      .body.compact .timeline-item::before{left:8px}
      .thread-wrap,.detail{min-height:0;min-width:0;background:var(--sapBackgroundColor,#fff)}
      .thread-wrap{display:flex;flex-direction:column}
      .thread{flex:1 1 auto;min-height:0;overflow:auto;padding:10px;user-select:text;-webkit-user-select:text}
      .timeline-round{margin:0 0 10px}
      .timeline-round:last-child{margin-bottom:0}
      .timeline{display:flex;flex-direction:column;gap:6px}
      .timeline-item{position:relative;display:grid;grid-template-columns:26px minmax(0,1fr);gap:6px;align-items:start}
      .timeline-item::before{content:'';position:absolute;left:12px;top:22px;bottom:-8px;width:1px;background:linear-gradient(180deg,color-mix(in srgb,var(--sapHighlightColor,#0a6ed1) 28%,transparent),color-mix(in srgb,var(--sapGroup_TitleBorderColor,#d9dfe5) 90%,transparent));pointer-events:none}
      .timeline-item:last-child::before{display:none}
      .timeline-node{position:relative;z-index:1;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;background:var(--sapShell_Background,#f7f9fb);border:1px solid color-mix(in srgb,var(--sapHighlightColor,#0a6ed1) 28%,var(--sapList_BorderColor,#e5eaf0));color:var(--sapHighlightColor,#0a6ed1);box-shadow:0 0 0 3px var(--sapBackgroundColor,#fff);user-select:none;-webkit-user-select:none}
      .timeline-node ui5-icon{width:13px;height:13px;color:currentColor}
      .timeline-item.running .timeline-node ui5-icon{animation:agent-spin 1s linear infinite}
      .timeline-item.done .timeline-node{color:var(--sapPositiveColor,#107e3e);border-color:color-mix(in srgb,var(--sapPositiveColor,#107e3e) 45%,var(--sapList_BorderColor,#e5eaf0))}
      .timeline-item.warning .timeline-node,.timeline-item.waiting .timeline-node{color:var(--sapCriticalColor,#df6e0c);border-color:color-mix(in srgb,var(--sapCriticalColor,#df6e0c) 45%,var(--sapList_BorderColor,#e5eaf0))}
      .timeline-item.error .timeline-node{color:var(--sapNegativeColor,#bb0000);border-color:color-mix(in srgb,var(--sapNegativeColor,#bb0000) 45%,var(--sapList_BorderColor,#e5eaf0))}
      .timeline-item.user .timeline-node{color:var(--sapContent_LabelColor,#6a6d70)}
      .event{--event-border-color:var(--sapList_BorderColor,#e5eaf0);--event-tail-fill:var(--event-border-color);position:relative;border:1px solid var(--event-border-color);border-radius:8px;padding:8px 10px;background:var(--sapTile_Background,#fff);box-sizing:border-box;cursor:pointer}
      .event::before{content:'';position:absolute;left:-9px;top:9px;width:9px;height:14px;background:var(--event-tail-fill);clip-path:polygon(100% 0,0 50%,100% 100%);pointer-events:none;transform:translateZ(0)}
      .timeline-item.selected .event{outline:2px solid color-mix(in srgb,var(--sapHighlightColor,#0a6ed1) 34%,transparent)}
      .event-kicker{display:flex;align-items:center;gap:5px;font-size:11px;font-weight:700;color:var(--sapContent_LabelColor,#6a6d70);margin-bottom:4px;user-select:none;-webkit-user-select:none}
      .event-kicker em{margin-left:auto;font-style:normal;color:var(--sapHighlightColor,#0a6ed1);font-size:10px}
      .event p{margin:0;white-space:normal;overflow-wrap:anywhere}
      .event p,.event code,.event pre,.patch-args,.patch-args *,.detail-body,.detail-body *{user-select:text;-webkit-user-select:text}
      .event.user{--event-border-color:color-mix(in srgb,var(--sapContent_LabelColor,#6a6d70) 18%,var(--sapList_BorderColor,#e5eaf0));--event-tail-fill:var(--event-border-color);background:color-mix(in srgb,var(--sapContent_LabelColor,#6a6d70) 5%,var(--sapTile_Background,#fff))}
      .event.assistant{--event-border-color:color-mix(in srgb,var(--sapHighlightColor,#0a6ed1) 18%,var(--sapList_BorderColor,#e5eaf0));--event-tail-fill:var(--event-border-color);background:color-mix(in srgb,var(--sapHighlightColor,#0a6ed1) 5%,var(--sapTile_Background,#fff))}
      .event.plan{--event-tail-fill:var(--event-border-color);background:color-mix(in srgb,var(--sapInformativeColor,#0a6ed1) 7%,var(--sapTile_Background,#fff))}
      .event.tool_call,.event.running{--event-tail-fill:var(--event-border-color);background:var(--sapShell_Background,#f7f9fb)}
      .event.done{--event-tail-fill:var(--sapPositiveColor,#107e3e);border-left:3px solid var(--sapPositiveColor,#107e3e)}
      .event.warning{--event-tail-fill:var(--sapCriticalColor,#df6e0c);border-left:3px solid var(--sapCriticalColor,#df6e0c)}
      .event.error{--event-tail-fill:var(--sapNegativeColor,#bb0000);border-left:3px solid var(--sapNegativeColor,#bb0000)}
      .event.workflow{--event-tail-fill:var(--sapInformativeColor,#0a6ed1);border-left:3px solid var(--sapInformativeColor,#0a6ed1);background:color-mix(in srgb,var(--sapInformativeColor,#0a6ed1) 6%,var(--sapTile_Background,#fff))}
      .event.approval{--event-tail-fill:var(--sapCriticalColor,#df6e0c);border-left:3px solid var(--sapCriticalColor,#df6e0c);background:color-mix(in srgb,var(--sapCriticalColor,#df6e0c) 7%,var(--sapTile_Background,#fff))}
      .event.approval.decided{opacity:.82}
      .event.decision-card.approve{--event-tail-fill:var(--sapPositiveColor,#107e3e);border-left:3px solid var(--sapPositiveColor,#107e3e)}
      .event.decision-card.reject{--event-tail-fill:var(--sapNegativeColor,#bb0000);border-left:3px solid var(--sapNegativeColor,#bb0000)}
      .event ol{margin:0;padding-left:22px}
      .event code{display:block;white-space:pre-wrap;overflow-wrap:anywhere;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:var(--sapTextColor,#1d2d3e)}
      .event pre.diff{max-height:180px;overflow:auto;margin:8px 0 0;border:1px solid var(--sapList_BorderColor,#e5eaf0);border-radius:6px;background:var(--sapShell_Background,#f7f9fb);padding:8px;font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre;box-sizing:border-box}
      .event-attachments{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}
      .event-attachments span{display:inline-flex;align-items:center;gap:4px;height:20px;border:1px solid var(--sapList_BorderColor,#e5eaf0);border-radius:999px;background:var(--sapShell_Background,#f7f9fb);padding:0 7px;font-size:11px;color:var(--sapContent_LabelColor,#6a6d70)}
      .event-attachments ui5-icon{width:12px;height:12px}
      .pulse-row{display:inline-flex;gap:4px;margin-top:6px}
      .pulse-row span{width:5px;height:5px;border-radius:50%;background:var(--sapHighlightColor,#0a6ed1);animation:agent-pulse 1.1s ease-in-out infinite}
      .pulse-row span:nth-child(2){animation-delay:.15s}.pulse-row span:nth-child(3){animation-delay:.3s}
      .patch-args{display:grid;gap:6px;margin-top:6px}
      .patch-args label{display:block;margin-bottom:2px;font-size:11px;font-weight:700;color:var(--sapContent_LabelColor,#6a6d70)}
      .patch-args pre{max-height:90px;overflow:auto;margin:0;border:1px solid var(--sapList_BorderColor,#e5eaf0);border-radius:6px;background:var(--sapShell_Background,#f7f9fb);padding:7px;font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--sapTextColor,#1d2d3e)}
      .steps{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
      .step{display:inline-flex;align-items:center;height:24px;padding:0 8px;border:1px solid var(--sapList_BorderColor,#e5eaf0);border-radius:999px;background:var(--sapShell_Background,#f7f9fb);font-size:12px;color:var(--sapContent_LabelColor,#6a6d70)}
      .step.done{border-color:color-mix(in srgb,var(--sapPositiveColor,#107e3e) 40%,var(--sapList_BorderColor,#e5eaf0));color:var(--sapPositiveTextColor,var(--sapPositiveColor,#107e3e))}
      .step.waiting{border-color:color-mix(in srgb,var(--sapCriticalColor,#df6e0c) 45%,var(--sapList_BorderColor,#e5eaf0));color:var(--sapCriticalTextColor,var(--sapCriticalColor,#df6e0c))}
      .diag-summary{margin-top:6px;font-size:12px;color:var(--sapContent_LabelColor,#6a6d70)}
      .muted{color:var(--sapContent_LabelColor,#6a6d70);font-size:12px}
      .approval-actions{display:flex;align-items:center;gap:8px;margin-top:10px}
      .mini{height:28px;padding:0 10px;border:1px solid var(--sapButton_BorderColor,#bcc3ca);border-radius:6px;background:var(--sapButton_Background,#fff);color:var(--sapButton_TextColor,#0a6ed1);font:12px var(--sapFontFamily,Arial,sans-serif);font-weight:700;cursor:pointer}
      .mini.primary{background:var(--sapButton_Emphasized_Background,#0a6ed1);border-color:var(--sapButton_Emphasized_BorderColor,#0a6ed1);color:var(--sapButton_Emphasized_TextColor,#fff)}
      .decision{font-size:12px;font-weight:700}
      .decision.approve{color:var(--sapPositiveTextColor,var(--sapPositiveColor,#107e3e))}
      .decision.reject{color:var(--sapNegativeTextColor,var(--sapNegativeColor,#bb0000))}
      .approval-overlay{position:absolute;inset:0;z-index:30;display:flex;align-items:center;justify-content:center;padding:12px;background:color-mix(in srgb,var(--sapBackgroundColor,#fff) 62%,transparent);backdrop-filter:blur(2px);box-sizing:border-box}
      .approval-dialog{width:min(560px,100%);max-height:min(520px,calc(100% - 24px));display:flex;flex-direction:column;overflow:hidden;border:1px solid color-mix(in srgb,var(--sapCriticalColor,#df6e0c) 36%,var(--sapList_BorderColor,#e5eaf0));border-radius:8px;background:var(--sapGroup_ContentBackground,#fff);box-shadow:var(--sapContent_Shadow2,0 18px 46px rgba(0,0,0,.24));color:var(--sapTextColor,#1d2d3e)}
      .approval-dialog-head{display:grid;grid-template-columns:32px minmax(0,1fr);gap:10px;padding:12px;border-bottom:1px solid var(--sapList_BorderColor,#e5eaf0);background:color-mix(in srgb,var(--sapCriticalColor,#df6e0c) 8%,var(--sapObjectHeader_Background,#fff))}
      .approval-dialog-head ui5-icon{width:22px;height:22px;color:var(--sapCriticalColor,#df6e0c);margin-top:1px}
      .approval-dialog-head h3{margin:0;font-size:14px;line-height:1.25;color:var(--sapTextColor,#1d2d3e)}
      .approval-dialog-head p{margin:4px 0 0;font-size:12px;line-height:1.45;color:var(--sapContent_LabelColor,#6a6d70);overflow-wrap:anywhere}
      .approval-dialog-body{min-height:0;overflow:auto;padding:12px;display:grid;gap:10px}
      .approval-choice-group{margin:0;border:1px solid var(--sapList_BorderColor,#e5eaf0);border-radius:8px;padding:9px;background:var(--sapTile_Background,#fff)}
      .approval-choice-group legend{padding:0 4px;font-size:12px;font-weight:800;color:var(--sapContent_LabelColor,#6a6d70)}
      .approval-choices{display:grid;gap:6px}
      .approval-choice{display:grid;grid-template-columns:18px minmax(0,1fr);gap:8px;align-items:start;border:1px solid var(--sapList_BorderColor,#e5eaf0);border-radius:7px;padding:8px;background:var(--sapShell_Background,#f7f9fb);cursor:pointer;box-sizing:border-box}
      .approval-choice:hover{border-color:color-mix(in srgb,var(--sapHighlightColor,#0a6ed1) 38%,var(--sapList_BorderColor,#e5eaf0));background:color-mix(in srgb,var(--sapHighlightColor,#0a6ed1) 6%,var(--sapShell_Background,#f7f9fb))}
      .approval-choice input{margin:2px 0 0;width:16px;height:16px;accent-color:var(--sapHighlightColor,#0a6ed1)}
      .approval-choice span{min-width:0;display:grid;gap:2px}
      .approval-choice strong{font-size:12px;line-height:1.35;color:var(--sapTextColor,#1d2d3e)}
      .approval-choice small{font-size:11px;line-height:1.35;color:var(--sapContent_LabelColor,#6a6d70)}
      .approval-kv{margin:0}
      .approval-args>code{border:1px solid var(--sapList_BorderColor,#e5eaf0);border-radius:6px;background:var(--sapShell_Background,#f7f9fb);padding:8px}
      .approval-preview{max-height:240px;overflow:auto;margin:0;border:1px solid var(--sapList_BorderColor,#e5eaf0);border-radius:6px;background:var(--sapShell_Background,#f7f9fb);padding:8px;font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre;box-sizing:border-box}
      .approval-dialog-actions{display:flex;justify-content:flex-end;gap:8px;padding:10px 12px;border-top:1px solid var(--sapList_BorderColor,#e5eaf0);background:var(--sapObjectHeader_Background,#fff)}
      .composer{display:flex;flex-direction:column;gap:6px;padding:8px;border-top:1px solid var(--sapPageHeader_BorderColor,#d9dfe5);background:var(--sapObjectHeader_Background,#fff);position:relative}
      textarea{resize:none;min-height:46px;max-height:132px;border:1px solid var(--sapField_BorderColor,#89919a);border-radius:7px;padding:7px 8px;background:var(--sapField_Background,#fff);color:var(--sapField_TextColor,#1d2d3e);font:inherit;box-sizing:border-box}
      textarea:focus{outline:2px solid color-mix(in srgb,var(--sapHighlightColor,#0a6ed1) 30%,transparent);border-color:var(--sapField_Focus_BorderColor,var(--sapHighlightColor,#0a6ed1))}
      .composer-tools{display:flex;align-items:center;justify-content:space-between;gap:6px}
      .tool-left{display:flex;align-items:center;gap:4px;min-width:0;flex-wrap:wrap}
      .tool-pop-wrap{position:relative;display:inline-flex}
      .tool-btn{height:24px;border:1px solid var(--sapButton_BorderColor,#bcc3ca);border-radius:6px;background:var(--sapButton_Background,#fff);color:var(--sapButton_TextColor,#0a6ed1);display:inline-flex;align-items:center;gap:4px;padding:0 6px;font:11px var(--sapFontFamily,Arial,sans-serif);font-weight:700;cursor:pointer;max-width:132px}
      .tool-btn span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .icon-only{width:28px;padding:0;justify-content:center;flex-shrink:0}
      .send{border:1px solid var(--sapButton_Emphasized_BorderColor,#0a6ed1);border-radius:7px;background:var(--sapButton_Emphasized_Background,#0a6ed1);color:var(--sapButton_Emphasized_TextColor,#fff);display:inline-flex;align-items:center;justify-content:center;gap:6px;font-weight:700;cursor:pointer;height:28px}
      .send ui5-icon{color:currentColor}
      .file-input{display:none}
      .attachments{display:flex;flex-wrap:wrap;gap:4px}
      .chip{display:inline-flex;align-items:center;gap:4px;max-width:100%;height:22px;border:1px solid var(--sapList_BorderColor,#e5eaf0);border-radius:999px;background:var(--sapShell_Background,#f7f9fb);padding:0 3px 0 7px;font-size:11px}
      .chip span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .chip button{border:0;background:transparent;color:var(--sapContent_LabelColor,#6a6d70);width:18px;height:18px;display:inline-grid;place-items:center;cursor:pointer}
      .small-menu{top:auto;bottom:34px;right:auto;left:0;min-width:190px;display:grid;gap:2px}
      .small-menu button{height:30px;border:0;border-radius:6px;background:transparent;color:inherit;text-align:left;padding:0 9px;cursor:pointer;font:12px var(--sapFontFamily,Arial,sans-serif)}
      .execution-menu{top:auto;bottom:34px;right:auto;left:0;width:238px;display:grid;gap:3px}
      .execution-menu button{border:0;border-radius:6px;background:transparent;color:inherit;text-align:left;padding:8px 9px;cursor:pointer;font:12px var(--sapFontFamily,Arial,sans-serif);display:grid;gap:2px}
      .execution-menu button:hover,.execution-menu button.on{background:color-mix(in srgb,var(--sapHighlightColor,#0a6ed1) 10%,transparent)}
      .execution-menu span{font-weight:700;color:var(--sapTextColor,#1d2d3e)}
      .execution-menu small{font-size:11px;line-height:1.35;color:var(--sapContent_LabelColor,#6a6d70)}
      .settings-panel{top:auto;bottom:34px;right:auto;left:0;width:230px;display:grid;gap:8px;font-size:12px}
      .settings-panel label{display:flex;justify-content:space-between;color:var(--sapContent_LabelColor,#6a6d70);font-weight:700}
      .settings-panel input[type="range"]{width:100%}
      .seg{display:grid;grid-template-columns:repeat(3,1fr);gap:4px}
      .seg button{height:28px;border:1px solid var(--sapButton_BorderColor,#bcc3ca);border-radius:6px;background:var(--sapButton_Background,#fff);color:var(--sapButton_TextColor,#0a6ed1);font-size:11px;cursor:pointer}
      .seg button.on{background:color-mix(in srgb,var(--sapHighlightColor,#0a6ed1) 12%,var(--sapButton_Background,#fff));border-color:color-mix(in srgb,var(--sapHighlightColor,#0a6ed1) 45%,var(--sapButton_BorderColor,#bcc3ca))}
      .detail{display:flex;flex-direction:column}
      .detail-head{height:38px;display:flex;align-items:center;gap:8px;padding:0 12px;border-bottom:1px solid var(--sapPageHeader_BorderColor,#d9dfe5);font-weight:700;background:var(--sapObjectHeader_Background,#fff)}
      .detail-head ui5-icon{color:var(--sapHighlightColor,#0a6ed1)}
      .detail-body{flex:1 1 auto;min-height:0;overflow:auto;padding:12px}
      .detail-body pre{margin:0;border:1px solid var(--sapList_BorderColor,#e5eaf0);border-radius:8px;background:var(--sapShell_Background,#f7f9fb);padding:10px;white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--sapTextColor,#1d2d3e)}
      .detail-body pre.diff{white-space:pre;overflow:auto}
      .diff span{display:block;min-height:1.45em}
      .diff .add{color:var(--sapPositiveTextColor,var(--sapPositiveColor,#107e3e));background:color-mix(in srgb,var(--sapPositiveColor,#107e3e) 10%,transparent)}
      .diff .del{color:var(--sapNegativeTextColor,var(--sapNegativeColor,#bb0000));background:color-mix(in srgb,var(--sapNegativeColor,#bb0000) 10%,transparent)}
      .diff .hunk{color:var(--sapInformativeTextColor,var(--sapHighlightColor,#0a6ed1));font-weight:700}
      .diff .ctx{color:var(--sapTextColor,#1d2d3e)}
      .kv{display:grid;grid-template-columns:76px 1fr;gap:6px 10px;margin-bottom:10px;font-size:12px}
      .kv label{color:var(--sapContent_LabelColor,#6a6d70);font-weight:700}
      .kv span{min-width:0;overflow-wrap:anywhere}
      .diagnostics{display:grid;gap:8px;margin:0 0 10px}
      .diag{border:1px solid var(--sapList_BorderColor,#e5eaf0);border-left-width:3px;border-radius:6px;padding:8px;background:var(--sapTile_Background,#fff);font-size:12px}
      .diag.warning{border-left-color:var(--sapCriticalColor,#df6e0c)}
      .diag.error{border-left-color:var(--sapNegativeColor,#bb0000)}
      .diag strong{display:inline-block;min-width:52px;text-transform:uppercase}
      .diag span{color:var(--sapContent_LabelColor,#6a6d70)}
      .diag p{margin:4px 0;overflow-wrap:anywhere}
      .diag code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--sapContent_LabelColor,#6a6d70)}
      .workflow-detail h3{margin:0 0 8px;font-size:14px}
      .detail-plan{margin:0;padding-left:22px}
      .empty{color:var(--sapContent_LabelColor,#6a6d70);font-size:13px}
      ui5-message-strip{margin:0 10px 8px}
      @media (max-width: 900px){
        .body{grid-template-columns:1fr}
        .detail{min-height:220px;border-top:1px solid var(--sapGroup_TitleBorderColor,#d9dfe5)}
      }
      @keyframes agent-spin{to{transform:rotate(360deg)}}
      @keyframes agent-pulse{0%,80%,100%{opacity:.35;transform:translateY(0)}40%{opacity:1;transform:translateY(-2px)}}
      @media (prefers-reduced-motion: reduce){
        .timeline-item.running .timeline-node ui5-icon,.pulse-row span{animation:none}
      }
    `
  }
}

if (!customElements.get('portal-agent-console')) customElements.define('portal-agent-console', PortalAgentConsole)

registerWorkspaceViewType('agent-console', () => '<portal-agent-console></portal-agent-console>')
