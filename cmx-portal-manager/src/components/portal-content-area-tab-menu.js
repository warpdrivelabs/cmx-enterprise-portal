import {
  htmlPageIdFromViewSpec,
  normalizeWorkspaceRegionViews,
  safeUi5IconName,
  workspaceRegionGroupLabel,
} from '../lib/workspace-node.js'

export function wireTabContextMenuRoot (host) {
  const menu = host.shadowRoot.getElementById('tab-ctx-menu')
  if (!menu) return
  menu.addEventListener('item-click', (e) => {
    const item = e.detail?.item
    const action = item?.getAttribute?.('data-action') || item?.dataset?.action
    if (action === 'ws-focus') {
      const region = item?.getAttribute?.('data-region') || item?.dataset?.region
      const viewIndex = parseInt(String(item?.getAttribute?.('data-view-index') ?? item?.dataset?.viewIndex ?? '0'), 10)
      const tabId = item?.getAttribute?.('data-context-tab-id') || item?.dataset?.contextTabId
      if (region === 'explorer' || region === 'property' || region === 'bottom' || region === 'floatview') {
        host.dispatchEvent(new CustomEvent('portal-workspace-view-focus', {
          bubbles: true,
          composed: true,
          detail: { tabId, region, viewIndex: Number.isNaN(viewIndex) ? 0 : viewIndex },
        }))
      }
      return
    }
    if (!action) return
    runTabContextAction(host, action)
  })
  menu.addEventListener('close', () => {
    if (host._suppressNextCtxMenuClose) {
      host._suppressNextCtxMenuClose = false
      return
    }
    host._contextTabId = null
  })
}

export function wireDirtyCloseDialog (host) {
  const dlg = host.shadowRoot.getElementById('tab-dirty-close-dialog')
  if (!dlg || dlg.dataset.cmxDirtyDlgWired === '1') return
  dlg.dataset.cmxDirtyDlgWired = '1'
  dlg.addEventListener('close', () => {
    host._pendingDirtyCloseId = null
  })
  const cancel = () => {
    dlg.open = false
    host._pendingDirtyCloseId = null
  }
  host.shadowRoot.getElementById('dirty-close-cancel')?.addEventListener('click', cancel)
  host.shadowRoot.getElementById('dirty-close-discard')?.addEventListener('click', () => {
    const id = host._pendingDirtyCloseId
    cancel()
    if (id) host._closeTabDirect(id)
  })
  host.shadowRoot.getElementById('dirty-close-save')?.addEventListener('click', () => {
    const id = host._pendingDirtyCloseId
    cancel()
    if (!id) return
    host.dispatchEvent(new CustomEvent('portal-content-tab-save-request', {
      bubbles: true,
      composed: true,
      detail: { tabId: id },
    }))
    host.setTabDirty(id, false)
    host._closeTabDirect(id)
  })
}

export function syncTabDirtyVisual (host, id) {
  const tab = host._tabs.find((t) => t.id === id)
  const item = [...host.shadowRoot.querySelectorAll('.tab-item')].find((el) => el.dataset.id === id)
  if (!tab || !item) return
  item.classList.toggle('is-dirty', !!tab.dirty)
  const closeEl = item.querySelector('.tab-close')
  if (closeEl) {
    closeEl.title = tab.dirty ? '已修改（悬停标签可显示关闭）' : '关闭'
  }
}

export function tabIndex (host, id) {
  return host._tabs.findIndex(t => t.id === id)
}

export function updateContextMenuState (host) {
  const id = host._contextTabId
  const idx = id == null ? -1 : tabIndex(host, id)
  const tab = idx >= 0 ? host._tabs[idx] : null

  const closeableLeft = idx > 0 && host._tabs.slice(0, idx).some(t => t.closeable)
  const closeableRight = idx >= 0 && idx < host._tabs.length - 1 && host._tabs.slice(idx + 1).some(t => t.closeable)
  const otherCloseable = host._tabs.some(t => t.closeable && t.id !== id)
  const anySavedCloseable = host._tabs.some(t => t.closeable && !t.dirty)
  const anyCloseable = host._tabs.some(t => t.closeable)

  const setDis = (menuId, dis) => {
    const el = host.shadowRoot.getElementById(menuId)
    if (el) el.disabled = dis
  }

  setDis('ctx-m-refresh', !tab)
  setDis('ctx-m-close', !tab?.closeable)
  setDis('ctx-m-close-others', idx < 0 || !otherCloseable)
  setDis('ctx-m-close-left', !tab || !closeableLeft)
  setDis('ctx-m-close-right', !tab || !closeableRight)
  setDis('ctx-m-close-saved', !anySavedCloseable)
  setDis('ctx-m-close-all', !anyCloseable)

  const hasWorkspace = !!(tab && tab.workspaceLayoutId && tab.contentSpec != null)
  const wsSep = host.shadowRoot.getElementById('ctx-m-ws-sep')
  if (wsSep) wsSep.style.display = hasWorkspace ? '' : 'none'
  const saveItem = host.shadowRoot.getElementById('ctx-m-ws-save-layout')
  const resetItem = host.shadowRoot.getElementById('ctx-m-ws-reset-layout')
  if (saveItem) saveItem.style.display = hasWorkspace ? '' : 'none'
  if (resetItem) resetItem.style.display = hasWorkspace ? '' : 'none'
  setDis('ctx-m-ws-save-layout', !hasWorkspace)
  setDis('ctx-m-ws-reset-layout', !hasWorkspace)

  const htmlPageId = tabFirstContentHtmlPageId(tab)
  const hasEditable = !!htmlPageId
  const modelPageId = tabModelHtmlPageId(tab)
  const hasModelEditable = !!modelPageId
  const editSep = host.shadowRoot.getElementById('ctx-m-edit-html-sep')
  const editItem = host.shadowRoot.getElementById('ctx-m-edit-html-page')
  const editModelItem = host.shadowRoot.getElementById('ctx-m-edit-model-page')
  if (editSep) editSep.style.display = (hasEditable || hasModelEditable) ? '' : 'none'
  if (editItem) editItem.style.display = hasEditable ? '' : 'none'
  setDis('ctx-m-edit-html-page', !hasEditable)
  if (editModelItem) editModelItem.style.display = hasModelEditable ? '' : 'none'
  setDis('ctx-m-edit-model-page', !hasModelEditable)

  rebuildTabContextWorkspaceMenu(host, tab)
}

function tabFirstContentHtmlPageId (tab) {
  if (!tab || tab.contentSpec == null) return ''
  const views = normalizeWorkspaceRegionViews(tab.contentSpec)
  if (views.length !== 1) return ''
  const only = views[0]
  const type = String((only && only.type) || '').trim().toLowerCase()
  if (type !== 'html_pages') return ''
  return htmlPageIdFromViewSpec(only)
}

function tabModelHtmlPageId (tab) {
  const shell = tab?.workspaceShell
  if (!shell || typeof shell !== 'object') return ''
  const modelSpec = shell.model
  if (modelSpec == null) return ''
  const views = normalizeWorkspaceRegionViews(modelSpec)
  if (!views.length) return ''
  const first = views[0]
  const type = String((first && first.type) || '').trim().toLowerCase()
  if (type !== 'html_pages') return ''
  return htmlPageIdFromViewSpec(first)
}

function rebuildTabContextWorkspaceMenu (host, tab) {
  const menu = host.shadowRoot.getElementById('tab-ctx-menu')
  if (!menu) return
  menu.querySelector('[data-cmx-ws-ctx="views-root"]')?.remove()

  const shell = tab && typeof tab.workspaceShell === 'object' && tab.workspaceShell != null
    ? tab.workspaceShell
    : null
  if (!shell) return

  const regions = ['explorer', 'property', 'bottom', 'floatview']
  let hasAny = false
  for (const reg of regions) {
    if (normalizeWorkspaceRegionViews(shell[reg]).length) {
      hasAny = true
      break
    }
  }
  if (!hasAny) return

  const closeMi = menu.querySelector('#ctx-m-close')
  if (!closeMi) return

  const viewsRoot = document.createElement('ui5-menu-item')
  viewsRoot.setAttribute('text', '视图')
  viewsRoot.setAttribute('icon', 'detail-view')
  viewsRoot.setAttribute('data-cmx-ws-ctx', 'views-root')

  let firstRegion = true
  for (const reg of regions) {
    const views = normalizeWorkspaceRegionViews(shell[reg])
    if (!views.length) continue
    if (!firstRegion) {
      const sep = document.createElement('ui5-menu-separator')
      viewsRoot.appendChild(sep)
    }
    firstRegion = false
    const title = workspaceRegionGroupLabel(shell[reg], reg)
    views.forEach((v, i) => {
      const lab = String(v.tabLabel || '').trim() || `视图 ${i + 1}`
      const leaf = document.createElement('ui5-menu-item')
      leaf.setAttribute('text', `${title} · ${lab}`)
      const icRaw = v && typeof v === 'object' && v.icon != null && String(v.icon).trim() !== ''
        ? String(v.icon).trim()
        : 'detail-view'
      leaf.setAttribute('icon', safeUi5IconName(icRaw))
      leaf.setAttribute('data-action', 'ws-focus')
      leaf.setAttribute('data-region', reg)
      leaf.setAttribute('data-view-index', String(i))
      leaf.setAttribute('data-context-tab-id', String(tab.id))
      viewsRoot.appendChild(leaf)
    })
  }

  menu.insertBefore(viewsRoot, closeMi.nextSibling)
}

export function openTabContextMenu (host, tabId, openerEl) {
  host._contextTabId = tabId
  updateContextMenuState(host)
  const menu = host.shadowRoot.getElementById('tab-ctx-menu')
  if (!menu || !openerEl) return
  const doOpen = () => {
    menu.opener = openerEl
    menu.open = true
  }
  if (menu.open) {
    host._suppressNextCtxMenuClose = true
    menu.addEventListener('close', () => {
      requestAnimationFrame(doOpen)
    }, { once: true })
    menu.open = false
    return
  }
  doOpen()
}

export function runTabContextAction (host, action) {
  const id = host._contextTabId
  if (id == null) return
  const idx = tabIndex(host, id)
  if (idx < 0) return

  if (action === 'refresh') {
    /* 右键菜单「刷新页面」：刷新右键命中的 tab（_contextTabId），不强制切换活动 tab。
       html_pages 走网络重拉、native_pages 清缓存重载、统一重建 pane。 */
    void host._refreshActiveTab?.(id)
    return
  }
  if (action === 'close') {
    host._requestCloseTab(id)
    return
  }
  if (action === 'close-others') {
    const remove = host._tabs.filter(t => t.closeable && t.id !== id).map(t => t.id)
    host._removeTabIds(remove)
    return
  }
  if (action === 'close-left') {
    const remove = host._tabs.slice(0, idx).filter(t => t.closeable).map(t => t.id)
    host._removeTabIds(remove)
    return
  }
  if (action === 'close-right') {
    const remove = host._tabs.slice(idx + 1).filter(t => t.closeable).map(t => t.id)
    host._removeTabIds(remove)
    return
  }
  if (action === 'close-saved') {
    const remove = host._tabs.filter(t => t.closeable && !t.dirty).map(t => t.id)
    host._removeTabIds(remove)
    return
  }
  if (action === 'close-all') {
    const remove = host._tabs.filter(t => t.closeable).map(t => t.id)
    host._removeTabIds(remove)
    return
  }
  if (action === 'ws-save-layout') {
    host.dispatchEvent(new CustomEvent('portal-workspace-save-layout', {
      bubbles: true,
      composed: true,
      detail: { tabId: id },
    }))
    return
  }
  if (action === 'ws-reset-layout') {
    host.dispatchEvent(new CustomEvent('portal-workspace-reset-layout', {
      bubbles: true,
      composed: true,
      detail: { tabId: id },
    }))
    return
  }
  if (action === 'edit-html-page') {
    const tab = host._tabs.find((t) => t.id === id)
    const views = tab && tab.contentSpec != null ? normalizeWorkspaceRegionViews(tab.contentSpec) : []
    const viewSpec = views[0] || null
    host.dispatchEvent(new CustomEvent('portal-workspace-view-context-action', {
      bubbles: true,
      composed: true,
      detail: { tabId: id, region: 'content', viewIndex: 0, viewSpec, action: 'edit-html-page' },
    }))
  }
  if (action === 'edit-model-page') {
    const tab = host._tabs.find((t) => t.id === id)
    const shell = tab?.workspaceShell
    const modelSpec = shell && typeof shell === 'object' ? shell.model : null
    const views = modelSpec != null ? normalizeWorkspaceRegionViews(modelSpec) : []
    const viewSpec = views[0] || null
    host.dispatchEvent(new CustomEvent('portal-workspace-view-context-action', {
      bubbles: true,
      composed: true,
      detail: { tabId: id, region: 'model', viewIndex: 0, viewSpec, action: 'edit-html-page' },
    }))
  }
}
