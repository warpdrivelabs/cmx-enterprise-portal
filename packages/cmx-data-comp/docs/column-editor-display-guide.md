# 列编辑器与显示方式指南（CmxColumn × cmx-ui5-form × cmx-revo-grid）

> 把"列定义→编辑器→显示方式"一次说透：`CmxColumn` 是唯一的列元数据来源，经 `CmxColumnAdapter` 适配到 **cmx-ui5-form**（单行表单）与 **cmx-revo-grid**（数据网格）；编辑器与显示均可通过 **`registerFieldType`**（统一注册表）和 **`registerColumnPreset`**（声明式显示/计算预设）零代码扩展。

```
                  ┌── cmx-ui5-form  ─── _createEditor / _writeOne
CmxColumn ──► CmxColumnAdapter ──►── cmx-revo-grid ── columns / editors / cellTemplate
                  └── cmx-ui5-table ─── columns / cellRenderer
              ▲
              │  registerFieldType('color'|'rating'|...)   ← form + grid 共用
              │  registerColumnPreset('money-zh'|...)      ← displayMask / calcFormula / validateFormula
```

---

## 1. `CmxColumn` 字段总览

构造 `new CmxColumn(props)`；JSON 化经 `toJSON()` / `fromJSON()`。源码 `packages/cmx-data-comp/src/lib/cmx-column.js`。

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `id` | string | `''` | **字段名 = 行对象 key**；必填 |
| `caption` | string | `''` | 显示标题（空时回落到 `id`） |
| `type` | `'text' \| 'number' \| 'date' \| 'boolean' \| 'select' \| 'ref'` 或自定义注册类型 | `'text'` | 数据类型；同时也是注册表查找键 |
| `length` | number | `null` | text 最大字符 |
| `integerDigits` / `decimalDigits` | number | `null` | number 显示精度提示 |
| `editMode` | `'input' \| 'select' \| 'date' \| 'ref' \| 'readonly' \| 'none'` | `'input'` | 编辑方式；与 `type` 联动决定最终编辑器 |
| `editSettings` | object | `{}` | 编辑器附加参数（见下方表） |
| `displayMode` | `'text' \| 'badge' \| 'link' \| 'icon'` | `'text'` | 显示样式（cmx-ui5-table / 表单 readonly 使用） |
| `displayMask` | string \| `{preset,args}` \| Function | `null` | 显示格式化（preset 名 / preset 描述 / 函数） |
| `calcFormula` | string \| `{preset,args}` \| Function | `null` | 计算公式（编辑联动；grid 端的函数版会成为 `_cmxOnChange`） |
| `validateFormula` | string \| `{preset,args}` \| Function | `null` | 校验公式 |
| `actionRef` | string \| object | `null` | 关联 Action（如行操作按钮列） |
| `width` | string | `null` | CSS 宽度（如 `'120px'`） |
| `align` | `'left' \| 'center' \| 'right'` | `null` | 对齐；number/right 列自动对齐 |
| `required` | boolean | `false` | 必填；form 渲染 `*` |
| `visible` | boolean | `true` | 是否可见 |

### `editSettings` 字段

| 字段 | 用于 | 说明 |
|---|---|---|
| `options` | select | `[{value,label}]`；form/grid 下拉选项 |
| `placeholder` | input/textarea | 占位符 |
| `source` | ref | 数据源 id（`form._resolveDataSource(id)` 解析） |
| `helper` | ref | `'dropdown' \| 'combo-search' \| 'remote-search'`；决定 ref 编辑器形态 |
| `valueField` | ref | 源数据里的值字段（默认 `code`） |
| `displayTemplate` | ref | `${name}|${code}` 之类的展示模板 |
| `dependents` | 任意 | `['otherKey', ...]`；本格变化后联动刷新这些列 |
| `dateFormat` | date | 日期格式 |

> 函数型 `displayMask` / `calcFormula` / `validateFormula` 在 `toJSON()` 时会被置 `null`（无法 JSON 序列化）；要持久化请用 `{preset, args}` 声明式。

---

## 2. type / editMode / displayMode 矩阵（一眼可查）

`CmxColumnAdapter` 的 `_cmxTableType(d)`（line 78）决定最终内部 type，规则：

```
editMode='readonly' | 'none'     → 'readonly'
editMode='select'   | type='select' → 'select'
editMode='ref'      | type='ref'    → 'ref'
type='number'                       → 'number'
editMode='date'     | type='date'   → 'date'
其它                                  → 'text'
```

| 列定义 | 最终 type | cmx-ui5-form 渲染 | cmx-revo-grid 列属性 |
|---|---|---|---|
| `{type:'text'}` | text | `<ui5-input>` | 文本编辑 |
| `{type:'number'}` | number | `<ui5-input type="Number">` | `columnType:'numeric'`，右对齐 |
| `{type:'date'}` 或 `editMode:'date'` | date | `<ui5-date-picker>` | 日期编辑 |
| `{type:'select', editSettings.options}` | select | `<ui5-select>` | `_cmxSelectOptions` 下拉 |
| `{type:'ref', editSettings.source}` | ref | `<ui5-select>` / combobox / suggestions（看 helper） | ref 列 |
| `editMode:'readonly'` | readonly | `<span>` + formatter | `readonly:true` |
| `editMode:'none'` | readonly | `<span>` 隐藏编辑 | `readonly:true`，可隐藏 |

---

## 3. cmx-ui5-form 编辑器（内置 9 种 + 注册表外挂）

源码 `components/cmx-ui5-form.js` 的 `_createEditor(field)`（line 319）；`field` 是从 `CmxColumn` 适配出的扁平结构（`{key,label,type,options,...}`）。

### 3.1 内置类型清单

| `field.type` | 渲染元素 | 关键 field 属性 |
|---|---|---|
| `'text'`（默认） | `<ui5-input>` | `placeholder`, `readonly` |
| `'number'` | `<ui5-input type="Number">` | `placeholder`, `readonly`, `min/max/step` |
| `'date'` | `<ui5-date-picker>` | `formatPattern`（默认 `yyyy-MM-dd`） |
| `'select'` | `<ui5-select>` + `<ui5-option>` | `options:[{value,label}]`, `placeholder` |
| `'textarea'` | `<ui5-textarea>` | `rows`, `placeholder` |
| `'checkbox'` | `<ui5-checkbox>` | — |
| `'readonly'` | `<span class="readonly-display">` | `formatter`（`{preset,args}` 或字符串预设名） |
| `'ref'` | 视 `helper` 而定：dropdown=`<ui5-select>` / combo-search=`<ui5-combobox>` / remote-search=`<ui5-input show-suggestions>` | `source`, `valueField`, `displayTemplate`, `helper`, `dependents` |
| `'ref-display'` | `<span>` | `source`, `from`（关联的 ref 字段 key）, `field`（要展示的列） |

### 3.2 ref 字段三种 helper 形态

```js
// 1) 默认下拉：本地数据源 + ui5-select
{ key:'customerCode', type:'ref', label:'客户', source:'customerMaster',
  valueField:'code', displayTemplate:'${code} · ${name}' }

// 2) 可搜索下拉：本地数据源 + ui5-combobox（输入过滤）
{ key:'customerCode', type:'ref', helper:'combo-search', source:'customerMaster' }

// 3) 远程检索：数据源需实现 search(q) → ui5-input + ui5-suggestion-item
{ key:'productCode', type:'ref', helper:'remote-search', source:'productMaster' }
```

### 3.3 ref-display 自动带出

选了一个 ref 后，配套展示该行的某属性：

```js
[
  { key:'customerCode', type:'ref',        label:'客户', source:'customerMaster' },
  { key:'creditLimit',  type:'ref-display', label:'信用额度',
    source:'customerMaster', from:'customerCode', field:'creditLimit' },
]
```

### 3.4 onChange + dependents（字段联动）

```js
[
  { key:'qty',   type:'number', label:'数量',
    onChange: { preset:'multiply', args:{ sources:['qty','price'], target:'amount' } },
    dependents: ['amount'] },
  { key:'price', type:'number', label:'单价' },
  { key:'amount', type:'readonly', label:'金额',
    formatter: { preset:'format-number', args:{ decimals:2, thousand:',' } } },
]
```

修改 `qty` → 触发 multiply preset 写 `amount` → form 刷新 `amount` 显示。

---

## 4. cmx-revo-grid 列（adapter 映射 + 编辑/显示）

源码 `components/cmx-revo-grid.js` + `lib/cmx-column-adapter.js`。

### 4.1 列适配（CmxColumn → revo column）

`_leafDescriptorToRevoCol`（adapter 第 336 行）把 CmxColumn 描述符变成 revo-grid 列：

| 来源 | 目标 | 说明 |
|---|---|---|
| `id` | `prop` | 行对象的 key |
| `caption` | `name` | 列头文字 |
| `editMode:'readonly'|'none'` | `readonly:true` | 不可编辑 |
| `type:'number'` | `columnType:'numeric'` + 右对齐 | tuneGrid 里 cellTemplate 格式化数值 |
| `align` | `cellProperties: () => ({class:{'cmx-revo-align-...':true}})` | 单元格对齐 class |
| `editSettings.options` | `_cmxSelectOptions` | 后续编辑器从这里取选项 |
| `displayMask` | `_cmxFormatter` | 当前 grid 渲染层未消费（见 §4.3） |
| `calcFormula`（函数） | `_cmxOnChange` | 编辑后回写时调用；非函数版被忽略 |
| `validateFormula` | （透传，存储用） | grid 层无直接消费，由保存/校验流程使用 |

> `_cmxType` 也会被设：`'text' | 'number' | 'select' | 'ref' | 'readonly' | 'none'`，是**字段类型注册表** §5 的查表键。

### 4.2 编辑器（revo-grid 原生 + 注册表外挂）

revo-grid 通过 `<revo-grid editors={ name: EditorCtr }>` 注册自定义编辑器，列上声明 `editor:'<name>'` 启用。`cmx-revo-grid` 在挂载时：

```js
// connectedCallback 中
this._revo.editors = { ...getRegisteredGridEditors() }   // 来自统一注册表
```

`_syncToRevo` 再给列叠加 `editor: '<type>'`：

```js
function applyRegisteredFieldTypesToColumns(columns) {
  // 列若已带 editor / cellTemplate 则保留（无侵入）
  // 嵌套 children（列分组）递归处理
  // 类型识别顺序：col._cmxType → col._cmxCol.type
}
```

所以**注册了 `grid.editor` 的类型，列自动会用它**——只要列的 `_cmxType` 或 `_cmxCol.type` 与类型名一致。

### 4.3 数字列单元格的事实标准（项目内）

`displayMask`/`_cmxFormatter` 在当前 cmx-revo-grid 渲染层**未消费**——数字列的"千分位 / 2 位小数 / 0 显空 / 负数红字"由页面级 `tuneGrid()` 在 `_syncToRevo` 后用 `cellTemplate` 实现（参考 voucher/trade 页）。要做"所有列统一格式化"，最干净的路径是经**字段类型注册表的 `grid.cellTemplate`**（见 §5）。

---

## 5. 字段类型注册表（form + grid 共用）

源码 `lib/cmx-form-field-registry.js`。零代码扩展编辑器与显示。

### 5.1 API

```js
import {
  registerFieldType, unregisterFieldType, getFieldType, listFieldTypes,
  getRegisteredGridEditors, getRegisteredGridCellTemplate,
} from 'cmx-data-comp'
```

```ts
registerFieldType(name: string, def: {
  description?: string,
  form?: {
    // 创建编辑器 DOM（cmx-ui5-form _createEditor 调用）。ctx.commit(field, value) 提交值。
    create(field, ctx) -> HTMLElement,
    // 把行值回填到编辑器（cmx-ui5-form _writeOne 调用）
    write(editor, raw, field, ctx) -> void,
  },
  grid?: {
    // revo-grid EditorCtrCallable：(col, save, close) -> EditorBase{ element, getValue? }
    editor(col, save, close) -> { element, getValue? },
    // revo-grid cellTemplate：(h, props) -> VNode | string
    cellTemplate(h, props) -> any,
  },
})
```

`ctx`（form 端）由 `cmx-ui5-form._fieldCtx(field)` 提供：

```ts
{ field, form, row, commit(f, v), resolveDataSource(id), dispatch(name, detail) }
```

### 5.2 加一种新类型（rating 评分）

```js
import { registerFieldType } from 'cmx-data-comp'

registerFieldType('rating', {
  description: '评分（0–N 星）',
  form: {
    create(field, { commit }) {
      const el = document.createElement('ui5-rating-indicator')
      if (field.max) el.setAttribute('max-value', String(field.max))
      el.addEventListener('change', () => commit(field, Number(el.value || 0)))
      return el
    },
    write(editor, raw) { editor.value = String(Number(raw) || 0) },
  },
  grid: {
    editor(col, save, close) {
      const element = document.createElement('ui5-rating-indicator')
      element.value = String(Number(col?.model?.[col.prop]) || 0)
      element.addEventListener('change', () => { save(Number(element.value)); close() })
      return { element, getValue: () => Number(element.value) }
    },
    cellTemplate(h, props) {
      const v = Number(props.model?.[props.prop]) || 0
      return h('span', {}, '★'.repeat(v) + '☆'.repeat(Math.max(0, 5 - v)))
    },
  },
})

// 用：
fields: [{ key:'score', type:'rating', label:'评分', max:5 }]
// 或 grid 列：
new CmxColumn({ id:'score', caption:'评分', type:'rating', width:'140px' })
```

注册后在 cmx-ui5-form 与 cmx-revo-grid **两端同时生效**。

### 5.3 内置外挂示例：`color`

```js
import 'cmx-data-comp/lib/cmx-builtin-field-types.js'   // 启用内置 color 注册
```

文件 `lib/cmx-builtin-field-types.js` 注册了 `color`：
- form 端：原生 `<input type="color">`
- grid 端：编辑器同上 + cellTemplate 渲染"色块 + 十六进制"

用法：

```js
new CmxColumn({ id:'brandColor', caption:'品牌色', type:'color', width:'140px' })
// 或 form 字段：
{ key:'brandColor', type:'color', label:'品牌色' }
```

### 5.4 回退顺序

- **form 端**：注册命中 → 走外挂；未注册 → 走 `_createEditor`/`_writeOne` 内置 9 种 switch。
- **grid 端**：注册命中 → `col.editor = '<type>'`（revo-grid 用 `editors[name]`） + `cellTemplate` 兜底（列已自带则保留）；未注册 → revo-grid 默认编辑器。

---

## 6. 显示方式（displayMask + presets）

`displayMask` 可为：**字符串（预设名）** / `{preset, args}` / **函数**。函数无法 JSON 化，持久化场景请用前两种。

源码 `lib/cmx-column-presets.js`。

### 6.1 内置预设清单

| 预设名 | 类型 | 说明 |
|---|---|---|
| `format-number` | format | `decimals`/`thousand`/`prefix`/`suffix`/`zeroBlank`/`absolute` |
| `format-date` | format | `pattern`（`yyyy/MM/dd HH:mm:ss`） |
| `lookup` | format | 在 `args.dict` 数组里按 `args.from` 字段查 row 并返回 `args.field` |
| `concat` | format | 把 `args.fields` 按 `args.sep` 拼起来 |
| `multiply` | apply | `row[target] = ∏ row[srcKey]`；可选 `decimals` |
| `divide` | apply | `row[target] = row[num] / row[den]` |
| `sum` | apply | `row[target] = Σ row[srcKey]` |
| `copy` | apply | `row[target] = row[source]` |
| `formula-eval` | apply | 任意表达式：`{target, expr, decimals}`（语法见 `formula-eval.js`） |
| `rule-validate` | format | 返回首条 false 的 `message`，全通过返回空串 |

### 6.2 自定义显示预设

```js
import { registerColumnPreset } from 'cmx-data-comp'

registerColumnPreset('money-zh', {
  description: '中文货币',
  format: (_row, { value, args }) =>
    (Number(value) || 0).toLocaleString('zh-CN', { style:'currency', currency: args?.ccy || 'CNY' }),
})

// 用：
new CmxColumn({ id:'amount', caption:'金额', type:'number',
  displayMask: { preset:'money-zh', args:{ ccy:'USD' } } })

// form 端 readonly 显示：
{ key:'amount', type:'readonly', label:'金额',
  formatter: { preset:'money-zh', args:{ ccy:'USD' } } }
```

### 6.3 displayMode（标签型显示）

| 值 | 含义 |
|---|---|
| `'text'`（默认） | 普通文本 |
| `'badge'` | 徽章（cmx-ui5-table / readonly 单元支持） |
| `'link'` | 链接，通常配 `actionRef` |
| `'icon'` | 图标 |

> 在 cmx-revo-grid 里实现"徽章/链接/图标"等复杂展示请用注册表的 `grid.cellTemplate`，对 displayMode 做差异化渲染。

---

## 7. 计算与校验

### 7.1 `calcFormula`（行内联动）

- **函数版**：`(row, value, ctx?) => void`；在 cmx-revo-grid 上挂为 `_cmxOnChange`，单元编辑提交时调用，可修改同一行其它字段。
- **预设版**：`{preset:'multiply'|'sum'|'formula-eval', args}`。
  - cmx-ui5-form 经 `invokePreset(spec,'apply',...)` 执行；
  - cmx-revo-grid 编辑后直接把 `calcFormula`（函数版）当 `_cmxOnChange` 调用——`{preset,args}` 形式建议在表单端使用，或在 grid 端用 `formula-eval`+真函数包装（业务页 voucher 已示范）。

### 7.2 `validateFormula`（必填/规则）

```js
new CmxColumn({ id:'qty', caption:'数量', type:'number',
  required: true,
  validateFormula: { preset:'rule-validate', args:{
    rules: [{ expr:'qty > 0', message:'数量须大于 0' }]
  }} })
```

业务侧统一在保存动作里跑：`invokePreset(col.validateFormula, 'format', row, ...)` 返回非空字符串即视为错误信息。

### 7.3 表达式语法（`formula-eval.js`）

支持：`+ - * /`、`( )`、字段引用、比较 `> < >= <= == !=`、逻辑 `&& || !`、函数 `ROUND / ABS / FLOOR / CEIL / MIN / MAX / IF`。

```js
{ preset:'formula-eval', args:{ target:'amount', expr:'ROUND(unitPrice*quantity, 2)' } }
{ preset:'rule-validate', args:{ rules:[ { expr:'IF(currency=="USD", amount<1000, true)', message:'美元单笔限 1000' } ]}}
```

---

## 8. 端到端示例

### 8.1 一份 CmxColumn → 同时驱动 form + grid

```js
import { CmxColumn, CmxColumnModel } from 'cmx-data-comp'
import 'cmx-data-comp/lib/cmx-builtin-field-types.js'  // 启用 color

const cols = [
  new CmxColumn({ id:'sku',   caption:'编码', type:'text',   width:'120px', required:true }),
  new CmxColumn({ id:'name',  caption:'名称', type:'text',   width:'200px' }),
  new CmxColumn({ id:'color', caption:'颜色', type:'color',  width:'120px' }),  // 自定义类型
  new CmxColumn({ id:'qty',   caption:'数量', type:'number', width:'100px',
    calcFormula:   { preset:'multiply',    args:{ sources:['qty','price'], target:'amount' } },
    validateFormula:{ preset:'rule-validate', args:{ rules:[{ expr:'qty > 0', message:'数量须大于 0' }]}},
    editSettings:  { dependents:['amount'] } }),
  new CmxColumn({ id:'price', caption:'单价', type:'number', width:'120px',
    displayMask: { preset:'format-number', args:{ decimals:2, thousand:',' } } }),
  new CmxColumn({ id:'amount',caption:'金额', type:'number', width:'140px',
    editMode:'readonly', align:'right',
    displayMask: { preset:'format-number', args:{ decimals:2, thousand:',', zeroBlank:true } } }),
  new CmxColumn({ id:'createdAt', caption:'创建时间', type:'date',
    displayMask: { preset:'format-date', args:{ pattern:'yyyy-MM-dd HH:mm' } } }),
]

const model = new CmxColumnModel({ datasetId:'items', members: cols })
// grid：detailGrid.setColumnModel(model)
// form：const { columns } = CmxColumnAdapter.toCmxUi5Form(model); form.setFields(columns)
```

### 8.2 表单端的 ref + ref-display + 联动

```js
form.setFields([
  { key:'customerCode', type:'ref', label:'客户',
    source:'customerMaster', valueField:'code',
    displayTemplate:'${code} · ${name}',
    dependents:['customerName','creditLimit'] },
  { key:'customerName', type:'ref-display', label:'客户名',
    source:'customerMaster', from:'customerCode', field:'name' },
  { key:'creditLimit',  type:'ref-display', label:'信用额度',
    source:'customerMaster', from:'customerCode', field:'creditLimit' },
])
form.setDataSources([{
  id:'customerMaster', keyField:'code', labelField:'name',
  items:[ { code:'C-001', name:'上海科技', creditLimit:500000 } ]
}])
```

---

## 9. 速查表（常见问题）

| 我想 … | 用 … |
|---|---|
| 加一种新编辑器（form + grid 同步） | `registerFieldType('xxx', { form:{create,write}, grid:{editor,cellTemplate} })` |
| 加一种数值/日期/查表显示格式 | `registerColumnPreset('xxx', { format(row, ctx){...} })` + `displayMask:'xxx'` 或 `{preset:'xxx',args}` |
| 加一种行内联动计算 | `registerColumnPreset('xxx', { apply(row, ctx){...} })` + `calcFormula:{preset:'xxx',args}` 或 `formula-eval` |
| 加一种校验规则 | `validateFormula:{preset:'rule-validate', args:{rules:[{expr,message}]}}` |
| 列宽自适应、合计行钉底、千分位 | 见 voucher/trade 页的 `tuneGrid()`（业务 grid 后置调优函数） |
| 把动态明细列定义来自后端 | 弹性组合元模型 + `FlexibleCombinationEngine`（详见 `flexible-combination-meta-model.md`） |

---

## 10. 关联源码与文档

- `lib/cmx-column.js` —— 列元数据
- `lib/cmx-column-adapter.js` —— 三端适配（form / revo-grid / ui5-table）
- `lib/cmx-form-field-registry.js` —— 字段类型注册表（统一 form + grid）
- `lib/cmx-builtin-field-types.js` —— 内置外挂示例（color）
- `lib/cmx-column-presets.js` —— 显示/计算/校验预设
- `lib/formula-eval.js` —— 表达式求值（公式语法）
- `components/cmx-ui5-form.js` —— 表单编辑器（`_createEditor` / `_writeOne` / `_fieldCtx`）
- `components/cmx-revo-grid.js` —— 数据网格（`_syncToRevo` / `applyRegisteredFieldTypesToColumns`）
- `docs/flexible-combination-meta-model.md` —— 弹性组合元模型（动态列定义的高阶应用）
