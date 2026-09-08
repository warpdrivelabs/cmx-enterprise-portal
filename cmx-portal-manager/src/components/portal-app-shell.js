import { PORTAL_NEO_SPLITTER_STYLES } from '../lib/portal-neo-theme.js'

/**
 * Returns the Shadow DOM template string (CSS + HTML) for the portal shell.
 */
export function createShellTemplate () {
  return `
    <style>
      /*
       * 三段网格：顶栏 / 中区 / 状态栏。
       * 中间行用 minmax(0,1fr) 压住子树 min-height:auto 导致的外溢（状态栏被顶出视窗或跑偏）。
       */
      :host {
        display: grid;
        grid-template-rows: auto minmax(0, 1fr) auto;
        grid-template-columns: minmax(0, 1fr);
        box-sizing: border-box;
        width: 100%;
        height: 100%;
        min-height: 0;
        overflow: hidden;
      }

      .shell-row {
        grid-column: 1;
        grid-row: 1;
        z-index: 10;
        display: block;
        min-height: 0;
      }

      .body-row {
        grid-column: 1;
        grid-row: 2;
        display: flex;
        flex-direction: row;
        flex: 1 1 auto;
        min-height: 0;
        min-width: 0;
        overflow: hidden;
      }

      portal-activity-bar {
        flex: 0 0 48px;
        z-index: 5;
      }

      /* Workspace — 必须与 center-pane 一样可以纵向收缩 */
      .workspace {
        flex: 1 1 auto;
        display: flex;
        flex-direction: row;
        min-width: 0;
        min-height: 0;
        overflow: hidden;
        background: var(--portal-workspace-bg, var(--sapBackgroundColor, #f5f6f7));
        position: relative;
      }

      .workspace::before {
        content: '';
        position: absolute;
        inset: 0;
        pointer-events: none;
        opacity: 0.4;
        background-image:
          linear-gradient(color-mix(in srgb, var(--neo-cyan, #00b4d8) 5%, transparent) 1px, transparent 1px),
          linear-gradient(90deg, color-mix(in srgb, var(--neo-cyan, #00b4d8) 5%, transparent) 1px, transparent 1px);
        background-size: 40px 40px;
        mask-image: radial-gradient(ellipse 85% 75% at 50% 45%, #000 15%, transparent 70%);
      }

      .workspace > * {
        position: relative;
        z-index: 1;
      }

      .sidenav-pane {
        flex: 0 0 var(--sidenav-width, 240px);
        min-width: 0;
        min-height: 0;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        transition: flex-basis 0s;
      }
      .sidenav-pane[data-hidden] {
        flex-basis: 0 !important;
        display: none;
      }

      .center-pane {
        flex: 1 1 auto;
        display: flex;
        flex-direction: column;
        min-width: 0;
        min-height: 0;
        overflow: hidden;
      }

      .content-pane {
        flex: 1 1 auto;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        min-height: 0;
      }

      .content-pane portal-content-area,
      .log-pane portal-log-panel,
      .property-pane portal-property-panel,
      .sidenav-pane portal-side-nav {
        flex: 1 1 auto;
        min-height: 0;
        min-width: 0;
        align-self: stretch;
      }

      .log-pane {
        flex: 0 0 var(--log-height, 200px);
        min-height: 0;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }
      .log-pane[data-hidden] {
        flex-basis: 0 !important;
        display: none;
      }

      .property-pane {
        flex: 0 0 var(--property-width, 300px);
        min-width: 0;
        min-height: 0;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }
      .property-pane[data-hidden] {
        flex-basis: 0 !important;
        display: none;
      }

      .status-row {
        grid-column: 1;
        grid-row: 3;
        z-index: 10;
        display: block;
        min-height: 0;
      }

      /* Splitters */
      ${PORTAL_NEO_SPLITTER_STYLES}

      /* 准备对话框已挂到 document.body，样式见 src/app-shell.css */
    </style>

    <div class="shell-row">
      <portal-shellbar primary-title="CMX Enterprise Portal"></portal-shellbar>
    </div>

    <div class="body-row">
      <portal-activity-bar></portal-activity-bar>

      <div class="workspace">
        <!-- Side navigation -->
        <div class="sidenav-pane" id="sidenav-pane">
          <portal-side-nav view="explorer"></portal-side-nav>
        </div>

        <div class="splitter splitter-v" id="splitter-left"></div>

        <!-- Center: content + log -->
        <div class="center-pane">
          <div class="content-pane">
            <portal-content-area id="content-area"></portal-content-area>
          </div>

          <div class="splitter splitter-h" id="splitter-bottom"></div>

          <div class="log-pane" id="log-pane">
            <portal-log-panel id="log-panel"></portal-log-panel>
          </div>
        </div>

        <div class="splitter splitter-v" id="splitter-right"></div>

        <!-- Property panel -->
        <div class="property-pane" id="property-pane">
          <portal-property-panel id="property-panel"></portal-property-panel>
        </div>
      </div>
    </div>

    <div class="status-row">
      <portal-status-bar id="status-bar"></portal-status-bar>
    </div>

    <portal-workspace-float-window id="workspace-float-window"></portal-workspace-float-window>
  `
}
