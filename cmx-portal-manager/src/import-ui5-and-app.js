/**
 * UI5 与 Portal 自定义元素注册（须在共用 runtime + 主题/语言初始化完成之后加载）。
 *
 * UI5 / Tabler 由 packages/cmx-ui5-runtime 构建至 /shared/，此处仅注册 Portal 业务组件。
 */

const { registerHtmlPagesWorkspaceViewType, registerNativePagesWorkspaceViewType } = await import('./lib/workspace-node.js')
registerHtmlPagesWorkspaceViewType()
registerNativePagesWorkspaceViewType()

/* barrel 挂 __cmxDataComp 必须 await 完成：原生页面（native-pages）模块顶层直接解构
   globalThis.__cmxDataComp（escHtml/apiJson 等共享 helper），深链首开 tab 不等 UI 就会撞上。 */
const mod = await import('cmx-data-comp')
globalThis.__cmxDataComp = mod
/* 共享纯工具域注册中心（globalThis.cmx.{domain}，如 cmx.datetime 时间时区转换；与组件库解耦）。
   import 副作用自挂全局，与 __cmxDataComp 同一时序保障：native-page 模块顶层同步取用。 */
await import('cmx-shared')
const m = await import('cmx-data-comp/lib/init-page-models.js')
globalThis.__cmxInitPageModels = m.initPageModels
/** 全门户 cmx-ui5-form / cmx-revo-grid 默认 Neo 皮肤；单组件可用 data-cmx-skin="plain" 关闭 */
globalThis.__cmxDefaultFormSkin = 'neo'
globalThis.__cmxDefaultGridSkin = 'neo'
/** 展示类组件（panel / toolbar / status-tag / empty-state / desc-list / filter-bar）默认 Neo 皮肤 */
globalThis.__cmxDefaultPanelSkin = 'neo'
globalThis.__cmxDefaultToolbarSkin = 'neo'
globalThis.__cmxDefaultStatusTagSkin = 'neo'
globalThis.__cmxDefaultEmptyStateSkin = 'neo'
globalThis.__cmxDefaultDescListSkin = 'neo'
globalThis.__cmxDefaultFilterBarSkin = 'neo'
globalThis.__cmxDefaultKpiCardSkin = 'neo'
globalThis.__cmxDefaultFlowTrailSkin = 'neo'

await Promise.all([
  import('./components/portal-activity-bar.js'),
  import('./components/portal-shellbar.js'),
  import('./components/portal-side-nav.js'),
  import('./components/portal-content-area.js'),
  import('./components/portal-property-panel.js'),
  import('./components/portal-log-panel.js'),
  import('./components/portal-status-bar.js'),
  import('./components/portal-json-code-viewer.js'),
  import('./components/portal-flexible-combination-manager.js'),
  import('./components/portal-definition-manager.js'),
  import('./components/cmx-code-rule-manager.js'),
  import('./components/portal-custom-page-designer.js'),
  import('./components/portal-agent-console.js'),
  import('./components/portal-app.js'),
])
