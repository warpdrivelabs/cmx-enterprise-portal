import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CmxFlexibleCombination } from '../cmx-flexible-combination.js'

/** 最小列模型桩：FC 只依赖 members 快照与 setMembers。 */
class FakeColumnModel {
  constructor (id, members = []) {
    this.id = id
    this.members = members
    this.setCalls = 0
  }

  setMembers (m) {
    this.members = m || []
    this.setCalls++
  }
}

/** 双字段集规则：字段集0 = t_head（detail），字段集1 = t_line（fieldTabs）。 */
const rule = {
  id: 'r1',
  detail: {
    table: 't_head',
    fields: [
      { id: 'item_text', dimType: 'attribute', caption: '摘要' },
      { id: 'amount', dimType: 'measure', caption: '金额' },
    ],
    fieldTabs: [
      {
        id: 'ftab1',
        table: 't_line',
        fields: [
          { id: 'customer_id', dimType: 'dimension', caption: '客户' },
        ],
      },
    ],
  },
}

describe('CmxFlexibleCombination — 单绑定（string，向后兼容）', () => {
  it('始终把字段集0 写入唯一目标列模型', () => {
    const fc = new CmxFlexibleCombination({ columnModelId: 'm1' })
    const m1 = new FakeColumnModel('m1', [])
    fc.bindColumnModel(m1)
    fc.setRule({ rule, dimensions: {} })
    expect(m1.members.map((c) => c.id)).toEqual(['item_text', 'amount'])
  })

  it('规则含多字段集时提示仅应用字段集0（不静默丢弃）', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    try {
      const fc = new CmxFlexibleCombination({ columnModelId: 'm1' })
      const m1 = new FakeColumnModel('m1', [])
      fc.bindColumnModel(m1)
      fc.setRule({ rule, dimensions: {} })
      expect(m1.members.map((c) => c.id)).toEqual(['item_text', 'amount'])
      expect(info).toHaveBeenCalledTimes(1)
      expect(String(info.mock.calls[0][0])).toContain('字段集')
      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
      info.mockRestore()
    }
  })
})

describe('CmxFlexibleCombination — 多绑定（{ 表名: 列模型ID }）', () => {
  it('各字段集按表路由到对应列模型', () => {
    const fc = new CmxFlexibleCombination({ columnModelId: { t_head: 'headModel', t_line: 'lineModel' } })
    const head = new FakeColumnModel('headModel', [])
    const line = new FakeColumnModel('lineModel', [])
    fc.bindColumnModel(head, 't_head')
    fc.bindColumnModel(line, 't_line')
    fc.setRule({ rule, dimensions: {} })
    expect(head.members.map((c) => c.id)).toEqual(['item_text', 'amount'])
    expect(line.members.map((c) => c.id)).toEqual(['customer_id'])
  })

  it('\'*\' 键承接未显式绑定表的字段集', () => {
    const fc = new CmxFlexibleCombination({ columnModelId: { t_head: 'headModel', '*': 'anyModel' } })
    const head = new FakeColumnModel('headModel', [])
    const anyM = new FakeColumnModel('anyModel', [])
    fc.bindColumnModel(head, 't_head')
    fc.bindColumnModel(anyM, '*')
    fc.setRule({ rule, dimensions: {} })
    expect(anyM.members.map((c) => c.id)).toEqual(['customer_id'])
  })

  it('字段集表无绑定且无 \'*\' 兜底时 warn 跳过（其余字段集正常应用）', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const fc = new CmxFlexibleCombination({ columnModelId: { t_head: 'headModel' } })
      const head = new FakeColumnModel('headModel', [])
      fc.bindColumnModel(head, 't_head')
      fc.setRule({ rule, dimensions: {} })
      expect(head.members.map((c) => c.id)).toEqual(['item_text', 'amount'])
      expect(warn).toHaveBeenCalledTimes(1)
      expect(String(warn.mock.calls[0][0])).toContain('t_line')
    } finally {
      warn.mockRestore()
    }
  })
})

describe('CmxFlexibleCombination — 缓存 / 还原 / 回退', () => {
  let warn
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    warn.mockRestore()
  })

  it('loadByAnchor 相同锚点命中缓存，resolver 只调用一次；全部字段集按绑定应用', async () => {
    const fetchRule = vi.fn(async () => ({ ruleId: 'r1', rule, dimensions: {} }))
    const fc = new CmxFlexibleCombination({ resolver: fetchRule, columnModelId: { t_head: 'h', t_line: 'l' } })
    const head = new FakeColumnModel('h', [])
    const line = new FakeColumnModel('l', [])
    fc.bindColumnModel(head, 't_head')
    fc.bindColumnModel(line, 't_line')

    const r1 = await fc.loadByAnchor({ account: '1122' })
    expect(r1).toEqual({ ruleId: 'r1', fromCache: false })
    const r2 = await fc.loadByAnchor({ account: '1122' })
    expect(r2).toEqual({ ruleId: 'r1', fromCache: true })
    expect(fetchRule).toHaveBeenCalledTimes(1)
    expect(head.members.map((c) => c.id)).toEqual(['item_text', 'amount'])
    expect(line.members.map((c) => c.id)).toEqual(['customer_id'])
  })

  it('clear() 把所有绑定还原到各自初始列', async () => {
    const fc = new CmxFlexibleCombination({ resolver: async () => ({ ruleId: 'r1', rule, dimensions: {} }), columnModelId: { t_head: 'h', t_line: 'l' } })
    const head = new FakeColumnModel('h', [{ id: 'h0' }])
    const line = new FakeColumnModel('l', [{ id: 'l0' }])
    fc.bindColumnModel(head, 't_head')
    fc.bindColumnModel(line, 't_line')

    await fc.loadByAnchor({ account: '1122' })
    expect(head.members.map((c) => c.id)).toEqual(['item_text', 'amount'])
    fc.clear()
    expect(head.members.map((c) => c.id)).toEqual(['h0'])
    expect(line.members.map((c) => c.id)).toEqual(['l0'])
  })

  it('取数失败时各绑定还原初始列，并派发 error 事件', async () => {
    const fc = new CmxFlexibleCombination({ resolver: async () => { throw new Error('boom') }, columnModelId: { t_head: 'h', t_line: 'l' } })
    const head = new FakeColumnModel('h', [{ id: 'h0' }])
    const line = new FakeColumnModel('l', [{ id: 'l0' }])
    fc.bindColumnModel(head, 't_head')
    fc.bindColumnModel(line, 't_line')

    const onError = vi.fn()
    fc.addEventListener('flexible-combination-error', onError)
    const r = await fc.loadByAnchor({ account: '1122' })
    expect(r).toEqual({ ruleId: null, fromCache: false })
    expect(head.members.map((c) => c.id)).toEqual(['h0'])
    expect(line.members.map((c) => c.id)).toEqual(['l0'])
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('setCombination 多规则形态经 resolveMergedRule 出列（保留字段集表信息）', () => {
    const rules = [
      {
        id: 'exact',
        anchor: { dimensions: ['account'], match: { account: '1122' } },
        detail: { table: 't_head', fields: [{ id: 'a' }, { id: 'b', v: 1 }], fieldTabs: [{ table: 't_line', fields: [{ id: 'x' }] }] },
      },
      {
        id: 'fallback',
        anchor: { dimensions: ['account'] },
        detail: { table: 't_head', fields: [{ id: 'b', v: 2 }, { id: 'c' }], fieldTabs: [{ table: 't_line', fields: [{ id: 'y' }] }] },
      },
    ]
    const fc = new CmxFlexibleCombination({ columnModelId: { t_head: 'h', t_line: 'l' } })
    const head = new FakeColumnModel('h', [])
    const line = new FakeColumnModel('l', [])
    fc.bindColumnModel(head, 't_head')
    fc.bindColumnModel(line, 't_line')

    const ret = fc.setCombination({ rules, dimensions: {}, anchor: { account: '1122' } })
    expect(ret).toEqual({ ruleId: 'exact+fallback', found: true })
    expect(head.members.map((c) => c.id)).toEqual(['a', 'b', 'c'])
    expect(line.members.map((c) => c.id)).toEqual(['x', 'y'])
  })
})
