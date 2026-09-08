/**
 * cmx-column-presets — 列函数预设注册表
 *
 * 替代 cmx-ui5-table / cmx-ui5-form 列定义中直接接收 function（onChange / formatter / display），
 * 改为接收声明式 { preset, args }，便于 JSON 序列化、Designer 可视化配置、零代码出码。
 *
 * 两种角色：
 *   - change(apply): 副作用（写回 row 同行其他字段）
 *       apply(row, ctx) -> void
 *       ctx = { args, value, key, table?, form? }
 *
 *   - format(format): 把值/行映射成显示文本
 *       format(row, ctx) -> any
 *       ctx = { args, value, key, table?, form? }
 *
 * 一个预设可以同时拥有 apply 和 format（列上两处都能引用）。
 *
 * API：
 *   registerColumnPreset(name, def)
 *   getColumnPreset(name)
 *   listColumnPresets()
 *   invokePreset(spec, kind, row, ctx)   // kind: 'apply' | 'format'
 *   resolveSpec(spec)                    // 把 {preset,args}/function 都规整成可执行函数
 */

import { evalFormula } from './formula-eval.js'

const REGISTRY = new Map()

export function registerColumnPreset(name, def) {
  if (!name || typeof name !== 'string') throw new Error('[preset] name required')
  if (!def || (typeof def.apply !== 'function' && typeof def.format !== 'function')) {
    throw new Error('[preset] def must define apply or format')
  }
  REGISTRY.set(name, def)
}

export function getColumnPreset(name) { return REGISTRY.get(name) || null }

export function listColumnPresets() {
  return Array.from(REGISTRY.entries()).map(([name, def]) => ({
    name,
    hasApply: typeof def.apply === 'function',
    hasFormat: typeof def.format === 'function',
    description: def.description || '',
  }))
}

/**
 * 触发预设；spec 可以是：
 *   - function：直接调用（兼容老 API）
 *   - { preset, args }：查注册表 + 调对应 kind 实现
 *   - 其他：忽略
 */
export function invokePreset(spec, kind, row, ctx = {}) {
  if (!spec) return undefined
  if (typeof spec === 'function') {
    if (kind === 'apply')  return spec(row, ctx.value, ctx)
    if (kind === 'format') return spec(ctx.value, row)
    return undefined
  }
  if (typeof spec === 'object' && spec.preset) {
    const def = REGISTRY.get(spec.preset)
    if (!def) {
      console.warn(`[cmx-preset] unknown preset "${spec.preset}"`)
      return undefined
    }
    const fullCtx = { ...ctx, args: spec.args || {} }
    if (kind === 'apply'  && typeof def.apply  === 'function') return def.apply(row, fullCtx)
    if (kind === 'format' && typeof def.format === 'function') return def.format(row, fullCtx)
  }
  return undefined
}

// ─── 内置预设 ─────────────────────────────────────────────────────────────

/** multiply: row[target] = ∏ row[srcKey] */
registerColumnPreset('multiply', {
  description: '把若干字段相乘写到 target',
  apply: (row, { args }) => {
    const sources = args.sources || args.source || []
    const target  = args.target
    if (!target) return
    let v = 1
    for (const k of sources) v *= (Number(row[k]) || 0)
    row[target] = args.decimals != null ? Number(v.toFixed(args.decimals)) : v
  },
})

/** divide: row[target] = row[a] / row[b] */
registerColumnPreset('divide', {
  description: '两字段相除写到 target',
  apply: (row, { args }) => {
    const num = Number(row[args.numerator]) || 0
    const den = Number(row[args.denominator]) || 0
    if (!args.target) return
    row[args.target] = den === 0 ? 0 : (args.decimals != null ? Number((num / den).toFixed(args.decimals)) : (num / den))
  },
})

/** sum: row[target] = Σ row[srcKey] */
registerColumnPreset('sum', {
  description: '把若干字段相加写到 target',
  apply: (row, { args }) => {
    const sources = args.sources || []
    if (!args.target) return
    let v = 0
    for (const k of sources) v += (Number(row[k]) || 0)
    row[args.target] = args.decimals != null ? Number(v.toFixed(args.decimals)) : v
  },
})

/** concat: 拼接行内若干字段做显示 */
registerColumnPreset('concat', {
  description: '将若干字段以 sep 连接（用作 formatter / display）',
  format: (row, { args }) => {
    const fields = args.fields || []
    const sep = args.sep ?? ' '
    return fields.map((k) => row?.[k] ?? '').filter((v) => v !== '' && v != null).join(sep)
  },
})

/** format-number: 数值格式化 */
registerColumnPreset('format-number', {
  description: '数值按 decimals / thousand / prefix / suffix 格式化；zeroBlank=0 显示空；absolute=去负号',
  format: (_row, { args, value }) => {
    if (value == null || value === '') return ''
    const n = Number(value)
    if (!Number.isFinite(n)) return String(value)
    if (args.zeroBlank && n === 0) return ''
    const decimals = args.decimals ?? 2
    const num = args.absolute ? Math.abs(n) : n
    let s = num.toFixed(decimals)
    if (args.thousand) {
      const neg = s.startsWith('-')
      const body = neg ? s.slice(1) : s
      const [intPart, decPart] = body.split('.')
      s = (neg ? '-' : '') + intPart.replace(/\B(?=(\d{3})+(?!\d))/g, args.thousand) + (decPart ? '.' + decPart : '')
    }
    return `${args.prefix || ''}${s}${args.suffix || ''}`
  },
})

/** format-date: 日期格式化（只支持简单 yyyy-MM-dd / yyyy/MM/dd） */
registerColumnPreset('format-date', {
  description: '日期按 pattern 格式化',
  format: (_row, { args, value }) => {
    if (!value) return ''
    const d = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(d.getTime())) return String(value)
    const pat = args.pattern || 'yyyy-MM-dd'
    const pad = (n) => String(n).padStart(2, '0')
    return pat
      .replace('yyyy', d.getFullYear())
      .replace('MM', pad(d.getMonth() + 1))
      .replace('dd', pad(d.getDate()))
      .replace('HH', pad(d.getHours()))
      .replace('mm', pad(d.getMinutes()))
      .replace('ss', pad(d.getSeconds()))
  },
})

/** lookup: 把 row[args.from] 当作字典 key 在 args.dict 数组里查 row, 返回 row[args.field] */
registerColumnPreset('lookup', {
  description: '在内置字典数组里按 from 字段查 row 并返回 field',
  format: (row, { args }) => {
    const dict = args.dict || []
    const keyField = args.keyField || 'code'
    const it = dict.find((x) => String(x[keyField]) === String(row?.[args.from]))
    return it ? (it[args.field] ?? '') : ''
  },
})

/** copy: row[target] = row[source] */
registerColumnPreset('copy', {
  description: '把 source 字段的值复制到 target',
  apply: (row, { args }) => {
    if (!args.target || !args.source) return
    row[args.target] = row[args.source]
  },
})

/** formula-eval: row[target] = 表达式求值（细分元模型的 computed measure 声明式入口） */
registerColumnPreset('formula-eval', {
  description: '按 expr 表达式（可引用同行字段）求值写到 target；可选 decimals 四舍五入',
  apply: (row, { args }) => {
    if (!args.target || !args.expr) return
    let v = evalFormula(args.expr, row, 0)
    if (typeof v === 'number' && args.decimals != null) {
      const p = Math.pow(10, args.decimals); v = Math.round(v * p) / p
    }
    row[args.target] = v
  },
})

/** rule-validate: 校验同行字段，返回首条未通过的提示（''=全部通过），用作 validateFormula / 显示 */
registerColumnPreset('rule-validate', {
  description: 'rules:[{expr,message}]，逐条 evalFormula；返回首条 false 的 message，全通过返回空串',
  format: (row, { args }) => {
    for (const r of (args.rules || [])) {
      const ok = evalFormula(r.expr, row, true)
      if (!ok) return r.message || '校验未通过'
    }
    return ''
  },
})
