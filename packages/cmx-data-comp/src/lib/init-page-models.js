/**
 * initPageModels — 设计器页面运行时模型初始化入口
 *
 * 读取设计器保存的 models 数组，按 modelType 创建实例挂到 host。
 * 视图组件与模型的绑定关系完全从 DOM 属性读取：
 *   data-cmx-model-id="modelInstanceId"   → 视图引用了某个 CmxColumnModel
 *   data-cmx-dataset-id="schemaPath"       → 视图对应 CmxMasterSlave 中的路径
 *
 * 模型实例上的事件脚本（def.events: { evtName: codeStr }）通过 addEventListener 绑定，
 * 运行时作用域：function(event, host) { with (host) { ...userCode... } }，
 * 与可视组件 data-event<name> 一致。
 *
 * 页面脚本中通过 host.模型instanceId 直接访问模型实例，例如：
 *   host.ms         — CmxMasterSlave
 *   host.masterModel — CmxColumnModel
 *   host.ordersDs   — CmxDataSet（由 pageFns 管理）
 */

import { CmxMasterSlave } from './cmx-master-slave.js'
import { CmxDataSet } from './cmx-data-set.js'
import { CmxColumnModel } from './cmx-column-model.js'
import { CmxColumn } from './cmx-column.js'
import { CmxColumnGroup } from './cmx-column-group.js'
import { CmxFlexibleCombination } from './cmx-flexible-combination.js'
import { FlexibleCombinationEngine } from './flexible-combination-engine.js'
import { CmxDCTMeta } from './cmx-dct-meta.js'
import { CmxDOCMeta } from './cmx-doc-meta.js'
import { orderColumns, SYSTEM_COLS, DCT_SYSTEM_COLS, defaultWidth } from './cmx-doc-meta-loader.js'
import { resolveCoord } from './cmx-doc-coord.js'
import { fieldCaption } from './cmx-field-meta.js'
import { showCmxToast } from './cmx-toast.js'

/**
 * 页面模型初始化期错误的轻提示（toast，非模态——不打断页面其余模型初始化）。
 * err 已被上层弹过对话框（__presented）时跳过，避免双提示。
 */
function toastModelError (title, err) {
  const e = err && (err instanceof Error ? err : new Error(String(err && err.message || err)))
  if (e && e.__presented) return
  showCmxToast(e && e.message || String(err), { level: 'error', title })
}

/**
 * 解析字符串里的 ${route.xxx} / ${host.xxx} / ${coord.xxx} 占位符。
 *
 * 用于「单据详情」模式的 filter 字段，例如 "id:${route.id}"。
 * - ${route.id}        → host.$route?.query?.id ?? host.$route?.params?.id ?? host?.$route?.id ?? ''
 * - ${coord.module}    → host?.$coord?.module ?? ''
 * - ${host.$coord.module} → host?.$coord?.module ?? ''
 *
 * 非字符串或无 ${...} 占位原样返回；占位无法解析时替换为空串。
 *
 * @param {*} value
 * @param {any} host
 * @returns {*}
 */
function _resolvePlaceholders (value, host) {
  if (typeof value !== 'string' || !value.includes('${')) return value
  return value.replace(/\$\{([^}]+)\}/g, (_, expr) => {
    const path = String(expr || '').trim()
    if (!path) return ''
    if (path.startsWith('route.')) {
      const key = path.slice('route.'.length)
      return host?.$route?.query?.[key] ?? host?.$route?.params?.[key] ?? host?.$route?.[key] ?? ''
    }
    if (path.startsWith('coord.')) {
      const key = path.slice('coord.'.length)
      return host?.$coord?.[key] ?? ''
    }
    if (path.startsWith('host.')) {
      const parts = path.slice('host.'.length).split('.')
      let v = host
      for (const k of parts) v = v?.[k]
      return v == null ? '' : String(v)
    }
    return ''
  })
}

/**
 * 将 CmxMasterSlave.props 归一化为协调器装载方法（loadDoc / loadDict…）所需的参数包。
 *
 * 设计要点：
 *   - 基底层是 host.$coord + p.source 四坐标（domain/application/module + 业务实体编码）
 *   - 业务实体编码：source.moduleCode（DOC 单据模块 / DCT 字典分组模块） + source.dict（DCT 内具体字典表编码 dictCode）
 *   - filter 归一化：trim + 去除冒号后多余空格（后端 split_once(':') 对空格敏感）
 *   - route/host 占位符仅对 filter/parentId 等字符串时才会实际替换（_resolvePlaceholders 返回非字符串原样）
 *   - 多余字段（如 loadDict 不用 depth）由具体协调器方法自行忽略，不在此处按 kind 分支
 */
function _buildLoadDef (p, host) {
  const source = (p.source && typeof p.source === 'object') ? p.source : {}
  const rawFilter = _resolvePlaceholders(p.filter, host)
  const cleanFilter = typeof rawFilter === 'string'
    ? rawFilter.trim().replace(/^([^:]+):\s*/, '$1:')
    : rawFilter
  return {
    ...host.$coord,
    ...source,
    // 后端 URL query 参数 doc= 保留（不同同名）：normalizeDocCoord 读 raw.doc，而设计器 source.moduleCode 存模块编码
    ...(source.moduleCode ? { doc: source.moduleCode } : {}),
    // 字典编码：仅当显式配了 source.dict / p.dict 时才注入（避免向 DOC 分支泄漏 dict）
    ...(source.dict || p.dict ? { dict: source.dict || p.dict } : {}),
    filter: cleanFilter,
    limit: p.limit,
    depth: p.depth,
    pageSize: p.pageSize,
    page: p.page,
    parentId: _resolvePlaceholders(p.parentId, host),
  }
}

/**
 * loadKind 派发表：“元模型种类 (kind) : 装载形态 (form)” → (ms, loadDef) => Promise。
 *
 * 新增形态只需在此处加一行，无需改 autoLoad 主循环。kind 由 metaModel.kind 自动带出：
 *   - CmxDOCMeta.kind === 'DOC'
 *   - CmxDCTMeta.kind === 'DCT'
 *   - 弹性组合 / 未来形态同理
 */
const _LOAD_DISPATCH = {
  'DOC:list':   (ms, def) => ms.loadDoc(def),
  'DOC:detail': (ms, def) => ms.loadDoc({ ...def, limit: 1 }),
  'DCT:list':   (ms, def) => ms.loadDict(def),
}

/**
 * 递归构建列模型成员（CmxColumn 或 CmxColumnGroup）。
 * 设计器保存的 columns 数组中，含 children/members 的项为分组节点（CmxColumnGroup），
 * 其余为普通列（CmxColumn）。分组支持聚合属性（aggregate/aggregatePosition）透传。
 * @param {object} item 设计器列定义对象（含 id/caption/dataType/children 等）
 * @returns {CmxColumn|CmxColumnGroup}
 */
function buildMember (item) {
  if (item && (item.__type === 'group' || Array.isArray(item.children) || Array.isArray(item.members))) {
    const g = new CmxColumnGroup({
      id: item.id,
      caption: item.caption,
      // 分组聚合属性高保真：aggregate{sum,avg,max,min,count} + aggregatePosition
      ...(item.aggregate && typeof item.aggregate === 'object' ? { aggregate: item.aggregate } : {}),
      ...(item.aggregatePosition ? { aggregatePosition: item.aggregatePosition } : {}),
    })
    for (const ch of (item.children || item.members || [])) g.addMember(buildMember(ch))
    return g
  }
  const col = new CmxColumn({
    ...item,
    id: item.id, caption: item.caption, dataType: item.dataType,
    width: item.width,
    required: item.required, visible: item.visible, frozen: item.frozen, agg: item.agg,
    /* 高保真透传 display / edit 结构化对象（badge/icon/link/cellStyle/format/decimalDigits/
       thousandSeparator + mode/options/required/requiredWhen/validate/validateWhen/readonlyWhen 等），
       使模型面板 JSON 可承载弹性组合字段的全部属性。 */
    display: item.display,
    edit: item.edit,
    displayMode: item.displayMode,
    displayMask: item.displayMask,
    calcFormula: item.calcFormula,
    validateFormula: item.validateFormula,
    actionRef: item.actionRef,
    length: item.length,
    integerDigits: item.integerDigits,
    decimalDigits: item.decimalDigits,
  })
  for (const [key, value] of Object.entries(item || {})) {
    if (key === 'column' || key === 'children' || key === 'members' || key === '__type') continue
    if (col[key] === undefined) col[key] = value
  }
  return col
}

/* ─────────────── DCT 增强：字段角色识别辅助函数 ─────────────── */

/**
 * 动态主键识别。
 * 兼容 isPrimaryKey 的多种值形态（0/1/true/'1'）以及 meta.pk 声明式主键。
 * @param {object} col 归一化后的字段对象（需有 name、isPrimaryKey、dataType）
 * @param {object} [meta] 元数据对象（增强路径含 pk 字段；字符串路径为 {kind} 无 pk）
 * @returns {boolean} 该字段是否为主键
 */
function isPrimaryKeyField (col, meta) {
  const v = col.isPrimaryKey
  if (v === 1 || v === true || v === '1') return true
  return !!(meta && meta.pk) && col.name === meta.pk
}

/**
 * 业务键判定。
 * 业务键 = 字符串类型的物理主键（VARCHAR/CHAR/TEXT + isPrimaryKey）或 meta.codeField 指向的字段。
 * 业务键的编辑行为：新增行可填、保存入库后只读（配合 readonlyWhen 表达式实现）。
 * 整数物理主键（id，后端铸号）不是业务键，前端始终不可编辑。
 * @param {object} col 归一化后的字段对象（需有 name、dataType）
 * @param {object} [meta] 元数据对象（需有 pk、codeField；缺失时返回 false）
 * @returns {boolean} 该字段是否为业务键
 */
function isBusinessKey (col, meta) {
  if (!meta) return false
  const t = String(col.dataType || '').toUpperCase()
  const isString = t.includes('CHAR') || t.includes('TEXT') || t === 'STRING'
  if (!isString) return false
  if (isPrimaryKeyField(col, meta)) return true
  if (meta.codeField && col.name === meta.codeField) return true
  return false
}

/**
 * 必填列判定（4 级优先级）。
 * 判定顺序：业务键强制必填 > 元数据 edit.required=true > 顶层 required=true > nullable=false 推断。
 * 用于设置 colOpts.edit.required=true，grid 配合 showRequiredMark:true 在列头显示 * 标识。
 * @param {object} col 归一化后的字段对象（需有 name、dataType、edit、required、nullable）
 * @param {object} [meta] 元数据对象（供 isBusinessKey 判定用）
 * @returns {boolean} 该列是否必填
 */
function isRequiredCol (col, meta) {
  if (isBusinessKey(col, meta)) {
    // auto 铸号的 code 列不强制必填（后端保存时自动生成）
    if (meta.codeRule && meta.codeRule.mode === 'auto' && col.name === meta.codeField) return false
    return true
  }
  const metaEdit = col.edit && typeof col.edit === 'object' ? col.edit : null
  if (metaEdit && metaEdit.required === true) return true
  if (col.required === true) return true
  if (col.nullable === false) return true
  return false
}

/**
 * 枚举值 → select options 映射。
 * 将字段的 enumValues 属性（数组或逗号分隔字符串）转换为 [{value, label}] 格式的下拉选项。
 * 当字段有 enumValues 且无 refDict、元数据未显式指定 edit.mode 时，强制 edit.mode='select'。
 * @param {object} col 归一化后的字段对象（读取 col.enumValues）
 * @returns {Array<{value: any, label: string}>|null} 选项数组；无枚举时返回 null
 */
function enumOptionsFromField (col) {
  const ev = col.enumValues
  if (ev == null) return null
  let arr = null
  if (Array.isArray(ev)) arr = ev
  else if (typeof ev === 'string' && ev.trim()) arr = ev.split(',').map((s) => s.trim()).filter(Boolean)
  if (!arr || !arr.length) return null
  return arr.map((v) => {
    if (v && typeof v === 'object') return { value: v.value, label: v.label != null ? v.label : v.value }
    return { value: v, label: String(v) }
  })
}

/**
 * 扁平属性白名单透传。
 * 后端 with_props=true 下发的字段扁平属性（width/visible/frozen/align 等），
 * 按白名单提取后挂到 CmxColumn 顶层（构造器自动收纳，toDescriptor 输出 width/visible/frozen）。
 * 元数据 width 优先于 defaultWidthFor 推断值。
 * @param {object} col 归一化后的字段对象
 * @returns {object} 仅含白名单内非空键的对象（可能为空对象）
 */
const FLAT_PROP_KEYS = [
  'width', 'frozen', 'visible', 'align', 'intDigits', 'decimalDigits',
  'maxlength', 'min', 'max', 'placeholder', 'defaultValue', 'agg',
  'label', 'i18n', 'searchable', 'filterable', 'sensitive',
]
function flatPropsFor (col) {
  const out = {}
  for (const k of FLAT_PROP_KEYS) {
    if (col[k] != null) out[k] = col[k]
  }
  return out
}

/**
 * display 配置白名单过滤。
 * 从元数据的 display 对象中只提取 grid adapter 认识的 11 个规范属性，丢弃脏键/实验性键。
 * display.mode 额外做规范值校验：仅保留 ''/text/number/badge/link/icon，
 * 非规范值（如 date/checkbox）不挂——这些由 dataType 自动派生，无需显式声明。
 * @param {object} col 归一化后的字段对象（读取 col.display）
 * @returns {object|undefined} 过滤后的 display 对象；无有效属性时返回 undefined
 */
const SPEC_DISPLAY_MODES = new Set(['', 'text', 'number', 'badge', 'link', 'icon'])
function displayForMetaColumn (col) {
  const d = col.display && typeof col.display === 'object' ? col.display : null
  if (!d) return undefined
  const out = {}
  const m = d.mode == null ? '' : String(d.mode).toLowerCase()
  if (SPEC_DISPLAY_MODES.has(m)) out.mode = m
  if (d.align) out.align = d.align
  if (d.format) out.format = d.format
  if (d.decimalDigits != null) out.decimalDigits = d.decimalDigits
  if (d.thousandSeparator != null) out.thousandSeparator = d.thousandSeparator
  if (d.zeroAsBlank != null) out.zeroAsBlank = d.zeroAsBlank
  if (d.negativeColor != null) out.negativeColor = d.negativeColor
  if (d.emptyText != null) out.emptyText = d.emptyText
  if (d.badgeMap) out.badgeMap = d.badgeMap
  if (d.icon) out.icon = d.icon
  if (d.link) out.link = d.link
  if (d.cellStyle) out.cellStyle = d.cellStyle
  return Object.keys(out).length ? out : undefined
}

/**
 * 统一列宽推断。
 * 优先级：列名特判 > dataType 类型推断 > 默认 150px。
 * 当元数据未声明 width（flatPropsFor 无 width 键）时作为兜底值。
 * @param {object} col 归一化后的字段对象（需有 name、dataType）
 * @returns {string} CSS 宽度值（如 '130px'）
 */
function defaultWidthFor (col) {
  const t = String(col.dataType || '').toUpperCase()
  const name = col.name || ''
  if (name === 'id' || name === 'upper_id') return '90px'
  if (name === 'line_no') return '60px'
  if (t === 'DATETIME' || t === 'TIMESTAMP' || t === 'TIMESTAMPTZ') return '160px'
  if (t === 'DATE') return '130px'
  if (t === 'TEXT') return '240px'
  if (t === 'TINYINT') return '90px'
  if (t === 'DECIMAL' || t === 'NUMERIC') return '120px'
  if (t === 'INT' || t === 'BIGINT' || t === 'SMALLINT') return '110px'
  return '150px'
}

// 元数据 edit.mode 简写 → 规范值映射
const META_MODE_TO_SPEC = {
  input: 'cmx-text-input', text: 'cmx-text-input', textarea: 'cmx-textarea-input',
  number: 'cmx-number-input', date: 'cmx-date-input', datetime: 'cmx-datetime-input',
}
// EDIT_MODES 规范值集合
const SPEC_MODES = new Set([
  'cmx-text-input', 'cmx-textarea-input', 'cmx-richtext-input', 'cmx-number-input',
  'cmx-date-input', 'cmx-datetime-input', 'checkbox', 'select', 'ref', 'combo',
  'ignite-combo', 'cmx-dict-select', 'image', 'video', 'readonly', 'none',
])

/** 增强版编辑模式映射（4 级优先级）。
 *  @param {object} col 归一化后的字段对象
 *  @param {object} meta 元数据对象（增强路径有 pk/codeField/selfHierarchy/parentField/dictCode/labelField）
 *  @param {boolean} isDct 是否字典场景
 *  @returns {{ mode: string, options?: Array, dictCode?: string, idField?: string, labelField?: string, hierarchical?: boolean, parentField?: string }}
 */
function editModeForMetaColumn (col, meta, isDct) {
  const name = col.name
  const t = String(col.dataType || '').toUpperCase()
  const metaEdit = col.edit && typeof col.edit === 'object' ? col.edit : null
  const metaMode = metaEdit ? String(metaEdit.mode || '') : ''
  const isParent = isDct && meta && meta.selfHierarchy && name === meta.parentField

  // 1) ref / cmx-dict-select / refDict 列 / 树形父节点列 → cmx-dict-select 字典选择弹窗
  if (metaMode === 'ref' || metaMode === 'cmx-dict-select' || (col.refDict && !metaMode) || isParent) {
    const dictCode = col.refDict || (isParent ? (meta.dictCode || '') : '')
    if (dictCode) {
      return {
        mode: 'cmx-dict-select',
        dictCode,
        idField: col.refField || (isParent ? (meta.pk || 'code') : 'code'),
        labelField: col.displayField || (isParent ? (meta.labelField || 'name') : 'name'),
        parentField: isParent ? meta.parentField : undefined,
        hierarchical: !!isParent,
      }
    }
  }

  // 2) 元数据已是 EDIT_MODES 规范值 → 直接用
  if (metaMode && SPEC_MODES.has(metaMode)) {
    const out = { mode: metaMode }
    if (metaMode === 'select') {
      out.options = (metaEdit && Array.isArray(metaEdit.options)) ? metaEdit.options
        : (name === 'status' ? [{ value: 1, label: '启用' }, { value: 0, label: '停用' }] : [])
    }
    return out
  }

  // 3) 元数据简写 → 规范值
  const lower = metaMode.toLowerCase()
  if (META_MODE_TO_SPEC[lower]) return { mode: META_MODE_TO_SPEC[lower] }

  // 4) 兜底：按 dataType 推断
  if (t === 'DATE') return { mode: 'cmx-date-input' }
  if (t === 'DATETIME' || t === 'TIMESTAMP' || t === 'TIMESTAMPTZ') return { mode: 'cmx-datetime-input' }
  if (isDct && t === 'TINYINT') return { mode: 'checkbox' }
  if (/INT|BIGINT|SMALLINT|TINYINT|DECIMAL|NUMERIC|FLOAT|DOUBLE/.test(t)) return { mode: 'cmx-number-input' }
  return { mode: 'cmx-text-input' }
}

/**
 * 把已声明元数据模型（CmxDOCMeta/CmxDCTMeta）中某张表的字段转成 CmxColumn[]。
 *
 * 支持两种调用形态（向后兼容）：
 *   - metaOrKind 为字符串 'DOC'/'DCT'：保持原行为（B 路径，fromMeta/initPageModels 调用）
 *   - metaOrKind 为对象（含 kind/pk/codeField/selfHierarchy/parentField/dictCode/labelField/domain/application/module）：
 *     启用增强逻辑（A 路径，data-editor.js 直接调用）
 *
 * @param {Array<object>} fields 字段对象数组
 * @param {string|object} metaOrKind 元数据类型字符串或完整 meta 对象
 * @param {object} [opts] { respectOrder?, coord?, editable?, hideDerivedHierarchy? }
 * @returns {CmxColumn[]}
 */
export function metaTableFieldsToColumns (fields, metaOrKind, opts = {}) {
  // 归一化：字符串 → { kind: metaOrKind }（向后兼容 B 路径）
  const meta = typeof metaOrKind === 'string' ? { kind: metaOrKind } : (metaOrKind || {})
  const kind = meta.kind || 'DOC'
  const isDct = kind === 'DCT'
  // 增强路径守卫：仅当传入完整 meta 对象时启用业务键/readonlyWhen/树形父节点等增强逻辑
  const isEnhanced = typeof metaOrKind === 'object' && metaOrKind !== null
  const sysSet = isDct ? DCT_SYSTEM_COLS : SYSTEM_COLS

  // 归一化字段
  const normalized = (Array.isArray(fields) ? fields : []).map((f) => {
    const name = String(f?.fieldName ?? f?.id ?? f?.name ?? '')
    return {
      ...f,
      name,
      caption: fieldCaption(f) || name,
      isPrimaryKey: isEnhanced ? isPrimaryKeyField(f, meta) : (f.isPrimaryKey === true || name === 'id'),
    }
  })

  const ordered = orderColumns(normalized, sysSet, opts.respectOrder === true)

  return ordered.map((c) => {
    const name = c.name
    const hasRefDict = !!c.refDict
    const metaEdit = (c.edit && typeof c.edit === 'object') ? { ...c.edit } : {}

    // ─── 可编辑性判定 ───
    let editable
    if (isEnhanced && isDct) {
      // 增强 DCT 路径：动态主键 + 业务键 + 审计/系统/派生判定
      if (isPrimaryKeyField(c, meta) && !isBusinessKey(c, meta)) editable = false
      else if (isBusinessKey(c, meta)) editable = true
      else if (['create_by', 'create_time', 'update_by', 'update_time'].includes(name)) editable = false
      else if (name === 'is_system') editable = false
      else if (['scope_type', 'entity_id'].includes(name)) editable = false
      else editable = true
    } else {
      // 原路径（B）：主键或系统列只读
      editable = !(c.isPrimaryKey || sysSet.has(name))
    }

    // ─── 列基础属性 ───
    const flat = flatPropsFor(c)
    const colOpts = {
      ...c,
      id: name,
      caption: c.caption || name,
      dataType: c.dataType || 'VARCHAR',
      ...flat,
    }
    // 列宽：元数据 width 优先，缺失走统一推断
    colOpts.width = flat.width || defaultWidthFor(c)

    // display 配置：白名单过滤脏键，所有路径默认启用
    const disp = displayForMetaColumn(c)
    if (disp) colOpts.display = disp

    // 引用字典列：挂 refDict/displayField/refField 供 grid 回显
    if (hasRefDict) {
      colOpts.refDict = c.refDict
      colOpts.refField = c.refField || 'code'
      colOpts.displayField = c.displayField || 'name'
    }

    // ─── edit 配置 ───
    if (editable) {
      const em = editModeForMetaColumn(c, isEnhanced ? meta : null, isDct)
      let resolvedMode = em.mode
      let resolvedOptions = em.options || null

      // enumValues → select 强制映射（无 refDict 且元数据未显式指定 mode 时，所有路径默认启用；
      // 显式 mode='select' 但未提供 edit.options 时同样兜底——选项写在字段顶层 enumValues 是
      // 元数据的常见写法，缺这个兜底会渲染出只有占位符的空下拉）
      if (!hasRefDict && (!metaEdit.mode || (String(metaEdit.mode) === 'select' && !Array.isArray(metaEdit.options)))) {
        const enumOpts = enumOptionsFromField(c)
        if (enumOpts) {
          resolvedMode = 'select'
          resolvedOptions = enumOpts
        }
      }

      colOpts.edit = {
        ...metaEdit,
        mode: resolvedMode,
        ...(resolvedOptions ? { options: resolvedOptions } : {}),
      }
      // pattern 从扁平键补入 edit
      if (!colOpts.edit.pattern && c.pattern) colOpts.edit.pattern = c.pattern

      // 必填：所有路径默认启用（grid editable:true 时需要必填标识）
      if (isRequiredCol(c, meta)) {
        colOpts.edit.required = true
      }

      /* 业务键（字符串主键 / meta.codeField）：新增可填 + 存量只读。
       * 原理：页面 addRow 时显式写入临时 id（'t'+seq+'_'+timestamp），保存后 reload 后端返回的
       * 行没有 't' 前缀的 id（主键是 code 的表甚至没有 id 字段，此时 id=undefined）。
       * 依赖表是否有物理 id 列——只要后端返回的行 id 不以 't' 开头（包括 undefined/null），存量行就是只读的。
       *  't' 前缀是前端临时行的专属标识，保存后 reload 就消失了。
       * readonlyWhen 表达式对每行求值：
       *   新增行 id='t1_123456' → STARTSWITH=true → NOT=false → 可编辑
       *   存量行 id='42'/undefined → STARTSWITH=false → NOT=true → 只读
       * mode 必须强制 cmx-text-input：若沿用元数据的 readonly，grid adapter 在 focus 阶段
       * 直接跳过编辑，beforeedit 不派发，readonlyWhen 无从求值 → 新增行也填不了。 */
      if (isEnhanced && isDct && isBusinessKey(c, meta)) {
        // auto 铸号的 code 列：始终只读 + 提示"保存时自动生成"，不强制必填
        const isAutoCode = meta.codeRule && meta.codeRule.mode === 'auto' && c.name === meta.codeField
        if (isAutoCode) {
          colOpts.edit.mode = 'cmx-text-input'
          colOpts.edit.readonlyWhen = 'true'
          colOpts.edit.placeholder = '保存时自动生成'
          colOpts.edit.required = false
        } else {
          colOpts.edit.mode = 'cmx-text-input'
          colOpts.edit.readonlyWhen = "NOT(STARTSWITH(id, 't'))"
          colOpts.edit.required = true
        }
      }

      // 字典选择列 editSettings
      if (resolvedMode === 'cmx-dict-select') {
        const metaEs = (c.editSettings && typeof c.editSettings === 'object') ? { ...c.editSettings } : {}
        colOpts.editSettings = {
          ...metaEs,
          dictCode: em.dictCode || metaEs.dictCode || c.refDict,
          idCol: em.idField || metaEs.idCol || c.refField || 'code',
          labelCol: em.labelField || metaEs.labelCol || c.displayField || 'name',
        }
        /* 树形字典自引用：parentField 列的字典选择弹窗需要 hierarchical 模式（懒加载子级）。
         * em.hierarchical 仅在 meta.selfHierarchy=true 且当前列===meta.parentField 时为 true，
         * 字符串路径（无 selfHierarchy）自然不触发，无需额外守卫。 */
        if (em.hierarchical) {
          colOpts.editSettings.hierarchical = true
          if (em.parentField) colOpts.editSettings.parentCol = em.parentField
        }
        /* coord：字典选择弹窗请求 /api/dct/data/search 的必需坐标。
         * 优先用 opts.coord（调用方显式传入），其次从 meta 对象提取。
         * 两者都无效时不设 coord 键——留给 fromMeta 的 backfillColumnCoord 用全局坐标补全。 */
        const coord = opts.coord || null
        const metaCoord = (meta.domain || meta.application || meta.module)
          ? { domain: meta.domain || '', application: meta.application || '', module: meta.module || '' }
          : null
        if (coord || metaCoord) {
          colOpts.editSettings.coord = coord || metaCoord
        }
      } else if (hasRefDict && !isEnhanced) {
        // 原路径（B）：保持原有 editSettings 构造逻辑
        const metaEs = (c.editSettings && typeof c.editSettings === 'object') ? { ...c.editSettings } : {}
        colOpts.editSettings = {
          ...metaEs,
          dictCode: metaEs.dictCode || c.refDict,
          idCol: metaEs.idCol || c.refField || 'code',
          labelCol: metaEs.labelCol || c.displayField || 'name',
        }
      }
    } else {
      // 不可编辑列：保留元数据 checkbox 显示样式，否则 readonly
      const metaMode = metaEdit.mode ? String(metaEdit.mode).toLowerCase() : ''
      if (metaMode === 'checkbox') {
        colOpts.edit = { ...metaEdit, mode: 'checkbox' }
        colOpts.readonly = true
      } else {
        colOpts.edit = { ...metaEdit, mode: 'readonly' }
      }
    }

    // checkbox 列内容居中（创建新对象，避免修改元数据冻结对象）
    if (colOpts.edit && colOpts.edit.mode === 'checkbox') {
      colOpts.display = { ...(colOpts.display || {}), align: 'center' }
    }

    return new CmxColumn(colOpts)
  })
}

// 导出辅助函数供 native-page 通过 globalThis.__cmxDataComp 引用
export { isPrimaryKeyField, isBusinessKey, isRequiredCol, enumOptionsFromField, flatPropsFor, displayForMetaColumn, defaultWidthFor }

/**
 * 用全局坐标补全列模型中各列的字典坐标（editSettings.coord）。
 *
 * 字典数据源 createRestDictDataSource 直接读 field.editSettings.coord，无 host 访问；
 * 若列在设计期未固化 domain/application/module（如动态列从元数据生成），
 * 用 host.$coord 兜底，避免字典请求缺坐标。局部有值优先（resolveCoord）。
 *
 * @param {CmxColumnModel} model
 * @param {object} globalCoord 页面级全局坐标
 */
function backfillColumnCoord (model, globalCoord) {
  if (!globalCoord || !model || !Array.isArray(model.members)) return
  for (const col of model.members) {
    if (!col) continue
    // 有 refDict 的字典列：editSettings 缺失时，用全局坐标补建（运行时字典数据源
    // createRestDictDataSource 读 field.editSettings.coord 发请求，缺则后端 400）。
    // 元数据字段（来自 fieldSets/fieldOverrides）常不带 editSettings.coord，须兜底。
    if (!col.editSettings || typeof col.editSettings !== 'object') {
      if (!col.refDict) continue
      const merged = resolveCoord({}, globalCoord)
      if (!merged.domain || !merged.application || !merged.module) continue
      // 补建 editSettings：除坐标外，还需 dictCode/idCol/labelCol（cmx-dict-select 控件必需）。
      col.editSettings = {
        dictCode: col.refDict,
        idCol: col.refField || 'code',
        labelCol: col.displayField || 'name',
        coord: merged,
      }
      continue
    }
    const merged = resolveCoord(col.editSettings.coord, globalCoord)
    // 仅在确有合并结果时写入，避免无谓的对象替换
    const orig = col.editSettings.coord
    if (!orig || typeof orig !== 'object'
      || merged.domain !== (orig.domain || '')
      || merged.application !== (orig.application || orig.app || '')
      || merged.module !== (orig.module || '')) {
      col.editSettings.coord = merged
    }
  }
}

function buildColumnModelMembers (props) {
  if (Array.isArray(props?.columnGroups)) {
    return buildMembersFromColumnsAndGroups(props.columns || [], props.columnGroups || [])
  }
  if (Array.isArray(props?.fields)) {
    const eng = new FlexibleCombinationEngine({})
    return eng.buildMembers({
      detail: {
        fields: props.fields,
        groups: Array.isArray(props.groups) ? props.groups : [],
      },
    })
  }
  return (props?.columns || []).map(buildMember)
}

function buildMembersFromColumnsAndGroups (columns, groups) {
  const cols = (columns || []).map(buildMember)
  const byId = new Map(cols.map((c) => [c.id, c]))
  const used = new Set()
  const buildGroup = (node) => {
    const g = new CmxColumnGroup({
      id: node.id || node.caption,
      caption: node.caption || node.id || '',
      ...(node.aggregate && typeof node.aggregate === 'object' ? { aggregate: node.aggregate } : {}),
      ...(node.aggregatePosition ? { aggregatePosition: node.aggregatePosition } : {}),
    })
    for (const m of (node.members || [])) {
      if (typeof m === 'string') {
        const col = byId.get(m)
        if (col && !used.has(m)) { g.addMember(col); used.add(m) }
      } else if (m && typeof m === 'object') {
        if (Array.isArray(m.members)) {
          const child = buildGroup(m)
          if (child.members.length) g.addMember(child)
        } else {
          const col = buildMember(m)
          if (col?.id && !used.has(col.id)) { g.addMember(col); used.add(col.id) }
        }
      }
    }
    return g
  }
  const out = []
  for (const group of groups || []) {
    const g = buildGroup(group)
    if (g.members.length) out.push(g)
  }
  for (const col of cols) if (col?.id && !used.has(col.id)) out.push(col)
  return out
}

function stripSelectors (nodes) {
  return nodes.map((n) => ({
    id: n.id,
    kind: n.kind,
    children: Array.isArray(n.children) ? stripSelectors(n.children) : undefined,
  }))
}

/**
 * 根据 def.events 为模型实例挂载事件监听器。
 * 脚本作用域：function(event, host) { with (host) { ...userCode... } }
 * 与可视组件 data-event<name> 的运行环境保持一致。
 */
function wireModelEvents (host, def, modelInstance) {
  const events = def?.events
  if (!events || typeof events !== 'object') return
  if (!modelInstance || typeof modelInstance.addEventListener !== 'function') return
  for (const evtName of Object.keys(events)) {
    const codeStr = events[evtName]
    if (!codeStr || !String(codeStr).trim()) continue
    const sourceUrl = `cmx://model-event/${def.instanceId}/${evtName}`
    const dbg = (typeof window !== 'undefined' && window.__cmxDebug) ? 'debugger;\n' : ''
    const decorated = `${dbg}${codeStr}\n//# sourceURL=${sourceUrl}`
    let compiled
    try {
      compiled = new Function('event', 'host', `with (host) {\n${decorated}\n}`)
    } catch (err) {
      console.error(`[cmx-data-comp] model event compile failed (${def.instanceId}/${evtName}):`, err && err.message ? err.message : err)
      continue
    }
    modelInstance.addEventListener(evtName, function (event) {
      try { compiled.call(modelInstance, event, host) }
      catch (err) {
        console.error(`[cmx-data-comp] model event runtime error (${def.instanceId}/${evtName}):`, err && err.message ? err.message : err)
        showCmxToast(err && err.message || String(err), { level: 'warning', title: `模型事件 ${def.instanceId}.${evtName} 执行出错` })
      }
    })
  }
}

/**
 * 按设计器 models 数组创建模型实例并挂到 host，再扫描 Shadow DOM 绑定可视组件。
 *
 * async：内部 await 元数据加载与列填充，列就绪后才触发 host.initPage。
 * 调用方（build-cmx-page-script-block 生成的脚本块）已 `return initPageModels(...)` 承接 Promise。
 *
 * @param {{ dataFlow?: any, dataSources?: any[], models?: any[] }} config
 * @param {HTMLElement} host 页面宿主元素，需已挂 $coord（页面级全局坐标）
 * @param {ShadowRoot|Element} root
 * @param {Record<string, any>} [$data]
 * @returns {Promise<void>}
 */
export async function initPageModels (config, host, root, $data) {
  const models      = Array.isArray(config?.models) ? config.models : []
  const dataFlow    = config?.dataFlow && typeof config.dataFlow === 'object' ? config.dataFlow : null
  const dataSources = Array.isArray(config?.dataSources) ? config.dataSources : []
  // 页面级全局坐标（host.$coord）：由后端 batch 接口的 domain/app/module 注入（见 wrapHtmlDocument）。
  // 各组件消费点用 resolveCoord(局部, globalCoord) 合并——局部有值优先，无值兜底全局。
  const globalCoord = (host && host.$coord && typeof host.$coord === 'object') ? host.$coord : {}
  // 元数据模型 autoLoad 的 Promise 队列：阶段1 收集，阶段1.5 前 await，确保引用方拿到已就绪的元数据。
  const pendingMetaLoads = []
  // CmxColumnModel 引用元数据模型的待绑定队列：{ model, metaModelId, metaTable }。阶段1 收集，阶段1.5 回填。
  const pendingMetaBinds = []
  // FlexibleCombination 待默认 rule 加载队列：无 inlineData 但配了 scenario 坐标的 fc。
  const fcPendingLoads = []

  // 第一步：按 models 数组顺序创建并挂载所有模型实例
  for (const def of models) {
    if (!def?.modelType || !def.instanceId) continue
    const p = def.props || {}

    switch (def.modelType) {

      case 'CmxMasterSlave': {
        const schema       = Array.isArray(p.schema)       ? p.schema       : (dataFlow?.schema || [])
        const aggregations = Array.isArray(p.aggregations) ? p.aggregations : (dataFlow?.aggregations || [])
        const relations    = Array.isArray(dataFlow?.relations) ? dataFlow.relations : []
        host[def.instanceId] = new CmxMasterSlave({
          schema: stripSelectors(schema),
          aggregations,
          relations,
          dataSources,
        })
        host[def.instanceId].bindHost(host)                // ← 新增：注入 host
        wireModelEvents(host, def, host[def.instanceId])
        break
      }

      case 'CmxColumnModel': {
        // 绑定了元数据模型（metaModelId）→ 引用模式：先空列，阶段1.5 从已声明的元数据实例取字段填充；
        // 否则静态模式：用页面写死的 columns 构建。
        const useMetaModel = !!(p.metaModelId && p.metaTable)
        const model = new CmxColumnModel({
          datasetId:   p.datasetId,
          toTitleCols: p.toTitleCols || '',
          iconCol:     p.iconCol     || '',
          members: useMetaModel ? [] : buildColumnModelMembers(p),
        })
        // 引用模式下，把页面手写的 columns（如操作列）缓存，阶段1.5 与元数据自动列合并追加。
        if (useMetaModel && Array.isArray(p.columns) && p.columns.length) {
          model._manualMembers = buildColumnModelMembers(p)
        }
        host[def.instanceId] = model
        wireModelEvents(host, def, host[def.instanceId])
        // 静态列：用全局坐标补全各列字典坐标（引用模式在阶段1.5 填充后补）
        if (!useMetaModel) backfillColumnCoord(model, globalCoord)
        // 只注册到 schema 中包含该 datasetId 路径的 CmxMasterSlave
        for (const m of models) {
          if (m.modelType !== 'CmxMasterSlave' || !m.instanceId || !host[m.instanceId]) continue
          const ms = host[m.instanceId]
          if (!p.datasetId || ms._schemaById?.has(p.datasetId)) {
            ms.setColumnModel(model)
          }
        }
        // 引用模式：暂存待绑定项，阶段1.5 从元数据实例取字段出列。
        if (useMetaModel) {
          pendingMetaBinds.push({ model, metaModelId: p.metaModelId, metaTable: p.metaTable })
        }
        break
      }

      case 'CmxDataSet': {
        const ds = new CmxDataSet({ datasetId: def.instanceId })
        // props.rows 有初始数据时直接批量写入
        if (Array.isArray(p.rows) && p.rows.length) {
          ds.setRows(p.rows)
        }
        host[def.instanceId] = ds
        wireModelEvents(host, def, host[def.instanceId])
        break
      }

      case 'FlexibleCombination': {
        // 坐标与全局合并（局部优先）：弹性组合场景通常与页面同域同模块。
        const fcCoord = resolveCoord({ domain: p.domain, app: p.app, module: p.module }, globalCoord)
        const fc = new CmxFlexibleCombination({
          domain:        fcCoord.domain,
          app:           fcCoord.application,
          module:        fcCoord.module,
          scenario:      p.scenario,
          columnModelId: p.columnModelId,
          apiPath:       p.apiPath,
          serviceFn:     p.serviceFn,
          anchorDimensions: p.anchorDimensions,
        })
        fc.bindHost(host)
        host[def.instanceId] = fc
        wireModelEvents(host, def, fc)
        // 绑定目标 CmxColumnModel 延后到第二步：此处先记下，待第二轮回填
        break
      }

      case 'CmxDCTMeta': {
        // 坐标与全局合并（局部优先）：domain/application/module 齐全才能定位定义文件。
        const dctCoord = resolveCoord({ domain: p.domain, application: p.application || p.app, module: p.module }, globalCoord)
        const model = new CmxDCTMeta({ ...p, domain: dctCoord.domain, application: dctCoord.application, module: dctCoord.module })
        model.bindHost(host)
        host[def.instanceId] = model
        wireModelEvents(host, def, model)
        if (p.autoLoad && (p.id || p.metaId)) {
          // 保留 loadById 的 Promise：阶段1.5 的 CmxColumnModel 引用绑定需等元数据就绪后取字段。
          model._loadPromise = model.loadById(p.id || p.metaId).catch((e) => {
            console.warn(`[cmx-data-comp] CmxDCTMeta ${def.instanceId} autoLoad failed:`, e && e.message || e)
            toastModelError(`字典元数据 ${def.instanceId} 加载失败`, e)
          })
          pendingMetaLoads.push(model._loadPromise)
        }
        break
      }

      case 'CmxDOCMeta': {
        // 坐标与全局合并（局部优先）：domain/application/module 齐全才能定位定义文件。
        const docCoord = resolveCoord({ domain: p.domain, application: p.application || p.app, module: p.module }, globalCoord)
        const model = new CmxDOCMeta({ ...p, domain: docCoord.domain, application: docCoord.application, module: docCoord.module })
        model.bindHost(host)
        host[def.instanceId] = model
        wireModelEvents(host, def, model)
        if (p.autoLoad && (p.id || p.metaId)) {
          // 保留 loadById 的 Promise：阶段1.5 的 CmxColumnModel 引用绑定需等元数据就绪后取字段。
          model._loadPromise = model.loadById(p.id || p.metaId).catch((e) => {
            console.warn(`[cmx-data-comp] CmxDOCMeta ${def.instanceId} autoLoad failed:`, e && e.message || e)
            toastModelError(`单据元数据 ${def.instanceId} 加载失败`, e)
          })
          pendingMetaLoads.push(model._loadPromise)
        }
        break
      }

      default:
        break
    }
  }

  // 第一·二步：等待所有元数据模型 autoLoad 完成，再处理 CmxColumnModel 的元数据引用绑定。
  // 必须 await：列模型就绪后才能触发 initPage → loadVoucher（否则数据先于列到达，grid 无列渲染不出数据）。
  if (pendingMetaLoads.length) {
    await Promise.all(pendingMetaLoads)
  }
  // 第一·三步：把绑定了 metaModelId 的 CmxColumnModel 与已就绪的元数据实例关联——
  // 从元数据实例取指定表/字典的字段，经 metaTableFieldsToColumns 转成 CmxColumn[] 填充。
  if (pendingMetaBinds.length) {
    for (const { model, metaModelId, metaTable } of pendingMetaBinds) {
      const meta = metaModelId && host[metaModelId]
      if (!meta) {
        console.warn(`[cmx-data-comp] CmxColumnModel 引用的元数据模型「${metaModelId}」未声明或未就绪`)
        continue
      }
      // DOC 按 tableName 取表；DCT 按 dictCode 取字典表（getDictionary 是 CmxDCTMeta 特有方法）。
      const table = meta.kind === 'DCT'
        ? (typeof meta.getDictionary === 'function' ? meta.getDictionary(metaTable) : null)
        : meta.getTable(metaTable)
      if (!table) {
        console.warn(`[cmx-data-comp] 元数据模型「${metaModelId}」中未找到表「${metaTable}」`)
        continue
      }
      /* 设计器页面初始化自动填充列模型（阶段 1.5）。
       * 此处传字符串 meta.kind（非完整 meta 对象），走原路径（isEnhanced=false）：
       * 不启用业务键 readonlyWhen、树形父节点字典选择等增强逻辑。
       * 对于 dct-data-editor-html.html 等页面，switchDict 随后会调 fromMeta（传对象，走增强路径）
       * 覆盖此次填充结果，因此这里的初始填充仅作为首帧兜底（避免 grid 无列闪烁）。 */
      const autoCols = metaTableFieldsToColumns(table.listFields(), meta.kind, {
        // 该表声明了 fieldSetOrder（设计期「分组排序」）时，列序已在 _buildFieldRefs 按
        // 分组顺序排定，此处不再把系统列沉底，完整尊重用户自定义分组顺序。
        respectOrder: Array.isArray(table.raw?.fieldSetOrder) && table.raw.fieldSetOrder.length > 0,
      })
      // 合并：元数据自动列 + 页面手写列（如操作列）追加在后。手写列 id 与元数据字段不冲突。
      model.setMembers([...autoCols, ...(model._manualMembers || [])])
      // 元数据字段不保证带齐全字典坐标，用全局坐标兜底。
      // host.$coord 为空时（如 html-page 未注入），从元数据模型实例的 domain/application/module 取兜底。
      const metaCoord = {
        domain: meta.domain || '',
        application: meta.application || meta.app || '',
        module: meta.module || '',
      }
      const fallbackCoord = (globalCoord.domain || globalCoord.application || globalCoord.module)
        ? globalCoord
        : metaCoord
      backfillColumnCoord(model, fallbackCoord)
    }
  }

  // 第一·四步：协调器 bindDocMeta / bindDctMeta（必须在元数据 autoLoad 完成 pendingMetaLoads await 之后）
  // 注意：loadDoc/loadDict **不**在此处触发——要等阶段2 视图绑定（bindTable/bindForm）完成后，
  // 协调器 _bindings 才有 view；setDataSet → _renderAll 才能把数据推给 grid。
  // 真正的 loadDoc/loadDict 推迟到「第二步之后」执行（见文件末尾 pendingMsLoads 段）。
  const pendingMsLoads = []
  for (const def of models) {
    if (def.modelType !== 'CmxMasterSlave' || !def.instanceId) continue
    const ms = host[def.instanceId]
    if (!ms || !def.props?.autoLoad) continue
    const p = def.props
    // 关联元数据实例（用于 saveDoc/saveDict 自动出中文表名）。
    // bindDctMeta 与 bindDocMeta 内部字段一致，DOC/DCT 元数据都能挂。
    if (p.metaModelId && host[p.metaModelId]) {
      const metaModel = host[p.metaModelId]
      if (metaModel.kind === 'DCT' && typeof ms.bindDctMeta === 'function') {
        ms.bindDctMeta(metaModel)
      } else {
        ms.bindDocMeta(metaModel)
      }
    }
  }

  // 第一·五步：把 FlexibleCombination 与已就绪的目标 CmxColumnModel 关联，并消费 props.inlineData
  for (const def of models) {
    if (def.modelType !== 'FlexibleCombination' || !def.instanceId) continue
    const fc = host[def.instanceId]; if (!fc) continue
    const p = def.props || {}
    const cmid = p.columnModelId
    if (typeof cmid === 'string' && cmid) {
      /* 单绑定：命中的字段集0 写入该列模型 */
      const target = host[cmid]
      if (target) fc.bindColumnModel(target)
      else console.warn(`[cmx-data-comp] FlexibleCombination ${def.instanceId} 的目标列模型 "${cmid}" 不存在（columnModelId 须对齐已声明的 CmxColumnModel instanceId）`)
    } else if (cmid && typeof cmid === 'object') {
      /* 多绑定：{ 表名: 列模型ID }——规则各字段集按表路由；'*' 为兜底 */
      for (const [table, id] of Object.entries(cmid)) {
        const target = host[id]
        if (target) fc.bindColumnModel(target, table)
        else console.warn(`[cmx-data-comp] FlexibleCombination ${def.instanceId} 表 "${table}" 的目标列模型 "${id}" 不存在`)
      }
    }
    /* JSON 直设：props.inlineData 形如 {rule,dimensions[,anchor]} 或 {rules,dimensions[,anchor]} */
    if (p.inlineData && typeof p.inlineData === 'object') {
      try { fc.setCombination(p.inlineData) }
      catch (e) { console.warn(`[cmx-data-comp] FlexibleCombination ${def.instanceId} 套用 inlineData 失败：`, e && e.message || e) }
    } else if (fc.scenario && fc.module) {
      /* 无 inlineData 且坐标齐备（domain/app/module 可由页面级全局坐标兜底解析到实例上）
         → 自动拉取默认 rule 出列。失败静默（保持目标模型原列），不阻断页面初始化。 */
      fcPendingLoads.push(fc)
    }
  }

  // FlexibleCombination 默认 rule 加载（无 inlineData 但配了 scenario）。
  // 在 grid 绑定前完成，使列随 setMembers 派发的 columns-changed 自动同步到 grid。
  if (fcPendingLoads.length) {
    await Promise.all(fcPendingLoads.map((fc) => fc.loadDefaultRule()))
  }

  // 第二步：扫描 Shadow DOM，从可视组件的属性读取绑定关系

  root.querySelectorAll('[data-cmx-model-id]').forEach((el) => {
    const modelId = el.getAttribute('data-cmx-model-id')
    const model = modelId && host[modelId]
    if (model && typeof el.setColumnModel === 'function') el.setColumnModel(model)
  })

  // 新方式：以 data-cmx-master-slave-id 为主键精确绑定
  root.querySelectorAll('[data-cmx-master-slave-id]').forEach((el) => {
    const msId = el.getAttribute('data-cmx-master-slave-id')
    if (!msId) return
    const ms = host[msId]
    if (!ms) return
    const datasetId = el.getAttribute('data-cmx-dataset-id')
    if (!datasetId) return
    const kind = el.getAttribute('data-cmx-kind')
      || (el.tagName?.toLowerCase() === 'cmx-ui5-form' ? 'single' : 'list')
    if (kind === 'single') ms.bindForm(datasetId, el)
    else ms.bindTable(datasetId, el)
  })

  // 旧方式兼容：只有 data-cmx-dataset-id 而无 data-cmx-master-slave-id 的组件
  // 直接把 datasetId 对应的 CmxDataSet 实例设置到可视组件，不走 CmxMasterSlave
  root.querySelectorAll('[data-cmx-dataset-id]:not([data-cmx-master-slave-id])').forEach((el) => {
    const datasetId = el.getAttribute('data-cmx-dataset-id')
    if (!datasetId) return
    const ds = host[datasetId]
    if (!ds) return
    if (typeof el.setDataSet === 'function') el.setDataSet(ds)
  })

  // 初始数据装载（显式 cmxInitialData 优先，跳过 autoLoad）
  for (const def of models) {
    if (def.modelType === 'CmxMasterSlave' && host[def.instanceId] && $data?.cmxInitialData) {
      host[def.instanceId].setData($data.cmxInitialData)
    }
  }

  // 第二·五步：协调器 autoLoad 装载数据。必须在视图绑定（bindTable/bindForm）之后，
  // 否则 setDataSet → _renderAll 时 _bindings 还为空，数据装进协调器但没 view 接收。
  // 仅当没有显式 cmxInitialData 时才 autoLoad（二者互斥，避免互相覆盖）。
  //
  // loadKind 语义分层：
  //   - loadKind 只表达「装载形态」（list / detail / children / …），不带 kind 前缀
  //   - kind（DOC/DCT/…）由 metaModelId 指向的元模型 kind 自动决定
  //   - 具体调哪个协调器方法由 _LOAD_DISPATCH 派发表决定（单一事实来源，加形态改一行）
  for (const def of models) {
    if (def.modelType !== 'CmxMasterSlave' || !def.instanceId) continue
    const ms = host[def.instanceId]
    if (!ms || !def.props?.autoLoad) continue
    if ($data?.cmxInitialData) continue
    const p = def.props
    const form = String(p.loadKind || '').trim()
    if (!form) continue
    const metaModel = p.metaModelId ? host[p.metaModelId] : null
    const kind = metaModel?.kind
    if (!kind) {
      console.warn(`[cmx-data-comp] CmxMasterSlave ${def.instanceId} autoLoad 跳过：loadKind='${form}' 但 metaModelId 未指向已声明的元模型`)
      continue
    }
    const call = _LOAD_DISPATCH[`${kind}:${form}`]
    if (!call) {
      console.warn(`[cmx-data-comp] CmxMasterSlave ${def.instanceId} autoLoad 跳过：未支持的形态 ${kind}:${form}`)
      continue
    }
    // 分页启用优先级：props.paging（存量配置）> cmx-pager 组件（设计器推荐方式）。
    // 检测页面上是否有 cmx-pager 指向此协调器，有则自动用根层 + page-sizes[0] 启用分页。
    if (!p.paging && typeof ms.enablePaging === 'function' && typeof root.querySelector === 'function') {
      const pagerEl = root.querySelector(`cmx-pager[master-slave-id="${def.instanceId}"]`)
      if (pagerEl) {
        const sizesAttr = pagerEl.getAttribute('page-sizes') || '50,100,200'
        const pageSizeAttr = Number(pagerEl.getAttribute('page-size'))
        const firstSize = Number(sizesAttr.split(',')[0]) || 50
        try {
          ms.enablePaging({ pageSize: pageSizeAttr || firstSize })
        } catch (e) {
          console.warn(`[cmx-data-comp] CmxMasterSlave ${def.instanceId} enablePaging (from cmx-pager) failed:`, e && e.message || e)
        }
      }
    }
    // 兼容：协调器 props 里显式配了 paging 的存量页面，仍由 init-page-models 启用分页。
    if (p.paging && typeof ms.enablePaging === 'function') {
      try { ms.enablePaging(p.paging) }
      catch (e) { console.warn(`[cmx-data-comp] CmxMasterSlave ${def.instanceId} enablePaging failed:`, e && e.message || e) }
    }
    const loadDef = _buildLoadDef(p, host)
    pendingMsLoads.push(
      call(ms, loadDef).catch((e) => {
        // 装载 HTTP 错误已由 loadDoc/loadDict 内部统一弹 presentDocError（并打 __presented 标记）；
        // 此处记日志，并对未被弹窗覆盖的错误（如 def 构建问题）补一条轻提示。
        console.warn(`[cmx-data-comp] CmxMasterSlave ${def.instanceId} autoLoad(${kind}:${form}) failed:`, e && e.message || e)
        toastModelError(`${def.instanceId} 初始化装载失败`, e)
      }),
    )
  }
  if (pendingMsLoads.length) await Promise.all(pendingMsLoads)

  if (typeof host.initPage === 'function') {
    try {
      host.initPage({})
    } catch (e) {
      console.warn('[cmx-data-comp] initPageModels: initPage failed:', e)
      toastModelError('页面初始化脚本(initPage)执行失败', e)
    }
  }
}
