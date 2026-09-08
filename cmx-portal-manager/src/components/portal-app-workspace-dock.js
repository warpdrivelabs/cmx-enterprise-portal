import {
  clearDockLayout,
  deriveDockLayoutFromWorkspace,
  moveViewInWorkspace,
  writeDockLayout,
} from '../lib/workspace-dock-layout.js'
import { workspaceShellSnapshot } from '../lib/workspace-node.js'

/**
 * 由四个 dock 面板（含 content）派发的 `portal-workspace-view-dropped` 处理：
 * 1) 从当前 outer ws tab 取出 contentSpec + workspaceShell + layoutId
 * 2) 重组为 ws-like，调 moveViewInWorkspace
 * 3) 拆回 content / shell，写回 tab，重新挂载（cache root 清空 → portal-content-tab-activate 重新走 lazy mount）
 * 4) 派生 layout JSON 写 localStorage
 *
 * @param {HTMLElement} host
 * @param {{ tabId?: string, sourceRegion?: string, viewKey?: string, targetRegion?: string, targetIndex?: number }} detail
 */
export function applyViewDrop (host, detail) {
  const sr = host.shadowRoot
  const content = sr?.getElementById('content-area')
  const logPanel = sr?.getElementById('log-panel')
  if (!content) return
  const tabId = String(detail.tabId || '')
  if (!tabId) return
  const layoutId = typeof content.getTabWorkspaceLayoutId === 'function'
    ? content.getTabWorkspaceLayoutId(tabId)
    : ''
  if (!layoutId) return
  const contentSpec = typeof content.getTabContentSpec === 'function' ? content.getTabContentSpec(tabId) : undefined
  const shell = typeof content.getTabWorkspaceShell === 'function' ? content.getTabWorkspaceShell(tabId) : undefined
  const sourceRegion = detail.sourceRegion
  const targetRegion = detail.targetRegion
  const viewKey = String(detail.viewKey || '')
  if (!viewKey) return
  if (sourceRegion !== 'explorer' && sourceRegion !== 'content' && sourceRegion !== 'property' && sourceRegion !== 'bottom' && sourceRegion !== 'floatview') return
  if (targetRegion !== 'explorer' && targetRegion !== 'content' && targetRegion !== 'property' && targetRegion !== 'bottom' && targetRegion !== 'floatview') return
  /** @type {Record<string, unknown>} */
  const wsLike = {}
  if (contentSpec !== undefined) wsLike.content = contentSpec
  if (shell && typeof shell === 'object') {
    /* 保留 shell 的**全部**区域（含 model/inner/embed 等非 dock 区）：
       moveViewInWorkspace / deriveDockLayoutFromWorkspace 只处理 dock 区
       （explorer/content/property/bottom/floatview），非 dock 区原样带上、引用不变，
       使 workspaceShellSnapshot 输出仍含它们；rebuild 时 disposeChangedWorkspaceMounts
       判定 prev===next 不销毁——否则 embed root（含正被 cmx-embed-page 借出的）会被误删导致页面消失。 */
    for (const k of Object.keys(/** @type {Record<string, unknown>} */ (shell))) {
      wsLike[k] = /** @type {Record<string, unknown>} */ (shell)[k]
    }
  }
  const targetIndex = Number.isFinite(detail.targetIndex) ? Number(detail.targetIndex) : Number.MAX_SAFE_INTEGER
  const moved = moveViewInWorkspace(wsLike, sourceRegion, viewKey, targetRegion, targetIndex)
  if (!moved) return
  const newContentSpec = Object.prototype.hasOwnProperty.call(wsLike, 'content') ? wsLike.content : null
  const newShell = workspaceShellSnapshot(wsLike) || null
  if (typeof content.rebuildTabWorkspaceContent === 'function') {
    content.rebuildTabWorkspaceContent(tabId, {
      contentSpec: newContentSpec,
      workspaceShell: newShell,
    })
  }
  try {
    writeDockLayout(layoutId, deriveDockLayoutFromWorkspace(wsLike))
  } catch (err) {
    console.warn('[cmx-portal-app] writeDockLayout failed', err)
    logPanel?.addLog?.('视图位置写入失败：' + (err instanceof Error ? err.message : String(err)), 'warn', 'Workspace')
    return
  }
  logPanel?.addLog?.('视图已移动并保存', 'info', 'Workspace')
}

/** @param {HTMLElement} host */
/** @param {string} tabId */
export function saveCurrentTabDockLayout (host, tabId) {
  const sr = host.shadowRoot
  const content = sr?.getElementById('content-area')
  const logPanel = sr?.getElementById('log-panel')
  if (!content) return
  const layoutId = typeof content.getTabWorkspaceLayoutId === 'function' ? content.getTabWorkspaceLayoutId(tabId) : ''
  if (!layoutId) return
  const contentSpec = typeof content.getTabContentSpec === 'function' ? content.getTabContentSpec(tabId) : undefined
  const shell = typeof content.getTabWorkspaceShell === 'function' ? content.getTabWorkspaceShell(tabId) : undefined
  /** @type {Record<string, unknown>} */
  const wsLike = {}
  if (contentSpec !== undefined) wsLike.content = contentSpec
  if (shell && typeof shell === 'object') {
    /* 保留 shell 的**全部**区域（含 model/inner/embed 等非 dock 区）：
       moveViewInWorkspace / deriveDockLayoutFromWorkspace 只处理 dock 区
       （explorer/content/property/bottom/floatview），非 dock 区原样带上、引用不变，
       使 workspaceShellSnapshot 输出仍含它们；rebuild 时 disposeChangedWorkspaceMounts
       判定 prev===next 不销毁——否则 embed root（含正被 cmx-embed-page 借出的）会被误删导致页面消失。 */
    for (const k of Object.keys(/** @type {Record<string, unknown>} */ (shell))) {
      wsLike[k] = /** @type {Record<string, unknown>} */ (shell)[k]
    }
  }
  try {
    writeDockLayout(layoutId, deriveDockLayoutFromWorkspace(wsLike))
    logPanel?.addLog?.('已保存视图位置', 'info', 'Workspace')
  } catch (err) {
    console.warn('[cmx-portal-app] writeDockLayout failed', err)
    logPanel?.addLog?.('保存视图位置失败：' + (err instanceof Error ? err.message : String(err)), 'warn', 'Workspace')
  }
}

/** @param {HTMLElement} host */
/** @param {string} tabId */
export function resetTabDockLayout (host, tabId) {
  const sr = host.shadowRoot
  const content = sr?.getElementById('content-area')
  const logPanel = sr?.getElementById('log-panel')
  if (!content) return
  const layoutId = typeof content.getTabWorkspaceLayoutId === 'function' ? content.getTabWorkspaceLayoutId(tabId) : ''
  if (!layoutId) return
  try {
    clearDockLayout(layoutId)
  } catch (err) {
    console.warn('[cmx-portal-app] clearDockLayout failed', err)
    logPanel?.addLog?.('重置视图位置失败：' + (err instanceof Error ? err.message : String(err)), 'warn', 'Workspace')
    return
  }
  const original = typeof content.getTabOriginalWorkspace === 'function'
    ? content.getTabOriginalWorkspace(tabId)
    : null
  if (!original || typeof original !== 'object') {
    logPanel?.addLog?.('已清除存储的视图位置（缺少原始布局快照，下次打开生效）', 'info', 'Workspace')
    return
  }
  const newContentSpec = Object.prototype.hasOwnProperty.call(original, 'content')
    ? /** @type {Record<string, unknown>} */ (original).content
    : null
  const newShell = workspaceShellSnapshot(/** @type {Record<string, unknown>} */ (original)) || null
  /* 重置只针对 dock 区（explorer/content/property/bottom/floatview）。
     embed/model/inner 是非 dock 区，不参与位置重置——original 是 structuredClone，其 embed 引用与
     当前 spec 不同，若用克隆引用会让 disposeChangedWorkspaceMounts 误判变化、销毁正被 cmx-embed-page
     借出的 root 且不重建。故用**当前 shell 的引用**覆盖这几个区，保持引用不变。 */
  if (newShell && typeof newShell === 'object') {
    const curShell = typeof content.getTabWorkspaceShell === 'function' ? content.getTabWorkspaceShell(tabId) : null
    for (const k of ['model', 'inner', 'embed']) {
      if (curShell && typeof curShell === 'object' && Object.prototype.hasOwnProperty.call(curShell, k)) {
        newShell[k] = /** @type {Record<string, unknown>} */ (curShell)[k]
      } else {
        delete newShell[k]
      }
    }
  }
  if (typeof content.rebuildTabWorkspaceContent === 'function') {
    content.rebuildTabWorkspaceContent(tabId, {
      contentSpec: newContentSpec,
      workspaceShell: newShell,
    })
  }
  logPanel?.addLog?.('已重置视图位置到菜单定义的原位置', 'info', 'Workspace')
}
