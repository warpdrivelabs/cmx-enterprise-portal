import {
  normalizeWorkspaceRegionViews,
  workspacePrepareDialogMeta,
  prepareWorkspaceHtmlPages,
} from '../lib/workspace-node.js'
import { openWorkspaceNodeWithHydratedHtmlPages, markWorkspaceHtmlPagesLoadError } from '../lib/workspace-html-pages.js'
import { injectDamIntoExtras } from '../lib/dam-context.js'
import { showCmxError } from 'cmx-data-comp/lib/cmx-toast.js'

/**
 * @param {HTMLElement} host
 * @param {import('../lib/workspace-node.js').WorkspaceConfig} workspace
 * @param {string} menuLabel
 * @param {(host: HTMLElement, on: boolean) => void} [setHtmlPagesWorkspaceLoading] 与 html_pages batch 相同的 loading 遮罩开关
 */
export async function openWorkspacePrepareDialog (host, workspace, menuLabel, setHtmlPagesWorkspaceLoading) {
  if (!workspace || typeof workspace !== 'object') return
  const setLoading = typeof setHtmlPagesWorkspaceLoading === 'function'
    ? setHtmlPagesWorkspaceLoading
    : () => {}
  try {
    await prepareWorkspaceHtmlPages(workspace, {
      setLoading: (v) => setLoading(host, v),
    })
  } catch (err) {
    // batch 整体失败：给各 html_pages 视图写红字错误占位，并提示——此前只 console.warn，
    // 视图落灰字「未加载」被误认为配置问题。
    markWorkspaceHtmlPagesLoadError(workspace, `页面加载失败：${err instanceof Error ? err.message : String(err)}`)
    showCmxError('工作区页面批量加载失败', err)
  }
  const prepareRaw = Object.prototype.hasOwnProperty.call(workspace, 'prepare')
    ? /** @type {import('../lib/workspace-node.js').WorkspaceRegionViewsInput} */ (workspace.prepare)
    : undefined

  /* 入参：菜单节点 workspace.params 优先，其次 workspace.prepare.params（包装对象上的）。 */
  const wsParams = workspace && typeof workspace === 'object' && /** @type {any} */ (workspace).params
  const prepWrapParams = prepareRaw && typeof prepareRaw === 'object' && !Array.isArray(prepareRaw)
    && /** @type {any} */ (prepareRaw).params
  const paramsForDialog = (wsParams && typeof wsParams === 'object') ? wsParams
    : (prepWrapParams && typeof prepWrapParams === 'object') ? prepWrapParams
      : null

  await import('./portal-prepare-dialog.js')
  const el = /** @type {any} */ (document.createElement('portal-prepare-dialog'))
  el.meta = workspacePrepareDialogMeta(prepareRaw, menuLabel || '工作区')
  el.prepareRaw = prepareRaw ?? null
  el.params = paramsForDialog
  document.body.appendChild(el)

  /** @param {Event} e */
  const onClose = async (e) => {
    const d = /** @type {CustomEvent<{ action?: string }>} */ (e).detail || {}
    /* 关闭前抓取 prepare scope 上脚本写入的 result（浅克隆）。dialog disconnect 时 scope 会被释放。 */
    const resultSnap = typeof el.getResultSnapshot === 'function' ? el.getResultSnapshot() : null
    el.remove()
    const p = host._pendingWorkspaceOpen
    host._pendingWorkspaceOpen = null
    if (d.action !== 'confirm' || !p) return
    try {
      // prepare 阶段已调用过 prepareWorkspaceHtmlPages(workspace)，
      // 这里直接 open_view，避免对同一 workspace 再次 prepare 导致重复加载。
      // resultSnap 透传为 initialContext：在 content CE hydrate 之前逐键写入新 workspace.context。
      // 动态跳转 extras.initialContext 作底，prepare 用户确认值（resultSnap）覆盖之。
      const extraCtx = p.extras && p.extras.initialContext ? p.extras.initialContext : null
      const merged = (extraCtx || resultSnap)
        ? { initialContext: { ...(extraCtx || {}), ...(resultSnap || {}) } }
        : undefined
      p.node.open_view({
        contentArea: p.contentArea,
        sideNav: p.sideNav,
        propertyPanel: p.propertyPanel,
        logPanel: p.logPanel,
      }, merged)
    } catch (err) {
      console.warn('[cmx-portal-app] open workspace after prepare failed', err)
    }
    p.logPanel?.addLog?.(`导航到: ${p.label}`, 'info', 'Navigator')
  }
  el.addEventListener('dialog-close', onClose, { once: true })
}

/**
 * 共享打开逻辑：含 prepare 对话框检测、html_pages batch 加载、日志。
 * @param {HTMLElement} host
 * @param {ShadowRoot} sr
 * @param {import('../lib/workspace-node.js').WorkspaceNode} wsNode
 * @param {string} label
 * @param {(host: HTMLElement, on: boolean) => void} setHtmlPagesWorkspaceLoading
 * @param {{ initialContext?: Record<string, unknown> }} [extras]
 *   动态跳转传参：开新 tab 时注入 workspace.context 的初始键值。
 *   与 prepare 对话框 result 合并（prepare 用户确认值覆盖程序预设值）。
 */
export async function openWorkspaceNodeWithPrepare (host, sr, wsNode, label, setHtmlPagesWorkspaceLoading, extras) {
  const content = sr.getElementById('content-area')
  if (!content) return
  // 在所有打开路径的汇聚点注入当前 DAM 到 extras.initialContext（短名 domain/application/module），
  // 页面统一用 host.workspace.context.get('domain') 读取。覆盖菜单点击（handleNavSelection）、
  // openNode、shellbar 内置入口等所有打开方式。调用方显式传入的 initialContext 优先（业务参数不被覆盖）。
  extras = await injectDamIntoExtras(host, wsNode, extras)
  const ws = wsNode.workspace
  const prepareRaw = ws && typeof ws === 'object' && Object.prototype.hasOwnProperty.call(ws, 'prepare')
    ? /** @type {import('../lib/workspace-node.js').WorkspaceRegionViewsInput} */ (ws.prepare)
    : undefined
  const prepareViews = normalizeWorkspaceRegionViews(prepareRaw)
  if (prepareViews.length > 0) {
    host._pendingWorkspaceOpen = {
      node: wsNode,
      label,
      contentArea: content,
      sideNav: sr.querySelector('portal-side-nav'),
      propertyPanel: sr.getElementById('property-panel'),
      logPanel: sr.getElementById('log-panel'),
      extras,
    }
    await openWorkspacePrepareDialog(host, ws, label, setHtmlPagesWorkspaceLoading)
    return
  }
  try {
    await openWorkspaceNodeWithHydratedHtmlPages(wsNode, {
      contentArea: content,
      sideNav: sr.querySelector('portal-side-nav'),
      propertyPanel: sr.getElementById('property-panel'),
      logPanel: sr.getElementById('log-panel'),
    }, { setLoading: (v) => setHtmlPagesWorkspaceLoading(host, v), extras })
  } catch (err) {
    // batch 整体失败：视图写红字错误占位后再 open_view（替代灰字「未加载」），并提示可见。
    if (ws && typeof ws === 'object') {
      markWorkspaceHtmlPagesLoadError(ws, `页面加载失败：${err instanceof Error ? err.message : String(err)}`)
    }
    showCmxError('工作区页面批量加载失败', err)
    wsNode.open_view({
      contentArea: content,
      sideNav: sr.querySelector('portal-side-nav'),
      propertyPanel: sr.getElementById('property-panel'),
      logPanel: sr.getElementById('log-panel'),
    }, extras)
  }
  const logPanel = sr.getElementById('log-panel')
  if (logPanel) logPanel.addLog(`导航到: ${label}`, 'info', 'Navigator')
}
