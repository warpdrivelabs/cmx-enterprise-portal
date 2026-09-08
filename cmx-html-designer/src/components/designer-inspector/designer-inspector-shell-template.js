/** <designer-inspector> Shadow DOM 主体 HTML */
export const DESIGNER_INSPECTOR_SHELL_TEMPLATE = `
      <div id="nodeBadge" class="node-badge empty">当前未选中元素</div>
      <div class="tab-area">
        <div class="tab-bar">
          <ui5-button class="tab-btn active" data-tab="attrPanel" design="Transparent" icon="customize">属性</ui5-button>
          <ui5-button class="tab-btn" data-tab="stylePanel" design="Transparent" icon="palette">样式</ui5-button>
          <ui5-button class="tab-btn" data-tab="eventPanel" design="Transparent" icon="bell">事件</ui5-button>
          <ui5-button class="tab-btn" data-tab="debugPanel" design="Transparent" icon="wrench">调试</ui5-button>
        </div>
        <div id="attrPanel" class="tab-panel active">
          <p style="color:var(--sapContent_NonInteractiveIconColor);font-size:12px">请先在设计区选中一个元素</p>
        </div>
        <div id="stylePanel" class="tab-panel">
          <p style="color:var(--sapContent_NonInteractiveIconColor);font-size:12px">请先在设计区选中一个元素</p>
        </div>
        <div id="eventPanel" class="tab-panel">
          <p style="color:var(--sapContent_NonInteractiveIconColor);font-size:12px">请先在设计区选中一个元素</p>
        </div>
        <div id="debugPanel" class="tab-panel">
          <div class="debug-log-toolbar">
            <div class="debug-log-toolbar-main">
              <ui5-title level="H6">调试日志</ui5-title>
              <div class="debug-console-mirror-row" title="按级别将浏览器控制台输出同步到下方日志">
                <span class="debug-mirror-item">
                  <ui5-label for="consoleMirrorLog" wrapping-type="None" class="debug-mirror-label debug-mirror-label--log">log</ui5-label>
                  <ui5-switch id="consoleMirrorLog" checked class="debug-mirror-switch"></ui5-switch>
                </span>
                <span class="debug-mirror-item">
                  <ui5-label for="consoleMirrorWarn" wrapping-type="None" class="debug-mirror-label debug-mirror-label--warn">warn</ui5-label>
                  <ui5-switch id="consoleMirrorWarn" checked class="debug-mirror-switch"></ui5-switch>
                </span>
                <span class="debug-mirror-item">
                  <ui5-label for="consoleMirrorError" wrapping-type="None" class="debug-mirror-label debug-mirror-label--error">error</ui5-label>
                  <ui5-switch id="consoleMirrorError" checked class="debug-mirror-switch"></ui5-switch>
                </span>
              </div>
            </div>
            <ui5-button id="clearDebugLogBtn" design="Transparent" icon="delete">清空日志区</ui5-button>
          </div>
          <div class="debug-log" id="debugLog" role="log" aria-live="polite"></div>
        </div>
      </div>
    `;
