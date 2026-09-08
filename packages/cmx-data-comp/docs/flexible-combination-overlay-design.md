# 弹性组合 × 业务单据：Overlay（叠加层）结合模式设计

> 状态：设计草案（评审用）。本文只描述**结合方式的重构**，不改运行时引擎。
> 目标读者：弹性组合（CTX）/ 业务单据（DOC）/ 运行时引擎维护者。
> 关联文档：[`flexible-combination-meta-model.md`](./flexible-combination-meta-model.md)、[`dct-doc-meta-model.md`](./dct-doc-meta-model.md)、[`flexible-combination-model-guide.md`](./flexible-combination-model-guide.md)。

---

## 0. 一句话

> **当前的结合方式是"弹性组合把单据列拷贝过来，再独立地重新定义行为"。本设计把它反过来：弹性组合是叠加在业务单据定义之上的一层薄薄的、上下文相关的 overlay —— 单据（DOC）是主，弹性组合（CTX）是上下文修饰，而不是两套并行、靠拷贝同步的定义。**

运行时引擎（JS `flexible-combination-engine.js` + Rust `engine.rs`）、grid/form 联动链路、缓存**一律不变**。改动集中在**存储格式**与**编译期的一层展开**。旧档案继续可用。

---

## 1. 为什么要改：用真实档案量化

### 1.1 事实一：CTX 规则是 DOC 物理表的逐列深拷贝

`account.json` 的 `fi-cash` 规则，`detail.fields` 的 20 列：

```
entry_id, amount, direction, profit_center_id, cost_center_id, project_id,
partner_id, contract_id, bank_id, cashflow_item_id, currency_id, orig_amount,
exchange_rate, quantity, ext_dim1..5, remark
```

`gl_md_doc_meta_v1.json` 的 `voucher_detail` 物理表，`fields` 的 20 列：

```
entry_id, amount, direction, profit_center_id, cost_center_id, project_id,
partner_id, contract_id, bank_id, cashflow_item_id, currency_id, orig_amount,
exchange_rate, quantity, ext_dim1..5, remark
```

**逐列 id 相同、顺序相同、`dataType`/`fieldLength`/`intDigits`/`decimalDigits`/`agg` 全部相同。** 这不是"巧合地相似"，而是当前 `_docColumnToField`（`portal-flexible-combination-manager.js`）用

```js
const f = JSON.parse(JSON.stringify(col))   // 深拷贝整列
```

把单据列**整列拷进 CTX 存盘**的直接结果。

### 1.2 事实二：CTX 维度是 DCT 字典的重复

`account.json` 定义了 15 个 `dimensions`：`gl_account / profit_center / cost_center / project / partner / contract / bank / cashflow_item / currency / fiscal_period / ext_dim1..5`。

其中前 10 个，在 `gl_md_dct_meta_v1.json` 里**都有同名字典定义**。CTX 把每个字典的 `dict` 块（`idCol / codeCol / labelCol / parentCol / hierarchical / columns[4] / …`）又抄了一遍——每个约 30 行 × 10 个维度 ≈ **300 行纯重复**。

### 1.3 后果

| 后果 | 说明 |
|---|---|
| **快照漂移（最严重）** | 单据 `voucher_detail` 改了（如 `cost_center_id` 加校验、精度调整），已落地的 `account.json` **不会跟随**——两份定义从此各走各路，且无人知晓。 |
| **体积膨胀** | `account.json` 1305 行，其中 `fi-cash`（591 行）几乎全是 DOC 拷贝，`dimensions`（565 行）几乎全是 DCT 拷贝。真正属于 CTX 的"上下文差异"不足 10%。 |
| **职责错位** | 弹性组合的本质是"**在某上下文下，重新配置单据既有列的行为**"，现在却变成"**重新发明一套列**"。 |
| **一致性无保障** | 同一个 `cost_center_id`，物理类型在 DOC 存一份、在 CTX 各规则又各存一份，靠人肉保持一致。 |

---

## 2. 设计原则

1. **单一事实源（SSOT）**：一列的物理定义（类型/精度/维度绑定/单据内含义）只在 DOC 存一份；一个字典的取数配置只在 DCT 存一份。CTX **不再复制**，只**引用 + 增量**。
2. **CTX = 增量（delta）**：弹性组合只存"相对单据/字典的差异"——是否必填、是否可见、改标题、加公式、加校验、分组、列宽。
3. **编译期展开**：存储是 overlay 形态；`resolve(anchor)` 时把 `DOC 列 ⊕ CTX 增量` 编译成今天引擎吃的那套 `rule.detail.fields`。**引擎、grid、缓存全不改。**
4. **恒等兼容**：不含 `ref` 的旧字段原样通过（编译层对旧档案是恒等变换）。新旧写法可在同一规则里混用。
5. **向前兼容**：未知键放行（延续现有 validator 策略）。

---

## 3. Overlay 数据模型

### 3.1 字段两种形态：`inline`（现状，保留）与 `ref`（新增）

**现状 inline（保留，兼容旧档案 + 纯 CTX 逻辑列）**：字段自带完整定义。

```jsonc
{ "id":"cost_center_id", "dataType":"BIGINT", "dimType":"dimension", "refDict":"cost_center",
  "caption":{"zh_CN":"成本中心"}, "edit":{"mode":"select"}, "nullable":true /* …20+ 键… */ }
```

**新增 ref（overlay）**：只锚定 DOC 的列 + 写增量。

```jsonc
{ "ref":"voucher_detail.cost_center_id",              // 锚点：DOC 的「表.列」
  "over":{ "edit":{"required":true}, "column":{"visible":true} } }   // 只写差异
```

`ref` 字段结构：

| 键 | 必填 | 说明 |
|---|---|---|
| `ref` | 是 | `"<tableName>.<columnId>"`，指向 `docRef` 所指单据某表的某列。 |
| `over` | 否 | 覆盖/补充定义，形状与 inline 字段完全一致（`edit` / `display` / `caption` / `column` / `formula` / `validations` / `source` / `defaultFrom` / …）。省略 = 原样采用 DOC 列。 |
| `as` | 否 | 逻辑列改名（见 §3.3）。省略 = 沿用 DOC 列 id。 |

### 3.2 编译：`DOC 列 ⊕ CTX over → 现有 inline 字段`

编译期对每个 `ref` 字段执行：

```
docCol   = DOC.getTable(table).getColumn(columnId)        // 现取（含 fieldSet 展开）
base     = deepMerge(dctDict(docCol.refDict), docCol)     // 字典配置 + 列定义（字典在前，列覆盖）
field    = deepMerge(base, over)                            // 再叠加 CTX 增量（CTX 覆盖）
field.id = as || docCol.id
→ 得到与今天完全同构的 inline 字段，喂给现有 engine.buildColumns
```

`dctDict(refDict)` 把维度的字典取数配置也从 DCT 现取，CTX 不再存 `dimensions[x].dict` 那 30 行。

> 结果：编译层的**输出**与今天的 `rule.detail.fields` 逐键相同 → `_fieldToColumn` / `buildColumns` / grid 全部无感知。

### 3.3 逻辑列：overlay 让"改名绑定"更自然

`account.json` 里已有大量"逻辑列绑物理列"的用法，现在是靠**另起 id + 丢弃物理绑定**实现的，反而丢了类型信息：

| 规则 | 逻辑列 | 语义（绑定的物理列） | 现状 | overlay 写法 |
|---|---|---|---|---|
| `fi-expense` | `department` | `cost_center_id`（部门＝成本中心） | 新 id，无物理类型 | `{ "ref":"voucher_detail.cost_center_id", "as":"department", "over":{"caption":{"zh_CN":"部门"},"edit":{"required":true}} }` |
| `fi-receivable` | `customer` | `partner_id`（客户＝合作伙伴） | 新 id，无物理类型 | `{ "ref":"voucher_detail.partner_id", "as":"customer", "over":{"caption":{"zh_CN":"客户"},"edit":{"required":true}} }` |
| `fi-payable` | `supplier` | `partner_id`（供应商＝合作伙伴） | 新 id | `{ "ref":"voucher_detail.partner_id", "as":"supplier", "over":{"caption":{"zh_CN":"供应商"}} }` |

overlay 写法**同时保留了物理类型/维度绑定**（来自 DOC 列）**和逻辑语义**（`as` + `caption`）——比现状更完整，且落库到 `voucher_detail` 的哪一列一目了然。

---

## 4. 合并规则（`deepMerge` 语义）

编译期三次叠加 `dctDict → docCol → over`，统一用同一套确定性 `deepMerge`。规则要写死、可测：

| 情形 | 规则 |
|---|---|
| **标量键**（`dataType` / `edit.mode` / `caption.zh_CN` / …） | 后者覆盖前者（`over` 优先级最高）。 |
| **对象键**（`edit` / `display` / `column` / `caption`） | 递归深合并（保留未覆盖的子键）。 |
| **数组键**（`validations` / `enumValues` / `dependsOn`） | **默认替换**（不做元素级合并，避免歧义）。如需追加，用显式 `validations+`（见下）。 |
| **删除语义** | `over` 里把某键设为 `null` = 删除该键（如 `"agg": null` 去掉合计）。 |
| **数组追加** | 约定后缀 `+`：`"validations+":[…]` = 在 DOC 校验基础上追加 CTX 校验。 |

> 合并规则复用现有 `_fieldToColumn` 里已经在用的思路（`Object.assign(base.edit, field.edit)` 等），只是把它从"运行时读时合并"前移到"编译期写时合并"，并补齐 delete/append 两个显式语义。

### 4.1 冲突与优先级（写死，供 validator 检查）

```
优先级（低 → 高）：
  DCT 字典配置  <  DOC 列定义  <  CTX over  <  CTX as(仅改 id)
```

- CTX **不能**改物理 `dataType`/`fieldLength`（改了报 **error**：物理类型是 DOC 主权，CTX 只配行为）。允许改 `display.decimalDigits`（显示精度，属 CTX 主权）。
- CTX **可以**收紧约束（`nullable:true → edit.required:true`），**不建议**放松（DOC `nullable:false` 的列 CTX 设为非必填 → **warning**）。

---

## 5. 悬空引用诊断（复用现有 `_clientDiagnostics` 框架）

overlay 引入"引用可能失效"的新风险，正好接到已有的客户端诊断（`portal-flexible-combination-manager.js` 的 `_clientDiagnostics`）。新增诊断码：

| code | level | 触发 | 处理 |
|---|---|---|---|
| `REF_TABLE_NOT_IN_DOC` | error | `ref` 的表不在 `docRef` 单据中 | 保存拦截 |
| `REF_COLUMN_NOT_IN_TABLE` | error | `ref` 的列不在该表中（单据删了列） | 保存拦截 + 提示改绑或转 inline |
| `REF_WITHOUT_DOCREF` | error | 用了 `ref` 但档案没有 `docRef` | 保存拦截 |
| `OVER_CHANGES_PHYSICAL_TYPE` | error | `over` 改了 `dataType`/`fieldLength` | 保存拦截（见 §4.1） |
| `REF_DIM_DICT_MISSING` | warning | DOC 列 `refDict` 指的字典在 DCT 中找不到 | 放行，运行时回退文本 |
| `OVER_RELAXES_NULLABLE` | warning | CTX 把 DOC 非空列设为非必填 | 放行 |

编译期还要处理**运行态**的悬空（单据在档案落地后被改）：`ref` 列找不到时，跳过该字段并派发一条运行时 warning（不让整个规则崩），与现有"引用单据未加载则跳过校验"的宽容策略一致。

---

## 6. 前后对照（`account.json`）

### 6.1 `fi-cash` 规则：591 行 → ~30 行

**现状**（节选，20 个字段每个 10~15 行，全部是 DOC 拷贝）：

```jsonc
{ "id":"fi-cash", "anchor":{ "dimensions":["gl_account"], "match":{"gl_account.account_type":"AC004","gl_account.cashflow_related":"true"} },
  "detail":{ "table":"voucher_detail", "fields":[
    { "dataType":"BIGINT","nullable":false,"dimType":"relation","edit":{"mode":"input","required":true},"id":"entry_id","name":"entry_id","caption":{"zh_CN":"所属分录ID"} },
    { "dataType":"DECIMAL","fieldLength":20,"intDigits":18,"decimalDigits":2,"nullable":false,"dimType":"measure","agg":"sum","edit":{"mode":"input","required":true},"id":"amount","name":"amount","caption":{"zh_CN":"明细金额"} },
    /* … 另外 18 个字段，全部逐列照抄 voucher_detail … */
  ] } }
```

**overlay**（现金科目＝"全列可见 + 现金流量项必填"，其余全部继承 DOC）：

```jsonc
{ "id":"fi-cash",
  "anchor":{ "dimensions":["gl_account"], "match":{"gl_account.account_type":"AC004","gl_account.cashflow_related":"true"} },
  "detail":{
    "table":"voucher_detail",
    "use":"*",                                   // ① 采用 voucher_detail 全部列（见 §7）
    "over":{                                       // ② 只对个别列写增量
      "cashflow_item_id":{ "edit":{"required":true} }   // 现金科目：现金流量项必填（对上 DOC 的 cashflow_required 规则）
    }
  } }
```

> 20 个字段的物理定义全部回到 DOC 单一事实源；CTX 只留下这条规则真正的业务差异——"现金流量项必填"。这一条恰好是 DOC `validationRules` 里 `cashflow_required`（`account.cashflow_related==1 => cashflow_item_id != null`）的**配置来源**。

### 6.2 `fi-expense` 规则：用 `ref + as` 表达逻辑列

**现状**：

```jsonc
"fields":[
  { "edit":{"mode":"select","required":true},"dimType":"dimension","refDict":"cost_center","id":"department","name":"department","caption":{"zh_CN":"部门"} },
  { "edit":{"mode":"select"},"dimType":"dimension","refDict":"project","id":"project","caption":{"zh_CN":"项目"} },
  { "edit":{"mode":"input"},"dimType":"","id":"remark","caption":{"zh_CN":"备注"} },
  { "edit":{"mode":"input"},"display":{…},"dimType":"measure","id":"amount","caption":{"zh_CN":"金额"} }
]
```

**overlay**：

```jsonc
"pick":[                                            // ③ 只挑这几列（见 §7）
  { "ref":"voucher_detail.cost_center_id", "as":"department", "over":{"caption":{"zh_CN":"部门"},"edit":{"required":true}} },
  { "ref":"voucher_detail.project_id",     "as":"project" },
  { "ref":"voucher_detail.remark" },
  { "ref":"voucher_detail.amount",         "over":{"display":{"decimalDigits":2,"thousandSeparator":true,"negativeColor":true}} }
],
"groups":[ { "caption":"辅助核算","members":["department","project"] }, { "caption":"金额信息","members":["remark","amount"] } ]
```

`department` 现在既是"部门"（逻辑名），又明确落库到 `cost_center_id`（物理列，带完整 BIGINT + cost_center 字典绑定）。

### 6.3 维度块：565 行 → 0 行

现状 `dimensions` 里 10 个字典维度各 ~30 行取数配置，全部删除。编译期从 DCT 现取。CTX 若要覆盖某维度的下拉行为（如换 `helpLayout`），才写一条增量：

```jsonc
"dimensions":{
  "cost_center":{ "dict":{ "helpLayout":"tree" } }   // 只在需要偏离 DCT 默认时才写
}
```

`ext_dim1..5` 这类**无字典**的槽位维度保留 inline（本就没有可引用的 DCT 源）——正是 §8 模式三要处理的对象。

### 6.4 体积估算

| 部分 | 现状 | overlay | 降幅 |
|---|---|---|---|
| `dimensions`（10 字典维度） | ~565 行 | ~10 行 | −98% |
| `fi-cash`（20 列） | ~300 行 | ~10 行 | −97% |
| `fi-bank/receivable/payable/expense/default` | ~380 行 | ~120 行 | −68% |
| **合计** | **1305 行** | **~180 行** | **−86%** |

---

## 7. 三种"取列"方式（编译层入口）

一个规则的 `detail` 用三选一（或组合）声明它要哪些列：

| 键 | 含义 | 适用 |
|---|---|---|
| `use:"*"` | 采用该表**全部**物理列，配 `over:{colId:{…}}` 打补丁 | 明细型规则（如 `fi-cash` 要全套辅助核算列） |
| `pick:[{ref,as,over}]` | **只挑**列出的列，顺序即声明顺序 | 精简型规则（如 `fi-expense` 只要部门/项目/备注/金额） |
| `fields:[…]` | 现状 inline（纯 CTX 逻辑列，无 DOC 对应） | 兼容旧档案 + 无物理列的纯计算/常量列 |

三者可混用：`pick` 若干 DOC 列 + `fields` 若干纯逻辑列，编译期合并成一个 `detail.fields`。`groups` / `fieldTabs` / `columnModel` 语义不变。

---

## 8. 与后续两个模式的接口（本设计只做地基，不实现）

overlay 是[前一轮讨论]的"模式一"，是"模式二/三"的地基。这里只留**接口**，实现另议：

- **模式二·状态投影**：`over` 里的 `edit.readonlyWhen:"status!='draft'"` 可上升为规则级/档案级 `contexts:[{when:{state:'posted'},policy:{measures:'readonly'}}]`，投影 DOC 的 `voucherStatusFlow`。overlay 已把"列"锚定到 DOC，状态策略才有稳定的施加对象。
- **模式三·ext_dim 绑定**：`ext_dim1..5` 槽位维度 → `bind:{ext_dim1:'department'}` 声明，编译期决定槽位绑哪个字典 + 是否必填，喂给 DOC 的 `required_dims` guard。overlay 的 `ref:"voucher_detail.ext_dim1"` 是它的载体。

---

## 9. 落地顺序（每步可独立验证、可回退）

| 步 | 内容 | 风险 | 验证 |
|---|---|---|---|
| 1 | **编译层骨架** `expandOverlay(combination, docMeta, dctMeta) → combination'`。不含 `ref/use/pick` 的档案 = 恒等直通。 | 无（旧档案不变） | 对现有 3 个档案跑编译，输出与输入逐键相等 |
| 2 | **`ref + over + as` + `pick`/`use`** 编译实现 + §4 合并规则单测 | 低 | 把 `account.json` 改写成 overlay，编译回现有格式，与现状 diff 应等价（除已知的"逻辑列补回物理类型"差异） |
| 3 | **§5 悬空引用诊断** 接入 `_clientDiagnostics` | 低 | 构造断表/断列/改物理类型用例，断言报对应 code |
| 4 | **编辑器 UI**：`portal-flexible-combination-manager.js` 的字段表格支持 `ref` 行（显示"继承自 DOC"徽标 + 只暴露增量可编辑项） | 中 | 手动在编辑器里把一条 inline 规则转 overlay |
| 5 | **迁移工具**：把存量 `account.json` 等**批量**从拷贝式转 overlay（识别"与 DOC 列逐键相等"的字段 → 折叠为 `ref`） | 中 | 迁移后编译结果与迁移前 diff 等价 |
| 6 | 新场景端到端（如库存 `[仓库,物料类型]`）验证复用闭环 | 低 | — |

**运行时（`flexible-combination-engine.js` / `engine.rs` / grid / 缓存）在所有步骤中零改动。** 编译层可放在：① 保存时展开后落库（存 inline，最省运行时）；② 或读取/ resolve 时展开（存 overlay，最省存储、最保 SSOT）。**推荐 ②**，因为 SSOT 是本设计的核心目标——存 overlay 才能让"单据改了自动跟随"。

---

## 10. 兼容与迁移

- **恒等兼容**：`fields:[…]`（inline）永远有效；编译层对无 `ref` 档案是 no-op。
- **混用**：同一 `detail` 里 `pick`（DOC 列）+ `fields`（逻辑列）可共存。
- **回退**：任一 overlay 字段都能一键"物化"回 inline（编译一次、落库）——若将来要脱离 DOC 也不被锁死。
- **多驱动一致性**：JS 与 Rust 两套引擎**不需要各自实现编译层**——编译层放在写库/读库的**服务端一处**（Node 保存链路 or Rust `store.rs`），两端引擎收到的都是展开后的 inline，天然一致。

---

## 11. 待评审决策点

1. **编译时机**：保存时展开（存 inline）vs 读时展开（存 overlay）。本文推荐**读时展开**（保 SSOT），但运行时成本略高——需确认可接受。
2. **`use:"*"` 的列顺序**：跟随 DOC 物理顺序，还是允许 CTX 用 `order:[…]` 重排？建议默认跟随 DOC，`order` 可选。
3. **数组合并**：`validations` 默认替换 + 显式 `+` 追加，是否够用？还是需要按 `code` 做元素级合并？
4. **`as` 改名的落库**：逻辑列 `department` 存 grid 时用 `department` 还是物理 `cost_center_id`？涉及与 `voucherSchema` 的写回，需与单据保存链路对齐。
5. **迁移策略**：存量档案是一次性批量转 overlay，还是新档案用新写法、旧档案保持不动？
