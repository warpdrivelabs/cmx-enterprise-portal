/**
 * 侧边导航 html_pages 活动侧栏：batch 拉取、渲染、hydrate、上下文菜单。
 */
import {
  prepareWorkspaceHtmlPages,
  renderWorkspaceRegionViewsHtml,
  hydrateHtmlPagesWorkspaceViewsInRoot,
} from '../lib/workspace-node.js'
import { wireWorkspaceRegionTabContextMenu } from '../lib/workspace-region-tab-ctxmenu.js'

/**
 * 异步 batch 拉取 → 渲染 html_pages 活动侧栏 → hydrate。
 * 与菜单世代号机制对齐：快速切换活动时旧响应不覆盖新侧栏。
 * @param {HTMLElement} host
 * @param {object[]} views WorkspaceViewSpec[]，至少一项
 */
export async function loadHtmlPagesSideNav (host, views) {
  const h = /** @type {any} */ (host)
  const body = host.shadowRoot.getElementById('panel-body')
  if (!body) return
  if (!Array.isArray(views) || !views.length) return
  const myGen = ++h._htmlPagesLoadGen
  /* views 深拷贝：prepareWorkspaceHtmlPages 会把 batch 响应原地写回 view.data；不能污染 attribute 缓存。 */
  const wsLike = { explorer: { views: views.map((v) => ({ .../** @type {object} */ (v) })) } }
  h._htmlPagesActiveSpec = wsLike.explorer
  // eslint-disable-next-line no-restricted-syntax -- 静态字面量
  body.innerHTML =
    '<div id="cmx-html-pages-sidenav-pane" class="html-pages-sidenav">'
    + '<ui5-message-strip id="portal-html-pages-strip" design="Negative" hidden style="margin:8px"></ui5-message-strip>'
    + '<ui5-busy-indicator id="portal-html-pages-busy" active delay="0" text="加载页面…"'
    + ' style="position:absolute;inset:0;z-index:2;display:flex;align-items:center;justify-content:center;'
    + 'background:color-mix(in srgb, var(--sapGroup_ContentBackground, #fafafa) 85%, transparent)"></ui5-busy-indicator>'
    + '<div id="portal-html-pages-host" style="flex:1 1 auto;min-height:0;display:flex;flex-direction:column;overflow:hidden"></div>'
    + '</div>'
  const strip = body.querySelector('#portal-html-pages-strip')
  const busy = body.querySelector('#portal-html-pages-busy')
  const host2 = body.querySelector('#portal-html-pages-host')
  if (!(host2 instanceof HTMLElement)) return
  try {
    await prepareWorkspaceHtmlPages(wsLike)
    if (myGen !== h._htmlPagesLoadGen) return
    const liveViews = wsLike.explorer.views
    /* 用 batch 响应里的 page.name 美化 Tab 标签（仅 tabLabel 缺失时）；保留页面 ID 作为 fallback。 */
    for (const view of liveViews) {
      if (!view || typeof view !== 'object') continue
      const vo = /** @type {Record<string, unknown>} */ (view)
      const data = vo.data && typeof vo.data === 'object' ? /** @type {Record<string, unknown>} */ (vo.data) : null
      const page = data && data.htmlPage && typeof data.htmlPage === 'object'
        ? /** @type {Record<string, unknown>} */ (data.htmlPage)
        : null
      const name = page && page.name != null ? String(page.name).trim() : ''
      const existing = vo.tabLabel != null ? String(vo.tabLabel).trim() : ''
      if (!existing && name) vo.tabLabel = name
    }
    const errs = []
    for (const view of liveViews) {
      if (!view || typeof view !== 'object') continue
      const vo = /** @type {Record<string, unknown>} */ (view)
      const data = vo.data && typeof vo.data === 'object' ? /** @type {Record<string, unknown>} */ (vo.data) : null
      const e = data && data.htmlPageLoadError != null ? String(data.htmlPageLoadError).trim() : ''
      const pid = data && data.htmlPageId != null ? String(data.htmlPageId).trim() : ''
      if (e) errs.push(pid ? `${pid}: ${e}` : e)
    }
    if (errs.length === liveViews.length && liveViews.length > 0) {
      if (strip instanceof HTMLElement) {
        strip.textContent = errs.join('\n')
        strip.hidden = false
      }
      host2.replaceChildren()
      return
    }
    // eslint-disable-next-line no-restricted-syntax -- renderWorkspaceRegionViewsHtml 内部已转义
    host2.innerHTML = renderWorkspaceRegionViewsHtml('explorer', wsLike.explorer)
    hydrateHtmlPagesWorkspaceViewsInRoot(host2)
    queueMicrotask(() => hydrateHtmlPagesWorkspaceViewsInRoot(host2))
    wireHtmlPagesSideNavCtxMenu(host)
  } catch (err) {
    if (myGen !== h._htmlPagesLoadGen) return
    if (strip instanceof HTMLElement) {
      strip.textContent = err instanceof Error ? err.message : String(err)
      strip.hidden = false
    }
    host2.replaceChildren()
  } finally {
    /* `ui5-busy-indicator` 即使 active=false 仍是 position:absolute;inset:0 的全屏遮罩，会吞掉所有指针事件
       （Tab 切换、内部页面交互全部失效）。加载结束后必须从 DOM 移除，不能仅 active=false。 */
    if (busy instanceof HTMLElement) busy.remove()
  }
}

/**
 * 绑定 html_pages 活动侧栏页面 Tab 上下文菜单（幂等）。
 * 多视图时命中具体 tab，单视图时回退到外层活动签。
 * @param {HTMLElement} host
 */
export function wireHtmlPagesSideNavCtxMenu (host) {
  const h = /** @type {any} */ (host)
  if (h._htmlPagesCtxMenuUnwire) return
  h._htmlPagesCtxMenuUnwire = wireWorkspaceRegionTabContextMenu(
    host.shadowRoot,
    () => host.shadowRoot.getElementById('cmx-html-pages-sidenav-pane'),
    'explorer',
    /* 活动侧栏与工作区无关，无 outer ws tab id；返回 `actv:<id>` 兜底以满足 helper 的 tabId 校验，
       不会被 portal-app 的 workspace tab 逻辑误用——activate-view 菜单项已固定隐藏。 */
    () => 'actv:' + (host.getAttribute('view')?.trim() || 'sideNav'),
    () => /** @type {Record<string, unknown>|null} */ (h._htmlPagesActiveSpec),
    {
      getOuterTab: () => /** @type {HTMLElement|null} */ (
        host.shadowRoot.querySelector('#outer-tab-strip .outer-tab[data-outer-id="main"]')
      ),
      hideActivateView: true,
    },
  )
}
