/**
 * cmx-doc-meta-loader — 通用业务单据「显示元数据 → CmxMasterSlave schema / 列模型」构建助手。
 *
 * 输入是 `/api/doc/meta` 返回的元数据（层序 L1..LN + 各层列 caption/类型 + 父子关系），
 * 输出通用单据前端页动态建表所需的三样东西：
 *   ① buildMasterSlaveSchema(meta) → 任意 N 层递归 schema（喂 new CmxMasterSlave({schema})）
 *   ② layerPaths(meta)            → 各层的点式 path（cv_batch / cv_batch.cv_header / ...）+ 显示名 + 列
 *   ③ buildColumnModel(C, path, columns) → 一层的 CmxColumnModel（列头 caption/类型/宽度来自元数据）
 *
 * 纯函数、零业务假设：不认识「凭证」，只认识「层 + 列 + 父子关系」。换任何 L1..LN 单据定义即可用。
 * 注意：与既有 cmx-doc-meta.js（CmxDOCMeta 元模型类）无关，本文件专供通用装载页动态建表。
 */

/** 系统/技术列（base 字段集里的通用列）——默认排到显示末尾，避免淹没业务列。可按需调整。 */
export const SYSTEM_COLS = new Set([
  'id', 'upper_id', 'line_no',
  'create_by', 'create_time', 'update_by', 'update_time', 'delete_flag',
  'client_code',
])

/** 字典表（DCT）的系统/技术列——来自 base_dct_meta 的 fieldSets（分级物化/审计/范围/系统标记）。
 *  DCT 自动生成列时排到末尾或隐藏，避免淹没业务列。与单据的 SYSTEM_COLS 不同（字典无 upper_id/line_no）。
 *  注意：sort_no/status/parent_id/parent_code 已移出——它们是业务列（用户需维护），不再归为系统列。
 *  派生层级字段（full_path/level_no/is_leaf）保留在此集合中用于排序沉底，增强路径会额外设 visible:false。 */
export const DCT_SYSTEM_COLS = new Set([
  'id',
  'full_path', 'level_no', 'is_leaf',
  'scope_type', 'entity_id', 'is_system',
  'create_by', 'create_time', 'update_by', 'update_time',
])

/** 物理 dataType → grid 列宽（粗略默认；调用方可再覆盖）。 */
export function defaultWidth (dataType, name) {
  const dt = String(dataType || '').toUpperCase()
  if (name === 'id' || name === 'upper_id') return '90px'
  if (name === 'line_no') return '60px'
  if (dt === 'DATE') return '110px'
  if (dt === 'DATETIME' || dt === 'TIMESTAMP' || dt === 'TIMESTAMPTZ') return '160px'
  if (dt === 'DECIMAL' || dt === 'NUMERIC') return '120px'
  if (dt === 'INT' || dt === 'BIGINT' || dt === 'SMALLINT') return '90px'
  return '130px'
}

/** 数值类 dataType 靠右。 */
function alignFor (dataType) {
  const dt = String(dataType || '').toUpperCase()
  return (['INT', 'BIGINT', 'SMALLINT', 'TINYINT', 'DECIMAL', 'NUMERIC', 'FLOAT', 'DOUBLE'].includes(dt)) ? 'right' : 'left'
}

/**
 * 从元数据建 CmxMasterSlave schema（任意 N 层）。
 *
 * **关键**：单据定义里 `relations` 的 parent/child 用的是「逻辑名」（如 headers/account_lines），
 * 与层 id（cv_header/cv_acc_line）**并不一致**——这与后端 DocLoader 的约定一致（见 loader.rs：
 * 「不按 relations 名字匹配层，而按 layer_order 相邻层推导父子」）。因此这里同样**按 layerOrder
 * 相邻层建父子链**（L1→L2→...→Ln 线性主从），不依赖 relations 的名字。relations 仅用于取 childKey。
 *
 * @param {{layers:Array, relations:Array, layerOrder?:Array}} meta
 * @returns {Array<{id:string, children:Array}>} 单根链式 schema
 */
export function buildMasterSlaveSchema (meta) {
  const layerIds = ((meta && meta.layers) || []).map((l) => l.id)
  const order = (meta && meta.layerOrder && meta.layerOrder.length) ? meta.layerOrder.slice() : layerIds
  if (!order.length) return []
  // 按 layer_order 相邻层建线性父子链（与后端 DocLoader 下钻同构）
  // 自底向上组装：最后一层无子，逐级往上包。
  let node = null
  for (let i = order.length - 1; i >= 0; i--) {
    node = { id: order[i], children: node ? [node] : [] }
  }
  return [node]
}

/**
 * 展平出各层的点式 path（供 bindTable / setColumnModel 用）+ 显示名 + 列。
 * 深度优先，父在前。path = 从根到本层的 id 用 "." 连接。
 * @returns {Array<{layerId:string, path:string, level:string, levelName:string, columns:Array}>}
 */
export function layerPaths (meta) {
  const schema = buildMasterSlaveSchema(meta)
  const byId = new Map(((meta && meta.layers) || []).map((l) => [l.id, l]))
  const out = []
  const walk = (nodes, parentPath) => {
    for (const n of nodes) {
      const path = parentPath ? `${parentPath}.${n.id}` : n.id
      const layer = byId.get(n.id) || {}
      out.push({
        layerId: n.id,
        path,
        level: layer.level || '',
        levelName: layer.levelName || layer.level || n.id,
        columns: layer.columns || [],
      })
      if (n.children && n.children.length) walk(n.children, path)
    }
  }
  walk(schema, '')
  return out
}

/**
 * 排列一层的显示列：业务列在前、系统/技术列在后（各自保持元数据顺序）。
 * @param {Array} columns meta 层的 columns
 * @param {Set<string>} [sysSet=SYSTEM_COLS] 系统/技术列集合（DCT 自动列传 DCT_SYSTEM_COLS）
 */
export function orderColumns (columns, sysSet = SYSTEM_COLS, respectOrder = false) {
  // respectOrder=true 时尊重传入顺序（不把系统/技术列沉底），用于「元模型引用 + table.fieldSetOrder」
  // 路径——列序已由 fieldSetOrder 在 _buildFieldRefs 按"分组顺序"排定，此处不再二次重排。
  if (respectOrder) return (columns || []).slice()
  const biz = []
  const sys = []
  for (const c of (columns || [])) (sysSet.has(c.name) ? sys : biz).push(c)
  return biz.concat(sys)
}

/**
 * 用一层的列元数据建 CmxColumnModel（列头 caption、类型、宽度、对齐来自元数据）。
 * @param {object} C   globalThis.__cmxDataComp（提供 CmxColumn / CmxColumnModel）
 * @param {string} path 该层点式 path（= datasetId）
 * @param {Array} columns meta 层的 columns（[{name,caption,dataType,dimType,isPrimaryKey}]）
 * @param {object} [opts] { includeSystem?:boolean 是否显示系统列, order?:boolean 是否业务列前置 }
 */
export function buildColumnModel (C, path, columns, opts = {}) {
  const includeSystem = opts.includeSystem !== false // 默认包含（只是排后）
  let cols = opts.order === false ? (columns || []) : orderColumns(columns)
  if (!includeSystem) cols = cols.filter((c) => !SYSTEM_COLS.has(c.name))
  const members = cols.map((c) => new C.CmxColumn({
    id: c.name,
    caption: c.caption || c.name,
    dataType: c.dataType || 'VARCHAR',
    width: defaultWidth(c.dataType, c.name),
    align: alignFor(c.dataType),
    // 主键 / 系统列只读（业务上通常不直接编辑主键与审计列）
    editMode: (c.isPrimaryKey || SYSTEM_COLS.has(c.name)) ? 'readonly' : undefined,
  }))
  return new C.CmxColumnModel({ datasetId: path, members })
}
