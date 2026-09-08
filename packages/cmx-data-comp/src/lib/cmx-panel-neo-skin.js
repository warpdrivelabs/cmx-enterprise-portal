/**
 * CMX Neo 面板皮肤 — 高科技玻璃质感可折叠面板外壳
 * 启用：cmx-panel data-cmx-skin="neo" [data-cmx-skin-tone="cyan|violet|mint|azure"]
 * 页面可覆盖：data-cmx-style-id 或 setSkinStyle()
 *
 * 视觉特征（与 form/grid neo 同源）：
 *  - 玻璃拟态表面（--neo-glass + backdrop-filter），--neo-border 描边，圆角 10px；
 *  - 标题栏 ui-monospace 800 字重 + accent 色发光；
 *  - tone 变体切换 --neo-panel-accent；折叠箭头随状态旋转。
 */
export const CMX_PANEL_NEO_SKIN_CSS = `:host(.cmx-panel-neo) {
  --neo-panel-accent: var(--neo-cyan, #00b4d8);
  --neo-panel-accent-2: var(--neo-violet, #7c3aed);
  --neo-panel-base: var(--sapGroup_ContentBackground, var(--sapList_Background, #fff));
  display: block;
  isolation: isolate;
}
:host(.cmx-panel-neo[data-cmx-skin-tone="violet"]) {
  --neo-panel-accent: var(--neo-violet, #7c3aed);
  --neo-panel-accent-2: var(--neo-cyan, #00b4d8);
}
:host(.cmx-panel-neo[data-cmx-skin-tone="mint"]) {
  --neo-panel-accent: var(--neo-mint, #10b981);
  --neo-panel-accent-2: var(--neo-cyan, #00b4d8);
}
:host(.cmx-panel-neo[data-cmx-skin-tone="azure"]) {
  --neo-panel-accent: #0a6ed1;
  --neo-panel-accent-2: var(--neo-violet, #7c3aed);
}
:host(.cmx-panel-neo) .panel-surface {
  position: relative;
  border-radius: 10px;
  overflow: hidden;
  background:
    linear-gradient(128deg,
      color-mix(in srgb, var(--neo-panel-accent) 10%, var(--neo-panel-base)),
      color-mix(in srgb, var(--neo-panel-accent-2) 5%, var(--neo-panel-base)) 60%,
      var(--neo-panel-base));
  border: 1px solid color-mix(in srgb, var(--neo-panel-accent) 24%, var(--sapGroup_ContentBorderColor, #d9d9d9));
  box-shadow:
    0 1px 8px color-mix(in srgb, var(--neo-panel-accent) 8%, transparent),
    inset 0 1px 0 color-mix(in srgb, #fff 22%, transparent);
  backdrop-filter: blur(8px);
}
:host(.cmx-panel-neo) .panel-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.85rem;
  background: linear-gradient(90deg,
    color-mix(in srgb, var(--neo-panel-accent) 14%, transparent),
    color-mix(in srgb, var(--neo-panel-accent-2) 8%, transparent));
  border-bottom: 1px solid color-mix(in srgb, var(--neo-panel-accent) 18%, transparent);
}
:host(.cmx-panel-neo[collapsible]) .panel-head { cursor: pointer; }
:host(.cmx-panel-neo[collapsible]) .panel-head:hover {
  background: linear-gradient(90deg,
    color-mix(in srgb, var(--neo-panel-accent) 20%, transparent),
    color-mix(in srgb, var(--neo-panel-accent-2) 12%, transparent));
}
:host(.cmx-panel-neo) .panel-icon {
  color: var(--neo-panel-accent);
  filter: drop-shadow(0 0 6px color-mix(in srgb, var(--neo-panel-accent) 36%, transparent));
}
:host(.cmx-panel-neo) .panel-title {
  font-family: ui-monospace, system-ui, sans-serif;
  font-weight: 800;
  letter-spacing: 0.06em;
  font-size: 0.84rem;
  color: color-mix(in srgb, var(--neo-panel-accent) 88%, var(--sapTitleColor, #223548));
  text-shadow: 0 0 12px color-mix(in srgb, var(--neo-panel-accent) 20%, transparent);
}
:host(.cmx-panel-neo) .panel-actions ::slotted(*) {
  font-family: ui-monospace, monospace;
}
:host(.cmx-panel-neo) .panel-arrow {
  color: var(--neo-panel-accent);
  transition: transform 0.22s ease;
  filter: drop-shadow(0 0 4px color-mix(in srgb, var(--neo-panel-accent) 40%, transparent));
}
:host(.cmx-panel-neo[collapsed]) .panel-arrow { transform: rotate(-90deg); }
:host(.cmx-panel-neo) .panel-body {
  padding: 0.75rem 0.85rem;
}
:host(.cmx-panel-neo) .panel-summary {
  padding: 0.5rem 0.85rem;
  font-size: 0.78rem;
  color: var(--sapContent_LabelColor, #6a6d70);
  font-family: ui-monospace, monospace;
}
`
