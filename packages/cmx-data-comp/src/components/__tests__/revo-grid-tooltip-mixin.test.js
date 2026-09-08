// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { revoGridTooltipMixin } from '../revo-grid/revo-grid-tooltip-mixin.js'

/**
 * tooltip mixin 单元测试。
 * mock _host/_revo 为真实 DOM 节点，dispatchEvent 触发委托；
 * cell 的 scrollWidth/clientWidth 用 defineProperty 模拟（jsdom 不做布局）。
 */
function createInstance (opts = {}) {
  const inst = Object.create(revoGridTooltipMixin)
  inst._opts = { cellTooltip: true, ...opts }
  inst._host = document.createElement('div')
  inst._revo = document.createElement('revo-grid')
  document.body.appendChild(inst._host)
  inst._bindCellTooltip()
  return inst
}

/** 造一个 .rgCell 并 mock 截断状态（scrollWidth > clientWidth）。 */
function makeCell (host, { truncated = true, text = '一段很长的单元格文本会被截断' } = {}) {
  const cell = document.createElement('div')
  cell.className = 'rgCell'
  cell.textContent = text
  host.appendChild(cell)
  Object.defineProperty(cell, 'scrollWidth', { configurable: true, value: truncated ? 200 : 50 })
  Object.defineProperty(cell, 'clientWidth', { configurable: true, value: 60 })
  return cell
}

function dispatchOver (cell, x = 100, y = 100) {
  cell.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, composed: true, clientX: x, clientY: y }))
}

describe('revo-grid-tooltip-mixin — _cellFromEvent 路由', () => {
  it('从 composedPath 取 .rgCell', () => {
    const inst = createInstance()
    const cell = makeCell(inst._host)
    dispatchOver(cell)
    // mouseover 触发后，_tooltipCell 应被记为该 cell（即便不截断也会先记录再判定）
    // 截断 cell 会被记录
    expect(inst._tooltipCell).toBe(cell)
    inst._unbindCellTooltip()
  })

  it('排除表头单元格（closest revogr-header）', () => {
    const inst = createInstance()
    const header = document.createElement('revogr-header')
    inst._host.appendChild(header)
    const cell = document.createElement('div')
    cell.className = 'rgCell'
    header.appendChild(cell)
    dispatchOver(cell)
    // 表头 cell 不应触发 tooltip：_cancelTooltip 会把 _tooltipCell 置 null
    expect(inst._tooltipCell).toBeNull()
    inst._unbindCellTooltip()
  })

  it('排除序号列单元格（closest .rowHeaders）', () => {
    const inst = createInstance()
    const rowHeaders = document.createElement('div')
    rowHeaders.className = 'rowHeaders'
    inst._host.appendChild(rowHeaders)
    const cell = document.createElement('div')
    cell.className = 'rgCell'
    rowHeaders.appendChild(cell)
    dispatchOver(cell)
    expect(inst._tooltipCell).toBeNull()
    inst._unbindCellTooltip()
  })
})

describe('revo-grid-tooltip-mixin — 截断 → 显示浮层', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('截断 cell 悬浮 250ms 后显示完整文本', () => {
    const inst = createInstance()
    const cell = makeCell(inst._host, { text: '完整内容ABC' })
    dispatchOver(cell)
    // 立即不应显示
    expect(document.querySelector('.cmx-cell-tooltip')).toBeNull()
    vi.advanceTimersByTime(250)
    const tip = document.querySelector('.cmx-cell-tooltip')
    expect(tip).not.toBeNull()
    expect(tip.textContent).toBe('完整内容ABC')
    expect(tip.style.display).toBe('block')
    inst._unbindCellTooltip()
  })

  it('非截断 cell（scrollWidth <= clientWidth）不显示', () => {
    const inst = createInstance()
    const cell = makeCell(inst._host, { truncated: false })
    dispatchOver(cell)
    vi.advanceTimersByTime(250)
    expect(document.querySelector('.cmx-cell-tooltip')).toBeNull()
    inst._unbindCellTooltip()
  })

  it('cellTooltip=false 时不显示（运行时关闭）', () => {
    const inst = createInstance({ cellTooltip: false })
    const cell = makeCell(inst._host)
    dispatchOver(cell)
    vi.advanceTimersByTime(250)
    expect(document.querySelector('.cmx-cell-tooltip')).toBeNull()
    inst._unbindCellTooltip()
  })

  it('切到新 cell 时取消上一个未弹出的定时器（不误弹旧 cell）', () => {
    const inst = createInstance()
    const cell1 = makeCell(inst._host, { text: '旧' })
    const cell2 = makeCell(inst._host, { text: '新' })
    dispatchOver(cell1)
    vi.advanceTimersByTime(200) // 还差 50ms
    dispatchOver(cell2)          // 切到 cell2，取消 cell1 的定时器
    vi.advanceTimersByTime(50)   // cell1 原本该弹出，但已被取消
    expect(document.querySelector('.cmx-cell-tooltip')).toBeNull()
    vi.advanceTimersByTime(200)  // cell2 满 250ms
    const tip = document.querySelector('.cmx-cell-tooltip')
    expect(tip).not.toBeNull()
    expect(tip.textContent).toBe('新')
    inst._unbindCellTooltip()
  })

  it('离开 _host 区域（mouseout 到外部）隐藏浮层', () => {
    const inst = createInstance()
    const cell = makeCell(inst._host, { text: '内容' })
    dispatchOver(cell)
    vi.advanceTimersByTime(250)
    expect(document.querySelector('.cmx-cell-tooltip').style.display).toBe('block')
    // dispatch mouseout，relatedTarget 在 host 外
    inst._host.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }))
    const tip = document.querySelector('.cmx-cell-tooltip')
    expect(tip.style.display).toBe('none')
    inst._unbindCellTooltip()
  })
})

describe('revo-grid-tooltip-mixin — _unbindCellTooltip 清理', () => {
  it('移除浮层 DOM + 解绑事件（再 dispatch 不显示）', () => {
    vi.useFakeTimers()
    const inst = createInstance()
    const cell = makeCell(inst._host)
    dispatchOver(cell)
    vi.advanceTimersByTime(250)
    expect(document.querySelector('.cmx-cell-tooltip')).not.toBeNull()
    inst._unbindCellTooltip()
    // 浮层已从 document.body 移除
    expect(document.querySelector('.cmx-cell-tooltip')).toBeNull()
    // _tooltipBound 重置
    expect(inst._tooltipBound).toBe(false)
    // 解绑后再 dispatch 不再产生浮层
    const cell2 = makeCell(inst._host)
    dispatchOver(cell2)
    vi.advanceTimersByTime(250)
    expect(document.querySelector('.cmx-cell-tooltip')).toBeNull()
    vi.useRealTimers()
  })
})
