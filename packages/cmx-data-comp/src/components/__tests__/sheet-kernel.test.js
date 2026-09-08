// M6：择核开关（sheet-kernel）默认行为回归 —— M6 E2E 绿后默认翻到 mega（自研内核）。
import { describe, it, expect, afterEach } from 'vitest'
import { resolveSheetKernel } from '../spreadjs/sheet-kernel.js'

afterEach(() => { try { delete globalThis.__CMX_SHEET_KERNEL__ } catch (_) {} })

describe('resolveSheetKernel 择核开关', () => {
  it('无任何 flag → 默认 mega（自研内核）', () => {
    delete globalThis.__CMX_SHEET_KERNEL__
    expect(resolveSheetKernel()).toBe('mega')
  })

  it('globalThis.__CMX_SHEET_KERNEL__="spreadjs" → spreadjs（可回退商业核）', () => {
    globalThis.__CMX_SHEET_KERNEL__ = 'spreadjs'
    expect(resolveSheetKernel()).toBe('spreadjs')
  })

  it('非法值被忽略，回落默认 mega', () => {
    globalThis.__CMX_SHEET_KERNEL__ = 'nonsense'
    expect(resolveSheetKernel()).toBe('mega')
  })
})
