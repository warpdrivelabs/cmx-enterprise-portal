import {
  hydrateHtmlPagesWorkspaceViewsInRoot,
  normalizeWorkspaceRegionViews,
  renderWorkspaceRegionViewsHtml,
} from '../lib/workspace-node.js'
import {
  DROP_TARGET_CLASS,
  PAYLOAD_MIME,
  decodeDragPayload,
  deriveWorkspaceViewKey,
  encodeDragPayload,
} from '../lib/workspace-dock-layout.js'
import { wireWorkspaceRegionTabContextMenu } from '../lib/workspace-region-tab-ctxmenu.js'
import { escAttr } from '../lib/escape.js'
import { disposeWorkspace, mainapp } from '../lib/mainapp.js'

export function wireWorkspaceDnd (host) {
  const sroot = host.shadowRoot
  if (!sroot) return
  const body = sroot.getElementById('tab-body')
  if (!body) return
  if (body.dataset.cmxWsDndWired === '1') return
  body.dataset.cmxWsDndWired = '1'

  body.addEventListener('dragstart', (e) => {
    const t = /** @type {Element|null} */ (e.target)
    if (!(t instanceof Element)) return
    const btn = t.closest('.cmx-ws-tab-btn')
    if (!(btn instanceof HTMLElement)) return
    const pane = btn.closest('.tab-pane')
    if (!(pane instanceof HTMLElement) || pane.dataset.id !== host._activeTab) return
    const regionEl = btn.closest('.cmx-ws-region')
    const region = regionEl instanceof HTMLElement
      ? regionEl.getAttribute('data-cmx-ws-region')
      : 'content'
    if (region !== 'content') return
    const tab = host._tabs.find((x) => x.id === host._activeTab)
    const layoutId = tab?.workspaceLayoutId
    if (!tab || !layoutId || tab.contentSpec == null) {
      e.preventDefault()
      return
    }
    const views = normalizeWorkspaceRegionViews(tab.contentSpec)
    if (views.length <= 1) {
      e.preventDefault()
      return
    }
    const idxStr = btn.getAttribute('data-pane-index') || btn.dataset.paneIndex
    const idx = parseInt(String(idxStr ?? '0'), 10) || 0
    const spec = views[idx] || {}
    const viewKey = deriveWorkspaceViewKey(spec, { region: 'content', index: idx })
    try {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData(PAYLOAD_MIME, encodeDragPayload({
        workspaceTabId: host._activeTab,
        sourceRegion: 'content',
        sourceIndex: idx,
        viewKey,
      }))
    } catch {}
  })

  body.addEventListener('dragover', (e) => {
    if (!dndIsWorkspacePayload(e)) return
    const region = dndContentTargetRegion(host, e)
    if (!region) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    dndHighlightContentRegion(host, region.regionEl)
  })

  body.addEventListener('dragleave', (e) => {
    const rel = /** @type {Element|null} */ (e.relatedTarget)
    if (rel && body.contains(rel)) return
    dndHighlightContentRegion(host, null)
  })

  body.addEventListener('drop', (e) => {
    if (!dndIsWorkspacePayload(e)) return
    e.preventDefault()
    dndHighlightContentRegion(host, null)
    const payload = decodeDragPayload(e.dataTransfer)
    if (!payload) return
    if (payload.workspaceTabId !== host._activeTab) return
    const target = dndContentTargetRegion(host, e)
    if (!target) return
    host.dispatchEvent(new CustomEvent('portal-workspace-view-dropped', {
      bubbles: true,
      composed: true,
      detail: {
        tabId: host._activeTab,
        sourceRegion: payload.sourceRegion,
        sourceIndex: payload.sourceIndex,
        viewKey: payload.viewKey,
        targetRegion: 'content',
        targetIndex: target.insertIndex,
      },
    }))
  })
}

export function wireWorkspaceCtxMenu (host) {
  if (host._ctxMenuUnwire) return
  host._ctxMenuUnwire = wireWorkspaceRegionTabContextMenu(
    host.shadowRoot,
    () => host.shadowRoot.querySelector(`.tab-pane[data-id="${escAttr(host._activeTab || '')}"]`),
    'content',
    () => {
      const tab = host._tabs.find((x) => x.id === host._activeTab)
      return tab && tab.contentSpec != null ? String(host._activeTab || '') : ''
    },
    () => {
      const tab = host._tabs.find((x) => x.id === host._activeTab)
      return tab && tab.contentSpec != null ? tab.contentSpec : null
    },
  )
}

function dndIsWorkspacePayload (e) {
  const types = e.dataTransfer?.types
  if (!types) return false
  for (const t of types) {
    if (t === PAYLOAD_MIME) return true
  }
  return false
}

function dndContentTargetRegion (host, e) {
  const body = host.shadowRoot.getElementById('tab-body')
  if (!body) return null
  const activePane = body.querySelector(`.tab-pane[data-id="${escAttr(host._activeTab || '')}"]`)
  if (!(activePane instanceof HTMLElement)) return null
  const regionEl = activePane.querySelector('.cmx-ws-region[data-cmx-ws-region="content"]')
  if (!(regionEl instanceof HTMLElement)) {
    return {
      regionEl: activePane,
      insertIndex: Number.MAX_SAFE_INTEGER,
    }
  }
  const tabBar = regionEl.querySelector('.cmx-ws-region-tabs-bottom')
  const x = e.clientX
  let insertIndex = Number.MAX_SAFE_INTEGER
  if (tabBar instanceof HTMLElement) {
    const btns = tabBar.querySelectorAll('.cmx-ws-tab-btn')
    for (let i = 0; i < btns.length; i++) {
      const b = btns[i]
      if (!(b instanceof HTMLElement)) continue
      const r = b.getBoundingClientRect()
      if (x < r.left + r.width / 2) {
        insertIndex = i
        break
      }
    }
    if (insertIndex === Number.MAX_SAFE_INTEGER) insertIndex = btns.length
  }
  return { regionEl, insertIndex }
}

function dndHighlightContentRegion (host, el) {
  const body = host.shadowRoot.getElementById('tab-body')
  if (!body) return
  body.querySelectorAll('.' + DROP_TARGET_CLASS).forEach((n) => n.classList.remove(DROP_TARGET_CLASS))
  if (el instanceof HTMLElement) el.classList.add(DROP_TARGET_CLASS)
}

export function takeWorkspaceMountsForTab (host, tabId) {
  const tab = host._tabs.find((t) => t.id === tabId)
  if (!tab?.workspaceShell || typeof tab.workspaceShell !== 'object') return {}
  const sh = tab.workspaceShell
  const mounts = {}
  for (const region of ['explorer', 'property', 'bottom', 'floatview', 'model', 'inner', 'embed']) {
    if (!Object.prototype.hasOwnProperty.call(sh, region)) continue
    const spec = sh[region]
    if (spec == null || (typeof spec === 'object' && spec !== null && Object.keys(spec).length === 0)) continue
    const views = normalizeWorkspaceRegionViews(spec)
    if (!views.length) continue
    mounts[region] = ensureWorkspaceMountRoot(host, tab, region, spec)
  }
  return mounts
}

export function ensureWorkspaceMountRoot (host, tab, region, spec) {
  /* embed 区："每 view 一独立 root"，走单独分支；不进入下面的整 region root 流程。 */
  if (region === 'embed') {
    ensureEmbedMountRoots(host, tab, spec)
    return null
  }
  if (!tab.workspaceMountRoots) tab.workspaceMountRoots = {}
  if (!tab.workspaceMountSpecs) tab.workspaceMountSpecs = {}
  let root = tab.workspaceMountRoots[region]
  const prevSpec = tab.workspaceMountSpecs[region]
  if (root && prevSpec !== spec) {
    root.remove()
    root = undefined
    tab.workspaceMountRoots[region] = undefined
  }
  if (!root) {
    root = document.createElement('div')
    root.className = 'cmx-ws-tab-cache-root'
    root.dataset.cmxWsCacheRegion = region
    root.dataset.cmxWorkspaceId = 'tab:' + String(tab.id)
    // eslint-disable-next-line no-restricted-syntax -- renderWorkspaceRegionViewsHtml 内部已用 escHtml/escAttr
    root.innerHTML = renderWorkspaceRegionViewsHtml(region, spec)
    tab.workspaceMountRoots[region] = root
    tab.workspaceMountSpecs[region] = spec
    if (region === 'model' || region === 'inner') {
      const holderId = region === 'model' ? 'model-region-host' : 'inner-region-host'
      const holder = host.shadowRoot?.getElementById(holderId)
      if (holder) {
          holder.appendChild(root)
          hydrateHtmlPagesWorkspaceViewsInRoot(root)
          queueMicrotask(() => hydrateHtmlPagesWorkspaceViewsInRoot(root))
        }
      if (region === 'inner') {
        /* 反向登记到 Workspace，供 ws.openInnerPageView 借用；记录 holder 用于归还。 */
        const ws = mainapp.workspaces['tab:' + String(tab.id)]
        if (ws) {
          ws._innerMountRoot = root
          ws._innerMountHolder = host.shadowRoot?.getElementById('inner-region-host') || null
        }
      }
    }
  }
  if (region !== 'model' && region !== 'inner') syncWorkspaceCacheRootLayout(root)
  return root
}

/**
 * embed 区"每 view 一独立 root"：把 spec 中每个 view 单独渲染到一个 cache root，
 * 加挂到 #embed-region-host 立即 hydrate；存到
 * `tab.workspaceEmbedRoots: Map<viewId, { root: HTMLElement, icon: string, label: string }>`。
 * Workspace 上反向登记 `_embedMountRoots` / `_embedMountHolder`，供 borrowEmbedRoot/returnEmbedRoot 使用。
 *
 * @param {HTMLElement} host
 * @param {{ id: string, workspaceEmbedSpec?: unknown, workspaceEmbedRoots?: Map<string, { root: HTMLElement, icon: string, label: string }> }} tab
 * @param {unknown} spec embed region 的原始配置（与其它 region 一致）
 */
export function ensureEmbedMountRoots (host, tab, spec) {
  const holder = host.shadowRoot?.getElementById('embed-region-host')
  if (!(holder instanceof HTMLElement)) return
  /* spec 引用变化时（hot reload / 配置编辑）整体重建。 */
  if (tab.workspaceEmbedRoots && tab.workspaceEmbedSpec !== spec) {
    for (const entry of tab.workspaceEmbedRoots.values()) entry.root?.remove()
    tab.workspaceEmbedRoots = undefined
  }
  if (tab.workspaceEmbedRoots) return
  tab.workspaceEmbedSpec = spec
  /** @type {Map<string, { root: HTMLElement, icon: string, label: string }>} */
  tab.workspaceEmbedRoots = new Map()
  const views = normalizeWorkspaceRegionViews(spec)
  /** @type {Set<string>} */
  const taken = new Set()
  for (let i = 0; i < views.length; i++) {
    const v = views[i]
    /* 解析视图 id / icon / label：与 renderWorkspaceRegionViewsHtml 同款 resolveWorkspaceViewId 逻辑，
       但这里我们手工取 id/html_page/icon/tabLabel，避免引入额外依赖。 */
    let viewId = ''
    let icon = ''
    let label = ''
    if (v && typeof v === 'object') {
      const o = /** @type {Record<string, unknown>} */ (v)
      const explicit = o.id != null ? String(o.id).trim() : ''
      const fromPage = o.html_page != null ? String(o.html_page).trim() : ''
      viewId = explicit || fromPage || `embed.${i}`
      icon = o.icon != null ? String(o.icon).trim() : ''
      label = o.tabLabel != null ? String(o.tabLabel).trim() : ''
    } else {
      viewId = `embed.${i}`
    }
    if (taken.has(viewId)) {
      let n = 2
      while (taken.has(`${viewId}#${n}`)) n++
      viewId = `${viewId}#${n}`
    }
    taken.add(viewId)
    const root = document.createElement('div')
    root.className = 'cmx-ws-embed-cache-root'
    root.dataset.cmxWsCacheRegion = 'embed'
    root.dataset.cmxWorkspaceId = 'tab:' + String(tab.id)
    /* 用 cmx-ws-region 包装包含 data-cmx-region/data-cmx-view-id 标记，让 hydrate 找到 viewId。 */
    // eslint-disable-next-line no-restricted-syntax -- escAttr 已在外层使用，此处仅模板字面量
    root.innerHTML = `<div class="cmx-ws-region" data-cmx-ws-region="embed" style="display:flex;flex-direction:column;flex:1 1 auto;width:100%;height:100%;min-height:0"><div class="cmx-ws-tab-pane" data-pane-index="0" data-cmx-region="embed" data-cmx-view-id="${escAttr(viewId)}" style="display:flex;flex:1 1 auto;min-height:0;flex-direction:column;overflow:auto">${renderWorkspaceRegionViewsHtml('embed', v)}</div></div>`
    holder.appendChild(root)
    hydrateHtmlPagesWorkspaceViewsInRoot(root)
    queueMicrotask(() => hydrateHtmlPagesWorkspaceViewsInRoot(root))
    tab.workspaceEmbedRoots.set(viewId, { root, icon, label })
  }
  /* 反向登记到 Workspace。 */
  const ws = mainapp.workspaces['tab:' + String(tab.id)]
  if (ws) {
    ws._embedMountRoots = tab.workspaceEmbedRoots
    ws._embedMountHolder = holder
  }
}

export function syncWorkspaceCacheRootLayout (root) {
  root.style.boxSizing = 'border-box'
  root.style.display = 'flex'
  root.style.flexDirection = 'column'
  root.style.flex = '1 1 auto'
  root.style.minHeight = '0'
  root.style.minWidth = '0'
  root.style.width = '100%'
  root.style.alignSelf = 'stretch'
  root.style.overflow = 'hidden'
}

export function disposeWorkspaceMountsForTab (host, tabId) {
  const tab = host._tabs.find((t) => t.id === tabId)
  /* 先关 inner dialog（若开着），让 root 回到 holder，再统一 remove。 */
  const ws = mainapp.workspaces['tab:' + String(tabId)]
  ws?.closeInnerPageView?.()
  const roots = tab?.workspaceMountRoots
  if (roots) {
    for (const k of Object.keys(roots)) {
      const el = roots[k]
      el?.remove()
    }
    tab.workspaceMountRoots = undefined
    tab.workspaceMountSpecs = undefined
  }
  /* 释放 embed 区每 view 独立 root（与 inner 同步）。 */
  if (tab?.workspaceEmbedRoots) {
    for (const entry of tab.workspaceEmbedRoots.values()) entry?.root?.remove()
    tab.workspaceEmbedRoots = undefined
    tab.workspaceEmbedSpec = undefined
  }
  if (ws) {
    ws._innerMountRoot = undefined
    ws._innerMountHolder = undefined
    ws._embedMountRoots = undefined
    ws._embedMountHolder = undefined
  }
  /* 即使 mountRoots 从未创建（tab 未被激活过 / workspaceShell 为空），
     也要释放 mainapp.workspaces[tab:<id>]——renderTabs 给每个 tab 都调过 createWorkspace。 */
  disposeWorkspace('tab:' + String(tabId))
}

export function rebuildTabWorkspaceContent (host, tabId, patch) {
  const tab = host._tabs.find((t) => t.id === tabId)
  if (!tab) return
  const prevShell = tab.workspaceShell && typeof tab.workspaceShell === 'object'
    ? tab.workspaceShell
    : null
  if (patch && Object.prototype.hasOwnProperty.call(patch, 'contentSpec')) {
    const prevContentSpec = tab.contentSpec
    tab.contentSpec = patch.contentSpec
    if (prevContentSpec !== patch.contentSpec) {
      const html = renderWorkspaceRegionViewsHtml('content', patch.contentSpec)
      tab.content = html
      const pane = host.shadowRoot.querySelector(`.tab-pane[data-id="${escAttr(tabId)}"]`)
      if (pane instanceof HTMLElement) {
        // eslint-disable-next-line no-restricted-syntax -- renderWorkspaceRegionViewsHtml 内已 escape
        pane.innerHTML = html
        hydrateHtmlPagesWorkspaceViewsInRoot(pane)
      }
    }
  }
  if (patch && Object.prototype.hasOwnProperty.call(patch, 'workspaceShell')) {
    const nextShell = patch.workspaceShell && typeof patch.workspaceShell === 'object'
      ? patch.workspaceShell
      : null
    tab.workspaceShell = patch.workspaceShell ?? null
    disposeChangedWorkspaceMounts(tab, prevShell, nextShell)
  }
  host._notifyTabActivate()
}

function disposeChangedWorkspaceMounts (tab, prevShell, nextShell) {
  const roots = tab.workspaceMountRoots
  const ws = mainapp.workspaces['tab:' + String(tab.id)]
  if (roots) {
    for (const region of ['explorer', 'property', 'bottom', 'floatview', 'model', 'inner']) {
      const root = roots[region]
      if (!root) continue
      const prevSpec = prevShell ? prevShell[region] : undefined
      const nextSpec = nextShell ? nextShell[region] : undefined
      if (prevSpec === nextSpec) continue
      if (region === 'inner') {
        ws?.closeInnerPageView?.()
        if (ws) {
          ws._innerMountRoot = undefined
          ws._innerMountHolder = undefined
        }
      }
      root.remove()
      roots[region] = undefined
      if (tab.workspaceMountSpecs) tab.workspaceMountSpecs[region] = undefined
    }
  }
  /* embed：spec 引用变了就整体重建（每 view 一 root，逐个对比成本高且收益低）。 */
  if (tab.workspaceEmbedRoots) {
    const prev = prevShell ? prevShell.embed : undefined
    const next = nextShell ? nextShell.embed : undefined
    if (prev !== next) {
      for (const entry of tab.workspaceEmbedRoots.values()) entry?.root?.remove()
      tab.workspaceEmbedRoots = undefined
      tab.workspaceEmbedSpec = undefined
      if (ws) {
        ws._embedMountRoots = undefined
        ws._embedMountHolder = undefined
      }
    }
  }
}
