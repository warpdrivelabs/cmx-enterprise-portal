/**
 * CmxDataSetView — CmxDataSet 的「过滤视图」（零拷贝）
 *
 * 视图的 _rows 只存**主集（master CmxDataSet）里同一批 CmxRowSet 的引用**，
 * 不复制任何字段数据：内存 ≈ O(命中行数) 个指针 + Map 项，与字段宽度无关。
 *
 *   主集 ._rows: [R0, R1, R2, R3, ...]      ← 唯一一份 CmxRowSet 数据
 *   视图 ._rows: [ R1,     R3 ]             ← 只存引用（R1/R3 === 主集里的同一对象）
 *
 * 关键约束：
 *  - 视图**绝不修改 row._ds**：行的所有权始终属于主集。因此一行被多个视图共享、
 *    编辑（row.set）只通知主集一次，主集再广播 row-changed，所有 live 视图据此重过滤。
 *  - 视图自身派发 CmxDataSet 同款事件（ds-row-added / ds-row-removed / row-changed /
 *    cursor-changed），因而可直接 grid.setDataSet(view)，无需改 grid。
 *  - 写操作（addRow/removeRow）委托给主集：过滤集是投影，不独立增删底层数据。
 *
 * 成员资格（membership）由 predicate(row) => boolean 决定。两种来源：
 *  ① 直接传函数；
 *  ② 声明式列条件（buildPredicate）：{ match:'all'|'any', conditions:[{col,op,value}] }，
 *     op ∈ eq/ne/gt/ge/lt/le/in/nin/contains/startsWith/endsWith/between/empty/notEmpty/expr。
 *
 * live 同步（订阅主集）：
 *   ds-row-added(R)   → predicate(R) 真则纳入
 *   ds-row-removed(R) → 在视图内则移出
 *   row-changed(R)    → 重算成员资格：命中⇄不命中之间翻转时 加入/移出，否则转发 row-changed
 */

import { CmxDataSet, registerDataSetViewClass } from './cmx-data-set.js'
import { evalFormula } from './formula-eval.js'

/** 声明式条件 → predicate(row)=>boolean。导出供 CmxDataSet.createView/fillView 复用。 */
export function buildPredicate (spec) {
  if (spec == null) return () => true
  if (typeof spec === 'function') return spec
  // 单条件对象 {col,op,value} 也接受
  const conditions = Array.isArray(spec.conditions)
    ? spec.conditions
    : (spec.col != null ? [spec] : [])
  if (!conditions.length) return () => true
  const matchAll = String(spec.match ?? 'all').toLowerCase() !== 'any'
  const tests = conditions.map(compileCondition)
  return (row) => matchAll ? tests.every((t) => t(row)) : tests.some((t) => t(row))
}

function compileCondition (cond) {
  const col = cond.col
  const op = String(cond.op ?? 'eq').toLowerCase()
  const want = cond.value
  const get = (row) => (row == null ? undefined : row[col])
  switch (op) {
    case 'eq':  return (r) => get(r) === want || looseEq(get(r), want)
    case 'ne':  return (r) => !(get(r) === want || looseEq(get(r), want))
    case 'gt':  return (r) => num(get(r)) > num(want)
    case 'ge': case 'gte': return (r) => num(get(r)) >= num(want)
    case 'lt':  return (r) => num(get(r)) < num(want)
    case 'le': case 'lte': return (r) => num(get(r)) <= num(want)
    case 'in':  return (r) => asArray(want).some((w) => w === get(r) || looseEq(get(r), w))
    case 'nin': case 'notin': return (r) => !asArray(want).some((w) => w === get(r) || looseEq(get(r), w))
    case 'contains':   return (r) => str(get(r)).includes(str(want))
    case 'startswith': return (r) => str(get(r)).startsWith(str(want))
    case 'endswith':   return (r) => str(get(r)).endsWith(str(want))
    case 'between': {  // value: [min, max]，闭区间
      const [lo, hi] = asArray(want)
      return (r) => num(get(r)) >= num(lo) && num(get(r)) <= num(hi)
    }
    case 'empty':    return (r) => isEmpty(get(r))
    case 'notempty': return (r) => !isEmpty(get(r))
    case 'expr': {   // 用 formula-eval：scope = 行字段铺平 + value(当前 col 值)
      const expr = String(cond.value ?? cond.expr ?? '')
      return (r) => {
        const scope = { ...plain(r), value: col != null ? get(r) : undefined }
        return !!evalFormula(expr, scope, false)
      }
    }
    default: return () => true
  }
}

// ── 小工具 ──
const num = (x) => Number(x) || 0
const str = (x) => (x == null ? '' : String(x))
const asArray = (x) => (Array.isArray(x) ? x : (x == null ? [] : [x]))
const isEmpty = (x) => x == null || x === '' || (Array.isArray(x) && x.length === 0)
const looseEq = (a, b) => (a == null || b == null) ? false : String(a) === String(b)
const plain = (row) => {
  if (row && typeof row.toPlainObject === 'function') return row.toPlainObject()
  const o = {}
  for (const k of Object.keys(row || {})) if (!k.startsWith('_')) o[k] = row[k]
  return o
}

export class CmxDataSetView extends CmxDataSet {
  /**
   * @param {object} [opts]
   * @param {string} [opts.datasetId]
   * @param {boolean} [opts.live=true]  是否订阅主集事件自动维护成员
   */
  constructor (opts = {}) {
    super(opts)
    this.isView = true
    this.master = null
    this._predicate = () => true
    this._live = opts.live !== false
    this._masterListeners = null
  }

  /** 当前过滤条件（函数）。只读。 */
  get predicate () { return this._predicate }
  /** 是否 live（订阅主集自动同步）。 */
  get live () { return this._live }

  /**
   * 把视图绑定到 master 并按 predicate 灌入「引用」。
   * 由 CmxDataSet.fillView() / createView() 调用；也可直接用。
   * 复用既有 view 实例：清空旧引用 → 重新过滤 → （live）重订阅。
   * @param {CmxDataSet} master 主数据集
   * @param {Function|object} [predicate] 函数或声明式条件；省略则沿用现有 predicate
   * @param {object} [opts] { live?, resetCursor? }
   */
  bindTo (master, predicate, opts = {}) {
    this._detachMaster()                       // 解绑旧主集监听（若有）
    this.master = master || null
    if (predicate !== undefined) this._predicate = buildPredicate(predicate)
    if (opts.live !== undefined) this._live = opts.live !== false
    this._rebuild(opts.resetCursor !== false)
    if (this._live && this.master) this._attachMaster()
    return this
  }

  /** 改过滤条件并立即重算（保持同一 view 实例与其上所有 grid 绑定）。 */
  setFilter (predicate, opts = {}) {
    this._predicate = buildPredicate(predicate)
    this._rebuild(opts.resetCursor !== false)
    return this
  }

  /** 重新跑一遍主集所有行，重建引用数组（成员可能因外部直改而变化时手动调用）。 */
  refilter (opts = {}) {
    this._rebuild(opts.resetCursor !== false)
    return this
  }

  // ── 全量重建：清空 → 遍历主集 → push 命中行的「引用」（不 new CmxRowSet） ──
  _rebuild (resetCursor = true) {
    this._rows = []
    this._index = new Map()
    if (resetCursor) this._cursor = -1
    const masterRows = this.master ? this.master.rows : []
    for (const row of masterRows) {
      if (this._test(row)) {
        this._rows.push(row)           // ← 存引用，零拷贝
        this._index.set(row.id, row)
      }
    }
    // 整存通知：grid 的 ds-row-added/removed 监听都走 _refreshSource() 整存读 view.rows
    this.dispatchEvent(new CustomEvent('view-rebuilt', { detail: { size: this._rows.length } }))
    this.dispatchEvent(new CustomEvent('ds-row-added', { detail: { row: null, rebuilt: true } }))
  }

  _test (row) {
    try { return !!this._predicate(row) } catch { return false }
  }

  // ── live 同步：订阅主集事件 ──
  _attachMaster () {
    const onAdded = (ev) => {
      const row = ev.detail?.row
      if (!row || this._index.has(row.id)) return
      if (this._test(row)) {
        this._rows.push(row)
        this._index.set(row.id, row)
        this.dispatchEvent(new CustomEvent('ds-row-added', { detail: { row } }))
      }
    }
    const onRemoved = (ev) => {
      const row = ev.detail?.row
      if (!row || !this._index.has(row.id)) return
      this._removeRef(row.id)
      this.dispatchEvent(new CustomEvent('ds-row-removed', { detail: { row } }))
    }
    const onChanged = (ev) => {
      const row = ev.detail?.row
      if (!row) return
      const inView = this._index.has(row.id)
      const hit = this._test(row)
      if (inView && !hit) {                 // 由命中变不命中 → 移出
        this._removeRef(row.id)
        this.dispatchEvent(new CustomEvent('ds-row-removed', { detail: { row } }))
      } else if (!inView && hit) {          // 由不命中变命中 → 加入
        this._rows.push(row)
        this._index.set(row.id, row)
        this.dispatchEvent(new CustomEvent('ds-row-added', { detail: { row } }))
      } else if (inView && hit) {           // 仍命中 → 透传变更（grid 刷新单元格）
        this.dispatchEvent(new CustomEvent('row-changed', { detail: ev.detail }))
      }
    }
    this.master.addEventListener('ds-row-added', onAdded)
    this.master.addEventListener('ds-row-removed', onRemoved)
    this.master.addEventListener('row-changed', onChanged)
    this._masterListeners = { onAdded, onRemoved, onChanged }
  }

  _detachMaster () {
    if (this.master && this._masterListeners) {
      const { onAdded, onRemoved, onChanged } = this._masterListeners
      this.master.removeEventListener('ds-row-added', onAdded)
      this.master.removeEventListener('ds-row-removed', onRemoved)
      this.master.removeEventListener('row-changed', onChanged)
    }
    this._masterListeners = null
  }

  _removeRef (id) {
    const row = this._index.get(id)
    if (!row) return
    const idx = this._rows.indexOf(row)
    if (idx !== -1) this._rows.splice(idx, 1)
    this._index.delete(id)
    if (this._cursor >= this._rows.length) this._cursor = this._rows.length - 1
  }

  // ── 写操作委托主集（过滤集是投影，不独立增删底层数据） ──
  addRow (data = {}, children = {}) {
    if (!this.master) return super.addRow(data, children)
    const row = this.master.addRow(data, children)   // 主集派发 ds-row-added → 本视图按条件纳入
    if (!this._live && this._test(row) && !this._index.has(row.id)) {
      this._rows.push(row); this._index.set(row.id, row)
    }
    return row
  }

  removeRow (id) {
    if (!this.master) return super.removeRow(id)
    return this.master.removeRow(id)                  // 主集派发 ds-row-removed → 本视图移出引用
  }

  /** 解绑主集监听，释放引用（主集与其它视图不受影响）。SPA 销毁时调用防泄漏。 */
  dispose () {
    this._detachMaster()
    this.master = null
    this._rows = []
    this._index = new Map()
    this._cursor = -1
  }
}

// 注入基类的延迟注册槽，使 CmxDataSet.createView() 能实例化本类（避免基类静态 import 子类形成循环依赖）
registerDataSetViewClass(CmxDataSetView)
