import { describe, it, expect } from 'vitest'
import { FlexibleCombinationEngine } from '../flexible-combination-engine.js'

// 模拟 DOC 事实表 voucher_detail 的物理列（供 overlay use/pick 展开）
const voucherDetailCols = [
  { id: 'amount', dataType: 'DECIMAL', intDigits: 18, decimalDigits: 2, dimType: 'measure', agg: 'sum', nullable: false, caption: { zh_CN: '明细金额' }, edit: { mode: 'input' } },
  { id: 'cost_center_id', dataType: 'BIGINT', dimType: 'dimension', refDict: 'cost_center', nullable: true, caption: { zh_CN: '成本中心' }, edit: { mode: 'select' } },
  { id: 'cashflow_item_id', dataType: 'BIGINT', dimType: 'dimension', refDict: 'cashflow_item', nullable: true, caption: { zh_CN: '现金流量项目' }, edit: { mode: 'select' } },
  { id: 'remark', dataType: 'VARCHAR', fieldLength: 512, dimType: 'attribute', nullable: true, caption: { zh_CN: '明细备注' }, edit: { mode: 'input' } },
]
const docTables = (t) => (t === 'voucher_detail' ? voucherDetailCols : [])

const dimensions = {
  cost_center: { name: '成本中心' },
  cashflow_item: { name: '现金流量项目' },
}

describe('engine + overlay 集成', () => {
  it('use:"*" 展开出与物理表一致的列（顺序/类型/精度）', () => {
    const eng = new FlexibleCombinationEngine({
      dimensions,
      docTables,
      rules: [{ id: 'fi-cash', detail: { table: 'voucher_detail', use: '*' } }],
    })
    const cols = eng.buildColumns(eng.rules[0])
    expect(cols.map((c) => c.id)).toEqual(['amount', 'cost_center_id', 'cashflow_item_id', 'remark'])
    const amount = cols.find((c) => c.id === 'amount')
    expect(amount.dataType).toBe('DECIMAL')
    expect(amount.agg).toBe('sum')
  })

  it('use:"*" + over 打补丁：现金流量项必填', () => {
    const eng = new FlexibleCombinationEngine({
      dimensions,
      docTables,
      rules: [{ id: 'fi-cash', detail: { table: 'voucher_detail', use: '*', over: { cashflow_item_id: { edit: { required: true } } } } }],
    })
    const cols = eng.buildColumns(eng.rules[0])
    const cf = cols.find((c) => c.id === 'cashflow_item_id')
    expect(cf.required).toBe(true)
    // caption 带必填星标（引擎既有语义）
    expect(String(cf.caption)).toContain('*')
  })

  it('overlay use:"*" 编译结果与手写 inline 等价（含 nullable:false⇒required 语义）', () => {
    const overlayEng = new FlexibleCombinationEngine({
      dimensions, docTables,
      rules: [{ id: 'r', detail: { table: 'voucher_detail', use: '*' } }],
    })
    // 手写 inline 基线：overlay 会 (1) 从 id 归一 name，(2) 对 nullable:false 列补 edit.required:true。
    // 基线也照此补齐，两路才逐键等价（证明 overlay == 既有 _docColumnToField 语义）。
    const inlineEng = new FlexibleCombinationEngine({
      dimensions,
      rules: [{ id: 'r', detail: { table: 'voucher_detail', fields: voucherDetailCols.map((c) => {
        const f = { ...c, name: c.id }
        if (c.nullable === false) f.edit = { ...(c.edit || {}), required: true }
        return f
      }) } }],
    })
    const a = overlayEng.buildColumns(overlayEng.rules[0]).map((c) => c.toJSON?.() ?? c)
    const b = inlineEng.buildColumns(inlineEng.rules[0]).map((c) => c.toJSON?.() ?? c)
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b))
  })

  it('pick + as：逻辑列 department 绑定物理 cost_center_id', () => {
    const eng = new FlexibleCombinationEngine({
      dimensions, docTables,
      rules: [{
        id: 'fi-expense',
        detail: {
          table: 'voucher_detail',
          pick: [
            { ref: 'voucher_detail.cost_center_id', as: 'department', over: { caption: { zh_CN: '部门' }, edit: { required: true } } },
            { ref: 'voucher_detail.amount' },
          ],
        },
      }],
    })
    const cols = eng.buildColumns(eng.rules[0])
    expect(cols.map((c) => c.id)).toEqual(['department', 'amount'])
    const dept = cols[0]
    expect(dept.dataType).toBe('BIGINT')       // 保留物理类型
    expect(dept.required).toBe(true)
  })

  it('无 docTables 时 use/pick 不展开（仅 inline 生效）', () => {
    const eng = new FlexibleCombinationEngine({
      dimensions,
      rules: [{ id: 'r', detail: { table: 'voucher_detail', use: '*', fields: [{ id: 'x', edit: { mode: 'input' } }] } }],
    })
    const cols = eng.buildColumns(eng.rules[0])
    expect(cols.map((c) => c.id)).toEqual(['x'])   // use 未展开，仅 inline x
  })

  it('recompute/validate 看到展开后的字段（构造期展开的一致性）', () => {
    const eng = new FlexibleCombinationEngine({
      dimensions, docTables,
      rules: [{ id: 'r', detail: { table: 'voucher_detail', use: '*', over: { amount: { edit: { required: true } } } } }],
    })
    // validate 读的是 rule.detail.fields（已展开）→ amount 必填应生效
    const res = eng.validate({ amount: '' }, eng.rules[0])
    expect(res.valid).toBe(false)
    expect(res.errors.some((e) => e.code === 'amount')).toBe(true)
  })
})

describe('engine + DRN refDict（跨模块引用字典，两种写法等价）', () => {
  // 维度 currency（模拟另一模块的共享字典），engine 侧 dimension 池按有效 code 命中
  const dims = {
    currency: { name: '币种', dict: { dictId: 'currency', codeCol: 'item_code', labelCol: 'item_name' } },
  }

  const dictEdit = (eng) => {
    const cols = eng.buildColumns(eng.rules[0])
    return cols.find((c) => c.id === 'cur')?.edit
  }

  it('裸 code refDict:"currency" → 绑定 currency 字典', () => {
    const eng = new FlexibleCombinationEngine({
      dimensions: dims,
      rules: [{ id: 'r', detail: { fields: [{ id: 'cur', dimType: 'dimension', refDict: 'currency', edit: { mode: 'select' } }] } }],
    })
    expect(dictEdit(eng)?.dictCode).toBe('currency')
  })

  it('DRN 别名 refDict:"@cur" + imports → 归一到同一 currency 字典（等价裸 code）', () => {
    const eng = new FlexibleCombinationEngine({
      dimensions: dims,
      from: { domain: 'fi', app: 'cmxfico', module: 'gl' },
      imports: [{ alias: 'cur', drn: 'drn:fi/shared-md/masterdata/DCT/currency' }],
      rules: [{ id: 'r', detail: { fields: [{ id: 'cur', dimType: 'dimension', refDict: '@cur', edit: { mode: 'select' } }] } }],
    })
    expect(dictEdit(eng)?.dictCode).toBe('currency')
  })

  it('绝对 DRN refDict:"drn:…/DCT/currency" → 同样归一到 currency', () => {
    const eng = new FlexibleCombinationEngine({
      dimensions: dims,
      from: { domain: 'fi', app: 'cmxfico', module: 'gl' },
      rules: [{ id: 'r', detail: { fields: [{ id: 'cur', dimType: 'dimension', refDict: 'drn:fi/shared-md/masterdata/DCT/currency', edit: { mode: 'select' } }] } }],
    })
    expect(dictEdit(eng)?.dictCode).toBe('currency')
  })
})
