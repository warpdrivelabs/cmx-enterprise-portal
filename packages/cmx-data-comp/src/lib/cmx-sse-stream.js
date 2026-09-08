/**
 * fetch 流式 SSE 客户端（`text/event-stream` over fetch + ReadableStream 分帧解析）。
 *
 * 为什么不用 EventSource：原生 EventSource 不能携带 Authorization 等自定义头，jwt 鉴权下
 * 只能靠「一次性票据 + 认证白名单」绕行（flow 的 /sse/ticket 即此产物）。fetch 流式读取
 * 能力上完全等价，且：
 *   - 请求头与普通 REST 一致——门户场景由全局 fetch 拦截器（cmx-ui5-runtime/api-client）
 *     自动加 `Authorization: Bearer`，白名单放宽可收回；
 *   - 能读到 HTTP 状态码（EventSource 的 onerror 分不清 401 / 网络断 / 服务重启）；
 *   - AbortController 主动断开。
 *
 * 行为契约（对齐原 EventSource 版页面内 openSse，页面可平滑迁移）：
 *   - `listeners = { eventName: fn(data, raw) }`：data 优先 JSON.parse（失败给原始字符串）；
 *     无 `event:` 字段的帧分发到 `listeners.message`；纯注释帧（keep-alive）不分发。
 *   - `hooks = { onopen?, onclose? }`：断开即 onclose、重连成功再 onopen；401/403（凭据
 *     问题，重连无意义）与主动 close() 后不再重连、不再回调。
 *   - 断线自动重连：指数退避 1s..5s，上限 6 次，连上即复位（对齐原页面实现）。
 *   - 返回 `handle = { close() }`。
 *
 * cfg 与 cmx-page-helpers 的 apiJson 同构：`apiBase`（请求前缀）、`fetchInit`（credentials
 * 等整块默认值）、`authHeaders`（函数或对象——组件壳/headless 场景自注入；门户场景全局
 * 拦截器已注入，无需配置）。
 */

/** 重连次数上限与退避上限（毫秒）。 */
const MAX_RETRIES = 6
const MAX_DELAY_MS = 5000

function safeHeaders (h) {
  if (!h) return {}
  return typeof h === 'function' ? (h() || {}) : h
}

/**
 * 解析单个 SSE 帧（不含分隔空行的文本块）。
 * 逐行提取 `event:` / `data:` 字段（多行 data 以 `\n` 连接）；`:` 开头注释行与 `retry:` 忽略。
 * @returns {{ event: string, data: string, hasPayload: boolean }} hasPayload=false 表示纯注释/空帧。
 */
function parseFrame (frame) {
  let event = ''
  const dataLines = []
  for (let line of frame.split('\n')) {
    if (line.endsWith('\r')) line = line.slice(0, -1)
    if (!line || line.startsWith(':')) continue
    const ci = line.indexOf(':')
    const field = ci < 0 ? line : line.slice(0, ci)
    let value = ci < 0 ? '' : line.slice(ci + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') event = value
    else if (field === 'data') dataLines.push(value)
  }
  return { event: event || 'message', data: dataLines.join('\n'), hasPayload: dataLines.length > 0 || !!event }
}

/**
 * 打开一条 SSE 流。
 * @param {string} path 请求路径（`/` 开头时拼 cfg.apiBase 前缀）
 * @param {Record<string, (data: any, raw: string) => void>} listeners
 * @param {{ onopen?: () => void, onclose?: () => void }} [hooks]
 * @param {{ apiBase?: string, fetchInit?: object, authHeaders?: object | (() => object) }} [cfg]
 * @returns {{ close(): void }}
 */
export function openSseStream (path, listeners = {}, hooks = {}, cfg = {}) {
  const full = (cfg.apiBase && String(path).charAt(0) === '/') ? cfg.apiBase + path : path
  const handle = { closed: false, retries: 0, timer: null, ctrl: null }

  const dispatch = (event, raw) => {
    const fn = listeners[event]
    if (!fn) return
    let data = raw
    if (typeof raw === 'string' && raw) {
      try { data = JSON.parse(raw) } catch { /* 非 JSON 载荷保持原字符串 */ }
    }
    try { fn(data, raw) } catch { /* 监听器异常不打断流 */ }
  }

  const scheduleReconnect = () => {
    if (!handle.closed && hooks.onclose) hooks.onclose()
    if (handle.closed || handle.retries >= MAX_RETRIES) return
    handle.retries++
    const delay = Math.min(1000 * handle.retries, MAX_DELAY_MS)
    handle.timer = setTimeout(() => { handle.timer = null; connect() }, delay)
  }

  const connect = async () => {
    if (handle.closed) return
    const ctrl = new AbortController()
    handle.ctrl = ctrl
    try {
      const init = { ...(cfg.fetchInit || {}), signal: ctrl.signal }
      init.headers = {
        Accept: 'text/event-stream',
        ...safeHeaders(cfg.authHeaders),
        ...((cfg.fetchInit && cfg.fetchInit.headers) || {}),
      }
      const res = await fetch(full, init)
      if (!res.ok) {
        // 401/403：凭据问题，重连无意义（门户全局拦截器对 401 另有清登录态处理）。
        if (res.status === 401 || res.status === 403) {
          if (!handle.closed && hooks.onclose) hooks.onclose()
          return
        }
        throw new Error(`SSE HTTP ${res.status}`)
      }
      if (!res.body) throw new Error('SSE 响应体不可流式读取（浏览器不支持 ReadableStream）')
      if (!handle.closed && hooks.onopen) hooks.onopen()

      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        // 行结尾归一（SSE 允许 LF/CRLF/CR）；尾随孤立 \r 留待下一 chunk 拼齐再归一。
        buf += dec.decode(value, { stream: true })
        if (buf.endsWith('\r')) buf = buf.slice(0, -1).replace(/\r\n?/g, '\n') + '\r'
        else buf = buf.replace(/\r\n?/g, '\n')
        let idx
        let gotPayload = false
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const frame = buf.slice(0, idx)
          buf = buf.slice(idx + 2)
          const { event, data, hasPayload } = parseFrame(frame)
          if (hasPayload) { gotPayload = true; dispatch(event, data) }
        }
        // 重试计数仅在收到真实载荷后复位（连接确实可用）——空流/秒断不复位，
        // 否则「连接成功即复位」会让秒断流以 1s 间隔无限重连，退避封顶失效。
        if (gotPayload) handle.retries = 0
      }
      // 流正常结束（服务端关流）→ 与网络异常同路：onclose + 退避重连。
      if (!handle.closed) scheduleReconnect()
    } catch (_err) {
      if (handle.closed || ctrl.signal.aborted) return
      scheduleReconnect()
    }
  }

  connect()
  return {
    close () {
      handle.closed = true
      if (handle.timer) { clearTimeout(handle.timer); handle.timer = null }
      try { if (handle.ctrl) handle.ctrl.abort() } catch { /* ignore */ }
    },
  }
}
