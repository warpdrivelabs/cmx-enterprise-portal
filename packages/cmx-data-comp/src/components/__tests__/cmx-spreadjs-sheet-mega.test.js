// @vitest-environment jsdom
// M6：<cmx-spreadjs-sheet>（mega 内核）契约测试——覆盖 designer.js/report-applier.js 经 getWorkbook()
// 逃生舱 + 门面调用的全部面。目标：消费方零改，行为对齐 SpreadJS 版。
import { describe, it, expect, beforeAll } from 'vitest'
import { CmxSpreadjsSheetMega } from '../spreadjs/cmx-spreadjs-sheet-mega.js'

beforeAll(() => {
  if (!customElements.get('cmx-spreadjs-sheet')) customElements.define('cmx-spreadjs-sheet', CmxSpreadjsSheetMega)
})

function mount () {
  const el = document.createElement('cmx-spreadjs-sheet')
  document.body.appendChild(el)
  // 给内部 <cmx-megasheet> 的 stage 一个尺寸，让几何/视口成立
  const inner = el.shadowRoot.querySelector('cmx-megasheet')
  const stage = inner?.shadowRoot?.querySelector('.cmx-stage')
  if (stage) {
    stage.getBoundingClientRect = () => ({ left: 0, top: 0, right: 800, bottom: 500, width: 800, height: 500, x: 0, y: 0, toJSON () {} })
    if (typeof inner.resize === 'function') inner.resize()
  }
  return el
}

const MODEL = {
  meta: { reportName: '资产负债表' },
  sheets: [
    {
      name: '资产负债表',
      grid: { rows: 30, cols: 8, colWidths: { A: 200 }, rowHeights: { 1: 34 }, merges: ['A1:D1'],
        styleClasses: { money: { formatter: '#,##0.00', hAlign: 'right' } } },
      cells: {
        A1: { value: '某公司 资产负债表' },
        A2: { value: '货币资金' }, C2: { value: 620000, styleName: 'money' },
        A3: { value: '应收账款' }, C3: { value: 388000, styleName: 'money' },
        A4: { value: '合计' }, C4: { formula: '=SUM(C2:C3)', styleName: 'money' },
        C5: { fetchKey: 'qm.cash', type: 'fetch', formula: '=QM(1)' },
      },
    },
    { name: '利润表', grid: { rows: 10, cols: 4 }, cells: { A1: { value: '营业收入' } } },
  ],
  fetches: { 'qm.cash': 99999 },
}

describe('getWorkbook() 逃生舱 · 工作簿面', () => {
  it('getSheetCount / getActiveSheet / getSheet / getActiveSheetIndex', () => {
    const el = mount(); el.setReportModel(MODEL)
    const wb = el.getWorkbook()
    expect(wb.getSheetCount()).toBe(2)
    expect(wb.getActiveSheetIndex()).toBe(0)
    expect(wb.getActiveSheet().name()).toBe('资产负债表')
    expect(wb.getSheet(1).name()).toBe('利润表')
  })

  it('suspend/resumePaint + toJSON 不炸、toJSON 是中性快照', () => {
    const el = mount(); el.setReportModel(MODEL)
    const wb = el.getWorkbook()
    expect(() => { wb.suspendPaint(); wb.resumePaint() }).not.toThrow()
    const json = wb.toJSON()
    expect(json.format).toBe('cmx-megasheet')
  })
})

describe('getWorkbook().getActiveSheet() 逃生舱 · 数据面', () => {
  it('setFormula/getFormula/get·setValue/name/getRow·ColumnCount', () => {
    const el = mount(); el.setReportModel(MODEL)
    const ws = el.getWorkbook().getActiveSheet()
    expect(ws.getValue(1, 0)).toBe('货币资金')
    expect(ws.getValue(1, 2)).toBe(620000)
    expect(ws.getFormula(3, 2)).toBe('SUM(C2:C3)')   // 无 = 前缀（对齐 SpreadJS getFormula）
    expect(ws.getFormula(1, 0)).toBeNull()             // 无公式返回 null
    expect(ws.getRowCount()).toBe(30)
    expect(ws.getColumnCount()).toBe(8)
    ws.setValue(5, 0, '直接写')
    expect(ws.getValue(5, 0)).toBe('直接写')
    ws.setFormula(6, 2, 'C2+C3')
    expect(ws.getFormula(6, 2)).toBe('C2+C3')
  })

  it('getSpan/getSpans/getStyle/getCell/getRange + fetch 回填 + =SUM 计算', () => {
    const el = mount(); el.setReportModel(MODEL)
    const ws = el.getWorkbook().getActiveSheet()
    expect(ws.getSpan(0, 0)).toMatchObject({ rowCount: 1, colCount: 4 })
    const spans = ws.getSpans(ws.getRange(0, 0, 2, 5))
    expect(spans.length).toBeGreaterThanOrEqual(1)
    expect(ws.getValue(3, 2)).toBe(620000 + 388000)   // =SUM 计算
    expect(ws.getValue(4, 2)).toBe(99999)             // fetchKey 回填
    expect(ws.getCell(0, 0).value()).toBe('某公司 资产负债表')
    expect(ws.getColumnWidth(0)).toBe(200)
  })

  it('getParent() 回工作簿；rowOutlines/columnOutlines 直通（浮动行列 P1–P5 折叠）', () => {
    const el = mount(); el.setReportModel(MODEL)
    const wb = el.getWorkbook()
    const ws = wb.getActiveSheet()
    expect(ws.getParent()).toBe(wb)
    expect(ws.rowOutlines).toBeTruthy()
    expect(typeof ws.rowOutlines.group).toBe('function')
    ws.rowOutlines.group(2, 3)          // 分组行 2..4
    expect(ws.rowOutlines.list().length).toBe(1)
  })
})

describe('getWorkbook().getActiveSheet() 逃生舱 · 几何面', () => {
  it('getCellRect/getViewport*Row·Column/showCell/zoom', () => {
    const el = mount(); el.setReportModel(MODEL)
    const ws = el.getWorkbook().getActiveSheet()
    const rect = ws.getCellRect(0, 0)
    expect(rect).toBeTruthy()
    expect(rect.width).toBeGreaterThan(0)
    expect(ws.getViewportTopRow()).toBe(0)
    expect(ws.getViewportLeftColumn()).toBe(0)
    expect(() => ws.showCell(20, 0, 3, 3)).not.toThrow()
    expect(ws.zoom()).toBe(1)
    ws.zoom(1.25)
    expect(ws.zoom()).toBe(1.25)
  })
})

describe('getWorkbook() 事件桥（消费方 .bind(spreadEvt, fn) 无参回调）', () => {
  it('CellChanged/ValueChanged ← cmx-cell-edited', () => {
    const el = mount(); el.setReportModel(MODEL)
    const wb = el.getWorkbook()
    let edits = 0
    wb.bind('CellChanged', () => { edits++ })
    wb.bind('ValueChanged', () => { edits++ })
    el._runUndoable('editCell', () => { el.getWorkbook().getActiveSheet().setValue(7, 0, 'x') })
    expect(edits).toBe(2)  // 两个订阅者都被同一 cmx-cell-edited 触发
  })

  it('SelectionChanged ← cmx-cell-selected', () => {
    const el = mount(); el.setReportModel(MODEL)
    const wb = el.getWorkbook()
    let sel = 0
    wb.bind('SelectionChanged', () => { sel++ })
    // 内部 element 派发 cmx-cell-selected
    const inner = el.shadowRoot.querySelector('cmx-megasheet')
    inner.dispatchEvent(new CustomEvent('cmx-cell-selected', { detail: { addr: 'B2' }, bubbles: true, composed: true }))
    expect(sel).toBeGreaterThanOrEqual(1)
  })

  it('ActiveSheetChanged ← cmx-sheet-changed', () => {
    const el = mount(); el.setReportModel(MODEL)
    const wb = el.getWorkbook()
    let changed = 0
    wb.bind('ActiveSheetChanged', () => { changed++ })
    const inner = el.shadowRoot.querySelector('cmx-megasheet')
    inner.dispatchEvent(new CustomEvent('cmx-sheet-changed', { detail: { index: 1 }, bubbles: true, composed: true }))
    expect(changed).toBeGreaterThanOrEqual(1)
  })
})

describe('getWorkbook().hitTest → {worksheetHitInfo:{row,col}}', () => {
  it('数据区点命中归一', () => {
    const el = mount(); el.setReportModel(MODEL)
    const wb = el.getWorkbook()
    const ws = wb.getActiveSheet()
    const rect = ws.getCellRect(3, 2)
    const info = wb.hitTest(rect.x + rect.width / 2, rect.y + rect.height / 2)
    expect(info).toEqual({ worksheetHitInfo: { row: 3, col: 2 } })
  })
})

describe('setWorkbookJson 双读', () => {
  it('读中性快照（format=cmx-megasheet）', async () => {
    const el = mount(); el.setReportModel(MODEL)
    const snap = el.getWorkbookJson()
    expect(snap.format).toBe('cmx-megasheet')
    const el2 = mount()
    const ok = await el2.setWorkbookJson(snap)
    expect(ok).toBe(true)
    expect(el2.getWorkbook().getActiveSheet().getValue(1, 0)).toBe('货币资金')
  })

  it('读 SpreadJS SSJSON（存量报表；无 format 键）', async () => {
    const el = mount()
    // 极简 SSJSON：sheets 里一个 sheet，dataTable 有一格
    const ssjson = {
      version: '18.0.0',
      sheets: {
        Sheet1: {
          name: 'Sheet1', rowCount: 10, columnCount: 6,
          data: { dataTable: { 0: { 0: { value: 'SSJSON来的' } } } },
        },
      },
    }
    const ok = await el.setWorkbookJson(ssjson)
    expect(ok).toBe(true)
    expect(el.getWorkbook().getActiveSheet().getValue(0, 0)).toBe('SSJSON来的')
  })
})

describe('门面转调（与 SpreadJS 版签名对齐）', () => {
  it('setCellValues 回填保留公式 + 重算', () => {
    const el = mount(); el.setReportModel(MODEL)
    el.setCellValues({ C2: '700000' })
    const ws = el.getWorkbook().getActiveSheet()
    expect(ws.getValue(1, 2)).toBe(700000)          // 字符串转 number
    expect(ws.getValue(3, 2)).toBe(700000 + 388000) // C4 =SUM 重算
  })

  it('applySelectionBorder 可撤销 + getActiveAddr/readSelection', () => {
    const el = mount(); el.setReportModel(MODEL)
    el._el.setSelection(1, 2, 3, 1)  // C2:C4
    el.applySelectionBorder('outline', '#c00000', 'medium')
    const st = el.getWorkbook().getActiveSheet().getStyle(1, 2)
    expect(st?.borders?.top?.style).toBe('medium')
    el.undo()
    expect(el.getWorkbook().getActiveSheet().getStyle(1, 2)?.borders?.top).toBeUndefined()
  })

  it('setEditable / getActiveSheet(number) / setActiveSheet / getHistoryState', () => {
    const el = mount(); el.setReportModel(MODEL)
    el.setEditable(false)
    expect(el.isEditable()).toBe(false)
    el.setActiveSheet(1)
    expect(el.getActiveSheet()).toBe(1)
    expect(typeof el.getActiveSheet()).toBe('number')
    const h = el.getHistoryState()
    expect(h).toHaveProperty('canUndo')
    expect(h).toHaveProperty('undo')
  })

  it('_runUndoable 让外部直接改 sheet 的编辑可撤销', () => {
    const el = mount(); el.setReportModel(MODEL)
    const ws = el.getWorkbook().getActiveSheet()
    const before = ws.getValue(8, 0)
    el._runUndoable('editCell', () => { ws.setValue(8, 0, '经_runUndoable写入') })
    expect(el.getWorkbook().getActiveSheet().getValue(8, 0)).toBe('经_runUndoable写入')
    el.undo()
    expect(el.getWorkbook().getActiveSheet().getValue(8, 0)).toBe(before ?? null)
  })
})

describe('P0.3 逃生舱保真', () => {
  it('ws.setStyle(GC.Style{font}) 解析出字号/字体（不再只认 bold/italic）', () => {
    const el = mount(); el.setReportModel(MODEL)
    const ws = el.getWorkbook().getActiveSheet()
    // 模拟消费方 report-applier.js:864 的 new GC.Spread.Sheets.Style(); s.font='bold 12px Arial'
    ws.setStyle(1, 0, { font: 'bold 12px Arial' })
    const st = ws.getStyle(1, 0)
    expect(st.bold).toBe(true)
    expect(st.fontSize).toBe(12)      // ← 之前会丢
    expect(st.fontFamily).toBe('Arial') // ← 之前会丢
  })

  it('ws.setStyle 搬 hAlign/vAlign/wordWrap（含数字枚举）', () => {
    const el = mount(); el.setReportModel(MODEL)
    const ws = el.getWorkbook().getActiveSheet()
    ws.setStyle(2, 0, { hAlign: 2, vAlign: 0, wordWrap: true }) // 2=right,0=top
    const st = ws.getStyle(2, 0)
    expect(st.hAlign).toBe('right')
    expect(st.vAlign).toBe('top')
    expect(st.wordWrap).toBe(true)
  })

  it('range.font() 与 setStyle 走同一字体解析', () => {
    const el = mount(); el.setReportModel(MODEL)
    const ws = el.getWorkbook().getActiveSheet()
    ws.getCell(3, 0).font('italic 16px "PingFang SC"')
    const st = ws.getStyle(3, 0)
    expect(st.italic).toBe(true)
    expect(st.fontSize).toBe(16)
  })

  it('wb.options.showRowOutline=true 触发大纲刷新（不再 inert）', () => {
    const el = mount(); el.setReportModel(MODEL)
    const inner = el.shadowRoot.querySelector('cmx-megasheet')
    let refreshed = 0
    const orig = inner.refreshOutlines.bind(inner)
    inner.refreshOutlines = () => { refreshed++; orig() }
    const wb = el.getWorkbook()
    const ws = wb.getActiveSheet()
    ws.rowOutlines.group(2, 3)          // 分组（passthrough）
    wb.options.showRowOutline = true     // 之前写进裸 {} 无效
    expect(refreshed).toBeGreaterThanOrEqual(1)
  })
})
