import { CM_RESIZE_HOST_CLASS } from '../../utils/codemirror-resize.js';

/**
 * 「对外接口」面板骨架：左侧固定分组列表（由 page-interface-registry 驱动渲染），
 * 右侧单一编辑区（启用开关 + 契约提示 + 同款 JS CodeMirror 工具栏 + 函数体编辑器）。
 *
 * 与「函数」「服务」面板的主从布局一致（`.page-split` / `.sidebar-list` / `.page-split-detail`）。
 */
export const IFACE_PANE_TEMPLATE = `
      <!-- 对外接口面板：左侧预置接口分组 + 右侧单一编辑区 -->
      <div id="ifacePane" class="pane">
        <div class="panel-toolbar">
          <span>对外接口（宿主可调方法）</span>
          <span class="iface-toolbar-hint">预置契约；勾选启用后可自定义实现，未启用走默认值</span>
        </div>
        <div id="ifaceSplit" class="page-split">
          <aside class="page-split-sidebar" aria-label="接口列表">
            <div class="sidebar-list" id="ifaceList"></div>
          </aside>
          <div class="page-split-detail">
            <div id="ifaceDetailEmpty" class="empty-hint subtle" hidden>在左侧选择一个接口</div>
            <div id="ifaceDetailForm" hidden>
              <div class="iface-head-row">
                <div class="iface-head-title">
                  <span id="ifaceDetailName" class="iface-head-name"></span>
                  <span id="ifaceDetailSig" class="iface-head-sig"></span>
                </div>
                <label class="iface-enable-switch">
                  <input type="checkbox" id="ifaceDetailEnabled" />
                  <span>启用自定义实现</span>
                </label>
              </div>
              <div id="ifaceDetailDesc" class="iface-detail-desc"></div>
              <div id="ifaceDetailContract" class="iface-detail-contract"></div>
              <div class="script-cm-head-row">
                <ui5-label class="script-cm-head-label" wrapping-type="Normal" show-colon="false">实现</ui5-label>
                <div class="toolbar page-data-js-cm-toolbar" role="toolbar" aria-label="接口实现编辑">
                  <ui5-button id="ifaceCmTbApply" design="Emphasized" icon="accept" title="同步到页面并刷新源码预览"></ui5-button>
                  <div class="tb-sep"></div>
                  <ui5-button id="ifaceCmTbCopy" design="Transparent" icon="copy" title="复制全部"></ui5-button>
                  <ui5-button id="ifaceCmTbPaste" design="Transparent" icon="paste" title="从剪贴板粘贴（替换全文）"></ui5-button>
                  <div class="tb-sep"></div>
                  <ui5-button id="ifaceCmTbIndent" design="Transparent" icon="indent" title="增加缩进"></ui5-button>
                  <ui5-button id="ifaceCmTbOutdent" design="Transparent" icon="outdent" title="减少缩进"></ui5-button>
                  <div class="tb-sep"></div>
                  <ui5-button id="ifaceCmTbFormat" design="Transparent" icon="source-code" title="按语法重新缩进"></ui5-button>
                  <div class="tb-sep"></div>
                  <ui5-button id="ifaceCmTbResetDefault" design="Transparent" icon="undo" title="恢复为默认实现"></ui5-button>
                  <div class="tb-sep"></div>
                  <ui5-button id="ifaceInsertDebuggerBtn" design="Transparent" icon="developer-settings" tooltip="在光标处插入 debugger;">插入 debugger</ui5-button>
                </div>
              </div>
              <div id="ifaceDetailCmHost" class="fn-cm-host ${CM_RESIZE_HOST_CLASS}"></div>
            </div>
          </div>
        </div>
      </div>
    `;
