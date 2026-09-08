/**
 * CmxColumnModel — 列模型（与渲染层无关的纯元数据）
 *
 * 将 CmxColumn 和 CmxColumnGroup 组织为一张完整的列配置方案。
 * 通过 toDescriptors() 输出通用中间格式，由适配器（cmx-column-adapter.js）
 * 转换为具体 grid（cmx-ui5-table / cmx-revo-grid 等）所需的列定义。
 *
 * 属性：
 *   datasetId    {string} 对应数据集 ID（与 CmxDataSet.datasetId 相同）
 *   caption      {string} 模型显示标题
 *   members      {Array}  顶层成员列表（CmxColumn | CmxColumnGroup）
 *   toTitleCols  {string} 逗号分隔的列 id，可视组件从行数据中取这些列组合成 title
 *   iconCol      {string} 列 id，可视组件从行数据中取该列的值用于 icon 显示
 */

import { CmxColumn }      from './cmx-column.js'
import { CmxColumnGroup } from './cmx-column-group.js'
import { resolveCoord }   from './cmx-doc-coord.js'

export class CmxColumnModel extends EventTarget {
  constructor(props = {}) {
    super()
    this.datasetId   = props.datasetId   ?? ''
    this.caption     = props.caption     ?? ''
    this.toTitleCols = props.toTitleCols ?? ''
    this.iconCol     = props.iconCol     ?? ''
    this.members = []
    for (const m of (props.members || [])) this.members.push(m)
  }

  // ─── 成员管理 ─────────────────────────────────────────────────────────

  /** 内部派发 `columns-changed`。视图组件订阅后会重新同步列。 */
  _emitChange (reason) {
    try {
      this.dispatchEvent(new CustomEvent('columns-changed', { detail: { reason, model: this } }))
    } catch (_) { /* host without EventTarget shim — ignore */ }
  }

  addMember(member) {
    if (!(member instanceof CmxColumn) && !(member instanceof CmxColumnGroup)) {
      throw new TypeError('[CmxColumnModel] member must be CmxColumn or CmxColumnGroup')
    }
    this.members.push(member)
    this._emitChange('add')
    return this
  }

  removeMember(id) {
    const idx = this.members.findIndex((m) => m.id === id)
    if (idx !== -1) { this.members.splice(idx, 1); this._emitChange('remove'); return true }
    for (const m of this.members) {
      if (m instanceof CmxColumnGroup && m.removeMember(id)) { this._emitChange('remove'); return true }
    }
    return false
  }

  /**
   * 整体替换成员列表（FlexibleCombination 等动态列驱动者用）。
   * 调用方传入新的 CmxColumn[] / CmxColumnGroup[]；触发一次 `columns-changed`。
   */
  setMembers(members) {
    if (!Array.isArray(members)) throw new TypeError('[CmxColumnModel] setMembers expects an array')
    for (const m of members) {
      if (!(m instanceof CmxColumn) && !(m instanceof CmxColumnGroup)) {
        throw new TypeError('[CmxColumnModel] each member must be CmxColumn or CmxColumnGroup')
      }
    }
    this.members = members.slice()
    this._emitChange('replace')
    return this
  }

  /**
   * 从已声明的元数据模型（CmxDCTMeta/CmxDOCMeta）某张表的字段构建列并整体替换。
   *
   * 用于运行时动态切换字典/单据的场景：元数据 loadById 换了定义后，调本方法重建列。
   * 内部委托 init-page-models.js 的 metaTableFieldsToColumns（动态 import 避免循环依赖），
   * 与 initPageModels 阶段 1.5 的自动列填充走同一段转换逻辑（字段→edit.mode/display/refDict/editSettings）。
   *
   * @param {object} metaModel CmxDCTMeta/CmxDOCMeta 实例（已 loadById/load 完成）
   * @param {string} tableId 字典编码 / 单据表 id（metaModel.getDictionary/getTable 的 key）
   * @param {object} [opts] { respectOrder?: boolean, coord?: object }
   *   - respectOrder：是否尊重元数据字段顺序（fieldSetOrder 场景）
   *   - coord：坐标 {domain, application, module, dbId?}，用于给 refDict 列补 editSettings.coord
   *     （cmx-dict-select 弹窗请求 /api/dct/data/search 时必需）。不传时从 metaModel 实例自身坐标兜底。
   * @returns {Promise<this>} resolve 后列已替换、`columns-changed` 已派发（grid/form 自动重刷）
   */
  async fromMeta (metaModel, tableId, opts = {}) {
    if (!metaModel || typeof metaModel.getDictionary !== 'function' && typeof metaModel.getTable !== 'function') {
      console.warn('[CmxColumnModel.fromMeta] metaModel 缺少 getDictionary/getTable 方法')
      return this
    }
    const table = typeof metaModel.getDictionary === 'function'
      ? metaModel.getDictionary(tableId)
      : metaModel.getTable(tableId)
    if (!table || typeof table.listFields !== 'function') {
      console.warn(`[CmxColumnModel.fromMeta] 元数据中未找到表 '${tableId}'`)
      return this
    }
    const { metaTableFieldsToColumns } = await import('./init-page-models.js')
    const kind = metaModel.kind || 'DCT'
    // DCT 场景：从 table.raw.dictMeta 提取字典业务属性，构造 meta 对象走增强路径
    // （业务键 readonlyWhen、必填标识、树形父节点字典选择、派生层级隐藏等）。
    // DOC 场景仍传字符串 kind，保持原行为。
    const dictMeta = (kind === 'DCT' && table.raw && table.raw.dictMeta) || null
    const metaOrKind = dictMeta ? {
      kind: 'DCT',
      pk: dictMeta.idField || dictMeta.pk || 'id',
      codeField: dictMeta.codeField || 'code',
      labelField: dictMeta.labelField || 'name',
      selfHierarchy: !!dictMeta.selfHierarchy,
      parentField: dictMeta.parentField || 'parent_id',
      dictCode: tableId,
      domain: metaModel.domain || '',
      application: metaModel.application || metaModel.app || '',
      module: metaModel.module || '',
    } : kind
    const coord = {
      domain: metaModel.domain || '',
      application: metaModel.application || metaModel.app || '',
      module: metaModel.module || '',
      ...(metaModel.dbId ? { dbId: metaModel.dbId } : {}),
    }
    const cols = metaTableFieldsToColumns(table.listFields(), metaOrKind, {
      respectOrder: opts.respectOrder === true,
      coord: (coord.domain || coord.application || coord.module) ? coord : undefined,
    })
    // 坐标回填：优先用传入的 coord，其次 metaModel 实例自身的 domain/application/module（initPage 回填过的）。
    // refDict 列若缺 editSettings.coord，cmx-dict-select 弹窗请求会缺 domain → 后端 400。
    const fallbackCoord = opts.coord || {
      domain: metaModel.domain || '',
      application: metaModel.application || metaModel.app || '',
      module: metaModel.module || '',
      dbId: metaModel.dbId || '',
    }
    if (fallbackCoord.domain || fallbackCoord.application || fallbackCoord.module) {
      for (const col of cols) {
        if (!col || !col.refDict) continue
        if (!col.editSettings || typeof col.editSettings !== 'object') {
          const merged = resolveCoord({}, fallbackCoord)
          if (!merged.domain || !merged.application || !merged.module) continue
          col.editSettings = {
            dictCode: col.refDict,
            idCol: col.refField || 'code',
            labelCol: col.displayField || 'name',
            coord: merged,
          }
        } else if (!col.editSettings.coord) {
          const merged = resolveCoord({}, fallbackCoord)
          if (merged.domain && merged.application && merged.module) col.editSettings.coord = merged
        }
      }
    }
    // 合并：元数据自动列 + 页面手写列（如操作列）追加在后，与 init-page-models 阶段1.5 一致。
    this.setMembers([...cols, ...(this._manualMembers || [])])
    return this
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

  // ─── title 列 ─────────────────────────────────────────────────────────

  /** 返回 toTitleCols 解析后的列 id 数组，未设置时返回空数组。 */
  getTitleColIds() {
    if (!this.toTitleCols) return []
    return this.toTitleCols.split(',').map((s) => s.trim()).filter(Boolean)
  }

  // ─── 通用描述符输出 ────────────────────────────────────────────────────

  /**
   * 输出顶层所有成员的通用描述符数组（中间格式）。
   * 不可见的 CmxColumn 被过滤，CmxColumnGroup 不过滤（由适配器决定是否渲染）。
   *
   * 返回 ColumnDescriptor[]，每项为 CmxColumn.toDescriptor() 或 CmxColumnGroup.toDescriptor()。
   * 适配器层将此数组转换为具体 grid 的列定义。
   */
  toDescriptors() {
    return this.members
      .filter((m) => m instanceof CmxColumn ? m.visible !== false : true)
      .map((m) => {
        if (m && typeof m.toDescriptor === 'function') return m.toDescriptor()
        return new CmxColumn(m || {}).toDescriptor()
      })
  }

  /**
   * 完整聚合配置（按 agg 类型分组），用于驱动 grid 的合计行或后端聚合。
   * 返回 Map<agg, string[]>：{ 'sum' → ['debit','credit'], 'count' → ['qty'] }
   */
  toAggregateMap() {
    const map = new Map()
    const walk = (members) => {
      for (const m of members) {
        if (m instanceof CmxColumnGroup) {
          for (const { key, agg } of m.aggregateColumns()) {
            if (!map.has(agg)) map.set(agg, [])
            if (!map.get(agg).includes(key)) map.get(agg).push(key)
          }
          walk(m.members || [])
        } else if (m instanceof CmxColumn && m.agg) {
          if (!map.has(m.agg)) map.set(m.agg, [])
          if (!map.get(m.agg).includes(m.id)) map.get(m.agg).push(m.id)
        }
      }
    }
    walk(this.members)
    return map
  }

  // ─── 序列化 ───────────────────────────────────────────────────────────

  toJSON() {
    return {
      datasetId:   this.datasetId,
      caption:     this.caption,
      toTitleCols: this.toTitleCols,
      iconCol:     this.iconCol,
      members:     this.members.map((m) => m.toJSON()),
    }
  }

  static fromJSON(json) {
    if (!json) return new CmxColumnModel()
    const members = (json.members || []).map((m) =>
      m.__type === 'CmxColumnGroup' ? CmxColumnGroup.fromJSON(m) : CmxColumn.fromJSON(m)
    )
    return new CmxColumnModel({ datasetId: json.datasetId, caption: json.caption, toTitleCols: json.toTitleCols, iconCol: json.iconCol, members })
  }
}
