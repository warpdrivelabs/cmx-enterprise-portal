/**
 * cmx-ai SSE 客户端 —— 接收后端推送的 cmx-ai 事件流。
 *
 * 端点：GET /api/ai/events?session_id=ses_xxx&access_token=<jwt>
 * （EventSource 无法设置 Authorization header，故 token 经 query 传递；后端已做认证白名单放行。）
 *
 * 后端推送标准 SSE 帧：
 *   event: text_delta\n
 *   data: {"session_id":"ses_xxx","content":"片段"}\n\n
 *
 * 事件类型（对齐 shared-contracts/sse-events.md）：
 *   text_delta       流式文本片段
 *   reasoning_delta  推理过程片段（可选）
 *   tool_call        工具调用进度（可选）
 *   json_chunk       渐进 JSON 片段（DCT/DOC 预览）
 *   ask_user         询问窗口（挂起生成，等待回答）
 *   require_approval 修改审批（挂起生成，等待决策）
 *   result           最终生成结果
 *   error            错误
 *   done             本轮流结束
 *
 * 由于 EventSource 原生 API 用 addEventListener(eventType) 注册具名事件，
 * 但后端可能把所有事件都走 message 通道（event 字段在 data 内），本客户端两种都兼容。
 */

// 复用 Portal 统一 API 客户端的 token 存取（与 Portal 登录态一致）。
import { getToken } from 'cmx-ui5-runtime/api-client'

/** SSE 事件类型常量。 */
export const AiEventType = {
  TEXT_DELTA: 'text_delta',
  REASONING_DELTA: 'reasoning_delta',
  TOOL_CALL: 'tool_call',
  JSON_CHUNK: 'json_chunk',
  ASK_USER: 'ask_user',
  REQUIRE_APPROVAL: 'require_approval',
  RESULT: 'result',
  ERROR: 'error',
  DONE: 'done',
  /** 隐式上下文请求：插件工具要当前页面信息，前端自动收集并回传（无询问框）。 */
  CONTEXT_REQUEST: 'context_request',
}

export class AiSseClient {
  /**
   * @param {string} sessionId 要订阅的会话 id（ses_*）
   */
  constructor (sessionId) {
    this.sessionId = sessionId
    /** @type {EventSource|null} */
    this.es = null
    /** @type {Map<string, Set<Function>>} event -> handlers */
    this._handlers = new Map()
    this._closed = false
    this._reconnectTimer = null
    this._reconnectDelay = 1000
  }

  /**
   * 建立 SSE 连接并开始监听。
   * 浏览器原生 EventSource 会在连接断开时自动重连，这里额外做 onclose 兜底通知。
   */
  connect () {
    if (this._closed) return
    const token = getToken()
    const url = `/api/ai/events?session_id=${encodeURIComponent(this.sessionId)}&access_token=${encodeURIComponent(token)}`

    this.es = new EventSource(url, { withCredentials: false })

    // 具名事件：后端若用 event: text_delta 形式，EventSource 会按类型分发。
    for (const type of Object.values(AiEventType)) {
      this.es.addEventListener(type, (e) => this._dispatch(type, e.data))
    }

    // 兜底：后端若把类型放在 data 里、统一走 message 通道。
    this.es.addEventListener('message', (e) => this._handleRawMessage(e.data))

    this.es.onopen = () => {
      this._reconnectDelay = 1000 // 连接成功后重置退避
    }

    this.es.onerror = () => {
      // EventSource 会自动重连；这里只在彻底关闭时通知。
      if (this._closed) return
      // 若 readyState 为 CLOSED（2），说明浏览器放弃重连，需手动兜底。
      if (this.es && this.es.readyState === EventSource.CLOSED) {
        this._dispatch(AiEventType.ERROR, JSON.stringify({
          session_id: this.sessionId,
          code: 'sse_closed',
          message: 'SSE 连接已断开',
        }))
        this._scheduleReconnect()
      }
    }
  }

  /**
   * 手动重连兜底（EventSource 已放弃时）。
   * 指数退避，上限 15s。
   */
  _scheduleReconnect () {
    if (this._closed || this._reconnectTimer) return
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null
      if (this._closed) return
      this.connect()
      this._reconnectDelay = Math.min(this._reconnectDelay * 1.5, 15000)
    }, this._reconnectDelay)
  }

  /**
   * 处理走 message 通道的原始消息：尝试从 data 里提取 event 字段。
   * 兼容两种后端实现：① data 是 {event, data} 包装；② data 直接是事件载荷（无 event 字段，按 message 处理）。
   */
  _handleRawMessage (rawData) {
    if (!rawData) return
    let parsed = null
    try { parsed = JSON.parse(rawData) } catch { return }
    if (!parsed || typeof parsed !== 'object') return
    // 形式 ①：{ event: "text_delta", data: {...} }
    if (typeof parsed.event === 'string' && parsed.data !== undefined) {
      this._dispatch(parsed.event, typeof parsed.data === 'string' ? parsed.data : JSON.stringify(parsed.data))
      return
    }
    // 形式 ②：载荷本身就是事件对象，但有 type 字段表明事件类型。
    if (typeof parsed.type === 'string' && Object.values(AiEventType).includes(parsed.type)) {
      this._dispatch(parsed.type, rawData)
      return
    }
    // 无法识别类型，作为 message 原样分发（让调用方自行判断）。
    this._dispatch('message', rawData)
  }

  /**
   * 分发事件给已注册的 handler。
   * @param {string} type 事件类型
   * @param {string} rawData 原始 data 字符串（JSON）
   */
  _dispatch (type, rawData) {
    let data = rawData
    if (typeof rawData === 'string' && rawData) {
      try { data = JSON.parse(rawData) } catch { /* 非 JSON，保持原字符串 */ }
    }
    const handlers = this._handlers.get(type)
    if (handlers) {
      for (const h of handlers) {
        try { h(data, rawData) } catch (err) { console.error('[AiSseClient] handler error:', err) }
      }
    }
    // 同时分发给通配 '*' handler（用于调试/日志）
    const wildcards = this._handlers.get('*')
    if (wildcards) {
      for (const h of wildcards) {
        try { h(type, data, rawData) } catch (err) { console.error('[AiSseClient] wildcard handler error:', err) }
      }
    }
  }

  /**
   * 注册事件 handler。
   * @param {string} type 事件类型（AiEventType 常量，或 '*' 接收所有）
   * @param {Function} handler (data, rawData) => void；通配为 (type, data, rawData) => void
   * @returns {() => void} 取消注册的函数
   */
  on (type, handler) {
    if (!this._handlers.has(type)) this._handlers.set(type, new Set())
    this._handlers.get(type).add(handler)
    return () => this.off(type, handler)
  }

  /** 取消注册。 */
  off (type, handler) {
    const set = this._handlers.get(type)
    if (set) set.delete(handler)
  }

  /** 关闭连接，释放资源。关闭后不再重连。 */
  close () {
    this._closed = true
    if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null }
    if (this.es) {
      this.es.close()
      this.es = null
    }
    this._handlers.clear()
  }
}
