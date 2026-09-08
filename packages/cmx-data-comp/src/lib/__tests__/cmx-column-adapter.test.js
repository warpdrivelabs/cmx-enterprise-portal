import { describe, it, expect } from 'vitest'
import { CmxColumnAdapter, buildDisplayCellTemplate, formatGridNumber } from '../cmx-column-adapter.js'
import { CmxColumn } from '../cmx-column.js'
import { CmxColumnGroup } from '../cmx-column-group.js'
import { CmxColumnModel } from '../cmx-column-model.js'

// 轻量 h()：返回 {tag, attrs, children} 便于断言
const h = (tag, attrs, children) => ({ tag, attrs, children })

describe('CmxColumnAdapter._cmxTableTotals — 聚合类型保真', () => {
  it('携带 aggMap（按 group.aggregate 类型）+ position', () => {
    const model = new CmxColumnModel({
      members: [
        new CmxColumnGroup({ caption: 'g', aggregatePosition: 'before', aggregate: { avg: true }, members: [
          new CmxColumn({ id: 'a', dataType: 'DECIMAL' }),
          new CmxColumn({ id: 'b', dataType: 'DECIMAL' }),
        ] }),
      ],
    })
    const t = CmxColumnAdapter._cmxTableTotals(model)
    expect(t.columns.sort()).toEqual(['a', 'b'])
    expect(t.aggMap).toEqual({ a: 'avg', b: 'avg' })
    expect(t.position).toBe('before')
  })

  it('count 聚合保留（不再被丢弃）', () => {
    const model = new CmxColumnModel({
      members: [
        new CmxColumnGroup({ caption: 'g', aggregate: { count: true }, members: [
          new CmxColumn({ id: 'x', dataType: 'DECIMAL' }),
        ] }),
      ],
    })
    const t = CmxColumnAdapter._cmxTableTotals(model)
    expect(t.aggMap.x).toBe('count')
  })
})

describe('CmxColumnAdapter._cmxTableType — 输入控件类型路由（新增 datetime）', () => {
  it('datetime（物理 DATETIME / edit.mode=cmx-datetime-input）路由到 datetime，不塌缩为 date', () => {
    expect(CmxColumnAdapter._cmxTableType({ id: 'a', dataType: 'DATETIME' })).toBe('datetime')
    expect(CmxColumnAdapter._cmxTableType({ id: 'b', edit: { mode: 'cmx-datetime-input' } })).toBe('datetime')
  })
  it('纯 date 仍为 date；number/text 不受影响', () => {
    expect(CmxColumnAdapter._cmxTableType({ id: 'c', dataType: 'DATE' })).toBe('date')
    expect(CmxColumnAdapter._cmxTableType({ id: 'd', edit: { mode: 'cmx-date-input' } })).toBe('date')
    expect(CmxColumnAdapter._cmxTableType({ id: 'e', dataType: 'DECIMAL' })).toBe('number')
    expect(CmxColumnAdapter._cmxTableType({ id: 'f', dataType: 'VARCHAR' })).toBe('text')
  })
  it('显式 edit.mode（select/ref/combo）优先于 dataType 推断', () => {
    expect(CmxColumnAdapter._cmxTableType({ id: 'g', dataType: 'DATETIME', edit: { mode: 'combo' } })).toBe('combo')
  })
  it('checkbox 优先于 TINYINT 数字派生（status 列不应变数字步进器）', () => {
    expect(CmxColumnAdapter._cmxTableType({ id: 'status', dataType: 'TINYINT', edit: { mode: 'checkbox' } })).toBe('checkbox')
    expect(CmxColumnAdapter._cmxTableType({ id: 'flag', dataType: 'BOOLEAN', edit: { mode: 'checkbox' } })).toBe('checkbox')
  })
  it('显式文本类（textarea/rich-text/image/video）强制 text，不被 dataType 抢判', () => {
    expect(CmxColumnAdapter._cmxTableType({ id: 'note', dataType: 'INT', edit: { mode: 'cmx-textarea-input' } })).toBe('text')
    expect(CmxColumnAdapter._cmxTableType({ id: 'rich', dataType: 'BIGINT', edit: { mode: 'cmx-richtext-input' } })).toBe('text')
    expect(CmxColumnAdapter._cmxTableType({ id: 'img', dataType: 'VARCHAR', edit: { mode: 'image' } })).toBe('text')
  })
})

describe('buildDisplayCellTemplate — display 高保真', () => {
  it('thousandSeparator:false 关闭千分位', () => {
    expect(formatGridNumber(1234567, { thousandSep: false, decimalDigits: 0 })).toBe('1234567')
    expect(formatGridNumber(1234567, { thousandSep: true, decimalDigits: 0 })).toBe('1,234,567')
  })

  it('badgeMap 项的 icon 被渲染（children 含 ui5-icon）', () => {
    const tpl = buildDisplayCellTemplate({ id: 's', display: { mode: 'badge', badgeMap: { ok: { text: '通过', color: '#0a0', icon: 'accept' } } } })
    const vnode = tpl(h, { model: { s: 'ok' }, prop: 's' })
    expect(vnode.tag).toBe('span')
    expect(Array.isArray(vnode.children)).toBe(true)
    expect(vnode.children[0].tag).toBe('ui5-icon')
    expect(vnode.children[0].attrs.name).toBe('accept')
  })

  it('link.href 模板 {field} 占位 → 渲染 href', () => {
    const tpl = buildDisplayCellTemplate({ id: 'name', display: { mode: 'link', link: { href: '/order/{id}', target: '_blank' } } })
    const vnode = tpl(h, { model: { name: '订单A', id: '1001' }, prop: 'name' })
    expect(vnode.tag).toBe('a')
    expect(vnode.attrs.href).toBe('/order/1001')
    expect(vnode.attrs.target).toBe('_blank')
  })

  it('P0: 数值列负数默认标红（display.negativeColor 键名生效）', () => {
    const tpl = buildDisplayCellTemplate({ id: 'amt', dataType: 'DECIMAL', display: { decimalDigits: 2 } })
    const neg = tpl(h, { model: { amt: -5 }, prop: 'amt' })
    expect(neg.tag).toBe('span')
    expect(neg.attrs.style.color).toContain('sapNegativeColor')
  })

  it('P0: display.negativeColor:false 关闭负数标红', () => {
    const tpl = buildDisplayCellTemplate({ id: 'amt', dataType: 'DECIMAL', display: { decimalDigits: 2, negativeColor: false } })
    const neg = tpl(h, { model: { amt: -5 }, prop: 'amt' })
    // 关闭后不再包 span 标红，直接返回格式化文本字符串
    expect(typeof neg).toBe('string')
    expect(neg).toContain('5')
  })

  it('mode:text 让 BIGINT 数值列原样显示，不走数值格式化（无小数点/千分位）', () => {
    const tpl = buildDisplayCellTemplate({ id: 'comp', dataType: 'BIGINT', display: { mode: 'text' } })
    const out = tpl(h, { model: { comp: 1000 }, prop: 'comp' })
    expect(out).toBe('1000')          // 原样字符串，不是 1,000.00
  })

  it('mode:number 显式走数值格式化（千分位 + 小数位）', () => {
    const tpl = buildDisplayCellTemplate({ id: 'amt', dataType: 'BIGINT', display: { mode: 'number', decimalDigits: 0 } })
    const out = tpl(h, { model: { amt: 1234567 }, prop: 'amt' })
    expect(out).toBe('1,234,567')     // 千分位，0 位小数
  })

  it('mode 缺省时数值列默认走 number（保持金额列既有行为）', () => {
    const tpl = buildDisplayCellTemplate({ id: 'amt', dataType: 'DECIMAL', display: { decimalDigits: 2 } })
    const out = tpl(h, { model: { amt: 1234.5 }, prop: 'amt' })
    expect(out).toContain('1,234.50') // 默认仍格式化
  })
})

describe('CmxColumnAdapter form 适配 — edit.* 提升到 field 顶层 + boolean', () => {
  it('valueField/displayTemplate/dependents/requiredWhen/validate 提到 field 顶层', () => {
    const model = new CmxColumnModel({ members: [
      new CmxColumn({ id: 'acct', caption: '科目', edit: {
        mode: 'ref', valueField: 'code', displayTemplate: '{code} {name}', dependents: ['acctName'],
        requiredWhen: 'amount>0', validate: 'len(acct)>0',
      } }),
    ] })
    const nodes = CmxColumnAdapter.toCmxFormGrouped(model)
    const f = nodes[0]
    expect(f.valueField).toBe('code')
    expect(f.displayTemplate).toBe('{code} {name}')
    expect(f.dependents).toEqual(['acctName'])
    expect(f.requiredWhen).toBe('amount>0')
    expect(f.validate).toBe('len(acct)>0')
  })

  it('dataType=BOOLEAN → form 控件类型 checkbox', () => {
    const model = new CmxColumnModel({ members: [new CmxColumn({ id: 'flag', dataType: 'BOOLEAN' })] })
    const f = CmxColumnAdapter.toCmxFormGrouped(model)[0]
    expect(f.type).toBe('checkbox')
  })
})
