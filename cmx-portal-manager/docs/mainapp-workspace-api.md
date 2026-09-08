# Portal 页面脚本运行时 API（`mainapp` / `workspace` / `context` / `html_pages`）

本文整理 **HTML 页面脚本**（即在画布或 `cmx-html-pages-*` Web Component 内运行的代码）在门户中可以访问哪些全局实例、属性与函数，以及它们的生命周期。

> 适用范围：`type: "html_pages"` 的视图（菜单 `workspace.<region>` 或活动栏 `sideNav: { type: "html_pages" }` 中引用）。
> 主入口源码：[src/lib/mainapp.js](src/lib/mainapp.js)、[src/lib/workspace-html-page-preview.js](src/lib/workspace-html-page-preview.js)、[src/lib/workspace-node.js](src/lib/workspace-node.js)。

---

## 1. 顶层全局：`globalThis.mainapp`

进程内**唯一全局**，由 [src/lib/mainapp.js:161-169](src/lib/mainapp.js#L161-L169) 创建并挂到 `globalThis`。

```ts
mainapp: {
  workspaces:        Record<string, Workspace>      // key = wsId, 形如 `tab:<contentTabId>`
  activityScopes:    Record<string, ActivityScope>  // key = scopeId, 形如 `actv:<activityId>`
  activeWorkspaceId: string | null                  // 当前激活的 content tab 对应 wsId
}
```

| 字段 | 含义 | 何时变化 |
| --- | --- | --- |
| `workspaces[wsId]` | content 区一个工作区 Tab 对应的作用域 | `createWorkspace` / `disposeWorkspace`（[mainapp.js:179](src/lib/mainapp.js#L179)、[mainapp.js:192](src/lib/mainapp.js#L192)） |
| `activityScopes[scopeId]` | 活动侧栏 `html_pages` 作用域 | `createActivityScope` / `disposeActivityScope`（[mainapp.js:207](src/lib/mainapp.js#L207)、[mainapp.js:220](src/lib/mainapp.js#L220)） |
| `activeWorkspaceId` | 当前 content Tab 切换驱动 | `setActiveWorkspace`（[mainapp.js:310](src/lib/mainapp.js#L310)）；当前 ws 被 dispose 时回 `null` |

### 1.1 模块函数

来自 [src/lib/mainapp.js](src/lib/mainapp.js)，可 `import` 在 portal 自身代码使用；**页面脚本通常不直接调用这些**（页面脚本走 `globalThis.workspace`/`this.workspace`，见 §3）。

| 函数 | 签名 | 说明 |
| --- | --- | --- |
| `createWorkspace(id, meta?)` | `(string, { label?: string }) => Workspace` | 同 id 复用并刷新 `label`；不会覆盖既有 `views`。 |
| `disposeWorkspace(id)` | `(string) => void` | 调用 `ws.dispose()`，从 `workspaces` 移除；若 `activeWorkspaceId === id` 则置 `null`。 |
| `createActivityScope(id, meta?)` | `(string, { label?: string }) => ActivityScope` | 同上，仅作用于 `activityScopes`。 |
| `disposeActivityScope(id)` | `(string) => void` | 同上。 |
| `getScope(scopeId)` | `(string) => Workspace \| ActivityScope \| null` | 先查 `workspaces`，再查 `activityScopes`。 |
| `setActiveWorkspace(wsId \| null)` | `(string\|null) => void` | 写 `activeWorkspaceId`。 |
| `scopeIdFromDom(node)` | `(Node) => string \| null` | 从 DOM 上溯找 `data-cmx-workspace-id`。 |
| `registerView(scopeId, viewId, region, pageId, host)` | `(...) => Readonly<api> \| null` | 由 hydrate 自动调用，详见 §5.2。 |
| `unregisterView(scopeId, viewId, host)` | `(...) => void` | host 比对幂等，详见 §5.3。 |

---

## 2. `Workspace` / `ActivityScope`

定义见 [mainapp.js:109-131](src/lib/mainapp.js#L109-L131) 与 [mainapp.js:136-158](src/lib/mainapp.js#L136-L158)。

### 2.1 共有字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `string` | wsId（`tab:<tabId>`）或 scopeId（`actv:<activityId>`）。 |
| `label` | `string` | 可读名（来自 menu caption / 活动 label）。 |
| `state` | `'preparing' \| 'open' \| 'closed'`（Workspace） / `'open'`（ActivityScope） | 生命周期状态。 |
| `context` | `ContextHost` | 共享上下文（详见 §4）。 |
| `views` | `Record<string, Readonly<api>>` | viewId → 冻结的 api 对象（详见 §5.2）。 |
| `regions` | 见下 | viewId 在各区域的索引列表。 |

### 2.2 `regions` 形状

- `Workspace.regions`：`{ prepare: string[], explorer: string[], content: string[], property: string[], bottom: string[], floatview: string[] }`
- `ActivityScope.regions`：`{ explorer: string[] }`（活动侧栏只有 explorer）

每个数组里是该区域已注册的 `viewId` 列表，按注册顺序追加，`unregisterView` 时按 viewId 移除。

### 2.3 内部字段（不要在页面脚本里依赖）

- `_hosts: Map<viewId, HTMLElement>` — 注册时记录 CE 宿主，用于 `unregisterView` 时做 host 比对避免 dock 拖动错乱。
- `dispose()` — 由 portal 自身调用（`disposeWorkspace` / `disposeActivityScope`）。

---

## 3. 页面脚本访问所属 workspace 的两种形态

> 摘自 [mainapp.js:16-19](src/lib/mainapp.js#L16-L19) 与 [workspace-html-page-preview.js:85-130](src/lib/workspace-html-page-preview.js#L85-L130)。

### 3.1 顶层脚本（在 IIFE / 模板内的 `<script>` 顶层）

`hydrateHtmlPagesWorkspaceViewsInRoot` 在把 `<script>` 节点 append 到 run-slot **之前**会写：

```js
globalThis.workspace = scope          // Workspace 或 ActivityScope
globalThis.__cmxTemplateRoot = slot   // 设计器组件用来定位 <template>
```

脚本注入完成后立即恢复（`finally` 块），因此页面脚本必须在**同步执行期**捕获。常见写法：

```html
<script>
  (function () {
    var ws  = globalThis.workspace          // 同步捕获，必须！
    var ctx = ws && ws.context

    // 监听上下文：只有 set/delete 触发
    ctx?.on('change', function (ev) {
      console.log('[ctx]', ev.key, '=', ev.value, '(was', ev.oldValue, ')')
    })

    // 异步处理也能用：
    setTimeout(function () {
      console.log('still works:', ws && ws.id)
    }, 1000)
  })()
</script>
```

> 注意：**不要**在 `setTimeout` 里再读 `globalThis.workspace`——hydrate 完成后该全局已被恢复，可能为 `undefined`。

### 3.2 Web Component 内（推荐）

`cmx-html-pages-<slug>` 是 CMXHTMLDesigner 由 `wrapHtmlDocument` 写入的自定义元素，`registerView` 会在第一次注册时给 host 装一个 `workspace` 只读 getter（[mainapp.js:273-281](src/lib/mainapp.js#L273-L281)）：

```js
class CmxHtmlPage_<slug> extends HTMLElement {
  connectedCallback () {
    const ws  = this.workspace          // = mainapp.workspaces[wsId]
    const ctx = ws?.context

    // 暴露给 mainapp.views[viewId] 的 api（见 §5.2）
    // 注：getPageApi 是页面作者自行定义的方法
  }
}
```

### 3.3 两种形态的差异

| 维度 | 顶层脚本 | CE 内 |
| --- | --- | --- |
| 取 ws | `globalThis.workspace`（仅注入期间） | `this.workspace`（始终有效） |
| 适用场景 | 全局副作用、调测 | 与组件实例方法/`$data` 联动 |
| 跨视图通信 | 通过 `ws.context` | 通过 `ws.context` |

---

## 4. `ContextHost`（`workspace.context` / `activityScope.context`）

源码：[src/lib/mainapp.js:27-95](src/lib/mainapp.js#L27-L95)。

**关键约定：只有 `set` / `delete` 派发 `change` 事件，裸赋值 `ctx.foo = 1` 不会通知。**

| 方法 | 签名 | 说明 |
| --- | --- | --- |
| `get(key)` | `(string) => unknown` | 读取，键被 `String(key)` 归一化。 |
| `set(key, value)` | `(string, unknown) => void` | 写入，`oldValue === value` 时不触发。 |
| `delete(key)` | `(string) => void` | 不存在则 no-op。 |
| `snapshot()` | `() => Record<string, unknown>` | 浅克隆当前所有键值。 |
| `on('change', handler)` | `(...) => void` | 仅 `'change'` 事件；handler 异常被 `console.warn` 吞掉，不影响其他订阅者。 |
| `off('change', handler)` | `(...) => void` | 反订阅。 |

**事件载荷：**

```ts
{ key: string, value: unknown, oldValue: unknown }
// delete 时 value === undefined
```

**用法示例（跨视图同步选中行）：**

```html
<!-- 视图 A：列表 -->
<script>
  var ws = globalThis.workspace
  document.querySelector('ui5-table').addEventListener('row-click', function (e) {
    ws.context.set('selectedRowId', e.detail.row.dataset.id)
  })
</script>

<!-- 视图 B：详情 -->
<script>
  var ws = globalThis.workspace
  ws.context.on('change', function (ev) {
    if (ev.key !== 'selectedRowId') return
    loadDetail(ev.value)
  })
  // 进入时拿快照即可（以防订阅前已 set 过）
  var initial = ws.context.get('selectedRowId')
  if (initial != null) loadDetail(initial)
</script>
```

---

## 5. `views[viewId]` 与视图 API 暴露

### 5.1 viewId 解析

由 [`resolveWorkspaceViewId`](src/lib/workspace-node.js#L657)（[workspace-node.js:657-672](src/lib/workspace-node.js#L657-L672)）：

1. `spec.id`（菜单/活动配置上显式写的）；
2. 否则 `spec.html_page`（页面 ID）；
3. 否则 `<region>.<index>`；
4. 同 scope 内重名追加 `#2`、`#3`…

### 5.2 `getPageApi()` —— 页面把 API 暴露给 mainapp

`registerView`（[mainapp.js:248-283](src/lib/mainapp.js#L248-L283)）会调用 `host.getPageApi?.()`，把返回的对象**冻结**后写入 `scope.views[viewId]`，并附加系统字段：

```ts
scope.views[viewId] = Object.freeze({
  ...userApi,        // 来自页面 host.getPageApi()
  __viewId: string,  // resolveWorkspaceViewId 的结果
  __region: 'prepare' | 'explorer' | 'content' | 'property' | 'bottom' | 'floatview',
  __pageId: string,  // 该 html_pages 的页面 ID
})
```

页面侧实现示例（在 `connectedCallback` 中给 `this` 挂方法即可）：

```js
class CmxHtmlPage_my_page extends HTMLElement {
  connectedCallback () {
    var host = this
    host.refresh = function () { /* … */ }
    host.getSelected = function () { return host._sel }

    // mainapp 注册时会调到
    host.getPageApi = function () {
      return {
        refresh:     host.refresh.bind(host),
        getSelected: host.getSelected.bind(host),
      }
    }
  }
}
```

> `getPageApi` 抛错不致命：会 warn 后以**空 user api**注册（仍含 `__viewId/__region/__pageId`）。
> **api 对象被 `Object.freeze`**，对外是只读快照；后续值变化要通过 `context` 派发或自定义事件。

### 5.3 注册/注销时机

| 事件 | 触发 | 行为 |
| --- | --- | --- |
| `registerView` | hydrate 完成后立刻（仍在 `globalThis.workspace = scope` 临窗内） | 写 `views[viewId]` + `_hosts.set(vid, host)` + `regions[region].push(vid)`，幂等：同 host 重入直接返回既有 api。 |
| 替换 | hydrate 期间发现 `_hosts.get(vid)` 存在但**非**当前 host | 以新 host 覆盖（dock 拖动序列正向）。 |
| `unregisterView` | CE `disconnectedCallback` 触发 `__cmxDispose`，或 `MutationObserver` 兜底（[workspace-html-page-preview.js:217-229](src/lib/workspace-html-page-preview.js#L217-L229)） | **仅当 `_hosts.get(vid) === host` 才删**——避免 dock 拖动反序时把刚注册的新条目错删。 |

### 5.4 在脚本里读取其他视图的 api

```js
var ws = globalThis.workspace
var detail = ws.views['detail-pane']     // 兄弟视图 viewId
detail?.refresh?.()
console.log('region of detail =', detail?.__region)
```

---

## 6. `html_pages` 视图配置 & 渲染流水线

### 6.1 视图 spec

```jsonc
// menu workspace.<region> 或 activity sideNav.views[]
{
  "id":        "list-pane",          // 可选：覆盖 viewId（见 §5.1）
  "tabLabel":  "列表",                // 多视图时 Tab 文字
  "icon":      "list",                // ui5-icon name
  "type":      "html_pages",          // 必须
  "html_page": "my-page-test101",     // 服务端页面 ID（必须，等价于 data.html_page）
  "data":      { "html_page": "..." } // 备选写法，与顶层 html_page 等价（[workspace-node.js:261-268]）
}
```

### 6.2 区域配置形态

每个区域键（`content` / `explorer` / `property` / `bottom` / `prepare` / `floatview`）三种写法（[workspace-node.js:97-99](src/lib/workspace-node.js#L97-L99)）：

```jsonc
// 1. 单视图
"content": { "type": "html_pages", "html_page": "p1" }

// 2. 多视图数组（自动出底部 Tab 条）
"content": [ {...}, {...} ]

// 3. 包装对象（区域级 caption / icon / views，prepare 还可选 width / height）
"content": {
  "caption": "工作台", "icon": "business-objects-experience",
  "views": [ {...}, {...} ]
}
```

### 6.3 数据加载

由 [`prepareWorkspaceHtmlPages`](src/lib/workspace-node.js#L480) 驱动：

1. `collectHtmlPageIdsFromWorkspace` 收集所有 `html_pages` 视图的页面 ID，去重；
2. 命中**会话级 LRU 缓存**（默认 64 条，可 `setHtmlPageBatchSessionCacheLimit` 调整）则跳过；
3. 未命中部分批量 `POST /api/html-pages/batch`，由 `enrichBatchHtmlPagesWithPreviewFields` 给每条 page 附：
   - `htmlPageRunnableDoc` —— **完整可运行 HTML 文档**（包了 `<template>` + CE 宿主 + `__hydrateEvents` + 页面脚本）；
   - `htmlPagePreviewStructure` —— 仅结构片段；
   - `htmlPageExecutableScripts: string[]`；
   - `htmlPagePreviewError`（如有解析异常）。
4. `applyHtmlPagesBatchToWorkspace` 把上述字段塞进每个视图的 `spec.data`（同时附 `htmlPage`、`htmlPageId`，失败附 `htmlPageLoadError`）。

REST 客户端：[src/api/html-pages-api.js](src/api/html-pages-api.js)

| 函数 | 端点 |
| --- | --- |
| `listHtmlPages(page, pageSize)` | `GET /api/html-pages?page&pageSize` |
| `getHtmlPage(id)` | `GET /api/html-pages/:id` |
| `saveHtmlPage(payload)` | `POST /api/html-pages`（按 `id` upsert） |
| `getHtmlPagesBatch(ids)` | `POST /api/html-pages/batch` |

### 6.4 渲染 → 注入 → 脚本执行

`renderHtmlPagesWorkspaceView`（[workspace-node.js:424-472](src/lib/workspace-node.js#L424-L472)）输出形如：

```html
<div class="cmx-html-pages-view" data-cmx-html-page-id="<pid>" style="...">
  <div class="cmx-html-pages-run-slot" data-cmx-html-pages-run-slot style="opacity:0;..."></div>
  <textarea hidden data-cmx-html-pages-payload>...escaped runnableDoc...</textarea>
</div>
```

`hydrateHtmlPagesWorkspaceViewsInRoot`（[workspace-html-page-preview.js:239-304](src/lib/workspace-html-page-preview.js#L239-L304)）做：

1. 读 textarea，移除；解析为完整 DOM；
2. 设 `globalThis.__cmxTemplateRoot = slot`、`globalThis.workspace = scope`；
3. 顺序把 `<body>` 子节点搬入 `slot`；遇 `<script>` 时**新建 script 节点**才会真正执行；
4. 给 `[data-cmx-html-page-host]` 元素强制 `display:block;width:100%;flex:1 1 auto;...` 防止塌陷；
5. 找到 CE 宿主调 `registerView`；并把原 `host.__cmxDispose` 链上叠加 `unregisterView`；
6. `finally` 恢复全局；`requestAnimationFrame x2` 后把 slot `opacity` 设为 1（防闪烁）。

### 6.5 CE 内默认可用变量（CMXHTMLDesigner 生成的脚本块）

CMXHTMLDesigner 的 `buildCmxScriptBlockFromPageState` 会在 `connectedCallback` 内为页面注入：

| 变量 | 来源 | 说明 |
| --- | --- | --- |
| `host` | 局部别名，`var host = this` | 可挂方法/字段。 |
| `root` | `this.attachShadow({ mode: 'open' })` | 当前实例 ShadowRoot。 |
| `host.$data` | `Proxy(_$dataRaw)` | **赋值会自动走 `data-bind-*` 双向更新到 DOM**；仅当页面有 `pageData` 时存在（[build-cmx-page-script-block.js:111-121](../CMXHTMLDesigner/src/utils/build-cmx-page-script-block.js#L111-L121)）。 |
| `host.<fnName>` | `pageFns[]` 每条 `{ name, params, body }` | 作为实例方法注册（[build:124-131](../CMXHTMLDesigner/src/utils/build-cmx-page-script-block.js#L124-L131)）。 |
| `host.<svcName>` | `pageServices[]` | HTTP / WebSocket，可选 `responseTo` 自动写回 `$data`（[build:133-156](../CMXHTMLDesigner/src/utils/build-cmx-page-script-block.js#L133-L156)）。 |
| `__hydrateEvents(root, host)` | `wrapHtmlDocument` 注入 | 扫描 `data-event<evt>` 属性并 `addEventListener`，回调内 `with (host)` 执行表达式。 |
| `host.__cmxDispose` | 业务侧自行赋值（可选） | `disconnectedCallback` 会调用，做清理（定时器、WebSocket、ResizeObserver…）。门户 hydrate 还会在此链上**追加** unregisterView。 |

> 即便 `pageData/pageFns/pageServices` 全空，`wrapHtmlDocument` 也会用 [`_cmxShellPageComponentScript`](../CMXHTMLDesigner/src/utils/html-utils.js#L170-L201) 兜底注册 CE，因此 `connectedCallback` 永远会跑。

### 6.6 DOM 标记总结（脚本里可用作锚点）

| 属性 / 类 | 写在哪 | 用途 |
| --- | --- | --- |
| `data-cmx-workspace-id` | content tab pane 根 / 活动侧栏根 | `scopeIdFromDom` 上溯定位 scope。 |
| `data-cmx-region` | view 外层 marker div | 由 `wrapViewWithMarker` 写入；hydrate 时读取 region。 |
| `data-cmx-view-id` | 同上 | 解析后的 viewId。 |
| `data-cmx-html-page-id` | `.cmx-html-pages-view` | spec 的 `html_page`。 |
| `data-cmx-html-pages-run-slot` | run-slot div | hydrate 注入目标。 |
| `data-cmx-html-pages-payload` | textarea（旧版兼容 `<script type="application/json">`） | 整页 HTML 载荷。 |
| `data-cmx-html-page-host` | CMXHTMLDesigner 写入 `<cmx-html-pages-*>` | hydrate 强制布局；mainapp 识别 CE 宿主。 |

---

## 7. 端到端示例：跨视图主从联动

`menus/foo.json` 工作区配置（节选）：

```jsonc
{
  "workspace": {
    "explorer": {
      "caption": "目录",
      "views": [
        { "id": "list",   "tabLabel": "列表", "icon": "list",
          "type": "html_pages", "html_page": "my-list" }
      ]
    },
    "content": [
      { "id": "detail", "tabLabel": "详情", "icon": "detail-view",
        "type": "html_pages", "html_page": "my-detail" }
    ]
  }
}
```

`my-list` 页面（设计器里的 `pageFns`）：

```js
// 行点击：写共享上下文
host.onRowClick = function (ev) {
  workspace.context.set('selectedId', ev.detail.row.dataset.id)
}

host.getPageApi = function () {
  return { focusRow: function (id) { /* … */ } }
}
```

`my-detail` 页面：

```js
host.connectedCallback_after = function () {
  // ContextHost 监听
  workspace.context.on('change', function (ev) {
    if (ev.key === 'selectedId') host.load(ev.value)
  })
  // 反向调用兄弟视图：
  workspace.views.list?.focusRow?.(workspace.context.get('selectedId'))
}

host.__cmxDispose = function () {
  // 自行清理：portal 会在此链外再追加 unregisterView
}

host.getPageApi = function () { return { load: host.load } }
```

---

## 8. 常见坑

1. **`globalThis.workspace` 在 setTimeout 里取不到** — hydrate 期间是临时设置，必须**同步**捕获（见 §3.1）。
2. **裸赋值 `ctx.foo = 1` 不通知** — 必须 `ctx.set('foo', 1)`；外部代码的 `on('change')` 才会触发。
3. **`views[viewId]` 是冻结对象** — 不要尝试改字段，新值通过 context/事件/方法调用传递。
4. **重名 viewId** — 同 scope 内会自动追加 `#2/#3` 并 `console.warn`，建议显式给每个视图写 `id`。
5. **`__cmxDispose` 多链路** — 业务里覆盖前先存旧值并在自定义函数里调用，否则会破坏 hydrate 注入的 `unregisterView`（CMXHTMLDesigner 默认就保留了链式调用模式）。
6. **页面过大** — `runnableDoc` 超过 `MAX_RUN_DOC = 1_100_000` 字符时不嵌入，仅渲染占位（[workspace-node.js:449,458-462](src/lib/workspace-node.js#L449)）。
