import { FIELD_ROW } from '../../styles/shared-styles.js';
import {
  CODEMIRROR_RESIZE_STYLES,
  CM_RESIZE_HOST_CLASS,
} from '../../utils/codemirror-resize.js';
import { BIND_POPOVER_LAYOUT } from './bind-popover-layout.js';

/** <designer-inspector> Shadow 样式 */
export const DESIGNER_INSPECTOR_SHELL_STYLE = `${FIELD_ROW}
  :host {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    --field-label-width: 82px;
  }

  /* ── 节点信息条 ── */
  .node-badge {
    margin: 0;
    padding: 6px 10px;
    border-radius: 0;
    background: var(--sapInfobar_Background, #0b2540);
    border: none;
    border-bottom: 1px solid var(--sapHighlightColor, #0070f2);
    font-size: 12px;
    font-family: Consolas, monospace;
    color: var(--sapContent_LabelColor, #8fa7c0);
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .node-badge .tag-name {
    color: var(--sapBrandColor, #0070f2);
    font-weight: 700;
  }
  .node-badge .node-id {
    color: var(--sapContent_NonInteractiveIconColor, #6c8093);
    font-size: 11px;
    margin-left: auto;
  }
  .node-badge.empty {
    border-bottom-color: var(--sapNeutralBorderColor, #334155);
    background: transparent;
    color: var(--sapContent_NonInteractiveIconColor, #6c8093);
  }
  .node-badge.model {
    border-bottom-color: var(--sapBrandColor, #0070f2);
  }

  /* ── Tab 容器 ── */
  .tab-area {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  /* ── 自定义 Tab 栏 ── */
  .tab-bar {
    display: flex;
    padding: 4px 8px 0;
    gap: 2px;
    background: var(--sapGroup_TitleBackground, #0b1220);
    border-bottom: 1px solid var(--sapGroup_TitleBorderColor, #334155);
    flex-shrink: 0;
  }
  .tab-bar ui5-button {
    --_ui5_button_base_height: 30px;
    font-size: 12px;
    border-radius: 4px 4px 0 0;
    border-bottom: 2px solid transparent;
    min-width: 52px;
  }
  .tab-bar ui5-button.active {
    border-bottom-color: var(--sapHighlightColor, #0070f2);
  }

  /* ── Tab 面板 ── */
  .tab-panel {
    display: none;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 6px 8px;
    flex-direction: column;
    gap: 6px;
    scrollbar-width: thin;
  }
  .tab-panel.active { display: flex; }
  .tab-panel.active > * { flex-shrink: 0; }

  /* 调试：日志区占满面板剩余高度 */
  .debug-log-toolbar {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
    flex-shrink: 0;
    width: 100%;
    box-sizing: border-box;
  }
  .debug-log-toolbar-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .debug-console-mirror-row {
    display: flex;
    align-items: center;
    flex-wrap: nowrap;
    gap: 10px 12px;
    min-width: 0;
  }
  .debug-mirror-item {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex: 0 0 auto;
  }
  .debug-mirror-label {
    font-size: 11px;
    font-family: Consolas, monospace;
    font-weight: 600;
    white-space: nowrap;
  }
  .debug-mirror-label--log {
    color: var(--sapContent_LabelColor, #8fa7c0);
  }
  .debug-mirror-label--warn {
    color: #fbbf24;
  }
  .debug-mirror-label--error {
    color: var(--sapNegativeTextColor, #f87171);
  }
  .debug-mirror-switch {
    flex-shrink: 0;
  }
  #debugPanel.tab-panel.active > .debug-log {
    flex: 1 1 0%;
    min-height: 0;
    max-height: none;
    align-self: stretch;
    width: 100%;
    box-sizing: border-box;
  }

  /* ── 属性分组卡片 ── */
  .prop-card {
    border: none;
    border-radius: 0;
    overflow: hidden;
  }
  .prop-card-header {
    padding: 4px 0;
    background: transparent;
    border-bottom: none;
    display: flex;
    align-items: center;
  }
  .prop-card-body {
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .meta-source {
    margin-top: 2px;
    font-size: 10px;
    color: var(--sapContent_NonInteractiveIconColor, #6c8093);
    font-family: Consolas, monospace;
  }

  ui5-label {
    font-size: 11px;
    color: var(--sapContent_LabelColor, #8fa7c0);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  ui5-input, ui5-textarea, ui5-select { width: 100%; }
  .prop-card-body > ui5-button { width: 100%; margin-top: 2px; }

  /* ── 模型属性（右侧 Property） ── */
  .model-prop-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 0 6px;
    border-bottom: 1px solid var(--sapList_BorderColor, #334155);
    margin-bottom: 2px;
  }
  .model-prop-type {
    font-size: 12px;
    font-weight: 700;
  }
  .model-prop-id {
    margin-left: auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--sapContent_LabelColor, #8fa7c0);
    font-family: Consolas, monospace;
    font-size: 11px;
  }
  .model-prop-section {
    margin-top: 8px;
    padding-top: 5px;
    border-top: 1px solid var(--sapList_BorderColor, #334155);
    color: var(--sapTitleColor, #e2e8f0);
    font-size: 11px;
    font-weight: 700;
  }
  .model-prop-row {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .model-prop-check {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 24px;
    color: var(--sapContent_LabelColor, #8fa7c0);
    font-size: 11px;
  }
  .model-prop-check input {
    margin: 0;
    accent-color: var(--sapHighlightColor, #0070f2);
  }
  .model-prop-label {
    font-size: 11px;
    color: var(--sapContent_LabelColor, #8fa7c0);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .model-prop-input {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    padding: 4px 6px;
    border: 1px solid var(--sapField_BorderColor, #8fb4d9);
    border-radius: 3px;
    background: var(--sapField_Background, #1a2b40);
    color: var(--sapField_TextColor, #e2e8f0);
    font-size: 12px;
  }
  .model-prop-input:focus {
    outline: none;
    border-color: var(--sapHighlightColor, #0070f2);
  }
  .model-prop-textarea {
    resize: vertical;
    min-height: 84px;
    font-family: Consolas, monospace;
    line-height: 1.4;
  }
  .model-prop-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .model-prop-inline-row {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .model-prop-arrow {
    color: var(--sapContent_LabelColor, #8fa7c0);
    font-size: 11px;
  }
  .model-prop-add-btn,
  .model-prop-icon-btn {
    border: 1px dashed var(--sapButton_BorderColor, #8fa7c0);
    border-radius: 3px;
    background: transparent;
    color: var(--sapContent_LabelColor, #8fa7c0);
    cursor: pointer;
    font-size: 11px;
  }
  .model-prop-add-btn {
    width: 100%;
    padding: 4px 6px;
  }
  .model-prop-icon-btn {
    flex: 0 0 auto;
    padding: 2px 6px;
    color: var(--sapNegativeColor, #bb372a);
    border-style: solid;
  }
  .model-prop-empty,
  .model-prop-hint,
  .model-prop-error {
    color: var(--sapContent_NonInteractiveIconColor, #6c8093);
    font-size: 11px;
    line-height: 1.45;
  }
  .model-prop-hint.ok { color: var(--sapPositiveColor, #30914c); }
  .model-prop-hint.error,
  .model-prop-error { color: var(--sapNegativeColor, #bb372a); }
  .insp-section {
    border: 1px solid var(--sapGroup_TitleBorderColor, #334155);
    border-radius: 4px;
    padding: 8px;
    margin-bottom: 8px;
    background: var(--sapList_Background, rgba(15,23,42,.35));
  }
  .insp-section > .sub-h {
    margin: 0 0 6px;
    font-size: 12px;
    color: var(--sapTitleColor, #e2e8f0);
  }
  .insp-grid {
    display: grid;
    grid-template-columns: minmax(72px, .42fr) minmax(0, 1fr);
    gap: 6px 8px;
    align-items: center;
  }
  .insp-grid label {
    font-size: 11px;
    color: var(--sapContent_LabelColor, #8fa7c0);
  }
  .insp-grid input,
  .insp-grid select,
  .insp-grid textarea {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    padding: 4px 6px;
    border: 1px solid var(--sapField_BorderColor, #8fb4d9);
    border-radius: 3px;
    background: var(--sapField_Background, #1a2b40);
    color: var(--sapField_TextColor, #e2e8f0);
    font-size: 12px;
  }
  .insp-grid input[type="checkbox"] {
    width: auto;
    justify-self: start;
  }
  .insp-full {
    grid-column: 1 / -1;
  }
  .fx-cell,
  .vrow,
  .cmx-select-text {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 4px;
  }
  .cmx-select-text select { min-width: 0; width: 100%; }
  .cmx-select-text input { min-width: 0; width: 100%; }
  .cmx-field-tip { display: inline-flex; align-items: center; border: none; background: none; cursor: pointer; padding: 0 0 0 2px; color: var(--sapContent_NonInteractiveIconColor,#89919a); vertical-align: middle; }
  .cmx-field-tip ui5-icon { width: 12px; height: 12px; }
  .cmx-field-tip:hover { color: var(--sapHighlightColor,#0a6ed1); }
  .cmx-field-tips-body { white-space: pre-wrap; padding: 12px; font-size: 12px; line-height: 1.6; color: var(--sapTextColor,#1d2d3e); }
  .vlist {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .enum-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .enum-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 28px;
    gap: 4px;
    align-items: center;
  }
  .enum-row.enum-dup input {
    outline: 1px solid var(--sapNegativeElementColor, #d95050);
  }
  .icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--sapContent_IconColor, #8fa7c0);
    cursor: pointer;
  }
  .icon-btn:hover {
    background: var(--sapButton_Hover_Background, rgba(255,255,255,.08));
    color: var(--sapHighlightColor, #0070f2);
  }
  .icon-btn ui5-icon {
    width: 15px;
    height: 15px;
    pointer-events: none;
  }

  /* ── 颜色输入（原生 color picker 跟随 UI5 主题） ── */
  input[type=color] {
    width: 100%;
    height: 28px;
    padding: 2px 4px;
    background: var(--sapField_Background, #1a2b40);
    border: 1px solid var(--sapField_BorderColor, #3b5373);
    border-radius: 4px;
    cursor: pointer;
    box-sizing: border-box;
  }
  input[type=color]:focus {
    outline: none;
    border-color: var(--sapHighlightColor, #0070f2);
  }

  /* ── 样式分组折叠 ── */
  .style-details {
    border: none;
    border-radius: 0;
    overflow: hidden;
  }
  .style-details > summary {
    padding: 4px 0;
    background: transparent;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    list-style: none;
    color: var(--sapContent_LabelColor, #8fa7c0);
    border-bottom: none;
    display: flex;
    align-items: center;
    gap: 6px;
    user-select: none;
  }
  .style-details[open] > summary {
    border-bottom-color: transparent;
    color: var(--sapTextColor, #e2e8f0);
  }
  .style-details > summary::before {
    content: '▶';
    font-size: 9px;
    transition: transform 0.2s;
    opacity: 0.6;
  }
  .style-details[open] > summary::before { transform: rotate(90deg); }
  .style-detail-body {
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .style-detail-body > * { flex-shrink: 0; }

  /* ── 事件列表 ── */
  .event-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .event-chip {
    padding: 3px 10px;
    border-radius: 99px;
    font-size: 11px;
    font-family: Consolas, monospace;
    border: 1px solid var(--sapNeutralBorderColor, #334155);
    color: var(--sapContent_LabelColor, #8fa7c0);
    cursor: pointer;
    background: var(--sapButton_Lite_Background, transparent);
    transition: border-color 0.15s, color 0.15s, background 0.15s;
  }
  .event-chip:hover {
    border-color: var(--sapHighlightColor, #0070f2);
    color: var(--sapTextColor, #e2e8f0);
  }
  .event-chip.bound {
    border-color: var(--sapPositiveColor, #30914c);
    color: var(--sapPositiveColor, #30914c);
    background: rgba(48, 145, 76, 0.1);
  }

  /* ── 调试日志 ── */
  .debug-log {
    background: var(--sapCodeFaceBorderColor, #020617);
    border: none;
    border-radius: 0;
    padding: 6px 4px;
    font-family: Consolas, monospace;
    font-size: 11px;
    overflow-y: auto;
    white-space: pre-wrap;
    word-break: break-word;
    scrollbar-width: thin;
  }
  .debug-log-line {
    display: block;
    padding: 1px 2px;
    margin: 0;
    white-space: pre-wrap;
    font-family: Consolas, monospace;
    font-size: 11px;
  }
  .debug-log-line--log {
    color: var(--sapContent_LabelColor, #8fa7c0);
  }
  .debug-log-line--warn {
    color: #fbbf24;
  }
  .debug-log-line--error {
    color: var(--sapNegativeTextColor, #f87171);
  }

  /* ── Slot 快捷按钮组 ── */
  .slot-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 2px;
  }
  .slot-chip {
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    border: 1px solid var(--sapNeutralBorderColor, #334155);
    color: var(--sapBrandColor, #0070f2);
    cursor: pointer;
    background: transparent;
  }
  .slot-chip:hover {
    background: var(--sapList_Hover_Background, #1a2b40);
    border-color: var(--sapBrandColor, #0070f2);
  }

  /* ── 数据绑定按钮 ── */
  .bind-btn {
    flex-shrink: 0;
    background: transparent;
    border: 1px solid var(--sapNeutralBorderColor, #334155);
    border-radius: 3px;
    color: var(--sapContent_LabelColor, #8fa7c0);
    cursor: pointer;
    font-size: 13px;
    height: 26px;
    width: 26px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    transition: border-color 0.15s, color 0.15s, background 0.15s;
  }
  .bind-btn:hover {
    border-color: var(--sapHighlightColor, #0070f2);
    color: var(--sapHighlightColor, #0070f2);
  }
  .bind-btn.bound {
    border-color: var(--sapPositiveColor, #30914c);
    color: var(--sapPositiveColor, #30914c);
    background: rgba(48, 145, 76, 0.12);
  }

  /* ── 绑定变量弹出层 ── */
  .bind-popover {
    position: absolute;
    z-index: 9999;
    background: var(--sapBackgroundColor, #111827);
    border: 1px solid var(--sapHighlightColor, #0070f2);
    border-radius: 6px;
    padding: 4px 0;
    min-width: ${BIND_POPOVER_LAYOUT.minWidthPx}px;
    max-height: ${BIND_POPOVER_LAYOUT.maxHeightPx}px;
    overflow-y: auto;
    box-shadow: 0 4px 16px rgba(0,0,0,.55);
    scrollbar-width: thin;
  }
  .bind-popover-item {
    padding: 6px 14px;
    font-size: 12px;
    font-family: Consolas, monospace;
    color: var(--sapTextColor, #e2e8f0);
    cursor: pointer;
    white-space: nowrap;
  }
  .bind-popover-item:hover {
    background: var(--sapList_Hover_Background, #1a2b40);
    color: var(--sapBrandColor, #0070f2);
  }
  .bind-popover-empty {
    padding: 8px 14px;
    font-size: 11px;
    color: var(--sapContent_NonInteractiveIconColor, #6c8093);
    font-style: italic;
  }
  .bind-popover-clear {
    padding: 5px 14px;
    font-size: 11px;
    color: var(--sapNegativeColor, #bb372a);
    cursor: pointer;
    border-top: 1px solid var(--sapGroup_TitleBorderColor, #334155);
    margin-top: 2px;
  }
  .bind-popover-clear:hover { background: rgba(187,55,42,.1); }

  /* ── 事件脚本说明（编辑器上方） ── */
  .evt-script-hint {
    font-size: 11px;
    line-height: 1.5;
    color: var(--sapContent_LabelColor, #8fa7c0);
    background: var(--sapGroup_TitleBackground, #0b1220);
    border: 1px solid var(--sapGroup_TitleBorderColor, #334155);
    border-radius: 4px;
    padding: 8px 10px;
    margin: 0 0 6px 0;
    flex-shrink: 0;
  }
  .evt-script-hint__title {
    font-size: 11px;
    color: var(--sapTextColor, #e2e8f0);
    margin-bottom: 6px;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--sapGroup_TitleBorderColor, #334155);
  }
  .evt-script-hint__block {
    display: grid;
    grid-template-columns: 5.5rem 1fr;
    gap: 6px 10px;
    align-items: start;
    margin-top: 6px;
  }
  .evt-script-hint__title + .evt-script-hint__block {
    margin-top: 0;
  }
  .evt-script-hint__label {
    font-weight: 600;
    color: var(--sapContent_LabelColor, #94a3b8);
    white-space: nowrap;
  }
  .evt-script-hint__body {
    min-width: 0;
    word-break: break-word;
  }
  .evt-script-hint code {
    font-family: Consolas, 'Courier New', monospace;
    font-size: 10.5px;
    color: var(--sapBrandColor, #7eb8ff);
    padding: 0 2px;
    background: rgba(0, 112, 242, 0.12);
    border-radius: 2px;
  }

  /* ── 事件代码编辑器（CodeMirror） ── */
${CODEMIRROR_RESIZE_STYLES}
  .cm-toolbar {
    display: flex;
    justify-content: flex-end;
    margin: 2px 0 4px 0;
  }
  .evt-cm-field {
    min-height: 0;
  }
  .evt-cm-host.${CM_RESIZE_HOST_CLASS} {
    border: 1px solid var(--sapField_BorderColor, #3b5373);
    border-radius: 4px;
    height: 180px;
    min-height: 100px;
  }
  .evt-cm-host .cm-editor {
    background: var(--sapField_Background, var(--sapBaseColor, #fff));
  }
  .evt-cm-host .cm-scroller {
    overflow: auto !important;
    font-size: 12px;
    font-family: Consolas, 'Courier New', monospace;
  }
  .evt-cm-host .cm-tooltip-autocomplete {
    border: 1px solid var(--sapField_BorderColor, #3b5373);
    border-radius: 4px;
    background: var(--sapPopover_Background, var(--sapGroup_ContentBackground, #fff));
    color: var(--sapTextColor, #32363a);
    font-size: 12px;
  }
  .evt-cm-host .cm-tooltip-autocomplete ul li[aria-selected] {
    background: var(--sapHighlightColor, #0070f2);
    color: #fff;
  }
`;
