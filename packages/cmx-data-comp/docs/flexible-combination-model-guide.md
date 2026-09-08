# FlexibleCombination 模型组件使用说明

> 在 CMXHTMLDesigner / CMXPortalManager 体系内，把"按上下文（一个或多个维度的组合）动态生成 `CmxColumnModel` 列"这件事，沉淀成一个**声明式模型组件**。
>
> 你只需在 Models 面板里拖一个 `FlexibleCombination`、配置目标 `CmxColumnModel` 以及数据来源，剩下的—— fetch、缓存、解析、列编译、事件派发、可视组件重渲——全部由组件自动完成。

---

## 1. 这是什么

`FlexibleCombination` 是 cmx-data-comp 的模型类，对应 designer 调色板里 **CMX 模型 → 🧭 FlexibleCombination**。

它把以下流程整体封装：

```
锚点维度值（如 {account:'1122'} 或 {txType:'sale',productType:'goods'}）
   ↓
取弹性组合规则 ─── 三选一：
                  ① 自己调后端服务（loadByAnchor）
                  ② 运行时 JSON 直设（setCombination）
                  ③ 模型属性 inlineData 声明式直设（开页生效）
   ↓
FlexibleCombinationEngine 编译列 ─── 含 calcFormula / onPickDimension 等交互函数
   ↓
写入目标 CmxColumnModel.setMembers(columns)
   ↓
该 CmxColumnModel 派发 columns-changed
   ↓
所有绑定该模型的可视组件（cmx-revo-grid 等）自动重渲，并派发 cmx-columns-changed
   ↓
页面层挂收尾钩子（如 setTotals + tuneGrid）
```

**特征**：

- **模型组件**：和 `CmxDataSet` / `CmxMasterSlave` / `CmxColumnModel` 平级，在 `__designer_meta__.models` 里声明
- **零页面胶水**：业务页只剩一句 `loadByAnchor({...})` 或干脆什么都不写（用 `inlineData`）
- **多消费者**：同一份 `CmxColumnModel` 被多个组件绑定时，列变更通过事件自动广播
- **缓存**：按锚点签名缓存最近结果，重复锚点不再请求后端
- **回退**：服务失败或无匹配规则 → 自动还原到列模型最初定义的成员

---

## 2. 在 Models 面板中加一个 `FlexibleCombination`

1. 打开 **Page Data → Models** Tab
2. 从调色板 **CMX 模型** 分组拖出 **🧭 FlexibleCombination**
3. 上方实例列表里选中它，下方属性面板出现编辑表单

### 属性字段速查

| 字段 | 说明 |
|---|---|
| **实例名** `instanceId` | 运行时通过 `host.<instanceId>` 访问；命名建议 `<场景>CtxProfile`（如 `detailFlexibleCombination`） |
| `domain` / `app` / `module` | DAM 三段——定位后端存储的位置（对应 `data/meta/flexible-combination/<domain>/<app>/<module>/<scenario>.json`） |
| `scenario` | 业务场景，如 `account`（科目辅助核算）、`trade`（交易明细）。同一 DAM 下可以有多个 scenario 文件 |
| **`columnModelId`** | 目标 `CmxColumnModel` 实例名（**关键**：rule 来后调用它的 `.setMembers()`）。输入框带 datalist，列出同页所有 `CmxColumnModel` 实例 |
| `serviceFn` | **可选**。页面服务函数名（在 **Services** 面板里声明的 REST/RPC/GraphQL）。**填了则优先**走该服务，URL/headers 可在服务面板里改 |
| `apiPath` | 仅在没有 `serviceFn` 时使用，默认 `/api/flexible-combination/rule` |
| `anchorDimensions` | 锚点维度名列表，逗号分隔。留空则跟随后端 `cfg.anchorDimensions` |
| **`inlineData`** | **可选 JSON**——填了则**优先生效**，开页就直接套用，不调后端 |

### `inlineData` 的两种 JSON 形态

**形态 A：单规则**（最常见，与后端 `/api/flexible-combination/rule` 返回结构一致）：

```jsonc
{
  "rule": {
    "id": "demo",
    "detail": {
      "fields": [
        { "code": "customer", "kind": "dimension", "dimension": "customer", "edit": { "mode": "select", "required": true } },
        { "code": "remark",   "kind": "text",      "edit": { "mode": "input" } },
        { "code": "amount",   "kind": "measure",   "edit": { "mode": "input" } }
      ]
    }
  },
  "dimensions": {
    "customer": { "name": "客户", "valueType": "select", "values": [ { "code": "C-001", "name": "上海科技" } ] }
  }
}
```

**形态 B：多规则配置 + 锚点选规则**（与 `/api/flexible-combination/config` 返回结构一致）：

```jsonc
{
  "rules":      [ ...多条 rule... ],
  "dimensions": { ...所有维度... },
  "anchor":     { "account": "1122" }   // 在 rules 里按 anchor 解析一条
}
```

> 也接受 `{ "config": { rules, dimensions }, "anchor": {...} }` 套层形式（便于把后端 `/config` 整份直接喂入）。
>
> 不合法（既无 `rule` 也无 `rules`）→ `console.warn`，**不派发**事件，目标列模型保持原状。

属性面板下方有**即时校验状态**：

- ✓ 绿色："单规则 JSON 已就绪" / "多规则配置已就绪（N 条）"
- ✗ 红色："JSON 解析失败：…"

---

## 3. 运行时 API（`host.<instanceId>.*`）

### 3.1 `loadByAnchor(anchorValues)` — 走后端

```js
host.detailFlexibleCombination.loadByAnchor({ account: row.acctCode })
// → Promise<{ ruleId, fromCache }>
```

- 锚点签名命中缓存 → 直接套用，不请求后端
- 未命中 → 按下面三档优先级取数：
  1. **`props.resolver`**（构造时显式注入的函数）—— 最高优先（一般不用，留给程序化场景）
  2. **`props.serviceFn`** → `host[serviceFn]({domain, app, module, scenario, ...anchor})` —— 推荐
  3. 默认 `fetch(apiPath + '?...')`
- 成功 → `cp.setRule({rule, dimensions, anchor})` → 写列模型
- 失败 → 还原到列模型初始成员，派发 `flexible-combination-error`

### 3.2 `setCombination(json)` — 运行时 JSON 直设

```js
// 单规则
host.detailFlexibleCombination.setCombination({ rule, dimensions })

// 多规则 + 锚点
host.detailFlexibleCombination.setCombination({ rules, dimensions, anchor: {account:'1122'} })

// 多规则只一条（自动选）
host.detailFlexibleCombination.setCombination({ rules: [oneRule], dimensions })

// 后端 /config 整份直接喂
host.detailFlexibleCombination.setCombination({ config: backendConfig, anchor: {account:'1122'} })
```

返回 `{ ruleId, found }`。

> `setCombination` 与 `loadByAnchor` 可在同一页面交替使用——后者会缓存，前者直接套用；都是改的同一个 `CmxColumnModel`，视图自动跟。

### 3.3 `setRule({rule, dimensions, anchor?})` — 单规则直设（细粒度）

`setCombination` 内部最终走它；如果你已经手握 `{rule, dimensions}` 形态且不想让 `setCombination` 走形态判断，可以直接用：

```js
host.detailFlexibleCombination.setRule({ rule: serverResponseRule, dimensions: serverResponseDims, anchor: {account:'1122'} })
```

### 3.4 `clear()`

清空所有缓存，把目标 `CmxColumnModel` 还原到初始 members（你在 `CmxColumnModel.props.columns` 里配置的那一套），派发 `flexible-combination-cleared`。

### 3.5 `invalidateCache(anchor?)`

- 传 `anchor` → 只清掉该锚点的缓存（下次 `loadByAnchor` 会重新取后端）
- 不传 → 清空全部缓存

---

## 4. 三种典型用法（场景对照）

### 4.1 后端驱动（推荐：voucher / trade）

> 列配置随业务变化、由后端集中维护、多人协作场景。

**Models 面板**：

```jsonc
{
  "modelType": "FlexibleCombination",
  "instanceId": "detailFlexibleCombination",
  "props": {
    "domain": "fi", "app": "gl", "module": "fi_gl_base_data",
    "scenario": "account",
    "columnModelId": "detailModel",
    "serviceFn": "resolveFlexibleCombination",
    "apiPath": "/api/flexible-combination/rule"
  }
}
```

**Services 面板**（声明一个 GET REST，URL 留 `/api/flexible-combination/rule`，无 body）：

```jsonc
{ "name": "resolveFlexibleCombination", "type": "rest", "url": "/api/flexible-combination/rule", "method": "GET" }
```

**页面函数**（仅一行）：

```js
function onEntrySelected(e) {
  var rowId = e?.detail?.id; if (!rowId) return
  var row = host.ms.getRow('head.items', rowId)
  host.detailFlexibleCombination.loadByAnchor({ account: row?.acctCode || '' })   // 就这一行
}
```

**收尾**（一次性挂在 init 末尾）：

```js
host.detailGrid.addEventListener('cmx-columns-changed', () => {
  host.detailGrid.setTotals({ label: '合计', columns: ['amount'] })
  host.tuneGrid(host.detailGrid)
})
```

### 4.2 JSON 直设（无后端）

> 演示页、内部工具、列结构非常固定、不想引入后端时。

**Models 面板**：

```jsonc
{
  "modelType": "FlexibleCombination",
  "instanceId": "demoCtxProfile",
  "props": {
    "columnModelId": "detailModel",
    "inlineData": {
      "rule": {
        "id": "demo",
        "detail": {
          "fields": [
            { "code": "name",   "kind": "text",    "caption": "名称",  "edit": { "mode": "input" } },
            { "code": "score",  "kind": "measure", "caption": "分数",  "edit": { "mode": "input" },
              "display": { "decimals": 2, "thousand": "," } },
            { "code": "color",  "kind": "attribute", "dataType": "color", "caption": "颜色",
              "edit": { "mode": "input" } }
          ]
        }
      },
      "dimensions": {}
    }
  }
}
```

页面函数：**无**。开页时 `initPageModels` 自动 `setCombination(inlineData)`，列模型就位，grid 自动渲染。

### 4.3 运行时收到外部 JSON 后套用

> 与第三方系统对接、从消息总线/MCP/WebSocket 收到列定义片段时。

```js
async function onExternalProfileMessage(payload) {
  // payload 形如 { rule, dimensions } 或 { rules, dimensions, anchor }
  const ret = host.detailFlexibleCombination.setCombination(payload)
  if (!ret.found) console.warn('未能解析 combination JSON')
}
```

不需要后端、不调 service，纯客户端把 JSON 喂进去。

---

## 5. 数据流（端到端）

```
                      用户在主表选某行 (onEntrySelected)
                                  │
                                  ▼
                  host.detailFlexibleCombination.loadByAnchor({account:'1122'})
                                  │
                  ┌───────────────┴───────────────┐
              缓存命中                          缓存未命中
                  │                                │
                  ▼                                ▼
        (复用上次 CmxColumn[])           host.resolveFlexibleCombination({domain,..,account:'1122'})
                  │                                │
                  │                       (rule, dimensions) ← 后端
                  │                                ▼
                  │                FlexibleCombinationEngine ────► CmxColumn[]
                  │                                │
                  └────────────────► detailModel.setMembers(columns)
                                                   │
                                          『columns-changed』
                                                   │
                          ┌────────────────────────┼──────────────────┐
                          ▼                        ▼                  ▼
                cmx-revo-grid 1 重渲     cmx-revo-grid 2 重渲     未来 cmx-ui5-table
                          │
                          ▼
              『cmx-columns-changed』(grid 派发)
                          │
                          ▼
              host.onDetailColumnsChanged() ─── setTotals + tuneGrid
```

---

## 6. FlexibleCombination ↔ CmxColumnModel 联动

> 这是整个机制的核心：`FlexibleCombination` 不直接碰视图，**只与一个 `CmxColumnModel` 实例通过事件解耦联动**，所有绑该模型的可视组件自动跟随。

### 6.1 关系拓扑

```
                    1 : 1
FlexibleCombination ────────────► CmxColumnModel
   │ 不接触视图                │
   │                          │ 1 : N
   │                          ▼
   │            cmx-revo-grid #A   cmx-revo-grid #B  …  cmx-ui5-table（未来）
   │            (data-cmx-model-id 都指向同一 CmxColumnModel)
   │
   └─► 写入只走 `_targetModel.setMembers(...)`，不直接调 grid 任何方法
```

- **一个 FlexibleCombination 绑且仅绑一个 CmxColumnModel**（属性 `columnModelId`）。
- **一个 CmxColumnModel 可被任意多个可视组件绑定**（视图侧通过 `data-cmx-model-id` 引用同一 instanceId）。
- 一页可以有多个 FlexibleCombination，各自驱动各自的 CmxColumnModel；少数场景下同一 CmxColumnModel 可被多个 FlexibleCombination 操作（最后一次操作覆盖）。

### 6.2 绑定时机

**A. 声明式（推荐）—— `__designer_meta__.models` + `init-page-models.js` 第一·五步**

```jsonc
[
  { "modelType": "CmxColumnModel",
    "instanceId": "detailModel",
    "props": { "datasetId": "head.items.details",
               "columns": [ { "id":"remark", … }, { "id":"amount", … } ] } },
  { "modelType": "FlexibleCombination",
    "instanceId": "detailFlexibleCombination",
    "props": { "columnModelId": "detailModel",          ← 关联键
               "scenario": "account", "domain": "fi", "app": "gl", "module": "fi_gl_base_data",
               "serviceFn": "resolveFlexibleCombination" } }
]
```

运行时初始化次序（`init-page-models.js`）：

```
第一步：依次按 modelType 创建实例 → host[instanceId] = new ...
        （FlexibleCombination 此时已 new 出来，但 _targetModel 仍为 null）
第一·五步：再扫一遍 models，找出所有 FlexibleCombination：
        const target = host[def.props.columnModelId]
        if (target) cp.bindColumnModel(target)
        if (def.props.inlineData) cp.setCombination(def.props.inlineData)
第二步：扫 DOM 把 [data-cmx-model-id] 视图组件绑到 host[instanceId]
        → grid.setColumnModel(target) 内部订阅 columns-changed
```

两段"第一步"分离的目的：CmxColumnModel 必须先建好，FlexibleCombination 才能成功绑定。如果 `columnModelId` 写错或目标模型不存在 → `cp.bindColumnModel(null)` → `_targetModel = null`，后续 `loadByAnchor` 不报错但**没有可见效果**（debug 时优先排查这条）。

**B. 命令式 —— 运行时显式绑**

```js
host.detailFlexibleCombination.bindColumnModel(host.someOtherColumnModel)
```

用于动态创建/替换列模型的场景。

### 6.3 写入路径（CP → CmxColumnModel → 视图）

```
任一触发：loadByAnchor(成功) / setRule(...) / setCombination(...) / clear()
       │
       ▼
cp._buildMembers(res)            // 用 FlexibleCombinationEngine.buildColumns 得到 CmxColumn[]
       │                          //（含 calcFormula、onPickDimension 闭包）
       ▼
cp._applyMembers(members)
       │
       ▼
this._targetModel.setMembers(members)
       │
       ▼
target.dispatchEvent('columns-changed', { reason:'replace', model: target })
       │
       │  ── 1 : N 广播 ──
       ▼
每个绑该模型的 cmx-revo-grid 的内部监听器触发：
   ↳ grid._applyColumnModel(model)
        ├ CmxColumnAdapter.toRevoGrid(model) → 新的 revo columns
        ├ this._revo.columns = ...           // 重新写入
        ├ this._renderTotals()                // 合计行
        └ dispatchEvent('cmx-columns-changed', { model, columns })
       │
       ▼
页面层挂的 cmx-columns-changed 监听 → setTotals + tuneGrid 收尾
```

FlexibleCombination **从不直接调** `grid.setColumnModel()` 或动 grid 内部状态——它只动 CmxColumnModel 的 members，由 `EventTarget` 机制广播。这样:
- 多视图自动一致
- 视图组件可以独立被替换 / 销毁，不影响 FlexibleCombination
- 业务页面也可以用同样的事件挂接自定义收尾逻辑

### 6.4 初始 members 快照（`_initialMembers`）

**目的**：让 `clear()` 与 `flexible-combination-error` 都能把列模型还原回**最早的样子**（即在 `__designer_meta__.models[].props.columns` 里配置的那一套）。

```js
bindColumnModel (model) {
  this._targetModel = model || null
  if (this._targetModel && !this._initialMembers) {
    this._initialMembers = (this._targetModel.members || []).slice()   // ← 第一次绑定时快照
  }
  return this
}
```

要点：
- 仅在**首次绑定**时拍快照（`!this._initialMembers` 守卫），后续重新 `bindColumnModel(otherModel)` 不会覆盖
- 快照是浅拷贝（`slice()`），保存的是 `CmxColumn` 实例的**引用**列表 —— 后续业务代码若 in-place 改了 CmxColumn 的字段，快照也会跟着变（一般无影响）
- `clear()` / `flexible-combination-error` 时调 `this._applyMembers(this._initialMembers || [])` 还原
- 如果想"换一个起点"，业务代码可 `cp._initialMembers = null` 后再 `bindColumnModel(...)`（**不推荐**，属于内部状态操作）

### 6.5 反向：手动改 model 也会触发联动

`columns-changed` 不是 FlexibleCombination 专属——**任何对 model 的写入都会派发**：

```js
host.detailModel.addMember(new CmxColumn({ id:'extra', caption:'扩展', type:'text' }))
// → 派发 columns-changed { reason:'add' }
// → grid 收到 → 重新 _applyColumnModel → 视图新出一列
```

所以 FlexibleCombination 只是**"其中一条声明式入口"**；其它路径（手写 setMembers、第三方代码、未来其他模型类）都能用同一事件机制驱动同一组视图。

### 6.6 同 model 多源写入（少见但允许）

如果同一 CmxColumnModel 同时被多个 FlexibleCombination 操作（或 FlexibleCombination + 手写代码混用），**最后一次写入获胜** —— Map 缓存按各自实例的 anchorKey 独立维护，但 model 上的 members 只有一份。

> 实际项目里强烈建议 **一个 CmxColumnModel 只被一个所有者写**，否则视图列结构会"打架"，难以调试。

### 6.7 解绑 / 替换

| 操作 | 现象 |
|---|---|
| `cp.bindColumnModel(otherModel)` | 切换目标；之后写入都流到新 model；旧 model 不再被 cp 触碰，但其它视图仍可用 |
| `cp.bindColumnModel(null)` | 解除绑定；之后 `loadByAnchor` 仍能拉数据并建列，但 `_applyMembers` 检测到 `_targetModel == null` 直接 return，**无可见效果** |
| 页面销毁 | 整个 FlexibleCombination 实例 + Map 缓存 + `_initialMembers` 一起 GC |

> 目前没有"解绑时自动还原列"的语义；如需先 `clear()` 再 `bindColumnModel(null)`。

### 6.8 视图侧订阅（cmx-revo-grid 内部）

为了让你完整看到链路，把 grid 侧关键代码也亮一下（`components/cmx-revo-grid.js` 中 `setColumnModel`）：

```js
setColumnModel(model) {
  if (!model) return
  // 解绑上一个模型
  if (this._boundModel && this._boundModelListener) {
    this._boundModel.removeEventListener('columns-changed', this._boundModelListener)
  }
  this._boundModel = model
  this._applyColumnModel(model)                                  // 立即同步一次

  if (typeof model.addEventListener === 'function') {
    this._boundModelListener = () => this._applyColumnModel(model)
    model.addEventListener('columns-changed', this._boundModelListener)   // 持续订阅
  }
}
```

`_applyColumnModel(model)` 内部：
1. 用 `CmxColumnAdapter.toRevoGrid(model)` 转 revo 列树
2. `this._revoColumns = columns`
3. 同步 `this._columns` / `this._headerGroups`
4. `if (totals) this._opts = { ...this._opts, totals }`
5. 调 `this._syncToRevo()` 重写 `revo.columns / source / readonly / ...`
6. `delete this.__cmxOrigSizes`（让下次 tuneGrid 按新列重建宽度比例锚点）
7. 派发 `cmx-columns-changed` 供页面挂收尾钩子

cmx-ui5-form / 未来 cmx-ui5-table 接入同一通道只需在它们的 `setColumnModel` / `setFields` 里加同款订阅即可。

---

## 7. 缓存机制（按锚点签名）

> `FlexibleCombination` 自带按锚点等价类的内存缓存，重复锚点零成本复用，不再请求后端。

### 6.1 形态

```js
this._cache = new Map()    // Map<anchorKey, CmxColumn[]>
```

- **键**：由 `_cacheKey(anchor)` 算出 —— `_cleanAnchor` 先剥掉空值、把所有值 `String()` 化，再按维度名**字母序**排序拼成 `k1=v1&k2=v2`。
- **值**：已编译好的 `CmxColumn[]`（含 `calcFormula` / `onPickDimension` 等**闭包**），**不是原始 JSON**。命中即直接 `setMembers(cachedArray)`，**不会重跑 engine**，交互函数引用一致。
- **隐藏属性 `__cmxRuleId`**：在缓存数组上挂一个非枚举属性，命中时还原 `currentRuleId` 报告值。

锚点键示例：

| 输入 anchor | 缓存键 |
|---|---|
| `{account:'1122'}` | `account=1122` |
| `{txType:'sale', productType:'goods'}` | `productType=goods&txType=sale` |
| `{txType:'sale', productType:'goods', extra:null}` | `productType=goods&txType=sale`（`null` 被 `_cleanAnchor` 剥掉） |
| `{account:1122}`（数值） | `account=1122`（值被 `String()`） |

**等价类含义**：键只看锚点维度值组合，**不看行 id**。同一科目的多条分录共享同一缓存项。

### 6.2 写入与命中

`loadByAnchor(anchor)` 流程：

```
_cleanAnchor → key
  ├ HIT  → 直接 setMembers(cache.get(key))
  │       派发 flexible-combination-loaded { fromCache: true }
  │       不发请求、不调 engine
  └ MISS → try
            res = _fetchRule(anchor)        // resolver → serviceFn → fetch(apiPath)
            members = _buildMembers(res)    // FlexibleCombinationEngine.buildColumns
            挂 __cmxRuleId 隐藏属性
            cache.set(key, members)         ← 写缓存
            setMembers → flexible-combination-loaded { fromCache: false }
          catch
            setMembers(initialMembers)      // 还原到列模型初始成员
            派发 flexible-combination-error ← 失败不写缓存（保留可重试性）
```

`setRule({rule, dimensions, anchor})` 与 `setCombination({…, anchor})` **传了 anchor 也写缓存** —— 手动注入会沉淀，下次同锚点的 `loadByAnchor` 直接命中。

`setCombination({rules, dimensions})` **没带 anchor**（依赖 `rules.length===1` 自动选）或形态 1 的 `setCombination({rule, dimensions})` 没带 anchor → **不写缓存**（没签名可用）。

### 6.3 失效与清理

| 操作 | 效果 |
|---|---|
| `cp.clear()` | 清空整个 Map + 把列模型还原到初始 members + 派发 `flexible-combination-cleared` |
| `cp.invalidateCache(anchor)` | 仅删该锚点签名对应项；下次 `loadByAnchor(同锚点)` 会重新发请求 |
| `cp.invalidateCache()` 不传参 | 等价清空（保留 `_initialMembers`，列不会被还原） |
| 页面刷新 / 路由跳转 | 整个 `CmxFlexibleCombination` 实例销毁，缓存随之消失（**纯内存、不持久化**） |
| **未设 TTL** | 不会自动过期 —— 同锚点在本页生命周期内始终用缓存 |

### 6.4 边界与已知局限

| 项 | 当前实现 | 何时需要关心 |
|---|---|---|
| **失败不污染缓存** | 异常时不写、列还原；可重试 | 网络抖动场景安全 |
| **无并发去重** | 同 key 短时间内连两次调用 → 两次请求并行，最后写入者赢 | 快速连点同一行可能触发；正常使用不会 |
| **无大小上限 / LRU** | Map 不设最大条数 | 锚点等价类高基数（如客户+物料+仓库百万组合）时需补 LRU |
| **不持久化** | 仅在内存中 | 刷新页面 = 重新跑一遍后端 |
| **跨实例不共享** | 每个 `CmxFlexibleCombination` 一个 Map；多个实例之间也不共享 | 同页多 FlexibleCombination 共用同一份配置时会重复请求；可通过共同的 `resolver` 注入做外层共享 |
| **后端配置变更感知** | 客户端无推送机制 | 后端 `/config` 改了，已加载页要看到新规则须 `invalidateCache()` 或刷页 |

### 6.5 调试

运行时直接列出当前缓存内容：

```js
console.log(
  [...host.detailFlexibleCombination._cache.entries()].map(([k, v]) => ({
    key: k,
    ruleId: v.__cmxRuleId,
    cols: v.map((c) => c.id),
  })),
)
```

> `_cache` 是 `_` 前缀的内部属性，**调试用没问题，业务代码不要直接读写**。稳定的失效接口是 `invalidateCache(anchor?)` / `clear()`。

### 6.6 命中示例（以 voucher 为例）

```
首次选 i1 (1001 cash)          → key='account=1001'   MISS → fetch → 写缓存 → 用
首次选 i2 (1122 receivable)    → key='account=1122'   MISS → fetch → 写缓存 → 用
首次选 i3 (6601 expense)       → key='account=6601'   MISS → fetch → 写缓存 → 用
首次选 i4 (1002 bank)          → key='account=1002'   MISS → fetch → 写缓存 → 用
回头再选 i2                    → key='account=1122'   HIT  → 复用缓存 CmxColumn[]（无网络）
新增分录 i5（也填 acctCode=1122）→ key='account=1122'  HIT  → 共享上次的列闭包
```

---

## 8. 动态列分组（多级表头 / form group）

> 业务里的"动态列"不止扁平一行 —— 经常需要把列按功能/语义分组：grid 表头要多级嵌套、form 要分组容器。`FlexibleCombination` 直接读 rule 上的 `groups` 声明，编译成嵌套 `CmxColumnGroup`，**对 grid 表现为多级表头，对 form 表现为 `<ui5-form-group>` 分组容器**，无需额外胶水。

### 8.1 在 rule 中声明分组

把分组方案放在 `rule.detail.groups`，**支持任意层嵌套**：

```jsonc
"rule": {
  "id": "trade-sale-goods",
  "detail": {
    "fields": [
      { "code": "product",       "kind": "dimension", "caption": "商品" },
      { "code": "spec",          "kind": "attribute", "caption": "规格" },
      { "code": "uom",           "kind": "attribute", "caption": "单位" },
      { "code": "unitPrice",     "kind": "measure",   "caption": "单价" },
      { "code": "quantity",      "kind": "measure",   "caption": "数量" },
      { "code": "amount",        "kind": "measure",   "caption": "金额" },
      { "code": "currency",      "kind": "dimension", "caption": "币种" },
      { "code": "currencyValue", "kind": "measure",   "caption": "原币金额" },
      { "code": "exchangeRate",  "kind": "measure",   "caption": "汇率" },
      { "code": "baseAmount",    "kind": "measure",   "caption": "本位币金额" },
      { "code": "remark",        "kind": "text",      "caption": "备注" }
    ],
    "groups": [
      { "caption": "商品信息",   "members": ["product", "spec", "uom"] },
      { "caption": "价量与金额", "members": [
        { "caption": "单价 / 数量", "members": ["unitPrice", "quantity"] },
        "amount"
      ]},
      { "caption": "币种结算", "members": [
        "currency",
        { "caption": "本位币换算", "members": ["currencyValue", "exchangeRate", "baseAmount"] }
      ]}
      /* 注意：remark 未列出，将自动追加到顶层末尾 */
    ]
  }
}
```

**`groups[n]` 节点结构**：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string?, 可省 | 分组 id；省略则用 `caption` 或自动生成 `__cp_g_<N>` |
| `caption` | string | 显示标题（grid 表头中间行 / form group 标题） |
| `members` | array | 元素**二选一**：① 字符串（字段 code，对应 `fields` 里某叶字段）② 对象（子分组，递归同样结构） |

### 8.2 编译路径：CP → 嵌套 CmxColumnGroup

`CmxFlexibleCombination._buildMembers(res)` 内部：

```
FlexibleCombinationEngine.buildColumns(rule) → 扁平 CmxColumn[]   ① 先生成全部叶列
                          │
                          ▼
       rule.detail.groups ? ── 否 ──► 直接返回扁平数组（无分组场景）
                          │ 是
                          ▼
       递归 buildGroupNode(node):
         new CmxColumnGroup({ id, caption })
         遍历 node.members：
            字符串 m → byId.get(m) → grp.addMember(col)   并标记 used
            对象 m   → buildGroupNode(m)（递归子组）→ grp.addMember(child)
         空组返回 null（跳过）
                          │
                          ▼
       未被任何 group 消费的叶列，**按 fields 声明顺序补在末尾**
                          │
                          ▼
       返回 [CmxColumnGroup | CmxColumn, ...]
                          │
                          ▼
       this._targetModel.setMembers(...)   → columns-changed → 视图重渲
```

`CmxColumnGroup` 本身就支持嵌套（其 `members` 既可放 `CmxColumn` 也可放 `CmxColumnGroup`），所以编译出来的对象树深度不受限。

### 8.3 解析规则（要点）

| 规则 | 行为 |
|---|---|
| 字符串 member 找不到对应字段 | 静默跳过（不报错） |
| 同一字段在多个 group 里出现 | 取**首次出现**；后续位置忽略 |
| group 的 members 编译后为空 | 整个 group 被丢弃（不渲染空表头 / 空容器） |
| 未在任何 group 中出现的叶字段 | 按 `fields` 声明顺序追加到顶层末尾（与显式 group 平级） |
| `groups` 缺省或为空数组 | 退化为扁平列（与无分组场景一致） |
| `group.id` 省略 | 优先用 `caption`；都没有则 `__cp_g_<N>` 自动编号 |

### 8.4 双端渲染（已就位）

| 视图 | 适配器 | 表现 |
|---|---|---|
| **cmx-revo-grid** | `CmxColumnAdapter.toRevoGrid(model)` → `_descriptorToRevoCol` 递归输出 `{ name, children }` 嵌套节点 | RevoGrid 原生支持任意层嵌套列。**任意深度多级表头自动得到**。 |
| **cmx-ui5-form** | `CmxColumnAdapter.toCmxFormGrouped(model)` 输出树形 nodes → `cmx-ui5-form._renderNodesInto` 递归 | group 节点渲染 `<ui5-form-group titleText="…">`；叶字段渲染 `<ui5-form-item>` + 编辑器。**任意深度分组容器自动得到**。 |

> 与 `setColumnModel`/`columns-changed` 链路一致 —— FlexibleCombination 不直接动 grid/form，只写入 `CmxColumnModel.members`，由两侧 `setColumnModel` 内部转换并重渲（详见 §6.3 与 §6.8）。

### 8.5 端到端示例

上面 8.1 的 rule 进入 grid 后：

```
┌────────────────┬──────────────────────────────┬────────────────────────────────────────┬────────┐
│   商品信息     │       价量与金额             │             币种结算                   │        │
├────┬────┬─────┼──────────────┬───────────────┼────────┬───────────────────────────────┤        │
│    │    │     │ 单价 / 数量  │               │        │       本位币换算              │        │
│    │    │     ├──────┬───────┤      金额     │  币种  ├──────┬────────┬───────────────┤  备注  │
│商品│规格│单位 │ 单价 │ 数量  │               │        │原币  │ 汇率   │ 本位币金额    │        │
├────┼────┼─────┼──────┼───────┼───────────────┼────────┼──────┼────────┼───────────────┼────────┤
│ A  │... │ kg  │ 12.5 │ 100   │  1,250.00     │  CNY   │1250  │ 1.00   │   1,250.00    │  ...   │
└────┴────┴─────┴──────┴───────┴───────────────┴────────┴──────┴────────┴───────────────┴────────┘
```

进入 form 后：

```
┌─ 商品信息 ──────────────────────────────────────────┐
│  商品 [ A ▾ ]    规格 [ ... ]    单位 [ kg ▾ ]
├─ 价量与金额 ────────────────────────────────────────┤
│  ┌─ 单价 / 数量 ─────────┐
│  │  单价 [ 12.50 ]   数量 [ 100 ]
│  └───────────────────────┘
│  金额 [ 1,250.00 ]
├─ 币种结算 ──────────────────────────────────────────┤
│  币种 [ CNY ▾ ]
│  ┌─ 本位币换算 ──────────────────────────┐
│  │  原币 [ 1250 ]   汇率 [ 1.00 ]   本位币 [ 1,250.00 ]
│  └───────────────────────────────────────┘
├─────────────────────────────────────────────────────┤
│  备注 [ ... ]
└─────────────────────────────────────────────────────┘
```

### 8.6 直接手写 CmxColumnGroup（无 FlexibleCombination 的等价写法）

不走 rule 时也能拿到一样的效果（`CmxColumnGroup` 本身就是公开 API）：

```js
const { CmxColumn, CmxColumnGroup } = host.__cmxClasses

const priceQty = new CmxColumnGroup({ id: 'g_priceQty', caption: '单价 / 数量' })
priceQty.addMember(new CmxColumn({ id: 'unitPrice', caption: '单价', type: 'number' }))
priceQty.addMember(new CmxColumn({ id: 'quantity',  caption: '数量', type: 'number' }))

const priceAmount = new CmxColumnGroup({ id: 'g_priceAmount', caption: '价量与金额' })
priceAmount.addMember(priceQty)                                                       // ← 嵌套子组
priceAmount.addMember(new CmxColumn({ id: 'amount', caption: '金额', type: 'number' }))

host.itemModel.setMembers([
  priceAmount,                                                                        // 顶层 group
  new CmxColumn({ id: 'remark', caption: '备注', type: 'text' }),                     // 顶层叶列
])
// 自动派发 columns-changed → grid 多级表头 + form 分组容器同步刷新
```

### 8.7 不希望分组怎么办

省略 `rule.detail.groups`（或留空数组）—— `_buildMembers` 直接返回扁平 `CmxColumn[]`，grid 退化为单行表头、form 退化为平铺字段，行为与 §1 至 §7 各示例一致。

---

## 9. 事件清单

`FlexibleCombination` 自身（`host.<inst>.addEventListener(...)`）：

| 事件 | detail | 触发时机 |
|---|---|---|
| `flexible-combination-loaded` | `{ anchor, ruleId, fromCache }` | 成功套用一次（含缓存命中） |
| `flexible-combination-error` | `{ anchor, error }` | 取数/解析失败；列已被还原到初始成员 |
| `flexible-combination-cleared` | — | 调 `.clear()` 后 |

目标 `CmxColumnModel`：

| 事件 | detail | 触发时机 |
|---|---|---|
| `columns-changed` | `{ reason: 'replace'\|'add'\|'remove', model }` | 任何 setMembers/addMember/removeMember 之后 |

`cmx-revo-grid`（绑定了该模型的视图）：

| 事件 | detail | 触发时机 |
|---|---|---|
| `cmx-columns-changed` | `{ model, columns }` | 内部 `_applyColumnModel` 完成、`revo.columns` 已更新；页面在此挂收尾钩子 |

---

## 10. 与既有规则元模型的对接

`FlexibleCombination` **不是**新创一套数据格式——它直接消费 `rule + dimensions` 形态，与 `FlexibleCombinationEngine` 一致：

- 后端 `/api/flexible-combination/rule` 返回 `{ ruleId, rule, dimensions }` ← 直接喂给 `setRule` / `setCombination`
- 后端 `/api/flexible-combination/config` 返回 `{ dimensions, rules, anchorDimensions }` ← 喂给 `setCombination({rules, dimensions, anchor})`
- `inlineData` 接收的 JSON 与上面两种结构同构

`rule.detail.fields` 三态字段（dimension / attribute / measure / text）和高级特性（formula / dependsOn / source / defaultFrom / display / unitField / validations / required）的语义请见 [`flexible-combination-meta-model.md`](./flexible-combination-meta-model.md)。

**Overlay 存储格式（当前推荐）**：`rule.detail` 支持三种字段来源，可混用：

- `use: "*"` —— 引用关联表（`detail.table`）的全部物理列，配 `over: { colId: {…} }` 打补丁
- `pick: [{ ref, over?, as? }]` —— 只挑列出的列（`ref` = `"表.列"`，`over` = 增量覆盖，`as` = 改名）；顺序即声明顺序
- `fields: […]` —— 现状 inline（纯逻辑列 / 旧档案），恒等直通

服务端读时展开（`/rule`、`/resolve`、`/validate`、`/preview`）：`ref` → 读 DOC 列基底 → 叠加 `over`（deepMerge：DCT字典 < DOC列 < FLC over）。详见 [`flexible-combination-overlay-design.md`](./flexible-combination-overlay-design.md)。弹性组合管理页编辑器已产出 overlay 数据（选表产 `use:"*"`，字段属性编辑写 `over` 增量）。

**列分组（CmxColumnGroup）支持**：rule 上写 `detail.groups`（支持任意层嵌套）：

```jsonc
"rule": {
  "id": "trade-sale-goods",
  "detail": {
    "fields": [ /* ... */ ],
    "groups": [
      { "caption": "商品信息",   "members": ["product", "spec", "uom"] },
      { "caption": "价量与金额", "members": [
        { "caption": "单价 / 数量", "members": ["unitPrice", "quantity"] },
        "amount"
      ]}
    ]
  }
}
```

`groups[].members` 既可写字段 code，也可写嵌套子组对象。`CmxFlexibleCombination._buildMembers` 会把它编译成嵌套 `CmxColumnGroup`，grid 表现为多级表头、form 表现为 `<ui5-form-group>` 分组容器；未列出的字段平铺在末尾。完整规则与端到端示例见 [§8](#8-动态列分组多级表头--form-group)。

---

## 11. 设计器属性面板速查

| 区段 | 内容 |
|---|---|
| **实例名** | `instanceId`（运行时 `host[instanceId]`） |
| **后端定位（DAM + 业务场景）** | `domain` / `app` / `module` / `scenario` |
| **列模型绑定** | `columnModelId`（datalist 列同页 CmxColumnModel 实例） |
| **取数路径（二选一）** | `serviceFn`（页面服务名，优先） / `apiPath`（默认 fetch 路径） |
| **锚点** | `anchorDimensions`（逗号分隔，留空走后端配置） |
| **JSON 直设（可选）** | `inlineData` textarea + 即时解析校验 |
| **末尾说明** | 调用示例 `host.<inst>.loadByAnchor(...)` / `host.<inst>.setCombination(...)` |

---

## 12. 常见问题

**Q1：我设置了 `inlineData`，又调了 `loadByAnchor`，会冲突吗？**
不会。两者都是改同一个 `CmxColumnModel`，**后调用的覆盖之前**。`inlineData` 是 init 时套一次；之后 `loadByAnchor` 会替换。

**Q2：换了锚点，detail grid 没刷新？**
检查：
- `columnModelId` 与 grid 上的 `data-cmx-model-id` 是否一致
- `host.detailGrid.setColumnModel(model)` 是否调过（runtime 自动绑定的话应该已调过，看 `data-cmx-model-id`）
- 控制台是否有 `flexible-combination-error` 提示
- 后端 `/api/flexible-combination/rule?...` 是否返回 `{rule, dimensions}` 非空

**Q3：网络失败后能恢复吗？**
能。失败时**不会污染缓存**（`loadByAnchor` 的 catch 分支不写 `_cache`），列模型自动还原到 §6.4 的 `_initialMembers` 快照；下次 `loadByAnchor(同锚点)` 会重新发请求。详见 §7.4 边界表与 §6.4 快照机制。

**Q4：如何让多个视图共用一份动态列？**
不需要做任何额外配置——只要这几个视图组件上的 `data-cmx-model-id` 都指向同一个 `CmxColumnModel.instanceId`，列变更经事件链一并广播。

**Q5：如何在保存按钮里做必填校验？**
拿到当前规则的话，可以在 `flexible-combination-loaded` 时记下 `ruleId` 并保留一个微型 engine：

```js
host.detailFlexibleCombination.addEventListener('flexible-combination-loaded', (e) => {
  host.__activeRuleId = e.detail.ruleId
})

function onSave() {
  // 用 FlexibleCombinationEngine 做校验；
  // 取当前 rule 的两种方式见下一段
}
```

或者更直接：保存时再调一次 `/api/flexible-combination/rule` 拿完整规则跑 `engine.validate(row, rule)`。

**Q6：`inlineData` 太大放在 JSON 里不优雅？**
可以放在一个 pageFn 里返回，然后初始化时调 `host.detailFlexibleCombination.setCombination(host.myCombination())`——后端整份配置（如十几条规则、几十个维度）建议走这条路。

---

## 13. 关联文件

- 类源码：`packages/cmx-data-comp/src/lib/cmx-flexible-combination.js`
- 引擎：`packages/cmx-data-comp/src/lib/flexible-combination-engine.js`
- 自动初始化：`packages/cmx-data-comp/src/lib/init-page-models.js`（`case 'FlexibleCombination'`）
- 列模型事件：`packages/cmx-data-comp/src/lib/cmx-column-model.js`（`setMembers` / `columns-changed`）
- 网格订阅：`packages/cmx-data-comp/src/components/cmx-revo-grid.js`（`setColumnModel` / `_applyColumnModel` / `cmx-columns-changed`）
- 调色板登记：`../../../cmx-html-designer`
- 设计器属性面板：`../../../cmx-html-designer`
- 后端存储：`cmx-container/data/meta/flexible-combination/<domain>/<app>/<module>/<scenario>.json`（Rust `cmx-model` 读写）
- 后端路由：`/api/flexible-combination/{config,resolve,rule}`（详见 [flexible-combination-meta-model.md §8.1](./flexible-combination-meta-model.md)）
- 端到端样例：`voucher.html`、`trade.html`（fi/gl/fi_gl_base_data 下）
