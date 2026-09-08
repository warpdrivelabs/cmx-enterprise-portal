# 弹性组合元模型（Flexible Combination Meta-Model）

> 领域无关的"在维度组合锚点上挂载可细分明细 schema"的元数据驱动框架。
> 财务的「科目 → 辅助核算」只是它的一个实例（anchor = `[account]`）；
> 交易的「交易类型 + 产品类型 → 行项目」是另一个实例（anchor = `[txType, productType]`）。

## 1. 目标与定位

把"某个业务对象组合上，按规则展开一组可录入的明细行"这件事抽象成可配置的元模型：

- **锚点**：一个或多个维度的组合（DimensionTuple）
- **细分**：锚点匹配到一条 SubdivisionRule，规则产出一组字段（FieldSpec[]）
- **字段三态**：维度（dimension）/ 属性（attribute，从维度自动带出）/ 度量（measure，可输入或可计算）
- **公式**：字段间计算公式（computed measure）与校验公式（validation）
- **显示/编辑**：每个字段声明显示格式与编辑方式

零代码扩展：换领域 = 加规则；加维度/属性/度量/公式/校验 = 改 JSON。

## 2. 元模型

```
Dimension（维度）──< Attribute（属性）          Measure（度量）
   │ 携带一组属性                                   │ input | computed
   ▼
DimensionTuple（维度组合 = 锚点）
   财务 [account]  /  交易 [txType, productType]
   ▼
SubdivisionRule（细分规则）  anchor(match) ──► detail.fields[]
                                                 ▼
                                         FieldSpec（三态字段）
                                         + display + edit + formula + validations
```

| 实体 | 含义 | 关键字段 |
|---|---|---|
| Dimension | 一条核算/分析轴 | `code`, `name`, `valueType`, `valueSourceId`, `attributes[]` |
| DimensionTuple | 维度的有序组合，充当锚点 | `dimensions: string[]` |
| SubdivisionRule | 锚点 → 明细 schema 映射 | `id`, `anchor{dimensions, match}`, `detail{fields}` |
| FieldSpec | 明细中一列，三态之一 | `code`, `kind`, `caption`, `dataType`, `source`, `defaultFrom`, `edit`, `formula`, `dependsOn`, `validations`, `display`, `unitField` |

## 3. 字段三态（FieldSpec.kind）

| kind | 取值来源 | 典型例 | edit.mode | 进公式 |
|---|---|---|---|---|
| `dimension` | 从某维度主数据选一个值 | 客户/供应商/产品/币种 | `ref` / `select` / `tree-ref` | 其属性可被带出 |
| `attribute` | 从已选维度值自动带出属性 | 产品→规格、产品→计量单位 | `readonly`（或带出后可改） | 可作输入 |
| `measure` | 数值，输入或计算 | 单价/数量/汇率/币值（input）；金额/本位币金额（computed） | `input` / `computed` | 是 |

FieldSpec 统一结构：

```jsonc
{
  "code": "amount",
  "kind": "measure",
  "caption": "金额",
  "dataType": "number",                                   // text|number|date|select|ref

  "valueSourceId": "customerMaster",                       // kind=dimension：值主数据
  "source":      { "dimension": "product", "attribute": "spec" },  // kind=attribute：从哪带出
  "defaultFrom": { "dimension": "product", "attribute": "price" }, // measure 默认值来源

  "edit": { "mode": "computed", "required": false },       // input|readonly|select|ref|tree-ref|computed|none

  "formula": "unitPrice * quantity",                       // computed measure 计算式
  "dependsOn": ["unitPrice", "quantity"],
  "validations": [ { "expr": "quantity > 0", "message": "数量须大于 0" } ],

  "display": { "decimals": 2, "thousand": ",", "zeroBlank": true, "negativeColor": true, "align": "right" },
  "unitField": "uom"                                       // 度量挂单位（数量挂计量单位/币值挂币种）
}
```

## 4. 元数据 JSON

三份配置：`dimensions.json`（维度+属性目录）、`flexible-combination-rules.json`（锚点→schema）、value-source（复用 CmxDataSet/reference）。

### 4.1 dimensions.json

```jsonc
{
  "product":  { "name": "产品", "valueType": "ref",    "valueSourceId": "productMaster",
                "attributes": ["spec", "uom", "price", "category"] },
  "currency": { "name": "币种", "valueType": "select", "valueSourceId": "currencyDict",
                "attributes": ["symbol", "decimals", "todayRate"] },
  "customer": { "name": "客户", "valueType": "ref",    "valueSourceId": "customerMaster",
                "attributes": ["name", "creditLimit"] },
  "account":  { "name": "科目", "valueType": "ref",    "valueSourceId": "coa",
                "attributes": ["category", "direction"] }
}
```

### 4.2 flexible-combination-rules.json（财务实例）

```jsonc
{
  "id": "fi-receivable",
  "anchor": { "dimensions": ["account"], "match": { "account": { "category": "receivable" } } },
  "detail": { "fields": [
    { "code": "customer",   "kind": "dimension", "valueSourceId": "customerMaster", "edit": { "mode": "ref", "required": true } },
    { "code": "department", "kind": "dimension", "valueSourceId": "deptTree",        "edit": { "mode": "tree-ref" } },
    { "code": "amount",     "kind": "measure",   "edit": { "mode": "input" },
      "display": { "decimals": 2, "thousand": ",", "zeroBlank": true, "negativeColor": true, "align": "right" } }
  ] }
}
```

### 4.3 flexible-combination-rules.json（交易实例：属性带出 + 两段链式计算）

```jsonc
{
  "id": "trade-sale-goods",
  "anchor": { "dimensions": ["txType", "productType"], "match": { "txType": "sale", "productType": "goods" } },
  "detail": { "fields": [
    { "code": "product",      "kind": "dimension", "valueSourceId": "productMaster", "edit": { "mode": "ref", "required": true } },
    { "code": "spec",         "kind": "attribute", "source": { "dimension": "product", "attribute": "spec" }, "edit": { "mode": "readonly" } },
    { "code": "uom",          "kind": "attribute", "source": { "dimension": "product", "attribute": "uom" },  "edit": { "mode": "readonly" } },
    { "code": "unitPrice",    "kind": "measure",   "edit": { "mode": "input" }, "defaultFrom": { "dimension": "product", "attribute": "price" },
      "display": { "decimals": 4, "thousand": "," } },
    { "code": "quantity",     "kind": "measure",   "edit": { "mode": "input" }, "unitField": "uom",
      "validations": [ { "expr": "quantity > 0", "message": "数量须大于 0" } ] },
    { "code": "amount",       "kind": "measure",   "edit": { "mode": "computed" }, "formula": "unitPrice * quantity",
      "dependsOn": ["unitPrice", "quantity"], "display": { "decimals": 2, "thousand": "," } },
    { "code": "currency",     "kind": "dimension", "valueSourceId": "currencyDict", "edit": { "mode": "select" } },
    { "code": "currencyValue","kind": "measure",   "edit": { "mode": "input" }, "display": { "decimals": 2, "thousand": "," } },
    { "code": "exchangeRate", "kind": "measure",   "edit": { "mode": "input" }, "defaultFrom": { "dimension": "currency", "attribute": "todayRate" },
      "display": { "decimals": 4 } },
    { "code": "baseAmount",   "kind": "measure",   "edit": { "mode": "computed" }, "formula": "currencyValue * exchangeRate",
      "dependsOn": ["currencyValue", "exchangeRate"], "display": { "decimals": 2, "thousand": "," } }
  ] }
}
```

> 以上 §4.2/§4.3 为 inline 形态（`detail.fields` 自带完整字段定义）。当前推荐 **overlay 形态**——字段引用单据定义（DOC）的列，只存增量差异，避免拷贝导致的快照漂移。overlay 的 `detail` 支持三入口：
> - `use: "*"` 引用关联表全部列，`over: { colId: {…} }` 打补丁
> - `pick: [{ ref: "表.列", over?: {…}, as?: "新名" }]` 挑列 + 增量覆盖
> - `fields: […]` inline（纯逻辑列 / 旧档案兼容）
>
> 服务端读时自动展开为完整 inline（`ref` → DOC 列基底 + `over` deepMerge）。详见 [`flexible-combination-overlay-design.md`](./flexible-combination-overlay-design.md)。

## 5. 运行时引擎 API（`FlexibleCombinationEngine`，领域无关）

构造：`new FlexibleCombinationEngine({ dimensions, rules })`

| 方法 | 作用 |
|---|---|
| `resolveRule(anchorValues)` | 按 **精确值 > 维度属性匹配 > 默认** 找**单条**最佳 rule；`anchorValues` 例 `{account:'1122'}` 或 `{txType:'sale',productType:'goods'}` |
| `resolveMergedRule(anchorValues)` | **合并所有命中规则**的字段为一条 rule（重名列取得分高者，同分取定义顺序靠前者）；生产调用（后端 resolve/preview/rule、前端 setCombination）走此方法 |
| `buildColumns(rule)` | `detail.fields[]` → `CmxColumn[]`（三态映射见 §7），驱动明细 grid |
| `onPickDimension(row, fieldCode, dimValue)` | 选了某维度值 → 带出该维度的 attribute 字段 + `defaultFrom` 度量默认值 |
| `recompute(row, changedCode)` | 按 `dependsOn` 拓扑序重算受影响 computed measure（支持链式：单价→金额→本位币金额） |
| `validate(row, rule)` | 跑 `validations` + 必填检查，返回 `{ valid, errors[] }` |

匹配评分（`specificity = score*100 + 锚点维度数`），score 来源：

1. `match` 全部字段精确等值（`account:'1122'`，score 3）
2. `match` 命中维度属性（`account.category==='receivable'`，需查 dimension 主数据的属性，score ~1）
3. anchor.dimensions 相同但无 match 的兜底规则（score 0）
4. 任一条件不符 → score -1（淘汰）

**字段合并语义（`resolveMergedRule`，生产默认）**：所有 score≥0 的命中规则**全部参与**，字段按 `code` 合并：

- 同名字段取 **specificity 高者**胜出；**同分取规则定义顺序靠前者**
- 输出字段按"定义顺序里首次出现"排列（布局稳定，与作者书写顺序一致）
- 分组 `groups` 按定义顺序拼接（`buildMembers` 内部已对重复字段/空组去重）；`columnModel` 高分键覆盖、同分靠前优先
- 全部不命中 → 返回 `null`（调用方给最小列集，例如仅 amount）

> 旧的 `resolveRule`（只取最具体一条）保留，用于单选场景与回归对照；不再是生产路径。

## 6. 公式与校验引擎（`formula-eval.js`）

- **语法**：`+ - * / ( )`、字段引用（裸 code）、函数 `ROUND / ABS / MIN / MAX / IF`
- **求值**：不用裸 `eval`。词法分析 + 调度场（shunting-yard）→ RPN 求值；只允许白名单函数与字段引用；可在 PortalManager 的 `new Function` 沙箱安全运行
- **依赖重算**：computed measure 的 `dependsOn` 建有向图，拓扑排序后按序求值（链式自动正确）
- **校验**：`validations[].expr` 求值为 boolean，false 收集 `message`；保存时统一跑一遍 + 必填检查
- **暴露为 preset**（与现有体系一致，`cmx-column-presets.js`）：
  - `formula-eval`（apply 类）：`{ preset:'formula-eval', args:{ target:'amount', expr:'unitPrice*quantity', decimals:2 } }`
  - `rule-validate`：保存期批量调用

## 7. 与现有 CMX 的映射（复用，不重造）

| 元模型 | 落到 CMX | 说明 |
|---|---|---|
| FieldSpec | 一个 `CmxColumn` | engine.buildColumns 编译 |
| dimension 字段 | `type:'ref'`/`'select'` + 值源 | 复用现有 ref/select 列 |
| attribute 字段 | `type:'text'` + `editMode:'readonly'`（或 input） | 选维度后回填 |
| measure(input) | `type:'number'` + `displayMask` | 复用 voucher 已做的千分位/2 位小数/0 空/负数红字 cellTemplate |
| measure(computed) | `type:'number'`, `editMode:'readonly'`, `calcFormula:{preset:'formula-eval',args}` | 复用 CmxColumn 已有 `calcFormula` 钩子 |
| display 规则 | preset `format-number` / `format-date` | 已存在；扩 `zeroBlank` / `negativeColor` 两个 arg |
| validation | preset `rule-validate` + 页面保存期校验 | 新增 |

复用要点：`cmx-column-presets.js` 已有 `invokePreset(spec,'apply'|'format')`、`multiply/divide/sum/concat`；`CmxColumn` 已有 `calcFormula`/`displayMask`；`CmxMasterSlave` 已能聚合回写。引擎只是在其上加"**JSON 规则 → CmxColumn 编译器**"这一层。

## 8. 运行时数据流

```
主行维度值变化（选科目 / 选交易+产品类型）
        │
        ▼
engine.resolveRule(anchorValues) ──► rule
        │
        ▼
engine.buildColumns(rule) ──► CmxColumn[] ──► detailGrid.setColumnModel(...)
        │
明细行编辑：
  选 dimension 值 → engine.onPickDimension → 带出 attribute + 默认度量
  改 input measure → engine.recompute（拓扑序重算 computed）
保存：
  engine.validate(row, rule) → {valid, errors}
```

voucher 接入点：现 `onEntrySelected` 内部由 hardcode 的 `updateDetailColumns(category)` 五分支，改为
`resolveRule({account: row.acctCode}) → buildColumns → setColumnModel`。

## 8.1 后端存储与按需懒加载

**存储（DAM + scenario）**：`cmx-container/data/meta/flexible-combination/<domain>/<app>/<module>/<scenario>.json`
（如 `fi/cmxfico/gl/account.json`、`.../cmxfico.json`），由 Rust `cmx-model`（`flexible_combination/store.rs`）读写。

**存储格式（overlay 推荐）**：`rule.detail` 支持 overlay 引用——`use:"*"`（全表引用）、`pick:[{ref,over,as}]`（挑列+增量）、`fields:[…]`（inline，旧档案/纯逻辑列）三入口可混用。服务端读时展开（`api.rs` 的 `expand_combination_overlay`）：`ref` → 读 DOC 列基底 → 叠加 `over`（deepMerge：DCT字典 < DOC列 < FLC over）→ 产出完整 inline fields。详见 [`flexible-combination-overlay-design.md`](./flexible-combination-overlay-design.md)。

**后端 API**（Rust `cmx-api`，`handlers/portal/handler.rs`）：

| 路由 | 用途 |
|---|---|
| `GET /api/flexible-combination/config?domain&app&module&scenario` | 整份场景配置（管理页编辑用，返回原始 overlay 档案） |
| `GET /api/flexible-combination/resolve?…&<dim>=<值>` | 按维度值组合解析，返回合并后的字段描述符 |
| `GET /api/flexible-combination/rule?…&<dim>=<值>` | **按行懒加载**：只返回匹配到的规则（overlay 已展开为 inline），供前端引擎编译列 |
| `POST /api/flexible-combination/config?…` | 保存（透传 overlay 结构，不展开） |
| `POST /api/flexible-combination/validate?…` | 校验（overlay 展开后校验） |
| `POST /api/flexible-combination/preview?…` | 校验 + 解析预览（overlay 展开后引擎出列） |

**前端按行懒加载 + 缓存**（`CmxFlexibleCombination` 模型组件）：

- 选中/编辑某行时，按锚点值调 `loadByAnchor({dim:值})` → 走 `serviceFn` 或默认 `fetch(apiPath)`（→ `GET /api/flexible-combination/rule`）。
- 命中实例内缓存（`_cache` Map，key = 锚点签名）则直接复用 `CmxColumn[]`，不请求后端。
- 拿到 `{rule, dimensions}` 后经 `FlexibleCombinationEngine` 编译列 → 写入绑定的 `CmxColumnModel` → `columns-changed` 广播 → 视图重渲。
- 服务由设计器**服务面板**声明（`pageServices`），运行时编译为 `host.<serviceFn>(params)`；页面零硬编码。


## 9. 扩展点（零代码）

- **新领域**：加一条 anchor 不同的 rule（人力 `[薪资项目]`、库存 `[仓库,物料类型]`）
- **新维度/属性**：改 `dimensions.json`
- **新度量/公式**：rule.fields 加一条带 `formula` 的 measure
- **新校验**：字段 `validations` 加一条 expr
- **匹配粒度**：精确值 / 维度属性 / 通配默认 三级

## 10. 实施顺序与文件清单

落代码顺序（每步可独立验证）：

1. **公式引擎** `packages/cmx-data-comp/src/lib/formula-eval.js` —— 纯函数，单测易
2. **弹性组合引擎** `packages/cmx-data-comp/src/lib/flexible-combination-engine.js` —— 依赖 formula-eval + CmxColumn/CmxColumnModel
3. **扩 presets** `cmx-column-presets.js` —— `format-number` 加 `zeroBlank`/`negativeColor`；新增 `formula-eval` / `rule-validate`
4. **导出 + 预载** `index.js` 导出 `FlexibleCombinationEngine` / `evalFormula`；确保挂到 `globalThis.__cmxDataComp`（PortalManager `import-ui5-and-app.js`）
5. **元数据** `cmx-container/data/meta/flexible-combination/<domain>/<app>/<module>/<scenario>.json`（财务 + 交易 demo）
6. **voucher 接入** `voucher.html`：`pageServices` 拉元数据 → 初始化 `host.subdivEngine` → `onEntrySelected` 改走引擎；保留已做的格式化/钉底/列宽/居中
7. **泛化验证**（后续）：新建一个"交易明细"页跑 `[txType,productType]`，证明同引擎适配

## 11. 兼容与迁移

- voucher demo 行的 `acctCategory` 字段废弃，改由 `acctCode` + dimension(account).category 驱动匹配
- 现有 `updateDetailColumns` 逻辑保留为"引擎未就绪时的兜底最小列集"
- 引擎在 Designer / PortalManager 两端都能跑（类挂 `globalThis.__cmxDataComp`，页面函数零 import）

## 12. 附加属性（CmxColumnModel / CmxColumnGroup / CmxColumn）

> 三层"逃生舱"属性，**纯叠加、全部可选**，不改动既有 JSON 格式：旧档案不含这些键照常工作。
> 引擎早已透传（`_fieldToColumn` 读 `field.column`、`buildGroupNode` 透传 group 属性、
> `buildColumnModelProps` 合并 `columnModel`）；本节把它们规范化，并由校验器
> `flexible-combination-validator.js` 做取值合法性检查、由原生编辑器
> `portal-flexible-combination-manager.js` 的「检查器」面板可视化编辑。**未知键一律放行**（向前兼容）。

### 12.1 列级 `field.column` —— 透传到编译出的 `CmxColumn`

挂在某个 FieldSpec 上，覆盖/补充引擎默认推导的列属性：

```jsonc
{
  "code": "amount", "kind": "measure", "caption": "金额",
  "column": {
    "width": "120px",            // '120px' | '20%' | 'flex' | { size,min,max }
    "frozen": false,             // 冻结列
    "visible": true,             // false=隐藏
    "align": "right",            // left|center|right
    "agg": "sum",                // sum|count|avg|max|min
    "display": { "format": "thousands", "decimalDigits": 2, "mode": "text" },
    "edit":    { "mode": "readonly", "requiredWhen": "amount > 0", "readonlyWhen": "status != 'draft'" }
  }
}
```

校验：`align`/`agg`/`display.align` 取值非法报 error；`type`/`display.mode`/`edit.mode` 未知值报 warn；
`display.cellStyle[].when`、`edit.requiredWhen/readonlyWhen/validateWhen` 走 `compileFormula` 静态检查。

### 12.2 分组级 `groups[]` —— 透传到 `CmxColumnGroup`

分组节点除 `caption` / `members` 外，可声明聚合：

```jsonc
{ "caption": "金额信息", "aggregate": { "sum": true }, "aggregatePosition": "after", "members": ["remark", "amount"] }
```

校验：`aggregate` 须为对象且值为布尔（非布尔报 error，未知聚合键报 warn）；
`aggregatePosition` 仅 `before` / `after`。编辑器支持任意层嵌套分组、聚合勾选、字段 chip 增删。

### 12.3 模型级 `columnModel` —— 合并为 `CmxColumnModel` 属性

`profile.columnModel`（整份档案）与 `rule.columnModel`（单规则覆盖）合并（rule 优先）：

```jsonc
{
  "columnModel": { "caption": "辅助核算明细", "datasetId": "orders.details", "toTitleCols": "code,name", "iconCol": "" },
  "rules": [ { "id": "fi-receivable", "columnModel": { "caption": "应收明细" }, "detail": { ... } } ]
}
```

校验：`caption` / `datasetId` / `toTitleCols` / `iconCol` 须为字符串。

### 12.4 编辑器入口

原生 `<portal-flexible-combination-manager>`（scenario 无关，科目/交易/产品等通用）右侧「检查器」标签页：
点击字段行的检查器图标 → 编辑该字段的 `edit`/`display`/`dict`/`source`/`defaultFrom`/`validations[]`/`column`；
「设计」标签页下方新增「分组」与「列模型属性」两个可视化区块。JSON 标签页仍为专家逃生舱（双向同步）。
