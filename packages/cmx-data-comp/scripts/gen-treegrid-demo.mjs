/**
 * 生成 cmx-tabulator treegrid 演示页（html_pages）。
 *
 * 产出两份（Designer 预览 + Portal 运行时）同源 HTML：
 *   - CMXHTMLDesigner/cmx-node-server/_data/html-pages/sources/tabulator-treegrid-demo_<ts>.html
 *   - CMXPortalManager/cmx-node-server/data/html-pages/sources/_legacy/tabulator-treegrid-demo.html
 *
 * 页面函数以真实 JS 字符串定义，JSON.stringify 进 __designer_meta__，避免手写转义出错。
 *
 *   node scripts/gen-treegrid-demo.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(__dirname, '../../..')

const PAGE_ID = 'tabulator-treegrid-demo'
const TS = '20260622_140000000'
const NAME = 'cmx-tabulator 树形表格演示'
const DETAILS = 'cmx-tabulator treegrid：cf_gl_account 会计科目自分级字典（/api/dict 拉取扁平行，按 code/parent_id 重建层级）+ 展开/折叠 + iconCol 图标 + CmxColumnModel 绑定'

// ── 页面函数（运行时由 new Function 编译，host/$data 在作用域内） ──────────────

const loadDemoData = `
var C = (typeof globalThis !== 'undefined' && globalThis.__cmxDataComp) || host.__cmxClasses;
if (!C) { alert('CMX 数据类尚未加载，请稍后重试'); return; }
var CmxColumnModel = C.CmxColumnModel, CmxColumn = C.CmxColumn;
var root = host.shadowRoot;
var grid = root.querySelector('#treeGrid');

// 列模型：cf_gl_account 会计科目字典字段；iconCol 指向 icon 字段 → 树列单元格前缀 <ui5-icon>
var model = new CmxColumnModel({
  datasetId: 'cf_gl_account',
  caption: '会计科目',
  iconCol: 'icon',
  members: [
    new CmxColumn({ id: 'name', caption: '科目名称', type: 'text', width: '300px', editMode: 'readonly' }),
    new CmxColumn({ id: 'code', caption: '科目编码', type: 'text', width: '140px', editMode: 'readonly' }),
    new CmxColumn({ id: 'account_type_text', caption: '科目类型', type: 'text', width: '110px', editMode: 'readonly' }),
    new CmxColumn({ id: 'pl_bs_flag', caption: '损益/资负', type: 'text', width: '90px', align: 'center', editMode: 'readonly' }),
    new CmxColumn({ id: 'account_currency_code', caption: '币种', type: 'text', width: '80px', align: 'center', editMode: 'readonly' }),
    new CmxColumn({ id: 'level_no', caption: '层级', type: 'number', width: '70px', align: 'right', editMode: 'readonly' }),
    new CmxColumn({ id: 'is_leaf_text', caption: '末级', type: 'text', width: '70px', align: 'center', editMode: 'readonly' })
  ]
});

// 科目类型码 → 中文 + 图标（A资产/L负债/E权益/R收入/X费用/C成本）；非末级用文件夹，末级用单据
var TYPE_TEXT = { A: '资产', L: '负债', E: '权益', R: '收入', X: '费用', C: '成本' };
var ICON_BY_TYPE = { A: 'money-bills', L: 'credit-card', E: 'capital-projects', R: 'sales-order', X: 'receipt', C: 'supplier' };
var rowToNode = function (r) {
  var leaf = Number(r.is_leaf) === 1;
  var t = r.account_type_code || r.account_type || '';
  // cf_gl_account 的主键是 code、parent_id 引用父的 code。
  // 这里把 code 同时写入 id：组件默认按 id 做选中/展开/重建层级（parentField 仍是 parent_id，
  // 因 id=code，子行 parent_id 正好指向父行 id），无需改 index，与组件既有 id 语义一致。
  return {
    id: r.code,
    code: r.code,
    parent_id: r.parent_id,
    name: r.name,
    account_type_code: t,
    account_type_text: TYPE_TEXT[t] || t,
    pl_bs_flag: r.pl_bs_flag || '',
    account_currency_code: r.account_currency_code || '',
    level_no: r.level_no,
    is_leaf: r.is_leaf,
    is_leaf_text: leaf ? '是' : '否',
    icon: leaf ? 'document-text' : (ICON_BY_TYPE[t] || 'folder')
  };
};

var applyRows = function (rows) {
  // 顺序：先 setColumnModel（填列 + iconField），再 setOptions（重建表 + 算树列），最后 setData。
  // rowToNode 已把 code 写入 id，故用组件默认 index:'id'；parentField:'parent_id'（父引用子的 code=id）。
  grid.setColumnModel(model);
  grid.setOptions({
    dataTree: true,
    parentField: 'parent_id',
    treeColumn: 'name',
    treeStartExpanded: false,
    selectionMode: 'single',
    movableColumns: true,
    layout: 'fitDataFill'
  });
  grid.setData((rows || []).map(rowToNode));
  host.treeGrid = grid;
  var info = root.querySelector('#treeInfo');
  if (info) info.textContent = '已加载 cf_gl_account 会计科目字典：' + (rows ? rows.length : 0) + ' 个科目（自分级，按 code/parent_id 重建层级）。';
};

// 从字典检索服务拉 cf_gl_account 扁平行（treeMode 省略=平表，组件本地按 code/parent_id 建树）
fetch('/api/dict/cf_gl_account/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ pageSize: 9999 })
}).then(function (resp) {
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  return resp.json();
}).then(function (data) {
  applyRows(data && (data.rows || data.hits || data.items) || []);
}).catch(function (e) {
  var info = root.querySelector('#treeInfo');
  if (info) info.textContent = '加载 cf_gl_account 字典失败：' + (e && e.message || e) + '（请确认门户字典服务 /api/dict 可用）';
});

$data.seq = 0;
`.trim()

const expandAllNodes = `if (host.treeGrid) host.treeGrid.expandAll();`
const collapseAllNodes = `if (host.treeGrid) host.treeGrid.collapseAll();`

const addChildNode = `
if (!host.treeGrid) { alert('请先点「加载数据」'); return; }
var grid = host.treeGrid;
var sel = grid._selectedId;
if (!sel) { alert('请先在树中选择一个父科目，再新增下级科目'); return; }
$data.seq = ($data.seq || 0) + 1;
var n = $data.seq;
// 选中行 id = 父科目 code；新科目 code 以父 code 派生，parent_id 指向父 code，id=code（与 rowToNode 一致）
var childCode = String(sel) + '.N' + n;
var row = { id: childCode, code: childCode, parent_id: sel, icon: 'document-text', name: '新建下级科目 ' + n, account_type_code: '', account_type_text: '', pl_bs_flag: '', account_currency_code: '', level_no: '', is_leaf: 1, is_leaf_text: '是' };
grid.addRow(row);
grid.expandRow(sel);
`.trim()

const removeNode = `
if (!host.treeGrid) { alert('请先点「加载数据」'); return; }
var grid = host.treeGrid;
var sel = grid._selectedId;
if (!sel) { alert('请先选择要删除的科目（将连同其下级科目一并删除）'); return; }
grid.removeRows([sel]);
`.trim()

const echoExpand = `
var root = host.shadowRoot;
var grid = root.querySelector('#treeGrid');
var info = root.querySelector('#treeInfo');
if (!grid || !info) return;
grid.addEventListener('cmx-row-selected', function (e) {
  var r = (e.detail && e.detail.row) || {};
  info.textContent = '已选择：' + (r.name || r.id || '') + '（编码 ' + (r.code || '-') + '）';
});
var onToggle = function (e) {
  var d = e.detail || {};
  var open = e.type === 'cmx-tree-row-expanded';
  info.textContent = (open ? '展开' : '折叠') + '：' + (d.row && d.row.name || d.id || '') + '  ·  当前展开 ' + grid.getExpandedIds().length + ' 个节点';
};
grid.addEventListener('cmx-tree-row-expanded', onToggle);
grid.addEventListener('cmx-tree-row-collapsed', onToggle);
`.trim()

// ── HTML 片段 ──────────────────────────────────────────────────────────────

const HTML_BODY = `<div data-node-id="n-1" style="display:flex;flex-direction:column;width:100%;height:100%;min-height:520px;gap:8px;padding:8px;box-sizing:border-box;background:var(--sapBackgroundColor,#fafafa);">
  <ui5-bar design="Header" accessible-role="Toolbar" data-node-id="n-2">
    <ui5-label slot="startContent" data-node-id="n-2a" wrapping-type="Normal" style="font-weight:800;font-size:1.05rem;color:var(--sapShellTitleColor,var(--sapTitleColor));">cmx-tabulator · 会计科目树（gl_account 自分级字典）</ui5-label>
    <ui5-button design="Emphasized" icon="begin" slot="endContent" accessible-role="Button" data-node-id="n-3" data-eventclick="loadDemoData();">加载科目</ui5-button>
    <ui5-button design="Default" icon="expand-all" slot="endContent" accessible-role="Button" data-node-id="n-4" data-eventclick="expandAllNodes();">全部展开</ui5-button>
    <ui5-button design="Default" icon="collapse-all" slot="endContent" accessible-role="Button" data-node-id="n-5" data-eventclick="collapseAllNodes();">全部折叠</ui5-button>
    <ui5-button design="Positive" icon="add" slot="endContent" accessible-role="Button" data-node-id="n-6" data-eventclick="addChildNode();">新增下级科目</ui5-button>
    <ui5-button design="Negative" icon="delete" slot="endContent" accessible-role="Button" data-node-id="n-7" data-eventclick="removeNode();">删除科目</ui5-button>
  </ui5-bar>
  <ui5-label id="treeInfo" data-node-id="n-8" wrapping-type="Normal" style="font-size:0.8rem;color:var(--sapContent_LabelColor);min-height:1.1rem;padding:0 4px;">点「加载科目」从 /api/dict 拉取 gl_account 会计科目字典（自分级，按 parent_id 重建层级）；选中科目后可新增下级 / 删除（连同下级）。</ui5-label>
  <div data-node-id="n-9" style="flex:1 1 0;min-height:0;display:flex;flex-direction:column;border:1px solid var(--sapGroup_ContentBorderColor,#e0e0e0);border-radius:4px;overflow:hidden;background:var(--sapList_Background,#fff);">
    <cmx-tabulator id="treeGrid" data-cmx-height="100%" style="display:block;width:100%;flex:1;min-height:0;" data-node-id="n-10"></cmx-tabulator>
  </div>
</div>`

// ── 设计时脚本预览（供设计器代码面板显示） ───────────────────────────────────

const SCRIPT_PREVIEW = `<script>
/* 设计时脚本预览 */
/* pageId: ${PAGE_ID} */

function loadDemoData() {
${indent(loadDemoData)}
}

function expandAllNodes() { ${expandAllNodes} }

function collapseAllNodes() { ${collapseAllNodes} }

function addChildNode() {
${indent(addChildNode)}
}

function removeNode() {
${indent(removeNode)}
}
</script>`

// ── __designer_meta__ ───────────────────────────────────────────────────────

const meta = {
  pageData: [{ name: 'seq', type: 'number', defaultValue: '0' }],
  pageFns: [
    { name: 'loadDemoData', params: '', body: loadDemoData, readsVars: [], writesVars: ['seq'] },
    { name: 'expandAllNodes', params: '', body: expandAllNodes, readsVars: [], writesVars: [] },
    { name: 'collapseAllNodes', params: '', body: collapseAllNodes, readsVars: [], writesVars: [] },
    { name: 'addChildNode', params: '', body: addChildNode, readsVars: ['seq'], writesVars: ['seq'] },
    { name: 'removeNode', params: '', body: removeNode, readsVars: [], writesVars: [] }
  ],
  pageServices: [],
  pageDeps: [],
  pageInterfaces: [
    { name: 'initPage', enabled: true, body: 'if (host.loadDemoData) host.loadDemoData();\n' + echoExpand },
    { name: 'onActivate', enabled: true, body: '' },
    { name: 'isDirty', enabled: true, body: 'return false;' },
    { name: 'getState', enabled: true, body: 'return Object.assign({}, $data);' },
    { name: 'validate', enabled: true, body: 'return { valid: true };' }
  ],
  dataSources: [],
  dataFlow: { schema: [], aggregations: [], relations: [] },
  models: []
}

const META_BLOCK = `<script type="application/json" id="__designer_meta__">${JSON.stringify(meta)}</script>`

const FULL = `${HTML_BODY}\n${SCRIPT_PREVIEW}\n${META_BLOCK}\n`

// ── 写文件 ──────────────────────────────────────────────────────────────────

const designerPath = resolve(REPO, 'CMXHTMLDesigner/cmx-node-server/_data/html-pages/sources', `${PAGE_ID}_${TS}.html`)
const portalPath = resolve(REPO, 'CMXPortalManager/cmx-node-server/data/html-pages/sources/_legacy', `${PAGE_ID}.html`)
mkdirSync(dirname(designerPath), { recursive: true })
mkdirSync(dirname(portalPath), { recursive: true })
writeFileSync(designerPath, FULL, 'utf8')
writeFileSync(portalPath, FULL, 'utf8')

console.log('✓ wrote', designerPath)
console.log('✓ wrote', portalPath)
console.log('\nRegister in pages-list.json with:')
console.log(JSON.stringify({ id: PAGE_ID, name: NAME, details: DETAILS, latestHtmlFile: `${PAGE_ID}_${TS}.html`, timestamp: TS }, null, 2))

function indent (code, pad = '  ') {
  return code.split('\n').map((l) => (l ? pad + l : l)).join('\n')
}
