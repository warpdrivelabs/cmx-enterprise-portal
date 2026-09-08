import { describe, it, expect } from 'vitest'
import { FlexibleCombinationEngine } from '../flexible-combination-engine.js'

/**
 * $under 层级泛化匹配（L1 联动 L2 联动 L3）。
 *
 * 案例树：2(负债 L1) → 2221(应交税费 L2) → 222101(进项税 L3)。
 * 锚点协议：{ gl_account: '222101', 'gl_account.__path': '2,2221,222101' }
 * （数组形态同样支持；组件 _cleanAnchor 会把数组归一为逗号串）。
 */
const dimensions = {}
const rules = [
  {
    id: 'l1-liability',
    anchor: { dimensions: ['gl_account'], match: { gl_account: { $under: '2' } } },
    detail: {
      table: 't_aux',
      fields: [{ id: 'item_text', v: 1 }, { id: 'cost_center_id' }],
    },
  },
  {
    id: 'l2-payable',
    anchor: { dimensions: ['gl_account'], match: { gl_account: { $under: '2221' } } },
    detail: {
      table: 't_aux',
      fields: [{ id: 'supplier_id' }, { id: 'item_text', v: 2 }],
    },
  },
  {
    id: 'l3-vat-in',
    anchor: { dimensions: ['gl_account'], match: { gl_account: '222101' } },
    detail: {
      table: 't_aux',
      fields: [{ id: 'tax_rate', v: 3 }],
    },
  },
  {
    id: 'fallback',
    anchor: { dimensions: ['gl_account'], match: {} },
    detail: {
      table: 't_aux',
      fields: [{ id: 'amount' }],
    },
  },
]

describe('FlexibleCombinationEngine — $under 层级泛化（__path 协议）', () => {
  it('选中 L3（带祖先链）→ L1+L2+L3+兜底 四条命中；位置首现、同名取高分', () => {
    const eng = new FlexibleCombinationEngine({ dimensions, rules })
    const merged = eng.resolveMergedRule({ gl_account: '222101', 'gl_account.__path': '2,2221,222101' })
    expect(merged.id).toBe('l1-liability+l2-payable+l3-vat-in+fallback')
    // 位置：L1 基础在前，L2/L3 增量随后，兜底殿后
    expect(merged.detail.fields.map((f) => f.id)).toEqual(['item_text', 'cost_center_id', 'supplier_id', 'tax_rate', 'amount'])
    // 同名 item_text：L1(1.5) vs L2(1.5) 同分取先到 → v=1
    expect(merged.detail.fields.find((f) => f.id === 'item_text').v).toBe(1)
  })

  it('__path 数组形态同样生效', () => {
    const eng = new FlexibleCombinationEngine({ dimensions, rules })
    const merged = eng.resolveMergedRule({ gl_account: '222102', 'gl_account.__path': ['2', '2221', '222102'] })
    expect(merged.id).toBe('l1-liability+l2-payable+fallback')
  })

  it('$under 未命中（path 不含祖先且值不等）→ 该规则淘汰', () => {
    const eng = new FlexibleCombinationEngine({ dimensions, rules })
    // 1001 属资产 L1(1)，path 不含 2/2221 → 仅兜底
    const merged = eng.resolveMergedRule({ gl_account: '1001', 'gl_account.__path': '1,1001' })
    expect(merged.id).toBe('fallback')
  })

  it('无 __path 时 $under 退化为值相等匹配', () => {
    const eng = new FlexibleCombinationEngine({ dimensions, rules })
    // 无 path：l2-payable 的 $under '2221' 仅靠值相等命中
    const merged = eng.resolveMergedRule({ gl_account: '2221' })
    expect(merged.id).toBe('l2-payable+fallback')
  })

  it('$under 得分 1.5：精确规则(3)的同名字段覆盖泛化规则', () => {
    const eng = new FlexibleCombinationEngine({
      dimensions,
      rules: [
        { id: 'gen', anchor: { dimensions: ['gl_account'], match: { gl_account: { $under: '2221' } } },
          detail: { table: 't', fields: [{ id: 'item_text', v: 'gen' }] } },
        { id: 'exact', anchor: { dimensions: ['gl_account'], match: { gl_account: '222101' } },
          detail: { table: 't', fields: [{ id: 'item_text', v: 'exact' }] } },
      ],
    })
    const merged = eng.resolveMergedRule({ gl_account: '222101', 'gl_account.__path': '2,2221,222101' })
    expect(merged.id).toBe('gen+exact')
    // 位置取首现（gen 先定义），值取高分（exact 精确 3 分 > $under 1.5 分）
    expect(merged.detail.fields.map((f) => f.id)).toEqual(['item_text'])
    expect(merged.detail.fields[0].v).toBe('exact')
  })
})
