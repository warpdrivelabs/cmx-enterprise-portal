/**
 * CodeMirror 6 按需动态加载，供源码 / 事件 / 函数等编辑器共用，避免打进首包。
 */

/** @type {Promise<Record<string, unknown>> | null} */
let _htmlPromise = null;

/** HTML + 内嵌脚本补全（designer-source-panel） */
export function loadCodeMirrorHtmlBundle() {
  if (!_htmlPromise) {
    _htmlPromise = Promise.all([
      import('codemirror'),
      import('@codemirror/state'),
      import('@codemirror/lang-html'),
      import('@codemirror/lang-javascript'),
      import('@codemirror/commands'),
      import('@codemirror/theme-one-dark'),
    ]).then(([cm, state, htmlMod, jsMod, cmd, theme]) => ({
      EditorView: cm.EditorView,
      basicSetup: cm.basicSetup,
      EditorState: state.EditorState,
      Compartment: state.Compartment,
      html: () => htmlMod.html(),
      javascriptLanguage: jsMod.javascriptLanguage,
      indentMore: cmd.indentMore,
      indentLess: cmd.indentLess,
      oneDark: theme.oneDark,
    }));
  }
  return _htmlPromise;
}

/** @type {Promise<Record<string, unknown>> | null} */
let _jsPromise = null;

/** 纯 JS（designer-inspector 事件、designer-page-data 函数/服务） */
export function loadCodeMirrorJsBundle() {
  if (!_jsPromise) {
    _jsPromise = Promise.all([
      import('codemirror'),
      import('@codemirror/state'),
      import('@codemirror/lang-javascript'),
      import('@codemirror/commands'),
      import('@codemirror/language'),
      import('@codemirror/theme-one-dark'),
    ]).then(([cm, state, jsMod, cmd, lang, theme]) => ({
      EditorView: cm.EditorView,
      basicSetup: cm.basicSetup,
      EditorState: state.EditorState,
      javascript: () => jsMod.javascript(),
      indentMore: cmd.indentMore,
      indentLess: cmd.indentLess,
      indentRange: lang.indentRange,
      oneDark: theme.oneDark,
    }));
  }
  return _jsPromise;
}

/** @type {Promise<Record<string, unknown>> | null} */
let _jsonPromise = null;

/** 纯 JSON（模型/配置源码编辑） */
export function loadCodeMirrorJsonBundle() {
  if (!_jsonPromise) {
    _jsonPromise = Promise.all([
      import('codemirror'),
      import('@codemirror/state'),
      import('@codemirror/lang-json'),
      import('@codemirror/commands'),
      import('@codemirror/theme-one-dark'),
    ]).then(([cm, state, jsonMod, cmd, theme]) => ({
      EditorView: cm.EditorView,
      basicSetup: cm.basicSetup,
      EditorState: state.EditorState,
      json: () => jsonMod.json(),
      indentMore: cmd.indentMore,
      indentLess: cmd.indentLess,
      oneDark: theme.oneDark,
    })).catch((err) => {
      _jsonPromise = null;
      throw err;
    });
  }
  return _jsonPromise;
}
