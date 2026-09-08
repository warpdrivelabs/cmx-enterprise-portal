import { CmxDataSet } from './cmx-data-set.js'
import { invokePreset } from './cmx-column-presets.js'

/**
 * CmxMasterSlave — 主从多表数据协调器
 *
 * 职责：
 *   - 持有递归主从数据树（每个 row 可挂 _children: { tableId: CmxDataSet }）
 *   - 把表单/表格视图（cmx-ui5-form / cmx-revo-grid 等）按 path 注册进来
 *   - 管理每个 path 的"当前选中行"，cmx-ui5-table 选中变化时级联刷新下级 view
 *   - 监听 cmx-cell-changed / cmx-ui5-form-changed / cmx-row-added / cmx-row-removed，
 *     运行受影响的聚合规则并回写目标字段
 *   - 接受嵌套树 setData(tree) 或平铺多表 setFlatData({tableId: rows[]}) + defineRelation
 *
 * 业务无感：所有 schema/path/字段名都由调用方决定，协调器不感知任何业务术语。
 *
 * 聚合语义（重要）：
 *   - rule.to 是 single：source 收集 rule.from 在整树下的所有行；写到 to.row
 *   - rule.to 是 list（与 from 有共同祖先 A，A 为最近公共 list 祖先或 root）：
 *       * 对 to 列表中的每一行 t，把 source 限定在 t 的子树（沿 from 在 to 下的相对路径展开），
 *         分别计算并写回 t[toField]
 *       * 兜底：若 from 与 to 没有共同 list 祖先，则在整树取 source，写所有 to 行
 *   - scope: 'all' 强制忽略上述上下文，整树聚合
 *
 * 触发：
 *   - setData 后整体重算一次（预热）
 *   - cmx-cell-changed / cmx-ui5-form-changed：触发命中 rule.from 的规则
 *   - cmx-row-added / cmx-row-removed (path X)：触发所有 from === X 或 from 以 X 为前缀的规则
 *     （增/删某父行时，其子树聚合也要同步）
 *   - 规则按 from 反向索引，仅命中部分跑
 */

const AGG_FUNCS = {
  sum:   (vals) => vals.reduce((s, v) => s + (Number(v) || 0), 0),
  avg:   (vals) => vals.length ? vals.reduce((s, v) => s + (Number(v) || 0), 0) / vals.length : 0,
  min:   (vals) => vals.length ? Math.min(...vals.map((v) => Number(v) || 0)) : 0,
  max:   (vals) => vals.length ? Math.max(...vals.map((v) => Number(v) || 0)) : 0,
  count: (vals) => vals.length,
}

export class CmxMasterSlave extends EventTarget {
  constructor(config = {}) {
    super()
    this._schemaById = new Map()
    this._roots = []
    this._registerSchema(config.schema || [], this._roots, null)
    /** @type {Map<string, ViewBinding>} */
    this._bindings = new Map()
    /** @type {Map<string, string | null>} */
    this._currentIds = new Map()
    /** @type {AggregationRule[]} */
    this._aggs = []
    /** @type {Map<string, AggregationRule[]>} from-path → rules */
    this._aggsByFrom = new Map()
    /** @type {RelationDef[]} */
    this._relations = []
    /** 根数据：{ tables: { rootId: CmxDataSet } } */
    this._data = { tables: {} }
    /** path → CmxColumnModel，用于在 row-changed 时执行 calcFormula */
    this._columnModels = new Map()
    /** 根 CmxDataSet → 已注册的 row-changed 监听函数，用于 setDataSet 时解绑旧监听 */
    this._dsListeners  = new Map()
    /** @type {any|null} 页面 host 引用（拿 fetch、$coord、shadowRoot） */
    this._host = null
    /** @type {object|null} 上次 loadDoc 的 def，reload 复用 */
    this._def = null
    /** @type {object|null} init-page-models 构造的装载 def，供 cmx-pager 驱动首次 loadDoc 用 */
    this._autoLoadDef = null
    /** @type {import('./cmx-doc-source.js').ChangeSetCollector|null} */
    this._collector = null
    /** @type {object|null} 关联的 CmxDOCMeta/CmxDCTMeta 实例（saveDoc 用它出中文表名） */
    this._docMeta = null
    this._editable = config.editable
    /** @type {{layer:string, pageSize:number, page:number}|null} 分页状态；enablePaging 后非空 */
    this._paging = null
    /** @type {number|null} 后端 count_total=true 时回传的根层总行数；未启用分页或尚未加载时 null */
    this._lastTotal = null
    /** @type {number} 上次根层实际拉到的行数（用于估算末页/分页调试） */
    this._lastPageRows = 0

    for (const r of (config.aggregations || [])) this.addAggregation(r)
    for (const r of (config.relations || [])) this.defineRelation(r)
    if (config.dataSources?.length) this.registerDataSources(config.dataSources)
    for (const model of (config.columnModels || [])) this.setColumnModel(model)
  }

  // ─── schema ────────────────────────────────────────────────────────────

  _registerSchema(nodes, parentChildren, parentPath) {
    for (const n of nodes) {
      const path = parentPath ? `${parentPath}.${n.id}` : n.id
      if (this._schemaById.has(path)) {
        throw new Error(`[CmxMasterSlave] duplicate path: ${path}`)
      }
      const node = {
        id:       n.id,
        path,
        parent:   parentPath,
        children: [],
      }
      parentChildren.push(node)
      this._schemaById.set(path, node)
      if (n.children && n.children.length) {
        this._registerSchema(n.children, node.children, path)
      }
    }
  }

  _node(path) {
    const n = this._schemaById.get(path)
    if (!n) throw new Error(`[CmxMasterSlave] unknown path: ${path}`)
    return n
  }

  // ─── 视图绑定 ───────────────────────────────────────────────────────────

  bindForm(path, formEl) {
    this._node(path)
    this._bind(path, { view: formEl, type: 'form' })
    if (typeof formEl._setDataSourceProvider === 'function') {
      formEl._setDataSourceProvider((id) => this.getDataSource(id))
    }
  }

  bindTable(path, tableEl) {
    this._node(path)
    this._bind(path, { view: tableEl, type: 'table' })
    if (typeof tableEl._setDataSourceProvider === 'function') {
      tableEl._setDataSourceProvider((id) => this.getDataSource(id))
    }
    // 保存监听函数引用，便于 destroy() 解绑
    const onAdded   = (ev) => this._onRowsChanged(path, [ev.detail.row])
    const onRemoved = (ev) => this._onRowsChanged(path, ev.detail.rows || [])
    tableEl.addEventListener('cmx-row-added',   onAdded)
    tableEl.addEventListener('cmx-row-removed', onRemoved)
    if (!this._bindingListeners) this._bindingListeners = []
    this._bindingListeners.push({ el: tableEl, type: 'cmx-row-added',   fn: onAdded })
    this._bindingListeners.push({ el: tableEl, type: 'cmx-row-removed', fn: onRemoved })
  }

  /**
   * 销毁协调器：解绑所有 DOM 事件监听和 ds 事件监听，释放引用。
   * SPA 场景下销毁组件时调用，防止内存泄漏。
   */
  destroy() {
    // 解绑 collector（如有）
    if (this._collector && typeof this._collector.detach === 'function') {
      this._collector.detach()
      this._collector = null
    }
    // 解绑 table DOM 事件
    for (const { el, type, fn } of (this._bindingListeners || [])) {
      el.removeEventListener(type, fn)
    }
    this._bindingListeners = []
    // 解绑所有 ds 事件
    for (const rootDs of Object.values(this._data.tables || {})) {
      if (rootDs) this._unregisterDsListeners(rootDs)
    }
    this._dsListeners.clear()
    this._bindings.clear()
    this._data = { tables: {} }
    // 清理分页状态（避免销毁后残留 total/_paging 误导下一次 new 后的复用引用）
    this._paging = null
    this._lastTotal = null
    this._lastPageRows = 0
  }

  _bind(path, binding) {
    if (!this._bindings.has(path)) this._bindings.set(path, [])
    this._bindings.get(path).push(binding)
    if (typeof this._editable === 'boolean' && binding?.view) {
      const view = binding.view
      if (typeof view.setEditable === 'function') view.setEditable(this._editable)
      else if (typeof view.setOptions === 'function') view.setOptions({ editable: this._editable, readonly: !this._editable })
    }
  }

  // ─── 列模型（calcFormula 执行） ──────────────────────────────────────────

  /**
   * 注册 CmxColumnModel，以 model.datasetId 为 key（对应 schema 路径）。
   * row-changed 事件到来时，用对应 model 找 CmxColumn，执行 calcFormula。
   * @param {import('./cmx-column-model.js').CmxColumnModel} model
   */
  setColumnModel(model) {
    if (model.datasetId && !this._schemaById.has(model.datasetId)) {
      console.warn(`[CmxMasterSlave] setColumnModel: datasetId '${model.datasetId}' does not match any schema path`)
    }
    this._columnModels.set(model.datasetId, model)
  }

  /** 调度聚合规则 */
  _scheduleAggFrom(path, key) {
    this._runAggregationsFrom(path, key)
  }

  /** 向外派发 change 事件供业务监听 */
  _notifyCellChanged(path, id, key, value, row) {
    this.dispatchEvent(new CustomEvent('change', { detail: { path, id, key, value, row } }))
  }

  // ─── 聚合规则 ──────────────────────────────────────────────────────────


  addAggregation(rule) {
    if (!rule || !rule.from || !rule.to || !rule.toField) {
      throw new Error('[CmxMasterSlave] aggregation requires from / to / toField')
    }
    this._node(rule.from); this._node(rule.to)
    const r = { scope: 'siblings', ...rule }
    this._aggs.push(r)
    if (!this._aggsByFrom.has(r.from)) this._aggsByFrom.set(r.from, [])
    this._aggsByFrom.get(r.from).push(r)
  }

  // ─── 关系（平铺数据时用） ────────────────────────────────────────────

  defineRelation(rel) {
    if (!rel || !rel.parent || !rel.child || !rel.childKey) {
      throw new Error('[CmxMasterSlave] relation requires parent / child / childKey')
    }
    this._relations.push({ parentKey: 'id', ...rel })
  }

  // ─── DataSource 注册（业务字典） ──────────────────────────────────────

  /** 注册一组 DataSource（数据字典）；同 id 覆盖 */
  registerDataSources(sources) {
    if (!this._dataSources) this._dataSources = new Map()
    for (const ds of (sources || [])) {
      if (!ds || !ds.id) continue
      this._dataSources.set(ds.id, ds)
    }
    // 通知已绑定的 view 重刷帮助器/列显示
    for (const bindings of this._bindings.values()) {
      for (const binding of bindings) {
        if (typeof binding.view._notifyDataSourcesChanged === 'function') {
          binding.view._notifyDataSourcesChanged()
        }
      }
    }
  }

  getDataSource(id) {
    return this._dataSources?.get(id) || null
  }

  unregisterDataSource(id) {
    this._dataSources?.delete(id)
  }

  /**
   * 统一切换已绑定视图的编辑状态。
   * 表格 / 表单组件若实现 setEditable(flag)，优先调用组件自身 API；
   * 旧组件则回退到 setOptions({ editable, readonly })。
   */
  setEditable(flag) {
    const editable = !!flag
    this._editable = editable
    for (const bindings of this._bindings.values()) {
      for (const binding of bindings || []) {
        const view = binding?.view
        if (!view) continue
        if (typeof view.setEditable === 'function') {
          view.setEditable(editable)
        } else if (typeof view.setOptions === 'function') {
          view.setOptions({ editable, readonly: !editable })
        }
      }
    }
    return this
  }

  isEditable() {
    return !!this._editable
  }

  // ─── 数据入口 ──────────────────────────────────────────────────────────

  setData(data) {
    this._data = this._normalizeTreeData(data)
    this._currentIds.clear()
    this._runAggregations()    // 先预热聚合值，再渲染（避免 view 渲染过期）
    this._renderAll()
    this._primeCursors()       // 定位各根首行，自上而下点亮子层（与 setDataSet 一致）
  }

  getData() {
    // 序列化：CmxDataSet.toJSON() 逐层输出
    const tables = {}
    for (const [k, ds] of Object.entries(this._data.tables || {})) {
      tables[k] = ds.toJSON()
    }
    return { tables }
  }

  /**
   * 按路径和行 id 取行对象的直接引用（可就地修改字段，协调器下次渲染会使用最新值）。
   * 仅用于"聚合事件中就地写派生字段"等需要直接操作行对象的场景。
   * @param {string} path  schema 路径，如 'shippings'
   * @param {string} id    行 id
   * @returns {object|null}
   */
  /** 按路径和行 id 取 CmxRowSet 的直接引用（可就地修改字段）。 */
  getRow(path, id) {
    const rows = this._collectRows(this._data, path)
    return rows.find((r) => r.id === id) ?? null
  }

  /**
   * 以 CmxDataSet 映射装载数据（统一入口，替代直接调用 setData）。
   * @param {Record<string, import('./cmx-data-set.js').CmxDataSet>} dsMap
   *   { rootId: CmxDataSet, ... }，每个根路径对应一个 CmxDataSet。
   *   CmxDataSet 内部的行对象和 _children 结构直接被协调器接管，无需额外转换。
   */
  setDataSet(dsMap) {
    // 解绑旧监听（遍历所有根 CmxDataSet 递归解绑）
    for (const rootDs of Object.values(this._data.tables || {})) {
      if (rootDs) this._unregisterDsListeners(rootDs)
    }
    this._dsListeners.clear()

    const tables = {}
    for (const [rootId, ds] of Object.entries(dsMap)) {
      tables[rootId] = ds
      // 递归注册整棵树上每个 CmxDataSet 的 row-changed，带完整路径
      this._registerDsListeners(ds, rootId)
    }
    this._data = { tables }
    this._currentIds.clear()
    this._runAggregations()
    this._renderAll()
    this._primeCursors()
  }

  /**
   * 数据装载后把每个根数据集游标定位到首行，驱动 _setCurrent 自上而下级联点亮所有子层视图。
   * 解决「setDataSet/setData 装完数据后子层视图为空、调用方被迫手动 moveFirst 根游标」的问题：
   * 根 ds 在重装后 _cursor=-1，moveFirst 必派发 cursor-changed → _setCurrent → 子级递归 moveFirst。
   * 必须在 _renderAll() 之后调用，确保各级视图已绑定到 ds，再移游标才能收到 cursor-changed。
   */
  _primeCursors() {
    for (const n of this._roots) {
      const ds = this._data.tables?.[n.id]
      if (ds && typeof ds.moveFirst === 'function' && (ds.rows?.length || 0) > 0) {
        ds.moveFirst()
      }
    }
  }

  /**
   * 递归遍历 CmxDataSet 树，给每一级注册 row-changed 监听。
   * fullPath：当前数据集对应的 schema 路径（如 'orderForm.items.taxes'）。
   * 每个监听器直接知道自己的 path，无需冒泡推断。
   */
  _registerDsListeners(ds, fullPath) {
    const listener = (ev) => {
      const { row, key, value } = ev.detail
      // 执行 calcFormula
      const model = this._columnModels.get(fullPath)
      if (model) {
        const col = model.findById(key)
        if (col?.calcFormula) {
          invokePreset(col.calcFormula, 'apply', row, { value, key })
          const deps = col.editSettings?.dependents || []
          for (const dep of deps) {
            this._scheduleAggFrom(fullPath, dep)
            this._notifyCellChanged(fullPath, row.id, dep, row[dep], row)
          }
        }
      }
      this._scheduleAggFrom(fullPath, key)
      this._notifyCellChanged(fullPath, row.id, key, value, row)
    }
    ds.addEventListener('row-changed', listener)

    // 游标变化时：_setCurrent 驱动子级联动
    const onCursor = (ev) => {
      const { id } = ev.detail
      this._setCurrent(fullPath, id)
    }
    ds.addEventListener('cursor-changed', onCursor)

    // 新增行时：递归注册行的子数据集监听
    const onAdded = (ev) => {
      const { row } = ev.detail
      for (const [childId, childDs] of Object.entries(row._children || {})) {
        if (childDs && typeof childDs.addRow === 'function') {
          this._registerDsListeners(childDs, `${fullPath}.${childId}`)
        }
      }
    }
    // 删除行时：解绑行的所有子数据集监听
    const onRemoved = (ev) => {
      const { row } = ev.detail
      for (const childDs of Object.values(row._children || {})) {
        if (childDs && typeof childDs.addRow === 'function') {
          this._unregisterDsListeners(childDs)
        }
      }
    }
    ds.addEventListener('ds-row-added',   onAdded)
    ds.addEventListener('ds-row-removed', onRemoved)

    // 用数组存多个 listener，便于全部解绑
    this._dsListeners.set(ds, [listener, onAdded, onRemoved, onCursor])

    // 递归处理已有行的子数据集
    for (const row of ds.rows) {
      for (const [childId, childDs] of Object.entries(row._children || {})) {
        if (childDs && typeof childDs.addRow === 'function') {
          this._registerDsListeners(childDs, `${fullPath}.${childId}`)
        }
      }
    }
  }

  /** 递归解绑某个 CmxDataSet 及其所有子数据集的监听 */
  _unregisterDsListeners(ds) {
    const listeners = this._dsListeners.get(ds)
    if (listeners) {
      const [listener, onAdded, onRemoved, onCursor] = listeners
      ds.removeEventListener('row-changed',    listener)
      ds.removeEventListener('ds-row-added',   onAdded)
      ds.removeEventListener('ds-row-removed', onRemoved)
      if (onCursor) ds.removeEventListener('cursor-changed', onCursor)
      this._dsListeners.delete(ds)
    }
    for (const row of ds.rows) {
      for (const childDs of Object.values(row._children || {})) {
        if (childDs && typeof childDs.addRow === 'function') {
          this._unregisterDsListeners(childDs)
        }
      }
    }
  }

  /**
   * 将协调器当前数据导出为 CmxDataSet 映射。
   * @returns {Record<string, import('./cmx-data-set.js').CmxDataSet>}
   *   { rootId: CmxDataSet, ... }，包含完整的多级树形结构。
   */
  getDataSet() {
    return CmxDataSet.fromMasterSlaveData(this._data)
  }

  /**
   * 按根路径取「一级（根）CmxDataSet」的**活引用**（非副本），可直接读 rows / 绑定到 grid。
   * 与 getDataSet()（重建整棵树副本）不同：此处返回协调器当前持有的同一实例，
   * 适合「数据已在协调器、按 rootId 取出复用，不再回后端取数」的场景。
   * @param {string} rootId  根 schema 路径（= setDataSet 时的 key）
   * @returns {import('./cmx-data-set.js').CmxDataSet|null}
   */
  getRootDataSet(rootId) {
    return (this._data && this._data.tables && this._data.tables[rootId]) || null
  }

  /**
   * 导出协调器管理的所有根 CmxDataSet 为「key=value 对象」方式。
   * 逐个调用根 CmxDataSet.exportKeyValue()，按 rootId 归集。
   * @param {object} [opts]
   * @param {boolean} [opts.includeChildren=true] 是否递归导出子数据集
   * @returns {Record<string, { datasetId: string, rows: object[] }>} { rootId: 导出结果, ... }
   */
  exportKeyValue (opts = {}) {
    const out = {}
    for (const [rootId, ds] of Object.entries(this._data.tables || {})) {
      if (ds && typeof ds.exportKeyValue === 'function') {
        out[rootId] = ds.exportKeyValue(opts)
      }
    }
    return out
  }

  /**
   * 导出协调器管理的所有根 CmxDataSet 为「元数据 + 列值数组」方式。
   * 逐个调用根 CmxDataSet.exportColumnar()，按 rootId 归集。
   * @param {object} [opts]
   * @param {boolean} [opts.includeChildren=true] 是否递归导出子数据集
   * @returns {Record<string, { datasetId: string, columns: string[], rows: any[][], childRows?: object }>}
   */
  exportColumnar (opts = {}) {
    const out = {}
    for (const [rootId, ds] of Object.entries(this._data.tables || {})) {
      if (ds && typeof ds.exportColumnar === 'function') {
        out[rootId] = ds.exportColumnar(opts)
      }
    }
    return out
  }

  /** @deprecated 不再需要调用，CmxDataSet 已在顶部直接 import */
  static registerDataSet(_cls) { /* no-op for backwards compat */ }

  /**
   * 强制刷新视图（不改 currentIds）。无参时刷新所有 view，并重跑所有聚合规则。
   * 业务侧"无事件触发但底层数据已变"的场景使用，例如外部直接修改 row._children 后。
   */
  refresh(path) {
    if (path) {
      this._node(path)
      this._renderView(path)
      return
    }
    this._runAggregations()
    this._renderAll()
  }

  setFlatData(flat) {
    if (!flat || typeof flat !== 'object') { this.setData({}); return }
    // 1) 先按 schema 的"根节点"建占位 tables；非根 list 节点只是临时 buffer
    const tables = {}
    for (const n of this._roots) tables[n.id] = this._wrap(n, flat[n.id])
    const data = { tables }
    // 2) 按 relations 从浅到深处理（即父深度小者优先），把 flat[child] 的行挂到父 _children[child]
    const sortedRelations = this._relations
      .slice()
      .sort((a, b) => this._pathOf(a.parent).split('.').length - this._pathOf(b.parent).split('.').length)
    for (const rel of sortedRelations) {
      const childRows = Array.isArray(flat[rel.child]) ? flat[rel.child] : []
      const childPath = this._pathOf(rel.child)
      if (!childPath) continue
      const childNode = this._schemaById.get(childPath)
      if (!childNode) continue
      const parentRows = this._collectRows(data, this._pathOf(rel.parent))
      for (const pr of parentRows) {
        pr._children = pr._children || {}
        const matched = childRows.filter((c) => c[rel.childKey] === pr[rel.parentKey])
        const cds = new CmxDataSet()
        for (const r of matched) cds.addRow(r)
        pr._children[rel.child] = cds
      }
    }
    this.setDataSet(data.tables)
  }

  /** 给定 schema id（即 schema node id 段），返回完整 path；若多处出现取首个 */
  _pathOf(id) {
    for (const [path, node] of this._schemaById) {
      if (node.id === id) return path
    }
    return null
  }

  getFlatData() {
    const out = {}
    for (const [, node] of this._schemaById) {
      out[node.id] = []
    }
    for (const n of this._roots) {
      const ds = this._data.tables[n.id]
      if (!ds) continue
      for (const row of (ds.rows || [])) this._collectFlatRow(n, row, out, null)
    }
    return out
  }

  _collectFlatRow(node, row, out, parentId) {
    const cleanRow = typeof row.toPlainObject === 'function' ? row.toPlainObject() : { ...row }
    delete cleanRow._children
    const rel = parentId != null
      ? this._relations.find((r) => r.child === node.id && this._schemaById.get(`${r.parent}.${r.child}`)?.id === node.id)
      : null
    if (rel) cleanRow[rel.childKey] = parentId
    out[node.id].push(cleanRow)
    for (const ch of node.children) {
      const cds = row._children?.[ch.id]
      if (!cds) continue
      for (const cr of (cds.rows || [])) this._collectFlatRow(ch, cr, out, row.id)
    }
  }

  // ─── 标准化输入 ────────────────────────────────────────────────────────

  _normalizeTreeData(data) {
    if (!data) return { tables: {} }
    // 已经是 { tables: { id: CmxDataSet } } 格式，直接使用
    if (data.tables) {
      // 若 tables 中有普通 wrap（非 CmxDataSet），转换一次
      const tables = {}
      for (const [id, val] of Object.entries(data.tables)) {
        tables[id] = val instanceof CmxDataSet ? val : this._wrapToDs(this._node(id), val)
      }
      return { tables }
    }
    // { rootId: rows/row/CmxDataSet } 平铺格式
    const tables = {}
    for (const n of this._roots) {
      const raw = data[n.id]
      tables[n.id] = raw instanceof CmxDataSet ? raw : this._wrapToDs(n, raw)
    }
    return { tables }
  }

  _wrapToDs(node, raw) {
    if (raw instanceof CmxDataSet) return raw
    const ds = new CmxDataSet()
    const rows = Array.isArray(raw) ? raw : []
    for (const r of rows) ds.addRow(r)
    return ds
  }

  // 兼容旧签名
  _wrap(node, raw) { return this._wrapToDs(node, raw) }

  // ─── 路径解析 ──────────────────────────────────────────────────────────

  /**
   * 沿"每个 list 祖先的当前选中行"解析路径，返回当前应展示的 wrap。
   * 用于 view 渲染（按当前 UI 状态决定要显示哪一支）。
   */
  /** 沿当前选中行路径导航，返回目标层级的 CmxDataSet（或 null）。 */
  _resolveWrap(path) {
    const segs = path.split('.')
    let ds = this._data.tables[segs[0]]
    if (!ds) return null
    for (let i = 1; i < segs.length; i++) {
      const parentPath = segs.slice(0, i).join('.')
      // form 绑定的路径不维护选中行（form 不派发 cmx-row-selected）
      // 取 currentIds 记录的值；无记录则取第一行（form 场景）
      const currentId = this._currentIds.get(parentPath) ?? ds.rows[0]?.id ?? null
      if (currentId == null) return null
      ds = ds.childAt(currentId, segs[i])
      if (!ds) return null
    }
    return ds
  }

  /** 收集某 path 下的所有行（无视当前选中，全量展开），返回 CmxRowSet[]。 */
  _collectRows(data, path) {
    const segs = path.split('.')
    let cursor = [data.tables[segs[0]]]   // CmxDataSet[]
    for (let i = 0; i < segs.length - 1; i++) {
      const next = []
      for (const ds of cursor) {
        if (!ds) continue
        // 无论 single/list，统一取 ds.rows（CmxDataSet 不再区分 kind）
        const rows = ds.rows || []
        for (const row of rows) {
          const child = row._children?.[segs[i + 1]]
          if (child) next.push(child)
        }
      }
      cursor = next
    }
    // 最后一层：收集所有行
    const result = []
    for (const ds of cursor) {
      if (!ds) continue
      result.push(...(ds.rows || []))
    }
    return result
  }

  /** 从单行 row 沿子路径展开，返回所有 CmxRowSet。 */
  _descendFromRow(row, segs) {
    let cursor = [row]
    for (const seg of segs) {
      const next = []
      for (const r of cursor) {
        const child = r._children?.[seg]
        if (!child) continue
        next.push(...(child.rows || []))
      }
      cursor = next
    }
    return cursor
  }

  // ─── 视图同步 ──────────────────────────────────────────────────────────

  _renderAll() {
    for (const path of this._bindings.keys()) this._renderView(path)
  }

  _renderView(path) {
    const bindings = this._bindings.get(path)
    if (!bindings?.length) return
    const ds = this._resolveWrap(path)

    for (const binding of bindings) {
      if (binding.type !== 'form') {
        // table：只在 ds 引用切换时重新 setDataSet；游标同步由 ds.cursor-changed 自动触发
        if (ds == null && binding._lastDs == null) continue
        if (binding._lastDs !== ds) {
          binding._lastDs = ds
          binding.view.setDataSet(ds ?? new CmxDataSet())
        }
      }
    }

    for (const binding of bindings) {
      if (binding.type === 'form') {
        // form：setDataSet(ds) 后 form 自己监听 cursor-changed 保持同步
        // 只在 ds 引用切换时重新绑定
        if (binding._lastDs !== ds) {
          binding._lastDs = ds
          binding.view.setDataSet(ds ?? {})
        }
      }
    }
  }

  _setCurrent(path, id) {
    const prev = this._currentIds.get(path)
    if (prev === id) return
    this._currentIds.set(path, id)
    this.dispatchEvent(new CustomEvent('select', { detail: { path, id } }))

    // 级联到子路径
    const node = this._schemaById.get(path)
    if (node?.children?.length) {
      const parentDs = id ? this._resolveWrap(path) : null
      const row = parentDs?.getRow(id)
      for (const childNode of node.children) {
        const childPath = `${path}.${childNode.id}`
        // 先重置所有孙级 _currentIds（在 moveFirst 的同步级联之前），
        // 确保 moveFirst 触发的 _setCurrent 写入孙级时不被后续 _resetDescendants 覆盖
        this._resetDescendants(childPath)
        this._currentIds.set(childPath, null)
        const childDs = row?._children?.[childNode.id] ?? null
        // 推新 ds 给视图（ds 引用切换）
        this._renderView(childPath)
        // moveFirst 同步触发子 ds cursor-changed → _setCurrent(childPath, firstId)
        // 此时孙级已被上方 _resetDescendants 清零，后续不会再被覆盖
        if (childDs?.length > 0) childDs.moveFirst()
      }
    }
  }

  /** 递归重置 path 下所有子路径的 currentId 并刷新视图 */
  _resetDescendants(path) {
    for (const otherPath of this._bindings.keys()) {
      if (otherPath !== path && otherPath.startsWith(path + '.')) {
        this._currentIds.set(otherPath, null)
        this._renderView(otherPath)
      }
    }
  }

  // ─── 事件分发 ──────────────────────────────────────────────────────────

  _onRowsChanged(path, _rows) {
    // 增/删某 path 的行时，所有 from === path 或 from 以 path. 为前缀的规则都受影响
    for (const rule of this._aggs) {
      if (rule.from === path || rule.from.startsWith(path + '.')) {
        this._scheduleRule(rule)
      }
    }
  }

  // ─── 聚合执行 ──────────────────────────────────────────────────────────

  _runAggregations() {
    // 初始化预热场景：同步全量跑（不走微任务批处理，保证 setData 返回后状态完整）
    this._flushRules(this._aggs)
  }

  _runAggregationsFrom(fromPath, key) {
    const rules = this._aggsByFrom.get(fromPath) || []
    for (const rule of rules) {
      if (rule.field && key != null && key !== rule.field && typeof rule.agg !== 'function') continue
      this._scheduleRule(rule)
    }
  }

  /**
   * 同步计算并写回 row[toField]，把"view 刷新"推迟到本帧最后的微任务，
   * 多条规则命中同一 view 时合并为一次刷新，外部 read 立即可见。
   */
  _scheduleRule(rule) {
    // 同步执行写值（外部立即可读）
    this._executeRule(rule, /* skipViewRefresh */ true)
    // 把该 rule 的 to view 标记为脏，下一个微任务里去重批刷
    if (!this._pendingViews) this._pendingViews = new Set()
    this._pendingViews.add(rule.to)
    if (this._flushScheduled) return
    this._flushScheduled = true
    queueMicrotask(() => {
      this._flushScheduled = false
      const dirty = this._pendingViews
      this._pendingViews = null
      if (dirty && dirty.size) this._flushViews(dirty)
    })
  }

  /**
   * 批量执行一组规则（同步预热入口）：写值 + 立即刷新所有受影响 view，去重。
   */
  _flushRules(rules) {
    const dirtyTargets = new Set()
    for (const rule of rules) {
      this._executeRule(rule, /* skipViewRefresh */ true)
      dirtyTargets.add(rule.to)
    }
    this._flushViews(dirtyTargets)
  }

  /**
   * 同步执行一条规则：遍历所有 target row 求值 + 写回 + 派发 aggregate 事件，
   * 并触发"以 rule.to 为 from、field 命中 toField"的下游规则（链式聚合）。
   * skipViewRefresh=true 时不刷新本规则的目标 view（由批处理外部统一刷）。
   */
  _executeRule(rule, skipViewRefresh = false) {
    const targets = this._resolveAllTargetRows(rule)
    if (!targets.length) return
    for (const t of targets) {
      const sources = this._resolveSourcesForTarget(rule, t)
      const value = this._applyAgg(rule, sources)
      t.row[rule.toField] = value
      this.dispatchEvent(new CustomEvent('aggregate', {
        detail: { rule, value, targetId: t.row.id ?? null },
      }))
    }
    if (!skipViewRefresh) {
      const bindings = this._bindings.get(rule.to)
      if (bindings?.length) {
        const ds = this._resolveWrap(rule.to)
        if (ds) {
          for (const binding of bindings) {
            // 聚合写值后只需触发 form 刷新；table 由 ds.cursor-changed 自动保持最新
            if (binding.type === 'form' && binding._lastDs !== ds) {
              binding._lastDs = ds
              binding.view.setDataSet(ds)
            }
          }
        }
      }
    }
    // 链式：本规则写出的字段可能是另一条规则的 source，触发它
    this._cascade(rule.to, rule.toField, skipViewRefresh)
  }

  /** 触发以 fromPath 为 from、field 命中 changedKey 的下游规则，循环检测 + 深度上限 */
  _cascade(fromPath, changedKey, skipViewRefresh) {
    if (!this._cascadeStack) this._cascadeStack = new Set()
    const tag = `${fromPath}#${changedKey}`
    if (this._cascadeStack.has(tag)) return
    if (this._cascadeStack.size > 16) {
      console.warn('[CmxMasterSlave] cascade depth > 16, possible cycle or very wide aggregation graph. Stopping cascade.', [...this._cascadeStack])
      return
    }
    this._cascadeStack.add(tag)
    try {
      const rules = this._aggsByFrom.get(fromPath) || []
      for (const r of rules) {
        if (r.field && r.field !== changedKey && typeof r.agg !== 'function') continue
        if (skipViewRefresh) {
          // 同步预热路径：保持完全同步执行 + 不刷 view（外层统一）
          this._executeRule(r, true)
          if (this._pendingViews) this._pendingViews.add(r.to)
        } else {
          // 调度路径：经过批处理（同步写值，view 刷新合并到下一个微任务）
          this._scheduleRule(r)
        }
      }
    } finally {
      this._cascadeStack.delete(tag)
    }
  }

  _flushViews(paths) {
    for (const toPath of paths) {
      const bindings = this._bindings.get(toPath)
      if (!bindings?.length) continue
      const ds = this._resolveWrap(toPath)
      if (!ds) continue
      for (const binding of bindings) {
        if (binding.type === 'form') {
          // form 只在 ds 切换时重绑；游标行由 ds.cursor-changed 自动同步
          if (binding._lastDs !== ds) {
            binding._lastDs = ds
            binding.view.setDataSet(ds)
          }
        } else {
          // table 只在 ds 切换时重绑
          if (binding._lastDs !== ds) {
            binding._lastDs = ds
            binding.view.setDataSet(ds)
          }
        }
      }
    }
  }

  /**
   * 枚举所有需要写入的 target row。
   * - to=single：唯一一行（无视当前选择）
   * - to=list：全树展开 path，返回所有 list 节点的所有 row
   */
  _resolveAllTargetRows(rule) {
    // 统一取路径下所有行（单行路径自然只有 1 条，多行路径有 N 条）
    return this._collectRows(this._data, rule.to).map((row) => ({ row, path: rule.to }))
  }

  /**
   * 对一个 target row t，计算其对应的 source 行集合。
   * scope: 'all'     — 整树聚合（与 t 无关）
   * scope: 'siblings'：
   *   - 若 from 路径以 to 路径为前缀（即 to 是 from 的祖先 list），from 限定在 t 的子树
   *   - 否则若 from / to 有最近公共 list 祖先 A：找到包含 t 的 A 中的行 a，然后从 a 沿 from 在 A 下的相对路径展开
   *   - 否则（无共同 list 祖先）：等同 'all'
   */
  _resolveSourcesForTarget(rule, target) {
    if (rule.scope === 'all') return this._collectRows(this._data, rule.from)
    const fromSegs = rule.from.split('.')
    const toSegs   = rule.to.split('.')

    // case A: to is ancestor (or equal) of from
    if (fromSegs.length >= toSegs.length &&
        toSegs.every((s, i) => fromSegs[i] === s)) {
      const restSegs = fromSegs.slice(toSegs.length)
      if (!restSegs.length) return [target.row]
      return this._descendFromRow(target.row, restSegs)
    }

    // case B: from / to share common list ancestor A
    let commonLen = 0
    while (commonLen < fromSegs.length && commonLen < toSegs.length && fromSegs[commonLen] === toSegs[commonLen]) commonLen++
    if (commonLen === 0) return this._collectRows(this._data, rule.from)

    // 找到 包含 target.row 的"祖先 A 行"
    const ancestorRow = this._ancestorRowOf(target.row, rule.to, commonLen)
    if (!ancestorRow) return []
    const fromRest = fromSegs.slice(commonLen)
    if (!fromRest.length) return [ancestorRow]
    return this._descendFromRow(ancestorRow, fromRest)
  }

  /**
   * 给定一个 row（位于 toPath 的某行）以及它与 from 的最近公共祖先深度 commonLen，
   * 返回该 row 所属的"祖先 A 行"（位于 toPath 的前 commonLen 段）。
   *
   * 实现：从 root 向下 dfs，记录路径上的 ancestor row；当 dfs 到 target row 时，回读 commonLen 位置的 ancestor。
   */
  _ancestorRowOf(targetRow, toPath, commonLen) {
    const toSegs = toPath.split('.')
    // 在 toSegs[0..commonLen-1] 形成的每一条路径上扫描，找到包含 targetRow 的那一条
    const rootId = toSegs[0]
    const rootWrap = this._data.tables[rootId]
    if (!rootWrap) return null
    // 当 commonLen === 0 时无共同祖先，由上层处理；这里 commonLen >= 1
    const found = this._dfsFindAncestor(rootWrap, toSegs, 0, commonLen, targetRow, /* ancestorRow */ null)
    return found
  }

  _dfsFindAncestor(wrap, segs, depth, commonLen, target, ancestorRow) {
    if (!wrap) return null
    for (const r of (wrap.rows || [])) {
      const nextAncestor = depth + 1 === commonLen ? r : ancestorRow
      if (depth + 1 === segs.length) {
        if (r === target) return nextAncestor ?? r
        continue
      }
      const childWrap = r._children?.[segs[depth + 1]]
      const found = this._dfsFindAncestor(childWrap, segs, depth + 1, commonLen, target, nextAncestor)
      if (found) return found
    }
    return null
  }

  _applyAgg(rule, rows) {
    if (typeof rule.agg === 'function') return rule.agg(rows)
    const fn = AGG_FUNCS[rule.agg]
    if (!fn) throw new Error(`[CmxMasterSlave] unknown agg: ${rule.agg}`)
    if (rule.agg === 'count') return fn(rows)
    const vals = rows.map((r) => r[rule.field])
    return fn(vals)
  }

  // ─── 数据入口（autoLoad 配合） ─────────────────────────────────────────

  /**
   * 绑定页面 host。host 提供 fetch、$coord、shadowRoot，运行时必需。
   * init-page-models.js 在 new 完立刻调用。
   * @param {any} host
   */
  bindHost (host) { this._host = host; return this }

  /**
   * 返回根层 schema id（即第一个根层的 path）。单据/字典都只有一级分页，分页层永远等于根层。
   * cmx-pager 连上协调器后用此值作为 layer，无需用户配置。
   * @returns {string|null} 无 schema 时返回 null
   */
  getRootId () { return this._roots[0]?.id || null }

  /**
   * 关联元数据模型实例（CmxDOCMeta 或 CmxDCTMeta）。
   * saveDoc 时从元数据取 { tableName: 中文别名 } 用于错误提示。
   * @param {object} metaModel
   */
  bindDocMeta (metaModel) { this._docMeta = metaModel; return this }

  /**
   * 拉单据数据 → setDataSet → 自动建 collector。
   *
   * 分页启用时（enablePaging 后）：把 `countTotal:true` 与 `layers[layer].{limit,offset,orderBy}`
   * 合入 def.query 后再交给 loadDocData。后端在 count_total=true 时会多跑一条 COUNT(*) 查询，
   * 响应里带 total 字段；loadDoc 完成后把它存到 _lastTotal，并派发 'page-changed' 事件供工具栏刷新。
   *
   * @param {object} def 同 loadDocData 的 def：domain/application/module/file/dbId/apiPath/binary/filter/limit/depth/query
   * @returns {Promise<{dsMap:object, pkg:object, total:number|null}>}
   */
  async loadDoc (def) {
    if (!def) {
      throw new Error('[CmxMasterSlave.loadDoc] def 不能为空（autoLoad 未启用且未手动 loadDoc 过时，reload 无法回放）')
    }
    const host = this._host
    const { loadDocData, ChangeSetCollector } = await import('./cmx-doc-source.js')

    // 分页启用：把 countTotal:true + layers[layer].{limit,offset,orderBy} 合入 def.query。
    // countTotal 用 camelCase（与 includeSiblings/onlyParents 一致）——后端 from_json 也按 camelCase 解析。
    // limit 置 undefined 防止与 layers[layer].limit 双重约束；分页完全由 layers[layer] 接管。
    let finalDef = def
    if (this._paging) {
      const pg = this._paging
      const prevLayers = (def.query && def.query.layers) || {}
      const prevLayer = prevLayers[pg.layer] || {}
      finalDef = {
        ...def,
        limit: undefined,                                      // 分页由 layers[layer].limit 接管
        query: {
          ...(def.query || {}),
          countTotal: true,                                    // 让后端回 total
          layers: {
            ...prevLayers,
            [pg.layer]: {
              ...prevLayer,
              limit: pg.pageSize,
              offset: (pg.page - 1) * pg.pageSize,
              orderBy: pg.orderBy || prevLayer.orderBy || ['!id'],  // 默认按 id 降序(新单据在前)，页面可在 paging.orderBy 覆盖
            },
          },
        },
      }
    }

    let r
    try {
      r = await loadDocData(host, finalDef)
    } catch (err) {
      // 与 saveDoc 对称：装载失败统一弹结构化错误对话框后 re-throw（AbortError 由 presenter 静默），
      // 消灭"装载失败 → 表格空白无提示"；err 已打 __presented 标记，全局兜底不重复 toast。
      const { presentDocError } = await import('./cmx-doc-error-presenter.js')
      try { await presentDocError(err, { action: 'load', tableNames: this._deriveTableNames() }) }
      catch (_) { /* 对话框自身异常不掩盖原始 err */ }
      throw err
    }
    this.setDataSet(r.dsMap)
    this._def = def                                            // 记原始 def，reload 时重新合页
    if (this._collector && typeof this._collector.detach === 'function') {
      this._collector.detach()
    }
    this._collector = new ChangeSetCollector(this).attach()

    // 分页状态：保存 total + 派发 page-changed 事件（工具栏监听刷新「第 N / M 页（共 X 条）」）
    if (this._paging) {
      const rootDs = r.dsMap && r.dsMap[this._paging.layer]
      this._lastPageRows = rootDs ? (rootDs.rows || []).length : 0
      this._lastTotal = (r.total != null) ? r.total : null
      this.dispatchEvent(new CustomEvent('page-changed', { detail: this.getPagingInfo() }))
    }
    return r
  }

  /**
   * 保存单据。collector.export() → saveDocData；tableNames 从已 bindDocMeta 的元数据自动取。
   * 保存失败（校验/冲突）时调 presentDocError 弹结构化错误对话框，然后 re-throw。
   * @param {object} [opts]
   * @param {'merge'|'replace'} [opts.saveMode='merge']
   * @param {string} [opts.apiPath]
   * @param {AbortSignal} [opts.signal]
   * @returns {Promise<{ok:boolean, mode:string, affected:number}>}
   */
  async saveDoc (opts = {}) {
    if (!this._def) throw new Error('[CmxMasterSlave.saveDoc] 尚未 loadDoc，无 def')
    if (!this._collector) throw new Error('[CmxMasterSlave.saveDoc] 尚未建 collector')
    const { saveDocData } = await import('./cmx-doc-source.js')
    const { presentDocError } = await import('./cmx-doc-error-presenter.js')
    const tableNames = this._deriveTableNames()
    try {
      const saveDef = opts.apiPath ? { ...this._def, saveApiPath: opts.apiPath } : this._def
      const result = await saveDocData(this._host, saveDef, {
        saveMode: opts.saveMode || 'merge',
        changes: this._collector.export(),
        collector: this._collector,
        tableNames,
        signal: opts.signal,
      })
      this._collector.reset()
      return result
    } catch (err) {
      // 失败时统一弹结构化错误对话框（含 violations 中文明细、409 冲突提示）
      try { await presentDocError(err, { action: 'save', tableNames }) }
      catch (_) { /* 对话框自身异常不掩盖原始 err */ }
      throw err
    }
  }

  /** 按上次 def 重拉（手动刷新按钮用）。 */
  reload () { return this.loadDoc(this._def) }

  /** 透传 collector.isDirty()；无 collector 时返回 false。 */
  isDirty () { return !!(this._collector && typeof this._collector.isDirty === 'function' && this._collector.isDirty()) }

  /**
   * 从已 bindDocMeta 的元数据实例导出 { 物理表名: 中文别名 }。
   * 元数据未关联或表无别名时返回 {}（saveDoc 不带 tableNames 也能工作，只是错误提示用英文表名）。
   * CmxMetaTable.id 是物理表名，name 是中文别名（cmx-meta-model.js:77 读 raw.tableAlias）。
   * @returns {Record<string, string>}
   * @private
   */
  _deriveTableNames () {
    const meta = this._docMeta
    if (!meta || typeof meta.listTables !== 'function') return {}
    const out = {}
    for (const t of meta.listTables()) {
      if (t && t.id && t.name) out[t.id] = t.name
    }
    return out
  }

  // ─── 分页（offset + count_total） ───────────────────────────────────────
  //
  // 用法：
  //   ms.enablePaging({ layer:'cv_batch', pageSize:50, page:1 })
  //   await ms.loadDoc(def)                       // 首次装载，后端回 total
  //   await ms.nextPage()                          // 翻下一页（reload + 新 offset）
  //   await ms.setPageSize(100)                    // 改每页大小（回到第 1 页）
  //   const info = ms.getPagingInfo()              // { layer, page, pageSize, total, totalPages, rowsLoaded }
  //
  // 设计要点：
  //   - countTotal:true 仅在分页启用时合入 def.query（非分页场景不多跑 COUNT）
  //   - _lastTotal 每次 loadDoc 都刷新（反映最新数据）
  //   - gotoPage 越界时 clamp 到 [1, totalPages||1]（totalPages=null 时 clamp 到 1）
  //   - 末页判定用 page >= totalPages（精准，替代"rows<pageSize"估算）

  /**
   * 启用分页。下次 loadDoc/reload 时生效。
   * layer 可省略——未传时自动取根层 id（getRootId），因为单据/字典的分页层永远等于根层。
   * @param {{layer?:string, pageSize?:number, page?:number}} opts
   * @returns {this} 链式
   */
  enablePaging (opts = {}) {
    const layer = opts.layer || this.getRootId()
    if (!layer) {
      throw new Error('[CmxMasterSlave.enablePaging] 无法确定分页层：opts.layer 未传且协调器无根层 schema')
    }
    this._paging = {
      layer:     layer,
      pageSize:  Number(opts.pageSize) || 50,
      page:      Number(opts.page) || 1,
      orderBy:   Array.isArray(opts.orderBy) ? opts.orderBy : null,
    }
    return this
  }

  /**
   * 关闭分页。下次 loadDoc/reload 走原 def，不再合入 layers 分页与 countTotal。
   * @returns {this} 链式
   */
  disablePaging () {
    this._paging = null
    this._lastTotal = null
    this._lastPageRows = 0
    return this
  }

  /**
   * 跳到第 n 页（1-based）。越界自动 clamp 到 [1, totalPages||1]。
   * @param {number} n
   * @returns {Promise<this>}
   */
  async gotoPage (n) {
    if (!this._paging) throw new Error('[CmxMasterSlave.gotoPage] 未启用分页（先 enablePaging）')
    const totalPages = this._totalPages()
    this._paging.page = Math.max(1, Math.min(Number(n) || 1, totalPages || 1))
    return this.reload()
  }

  /**
   * 下一页。已在末页（page >= totalPages）时返回 null（不动状态）。
   * @returns {Promise<this>|null}
   */
  async nextPage () {
    if (!this._paging) throw new Error('[CmxMasterSlave.nextPage] 未启用分页（先 enablePaging）')
    const totalPages = this._totalPages()
    // total 还没回来（首次加载前）或已到末页 → 不动；首次装载时由调用方自己 loadDoc，这里只翻页。
    if (totalPages != null && this._paging.page >= totalPages) return null
    this._paging.page++
    return this.reload()
  }

  /**
   * 上一页。已在首页（page <= 1）时返回 null（不动状态）。
   * @returns {Promise<this>|null}
   */
  async prevPage () {
    if (!this._paging) throw new Error('[CmxMasterSlave.prevPage] 未启用分页（先 enablePaging）')
    if (this._paging.page <= 1) return null
    this._paging.page--
    return this.reload()
  }

  /**
   * 改每页大小，并把当前页重置为第 1 页。
   * @param {number} n
   * @returns {Promise<this>}
   */
  async setPageSize (n) {
    if (!this._paging) throw new Error('[CmxMasterSlave.setPageSize] 未启用分页（先 enablePaging）')
    this._paging.pageSize = Math.max(1, Number(n) || 50)
    this._paging.page = 1
    return this.reload()
  }

  /**
   * 取当前分页信息快照（供工具栏渲染）。
   * @returns {{layer:string, page:number, pageSize:number, total:number|null, totalPages:number|null, rowsLoaded:number}|null}
   *     未启用分页 → null
   */
  getPagingInfo () {
    if (!this._paging) return null
    return {
      layer:      this._paging.layer,
      page:       this._paging.page,
      pageSize:   this._paging.pageSize,
      total:      this._lastTotal,
      totalPages: this._totalPages(),
      rowsLoaded: this._lastPageRows || 0,
    }
  }

  /**
   * 派生总页数。_paging 为空或 _lastTotal 未回（后端 count_total 没回或还没装载）→ null。
   * @returns {number|null}
   * @private
   */
  _totalPages () {
    if (!this._paging || this._lastTotal == null) return null
    return Math.max(1, Math.ceil(this._lastTotal / this._paging.pageSize))
  }

  // ─── 字典（DCT）数据入口 ────────────────────────────────────────────
  //
  // 用法（对偶单据 loadDoc/saveDoc）：
  //   ms.bindDctMeta(host.dctMeta)                          // 通常由 init-page-models 自动完成
  //   await ms.loadDict({ domain, application, module, file, dict, dbId, binary, pageSize, ... })
  //   ms.isDirty()                                          // 有未保存变更
  //   await ms.saveDict({ saveMode:'merge' })                // 收集 changeset 保存
  //
  // 视图辅助（四区联动典型用法）：
  //   ms.setDictGridFilter(parentId)                        // grid 只显示某父节点直接子级
  //   ms.setDictSelected(id)                                // 标 is_selected + moveToId
  //   ms.loadDictChildren({ parentId })                     // 懒下钻拉直接子层，合并入 ds
  //   ms.newDictRow({ parentId })                           // 生成前端临时新行（临时 id 't1' 起）

  /**
   * bindDctMeta 是 bindDocMeta 的语义别名——DCT 与 DOC 都是 CmxBaseMeta 子类，
   * 内部字段 _docMeta 通用（listTables/getTable/kind 接口一致）。
   * @param {object} metaModel CmxDCTMeta 实例
   * @returns {this}
   */
  bindDctMeta (metaModel) { return this.bindDocMeta(metaModel) }

  /**
   * 装载字典数据 → setDataSet → 自动建 collector。
   *
   * def.dict 必填（字典编码，如 gl_account）；def.binary 默认 true 走 msgpack；
   * 若字典元数据 dictMeta.selfHierarchy=true，行会自动经 normalizeDictRow 补
   * hasChildren/full_path/level_no/displayValue 等 UI 派生字段。
   *
   * @param {object} def 见 cmx-dct-source.loadDictData 的入参
   * @returns {Promise<{dsMap:object, pkg:object, total:number|null, rows:object[]}>}
   */
  async loadDict (def) {
    if (!def) throw new Error('[CmxMasterSlave.loadDict] def 不能为空')
    if (!def.dict) throw new Error('[CmxMasterSlave.loadDict] def.dict 必填（字典编码）')
    const host = this._host
    const [dctSrc, docSrc] = await Promise.all([
      import('./cmx-dct-source.js'),
      import('./cmx-doc-source.js'),
    ])
    const { loadDictData, normalizeDictRow } = dctSrc
    const { ChangeSetCollector } = docSrc

    let r
    try {
      r = await loadDictData(host, def)
    } catch (err) {
      // 与 saveDict 对称：装载失败统一弹结构化错误对话框后 re-throw（AbortError 由 presenter 静默）。
      const { presentDocError } = await import('./cmx-doc-error-presenter.js')
      try { await presentDocError(err, { action: 'load', tableNames: this._deriveTableNames() }) }
      catch (_) { /* 对话框自身异常不掩盖原始 err */ }
      throw err
    }

    // 字典行归一化：selfHierarchy 时自动补 UI 派生字段
    const dictMeta = this._resolveDictMeta(def)
    if (dictMeta && dictMeta.selfHierarchy) {
      for (const ds of Object.values(r.dsMap || {})) {
        if (!ds || !Array.isArray(ds.rows)) continue
        const norm = ds.rows.map((row) => normalizeDictRow(row, dictMeta))
        if (typeof ds.setRows === 'function') ds.setRows(norm)
      }
    }

    this.setDataSet(r.dsMap)
    this._def = def
    if (this._collector && typeof this._collector.detach === 'function') this._collector.detach()
    this._collector = new ChangeSetCollector(this).attach()
    return r
  }

  /**
   * 保存字典 changeset。collector.export() → sanitizeChangeSet → saveDictData。
   * 失败时（校验/冲突）弹结构化错误对话框，然后 re-throw。
   * @param {object} [opts]
   * @param {'merge'|'replace'} [opts.saveMode='merge']
   * @param {string} [opts.apiPath]
   * @param {AbortSignal} [opts.signal]
   * @returns {Promise<{ok:boolean, mode:string, affected:number}>}
   */
  async saveDict (opts = {}) {
    if (!this._def) throw new Error('[CmxMasterSlave.saveDict] 尚未 loadDict，无 def')
    if (!this._collector) throw new Error('[CmxMasterSlave.saveDict] 尚未建 collector')
    const { saveDictData } = await import('./cmx-dct-source.js')
    const { presentDocError } = await import('./cmx-doc-error-presenter.js')
    const tableNames = this._deriveTableNames()
    try {
      const saveDef = opts.apiPath ? { ...this._def, saveApiPath: opts.apiPath } : this._def
      const result = await saveDictData(this._host, saveDef, {
        saveMode: opts.saveMode || 'merge',
        changes: this._collector.export(),
        collector: this._collector,
        tableNames,
        signal: opts.signal,
      })
      this._collector.reset()
      return result
    } catch (err) {
      try { await presentDocError(err, { action: 'save', tableNames }) } catch (_) { /* presenter 自身异常不掩盖原始 err */ }
      throw err
    }
  }

  /** 按上次 def 重拉字典（手动刷新按钮用）。 */
  reloadDict () { return this.loadDict(this._def) }

  /**
   * 懒下钻：拉某父节点的直接子层，归一化后合并入 ds。
   * @param {object} opts { parentId, pageSize?, signal? }
   * @returns {Promise<object[]>} 归一化后的子行
   */
  async loadDictChildren (opts = {}) {
    if (!this._def) throw new Error('[CmxMasterSlave.loadDictChildren] 尚未 loadDict')
    const { loadDictChildren, normalizeDictRow } = await import('./cmx-dct-source.js')
    const parentId = opts.parentId == null ? null : opts.parentId
    const r = await loadDictChildren(this._host, this._def, { parentId, pageSize: opts.pageSize, signal: opts.signal })
    const dictMeta = this._resolveDictMeta(this._def) || {}
    const rows = (r.rows || []).map((row) => normalizeDictRow(row, dictMeta))
    this._upsertDictRows(rows)
    return rows
  }

  /**
   * 生成前端临时新字典行（临时 id 't1','t2',...；不写 DB，也不进 ds）。
   * 调用方拿到后 append 到 ds → collector 收集为 inserted，saveDict 时统一发后端。
   * @param {object} [opts] { parentId?, layer?='dict' }
   * @returns {object} 空表单行（带 hasChildren/full_path/level_no 等 UI 字段）
   */
  newDictRow (opts = {}) {
    const parentId = opts.parentId == null ? null : opts.parentId
    const dictMeta = this._resolveDictMeta(this._def) || {}
    const idF = dictMeta.idField || 'id'
    const codeF = dictMeta.codeField || 'code'
    const labelF = dictMeta.labelField || 'name'
    const parentF = dictMeta.parentField || 'parent_id'
    const layer = opts.layer || 'dict'
    const ds = this.getRootDataSet(layer)
    const rowsAll = ds ? (ds.rows || []) : []
    const parent = parentId != null ? rowsAll.find((r) => String(r[idF]) === String(parentId)) : null
    const seq = this._dictTmpSeq = (this._dictTmpSeq || 0) + 1
    const newId = 't' + seq
    const fp = parent ? `${parent.full_path || parent[idF]}.${newId}` : String(newId)
    const lv = parent ? ((Number(parent.level_no) || 1) + 1) : 1
    return {
      [idF]: newId, [codeF]: '', [labelF]: '', [parentF]: parentId,
      full_path: fp, level_no: lv,
      is_leaf: 1, sort_no: rowsAll.length + 1, status: 1,
      hasChildren: false, children_loading: false, displayValue: '',
    }
  }

  /**
   * 删除一条字典行。临时行（id 以 't' 开头 / 非数字 id）仅从 ds 移除；DB 行调 REST DELETE。
   * @param {string|number} id
   * @param {object} [opts] { layer?='dict' }
   * @returns {Promise<object>}
   */
  async deleteDictEntry (id, opts = {}) {
    const layer = opts.layer || 'dict'
    const ds = this.getRootDataSet(layer)
    // 临时行：只在前端 ds 里移除（collector 会将新增又删净零，不发后端）
    if (id == null || !/^[0-9]+$/.test(String(id))) {
      if (ds && ds.removeRow) ds.removeRow(id)
      return { removed: true, temp: true }
    }
    const { deleteDictEntry } = await import('./cmx-dct-source.js')
    const r = await deleteDictEntry(this._host, this._def, id)
    if (ds && ds.removeRow) ds.removeRow(id)
    return r
  }

  // ─── 字典 grid 视图（父节点子集 view）辅助 ────────────────────────────
  //
  // 四区联动典型场景：tree 选中节点 → grid 只显示该节点直接子级。
  // 内部用 CmxDataSet.createView(pred) 建增量子集，setDictGridFilter 改 predicate。

  /**
   * 设置 grid 显示的父节点：只显示 parent_id === parentId 的直接子级。
   * parentId 取值语义：
   *   - null / undefined / ''  → 根级（parent_id 空）
   *   - '__all__'              → 全部（所有行，不过滤，跨层级）
   *   - 其他非空字符串/数字     → 该 parentId 节点的直接子级
   * @param {string|number|null|undefined} parentId
   * @param {object} [opts] { layer?='dict', parentField?='parent_id', datasetId?='dictGrid' }
   */
  setDictGridFilter (parentId, opts = {}) {
    const layer = opts.layer || 'dict'
    const ds = this.getRootDataSet(layer)
    if (!ds) return
    if (!this._dictGrid) this._dictGrid = { view: null, parent: null, mode: 'root', layer, datasetId: opts.datasetId || 'dictGrid', parentField: opts.parentField || 'parent_id' }
    // 三种 mode 区分：'all'（全量）/ 'root'（根级）/ 'node'（指定父节点直接子级）
    let mode, parent
    if (parentId === '__all__') { mode = 'all'; parent = '__all__' }
    else if (parentId == null || parentId === '') { mode = 'root'; parent = null }
    else { mode = 'node'; parent = String(parentId) }
    this._dictGrid.parent = parent
    this._dictGrid.mode = mode
    const pred = this._dictGridPred()
    if (!this._dictGrid.view && typeof ds.createView === 'function') {
      this._dictGrid.view = ds.createView(pred, { datasetId: this._dictGrid.datasetId, live: true })
    } else if (this._dictGrid.view && typeof ds.fillView === 'function') {
      ds.fillView(this._dictGrid.view, pred, { live: true })
    }
    try {
      this.dispatchEvent(new CustomEvent('dict-grid-filter-changed', { detail: { parent, mode } }))
    } catch (_) { /* non-browser host */ }
  }

  /** 返回当前 grid 子集视图（供外部读，如通过 view.rows 拿子级）。 */
  dictGridView () { return (this._dictGrid && this._dictGrid.view) || null }

  /** 返回当前 grid 视图模式：'all' / 'root' / 'node'。null 表示未初始化。 */
  dictGridMode () { return (this._dictGrid && this._dictGrid.mode) || null }

  /** grid 视图当前 predicate：
   *  - mode='all'  → () => true（不过滤，所有行，含所有层级）
   *  - mode='root' → parent_id 空（根级）
   *  - mode='node' → parent_id === parent（指定父节点直接子级） */
  _dictGridPred () {
    const p = this._dictGrid && this._dictGrid.parent
    const mode = (this._dictGrid && this._dictGrid.mode) || 'root'
    const parentField = (this._dictGrid && this._dictGrid.parentField) || 'parent_id'
    if (mode === 'all') return () => true
    if (p == null) return (r) => { const v = r && r[parentField]; return v == null || v === '' }
    return (r) => String((r && r[parentField]) == null ? '' : r[parentField]) === String(p)
  }

  /**
   * 标记选中的字典行：所有行 is_selected=0，命中的置 1；同时 ds.moveToId 让 form 视图跟随。
   * @param {string|number} id
   * @param {object} [opts] { layer?='dict', idField?='id' }
   */
  setDictSelected (id, opts = {}) {
    const layer = opts.layer || 'dict'
    const ds = this.getRootDataSet(layer)
    if (!ds) return
    const idKey = opts.idField || 'id'
    for (const rw of (ds.rows || [])) {
      rw.is_selected = String(rw[idKey]) === String(id) ? 1 : 0
    }
    try {
      if (typeof ds.moveToId === 'function') {
        if (typeof ds.getRow === 'function' && ds.getRow(id)) ds.moveToId(id)
        else {
          const n = Number(id)
          if (!isNaN(n) && typeof ds.getRow === 'function' && ds.getRow(n)) ds.moveToId(n)
          else ds.moveToId(String(id))
        }
      }
    } catch (_) { /* 定位失败静默：视图仍用旧行 */ }
  }

  /**
   * 从字典元数据取当前 def.dict 对应的 dictMeta（idField/codeField/labelField/parentField/selfHierarchy）。
   * @param {object} def
   * @returns {object|null}
   * @private
   */
  _resolveDictMeta (def) {
    const meta = this._docMeta
    const dictCode = def && def.dict
    if (!meta || !dictCode || typeof meta.getTable !== 'function') return null
    const table = meta.getTable(dictCode)
    return table && table.raw ? (table.raw.dictMeta || {}) : null
  }

  /**
   * 将子层行合并入指定 layer 的 ds（按 id 主键：存在则字段合并，不存在则 append）。
   * 之后若 dictGrid 视图已在，重跑一次 predicate 让 grid 增量刷新。
   * @param {object[]} rows
   * @param {object} [opts] { layer?='dict', idField?='id' }
   * @private
   */
  _upsertDictRows (rows, opts = {}) {
    const layer = opts.layer || 'dict'
    const ds = this.getRootDataSet(layer)
    if (!ds) return
    const idKey = opts.idField || 'id'
    const existing = ds.rows || []
    const byId = new Map(existing.map((r) => [String(r[idKey]), r]))
    for (const r of rows || []) {
      const key = String(r[idKey])
      if (byId.has(key)) {
        const target = byId.get(key)
        for (const k of Object.keys(r)) target[k] = r[k]
      } else if (typeof ds.appendRow === 'function') {
        ds.appendRow(r)
      } else if (Array.isArray(ds.rows)) {
        ds.rows.push(r)
      }
    }
    if (this._dictGrid && this._dictGrid.view && typeof ds.fillView === 'function') {
      ds.fillView(this._dictGrid.view, this._dictGridPred(), { live: true })
    }
  }
}

/**
 * @typedef {{ id: string, children?: SchemaNode[] }} SchemaNode
 * @typedef {{ from: string, to: string, toField: string, field?: string,
 *             agg: 'sum'|'avg'|'min'|'max'|'count' | ((rows: any[]) => any),
 *             scope?: 'siblings'|'all' }} AggregationRule
 * @typedef {{ parent: string, parentKey?: string, child: string, childKey: string }} RelationDef
 * @typedef {{ view: HTMLElement, type: 'form'|'table' }} ViewBinding
 */
