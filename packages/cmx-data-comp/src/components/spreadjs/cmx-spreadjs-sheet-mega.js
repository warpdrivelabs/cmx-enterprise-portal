/**
 * <cmx-spreadjs-sheet>（mega 内核实现）—— M6：把电子表格内核从 SpreadJS 换成自研 cmx-megasheet。
 *
 * 标签名与公共 API 保持与 SpreadJS 版 cmx-spreadjs-sheet.js 一致（消费方零改）：
 *  - 内部宿主一个 <cmx-megasheet>（自研引擎，零 @mescius 依赖）。
 *  - getWorkbook() 返回「SpreadJS 兼容适配器」（spread-compat.js），让 designer.js/report-applier.js
 *    经逃生舱调的原生 Worksheet/Workbook 方法照常工作。
 *  - 公共门面方法（setReportModel/applySelectionStyle/…）几乎逐字转调内部 <cmx-megasheet> 的同名门面。
 *  - setWorkbookJson 双读：识别 SSJSON（存量报表）vs cmx-megasheet 中性快照（新存），两种都复原。
 *
 * 择核由 barrel（src/index.js）决定注册哪个类到 <cmx-spreadjs-sheet>；本文件是 mega 分支。
 */

// 引入自研引擎（ESM bundle；导入即 customElements.define('cmx-megasheet')，幂等）。
import './vendor/megasheet.esm.js'
import { makeSpreadCompatWorkbook } from './spread-compat.js'

function parseAddr (addr) {
  const m = /^([A-Z]+)(\d+)$/.exec(String(addr || '').toUpperCase())
  if (!m) return null
  let n = 0
  for (let i = 0; i < m[1].length; i++) n = n * 26 + (m[1].charCodeAt(i) - 64)
  return { col: n - 1, row: Number(m[2]) - 1 }
}

export class CmxSpreadjsSheet extends HTMLElement {
  constructor () {
    super()
    this.attachShadow({ mode: 'open' })
    this._el = null          // 内部 <cmx-megasheet>
    this._wbAdapter = null   // SpreadJS 兼容工作簿适配器（懒建，单例）
    this._report = null
    this._formulaBar = true
    this._colorScheme = 'auto'
    this._onPortalThemeChange = null
  }

  connectedCallback () {
    if (this._el) return
    this.style.display = this.style.display || 'block'
    this.shadowRoot.innerHTML = `
      <style>
        :host{display:block;min-height:240px}
        .wrap{width:100%;height:100%;min-height:240px;display:flex;flex-direction:column}
        cmx-megasheet{flex:1;min-height:0}
      </style>
      <div class="wrap"><cmx-megasheet></cmx-megasheet></div>`
    this._el = this.shadowRoot.querySelector('cmx-megasheet')
    // 转发内部组件的 CustomEvent 到宿主外（保持 cmx-cell-selected/edited/sheet-changed 冒泡语义）
    // —— 内部已 composed:true，会自然穿出本 shadow，无需手动重派。
    // 主题：显式 data-cmx-theme 覆盖，否则 auto 跟随门户。
    this._colorScheme = this.getAttribute('data-cmx-theme') || 'auto'
    this.setColorScheme(this._colorScheme)
    this._onPortalThemeChange = (ev) => {
      if ((this._colorScheme || 'auto') === 'auto') this.setColorScheme('auto', ev && ev.detail && ev.detail.theme)
    }
    try { window.addEventListener('cmx-portal-theme-change', this._onPortalThemeChange) } catch (_) {}
    this._bootstrapFromAttributes()
  }

  disconnectedCallback () {
    if (this._onPortalThemeChange) { try { window.removeEventListener('cmx-portal-theme-change', this._onPortalThemeChange) } catch (_) {} this._onPortalThemeChange = null }
    this._el = null
    this._wbAdapter = null
  }

  // ══════════════════════════════════════════════════════
  // getWorkbook 逃生舱：返回 SpreadJS 兼容适配器（单例，指向内部 <cmx-megasheet>）。
  // ══════════════════════════════════════════════════════
  getWorkbook () {
    if (!this._el) return null
    if (!this._wbAdapter) this._wbAdapter = makeSpreadCompatWorkbook(this._el)
    return this._wbAdapter
  }

  // ── 报表模型 ────────────────────────────────────────
  setReportModel (report) {
    this._report = report || null
    this._el?.setReportModel(report)
    this.setColorScheme(this._colorScheme || 'auto')
  }
  getReportModel () { return this._report }

  // ── workbook JSON（存储版式）──────────────────────────
  setWorkbook (other) {
    if (other && typeof other.toJSON === 'function' && this._el) {
      // other 是另一个适配器工作簿：取其中性快照灌入
      const json = other.toJSON()
      if (json) this._el.fromSnapshot(json)
    }
  }

  /** 导出中性快照对象（新存写这个；引擎快照天生主题中性）。 */
  getWorkbookJson () {
    return this._el ? this._el.getWorkbookJson() : null
  }

  /**
   * 从版式 BLOB 复原（双读）：
   *  - format==='cmx-megasheet' → 中性快照（新存）→ fromSnapshot
   *  - 否则视作 SpreadJS SSJSON（存量报表）→ importSSJSON
   * 清撤销栈；返回 Promise（对齐旧签名）。
   */
  setWorkbookJson (json) {
    if (!this._el || !json) return Promise.resolve(false)
    try {
      let obj = json
      if (typeof obj === 'string') { try { obj = JSON.parse(obj) } catch (_) { /* 非 JSON 串，交给引擎兜底 */ } }
      const isNeutral = obj && typeof obj === 'object' && obj.format === 'cmx-megasheet'
      if (isNeutral) this._el.fromSnapshot(obj)
      else this._el.importSSJSON(obj)
      this.setColorScheme(this._colorScheme || 'auto')
      return Promise.resolve(true)
    } catch (err) {
      return Promise.reject(err instanceof Error ? err : new Error(String(err)))
    }
  }

  /** 报表数据回填（模式二）：按 A1 覆盖显示值，保留版式与公式。 */
  setCellValues (map) {
    if (!this._el || !map) return false
    return this._el.setCellValues(map)
  }

  setReportValueMap (map) { this._el?.setReportValueMap(map); return true }
  getReportValueMap () { return this._el ? this._el.getReportValueMap() : {} }

  // ── 视图 ────────────────────────────────────────────
  showFormulaBar (visible) { this._formulaBar = visible !== false; this._el?.showFormulaBar(this._formulaBar) }
  showHeaders (visible) { this._el?.showHeaders(visible !== false) }
  showGridlines (visible) { this._el?.showGridlines(visible !== false) }
  setEditable (editable) { this._el?.setEditable(editable !== false) }
  isEditable () { return this._el ? this._el.isEditable() : true }

  /** light/dark 配色。mode: 'dark'|'light'|'auto'。auto 跟随门户主题（sessionStorage/prefers-color-scheme）。 */
  setColorScheme (mode, explicitThemeId) {
    if (mode) this._colorScheme = mode
    const want = this._colorScheme || 'auto'
    const resolved = want === 'dark' ? 'dark' : (want === 'light' ? 'light' : (this._isDarkThemeGlobal(explicitThemeId) ? 'dark' : 'light'))
    this._el?.setTheme(resolved)
  }

  _isDarkThemeGlobal (explicitId) {
    try {
      const test = (id) => {
        const s = String(id || '').toLowerCase()
        if (!s) return null
        return /(_dark|_hcb|dark|black)$/.test(s) || s.includes('_hcb') ? true : false
      }
      const ex = test(explicitId); if (ex !== null) return ex
      if (typeof document === 'undefined') return false
      const attr = document.documentElement.getAttribute('data-sap-ui-theme') || document.documentElement.getAttribute('theme') || ''
      const a = test(attr); if (a !== null) return a
      try { const st = test(sessionStorage.getItem('__portal_ui5_theme__')); if (st !== null) return st } catch (_) {}
      return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
    } catch (_) { return false }
  }

  // ── 选区/样式/编辑（全部转调内部门面）──────────────────
  getSelectionState () { return this._el ? this._el.getSelectionState() : {} }
  applySelectionStyle (style) { this._el?.applySelectionStyle(style); return true }
  applySelectionBorder (kind, color, lineStyle) { this._el?.applySelectionBorder(kind, color, lineStyle); return true }
  mergeSelection () { this._el?.mergeSelection(); return true }
  unmergeSelection () { this._el?.unmergeSelection(); return true }
  clearSelection (mode = 'all') { this._el?.clearSelection(mode); return true }
  insertRows (count = 1) { this._el?.insertRows(count); return true }
  deleteRows (count = 1) { this._el?.deleteRows(count); return true }
  insertColumns (count = 1) { this._el?.insertColumns(count); return true }
  deleteColumns (count = 1) { this._el?.deleteColumns(count); return true }

  // ── 撤销/重做 ───────────────────────────────────────
  undo () { this._el?.undo(); return true }
  redo () { this._el?.redo(); return true }
  undoSteps (count = 1) { this._el?.undoSteps(count); return true }
  redoSteps (count = 1) { this._el?.redoSteps(count); return true }
  getHistoryState () {
    const h = this._el ? this._el.getHistoryState() : { undo: 0, redo: 0 }
    // 兼容旧签名：SpreadJS 版返回 {undo:[], redo:[], canUndo, canRedo}；这里给 canUndo/canRedo + 计数。
    return {
      undo: h.undo, redo: h.redo,
      canUndo: this._el ? this._el.canUndo() : false,
      canRedo: this._el ? this._el.canRedo() : false,
    }
  }
  canUndo () { return this._el ? this._el.canUndo() : false }
  canRedo () { return this._el ? this._el.canRedo() : false }

  /** 把外部直接改 sheet 的 mutator 包成一次可撤销命令（对齐 SpreadJS 版 _runUndoable）。 */
  _runUndoable (name, action) {
    if (!this._el || typeof action !== 'function') { try { action?.() } catch (_) {} return false }
    return this._el.runUndoable(action, String(name || '编辑表格'))
  }

  // ── 活动 sheet / 地址 ────────────────────────────────
  getActiveSheet () { return this._el ? this._el.getActiveSheet() : 0 }
  setActiveSheet (index) { this._el?.setActiveSheet(Number(index) || 0) }
  getActiveAddr () { return this._el ? this._el.getActiveAddr() : 'A1' }
  readSelection () { return this._el ? this._el.readSelection() : this.getActiveAddr() }

  // ── XLSX（对齐旧 Promise 签名）────────────────────────
  exportXlsx (name) {
    if (!this._el) return Promise.reject(new Error('无工作簿'))
    try {
      const bytes = this._el.exportXlsx()
      let fn = String(name || 'report').replace(/\.json$/i, '').replace(/\.xlsx$/i, '') + '.xlsx'
      const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = fn; document.body.appendChild(a); a.click()
      setTimeout(() => { try { document.body.removeChild(a); URL.revokeObjectURL(url) } catch (_) {} }, 0)
      return Promise.resolve(true)
    } catch (e) { return Promise.reject(e instanceof Error ? e : new Error(String(e))) }
  }

  /**
   * 导入 .xlsx（File）→ 复原到画布，并返回 { sheets:[{name,grid,cells}] } 供 designer 兜底渲染。
   * 旧 SpreadJS 版返回 Promise，这里保持异步签名。
   */
  importXlsx (file) {
    if (!file || !this._el) return Promise.reject(new Error('未提供文件或组件未就绪'))
    return file.arrayBuffer().then((buf) => {
      this._el.importXlsx(new Uint8Array(buf))
      return { sheets: this._extractSheets() }
    })
  }

  /** 从当前工作簿抽取 {name,grid,cells} 结构（供 importXlsx 的返回 + reportModel 兜底）。 */
  _extractSheets () {
    const wb = this._el?.getWorkbook()
    if (!wb) return []
    const out = []
    const count = wb.getSheetCount()
    for (let si = 0; si < count; si++) {
      const ws = wb.getSheet(si)
      if (!ws) continue
      const rowCount = Math.min(Math.max(ws.getRowCount(), 20), 300)
      const colCount = Math.min(Math.max(ws.getColumnCount(), 8), 80)
      const cells = {}
      let maxRow = 0; let maxCol = 0
      for (let r = 0; r < rowCount; r++) {
        for (let c = 0; c < colCount; c++) {
          const value = ws.getValue(r, c)
          const formula = ws.getFormula(r, c)
          if ((value == null || value === '') && !formula) continue
          const addr = this._indexToCol(c) + (r + 1)
          cells[addr] = formula ? { type: 'calc', formula: `=${formula}` } : { type: 'text', value }
          maxRow = Math.max(maxRow, r + 1); maxCol = Math.max(maxCol, c + 1)
        }
      }
      out.push({ id: `s${si + 1}`, name: ws.name() || `Sheet${si + 1}`, grid: { rows: Math.max(maxRow + 5, 20), cols: Math.max(maxCol + 2, 8) }, cells })
    }
    return out
  }

  _indexToCol (idx) {
    let n = Number(idx) + 1; let s = ''
    while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26) }
    return s || 'A'
  }

  _bootstrapFromAttributes () {
    this.showFormulaBar(this.getAttribute('data-cmx-formula-bar') !== 'false')
    const rep = this.getAttribute('data-cmx-report')
    if (rep) { try { this.setReportModel(JSON.parse(rep)) } catch (_) {} }
  }
}

// 注意：本文件 NOT 直接 customElements.define——由 barrel（src/index.js）按择核开关注册到
// <cmx-spreadjs-sheet>，以便与 SpreadJS 版共用同一标签、消费方零改。
export const CmxSpreadjsSheetMega = CmxSpreadjsSheet
