/**
 * 侧边导航工作区 Explorer：挂载/卸载、DnD、上下文菜单。
 */
import {
  normalizeWorkspaceRegionViews,
  renderWorkspaceRegionViewsHtml,
  hydrateHtmlPagesWorkspaceViewsInRoot,
  activateWorkspaceRegionViewByIndex,
} from '../lib/workspace-node.js'
import { wireWorkspacePanelDnd } from '../lib/workspace-dock-layout.js'
import { wireWorkspaceRegionTabContextMenu } from '../lib/workspace-region-tab-ctxmenu.js'
import { setOuterExplorerActive, syncOuterTabStrip } from './portal-side-nav-outer-tabs.js'

/** @returns {string} */
function readActiveWsTabId () {
  const app = document.querySelector('cmx-portal-app')
  return (app instanceof HTMLElement && app.dataset?.cmxActiveWsTab) || ''
}

/**
 * 绑定工作区 Explorer pane 的 DnD（幂等）。
 * @param {HTMLElement} host
 */
export function wireWorkspaceDnd (host) {
  const h = /** @type {any} */ (host)
  if (h._dndUnwire) return
  h._dndUnwire = wireWorkspacePanelDnd(
    host.shadowRoot,
    () => host.shadowRoot.getElementById('cmx-workspace-explorer-pane'),
    'explorer',
    () => readActiveWsTabId(),
    () => /** @type {Record<string, unknown>|null} */ (h._workspaceExplorerSpec),
    (detail) => {
      host.dispatchEvent(new CustomEvent('portal-workspace-view-dropped', {
        bubbles: true,
        composed: true,
        detail,
      }))
    },
  )
}

/**
 * 绑定工作区 Explorer pane 的上下文菜单（幂等）。
 * @param {HTMLElement} host
 */
export function wireWorkspaceCtxMenu (host) {
  const h = /** @type {any} */ (host)
  if (h._ctxMenuUnwire) return
  h._ctxMenuUnwire = wireWorkspaceRegionTabContextMenu(
    host.shadowRoot,
    () => host.shadowRoot.getElementById('cmx-workspace-explorer-pane'),
    'explorer',
    () => readActiveWsTabId(),
    () => /** @type {Record<string, unknown>|null} */ (h._workspaceExplorerSpec),
    {
      getOuterTab: () => /** @type {HTMLElement|null} */ (
        host.shadowRoot.querySelector('#outer-tab-strip .outer-tab[data-outer-id="workspace"]')
      ),
    },
  )
}

/**
 * 挂载/卸载工作区 Explorer pane，含 mountRoot 复用逻辑。
 * Explorer 外层第二签的文案与图标见 `workspaceRegionOuterTabText` / `workspaceRegionOuterTabIcon`。
 * @param {HTMLElement} host
 * @param {import('../lib/workspace-node.js').WorkspaceRegionViewsInput|null} spec
 * @param {{ activateWorkspace?: boolean, mountRoot?: HTMLElement|null }} [options]
 */
export function setWorkspaceExplorer (host, spec, options = {}) {
  const h = /** @type {any} */ (host)
  const mountRoot = options.mountRoot instanceof HTMLElement ? options.mountRoot : null
  h._workspaceExplorerSpec = spec != null && typeof spec === 'object' ? spec : null
  const body = host.shadowRoot.getElementById('panel-body')
  if (!body) return
  const existing = body.querySelector('#cmx-workspace-explorer-pane')
  const views = normalizeWorkspaceRegionViews(h._workspaceExplorerSpec)
  if (!h._workspaceExplorerSpec || !views.length) {
    h._workspaceExplorerSpec = null
    /* 不 remove pane，仅切回 main 外层签让 ws pane 走 display:none；
       缓存根仍挂在 pane 里 → 内部 CE 不 disconnect，避免 dispose 风暴。
       下次有非空 spec 时若 mountRoot 不同，会在下方 mountRoot 分支正常替换。 */
    syncOuterTabStrip(host)
    setOuterExplorerActive(host, 'main')
    return
  }
  let pane = existing
  if (!pane) {
    pane = document.createElement('div')
    pane.id = 'cmx-workspace-explorer-pane'
    pane.setAttribute('role', 'region')
    pane.setAttribute('aria-label', 'Workspace explorer')
    pane.style.cssText = 'display:none;flex:1 1 auto;flex-direction:column;min-height:0;overflow:hidden;background:var(--sapGroup_ContentBackground,#fafafa)'
    body.appendChild(pane)
  }
  if (mountRoot) {
    /* 同一 mountRoot 已挂载：什么都不做。直接 appendChild 同一节点会先 detach 再 attach，
       导致内部自定义元素 disconnect/connect，触发可见闪烁。 */
    if (mountRoot.parentElement !== pane) {
      while (pane.firstChild) pane.removeChild(pane.firstChild)
      pane.appendChild(mountRoot)
      queueMicrotask(() => {
        hydrateHtmlPagesWorkspaceViewsInRoot(mountRoot)
      })
    }
  } else {
    const onlyCache =
      pane.childElementCount === 1 &&
      pane.firstElementChild?.classList?.contains('cmx-ws-tab-cache-root')
    if (!onlyCache) {
      // eslint-disable-next-line no-restricted-syntax -- renderWorkspaceRegionViewsHtml 内部已转义
      pane.innerHTML = renderWorkspaceRegionViewsHtml('explorer', h._workspaceExplorerSpec)
    }
    /* 无 mountRoot 时：菜单重载等路径会命中 onlyCache（pane 内仍为标签缓存根），须再次 hydrate，否则 textarea 载荷永不注入 → 空白。 */
    hydrateHtmlPagesWorkspaceViewsInRoot(pane)
    queueMicrotask(() => hydrateHtmlPagesWorkspaceViewsInRoot(pane))
  }
  syncOuterTabStrip(host)
  if (options.activateWorkspace) {
    setOuterExplorerActive(host, 'workspace')
  } else {
    setOuterExplorerActive(host, 'main')
  }
}

/**
 * 切换到 Explorer 工作区多视图中的某一签。
 * @param {HTMLElement} host
 * @param {number} viewIndex
 */
export function activateWorkspaceRegionView (host, viewIndex) {
  setOuterExplorerActive(host, 'workspace')
  const pane = host.shadowRoot.getElementById('cmx-workspace-explorer-pane')
  if (pane) {
    activateWorkspaceRegionViewByIndex(pane, 'explorer', viewIndex)
  }
}
