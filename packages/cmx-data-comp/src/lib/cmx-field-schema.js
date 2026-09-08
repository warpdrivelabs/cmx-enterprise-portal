/**
 * cmx-field-schema — 列/字段定义的统一 schema（三端并集，合并同类项）
 *
 * 背景：数据字典(DCT)/业务单据(DOC)/弹性组合(CTX) 三端各自实现了"列定义 UI"，
 * 属性散落、命名不一。本模块把三端可设属性取并集、按语义归类，形成单一事实来源，
 * 由 cmx-field-ui.js 驱动渲染表格内联编辑 + property 详编面板，由 cmx-field-adapter.js
 * 桥接各端不同的存储键名（id/name/caption、dataType 物理/逻辑 等）。
 *
 * 设计要点：
 *   - 每个属性标 appliesTo（属于哪些端）→ 渲染时按端过滤 = "并集 + 按端裁剪"
 *   - placement: inline(表格内联) | panel(详编面板) | both
 *   - section: 语义分区，详编面板按 section 分块
 *   - control: 统一控件类型，由 cmx-field-ui 渲染
 *   - options / enableWhen / visibleWhen: 动态行为钩子，运行期由 ctx/adapter 提供
 *
 * 规范属性键（key）是 UI 层的统一键；各端实际存储键由 adapter 映射，schema 不关心存储。
 */

import { EDIT_MODES, editModeLabel } from './cmx-field-uicontrol.js'

/** 端标识 */
export const ENDS = Object.freeze({ DCT: 'DCT', DOC: 'DOC', FLC: 'FLC' })

/** 详编面板分区（顺序即渲染顺序） + 中文标题
 *  共享区（三端统一）：basic / reference / edit / constraint / governance / control / display / compute / flcLayout
 *  其中 compute 的 source.dimension / source.attribute / defaultFrom.* 子项 + validations 仍为 FLC 独有（依赖维度上下文）。 */
export const SECTIONS = Object.freeze([
  { id: 'basic', title: '基本' },
  { id: 'reference', title: '引用字典' },
  { id: 'edit', title: '编辑' },
  { id: 'editorProps', title: '录入控件属性' },
  { id: 'constraint', title: '约束校验' },
  { id: 'governance', title: '数据治理' },
  { id: 'control', title: '字段控制（动态条件）' },
  // 显示：表现交互层（数值精度/格式/对齐），三端共享。DCT/DOC 提供默认值，FLC 可 overlay 覆盖。
  { id: 'display', title: '显示' },
  // 计算与带出：formula/dependsOn/unitField 三端共享；source.*/defaultFrom.* 仍 FLC 独有。
  { id: 'compute', title: '计算与带出' },
  // 列布局：列宽/冻结/可见，三端统一（agg 已归入约束校验）。
  { id: 'flcLayout', title: '列布局' },
])

/** 录入控件下拉选项（统一值域，供 editMode 用） */
const EDIT_MODE_OPTIONS = [{ value: '', label: '（默认）' }, ...EDIT_MODES.map((v) => ({ value: v, label: editModeLabel(v) }))]

/** display.format 下拉选项——按 display.mode 分组。
 *  选项 value 直接存为 formatByPreset 可识别的完整串（用户一选即生效）。
 *  - number/缺省：千分位/百分比/货币等数值格式（thousands 也是一种合法格式预设）
 *  - text：日期/时间格式化（不可编辑时间字段走这里），按年/年月/年月日/到时分秒各档补全常用格式
 *  下拉只列高频预设；用户要的值不在列表里（如 currency:$ / date:YYYY年MM月）由旁边的文本框手改，
 *  防丢值机制（selectHtml）保证手改的自定义值在 select 里也有对应 option 显示。 */
const FORMAT_OPTIONS_NUMBER = [
  { value: '', label: '无' },
  { value: 'thousands', label: '千分位' },
  { value: 'percent', label: '百分比' },
  { value: 'currency:¥', label: '货币' },
]
const FORMAT_OPTIONS_TEXT = [
  { value: '', label: '无' },
  { value: 'date:YYYY', label: '年' },
  { value: 'date:YYYY-MM', label: '年-月' },
  { value: 'date:YYYY-MM-DD', label: '年-月-日' },
  { value: 'date:YYYY/MM/DD', label: '年/月/日' },
  { value: 'datetime:YYYY-MM-DD HH', label: '年-月-日 HH:mm' },
  { value: 'datetime:YYYY-MM-DD HH:mm', label: '年-月-日 HH:mm' },
  { value: 'datetime:YYYY-MM-DD HH:mm:ss', label: '年-月-日 HH:mm:ss' },
  { value: 'datetime:HH:mm', label: 'HH:mm' },
  { value: 'datetime:HH:mm:ss', label: 'HH:mm:ss' },
]

/** display.format 的配置说明（tips）：点击 label 后的问号图标弹出显示。
 *  说明涵盖数值模式与文本模式两套预设，以及日期占位符的自由组合方式。 */
const FORMAT_TIPS = [
  '格式化预设，下拉选高频预设或文本框手改任意值。',
  '',
  '数值模式（显示模式 = number）：',
  '  · thousands — 千分位（如 1,234.00）',
  '  · percent — 百分比（值×100 加 %，如 12.5%）',
  '  · currency:¥ — 货币（符号可改，如 currency:$、currency:€）',
  '',
  '文本模式（显示模式 = text，日期/时间字段）：',
  '  · date:YYYY-MM-DD — 日期',
  '  · datetime:YYYY-MM-DD HH:mm:ss — 日期时间',
  '',
  '占位符：YYYY 年 / MM 月 / DD 日 / HH 时 / mm 分 / ss 秒，可自由组合',
  '示例：date:YYYY-MM、datetime:HH:mm、date:YYYY年MM月DD日',
].join('\n')

const EDITOR_PROP_ENDS = [ENDS.DCT, ENDS.DOC, ENDS.FLC]

/** cmx-dict-select 录入控件属性。
 * key 统一落到 editSettings.*（与 cmx-dict-field-type.js 的 dictCfgFromField 读取位置一致）。 */
const DICT_SELECT_PROPS = [
  // 字典编码不在此配置——录入控件「字典选择」自动跟随字段的「引用字典」(refDict)，
  // 二者合一：用户只在 reference 区选一次引用字典，录入控件自动用同一本。运行时 createRestDictDataSource 从 field.refDict 取 dictCode。
  // 目标库也不在此配置——后端 /api/dct/data/search 在 db_id header 缺失时自动用业务库（source_type=biz，如 fico-db）。
  { key: 'editSettings.helpLayout', label: '帮助布局', control: 'select', options: () => [
    { value: 'grid', label: '表格(grid)' },
    { value: 'classify', label: '左分类树+右表格(classify)' },
    { value: 'group', label: '左分组树+右表格(group)' },
  ] },
  { key: 'editSettings.hierarchical', label: '分级字典', control: 'checkbox', valueType: 'boolean' },
  { key: 'editSettings.idCol', label: 'ID 列', control: 'text', placeholder: 'id' },
  { key: 'editSettings.codeCol', label: '编码列', control: 'text', placeholder: 'code' },
  { key: 'editSettings.labelCol', label: '名称列', control: 'text', placeholder: 'name' },
  { key: 'editSettings.parentCol', label: '父级列', control: 'text', placeholder: 'parent_id' },
  { key: 'editSettings.valueField', label: '值字段', control: 'text', placeholder: 'id（写回行字段，默认 idCol）' },
  { key: 'editSettings.displayField', label: '显示字段', control: 'text', placeholder: 'name' },
  { key: 'editSettings.displayMode', label: '显示模式', control: 'select', options: () => [
    { value: 'auto', label: '自动(auto)' },
    { value: 'value', label: '原始值(value)' },
    { value: 'code', label: '编码(code)' },
    { value: 'label', label: '名称(label)' },
    { value: 'code-label', label: '编码-名称(code-label)' },
    { value: 'field', label: '指定字段(field)' },
  ] },
  { key: 'editSettings.displayTemplate', label: '显示模板', control: 'text', placeholder: '${code} - ${name}' },
  { key: 'editSettings.dictTitle', label: '帮助标题', control: 'text', placeholder: '选择会计科目' },
  { key: 'editSettings.showClear', label: '显示清除按钮', control: 'checkbox', valueType: 'boolean' },
  { key: 'editSettings.mruMax', label: '最近选择条数', control: 'number', valueType: 'number', placeholder: '10' },
  { key: 'editSettings.dropdownWidth', label: '下拉宽度', control: 'text', placeholder: '480px' },
  { key: 'editSettings.dropdownMaxHeight', label: '下拉最大高度', control: 'text', placeholder: '360px' },
  { key: 'editSettings.placeholder', label: '占位符', control: 'text' },
  { key: 'edit.readonly', label: '只读', control: 'checkbox', valueType: 'boolean' },
]

/** 录入控件详细属性 schema。
 * key 写入 edit.*，由 cmx-ui5-form / cmx-revo-grid 通过 setField(field) 贯通到编辑器。
 * 新增编辑器时只需要往这里补一个 mode 对应的属性列表。 */
export const EDITOR_PROPERTY_SCHEMA = Object.freeze({
  'cmx-text-input': [
    { key: 'edit.inputType', label: '输入类型', control: 'select', options: () => ['', 'text', 'phone', 'email', 'idcard'] },
    { key: 'edit.pattern', label: '校验正则', control: 'text', placeholder: '如 ^[A-Z0-9_]{2,32}$' },
    { key: 'edit.maxlength', label: '最大长度', control: 'number', valueType: 'number' },
    { key: 'edit.i18n', label: '多语言', control: 'checkbox', valueType: 'boolean' },
    { key: 'edit.locale', label: '当前语言', control: 'text', placeholder: 'zh_CN' },
    { key: 'edit.placeholder', label: '占位符', control: 'text' },
    { key: 'edit.readonly', label: '只读', control: 'checkbox', valueType: 'boolean' },
  ],
  'cmx-textarea-input': [
    { key: 'edit.rows', label: '行数', control: 'number', valueType: 'number' },
    { key: 'edit.maxlength', label: '最大长度', control: 'number', valueType: 'number' },
    { key: 'edit.placeholder', label: '占位符', control: 'text' },
    { key: 'edit.readonly', label: '只读', control: 'checkbox', valueType: 'boolean' },
  ],
  'cmx-richtext-input': [
    { key: 'edit.height', label: '高度', control: 'text', placeholder: '240px' },
    { key: 'edit.toolbar', label: '工具栏', control: 'select', options: () => ['', 'basic', 'full', 'none'] },
    { key: 'edit.placeholder', label: '占位符', control: 'text' },
    { key: 'edit.readonly', label: '只读', control: 'checkbox', valueType: 'boolean' },
  ],
  'cmx-number-input': [
    { key: 'edit.intDigits', label: '整数位', control: 'number', valueType: 'number' },
    { key: 'edit.decimalDigits', label: '小数位', control: 'number', valueType: 'number' },
    { key: 'edit.min', label: '最小值', control: 'number', valueType: 'number' },
    { key: 'edit.max', label: '最大值', control: 'number', valueType: 'number' },
    { key: 'edit.thousandSeparator', label: '千分位', control: 'checkbox', valueType: 'boolean' },
    { key: 'edit.placeholder', label: '占位符', control: 'text' },
    { key: 'edit.readonly', label: '只读', control: 'checkbox', valueType: 'boolean' },
  ],
  'cmx-date-input': [
    { key: 'edit.formatPattern', label: '日期格式', control: 'text', placeholder: 'yyyy-MM-dd' },
    { key: 'edit.minDate', label: '最小日期', control: 'text', placeholder: '2026-01-01' },
    { key: 'edit.maxDate', label: '最大日期', control: 'text', placeholder: '2026-12-31' },
    { key: 'edit.placeholder', label: '占位符', control: 'text' },
    { key: 'edit.readonly', label: '只读', control: 'checkbox', valueType: 'boolean' },
  ],
  'cmx-datetime-input': [
    { key: 'edit.formatPattern', label: '日期时间格式', control: 'text', placeholder: 'yyyy-MM-dd HH:mm:ss' },
    { key: 'edit.minDate', label: '最小日期时间', control: 'text', placeholder: '2026-01-01 00:00:00' },
    { key: 'edit.maxDate', label: '最大日期时间', control: 'text', placeholder: '2026-12-31 23:59:59' },
    { key: 'edit.placeholder', label: '占位符', control: 'text' },
    { key: 'edit.readonly', label: '只读', control: 'checkbox', valueType: 'boolean' },
  ],
  // cmx-dict-select 属性统一落到 editSettings.*（与 cmx-dict-field-type.js 的 dictCfgFromField 读取位置一致）。
  // helpLayout 三种帮助布局：grid(自分级 treegrid) / classify(左分类树+右grid) / group(左分组树+右grid)。
  'cmx-dict-select': DICT_SELECT_PROPS,
})

for (const props of Object.values(EDITOR_PROPERTY_SCHEMA)) {
  for (const p of props) {
    p.section = 'editorProps'
    p.placement = 'panel'
    p.appliesTo = EDITOR_PROP_ENDS
    p.editorProp = true
  }
}

/** 物理数据类型（三端统一） */
const PHYSICAL_TYPES = ['VARCHAR', 'INT', 'BIGINT', 'TINYINT', 'DECIMAL', 'DATE', 'DATETIME', 'TEXT', 'BOOLEAN']
/** 维度类型（dimType）统一值域：含"未设置"空项(显示 -) + 4 项，中文(英文) 显示，三端一致 */
const DIM_TYPE_OPTIONS = [
  { value: '', label: '-' },
  { value: 'dimension', label: '维度(dimension)' },
  { value: 'attribute', label: '属性(attribute)' },
  { value: 'measure', label: '度量(measure)' },
  { value: 'relation', label: '关系(relation)' },
]

const A = ENDS

/**
 * 判断字段的 display.mode 是否在给定集合内（用于 display 属性按模式联动显隐）。
 * mode 缺省（无 display 对象或 mode 为空）视为 '' 空串，匹配含 '' 的集合。
 * @param {object} row  当前字段对象
 * @param {string[]} modes  允许的 mode 集合（含 '' 表示"未选模式"也匹配）
 */
function _displayModeIn (row, modes) {
  const disp = row && row.display
  const mode = (disp && typeof disp === 'object' && disp.mode) || ''
  return modes.includes(mode)
}

/**
 * 列定义属性全集。每项：
 *   key, label, control, section, placement, appliesTo, valueType?, options?, enableWhen?, visibleWhen?, placeholder?, tips?
 * control ∈ text|number|checkbox|select|select-labeled|select-text|multiselect|dict-ref|formula|readonly-text
 * tips（可选）：配置说明文本，渲染时在 label 后显示问号图标，点击弹出 Popover（目前 display.format 使用）。
 */
export const FIELD_SCHEMA = Object.freeze([
  // ── basic（基本：表格内联高频列）──
  { key: 'id', label: 'ID', control: 'text', section: 'basic', placement: 'inline', appliesTo: [A.DCT, A.DOC, A.FLC] },
  { key: 'name', label: 'Name', control: 'text', section: 'basic', placement: 'inline', appliesTo: [A.DCT, A.DOC, A.FLC] },
  { key: 'caption', label: '标题', control: 'text', section: 'basic', placement: 'inline', appliesTo: [A.DCT, A.DOC, A.FLC] },
  // 维度类型(dimType)：DCT/DOC/CTX 统一放在 property 基本区（panel），label/值域一致；DOC 端按 hasDimType 显示，DCT/CTX 恒显示
  { key: 'dimType', label: '维度类型', control: 'select', section: 'basic', placement: 'panel', appliesTo: [A.DCT, A.DOC, A.FLC], visibleWhen: (row, ctx) => ctx.end !== 'DOC' || ctx.hasDimType, options: () => DIM_TYPE_OPTIONS },
  // 数据类型(dataType)：物理类型，三端统一 label「数据类型」；DCT/DOC 可编辑、CTX 表格内只读
  { key: 'dataType', label: '数据类型', control: 'select', section: 'basic', placement: 'inline', appliesTo: [A.DCT, A.DOC], options: () => PHYSICAL_TYPES },
  { key: 'dataType', label: '数据类型', control: 'select', section: 'basic', placement: 'inline', appliesTo: [A.FLC], options: () => PHYSICAL_TYPES, enableWhen: () => false },
  { key: 'fieldLength', label: '长度', control: 'number', section: 'basic', placement: 'inline', appliesTo: [A.DCT, A.DOC], valueType: 'number', enableWhen: (row, ctx) => ctx.typeCaps(row).len },
  { key: 'intDigits', label: '整数位', control: 'number', section: 'basic', placement: 'inline', appliesTo: [A.DCT, A.DOC], valueType: 'number', enableWhen: (row, ctx) => ctx.typeCaps(row).int },
  { key: 'decimalDigits', label: '小数位', control: 'number', section: 'basic', placement: 'inline', appliesTo: [A.DCT, A.DOC], valueType: 'number', enableWhen: (row, ctx) => ctx.typeCaps(row).dec },
  { key: 'nullable', label: '可空', control: 'checkbox', section: 'basic', placement: 'inline', appliesTo: [A.DCT, A.DOC], valueType: 'boolean' },
  // 主键(isPrimaryKey)：DCT/DOC 本表定义字段与基础元数据字段集均可行内勾选；存 1(是主键)/0(非主键)。
  // 早期仅在基础元数据端(ctx.isBase)开放，现放开为所有 DCT/DOC 定义——本表字段也需要能指定主键。
  { key: 'isPrimaryKey', label: '主键', control: 'checkbox', section: 'basic', placement: 'inline', appliesTo: [A.DCT, A.DOC], valueType: 'boolean-int' },


  // ── reference（引用字典）── 三端统一。CTX 的 refDict 绑定 profile 维度，refField/displayField 从其属性列选。
  { key: 'refDict', label: '引用字典', control: 'select', section: 'reference', placement: 'panel', appliesTo: [A.DCT, A.DOC, A.FLC], visibleWhen: (row, ctx) => ctx.end !== 'FLC' || row.dimType === 'dimension', options: (ctx, field) => ctx.refDictOptions(field) },
  { key: 'refField', label: '引用字段', control: 'select', section: 'reference', placement: 'panel', appliesTo: [A.DCT, A.DOC, A.FLC], visibleWhen: (row, ctx) => ctx.end !== 'FLC' || row.dimType === 'dimension', options: (ctx, field) => ctx.refFieldOptions(field) },
  { key: 'displayField', label: '显示字段', control: 'select', section: 'reference', placement: 'panel', appliesTo: [A.DCT, A.DOC, A.FLC], visibleWhen: (row, ctx) => ctx.end !== 'FLC' || row.dimType === 'dimension', options: (ctx, field) => ctx.refFieldOptions(field) },

  // ── edit（编辑）── 三端统一
  { key: 'edit.mode', label: '录入控件', control: 'select-labeled', section: 'edit', placement: 'panel', appliesTo: [A.DCT, A.DOC, A.FLC], options: (ctx) => ctx.editModeOptions ? ctx.editModeOptions() : EDIT_MODE_OPTIONS },
  { key: 'edit.required', label: '必填', control: 'checkbox', section: 'edit', placement: 'panel', appliesTo: [A.DCT, A.DOC, A.FLC], valueType: 'boolean' },

  // ── display（显示）── 三端统一（schema key = 存储路径）
  // 表现交互层属性：数值精度/格式/对齐是字段固有属性，DCT/DOC 提供默认值，FLC可 overlay 覆盖。
  // visibleWhen 按 display.mode 联动：纯数值属性（小数位/千分位/0显空/负数红字）仅在 number 模式显示。
  // format 是「下拉+文本框」复合控件（select-text）：下拉选高频预设、文本框手改任意格式串，两者同值同步。
  //   - number/缺省：无 / 千分位 / 百分比 / 货币(¥)（货币符号可手改成 $/€ 等）
  //   - text：日期/时间各档格式（年/年月/年月日/到时分秒/纯时分），任意格式可手改
  // badge/link/icon 模式不显示 format（各自有专属属性）。
  { key: 'display.align', label: '对齐', control: 'select', section: 'display', placement: 'panel', appliesTo: [A.DCT, A.DOC, A.FLC], options: () => ['', 'left', 'center', 'right'] },
  { key: 'display.mode', label: '显示模式', control: 'select', section: 'display', placement: 'panel', appliesTo: [A.DCT, A.DOC, A.FLC], options: () => ['', 'text', 'number', 'badge', 'link', 'icon', 'actions'] },
  { key: 'display.format', label: '格式', control: 'select-text', section: 'display', placement: 'panel', appliesTo: [A.DCT, A.DOC, A.FLC], placeholder: '请输入自定义format', tips: FORMAT_TIPS, options: (_ctx, field) => _displayModeIn(field, ['text']) ? FORMAT_OPTIONS_TEXT : FORMAT_OPTIONS_NUMBER, visibleWhen: (row) => _displayModeIn(row, ['', 'number', 'text']) },
  { key: 'display.decimalDigits', label: '显示小数位', control: 'number', section: 'display', placement: 'panel', appliesTo: [A.DCT, A.DOC, A.FLC], valueType: 'number', visibleWhen: (row) => _displayModeIn(row, ['', 'number']) },
  { key: 'display.thousandSeparator', label: '千分位', control: 'checkbox', section: 'display', placement: 'panel', appliesTo: [A.DCT, A.DOC, A.FLC], valueType: 'boolean', visibleWhen: (row) => _displayModeIn(row, ['', 'number']) },
  { key: 'display.zeroAsBlank', label: '0 显示空', control: 'checkbox', section: 'display', placement: 'panel', appliesTo: [A.DCT, A.DOC, A.FLC], valueType: 'boolean', visibleWhen: (row) => _displayModeIn(row, ['', 'number']) },
  { key: 'display.negativeColor', label: '负数红字', control: 'checkbox', section: 'display', placement: 'panel', appliesTo: [A.DCT, A.DOC, A.FLC], valueType: 'boolean', visibleWhen: (row) => _displayModeIn(row, ['', 'number']) },

  // ── compute（计算与带出）── 三端统一（formula/dependsOn/unitField）+ FLC 独有（source.*/defaultFrom.*）
  // formula/dependsOn/unitField 是通用计算能力，不依赖维度上下文，三端共享；
  // source.*/defaultFrom.* 强依赖弹性组合的维度面板（dimensionCodes/attrOptions），保持 FLC 独占。
  { key: 'formula', label: '公式', control: 'formula', section: 'compute', placement: 'panel', appliesTo: [A.DCT, A.DOC, A.FLC] },
  { key: 'dependsOn', label: '依赖', control: 'text', section: 'compute', placement: 'panel', appliesTo: [A.DCT, A.DOC, A.FLC], valueType: 'list' },
  { key: 'source.dimension', label: '来源维度', control: 'select', section: 'compute', placement: 'panel', appliesTo: [A.FLC], visibleWhen: (row) => row.dimType === 'attribute', options: (ctx) => ['', ...(ctx.dimensionCodes || [])] },
  { key: 'source.attribute', label: '来源属性', control: 'select', section: 'compute', placement: 'panel', appliesTo: [A.FLC], visibleWhen: (row) => row.dimType === 'attribute', options: (ctx, field) => ctx.attrOptions(field, 'source') },
  { key: 'defaultFrom.dimension', label: '默认来源维度', control: 'select', section: 'compute', placement: 'panel', appliesTo: [A.FLC], visibleWhen: (row) => row.dimType === 'measure', options: (ctx) => ['', ...(ctx.dimensionCodes || [])] },
  { key: 'defaultFrom.attribute', label: '默认来源属性', control: 'select', section: 'compute', placement: 'panel', appliesTo: [A.FLC], visibleWhen: (row) => row.dimType === 'measure', options: (ctx, field) => ctx.attrOptions(field, 'defaultFrom') },
  { key: 'unitField', label: '计量单位列', control: 'text', section: 'compute', placement: 'panel', appliesTo: [A.DCT, A.DOC, A.FLC], visibleWhen: (row) => row.dimType === 'measure' },

  // ── constraint（约束校验）── 三端统一（CTX 继承字典/单据的约束属性 + 自有校验规则）
  { key: 'defaultValue', label: '默认值', control: 'text', section: 'constraint', placement: 'panel', appliesTo: [A.DCT, A.DOC, A.FLC] },
  { key: 'unique', label: '唯一', control: 'checkbox', section: 'constraint', placement: 'panel', appliesTo: [A.DCT, A.DOC, A.FLC], valueType: 'boolean' },
  { key: 'pattern', label: '校验正则', control: 'text', section: 'constraint', placement: 'panel', appliesTo: [A.DCT, A.DOC, A.FLC], placeholder: '^[A-Z0-9_]{2,32}$' },
  { key: 'enumValues', label: '枚举值', control: 'enum-values', section: 'constraint', placement: 'panel', appliesTo: [A.DCT, A.DOC, A.FLC],
    // 仅录入控件=select 或已有 enumValues 时显示；与 refDict 互斥（静态枚举与字典二选一）。
    visibleWhen: (row) => {
      const mode = (row.edit && row.edit.mode) || ''
      const hasEnum = Array.isArray(row.enumValues) && row.enumValues.length > 0
      return !row.refDict && (mode === 'select' || hasEnum)
    } },
  { key: 'validations', label: '校验规则', control: 'validations', section: 'constraint', placement: 'panel', appliesTo: [A.FLC] },
  // 合计(agg)：数值列默认汇总方式（CmxColumn.agg），三端统一。仅数值类型(int/dec)可编辑。
  { key: 'agg', label: '合计', control: 'select', section: 'constraint', placement: 'panel', appliesTo: [A.DCT, A.DOC, A.FLC], visibleWhen: (row, ctx) => ctx.typeCaps ? ctx.typeCaps(row).int || ctx.typeCaps(row).dec : true, options: () => ['', 'sum', 'count', 'avg', 'max', 'min'] },

  // ── governance（数据治理）── 三端统一（CTX 继承）
  { key: 'label', label: '显示标签', control: 'text', section: 'governance', placement: 'panel', appliesTo: [A.DCT, A.DOC, A.FLC], placeholder: '界面标题，默认用注释' },
  { key: 'searchable', label: '可搜索', control: 'checkbox', section: 'governance', placement: 'panel', appliesTo: [A.DCT, A.DOC, A.FLC], valueType: 'boolean' },
  { key: 'filterable', label: '可筛选', control: 'checkbox', section: 'governance', placement: 'panel', appliesTo: [A.DCT, A.DOC, A.FLC], valueType: 'boolean' },
  { key: 'sensitive', label: '敏感级别', control: 'select', section: 'governance', placement: 'panel', appliesTo: [A.DCT, A.DOC, A.FLC], options: () => ['', 'public', 'internal', 'confidential', 'pii'] },
  { key: 'i18n', label: '多语言', control: 'checkbox', section: 'governance', placement: 'panel', appliesTo: [A.DCT, A.DOC, A.FLC], valueType: 'boolean' },

  // ── control（字段控制·动态条件）── 三端统一（CTX 的条件必填/条件只读合并到此）
  { key: 'edit.requiredWhen', label: '必填条件', control: 'text', section: 'control', placement: 'panel', appliesTo: [A.DCT, A.DOC, A.FLC], placeholder: 'amount > 0' },
  { key: 'edit.editableWhen', label: '可编辑条件', control: 'text', section: 'control', placement: 'panel', appliesTo: [A.DCT, A.DOC], placeholder: 'is_system != 1' },
  { key: 'edit.readonlyWhen', label: '条件只读', control: 'text', section: 'control', placement: 'panel', appliesTo: [A.FLC], placeholder: "status != 'draft'" },
  { key: 'edit.visibleWhen', label: '可见条件', control: 'text', section: 'control', placement: 'panel', appliesTo: [A.DCT, A.DOC] },

  // ── 列布局（flcLayout）── 三端统一：列宽/冻结/可见（schema key = 扁平存储路径）
  // 合计(agg) 已统一在 constraint section（三端共享），这里不再重复。
  // column.width/frozen/visible 去掉前缀用扁平 key（与 CmxColumn 顶层 width/visible/frozen 对齐，
  // FLC 引擎 _fieldToColumn 的 ...field 展开已自然读到扁平 key，无需 column. 逃生舱）。
  { key: 'width', label: '列宽', control: 'text', section: 'flcLayout', placement: 'panel', appliesTo: [A.DCT, A.DOC, A.FLC], placeholder: '120px / 20% / flex' },
  { key: 'frozen', label: '冻结', control: 'select', section: 'flcLayout', placement: 'panel', appliesTo: [A.DCT, A.DOC, A.FLC], options: () => ['', 'left', 'right'] },
  { key: 'visible', label: '可见', control: 'checkbox', section: 'flcLayout', placement: 'panel', appliesTo: [A.DCT, A.DOC, A.FLC], valueType: 'boolean-visible' },
])

/** 解析某属性在某端的 placement（支持 string 或 {end:placement} map），默认 'panel'。 */
export function placementOf (f, end) {
  const p = f.placement
  if (p && typeof p === 'object') return p[end] || 'panel'
  return p || 'panel'
}

/** 取某端、某 placement 的属性列表（保持 schema 声明顺序）。 */
export function fieldsFor (end, placement) {
  return FIELD_SCHEMA.filter((f) => {
    if (!f.appliesTo.includes(end)) return false
    if (placement == null) return true
    const pl = placementOf(f, end)
    return pl === placement || pl === 'both'
  })
}

/** 取某端详编面板按 section 分组的属性（placement=panel/both，过滤空 section）。 */
export function panelSectionsFor (end) {
  const panel = FIELD_SCHEMA.filter((f) => {
    if (!f.appliesTo.includes(end)) return false
    const pl = placementOf(f, end)
    return pl === 'panel' || pl === 'both'
  })
  return SECTIONS.map((s) => ({ ...s, fields: panel.filter((f) => f.section === s.id) })).filter((s) => s.fields.length || s.id === 'editorProps')
}

export function editorPropsFor (mode, end) {
  const props = EDITOR_PROPERTY_SCHEMA[mode] || []
  return props.filter((f) => f.appliesTo.includes(end))
}

/** 取某端表格内联属性（placement=inline/both）。 */
export function inlineFieldsFor (end) {
  return FIELD_SCHEMA.filter((f) => {
    if (!f.appliesTo.includes(end)) return false
    const pl = placementOf(f, end)
    return pl === 'inline' || pl === 'both'
  })
}
