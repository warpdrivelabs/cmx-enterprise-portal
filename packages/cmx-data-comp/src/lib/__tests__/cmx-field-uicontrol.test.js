import { describe, it, expect } from 'vitest'
import { EDIT_MODES, editModeKind, toEditMode, uiControlOptions } from '../cmx-field-uicontrol.js'

describe('cmx-field-uicontrol — 录入控件统一值域', () => {
  it('规范值原样返回', () => {
    for (const m of EDIT_MODES) expect(toEditMode(m)).toBe(m)
  })
  it('旧 uiControl 不再兼容，回退到 fallback', () => {
    expect(toEditMode('text-edit')).toBe('cmx-text-input')
    expect(toEditMode('number')).toBe('cmx-text-input')
    expect(toEditMode('date')).toBe('cmx-text-input')
    expect(toEditMode('datetime')).toBe('cmx-text-input')
    expect(toEditMode('dict-select')).toBe('cmx-text-input')
    expect(toEditMode('enum-select', '')).toBe('')
  })
  it('空/未知回退 fallback', () => {
    expect(toEditMode('')).toBe('cmx-text-input')
    expect(toEditMode(undefined)).toBe('cmx-text-input')
    expect(toEditMode('zzz', '')).toBe('')
  })
  it('新下拉值映射到运行时编辑器语义', () => {
    expect(editModeKind('cmx-text-input')).toBe('input')
    expect(editModeKind('cmx-number-input')).toBe('number')
    expect(editModeKind('cmx-date-input')).toBe('date')
    expect(editModeKind('cmx-datetime-input')).toBe('datetime')
    expect(editModeKind('cmx-dict-select')).toBe('dict-select')
  })
  it('uiControlOptions 返回 {value,label} 且覆盖全值域', () => {
    const opts = uiControlOptions()
    expect(opts.length).toBe(EDIT_MODES.length)
    expect(opts.every((o) => o.value && o.label)).toBe(true)
  })
})
