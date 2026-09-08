/**
 * CMX Neo 表格皮肤 — 高科技表头渐变 / 斑马纹 / 选中高亮（与 trade-neo / voucher-neo 同源）
 * 启用：cmx-revo-grid [data-cmx-skin="neo"] [data-cmx-skin-tone="cyan|azure|violet|mint"]
 * 页面可覆盖：data-cmx-style-id 或 setSkinStyles()
 */
export const CMX_GRID_NEO_SKIN_CSS = `
/* 默认强调色（cyan，与门户表单 Neo 主色一致） */
:host(.cmx-grid-neo) revo-grid {
  --neo-grid-accent: #00b4d8;
  --neo-grid-accent-2: #0ea5e9;
  --neo-grid-accent-3: #0284c7;
  --neo-grid-accent-4: #38bdf8;
  --revo-grid-bg: color-mix(in srgb, var(--neo-grid-accent) 4%, var(--sapList_Background, #fff));
}
:host(.cmx-grid-neo) revo-grid[theme^="dark"] {
  --revo-grid-bg: color-mix(in srgb, var(--neo-grid-accent) 10%, var(--sapList_Background, #1a1f26));
}
:host(.cmx-grid-neo.cmx-grid-neo--violet) revo-grid {
  --neo-grid-accent: #7c3aed;
  --neo-grid-accent-2: #00b4d8;
  --neo-grid-accent-3: #10b981;
  --neo-grid-accent-4: #f59e0b;
}
:host(.cmx-grid-neo.cmx-grid-neo--mint) revo-grid {
  --neo-grid-accent: #10b981;
  --neo-grid-accent-2: #06b6d4;
  --neo-grid-accent-3: #8b5cf6;
  --neo-grid-accent-4: #f59e0b;
}
:host(.cmx-grid-neo.cmx-grid-neo--azure) revo-grid {
  --neo-grid-accent: #0284c7;
  --neo-grid-accent-2: #00b4d8;
  --neo-grid-accent-3: #0369a1;
  --neo-grid-accent-4: #7dd3fc;
}
:host(.cmx-grid-neo) .host-wrap {
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--neo-grid-accent, #00b4d8) 28%, var(--sapList_BorderColor, #d9d9d9)) !important;
  background: var(--sapList_Background, #fff);
  box-shadow: 0 1px 10px color-mix(in srgb, var(--neo-grid-accent, #00b4d8) 8%, transparent);
}
:host(.cmx-grid-neo) revo-grid revogr-header .rgHeaderCell .header-content {
  font-family: ui-monospace, system-ui, sans-serif;
}
:host(.cmx-grid-neo) revo-grid revogr-header .group-rgRow > .rgHeaderCell,
:host(.cmx-grid-neo) revo-grid revogr-header .actual-rgRow > .rgHeaderCell,
:host(.cmx-grid-neo) revo-grid .rowHeaders revogr-header .actual-rgRow > .rgHeaderCell {
  font-weight: 800;
  letter-spacing: 0.04em;
}
:host(.cmx-grid-neo) revo-grid revogr-header .group-rgRow > .rgHeaderCell {
  font-size: 0.72rem;
  text-transform: none;
}
:host(.cmx-grid-neo) revo-grid revogr-header .actual-rgRow > .rgHeaderCell {
  font-size: 0.68rem;
  text-transform: uppercase;
}
:host(.cmx-grid-neo) revo-grid[theme="material"] revogr-header .group-rgRow > .rgHeaderCell,
:host(.cmx-grid-neo) revo-grid[theme="compact"] revogr-header .group-rgRow > .rgHeaderCell {
  background: linear-gradient(180deg,
    color-mix(in srgb, var(--neo-grid-accent) 30%, var(--sapList_HeaderBackground, #f5f6f7)),
    color-mix(in srgb, var(--neo-grid-accent) 14%, var(--sapList_Background, #fff))) !important;
  color: color-mix(in srgb, var(--neo-grid-accent) 88%, var(--sapList_HeaderTextColor, #32363a));
}
:host(.cmx-grid-neo) revo-grid[theme^="dark"] revogr-header .group-rgRow > .rgHeaderCell {
  background: linear-gradient(180deg,
    color-mix(in srgb, var(--neo-grid-accent) 46%, var(--sapList_HeaderBackground, #1d232a)),
    color-mix(in srgb, var(--neo-grid-accent) 24%, var(--sapList_Background, #12171c))) !important;
  color: color-mix(in srgb, var(--neo-grid-accent-2) 82%, var(--sapList_HeaderTextColor, #e8eaeb));
}
:host(.cmx-grid-neo) revo-grid revogr-header .group-rgRow > .rgHeaderCell {
  box-shadow: 0 -1px 0 0 color-mix(in srgb, var(--neo-grid-accent) 72%, var(--revo-grid-cell-border)) inset, -1px 0 0 0 var(--revo-grid-cell-border) inset !important;
}
:host(.cmx-grid-neo) revo-grid revogr-header .group-rgRow > .header-rgRow.group ~ .rgHeaderCell {
  box-shadow: 0 -1px 0 0 color-mix(in srgb, var(--neo-grid-accent-2) 72%, var(--revo-grid-cell-border)) inset, -1px 0 0 0 var(--revo-grid-cell-border) inset !important;
}
:host(.cmx-grid-neo) revo-grid[theme="material"] revogr-header .group-rgRow > .header-rgRow.group ~ .rgHeaderCell,
:host(.cmx-grid-neo) revo-grid[theme="compact"] revogr-header .group-rgRow > .header-rgRow.group ~ .rgHeaderCell {
  background: linear-gradient(180deg,
    color-mix(in srgb, var(--neo-grid-accent-2) 26%, var(--sapList_HeaderBackground, #f5f6f7)),
    color-mix(in srgb, var(--neo-grid-accent-2) 11%, var(--sapList_Background, #fff))) !important;
  color: color-mix(in srgb, var(--neo-grid-accent-2) 86%, var(--sapList_HeaderTextColor, #32363a));
}
:host(.cmx-grid-neo) revo-grid[theme^="dark"] revogr-header .group-rgRow > .header-rgRow.group ~ .rgHeaderCell {
  background: linear-gradient(180deg,
    color-mix(in srgb, var(--neo-grid-accent-2) 40%, var(--sapList_HeaderBackground, #1d232a)),
    color-mix(in srgb, var(--neo-grid-accent-2) 20%, var(--sapList_Background, #12171c))) !important;
}
:host(.cmx-grid-neo) revo-grid revogr-header .group-rgRow > .header-rgRow.group ~ .header-rgRow.group ~ .rgHeaderCell {
  box-shadow: 0 -1px 0 0 color-mix(in srgb, var(--neo-grid-accent-3) 72%, var(--revo-grid-cell-border)) inset, -1px 0 0 0 var(--revo-grid-cell-border) inset !important;
}
:host(.cmx-grid-neo) revo-grid[theme="material"] revogr-header .group-rgRow > .header-rgRow.group ~ .header-rgRow.group ~ .rgHeaderCell,
:host(.cmx-grid-neo) revo-grid[theme="compact"] revogr-header .group-rgRow > .header-rgRow.group ~ .header-rgRow.group ~ .rgHeaderCell {
  background: linear-gradient(180deg,
    color-mix(in srgb, var(--neo-grid-accent-3) 24%, var(--sapList_HeaderBackground, #f5f6f7)),
    color-mix(in srgb, var(--neo-grid-accent-3) 10%, var(--sapList_Background, #fff))) !important;
  color: color-mix(in srgb, var(--neo-grid-accent-3) 84%, var(--sapList_HeaderTextColor, #32363a));
}
:host(.cmx-grid-neo) revo-grid[theme^="dark"] revogr-header .group-rgRow > .header-rgRow.group ~ .header-rgRow.group ~ .rgHeaderCell {
  background: linear-gradient(180deg,
    color-mix(in srgb, var(--neo-grid-accent-3) 38%, var(--sapList_HeaderBackground, #1d232a)),
    color-mix(in srgb, var(--neo-grid-accent-3) 18%, var(--sapList_Background, #12171c))) !important;
}
:host(.cmx-grid-neo) revo-grid revogr-header .group-rgRow > .header-rgRow.group ~ .header-rgRow.group ~ .header-rgRow.group ~ .rgHeaderCell {
  box-shadow: 0 -1px 0 0 color-mix(in srgb, var(--neo-grid-accent-4) 72%, var(--revo-grid-cell-border)) inset, -1px 0 0 0 var(--revo-grid-cell-border) inset !important;
}
:host(.cmx-grid-neo) revo-grid[theme="material"] revogr-header .actual-rgRow > .rgHeaderCell,
:host(.cmx-grid-neo) revo-grid[theme="compact"] revogr-header .actual-rgRow > .rgHeaderCell,
:host(.cmx-grid-neo) revo-grid[theme="material"] .rowHeaders revogr-header .actual-rgRow > .rgHeaderCell,
:host(.cmx-grid-neo) revo-grid[theme="compact"] .rowHeaders revogr-header .actual-rgRow > .rgHeaderCell {
  background: linear-gradient(180deg,
    color-mix(in srgb, var(--neo-grid-accent) 18%, var(--sapList_HeaderBackground, #f5f6f7)),
    color-mix(in srgb, var(--neo-grid-accent) 7%, var(--sapList_Background, #fff))) !important;
  color: var(--sapList_HeaderTextColor, #32363a);
}
:host(.cmx-grid-neo) revo-grid[theme^="dark"] revogr-header .actual-rgRow > .rgHeaderCell,
:host(.cmx-grid-neo) revo-grid[theme^="dark"] .rowHeaders revogr-header .actual-rgRow > .rgHeaderCell {
  background: linear-gradient(180deg,
    color-mix(in srgb, var(--neo-grid-accent) 32%, var(--sapList_HeaderBackground, #1d232a)),
    color-mix(in srgb, var(--neo-grid-accent) 14%, var(--sapList_Background, #12171c))) !important;
  color: var(--sapList_HeaderTextColor, #e8eaeb);
}
:host(.cmx-grid-neo) revo-grid revogr-header .actual-rgRow > .rgHeaderCell:nth-child(4n+1),
:host(.cmx-grid-neo) revo-grid .rowHeaders revogr-header .actual-rgRow > .rgHeaderCell {
  box-shadow: 0 -1px 0 0 color-mix(in srgb, var(--neo-grid-accent) 72%, var(--revo-grid-cell-border)) inset, -1px 0 0 0 var(--revo-grid-cell-border) inset !important;
}
:host(.cmx-grid-neo) revo-grid revogr-header .actual-rgRow > .rgHeaderCell:nth-child(4n+2) {
  box-shadow: 0 -1px 0 0 color-mix(in srgb, var(--neo-grid-accent-2) 72%, var(--revo-grid-cell-border)) inset, -1px 0 0 0 var(--revo-grid-cell-border) inset !important;
}
:host(.cmx-grid-neo) revo-grid revogr-header .actual-rgRow > .rgHeaderCell:nth-child(4n+3) {
  box-shadow: 0 -1px 0 0 color-mix(in srgb, var(--neo-grid-accent-3) 72%, var(--revo-grid-cell-border)) inset, -1px 0 0 0 var(--revo-grid-cell-border) inset !important;
}
:host(.cmx-grid-neo) revo-grid revogr-header .actual-rgRow > .rgHeaderCell:nth-child(4n) {
  box-shadow: 0 -1px 0 0 color-mix(in srgb, var(--neo-grid-accent-4) 72%, var(--revo-grid-cell-border)) inset, -1px 0 0 0 var(--revo-grid-cell-border) inset !important;
}
/* 隔行换色（斑马纹）：仅在宿主同时带 .cmx-grid-neo 和 .cmx-grid-alt-rows
 * 两个 class 时生效。.cmx-grid-alt-rows 由 cmx-revo-grid.js 根据
 * _opts.alternateRowColor 增删；alternateRowColor=false 时去掉该 class
 * 即可即时关闭隔行换色，无须重新注入 CSS。 */
:host(.cmx-grid-neo.cmx-grid-alt-rows) revo-grid[theme="material"] revogr-data .rgRow:nth-child(even) .rgCell,
:host(.cmx-grid-neo.cmx-grid-alt-rows) revo-grid[theme="compact"] revogr-data .rgRow:nth-child(even) .rgCell {
  background: color-mix(in srgb, var(--neo-grid-accent) 4%, var(--sapList_Background, #fff)) !important;
}
:host(.cmx-grid-neo.cmx-grid-alt-rows) revo-grid[theme^="dark"] revogr-data .rgRow:nth-child(even) .rgCell {
  background: color-mix(in srgb, var(--neo-grid-accent) 9%, var(--sapList_Background, #1a1f26)) !important;
}
:host(.cmx-grid-neo) revo-grid revogr-data .rgRow:hover .rgCell {
  background: color-mix(in srgb, var(--neo-grid-accent) 11%, var(--sapList_Hover_Background, var(--sapList_Background, #eaecee))) !important;
}
/* 序号列段（行号那一列）也用同色高亮，序号行 / 数据行视觉一致 */
:host(.cmx-grid-neo) revo-grid .rgRow.cmx-current-row .rowHeaders-inner .rgCell,
:host(.cmx-grid-neo) revo-grid .rowHeaders revogr-data .rgRow.cmx-current-row .rgCell {
  background: color-mix(in srgb, var(--neo-grid-accent) 45%, var(--sapList_SelectionBackgroundColor, #e7f1ff)) !important;
}
:host(.cmx-grid-neo) revo-grid revogr-data .rgCell.cmx-revo-align-right {
  color: color-mix(in srgb, var(--neo-grid-accent) 72%, var(--sapTextColor, #223548));
  font-weight: 700;
}
:host(.cmx-grid-neo) revo-grid[theme^="dark"] revogr-data .rgCell.cmx-revo-align-right {
  color: color-mix(in srgb, var(--neo-grid-accent-2) 78%, var(--sapTextColor, #e8eaeb));
}
:host(.cmx-grid-neo) revo-grid .footer-wrapper {
  background: linear-gradient(90deg,
    color-mix(in srgb, var(--neo-grid-accent) 12%, var(--sapList_FooterBackground, #f5f6f7)),
    color-mix(in srgb, var(--neo-grid-accent-2) 10%, var(--sapList_FooterBackground, #f5f6f7))) !important;
  box-shadow: 0 -1px 0 0 color-mix(in srgb, var(--neo-grid-accent) 45%, var(--revo-grid-cell-border)) !important;
  font-weight: 800;
  color: var(--sapList_FooterTextColor, var(--sapTextColor, inherit));
}
:host(.cmx-grid-neo) revo-grid[theme^="dark"] .footer-wrapper {
  background: linear-gradient(90deg,
    color-mix(in srgb, var(--neo-grid-accent) 18%, var(--sapList_FooterBackground, #1a1f26)),
    color-mix(in srgb, var(--neo-grid-accent-2) 14%, var(--sapList_FooterBackground, #1a1f26))) !important;
}
`;
