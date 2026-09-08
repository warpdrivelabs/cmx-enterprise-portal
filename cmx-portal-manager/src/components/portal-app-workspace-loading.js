import {
  shellHasWorkspaceRegionViews,
  dockOpenFromPref,
  applyLayout,
} from './portal-app-layout.js'
import {
  ensureDomainTreeLoaded,
  treeToDomains,
  treeToActivities,
} from '../api/domains-tree-api.js'
import { loadActiveDam, saveActiveDam } from '../lib/dam-context.js'

/**
 * 首屏初始化：加载域-应用-模块树，恢复上次域，应用首个活动。
 * 替代旧的 ensureDomainsLoaded + /api/activities 三步链路，改为一次 /api/domains/tree。
 * @param {HTMLElement} host
 * @param {{ applyActivity: (host: HTMLElement, id: string, visible: boolean, extra?: object) => void }} inject
 */
export async function syncInitialActivityFromDefinitions (host, { applyActivity }) {
  try {
    const tree = await ensureDomainTreeLoaded()
    const domains = treeToDomains(tree)
    // 优先恢复上次持久化的域 + 应用（用户上次选择）；找不到或无记录才回退 domains[0] / list[0]
    const saved = loadActiveDam()
    const matched = saved ? domains.find((d) => d.id === saved.domain) : null
    const targetDomain = matched || domains[0] || null
    if (!targetDomain) return

    const shellbar = host.shadowRoot?.querySelector('portal-shellbar')
    if (shellbar && domains.length) {
      shellbar.setDomains(domains, targetDomain.id)
    }

    // 从树 reduce 出当前域的活动列表（缓存到 _activitiesByDomain）
    const list = treeToActivities(tree, targetDomain.id)

    /* 告知活动栏刷新为当前域的活动列表（直接注入数组，不再发请求） */
    const activityBar = host.shadowRoot?.querySelector('portal-activity-bar')
    if (activityBar && typeof activityBar._setActivities === 'function') {
      activityBar._setActivities(list)
    }

    if (!list.length) return
    // 应用恢复优先级：持久化的 application > host._activeActivity > list[0]
    // 同域多应用场景下，saved.application 让 F5 后恢复到上次的应用而非 list[0]
    let initialId = ''
    if (saved?.application && list.some((a) => a.id === saved.application)) {
      initialId = saved.application
    } else if (host._activeActivity && list.some((a) => a.id === host._activeActivity)) {
      initialId = host._activeActivity
    } else {
      initialId = list[0].id
    }
    host._activeActivity = initialId
    const row = list.find((a) => a.id === initialId) || list[0]
    if (row) {
      applyActivity(host, row.id, host._sideNavVisible, { sideNav: row.sideNav, label: row.label })
      // 程序自动选中（首屏/恢复）不派发 activity-change，这里补存 application，
      // 让下次 F5 能稳定恢复（含 saved.application 命中失败回退 list[0] 的场景）。
      saveActiveDam({ domain: targetDomain.id, application: row.id })
    }
  } catch (err) {
    /* 活动栏仍可用内置 fallback（正常降级，不弹窗）；至少留日志便于排查 */
    console.warn('[portal-app-workspace-loading] 首屏活动初始化失败（回退内置活动栏）:', err)
  }
}

/**
 * 子组件可能在 `_setupEvents` 之前派发 `portal-content-tab-activate`，此处补一次 dock 显隐。
 * @param {HTMLElement} host
 */
export function syncPropertyAndLogDockFromContentShell (host, syncFloatWindow) {
  const ca = host.shadowRoot.getElementById('content-area')
  if (!ca || typeof ca.getActiveWorkspaceShell !== 'function') return
  const sh = ca.getActiveWorkspaceShell()
  const tabId = typeof ca.getActiveTabId === 'function' ? ca.getActiveTabId() : undefined
  const prefs = tabId && typeof ca.getTabWorkspaceDockOpen === 'function' ? ca.getTabWorkspaceDockOpen(tabId) : undefined
  host._propertyVisible = dockOpenFromPref(shellHasWorkspaceRegionViews(sh, 'property'), prefs?.property)
  host._logVisible = dockOpenFromPref(shellHasWorkspaceRegionViews(sh, 'bottom'), prefs?.bottom)
  applyLayout(host)
  const mounts = tabId && typeof ca.takeWorkspaceMountsForTab === 'function'
    ? ca.takeWorkspaceMountsForTab(tabId)
    : {}
  syncFloatWindow(host, tabId, sh, mounts?.floatview)
}

/**
 * HTML 页批量从后端拉取时的全屏等待（`ui5-busy-indicator`），挂到 `document.body`。
 *
 * 反闪烁四件套：
 * - **show-delay 200ms**：请求若在 200ms 内返回（命中缓存或本地服务器），遮罩**根本不出现**。
 * - **min-visible 250ms**：一旦真的显示，至少保留 250ms 才允许移除，避免「出现即消失」式闪烁。
 * - **opacity 双 rAF 淡入 / 单 rAF 淡出 + `color-mix(--sapBackgroundColor)`**：跟随当前主题（不再硬编码白底），暗色主题不再突兀；
 *   双 rAF 保证浏览器先把 `opacity:0` 落到首帧，再过渡到 `opacity:1`（单 rAF 在某些内核会被合并、跳过 transition）。
 * - **复用单例 + `display:none`**：不再 `el.remove()`，避免每次开关都重新触发一次 layout/paint reflow。
 *
 * 状态机：idle → pending-show（计时中）→ visible（已显示，记录 shownAt）→ pending-hide（min-visible 未到，延后移除）→ idle。
 * @param {HTMLElement} host
 * @param {boolean} on
 */
export function setHtmlPagesWorkspaceLoading (host, on) {
  const id = 'portal-html-pages-batch-loading'
  const SHOW_DELAY = 200
  const MIN_VISIBLE = 250
  const FADE_MS = 140

  const ensureEl = () => {
    let el = document.getElementById(id)
    if (el) return el
    el = document.createElement('div')
    el.id = id
    el.setAttribute('role', 'status')
    el.setAttribute('aria-live', 'polite')
    el.style.cssText =
      'position:fixed;inset:0;z-index:20000;display:none;align-items:center;justify-content:center;'
      + 'background:color-mix(in srgb, var(--sapBackgroundColor, #fff) 70%, transparent);'
      + 'backdrop-filter:saturate(1.2) blur(1px);'
      + `opacity:0;transition:opacity ${FADE_MS}ms ease;`
      + 'pointer-events:auto;contain:layout paint style'
    // eslint-disable-next-line no-restricted-syntax -- 静态字面量
    el.innerHTML =
      '<ui5-busy-indicator active delay="0" text-placement="Bottom" text="正在加载页面…" '
      + 'style="width:auto;min-width:6rem"></ui5-busy-indicator>'
    document.body.appendChild(el)
    return el
  }
  const mount = () => {
    const el = ensureEl()
    const bi = el.querySelector('ui5-busy-indicator')
    if (bi) /** @type {{ active?: boolean }} */ (bi).active = true
    el.style.display = 'flex'
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (host._loadingState?.phase === 'visible') el.style.opacity = '1'
      })
    })
  }
  const unmount = () => {
    const el = document.getElementById(id)
    if (!el) return
    el.style.opacity = '0'
    setTimeout(() => {
      if (host._loadingState && host._loadingState.phase !== 'idle') return
      el.style.display = 'none'
      const bi = el.querySelector('ui5-busy-indicator')
      if (bi) /** @type {{ active?: boolean }} */ (bi).active = false
    }, FADE_MS)
  }

  const s = host._loadingState
  if (on) {
    if (s?.phase === 'pending-hide') {
      clearTimeout(s.hideTimer)
      const el = document.getElementById(id)
      if (el) el.style.opacity = '1'
      host._loadingState = { phase: 'visible', shownAt: s.shownAt }
      return
    }
    if (s) return
    host._loadingState = {
      phase: 'pending-show',
      showTimer: setTimeout(() => {
        if (host._loadingState?.phase !== 'pending-show') return
        host._loadingState = { phase: 'visible', shownAt: performance.now() }
        mount()
      }, SHOW_DELAY),
    }
    return
  }
  if (!s) return
  if (s.phase === 'pending-show') {
    clearTimeout(s.showTimer)
    host._loadingState = null
    return
  }
  if (s.phase === 'visible') {
    const remain = Math.max(0, MIN_VISIBLE - (performance.now() - s.shownAt))
    host._loadingState = {
      phase: 'pending-hide',
      shownAt: s.shownAt,
      hideTimer: setTimeout(() => {
        host._loadingState = { phase: 'idle' }
        unmount()
        host._loadingState = null
      }, remain),
    }
  }
}
