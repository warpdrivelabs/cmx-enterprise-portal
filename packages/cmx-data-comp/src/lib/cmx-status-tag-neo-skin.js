/**
 * CMX Neo 状态标签皮肤 — 霓虹色调徽章
 * 启用：cmx-status-tag data-cmx-skin="neo"
 * tone 映射：success→mint / warning→warn / danger→红 / info→cyan / neutral→灰
 * variant：solid 实色 / subtle 浅底深字 / outline 描边
 */
export const CMX_STATUS_TAG_NEO_SKIN_CSS = `:host(.cmx-status-tag-neo) {
  display: inline-flex;
  isolation: isolate;
}
:host(.cmx-status-tag-neo) .tag-surface {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  font-family: ui-monospace, monospace;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  line-height: 1.4;
  white-space: nowrap;
  border: 1px solid transparent;
  transition: box-shadow 0.18s ease;
}
/* ── tone 色板（在 :host 上定义色变量，供 variant 复用） ── */
:host(.cmx-status-tag-neo[tone="success"]) { --tag-c: var(--neo-mint, #10b981); }
:host(.cmx-status-tag-neo[tone="warning"]) { --tag-c: var(--neo-warn, #f59e0b); }
:host(.cmx-status-tag-neo[tone="danger"])  { --tag-c: #ef4444; }
:host(.cmx-status-tag-neo[tone="info"])    { --tag-c: var(--neo-cyan, #00b4d8); }
:host(.cmx-status-tag-neo[tone="neutral"]),
:host(.cmx-status-tag-neo:not([tone]))     { --tag-c: var(--sapContent_LabelColor, #6a6d70); }
/* ── variant: solid（实色背景白字） ── */
:host(.cmx-status-tag-neo:not([variant]) ) .tag-surface,
:host(.cmx-status-tag-neo[variant="solid"]) .tag-surface {
  background: var(--tag-c);
  color: #fff;
  box-shadow: 0 0 8px color-mix(in srgb, var(--tag-c) 40%, transparent);
}
/* ── variant: subtle（浅底深字） ── */
:host(.cmx-status-tag-neo[variant="subtle"]) .tag-surface {
  background: color-mix(in srgb, var(--tag-c) 16%, transparent);
  color: color-mix(in srgb, var(--tag-c) 78%, var(--sapTextColor, #223548));
}
/* ── variant: outline（透明底描边） ── */
:host(.cmx-status-tag-neo[variant="outline"]) .tag-surface {
  background: transparent;
  color: var(--tag-c);
  border-color: color-mix(in srgb, var(--tag-c) 50%, transparent);
}
:host(.cmx-status-tag-neo[dot]) .tag-dot {
  width: 0.42rem;
  height: 0.42rem;
  border-radius: 50%;
  background: var(--tag-c);
  box-shadow: 0 0 6px var(--tag-c);
  flex: 0 0 auto;
}
:host(.cmx-status-tag-neo:not([variant]) ) .tag-dot,
:host(.cmx-status-tag-neo[variant="solid"]) .tag-dot {
  background: #fff;
  box-shadow: 0 0 4px #fff;
}
:host(.cmx-status-tag-neo[size="sm"]) .tag-surface { font-size: 0.66rem; padding: 0.05rem 0.4rem; }
:host([hidden]) { display: none; }
`
