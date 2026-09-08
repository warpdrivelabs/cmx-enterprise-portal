// M6 组件级真机验证：headless Chrome 里跑 <cmx-spreadjs-sheet>（mega 内核）——
// setReportModel 铺格 → getWorkbook() 逃生舱读写 → 事件桥 → hitTest → setWorkbookJson 双读 → 截图。
// 必须在 repo 内运行（从 root node_modules 解析 playwright）。真机=真 canvas，验证几何/渲染。
// file:// 禁 ESM 模块导入（CORS），故起一个本地静态服务器用 http:// 加载。
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import { dirname, join, normalize } from 'node:path'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'

const here = dirname(fileURLToPath(import.meta.url))
const pkgRoot = join(here, '..') // packages/cmx-data-comp

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' }
const server = createServer(async (req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0])
  if (urlPath === '/favicon.ico') { res.writeHead(204); res.end(); return }
  try {
    const fp = normalize(join(pkgRoot, urlPath))
    if (!fp.startsWith(pkgRoot)) { res.writeHead(403); res.end('forbidden'); return }
    const body = await readFile(fp)
    const ext = fp.slice(fp.lastIndexOf('.'))
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
    res.end(body)
  } catch { res.writeHead(404); res.end('not found') }
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const port = server.address().port
const url = `http://127.0.0.1:${port}/demo/m6-kernel.html`

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1200, height: 720 } })
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(url)
await page.waitForFunction(() => window.__ready && document.getElementById('sheet')?.getWorkbook)

const out = await page.evaluate(async () => {
  const el = document.getElementById('sheet')
  const r = {}

  const model = {
    meta: { reportName: '资产负债表' },
    sheets: [{
      name: '资产负债表',
      grid: {
        rows: 24, cols: 6,
        colWidths: { A: 200 }, rowHeights: { '1': 34 }, merges: ['A1:D1'],
        styleClasses: { hdr: { bold: true, hAlign: 'center', backColor: 'rgba(90,140,230,0.20)' }, money: { formatter: '#,##0.00', hAlign: 'right' } },
      },
      cells: {
        A1: { value: '某公司 资产负债表', styleName: 'hdr' },
        A2: { value: '货币资金' }, C2: { value: 620000, styleName: 'money' },
        A3: { value: '应收账款' }, C3: { value: 388000, styleName: 'money' },
        A4: { value: '合计', style: { bold: true } }, C4: { formula: '=SUM(C2:C3)', styleName: 'money' },
        C5: { fetchKey: 'qm.cash', type: 'fetch', formula: '=QM(1)' },
      },
    }, { name: '利润表', grid: { rows: 10, cols: 4 }, cells: { A1: { value: '营业收入' } } }],
    fetches: { 'qm.cash': 99999 },
  }

  // ── 1) setReportModel 铺格 ──
  el.setReportModel(model)
  const wb = el.getWorkbook()
  r.sheetCount = wb.getSheetCount()
  const ws = wb.getActiveSheet()
  r.sum = ws.getValue(3, 2)          // =SUM(C2:C3) = 1008000
  r.fetch = ws.getValue(4, 2)        // fetchKey → 99999
  r.merged = !!ws.getSpan(0, 0)
  r.colW = ws.getColumnWidth(0)      // 200
  r.sheet2Name = wb.getSheet(1).name()

  // ── 2) 逃生舱几何面（真 canvas 才有真几何）──
  const rect = ws.getCellRect(3, 2)
  r.rectOk = !!rect && rect.width > 0 && rect.height > 0
  r.vpTop = ws.getViewportTopRow()

  // ── 3) 事件桥：bind CellChanged 无参回调，_runUndoable 触发 ──
  let edits = 0
  wb.bind('CellChanged', () => { edits++ })
  wb.bind('ValueChanged', () => { edits++ })
  el._runUndoable('editCell', () => { wb.getActiveSheet().setValue(6, 0, '事件桥写入') })
  r.eventFired = edits           // 2（两个订阅者）
  r.editValue = wb.getActiveSheet().getValue(6, 0)
  el.undo()
  r.afterUndo = wb.getActiveSheet().getValue(6, 0)  // null/'' —— 撤销回去

  // ── 4) hitTest 归一 ──
  const hit = wb.hitTest(rect.x + rect.width / 2, rect.y + rect.height / 2)
  r.hit = hit && hit.worksheetHitInfo ? `${hit.worksheetHitInfo.row},${hit.worksheetHitInfo.col}` : null

  // ── 5) setWorkbookJson 双读：中性快照往返 ──
  const snap = el.getWorkbookJson()
  r.snapFormat = snap.format
  await el.setWorkbookJson(snap)
  r.afterJsonSum = el.getWorkbook().getActiveSheet().getValue(3, 2)

  // ── 6) setWorkbookJson 读存量 SSJSON ──
  const ssjson = { version: '18', sheets: { Sheet1: { name: 'S1', rowCount: 8, columnCount: 5, data: { dataTable: { 0: { 0: { value: 'SSJSON存量' } } } } } } }
  await el.setWorkbookJson(ssjson)
  r.ssjsonRead = el.getWorkbook().getActiveSheet().getValue(0, 0)

  // ── 7) 恢复报表 + setCellValues 回填触发重算 ──
  el.setReportModel(model)
  el.setCellValues({ C2: '700000' })
  r.backfill = el.getWorkbook().getActiveSheet().getValue(1, 2)   // 700000
  r.recompute = el.getWorkbook().getActiveSheet().getValue(3, 2)  // 700000+388000

  // ── 8) 只读 + 主题 + 活动表 ──
  el.setEditable(false); r.editable = el.isEditable()
  el.setColorScheme('dark')
  el.setActiveSheet(1); r.activeIdx = el.getActiveSheet(); r.activeIsNum = typeof el.getActiveSheet() === 'number'
  el.setActiveSheet(0)

  return r
})

await page.waitForTimeout(150)
await page.screenshot({ path: join(here, 'preview-m6-kernel.png') })
await browser.close()
server.close()

// ── 断言 ──
const checks = [
  ['sheetCount=2', out.sheetCount === 2],
  ['sum=1008000', out.sum === 1008000],
  ['fetch=99999', out.fetch === 99999],
  ['merged', out.merged === true],
  ['colW=200', out.colW === 200],
  ['sheet2=利润表', out.sheet2Name === '利润表'],
  ['getCellRect ok', out.rectOk === true],
  ['vpTop=0', out.vpTop === 0],
  ['eventBridge fired 2', out.eventFired === 2],
  ['edit wrote value', out.editValue === '事件桥写入'],
  ['undo reverted', out.afterUndo == null || out.afterUndo === ''],
  ['hitTest=3,2', out.hit === '3,2'],
  ['snap neutral', out.snapFormat === 'cmx-megasheet'],
  ['json roundtrip sum', out.afterJsonSum === 1008000],
  ['ssjson dual-read', out.ssjsonRead === 'SSJSON存量'],
  ['setCellValues backfill', out.backfill === 700000],
  ['formula recompute', out.recompute === 700000 + 388000],
  ['editable=false', out.editable === false],
  ['activeIdx=1', out.activeIdx === 1],
  ['activeIdx is number', out.activeIsNum === true],
]

console.log('=== M6 组件级真机结果 ===')
console.log(JSON.stringify(out, null, 2))
let allPass = true
for (const [name, ok] of checks) { console.log(`${ok ? '✅' : '❌'} ${name}`); if (!ok) allPass = false }
if (errors.length) { allPass = false; console.log('\n❌ console/page errors:'); errors.forEach((e) => console.log('  ', e)) }
console.log(allPass && !errors.length ? '\n=== ALL M6 KERNEL CHECKS PASS ===' : '\n=== M6 KERNEL: FAILURES ABOVE ===')
process.exit(allPass && !errors.length ? 0 : 1)
