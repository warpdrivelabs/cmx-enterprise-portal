/**
 * designer-canvas 樣式。
 * 從 designer-canvas.js 抽出，與 TOOLBAR_BASE 共享基礎樣式組合。
 */
import { TOOLBAR_BASE } from '../styles/shared-styles.js';

/** canvas 各层的 z-index（仅 STYLE 引用，随样式一起管理）。 */
const CANVAS_Z_INDEX = {
  slotBar: 9998,
  selOverlay: 9999,
  resizeHandle: 10000,
  moveHandle: 10001,
};

export const CANVAS_STYLE = `${TOOLBAR_BASE}
  :host { display: flex; flex-direction: column; height: 100%; min-height: 0; }

  .zoom-label {
    font-size: 11px; min-width: 36px; text-align: center;
    color: var(--sapContent_LabelColor, #8fa7c0);
    font-family: Consolas, monospace; flex-shrink: 0;
    cursor: default; user-select: none;
  }

  /* ── 设计区 ── */
  .design-area {
    border: none;
    margin: 0; border-radius: 0;
    background: var(--sapBackgroundColor, #1d2d3e);
    color: var(--sapTextColor, #e2e8f0);
    padding: 0; overflow: auto;
    flex: 1; min-height: 0;
    position: relative;
  }
  /* 缩放容器 */
  .design-scaler {
    transform-origin: top left;
    width: 100%; height: 100%; min-height: 100%;
    box-sizing: border-box;
    position: relative;
  }
  .design-area.dragover { outline: 2px solid var(--sapHighlightColor, #0070f2); outline-offset: -2px; }

  :host([data-mutation-locked]) .design-area {
    pointer-events: none;
    user-select: none;
  }

  .design-area [data-design-node] {
    outline: 1px dashed transparent;
    transition: outline-color 0.15s;
  }
  /* 设计态标记不能参与布局。html-pages 页面通常已经有完整的 flex/grid
     尺寸体系；给所有 data-design-node 添加 margin/padding/min-height 会层层
     放大容器尺寸，导致画布展示与 Portal 运行态明显不一致。 */
  .design-area :where(cmx-split-pane[data-design-node][data-designer-auto-min-height]) {
    height: 640px !important;
    min-height: 320px;
    min-width: 0;
  }
  .design-area :where([data-designer-page-root]) {
    min-height: 640px;
  }
  .design-area :where([data-designer-preview-visible][data-designer-preview-display="block"]) { display: block !important; }
  .design-area :where([data-designer-preview-visible][data-designer-preview-display="flex"]) { display: flex !important; }
  .design-area :where([data-designer-preview-visible][data-designer-preview-display="inline-flex"]) { display: inline-flex !important; }
  .design-area :where([data-designer-preview-visible][data-designer-preview-display="grid"]) { display: grid !important; }
  .design-area :where([data-designer-preview-visible][data-designer-preview-display="inline-grid"]) { display: inline-grid !important; }
  .design-area :where([data-designer-preview-visible][data-designer-preview-display="inline-block"]) { display: inline-block !important; }
  .design-area :where([data-designer-preview-visible][data-designer-preview-display="table"]) { display: table !important; }
  .design-area [data-design-node]:hover  { outline-color: #94a3b899; }
  .design-area [data-design-node].drop-target { outline: 2px dashed var(--sapPositiveElementColor, #22c55e); outline-offset: 1px; }

  /* ── 选择框 ── */
  .sel-overlay {
    position: absolute; pointer-events: none;
    box-sizing: border-box; border: 2px solid var(--sapInformationElementColor, #0ea5e9);
    z-index: ${CANVAS_Z_INDEX.selOverlay}; display: none;
  }
  .sel-overlay.visible { display: block; }

  /* 小拖拽手柄（左上角），不遮挡元素内部的点击 */
  .sel-move-handle {
    position: absolute; top: -1px; left: -1px;
    width: 18px; height: 18px;
    background: var(--sapInformationElementColor, #0ea5e9); border-radius: 0 0 4px 0;
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; color: #fff; line-height: 1;
    cursor: grab; pointer-events: auto; z-index: ${CANVAS_Z_INDEX.moveHandle};
    user-select: none;
  }
  .sel-move-handle:active { cursor: grabbing; }

  .sel-handle {
    position: absolute; width: 8px; height: 8px;
    background: var(--sapList_Background, #ffffff); border: 2px solid var(--sapInformationElementColor, #0ea5e9);
    border-radius: 2px; box-sizing: border-box;
    pointer-events: auto; z-index: ${CANVAS_Z_INDEX.resizeHandle};
  }

  /* ── slot 指示层（覆盖整个容器，列方向：命名 slot 在上，默认内容在下） ── */
  .slot-bar {
    position: absolute;
    display: none;
    flex-direction: column;
    z-index: ${CANVAS_Z_INDEX.slotBar};
    pointer-events: auto;
    box-sizing: border-box;
    border: 2px dashed #22c55e88;
  }
  .slot-bar.visible { display: flex; }
  .slot-zone {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-family: Consolas, monospace;
    color: var(--sapPositiveTextColor, #22c55e);
    background: #22c55e0a;
    cursor: copy;
    transition: background 0.12s;
    pointer-events: auto;
    min-height: 28px;
  }
  .slot-zone.slot-named {
    flex: 0 0 32px;
    background: #0ea5e90d;
    border-bottom: 1px dashed #0ea5e966;
    color: var(--sapLinkColor, #38bdf8);
  }
  .slot-zone + .slot-zone { border-top: none; }
  .slot-zone.active       { background: #22c55e1e; }
  .slot-zone.slot-named.active { background: #0ea5e91e; }

  .slot-bar.slot-bar--row { flex-direction: row; }
  .slot-bar.slot-bar--row .slot-zone.slot-named {
    flex: 1;
    height: auto;
    border-bottom: none;
    border-right: 1px dashed #0ea5e966;
  }
  .slot-bar.slot-bar--row .slot-zone.slot-named:last-child { border-right: none; }
  .slot-bar.slot-bar--row .slot-zone + .slot-zone { border-top: revert; }
`
