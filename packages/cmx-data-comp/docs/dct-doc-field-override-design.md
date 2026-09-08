# DCT / DOC 引用元数据的字段级详细设置方案（fieldOverrides）

> 状态：设计草案（评审用）。本文只描述方案，不动代码。
> 关联：`flexible-combination-overlay-design.md`（FLC overlay，同构思路下沉一层）、`dct-doc-meta-model.md`（DCT/DOC 模型）、`三元定义统一与跨DAM引用架构方案.html`（DRN）。

---

## 0. 一句话

> **今天 DCT/DOC 引用 base 元数据字段集后，引用来的字段是"只读展示、原样落库"的；本方案给它加一层「字段级 overlay」——让 DCT/DOC 能像编辑自己定义的列一样，对引用来的每个字段做详细覆盖设置（标题/校验/显示/引用字典/编辑控件…），而不复制整份字段、不改动被引用的 base 定义。这是 FLC overlay 模式往下沉一层的同构复用。**

---

## 1. 现状：引用是"只读的"，覆盖是"零散的"

### 1.1 base 元数据 = 冻结共享的字段集

`base_doc_meta_v1.json` / `base_dct_meta_v1.json` 顶层 `fieldSets` 是一批可复用字段组：

```jsonc
// base_doc_meta_v1.json
{ "fieldSets": {
    "documentTechnicalFields": { "fields": [
      { "id":"create_by","dataType":"BIGINT","fieldLength":20,"nullable":false,"caption":{"zh_CN":"创建人ID"} },
      { "id":"create_time","dataType":"DATETIME","nullable":false,"caption":{"zh_CN":"创建时间"} }, … ] },
    "documentIdentityFields": { "fields": [
      { "id":"doc_no","dataType":"VARCHAR","fieldLength":64,"nullable":false,"dimType":"attribute","caption":{"zh_CN":"单据编码/单据号"} }, … ] },
    …
} }
```

`CmxMetaFieldSet`（`cmx-meta-model.js`）加载时对这些字段 **`freezeDeep`**——它们是**跨表共享、只读**的对象。表访问字段时返回轻量 `CmxMetaFieldRef`，其 `.field` **指向共享字段对象**，`isFromFieldSet()===true`。

### 1.2 表怎么引用 —— 两种风格并存

| 端 | 引用写法 | 例 |
|---|---|---|
| **DCT** | 表上多个**命名键**，各指一个 base fieldSet 名 | `baseFieldSet` / `hierarchyFieldSet` / `auditFieldSet` / `effectiveFieldSet` / `disableFieldSet` |
| **DOC** | 表上一个**数组** `documentFieldSets` | `["documentIdentityFields","documentSourceFields","documentLifecycleFields","documentTechnicalFields"]` |

### 1.3 已经有一个"窄覆盖"了 —— `fieldRefDicts`

`voucher_header` 表上真实存在：

```jsonc
{ "tableName":"voucher_header",
  "documentFieldSets":["documentIdentityFields", …],
  "fieldRefDicts": { "document_type_id":"voucher_type", "entity_id":"acct_entity" } }
```

`fieldRefDicts` 是一个 **`{ fieldId → refDict }` 的表级映射**——它就是"对引用来的字段（`document_type_id`）覆盖一个属性（`refDict`）"。前端 `_docTableOwnFields` 已经在 import 时把它并回字段的 `refDict`。

> **这就是本方案的种子**：`fieldRefDicts` 已经证明了"表级、按 fieldId、覆盖引用字段某属性"这条路是通的、在用的。现在要做的是**把它从"只能覆盖 refDict 一个属性"泛化成"能覆盖任意字段属性"**。

### 1.4 编辑器现状 = 引用字段只读

`portal-definition-manager.js`（DCT/DOC 编辑器）：

- `this._baseFieldSets` 注释写死：**「只读展示用，不进 _doc」**（L296）。
- 字段分组（L523）：**引用的 base fieldSet 各一组，只读，在上；本表定义字段一组，可编辑，在下**。

所以今天的能力边界是:

| 能做 | 不能做 |
|---|---|
| 引用一整个 base fieldSet（勾选模板） | 改引用来的某个字段的标题/长度/校验/显示 |
| 通过 `fieldRefDicts` 覆盖引用字段的 `refDict` | 覆盖除 `refDict` 外的任何属性 |
| 定义本表自有字段并详细设置 | 让引用字段获得和自有字段一样的详编能力 |

**用户的需求正是补上右列。**

---

## 2. 目标与原则

1. **引用字段可详细覆盖**：DCT/DOC 能对引用来的任一字段，覆盖其任意可设属性（`caption`/`fieldLength`/`nullable`/`edit.*`/`display.*`/`refDict`/`validations`/治理属性…），编辑体验与自有字段一致。
2. **不复制、不改源**：覆盖以**增量（delta）**存储；base 定义**只读、不被改动**；被多表共享的 base 字段仍是单一事实源。
3. **同构复用 FLC overlay**：合并语义、诊断、编译路径与 `flc-overlay` 一致（deepMerge + `null` 删除 + `key+` 追加），把"下沉一层"落成同一套内核。
4. **两种引用风格统一承载**：DCT 命名键 / DOC 数组，覆盖层用统一结构，不改现有引用写法。
5. **向前兼容**：不写覆盖的表 = 恒等（现状不变）；`fieldRefDicts` 平滑并入新结构（保留读兼容）。
6. **读时展开、运行时无感**：消费方（grid/form/校验/物理建表）拿到的是展开后的完整字段，不感知覆盖层。

---

## 3. 数据模型：表级 `fieldOverrides`

在**表**上新增一个可选键 `fieldOverrides`——`{ fieldId → 覆盖对象 }`，覆盖对象形状与字段定义完全一致（只写差异）：

```jsonc
{
  "tableName": "voucher_header",
  "documentFieldSets": ["documentIdentityFields","documentTechnicalFields"],

  "fieldOverrides": {
    // 覆盖引用来的 doc_no：改标题、加长度、加正则校验、改编辑控件
    "doc_no": {
      "caption": { "zh_CN": "凭证号" },
      "fieldLength": 32,
      "pattern": "^[A-Z]{2}-\\d{6}$",
      "edit": { "mode": "cmx-text-input", "placeholder": "如 GL-000123" },
      "searchable": true
    },
    // 覆盖引用字段的引用字典（等价旧 fieldRefDicts，现纳入统一结构）
    "document_type_id": { "refDict": "voucher_type" },
    // 覆盖 create_time 显示格式；删除某个继承来的属性用 null
    "create_time": { "display": { "format": "date:YYYY-MM-DD HH:mm" }, "unique": null }
  }
}
```

### 3.1 覆盖对象的形状与合并语义

与 `flc-overlay.deepMerge` **完全一致**（同一套规则，双端已实现）：

| 情形 | 规则 |
|---|---|
| 标量键（`caption.zh_CN`/`fieldLength`/`edit.mode`…） | 覆盖 |
| 对象键（`edit`/`display`/`caption`） | 递归深合并（保留未覆盖子键） |
| 数组键（`validations`/`enumValues`） | 默认整体替换 |
| 删除某继承键 | 覆盖值写 `null` |
| 数组追加 | 键名后缀 `+`（`"validations+":[…]`） |

### 3.2 有效字段 = base 字段 ⊕ fieldOverrides[fieldId]

编译期对每个引用字段：

```
effectiveField = deepMerge(baseFieldSetField, table.fieldOverrides[field.id])
```

自有字段（表 `fields[]` 内联定义的）**不经过覆盖层**（它们本就可直接编辑）。

### 3.3 为什么挂"表级 map"而非"字段级内联"

- **不碰共享只读对象**：base 字段被 `freezeDeep` 且跨表共享，不能就地改；表级 map 是唯一不污染源的挂载点。
- **承接 `fieldRefDicts`**：现有覆盖已经是表级 map，同构、可平滑迁移。
- **引用字段无处内联**：引用字段在表里只是 fieldSet 名 + 展开，没有可写属性的宿主对象；map 提供了这个宿主。

---

## 4. 覆盖的边界（可改 / 禁改 / 警告）

引用字段的覆盖不是无限自由——base 承载着物理与治理主权，需分级（复用 FLC overlay §4.1 的主权思想，并配 §7 诊断）：

| 属性类 | 覆盖策略 | 理由 |
|---|---|---|
| **显示/交互**：`caption`/`label`/`display.*`/`edit.*`（除类型相关）/`placeholder`/`searchable`/`filterable` | ✅ 自由覆盖 | 纯表现层，表的主权 |
| **约束收紧**：`nullable:true→false`、加 `pattern`/`validations`/`unique` | ✅ 允许 | 表可比 base 更严 |
| **约束放松**：`nullable:false→true`、去掉 base 的必填 | ⚠️ warning | 可能破坏 base 契约，放行但提示 |
| **引用字典**：`refDict`/`refField`/`displayField` | ✅ 自由覆盖 | 承接 `fieldRefDicts` 的既有能力 |
| **物理类型**：`dataType`/`fieldLength`/`intDigits`/`decimalDigits` | ⛔ error（默认禁）| base 是物理主权；改了会与共享定义/已建表冲突 |
| **身份**：`id`/`name` | ⛔ error | 改 id = 换字段，应改用自有字段 |

> 物理类型是否**完全禁止**、还是像 FLC 那样"显示精度可改、存储精度禁改"，见 §11 决策点。

---

## 5. 编译与加载路径（读时展开）

### 5.1 现有加载链插入点

`CmxMetaModel.listFields(tableId)` / `CmxMetaFieldRef` 是所有消费方的字段入口。覆盖在**这一层**统一施加：

```
CmxMetaTable.listFieldRefs()
   → 对每个 ref：
       base = ref.field                                  // 共享只读 base 字段
       ov   = table.fieldOverrides?.[ref.id]             // 表级覆盖（含旧 fieldRefDicts 归并）
       ref.effectiveField = ov ? deepMerge(base, ov) : base   // 不改 base，产出新对象
   → 消费方（grid/form/校验/建表）读 effectiveField
```

- `ref.field`（共享 base）**保持不变**；新增 `ref.effectiveField`（或 `ref.get(prop)` 优先读覆盖）。
- 自有字段：`effectiveField === field`（无覆盖，恒等）。

### 5.2 双端一致

覆盖展开是**纯函数**（`deepMerge` 双端已实现），可放：
- **前端** `cmx-meta-model.js` 的 field-ref 访问处（编辑器、运行页即时生效）；
- **后端** `definitions/store.rs` 读定义时展开（对外 API 返回展开后字段，Rust 消费方无感）。

推荐**两端都做**：前端编辑器要"改完即见"，后端建表/校验要"落库一致"。展开逻辑复用同一套 deepMerge 规格，双端等价（已有 FLC overlay 的先例保证）。

### 5.3 `fieldRefDicts` 归并（兼容）

加载时把旧 `table.fieldRefDicts[id]` 视作 `fieldOverrides[id] = { refDict: <值> }` 合并（新 `fieldOverrides` 优先）。存量文件不动即生效；保存时可选归一为 `fieldOverrides`（见 §9 迁移）。

---

## 6. 编辑器 UX：让引用字段"可编辑"

`portal-definition-manager.js` 现状——引用字段是"上部只读组"。改造为：

### 6.1 引用字段行变为"可覆盖"

- 引用 fieldSet 组从**只读**变为**可覆盖编辑**：每行仍标注来源（`来自 documentTechnicalFields` 徽标 + base 值提示），但字段的可设属性变为可编辑。
- 复用**现有字段详编面板**（`renderFieldPanel` + `FIELD_SCHEMA`，DCT/DOC 端已完备），点引用字段行 → property 区出详编面板，与编辑自有字段**同一套 UI**。
- 编辑时：写入的是 `table.fieldOverrides[id]` 的**增量**，不是整份字段。面板控件显示"有效值"（base ⊕ override），改动即写 override delta。

### 6.2 视觉区分 override 状态

| 状态 | 呈现 |
|---|---|
| 未覆盖 | 值取自 base，行/字段显示"继承"底色 + base 来源徽标 |
| 已覆盖某属性 | 该属性高亮 + "已覆盖 ✎" 标记 + 悬浮显示 base 原值 |
| 覆盖被禁（物理类型） | 控件禁用 + tooltip"物理类型由 base 定义，不可覆盖" |

### 6.3 一键还原

每个被覆盖属性/整字段提供"还原为 base"（删除对应 `fieldOverrides[id]` 键/整项）——对应 deepMerge 的删除语义。

### 6.4 编辑器复用要点

- **无需新 adapter**：DCT/DOC 编辑走 `makeDctAdapter`（`end:'DCT'`/`'DOC'`），schema `FIELD_SCHEMA` 三端已统一；overlay 只改"字段对象从哪来、改动写哪去"，不改 schema/adapter。
- 关键改动点集中在：字段行渲染（去只读）、写回目标（改写 `fieldOverrides` 而非字段本体）、来源/覆盖状态标注。

---

## 7. 诊断（复用 FLC 诊断框架）

新增覆盖类诊断码（与 `flc-ref-diagnostics` 同构，接入保存期校验）：

| code | 级别 | 触发 |
|---|---|---|
| `OVERRIDE_FIELD_NOT_FOUND` | error | `fieldOverrides` 的 fieldId 不在该表任何引用/自有字段中（base 删了字段） |
| `OVERRIDE_CHANGES_PHYSICAL_TYPE` | error | 覆盖了 `dataType`/`fieldLength`/…（§4 禁改） |
| `OVERRIDE_CHANGES_IDENTITY` | error | 覆盖了 `id`/`name` |
| `OVERRIDE_RELAXES_CONSTRAINT` | warning | 把 base 非空/唯一放松 |
| `OVERRIDE_REDUNDANT` | warning | 覆盖值与 base 完全相同（无效覆盖，建议删除） |
| `OVERRIDE_UNKNOWN_KEY` | warning | 覆盖了 schema 未知键（放行，向前兼容） |

**变更影响**：因为覆盖锚定 base 字段，改 base fieldSet 时可列出所有引用它并施加了覆盖的表——覆盖是否仍然有效（如 base 删了被覆盖的字段 → 悬空覆盖告警）。

---

## 8. 端到端示例（voucher_header）

**现状**（引用字段只读，仅 refDict 能窄覆盖）：
```jsonc
{ "tableName":"voucher_header",
  "documentFieldSets":["documentIdentityFields","documentTechnicalFields"],
  "fieldRefDicts": { "document_type_id":"voucher_type" } }
```

**方案后**（引用字段可详细覆盖）：
```jsonc
{ "tableName":"voucher_header",
  "documentFieldSets":["documentIdentityFields","documentTechnicalFields"],
  "fieldOverrides": {
    "document_type_id": { "refDict":"voucher_type" },        // 旧 fieldRefDicts 归入
    "doc_no": {                                              // 新增：详细覆盖引用字段
      "caption": { "zh_CN":"凭证号" },
      "fieldLength": 32,
      "pattern": "^[A-Z]{2}-\\d{6}$",
      "edit": { "mode":"cmx-text-input", "placeholder":"GL-000123" },
      "searchable": true
    },
    "create_time": { "display": { "format":"date:YYYY-MM-DD HH:mm" } }
  } }
```

编译后 `doc_no` 的有效定义 = base 的 `{id,dataType:VARCHAR,nullable:false,…}` ⊕ 上述覆盖 = 完整字段，进 grid/form/建表；base 的 `documentIdentityFields.doc_no` **未被改动**，其它引用它的表不受影响。

---

## 9. 迁移与兼容

| 项 | 策略 |
|---|---|
| 存量文件（无 `fieldOverrides`） | 恒等，行为不变 |
| 存量 `fieldRefDicts` | 加载时归并为 `fieldOverrides[id].refDict`（读兼容）；保存时可选归一写入 `fieldOverrides` 并移除 `fieldRefDicts`（一次性迁移工具，等价验证：展开后字段逐键相等） |
| base 定义 | 全程只读，不改 |
| 运行时消费方 | 无改动（拿到的是展开后字段） |

---

## 10. 与三元统一 / DRN 的关系

- 本方案是 **DCT/DOC 内部**"引用 base 字段 + 覆盖"，与 FLC overlay（引用 DOC 列 + 覆盖）**同构**——三层同一套 overlay 内核（deepMerge / 诊断 / 读时展开），只是引用目标不同（base fieldSet / DOC 表列）。
- 跨 DAM 引用 base：现 `baseDocMetaRef.file` 是裸文件名（约定落 `base/`）。将来可升级为 BASE-kind DRN（`drn:base/_/_/BASE/base_doc_meta@1`），使覆盖也能跨 DAM 锚定——但**本方案不依赖它**，可独立落地。
- `fieldOverrides` 的 `refDict` 覆盖值，天然可写 DRN/别名（我们上一步已让 refDict 支持 `@别名`/`drn:`），跨模块引用字典与字段覆盖两个能力正交叠加。

---

## 11. 待评审决策点

1. **物理类型可否覆盖**：完全禁（§4，最安全）vs 允许"显示精度可改、存储类型禁改"（对齐 FLC overlay 的 display/物理分权）。
2. **覆盖挂载点**：表级 `fieldOverrides` map（本文，承接 `fieldRefDicts`）vs 别的形态（如按 fieldSet 分组的覆盖）。建议前者。
3. **展开时机**：读时展开（存 overlay，保 base 单一事实源，推荐）vs 保存时物化（存完整字段，省运行时但丢 SSOT）。
4. **`fieldRefDicts` 处置**：只读兼容长期保留 vs 迁移工具一次性归一为 `fieldOverrides` 后废弃。
5. **DCT 命名键 vs DOC 数组**：`fieldOverrides` 统一用 `{fieldId→ov}` 承载两端（本文）——确认 DCT 侧多命名键（`baseFieldSet`/`auditFieldSet`…）展开后 fieldId 不重名（若重名需限定到 fieldSet 名，见下）。
6. **同名字段消歧**：极端情况下两个被引用 fieldSet 含同 id 字段，则 `fieldOverrides` 的键需支持 `<fieldSetName>.<fieldId>` 限定形式；默认裸 fieldId，冲突时才需限定。

---

## 12. 落地顺序（每步可独立验证，运行时零改动）

| 步 | 内容 | 验证 |
|---|---|---|
| 1 | 编译层：`CmxMetaFieldRef` 加 `effectiveField = deepMerge(base, override)`；`fieldRefDicts` 归并 | 现有定义展开后逐键等价（含 voucher_header 的 refDict） |
| 2 | 后端 `definitions/store.rs` 读时展开同规格 | 前后端展开结果一致 |
| 3 | 诊断：§7 覆盖类诊断接入保存校验 | 构造禁改/悬空/冗余用例断言拦截 |
| 4 | 编辑器：引用字段行去只读 + 详编面板写 `fieldOverrides` delta + 来源/覆盖标注 + 一键还原 | 在 voucher_header 上覆盖 doc_no，保存、展开、grid 生效 |
| 5 | 迁移工具：`fieldRefDicts` → `fieldOverrides` 归一（可选） | 迁移前后展开等价 |
| 6 | DCT 侧同样启用（命名键场景 + 同名消歧） | DCT 引用字段覆盖端到端 |
