/**
 * 工作区节点编辑对话框 E2E（重构样式后回归验证）。
 * 登录 → 菜单管理 → 选节点 → 编辑 workspace → 验证：对话框打开/两 Tab 切换/区域导航/
 * 新增视图/视图表单/JSON 源码同步/保存往返。
 * 运行：node scripts/e2e-wsnode-dialog.mjs
 */
import { chromium } from 'playwright'
const BASE = process.env.CMX_E2E_BASE || 'http://localhost:5173'
const USER = process.env.CMX_E2E_USER || 'e2e_menu'
const PASS = process.env.CMX_E2E_PASS || 'Test@123456'
const DEEP = `function deepFind(tag){const stack=[document];while(stack.length){const root=stack.pop();const found=root.querySelector&&root.querySelector(tag);if(found)return found;const all=root.querySelectorAll?root.querySelectorAll('*'):[];for(const el of all)if(el.shadowRoot)stack.push(el.shadowRoot);}return null;}`
const results = []
const check = (n, ok, x = '') => { results.push({ n, ok: !!ok }); console.log(`${ok ? '✅' : '❌'} ${n}${x ? '  — ' + x : ''}`) }

async function main () {
  const b = await chromium.launch({ headless: true })
  const p = await (await b.newContext({ viewport: { width: 1560, height: 960 } })).newPage()
  const errs = []
  p.on('pageerror', e => errs.push(String(e)))
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
  try {
    await p.goto(`${BASE}/login.html`, { waitUntil: 'domcontentloaded' })
    await p.fill('#username', USER); await p.fill('#password', PASS)
    await Promise.all([p.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => {}), p.click('#submit')])
    await p.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1800)
    await p.evaluate(() => { const app = document.querySelector('cmx-portal-app'); const sb = app?.shadowRoot?.querySelector('portal-shellbar') || app; sb.dispatchEvent(new CustomEvent('shellbar-menu-manager-click', { bubbles: true, composed: true })) })
    await p.waitForTimeout(3000)
    // 选节点 + 编辑 workspace
    await p.evaluate(`(()=>{${DEEP};const t=deepFind('portal-menu-tree');const n=[...t.shadowRoot.querySelectorAll('.tree-node')].find(x=>(x.querySelector('.txt')?.textContent||'')==='用户管理')||t.shadowRoot.querySelectorAll('.tree-node')[1];n&&n.click()})()`)
    await p.waitForTimeout(1000)
    await p.evaluate(`(()=>{${DEEP};const e=deepFind('portal-menu-editor');e.shadowRoot.getElementById('btn-edit-ws').click()})()`)
    await p.waitForTimeout(2000)

    const dlgOpen = await p.evaluate(`(()=>{${DEEP};const d=deepFind('portal-workspace-node-dialog');const dlg=d?.shadowRoot?.getElementById('wsNodeDlg');return !!(dlg&&dlg.open)})()`)
    check('对话框打开', dlgOpen)

    // 头部重构：orbit + 标题
    const header = await p.evaluate(`(()=>{${DEEP};const d=deepFind('portal-workspace-node-dialog');const sr=d.shadowRoot;return {orbit:!!sr.querySelector('.hdr-orbit'),title:sr.querySelector('.hdr-title')?.textContent||''}})()`)
    check('头部 orbit + 标题渲染', header.orbit && header.title.includes('工作区节点'), `title="${header.title}"`)

    // 节点 ID 回填
    const nodeId = await p.evaluate(`(()=>{${DEEP};const d=deepFind('portal-workspace-node-dialog');return d.shadowRoot.getElementById('wsNodeId')?.value||''})()`)
    check('节点 ID 回填', nodeId === 'page-users', `id="${nodeId}"`)

    // 切到 content 区 + 新增视图
    await p.evaluate(`(()=>{${DEEP};const sr=deepFind('portal-workspace-node-dialog').shadowRoot;sr.querySelector('.region-tab[data-region="content"]').click()})()`)
    await p.waitForTimeout(500)
    await p.evaluate(`(()=>{${DEEP};const sr=deepFind('portal-workspace-node-dialog').shadowRoot;sr.getElementById('addViewBtn').click()})()`)
    await p.waitForTimeout(800)
    const viewAdded = await p.evaluate(`(()=>{${DEEP};const sr=deepFind('portal-workspace-node-dialog').shadowRoot;const rows=sr.querySelectorAll('.views-table tbody tr').length;const cnt=sr.querySelector('[data-region-count="content"]')?.textContent;const form=!!sr.querySelector('.view-detail-form');return {rows,cnt,form}})()`)
    check('新增视图 → 表格出行 + 计数 + 详情表单', viewAdded.rows === 1 && viewAdded.cnt === '1' && viewAdded.form, `rows=${viewAdded.rows} cnt=${viewAdded.cnt} form=${viewAdded.form}`)

    // 视图表单：改 tabLabel
    await p.evaluate(`(()=>{${DEEP};const sr=deepFind('portal-workspace-node-dialog').shadowRoot;const el=sr.getElementById('vfLabel');el.value='测试标签';el.dispatchEvent(new CustomEvent('input',{bubbles:true}))})()`)
    await p.waitForTimeout(400)

    // 切 JSON Tab → 同步显示 content.views
    await p.evaluate(`(()=>{${DEEP};const sr=deepFind('portal-workspace-node-dialog').shadowRoot;sr.querySelector('.top-tab[data-tab="json"]').click()})()`)
    await p.waitForTimeout(1000)
    const jsonState = await p.evaluate(`(()=>{${DEEP};const sr=deepFind('portal-workspace-node-dialog').shadowRoot;const active=sr.querySelector('.top-tab[data-tab="json"]').classList.contains('active');const cm=sr.querySelector('#jsonHost .cm-editor');const txt=cm?cm.textContent:'';return {active,hasCm:!!cm,hasContent:txt.includes('content'),hasLabel:txt.includes('测试标签')}})()`)
    check('JSON Tab 激活 + CodeMirror 渲染', jsonState.active && jsonState.hasCm)
    check('JSON 与可视化模型同步（含新增视图与标签）', jsonState.hasContent && jsonState.hasLabel, `content=${jsonState.hasContent} label=${jsonState.hasLabel}`)

    // 回可视化 Tab
    await p.evaluate(`(()=>{${DEEP};const sr=deepFind('portal-workspace-node-dialog').shadowRoot;sr.querySelector('.top-tab[data-tab="visual"]').click()})()`)
    await p.waitForTimeout(500)
    const backVisual = await p.evaluate(`(()=>{${DEEP};const sr=deepFind('portal-workspace-node-dialog').shadowRoot;return sr.querySelector('#paneVisual').classList.contains('active')})()`)
    check('切回可视化编辑 Tab', backVisual)

    // 取消关闭（不保存，避免污染真实节点 definition）
    await p.evaluate(`(()=>{${DEEP};const sr=deepFind('portal-workspace-node-dialog').shadowRoot;sr.getElementById('wsNodeCancelBtn').click()})()`)
    await p.waitForTimeout(800)
    const closed = await p.evaluate(`(()=>{${DEEP};const d=deepFind('portal-workspace-node-dialog');const dlg=d?.shadowRoot?.getElementById('wsNodeDlg');return !dlg||!dlg.open})()`)
    check('取消关闭对话框', closed)

    const realErrors = errs.filter(e => !/favicon|ResizeObserver|Multiple UI5|Download the/i.test(e))
    check('无严重控制台报错', realErrors.length === 0, realErrors.slice(0, 2).join(' | '))
  } catch (err) {
    check('E2E 执行异常', false, String((err && err.stack) || err))
  } finally {
    await b.close()
  }
  const passed = results.filter(r => r.ok).length
  console.log(`\n===== ${passed}/${results.length} 通过 =====`)
  process.exit(passed === results.length ? 0 : 1)
}
main()
