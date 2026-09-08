/**
 * 对话框工作区节点：将 explorer / content / property / bottom 四个区域在浮层对话框内展示。
 */

/**
 * @typedef {{
 *   htmlPageId: string,
 *   tabLabel?: string,
 *   tabIcon?: string
 * }} DialogWorkspaceViewSpec
 *
 * @typedef {{
 *   label?: string,
 *   icon?: string,
 *   views: DialogWorkspaceViewSpec[]
 * }} DialogWorkspaceRegionSpec
 *
 * @typedef {{
 *   id: string,
 *   text: string,
 *   icon?: string,
 *   design?: 'Default'|'Emphasized'|'Transparent'|'Reject'|'Accept',
 *   disabled?: boolean
 * }} DialogWorkspaceButtonSpec
 *
 * @typedef {{
 *   title?: string,
 *   icon?: string,
 *   description?: string,
 *   buttons?: DialogWorkspaceButtonSpec[],
 *   explorer?: DialogWorkspaceRegionSpec,
 *   content?: DialogWorkspaceRegionSpec,
 *   property?: DialogWorkspaceRegionSpec,
 *   bottom?: DialogWorkspaceRegionSpec,
 *   confirmText?: string,
 *   cancelText?: string,
 *   dialogWidth?: string,
 *   dialogHeight?: string,
 *   explorerWidth?: number,
 *   propertyWidth?: number,
 *   footerHeight?: number
 * }} DialogWorkspaceSpec
 */

export class DialogWorkspaceNode {
  /**
   * @param {{ spec: DialogWorkspaceSpec, meta?: { label?: string, icon?: string } }} p
   */
  constructor ({ spec, meta = {} }) {
    /** @type {DialogWorkspaceSpec} */
    this.spec = spec || {}
    this.meta = {
      label: String(meta.label || spec.title || ''),
      icon: String(meta.icon || spec.icon || 'document'),
    }
  }

  /**
   * 从配置对象创建节点。
   * 若对象含 `dialogspace` 或 `dialogWorkspace` 字段，以该字段作为 spec；否则整体作为 spec。
   * @param {Record<string, unknown>} raw
   * @returns {DialogWorkspaceNode}
   */
  static fromConfig (raw) {
    const ex = raw.extras && typeof raw.extras === 'object' ? /** @type {Record<string, unknown>} */ (raw.extras) : null
    const specRaw =
      (raw.dialogspace && typeof raw.dialogspace === 'object' ? raw.dialogspace : null) ||
      (raw.dialogWorkspace && typeof raw.dialogWorkspace === 'object' ? raw.dialogWorkspace : null) ||
      (ex && ex.dialogspace && typeof ex.dialogspace === 'object' ? ex.dialogspace : null) ||
      (ex && ex.dialogWorkspace && typeof ex.dialogWorkspace === 'object' ? ex.dialogWorkspace : null) ||
      raw
    return new DialogWorkspaceNode({
      spec: /** @type {DialogWorkspaceSpec} */ (specRaw),
      meta: {
        label: String(raw.caption || raw.title || raw.label || ''),
        icon: raw.icon != null && String(raw.icon).trim() ? String(raw.icon).trim() : 'document',
      },
    })
  }

  /**
   * 在对话框中打开节点，返回 Promise，resolve 为用户操作结果。
   * @returns {Promise<{ action: 'confirm'|'cancel', buttonId?: string }>}
   */
  async open () {
    await import('../components/portal-dialog-workspace.js')
    return new Promise((resolve) => {
      const el = document.createElement('portal-dialog-workspace')
      el.setAttribute('spec', JSON.stringify(this.spec))
      document.body.appendChild(el)
      /** @param {Event} e */
      const onClose = (e) => {
        const d = /** @type {CustomEvent<{ action?: string, buttonId?: string }>} */ (e).detail || {}
        el.remove()
        resolve({
          action: d.action === 'confirm' ? 'confirm' : 'cancel',
          buttonId: d.buttonId,
        })
      }
      el.addEventListener('dialog-close', onClose, { once: true })
    })
  }
}
