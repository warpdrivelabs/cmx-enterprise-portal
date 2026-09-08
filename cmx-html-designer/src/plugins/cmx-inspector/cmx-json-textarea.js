/**
 * <cmx-json-textarea> — 带 JSON 语法即时校验的多行输入框
 *
 * 属性：
 *   label="..."     — 上方标签
 *   placeholder=""  — textarea placeholder
 *   rows="6"        — 行数
 *
 * 方法：
 *   setValue(jsonStringOrObject)
 *   getValue() → 当前文本（不解析）
 *   getParsed() → 解析后的 JS 对象 / 数组（无效 JSON 返回 undefined）
 *
 * 事件：
 *   cmx-json-change { value: string, parsed: any | undefined, valid: boolean }
 *
 * 用作 cmx-revo-grid options / totals / rows 等 JSON 属性的入口。
 */

export class CmxJsonTextarea extends HTMLElement {
  constructor() {
    super()
    this._label = ''
    this._placeholder = ''
    this._rows = 6
    this._value = ''
  }

  static get observedAttributes() { return ['label', 'placeholder', 'rows'] }
  attributeChangedCallback(name, _old, val) {
    if (name === 'label')       this._label = val || ''
    if (name === 'placeholder') this._placeholder = val || ''
    if (name === 'rows')        this._rows = Number(val) || 6
    if (this.shadowRoot) this._render()
  }

  connectedCallback() {
    if (this.shadowRoot) return
    this.attachShadow({ mode: 'open' })
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        .label-row { display: flex; align-items: center; gap: 0.5rem; padding: 0.25rem 0; }
        .label-row .grow { flex: 1; }
        .label-row .status {
          font-size: 0.75rem; padding: 0 0.4rem; border-radius: 4px;
          background: var(--sapList_BorderColor); color: var(--sapTextColor);
        }
        .label-row .status.ok  { color: var(--sapPositiveTextColor); }
        .label-row .status.bad { color: var(--sapNegativeTextColor); }
        ui5-textarea { width: 100%; font-family: ui-monospace, 'SF Mono', Consolas, monospace; font-size: 0.78rem; }
        ui5-textarea[invalid]::part(textarea) { border-color: var(--sapNegativeColor); }
        .help { color: var(--sapContent_LabelColor); font-size: 0.75rem; padding-top: 0.2rem; }
      </style>
      <div class="label-row">
        <ui5-label show-colon id="lbl"></ui5-label>
        <span class="grow"></span>
        <span class="status" id="status">空</span>
        <ui5-button id="btnFormat" design="Transparent" tooltip="格式化 JSON">{ }</ui5-button>
      </div>
      <ui5-textarea id="ta"></ui5-textarea>
      <div class="help" id="help"></div>
    `
    this._lbl = this.shadowRoot.getElementById('lbl')
    this._ta = this.shadowRoot.getElementById('ta')
    this._status = this.shadowRoot.getElementById('status')
    this._help = this.shadowRoot.getElementById('help')
    this._render()
    this._ta.addEventListener('input', () => {
      this._value = this._ta.value || ''
      this._update()
    })
    this.shadowRoot.getElementById('btnFormat').addEventListener('click', () => this._format())
  }

  setValue(v) {
    if (v == null) this._value = ''
    else if (typeof v === 'string') this._value = v
    else this._value = JSON.stringify(v, null, 2)
    if (this._ta) this._ta.value = this._value
    this._update(/* silent */ true)
  }

  getValue() { return this._value }

  getParsed() {
    if (!this._value || !this._value.trim()) return undefined
    try { return JSON.parse(this._value) } catch { return undefined }
  }

  _render() {
    if (!this._lbl) return
    this._lbl.textContent = this._label
    this._ta.setAttribute('rows', String(this._rows))
    this._ta.setAttribute('placeholder', this._placeholder)
    if (this._value && !this._ta.value) this._ta.value = this._value
    this._update(true)
  }

  _format() {
    const parsed = this.getParsed()
    if (parsed === undefined) return
    this._value = JSON.stringify(parsed, null, 2)
    this._ta.value = this._value
    this._update()
  }

  _update(silent = false) {
    if (!this._status) return
    if (!this._value.trim()) {
      this._status.textContent = '空'
      this._status.className = 'status'
      this._help.textContent = ''
      this._ta.removeAttribute('value-state')
    } else {
      try {
        JSON.parse(this._value)
        this._status.textContent = 'JSON ✓'
        this._status.className = 'status ok'
        this._help.textContent = ''
        this._ta.setAttribute('value-state', 'Positive')
      } catch (e) {
        this._status.textContent = 'JSON ✗'
        this._status.className = 'status bad'
        this._help.textContent = String(e?.message || e)
        this._ta.setAttribute('value-state', 'Negative')
      }
    }
    if (!silent) {
      this.dispatchEvent(new CustomEvent('cmx-json-change', {
        bubbles: true, composed: true,
        detail: { value: this._value, parsed: this.getParsed(), valid: this.getParsed() !== undefined || !this._value.trim() },
      }))
    }
  }
}

customElements.define('cmx-json-textarea', CmxJsonTextarea)
