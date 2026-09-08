import { describe, it, expect } from 'vitest'
import { FlexibleCombinationEngine } from '../flexible-combination-engine.js'
import { CmxColumn } from '../cmx-column.js'
import { CmxColumnGroup } from '../cmx-column-group.js'

const dimensions = {
  account: {
    name: '科目',
   
    attributes: ['category', 'direction'],
    values: [
      { code: '1122', name: '应收账款', category: 'receivable', direction: 'debit' },
      { code: '2202', name: '应付账款', category: 'payable', direction: 'credit' },
    ],
  },
  product: {
    name: '产品',
   
    attributes: ['spec', 'price'],
    values: [{ code: 'P1', name: '产品一', spec: '500ml', price: 12 }],
  },
}

const rules = [
  {
    id: 'exact-1122',
    anchor: { dimensions: ['account'], match: { account: '1122' } },
    detail: { fields: [{ id: 'remark', dimType: '', caption: '备注', edit: { mode: 'cmx-text-input' } }] },
  },
  {
    id: 'receivable',
    anchor: { dimensions: ['account'], match: { account: { category: 'receivable' } } },
    detail: { fields: [{ id: 'customer', dimType: 'dimension', refDict: 'product', caption: '客户', edit: { mode: 'select' } }] },
  },
  {
    id: 'fallback',
    anchor: { dimensions: ['account'] },
    detail: { fields: [{ id: 'amount', dimType: 'measure', caption: '金额', edit: { mode: 'cmx-text-input' } }] },
  },
]

describe('FlexibleCombinationEngine.resolveRule — 匹配优先级', () => {
  const eng = new FlexibleCombinationEngine({ dimensions, rules })

  it('精确值优先于属性匹配', () => {
    expect(eng.resolveRule({ account: '1122' }).id).toBe('exact-1122')
  })

  it('属性匹配命中', () => {
    expect(eng.resolveRule({ account: '2202' }).id).toBe('fallback') // payable 无专属规则 → 兜底
  })

  it('无匹配走兜底（无 match 的规则）', () => {
    expect(eng.resolveRule({ account: '9999' }).id).toBe('fallback')
  })
})

describe('FlexibleCombinationEngine.resolveMergedRule — 多规则字段合并', () => {
  // 三条规则都会命中 account=1122：兜底(无match,score0) + receivable属性(score~1) + 精确(score3)
  const mergeDims = {
    account: {
      name: '科目', attributes: ['category'],
      values: [{ code: '1122', name: '应收账款', category: 'receivable' }],
    },
  }
  const mergeRules = [
    { id: 'base', anchor: { dimensions: ['account'] }, detail: { fields: [
      { id: 'remark', dimType: '', caption: '备注(兜底)', edit: { mode: 'cmx-text-input' } },
      { id: 'amount', dimType: 'measure', caption: '金额(兜底)', edit: { mode: 'cmx-text-input' } },
    ] } },
    { id: 'recv', anchor: { dimensions: ['account'], match: { account: { category: 'receivable' } } }, detail: { fields: [
      { id: 'customer', dimType: '', caption: '客户', edit: { mode: 'cmx-text-input' } },
      { id: 'amount', dimType: 'measure', caption: '金额(应收)', edit: { mode: 'cmx-text-input' } },
    ] } },
    { id: 'exact', anchor: { dimensions: ['account'], match: { account: '1122' } }, detail: { fields: [
      { id: 'amount', dimType: 'measure', caption: '金额(精确)', edit: { mode: 'cmx-text-input' } },
    ] } },
  ]
  const eng = new FlexibleCombinationEngine({ dimensions: mergeDims, rules: mergeRules })

  it('合并所有命中规则的字段（去重并集）', () => {
    const merged = eng.resolveMergedRule({ account: '1122' })
    const codes = merged.detail.fields.map((f) => f.id)
    expect(codes).toEqual(['remark', 'amount', 'customer']) // 首次出现顺序
  })

  it('重名列取得分高者（精确 3 > 应收 ~1 > 兜底 0）', () => {
    const merged = eng.resolveMergedRule({ account: '1122' })
    const amount = merged.detail.fields.find((f) => f.id === 'amount')
    expect(amount.caption).toBe('金额(精确)')
  })

  it('重名列同分取遍历顺序靠前者', () => {
    const dims = { k: { name: 'K', values: [{ code: 'x' }] } }
    const rs = [
      { id: 'a', anchor: { dimensions: ['k'], match: { k: 'x' } }, detail: { fields: [{ id: 'f', dimType: '', caption: 'A' }] } },
      { id: 'b', anchor: { dimensions: ['k'], match: { k: 'x' } }, detail: { fields: [{ id: 'f', dimType: '', caption: 'B' }] } },
    ]
    const e2 = new FlexibleCombinationEngine({ dimensions: dims, rules: rs })
    const merged = e2.resolveMergedRule({ k: 'x' })
    expect(merged.detail.fields.find((f) => f.id === 'f').caption).toBe('A') // 同分取靠前
  })

  it('单条命中时原样返回该规则', () => {
    const merged = eng.resolveMergedRule({ account: '9999' }) // 仅兜底命中
    expect(merged.id).toBe('base')
  })

  it('无命中返回 null', () => {
    const e3 = new FlexibleCombinationEngine({ dimensions: mergeDims, rules: [
      { id: 'only', anchor: { dimensions: ['account'], match: { account: '0000' } }, detail: { fields: [] } },
    ] })
    expect(e3.resolveMergedRule({ account: '1122' })).toBe(null)
  })

  it('合并后字段可正常编译为列', () => {
    const merged = eng.resolveMergedRule({ account: '1122' })
    const cols = eng.buildColumns(merged)
    expect(cols.map((c) => c.id)).toEqual(['remark', 'amount', 'customer'])
  })
})

describe('FlexibleCombinationEngine.buildColumns — 三态字段编译', () => {
  const eng = new FlexibleCombinationEngine({ dimensions, rules })

  it('measure 字段编译为右对齐 number 列', () => {
    const cols = eng.buildColumns(rules[2])
    expect(cols[0]).toBeInstanceOf(CmxColumn)
    expect(cols[0].dataType).toBe('DECIMAL')
    expect(cols[0].type).toBeUndefined()
    expect(cols[0].align).toBeUndefined()
    expect(cols[0].display.align).toBe('right')
  })

  it('text 字段编译为 text 列', () => {
    const cols = eng.buildColumns(rules[0])
    expect(cols[0].dataType).toBe('VARCHAR')
    expect(cols[0].type).toBeUndefined()
    expect(cols[0].id).toBe('remark')
  })
})

describe('FlexibleCombinationEngine.recompute / validate — 公式与校验', () => {
  const eng = new FlexibleCombinationEngine({
    dimensions: {},
    rules: [{
      id: 'calc',
      anchor: { dimensions: [] },
      detail: {
        fields: [
          { id: 'unitPrice', dimType: 'measure', caption: '单价', edit: { mode: 'cmx-text-input' } },
          { id: 'quantity', dimType: 'measure', caption: '数量', edit: { mode: 'cmx-text-input' }, validations: [{ expr: 'quantity > 0', message: '数量须大于0' }] },
          { id: 'amount', dimType: 'measure', caption: '金额', formula: 'unitPrice * quantity', dependsOn: ['unitPrice', 'quantity'] },
        ],
      },
    }],
  })
  const rule = eng.rules[0]

  it('recompute 按公式算出 computed measure', () => {
    const row = eng.recompute({ unitPrice: 10, quantity: 3 }, rule)
    expect(row.amount).toBe(30)
  })

  it('validate 通过/失败', () => {
    expect(eng.validate({ quantity: 5 }, rule).valid).toBe(true)
    const bad = eng.validate({ quantity: 0 }, rule)
    expect(bad.valid).toBe(false)
    expect(bad.errors.some((e) => e.code === 'quantity')).toBe(true)
  })
})

describe('FlexibleCombinationEngine.buildMembers — 分组嵌套', () => {
  const eng = new FlexibleCombinationEngine({ dimensions, rules })

  it('groups 编译为 CmxColumnGroup 树', () => {
    const rule = {
      id: 'g',
      anchor: { dimensions: ['account'] },
      detail: {
        fields: [
          { id: 'customer', dimType: '', caption: '客户', edit: { mode: 'cmx-text-input' } },
          { id: 'amount', dimType: 'measure', caption: '金额', edit: { mode: 'cmx-text-input' } },
        ],
        groups: [{ caption: '辅助核算', members: ['customer'] }],
      },
    }
    const members = eng.buildMembers(rule)
    const group = members.find((m) => m instanceof CmxColumnGroup)
    expect(group).toBeTruthy()
    expect(group.caption).toBe('辅助核算')
    // 未进分组的 amount 追加到顶层
    expect(members.some((m) => m instanceof CmxColumn && m.id === 'amount')).toBe(true)
  })
})

// 三层附加属性端到端编译：编辑器输出的 field.column / groups.aggregate / columnModel
// 必须能被引擎正确透传到 CmxColumn / CmxColumnGroup / 列模型属性。
describe('FlexibleCombinationEngine — 附加属性端到端编译', () => {
  const eng = new FlexibleCombinationEngine({ dimensions, rules })

  it('扁平布局属性（width/frozen/agg/display）透传到编译出的 CmxColumn', () => {
    const rule = {
      id: 'col',
      anchor: { dimensions: ['account'] },
      detail: {
        fields: [{
          id: 'amount', dimType: 'measure', caption: '金额', edit: { mode: 'cmx-text-input' },
          width: '120px', frozen: true, agg: 'sum', display: { format: 'thousands' },
        }],
      },
    }
    const [col] = eng.buildColumns(rule)
    expect(col).toBeInstanceOf(CmxColumn)
    expect(col.width).toBe('120px')
    expect(col.frozen).toBe(true)
    expect(col.agg).toBe('sum')
    expect(col.display.format).toBe('thousands')
  })

  it('groups[].aggregate / aggregatePosition 透传到 CmxColumnGroup', () => {
    const rule = {
      id: 'agg',
      anchor: { dimensions: ['account'] },
      detail: {
        fields: [{ id: 'amount', dimType: 'measure', caption: '金额', edit: { mode: 'cmx-text-input' } }],
        groups: [{ caption: '金额信息', aggregate: { sum: true }, aggregatePosition: 'after', members: ['amount'] }],
      },
    }
    const group = eng.buildMembers(rule).find((m) => m instanceof CmxColumnGroup)
    expect(group.aggregate.sum).toBe(true)
    expect(group.aggregatePosition).toBe('after')
    // 聚合产出可被 grid 消费
    expect(group.aggregateColumns()).toEqual([{ key: 'amount', agg: 'sum' }])
  })

  it('combination.columnModel + rule.columnModel 合并（rule 覆盖 combination）', () => {
    const rule = { id: 'r', anchor: { dimensions: ['account'] }, columnModel: { caption: '规则标题' }, detail: { fields: [] } }
    const props = eng.buildColumnModelProps(rule, { columnModel: { caption: '档案标题', toTitleCols: 'amount' } })
    expect(props.caption).toBe('规则标题')      // rule 覆盖
    expect(props.toTitleCols).toBe('amount')   // combination 保留
  })
})

describe('FlexibleCombinationEngine — 多字段集（多套表的字段，fieldTabs）', () => {
  const eng = new FlexibleCombinationEngine({ dimensions, rules: [] })
  const rule = {
    id: 'multi',
    anchor: { dimensions: ['account'] },
    columnModel: { caption: '主表' },
    detail: {
      table: 'voucher_entry',
      fields: [{ id: 'amount', dimType: 'measure', caption: '金额', edit: { mode: 'cmx-text-input' } }],
      groups: [{ caption: '金额', aggregate: { sum: true }, members: ['amount'] }],
      fieldTabs: [
        {
          id: 'ftab1', table: 'voucher_detail', name: '明细',
          columnModel: { caption: '明细表' },
          fields: [{ id: 'qty', dimType: 'measure', caption: '数量', edit: { mode: 'cmx-text-input' } }],
        },
      ],
    },
  }

  it('fieldSetsOf：index0=detail，index1=fieldTabs[0]，table 保真', () => {
    const sets = eng.fieldSetsOf(rule)
    expect(sets.length).toBe(2)
    expect(sets[0].index).toBe(0)
    expect(sets[0].table).toBe('voucher_entry')
    expect(sets[1].index).toBe(1)
    expect(sets[1].table).toBe('voucher_detail')
    expect(sets[1].name).toBe('明细')
  })

  it('buildColumnsForTable：按关联表取到对应字段集的列', () => {
    expect(eng.buildColumnsForTable(rule, 'voucher_entry').map((c) => c.id)).toEqual(['amount'])
    expect(eng.buildColumnsForTable(rule, 'voucher_detail').map((c) => c.id)).toEqual(['qty'])
    expect(eng.buildColumnsForTable(rule, 'not_exist')).toEqual([])
  })

  it('buildMembersForTable：主表分组生效，明细表平铺', () => {
    const m0 = eng.buildMembersForTable(rule, 'voucher_entry')
    expect(m0.find((x) => x instanceof CmxColumnGroup)).toBeTruthy()
    const m1 = eng.buildMembersForTable(rule, 'voucher_detail')
    expect(m1.every((x) => x instanceof CmxColumn)).toBe(true)
  })

  it('buildColumnModelPropsForTable：各字段集自己的 columnModel + 档案级合并', () => {
    expect(eng.buildColumnModelPropsForTable(rule, 'voucher_entry', { columnModel: { datasetId: 'ds' } }))
      .toEqual({ caption: '主表', datasetId: 'ds' })
    expect(eng.buildColumnModelPropsForTable(rule, 'voucher_detail', { columnModel: { datasetId: 'ds' } }))
      .toEqual({ caption: '明细表', datasetId: 'ds' })
  })

  it('buildAllFieldSets：一次性返回所有字段集的列/成员/列模型', () => {
    const all = eng.buildAllFieldSets(rule, { columnModel: { datasetId: 'ds' } })
    expect(all.map((s) => s.table)).toEqual(['voucher_entry', 'voucher_detail'])
    expect(all[0].columns.map((c) => c.id)).toEqual(['amount'])
    expect(all[1].columns.map((c) => c.id)).toEqual(['qty'])
    expect(all[1].columnModel.caption).toBe('明细表')
  })

  it('无 fieldTabs 时 fieldSetsOf 只有主字段集，buildColumns 不变', () => {
    const plain = { id: 'p', anchor: { dimensions: ['account'] }, detail: { fields: [{ id: 'a', dimType: '' }] } }
    expect(eng.fieldSetsOf(plain).length).toBe(1)
    expect(eng.buildColumns(plain).map((c) => c.id)).toEqual(['a'])
  })
})

describe('FlexibleCombinationEngine — 高保真编译到 CmxColumn / CmxColumnGroup / CmxColumnModel', () => {
  const eng = new FlexibleCombinationEngine({ dimensions, rules: [] })

  it('display 别名键归一：decimals→decimalDigits、zeroBlank→zeroAsBlank、thousand→thousandSeparator', () => {
    const rule = { id: 'r', anchor: { dimensions: ['account'] }, detail: { fields: [
      { id: 'amount', dimType: 'measure', caption: '金额', edit: { mode: 'cmx-text-input' }, display: { decimals: 2, zeroBlank: true, thousand: ',', align: 'right' } },
    ] } }
    const col = eng.buildColumns(rule)[0]
    expect(col.display.decimalDigits).toBe(2)
    expect(col.display.zeroAsBlank).toBe(true)
    expect(col.display.thousandSeparator).toBe(',')
    expect(col.display.align).toBe('right')
  })

  it('字段 validations → edit.validate', () => {
    const rule = { id: 'r', anchor: { dimensions: ['account'] }, detail: { fields: [
      { id: 'qty', dimType: 'measure', caption: '数量', edit: { mode: 'cmx-text-input' }, validations: [{ expr: 'qty > 0', message: '须>0' }] },
    ] } }
    const col = eng.buildColumns(rule)[0]
    expect(Array.isArray(col.edit.validate)).toBe(true)
    expect(col.edit.validate[0]).toEqual({ expr: 'qty > 0', message: '须>0' })
  })

  it('P0: pattern(正则) → edit.validate 追加函数式规则，空值放过、不匹配拦截', () => {
    const rule = { id: 'r', anchor: { dimensions: ['account'] }, detail: { fields: [
      { id: 'code', dimType: '', caption: '编码', edit: { mode: 'cmx-text-input' }, pattern: '^[A-Z]{2}$', validations: [{ expr: 'len(code) > 0', message: '不能空' }] },
    ] } }
    const col = eng.buildColumns(rule)[0]
    expect(Array.isArray(col.edit.validate)).toBe(true)
    // validations 规则在前，pattern 函数式规则在后
    const patRule = col.edit.validate.find((r) => typeof r.test === 'function')
    expect(patRule).toBeTruthy()
    expect(patRule.test('AB')).toBe(true)     // 匹配
    expect(patRule.test('')).toBe(true)       // 空值放过（交给 required）
    expect(patRule.test('abc')).toBe(false)   // 不匹配 → 拦截
  })

  it('P0: enumValues → editSettings.options + edit.options，录入控件归一为 select', () => {
    const rule = { id: 'r', anchor: { dimensions: ['account'] }, detail: { fields: [
      { id: 'status', dimType: '', caption: '状态', enumValues: ['open', 'closed'] },
    ] } }
    const col = eng.buildColumns(rule)[0]
    expect(col.edit.mode).toBe('select')
    expect(col.edit.options).toEqual([{ value: 'open', label: 'open' }, { value: 'closed', label: 'closed' }])
    expect(col.editSettings).toBeUndefined()
  })

  it('P0: enumValues 让位于显式 edit.mode（有录入控件时不强制 select）', () => {
    const rule = { id: 'r', anchor: { dimensions: ['account'] }, detail: { fields: [
      { id: 'status', dimType: '', caption: '状态', enumValues: ['a', 'b'], edit: { mode: 'cmx-text-input' } },
    ] } }
    const col = eng.buildColumns(rule)[0]
    expect(col.edit.mode).toBe('cmx-text-input')  // 显式 edit.mode 优先，enumValues 不覆盖
  })

  it('P0: enumValues 对象数组 [{value,label}] → edit.options 保留 label', () => {
    const rule = { id: 'r', anchor: { dimensions: ['account'] }, detail: { fields: [
      { id: 'status', dimType: '', caption: '状态', enumValues: [{ value: 'open', label: '未开始' }, { value: 'closed', label: '已关闭' }] },
    ] } }
    const col = eng.buildColumns(rule)[0]
    expect(col.edit.mode).toBe('select')
    expect(col.edit.options).toEqual([{ value: 'open', label: '未开始' }, { value: 'closed', label: '已关闭' }])
  })

  it('完整继承：CTX 字段所有属性原样铺到 CmxColumn 顶层（CTX 为主）', () => {
    const field = {
      id: 'qty', caption: '数量', dimType: 'measure', dataType: 'DECIMAL',
      nullable: false, unitField: 'uom', source: { dimension: 'product', attribute: 'uom' },
      defaultFrom: { dimension: 'product', attribute: 'price' }, formula: 'a*b',
      dependsOn: ['a', 'b'], refDict: 'd1', refField: 'code', displayField: 'name',
      sensitive: 'pii', searchable: true, defaultValue: 1, unique: true, customX: { deep: 9 },
    }
    const rule = { id: 'r', anchor: { dimensions: ['account'] }, detail: { fields: [field] } }
    const col = eng.buildColumns(rule)[0]
    // 每个原始字段键都继承到列上（id 同时映射为 id）
    for (const k of Object.keys(field)) {
      if (k === 'id') { expect(col.id).toBe('qty'); continue }
      expect(col[k], `字段属性 ${k} 应被继承`).toEqual(field[k])
    }
    // 透传未知键也在（消费后期处理）
    expect(col.sensitive).toBe('pii')
    expect(col.customX).toEqual({ deep: 9 })
    expect(col.unitField).toBe('uom')
  })

  it('完整继承：额外属性参与 toJSON 序列化往返', () => {
    const rule = { id: 'r', anchor: { dimensions: ['account'] }, detail: { fields: [
      { id: 'qty', dimType: 'measure', nullable: false, sensitive: 'pii', source: { dimension: 'p', attribute: 'u' } },
    ] } }
    const col = eng.buildColumns(rule)[0]
    const json = col.toJSON()
    expect(json.nullable).toBe(false)
    expect(json.sensitive).toBe('pii')
    expect(json.source).toEqual({ dimension: 'p', attribute: 'u' })
    expect(json.dimType).toBe('measure')
  })

  it('完整继承：字段扁平属性原样透传到 CmxColumn 顶层', () => {
    const rule = { id: 'r', anchor: { dimensions: ['account'] }, detail: { fields: [
      { id: 'amt', dimType: 'measure', agg: 'sum', customZ: 7 },
    ] } }
    const col = eng.buildColumns(rule)[0]
    expect(col.agg).toBe('sum')      // 字段 agg 直接继承
    expect(col.customZ).toBe(7)      // 额外键并入顶层
  })

  it('字段条件属性 requiredWhen/readonlyWhen/placeholder → edit.*', () => {
    const rule = { id: 'r', anchor: { dimensions: ['account'] }, detail: { fields: [
      { id: 'memo', dimType: '', caption: '备注', edit: { mode: 'cmx-text-input', requiredWhen: 'amount>0', readonlyWhen: "s!='d'", placeholder: '填写' } },
    ] } }
    const col = eng.buildColumns(rule)[0]
    expect(col.edit.requiredWhen).toBe('amount>0')
    expect(col.edit.readonlyWhen).toBe("s!='d'")
    expect(col.edit.placeholder).toBe('填写')
  })

  it('buildColumnModel：完整 CmxColumnModel 实例（members + 顶层属性，规则级覆盖档案级）', () => {
    const rule = {
      id: 'r', anchor: { dimensions: ['account'] },
      columnModel: { caption: '规则标题', datasetId: 'ds.rule' },
      detail: {
        fields: [{ id: 'amount', dimType: 'measure', caption: '金额', edit: { mode: 'cmx-text-input' } }],
        groups: [{ caption: '金额组', aggregate: { sum: true }, aggregatePosition: 'after', members: ['amount'] }],
      },
    }
    const model = eng.buildColumnModel(rule, { columnModel: { caption: '档案标题', toTitleCols: 'amount', iconCol: 'amount' } })
    expect(model.caption).toBe('规则标题')          // rule 覆盖 combination
    expect(model.datasetId).toBe('ds.rule')
    expect(model.toTitleCols).toBe('amount')         // combination 保留
    expect(model.iconCol).toBe('amount')
    const grp = model.members.find((m) => m instanceof CmxColumnGroup)
    expect(grp).toBeTruthy()
    expect(grp.aggregate.sum).toBe(true)
    expect(grp.aggregatePosition).toBe('after')
  })

  it('buildAllFieldSets：每套字段集附带 CmxColumnModel 实例', () => {
    const rule = {
      id: 'r', anchor: { dimensions: ['account'] }, columnModel: { caption: '主' },
      detail: {
        table: 'voucher_entry',
        fields: [{ id: 'amount', dimType: 'measure', caption: '金额', edit: { mode: 'cmx-text-input' } }],
        fieldTabs: [{ id: 'ft1', table: 'voucher_detail', columnModel: { caption: '明细' }, fields: [{ id: 'qty', dimType: 'measure', caption: '数量' }] }],
      },
    }
    const all = eng.buildAllFieldSets(rule, {})
    expect(all[0].model.constructor.name).toBe('CmxColumnModel')
    expect(all[0].model.caption).toBe('主')
    expect(all[1].model.caption).toBe('明细')
    expect(all[1].model.members.map((c) => c.id)).toEqual(['qty'])
  })
})

describe('FlexibleCombinationEngine — applyToColumnModel 写入已有 CCM 引用', () => {
  const eng = new FlexibleCombinationEngine({ dimensions, rules: [] })

  it('原地更新传入的 CmxColumnModel（顶层属性 + members 替换，触发事件）', async () => {
    const { CmxColumnModel } = await import('../cmx-column-model.js')
    const ccm = new CmxColumnModel({ caption: '旧', members: [] })
    let fired = 0
    ccm.addEventListener('columns-changed', () => { fired++ })
    const rule = {
      id: 'r', anchor: { dimensions: ['account'] }, columnModel: { caption: '新标题', datasetId: 'ds1', toTitleCols: 'amount' },
      detail: { fields: [{ id: 'amount', dimType: 'measure', caption: '金额', edit: { mode: 'cmx-text-input' } }] },
    }
    const ret = eng.applyToColumnModel(ccm, rule, {})
    expect(ret).toBe(ccm)                     // 返回同一引用
    expect(ccm.caption).toBe('新标题')
    expect(ccm.datasetId).toBe('ds1')
    expect(ccm.toTitleCols).toBe('amount')
    expect(ccm.members.map((c) => c.id)).toEqual(['amount'])
    expect(fired).toBeGreaterThan(0)          // setMembers 触发事件
  })
})

describe('CmxColumn / CmxColumnGroup — 额外属性完整继承 + 序列化往返', () => {
  it('CmxColumn 保留未建模的额外属性并参与 toJSON', () => {
    const col = new CmxColumn({ id: 'x', caption: 'X', dataType: 'DECIMAL', sensitive: 'pii', nullable: false, customA: { n: 1 } })
    expect(col.sensitive).toBe('pii')
    expect(col.nullable).toBe(false)
    expect(col.customA).toEqual({ n: 1 })
    const json = col.toJSON()
    expect(json.sensitive).toBe('pii')
    expect(json.customA).toEqual({ n: 1 })
    // 往返：fromJSON 再 toJSON，额外属性不丢
    const round = CmxColumn.fromJSON(json).toJSON()
    expect(round.sensitive).toBe('pii')
    expect(round.nullable).toBe(false)
    expect(round.customA).toEqual({ n: 1 })
  })

  it('CmxColumn 额外属性不污染 toDescriptor（消费链不受影响）', () => {
    const col = new CmxColumn({ id: 'x', dataType: 'DECIMAL', sensitive: 'pii', customA: 1 })
    const d = col.toDescriptor()
    expect(d.sensitive).toBeUndefined()
    expect(d.customA).toBeUndefined()
    expect(d.id).toBe('x')
  })

  it('CmxColumnGroup 保留未建模的额外属性并参与 toJSON 往返', () => {
    const grp = new CmxColumnGroup({ id: 'g', caption: '组', layoutHint: 'wide', customB: [1, 2], members: [new CmxColumn({ id: 'a', dataType: 'DECIMAL' })] })
    expect(grp.layoutHint).toBe('wide')
    expect(grp.customB).toEqual([1, 2])
    const json = grp.toJSON()
    expect(json.layoutHint).toBe('wide')
    expect(json.customB).toEqual([1, 2])
    const round = CmxColumnGroup.fromJSON(json)
    expect(round.layoutHint).toBe('wide')
    expect(round.customB).toEqual([1, 2])
    expect(round.members.map((m) => m.id)).toEqual(['a'])
  })
})
