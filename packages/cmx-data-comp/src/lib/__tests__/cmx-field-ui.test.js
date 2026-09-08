import { describe, it, expect } from 'vitest'
import { renderFieldTable, renderFieldPanel } from '../cmx-field-ui.js'
import { makeDctAdapter, makeFlcAdapter } from '../cmx-field-adapter.js'
import { editorPropsFor } from '../cmx-field-schema.js'

const typeCaps = (f) => f.dataType === 'VARCHAR' ? { len: true, int: false, dec: false } : { len: false, int: false, dec: false }

describe('cmx-field-ui — schema 驱动渲染', () => {
  it('DCT 表格：渲染字段名/类型/可空内联控件 + 操作按钮', () => {
    const a = makeDctAdapter({ typeCaps })
    const html = renderFieldTable(
      [{ id: 'code', dataType: 'VARCHAR', fieldLength: 32, nullable: true }],
      { end: 'DCT', adapter: a, ctx: { typeCaps, hasDimType: false }, keyOf: (f, i) => String(i) }
    )
    expect(html).toContain('data-field-prop="id"')
    expect(html).toContain('data-field-prop="dataType"')
    expect(html).toContain('data-field-prop="nullable"')
    expect(html).toContain('data-action="select-field"')
    expect(html).toContain('data-action="remove-field"')
    expect(html).not.toContain('move-field-up') // DCT 默认不显示移动
  })

  it('DCT 长度联动：VARCHAR 行长度可编辑，其余位数禁用为只读 span', () => {
    const caps = (f) => f.dataType === 'VARCHAR' ? { len: true, int: false, dec: false } : { len: false, int: false, dec: false }
    const a = makeDctAdapter({ typeCaps: caps })
    const html = renderFieldTable(
      [{ id: 's', dataType: 'VARCHAR', fieldLength: 32 }],
      { end: 'DCT', adapter: a, ctx: { typeCaps: caps }, keyOf: (f, i) => String(i) }
    )
    // VARCHAR：长度可编辑（input + data-field-prop），整数/小数位禁用（只读 span）
    expect(html).toContain('data-field-prop="fieldLength"')
    expect(html).toMatch(/整数位<\/th>/)
    // 整数位单元格是只读 span（INT/DEC 才可编辑）
    expect(html).toContain('cmx-fld-ro')
  })

  it('DCT 详编：分区含引用字典/约束校验/数据治理/字段控制', () => {
    const a = makeDctAdapter({ typeCaps })
    const ctx = { refDictOptions: () => ['', 'gl_account'], refFieldOptions: () => ['', 'code', 'name'] }
    const html = renderFieldPanel({ id: 'acct', refDict: 'gl_account' }, { end: 'DCT', adapter: a, ctx })
    expect(html).toContain('引用字典')
    expect(html).toContain('约束校验')
    expect(html).toContain('数据治理')
    expect(html).toContain('字段控制（动态条件）')
    expect(html).toContain('data-field-path="refDict"')
    expect(html).toContain('data-field-path="edit.requiredWhen"')
  })

  it('exclude：按 schema key 排除面板项（如 unique），不传时不受影响', () => {
    const a = makeDctAdapter({ typeCaps })
    const ctx = { refDictOptions: () => [''], refFieldOptions: () => [''] }
    const plain = renderFieldPanel({ id: 'code' }, { end: 'DCT', adapter: a, ctx })
    expect(plain).toContain('data-field-path="unique"') // 默认渲染「唯一」
    const excluded = renderFieldPanel({ id: 'code' }, { end: 'DCT', adapter: a, ctx, exclude: ['unique'] })
    expect(excluded).not.toContain('data-field-path="unique"')
    expect(excluded).toContain('约束校验') // 同区其它项仍在
    // 数组/Set 均可
    const viaSet = renderFieldPanel({ id: 'code' }, { end: 'DCT', adapter: a, ctx, exclude: new Set(['unique']) })
    expect(viaSet).not.toContain('data-field-path="unique"')
  })

  it('CTX 表格：内联含 编码/标题/数据类型(只读)，开启移动按钮；编辑/公式不在表格', () => {
    const a = makeFlcAdapter()
    const html = renderFieldTable(
      [{ id: 'amt', dimType: 'measure', dataType: 'DECIMAL', edit: { mode: 'cmx-text-input' } }],
      { end: 'FLC', adapter: a, ctx: { dimensionCodes: [] }, keyOf: (f) => f.id, selectedKey: 'amt', actions: { move: true } }
    )
    expect(html).toContain('data-field-prop="id"')
    expect(html).toContain('data-field-prop="caption"')
    // 数据类型只读（enableWhen=false → cmx-fld-ro，无 data-field-prop 编辑）
    expect(html).toContain('cmx-fld-ro')
    expect(html).not.toContain('data-field-prop="edit.mode"') // 录入控件移到详编
    expect(html).not.toContain('data-action="open-formula"') // 公式移到详编
    expect(html).not.toContain('data-field-prop="dimType"')     // 类型移到详编
    expect(html).toContain('move-field-up')
    expect(html).toContain('cmx-field-row sel') // 选中高亮
  })

  it('CTX 详编面板含 编辑(录入控件)/公式/类型', () => {
    const a = makeFlcAdapter()
    const html = renderFieldPanel({ id: 'amt', dimType: 'measure' }, {
      end: 'FLC', adapter: a, ctx: { end: 'FLC', dimensionCodes: ['org'], attrOptions: () => [''], refDictOptions: () => [''], refFieldOptions: () => [''] },
    })
    expect(html).toContain('data-field-path="edit.mode"')
    expect(html).toContain('data-field-path="formula"')
    expect(html).toContain('data-action="open-formula"')
    expect(html).toContain('data-field-path="dimType"')
  })

  it('录入控件属性：按 edit.mode 动态渲染到 edit.*', () => {
    const a = makeFlcAdapter()
    const html = renderFieldPanel({ id: 'amount', dimType: 'measure', edit: { mode: 'cmx-number-input' } }, {
      end: 'FLC', adapter: a, ctx: { end: 'FLC', dimensionCodes: [], attrOptions: () => [''], refDictOptions: () => [''], refFieldOptions: () => [''] },
    })
    expect(html).toContain('录入控件属性')
    expect(html).toContain('data-field-path="edit.intDigits"')
    expect(html).toContain('data-field-path="edit.decimalDigits"')
    expect(html).toContain('data-field-path="edit.min"')
    expect(html).not.toContain('data-field-path="edit.inputType"')
  })

  it('录入控件属性 schema 可扩展查询', () => {
    const props = editorPropsFor('cmx-date-input', 'DCT')
    expect(props.map((p) => p.key)).toEqual(expect.arrayContaining(['edit.formatPattern', 'edit.minDate', 'edit.maxDate']))
  })

  it('CTX dimension 字段显示引用字典区(refDict/refField/displayField)；继承约束·治理；measure 显示默认带出', () => {
    const a = makeFlcAdapter()
    const ctx = { end: 'FLC', dimensionCodes: ['org'], attrOptions: () => ['', 'name'], refDictOptions: () => ['', 'org'], refFieldOptions: () => ['', 'code', 'name'] }
    const dimHtml = renderFieldPanel({ id: 'd', dimType: 'dimension', refDict: 'org' }, { end: 'FLC', adapter: a, ctx })
    expect(dimHtml).toContain('data-field-path="refDict"')      // 引用字典(=维度绑定)
    expect(dimHtml).toContain('data-field-path="refField"')     // 引用字段
    expect(dimHtml).toContain('data-field-path="displayField"') // 显示字段
    expect(dimHtml).toContain('data-field-path="defaultValue"') // 继承约束
    expect(dimHtml).toContain('data-field-path="sensitive"')    // 继承治理
    expect(dimHtml).not.toContain('data-field-path="defaultFrom.dimension"') // measure 专有
    const meaHtml = renderFieldPanel({ id: 'm', dimType: 'measure' }, { end: 'FLC', adapter: a, ctx })
    expect(meaHtml).toContain('data-field-path="defaultFrom.dimension"')
    expect(meaHtml).not.toContain('data-field-path="refDict"') // 引用字典仅 dimension 显示
    expect(meaHtml).not.toContain('data-field-path="source.dimension"') // attribute 专有
  })

  it('select 防丢值：当前值不在选项中也补入', () => {
    const a = makeDctAdapter({ typeCaps })
    const html = renderFieldPanel({ id: 'x', sensitive: 'legacy-level' }, {
      end: 'DCT', adapter: a, ctx: { refDictOptions: () => [''], refFieldOptions: () => [''] },
    })
    expect(html).toContain('legacy-level')
  })

  it('主键(isPrimaryKey)列：DCT/DOC 本表字段与基础元数据均可行内勾选编辑', () => {
    const a = makeDctAdapter({ typeCaps })
    const row = [{ id: 'id', dataType: 'BIGINT', isPrimaryKey: 1 }]
    // 基础元数据端：表头含"主键"，且行内渲染 checkbox(boolean-int) 且已勾选
    const base = renderFieldTable(row, { end: 'DCT', adapter: a, ctx: { typeCaps, isBase: true }, keyOf: (f, i) => String(i) })
    expect(base).toContain('主键')
    expect(base).toContain('data-field-prop="isPrimaryKey"')
    expect(base).toContain('data-value-type="boolean-int"')
    expect(base).toMatch(/data-field-prop="isPrimaryKey"[^>]*checked/)
    // 普通 DCT（非基础元数据）：主键列同样渲染可编辑 checkbox（不再被 ctx.isBase 门控）
    const normal = renderFieldTable(row, { end: 'DCT', adapter: a, ctx: { typeCaps, isBase: false }, keyOf: (f, i) => String(i) })
    expect(normal).toContain('主键')
    expect(normal).toContain('data-field-prop="isPrimaryKey"')
    expect(normal).toMatch(/data-field-prop="isPrimaryKey"[^>]*checked/)
  })

  it('boolean-int 写入：勾选存 1、取消存 0（显式落库，非删键）', () => {
    const a = makeDctAdapter({ typeCaps })
    const f = { id: 'code', dataType: 'VARCHAR' }
    a.set(f, 'isPrimaryKey', true, 'boolean-int')
    expect(f.isPrimaryKey).toBe(1)
    a.set(f, 'isPrimaryKey', false, 'boolean-int')
    expect(f.isPrimaryKey).toBe(0)
    // 复选框未勾选时浏览器不发值 → 传 '' 也应得 0
    a.set(f, 'isPrimaryKey', '', 'boolean-int')
    expect(f.isPrimaryKey).toBe(0)
  })

  it('visible(boolean-visible) 渲染：默认可见=勾选，仅显式 false 才取消', () => {
    const a = makeDctAdapter({ typeCaps })
    // 无键（默认可见）→ 勾选
    const def = renderFieldPanel({ id: 'code' }, { end: 'DCT', adapter: a, ctx: { refDictOptions: () => [''], refFieldOptions: () => [''] } })
    expect(def).toMatch(/data-field-path="visible"[^>]*checked/)
    // 显式 true → 勾选
    const t = renderFieldPanel({ id: 'code', visible: true }, { end: 'DCT', adapter: a, ctx: { refDictOptions: () => [''], refFieldOptions: () => [''] } })
    expect(t).toMatch(/data-field-path="visible"[^>]*checked/)
    // 显式 false（用户取消勾选后存的）→ 不勾选
    const f = renderFieldPanel({ id: 'code', visible: false }, { end: 'DCT', adapter: a, ctx: { refDictOptions: () => [''], refFieldOptions: () => [''] } })
    expect(f).not.toMatch(/data-field-path="visible"[^>]*checked/)
  })

  it('enum-values 控件：对象数组渲染为 value/label 行 + 增删按钮', () => {
    const a = makeDctAdapter({ typeCaps })
    const html = renderFieldPanel({ id: 'st', edit: { mode: 'select' }, enumValues: [{ value: 'open', label: '未开始' }, { value: 'closed', label: '' }] }, {
      end: 'DCT', adapter: a, ctx: { refDictOptions: () => [''], refFieldOptions: () => [''] },
    })
    expect(html).toContain('data-field-path="enumValues.0.value"')
    expect(html).toContain('value="open"')
    expect(html).toContain('data-field-path="enumValues.0.label"')
    expect(html).toContain('未开始')
    expect(html).toContain('data-field-path="enumValues.1.value"')
    expect(html).toContain('data-action="remove-enum" data-index="0"')
    expect(html).toContain('data-action="add-enum"')
  })

  it('enum-values 控件：旧 string[] 兼容渲染（label 空）', () => {
    const a = makeDctAdapter({ typeCaps })
    const html = renderFieldPanel({ id: 'st', edit: { mode: 'select' }, enumValues: ['open', 'closed'] }, {
      end: 'DCT', adapter: a, ctx: { refDictOptions: () => [''], refFieldOptions: () => [''] },
    })
    expect(html).toContain('data-field-path="enumValues.0.value"')
    expect(html).toContain('value="open"')
    expect(html).toContain('data-field-path="enumValues.1.value"')
    expect(html).toContain('value="closed"')
  })

  it('enum-values 控件：visibleWhen 仅 edit.mode=select 或已有值时显示；refDict 互斥', () => {
    const a = makeDctAdapter({ typeCaps })
    const ctx = { refDictOptions: () => [''], refFieldOptions: () => [''] }
    // mode=select → 显示
    expect(renderFieldPanel({ id: 'x', edit: { mode: 'select' } }, { end: 'DCT', adapter: a, ctx })).toContain('data-action="add-enum"')
    // 已有 enumValues（mode 空）→ 显示（历史数据可见）
    expect(renderFieldPanel({ id: 'x', enumValues: [{ value: 'a' }] }, { end: 'DCT', adapter: a, ctx })).toContain('data-action="add-enum"')
    // mode 非 select 且无值 → 不显示
    expect(renderFieldPanel({ id: 'x', edit: { mode: 'cmx-text-input' } }, { end: 'DCT', adapter: a, ctx })).not.toContain('data-action="add-enum"')
    // refDict 存在 → 互斥隐藏（即便 mode=select）
    expect(renderFieldPanel({ id: 'x', edit: { mode: 'select' }, refDict: 'gl' }, { end: 'DCT', adapter: a, ctx })).not.toContain('data-action="add-enum"')
  })

  it('enum-values 控件：重复 value 标记 enum-dup', () => {
    const a = makeDctAdapter({ typeCaps })
    const html = renderFieldPanel({ id: 'st', edit: { mode: 'select' }, enumValues: [{ value: 'a', label: '' }, { value: 'a', label: '' }] }, {
      end: 'DCT', adapter: a, ctx: { refDictOptions: () => [''], refFieldOptions: () => [''] },
    })
    expect(html).toContain('enum-dup')
  })

  it('display.format 复合控件 select-text：text 模式渲染 select + input（同 data-field-path）', () => {
    const a = makeDctAdapter({ typeCaps })
    const ctx = { refDictOptions: () => [''], refFieldOptions: () => [''] }
    // text 模式 → display.format 可见，渲染为「下拉选预设 + 文本框手改」复合控件
    const html = renderFieldPanel({ id: 't', display: { mode: 'text', format: 'date:YYYY-MM-DD' } }, { end: 'DCT', adapter: a, ctx })
    // 产出 select + input 两个控件，共用同一 data-field-path
    expect(html).toContain('cmx-select-text')
    expect(html).toContain('data-field-path="display.format"')
    // select 含 text 模式的日期预设
    expect(html).toContain('date:YYYY-MM-DD')
    // 当前值 date:YYYY-MM-DD 在 input 里也有
    expect(html).toMatch(/value="date:YYYY-MM-DD"/)
    // display.format 有 tips → label 后渲染问号图标按钮
    expect(html).toContain('cmx-field-tip')
    expect(html).toContain('data-action="show-field-tips"')
    expect(html).toContain('data-field-tips=')
  })

  it('display.format 复合控件 select-text：number 模式选项含千分位/百分比/货币', () => {
    const a = makeDctAdapter({ typeCaps })
    const ctx = { refDictOptions: () => [''], refFieldOptions: () => [''] }
    const html = renderFieldPanel({ id: 'amt', display: { mode: 'number', format: 'currency:¥' } }, { end: 'DCT', adapter: a, ctx })
    expect(html).toContain('cmx-select-text')
    // number 模式 select 含 thousands/percent/currency 预设
    expect(html).toContain('thousands')
    expect(html).toContain('percent')
    expect(html).toContain('currency:¥')
  })
})
