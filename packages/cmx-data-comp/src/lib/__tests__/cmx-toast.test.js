// @vitest-environment jsdom
//
// cmx-toast 冒烟测试：验证轻量提示真的渲染出来（叠放/去重/点击关闭/级别语义）——
// 它的价值与 message-dialog 一样在于「用户看得见」，光导出不算数。

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { showCmxToast, showCmxError } from '../cmx-toast.js'

beforeEach(() => {
  document.body.replaceChildren()
})
afterEach(() => {
  document.body.replaceChildren()
  vi.useRealTimers()
})

/** 取 toast 容器 shadow 内的当前条目列表。 */
function toastEls () {
  const host = document.querySelector('[data-cmx-toast-root]')
  if (!host || !host.shadowRoot) return []
  return [...host.shadowRoot.querySelectorAll('.toast')]
}

describe('cmx-toast: 渲染与级别', () => {
  it('弹出后挂到 body，渲染文案、级别与 role=status', () => {
    showCmxToast('保存完成', { level: 'success' })
    const els = toastEls()
    expect(els).toHaveLength(1)
    expect(els[0].textContent).toContain('保存完成')
    expect(els[0].getAttribute('data-level')).toBe('success')
    expect(els[0].getAttribute('role')).toBe('status')
  })

  it('error 级用 role=alert；title 渲染为加粗小标题', () => {
    showCmxToast('后端不可用', { level: 'error', title: '装载失败' })
    const el = toastEls()[0]
    expect(el.getAttribute('role')).toBe('alert')
    expect(el.querySelector('.title').textContent).toBe('装载失败')
    expect(el.querySelector('.msg').textContent).toContain('后端不可用')
  })

  it('Error 对象自动取 message', () => {
    showCmxToast(new Error('字典 xx 装载失败'))
    expect(toastEls()[0].textContent).toContain('字典 xx 装载失败')
  })

  it('showCmxError(title, err)：catch 样板一行——warn + 提取 message + error 级 toast', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      showCmxError('列表装载失败', new Error('字典 xx 不存在'))
      const el = toastEls()[0]
      expect(el.getAttribute('data-level')).toBe('error')
      expect(el.querySelector('.title').textContent).toBe('列表装载失败')
      expect(el.querySelector('.msg').textContent).toContain('字典 xx 不存在')
      expect(warn).toHaveBeenCalledTimes(1)
    } finally {
      warn.mockRestore()
    }
  })
})

describe('cmx-toast: 去重与关闭', () => {
  it('同文案同级别重复触发不叠加新条目', () => {
    showCmxToast('同一条提示', { level: 'warning' })
    showCmxToast('同一条提示', { level: 'warning' })
    showCmxToast('同一条提示', { level: 'warning' })
    expect(toastEls()).toHaveLength(1)
  })

  it('不同文案各自成条', () => {
    showCmxToast('提示A')
    showCmxToast('提示B')
    expect(toastEls()).toHaveLength(2)
  })

  it('到达 duration 自动消失', () => {
    vi.useFakeTimers()
    showCmxToast('稍纵即逝', { duration: 1000 })
    expect(toastEls()).toHaveLength(1)
    vi.advanceTimersByTime(1000 + 300) // 淡出动画 220ms 之后移除
    expect(toastEls()).toHaveLength(0)
  })

  it('点击条目立即关闭', () => {
    vi.useFakeTimers()
    showCmxToast('点我关闭')
    const el = toastEls()[0]
    el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, composed: true }))
    vi.advanceTimersByTime(300)
    expect(toastEls()).toHaveLength(0)
  })
})
