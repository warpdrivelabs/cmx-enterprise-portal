import { escAttr } from '../lib/escape.js'
import { PORTAL_NEO_ACTIVITY_BAR_STYLES } from '../lib/portal-neo-theme.js'

export class PortalActivityBar extends HTMLElement {
  constructor () {
    super()
    this.attachShadow({ mode: 'open' })
    this._active = ''
    this._sideNavVisible = true
    /** @type {ReturnType<typeof parseActivityEntries>} */
    this._activities = []
  }

  connectedCallback () {
    this._activitiesUrl = this.getAttribute('activities-url')?.trim() || null
    this._render()
    // 不在此自动加载：活动列表依赖 domain 确定，由 syncInitialActivityFromDefinitions 在加载 domain 树后显式调用 _setActivities
  }

  get activeActivity () { return this._active }
  set activeActivity (val) {
    this._active = val
    this._updateActive()
  }

  /**
   * 由宿主同步当前活动（不派发 activity-change），用于头像菜单等与点击活动栏等效的场景。
   */
  syncFromHost (id, visible = true) {
    this._active = id
    this._sideNavVisible = !!visible
    this._updateActive()
  }

  /**
   * 直接注入活动列表并刷新按钮（域切换时由 portal-app 调用，不再发请求）。
   * 替代旧 _refreshActivitiesFromUrl（后者内部调 ensureActivitiesLoaded 打 /api/activities）。
   * @param {Array<{id:string,icon:string,label:string,position?:string,sideNav?:object}>} list
   */
  _setActivities (list) {
    this._activities = Array.isArray(list) ? list : []
    if (this._activities.length) {
      if (!this._activities.some((a) => a.id === this._active)) {
        this._active = this._activities[0].id
      }
    } else {
      this._active = ''
    }
    this._render()
  }

  _render () {
    // eslint-disable-next-line no-restricted-syntax -- shadow root 模板：静态字面量
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: flex;
          flex-direction: column;
          width: 48px;
          min-width: 48px;
          flex-shrink: 0;
          overflow: hidden;
          user-select: none;
        }
        ${PORTAL_NEO_ACTIVITY_BAR_STYLES}
        .group-top { flex: 1 1 auto; display: flex; flex-direction: column; padding-top: 4px; }
        .group-bottom { flex: 0 0 auto; display: flex; flex-direction: column; padding-bottom: 4px; }
        .act-btn {
          position: relative;
          width: 48px;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          border: none;
          background: transparent;
          color: var(--sapContent_NonInteractiveIconColor, #6a6d70);
          outline: none;
          transition: color 0.15s, background 0.15s;
        }
        .act-btn.active::before {
          content: '';
          position: absolute;
          left: 0; top: 8px; bottom: 8px;
        }
        ui5-icon {
          width: 24px;
          height: 24px;
          pointer-events: none;
          color: inherit;
        }
      </style>
      <div class="group-top" id="top"></div>
      <div class="group-bottom" id="bottom"></div>
    `
    const top = this.shadowRoot.getElementById('top')
    const bottom = this.shadowRoot.getElementById('bottom')
    for (const act of this._activities) {
      const btn = document.createElement('button')
      btn.className = 'act-btn' + (act.id === this._active ? ' active' : '')
      btn.dataset.id = act.id
      btn.title = act.label
      // eslint-disable-next-line no-restricted-syntax -- icon 已 escAttr 转义
      btn.innerHTML = `<ui5-icon name="${escAttr(act.icon)}"></ui5-icon>`
      btn.addEventListener('click', () => this._onClick(act))
      ;(act.position === 'bottom' ? bottom : top).appendChild(btn)
    }
  }

  /** @param {ReturnType<typeof parseActivityEntries>[number]} act */
  _onClick (act) {
    const id = act.id
    const isSame = id === this._active
    if (isSame) {
      this._sideNavVisible = !this._sideNavVisible
    } else {
      this._active = id
      this._sideNavVisible = true
      this._updateActive()
    }
    this.dispatchEvent(new CustomEvent('activity-change', {
      bubbles: true,
      composed: true,
      detail: {
        id,
        visible: this._sideNavVisible,
        label: act.label,
        sideNav: act.sideNav,
      },
    }))
  }

  _updateActive () {
    this.shadowRoot.querySelectorAll('.act-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.id === this._active)
    })
  }
}

customElements.define('portal-activity-bar', PortalActivityBar)
