import { describe, it, expect, vi } from 'vitest'
import {
  parseDate, getParts,
  fmtDate, fmtTime, fmtDateTime, fmtDateTimeMs, fmtMinute, fmtShort, fmtFriendly, fmtRelative,
  fmtDuration, fmtDurationBetween,
} from '../datetime.js'
import { registerShared } from '../core.js'

/* 全部断言固定 tz（Asia/Shanghai = UTC+8 无夏令时），不依赖 CI 机器本地时区。 */
const TZ = 'Asia/Shanghai'
const SH = { tz: TZ }
const UTC = { tz: 'UTC' }

/* 用户投诉原始案例：后端 UTC ISO 串 → 东八区应显示次日 00:43:38，而非截取出的 16:43:38 */
const RAW = '2026-09-03T16:43:38.238813+00:00'

describe('parseDate 解析', () => {
  it('UTC ISO（+00:00 / Z / 微秒小数）解析为同一瞬时', () => {
    const a = parseDate('2026-09-03T16:43:38.238813+00:00')
    const b = parseDate('2026-09-03T16:43:38.238813Z')
    expect(a.getTime()).toBe(b.getTime())
    expect(a.getTime()).toBe(Date.UTC(2026, 8, 3, 16, 43, 38, 238)) // 微秒截到毫秒 238
  })

  it('无时区 datetime 串按 UTC（后端全 UTC 约定，空格分隔同样支持）', () => {
    expect(parseDate('2026-09-03 16:43:38').getTime()).toBe(Date.UTC(2026, 8, 3, 16, 43, 38))
    expect(parseDate('2026-09-03T16:43').getTime()).toBe(Date.UTC(2026, 8, 3, 16, 43))
  })

  it('带偏移后缀按其时区换算', () => {
    expect(parseDate('2026-09-03T16:43:38+08:00').getTime()).toBe(Date.UTC(2026, 8, 3, 8, 43, 38))
  })

  it('date-only 按本地午夜（修正 ES 按 UTC 解析的偏差）', () => {
    const d = parseDate('2026-09-03')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(8)
    expect(d.getDate()).toBe(3)
    expect(d.getHours()).toBe(0) // 本地 0 点，而非 UTC 0 点（+8 区会显示 08:00）
  })

  it('时间戳：毫秒直通、秒级自动 ×1000；Date 实例直通', () => {
    const ms = Date.UTC(2026, 8, 3, 16, 0, 0)
    expect(parseDate(ms).getTime()).toBe(ms)
    expect(parseDate(ms / 1000).getTime()).toBe(ms)
    expect(parseDate(new Date(ms)).getTime()).toBe(ms)
  })

  it('空值与非法输入返回 null', () => {
    expect(parseDate(null)).toBeNull()
    expect(parseDate(undefined)).toBeNull()
    expect(parseDate('')).toBeNull()
    expect(parseDate('   ')).toBeNull()
    expect(parseDate('not-a-date')).toBeNull()
    expect(parseDate(NaN)).toBeNull()
    expect(parseDate(Infinity)).toBeNull()
  })
})

describe('fmt* 格式化（固定时区）', () => {
  it('原始案例：UTC 串转东八区 / UTC 显示', () => {
    expect(fmtDateTime(RAW, SH)).toBe('2026-09-04 00:43:38') // 转时区，非截取
    expect(fmtDateTime(RAW, UTC)).toBe('2026-09-03 16:43:38')
  })

  it('年月日 / 时分秒 / 分 / 毫秒 / 紧凑各格式', () => {
    expect(fmtDate(RAW, SH)).toBe('2026-09-04')
    expect(fmtTime(RAW, SH)).toBe('00:43:38')
    expect(fmtMinute(RAW, SH)).toBe('2026-09-04 00:43')
    expect(fmtDateTimeMs(RAW, SH)).toBe('2026-09-04 00:43:38.238')
    expect(fmtShort(RAW, SH)).toBe('09-04 00:43')
  })

  it('缺省 tz 时用浏览器本地时区（与 Intl 一致，非固定 UTC）', () => {
    const out = fmtDateTime(RAW) // 不传 opts：按宿主时区
    const local = new Date('2026-09-03T16:43:38.238Z')
    const p = getParts(local)
    expect(out).toBe(`${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')} ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}:${String(p.second).padStart(2, '0')}`)
  })

  it('空值 / 非法值返回 empty（可自定义占位）', () => {
    expect(fmtDateTime(null, SH)).toBe('')
    expect(fmtDateTime('garbage', SH)).toBe('')
    expect(fmtDateTime(null, { ...SH, empty: '—' })).toBe('—')
  })

  it('getParts 分解目标时区字段', () => {
    expect(getParts(parseDate(RAW), TZ)).toMatchObject({
      year: 2026, month: 9, day: 4, hour: 0, minute: 43, second: 38,
    })
  })
})

describe('fmtFriendly / fmtRelative', () => {
  it('今天 → HH:mm；今年 → MM-DD HH:mm；跨年 → YYYY-MM-DD', () => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 30)
    expect(fmtFriendly(today, SH)).toBe('09:30')
    const thisYear = new Date(now.getFullYear(), 0, 15, 8, 0)
    const jf = fmtFriendly(thisYear, SH)
    expect(jf).toMatch(/^\d{2}-\d{2} \d{2}:\d{2}$/)
    const lastYear = new Date(now.getFullYear() - 1, 5, 1, 8, 0)
    expect(fmtFriendly(lastYear, SH)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('相对时间：刚刚 / 分钟前 / 小时前', () => {
    expect(fmtRelative(new Date(Date.now() - 5_000), SH)).toBe('刚刚')
    expect(fmtRelative(new Date(Date.now() - 120_000), SH)).toBe('2 分钟前')
    expect(fmtRelative(new Date(Date.now() - 7_200_000), SH)).toBe('2 小时前')
    expect(fmtRelative(new Date(Date.now() + 3_000), SH)).toBe('刚刚')
    expect(fmtRelative(new Date(Date.now() + 600_000), SH)).toBe('10 分钟后')
  })

  it('相对时间：昨天 / 今天回落绝对格式（fake timers 固定当前时间，含跨月）', () => {
    vi.useFakeTimers()
    try {
      // 固定"现在" = 东八区 2026-09-04 12:00（UTC 04:00）
      vi.setSystemTime(new Date('2026-09-04T04:00:00Z'))
      expect(fmtRelative('2026-09-03T02:10:00Z', SH)).toBe('昨天 10:10') // 东八区昨天 10:10
      expect(fmtRelative('2026-09-03T16:10:00Z', SH)).toBe('11 小时前') // 东八区今天 00:10（24h 内走小时段）
      // 跨月：现在 = 东八区 9/1 12:00，事件 = 东八区 8/31 10:10 → 昨天
      vi.setSystemTime(new Date('2026-09-01T04:00:00Z'))
      expect(fmtRelative('2026-08-31T02:10:00Z', SH)).toBe('昨天 10:10')
    } finally { vi.useRealTimers() }
  })
})

describe('fmtDuration 时长', () => {
  it('自动省略前导零单位、封顶 3 个单位', () => {
    expect(fmtDuration(45_000)).toBe('45s')
    expect(fmtDuration(3_600_000)).toBe('1h')
    expect(fmtDuration((2 * 86_400 + 3 * 3_600 + 5 * 60 + 4) * 1000)).toBe('2d 3h 5m')
    expect(fmtDuration(61_000)).toBe('1m 1s')
    expect(fmtDuration(0)).toBe('0s')
  })

  it('负值取绝对时长；非法返回 empty', () => {
    expect(fmtDuration(-90_000)).toBe('1m 30s')
    expect(fmtDuration(NaN, { empty: '—' })).toBe('—')
  })

  it('fmtDurationBetween 两端解析求差（事件投递 elapsed 场景）', () => {
    const s = '2026-09-03T16:00:00+00:00'
    const e = '2026-09-03T16:05:30+00:00'
    expect(fmtDurationBetween(s, e)).toBe('5m 30s')
    expect(fmtDurationBetween(s, null, { empty: '—' })).toBe('—')
  })
})

describe('registerShared 注册中心', () => {
  it('挂载 globalThis.cmx 命名空间且幂等', () => {
    expect(globalThis.cmx.datetime).toBeTypeOf('object')
    expect(globalThis.cmx.datetime.fmtDateTime).toBeTypeOf('function')
    const again = registerShared('datetime', { fake: 1 })
    expect(again.fmtDateTime).toBeTypeOf('function') // 重复注册返回既有域
  })
})
