/**
 * flexible-combination-engine — 弹性组合运行时引擎（FlexibleCombination）（领域无关）
 *
 * 详见 docs/flexible-combination-meta-model.md。把「锚点维度组合 → 细分明细 schema」这套元数据
 * 解析成可驱动 cmx-revo-grid / cmx-ui5-table 的 CmxColumn[]，并提供属性带出、
 * 计算公式重算、校验。财务「科目→辅助核算」只是 anchor=[account] 的一个实例。
 *
 * 构造：
 *   new FlexibleCombinationEngine({ dimensions, rules })
 *     dimensions: Record<code, { name, attributes?, values?, dict? }>
 *     rules:      FlexibleCombinationRule[]   见 docs
 *
 * 主要 API：
 *   resolveRule(anchorValues)                 -> rule | null（单条最具体）
 *   resolveMergedRule(anchorValues)           -> rule | null（所有命中规则字段合并；重名取高分，同分取靠前）
 *   buildColumns(rule)                        -> CmxColumn[]
 *   buildMembers(rule)                        -> (CmxColumn|CmxColumnGroup)[]（含分组）
 *   buildColumnModel(rule, combination)           -> CmxColumnModel（完整实例：members + caption/datasetId/toTitleCols/iconCol）
 *   buildAllFieldSets(rule, combination)          -> [{index,table,name,columns,members,columnModel,model}]（多套表字段集，model 为 CmxColumnModel 实例）
 *   buildColumnsForTable(rule, tableName)     -> CmxColumn[]（按关联表取某套字段集）
 *   onPickDimension(row, fieldCode, code, rule)-> row（带出 attribute + 默认度量）
 *   recompute(row, rule)                      -> row（按 dependsOn 拓扑序算 computed measure）
 *   validate(row, rule)                       -> { valid, errors:[{code,message}] }
 *
 * 字段三态 kind：dimension | attribute | measure | text（text=自由输入列，无维度绑定）
 */
import { CmxColumn } from './cmx-column.js'
import { CmxColumnGroup } from './cmx-column-group.js'
import { CmxColumnModel } from './cmx-column-model.js'
import { editModeKind } from './cmx-field-uicontrol.js'
import { evalFormula } from './formula-eval.js'
import { fieldCaption, fieldId } from './cmx-field-meta.js'
import { expandRuleDetail } from './flc-overlay.js'
import { effectiveDictId } from './drn.js'

/** 物理 dataType 是否数值类型（用于数字精度显示分支）。 */
function _isNumericType (dt) {
  return ['INT', 'BIGINT', 'TINYINT', 'DECIMAL', 'NUMBER'].includes(String(dt || '').toUpperCase())
}

function _fieldDataType (field) {
  if (field.dataType) return field.dataType
  if (field.dimType === 'measure') return 'DECIMAL'
  return 'VARCHAR'
}

export class FlexibleCombinationEngine {
  /**
   * @param {{
   *   dimensions?: object, rules?: array,
   *   docTables?: (tableName:string) => object[],   // 可选：关联单据某表的物理列（供 overlay use/pick 展开）
   *   dictOf?: (dictCode:string) => object,          // 可选：字典取数配置（叠在列之下作为 base）
   *   from?: {domain?,app?,module?}, imports?: array // 可选：DRN 引用上下文（refDict 支持 @别名/drn:）
   * }} opts
   */
  constructor ({ dimensions = {}, rules = [], docTables = null, dictOf = null, from = null, imports = null } = {}) {
    this.dimensions = dimensions
    const list = Array.isArray(rules) ? rules : []
    // overlay 展开依赖（缺省时 use/pick 无法展开，仅 inline fields 生效）
    this._docTables = typeof docTables === 'function' ? docTables : null
    this._dictOf = typeof dictOf === 'function' ? dictOf : null
    // DRN 引用上下文（字段 refDict 归一为有效 dictId）
    this._refFrom = from || null
    this._refImports = Array.isArray(imports) ? imports : null
    // 构造期一次性把 overlay 规则（use/pick）展开为 inline，使 buildColumns / recompute /
    // validate / resolveMergedRule 等所有方法看到一致的 detail.fields（避免半展开不一致）。
    this.rules = this._docTables ? list.map((r) => this._expandRuleDetail(r)) : list
  }

  /** 归一字段 refDict → 有效 dict/维度 code（裸 code 原样，DRN/别名展开取 name）。 */
  _effectiveRef (raw) {
    return effectiveDictId(raw, { from: this._refFrom, imports: this._refImports })
  }

  /**
   * 把单条规则的 overlay detail（use/pick）展开为 inline；无 overlay 或无 docTables 时原样返回。
   * detail.fieldTabs[] 各字段集与 detail 同构（各自带 table/use/pick/over/fields/groups），
   * 其 overlay 入口一并展开，保证 fieldSetsOf/buildMembers 读到一致的 inline 形态。
   */
  _expandRuleDetail (rule) {
    if (!this._docTables) return rule
    const detail = rule?.detail
    if (!detail) return rule
    const deps = { tableCols: this._docTables, dictOf: this._dictOf || undefined }
    const detailHasOverlay = detail.use != null || Array.isArray(detail.pick)
    const tabs = Array.isArray(detail.fieldTabs) ? detail.fieldTabs : []
    const tabsHaveOverlay = tabs.some((t) => t && (t.use != null || Array.isArray(t.pick)))
    if (!detailHasOverlay && !tabsHaveOverlay) return rule

    let nextDetail = detail
    if (detailHasOverlay) {
      const { fields, groups } = expandRuleDetail(detail, deps)
      nextDetail = { ...detail, fields }
      delete nextDetail.use
      delete nextDetail.pick
      delete nextDetail.over
      if (groups) nextDetail.groups = groups
    }
    if (tabsHaveOverlay) {
      nextDetail = {
        ...nextDetail,
        fieldTabs: tabs.map((t) => {
          if (!t || (t.use == null && !Array.isArray(t.pick))) return t
          const { fields, groups } = expandRuleDetail(t, deps)
          const next = { ...t, fields }
          delete next.use
          delete next.pick
          delete next.over
          if (groups) next.groups = groups
          return next
        }),
      }
    }
    return { ...rule, detail: nextDetail }
  }

  getDimension (code) { return this.dimensions[code] || null }

  /** 在维度的内置 values 里按 code 找到值对象（含属性）；找不到返回 { code }。 */
  resolveDimValue (dimCode, code) {
    const dim = this.getDimension(dimCode)
    const list = (dim && Array.isArray(dim.values)) ? dim.values : []
    return list.find((v) => String(v.code) === String(code)) || { code }
  }

  /**
   * 按锚点维度值找最佳规则：精确值 > in/属性匹配 > 通配 > anchor 同维度的兜底（无 match）。
   * 仅返回单条最具体的规则；若要合并所有命中规则的字段，用 resolveMergedRule。
   * @param {Record<string,string|number>} anchorValues  例 { account:'1122' } / { txType:'sale', productType:'goods' }
   */
  resolveRule (anchorValues = {}) {
    const matched = this._matchedRules(anchorValues)
    return matched.length ? matched[0].rule : null
  }

  /**
   * 命中规则列表：返回所有 match 未被否决（score≥0）的规则，按"具体度"降序、同分保持遍历顺序。
   * 具体度 specificity = score*100 + 锚点维度数（维度更多的锚点更具体）。
   * @returns {{rule:object, score:number, order:number}[]}
   */
  _matchedRules (anchorValues = {}) {
    const out = []
    let order = 0
    for (const r of this.rules) {
      const dims = r.anchor?.dimensions || []
      if (!dims.every((d) => d in anchorValues)) continue
      const score = this._scoreMatch(r.anchor?.match || null, anchorValues)
      if (score < 0) continue
      const specificity = score * 100 + dims.length
      out.push({ rule: r, score: specificity, order: order++ })
    }
    // 稳定降序：同分保持原遍历顺序（用于"同分取靠前者"）
    out.sort((a, b) => (b.score - a.score) || (a.order - b.order))
    return out
  }

  /**
   * 把所有命中规则合并成一条规则：字段按 code 合并——重名列取得分高者，
   * 同分取遍历顺序（规则定义顺序）靠前者；输出字段按"定义顺序里首次出现"排列，
   * 布局稳定、与作者书写顺序一致。分组按定义顺序拼接（buildMembers 内部对重复
   * 字段/空组已有去重保护）；columnModel 高分键覆盖、同分靠前者优先。
   *
   * 单条命中时原样返回该规则；无命中返回 null。
   * @param {Record<string,string|number>} anchorValues
   */
  resolveMergedRule (anchorValues = {}) {
    const matched = this._matchedRules(anchorValues)
    if (!matched.length) return null
    if (matched.length === 1) return matched[0].rule

    // 按定义顺序遍历（order 升序）
    const byDefOrder = [...matched].sort((a, b) => a.order - b.order)

    // 字段集0：跨规则合并字段（位置取首次出现；值取得分高者，同分保留先到者=定义靠前）
    const fields = this._mergeFieldLists(byDefOrder.map(({ rule, score }) => ({ fields: rule.detail?.fields, score })))
    // 分组：按定义顺序拼接
    const groups = []
    for (const { rule } of byDefOrder) {
      if (Array.isArray(rule.detail?.groups)) groups.push(...rule.detail.groups)
    }
    // detail.table：取定义顺序首个非空（跨面板不同表时以最靠前规则为准）
    const table = byDefOrder.map((m) => m.rule.detail?.table).find((t) => !!t) || ''

    // fieldTabs：按字段集标识（table，缺省退 name/id）跨规则聚合——同表字段合并、分组拼接、
    // columnModel 高分覆盖（与规则级同策略）；聚合顺序取首现顺序。与 Rust 侧 resolve_merged_rule 语义一致。
    const tabOrder = []
    const tabAgg = new Map()
    for (const { rule, score, order } of byDefOrder) {
      const tabs = Array.isArray(rule.detail?.fieldTabs) ? rule.detail.fieldTabs : []
      for (const t of tabs) {
        if (!t) continue
        const key = t.table || t.name || t.id || ''
        let agg = tabAgg.get(key)
        if (!agg) {
          agg = { head: t, lists: [], groups: [], cmEntries: [] }
          tabAgg.set(key, agg)
          tabOrder.push(key)
        }
        agg.lists.push({ fields: t.fields, score })
        if (Array.isArray(t.groups)) agg.groups.push(...t.groups)
        if (t.columnModel && typeof t.columnModel === 'object') agg.cmEntries.push({ map: t.columnModel, score, order })
      }
    }
    const fieldTabs = tabOrder.map((key) => {
      const agg = tabAgg.get(key)
      const head = { ...agg.head, fields: this._mergeFieldLists(agg.lists) }
      delete head.use
      delete head.pick
      delete head.over
      if (agg.groups.length) head.groups = agg.groups
      else delete head.groups
      const cm = this._mergePropMaps(agg.cmEntries)
      if (Object.keys(cm).length) head.columnModel = cm
      else delete head.columnModel
      return head
    })

    // columnModel：高分键覆盖、同分靠前者优先
    const columnModel = this._mergePropMaps(matched.map(({ rule, score, order }) => ({ map: rule.columnModel, score, order })))

    // 锚点维度并集（定义顺序）
    const dimsUnion = []
    for (const { rule } of byDefOrder) for (const d of (rule.anchor?.dimensions || [])) if (!dimsUnion.includes(d)) dimsUnion.push(d)

    const detail = { fields }
    if (table) detail.table = table
    if (groups.length) detail.groups = groups
    if (fieldTabs.length) detail.fieldTabs = fieldTabs
    const merged = {
      id: byDefOrder.map((m) => m.rule.id).filter(Boolean).join('+') || '__merged__',
      anchor: { dimensions: dimsUnion, match: {} },
      detail,
    }
    if (Object.keys(columnModel).length) merged.columnModel = columnModel
    return merged
  }

  /**
   * 跨规则合并字段列表：位置取首次出现，值取得分高者，同分保留先到者（lists 需按定义顺序传入）。
   * @param {{fields?:object[], score:number}[]} lists
   * @returns {object[]}
   */
  _mergeFieldLists (lists) {
    const byId = new Map()
    let pos = 0
    for (const { fields, score } of lists) {
      for (const f of (fields || [])) {
        const id = fieldId(f)
        if (!id) continue
        const prev = byId.get(id)
        if (!prev) byId.set(id, { field: f, score, pos: pos++ })
        else if (score > prev.score) byId.set(id, { field: f, score, pos: prev.pos })
      }
    }
    return [...byId.values()].sort((a, b) => a.pos - b.pos).map((x) => x.field)
  }

  /**
   * 合并多个属性映射（columnModel 等）：高分键覆盖、同分靠前者优先
   * —— 升序(score asc, 同分 order desc) 逐个 Object.assign，末位生效。
   * @param {{map?:object, score:number, order:number}[]} entries
   * @returns {object}
   */
  _mergePropMaps (entries) {
    const ordered = [...entries].sort((a, b) => (a.score - b.score) || (b.order - a.order))
    const out = {}
    for (const { map } of ordered) if (map && typeof map === 'object') Object.assign(out, map)
    return out
  }

  /**
   * match 评分：-1=不匹配；0=无 match（兜底）；越大越具体。
   *
   * 支持：
   *   { account:'1122' }                          精确值
   *   { account:'*' }                             通配
   *   { txType:['sale','return'] }                值集合
   *   { projectType:{ isCapitalProject:true } }   维度值对象属性匹配
   *   { account:{ $in:['1122','2202'] } }         操作符匹配
   *   { account:{ $under:'2221' } }               层级泛化（锚点带 <dim>.__path 祖先链时命中子孙）
   */
  _scoreMatch (match, anchorValues) {
    if (!match || Object.keys(match).length === 0) return 0
    let score = 0
    for (const [dim, cond] of Object.entries(match)) {
      const code = anchorValues[dim]
      if (code == null) return -1
      const itemScore = this._scoreCondition(dim, code, cond, anchorValues)
      if (itemScore < 0) return -1
      score += itemScore
    }
    return score
  }

  // anchor 仅用于维度根条件的 $under（读 `${dim}.__path` 层级路径）；属性路径条件不感知层级。
  _scoreCondition (dim, code, cond, anchorValues) {
    if (cond === '*' || cond === undefined) return 0.25
    if (Array.isArray(cond)) return cond.some((v) => sameValue(code, v)) ? 1.5 : -1
    if (cond && typeof cond === 'object') {
      if (Object.keys(cond).some((k) => k.startsWith('$'))) return this._scoreOperatorCondition(code, cond, anchorPathValues(anchorValues, dim))
      const val = this.resolveDimValue(dim, code)
      let score = 0
      for (const [attr, want] of Object.entries(cond)) {
        const attrVal = attr === 'code' ? code : val[attr]
        const attrScore = this._scoreValueCondition(attrVal, want)
        if (attrScore < 0) return -1
        score += attrScore || 1
      }
      return score
    }
    return sameValue(code, cond) ? 3 : -1
  }

  // $under：锚点值等于目标，或锚点层级路径（${dim}.__path，数组或逗号分隔串）含目标。
  // 得分链：$eq(3) > $in/$under(1.5) > 其余(1)；属性值条件无层级语境，$under 不生效。
  _scoreOperatorCondition (code, cond, pathValues = []) {
    if (cond.$exists != null) {
      const exists = code != null && code !== ''
      if (!!cond.$exists !== exists) return -1
    }
    if (cond.$eq != null && !sameValue(code, cond.$eq)) return -1
    if (cond.$ne != null && sameValue(code, cond.$ne)) return -1
    if (cond.$in != null) {
      const list = Array.isArray(cond.$in) ? cond.$in : [cond.$in]
      if (!list.some((v) => sameValue(code, v))) return -1
    }
    if (cond.$nin != null) {
      const list = Array.isArray(cond.$nin) ? cond.$nin : [cond.$nin]
      if (list.some((v) => sameValue(code, v))) return -1
    }
    if (cond.$under != null && !sameValue(code, cond.$under) && !pathValues.some((p) => sameValue(p, cond.$under))) return -1
    return cond.$eq != null ? 3 : (cond.$in != null || cond.$under != null) ? 1.5 : 1
  }

  _scoreValueCondition (value, want) {
    if (want === '*') return 0.25
    if (Array.isArray(want)) return want.some((v) => sameValue(value, v)) ? 1.5 : -1
    if (want && typeof want === 'object' && Object.keys(want).some((k) => k.startsWith('$'))) return this._scoreOperatorCondition(value, want)
    return sameValue(value, want) ? 1 : -1
  }

  // ─── 字段 → CmxColumn ──────────────────────────────────────────────────────
  // 注：overlay（use/pick）已在构造期由 _expandRuleDetail 展开为 inline，
  // 故以下方法一律按 rule.detail.fields 处理，无需感知 overlay。

  buildColumns (rule) {
    const fields = rule?.detail?.fields || []
    return fields.map((f) => this._fieldToColumn(f, rule))
  }

  buildMembers (rule) {
    const flat = this.buildColumns(rule)
    const groups = rule?.detail && Array.isArray(rule.detail.groups) ? rule.detail.groups : null
    if (!groups || !groups.length) return flat

    const byId = new Map(flat.map((c) => [c.id, c]))
    const used = new Set()
    let groupCounter = 0
    const nextGroupId = () => `__cp_g_${++groupCounter}`

    const buildGroupNode = (node) => {
      const props = { ...(node || {}) }
      delete props.members
      const grp = new CmxColumnGroup({ id: props.id || props.caption || nextGroupId(), caption: props.caption || '', ...props })
      for (const m of (node?.members || [])) {
        if (m == null) continue
        if (typeof m === 'string') {
          if (used.has(m)) continue
          const col = byId.get(m)
          if (col) { grp.addMember(col); used.add(m) }
        } else if (typeof m === 'object') {
          const child = buildGroupNode(m)
          if (child) grp.addMember(child)
        }
      }
      return grp.members.length ? grp : null
    }

    const out = []
    for (const g of groups) {
      const grp = buildGroupNode(g)
      if (grp) out.push(grp)
    }
    for (const c of flat) if (!used.has(c.id)) out.push(c)
    return out
  }

  buildColumnModelProps (rule, combination = {}) {
    return Object.assign({}, combination.columnModel || {}, rule?.columnModel || {})
  }

  /**
   * 构建完整的 CmxColumnModel 实例（高保真）：members=buildMembers(规则字段+分组)，
   * 顶层属性 caption/datasetId/toTitleCols/iconCol 来自 档案级 combination.columnModel 与 规则级 rule.columnModel 合并（规则覆盖档案）。
   * 直接用于前端 cmx-revo-grid / cmx-ui5-table 等组件。
   */
  buildColumnModel (rule, combination = {}) {
    const props = this.buildColumnModelProps(rule, combination)
    return new CmxColumnModel({
      caption: props.caption || '',
      datasetId: props.datasetId || '',
      toTitleCols: props.toTitleCols || '',
      iconCol: props.iconCol || '',
      members: this.buildMembers(rule),
    })
  }

  /** 某张表的完整 CmxColumnModel（多字段集场景）。 */
  buildColumnModelForTable (rule, tableName, combination = {}) {
    const fs = this.fieldSetForTable(rule, tableName)
    if (!fs) return new CmxColumnModel({})
    const shell = { ...rule, detail: fs.detail, columnModel: fs.columnModel }
    return this.buildColumnModel(shell, combination)
  }

  /**
   * 把档案的字段/分组/列模型设置「写入」一个已存在的 CmxColumnModel 引用（原地更新，不新建）。
   * 顶层 caption/datasetId/toTitleCols/iconCol 直接赋值，members 用 setMembers 整体替换（触发 'replace' 事件，
   * 绑定的 grid/table 会自动刷新）。返回同一个 ccm 便于链式。
   */
  applyToColumnModel (ccm, rule, combination = {}) {
    if (!ccm || typeof ccm.setMembers !== 'function') return ccm
    const props = this.buildColumnModelProps(rule, combination)
    if (props.caption != null) ccm.caption = props.caption
    if (props.datasetId != null) ccm.datasetId = props.datasetId
    if (props.toTitleCols != null) ccm.toTitleCols = props.toTitleCols
    if (props.iconCol != null) ccm.iconCol = props.iconCol
    ccm.setMembers(this.buildMembers(rule))
    return ccm
  }

  /** 把某张表的字段集设置写入已存在的 CmxColumnModel 引用（多字段集场景）。 */
  applyToColumnModelForTable (ccm, rule, tableName, combination = {}) {
    const fs = this.fieldSetForTable(rule, tableName)
    if (!fs) return ccm
    const shell = { ...rule, detail: fs.detail, columnModel: fs.columnModel }
    return this.applyToColumnModel(ccm, shell, combination)
  }

  // ─── 多字段集（多套表的字段）────────────────────────────────────────────────
  // 一条规则可定义多套字段集，每套对应一张表（如单据头/分录/明细）：
  //   index 0 = rule.detail（fields/groups 在 detail，columnModel 在 rule）——与既有 API 完全一致；
  //   index ≥1 = rule.detail.fieldTabs[]（fields/groups/columnModel/table 都在该项上）。
  // 既有 buildColumns/buildMembers/buildColumnModelProps 仍只作用于 index 0（兼容）。

  /**
   * 规则的全部字段集，归一为统一形状 [{ index, table, name, detail:{fields,groups}, columnModel }]。
   * detail 字段壳可直接喂给 buildColumns/buildMembers；columnModel 可喂给 buildColumnModelProps。
   */
  fieldSetsOf (rule) {
    if (!rule) return []
    const sets = [{
      index: 0,
      table: rule.detail?.table || '',
      name: rule.detail?.fieldSetName || '',
      detail: { fields: rule.detail?.fields || [], ...(Array.isArray(rule.detail?.groups) ? { groups: rule.detail.groups } : {}) },
      columnModel: rule.columnModel && typeof rule.columnModel === 'object' ? rule.columnModel : undefined,
    }]
    const tabs = Array.isArray(rule.detail?.fieldTabs) ? rule.detail.fieldTabs : []
    tabs.forEach((t, i) => {
      sets.push({
        index: i + 1,
        table: t.table || '',
        name: t.name || '',
        detail: { fields: t.fields || [], ...(Array.isArray(t.groups) ? { groups: t.groups } : {}) },
        columnModel: t.columnModel && typeof t.columnModel === 'object' ? t.columnModel : undefined,
      })
    })
    return sets
  }

  /** 取该规则关联某张表的字段集（找不到返回 null）。 */
  fieldSetForTable (rule, tableName) {
    return this.fieldSetsOf(rule).find((s) => s.table === tableName) || null
  }

  /** 某张表的列（CmxColumn[]）；表无字段集返回 []。 */
  buildColumnsForTable (rule, tableName) {
    const fs = this.fieldSetForTable(rule, tableName)
    return fs ? this.buildColumns({ ...rule, detail: fs.detail }) : []
  }

  /** 某张表的成员（含分组，CmxColumn[]|CmxColumnGroup[]）；表无字段集返回 []。 */
  buildMembersForTable (rule, tableName) {
    const fs = this.fieldSetForTable(rule, tableName)
    return fs ? this.buildMembers({ ...rule, detail: fs.detail }) : []
  }

  /** 某张表的列模型属性（合并档案级 + 该字段集级）。 */
  buildColumnModelPropsForTable (rule, tableName, combination = {}) {
    const fs = this.fieldSetForTable(rule, tableName)
    return this.buildColumnModelProps({ ...rule, columnModel: fs?.columnModel }, combination)
  }

  /**
   * 规则的所有字段集一次性构建：[{ index, table, name, columns, members, columnModel }]。
   * 供运行期按表渲染多张表（如主从表/多页签明细）。
   */
  buildAllFieldSets (rule, combination = {}) {
    return this.fieldSetsOf(rule).map((fs) => {
      const shell = { ...rule, detail: fs.detail, columnModel: fs.columnModel }
      return {
        index: fs.index,
        table: fs.table,
        name: fs.name,
        columns: this.buildColumns(shell),
        members: this.buildMembers(shell),
        columnModel: this.buildColumnModelProps(shell, combination),
        model: this.buildColumnModel(shell, combination),
      }
    })
  }

  _fieldToColumn (field, rule) {
    const req = !!(field.edit && field.edit.required)
    const id = fieldId(field)
    const caption = fieldCaption(field)
    const dictSettings = this._dictSettingsForField(field, rule)
    const col = {
      ...field,   // 完整继承：字段所有属性原样铺到列顶层（扁平 key：width/frozen/visible/agg/display/edit…）
      id,
      caption:  (req ? '* ' : '') + caption,
      dataType: _fieldDataType(field),
      required: req,
    }
    delete col.type
    delete col.editMode
    // 字段顶层物理属性兜底（完整继承自单据列：合计/长度/精度）
    if (col.agg == null && field.agg != null) col.agg = field.agg
    if (col.length == null && field.fieldLength != null) col.length = field.fieldLength
    if (col.integerDigits == null && field.intDigits != null) col.integerDigits = field.intDigits
    if (col.decimalDigits == null && field.decimalDigits != null) col.decimalDigits = field.decimalDigits
    // display：归一字段定义里的常用别名键 → CmxColumn 的 display 规范键，保证高保真生效
    col.display = this._normalizeFieldDisplay(field.display)
    if (!col.display.align && field.dimType === 'measure') col.display.align = 'right'
    col.edit = Object.assign({}, field.edit || {})
    if (!col.edit.mode) col.edit.mode = dictSettings ? 'cmx-dict-select' : this._colEditMode(field)
    if (field.edit?.mode === 'computed') col.edit.mode = 'readonly'
    // 字段级条件属性 → edit.*（CmxColumn 识别）
    if (field.edit?.requiredWhen && col.edit.requiredWhen == null) col.edit.requiredWhen = field.edit.requiredWhen
    if (field.edit?.readonlyWhen && col.edit.readonlyWhen == null) col.edit.readonlyWhen = field.edit.readonlyWhen
    if (field.edit?.placeholder && col.edit.placeholder == null) col.edit.placeholder = field.edit.placeholder
    // 校验规则 validations:[{expr,message}] + pattern(正则) → edit.validate（CmxColumn 识别的校验入口）
    const rules = (Array.isArray(field.validations) ? field.validations.filter((v) => v && v.expr) : [])
      .map((v) => ({ expr: v.expr, message: v.message || '校验未通过' }))
    // pattern：formula-eval 不支持正则，故编译成函数式校验规则（闭包捕获 RegExp）；空值放过（由 required 管）
    if (field.pattern) {
      let re = null
      try { re = new RegExp(String(field.pattern)) } catch (_) { re = null }
      if (re) rules.push({ test: (v) => v == null || v === '' || re.test(String(v)), message: `${caption} 格式不正确` })
    }
    if (rules.length && col.edit.validate == null) col.edit.validate = rules
    if (field.editSettings || dictSettings) {
      col.edit = Object.assign({}, col.edit, field.editSettings || {}, dictSettings || {})
    }

    // enumValues:[...] → 静态下拉选项（无字典时）。落到 editSettings.options（select 编辑器读取此处），
    // 并把录入控件归一为 select，使枚举字段在 grid/form 都渲染为下拉。
    if (!dictSettings && Array.isArray(field.enumValues) && field.enumValues.length && !field.edit?.mode) {
      const options = field.enumValues.map((v) => (v && typeof v === 'object') ? { value: v.value, label: v.label ?? v.value } : { value: v, label: String(v) })
      col.edit.options = options
      col.edit.mode = 'select'
    }

    if (dictSettings) {
      col.edit = Object.assign({}, col.edit || {}, dictSettings)
    }

    // 维度/属性的可选值（demo：来自 dimension.values；真实场景换 ref 数据源）
    if (field.dimType === 'dimension') {
      const dimCode = field.refDict ? this._effectiveRef(field.refDict) : id
      const dim = this.getDimension(dimCode)
      if (!dictSettings && dim && Array.isArray(dim.values) && col.edit?.mode === 'select') {
        col.edit.options = dim.values.map((v) => ({ value: v.code, label: v.name || v.code }))
      }
      // 该维度若有 attribute 带出 / defaultFrom 度量依赖 → 选值后自动回填并重算
      const dependents = this._fieldsDependingOnDimension(rule, dimCode)
      if (dependents.length) {
        col.calcFormula = (row) => this.onPickDimension(row, id, row[id], rule)
        col.edit = Object.assign({}, col.edit, { dependents })
      }
    }

    // computed measure：把重算挂成函数式 calcFormula（grid 在 input 列编辑后会调用，整表 source 重设刷新显示）
    // 注：computed 列本身只读，重算触发挂在它依赖的 input 列上（见下）。
    if (field.dimType === 'measure' && field.edit && editModeKind(field.edit.mode, '') === 'input') {
      const deps = this._computedDependingOn(rule, id)
      if (deps.length) {
        col.calcFormula = (row) => this.recompute(row, rule)
        col.edit = Object.assign({}, col.edit, { dependents: deps })
      }
    }

    // 显示精度（revo-grid 端由页面 cellTemplate 读取；此处一并记录到 editSettings.display 供消费）
    if (field.dimType === 'measure' || _isNumericType(field.dataType)) {
      col.edit = Object.assign({}, col.edit, {
        display: Object.assign({ decimals: 2, thousand: ',', zeroBlank: true, negativeColor: true }, field.display || {}),
      })
    }
    return new CmxColumn(col)
  }

  /**
   * 把字段定义里的 display 别名键归一为 CmxColumn 的规范 display 键，保证高保真生效：
   *   decimals→decimalDigits、zeroBlank→zeroAsBlank、thousand→thousandSeparator。
   * 其它键（align/format/mode/badgeMap/icon/link/cellStyle 等）原样透传。
   */
  _normalizeFieldDisplay (fieldDisplay) {
    const out = {}
    const aliasMap = { decimals: 'decimalDigits', zeroBlank: 'zeroAsBlank', thousand: 'thousandSeparator' }
    for (const [k, v] of Object.entries(fieldDisplay || {})) {
      if (v == null || v === '') continue
      out[aliasMap[k] || k] = v
    }
    return out
  }

  _dictSettingsForField (field, rule) {
    if (!field || field.dimType !== 'dimension') return null
    const id = fieldId(field)
    const dimCode = field.refDict ? this._effectiveRef(field.refDict) : id
    const dim = this.getDimension(dimCode) || {}
    // 统一键：refDict(=字典/维度code) + refField/displayField；维度上的 dim.dict 作补充
    const dimDict = (dim.dict && typeof dim.dict === 'object') ? dim.dict : (typeof dim.dict === 'string' ? { dictId: dim.dict } : {})
    const dictCode = (field.refDict ? this._effectiveRef(field.refDict) : '') || dimDict.dictId || dimDict.dictCode || dimDict.code
    if (!dictCode) return null
    const idCol = dimDict.idCol || dimDict.idField || 'id'
    const codeCol = field.refField || dimDict.codeCol || dimDict.codeField || dimDict.valueField || idCol
    const labelCol = field.displayField || dimDict.labelCol || dimDict.labelField || 'name'
    const valueField = field.refField || dimDict.valueField || codeCol
    const writeBack = dimDict.writeBack || {
      [id]: valueField,
      [`${id}Id`]: idCol,
      [`${id}Name`]: labelCol,
    }
    const dependents = this._fieldsDependingOnDimension(rule, dimCode)
    return {
      dictCode,
      idCol,
      codeCol,
      labelCol,
      parentCol: dimDict.parentCol || dimDict.parentField || 'parent_id',
      hierarchical: !!dimDict.hierarchical,
      helpLayout: dimDict.helpLayout || 'grid',
      valueField,
      displayMode: dimDict.displayMode || 'code-label',
      dictTitle: dimDict.dictTitle || `选择${fieldCaption(field) || dim.name || dictCode}`,
      columns: Array.isArray(dimDict.columns) ? dimDict.columns : null,
      filters: dimDict.filters || dimDict.dictFilters || null,
      pageSize: dimDict.pageSize || 50,
      writeBack,
      dependents,
    }
  }

  _colEditMode (field) {
    const m = (field.edit && field.edit.mode) || 'cmx-text-input'
    if (m === 'computed') return 'readonly'
    if (m === 'tree-ref') return 'ref'
    return m // cmx-text-input | readonly | select | ref | none
  }

  /** 找出依赖某字段的所有 computed measure（用于 input 列的 dependents 列表）。 */
  _computedDependingOn (rule, id) {
    return (rule?.detail?.fields || [])
      .filter((f) => f.formula && Array.isArray(f.dependsOn) && f.dependsOn.includes(id))
      .map((f) => fieldId(f))
      .filter(Boolean)
  }

  /**
   * 找出依赖某维度的字段：attribute(source.dimension) + measure(defaultFrom.dimension)
   * 以及由这些 defaultFrom 度量进一步驱动的 computed measure（用于维度列 dependents 刷新）。
   */
  _fieldsDependingOnDimension (rule, dimCode) {
    const fields = rule?.detail?.fields || []
    const direct = fields.filter((f) =>
      (f.dimType === 'attribute' && f.source && f.source.dimension === dimCode) ||
      (f.dimType === 'measure' && f.defaultFrom && f.defaultFrom.dimension === dimCode),
    ).map((f) => fieldId(f)).filter(Boolean)
    const downstream = []
    for (const f of fields) {
      if (f.formula && Array.isArray(f.dependsOn) && f.dependsOn.some((d) => direct.includes(d))) {
        const id = fieldId(f)
        if (id) downstream.push(id)
      }
    }
    return [...new Set([...direct, ...downstream])]
  }

  // ─── 属性带出 / 默认度量 ─────────────────────────────────────────────────────

  /**
   * 选了某 dimension 字段的值 → 带出该维度的 attribute 字段，并填 defaultFrom 度量默认值。
   * @returns 修改后的 row（同对象）
   */
  onPickDimension (row, id, code, rule) {
    const fields = rule?.detail?.fields || []
    const picked = fields.find((f) => fieldId(f) === id)
    if (!picked || picked.dimType !== 'dimension') return row
    const dimCode = picked.refDict ? this._effectiveRef(picked.refDict) : fieldId(picked)
    const val = this.resolveDimValue(dimCode, code)

    for (const f of fields) {
      if (f.dimType === 'attribute' && f.source && f.source.dimension === dimCode) {
        const id = fieldId(f)
        if (id) row[id] = val[f.source.attribute] ?? ''
      }
      if (f.dimType === 'measure' && f.defaultFrom && f.defaultFrom.dimension === dimCode) {
        const dv = val[f.defaultFrom.attribute]
        const id = fieldId(f)
        if (id && dv != null && (row[id] == null || row[id] === '' || row[id] === 0)) row[id] = dv
      }
    }
    return this.recompute(row, rule)
  }

  // ─── 计算公式重算（拓扑序） ──────────────────────────────────────────────────

  recompute (row, rule) {
    const computed = (rule?.detail?.fields || []).filter((f) => f.formula)
    if (!computed.length) return row
    const order = this._topoSort(computed)
    for (const f of order) {
      let v = evalFormula(f.formula, row, 0)
      const dec = f.display && (f.display.decimalDigits ?? f.display.decimals)
      if (typeof v === 'number' && dec != null) {
        const p = Math.pow(10, dec); v = Math.round(v * p) / p
      }
      const id = fieldId(f)
      if (id) row[id] = v
    }
    return row
  }

  _topoSort (computedFields) {
    const codeSet = new Set(computedFields.map((f) => fieldId(f)).filter(Boolean))
    const byCode = new Map(computedFields.map((f) => [fieldId(f), f]).filter(([id]) => id))
    const visited = new Set()
    const out = []
    const visit = (f) => {
      const id = fieldId(f)
      if (!id || visited.has(id)) return
      visited.add(id)
      for (const dep of (f.dependsOn || [])) {
        if (codeSet.has(dep) && byCode.has(dep)) visit(byCode.get(dep))
      }
      out.push(f)
    }
    for (const f of computedFields) visit(f)
    return out
  }

  // ─── 校验 ────────────────────────────────────────────────────────────────────

  validate (row, rule) {
    const errors = []
    for (const f of (rule?.detail?.fields || [])) {
      const id = fieldId(f)
      const caption = fieldCaption(f)
      if (f.edit && f.edit.required) {
        const v = row[id]
        if (v == null || v === '' || (f.dimType === 'measure' && Number(v) === 0)) {
          errors.push({ code: id, message: `${caption} 必填` })
        }
      }
      for (const rule2 of (f.validations || [])) {
        const ok = evalFormula(rule2.expr, row, true)
        if (!ok) errors.push({ code: id, message: rule2.message || `${caption} 校验未通过` })
      }
    }
    return { valid: errors.length === 0, errors }
  }
}

function sameValue (a, b) {
  return String(a) === String(b)
}

// 提取锚点维度的层级路径（`${dim}.__path`，逗号分隔字符串或数组 → 字符串数组）。
// 供 $under 层级泛化匹配：选中树形字典某级值时把祖先链（含自身）一并传入锚点，
// 规则用 { $under: '2221' } 即可命中其子孙值（与 Rust 侧 anchor_path_values 语义一致）。
function anchorPathValues (anchorValues, dim) {
  const v = anchorValues ? anchorValues[`${dim}.__path`] : null
  if (v == null) return []
  if (Array.isArray(v)) return v.map((x) => String(x)).filter((s) => s !== '')
  return String(v).split(',').map((s) => s.trim()).filter((s) => s !== '')
}
