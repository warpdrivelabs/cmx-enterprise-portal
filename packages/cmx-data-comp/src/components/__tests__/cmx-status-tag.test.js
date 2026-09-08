// @vitest-environment jsdom
import { describe, expect, it, afterEach } from 'vitest'
import { CmxStatusTag } from '../cmx-status-tag.js'

const nextFrame = () => new Promise((r) => requestAnimationFrame(r))

describe('cmx-status-tag', () => {
  afterEach(() => { document.body.innerHTML = '' })

  it('注册为自定义元素', () => {
    expect(customElements.get('cmx-status-tag')).toBe(CmxStatusTag)
  })

  it('connectedCallback 后创建 shadow DOM', async () => {
    const el = new CmxStatusTag()
    document.body.appendChild(el)
    await nextFrame()
    expect(el.shadowRoot.querySelector('.tag-surface')).toBeTruthy()
  })

  it('tone 默认 neutral', () => {
    const el = new CmxStatusTag()
    expect(el.tone).toBe('neutral')
  })

  it('variant 默认 solid', () => {
    const el = new CmxStatusTag()
    expect(el.variant).toBe('solid')
  })

  it('dot 属性显示前缀圆点', async () => {
    const el = new CmxStatusTag()
    document.body.appendChild(el)
    await nextFrame()
    expect(el.shadowRoot.querySelector('.tag-dot').style.display).toBe('none')
    el.setAttribute('dot', '')
    await nextFrame()
    expect(el.shadowRoot.querySelector('.tag-dot').style.display).toBe('')
  })

  it('neo 皮肤注入 <style> + 加激活 class', async () => {
    const el = new CmxStatusTag()
    el.setAttribute('data-cmx-skin', 'neo')
    el.setAttribute('tone', 'success')
    document.body.appendChild(el)
    await nextFrame()
    expect(el.classList.contains('cmx-status-tag-neo')).toBe(true)
    expect(el.shadowRoot.getElementById('cmx-status-tag-skin-neo')).toBeTruthy()
  })

  it('tone=success 时 neo 皮肤定义 --tag-c 为 mint 色', async () => {
    const el = new CmxStatusTag()
    el.setAttribute('data-cmx-skin', 'neo')
    el.setAttribute('tone', 'success')
    document.body.appendChild(el)
    await nextFrame()
    const css = el.shadowRoot.getElementById('cmx-status-tag-skin-neo').textContent
    expect(css).toContain('[tone="success"]')
    expect(css).toContain('--neo-mint')
  })
})
