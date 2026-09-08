import {
  safeUi5IconName,
  hydrateHtmlPagesWorkspaceViewsInRoot,
  collectHtmlPageIdsFromWorkspace,
  renderWorkspaceRegionViewsHtml,
  prepareWorkspaceHtmlPages,
} from '../lib/workspace-node.js'
import { escAttr, escHtml } from '../lib/escape.js'
import { createWorkspace, mainapp, setActiveWorkspace } from '../lib/mainapp.js'
import { disposeWorkspaceMountsForTab, ensureEmbedMountRoots } from './portal-content-area-workspace.js'
import { layoutTabStripOverflow } from './portal-content-area-overflow.js'
import { wireTabStripReorder, reorderByCssOrder } from '../lib/tab-strip-reorder.js'
import { syncContentEmptyState } from '../lib/portal-content-empty-state.js'

let _tabCounter = 0

/* 欢迎 tab 已完全收口到 Workspace.openWorkspaceNode(host, PORTAL_WELCOME_MENU_NODE)，
   与菜单点击 / shellbar home 三条入口同链路，本文件无需再提供 addWelcomeTab；
   _wireWelcomeCheckbox / WELCOME_CONTENT / prepareWorkspaceHtmlPages 等老胶水也一并退役。 */

export function addTab (host, opts) {
  const { id, text, icon, content, closeable = true, workspaceShell } = opts
  const hasDirtyOpt = Object.prototype.hasOwnProperty.call(opts, 'dirty')
  const dirtyValue = hasDirtyOpt ? !!opts.dirty : false
  const hasContentSpecOpt = Object.prototype.hasOwnProperty.call(opts, 'contentSpec')
  const hasLayoutIdOpt = Object.prototype.hasOwnProperty.call(opts, 'workspaceLayoutId')
  const hasOriginalWsOpt = Object.prototype.hasOwnProperty.call(opts, 'originalWorkspace')
  const hasInitCtxOpt = Object.prototype.hasOwnProperty.call(opts, 'initialContext')
  const initialContextOpt = hasInitCtxOpt && opts.initialContext && typeof opts.initialContext === 'object'
    ? /** @type {Record<string, unknown>} */ (opts.initialContext)
    : null
  const tabId = id || `tab-${++_tabCounter}`
  const existing = host._tabs.find(t => t.id === tabId)
  if (existing) {
    if (workspaceShell !== undefined) {
      existing.workspaceShell = workspaceShell === null ? null : workspaceShell
    }
    if (hasContentSpecOpt) existing.contentSpec = opts.contentSpec
    if (hasLayoutIdOpt) existing.workspaceLayoutId = opts.workspaceLayoutId
    if (hasOriginalWsOpt) existing.originalWorkspace = opts.originalWorkspace
    if (initialContextOpt) {
      /* tab 已存在：直接同步写入对应 workspace.context（CE 已 hydrate，change 事件会派发）。 */
      const ws = mainapp.workspaces['tab:' + String(tabId)]
      if (ws) {
        for (const [k, v] of Object.entries(initialContextOpt)) {
          ws.context.set(k, v)
        }
      }
    }
    if (hasDirtyOpt) {
      existing.dirty = dirtyValue
      host._syncTabDirtyVisual(tabId)
    }
    host._selectTab(tabId)
    return tabId
  }
  host._tabs.push({
    id: tabId,
    text,
    icon,
    content,
    closeable,
    dirty: dirtyValue,
    workspaceShell: workspaceShell === undefined ? undefined : workspaceShell,
    contentSpec: hasContentSpecOpt ? opts.contentSpec : undefined,
    workspaceLayoutId: hasLayoutIdOpt ? opts.workspaceLayoutId : undefined,
    originalWorkspace: hasOriginalWsOpt ? opts.originalWorkspace : undefined,
    // 完整原始 menu node 快照（动态节点前进/回退重建用；见 notifyTabActivate）
    sourceNode: opts.sourceNode,
    workspaceDockOpen: undefined,
    workspaceMountRoots: undefined,
    /* 一次性：renderTabs 在 createWorkspace 后注入 ws.context，注入完即清。 */
    initialContext: initialContextOpt,
  })
  renderTabs(host)
  selectTab(host, tabId)
  return tabId
}

export function setTabDirty (host, id, dirty = true) {
  const t = host._tabs.find(x => x.id === id)
  if (t) {
    t.dirty = !!dirty
    host._syncTabDirtyVisual(id)
  }
}

export function getTabDirty (host, id) {
  return !!host._tabs.find(x => x.id === id)?.dirty
}

export function hasAnyDirtyTab (host) {
  return host._tabs.some((t) => t.dirty)
}

export function selectTabById (host, id) {
  if (host._tabs.some((t) => t.id === id)) {
    selectTab(host, id)
  }
}

export function removeTabIds (host, ids) {
  if (!ids.length) return
  const dirtyToClose = ids.filter((id) => {
    const t = host._tabs.find((x) => x.id === id)
    return !!(t?.closeable && t.dirty)
  })
  if (dirtyToClose.length) {
    const ok = window.confirm(`将关闭 ${dirtyToClose.length} 个含未保存修改的标签，确定不保存并关闭吗？`)
    if (!ok) return
  }
  for (const id of ids) {
    disposeWorkspaceMountsForTab(host, id)
    const app = host.closest('cmx-portal-app')
    app?._floatAutoOpenedTabs?.delete?.(String(id))
  }
  const idSet = new Set(ids)
  const prevActive = host._activeTab
  const wasIdx = tabIndex(host, prevActive)
  host._tabs = host._tabs.filter(t => !idSet.has(t.id))
  if (!host._tabs.length) {
    host._activeTab = undefined
  } else if (idSet.has(prevActive)) {
    const ni = Math.min(wasIdx, host._tabs.length - 1)
    host._activeTab = host._tabs[Math.max(0, ni)]?.id
  }
  renderTabs(host)
  host._notifyTabActivate()
}

export function renderTabs (host) {
  const strip = host.shadowRoot.getElementById('tab-bar-strip')
  const body = host.shadowRoot.getElementById('tab-body')
  if (!strip || !body) return
  /* strip（顶部 tab 按钮条）是廉价 DOM，整体重建无副作用——按钮没 CE。
     body（每个 tab 的 pane）则可能含 html_pages CE，重建会让所有现有 CE 走完整
     disconnectedCallback → connectedCallback → initPage 流程，业务侧表现为
     "切到新 tab 时其它 tab 的 fetch 又跑一遍"（trade tab 打开时看到 voucher 的
     account=1001 重发就是这条路径）。所以这里改为 INCREMENTAL：strip 整建，
     body 只增量补充新 pane / 摘掉已关闭 tab 的 pane，已存在的 pane 原地不动。 */
  strip.replaceChildren()
  const existingPanes = new Map()
  for (const p of /** @type {NodeListOf<HTMLElement>} */ (body.querySelectorAll(':scope > .tab-pane'))) {
    if (p.dataset && p.dataset.id) existingPanes.set(p.dataset.id, p)
  }
  const wantedIds = new Set(host._tabs.map((t) => t.id))
  /* 摘除已不在 _tabs 里的 pane：CE 的 disconnectedCallback 会自然触发，
     __cmxDispose 链上的 unregisterView / hostActions.dispose 都是幂等的。 */
  for (const [id, p] of existingPanes) {
    if (!wantedIds.has(id)) {
      p.remove()
      existingPanes.delete(id)
    }
  }

  for (const tab of host._tabs) {
    const item = document.createElement('div')
    item.className = 'tab-item' + (tab.dirty ? ' is-dirty' : '')
    item.dataset.id = tab.id
    const closeTitle = tab.dirty ? '已修改（悬停标签可显示关闭）' : '关闭'
    // eslint-disable-next-line no-restricted-syntax -- icon 经白名单；text/id/closeTitle 经 escAttr/escHtml
    item.innerHTML = `
      <span class="tab-icon-stack"><ui5-icon name="${safeUi5IconName(tab.icon)}"></ui5-icon></span>
      <span>${escHtml(tab.text)}</span>
      ${tab.closeable ? `<span class="tab-close" data-close="${escAttr(tab.id)}" title="${escAttr(closeTitle)}"><span class="tab-close-inner"><span class="tab-close-dot" aria-hidden="true"></span><ui5-icon class="tab-close-x" name="decline"></ui5-icon></span></span>` : ''}
    `
    item.addEventListener('click', e => {
      if (e.target.closest('[data-close]')) return
      host._selectTab(tab.id)
    })
    item.addEventListener('contextmenu', e => {
      if (e.target.closest('[data-close]')) return
      e.preventDefault()
      host._openTabContextMenu(tab.id, item)
    })
    const closeBtn = item.querySelector('[data-close]')
    if (closeBtn) closeBtn.addEventListener('click', () => host._requestCloseTab(tab.id))
    strip.appendChild(item)

    let pane = existingPanes.get(tab.id)
    if (pane) {
      /* 已存在的 pane 原地保留：**不 re-append**。
         之前这里调 body.appendChild(pane) 想让 DOM 顺序与 _tabs 顺序保持一致，但
         WHATWG DOM spec 的 insert 算法对同 parent 的 move 仍是 "remove then insert"，
         有些浏览器实现会顺势 enqueue connectedCallback / disconnectedCallback 反应；
         对内含 cmx-revo-grid 这种 `if (this.shadowRoot) return` 提前返回的 CE 来说，
         disconnect 阶段会 null 掉 `_revo` 等内部引用，reconnect 时却走 guard 直接跳过
         初始化，剩下半死状态——典型表现就是「再点行 grid 没反应」。
         而 .tab-pane.active = display:flex / 其它 = display:none 的渲染策略下，DOM 顺序
         对视觉无影响（仅 .active 的那一份显示），所以 pane 顺序无需与 _tabs 严格对齐。
         pane 顺序仅在新增/删除时由 appendChild/remove 自然维护（新增的总在末尾，跟
         _tabs.push 的语义一致；删除的直接消失）。 */
    } else {
      pane = document.createElement('div')
      pane.className = 'tab-pane'
      pane.dataset.id = tab.id
      pane.dataset.cmxWorkspaceId = 'tab:' + String(tab.id)
      const ws = createWorkspace('tab:' + String(tab.id), { label: tab.text })
      /* initialContext 由 addTab 一次性透传：CE hydrate 之前写入 context，
         视图脚本 initPage 中 host.workspace.context.get(...) 同步可读；写后立即清以免重复注入。 */
      if (tab.initialContext && typeof tab.initialContext === 'object') {
        for (const [k, v] of Object.entries(tab.initialContext)) {
          ws.context.set(k, v)
        }
        tab.initialContext = null
      }
      /* embed 区必须在 content pane 写入 DOM 之前 ensure：content 视图模板中可能含 <cmx-embed-page>，
         其 connectedCallback 立即调 borrowEmbedRoot——若此时 mount roots 尚未创建会拿到 placeholder。
         tab activate 事件触发的 takeWorkspaceMountsForTab 太晚。 */
      const sh = tab.workspaceShell
      if (sh && typeof sh === 'object' && Object.prototype.hasOwnProperty.call(sh, 'embed')) {
        const embedSpec = /** @type {any} */ (sh).embed
        if (embedSpec != null) ensureEmbedMountRoots(host, tab, embedSpec)
      }
      // eslint-disable-next-line no-restricted-syntax -- tab.content 由 addTab 调用方提供，约定为已转义/可信 HTML 片段
      pane.innerHTML = tab.content || ''
      body.appendChild(pane)
    }
  }
  /* hydrate 自带 guard（slot 已含 data-cmx-html-page-host 就跳过），所以对复用的 pane 是 no-op；
     只有新创建的 pane 里 textarea payload 会真正被消费、CE 才会首挂。 */
  hydrateHtmlPagesWorkspaceViewsInRoot(host.shadowRoot)
  refreshActive(host)
  /* content 顶部 tab-bar：同条带 reorder。**用 CSS order** 视觉重排，DOM 不变——
     避免 renderTabs 重建 pane.innerHTML 导致 CE 全部 destroy / unregisterView。
     tab-item 与 tab-pane 用 data-id 配对。 */
  const reorderStrip = host.shadowRoot.getElementById('tab-bar-strip')
  const tabBody = host.shadowRoot.getElementById('tab-body')
  if (reorderStrip instanceof HTMLElement) {
    wireTabStripReorder(reorderStrip, {
      itemSelector: '.tab-item',
      onReorder: (fromIdx, toIdx) => {
        reorderByCssOrder(
          reorderStrip,
          tabBody instanceof HTMLElement ? tabBody : null,
          '.tab-item',
          '.tab-pane',
          fromIdx, toIdx,
          { pairAttr: 'data-id' },
        )
        /* 同步 host._tabs 数组顺序按当前 visual 顺序——保证关闭/活跃 tab 等依赖数组顺序的操作仍正确。 */
        rebuildTabsArrayByVisualOrder(host, reorderStrip)
      },
    })
  }
  syncContentEmptyState(host)
  queueMicrotask(() => layoutTabStripOverflow(host))
}

export function selectTab (host, id) {
  host._activeTab = id
  refreshActive(host)
  host._notifyTabActivate()
  queueMicrotask(() => layoutTabStripOverflow(host))
}

export function notifyTabActivate (host) {
  setActiveWorkspace(host._activeTab != null ? 'tab:' + String(host._activeTab) : null)
  const tab = host._tabs.find(t => t.id === host._activeTab)
  host.dispatchEvent(new CustomEvent('portal-content-tab-activate', {
    bubbles: true,
    composed: true,
    detail: {
      tabId: host._activeTab,
      workspaceShell: tab ? tab.workspaceShell : undefined,
      // 动态 tab（报表等，不在菜单树）打开时的完整 menu node 快照——供 router 存进
      // history.state，浏览器前进/回退时对其 openNode 重建（findByCode 查不到动态 node）。
      node: tab ? tab.sourceNode : undefined,
    },
  }))
  /* Action 兜底 flush：tab 激活后所有按钮 / 菜单都应基于当前 workspace 重算一次。
     仅当 workspace 已建过 _actions 时触发；未建则零开销。 */
  const ws = host._activeTab != null ? mainapp.workspaces['tab:' + String(host._activeTab)] : null
  if (ws && ws._actions) ws._actions.invalidateAll()
}

export function requestCloseTab (host, id) {
  const t = host._tabs.find((x) => x.id === id)
  if (!t?.closeable) return
  if (t.dirty) {
    host._pendingDirtyCloseId = id
    const dlg = host.shadowRoot.getElementById('tab-dirty-close-dialog')
    if (dlg) dlg.open = true
    else closeTabDirect(host, id)
    return
  }
  closeTabDirect(host, id)
}

export function closeTabDirect (host, id) {
  const t = host._tabs.find((x) => x.id === id)
  if (!t?.closeable) return
  disposeWorkspaceMountsForTab(host, id)
  const app = host.closest('cmx-portal-app')
  app?._floatAutoOpenedTabs?.delete?.(String(id))
  const idx = host._tabs.findIndex((x) => x.id === id)
  host._tabs.splice(idx, 1)
  if (host._activeTab === id) {
    host._activeTab = host._tabs[Math.min(idx, host._tabs.length - 1)]?.id
  }
  renderTabs(host)
  host._notifyTabActivate()
}

export function refreshActive (host) {
  host.shadowRoot.querySelectorAll('.tab-item').forEach(el => {
    el.classList.toggle('active', el.dataset.id === host._activeTab)
  })
  host.shadowRoot.querySelectorAll('.tab-pane').forEach(el => {
    el.classList.toggle('active', el.dataset.id === host._activeTab)
  })
}

/**
 * 刷新指定标签页：
 *  - html_pages：`prepareWorkspaceHtmlPages(..., { bustCache: true })` 强制走网络重拉，
 *    写回各 region 视图 `spec.data.htmlPageRunnableDoc`。
 *  - 重建 content pane **以及所有 workspace mount roots**（explorer / property / bottom /
 *    floatview / model / inner / embed）的 CE，让 connectedCallback 重新执行 ->
 *    `initPageModels` -> 触发数据加载接口。
 *  - native_pages：对每个 `cmx-native-pages-host` 调 `_reload({ bustCache: true })` 清缓存重载。
 *
 * @param {PortalContentArea} host
 * @param {string} [tabId] 要刷新的 tab ID；缺省取 `host._activeTab`（供右键菜单刷新非活动 tab）
 * @returns {Promise<boolean>} 是否执行了刷新
 */
export async function refreshActiveTab (host, tabId) {
  const targetId = tabId || host._activeTab
  if (!targetId) {
    console.warn('[portal-content-area] refresh: no active tab')
    return false
  }
  const tab = host._tabs.find(t => t.id === targetId)
  if (!tab) {
    console.warn('[portal-content-area] refresh: tab not found')
    return false
  }
  const sr = host.shadowRoot
  if (!sr) return false
  const pane = sr.querySelector(`.tab-pane[data-id="${escAttr(targetId)}"]`)
  if (!(pane instanceof HTMLElement)) {
    console.warn('[portal-content-area] refresh: pane not found')
    return false
  }
  if (host._refreshInFlight) return false
  host._refreshInFlight = true
  try {
    /* 1) html_pages：合成 workspace 引用 → 强制走网络（bustCache）→ 写回 spec.data */
    const synthWs = { content: tab.contentSpec, ...(tab.workspaceShell || {}) }
    const htmlIds = collectHtmlPageIdsFromWorkspace(synthWs)
    if (htmlIds.length) {
      await prepareWorkspaceHtmlPages(synthWs, { bustCache: true })
    }
    /* 2) native_pages：仅清缓存不重载。第 3) 步会用 pane.innerHTML 整体重建 pane，
       新 host 的 connectedCallback 会单次 _load；若此处也 _reload，旧实例的 _load 与
       新实例的 connectedCallback 各执行一次，导致页面脚本（业务接口）被调用两次。
       故只 cacheOnly 清缓存，把实际加载交给第 3) 步重建出的新实例。 */
    const nativeHosts = /** @type {HTMLElement[]} */ ([
      ...pane.querySelectorAll('cmx-native-pages-host'),
    ])
    await Promise.all(nativeHosts.map((h) => {
      if (h && typeof h._reload === 'function') return h._reload({ bustCache: true, cacheOnly: true })
      return null
    }))
    /* 3) 重建 pane：销毁旧 CE → 写新 innerHTML → 重新 hydrate（用更新后的 spec.data） */
    const html = renderWorkspaceRegionViewsHtml('content', tab.contentSpec)
    tab.content = html
    // eslint-disable-next-line no-restricted-syntax -- tab.content 由 addTab 调用方提供，约定为已转义/可信 HTML 片段；刷新路径同样产自 renderWorkspaceRegionViewsHtml
    pane.innerHTML = html
    hydrateHtmlPagesWorkspaceViewsInRoot(pane)

    /* 4) 重建 workspace mount roots（explorer / property / bottom / floatview / model / inner）：
       逐个清空 innerHTML -> 重新渲染 -> hydrate，让 CE connectedCallback 重新执行 ->
       initPageModels -> 数据加载接口被触发。native_pages CE 也一并覆盖。 */
    const roots = tab.workspaceMountRoots
    if (roots) {
      const shell = tab.workspaceShell || {}
      for (const region of ['explorer', 'property', 'bottom', 'floatview', 'model', 'inner']) {
        const root = roots[region]
        const spec = shell[region]
        if (!root || !spec) continue
        // eslint-disable-next-line no-restricted-syntax -- renderWorkspaceRegionViewsHtml 内部已 escape
        root.innerHTML = renderWorkspaceRegionViewsHtml(region, spec)
        hydrateHtmlPagesWorkspaceViewsInRoot(root)
        const regionNative = /** @type {HTMLElement[]} */ ([...root.querySelectorAll('cmx-native-pages-host')])
        await Promise.all(regionNative.map((h) => {
          if (h && typeof h._reload === 'function') return h._reload({ bustCache: true })
          return null
        }))
      }
    }

    /* 5) embed region：逐个 root 重建 */
    if (tab.workspaceEmbedRoots) {
      for (const entry of tab.workspaceEmbedRoots.values()) {
        const root = entry?.root
        const spec = entry?.spec
        if (!root || !spec) continue
        // eslint-disable-next-line no-restricted-syntax -- renderWorkspaceRegionViewsHtml 内部已 escape
        root.innerHTML = renderWorkspaceRegionViewsHtml('embed', spec)
        hydrateHtmlPagesWorkspaceViewsInRoot(root)
      }
    }

    return true
  } catch (err) {
    console.warn('[portal-content-area] refresh failed:', err)
    return false
  } finally {
    host._refreshInFlight = false
  }
}

function tabIndex (host, id) {
  return host._tabs.findIndex(t => t.id === id)
}

/**
 * 按 reorderStrip 中 .tab-item 当前 visual 顺序（CSS order）重建 host._tabs 数组。
 * tab-item 用 data-id 与 host._tabs[i].id 配对。
 *
 * 这样关闭按钮 / 切活跃 tab 等依赖 host._tabs 顺序的代码无需变更——它们看到的就是
 * 用户重排后的顺序。
 *
 * @param {{ _tabs: Array<{ id: string, [k: string]: unknown }> }} host
 * @param {HTMLElement} strip
 */
function rebuildTabsArrayByVisualOrder (host, strip) {
  const items = Array.from(strip.querySelectorAll('.tab-item')).filter(
    (el) => el instanceof HTMLElement,
  )
  items.sort((a, b) => {
    const oa = parseInt(a.style.order || '0', 10) || 0
    const ob = parseInt(b.style.order || '0', 10) || 0
    return oa - ob
  })
  const idOrder = items.map((it) => it.dataset.id).filter((x) => typeof x === 'string' && x)
  const byId = new Map(host._tabs.map((t) => [t.id, t]))
  const next = []
  for (const id of idOrder) {
    const t = byId.get(id)
    if (t) { next.push(t); byId.delete(id) }
  }
  /* 末尾追加任何未列出的（防御）。 */
  for (const t of byId.values()) next.push(t)
  host._tabs = next
}
