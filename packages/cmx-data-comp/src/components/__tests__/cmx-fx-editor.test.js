// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { CmxFxEditor } from '../cmx-fx-editor.js'

/**
 * cmx-fx-editor：通用 fx 函数/公式编辑器。内置函数内建、取数函数注入。
 * 验证注入面（configure）、内置目录、逐参拼串、commit 事件——不依赖真实布局。
 */
function mount (cfg) {
  const el = new CmxFxEditor()
  document.body.appendChild(el)  // connectedCallback：装 style
  if (cfg) el.configure(cfg)
  return el
}

describe('cmx-fx-editor · 内置函数（内建）', () => {
  it('打开后内置 tab 含 SUM/VLOOKUP，且不依赖任何注入', async () => {
    const el = mount()
    await el.open()
    // 切到内置 tab
    el._state.tab = 'builtin'
    el._render()
    const names = Array.from(el.shadowRoot.querySelectorAll('[data-fxe-builtin]')).map((b) => b.getAttribute('data-fxe-builtin'))
    expect(names).toContain('SUM')
    expect(names).toContain('VLOOKUP')
    expect(names.length).toBeGreaterThan(100)
  })

  it('点内置 SUM → 逐参子面板 → buildFormula 出 SUM(...)', async () => {
    const el = mount()
    await el.open()
    el._state.tab = 'builtin'
    el._render()
    el.shadowRoot.querySelector('[data-fxe-builtin="SUM"]').click()
    expect(el._state.sub).toBeTruthy()
    expect(el._state.sub.fn.name).toBe('SUM')
    el._state.sub.args[0] = 'D3:D7'
    el._refreshSubOut()
    expect(el.shadowRoot.querySelector('[data-fxe-subout]').textContent).toBe('SUM(D3:D7)')
  })
})

describe('cmx-fx-editor · 取数函数（注入，不内建）', () => {
  const FETCH = [
    { name: 'QM', help: '期末余额', example: "QM(0,@current,'1001')", prototype: { params: [
      { name: '期间', kind: 'period', required: true },
      { name: '组织', kind: 'org', required: true },
      { name: '对象', kind: 'object', required: true },
    ] } },
    { name: 'FS', help: '发生额', example: "FS(0,@current,'1001')", prototype: { params: [{ name: '期间', kind: 'period' }] } },
  ]

  it('注入 fetchFunctions → 取数 tab 渲染注入项', async () => {
    const el = mount({ fetchFunctions: FETCH })
    await el.open() // 默认 fetch tab
    const names = Array.from(el.shadowRoot.querySelectorAll('[data-fxe-fetch]')).map((b) => b.getAttribute('data-fxe-fetch'))
    expect(names).toEqual(['QM', 'FS'])
  })

  it('未注入 → 取数 tab 空态提示', async () => {
    const el = mount()
    await el.open()
    expect(el.shadowRoot.querySelector('[data-fxe-fetch]')).toBeNull()
    expect(el.shadowRoot.querySelector('.fxe-empty')).toBeTruthy()
  })

  it('注入 paramControls → object kind 用注入渲染器；未注入 → 退化文本框', async () => {
    const withCtl = mount({ fetchFunctions: FETCH, paramControls: { object: () => '<select data-fxe-arg="2" class="injected"></select>' } })
    await withCtl.open()
    withCtl.shadowRoot.querySelector('[data-fxe-fetch="QM"]').click()
    expect(withCtl.shadowRoot.querySelector('select.injected')).toBeTruthy()

    const noCtl = mount({ fetchFunctions: FETCH })
    await noCtl.open()
    noCtl.shadowRoot.querySelector('[data-fxe-fetch="QM"]').click()
    // object 无注入 → 普通 input（无 injected class）
    expect(noCtl.shadowRoot.querySelector('select.injected')).toBeNull()
    expect(noCtl.shadowRoot.querySelectorAll('[data-fxe-arg]').length).toBeGreaterThan(0)
  })
})

describe('cmx-fx-editor · commit 事件（组件不碰画布/后端）', () => {
  it('写入按钮 → 派发 cmx-fx-commit，detail.expr 去前导 =、detail.target 正确', async () => {
    const el = mount({ initialTarget: 'C5' })
    const spy = vi.fn()
    el.addEventListener('cmx-fx-commit', (e) => spy(e.detail))
    await el.open()
    el._state.expr = '=SUM(D3:D7)'
    el.shadowRoot.querySelector('[data-fxe-insert]').click()
    expect(spy).toHaveBeenCalledWith({ expr: 'SUM(D3:D7)', target: 'C5' })
  })

  it('getInitialExpr 注入 → 打开回显该格已有公式', async () => {
    const el = mount({ initialTarget: 'B2', getInitialExpr: (t) => (t === 'B2' ? "=QM(0,@current,'1001')" : '') })
    await el.open()
    expect(el._state.expr).toBe("QM(0,@current,'1001')") // 去前导 =
  })

  it('setTarget 更新页脚目标格', async () => {
    const el = mount({ initialTarget: 'A1' })
    await el.open()
    el.setTarget('Z9')
    expect(el.shadowRoot.querySelector('[data-fxe-tgt]').textContent).toBe('Z9')
  })
})
