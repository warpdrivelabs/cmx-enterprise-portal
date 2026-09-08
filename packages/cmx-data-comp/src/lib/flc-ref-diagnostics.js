/**
 * flc-ref-diagnostics — 弹性组合「引用类」诊断（overlay / DRN / 跨 DAM），领域无关、纯函数
 *
 * 详见 docs/三元定义统一与跨DAM引用架构方案.html §9。与 flexible-combination-validator.js
 * 的分工：
 *   - validator：结构合法性（字段/维度/公式/分组），不依赖外部定义，恒可跑
 *   - 本模块：引用可解析性（DOC 列在不在、跨 DAM 可见性、物理类型主权），需注入 DOC/注册表解析器
 *
 * 通过依赖注入保持纯函数、可单测、不做 IO：
 *   tableCols(tableName)     -> DOC 某表物理列对象数组（含 fieldSet 展开）；表不存在返回 null
 *   resolveDrn(drn, fromDam) -> { dam, visibility } | null（跨 DAM 引用目标；可选）
 *
 * 诊断码（与设计文档 §9 对齐）：
 *   REF_TABLE_NOT_IN_DOC        error   ref/use 的表不在关联单据中
 *   REF_COLUMN_NOT_IN_TABLE     error   ref 的列不在该表中（单据删了列）
 *   REF_WITHOUT_DOCREF          error   用了 ref/use/pick 但档案没有 docRef
 *   OVER_CHANGES_PHYSICAL_TYPE  error   over 改了 dataType/fieldLength（物理类型是 DOC 主权）
 *   REF_VISIBILITY_DENIED       error   跨 DAM 引用目标可见性不覆盖引用方
 *   OVER_RELAXES_NULLABLE       warning over 把 DOC 非空列设为非必填
 *   REF_DIM_DICT_MISSING        warning DOC 列 refDict 指的字典解析不到
 */
import { fieldId } from './cmx-field-meta.js'
import { parseDrn, normalizeDrn, drnVisibleFrom } from './drn.js'

const PHYSICAL_KEYS = ['dataType', 'fieldLength']

/**
 * 跑引用类诊断。
 * @param {object} combination  弹性组合（overlay 形态，含 rules[].detail.use/pick/over 或 inline）
 * @param {{
 *   tableCols?: (t:string)=>(object[]|null),
 *   hasDoc?: boolean,                              // 是否已关联并加载单据（缺省由 tableCols 推断）
 *   resolveDrn?: (drn:string, from:object)=>({dam:object, visibility:string}|null),
 *   from?: {domain:string, app:string, module:string}  // 引用方所在 DAM（可见性判定用）
 * }} deps
 * @returns {{ valid:boolean, errors:{path,code,message}[], warnings:{path,code,message}[] }}
 */
export function diagnoseReferences (combination, deps = {}) {
  const errors = []
  const warnings = []
  const error = (path, code, message) => errors.push({ path, code, message })
  const warn = (path, code, message) => warnings.push({ path, code, message })

  const rules = Array.isArray(combination?.rules) ? combination.rules : []
  const tableCols = typeof deps.tableCols === 'function' ? deps.tableCols : null
  const hasDoc = deps.hasDoc != null ? !!deps.hasDoc : !!combination?.docRef
  const from = deps.from || damOf(combination?.docRef) || null

  rules.forEach((rule, ri) => {
    const detail = rule?.detail
    if (!detail) return
    const rp = `rules.${ri}.detail`
    const usesOverlay = detail.use != null || Array.isArray(detail.pick)
    if (!usesOverlay) return

    // 用了 overlay 但没有 docRef → 无从解析
    if (!combination?.docRef) {
      error(rp, 'REF_WITHOUT_DOCREF', `规则 ${rule.id || ri} 使用了 ref/use/pick，但档案未引用业务单据(docRef)`)
      return
    }

    const table = detail.table || ''
    const cols = tableCols ? tableCols(table) : null
    // 表不存在（单据里没有这张表）
    if (hasDoc && tableCols && cols == null) {
      error(`${rp}.table`, 'REF_TABLE_NOT_IN_DOC', `关联表 ${table} 不在引用单据中`)
      return
    }
    const colIndex = new Map((cols || []).map((c) => [fieldId(c), c]))

    // use:"*" 的 over 补丁：被补丁的列 id 必须存在
    if ((detail.use === '*' || detail.use === 'all') && detail.over && typeof detail.over === 'object') {
      for (const [colId, over] of Object.entries(detail.over)) {
        const col = colIndex.get(colId)
        if (cols && !col) { error(`${rp}.over.${colId}`, 'REF_COLUMN_NOT_IN_TABLE', `over 的列 ${colId} 不在表 ${table} 中`); continue }
        checkOver(over, col, `${rp}.over.${colId}`, error, warn)
        checkDimDict(col, `${rp}.over.${colId}`, from, deps, warn)
      }
    }

    // pick[]：每个 ref 的列必须存在
    if (Array.isArray(detail.pick)) {
      detail.pick.forEach((p, pi) => {
        if (!p || !p.ref) return
        const { table: pt, column } = splitRef(p.ref, table)
        const pcols = (pt === table) ? cols : (tableCols ? tableCols(pt) : null)
        const pIndex = (pt === table) ? colIndex : new Map((pcols || []).map((c) => [fieldId(c), c]))
        if (tableCols && pcols == null) { error(`${rp}.pick.${pi}`, 'REF_TABLE_NOT_IN_DOC', `pick 引用的表 ${pt} 不在单据中`); return }
        const col = pIndex.get(column)
        if (pcols && !col) { error(`${rp}.pick.${pi}`, 'REF_COLUMN_NOT_IN_TABLE', `pick 的列 ${column} 不在表 ${pt} 中`); return }
        checkOver(p.over, col, `${rp}.pick.${pi}.over`, error, warn)
        checkDimDict(col, `${rp}.pick.${pi}`, from, deps, warn)
      })
    }
  })

  // imports 的跨 DAM 可见性（若声明了 imports + 提供 resolveDrn）
  if (Array.isArray(combination?.imports) && typeof deps.resolveDrn === 'function' && from) {
    combination.imports.forEach((imp, ii) => {
      if (!imp || !imp.drn) return
      let target
      try { target = deps.resolveDrn(imp.drn, from) } catch { target = null }
      if (!target) { error(`imports.${ii}`, 'REF_TARGET_NOT_FOUND', `imports 引用无法解析：${imp.drn}`); return }
      if (!drnVisibleFrom(target.visibility, target.dam, from)) {
        error(`imports.${ii}`, 'REF_VISIBILITY_DENIED', `目标 ${imp.drn} 可见性 ${target.visibility} 不允许被 ${from.domain}/${from.app}/${from.module} 引用`)
      }
    })
  }

  return { valid: errors.length === 0, errors, warnings }
}

/** over 不得改物理类型；把 DOC 非空列放松为非必填 → warn。 */
function checkOver (over, col, path, error, warn) {
  if (!over || typeof over !== 'object') return
  for (const k of PHYSICAL_KEYS) {
    if (over[k] !== undefined && col && over[k] !== col[k]) {
      error(`${path}.${k}`, 'OVER_CHANGES_PHYSICAL_TYPE', `不能在 overlay 中修改物理属性 ${k}（DOC 主权）`)
    }
  }
  // DOC 非空列（nullable:false）被 over 显式设为非必填
  if (col && col.nullable === false && over.edit && over.edit.required === false) {
    warn(`${path}.edit.required`, 'OVER_RELAXES_NULLABLE', `列在单据中为非空(nullable:false)，overlay 将其设为非必填`)
  }
}

/** DOC 维度列引用的字典是否可解析（有 resolveDrn 才查；否则跳过）。 */
function checkDimDict (col, path, from, deps, warn) {
  if (!col || col.dimType !== 'dimension' || !col.refDict) return
  if (typeof deps.resolveDrn !== 'function' || !from) return
  let hit = null
  try {
    const abs = normalizeDrn(parseDrn(col.refDict), { from, kind: 'DCT' })
    hit = deps.resolveDrn(`drn:${abs.domain}/${abs.app}/${abs.module}/DCT/${abs.name}`, from)
  } catch { hit = null }
  if (!hit) warn(`${path}.refDict`, 'REF_DIM_DICT_MISSING', `维度列引用的字典解析不到：${col.refDict}`)
}

function splitRef (ref, defaultTable) {
  const dot = String(ref).lastIndexOf('.')
  if (dot >= 0) return { table: ref.slice(0, dot), column: ref.slice(dot + 1) }
  return { table: defaultTable || null, column: ref }
}

function damOf (docRef) {
  if (!docRef) return null
  const app = docRef.app || docRef.application
  if (!docRef.domain || !app || !docRef.module) return null
  return { domain: docRef.domain, app, module: docRef.module }
}
