/**
 * cmx.datetime —— 时间显示统一转换域（零依赖纯函数）。
 *
 * 背景：后端一律输出 UTC ISO 串（chrono to_rfc3339，如 `2026-09-03T16:43:38.238813+00:00`）。
 * 前端显示前必须转换为**浏览器当前时区**（或显式指定 tz），禁止 `slice` / `replace('T')`
 * 直接截取——那会把 UTC 时间冒充本地时间（差一个时区偏移，前端时间显示规范 一票否决）。
 *
 * 解析规则（parseDate）：
 * - `Date` 实例 / 时间戳数字直通（秒级 <1e12 自动 ×1000）；
 * - `YYYY-MM-DD`（date-only）按**本地**午夜（修正 ES 规范 date-only 按 UTC 解析的偏移）；
 * - 带时区后缀（`Z` / `±HH:MM` / `±HHMM` / `±HH`）按其时区换算；
 * - 无时区后缀的 datetime 串按 **UTC**（CMX 后端全 UTC 存储约定）；
 * - 小数秒 >3 位截到毫秒（微秒/纳秒串在 Safari 解析不稳）；
 * - 解析失败返回 `null`，各 fmt 函数返回 `opts.empty`（默认 `''`）。
 *
 * 格式化（fmt*）第二参统一 `opts`：`{ tz?: IANA 时区名（默认浏览器当前时区）, empty?: 空值占位 }`。
 */

import { registerShared } from './core.js'

const P2 = (n) => String(n).padStart(2, '0')
const P3 = (n) => String(n).padStart(3, '0')

/* date-only：YYYY-MM-DD 或 YYYY/MM/DD */
const RE_DATE_ONLY = /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/
/* 无时区 datetime：YYYY-MM-DD[T ]HH:mm[:ss[.frac]]（结尾锚定天然排除带时区后缀的串） */
const RE_NAIVE_DT = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/

/**
 * 统一解析为 Date（本地时区瞬时值）；无法识别返回 null。
 * @param {Date|number|string} input
 * @returns {Date|null}
 */
export function parseDate (input) {
  if (input == null || input === '') return null
  if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : input
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return null
    return new Date(input < 1e12 ? input * 1000 : input)
  }
  let s = String(input).trim()
  if (!s) return null
  if (RE_DATE_ONLY.test(s)) {
    const [y, m, d] = s.split(/[-/]/).map(Number)
    const dt = new Date(y, m - 1, d)
    return Number.isNaN(dt.getTime()) ? null : dt
  }
  s = s.replace(' ', 'T') // 空格分隔统一为 T（Safari 宽容度差）
  s = s.replace(/(\.\d{3})\d+/, '$1') // 微秒/纳秒截到毫秒
  if (RE_NAIVE_DT.test(s)) {
    s = s.replace(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})$/, '$1:00') // 缺秒补 :00（部分引擎对 HH:mm+Z 解析不一致）
    s += 'Z' // 无时区 datetime 按 UTC（后端全 UTC 约定）
  }
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

/* Intl.DateTimeFormat 实例缓存（同 tz + 同字段组合复用，避免每行格式化都新建） */
const formatterCache = new Map()

/**
 * 取目标时区下的字段分解（year/month/day/hour/minute/second 均为数字）。
 * @param {Date} d 已解析的 Date
 * @param {string} [tz] IANA 时区名；缺省 = 浏览器当前时区
 */
export function getParts (d, tz) {
  const key = `${tz}|dt`
  let f = formatterCache.get(key)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
    formatterCache.set(key, f)
  }
  const map = {}
  for (const p of f.formatToParts(d)) {
    if (p.type !== 'literal') map[p.type] = p.value
  }
  return {
    year: +map.year, month: +map.month, day: +map.day,
    hour: +map.hour % 24, minute: +map.minute, second: +map.second,
  }
}

/* 通用拼接：fields 数组元素形如 {k:'year', w:4}；分秒补 2 位 */
function fmtWith (input, render, opts) {
  const empty = opts && opts.empty != null ? opts.empty : ''
  const d = parseDate(input)
  if (!d) return empty
  return render(getParts(d, opts && opts.tz), d)
}

/**
 * 年月日时分秒：`YYYY-MM-DD HH:mm:ss`（表格/详情默认格式）。
 */
export function fmtDateTime (input, opts) {
  return fmtWith(input, (p) => `${p.year}-${P2(p.month)}-${P2(p.day)} ${P2(p.hour)}:${P2(p.minute)}:${P2(p.second)}`, opts)
}

/**
 * 年月日：`YYYY-MM-DD`。
 */
export function fmtDate (input, opts) {
  return fmtWith(input, (p) => `${p.year}-${P2(p.month)}-${P2(p.day)}`, opts)
}

/**
 * 时分秒：`HH:mm:ss`。
 */
export function fmtTime (input, opts) {
  return fmtWith(input, (p) => `${P2(p.hour)}:${P2(p.minute)}:${P2(p.second)}`, opts)
}

/**
 * 年月日时分：`YYYY-MM-DD HH:mm`（列表紧凑列）。
 */
export function fmtMinute (input, opts) {
  return fmtWith(input, (p) => `${p.year}-${P2(p.month)}-${P2(p.day)} ${P2(p.hour)}:${P2(p.minute)}`, opts)
}

/**
 * 带毫秒：`YYYY-MM-DD HH:mm:ss.SSS`（日志/事件排障）。
 */
export function fmtDateTimeMs (input, opts) {
  return fmtWith(input, (p, d) => `${p.year}-${P2(p.month)}-${P2(p.day)} ${P2(p.hour)}:${P2(p.minute)}:${P2(p.second)}.${P3(d.getMilliseconds())}`, opts)
}

/**
 * 紧凑：`MM-DD HH:mm`（卡片/徽标，同年内省年）。
 */
export function fmtShort (input, opts) {
  return fmtWith(input, (p) => `${P2(p.month)}-${P2(p.day)} ${P2(p.hour)}:${P2(p.minute)}`, opts)
}

/**
 * 智能短格式：目标时区下——今天 `HH:mm`；今年 `MM-DD HH:mm`；跨年 `YYYY-MM-DD`。
 */
export function fmtFriendly (input, opts) {
  const empty = opts && opts.empty != null ? opts.empty : ''
  const d = parseDate(input)
  if (!d) return empty
  const tz = opts && opts.tz
  const p = getParts(d, tz)
  const now = getParts(new Date(), tz)
  const sameDay = p.year === now.year && p.month === now.month && p.day === now.day
  if (sameDay) return `${P2(p.hour)}:${P2(p.minute)}`
  if (p.year === now.year) return `${P2(p.month)}-${P2(p.day)} ${P2(p.hour)}:${P2(p.minute)}`
  return `${p.year}-${P2(p.month)}-${P2(p.day)}`
}

/**
 * 相对时间：刚刚 / n 秒前 / n 分钟前 / n 小时前；昨天起回落到绝对格式
 * （今天以目标时区为准）：`昨天 HH:mm` / `MM-DD HH:mm` / `YYYY-MM-DD`；未来同构「n 秒后」等。
 */
export function fmtRelative (input, opts) {
  const empty = opts && opts.empty != null ? opts.empty : ''
  const d = parseDate(input)
  if (!d) return empty
  const tz = opts && opts.tz
  const diffMs = Date.now() - d.getTime()
  const abs = Math.abs(diffMs)
  const suffix = diffMs >= 0 ? '前' : '后'
  if (abs < 10_000) return '刚刚'
  if (abs < 60_000) return `${Math.floor(abs / 1000)} 秒${suffix}`
  if (abs < 3_600_000) return `${Math.floor(abs / 60_000)} 分钟${suffix}`
  if (abs < 86_400_000) return `${Math.floor(abs / 3_600_000)} 小时${suffix}`
  const p = getParts(d, tz)
  const now = getParts(new Date(), tz)
  /* 日历日差：按目标时区的年月日取该日历日的 UTC 时间戳再求整天差（跨月/跨年/闰年均正确） */
  const dayNum = (q) => Date.UTC(q.year, q.month - 1, q.day) / 86_400_000
  const dayDiff = dayNum(now) - dayNum(p)
  if (dayDiff === 0) return `${P2(p.hour)}:${P2(p.minute)}`
  if (dayDiff === 1) return `昨天 ${P2(p.hour)}:${P2(p.minute)}`
  if (dayDiff === -1) return `明天 ${P2(p.hour)}:${P2(p.minute)}`
  if (p.year === now.year) return `${P2(p.month)}-${P2(p.day)} ${P2(p.hour)}:${P2(p.minute)}`
  return `${p.year}-${P2(p.month)}-${P2(p.day)}`
}

/**
 * 时长（毫秒）：`2d 3h 5m`。自动省略前导零单位；不足 1 秒返回 `0s`。
 * opts.maxUnits 最多保留的单位数（默认 3）；opts.empty 非有限数值时的返回值（默认 ''）。
 */
export function fmtDuration (ms, opts) {
  const empty = opts && opts.empty != null ? opts.empty : ''
  if (!Number.isFinite(ms)) return empty
  let s = Math.floor(Math.abs(ms) / 1000)
  const days = Math.floor(s / 86_400); s %= 86_400
  const h = Math.floor(s / 3_600); s %= 3_600
  const m = Math.floor(s / 60); s %= 60
  const parts = []
  if (days) parts.push(`${days}d`)
  if (h) parts.push(`${h}h`)
  if (m) parts.push(`${m}m`)
  if (s || parts.length === 0) parts.push(`${s}s`)
  return parts.slice(0, (opts && opts.maxUnits) || 3).join(' ')
}

/**
 * 时长区间：`fmtDurationBetween(start, end)` → 两端经 parseDate 解析后求差。
 */
export function fmtDurationBetween (start, end, opts) {
  const a = parseDate(start)
  const b = parseDate(end)
  if (!a || !b) {
    const empty = opts && opts.empty != null ? opts.empty : ''
    return empty
  }
  return fmtDuration(b.getTime() - a.getTime(), opts)
}

/** 域 API 聚合（页面用法：`const DT = (globalThis.cmx || {}).datetime` → `DT.fmtDateTime(v)`） */
export const cmxDatetime = {
  parseDate, getParts,
  fmtDate, fmtTime, fmtDateTime, fmtDateTimeMs, fmtMinute, fmtShort, fmtFriendly, fmtRelative,
  fmtDuration, fmtDurationBetween,
}

registerShared('datetime', cmxDatetime)
