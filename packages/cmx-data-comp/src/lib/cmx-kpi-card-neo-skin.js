/**
 * CMX Neo KPI 卡皮肤 — 玻璃质感统计卡（与财务模块 acct-kpi / neo-kpi 同源）
 * 启用：cmx-kpi-card data-cmx-skin="neo" [data-cmx-skin-tone="cyan|violet|mint|azure"]
 *
 * tone 映射（统一 acct-kpi 的 data-kind 与 neo-kpi 的修饰符 class）：
 *   success/cash-in → mint；warning/cash-out/expense → warn；danger → 红；
 *   info/revenue → cyan；neutral/asset → 灰；其他财务维度走对应色。
 */
export const CMX_KPI_CARD_NEO_SKIN_CSS = `:host(.cmx-kpi-card-neo) {
  --neo-kpi-accent: var(--neo-cyan, #00b4d8);
  --neo-kpi-base: var(--sapGroup_ContentBackground, var(--sapList_Background, #fff));
  display: inline-block;
  isolation: isolate;
}
:host(.cmx-kpi-card-neo[data-cmx-skin-tone="violet"]) { --neo-kpi-accent: var(--neo-violet, #7c3aed); }
:host(.cmx-kpi-card-neo[data-cmx-skin-tone="mint"])   { --neo-kpi-accent: var(--neo-mint, #10b981); }
:host(.cmx-kpi-card-neo[data-cmx-skin-tone="azure"])  { --neo-kpi-accent: #0a6ed1; }
/* tone 语义色映射到 --kpi-c（供 value/发光消费） */
:host(.cmx-kpi-card-neo[tone="success"]),:host(.cmx-kpi-card-neo[tone="cash-in"])  { --neo-kpi-accent: var(--neo-mint, #10b981); }
:host(.cmx-kpi-card-neo[tone="warning"]),:host(.cmx-kpi-card-neo[tone="cash-out"]),:host(.cmx-kpi-card-neo[tone="expense"]) { --neo-kpi-accent: var(--neo-warn, #f59e0b); }
:host(.cmx-kpi-card-neo[tone="danger"])  { --neo-kpi-accent: #ef4444; }
:host(.cmx-kpi-card-neo[tone="info"]),:host(.cmx-kpi-card-neo[tone="revenue"])   { --neo-kpi-accent: var(--neo-cyan, #00b4d8); }
:host(.cmx-kpi-card-neo[tone="neutral"]),:host(.cmx-kpi-card-neo[tone="asset"])  { --neo-kpi-accent: var(--sapContent_LabelColor, #6a6d70); }

/* ── variant: card（neo-kpi / fico-kpi 风格：圆角块卡片） ── */
:host(.cmx-kpi-card-neo[variant="card"]) .kpi-surface,
:host(.cmx-kpi-card-neo:not([variant])) .kpi-surface {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.25rem;
  padding: 0.75rem 1rem;
  border-radius: 10px;
  min-width: 7rem;
  background:
    linear-gradient(128deg,
      color-mix(in srgb, var(--neo-kpi-accent) 12%, var(--neo-kpi-base)),
      color-mix(in srgb, var(--neo-kpi-accent) 4%, var(--neo-kpi-base)) 60%,
      var(--neo-kpi-base));
  border: 1px solid color-mix(in srgb, var(--neo-kpi-accent) 24%, var(--sapGroup_ContentBorderColor, #d9d9d9));
  box-shadow: 0 1px 8px color-mix(in srgb, var(--neo-kpi-accent) 8%, transparent), inset 0 1px 0 color-mix(in srgb, #fff 22%, transparent);
  backdrop-filter: blur(8px);
}
:host(.cmx-kpi-card-neo[variant="card"]) .kpi-label {
  font-family: ui-monospace, system-ui, sans-serif;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: color-mix(in srgb, var(--neo-kpi-accent) 80%, var(--sapContent_LabelColor, #6a6d70));
  text-transform: uppercase;
}
:host(.cmx-kpi-card-neo[variant="card"]) .kpi-value {
  font-family: ui-monospace, monospace;
  font-size: 1.5rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
  color: var(--neo-kpi-accent);
  text-shadow: 0 0 14px color-mix(in srgb, var(--neo-kpi-accent) 30%, transparent);
}
:host(.cmx-kpi-card-neo[variant="card"]) .kpi-unit {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--sapContent_LabelColor, #6a6d70);
  margin-left: 0.2rem;
}
:host(.cmx-kpi-card-neo[variant="card"]) .kpi-trend {
  font-size: 0.72rem;
  font-weight: 700;
  font-family: ui-monospace, monospace;
}
:host(.cmx-kpi-card-neo[variant="card"]) .kpi-trend[data-trend="up"]   { color: var(--neo-mint, #10b981); }
:host(.cmx-kpi-card-neo[variant="card"]) .kpi-trend[data-trend="down"] { color: #ef4444; }

/* ── variant: inline（acct-kpi 风格：行内 label:value） ── */
:host(.cmx-kpi-card-neo[variant="inline"]) .kpi-surface {
  display: inline-flex;
  align-items: baseline;
  gap: 0.3rem;
  padding: 0.25rem 0.6rem;
  border-radius: 6px;
  cursor: default;
  transition: background 0.18s ease;
}
:host(.cmx-kpi-card-neo[variant="inline"][clickable]) .kpi-surface { cursor: pointer; }
:host(.cmx-kpi-card-neo[variant="inline"][clickable]) .kpi-surface:hover {
  background: color-mix(in srgb, var(--neo-kpi-accent) 14%, transparent);
  box-shadow: inset 2px 0 0 var(--neo-kpi-accent);
}
:host(.cmx-kpi-card-neo[variant="inline"]) .kpi-label {
  font-family: ui-monospace, monospace;
  font-size: 0.74rem;
  font-weight: 700;
  color: color-mix(in srgb, var(--neo-kpi-accent) 78%, var(--sapContent_LabelColor, #6a6d70));
}
:host(.cmx-kpi-card-neo[variant="inline"]) .kpi-value {
  font-family: ui-monospace, monospace;
  font-size: 1rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: var(--neo-kpi-accent);
  text-shadow: 0 0 10px color-mix(in srgb, var(--neo-kpi-accent) 24%, transparent);
}
:host(.cmx-kpi-card-neo[variant="inline"]) .kpi-unit {
  font-size: 0.68rem;
  color: var(--sapContent_LabelColor, #6a6d70);
}
:host([hidden]) { display: none; }
`
