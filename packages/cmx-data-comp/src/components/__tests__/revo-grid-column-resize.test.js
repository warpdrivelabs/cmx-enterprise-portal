// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { revoGridEventsMixin } from '../revo-grid/revo-grid-events-mixin.js'

/**
 * 列宽拖动（resize）回写测试。
 * mock 一个挂载 events mixin 的实例，dispatch aftercolumnresize 事件，
 * 验证 _userColSizes 回写 + _revoColumns 叶列 size 同步。
 */
function createInstance (columns = []) {
  const inst = Object.create(revoGridEventsMixin)
  inst._opts = { selectionMode: 'single', readonly: true, editTrigger: 'dblclick' }
  inst._revo = document.createElement('revo-grid')
  inst._host = document.createElement('div')
  inst._host.appendChild(inst._revo)
  inst._userColSizes = new Map()
  inst._revoColumns = columns
  // 绑定事件（创建 _onAfterColumnResizeBound 等）
  inst._bindRevoEvents()
  return inst
}

describe('revo-grid-events-mixin — aftercolumnresize 回写', () => {
  it('单列拖动：_userColSizes 记录新尺寸 + _revoColumns 叶列 size 同步', () => {
    const inst = createInstance([{ prop: 'a', size: 100 }])
    inst._revo.dispatchEvent(new CustomEvent('aftercolumnresize', {
      detail: { 0: { prop: 'a', size: 250 } },
    }))
    expect(inst._userColSizes.get('a')).toBe(250)
    expect(inst._revoColumns[0].size).toBe(250)
  })

  it('多列同时拖动（区域 resize）：全部回写', () => {
    const inst = createInstance([
      { prop: 'a', size: 100 },
      { prop: 'b', size: 200 },
      { prop: 'c', size: 150 },
    ])
    inst._revo.dispatchEvent(new CustomEvent('aftercolumnresize', {
      detail: {
        0: { prop: 'a', size: 120 },
        2: { prop: 'c', size: 180 },
      },
    }))
    expect(inst._userColSizes.get('a')).toBe(120)
    expect(inst._userColSizes.get('c')).toBe(180)
    expect(inst._userColSizes.has('b')).toBe(false) // 未拖动的列不记录
    expect(inst._revoColumns[0].size).toBe(120)
    expect(inst._revoColumns[2].size).toBe(180)
  })

  it('忽略无效 size（非数字 / ≤ 0）：不回写', () => {
    const inst = createInstance([{ prop: 'a', size: 100 }])
    inst._revo.dispatchEvent(new CustomEvent('aftercolumnresize', {
      detail: {
        0: { prop: 'a', size: 'abc' },
        1: { prop: 'b', size: 0 },
        2: { prop: 'c', size: -5 },
      },
    }))
    expect(inst._userColSizes.size).toBe(0)
    expect(inst._revoColumns[0].size).toBe(100) // 保持原值
  })

  it('size 取整（四舍五入）', () => {
    const inst = createInstance([{ prop: 'a', size: 100 }])
    inst._revo.dispatchEvent(new CustomEvent('aftercolumnresize', {
      detail: { 0: { prop: 'a', size: 250.7 } },
    }))
    expect(inst._userColSizes.get('a')).toBe(251)
    expect(inst._revoColumns[0].size).toBe(251)
  })

  it('detail 中列 prop 在 _revoColumns 找不到时：仍记录到 _userColSizes（叶列同步跳过）', () => {
    const inst = createInstance([{ prop: 'a', size: 100 }])
    inst._revo.dispatchEvent(new CustomEvent('aftercolumnresize', {
      detail: { 0: { prop: 'ghost', size: 300 } },
    }))
    expect(inst._userColSizes.get('ghost')).toBe(300)
    // _revoColumns 无 ghost 列，size 同步不报错也不误改
    expect(inst._revoColumns[0].size).toBe(100)
  })
})
