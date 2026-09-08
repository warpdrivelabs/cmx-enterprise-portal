/**
 * CodeMirror 6 — 外层容器可拖拽调整宽高（需在 host 上使用 class {@link CM_RESIZE_HOST_CLASS}）
 */

export const CM_RESIZE_HOST_CLASS = 'cm-resize-host';

/** 注入到组件 styles()：与 `.cm-resize-host` / `.cm-editor` 配合 */
export const CODEMIRROR_RESIZE_STYLES = `
  .${CM_RESIZE_HOST_CLASS} {
    min-height: 100px;
    min-width: 140px;
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
    resize: both;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .${CM_RESIZE_HOST_CLASS} .cm-editor {
    flex: 1 1 auto;
    min-height: 0 !important;
    height: 100% !important;
    max-height: none !important;
  }
  .${CM_RESIZE_HOST_CLASS} .cm-scroller {
    min-height: 48px !important;
  }
`;

/**
 * host 尺寸变化时让 CodeMirror 重算布局。
 * @param {import('@codemirror/view').EditorView} view
 */
export function attachCodeMirrorResize(view) {
  const host = view.dom.parentElement;
  if (!host?.classList.contains(CM_RESIZE_HOST_CLASS)) return;

  const ro = new ResizeObserver(() => {
    try {
      view.requestMeasure();
    } catch {
      /* 已销毁 */
    }
  });
  ro.observe(host);

  const disconnect = () => {
    ro.disconnect();
    if (view._cmResizeDisconnect === disconnect) delete view._cmResizeDisconnect;
  };
  view._cmResizeDisconnect = disconnect;
}

/** @param {import('@codemirror/view').EditorView | null | undefined} view */
export function detachCodeMirrorResize(view) {
  view?._cmResizeDisconnect?.();
}
