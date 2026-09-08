# mainapp / workspace / context / page / view 使用说明

本文档说明 CMX Portal 运行环境中五个核心概念的结构、来源与页面脚本访问方式。

---

## 1. `mainapp` — 全局单例入口

挂载在 `globalThis.mainapp`，页面脚本中可直接使用 `mainapp`。

| 属性 | 类型 | 说明 |
|---|---|---|
| `mainapp.workspaces` | `Record<wsId, Workspace>` | 所有打开中的工作区，键为 `tab:<tabId>` |
| `mainapp.activityScopes` | `Record<scopeId, ActivityScope>` | 活动侧栏作用域，键为 `actv:<activityId>` |
| `mainapp.activeWorkspaceId` | `string \| null` | 当前激活的 content tab 对应 wsId，无则 `null` |

```js
// 读当前激活的 workspace
const ws = mainapp.workspaces[mainapp.activeWorkspaceId]

// 遍历所有打开的 workspace
for (const [wsId, ws] of Object.entries(mainapp.workspaces)) {
  console.log(wsId, ws.label, ws.state)
}
```

---

## 2. `workspace` — 工作区作用域

对应 content 区一个打开的标签页（`Workspace`）或活动侧栏（`ActivityScope`）。两者结构相同，ActivityScope 只含 `explorer` 区域。

### 2.1 获取方式（三种，同一对象）

```js
// 写法 A：页面顶层 <script> 在注入瞬间捕获（推荐）
// globalThis.workspace 仅在注入期间有效，须在最外层立即捕获
const ws = workspace

// 写法 B：在 page-fn / iface 函数体内，通过 host getter
const ws = host.workspace   // 或 this.workspace（this 绑定到 host）

// 写法 C：在任意位置通过 mainapp
const ws = mainapp.workspaces[mainapp.activeWorkspaceId]
```

### 2.2 属性

| 属性 | 类型 | 说明 |
|---|---|---|
| `ws.id` | `string` | wsId，形如 `tab:42` 或 `actv:sideNav` |
| `ws.label` | `string` | 工作区显示名称 |
| `ws.state` | `'preparing' \| 'open' \| 'closed'` | 工作区生命周期状态 |
| `ws.context` | `ContextHost` | 本 workspace 共享上下文，见第 3 节 |
| `ws.views` | `Record<viewId, 冻结对象>` | 所有已注册视图的 API 快照 |
| `ws.regions` | `{ content, explorer, property, bottom, floatview, prepare }` | 各区域的 viewId 数组 |

### 2.3 regions 用法

```js
// 列出 content 区所有已注册视图
for (const vid of ws.regions.content) {
  const v = ws.views[vid]
  console.log(vid, v.__pageId, v.__region)
}

// 找 content 区中 pageId 为 'order-detail' 的视图
const targetVid = ws.regions.content
  .find(vid => ws.views[vid]?.__pageId === 'order-detail')
```

---

## 3. `context` — workspace 共享上下文

`workspace.context`（`ContextHost` 实例）是本 workspace 内所有视图共享的键值仓库，专为跨视图通信设计。

### 3.1 API

| 方法 | 说明 |
|---|---|
| `context.set(key, value)` | 存值，触发 `change` 事件 |
| `context.get(key)` | 取值，未设置返回 `undefined` |
| `context.delete(key)` | 删除，触发 `change` 事件 |
| `context.snapshot()` | 返回所有条目的浅克隆对象 `{}` |
| `context.on('change', fn)` | 监听任意 key 变化，`fn({ key, value, oldValue })` |
| `context.off('change', fn)` | 取消监听 |

> **注意**：只有 `set` / `delete` 触发 `change`；对 `get()` 返回值直接赋属性**不会**触发通知。

### 3.2 跨视图通信示例

**注册自身引用（Page B — onMount iface 体）：**

```js
host.workspace.context.set('pageB:host', host)
```

**清理（Page B — onDispose iface 体）：**

```js
host.workspace.context.delete('pageB:host')
```

**调用另一个视图的函数（Page A — page-fn 体）：**

```js
const pageB = host.workspace.context.get('pageB:host')
if (pageB?.refresh) await pageB.refresh()
```

**监听状态变化（Page A — onMount iface 体）：**

```js
function _onCtxChange({ key, value }) {
  if (key === 'selectedOrderId') host.loadOrder(value)
}
host.workspace.context.on('change', _onCtxChange)
```

**清理监听（Page A — onDispose iface 体）：**

```js
host.workspace.context.off('change', _onCtxChange)
```

**写入共享值（Page B — 事件脚本）：**

```js
workspace.context.set('selectedOrderId', $data.orderId)
```

---

## 4. `page` — 设计器页面（html_pages 视图类型）

portal 的 workspace 配置中，`type: 'html_pages'` + `html_page: '<pageId>'` 声明一个页面视图：

```json
{
  "content": {
    "views": [
      { "id": "order-list",   "type": "html_pages", "html_page": "order.list" },
      { "id": "order-detail", "type": "html_pages", "html_page": "order.detail" }
    ]
  }
}
```

页面加载后生成一个 Custom Element 实例挂入 DOM。

### 4.1 CE 标签名规则

标签名格式：`cmx-html-pages-<slug>`

slug 由 pageId 转换：统一小写，`.` 和 `_` 转 `-`，其他非法字符也转 `-`，连续 `-` 合并。

| pageId | CE 标签名 |
|---|---|
| `order.detail` | `cmx-html-pages-order-detail` |
| `my_page_01` | `cmx-html-pages-my-page-01` |
| `salesOrder` | `cmx-html-pages-salesorder` |

CE 元素**没有** `id` 属性，通过 `data-cmx-html-page-host=""` 属性识别。

### 4.2 获取 CE 实例

```js
// 已知 pageId，同一 workspace 内只有一个实例时直接查
const host = document.querySelector('cmx-html-pages-order-detail')

// 限定在特定视图容器内（多实例时精确定位）
const wrapper = document.querySelector('[data-cmx-view-id="order-detail"]')
const host = wrapper?.querySelector('[data-cmx-html-page-host]')
```

### 4.3 CE 上的成员

page-fn 和 iface 在 `connectedCallback` 阶段注册到 host 实例上。

| 成员 | 说明 |
|---|---|
| `host.$data` | 页面数据 Proxy，写属性驱动 `data-bind-*` 绑定 |
| `host.myFn(args)` | 「函数」面板定义的 page-fn |
| `host.myService(params)` | 「服务」面板定义的服务方法 |
| `host.workspace` | 所属 Workspace / ActivityScope |
| `host.markDirty()` / `host.markClean()` | 脏标记控制，派发 `cmx-page-dirty-changed` |
| `host.setBusy(on, msg)` | 忙状态广播，派发 `cmx-page-busy-changed` |
| `host.__cmxInitialData` | 挂载时 `$data` 的结构化克隆（`reset()` 用） |

**iface 接口方法**（作者在「接口」面板启用后可用）：

| 分组 | 方法 |
|---|---|
| 状态查询 | `isDirty()` `getState()` `validate()` `getResult()` `isEditable()` `isLocked()` `canUndo()` `canRedo()` |
| 生命周期 | `onMount(ctx)` `onActivate()` `onDeactivate()` `onDispose()` |
| 编辑动作 | `undo()` `redo()` `reset()` `setEditable(on)` `setLocked(on)` |
| 持久化 | `save()` `apply()` `cancel()` `canClose()` `refresh()` `importData(payload)` `exportData()` `print()` |
| 对话框 | `onDialogOpen(args)` `onDialogClose(reason)` `getDialogTitle()` `getDialogButtons()` `getDialogSize()` |
| 工作流 | `submit(opts)` `recall(opts)` `returnBack(opts)` `addApprover(opts)` `addCC(opts)` `getWorkflowProgress()` `previewWorkflow(opts)` |
| 数据注入 | `setData(patch)` `setContext(ctx)` |

---

## 5. `view` — workspace 中的视图条目

每个成功加载并连接到 DOM 的 html_pages CE，会被 mainapp 自动注册为一条视图记录。

### 5.1 viewId 生成规则

优先级从高到低：

1. workspace 配置中视图的 `id` 字段（**推荐手动指定**，语义明确）
2. 视图的 `html_page` 字段（即 pageId）
3. 区域名 + 索引，如 `content.0`、`property.1`

同一 scope 内重名时自动追加 `#2`、`#3` 等序号并打印警告。

### 5.2 `workspace.views[viewId]` 结构

冻结的只读对象，包含系统字段：

```js
ws.views['order-detail']
// {
//   __viewId:  'order-detail',   // viewId 本身
//   __region:  'content',        // 所在区域
//   __pageId:  'order.detail',   // 原始 pageId
// }
```

> 若 CE 定义了 `getPageApi()`，其返回字段也会合并进来。设计器生成的 CE 目前不定义此方法，因此只有三个系统字段。

### 5.3 通过 viewId 定位 CE host

```js
const vid = 'order-detail'
const wrapper = document.querySelector(`[data-cmx-view-id="${vid}"]`)
const host = wrapper?.querySelector('[data-cmx-html-page-host]')
host?.refresh?.()
```

### 5.4 多实例处理

同一 pageId 在 workspace 里可以打开多个视图（配置不同 `id`）。此时：

- `document.querySelector('cmx-html-pages-order-detail')` 只返回第一个
- 用 viewId + `data-cmx-view-id` 精确定位各实例

```js
// 找 content 区所有 pageId 为 'order-detail' 的实例
for (const vid of ws.regions.content) {
  if (ws.views[vid]?.__pageId !== 'order-detail') continue
  const wrapper = document.querySelector(`[data-cmx-view-id="${vid}"]`)
  const host = wrapper?.querySelector('[data-cmx-html-page-host]')
  if (host?.refresh) await host.refresh()
}
```

---

## 6. 完整结构示意

```
globalThis.mainapp
  ├── workspaces['tab:42']               ← Workspace
  │     ├── id: 'tab:42'
  │     ├── label: '订单管理'
  │     ├── state: 'open'
  │     ├── context                      ← ContextHost（跨视图共享 KV）
  │     │     ├── get / set / delete / snapshot
  │     │     └── on / off('change', fn)
  │     ├── regions
  │     │     ├── content:   ['order-list', 'order-detail']
  │     │     ├── explorer:  ['nav-tree']
  │     │     ├── property:  ['prop-panel']
  │     │     └── bottom:    []
  │     └── views
  │           ├── 'order-list'    → { __viewId, __region, __pageId }
  │           └── 'order-detail'  → { __viewId, __region, __pageId }
  │
  └── activityScopes['actv:sideNav']     ← ActivityScope（同结构，只有 explorer 区）
        ├── context
        ├── regions: { explorer: ['menu-tree'] }
        └── views: { 'menu-tree': { __viewId, __region, __pageId } }

DOM（content 区）：
  [data-cmx-workspace-id="tab:42"]
    [data-cmx-view-id="order-detail"]  [data-cmx-region="content"]
      <cmx-html-pages-order-detail data-cmx-html-page-host>
        ├── host.$data
        ├── host.myFn()
        ├── host.save() / host.refresh() / host.isDirty() …
        ├── host.workspace  →  ws（同上）
        └── #shadow-root
              └── （页面 UI，来自 <template id="cmx-page-template-order-detail">）
```

---

## 7. 页面脚本速查

```js
// ── 在页面顶层 <script>（注入时）──────────────────────────────────
const ws = workspace                 // 立即捕获，注入完成后 globalThis.workspace 被还原

// ── 在 page-fn / iface / 事件脚本 中 ───────────────────────────────

// 取所属 workspace
const ws = host.workspace

// 读写 context（跨视图共享）
ws.context.set('key', value)
ws.context.get('key')
ws.context.delete('key')
const snap = ws.context.snapshot()
ws.context.on('change', ({ key, value, oldValue }) => { /* ... */ })

// 通过 pageId 找另一个视图的 CE host（单实例）
const other = document.querySelector('cmx-html-pages-order-detail')
await other?.refresh?.()

// 通过 viewId 精确定位（多实例安全）
const wrapper = document.querySelector('[data-cmx-view-id="order-detail"]')
const other = wrapper?.querySelector('[data-cmx-html-page-host]')
await other?.save?.()

// 遍历 content 区所有视图
for (const vid of ws.regions.content) {
  const info = ws.views[vid]          // { __viewId, __region, __pageId }
  const wrapper = document.querySelector(`[data-cmx-view-id="${vid}"]`)
  const host = wrapper?.querySelector('[data-cmx-html-page-host]')
  console.log(info.__pageId, host)
}

// 通过 mainapp 跨 workspace 访问
const otherWs = mainapp.workspaces['tab:99']
const ctx = otherWs?.context.snapshot()
```
