/**
 * cmx-doc-query 单测：UI 状态 ↔ DocQuery 组装 + 类型转换 + 列/算子校验。
 * 保证通用性——列/算子由元数据驱动，任意 L1..LN 单据通用。
 */
import { describe, it, expect } from 'vitest'
import {
  opsForType, coerceValue, buildLayerFilter, buildOrderBy, buildDocQuery,
} from '../cmx-doc-query.js'

const cols = [
  { name: 'code', dataType: 'VARCHAR' },
  { name: 'amount', dataType: 'DECIMAL' },
  { name: 'qty', dataType: 'BIGINT' },
  { name: 'posting_date', dataType: 'DATE' },
]

describe('opsForType', () => {
  it('数值列给比较算子，无 contains', () => {
    const ops = opsForType('DECIMAL').map((o) => o.op)
    expect(ops).toContain('$gte')
    expect(ops).not.toContain('$contains')
  })
  it('文本列给 contains/startsWith', () => {
    const ops = opsForType('VARCHAR').map((o) => o.op)
    expect(ops).toContain('$contains')
    expect(ops).toContain('$startsWith')
  })
})

describe('coerceValue', () => {
  it('数值列把字符串转数字', () => {
    expect(coerceValue('BIGINT', '100')).toBe(100)
    expect(coerceValue('DECIMAL', '12.5')).toBe(12.5)
  })
  it('文本列保持字符串', () => {
    expect(coerceValue('VARCHAR', '2026')).toBe('2026')
  })
  it('布尔列转 boolean', () => {
    expect(coerceValue('BOOL', 'true')).toBe(true)
  })
})

describe('buildLayerFilter', () => {
  it('多条件按列组装，同列多算子 AND，值按类型转换', () => {
    const f = buildLayerFilter([
      { col: 'code', op: '$eq', value: 'A' },
      { col: 'amount', op: '$gte', value: '100' },
      { col: 'amount', op: '$lt', value: '500' },
    ], cols)
    expect(f).toEqual({ code: { $eq: 'A' }, amount: { $gte: 100, $lt: 500 } })
  })
  it('$in 值拆逗号并转类型', () => {
    const f = buildLayerFilter([{ col: 'qty', op: '$in', value: '1,2,3' }], cols)
    expect(f).toEqual({ qty: { $in: [1, 2, 3] } })
  })
  it('$null 转 bool', () => {
    const f = buildLayerFilter([{ col: 'code', op: '$null', value: 'true' }], cols)
    expect(f).toEqual({ code: { $null: true } })
  })
  it('非法列被拒', () => {
    expect(() => buildLayerFilter([{ col: 'evil', op: '$eq', value: 'x' }], cols)).toThrow()
  })
  it('无条件返回 undefined', () => {
    expect(buildLayerFilter([], cols)).toBeUndefined()
  })
})

describe('buildOrderBy', () => {
  it('desc → !col', () => {
    expect(buildOrderBy([{ col: 'posting_date', desc: true }, { col: 'id', desc: false }]))
      .toEqual(['!posting_date', 'id'])
  })
})

describe('buildDocQuery', () => {
  it('组装完整 DocQuery（多层 + depth）', () => {
    const dq = buildDocQuery({
      cv_batch: { conds: [{ col: 'code', op: '$eq', value: 'A' }], columns: cols, sorts: [{ col: 'posting_date', desc: true }], limit: 50 },
      cv_line: { conds: [{ col: 'amount', op: '$gt', value: '0' }], columns: cols },
    }, { depth: 2, includeSiblings: false })
    expect(dq.depth).toBe(2)
    expect(dq.includeSiblings).toBe(false)
    expect(dq.layers.cv_batch.filter).toEqual({ code: { $eq: 'A' } })
    expect(dq.layers.cv_batch.orderBy).toEqual(['!posting_date'])
    expect(dq.layers.cv_batch.limit).toBe(50)
    expect(dq.layers.cv_line.filter).toEqual({ amount: { $gt: 0 } })
  })
  it('空状态 → 空 DocQuery', () => {
    expect(buildDocQuery({})).toEqual({})
  })
})
