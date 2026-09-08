/**
 * 侧边导航菜单页：menu-pages 加载、搜索绑定、键盘快捷键、内置模板绑定。
 */
import {
  buildExplorerSideNavigation,
  explorerMenuNodeSummary,
  findExplorerMenuNodeById,
  fetchExplorerMenuDocument,
  filterExplorerMenuBySearchText,
  filterExplorerMenuTree,
  getExplorerMenuPayloadForItem,
  getExplorerMenuPermissionContext,
  parseExplorerMenuResponse,
} from '../lib/explorer-menu.js'
import { applyPortalNeoSideNavScrollbar } from '../lib/portal-neo-theme.js'
import {
  applyModulePanelTheme,
  resolveModuleTheme,
} from '../lib/portal-module-theme.js'
import { menuPagesUrl } from './portal-side-nav-shell.js'
import { setWorkspaceExplorer } from './portal-side-nav-workspace.js'
import { safeUi5IconName } from '../lib/workspace-node.js'
import { getMenuCache } from '../lib/menu-cache.js'
import { showCmxError } from 'cmx-data-comp/lib/cmx-toast.js'
import {
  ensureDomainTreeLoaded,
  treeToModules,
  parseDamMenuKey,
} from '../api/domains-tree-api.js'
/* 右键上下文菜单用 ui5-menu（副作用注册自定义元素） */
import '@ui5/webcomponents/dist/Menu.js'
import '@ui5/webcomponents/dist/MenuItem.js'

/** @param {HTMLElement} host @returns {{ id: string, title: string, icon: string, items: unknown[] }[]} */
function getMenuPagesDisplayGroups (host) {
  const h = /** @type {any} */ (host)
  const groups = Array.isArray(h._menuPagesGroups) ? h._menuPagesGroups : []
  return groups.map((g) => ({
    ...g,
    items: filterExplorerMenuBySearchText(/** @type {any} */ (g.items || []), h._menuPagesSearchQuery),
  }))
}

function menuGroupsFromDocument (doc, fallbackTitle) {
  if (doc && typeof doc === 'object' && Array.isArray(/** @type {{ modules?: unknown }} */ (doc).modules)) {
    return /** @type {any[]} */ (/** @type {{ modules: unknown[] }} */ (doc).modules)
      .map((m, idx) => {
        const mo = /** @type {Record<string, unknown>} */ (m || {})
        const id = String(mo.id || mo.module || `module-${idx}`)
        // 配色：按模块 id 用前端色板稳定生成（resolveModuleTheme 的 MODULE_PALETTE），
        // 不再读后端的 theme/themeColor（authorTheme/themeColor 均传 null）——颜色不受后台控制，
        // 但不同模块仍有各自稳定的 accent 色。
        return {
          id,
          title: String(mo.title || mo.name || mo.module || fallbackTitle || `模块 ${idx + 1}`),
          icon: String(mo.icon || 'folder'),
          theme: resolveModuleTheme(id, null, idx),
          items: parseExplorerMenuResponse({ items: Array.isArray(mo.items) ? mo.items : [] }),
        }
      })
  }
  const mainId = 'main'
  return [{
    id: mainId,
    title: fallbackTitle || '菜单',
    icon: 'folder',
    theme: resolveModuleTheme(mainId, null, 0),
    items: parseExplorerMenuResponse(doc),
  }]
}

function flattenGroups (groups) {
  return groups.flatMap((g) => Array.isArray(g.items) ? g.items : [])
}

/** 应用单个面板/导航的主题色（applyModulePanelTheme 的本模块包装，含亮/暗判断）。 */
function applyAccordionTheme (panel, theme, portalThemeId) {
  applyModulePanelTheme(panel, theme, portalThemeId)
}

/**
 * 打开/关闭单个手风琴分组面板（renderMenuPanels 点击互斥与深链自动展开共用一套 DOM 同步）。
 * @param {HTMLElement} panel
 * @param {boolean} open
 */
function setAccordionPanelOpen (panel, open) {
  panel.dataset.open = open ? '1' : '0'
  const head = panel.querySelector('.portal-menu-accordion-head')
  const arrow = panel.querySelector('.portal-menu-accordion-arrow')
  const content = panel.querySelector('.portal-menu-accordion-content')
  if (head instanceof HTMLElement) head.setAttribute('aria-expanded', open ? 'true' : 'false')
  if (arrow && 'name' in arrow) /** @type {{ name: string }} */ (arrow).name = open ? 'slim-arrow-down' : 'slim-arrow-right'
  if (content instanceof HTMLElement) content.hidden = !open
}

/** 重刷已渲染的模块手风琴配色（须在 portal-side-nav 实例上调用，document 查不到 shadow 内节点）。
 *  门户主题切换（亮/暗）时由 portal-side-nav 的 cmx-portal-theme-change 监听触发。 */
export function applyAccordionThemes (host, portalThemeId) {
  const wrap = host.shadowRoot?.querySelector('#portal-menu-panels')
  if (!(wrap instanceof HTMLElement)) return
  wrap.querySelectorAll('.portal-menu-accordion').forEach((el) => {
    if (!(el instanceof HTMLElement)) return
    const raw = el.dataset.moduleTheme || ''
    if (!raw) return
    try {
      const theme = JSON.parse(raw)
      applyAccordionTheme(el, theme, portalThemeId)
      el.querySelectorAll('.portal-menu-side-nav').forEach((nav) => {
        if (nav instanceof HTMLElement) applyAccordionTheme(nav, theme, portalThemeId)
      })
    } catch {}
  })
}

/**
 * 同步菜单选中态：根据当前激活的菜单 code，在 side-nav 所有 ui5-side-navigation 中
 * 选中匹配 data-menu-id 的项，清除其它项的选中。
 *
 * 用途：router 驱动打开 tab（深链 / 浏览器前进后退 / 刷新）时，UI5 side-nav 不会
 * 自动派发 selection-change（只有用户点击才派发），需要显式同步菜单选中态，否则
 * 侧边栏与当前 tab 视觉不一致。
 *
 * 深链定位（20260904）：目标菜单可能位于非首组——首屏默认只展开首组，刷新后目标
 * 分组仍是折叠态、选中项不可见。命中后自动展开其所在分组（互斥，同点击语义），
 * 并把选中项滚动到可视区（已可见时 nearest 滚动为 no-op）。
 *
 * 幂等：菜单未渲染（首次加载）或无匹配项时直接返回，不报错。
 * @param {HTMLElement} sideNavHost portal-side-nav 元素
 * @param {string} menuCode 当前激活的菜单 code（cmx_menu.code）
 */
export function syncMenuSelection (sideNavHost, menuCode) {
  if (!sideNavHost || !menuCode) return
  const root = sideNavHost.shadowRoot
  if (!root) return
  /** @type {NodeListOf<HTMLElement>} */
  const sideNavs = root.querySelectorAll('ui5-side-navigation')
  if (!sideNavs.length) return
  let matched = false
  for (const sn of sideNavs) {
    /** @type {NodeListOf<HTMLElement>} */
    const items = sn.querySelectorAll('ui5-side-navigation-item, ui5-side-navigation-sub-item')
    for (const it of items) {
      if (!(it instanceof HTMLElement)) continue
      const code = it.getAttribute('data-menu-id') || ''
      if (!matched && code === menuCode) {
        /** @type {any} */ (it).selected = true
        matched = true
        expandAndRevealMenuItem(it)
      } else if (/** @type {any} */ (it).selected) {
        /** @type {any} */ (it).selected = false
      }
    }
  }
}

/**
 * 展开选中项所在的手风琴分组并滚动到可视区（syncMenuSelection 专用）。
 * @param {HTMLElement} it 选中的菜单项元素
 */
function expandAndRevealMenuItem (it) {
  const panel = it.closest('.portal-menu-accordion')
  if (panel instanceof HTMLElement && panel.dataset.open !== '1') {
    const wrap = panel.parentElement
    if (wrap instanceof HTMLElement) {
      /* 互斥展开：只开目标组，其余组收起——与用户点击分组头的行为一致。 */
      wrap.querySelectorAll(':scope > .portal-menu-accordion').forEach((el) => {
        if (el instanceof HTMLElement) setAccordionPanelOpen(el, el === panel)
      })
    }
  }
  /* 深链刷新时 UI5 side-navigation 的内部渲染队列晚于本调用（双 rAF 时项高仍为 0，
     scrollIntoView nearest 会误判"无需滚动"）。故轮询等项拿到布局高度再滚（约至多半秒），
     block:'nearest' 保证已完全可见时不滚动（如用户刚点过该菜单），避免无谓跳动。 */
  revealMenuItemWhenLaidOut(it, 30)
}

/**
 * 等菜单项具备布局高度后 scrollIntoView（rAF 轮询，超出帧数上限放弃）。
 * @param {HTMLElement} it 目标菜单项
 * @param {number} tries 剩余重试帧数
 */
function revealMenuItemWhenLaidOut (it, tries) {
  if (!it.isConnected) return  // 期间视图被切走：放弃
  if (it.getBoundingClientRect().height > 0) {
    try { it.scrollIntoView({ block: 'nearest' }) } catch { it.scrollIntoView() }
    return
  }
  if (tries <= 0) return
  requestAnimationFrame(() => revealMenuItemWhenLaidOut(it, tries - 1))
}

function renderMenuPanels (host, groups) {
  const body = host.shadowRoot?.getElementById('panel-body')
  const wrap = body?.querySelector('#portal-menu-panels')
  if (!(wrap instanceof HTMLElement)) return []
  wrap.replaceChildren()
  const sideNavs = []
  for (const [idx, group] of groups.entries()) {
    const panel = document.createElement('section')
    panel.className = 'portal-menu-accordion'
    panel.dataset.open = idx === 0 ? '1' : '0'
    panel.setAttribute('aria-label', group.title || '模块')
    // 应用模块稳定配色（按 id 生成，不读后端 theme）。存 dataset 供 applyAccordionThemes 换肤时重刷。
    try {
      panel.dataset.moduleTheme = JSON.stringify(group.theme)
      applyAccordionTheme(panel, group.theme)
    } catch {}
    const header = document.createElement('button')
    header.type = 'button'
    header.className = 'portal-menu-accordion-head'
    header.setAttribute('aria-expanded', idx === 0 ? 'true' : 'false')
    const arrow = document.createElement('ui5-icon')
    arrow.className = 'portal-menu-accordion-arrow'
    arrow.name = idx === 0 ? 'slim-arrow-down' : 'slim-arrow-right'
    const icon = document.createElement('ui5-icon')
    icon.className = 'portal-menu-module-icon'
    icon.name = safeUi5IconName(group.icon || 'folder')
    const title = document.createElement('span')
    title.className = 'portal-menu-module-title'
    title.textContent = group.title || '模块'
    header.append(arrow, icon, title)
    const content = document.createElement('div')
    content.className = 'portal-menu-accordion-content'
    content.hidden = idx !== 0
    header.addEventListener('click', () => {
      const shouldOpen = panel.dataset.open !== '1'
      wrap.querySelectorAll('.portal-menu-accordion').forEach((el) => {
        if (el instanceof HTMLElement) setAccordionPanelOpen(el, shouldOpen && el === panel)
      })
    })
    panel.appendChild(header)
    const sideNav = document.createElement('ui5-side-navigation')
    sideNav.className = 'explorer-side-nav portal-menu-side-nav'
    sideNav.dataset.moduleId = group.id || ''
    try {
      sideNav.dataset.moduleTheme = JSON.stringify(group.theme)
      applyAccordionTheme(sideNav, group.theme)
    } catch {}
    buildExplorerSideNavigation(sideNav, /** @type {any} */ (group.items || []), {
      highlightQuery: /** @type {any} */ (host)._menuPagesSearchQuery,
    })
    content.appendChild(sideNav)
    panel.appendChild(content)
    wrap.appendChild(panel)
    sideNavs.push(sideNav)
  }
  return sideNavs
}

/** @param {Element} searchEl */
function focusMenuPagesSearchInput (searchEl) {
  const w = /** @type {{ focusInput?: () => void, focus?: () => void }} */ (/** @type {unknown} */ (searchEl))
  if (typeof w.focusInput === 'function') w.focusInput()
  else w.focus?.()
}

/**
 * 文档级 keydown 处理：`/` 和 `Alt+S` 聚焦菜单搜索框。
 * 由 constructor 绑定为 `(e) => onMenuPagesDocKeydown(this, e)`。
 * @param {HTMLElement} host
 * @param {KeyboardEvent} e
 */
export function onMenuPagesDocKeydown (host, e) {
  if (e.defaultPrevented) return
  if (e.isComposing) return
  const body = host.shadowRoot?.getElementById('panel-body')
  const searchEl = body?.querySelector('#portal-menu-search')
  if (!(searchEl instanceof HTMLElement)) return

  const path = e.composedPath()
  const inMenuSearch = path.some(n => n instanceof Element && n.id === 'portal-menu-search')
  if (inMenuSearch) return

  const path0 = path[0]
  if (
    path0 instanceof HTMLInputElement ||
    path0 instanceof HTMLTextAreaElement ||
    path0 instanceof HTMLSelectElement ||
    (path0 instanceof HTMLElement && path0.isContentEditable)
  ) {
    return
  }

  const isAltS = e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 's' || e.key === 'S')
  const isSlash = e.key === '/'
  if (!isAltS && !isSlash) return

  e.preventDefault()
  e.stopPropagation()
  focusMenuPagesSearchInput(searchEl)
}

/**
 * 注册文档级键盘快捷键（幂等）。
 * @param {HTMLElement} host
 */
export function ensureMenuPagesGlobalShortcuts (host) {
  const h = /** @type {any} */ (host)
  if (h._menuPagesShortcutOnDoc) return
  document.addEventListener('keydown', h._onMenuPagesDocKeydown, true)
  h._menuPagesShortcutOnDoc = true
}

/**
 * 注销文档级键盘快捷键。
 * @param {HTMLElement} host
 */
export function teardownMenuPagesGlobalShortcuts (host) {
  const h = /** @type {any} */ (host)
  if (!h._menuPagesShortcutOnDoc) return
  document.removeEventListener('keydown', h._onMenuPagesDocKeydown, true)
  h._menuPagesShortcutOnDoc = false
}

/**
 * 在 panel-body 上委托监听搜索输入（幂等）。
 * @param {HTMLElement} host
 * @param {HTMLElement} body
 */
export function bindMenuPagesSearch (host, body) {
  const h = /** @type {any} */ (host)
  if (body.dataset.portalMenuSearchBound === '1') return
  body.dataset.portalMenuSearchBound = '1'
  const apply = () => {
    const inpEl = body.querySelector('#portal-menu-search')
    if (!inpEl) return
    const v = String((/** @type {{ value?: unknown }} */ (inpEl)).value ?? '')
    h._menuPagesSearchQuery = v
    const sideNavs = renderMenuPanels(host, getMenuPagesDisplayGroups(host))
    for (const sideNav of sideNavs) {
      applyPortalNeoSideNavScrollbar(sideNav)
      wireMenuPagesSideNav(host, sideNav)
    }
  }
  /** @param {Event} e */
  const onMenuSearchInput = (e) => {
    const t = e.target
    if (!(t instanceof Element) || t.id !== 'portal-menu-search') return
    apply()
  }
  body.addEventListener('input', onMenuSearchInput, true)
  body.addEventListener('ui5-input', onMenuSearchInput, true)
  body.addEventListener('change', onMenuSearchInput, true)

  /* 刷新按钮：重新加载当前菜单（沿用记住的 menuKey） */
  const refreshBtn = body.querySelector('#portal-menu-refresh')
  if (refreshBtn instanceof HTMLElement) {
    refreshBtn.addEventListener('click', () => {
      const key = h._menuPagesMenuKey
      if (key == null) return
      void loadMenuPagesMenu(host, key)
    })
  }
}

/**
 * 从 `selection-change` 事件解析菜单载荷：`detail.item` 有时为内部命中节点，与构建菜单时 WeakMap 的 key 不一致。
 * 沿 `composedPath()` 自内向外查找首个已注册 `itemPayload` 的项，再回退 `data-menu-id` + 树查找。
 * @param {HTMLElement} host
 * @param {Event} e
 * @param {unknown} detailItem
 * @returns {{ item: unknown, payload: Record<string, unknown>|null }}
 */
function resolveMenuPagesSelectionPayload (host, e, detailItem) {
  const h = /** @type {any} */ (host)
  /** @param {unknown} el */
  const payloadFor = (el) => getExplorerMenuPayloadForItem(
    el instanceof HTMLElement ? el : null,
  )
  let payload = payloadFor(detailItem)
  let item = detailItem
  if (!payload && typeof e.composedPath === 'function') {
    for (const n of e.composedPath()) {
      const p = payloadFor(n)
      if (p) {
        payload = p
        item = n
        break
      }
    }
  }
  if (!payload && h._menuPagesBaseItems) {
    /** @type {HTMLElement|null} */
    let el = detailItem instanceof HTMLElement ? detailItem : null
    if (!el && typeof e.composedPath === 'function') {
      for (const n of e.composedPath()) {
        if (!(n instanceof HTMLElement)) continue
        if (n.dataset?.menuId || n.getAttribute?.('data-menu-id')) {
          el = n
          break
        }
      }
    }
    if (el instanceof HTMLElement) {
      const mid = el.dataset?.menuId ?? el.getAttribute?.('data-menu-id')
      if (mid) {
        payload = findExplorerMenuNodeById(h._menuPagesBaseItems, mid)
        if (payload) item = el
      }
    }
  }
  return { item, payload }
}

/**
 * 绑定 ui5-side-navigation 的 `selection-change`，派发 `nav-selection`（幂等）。
 *
 * 同时挂一个 `click` 兜底：UI5 仅在选中项变化时派发 `selection-change`，所以
 *   - 点开 A → 关闭 A 的 content tab（UI5 仍以为 A 选中）→ 再点 A，没事件
 *   - 再次点击当前已选中的菜单项也没事件
 * 兜底 click 仅在「该项已 selected 且属于可打开节点」时补派 `nav-selection`；
 * 下游 addTab 自带幂等：tab 不存在则重开，存在但非当前则切换，是当前则 no-op。
 * @param {HTMLElement} host
 * @param {HTMLElement} sideNav
 */
export function wireMenuPagesSideNav (host, sideNav) {
  const h = /** @type {any} */ (host)
  if (sideNav.dataset.portalMenuPagesSelectionWired === '1') return
  sideNav.dataset.portalMenuPagesSelectionWired = '1'
  /* selection-change 与同次 click 总成对触发；click 兜底走 microtask 延后，
     若 selection-change 在同一 tick 内已派发过 nav-selection（设 skipClickToken），
     微任务里直接跳过，避免「打开未选中项时同次触发 prepare 对话框两次」。 */
  let skipClickToken = 0
  sideNav.addEventListener('selection-change', (e) => {
    const { item, payload } = resolveMenuPagesSelectionPayload(host, e, e.detail?.item)
    skipClickToken += 1
    const token = skipClickToken
    queueMicrotask(() => {
      if (skipClickToken === token) skipClickToken = 0
    })
    // 非叶子节点（children 非空）只能展开/收起，不能打开页面；无 workspace 的纯分组 likewise
    const p = /** @type {any} */ (payload)
    const hasKids = Array.isArray(p?.children) && p.children.length > 0
    const openable = p && (p.workspace != null || p.dialogspace != null || p.dialogWorkspace != null)
    if (hasKids || !openable) return
    host.dispatchEvent(new CustomEvent('nav-selection', {
      bubbles: true,
      composed: true,
      detail: {
        view: h._view,
        text: item?.text,
        menu: payload ? explorerMenuNodeSummary(payload) : null,
        item,
      },
    }))
  })
  sideNav.addEventListener('click', (e) => {
    const path = typeof e.composedPath === 'function' ? e.composedPath() : []
    /** @type {HTMLElement|null} */
    let itemEl = null
    for (const n of path) {
      if (!(n instanceof HTMLElement)) continue
      const tag = n.tagName?.toLowerCase?.()
      if (tag === 'ui5-side-navigation-item' || tag === 'ui5-side-navigation-sub-item') {
        itemEl = n
        break
      }
    }
    if (!itemEl) return
    /* 延后到微任务执行（展开切换 + 叶子兜底派发），细节见下方各分支注释。 */
    queueMicrotask(() => {
      const payload = getExplorerMenuPayloadForItem(itemEl)
        || (h._menuPagesBaseItems && (itemEl.dataset?.menuId || itemEl.getAttribute?.('data-menu-id'))
          ? findExplorerMenuNodeById(h._menuPagesBaseItems, itemEl.dataset?.menuId ?? itemEl.getAttribute?.('data-menu-id'))
          : null)
      if (!payload) return
      const p = /** @type {any} */ (payload)
      const hasKids = Array.isArray(p.children) && p.children.length > 0
      /* 非叶子节点：点行=展开/收起（切换 expanded），不打开页面。
         不受 skipClickToken 拦截：首次点击父级项会派发 selection-change（未选中→选中）
         bump token，而展开切换只在本处发生——若被拦截，首次点击就只选中不展开。
         token 仅用于防可打开叶子节点 nav-selection 双派发。 */
      if (hasKids) {
        const it = /** @type {any} */ (itemEl)
        if (typeof it.expanded === 'boolean') it.expanded = !it.expanded
        return
      }
      /* token 守卫：同一次点击若已派发过 selection-change（首次激活/切换叶子项），
         本兜底跳过，避免 nav-selection 双派发（下游会重复弹 prepare 对话框）。 */
      if (skipClickToken !== 0) return
      const hasWorkspace = p && (p.workspace != null || p.dialogspace != null || p.dialogWorkspace != null)
      /* 只对可打开节点（workspace / dialogspace）派发 */
      if (!hasWorkspace) return
      host.dispatchEvent(new CustomEvent('nav-selection', {
        bubbles: true,
        composed: true,
        detail: {
          view: h._view,
          text: itemEl.text,
          menu: explorerMenuNodeSummary(payload),
          item: itemEl,
        },
      }))
    })
  })
  /* 捕获阶段兜底：处理 UI5 原生「照顾不到」的深层菜单项（三层及以上嵌套的 item）。
     UI5 的 SideNavigation.onBeforeRendering() 只沿 allItems（item + 其直接 items，两层）
     注入 sideNavigation 引用；更深的 item 拿不到该引用 → 其 _activate() 短路，
     既不派发 selection-change 也不派发 item-click，且会 stopPropagation()，
     使上面「冒泡阶段」的 click 兜底同样收不到 → 表现为菜单能显示、点了没反应。
     捕获阶段先于目标自身的 _activate() 执行，不受其 stopPropagation 影响，故能补齐。
     判据：itemEl.sideNavigation == null 表示 UI5 不会自处理该项（正是深层项），
     只对这类项兜底；有 sideNavigation 的浅层项交给上面的 selection-change / 冒泡兜底，
     避免 nav-selection 双派发。 */
  sideNav.addEventListener('click', (e) => {
    const path = typeof e.composedPath === 'function' ? e.composedPath() : []
    /** @type {HTMLElement|null} */
    let itemEl = null
    for (const n of path) {
      if (!(n instanceof HTMLElement)) continue
      const tag = n.tagName?.toLowerCase?.()
      if (tag === 'ui5-side-navigation-item' || tag === 'ui5-side-navigation-sub-item') {
        itemEl = n
        break
      }
    }
    if (!itemEl) return
    /* UI5 已能自处理（浅层项有 sideNavigation 引用）→ 让 selection-change / 冒泡兜底走原路径 */
    if (/** @type {any} */ (itemEl).sideNavigation != null) return
    const payload = getExplorerMenuPayloadForItem(itemEl)
      || (h._menuPagesBaseItems && (itemEl.dataset?.menuId || itemEl.getAttribute?.('data-menu-id'))
        ? findExplorerMenuNodeById(h._menuPagesBaseItems, itemEl.dataset?.menuId ?? itemEl.getAttribute?.('data-menu-id'))
        : null)
    if (!payload) return
    const p = /** @type {any} */ (payload)
    const hasKids = Array.isArray(p.children) && p.children.length > 0
    /* 深层非叶子项：点行=展开/收起（UI5 的 _toggle 也短路了，这里手动切） */
    if (hasKids) {
      const it = /** @type {any} */ (itemEl)
      if (typeof it.expanded === 'boolean') it.expanded = !it.expanded
      return
    }
    const hasWorkspace = p && (p.workspace != null || p.dialogspace != null || p.dialogWorkspace != null)
    if (!hasWorkspace) return
    host.dispatchEvent(new CustomEvent('nav-selection', {
      bubbles: true,
      composed: true,
      detail: {
        view: h._view,
        text: itemEl.text,
        menu: explorerMenuNodeSummary(payload),
        item: itemEl,
      },
    }))
  }, true)
  wireMenuPagesContextMenu(host, sideNav)
}

/**
 * 给菜单树挂右键上下文菜单（幂等）：右键某菜单项 → 「展示/编辑选中菜单项」→ 打开工作区节点编辑对话框。
 * 菜单项的 workspace 内联在 explorer-menu.json，故直接用解析出的完整节点 seed 对话框
 * （host._openWorkspaceNodeDialogWithNode），不查独立节点库。
 * @param {HTMLElement} host
 * @param {HTMLElement} sideNav
 */
export function wireMenuPagesContextMenu (host, sideNav) {
  const h = /** @type {any} */ (host)
  if (sideNav.dataset.portalMenuPagesCtxWired === '1') return
  sideNav.dataset.portalMenuPagesCtxWired = '1'

  /** @type {Record<string, unknown>|null} */
  let pendingNode = null
  /** @type {HTMLElement|null} */
  let menu = null

  const ensureMenu = () => {
    if (menu) return menu
    const m = document.createElement('ui5-menu')
    m.id = 'portal-menu-tree-ctx-menu'
    m.setAttribute('horizontal-align', 'Start')
    // eslint-disable-next-line no-restricted-syntax -- 静态字面量模板，无动态片段
    m.innerHTML = '<ui5-menu-item data-action="edit-node" icon="edit" text="编辑菜单节点"></ui5-menu-item>'
    m.addEventListener('item-click', (/** @type {any} */ e) => {
      const item = e?.detail?.item
      const action = item?.getAttribute?.('data-action') || item?.dataset?.action
      if (action !== 'edit-node' || !pendingNode) return
      const node = pendingNode
      /* 与 nav-selection 一致：派发冒泡+composed 事件，由 portal-app 接住调对话框。
         不能直接调 host 方法——此处 host 是 portal-side-nav，编辑对话框方法在 portal-app 上。 */
      host.dispatchEvent(new CustomEvent('nav-edit-node', {
        bubbles: true,
        composed: true,
        detail: { node },
      }))
    })
    /* 挂到 host shadowRoot，与侧栏同根，定位/主题一致 */
    host.shadowRoot.appendChild(m)
    menu = m
    return m
  }

  /** @param {MouseEvent} e */
  const onContextMenu = (e) => {
    const path = typeof e.composedPath === 'function' ? e.composedPath() : []
    /** @type {HTMLElement|null} */
    let itemEl = null
    for (const n of path) {
      if (!(n instanceof HTMLElement)) continue
      const tag = n.tagName?.toLowerCase?.()
      if (tag === 'ui5-side-navigation-item' || tag === 'ui5-side-navigation-sub-item') { itemEl = n; break }
    }
    if (!itemEl) return
    const payload = getExplorerMenuPayloadForItem(itemEl)
      || (h._menuPagesBaseItems && (itemEl.dataset?.menuId || itemEl.getAttribute?.('data-menu-id'))
        ? findExplorerMenuNodeById(h._menuPagesBaseItems, itemEl.dataset?.menuId ?? itemEl.getAttribute?.('data-menu-id'))
        : null)
    if (!payload) return

    e.preventDefault()
    e.stopPropagation()
    pendingNode = /** @type {Record<string, unknown>} */ (payload)

    const m = ensureMenu()
    const mAny = /** @type {any} */ (m)
    const doOpen = () => { mAny.opener = itemEl; mAny.open = true }
    /* ui5-menu 关闭是异步过程；已打开时需等 close 再重开，否则连续右键丢弹。 */
    if (mAny.open) {
      m.addEventListener('close', () => requestAnimationFrame(doOpen), { once: true })
      mAny.open = false
      return
    }
    doOpen()
  }

  sideNav.addEventListener('contextmenu', onContextMenu)
}

/**
 * 绑定内置模板 `ui5-side-navigation` 的占位 selection-change（若存在）。
 * @param {HTMLElement} host
 * @param {HTMLElement} body
 */
export function wireBuiltInSideNavIfAny (host, body) {
  const h = /** @type {any} */ (host)
  const sideNav = body.querySelector('ui5-side-navigation')
  if (!sideNav) return
  sideNav.addEventListener('selection-change', (e) => {
    host.dispatchEvent(new CustomEvent('nav-selection', {
      bubbles: true,
      composed: true,
      detail: { text: e.detail?.item?.text, view: h._view, menu: null, item: e.detail?.item },
    }))
  })
}

/**
 * 异步拉取菜单 -> 渲染 ui5-side-navigation -> 绑定事件。
 * 走 DAM 派生：模块（总账/报表）来自 DAM，各模块业务菜单从 cmx_menu 读取
 * （GET /api/menu/tree，经 menu-cache.js 共享缓存；旧 /api/menu-pages?menu=dam:… 已废弃替代）。
 * @param {HTMLElement} host
 * @param {string} menuKey
 */
export async function loadMenuPagesMenu (host, menuKey) {
  const h = /** @type {any} */ (host)
  const body = host.shadowRoot.getElementById('panel-body')
  if (!body) return
  /* 记住当前菜单 key，供「刷新」按钮重新加载用 */
  h._menuPagesMenuKey = menuKey
  const strip = body.querySelector('#portal-menu-strip')
  const busy = body.querySelector('#portal-menu-busy')
  const myGen = ++h._menuPagesLoadGen
  h._menuPagesBaseItems = null
  h._menuPagesGroups = []
  h._menuPagesSearchQuery = ''
  if (strip) {
    strip.hidden = true
    strip.textContent = ''
  }
  if (busy && 'active' in busy) /** @type {{ active: boolean }} */ (busy).active = true
  try {
    // DAM 菜单：从域-应用-模块树 reduce 出模块骨架（替代旧 /api/menu-pages?menu=dam:X/Y）。
    // 各模块的真实业务菜单通过共享缓存（menu-cache.js）取：
    //   首次访问任意 activity 时一次 GET /api/menu/tree 加载全量，
    //   后续所有模块/路由复用同一份内存缓存，前端按 (domain|app|module) 过滤。
    const damKey = parseDamMenuKey(menuKey)
    /** @type {{ modules: any[], source: string }} 拼装兼容 menuGroupsFromDocument 的文档结构 */
    let rawDoc
    let damModules = []
    if (damKey) {
      const tree = await ensureDomainTreeLoaded()
      damModules = treeToModules(tree, damKey.domainId, damKey.applicationId)
      rawDoc = { source: 'dam', modules: damModules }
    } else {
      // 【遗留分支】非 DAM 菜单 key（如 setting-menu）走旧 menu-pages 文档接口。
      // 注意：后端 GET /api/menu-pages 路由已注释废弃（cmx-common-api portal/mod.rs），且 setting-menu
      // 已是死代码（见 portal-settings-menu-node.js）——本分支当前不可达、若触发会 404，保留仅为兼容回退。
      rawDoc = await fetchExplorerMenuDocument(menuPagesUrl(host, menuKey))
      damModules = (rawDoc && Array.isArray(rawDoc.modules)) ? rawDoc.modules : []
    }
    if (myGen !== h._menuPagesLoadGen) return
    const menuCache = getMenuCache()
    await Promise.all(damModules.map(async (mod, idx) => {
      try {
        const items = await menuCache.getModuleNodes({
          domain: mod.domain, application: mod.application, module: mod.module,
        })
        damModules[idx].items = items
      } catch (err) {
        // 模块级失败此前完全静默（该模块组直接消失，用户以为没配置）；一行提示让失败可见。
        showCmxError(`模块「${mod.module || mod.application || ''}」菜单加载失败`, err)
        damModules[idx].items = []
      }
    }))
    if (myGen !== h._menuPagesLoadGen) return
    const ctx = getExplorerMenuPermissionContext()
    const groups = menuGroupsFromDocument(rawDoc, host.getAttribute('side-nav-title')?.trim() || '')
      .map((g) => ({ ...g, items: filterExplorerMenuTree(/** @type {any} */ (g.items), ctx) }))
      .filter((g) => Array.isArray(g.items) && g.items.length)
    h._menuPagesGroups = groups
    h._menuPagesBaseItems = flattenGroups(groups)
    const searchEl = body.querySelector('#portal-menu-search')
    if (searchEl) /** @type {{ value?: string }} */ (/** @type {unknown} */ (searchEl)).value = ''
    const sideNavs = renderMenuPanels(host, getMenuPagesDisplayGroups(host))
    for (const sideNav of sideNavs) {
      applyPortalNeoSideNavScrollbar(sideNav)
      wireMenuPagesSideNav(host, sideNav)
    }
    bindMenuPagesSearch(host, body)
    ensureMenuPagesGlobalShortcuts(host)
    if (h._workspaceExplorerSpec) {
      setWorkspaceExplorer(host, h._workspaceExplorerSpec)
    }
    /* 菜单渲染完成 → 通知 portal-app 同步选中态。
       深链 / 刷新 / 切 activity 场景下，tab 先于菜单激活，UI5 不会自动选中，
       需在菜单就位后让 portal-app 按 currentTabId 显式同步。 */
    host.dispatchEvent(new CustomEvent('portal-menu-rendered', {
      bubbles: true,
      composed: true,
      detail: { menuKey },
    }))
  } catch (err) {
    if (myGen !== h._menuPagesLoadGen) return
    const msg = err instanceof Error ? err.message : String(err)
    if (strip) {
      strip.textContent = msg
      strip.hidden = false
    }
    const panelWrap = body.querySelector('#portal-menu-panels')
    if (panelWrap instanceof HTMLElement) panelWrap.replaceChildren()
  } finally {
    if (busy && 'active' in busy) /** @type {{ active: boolean }} */ (busy).active = false
  }
}
