import { loadCodeMirrorJsBundle } from '../../lib/codemirror-loader.js';
import { insertDebuggerAtCursor } from './page-data-codemirror.js';

/**
 * 与源码面板一致的工具栏：应用、复制、粘贴、缩进、格式化 + 插入 debugger。
 * @param {{ shadowRoot: ShadowRoot, _emitPageDataChanged: () => void }} pd designer-page-data
 * @param {{
 *   idPrefix: string,
 *   debuggerBtnId: string,
 *   getView: () => import('@codemirror/view').EditorView | undefined | null,
 *   persist: () => void,
 * }} opts
 */
export function bindPageDataJsCmToolbar(pd, opts) {
  const sr = pd.shadowRoot;
  const { idPrefix, debuggerBtnId, getView, persist } = opts;

  const bySuffix = (s) => sr.getElementById(`${idPrefix}${s}`);

  const withView = (fn) => {
    const view = getView();
    if (!view) return;
    fn(view);
  };

  bySuffix('Apply')?.addEventListener('click', () => {
    persist();
    pd._emitPageDataChanged();
  });

  bySuffix('Copy')?.addEventListener('click', async () => {
    withView((view) => void navigator.clipboard.writeText(view.state.doc.toString()));
  });

  bySuffix('Paste')?.addEventListener('click', async () => {
    let text = '';
    try {
      text = await navigator.clipboard.readText();
    } catch {
      return;
    }
    if (!text) return;
    withView((view) => {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
      });
      view.focus();
    });
  });

  bySuffix('Indent')?.addEventListener('click', () => {
    void loadCodeMirrorJsBundle().then((cm) => {
      withView((view) => {
        cm.indentMore(view);
        view.focus();
      });
    });
  });

  bySuffix('Outdent')?.addEventListener('click', () => {
    void loadCodeMirrorJsBundle().then((cm) => {
      withView((view) => {
        cm.indentLess(view);
        view.focus();
      });
    });
  });

  bySuffix('Format')?.addEventListener('click', () => {
    void loadCodeMirrorJsBundle().then((cm) => {
      withView((view) => {
        const ch = cm.indentRange(view.state, 0, view.state.doc.length);
        view.dispatch({ changes: ch });
        view.focus();
      });
    });
  });

  sr.getElementById(debuggerBtnId)?.addEventListener('click', () => {
    withView((view) => insertDebuggerAtCursor(view));
  });
}
