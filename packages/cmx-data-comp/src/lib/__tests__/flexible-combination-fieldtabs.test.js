import { describe, it, expect } from 'vitest'
import { FlexibleCombinationEngine } from '../flexible-combination-engine.js'

/** 双规则：exact（精确 match）+ fallback（无 match 兜底），各带双字段集（t_head + t_line）。 */
const dimensions = {}
const rules = [
  {
    id: 'exact',
    anchor: { dimensions: ['account'], match: { account: '1122' } },
    detail: {
      table: 't_head',
      fields: [{ id: 'a', caption: 'A' }, { id: 'b', caption: 'B' }],
      fieldTabs: [
        { id: 'ft1', table: 't_line', fields: [{ id: 'x', caption: 'X' }, { id: 'y', caption: 'Y' }] },
      ],
    },
  },
  {
    id: 'fallback',
    anchor: { dimensions: ['account'] },
    detail: {
      table: 't_head',
      fields: [{ id: 'b', caption: 'B2' }, { id: 'c', caption: 'C' }],
      fieldTabs: [
        { id: 'ft2', table: 't_line', fields: [{ id: 'y', caption: 'Y2' }, { id: 'z', caption: 'Z' }] },
      ],
    },
  },
]

describe('FlexibleCombinationEngine — fieldTabs 多字段集合并', () => {
  it('resolveMergedRule 保留 detail.table，fieldTabs 按表聚合：位置首现 / 同名高分覆盖', () => {
    const eng = new FlexibleCombinationEngine({ dimensions, rules })
    const merged = eng.resolveMergedRule({ account: '1122' })
    expect(merged.id).toBe('exact+fallback')
    // 字段集0：table 保留；字段顺序 a,b,c；b 取高分（exact）定义
    expect(merged.detail.table).toBe('t_head')
    expect(merged.detail.fields.map((f) => f.id)).toEqual(['a', 'b', 'c'])
    expect(merged.detail.fields.find((f) => f.id === 'b').caption).toBe('B')
    // fieldTabs：同表 t_line 聚合为 1 项；x,y,z 顺序；y 取高分定义
    expect(merged.detail.fieldTabs).toHaveLength(1)
    const tab = merged.detail.fieldTabs[0]
    expect(tab.table).toBe('t_line')
    expect(tab.fields.map((f) => f.id)).toEqual(['x', 'y', 'z'])
    expect(tab.fields.find((f) => f.id === 'y').caption).toBe('Y')
  })

  it('所有命中规则都无 fieldTabs 时合并结果不带 fieldTabs 键', () => {
    const noTabs = rules.map((r) => ({ ...r, detail: { table: r.detail.table, fields: r.detail.fields } }))
    const eng = new FlexibleCombinationEngine({ dimensions, rules: noTabs })
    const merged = eng.resolveMergedRule({ account: '1122' })
    expect(merged.detail.fieldTabs).toBeUndefined()
    expect(merged.detail.table).toBe('t_head')
  })

  it('fieldSetsOf / buildMembers 支持逐字段集取列', () => {
    const eng = new FlexibleCombinationEngine({ dimensions, rules: [rules[0]] })
    const sets = eng.fieldSetsOf(rules[0])
    expect(sets.map((s) => s.table)).toEqual(['t_head', 't_line'])
    const lineMembers = eng.buildMembers({ ...rules[0], detail: sets[1].detail })
    expect(lineMembers.map((c) => c.id)).toEqual(['x', 'y'])
  })
})

describe('FlexibleCombinationEngine — 构造期 fieldTabs overlay 展开（docTables 注入）', () => {
  it('fieldTabs 的 use:"*" 按其 table 展开为 inline fields', () => {
    const docTables = (t) => (t === 't_line'
      ? [{ id: 'p1', caption: { zh_CN: 'P1' } }, { id: 'p2', caption: { zh_CN: 'P2' } }]
      : null)
    const ruleWithOverlay = {
      id: 'r',
      detail: {
        table: 't_head',
        fields: [{ id: 'a', caption: 'A' }],
        fieldTabs: [{ table: 't_line', use: '*' }],
      },
    }
    const eng = new FlexibleCombinationEngine({ dimensions: {}, rules: [ruleWithOverlay], docTables })
    const detail = eng.rules[0].detail
    expect(detail.fields.map((f) => f.id)).toEqual(['a'])
    const tab = detail.fieldTabs[0]
    expect(tab.use).toBeUndefined()
    expect(tab.fields.map((f) => f.id)).toEqual(['p1', 'p2'])
  })

  it('fieldTabs 的 pick（ref + as）按各自 table 展开', () => {
    const docTables = (t) => (t === 't_line' ? [{ id: 'qty', caption: { zh_CN: '数量' } }] : null)
    const ruleWithOverlay = {
      id: 'r',
      detail: {
        table: 't_head',
        fields: [],
        fieldTabs: [{ table: 't_line', pick: [{ ref: 't_line.qty', as: 'quantity' }] }],
      },
    }
    const eng = new FlexibleCombinationEngine({ dimensions: {}, rules: [ruleWithOverlay], docTables })
    const tab = eng.rules[0].detail.fieldTabs[0]
    expect(tab.pick).toBeUndefined()
    expect(tab.fields.map((f) => f.id)).toEqual(['quantity'])
  })
})
