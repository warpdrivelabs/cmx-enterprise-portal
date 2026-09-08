import { describe, it, expect } from 'vitest'
import { makeDctAdapter, makeFlcAdapter } from '../cmx-field-adapter.js'

const typeCaps = (f) => {
    switch (f.dataType) {
    case 'VARCHAR': return { len: true, int: false, dec: false }
    case 'INT': case 'BIGINT': case 'TINYINT': return { len: false, int: false, dec: false }
    case 'DECIMAL': return { len: false, int: true, dec: true }
    default: return { len: false, int: false, dec: false }
  }
}

describe('cmx-field-adapter — DCT/DOC', () => {
  const a = makeDctAdapter({ typeCaps })

  it('schema key = 存储键：id/name/caption / label', () => {
    expect(a.get({ id: 'code' }, 'id')).toBe('code')
    expect(a.get({ name: 'Code' }, 'name')).toBe('Code')
    expect(a.get({ caption: 'C' }, 'caption')).toBe('C')
    expect(a.get({ label: 'L' }, 'label')).toBe('L')
    const f = {}
    a.set(f, 'id', 'code')
    a.set(f, 'name', 'Code')
    a.set(f, 'caption', '注释')
    expect(f.id).toBe('code')
    expect(f.name).toBe('Code')
    expect(f.caption).toEqual({ zh_CN: '注释' })
    a.set(f, 'label', '标签')
    expect(f.label).toBe('标签')
  })

  it('edit.mode 读写：写入收敛为规范值，读取规范化', () => {
    expect(a.get({ edit: { mode: 'cmx-dict-select' } }, 'edit.mode')).toBe('cmx-dict-select')
    const f = {}
    a.set(f, 'edit.mode', 'cmx-number-input')
    expect(f.edit.mode).toBe('cmx-number-input')
    a.set(f, 'edit.mode', '')
    expect(f.edit?.mode).toBeUndefined()
  })

  it('enumValues 不再经 adapter 特殊分支（对象数组原样透传，逗号 join/split 已移除）', () => {
    // enumValues 改为对象数组 [{value,label}]，由 enum-values 控件直接读、宿主点路径写回。
    // adapter 不再有 get/set 特殊分支：get 走通用 getPath 原样返回，set 整 key 走通用字符串分支。
    const f = { enumValues: [{ value: 'open', label: '未开始' }] }
    expect(a.get(f, 'enumValues')).toEqual([{ value: 'open', label: '未开始' }]) // 不再 join 成逗号串
  })

  it('字段控制条件 edit.requiredWhen 路径直通', () => {
    const f = {}
    a.set(f, 'edit.requiredWhen', 'x>0')
    expect(f.edit.requiredWhen).toBe('x>0')
    a.set(f, 'edit.requiredWhen', '')
    expect(f.edit?.requiredWhen).toBeUndefined()
  })

  it('dataType 联动要求重渲染并清掉不适用位数', () => {
    const f = { dataType: 'DECIMAL', fieldLength: 10, intDigits: 8, decimalDigits: 2 }
    const r = a.set(f, 'dataType', 'INT') // INT/BIGINT/TINYINT 固定位数，不保留位数配置
    expect(r.relayout).toBe(true)
    expect(f.fieldLength).toBeUndefined()
    expect(f.intDigits).toBeUndefined()
    expect(f.decimalDigits).toBeUndefined()
  })

  it('dataType DECIMAL→VARCHAR 保留长度、清整数/小数位', () => {
    const f = { dataType: 'DECIMAL', intDigits: 8, decimalDigits: 2 }
    f.fieldLength = 5
    a.set(f, 'dataType', 'VARCHAR')
    expect(f.fieldLength).toBe(5) // VARCHAR 有 len
    expect(f.intDigits).toBeUndefined()
    expect(f.decimalDigits).toBeUndefined()
  })

  it('refDict 联动清 refField/displayField', () => {
    const f = { refDict: 'old', refField: 'code', displayField: 'name' }
    const r = a.set(f, 'refDict', 'gl_account')
    expect(r.relayout).toBe(true)
    expect(f.refDict).toBe('gl_account')
    expect(f.refField).toBeUndefined()
    expect(f.displayField).toBeUndefined()
  })

  it('dimType 联动要求重渲染，清空时同步清引用字段', () => {
    const f = { dimType: 'dimension', refDict: 'gl_account', refField: 'code', displayField: 'name' }
    const r1 = a.set(f, 'dimType', 'measure')
    expect(r1.relayout).toBe(true)
    expect(f.dimType).toBe('measure')
    expect(f.refDict).toBe('gl_account')

    const r2 = a.set(f, 'dimType', '')
    expect(r2.relayout).toBe(true)
    expect(f.dimType).toBeUndefined()
    expect(f.refDict).toBeUndefined()
    expect(f.refField).toBeUndefined()
    expect(f.displayField).toBeUndefined()
  })

  it('数字键空串删除', () => {
    const f = { fieldLength: 10 }
    a.set(f, 'fieldLength', '')
    expect(f.fieldLength).toBeUndefined()
    a.set(f, 'fieldLength', '64')
    expect(f.fieldLength).toBe(64)
  })

  it('普通字符串空串删除', () => {
    const f = { defaultValue: 'x' }
    a.set(f, 'defaultValue', '')
    expect(f.defaultValue).toBeUndefined()
  })

  it('dependsOn 存数组（防 FLC 引擎 .some/.includes 崩）', () => {
    const f = {}
    a.set(f, 'dependsOn', 'amount, price ,qty')
    expect(f.dependsOn).toEqual(['amount', 'price', 'qty'])
    expect(a.get(f, 'dependsOn')).toBe('amount, price, qty')
    // 空串删除
    a.set(f, 'dependsOn', '')
    expect(f.dependsOn).toBeUndefined()
  })

  it('visible(boolean-visible)：勾选删键=默认可见，取消存 false', () => {
    const f = {}
    a.set(f, 'visible', true, 'boolean-visible')
    expect(f.visible).toBeUndefined() // 删键=默认可见
    a.set(f, 'visible', false, 'boolean-visible')
    expect(f.visible).toBe(false)
  })

  it('display.format 写入不触发重渲染（避免 input 输入时全量重渲跳顶）', () => {
    const f = {}
    const r = a.set(f, 'display.format', 'datetime:YYYY-MM-DD HH:mm:ss')
    expect(r.relayout).toBe(false) // 复合控件 select+input，不重渲避免 input 每字符跳顶/失焦
    expect(f.display.format).toBe('datetime:YYYY-MM-DD HH:mm:ss')
    // 清空删键
    const r2 = a.set(f, 'display.format', '')
    expect(f.display?.format).toBeUndefined()
    expect(r2.relayout).toBe(false)
  })

  it('width 扁平存储（flcLayout 去前缀）', () => {
    const f = {}
    a.set(f, 'width', '120px')
    expect(f.width).toBe('120px')
    a.set(f, 'width', '')
    expect(f.width).toBeUndefined()
  })
})

describe('cmx-field-adapter — CTX', () => {
  const a = makeFlcAdapter()

  it('CTX schema key = 存储键（直通，无映射）：id/dataType/dimType', () => {
    const f = { id: 'amt', dataType: 'DECIMAL', dimType: 'measure' }
    expect(a.get(f, 'id')).toBe('amt')
    expect(a.get(f, 'dataType')).toBe('DECIMAL')
    expect(a.get(f, 'dimType')).toBe('measure')
  })

  it('edit.mode 路径直通读写', () => {
    const f = {}
    a.set(f, 'edit.mode', 'select')
    expect(f.edit.mode).toBe('select')
    expect(a.get(f, 'edit.mode')).toBe('select')
  })

  it('display.* schema key = 存储路径（直通写入）', () => {
    const f = {}
    a.set(f, 'display.decimalDigits', '2', 'number')
    a.set(f, 'display.thousandSeparator', true, 'boolean')
    a.set(f, 'display.zeroAsBlank', true, 'boolean')
    expect(f.display.decimalDigits).toBe(2)
    expect(f.display.thousandSeparator).toBe(true)
    expect(f.display.zeroAsBlank).toBe(true)
  })

  it('display.format 写入不触发重渲染（避免 input 输入时全量重渲跳顶）', () => {
    const f = {}
    const r = a.set(f, 'display.format', 'date:YYYY-MM')
    expect(r.relayout).toBe(false) // 复合控件 select+input，不重渲避免 input 每字符跳顶/失焦
    expect(f.display.format).toBe('date:YYYY-MM')
    const r2 = a.set(f, 'display.format', '')
    expect(f.display?.format).toBeUndefined()
    expect(r2.relayout).toBe(false)
  })

  it('引用字典区：refDict/refField/displayField 三端同存储键（直通）', () => {
    const f = {}
    a.set(f, 'refDict', 'gl_account')
    a.set(f, 'refField', 'code')
    a.set(f, 'displayField', 'name')
    expect(f.refDict).toBe('gl_account')
    expect(f.refField).toBe('code')
    expect(f.displayField).toBe('name')
  })

  it('CTX 继承字典/单据约束·治理属性（扁平同名存储）', () => {
    const f = {}
    a.set(f, 'defaultValue', '0')
    a.set(f, 'unique', true, 'boolean')
    a.set(f, 'pattern', '^x$')
    // enumValues 不再经 adapter：由 enum-values 控件点路径写回（enumValues.0.value），此处略。
    a.set(f, 'sensitive', 'pii')
    a.set(f, 'searchable', true, 'boolean')
    expect(f.defaultValue).toBe('0')
    expect(f.unique).toBe(true)
    expect(f.pattern).toBe('^x$')
    expect(f.sensitive).toBe('pii')
    expect(f.searchable).toBe(true)
  })

  it('CTX 字段控制：edit.requiredWhen / edit.readonlyWhen 路径直通', () => {
    const f = {}
    a.set(f, 'edit.requiredWhen', 'amount > 0')
    a.set(f, 'edit.readonlyWhen', "status != 'draft'")
    expect(f.edit.requiredWhen).toBe('amount > 0')
    expect(f.edit.readonlyWhen).toBe("status != 'draft'")
  })

  it('dependsOn 数组 ↔ 逗号串', () => {
    const f = {}
    a.set(f, 'dependsOn', 'a, b ,c')
    expect(f.dependsOn).toEqual(['a', 'b', 'c'])
    expect(a.get(f, 'dependsOn')).toBe('a, b, c')
  })

  it('column.visible boolean-visible：勾选删键、取消显式 false', () => {
    const f = {}
    // 取消勾选 → 显式 false
    a.set(f, 'column.visible', false, 'boolean-visible')
    expect(f.column.visible).toBe(false)
    // 勾选 → 删键（默认可见）
    a.set(f, 'column.visible', true, 'boolean-visible')
    expect(f.column?.visible).toBeUndefined()
  })

  it('boolean false 删键，空字符串删键并回收对象', () => {
    const f = { edit: { required: true } }
    a.set(f, 'edit.required', false, 'boolean')
    expect(f.edit?.required).toBeUndefined()
    expect(f.edit).toBeUndefined() // 回收
  })
})
