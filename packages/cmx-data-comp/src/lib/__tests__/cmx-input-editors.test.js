// @vitest-environment jsdom
/**
 * 基础输入列编辑器（cmx-text-input / cmx-number-input / cmx-date-input / cmx-datetime-input）
 * 纯逻辑测试：校验、取值归一、多语言分量。DOM 渲染依赖 UI5（此处不深测渲染，只测可独立验证的逻辑）。
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { CmxTextInput } from '../../components/cmx-text-input.js'
import { CmxNumberInput } from '../../components/cmx-number-input.js'
import { CmxDateInput } from '../../components/cmx-date-input.js'
import { CmxDatetimeInput } from '../../components/cmx-datetime-input.js'

/** 造一个已 setField 的实例（不挂 DOM，仅测纯逻辑；validate/getValue 不依赖渲染）。 */
function make (Cls, field) {
  const el = new Cls()
  el.setField(field || {})
  return el
}

beforeAll(() => {
  // 确保自定义元素已注册（import 副作用）
  expect(customElements.get('cmx-text-input')).toBeTruthy()
})

describe('cmx-text-input — 校验与多语言', () => {
  it('email 类型内置正则：合法通过、非法拦截、空值放过', () => {
    const el = make(CmxTextInput, { inputType: 'email' })
    el._value = 'a@b.com'; expect(el.validate()).toBe(true)
    el._value = 'bad';     expect(typeof el.validate()).toBe('string')
    el._value = '';        expect(el.validate()).toBe(true)
  })
  it('phone / idcard 内置正则', () => {
    const p = make(CmxTextInput, { inputType: 'phone' })
    p._value = '13800138000'; expect(p.validate()).toBe(true)
    p._value = 'abc';         expect(typeof p.validate()).toBe('string')
    const id = make(CmxTextInput, { inputType: 'idcard' })
    id._value = '110101199003075912'; expect(id.validate()).toBe(true)
    id._value = '123';                expect(typeof id.validate()).toBe('string')
  })
  it('field.pattern 自定义正则优先于 inputType', () => {
    const el = make(CmxTextInput, { inputType: 'text', pattern: '^[A-Z]{2}$' })
    el._value = 'AB'; expect(el.validate()).toBe(true)
    el._value = 'ab'; expect(typeof el.validate()).toBe('string')
  })
  it('maxlength 超长拦截', () => {
    const el = make(CmxTextInput, { length: 3 })
    el._value = 'abcd'; expect(typeof el.validate()).toBe('string')
    el._value = 'abc';  expect(el.validate()).toBe(true)
  })
  it('多语言：字符串归一为当前语言分量，setValue 接受对象', () => {
    const el = make(CmxTextInput, { i18n: true, locale: 'zh_CN' })
    el.setValue('中文', { silent: true })
    expect(el.getValue()).toEqual({ zh_CN: '中文' })
    el.setValue({ zh_CN: '中', en_US: 'En' }, { silent: true })
    expect(el.getValue()).toEqual({ zh_CN: '中', en_US: 'En' })
    expect(el._currentText()).toBe('中')
  })
})

describe('cmx-number-input — 校验与归一', () => {
  it('setValue 归一为 number 或 null', () => {
    const el = make(CmxNumberInput, {})
    el.setValue('12.5', { silent: true }); expect(el.getValue()).toBe(12.5)
    el.setValue('', { silent: true });     expect(el.getValue()).toBe(null)
    el.setValue('x', { silent: true });    expect(el.getValue()).toBe(null)
  })
  it('min / max 边界', () => {
    const el = make(CmxNumberInput, { min: 0, max: 100 })
    el._value = -1;  expect(typeof el.validate()).toBe('string')
    el._value = 200; expect(typeof el.validate()).toBe('string')
    el._value = 50;  expect(el.validate()).toBe(true)
  })
  it('整数位限制', () => {
    const el = make(CmxNumberInput, { integerDigits: 3 })
    el._value = 1234; expect(typeof el.validate()).toBe('string')
    el._value = 123;  expect(el.validate()).toBe(true)
  })
  it('尾部按钮使用计算器图标', () => {
    const el = new CmxNumberInput()
    el.connectedCallback()
    const btn = el.shadowRoot.querySelector('ui5-button[slot="icon"]')
    expect(btn?.getAttribute('icon')).toBe('simulate')
    expect(btn?.getAttribute('tooltip')).toBe('计算器')
  })
})

describe('cmx-date / cmx-datetime — 默认格式', () => {
  it('date 默认 yyyy-MM-dd，datetime 默认含时间', () => {
    const d = make(CmxDateInput, {})
    expect(d._fmt).toBe('yyyy-MM-dd')
    const dt = make(CmxDatetimeInput, {})
    expect(dt._fmt).toBe('yyyy-MM-dd HH:mm:ss')
  })
  it('field.formatPattern 覆盖默认', () => {
    const d = make(CmxDateInput, { formatPattern: 'dd/MM/yyyy' })
    expect(d._fmt).toBe('dd/MM/yyyy')
  })
  it('setValue/getValue 字符串透传', () => {
    const d = make(CmxDateInput, {})
    d.setValue('2026-06-12', { silent: true })
    expect(d.getValue()).toBe('2026-06-12')
  })
  it('date picker 样式清掉内部最小宽度并撑满宿主', () => {
    const d = new CmxDateInput()
    d.connectedCallback()
    const css = d.shadowRoot.querySelector('style')?.textContent || ''
    expect(css).toContain('ui5-date-picker{display:block;width:100%;min-width:0')
    expect(css).toContain('ui5-date-picker::part(input){display:block;width:100%;min-width:0')
  })
})

describe('声明式 HTML 属性 → 配置（设计器调色板场景）', () => {
  it('text：属性映射为 field 配置', () => {
    const el = new CmxTextInput()
    el.setAttribute('input-type', 'email')
    el.setAttribute('maxlength', '20')
    el.setAttribute('placeholder', '邮箱')
    el.setAttribute('i18n', 'true')
    el.setAttribute('readonly', 'true')
    el._applyFieldConfig(el._fieldFromAttributes())
    expect(el._inputType).toBe('email')
    expect(el._maxlength).toBe(20)
    expect(el._placeholder).toBe('邮箱')
    expect(el._i18n).toBe(true)
    expect(el._readonly).toBe(true)
  })
  it('number：属性映射 + 范围/精度生效', () => {
    const el = new CmxNumberInput()
    el.setAttribute('int-digits', '4')
    el.setAttribute('decimal-digits', '2')
    el.setAttribute('min', '0')
    el.setAttribute('max', '100')
    el._applyFieldConfig(el._fieldFromAttributes())
    expect(el._intDigits).toBe(4)
    expect(el._decimalDigits).toBe(2)
    expect(el._min).toBe(0)
    expect(el._max).toBe(100)
    el._value = 200; expect(typeof el.validate()).toBe('string')
    el._value = 50;  expect(el.validate()).toBe(true)
  })
  it('date / datetime：format/min-date/max-date 映射', () => {
    const d = new CmxDateInput()
    d.setAttribute('format', 'dd/MM/yyyy')
    d.setAttribute('min-date', '2024-01-01')
    d._applyFieldConfig(d._fieldFromAttributes())
    expect(d._fmt).toBe('dd/MM/yyyy')
    expect(d._minDate).toBe('2024-01-01')
    const dt = new CmxDatetimeInput()
    dt.setAttribute('format', 'yyyy/MM/dd HH:mm')
    dt._applyFieldConfig(dt._fieldFromAttributes())
    expect(dt._fmt).toBe('yyyy/MM/dd HH:mm')
  })
  it('readonly="false" 不置只读；bool 属性缺省不改', () => {
    const el = new CmxTextInput()
    el.setAttribute('readonly', 'false')
    el._applyFieldConfig(el._fieldFromAttributes())
    expect(el._readonly).toBe(false)
  })
  it('外部 setField 后标记 externally，属性不再回流覆盖', () => {
    const el = new CmxNumberInput()
    el.setField({ min: 5, max: 10 })
    expect(el._fieldSetExternally).toBe(true)
    // attributeChangedCallback 在 externally 模式下应直接 return（不抛错、不改配置）
    el.setAttribute('min', '999')
    el.attributeChangedCallback()
    expect(el._min).toBe(5)
  })
})
