/**
 * <cmx-number-input> — 数值输入列编辑器（form + grid 双端）
 *
 * 封装 UI5 <ui5-input type=Number>，作为 'number' 字段类型编辑器。
 * 首版完成基础能力，高级能力（科学计数、单位换算、历史表达式等）后续完善。
 *
 * 能力（首版）：
 *   - 直接输入数字
 *   - 整数位/小数位限制：intDigits / decimalDigits（提交时四舍五入到小数位、校验整数位）
 *   - 表达式自动计算：输入以 '=' 开头或含运算符时，失焦/回车按表达式求值（用 formula-eval，安全）
 *   - 下拉微型计算器：点尾部按钮弹出，基本四则 + 小数 + 退格 + 等于，应用回写
 *
 * 公开 API：
 *   setField(field)                读 intDigits/decimalDigits/min/max/placeholder/readonly/thousandSeparator
 *   setValue(v,{silent}) / getValue()
 *   setReadonly(b) / setPlaceholder(t) / focus()
 *   validate() -> true | string
 *
 * @component
 * @fires cmx-value-change - 值变化时触发（bubbles + composed），detail: { value, valid }
 * @attr {number} int-digits - 整数位上限
 * @attr {number} decimal-digits - 小数位上限（提交时四舍五入到指定位数）
 * @attr {number} min - 最小值
 * @attr {number} max - 最大值
 * @attr {string} placeholder - 占位文本
 * @attr {boolean} readonly - 是否只读
 */

import '@ui5/webcomponents/dist/Input.js'
import '@ui5/webcomponents/dist/Button.js'
import '@ui5/webcomponents/dist/Popover.js'
import '@ui5/webcomponents-icons/dist/simulate.js'
import { evalFormula } from '../lib/formula-eval.js'

export class CmxNumberInput extends HTMLElement {
  constructor () {
    super()
    this._field = null               // {object|null} 外部传入的字段配置对象
    this._readonly = false           // {boolean} 是否只读
    this._placeholder = ''           // {string} 占位文本
    this._intDigits = null           // {number|null} 整数位上限
    this._decimalDigits = null       // {number|null} 小数位上限（提交时四舍五入）
    this._min = null                 // {number|null} 最小值
    this._max = null                 // {number|null} 最大值
    this._value = null               // {number|null} 当前数值
    this._input = null               // {HTMLElement|null} ui5-input 实例
    this._popover = null             // {HTMLElement|null} 计算器 Popover 实例
    this._calcExpr = ''              // {string} 计算器累积表达式
    this._fieldSetExternally = false // {boolean} 外部已 setField → 属性变更不再覆盖配置
    this.attachShadow({ mode: 'open' })
  }

  /** 声明式属性（设计器调色板/静态 HTML 用）；外部调 setField 时这些被 field 覆盖。 */
  static get observedAttributes () {
    return ['int-digits', 'decimal-digits', 'min', 'max', 'placeholder', 'readonly']
  }

  /** 元素挂载：未外部 setField 时从 HTML 属性拼装 field；按需首次渲染。 */
  connectedCallback () {
    if (!this._fieldSetExternally && !this._field && this._hasAnyObservedAttr()) {
      this.setField(this._fieldFromAttributes())
      this._fieldSetExternally = false
    }
    if (!this._input) this._render()
  }

  /** 属性变化回调：仅在「非外部 setField」模式下回流为 field 重设并刷新视图。 */
  attributeChangedCallback () {
    if (this._fieldSetExternally) return
    if (!this._input) return
    this._applyFieldConfig(this._fieldFromAttributes())
    this._fieldSetExternally = false
    this._applyToInput()
    this._writeToInput()
  }

  /** 是否声明了任意 observed 属性（用于判断是否需从属性拼装 field）。 */
  _hasAnyObservedAttr () {
    return CmxNumberInput.observedAttributes.some((n) => this.hasAttribute(n))
  }

  /** HTML 属性 → field 对象（键名对齐 setField 读取的 field.*）。 */
  _fieldFromAttributes () {
    const a = (n) => this.getAttribute(n)
    const f = {}
    if (a('int-digits') != null) f.intDigits = a('int-digits')
    if (a('decimal-digits') != null) f.decimalDigits = a('decimal-digits')
    if (a('min') != null) f.min = a('min')
    if (a('max') != null) f.max = a('max')
    if (a('placeholder') != null) f.placeholder = a('placeholder')
    if (this.hasAttribute('readonly')) f.readonly = a('readonly') !== 'false'
    return f
  }

  // ─── 配置 ────────────────────────────────────────────────────────────────

  /**
   * 绑定字段配置（读 intDigits/decimalDigits/min/max/placeholder/readonly）。
   * 调用后进入「外部配置模式」，HTML 属性变更不再回流覆盖。
   * @param {object} field 字段配置对象（键名对齐 editSettings 约定）
   * @returns {CmxNumberInput} this（链式）
   */
  setField (field) {
    this._fieldSetExternally = true
    this._applyFieldConfig(field)
    this._applyToInput()
    return this
  }

  /** 解析 field 配置到内部状态（setField / 属性回流共用）。 */
  _applyFieldConfig (field) {
    this._field = field || {}
    const es = this._field.editSettings || {}
    this._intDigits = _num(this._field.integerDigits ?? this._field.intDigits ?? es.intDigits)
    this._decimalDigits = _num(this._field.decimalDigits ?? es.decimalDigits)
    this._min = _num(this._field.min ?? es.min)
    this._max = _num(this._field.max ?? es.max)
    this._placeholder = this._field.placeholder || es.placeholder || ''
    this._readonly = !!this._field.readonly
  }

  /** 设置只读状态并同步到 ui5-input。 @param {boolean} b 是否只读 @returns {CmxNumberInput} this */
  setReadonly (b) { this._readonly = !!b; this._applyToInput(); return this }
  /** 设置占位文本并同步到 ui5-input。 @param {string} t 占位文本 @returns {CmxNumberInput} this */
  setPlaceholder (t) { this._placeholder = t || ''; this._applyToInput(); return this }

  // ─── 取/赋值 ──────────────────────────────────────────────────────────────

  /**
   * 回填数值（接受 number 或可转换为 number 的字符串，空值置 null）。
   * @param {number|string|null} v 值
   * @param {object} [opts] 选项
   * @param {boolean} [opts.silent=false] 为 true 时不触发 cmx-value-change 事件
   * @returns {CmxNumberInput} this（链式）
   */
  setValue (v, opts = {}) {
    this._value = (v == null || v === '') ? null : (Number.isFinite(Number(v)) ? Number(v) : null)
    this._writeToInput()
    if (!opts.silent) this._emit()
    return this
  }

  /**
   * 取当前数值。
   * @returns {number|null}
   */
  getValue () { return this._value }

  /** 提交输入框里的"挂起文本"（求值/归一为数值并写回 _value）。
   *  grid 单元格编辑场景：revo-grid 抢走回车/失焦后直接调 getValue 取值，
   *  需先用本方法把 '=12*16' 这类未提交文本求值，否则取到旧 _value。 */
  commitPending () { this._onCommit(); return this._value }

  // ─── 校验 ────────────────────────────────────────────────────────────────

  /**
   * 校验当前数值（有限性 / min / max / 整数位）。空值（null）放过。
   * @returns {true|string} true 表示合法；否则返回错误信息字符串
   */
  validate () {
    const v = this._value
    if (v == null) return true
    if (!Number.isFinite(v)) return '不是有效数值'
    if (this._min != null && v < this._min) return `不能小于 ${this._min}`
    if (this._max != null && v > this._max) return `不能大于 ${this._max}`
    if (this._intDigits != null) {
      // 取整数部分绝对值的位数（0 视为 0 位）做上限校验
      const intLen = String(Math.trunc(Math.abs(v))).replace(/^0$/, '').length
      if (intLen > this._intDigits) return `整数位不能超过 ${this._intDigits} 位`
    }
    return true
  }

  /** 聚焦内部 ui5-input（实例可能尚未渲染，吞异常）。 */
  focus () { try { this._input?.focus() } catch (_) {} }

  // ─── 渲染 ────────────────────────────────────────────────────────────────

  /** 首次渲染：创建 shadow DOM 样式 + ui5-input（type=Text）+ 计算器按钮，绑定 change/keydown。 */
  _render () {
    const style = document.createElement('style')
    style.textContent = `
      :host{display:block;width:100%}
      ui5-input{width:100%}
      :host([data-cmx-fill-host]){height:100%;box-sizing:border-box}
      :host([data-cmx-fill-host]) ui5-input{display:block;width:100%;height:100%;margin:0;vertical-align:top;box-sizing:border-box}
      .calc{display:grid;grid-template-columns:repeat(4,3rem);grid-auto-rows:2.25rem;gap:4px;padding:8px}
      .calc ui5-button{min-width:0}
      .calc .disp{grid-column:1/5;text-align:right;font:600 1rem/2rem ui-monospace,monospace;padding:0 8px;
        border:1px solid var(--sapField_BorderColor,#999);border-radius:4px;overflow:hidden;white-space:nowrap}
      .calc .ok{grid-column:1/5}
    `
    const input = document.createElement('ui5-input')
    /* 用 Text 而非 Number：HTML <input type=number> 会被浏览器丢弃 '='、'*'、'(' 等非数字字符，
       导致表达式输入（=12*16）打不进去、千分位逗号也无法显示。改 Text 后由本组件的
       _onCommit（失焦/回车）负责把原始文本求值/归一为数值，校验交给 validate()。 */
    input.setAttribute('type', 'Text')
    // 尾部计算器按钮（icon 插槽）
    const btn = document.createElement('ui5-button')
    btn.setAttribute('icon', 'simulate')
    btn.setAttribute('design', 'Transparent')
    btn.setAttribute('slot', 'icon')
    btn.setAttribute('tooltip', '计算器')
    btn.addEventListener('click', (e) => { e.stopPropagation(); this._openCalc() })
    input.appendChild(btn)
    input.addEventListener('change', () => this._onCommit())
    // 回车即按表达式求值
    input.addEventListener('keydown', (e) => { if ((e.detail?.key || e.key) === 'Enter') this._onCommit() })
    this.shadowRoot.append(style, input)
    this._input = input
    this._applyToInput()
    this._writeToInput()
  }

  /** 将当前配置（placeholder/readonly）同步到 ui5-input 属性。 */
  _applyToInput () {
    const el = this._input
    if (!el) return
    if (this._placeholder) el.setAttribute('placeholder', this._placeholder); else el.removeAttribute('placeholder')
    if (this._readonly) el.setAttribute('readonly', ''); else el.removeAttribute('readonly')
  }

  /** 把 _value 格式化后写回 ui5-input.value（避免无变化时重置光标）。 */
  _writeToInput () {
    if (!this._input) return
    const text = this._value == null ? '' : this._formatValue(this._value)
    if (this._input.value !== text) this._input.value = text
  }

  /** 按小数位格式化（不加千分位，避免 type=Number 解析问题）。 */
  _formatValue (n) {
    if (this._decimalDigits != null) return Number(n).toFixed(this._decimalDigits)
    return String(n)
  }

  /** 失焦/回车：原值或表达式求值 → 归一 → 校验 → 回写。 */
  _onCommit () {
    const raw = String(this._input?.value ?? '').trim()
    if (raw === '') { this._value = null; this._finishCommit(); return }
    let n
    if (raw.startsWith('=') || /[+\-*/()]/.test(raw.replace(/^[+-]/, ''))) {
      // 表达式：去掉前导 '='，用安全求值器
      const expr = raw.replace(/^=/, '')
      const r = evalFormula(expr, {}, NaN)
      n = Number(r)
    } else {
      n = Number(raw)
    }
    if (!Number.isFinite(n)) {
      this._input.valueState = 'Negative'
      this._setValueStateText('无法识别的数值/表达式')
      return
    }
    if (this._decimalDigits != null) {
      const p = Math.pow(10, this._decimalDigits)
      n = Math.round(n * p) / p
    }
    this._value = n
    this._finishCommit()
  }

  /** 提交收尾：回写视图 + 即时校验反馈 + 派发事件。 */
  _finishCommit () {
    this._writeToInput()
    const res = this.validate()
    const ok = res === true
    this._input.valueState = ok ? 'None' : 'Negative'
    this._setValueStateText(ok ? '' : String(res))
    this._emit(ok)
  }

  /** 设置/清除 ui5-input 的 valueStateMessage 插槽内容（错误提示文本）。 */
  _setValueStateText (msg) {
    const el = this._input
    if (!el) return
    Array.from(el.children).forEach((c) => { if (c.slot === 'valueStateMessage') c.remove() })
    if (msg) {
      const div = document.createElement('div'); div.slot = 'valueStateMessage'; div.textContent = msg; el.appendChild(div)
    }
  }

  // ─── 微型计算器 ────────────────────────────────────────────────────────────

  /** 打开计算器 Popover：以当前值为初始表达式，按需惰性构建 Popover。 */
  _openCalc () {
    if (!this._popover) this._buildCalc()
    this._calcExpr = this._value == null ? '' : String(this._value)
    this._renderCalcDisp()
    this._popover.opener = this._input
    this._popover.open = true
  }

  /** 惰性构建计算器 Popover：显示屏 + 4×5 按键网格（数字/四则/小数点/等于/清除/退格）+ 底部"确定"按钮。 */
  _buildCalc () {
    const pop = document.createElement('ui5-popover')
    pop.setAttribute('placement', 'Bottom')
    pop.hideArrow = true
    const wrap = document.createElement('div')
    wrap.className = 'calc'
    const disp = document.createElement('div'); disp.className = 'disp'; disp.textContent = '0'
    wrap.appendChild(disp)
    const keys = ['7','8','9','/','4','5','6','*','1','2','3','-','0','.','=','+','C','⌫']
    for (const k of keys) {
      const b = document.createElement('ui5-button')
      b.textContent = k
      if (k === '=') b.setAttribute('design', 'Emphasized')
      if (k === 'C' || k === '⌫') b.setAttribute('design', 'Transparent')
      b.addEventListener('click', () => this._calcKey(k))
      wrap.appendChild(b)
    }
    // 底部"确定"按钮：全宽，与 = 同语义（求值 → 写回 → 关闭 Popover），
    // 中文场景下比 "=" 更直观。
    const ok = document.createElement('ui5-button')
    ok.textContent = '确定'
    ok.setAttribute('design', 'Emphasized')
    ok.className = 'ok'
    ok.addEventListener('click', () => this._calcKey('确定'))
    wrap.appendChild(ok)
    pop.appendChild(wrap)
    this.shadowRoot.appendChild(pop)
    this._popover = pop
    this._calcDisp = disp
  }

  /** 刷新计算器显示屏文本（空表达式显示 '0'）。 */
  _renderCalcDisp () { if (this._calcDisp) this._calcDisp.textContent = this._calcExpr || '0' }

  /**
   * 计算器按键处理。
   * @param {string} k 按键文本（数字/运算符/'.'/'='/'确定'/'C'/'⌫'）
   */
  _calcKey (k) {
    if (k === 'C') { this._calcExpr = ''; this._renderCalcDisp(); return }
    if (k === '⌫') { this._calcExpr = this._calcExpr.slice(0, -1); this._renderCalcDisp(); return }
    if (k === '=' || k === '确定') {
      // = / 确定：求值表达式 → 小数位四舍五入 → 回写 _value 并关闭 Popover；非法显示"错误"
      this._calcCommit()
      return
    }
    this._calcExpr += k
    this._renderCalcDisp()
  }

  /**
   * 计算器提交：求值当前表达式，按小数位四舍五入后写回 _value、刷新显示、
   * 同步输入框、派发 cmx-value-change 并关闭 Popover；非法表达式仅显示"错误"。
   * "=" 与"确定"共用此路径，行为完全一致。
   */
  _calcCommit () {
    const r = evalFormula(this._calcExpr || '0', {}, NaN)
    if (Number.isFinite(Number(r))) {
      let n = Number(r)
      if (this._decimalDigits != null) { const p = Math.pow(10, this._decimalDigits); n = Math.round(n * p) / p }
      this._value = n
      this._calcExpr = String(n)
      this._renderCalcDisp()
      this._writeToInput()
      this._finishCommit()
      this._popover.open = false
    } else {
      this._calcDisp.textContent = '错误'
    }
  }

  /**
   * 派发 cmx-value-change 事件。
   * @param {boolean} [valid] 是否校验通过；缺省时按当前 validate() 结果计算
   */
  _emit (valid = (this.validate() === true)) {
    this.dispatchEvent(new CustomEvent('cmx-value-change', {
      bubbles: true, composed: true, detail: { value: this._value, valid },
    }))
  }
}

/**
 * 把任意值转换为有限数，无法转换或为空时返回 null。
 * @param {*} v 输入值
 * @returns {number|null}
 */
function _num (v) {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

if (!customElements.get('cmx-number-input')) customElements.define('cmx-number-input', CmxNumberInput)
