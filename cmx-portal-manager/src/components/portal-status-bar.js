import { escAttr, escHtml } from '../lib/escape.js'
import { PORTAL_NEO_STATUS_BAR_STYLES } from '../lib/portal-neo-theme.js'

const DEFAULT_LEFT_ITEMS = [
  { id: 'branch',   text: '⎇ main',      icon: 'source-code', onClick: null },
  { id: 'errors',   text: '⊘ 0',          icon: 'message-error', color: 'var(--sapNegativeTextColor, #bb0000)', onClick: null },
  { id: 'warnings', text: '⚠ 1',          icon: 'warning',     color: 'var(--sapCriticalTextColor, #e9730c)', onClick: null },
  { id: 'info',     text: '● 准备就绪',    icon: null,          color: null,      onClick: null },
]

const DEFAULT_RIGHT_ITEMS = [
  { id: 'encoding', text: 'UTF-8',        icon: null,   onClick: null },
  { id: 'lang',     text: 'JavaScript',  icon: null,   onClick: null },
  { id: 'bell',     text: '',            icon: 'bell',    tooltip: '通知',   onClick: null },
  { id: 'user',     text: '',            icon: 'person-placeholder', tooltip: '用户',  onClick: null },
]

export class PortalStatusBar extends HTMLElement {
  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
    this._leftItems = [...DEFAULT_LEFT_ITEMS]
    this._rightItems = [...DEFAULT_RIGHT_ITEMS]
  }

  connectedCallback() {
    this._render()
    this._renderItems()
  }

  registerItem(config) {
    const side = config.position === 'right' ? this._rightItems : this._leftItems
    const existing = side.findIndex(i => i.id === config.id)
    if (existing >= 0) {
      side[existing] = { ...side[existing], ...config }
    } else {
      side.push(config)
    }
    this._renderItems()
  }

  unregisterItem(id) {
    this._leftItems = this._leftItems.filter(i => i.id !== id)
    this._rightItems = this._rightItems.filter(i => i.id !== id)
    this._renderItems()
  }

  updateItem(id, updates) {
    const all = [...this._leftItems, ...this._rightItems]
    const item = all.find(i => i.id === id)
    if (item) Object.assign(item, updates)
    this._renderItems()
  }

  _render() {
    // eslint-disable-next-line no-restricted-syntax -- shadow root 模板：静态字面量
    this.shadowRoot.innerHTML = `
      <style>
        ${PORTAL_NEO_STATUS_BAR_STYLES}
        :host {
          display: flex;
          align-items: stretch;
          height: 22px;
          color: var(--sapShell_TextColor, var(--sapTextColor, #32363a));
          font-size: 12px;
          user-select: none;
          flex-shrink: 0;
          overflow: hidden;
        }
        .left, .right {
          display: flex;
          flex-direction: row;
          align-items: stretch;
        }
        /* 左侧占满剩余空间且可缩；右侧按内容宽度且不参与压缩 */
        .left {
          flex: 1 1 0;
          min-width: 0;
          overflow: hidden;
        }
        .right {
          flex: 0 0 auto;
          flex-shrink: 0;
          min-width: max-content;
        }
        #left-area {
          display: flex;
          flex-direction: row;
          flex-wrap: nowrap;
          align-items: stretch;
          min-width: 0;
          flex: 1 1 auto;
          overflow: hidden;
        }
        #right-items {
          display: flex;
          flex-direction: row;
          flex-wrap: nowrap;
          align-items: stretch;
          flex-shrink: 0;
          min-width: max-content;
        }
        .status-item {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 0 8px;
          cursor: default;
          color: var(--sapShell_TextColor, var(--sapTextColor, #32363a));
          transition: background 0.1s;
        }
        /* 左侧：项可收缩，图标固定，文案省略号 */
        #left-area .status-item {
          flex: 0 1 auto;
          min-width: 0;
          overflow: hidden;
          max-width: 100%;
        }
        #left-area .status-item > span {
          min-width: 0;
          flex: 1 1 auto;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        #left-area .status-item ui5-icon {
          flex-shrink: 0;
        }
        /* 右侧：不压缩，完整显示 */
        #right-items .status-item {
          flex: 0 0 auto;
          flex-shrink: 0;
          min-width: max-content;
          white-space: nowrap;
        }
        #right-items .status-item > span {
          flex: 0 0 auto;
          white-space: nowrap;
        }
        .status-item[data-clickable]:hover {
          background: var(--sapShell_Hover_Background, rgba(0, 0, 0, 0.06));
          cursor: pointer;
        }
        .status-item ui5-icon {
          width: 14px;
          height: 14px;
          color: inherit;
        }
        .tray {
          display: flex;
          flex-direction: row;
          flex-wrap: nowrap;
          align-items: stretch;
          flex-shrink: 0;
        }
        .tray-item {
          display: flex;
          align-items: center;
          justify-content: center;
          min-width: 26px;
          flex: 0 0 auto;
          flex-shrink: 0;
          padding: 0 6px;
          cursor: pointer;
          color: var(--sapShell_TextColor, var(--sapTextColor, #32363a));
          transition: background 0.1s;
        }
        .tray-item:hover {
          background: var(--sapShell_Hover_Background, rgba(0, 0, 0, 0.06));
        }
        .tray-item ui5-icon {
          width: 14px;
          height: 14px;
          color: inherit;
        }
        .separator {
          width: 1px;
          flex-shrink: 0;
          background: var(--sapShell_InteractiveBorderColor, var(--sapGroup_TitleBorderColor, rgba(0, 0, 0, 0.12)));
          margin: 4px 0;
        }
      </style>
      <div class="left" id="left-area"></div>
      <div class="separator"></div>
      <div class="right">
        <div id="right-items"></div>
        <div class="separator" style="margin:0 2px"></div>
        <div class="tray" id="tray"></div>
      </div>
    `
  }

  _renderItems() {
    this._renderSide('left-area', this._leftItems)
    this._renderSide('right-items', this._rightItems.filter(i => !['bell','user'].includes(i.id)))
    this._renderTray()
  }

  _renderSide(containerId, items) {
    const container = this.shadowRoot.getElementById(containerId)
    if (!container) return
    container.replaceChildren()
    for (const item of items) {
      const el = document.createElement('div')
      el.className = 'status-item'
      if (item.onClick || item.id) el.dataset.clickable = ''
      el.title = item.tooltip || item.text || ''
      if (item.color) el.style.color = item.color
      // eslint-disable-next-line no-restricted-syntax -- icon/color/text 均经 escAttr/escHtml
      el.innerHTML = `
        ${item.icon ? `<ui5-icon name="${escAttr(item.icon)}"${item.color ? ` style="color:${escAttr(item.color)}"` : ''}></ui5-icon>` : ''}
        ${item.text ? `<span>${escHtml(item.text)}</span>` : ''}
      `
      el.addEventListener('click', () => {
        if (item.onClick) item.onClick()
        this.dispatchEvent(new CustomEvent('status-item-click', {
          bubbles: true, composed: true,
          detail: { id: item.id }
        }))
      })
      container.appendChild(el)
    }
  }

  _renderTray() {
    const tray = this.shadowRoot.getElementById('tray')
    if (!tray) return
    tray.replaceChildren()
    const trayItems = this._rightItems.filter(i => ['bell','user'].includes(i.id))
    for (const item of trayItems) {
      const el = document.createElement('div')
      el.className = 'tray-item'
      if (item.tooltip) el.title = item.tooltip
      // eslint-disable-next-line no-restricted-syntax -- icon/text 已转义
      el.innerHTML = item.icon ? `<ui5-icon name="${escAttr(item.icon)}"></ui5-icon>` : `<span>${escHtml(item.text)}</span>`
      el.addEventListener('click', () => {
        if (item.onClick) item.onClick()
        this.dispatchEvent(new CustomEvent('status-item-click', {
          bubbles: true, composed: true,
          detail: { id: item.id }
        }))
      })
      tray.appendChild(el)
    }
  }
}

customElements.define('portal-status-bar', PortalStatusBar)
