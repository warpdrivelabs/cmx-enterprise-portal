/**
 * <cmx-ignite-gauge> — Ignite Radial / Linear / Bullet Graph 封装。
 *
 * 属性：data-cmx-gauge-type="radial|linear|bullet"
 * API：setOptions(opts) / setValue(n) / setDataSet(dsOrRow, { valueField })
 * 事件：cmx-value-changed { value, row, field }
 */
import { registerIgniteGauges } from './register-gauges.js'
import {
  parseJsonAttr,
  isCmxDataSet,
  bindDataSetListeners,
  unbindDataSetListeners,
  dispatchCmx,
} from './cmx-ignite-shared.js'

const TAG_BY_TYPE = {
  radial: 'igc-radial-gauge',
  linear: 'igc-linear-gauge',
  bullet: 'igc-bullet-graph',
}

export class CmxIgniteGauge extends HTMLElement {
  constructor () {
    super()
    this._type = 'radial'
    this._opts = { minimum: 0, maximum: 100 }
    this._value = 0
    this._valueField = 'value'
    this._row = null
  }

  connectedCallback () {
    if (this.shadowRoot) return
    registerIgniteGauges()
    this._type = this.getAttribute('data-cmx-gauge-type')
      || this.getAttribute('gauge-type')
      || 'radial'
    this.attachShadow({ mode: 'open' })
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        .gauge-host { width: 100%; min-height: 120px; }
      </style>
      <div class="gauge-host" id="host"></div>
    `
    this._host = this.shadowRoot.getElementById('host')
    this._mountGauge()
    this._bootstrapFromAttributes()
    this._syncToGauge()
  }

  disconnectedCallback () {
    unbindDataSetListeners(this)
    this._gauge = null
  }

  setOptions (opts) {
    this._opts = { ...this._opts, ...(opts || {}) }
    this._syncToGauge()
  }

  setValue (value) {
    this._value = Number(value) || 0
    this._syncToGauge()
  }

  setDataSet (dsOrRow, opts = {}) {
    if (opts.valueField) this._valueField = opts.valueField
    if (isCmxDataSet(dsOrRow)) {
      bindDataSetListeners(this, dsOrRow, {
        onCursor: (row) => {
          this._row = row
          this._applyRowValue()
        },
        onRowChanged: (detail) => {
          if (detail.row === this._row) this._applyRowValue()
        },
      })
    } else {
      unbindDataSetListeners(this)
      this._ds = null
      this._row = dsOrRow && typeof dsOrRow === 'object' ? dsOrRow : null
      this._applyRowValue()
    }
  }

  _applyRowValue () {
    if (!this._row) return
    const v = this._row[this._valueField]
    if (v != null) this.setValue(v)
  }

  _bootstrapFromAttributes () {
    const opts = parseJsonAttr(this, 'data-cmx-options')
    const row = parseJsonAttr(this, 'data-cmx-row')
    const value = parseJsonAttr(this, 'data-cmx-value')
    if (this.hasAttribute('data-cmx-value-field')) {
      this._valueField = this.getAttribute('data-cmx-value-field')
    }
    if (opts) this.setOptions(opts)
    if (value != null) this.setValue(value)
    if (row) this.setDataSet(row)
  }

  _mountGauge () {
    const tag = TAG_BY_TYPE[this._type] || TAG_BY_TYPE.radial
    this._gauge = document.createElement(tag)
    this._gauge.style.width = '100%'
    this._gauge.style.height = '100%'
    this._host.innerHTML = ''
    this._host.appendChild(this._gauge)
  }

  _syncToGauge () {
    if (!this._gauge) return
    const { minimum, maximum, width, height } = this._opts
    if (minimum != null && 'minimumValue' in this._gauge) this._gauge.minimumValue = minimum
    if (maximum != null && 'maximumValue' in this._gauge) this._gauge.maximumValue = maximum
    if (width) this._gauge.width = width
    if (height) this._gauge.height = height
    if ('value' in this._gauge) this._gauge.value = this._value
  }
}

customElements.define('cmx-ignite-gauge', CmxIgniteGauge)
