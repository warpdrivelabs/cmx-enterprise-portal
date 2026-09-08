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
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: flex;
          align-items: stretch;
          height: 22px;
          background: var(--sapShellColor, #1b2a3b);
          border-top: 1px solid var(--sapShell_BorderColor, var(--sapPageHeader_BorderColor, #ddd));
          /* 随亮/暗 Shell 背景自动反色，勿写死 var(--sapList_Background, #ffffff)（亮色 Horizon 下 Shell 常为浅底） */
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
    this._renderSide('left-area', this._leftItems, false)
    this._renderSide('right-items', this._rightItems.filter(i => !['bell','user'].includes(i.id)), false)
    this._renderTray()
  }

  _renderSide(containerId, items, isRight) {
    const container = this.shadowRoot.getElementById(containerId)
    if (!container) return
    container.innerHTML = ''
    for (const item of items) {
      const el = document.createElement('div')
      el.className = 'status-item'
      if (item.onClick || item.id) el.dataset.clickable = ''
      el.title = item.tooltip || item.text || ''
      if (item.color) el.style.color = item.color
      el.innerHTML = `
        ${item.icon ? `<ui5-icon name="${item.icon}"${item.color ? ` style="color:${item.color}"` : ''}></ui5-icon>` : ''}
        ${item.text ? `<span>${this._escapeHtml(item.text)}</span>` : ''}
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
    tray.innerHTML = ''
    const trayItems = this._rightItems.filter(i => ['bell','user'].includes(i.id))
    for (const item of trayItems) {
      const el = document.createElement('div')
      el.className = 'tray-item'
      if (item.tooltip) el.title = item.tooltip
      el.innerHTML = item.icon ? `<ui5-icon name="${item.icon}"></ui5-icon>` : `<span>${item.text}</span>`
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

  _escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }
}

customElements.define('portal-status-bar', PortalStatusBar)
