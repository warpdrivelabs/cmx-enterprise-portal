/** <designer-app> Shadow DOM 主体 HTML */
export const DESIGNER_APP_SHELL_TEMPLATE = `
      <div class="app-shell">
        <designer-topbar></designer-topbar>
        <div class="workbench" id="workbench">
          <section class="panel left-panel" id="leftPane">
            <div class="left-palette-wrap" id="leftPaletteWrap">
              <designer-left-panel></designer-left-panel>
            </div>
            <div class="splitter horizontal" id="splTree"></div>
            <div class="left-tree-wrap" id="leftTreeWrap">
              <designer-tree-panel id="treePanel"></designer-tree-panel>
            </div>
          </section>

          <div class="splitter vertical" id="splL"></div>

          <section class="center-panel">
            <!-- 中央 Tab 栏 -->
            <div class="center-tab-bar">
              <div class="center-tabs">
                <button class="c-tab-btn active" data-view="page"><ui5-icon name="show-edit"></ui5-icon>页面</button>
                <button class="c-tab-btn" data-view="data"><ui5-icon name="table-view"></ui5-icon>数据</button>
                <button class="c-tab-btn" data-view="models"><ui5-icon name="database"></ui5-icon>模型</button>
                <button class="c-tab-btn" data-view="fn"><ui5-icon name="source-code"></ui5-icon>函数</button>
                <button class="c-tab-btn" data-view="svc"><ui5-icon name="cloud"></ui5-icon>服务</button>
                <button class="c-tab-btn" data-view="iface"><ui5-icon name="puzzle"></ui5-icon>接口</button>
                <button class="c-tab-btn" data-view="flow"><ui5-icon name="org-chart"></ui5-icon>数据流</button>
                <button class="c-tab-btn" data-view="test"><ui5-icon name="simulate"></ui5-icon>测试</button>
                <button class="c-tab-btn" data-view="deps"><ui5-icon name="add-document"></ui5-icon>依赖</button>
              </div>
              <div class="tab-actions" role="toolbar" aria-label="预览、多页面、调试、页内运行与导入导出">
                <ui5-button id="previewBtn" class="tab-io-icon-btn" design="Transparent" icon="show" tooltip="预览"></ui5-button>
                <ui5-button id="multiPagesBtn" class="tab-io-icon-btn" design="Transparent" icon="multiselect-all" tooltip="打开多页面…" accessible-name="打开多页面"></ui5-button>
                <ui5-button id="runBtn" class="tab-io-icon-btn" design="Transparent" icon="developer-settings" tooltip="调试" accessible-name="调试"></ui5-button>
                <ui5-button id="inlineRunBtn" class="tab-io-icon-btn" design="Transparent" icon="popup-window" tooltip="页内运行"></ui5-button>
                <span class="tab-io-sep" aria-hidden="true">|</span>
                <ui5-button id="importBtn" class="tab-io-icon-btn" design="Transparent" icon="upload" tooltip="从服务器打开"></ui5-button>
                <ui5-button id="exportBtn" class="tab-io-icon-btn" design="Transparent" icon="download" tooltip="保存到服务器"></ui5-button>
              </div>
            </div>

            <!-- 页面：主区为画布/源码二选一，底部 Tab 切换；源码与画布非实时同步 -->
            <div class="page-pane active" id="pagePaneWrap">
              <div class="page-view-body">
                <div class="page-sub-pane active" id="pageSubCanvas" data-sub="canvas">
                  <section class="panel design-wrap" id="designWrap">
                    <designer-canvas id="canvas"></designer-canvas>
                  </section>
                </div>
                <div class="page-sub-pane" id="pageSubSource" data-sub="source">
                  <section class="panel source-wrap" id="sourceWrap">
                    <designer-source-panel id="source"></designer-source-panel>
                  </section>
                </div>
              </div>
              <div class="page-view-tab-bar" role="tablist" aria-label="画布与源码">
                <button type="button" class="page-sub-tab-btn active" role="tab" aria-selected="true" data-sub="canvas" id="pageSubTabCanvas">
                  <ui5-icon name="show-edit"></ui5-icon>画布
                </button>
                <button type="button" class="page-sub-tab-btn" role="tab" aria-selected="false" data-sub="source" id="pageSubTabSource">
                  <ui5-icon name="source-code"></ui5-icon>源码
                </button>
              </div>
            </div>

            <!-- 数据 / 函数 / 服务：共用同一个组件实例 -->
            <designer-page-data id="pageData"></designer-page-data>
          </section>

          <div class="splitter vertical" id="splR"></div>

          <section class="panel right-panel" id="rightPane">
            <designer-inspector id="inspector"></designer-inspector>
          </section>
        </div>

        <ui5-dialog id="serverImportDlg" resizable draggable>
          <div slot="header" class="server-import-dlg-header">
            <ui5-icon name="upload" class="server-import-dlg-header-icon"></ui5-icon>
            <ui5-title level="H5" wrapping-type="None">打开页面</ui5-title>
          </div>
          <div class="server-import-dlg">
            <div class="server-import-hint" id="serverImportScopeHint">全部页面</div>
            <div class="server-import-split">
              <div class="server-import-tree-pane">
                <ui5-tree id="serverImportTree" class="server-import-tree" mode="SingleSelect"></ui5-tree>
              </div>
              <div class="server-import-main-pane">
                <div class="server-import-search-row">
                  <ui5-input id="serverImportSearch" class="server-import-search" placeholder="搜索 ID / 名称 / 详情" aria-label="搜索页面">
                    <ui5-icon slot="icon" name="search"></ui5-icon>
                  </ui5-input>
                </div>
                <ui5-toolbar design="Transparent" class="server-import-toolbar">
                  <ui5-toolbar-spacer></ui5-toolbar-spacer>
                  <ui5-button id="serverImportPrev" design="Transparent" icon="navigation-left-arrow" tooltip="上一页">上一页</ui5-button>
                  <ui5-label id="serverImportPageInfo" class="server-import-pageinfo" wrapping-type="None" show-colon="false"></ui5-label>
                  <ui5-button id="serverImportNext" design="Transparent" icon="navigation-right-arrow" tooltip="下一页">下一页</ui5-button>
                  <ui5-toolbar-separator></ui5-toolbar-separator>
                  <ui5-button id="serverImportRefresh" design="Transparent" icon="refresh" tooltip="重新加载列表">刷新</ui5-button>
                </ui5-toolbar>
                <div class="server-import-table-wrap">
                  <table class="server-import-table">
                    <thead>
                      <tr>
                        <th class="col-id">页面 ID</th>
                        <th class="col-name">名称</th>
                        <th class="col-timestamp">时间戳</th>
                        <th class="col-details">详细信息</th>
                      </tr>
                    </thead>
                    <tbody id="serverImportTbody"></tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
          <div slot="footer" class="server-import-footer-actions">
            <ui5-message-strip id="serverImportStrip" design="Information" hide-close-button hidden class="server-import-footer-strip"></ui5-message-strip>
            <div class="server-import-footer-spacer"></div>
            <ui5-button id="serverImportCloseBtn" design="Transparent">取消</ui5-button>
            <ui5-button id="serverImportApplyBtn" design="Emphasized" disabled icon="open-folder">打开</ui5-button>
          </div>
        </ui5-dialog>

        <ui5-dialog id="multiPagesDlg" resizable draggable>
          <div slot="header" class="multi-pages-dlg-header">
            <ui5-icon name="multiselect-all" class="multi-pages-dlg-header-icon"></ui5-icon>
            <ui5-title level="H5" wrapping-type="None">选择多个页面</ui5-title>
          </div>
          <div class="multi-pages-dlg-body">
            <div class="server-import-strip-wrap">
              <ui5-message-strip id="multiPagesStrip" design="Information" hide-close-button hidden></ui5-message-strip>
            </div>
            <div class="server-import-hint">
              勾选需操作的页面，可翻页累积选择；确定后返回各页的 ID、名称、详情、时间戳。
            </div>
            <div class="server-import-search-row">
              <ui5-input id="multiPagesSearch" class="server-import-search" placeholder="搜索 ID / 名称 / 详情" aria-label="搜索页面">
                <ui5-icon slot="icon" name="search"></ui5-icon>
              </ui5-input>
            </div>
            <ui5-toolbar design="Transparent" class="server-import-toolbar">
              <ui5-button id="multiPagesPrev" design="Transparent" icon="navigation-left-arrow" tooltip="上一页">上一页</ui5-button>
              <ui5-label id="multiPagesPageInfo" class="server-import-pageinfo" wrapping-type="None" show-colon="false"></ui5-label>
              <ui5-button id="multiPagesNext" design="Transparent" icon="navigation-right-arrow" tooltip="下一页">下一页</ui5-button>
              <ui5-toolbar-separator></ui5-toolbar-separator>
              <ui5-button id="multiPagesSelectPage" design="Transparent" icon="complete" tooltip="全选当前页">全选当页</ui5-button>
              <ui5-button id="multiPagesClearSel" design="Transparent" icon="decline" tooltip="清空已选">清空选择</ui5-button>
              <ui5-toolbar-spacer></ui5-toolbar-spacer>
              <ui5-button id="multiPagesRefresh" design="Transparent" icon="refresh" tooltip="重新加载列表">刷新</ui5-button>
            </ui5-toolbar>
            <div class="server-import-table-wrap">
              <table class="server-import-table multi-pages-table">
                <thead>
                  <tr>
                    <th class="col-mp-check"></th>
                    <th class="col-id">页面 ID</th>
                    <th class="col-name">名称</th>
                    <th class="col-timestamp">时间戳</th>
                    <th class="col-details">详细信息</th>
                  </tr>
                </thead>
                <tbody id="multiPagesTbody"></tbody>
              </table>
            </div>
          </div>
          <div slot="footer" class="server-import-footer-actions">
            <ui5-button id="multiPagesCloseBtn" design="Transparent">取消</ui5-button>
            <ui5-button id="multiPagesOkBtn" design="Emphasized" icon="accept" disabled>确定</ui5-button>
          </div>
        </ui5-dialog>

        <ui5-dialog id="serverExportDlg" resizable draggable>
          <div slot="header" class="server-export-dlg-header">
            <ui5-icon name="download" class="server-export-dlg-header-icon"></ui5-icon>
            <ui5-title level="H5" wrapping-type="None">导出并保存到服务器</ui5-title>
          </div>
          <div class="server-export-dlg-body">
            <div class="server-export-strip-wrap">
              <ui5-message-strip id="serverExportStrip" design="Information" hide-close-button hidden></ui5-message-strip>
            </div>
            <div class="server-export-hint">
              选择 domain / application / module 并输入页面名，自动拼成命名空间 ID（如 <code>fi.explorer.explorer-menu.my-page</code>）。
              如要直接编辑完整 ID，勾选"高级模式"。
            </div>
            <div class="server-export-field server-export-field-row">
              <ui5-label for="exportDomainSel" wrapping-type="Normal" show-colon>Domain</ui5-label>
              <ui5-select id="exportDomainSel"></ui5-select>
            </div>
            <div class="server-export-field server-export-field-row">
              <ui5-label for="exportAppSel" wrapping-type="Normal" show-colon>Application</ui5-label>
              <ui5-select id="exportAppSel"></ui5-select>
            </div>
            <div class="server-export-field server-export-field-row">
              <ui5-label for="exportModuleSel" wrapping-type="Normal" show-colon>Module</ui5-label>
              <ui5-select id="exportModuleSel"></ui5-select>
            </div>
            <div class="server-export-field server-export-field-row">
              <ui5-label for="exportPageNameInp" wrapping-type="Normal" show-colon>页面名</ui5-label>
              <ui5-input id="exportPageNameInp" placeholder="如 invoice-list（最后一段）"></ui5-input>
            </div>
            <div class="server-export-field server-export-field-row">
              <ui5-checkbox id="exportAdvancedChk" text="高级模式（直接编辑完整 ID）"></ui5-checkbox>
            </div>
            <div class="server-export-field">
              <ui5-label for="exportPageId" wrapping-type="Normal" show-colon>页面 ID</ui5-label>
              <ui5-input id="exportPageId" readonly placeholder="自动拼接（高级模式可手工编辑）"></ui5-input>
            </div>
            <div class="server-export-field">
              <ui5-label for="exportPageName" wrapping-type="Normal" show-colon>名称</ui5-label>
              <ui5-input id="exportPageName" placeholder="页面显示名称"></ui5-input>
            </div>
            <div class="server-export-field">
              <ui5-label for="exportPageDetails" wrapping-type="Normal" show-colon>详细信息</ui5-label>
              <ui5-textarea id="exportPageDetails" rows="4" placeholder="说明、版本备注等"></ui5-textarea>
            </div>
          </div>
          <div slot="footer" class="server-export-footer-actions">
            <ui5-button id="serverExportCancelBtn" design="Transparent">取消</ui5-button>
            <ui5-button id="serverExportSaveBtn" design="Emphasized" icon="save">保存</ui5-button>
          </div>
        </ui5-dialog>

        <designer-workspace-node-dialog id="wsNodeDlg"></designer-workspace-node-dialog>

        <ui5-dialog id="inlineRunDlg" resizable draggable>
          <div slot="header" class="inline-run-dlg-header">
            <ui5-icon name="popup-window" class="inline-run-dlg-header-icon"></ui5-icon>
            <ui5-title level="H5" wrapping-type="None">页内运行</ui5-title>
          </div>
          <div class="inline-run-dlg-body">
            <div id="inlineRunMount" class="inline-run-mount" aria-live="polite"></div>
          </div>
          <div slot="footer" class="inline-run-footer-actions">
            <ui5-button id="inlineRunCloseBtn" design="Transparent">关闭</ui5-button>
          </div>
        </ui5-dialog>
      </div>`;
