/**
 * CMX Neo 表单皮肤 — 高科技玻璃质感字段卡片（与 voucher-neo / trade-neo 同源）
 * 启用：cmx-ui5-form data-cmx-skin="neo" [data-cmx-skin-tone="mint"]
 * 页面可覆盖：data-cmx-style-id 或 setSkinStyles()
 */
export const CMX_FORM_NEO_SKIN_CSS = `:host(.cmx-form-neo) {
  --neo-form-accent: #00b4d8;
  --neo-form-accent-2: #7c3aed;
  --neo-form-input-h: 1.52rem;
  --neo-form-font-size: 0.76rem;
  --neo-form-label-size: 0.76rem;
  --neo-form-base: var(--sapGroup_ContentBackground, var(--sapList_Background, #f4f6f8));
  display: block;
  position: relative;
  border-radius: 9px;
  overflow: hidden;
  isolation: isolate;
  background: transparent;
}
:host(.cmx-form-neo--mint) {
  --neo-form-accent: #10b981;
  --neo-form-accent-2: #00b4d8;
}
:host(.cmx-form-neo) ui5-form {
  width: 100%;
  position: relative;
  z-index: 1;
  box-sizing: border-box;
  border-radius: 9px;
  overflow: hidden;
  background: transparent !important;
  --sapGroup_TitleBorderColor: color-mix(in srgb, var(--neo-form-accent) 24%, transparent);
  --ui5-v2-form-vertical-spacing: 0.1rem;
  --ui5-v2-form-item-spacing: 0.32rem;
}
/* 仅隐藏扁平模式（form-root 直接子 ui5-form）的表单总标题；分组模式（.cmx-form-group 内 ui5-form）的组名标题保留显示 */
:host(.cmx-form-neo) #form-root > ui5-form::part(header) { display: none; }
:host(.cmx-form-neo) ui5-form::part(layout) {
  padding: 0.32rem 0.42rem;
  row-gap: 0.32rem;
  background: transparent;
}
:host(.cmx-form-neo) ui5-form-item::part(root) {
  position: relative;
  padding: 4px 10px 4px 11px;
  border-radius: 10px;
  background:
    linear-gradient(128deg,
      color-mix(in srgb, var(--neo-form-accent) 18%, var(--neo-form-base)),
      color-mix(in srgb, var(--neo-form-accent-2) 10%, var(--neo-form-base)) 58%,
      color-mix(in srgb, var(--neo-form-accent) 6%, var(--neo-form-base)));
  border: 1px solid color-mix(in srgb, var(--neo-form-accent) 32%, var(--sapField_BorderColor, #89919a));
  box-shadow:
    inset 2px 0 0 color-mix(in srgb, var(--neo-form-accent) 72%, transparent),
    inset 0 0 18px color-mix(in srgb, var(--neo-form-accent) 6%, transparent),
    0 1px 8px color-mix(in srgb, var(--neo-form-accent) 10%, transparent);
  backdrop-filter: blur(6px);
  transition: border-color 0.22s ease, box-shadow 0.22s ease;
}
:host(.cmx-form-neo) ui5-form-item::part(root):hover {
  border-color: color-mix(in srgb, var(--neo-form-accent) 48%, transparent);
  box-shadow:
    inset 2px 0 0 var(--neo-form-accent),
    inset 0 0 22px color-mix(in srgb, var(--neo-form-accent) 10%, transparent),
    0 2px 12px color-mix(in srgb, var(--neo-form-accent) 16%, transparent);
}
:host(.cmx-form-neo) ui5-form-item::part(layout) {
  align-items: center;
  gap: 0.4rem;
}
/* UI5 默认给 label 侧(dt) 设了 padding:var(--ui5-form-item-label-padding,.125rem 0)，
   content 侧(dd) 没有对应 padding → 只读 span 等非 input 元素比 label 偏上 2px。
   给 content 补对称上下 padding，让两侧起始位置一致。 */
:host(.cmx-form-neo) ui5-form-item::part(content) {
  padding-block: var(--ui5-form-item-label-padding, 0.125rem);
}
:host(.cmx-form-neo) ui5-label {
  font-size: var(--neo-form-label-size, 0.76rem);
  font-weight: 800;
  letter-spacing: 0.06em;
  font-family: ui-monospace, system-ui, sans-serif;
  line-height: var(--neo-form-input-h, 1.52rem);
  color: color-mix(in srgb, var(--neo-form-accent) 82%, var(--sapContent_LabelColor, #6a6d70));
  white-space: nowrap;
  text-shadow: 0 0 12px color-mix(in srgb, var(--neo-form-accent) 18%, transparent);
}
:host(.cmx-form-neo) ui5-form-item ui5-input,
:host(.cmx-form-neo) ui5-form-item ui5-date-picker,
:host(.cmx-form-neo) ui5-form-item ui5-select,
:host(.cmx-form-neo) ui5-form-item ui5-combobox,
:host(.cmx-form-neo) ui5-form-item ui5-textarea {
  width: 100%;
  min-width: 0;
  --_ui5_input_height: var(--neo-form-input-h);
  --_ui5_input_min_width: 0;
  --sapField_Background: color-mix(in srgb, var(--neo-form-accent) 22%, var(--neo-form-base));
  --sapField_BorderColor: color-mix(in srgb, var(--neo-form-accent) 34%, var(--sapField_BorderColor, #89919a));
  --_ui5-input-border: 1px solid color-mix(in srgb, var(--neo-form-accent) 30%, transparent);
  --_ui5_input_bottom_border_height: 0;
  --_ui5_input_bottom_border_color: transparent;
  --sapField_BorderCornerRadius: 7px;
  --sapField_Hover_Background: color-mix(in srgb, var(--neo-form-accent) 28%, var(--neo-form-base));
  --sapField_Focus_Background: color-mix(in srgb, var(--neo-form-accent) 32%, var(--neo-form-base));
  --_ui5_input_focus_outline_color: color-mix(in srgb, var(--neo-form-accent) 55%, transparent);
  font-size: var(--neo-form-font-size, 0.76rem);
  font-weight: 600;
  font-family: ui-monospace, monospace;
  border-radius: 7px;
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--sapTextColor, #32363a) 6%, transparent);
}
:host(.cmx-form-neo) ui5-form-item ui5-input[focused],
:host(.cmx-form-neo) ui5-form-item ui5-date-picker[focused],
:host(.cmx-form-neo) ui5-form-item ui5-combobox[focused] {
  --sapField_BorderColor: var(--neo-form-accent);
  filter: drop-shadow(0 0 6px color-mix(in srgb, var(--neo-form-accent) 32%, transparent));
}
:host(.cmx-form-neo) ui5-form-item ui5-date-picker {
  --cmx-form-date-picker-height: var(--neo-form-input-h);
  min-height: var(--neo-form-input-h);
  display: block;
}
:host(.cmx-form-neo) ui5-form-item ui5-input[readonly],
:host(.cmx-form-neo) ui5-form-item ui5-date-picker[readonly],
:host(.cmx-form-neo) ui5-form-item ui5-select[disabled],
:host(.cmx-form-neo) ui5-form-item ui5-combobox[readonly],
:host(.cmx-form-neo) ui5-form-item ui5-textarea[readonly] {
  --sapField_ReadOnly_Background: transparent;
  --sapField_Background: transparent;
  --_ui5-input-border: none;
  --_ui5_input_readonly_border: none;
  --_ui5_input_readonly_border_color: transparent;
  border: none !important;
  box-shadow: none !important;
  font-weight: 700;
  color: var(--sapTitleColor, #223548);
  text-shadow: 0 0 10px color-mix(in srgb, var(--neo-form-accent) 12%, transparent);
}
:host(.cmx-form-neo) ui5-form-item ui5-input[readonly]::part(root),
:host(.cmx-form-neo) ui5-form-item ui5-date-picker[readonly]::part(root) {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
}
:host(.cmx-form-neo) ui5-form-item ui5-input[readonly]::part(input),
:host(.cmx-form-neo) ui5-form-item ui5-date-picker[readonly]::part(input) {
  background: transparent !important;
}
:host(.cmx-form-neo) ui5-form-item:nth-child(4n+1) { --neo-field-accent: var(--neo-form-accent); }
:host(.cmx-form-neo) ui5-form-item:nth-child(4n+2) { --neo-field-accent: var(--neo-form-accent-2); }
:host(.cmx-form-neo) ui5-form-item:nth-child(4n+3) { --neo-field-accent: #10b981; }
:host(.cmx-form-neo) ui5-form-item:nth-child(4n) { --neo-field-accent: #f59e0b; }
:host(.cmx-form-neo) ui5-form-item:nth-child(4n+1)::part(root),
:host(.cmx-form-neo) ui5-form-item:nth-child(4n+2)::part(root),
:host(.cmx-form-neo) ui5-form-item:nth-child(4n+3)::part(root),
:host(.cmx-form-neo) ui5-form-item:nth-child(4n)::part(root) {
  background:
    linear-gradient(128deg,
      color-mix(in srgb, var(--neo-field-accent, var(--neo-form-accent)) 20%, var(--neo-form-base)),
      color-mix(in srgb, var(--neo-field-accent, var(--neo-form-accent)) 8%, var(--neo-form-base)) 55%,
      color-mix(in srgb, var(--neo-form-accent-2) 6%, var(--neo-form-base)));
  border-color: color-mix(in srgb, var(--neo-field-accent, var(--neo-form-accent)) 34%, var(--sapField_BorderColor, #89919a));
  box-shadow:
    inset 2px 0 0 color-mix(in srgb, var(--neo-field-accent, var(--neo-form-accent)) 75%, transparent),
    inset 0 0 20px color-mix(in srgb, var(--neo-field-accent, var(--neo-form-accent)) 8%, transparent),
    0 1px 8px color-mix(in srgb, var(--neo-field-accent, var(--neo-form-accent)) 11%, transparent);
}
:host(.cmx-form-neo) ui5-form-item:nth-child(4n+1) ui5-label,
:host(.cmx-form-neo) ui5-form-item:nth-child(4n+2) ui5-label,
:host(.cmx-form-neo) ui5-form-item:nth-child(4n+3) ui5-label,
:host(.cmx-form-neo) ui5-form-item:nth-child(4n) ui5-label {
  color: color-mix(in srgb, var(--neo-field-accent, var(--neo-form-accent)) 84%, var(--sapContent_LabelColor, #6a6d70));
}
:host(.cmx-form-neo) ui5-form-item:nth-child(4n+1) ui5-input,
:host(.cmx-form-neo) ui5-form-item:nth-child(4n+2) ui5-input,
:host(.cmx-form-neo) ui5-form-item:nth-child(4n+3) ui5-input,
:host(.cmx-form-neo) ui5-form-item:nth-child(4n) ui5-input,
:host(.cmx-form-neo) ui5-form-item:nth-child(4n+1) ui5-date-picker,
:host(.cmx-form-neo) ui5-form-item:nth-child(4n+2) ui5-date-picker,
:host(.cmx-form-neo) ui5-form-item:nth-child(4n+3) ui5-date-picker,
:host(.cmx-form-neo) ui5-form-item:nth-child(4n) ui5-date-picker {
  --sapField_Background: color-mix(in srgb, var(--neo-field-accent, var(--neo-form-accent)) 24%, var(--neo-form-base));
  --sapField_BorderColor: color-mix(in srgb, var(--neo-field-accent, var(--neo-form-accent)) 36%, var(--sapField_BorderColor, #89919a));
  --sapField_Hover_Background: color-mix(in srgb, var(--neo-field-accent, var(--neo-form-accent)) 30%, var(--neo-form-base));
  --sapField_Focus_Background: color-mix(in srgb, var(--neo-field-accent, var(--neo-form-accent)) 34%, var(--neo-form-base));
  --_ui5_input_focus_outline_color: color-mix(in srgb, var(--neo-field-accent, var(--neo-form-accent)) 58%, transparent);
}
:host(.cmx-form-neo) .readonly-display {
  font-family: ui-monospace, monospace;
  font-weight: 700;
  font-size: var(--neo-form-font-size, 0.76rem);
  line-height: var(--neo-form-input-h, 1.52rem);
  padding: 0 2px;
  color: var(--sapTitleColor, #223548);
  text-shadow: 0 0 10px color-mix(in srgb, var(--neo-form-accent) 14%, transparent);
}
/* 分组内 ui5-form 去圆角：neo 给所有 ui5-form 9px 圆角（扁平玻璃感），分组模式下 ui5-form 在
   .cmx-form-group 容器内（card=ui5-card 原生卡片，bar=自定义 div），9px 圆角与容器圆角不匹配。
   归 0 后 ui5-form 方角贴合容器，由容器（ui5-card / bar div）统一管理圆角与裁剪。 */
:host(.cmx-form-neo) #form-root .cmx-form-group > ui5-form {
  border-radius: 0 !important;
}
/* 分组模式宿主仅作透明容器（background:transparent）：overflow:hidden + 9px 圆角会把首个分组
   标题的左色条（border-left）顶部按圆角弧线裁掉——竖条显示不完整。分组容器各自管理圆角与
   裁剪（card 有自身 overflow:hidden），宿主在分组模式关掉圆角裁剪。 */
:host(.cmx-form-neo.cmx-form-grouped) {
  border-radius: 0;
  overflow: visible;
}`
