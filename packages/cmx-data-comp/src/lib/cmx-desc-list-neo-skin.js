/**
 * CMX Neo 描述清单皮肤 — 玻璃底 + monospace 标签 + 分隔线
 * 启用：cmx-desc-list data-cmx-skin="neo" [data-cmx-skin-tone="cyan|violet|mint|azure"]
 */
export const CMX_DESC_LIST_NEO_SKIN_CSS = `:host(.cmx-desc-list-neo) {
  --neo-desclist-accent: var(--neo-cyan, #00b4d8);
  --neo-desclist-base: var(--sapGroup_ContentBackground, var(--sapList_Background, #fff));
  display: block;
  isolation: isolate;
}
:host(.cmx-desc-list-neo[data-cmx-skin-tone="violet"]) { --neo-desclist-accent: var(--neo-violet, #7c3aed); }
:host(.cmx-desc-list-neo[data-cmx-skin-tone="mint"])   { --neo-desclist-accent: var(--neo-mint, #10b981); }
:host(.cmx-desc-list-neo[data-cmx-skin-tone="azure"])  { --neo-desclist-accent: #0a6ed1; }
:host(.cmx-desc-list-neo) .desclist-surface {
  border-radius: 9px;
  overflow: hidden;
  background:
    linear-gradient(128deg,
      color-mix(in srgb, var(--neo-desclist-accent) 6%, var(--neo-desclist-base)),
      var(--neo-desclist-base) 65%);
  border: 1px solid color-mix(in srgb, var(--neo-desclist-accent) 20%, var(--sapGroup_ContentBorderColor, #d9d9d9));
  box-shadow: 0 1px 6px color-mix(in srgb, var(--neo-desclist-accent) 6%, transparent);
}
:host(.cmx-desc-list-neo) .desclist-grid {
  display: grid;
  grid-template-columns: repeat(var(--cmx-desclist-cols, 1), 1fr);
}
:host(.cmx-desc-list-neo) .desclist-item {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  padding: 0.5rem 0.85rem;
}
:host(.cmx-desc-list-neo[border]) .desclist-item {
  border-bottom: 1px solid color-mix(in srgb, var(--neo-desclist-accent) 16%, transparent);
}
:host(.cmx-desc-list-neo) .desclist-label {
  font-family: ui-monospace, monospace;
  font-size: 0.74rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  color: color-mix(in srgb, var(--neo-desclist-accent) 82%, var(--sapContent_LabelColor, #6a6d70));
  flex: 0 0 var(--cmx-desclist-label-w, 6rem);
}
:host(.cmx-desc-list-neo) .desclist-value {
  font-size: 0.8rem;
  color: var(--sapTextColor, #32363a);
  flex: 1 1 auto;
  min-width: 0;
  word-break: break-word;
}
:host([hidden]) { display: none; }
`
