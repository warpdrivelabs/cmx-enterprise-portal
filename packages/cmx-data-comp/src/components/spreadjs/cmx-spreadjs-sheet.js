/**
 * <cmx-spreadjs-sheet> — SpreadJS 电子表格封装。
 *
 * API 形态尽量贴近 <cmx-spreadsheet>，供报表设计器在 Ignite / SpreadJS
 * 两套表格内核之间切换。
 */

let GC = null
let spreadJsPromise = null
let excelIoPromise = null

// ============================================================================
// light/dark 主题配色（画布是 canvas 像素绘制，颜色须程序化设，非 CSS 可改）。
// 只设「视图色」（workbook/sheet options + 行列头 SheetArea 默认样式）——这些不进
// toJSON({saveAsView:false}) 的保存 BLOB、也不盖用户单元格 fore/back 色。
// ============================================================================
const SPREAD_THEMES = {
  light: {
    grayArea: '#f3f5f8', // 画布外空白区
    sheetBack: 'var(--sapList_Background, #ffffff)', // 格底
    gridline: '#e2e6ec', // 网格线
    headerBack: '#f4f5f8', // 行列头底
    headerFore: '#3a3f45', // 行列头字
    selectionBack: 'rgba(10,110,209,0.14)', // 选区填充
    selectionBorder: 'var(--sapInformationElementColor, #0a6ed1)', // 选区边框
    tabStripBack: '#f3f5f8', // 底部页签条
    sheetTabColor: '#3a3f45', // 页签字
    frozenline: 'var(--sapGroup_ContentBorderColor, #c8ccd2)', // 冻结线
  },
  dark: {
    grayArea: 'var(--sapInformationElementColor, #15181c)', // 画布外空白区（不纯黑，防刺眼）
    sheetBack: 'var(--sapInformationElementColor, #1e2228)', // 格底
    gridline: '#3a3f45', // 网格线
    headerBack: 'var(--sapInformationElementColor, #2a2f36)', // 行列头底
    headerFore: 'var(--sapGroup_ContentBorderColor, #c8ccd2)', // 行列头字
    selectionBack: 'rgba(0,166,200,0.22)', // 选区填充（青，对齐门户 dark）
    selectionBorder: 'var(--sapInformationElementColor, #2ea8c8)', // 选区边框
    tabStripBack: 'var(--sapInformationElementColor, #1a1d22)', // 底部页签条
    sheetTabColor: 'var(--sapGroup_ContentBorderColor, #c8ccd2)', // 页签字
    frozenline: '#4a5058', // 冻结线
  },
}

/** 组件在独立 shadow、脚本注入不能 import——自带轻量主题判定。
 *  优先级：显式传入 id > <html> 的 SAP 主题属性 > 门户 sessionStorage 存的主题 id > 系统偏好。 */
function _isDarkThemeId (id) {
  const s = String(id || '').toLowerCase()
  if (!s) return null
  if (/(_dark|_hcb|dark|black)$/.test(s) || s.includes('_hcb')) return true
  // 已知亮色 id（sap_horizon / _hcw / fiori_3 等）→ 明确 false
  return false
}
function _isDarkThemeGlobal (explicitId) {
  try {
    // ① 显式 id（事件 detail.theme）
    const ex = _isDarkThemeId(explicitId)
    if (ex !== null) return ex
    if (typeof document === 'undefined') return false
    // ② <html> SAP 主题属性
    const attr = String(
      document.documentElement.getAttribute('data-sap-ui-theme') ||
      document.documentElement.getAttribute('theme') || '',
    )
    const a = _isDarkThemeId(attr)
    if (a !== null) return a
    // ③ 门户存储的主题 id（UI5 在无头/某些环境不写 html 属性时的兜底）
    try {
      const stored = sessionStorage.getItem('__portal_ui5_theme__')
      const st = _isDarkThemeId(stored)
      if (st !== null) return st
    } catch (_) {}
    // ④ 系统偏好
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
  } catch (_) { return false }
}


async function ensureSpreadJs () {
  if (GC) return GC
  if (!spreadJsPromise) {
    spreadJsPromise = Promise.all([
      import('@mescius/spread-sheets'),
      import('@mescius/spread-sheets/styles/gc.spread.sheets.excel2013white.css'),
      import('@mescius/spread-sheets/styles/gc.spread.sheets.excel2016darkGray.css'),
    ]).then(([mod]) => {
      GC = mod
      return GC
    })
  }
  return spreadJsPromise
}

async function ensureExcelIo () {
  await ensureSpreadJs()
  if (!excelIoPromise) excelIoPromise = import('@mescius/spread-excelio')
  const mod = await excelIoPromise
  const IO = mod?.IO || mod?.default?.IO || GC?.Spread?.Excel?.IO
  if (!IO) throw new Error('SpreadJS Excel IO 模块未提供 IO 构造器')
  return new IO()
}

// ============================================================================
// 报表取数自定义函数（QM/QC/JE/FS/REF）——注册为 SpreadJS 全局自定义函数。
// 取数方式：从一张「按 sheet!cellRef 的值 map」里取本格预算值（后端 compute 已按公式算好每格结果
// 落 cr_cell_data，前端只按格显示）。设计态 map 空 → 返回 0；应用态由 report-applier 灌 map。
// 这样 =FS(...) 是真正的 SpreadJS 公式，能正常写入/显示，不再需要「当文本写入」的退化。
// ============================================================================

/** 全局值 map：键 `sheetName!CELLREF`（大写），值 number|string。多实例以最后 setReportValueMap 为准。 */
let _reportValueMap = {}
/** 取当前活动 sheet 名的函数（求值上下文无 sheet 名时兜底）。由组件在注册时注入。 */
let _reportActiveSheetName = () => ''
let _cmxReportFnsRegistered = false

/** 注册 5 个取数函数到 GC 全局 CalcEngine（幂等）。 */
function registerReportFetchFunctions (GCns) {
  if (_cmxReportFnsRegistered) return
  const Funcs = GCns?.Spread?.CalcEngine?.Functions
  if (!Funcs || !Funcs.Function || !Funcs.defineGlobalCustomFunction) return
  const NAMES = ['QM', 'QC', 'JE', 'FS', 'REF']
  for (const name of NAMES) {
    class ReportFetchFunction extends Funcs.Function {
      constructor () {
        // 0~255 参：QM/QC/JE 3 参、FS 4 参、REF 变参；宽松上下界即可，取值只看所在格。
        super(name, 0, 255, { description: '报表取数函数（值来自应用态缓存，按单元格取数）' })
      }
      // 依赖所在单元格位置 → 上下文敏感（evaluate 首参给 {row,column,...}）
      isContextSensitive () { return true }
      // map 更新后需重算显示 → 声明易变
      isVolatile () { return true }
      evaluate (context) {
        try {
          const row = context && typeof context.row === 'number' ? context.row : -1
          const col = context && typeof context.column === 'number' ? context.column : -1
          if (row < 0 || col < 0) return 0
          const sheetName = (context.sheet && context.sheet.name && context.sheet.name()) || _reportActiveSheetName() || ''
          const ref = indexToCol(col) + (row + 1)
          const v = _reportValueMap[`${sheetName}!${ref}`]
          // 取数函数是**数值**函数：后端 num_value 常以字符串下发（"123"），空/缺/非数值单元格
          // 会得到 ''/text。若原样返回字符串，单个函数尚能显示，但一旦参与算术
          // （QM(...)+QC(...)）SpreadJS 判 #VALUE!。故统一强制转数值：数字字符串→数字，
          // 空/null/非数值→0（缺数据按 0 参与计算，符合报表取数语义）。
          if (v == null || v === '') return 0
          if (typeof v === 'number') return Number.isFinite(v) ? v : 0
          const n = Number(v)
          return Number.isFinite(n) ? n : 0
        } catch (_) { return 0 }
      }
    }
    try { Funcs.defineGlobalCustomFunction(name, new ReportFetchFunction()) } catch (_) {}
  }
  _cmxReportFnsRegistered = true
}

function colToIndex (letters) {
  let n = 0
  for (let i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64)
  return n - 1
}

function indexToCol (idx) {
  let n = Number(idx) + 1
  let s = ''
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s || 'A'
}

function parseAddr (addr) {
  const m = /^([A-Z]+)(\d+)$/.exec(String(addr || '').toUpperCase())
  if (!m) return null
  return { col: colToIndex(m[1]), row: Number(m[2]) - 1 }
}

function parseRange (range) {
  const parts = String(range || '').split(':')
  const a = parseAddr(parts[0])
  const b = parseAddr(parts[1] || parts[0])
  if (!a || !b) return null
  return {
    r1: Math.min(a.row, b.row),
    c1: Math.min(a.col, b.col),
    r2: Math.max(a.row, b.row),
    c2: Math.max(a.col, b.col),
  }
}

function normalizeFormula (formula) {
  const f = String(formula || '')
  if (!f) return ''
  return f.charAt(0) === '=' ? f.slice(1) : f
}

function toCssColor (value) {
  if (!value) return ''
  return String(value)
}

function applyStyle (sheet, row, col, cell, classes) {
  const st = { ...(classes[cell.class] || {}), ...(cell.style || {}) }
  if (st.bold || st.italic || st.underline || st.fontSize) {
    const size = Number(st.fontSize) || 11
    const weight = st.bold ? 'bold' : 'normal'
    const style = st.italic ? 'italic' : 'normal'
    sheet.getCell(row, col).font(`${style} ${weight} ${size}px var(--sapFontFamily, Arial, sans-serif)`)
    if (st.underline) sheet.getCell(row, col).textDecoration(GC.Spread.Sheets.TextDecorationType.underline)
  }
  if (st.align) {
    const map = GC.Spread.Sheets.HorizontalAlign
    sheet.getCell(row, col).hAlign(map[String(st.align)] || map.left)
  }
  if (st.valign) {
    const map = GC.Spread.Sheets.VerticalAlign
    sheet.getCell(row, col).vAlign(map[String(st.valign)] || map.center)
  }
  if (st.format) sheet.getCell(row, col).formatter(String(st.format))
  if (st.fontColor) sheet.getCell(row, col).foreColor(toCssColor(st.fontColor))
  if (st.fillColor) sheet.getCell(row, col).backColor(toCssColor(st.fillColor))
  if (st.border) {
    const range = sheet.getCell(row, col)
    for (const side of ['top', 'bottom', 'left', 'right']) {
      const b = st.border[side]
      if (!b || b.style === 'none') continue
      const lineStyle = GC.Spread.Sheets.LineStyle[String(b.style)] || GC.Spread.Sheets.LineStyle.thin
      const border = new GC.Spread.Sheets.LineBorder(b.color || '#000', lineStyle)
      if (side === 'top') range.borderTop(border)
      else if (side === 'bottom') range.borderBottom(border)
      else if (side === 'left') range.borderLeft(border)
      else if (side === 'right') range.borderRight(border)
    }
  }
}

function readCellValue (sheet, row, col) {
  const formula = sheet.getFormula(row, col)
  if (formula) return { formula: `=${formula}`, value: sheet.getValue(row, col) }
  return { value: sheet.getValue(row, col) }
}

function downloadBlob (blob, fileName) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName || 'report.xlsx'
  document.body.appendChild(a)
  a.click()
  setTimeout(() => { try { document.body.removeChild(a); URL.revokeObjectURL(url) } catch (_) {} }, 0)
}

function cellStyleFromSpread (style) {
  const out = {}
  if (!style) return out
  try {
    const font = String(style.font || '')
    if (/\bbold\b/i.test(font)) out.bold = true
    if (/\bitalic\b/i.test(font)) out.italic = true
    const m = /(\d+(?:\.\d+)?)px/i.exec(font)
    if (m) out.fontSize = Math.round(Number(m[1]))
  } catch (_) {}
  try { if (style.textDecoration === GC.Spread.Sheets.TextDecorationType.underline) out.underline = true } catch (_) {}
  try {
    if (style.hAlign === GC.Spread.Sheets.HorizontalAlign.center) out.align = 'center'
    else if (style.hAlign === GC.Spread.Sheets.HorizontalAlign.right) out.align = 'right'
    else if (style.hAlign === GC.Spread.Sheets.HorizontalAlign.left) out.align = 'left'
  } catch (_) {}
  try { if (style.formatter) out.format = String(style.formatter) } catch (_) {}
  try { if (style.foreColor) out.fontColor = style.foreColor } catch (_) {}
  try { if (style.backColor) out.fillColor = style.backColor } catch (_) {}
  return out
}

export class CmxSpreadjsSheet extends HTMLElement {
  constructor () {
    super()
    this.attachShadow({ mode: 'open' })
    this._spread = null
    this._host = null
    this._report = null
    this._editable = true
    this._formulaBar = true
    this._commandsRegistered = false
    this._colorScheme = 'auto'
    this._onPortalThemeChange = null
  }

  async connectedCallback () {
    if (this._spread) return
    this.style.display = this.style.display || 'block'
    this.shadowRoot.innerHTML = `
      <style>
        :host{display:block;min-height:240px}
        .wrap{width:100%;height:100%;min-height:240px;display:flex;flex-direction:column}
        .formula{display:flex;align-items:center;gap:6px;height:30px;border-bottom:1px solid var(--sapList_BorderColor,#ddd);background:var(--sapShell_Background,#f7f7f7);box-sizing:border-box;padding:3px 6px}
        .addr{width:64px;font:12px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--sapContent_LabelColor,#666)}
        .fx{flex:1;height:22px;border:1px solid var(--sapField_BorderColor,#999);background:var(--sapField_Background,#fff);color:var(--sapField_TextColor,#222);font:12px var(--sapFontFamily,Arial,sans-serif);padding:0 6px;box-sizing:border-box}
        .sheet{flex:1;min-height:0}
        /* dark：组件自带公式栏 chrome（report-applier 显示时）随主题变深 */
        .wrap.cmx-spread-dark .formula{background:var(--sapInformationElementColor, #1a1d22);border-bottom-color:#3a3f45}
        .wrap.cmx-spread-dark .addr{color:var(--sapContent_DisabledTextColor, #c8ccd2)}
        .wrap.cmx-spread-dark .fx{background:var(--sapInformationElementColor, #22262c);border-color:#3a3f45;color:#e6e9ee}
      </style>
      <div class="wrap">
        <div class="formula"><span class="addr">A1</span><input class="fx"></div>
        <div class="sheet">Loading SpreadJS...</div>
      </div>`
    this._host = this.shadowRoot.querySelector('.sheet')
    try {
      await ensureSpreadJs()
    } catch (err) {
      this._host.textContent = `SpreadJS 加载失败: ${err instanceof Error ? err.message : String(err)}`
      return
    }
    if (!this.isConnected || this._spread) return
    this._host.textContent = ''
    this._spread = new GC.Spread.Sheets.Workbook(this._host, { sheetCount: 1 })
    this._spread.options.allowUndo = true
    this._spread.undoManager?.().maxSize?.(100)
    // 注册报表取数自定义函数（QM/QC/JE/FS/REF），并注入「当前活动 sheet 名」兜底器。
    _reportActiveSheetName = () => { try { return this._spread?.getActiveSheet?.()?.name?.() || '' } catch (_) { return '' } }
    registerReportFetchFunctions(GC)
    this._registerCommands()
    this._bindEvents()
    this._bootstrapFromAttributes()
    this._startAddrPoll()
    // light/dark 主题：显式 data-cmx-theme 覆盖，否则 auto 跟随门户；首帧即正确。
    this._colorScheme = this.getAttribute('data-cmx-theme') || 'auto'
    this.setColorScheme(this._colorScheme)
    // 门户切主题广播 cmx-portal-theme-change → auto 模式实时重涂
    this._onPortalThemeChange = (ev) => { if ((this._colorScheme || 'auto') === 'auto') this.setColorScheme('auto', ev && ev.detail && ev.detail.theme) }
    try { window.addEventListener('cmx-portal-theme-change', this._onPortalThemeChange) } catch (_) {}
    // 可见性观察：报表切到非当前 tab 时宿主 display:none（尺寸 0）。若此时切主题触发 refresh，
    // SpreadJS 会缓存 0×0 坏布局，切回来画布空白。故隐藏期的重绘挂起（_pendingRefresh），
    // 由 IntersectionObserver 在「重新可见」时补一次 refresh() 恢复布局。
    this._setupVisibilityObserver()
  }

  /** 宿主当前是否有可见布局（非 display:none / 尺寸非 0）。 */
  _isVisible () {
    try {
      if (!this.isConnected) return false
      if (this.offsetParent === null && getComputedStyle(this).position !== 'fixed') return false
      const r = this.getBoundingClientRect()
      return r.width > 0 && r.height > 0
    } catch (_) { return true }
  }

  /** 立即重绘（若工作簿在）。 */
  _refreshSpread () {
    try { this._spread && this._spread.refresh && this._spread.refresh() } catch (_) {}
  }

  /** 隐藏→可见时补重绘，修复隐藏期主题切换/尺寸变化留下的坏布局。 */
  _setupVisibilityObserver () {
    if (this._visObserver || typeof IntersectionObserver === 'undefined') return
    this._wasVisible = this._isVisible()
    this._visObserver = new IntersectionObserver((entries) => {
      const nowVisible = entries.some((e) => e.isIntersecting && e.intersectionRatio > 0) || this._isVisible()
      if (nowVisible && !this._wasVisible) {
        // 重新可见：先补挂起的主题重涂，再强制重绘布局（rAF 等一帧让尺寸落定）
        if (this._pendingRefresh) { this._pendingRefresh = false }
        try { requestAnimationFrame(() => { this._refreshSpread(); try { this._spread?.getActiveSheet?.()?.invalidateLayout?.() } catch (_) {} this._refreshSpread() }) } catch (_) { this._refreshSpread() }
      }
      this._wasVisible = nowVisible
    }, { threshold: [0, 0.01] })
    try { this._visObserver.observe(this) } catch (_) {}
  }

  disconnectedCallback () {
    if (this._addrPoll) { clearInterval(this._addrPoll); this._addrPoll = null }
    if (this._onPortalThemeChange) { try { window.removeEventListener('cmx-portal-theme-change', this._onPortalThemeChange) } catch (_) {} this._onPortalThemeChange = null }
    if (this._visObserver) { try { this._visObserver.disconnect() } catch (_) {} this._visObserver = null }
    if (this._spread) this._spread.destroy()
    this._spread = null
    this._host = null
  }

  /**
   * 名称框/公式栏兜底轮询：SpreadJS 的 SelectionChanged 事件在真机点选/编程改选区时
   * 并不总触发（已知），导致左上角名称框（.addr）不随点击更新。故 200ms 比对活动格地址，
   * 变化就同步名称框，保证坐标始终跟手。
   */
  _startAddrPoll () {
    if (this._addrPoll) return
    this._lastPolledAddr = null
    this._addrPoll = setInterval(() => {
      try {
        const addr = this.getActiveAddr()
        if (addr && addr !== this._lastPolledAddr) {
          this._lastPolledAddr = addr
          this._syncFormulaBar()
          const p = parseAddr(addr)
          this.dispatchEvent(new CustomEvent('cmx-cell-selected', { detail: { addr, row: p?.row, col: p?.col }, bubbles: true, composed: true }))
        }
      } catch (_) {}
    }, 200)
  }

  setReportModel (report) {
    this._report = report || null
    if (!this._spread) return
    const prev = this.getActiveSheet()
    this._spread.suspendPaint()
    try {
      this._spread.clearSheets()
      const meta = report?.meta || report?.moduleMeta || {}
      const sheets = report?.sheets?.length
        ? report.sheets
        : [{ id: 's1', name: meta.reportName || meta.moduleName || 'Sheet1', grid: report?.grid || {}, cells: report?.cells || {} }]
      sheets.forEach((def, idx) => {
        const sheet = new GC.Spread.Sheets.Worksheet(def.name || `Sheet${idx + 1}`)
        this._spread.addSheet(idx, sheet)
        this._applySheetModel(sheet, def, report?.fetches || {})
        this._bindSheetEvents(sheet)
      })
      this._spread.setActiveSheetIndex(Math.min(prev, Math.max(0, sheets.length - 1)))
    } finally {
      this._spread.resumePaint()
    }
    try { this._spread.undoManager?.().clear() } catch (_) {}
    this.setColorScheme(this._colorScheme || 'auto') // clearSheets/新建 sheet 重置了 options，重涂主题
    this._syncFormulaBar()
  }

  getReportModel () {
    return this._report
  }

  setWorkbook (spread) {
    if (spread && spread.toJSON && this._spread) this._spread.fromJSON(spread.toJSON())
  }

  getWorkbook () {
    return this._spread
  }

  /**
   * 导出 SpreadJS 原生 SSJSON（Excel 最新格式的完整快照）——报表版式的主真相，
   * 存入 cr_report_fmt.doc_content BLOB。含公式/样式/合并/列宽等一切画布细节。
   * ★ 主题中性化：dark/light 只是「显示态」视图色，不能存进 BLOB（否则 dark 下保存的
   *   报表在别人 light 下打开会是深色）。故序列化后剔除主题视图色键，让 BLOB 恒为中性。
   */
  getWorkbookJson () {
    if (!this._spread) return null
    let json = null
    try { json = this._spread.toJSON({ includeBindingSource: true, saveAsView: false }) } catch (_) {
      try { json = this._spread.toJSON() } catch (_) { return null }
    }
    return this._stripThemeColors(json)
  }

  /** 从 SSJSON 剔除主题视图色（grayArea/back/selection/gridline color/sheetTab/frozenline + 行列头默认样式），使 BLOB 主题中性。 */
  _stripThemeColors (json) {
    if (!json || typeof json !== 'object') return json
    try {
      // workbook 级
      for (const k of ['grayAreaBackColor', 'backColor', 'selectionBackColor', 'selectionBorderColor', 'tabStripBackColor']) {
        if (k in json) delete json[k]
      }
      const sheets = json.sheets || {}
      for (const name of Object.keys(sheets)) {
        const sh = sheets[name]
        if (!sh || typeof sh !== 'object') continue
        // 网格线只删颜色，保留显隐
        if (sh.gridline && typeof sh.gridline === 'object' && 'color' in sh.gridline) delete sh.gridline.color
        for (const k of ['sheetTabColor', 'frozenlineColor']) { if (k in sh) delete sh[k] }
        // 行列头默认样式的主题头色（结构：rowHeaderData/colHeaderData.defaultDataNode.style.{backColor,foreColor}）
        for (const hd of [sh.rowHeaderData, sh.colHeaderData, sh.cornerData]) {
          const style = hd && hd.defaultDataNode && hd.defaultDataNode.style
          if (style && typeof style === 'object') {
            if ('backColor' in style) delete style.backColor
            if ('foreColor' in style) delete style.foreColor
          }
        }
      }
    } catch (_) {}
    return json
  }

  /**
   * 从 SSJSON 无损复原工作簿（加载版式态：BLOB → fromJSON）。清空撤销栈（加载不算可撤销编辑）。
   * 返回 Promise（SpreadJS 19 fromJSON 可能异步）。
   */
  setWorkbookJson (json) {
    if (!this._spread || !json) return Promise.resolve(false)
    const doIt = () => {
      try { this._spread.undoManager?.().clear() } catch (_) {}
      this.setColorScheme(this._colorScheme || 'auto') // fromJSON 复原会覆盖 options，重涂主题
      this._syncFormulaBar()
      return true
    }
    try {
      const r = this._spread.fromJSON(json)
      // fromJSON 在部分版本返回 Promise
      if (r && typeof r.then === 'function') return r.then(doIt, () => false)
      return Promise.resolve(doIt())
    } catch (err) {
      return Promise.reject(err instanceof Error ? err : new Error(String(err)))
    }
  }

  /**
   * 报表数据回填（模式二）：按 A1 画布坐标覆盖单元格显示值，保留版式与公式。
   * map = { 'C3': 885000, 'C4': '手工文本', ... }。取数格/公式格由 SpreadJS 原生重算，
   * 这里只覆盖需要的数据值。
   */
  setCellValues (map) {
    const sheet = this._spread?.getActiveSheet()
    if (!sheet || !map) return false
    this._spread.suspendPaint()
    try {
      Object.entries(map).forEach(([addr, v]) => {
        const p = parseAddr(addr)
        if (!p) return
        // 数值字符串转 number（DECIMAL 从后端来常是字符串），否则原样写
        const num = typeof v === 'string' && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : v
        sheet.setValue(p.row, p.col, num == null ? '' : num)
      })
    } finally {
      this._spread.resumePaint()
    }
    return true
  }

  /**
   * 灌报表取数值 map（键 `sheetName!CELLREF` 或裸 `CELLREF`——裸键按当前活动 sheet 归一）。
   * 取数函数 QM/QC/JE/FS/REF 的 evaluate 从此 map 按「所在格」取值。灌完触发重算刷新公式格显示。
   */
  setReportValueMap (map) {
    const norm = {}
    const activeName = (() => { try { return this._spread?.getActiveSheet?.()?.name?.() || '' } catch (_) { return '' } })()
    for (const [k, v] of Object.entries(map || {})) {
      // 归一键：`sheetName!CELLREF`（只大写 cellRef，保留 sheet 名原样）；裸 cellRef 按当前活动 sheet 补前缀。
      const bang = k.indexOf('!')
      const nk = bang >= 0 ? `${k.slice(0, bang)}!${k.slice(bang + 1).toUpperCase()}` : `${activeName}!${k.toUpperCase()}`
      norm[nk] = v
    }
    _reportValueMap = norm
    try { this._spread?.calc?.() } catch (_) {}
    try { this._spread?.getActiveSheet?.()?.recalcAll?.(true) } catch (_) {}
    return true
  }

  /** 读当前报表取数值 map（调试用）。 */
  getReportValueMap () { return _reportValueMap }

  showFormulaBar (visible) {
    this._formulaBar = visible !== false
    const bar = this.shadowRoot?.querySelector('.formula')
    if (bar) bar.style.display = this._formulaBar ? 'flex' : 'none'
  }

  showHeaders (visible) {
    const sheet = this._spread?.getActiveSheet()
    if (sheet) {
      sheet.options.colHeaderVisible = visible !== false
      sheet.options.rowHeaderVisible = visible !== false
    }
  }

  showGridlines (visible) {
    const sheet = this._spread?.getActiveSheet()
    if (sheet) sheet.options.gridline = { showVerticalGridline: visible !== false, showHorizontalGridline: visible !== false, color: this._themeGridColor || undefined }
  }

  setEditable (editable) {
    this._editable = editable !== false
    this._spread?.options && (this._spread.options.readOnly = !this._editable)
  }

  /**
   * 应用 light/dark 画布配色。mode: 'dark' | 'light' | 'auto'（auto=按 <html> SAP 主题解析）。
   * 只设视图色（workbook/sheet options + 行列头 SheetArea 默认样式）——不进保存 BLOB、不盖用户格色。
   */
  setColorScheme (mode, explicitThemeId) {
    if (mode) this._colorScheme = mode
    const want = this._colorScheme || 'auto'
    const resolved = want === 'dark' ? 'dark' : (want === 'light' ? 'light' : (_isDarkThemeGlobal(explicitThemeId) ? 'dark' : 'light'))
    this._resolvedScheme = resolved
    const t = SPREAD_THEMES[resolved]
    this._themeGridColor = t.gridline
    // 宿主根 class（供皮肤 CSS / 滚动条微调）
    try { this.shadowRoot?.querySelector('.wrap')?.classList.toggle('cmx-spread-dark', resolved === 'dark') } catch (_) {}
    const spread = this._spread
    if (!spread || !GC) return
    const SA = GC.Spread.Sheets.SheetArea
    try { spread.suspendPaint() } catch (_) {}
    try {
      // workbook 级视图色
      const wo = spread.options || {}
      wo.grayAreaBackColor = t.grayArea
      wo.backColor = t.sheetBack
      wo.selectionBackColor = t.selectionBack
      wo.selectionBorderColor = t.selectionBorder
      wo.tabStripBackColor = t.tabStripBack
      // 每个 sheet：网格线/页签/冻结线 + 行列头默认样式（SheetArea，属视图 chrome 不污染数据）
      const cnt = (typeof spread.getSheetCount === 'function') ? spread.getSheetCount() : 1
      for (let i = 0; i < cnt; i++) {
        const ws = spread.getSheet ? spread.getSheet(i) : spread.getActiveSheet()
        if (!ws) continue
        const g = ws.options.gridline || {}
        ws.options.gridline = { showVerticalGridline: g.showVerticalGridline !== false, showHorizontalGridline: g.showHorizontalGridline !== false, color: t.gridline }
        ws.options.sheetTabColor = t.sheetTabColor
        try { ws.options.frozenlineColor = t.frozenline } catch (_) {}
        const hdr = new GC.Spread.Sheets.Style()
        hdr.backColor = t.headerBack
        hdr.foreColor = t.headerFore
        try { ws.setDefaultStyle(hdr, SA.colHeader) } catch (_) {}
        try { ws.setDefaultStyle(hdr, SA.rowHeader) } catch (_) {}
        try { ws.setDefaultStyle(hdr, SA.corner) } catch (_) {}
      }
    } catch (_) {}
    try { spread.resumePaint() } catch (_) {}
    // 隐藏期（display:none / 尺寸 0）不 refresh：否则 SpreadJS 缓存 0×0 坏布局，切回来空白。
    // 主题 options 已写入，等重新可见由 IntersectionObserver 补 refresh（_pendingRefresh 标记）。
    if (this._isVisible ? this._isVisible() : true) {
      try { spread.refresh() } catch (_) {}
    } else {
      this._pendingRefresh = true
    }
  }

  getSelectionState () {
    const sheet = this._spread?.getActiveSheet()
    if (!sheet) return {}
    const row = Math.max(0, sheet.getActiveRowIndex())
    const col = Math.max(0, sheet.getActiveColumnIndex())
    const style = sheet.getStyle(row, col) || {}
    const font = String(style.font || '')
    const state = cellStyleFromSpread(style)
    state.addr = this.getActiveAddr()
    state.selection = this.readSelection()
    state.fontFamily = /var\(--sapFontFamily/.test(font) ? 'Arial' : (font.split(/\s+/).pop() || 'Arial').replace(/["']/g, '')
    state.fontSize = (() => {
      const m = /(\d+(?:\.\d+)?)px/i.exec(font)
      return m ? String(Math.round(Number(m[1]))) : '11'
    })()
    state.valign = (() => {
      try {
        if (style.vAlign === GC.Spread.Sheets.VerticalAlign.top) return 'top'
        if (style.vAlign === GC.Spread.Sheets.VerticalAlign.bottom) return 'bottom'
      } catch (_) {}
      return 'middle'
    })()
    state.fontColor = style.foreColor || ''
    state.fillColor = style.backColor || ''
    state.format = style.formatter || ''
    state.wordWrap = !!style.wordWrap
    return state
  }

  applySelectionStyle (style) {
    const sheet = this._spread?.getActiveSheet()
    if (!sheet) return false
    const ranges = this._viewportSelections(sheet)
    if (!ranges.length) return false
    const ok = this._runUndoable('cmxApplySelectionStyle', () => {
      this._spread.suspendPaint()
      try {
        ranges.forEach((r) => {
          const range = sheet.getRange(r.row, r.col, r.rowCount, r.colCount)
          if (style.font) range.font(String(style.font))
          if (style.hAlign) range.hAlign(GC.Spread.Sheets.HorizontalAlign[String(style.hAlign)] || GC.Spread.Sheets.HorizontalAlign.left)
          if (style.vAlign) range.vAlign(GC.Spread.Sheets.VerticalAlign[String(style.vAlign)] || GC.Spread.Sheets.VerticalAlign.center)
          if (style.textDecoration) range.textDecoration(style.textDecoration === 'underline' ? GC.Spread.Sheets.TextDecorationType.underline : 0)
          if (Object.prototype.hasOwnProperty.call(style, 'foreColor')) range.foreColor(style.foreColor || undefined)
          if (Object.prototype.hasOwnProperty.call(style, 'backColor')) range.backColor(style.backColor || undefined)
          if (Object.prototype.hasOwnProperty.call(style, 'formatter')) range.formatter(style.formatter || undefined)
          if (Object.prototype.hasOwnProperty.call(style, 'wordWrap')) range.wordWrap(!!style.wordWrap)
        })
      } finally {
        this._spread.resumePaint()
      }
    })
    if (ok) this._emitSelection()
    return ok
  }

  applySelectionBorder (kind = 'all', color = '#8a8f94', lineStyle = 'thin') {
    const sheet = this._spread?.getActiveSheet()
    if (!sheet) return false
    const ranges = this._viewportSelections(sheet)
    if (!ranges.length) return false
    const ls = GC.Spread.Sheets.LineStyle[String(lineStyle)] != null
      ? GC.Spread.Sheets.LineStyle[String(lineStyle)]
      : GC.Spread.Sheets.LineStyle.thin
    const border = new GC.Spread.Sheets.LineBorder(color || 'var(--sapGroup_ContentBorderColor, #8a8f94)', ls)
    const BPT = GC.Spread.Sheets.BorderPositionType
    return this._runUndoable('cmxApplySelectionBorder', () => {
      this._spread.suspendPaint()
      try {
        ranges.forEach((r) => {
          const range = sheet.getRange(r.row, r.col, r.rowCount, r.colCount)
          const r0 = r.row; const c0 = r.col
          const r1 = r.row + r.rowCount - 1; const c1 = r.col + r.colCount - 1
          const canSet = BPT && typeof range.setBorder === 'function'
          // 说明：此 SpreadJS 构建下 range.setBorder(border,{top/outline/inside}) 语义不稳
          //（外框会误设成全格、内部无效），故除「全部/无」用区域级快捷 setBorder(all)/清除外，
          // 其余线位一律「精确逐格设正确的那条边」——单元格级 getCell().borderX() 是确定的。
          if (kind === 'none') {
            if (canSet) range.setBorder(null, { all: true })
            else { for (let row = r0; row <= r1; row++) for (let col = c0; col <= c1; col++) sheet.getCell(row, col).borderTop(null).borderBottom(null).borderLeft(null).borderRight(null) }
          } else if (kind === 'all') {
            // 所有框线（外沿+内部网格线）：区域级 setBorder(all) 一次成型（快，避免大选区逐格卡死）
            if (canSet) range.setBorder(border, { all: true })
            else { for (let row = r0; row <= r1; row++) for (let col = c0; col <= c1; col++) sheet.getCell(row, col).borderTop(border).borderBottom(border).borderLeft(border).borderRight(border) }
          } else if (kind === 'top') {
            for (let col = c0; col <= c1; col++) sheet.getCell(r0, col).borderTop(border)
          } else if (kind === 'bottom') {
            for (let col = c0; col <= c1; col++) sheet.getCell(r1, col).borderBottom(border)
          } else if (kind === 'left') {
            for (let row = r0; row <= r1; row++) sheet.getCell(row, c0).borderLeft(border)
          } else if (kind === 'right') {
            for (let row = r0; row <= r1; row++) sheet.getCell(row, c1).borderRight(border)
          } else if (kind === 'outline') {
            // 外侧框线 = 只画区域四条外沿（周长级，非全格）
            for (let col = c0; col <= c1; col++) { sheet.getCell(r0, col).borderTop(border); sheet.getCell(r1, col).borderBottom(border) }
            for (let row = r0; row <= r1; row++) { sheet.getCell(row, c0).borderLeft(border); sheet.getCell(row, c1).borderRight(border) }
          } else if (kind === 'inside') {
            // 内部框线 = 内部横线（非首行上沿=各行的下沿，末行除外）+ 内部竖线（各列右沿，末列除外）
            for (let row = r0; row <= r1; row++) {
              for (let col = c0; col <= c1; col++) {
                if (row < r1) sheet.getCell(row, col).borderBottom(border) // 行间横线
                if (col < c1) sheet.getCell(row, col).borderRight(border)  // 列间竖线
              }
            }
          } else if (kind === 'innerHorizontal') {
            // 内部横线：只画行间横线（各行下沿，末行除外），不含外沿与竖线
            for (let row = r0; row < r1; row++) {
              for (let col = c0; col <= c1; col++) sheet.getCell(row, col).borderBottom(border)
            }
          } else if (kind === 'innerVertical') {
            // 内部竖线：只画列间竖线（各列右沿，末列除外），不含外沿与横线
            for (let col = c0; col < c1; col++) {
              for (let row = r0; row <= r1; row++) sheet.getCell(row, col).borderRight(border)
            }
          } else {
            // 兜底：当作 all
            if (canSet) range.setBorder(border, { all: true })
          }
        })
      } finally {
        this._spread.resumePaint()
      }
    })
  }

  mergeSelection () {
    const sheet = this._spread?.getActiveSheet()
    const r = this._viewportSelections(sheet)[0]
    if (!sheet || !r || r.rowCount <= 1 && r.colCount <= 1) return false
    return this._runUndoable('cmxMergeSelection', () => sheet.addSpan(r.row, r.col, r.rowCount, r.colCount))
  }

  unmergeSelection () {
    const sheet = this._spread?.getActiveSheet()
    const ranges = this._viewportSelections(sheet)
    if (!sheet || !ranges.length) return false
    return this._runUndoable('cmxUnmergeSelection', () => ranges.forEach((r) => sheet.removeSpan(r.row, r.col)))
  }

  clearSelection (mode = 'all') {
    const sheet = this._spread?.getActiveSheet()
    const ranges = this._viewportSelections(sheet)
    if (!sheet || !ranges.length) return false
    const area = GC.Spread.Sheets.SheetArea.viewport
    const type = mode === 'format'
      ? GC.Spread.Sheets.StorageType.style
      : mode === 'value'
        ? GC.Spread.Sheets.StorageType.data
        : GC.Spread.Sheets.StorageType.data | GC.Spread.Sheets.StorageType.style
    return this._runUndoable('cmxClearSelection', () => {
      ranges.forEach((r) => {
        sheet.clear(r.row, r.col, r.rowCount, r.colCount, area, type)
      })
    })
  }

  insertRows (count = 1) {
    const sheet = this._spread?.getActiveSheet()
    if (!sheet) return false
    return this._runUndoable('cmxInsertRows', () => {
      sheet.addRows(Math.max(0, sheet.getActiveRowIndex()), Math.max(1, Number(count) || 1))
    })
  }

  deleteRows (count = 1) {
    const sheet = this._spread?.getActiveSheet()
    if (!sheet) return false
    return this._runUndoable('cmxDeleteRows', () => {
      sheet.deleteRows(Math.max(0, sheet.getActiveRowIndex()), Math.max(1, Number(count) || 1))
    })
  }

  insertColumns (count = 1) {
    const sheet = this._spread?.getActiveSheet()
    if (!sheet) return false
    return this._runUndoable('cmxInsertColumns', () => {
      sheet.addColumns(Math.max(0, sheet.getActiveColumnIndex()), Math.max(1, Number(count) || 1))
    })
  }

  deleteColumns (count = 1) {
    const sheet = this._spread?.getActiveSheet()
    if (!sheet) return false
    return this._runUndoable('cmxDeleteColumns', () => {
      sheet.deleteColumns(Math.max(0, sheet.getActiveColumnIndex()), Math.max(1, Number(count) || 1))
    })
  }

  undo () {
    try { return !!this._spread?.commandManager?.().execute({ cmd: 'undo', sheetName: this._spread.getActiveSheet()?.name?.() }) } catch (_) { return false }
  }

  redo () {
    try { return !!this._spread?.commandManager?.().execute({ cmd: 'redo', sheetName: this._spread.getActiveSheet()?.name?.() }) } catch (_) { return false }
  }

  undoSteps (count = 1) {
    const n = Math.max(1, Number(count) || 1)
    let ok = false
    for (let i = 0; i < n; i++) {
      if (!this._spread?.undoManager?.().canUndo?.()) break
      ok = this.undo() || ok
    }
    return ok
  }

  redoSteps (count = 1) {
    const n = Math.max(1, Number(count) || 1)
    let ok = false
    for (let i = 0; i < n; i++) {
      if (!this._spread?.undoManager?.().canRedo?.()) break
      ok = this.redo() || ok
    }
    return ok
  }

  getHistoryState () {
    const manager = this._spread?.undoManager?.()
    if (!manager) return { undo: [], redo: [], canUndo: false, canRedo: false }
    const normalize = (stack, type) => (stack || []).slice().reverse().map((item, index) => ({
      index,
      steps: index + 1,
      label: this._historyLabel(item, type),
      sheetName: item?.sheetName || '',
    }))
    return {
      undo: normalize(manager.getUndoStack?.(), 'undo'),
      redo: normalize(manager.getRedoStack?.(), 'redo'),
      canUndo: !!manager.canUndo?.(),
      canRedo: !!manager.canRedo?.(),
    }
  }

  getActiveSheet () {
    return this._spread ? this._spread.getActiveSheetIndex() : 0
  }

  setActiveSheet (index) {
    if (!this._spread) return
    this._spread.setActiveSheetIndex(Number(index) || 0)
  }

  getActiveAddr () {
    const sheet = this._spread?.getActiveSheet()
    if (!sheet) return 'A1'
    return `${indexToCol(sheet.getActiveColumnIndex())}${sheet.getActiveRowIndex() + 1}`
  }

  readSelection () {
    const sheet = this._spread?.getActiveSheet()
    const sel = sheet?.getSelections?.()[0]
    if (!sel) return this.getActiveAddr()
    const a = `${indexToCol(sel.col)}${sel.row + 1}`
    const b = `${indexToCol(sel.col + sel.colCount - 1)}${sel.row + sel.rowCount}`
    return a === b ? a : `${a}:${b}`
  }

  _viewportSelections (sheet) {
    if (!sheet) return []
    const rowCount = sheet.getRowCount()
    const colCount = sheet.getColumnCount()
    const sels = sheet.getSelections?.() || []
    return sels.map((s) => {
      const row = s.row < 0 ? 0 : s.row
      const col = s.col < 0 ? 0 : s.col
      const rc = s.row < 0 ? rowCount : Math.max(1, s.rowCount || 1)
      const cc = s.col < 0 ? colCount : Math.max(1, s.colCount || 1)
      return { row, col, rowCount: rc, colCount: cc }
    }).filter((r) => r.rowCount > 0 && r.colCount > 0)
  }

  exportXlsx () {
    const spread = this._spread
    if (!spread) return Promise.reject(new Error('无工作簿'))
    let name = arguments[0] || 'report'
    name = String(name).replace(/\.json$/i, '').replace(/\.xlsx$/i, '') + '.xlsx'
    return ensureExcelIo().then((excelIo) => new Promise((resolve, reject) => {
      try {
        excelIo.save(
          spread.toJSON({ includeBindingSource: true }),
          (blob) => {
            try {
              downloadBlob(blob instanceof Blob ? blob : new Blob([blob], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name)
              resolve(true)
            } catch (e) { reject(e) }
          },
          (err) => reject(err instanceof Error ? err : new Error(String(err || 'xlsx 导出失败'))),
        )
      } catch (e) { reject(e) }
    }))
  }

  importXlsx (file) {
    if (!file) return Promise.reject(new Error('未提供文件'))
    return ensureExcelIo().then((excelIo) => new Promise((resolve, reject) => {
      try {
        excelIo.open(
          file,
          (json) => {
            const host = document.createElement('div')
            host.style.cssText = 'position:absolute;left:-10000px;top:-10000px;width:800px;height:600px;'
            document.body.appendChild(host)
            const wb = new GC.Spread.Sheets.Workbook(host, { sheetCount: 0 })
            try {
              wb.fromJSON(json)
              resolve({ sheets: this._spreadToSheets(wb) })
            } catch (e) {
              reject(e)
            } finally {
              try { wb.destroy() } catch (_) {}
              try { document.body.removeChild(host) } catch (_) {}
            }
          },
          (err) => reject(err instanceof Error ? err : new Error(String(err || 'xlsx 解析失败'))),
        )
      } catch (e) { reject(e) }
    }))
  }

  _applySheetModel (sheet, def, fetches) {
    const grid = def.grid || {}
    const cells = def.cells || {}
    sheet.setRowCount(Number(grid.rows) || 40)
    sheet.setColumnCount(Number(grid.cols) || 12)
    Object.entries(grid.colWidths || {}).forEach(([letter, px]) => sheet.setColumnWidth(colToIndex(letter), Number(px) || 80))
    Object.entries(grid.rowHeights || {}).forEach(([rowNo, px]) => sheet.setRowHeight(Number(rowNo) - 1, Number(px) || 24))
    ;(grid.merges || []).forEach((range) => {
      const r = parseRange(range)
      if (r) sheet.addSpan(r.r1, r.c1, r.r2 - r.r1 + 1, r.c2 - r.c1 + 1)
    })
    const classes = grid.styleClasses || {}
    Object.entries(cells).forEach(([addr, cell]) => {
      const p = parseAddr(addr)
      if (!p) return
      if (cell.formula) sheet.setFormula(p.row, p.col, normalizeFormula(cell.formula))
      else sheet.setValue(p.row, p.col, cell.value ?? '')
      applyStyle(sheet, p.row, p.col, cell, classes)
      const key = cell.fetchKey || (cell.type === 'fetch' ? cell.formula : '')
      if (key && fetches && Object.prototype.hasOwnProperty.call(fetches, key)) sheet.setValue(p.row, p.col, fetches[key])
    })
  }

  _bindEvents () {
    const S = GC.Spread.Sheets.Events
    this._spread.bind(S.ActiveSheetChanged, (_e, info) => {
      this.dispatchEvent(new CustomEvent('cmx-sheet-changed', { detail: { index: info.newSheetIndex }, bubbles: true, composed: true }))
      this._bindSheetEvents(this._spread.getActiveSheet())
      this._syncFormulaBar()
    })
    this._bindSheetEvents(this._spread.getActiveSheet())
    const fx = this.shadowRoot.querySelector('.fx')
    fx?.addEventListener('change', () => {
      const sheet = this._spread.getActiveSheet()
      const row = sheet.getActiveRowIndex()
      const col = sheet.getActiveColumnIndex()
      const value = fx.value
      this._runUndoable('cmxFormulaBarEdit', () => {
        if (String(value).startsWith('=')) sheet.setFormula(row, col, normalizeFormula(value))
        else sheet.setValue(row, col, value)
      })
    })
  }

  _registerCommands () {
    if (!this._spread || this._commandsRegistered) return
    this._commandsRegistered = true
    const command = {
      canUndo: true,
      execute: (context, options, isUndo) => {
        const Commands = GC.Spread.Sheets.Commands
        options.cmd = options.cmd || 'cmxUndoableCommand'
        if (isUndo) {
          Commands.undoTransaction(context, options)
          return true
        }
        Commands.startTransaction(context, options)
        try {
          if (typeof options.action === 'function') options.action(context)
        } finally {
          Commands.endTransaction(context, options)
        }
        return true
      },
    }
    this._spread.commandManager().register('cmxUndoableCommand', command)
  }

  _runUndoable (name, action) {
    if (!this._spread || typeof action !== 'function') return false
    this._registerCommands()
    const sheet = this._spread.getActiveSheet()
    const sheetName = sheet?.name?.()
    try {
      const ok = this._spread.commandManager().execute({
        cmd: 'cmxUndoableCommand',
        name,
        sheetName,
        action,
      })
      return ok !== false
    } catch (_) {
      try { action(this._spread) } catch (_) { return false }
      return true
    }
  }

  _historyLabel (item, type) {
    const raw = String(item?.name || item?.cmd || '')
    const labels = {
      cmxApplySelectionStyle: '设置单元格格式',
      cmxApplySelectionBorder: '设置边框',
      cmxMergeSelection: '合并单元格',
      cmxUnmergeSelection: '取消合并',
      cmxClearSelection: '清除单元格',
      cmxInsertRows: '插入行',
      cmxDeleteRows: '删除行',
      cmxInsertColumns: '插入列',
      cmxDeleteColumns: '删除列',
      cmxFormulaBarEdit: '编辑公式栏',
      editCell: '编辑单元格',
      clearValues: '清除内容',
      clear: '清除',
      clipboardPaste: '粘贴',
      paste: '粘贴',
      dragDrop: '拖放填充',
      resizeColumn: '调整列宽',
      resizeRow: '调整行高',
    }
    if (labels[raw]) return labels[raw]
    if (raw === 'cmxUndoableCommand' && item?.name && labels[item.name]) return labels[item.name]
    if (raw === 'cmxUndoableCommand') return type === 'redo' ? '重做表格操作' : '撤销表格操作'
    return raw || (type === 'redo' ? '重做操作' : '撤销操作')
  }

  _bindSheetEvents (sheet) {
    if (!sheet || sheet.__cmxSpreadjsBound) return
    sheet.__cmxSpreadjsBound = true
    const S = GC.Spread.Sheets.Events
    sheet.bind(S.SelectionChanged, () => this._emitSelection())
    sheet.bind(S.CellChanged, (_e, info) => {
      if (!info || info.sheetArea !== GC.Spread.Sheets.SheetArea.viewport) return
      const addr = `${indexToCol(info.col)}${info.row + 1}`
      this.dispatchEvent(new CustomEvent('cmx-cell-edited', { detail: { addr, ...readCellValue(info.sheet, info.row, info.col) }, bubbles: true, composed: true }))
      this._syncFormulaBar()
    })
    sheet.bind(S.ColumnWidthChanged, (_e, info) => {
      if (info.col < 0) return
      this.dispatchEvent(new CustomEvent('cmx-col-resized', { detail: { letter: indexToCol(info.col), col: info.col, px: Math.round(info.newWidth) }, bubbles: true, composed: true }))
    })
    sheet.bind(S.RowHeightChanged, (_e, info) => {
      if (info.row < 0) return
      this.dispatchEvent(new CustomEvent('cmx-row-resized', { detail: { rowNo: info.row + 1, row: info.row, px: Math.round(info.newHeight) }, bubbles: true, composed: true }))
    })
  }

  _spreadToSheets (workbook) {
    const sheets = []
    const count = workbook.getSheetCount()
    for (let si = 0; si < count; si++) {
      const sheet = workbook.getSheet(si)
      if (this._isEvaluationNoticeSheet(sheet)) continue
      const rowCount = Math.min(Math.max(sheet.getRowCount(), 20), 300)
      const colCount = Math.min(Math.max(sheet.getColumnCount(), 8), 80)
      const cells = {}
      let maxRow = 0
      let maxCol = 0
      for (let r = 0; r < rowCount; r++) {
        for (let c = 0; c < colCount; c++) {
          const value = sheet.getValue(r, c)
          const formula = sheet.getFormula(r, c)
          const style = cellStyleFromSpread(sheet.getStyle(r, c))
          const hasStyle = Object.keys(style).length > 0
          if (value == null && !formula && !hasStyle) continue
          const addr = `${indexToCol(c)}${r + 1}`
          const cell = formula ? { type: 'calc', formula: `=${formula}` } : { type: 'text', value }
          if (hasStyle) cell.style = style
          cells[addr] = cell
          maxRow = Math.max(maxRow, r + 1)
          maxCol = Math.max(maxCol, c + 1)
        }
      }
      const merges = []
      try {
        const spans = sheet.getSpans()
        ;(spans || []).forEach((span) => {
          if (!span || span.rowCount <= 1 && span.colCount <= 1) return
          merges.push(`${indexToCol(span.col)}${span.row + 1}:${indexToCol(span.col + span.colCount - 1)}${span.row + span.rowCount}`)
          maxRow = Math.max(maxRow, span.row + span.rowCount)
          maxCol = Math.max(maxCol, span.col + span.colCount)
        })
      } catch (_) {}
      const colWidths = {}
      for (let c = 0; c < maxCol; c++) {
        const px = Math.round(sheet.getColumnWidth(c))
        if (px > 0 && Math.abs(px - 62) > 2) colWidths[indexToCol(c)] = px
      }
      const rowHeights = {}
      for (let r = 0; r < maxRow; r++) {
        const px = Math.round(sheet.getRowHeight(r))
        if (px > 0 && Math.abs(px - 20) > 2) rowHeights[r + 1] = px
      }
      const grid = { rows: Math.max(maxRow + 5, 20), cols: Math.max(maxCol + 2, 8) }
      if (merges.length) grid.merges = merges
      if (Object.keys(colWidths).length) grid.colWidths = colWidths
      if (Object.keys(rowHeights).length) grid.rowHeights = rowHeights
      sheets.push({ id: `s${si + 1}`, name: sheet.name() || `Sheet${si + 1}`, grid, cells })
    }
    return sheets
  }

  _isEvaluationNoticeSheet (sheet) {
    try {
      return sheet.name() === 'Evaluation Version' &&
        String(sheet.getValue(1, 1) || '').includes('Powered by Spread.Sheets')
    } catch (_) {
      return false
    }
  }

  _emitSelection () {
    this._syncFormulaBar()
    const addr = this.getActiveAddr()
    const p = parseAddr(addr)
    this.dispatchEvent(new CustomEvent('cmx-cell-selected', { detail: { addr, row: p?.row, col: p?.col }, bubbles: true, composed: true }))
  }

  _syncFormulaBar () {
    const addr = this.getActiveAddr()
    const p = parseAddr(addr)
    const sheet = this._spread?.getActiveSheet()
    const addrEl = this.shadowRoot?.querySelector('.addr')
    const fx = this.shadowRoot?.querySelector('.fx')
    if (addrEl) addrEl.textContent = addr
    if (fx && sheet && p) {
      const formula = sheet.getFormula(p.row, p.col)
      fx.value = formula ? `=${formula}` : (sheet.getValue(p.row, p.col) ?? '')
    }
  }

  _bootstrapFromAttributes () {
    this.showFormulaBar(this.getAttribute('data-cmx-formula-bar') !== 'false')
    const rep = this.getAttribute('data-cmx-report')
    if (rep) {
      try { this.setReportModel(JSON.parse(rep)) } catch (_) {}
    }
  }
}

// 自注册（M6：仅在择核为 spreadjs 时自注册；mega 内核由 barrel 注册同标签，消费方零改）。
import { resolveSheetKernel } from './sheet-kernel.js'
if (resolveSheetKernel() === 'spreadjs' && !customElements.get('cmx-spreadjs-sheet')) {
  customElements.define('cmx-spreadjs-sheet', CmxSpreadjsSheet)
}
