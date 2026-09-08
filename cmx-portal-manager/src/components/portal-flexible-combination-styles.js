/**
 * 弹性组合管理器主面板样式。
 *
 * 从 portal-flexible-combination-manager.js 的 _render 内联 <style> 抽出，
 * 累計约 260 行。纯 CSS 字符串常量，无动态插值。
 */
export const FLC_MANAGER_STYLES = `
        :host{display:block;height:100%;min-height:0;background:var(--sapBackgroundColor,#fff);color:var(--sapTextColor,#1d2d3e);font-family:var(--sapFontFamily,Arial,sans-serif);color-scheme:light dark;--cmx-selection-color:var(--neo-cyan,#00b4d8);--cmx-selection-border:color-mix(in srgb,var(--cmx-selection-color) 54%,var(--sapGroup_ContentBackground,#fff));--cmx-selection-bg:color-mix(in srgb,var(--cmx-selection-color) 12%,var(--sapGroup_ContentBackground,#fff));--cmx-selection-bg-soft:color-mix(in srgb,var(--cmx-selection-color) 8%,var(--sapGroup_ContentBackground,#fff));--cmx-selection-text:color-mix(in srgb,var(--cmx-selection-color) 78%,var(--sapTextColor,#1d2d3e))}
        .wrap{height:100%;display:grid;grid-template-columns:minmax(0,1fr);min-height:0}
        .side{border-right:1px solid var(--sapGroup_TitleBorderColor,#d9d9d9);min-width:0;display:flex;flex-direction:column;background:var(--sapList_Background,#fff)}
        .head,.panel-head{height:40px;display:flex;align-items:center;gap:8px;padding:0 12px;border-bottom:1px solid var(--sapGroup_TitleBorderColor,#d9d9d9);box-sizing:border-box}
        .title{font-weight:700;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:0 1 auto;min-width:60px}
        .docref-inline{display:flex;align-items:center;gap:6px;flex:0 1 auto;min-width:0;margin-left:8px}
        .embed-kind-label{font-size:13px;font-weight:700;color:var(--sapTextColor,#1d2d3e);flex:0 0 auto}
        .embed-doc-select{height:28px;max-width:320px;border:1px solid var(--sapField_BorderColor,#89919a);border-radius:4px;padding:0 6px;background:var(--sapField_Background,#fff);color:inherit;font-size:12px;cursor:pointer}
        :host([data-readonly]) .design-layout input:not([data-ver-select]):not([data-embed-doc]):not([data-doc-ref]),:host([data-readonly]) .design-layout select:not([data-ver-select]):not([data-embed-doc]),:host([data-readonly]) .design-layout textarea{pointer-events:none;background:var(--sapField_ReadOnly_Background,rgba(0,0,0,.02))}
        :host([data-readonly]) .design-layout ui5-checkbox{pointer-events:none;opacity:.75}
        :host([data-readonly]) [data-action^="add-"],:host([data-readonly]) [data-action^="remove-"],:host([data-readonly]) [data-action^="move-"],:host([data-readonly]) [data-action="open-formula"],:host([data-readonly]) [data-action="rename-panel"],:host([data-readonly]) [data-action="rename-field-tab"]{display:none!important}
        .docref-inline .docref-label{font-size:12px;color:var(--sapContent_LabelColor,#6a6d70);white-space:nowrap}
        .docref-inline select{height:28px;max-width:240px;border:1px solid var(--sapField_BorderColor,#89919a);border-radius:4px;padding:0 6px;background:var(--sapField_Background,#fff);color:var(--sapField_TextColor,var(--sapTextColor,#1d2d3e));font-size:12px;box-sizing:border-box}
        .spacer{flex:1}
        ui5-button{flex-shrink:0}
        .ver-control{display:flex;align-items:center;gap:4px;flex:0 0 auto;padding:2px 4px 2px 8px;border:1px solid var(--sapGroup_TitleBorderColor,#d9d9d9);border-radius:6px;background:var(--sapList_HeaderBackground,#f7f7f7);margin-right:6px}
        .ver-control .ver-label{font-size:12px;color:var(--sapContent_LabelColor,#6a6d70);white-space:nowrap}
        .ver-control .ver-select{height:24px;max-width:200px;border:0;background:transparent;padding:0 4px;font-size:12px;color:inherit;cursor:pointer}
        .ver-control .ver-btn{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;border:0;border-radius:5px;background:transparent;color:var(--sapContent_IconColor,#6a6d70);cursor:pointer}
        .ver-control .ver-btn:hover{background:var(--sapButton_Hover_Background,rgba(0,0,0,.06));color:var(--sapHighlightColor,#0070f2)}
        .ver-control .ver-btn ui5-icon{width:14px;height:14px;pointer-events:none}
        .ver-backdrop{position:fixed;inset:0;z-index:60;background:rgba(0,0,0,.32);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}
        .ver-modal{width:min(440px,96vw);max-height:82vh;overflow:auto;border:1px solid var(--sapGroup_TitleBorderColor,#d9d9d9);border-radius:8px;background:var(--sapGroup_ContentBackground,#fff);box-shadow:0 12px 32px rgba(0,0,0,.24);padding:14px;box-sizing:border-box}
        .ver-modal.vm-modal{width:min(640px,96vw)}
        .ver-modal-head{display:flex;align-items:center;gap:8px;margin-bottom:10px}
        .ver-modal-head h3{margin:0;font-size:15px;font-weight:700;flex:1}
        .ver-modal-head .ver-x{border:0;background:transparent;font-size:15px;line-height:1;color:var(--sapContent_LabelColor,#6a6d70);cursor:pointer;padding:4px 8px;border-radius:4px}
        .ver-modal-head .ver-x:hover{background:var(--sapButton_Hover_Background,rgba(0,0,0,.06))}
        .ver-form{display:grid;grid-template-columns:72px minmax(0,1fr);gap:10px 8px;align-items:center;font-size:13px;padding:4px 2px}
        .ver-form label{color:var(--sapContent_LabelColor,#6a6d70)}
        .ver-form input{height:30px;border:1px solid var(--sapField_BorderColor,#89919a);border-radius:4px;padding:0 8px;background:var(--sapField_Background,#fff);color:inherit;box-sizing:border-box;width:100%}
        .ver-check{display:flex;align-items:center;gap:6px;margin:10px 2px 0;font-size:12px;color:var(--sapTextColor,#1d2d3e);cursor:pointer}
        .ver-check input{width:15px;height:15px;flex:0 0 auto}
        .ver-file-hint{margin:10px 2px 0;font-size:12px;color:var(--sapContent_LabelColor,#6a6d70)}
        .ver-file-hint code{font-family:ui-monospace,Menlo,Consolas,monospace;background:var(--sapList_HeaderBackground,#f0f0f0);padding:1px 6px;border-radius:4px;color:var(--sapTextColor,#1d2d3e)}
        .ver-modal-foot{display:flex;justify-content:flex-end;margin-top:14px}
        .ver-create-btn{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 14px;border:0;border-radius:6px;background:var(--sapButton_Emphasized_Background,var(--sapHighlightColor,#0a6ed1));color:var(--sapButton_Emphasized_TextColor,#fff);font-size:13px;font-weight:600;cursor:pointer}
        .ver-create-btn ui5-icon{width:15px;height:15px;color:currentColor}
        .ver-create-btn:hover{background:var(--sapButton_Emphasized_Hover_Background,#085caf)}
        .vm-table{width:100%;border-collapse:collapse;font-size:12px}
        .vm-table th{text-align:left;color:var(--sapContent_LabelColor,#6a6d70);font-weight:600;padding:6px 8px;border-bottom:1px solid var(--sapGroup_TitleBorderColor,#e5e5e5);background:var(--sapList_HeaderBackground,#f7f7f7)}
        .vm-table td{padding:6px 8px;border-bottom:1px solid var(--sapGroup_TitleBorderColor,#eee);vertical-align:middle}
        .vm-table tr.is-current{background:var(--cmx-selection-bg,#f0f7ff)}
        .vm-no{font-weight:700;white-space:nowrap}
        .vm-cur-tag{margin-left:6px;font-size:10px;font-weight:700;background:var(--sapInformationBackground,#eaf4ff);color:var(--sapInformationColor,#0a6ed1);border-radius:8px;padding:0 6px}
        .vm-time{color:var(--sapContent_LabelColor,#6a6d70);font-variant-numeric:tabular-nums;white-space:nowrap}
        .vm-muted{color:var(--sapContent_LabelColor,#9a9d9f)}
        .vm-default-badge{font-weight:700;color:var(--sapPositiveColor,#107e3e);white-space:nowrap}
        .vm-link{border:0;background:transparent;color:var(--sapHighlightColor,#0a6ed1);cursor:pointer;font-size:12px;padding:2px 4px;border-radius:4px}
        .vm-link:hover{background:var(--sapButton_Hover_Background,rgba(0,0,0,.06))}
        .vm-link.danger{color:var(--sapNegativeColor,#bb0000)}
        .vm-link[disabled]{opacity:.4;cursor:default;background:transparent}
        .vm-ops{white-space:nowrap}
        .vm-foot{display:flex;align-items:center;gap:10px;margin-top:14px}
        .vm-hint{flex:1;font-size:11px;color:var(--sapContent_LabelColor,#6a6d70)}
        .ver-badge{margin-left:6px;font-size:10px;font-weight:700;background:var(--sapInformationBackground,#eaf4ff);color:var(--sapInformationColor,#0a6ed1);border-radius:9px;padding:0 7px;line-height:16px;white-space:nowrap}
        .panel-head .head-act{width:36px;height:36px;min-width:36px}
        .list{overflow:auto;min-height:0;padding:6px}
        .item{width:100%;text-align:left;border:1px solid transparent;background:transparent;border-radius:6px;padding:8px;display:block;color:inherit;cursor:pointer}
        .item:hover{background:var(--sapList_Hover_Background,#f5f6f7)}
        .item.active{border-color:var(--cmx-selection-border);background:var(--cmx-selection-bg)}
        .item-title{font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .item-sub{font-size:11px;color:var(--sapContent_LabelColor,#6a6d70);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .main{display:flex;flex-direction:column;min-width:0;min-height:0}
        textarea{border:1px solid var(--sapField_BorderColor,#89919a);border-radius:4px;resize:vertical;outline:none;padding:8px;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--sapTextColor,#1d2d3e);background:var(--sapField_Background,#fff);box-sizing:border-box}
        #combination-json{flex:1;min-height:0;border:0;border-radius:0;resize:none;padding:12px}
        .design-layout{flex:1;min-height:0;padding:12px;display:flex;flex-direction:column;gap:12px;background:var(--sapGroup_ContentBackground,#fafafa)}
        .dim-section.collapsed{flex:0 0 auto}
        .dim-section.open{flex:1 1 0}
        .dim-toggle{cursor:pointer;user-select:none}
        .dim-caret{color:var(--sapContent_LabelColor,#6a6d70);font-size:11px;width:12px;flex:0 0 auto}
        .design-row{flex:1 1 0;min-height:0;display:flex;flex-direction:column;overflow:hidden}
        .design-row .box-body{flex:1 1 0;min-height:0;overflow:auto}
        .design-row .box-body details.collapse{border-top:1px solid var(--sapGroup_TitleBorderColor,#e5e5e5);margin-top:6px}
        .design-row .box-body details.collapse>summary{height:32px}
        .design-layout table thead th{position:sticky;top:0;z-index:1}
        details.collapse>summary{cursor:pointer;list-style:none;user-select:none;display:flex;align-items:center}
        details.collapse>summary::-webkit-details-marker{display:none}
        details.collapse>summary::before{content:'▸';margin-right:6px;color:var(--sapContent_LabelColor,#6a6d70);font-size:11px}
        details.collapse[open]>summary::before{content:'▾'}
        .box{border:1px solid var(--sapGroup_TitleBorderColor,#d9d9d9);border-radius:6px;background:var(--sapTile_Background,#fff);min-width:0}
        .box-head{height:36px;display:flex;align-items:center;gap:8px;padding:0 10px;border-bottom:1px solid var(--sapGroup_TitleBorderColor,#d9d9d9)}
        .box-title{font-weight:700;font-size:13px}
        /* 规则面板 tab 容器：每个面板一个标签，内含规则表格 + 明细字段 */
        .rule-tabs{display:flex;align-items:stretch;gap:2px;padding:4px 6px 0;border-bottom:1px solid var(--sapGroup_TitleBorderColor,#d9d9d9);flex-wrap:wrap;flex-shrink:0;background:var(--sapObjectHeader_Background,#fff)}
        .rule-tab{display:inline-flex;align-items:center;gap:8px;max-width:220px;height:30px;padding:0 10px;border:1px solid transparent;border-bottom:0;border-radius:6px 6px 0 0;background:transparent;color:var(--sapContent_LabelColor,#6a6d70);font-size:12px;cursor:pointer;white-space:nowrap}
        .rule-tab:hover{background:var(--sapList_Hover_Background,#f5f6f7)}
        .rule-tab.active{background:var(--sapTile_Background,#fff);color:var(--sapTextColor,#1d2d3e);font-weight:700;border-color:var(--sapGroup_TitleBorderColor,#d9d9d9);position:relative;top:1px}
        .rule-tab .rt-name{overflow:hidden;text-overflow:ellipsis;max-width:150px}
        .rule-tab .rt-count{display:inline-flex;min-width:16px;height:16px;padding:0 4px;align-items:center;justify-content:center;border-radius:8px;background:var(--sapContent_LabelColor,#6a6d70);color: #fff;font-size:10px;font-weight:700;line-height:1}
        .rule-tab.active .rt-count{background:var(--sapInformationElementColor, #0a6ed1);color: #fff}
        .rule-tab .rt-add,.rule-tab .rt-rename,.rule-tab .rt-del{display:inline-flex;width:18px;height:18px;align-items:center;justify-content:center;border-radius:50%;font-size:11px;line-height:1}
        .rule-tab .rt-add{color:var(--sapPositiveColor,#107e3e);font-size:14px;font-weight:700}
        .rule-tab .rt-add:hover{background:color-mix(in srgb, var(--sapPositiveElementColor, #107e3e) 16%, transparent)}
        .rule-tab .rt-rename{color:var(--sapContent_IconColor,#6a6d70)}
        .rule-tab .rt-rename:hover{background:var(--sapList_Hover_Background,#e8eaed)}
        .rule-tab .rt-del{color:var(--sapNegativeTextColor,#bb0000)}
        .rule-tab .rt-del:hover{background:color-mix(in srgb, var(--sapNegativeElementColor, #bb0000) 16%, transparent)}
        .rule-tab.add{color:var(--sapContent_IconColor,#6a6d70);font-size:16px;padding:0 12px;min-width:32px;justify-content:center}
        .rule-body{padding-top:6px}
        /* 明细字段集 tab（规则下，每套对应一张表）：每个 tab 一视同仁 */
        .ft-tabs{display:flex;align-items:stretch;gap:2px;flex-wrap:wrap;padding:6px 8px 0;margin-top:6px;border-top:1px solid var(--sapGroup_TitleBorderColor,#e5e5e5)}
        .ft-tab{display:inline-flex;align-items:center;gap:8px;max-width:220px;height:28px;padding:0 10px;border:1px solid transparent;border-bottom:0;border-radius:5px 5px 0 0;background:transparent;color:var(--sapContent_LabelColor,#6a6d70);font-size:12px;cursor:pointer;white-space:nowrap}
        .ft-tab:hover{background:var(--sapList_Hover_Background,#f5f6f7)}
        .ft-tab.active{background:var(--sapTile_Background,#fff);color:var(--sapTextColor,#1d2d3e);font-weight:700;border-color:var(--sapGroup_TitleBorderColor,#d9d9d9);position:relative;top:1px}
        .ft-tab .ft-name{overflow:hidden;text-overflow:ellipsis;max-width:130px}
        .ft-tab .rt-count{display:inline-flex;min-width:16px;height:16px;padding:0 4px;align-items:center;justify-content:center;border-radius:8px;background:var(--sapContent_LabelColor,#6a6d70);color: #fff;font-size:10px;font-weight:700;line-height:1}
        .ft-tab.active .rt-count{background:var(--sapInformationElementColor, #0a6ed1);color: #fff}
        .ft-tab .ft-act{display:inline-flex;width:18px;height:18px;align-items:center;justify-content:center;border-radius:50%;font-size:11px;line-height:1}
        .ft-tab .ft-add-field{color:var(--sapPositiveColor,#107e3e);font-size:14px;font-weight:700}
        .ft-tab .ft-add-field:hover{background:color-mix(in srgb, var(--sapPositiveElementColor, #107e3e) 16%, transparent)}
        .ft-tab .ft-rename{color:var(--sapContent_IconColor,#6a6d70)}
        .ft-tab .ft-rename:hover{background:var(--sapList_Hover_Background,#e8eaed)}
        .ft-tab .ft-del{color:var(--sapNegativeTextColor,#bb0000)}
        .ft-tab .ft-del:hover{background:color-mix(in srgb, var(--sapNegativeElementColor, #bb0000) 16%, transparent)}
        .ft-tab.add{color:var(--sapContent_IconColor,#6a6d70);font-size:15px;padding:0 10px;min-width:30px;justify-content:center}
        .ft-body{padding-top:6px}
        .rule-table-scroll{max-height:220px;overflow:auto;border-bottom:1px solid var(--sapGroup_TitleBorderColor,#e5e5e5)}
        .fields-table-scroll{max-height:280px;overflow:auto;border-top:1px solid var(--sapGroup_TitleBorderColor,#e5e5e5)}
        .fx-cell{display:flex;align-items:center;gap:2px}
        .fx-cell input{flex:1;min-width:0}
        .cmx-select-text{display:flex;flex-direction:column;align-items:stretch;gap:4px}
        .cmx-select-text select{min-width:0;width:100%}
        .cmx-select-text input{min-width:0;width:100%}
        .cmx-field-tip{display:inline-flex;align-items:center;border:none;background:none;cursor:pointer;padding:0 0 0 2px;color:var(--sapContent_NonInteractiveIconColor,#89919a);vertical-align:middle}
        .cmx-field-tip ui5-icon{width:12px;height:12px}
        .cmx-field-tip:hover{color:var(--sapHighlightColor,#0a6ed1)}
        .cmx-field-tips-body{white-space:pre-wrap;padding:12px;font-size:12px;line-height:1.6;color:var(--sapTextColor,#1d2d3e)}
        .fx-btn{flex:0 0 auto;width:24px;height:24px}
        .fx-btn ui5-icon{width:14px;height:14px;color:var(--sapHighlightColor,#0a6ed1)}
        .fx-backdrop{position:fixed;inset:0;z-index:60;background:rgba(0,0,0,.32);display:flex;align-items:center;justify-content:center}
        .fx-modal{width:760px;max-width:94vw;max-height:86vh;display:flex;flex-direction:column;background:var(--sapList_Background,#fff);border:1px solid var(--sapGroup_TitleBorderColor,#d9d9d9);border-radius:10px;box-shadow:0 16px 48px rgba(0,0,0,.3);overflow:hidden}
        .fx-head{display:flex;align-items:center;height:42px;padding:0 14px;font-weight:700;font-size:14px;border-bottom:1px solid var(--sapGroup_TitleBorderColor,#d9d9d9)}
        .fx-head .fx-x{margin-left:auto;cursor:pointer;color:var(--sapContent_LabelColor,#6a6d70);width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;border-radius:50%}
        .fx-head .fx-x:hover{background:var(--sapList_Hover_Background,#f0f1f2)}
        .fx-body{display:grid;grid-template-columns:230px minmax(0,1fr);min-height:0;flex:1;overflow:hidden}
        .fx-vars{border-right:1px solid var(--sapGroup_TitleBorderColor,#e5e5e5);overflow:auto;padding:8px 10px}
        .fx-sec-title{font-size:12px;font-weight:700;margin-bottom:6px}
        .fx-grp-title{font-size:11px;font-weight:700;color:var(--sapContent_LabelColor,#6a6d70);margin:8px 0 4px;text-transform:uppercase;letter-spacing:.03em}
        .fx-chips{display:flex;flex-wrap:wrap;gap:4px}
        .fx-var{font-size:11px;border:1px solid var(--sapButton_BorderColor,#0a6ed1);color:var(--sapButton_TextColor,#0a6ed1);background:transparent;border-radius:10px;padding:1px 8px;cursor:pointer;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .fx-var:hover{background:color-mix(in srgb, var(--sapInformationElementColor, #0a6ed1) 10%, transparent)}
        .fx-main{display:flex;flex-direction:column;min-width:0;padding:10px;overflow:auto}
        .fx-toolbar{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px}
        .fx-op{font-size:12px;font-weight:700;min-width:28px;height:26px;border:1px solid var(--sapField_BorderColor,#89919a);background:var(--sapButton_Background,#fff);border-radius:5px;cursor:pointer;color:var(--sapTextColor,#1d2d3e)}
        .fx-op:hover{background:var(--sapButton_Hover_Background,#f0f1f2)}
        .fx-expr{width:100%;min-height:90px;resize:vertical;border:1px solid var(--sapField_BorderColor,#89919a);border-radius:6px;padding:8px;font:13px/1.5 ui-monospace,Menlo,Consolas,monospace;color:var(--sapTextColor,#1d2d3e);background:var(--sapField_Background,#fff);box-sizing:border-box}
        .fx-status{font-size:12px;margin:6px 0;min-height:18px}
        .fx-status.ok{color:var(--sapPositiveTextColor,#107e3e)}
        .fx-status.bad{color:var(--sapNegativeTextColor,#bb0000)}
        .fx-fns{display:flex;flex-direction:column;gap:6px}
        .fx-fn-list{display:flex;flex-wrap:wrap;gap:4px}
        .fx-fn{font-size:11px;border:1px solid var(--sapGroup_TitleBorderColor,#d9d9d9);background:var(--sapList_Background,#fff);border-radius:5px;padding:2px 8px;cursor:pointer;color:var(--sapTextColor,#1d2d3e)}
        .fx-fn:hover{background:var(--sapList_Hover_Background,#f5f6f7);border-color:#0a6ed1}
        .fx-foot{display:flex;align-items:center;gap:8px;padding:10px 14px;border-top:1px solid var(--sapGroup_TitleBorderColor,#d9d9d9)}
        .fx-foot .spacer{flex:1}
        .fx-clear,.fx-cancel{font-size:12px;height:30px;padding:0 14px;border:1px solid var(--sapButton_BorderColor,#0a6ed1);background:transparent;color:var(--sapButton_TextColor,#0a6ed1);border-radius:6px;cursor:pointer}
        .fx-ok{font-size:12px;height:30px;padding:0 16px;border:0;background:var(--sapButton_Emphasized_Background,#0a6ed1);color: #fff;border-radius:6px;cursor:pointer;font-weight:700}
        .fx-ok.disabled{opacity:.5;cursor:not-allowed}
        .rule-row{cursor:pointer}
        .dim-row{cursor:pointer}
        .rule-row.selected{background:var(--cmx-selection-bg)}
        /* 表树形下拉 popup（新增/更换面板关联表）：锚定触发按钮下方 */
        .tp-backdrop{position:fixed;inset:0;z-index:50;background:transparent}
        .tp-pop{position:fixed;width:320px;max-width:90vw;max-height:60vh;display:flex;flex-direction:column;background:var(--sapList_Background,#fff);border:1px solid var(--sapGroup_TitleBorderColor,#d9d9d9);border-radius:8px;box-shadow:0 8px 28px rgba(0,0,0,.22);overflow:hidden}
        .tp-head{display:flex;align-items:center;height:36px;padding:0 12px;font-weight:700;font-size:12px;color:var(--sapContent_LabelColor,#6a6d70);border-bottom:1px solid var(--sapGroup_TitleBorderColor,#d9d9d9)}
        .tp-head .tp-x{margin-left:auto;cursor:pointer;color:var(--sapContent_LabelColor,#6a6d70);font-size:13px;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;border-radius:50%}
        .tp-head .tp-head-link{border:0;background:transparent;color:var(--sapLinkColor,#0a6ed1);font-weight:700;font-size:12px;cursor:pointer;padding:0;text-align:left}
        .tp-head .tp-head-link:hover{text-decoration:underline}
        .tp-head .tp-x:hover{background:var(--sapList_Hover_Background,#f0f1f2)}
        .tp-list{overflow:auto;padding:4px}
        .tp-level{display:flex;align-items:center;gap:6px;padding:7px 8px 3px;font-size:11px;font-weight:700;color:var(--sapContent_LabelColor,#6a6d70);text-transform:uppercase;letter-spacing:.04em}
        .tp-level .tp-lv-code{font-weight:400;opacity:.7}
        .tp-table{display:flex;align-items:center;gap:8px;width:100%;text-align:left;border:0;background:transparent;border-radius:6px;padding:7px 10px 7px 22px;cursor:pointer;color:var(--sapTextColor,#1d2d3e);font-size:13px}
        .tp-table ui5-icon{width:16px;height:16px;color:var(--sapContent_IconColor,#6a6d70);flex:0 0 auto}
        .tp-table:hover{background:var(--sapList_Hover_Background,#f5f6f7)}
        .tp-table .tp-tname{font-weight:600}
        .tp-table .tp-tcode{color:var(--sapContent_LabelColor,#6a6d70);font-size:11px}
        .tp-table .tp-used{margin-left:auto;font-size:10px;color:var(--sapContent_LabelColor,#9aa0a6);border:1px solid var(--sapGroup_TitleBorderColor,#d9d9d9);border-radius:8px;padding:0 6px}
        .tp-table .tp-used.cur{color:var(--sapInformationElementColor, #0a6ed1);border-color:var(--sapLinkColor, #0a6ed1)}
        .tp-table .tp-refresh{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;color:var(--sapContent_IconColor,#6a6d70);cursor:pointer;flex:0 0 auto}
        .tp-table .tp-refresh:hover{background:var(--sapButton_Hover_Background,rgba(0,0,0,.06));color:#0a6ed1}
        .tp-table .tp-refresh ui5-icon{width:14px;height:14px;pointer-events:none}
        .tp-table.current{background:var(--cmx-selection-bg-soft)}
        .tp-table.disabled{opacity:.5;cursor:not-allowed}
        .tp-table.disabled:hover{background:transparent}
        .tp-empty{padding:16px 14px;font-size:12px;color:var(--sapContent_LabelColor,#6a6d70);line-height:1.6}
        .form-grid{display:grid;grid-template-columns:90px minmax(0,1fr) 90px minmax(0,1fr);gap:8px;padding:10px;align-items:center}
        .form-grid label{font-size:12px;color:var(--sapContent_LabelColor,#6a6d70)}
        table{width:100%;border-collapse:collapse;font-size:12px}
        th,td{border-bottom:1px solid var(--sapGroup_TitleBorderColor,#e5e5e5);padding:4px;vertical-align:middle}
        th{text-align:left;color:var(--sapContent_LabelColor,#6a6d70);font-weight:600;background:var(--sapList_HeaderBackground,#f7f7f7)}
        td input,td select{width:100%}
        th.idx,td.idx{width:36px;text-align:center;color:var(--sapContent_LabelColor,#6a6d70);font-variant-numeric:tabular-nums;user-select:none}
        select{height:28px;border:1px solid var(--sapField_BorderColor,#89919a);border-radius:4px;padding:0 6px;background:var(--sapField_Background,#fff);color:var(--sapField_TextColor,var(--sapTextColor,#1d2d3e));box-sizing:border-box}
        select option{background:var(--sapField_Background,#fff);color:var(--sapField_TextColor,var(--sapTextColor,#1d2d3e))}
        /* 维度属性多选下拉（自绘）：摘要按钮 + 绝对定位浮层 */
        td.ms-cell{position:relative;overflow:visible}
        .ms{position:relative;width:100%}
        .ms-head{display:flex;align-items:center;gap:4px;width:100%;height:28px;border:1px solid var(--sapField_BorderColor,#89919a);border-radius:4px;padding:0 6px;background:var(--sapField_Background,#fff);color:var(--sapField_TextColor,var(--sapTextColor,#1d2d3e));cursor:pointer;box-sizing:border-box;text-align:left}
        .ms.open .ms-head{border-color:var(--sapField_Focus_BorderColor,#0a6ed1)}
        .ms-val{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}
        .ms-ph{color:var(--sapContent_LabelColor,#9aa0a6)}
        .ms-caret{flex:0 0 auto;color:var(--sapContent_LabelColor,#6a6d70);font-size:10px}
        .ms-pop{position:absolute;z-index:30;top:calc(100% + 2px);left:0;min-width:100%;max-width:260px;max-height:220px;overflow:auto;background:var(--sapList_Background,#fff);border:1px solid var(--sapGroup_TitleBorderColor,#d9d9d9);border-radius:6px;box-shadow:0 6px 18px rgba(0,0,0,.18);padding:4px}
        .ms-opt{display:flex;align-items:center;gap:6px;padding:4px 6px;border-radius:4px;cursor:pointer;font-size:12px;white-space:nowrap}
        .ms-opt:hover{background:var(--sapList_Hover_Background,#f5f6f7)}
        .ms-opt input{width:14px;height:14px;flex:0 0 auto;margin:0;accent-color:var(--sapInformationElementColor, #0a6ed1);cursor:pointer}
        .ms-empty{padding:6px 8px;font-size:11px;color:var(--sapContent_LabelColor,#6a6d70)}
        tr.selected{background:var(--cmx-selection-bg)}
        .cmx-field-row.sel,tr.selected{background:var(--cmx-selection-bg)}
        /* 行内操作按钮：原生 button + ui5-icon（轻量，替代 ui5-button，支撑大行数） */
        .icon-btn{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--sapContent_IconColor,var(--sapContent_NonInteractiveIconColor,#6a6d70));cursor:pointer;transition:background-color .12s,color .12s;vertical-align:middle}
        .icon-btn ui5-icon{width:16px;height:16px;pointer-events:none}
        .icon-btn:hover{background:var(--sapButton_Hover_Background,rgba(0,0,0,.06));color:var(--sapHighlightColor,#0070f2)}
        .icon-btn:active{background:var(--sapButton_Active_Background,rgba(0,0,0,.12))}
        .icon-btn:focus-visible{outline:none;box-shadow:0 0 0 2px var(--sapContent_FocusColor,var(--sapHighlightColor,#0070f2))}
        .icon-btn.danger:hover{background:var(--sapButton_Reject_Hover_Background,rgba(187,0,0,.1));color:var(--sapNegativeColor,#bb0000)}
        .icon-btn[disabled]{opacity:.4;cursor:default;background:transparent;color:var(--sapContent_NonInteractiveIconColor,#6a6d70)}
        /* 选中行内图标按钮与高亮背景对比，保证可见 */
        tr.selected .icon-btn,.cmx-field-row.sel .icon-btn{color:var(--sapTextColor,#1d2d3e)}
        .icon-btn.on{color:var(--sapPositiveColor,#107e3e)}
        .mini{height:26px;min-width:28px}
        .inspector{border-left:1px solid var(--sapGroup_TitleBorderColor,#d9d9d9);display:flex;flex-direction:column;min-width:0;min-height:0;background:var(--sapGroup_ContentBackground,#fafafa)}
        .inspect-body{padding:12px;overflow:auto;min-height:0;display:flex;flex-direction:column;gap:12px}
        .section{border:1px solid var(--sapGroup_TitleBorderColor,#d9d9d9);border-radius:6px;background:var(--sapTile_Background,#fff);padding:10px}
        .section h3{margin:0 0 8px;font-size:13px}
        .kv{display:grid;grid-template-columns:88px minmax(0,1fr);gap:6px;font-size:12px;align-items:center}
        .kv label{color:var(--sapContent_LabelColor,#6a6d70)}
        input{min-width:0;height:28px;border:1px solid var(--sapField_BorderColor,#89919a);border-radius:4px;padding:0 8px;background:var(--sapField_Background,#fff);color:inherit;box-sizing:border-box}
        pre{margin:0;white-space:pre-wrap;overflow:auto;font-size:11px;line-height:1.45;max-height:260px}
        .msg{font-size:12px;color:var(--sapContent_LabelColor,#6a6d70);padding:0 12px 8px}
        .fc-strip{display:block;margin:0 12px 8px}
        .bad{color:var(--sapNegativeTextColor,#bb0000)}
        .ok{color:var(--sapPositiveTextColor,#107e3e)}
        .insp-tabs{height:34px;display:flex;align-items:end;gap:2px;padding:0 8px;border-bottom:1px solid var(--sapGroup_TitleBorderColor,#d9d9d9);flex-shrink:0}
        .cmx-field-row{cursor:pointer}
        .cmx-field-row.sel{background:var(--cmx-selection-bg)}
        .insp-grid{display:grid;grid-template-columns:96px minmax(0,1fr);gap:6px 8px;font-size:12px;align-items:center}
        .insp-grid label{color:var(--sapContent_LabelColor,#6a6d70)}
        .insp-grid input,.insp-grid select,.insp-grid textarea{width:100%;box-sizing:border-box}
        .insp-grid .full{grid-column:1/-1}
        .insp-grid input[type=checkbox]{width:auto;height:auto}
        .sub-h{font-size:11px;font-weight:700;color:var(--sapContent_LabelColor,#6a6d70);text-transform:uppercase;letter-spacing:.04em;margin:4px 0 2px;grid-column:1/-1}
        .vrow{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) 28px;gap:6px;align-items:center;margin-bottom:4px}
        .insp-section{border:1px solid var(--sapGroup_TitleBorderColor,#d9d9d9);border-radius:6px;padding:8px 10px;margin-bottom:8px}
        .insp-section>.sub-h{margin:0 0 6px;text-transform:none;font-size:12px;color:var(--sapTextColor,#1d2d3e)}
        .insp-full{grid-column:1/-1}
        .cmx-fld-ro{color:var(--sapContent_LabelColor,#6a6d70)}
        .grp{border:1px dashed var(--sapField_BorderColor,#89919a);border-radius:6px;padding:8px;margin:6px 0;background:var(--sapList_Background,#fff)}
        .grp-head{display:flex;align-items:center;gap:6px;margin-bottom:6px}
        .grp-members{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}
        .chip{display:inline-flex;align-items:center;gap:4px;font-size:11px;background:var(--cmx-selection-bg-soft);border:1px solid var(--cmx-selection-border);border-radius:10px;padding:1px 6px}
        .chip button{border:0;background:transparent;cursor:pointer;color:var(--sapNegativeTextColor,#bb0000);font-size:12px;line-height:1;padding:0}
        .agg-row{display:flex;flex-wrap:wrap;gap:8px;font-size:11px;align-items:center}
        .agg-row label{display:inline-flex;align-items:center;gap:3px;color:var(--sapTextColor,#1d2d3e)}
        /* 自绘 checkbox：避免亮色主题下浏览器原生黑方块 */
        input[type=checkbox]{-webkit-appearance:none;appearance:none;width:16px;height:16px;min-width:16px;flex:none;margin:0;padding:0;border:1px solid var(--sapField_BorderColor,#89919a);border-radius:3px;background:var(--sapField_Background,#fff);cursor:pointer;vertical-align:middle;position:relative}
        input[type=checkbox]:checked{background:var(--sapInformationElementColor, #0a6ed1);border-color:var(--sapInformationElementColor, #0a6ed1)}
        input[type=checkbox]:checked::after{content:"";position:absolute;left:4px;top:1px;width:4px;height:8px;border:solid var(--sapGroup_ContentBorderColor, #ffffff);border-width:0 2px 2px 0;transform:rotate(45deg)}
`
