# voucher-neo.html 页面函数说明

本文档说明 `..` 中设计器元数据 `pageFns` 定义的页面脚本函数。

说明范围只覆盖当前页面脚本，不修改页面源码。代码块中的中文注释用于解释逻辑，不代表页面内已经写入这些注释。

## 总览

当前页面共有 21 个函数，主要分为六类：

| 分类 | 函数 |
| --- | --- |
| 凭证状态与按钮 | `refreshVoucherSeal`, `setVoucherStatus`, `syncVoucherActionButtons`, `setVoucherEditMode`, `toggleVoucherEdit` |
| 凭证动作 | `doSaveVoucher`, `doAuditVoucher`, `doPostVoucher`, `exportMsJson` |
| HUD 和汇总显示 | `refreshNeoHud` |
| 初始化 | `initVoucher` |
| 主从行和动态列 | `onEntrySelected`, `applyDetailSchema`, `onDetailColumnsChanged` |
| 分录维护 | `addEntry`, `removeEntry`, `swapEntryDebitCredit`, `addAuxDetail`, `removeAuxDetail` |
| 字典列配置 | `setupVoucherDictColumns`, `normalizeDetailDictColumns` |

## 1. refreshVoucherSeal()

### 作用

刷新右上角凭证状态印章的显示内容，并在刷新后同步操作按钮状态。

### 主要逻辑

- 初始化或复用 `host.VOUCHER_STATUS_MAP`。
- 根据 `$data.voucherStatus` 解析当前状态。
- 将非法状态回退到 `draft`。
- 更新 `#voucherStatusSeal` 的 `data-status` 和 `aria-label`。
- 将状态中文标签逐字渲染到 `.neo-seal-text`。
- 调用 `syncVoucherActionButtons()` 同步保存、审核、过账、编辑按钮状态。

### 带注释代码

```js
// 初始化状态字典。这里挂在 host 上，避免每次刷新都重新定义一份业务状态表。
host.VOUCHER_STATUS_MAP = host.VOUCHER_STATUS_MAP || {
  draft: { label: '草稿', status: 'draft' },
  void: { label: '作废', status: 'void' },
  saved: { label: '已存', status: 'saved' },
  audited: { label: '已审', status: 'audited' },
  posted: { label: '过账', status: 'posted' }
};

// 从页面数据中读取当前状态，缺省为草稿，并统一转成小写。
var st = ($data.voucherStatus || 'draft').toLowerCase();

// 找到状态元信息。如果状态非法，则回退为草稿。
var meta = host.VOUCHER_STATUS_MAP[st] || host.VOUCHER_STATUS_MAP.draft;

// 将规范化后的状态写回页面数据，确保后续函数读取的是合法状态。
$data.voucherStatus = meta.status;

// 获取状态印章 DOM。没有渲染出来时直接退出。
var el = host.shadowRoot && host.shadowRoot.querySelector('#voucherStatusSeal');
if (!el) return;

// 更新状态样式钩子和无障碍标签。
el.setAttribute('data-status', meta.status);
el.setAttribute('aria-label', '凭证状态：' + meta.label);

// 状态文字按单字拆开渲染，便于印章样式做竖排或分字布局。
var box = el.querySelector('.neo-seal-text');
if (box) {
  box.innerHTML = '';
  meta.label.split('').forEach(function (ch) {
    var s = document.createElement('span');
    s.textContent = ch;
    box.appendChild(s);
  });
}

// 状态变更后，同步动作按钮的可用状态和流程标记。
if (host.syncVoucherActionButtons) host.syncVoucherActionButtons();
```

## 2. setVoucherStatus(status)

### 作用

设置凭证状态，并同步写入主数据行 `head.voucherStatus`，最后刷新印章。

### 主要逻辑

- 校验传入状态，不合法则回退为 `draft`。
- 更新 `$data.voucherStatus`。
- 如果 `CmxMasterSlave` 已初始化，则找到第一条 `head` 行并写入 `voucherStatus`。
- 调用 `refreshVoucherSeal()` 统一刷新状态 UI。

### 带注释代码

```js
// 初始化或复用状态字典。
host.VOUCHER_STATUS_MAP = host.VOUCHER_STATUS_MAP || {
  draft: { label: '草稿', status: 'draft' },
  void: { label: '作废', status: 'void' },
  saved: { label: '已存', status: 'saved' },
  audited: { label: '已审', status: 'audited' },
  posted: { label: '过账', status: 'posted' }
};

// 规范化传入状态。
var key = String(status || 'draft').toLowerCase();

// 非法状态回退为草稿。
if (!host.VOUCHER_STATUS_MAP[key]) key = 'draft';

// 更新页面状态变量。
$data.voucherStatus = key;

// 同步写入主从模型中的 head 首行，使导出数据也包含最新状态。
var ms = host.ms;
if (ms && ms.getFlatData) {
  var h0 = (ms.getFlatData().head || [])[0];
  if (h0 && h0.id && ms.getRow) {
    var row = ms.getRow('head', h0.id);

    // CmxRowSet 优先用 set 触发内部变更通知；普通对象则直接赋值。
    if (row && typeof row.set === 'function') row.set('voucherStatus', key);
    else if (row) row.voucherStatus = key;
  }
}

// 使用统一入口刷新印章和按钮。
host.refreshVoucherSeal();
```

## 3. syncVoucherActionButtons()

### 作用

根据当前凭证状态刷新动作按钮状态，包括是否禁用、是否已完成、当前流程节点。

### 主要逻辑

- `void` 状态禁用保存、审核、过账、编辑。
- `posted` 状态禁用编辑。
- 按 `draft -> saved -> audited -> posted` 流程设置 `data-done`。
- 按当前状态设置 `data-current`。

### 带注释代码

```js
// 页面 Shadow DOM 是所有按钮查询的根。
var root = host.shadowRoot;
if (!root) return;

// 读取状态，计算几个关键状态布尔值。
var st = ($data.voucherStatus || 'draft').toLowerCase();
var voided = st === 'void';
var posted = st === 'posted';

// 找到页面顶部动作按钮。
var saveBtn = root.querySelector('#voucherSaveBtn');
var auditBtn = root.querySelector('#voucherAuditBtn');
var postBtn = root.querySelector('#voucherPostBtn');
var editBtn = root.querySelector('#voucherEditBtn');

// 统一启用或禁用按钮，并同步样式类。
function dis(el, on) {
  if (!el) return;
  if (on) { el.setAttribute('disabled', ''); el.classList.add('is-disabled'); }
  else { el.removeAttribute('disabled'); el.classList.remove('is-disabled'); }
}

// 作废或过账后不可编辑。作废后保存、审核、过账都不可用。
dis(editBtn, voided || posted);
dis(saveBtn, voided);
dis(auditBtn, voided);
dis(postBtn, voided);

// 清理流程按钮上的旧状态标记。
[saveBtn, auditBtn, postBtn].forEach(function (el) {
  if (!el) return;
  el.removeAttribute('data-done');
  el.removeAttribute('data-current');
});

// 定义凭证流转顺序，用于判断哪些节点已经完成。
var order = ['draft', 'saved', 'audited', 'posted'];
var idx = order.indexOf(st);
if (idx < 0) idx = 0;

// 已走过的节点设置 data-done，给 CSS 做完成态显示。
if (saveBtn && idx >= 1) saveBtn.setAttribute('data-done', 'true');
if (auditBtn && idx >= 2) auditBtn.setAttribute('data-done', 'true');
if (postBtn && idx >= 3) postBtn.setAttribute('data-done', 'true');

// 当前待执行节点设置 data-current。
if (!voided) {
  if (st === 'draft' && saveBtn) saveBtn.setAttribute('data-current', 'true');
  else if (st === 'saved' && auditBtn) auditBtn.setAttribute('data-current', 'true');
  else if (st === 'audited' && postBtn) postBtn.setAttribute('data-current', 'true');
}
```

## 4. doSaveVoucher()

### 作用

演示保存动作：导出当前主从数据、设置状态为 `saved`，并退出编辑态。

### 带注释代码

```js
// 没有主从协调器时，说明示例尚未初始化。
if (!host.ms) { alert('请先加载示例'); return; }

// 演示保存通过导出 JSON 表达。
if (host.exportMsJson) host.exportMsJson();

// 保存后状态变为已存。
host.setVoucherStatus('saved');

// 保存后退出编辑态。
if (host.setVoucherEditMode) host.setVoucherEditMode(false);

// 给用户演示提示。
alert('已保存（演示：数据已导出为 JSON）');
```

## 5. doAuditVoucher()

### 作用

演示审核动作：校验借贷是否平衡，平衡则设置状态为 `audited` 并退出编辑态。

### 带注释代码

```js
// 示例未初始化则不能审核。
if (!host.ms) { alert('请先加载示例'); return; }

// 取平铺数据，便于直接遍历 items 分录。
var flat = host.ms.getFlatData ? host.ms.getFlatData() : {};
var items = flat.items || [];

// 汇总借贷金额。
var debit = 0, credit = 0;
items.forEach(function (r) { debit += Number(r.debit) || 0; credit += Number(r.credit) || 0; });

// 审核前校验借贷平衡。0.005 是金额小数误差容忍值。
if (Math.abs(debit - credit) >= 0.005) { alert('借贷不平衡，无法审核（演示校验）'); return; }

// 审核通过后更新状态并退出编辑。
host.setVoucherStatus('audited');
if (host.setVoucherEditMode) host.setVoucherEditMode(false);

alert('审核完成（演示）');
```

## 6. doPostVoucher()

### 作用

演示过账动作：作废凭证不能过账，其他状态可直接设置为 `posted` 并退出编辑态。

### 带注释代码

```js
// 示例未初始化则不能过账。
if (!host.ms) { alert('请先加载示例'); return; }

// 作废状态不可过账。
var st = ($data.voucherStatus || 'draft').toLowerCase();
if (st === 'void') { alert('凭证已作废'); return; }

// 设置过账状态并退出编辑。
host.setVoucherStatus('posted');
if (host.setVoucherEditMode) host.setVoucherEditMode(false);

alert('过账完成（演示）');
```

## 7. exportMsJson()

### 作用

将 `CmxMasterSlave` 当前数据导出为 JSON 文件。下载失败时退化为控制台输出。

### 带注释代码

```js
// 获取主从协调器。
var ms = host.ms;

// exportKeyValue 是当前页面使用的导出格式。
if (!ms || typeof ms.exportKeyValue !== 'function') { alert('协调器未初始化或不支持导出'); return; }

// 导出数据并格式化为 JSON 字符串。
var data = ms.exportKeyValue();
var text = JSON.stringify(data, null, 2);

try {
  // 浏览器端创建临时 Blob 下载。
  var blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = (host.__pageId || 'voucher-neo') + '-export.json';

  // 触发下载后立即清理临时 DOM 和 ObjectURL。
  document.body.appendChild(a); a.click();
  setTimeout(function(){ document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
} catch (e) {
  // 某些环境下下载可能失败，保底输出到控制台。
  console.log(text);
  alert('导出数据已打印到控制台（下载失败）');
}
```

## 8. refreshNeoHud()

### 作用

刷新页面顶部 HUD 信息，包括借方合计、贷方合计、平衡状态、交易混合环、凭证号、分录数、凭证类型文本，并同步状态印章。

### 带注释代码

```js
// 金额格式化工具，固定两位小数。
function fmt(n){ return (Number(n)||0).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2}); }

// 主从协调器和页面 DOM 必须都存在。
var ms = host.ms, root = host.shadowRoot;
if (!ms || !root) return;

// 汇总凭证分录借贷金额。
var debit = 0, credit = 0, cnt = 0;
var flat = ms.getFlatData ? ms.getFlatData() : {};
(flat.items || []).forEach(function(r){ debit += Number(r.debit)||0; credit += Number(r.credit)||0; cnt++; });

// 判断借贷平衡。
var diff = debit - credit;
var balanced = Math.abs(diff) < 0.005;

// 取凭证头首行，用于显示凭证号、凭证类型。
var head = (flat.head && flat.head[0]) || {};

// 找到 HUD 中的目标元素。
var elD = root.querySelector('#kpiDebit'), elC = root.querySelector('#kpiCredit'), elB = root.querySelector('#kpiBalance');
var elRing = root.querySelector('#txMixRing'), elBadge = root.querySelector('#voucherFlowBadge');
var elNo = root.querySelector('#neoVoucherNo'), elLines = root.querySelector('#kpiLines'), elVt = root.querySelector('#neoVoucherTypeText');

// 凭证类型码到中文名称的映射。
host.VOUCHER_TYPE_MAP = host.VOUCHER_TYPE_MAP || { JK: '记账凭证', FK: '付款凭证', SK: '收款凭证', ZK: '转账凭证' };
var vtCode = head.voucherType || '';
var vtLabel = host.VOUCHER_TYPE_MAP[vtCode] || vtCode || '';

// 更新借贷金额。
if (elD) elD.textContent = fmt(debit);
if (elC) elC.textContent = fmt(credit);

// 更新平衡状态，不平衡时显示差额。
if (elB) {
  elB.textContent = balanced ? '平衡 ✓' : fmt(Math.abs(diff));
  elB.className = 'neo-kpi-val ' + (balanced ? 'neo-ok' : 'neo-warn');
  elB.setAttribute('title', balanced ? '借贷平衡' : ('借贷差额 ' + fmt(Math.abs(diff))));
}

// 用借方占借贷总额比例绘制圆环渐变。
if (elRing) {
  var pct = (debit + credit) > 0 ? Math.round(debit / (debit + credit) * 100) : 50;
  elRing.style.background = 'conic-gradient(var(--neo-cyan,#00b4d8) 0% ' + pct + '%, var(--neo-violet,#7c3aed) ' + pct + '% 100%)';
}

// 更新平衡徽标。
if (elBadge) {
  elBadge.textContent = balanced ? 'BAL' : 'DIF';
  elBadge.setAttribute('data-state', balanced ? 'ok' : 'warn');
  elBadge.setAttribute('title', balanced ? '借贷平衡' : '借贷不平衡');
}

// 更新凭证类型、凭证号和分录数量。
if (elVt) elVt.textContent = vtLabel ? ' - ' + vtLabel : '';
if (elNo) elNo.textContent = head.voucherNo || '—';
if (elLines) elLines.textContent = cnt + ' 条分录';

// HUD 刷新时顺带刷新凭证状态印章。
if (host.refreshVoucherSeal) host.refreshVoucherSeal();
```

## 9. initVoucher()

### 作用

初始化凭证演示数据、配置 Grid、绑定事件、加载首条分录的辅助核算列 schema，并进入只读状态。

### 带注释代码

```js
// 主从协调器必须存在。
var ms = host.ms;
if (!ms) { alert('协调器尚未初始化'); return; }

// 清理弹性组合缓存。
host.__flexibleCombinationCache = {};

// 配置会计分录中的科目字典列。
host.setupVoucherDictColumns();

// 初始化状态为草稿。
$data.voucherStatus = 'draft';

// 示例凭证头。
var demoHeads = [{ id:'h1', period:'2026-05', orgUnit:'总部财务部', voucherDate:'2026-05-28', voucherType:'ZK', voucherNo:'ZK-202605-0001', preparer:'李会计', auditor:'王主管', payerInfo:'出纳：张三 / 现金支付', voucherStatus:'draft' }];

// 示例凭证分录。
var demoItems = [
  { id:'i1', headId:'h1', acctCode:'1001', acctName:'库存现金', summary:'收到客户回款', debit:50000, credit:0 },
  { id:'i2', headId:'h1', acctCode:'1122', acctName:'应收账款', summary:'冲销应收', debit:0, credit:50000 },
  { id:'i3', headId:'h1', acctCode:'6601', acctName:'管理费用', summary:'差旅报销', debit:1200, credit:0 },
  { id:'i4', headId:'h1', acctCode:'1002', acctName:'银行存款', summary:'现金转入', debit:0, credit:1200 }
];

// 示例辅助分录。
var demoDetails = [
  { id:'d1', itemId:'i1', amount:50000, remark:'5 月预付' },
  { id:'d2', itemId:'i2', amount:50000, customer:'C-001', project:'P-2026-001', remark:'冲销应收' },
  { id:'d3', itemId:'i3', amount:1200, department:'D-100', project:'P-2026-002', remark:'上海差旅' },
  { id:'d4', itemId:'i4', amount:1200, bankAccount:'BOC-6228', remark:'ATM 取现' }
];

// 按平铺数据写入主从协调器，由 dataFlow relation 建立 head-items-details 关系。
ms.setFlatData({ head:demoHeads, items:demoItems, details:demoDetails });

// 找到两个 Grid。
var root = host.shadowRoot;
var itemGrid = root.querySelector('#itemGrid');
var detailGrid = root.querySelector('#detailGrid');

// 配置选择、填充高度和序号列。
itemGrid.setOptions({ selectionMode:'single', fillHeight:true, showRowIndex:true });
detailGrid.setOptions({ selectionMode:'single', fillHeight:true, showRowIndex:true });

// 配置合计行。
itemGrid.setTotals({ label:'合计', columns:['debit','credit'] });
detailGrid.setTotals({ label:'合计', columns:['amount'] });

// 缓存 Grid 引用，后续页面函数直接使用。
host.itemGrid = itemGrid; host.detailGrid = detailGrid;

// 初始化新增行计数器。
$data.entryCounter = 4; $data.detailCounter = 4;

// 辅助分录列变化后，需要重新规范化字典列并保持编辑状态。
if (!host.__detailColumnsWired) {
  host.__detailColumnsWired = true;
  detailGrid.addEventListener('cmx-columns-changed', function(){ host.onDetailColumnsChanged(); });
}

// 会计分录金额或内容变化后刷新 HUD。
if (!itemGrid.__neoHudWired) {
  itemGrid.__neoHudWired = true;
  itemGrid.addEventListener('cmx-cell-changed', function(){ host.refreshNeoHud(); });
}

// 根据首条分录科目加载辅助核算动态列。
host.applyDetailSchema(demoItems[0] && demoItems[0].acctCode);

// 刷新 HUD、设置只读态、刷新印章和按钮。
host.refreshNeoHud();
host.setVoucherEditMode(false);
host.refreshVoucherSeal();
if (host.syncVoucherActionButtons) host.syncVoucherActionButtons();

// 兜底定时刷新 HUD，适合聚合或外部回写未触发事件的演示场景。
if (!host.__neoHudTimer) host.__neoHudTimer = setInterval(function(){ host.refreshNeoHud(); }, 800);
```

## 10. onEntrySelected(e)

### 作用

会计分录 Grid 选中行变化时，根据选中分录的科目编号加载对应的辅助核算 schema。

### 带注释代码

```js
// 从事件详情中取选中行 id。
var rowId = e && e.detail && e.detail.id;
if (!rowId || !host.ms) return;

// 从主从协调器中取当前会计分录行。
var row = host.ms.getRow ? host.ms.getRow('head.items', rowId) : null;

// 使用该分录的科目编号刷新辅助核算列。
host.applyDetailSchema(row && row.acctCode);
```

## 11. applyDetailSchema(acctCode)

### 作用

调用 `FlexibleCombination` 按科目编号加载辅助核算动态列。

### 带注释代码

```js
// detailFlexibleCombination 是页面模型中定义的 FlexibleCombination 实例。
if (!host.detailFlexibleCombination) return;

// account 作为锚点维度传入后端规则，返回对应科目的辅助核算列。
host.detailFlexibleCombination.loadByAnchor({ account: acctCode || '' });
```

## 12. addEntry()

### 作用

新增一条会计分录。仅编辑态可用。

### 带注释代码

```js
// 非编辑态禁止新增。
if (!$data.voucherEditing) { alert('请先进入编辑状态'); return; }

// 示例未初始化时不能新增。
if (!host.ms) { alert('请先加载示例'); return; }

// 使用计数器生成演示 id。
$data.entryCounter = ($data.entryCounter || 4) + 1;
var n = $data.entryCounter;

// 向会计分录 Grid 新增一行。headId 固定指向当前演示凭证头 h1。
host.itemGrid.addRow({ id:'i'+n, headId:'h1', acctCode:'', acctName:'', summary:'', debit:0, credit:0 });

// 新增后刷新 HUD。
host.refreshNeoHud();
```

## 13. removeEntry()

### 作用

删除当前选中的会计分录。仅编辑态可用。

### 带注释代码

```js
// 非编辑态禁止删除。
if (!$data.voucherEditing) { alert('请先进入编辑状态'); return; }

// 示例未初始化时不能删除。
if (!host.ms) { alert('请先加载示例'); return; }

// 从 Grid 内部状态读取当前选中行。
var selectedId = host.itemGrid && host.itemGrid._selectedId;
if (!selectedId) { alert('请先选择一条会计分录'); return; }

// 删除选中分录。
host.itemGrid.removeRows([selectedId]);

// 删除后刷新 HUD。
host.refreshNeoHud();
```

## 14. swapEntryDebitCredit()

### 作用

交换当前选中会计分录的借方金额和贷方金额。仅编辑态可用。

### 带注释代码

```js
// 非编辑态禁止操作。
if (!$data.voucherEditing) { alert('请先进入编辑状态'); return; }
if (!host.ms) { alert('请先加载示例'); return; }

// 必须先选中一条会计分录。
var selectedId = host.itemGrid && host.itemGrid._selectedId;
if (!selectedId) { alert('请先选择一条会计分录'); return; }

// 取主从模型中的真实行对象。
var row = host.ms.getRow ? host.ms.getRow('head.items', selectedId) : null;
if (!row) { alert('未找到所选分录'); return; }

// 读取借贷金额。
var debit = Number(row.debit) || 0;
var credit = Number(row.credit) || 0;

// 借贷相同则无需交换。
if (debit === credit) return;

// CmxRowSet 优先用 setValues，一次性触发多字段变更；其次用 set；最后回退普通赋值。
if (typeof row.setValues === 'function') row.setValues({ debit: credit, credit: debit });
else if (typeof row.set === 'function') { row.set('debit', credit); row.set('credit', debit); }
else { row.debit = credit; row.credit = debit; }

// 强制刷新会计分录视图，再刷新 HUD。
if (host.ms.refresh) host.ms.refresh('head.items');
if (host.refreshNeoHud) host.refreshNeoHud();
```

## 15. addAuxDetail()

### 作用

给当前选中的会计分录新增一条辅助分录。仅编辑态可用。

### 带注释代码

```js
// 非编辑态禁止新增。
if (!$data.voucherEditing) { alert('请先进入编辑状态'); return; }
if (!host.ms) { alert('请先加载示例'); return; }

// 辅助分录必须挂在当前选中的会计分录下。
var selectedId = host.itemGrid && host.itemGrid._selectedId;
if (!selectedId) { alert('请先选择一条会计分录'); return; }

// 生成演示 id。
$data.detailCounter = ($data.detailCounter || 4) + 1;
var n = $data.detailCounter;

// 新增辅助分录，itemId 指向当前会计分录。
host.detailGrid.addRow({ id:'d'+n, itemId:selectedId, amount:0 });
```

## 16. removeAuxDetail()

### 作用

删除当前选中的辅助分录。仅编辑态可用。

### 带注释代码

```js
// 非编辑态禁止删除。
if (!$data.voucherEditing) { alert('请先进入编辑状态'); return; }
if (!host.ms) { alert('请先加载示例'); return; }

// 必须先选中一条辅助分录。
var selectedId = host.detailGrid && host.detailGrid._selectedId;
if (!selectedId) { alert('请先选择一条辅助分录'); return; }

// 删除选中辅助分录。
host.detailGrid.removeRows([selectedId]);
```

## 17. onDetailColumnsChanged()

### 作用

辅助分录动态列变化后，重新规范化其中的字典列，恢复合计行和当前编辑态。

### 带注释代码

```js
// detailGrid 不存在时退出。
if (!host.detailGrid) return;

// FlexibleCombination 可能带来 select/options 列，这里统一转成 dict-select 显示与编辑。
host.normalizeDetailDictColumns();

// 动态换列后恢复金额合计行。
host.detailGrid.setTotals({ label:'合计', columns:['amount'] });

// 动态换列可能重建 Grid 列配置，因此需要重新应用当前编辑态。
if (typeof host.setVoucherEditMode === 'function') host.setVoucherEditMode($data.voucherEditing);
```

## 18. setupVoucherDictColumns()

### 作用

配置凭证分录 Grid 中的科目编号列，使其使用 `cmx-dict-select` 编辑器并绑定 GL 科目字典。

### 主要逻辑

- 从 `globalThis.__cmxDataComp` 或 `host.__cmxClasses` 获取公共组件类。
- 定义字典弹窗列 `stdCols()`。
- 创建 `host.makeGlAccountSource()`，优先使用公共 `createDictDataSource()`。
- 找到 `itemModel` 中的 `acctCode` 列，配置为 `dict-select`。
- 设置科目编号列显示 `code`，并将 `item_name` 回写到 `acctName`。
- 将 `acctName` 列设为只读。

### 带注释代码

```js
// 获取 cmx-data-comp 的公共导出。
var C = (typeof globalThis !== 'undefined' && globalThis.__cmxDataComp) || host.__cmxClasses;
if (!C) return;

// 定义会计科目帮助弹窗中的显示列。
function stdCols() {
  return [
    new C.CmxColumn({ id: 'item_code', caption: '编码', type: 'text', width: '110px', editMode: 'readonly' }),
    new C.CmxColumn({ id: 'item_name', caption: '名称', type: 'text', width: '160px', editMode: 'readonly' }),
    new C.CmxColumn({ id: 'status', caption: '状态', type: 'number', width: '70px', editMode: 'readonly' })
  ];
}

// 创建 GL 科目字典数据源。
host.makeGlAccountSource = function () {
  // 新版优先使用公共字典数据源工厂，页面只声明服务名和字段映射。
  if (typeof C.createDictDataSource === 'function') {
    return C.createDictDataSource(host, {
      id: 'gl_account', service: 'searchDictGlAccount', keyField: 'item_code', labelField: 'item_name', pageSize: 50
    });
  }

  // 兼容旧运行时：没有公共工厂时，在页面内临时构造同等 DataSource。
  return {
    keyField: 'item_code', labelField: 'item_name', pageSize: 50,
    search: function (q, o) {
      o = o || {};
      return host.searchDictGlAccount({ q: q || '', page: o.page || 1, pageSize: o.pageSize || 50 }, { signal: o.signal })
        .then(function (res) { return (res && res.rows) ? res.rows : []; });
    },
    loadByKeys: function (keys) {
      keys = (keys || []).filter(function (x) { return x != null && String(x) !== ''; });
      if (!keys.length) return Promise.resolve([]);
      return host.searchDictGlAccount({ filters: { item_code: keys }, page: 1, pageSize: Math.max(20, keys.length) })
        .then(function (res) { return (res && res.rows) ? res.rows : []; });
    }
  };
};

// 找到会计分录列模型中的科目编号列。
var acctCol = host.itemModel && host.itemModel.findById && host.itemModel.findById('acctCode');
if (acctCol) {
  // 使用 dict-select 类型作为 Grid 编辑器。
  acctCol.type = 'dict-select';
  acctCol.width = acctCol.width || '130px';

  // 配置 GL 科目字典字段映射、显示方式和回写规则。
  acctCol.editSettings = Object.assign({}, acctCol.editSettings || {}, {
    dictCode: 'gl_account', idCol: 'id', codeCol: 'item_code', labelCol: 'item_name', parentCol: 'parent_id',
    hierarchical: true, helpLayout: 'grid', valueField: 'item_code', displayMode: 'code',
    writeBack: { acctCode: 'item_code', acctName: 'item_name', acctId: 'id' },
    columns: stdCols(), dataSource: host.makeGlAccountSource(), dictTitle: '选择会计科目'
  });
}

// 科目名称列由科目选择回写，不允许直接编辑。
var nameCol = host.itemModel && host.itemModel.findById && host.itemModel.findById('acctName');
if (nameCol) nameCol.editMode = 'readonly';
```

## 19. normalizeDetailDictColumns()

### 作用

将辅助分录动态列中的本地枚举列规范化为 `dict-select`，并设置为 `code-label` 显示。

### 主要逻辑

- 优先使用公共 `createLocalDictDataSource()`。
- 兼容旧运行时，在页面内构造本地 DataSource。
- 递归遍历 `detailModel.members`，支持分组列。
- 对带 `options` 的字段改成 `dict-select`。
- 设置 `valueField: code` 和 `displayMode: code-label`。

### 带注释代码

```js
// 获取 cmx-data-comp 公共导出。
var C = (typeof globalThis !== 'undefined' && globalThis.__cmxDataComp) || host.__cmxClasses;

// 把字段 options 转换成 dict-select 可消费的本地 DataSource。
function localSource(options) {
  // 新版优先使用公共本地字典数据源工厂。
  if (C && typeof C.createLocalDictDataSource === 'function') return C.createLocalDictDataSource(options, { keyField: 'code', labelField: 'name' });

  // 兼容旧运行时：手动标准化 options。
  var rows = (options || []).map(function (o) {
    var code = o && o.value != null ? o.value : (o && o.code != null ? o.code : '');
    var name = o && o.label != null ? o.label : (o && o.name != null ? o.name : code);
    return Object.assign({}, o || {}, { id: code, code: code, name: name });
  });

  // 本地 DataSource 支持 search 和 loadByKeys。
  return {
    keyField: 'code', labelField: 'name', pageSize: 50,
    search: function (q) {
      q = String(q || '').trim().toLowerCase();
      return Promise.resolve(!q ? rows.slice() : rows.filter(function (r) {
        return String(r.code || '').toLowerCase().indexOf(q) >= 0 || String(r.name || '').toLowerCase().indexOf(q) >= 0;
      }));
    },
    loadByKeys: function (keys) {
      var set = {};
      (keys || []).forEach(function (k) { set[String(k)] = true; });
      return Promise.resolve(rows.filter(function (r) { return set[String(r.code)]; }));
    }
  };
}

// 递归遍历列模型成员。FlexibleCombination 可能返回分组列，所以要处理 members。
function walk(members) {
  (members || []).forEach(function (m) {
    if (!m) return;
    if (Array.isArray(m.members)) { walk(m.members); return; }

    // 读取字段编辑配置和枚举 options。
    var es = m.editSettings || {};
    var options = es.options || m.options;
    if (!options || !options.length) return;

    // 带 options 的辅助核算字段统一转为 dict-select。
    if (m.type !== 'dict-select') m.type = 'dict-select';
    m.editMode = 'input';

    // code 为写回值，code-label 为显示格式。
    m.editSettings = Object.assign({}, es, {
      dictCode: es.dictCode || m.id, idCol: 'code', codeCol: 'code', labelCol: 'name',
      valueField: 'code', displayMode: 'code-label', helpLayout: es.helpLayout || 'grid',
      dataSource: es.dataSource || localSource(options)
    });
  });
}

// 对辅助分录列模型执行规范化。
if (host.detailModel && Array.isArray(host.detailModel.members)) walk(host.detailModel.members);
```

## 20. setVoucherEditMode(flag)

### 作用

统一切换凭证页面编辑态。现在主要通过 `host.ms.setEditable(editing)` 统一驱动已绑定的 form/grid，页面脚本只保留编辑按钮和工具按钮状态同步。

### 带注释代码

```js
// 规范化编辑态布尔值，并写入页面数据。
var editing = !!flag;
$data.voucherEditing = editing;
host.__voucherEditing = editing;

// 新版主从协调器支持统一 setEditable，会同步所有绑定的 cmx-ui5-form 和 cmx-revo-grid。
if (host.ms && typeof host.ms.setEditable === 'function') {
  host.ms.setEditable(editing);
} else {
  // 兼容旧运行时：只对当前页面两个 Grid 单独设置编辑态。
  [host.itemGrid, host.detailGrid].forEach(function (grid) {
    if (!grid) return;
    if (typeof grid.setEditable === 'function') grid.setEditable(editing);
    else if (typeof grid.setOptions === 'function') grid.setOptions({ editable: editing, readonly: !editing });
  });
}

// 更新编辑按钮外观。
var root = host.shadowRoot;
if (!root) return;
var btn = root.querySelector('#voucherEditBtn');
if (btn) {
  var sp = btn.querySelector('span');
  if (sp) sp.textContent = editing ? '退' : '编';
  btn.setAttribute('title', editing ? '退出编辑' : '进入编辑');
  if (editing) btn.classList.add('is-active'); else btn.classList.remove('is-active');
}

// 编辑态才允许新增、删除、借贷互换等行维护动作。
['addEntry', 'removeEntry', 'swapEntryDebitCredit', 'addAuxDetail', 'removeAuxDetail'].forEach(function (fnName) {
  root.querySelectorAll('[data-eventclick="' + fnName + '();"]').forEach(function (el) {
    if (editing) { el.removeAttribute('disabled'); el.classList.remove('is-disabled'); }
    else { el.setAttribute('disabled', ''); el.classList.add('is-disabled'); }
  });
});

// 编辑态切换后，结合凭证状态再次同步顶部动作按钮。
if (host.syncVoucherActionButtons) host.syncVoucherActionButtons();
```

## 21. toggleVoucherEdit()

### 作用

切换进入或退出编辑态。已过账或已作废的凭证禁止进入编辑。

### 带注释代码

```js
// 读取当前凭证状态。
var st = ($data.voucherStatus || 'draft').toLowerCase();

// 已过账和已作废不可编辑。
if (st === 'posted' || st === 'void') { alert('当前状态不可编辑'); return; }

// 反转当前编辑态。
host.setVoucherEditMode(!$data.voucherEditing);
```

## 可以继续公共化的脚本

从当前函数看，已经有一部分逻辑被抽到公共组件能力中，例如字典数据源和主从编辑态。后续仍可继续提炼：

| 当前函数 | 可提炼方向 |
| --- | --- |
| `refreshVoucherSeal`, `syncVoucherActionButtons`, `setVoucherStatus` | 可抽成通用单据状态模型或状态轨组件 |
| `doSaveVoucher`, `doAuditVoucher`, `doPostVoucher` | 可抽成单据动作流服务，页面只定义动作规则 |
| `refreshNeoHud` | 可抽成凭证 KPI/HUD 组件，接受主从数据路径和金额字段配置 |
| `addEntry`, `removeEntry`, `addAuxDetail`, `removeAuxDetail` | 可抽成 Grid 行维护工具条能力 |
| `swapEntryDebitCredit` | 可作为财务凭证分录 Grid 的领域动作 |
| `initVoucher` | 可拆为演示数据装载器、Grid 初始化器、事件绑定器 |

