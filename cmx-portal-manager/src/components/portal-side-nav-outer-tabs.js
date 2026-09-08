/**
 * 侧边导航外层 Tab 条：渲染、溢出布局、显隐切换。
 */
import {
  computeVisibleTabRange,
  hiddenTabIndices,
  TAB_OVERFLOW_BTN_RESERVE,
} from '../lib/tab-strip-overflow.js'
import {
  normalizeWorkspaceRegionViews,
  workspaceRegionOuterTabText,
  workspaceRegionOuterTabIcon,
  safeUi5IconName,
} from '../lib/workspace-node.js'
import { parseSideNavSpecFromAttrs } from './portal-side-nav-shell.js'

/**
 * 绑定外层 Tab 溢出下拉菜单 & 溢出按钮（幂等）。
 * @param {HTMLElement} host
 */
export function wireOuterTabOverflowRoot (host) {
  const sr = host.shadowRoot
  const menu = sr.getElementById('outer-tab-overflow-menu')
  const btn = sr.getElementById('outer-tab-overflow-btn')
  if (menu && !menu.dataset.portalOverflowBound) {
    menu.dataset.portalOverflowBound = '1'
    menu.addEventListener('item-click', (e) => {
      const item = e.detail?.item
      const oid = item?.getAttribute?.('data-outer-id') || item?.dataset?.outerId
      if (!oid) return
      sr.querySelectorAll('.outer-tab').forEach((el) => {
        el.classList.toggle('active', el.dataset.outerId === oid)
      })
      menu.open = false
      queueMicrotask(() => layoutOuterTabStripOverflow(host))
    })
  }
  if (btn && !btn.dataset.portalOverflowBound) {
    btn.dataset.portalOverflowBound = '1'
    btn.addEventListener('click', () => {
      if (!menu) return
      menu.opener = btn
      menu.open = true
    })
  }
}

/**
 * 根据 spec + workspaceSpec 组装 `host._outerTabDefs`。
 * @param {HTMLElement} host
 */
export function buildOuterTabDefs (host) {
  const h = /** @type {any} */ (host)
  const fromAttr = host.getAttribute('side-nav-title')?.trim()
  const spec = parseSideNavSpecFromAttrs(host)
  const text = fromAttr || spec?.title || ' '
  const mainAct =
    h._activityIcon != null && String(h._activityIcon).trim()
      ? safeUi5IconName(h._activityIcon)
      : ''
  /** @type {{ id: string, text: string, icon?: string }[]} */
  const defs = [mainAct ? { id: 'main', text, icon: mainAct } : { id: 'main', text }]
  const w = h._workspaceExplorerSpec
  if (normalizeWorkspaceRegionViews(w).length) {
    defs.push({
      id: 'workspace',
      text: workspaceRegionOuterTabText(w, '工作区'),
      icon: workspaceRegionOuterTabIcon(w, 'document'),
    })
  }
  h._outerTabDefs = defs
}

/**
 * 把 `host._outerTabDefs` 渲染成 DOM Tab 按钮，绑定点击事件。
 * @param {HTMLElement} host
 */
export function syncOuterTabStrip (host) {
  const h = /** @type {any} */ (host)
  const strip = host.shadowRoot.getElementById('outer-tab-strip')
  if (!strip) return
  buildOuterTabDefs(host)
  strip.replaceChildren()
  h._outerTabDefs.forEach((def) => {
    const t = document.createElement('div')
    const isActive = def.id === h._outerExplorerActive
    t.className = 'outer-tab' + (isActive ? ' active' : '')
    t.dataset.outerId = def.id
    if (def.icon) {
      t.style.display = 'inline-flex'
      t.style.alignItems = 'center'
      t.style.minWidth = '0'
      const ic = document.createElement('ui5-icon')
      ic.name = safeUi5IconName(def.icon)
      ic.style.width = '15px'
      ic.style.height = '15px'
      ic.style.flexShrink = '0'
      ic.style.marginRight = '6px'
      const span = document.createElement('span')
      span.textContent = def.text
      span.style.overflow = 'hidden'
      span.style.textOverflow = 'ellipsis'
      span.style.whiteSpace = 'nowrap'
      t.append(ic, span)
    } else {
      t.textContent = def.text
    }
    t.addEventListener('click', () => {
      setOuterExplorerActive(host, def.id)
    })
    strip.appendChild(t)
  })
  queueMicrotask(() => layoutOuterTabStripOverflow(host))
}

/**
 * 切换 active 外层签并刷新 pane 显隐。
 * @param {HTMLElement} host
 * @param {string} outerId
 */
export function setOuterExplorerActive (host, outerId) {
  const h = /** @type {any} */ (host)
  h._outerExplorerActive = outerId === 'workspace' ? 'workspace' : 'main'
  const strip = host.shadowRoot.getElementById('outer-tab-strip')
  strip?.querySelectorAll('.outer-tab').forEach((el) => {
    el.classList.toggle('active', el.dataset.outerId === outerId)
  })
  applyOuterExplorerPaneVisibility(host)
  queueMicrotask(() => layoutOuterTabStripOverflow(host))
}

/**
 * 按 `host._outerExplorerActive` 控制各 pane 显隐。
 * @param {HTMLElement} host
 */
export function applyOuterExplorerPaneVisibility (host) {
  const h = /** @type {any} */ (host)
  const body = host.shadowRoot.getElementById('panel-body')
  if (!body) return
  const showWs = h._outerExplorerActive === 'workspace' && normalizeWorkspaceRegionViews(h._workspaceExplorerSpec).length > 0
  /* built-in 模板未包在 .explorer-menu-view 内，必须按「除工作区 pane 外的所有子节点」切换显隐 */
  for (const el of body.children) {
    if (!(el instanceof HTMLElement)) continue
    if (el.id === 'cmx-workspace-explorer-pane') {
      el.style.display = showWs ? 'flex' : 'none'
    } else {
      el.style.display = showWs ? 'none' : ''
    }
  }
}

/**
 * 计算溢出宽度，更新按钮显隐与溢出 ui5-menu 条目。
 * @param {HTMLElement} host
 */
export function layoutOuterTabStripOverflow (host) {
  const h = /** @type {any} */ (host)
  const sr = host.shadowRoot
  const row = sr.getElementById('outer-tab-row')
  const strip = sr.getElementById('outer-tab-strip')
  const wrap = sr.getElementById('outer-tab-overflow-wrap')
  const btn = sr.getElementById('outer-tab-overflow-btn')
  const menu = sr.getElementById('outer-tab-overflow-menu')
  if (!row || !strip || !wrap || !btn || !menu) return
  const items = [...strip.querySelectorAll('.outer-tab')]
  if (!items.length) {
    wrap.style.display = 'none'
    return
  }
  items.forEach((el) => {
    el.style.display = 'flex'
    el.style.flexShrink = '0'
  })
  const widths = items.map((el) => el.getBoundingClientRect().width)
  const activeEl = strip.querySelector('.outer-tab.active')
  let activeIdx = items.indexOf(activeEl)
  if (activeIdx < 0) activeIdx = 0
  const { start, end, needsOverflow } = computeVisibleTabRange(
    widths,
    activeIdx,
    row.clientWidth,
    TAB_OVERFLOW_BTN_RESERVE
  )
  for (let i = 0; i < items.length; i++) {
    items[i].style.display = i >= start && i < end ? 'flex' : 'none'
  }
  wrap.style.display = needsOverflow ? '' : 'none'
  while (menu.firstChild) menu.removeChild(menu.firstChild)
  if (needsOverflow) {
    for (const i of hiddenTabIndices(h._outerTabDefs.length, start, end)) {
      const def = h._outerTabDefs[i]
      if (!def) continue
      const mi = document.createElement('ui5-menu-item')
      mi.setAttribute('text', def.text)
      mi.setAttribute('icon', safeUi5IconName(def.icon || 'document'))
      mi.setAttribute('data-outer-id', def.id)
      menu.appendChild(mi)
    }
  }
}
