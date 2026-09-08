/**
 * cmx-tree-data — 纯函数树形数据工具（无 DOM、无渲染依赖，可单测）。
 *
 * cmx-tabulator 的 treegrid 能力借鉴自：
 *   - cmx-web-treeview：扁平行 + parentField（或 path）→ 层级；展开态捕获/恢复
 *   - cmx-combo-box._syncTreePath：按 id+parent 链回溯拼层级
 *   - cmx-revo-grid / CmxDataSet：CmxRowSet.toPlainObject() 取纯数据（剔除 _ 前缀内部属性）
 *
 * Tabulator 6.x 的 `dataTree` 期望每个父节点在 `dataTreeChildField`（默认 `_children`）
 * 下挂一个**子行对象数组**。而 CMX 的 CmxRowSet._children 是 `{ childId: CmxDataSet }`
 * 形态（异构主从），与 treegrid 的同构层级语义不同。因此本模块负责把
 *   ①「扁平行 + parentField」  ②「已嵌套（childField 为数组）」
 * 两种输入归一为 Tabulator 可直接消费的「嵌套数组」结构。
 *
 * 设计约束（[[no-choice-prompts]] 之外的工程约束）：
 *   - 不修改入参：每行浅拷贝后再挂 childField
 *   - 防环：自引用 / 成环的行兜底为根节点，不会无限递归
 *   - 兼容 CmxRowSet：有 toPlainObject() 时调用之取纯字段
 */

/** 取一行的纯数据对象：CmxRowSet → toPlainObject()（剔除 _ 前缀）；普通对象 → 浅拷贝。 */
export function toPlainRow (row) {
  if (row && typeof row.toPlainObject === 'function') return row.toPlainObject()
  return { ...(row || {}) }
}

/**
 * 扁平行（id + parentField）→ 嵌套树数组。
 * 父节点在 childField 下挂子节点数组；无父 / 父不存在 / 自引用 → 根节点；成环 → 兜底为根。
 *
 * @param {Array<object>} rows 扁平行（普通对象或 CmxRowSet）
 * @param {object} [opts]
 * @param {string} [opts.idField='id']           主键字段
 * @param {string} [opts.parentField='parentId'] 父键字段
 * @param {string} [opts.childField='_children'] 输出子数组字段（与 Tabulator dataTreeChildField 一致）
 * @returns {Array<object>} 根节点数组（每个节点为入参行的浅拷贝，含 childField）
 */
export function buildTreeFromFlat (rows, opts = {}) {
  const idField     = opts.idField     || 'id'
  const parentField = opts.parentField || 'parentId'
  const childField  = opts.childField  || '_children'
  if (!Array.isArray(rows) || !rows.length) return []

  const nodes = rows.map(toPlainRow)
  const byId  = new Map()
  for (const n of nodes) byId.set(String(n[idField]), n)

  /** parentKey → 子节点数组（保持入参顺序） */
  const childOf = new Map()
  const isLinked = (n) => {
    const pid = n[parentField]
    const pk  = pid == null ? '' : String(pid)
    const idk = String(n[idField])
    return pk !== '' && pk !== idk && byId.has(pk)
  }
  for (const n of nodes) {
    if (!isLinked(n)) continue
    const pk = String(n[parentField])
    if (!childOf.has(pk)) childOf.set(pk, [])
    childOf.get(pk).push(n)
  }

  const seen = new Set()
  const attach = (n) => {
    const idk = String(n[idField])
    seen.add(idk)
    // 只挂尚未出现在树中的子节点：成环时回边（指向已 seen 的祖先）被丢弃，
    // 保证输出是真正的无环树，下游 walkTree/collectIds 不会栈溢出。
    const kids = (childOf.get(idk) || []).filter((k) => !seen.has(String(k[idField])))
    if (kids.length) {
      n[childField] = kids
      for (const k of kids) attach(k)
    }
  }

  const roots = nodes.filter((n) => !isLinked(n))
  for (const r of roots) attach(r)
  // 成环节点永远不会成为根、也不会被 attach 到 → 兜底挂为根，避免数据丢失
  for (const n of nodes) {
    if (!seen.has(String(n[idField]))) { roots.push(n); attach(n) }
  }
  return roots
}

/**
 * 归一化树数据：智能识别输入形态，输出 Tabulator 可消费的嵌套数组。
 *   - 行带 parentField 链接且未预嵌套 → buildTreeFromFlat 重建层级
 *   - 行已带数组 childField（预嵌套）   → 原样（浅拷贝）透传
 *   - 都没有                          → 全部视为根（扁平列表）
 *
 * @param {Array<object>} rows
 * @param {object} [opts] 同 buildTreeFromFlat
 * @returns {Array<object>}
 */
export function normalizeTreeData (rows, opts = {}) {
  const childField  = opts.childField  || '_children'
  const parentField = opts.parentField || 'parentId'
  if (!Array.isArray(rows) || !rows.length) return []

  const plain = rows.map(toPlainRow)
  const hasNested = plain.some((r) => Array.isArray(r[childField]) && r[childField].length)
  const hasParentLinks = plain.some((r) => r[parentField] != null && r[parentField] !== '')

  if (hasParentLinks && !hasNested) return buildTreeFromFlat(plain, opts)
  return plain
}

/**
 * 前序深度优先遍历嵌套树。
 * @param {Array<object>} nodes
 * @param {(node:object, depth:number, parent:object|null)=>void} fn
 * @param {object} [opts] { childField='_children' }
 */
export function walkTree (nodes, fn, opts = {}) {
  const childField = opts.childField || '_children'
  const visit = (list, depth, parent) => {
    if (!Array.isArray(list)) return
    for (const n of list) {
      fn(n, depth, parent)
      const kids = n[childField]
      if (Array.isArray(kids) && kids.length) visit(kids, depth + 1, n)
    }
  }
  visit(nodes, 0, null)
}

/**
 * 嵌套树 → 扁平行（buildTreeFromFlat 的逆运算）。
 * 给每行写回 parentField（根节点为 null），并剔除 childField。
 * @param {Array<object>} nodes
 * @param {object} [opts] { idField='id', parentField='parentId', childField='_children' }
 * @returns {Array<object>} 扁平行数组（深度优先顺序）
 */
export function flattenTree (nodes, opts = {}) {
  const idField     = opts.idField     || 'id'
  const parentField = opts.parentField || 'parentId'
  const childField  = opts.childField  || '_children'
  const out = []
  walkTree(nodes, (node, _depth, parent) => {
    const { [childField]: _kids, ...rest } = node
    rest[parentField] = parent ? parent[idField] : null
    out.push(rest)
  }, { childField })
  return out
}

/**
 * 收集树中所有节点 id（深度优先）。
 * @param {Array<object>} nodes
 * @param {object} [opts] { idField='id', childField='_children' }
 * @returns {Array<*>}
 */
export function collectIds (nodes, opts = {}) {
  const idField = opts.idField || 'id'
  const ids = []
  walkTree(nodes, (n) => ids.push(n[idField]), opts)
  return ids
}
