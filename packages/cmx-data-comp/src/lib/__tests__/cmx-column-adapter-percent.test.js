import { describe, it, expect } from 'vitest'
import { parseColWidth, CmxColumnAdapter } from '../cmx-column-adapter.js'

describe('parseColWidth — 列宽格式解析', () => {
  it('像素 / 纯数字 → { size }', () => {
    expect(parseColWidth('120px')).toEqual({ size: 120 })
    expect(parseColWidth('100')).toEqual({ size: 100 })
    expect(parseColWidth(80)).toEqual({ size: 80 })
  })

  it('百分比 → { percent }（保留数值，不再返回 _flex 死标记）', () => {
    expect(parseColWidth('20%')).toEqual({ percent: 20 })
    expect(parseColWidth('33.5%')).toEqual({ percent: 33.5 })
    expect(parseColWidth('100%')).toEqual({ percent: 100 })
  })

  it("'flex' → { flex: true }", () => {
    expect(parseColWidth('flex')).toEqual({ flex: true })
  })

  it('对象 { size, min, max } → { size, minSize, maxSize }', () => {
    expect(parseColWidth({ size: 100, min: 50, max: 200 })).toEqual({ size: 100, minSize: 50, maxSize: 200 })
    expect(parseColWidth({ min: 40 })).toEqual({ minSize: 40 })
  })

  it('null / 无法识别 → null', () => {
    expect(parseColWidth(null)).toBeNull()
    expect(parseColWidth('abc')).toBeNull()
    expect(parseColWidth('fr')).toBeNull()
  })
})

describe('CmxColumnAdapter._leafDescriptorToRevoCol — 百分比 / flex 标记挂载', () => {
  it("width:'20%' → col._cmxPercent === 20（不设 size）", () => {
    const col = CmxColumnAdapter._leafDescriptorToRevoCol({ id: 'a', caption: 'A', width: '20%' })
    expect(col._cmxPercent).toBe(20)
    expect(col.size).toBeUndefined()
  })

  it("width:'flex' → col._cmxFlex === true（不设 size）", () => {
    const col = CmxColumnAdapter._leafDescriptorToRevoCol({ id: 'b', caption: 'B', width: 'flex' })
    expect(col._cmxFlex).toBe(true)
    expect(col.size).toBeUndefined()
    expect(col._cmxPercent).toBeUndefined()
  })

  it("width:'120px' → col.size === 120（不挂 percent/flex）", () => {
    const col = CmxColumnAdapter._leafDescriptorToRevoCol({ id: 'c', caption: 'C', width: '120px' })
    expect(col.size).toBe(120)
    expect(col._cmxPercent).toBeUndefined()
    expect(col._cmxFlex).toBeUndefined()
  })

  it('不设 width → 无尺寸字段、无标记', () => {
    const col = CmxColumnAdapter._leafDescriptorToRevoCol({ id: 'd', caption: 'D' })
    expect(col.size).toBeUndefined()
    expect(col._cmxPercent).toBeUndefined()
    expect(col._cmxFlex).toBeUndefined()
  })
})
