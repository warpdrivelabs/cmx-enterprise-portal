/**
 * 工作区六个区域（explorer / content / property / bottom / floatview / prepare）tab 上下文菜单：
 *
 * - 多视图区域：右键 `.cmx-ws-tab-btn` 打开；目标视图 = 该按钮的 `data-pane-index`。
 * - 单视图区域：右键区域 pane 任意位置或面板「上部 tab 头」打开；目标视图 = 第 0 个。
 *
 * 仅当目标视图 `type === 'html_pages'` 且具备页面 ID 时启用「在 HTML 设计器中编辑」。
 *
 * 触发后通过 `portal-workspace-view-context-action` 事件冒泡到 host（`composed:true`），
 * 由 `portal-app` 集中分发实际行为（激活视图 / 打开设计器）。
 */

import { htmlPageIdFromViewSpec, normalizeWorkspaceRegionViews } from './workspace-node.js'

/** @typedef {'explorer'|'content'|'property'|'bottom'|'floatview'|'prepare'} DockRegion */

/**
 * 在 root（shadowRoot 或普通 HTMLElement）内挂一个 `<ui5-menu>`（lazy；幂等）+ 注册 contextmenu。
 *
 * @param {ShadowRoot|HTMLElement} root 宿主面板 shadowRoot 或对话框 light-DOM 容器
 * @param {() => HTMLElement|null|undefined} getPane 当前区域可视 pane（拖拽 / 右键命中范围）
 * @param {DockRegion} region 区域 key
 * @param {() => string} getActiveWorkspaceTabId 当前激活 outer ws content tab id（无 ws 时返回空串）
 * @param {() => unknown} getCurrentSpec 本面板当前区域 raw spec
 * @param {{ getOuterTab?: () => HTMLElement|null|undefined, dispatchTarget?: () => EventTarget|null|undefined, hideActivateView?: boolean }} [opts]
 *   `getOuterTab`：面板顶部「上部 tab 头」（如 explorer `.outer-tab` / property `.prop-outer-tab` /
 *   bottom `.tab-btn[data-id="cmx_ws_bottom"]` / prepare 对话框 `#workspace-prepare-header`）。
 *   在该区域**单视图**时也响应右键，作为 pane fallback。
 *   `dispatchTarget`：派发 `portal-workspace-view-context-action` 的目标；shadow 场景下默认 `root.host`，
 *   light-DOM 场景需显式给出（如对话框 → portal-app host）。
 *   `hideActivateView`：固定隐藏「激活该视图」菜单项（活动侧栏 html_pages 等无 outer ws tab 场景；
 *   tab 自身点击即激活，菜单仅保留「在 HTML 设计器中编辑」）。
 * @returns {() => void} 解绑函数
 */
export function wireWorkspaceRegionTabContextMenu (root, getPane, region, getActiveWorkspaceTabId, getCurrentSpec, opts = {}) {
  /** @type {HTMLElement|null} */
  let menu = null
  /** @type {{ tabId: string, region: DockRegion, viewIndex: number, viewSpec: Record<string, unknown>|null }|null} */
  let pendingCtx = null

  const ensureMenu = () => {
    if (menu) return menu
    const m = document.createElement('ui5-menu')
    m.id = `cmx-ws-region-ctx-menu-${region}`
    m.setAttribute('horizontal-align', 'Start')
    // eslint-disable-next-line no-restricted-syntax -- 静态字面量模板，无动态片段
    m.innerHTML = [
      '<ui5-menu-item data-action="activate-view" icon="visits" text="激活该视图"></ui5-menu-item>',
      '<ui5-menu-separator></ui5-menu-separator>',
      '<ui5-menu-item data-action="edit-html-page" icon="edit" text="在 HTML 设计器中编辑"></ui5-menu-item>',
    ].join('')
    m.addEventListener('item-click', (/** @type {any} */ e) => {
      const item = e?.detail?.item
      const action = item?.getAttribute?.('data-action') || item?.dataset?.action
      if (!action || !pendingCtx) return
      if (item?.hasAttribute?.('disabled')) return
      const detail = {
        tabId: pendingCtx.tabId,
        region: pendingCtx.region,
        viewIndex: pendingCtx.viewIndex,
        viewSpec: pendingCtx.viewSpec,
        action,
      }
      const target = typeof opts.dispatchTarget === 'function'
        ? opts.dispatchTarget()
        : (/** @type {any} */ (root).host || null)
      target?.dispatchEvent?.(new CustomEvent('portal-workspace-view-context-action', {
        bubbles: true,
        composed: true,
        detail,
      }))
    })
    root.appendChild(m)
    menu = m
    return m
  }

  /** @param {MouseEvent} e */
  const onContextMenu = (e) => {
    const t = /** @type {Element|null} */ (e.target)
    if (!(t instanceof Element)) return
    const pane = getPane()
    const outerTab = typeof opts.getOuterTab === 'function' ? opts.getOuterTab() || null : null
    const inPane = !!(pane && pane.contains(t))
    const inOuterTab = !!(outerTab && outerTab.contains(t))
    if (!inPane && !inOuterTab) return
    const tabId = getActiveWorkspaceTabId()
    if (!tabId) return
    const spec = getCurrentSpec()
    const views = normalizeWorkspaceRegionViews(/** @type {any} */ (spec))
    if (!views.length) return

    /** @type {number} */
    let viewIndex = 0
    /** @type {HTMLElement|null} */
    let opener = null
    const btn = inPane ? t.closest('.cmx-ws-tab-btn') : null
    if (btn instanceof HTMLElement && pane && pane.contains(btn)) {
      const idxStr = btn.getAttribute('data-pane-index') || btn.dataset.paneIndex
      const idx = parseInt(String(idxStr ?? '0'), 10)
      if (!Number.isNaN(idx)) viewIndex = idx
      opener = btn
    } else {
      /* 单视图区域无内层 tab 条；content 区不允许在内容区域抢占原生右键，仅其它区域走 pane / outer-tab 兜底 */
      if (region === 'content') return
      if (views.length > 1) return
      opener = inOuterTab && outerTab instanceof HTMLElement ? outerTab : (pane instanceof HTMLElement ? pane : null)
    }

    const viewSpec = views[viewIndex] || null
    if (!viewSpec) return

    e.preventDefault()
    e.stopPropagation()

    const m = ensureMenu()
    pendingCtx = {
      tabId,
      region,
      viewIndex,
      viewSpec: /** @type {Record<string, unknown>} */ (viewSpec),
    }

    /* 启停「在 HTML 设计器中编辑」 */
    const editItem = m.querySelector('[data-action="edit-html-page"]')
    if (editItem) {
      const isHtmlPages = String((/** @type {any} */ (viewSpec)).type || '').trim().toLowerCase() === 'html_pages'
      const pageId = isHtmlPages ? htmlPageIdFromViewSpec(/** @type {any} */ (viewSpec)) : ''
      if (pageId) editItem.removeAttribute('disabled')
      else editItem.setAttribute('disabled', '')
    }
    /* prepare 阶段尚未挂载 content 标签；隐藏「激活该视图」与其分隔符。
       hideActivateView=true（活动侧栏 html_pages 等）同样隐藏。 */
    const activateItem = m.querySelector('[data-action="activate-view"]')
    const sep = m.querySelector('ui5-menu-separator')
    const hideActivate = region === 'prepare' || opts.hideActivateView === true
    if (hideActivate) {
      if (activateItem instanceof HTMLElement) activateItem.hidden = true
      if (sep instanceof HTMLElement) sep.hidden = true
    } else {
      if (activateItem instanceof HTMLElement) activateItem.hidden = false
      if (sep instanceof HTMLElement) sep.hidden = false
    }

    const mAny = /** @type {any} */ (m)
    const doOpen = () => {
      mAny.opener = opener
      mAny.open = true
    }
    /* ui5-menu 关闭是异步过程（popup 销毁 + close 事件），微任务内重开会被忽略。
       必须等到 close 事件后才能再次 open，否则连续右键时会丢弹。 */
    if (mAny.open) {
      m.addEventListener('close', () => {
        requestAnimationFrame(doOpen)
      }, { once: true })
      mAny.open = false
      return
    }
    doOpen()
  }

  /** 委托到 root：pane 替换重建后仍生效；getPane().contains(t) 保证作用域。 */
  root.addEventListener('contextmenu', onContextMenu)

  return () => {
    root.removeEventListener('contextmenu', onContextMenu)
    if (menu && menu.parentNode === root) root.removeChild(menu)
    menu = null
    pendingCtx = null
  }
}
