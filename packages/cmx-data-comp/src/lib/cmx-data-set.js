/**
 * CmxDataSet — 多级数据集（继承 EventTarget）
 *
 * 内部以 CmxRowSet 数组存储，每行是普通属性对象（无 Proxy）。
 * 子层通过 row._children[childId] = CmxDataSet 形成树形结构。
 *
 * 变更通知机制：
 *   row.set(key, value)
 *     → _ds._notifyChange(row, key, value)
 *     → 当前 CmxDataSet 直接派发 'row-changed' CustomEvent
 *   CmxMasterSlave 在 setDataSet 时递归给每个 CmxDataSet 注册监听，
 *   每个监听器携带自身的完整路径，无需冒泡推断。
 *
 * API：
 *   addRow(data, children?)       追加行，返回 CmxRowSet
 *   setRows(dataArray, childMap?) 批量覆盖
 *   removeRow(id) / removeRows    删行
 *   getRow(id)                    按 id 取行（O(1)）
 *   rows / row / length / columnKeys
 *   _notifyChange(row, key, value, pathSegs?)  内部冒泡入口
 *   toJSON() / fromJSON()
 *   toPlainRows(includeChildren?)
 */

import { CmxRowSet } from './cmx-row-set.js'

let _dsSeq = 0

/* 视图类延迟注册：CmxDataSetView extends CmxDataSet，若在此静态 import 会形成循环依赖。
   改由 cmx-data-set-view.js 在被加载时调用 registerDataSetViewClass() 注入。
   createView() 在未注册时给出明确报错，提示先 import 该模块。 */
let _ViewClass = null
export function registerDataSetViewClass (cls) {
  if (typeof cls === 'function') _ViewClass = cls
}

export class CmxDataSet extends EventTarget {
  /**
   * @param {object} opts
   * @param {string[]}  [opts.columns]  列 key 提示（影响 toJSON 列顺序）
   * @param {string}    [opts.datasetId] 数据集标识
   */
  constructor(opts = {}) {
    super()
    this.datasetId = opts.datasetId ?? `ds_${++_dsSeq}`
    this._rows    = []
    this._index   = new Map()      // id → CmxRowSet  O(1) 查找
    this._columns = Array.isArray(opts.columns) ? opts.columns.slice() : []
    this._cursor  = -1             // 游标：当前行索引，-1 = 无定位
    this._total   = null           // 后端 count_total=true 时回传的行数（分页用）；缺省 null
  }

  /**
   * 后端在 count_total=true 时回传的总行数（用于分页计算）。
   * 后端未传（老版本或未启用分页）→ null。
   * @returns {number|null}
   */
  get total () { return this._total ?? null }

  // ─── 列 key 提示 ──────────────────────────────────────────────────────

  get columnKeys() {
    if (this._columns.length) return this._columns.slice()
    if (this._rows.length) return Object.keys(this._rows[0]).filter((k) => !k.startsWith('_'))
    return []
  }

  _trackColumns(data) {
    for (const k of Object.keys(data)) {
      if (!k.startsWith('_') && k !== 'id' && !this._columns.includes(k)) {
        this._columns.push(k)
      }
    }
  }

  // ─── 行写入 ───────────────────────────────────────────────────────────

  /**
   * 追加一行，返回 CmxRowSet。
   * 同时为每个子 CmxDataSet 设置 _parentLink，建立冒泡链。
   */
  addRow(data = {}, children = {}) {
    const id  = data.id ?? `r${Math.random().toString(36).slice(2, 9)}`
    const row = new CmxRowSet({ ...data, id }, {}, this)
    for (const [childId, cds] of Object.entries(children)) {
      row._children[childId] = cds
    }
    this._rows.push(row)
    // key 统一 String(id)：兼容 number/string 主键，避免 Map 跨类型查找失败（整数主键行删不掉的根因）
    this._index.set(String(id), row)
    this._trackColumns(data)
    this.dispatchEvent(new CustomEvent('ds-row-added', { detail: { row } }))
    return row
  }

  setRows(dataArray, childMap = {}) {
    this._rows  = []
    this._index = new Map()
    this._cursor = -1
    for (const data of (dataArray || [])) {
      const plain    = data instanceof CmxRowSet ? data.toPlainObject() : data
      const children = childMap[plain.id] ?? (data instanceof CmxRowSet ? data._children : (data._children || {}))
      this.addRow(plain, children)
    }
    this.dispatchEvent(new CustomEvent('cursor-changed', {
      detail: { index: -1, prevIndex: -1, row: null, id: null },
    }))
  }

  removeRow(id, _batch = false) {
    // 入参统一 String 化查找：_index key 统一存 String(id)（见 addRow），兼容 number/string 主键
    const row = this._index.get(String(id))
    if (!row) return null
    const idx = this._rows.indexOf(row)
    if (idx !== -1) this._rows.splice(idx, 1)
    this._index.delete(String(id))
    const prevCursor = this._cursor
    if (this._rows.length === 0) {
      this._cursor = -1
    } else if (idx < this._cursor) {
      this._cursor = this._cursor - 1
    } else if (idx === this._cursor) {
      this._cursor = Math.min(this._cursor, this._rows.length - 1)
    }
    // 单行删除时立即派发 cursor-changed；批量删除时由 removeRows 统一派发
    if (!_batch && this._cursor !== prevCursor) {
      const curRow = this._cursor >= 0 ? this._rows[this._cursor] : null
      this.dispatchEvent(new CustomEvent('cursor-changed', {
        detail: { index: this._cursor, prevIndex: prevCursor, row: curRow, id: curRow?.id ?? null },
      }))
    }
    this.dispatchEvent(new CustomEvent('ds-row-removed', { detail: { row } }))
    row._ds = null
    return row
  }

  removeRows(ids) {
    if (!Array.isArray(ids) || !ids.length) return []
    const prevCursor = this._cursor
    const removed = ids.map((id) => this.removeRow(id, true)).filter(Boolean)
    if (removed.length && this._cursor !== prevCursor) {
      const row = this._cursor >= 0 && this._cursor < this._rows.length ? this._rows[this._cursor] : null
      this.dispatchEvent(new CustomEvent('cursor-changed', {
        detail: { index: this._cursor, prevIndex: prevCursor, row, id: row?.id ?? null },
      }))
    }
    return removed
  }

  // ─── 行读取 ───────────────────────────────────────────────────────────

  getRow(id)   { return this._index.get(String(id)) ?? null }
  get rows()   { return this._rows }
  get row()    { return this._rows[0] ?? null }
  get length() { return this._rows.length }

  // ─── 游标 ─────────────────────────────────────────────────────────────

  get cursorIndex() { return this._cursor }

  get currentRow() {
    return this._cursor >= 0 && this._cursor < this._rows.length ? this._rows[this._cursor] : null
  }

  moveTo(index) {
    if (!this._rows.length) return this._setCursor(-1)
    return this._setCursor(Math.max(0, Math.min(this._rows.length - 1, index)))
  }

  moveFirst() { return this.moveTo(0) }
  moveLast()  { return this.moveTo(this._rows.length - 1) }
  moveNext()  { return this.moveTo(this._cursor + 1) }
  movePrev()  { return this.moveTo(this._cursor - 1) }

  moveToId(id) {
    return this._setCursor(this._rows.findIndex((r) => r.id === id))
  }

  get isFirst()   { return this._rows.length > 0 && this._cursor === 0 }
  get isLast()    { return this._rows.length > 0 && this._cursor === this._rows.length - 1 }
  get hasCursor() { return this._cursor >= 0 && this._cursor < this._rows.length }

  _setCursor(idx) {
    const prev = this._cursor
    this._cursor = idx
    const row = idx >= 0 && idx < this._rows.length ? this._rows[idx] : null
    if (idx !== prev) {
      this.dispatchEvent(new CustomEvent('cursor-changed', {
        detail: { index: idx, prevIndex: prev, row, id: row?.id ?? null },
      }))
    }
    return row
  }

  // ─── 变更通知（冒泡链） ────────────────────────────────────────────────

  /**
   * 由 CmxRowSet.set() 调用。
   * 直接在本数据集上派发 'row-changed' 事件；
   * CmxMasterSlave 在 setDataSet 时已递归给每个 CmxDataSet 注册监听，
   * 每个监听器知道自己对应的 fullPath，无需冒泡推断。
   */
  _notifyChange(row, key, value) {
    this.dispatchEvent(new CustomEvent('row-changed', {
      detail: { row, key, value },
    }))
  }

  // ─── 与 cmx-master-slave 互转 ─────────────────────────────────────────

  childAt(rowId, childId) {
    return this._index.get(String(rowId))?._children?.[childId] ?? null
  }

  // ─── 过滤视图（零拷贝：视图只持有本集 CmxRowSet 的引用） ───────────────────

  /**
   * 新建一个过滤视图：视图的行是**本数据集 CmxRowSet 的引用**，不复制字段数据。
   * 视图可直接 grid.setDataSet(view) 使用，并（live 时）随本集增删改自动重过滤。
   * @param {Function|object} predicate 函数 (row)=>boolean，或声明式条件
   *        { match:'all'|'any', conditions:[{col,op,value}] }
   * @param {object} [opts] { datasetId?, live=true }
   * @returns {import('./cmx-data-set-view.js').CmxDataSetView}
   */
  createView(predicate, opts = {}) {
    if (!_ViewClass) {
      throw new Error("[CmxDataSet] createView 需要先 import 'cmx-data-comp/lib/cmx-data-set-view.js'（用于注册 CmxDataSetView）")
    }
    const view = new _ViewClass({ datasetId: opts.datasetId, live: opts.live })
    view.bindTo(this, predicate, { live: opts.live })
    return view
  }

  /**
   * 把「按条件过滤出来的行引用」灌入一个**已存在**的 CmxDataSetView 实例（复用该实例，
   * 不新建对象、不复制数据）。视图上已绑定的 grid 等监听全部保持，立即看到新结果。
   *
   * 用途：页面/模型面板已经声明好一个 CmxDataSetView（如 host.assetView），运行时反复
   * 用不同条件把本集的子集投影进去——始终是同一个 view 实例与同一批底层 CmxRowSet 引用。
   *
   * @param {import('./cmx-data-set-view.js').CmxDataSetView} view 已存在的视图实例
   * @param {Function|object} [predicate] 过滤条件；省略则沿用 view 当前条件，仅以本集为主集重灌
   * @param {object} [opts] { live=true, resetCursor=true }
   * @returns {import('./cmx-data-set-view.js').CmxDataSetView} 同一个 view（链式用）
   */
  fillView(view, predicate, opts = {}) {
    if (!view || typeof view.bindTo !== 'function') {
      throw new Error('[CmxDataSet] fillView(view) 需要一个 CmxDataSetView 实例（缺少 bindTo 方法）')
    }
    return view.bindTo(this, predicate, opts)
  }

  static fromMasterSlaveData(msData) {
    const tables = msData?.tables || {}
    const result = {}
    for (const [rootId, wrap] of Object.entries(tables)) {
      result[rootId] = CmxDataSet._wrapToDs(wrap)
    }
    return result
  }

  static _wrapToDs(wrap) {
    if (!wrap) return new CmxDataSet()
    const ds = new CmxDataSet()
    const srcRows = wrap.rows ?? (wrap.row ? [wrap.row] : [])
    for (const r of srcRows) {
      const plain = r instanceof CmxRowSet ? r.toPlainObject() : r
      const { _children: rawChildren, ...data } = plain
      const ch = {}
      for (const [cid, cw] of Object.entries(r._children || {})) {
        ch[cid] = cw instanceof CmxDataSet ? cw : CmxDataSet._wrapToDs(cw)
      }
      ds.addRow(data, ch)
    }
    return ds
  }

  toMasterSlaveWrap()          { return { rows: this._rows } }
  toMasterSlaveInput(rootId)   { return { [rootId]: this.toMasterSlaveWrap() } }
  toMasterSlaveData(rootId)    { return { tables: { [rootId]: this.toMasterSlaveWrap() } } }

  static inputFromMap(map) {
    const tables = {}
    for (const [rootId, ds] of Object.entries(map)) {
      tables[rootId] = ds instanceof CmxDataSet ? ds.toMasterSlaveWrap() : ds
    }
    return { tables }
  }

  // ─── 与 grid/table 互转 ───────────────────────────────────────────────

  toPlainRows(includeChildren = false) {
    return this._rows.map((row) => {
      const obj = row.toPlainObject()
      if (includeChildren && Object.keys(row._children || {}).length) {
        obj._children = {}
        for (const [cid, cds] of Object.entries(row._children)) {
          obj._children[cid] = { rows: cds.toPlainRows(true) }
        }
      }
      return obj
    })
  }

  // ─── 序列化 ───────────────────────────────────────────────────────────

  toJSON() {
    const cols     = ['id', ...this.columnKeys.filter((k) => k !== 'id')]
    const jsonRows = this._rows.map((row) => cols.map((k) => row[k]))
    const obj      = { datasetId: this.datasetId, columns: cols, rows: jsonRows }
    const childRows = {}
    for (const row of this._rows) {
      if (row._children && Object.keys(row._children).length) {
        childRows[row.id] = {}
        for (const [cid, cds] of Object.entries(row._children)) {
          childRows[row.id][cid] = cds.toJSON()
        }
      }
    }
    if (Object.keys(childRows).length) obj.childRows = childRows
    return obj
  }

  // ─── 两种 JSON 导出（含子层递归） ──────────────────────────────────────

  /**
   * 导出为「key=value 对象」方式：每行是 { colKey: colValue }，子层挂在 _children 下递归。
   * @param {object} [opts]
   * @param {boolean} [opts.includeChildren=true] 是否递归导出子数据集
   * @returns {{ datasetId: string, rows: object[] }}
   */
  exportKeyValue({ includeChildren = true } = {}) {
    const rows = this._rows.map((row) => {
      const obj = row.toPlainObject()
      if (includeChildren && row._children && Object.keys(row._children).length) {
        obj._children = {}
        for (const [cid, cds] of Object.entries(row._children)) {
          obj._children[cid] = cds.exportKeyValue({ includeChildren })
        }
      }
      return obj
    })
    return { datasetId: this.datasetId, rows }
  }

  /**
   * 导出为「元数据 + 列值数组」方式：{ datasetId, columns:[key...], rows:[[value...]...] }。
   * rows 每项是与 columns 对齐的纯列值数组；子层按父行 id 挂在 childRows 下递归（同 toJSON 结构）。
   * @param {object} [opts]
   * @param {boolean} [opts.includeChildren=true] 是否递归导出子数据集
   * @returns {{ datasetId: string, columns: string[], rows: any[][], childRows?: object }}
   */
  exportColumnar({ includeChildren = true } = {}) {
    const cols     = ['id', ...this.columnKeys.filter((k) => k !== 'id')]
    const jsonRows = this._rows.map((row) => cols.map((k) => row[k]))
    const obj      = { datasetId: this.datasetId, columns: cols, rows: jsonRows }
    if (includeChildren) {
      const childRows = {}
      for (const row of this._rows) {
        if (row._children && Object.keys(row._children).length) {
          childRows[row.id] = {}
          for (const [cid, cds] of Object.entries(row._children)) {
            childRows[row.id][cid] = cds.exportColumnar({ includeChildren })
          }
        }
      }
      if (Object.keys(childRows).length) obj.childRows = childRows
    }
    return obj
  }

  static fromJSON(json) {
    if (!json) return new CmxDataSet()
    const cols = json.columns || []
    const ds   = new CmxDataSet({ datasetId: json.datasetId, columns: cols })
    // 批量快路径:静态工厂返回前 ds 上不可能有监听器 —— 跳过逐行 ds-row-added 事件;
    // 列已由 columns 全量声明,_trackColumns 的逐键 includes 扫描必为 no-op,一并跳过。
    // 注意 `{...obj}` 展开不可省:逐键动态构建的 obj 是慢形态(dictionary mode),
    // 展开重整成 V8 fast-shape 克隆后 CmxRowSet 的 Object.assign 才走快路径 ——
    // 实测(10 万行×50 列,每进程独立 A/B)带展开 283ms、去掉展开反而 908ms。
    const nCols = cols.length
    for (const raw of (json.rows || [])) {
      const obj = {}
      for (let i = 0; i < nCols; i++) obj[cols[i]] = raw[i]
      if (obj.id == null) obj.id = `r${Math.random().toString(36).slice(2, 9)}`
      const row = new CmxRowSet({ ...obj }, {}, ds)
      ds._rows.push(row)
      // 索引键统一 String(id)（与 addRow / getRow 对齐）——裸数字 id 入键会使
      // getRow(String(id)) 永远查不到行（fromJSON 装载的单据 id 均为 BIGINT 数字），
      // 连锁炸掉收集器取值（fields 导出为空 → 回存对账失败/静默零写）。
      ds._index.set(String(obj.id), row)
    }
    if (json.childRows) {
      for (const [rowId, childMap] of Object.entries(json.childRows)) {
        // childRows 的 key（父 id）是 JSON 对象键、必为字符串；而行的 id 可能是数字
        // （如 BIGINT）。先按原值查，未命中则按字符串宽松匹配，避免类型不一致丢子层。
        let row = ds.getRow(rowId)
        if (!row) {
          row = ds._rows.find((r) => String(r.id) === String(rowId)) ?? null
        }
        if (!row) continue
        for (const [cid, cdsjson] of Object.entries(childMap)) {
          row._children[cid] = CmxDataSet.fromJSON(cdsjson)
        }
      }
    }
    // 后端 count_total=true 时回传的列式包带 total（根层 COUNT(*) 结果）；
    // 旧版本/未启用分页时 pkg.total 缺省为 undefined，保持 _total=null 不变。
    if (json.total != null) ds._total = Number(json.total)
    return ds
  }

  // 兼容旧调用
  toRowObjects(includeChildren = false) { return this.toPlainRows(includeChildren) }
  static fromMasterSlaveWrap(wrap)      { return CmxDataSet._wrapToDs(wrap) }
}
