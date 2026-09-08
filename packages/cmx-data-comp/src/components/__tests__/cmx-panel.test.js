// @vitest-environment jsdom
import { describe, expect, it, afterEach } from 'vitest'
import { CmxPanel } from '../cmx-panel.js'

const nextFrame = () => new Promise((r) => requestAnimationFrame(r))

describe('cmx-panel', () => {
  afterEach(() => { document.body.innerHTML = '' })

  it('注册为自定义元素', () => {
    expect(customElements.get('cmx-panel')).toBe(CmxPanel)
  })

  it('connectedCallback 后创建 shadow DOM 并渲染标题', async () => {
    const el = new CmxPanel()
    el.setAttribute('title', '我的面板')
    document.body.appendChild(el)
    await nextFrame()
    expect(el.shadowRoot).toBeTruthy()
    const title = el.shadowRoot.getElementById('title')
    expect(title.textContent).toBe('我的面板')
  })

  it('observedAttributes 响应 title 变化', async () => {
    const el = new CmxPanel()
    document.body.appendChild(el)
    await nextFrame()
    el.setAttribute('title', '新标题')
    await nextFrame()
    expect(el.shadowRoot.getElementById('title').textContent).toBe('新标题')
  })

  it('toggle() 切换折叠状态并派发 cmx-panel-collapse', async () => {
    const el = new CmxPanel()
    el.setAttribute('collapsible', '')
    document.body.appendChild(el)
    await nextFrame()

    const events = []
    el.addEventListener('cmx-panel-collapse', (e) => events.push(e.detail))

    expect(el.collapsed).toBe(false)
    el.toggle()
    await nextFrame()
    expect(el.collapsed).toBe(true)
    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({ collapsed: true })

    el.toggle()
    await nextFrame()
    expect(el.collapsed).toBe(false)
    expect(events[1]).toEqual({ collapsed: false })
  })

  it('toggle(false) 显式展开不改变已展开态', async () => {
    const el = new CmxPanel()
    el.setAttribute('collapsible', '')
    document.body.appendChild(el)
    await nextFrame()
    el.toggle(false)
    expect(el.collapsed).toBe(false)
  })

  it('非可折叠面板 toggle() 无效', async () => {
    const el = new CmxPanel()
    document.body.appendChild(el)
    await nextFrame()
    el.toggle()
    expect(el.collapsed).toBe(false)
  })

  it('neo 皮肤：data-cmx-skin="neo" 后加 cmx-panel-neo class + 注入 <style>', async () => {
    const el = new CmxPanel()
    el.setAttribute('data-cmx-skin', 'neo')
    document.body.appendChild(el)
    await nextFrame()
    expect(el.classList.contains('cmx-panel-neo')).toBe(true)
    expect(el.shadowRoot.getElementById('cmx-panel-skin-neo')).toBeTruthy()
  })

  it('flat 皮肤：data-cmx-skin="none" 时不注入 neo 皮肤', async () => {
    const el = new CmxPanel()
    el.setAttribute('data-cmx-skin', 'none')
    document.body.appendChild(el)
    await nextFrame()
    expect(el.classList.contains('cmx-panel-neo')).toBe(false)
    expect(el.shadowRoot.getElementById('cmx-panel-skin-neo')).toBeNull()
  })

  it('tone 属性同步到 data-cmx-skin-tone', async () => {
    const el = new CmxPanel()
    el.setAttribute('data-cmx-skin', 'neo')
    el.tone = 'mint'
    document.body.appendChild(el)
    await nextFrame()
    expect(el.getAttribute('data-cmx-skin-tone')).toBe('mint')
  })

  it('可折叠时标题栏有 aria-expanded', async () => {
    const el = new CmxPanel()
    el.setAttribute('collapsible', '')
    document.body.appendChild(el)
    await nextFrame()
    const head = el.shadowRoot.getElementById('head')
    expect(head.getAttribute('role')).toBe('button')
    expect(head.getAttribute('aria-expanded')).toBe('true')
  })
})
