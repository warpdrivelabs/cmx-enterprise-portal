// cmx-deep-clone 单元测试：收敛四处旧副本（clonePlain/cloneJson/clone/cloneArray）后的行为契约。

import { describe, it, expect } from 'vitest'
import { deepClone, deepCloneArray } from '../cmx-deep-clone.js'

describe('deepClone', () => {
  it('null / undefined 原样透传', () => {
    expect(deepClone(null)).toBeNull()
    expect(deepClone(undefined)).toBeUndefined()
  })

  it('嵌套对象/数组深拷贝且引用独立', () => {
    const src = { a: 1, b: { c: [1, 2, { d: 'x' }] } }
    const out = deepClone(src)
    expect(out).toEqual(src)
    expect(out).not.toBe(src)
    expect(out.b).not.toBe(src.b)
    expect(out.b.c).not.toBe(src.b.c)
    out.b.c[2].d = 'changed'
    expect(src.b.c[2].d).toBe('x')
  })

  it('原始类型返回相等值', () => {
    expect(deepClone('s')).toBe('s')
    expect(deepClone(0)).toBe(0)
    expect(deepClone(false)).toBe(false)
  })

  it('structuredClone 路径保留富类型（Date）', () => {
    const src = { at: new Date('2026-09-01T00:00:00Z') }
    const out = deepClone(src)
    expect(out.at).toBeInstanceOf(Date)
    expect(out.at.getTime()).toBe(src.at.getTime())
    expect(out.at).not.toBe(src.at)
  })

  it('structuredClone 不可用时回退 JSON 往返', () => {
    const saved = globalThis.structuredClone
    // @ts-expect-error 模拟无 structuredClone 的环境
    globalThis.structuredClone = undefined
    try {
      const src = { a: { b: 1 } }
      const out = deepClone(src)
      expect(out).toEqual(src)
      expect(out.a).not.toBe(src.a)
    } finally {
      globalThis.structuredClone = saved
    }
  })
})

describe('deepCloneArray', () => {
  it('数组深拷贝、引用独立', () => {
    const src = [{ id: 1 }, { id: 2 }]
    const out = deepCloneArray(src)
    expect(out).toEqual(src)
    expect(out[0]).not.toBe(src[0])
    out[0].id = 99
    expect(src[0].id).toBe(1)
  })

  it('非数组输入归一为 []（原 cloneArray 容错语义）', () => {
    expect(deepCloneArray(null)).toEqual([])
    expect(deepCloneArray(undefined)).toEqual([])
    expect(deepCloneArray('nope')).toEqual([])
    expect(deepCloneArray({ a: 1 })).toEqual([])
  })
})
