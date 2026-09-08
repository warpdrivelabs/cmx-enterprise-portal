/**
 * <cmx-spreadsheet> — Ignite UI igc-spreadsheet 封装（Excel 式电子表格）
 *
 * 定位：报表表样渲染 / Excel 式编辑。区别于 cmx-ignite-grid（行数据网格），
 * 本组件是"单元格画布"，原生支持合并格、公式栏、单元格样式、公式计算。
 *
 * 核心 API：
 *   setReportModel({ grid, cells })  —— 用 RPT 元数据（grid+cells）驱动建 Workbook
 *   setWorkbook(wb)                  —— 直接喂一个 Ignite Workbook
 *   getWorkbook()                    —— 取当前 Workbook（编辑后回读）
 *   showFormulaBar(bool) / showHeaders(bool) / showGridlines(bool)
 *
 * 事件：
 *   cmx-cell-selected  { addr, row, col }
 *
 * 声明式：data-cmx-report（JSON: {grid,cells}）/ data-cmx-formula-bar
 *
 * 注意（shadow DOM）：igc-spreadsheet 在 light DOM 渲染，其基础 chrome CSS 自注入
 * document.head。为保证工具条/滚动条/标签样式生效，本组件把 igc-spreadsheet 挂在
 * 【light DOM】（this 下）而非 shadow root。
 */
import { registerIgniteSpreadsheet } from './register-spreadsheet.js'
import {
  Workbook,
  WorkbookFormat,
  HorizontalCellAlignment,
  VerticalCellAlignment,
  CellBorderLineStyle,
  WorkbookColorInfo,
  WorksheetColumnWidthUnit,
  ExcelCalcValue,
  CellFill,
  FontUnderlineStyle,
} from '@infragistics/igniteui-webcomponents-excel'
import { SpreadsheetCell } from '@infragistics/igniteui-webcomponents-spreadsheet'
import { Color } from '@infragistics/igniteui-webcomponents-core'

/** A1 列字母 → 0基列号 */
function colToIndex (letters) {
  let n = 0
  for (let i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64)
  return n - 1
}
/** 0基列号 → A1 列字母（26→AA） */
function indexToCol (idx) {
  let n = Number(idx) + 1
  let s = ''
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26) }
  return s || 'A'
}
/** 拆 'C3' → {row:2, col:2}（0基） */
function parseAddr (a) {
  const m = /^([A-Z]+)(\d+)$/.exec(String(a || '').toUpperCase())
  if (!m) return null
  return { col: colToIndex(m[1]), row: parseInt(m[2], 10) - 1, colLetter: m[1] }
}
/** 拆区域 'A1:D1' → {r1,c1,r2,c2}（0基） */
function parseRange (r) {
  const parts = String(r || '').split(':')
  const a = parseAddr(parts[0]); const b = parseAddr(parts[1] || parts[0])
  if (!a || !b) return null
  return {
    r1: Math.min(a.row, b.row), c1: Math.min(a.col, b.col),
    r2: Math.max(a.row, b.row), c2: Math.max(a.col, b.col),
  }
}

/** 业务公式 → Excel 公式：单引号字符串字面量转双引号（Excel 语法要求）。
 *  =QM('1001')+QM('1002')  →  =QM("1001")+QM("1002") */
function toExcelFormula (f) {
  return String(f || '').replace(/'([^']*)'/g, '"$1"')
}

const ALIGN = {
  left: HorizontalCellAlignment.Left,
  center: HorizontalCellAlignment.Center,
  right: HorizontalCellAlignment.Right,
}

/** 边框线型名 → Ignite CellBorderLineStyle（缺省回退 Thin） */
function borderLineStyle (name) {
  const map = {
    thin: CellBorderLineStyle.Thin,
    medium: CellBorderLineStyle.Medium,
    thick: CellBorderLineStyle.Thick,
    dashed: CellBorderLineStyle.Dashed,
    dotted: CellBorderLineStyle.Dotted,
    double: (CellBorderLineStyle.double1 != null ? CellBorderLineStyle.double1 : CellBorderLineStyle.Double),
    none: CellBorderLineStyle.None,
  }
  const v = map[String(name || '').toLowerCase()]
  return v != null ? v : CellBorderLineStyle.Thin
}
const BORDER_SIDES = ['top', 'bottom', 'left', 'right']

/**
 * 单元格颜色对象总开关（现已开启——找到崩溃真因并绕过）。
 *
 * 崩溃真因（读 Ignite 源码 DefaultStyleHelper_combined.js WorkbookColorInfo 构造 case 1 证实）：
 * `new WorkbookColorInfo('#hex')` 的**字符串路径有构造缺陷**——内部 `_ag` 被直接赋成原始字符串
 * （`toNullable(Color.$, '#hex')` 未转换），末尾的 `Color.create(color)` 转换结果被丢弃（死代码）。
 * 之后渲染管线对 cellFormat 求哈希时调 `_ag.getHashCode()` → 字符串无此方法 →
 * `getHashCode is not a function` / `null.c` 未捕获异常，冻结整个 canvas 渲染。
 *
 * 绕过：**不传字符串，先 `Color.create('#hex')` 转成真 Color 对象再传**——构造函数的
 * `typeCast(Color.$, ...)` 分支正确处理 Color 实例，_ag 为真 Color，getHashCode 正常。
 * 统一经 mkColorInfo() 构造，禁止任何 `new WorkbookColorInfo(字符串)` 直调。
 */
const COLOR_OBJECTS_SAFE = true

/** 安全构造 WorkbookColorInfo：字符串一律先 Color.create 转真 Color 对象（见 COLOR_OBJECTS_SAFE 注释）。 */
function mkColorInfo (cssColor) {
  const c = Color.create(cssColor)
  if (c == null) return null
  return new WorkbookColorInfo(c)
}

/** WorkbookColorInfo → css 色串（xlsx 导入读回用）。getResolvedColor() 返回 colorString。 */
function colorInfoToCss (ci) {
  if (!ci) return null
  try {
    const s = ci.getResolvedColor ? ci.getResolvedColor() : null
    if (!s) return null
    const str = String(s).trim()
    // #AARRGGBB（8位含alpha）→ 去 alpha 转 #RRGGBB
    let m = /^#([0-9a-fA-F]{8})$/.exec(str)
    if (m) return '#' + m[1].slice(2).toLowerCase()
    m = /^#([0-9a-fA-F]{6})$/.exec(str)
    if (m) return '#' + m[1].toLowerCase()
    // rgba(204,0,0,1) / rgb(204,0,0) → #hex
    m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(str)
    if (m) {
      const h = (n) => ('0' + (parseInt(n, 10) & 255).toString(16)).slice(-2)
      return '#' + h(m[1]) + h(m[2]) + h(m[3])
    }
    return str
  } catch (_) { return null }
}

/** 近黑（默认字体/边框色，不值得记录） */
function isBlackish (css) {
  const m = /^#([0-9a-fA-F]{6})$/.exec(String(css || ''))
  if (!m) return false
  const v = parseInt(m[1], 16)
  return ((v >> 16) & 255) < 24 && ((v >> 8) & 255) < 24 && (v & 255) < 24
}
/** 近白（默认底色，不值得记录） */
function isWhitish (css) {
  const m = /^#([0-9a-fA-F]{6})$/.exec(String(css || ''))
  if (!m) return false
  const v = parseInt(m[1], 16)
  return ((v >> 16) & 255) > 248 && ((v >> 8) & 255) > 248 && (v & 255) > 248
}

/** CellBorderLineStyle 枚举值 → 模板线型名（None/Default 返回 null 不记录）。 */
function borderStyleName (v) {
  const map = {}
  try {
    map[CellBorderLineStyle.Thin] = 'thin'
    map[CellBorderLineStyle.Medium] = 'medium'
    map[CellBorderLineStyle.Thick] = 'thick'
    map[CellBorderLineStyle.Dashed] = 'dashed'
    map[CellBorderLineStyle.Dotted] = 'dotted'
    const dbl = (CellBorderLineStyle.double1 != null ? CellBorderLineStyle.double1 : CellBorderLineStyle.Double)
    if (dbl != null) map[dbl] = 'double'
  } catch (_) { /* 防御性忽略 */ }
  return map[v] || null
}

export class CmxSpreadsheet extends HTMLElement {
  constructor () {
    super()
    this._sheet = null       // igc-spreadsheet 元素
    this._workbook = null
    this._report = null
    this._formulaBar = true
  }

  connectedCallback () {
    if (this._sheet) return
    registerIgniteSpreadsheet()
    // light DOM 挂载（不 attachShadow）——让 igc-spreadsheet 的 head 级样式生效
    this.style.display = this.style.display || 'block'
    this._sheet = document.createElement('igc-spreadsheet')
    this._sheet.style.width = '100%'
    this._sheet.style.height = '100%'
    this._sheet.isFormulaBarVisible = this._formulaBar
    this.appendChild(this._sheet)
    // 关键：igc-spreadsheet 的布局/主题样式自注入 document.head，不会穿透 shadow root。
    // 若本组件位于某个 shadow root 内（门户 html_pages 页面即是），把这些样式复制进去，
    // 否则 spreadsheet 会塌陷成零高度（canvas 不铺开）。
    this._replicateIgniteStylesIntoRoot()
    this._bindEvents()
    this._bootstrapFromAttributes()
    if (this._workbook) this._sheet.workbook = this._workbook
  }

  disconnectedCallback () {
    this._unbindEvents()
    if (this._headObserver) { this._headObserver.disconnect(); this._headObserver = null }
    if (this._ro) { this._ro.disconnect(); this._ro = null }
    if (this._sheet && this._sheet.destroy) { try { this._sheet.destroy() } catch (_) { /* 表格内核差异导致该调用被拒：降级跳过 */ } }
    this._sheet = null
  }

  // ---- 公开 API ----

  /**
   * 用 RPT 元数据 { grid, cells } 建 Workbook 并渲染。
   * @param {object} report  { grid, cells, meta, fetches? }
   *   fetches: { 'QM:1001': 15000, ... } —— 取数函数预置值，注册为 Ignite UDF，
   *   使取数格保留公式 `=QM("1001")` 且能原生算出真值、公式栏可见。
   */
  setReportModel (report) {
    // 重建 workbook 会把活动格/选区重置到 A1。设计态每次设样式/改格都走整表重建，
    // 若不恢复，用户框选区域设完样式选区就没了。故重建前捕获活动 sheet + 活动格 + 选区范围，
    // 重建后若结构未变（同 sheet 数）则原样恢复（活动格 + 整个拖拽选区）。
    const prevAddr = this._sheet ? this.getActiveAddr() : null
    const prevRange = this._sheet ? this.readSelection() : null   // 'B3:C5' 或单格
    const prevSheet = this._sheet ? this.getActiveSheet() : null
    const prevSheetIdx = (prevSheet && prevSheet.index != null) ? prevSheet.index : 0
    const prevSheetCount = (this._workbook && this._workbook.worksheets) ? this._workbook.worksheets().count : 0

    this._report = report || null
    this._fetches = (report && report.fetches) || null
    this._workbook = this._buildWorkbook(report || {})
    if (this._sheet) {
      this._sheet.workbook = this._workbook
      const newCount = this._workbook.worksheets().count
      // 结构未变（同 sheet 数）且此前有选区 → 恢复活动 sheet + 活动格 + 选区
      let ws = this._workbook.worksheets(0)
      if (prevAddr && prevSheetCount === newCount && prevSheetIdx < newCount) {
        const keep = this._workbook.worksheets(prevSheetIdx)
        if (keep) ws = keep
      }
      if (ws) this._sheet.activeWorksheet = ws
      if (prevAddr && prevSheetCount === newCount) {
        // workbook 赋值后 Ignite 需一拍就绪，延迟恢复更稳；活动格 + 选区范围都恢复
        const restore = () => {
          this.setActiveAddr(prevAddr)
          if (prevRange && prevRange.indexOf(':') > 0) this.setSelectionRange(prevRange)
        }
        restore()
        if (typeof requestAnimationFrame !== 'undefined') {
          requestAnimationFrame(restore)
        }
      }
      this._kickResize()
      // 重建后列宽/行高来自模型，刷新尺寸快照（避免下次 pointerup 误报 resize）
      setTimeout(() => { try { this._snapshotSizes() } catch (_) { /* 防御性忽略 */ } }, 350)
    }
    return this._workbook
  }

  /** 设置/更新取数函数预置值并重建（若已有报表模型）。 */
  setFetchValues (fetches) {
    this._fetches = fetches || null
    if (this._report) this.setReportModel(this._report)
  }

  setWorkbook (wb) {
    this._workbook = wb || null
    if (this._sheet && wb) { this._sheet.workbook = wb; this._kickResize() }
  }

  /**
   * 回填计算结果：valuesMap = { 'C3': 885000, 'C12': 1452000, ... }。
   * 把后端 RPT 引擎算出的真实数值写进对应单元格（覆盖公式占位）。
   * 保留单元格已有的数字格式（#,##0.00 等）。
   */
  setCellValues (valuesMap) {
    if (!this._workbook || !valuesMap) return
    const ws = this._activeWs()
    if (!ws) return
    Object.keys(valuesMap).forEach((addr) => {
      const v = valuesMap[addr]
      if (v == null || isNaN(Number(v))) return
      try {
        const cell = ws.getCell(String(addr).toUpperCase())
        cell.value = Number(v)
      } catch (_) { /* 地址非法则跳过 */ }
    })
    // 重新绑定 workbook 触发重绘（Ignite 对直接改 cell.value 不总自动刷新画布）
    if (this._sheet) {
      try { this._sheet.workbook = this._workbook } catch (_) { /* 表格内核差异导致该调用被拒：降级跳过 */ }
      this._kickResize()
    }
  }

  /**
   * 一致性守卫：以后端 values 为基准，逐格比对 Ignite 前端算出的值。
   * 不改变谁算——取数(QM/QC)恒后端；此处只核对"前端表格算术(SUM/加减)"结果与后端一致。
   * 坐实"后端是审计真相"，前端算错/偏差可被发现。
   *
   * @param {object} backendValues  { 'C13': 1452000, ... } 后端 compute 返回的 values
   * @param {number} [tolerance=0.005]  容差（分位）
   * @returns {{ok:boolean, checked:number, mismatches:Array<{addr,backend,frontend,diff}>}}
   */
  verifyAgainst (backendValues, tolerance) {
    const tol = (tolerance == null ? 0.005 : tolerance)
    const out = { ok: true, checked: 0, mismatches: [] }
    if (!this._workbook || !backendValues) return out
    const ws = this._activeWs()
    if (!ws) return out
    Object.keys(backendValues).forEach((addr) => {
      const be = Number(backendValues[addr])
      if (isNaN(be)) return
      let fe
      try { fe = Number(ws.getCell(String(addr).toUpperCase()).value) } catch (_) { return }
      if (isNaN(fe)) return
      out.checked++
      if (Math.abs(be - fe) > tol) {
        out.ok = false
        out.mismatches.push({ addr, backend: be, frontend: fe, diff: fe - be })
      }
    })
    return out
  }

  /** 触发 canvas 依容器尺寸重绘（shadow DOM / flex 容器下尺寸晚就绪，需主动踢）。 */
  _kickResize () {
    if (!this._sheet) return
    const fire = () => {
      try { this._sheet.styleUpdated && this._sheet.styleUpdated() } catch (_) { /* 表格内核差异导致该调用被拒：降级跳过 */ }
      try { this._sheet.containerResized && this._sheet.containerResized() } catch (_) { /* 表格内核差异导致该调用被拒：降级跳过 */ }
      try { this._sheet.flush && this._sheet.flush() } catch (_) { /* 表格内核差异导致该调用被拒：降级跳过 */ }
    }
    // 多次踢：立即 + 下一帧 + 几个延时，覆盖"容器尺寸晚就绪"与"workbook 异步布局"
    fire()
    if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(fire)
    ;[60, 200, 500, 1000].forEach((ms) => setTimeout(fire, ms))
    // 容器尺寸变化时持续重绘
    if (!this._ro && typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(() => fire())
      this._ro.observe(this)
    }
  }

  getWorkbook () { return this._workbook }

  /** 当前活动 worksheet（多 sheet：随 Ignite 底部 sheet tab 切换；退回第 0 页）。 */
  _activeWs () {
    if (!this._workbook) return null
    try {
      const aw = this._sheet && this._sheet.activeWorksheet
      if (aw) return aw
    } catch (_) { /* 表格内核差异导致该调用被拒：降级跳过 */ }
    try { return this._workbook.worksheets(0) } catch (_) { return null }
  }

  /** 当前活动 sheet 的 index / id / name。 */
  getActiveSheet () {
    try {
      const aw = this._activeWs()
      if (!aw) return null
      const wss = this._workbook.worksheets()
      const n = wss.count
      for (let i = 0; i < n; i++) {
        if (wss.item(i) === aw) {
          const meta = (this._sheetMeta && this._sheetMeta[i]) || {}
          return { index: i, id: meta.id || ('s' + (i + 1)), name: meta.name || aw.name }
        }
      }
    } catch (_) { /* 防御性忽略 */ }
    return null
  }

  /** 切换活动 sheet（index）。 */
  setActiveSheet (index) {
    try {
      const ws = this._workbook && this._workbook.worksheets(index)
      if (ws && this._sheet) { this._sheet.activeWorksheet = ws; this._kickResize() }
    } catch (_) { /* 表格内核差异导致该调用被拒：降级跳过 */ }
  }

  /** 当前 workbook 的 sheet 列表 [{index,id,name}]。 */
  getSheetList () {
    const out = []
    try {
      const n = this._workbook.worksheets().count
      for (let i = 0; i < n; i++) {
        const meta = (this._sheetMeta && this._sheetMeta[i]) || {}
        out.push({ index: i, id: meta.id || ('s' + (i + 1)), name: meta.name || this._workbook.worksheets(i).name })
      }
    } catch (_) { /* 表格内核差异导致该调用被拒：降级跳过 */ }
    return out
  }

  /**
   * 导出当前 Workbook 为 Excel .xlsx 并触发浏览器下载。
   * 用 Ignite 原生 `Workbook.save(onSuccess, onError)` 产出 xlsx Blob。
   * @param {string} [fileName='report.xlsx']
   * @returns {Promise<boolean>} 成功 resolve(true)
   */
  exportXlsx (fileName) {
    let name = fileName || 'report'
    name = String(name).replace(/\.json$/i, '').replace(/\.xlsx$/i, '') + '.xlsx'
    return new Promise((resolve, reject) => {
      if (!this._workbook) { reject(new Error('无工作簿')); return }
      // Ignite 的 xlsx 序列化器无法保存注册了 UDF（QM/QC…）或 WorkbookColorInfo 的 workbook。
      // 故导出时构造一个「纯值 + 无颜色」副本（保留粗斜体/对齐/数字格式/合并/列宽）。
      let wb
      try { wb = this._buildValuesOnlyWorkbook() } catch (e) { reject(e); return }
      const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      try {
        wb.save(
          (out) => {
            try {
              this._downloadBlob(this._toXlsxBlob(out, XLSX_MIME), name)
              resolve(true)
            } catch (e) { reject(e) }
          },
          (err) => reject(err instanceof Error ? err : new Error(String(err || 'xlsx 导出失败')))
        )
      } catch (e) { reject(e) }
    })
  }

  /** 把 Ignite save 回调产物（Blob / ArrayBuffer / base64 字符串）统一转成 xlsx Blob。 */
  _toXlsxBlob (out, mime) {
    if (out instanceof Blob) return out
    if (out instanceof ArrayBuffer || ArrayBuffer.isView(out)) return new Blob([out], { type: mime })
    if (typeof out === 'string') {
      // Ignite 常以 base64 字符串回调 → 解码成二进制
      try {
        const bin = atob(out)
        const len = bin.length
        const bytes = new Uint8Array(len)
        for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i)
        return new Blob([bytes], { type: mime })
      } catch (_) {
        return new Blob([out], { type: mime })
      }
    }
    return new Blob([out], { type: mime })
  }

  /**
   * 导入 xlsx：解析 File 为 RPT sheets 结构（exportXlsx 的逆向）。
   * 提取：单元格值/公式（=公式→calc）、加粗/斜体/对齐/数字格式/字号、合并区域、列宽、行数列数。
   * 不落模型——把解析结果返回给调用方（设计器 model 页决定怎么并入模板）。
   * @param {File|Blob} file 用户选择的 .xlsx 文件
   * @returns {Promise<{sheets:Array}>}
   */
  importXlsx (file) {
    return new Promise((resolve, reject) => {
      if (!file) { reject(new Error('未提供文件')); return }
      const fr = new FileReader()
      fr.onerror = () => reject(new Error('读取文件失败'))
      fr.onload = () => {
        let bytes
        try { bytes = new Uint8Array(fr.result) } catch (e) { reject(e); return }
        try {
          Workbook.load(
            bytes,
            (wb) => {
              try { resolve({ sheets: this._workbookToSheets(wb) }) } catch (e) { reject(e) }
            },
            (err) => reject(err instanceof Error ? err : new Error(String(err || 'xlsx 解析失败')))
          )
        } catch (e) { reject(e) }
      }
      fr.readAsArrayBuffer(file)
    })
  }

  /** Ignite Workbook → RPT sheets[]（_fillWorksheet 的逆向）。 */
  _workbookToSheets (wb) {
    const sheets = []
    const wss = wb.worksheets()
    const count = wss.count
    for (let si = 0; si < count; si++) {
      const ws = wss.item(si)
      const cells = {}
      let maxRow = 0
      let maxCol = 0
      // 逐格扫描——row.cells() 惰性集合的迭代索引不映射真实列，openpyxl 等生成的稀疏 xlsx
      // 会漏格（只返回每行第一格）。改用字符串地址 getCell('C3')（已验证可靠）按固定网格坐标取。
      const SCAN_ROWS = 300
      const SCAN_COLS = 48
      try {
        for (let r = 0; r < SCAN_ROWS; r++) {
          for (let c = 0; c < SCAN_COLS; c++) {
            const addr = indexToCol(c) + (r + 1)
            let wc
            try { wc = ws.getCell(addr) } catch (_) { continue }
            if (!wc) continue
            let value = null
            let formulaStr = null
            try { value = wc.value } catch (_) { /* 表格内核差异导致该调用被拒：降级跳过 */ }
            try { const f = wc.formula; formulaStr = f ? String(f.toString ? f.toString() : f) : null } catch (_) { /* 表格内核差异导致该调用被拒：降级跳过 */ }
            // 样式提取（尽力而为）——含颜色/边框；纯样式格（空值但有边框/填充）也要保留
            const style = {}
            try {
              const fmt = wc.cellFormat
              if (fmt) {
                try { if (fmt.font && fmt.font.bold === true) style.bold = true } catch (_) { /* 表格内核差异导致该调用被拒：降级跳过 */ }
                try { if (fmt.font && fmt.font.italic === true) style.italic = true } catch (_) { /* 表格内核差异导致该调用被拒：降级跳过 */ }
                try {
                  const al = fmt.alignment
                  if (al === HorizontalCellAlignment.Center) style.align = 'center'
                  else if (al === HorizontalCellAlignment.Right) style.align = 'right'
                  else if (al === HorizontalCellAlignment.Left) style.align = 'left'
                } catch (_) { /* 防御性忽略 */ }
                try { const fs = fmt.formatString; if (fs && fs !== 'General') style.format = fs } catch (_) { /* 表格内核差异导致该调用被拒：降级跳过 */ }
                try { const h = fmt.font && fmt.font.height; if (h && h > 0) style.fontSize = Math.round(h / 20) } catch (_) { /* 表格内核差异导致该调用被拒：降级跳过 */ }
                // 字体色（WorkbookColorInfo → css 串）
                try {
                  const fc = colorInfoToCss(fmt.font && fmt.font.colorInfo)
                  if (fc && !isBlackish(fc)) style.fontColor = fc
                } catch (_) { /* 表格内核差异导致该调用被拒：降级跳过 */ }
                // 填充色（CellFillPattern.backgroundColorInfo）
                try {
                  const fill = fmt.fill
                  const bg = fill && fill.backgroundColorInfo ? colorInfoToCss(fill.backgroundColorInfo) : null
                  if (bg && !isWhitish(bg)) style.fillColor = bg
                } catch (_) { /* 表格内核差异导致该调用被拒：降级跳过 */ }
                // 四边框（线型 + 颜色）
                try {
                  const border = {}
                  BORDER_SIDES.forEach((side) => {
                    try {
                      const bs = fmt['' + side + 'BorderStyle']
                      const name = borderStyleName(bs)
                      if (name) {
                        const bc = colorInfoToCss(fmt['' + side + 'BorderColorInfo'])
                        border[side] = { style: name }
                        if (bc && !isBlackish(bc)) border[side].color = bc
                      }
                    } catch (_) { /* 表格内核差异导致该调用被拒：降级跳过 */ }
                  })
                  if (Object.keys(border).length) style.border = border
                } catch (_) { /* 防御性忽略 */ }
              }
            } catch (_) { /* 防御性忽略 */ }
            const hasStyle = Object.keys(style).length > 0
            if (value == null && !formulaStr && !hasStyle) continue
            if (r + 1 > maxRow) maxRow = r + 1
            if (c + 1 > maxCol) maxCol = c + 1
            const cell = {}
            if (formulaStr && formulaStr.charAt(0) === '=') {
              cell.type = 'calc'   // 导入的公式一律视为表内算术；取数函数由设计师后续配置
              cell.formula = formulaStr
            } else {
              cell.type = 'text'
              cell.value = value
            }
            if (hasStyle) cell.style = style
            cells[addr] = cell
          }
        }
      } catch (_) { /* 防御性忽略 */ }
      // 合并区域
      const merges = []
      try {
        const regions = ws.mergedCellsRegions()
        for (let mi = 0; mi < regions.count; mi++) {
          const rg = regions.item(mi)
          if (!rg) continue
          merges.push(indexToCol(rg.firstColumn) + (rg.firstRow + 1) + ':' + indexToCol(rg.lastColumn) + (rg.lastRow + 1))
          if (rg.lastRow + 1 > maxRow) maxRow = rg.lastRow + 1
          if (rg.lastColumn + 1 > maxCol) maxCol = rg.lastColumn + 1
        }
      } catch (_) { /* 防御性忽略 */ }
      // 列宽（px）：Ignite width 单位≈1/256 字符宽，getWidth(Pixel) 读像素宽
      const colWidths = {}
      try {
        for (let c = 0; c < maxCol; c++) {
          const col = ws.columns(c)
          if (!col) continue
          let px = 0
          try { px = col.getWidth ? Math.round(col.getWidth(WorksheetColumnWidthUnit.Pixel)) : 0 } catch (_) { /* 表格内核差异导致该调用被拒：降级跳过 */ }
          if (px > 0 && Math.abs(px - 64) > 2) colWidths[indexToCol(c)] = px // 64px≈默认宽不记录
        }
      } catch (_) { /* 表格内核差异导致该调用被拒：降级跳过 */ }
      const grid = { rows: Math.max(maxRow + 5, 20), cols: Math.max(maxCol + 2, 8) }
      if (merges.length) grid.merges = merges
      if (Object.keys(colWidths).length) grid.colWidths = colWidths
      sheets.push({
        id: 's' + (si + 1),
        name: ws.name || ('Sheet' + (si + 1)),
        grid,
        cells,
      })
    }
    return sheets
  }

  /** 构造一个不含 UDF 的「纯值」workbook（用于 xlsx 导出）：多 sheet，每页值取自已求值单元格。 */
  _buildValuesOnlyWorkbook () {
    const report = this._report || {}
    const meta = report.meta || report.moduleMeta || {}
    const sheets = (report.sheets && report.sheets.length)
      ? report.sheets
      : [{ id: 's1', name: meta.reportName || meta.moduleName || 'Sheet1', grid: report.grid || {}, cells: report.cells || {} }]
    const wb = new Workbook(WorkbookFormat.Excel2007)
    sheets.forEach((s, si) => {
      const grid = s.grid || {}
      const cells = s.cells || {}
      const styleClasses = grid.styleClasses || {}
      let src = null
      try { src = this._workbook.worksheets(si) } catch (_) { /* 表格内核差异导致该调用被拒：降级跳过 */ }
      const ws = wb.worksheets().add(s.name || ('Sheet' + (si + 1)))
      const colWidths = grid.colWidths || {}
      Object.keys(colWidths).forEach((letter) => {
        const idx = colToIndex(letter)
        const px = Number(colWidths[letter]) || 90
        try { ws.columns(idx).setWidth(px, WorksheetColumnWidthUnit.Pixel) } catch (_) { /* 表格内核差异导致该调用被拒：降级跳过 */ }
      })
      Object.keys(cells).forEach((addr) => {
        const pos = parseAddr(addr); if (!pos) return
        const cell = cells[addr] || {}
        let wc, sc
        try { wc = ws.getCell(addr); sc = src ? src.getCell(addr) : null } catch (_) { return }
        let val = null
        try { val = sc ? sc.value : null } catch (_) { /* 表格内核差异导致该调用被拒：降级跳过 */ }
        if (val == null && cell.value != null) val = cell.value
        try { if (val != null) wc.value = val } catch (_) { /* 表格内核差异导致该调用被拒：降级跳过 */ }
        const cls = cell.class ? (styleClasses[cell.class] || {}) : {}
        const inl = cell.style || {}
        const isNum = (cell.type === 'fetch' || cell.type === 'calc')
        const pick = (k, dflt) => (inl[k] != null ? inl[k] : (cls[k] != null ? cls[k] : dflt))
        this._applyFmt(wc.cellFormat, {
          bold: pick('bold', undefined),
          italic: pick('italic', undefined),
          underline: pick('underline', undefined),
          align: pick('align', isNum ? 'right' : null),
          format: pick('format', isNum ? '#,##0.00' : null),
          fontSize: pick('fontSize', undefined),
          fontColor: pick('fontColor', undefined),
          fillColor: pick('fillColor', undefined),
          topBorder: pick('topBorder', undefined),
          border: pick('border', undefined),
        }, { noColor: true })
      })
      ;(grid.merges || []).forEach((rg) => {
        const b = parseRange(rg); if (!b) return
        try { ws.mergedCellsRegions().add(b.r1, b.c1, b.r2, b.c2) } catch (_) { /* 表格内核差异导致该调用被拒：降级跳过 */ }
      })
    })
    return wb
  }

  /** 触发浏览器下载一个 Blob（内部工具）。 */
  _downloadBlob (blob, fileName) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName || 'download'
    document.body.appendChild(a)
    a.click()
    setTimeout(() => { try { document.body.removeChild(a); URL.revokeObjectURL(url) } catch (_) { /* 下载收尾清理：忽略 */ } }, 0)
  }

  /** 把 Ignite 注入到 document.head 的样式复制进本组件所在的 shadow root（幂等 + 观察后续注入）。 */
  _replicateIgniteStylesIntoRoot () {
    const rootNode = this.getRootNode && this.getRootNode()
    // 不在 shadow root 内（rootNode 是 document）则无需复制——head 样式本就生效
    if (!rootNode || rootNode === document || rootNode.nodeType !== 11) return
    const isIgnite = (styleEl) => {
      const t = styleEl.textContent || ''
      return /\.ig-spr|ig-flex|\.ig-|igr-|spreadsheet|ig_spr/i.test(t)
    }
    const copyOne = (styleEl) => {
      if (!styleEl || styleEl.__cmxCopiedFor === rootNode) return
      const clone = document.createElement('style')
      clone.textContent = styleEl.textContent
      clone.setAttribute('data-cmx-ignite-clone', '')
      rootNode.appendChild(clone)
      styleEl.__cmxCopiedFor = rootNode
    }
    const sweep = () => {
      const already = rootNode.querySelector('style[data-cmx-ignite-clone]')
      Array.from(document.head.querySelectorAll('style')).forEach((s) => {
        if (isIgnite(s)) copyOne(s)
      })
      return !!already
    }
    sweep()
    // Ignite 在首次渲染时才注入样式，故多扫几轮 + 观察 head。
    let n = 0
    const timer = setInterval(() => { sweep(); if (++n > 12) clearInterval(timer) }, 120)
    if (typeof MutationObserver !== 'undefined') {
      this._headObserver = new MutationObserver((muts) => {
        for (const m of muts) {
          for (const node of m.addedNodes || []) {
            if (node.tagName === 'STYLE' && isIgnite(node)) copyOne(node)
          }
        }
      })
      this._headObserver.observe(document.head, { childList: true })
      // 60s 后停止观察，避免长期挂着
      setTimeout(() => { if (this._headObserver) { this._headObserver.disconnect(); this._headObserver = null } }, 60000)
    }
  }

  showFormulaBar (on) {
    this._formulaBar = on !== false
    if (this._sheet) this._sheet.isFormulaBarVisible = this._formulaBar
  }

  showHeaders (on) { if (this._sheet) this._sheet.areHeadersVisible = on !== false }
  showGridlines (on) { if (this._sheet) this._sheet.areGridlinesVisible = on !== false }

  // ---- 内部：RPT grid+cells → Ignite Workbook ----

  _buildWorkbook (report) {
    const meta = report.meta || report.moduleMeta || {}
    const wb = new Workbook(WorkbookFormat.Excel2007)
    // 注册取数函数（QM/QC/JE...）为 Ignite UDF：查预置值表返回真值。workbook 级，多 sheet 共享。
    this._registerFetchFunctions(wb, this._fetches)
    // 多 sheet：report.sheets = [{id,name,grid,cells}]。无 sheets 时退回单 sheet（grid/cells 顶层）。
    const sheets = (report.sheets && report.sheets.length)
      ? report.sheets
      : [{ id: 's1', name: meta.reportName || meta.moduleName || 'Sheet1', grid: report.grid || {}, cells: report.cells || {} }]
    this._sheetMeta = sheets.map((s, i) => ({ id: s.id || ('s' + (i + 1)), name: s.name || ('Sheet' + (i + 1)) }))
    sheets.forEach((s, i) => {
      const name = s.name || ('Sheet' + (i + 1))
      const ws = wb.worksheets().add(name)
      this._fillWorksheet(ws, s.grid || {}, s.cells || {})
    })
    return wb
  }

  /** 把一页 grid+cells 铺进一个 worksheet（列宽/行高/区块/单元格值公式样式/合并）。 */
  _fillWorksheet (ws, grid, cells) {
    // 1) 列宽
    const colWidths = grid.colWidths || {}
    Object.keys(colWidths).forEach((letter) => {
      const idx = colToIndex(letter)
      const px = Number(colWidths[letter]) || 90
      try { ws.columns(idx).setWidth(px, WorksheetColumnWidthUnit.Pixel) } catch (_) {
        try { ws.columns(idx).width = Math.max(4, Math.round(px / 7)) } catch (__) { /* 表格内核差异导致该调用被拒：降级跳过 */ }
      }
    })
    // 1b) 行高（px → Ignite 行高单位 = px*15 twips）
    const rowHeights = grid.rowHeights || {}
    Object.keys(rowHeights).forEach((rn) => {
      const idx = parseInt(rn, 10) - 1
      const px = Number(rowHeights[rn]) || 20
      if (idx < 0 || isNaN(idx)) return
      try { ws.rows(idx).height = Math.round(px * 15) } catch (_) { /* 防御性忽略 */ }
    })
    // 2) 区块角色（表头加粗提示）
    const blockFillByCell = {}
    ;(grid.blocks || []).forEach((bk) => {
      const rg = parseRange(bk.range); if (!rg) return
      const role = bk.role
      for (let r = rg.r1; r <= rg.r2; r++) {
        for (let c = rg.c1; c <= rg.c2; c++) blockFillByCell[c + '_' + r] = role
      }
    })
    // 3) 单元格值/公式 + 样式
    const styleClasses = grid.styleClasses || {}
    Object.keys(cells).forEach((addr) => {
      const pos = parseAddr(addr); if (!pos) return
      const cell = cells[addr] || {}
      let wc
      try { wc = ws.getCell(addr) } catch (_) { return }
      if (cell.type === 'fetch' || cell.type === 'calc' || cell.type === 'ref') {
        const f = cell.formula || ''
        if (f && f.charAt(0) === '=') {
          const excelF = toExcelFormula(f)
          try { wc.applyFormula(excelF) } catch (_) { try { wc.value = 0 } catch (__) { /* 表格内核差异导致该调用被拒：降级跳过 */ } }
        } else if (cell.value != null) {
          wc.value = cell.value
        }
      } else if (cell.type === 'param') {
        wc.value = (cell.value != null ? String(cell.value) : '')
      } else {
        if (cell.value != null) wc.value = cell.value
      }
      const cls = cell.class ? (styleClasses[cell.class] || {}) : {}
      const inl = cell.style || {}
      const isNum = (cell.type === 'fetch' || cell.type === 'calc')
      const pick = (k, dflt) => (inl[k] != null ? inl[k] : (cls[k] != null ? cls[k] : dflt))
      const style = {
        bold: pick('bold', undefined),
        italic: pick('italic', undefined),
        underline: pick('underline', undefined),
        align: pick('align', isNum ? 'right' : null),
        format: pick('format', isNum ? '#,##0.00' : null),
        fontSize: pick('fontSize', undefined),
        fontColor: pick('fontColor', undefined),
        fillColor: pick('fillColor', undefined),
        topBorder: pick('topBorder', undefined),
        border: pick('border', undefined),
      }
      const role = blockFillByCell[pos.col + '_' + pos.row]
      if (role === 'header' && style.bold == null) style.bold = true
      this._applyFmt(wc.cellFormat, style)
    })
    // 4) 合并单元格
    ;(grid.merges || []).forEach((rg) => {
      const b = parseRange(rg); if (!b) return
      try { ws.mergedCellsRegions().add(b.r1, b.c1, b.r2, b.c2) } catch (_) { /* 表格内核差异导致该调用被拒：降级跳过 */ }
    })
  }

  /**
   * 把一组样式属性应用到某单元格格式对象（建表与设计态改样式共用）。
   * @param {object} fmt   wc.cellFormat
   * @param {object} style { bold, align, format, fontSize, topBorder }
   */
  _applyFmt (fmt, style, opts) {
    if (!fmt || !style) return
    // noColor：xlsx 导出显式跳过颜色对象（Ignite 序列化器对颜色对象仍有独立缺陷）。
    // 实时渲染颜色已恢复：统一走 mkColorInfo()（Color.create 包装，绕过字符串构造缺陷）。
    const noColor = !COLOR_OBJECTS_SAFE || !!(opts && opts.noColor)
    try {
      if (style.bold != null) fmt.font.bold = !!style.bold
      if (style.italic != null) fmt.font.italic = !!style.italic
      if (style.underline != null) {
        fmt.font.underlineStyle = style.underline ? FontUnderlineStyle.Single : FontUnderlineStyle.None
      }
      if (style.fontSize) fmt.font.height = style.fontSize * 20 // Excel font height 单位=1/20 pt
      if (style.fontColor && !noColor) {
        try { const ci = mkColorInfo(style.fontColor); if (ci) fmt.font.colorInfo = ci } catch (_) { /* 表格内核差异导致该调用被拒：降级跳过 */ }
      }
      if (style.fillColor != null && !noColor) {
        // 空串 → 清除填充；否则实心填充
        try {
          if (style.fillColor) {
            const ci = mkColorInfo(style.fillColor)
            if (ci) fmt.fill = CellFill.createSolidFill(ci)
          } else {
            fmt.fill = null
          }
        } catch (_) { /* 防御性忽略 */ }
      }
      if (style.align && ALIGN[style.align] != null) fmt.alignment = ALIGN[style.align]
      fmt.verticalAlignment = VerticalCellAlignment.Center
      if (style.format != null) fmt.formatString = style.format || 'General'
      if (style.topBorder === 'double') {
        fmt.topBorderStyle = (CellBorderLineStyle.double1 != null ? CellBorderLineStyle.double1 : CellBorderLineStyle.Thick)
        if (!noColor) { try { const ci = mkColorInfo('#888888'); if (ci) fmt.topBorderColorInfo = ci } catch (_) { /* 表格内核差异导致该调用被拒：降级跳过 */ } }
      }
      // 四边框线：style.border = { top:{style,color}, bottom, left, right }（缺边=清除该边）
      if (style.border && typeof style.border === 'object') {
        BORDER_SIDES.forEach((side) => {
          const b = style.border[side]
          const cap = side.charAt(0).toUpperCase() + side.slice(1)
          try {
            if (b && b.style && b.style !== 'none') {
              fmt['' + side + 'BorderStyle'] = borderLineStyle(b.style)
              if (!noColor) { const ci = mkColorInfo(b.color || '#000000'); if (ci) fmt['' + side + 'BorderColorInfo'] = ci }
            } else if (b === null || (b && b.style === 'none')) {
              fmt['' + side + 'BorderStyle'] = CellBorderLineStyle.None
            }
          } catch (_) { /* 某边失败不阻断其它 */ void cap }
        })
      }
    } catch (_) { /* 样式尽力而为，不阻断渲染 */ }
  }

  // ---- 设计态（可编辑）API ----

  /** 开/关原生编辑（取消工作表保护即可让用户直接改格）。 */
  setEditable (on) {
    this._editable = on !== false
    if (!this._workbook) return
    const ws = this._activeWs()
    try { if (ws && ws.protect) { /* 不主动 protect；默认即可编辑 */ } } catch (_) { /* 防御性忽略 */ }
    // Ignite 工作表默认可编辑；此处仅记录状态供上层判断。
  }

  /** 取当前活动单元格地址（'C3'），无则 null。 */
  getActiveAddr () {
    try {
      const ac = this._sheet && this._sheet.activeCell
      if (!ac) return null
      const row = ac.row != null ? ac.row : (ac.cellAddress && ac.cellAddress.row)
      const col = ac.column != null ? ac.column : (ac.cellAddress && ac.cellAddress.column)
      if (row == null || col == null) return null
      return indexToCol(col) + (row + 1)
    } catch (_) { return null }
  }

  /** 设置活动单元格（'C3'）。用于重建 workbook 后恢复选区，避免跳回 A1。 */
  setActiveAddr (addr) {
    if (!this._sheet || !addr) return false
    try {
      this._sheet.activeCell = new SpreadsheetCell(String(addr).toUpperCase())
      return true
    } catch (_) { return false }
  }

  /**
   * 恢复选区范围（'B3:C5'）。真实拖拽选区存在 pane.selection.cellRanges，
   * 其 cellRangesAddress setter 接受 A1 引用串——重建 workbook 后用它把整个框选区域设回去
   * （setActiveAddr 只恢复活动格，选区会塌成单格）。
   */
  setSelectionRange (range) {
    if (!this._sheet || !range) return false
    try {
      const panes = this._sheet.panes
      if (panes && panes.length) {
        for (let i = 0; i < panes.length; i++) {
          const sel = panes[i] && panes[i].selection
          if (sel) {
            sel.cellRangesAddress = String(range).toUpperCase()
            return true
          }
        }
      }
    } catch (_) { /* 防御性忽略 */ }
    return false
  }

  /**
   * 增量写单格（设计态：向导/画布回写模型后刷新单格，不重建整表）。
   * @param {string} addr 'C3'
   * @param {object} cell { type, value, formula, class }
   * @param {object} [styleClasses] grid.styleClasses（据 class 取样式）
   */
  writeCell (addr, cell, styleClasses) {
    if (!this._workbook || !addr) return
    const ws = this._activeWs()
    if (!ws) return
    let wc
    try { wc = ws.getCell(String(addr).toUpperCase()) } catch (_) { return }
    cell = cell || {}
    const isNum = (cell.type === 'fetch' || cell.type === 'calc')
    // 值 / 公式
    try {
      const f = cell.formula || ''
      if ((isNum || cell.type === 'ref') && f && f.charAt(0) === '=') {
        try { wc.applyFormula(toExcelFormula(f)) } catch (_) { try { wc.value = 0 } catch (__) { /* 表格内核差异导致该调用被拒：降级跳过 */ } }
      } else if (cell.value != null && cell.value !== '') {
        wc.value = (cell.type === 'param') ? String(cell.value) : cell.value
      } else {
        try { wc.value = null } catch (_) { /* 表格内核差异导致该调用被拒：降级跳过 */ }
      }
    } catch (_) { /* 表格内核差异导致该调用被拒：降级跳过 */ }
    // 样式：类 + 内联（内联优先）
    const cls = (cell.class && styleClasses) ? (styleClasses[cell.class] || {}) : {}
    const inl = cell.style || {}
    const pick = (k, dflt) => (inl[k] != null ? inl[k] : (cls[k] != null ? cls[k] : dflt))
    this._applyFmt(wc.cellFormat, {
      bold: pick('bold', undefined),
      italic: pick('italic', undefined),
      underline: pick('underline', undefined),
      align: pick('align', isNum ? 'right' : null),
      format: pick('format', isNum ? '#,##0.00' : null),
      fontSize: pick('fontSize', undefined),
      fontColor: pick('fontColor', undefined),
      fillColor: pick('fillColor', undefined),
      topBorder: pick('topBorder', undefined),
      border: pick('border', undefined),
    })
    if (this._sheet) {
      try { this._sheet.workbook = this._workbook } catch (_) { /* 表格内核差异导致该调用被拒：降级跳过 */ }
      this._kickResize()
    }
  }

  /** 直接给某格设样式（设计态样式面板用）。style: {bold,align,format,fontSize,topBorder} */
  applyCellStyle (addr, style) {
    if (!this._workbook || !addr) return
    const ws = this._activeWs()
    if (!ws) return
    try {
      const wc = ws.getCell(String(addr).toUpperCase())
      this._applyFmt(wc.cellFormat, style || {})
      if (this._sheet) { this._sheet.workbook = this._workbook; this._kickResize() }
    } catch (_) { /* 表格内核差异导致该调用被拒：降级跳过 */ }
  }

  /** 合并/取消合并区域（画表样）。 */
  setMerge (range, on) {
    if (!this._workbook || !range) return
    const ws = this._activeWs()
    const b = parseRange(range)
    if (!ws || !b) return
    try {
      const regions = ws.mergedCellsRegions()
      if (on === false) {
        for (let i = regions.count - 1; i >= 0; i--) {
          const r = regions.item(i)
          if (r && r.firstRow === b.r1 && r.firstColumn === b.c1) { regions.removeAt(i); break }
        }
      } else {
        regions.add(b.r1, b.c1, b.r2, b.c2)
      }
      if (this._sheet) { this._sheet.workbook = this._workbook; this._kickResize() }
    } catch (_) { /* 表格内核差异导致该调用被拒：降级跳过 */ }
  }

  /** 首个选区地址范围 'C3:C12'（框选取数/批量样式用）；退化为活动格。 */
  readSelection () {
    // 真实鼠标拖拽的选区在 pane.selection.cellRanges（activePane 级），
    // selectedRegions 是另一套（编程式/整行列选择），拖拽后往往为空——两处都读。
    try {
      const panes = this._sheet && this._sheet.panes
      if (panes && panes.length) {
        for (let i = 0; i < panes.length; i++) {
          const sel = panes[i] && panes[i].selection
          const cr = sel && sel.cellRanges
          if (cr && cr.count > 0) {
            const r = cr.item(0)
            const a = indexToCol(Math.min(r.firstColumn, r.lastColumn)) + (Math.min(r.firstRow, r.lastRow) + 1)
            const b = indexToCol(Math.max(r.firstColumn, r.lastColumn)) + (Math.max(r.firstRow, r.lastRow) + 1)
            return a === b ? a : (a + ':' + b)
          }
        }
      }
    } catch (_) { /* 防御性忽略 */ }
    try {
      const sel = this._sheet && this._sheet.selectedRegions
      if (sel && sel.count > 0) {
        const r = sel.item(0)
        const a = indexToCol(r.firstColumn) + (r.firstRow + 1)
        const b = indexToCol(r.lastColumn) + (r.lastRow + 1)
        return a === b ? a : (a + ':' + b)
      }
    } catch (_) { /* 防御性忽略 */ }
    const a = this.getActiveAddr()
    return a || null
  }

  /**
   * 把取数函数（QM/QC/JE/LJ/FS/DGET/SUMQTY/CFITEM）注册为 Ignite 用户自定义函数。
   * evaluate 同步查预置值表 fetches（后端 compute 返回，键如 'QM:1001'）。
   * 未命中返回 0。这样取数格保留公式 `=QM("1001")+QM("1002")`，Ignite 原生求值+公式栏可见。
   */
  _registerFetchFunctions (wb, fetches) {
    const map = fetches || {}
    const FNS = ['QM', 'QC', 'JE', 'LJ', 'FS', 'DGET', 'SUMQTY', 'CFITEM']
    FNS.forEach((fn) => {
      try {
        // 参数 1..8：足够容纳 QM(account) / JE(account,dir) / DGET(ds,measure,...)
        wb.registerUserDefinedFunction(fn, 1, 8, (stack, argc) => {
          // 依次弹出参数（栈序为逆），拼回 函数键 fn:arg1[:arg2...]
          const args = []
          for (let i = 0; i < argc; i++) {
            try { args.unshift(String(stack.pop())) } catch (_) { args.unshift('') }
          }
          const key = fn + ':' + args.join(':')
          const v = map[key]
          return new ExcelCalcValue(v == null || isNaN(Number(v)) ? 0 : Number(v))
        })
      } catch (_) { /* 某函数注册失败不阻断其它 */ }
    })
  }

  _bindEvents () {
    if (!this._sheet) return
    this._onActiveCell = () => {
      try {
        const ac = this._sheet.activeCell
        if (!ac) return
        const row = ac.row != null ? ac.row : (ac.cellAddress && ac.cellAddress.row)
        const col = ac.column != null ? ac.column : (ac.cellAddress && ac.cellAddress.column)
        const addr = (row != null && col != null) ? (indexToCol(col) + (row + 1)) : null
        this.dispatchEvent(new CustomEvent('cmx-cell-selected', {
          bubbles: true, composed: true, detail: { row, col, addr },
        }))
      } catch (_) { /* 事件派发失败不影响主流程：忽略 */ }
    }
    // 原生编辑完成（设计态：用户直接在格里改值/公式）→ 抛 cmx-cell-edited 供上层回写模型
    this._onCellValueChanged = () => {
      try {
        const addr = this.getActiveAddr()
        if (!addr) return
        const ws = this._activeWs()
        let value = null; let formula = null
        if (ws) {
          const wc = ws.getCell(addr)
          try { const ff = wc.formula; formula = ff ? String(ff.toString ? ff.toString() : ff) : null } catch (_) { /* 表格内核差异导致该调用被拒：降级跳过 */ }
          try { value = wc.value } catch (_) { /* 表格内核差异导致该调用被拒：降级跳过 */ }
        }
        this.dispatchEvent(new CustomEvent('cmx-cell-edited', {
          bubbles: true, composed: true, detail: { addr, value, formula },
        }))
      } catch (_) { /* 事件派发失败不影响主流程：忽略 */ }
    }
    // igc-spreadsheet 的选区变化事件名（activeCellChanged）——尽力绑定
    if (this._sheet.addEventListener) {
      this._sheet.addEventListener('activeCellChanged', this._onActiveCell)
      this._sheet.addEventListener('cellValueChanged', this._onCellValueChanged)
    }
    // 关键：igc-spreadsheet 不派发 DOM 事件（activeCellChanged 是框架属性绑定，addEventListener 收不到），
    // 故轮询活动格地址，变化时主动派发 cmx-cell-selected（设计态右侧属性面板靠此联动）。
    // 同时监测活动 sheet 变化（多 sheet：Ignite 底部 tab 切换）→ 派发 cmx-sheet-changed。
    this._lastAddr = null
    this._lastSheetIdx = null
    if (this._selPoll) { clearInterval(this._selPoll) }
    this._selPoll = setInterval(() => {
      try {
        // 活动 sheet 变化
        const sh = this.getActiveSheet()
        if (sh && sh.index !== this._lastSheetIdx) {
          this._lastSheetIdx = sh.index
          this._lastAddr = null // 换 sheet 后强制重播选格
          this.dispatchEvent(new CustomEvent('cmx-sheet-changed', {
            bubbles: true, composed: true, detail: { index: sh.index, id: sh.id, name: sh.name },
          }))
        }
        const addr = this.getActiveAddr()
        if (addr && addr !== this._lastAddr) {
          this._lastAddr = addr
          const pos = parseAddr(addr)
          this.dispatchEvent(new CustomEvent('cmx-cell-selected', {
            bubbles: true, composed: true, detail: { addr, row: pos ? pos.row : null, col: pos ? pos.col : null, sheet: sh ? sh.id : null },
          }))
        }
      } catch (_) { /* 事件派发失败不影响主流程：忽略 */ }
    }, 200)
    // 列宽/行高拖拽回写：Ignite 不派发 resize 事件，拖拽结束（pointerup）后对比快照，
    // 变化则派发 cmx-col-resized / cmx-row-resized（设计器 content 页借此回写模型，否则保存丢列宽）。
    this._onSizePointerUp = () => {
      setTimeout(() => {
        try {
          const changes = this._diffColRowSizes()
          changes.cols.forEach((c) => {
            this.dispatchEvent(new CustomEvent('cmx-col-resized', { bubbles: true, composed: true, detail: c }))
          })
          changes.rows.forEach((r) => {
            this.dispatchEvent(new CustomEvent('cmx-row-resized', { bubbles: true, composed: true, detail: r }))
          })
        } catch (_) { /* 事件派发失败不影响主流程：忽略 */ }
      }, 60)
    }
    this._sheet.addEventListener('pointerup', this._onSizePointerUp, { capture: true })
    this._snapshotSizes()
  }

  /** 快照当前活动 sheet 的列宽/行高（px），供拖拽结束后 diff。 */
  _snapshotSizes () {
    const snap = { cols: {}, rows: {}, sheetIdx: this._lastSheetIdx }
    try {
      const ws = this._activeWs()
      if (ws) {
        for (let c = 0; c < 40; c++) {
          try {
            const col = ws.columns(c)
            const px = col && col.getWidth ? Math.round(col.getWidth(WorksheetColumnWidthUnit.Pixel)) : 0
            if (px > 0) snap.cols[c] = px
          } catch (_) { /* 表格内核差异导致该调用被拒：降级跳过 */ }
        }
        for (let r = 0; r < 200; r++) {
          try {
            const row = ws.rows(r)
            const h = row ? row.height : -1
            if (h > 0) snap.rows[r] = h
          } catch (_) { /* 防御性忽略 */ }
        }
      }
    } catch (_) { /* 防御性忽略 */ }
    this._sizeSnap = snap
  }

  /** 对比列宽/行高快照，返回变化清单并更新快照。 */
  _diffColRowSizes () {
    const out = { cols: [], rows: [] }
    const prev = this._sizeSnap || { cols: {}, rows: {} }
    const ws = this._activeWs()
    if (!ws) return out
    const next = { cols: {}, rows: {}, sheetIdx: this._lastSheetIdx }
    // 换 sheet 后快照失效：只重建快照不报差异
    const sheetChanged = prev.sheetIdx !== this._lastSheetIdx
    for (let c = 0; c < 40; c++) {
      try {
        const col = ws.columns(c)
        const px = col && col.getWidth ? Math.round(col.getWidth(WorksheetColumnWidthUnit.Pixel)) : 0
        if (px > 0) next.cols[c] = px
        if (!sheetChanged) {
          const was = prev.cols[c] || 0
          if (px > 0 && was > 0 && Math.abs(px - was) > 1) {
            out.cols.push({ index: c, letter: indexToCol(c), px })
          }
        }
      } catch (_) { /* 防御性忽略 */ }
    }
    for (let r = 0; r < 200; r++) {
      try {
        const row = ws.rows(r)
        const h = row ? row.height : -1
        if (h > 0) next.rows[r] = h
        if (!sheetChanged) {
          const was = prev.rows[r] || 0
          if (h > 0 && was > 0 && Math.abs(h - was) > 10) {
            // Ignite 行高单位 twips（px*15）→ 回报 px
            out.rows.push({ index: r, rowNo: r + 1, px: Math.round(h / 15) })
          }
        }
      } catch (_) { /* 防御性忽略 */ }
    }
    this._sizeSnap = next
    return out
  }

  _unbindEvents () {
    if (this._selPoll) { clearInterval(this._selPoll); this._selPoll = null }
    if (this._sheet && this._sheet.removeEventListener) {
      if (this._onActiveCell) this._sheet.removeEventListener('activeCellChanged', this._onActiveCell)
      if (this._onCellValueChanged) this._sheet.removeEventListener('cellValueChanged', this._onCellValueChanged)
      if (this._onSizePointerUp) this._sheet.removeEventListener('pointerup', this._onSizePointerUp, { capture: true })
    }
  }

  _bootstrapFromAttributes () {
    const rep = this.getAttribute('data-cmx-report')
    if (rep) {
      try { this.setReportModel(JSON.parse(rep)) } catch (_) { /* 载荷非合法 JSON：按空处理 */ }
    }
    if (this.hasAttribute('data-cmx-formula-bar')) {
      this.showFormulaBar(this.getAttribute('data-cmx-formula-bar') !== 'false')
    }
  }
}

customElements.define('cmx-spreadsheet', CmxSpreadsheet)
