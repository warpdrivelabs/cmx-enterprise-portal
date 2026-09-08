import { describe, it, expect, vi } from 'vitest'
import { CmxDataSet } from '../cmx-data-set.js'
import { CmxDataSetView, buildPredicate } from '../cmx-data-set-view.js'

function master () {
  const ds = new CmxDataSet({ datasetId: 'master' })
  ds.setRows([
    { id: '1', code: '1001', name: '库存现金', status: 1, type: 'asset', amount: 100 },
    { id: '2', code: '2001', name: '应付账款', status: 0, type: 'liability', amount: 50 },
    { id: '3', code: '1002', name: '银行存款', status: 1, type: 'asset', amount: 300 },
    { id: '4', code: '6601', name: '销售费用', status: 1, type: 'expense', amount: 20 },
  ])
  return ds
}

// 整数主键（后端 BIGINT → JS number）回归：_index key 统一 String 化后，
// getRow/removeRow 无论入参 number 还是 string 都应命中同一行（修复"有数据行删不掉"）。
describe('CmxDataSet — 整数主键兼容（_index key 统一 String）', () => {
  it('setRows 用 number id，getRow 按 number / string 都能取到', () => {
    const ds = new CmxDataSet({ datasetId: 'pk' })
    ds.setRows([{ id: 53399965929472, name: '行A' }, { id: 53399965929473, name: '行B' }])
    expect(ds.getRow(53399965929472).name).toBe('行A')      // number 入参
    expect(ds.getRow('53399965929472').name).toBe('行A')    // string 入参（getSelectedIds 返回 string）
    expect(ds.length).toBe(2)
  })

  it('removeRow 按 string 删 number 主键行（getSelectedIds → ds.removeRow 链路）', () => {
    const ds = new CmxDataSet({ datasetId: 'pk' })
    ds.setRows([{ id: 53399965929472, name: '行A' }, { id: 53399965929473, name: '行B' }])
    const removed = ds.removeRow('53399965929472')           // string 入参删 number 主键行
    expect(removed).not.toBeNull()
    expect(ds.length).toBe(1)
    expect(ds.getRow(53399965929472)).toBeNull()             // 已删
    expect(ds.rows.map((r) => r.id)).toEqual([53399965929473])
  })
})

describe('CmxDataSetView — 零拷贝引用', () => {
  it('视图行是主集 CmxRowSet 的同一引用（不复制数据）', () => {
    const ds = master()
    const view = ds.createView({ col: 'type', op: 'eq', value: 'asset' })
    expect(view).toBeInstanceOf(CmxDataSetView)
    expect(view.rows.map((r) => r.id)).toEqual(['1', '3'])
    // 引用同一性：view.getRow 与 master.getRow 是同一对象
    expect(view.getRow('1')).toBe(ds.getRow('1'))
    expect(view.rows[0]).toBe(ds.rows[0])
    // 没有 new 出新 CmxRowSet：改主集行字段，视图行同步可见（同一对象）
    ds.getRow('3').name = '银行存款(改)'
    expect(view.getRow('3').name).toBe('银行存款(改)')
  })

  it('isView 标记 + master 指向 + 不改 row._ds（所有权留主集）', () => {
    const ds = master()
    const view = ds.createView(() => true)
    expect(view.isView).toBe(true)
    expect(view.master).toBe(ds)
    // 行的 _ds 仍指向主集，不被视图篡改
    expect(ds.getRow('1')._ds).toBe(ds)
  })
})

describe('CmxDataSetView — 声明式条件 buildPredicate', () => {
  const ds = master()
  it('eq / ne / in / contains / between / gt', () => {
    expect(ds.createView({ col: 'status', op: 'eq', value: 1 }).rows.length).toBe(3)
    expect(ds.createView({ col: 'status', op: 'ne', value: 1 }).rows.length).toBe(1)
    expect(ds.createView({ col: 'type', op: 'in', value: ['asset', 'expense'] }).rows.length).toBe(3)
    expect(ds.createView({ col: 'name', op: 'contains', value: '存款' }).rows.map((r) => r.id)).toEqual(['3'])
    expect(ds.createView({ col: 'amount', op: 'between', value: [40, 150] }).rows.map((r) => r.id)).toEqual(['1', '2'])
    expect(ds.createView({ col: 'amount', op: 'gt', value: 100 }).rows.map((r) => r.id)).toEqual(['3'])
  })

  it('match all(AND) / any(OR) 组合', () => {
    const andV = ds.createView({ match: 'all', conditions: [
      { col: 'status', op: 'eq', value: 1 }, { col: 'type', op: 'eq', value: 'asset' },
    ] })
    expect(andV.rows.map((r) => r.id)).toEqual(['1', '3'])
    const orV = ds.createView({ match: 'any', conditions: [
      { col: 'type', op: 'eq', value: 'liability' }, { col: 'type', op: 'eq', value: 'expense' },
    ] })
    expect(orV.rows.map((r) => r.id)).toEqual(['2', '4'])
  })

  it('op:expr 走 formula-eval（行字段铺平 + value）', () => {
    const v = ds.createView({ col: 'amount', op: 'expr', value: 'amount >= 100 && status == 1' })
    expect(v.rows.map((r) => r.id)).toEqual(['1', '3'])
  })

  it('函数 predicate 直接可用', () => {
    const v = ds.createView((row) => row.amount > 50)
    expect(v.rows.map((r) => r.id)).toEqual(['1', '3'])
  })

  it('buildPredicate 单独导出可用', () => {
    const pred = buildPredicate({ col: 'status', op: 'eq', value: 0 })
    expect(pred({ status: 0 })).toBe(true)
    expect(pred({ status: 1 })).toBe(false)
  })
})

describe('CmxDataSetView — live 同步（编辑/增/删自动重过滤）', () => {
  it('编辑主集行使其命中/不命中之间翻转 → 视图加入/移出', () => {
    const ds = master()
    const view = ds.createView({ col: 'type', op: 'eq', value: 'asset' }) // 1,3
    expect(view.rows.map((r) => r.id)).toEqual(['1', '3'])
    // 把 #2 改成 asset → 应加入视图
    ds.getRow('2').set('type', 'asset')
    expect(view.rows.map((r) => r.id).sort()).toEqual(['1', '2', '3'])
    // 把 #1 改成 liability → 应移出视图
    ds.getRow('1').set('type', 'liability')
    expect(view.rows.map((r) => r.id).sort()).toEqual(['2', '3'])
  })

  it('仍命中时透传 row-changed（grid 刷新单元格）', () => {
    const ds = master()
    const view = ds.createView({ col: 'type', op: 'eq', value: 'asset' })
    const spy = vi.fn()
    view.addEventListener('row-changed', spy)
    ds.getRow('1').set('amount', 999)   // 仍是 asset，仍命中 → 透传
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0].detail.key).toBe('amount')
  })

  it('主集 addRow：命中则纳入视图并派发 ds-row-added', () => {
    const ds = master()
    const view = ds.createView({ col: 'type', op: 'eq', value: 'asset' })
    const spy = vi.fn()
    view.addEventListener('ds-row-added', spy)
    ds.addRow({ id: '5', name: '其他货币资金', type: 'asset', status: 1 })
    expect(view.getRow('5')).toBe(ds.getRow('5'))
    expect(spy).toHaveBeenCalled()
    // 不命中的新行不纳入
    ds.addRow({ id: '6', name: '短期借款', type: 'liability', status: 1 })
    expect(view.getRow('6')).toBeNull()
  })

  it('主集 removeRow：移出视图引用并派发 ds-row-removed', () => {
    const ds = master()
    const view = ds.createView({ col: 'type', op: 'eq', value: 'asset' }) // 1,3
    const spy = vi.fn()
    view.addEventListener('ds-row-removed', spy)
    ds.removeRow('1')
    expect(view.getRow('1')).toBeNull()
    expect(view.rows.map((r) => r.id)).toEqual(['3'])
    expect(spy).toHaveBeenCalled()
  })

  it('live=false 不自动同步（需手动 refilter）', () => {
    const ds = master()
    const view = ds.createView({ col: 'type', op: 'eq', value: 'asset' }, { live: false })
    ds.getRow('1').set('type', 'liability')
    expect(view.rows.map((r) => r.id)).toEqual(['1', '3']) // 未自动重过滤
    view.refilter()
    expect(view.rows.map((r) => r.id)).toEqual(['3'])
  })
})

describe('CmxDataSetView — 写操作委托主集', () => {
  it('view.addRow 委托主集（主集与视图都生效）', () => {
    const ds = master()
    const view = ds.createView({ col: 'type', op: 'eq', value: 'asset' })
    const row = view.addRow({ id: '9', name: '新资产', type: 'asset', status: 1 })
    expect(ds.getRow('9')).toBe(row)        // 写进了主集
    expect(view.getRow('9')).toBe(row)      // 命中条件，进了视图
    expect(view.getRow('9')).toBe(ds.getRow('9'))
  })

  it('view.removeRow 委托主集（底层删除）', () => {
    const ds = master()
    const view = ds.createView(() => true)
    view.removeRow('2')
    expect(ds.getRow('2')).toBeNull()       // 从主集删了
    expect(view.getRow('2')).toBeNull()
  })
})

describe('CmxDataSet.fillView — 灌入已存在的视图实例', () => {
  it('把过滤引用放进已存在的 CmxDataSetView（复用同一实例，不新建）', () => {
    const ds = master()
    const existing = new CmxDataSetView({ datasetId: 'preDeclared' })
    const ret = ds.fillView(existing, { col: 'type', op: 'eq', value: 'asset' })
    expect(ret).toBe(existing)                    // 返回同一实例（链式）
    expect(existing.datasetId).toBe('preDeclared') // 实例未被替换
    expect(existing.master).toBe(ds)
    expect(existing.rows.map((r) => r.id)).toEqual(['1', '3'])
    // 引用同一性
    expect(existing.getRow('3')).toBe(ds.getRow('3'))
  })

  it('fillView 后视图上已绑定的监听保持，结果立即更新', () => {
    const ds = master()
    const existing = new CmxDataSetView({ datasetId: 'pre' })
    const spy = vi.fn()
    existing.addEventListener('ds-row-added', spy) // 绑定在 fillView 之前
    ds.fillView(existing, { col: 'status', op: 'eq', value: 1 })
    expect(existing.rows.length).toBe(3)
    expect(spy).toHaveBeenCalled()                 // 重建派发了 ds-row-added，监听仍在
  })

  it('对同一 view 用不同条件反复 fillView：始终同实例 + 同底层引用', () => {
    const ds = master()
    const view = new CmxDataSetView({ datasetId: 'reuse' })
    ds.fillView(view, { col: 'type', op: 'eq', value: 'asset' })
    expect(view.rows.map((r) => r.id)).toEqual(['1', '3'])
    ds.fillView(view, { col: 'type', op: 'eq', value: 'liability' })
    expect(view.rows.map((r) => r.id)).toEqual(['2'])        // 同 view，换了内容
    expect(view.getRow('2')).toBe(ds.getRow('2'))            // 仍是主集引用
  })

  it('fillView 切换主集时解绑旧主集监听（不再被旧主集影响）', () => {
    const dsA = master()
    const dsB = new CmxDataSet({ datasetId: 'B' })
    dsB.setRows([{ id: 'b1', type: 'asset', status: 1 }])
    const view = new CmxDataSetView({ datasetId: 'switch' })
    ds_fill(dsA, view)
    ds_fill(dsB, view)
    // 现在 view 绑定到 dsB；改 dsA 不应影响 view
    dsA.addRow({ id: 'x', type: 'asset', status: 1 })
    expect(view.getRow('x')).toBeNull()
    // 改 dsB 才影响
    dsB.addRow({ id: 'b2', type: 'asset', status: 1 })
    expect(view.getRow('b2')).toBe(dsB.getRow('b2'))
    function ds_fill (d, v) { d.fillView(v, { col: 'type', op: 'eq', value: 'asset' }) }
  })
})

describe('CmxDataSetView — setFilter / dispose', () => {
  it('setFilter 改条件保持同一实例与 grid 绑定', () => {
    const ds = master()
    const view = ds.createView({ col: 'type', op: 'eq', value: 'asset' })
    const before = view
    view.setFilter({ col: 'status', op: 'eq', value: 0 })
    expect(view).toBe(before)
    expect(view.rows.map((r) => r.id)).toEqual(['2'])
  })

  it('dispose 解绑主集监听，之后主集变更不再影响视图', () => {
    const ds = master()
    const view = ds.createView(() => true)
    expect(view.rows.length).toBe(4)
    view.dispose()
    expect(view.rows.length).toBe(0)
    expect(view.master).toBeNull()
    ds.addRow({ id: '99', type: 'asset' })  // dispose 后不再同步
    expect(view.rows.length).toBe(0)
  })
})

describe('CmxDataSetView — grid 鸭子类型契约', () => {
  it('暴露 grid 依赖的 ds 接口（rows/getRow/moveToId/cursor/事件）', () => {
    const ds = master()
    const view = ds.createView({ col: 'type', op: 'eq', value: 'asset' })
    expect(Array.isArray(view.rows)).toBe(true)
    expect(typeof view.getRow).toBe('function')
    expect(typeof view.addRow).toBe('function')
    expect(typeof view.removeRow).toBe('function')
    expect(typeof view.moveToId).toBe('function')
    // cursor 在视图内独立
    view.moveToId('3')
    expect(view.currentRow.id).toBe('3')
    expect(view.hasCursor).toBe(true)
  })
})
