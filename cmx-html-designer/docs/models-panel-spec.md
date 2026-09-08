# CMXHTMLDesigner — Models 面板功能规划

## 一、背景

CMXHTMLDesigner 当前的「数据」面板（`designer-page-data`）已包含以下子面板：

| 面板 | 作用 |
|------|------|
| 变量（Data） | 页面级 `$data` 变量声明 |
| 函数（Fn） | `pageFns` 业务函数 |
| 服务（Service） | REST / JSON-RPC / WebSocket 调用声明 |
| 数据流（Flow） | `dataFlow`：`CmxMasterSlave` 的 schema + aggregations 配置 |
| 依赖（Deps） | `pageDeps`：外部脚本/模块声明 |
| 接口（Interface） | `pageInterfaces`：页面标准对外接口（isDirty / getState 等） |

`build-cmx-page-script-block.js` 已经能读取 `dataFlow`，在运行时自动 `import CmxMasterSlave`、`new CmxMasterSlave(...)`、`bindForm/bindTable`。

**现在的问题**：`CmxDataSet`、`CmxColumnModel`、`CmxColumnGroup` 这些数据层对象还没有可视化配置入口，设计者只能在函数体里手写代码创建它们。

---

## 二、可行性评估

### 2.1 技术可行性

#### 已有基础（不需要从零做）

| 基础设施 | 现状 |
|---------|------|
| `__designer_meta__` 的扩展 | `designer-page-data.js` 已有 `setState/getState`，新增字段只需加属性和序列化/反序列化 |
| 脚本生成管道 | `build-cmx-page-script-block.js` 已有 `dataFlow` → 自动 import + 实例化的完整模板，`CmxDataSet` 和 `CmxColumnModel` 照此扩展 |
| 服务调用体系 | `pageServices` + `genServiceFnBody` 已支持 REST/JSON-RPC，数据集从后台加载直接复用 |
| Deps / importmap | 已有 `module` 类型 deps，`cmx-shared/` 加入 importmap 即可让函数体 import 到 CMX 类 |
| 面板框架 | `designer-page-data-shell-template.js` 已有多 pane 切换体系，新增 Models pane 是标准做法 |

#### 需要新增的部分

| 内容 | 工作量估算 |
|------|-----------|
| `__designer_meta__` 新增 `models` 字段的序列化 | 小 |
| `build-cmx-page-script-block.js` 生成 CmxDataSet / CmxColumnModel 实例化代码 | 中 |
| Models 面板 UI（拖放区 + 每种模型的配置卡片） | 中 |
| CmxColumnModel 可视化列编辑器（已有 `cmx-columns-editor.js` 可复用） | 中 |
| CmxDataSet 从后台服务加载的联动逻辑 | 中 |
| 设计器画布中可视组件（cmx-form/cmx-table/cmx-grid）与 Models 面板的关联 UI | 中 |

**总体结论：完全可行，且大部分基础设施已就绪，主要工作是 UI 层和脚本生成层的扩展。**

---

### 2.2 方案设计

#### 核心设计思想

**Models 面板 = 不可视的 JS 对象的可视化代理**

- 画布上的可视元素（`<cmx-table id="items">`）描述 **视图层**
- Models 面板上的模型卡片（`CmxDataSet: itemsDs`）描述 **数据层**
- 设计器在生成脚本时自动把两者关联起来

#### 三类模型及其配置

**1. CmxDataSet**

```
实例名：itemsDs
─────────────────────────────────
绑定视图：  #items（selector，对应画布元素）
初始数据来源：
  ○ 手动（在「变量」面板声明 cmxInitialData）
  ● 服务调用（选择已有 Service → 调用时机：onInit）
  ○ 空数据集
─────────────────────────────────
子数据集（_children）：
  + taxesDs  → 绑定：#taxes
```

**2. CmxColumnModel**

```
实例名：itemsModel
datasetId：items（对应 CmxDataSet 实例名）
─────────────────────────────────
列定义（可拖拽排序）：
  ┌─────────────┬────────┬────────┬──────┐
  │ sku         │ text   │ SKU    │ 140px│
  │ qty         │ number │ 数量   │  90px│
  │ unitPrice   │ number │ 单价   │ 100px│
  │ subtotal    │ readonly│ 小计  │ 110px│
  └─────────────┴────────┴────────┴──────┘
列定义来源：
  ○ 手动定义（上方列表）
  ● 从后台服务获取（选择已有 Service，响应格式：columns[]）
─────────────────────────────────
关联到：itemsModel.datasetId = 'items'
绑定视图：#items（自动调用 el.setColumnModel(itemsModel)）
```

**3. CmxMasterSlave**（现有 dataFlow 面板的升级版）

```
实例名：__ms（全局，页面唯一）
─────────────────────────────────
schema（树形，可从 Models 面板的 CmxDataSet 树自动推断）：
  orderForm (single) → #orderForm
    ├─ items (list)  → #items
    │    └─ taxes (list) → #taxes
    └─ shippings (list) → #shippings

aggregations：
  ┌──────────────────┬─────┬──────────┬──────────┬──────────┐
  │ from             │ agg │ field    │ to       │ toField  │
  │ items.taxes      │ sum │ tax      │ items    │ totalTax │
  │ items            │ sum │ subtotal │ orderForm│ totalAmt │
  └──────────────────┴─────┴──────────┴──────────┴──────────┘
```

---

## 三、`__designer_meta__` 扩展格式

在现有字段基础上新增 `models` 数组：

```json
{
  "pageData":       [...],
  "pageFns":        [...],
  "pageServices":   [...],
  "pageDeps":       [...],
  "pageInterfaces": [...],
  "dataFlow":       { "schema": [...], "aggregations": [...] },
  "models": [
    {
      "type":       "CmxDataSet",
      "instanceId": "itemsDs",
      "selector":   "#items",
      "dataSource": "loadItemsService",
      "dataSourceEvent": "onInit",
      "children": [
        { "childId": "taxes",     "instanceId": "taxesDs",    "selector": "#taxes"    },
        { "childId": "shippings", "instanceId": "shippingsDs","selector": "#shippings" }
      ]
    },
    {
      "type":       "CmxColumnModel",
      "instanceId": "itemsModel",
      "datasetId":  "items",
      "selector":   "#items",
      "columnsSource": "loadColumnsService",
      "columns": [
        { "id": "sku",       "caption": "SKU",  "type": "text",   "width": "140px" },
        { "id": "qty",       "caption": "数量", "type": "number", "width": "90px",
          "calcFormula": "r.subtotal = r.qty * r.unitPrice",
          "editSettings": { "dependents": ["subtotal"] }
        },
        { "id": "unitPrice", "caption": "单价", "type": "number", "width": "100px",
          "calcFormula": "r.subtotal = r.qty * r.unitPrice",
          "editSettings": { "dependents": ["subtotal"] }
        },
        { "id": "subtotal",  "caption": "小计", "type": "readonly", "width": "110px" }
      ]
    }
  ]
}
```

---

## 四、运行时脚本生成逻辑

`build-cmx-page-script-block.js` 读取 `models` 后生成以下代码（追加在现有 `dataFlow` 生成逻辑之后）：

```js
// === CmxDataSet / CmxColumnModel 实例化（由 designer models 生成）===
Promise.all([
  import('cmx-shared/lib/cmx-data-set.js'),
  import('cmx-shared/lib/cmx-column.js'),
  import('cmx-shared/lib/cmx-column-model.js'),
  import('cmx-shared/lib/cmx-column-adapter.js'),
]).then(([dsMod, colMod, modelMod, adaptMod]) => {
  const { CmxDataSet }       = dsMod
  const { CmxColumn }        = colMod
  const { CmxColumnModel }   = modelMod
  const { CmxColumnAdapter } = adaptMod

  // ── CmxDataSet 实例化 ──
  const itemsDs    = new CmxDataSet()
  const taxesDs    = new CmxDataSet()
  const shippingsDs = new CmxDataSet()
  // 建立父子关系（_children 在 addRow 时挂入）
  host.__cmxDs = { itemsDs, taxesDs, shippingsDs }

  // ── CmxColumnModel 实例化 ──
  const itemsModel = new CmxColumnModel({ datasetId: 'items' })
  itemsModel.addMember(new CmxColumn({ id:'sku', caption:'SKU', type:'text', width:'140px' }))
  itemsModel.addMember(new CmxColumn({
    id:'qty', caption:'数量', type:'number', width:'90px',
    calcFormula: (r) => { r.subtotal = r.qty * r.unitPrice },
    editSettings: { dependents: ['subtotal'] }
  }))
  // ... 其余列

  // ── 绑定到画布元素 ──
  const itemsEl = root.querySelector('#items')
  if (itemsEl) {
    itemsEl.setDataSet(itemsDs)
    itemsEl.setColumnModel(itemsModel)
  }

  // ── 从 Service 加载初始数据 ──
  if (typeof host.loadItemsService === 'function') {
    host.loadItemsService().then(data => {
      if (data) itemsDs.setRows(data)
    }).catch(e => console.warn('[models] loadItemsService failed', e))
  }
}).catch(e => console.warn('[cmx-html-pages] models init failed', e))
```

> 关键点：`calcFormula` 作为函数字面量无法 JSON 序列化，设计器存储时存字符串形式，生成时用 `new Function(body)` 注入。

---

## 五、从后台服务加载数据和列模型

### 5.1 数据加载（CmxDataSet）

在已有 `pageServices` 体系中，数据加载服务和普通服务**完全相同**，只是在 `models` 配置里声明"加载完成后填充到哪个 CmxDataSet"：

```json
{
  "type": "CmxDataSet",
  "instanceId": "itemsDs",
  "dataSource": "loadItemsService",
  "dataSourceEvent": "onInit"
}
```

后台服务响应格式（普通 JSON 数组，直接 `ds.setRows(data)`）：

```json
[
  { "id": "r1", "sku": "SKU-A100", "qty": 3, "unitPrice": 40 },
  { "id": "r2", "sku": "SKU-B200", "qty": 2, "unitPrice": 60 }
]
```

### 5.2 列定义加载（CmxColumnModel）

列定义也可以从后台服务获取，响应格式为标准的 `CmxColumn` 描述符数组：

```json
[
  { "id": "sku",       "caption": "SKU",  "type": "text",   "width": "140px" },
  { "id": "qty",       "caption": "数量", "type": "number", "width": "90px"  },
  { "id": "unitPrice", "caption": "单价", "type": "number", "width": "100px" },
  { "id": "subtotal",  "caption": "小计", "type": "readonly","width": "110px"}
]
```

生成代码中用 `CmxColumn.fromJSON(col)` 批量还原：

```js
if (typeof host.loadColumnsService === 'function') {
  host.loadColumnsService().then(cols => {
    if (Array.isArray(cols)) {
      const m = new CmxColumnModel({ datasetId: 'items' })
      cols.forEach(c => m.addMember(CmxColumn.fromJSON(c)))
      const el = root.querySelector('#items')
      if (el) el.setColumnModel(m)
    }
  })
}
```

这和"加载表格数据"是同一个服务调用模式，**设计器现有服务面板完全可以复用**。

---

## 六、面板 UI 设计

### Models 面板布局

```
┌─────────────────────────────────────────────┐
│  Models                          [+ 添加]   │
├─────────────────────────────────────────────┤
│  📦 CmxDataSet                 [可折叠]      │
│  ┌──────────────────────────────────────┐   │
│  │ 🗂 itemsDs     → #items     [×] [⚙]  │   │
│  │   子集：                             │   │
│  │     🗂 taxesDs     → #taxes          │   │
│  │     🗂 shippingsDs → #shippings      │   │
│  │     [+ 添加子集]                     │   │
│  │   数据来源：loadItemsService (onInit) │   │
│  └──────────────────────────────────────┘   │
│  [+ 添加 CmxDataSet]                        │
├─────────────────────────────────────────────┤
│  📋 CmxColumnModel              [可折叠]     │
│  ┌──────────────────────────────────────┐   │
│  │ 🏛 itemsModel  → #items     [×] [⚙]  │   │
│  │   列定义：4列  [编辑列...]            │   │
│  │   来源：手动 / loadColumnsService     │   │
│  └──────────────────────────────────────┘   │
│  [+ 添加 CmxColumnModel]                    │
└─────────────────────────────────────────────┘
```

### ⚙ CmxColumnModel 列编辑弹窗

复用现有的 `cmx-columns-editor.js`（已实现完整的列定义编辑器），在其基础上增加：
- 列类型与 `CmxColumn` 属性的对应
- `calcFormula` 函数体编辑（复用现有 CodeMirror 集成）
- `editSettings.dependents` 的多选联动

---

## 七、实现路径（推荐顺序）

### 阶段一：运行时支持（无 UI）

1. `wrapHtmlDocument` 的 importmap 中追加 `cmx-shared/` 本地路径条目
2. `build-cmx-page-script-block.js` 读取 `models` 字段，生成 `CmxDataSet` / `CmxColumnModel` 实例化代码
3. `designer-page-data.js` 的 `setState/getState` 加入 `models` 字段的序列化

验收：手动在 `__designer_meta__` 里写入 `models` 配置，预览/运行时能正确实例化并绑定到画布元素。

### 阶段二：基础 UI

4. 在 `designer-page-data-shell-template.js` 新增 `modelsPane`
5. 实现 `page-data-panel-models.js`：
   - CmxDataSet 列表 + 添加/删除/树形子集管理
   - CmxColumnModel 列表 + 添加/删除 + 简单列定义（只有 id / caption / type / width）
6. 与已有 selector 选择器联动（从画布元素 id 列表中选择绑定目标）

### 阶段三：完整列编辑

7. 列编辑弹窗：复用 `cmx-columns-editor.js`，扩展 calcFormula / editSettings 编辑
8. 从后台服务加载列定义的 UI 联动（在 columnsSource 选择框选 Service 后，预览按钮）

### 阶段四：后台数据加载

9. dataSource 服务绑定 UI（在 CmxDataSet 卡片上选择 Service + 调用时机）
10. 运行时生成代码追加服务调用 + `ds.setRows(data)` 逻辑

---

## 八、与现有架构的兼容性

| 关注点 | 结论 |
|--------|------|
| 现有设计文件 | 完全向后兼容。`models` 字段不存在时，生成逻辑直接跳过，行为与现在完全一致 |
| `dataFlow` 面板 | 现有 `schema` 中的 `selector` 逻辑不变；Models 面板可以选择性地"自动填充 dataFlow.schema"（因为 CmxDataSet 树和 schema 树是同构的） |
| `pageServices` | 零改动，数据加载服务就是普通的 Service，Models 面板只是持有对 Service 名的引用 |
| `cmx-columns-editor.js` | 直接复用，不需要修改 |
| 导出/运行文档 | 生成的 HTML 是自包含文档，包含完整的实例化代码，在任何标准浏览器中运行 |

---

## 九、最终效果示意

设计者的工作流将从：

> 在「函数」面板写 100 行 JavaScript 代码创建 CmxDataSet 树、CmxColumnModel、配置协调器、绑定到元素…

变为：

> 1. 在「Models」面板拖入一个 CmxDataSet，设置名称 `itemsDs`，绑定到 `#items`
> 2. 拖入 CmxColumnModel，点「编辑列」，在 GUI 中添加 4 列
> 3. 在「服务」面板声明 `loadItemsService`（一个 GET 接口）
> 4. 回到 CmxDataSet 卡片，选择"数据来源：loadItemsService"
> 5. 运行 → 完成

**零 JavaScript 代码完成数据层配置。**
