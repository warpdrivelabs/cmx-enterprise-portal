/**
 * CmxColumn — 单列定义对象（与渲染层无关的纯元数据）
 *
 * id 即字段名（对应数据行的属性 key），caption 即显示标题。
 * 不包含任何 grid 特定属性，通过 toDescriptor() 输出通用中间格式，
 * 再由适配器（cmx-column-adapter.js）转换为具体 grid 的列定义。
 *
 * ──────────────────────────────────────────────────────────────────────────
 * 设计目标：所有显示 / 编辑设置都收敛到 CmxColumn 上（声明式优先）。
 * 提供两组结构化配置 display{} / edit{}。
 * ──────────────────────────────────────────────────────────────────────────
 *
 * 顶层属性：
 *   id              {string}   字段名，同时作为列唯一标识（必填）
 *   caption         {string}   显示标题
 *   dataType        {string}   物理数据类型：'VARCHAR'|'DECIMAL'|'DATE'|'DATETIME'|'BOOLEAN'...
 *   length          {number}   最大字符长度（text 类型）
 *   integerDigits   {number}   整数位数（number 类型）
 *   decimalDigits   {number}   小数位数（number 类型）→ 归一到 display.decimalDigits
 *   calcFormula     {string|object|Function}  编辑后计算公式 → edit 回写后触发（_cmxOnChange）
 *   width           {string|object}  列宽：'120px' | '20%' | 'flex' | { size, min, max }
 *                              px/数字 = 固定像素（stretch=true 时按比例放大铺满视口）；
 *                              'NN%' = 相对数据列视口的百分比（stretch 内换算为像素，不参与二次放大）；
 *                              'flex' = 弹性列（语义同不设 width，base 100 参与 stretch 均分）。
 *   visible         {boolean}  是否可见，默认 true
 *   frozen          {string|boolean}  冻结列：''/false(不冻) | 'left'(左冻结) | 'right'(右冻结)；旧布尔 true 等价 'left'
 *   required        {boolean}  是否必填 → 归一到 edit.required
 *   agg             {string}   合计聚合方式：'sum'|'count'|'avg'|'max'|'min'
 *
 * 显示域 display{}（如何渲染单元格）：
 *   align          {string}    'left'|'center'|'right'
 *   format         {string|Function}  格式化预设或函数：
 *                              'thousands'(千分位2位) | 'thousands:N'(N位) | 'percent' | 'percent:N'
 *                              | 'currency' | 'currency:¥' | 'date:YYYY-MM-DD' | 函数(raw,row)=>string
 *   decimalDigits  {number}    数值小数位（不指定则按 format 默认）
 *   zeroAsBlank    {boolean}   值为 0 是否显示为空，数值列默认 true
 *   emptyText      {string}    空值占位符，默认 ''
 *   mode           {string}    'text'|'badge'|'link'|'icon'，默认 'text'
 *   badgeMap       {object}    mode=badge 时：{ 值: { text?, color?, icon? } } 状态→徽章映射
 *   icon           {string|object}  mode=icon 时：图标名 或 { 值: 图标名 } 映射
 *   link           {object}    mode=link 时：{ actionRef } 或 { href:'${url}' }
 *   cellStyle      {Array}     条件样式规则：[{ when:'value<0', class?:'', style?:'' }]
 *                              when 用 formula-eval 求值，scope = 行字段铺平 + value(当前列值)。
 *                              注意：formula-eval 仅支持单段标识符，条件用扁平字段名（如 'value<0'
 *                              或 "status!='draft'"，status 为行字段），不支持 'row.x' 点号取属性。首条命中生效。
 *   render         {Function}  逃生舱：自定义渲染 (h, props) => VNode|string（统一定义在 col 上）
 *
 * 编辑域 edit{}（如何编辑单元格）：
 *   mode           {string}    录入控件（统一值域）：
 *                              'input'|'textarea'|'rich-text'|'number'|'date'|'datetime'|'checkbox'
 *                              |'select'|'ref'|'combo'|'ignite-combo'|'dict-select'|'image'|'video'
 *                              |'readonly'|'none'
 *                              说明：'input' 为通用基线；'number/date/datetime/checkbox' 也可由 dataType 推断，
 *                              此处显式声明优先。DCT 旧 uiControl 经映射收敛到本值域（见 cmx-field-uicontrol.js / P1）。
 *   trigger        {string}    'click'|'dblclick'|'inherit'(默认，跟随全表 options.editTrigger)
 *   options        {Array}     静态下拉选项 [{value,label}]
 *   source         {string|object}  远端数据源：string=dsProvider id；对象=pageService 包装
 *   valueField     {string}    写回行的字段名，默认 'id'
 *   displayTemplate{string}    显示模板，如 '${code} - ${name}'
 *   parent         {string}    tree 模式父字段名（旧 parentField）
 *   dropdownColumns{CmxColumnModel}  grid 模式下拉列模型
 *   dropdownWidth  {string}    下拉宽度
 *   dropdownMaxHeight {string} 下拉最大高度
 *   placeholder    {string}    输入框占位符
 *   dependents     {string[]}  派生字段：编辑本列后这些字段也派发 cmx-cell-changed（旧隐式约定，现显式）
 *   required       {boolean}   必填
 *   requiredWhen   {string}    条件必填表达式（formula-eval，scope=行字段铺平+value；扁平字段名）
 *   validate       {string|object|Function}  校验：预设名 | {preset,args} | (value,row)=>true|string(错误信息)（= 旧 validateFormula）
 *   validateWhen   {string}    条件校验：仅当表达式为真时执行 validate
 *   readonlyWhen   {string}    行级条件只读表达式（formula-eval，scope=行字段铺平+value；扁平字段名，如 "status!='draft'"）
 *   editor         {Function}  逃生舱：自定义编辑器构造（统一定义在 col 上）
 *
 * 常用别名（构造时归一化，新代码请用 display/edit 分组）：
 *   displayMask     → display.format
 *   displayMode     → display.mode
 *   required(顶层)  → edit.required
 *   validateFormula → edit.validate
 *   decimalDigits   → display.decimalDigits
 *   actionRef       → display.link.actionRef（mode=link 时）
 */

import { fieldCaption } from './cmx-field-meta.js'

export class CmxColumn {
  constructor(props = {}) {
    this.id              = props.id              ?? ''
    this.caption         = props.caption         ?? ''
    this.dataType        = props.dataType        ?? 'VARCHAR'
    this.length          = props.length          ?? null
    this.integerDigits   = props.integerDigits   ?? null
    this.decimalDigits   = props.decimalDigits   ?? null
    this.calcFormula     = props.calcFormula     ?? null
    this.width           = props.width           ?? null
    this.visible         = props.visible         ?? true
    this.frozen          = props.frozen          ?? false
    this.required        = props.required        ?? false
    this.agg             = props.agg             ?? null
    this.actionRef       = props.actionRef       ?? null

    this.displayMode     = props.displayMode     ?? 'text'
    this.displayMask     = props.displayMask     ?? null
    this.validateFormula = props.validateFormula ?? null

    // 结构化配置：归一化合并（display/edit 优先，顶层别名兜底）
    this.display = CmxColumn._normalizeDisplay(props)
    this.edit    = CmxColumn._normalizeEdit(props)

    // editSettings 浅拷贝到实例：edit 已归一化合并，但运行时字典数据源（createRestDictDataSource）
    // 等消费方直接读 field.editSettings.coord，需要原始 editSettings 对象可访问。
    // 浅拷贝避免引用元数据返回的冻结对象（后端 JSON 经拦截器可能被 Object.freeze），
    // 导致 backfillColumnCoord 写入 coord 时抛 "Cannot add property, object is not extensible"。
    this.editSettings = props.editSettings && typeof props.editSettings === 'object' ? { ...props.editSettings } : undefined

    this.required    = this.edit.required ?? this.required
    this.displayMode = this.display.mode || this.displayMode

    /* 完整继承：保留所有未被显式建模的额外属性（如 CTX 字段的 dataType/dimType/nullable/
       source/defaultFrom/formula/dependsOn/unitField/validations/refDict/refField/displayField 等）。
       CTX 为主、原样挂顶层，仅携带与序列化，不参与 toDescriptor 既有逻辑；
       消费端后期处理。display/edit 等已建模键不在此覆盖（in this 为真，跳过）。 */
    const skipped = new Set(['type', 'editMode', 'editSettings', 'label', 'align'])
    for (const k of Object.keys(props)) {
      if (skipped.has(k)) continue
      if (!(k in this)) this[k] = props[k]
    }
  }

  /** 合并出 display{}：新 props.display 优先，旧顶层字段兜底 */
  static _normalizeDisplay(props) {
    const d = { ...(props.display || {}) }
    if (d.decimalDigits == null && props.decimalDigits != null) d.decimalDigits = props.decimalDigits
    if (d.format == null && props.displayMask != null) d.format = props.displayMask
    if (d.mode == null && props.displayMode != null && props.displayMode !== 'text') d.mode = props.displayMode
    // mode 不强制兜底为 'text'：缺省时让适配器按列类型自行推断（数值列→number，其余→text）。
    // 显式配了 mode（含 'text'）则尊重，适配层直接用。
    // actionRef 顶层 → link
    if (props.actionRef != null && !d.link) d.link = { actionRef: props.actionRef }
    return d
  }

  /** 合并出 edit{}：props.edit 优先，editSettings 仅作为输入归一化。 */
  static _normalizeEdit(props) {
    const es = props.editSettings || {}
    const e = { ...es, ...(props.edit || {}) }   // edit 显式字段覆盖 editSettings
    if (e.mode == null) e.mode = 'cmx-text-input'
    if (e.required == null && props.required != null) e.required = props.required
    if (e.validate == null && props.validateFormula != null) e.validate = props.validateFormula
    if (e.trigger == null) e.trigger = 'inherit'
    // parentField → parent 兼容
    if (e.parent == null && es.parentField != null) e.parent = es.parentField
    return e
  }

  /**
   * 输出通用列描述符（中间格式）。包含归一化后的 display / edit 块，
   * 适配器层据此构建具体 grid 列定义。
   */
  toDescriptor() {
    const d = {
      id:      this.id,
      // caption 可能是 i18n 对象（{zh_CN,en_US,...}）：用 fieldCaption 解析为当前语言显示串，
      // 供 grid 列头 / form 标签直接渲染。原始 caption 仍保留在 this.caption（toJSON 序列化用），
      // 不破坏模型面板的多语言往返。
      caption: fieldCaption(this) || this.id,
      dataType: this.dataType,
    }
    if (this.width    != null) d.width    = this.width
    if (this.visible  !== true) d.visible = this.visible
    if (this.frozen)           d.frozen   = this.frozen
    if (this.agg      != null) d.agg      = this.agg

    // 归一化结构（新主路径）
    d.display = this.display
    d.edit    = this.edit

    if (this.calcFormula     != null) d.calcFormula     = this.calcFormula
    if (this.display.format  != null) d.displayMask     = this.display.format
    if (this.edit.validate   != null) d.validateFormula = this.edit.validate
    if (this.display.mode    != null && this.display.mode !== 'text') d.displayMode  = this.display.mode
    if (this.actionRef       != null) d.actionRef       = this.actionRef
    if (this.length          != null) d.length          = this.length
    if (this.integerDigits   != null) d.integerDigits   = this.integerDigits
    if (this.display.decimalDigits != null) d.decimalDigits = this.display.decimalDigits
    if (this.edit.required)          d.required         = this.edit.required
    if (this.colspan != null)        d.colspan          = this.colspan
    // 字典外键回显元数据：refDict/refField/displayField（由"完整继承"挂在顶层，
    // toDescriptor 显式输出，供 adapter 在 display.kind='dict' 时同步 resolve id→name）。
    if (this.refDict != null)      d.refDict      = this.refDict
    if (this.refField != null)     d.refField     = this.refField
    if (this.displayField != null) d.displayField = this.displayField
    // editSettings 透传：form/grid 的 dict-select 字段类型从 field.editSettings 读
    // coord/idCol/labelCol（字典坐标与列映射），toDescriptor 须输出避免 form 端丢配置。
    if (this.editSettings != null) d.editSettings = this.editSettings
    // 运行时渲染函数透传：cellTemplate/cellProperties（由"完整继承"挂在顶层）。
    // _leafDescriptorToRevoCol 对 col.cellTemplate 有"列已自带不覆盖"判断，此处输出后
    // 调用方挂的渲染函数优先级最高（高于 buildDisplayCellTemplate 推断的 format/badge/actions 等）。
    if (typeof this.cellTemplate   === 'function') d.cellTemplate   = this.cellTemplate
    if (typeof this.cellProperties === 'function') d.cellProperties = this.cellProperties
    return d
  }

  toJSON() {
    const KNOWN = new Set([
      'id', 'caption', 'dataType', 'length', 'integerDigits', 'decimalDigits',
      'calcFormula', 'validateFormula', 'displayMode', 'displayMask',
      'label', 'align',
      'actionRef', 'width', 'required', 'visible', 'frozen', 'agg',
      'display', 'edit',
    ])
    const json = {
      id:              this.id,
      caption:         this.caption,
      dataType:        this.dataType,
      length:          this.length,
      integerDigits:   this.integerDigits,
      decimalDigits:   this.decimalDigits,
      calcFormula:     typeof this.calcFormula     === 'function' ? null : this.calcFormula,
      validateFormula: typeof this.validateFormula === 'function' ? null : this.validateFormula,
      displayMode:     this.displayMode,
      displayMask:     typeof this.displayMask     === 'function' ? null : this.displayMask,
      actionRef:       this.actionRef,
      width:           this.width,
      required:        this.required,
      visible:         this.visible,
      frozen:          this.frozen,
      agg:             this.agg,
      // 结构化块（函数字段在序列化时丢弃，仅保留可序列化部分）
      display:         CmxColumn._stripFns(this.display),
      edit:            CmxColumn._stripFns(this.edit),
    }
    // 完整继承的额外属性（CTX 字段透传键）：原样输出，函数值丢弃
    for (const k of Object.keys(this)) {
      if (KNOWN.has(k)) continue
      if (typeof this[k] === 'function') continue
      json[k] = this[k]
    }
    return json
  }

  /** 浅拷贝并剔除函数值（用于 JSON 序列化） */
  static _stripFns(obj) {
    if (!obj || typeof obj !== 'object') return obj
    const out = {}
    for (const k of Object.keys(obj)) {
      if (typeof obj[k] === 'function') continue
      out[k] = obj[k]
    }
    return out
  }

  static fromJSON(json) {
    return new CmxColumn(json || {})
  }
}
