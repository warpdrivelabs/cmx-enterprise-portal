/**
 * cmx-msgpack-decode 单测:验证精简解码器覆盖列式包用到的所有类型,
 * 并与「后端产出 → 前端 fromJSON」的契约同构。
 */
import { describe, it, expect } from 'vitest'
import { decodeMsgpack } from '../cmx-msgpack-decode.js'

// 用一个最小 msgpack 编码器(仅测试用)造样本,避免依赖后端。
function enc (v) {
  const out = []
  write(out, v)
  return new Uint8Array(out)
}
function write (out, v) {
  if (v === null) { out.push(0xc0); return }
  if (v === true) { out.push(0xc3); return }
  if (v === false) { out.push(0xc2); return }
  if (typeof v === 'number') {
    if (Number.isInteger(v)) {
      if (v >= 0 && v <= 0x7f) { out.push(v); return }
      if (v < 0 && v >= -32) { out.push(v + 0x100); return }
      // int 32 / int 64 走 8 字节 int64 简化
      out.push(0xd3)
      const b = new ArrayBuffer(8); new DataView(b).setBigInt64(0, BigInt(v))
      out.push(...new Uint8Array(b)); return
    }
    out.push(0xcb)
    const b = new ArrayBuffer(8); new DataView(b).setFloat64(0, v)
    out.push(...new Uint8Array(b)); return
  }
  if (typeof v === 'string') {
    const bytes = new TextEncoder().encode(v)
    if (bytes.length <= 31) { out.push(0xa0 | bytes.length) }
    else { out.push(0xdb); const bb = new ArrayBuffer(4); new DataView(bb).setUint32(0, bytes.length); out.push(...new Uint8Array(bb)) }
    out.push(...bytes); return
  }
  if (Array.isArray(v)) {
    if (v.length <= 15) { out.push(0x90 | v.length) }
    else { out.push(0xdd); const bb = new ArrayBuffer(4); new DataView(bb).setUint32(0, v.length); out.push(...new Uint8Array(bb)) }
    for (const x of v) write(out, x); return
  }
  if (typeof v === 'object') {
    const keys = Object.keys(v)
    if (keys.length <= 15) { out.push(0x80 | keys.length) }
    else { out.push(0xdf); const bb = new ArrayBuffer(4); new DataView(bb).setUint32(0, keys.length); out.push(...new Uint8Array(bb)) }
    for (const k of keys) { write(out, k); write(out, v[k]) }
    return
  }
  throw new Error('unsupported')
}

describe('decodeMsgpack', () => {
  it('解码标量', () => {
    expect(decodeMsgpack(enc(null))).toBe(null)
    expect(decodeMsgpack(enc(true))).toBe(true)
    expect(decodeMsgpack(enc(false))).toBe(false)
    expect(decodeMsgpack(enc(42))).toBe(42)
    expect(decodeMsgpack(enc(-5))).toBe(-5)
    expect(decodeMsgpack(enc(1001))).toBe(1001)
    expect(decodeMsgpack(enc(1130000.5))).toBeCloseTo(1130000.5)
    expect(decodeMsgpack(enc('héllo 世界'))).toBe('héllo 世界')
  })

  it('解码嵌套数组/对象', () => {
    const v = { a: [1, 2, 3], b: { c: 'x' } }
    expect(decodeMsgpack(enc(v))).toEqual(v)
  })

  it('解码列式包结构（与 fromJSON 期望同构）', () => {
    const pkg = {
      datasetId: 'zmc_test',
      columns: ['id', 'name', 'amount'],
      rows: [
        [1001, 'a', '1130000.5000'],
        [1002, 'b', null],
      ],
      childRows: {
        1001: { lines: { datasetId: 'ln', columns: ['id'], rows: [[1]] } },
      },
    }
    const decoded = decodeMsgpack(enc(pkg))
    expect(decoded.datasetId).toBe('zmc_test')
    expect(decoded.columns).toEqual(['id', 'name', 'amount'])
    expect(decoded.rows.length).toBe(2)
    expect(decoded.rows[0]).toEqual([1001, 'a', '1130000.5000'])
    expect(decoded.rows[1][2]).toBe(null)
    expect(decoded.childRows['1001'].lines.rows[0][0]).toBe(1)
  })
})
