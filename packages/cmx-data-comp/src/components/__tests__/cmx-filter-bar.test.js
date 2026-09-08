// @vitest-environment jsdom
import { describe, expect, it, afterEach } from 'vitest'
import { CmxFilterBar } from '../cmx-filter-bar.js'

const nextFrame = () => new Promise((r) => requestAnimationFrame(r))

describe('cmx-filter-bar', () => {
  afterEach(() => { document.body.innerHTML = '' })

  it('注册为自定义元素', () => {
    expect(customElements.get('cmx-filter-bar')).toBe(CmxFilterBar)
  })

  it('connectedCallback 后创建 shadow DOM', async () => {
    const el = new CmxFilterBar()
    document.body.appendChild(el)
    await nextFrame()
    expect(el.shadowRoot.querySelector('.filter-surface')).toBeTruthy()
  })

  it('show-search 缺省视为 true', () => {
    const el = new CmxFilterBar()
    expect(el.showSearch).toBe(true)
  })

  it('show-search 缺省时内置搜索框与 搜索/清空 按钮均显示', async () => {
    const el = new CmxFilterBar()
    document.body.appendChild(el)
    await nextFrame()
    expect(el.shadowRoot.getElementById('search').style.display).toBe('')
    expect(el.shadowRoot.getElementById('btn-search').style.display).toBe('')
    expect(el.shadowRoot.getElementById('btn-reset').style.display).toBe('')
  })

  it('show-search="false" 时搜索框与 搜索/清空 按钮整组隐藏', async () => {
    const el = new CmxFilterBar()
    el.setAttribute('show-search', 'false')
    document.body.appendChild(el)
    await nextFrame()
    expect(el.shadowRoot.getElementById('search').style.display).toBe('none')
    expect(el.shadowRoot.getElementById('btn-search').style.display).toBe('none')
    expect(el.shadowRoot.getElementById('btn-reset').style.display).toBe('none')
  })

  it('search-placeholder 设置到输入框', async () => {
    const el = new CmxFilterBar()
    el.setAttribute('search-placeholder', '请输入编码')
    document.body.appendChild(el)
    await nextFrame()
    expect(el.shadowRoot.getElementById('search').placeholder).toBe('请输入编码')
  })

  it('search() 派发 cmx-filter-search 带 text', async () => {
    const el = new CmxFilterBar()
    el.setAttribute('search-text', 'abc')
    document.body.appendChild(el)
    await nextFrame()
    const events = []
    el.addEventListener('cmx-filter-search', (e) => events.push(e.detail))
    el.search()
    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({ text: 'abc' })
  })

  it('reset() 派发 cmx-filter-reset 并清空 searchText', async () => {
    const el = new CmxFilterBar()
    el.setAttribute('search-text', 'abc')
    document.body.appendChild(el)
    await nextFrame()
    const events = []
    el.addEventListener('cmx-filter-reset', (e) => events.push(e.detail))
    el.reset()
    expect(el.searchText).toBe('')
    expect(events).toHaveLength(1)
  })

  it('collapsible 折叠态隐藏条件行', async () => {
    const el = new CmxFilterBar()
    el.setAttribute('collapsible', '')
    el.setAttribute('collapsed', '')
    document.body.appendChild(el)
    await nextFrame()
    expect(el.shadowRoot.querySelector('.filter-row').style.display).toBe('none')
  })

  it('neo 皮肤注入 <style>', async () => {
    const el = new CmxFilterBar()
    el.setAttribute('data-cmx-skin', 'neo')
    document.body.appendChild(el)
    await nextFrame()
    expect(el.classList.contains('cmx-filter-bar-neo')).toBe(true)
    expect(el.shadowRoot.getElementById('cmx-filter-bar-skin-neo')).toBeTruthy()
  })
})
