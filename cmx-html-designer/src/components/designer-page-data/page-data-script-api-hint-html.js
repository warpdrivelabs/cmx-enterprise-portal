/**
 * 函数 / 服务脚本中可用的全局与上下文说明（插入「函数」「服务」面板，定义区下方）。
 * 与 {@link ../../utils/build-cmx-page-script-block.js}、`designer-canvas` 事件注入、
 * {@link ../../debug-portal/mainapp.js} 调试门户行为对齐。
 */
export const PAGE_DATA_SCRIPT_API_HINT_SNIPPET = `
  <div class="page-data-api-hint" role="note" aria-label="脚本可用 API 说明">
    <div class="page-data-api-hint__title">脚本中可用的变量与 API</div>
    <div class="page-data-api-hint__section">
      <div class="page-data-api-hint__sec-title">页面组件内（导出 / 预览 / 页内运行）</div>
      <ul class="page-data-api-hint__list">
        <li><code>this</code> — 当前页面自定义元素（<code>&lt;cmx-html-pages-…&gt;</code>）实例，含 <code>attachShadow</code> 后的根节点逻辑。</li>
        <li><code>$data</code> — 页面数据对象（Proxy，与「数据」面板变量同步）；写属性会驱动 <code>data-bind-*</code> 绑定。</li>
        <li><code>this.$data</code> — 与 <code>$data</code> 相同引用。</li>
        <li><code>this.函数名</code> / 直接 <code>函数名()</code> — 调用本页「函数」面板声明的其它页面函数（挂载在同一实例上）。</li>
        <li><code>this.服务名</code> — 调用本页「服务」面板声明的服务（HTTP / WebSocket 等生成方法）。</li>
        <li><code>this.__cmxDispose</code> — 可赋值为清理函数；组件卸载时调用（定时器、<code>ResizeObserver</code>、WS 等）。</li>
      </ul>
    </div>
    <div class="page-data-api-hint__section">
      <div class="page-data-api-hint__sec-title">设计器 · 画布事件脚本（属性 → 事件）</div>
      <ul class="page-data-api-hint__list">
        <li>形参固定为 <code>event</code>（<code>MouseEvent</code> / <code>CustomEvent</code> 等）。</li>
        <li><code>this</code> — 绑定监听器的那个 DOM 节点（设计区元素）。</li>
        <li><code>$data</code> — 与上表相同（运行时注入）。</li>
      </ul>
    </div>
    <div class="page-data-api-hint__section">
      <div class="page-data-api-hint__sec-title">调试页 / 门户对齐 · <code>mainapp</code> 与 <code>workspace</code></div>
      <ul class="page-data-api-hint__list">
        <li><code>globalThis.mainapp</code> — <code>workspaces</code>（按 wsId）、<code>activityScopes</code>、<code>activeWorkspaceId</code>。</li>
        <li><code>globalThis.workspace</code> — 执行页面内联 <code>&lt;script&gt;</code> 期间由宿主注入的<strong>当前</strong>工作区；用完会恢复，建议在顶层脚本里 <code>const ws = workspace</code> 捕获。</li>
        <li><code>workspace.id</code> / <code>workspace.label</code> / <code>workspace.state</code> — 工作区标识与状态。</li>
        <li><code>workspace.context</code> — 共享上下文：<code>get(key)</code>、<code>set(key, val)</code>、<code>delete(key)</code>、<code>snapshot()</code>、<code>on('change', fn)</code> / <code>off</code>。</li>
        <li><code>workspace.views[viewId]</code> — 只读 API 快照（由页面 CE 的 <code>getPageApi()</code> 合并系统字段 <code>__viewId</code>、<code>__region</code>、<code>__pageId</code>）。</li>
        <li><code>workspace.regions</code> — 如 <code>content</code>、<code>explorer</code> 等区域到 viewId 列表的映射（调试页主要使用 <code>content</code>）。</li>
        <li><code>this.workspace</code> — 在已注册到工作区的页面自定义元素上，可通过 getter 取得所属 <code>Workspace</code>（与门户一致）。</li>
        <li><code>globalThis.__cmxTemplateRoot</code> — 模板/页面宿主挂载容器；解析 <code>#cmx-page-template-…</code> 时使用。</li>
      </ul>
    </div>
    <div class="page-data-api-hint__section">
      <div class="page-data-api-hint__sec-title">对外接口契约 · 「接口」面板（<code>host.*</code>）</div>
      <ul class="page-data-api-hint__list">
        <li><strong>脏跟踪由作者控制</strong>：<code>host.markDirty()</code> / <code>host.markClean()</code>；<code>$data</code> 写入<u>不会</u>自动置脏。<code>cmx-page-dirty-changed</code> 自动派发。</li>
        <li><strong>忙状态广播</strong>：<code>host.setBusy(true, '保存中…')</code> 派发 <code>cmx-page-busy-changed</code>，宿主可显示进度条。</li>
        <li><strong>初始快照</strong>：挂载时自动捕获到 <code>host.__cmxInitialData</code>（structuredClone of <code>$data</code>），<code>reset()</code> 默认回滚到此快照。</li>
        <li><strong>请求宿主动作</strong>：作者可主动派发 <code>cmx-page-request-save</code> / <code>cmx-page-request-close</code>（adapter 监听并分派到 <code>save</code> / <code>onDialogClose</code>）。</li>
        <li><strong>状态查询</strong>：<code>isDirty</code>、<code>getState</code>、<code>validate</code>、<code>getResult</code>、<code>isEditable</code>、<code>isLocked</code>、<code>canUndo</code>、<code>canRedo</code>。</li>
        <li><strong>生命周期</strong>：<code>onMount(ctx)</code>、<code>initPage(ctx)</code>（默认启用；onMount 后由宿主调用一次，适合异步数据加载）、<code>onActivate</code>、<code>onDeactivate</code>、<code>onDispose</code>。<code>onDispose</code> 在 <code>__cmxDispose</code> 之前调用。</li>
        <li><strong>编辑动作</strong>：<code>undo</code>、<code>redo</code>、<code>reset</code>、<code>setEditable(on)</code>、<code>setLocked(on)</code>。后两者派发 <code>cmx-page-editable-changed</code> / <code>cmx-page-lock-changed</code>。</li>
        <li><strong>持久化</strong>：<code>save</code>、<code>apply</code>、<code>cancel</code>、<code>canClose</code>、<code>refresh</code>、<code>importData(payload)</code>、<code>exportData()</code>、<code>print</code>。</li>
        <li><strong>对话框</strong>：<code>onDialogOpen(args)</code>、<code>onDialogClose(reason)</code>（返回 false 阻止关闭）、<code>getDialogTitle</code>、<code>getDialogButtons</code>（[{ id, label, design, action }]）、<code>getDialogSize</code>。</li>
        <li><strong>工作流</strong>：<code>submit(opts)</code>、<code>recall(opts)</code>、<code>returnBack(opts)</code>、<code>addApprover(opts)</code>、<code>addCC(opts)</code>、<code>getWorkflowProgress()</code>、<code>previewWorkflow(opts)</code>。默认实现派发可取消的 <code>cmx-page-workflow-*</code> 事件，由宿主把结果写入 <code>detail.result</code>；宿主未响应时返回 <code>{ ok: false, error: "not wired" }</code> 或 <code>null</code>。</li>
        <li><strong>数据注入</strong>：<code>setData(patch)</code>、<code>setContext(ctx)</code>。</li>
        <li>调试支持：每个启用的接口实现都有独立 <code>cmx://page-iface/{slug}/{name}</code> sourceURL；调试模式开启时入口自动 <code>debugger;</code>。</li>
        <li>未启用且有默认实现的接口由生成器注入默认体；未启用且无默认实现（如 <code>onMount</code>、<code>undo</code>）调用返回 <code>undefined</code>。</li>
      </ul>
    </div>
  </div>
`;
