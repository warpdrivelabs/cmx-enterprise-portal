/**
 * <cmx-ignite-combo> — Ignite igc-combo 封装（单选）。
 *
 * 两种用法：
 *   1) 独立 / 主从绑定：setField(field) / setItems(items) / setColumnModel(model) / setDataSet(dsOrRow)
 *   2) form / grid 编辑器：setField(field) + setValue(v) / getValue()（由 ignite-combo field-type 调用）
 *
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

export class CmxIgniteCombo extends HTMLElement {
  constructor () {
    super()
    this._field = null
    this._items = []
    this._row = {}
    this._valueKey = 'value'
    this._displayKey = 'label'
    /* editor 用法下不绑定 _row，直接以 setValue/getValue 维护单值；_silent 防回环 */
    this._value = null
    this._silent = false
    /* 编辑器模式（form/grid field-type）：外部已提供 label，抑制 igc-combo 自带 label，并撑满宿主。 */
    this._editorMode = false
  }

  connectedCallback () {
    if (this.shadowRoot) return
    registerIgniteInputs()
    this.attachShadow({ mode: 'open' })
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; width: 100%; box-sizing: border-box; }
        igc-combo { width: 100%; }
        /* 编辑器/填充宿主模式：宿主撑满单元格并让 igc-combo 垂直居中。
           关键：不强行拉高 igc-combo 内部带边框的容器（part=input），否则边框会被拉伸截断；
           只压小尺寸 + 去外边距，保持控件自然高度居中对齐。 */
        :host([data-cmx-fill-host]) {
          display: flex; align-items: center;
          width: 100%; height: 100%; box-sizing: border-box;
        }
        :host([data-cmx-fill-host]) igc-combo {
          width: 100%;
          --ig-size: var(--ig-size-small, 1);
          margin: 0;
        }
      </style>
      <igc-combo id="combo" single-select></igc-combo>
    `
    this._combo = this.shadowRoot.getElementById('combo')
    /* 显式设 property：仅靠模板 single-select attribute 在某些升级时序下可能未被 Lit 解析为 property，
       导致退回默认多选（带勾选框、可多选）。直接置 property 保证单选。 */
    this._combo.singleSelect = true
    this._combo.addEventListener('igcChange', (e) => this._onValueChange(e))
    this._bootstrapFromAttributes()
    this._syncToCombo()
  }

  disconnectedCallback () {
    unbindDataSetListeners(this)
  }

  setField (field) {
    this._field = field || null
    /* 编辑器路径：options 既可放在 field.options，也可放在 field.editSettings.options；
       valueField / displayTemplate / valueKey / displayKey 也允许从 editSettings 透传。 */
    const es = field?.editSettings || {}
    if (es.valueField) this._valueKey = es.valueField
    if (es.valueKey)   this._valueKey = es.valueKey
    if (es.displayKey) this._displayKey = es.displayKey
    const opts = field?.options || es.options
    if (opts) this.setItems(opts)
    this._syncToCombo()
  }

  setItems (items) {
    this._items = Array.isArray(items) ? items.slice() : []
    this._syncToCombo()
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
          this._value = null /* 游标切换：让 _syncToCombo 重新从行取值 */
          this._syncToCombo()
        },
        onRowChanged: (detail) => {
          if (detail.row === this._row || detail.row?.id === this._row?.id) {
            this._syncToCombo()
          }
        },
      })
    } else {
      unbindDataSetListeners(this)
      this._ds = null
      this._row = dsOrRow && typeof dsOrRow === 'object' ? { ...dsOrRow } : {}
      this._syncToCombo()
    }
  }

  _bootstrapFromAttributes () {
    const field = parseJsonAttr(this, 'data-cmx-field')
    const items = parseJsonAttr(this, 'data-cmx-items')
    const row = parseJsonAttr(this, 'data-cmx-row')
    if (items) this.setItems(items)
    if (field) this.setField(field)
    if (row) this.setDataSet(row)
  }

  _syncToCombo () {
    if (!this._combo) return
    const f = this._field
    if (f) {
      /* 编辑器模式：form/grid 已在外层渲染 label，抑制 igc-combo 自带 label 避免双标签 / 占行错位。 */
      this._combo.label = this._editorMode ? '' : (f.label || f.key || '')
      this._combo.placeholder = f.placeholder || ''
      this._combo.disabled = !!(f.readonly || f.type === 'readonly')
    }
    const data = this._items.map((it) => (
      typeof it === 'object' ? { ...it } : { value: it, label: String(it) }
    ))
    this._combo.data = data
    this._combo.valueKey = this._valueKey
    this._combo.displayKey = this._displayKey
    /* 取值优先级：编辑器模式下用 _value（标量）；主从绑定模式下从 _row[key] 取。 */
    const key = f?.key
    let v = this._value
    if (v == null && key && this._row && this._row[key] != null) v = this._row[key]
    this._applyComboValue(v)
  }

  /** igc-combo（single-select）的 value 是数组；统一用标量入口写入。 */
  _applyComboValue (v) {
    if (!this._combo) return
    this._silent = true
    try {
      if (v == null || v === '') this._combo.value = []
      else this._combo.value = [v]
    } finally {
      this._silent = false
    }
  }

  /** 读取当前选中的标量值（single-select → 数组首元素）。 */
  _readComboValue () {
    const raw = this._combo?.value
    if (Array.isArray(raw)) return raw.length ? raw[0] : null
    return raw == null || raw === '' ? null : raw
  }

  /**
   * @param {CustomEvent} [ev] igcChange 事件。
   * 注意：igcChange 在 igc-combo 内部 _selected 更新【之前】派发，此刻回读 this._combo.value
   * 拿到的是旧值。必须优先用事件 detail.newValue（Ignite 已给出新选值数组）。
   */
  _onValueChange (ev) {
    if (this._silent) return
    let value
    const nv = ev?.detail?.newValue
    if (Array.isArray(nv)) value = nv.length ? nv[0] : null
    else if (nv != null) value = nv
    else value = this._readComboValue()
    this._value = value
    const key = this._field?.key
    if (key) {
      if (this._row && typeof this._row.set === 'function') {
        this._row.set(key, value)
      } else if (this._row) {
        this._row[key] = value
      }
      if (this._field.onChange) {
        try { this._field.onChange(this._row, value, { field: this._field }) } catch (_) {}
      }
    }
    dispatchCmx(this, 'cmx-value-changed', { key: key || null, value, row: this._row })
  }

  // ─── 编辑器（form / grid field-type）API ─────────────────────────────────

  /** 进入编辑器模式：抑制自带 label + 撑满宿主（form/grid field-type 在挂载时调用）。 */
  setEditorMode (b = true) {
    this._editorMode = !!b
    if (this._editorMode) this.setAttribute('data-cmx-fill-host', '')
    else this.removeAttribute('data-cmx-fill-host')
    this._syncToCombo()
    return this
  }

  /** 设置选中值；opts.silent 为 true 时不派发 cmx-value-changed。 */
  setValue (v, opts = {}) {
    this._value = v == null || v === '' ? null : v
    if (opts.silent) this._applyComboValue(this._value)
    else { this._applyComboValue(this._value); this._onValueChange() }
    return this
  }

  /** 读取当前标量选中值。 */
  getValue () {
    return this._value != null ? this._value : this._readComboValue()
  }

  setReadonly (b) {
    if (this._combo) this._combo.disabled = !!b
    return this
  }

  /** 编辑器路径：让 combo 内部输入框聚焦。 */
  focus () { try { this._combo?.focus?.() } catch (_) {} }

  /** 编辑器路径：展开下拉。 */
  open () { try { this._combo?.show?.() } catch (_) {} }
}

customElements.define('cmx-ignite-combo', CmxIgniteCombo)
