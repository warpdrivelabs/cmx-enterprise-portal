/**
 * <cmx-ignite-input> — Ignite igc-input 封装，绑定 CmxDataSet 当前行字段。
 *
 * API：setField(field) / setColumnModel(model) / setDataSet(dsOrRow)
 * 事件：cmx-value-changed { key, value, row }
 */
import { CmxColumnAdapter } from '../../lib/cmx-column-adapter.js'
import { registerIgniteInputs } from './register-inputs.js'
import {
  parseJsonAttr,
  isCmxDataSet,
  bindDataSetListeners,
  unbindDataSetListeners,
  dispatchCmx,
} from './cmx-ignite-shared.js'

export class CmxIgniteInput extends HTMLElement {
  constructor () {
    super()
    this._field = null
    this._row = {}
    this._ds = null
  }

  connectedCallback () {
    if (this.shadowRoot) return
    registerIgniteInputs()
    this.attachShadow({ mode: 'open' })
    this.shadowRoot.innerHTML = `
      <style>:host{display:block} igc-input{width:100%}</style>
      <igc-input id="input"></igc-input>
    `
    this._input = this.shadowRoot.getElementById('input')
    this._input.addEventListener('igcChange', () => this._onValueChange())
    this._bootstrapFromAttributes()
    this._syncToInput()
  }

  disconnectedCallback () {
    unbindDataSetListeners(this)
  }

  setField (field) {
    this._field = field || null
    this._syncToInput()
  }

  setColumnModel (model) {
    if (!model) return
    const fields = CmxColumnAdapter.toCmxForm(model)
    this.setField(fields[0] || null)
  }

  setDataSet (dsOrRow) {
    if (isCmxDataSet(dsOrRow)) {
      bindDataSetListeners(this, dsOrRow, {
        onCursor: (row) => {
          this._row = row || {}
          this._syncToInput()
        },
        onRowChanged: (detail) => {
          if (detail.row === this._row || detail.row?.id === this._row?.id) {
            this._syncToInput()
          }
        },
      })
    } else {
      unbindDataSetListeners(this)
      this._ds = null
      this._row = dsOrRow && typeof dsOrRow === 'object' ? { ...dsOrRow } : {}
      this._syncToInput()
    }
  }

  getValue () {
    return this._input?.value
  }

  _bootstrapFromAttributes () {
    const field = parseJsonAttr(this, 'data-cmx-field')
    const row = parseJsonAttr(this, 'data-cmx-row')
    if (field) this.setField(field)
    if (row) this.setDataSet(row)
  }

  _syncToInput () {
    if (!this._input || !this._field) return
    const f = this._field
    this._input.label = f.label || f.key || ''
    this._input.placeholder = f.placeholder || ''
    this._input.type = f.type === 'number' ? 'number' : 'text'
    this._input.readonly = !!(f.readonly || f.type === 'readonly')
    const key = f.key
    const raw = key ? this._row[key] : ''
    this._input.value = raw == null ? '' : String(raw)
  }

  _onValueChange () {
    if (!this._field?.key) return
    const key = this._field.key
    const value = this._input.type === 'number'
      ? (Number(this._input.value) || 0)
      : this._input.value
    if (this._row && typeof this._row.set === 'function') {
      this._row.set(key, value)
    } else {
      this._row[key] = value
    }
    if (this._field.onChange) {
      try { this._field.onChange(this._row, value, { field: this._field }) } catch (_) {}
    }
    dispatchCmx(this, 'cmx-value-changed', { key, value, row: this._row })
  }
}

customElements.define('cmx-ignite-input', CmxIgniteInput)
