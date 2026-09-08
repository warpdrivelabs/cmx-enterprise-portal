/**
 * spread-compat.js —— SpreadJS「逃生舱」兼容适配器（M6）。
 *
 * 报表页 designer.js / report-applier.js 通过 wrapper.getWorkbook() 拿到「工作簿」，
 * 再经 .getActiveSheet()/.getSheet(i) 直接调 SpreadJS 原生 Worksheet/Workbook 方法。
 * 换内核（SpreadJS → cmx-megasheet）后，getWorkbook() 改回本适配器，把这些原生调用
 * 转译到 <cmx-megasheet> 的内核 Workbook/Worksheet + 几何直通 + 事件桥。
 *
 * 覆盖面（对 designer.js + report-applier.js 全量测绘所得）：
 *  Workbook：bind / getActiveSheet / getSheet / getSheetCount / suspendPaint / resumePaint
 *            / toJSON / hitTest / getActiveSheetIndex / setActiveSheetIndex / options / calc / recalcAll
 *  Worksheet：数据面（setFormula/getFormula/get·setValue/name/getRow·ColumnCount/get·setStyle
 *            /getSpan/getSpans/getCell/getRange/add·removeSpan/setColumn·RowWidth/getColumnWidth·RowHeight）
 *            + 几何面（getCellRect/getViewport{Top,Bottom,Left,Right}{Row,Column}/showCell/zoom）
 *            + 选区（getSelections/setSelection/setActiveCell/getActiveRow·ColumnIndex）
 *            + 大纲（rowOutlines/columnOutlines 直通核心 sheet，供浮动行列 P1–P5 折叠）
 *            + getParent / bind / options
 *
 * 事件桥（关键）：消费方 .bind(spreadEvtName, fn) 的 handler **全部无参**（onEdit=()=>markDirty()、
 *   onSelect 读 getActiveAddr()、badge on=()=>schedule()），且每个都带轮询兜底。故适配器 bind 只需
 *   在「对的事件类别」触发回调，无需复刻 SpreadJS info 载荷。element 侧一处 addEventListener 扇出。
 */

// SpreadJS 事件名 → <cmx-megasheet> CustomEvent 名 的类别映射。
// 同一 CustomEvent 可触发多个 SpreadJS 事件名的订阅者（消费方对「值变」绑了 6 个名，全落 cmx-cell-edited）。
const EVENT_BRIDGE = {
  // 值/编辑类 → cmx-cell-edited
  ValueChanged: 'cmx-cell-edited',
  EditEnded: 'cmx-cell-edited',
  CellChanged: 'cmx-cell-edited',
  RangeChanged: 'cmx-cell-edited',
  ClipboardPasted: 'cmx-cell-edited',
  DragDropBlockCompleted: 'cmx-cell-edited',
  DragFillBlockCompleted: 'cmx-cell-edited',
  // 选区类 → cmx-cell-selected
  SelectionChanged: 'cmx-cell-selected',
  EnterCell: 'cmx-cell-selected',
  LeaveCell: 'cmx-cell-selected',
  // 尺寸类 → cmx-col/row-resized
  ColumnWidthChanged: 'cmx-col-resized',
  RowHeightChanged: 'cmx-row-resized',
  // 活动表切换 → cmx-sheet-changed
  ActiveSheetChanged: 'cmx-sheet-changed',
  // 滚动类：element 首版不派发；badge 有 200ms 轮询兜底（TopRow/LeftColumnChanged 靠轮询跟随）
  TopRowChanged: 'cmx-scrolled',
  LeftColumnChanged: 'cmx-scrolled',
}

function colToIndex (letters) {
  let n = 0
  const s = String(letters || '').toUpperCase()
  for (let i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64)
  return n - 1
}

/**
 * 解析 SpreadJS/CSS font 串 → StyleProps 片段（bold/italic/fontSize/fontFamily）。
 * 核心渲染读 fontSize/fontFamily/bold/italic（不认整段 font 串），故 range.font() 与
 * ws.setStyle(Style{font}) 都必须解析——抽成单一函数，两处共用（P0.3 保真修复）。
 */
function parseFontString (f) {
  const s = String(f || '')
  const patch = { bold: /\bbold\b/i.test(s), italic: /\bitalic\b/i.test(s) }
  const m = /(\d+(?:\.\d+)?)px/i.exec(s)
  if (m) patch.fontSize = Math.round(Number(m[1]))
  else {
    const pt = /(\d+(?:\.\d+)?)pt/i.exec(s)
    if (pt) patch.fontSize = Math.round(Number(pt[1]) * 1.333) // pt→px
  }
  const famMatch = /(?:px|pt)\s+(.+)$/i.exec(s)
  if (famMatch) patch.fontFamily = famMatch[1].trim()
  return patch
}

/** SpreadJS HorizontalAlign/VerticalAlign 数字枚举 → 字符串（消费方偶传枚举）。 */
const H_ALIGN_ENUM = { 0: 'left', 1: 'center', 2: 'right', 3: 'general' }
const V_ALIGN_ENUM = { 0: 'top', 1: 'center', 2: 'bottom' }
function normAlign (a, map) {
  if (typeof a === 'string') return a
  if (typeof a === 'number' && map[a]) return map[a]
  return undefined
}

/**
 * options 活代理（P0.3）：消费方写 wb.options.showRowOutline / showColumnOutline = true
 * 想显大纲带。裸 {} 无副作用（inert）；这里代理 set，写这两个 flag 时转调
 * element.refreshOutlines() 触发大纲带显隐与重绘。其余键正常读写。
 */
function makeOptionsProxy (element) {
  const store = {}
  return new Proxy(store, {
    set (t, key, val) {
      t[key] = val
      if ((key === 'showRowOutline' || key === 'showColumnOutline') && val && element && typeof element.refreshOutlines === 'function') {
        try { element.refreshOutlines() } catch (_) {}
      }
      return true
    },
  })
}

/**
 * SpreadJS 兼容的 CellRange：包核心 CellRange，补消费方用到的 SpreadJS 流式方法
 * （textIndent/font/foreColor/backColor/formatter/hAlign/vAlign/borderX）。
 * 核心 CellRange 已有 value()/formula()/style()。未知方法返回 this 保持链式不炸。
 */
class SpreadCompatRange {
  constructor (coreRange, sheet) {
    this._r = coreRange
    this._sheet = sheet // 核心 Worksheet
  }

  value (v) { if (arguments.length === 0) return this._r.value(); this._r.value(v); return this }
  formula (f) { if (arguments.length === 0) return this._r.formula(); this._r.formula(f); return this }

  // 样式流式（叠加，非替换）——转成核心 style() 的 StyleProps patch
  _patch (patch) { this._r.style(patch); return this }
  font (f) { return this._patch(parseFontString(f)) }
  foreColor (c) { return this._patch({ foreColor: c }) }
  backColor (c) { return this._patch({ backColor: c }) }
  formatter (f) { return this._patch({ formatter: f }) }
  hAlign (a) { return this._patch({ hAlign: typeof a === 'string' ? a : undefined }) }
  vAlign (a) { return this._patch({ vAlign: typeof a === 'string' ? a : undefined }) }
  wordWrap (w) { return this._patch({ wordWrap: !!w }) }
  textIndent (n) { return this._patch({ textIndent: Number(n) || 0 }) } // 核心暂不渲染缩进；非阻断
  textDecoration (d) { return this._patch({ underline: !!d }) }
  borderTop (b) { return this._edge('top', b) }
  borderBottom (b) { return this._edge('bottom', b) }
  borderLeft (b) { return this._edge('left', b) }
  borderRight (b) { return this._edge('right', b) }
  _edge (side, b) {
    const edge = b == null ? undefined : { style: b.style || 'thin', color: b.color || 'var(--sapTextColor, #000000)' }
    this._r.range.forEachCell((r, c) => {
      const cur = this._sheet.getStyle(r, c) || {}
      const borders = { ...(cur.borders || {}) }
      if (edge) borders[side] = edge; else delete borders[side]
      this._sheet.setStyle(r, c, { ...cur, borders })
    })
    return this
  }
}

/**
 * SpreadJS 兼容的 Worksheet：桥核心 Worksheet（数据/选区/大纲）+ element（几何/缩放）。
 */
export class SpreadCompatWorksheet {
  constructor (coreSheet, element, workbook, index) {
    this._sheet = coreSheet
    this._el = element
    this._wb = workbook // SpreadCompatWorkbook
    this._index = index
    // 大纲直通（浮动行列 P1–P5：ws.rowOutlines.group() / ws.columnOutlines.group()）
    this.rowOutlines = coreSheet.rowOutlines
    this.columnOutlines = coreSheet.columnOutlines
    // ws.options：消费方写 show*Outline 时经活代理触发大纲带显隐（P0.3）
    this.options = makeOptionsProxy(element)
    // summaryBelow/summaryRight 直通核心 sheet（大纲汇总行/列位置；report-applier 浮动分级
    // 小计/合计在明细「上方/左侧」→ 置 false，applyOutlineVisibility 据此定折叠隐藏区间）。
    Object.defineProperty(this, 'summaryBelow', {
      get: () => coreSheet.summaryBelow,
      set: (v) => { coreSheet.summaryBelow = v },
      configurable: true,
    })
    Object.defineProperty(this, 'summaryRight', {
      get: () => coreSheet.summaryRight,
      set: (v) => { coreSheet.summaryRight = v },
      configurable: true,
    })
  }

  // ── 标识 / 尺寸 ─────────────────────────────────────
  name (v) { if (arguments.length === 0) return this._sheet.name(); this._sheet.name(v); return this }
  getRowCount () { return this._sheet.getRowCount() }
  getColumnCount () { return this._sheet.getColumnCount() }
  setRowCount (n) { this._sheet.setRowCount(n); return this }
  setColumnCount (n) { this._sheet.setColumnCount(n); return this }
  getParent () { return this._wb }

  // ── 值 / 公式 ───────────────────────────────────────
  getValue (r, c) { return this._sheet.getValue(r, c) }
  setValue (r, c, v) { this._sheet.setValue(r, c, v); return this }
  getFormula (r, c) {
    const f = this._sheet.getFormula(r, c)
    return f || null // SpreadJS 无公式返回 null；核心返回 ''
  }
  setFormula (r, c, f) { this._sheet.setFormula(r, c, f == null ? null : String(f)); return this }

  // ── 样式 ────────────────────────────────────────────
  getStyle (r, c) { return this._sheet.getStyle(r, c) || null }
  setStyle (r, c, style) {
    // SpreadJS Style 对象 → StyleProps（消费方在 GC 全局在时构造 new GC.Spread.Sheets.Style()）。
    // P0.3：font 串完整解析出 fontSize/fontFamily（不再只认 bold/italic）+ 搬 align/wordWrap/borders。
    if (!style) { this._sheet.setStyle(r, c, undefined); return this }
    const patch = {}
    if (style.font) Object.assign(patch, parseFontString(style.font))
    if (style.foreColor) patch.foreColor = style.foreColor
    if (style.backColor) patch.backColor = style.backColor
    if (style.formatter) patch.formatter = style.formatter
    const h = normAlign(style.hAlign, H_ALIGN_ENUM); if (h) patch.hAlign = h
    const v = normAlign(style.vAlign, V_ALIGN_ENUM); if (v) patch.vAlign = v
    if (style.wordWrap != null) patch.wordWrap = !!style.wordWrap
    if (style.textDecoration) patch.underline = true
    this._sheet.setStyle(r, c, patch)
    return this
  }

  // ── 合并 ────────────────────────────────────────────
  getSpan (r, c) { return this._sheet.getSpan(r, c) }
  getSpans (range) {
    const all = this._sheet.getSpans()
    if (!range || !range.range) return all
    // 与传入范围相交的合并区
    const box = range.range
    return all.filter((s) =>
      s.row < box.row + box.rowCount && s.row + s.rowCount > box.row &&
      s.col < box.col + box.colCount && s.col + s.colCount > box.col)
  }
  addSpan (r, c, rc, cc) { this._sheet.addSpan(r, c, rc, cc); return this }
  removeSpan (r, c) { this._sheet.removeSpan(r, c); return this }

  // ── 行列尺寸 ────────────────────────────────────────
  getColumnWidth (c) { return this._sheet.getColumnWidth(c) }
  setColumnWidth (c, px) { this._sheet.setColumnWidth(c, px); return this }
  getRowHeight (r) { return this._sheet.getRowHeight(r) }
  setRowHeight (r, px) { this._sheet.setRowHeight(r, px); return this }

  // ── 单元格/区域句柄（流式）────────────────────────────
  getCell (r, c) { return new SpreadCompatRange(this._sheet.getCell(r, c), this._sheet) }
  getRange (r, c, rc = 1, cc = 1) { return new SpreadCompatRange(this._sheet.getRange(r, c, rc, cc), this._sheet) }

  // ── 选区 ────────────────────────────────────────────
  getSelections () { return this._sheet.getSelections() } // Range[]，已含 row/col/rowCount/colCount
  getActiveRowIndex () { return this._sheet.getActiveRowIndex() }
  getActiveColumnIndex () { return this._sheet.getActiveColumnIndex() }
  setSelection (r, c, rc = 1, cc = 1) {
    // 只对活动 sheet 生效（element 选区模型作用于活动 sheet）
    if (this._isActive()) this._el.setSelection(r, c, rc, cc)
    else this._sheet.setSelection(r, c, rc, cc)
    return this
  }
  setActiveCell (r, c) {
    if (this._isActive()) this._el.setSelection(r, c, 1, 1)
    else this._sheet.setSelection(r, c, 1, 1)
    return this
  }

  // ── 几何（仅活动 sheet 有意义；element 的几何是活动 sheet 的）──────
  _isActive () { return this._el.getActiveSheetIndex() === this._index }
  getCellRect (r, c, rc = 1, cc = 1) {
    return this._isActive() ? this._el.getCellRect(r, c, rc, cc) : null
  }
  getViewportTopRow () { return this._isActive() ? this._el.getViewportTopRow() : 0 }
  getViewportBottomRow () { return this._isActive() ? this._el.getViewportBottomRow() : 0 }
  getViewportLeftColumn () { return this._isActive() ? this._el.getViewportLeftColumn() : 0 }
  getViewportRightColumn () { return this._isActive() ? this._el.getViewportRightColumn() : 0 }
  showCell (r, c, vAlign, hAlign) {
    // SpreadJS 签名 showCell(row,col,vertPos,horizPos)；位置参 3=起始/1=居中/0=末尾。取纵向为准。
    if (this._isActive()) this._el.showCell(r, c, vAlign)
    return this
  }
  zoom (factor) {
    if (arguments.length === 0) return this._el.getZoom()
    if (this._isActive()) this._el.zoom(factor)
    return factor
  }

  // ── 冻结窗格（M9；SpreadJS ws.frozenRowCount()/frozenColumnCount() getter/setter）──
  frozenRowCount (n) {
    if (arguments.length === 0) return this._el.getFrozenRowCount ? this._el.getFrozenRowCount() : 0
    if (this._isActive() && this._el.freezePanes) this._el.freezePanes(Number(n) || 0, this._el.getFrozenColumnCount())
    return this
  }
  frozenColumnCount (n) {
    if (arguments.length === 0) return this._el.getFrozenColumnCount ? this._el.getFrozenColumnCount() : 0
    if (this._isActive() && this._el.freezePanes) this._el.freezePanes(this._el.getFrozenRowCount(), Number(n) || 0)
    return this
  }
  /** SpreadJS ws.frozenTrailingRowCount 等未支持——返回 0（消费方目前未调）。 */
  frozenTrailingRowCount () { return 0 }
  frozenTrailingColumnCount () { return 0 }

  // ── 事件（sheet 级 bind 与 wb 级同桥）────────────────
  bind (evtName, fn) { this._wb._bind(evtName, fn); return this }
  unbind (evtName, fn) { this._wb._unbind(evtName, fn); return this }
}

/**
 * SpreadJS 兼容的 Workbook：包 <cmx-megasheet> element。
 */
export class SpreadCompatWorkbook {
  constructor (element) {
    this._el = element
    this._listeners = new Map() // spreadEvtName → Set<fn>
    this._bridged = new Set()   // 已 addEventListener 的 CustomEvent 名（去重）
    this._sheetCache = new Map() // coreSheet → SpreadCompatWorksheet
    // wb.options：消费方写 show*Outline 时经活代理触发大纲带显隐（P0.3）
    this.options = makeOptionsProxy(element)
  }

  get _core () { return this._el.getWorkbook() }

  getSheetCount () { return this._core.getSheetCount() }
  getActiveSheetIndex () { return this._el.getActiveSheetIndex() }
  setActiveSheetIndex (i) { this._el.setActiveSheet(Number(i) || 0) }

  getSheet (i) {
    const core = this._core.getSheet(i)
    return core ? this._wrap(core, i) : null
  }
  getActiveSheet () {
    const i = this._el.getActiveSheetIndex()
    const core = this._core.getActiveSheet()
    return core ? this._wrap(core, i) : null
  }
  _wrap (coreSheet, index) {
    let w = this._sheetCache.get(coreSheet)
    if (!w) { w = new SpreadCompatWorksheet(coreSheet, this._el, this, index); this._sheetCache.set(coreSheet, w) }
    else { w._index = index } // 活动索引可能变（moveSheet），刷新
    return w
  }

  // ── 绘制暂挂（内核用 rAF，suspend/resume 无强制语义，直转核心）──────
  suspendPaint () { try { this._core.suspendPaint() } catch (_) {} }
  resumePaint () { try { this._core.resumePaint() } catch (_) {} }

  // ── 重算（消费方灌值后调 calc/recalcAll）──────────────
  calc () { try { this._core.requestRecalc() } catch (_) {} }
  recalcAll () { try { this._core.requestRecalc() } catch (_) {} }

  // ── 序列化（deriveProjection 兜底 / 旧路径）───────────
  toJSON () { return this._el.getWorkbookJson() }

  // ── 命中测试：屏幕点（相对画布宿主）→ {worksheetHitInfo:{row,col}} ──
  hitTest (x, y) {
    const hit = this._el.hitTestPoint(x, y)
    if (!hit) return null
    return { worksheetHitInfo: { row: hit.row, col: hit.col } }
  }

  // ── 事件桥 ──────────────────────────────────────────
  bind (evtName, fn) { this._bind(evtName, fn); return true }
  unbind (evtName, fn) { this._unbind(evtName, fn) }

  _bind (evtName, fn) {
    if (typeof fn !== 'function') return
    let set = this._listeners.get(evtName)
    if (!set) { set = new Set(); this._listeners.set(evtName, set) }
    set.add(fn)
    // 首次订阅该 SpreadJS 事件类别 → 在 element 上挂一次 CustomEvent 监听
    const custom = EVENT_BRIDGE[evtName]
    if (custom && !this._bridged.has(custom)) {
      this._bridged.add(custom)
      this._el.addEventListener(custom, () => this._fanout(custom))
    }
  }
  _unbind (evtName, fn) {
    const set = this._listeners.get(evtName)
    if (set) { if (fn) set.delete(fn); else set.clear() }
  }
  /** 某 CustomEvent 触发 → 找出映射到它的所有 SpreadJS 事件名的订阅者，逐个无参回调。 */
  _fanout (customName) {
    for (const [spreadName, set] of this._listeners) {
      if (EVENT_BRIDGE[spreadName] !== customName) continue
      for (const fn of set) { try { fn() } catch (_) {} }
    }
  }
}

/** 工厂：从 <cmx-megasheet> element 造一个 SpreadJS 兼容工作簿。 */
export function makeSpreadCompatWorkbook (element) {
  return new SpreadCompatWorkbook(element)
}
