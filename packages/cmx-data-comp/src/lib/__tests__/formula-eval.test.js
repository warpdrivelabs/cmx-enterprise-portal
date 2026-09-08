import { describe, it, expect } from 'vitest'
import { evalFormula, compileFormula } from '../formula-eval.js'

describe('evalFormula — 字面量与算术', () => {
  it('求值基本算术', () => {
    expect(evalFormula('1 + 2 * 3', {})).toBe(7)
    expect(evalFormula('(1 + 2) * 3', {})).toBe(9)
    expect(evalFormula('-5 + 2', {})).toBe(-3)
  })

  it('字段引用，缺失字段按 0 处理', () => {
    expect(evalFormula('unitPrice * quantity', { unitPrice: 10, quantity: 3 })).toBe(30)
    expect(evalFormula('unitPrice * quantity', {})).toBe(0)
  })

  it('比较与逻辑求值为布尔', () => {
    expect(evalFormula('quantity > 0', { quantity: 5 })).toBe(true)
    expect(evalFormula('quantity > 0', { quantity: 0 })).toBe(false)
    expect(evalFormula('a > 0 && b < 10', { a: 1, b: 5 })).toBe(true)
  })

  it('白名单函数', () => {
    expect(evalFormula('ROUND(3.14159, 2)', {})).toBe(3.14)
    expect(evalFormula('ABS(-7)', {})).toBe(7)
    expect(evalFormula('MAX(1, 9, 4)', {})).toBe(9)
    expect(evalFormula('IF(x > 0, 1, -1)', { x: 5 })).toBe(1)
  })

  it('fallback：非法表达式返回 fallback', () => {
    expect(evalFormula('@@@', {}, 42)).toBe(42)
  })
})

describe('compileFormula — 预编译复用', () => {
  it('编译后可多次对不同 scope 求值', () => {
    const fn = compileFormula('a + b')
    expect(fn({ a: 1, b: 2 })).toBe(3)
    expect(fn({ a: 10, b: 20 })).toBe(30)
  })

  it('非法语法编译时抛错（供校验器静态检查）', () => {
    expect(() => compileFormula('1 +')).toThrow()
  })
})
