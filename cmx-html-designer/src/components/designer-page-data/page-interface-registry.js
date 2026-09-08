/**
 * CMX 页面「对外接口」契约表（registry）。
 *
 * 这里的每一项对应一个挂在运行态组件实例 `host` 上的方法（如 `host.save()`、
 * `host.isDirty()`、`host.onDialogClose(reason)`）。设计器在「对外接口」面板按本表
 * 渲染一份固定列表，作者可勾选启用并填写函数体；导出/调试/页内运行时由
 * {@link ../../utils/build-cmx-page-script-block.js} 注入到 `connectedCallback`。
 *
 * 调用约定（与 page-fns 一致）：
 * - 隐式注入参数：`$data`、`host`（顺序固定在前）
 * - 显式签名参数：见每条 `params`
 * - 调试体系完全继承：每个实现独立 `//# sourceURL=cmx://page-iface/{slug}/{name}`，
 *   开启「调试模式」后入口自动 `debugger;`，DevTools Sources 树即时可见。
 *
 * `defaultBody === null` 表示无默认实现：未启用时宿主调用此接口直接得 `undefined`。
 * 否则即使作者未启用，生成器也会注入默认实现（`if (!host.{name}) host.{name} = …`）。
 */

/** @typedef {{ width?: string|number, height?: string|number, resizable?: boolean }} CmxDialogSize */

/**
 * @typedef {object} CmxPageInterfaceDef
 * @property {string} name           — host 上的方法名（合法 JS 标识符）
 * @property {string} group          — 分组 key（与 GROUPS 对齐）
 * @property {string} label          — 面板中显示的中文短标题
 * @property {string} params         — 除 `$data,host` 外的形参列表（用于 new Function 与提示）
 * @property {string} description    — 一行描述
 * @property {string} contract       — 多行契约说明（HTML 可被嵌入提示区）
 * @property {string|null} defaultBody — 未启用时的默认实现体；null 表示无默认
 * @property {boolean} [defaultEnabled] — 为 true 时面板 checkbox 初始选中、getOrCreateModelEntry 预填 enabled:true
 * @property {boolean} [isAsync]     — 仅作提示
 */

export const INTERFACE_GROUPS = [
  { key: 'status',    label: '状态查询',  hint: '同步方法，返回快照 / 布尔；宿主用于判断、统计、收集' },
  { key: 'lifecycle', label: '生命周期',  hint: '宿主在挂载、激活、卸载等关键时机主动调用' },
  { key: 'edit',      label: '编辑动作',  hint: '撤销/重做/重置/编辑/锁定等本地操作' },
  { key: 'persist',   label: '持久化',    hint: '与后端 / 文件系统 / 对话框结果交互' },
  { key: 'workflow',  label: '工作流',    hint: '审批流相关：提交 / 取回 / 回退 / 加签 / 抄送 / 进度 / 预览' },
  { key: 'dialog',    label: '对话框',    hint: '仅当宿主是对话框时调用；用于控制按钮、标题、关闭决策' },
  { key: 'inject',    label: '数据注入',  hint: '宿主推入参数、上下文、外部状态' },
];

/** @type {CmxPageInterfaceDef[]} */
export const PAGE_INTERFACE_REGISTRY = [
  // ── A. 状态查询 ────────────────────────────────────────────────────────────
  {
    name: 'isDirty',
    group: 'status',
    label: '是否已修改',
    params: '',
    description: '宿主切换 / 关闭前用于判断是否需要保存确认',
    contract: '返回布尔值；默认读取 `host.__cmxDirty`（由 `host.markDirty()` / `host.markClean()` 维护，$data 写入不会自动置脏，作者需精确控制）。',
    defaultBody: 'return host.__cmxDirty === true;',
  },
  {
    name: 'getState',
    group: 'status',
    label: '获取页面状态',
    params: '',
    description: '宿主取快照用于持久化、跨页传参',
    contract: '返回可结构化克隆的纯对象；默认浅拷贝 `$data`。',
    defaultBody: 'return Object.assign({}, $data);',
  },
  {
    name: 'validate',
    group: 'status',
    label: '校验',
    params: '',
    description: '提交前校验；可被 save() 内部调用',
    contract: '返回 `{ valid: boolean, errors?: [{ field?: string, message: string }] }`；默认 `{ valid: true }`。',
    defaultBody: 'return { valid: true };',
  },
  {
    name: 'getResult',
    group: 'status',
    label: '获取返回值（对话框）',
    params: '',
    description: '对话框关闭时返回给调用方',
    contract: '返回任意值；默认与 `getState()` 等价。',
    defaultBody: 'return host.getState ? host.getState() : Object.assign({}, $data);',
  },
  {
    name: 'isEditable',
    group: 'status',
    label: '是否可编辑',
    params: '',
    description: '判断当前是否处于编辑态（与 setEditable 配对）',
    contract: '默认读取 `host.__cmxEditable`（未设置时视为 true）。',
    defaultBody: 'return host.__cmxEditable !== false;',
  },
  {
    name: 'isLocked',
    group: 'status',
    label: '是否锁定',
    params: '',
    description: '判断页面是否已锁定（与 setLocked 配对）',
    contract: '默认读取 `host.__cmxLocked`（未设置时视为 false）。',
    defaultBody: 'return host.__cmxLocked === true;',
  },
  {
    name: 'canUndo',
    group: 'status',
    label: '是否可撤销',
    params: '',
    description: '工具栏按钮 / 快捷键启用与否的依据',
    contract: '默认读取 `host.__cmxHistory?.canUndo === true`；作者若维护自己的历史栈，请覆盖。',
    defaultBody: 'return !!(host.__cmxHistory && host.__cmxHistory.canUndo);',
  },
  {
    name: 'canRedo',
    group: 'status',
    label: '是否可重做',
    params: '',
    description: '工具栏按钮 / 快捷键启用与否的依据',
    contract: '默认读取 `host.__cmxHistory?.canRedo === true`。',
    defaultBody: 'return !!(host.__cmxHistory && host.__cmxHistory.canRedo);',
  },

  // ── B. 生命周期 ────────────────────────────────────────────────────────────
  {
    name: 'onMount',
    group: 'lifecycle',
    label: '挂载完成',
    params: 'ctx',
    description: '$data 注入完成、所有 fns/svcs 注册后调用',
    contract: '`ctx` 为宿主传入的上下文（user / locale / region / parent / pageId 等）。早于用户首次交互；默认不做任何事。',
    defaultBody: null,
  },
  {
    name: 'initPage',
    group: 'lifecycle',
    label: '初始化页面',
    params: 'ctx',
    description: 'onMount 之后由宿主调用一次，用于加载初始数据、设置默认状态',
    contract: '在 `onMount` 之后执行；适合异步数据拉取与初始状态设置。与 `onActivate` 区分：后者每次页面变为可见都会触发，此方法每次挂载仅调用一次。**默认启用**，提供初始化代码模板。',
    defaultBody: '// 在此处初始化页面：加载数据、设置默认状态等\n// 示例：\n// const result = await host.fetchData();\n// $data.title = ctx && ctx.title || "";\n// if (host.markClean) host.markClean();\n',
    defaultEnabled: true,
    isAsync: true,
  },
  {
    name: 'onActivate',
    group: 'lifecycle',
    label: '激活（可见）',
    params: '',
    description: '标签页 / 对话框变为可见时调用',
    contract: '可用来恢复轮询、刷新数据；默认不做任何事。',
    defaultBody: null,
  },
  {
    name: 'onDeactivate',
    group: 'lifecycle',
    label: '失活（隐藏但未销毁）',
    params: '',
    description: '标签页被切走时调用；DOM 仍存在',
    contract: '建议在此暂停轮询、暂停动画；默认不做任何事。',
    defaultBody: null,
  },
  {
    name: 'onDispose',
    group: 'lifecycle',
    label: '销毁',
    params: '',
    description: '组件 disconnectedCallback 触发；清理副作用',
    contract: '与现有 `host.__cmxDispose` 同时支持，先调 `onDispose` 再调 `__cmxDispose`；默认不做任何事。',
    defaultBody: null,
  },

  // ── C. 编辑动作 ────────────────────────────────────────────────────────────
  {
    name: 'undo',
    group: 'edit',
    label: '撤销',
    params: '',
    description: '撤销上一次本地编辑',
    contract: '作者负责维护历史栈（建议挂 `host.__cmxHistory`）；默认无操作。',
    defaultBody: null,
  },
  {
    name: 'redo',
    group: 'edit',
    label: '重做',
    params: '',
    description: '重做被撤销的编辑',
    contract: '与 undo 配对；默认无操作。',
    defaultBody: null,
  },
  {
    name: 'reset',
    group: 'edit',
    label: '重置',
    params: '',
    description: '把 $data 回滚到挂载时的初始快照',
    contract: '默认用 `host.__cmxInitialData`（生成器在 mount 前抓取）逐键恢复，并调 `markClean()`。',
    defaultBody: 'if (host.__cmxInitialData) { Object.keys(host.__cmxInitialData).forEach(function (k) { $data[k] = host.__cmxInitialData[k]; }); } if (host.markClean) host.markClean();',
  },
  {
    name: 'setEditable',
    group: 'edit',
    label: '进入/退出编辑模式',
    params: 'on',
    description: '切换可编辑 / 只读状态',
    contract: '`on` 布尔。默认仅记录 `host.__cmxEditable` 并派发 `cmx-page-editable-changed`；作者可覆盖以禁用具体控件。',
    defaultBody: 'host.__cmxEditable = (on !== false); host.dispatchEvent(new CustomEvent("cmx-page-editable-changed", { bubbles: true, composed: true, detail: { editable: host.__cmxEditable } }));',
  },
  {
    name: 'setLocked',
    group: 'edit',
    label: '锁定/解锁',
    params: 'on',
    description: '锁定后宿主应禁用编辑入口',
    contract: '默认仅记录 `host.__cmxLocked` 并派发 `cmx-page-lock-changed`；作者可覆盖以加锁具体控件。',
    defaultBody: 'host.__cmxLocked = (on === true); host.dispatchEvent(new CustomEvent("cmx-page-lock-changed", { bubbles: true, composed: true, detail: { locked: host.__cmxLocked } }));',
  },

  // ── D. 持久化 ──────────────────────────────────────────────────────────────
  {
    name: 'save',
    group: 'persist',
    label: '保存',
    params: '',
    description: '提交到后端 / 写回宿主；可被对话框「确定」按钮调用',
    contract: '建议返回 `Promise<{ ok: boolean, data?: any, error?: string }>`；默认先调 `validate()`，通过则返回 `{ ok: true, data: getState() }`。',
    defaultBody: 'var v = host.validate ? host.validate() : { valid: true }; if (v && v.valid === false) return { ok: false, error: "validation failed", errors: v.errors || [] }; var state = host.getState ? host.getState() : Object.assign({}, $data); if (host.markClean) host.markClean(); return { ok: true, data: state };',
    isAsync: true,
  },
  {
    name: 'apply',
    group: 'persist',
    label: '应用',
    params: '',
    description: '对话框中「应用但不关闭」',
    contract: '语义与 save 相同，但宿主不会关闭对话框；默认直接调 `save()`。',
    defaultBody: 'return host.save ? host.save() : { ok: true };',
    isAsync: true,
  },
  {
    name: 'cancel',
    group: 'persist',
    label: '取消',
    params: '',
    description: '请求关闭并放弃修改',
    contract: '返回 `Promise<boolean>`：true 表示可以关闭。默认 `!isDirty()`（脏时拒绝，由宿主弹确认）。',
    defaultBody: 'var dirty = host.isDirty ? host.isDirty() : false; return !dirty;',
    isAsync: true,
  },
  {
    name: 'canClose',
    group: 'persist',
    label: '关闭前拦截',
    params: '',
    description: '宿主在关闭前最后的可否拒绝点',
    contract: '返回 `boolean | Promise<boolean>`。默认 `!isDirty()`。',
    defaultBody: 'var dirty = host.isDirty ? host.isDirty() : false; return !dirty;',
    isAsync: true,
  },
  {
    name: 'refresh',
    group: 'persist',
    label: '刷新',
    params: '',
    description: '重新拉取后端数据',
    contract: '建议遍历 `responseTo` 服务并 await。默认遍历 `host` 上的 `_*_fetch`（自动生成的服务）并并行调用。',
    defaultBody: 'var keys = Object.keys(host).filter(function (k) { return /^_.+_fetch$/.test(k) && typeof host[k] === "function"; }); return Promise.all(keys.map(function (k) { try { return host[k](); } catch (e) { return Promise.resolve(); } }));',
    isAsync: true,
  },
  {
    name: 'importData',
    group: 'persist',
    label: '导入',
    params: 'payload',
    description: '宿主把外部数据应用到本页',
    contract: '`payload` 可为对象 / 字符串 / 文件内容。默认把 payload 视为 $data 的 patch 合并并 `markDirty()`。',
    defaultBody: 'if (!payload || typeof payload !== "object") return; Object.keys(payload).forEach(function (k) { $data[k] = payload[k]; }); if (host.markDirty) host.markDirty();',
  },
  {
    name: 'exportData',
    group: 'persist',
    label: '导出',
    params: '',
    description: '返回可序列化为文件 / 剪贴板的数据',
    contract: '返回任意值；宿主负责转 JSON / 写文件。默认等同 `getState()`。',
    defaultBody: 'return host.getState ? host.getState() : Object.assign({}, $data);',
  },
  {
    name: 'print',
    group: 'persist',
    label: '打印',
    params: '',
    description: '把当前页面打印到纸/PDF',
    contract: '默认把 shadowRoot 的 HTML 投到隐藏 iframe 并触发 print，结束后移除。',
    defaultBody: 'try { var sr = host.shadowRoot; if (!sr) return; var ifr = document.createElement("iframe"); ifr.setAttribute("aria-hidden", "true"); ifr.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden"; document.body.appendChild(ifr); var d = ifr.contentDocument; if (!d) { document.body.removeChild(ifr); return; } d.open(); d.write("<!doctype html><html><body>" + sr.innerHTML + "</body></html>"); d.close(); var w = ifr.contentWindow; w.focus(); w.print(); setTimeout(function () { document.body.removeChild(ifr); }, 1000); } catch (e) { try { console.warn("[print]", e); } catch (_) {} }',
  },

  // ── E. 工作流 ──────────────────────────────────────────────────────────────
  {
    name: 'submit',
    group: 'workflow',
    label: '提交',
    params: 'opts',
    description: '把当前单据提交到下一处理节点 / 发起流程',
    contract: '建议返回 `Promise<{ ok: boolean, taskId?: string, error?: string }>`；`opts` 可含 `comment`、`nextUser` 等。默认先调 `validate()`，通过后派发 `cmx-page-workflow-submit` 请求由宿主完成；若宿主未响应返回 `{ ok: false, error: "not wired" }`。',
    defaultBody: 'var v = host.validate ? host.validate() : { valid: true }; if (v && v.valid === false) return { ok: false, error: "validation failed", errors: v.errors || [] }; var ev = new CustomEvent("cmx-page-workflow-submit", { bubbles: true, composed: true, cancelable: true, detail: { opts: opts || null, result: null } }); host.dispatchEvent(ev); return ev.detail.result || { ok: false, error: "not wired" };',
    isAsync: true,
  },
  {
    name: 'recall',
    group: 'workflow',
    label: '取回',
    params: 'opts',
    description: '发起人取回已提交但未被处理的任务',
    contract: '返回 `Promise<{ ok: boolean, error?: string }>`；`opts.taskId` 可指定要取回的任务。默认派发 `cmx-page-workflow-recall` 由宿主完成；未响应返回 `{ ok: false, error: "not wired" }`。',
    defaultBody: 'var ev = new CustomEvent("cmx-page-workflow-recall", { bubbles: true, composed: true, cancelable: true, detail: { opts: opts || null, result: null } }); host.dispatchEvent(ev); return ev.detail.result || { ok: false, error: "not wired" };',
    isAsync: true,
  },
  {
    name: 'returnBack',
    group: 'workflow',
    label: '回退',
    params: 'opts',
    description: '把任务退回到上一节点或指定节点',
    contract: '`opts` 含 `toNode`（可选）、`comment`；返回 `Promise<{ ok: boolean, error?: string }>`。默认派发 `cmx-page-workflow-return` 由宿主完成；未响应返回 `{ ok: false, error: "not wired" }`。',
    defaultBody: 'var ev = new CustomEvent("cmx-page-workflow-return", { bubbles: true, composed: true, cancelable: true, detail: { opts: opts || null, result: null } }); host.dispatchEvent(ev); return ev.detail.result || { ok: false, error: "not wired" };',
    isAsync: true,
  },
  {
    name: 'addApprover',
    group: 'workflow',
    label: '加签',
    params: 'opts',
    description: '在当前节点增加审批人（前加签 / 后加签 / 并签）',
    contract: '`opts` 含 `users: string[]`、`mode: "before"|"after"|"parallel"`、`comment?`；返回 `Promise<{ ok: boolean, error?: string }>`。默认派发 `cmx-page-workflow-add-approver` 由宿主完成。',
    defaultBody: 'var ev = new CustomEvent("cmx-page-workflow-add-approver", { bubbles: true, composed: true, cancelable: true, detail: { opts: opts || null, result: null } }); host.dispatchEvent(ev); return ev.detail.result || { ok: false, error: "not wired" };',
    isAsync: true,
  },
  {
    name: 'addCC',
    group: 'workflow',
    label: '抄送',
    params: 'opts',
    description: '向指定用户 / 组抄送当前单据',
    contract: '`opts` 含 `users: string[]`、`comment?`；返回 `Promise<{ ok: boolean, error?: string }>`。默认派发 `cmx-page-workflow-cc` 由宿主完成。',
    defaultBody: 'var ev = new CustomEvent("cmx-page-workflow-cc", { bubbles: true, composed: true, cancelable: true, detail: { opts: opts || null, result: null } }); host.dispatchEvent(ev); return ev.detail.result || { ok: false, error: "not wired" };',
    isAsync: true,
  },
  {
    name: 'getWorkflowProgress',
    group: 'workflow',
    label: '查看任务进度',
    params: '',
    description: '获取当前单据的流程进度（历史 / 当前节点 / 后续节点）',
    contract: '返回 `Promise<{ nodes: [{ id, name, assignee?, status, time? }], edges?: [...] }>`；宿主据此渲染时间轴 / 流程图。默认派发 `cmx-page-workflow-progress` 由宿主填充 `detail.result`；未响应返回 `null`。',
    defaultBody: 'var ev = new CustomEvent("cmx-page-workflow-progress", { bubbles: true, composed: true, cancelable: true, detail: { result: null } }); host.dispatchEvent(ev); return ev.detail.result || null;',
    isAsync: true,
  },
  {
    name: 'previewWorkflow',
    group: 'workflow',
    label: '预览任务',
    params: 'opts',
    description: '预览当前单据将要走的流程路径（含未发生节点）',
    contract: '返回 `Promise<{ nodes: [...], edges?: [...] }>`；`opts.asOfData` 可让后端按拟改数据预演。默认派发 `cmx-page-workflow-preview`，宿主未响应时回退到 `getWorkflowProgress()`。',
    defaultBody: 'var ev = new CustomEvent("cmx-page-workflow-preview", { bubbles: true, composed: true, cancelable: true, detail: { opts: opts || null, result: null } }); host.dispatchEvent(ev); if (ev.detail.result) return ev.detail.result; return host.getWorkflowProgress ? host.getWorkflowProgress() : null;',
    isAsync: true,
  },

  // ── F. 对话框 ──────────────────────────────────────────────────────────────
  {
    name: 'onDialogOpen',
    group: 'dialog',
    label: '对话框打开',
    params: 'args',
    description: '宿主以对话框形式打开页面时传入参数',
    contract: '早于 onMount；常用于把传入参数应用到 $data。默认不做任何事。',
    defaultBody: null,
  },
  {
    name: 'onDialogClose',
    group: 'dialog',
    label: '对话框关闭决策',
    params: 'reason',
    description: '宿主关闭对话框前的最后一道闸',
    contract: '`reason` 为 "ok" / "cancel" / "close"；返回 `false | Promise<false>` 可阻止关闭。默认 ok 时校验通过即放行，否则按 canClose() 决定。',
    defaultBody: 'if (reason === "ok") { var v = host.validate ? host.validate() : { valid: true }; return v && v.valid !== false; } return host.canClose ? host.canClose() : true;',
    isAsync: true,
  },
  {
    name: 'getDialogTitle',
    group: 'dialog',
    label: '对话框标题',
    params: '',
    description: '宿主渲染对话框头部标题',
    contract: '返回字符串。默认读取 document.title（如果当前文档有），否则空串。',
    defaultBody: 'try { return (typeof document !== "undefined" && document.title) || ""; } catch (_) { return ""; }',
  },
  {
    name: 'getDialogButtons',
    group: 'dialog',
    label: '对话框按钮',
    params: '',
    description: '宿主渲染对话框底部按钮',
    contract: '返回 `[{ id, label, design, action }]`，其中 `action` ∈ "save" / "apply" / "cancel" / "close"。默认 [确定→save, 取消→cancel]。',
    defaultBody: 'return [\n  { id: "ok",     label: "确定", design: "Emphasized", action: "save" },\n  { id: "cancel", label: "取消", design: "Default",    action: "cancel" }\n];',
  },
  {
    name: 'getDialogSize',
    group: 'dialog',
    label: '对话框尺寸',
    params: '',
    description: '宿主决定初始宽高 / 是否可拖拽',
    contract: '返回 `{ width, height, resizable }`；默认 `{ width: "auto", height: "auto", resizable: true }`。',
    defaultBody: 'return { width: "auto", height: "auto", resizable: true };',
  },

  // ── G. 数据注入 ────────────────────────────────────────────────────────────
  {
    name: 'setData',
    group: 'inject',
    label: '注入数据',
    params: 'patch',
    description: '宿主把数据合并到 $data',
    contract: '`patch` 为对象。默认按键写入 $data（触发 Proxy 重绑）。',
    defaultBody: 'if (patch && typeof patch === "object") { Object.keys(patch).forEach(function (k) { $data[k] = patch[k]; }); }',
  },
  {
    name: 'setContext',
    group: 'inject',
    label: '注入上下文',
    params: 'ctx',
    description: '宿主注入运行上下文（user / locale / region / parent / pageId…）',
    contract: '默认记录到 `host.__cmxContext`；作者可覆盖以做副作用（订阅、初始化等）。',
    defaultBody: 'host.__cmxContext = ctx || null;',
  },
];

/** name → def 索引 */
export const INTERFACE_BY_NAME = Object.fromEntries(
  PAGE_INTERFACE_REGISTRY.map((d) => [d.name, d]),
);

/** 合法 JS 标识符校验（与生成器一致） */
export const VALID_INTERFACE_ID = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

/**
 * 规范化作者保存的接口列表为 `[{ name, enabled, body }]`，丢弃未识别项。
 * @param {unknown} raw
 * @returns {{ name: string, enabled: boolean, body: string }[]}
 */
export function normalizePageInterfaces (raw) {
  const arr = Array.isArray(raw) ? raw : [];
  const seen = new Set();
  const out = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const name = String(/** @type {{ name?: unknown }} */ (item).name ?? '').trim();
    if (!INTERFACE_BY_NAME[name] || seen.has(name)) continue;
    seen.add(name);
    out.push({
      name,
      enabled: /** @type {{ enabled?: unknown }} */ (item).enabled !== false,
      body: typeof /** @type {{ body?: unknown }} */ (item).body === 'string'
        ? /** @type {{ body: string }} */ (item).body
        : '',
    });
  }
  return out;
}
