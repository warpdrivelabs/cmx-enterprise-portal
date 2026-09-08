import {
  attachCodeMirrorResize,
  detachCodeMirrorResize,
} from '../../utils/codemirror-resize.js';
import { cmxCodeMirrorExtensions } from '../../utils/codemirror-theme.js';
import { PAGE_DATA_STRINGS } from './page-data-static-strings.js';

/** @param {{ doc: { lineAt: (p: number) => { from: number, text: string } } }} state @param {number} pos */
function textBeforeCursorOnLine(state, pos) {
  const line = state.doc.lineAt(pos);
  return line.text.slice(0, pos - line.from);
}

/** mainapp. 之后的属性（与 debug-portal/mainapp.js 对齐） */
const MAINAPP_MEMBERS = [
  { label: 'workspaces', type: 'property', detail: 'Record<wsId, Workspace>', boost: 12 },
  { label: 'activityScopes', type: 'property', detail: 'Record<scopeId, ActivityScope>', boost: 11 },
  { label: 'activeWorkspaceId', type: 'property', detail: 'string | null', boost: 10 },
];

/** workspace. 之后（不含已单独处理的 workspace.context.） */
const WORKSPACE_MEMBERS = [
  { label: 'id', type: 'property', detail: 'string', boost: 12 },
  { label: 'label', type: 'property', detail: 'string', boost: 11 },
  { label: 'state', type: 'property', detail: 'WorkspaceState', boost: 11 },
  { label: 'context', type: 'property', detail: 'ContextHost', boost: 12 },
  { label: 'views', type: 'property', detail: 'Record<viewId, Readonly<api>>', boost: 11 },
  { label: 'regions', type: 'property', detail: 'Region → viewId[]', boost: 10 },
];

const WORKSPACE_CONTEXT_MEMBERS = [
  { label: 'get', type: 'method', detail: 'get(key)', boost: 12, apply: 'get(' },
  { label: 'set', type: 'method', detail: 'set(key, value)', boost: 11, apply: 'set(' },
  { label: 'delete', type: 'method', detail: 'delete(key)', boost: 11, apply: 'delete(' },
  { label: 'snapshot', type: 'method', detail: 'snapshot() → Record', boost: 10, apply: 'snapshot(' },
  { label: 'on', type: 'method', detail: "on('change', handler)", boost: 9, apply: "on('" },
  { label: 'off', type: 'method', detail: "off('change', handler)", boost: 9, apply: "off('" },
];

export function cleanupCodeMirrorEditors(pd) {
  pd._fnCmEditors.forEach((v) => {
    detachCodeMirrorResize(v);
    v.destroy();
  });
  pd._fnCmEditors = [];
  pd._svcCmEditors.forEach((v) => {
    detachCodeMirrorResize(v);
    v.destroy();
  });
  pd._svcCmEditors = [];
  if (Array.isArray(pd._ifaceCmEditors)) {
    pd._ifaceCmEditors.forEach((v) => {
      detachCodeMirrorResize(v);
      v.destroy();
    });
    pd._ifaceCmEditors = [];
  }
  pd._fnCmBoundIndex = -1;
  pd._svcCmBoundIndex = -1;
  pd._ifaceCmBoundName = '';
}

/** 在 CodeMirror 视图当前光标处插入 `debugger;`，并聚焦编辑器 */
export function insertDebuggerAtCursor(view) {
  if (!view) return;
  const head = view.state.selection.main.head;
  view.dispatch({
    changes: { from: head, to: head, insert: 'debugger;\n' },
    selection: { anchor: head + 'debugger;\n'.length },
  });
  requestAnimationFrame(() => view.focus());
}

export function createJsEditor(pd, cm, host, initCode, onChange, completionFn) {
  const { EditorView, basicSetup, EditorState, javascript, oneDark } = cm;
  const jsSupport = javascript();
  const view = new EditorView({
    parent: host,
    root: pd.shadowRoot,
    state: EditorState.create({
      doc: initCode || '',
      extensions: [
        basicSetup,
        jsSupport,
        jsSupport.language.data.of({ autocomplete: completionFn }),
        ...cmxCodeMirrorExtensions(EditorView, oneDark),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChange(update.state.doc.toString());
        }),
      ],
    }),
  });
  attachCodeMirrorResize(view);
  return view;
}

export function fnBodyCompletionSource(pd, context) {
  const dataMember = context.matchBefore(/\$data\.\w*/);
  if (dataMember) {
    return {
      from: dataMember.from + '$data.'.length,
      validFor: /^\w*$/,
      options: (pd._pageData || []).filter(d => d.name).map(d => ({
        label: d.name, type: 'variable', detail: d.type || 'string', boost: 10,
        info: PAGE_DATA_STRINGS.cmDetailPageVar(d.name),
      })),
    };
  }

  const before = textBeforeCursorOnLine(context.state, context.pos);

  let m = before.match(/(?:globalThis\.|this\.)?workspace\.context\.(\w*)$/);
  if (m) {
    const partial = m[1] || '';
    const from = context.pos - partial.length;
    return {
      from,
      validFor: /^\w*$/,
      options: WORKSPACE_CONTEXT_MEMBERS.filter((o) => o.label.startsWith(partial)),
    };
  }

  m = before.match(/(?:globalThis\.)?mainapp\.(\w*)$/);
  if (m) {
    const partial = m[1] || '';
    const from = context.pos - partial.length;
    return {
      from,
      validFor: /^\w*$/,
      options: MAINAPP_MEMBERS.filter((o) => o.label.startsWith(partial)),
    };
  }

  m = before.match(/(?:globalThis\.|this\.)?workspace\.(\w*)$/);
  if (m) {
    const partial = m[1] || '';
    const from = context.pos - partial.length;
    return {
      from,
      validFor: /^\w*$/,
      options: WORKSPACE_MEMBERS.filter((o) => o.label.startsWith(partial)),
    };
  }

  const word = context.matchBefore(/[\$\w]+/);
  if (!word || (word.from === word.to && !context.explicit)) return null;
  return {
    from: word.from, validFor: /^[\$\w]*$/,
    options: [
      { label: '$data', type: 'variable', detail: '页面数据对象', boost: 12,
        apply: (view, _, from, to) => view.dispatch({ changes: { from, to, insert: '$data.' } }) },
      { label: 'this', type: 'keyword', detail: '当前页面自定义元素实例', boost: 11 },
      { label: 'mainapp', type: 'variable', detail: 'globalThis.mainapp（调试/门户）', boost: 11,
        apply: (view, _, from, to) => view.dispatch({ changes: { from, to, insert: 'mainapp.' } }) },
      { label: 'workspace', type: 'variable', detail: 'globalThis.workspace 或 this.workspace', boost: 11,
        apply: (view, _, from, to) => view.dispatch({ changes: { from, to, insert: 'workspace.' } }) },
      { label: 'globalThis', type: 'keyword', detail: '全局对象', boost: 8,
        apply: (view, _, from, to) => view.dispatch({ changes: { from, to, insert: 'globalThis.' } }) },
      { label: 'event',          type: 'variable', detail: '事件对象',   boost: 10 },
      { label: 'console.log()',  type: 'method',   detail: '控制台输出', boost: 5 },
      { label: 'alert()',        type: 'function', detail: '弹出提示框', boost: 3 },
      { label: 'setTimeout()',   type: 'function', detail: '延时执行',   boost: 3 },
      { label: 'fetch()',        type: 'function', detail: '发起请求',   boost: 3 },
      ...(pd._pageFns || []).filter(f => f.name).map(f => ({
        label: f.name, type: 'function', detail: '页面函数', boost: 10, apply: `${f.name}(`,
      })),
      ...(pd._pageServices || []).filter(s => s.name).map(s => ({
        label: s.name, type: 'function', detail: '页面服务', boost: 9, apply: `${s.name}(`,
      })),
    ],
  };
}

export function svcTransformCompletionSource(pd, context) {
  const dataMember = context.matchBefore(/\$data\.\w*/);
  if (dataMember) {
    return {
      from: dataMember.from + '$data.'.length,
      validFor: /^\w*$/,
      options: (pd._pageData || []).filter(d => d.name).map(d => ({
        label: d.name, type: 'variable', detail: d.type || 'string', boost: 10,
      })),
    };
  }
  const word = context.matchBefore(/[\$\w]+/);
  if (!word || (word.from === word.to && !context.explicit)) return null;
  return {
    from: word.from, validFor: /^[\$\w]*$/,
    options: [
      { label: 'data',          type: 'variable', detail: '原始响应数据', boost: 12 },
      { label: 'return data',   type: 'keyword',  detail: '直接返回响应', boost: 11 },
      { label: '$data',         type: 'variable', detail: '页面数据对象', boost: 10,
        apply: (view, _, from, to) => view.dispatch({ changes: { from, to, insert: '$data.' } }) },
      { label: 'JSON.parse()',  type: 'function', detail: '解析 JSON',    boost: 6 },
      { label: 'console.log()', type: 'method',   detail: '调试输出',     boost: 4 },
    ],
  };
}
