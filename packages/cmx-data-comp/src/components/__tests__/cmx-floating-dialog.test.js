// @vitest-environment jsdom
/**
 * cmx-floating-dialog 内容契约与新行为属性单测（方案 20260819 批次 1）。
 *
 * jsdom 不解析样式表规则（仅内联样式生效）、无布局能力，断言一律走
 * DOM 结构 / data 属性 / 内联 style / shadow <style> 文本，与 dock 测试同口径。
 */
import { describe, expect, it, afterEach, vi } from 'vitest'
import '../cmx-floating-dialog.js'   // 副作用：注册自定义元素
import { scrollLockCount } from '../../lib/cmx-scroll-lock.js'

const nextFrame = () => new Promise((r) => requestAnimationFrame(r))
const esc = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

/** 取内容标准容器（setContent 路径）。 */
const contentOf = (dlg) => dlg.shadowRoot.querySelector('#dlg-body > .dlg-content')

describe('cmx-floating-dialog 内容契约与新属性', () => {
  afterEach(() => { document.body.replaceChildren() })

  // ── setContent 标准容器 ──────────────────────────────────────────────

  it('setContent 默认包入 .dlg-content（#dlg-body > .dlg-content > el）', async () => {
    const dlg = document.createElement('cmx-floating-dialog')
    const el = document.createElement('div')
    dlg.setContent(el)
    document.body.appendChild(dlg)
    await nextFrame()
    const c = contentOf(dlg)
    expect(c).toBeTruthy()
    expect(c.contains(el)).toBe(true)
    // shell 样式含 .dlg-content 规则与默认 padding 变量
    const css = dlg.shadowRoot.querySelector('style').textContent
    expect(css).toContain('.dlg-content')
    expect(css).toContain('--dlg-content-padding, 14px 16px')
  })

  it('setContent(el,{padding:false}) 全出血：data-bleed', async () => {
    const dlg = document.createElement('cmx-floating-dialog')
    dlg.setContent(document.createElement('div'), { padding: false })
    document.body.appendChild(dlg)
    await nextFrame()
    expect(contentOf(dlg).dataset.bleed).toBe('true')
  })

  it('setContent(el,{padding:string}) 写入容器自身内联 padding', async () => {
    const dlg = document.createElement('cmx-floating-dialog')
    dlg.setContent(document.createElement('div'), { padding: '5px 8px' })
    document.body.appendChild(dlg)
    await nextFrame()
    expect(contentOf(dlg).style.padding).toBe('5px 8px')
  })

  it('configure contentPadding 写 :host 变量；opts 覆盖 configure', async () => {
    const dlg = document.createElement('cmx-floating-dialog')
    dlg.configure({ contentPadding: '20px 30px' })
    expect(dlg.style.getPropertyValue('--dlg-content-padding')).toBe('20px 30px')
    // false → 0px；true → 移除（显式归位）
    dlg.configure({ contentPadding: false })
    expect(dlg.style.getPropertyValue('--dlg-content-padding')).toBe('0px')
    dlg.configure({ contentPadding: true })
    expect(dlg.style.getPropertyValue('--dlg-content-padding')).toBe('')
    // opts 逐次覆盖：容器自身内联，不污染实例默认
    dlg.setContent(document.createElement('div'), { padding: '6px' })
    document.body.appendChild(dlg)
    await nextFrame()
    expect(contentOf(dlg).style.padding).toBe('6px')
  })

  it('#dlg-body 有 position:relative 锚定（shell 样式）', async () => {
    const dlg = document.createElement('cmx-floating-dialog')
    document.body.appendChild(dlg)
    await nextFrame()
    const css = dlg.shadowRoot.querySelector('style').textContent
    expect(css).toMatch(/\.dlg-body\s*\{[^}]*position:\s*relative/)
  })

  // ── 空 footer 折叠 ──────────────────────────────────────────────────

  it('无任何按钮时 footer 折叠；getFooterExtra() 调用即恢复', async () => {
    const dlg = document.createElement('cmx-floating-dialog')
    dlg.configure({ showConfirm: false, showCancel: false })
    document.body.appendChild(dlg)
    await nextFrame()
    const footer = dlg.shadowRoot.getElementById('dlg-footer')
    expect(footer.dataset.collapsed).toBe('true')
    const extra = dlg.getFooterExtra()
    expect(extra).toBeTruthy()
    expect(footer.hasAttribute('data-collapsed')).toBe(false)
  })

  it('有确认/取消按钮时 footer 不折叠', async () => {
    const dlg = document.createElement('cmx-floating-dialog')
    dlg.configure({ showConfirm: true, showCancel: true })
    document.body.appendChild(dlg)
    await nextFrame()
    expect(dlg.shadowRoot.getElementById('dlg-footer').hasAttribute('data-collapsed')).toBe(false)
  })

  // ── closable ────────────────────────────────────────────────────────

  it('closable 标题栏出现 ✕（幂等）；点击派发 cancel 并移除', async () => {
    const dlg = document.createElement('cmx-floating-dialog')
    dlg.configure({ closable: true })
    dlg.configure({ closable: true })   // 二次 configure 不重复追加
    document.body.appendChild(dlg)
    await nextFrame()
    const endEl = dlg.shadowRoot.getElementById('dlg-bar-end')
    expect(endEl.querySelectorAll('#dlg-close-x')).toHaveLength(1)
    let ev = null
    dlg.addEventListener('cmx-dialog-cancel', (e) => { ev = e })
    dlg.shadowRoot.getElementById('dlg-close-x').dispatchEvent(
      new MouseEvent('click', { bubbles: true, composed: true }))
    await nextFrame()
    expect(ev && ev.detail.action).toBe('cancel')
    expect(document.body.contains(dlg)).toBe(false)
  })

  it('closable:false（默认）无 ✕', async () => {
    const dlg = document.createElement('cmx-floating-dialog')
    document.body.appendChild(dlg)
    await nextFrame()
    expect(dlg.shadowRoot.getElementById('dlg-close-x')).toBeFalsy()
  })

  // ── Esc：栈顶判定 / closeOnEsc / message 让位 ───────────────────────

  it('双层叠开按一次 Esc 仅关后连接（栈顶）实例', async () => {
    const a = document.createElement('cmx-floating-dialog')
    a.configure({ title: 'A' })
    const b = document.createElement('cmx-floating-dialog')
    b.configure({ title: 'B' })
    document.body.append(a, b)
    await nextFrame()
    esc()
    await nextFrame()
    expect(document.body.contains(b)).toBe(false)
    expect(document.body.contains(a)).toBe(true)
    a.remove()
  })

  it('closeOnEsc:false 栈顶实例吞掉 Esc（下层也不关）', async () => {
    const a = document.createElement('cmx-floating-dialog')
    const b = document.createElement('cmx-floating-dialog')
    b.configure({ closeOnEsc: false })
    document.body.append(a, b)
    await nextFrame()
    esc()
    await nextFrame()
    expect(document.body.contains(a)).toBe(true)
    expect(document.body.contains(b)).toBe(true)
    a.remove(); b.remove()
  })

  it('更高层 message/confirm 家族在场时让位（不响应 Esc）', async () => {
    const dlg = document.createElement('cmx-floating-dialog')
    document.body.appendChild(dlg)
    await nextFrame()
    const msg = document.createElement('div')
    msg.setAttribute('data-cmx-message-dialog', '')
    document.body.appendChild(msg)
    esc()
    await nextFrame()
    expect(document.body.contains(dlg)).toBe(true)
    msg.remove()
    esc()
    await nextFrame()
    expect(document.body.contains(dlg)).toBe(false)
  })

  // ── 遮罩 / mask ─────────────────────────────────────────────────────

  it('closeOnMask:false 点击遮罩区域不关闭', async () => {
    const dlg = document.createElement('cmx-floating-dialog')
    dlg.configure({ closeOnMask: false })
    document.body.appendChild(dlg)
    await nextFrame()
    dlg.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    await nextFrame()
    expect(document.body.contains(dlg)).toBe(true)
    dlg.remove()
  })

  it('mask:false 非模态：host data-mask + 样式规则 + 点击不关闭', async () => {
    const dlg = document.createElement('cmx-floating-dialog')
    dlg.configure({ mask: false })
    document.body.appendChild(dlg)
    await nextFrame()
    expect(dlg.dataset.mask).toBe('false')
    const css = dlg.shadowRoot.querySelector('style').textContent
    expect(css).toContain(':host([data-mask="false"])')
    expect(css).toContain('pointer-events: none')
    dlg.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    await nextFrame()
    expect(document.body.contains(dlg)).toBe(true)
    dlg.remove()
  })

  // ── lockScroll 引用计数（含 reconnect 配对）─────────────────────────

  it('多弹框计数锁滚动，全关恢复；reconnect 不泄漏', async () => {
    const html = document.documentElement
    const prevOverflow = html.style.overflow
    const a = document.createElement('cmx-floating-dialog')
    const b = document.createElement('cmx-floating-dialog')
    document.body.append(a, b)
    await nextFrame()
    expect(scrollLockCount()).toBe(2)
    expect(html.style.overflow).toBe('hidden')
    // 移动 a（disconnect→reconnect）：标志配对应重新 acquire，计数回到 2
    const holder = document.createElement('div')
    document.body.appendChild(holder)
    holder.appendChild(a)
    await nextFrame()
    expect(scrollLockCount()).toBe(2)
    b.remove()
    await nextFrame()
    expect(scrollLockCount()).toBe(1)
    expect(html.style.overflow).toBe('hidden')  // a 仍开着，不应提前解锁
    a.remove()
    await nextFrame()
    expect(scrollLockCount()).toBe(0)
    expect(html.style.overflow).toBe(prevOverflow)
  })

  it('lockScroll:false 不加锁', async () => {
    const dlg = document.createElement('cmx-floating-dialog')
    dlg.configure({ lockScroll: false })
    document.body.appendChild(dlg)
    await nextFrame()
    expect(scrollLockCount()).toBe(0)
    expect(document.documentElement.style.overflow).toBe('')
    dlg.remove()
  })

  // ── draggable / resizable / fullscreen / zIndex / dock 冲突 ─────────

  it('draggable:false → data-no-drag；resizable:false → data-no-resize 且样式规则存在', async () => {
    const dlg = document.createElement('cmx-floating-dialog')
    dlg.configure({ draggable: false, resizable: false })
    document.body.appendChild(dlg)
    await nextFrame()
    const box = dlg.shadowRoot.getElementById('dlg-box')
    expect(box.dataset.noDrag).toBe('true')
    expect(box.dataset.noResize).toBe('true')
    const css = dlg.shadowRoot.querySelector('style').textContent
    expect(css).toContain('[data-no-resize="true"]')
    expect(css).toContain('[data-no-drag="true"]')
    dlg.remove()
  })

  it('fullscreen → data-fullscreen + 样式规则；dock 冲突时忽略并 warn', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const dlg = document.createElement('cmx-floating-dialog')
    dlg.configure({ fullscreen: true })
    document.body.appendChild(dlg)
    await nextFrame()
    expect(dlg.shadowRoot.getElementById('dlg-box').dataset.fullscreen).toBe('true')
    expect(dlg.shadowRoot.querySelector('style').textContent).toContain('[data-fullscreen="true"]')
    dlg.remove()

    const dockDlg = document.createElement('cmx-floating-dialog')
    dockDlg.configure({ dock: 'right', fullscreen: true })
    document.body.appendChild(dockDlg)
    await nextFrame()
    expect(dockDlg.shadowRoot.getElementById('dlg-box').hasAttribute('data-fullscreen')).toBe(false)
    expect(warn).toHaveBeenCalledWith('[cmx-floating-dialog] dock 与 fullscreen 冲突，fullscreen 已忽略（dock 优先）')
    warn.mockRestore()
    dockDlg.remove()
  })

  it('zIndex 写入 host 内联样式', async () => {
    const dlg = document.createElement('cmx-floating-dialog')
    dlg.configure({ zIndex: 1200 })
    expect(dlg.style.zIndex).toBe('1200')
    document.body.appendChild(dlg)
    await nextFrame()
    dlg.remove()
  })

  // ── 兼容回归 ────────────────────────────────────────────────────────

  it('旧式 setContent(el)（无 opts）不抛错且内容可达', async () => {
    const dlg = document.createElement('cmx-floating-dialog')
    const el = document.createElement('p')
    el.textContent = 'legacy'
    expect(() => dlg.setContent(el)).not.toThrow()
    document.body.appendChild(dlg)
    await nextFrame()
    expect(dlg.shadowRoot.textContent).toContain('legacy')
    dlg.remove()
  })

  it('连接前 setContent 暂存，连接后经 .dlg-content 注入（opts 同步携带）', async () => {
    const dlg = document.createElement('cmx-floating-dialog')
    dlg.setContent(document.createElement('div'), { padding: '3px' })
    document.body.appendChild(dlg)
    await nextFrame()
    const c = contentOf(dlg)
    expect(c).toBeTruthy()
    expect(c.style.padding).toBe('3px')
    dlg.remove()
  })
})
