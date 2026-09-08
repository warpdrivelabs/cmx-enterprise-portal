import { describe, it, expect } from 'vitest'
import { metaTableFieldsToColumns } from '../init-page-models.js'

/**
 * metaTableFieldsToColumns 把已声明元数据模型（CmxDOCMeta/CmxDCTMeta）中某张表的字段
 * 转成 CmxColumn[]。重点验证：id/fieldName → name 映射、i18n caption 解析、isPrimaryKey 推断、
 * refDict 派生 cmx-dict-select 控件、系统列只读、dataType/refDict/display 透传。
 */
describe('metaTableFieldsToColumns — 元数据字段转列', () => {
  it('id/fieldName → name：优先 fieldName，兜底 id', () => {
    const cols = metaTableFieldsToColumns([
      { fieldName: 'code', dataType: 'VARCHAR' },
      { id: 'amount', dataType: 'DECIMAL' },
    ], 'DOC')
    expect(cols.map((c) => c.id)).toEqual(['code', 'amount'])
  })

  it('i18n caption 对象解析为当前语言字符串', () => {
    const cols = metaTableFieldsToColumns([
      { id: 'name', dataType: 'VARCHAR', caption: { zh_CN: '名称', en_US: 'Name' } },
    ], 'DOC')
    expect(typeof cols[0].caption).toBe('string')
    expect(cols[0].caption).toBe('名称')
  })

  it('caption 缺失时兜底字段名', () => {
    const cols = metaTableFieldsToColumns([
      { id: 'code', dataType: 'VARCHAR' },
    ], 'DOC')
    expect(cols[0].caption).toBe('code')
  })

  it('isPrimaryKey 推断：id 列视为主键', () => {
    const cols = metaTableFieldsToColumns([
      { id: 'id', dataType: 'BIGINT' },
      { id: 'code', dataType: 'VARCHAR' },
    ], 'DOC')
    // 主键列 id 应为只读（edit.mode === 'readonly'）
    expect(cols.find((c) => c.id === 'id').edit.mode).toBe('readonly')
  })

  it('refDict 派生 cmx-dict-select 录入控件', () => {
    const cols = metaTableFieldsToColumns([
      { id: 'comp_unit_id', dataType: 'BIGINT', refDict: 'comp_unit', displayField: 'name' },
    ], 'DOC')
    expect(cols[0].edit.mode).toBe('cmx-dict-select')
    // refDict/displayField 透传到列顶层
    expect(cols[0].refDict).toBe('comp_unit')
    expect(cols[0].displayField).toBe('name')
  })

  it('普通业务列按 dataType 推断录入控件', () => {
    const cols = metaTableFieldsToColumns([
      { id: 'amt', dataType: 'DECIMAL' },
      { id: 'd1', dataType: 'DATE' },
      { id: 'txt', dataType: 'VARCHAR' },
    ], 'DOC')
    expect(cols.find((c) => c.id === 'amt').edit.mode).toBe('cmx-number-input')
    expect(cols.find((c) => c.id === 'd1').edit.mode).toBe('cmx-date-input')
    expect(cols.find((c) => c.id === 'txt').edit.mode).toBe('cmx-text-input')
  })

  it('dataType 透传', () => {
    const cols = metaTableFieldsToColumns([
      { id: 'amt', dataType: 'DECIMAL' },
      { id: 'nm', dataType: 'VARCHAR' },
    ], 'DOC')
    expect(cols.find((c) => c.id === 'amt').dataType).toBe('DECIMAL')
    expect(cols.find((c) => c.id === 'nm').dataType).toBe('VARCHAR')
  })

  it('display 结构透传', () => {
    const cols = metaTableFieldsToColumns([
      { id: 'amt', dataType: 'DECIMAL', display: { mode: 'number', decimalDigits: 2 } },
    ], 'DOC')
    expect(cols[0].display).toEqual({ mode: 'number', decimalDigits: 2 })
  })

  it('DCT 用 DCT 系统列集：parent_id/level_no 等分级列排到末尾且只读', () => {
    const cols = metaTableFieldsToColumns([
      { id: 'parent_id', dataType: 'BIGINT' },
      { id: 'code', dataType: 'VARCHAR' },
      { id: 'level_no', dataType: 'INT' },
    ], 'DCT')
    // 业务列 code 应排在系统列 parent_id 之前
    expect(cols.map((c) => c.id).indexOf('code')).toBeLessThan(cols.map((c) => c.id).indexOf('parent_id'))
    // 系统列只读
    expect(cols.find((c) => c.id === 'parent_id').edit.mode).toBe('readonly')
    expect(cols.find((c) => c.id === 'level_no').edit.mode).toBe('readonly')
  })

  it('空字段数组返回空数组', () => {
    expect(metaTableFieldsToColumns([], 'DOC')).toEqual([])
    expect(metaTableFieldsToColumns(undefined, 'DOC')).toEqual([])
  })
})
