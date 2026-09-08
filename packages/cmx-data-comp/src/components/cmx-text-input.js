/**
 * <cmx-text-input> — 字符串输入列编辑器（form + grid 双端）
 *
 * 封装 UI5 <ui5-input>，作为 cmx-ui5-form / cmx-revo-grid 的 'text' 字段类型编辑器。
 * 首版完成基础能力，高级能力（弹出多语言编辑面板、字典联想等）后续完善。
 *
 * 能力（首版）：
 *   - 普通文本输入
 *   - 正则校验：field.pattern（或 editSettings.pattern）即时校验，失败置 valueState=Negative
 *   - 特定类型 inputType：'text'|'phone'|'email'|'idcard'，各带内置正则与 UI5 输入类型
 *   - 多语言输入：field.i18n（或 editSettings.i18n）为真时，值以 { 语言: 文本 } 对象存储，
 *                 当前版本编辑「当前语言」分量（locale 默认 zh_CN），其余语言分量原样保留。
 *
 * 公开 API（与 cmx-* 体系一致）：
 *   setField(field)                绑定字段配置（读 inputType/pattern/i18n/maxlength/placeholder/locale）
 *   setValue(v, { silent })        回填值（多语言时接受对象或字符串）
 *   getValue()                     取值（多语言时返回对象，否则字符串）
 *   setReadonly(b) / setPlaceholder(text) / setLocale(loc) / focus()
 *   validate()                     -> true | string(错误信息)
 *
 * @component
 * @fires cmx-value-change - 值变化时触发（bubbles + composed），detail: { value, valid }
 * @attr {('text'|'phone'|'email'|'idcard')} input-type - 输入类型，各带内置正则与 UI5 输入类型
 * @attr {string} pattern - 校验正则（即时校验，失败置 valueState=Negative）
 * @attr {number} maxlength - 最大字符长度
 * @attr {string} placeholder - 占位文本
 * @attr {boolean} i18n - 是否启用多语言输入（值以 { 语言: 文本 } 对象存储）
 * @attr {boolean} readonly - 是否只读
 */

import '@ui5/webcomponents/dist/Input.js'

/** 特定输入类型 → { ui5Type, re(校验正则,可空), placeholder }。re=null 表示不内置校验。 */
const INPUT_TYPES = {
  text:   { ui5Type: 'Text',  re: null,                              placeholder: '' },
  phone:  { ui5Type: 'Tel',   re: /^[+]?[\d\s-]{5,20}$/,             placeholder: '如 13800138000' },
  email:  { ui5Type: 'Email', re: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,      placeholder: '如 name@example.com' },
  // 中国大陆身份证：18 位（末位可为 X）或 15 位
  idcard: { ui5Type: 'Text',  re: /(^\d{15}$)|(^\d{17}[\dXx]$)/,     placeholder: '18 位或 15 位身份证号' },
}

/* 18 位身份证加权因子与校验码表（GB 11643-1999）。 */
const IDCARD_WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]
const IDCARD_CHECK_CODES = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2']

/**
 * 校验中国大陆身份证号的合法性（不止位数）：
 *   - 18 位：出生日期合法 + 末位校验码符合 GB 11643（前 17 位加权和模 11 查表）
 *   - 15 位：仅校验出生日期合法（老身份证无校验码）
 * @param {string} id 已通过位数正则的身份证号
 * @returns {true|string} true 合法，否则返回错误信息
 */
function validateIdCard (id) {
  // 行政区划码（前 6 位）不为全 0（极弱校验，避免明显非法）
  if (/^0{6}/.test(id)) return '身份证地区码非法'
  if (id.length === 18) {
    // 出生日期 yyyyMMdd（第 7–14 位）
    const y = Number(id.slice(6, 10)); const m = Number(id.slice(10, 12)); const d = Number(id.slice(12, 14))
    const dt = new Date(y, m - 1, d)
    if (!(dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d) || y < 1900) {
      return '身份证出生日期非法'
    }
    // 校验码
    let sum = 0
    for (let i = 0; i < 17; i++) sum += Number(id[i]) * IDCARD_WEIGHTS[i]
    const expect = IDCARD_CHECK_CODES[sum % 11]
    if (id[17].toUpperCase() !== expect) return '身份证校验码不正确'
    return true
  }
  // 15 位：校验出生日期（yyMMdd，第 7–12 位，默认 19xx）
  const y = 1900 + Number(id.slice(6, 8)); const m = Number(id.slice(8, 10)); const d = Number(id.slice(10, 12))
  const dt = new Date(y, m - 1, d)
  if (!(dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d)) return '身份证出生日期非法'
  return true
}

const DEFAULT_LOCALE = 'zh_CN'

export class CmxTextInput extends HTMLElement {
  /** 声明式属性（设计器调色板/静态 HTML 用）；外部调 setField 时这些被 field 覆盖。 */
  static get observedAttributes () {
    return ['input-type', 'pattern', 'maxlength', 'placeholder', 'i18n', 'readonly']
  }

  constructor () {
    super()
    this._field = null                 // {object|null} 外部传入的字段配置对象
    this._readonly = false             // {boolean} 是否只读
    this._placeholder = ''             // {string} 占位文本
    this._locale = DEFAULT_LOCALE      // {string} 当前语言（多语言模式下编辑的语言分量）
    this._i18n = false                 // {boolean} 多语言模式：值为 { locale: text } 对象
    this._inputType = 'text'           // {('text'|'phone'|'email'|'idcard')} 输入类型
    this._re = null                    // {RegExp|null} 生效的校验正则
    this._reSource = ''                // {string} 正则来源字符串（用于错误信息展示）
    this._maxlength = null             // {number|null} 最大字符长度
    this._value = null                 // {string|Object|null} 非多语言：string；多语言：{ locale: text }
    this._input = null                 // {HTMLElement|null} ui5-input 实例
    this._fieldSetExternally = false   // {boolean} 外部已 setField → 属性变更不再覆盖配置
    this.attachShadow({ mode: 'open' })
  }

  /** 元素挂载：未外部 setField 时从 HTML 属性拼装 field；按需首次渲染。 */
  connectedCallback () {
    // 外部未 setField 时，从 HTML 属性拼 field（设计器/静态 HTML 场景）
    if (!this._fieldSetExternally && !this._field && this._hasAnyObservedAttr()) {
      this.setField(this._fieldFromAttributes())
      this._fieldSetExternally = false
    }
    if (!this._input) this._render()
  }

  /** 属性变化回调：仅在「非外部 setField」模式下回流为 field 重设并刷新视图。 */
  attributeChangedCallback () {
    // 仅在「非外部 setField」模式下，属性变更回流为 field 重设
    if (this._fieldSetExternally) return
    if (!this._input) return            // 尚未渲染，connectedCallback 会统一处理
    const f = this._fieldFromAttributes()
    this._field = f
    this._applyFieldConfig(f)
    this._fieldSetExternally = false
    this._applyToInput()
    this._writeToInput()
  }

  /** 是否声明了任意 observed 属性（用于判断是否需从属性拼装 field）。 */
  _hasAnyObservedAttr () {
    return CmxTextInput.observedAttributes.some((n) => this.hasAttribute(n))
  }

  /** HTML 属性 → field 对象（键名对齐 setField 读取的 field.* / editSettings.*）。 */
  _fieldFromAttributes () {
    const a = (n) => this.getAttribute(n)
    const f = {}
    if (a('input-type') != null) f.inputType = a('input-type')
    if (a('pattern') != null) f.pattern = a('pattern')
    if (a('maxlength') != null) f.maxlength = a('maxlength')
    if (a('placeholder') != null) f.placeholder = a('placeholder')
    if (this.hasAttribute('i18n')) f.i18n = a('i18n') !== 'false'
    if (this.hasAttribute('readonly')) f.readonly = a('readonly') !== 'false'
    return f
  }

  // ─── 配置 ────────────────────────────────────────────────────────────────

  /**
   * 绑定字段配置（读 inputType/pattern/i18n/maxlength/placeholder/locale/readonly）。
   * 调用后进入「外部配置模式」，HTML 属性变更不再回流覆盖。
   * @param {object} field 字段配置对象（键名对齐 editSettings 约定）
   * @returns {CmxTextInput} this（链式）
   */
  setField (field) {
    this._fieldSetExternally = true
    this._applyFieldConfig(field)
    this._applyToInput()
    return this
  }

  /** 解析 field 配置到内部状态（setField / 属性回流共用，不含 externally 标记）。 */
  _applyFieldConfig (field) {
    this._field = field || {}
    const es = this._field.editSettings || {}
    // inputType：field.inputType | editSettings.inputType（缺省 text）
    const it = String(this._field.inputType || es.inputType || 'text').toLowerCase()
    this._inputType = INPUT_TYPES[it] ? it : 'text'
    // 多语言
    this._i18n = !!(this._field.i18n ?? es.i18n)
    // locale
    if (this._field.locale || es.locale) this._locale = this._field.locale || es.locale
    // 校验正则：field.pattern 优先，否则用 inputType 内置正则
    const patternStr = this._field.pattern ?? es.pattern
    if (patternStr) {
      try { this._re = new RegExp(String(patternStr)); this._reSource = String(patternStr) }
      catch (_) { this._re = null; this._reSource = '' }
    } else {
      this._re = INPUT_TYPES[this._inputType].re
      this._reSource = this._re ? this._re.source : ''
    }
    this._maxlength = Number(this._field.maxlength ?? this._field.length ?? es.maxlength) || null
    this._placeholder = this._field.placeholder || es.placeholder || INPUT_TYPES[this._inputType].placeholder
    this._readonly = !!this._field.readonly
  }

  /** 设置只读状态并同步到 ui5-input。 @param {boolean} b 是否只读 @returns {CmxTextInput} this */
  setReadonly (b) { this._readonly = !!b; this._applyToInput(); return this }
  /** 设置占位文本并同步到 ui5-input。 @param {string} t 占位文本 @returns {CmxTextInput} this */
  setPlaceholder (t) { this._placeholder = t || ''; this._applyToInput(); return this }
  /** 切换当前语言（多语言模式下生效），并刷新输入框显示对应语言分量。 @param {string} loc 语言代码 @returns {CmxTextInput} this */
  setLocale (loc) { if (loc) { this._locale = loc; this._writeToInput() } return this }

  // ─── 取/赋值 ──────────────────────────────────────────────────────────────

  /**
   * 回填值（多语言时接受对象或字符串，字符串视为当前语言分量）。
   * @param {string|Object|null} v 值
   * @param {object} [opts] 选项
   * @param {boolean} [opts.silent=false] 为 true 时不触发 cmx-value-change 事件
   * @returns {CmxTextInput} this（链式）
   */
  setValue (v, opts = {}) {
    this._value = this._i18n ? this._coerceI18n(v) : (v == null ? '' : v)
    this._writeToInput()
    if (!opts.silent) this._emit()
    return this
  }

  /**
   * 取当前值。多语言时返回 { locale: text } 对象，否则返回字符串。
   * @returns {string|Object|null}
   */
  getValue () { return this._value }

  /** 提交输入框里的挂起文本到 _value（grid 取值前调用，确保拿到最新输入）。 */
  commitPending () { this._onInput(); return this._value }

  /** 当前语言分量的纯文本（多语言时取 locale 分量；否则原值）。 */
  _currentText () {
    if (this._i18n) {
      const obj = this._value && typeof this._value === 'object' ? this._value : {}
      return obj[this._locale] ?? ''
    }
    return this._value == null ? '' : String(this._value)
  }

  /** 把任意输入归一为多语言对象。字符串视为「当前语言」分量。 */
  _coerceI18n (v) {
    if (v && typeof v === 'object') return { ...v }
    if (v == null || v === '') return {}
    return { [this._locale]: String(v) }
  }

  // ─── 校验 ────────────────────────────────────────────────────────────────

  /**
   * 校验当前值（长度 / 正则 / 身份证附加校验）。空值放过（由 required 负责）。
   * @returns {true|string} true 表示合法；否则返回错误信息字符串
   */
  validate () {
    const text = this._currentText()
    if (text === '') return true                     // 空值由 required 负责，这里放过
    if (this._maxlength && text.length > this._maxlength) return `长度不能超过 ${this._maxlength}`
    if (this._re && !this._re.test(text)) {
      const label = { phone: '电话格式不正确', email: '邮箱格式不正确', idcard: '身份证格式不正确' }[this._inputType]
      return label || `格式不正确（${this._reSource}）`
    }
    // 身份证：位数正则通过后，进一步校验出生日期 + GB 11643 校验码
    if (this._inputType === 'idcard') {
      const res = validateIdCard(text)
      if (res !== true) return res
    }
    return true
  }

  /** 聚焦内部 ui5-input（实例可能尚未渲染，吞异常）。 */
  focus () { try { this._input?.focus() } catch (_) {} }

  // ─── 渲染 ────────────────────────────────────────────────────────────────

  /** 首次渲染：创建 shadow DOM 样式 + ui5-input，绑定 input/change 事件。 */
  _render () {
    const style = document.createElement('style')
    style.textContent = ':host{display:block;width:100%}ui5-input{width:100%}' +
      /* grid 单元格编辑器：撑满单元格宽高（block 100%×100%）。margin:0 关键——UI5 给
         ui5-input :host 设了默认 margin-top:3px，Firefox 下生效导致编辑器整体下移、顶部留白。 */
      ':host([data-cmx-fill-host]){height:100%;box-sizing:border-box}' +
      ':host([data-cmx-fill-host]) ui5-input{display:block;width:100%;height:100%;margin:0;vertical-align:top;box-sizing:border-box}'
    const input = document.createElement('ui5-input')
    input.addEventListener('input', () => this._onInput())
    input.addEventListener('change', () => this._onInput())
    this.shadowRoot.append(style, input)
    this._input = input
    this._applyToInput()
    this._writeToInput()
  }

  /** 将当前配置（type/placeholder/maxlength/readonly）同步到 ui5-input 属性。 */
  _applyToInput () {
    const el = this._input
    if (!el) return
    el.setAttribute('type', INPUT_TYPES[this._inputType].ui5Type)
    if (this._placeholder) el.setAttribute('placeholder', this._placeholder); else el.removeAttribute('placeholder')
    if (this._maxlength) el.setAttribute('maxlength', String(this._maxlength)); else el.removeAttribute('maxlength')
    if (this._readonly) el.setAttribute('readonly', ''); else el.removeAttribute('readonly')
  }

  /** 把 _value 当前语言分量文本写回 ui5-input.value（避免无变化时重置光标）。 */
  _writeToInput () {
    if (!this._input) return
    const text = this._currentText()
    if (this._input.value !== text) this._input.value = text
  }

  /** input/change 事件处理：把挂起文本写回 _value，做即时校验反馈并派发事件。 */
  _onInput () {
    const text = this._input?.value ?? ''
    if (this._i18n) {
      // 多语言：仅更新当前语言分量，空串则删除该分量，其余语言分量原样保留
      const obj = this._value && typeof this._value === 'object' ? { ...this._value } : {}
      if (text === '') delete obj[this._locale]; else obj[this._locale] = text
      this._value = obj
    } else {
      this._value = text
    }
    // 即时校验反馈
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
    // 清旧
    Array.from(el.children).forEach((c) => { if (c.slot === 'valueStateMessage') c.remove() })
    if (msg) {
      const div = document.createElement('div')
      div.slot = 'valueStateMessage'
      div.textContent = msg
      el.appendChild(div)
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

if (!customElements.get('cmx-text-input')) customElements.define('cmx-text-input', CmxTextInput)
