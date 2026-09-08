/**
 * flc-overlay — 弹性组合（FLC）overlay 编译器（领域无关、纯函数）
 *
 * 详见 docs/flexible-combination-overlay-design.md。把 FLC 的「引用 DOC 列 + 只写增量」
 * 形态，在编译期展开成今天引擎吃的那套 `rule.detail.fields`（inline 字段），从而：
 *   - 消除 account.json 里对 voucher_detail 的逐列深拷贝（单一事实源）
 *   - 单据改了，FLC 自动跟随（读时展开）
 *
 * 三种取列入口（rule.detail 上三选一或组合）：
 *   use:"*"                  采用关联表全部物理列，配 over:{colId:{…}} 打补丁
 *   pick:[{ref,as,over}]     只挑列出的列（顺序即声明顺序）
 *   fields:[…]               现状 inline（纯 FLC 逻辑列，无 DOC 对应）——恒等直通
 *
 * 合并语义（deepMerge，DCT字典 → DOC列 → FLC增量 依次叠加，后者优先）：
 *   标量 → 覆盖；对象 → 递归深合并；数组 → 默认替换
 *   over 里键值为 null → 删除该键
 *   键名后缀 '+'（如 "validations+"）→ 数组追加而非替换
 *
 * 主要 API：
 *   deepMerge(base, over)                              -> 合并结果（不改入参）
 *   expandRuleDetail(detail, { tableCols, dictOf })    -> { fields, groups? }（inline 形态）
 *   expandCombination(combination, { docResolver, dictResolver }) -> combination'（所有规则展开）
 *
 * 注入依赖（保持领域无关、可单测，不在此模块做 IO）：
 *   tableCols(tableName)  -> 该表全部物理列对象数组（含 fieldSet 展开），供 use:"*" 与 ref 解析
 *   dictOf(dictCode)      -> 该字典的取数配置对象（可选），叠在列之下作为 base
 */
import { fieldId } from './cmx-field-meta.js'
import { deepClone as clone } from './cmx-deep-clone.js'

/** 是否纯对象（可深合并）。数组、null、类实例不算。 */
function isPlainObject (v) {
  return v != null && typeof v === 'object' && !Array.isArray(v) &&
    (v.constructor === Object || v.constructor == null)
}

/**
 * 确定性深合并。over 覆盖 base。
 *   - 标量 / 数组：over 覆盖（数组默认整体替换）
 *   - 纯对象：递归
 *   - over[key] === null：删除该键（返回结果里不含）
 *   - over 键名以 '+' 结尾：对应 base 数组的**追加**（base[key] ++ over[key+]）
 * 不修改任何入参。
 */
export function deepMerge (base, over) {
  if (over === undefined) return clone(base)
  if (!isPlainObject(base) || !isPlainObject(over)) {
    // 非对象层：over 直接决定（null 在对象层处理，这里 null 也表示"值为空"）
    return clone(over)
  }
  const out = {}
  // 先铺 base
  for (const [k, v] of Object.entries(base)) out[k] = clone(v)
  // 再叠 over
  for (const [k, v] of Object.entries(over)) {
    if (k.endsWith('+')) {
      // 数组追加语义：validations+ → 追加到 validations
      const target = k.slice(0, -1)
      const baseArr = Array.isArray(out[target]) ? out[target] : []
      const addArr = Array.isArray(v) ? v : [v]
      out[target] = [...baseArr.map(clone), ...addArr.map(clone)]
      continue
    }
    if (v === null) { delete out[k]; continue }          // 删除语义
    if (isPlainObject(v) && isPlainObject(out[k])) {
      out[k] = deepMerge(out[k], v)                       // 递归深合并
    } else {
      out[k] = clone(v)                                   // 覆盖（标量/数组/新键）
    }
  }
  return out
}

/**
 * 解析一个 ref 字段 → inline 字段对象。
 * base = dictOf(col.refDict) ⊕ col ⊕ over；id = as || col.id。
 * @param {{ref:string, over?:object, as?:string}} refField
 * @param {{ tableCols:(t:string)=>object[], dictOf?:(c:string)=>object, defaultTable?:string }} deps
 * @returns {object|null}  找不到列返回 null（悬空引用，由上层诊断）
 */
export function expandRefField (refField, deps) {
  const { table, column } = splitRef(refField.ref, deps.defaultTable)
  if (!table || !column) return null
  const cols = deps.tableCols(table) || []
  const col = cols.find((c) => fieldId(c) === column)
  if (!col) return null

  let base = clone(col)
  // DOC 非空列（nullable:false）⇒ 默认必填，与既有 _docColumnToField 语义一致；
  // 置于 over 之前，作者仍可用 over.edit.required:false 显式放松（触发 OVER_RELAXES_NULLABLE 诊断）。
  if (col.nullable === false) {
    base.edit = { ...(base.edit && typeof base.edit === 'object' ? base.edit : {}), required: true }
  }
  // 字典取数配置叠在列之下（列覆盖字典），供维度列继承下拉行为
  const dictCode = col.refDict
  if (dictCode && typeof deps.dictOf === 'function') {
    const dict = deps.dictOf(dictCode)
    if (dict) base = deepMerge({ dict: clone(dict) }, base)
  }
  const merged = refField.over ? deepMerge(base, refField.over) : base
  // as 改逻辑名：同时更新 id / name（caption 若 over 未给则保留 DOC 列标题）
  if (refField.as) { merged.id = refField.as; merged.name = refField.as }
  else { merged.id = fieldId(col); if (merged.name == null) merged.name = merged.id }
  return merged
}

/** 拆 "table.column" / "column"（后者用 defaultTable）；支持 DRN 深链片段已在上层剥离。 */
function splitRef (ref, defaultTable) {
  if (typeof ref !== 'string' || !ref) return { table: null, column: null }
  const dot = ref.lastIndexOf('.')
  if (dot >= 0) return { table: ref.slice(0, dot), column: ref.slice(dot + 1) }
  return { table: defaultTable || null, column: ref }
}

/**
 * 展开一条规则的 detail（use/pick/fields 三入口 → inline fields）。
 * @param {object} detail  rule.detail
 * @param {{ tableCols:(t:string)=>object[], dictOf?:(c:string)=>object }} deps
 * @returns {{ fields:object[], groups?:object[], danglingRefs:string[] }}
 */
export function expandRuleDetail (detail, deps) {
  const table = detail?.table || ''
  const d = { ...deps, defaultTable: table }
  const out = []
  const dangling = []

  // use:"*" —— 采用关联表全部物理列，over:{colId:{…}} 打补丁
  if (detail?.use === '*' || detail?.use === 'all') {
    const cols = (deps.tableCols(table) || [])
    const overMap = isPlainObject(detail.over) ? detail.over : {}
    for (const col of cols) {
      const id = fieldId(col)
      const f = expandRefField({ ref: `${table}.${id}`, over: overMap[id] }, d)
      if (f) out.push(f); else dangling.push(`${table}.${id}`)
    }
  }

  // pick:[{ref,as,over}] —— 只挑列出的列
  if (Array.isArray(detail?.pick)) {
    for (const p of detail.pick) {
      if (!p || !p.ref) continue
      const f = expandRefField(p, d)
      if (f) out.push(f); else dangling.push(p.ref)
    }
  }

  // fields:[…] —— 现状 inline，恒等直通（含纯逻辑列 / 旧档案）
  if (Array.isArray(detail?.fields)) {
    for (const f of detail.fields) out.push(clone(f))
  }

  const res = { fields: out, danglingRefs: dangling }
  if (Array.isArray(detail?.groups)) res.groups = clone(detail.groups)
  return res
}

/**
 * 展开整份 combination 的所有规则（读时展开）。返回新对象，不改入参。
 * 各规则 detail 被替换为纯 inline 形态；引擎/校验/grid 无感知。
 *
 * @param {object} combination
 * @param {{
 *   docResolver?: (docRef:object) => ({ tableCols:(t)=>object[] } | null),
 *   dictOf?: (dictCode:string) => object
 * }} deps
 * @returns {{ combination: object, danglingRefs: string[] }}
 */
export function expandCombination (combination, deps = {}) {
  const cmb = clone(combination) || {}
  const rules = Array.isArray(cmb.rules) ? cmb.rules : []
  const docHandle = typeof deps.docResolver === 'function' ? deps.docResolver(cmb.docRef) : null
  const tableCols = docHandle && typeof docHandle.tableCols === 'function'
    ? docHandle.tableCols
    : () => []
  const dictOf = typeof deps.dictOf === 'function' ? deps.dictOf : undefined

  const allDangling = []
  for (const rule of rules) {
    if (!rule || !rule.detail) continue
    // 已是纯 inline（无 use/pick）且无需字典叠加 → 快速跳过，保持恒等
    const hasOverlay = rule.detail.use != null || Array.isArray(rule.detail.pick)
    if (!hasOverlay) continue
    const { fields, groups, danglingRefs } = expandRuleDetail(rule.detail, { tableCols, dictOf })
    const nextDetail = { ...rule.detail }
    delete nextDetail.use
    delete nextDetail.pick
    delete nextDetail.over
    nextDetail.fields = fields
    if (groups) nextDetail.groups = groups
    rule.detail = nextDetail
    for (const r of danglingRefs) allDangling.push(`${rule.id || '?'}: ${r}`)
  }
  return { combination: cmb, danglingRefs: allDangling }
}
