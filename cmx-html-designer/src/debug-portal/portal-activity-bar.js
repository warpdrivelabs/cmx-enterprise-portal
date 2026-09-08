import {
  parseActivityEntries,
  ensureActivitiesLoaded,
  DEFAULT_ACTIVITIES_URL,
} from './activities-api.js'
import { escAttr } from '../utils/esc.js'


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
    this._activitiesUrl = this.getAttribute('activities-url')?.trim() || DEFAULT_ACTIVITIES_URL
    this._render()
    void this._refreshActivitiesFromApi()
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

  async _refreshActivitiesFromApi () {
    try {
      const list = await ensureActivitiesLoaded(this._activitiesUrl)
      this._activities = list
      if (list.length) {
        if (!list.some((a) => a.id === this._active)) {
          this._active = list[0].id
        }
      } else {
        this._active = ''
      }
      this._render()
    } catch (_) {
      this._activities = []
      this._active = ''
      this._render()
    }
  }

  _render () {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: flex;
          flex-direction: column;
          width: 48px;
          min-width: 48px;
          flex-shrink: 0;
          background: var(--sapGroup_ContentBackground, #fafafa);
          border-right: 1px solid var(--sapGroup_TitleBorderColor, #ddd);
          overflow: hidden;
          user-select: none;
        }
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
        .act-btn:hover {
          color: var(--sapContent_IconColor, #32363a);
          background: var(--sapList_Hover_Background, rgba(0,0,0,0.04));
        }
        .act-btn.active { color: var(--sapHighlightColor, #0070f2); }
        .act-btn.active::before {
          content: '';
          position: absolute;
          left: 0; top: 8px; bottom: 8px;
          width: 2px;
          background: var(--sapHighlightColor, #0070f2);
          border-radius: 0 2px 2px 0;
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
