// cmx-sse-stream 单元测试：fetch 流式 SSE 的分帧解析 / 分发 / 重连 / 终止语义——
// flow 运维台与设计工作台从 EventSource（换票）迁到此处，这些行为分毫不差。

import { describe, it, expect, vi, afterEach } from 'vitest'
import { openSseStream } from '../cmx-sse-stream.js'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

/** 构造 SSE 流响应：chunks 依序入流后关流（模拟服务端断流 → 触发重连路径）。 */
function sseResponse (chunks, status = 200) {
  const stream = new ReadableStream({
    start (c) {
      for (const ch of chunks) c.enqueue(new TextEncoder().encode(ch))
      c.close()
    },
  })
  return { ok: status >= 200 && status < 300, status, body: stream }
}

/** 构造永不关流的响应（模拟持续在线的 SSE 连接）。 */
function sseOpenResponse () {
  const stream = new ReadableStream({ start () { /* 不关流 */ } })
  return { ok: true, status: 200, body: stream }
}

/** fetch 桩：按脚本依次回放，记录每次调用的 (url, init)。 */
function stubFetch (script) {
  const calls = []
  let i = 0
  vi.stubGlobal('fetch', async (url, init) => {
    calls.push({ url, init })
    const step = script[Math.min(i++, script.length - 1)]
    return typeof step === 'function' ? step() : step
  })
  return calls
}

describe('openSseStream 分帧与分发', () => {
  it('event 帧按名分发、data 自动 JSON.parse；message 帧落 message 通道', async () => {
    const seen = []
    stubFetch([sseResponse([
      'event: instance.started\ndata: {"instanceId":42}\n\n',
      'data: plain-message\n\n',
    ])])
    const h = openSseStream('/api/flow/v1/events', {
      'instance.started': (d, raw) => seen.push(['named', d, raw]),
      message: (d, raw) => seen.push(['msg', d, raw]),
    })
    await vi.waitFor(() => expect(seen.length).toBe(2))
    h.close()
    expect(seen[0]).toEqual(['named', { instanceId: 42 }, '{"instanceId":42}'])
    expect(seen[1]).toEqual(['msg', 'plain-message', 'plain-message'])
  })

  it('多行 data 以 \\n 连接；注释帧（keep-alive）不分发', async () => {
    const seen = []
    stubFetch([sseResponse([
      ': keep-alive\n\n',
      'data: line1\ndata: line2\n\n',
      '\n\n',
    ])])
    const h = openSseStream('/x', { message: (d) => seen.push(d) })
    await vi.waitFor(() => expect(seen.length).toBe(1))
    h.close()
    expect(seen[0]).toBe('line1\nline2')
  })

  it('帧跨 chunk 边界切开仍正确拼接；CRLF 行结尾归一', async () => {
    const seen = []
    stubFetch([sseResponse([
      'event: op\r\nda', 'ta: {"seq":7}\r\n\r', '\n',
      'data: tail\r\n\r\n',
    ])])
    const h = openSseStream('/x', { op: (d) => seen.push(d), message: (d) => seen.push(d) })
    await vi.waitFor(() => expect(seen.length).toBe(2))
    h.close()
    expect(seen[0]).toEqual({ seq: 7 })
    expect(seen[1]).toBe('tail')
  })

  it('apiBase 前缀 + authHeaders + fetchInit.headers 注入请求头', async () => {
    const calls = stubFetch([sseOpenResponse()])
    const h = openSseStream('/api/sse', {}, {}, {
      apiBase: 'https://svc.example',
      authHeaders: () => ({ Authorization: 'Bearer t' }),
      fetchInit: { credentials: 'omit', headers: { 'X-Extra': '1' } },
    })
    await vi.waitFor(() => expect(calls.length).toBe(1))
    h.close()
    const headers = calls[0].init.headers
    expect(headers.Accept).toBe('text/event-stream')
    expect(headers.Authorization).toBe('Bearer t')
    expect(headers['X-Extra']).toBe('1')
    expect(calls[0].url).toBe('https://svc.example/api/sse')
    expect(calls[0].init.credentials).toBe('omit')
  })
})

describe('openSseStream 连接生命周期', () => {
  it('流结束 → onclose + 指数退避重连，连上后 onopen 且重试计数复位', async () => {
    vi.useFakeTimers()
    const calls = stubFetch([sseResponse(['data: 1\n\n']), sseResponse(['data: 2\n\n']), sseOpenResponse()])
    const events = []
    const h = openSseStream('/x', { message: (d) => events.push(d) }, {
      onopen: () => events.push('open'),
      onclose: () => events.push('close'),
    })
    await vi.advanceTimersByTimeAsync(1)
    await vi.advanceTimersByTimeAsync(1)
    // 事件序列含 message 载荷（1）：onopen → 收帧 1 → 断流 onclose。
    expect(events).toEqual(['open', 1, 'close'])
    await vi.advanceTimersByTimeAsync(1000) // 第一次重连退避 1s
    expect(events).toEqual(['open', 1, 'close', 'open', 2, 'close'])
    await vi.advanceTimersByTimeAsync(2000) // 第二次退避 2s → 第三次连接保持在线
    expect(calls.length).toBe(3)
    expect(events.filter((e) => e === 'open')).toHaveLength(3)
    h.close()
  })

  it('HTTP 401 → onclose 一次且不重连（fetch 只调一次）', async () => {
    const calls = stubFetch([{ ok: false, status: 401, body: null }])
    const events = []
    const h = openSseStream('/x', {}, { onclose: () => events.push('close') })
    await vi.waitFor(() => expect(events).toEqual(['close']))
    await new Promise((r) => setTimeout(r, 20))
    expect(calls.length).toBe(1)
    h.close()
    expect(events).toEqual(['close'])
  })

  it('close() 主动中止：不触发 onclose、不再重连（fetch 只调一次）', async () => {
    const calls = stubFetch([sseOpenResponse()])
    const events = []
    const h = openSseStream('/x', {}, { onclose: () => events.push('close') })
    await vi.waitFor(() => expect(calls.length).toBe(1))
    h.close()
    await new Promise((r) => setTimeout(r, 30))
    expect(events).toEqual([])
    expect(calls.length).toBe(1)
  })

  it('持续断流重连封顶 6 次，之后停手', async () => {
    vi.useFakeTimers()
    let n = 0
    vi.stubGlobal('fetch', async () => { n++; return sseResponse([]) })
    const closes = []
    const h = openSseStream('/x', {}, { onclose: () => closes.push(n) })
    // 1s+2s+3s+4s+5s+5s = 总推进 20s 足够跑满 6 次重连。
    await vi.advanceTimersByTimeAsync(20000)
    expect(n).toBe(7) // 首发 1 次 + 重连 6 次
    h.close()
  })
})
