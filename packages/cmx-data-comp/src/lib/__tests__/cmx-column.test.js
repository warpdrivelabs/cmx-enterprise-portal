import { describe, it, expect } from 'vitest'
import { CmxColumn } from '../cmx-column.js'

describe('CmxColumn — editSettings 保留与字典配置透传', () => {
  it('构造后实例保留原始 editSettings（供运行时字典数据源读 coord）', () => {
    const col = new CmxColumn({
      id: 'comp_unit_id',
      caption: { zh_CN: '公司代码' },
      dataType: 'BIGINT',
      refDict: 'comp_unit',
      edit: { mode: 'cmx-dict-select' },
      editSettings: { dictCode: 'comp_unit', coord: { domain: 'fi', application: 'cmxfico', module: 'gl' } },
    })
    // editSettings 原样保留在实例上（createRestDictDataSource 经 fieldFromGridCellProps 读 cmxCol.editSettings.coord）
    expect(col.editSettings).toEqual({ dictCode: 'comp_unit', coord: { domain: 'fi', application: 'cmxfico', module: 'gl' } })
  })

  it('editSettings 缺失时实例 editSettings 为 undefined（非字典列）', () => {
    const col = new CmxColumn({ id: 'name', dataType: 'VARCHAR' })
    expect(col.editSettings).toBeUndefined()
  })

  it('editSettings 被 _normalizeEdit 合并进 edit（coord 在 edit 里），同时 editSettings 原值独立保留', () => {
    const es = { dictCode: 'comp_unit', coord: { domain: 'fi', application: 'cmxfico', module: 'gl' } }
    const col = new CmxColumn({
      id: 'comp_unit_id',
      edit: { mode: 'cmx-dict-select' },
      editSettings: es,
    })
    // edit 合并后含 coord（_normalizeEdit: { ...es, ...edit }）
    expect(col.edit.coord).toEqual({ domain: 'fi', application: 'cmxfico', module: 'gl' })
    expect(col.edit.mode).toBe('cmx-dict-select')
    // editSettings 原值仍独立可访问（不因合并而丢失）
    expect(col.editSettings).toBe(es)
  })

  it('refDict / refField / displayField 透传到实例顶层（字典回显/写回用）', () => {
    const col = new CmxColumn({
      id: 'comp_unit_id',
      refDict: 'comp_unit',
      refField: 'id',
      displayField: 'code',
    })
    expect(col.refDict).toBe('comp_unit')
    expect(col.refField).toBe('id')
    expect(col.displayField).toBe('code')
  })

  it('toJSON 输出 editSettings（序列化往返不丢字典配置）', () => {
    const col = new CmxColumn({
      id: 'comp_unit_id',
      refDict: 'comp_unit',
      edit: { mode: 'cmx-dict-select' },
      editSettings: { coord: { domain: 'fi', application: 'cmxfico', module: 'gl' } },
    })
    const json = col.toJSON()
    expect(json.editSettings).toEqual({ coord: { domain: 'fi', application: 'cmxfico', module: 'gl' } })
    // 反序列化重建后仍能拿到 editSettings
    const rebuilt = new CmxColumn(json)
    expect(rebuilt.editSettings).toEqual({ coord: { domain: 'fi', application: 'cmxfico', module: 'gl' } })
  })

  it('cellTemplate / cellProperties 经 toDescriptor 透传（grid 自定义渲染走通）', () => {
    const cellTemplate = (h, props) => h('span', {}, String(props.model?.id ?? ''))
    const cellProperties = () => ({ style: { color: 'red' } })
    const col = new CmxColumn({ id: 'id', caption: 'ID', dataType: 'VARCHAR', cellTemplate, cellProperties })
    // 完整继承挂在实例顶层
    expect(col.cellTemplate).toBe(cellTemplate)
    expect(col.cellProperties).toBe(cellProperties)
    // toDescriptor 输出，供 _leafDescriptorToRevoCol 读到
    const d = col.toDescriptor()
    expect(d.cellTemplate).toBe(cellTemplate)
    expect(d.cellProperties).toBe(cellProperties)
  })

  it('未挂 cellTemplate 的列 toDescriptor 不输出该键（不污染 descriptor）', () => {
    const col = new CmxColumn({ id: 'name', dataType: 'VARCHAR' })
    const d = col.toDescriptor()
    expect(d.cellTemplate).toBeUndefined()
    expect(d.cellProperties).toBeUndefined()
  })
})
