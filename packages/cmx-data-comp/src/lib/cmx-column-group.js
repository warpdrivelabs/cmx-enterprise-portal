/**
 * CmxColumnGroup — 列分组定义对象（与渲染层无关的纯元数据）
 *
 * 将若干 CmxColumn 或嵌套的 CmxColumnGroup 组织为一个带标题的分组，
 * 支持分组内聚合（合计/平均/最大/最小/计数），聚合位置可在前或在后。
 * 通过 toDescriptor() 输出通用中间格式，由适配器转换为具体 grid 的分组列定义。
 *
 * 属性：
 *   id                {string}          分组唯一标识
 *   caption           {string}          分组表头显示文字
 *   aggregate         {object}          启用的聚合类型：{ sum, avg, max, min, count }，默认全 false
 *   aggregatePosition {'before'|'after'} 合计行相对数据行的位置，默认 'after'
 *   members           {Array}           成员列表（CmxColumn | CmxColumnGroup）
 */

import { CmxColumn } from './cmx-column.js'

const DEFAULT_AGGREGATE = { sum: false, avg: false, max: false, min: false, count: false }
const NUMERIC_DATA_TYPES = new Set(['INT', 'BIGINT', 'TINYINT', 'DECIMAL', 'NUMBER', 'FLOAT', 'DOUBLE'])

function isNumericColumn (column) {
  return NUMERIC_DATA_TYPES.has(String(column?.dataType || '').toUpperCase())
}

export class CmxColumnGroup {
  constructor(props = {}) {
    this.id                = props.id                ?? ''
    this.caption           = props.caption           ?? ''
    this.aggregate         = { ...DEFAULT_AGGREGATE, ...(props.aggregate || {}) }
    this.aggregatePosition = props.aggregatePosition ?? 'after'
    this.members           = []
    for (const m of (props.members || [])) this.members.push(m)

    /* 完整继承：保留所有未被显式建模的额外属性（CTX 分组节点透传键）。仅携带与序列化，
       不参与 toDescriptor 既有逻辑；消费端后期处理。members 已单独处理，不在此覆盖。 */
    for (const k of Object.keys(props)) {
      if (k === 'members') continue
      if (!(k in this)) this[k] = props[k]
    }
  }

  // ─── 成员管理 ─────────────────────────────────────────────────────────

  addMember(member) {
    if (!(member instanceof CmxColumn) && !(member instanceof CmxColumnGroup)) {
      throw new TypeError('[CmxColumnGroup] member must be CmxColumn or CmxColumnGroup')
    }
    this.members.push(member)
    return this
  }

  removeMember(id) {
    const idx = this.members.findIndex((m) => m.id === id)
    if (idx !== -1) { this.members.splice(idx, 1); return true }
    for (const m of this.members) {
      if (m instanceof CmxColumnGroup && m.removeMember(id)) return true
    }
    return false
  }

  findById(id) {
    for (const m of this.members) {
      if (m.id === id) return m
      if (m instanceof CmxColumnGroup) {
        const found = m.findById(id)
        if (found) return found
      }
    }
    return null
  }

  // ─── 叶列收集 ─────────────────────────────────────────────────────────

  _leafColumns() {
    const result = []
    for (const m of this.members) {
      if (m instanceof CmxColumn) result.push(m)
      else if (m instanceof CmxColumnGroup) result.push(...m._leafColumns())
    }
    return result
  }

  get leafCount() {
    return this._leafColumns().filter((c) => c.visible !== false).length
  }

  // ─── 聚合配置 ─────────────────────────────────────────────────────────

  /**
   * 收集所有启用聚合的 { key, agg } 配置（与渲染层无关的通用格式）。
   * 返回形如：[{ key:'debit', agg:'sum' }, { key:'credit', agg:'avg' }, ...]
   */
  aggregateColumns() {
    const numericLeafs = this._leafColumns()
      .filter((c) => c.visible !== false && isNumericColumn(c))
    const result = []
    for (const agg of ['sum', 'avg', 'max', 'min']) {
      if (!this.aggregate[agg]) continue
      for (const col of numericLeafs) result.push({ key: col.id, agg })
    }
    if (this.aggregate.count) {
      const first = this._leafColumns().find((c) => c.visible !== false)
      if (first) result.push({ key: first.id, agg: 'count' })
    }
    return result
  }

  // ─── 通用描述符输出 ────────────────────────────────────────────────────

  /**
   * 输出通用分组描述符（中间格式）：
   * {
   *   type: 'group',
   *   id, caption,
   *   aggregate, aggregatePosition,
   *   children: [ ColumnDescriptor | GroupDescriptor, ... ]
   * }
   * 适配器层将此格式转换为具体 grid 的分组列定义。
   */
  toDescriptor() {
    return {
      type:              'group',
      id:                this.id,
      caption:           this.caption || this.id,
      aggregate:         { ...this.aggregate },
      aggregatePosition: this.aggregatePosition,
      children:          this.members
        .filter((m) => m instanceof CmxColumn ? m.visible !== false : true)
        .map((m) => m.toDescriptor()),
    }
  }

  // ─── 序列化 ───────────────────────────────────────────────────────────

  toJSON() {
    const KNOWN = new Set(['id', 'caption', 'aggregate', 'aggregatePosition', 'members'])
    const json = {
      __type:            'CmxColumnGroup',
      id:                this.id,
      caption:           this.caption,
      aggregate:         { ...this.aggregate },
      aggregatePosition: this.aggregatePosition,
      members:           this.members.map((m) => m.toJSON()),
    }
    // 完整继承的额外属性（CTX 分组透传键）：原样输出，函数值丢弃
    for (const k of Object.keys(this)) {
      if (KNOWN.has(k)) continue
      if (typeof this[k] === 'function') continue
      json[k] = this[k]
    }
    return json
  }

  static fromJSON(json) {
    if (!json) return new CmxColumnGroup()
    const members = (json.members || []).map((m) =>
      m.__type === 'CmxColumnGroup' ? CmxColumnGroup.fromJSON(m) : CmxColumn.fromJSON(m)
    )
    return new CmxColumnGroup({ ...json, members })
  }
}
