# cmx-tabulator 树形表格（treegrid）指南

`<cmx-tabulator>` 在 Tabulator 6 原生 `dataTree` 基础上，借鉴 `cmx-revo-grid`（主题 +
`CmxColumnModel`/`CmxDataSet` 绑定）与 `cmx-web-treeview`（扁平行→层级、展开态保持、`iconCol`
图标）两个组件的模式，提供一套 cmx 风格的树形表格能力。

## 一、快速开始

```html
<cmx-tabulator id="treeGrid" data-cmx-height="100%" style="display:block;height:100%;"></cmx-tabulator>
```

```js
var C = (typeof globalThis !== 'undefined' && globalThis.__cmxDataComp) || host.__cmxClasses;
var grid = host.shadowRoot.querySelector('#treeGrid');

var model = new C.CmxColumnModel({
  datasetId: 'orgTree',
  iconCol: 'icon',                        // 树列单元格前缀 <ui5-icon>（同 cmx-web-treeview）
  members: [
    new C.CmxColumn({ id: 'name', caption: '机构', type: 'text', width: '280px' }),
    new C.CmxColumn({ id: 'headcount', caption: '人数', type: 'number', align: 'right' }),
  ],
});

// 扁平行（parentId 外键）——组件内部经 lib/cmx-tree-data 归一为嵌套树
var rows = [
  { id: 'g1', parentId: null, icon: 'building',  name: '集团总部', headcount: 1280 },
  { id: 'd1', parentId: 'g1', icon: 'org-chart', name: '财务中心', headcount: 86 },
  { id: 't1', parentId: 'd1', icon: 'group',     name: '总账科',   headcount: 24 },
];

// 顺序：setColumnModel（填列 + iconField）→ setOptions（重建表 + 算树列）→ setData
grid.setColumnModel(model);
grid.setOptions({ dataTree: true, parentField: 'parentId', treeColumn: 'name', treeStartExpanded: true, selectionMode: 'single' });
grid.setData(rows);
```

### 接真实自分级字典（gl_account 会计科目）

演示页 `tabulator-treegrid-demo` 用模型中心 dct 数据服务 `POST /api/dct/data/search` 拉 `gl_account`
（`hierarchical:true`，**`idField:code`** / `parentField:parent_id`）。字典返回 ApiResp 信封
（`data.rows` 为**扁平行**，子行 `parent_id` 指向父行的 `code`，根为 `null`），组件本地重建层级——
无需后端预嵌套：

```js
fetch('/api/dct/data/search?domain=fi&application=cmxfico&module=gl&dict=gl_account&file=cmxfico_dct_meta_v3.json', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ pageSize: 9999 })        // 平表装载；组件本地建树
}).then(r => r.json()).then(data => {
  // 该字典主键是 code（非 id）。rowToNode 把 code 同时写入 id，
  // 这样仍用组件默认 index:'id'（子行 parent_id 正好指向父行 id=code），无需改 index。
  grid.setColumnModel(model);                      // iconCol:'icon'（按 account_type_code / is_leaf 派生）
  grid.setOptions({ dataTree: true, parentField: 'parent_id', treeColumn: 'name', treeStartExpanded: false });
  grid.setData(((data.data && data.data.rows) || []).map(rowToNode));  // rowToNode 写 id=code + 类型中文 + 末级文本 + icon
});
```

> **主键非 id 的字典**两种接法：①（演示用）`rowToNode` 把业务主键写进 `id`，沿用组件默认 id 语义；
> ②直接传 `setOptions({ index:'<主键字段>' })` 让 Tabulator 按该字段做行标识——但组件的选中/展开态
> 目前以 `id` 为键，方式①最省心。
>
> dct 数据服务返回平表行（自分级字典可用 body 里的 `parentId` 装载某父行的 children），
> 层级重建交由组件完成（推荐）。

## 二、数据形态（两者皆可）

| 形态 | 说明 |
|------|------|
| **扁平 + parentField** | 每行带 `parentId` 外键，`buildTreeFromFlat` 重建层级（推荐，与 `setFlatData` 习惯一致） |
| **预嵌套 childField** | 每行在 `_children`（默认）数组下挂子行，原样透传 |

归一逻辑在纯函数模块 `lib/cmx-tree-data.js`（`normalizeTreeData` / `buildTreeFromFlat` /
`flattenTree` / `walkTree` / `collectIds`），无 DOM 依赖、可单测，防自引用与成环。

## 三、选项（setOptions / data-cmx-* 属性）

| 选项 | 属性 | 默认 | 说明 |
|------|------|------|------|
| `dataTree` | `data-cmx-tree` | `false` | 总开关 |
| `parentField` | `data-cmx-parent-field` | `'parentId'` | 扁平行父键字段 |
| `treeColumn` | `data-cmx-tree-column` | 第一列 | 显示展开把手的列 id |
| `dataTreeChildField` | `data-cmx-tree-child-field` | `'_children'` | 嵌套子数组字段 |
| `treeStartExpanded` | `data-cmx-tree-start-expanded` | `false` | `true` 全展开 / 数字=前 N 层 / `[0,2]` 指定层 |
| （图标字段） | `data-cmx-icon-field` | 列模型 `iconCol` | 树列图标字段；列模型 `iconCol` 优先 |

## 四、展开/折叠 API（借鉴 cmx-web-treeview）

```js
grid.expandAll();          grid.collapseAll();
grid.expandRow(id);        grid.collapseRow(id);    grid.toggleRow(id);
grid.getExpandedIds();     // 当前展开节点 id 列表（刷新数据后自动保持展开态）
```

刷新数据（`addRow` / `removeRows` / `setData` / DataSet 变更）后，组件按 `_expandedIds` 快照
自动恢复用户已展开的节点——与 `cmx-web-treeview` 的展开态保持一致。

## 五、事件

| 事件 | detail | 触发 |
|------|--------|------|
| `cmx-row-selected` | `{ id, row }` | 选中行（树节点） |
| `cmx-tree-row-expanded` | `{ id, row, level }` | 节点展开 |
| `cmx-tree-row-collapsed` | `{ id, row, level }` | 节点折叠 |

## 六、参考

- 演示页：`tabulator-treegrid-demo`（Designer `_data/html-pages/sources/`，Portal `_legacy/`）
- 生成脚本：`scripts/gen-treegrid-demo.mjs`
- 组件源码：`src/components/cmx-tabulator.js`
- 树数据工具：`src/lib/cmx-tree-data.js`（+ `__tests__/cmx-tree-data.test.js`）
