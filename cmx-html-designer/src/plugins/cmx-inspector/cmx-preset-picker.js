/**
 * <cmx-preset-picker> — 列上的 onChange / formatter 函数预设选择器
 *
 * 属性：
 *   role="apply" | "format"   决定列出哪些预设
 *   label
 *
 * 方法：
 *   setValue(specOrFn) — 接受 {preset, args} 或 function（function 走"自定义"模式只显示提示）
 *   getValue() → {preset, args} | null   不返回 function（Designer 序列化时不应该序列化函数）
 *
 * 事件：
 *   cmx-preset-change { spec: {preset, args} | null }
 */

import { listColumnPresets, getColumnPreset } from 'cmx-data-comp/lib/cmx-column-presets.js'

/**
 * 每个预设的 args 表单字段配置。
 * 用一个轻量描述驱动渲染，避免每个预设各写一份 UI。
 */
const ARGS_SCHEMA = {
  multiply: [
    { key: 'sources', label: 'sources (逗号分隔字段名)', type: 'csv' },
    { key: 'target',  label: 'target',                   type: 'text' },
    { key: 'decimals',label: 'decimals',                 type: 'number' },
  ],
  divide: [
    { key: 'numerator',   label: 'numerator',   type: 'text' },
    { key: 'denominator', label: 'denominator', type: 'text' },
    { key: 'target',      label: 'target',      type: 'text' },
    { key: 'decimals',    label: 'decimals',    type: 'number' },
  ],
  sum: [
    { key: 'sources', label: 'sources (逗号分隔)', type: 'csv' },
    { key: 'target',  label: 'target',             type: 'text' },
    { key: 'decimals',label: 'decimals',           type: 'number' },
  ],
  copy: [
    { key: 'source', label: 'source', type: 'text' },
    { key: 'target', label: 'target', type: 'text' },
  ],
  concat: [
    { key: 'fields', label: 'fields (逗号分隔)', type: 'csv' },
    { key: 'sep',    label: 'sep',                type: 'text' },
  ],
  'format-number': [
    { key: 'decimals', label: 'decimals', type: 'number' },
    { key: 'thousand', label: 'thousand', type: 'text' },
    { key: 'prefix',   label: 'prefix',   type: 'text' },
    { key: 'suffix',   label: 'suffix',   type: 'text' },
  ],
  'format-date': [
    { key: 'pattern', label: 'pattern', type: 'text', placeholder: 'yyyy-MM-dd HH:mm' },
  ],
  lookup: [
    { key: 'from',     label: 'from',     type: 'text' },
    { key: 'keyField', label: 'keyField', type: 'text' },
    { key: 'field',    label: 'field',    type: 'text' },
    { key: 'dict',     label: 'dict (JSON 数组)', type: 'json' },
  ],
}

export class CmxPresetPicker extends HTMLElement {
  constructor() {
    super()
    this._role = 'apply'
    this._label = ''
    this._spec = null   // { preset, args } | null
    this._isFn = false
  }

  static get observedAttributes() { return ['role', 'label'] }
  attributeChangedCallback(n, _o, v) {
    if (n === 'role')  this._role = v || 'apply'
    if (n === 'label') this._label = v || ''
    if (this.shadowRoot) this._render()
  }

  connectedCallback() {
    if (this.shadowRoot) return
    this.attachShadow({ mode: 'open' })
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; padding: 0.4rem 0; }
        .row { display: flex; align-items: center; gap: 0.4rem; padding: 0.2rem 0; }
        .row ui5-input, .row ui5-select { flex: 1; }
        .args { padding: 0.25rem 0 0.25rem 0; display: flex; flex-direction: column; gap: 0.2rem; }
        .args .row { padding: 0.1rem 0; }
        .args ui5-label { min-width: 8rem; font-size: 0.78rem; color: var(--sapContent_LabelColor); }
        .fn-warning { color: var(--sapCriticalTextColor); font-size: 0.75rem; padding: 0.2rem 0; }
      </style>
      <div class="row">
        <ui5-label show-colon id="lbl"></ui5-label>
        <ui5-select id="sel">
          <ui5-option data-value="" selected>—（无）</ui5-option>
        </ui5-select>
        <ui5-button id="btnClear" design="Transparent">清除</ui5-button>
      </div>
      <div class="fn-warning" id="fnWarn" hidden>
        当前是 function 形式，不可序列化；选择预设或留空（清除）。
      </div>
      <div class="args" id="args"></div>
    `
    this._lbl = this.shadowRoot.getElementById('lbl')
    this._sel = this.shadowRoot.getElementById('sel')
    this._fnWarn = this.shadowRoot.getElementById('fnWarn')
    this._argsBox = this.shadowRoot.getElementById('args')
    this.shadowRoot.getElementById('btnClear').addEventListener('click', () => {
      this._spec = null
      this._isFn = false
      this._render()
      this._emit()
    })
    this._sel.addEventListener('change', (e) => {
      const v = e.detail?.selectedOption?.dataset?.value || ''
      this._isFn = false
      if (!v) { this._spec = null }
      else { this._spec = { preset: v, args: this._spec?.preset === v ? (this._spec.args || {}) : {} } }
      this._renderArgs()
      this._emit()
    })
    this._render()
  }

  setValue(v) {
    if (v == null) {
      this._spec = null; this._isFn = false
    } else if (typeof v === 'function') {
      this._spec = null; this._isFn = true
    } else if (v && typeof v === 'object' && v.preset) {
      this._spec = { preset: v.preset, args: { ...(v.args || {}) } }; this._isFn = false
    } else {
      this._spec = null; this._isFn = false
    }
    this._render()
  }

  getValue() { return this._spec ? { ...this._spec, args: { ...(this._spec.args || {}) } } : null }

  _render() {
    if (!this._sel) return
    this._lbl.textContent = this._label
    // 重填 select options
    this._sel.innerHTML = '<ui5-option data-value="">—（无）</ui5-option>'
    const presets = listColumnPresets().filter((p) =>
      this._role === 'format' ? p.hasFormat : p.hasApply,
    )
    for (const p of presets) {
      const opt = document.createElement('ui5-option')
      opt.setAttribute('data-value', p.name)
      opt.textContent = p.description ? `${p.name} — ${p.description}` : p.name
      if (this._spec?.preset === p.name) opt.setAttribute('selected', '')
      this._sel.appendChild(opt)
    }
    this._fnWarn.hidden = !this._isFn
    this._renderArgs()
  }

  _renderArgs() {
    this._argsBox.innerHTML = ''
    if (!this._spec) return
    const def = ARGS_SCHEMA[this._spec.preset]
    if (!def) return
    for (const f of def) {
      const row = document.createElement('div')
      row.className = 'row'
      const lbl = document.createElement('ui5-label')
      lbl.setAttribute('show-colon', '')
      lbl.textContent = f.label || f.key
      row.appendChild(lbl)
      const inp = document.createElement('ui5-input')
      if (f.placeholder) inp.setAttribute('placeholder', f.placeholder)
      let cur = this._spec.args[f.key]
      if (f.type === 'csv' && Array.isArray(cur)) cur = cur.join(',')
      else if (f.type === 'json' && cur != null) cur = JSON.stringify(cur)
      inp.value = cur != null ? String(cur) : ''
      inp.addEventListener('input', (e) => {
        const raw = e.target.value
        if (f.type === 'csv') {
          this._spec.args[f.key] = raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : []
        } else if (f.type === 'number') {
          this._spec.args[f.key] = raw === '' ? undefined : Number(raw)
        } else if (f.type === 'json') {
          try { this._spec.args[f.key] = raw ? JSON.parse(raw) : undefined }
          catch { /* keep last good */ }
        } else {
          this._spec.args[f.key] = raw
        }
        this._emit()
      })
      row.appendChild(inp)
      this._argsBox.appendChild(row)
    }
  }

  _emit() {
    this.dispatchEvent(new CustomEvent('cmx-preset-change', {
      bubbles: true, composed: true, detail: { spec: this.getValue() },
    }))
  }
}

customElements.define('cmx-preset-picker', CmxPresetPicker)
