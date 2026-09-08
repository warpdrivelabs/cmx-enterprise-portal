/**
 * <cmx-ignite-grid> — Ignite UI igc-grid 封装
 *
 * 与 cmx-revo-grid / cmx-ui5-table 对齐的 API：
 *   setColumnModel(model) / setColumns / setOptions / setDataSet / setTotals
 *
 * 事件：
 *   cmx-row-selected           { id }
 *   cmx-row-selection-change   { ids }
 *   cmx-cell-changed           { id, key, value, row }
 *   cmx-row-added / cmx-row-removed
 *
 * 声明式：data-cmx-columns / data-cmx-rows / data-cmx-options / data-cmx-totals
 */
import { CmxColumnAdapter } from '../../lib/cmx-column-adapter.js'
import { registerIgniteGrids } from './register-grids.js'
import {
  parseJsonAttr,
  isCmxDataSet,
  bindDataSetListeners,
  unbindDataSetListeners,
  dispatchCmx,
} from './cmx-ignite-shared.js'

const DEFAULT_OPTIONS = {
  selectionMode: 'single',
  rowHeight: 36,
  viewHeight: 440,
  fillHeight: false,
  virtualScroll: true,
  showRowIndex: false,
  readonly: false,
  totals: null,
  primaryKey: 'id',
}

export class CmxIgniteGrid extends HTMLElement {
  constructor () {
    super()
    this._columns = []
    this._opts = { ...DEFAULT_OPTIONS }
    this._rows = []
    this._ds = null
    this._selectedId = null
    this._selectedIds = new Set()
    this._dsProvider = null
    this._fillHeightRo = null
    this._grid = null
  }

  connectedCallback () {
    if (this.shadowRoot) return
    registerIgniteGrids()
    this.attachShadow({ mode: 'open' })
    this.shadowRoot.innerHTML = `<style>${this._css()}</style>${this._html()}`
    this._host = this.shadowRoot.getElementById('host')
    this._grid = document.createElement('igc-grid')
    this._grid.className = 'cmx-ignite-inner'
    this._grid.primaryKey = this._opts.primaryKey
    this._host.appendChild(this._grid)
    this._applySize()
    this._bindGridEvents()
    this._bootstrapFromAttributes()
    this._syncToGrid()
  }

  disconnectedCallback () {
    this._stopFillHeightObserver()
    this._detachDsRowListeners()
    unbindDataSetListeners(this)
    this._unbindGridEvents()
    this._grid = null
  }

  setColumnModel (model) {
    if (!model) return
    const { columns, totals } = CmxColumnAdapter.toIgniteGrid(model)
    this._columns = columns
    if (totals) this._opts = { ...this._opts, totals }
    if (this._grid) this._syncToGrid()
  }

  setColumns (columns) {
    this._columns = CmxColumnAdapter.cmxColumnsToIgnite(columns)
    if (this._grid) this._syncToGrid()
  }

  setOptions (opts) {
    this._opts = { ...this._opts, ...(opts || {}) }
    if (this.shadowRoot) {
      this._applySize()
      this._syncToGrid()
    }
  }

  setTotals (totals) {
    this._opts = { ...this._opts, totals: totals || null }
  }

  setDataSet (dsOrRows, sel = {}) {
    if (isCmxDataSet(dsOrRows)) {
      this._detachDsRowListeners()
      unbindDataSetListeners(this)
      this._ds = dsOrRows
      this._rows = dsOrRows.rows
      if ('selectedId' in sel) this._selectedId = sel.selectedId ?? null
      if ('selectedIds' in sel) this._selectedIds = new Set(sel.selectedIds || [])
      this._pruneSelection()
      bindDataSetListeners(this, dsOrRows, {
        onCursor: (row) => {
          this._selectedId = row?.id ?? null
          if (this._opts.selectionMode !== 'multi') {
            this._selectedIds = row ? new Set([row.id]) : new Set()
          }
          this._syncGridSelection()
          if (row && this._opts.selectionMode !== 'none') {
            dispatchCmx(this, 'cmx-row-selected', { id: row.id })
          }
        },
        onRowChanged: () => {
          if (this._grid) this._grid.data = this._rows.slice()
        },
      })
      this._onDsRowsChanged = () => this._refreshFromDs()
      dsOrRows.addEventListener('ds-row-added', this._onDsRowsChanged)
      dsOrRows.addEventListener('ds-row-removed', this._onDsRowsChanged)
      if (this._grid) {
        this._grid.data = this._rows.slice()
        this._syncGridSelection()
      }
    } else {
      this._detachDsRowListeners()
      unbindDataSetListeners(this)
      this._ds = null
      this._rows = Array.isArray(dsOrRows) ? dsOrRows : []
      if ('selectedId' in sel) this._selectedId = sel.selectedId ?? null
      if ('selectedIds' in sel) this._selectedIds = new Set(sel.selectedIds || [])
      this._pruneSelection()
      if (this._grid) {
        this._grid.data = this._rows.slice()
        this._syncGridSelection()
      }
    }
  }

  _detachDsRowListeners () {
    if (this._ds && this._onDsRowsChanged) {
      this._ds.removeEventListener('ds-row-added', this._onDsRowsChanged)
      this._ds.removeEventListener('ds-row-removed', this._onDsRowsChanged)
    }
    this._onDsRowsChanged = null
  }

  addRow (row, opts = {}) {
    if (!row?.id) return null
    const added = this._ds ? this._ds.addRow(row) : row
    if (!this._ds) this._rows.push(added)
    if (this._grid) this._grid.data = this._rows.slice()
    dispatchCmx(this, 'cmx-row-added', { id: added.id, row: added, index: this._rows.length - 1 })
    return added
  }

  removeRows (ids) {
    if (!Array.isArray(ids) || !ids.length) return []
    const set = new Set(ids)
    const removed = this._rows.filter((r) => set.has(r.id))
    if (!removed.length) return []
    if (this._ds) {
      for (const id of ids) this._ds.removeRow(id)
    } else {
      this._rows = this._rows.filter((r) => !set.has(r.id))
    }
    for (const id of ids) {
      this._selectedIds.delete(id)
      if (this._selectedId === id) this._selectedId = null
    }
    if (this._grid) this._grid.data = this._rows.slice()
    dispatchCmx(this, 'cmx-row-removed', { ids: removed.map((r) => r.id), rows: removed })
    return removed
  }

  getSelectedIds () {
    return this._rows.filter((r) => this._selectedIds.has(r.id)).map((r) => r.id)
  }

  getSource () {
    return this._rows.slice()
  }

  _setDataSourceProvider (fn) {
    this._dsProvider = typeof fn === 'function' ? fn : null
  }

  _notifyDataSourcesChanged () {
    if (this._grid) this._syncToGrid()
  }

  _bootstrapFromAttributes () {
    const opts = parseJsonAttr(this, 'data-cmx-options')
    const cols = parseJsonAttr(this, 'data-cmx-columns')
    const totals = parseJsonAttr(this, 'data-cmx-totals')
    const rows = parseJsonAttr(this, 'data-cmx-rows')
    if (opts) this.setOptions(opts)
    if (cols) this.setColumns(cols)
    if (totals) this.setTotals(totals)
    if (rows) this.setDataSet(rows)
  }

  _refreshFromDs () {
    this._rows = this._ds?.rows || this._rows
    this._pruneSelection()
    if (this._grid) this._grid.data = this._rows.slice()
  }

  _syncToGrid () {
    if (!this._grid) return
    this._grid.primaryKey = this._opts.primaryKey || 'id'
    this._grid.rowSelection = this._mapSelectionMode(this._opts.selectionMode)
    this._grid.data = this._rows.slice()
    this._rebuildColumns()
    this._syncGridSelection()
  }

  _rebuildColumns () {
    if (!this._grid) return
    this._grid.querySelectorAll('igc-column').forEach((el) => el.remove())
    for (const def of this._columns) {
      const col = document.createElement('igc-column')
      col.field = def.field
      col.header = def.header || def.field
      if (def.dataType) col.dataType = def.dataType
      if (def.editable === false) col.editable = false
      if (def.width) col.width = def.width
      if (def.textAlign) col.bodyClasses = def.textAlign === 'right' ? 'cmx-align-right' : ''
      this._grid.appendChild(col)
    }
  }

  _mapSelectionMode (mode) {
    if (mode === 'multi') return 'multiple'
    if (mode === 'none') return 'none'
    return 'single'
  }

  _syncGridSelection () {
    if (!this._grid || this._opts.selectionMode === 'none') return
    const pk = this._opts.primaryKey || 'id'
    if (this._opts.selectionMode === 'multi') {
      this._grid.selectRows(Array.from(this._selectedIds), true)
    } else if (this._selectedId != null) {
      this._grid.selectRows([this._selectedId], true)
    }
  }

  _bindGridEvents () {
    this._onRowSelectionChanging = (e) => {
      const pk = this._opts.primaryKey || 'id'
      const newSel = (e.detail?.newSelection || []).map((r) => r?.[pk] ?? r)
      if (this._opts.selectionMode === 'multi') {
        this._selectedIds = new Set(newSel)
        dispatchCmx(this, 'cmx-row-selection-change', { ids: this.getSelectedIds() })
      } else {
        const id = newSel[0] ?? null
        this._selectedId = id
        this._selectedIds = id ? new Set([id]) : new Set()
        if (this._ds?.moveTo) this._ds.moveTo(id)
        dispatchCmx(this, 'cmx-row-selected', { id })
      }
    }
    this._onCellEditDone = (e) => {
      const field = e.detail?.column?.field
      if (!field) return
      const row = e.detail?.rowData
      const id = row?.[this._opts.primaryKey || 'id']
      const value = e.detail?.newValue
      const colDef = this._columns.find((c) => c.field === field || c._cmxKey === field)
      if (colDef?._cmxOnChange && row) {
        try { colDef._cmxOnChange(row, value, { col: colDef._cmxCol || colDef }) } catch (_) {}
      }
      dispatchCmx(this, 'cmx-cell-changed', { id, key: field, value, row })
    }
    this._grid.addEventListener('rowSelectionChanging', this._onRowSelectionChanging)
    this._grid.addEventListener('cellEditDone', this._onCellEditDone)
  }

  _unbindGridEvents () {
    if (!this._grid) return
    if (this._onRowSelectionChanging) {
      this._grid.removeEventListener('rowSelectionChanging', this._onRowSelectionChanging)
    }
    if (this._onCellEditDone) {
      this._grid.removeEventListener('cellEditDone', this._onCellEditDone)
    }
  }

  _pruneSelection () {
    const ids = new Set(this._rows.map((r) => r.id))
    this._selectedIds = new Set([...this._selectedIds].filter((id) => ids.has(id)))
    if (this._selectedId != null && !ids.has(this._selectedId)) this._selectedId = null
  }

  _applySize () {
    if (!this._host) return
    const h = this._opts.viewHeight
    if (this._opts.fillHeight) {
      this.setAttribute('data-fill-height', '')
      this._host.style.height = '100%'
      this._startFillHeightObserver()
    } else {
      this.removeAttribute('data-fill-height')
      this._stopFillHeightObserver()
      this._host.style.height = h ? `${h}px` : '440px'
    }
  }

  _startFillHeightObserver () {
    if (this._fillHeightRo || typeof ResizeObserver === 'undefined') return
    this._fillHeightRo = new ResizeObserver(() => this._applySize())
    this._fillHeightRo.observe(this)
  }

  _stopFillHeightObserver () {
    this._fillHeightRo?.disconnect()
    this._fillHeightRo = null
  }

  _css () {
    return `
      :host { display: block; }
      :host([data-fill-height]) { display: flex; flex-direction: column; min-height: 0; height: 100%; }
      #host { min-height: 0; }
      .cmx-ignite-inner { width: 100%; height: 100%; }
      .cmx-align-right { text-align: right; }
    `
  }

  _html () {
    return '<div id="host"></div>'
  }
}

customElements.define('cmx-ignite-grid', CmxIgniteGrid)
