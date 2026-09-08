// @vitest-environment jsdom
import { describe, expect, it, afterEach } from 'vitest'
import { CmxKpiCard } from '../cmx-kpi-card.js'

const nextFrame = () => new Promise((r) => requestAnimationFrame(r))

describe('cmx-kpi-card', () => {
  afterEach(() => { document.body.innerHTML = '' })

  it('注册为自定义元素', () => {
    expect(customElements.get('cmx-kpi-card')).toBe(CmxKpiCard)
  })

  it('connectedCallback 后创建 shadow DOM 并渲染 label/value', async () => {
    const el = new CmxKpiCard()
    el.setAttribute('label', '资产')
    el.setAttribute('value', '1,234.56')
    document.body.appendChild(el)
    await nextFrame()
    expect(el.shadowRoot.querySelector('.kpi-surface')).toBeTruthy()
    expect(el.shadowRoot.getElementById('label').textContent).toBe('资产')
    expect(el.shadowRoot.getElementById('value').textContent).toBe('1,234.56')
  })

  it('unit 属性渲染且无 unit 时隐藏', async () => {
    const el = new CmxKpiCard()
    el.setAttribute('unit', '万元')
    document.body.appendChild(el)
    await nextFrame()
    const unitEl = el.shadowRoot.getElementById('unit')
    expect(unitEl.textContent).toBe('万元')
    expect(unitEl.style.display).toBe('')
    el.removeAttribute('unit')
    await nextFrame()
    expect(el.shadowRoot.getElementById('unit').style.display).toBe('none')
  })

  it('trend=up 显示 ▲ 箭头 + delta', async () => {
    const el = new CmxKpiCard()
    el.setAttribute('trend', 'up')
    el.setAttribute('delta', '+5.2%')
    document.body.appendChild(el)
    await nextFrame()
    const trendEl = el.shadowRoot.getElementById('trend')
    expect(trendEl.style.display).toBe('')
    expect(trendEl.textContent).toContain('▲')
    expect(trendEl.textContent).toContain('+5.2%')
    expect(trendEl.dataset.trend).toBe('up')
  })

  it('无 trend 时趋势区隐藏', async () => {
    const el = new CmxKpiCard()
    document.body.appendChild(el)
    await nextFrame()
    expect(el.shadowRoot.getElementById('trend').style.display).toBe('none')
  })

  it('clickable 时加 role/tabindex 并派发 cmx-kpi-click', async () => {
    const el = new CmxKpiCard()
    el.setAttribute('clickable', '')
    el.setAttribute('label', '现金流入')
    el.setAttribute('value', '56,789.00')
    document.body.appendChild(el)
    await nextFrame()
    const surface = el.shadowRoot.querySelector('.kpi-surface')
    expect(surface.getAttribute('role')).toBe('link')
    expect(surface.getAttribute('tabindex')).toBe('0')

    const events = []
    el.addEventListener('cmx-kpi-click', (e) => events.push(e.detail))
    surface.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({ label: '现金流入', value: '56,789.00' })
  })

  it('非 clickable 时点击不派发事件', async () => {
    const el = new CmxKpiCard()
    document.body.appendChild(el)
    await nextFrame()
    const events = []
    el.addEventListener('cmx-kpi-click', (e) => events.push(e.detail))
    el.shadowRoot.querySelector('.kpi-surface').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(events).toHaveLength(0)
  })

  it('neo 皮肤注入 <style> + 加激活 class', async () => {
    const el = new CmxKpiCard()
    el.setAttribute('data-cmx-skin', 'neo')
    el.setAttribute('tone', 'success')
    document.body.appendChild(el)
    await nextFrame()
    expect(el.classList.contains('cmx-kpi-card-neo')).toBe(true)
    expect(el.shadowRoot.getElementById('cmx-kpi-card-skin-neo')).toBeTruthy()
  })

  it('tone=success 时 neo 皮肤定义 --neo-mint', async () => {
    const el = new CmxKpiCard()
    el.setAttribute('data-cmx-skin', 'neo')
    el.setAttribute('tone', 'success')
    document.body.appendChild(el)
    await nextFrame()
    const css = el.shadowRoot.getElementById('cmx-kpi-card-skin-neo').textContent
    expect(css).toContain('[tone="success"]')
    expect(css).toContain('--neo-mint')
  })

  it('variant 默认 card', () => {
    const el = new CmxKpiCard()
    expect(el.variant).toBe('card')
  })
})
