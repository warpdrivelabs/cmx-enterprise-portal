// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { revoGridTextSelectMixin } from '../revo-grid/revo-grid-text-select-mixin.js'

/**
 * text-select mixin 单元测试。
 * mock _host/_revo 为真实 DOM 节点；copy 事件用真实 dispatchEvent + clipboardData stub。
 */
function createInstance (opts = {}) {
  const inst = Object.create(revoGridTextSelectMixin)
  inst._opts = { allowTextSelect: false, ...opts }
  inst._host = document.createElement('div')
  inst._revo = document.createElement('revo-grid')
  inst._revo.className = 'cmx-revo-inner'
  inst._host.appendChild(inst._revo)
  document.body.appendChild(inst._host)
  inst._bindTextSelect()
  return inst
}

/** 造一个 .rgCell 到 _host 内（模拟 revo-grid light DOM 渲染）。 */
function makeCell (host, text = '一段文本') {
  const cell = document.createElement('div')
  cell.className = 'rgCell'
  cell.textContent = text
  // revogr-data 在 .rgCell 外层（cmx _css 选择器 .cmx-revo-inner revogr-data .rgCell）
  const wrap = document.createElement('revogr-data')
  host.querySelector('revo-grid').appendChild(wrap)
  wrap.appendChild(cell)
  return cell
}

describe('revo-grid-text-select-mixin — _applyAllowTextSelect class 切换', () => {
  it('allowTextSelect=true → _revo 加 cmx-allow-text-select class', () => {
    const inst = createInstance({ allowTextSelect: true })
    inst._applyAllowTextSelect()
    expect(inst._revo.classList.contains('cmx-allow-text-select')).toBe(true)
    inst._unbindTextSelect()
  })

  it('allowTextSelect=false → 无 class', () => {
    const inst = createInstance({ allowTextSelect: false })
    inst._applyAllowTextSelect()
    expect(inst._revo.classList.contains('cmx-allow-text-select')).toBe(false)
    inst._unbindTextSelect()
  })

  it('运行时切换：true → false 移除 class', () => {
    const inst = createInstance({ allowTextSelect: true })
    inst._applyAllowTextSelect()
    expect(inst._revo.classList.contains('cmx-allow-text-select')).toBe(true)
    inst._opts.allowTextSelect = false
    inst._applyAllowTextSelect()
    expect(inst._revo.classList.contains('cmx-allow-text-select')).toBe(false)
    inst._unbindTextSelect()
  })
})

describe('revo-grid-text-select-mixin — copy 拦截（capture 放行选中子串）', () => {
  let originalGetSelection
  beforeEach(() => {
    originalGetSelection = window.getSelection
    window.getSelection = () => null
  })
  afterEach(() => {
    if (originalGetSelection) window.getSelection = originalGetSelection
    else delete window.getSelection
  })

  /** dispatch 一个 copy 事件，带 clipboardData stub。 */
  function dispatchCopy () {
    const data = { 'text/plain': '', 'text/html': '' }
    const clipboardData = {
      setData: (type, val) => { data[type] = val },
      getData: (type) => data[type],
    }
    const ev = new Event('copy', { bubbles: true, cancelable: true })
    Object.defineProperty(ev, 'clipboardData', { value: clipboardData, configurable: true })
    let stopped = false
    const origStop = ev.stopImmediatePropagation
    ev.stopImmediatePropagation = () => { stopped = true; origStop?.call(ev) }
    document.dispatchEvent(ev)
    return { ev, data, stopped }
  }

  it('allowTextSelect=true + grid 内有选区 → 写入选中文本 + stopImmediatePropagation', () => {
    const inst = createInstance({ allowTextSelect: true })
    inst._applyAllowTextSelect()
    const cell = makeCell(inst._host, '完整文本')
    window.getSelection = () => ({ isCollapsed: false, toString: () => '选中片段', anchorNode: cell })
    const { data, stopped, ev } = dispatchCopy()
    expect(stopped).toBe(true)
    expect(ev.defaultPrevented).toBe(true)
    expect(data['text/plain']).toBe('选中片段')
    inst._unbindTextSelect()
  })

  it('allowTextSelect=false → 不拦截（让 revo-grid 正常处理整格复制）', () => {
    const inst = createInstance({ allowTextSelect: false })
    const cell = makeCell(inst._host, '完整文本')
    window.getSelection = () => ({ isCollapsed: false, toString: () => '选中片段', anchorNode: cell })
    const { data, stopped, ev } = dispatchCopy()
    expect(stopped).toBe(false)
    expect(ev.defaultPrevented).toBe(false)
    expect(data['text/plain']).toBe('') // 未写入
    inst._unbindTextSelect()
  })

  it('选区在 grid 外（anchorNode 不在 _host 内）→ 不拦截', () => {
    const inst = createInstance({ allowTextSelect: true })
    inst._applyAllowTextSelect()
    const outside = document.createElement('div')
    document.body.appendChild(outside)
    window.getSelection = () => ({ isCollapsed: false, toString: () => '外部文本', anchorNode: outside })
    const { stopped, ev } = dispatchCopy()
    expect(stopped).toBe(false)
    expect(ev.defaultPrevented).toBe(false)
    inst._unbindTextSelect()
  })

  it('选区折叠（isCollapsed，无实际选中）→ 不拦截，让 revo-grid 复制焦点整格', () => {
    const inst = createInstance({ allowTextSelect: true })
    inst._applyAllowTextSelect()
    const cell = makeCell(inst._host, '完整文本')
    window.getSelection = () => ({ isCollapsed: true, toString: () => '', anchorNode: cell })
    const { stopped, ev } = dispatchCopy()
    expect(stopped).toBe(false)
    expect(ev.defaultPrevented).toBe(false)
    inst._unbindTextSelect()
  })

  it('_unbindTextSelect 后 copy 监听移除（不再拦截）', () => {
    const inst = createInstance({ allowTextSelect: true })
    inst._applyAllowTextSelect()
    const cell = makeCell(inst._host, '完整文本')
    window.getSelection = () => ({ isCollapsed: false, toString: () => '选中', anchorNode: cell })
    inst._unbindTextSelect()
    const { stopped, ev } = dispatchCopy()
    expect(stopped).toBe(false)
    expect(ev.defaultPrevented).toBe(false)
  })
})
