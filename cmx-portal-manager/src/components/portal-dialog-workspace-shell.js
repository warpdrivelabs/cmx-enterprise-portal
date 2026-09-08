/**
 * 对话框工作区 Shell（薄壳）：样式与模板真源已抽到 cmx-data-comp/lib/cmx-dialog-shell.js，
 * 本文件从那里重新导出，并保留 PortalManager 专用的 spec 解析。外观与原实现完全一致。
 */

export {
  DIALOG_WORKSPACE_STYLES,
  createDialogWorkspaceTemplate,
} from 'cmx-data-comp/lib/cmx-dialog-shell.js'

/**
 * 从 `spec` attribute 解析 {@link import('../lib/dialog-workspace-node.js').DialogWorkspaceSpec}，失败返回 null。
 * @param {HTMLElement} host
 * @returns {import('../lib/dialog-workspace-node.js').DialogWorkspaceSpec|null}
 */
export function parseDialogWorkspaceSpec (host) {
  const raw = host.getAttribute('spec')
  if (!raw) return null
  try {
    const p = JSON.parse(raw)
    return p && typeof p === 'object' ? /** @type {any} */ (p) : null
  } catch {
    return null
  }
}
