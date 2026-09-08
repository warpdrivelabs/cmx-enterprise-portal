/**
 * CMX Neo 工具条皮肤 — 玻璃底栏 + 发光分隔线
 * 启用：cmx-toolbar data-cmx-skin="neo" [data-cmx-skin-tone="cyan|violet|mint|azure"]
 */
export const CMX_TOOLBAR_NEO_SKIN_CSS = `:host(.cmx-toolbar-neo) {
  --neo-toolbar-accent: var(--neo-cyan, #00b4d8);
  --neo-toolbar-base: var(--sapGroup_ContentBackground, var(--sapList_Background, #fff));
  display: block;
  isolation: isolate;
}
:host(.cmx-toolbar-neo[data-cmx-skin-tone="violet"]) { --neo-toolbar-accent: var(--neo-violet, #7c3aed); }
:host(.cmx-toolbar-neo[data-cmx-skin-tone="mint"])   { --neo-toolbar-accent: var(--neo-mint, #10b981); }
:host(.cmx-toolbar-neo[data-cmx-skin-tone="azure"])  { --neo-toolbar-accent: #0a6ed1; }
:host(.cmx-toolbar-neo) .toolbar-surface {
  display: flex;
  align-items: center;
  gap: var(--cmx-toolbar-gap, 0.4rem);
  flex-wrap: wrap;
  padding: 0.4rem 0.6rem;
  border-radius: 8px;
  background:
    linear-gradient(90deg,
      color-mix(in srgb, var(--neo-toolbar-accent) 8%, var(--neo-toolbar-base)),
      color-mix(in srgb, var(--neo-toolbar-accent) 3%, var(--neo-toolbar-base)) 70%,
      var(--neo-toolbar-base));
  border: 1px solid color-mix(in srgb, var(--neo-toolbar-accent) 20%, var(--sapGroup_ContentBorderColor, #d9d9d9));
  box-shadow:
    inset 0 -1px 0 color-mix(in srgb, var(--neo-toolbar-accent) 40%, transparent),
    0 1px 6px color-mix(in srgb, var(--neo-toolbar-accent) 6%, transparent);
  backdrop-filter: blur(6px);
}
:host(.cmx-toolbar-neo[divider]) .toolbar-main::after {
  content: '';
  width: 1px;
  align-self: stretch;
  background: color-mix(in srgb, var(--neo-toolbar-accent) 24%, transparent);
  box-shadow: 0 0 4px color-mix(in srgb, var(--neo-toolbar-accent) 30%, transparent);
}
:host(.cmx-toolbar-neo) .toolbar-main { display: contents; }
:host(.cmx-toolbar-neo) .toolbar-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 0.3rem;
}
`
