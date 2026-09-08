import { WORKBENCH } from './workbench-layout.js';

/** <designer-app> Shadow 样式 */
export const DESIGNER_APP_SHELL_STYLE = `
  :host {
    display: block;
    height: 100%;
  }

  .app-shell {
    display: grid;
    grid-template-rows: auto 1fr;
    height: 100%;
    gap: 0;
    padding: 0;
    box-sizing: border-box;
  }

  .workbench {
    display: flex;
    min-height: 0;
    min-width: 0;
    overflow: hidden;
  }

  .panel {
    background: var(--sapBackgroundColor, #111827);
    border: none;
    border-radius: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .left-panel { width: ${WORKBENCH.leftWidth}px; min-width: ${WORKBENCH.leftMin}px; flex: 0 0 auto; }
  .right-panel { width: ${WORKBENCH.rightWidth}px; min-width: ${WORKBENCH.rightMin}px; flex: 0 0 auto; }

  .left-palette-wrap { flex: 1; min-height: ${WORKBENCH.leftPaletteMinHeight}px; display: flex; flex-direction: column; overflow: hidden; }
  .left-tree-wrap    { flex: 0 0 ${WORKBENCH.treeHeight}px; min-height: ${WORKBENCH.treeMin}px; display: flex; flex-direction: column; overflow: hidden; }
  designer-tree-panel { height: 100%; }

  .center-panel {
    flex: 1;
    min-width: ${WORKBENCH.centerMinWidth}px;
    display: flex;
    flex-direction: column;
    gap: 0;
    margin: 0;
    min-height: 0;
  }

  /* ── 中央区域 Tab 栏 ── */
  .center-tab-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 8px 0 8px;
    background: var(--sapGroup_TitleBackground, #0b1220);
    border-bottom: 1px solid var(--sapGroup_TitleBorderColor, #334155);
    flex-shrink: 0;
  }
  .center-tabs { display: flex; gap: 2px; padding-top: 4px; }
  .c-tab-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 5px 14px;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--sapContent_LabelColor, #8fa7c0);
    cursor: pointer;
    font-size: 12px;
    border-radius: 4px 4px 0 0;
    min-width: 52px;
    transition: color 0.15s;
  }
  .c-tab-btn ui5-icon { font-size: 14px; }
  .c-tab-btn:hover { color: var(--sapTextColor, #e2e8f0); }
  .c-tab-btn.active {
    color: var(--sapTextColor, #e2e8f0);
    border-bottom-color: var(--sapHighlightColor, #0070f2);
  }
  /* 与 CMXFormDesigner 画布 .cv-bar-io 一致：预览 / 调试 / | / 导入 / 导出 */
  .tab-actions {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
    padding: 3px 0;
    flex-wrap: wrap;
  }
  .tab-actions ui5-button.tab-io-icon-btn {
    --_ui5_button_base_height: 1.5rem;
    --_ui5_button_base_min_width: 1.5rem;
    --_ui5_button_base_padding: 0;
    width: 24px;
    min-width: 24px;
    height: 24px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 5px;
    font-size: 12px;
    font-weight: 600;
  }
  .tab-actions .tab-io-sep {
    opacity: 0.35;
    user-select: none;
    font-size: 11px;
    color: var(--sapContent_LabelColor, #94a3b8);
    padding: 0 1px;
  }

  /* ── 中央内容面板 ── */
  .c-pane { display: none; flex: 1; min-height: 0; flex-direction: column; }
  .c-pane.active { display: flex; }

  .page-pane {
    display: none;
    flex: 1;
    min-height: 0;
    flex-direction: column;
    gap: 0;
  }
  .page-pane.active { display: flex; }

  .page-view-body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    position: relative;
  }
  .page-sub-pane {
    flex: 1;
    min-height: 0;
    display: none;
    flex-direction: column;
    overflow: hidden;
  }
  .page-sub-pane.active {
    display: flex;
  }

  .page-view-tab-bar {
    flex-shrink: 0;
    display: flex;
    align-items: stretch;
    gap: 8px;
    padding: 0;
    margin: 0;
    background: var(--sapGroup_TitleBackground, #0b1220);
    border-top: 1px solid var(--sapGroup_TitleBorderColor, #334155);
  }
  .page-sub-tab-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 0;
    margin: 0;
    background: transparent;
    border: none;
    border-top: 2px solid transparent;
    color: var(--sapContent_LabelColor, #8fa7c0);
    cursor: pointer;
    font-size: 12px;
    border-radius: 0;
    min-width: 0;
    min-height: 28px;
    flex: 0 0 auto;
    transition: color 0.15s;
  }
  .page-sub-tab-btn ui5-icon { font-size: 14px; }
  .page-sub-tab-btn:hover { color: var(--sapTextColor, #e2e8f0); }
  .page-sub-tab-btn.active {
    color: var(--sapTextColor, #e2e8f0);
    border-top-color: var(--sapHighlightColor, #0070f2);
    background: rgba(0, 112, 242, 0.12);
  }

  designer-page-data {
    display: none;
    flex: 1;
    min-height: 0;
  }
  designer-page-data.active { display: flex; }

  .design-wrap { flex: 1; min-height: ${WORKBENCH.designWrapMinHeight}px; }
  .source-wrap { flex: 1; min-height: 0; }

  /* 分隔条：1px，颜色同 ShellBar 底部线（--sapPageHeader_BorderColor） */
  .splitter {
    position: relative;
    flex: 0 0 1px;
    box-sizing: border-box;
    background-color: var(--sapPageHeader_BorderColor, var(--sapGroup_TitleBorderColor, #334155));
    transition: background-color 0.15s ease;
  }
  .splitter.vertical {
    width: 1px;
    min-width: 1px;
    cursor: col-resize;
  }
  .splitter.horizontal {
    height: 1px;
    min-height: 1px;
    margin: 0;
    cursor: row-resize;
  }
  .splitter:hover,
  .splitter.dragging {
    background-color: var(--sapHighlightColor, #0070f2);
  }

  designer-canvas, designer-source-panel { display: flex; flex-direction: column; height: 100%; }
  designer-left-panel, designer-inspector { height: 100%; }

  /* 导入 / 导出 / 页内运行：关闭后从布局与命中测试中移除（UI5 Popup 仅在 [open] 时 display:flex，否则易在 Shadow 内残留固定层） */
  ui5-dialog#serverImportDlg:not([open]),
  ui5-dialog#serverExportDlg:not([open]),
  ui5-dialog#inlineRunDlg:not([open]) {
    display: none !important;
    pointer-events: none;
    visibility: hidden;
  }

  ui5-dialog#serverImportDlg,
  ui5-dialog#multiPagesDlg {
    width: min(900px, calc(100vw - 24px));
    min-width: min(480px, calc(100vw - 32px));
    height: min(533px, calc(100vh - 80px));
    min-height: 320px;
    max-width: calc(100vw - 16px);
    max-height: calc(100vh - 24px);
    box-sizing: border-box;
  }
  ui5-dialog#serverImportDlg::part(header),
  ui5-dialog#multiPagesDlg::part(header) {
    min-height: 3rem;
    box-sizing: border-box;
  }
  .server-import-dlg-header,
  .multi-pages-dlg-header {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    width: 100%;
    min-width: 0;
    min-height: 3rem;
    padding: 0.5rem 0.75rem;
    box-sizing: border-box;
    cursor: move;
    user-select: none;
  }
  .server-import-dlg-header .server-import-dlg-header-icon,
  .server-import-dlg-header ui5-title,
  .multi-pages-dlg-header .multi-pages-dlg-header-icon,
  .multi-pages-dlg-header ui5-title {
    pointer-events: none;
  }
  .server-import-dlg-header .server-import-dlg-header-icon,
  .multi-pages-dlg-header .multi-pages-dlg-header-icon {
    flex-shrink: 0;
    width: 1.5rem;
    height: 1.5rem;
    color: var(--sapHighlightColor, #0070f2);
  }
  .server-import-dlg-header ui5-title,
  .multi-pages-dlg-header ui5-title {
    flex: 1;
    min-width: 0;
    font-size: 1rem;
  }
  .server-import-footer-actions {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    box-sizing: border-box;
    padding: 0.35rem 0.5rem 0.4rem;
    background: var(--sapPageFooter_Background, var(--sapGroup_TitleBackground, #0b1220));
    border-top: 1px solid var(--sapPageHeader_BorderColor, var(--sapGroup_TitleBorderColor, #334155));
  }
  /* 状态提示放在按钮左侧；spacer 把按钮推到右端，strip 显隐不影响按钮位置 */
  .server-import-footer-strip {
    flex: 0 1 auto;
    min-width: 0;
    max-width: 60%;
    overflow: hidden;
  }
  .server-import-footer-strip[hidden] {
    display: none;
  }
  .server-import-footer-spacer {
    flex: 1 1 auto;
    min-width: 0;
  }
  .server-import-dlg,
  .multi-pages-dlg-body {
    display: flex;
    flex-direction: column;
    gap: 5px;
    box-sizing: border-box;
    width: 100%;
    max-width: 100%;
    height: 100%;
    min-height: 0;
    flex: 1 1 auto;
    padding: 5px;
    background: var(--sapObjectHeader_Background, var(--sapGroup_TitleBackground, #0b1220));
  }
  /* 导入对话框：左树 + 右列表 左右分栏 */
  .server-import-split {
    display: flex;
    flex-direction: row;
    gap: 5px;
    flex: 1 1 auto;
    min-height: 0;
    width: 100%;
    box-sizing: border-box;
  }
  .server-import-tree-pane {
    flex: 0 0 240px;
    min-width: 180px;
    max-width: 320px;
    display: flex;
    flex-direction: column;
    min-height: 0;
    border-right: 1px solid var(--sapGroup_TitleBorderColor, #334155);
    padding-right: 5px;
    box-sizing: border-box;
  }
  .server-import-tree {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
  }
  .server-import-main-pane {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }
  .multi-pages-table .col-mp-check {
    width: 2.25rem;
    text-align: center;
    vertical-align: middle;
  }
  .multi-pages-table .mp-row-check {
    width: 1rem;
    height: 1rem;
    cursor: pointer;
    accent-color: var(--sapHighlightColor, #0070f2);
  }
  .server-import-strip-wrap {
    padding: 0;
    flex-shrink: 0;
  }
  .server-import-strip-wrap ui5-message-strip {
    width: 100%;
    box-sizing: border-box;
  }
  .server-import-strip-wrap ui5-message-strip[hidden] {
    display: none !important;
  }
  .server-import-hint {
    padding: 0 0 5px 0;
    margin: 0;
    font-size: 0.8125rem;
    line-height: 1.45;
    color: var(--sapContent_LabelColor, #8fa7c0);
    border-bottom: 1px solid var(--sapPageHeader_BorderColor, var(--sapGroup_TitleBorderColor, #334155));
    flex-shrink: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* 搜索框独立成行：避免 ui5-toolbar 宽度不足时把搜索框收进溢出菜单导致被遮挡 */
  .server-import-search-row {
    display: flex;
    flex-shrink: 0;
    width: 100%;
    box-sizing: border-box;
    padding: 0 0 5px 0;
    border-bottom: 1px solid var(--sapPageHeader_BorderColor, var(--sapGroup_TitleBorderColor, #334155));
  }
  .server-import-search-row .server-import-search {
    flex: 1 1 auto;
    width: 100%;
    min-width: 0;
    max-width: 100%;
    margin: 0;
  }
  .server-import-toolbar {
    width: 100%;
    box-sizing: border-box;
    border-bottom: 1px solid var(--sapPageHeader_BorderColor, var(--sapGroup_TitleBorderColor, #334155));
    flex-shrink: 0;
  }
  .server-import-toolbar .server-import-pageinfo {
    align-self: center;
    font-size: 0.8125rem;
    color: var(--sapTextColor, #e2e8f0);
    padding: 0 0.25rem;
    white-space: nowrap;
    user-select: none;
  }
  .server-import-table-wrap {
    flex: 1;
    min-height: 0;
    overflow: auto;
    background: var(--sapList_Background, var(--sapBackgroundColor, #111827));
    border-top: none;
  }
  .server-import-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8125rem;
    font-family: var(--sapFontFamily, '72', Arial, sans-serif);
  }
  .server-import-table th,
  .server-import-table td {
    padding: 0.4rem 0.5rem;
    text-align: left;
    border: 1px solid var(--sapList_BorderColor, #334155);
    vertical-align: top;
  }
  .server-import-table thead th {
    background: var(--sapList_HeaderBackground, #1e293b);
    color: var(--sapContent_LabelColor, #94a3b8);
    font-weight: 600;
    position: sticky;
    top: 0;
    z-index: 1;
    box-shadow: 0 1px 0 var(--sapList_BorderColor, #334155);
  }
  .server-import-table tbody tr {
    cursor: pointer;
    color: var(--sapTextColor, #e2e8f0);
    background: var(--sapList_Background, #111827);
  }
  .server-import-table tbody tr:nth-child(even) {
    background: var(--sapList_AlternatingBackground, rgba(255, 255, 255, 0.02));
  }
  .server-import-table tbody tr:hover {
    background: var(--sapList_Hover_Background, #1e293b);
  }
  .server-import-table tbody tr.selected {
    background: var(--sapList_SelectionBackgroundColor, rgba(0, 112, 242, 0.22));
    box-shadow: inset 0 0 0 1px var(--sapList_SelectionBorderColor, #0070f2);
  }
  .server-import-table .col-id {
    width: 22%;
    white-space: nowrap;
    font-family: ui-monospace, Consolas, monospace;
  }
  .server-import-table .col-name { width: 20%; }
  .server-import-table .col-timestamp {
    width: 18%;
    white-space: nowrap;
    font-family: ui-monospace, Consolas, monospace;
    font-size: 0.75rem;
    color: var(--sapContent_LabelColor, #94a3b8);
  }
  .server-import-table .col-details { word-break: break-word; }

  /* 导出到服务器：表单对话框 */
  ui5-dialog#serverExportDlg {
    width: min(520px, calc(100vw - 24px));
    min-width: min(360px, calc(100vw - 32px));
    max-width: calc(100vw - 16px);
    box-sizing: border-box;
  }
  ui5-dialog#serverExportDlg::part(header) {
    min-height: 3rem;
    box-sizing: border-box;
  }
  .server-export-dlg-header {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    width: 100%;
    min-width: 0;
    min-height: 3rem;
    padding: 0.5rem 0.75rem;
    box-sizing: border-box;
    cursor: move;
    user-select: none;
  }
  .server-export-dlg-header ui5-icon,
  .server-export-dlg-header ui5-title {
    pointer-events: none;
  }
  .server-export-dlg-header ui5-icon {
    flex-shrink: 0;
    width: 1.5rem;
    height: 1.5rem;
    color: var(--sapHighlightColor, #0070f2);
  }
  .server-export-dlg-body {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 8px 12px 12px;
    box-sizing: border-box;
    background: var(--sapObjectHeader_Background, var(--sapGroup_TitleBackground, #0b1220));
  }
  .server-export-strip-wrap ui5-message-strip {
    width: 100%;
    box-sizing: border-box;
  }
  .server-export-strip-wrap ui5-message-strip[hidden] {
    display: none !important;
  }
  .server-export-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .server-export-field ui5-label {
    font-size: 0.8125rem;
  }
  .server-export-field ui5-input,
  .server-export-field ui5-textarea {
    width: 100%;
    box-sizing: border-box;
  }
  /* 三级联动行：标签 + 控件横排，标签固定 110px。 */
  .server-export-field-row {
    flex-direction: row;
    align-items: center;
    gap: 12px;
  }
  .server-export-field-row > ui5-label {
    flex: 0 0 110px;
  }
  .server-export-field-row > ui5-select,
  .server-export-field-row > ui5-input,
  .server-export-field-row > ui5-checkbox {
    flex: 1 1 auto;
    min-width: 0;
  }
  .server-export-hint {
    font-size: 0.75rem;
    color: var(--sapContent_LabelColor, #8fa7c0);
    line-height: 1.4;
  }
  .server-export-footer-actions {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    box-sizing: border-box;
    padding: 0.35rem 0.5rem 0.4rem;
    background: var(--sapPageFooter_Background, var(--sapGroup_TitleBackground, #0b1220));
    border-top: 1px solid var(--sapPageHeader_BorderColor, var(--sapGroup_TitleBorderColor, #334155));
  }

  /* 页内运行：无 iframe，在 #inlineRunMount 内跑导出 HTML */
  ui5-dialog#inlineRunDlg {
    width: min(96vw, 1400px);
    min-width: min(560px, calc(100vw - 24px));
    height: min(92vh, 920px);
    min-height: 400px;
    max-width: calc(100vw - 8px);
    max-height: calc(100vh - 8px);
    box-sizing: border-box;
  }
  ui5-dialog#inlineRunDlg::part(header) {
    min-height: 3rem;
    box-sizing: border-box;
  }
  .inline-run-dlg-header {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    width: 100%;
    min-width: 0;
    min-height: 3rem;
    padding: 0.5rem 0.75rem;
    box-sizing: border-box;
    cursor: move;
    user-select: none;
  }
  .inline-run-dlg-header .inline-run-dlg-header-icon {
    flex-shrink: 0;
    width: 1.5rem;
    height: 1.5rem;
    color: var(--sapHighlightColor, #0070f2);
    pointer-events: none;
  }
  .inline-run-dlg-header ui5-title {
    flex: 1;
    min-width: 0;
    font-size: 1rem;
    pointer-events: none;
  }
  .inline-run-dlg-body {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 0;
    width: 100%;
    height: 100%;
    padding: 0;
    box-sizing: border-box;
    background: var(--sapGroup_ContentBackground, #0f172a);
  }
  .inline-run-mount {
    flex: 1 1 auto;
    min-height: min(78vh, 760px);
    width: 100%;
    overflow: auto;
    box-sizing: border-box;
    padding: 8px;
    background: var(--sapBackgroundColor, #1e293b);
  }
  .inline-run-footer-actions {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    box-sizing: border-box;
    padding: 0.35rem 0.5rem 0.4rem;
    background: var(--sapPageFooter_Background, var(--sapGroup_TitleBackground, #0b1220));
    border-top: 1px solid var(--sapPageHeader_BorderColor, var(--sapGroup_TitleBorderColor, #334155));
  }
`;
