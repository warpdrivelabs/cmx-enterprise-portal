# 业务单据「汇总表」设计方案（v2 · 已按用户决策定稿）

## 用户已拍板的决策
1. **存储位置**：嵌套在源表对象内 `voucherTables[i].summaries[]`（推荐方案）。
2. **跨层取维度**：支持（L3 可按 L1 头的期间/组织维度汇总），父链走 `voucherSchema.relations`。
3. **UI 落点**：字段面板的 Tab 条里，在「字段定义」与「JSON源码」**两个 Tab 之间**插入 1~N 个「汇总表」Tab。
4. **新增按钮位置**：在「表名标签（层内表 Tab 行）」上方/其上，点击新增汇总表。
5. 每个汇总表 Tab 上有 **删除按钮**。
6. 汇总表字段 **自动继承所在表的字段**（继承源表当前的列）。
7. 汇总表 Tab 上有 **「再次继承所在表的列」按钮**（重新同步源表列）。
8. 新增汇总表时需输入 **id / name / caption**。

---

## 一、数据模型：`voucherTables[i].summaries[]`

每张源表对象内新增 `summaries` 数组；纯叠加，老表/老文件不受影响。一条汇总表定义：

```jsonc
{
  "level": "L2", "tableName": "voucher_entry", "tableAlias": "分录",
  "fields": [ /* …源表字段… */ ],
  "summaries": [
    {
      "id": "voucher_entry_sum_period_account",       // 汇总表物理名（新增时必填）
      "name": "voucher_entry_sum_period_account",     // 名称（新增时必填）
      "caption": { "zh_CN": "分录汇总·期间×科目" },    // 多语言标题（新增时必填，复用 fieldCaption 机制）
      "remark": "",
      "sourceColumns": [                              // ★ 自动继承自源表的列（id 列表，快照）
        "header_id", "account_id", "account_code", "debit_amount", "credit_amount", "line_amount"
      ],
      "dimensions": [                                 // 维度组合（group-by，顺序=分组层次）
        { "field": "fiscal_period_id", "from": "voucher_header" },  // 跨层：取自父表凭证头
        { "field": "account_id" }                                  // 缺省取自本表
      ],
      "measures": [                                   // 汇总列
        { "field": "debit_amount",  "agg": "sum", "as": "sum_debit" },
        { "field": "credit_amount", "agg": "sum", "as": "sum_credit" }
      ]
    }
  ]
}
```

**字段语义**
- `id`/`name`/`caption`：新增对话框采集（必填）。`caption` 用 `{zh_CN:...}`，与字段/表 caption 一致，吃现成 `fieldCaption()` 多语言解析。
- `sourceColumns`：**汇总表字段自动继承源表字段**的落地——新增汇总表时把源表当前所有字段 id 快照进来；「再次继承」按钮 = 用源表当前字段 id 重新覆盖该数组（源表后续加/删列后用它重新同步）。维度/度量从这批继承列里选。
- `dimensions[].field` / `measures[].field`：引用 `sourceColumns` 里的列 id。
- `dimensions[].from`（可选）：维度来源表名，缺省=本表；填父链表名 → 跨层取维度。父子关系来自 `voucherSchema.relations`。
- `measures[].agg`：缺省继承该列字段自带 `field.agg`；`as` = 输出列名，缺省 `<agg>_<field>`。
- （`dimensions[].bucket` 时间粒度：v1 预留不做。）

> 维度候选 = 继承列里 `dimType∈{dimension,relation}`（+父链 `dimension`）；度量候选 = 继承列里 `dimType==='measure'`。全部复用字段现成 `dimType`/`agg`，不新造字段分类。

---

## 二、UI 方案（`portal-definition-manager.js`，DOC/BASE-DOC 端）

### 2.1 Tab 条改造（关键，最小侵入）
现状 `_renderFieldsPanelTabs()`（L1836-1842）固定渲两个 Tab，由 `this._fieldsPanelTab ∈ {'fields','json'}` 驱动，`select-fields-tab` 切换。

改为**动态 Tab 列表**，仅 DOC/BASE-DOC 端插入汇总 Tab：
```
[字段定义] [汇总表·期间×科目 ✕] [汇总表·科目 ✕] … [+] | [JSON源码]
```
- `_fieldsPanelTab` 取值扩展为 `'fields' | 'json' | 'summary:<summaryId>'`。
- 每个汇总 Tab 文案 = caption；Tab 内含 **删除按钮 ✕**（`data-action="remove-summary"`）。
- Tab 条末尾（JSON 之前）一个 **`+` 新增按钮**（`data-action="add-summary"`）——对应「增加按钮在表名标签上方」。
- 切到汇总 Tab：`select-fields-tab` 扩展识别 `data-tab="summary:<id>"`。

### 2.2 汇总 Tab 的内容（`_renderFieldsPanelBody` 增分支）
`_renderFieldsPanelBody(entry)` 现按 `_fieldsPanelTab` 二选一（L1844-1848），加第三分支 `_renderSummaryPanel(entry, summaryId)`：
- **顶部工具条**：标题(caption) + 「**再次继承源表列**」按钮（`data-action="resync-summary-columns"`）+ 删除按钮。
- **继承列区（只读）**：列出 `sourceColumns`（来自源表，自动继承），每列标 `dimType`，标识可作维度/度量。
- **维度组合区**：`添加维度`下拉（继承列中 `dimension/relation` + 父表 `dimension`，按来源表分组标注「本表/凭证头…」）；已选维度为可删除、可上下移的行（顺序=分组层次）。
- **汇总列区**：`添加汇总列`下拉（继承列中 `measure`）；每行 = 度量字段 + 聚合下拉(默认 `field.agg`) + 输出列名 + 标题。

交互范式照搬 `portal-flexible-combination-manager.js` 的 `_renderGroupNode`（chips + 折叠 + 增删行）。

### 2.3 新增汇总表对话框
点 `+` → 弹小对话框采集 **id / name / caption(zh_CN)**（必填校验：id 表内唯一、合法标识）。确认 → push 一条到 `entry.table.summaries`，`sourceColumns` = 源表当前字段 id 快照，`_fieldsPanelTab='summary:<新id>'`，`_markDirty()` + `_render()`。

### 2.4 新增 action（`_handleClick` 派发，L736+）
`add-summary` / `remove-summary`（带 summaryId）/ `resync-summary-columns` / `add-summary-dim` / `remove-summary-dim` / `move-summary-dim` / `add-summary-measure` / `remove-summary-measure`，以及对应 `_handleInput`（改 as/agg/caption）。控制器加 `_selectedSummaryId` 不需要（用 `_fieldsPanelTab` 即可承载选中态）。

### 2.5 Schema 视图（`PortalDefinitionSchema`）
把每个汇总表只读展开为「物化输出表」：维度列（带 refDict 显示字段）+ 度量列（带 agg 与 as），让用户看清汇总后表形。

### 2.6 存盘
**无新端点**。改完走现成 `_markDirty()` → 保存按钮 `_save()` → `POST /api/definitions/config`（整份 `_doc` 回写）。`summaries` 随 `voucherTables` 落到 `gl_md_doc_meta_v1.json`。

---

## 三、模型层 API（`cmx-meta-model.js`，纯叠加，可选）
- 新增轻量类 `CmxMetaSummary`：`id`/`name`/`caption`/`sourceTable`(父 CmxMetaTable)/`listInheritedColumns()`(读 sourceColumns→CmxMetaFieldRef)/`listDimensions()`(含跨层解析)/`listMeasures()`→`[{ref,agg,as}]`/`resolveOutputColumns()`/`toJSON()`。
- `CmxMetaTable.listSummaries()`：解析 `raw.summaries`，懒构建（沿用 `_buildFieldRefs` 缓存风格）。
- `CmxDOCMeta.listSummaries()` / `listSummariesByLevel(level)`：跨表汇总枚举。
- 跨层维度解析用现成 `voucherSchema.relations` 沿父链找字段。
- **不动 `load()` 主流程**：`getPath('voucherTables')` 已能拿原始 summaries；新类只富化 API。`toJSON()` 已保真回写。

---

## 四、后端 & 兼容
- **后端零改动**：`GET/POST /api/definitions/config` 与批量 `POST /api/definitions/batch` 均对整份文档透传未知 key（`getDefinitionsBatch` 返回整 doc，`applyBatchItem→load` 原样吃进、`toJSON` 原样回写）。
- 老文件无 `summaries` → Tab 条只有「字段定义/JSON源码」，行为不变。

---

## 五、与现有 `voucherSchema.aggregations` 的区别
| | `voucherSchema.aggregations`（已有） | `summaries`（本方案） |
|---|---|---|
| 语义 | 层级间**上卷**（明细→分录→头）回填父表某字段 | 单表按**维度 group-by** 的物化汇总表 |
| 产出 | 父行一个聚合值 | 一张多维汇总表（多列） |
| 维度 | 无（沿父子键） | 任意维度组合（可跨层取维度） |
二者并存，互不影响。

---

## 六、校验（实现阶段）
汇总需 ≥1 维度且 ≥1 汇总列；`as` 输出列名表内唯一；新增时 id 表内唯一+合法标识、caption.zh_CN 非空；维度/度量须存在于 `sourceColumns`；度量建议 `dimType==='measure'`、维度建议 `dimension`（否则软提示）。

---

## 七、关键改动文件清单
- `../../../cmx-portal-manager`（Tab 条动态化、`_renderSummaryPanel`、新增对话框、action 派发、`_selectedSummaryId`→复用 `_fieldsPanelTab`）— **主改**
- `packages/cmx-data-comp/src/lib/cmx-meta-model.js`（`CmxMetaSummary` + `listSummaries`，可选富化）
- `packages/cmx-data-comp/src/lib/__tests__/cmx-meta-model.test.js`（summaries 解析/跨层维度用例）
- `packages/cmx-data-comp/docs/dct-doc-meta-model.md`（补 summaries 契约）
- 后端：**无**

## 八、验证
- 单测：`npm test -w cmx-data-comp`（summaries 解析、sourceColumns 继承、跨层维度解析）。
- 浏览器：业务单据定义 → 选某层某表 → `+` 新增汇总表（填 id/name/caption）→ Tab 出现在 字段/JSON 之间 → 选维度+度量 → 「再次继承列」同步 → 删除 Tab → 保存 → 重开校验 JSON 落盘且回读一致。
