/**
 * CMX Neo 筛选条皮肤 — 玻璃底栏 + neo 输入框风格（与 toolbar / form 同源）
 * 启用：cmx-filter-bar data-cmx-skin="neo" [data-cmx-skin-tone="cyan|violet|mint|azure"]
 */
export const CMX_FILTER_BAR_NEO_SKIN_CSS = `:host(.cmx-filter-bar-neo) {
  --neo-filter-accent: var(--neo-cyan, #00b4d8);
  --neo-filter-accent-2: var(--neo-violet, #7c3aed);
  --neo-filter-base: var(--sapGroup_ContentBackground, var(--sapList_Background, #fff));
  display: block;
  isolation: isolate;
}
:host(.cmx-filter-bar-neo[data-cmx-skin-tone="violet"]) { --neo-filter-accent: var(--neo-violet, #7c3aed); --neo-filter-accent-2: var(--neo-cyan, #00b4d8); }
:host(.cmx-filter-bar-neo[data-cmx-skin-tone="mint"])   { --neo-filter-accent: var(--neo-mint, #10b981); }
:host(.cmx-filter-bar-neo[data-cmx-skin-tone="azure"])  { --neo-filter-accent: #0a6ed1; }
:host(.cmx-filter-bar-neo) .filter-surface {
  border-radius: 8px;
  background:
    linear-gradient(90deg,
      color-mix(in srgb, var(--neo-filter-accent) 7%, var(--neo-filter-base)),
      color-mix(in srgb, var(--neo-filter-accent-2) 3%, var(--neo-filter-base)) 70%,
      var(--neo-filter-base));
  border: 1px solid color-mix(in srgb, var(--neo-filter-accent) 20%, var(--sapGroup_ContentBorderColor, #d9d9d9));
  box-shadow: inset 0 -1px 0 color-mix(in srgb, var(--neo-filter-accent) 34%, transparent), 0 1px 6px color-mix(in srgb, var(--neo-filter-accent) 6%, transparent);
  backdrop-filter: blur(6px);
}
:host(.cmx-filter-bar-neo) .filter-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  padding: 0.5rem 0.7rem;
}
:host(.cmx-filter-bar-neo) .filter-toggle {
  margin-left: auto;
  font-family: ui-monospace, monospace;
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--neo-filter-accent);
  cursor: pointer;
  background: none;
  border: none;
  letter-spacing: 0.04em;
}
:host(.cmx-filter-bar-neo) .filter-search {
  --sapField_Background: color-mix(in srgb, var(--neo-filter-accent) 14%, var(--neo-filter-base));
  --sapField_BorderColor: color-mix(in srgb, var(--neo-filter-accent) 30%, var(--sapField_BorderColor, #89919a));
  --sapField_Hover_Background: color-mix(in srgb, var(--neo-filter-accent) 20%, var(--neo-filter-base));
  --sapField_Focus_Background: color-mix(in srgb, var(--neo-filter-accent) 24%, var(--neo-filter-base));
  border-radius: 7px;
}
:host([hidden]) { display: none; }
`
