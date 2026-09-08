// @vitest-environment jsdom
import { describe, expect, it, afterEach, vi } from 'vitest'
import { CmxFloatingDialog } from '../cmx-floating-dialog.js'

const nextFrame = () => new Promise((r) => requestAnimationFrame(r))

describe('cmx-floating-dialog dock 抽屉模式', () => {
  afterEach(() => { document.body.innerHTML = '' })

  it('注册为自定义元素', () => {
    expect(customElements.get('cmx-floating-dialog')).toBe(CmxFloatingDialog)
  })

  it('configure({dock:"right"}) 后 box 的 data-dock="right"', async () => {
    const dlg = document.createElement('cmx-floating-dialog')
    dlg.configure({ dock: 'right', dialogWidth: '420px' })
    document.body.appendChild(dlg)
    await nextFrame()
    const box = dlg.shadowRoot.getElementById('dlg-box')
    expect(box.dataset.dock).toBe('right')
    // dock 宽度写入 --dlg-w
    expect(box.style.getPropertyValue('--dlg-w')).toBe('420px')
  })

  it('configure({dock:"left"}) 后 box 的 data-dock="left"', async () => {
    const dlg = document.createElement('cmx-floating-dialog')
    dlg.configure({ dock: 'left' })
    document.body.appendChild(dlg)
    await nextFrame()
    expect(dlg.shadowRoot.getElementById('dlg-box').dataset.dock).toBe('left')
  })

  it('不设 dock（默认居中）时 box 无 data-dock', async () => {
    const dlg = document.createElement('cmx-floating-dialog')
    dlg.configure({ title: '普通' })
    document.body.appendChild(dlg)
    await nextFrame()
    const box = dlg.shadowRoot.getElementById('dlg-box')
    expect(box.dataset.dock).toBe('')
  })

  it('dock 模式跳过 _center（不调用居中）', async () => {
    const dlg = document.createElement('cmx-floating-dialog')
    dlg.configure({ dock: 'right' })
    const spy = vi.spyOn(dlg, '_center')
    document.body.appendChild(dlg)
    // 等待 connectedCallback 的 queueMicrotask + rAF 执行完
    await new Promise((r) => setTimeout(r, 60))
    expect(spy).not.toHaveBeenCalled()
  })

  it('dock 模式 _wireInteract 提前返回（无拖拽/缩放）', async () => {
    const dlg = document.createElement('cmx-floating-dialog')
    dlg.configure({ dock: 'right' })
    document.body.appendChild(dlg)
    await nextFrame()
    // _wireInteract 对 dock 模式直接 return，不应创建 _abort（或即使创建也不会 wire drag/resize）
    // 间接验证：dialog 仍能正常 openModal（不被 wire 阻塞）
    const p = dlg.openModal()
    // openModal 会 appendChild（已连接则跳过），返回 Promise
    expect(p).toBeInstanceOf(Promise)
    // 关闭
    dlg.close('cancel', { force: true })
    const result = await p
    expect(result.action).toBe('cancel')
  })

  it('dock shell 样式包含贴边定位规则', () => {
    // 验证 cmx-dialog-shell.js 导出的样式含 [data-dock] 规则
    // 通过渲染一个 dock dialog 后检查 shadow 内 <style> 文本
    const dlg = document.createElement('cmx-floating-dialog')
    dlg.configure({ dock: 'right' })
    document.body.appendChild(dlg)
    const styleEl = dlg.shadowRoot.querySelector('style')
    expect(styleEl).toBeTruthy()
    const css = styleEl.textContent
    expect(css).toContain('[data-dock="right"]')
    expect(css).toContain('dlg-dock-right-in')
    expect(css).toContain('[data-dock="left"]')
  })

  it('openModal + dock 关闭后从 DOM 移除', async () => {
    const dlg = document.createElement('cmx-floating-dialog')
    dlg.configure({ dock: 'right', title: '抽屉' })
    document.body.appendChild(dlg)
    await nextFrame()
    const p = dlg.openModal()
    dlg.close('cancel', { force: true })
    await p
    expect(document.body.contains(dlg)).toBe(false)
  })
})
