# CMX Data Comp

## Project Overview

`cmx-data-comp` is a data layer package providing Web Components and model classes for the CMX presentation framework. Components run in both CMXHTMLDesigner (design/preview) and CMXPortalManager (portal runtime).

## Skills

### generate-cmx-page

Generate a CMXHTMLDesigner-compatible page HTML file with cmx-revo-grid master-slave tables, CmxMasterSlave coordination, CmxColumnModel definitions, and CmxDataSet data binding.

**When to use:** User asks to create a page with master-detail/master-slave tables, parent-child grids, or hierarchical data grid views.

**Instructions:** Follow the guide at `docs/skill-generate-master-slave-page.md`. Key rules:
- Schema children define the parent-child hierarchy (detail is a child of master, not a sibling root)
- All path references must use full dot-separated paths (e.g. `orders.details`, not `details`)
- Use `ms.setFlatData()` for flat data with foreign keys; `ms.setDataSet()` for pre-built CmxDataSet trees
- Get class references via `globalThis.__cmxDataComp || host.__cmxClasses` (never use `import()` in page functions)
- All elements need `data-node-id="n-{N}"` attributes
- Button events use `data-eventclick="fnName();"` attributes
- Register pages in both `pages-list.json` files (Designer + Portal) and optionally in `explorer-menu.json`

**Reference page:** `../../cmx-html-designer`

### use-combo-box

Use `<cmx-combo-box>` as a dropdown / tree picker / grid picker bound to `CmxDataSet` + `CmxColumnModel`, with optional `pageService` remote search.

**When to use:** User asks for a combo / dropdown / lookup field, especially with tree or grid picker; or wants `editMode:'combo'` on a `CmxColumn`.

**Instructions:** Follow the guide at `docs/skill-combo-box.md`. Key points:
- Three dropdown modes: `'list'` / `'tree'` / `'grid'` (`list` and `grid` share `<cmx-revo-grid>`; `tree` uses `<cmx-web-treeview>`)
- Remote search: wrap a pageService via `createPageServiceDataSource(host, { service, keyField, labelField, queryParam, responsePath | transform })`
- Form / grid editor integration: set `CmxColumn.editMode = 'combo'`, put data-source + dropdown shape in `editSettings`
- AbortSignal is auto-threaded into `fetch` by `build-cmx-page-script-block.js` (services are compiled with signature `(params, _opts)`)

### use-tabulator-treegrid

Use `<cmx-tabulator>` as a 树形表格（treegrid）：flat rows (`parentField` FK) or pre-nested (`_children`) → hierarchical grid, with expand/collapse + `iconCol` icons + `CmxColumnModel`/`CmxDataSet` binding.

**When to use:** User asks for a tree table / treegrid / hierarchical grid / 树形表格 (rows that expand into child rows under the same columns) — as opposed to master-slave (two separate grids).

**Instructions:** Follow the guide at `docs/cmx-tabulator-treegrid.md`. Key points:
- Built on Tabulator 6 native `dataTree`; cmx options `setOptions({ dataTree, parentField, treeColumn, treeStartExpanded })` translate to `dataTree*`
- Flat→nested归一在纯函数 `lib/cmx-tree-data.js`（`normalizeTreeData`/`buildTreeFromFlat`），防自引用/成环，可单测
- 调用顺序：`setColumnModel`（填列 + `iconCol`→iconField）→ `setOptions({dataTree:true,...})` → `setData`
- 展开态刷新自动保持（`_expandedIds` 快照，同 `cmx-web-treeview`）；API `expandAll/collapseAll/expandRow/collapseRow/toggleRow/getExpandedIds`
- 事件 `cmx-tree-row-expanded` / `cmx-tree-row-collapsed`；声明式属性 `data-cmx-tree` / `data-cmx-parent-field` / `data-cmx-tree-column` / `data-cmx-icon-field`
- 参考演示页 `tabulator-treegrid-demo`，生成脚本 `scripts/gen-treegrid-demo.mjs`

## Key Architecture Notes

- Page functions are compiled via `new Function("$data", "host", body).bind(host, $data, host)` — they run in global scope, cannot use `import()` or ES module syntax
- `buildCmxScriptBlockFromPageState` generates the runtime Web Component class; `dataFlow` in `__designer_meta__` triggers auto-init of CmxMasterSlave in `connectedCallback`
- `normalizeServerPageHtmlForDebug` converts stored page HTML into runnable documents; it must pass `dataFlow` and `dataSources` fields through to the script builder
- PortalManager injects page scripts via `document.createElement('script')` (not through Vite), so bare specifier imports don't work — classes must be preloaded on `globalThis.__cmxDataComp`

## 字段类型注册表（cmx-form-field-registry）

`cmx-ui5-form` 与 `cmx-revo-grid` 共享一个字段类型注册表，零代码加新编辑器/显示：

```js
import { registerFieldType } from 'cmx-data-comp'

registerFieldType('color', {
  form: { create(field, ctx)/*->HTMLElement*/, write(editor, raw, field, ctx) },
  grid: { editor(col, save, close)/*->{element,getValue}*/, cellTemplate(h, props) },
})
```

- form 端：未注册时回退到 `cmx-ui5-form._createEditor/_writeOne` 内置 switch
- grid 端：mount 时把 `getRegisteredGridEditors()` 写入 `revo.editors`；`_syncToRevo` 给列叠加 `editor:'<type>'` + `cellTemplate`（不覆盖列自带的）
- 类型识别：列上 `_cmxType` 或 `_cmxCol.type`
- 内置外挂示例：`import 'cmx-data-comp/lib/cmx-builtin-field-types.js'` 注册 `color`
