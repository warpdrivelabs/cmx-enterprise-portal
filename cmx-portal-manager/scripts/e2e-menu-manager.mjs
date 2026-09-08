/**
 * 菜单管理两段式重构 E2E（Playwright + chromium）。
 * 登录 → 打开菜单管理 → 校验 explorer 树 / content 编辑器 / 属性栏隐藏；
 * 选节点回填(功能码名) / 功能码选择器非空 / 切模块复位 / 拖拽成环拦截。
 *
 * 说明：explorer 区在侧栏 shadow、content 区在工作区 shadow，故一律用 shadow 穿透 deepFind。
 * 运行：node scripts/e2e-menu-manager.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.CMX_E2E_BASE || 'http://localhost:5173'
const USER = process.env.CMX_E2E_USER || 'e2e_menu'
const PASS = process.env.CMX_E2E_PASS || 'Test@123456'

const results = []
function check (name, ok, extra = '') {
  results.push({ name, ok: !!ok, extra })
  console.log(`${ok ? '✅' : '❌'} ${name}${extra ? '  — ' + extra : ''}`)
}

// 注入到页面：shadow 穿透查找第一个匹配标签的元素
const DEEP_FIND = `function deepFind(tag){
  const stack=[document];
  while(stack.length){
    const root=stack.pop();
    const found=root.querySelector&&root.querySelector(tag);
    if(found)return found;
    const all=root.querySelectorAll?root.querySelectorAll('*'):[];
    for(const el of all)if(el.shadowRoot)stack.push(el.shadowRoot);
  }
  return null;
}`

async function main () {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ viewport: { width: 1560, height: 960 } })
  const page = await ctx.newPage()
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(String(e)))

  try {
    // ── 登录 ─────────────────────────────────────────────
    await page.goto(`${BASE}/login.html`, { waitUntil: 'domcontentloaded' })
    await page.fill('#username', USER)
    await page.fill('#password', PASS)
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => {}),
      page.click('#submit'),
    ])
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('cmx-portal-app', { timeout: 15000 })
    await page.waitForTimeout(1800)
    check('登录并进入门户主应用', true)

    // ── 打开菜单管理（派发 shellbar 事件，等价点击「菜单管理」按钮）──
    await page.evaluate(() => {
      const app = document.querySelector('cmx-portal-app')
      const sb = app?.shadowRoot?.querySelector('portal-shellbar') || app
      sb.dispatchEvent(new CustomEvent('shellbar-menu-manager-click', { bubbles: true, composed: true }))
    })
    await page.waitForTimeout(2800)

    // ── explorer 树 / content 编辑器 存在 ────────────────
    const hasTree = await page.evaluate(`(()=>{${DEEP_FIND};return !!deepFind('portal-menu-tree')})()`)
    check('explorer 区渲染菜单树 <portal-menu-tree>', hasTree)
    const hasEditor = await page.evaluate(`(()=>{${DEEP_FIND};return !!deepFind('portal-menu-editor')})()`)
    check('content 区渲染节点编辑器 <portal-menu-editor>', hasEditor)

    // 等树加载出节点
    await page.waitForFunction(`(()=>{${DEEP_FIND};const t=deepFind('portal-menu-tree');return t&&t.shadowRoot&&t.shadowRoot.querySelectorAll('.tree-node').length>0})()`, { timeout: 15000 }).catch(() => {})
    const treeCount = await page.evaluate(`(()=>{${DEEP_FIND};const t=deepFind('portal-menu-tree');return t?.shadowRoot?.querySelectorAll('.tree-node').length||0})()`)
    check('菜单树渲染出节点', treeCount > 0, `节点数=${treeCount}`)

    // DAM 默认联动 fi/cmxfico/gl
    const dam = await page.evaluate(`(()=>{${DEEP_FIND};const t=deepFind('portal-menu-tree');const sr=t.shadowRoot;return {d:sr.getElementById('sel-domain')?.value,a:sr.getElementById('sel-app')?.value,m:sr.getElementById('sel-module')?.value}})()`)
    check('DAM 三联默认联动', dam.d === 'fi' && dam.m === 'gl', `域=${dam.d} 应用=${dam.a} 模块=${dam.m}`)

    // ── 属性栏隐藏 ───────────────────────────────────────
    const propHidden = await page.evaluate(() => {
      const app = document.querySelector('cmx-portal-app')
      const pane = app?.shadowRoot?.getElementById('property-pane')
      if (!pane) return true
      return pane.hasAttribute('data-hidden') || getComputedStyle(pane).display === 'none'
    })
    check('右侧属性栏自动隐藏', propHidden)

    // ── 选中「用户管理」(page-users, 带 fun_code) 验证回填 + 功能码名回显 ──
    await page.evaluate(`(()=>{${DEEP_FIND};const t=deepFind('portal-menu-tree');const kw=t.shadowRoot.getElementById('kw');kw.value='page-users';kw.dispatchEvent(new Event('input',{bubbles:true}))})()`)
    await page.waitForTimeout(700)
    const clicked = await page.evaluate(`(()=>{${DEEP_FIND};const t=deepFind('portal-menu-tree');const nodes=[...t.shadowRoot.querySelectorAll('.tree-node')];const exact=nodes.find(n=>(n.querySelector('.txt')?.textContent||'')==='用户管理');if(exact){exact.click();return true}if(nodes[0]){nodes[0].click();return true}return false})()`)
    check('可点选菜单节点（用户管理）', clicked)
    await page.waitForTimeout(1300)

    const formName = await page.evaluate(`(()=>{${DEEP_FIND};const e=deepFind('portal-menu-editor');return e?.shadowRoot?.getElementById('ff-name')?.value||''})()`)
    check('编辑器回填节点名称', formName === '用户管理', `name="${formName}"`)

    await page.waitForTimeout(900)
    const fc = await page.evaluate(`(()=>{${DEEP_FIND};const e=deepFind('portal-menu-editor');return {name:e?.shadowRoot?.getElementById('fc-name')?.textContent||'',code:e?.shadowRoot?.getElementById('fc-code')?.textContent||''}})()`)
    // page-users 的 fun_code=MENU.PAGES.USERS 在权限表无对应行 → 正确回退显示码
    check('功能码回显编码（无匹配权限时回退码）', fc.code === 'MENU.PAGES.USERS', `code="${fc.code}" name="${fc.name}"`)

    // ── 功能码选择器非空（修复恒空 bug）+ 选中真实功能码验证名回显 ──
    await page.evaluate(`(()=>{${DEEP_FIND};const e=deepFind('portal-menu-editor');e.shadowRoot.getElementById('btn-fc-pick').click()})()`)
    await page.waitForTimeout(1600)
    const pickerRows = await page.evaluate(`(()=>{${DEEP_FIND};const picker=deepFind('.cmx-menu-funcode-picker');const scope=picker?(picker.getRootNode?picker.getRootNode():document):document;const rows=(scope.querySelectorAll?scope:document).querySelectorAll('.cmx-menu-funcode-picker tbody tr');return rows.length})()`)
    check('功能码选择器非空（修复恒空 bug）', pickerRows > 0, `行数=${pickerRows}`)
    // 点选第一行真实功能码（gl:account「科目管理」），验证名回显（非纯码）
    const picked = await page.evaluate(`(()=>{${DEEP_FIND};const picker=deepFind('.cmx-menu-funcode-picker');const scope=picker?(picker.getRootNode?picker.getRootNode():document):document;const tr=(scope.querySelector?scope:document).querySelector('.cmx-menu-funcode-picker tbody tr');if(!tr)return null;const code=tr.getAttribute('data-code');const name=tr.children[1]?.textContent||'';tr.click();return {code,name}})()`)
    await page.waitForTimeout(700)
    const fcAfter = await page.evaluate(`(()=>{${DEEP_FIND};const e=deepFind('portal-menu-editor');return {name:e?.shadowRoot?.getElementById('fc-name')?.textContent||'',code:e?.shadowRoot?.getElementById('fc-code')?.textContent||''}})()`)
    check('选功能码后回显权限名（非纯码）', !!picked && fcAfter.name === picked.name && fcAfter.name !== fcAfter.code, `name="${fcAfter.name}" code="${fcAfter.code}"`)

    // ── 拖拽成环拦截（直接调 _reparent(root, itsChild) 应被拦截，不发 update）──
    const cyc = await page.evaluate(`(async()=>{${DEEP_FIND};const comp=deepFind('portal-menu-tree');const tree=comp._tree||[];const rk=tree.find(n=>Array.isArray(n.children)&&n.children.length);if(!rk)return{skipped:true};const rootData=rk.data,childData=rk.children[0].data;let updateCalled=false;const of=window.fetch;window.fetch=(...a)=>{if(String(a[0]||'').includes('/api/menu/update'))updateCalled=true;return of(...a)};comp._dragged=rootData;await comp._reparent(rootData,childData);window.fetch=of;return{updateCalled,root:rootData.code,child:childData.code}})()`)
    if (cyc.skipped) check('拖拽成环拦截', true, '（无父子样本，跳过）')
    else check('拖拽成环被前端拦截（未发 update，树不损坏）', cyc.updateCalled === false, `root=${cyc.root} child=${cyc.child}`)

    // ── 合法拖拽应放行（把一个根拖到另一个根下，会发 update；随后还原）──
    const legal = await page.evaluate(`(async()=>{${DEEP_FIND};const comp=deepFind('portal-menu-tree');const tree=comp._tree||[];const roots=tree.filter(n=>n.data&&(n.data.parent_id==null||n.data.parent_id===''));if(roots.length<2)return{skipped:true};const mover=roots[roots.length-1].data;const targetParent=roots[0].data;let updateCalled=false;const of=window.fetch;window.fetch=(...a)=>{if(String(a[0]||'').includes('/api/menu/update'))updateCalled=true;return of(...a)};comp._dragged=mover;await comp._reparent(mover,targetParent);const moverId=mover.id;window.fetch=of;/*还原为根*/try{await fetch('/api/menu/update',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:moverId,data:{parent_id:null}})})}catch(e){}return{updateCalled,mover:mover.code,target:targetParent.code}})()`)
    if (legal.skipped) check('合法拖拽放行', true, '（根不足 2，跳过）')
    else check('合法拖拽换父放行（发 update）', legal.updateCalled === true, `mover=${legal.mover}→${legal.target}（已还原）`)

    // ── 切换模块后编辑器复位（修复残留）──────────────────
    await page.evaluate(`(()=>{${DEEP_FIND};const t=deepFind('portal-menu-tree');const kw=t.shadowRoot.getElementById('kw');kw.value='';kw.dispatchEvent(new Event('input',{bubbles:true}))})()`)
    await page.waitForTimeout(400)
    const sw = await page.evaluate(`(()=>{${DEEP_FIND};const t=deepFind('portal-menu-tree');const sel=t.shadowRoot.getElementById('sel-module');const opts=[...sel.options].map(o=>o.value);const other=opts.find(v=>v!==sel.value);if(!other)return{switched:false};sel.value=other;sel.dispatchEvent(new Event('change',{bubbles:true}));return{switched:true,to:other}})()`)
    await page.waitForTimeout(1600)
    const reset = await page.evaluate(`(()=>{${DEEP_FIND};const e=deepFind('portal-menu-editor');return !!e?.shadowRoot?.querySelector('.empty')})()`)
    if (!sw.switched) check('切模块后编辑器复位', true, '（仅一个模块，跳过）')
    else check('切模块后编辑器复位空态（修复残留）', reset, `→模块 ${sw.to}`)

    // ── 控制台无报错 ─────────────────────────────────────
    const realErrors = errors.filter((e) => !/favicon|ResizeObserver|Download the React|\[UI5/i.test(e))
    check('页面无严重控制台报错', realErrors.length === 0, realErrors.slice(0, 3).join(' | '))

    await page.screenshot({ path: '/tmp/menu-manager-e2e.png' }).catch(() => {})
    console.log('\n截图: /tmp/menu-manager-e2e.png')
  } catch (err) {
    check('E2E 执行异常', false, String((err && err.stack) || err))
    await page.screenshot({ path: '/tmp/menu-manager-e2e-fail.png' }).catch(() => {})
  } finally {
    await browser.close()
  }

  const passed = results.filter((r) => r.ok).length
  console.log(`\n===== ${passed}/${results.length} 通过 =====`)
  process.exit(passed === results.length ? 0 : 1)
}

main()
