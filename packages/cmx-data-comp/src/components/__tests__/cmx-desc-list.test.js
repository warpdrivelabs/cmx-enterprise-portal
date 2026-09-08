// @vitest-environment jsdom
import { describe, expect, it, afterEach } from 'vitest'
import { CmxDescList, CmxDescItem } from '../cmx-desc-list.js'

const nextFrame = () => new Promise((r) => requestAnimationFrame(r))

describe('cmx-desc-list / cmx-desc-item', () => {
  afterEach(() => { document.body.innerHTML = '' })

  it('注册为自定义元素', () => {
    expect(customElements.get('cmx-desc-list')).toBe(CmxDescList)
    expect(customElements.get('cmx-desc-item')).toBe(CmxDescItem)
  })

  it('扫描 cmx-desc-item 子元素渲染为 label:value 行', async () => {
    const el = new CmxDescList()
    el.innerHTML = '<cmx-desc-item label="编码">DOC001</cmx-desc-item><cmx-desc-item label="状态">已审核</cmx-desc-item>'
    document.body.appendChild(el)
    await nextFrame()
    const items = el.shadowRoot.querySelectorAll('.desclist-item')
    expect(items).toHaveLength(2)
    expect(items[0].querySelector('.desclist-label').textContent).toBe('编码')
    expect(items[0].querySelector('.desclist-value').textContent).toBe('DOC001')
  })

  it('columns 属性写为 CSS 变量', async () => {
    const el = new CmxDescList()
    el.setAttribute('columns', '3')
    document.body.appendChild(el)
    await nextFrame()
    expect(el.style.getPropertyValue('--cmx-desclist-cols')).toBe('3')
  })

  it('label-width 属性写为 CSS 变量', async () => {
    const el = new CmxDescList()
    el.setAttribute('label-width', '8rem')
    document.body.appendChild(el)
    await nextFrame()
    expect(el.style.getPropertyValue('--cmx-desclist-label-w')).toBe('8rem')
  })

  it('MutationObserver 响应子元素变化重新渲染', async () => {
    const el = new CmxDescList()
    el.innerHTML = '<cmx-desc-item label="A">1</cmx-desc-item>'
    document.body.appendChild(el)
    await nextFrame()
    expect(el.shadowRoot.querySelectorAll('.desclist-item')).toHaveLength(1)
    // 动态新增子项
    const item = document.createElement('cmx-desc-item')
    item.setAttribute('label', 'B')
    item.textContent = '2'
    el.appendChild(item)
    await nextFrame()
    expect(el.shadowRoot.querySelectorAll('.desclist-item')).toHaveLength(2)
  })

  it('label 值做 HTML 转义（防注入）', async () => {
    const el = new CmxDescList()
    el.innerHTML = '<cmx-desc-item label="<script>x</script>">值</cmx-desc-item>'
    document.body.appendChild(el)
    await nextFrame()
    const label = el.shadowRoot.querySelector('.desclist-label')
    // innerHTML 存的是转义后的实体（未作为 <script> 标签执行）
    expect(label.innerHTML).toContain('&lt;script&gt;')
    expect(label.innerHTML).not.toContain('<script>')
  })

  it('neo 皮肤注入 <style>', async () => {
    const el = new CmxDescList()
    el.setAttribute('data-cmx-skin', 'neo')
    document.body.appendChild(el)
    await nextFrame()
    expect(el.classList.contains('cmx-desc-list-neo')).toBe(true)
    expect(el.shadowRoot.getElementById('cmx-desc-list-skin-neo')).toBeTruthy()
  })
})
