# CMX 主从表格页面生成指南

## 概述

本文档定义了在 CMXHTMLDesigner / CMXPortalManager 体系中，生成基于 `cmx-revo-grid` + `CmxMasterSlave` + `CmxColumnModel` + `CmxDataSet` 的主从联动表格页面的规范和步骤。

---

## 页面文件结构

每个页面是一个 HTML 片段文件，存储在 `cmx-node-server/data/html-pages/sources/{pageId}_{timestamp}.html`，包含三个部分：

1. **HTML 标记** — UI5 + CMX 组件的 DOM 结构
2. **设计时脚本预览** — `<script>` 标签内的函数定义（供设计器代码面板显示）
3. **设计器元数据** — `<script type="application/json" id="__designer_meta__">` 内的 JSON

---

## 关键规则

### 1. Schema 层级结构

从表必须是主表 schema 的 `children`，不能作为兄弟根节点：

```javascript
// 正确 ✓
schema: [
  { id: 'orders', kind: 'list', children: [
    { id: 'details', kind: 'list' }
  ] }
]

// 错误 ✗ — 从表作为独立根节点，无法联动
schema: [
  { id: 'orders', kind: 'list' },
  { id: 'details', kind: 'list' }
]
```

### 2. 路径引用必须用完整路径

- `bindTable` 绑定从表：`ms.bindTable('orders.details', detailGrid)`
- `aggregations.from` 引用从表：`{ from: 'orders.details', to: 'orders', ... }`
- 根节点路径无前缀：`ms.bindTable('orders', masterGrid)`

### 3. 使用 `setFlatData` 加载扁平数据

当数据以外键关联（如 `orderId`）而非嵌套 `_children` 时，使用：

```javascript
ms.setFlatData({ orders: orderRows, details: detailRows });
```

协调器会根据 `relations` 自动将 detail 行按外键分组挂到对应主表行的 `_children` 下。

### 4. 获取 CMX 类引用

页面函数通过 `new Function()` 编译执行，不能使用 `import()`。获取类引用的方式：

```javascript
var C = (typeof globalThis !== 'undefined' && globalThis.__cmxDataComp) || host.__cmxClasses;
```

- 设计器环境：`globalThis.__cmxDataComp` 由 `cmx-models-plugin.js` 设置
- PortalManager 环境：`globalThis.__cmxDataComp` 由 `import-ui5-and-app.js` 预加载设置
- 备选：`host.__cmxClasses` 由 `buildCmxScriptBlockFromPageState` 生成的 `connectedCallback` 内 `dataFlow` 自动初始化设置

### 5. data-node-id 编号

所有设计器管理的元素必须带 `data-node-id="n-{N}"` 属性，从 `n-1` 开始递增。

### 6. 事件绑定

按钮事件使用 `data-eventclick="functionName();"` 属性。运行时由 `__hydrateEvents` 编译为事件监听器，在 `with (host) { ... }` 上下文中执行。

### 7. 删除行必须区分「临时新增行」与「已存行」

带「新增/删除」的工作台，**删除行时必须判断该行是否临时新增（尚未存过后端）**，两条路径不能混用：

| 行类型 | id 形态 | 删除路径 | 原因 |
|---|---|---|---|
| 临时新增行 | 非纯数字（如 `t1`、`t2`） | `ds.removeRow(id)`（本地删） | 从没存过后端，只需从 ds 移除 |
| 已存行 | 纯数字真号（后端铸号） | 后端删除 API（如 `dctDelete`） | 已落库，需后端删 |

**原理**：`ChangeSetCollector` 的「新增又删→净零」净销（[cmx-doc-source.js:401](../src/lib/cmx-doc-source.js)）**依赖 `ds.removeRow` 派发的 `ds-row-removed` 事件**（[cmx-data-set.js:122](../src/lib/cmx-data-set.js)）。若临时行删除直接打后端 API、绕过 ds 层，collector 的 `inserted` 里空行不会被净销，保存时仍发给后端 → 触发非空校验报「内容不能为空」。

```javascript
// ✅ 正确：deleteRow 内先判临时行（判定与后端 is_temp_id 一致：非纯数字串=临时）
host.deleteRow = function (id) {
  var ds = host.dictMS && host.dictMS.getRootDataSet && host.dictMS.getRootDataSet('dict');
  if ((id == null) || !/^[0-9]+$/.test(String(id))) {   // 临时行 → 本地删，collector 自动净销
    if (ds && ds.removeRow) ds.removeRow(id);
    return Promise.resolve({ removed: true, temp: true });
  }
  return dctDelete('<dictCode>', id).then(function (r) {  // 已存行 → 后端删
    return host.reload();  // 或 setMaster/setCategory 等该族的重载
  });
};

// ❌ 错误：无条件打后端删除，临时行空行残留在 collector.inserted → 保存报「内容不能为空」
host.deleteRow = function (id) { return dctDelete('<dictCode>', id).then(...); };
```

- 临时 id 判定 `!/^[0-9]+$/.test(id)` 与后端 [`is_temp_id`](../../../cmx-container/crates/libs/cmx-api/src/handlers/portal/dct.rs)（`dct.rs:287`，非纯数字串判为临时）保持一致。
- 删除逻辑集中在 **model 数据中枢页**的 `deleteRow`，content 页的 `doDel` 只调 `m.deleteRow(id)`，不自行判断。
- **DOC（单据/凭证）天然无此问题**：其明细行删除本就走 `grid.removeRows([id])` / `ds.removeRow(id)`（ds 层删除），collector 正确净销。此规则主要约束 **DCT 字典工作台**（删除走后端 API 的场景）。

---

## 页面生成模板

### HTML 结构模板

```html
<div style="display:flex;flex-direction:column;height:100%;gap:8px;padding:8px;" data-node-id="n-1">
  <ui5-bar design="Header" accessible-role="Toolbar" data-node-id="n-2">{页面标题}
    <ui5-button design="Emphasized" slot="endContent" data-node-id="n-3" data-eventclick="{初始化函数}();">{按钮文本}</ui5-button>
  </ui5-bar>
  <div style="flex:1;display:flex;flex-direction:column;gap:6px;min-height:0;" data-node-id="n-4">
    <div style="flex:0 0 45%;min-height:0;display:flex;flex-direction:column;" data-node-id="n-5">
      <ui5-title level="H5" data-node-id="n-6">{主表标题}</ui5-title>
      <cmx-revo-grid id="{masterGridId}" style="display:block;width:100%;flex:1;min-height:0;" data-node-id="n-7"></cmx-revo-grid>
    </div>
    <div style="flex:1;min-height:0;display:flex;flex-direction:column;" data-node-id="n-8">
      <ui5-title level="H5" data-node-id="n-9">{从表标题}</ui5-title>
      <cmx-revo-grid id="{detailGridId}" style="display:block;width:100%;flex:1;min-height:0;" data-node-id="n-10"></cmx-revo-grid>
    </div>
  </div>
</div>
```

### 初始化函数模板

```javascript
function loadData() {
  var C = (typeof globalThis !== 'undefined' && globalThis.__cmxDataComp) || host.__cmxClasses;
  if (!C) { alert('CMX 数据类尚未加载，请稍后重试'); return; }

  var CmxColumnModel = C.CmxColumnModel;
  var CmxColumn = C.CmxColumn;
  var CmxMasterSlave = C.CmxMasterSlave;
  var root = host.shadowRoot;

  // 主表列模型
  var masterModel = new CmxColumnModel({
    datasetId: '{masterSchemaId}',
    caption: '{主表名称}',
    members: [
      new CmxColumn({ id: '{字段名}', caption: '{显示名}', type: '{text|number|date}', width: '{宽度}' }),
      // ... 更多列
    ]
  });

  // 从表列模型
  var detailModel = new CmxColumnModel({
    datasetId: '{detailSchemaId}',
    caption: '{从表名称}',
    members: [
      new CmxColumn({ id: '{字段名}', caption: '{显示名}', type: '{text|number|date}', width: '{宽度}' }),
      // ... 更多列
    ]
  });

  // 数据（实际场景通过 pageService 加载）
  var masterRows = [ /* { id: '...', ... } */ ];
  var detailRows = [ /* { id: '...', {foreignKey}: '{masterRowId}', ... } */ ];

  // 主从协调器
  var ms = new CmxMasterSlave({
    schema: [
      { id: '{masterSchemaId}', kind: 'list', children: [
        { id: '{detailSchemaId}', kind: 'list' }
      ] }
    ],
    relations: [
      { parent: '{masterSchemaId}', child: '{detailSchemaId}', parentKey: 'id', childKey: '{foreignKey}' }
    ],
    aggregations: [
      // 可选：子表字段汇总到父表
      { from: '{masterSchemaId}.{detailSchemaId}', to: '{masterSchemaId}', field: '{子表字段}', toField: '{父表字段}', agg: 'sum' }
    ]
  });

  // 获取 Grid 引用并配置
  var masterGrid = root.querySelector('#{masterGridId}');
  var detailGrid = root.querySelector('#{detailGridId}');

  masterGrid.setColumnModel(masterModel);
  detailGrid.setColumnModel(detailModel);

  masterGrid.setOptions({ selectionMode: 'single', fillHeight: true, showRowIndex: true });
  detailGrid.setOptions({ selectionMode: 'single', fillHeight: true, showRowIndex: true });

  // 绑定视图并加载数据
  ms.bindTable('{masterSchemaId}', masterGrid);
  ms.bindTable('{masterSchemaId}.{detailSchemaId}', detailGrid);
  ms.setFlatData({ '{masterSchemaId}': masterRows, '{detailSchemaId}': detailRows });

  // 保存引用
  host.__cmxMs = ms;
  host.__masterGrid = masterGrid;
  host.__detailGrid = detailGrid;
}
```

### __designer_meta__ JSON 结构

```json
{
  "pageData": [
    { "name": "varName", "type": "number", "defaultValue": "0" }
  ],
  "pageFns": [
    { "name": "fnName", "params": "", "body": "...", "readsVars": [], "writesVars": [] }
  ],
  "pageServices": [],
  "pageDeps": [],
  "pageInterfaces": [
    { "name": "isDirty", "enabled": true, "body": "return host.__cmxDirty === true;" },
    { "name": "getState", "enabled": true, "body": "return Object.assign({}, $data);" },
    { "name": "validate", "enabled": true, "body": "return { valid: true };" }
  ],
  "dataSources": [],
  "dataFlow": {
    "schema": [
      { "id": "masterSchemaId", "kind": "list", "selector": "#masterGridId", "children": [
        { "id": "detailSchemaId", "kind": "list", "selector": "#detailGridId" }
      ] }
    ],
    "aggregations": [
      { "from": "masterSchemaId.detailSchemaId", "to": "masterSchemaId", "field": "amount", "toField": "totalAmount", "agg": "sum" }
    ],
    "relations": [
      { "parent": "masterSchemaId", "child": "detailSchemaId", "parentKey": "id", "childKey": "foreignKey" }
    ]
  },
  "models": []
}
```

---

## 注册步骤

### 1. 创建页面文件

```
{Designer}/cmx-node-server/data/html-pages/sources/{pageId}_{timestamp}.html
{Portal}/cmx-node-server/data/html-pages/sources/{pageId}_{timestamp}.html
```

### 2. 注册到 pages-list.json

在 `pages` 数组中添加：

```json
{
  "id": "{pageId}",
  "name": "{显示名}",
  "details": "{描述}",
  "latestHtmlFile": "{pageId}_{timestamp}.html",
  "timestamp": "{timestamp}"
}
```

### 3. 注册到菜单（CMXPortalManager）

在 `cmx-node-server/data/menu-pages/explorer-menu.json` 的目标组 `children` 中添加：

```json
{
  "id": "{pageId}",
  "name": "{name}",
  "caption": "{菜单显示名}",
  "type": "workspace-node",
  "icon": "table-view",
  "workspace": {
    "content": {
      "caption": "{标题}",
      "icon": "table-view",
      "views": [
        { "tabLabel": "{标签}", "icon": "table-view", "type": "html_pages", "html_page": "{pageId}" }
      ]
    }
  }
}
```

---

## CmxColumn 类型参考

| type | editMode | 说明 |
|------|----------|------|
| `text` | `input` | 文本输入 |
| `number` | `input` | 数字输入（右对齐） |
| `date` | `date` | 日期选择器 |
| `select` | `select` | 下拉选择 |
| `ref` | `ref` | 引用弹窗 |
| `*` | `readonly` | 只读展示 |
| `*` | `none` | 隐藏编辑 |

## CmxMasterSlave 聚合类型

| agg | 说明 |
|-----|------|
| `sum` | 求和 |
| `avg` | 平均值 |
| `min` | 最小值 |
| `max` | 最大值 |
| `count` | 计数 |

---

## 参考文件

- 示例页面：`demo-master-slave_20260521_100000000.html`
- CmxMasterSlave 源码：`packages/cmx-data-comp/src/lib/cmx-master-slave.js`
- CmxColumnModel 源码：`packages/cmx-data-comp/src/lib/cmx-column-model.js`
- 脚本生成器：`../../../cmx-html-designer`
- 页面规范化：`../../../cmx-html-designer`
