/**
 * cmx-doc-stream 单测：长度分帧解析器 + 与后端协议往返同构。
 * 后端帧：[u32 大端 len][payload]；header {datasetId,columns} + N row [值...] + end(len=0)。
 */
import { describe, it, expect } from 'vitest'
import { FrameStreamParser } from '../cmx-doc-stream.js'

// 用最小 msgpack 编码器造 payload（仅测试用，覆盖 map/array/str/int/nil）
function enc (v) { const o = []; w(o, v); return new Uint8Array(o) }
function w (o, v) {
  if (v === null) { o.push(0xc0); return }
  if (typeof v === 'number' && Number.isInteger(v)) {
    if (v >= 0 && v <= 0x7f) { o.push(v); return }
    o.push(0xd3); const b = new ArrayBuffer(8); new DataView(b).setBigInt64(0, BigInt(v)); o.push(...new Uint8Array(b)); return
  }
  if (typeof v === 'string') { const by = new TextEncoder().encode(v); if (by.length <= 31) o.push(0xa0 | by.length); else { o.push(0xdb); const bb = new ArrayBuffer(4); new DataView(bb).setUint32(0, by.length); o.push(...new Uint8Array(bb)) } o.push(...by); return }
  if (Array.isArray(v)) { if (v.length <= 15) o.push(0x90 | v.length); else { o.push(0xdd); const bb = new ArrayBuffer(4); new DataView(bb).setUint32(0, v.length); o.push(...new Uint8Array(bb)) } for (const x of v) w(o, x); return }
  if (typeof v === 'object') { const k = Object.keys(v); if (k.length <= 15) o.push(0x80 | k.length); else { o.push(0xdf); const bb = new ArrayBuffer(4); new DataView(bb).setUint32(0, k.length); o.push(...new Uint8Array(bb)) } for (const kk of k) { w(o, kk); w(o, v[kk]) } return }
  throw new Error('unsupported')
}

/** 把一个 payload 包成帧 [u32 len][payload]（大端，与后端 push_frame 一致）。 */
function frame (payload) {
  const out = new Uint8Array(4 + payload.length)
  new DataView(out.buffer).setUint32(0, payload.length, false)
  out.set(payload, 4)
  return out
}
function endFrame () { const out = new Uint8Array(4); new DataView(out.buffer).setUint32(0, 0, false); return out }

function concat (...arrs) {
  const total = arrs.reduce((n, a) => n + a.length, 0)
  const out = new Uint8Array(total); let o = 0
  for (const a of arrs) { out.set(a, o); o += a.length }
  return out
}

describe('FrameStreamParser', () => {
  it('一次喂完整流：header + 2 row + end', () => {
    const stream = concat(
      frame(enc({ datasetId: 't', columns: ['id', 'name'] })),
      frame(enc([1, 'a'])),
      frame(enc([2, 'b'])),
      endFrame(),
    )
    const p = new FrameStreamParser()
    p.push(stream)
    const frames = []
    let f
    while ((f = p.next()) !== null) frames.push(f)
    expect(frames.length).toBe(4)
    expect(frames[3].end).toBe(true)
  })

  it('跨块边界安全：把流切成任意小块逐块喂', () => {
    const stream = concat(
      frame(enc({ datasetId: 't', columns: ['id'] })),
      frame(enc([100])),
      frame(enc([200])),
      endFrame(),
    )
    const p = new FrameStreamParser()
    const collected = []
    // 每次喂 3 字节
    for (let i = 0; i < stream.length; i += 3) {
      p.push(stream.subarray(i, i + 3))
      let f
      while ((f = p.next()) !== null) collected.push(f)
    }
    // header + 2 row + end
    expect(collected.length).toBe(4)
    expect(collected[collected.length - 1].end).toBe(true)
  })

  it('不足一帧返回 null（等更多字节）', () => {
    const p = new FrameStreamParser()
    p.push(new Uint8Array([0, 0, 0])) // 不足 4 字节长度头
    expect(p.next()).toBeNull()
    // 补齐长度头 len=5，但 payload 只到 2 字节 → 仍不足一帧
    p.push(new Uint8Array([5, 0xa1, 0x78])) // 现总缓冲 [0,0,0,5, 0xa1,0x78] = len 5, payload 只有 2
    expect(p.next()).toBeNull()
    // 补足剩余 3 字节 payload → 得到完整帧
    p.push(new Uint8Array([0x79, 0x7a, 0x7b]))
    const f = p.next()
    expect(f).not.toBeNull()
    expect(f.end).toBe(false)
    expect(f.payload.length).toBe(5)
  })
})
