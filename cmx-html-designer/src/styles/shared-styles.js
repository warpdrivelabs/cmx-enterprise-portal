/**
 * 共享样式片段 — 供各 Shadow DOM 组件引入，消除重复样式定义
 *
 * 使用方式：
 *   import { TOOLBAR_BASE, FIELD_ROW } from '../styles/shared-styles.js';
 *   const STYLE = `${TOOLBAR_BASE}${FIELD_ROW}...组件专有样式...`;
 *
 * SAP 主题变量回退值（统一基准）：
 *   --sapBackgroundColor                   var(--sapInformationElementColor, #111827)
 *   --sapGroup_TitleBackground             var(--sapInformationElementColor, #0b1220)
 *   --sapGroup_TitleBorderColor            var(--sapInformationElementColor, #334155)
 *   --sapContent_LabelColor                var(--sapInformationElementColor, #8fa7c0)
 *   --sapTextColor                         #e2e8f0
 *   --sapHighlightColor / --sapBrandColor  var(--sapInformationElementColor, #0070f2)
 *   --sapNeutralBorderColor                var(--sapInformationElementColor, #334155)
 *   --sapContent_NonInteractiveIconColor   var(--sapInformationElementColor, #6c8093)
 *   --sapField_Background                  var(--sapInformationElementColor, #1a2b40)
 *   --sapField_BorderColor                 var(--sapInformationElementColor, #3b5373)
 *   --sapPositiveColor                     var(--sapPositiveElementColor, #30914c)
 *   --sapNegativeColor                     var(--sapNegativeElementColor, #bb372a)
 *   --sapList_Hover_Background             var(--sapInformationElementColor, #1a2b40)
 */

/** 工具栏条：图标按钮横排（画布工具栏、源码面板工具栏） */
export const TOOLBAR_BASE = `
  .toolbar {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 2px 6px;
    background: var(--sapGroup_TitleBackground, #0b1220);
    border-bottom: 1px solid var(--sapGroup_TitleBorderColor, #334155);
    flex-shrink: 0;
  }
  .toolbar ui5-button {
    --_ui5_button_base_height: 26px;
    --_ui5_button_base_min_width: 26px;
    --_ui5_button_base_padding: 0 4px;
  }
  .tb-sep {
    width: 1px; height: 16px;
    background: var(--sapGroup_TitleBorderColor, #334155);
    margin: 0 3px; flex-shrink: 0;
  }
`;

/** 两列表单行：左侧标签 + 右侧输入控件
 *  覆盖列宽：在 :host 中设置 --field-label-width（默认 90px）
 */
export const FIELD_ROW = `
  .field-row {
    display: grid;
    grid-template-columns: var(--field-label-width, 90px) 1fr;
    align-items: center;
    gap: 6px;
    min-height: 28px;
  }
  .field-row.full { grid-template-columns: 1fr; }
  .field-row.checkbox-row { grid-template-columns: 1fr; }
`;
