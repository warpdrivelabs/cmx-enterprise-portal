// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { revoGridResizeMixin } from '../revo-grid/revo-grid-resize-mixin.js'

/**
 * 构造挂载 resize mixin 的 mock 实例。依赖的其他 mixin 方法（_findRevoCol /
 * _columnsForViewport / _setRevoProp 等）用简化实现注入，聚焦测 resize mixin 自身逻辑。
 */
function createInstance (opts = {}) {
  const inst = Object.create(revoGridResizeMixin)
  inst._opts = { resize: true, ...opts }
  inst._revoColumns = [{ prop: 'id', size: 100 }, { prop: 'name', size: 200 }]
  inst._userColSizes = new Map()
  inst._revo = { columns: null }
  inst._revoPropSigs = {}
  // 依赖方法 mock
  inst._findRevoCol = function (prop) { return this._revoColumns.find((c) => c.prop === prop) }
  inst._applyRequiredMarks = (cols) => cols
  inst._columnsForViewport = function () { return this._revoColumns } // stretch=false 返回同引用
  inst._columnsSignature = (cols) => JSON.stringify(cols.map((c) => ({ prop: c.prop, size: c.size })))
  inst._setRevoProp = function (name, value) { this._revo[name] = value; return true }
  inst._baseColumnSize = (col) => Number(col.size) || 100
  return inst
}

describe('revo-grid-resize-mixin — _refreshColumnsForResize', () => {
  it('更新 leaf.size + _userColSizes + 重赋 columns', () => {
    const inst = createInstance()
    inst._refreshColumnsForResize('id', 250)
    expect(inst._revoColumns[0].size).toBe(250) // 源列更新
    expect(inst._userColSizes.get('id')).toBe(250)
    expect(inst._revo.columns).not.toBeNull()
    expect(inst._revo.columns[0].size).toBe(250)
  })

  it('stretch=false 时克隆列树（不返回 _revoColumns 同引用），确保 revo-grid 重渲', () => {
    const inst = createInstance({ stretch: false })
    inst._refreshColumnsForResize('id', 300)
    // _columnsForViewport 返回 _revoColumns 同引用，_refreshColumnsForResize 必须克隆
    expect(inst._revo.columns).not.toBe(inst._revoColumns)
    expect(inst._revo.columns[0]).not.toBe(inst._revoColumns[0])
    expect(inst._revo.columns[0].size).toBe(300)
  })

  it('清 columns 签名（让下次 _setRevoProp 不跳过）', () => {
    const inst = createInstance()
    inst._revoPropSigs['prop:columns'] = 'old-sig'
    inst._refreshColumnsForResize('id', 150)
    // _setRevoProp 被调用了（_revo.columns 已赋值），签名清过后重新赋值成功
    expect(inst._revo.columns).not.toBeNull()
  })

  it('prop 不存在时不报错（_findRevoCol 返回 undefined）', () => {
    const inst = createInstance()
    expect(() => inst._refreshColumnsForResize('ghost', 100)).not.toThrow()
    expect(inst._userColSizes.get('ghost')).toBe(100) // _userColSizes 仍记录
  })
})

describe('revo-grid-resize-mixin — _onHostPointerDownForResize 命中判定', () => {
  it('命中 .resizable → 设 _rtResize + preventDefault + 绑定 document mousemove/mouseup', () => {
    vi.useFakeTimers()
    const inst = createInstance()
    inst._host = document.createElement('div')
    document.body.appendChild(inst._host)
    // 造 header cell + resizable 到 _host（模拟 revo-grid light DOM）
    const headerCell = document.createElement('div')
    headerCell.className = 'rgHeaderCell'
    headerCell.setAttribute('data-rgCol', '0')
    const handle = document.createElement('div')
    handle.className = 'resizable resizable-r'
    headerCell.appendChild(handle)
    inst._host.appendChild(headerCell)
    inst._bindRealtimeResize()

    let prevented = false
    let stopped = false
    const ev = new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: 100, clientY: 50, button: 0 })
    Object.defineProperty(ev, 'composedPath', { value: () => [handle, headerCell, inst._host] })
    const origPrevent = ev.preventDefault.bind(ev)
    ev.preventDefault = () => { prevented = true; origPrevent() }
    const origStop = ev.stopImmediatePropagation.bind(ev)
    ev.stopImmediatePropagation = () => { stopped = true; origStop() }
    inst._host.dispatchEvent(ev)

    expect(prevented).toBe(true)
    expect(stopped).toBe(true)
    expect(inst._rtResize).toBeTruthy()
    expect(inst._rtResize.prop).toBe('id')
    expect(inst._rtResize.initWidth).toBe(100)
    // document 上绑定了 mousemove/mouseup（capture）
    // 模拟 move + up 触发 rAF
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 150 }))
    vi.advanceTimersByTime(20) // rAF
    expect(inst._userColSizes.get('id')).toBe(150) // 100 + 50
    document.dispatchEvent(new MouseEvent('mouseup'))
    expect(inst._rtResize).toBeNull() // 清理

    inst._unbindRealtimeResize()
    vi.useRealTimers()
  })

  it('resize=false 时不接管', () => {
    const inst = createInstance({ resize: false })
    inst._host = document.createElement('div')
    inst._bindRealtimeResize()
    const handle = document.createElement('div')
    handle.className = 'resizable'
    inst._host.appendChild(handle)
    const ev = new MouseEvent('mousedown', { button: 0 })
    Object.defineProperty(ev, 'composedPath', { value: () => [handle, inst._host] })
    inst._host.dispatchEvent(ev)
    expect(inst._rtResize).toBeUndefined() // 没设
    inst._unbindRealtimeResize()
  })

  it('非 .resizable 目标不接管', () => {
    const inst = createInstance()
    inst._host = document.createElement('div')
    inst._bindRealtimeResize()
    const cell = document.createElement('div')
    cell.className = 'rgCell' // 数据 cell，不是 resize handle
    inst._host.appendChild(cell)
    const ev = new MouseEvent('mousedown', { button: 0 })
    Object.defineProperty(ev, 'composedPath', { value: () => [cell, inst._host] })
    inst._host.dispatchEvent(ev)
    expect(inst._rtResize).toBeUndefined()
    inst._unbindRealtimeResize()
  })
})
