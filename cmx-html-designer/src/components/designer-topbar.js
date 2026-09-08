/**
 * <designer-topbar> — 顶部 ShellBar（与 CMXPortalManager portal-shellbar 对齐：布局、紧凑边距、主题/语言/头像菜单等）
 */
import { getCmxUi5RuntimeSync } from 'cmx-ui5-runtime/client';
import { DesignerBaseComponent } from './designer-base-component.js';
import { library } from '../lib/index.js';
import { getDesignerDebugMode } from '../utils/user-code-debug.js';
import cmxLogoUrl from '../../assets/cmx.png?url';
import { escAttr } from '../utils/esc.js';

const _ver = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '';
const _built = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : '';


const STYLE = `
  :host { display: block; }

  .bar {
    display: flex;
    align-items: center;
    background: var(--sapShellColor, #1b2a3b);
  }

  ui5-shellbar {
    flex: 1;
    min-width: 0;
    padding-left: max(0.5rem, env(safe-area-inset-left, 0px)) !important;
    padding-right: max(0.5rem, env(safe-area-inset-right, 0px)) !important;
  }

  .designer-profile-menu {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 4px;
    min-width: 10rem;
    box-sizing: border-box;
  }
  .designer-profile-menu ui5-button {
    width: 100%;
    justify-content: flex-start;
  }
  .designer-profile-menu-sep {
    height: 0;
    margin: 6px 0 4px 0;
    border: none;
    border-top: 1px solid var(--sapGroup_TitleBorderColor, #ddd);
    flex-shrink: 0;
  }
`;

const _themeIcon = (dark) => (dark ? 'dark-mode' : 'light-mode');

export class DesignerTopbar extends DesignerBaseComponent {
  constructor () {
    super()
    this._currentLang = library.languages[0]?.value ?? 'zh_CN'
    this._currentTheme = sessionStorage.getItem('__designer_theme__') || library.defaultTheme
  }

  styles () { return STYLE }

  template () {
    const initThemeDark = library.themeInfo(this._currentTheme)?.dark ?? true
    const initFlag = library.languages.find(l => l.value === this._currentLang)?.flag ?? '🇨🇳'
    const initIcon = _themeIcon(initThemeDark)
    const secondary = escAttr(`v${_ver}${_built ? ' · ' + _built : ''}`)

    const themeMenuItems = library.themes.map(
      (t) =>
        `<ui5-menu-item text="${escAttr(t.label)}" icon="${_themeIcon(t.dark)}" data-value="${escAttr(t.value)}"></ui5-menu-item>`
    ).join('')

    const langMenuItems = library.languages.map(
      (l) =>
        `<ui5-menu-item text="${escAttr(`${l.flag} ${l.label}`)}" data-value="${escAttr(l.value)}" data-flag="${escAttr(l.flag)}"></ui5-menu-item>`
    ).join('')

    return `
      <div class="bar">
        <ui5-shellbar
          primary-title="${escAttr('Web Component HTML 可视化设计器')}"
          secondary-title="${secondary}"
          show-notifications
          show-product-switch
          notifications-count="0">
          <ui5-button icon="menu2" slot="startButton" tooltip="菜单" id="start-btn"></ui5-button>
          <img slot="logo" src="${escAttr(cmxLogoUrl)}" alt="CMX" style="height:32px;width:auto;" />
          <ui5-shellbar-item icon="sys-help" text="帮助" id="help-item"></ui5-shellbar-item>
          <ui5-shellbar-item icon="action-settings" text="设置" id="settings-btn"></ui5-shellbar-item>
          <ui5-button id="ws-node-btn" design="Transparent" icon="folder-blank" tooltip="工作区节点（workspace-node）"></ui5-button>
          <ui5-toggle-button id="debug-mode-btn" design="Transparent" icon="developer-settings" tooltip="调试模式：开启后用户态代码（事件/函数/服务）入口自动 debugger;"${getDesignerDebugMode() ? ' pressed' : ''}></ui5-toggle-button>
          <ui5-button id="theme-btn" design="Transparent" icon="${initIcon}" tooltip="切换主题"></ui5-button>
          <ui5-button id="lang-btn" design="Transparent" tooltip="切换语言">${initFlag}</ui5-button>
          <ui5-shellbar-spacer slot="content"></ui5-shellbar-spacer>
          <ui5-shellbar-search slot="searchField" show-clear-icon placeholder="搜索应用、产品"></ui5-shellbar-search>
          <ui5-toggle-button icon="ai" tooltip="助手" slot="assistant"></ui5-toggle-button>
          <ui5-avatar
            slot="profile"
            id="profile-avatar"
            icon="person-placeholder"
            size="XS"
            interactive
            title="用户与账号"
            accessible-name="用户与账号"
          ></ui5-avatar>
        </ui5-shellbar>
      </div>

      <ui5-menu id="theme-menu">${themeMenuItems}</ui5-menu>
      <ui5-menu id="lang-menu">${langMenuItems}</ui5-menu>
      <ui5-popover id="profile-popover" placement="Bottom" horizontal-align="End">
        <div class="designer-profile-menu">
          <ui5-button id="profile-btn-account" design="Transparent" icon="account">个人信息</ui5-button>
          <ui5-button id="profile-btn-preferences" design="Transparent" icon="action-settings">偏好设置</ui5-button>
          <hr class="designer-profile-menu-sep" role="separator" aria-orientation="horizontal" />
          <ui5-button id="profile-btn-logout" design="Transparent" icon="log">退出登录</ui5-button>
        </div>
      </ui5-popover>
    `
  }

  init () {
    const sr = this.shadowRoot
    const shellbar = sr.querySelector('ui5-shellbar')
    const themeBtn = sr.getElementById('theme-btn')
    const langBtn = sr.getElementById('lang-btn')
    const wsNodeBtn = sr.getElementById('ws-node-btn')
    const debugBtn = sr.getElementById('debug-mode-btn')
    const themeMenu = sr.getElementById('theme-menu')
    const langMenu = sr.getElementById('lang-menu')
    const startBtn = sr.getElementById('start-btn')

    shellbar.addEventListener('notifications-click', () => {
      this._emit('notifications-click')
    })
    shellbar.addEventListener('product-switch-click', () => {
      this._emit('product-switch-click')
    })
    shellbar.addEventListener('profile-click', (e) => {
      e.stopPropagation()
      this._toggleProfilePopover()
    })

    shellbar.addEventListener('item-click', (e) => {
      const sid = e.detail?.item?.id
      if (sid === 'help-item') {
        this._emit('help')
        return
      }
      if (sid === 'settings-btn') {
        this._emit('settings')
        return
      }
      this._emit('shellbar-item', { id: sid })
    })

    if (startBtn) {
      startBtn.addEventListener('click', () => this._emit('menu'))
    }

    if (wsNodeBtn) {
      wsNodeBtn.addEventListener('click', () => this._emit('ws-node'))
    }

    if (debugBtn) {
      debugBtn.addEventListener('click', () => {
        this._emit('debug-mode-toggle', { on: !!debugBtn.pressed })
      })
    }

    themeBtn.addEventListener('click', () => {
      themeMenu.opener = themeBtn
      themeMenu.open = true
    })

    langBtn.addEventListener('click', () => {
      langMenu.opener = langBtn
      langMenu.open = true
    })

    themeMenu.addEventListener('item-click', (e) => {
      const value = e.detail.item?.dataset?.value
      if (!value) return
      library.applyTheme(value)
      sessionStorage.setItem('__designer_theme__', value)
      const info = library.themeInfo(value)
      if (info) themeBtn.setAttribute('icon', _themeIcon(info.dark))
    })

    langMenu.addEventListener('item-click', async (e) => {
      const value = e.detail.item?.dataset?.value
      const flag = e.detail.item?.dataset?.flag
      if (!value) return
      library.applyLanguage(value)
      this._currentLang = value
      if (flag) langBtn.textContent = flag
      await getCmxUi5RuntimeSync()?.reRenderAllUI5Elements({ languageAware: true })
    })

    const wireProfileBtn = (id, type) => {
      const el = sr.getElementById(id)
      if (!el) return
      el.addEventListener('click', () => {
        this._closeProfilePopover()
        this._emit(type)
      })
    }
    wireProfileBtn('profile-btn-account', 'profile-account')
    wireProfileBtn('profile-btn-preferences', 'profile-settings')
    wireProfileBtn('profile-btn-logout', 'profile-logout')
  }

  _closeProfilePopover () {
    const pop = this.shadowRoot.getElementById('profile-popover')
    if (pop?.open) pop.open = false
  }

  _toggleProfilePopover () {
    const pop = this.shadowRoot.getElementById('profile-popover')
    const av = this.shadowRoot.getElementById('profile-avatar')
    if (!pop || !av) return
    if (pop.open) {
      pop.open = false
      return
    }
    pop.opener = av
    pop.open = true
  }

  _emit (type, extra = {}) {
    this.dispatchEvent(new CustomEvent('toolbar-action', {
      bubbles: true,
      composed: true,
      detail: { type, ...extra },
    }))
  }
}

customElements.define('designer-topbar', DesignerTopbar)
