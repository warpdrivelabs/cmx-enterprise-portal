// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { CmxTabulator } from '../cmx-tabulator.js'

/**
 * Tabulator 的实时渲染依赖真实布局测量，jsdom 跑不起来（同 cmx-web-treeview 用例只测纯方法）。
 * 这里只验证 cmx-tabulator 的纯翻译方法：cmx 级 tree 选项 → Tabulator dataTree*、
 * 扁平→嵌套数据、图标 formatter、start-expanded 解析——都不需要 mount 活表。
 */
describe('cmx-tabulator · treegrid 选项翻译', () => {
  const make = (opts = {}, columns = []) => {
    const el = new CmxTabulator()
    el._columns = columns
    el._opts = { ...el._opts, ...opts }
    return el
  }

  it('列宽 "300px" 归一为数字 300（Tabulator 把 NaN 宽度当百分比 → px 字符串会爆成 300% 表宽）', () => {
    const el = make({}, [
      { field: 'name', width: '300px' },
      { field: 'code', width: '140px' },
      { field: 'pct', width: '20%' },
      { field: 'flex', width: 'flex' },
      { field: 'num', width: 200 },
    ])
    const cols = el._tabulatorColumns()
    const byField = Object.fromEntries(cols.map((c) => [c.field, c]))
    expect(byField.name.width).toBe(300)         // 数字像素，不是 "300px"
    expect(typeof byField.name.width).toBe('number')
    expect(byField.code.width).toBe(140)
    expect(byField.pct.width).toBe('20%')        // 百分比保留给 Tabulator 原生处理
    expect('width' in byField.flex).toBe(false)  // 'flex' → 删除（自动分配）
    expect(byField.num.width).toBe(200)
  })

  it('把 cmx 级 tree 选项翻译为 Tabulator dataTree*，并剔除 cmx 专属键', () => {
    const el = make(
      { dataTree: true, parentField: 'parentId', treeColumn: 'name', treeStartExpanded: 1, index: 'id' },
      [{ field: 'name' }, { field: 'code' }],
    )
    el._rows = [
      { id: '1', parentId: null, name: 'root' },
      { id: '1-1', parentId: '1', name: 'child' },
    ]
    const o = el._tabulatorOptions()
    expect(o.dataTree).toBe(true)
    expect(o.dataTreeElementColumn).toBe('name')
    // 数字 N → function（Tabulator 不支持纯数字），不能再是裸 1
    expect(typeof o.dataTreeStartExpanded).toBe('function')
    expect(o.dataTreeChildField).toBe('_children')
    expect('parentField' in o).toBe(false)
    expect('treeColumn' in o).toBe(false)
    expect('treeStartExpanded' in o).toBe(false)
  })

  it('treeStartExpanded 数字 N 翻译为 function：level<N 展开（Tabulator 不支持纯数字）', () => {
    const el = make({ dataTree: true, treeStartExpanded: 2 }, [{ field: 'name' }])
    el._rows = [{ id: 'a', parentId: null }]
    const fn = el._tabulatorOptions().dataTreeStartExpanded
    expect(typeof fn).toBe('function')
    expect(fn(null, 0)).toBe(true)   // 根层展开
    expect(fn(null, 1)).toBe(true)   // 第 2 层展开
    expect(fn(null, 2)).toBe(false)  // 第 3 层折叠
  })

  it('treeStartExpanded boolean / function / 数组 原样透传', () => {
    expect(make({ dataTree: true, treeStartExpanded: true }, [{ field: 'n' }])._tabulatorOptions().dataTreeStartExpanded).toBe(true)
    const f = () => true
    expect(make({ dataTree: true, treeStartExpanded: f }, [{ field: 'n' }])._tabulatorOptions().dataTreeStartExpanded).toBe(f)
    const arr = [true, false]
    expect(make({ dataTree: true, treeStartExpanded: arr }, [{ field: 'n' }])._tabulatorOptions().dataTreeStartExpanded).toBe(arr)
  })

  it('树列默认取第一列（未显式 treeColumn 时）', () => {
    const el = make({ dataTree: true }, [{ field: 'label' }, { field: 'x' }])
    el._rows = [{ id: 'a' }]
    expect(el._tabulatorOptions().dataTreeElementColumn).toBe('label')
  })

  it('非树模式 dataTree=false，data 原样（不重建嵌套）', () => {
    const el = make({ dataTree: false }, [{ field: 'name' }])
    el._rows = [{ id: '1', parentId: null }, { id: '2', parentId: '1' }]
    const o = el._tabulatorOptions()
    expect(o.dataTree).toBe(false)
    expect(o.data[1]._children).toBeUndefined()
  })

  it('_treeRows 把扁平行按 parentField 归一为嵌套数组', () => {
    const el = make({ dataTree: true, parentField: 'parentId', index: 'id' })
    el._rows = [
      { id: '1', parentId: null, name: 'r' },
      { id: '1-1', parentId: '1', name: 'c' },
      { id: '1-1-1', parentId: '1-1', name: 'g' },
    ]
    const nested = el._treeRows()
    expect(nested).toHaveLength(1)
    expect(nested[0]._children[0]._children[0].id).toBe('1-1-1')
  })
})

describe('cmx-tabulator · 树列图标 formatter', () => {
  it('iconField 存在时给树列叠加 <ui5-icon> 前缀 formatter', () => {
    const el = new CmxTabulator()
    el._iconField = 'icon'
    el._opts = { ...el._opts, dataTree: true, treeColumn: 'name' }
    el._columns = [{ field: 'name', title: 'N' }]
    const cols = el._tabulatorColumns()
    const target = cols.find((c) => c.field === 'name')
    expect(typeof target.formatter).toBe('function')

    const cell = {
      getValue: () => '财务中心',
      getRow: () => ({ getData: () => ({ icon: 'building', name: '财务中心' }) }),
    }
    const html = target.formatter(cell)
    expect(html).toContain('<ui5-icon name="building"')
    expect(html).toContain('财务中心')
  })

  it('formatter 对单元格文本做 HTML 转义，杜绝注入', () => {
    const el = new CmxTabulator()
    el._iconField = 'icon'
    el._opts = { ...el._opts, dataTree: true, treeColumn: 'name' }
    el._columns = [{ field: 'name' }]
    const cols = el._tabulatorColumns()
    const cell = {
      getValue: () => '<img src=x onerror=alert(1)>',
      getRow: () => ({ getData: () => ({ icon: '', name: 'x' }) }),
    }
    const html = cols[0].formatter(cell)
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })

  it('无 iconField 时不叠加 formatter（保持列原样）', () => {
    const el = new CmxTabulator()
    el._iconField = ''
    el._opts = { ...el._opts, dataTree: true }
    el._columns = [{ field: 'name' }]
    expect(el._tabulatorColumns()[0].formatter).toBeUndefined()
  })
})

describe('cmx-tabulator · start-expanded 解析', () => {
  const parse = (raw) => new CmxTabulator()._parseStartExpanded(raw)

  it('布尔字符串', () => {
    expect(parse('true')).toBe(true)
    expect(parse('false')).toBe(false)
  })

  it('数字 → 展开前 N 层', () => {
    expect(parse('2')).toBe(2)
  })

  it('JSON 数组 → 指定层级', () => {
    expect(parse('[0,2]')).toEqual([0, 2])
  })

  it('非法值兜底 false', () => {
    expect(parse('garbage')).toBe(false)
    expect(parse('')).toBe(true) // 空 = 出现即开启
  })
})
