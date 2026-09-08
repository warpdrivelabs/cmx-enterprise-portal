import { escHtml } from './escape.js'
import { safeUi5IconName } from './workspace-view-renderer.js'

/**
 * @param {Array<any>} views
 * @param {'ai-dev'|'ai'|'detail'|number} activeTab
 */
export function buildFloatWindowTabs (views, activeTab) {
  const tabs = [{
    key: 'ai-dev',
    label: 'AI 开发助手',
    icon: 'ai',
    active: activeTab === 'ai-dev',
    className: 'tab-btn tab-btn-ai-dev',
    draggable: false,
  }, {
    key: 'ai',
    label: 'AI 助手',
    icon: 'ai',
    active: activeTab === 'ai',
    className: 'tab-btn tab-btn-ai',
    draggable: false,
  }, {
    key: 'detail',
    label: '详情',
    icon: 'detail-view',
    active: activeTab === 'detail',
    className: 'tab-btn tab-btn-detail',
    draggable: false,
  }]
  views.forEach((view, index) => {
    const label = String((view && view.tabLabel) || '').trim() || `视图 ${index + 1}`
    const rawIcon = view && typeof view === 'object' && view.icon != null ? String(view.icon).trim() : ''
    tabs.push({
      key: String(index),
      label,
      icon: safeUi5IconName(rawIcon || 'document'),
      active: activeTab === index,
      className: 'tab-btn cmx-ws-tab-btn',
      draggable: true,
      paneIndex: index,
    })
  })
  return tabs
}

/** @param {Array<{ key: string, label: string, icon: string, active: boolean, className: string, draggable: boolean, paneIndex?: number }>} tabs */
export function renderFloatWindowTabBarHtml (tabs) {
  return tabs.map((tab) => {
    const activeClass = tab.active ? ' active' : ''
    const paneIndexAttr = Number.isFinite(tab.paneIndex) ? ` data-pane-index="${tab.paneIndex}"` : ''
    const draggableAttr = tab.draggable ? ' draggable="true"' : ''
    return `<button type="button" class="${tab.className}${activeClass}" data-tab-key="${escHtml(tab.key)}"${paneIndexAttr} role="tab" aria-selected="${tab.active}"${draggableAttr}>`
      + `<ui5-icon name="${escHtml(tab.icon)}"></ui5-icon><span>${escHtml(tab.label)}</span></button>`
  }).join('')
}

/** @param {HTMLElement|null} tabBarEl @param {'ai-dev'|'ai'|'detail'|number} activeTab */
export function syncFloatWindowTabBarState (tabBarEl, activeTab) {
  if (!(tabBarEl instanceof HTMLElement)) return
  const aiDevActive = activeTab === 'ai-dev'
  const aiActive = activeTab === 'ai'
  const detailActive = activeTab === 'detail'
  tabBarEl.querySelectorAll('.tab-btn').forEach((button) => {
    if (!(button instanceof HTMLElement)) return
    const key = button.dataset.tabKey
    let on = false
    if (key === 'ai-dev') on = aiDevActive
    else if (key === 'ai') on = aiActive
    else if (key === 'detail') on = detailActive
    else if (!aiDevActive && !aiActive && !detailActive) on = parseInt(String(key ?? ''), 10) === activeTab
    button.classList.toggle('active', on)
    button.setAttribute('aria-selected', String(on))
  })
}

/** @param {HTMLElement|null} mountRoot @param {'ai'|'detail'|number} activeTab */
export function syncFloatWorkspacePaneState (mountRoot, activeTab) {
  if (!(mountRoot instanceof HTMLElement) || typeof activeTab !== 'number') return
  const region = mountRoot.querySelector('.cmx-ws-region') || mountRoot
  region.querySelectorAll('.cmx-ws-tab-pane').forEach((pane) => {
    if (!(pane instanceof HTMLElement)) return
    const paneIndex = parseInt(pane.getAttribute('data-pane-index') || '', 10)
    pane.style.display = paneIndex === activeTab ? 'flex' : 'none'
  })
}
