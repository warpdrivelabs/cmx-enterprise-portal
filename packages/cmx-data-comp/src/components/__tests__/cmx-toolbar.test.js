// @vitest-environment jsdom
import { describe, expect, it, afterEach } from 'vitest'
import { CmxToolbar } from '../cmx-toolbar.js'

const nextFrame = () => new Promise((r) => requestAnimationFrame(r))

describe('cmx-toolbar', () => {
  afterEach(() => { document.body.innerHTML = '' })

  it('注册为自定义元素', () => {
    expect(customElements.get('cmx-toolbar')).toBe(CmxToolbar)
  })

  it('connectedCallback 后创建 shadow DOM', async () => {
    const el = new CmxToolbar()
    document.body.appendChild(el)
    await nextFrame()
    expect(el.shadowRoot).toBeTruthy()
    expect(el.shadowRoot.querySelector('.toolbar-surface')).toBeTruthy()
  })

  it('gap 属性写为 --cmx-toolbar-gap CSS 变量', async () => {
    const el = new CmxToolbar()
    el.setAttribute('gap', '16')
    document.body.appendChild(el)
    await nextFrame()
    expect(el.style.getPropertyValue('--cmx-toolbar-gap')).toBe('16px')
  })

  it('wrap 属性切换 flex-wrap', async () => {
    const el = new CmxToolbar()
    document.body.appendChild(el)
    await nextFrame()
    const surface = el.shadowRoot.querySelector('.toolbar-surface')
    expect(surface.style.flexWrap).toBe('nowrap')
    el.setAttribute('wrap', '')
    await nextFrame()
    expect(surface.style.flexWrap).toBe('wrap')
  })

  it('align 属性影响 main 区 justify-content', async () => {
    const el = new CmxToolbar()
    el.setAttribute('align', 'center')
    document.body.appendChild(el)
    await nextFrame()
    expect(el.shadowRoot.querySelector('.toolbar-main').style.justifyContent).toBe('center')
  })

  it('neo 皮肤注入 <style> + 加激活 class', async () => {
    const el = new CmxToolbar()
    el.setAttribute('data-cmx-skin', 'neo')
    document.body.appendChild(el)
    await nextFrame()
    expect(el.classList.contains('cmx-toolbar-neo')).toBe(true)
    expect(el.shadowRoot.getElementById('cmx-toolbar-skin-neo')).toBeTruthy()
  })
})
