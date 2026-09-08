/**
 * 通知中心 API + SSE 订阅。
 *
 * - REST：centers/counts/list/markRead/publish（同源 /api/*，鉴权头由全局 fetch 拦截器自动注入）。
 * - SSE：服务端主动推送本用户的新通知与角标刷新。浏览器原生 EventSource 无法带 Authorization 头，
 *   故用 fetch + 流读（与 portal-agent-console 的 SSE 读法一致），鉴权头由拦截器自动加。
 */

import { apiFetch } from 'cmx-ui5-runtime/api-client'

const BASE = '/api/notifications'

export async function fetchNotifyCenters () {
  return apiFetch(`${BASE}/centers`, { headers: { Accept: 'application/json' } })
}

export async function fetchNotifyCounts () {
  return apiFetch(`${BASE}/counts`, { headers: { Accept: 'application/json' } })
}

export async function fetchNotifications (center) {
  const q = center ? `?center=${encodeURIComponent(center)}` : ''
  const d = await apiFetch(`${BASE}${q}`, { headers: { Accept: 'application/json' } })
  return (d && d.items) || []
}

export async function markNotificationRead ({ center, id, all } = {}) {
  return apiFetch(`${BASE}/mark-read`, {
    method: 'POST',
    body: JSON.stringify({ center, id, all: !!all }),
  })
}

export async function publishNotification (payload) {
  return apiFetch(`${BASE}/publish`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/**
 * 订阅通知 SSE 流。返回一个 stop() 函数用于断开。
 * 自动重连（指数退避，最长 15s）。每个 SSE 事件回调 onEvent({ type, data })。
 * @param {(ev: { type: string, data: any }) => void} onEvent
 * @returns {() => void} stop
 */
export function subscribeNotifyStream (onEvent) {
  let stopped = false
  let controller = null
  let retry = 0

  const run = async () => {
    while (!stopped) {
      controller = new AbortController()
      try {
        const res = await fetch(`${BASE}/stream`, {
          headers: { Accept: 'text/event-stream' },
          signal: controller.signal,
        })
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
        retry = 0
        await readSse(res, onEvent, () => stopped)
      } catch (err) {
        if (stopped) break
        // 退避重连
        retry = Math.min(retry + 1, 6)
      }
      if (stopped) break
      const wait = Math.min(1000 * 2 ** retry, 15000)
      await new Promise((r) => setTimeout(r, wait))
    }
  }
  run()

  return () => {
    stopped = true
    try { controller?.abort() } catch { /* noop */ }
  }
}

/** 解析 text/event-stream：按空行分隔事件，提取 event: 与 data:。 */
async function readSse (res, onEvent, isStopped) {
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    if (isStopped()) { try { await reader.cancel() } catch { /* noop */ } return }
    const { value, done } = await reader.read()
    if (done) return
    buf += decoder.decode(value, { stream: true })
    let idx
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const raw = buf.slice(0, idx)
      buf = buf.slice(idx + 2)
      let event = 'message'
      const dataLines = []
      for (const line of raw.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
      }
      if (!dataLines.length) continue
      let data = dataLines.join('\n')
      try { data = JSON.parse(data) } catch { /* 保留字符串 */ }
      try { onEvent({ type: event, data }) } catch { /* noop */ }
    }
  }
}
