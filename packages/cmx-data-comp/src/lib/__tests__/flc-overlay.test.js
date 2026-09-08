import { describe, it, expect } from 'vitest'
import { deepMerge, expandRefField, expandRuleDetail, expandCombination } from '../flc-overlay.js'

describe('flc-overlay — deepMerge', () => {
  it('标量覆盖 + 对象递归 + 新键', () => {
    const base = { a: 1, edit: { mode: 'input', required: false }, dataType: 'DECIMAL' }
    const over = { a: 2, edit: { required: true }, extra: 'x' }
    expect(deepMerge(base, over)).toEqual({ a: 2, edit: { mode: 'input', required: true }, dataType: 'DECIMAL', extra: 'x' })
  })

  it('null 删除键', () => {
    expect(deepMerge({ agg: 'sum', id: 'amount' }, { agg: null })).toEqual({ id: 'amount' })
  })

  it("数组默认整体替换", () => {
    expect(deepMerge({ enumValues: ['a', 'b'] }, { enumValues: ['c'] })).toEqual({ enumValues: ['c'] })
  })

  it("'key+' 后缀追加数组", () => {
    const base = { validations: [{ expr: 'x>0' }] }
    const over = { 'validations+': [{ expr: 'x<10' }] }
    expect(deepMerge(base, over)).toEqual({ validations: [{ expr: 'x>0' }, { expr: 'x<10' }] })
  })

  it("'key+' 追加到不存在的 base 数组", () => {
    expect(deepMerge({}, { 'tags+': ['a'] })).toEqual({ tags: ['a'] })
  })

  it('不修改入参', () => {
    const base = { edit: { mode: 'input' } }
    const over = { edit: { required: true } }
    deepMerge(base, over)
    expect(base).toEqual({ edit: { mode: 'input' } })
    expect(over).toEqual({ edit: { required: true } })
  })

  it('over=undefined 返回 base 克隆', () => {
    const base = { a: 1 }
    const r = deepMerge(base, undefined)
    expect(r).toEqual({ a: 1 }); expect(r).not.toBe(base)
  })
})

// ── 模拟 DOC 事实表：voucher_detail 的物理列 ──
const voucherDetailCols = [
  { id: 'amount', dataType: 'DECIMAL', intDigits: 18, decimalDigits: 2, dimType: 'measure', agg: 'sum', nullable: false, caption: { zh_CN: '明细金额' } },
  { id: 'cost_center_id', dataType: 'BIGINT', dimType: 'dimension', refDict: 'cost_center', nullable: true, caption: { zh_CN: '成本中心' } },
  { id: 'cashflow_item_id', dataType: 'BIGINT', dimType: 'dimension', refDict: 'cashflow_item', nullable: true, caption: { zh_CN: '现金流量项目' } },
  { id: 'remark', dataType: 'VARCHAR', fieldLength: 512, dimType: 'attribute', nullable: true, caption: { zh_CN: '明细备注' } },
]
const tableCols = (t) => (t === 'voucher_detail' ? voucherDetailCols : [])
const dictOf = (c) => (c === 'cost_center' ? { dictId: 'cost_center', codeCol: 'item_code', labelCol: 'item_name' } : undefined)

describe('flc-overlay — expandRefField', () => {
  it('ref 无 over：完整继承 DOC 列物理属性', () => {
    const f = expandRefField({ ref: 'voucher_detail.amount' }, { tableCols })
    expect(f).toMatchObject({ id: 'amount', dataType: 'DECIMAL', decimalDigits: 2, agg: 'sum', dimType: 'measure' })
  })

  it('ref + over：叠加增量（现金流量项必填）', () => {
    const f = expandRefField({ ref: 'voucher_detail.cashflow_item_id', over: { edit: { required: true } } }, { tableCols })
    expect(f.edit).toEqual({ required: true })
    expect(f).toMatchObject({ id: 'cashflow_item_id', dataType: 'BIGINT', refDict: 'cashflow_item' })
  })

  it('as 改逻辑名：保留物理类型，换 id/name', () => {
    const f = expandRefField({ ref: 'voucher_detail.cost_center_id', as: 'department', over: { caption: { zh_CN: '部门' } } }, { tableCols })
    expect(f.id).toBe('department'); expect(f.name).toBe('department')
    expect(f.dataType).toBe('BIGINT'); expect(f.refDict).toBe('cost_center')
    expect(f.caption).toEqual({ zh_CN: '部门' })
  })

  it('dictOf 叠加：维度列继承字典取数配置（列覆盖字典）', () => {
    const f = expandRefField({ ref: 'voucher_detail.cost_center_id' }, { tableCols, dictOf })
    expect(f.dict).toMatchObject({ dictId: 'cost_center', codeCol: 'item_code' })
  })

  it('over 删除物理属性（agg:null 去合计）', () => {
    const f = expandRefField({ ref: 'voucher_detail.amount', over: { agg: null } }, { tableCols })
    expect(f.agg).toBeUndefined(); expect(f.dataType).toBe('DECIMAL')
  })

  it('列不存在返回 null（悬空引用）', () => {
    expect(expandRefField({ ref: 'voucher_detail.ghost' }, { tableCols })).toBeNull()
  })

  it('DOC 非空列 nullable:false ⇒ 默认 edit.required:true（对齐 _docColumnToField）', () => {
    const f = expandRefField({ ref: 'voucher_detail.amount' }, { tableCols })  // amount nullable:false
    expect(f.edit?.required).toBe(true)
  })

  it('over 可显式放松非空列的必填（作者主权，触发诊断另议）', () => {
    const f = expandRefField({ ref: 'voucher_detail.amount', over: { edit: { required: false } } }, { tableCols })
    expect(f.edit.required).toBe(false)
  })
})

describe('flc-overlay — expandRuleDetail', () => {
  it('use:"*" 展开全部物理列 + over 打补丁', () => {
    const detail = { table: 'voucher_detail', use: '*', over: { cashflow_item_id: { edit: { required: true } } } }
    const { fields } = expandRuleDetail(detail, { tableCols })
    expect(fields.map((f) => f.id)).toEqual(['amount', 'cost_center_id', 'cashflow_item_id', 'remark'])
    expect(fields.find((f) => f.id === 'cashflow_item_id').edit).toEqual({ required: true })
    // 其余列保持 DOC 定义
    expect(fields.find((f) => f.id === 'amount').agg).toBe('sum')
  })

  it('pick 只挑列出的列 + as + 顺序', () => {
    const detail = {
      table: 'voucher_detail',
      pick: [
        { ref: 'voucher_detail.cost_center_id', as: 'department', over: { caption: { zh_CN: '部门' }, edit: { required: true } } },
        { ref: 'voucher_detail.remark' },
        { ref: 'voucher_detail.amount', over: { display: { decimalDigits: 2 } } },
      ],
    }
    const { fields } = expandRuleDetail(detail, { tableCols })
    expect(fields.map((f) => f.id)).toEqual(['department', 'remark', 'amount'])
    expect(fields[0]).toMatchObject({ dataType: 'BIGINT', refDict: 'cost_center', caption: { zh_CN: '部门' } })
  })

  it('pick 用短 ref（列名，默认表）', () => {
    const detail = { table: 'voucher_detail', pick: [{ ref: 'amount' }] }
    const { fields } = expandRuleDetail(detail, { tableCols })
    expect(fields[0].id).toBe('amount')
  })

  it('pick + fields 混用（DOC 列 + 纯逻辑列）', () => {
    const detail = {
      table: 'voucher_detail',
      pick: [{ ref: 'amount' }],
      fields: [{ id: 'note', dimType: '', edit: { mode: 'input' } }],
    }
    const { fields } = expandRuleDetail(detail, { tableCols })
    expect(fields.map((f) => f.id)).toEqual(['amount', 'note'])
  })

  it('groups 透传', () => {
    const detail = { table: 'voucher_detail', pick: [{ ref: 'amount' }], groups: [{ caption: '金额', members: ['amount'] }] }
    const { groups } = expandRuleDetail(detail, { tableCols })
    expect(groups).toEqual([{ caption: '金额', members: ['amount'] }])
  })

  it('悬空引用被收集', () => {
    const detail = { table: 'voucher_detail', pick: [{ ref: 'voucher_detail.ghost' }] }
    const { fields, danglingRefs } = expandRuleDetail(detail, { tableCols })
    expect(fields).toEqual([])
    expect(danglingRefs).toEqual(['voucher_detail.ghost'])
  })
})

describe('flc-overlay — expandCombination', () => {
  const docResolver = (ref) => (ref && ref.file === 'gl_md_doc_meta_v1.json' ? { tableCols } : null)

  it('overlay 规则展开为 inline；纯 inline 规则恒等直通', () => {
    const combination = {
      docRef: { domain: 'fi', app: 'cmxfico', module: 'gl', file: 'gl_md_doc_meta_v1.json' },
      rules: [
        { id: 'fi-cash', detail: { table: 'voucher_detail', use: '*', over: { cashflow_item_id: { edit: { required: true } } } } },
        { id: 'legacy', detail: { table: 'voucher_detail', fields: [{ id: 'x', edit: { mode: 'input' } }] } },
      ],
    }
    const { combination: out, danglingRefs } = expandCombination(combination, { docResolver })
    const cash = out.rules.find((r) => r.id === 'fi-cash')
    expect(cash.detail.use).toBeUndefined()
    expect(cash.detail.fields.map((f) => f.id)).toEqual(['amount', 'cost_center_id', 'cashflow_item_id', 'remark'])
    // 纯 inline 规则不变
    const legacy = out.rules.find((r) => r.id === 'legacy')
    expect(legacy.detail.fields).toEqual([{ id: 'x', edit: { mode: 'input' } }])
    expect(danglingRefs).toEqual([])
  })

  it('不修改入参', () => {
    const combination = { docRef: { file: 'gl_md_doc_meta_v1.json' }, rules: [{ id: 'r', detail: { table: 'voucher_detail', use: '*' } }] }
    expandCombination(combination, { docResolver })
    expect(combination.rules[0].detail.use).toBe('*')
  })

  it('docResolver 返回 null（未加载单据）→ use 展开为空（逐列悬空不适用，属 resolver 层诊断）', () => {
    const combination = { docRef: { file: 'x' }, rules: [{ id: 'r', detail: { table: 'voucher_detail', use: '*' } }] }
    const { combination: out, danglingRefs } = expandCombination(combination, { docResolver: () => null })
    expect(out.rules[0].detail.fields).toEqual([])
    // use:"*" 无显式列清单 → 无逐列悬空；"单据未加载"由 resolver/诊断层单独报告
    expect(danglingRefs).toEqual([])
  })
})
