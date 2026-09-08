/**
 * cmx-doc-query — 通用单据「筛选/排序/分页 UI 状态 ↔ DocQuery JSON」纯函数助手。
 *
 * 后端 /api/doc/data/* 的 POST body 是 DocQuery：
 *   { depth?, includeSiblings?, layers: { <层id>: LayerQuery } }
 *   LayerQuery = { filter?, orderBy?:[!col|col], limit?, offset?, cursor? }
 *   filter = 过滤树 JSON：{ col:{ $op:val,... }, $or:[...], $and:[...] }
 *
 * 本模块把前端可视 UI 状态（每层若干条件行 + 排序 + 分页）互转为 DocQuery，
 * 并按元数据（/api/doc/meta 的列 dataType）校验列名与算子。**零单据专属**：
 * 列/算子全部由元数据驱动，任意 L1..LN 单据通用。
 */

/** 全部支持算子（与后端 query.rs 的 Op 对齐）。value 形态标注供 UI 决定输入控件。 */
export const OPERATORS = [
  { op: '$eq', label: '等于', arity: 'one' },
  { op: '$ne', label: '不等于', arity: 'one' },
  { op: '$gt', label: '大于', arity: 'one' },
  { op: '$gte', label: '大于等于', arity: 'one' },
  { op: '$lt', label: '小于', arity: 'one' },
  { op: '$lte', label: '小于等于', arity: 'one' },
  { op: '$in', label: '属于', arity: 'many' },
  { op: '$notIn', label: '不属于', arity: 'many' },
  { op: '$contains', label: '包含', arity: 'one' },
  { op: '$startsWith', label: '开头是', arity: 'one' },
  { op: '$endsWith', label: '结尾是', arity: 'one' },
  { op: '$ilike', label: '模糊(忽略大小写)', arity: 'one' },
  { op: '$null', label: '为空/非空', arity: 'bool' },
]

const OP_SET = new Set(OPERATORS.map((o) => o.op))

/** 数值类 dataType（决定 UI 用数字输入 + 值转数字）。 */
const NUMERIC = new Set(['INT', 'INTEGER', 'BIGINT', 'TINYINT', 'SMALLINT', 'DECIMAL', 'NUMERIC', 'FLOAT', 'DOUBLE', 'REAL'])

/** 某 dataType 适用的算子（文本给 contains/like，数值/日期给比较，其它通用）。 */
export function opsForType (dataType) {
  const dt = String(dataType || '').toUpperCase()
  if (NUMERIC.has(dt) || dt === 'DATE' || dt.startsWith('DATE') || dt.startsWith('TIME')) {
    return OPERATORS.filter((o) => ['$eq', '$ne', '$gt', '$gte', '$lt', '$lte', '$in', '$notIn', '$null'].includes(o.op))
  }
  if (dt === 'BOOL' || dt === 'BOOLEAN') {
    return OPERATORS.filter((o) => ['$eq', '$ne', '$null'].includes(o.op))
  }
  // 文本 / 其它
  return OPERATORS.filter((o) => ['$eq', '$ne', '$in', '$notIn', '$contains', '$startsWith', '$endsWith', '$ilike', '$null'].includes(o.op))
}

/** 按列 dataType 把 UI 字符串值转成正确 JSON 值（数字→number，bool→boolean）。 */
export function coerceValue (dataType, raw) {
  const dt = String(dataType || '').toUpperCase()
  if (raw == null || raw === '') return raw
  if (NUMERIC.has(dt)) {
    const n = Number(raw)
    return Number.isNaN(n) ? raw : n
  }
  if (dt === 'BOOL' || dt === 'BOOLEAN') {
    return raw === true || raw === 'true' || raw === '1' || raw === 1
  }
  return raw
}

/**
 * 把「一层的条件行数组」组装成该层 filter JSON。
 * conds: [{ col, op, value }]（value：$in/$notIn 为数组，$null 为 bool，其余标量）。
 * columns: 该层列元数据（[{name,dataType}]），用于类型转换 + 列白名单。
 * 同列多算子自动 AND（合进同列对象）。
 * @returns {object|undefined} filter JSON（无条件时 undefined）
 */
export function buildLayerFilter (conds, columns) {
  const byName = new Map((columns || []).map((c) => [c.name, c]))
  const out = {}
  for (const c of (conds || [])) {
    if (!c || !c.col || !c.op) continue
    const col = byName.get(c.col)
    if (!col) throw new Error(`列 ${c.col} 不在该层`)
    if (!OP_SET.has(c.op)) throw new Error(`不支持的算子 ${c.op}`)
    const meta = OPERATORS.find((o) => o.op === c.op)
    let v
    if (meta.arity === 'bool') {
      v = c.value === true || c.value === 'true'
    } else if (meta.arity === 'many') {
      const arr = Array.isArray(c.value) ? c.value : String(c.value ?? '').split(',').map((s) => s.trim()).filter(Boolean)
      v = arr.map((x) => coerceValue(col.dataType, x))
    } else {
      v = coerceValue(col.dataType, c.value)
    }
    if (!out[c.col]) out[c.col] = {}
    out[c.col][c.op] = v
  }
  return Object.keys(out).length ? out : undefined
}

/** 排序状态 [{col, desc}] → orderBy 字符串数组（"!col"=desc）。 */
export function buildOrderBy (sorts) {
  return (sorts || []).filter((s) => s && s.col).map((s) => (s.desc ? '!' : '') + s.col)
}

/**
 * 组装完整 DocQuery。
 * @param {object} perLayer  { <层id>: { conds?, columns?, sorts?, limit?, offset?, cursor? } }
 * @param {object} [opts]    { depth?, includeSiblings? }
 * @returns {object} DocQuery JSON（可直接作 loadDocData 的 def.query）
 */
export function buildDocQuery (perLayer, opts = {}) {
  const layers = {}
  for (const [lid, st] of Object.entries(perLayer || {})) {
    const lq = {}
    const filter = buildLayerFilter(st.conds, st.columns)
    if (filter) lq.filter = filter
    const ob = buildOrderBy(st.sorts)
    if (ob.length) lq.orderBy = ob
    if (st.limit != null) lq.limit = st.limit
    if (st.offset != null) lq.offset = st.offset
    if (st.cursor) lq.cursor = st.cursor
    if (Object.keys(lq).length) layers[lid] = lq
  }
  const dq = {}
  if (opts.depth != null) dq.depth = opts.depth
  if (opts.includeSiblings != null) dq.includeSiblings = opts.includeSiblings
  if (Object.keys(layers).length) dq.layers = layers
  return dq
}

/** base64 编码游标（与后端 Cursor wire 对齐：{vals,id}）。前端一般用后端回带值，这里备用。 */
export function encodeCursor (vals, id) {
  const json = JSON.stringify({ vals: vals || [], id })
  return btoa(unescape(encodeURIComponent(json)))
}
