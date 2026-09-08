import { CM_RESIZE_HOST_CLASS } from '../../utils/codemirror-resize.js';
import { PAGE_DATA_SCRIPT_API_HINT_SNIPPET } from './page-data-script-api-hint-html.js';
import { IFACE_PANE_TEMPLATE } from './iface-pane-template.js';

/** <designer-page-data> Shadow DOM 主体 */
export const DESIGNER_PAGE_DATA_SHELL_TEMPLATE = `
      <!-- 数据变量面板 -->
      <div id="dataPane" class="pane active">
        <div class="panel-toolbar">
          <span>页面级变量</span>
          <ui5-button id="addDataBtn" design="Emphasized" icon="add">新增变量</ui5-button>
        </div>
        <table class="data-table">
          <thead>
            <tr>
              <th style="width:30%">变量名</th>
              <th style="width:22%">类型</th>
              <th>默认值</th>
              <th style="width:28px"></th>
            </tr>
          </thead>
          <tbody id="dataRows"></tbody>
        </table>
        <div id="dataEmpty" class="empty-hint">暂无变量，点击「新增变量」添加</div>
      </div>


      <!-- 模型面板 -->
      <div id="modelsPane" class="pane models-pane">
        <div class="panel-toolbar">
          <span>页面级模型</span>
          <span class="models-panel-hint">从左侧「CMX 模型」分组拖入实例</span>
        </div>

        <!-- 上 1/3：模型实例列表 + 拖放区 -->
        <div class="models-top-section">
          <div class="models-drop-zone" id="modelsDropZone">
              <div id="modelsInstanceList" class="models-instance-list"></div>
          </div>
          <div id="modelsEmpty" class="empty-hint">暂无模型实例，从左侧「CMX 模型」拖入</div>
        </div>

        <!-- 分隔线 -->
        <div class="models-divider"></div>

        <!-- 下 2/3：模型属性；事件统一在右侧 Property 视图区的事件面板编辑 -->
        <div class="models-bottom-section">
          <div class="models-props-tabs">
            <ui5-button class="mp-tab-btn active" data-mptab="modelsPropsTab" design="Transparent" icon="customize">属性</ui5-button>
          </div>
          <div id="modelsPropsTab" class="mp-tab-pane active">
            <div id="modelsPropsArea" class="models-props-area">
              <div class="models-props-empty">从上方选择一个模型实例来配置属性</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 函数面板：左侧列表 + 右侧单一编辑区 -->
      <div id="fnPane" class="pane">
        <div class="panel-toolbar">
          <span>页面级函数</span>
          <ui5-button id="addFnBtn" design="Emphasized" icon="add">新增函数</ui5-button>
        </div>
        <div id="fnGlobalEmpty" class="empty-hint">暂无函数，点击「新增函数」添加</div>
        <div id="fnSplit" class="page-split" style="display:none">
          <aside class="page-split-sidebar" aria-label="函数列表">
            <div class="sidebar-list" id="fnList"></div>
          </aside>
          <div class="page-split-detail">
            <div id="fnDetailEmpty" class="empty-hint subtle" hidden>在左侧选择一个函数</div>
            <div id="fnDetailForm" hidden>
              <div class="field-row">
                <ui5-label for="fnDetailName" wrapping-type="Normal" show-colon>函数名</ui5-label>
                <input id="fnDetailName" class="data-inp" placeholder="例如 handleClick" autocomplete="off" />
              </div>
              <div class="field-row">
                <ui5-label for="fnDetailParams" wrapping-type="Normal" show-colon>参数</ui5-label>
                <input id="fnDetailParams" class="data-inp" placeholder="例如 event, data" autocomplete="off" />
              </div>
              <div class="script-cm-head-row">
                <ui5-label class="script-cm-head-label" wrapping-type="Normal" show-colon="false">函数体</ui5-label>
                <div class="toolbar page-data-js-cm-toolbar" role="toolbar" aria-label="函数体编辑">
                  <ui5-button id="fnCmTbApply" design="Emphasized" icon="accept" title="同步到页面并刷新源码预览"></ui5-button>
                  <div class="tb-sep"></div>
                  <ui5-button id="fnCmTbCopy" design="Transparent" icon="copy" title="复制全部"></ui5-button>
                  <ui5-button id="fnCmTbPaste" design="Transparent" icon="paste" title="从剪贴板粘贴（替换全文）"></ui5-button>
                  <div class="tb-sep"></div>
                  <ui5-button id="fnCmTbIndent" design="Transparent" icon="indent" title="增加缩进"></ui5-button>
                  <ui5-button id="fnCmTbOutdent" design="Transparent" icon="outdent" title="减少缩进"></ui5-button>
                  <div class="tb-sep"></div>
                  <ui5-button id="fnCmTbFormat" design="Transparent" icon="source-code" title="按语法重新缩进"></ui5-button>
                  <div class="tb-sep"></div>
                  <ui5-button id="fnInsertDebuggerBtn" design="Transparent" icon="developer-settings" tooltip="在光标处插入 debugger;">插入 debugger</ui5-button>
                </div>
              </div>
              <div id="fnDetailCmHost" class="fn-cm-host ${CM_RESIZE_HOST_CLASS}"></div>
              <div class="field-row" style="align-items:flex-start;padding-top:2px;">
                <ui5-label wrapping-type="Normal" show-colon>读取变量</ui5-label>
                <div class="var-check-group fn-reads-vars" id="fnDetailReads"></div>
              </div>
              <div class="field-row" style="align-items:flex-start;">
                <ui5-label wrapping-type="Normal" show-colon>写入变量</ui5-label>
                <div class="var-check-group fn-writes-vars" id="fnDetailWrites"></div>
              </div>
              <div class="detail-footer-actions">
                <ui5-button id="fnDelCurrentBtn" design="Negative" icon="delete">删除当前函数</ui5-button>
              </div>
            </div>
          </div>
        </div>
        ${PAGE_DATA_SCRIPT_API_HINT_SNIPPET}
      </div>

      <!-- 服务面板：左侧列表 + 右侧单一编辑区 -->
      <div id="svcPane" class="pane">
        <div class="panel-toolbar">
          <span>页面服务定义</span>
          <span class="panel-toolbar-actions">
            <ui5-button id="pickSvcBtn" design="Attention" icon="search">从目录选择</ui5-button>
            <ui5-button id="addSvcBtn" design="Emphasized" icon="add">新增服务</ui5-button>
          </span>
        </div>
        <div id="svcGlobalEmpty" class="empty-hint">暂无服务，点击「新增服务」添加</div>
        <div id="svcSplit" class="page-split" style="display:none">
          <aside class="page-split-sidebar" aria-label="服务列表">
            <div class="sidebar-list" id="svcList"></div>
          </aside>
          <div class="page-split-detail">
            <div id="svcDetailEmpty" class="empty-hint subtle" hidden>在左侧选择一个服务</div>
            <div id="svcDetailForm" hidden>
              <div class="field-row">
                <ui5-label for="svcDetailName" wrapping-type="Normal" show-colon>服务名</ui5-label>
                <input id="svcDetailName" class="data-inp svc-name" placeholder="例如 getUsers" autocomplete="off" />
              </div>
              <div class="field-row">
                <ui5-label for="svcDetailType" wrapping-type="Normal" show-colon>类型</ui5-label>
                <select id="svcDetailType" class="data-inp svc-type">
                  <option value="rest">🌐 REST</option>
                  <option value="jsonrpc">⚡ JSON-RPC</option>
                  <option value="websocket">🔌 WebSocket</option>
                  <option value="graphql">💎 GraphQL</option>
                </select>
              </div>
              <div class="field-row">
                <ui5-label for="svcDetailUrl" wrapping-type="Normal" show-colon>URL</ui5-label>
                <input id="svcDetailUrl" class="data-inp svc-url" placeholder="https://api.example.com/path" autocomplete="off" />
              </div>
              <div class="field-row svc-rest-row">
                <ui5-label for="svcDetailMethod" wrapping-type="Normal" show-colon>HTTP 方法</ui5-label>
                <select id="svcDetailMethod" class="data-inp svc-method">
                  <option value="GET">🔍 GET</option>
                  <option value="POST">➕ POST</option>
                  <option value="PUT">🔄 PUT</option>
                  <option value="PATCH">✏️ PATCH</option>
                  <option value="DELETE">🗑️ DELETE</option>
                </select>
              </div>
              <div class="field-row svc-rpc-row">
                <ui5-label for="svcDetailRpc" wrapping-type="Normal" show-colon>RPC 方法名</ui5-label>
                <input id="svcDetailRpc" class="data-inp svc-rpc-method" placeholder="例如 user.list" autocomplete="off" />
              </div>
              <div class="field-row svc-graphql-op-row">
                <ui5-label for="svcDetailGqlOp" wrapping-type="Normal" show-colon>GraphQL 操作名</ui5-label>
                <input id="svcDetailGqlOp" class="data-inp svc-gql-op" placeholder="可选，例如 GetUsers" autocomplete="off" />
              </div>
              <div class="svc-graphql-query-row" style="display:flex;flex-direction:column;gap:4px">
                <ui5-label for="svcDetailGqlQuery" wrapping-type="Normal" show-colon="false">GraphQL Query / Mutation</ui5-label>
                <textarea id="svcDetailGqlQuery" class="fn-body-editor svc-gql-query" rows="4" placeholder="query GetUsers($id: ID!) { user(id: $id) { id name } }"></textarea>
              </div>
              <div class="svc-non-ws-row" style="display:flex;flex-direction:column;gap:4px">
                <ui5-label for="svcDetailHeaders" wrapping-type="Normal" show-colon="false">请求头 (JSON)</ui5-label>
                <textarea id="svcDetailHeaders" class="fn-body-editor svc-headers" rows="2" placeholder='{"Content-Type":"application/json"}'></textarea>
              </div>
              <div class="svc-body-row" style="display:flex;flex-direction:column;gap:4px">
                <ui5-label for="svcDetailBody" wrapping-type="Normal" show-colon="false">请求体模板 (JSON)</ui5-label>
                <textarea id="svcDetailBody" class="fn-body-editor svc-body-tmpl" rows="2" placeholder='{"key":"value"}'></textarea>
              </div>
              <div class="field-row svc-resp-mapping-row">
                <ui5-label for="svcDetailRespTo" wrapping-type="Normal" show-colon>响应存入变量</ui5-label>
                <select id="svcDetailRespTo" class="data-inp svc-resp-to">
                  <option value="">— 不存储 —</option>
                </select>
              </div>
              <div class="svc-resp-transform-row" style="display:flex;flex-direction:column;gap:4px">
                <div class="script-cm-head-row">
                  <ui5-label class="script-cm-head-label" wrapping-type="Normal" show-colon="false">响应转换脚本</ui5-label>
                  <div class="toolbar page-data-js-cm-toolbar" role="toolbar" aria-label="响应转换脚本编辑">
                    <ui5-button id="svcCmTbApply" design="Emphasized" icon="accept" title="同步到页面并刷新源码预览"></ui5-button>
                    <div class="tb-sep"></div>
                    <ui5-button id="svcCmTbCopy" design="Transparent" icon="copy" title="复制全部"></ui5-button>
                    <ui5-button id="svcCmTbPaste" design="Transparent" icon="paste" title="从剪贴板粘贴（替换全文）"></ui5-button>
                    <div class="tb-sep"></div>
                    <ui5-button id="svcCmTbIndent" design="Transparent" icon="indent" title="增加缩进"></ui5-button>
                    <ui5-button id="svcCmTbOutdent" design="Transparent" icon="outdent" title="减少缩进"></ui5-button>
                    <div class="tb-sep"></div>
                    <ui5-button id="svcCmTbFormat" design="Transparent" icon="source-code" title="按语法重新缩进"></ui5-button>
                    <div class="tb-sep"></div>
                    <ui5-button id="svcInsertDebuggerBtn" design="Transparent" icon="developer-settings" tooltip="在光标处插入 debugger;">插入 debugger</ui5-button>
                  </div>
                </div>
                <div id="svcDetailCmHost" class="fn-cm-host svc-cm-transform ${CM_RESIZE_HOST_CLASS}"></div>
              </div>
              <div class="detail-footer-actions">
                <ui5-button id="svcDelCurrentBtn" design="Negative" icon="delete">删除当前服务</ui5-button>
              </div>
            </div>
          </div>
        </div>
        ${PAGE_DATA_SCRIPT_API_HINT_SNIPPET}
      </div>

      ${IFACE_PANE_TEMPLATE}

      <!-- 数据流图面板 -->
      <div id="flowPane" class="pane">
        <div class="flow-toolbar">
          <span>数据流图</span>
          <ui5-button id="refreshFlowBtn" icon="refresh" design="Transparent">刷新</ui5-button>
        </div>
        <div id="flowDiagram"></div>
      </div>

      <!-- 测试运行器面板 -->
      <div id="testPane" class="pane">
        <div class="panel-toolbar">
          <span>测试运行器</span>
        </div>
        <div class="field-row">
          <ui5-label>类型</ui5-label>
          <select class="data-inp" id="testTypeSelect">
            <option value="fn">函数</option>
            <option value="svc">服务</option>
          </select>
        </div>
        <div class="field-row">
          <ui5-label>目标</ui5-label>
          <select class="data-inp" id="testTargetSelect">
            <option value="">— 请选择 —</option>
          </select>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px">
          <ui5-label>参数 (JSON)</ui5-label>
          <textarea class="fn-body-editor" id="testParamsInput" rows="4" placeholder='{"key": "value"}'>{}</textarea>
        </div>
        <div class="test-run-row">
          <ui5-button id="testRunBtn" design="Emphasized" icon="simulate">运行</ui5-button>
          <div class="test-status">
            <div class="test-status-dot" id="testStatusDot"></div>
            <span id="testStatusText">就绪</span>
          </div>
        </div>
        <div class="test-section-title">返回值</div>
        <div class="test-result-box" id="testResultBox">（尚未运行）</div>
      </div>

      <!-- 依赖库面板 -->
      <div id="depsPane" class="pane">
        <div class="panel-toolbar">
          <span>外部依赖库</span>
          <ui5-button id="addDepBtn" design="Emphasized" icon="add">新增依赖</ui5-button>
        </div>
        <div class="card-list" id="depList"></div>
        <div id="depsEmpty" class="empty-hint">暂无依赖，点击「新增依赖」添加外部 JS 库</div>
      </div>
    `;
