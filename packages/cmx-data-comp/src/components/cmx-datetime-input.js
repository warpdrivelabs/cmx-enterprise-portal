/**
 * <cmx-datetime-input> — 日期+时间输入列编辑器（form + grid 双端）
 *
 * 封装 UI5 <ui5-datetime-picker>，作为 'datetime' 字段类型编辑器。
 * 首版完成基础能力（格式设置 + 下拉日期/时间选择），秒级精度/时区等后续完善。
 *
 * 公开 API：
 *   setField(field)         读 formatPattern/format/minDate/maxDate/placeholder/readonly
 *   setValue(v,{silent}) / getValue()   值为字符串（按 formatPattern，默认 yyyy-MM-dd HH:mm:ss）
 *   setReadonly(b) / setPlaceholder(t) / focus()
 *   validate() -> true | string
 *
 * @component
 * @fires cmx-value-change - 值变化时触发（bubbles + composed），detail: { value, valid }
 * @attr {string} format - 日期时间格式串（默认 yyyy-MM-dd HH:mm:ss）
 * @attr {string} min-date - 最小可选日期
 * @attr {string} max-date - 最大可选日期
 * @attr {string} placeholder - 占位文本
 * @attr {boolean} readonly - 是否只读
 */

import '@ui5/webcomponents/dist/DateTimePicker.js'

const DEFAULT_FMT = 'yyyy-MM-dd HH:mm:ss'

export class CmxDatetimeInput extends HTMLElement {
  constructor () {
    super()
    this._field = null               // {object|null} 外部传入的字段配置对象
    this._readonly = false           // {boolean} 是否只读
    this._placeholder = ''           // {string} 占位文本
    this._fmt = DEFAULT_FMT          // {string} 日期时间格式串
    this._minDate = null             // {string|null} 最小可选日期
    this._maxDate = null             // {string|null} 最大可选日期
    this._value = ''                 // {string} 当前值（按格式串文本）
    this._picker = null              // {HTMLElement|null} ui5-datetime-picker 实例
    this._fieldSetExternally = false // {boolean} 外部已 setField → 属性变更不再覆盖配置
    this.attachShadow({ mode: 'open' })
  }

  /** 声明式属性（设计器调色板/静态 HTML 用）；外部调 setField 时这些被 field 覆盖。 */
  static get observedAttributes () {
    return ['format', 'min-date', 'max-date', 'placeholder', 'readonly']
  }

  /** 元素挂载：未外部 setField 时从 HTML 属性拼装 field；按需首次渲染。 */
  connectedCallback () {
    if (!this._fieldSetExternally && !this._field && this._hasAnyObservedAttr()) {
      this.setField(this._fieldFromAttributes())
      this._fieldSetExternally = false
    }
    if (!this._picker) this._render()
  }

  /** 属性变化回调：仅在「非外部 setField」模式下回流为 field 重设并刷新视图。 */
  attributeChangedCallback () {
    if (this._fieldSetExternally) return
    if (!this._picker) return
    this._applyFieldConfig(this._fieldFromAttributes())
    this._fieldSetExternally = false
    this._applyToPicker()
    this._writeToPicker()
  }

  /** 是否声明了任意 observed 属性（用于判断是否需从属性拼装 field）。 */
  _hasAnyObservedAttr () {
    return CmxDatetimeInput.observedAttributes.some((n) => this.hasAttribute(n))
  }

  /** HTML 属性 → field 对象（键名对齐 setField 读取的 field.*）。 */
  _fieldFromAttributes () {
    const a = (n) => this.getAttribute(n)
    const f = {}
    if (a('format') != null) f.formatPattern = a('format')
    if (a('min-date') != null) f.minDate = a('min-date')
    if (a('max-date') != null) f.maxDate = a('max-date')
    if (a('placeholder') != null) f.placeholder = a('placeholder')
    if (this.hasAttribute('readonly')) f.readonly = a('readonly') !== 'false'
    return f
  }

  /**
   * 绑定字段配置（读 formatPattern/format/minDate/maxDate/placeholder/readonly）。
   * 调用后进入「外部配置模式」，HTML 属性变更不再回流覆盖。
   * @param {object} field 字段配置对象（键名对齐 editSettings 约定）
   * @returns {CmxDatetimeInput} this（链式）
   */
  setField (field) {
    this._fieldSetExternally = true
    this._applyFieldConfig(field)
    this._applyToPicker()
    return this
  }

  /** 解析 field 配置到内部状态（setField / 属性回流共用）。 */
  _applyFieldConfig (field) {
    this._field = field || {}
    const es = this._field.editSettings || {}
    this._fmt = this._field.formatPattern || this._field.format || es.formatPattern || es.format || DEFAULT_FMT
    this._minDate = this._field.minDate || es.minDate || null
    this._maxDate = this._field.maxDate || es.maxDate || null
    this._placeholder = this._field.placeholder || es.placeholder || ''
    this._readonly = !!this._field.readonly
  }

  /** 设置只读状态并同步到 picker。 @param {boolean} b 是否只读 @returns {CmxDatetimeInput} this */
  setReadonly (b) { this._readonly = !!b; this._applyToPicker(); return this }
  /** 设置占位文本并同步到 picker。 @param {string} t 占位文本 @returns {CmxDatetimeInput} this */
  setPlaceholder (t) { this._placeholder = t || ''; this._applyToPicker(); return this }

  /**
   * 回填值（字符串形式，按格式串文本）。
   * @param {string|null} v 值
   * @param {object} [opts] 选项
   * @param {boolean} [opts.silent=false] 为 true 时不触发 cmx-value-change 事件
   * @returns {CmxDatetimeInput} this（链式）
   */
  setValue (v, opts = {}) {
    this._value = v == null ? '' : String(v)
    this._writeToPicker()
    if (!opts.silent) this._emit()
    return this
  }

  /**
   * 取当前值（按格式串文本）。
   * @returns {string}
   */
  getValue () { return this._value }

  /** 提交 picker 里的挂起文本到 _value（grid 取值前调用）。 */
  commitPending () {
    const el = this._picker
    if (el && el.value != null && el.value !== this._value) this._value = el.value
    return this._value
  }

  /**
   * 校验当前值（委托 ui5-datetime-picker 自带格式校验）。空值放过。
   * @returns {true|string} true 表示合法；否则返回错误信息字符串
   */
  validate () {
    const el = this._picker
    if (el && typeof el.isValid === 'function' && this._value && !el.isValid(this._value)) return '日期时间格式不正确'
    return true
  }

  /** 聚焦内部 picker（实例可能尚未渲染，吞异常）。 */
  focus () { try { this._picker?.focus() } catch (_) {} }

  /** 首次渲染：创建 shadow DOM 样式 + ui5-datetime-picker，绑定 change 事件。 */
  _render () {
    const style = document.createElement('style')
    style.textContent = ':host{display:block;width:100%}ui5-datetime-picker{width:100%}' +
      ':host([data-cmx-fill-host]){height:100%;box-sizing:border-box}' +
      ':host([data-cmx-fill-host]) ui5-datetime-picker{display:block;width:100%;height:100%;margin:0;vertical-align:top;box-sizing:border-box}' +
      /* 同 date：穿透内部 input part 让它撑满列宽。 */
      ':host([data-cmx-fill-host]) ui5-datetime-picker::part(input){display:block;width:100%;box-sizing:border-box}'
    const dp = document.createElement('ui5-datetime-picker')
    dp.addEventListener('change', (e) => {
      this._value = e.detail?.value ?? e.target?.value ?? ''
      const ok = this.validate() === true
      this._emit(ok)
    })
    this.shadowRoot.append(style, dp)
    this._picker = dp
    this._applyToPicker()
    this._writeToPicker()
    this._fixIconAlign()
  }

  /* 同 cmx-date-input：把 ui5-datetime-picker 内部图标(.inputIcon)的 align-self:start 改为 center
     垂直居中（图标可能晚于 picker 挂载，重试几帧）。 */
  _fixIconAlign (tries = 8) {
    const dp = this._picker
    if (!dp || !dp.shadowRoot) { if (tries > 0) requestAnimationFrame(() => this._fixIconAlign(tries - 1)); return }
    const icon = dp.shadowRoot.querySelector('ui5-icon.inputIcon')
    if (icon) { icon.style.alignSelf = 'center'; return }
    if (tries > 0) requestAnimationFrame(() => this._fixIconAlign(tries - 1))
  }

  /** 将当前配置（format/minDate/maxDate/placeholder/readonly）同步到 picker 属性。 */
  _applyToPicker () {
    const el = this._picker
    if (!el) return
    el.setAttribute('format-pattern', this._fmt)
    if (this._minDate) el.setAttribute('min-date', this._minDate); else el.removeAttribute('min-date')
    if (this._maxDate) el.setAttribute('max-date', this._maxDate); else el.removeAttribute('max-date')
    if (this._placeholder) el.setAttribute('placeholder', this._placeholder); else el.removeAttribute('placeholder')
    if (this._readonly) el.setAttribute('readonly', ''); else el.removeAttribute('readonly')
  }

  /** 把 _value 写回 picker.value（避免无变化时重置光标）。 */
  _writeToPicker () {
    if (!this._picker) return
    const v = this._value || ''
    if (this._picker.value !== v) this._picker.value = v
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

if (!customElements.get('cmx-datetime-input')) customElements.define('cmx-datetime-input', CmxDatetimeInput)
