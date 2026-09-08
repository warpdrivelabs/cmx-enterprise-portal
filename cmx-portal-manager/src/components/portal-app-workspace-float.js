import { normalizeWorkspaceRegionViews, htmlPageIdFromViewSpec } from '../lib/workspace-node.js'
import { getCurrentDam } from '../lib/dam-context.js'

/**
 * 同步浮动视图窗口：
 *   - 标题取自当前 Content 标签 caption + icon；
 *   - spec / mountRoot 取自 shell.floatview（无则传 null，浮动窗口仅显示 AI 默认 tab）。
 * 浮动球本身常驻，与 tab/shell 无关；本方法只更新窗口内容部分。
 * 当某个 content tab 首次激活且其 shell 含 floatview 视图时，自动展开浮动窗口并选中第 0 个视图。
 * @param {HTMLElement} host
 * @param {string|undefined} tabId
 * @param {Record<string, unknown>|null|undefined} sh
 * @param {HTMLElement|null|undefined} mountRoot
 */
export function syncFloatWindow (host, tabId, sh, mountRoot) {
  const sr = host.shadowRoot
  const fw = sr?.getElementById('workspace-float-window')
  if (!fw || typeof /** @type {any} */ (fw).setState !== 'function') return
  const floatSpec = sh && typeof sh === 'object' && Object.prototype.hasOwnProperty.call(sh, 'floatview')
    ? /** @type {Record<string, unknown>} */ (sh).floatview
    : null
  const content = sr?.getElementById('content-area')
  let header = { text: '', icon: 'popup-window' }
  if (tabId && content && typeof /** @type {any} */ (content).getTabHeader === 'function') {
    const h = /** @type {any} */ (content).getTabHeader(tabId)
    if (h) header = { text: String(h.text || ''), icon: String(h.icon || 'popup-window') }
  }
  /** @type {any} */ (fw).setState({
    title: header.text,
    icon: header.icon,
    spec: floatSpec,
    mountRoot: mountRoot || null,
  })

  if (!(host._floatAutoOpenedTabs instanceof Set)) host._floatAutoOpenedTabs = new Set()
  const hasFloatViews = normalizeWorkspaceRegionViews(/** @type {any} */ (floatSpec)).length > 0
  if (tabId && hasFloatViews && !host._floatAutoOpenedTabs.has(tabId)) {
    host._floatAutoOpenedTabs.add(tabId)
    if (typeof /** @type {any} */ (fw).activateView === 'function') {
      /** @type {any} */ (fw).activateView(0)
    }
  }
}

/**
 * 将 html_pages 视图在 HTML 设计器中打开（新标签页）。
 * URL 除 id 外附带当前业务位置 DAM（C6②）：设计器侧 `_readDamFromUrl` 预填三下拉，
 * 新建/另存页默认继承用户所在 domain/application/module，从根上消除裸建页缺坐标。
 * @param {HTMLElement} host
 * @param {Record<string, unknown>|null|undefined} viewSpec
 */
export async function openHtmlPageInDesigner (host, viewSpec) {
  const sr = host.shadowRoot
  const logPanel = sr?.getElementById('log-panel')
  if (!viewSpec) return
  const type = String(/** @type {any} */ (viewSpec).type || '').trim().toLowerCase()
  if (type !== 'html_pages') {
    logPanel?.addLog?.('该视图非 html_pages 类型，无法在设计器中打开', 'warn', 'Workspace')
    return
  }
  const pageId = htmlPageIdFromViewSpec(/** @type {any} */ (viewSpec))
  if (!pageId) {
    logPanel?.addLog?.('该视图缺少 html_page 页面 ID，无法在设计器中打开', 'warn', 'Workspace')
    return
  }
  const u = new URL('/html/', window.location.origin)
  u.searchParams.set('id', pageId)
  /* DAM 取当前活动域 + 活动 tab 菜单节点坐标（与 openNode 注入同一来源）；
     取不到不阻塞打开——设计器侧退回无预填。 */
  try {
    const dam = (await getCurrentDam(host)) || {}
    if (dam.domain) u.searchParams.set('domain', String(dam.domain))
    if (dam.application) u.searchParams.set('app', String(dam.application))
    if (dam.module) u.searchParams.set('module', String(dam.module))
  } catch { /* ignore：DAM 附加参数尽力而为 */ }
  window.open(u.toString(), '_blank', 'noopener,noreferrer')
  logPanel?.addLog?.(`已在 HTML 设计器打开页面 ${pageId}`, 'info', 'Workspace')
}
