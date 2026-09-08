/**
 * drn — Definition Resource Name（跨 DAM 引用标识）解析器（领域无关、纯函数）
 *
 * 详见 docs/三元定义统一与跨DAM引用架构方案.html。把三类元定义（DCT/DOC/FLC）之间
 * 原本"裸 code + 隐式同域同应用同模块"的引用，统一为一个可跨 DAM 定位、可版本化、
 * 可深链到表/列的资源名：
 *
 *   drn:<domain>/<app>/<module>/<kind>/<name>[@<version>][#<table>[.<field>]]
 *
 * 例：
 *   drn:fi/shared-md/masterdata/DCT/cost_center@1        跨应用引用字典
 *   drn:fi/cmxfico/gl/DOC/gl_md_doc_meta#voucher_detail.cashflow_item_id   深链到列
 *
 * 简写（省略段 = 继承"引用方所在 DAM"，兼容既有裸 code）：
 *   cost_center            → 全 DAM 段继承 + kind 由上下文推断
 *   DCT/cost_center        → 当前 DAM 下的 DCT
 *   @cc                    → imports 别名（由 resolveDrn 展开）
 *
 * 主要 API：
 *   parseDrn(input)                       -> 结构化解析（各段缺省为 null；别名单独标记）
 *   normalizeDrn(input, ctx)              -> 补全继承段 + 展开别名 -> 绝对 DRN 对象
 *   formatDrn(abs)                        -> 绝对 DRN 对象 -> 规范字符串
 *   drnToPath(abs, { withVersion })       -> 落盘相对路径 <domain>/<app>/<module>/<kind>/<name>[_v<n>].json
 *   drnVisibleFrom(targetVisibility, targetDam, fromDam) -> 可见性是否放行
 */

/** 支持的定义种类（kind 段取值）。BASE=共享基础字段集（落 base 根）。 */
export const DRN_KINDS = Object.freeze(['DCT', 'DOC', 'FLC', 'BASE'])

/** 可见性等级：由窄到宽。解析期据此判断"目标是否允许被引用方引用"。 */
export const DRN_VISIBILITY = Object.freeze(['private', 'app', 'domain', 'public'])

const DRN_PREFIX = 'drn:'
const SEG_RE = /^[a-zA-Z0-9_-]{1,64}$/
const KIND_SET = new Set(DRN_KINDS)

/** 段合法性：字母/数字/_-，1..64（与 dam/store.rs 的 is_dam_id 一致）。 */
function isSeg (s) { return typeof s === 'string' && SEG_RE.test(s) }

/**
 * 解析 DRN 字符串为结构化对象（不补全、不解析别名）。
 * @param {string} input
 * @returns {{
 *   isAlias: boolean, alias: string|null,
 *   domain: string|null, app: string|null, module: string|null,
 *   kind: string|null, name: string|null, version: number|null,
 *   table: string|null, field: string|null
 * }}
 * @throws {Error} 语法非法
 */
export function parseDrn (input) {
  const out = { isAlias: false, alias: null, domain: null, app: null, module: null, kind: null, name: null, version: null, table: null, field: null }
  if (typeof input !== 'string' || !input.trim()) throw new Error('DRN 不能为空')
  let s = input.trim()

  // 别名：@cc 或 @cc#table[.field]（imports 里声明的引用别名 + 可选深链），由 normalizeDrn 展开
  if (s.startsWith('@')) {
    let aliasPart = s.slice(1)
    const hashAt = aliasPart.indexOf('#')
    if (hashAt >= 0) {
      const frag = aliasPart.slice(hashAt + 1)
      aliasPart = aliasPart.slice(0, hashAt)
      if (!frag) throw new Error(`DRN 深链片段为空：${input}`)
      const dot = frag.indexOf('.')
      if (dot >= 0) {
        out.table = frag.slice(0, dot); out.field = frag.slice(dot + 1)
        if (!isSeg(out.table) || !isSeg(out.field)) throw new Error(`DRN 深链 table.field 非法：${input}`)
      } else {
        out.table = frag
        if (!isSeg(out.table)) throw new Error(`DRN 深链 table 非法：${input}`)
      }
    }
    if (!isSeg(aliasPart)) throw new Error(`DRN 别名非法：${input}`)
    out.isAlias = true
    out.alias = aliasPart
    return out
  }

  const hasPrefix = s.startsWith(DRN_PREFIX)
  if (hasPrefix) s = s.slice(DRN_PREFIX.length)

  // 剥离深链片段 #table[.field]
  const hashAt = s.indexOf('#')
  if (hashAt >= 0) {
    const frag = s.slice(hashAt + 1)
    s = s.slice(0, hashAt)
    if (!frag) throw new Error(`DRN 深链片段为空：${input}`)
    const dot = frag.indexOf('.')
    if (dot >= 0) {
      out.table = frag.slice(0, dot)
      out.field = frag.slice(dot + 1)
      if (!isSeg(out.table) || !isSeg(out.field)) throw new Error(`DRN 深链 table.field 非法：${input}`)
    } else {
      out.table = frag
      if (!isSeg(out.table)) throw new Error(`DRN 深链 table 非法：${input}`)
    }
  }

  // 剥离版本 @version
  const atAt = s.indexOf('@')
  if (atAt >= 0) {
    const ver = s.slice(atAt + 1)
    s = s.slice(0, atAt)
    if (!/^\d+$/.test(ver)) throw new Error(`DRN 版本必须是正整数：${input}`)
    out.version = Number(ver)
  }

  const segs = s.split('/')
  for (const seg of segs) { if (!isSeg(seg)) throw new Error(`DRN 段非法「${seg}」：${input}`) }

  if (hasPrefix) {
    // 带 drn: 前缀 → 必须是完整 5 段 domain/app/module/kind/name
    if (segs.length !== 5) throw new Error(`绝对 DRN 需 5 段(domain/app/module/kind/name)：${input}`)
    ;[out.domain, out.app, out.module, out.kind, out.name] = segs
    if (!KIND_SET.has(out.kind)) throw new Error(`DRN kind 非法「${out.kind}」：${input}`)
    return out
  }

  // 无前缀简写：1 段=name；2 段=kind/name；5 段=完整
  if (segs.length === 1) {
    out.name = segs[0]
  } else if (segs.length === 2) {
    if (!KIND_SET.has(segs[0])) throw new Error(`DRN 两段简写首段须为 kind(${DRN_KINDS.join('/')})：${input}`)
    out.kind = segs[0]; out.name = segs[1]
  } else if (segs.length === 5) {
    ;[out.domain, out.app, out.module, out.kind, out.name] = segs
    if (!KIND_SET.has(out.kind)) throw new Error(`DRN kind 非法「${out.kind}」：${input}`)
  } else {
    throw new Error(`DRN 段数只支持 1/2/5（或带 drn: 前缀的完整式）：${input}`)
  }
  return out
}

/**
 * 归一为绝对 DRN：补全继承段、展开别名。
 * @param {string|object} input  DRN 字符串或 parseDrn 结果
 * @param {{
 *   from?: {domain?:string, app?:string, module?:string},  // 引用方所在 DAM（继承源）
 *   kind?: string,                                          // 缺省 kind 时的默认（如 refDict 场景默认 DCT）
 *   imports?: Array<{alias:string, drn:string}>             // 别名表
 * }} [ctx]
 * @returns {{domain:string, app:string, module:string, kind:string, name:string, version:number|null, table:string|null, field:string|null}}
 * @throws {Error} 无法补全（缺继承源/缺 kind/别名未声明）
 */
export function normalizeDrn (input, ctx = {}) {
  let p = typeof input === 'string' ? parseDrn(input) : input
  const from = ctx.from || {}

  // 别名展开（一层；别名目标本身应为绝对/可补全 DRN）
  if (p.isAlias) {
    const imports = Array.isArray(ctx.imports) ? ctx.imports : []
    const hit = imports.find((x) => x && x.alias === p.alias)
    if (!hit) throw new Error(`DRN 别名未在 imports 声明：@${p.alias}`)
    // 保留别名上的深链片段（@cc#t.f 场景），合并到展开结果
    const frag = { table: p.table, field: p.field }
    p = parseDrn(hit.drn)
    if (frag.table && !p.table) { p.table = frag.table; p.field = frag.field }
  }

  const domain = p.domain || from.domain || null
  const app = p.app || from.app || null
  const module = p.module || from.module || null
  const kind = p.kind || ctx.kind || null
  const name = p.name

  if (!name) throw new Error('DRN 缺少 name')
  if (!kind) throw new Error(`DRN 缺少 kind 且上下文未提供默认：${formatShort(p)}`)
  // BASE 定义落共享 base 根，DAM 段用占位符 base/_/_（与既有 base_*_meta 约定一致）
  if (kind === 'BASE') {
    return { domain: 'base', app: '_', module: '_', kind, name, version: p.version ?? null, table: p.table ?? null, field: p.field ?? null }
  }
  if (!domain || !app || !module) {
    throw new Error(`DRN 无法补全 DAM(domain/app/module)，请提供 from 或写全：${formatShort(p)}`)
  }
  return { domain, app, module, kind, name, version: p.version ?? null, table: p.table ?? null, field: p.field ?? null }
}

function formatShort (p) {
  return [p.domain, p.app, p.module, p.kind, p.name].filter(Boolean).join('/') || p.name || '(空)'
}

/**
 * 绝对 DRN 对象 → 规范字符串（含 drn: 前缀、可选 @version、可选 #table.field）。
 * @param {object} abs normalizeDrn 的结果
 */
export function formatDrn (abs) {
  if (!abs || !abs.domain || !abs.app || !abs.module || !abs.kind || !abs.name) {
    throw new Error('formatDrn 需要完整的绝对 DRN 对象')
  }
  let s = `${DRN_PREFIX}${abs.domain}/${abs.app}/${abs.module}/${abs.kind}/${abs.name}`
  if (abs.version != null) s += `@${abs.version}`
  if (abs.table) s += `#${abs.table}${abs.field ? `.${abs.field}` : ''}`
  return s
}

/**
 * 绝对 DRN → 落盘相对路径。默认不带版本（写默认版本文件）；withVersion 时拼 _v<n>。
 * @param {object} abs
 * @param {{ withVersion?: boolean }} [opts]
 */
export function drnToPath (abs, opts = {}) {
  if (!abs || !abs.domain || !abs.app || !abs.module || !abs.kind || !abs.name) {
    throw new Error('drnToPath 需要完整的绝对 DRN 对象')
  }
  const file = (opts.withVersion && abs.version != null) ? `${abs.name}_v${abs.version}` : abs.name
  return `${abs.domain}/${abs.app}/${abs.module}/${abs.kind}/${file}.json`
}

/** 两个绝对 DRN 是否指向同一定义（忽略版本与深链）。 */
export function sameDefinition (a, b) {
  return !!a && !!b && a.domain === b.domain && a.app === b.app && a.module === b.module && a.kind === b.kind && a.name === b.name
}

/**
 * 可见性判定：目标定义的 visibility 是否允许 fromDam 引用它。
 * @param {string} targetVisibility  private|app|domain|public（缺省按 public 放行，兼容现状）
 * @param {{domain:string, app:string, module:string}} targetDam  被引用定义所在 DAM
 * @param {{domain:string, app:string, module:string}} fromDam     引用方所在 DAM
 * @returns {boolean}
 */
export function drnVisibleFrom (targetVisibility, targetDam, fromDam) {
  const vis = targetVisibility || 'public'
  const t = targetDam || {}, f = fromDam || {}
  switch (vis) {
    case 'private': return t.domain === f.domain && t.app === f.app && t.module === f.module
    case 'app': return t.domain === f.domain && t.app === f.app
    case 'domain': return t.domain === f.domain
    case 'public': return true
    default: return true
  }
}

/**
 * 把 refDict/dictId 引用归一为「有效 dictId」，兼容两种写法（与 Rust effective_dict_id 对端一致）：
 *   - 裸 code（如 `cost_center`）：原样返回，走全局字典注册表按 code 查（向后兼容，无需 from）。
 *   - DRN / 别名（`@cc` / `DCT/x` / `drn:dom/app/mod/DCT/x`）：经 normalizeDrn 展开，取 name 段作为
 *     有效 dictId（字典 schema 按 dictId 全局唯一，故 name 即查找键；DAM 段保留供将来按域查）。
 * 无法归一时退回原值，尽力而为、不阻断。
 * @param {string} raw
 * @param {{from?:object, imports?:Array}} [ctx]
 * @returns {string}
 */
export function effectiveDictId (raw, ctx = {}) {
  const s = String(raw || '').trim()
  if (!s) return s
  // 裸 code 快速路径：不含 DRN 结构标记 → 原样
  if (!s.startsWith('@') && !s.startsWith('drn:') && !s.includes('/')) return s
  try {
    return normalizeDrn(s, { from: ctx.from, kind: 'DCT', imports: ctx.imports }).name
  } catch {
    return s
  }
}
