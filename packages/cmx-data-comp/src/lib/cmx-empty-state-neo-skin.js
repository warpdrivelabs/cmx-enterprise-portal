/**
 * CMX Neo 空状态皮肤 — 淡灰居中 + 描边发光图标容器
 * 启用：cmx-empty-state data-cmx-skin="neo"
 */
export const CMX_EMPTY_STATE_NEO_SKIN_CSS = `:host(.cmx-empty-state-neo) {
  --neo-empty-accent: var(--neo-cyan, #00b4d8);
  display: block;
}
:host(.cmx-empty-state-neo[data-cmx-skin-tone="violet"]) { --neo-empty-accent: var(--neo-violet, #7c3aed); }
:host(.cmx-empty-state-neo[data-cmx-skin-tone="mint"])   { --neo-empty-accent: var(--neo-mint, #10b981); }
:host(.cmx-empty-state-neo[data-cmx-skin-tone="azure"])  { --neo-empty-accent: #0a6ed1; }
:host(.cmx-empty-state-neo) .empty-surface {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  padding: 2rem 1rem;
  text-align: center;
}
:host(.cmx-empty-state-neo) .empty-icon {
  width: 3rem;
  height: 3rem;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid color-mix(in srgb, var(--neo-empty-accent) 28%, var(--sapGroup_ContentBorderColor, #d9d9d9));
  background: color-mix(in srgb, var(--neo-empty-accent) 8%, transparent);
  box-shadow: 0 0 18px color-mix(in srgb, var(--neo-empty-accent) 18%, transparent), inset 0 0 12px color-mix(in srgb, var(--neo-empty-accent) 6%, transparent);
}
:host(.cmx-empty-state-neo) .empty-icon ui5-icon,
:host(.cmx-empty-state-neo) .empty-icon ::slotted(*) {
  color: var(--neo-empty-accent);
  filter: drop-shadow(0 0 4px color-mix(in srgb, var(--neo-empty-accent) 40%, transparent));
}
:host(.cmx-empty-state-neo) .empty-title {
  font-family: ui-monospace, system-ui, sans-serif;
  font-weight: 700;
  font-size: 0.9rem;
  color: var(--sapTitleColor, #223548);
}
:host(.cmx-empty-state-neo) .empty-desc {
  font-size: 0.78rem;
  color: var(--sapContent_LabelColor, #6a6d70);
  max-width: 26rem;
  line-height: 1.5;
}
:host(.cmx-empty-state-neo[size="sm"]) .empty-icon { width: 2.2rem; height: 2.2rem; }
:host(.cmx-empty-state-neo[size="sm"]) .empty-surface { padding: 1.2rem 0.8rem; gap: 0.4rem; }
:host(.cmx-empty-state-neo[size="lg"]) .empty-icon { width: 4rem; height: 4rem; }
:host(.cmx-empty-state-neo[size="lg"]) .empty-surface { padding: 3rem 1.2rem; gap: 0.8rem; }
:host([hidden]) { display: none; }
`
