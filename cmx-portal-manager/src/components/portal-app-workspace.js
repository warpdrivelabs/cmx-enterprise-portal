import { getCachedActivityEntry } from '../api/domains-tree-api.js'
import { WorkspaceNode } from '../lib/workspace-node.js'
import { DialogWorkspaceNode } from '../lib/dialog-workspace-node.js'
import { applyLayout } from './portal-app-layout.js'
import {
  syncInitialActivityFromDefinitions as syncInitialActivityFromDefinitionsImpl,
  syncPropertyAndLogDockFromContentShell as syncPropertyAndLogDockFromContentShellImpl,
  setHtmlPagesWorkspaceLoading,
} from './portal-app-workspace-loading.js'
import {
  openWorkspaceNodeWithPrepare,
} from './portal-app-workspace-prepare.js'
import {
  applyViewDrop,
  saveCurrentTabDockLayout,
  resetTabDockLayout,
} from './portal-app-workspace-dock.js'
import {
  syncFloatWindow,
  openHtmlPageInDesigner,
} from './portal-app-workspace-float.js'
import {
  onProfileAccount,
  onProfileLogout,
} from './portal-app-workspace-profile.js'
import { portalDisplayText } from '../lib/display-text.js'

export async function syncInitialActivityFromDefinitions (host) {
  await syncInitialActivityFromDefinitionsImpl(host, {
    applyActivity,
  })
}

/**
 * @param {HTMLElement} host
 * @param {string} id
 * @param {boolean} visible
 * @param {{ sideNav?: { type: string, menu?: string, template?: string, views?: object[], title?: string }, label?: string }} [extra]
 */
export function applyActivity (host, id, visible, extra = {}) {
  const sr = host.shadowRoot
  const bar = sr.querySelector('portal-activity-bar')
  bar?.syncFromHost?.(id, visible)
  host._activeActivity = id
  host._sideNavVisible = visible
  let { sideNav, label } = extra
  const row = id ? getCachedActivityEntry(id) : null
  if (!sideNav && id && row) {
    sideNav = row.sideNav
    label = label || row.label
  }
  const sideNavEl = sr.querySelector('portal-side-nav')
  if (sideNavEl && typeof sideNavEl.applyHostActivitySideNav === 'function') {
      sideNavEl.applyHostActivitySideNav({
        sideNav: sideNav ?? null,
        label: label ?? sideNav?.title ?? null,
        viewId: id,
        activityIcon: row?.icon ?? null,
      })
  }
  applyLayout(host)
}

/**
 * 子组件可能在 `_setupEvents` 之前派发 `portal-content-tab-activate`，此处补一次 dock 显隐。
 * @param {HTMLElement} host
 */
export function syncPropertyAndLogDockFromContentShell (host) {
  syncPropertyAndLogDockFromContentShellImpl(host, syncFloatWindow)
}

/**
 * 检测菜单节点是否为 dialog 类型（含 `dialogspace` 或 `dialogWorkspace` 字段）。
 * @param {unknown} menuNode
 * @returns {boolean}
 */
function isDialogMenuNode (menuNode) {
  if (!menuNode || typeof menuNode !== 'object') return false
  const m = /** @type {Record<string, unknown>} */ (menuNode)
  const ex = m.extras && typeof m.extras === 'object' ? /** @type {Record<string, unknown>} */ (m.extras) : null
  return (m.dialogspace != null && typeof m.dialogspace === 'object')
    || (m.dialogWorkspace != null && typeof m.dialogWorkspace === 'object')
    || !!(ex && ex.dialogspace != null && typeof ex.dialogspace === 'object')
    || !!(ex && ex.dialogWorkspace != null && typeof ex.dialogWorkspace === 'object')
}

/**
 * 处理侧边导航选中事件：菜单含 `dialogspace` 走对话框打开，否则按 workspace 节点打开。
 * @param {HTMLElement} host
 * @param {ShadowRoot} sr
 * @param {CustomEvent} e
 */
export async function handleNavSelection (host, sr, e) {
  const m = e.detail.menu
  const label = portalDisplayText(m?.caption, portalDisplayText(e.detail.text, m?.id != null ? String(m.id) : ''))
  /* 工作区节点编辑器：菜单项 type:"workspace-node-editor" → 打开编辑对话框（与 shellbar 入口共用）。
     可选 targetNodeId 预加载某个已有节点。注：explorerMenuNodeSummary 把非内置键收进 extras，
     故 type/targetNodeId 既可能在顶层也可能在 extras 下。 */
  const mx = (m && typeof m === 'object' && m.extras && typeof m.extras === 'object') ? m.extras : null
  const menuType = String((m && m.type) || (mx && mx.type) || '').toLowerCase()
  if (menuType === 'workspace-node-editor') {
    const targetId = (m && m.targetNodeId) || (mx && mx.targetNodeId) || ''
    if (typeof host._openWorkspaceNodeDialog === 'function') {
      await host._openWorkspaceNodeDialog(targetId ? String(targetId) : undefined)
    }
    return
  }
  if (isDialogMenuNode(m)) {
    const node = DialogWorkspaceNode.fromConfig(/** @type {Record<string,unknown>} */ (m))
    const result = await node.open()
    const logPanel = sr.getElementById('log-panel')
    if (logPanel) {
      logPanel.addLog(`对话框: ${label} → ${result.action}${result.buttonId ? `(${result.buttonId})` : ''}`, 'info', 'Navigator')
    }
    return
  }
  const node = WorkspaceNode.fromNavSelectionDetail(e.detail)
  await openWorkspaceNodeWithPrepare(host, sr, node, label, setHtmlPagesWorkspaceLoading)
}

/**
 * 打开工作区，与点击侧边菜单项效果相同。
 * 接受 WorkspaceNode / DialogWorkspaceNode 实例，或菜单节点 JSON 对象（含 `dialogspace` 字段则走对话框，否则按 workspace 打开）。
 * @param {HTMLElement} host
 * @param {import('../lib/workspace-node.js').WorkspaceNode | DialogWorkspaceNode | Record<string, unknown>} nodeOrMenuNode
 * @param {{ initialContext?: Record<string, unknown> }} [extras]
 *   动态跳转传参：开新 tab 时注入 workspace.context 的初始键值（页面脚本经 host.workspace.context.get(...) 读取）。
 * @returns {Promise<unknown>}
 */
export async function openWorkspaceNode (host, nodeOrMenuNode, extras) {
  const sr = host.shadowRoot
  if (!sr) return
  if (nodeOrMenuNode instanceof DialogWorkspaceNode) {
    return nodeOrMenuNode.open()
  }
  if (nodeOrMenuNode instanceof WorkspaceNode) {
    const label = nodeOrMenuNode.meta?.label || ''
    await openWorkspaceNodeWithPrepare(host, sr, nodeOrMenuNode, label, setHtmlPagesWorkspaceLoading, extras)
    return
  }
  if (isDialogMenuNode(nodeOrMenuNode)) {
    const node = DialogWorkspaceNode.fromConfig(/** @type {Record<string,unknown>} */ (nodeOrMenuNode))
    return node.open()
  }
  const node = WorkspaceNode.fromMenuNode(/** @type {Record<string, unknown>} */ (nodeOrMenuNode))
  const label = node.meta?.label || ''
  await openWorkspaceNodeWithPrepare(host, sr, node, label, setHtmlPagesWorkspaceLoading, extras)
}

export {
  setHtmlPagesWorkspaceLoading,
  applyViewDrop,
  saveCurrentTabDockLayout,
  resetTabDockLayout,
  syncFloatWindow,
  openHtmlPageInDesigner,
  onProfileAccount,
  onProfileLogout,
}
