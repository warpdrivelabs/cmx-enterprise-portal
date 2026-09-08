import { FIELD_ROW, TOOLBAR_BASE } from '../../styles/shared-styles.js';
import {
  CODEMIRROR_RESIZE_STYLES,
  CM_RESIZE_HOST_CLASS,
} from '../../utils/codemirror-resize.js';

/** <designer-page-data> Shadow 样式 */
export const DESIGNER_PAGE_DATA_SHELL_STYLE = `${FIELD_ROW}
${TOOLBAR_BASE}
  :host {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  /* ── 视图切换 ── */
  .pane {
    display: none;
    flex: 1;
    flex-direction: column;
    min-height: 0;
    overflow-y: auto;
    padding: 12px 16px;
    gap: 8px;
    scrollbar-width: thin;
  }
  .pane.active { display: flex; }
  .pane > * { flex-shrink: 0; }

  /* ── 函数 / 服务：主从分栏 ── */
  .page-split {
    display: flex;
    flex: 1;
    min-height: 0;
    gap: 0;
    border: 1px solid var(--sapGroup_TitleBorderColor, #334155);
    border-radius: 4px;
    overflow: hidden;
  }
  .page-split-sidebar {
    width: 220px;
    min-width: 140px;
    max-width: 40%;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    background: var(--sapGroup_TitleBackground, #0b1220);
    border-right: 1px solid var(--sapGroup_TitleBorderColor, #334155);
  }
  .sidebar-list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    padding: 4px;
    gap: 2px;
    scrollbar-width: thin;
  }
  .sidebar-item-row {
    display: flex;
    align-items: stretch;
    gap: 2px;
  }
  .sidebar-item {
    flex: 1;
    min-width: 0;
    text-align: left;
    padding: 8px 8px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--sapTextColor, #e2e8f0);
    cursor: pointer;
    font-size: 11px;
    font-family: Consolas, 'Courier New', monospace;
    line-height: 1.35;
  }
  .sidebar-item:hover {
    background: var(--sapList_Hover_Background, #1a2b40);
  }
  .sidebar-item.active {
    background: var(--sapList_SelectionBackgroundColor, #0f2d5e);
    outline: 1px solid var(--sapHighlightColor, #0070f2);
    outline-offset: -1px;
  }
  .sidebar-item-del {
    flex-shrink: 0;
    align-self: center;
  }
  .page-split-detail {
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    scrollbar-width: thin;
  }
  .empty-hint.subtle {
    font-size: 11px;
    color: var(--sapContent_NonInteractiveIconColor, #6c8093);
    padding: 8px 0;
  }
  .detail-footer-actions {
    margin-top: 4px;
    padding-top: 8px;
    border-top: 1px solid var(--sapGroup_TitleBorderColor, #334155);
  }

  /* ── 工具栏 ── */
  .panel-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 0 4px;
    flex-shrink: 0;
  }
  .panel-toolbar span {
    font-size: 12px;
    font-weight: 600;
    color: var(--sapContent_LabelColor, #8fa7c0);
  }
  /* 按钮组：紧挨右对齐（pick 在 add 左侧），不继承标题文字样式 */
  .panel-toolbar .panel-toolbar-actions {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-weight: 400;
  }
  .panel-toolbar ui5-button {
    font-size: 12px;
  }

  /* ── 函数 / 服务：脚本可用 API 说明（定义区分栏下方） ── */
  .page-data-api-hint {
    flex-shrink: 0;
    font-size: 11px;
    line-height: 1.45;
    color: var(--sapContent_LabelColor, #8fa7c0);
    background: var(--sapGroup_TitleBackground, #0b1220);
    border: 1px solid var(--sapGroup_TitleBorderColor, #334155);
    border-radius: 4px;
    padding: 8px 10px 10px;
    margin: 8px 0 0 0;
    max-height: min(38vh, 280px);
    overflow-y: auto;
    scrollbar-width: thin;
  }
  .page-data-api-hint__title {
    font-weight: 700;
    font-size: 11px;
    color: var(--sapTextColor, #e2e8f0);
    margin-bottom: 8px;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--sapGroup_TitleBorderColor, #334155);
  }
  .page-data-api-hint__section {
    margin-top: 8px;
  }
  .page-data-api-hint__title + .page-data-api-hint__section {
    margin-top: 0;
  }
  .page-data-api-hint__sec-title {
    font-weight: 600;
    color: var(--sapContent_LabelColor, #94a3b8);
    margin-bottom: 4px;
    font-size: 11px;
  }
  .page-data-api-hint__list {
    margin: 0;
    padding-left: 1.1rem;
    list-style: disc;
  }
  .page-data-api-hint__list li {
    margin: 3px 0;
    word-break: break-word;
  }
  .page-data-api-hint code {
    font-family: Consolas, 'Courier New', monospace;
    font-size: 10.5px;
    color: var(--sapBrandColor, #7eb8ff);
    padding: 0 3px;
    background: rgba(0, 112, 242, 0.12);
    border-radius: 2px;
    white-space: nowrap;
  }

  /* ── 数据变量表 ── */
  .data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  .data-table th {
    text-align: left;
    padding: 6px 6px;
    background: var(--sapGroup_TitleBackground, #0b1220);
    color: var(--sapContent_LabelColor, #8fa7c0);
    font-weight: 600;
    border-bottom: 1px solid var(--sapGroup_TitleBorderColor, #334155);
    white-space: nowrap;
  }
  .data-table td {
    padding: 4px 4px;
    vertical-align: middle;
    border-bottom: 1px solid var(--sapGroup_TitleBorderColor, #1e293b);
  }
  .data-table tr:last-child td { border-bottom: none; }
  .data-inp {
    width: 100%;
    background: var(--sapField_Background, #1a2b40);
    border: 1px solid var(--sapField_BorderColor, #3b5373);
    border-radius: 3px;
    color: var(--sapTextColor, #e2e8f0);
    font-size: 12px;
    padding: 3px 6px;
    box-sizing: border-box;
    font-family: Consolas, monospace;
  }
  .data-inp:focus { outline: none; border-color: var(--sapHighlightColor, #0070f2); }
  .del-row-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--sapNegativeColor, #bb372a);
    font-size: 16px;
    padding: 0;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
  }
  .del-row-btn:hover { color: var(--sapNegativeTextColor, #ef4444); }

  /* ── 函数 / 服务卡片列表 ── */
  .card-list { display: flex; flex-direction: column; gap: 6px; }
  .fn-card {
    border: 1px solid var(--sapNeutralBorderColor, #334155);
    border-radius: 6px;
    overflow: hidden;
  }
  .fn-card-header {
    display: flex;
    align-items: center;
    padding: 6px 10px;
    background: var(--sapGroup_TitleBackground, #0b1220);
    gap: 6px;
  }
  .fn-title {
    font-family: Consolas, monospace;
    font-size: 12px;
    color: var(--sapBrandColor, #0070f2);
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .fn-card-body {
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  ui5-label {
    font-size: 12px;
    color: var(--sapContent_LabelColor, #8fa7c0);
    white-space: nowrap;
  }
  .fn-body-editor {
    width: 100%;
    min-height: 80px;
    background: var(--sapField_Background, #fff);
    border: 1px solid var(--sapField_BorderColor, #d9d9d9);
    border-radius: 4px;
    color: var(--sapTextColor, #32363a);
    font-size: 12px;
    font-family: Consolas, 'Courier New', monospace;
    padding: 6px 8px;
    box-sizing: border-box;
    resize: vertical;
  }
  .fn-body-editor:focus { outline: none; border-color: var(--sapHighlightColor, #0070f2); }

  /* ── 服务类型标签 ── */
  .type-badge {
    font-size: 10px;
    padding: 1px 7px;
    border-radius: 3px;
    font-family: Consolas, monospace;
    font-weight: 700;
    letter-spacing: 0.04em;
    flex-shrink: 0;
  }
  .type-badge.rest      { background: #0ea5e920; color: var(--sapInformationElementColor, #38bdf8); border: 1px solid #0ea5e940; }
  .type-badge.jsonrpc   { background: #a78bfa20; color: #c4b5fd; border: 1px solid #a78bfa40; }
  .type-badge.websocket { background: #34d39920; color: #6ee7b7; border: 1px solid #34d39940; }
  .type-badge.graphql   { background: #f472b620; color: #f0abfc; border: 1px solid #f472b640; }

  /* ── 变量复选框组 ── */
  .var-check-group {
    display: flex;
    flex-wrap: wrap;
    gap: 5px 10px;
    padding: 4px 0;
  }
  .var-check-group label {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: var(--sapTextColor, #e2e8f0);
    cursor: pointer;
    font-family: Consolas, monospace;
  }
  .var-check-group .no-vars {
    font-size: 11px;
    color: var(--sapContent_NonInteractiveIconColor, #6c8093);
    font-style: italic;
  }

  /* ── 数据流图面板 ── */
  #flowPane {
    padding: 0;
  }
  .flow-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px 6px;
    flex-shrink: 0;
    border-bottom: 1px solid var(--sapGroup_TitleBorderColor, #334155);
  }
  .flow-toolbar span {
    font-size: 12px;
    font-weight: 600;
    color: var(--sapContent_LabelColor, #8fa7c0);
  }
  #flowDiagram {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 12px;
  }
  #flowDiagram svg { display: block; }

  /* ── 空状态 ── */
  .empty-hint {
    text-align: center;
    color: var(--sapContent_NonInteractiveIconColor, #6c8093);
    font-size: 12px;
    padding: 32px 0;
  }

  /* ── 测试运行器 ── */
  #testPane { gap: 12px; }
  .test-section-title {
    font-size: 11px;
    font-weight: 600;
    color: var(--sapContent_LabelColor, #8fa7c0);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding-bottom: 4px;
    border-bottom: 1px solid var(--sapGroup_TitleBorderColor, #1e293b);
  }
  .test-result-box {
    background: var(--sapField_Background, #fff);
    border: 1px solid var(--sapField_BorderColor, #d9d9d9);
    border-radius: 4px;
    padding: 10px 12px;
    font-size: 12px;
    font-family: Consolas, 'Courier New', monospace;
    color: var(--sapTextColor, #32363a);
    min-height: 80px;
    white-space: pre-wrap;
    word-break: break-all;
    overflow-y: auto;
    max-height: 300px;
    flex-shrink: 0;
  }
  .test-result-box.error   { color: var(--sapNegativeColor, #ef4444); border-color: #ef444440; }
  .test-result-box.success { border-color: #22c55e40; }
  .test-status {
    font-size: 12px;
    font-family: Consolas, monospace;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .test-status-dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    background: var(--sapNeutralColor, #6c8093);
    flex-shrink: 0;
    transition: background 0.2s;
  }
  .test-status-dot.running { background: var(--sapCriticalElementColor, #f59e0b); }
  .test-status-dot.success { background: var(--sapPositiveElementColor, #22c55e); }
  .test-status-dot.error   { background: var(--sapNegativeElementColor, #ef4444); }
  .test-run-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  /* ── 依赖库面板 ── */
  .dep-card {
    border: 1px solid var(--sapNeutralBorderColor, #334155);
    border-radius: 6px;
    overflow: hidden;
  }
  .dep-card-header {
    display: flex;
    align-items: center;
    padding: 6px 10px;
    background: var(--sapGroup_TitleBackground, #0b1220);
    gap: 6px;
  }
  .dep-title {
    font-family: Consolas, monospace;
    font-size: 12px;
    color: var(--sapBrandColor, #0070f2);
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .load-type-badge {
    font-size: 10px;
    padding: 1px 7px;
    border-radius: 3px;
    font-family: Consolas, monospace;
    font-weight: 700;
    letter-spacing: 0.04em;
    flex-shrink: 0;
  }
  .load-type-badge.script { background: #f59e0b20; color: #fbbf24; border: 1px solid #f59e0b40; }
  .load-type-badge.module { background: #0ea5e920; color: var(--sapInformationElementColor, #38bdf8); border: 1px solid #0ea5e940; }
  .dep-card-body {
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .dep-hint {
    font-size: 11px;
    color: var(--sapContent_NonInteractiveIconColor, #6c8093);
    font-style: italic;
    padding: 2px 0;
  }

  /* 函数体 / 响应转换：标签与源码同款工具栏同一行，工具靠右 */
  .script-cm-head-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
    min-height: 30px;
  }
  .script-cm-head-row .script-cm-head-label {
    flex-shrink: 0;
  }
  .script-cm-head-row .page-data-js-cm-toolbar {
    flex: 1 1 auto;
    justify-content: flex-end;
    min-width: 0;
    flex-wrap: wrap;
    margin: 0;
    border-radius: 4px;
  }
  .script-cm-head-row .page-data-js-cm-toolbar ui5-button {
    --_ui5_button_base_height: 26px;
    --_ui5_button_base_min_width: 26px;
    --_ui5_button_base_padding: 0 4px;
  }

  /* ── JS 代码编辑器（CodeMirror） ── */
${CODEMIRROR_RESIZE_STYLES}
  .fn-cm-host.${CM_RESIZE_HOST_CLASS} {
    border: 1px solid var(--sapField_BorderColor, #3b5373);
    border-radius: 4px;
    height: 228px;
    min-height: 120px;
  }
  .fn-cm-host.${CM_RESIZE_HOST_CLASS}.svc-cm-transform {
    height: 140px;
    min-height: 72px;
  }
  .fn-cm-host .cm-editor {
    background: var(--sapField_Background, var(--sapBaseColor, #fff));
  }
  .fn-cm-host .cm-scroller {
    overflow: auto !important;
    font-size: 12px;
    font-family: Consolas, 'Courier New', monospace;
  }

  /* ── 对外接口面板 ── */
  .iface-toolbar-hint {
    font-weight: 400 !important;
    color: var(--sapContent_LabelColor, #8fa7c0);
    font-size: 11px !important;
  }
  .iface-group-header {
    font-size: 10.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--sapContent_LabelColor, #94a3b8);
    padding: 8px 6px 4px;
    border-top: 1px solid var(--sapGroup_TitleBorderColor, #1e293b);
    margin-top: 2px;
  }
  .iface-group-header:first-child { border-top: none; margin-top: 0; }
  .iface-group-header__hint {
    display: block;
    font-weight: 400;
    text-transform: none;
    letter-spacing: 0;
    font-size: 10px;
    color: var(--sapContent_NonInteractiveIconColor, #6c8093);
    margin-top: 2px;
  }
  .iface-item {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .iface-item .sidebar-item {
    flex: 1;
    min-width: 0;
  }
  .iface-badge {
    flex-shrink: 0;
    font-size: 9.5px;
    padding: 1px 5px;
    border-radius: 8px;
    border: 1px solid currentColor;
    line-height: 1.4;
    margin-right: 4px;
    white-space: nowrap;
  }
  .iface-badge.iface-badge--on {
    color: var(--sapPositiveColor, #30914c);
    background: rgba(48, 145, 76, 0.12);
  }
  .iface-badge.iface-badge--default {
    color: var(--sapContent_LabelColor, #8fa7c0);
    background: transparent;
  }
  .iface-badge.iface-badge--off {
    color: var(--sapContent_NonInteractiveIconColor, #6c8093);
    background: transparent;
  }
  .iface-head-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--sapGroup_TitleBorderColor, #334155);
  }
  .iface-head-title {
    display: flex;
    align-items: baseline;
    gap: 6px;
    min-width: 0;
  }
  .iface-head-name {
    font-family: Consolas, 'Courier New', monospace;
    font-size: 13px;
    font-weight: 700;
    color: var(--sapTextColor, #e2e8f0);
  }
  .iface-head-sig {
    font-family: Consolas, 'Courier New', monospace;
    font-size: 11px;
    color: var(--sapContent_LabelColor, #8fa7c0);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .iface-enable-switch {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: var(--sapContent_LabelColor, #8fa7c0);
    cursor: pointer;
    user-select: none;
  }
  .iface-enable-switch input[type="checkbox"] {
    margin: 0;
    cursor: pointer;
  }
  .iface-detail-desc {
    font-size: 12px;
    color: var(--sapTextColor, #e2e8f0);
    padding: 6px 0 0;
  }
  .iface-detail-contract {
    font-size: 11px;
    line-height: 1.5;
    color: var(--sapContent_LabelColor, #8fa7c0);
    padding: 4px 8px;
    background: var(--sapGroup_TitleBackground, #0b1220);
    border-left: 2px solid var(--sapHighlightColor, #0070f2);
    border-radius: 2px;
  }
  .iface-detail-contract code {
    font-family: Consolas, 'Courier New', monospace;
    font-size: 10.5px;
    color: var(--sapBrandColor, #7eb8ff);
    background: rgba(0, 112, 242, 0.12);
    padding: 0 3px;
    border-radius: 2px;
  }

      /* ── Models 面板 ── */
      /* 覆盖通用 .pane 的 overflow-y:auto，由内部两区各自管理滚动 */
      .models-pane { overflow-y: hidden !important; }
      .models-panel-hint { font-size: 0.72rem; color: var(--sapContent_LabelColor); margin-left: auto; }
      /* 上 1/3 区：固定占 1/3 高度，内部滚动 */
      .models-top-section { flex: 1; min-height: 0; overflow-y: auto; scrollbar-width: thin; }
      .models-drop-zone { min-height: 32px; border: 1px dashed var(--sapList_BorderColor); border-radius: 4px; margin: 0.2rem 0 0.1rem; padding: 0.2rem; transition: background 0.15s, border-color 0.15s; }
      .models-drop-zone.drag-over { background: var(--sapList_Hover_Background); border-color: var(--sapHighlightColor, #0070f2); }
      .models-drop-hint { text-align: center; font-size: 0.72rem; color: var(--sapContent_LabelColor); padding: 0.3rem 0; pointer-events: none; }
      .models-instance-list { display: flex; flex-direction: column; gap: 1px; }
      .model-instance-card { display: flex; align-items: center; gap: 0.3rem; padding: 0.1rem 0.4rem; border-radius: 3px; cursor: pointer; font-size: 0.78rem; border: 1px solid transparent; background: var(--sapList_AlternatingBackground); user-select: none; }
      .model-instance-card:hover { background: var(--sapList_Hover_Background); }
      .model-instance-card.selected { background: var(--sapList_SelectionBackgroundColor); border-color: var(--sapSelectedColor, #0070f2); }
      .model-icon { font-size: 1rem; flex-shrink: 0; }
      .model-type-label { font-size: 0.72rem; font-weight: 600; flex-shrink: 0; }
      .model-instance-id { flex: 1; color: var(--sapTextColor); font-family: monospace; font-size: 0.8rem; }
      .model-del-btn { background: none; border: none; cursor: pointer; color: var(--sapNegativeElementColor, #c00); font-size: 0.9rem; padding: 0 2px; opacity: 0.6; flex-shrink: 0; }
      .model-del-btn:hover { opacity: 1; }
      .models-divider { border-top: 2px solid var(--sapList_BorderColor); margin: 0; flex-shrink: 0; }
      /* 下 2/3 区：tabbed 属性 / 事件 */
      .models-bottom-section { flex: 2; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
      .models-props-tabs { display: flex; gap: 2px; padding: 4px 4px 0; border-bottom: 1px solid var(--sapGroup_TitleBorderColor, #334155); flex-shrink: 0; background: var(--sapGroup_TitleBackground, #0b1220); }
      .mp-tab-btn {
        --_ui5_button_base_height: 30px;
        font-size: 12px;
        border-radius: 4px 4px 0 0;
        border-bottom: 2px solid transparent;
        min-width: 52px;
      }
      .mp-tab-btn.active { border-bottom-color: var(--sapHighlightColor, #0070f2); }
      .mp-tab-pane { display: none; flex: 1; min-height: 0; overflow-y: auto; scrollbar-width: thin; padding: 0.2rem 0.2rem 0.3rem; flex-direction: column; }
      .mp-tab-pane.active { display: flex; }
      .models-props-area { padding: 0; min-height: 0; }
      .models-events-area { padding: 0; min-height: 0; display: flex; flex-direction: column; gap: 6px; }
      .models-props-empty { color: var(--sapContent_LabelColor); font-size: 0.78rem; padding: 0.5rem; text-align: center; }
      .props-header { padding: 0.1rem 0 0.25rem; }
      .props-type-badge { display: inline-block; padding: 0.15rem 0.5rem; border-radius: 3px; font-size: 0.75rem; font-weight: 600; }
      /* 类型徽章配色：色相按语义映射 sap 令牌（var() 内兜底原色，亮/暗自适应），底色 12% 透明混合。
         紫=neo 副色令牌 --neo-violet（门户根级注入，无则兜底原色）；meta 青为蓝绿两令牌各半混合。 */
      .props-type-badge[data-kind=dataset] { color: var(--sapInformativeElementColor, #0070f2); background: color-mix(in srgb, var(--sapInformativeElementColor, #0070f2) 12%, transparent); }
      .props-type-badge[data-kind=columnmodel] { color: var(--sapPositiveElementColor, #059669); background: color-mix(in srgb, var(--sapPositiveElementColor, #059669) 12%, transparent); }
      .props-type-badge[data-kind=meta] { color: color-mix(in srgb, var(--sapInformativeElementColor, #0070f2) 50%, var(--sapPositiveElementColor, #059669)); background: color-mix(in srgb, var(--sapInformativeElementColor, #0070f2) 12%, transparent); }
      .props-type-badge[data-kind=flc] { color: var(--neo-violet, var(--neo-violet, #7c3aed)); background: color-mix(in srgb, var(--neo-violet, var(--neo-violet, #7c3aed)) 12%, transparent); }
      .props-type-badge[data-kind=masterslave] { color: var(--sapCriticalElementColor, #b45309); background: color-mix(in srgb, var(--sapCriticalElementColor, #b45309) 12%, transparent); }
      .prop-row { display: flex; flex-direction: column; gap: 1px; margin-bottom: 0.15rem; }
      .prop-label { font-size: 0.72rem; color: var(--sapContent_LabelColor); font-weight: 500; }
      .prop-input, .prop-select { width: 100%; padding: 0.1rem 0.3rem; border: 1px solid var(--sapField_BorderColor, #8fb4d9); border-radius: 3px; background: var(--sapField_Background, #1a2b40); color: var(--sapField_TextColor, #e2e8f0); font-size: 0.78rem; box-sizing: border-box; }
      .prop-input:focus, .prop-select:focus { outline: none; border-color: var(--sapHighlightColor, #0070f2); }
      .prop-input-sm { flex: 1; min-width: 0; padding: 0.15rem 0.3rem; border: 1px solid var(--sapField_BorderColor, #8fb4d9); border-radius: 3px; background: var(--sapField_Background, #1a2b40); color: var(--sapField_TextColor, #e2e8f0); font-size: 0.75rem; box-sizing: border-box; }
      .prop-input-xs, .prop-select-xs { padding: 0.15rem 0.3rem; border: 1px solid var(--sapField_BorderColor, #8fb4d9); border-radius: 3px; background: var(--sapField_Background, #1a2b40); color: var(--sapField_TextColor, #e2e8f0); font-size: 0.75rem; box-sizing: border-box; }
      .prop-input-xs  { width: 80px; }
      .prop-select-xs { width: 70px; }
      .prop-section-title { font-size: 0.72rem; font-weight: 700; color: var(--sapTitleColor); margin: 0.25rem 0 0.1rem; padding-bottom: 1px; border-bottom: 1px solid var(--sapList_BorderColor); }
      .prop-hint { font-size: 0.68rem; color: var(--sapContent_LabelColor); margin-bottom: 0.1rem; }
      .prop-add-btn { font-size: 0.72rem; padding: 0.1rem 0.4rem; border: 1px dashed var(--sapButton_BorderColor, #8fa7c0); border-radius: 3px; background: transparent; color: var(--sapContent_LabelColor); cursor: pointer; width: 100%; margin-top: 0.1rem; }
      .prop-add-btn:hover { border-style: solid; color: var(--sapHighlightColor, #0070f2); border-color: var(--sapHighlightColor, #0070f2); }
      .prop-add-btn-xs { font-size: 0.68rem; padding: 1px 4px; border: 1px solid var(--sapButton_BorderColor, #8fa7c0); border-radius: 2px; background: transparent; color: var(--sapContent_LabelColor); cursor: pointer; }
      .children-list { display: flex; flex-direction: column; gap: 2px; }
      .child-row { display: flex; align-items: center; gap: 4px; flex-wrap: nowrap; }
      .child-del-btn { background: none; border: none; cursor: pointer; color: var(--sapNegativeElementColor, #c00); font-size: 0.85rem; padding: 0 2px; opacity: 0.6; }
      .child-del-btn:hover { opacity: 1; }
      .child-arrow { color: var(--sapContent_LabelColor); font-size: 0.8rem; }
      .schema-list, .agg-list { display: flex; flex-direction: column; gap: 1px; }
      .schema-row { display: flex; align-items: center; gap: 4px; }
      .schema-arr { color: var(--sapContent_LabelColor); font-family: monospace; }
      .agg-row { display: flex; align-items: flex-start; gap: 3px; padding: 0.15rem; background: var(--sapList_AlternatingBackground); border-radius: 3px; }
      .agg-fields { flex: 1; display: flex; flex-wrap: wrap; gap: 2px; }
      .agg-field-group { display: flex; flex-direction: column; gap: 1px; }
      .agg-field-group label { font-size: 0.68rem; color: var(--sapContent_LabelColor); }
      .cols-toolbar { display: flex; align-items: center; justify-content: space-between; margin: 0.2rem 0 0.1rem; }
      .cm-field-detail-host { margin-top: 0.25rem; }
      .cm-field-detail-panel { border: 1px solid var(--sapList_BorderColor, #334155); border-radius: 4px; background: var(--sapList_Background, #0f172a); padding: 0.35rem; }
      .cm-field-detail-panel .insp-section { border-top: 1px solid var(--sapList_BorderColor, #334155); padding-top: 0.35rem; margin-top: 0.35rem; }
      .cm-field-detail-panel .insp-section:first-child { border-top: 0; padding-top: 0; margin-top: 0; }
      .cm-field-detail-panel .sub-h { margin: 0 0 0.3rem; font-size: 0.72rem; color: var(--sapTitleColor); }
      .cm-field-detail-panel .insp-grid { display: grid; grid-template-columns: 5.5rem minmax(0, 1fr); gap: 0.3rem 0.45rem; align-items: center; font-size: 0.74rem; }
      .cm-field-detail-panel .insp-grid label { color: var(--sapContent_LabelColor); }
      .cm-field-detail-panel input,
      .cm-field-detail-panel select,
      .cm-field-detail-panel textarea { width: 100%; min-width: 0; height: 24px; padding: 0.1rem 0.3rem; border: 1px solid var(--sapField_BorderColor, #8fb4d9); border-radius: 3px; background: var(--sapField_Background, #1a2b40); color: var(--sapField_TextColor, #e2e8f0); font-size: 0.75rem; box-sizing: border-box; }
      .cm-field-detail-panel input[type="checkbox"] { width: 16px; height: 16px; padding: 0; justify-self: start; }
      .cm-field-detail-panel .insp-full { grid-column: 1 / -1; }
      .cm-field-detail-panel .enum-list { display: flex; flex-direction: column; gap: 0.2rem; }
      .cm-field-detail-panel .enum-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 28px; gap: 0.25rem; align-items: center; }
      .cm-field-detail-panel .enum-row.enum-dup input { outline: 1px solid var(--sapNegativeElementColor, #d95050); }
      .cols-table-wrap { overflow-x: auto; }
      .cols-table { width: 100%; border-collapse: collapse; font-size: 0.72rem; }
      .cols-table th { background: var(--sapList_HeaderBackground); color: var(--sapList_HeaderTextColor); padding: 3px 4px; border-bottom: 1px solid var(--sapList_BorderColor); text-align: left; font-weight: 600; white-space: nowrap; }
      .cols-table td { padding: 2px 2px; border-bottom: 1px solid var(--sapList_BorderColor); vertical-align: middle; }
      .cm-tree-list { display: flex; flex-direction: column; gap: 2px; margin: 0.2rem 0; }
      .cm-tree-row { display: flex; align-items: center; gap: 3px; font-size: 0.72rem; min-height: 24px; }
      .cm-tree-group { background: var(--sapList_HeaderBackground, #f5f5f5); border-radius: 3px; padding: 2px 2px 2px 0; border-left: 2px solid var(--sapBrandColor, #0070f2); }
      .cm-tree-col { border-bottom: 1px dashed var(--sapList_BorderColor, #e5e5e5); padding: 1px 2px 1px 0; }
      .cm-tree-icon { flex-shrink: 0; width: 14px; text-align: center; font-size: 0.7rem; color: var(--sapContent_LabelColor); }
      .prop-add-btn-xs { font-size: 0.68rem; padding: 0 4px; border: 1px dashed var(--sapButton_BorderColor, #8fa7c0); border-radius: 3px; background: transparent; color: var(--sapContent_LabelColor); cursor: pointer; white-space: nowrap; flex-shrink: 0; line-height: 1.5; }
      .cm-col-table-wrap { overflow-x: auto; border: 1px solid var(--sapList_BorderColor, #334155); border-radius: 3px; background: var(--sapList_Background, #0f172a); }
      .cm-col-table { width: 100%; min-width: 620px; border-collapse: collapse; font-size: 0.72rem; }
      .cm-col-table th { padding: 3px 4px; background: var(--sapList_HeaderBackground, #111827); color: var(--sapList_HeaderTextColor, #cbd5e1); border-bottom: 1px solid var(--sapList_BorderColor, #334155); text-align: left; font-weight: 600; white-space: nowrap; }
      .cm-col-table td { padding: 2px 3px; border-bottom: 1px solid var(--sapList_BorderColor, #334155); vertical-align: middle; }
      .cm-col-table tbody tr:last-child td { border-bottom: 0; }
      .cm-col-table-row { cursor: pointer; }
      .cm-col-table-row:hover { background: var(--sapList_Hover_Background, rgba(255,255,255,.06)); }
      .cm-col-table-row.selected { background: var(--sapList_SelectionBackgroundColor, rgba(0,112,242,.18)); }
      .cm-col-table .idx { color: var(--sapContent_LabelColor, #8fa7c0); text-align: right; font-family: Consolas, monospace; }
      .cm-col-table .prop-input-xs,
      .cm-col-table .prop-select-xs { width: 100%; min-width: 0; }
      .cm-col-actions { display: flex; align-items: center; gap: 2px; white-space: nowrap; }
      .cm-col-actions .prop-add-btn-xs[disabled] { opacity: .35; cursor: default; }
      .cm-field-toolbar-actions { display: flex; align-items: center; gap: 2px; flex: 0 0 auto; }
      .cm-model-tabs { display: flex; align-items: flex-end; gap: 2px; margin: 4px 0 6px; border-bottom: 1px solid var(--sapGroup_TitleBorderColor, #334155); }
      .cm-model-tab-btn { appearance: none; border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--sapContent_LabelColor, #8fa7c0); cursor: pointer; padding: 5px 10px 4px; font-size: 0.74rem; font-weight: 600; }
      .cm-model-tab-btn:hover { color: var(--sapTextColor, #e2e8f0); background: var(--sapButton_Hover_Background, rgba(255,255,255,.06)); }
      .cm-model-tab-btn.active { color: var(--sapHighlightColor, #0070f2); border-bottom-color: var(--sapHighlightColor, #0070f2); }
      .cm-model-tab-pane { display: none; min-height: 0; }
      .cm-model-tab-pane.active { display: block; }
      .cm-toolbar-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; padding: 0; border: 1px solid transparent; border-radius: 4px; background: transparent; color: var(--sapContent_IconColor, #8fa7c0); cursor: pointer; }
      .cm-toolbar-icon-btn:hover { border-color: var(--sapButton_BorderColor, #8fa7c0); background: var(--sapButton_Hover_Background, rgba(255,255,255,.08)); color: var(--sapHighlightColor, #0070f2); }
      .cm-toolbar-icon-btn ui5-icon { width: 15px; height: 15px; pointer-events: none; }
      .cm-json-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
      .cm-json-cm-host { width: 100%; min-height: 360px; border: 1px solid var(--sapField_BorderColor, #8fb4d9); border-radius: 4px; overflow: hidden; background: var(--sapField_Background, #1a2b40); }
      .cm-json-cm-host .cm-editor { height: 360px; font-size: 12px; }
      .cm-json-cm-host .cm-scroller { font-family: Consolas, Monaco, "Courier New", monospace; }
      .cm-json-editor { width: 100%; min-height: 360px; resize: vertical; box-sizing: border-box; border: 1px solid var(--sapField_BorderColor, #8fb4d9); border-radius: 4px; padding: 8px; background: var(--sapField_Background, #1a2b40); color: var(--sapField_TextColor, #e2e8f0); font: 12px/1.45 Consolas, Monaco, "Courier New", monospace; tab-size: 2; }
      .cm-json-status { min-height: 18px; margin-top: 5px; font-size: 0.72rem; color: var(--sapContent_LabelColor, #8fa7c0); }
      .cm-json-status[data-tone="ok"] { color: var(--sapPositiveTextColor, #107e3e); }
      .cm-json-status[data-tone="err"] { color: var(--sapNegativeTextColor, #bb0000); }
      .cm-fields-host { overflow: auto; border: 1px solid var(--sapList_BorderColor, #334155); border-radius: 4px; background: var(--sapList_Background, #0f172a); }
      .cmx-field-table { width: 100%; min-width: 640px; table-layout: fixed; border-collapse: collapse; font-size: 0.72rem; }
      .cmx-field-table th { padding: 3px 4px; background: var(--sapList_HeaderBackground, #111827); color: var(--sapList_HeaderTextColor, #cbd5e1); border-bottom: 1px solid var(--sapList_BorderColor, #334155); text-align: left; font-weight: 600; white-space: nowrap; }
      .cmx-field-table td { padding: 2px 3px; border-bottom: 1px solid var(--sapList_BorderColor, #334155); vertical-align: middle; overflow: hidden; }
      .cmx-field-table th:nth-child(1), .cmx-field-table td:nth-child(1) { width: 24px !important; min-width: 24px; max-width: 24px; padding-left: 2px; padding-right: 2px; text-align: center; }
      .cmx-field-table th:nth-child(2), .cmx-field-table td:nth-child(2) { width: 150px; }
      .cmx-field-table th:nth-child(3), .cmx-field-table td:nth-child(3) { width: 210px; }
      .cmx-field-table th:nth-child(4), .cmx-field-table td:nth-child(4) { width: 96px; }
      .cmx-field-table th:last-child, .cmx-field-table td:last-child { width: 132px; white-space: nowrap; text-align: right; }
      .cmx-field-table tbody tr:last-child td { border-bottom: 0; }
      .cmx-field-table input, .cmx-field-table select,
      .cm-groups-wrap input, .cm-groups-wrap select { width: 100%; min-width: 0; height: 24px; padding: 0.15rem 0.3rem; border: 1px solid var(--sapField_BorderColor, #8fb4d9); border-radius: 3px; background: var(--sapField_Background, #1a2b40); color: var(--sapField_TextColor, #e2e8f0); font-size: 0.72rem; box-sizing: border-box; }
      .cmx-field-table input[type="checkbox"], .cm-groups-wrap input[type="checkbox"] { width: auto; min-width: 0; }
      .cmx-field-table tr.cmx-field-row { display: table-row; cursor: pointer; min-height: 0; }
      .cmx-field-table tr.cmx-field-row:hover { background: var(--sapList_Hover_Background, rgba(255,255,255,.06)); }
      .cmx-field-table tr.cmx-field-row.sel { background: var(--sapList_SelectionBackgroundColor, rgba(0,112,242,.18)); }
      .cmx-field-table tr.cmx-field-row > th,
      .cmx-field-table tr.cmx-field-row > td { display: table-cell; }
      .cmx-field-table .idx { color: var(--sapContent_LabelColor, #8fa7c0); text-align: center; font-family: Consolas, monospace; }
      .icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; padding: 0; border: 0; border-radius: 4px; background: transparent; color: var(--sapContent_IconColor, #8fa7c0); cursor: pointer; vertical-align: middle; }
      .icon-btn:hover { background: var(--sapButton_Hover_Background, rgba(255,255,255,.08)); color: var(--sapHighlightColor, #0070f2); }
      .icon-btn.danger:hover { color: var(--sapNegativeColor, #bb0000); }
      .icon-btn[disabled] { opacity: .35; cursor: default; }
      .icon-btn ui5-icon { width: 15px; height: 15px; pointer-events: none; }
      .cm-groups-wrap { padding: 4px 0; }
      .grp { border: 1px dashed var(--sapField_BorderColor, #8fb4d9); border-radius: 4px; padding: 6px; margin: 5px 0; background: var(--sapList_Background, #0f172a); }
      .grp-head { display: flex; align-items: center; gap: 5px; margin-bottom: 5px; }
      .grp-head > select { flex: 0 0 86px; }
      .grp .agg-row { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; padding: 3px 4px; background: var(--sapList_AlternatingBackground, rgba(255,255,255,.04)); border-radius: 3px; font-size: 0.7rem; }
      .grp .agg-row label { display: inline-flex; align-items: center; gap: 2px; color: var(--sapContent_LabelColor); }
      .grp-members { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 5px; }
      .chip { display: inline-flex; align-items: center; gap: 3px; padding: 1px 6px; border: 1px solid var(--sapList_BorderColor, #334155); border-radius: 999px; font-size: 0.7rem; color: var(--sapTextColor, #e2e8f0); background: var(--sapList_AlternatingBackground, rgba(255,255,255,.04)); }
      .chip button { border: 0; background: transparent; color: var(--sapNegativeColor, #bb0000); cursor: pointer; padding: 0; line-height: 1; }
      .item-sub { font-size: 0.7rem; color: var(--sapContent_LabelColor); }

      /* ── 模型事件 Tab：chips / 提示 / CodeMirror ── */
      .model-evt-card { display: flex; flex-direction: column; gap: 6px; padding: 6px 6px 8px; }
      .model-evt-card-title { font-size: 11px; font-weight: 700; color: var(--sapContent_LabelColor, #8fa7c0); }
      .event-chips { display: flex; flex-wrap: wrap; gap: 4px; }
      .event-chip {
        padding: 3px 10px;
        border-radius: 99px;
        font-size: 11px;
        font-family: Consolas, monospace;
        border: 1px solid var(--sapNeutralBorderColor, #334155);
        color: var(--sapContent_LabelColor, #8fa7c0);
        cursor: pointer;
        background: transparent;
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
      .model-evt-empty {
        font-size: 11px;
        color: var(--sapContent_NonInteractiveIconColor, #6c8093);
        padding: 4px 2px;
      }
      .model-evt-custom-btn {
        align-self: flex-start;
        font-size: 11px;
        padding: 2px 8px;
        border: 1px dashed var(--sapButton_BorderColor, #8fa7c0);
        border-radius: 3px;
        background: transparent;
        color: var(--sapContent_LabelColor, #8fa7c0);
        cursor: pointer;
      }
      .model-evt-custom-btn:hover { color: var(--sapHighlightColor, #0070f2); border-color: var(--sapHighlightColor, #0070f2); }
      .model-evt-editor { display: flex; flex-direction: column; gap: 6px; padding: 6px; border-top: 1px solid var(--sapGroup_TitleBorderColor, #334155); }
      .model-evt-editor-title { font-size: 12px; font-weight: 700; color: var(--sapTextColor, #e2e8f0); }
      .model-evt-custom-row { display: flex; align-items: center; gap: 6px; }
      .model-evt-custom-row label { font-size: 11px; color: var(--sapContent_LabelColor, #8fa7c0); white-space: nowrap; }
      .model-evt-actions { display: flex; gap: 6px; }
      .model-evt-btn-bind, .model-evt-btn-remove, .model-evt-btn-debugger {
        font-size: 11px; padding: 3px 10px; border-radius: 3px; cursor: pointer; border: 1px solid transparent;
      }
      .model-evt-btn-bind { background: var(--sapButton_Emphasized_Background, #0070f2); color: #fff; border-color: var(--sapButton_Emphasized_BorderColor, #0070f2); }
      .model-evt-btn-bind:hover { background: var(--sapButton_Emphasized_Hover_Background, #0a4d97); }
      .model-evt-btn-remove { background: transparent; color: var(--sapNegativeColor, #bb372a); border-color: var(--sapNegativeColor, #bb372a); }
      .model-evt-btn-remove:hover { background: rgba(187,55,42,.08); }
      .model-evt-btn-debugger { background: transparent; color: var(--sapContent_LabelColor, #8fa7c0); border-color: var(--sapNeutralBorderColor, #334155); }
      .model-evt-btn-debugger:hover { color: var(--sapHighlightColor, #0070f2); border-color: var(--sapHighlightColor, #0070f2); }

      .evt-script-hint {
        font-size: 11px;
        line-height: 1.5;
        color: var(--sapContent_LabelColor, #8fa7c0);
        background: var(--sapGroup_TitleBackground, #0b1220);
        border: 1px solid var(--sapGroup_TitleBorderColor, #334155);
        border-radius: 4px;
        padding: 8px 10px;
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
      }
      .evt-script-hint__label {
        font-weight: 600;
        color: var(--sapContent_LabelColor, #94a3b8);
        white-space: nowrap;
      }
      .evt-script-hint__body { min-width: 0; word-break: break-word; }
      .evt-script-hint code {
        font-family: Consolas, 'Courier New', monospace;
        font-size: 10.5px;
        color: var(--sapBrandColor, #7eb8ff);
        padding: 0 2px;
        background: rgba(0, 112, 242, 0.12);
        border-radius: 2px;
      }

      .model-evt-cm-host.${CM_RESIZE_HOST_CLASS} {
        border: 1px solid var(--sapField_BorderColor, #3b5373);
        border-radius: 4px;
        height: 200px;
        min-height: 100px;
      }
      .model-evt-cm-host .cm-editor { background: var(--sapField_Background, var(--sapBaseColor, #fff)); }
      .model-evt-cm-host .cm-scroller {
        overflow: auto !important;
        font-size: 12px;
        font-family: Consolas, 'Courier New', monospace;
      }
      .model-evt-cm-host .cm-tooltip-autocomplete {
        border: 1px solid var(--sapField_BorderColor, #3b5373);
        border-radius: 4px;
        background: var(--sapPopover_Background, var(--sapGroup_ContentBackground, #fff));
        color: var(--sapTextColor, #32363a);
        font-size: 12px;
      }
      .model-evt-cm-host .cm-tooltip-autocomplete ul li[aria-selected] {
        background: var(--sapHighlightColor, #0070f2);
        color: #fff;
      }
`;
