# 关系字典（RELATION）完善方案

> 状态：设计草案（评审用）。本文只描述方案，不动代码。
> 关联：`DCT数据字典存储与加载服务方案.html`（Q1 明确把 RELATION 标为"待确认/风险"）、`dct-doc-field-override-design.md`（fieldOverrides/fieldRefDicts 机制）、`dct-doc-meta-model.md`（DCT 模型）。

---

## 0. 一句话

> **关系字典（RELATION）用来把「一个主分组字典的分组节点」与「一个辅助业务字典的条目」多对多地关联起来——一行关系记录 = 「某分组节点 ⊇ 某业务条目」。目前它是半成品：base 有骨架字段集 `relationCommonFields`，但新建时不生成关系专属结构、主辅字典靠手填的 `fieldRefDicts` 绑定且键与 base 字段对不上、后端零专门支持、无数据装载形态。本方案把它补全为一等的字典类型。**

---

## 1. 现状盘点：半成品缺在哪

### 1.1 概念（已确认）

关系字典表达 **主分组字典 ↔ 辅助业务字典** 的多对多成员关系。真实样例 `acct_entity_group`：

```jsonc
{
  "dictMeta": { "dictCode": "acct_entity_group", "dictKind": "RELATION",
    "tableName": "new_dict", "dictName": "核算主体管理层级", ... },  // ← 半成品痕迹
  "fields": [],
  "extraFieldSets": ["relationCommonFields", "dictionaryAuditFields", ...],
  "fieldRefDicts": {
    "group_id":    "acct_entity_hierarchy",   // 主：分组字典（层级树）
    "business_id": "acct_entity"              // 辅：业务字典（核算主体）
  }
}
```

### 1.2 base 已备的骨架：`relationCommonFields`

`base_dct_meta_v1.json` 里专门给关系字典准备的公共字段集，天然三段式：

| 段 | 字段 | dimType | 语义 |
|---|---|---|---|
| 关系自身 | `id` / `code` / `name` | — | 这条关系记录的标识 |
| **主·分组节点** | `hierarchy_node_id` / `_code` / `_name` | `dimension`(id 槽) | 指向主分组字典的一个节点 |
| **辅·业务数据** | `business_data_id` / `_code` / `_name` | `dimension`(id 槽) | 指向辅助业务字典的一个条目 |

两个 `dimension` 槽位（`hierarchy_node_id` / `business_data_id`）就是"绑到哪个字典"的挂载点。

### 1.3 五个具体缺口

| # | 缺口 | 证据 |
|---|---|---|
| **G1 键对不上** | `fieldRefDicts` 用 `group_id`/`business_id`，但 `relationCommonFields` 的维度槽实际叫 `hierarchy_node_id`/`business_data_id` | base 字段 id 列表 vs 样例 fieldRefDicts 键 |
| **G2 新建无关系骨架** | `_addDict` 对所有类型生成同一骨架（`baseFieldSet:'dictionaryCommonFields'` + `fields:[]`），RELATION 不会自动带 `relationCommonFields` / 主辅绑定 | `_addDict(kind)` 无 RELATION 分支 |
| **G3 后端零支持** | `dict/schema.rs` 等后端模块搜不到任何 `RELATION`/`dictKind` 分支；`DictSchema` 结构无主辅字段 | grep 后端 dict/*.rs 无命中 |
| **G4 无编辑体验** | 编辑器 RELATION 仅是下拉标签；无"选主字典 + 选辅字典"的配置 UI；主辅靠手改 `fieldRefDicts` | `DICT_KINDS` 里仅 label；无 RELATION UI |
| **G5 无数据装载形态** | 无关系数据实例；文档 Q1 明确"装载形态待确认（flat vs JOIN）" | dict/entries、seeds 无关系数据；DCT 文档 Q1 |
| **G6 半成品痕迹** | `tableName:"new_dict"`、`dictName` 与主字典重名、`fields:[]` | 样例 dictMeta |

### 1.4 与刚落地的 fieldOverrides 机制的交叉（重要）

上一轮把 `fieldRefDicts` 归并进 `fieldOverrides` 并在保存时物化/废弃 `fieldRefDicts`。**关系字典重度依赖 `fieldRefDicts`**（主辅绑定就存在这里），但因 G1 键对不上，`materializeTable` 会把 `group_id`/`business_id` 判为"解析不到 base 字段"→ 走非破坏性保留 + `OVERRIDE_FIELD_NOT_FOUND` 诊断。**这既暴露了 G1，也说明完善方案必须与 fieldOverrides 机制对齐**（见 §5）。

---

## 2. 目标与原则

1. **关系字典成为一等类型**：新建即生成规范骨架（关系公共字段集 + 主辅绑定占位），无需手填。
2. **主辅绑定规范化**：用 base 的真实槽位键（`hierarchy_node_id` / `business_data_id`），消除 G1；把"绑定"从散落的 `fieldRefDicts` 抬升为 dictMeta 上显式的 `relation` 声明。
3. **复用不重造**：绑定复用现有 `refDict` 字段级引用能力 + DRN（可跨 DAM 引用主/辅字典）；覆盖复用 `fieldOverrides`；不新造一套并行机制。
4. **数据装载先 flat**：关系数据落成冗余两段式行（主 id/code/name + 辅 id/code/name），与 `relationCommonFields` 一致；JOIN 增强后置（对齐文档 Q1 建议）。
5. **向前兼容**：存量普通字典不受影响；`acct_entity_group` 这类半成品可一键迁移修正（§6）。

---

## 3. 数据模型：dictMeta 上显式声明 `relation`

把主辅绑定从"手填 fieldRefDicts"抬升为 **dictMeta.relation** 显式结构（单一事实源、可校验、可驱动 UI）：

```jsonc
{
  "dictMeta": {
    "dictCode": "acct_entity_group",
    "dictName": "核算主体分组关系",
    "dictKind": "RELATION",
    "tableName": "gl_acct_entity_group",       // 规范物理表名（非 new_dict）
    "idField": "id", "codeField": "code", "labelField": "name",
    "relation": {                               // ← 新增：关系绑定声明
      "master": {                               // 主·分组字典
        "dict": "acct_entity_hierarchy",        // 可写 DRN：drn:fi/…/DCT/acct_entity_hierarchy
        "nodeField": "hierarchy_node_id",       // 绑到 relationCommonFields 的主槽
        "valueField": "code", "labelField": "name"
      },
      "auxiliary": {                            // 辅·业务字典
        "dict": "acct_entity",
        "memberField": "business_data_id",      // 绑到 relationCommonFields 的辅槽
        "valueField": "code", "labelField": "name"
      },
      "cardinality": "many-to-many",            // 语义：一个分组含多条目、一条目可属多组
      "uniqueMember": true                       // 同一(主节点,辅条目)对唯一（防重复成员）
    }
  },
  "extraFieldSets": ["relationCommonFields", "dictionaryAuditFields", "dictionaryEffectiveFields", "dictionaryDisableFields"],
  "fields": []
}
```

### 3.1 `relation` → 字段绑定的编译

编译期（读时/加载时）把 `dictMeta.relation` 展开为字段级 `refDict`（复用现有能力），键用 base 真实槽位：

```
relation.master.dict     → 字段 hierarchy_node_id 的 refDict（+ refField=valueField, displayField=labelField）
relation.auxiliary.dict  → 字段 business_data_id 的 refDict
```

即 `relation` 是**作者可读、可校验的高层声明**；落到运行时仍是 `relationCommonFields` 的两个维度槽绑定字典——**不新造运行机制，只加一层规范声明**。存量 `fieldRefDicts`（键正确的）继续兼容。

### 3.2 为什么放 dictMeta 而非散在 fieldRefDicts

- **单一事实源**：主辅关系是字典的"元信息"，属 dictMeta；散在 fieldRefDicts 无法表达 cardinality/uniqueMember 等关系语义。
- **可驱动 UI**：编辑器据此渲染"选主字典 / 选辅字典"面板（§4）。
- **可校验**：主/辅字典存在性、槽位字段存在性、DRN 可见性（§5）。
- **消除 G1**：绑定键由 `relation.master.nodeField` 显式指定，不再手填错键。

---

## 4. 编辑器：关系字典专属配置

`portal-definition-manager.js` 现状 RELATION 仅是标签。补：

### 4.1 新建即规范骨架（补 G2）

`_addDict('RELATION')` 生成关系专属骨架：
- `dictMeta.dictKind='RELATION'` + 空 `relation` 占位（master/auxiliary 待选）
- `extraFieldSets: ['relationCommonFields', ...审计/生效/禁用]`（而非 `dictionaryCommonFields`）
- 规范 `tableName`（用 dictCode，不留 `new_dict`）

### 4.2 关系配置面板（补 G4）

选中关系字典时，property 区显示专属面板（而非普通字段表）：

```
┌─ 关系绑定 ─────────────────────────────────┐
│ 主·分组字典  [ acct_entity_hierarchy ▾ ]  值列[code▾] 显示[name▾] │
│ 辅·业务字典  [ acct_entity          ▾ ]  值列[code▾] 显示[name▾] │
│ 基数         (●) 多对多  ( ) 一对多               │
│ 成员唯一     [✓] 同一(分组,条目)对不重复          │
└────────────────────────────────────────────┘
```

- 主/辅字典下拉：复用现有"可引用字典"数据源（`_dictCodes` / DRN 选择器），支持跨 DAM。
- 选定后写 `dictMeta.relation`，编译层自动同步两个维度槽的 `refDict`（§3.1）。
- 下方仍可展开 `relationCommonFields` 的字段（走上一轮的**引用字段可覆盖**能力——如给 `hierarchy_node_name` 改标题为"所属分组"）。

### 4.3 成员数据维护（补 G5，可后置）

关系字典的"数据"= 一批(主节点, 辅条目)对。数据维护页（增强项）：选一个主分组节点 → 勾选辅助字典的多个条目 → 生成关系行。先支持 flat 行编辑，可视化穿梭框后置。

---

## 5. 校验与诊断（复用 fieldOverrides 诊断框架）

新增关系类诊断码（接入保存期）：

| code | 级别 | 触发 |
|---|---|---|
| `RELATION_MASTER_MISSING` | error | `relation.master.dict` 未配置或解析不到 |
| `RELATION_AUX_MISSING` | error | `relation.auxiliary.dict` 未配置或解析不到 |
| `RELATION_SLOT_NOT_IN_FIELDSET` | error | `nodeField`/`memberField` 不在 `relationCommonFields`（防 G1 复发） |
| `RELATION_FIELDSET_NOT_REFERENCED` | warning | RELATION 字典未引用 `relationCommonFields`（缺骨架） |
| `RELATION_SELF_REFERENCE` | warning | 主辅指向同一字典（可能是配置笔误，如样例 dictName 重名） |
| `RELATION_VISIBILITY_DENIED` | error | 主/辅字典的 DRN 可见性不允许被本字典引用（跨 DAM，复用 §DRN） |

**与 fieldOverrides 的对齐**：把 §3.1 的 `relation → refDict` 编译，安排在 `materializeTable` 之前，使关系绑定用**正确的 base 槽位键**落地——从根上避免上一轮遇到的 `OVERRIDE_FIELD_NOT_FOUND`（G1 交叉问题）。

---

## 6. 迁移：修正半成品 `acct_entity_group`

| 项 | 现状 | 迁移后 |
|---|---|---|
| `tableName` | `new_dict` | `gl_acct_entity_group` |
| `dictName` | "核算主体管理层级"（与主字典重名） | "核算主体分组关系" |
| 主辅绑定 | `fieldRefDicts: {group_id, business_id}`（键错） | `dictMeta.relation: {master, auxiliary}`（正确槽位键） |
| `fieldRefDicts` | 保留（键对不上，被诊断） | 删除（已由 relation 表达） |

迁移工具：识别 `dictKind:RELATION` 且带旧 `fieldRefDicts` 的字典 → 按值（`acct_entity_hierarchy`/`acct_entity`）推断 master/auxiliary → 写 `relation` → 删旧键。等价验证：编译后两个维度槽的 refDict 与迁移前语义一致。

---

## 7. 数据装载形态（对齐文档 Q1）

- **先 flat**（推荐，文档已建议）：关系数据落成冗余行，`relationCommonFields` 已含主/辅的 code/name 冗余列，前端下拉直接读，无需 JOIN。
- **JOIN 增强**（后置）：需要实时取主/辅最新名称时，后端按 `relation.master/auxiliary.dict` 做 JOIN。
- 落地：先补 `relationCommonFields` 的 flat 读写（走现有 dict 数据 API），JOIN 作为 §9 增强。

---

## 8. 与现有机制的关系（复用全景）

| 关系字典要素 | 复用的现有机制 |
|---|---|
| 主/辅字典绑定 | 字段级 `refDict` + DRN（跨 DAM 引用主/辅字典） |
| 关系公共字段 | base fieldSet `relationCommonFields`（已存在） |
| 引用字段详细覆盖 | 上一轮 `fieldOverrides`（如改槽位字段标题） |
| 绑定/覆盖诊断 | `diagnoseTableOverrides` 框架 + 新增关系码 |
| 主辅字典可见性 | DRN `visibility` 判定 |

**关系字典 = 一个引用 `relationCommonFields` + 在 dictMeta 声明 master/auxiliary 绑定的字典**——不是新数据结构，是现有能力的组合 + 一层关系语义声明。

---

## 9. 落地顺序（每步可独立验证，运行时零改动）

| 步 | 内容 | 风险 | 验证 |
|---|---|---|---|
| 1 | `dictMeta.relation` schema + `relation → refDict` 编译（用正确槽位键） | 低 | 对 `acct_entity_group` 编译，两槽 refDict 指向正确主/辅字典 |
| 2 | §5 关系诊断接入保存校验 | 低 | 构造缺主/缺辅/槽位错/自引用用例断言拦截 |
| 3 | `_addDict('RELATION')` 生成关系骨架（补 G2） | 低 | 新建关系字典即带 relationCommonFields + relation 占位 |
| 4 | 编辑器关系配置面板（选主/辅字典 + 基数 + 唯一）（补 G4） | 中 | 选主辅字典→写 relation→编译→槽位绑定生效 |
| 5 | 迁移工具修正 `acct_entity_group`（补 G6，消 G1） | 中 | 迁移前后编译等价，旧 fieldRefDicts 清除 |
| 6 | 关系成员数据 flat 读写（补 G5） | 中 | 建一批(主节点,辅条目)关系行，前端下拉可读 |
| 7（增强） | JOIN 装载 / 穿梭框成员维护 UI | 中 | 后置 |

---

## 10. 待评审决策点

1. **绑定声明位置**：dictMeta.relation（本文，可校验可驱动 UI）vs 继续用 fieldRefDicts（改键即可，最小改动但表达力弱）。
2. **主/辅方向语义**：是否固定"master=分组字典、auxiliary=业务字典"，还是允许任意两字典关联（更通用，但失去"分组含成员"的语义约束）。
3. **基数**：只支持多对多，还是也要一对多/一对一（影响 uniqueMember 与数据校验）。
4. **数据装载**：先 flat 是否可接受（前端下拉靠冗余 code/name），JOIN 后置？（对齐文档 Q1）
5. **主辅同字典**：是否允许（自关系，如"科目 ↔ 科目"的对应关系），还是一律按 `RELATION_SELF_REFERENCE` 警告。
6. **`relationCommonFields` 槽位命名**：沿用 `hierarchy_node_*` / `business_data_*`（偏"层级+业务"语义），还是改为更中性的 `master_*` / `aux_*`（更通用）。涉及 base 定义与存量，需权衡。
