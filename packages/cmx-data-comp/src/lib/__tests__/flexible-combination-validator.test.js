import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { validateFlexibleCombination } from '../flexible-combination-validator.js'

// 真实档案回归：2026-08-25 资产收编后弹性组合档案统一在 cmx-container/assets/model/（旧 data/ 已废弃）
const COMBINATION_DIR = fileURLToPath(
  new URL('../../../../../cmx-container/assets/model/data/meta/flexible-combination/fi/cmxfico/gl/', import.meta.url),
)
const loadCombination = (name) => JSON.parse(readFileSync(`${COMBINATION_DIR}${name}`, 'utf8'))

describe('validateFlexibleCombination — 基础诊断', () => {
  it('合法档案通过', () => {
    const d = validateFlexibleCombination({
      anchorDimensions: ['account'],
      dimensions: { account: { name: '科目' } },
      rules: [{ id: 'r1', anchor: { dimensions: ['account'] }, detail: { fields: [{ id: 'amount', dimType: 'measure' }] } }],
    })
    expect(d.valid).toBe(true)
  })

  it('缺 dimensions / rules 报错', () => {
    expect(validateFlexibleCombination({}).valid).toBe(false)
  })

  it('字段引用未定义维度报错', () => {
    const d = validateFlexibleCombination({
      anchorDimensions: ['account'],
      dimensions: { account: { name: '科目' } },
      rules: [{ id: 'r1', anchor: { dimensions: ['account'] }, detail: { fields: [{ id: 'c', dimType: 'dimension', refDict: 'ghost' }] } }],
    })
    expect(d.valid).toBe(false)
    expect(d.errors.some((e) => e.code === 'FIELD_DIMENSION_UNKNOWN')).toBe(true)
  })

  it('非法计算公式报错', () => {
    const d = validateFlexibleCombination({
      dimensions: {},
      rules: [{ id: 'r1', anchor: { dimensions: [] }, detail: { fields: [{ id: 'a', dimType: 'measure', formula: '1 +' }] } }],
    })
    expect(d.errors.some((e) => e.code === 'FORMULA_INVALID')).toBe(true)
  })

  it('循环依赖报错', () => {
    const d = validateFlexibleCombination({
      dimensions: {},
      rules: [{
        id: 'r1',
        anchor: { dimensions: [] },
        detail: {
          fields: [
            { id: 'a', dimType: 'measure', formula: 'b + 1', dependsOn: ['b'] },
            { id: 'b', dimType: 'measure', formula: 'a + 1', dependsOn: ['a'] },
          ],
        },
      }],
    })
    expect(d.errors.some((e) => e.code === 'FORMULA_DEPENDENCY_CYCLE')).toBe(true)
  })
})

// 回归护栏：现有真实档案必须始终校验通过，确保本次叠加式重构不破坏既有定义。
describe('validateFlexibleCombination — 现有真实档案回归', () => {
  for (const name of ['account.json', 'trade.json']) {
    it(`${name} 校验通过`, () => {
      const d = validateFlexibleCombination(loadCombination(name))
      expect(d.errors, JSON.stringify(d.errors, null, 2)).toEqual([])
      expect(d.valid).toBe(true)
    })
  }
})

// 三层附加属性校验：field.column / groups[].aggregate / combination|rule.columnModel
const baseCombination = (overrides) => ({
  anchorDimensions: ['account'],
  dimensions: { account: { name: '科目' } },
  rules: [{
    id: 'r1',
    anchor: { dimensions: ['account'] },
    detail: { fields: [{ id: 'amount', dimType: 'measure', caption: '金额' }] },
  }],
  ...overrides,
})

describe('validateFlexibleCombination — 列级附加属性（扁平 key）', () => {
  it('合法列属性透传不报错', () => {
    const p = baseCombination()
    Object.assign(p.rules[0].detail.fields[0], { width: '120px', frozen: false, agg: 'sum', display: { mode: 'text', align: 'right' } })
    expect(validateFlexibleCombination(p).valid).toBe(true)
  })

  it('非法 display.align 报错', () => {
    const p = baseCombination()
    p.rules[0].detail.fields[0].display = { align: 'middle' }
    const d = validateFlexibleCombination(p)
    expect(d.errors.some((e) => e.code === 'COLUMN_DISPLAY_ALIGN_INVALID')).toBe(true)
  })

  it('非法 agg 报错', () => {
    const p = baseCombination()
    p.rules[0].detail.fields[0].agg = 'total'
    expect(validateFlexibleCombination(p).errors.some((e) => e.code === 'COLUMN_AGG_INVALID')).toBe(true)
  })

  it('display.cellStyle.when 非法表达式报错', () => {
    const p = baseCombination()
    p.rules[0].detail.fields[0].display = { cellStyle: [{ when: 'value <', class: 'neg' }] }
    expect(validateFlexibleCombination(p).errors.some((e) => e.code === 'COLUMN_CELLSTYLE_WHEN_INVALID')).toBe(true)
  })

  it('未知键放行（向前兼容）', () => {
    const p = baseCombination()
    p.rules[0].detail.fields[0].someFutureProp = 123
    expect(validateFlexibleCombination(p).valid).toBe(true)
  })
})

describe('validateFlexibleCombination — 分组级附加属性 aggregate/position', () => {
  it('合法聚合配置通过', () => {
    const p = baseCombination()
    p.rules[0].detail.groups = [{ caption: '金额信息', aggregate: { sum: true }, aggregatePosition: 'after', members: ['amount'] }]
    expect(validateFlexibleCombination(p).valid).toBe(true)
  })

  it('非法 aggregatePosition 报错', () => {
    const p = baseCombination()
    p.rules[0].detail.groups = [{ caption: 'g', aggregatePosition: 'top', members: ['amount'] }]
    expect(validateFlexibleCombination(p).errors.some((e) => e.code === 'GROUP_AGGREGATE_POSITION_INVALID')).toBe(true)
  })

  it('aggregate 非布尔值报错', () => {
    const p = baseCombination()
    p.rules[0].detail.groups = [{ caption: 'g', aggregate: { sum: 'yes' }, members: ['amount'] }]
    expect(validateFlexibleCombination(p).errors.some((e) => e.code === 'GROUP_AGGREGATE_VALUE_INVALID')).toBe(true)
  })
})

describe('validateFlexibleCombination — 模型级附加属性 columnModel', () => {
  it('combination.columnModel 合法通过', () => {
    const p = baseCombination({ columnModel: { caption: '辅助核算明细', toTitleCols: 'amount' } })
    expect(validateFlexibleCombination(p).valid).toBe(true)
  })

  it('rule.columnModel 类型错误报错', () => {
    const p = baseCombination()
    p.rules[0].columnModel = { caption: 123 }
    expect(validateFlexibleCombination(p).errors.some((e) => e.code === 'COLUMN_MODEL_FIELD_INVALID')).toBe(true)
  })

  it('columnModel 非对象报错', () => {
    const p = baseCombination({ columnModel: 'oops' })
    expect(validateFlexibleCombination(p).errors.some((e) => e.code === 'COLUMN_MODEL_OBJECT_REQUIRED')).toBe(true)
  })
})
