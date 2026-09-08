/**
 * CodeMirror 6（JSON）按需动态加载，供弹性组合「源码」视图使用。
 *
 * 动态 import：不进首包；加载失败（缺包/网络）由调用方捕获并降级回原生 textarea。
 * 仅依赖 CMXPortalManager 自身声明的 codemirror / @codemirror/* 依赖。
 */

/** @type {Promise<Record<string, unknown>> | null} */
let _jsonPromise = null

export function loadCodeMirrorJsonBundle () {
  if (!_jsonPromise) {
    _jsonPromise = Promise.all([
      import('codemirror'),
      import('@codemirror/state'),
      import('@codemirror/view'),
      import('@codemirror/commands'),
      import('@codemirror/lang-json'),
      import('@codemirror/theme-one-dark'),
    ]).then(([cm, state, view, cmd, jsonMod, theme]) => ({
      EditorView: cm.EditorView,
      basicSetup: cm.basicSetup,
      EditorState: state.EditorState,
      Compartment: state.Compartment,
      keymap: view.keymap,
      json: () => jsonMod.json(),
      indentWithTab: cmd.indentWithTab,
      oneDark: theme.oneDark,
    })).catch((err) => {
      // 失败后重置，允许下次重试；调用方据 reject 降级
      _jsonPromise = null
      throw err
    })
  }
  return _jsonPromise
}

/** 是否暗色 UI5 主题（决定是否套 oneDark）。与 designer 的判定保持一致。 */
export function isDarkUi5Theme () {
  const theme = String(
    document.documentElement.getAttribute('data-sap-ui-theme') ||
    document.documentElement.getAttribute('theme') ||
    '',
  ).toLowerCase()
  if (theme) return /(_dark|_hcb|dark|black)$/.test(theme) || theme.includes('_hcb')
  return false
}

/** 亮色主题下贴合 UI5 变量的 CodeMirror 主题扩展（暗色直接用 oneDark）。 */
export function cmxJsonTheme (EditorView) {
  const common = {
    '&': { height: '100%' },
    '.cm-content': { padding: '6px 0', fontFamily: 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace', fontSize: '12px' },
    '.cm-scroller': { overflow: 'auto' },
    '&.cm-focused': { outline: '1px solid var(--sapField_Active_BorderColor, var(--sapHighlightColor, #0070f2))' },
  }
  if (isDarkUi5Theme()) return EditorView.theme(common, { dark: true })
  return EditorView.theme({
    ...common,
    '&': { ...common['&'], color: 'var(--sapTextColor,#32363a)', backgroundColor: 'var(--sapField_Background,#fff)' },
    '.cm-content': { ...common['.cm-content'], caretColor: 'var(--sapField_TextColor,var(--sapTextColor,#32363a))' },
    '.cm-gutters': { backgroundColor: 'var(--sapGroup_TitleBackground,#f7f7f7)', color: 'var(--sapContent_LabelColor,#6a6d70)', borderRight: '1px solid var(--sapField_BorderColor,#d9d9d9)' },
    '.cm-activeLine': { backgroundColor: 'var(--sapList_SelectionBackgroundColor,rgba(0,112,242,.08))' },
    '.cm-activeLineGutter': { backgroundColor: 'var(--sapList_SelectionBackgroundColor,rgba(0,112,242,.08))' },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'var(--sapSelectedColor,rgba(0,112,242,.22))' },
  }, { dark: false })
}

/**
 * 创建一个 CodeMirror 6 JSON 编辑器实例（封装加载 + 装配 + 主题 + 暗色 + 基础扩展的样板）。
 *
 * 供 flc/def 的 Source/Schema 视图、json-code-viewer、workspace-node-dialog 复用，
 * 消除各自重复的 loadCodeMirrorJsonBundle → 解构 → exts 组装 → new EditorView 样板。
 *
 * @param {{ parent: HTMLElement, root?: ShadowRoot|Document, doc: string, editable?: boolean, onChange?: (doc: string, update: object) => void, extraExtensions?: object[] }} opts
 * @returns {Promise<object>} 解析为 CodeMirror EditorView 实例；加载失败时 reject（调用方据 catch 降级 textarea）
 */
export async function createJsonEditor ({ parent, root, doc, editable = true, onChange, extraExtensions = [] }) {
  const cm = await loadCodeMirrorJsonBundle()
  const { EditorView, EditorState, basicSetup, keymap, indentWithTab, json, oneDark } = cm
  const exts = [basicSetup, json(), keymap.of([indentWithTab]), cmxJsonTheme(EditorView)]
  if (onChange) {
    exts.push(EditorView.updateListener.of((u) => {
      if (u.docChanged) onChange(u.state.doc.toString(), u)
    }))
  }
  if (!editable) exts.push(EditorView.editable.of(false))
  if (isDarkUi5Theme()) exts.push(oneDark)
  exts.push(...extraExtensions)
  return new EditorView({
    parent,
    root: root || document,
    state: EditorState.create({ doc, extensions: exts }),
  })
}
