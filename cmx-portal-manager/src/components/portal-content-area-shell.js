import { PORTAL_TAB_OVERFLOW_STYLES } from '../lib/tab-strip-overflow.js'
import { DROP_TARGET_CLASS } from '../lib/workspace-dock-layout.js'
import { PORTAL_NEO_DROP_TARGET, PORTAL_NEO_TAB_CHROME } from '../lib/portal-neo-theme.js'
import {
  PORTAL_CONTENT_EMPTY_STYLES,
  createContentEmptyStateMarkup,
} from '../lib/portal-content-empty-state.js'

export const SHOW_WELCOME_KEY = 'cmx_portal_show_welcome'

export function getShowWelcomeOnStartup () {
  try { return localStorage.getItem(SHOW_WELCOME_KEY) !== 'false' } catch { return true }
}

export function setShowWelcomeOnStartup (val) {
  try { localStorage.setItem(SHOW_WELCOME_KEY, val ? 'true' : 'false') } catch { /* ignore */ }
}

/* WELCOME_CONTENT 已迁到 html_pages（_legacy/welcome.html, id=welcome）。 */

export function createContentAreaTemplate () {
  return `
    <style>
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
        background: var(--portal-workspace-bg, var(--sapBackgroundColor, #f5f6f7));
      }
      ${PORTAL_NEO_TAB_CHROME}
      .tab-bar-row {
        --portal-tab-row-bg: var(--sapObjectHeader_Background, #fff);
        display: flex;
        flex-direction: row;
        align-items: stretch;
        flex-shrink: 0;
        height: 35px;
        min-width: 0;
        background: var(--portal-tab-row-bg);
        border-bottom: 1px solid var(--neo-border-subtle, var(--sapGroup_TitleBorderColor, #ddd));
        box-shadow: 0 1px 0 color-mix(in srgb, var(--neo-cyan, #00b4d8) 8%, transparent);
      }
      /* 标签栏尾部的停靠面板切换：属性/日志面板关闭后唯一的可见重开入口（另 Ctrl+P / Ctrl+J） */
      .portal-dock-toggles { display: flex; align-items: stretch; flex: 0 0 auto; }
      .portal-dock-toggle {
        display: inline-flex; align-items: center; justify-content: center;
        width: 30px; border: 0; background: transparent; cursor: pointer;
        color: var(--sapContent_LabelColor, #6a6d70);
      }
      .portal-dock-toggle:hover { background: var(--sapButton_Hover_Background, rgba(0,0,0,.06)); color: var(--sapTextColor, #1d2d3e); }
      .portal-dock-toggle ui5-icon { width: 15px; height: 15px; pointer-events: none; }
      .tab-bar-strip {
        flex: 1 1 auto;
        min-width: 0;
        overflow: hidden;
        display: flex;
        align-items: stretch;
      }
      ${PORTAL_TAB_OVERFLOW_STYLES}
      .tab-item {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 0 12px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
        color: var(--sapContent_LabelColor, #6a6d70);
        border-right: 1px solid var(--neo-border-subtle, var(--sapGroup_TitleBorderColor, #eee));
        white-space: nowrap;
        position: relative;
        user-select: none;
        min-width: 80px;
      }
      .tab-item:hover { background: var(--sapHoverColor, #f0f0f0); color: var(--sapTextColor, #333); }
      .tab-item.active {
        color: var(--neo-cyan, var(--sapTextColor, #333));
        background: color-mix(in srgb, var(--sapBackgroundColor, #f5f6f7) 94%, var(--neo-cyan, #00b4d8) 6%);
        border-bottom: 2px solid var(--neo-cyan, var(--sapHighlightColor, #0070f2));
      }
      .tab-item ui5-icon { width: 14px; height: 14px; flex-shrink: 0; }
      .tab-icon-stack {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        flex-shrink: 0;
      }
      .tab-icon-stack > ui5-icon { width: 14px; height: 14px; }
      .tab-dirty-dlg-body {
        padding: 16px 20px;
        font-size: 14px;
        line-height: 1.5;
        color: var(--sapTextColor, #333);
        max-width: 28rem;
      }
      .tab-dirty-dlg-footer {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .tab-close {
        width: 16px;
        height: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 3px;
        margin-left: 4px;
        opacity: 0.55;
        flex-shrink: 0;
        position: relative;
      }
      .tab-close:hover { background: rgba(0,0,0,0.12); opacity: 1; }
      .tab-close-inner {
        position: relative;
        width: 16px;
        height: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .tab-close-dot {
        position: absolute;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--sapTextColor, #32363a);
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.06s ease;
      }
      .tab-item.is-dirty .tab-close-dot {
        opacity: 0.92;
      }
      .tab-close-x {
        opacity: 1;
        transition: opacity 0.06s ease;
      }
      .tab-item.is-dirty .tab-close-x {
        opacity: 0;
        pointer-events: none;
      }
      .tab-item.is-dirty:hover .tab-close-dot {
        opacity: 0;
      }
      .tab-item.is-dirty:hover .tab-close-x {
        opacity: 1;
        pointer-events: auto;
      }
      .tab-close ui5-icon.tab-close-x { width: 12px; height: 12px; }
      .tab-body-wrap {
        flex: 1 1 auto;
        min-height: 0;
        position: relative;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .tab-body {
        flex: 1 1 auto;
        min-height: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        position: relative;
      }
      ${PORTAL_CONTENT_EMPTY_STYLES}
      .tab-pane {
        display: none;
        flex: 1 1 auto;
        min-height: 0;
        min-width: 0;
        width: 100%;
        overflow: auto;
      }
      .tab-pane.active {
        display: flex;
        flex-direction: column;
      }
      /* welcome page CSS 已迁到 html_pages 的 _legacy/welcome.html 里（内嵌 <style>），
         此处仅保留 tab 拖拽/拖放相关样式。 */
      .cmx-ws-tab-btn { cursor: grab; }
      .cmx-ws-tab-btn:active { cursor: grabbing; }
      /* Tab 标签拖拽重排：dragging 状态半透明，插入指示线在前/后边 */
      .cmx-tab-reorder-dragging { opacity: 0.5; }
      .cmx-tab-reorder-target-before { box-shadow: inset 2px 0 0 var(--neo-cyan, var(--sapHighlightColor, #0070f2)); }
      .cmx-tab-reorder-target-after  { box-shadow: inset -2px 0 0 var(--neo-cyan, var(--sapHighlightColor, #0070f2)); }
      .${DROP_TARGET_CLASS} {
        ${PORTAL_NEO_DROP_TARGET}
      }
    </style>
    <div class="tab-bar-row" id="tab-bar-row">
      <div class="tab-bar-strip" id="tab-bar-strip"></div>
      <div class="portal-tab-overflow-wrap" id="tab-bar-overflow-wrap" style="display:none">
        <button type="button" class="portal-tab-overflow-trigger" id="tab-bar-overflow-btn" aria-label="更多标签" title="更多标签">
          <ui5-icon name="slim-arrow-down"></ui5-icon>
        </button>
      </div>
      <div class="portal-dock-toggles">
        <button type="button" class="portal-dock-toggle" id="dock-toggle-property" aria-label="属性面板" title="属性面板（Ctrl+P）">
          <ui5-icon name="detail-view"></ui5-icon>
        </button>
      </div>
    </div>
    <div class="tab-body-wrap" id="tab-body-wrap">
      <div class="tab-body" id="tab-body"></div>
      ${createContentEmptyStateMarkup()}
    </div>
    <div id="model-region-host" style="display:none;position:absolute;width:0;height:0;overflow:hidden;pointer-events:none" aria-hidden="true"></div>
    <div id="inner-region-host" style="display:none;position:absolute;width:0;height:0;overflow:hidden;pointer-events:none" aria-hidden="true"></div>
    <div id="embed-region-host" style="display:none;position:absolute;width:0;height:0;overflow:hidden;pointer-events:none" aria-hidden="true"></div>
    <ui5-menu id="tab-overflow-menu" horizontal-align="End"></ui5-menu>
    <ui5-menu id="tab-ctx-menu" horizontal-align="End">
      <ui5-menu-item id="ctx-m-refresh" text="刷新页面" icon="refresh" data-action="refresh"></ui5-menu-item>
      <ui5-menu-separator></ui5-menu-separator>
      <ui5-menu-item id="ctx-m-close" text="关闭" icon="decline" data-action="close"></ui5-menu-item>
      <ui5-menu-separator></ui5-menu-separator>
      <ui5-menu-item id="ctx-m-close-others" text="关闭其他" icon="duplicate" data-action="close-others"></ui5-menu-item>
      <ui5-menu-item id="ctx-m-close-left" text="关闭左侧" icon="navigation-left-arrow" data-action="close-left"></ui5-menu-item>
      <ui5-menu-item id="ctx-m-close-right" text="关闭右侧" icon="navigation-right-arrow" data-action="close-right"></ui5-menu-item>
      <ui5-menu-separator></ui5-menu-separator>
      <ui5-menu-item id="ctx-m-close-saved" text="关闭已保存" icon="accept" data-action="close-saved"></ui5-menu-item>
      <ui5-menu-item id="ctx-m-close-all" text="关闭全部" icon="clear-all" data-action="close-all"></ui5-menu-item>
      <ui5-menu-separator id="ctx-m-ws-sep"></ui5-menu-separator>
      <ui5-menu-item id="ctx-m-ws-save-layout" text="保存视图位置" icon="save" data-action="ws-save-layout"></ui5-menu-item>
      <ui5-menu-item id="ctx-m-ws-reset-layout" text="重置视图位置" icon="reset" data-action="ws-reset-layout"></ui5-menu-item>
      <ui5-menu-separator id="ctx-m-edit-html-sep"></ui5-menu-separator>
      <ui5-menu-item id="ctx-m-edit-html-page" text="在 HTML 设计器中编辑" icon="edit" data-action="edit-html-page"></ui5-menu-item>
      <ui5-menu-item id="ctx-m-edit-model-page" text="编辑模型页面" icon="database" data-action="edit-model-page"></ui5-menu-item>
    </ui5-menu>
    <ui5-dialog id="tab-dirty-close-dialog" header-text="关闭标签">
      <div class="tab-dirty-dlg-body">当前标签内容已修改。是否保存后再关闭？</div>
      <div slot="footer" class="tab-dirty-dlg-footer">
        <ui5-button id="dirty-close-cancel" design="Transparent">取消</ui5-button>
        <ui5-button id="dirty-close-discard" design="Negative">不保存</ui5-button>
        <ui5-button id="dirty-close-save" design="Emphasized" icon="save">保存并关闭</ui5-button>
      </div>
    </ui5-dialog>
  `
}
