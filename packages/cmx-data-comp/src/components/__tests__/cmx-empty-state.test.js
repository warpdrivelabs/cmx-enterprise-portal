// @vitest-environment jsdom
import { describe, expect, it, afterEach } from 'vitest'
import { CmxEmptyState } from '../cmx-empty-state.js'

const nextFrame = () => new Promise((r) => requestAnimationFrame(r))

describe('cmx-empty-state', () => {
  afterEach(() => { document.body.innerHTML = '' })

  it('注册为自定义元素', () => {
    expect(customElements.get('cmx-empty-state')).toBe(CmxEmptyState)
  })

  it('connectedCallback 后创建 shadow DOM', async () => {
    const el = new CmxEmptyState()
    document.body.appendChild(el)
    await nextFrame()
    expect(el.shadowRoot.querySelector('.empty-surface')).toBeTruthy()
  })

  it('title 属性渲染到标题区', async () => {
    const el = new CmxEmptyState()
    el.setAttribute('title', '暂无数据')
    document.body.appendChild(el)
    await nextFrame()
    expect(el.shadowRoot.getElementById('title').textContent).toBe('暂无数据')
  })

  it('description 属性渲染到副标题区', async () => {
    const el = new CmxEmptyState()
    el.setAttribute('description', '点击新增')
    document.body.appendChild(el)
    await nextFrame()
    expect(el.shadowRoot.getElementById('desc-text').textContent).toBe('点击新增')
  })

  it('icon 属性默认 activity-assistance', () => {
    const el = new CmxEmptyState()
    expect(el.icon).toBe('activity-assistance')
  })

  it('size 默认 md', () => {
    const el = new CmxEmptyState()
    expect(el.size).toBe('md')
  })

  it('neo 皮肤注入 <style> + 加激活 class', async () => {
    const el = new CmxEmptyState()
    el.setAttribute('data-cmx-skin', 'neo')
    document.body.appendChild(el)
    await nextFrame()
    expect(el.classList.contains('cmx-empty-state-neo')).toBe(true)
    expect(el.shadowRoot.getElementById('cmx-empty-state-skin-neo')).toBeTruthy()
  })
})
