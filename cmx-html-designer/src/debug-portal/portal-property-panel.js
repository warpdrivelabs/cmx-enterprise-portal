import {
  activateWorkspaceRegionViewByIndex,
  handleWorkspaceRegionTabBarClick,
  normalizeWorkspaceRegionViews,
  renderWorkspaceRegionViewsHtml,
  workspaceRegionOuterTabIcon,
  workspaceRegionOuterTabText,
} from './workspace-node.js'
import { escHtml } from '../utils/esc.js'


/**
 * 右侧属性区：`workspace.property` **区内**与 explorer / bottom 相同，多视图时底部 Tab 切换 `views[]`。
 * **顶栏**为 Explorer 式外层签条，但**仅一颗签**：文案与图标取自 `property` 包装层的 `caption` / `icon`（{@link workspaceRegionOuterTabText} / {@link workspaceRegionOuterTabIcon}），**不**把各 `views[]` 列在顶部。
 */
export class PortalPropertyPanel extends HTMLElement {
  constructor () {
    super()
    this.attachShadow({ mode: 'open' })
    /** @type {import('../lib/workspace-node.js').WorkspaceRegionViewsInput|null} */
    this._workspacePropertySpec = null
    this._boundWorkspaceTabClick = (e) => handleWorkspaceRegionTabBarClick(e)
  }

  connectedCallback () {
    this._render()
    this.shadowRoot.addEventListener('click', this._boundWorkspaceTabClick)
  }

  disconnectedCallback () {
    this.shadowRoot.removeEventListener('click', this._boundWorkspaceTabClick)
  }

  /**
   * 顶栏：单颗「工作区」外层签（包装层 caption/icon），与侧栏 Explorer 第二签同源规则。
   * @param {import('../lib/workspace-node.js').WorkspaceRegionViewsInput|null|undefined} raw
   */
  _renderPropertyOuterWorkspaceTab (raw) {
    const area = this.shadowRoot.getElementById('prop-tab-area')
    if (!area) return
    if (!raw || typeof raw !== 'object') {
      area.innerHTML = '<span class="prop-panel-title" id="prop-panel-title">属性</span>'
      return
    }
    const text = workspaceRegionOuterTabText(raw, '属性')
    const iconName = workspaceRegionOuterTabIcon(raw, 'documents')
    const lab = escHtml(text)
    const ic = escHtml(iconName)
    area.innerHTML = `
      <div class="prop-outer-tab-strip" role="tablist">
        <div class="prop-outer-tab active" role="tab" aria-selected="true" aria-label="${lab}">
          <ui5-icon name="${ic}" class="prop-outer-tab-ic"></ui5-icon>
          <span class="prop-outer-tab-label">${lab}</span>
        </div>
      </div>
    `
  }

  /**
   * @param {number} viewIndex
   */
  activateWorkspaceRegionView (viewIndex) {
    const pane = this.shadowRoot.getElementById('cmx-workspace-property-pane')
    if (pane) {
      activateWorkspaceRegionViewByIndex(pane, 'property', viewIndex)
    }
  }

  /**
   * @param {import('../lib/workspace-node.js').WorkspaceRegionViewsInput|null} spec
   * @param {{ mountRoot?: HTMLElement|null }} [_options]
   * `mountRoot`：Content 标签缓存的根节点，切换时复用；不传则按 spec 渲染 HTML。
   */
  setWorkspaceProperty (spec, _options = {}) {
    const mountRoot = _options.mountRoot instanceof HTMLElement ? _options.mountRoot : null
    const pane = this.shadowRoot.getElementById('cmx-workspace-property-pane')
    const raw = spec != null && typeof spec === 'object' ? spec : null
    const views = normalizeWorkspaceRegionViews(raw)
    if (!raw || !views.length) {
      this._workspacePropertySpec = null
      if (pane) {
        while (pane.firstChild) pane.removeChild(pane.firstChild)
        pane.style.display = 'none'
      }
      this._renderPropertyOuterWorkspaceTab(null)
      return
    }
    this._workspacePropertySpec = raw
    this._renderPropertyOuterWorkspaceTab(raw)
    if (pane) {
      pane.style.display = 'flex'
      if (mountRoot) {
        while (pane.firstChild) pane.removeChild(pane.firstChild)
        pane.appendChild(mountRoot)
      } else {
        const onlyCache =
          pane.childElementCount === 1 &&
          pane.firstElementChild?.classList?.contains('cmx-ws-tab-cache-root')
        if (!onlyCache) {
          pane.innerHTML = renderWorkspaceRegionViewsHtml('property', this._workspacePropertySpec)
        }
      }
    }
  }

  get visible () { return !this.hasAttribute('hidden') }
  set visible (val) {
    val ? this.removeAttribute('hidden') : this.setAttribute('hidden', '')
  }

  _render () {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow: hidden;
          background: var(--sapObjectHeader_Background, #fff);
          border-left: 1px solid var(--sapPageHeader_BorderColor, #ddd);
        }
        .outer-tabs {
          display: flex;
          align-items: stretch;
          border-bottom: 1px solid var(--sapPageHeader_BorderColor, #ddd);
          background: var(--sapObjectHeader_Background, #fff);
          flex-shrink: 0;
          min-width: 0;
        }
        .prop-tab-area {
          flex: 1 1 auto;
          min-width: 0;
          display: flex;
          align-items: stretch;
          overflow: hidden;
        }
        .prop-panel-title {
          padding: 0 12px;
          height: 35px;
          display: flex;
          align-items: center;
          font-size: 12px;
          font-weight: 600;
          color: var(--sapTextColor, #333);
          user-select: none;
        }
        .prop-outer-tab-strip {
          display: flex;
          flex-direction: row;
          align-items: stretch;
          min-width: 0;
          overflow: hidden;
        }
        .prop-outer-tab {
          padding: 0 12px;
          height: 35px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 500;
          color: var(--sapHighlightColor, #0070f2);
          border-bottom: 2px solid var(--sapHighlightColor, #0070f2);
          white-space: nowrap;
          flex-shrink: 0;
          box-sizing: border-box;
          user-select: none;
          cursor: default;
        }
        .prop-outer-tab-ic { width: 15px; height: 15px; flex-shrink: 0; }
        .prop-outer-tab-label { overflow: hidden; text-overflow: ellipsis; max-width: 220px; }
        .outer-spacer { flex: 0 0 auto; }
        .outer-actions { display: flex; align-items: center; padding: 0 4px; flex-shrink: 0; }
        ui5-button[icon] { min-width: 28px; height: 28px; }
        #prop-body-stack {
          flex: 1 1 auto;
          display: flex;
          flex-direction: column;
          min-height: 0;
          min-width: 0;
        }
        #cmx-workspace-property-pane {
          flex: 1 1 auto;
          display: flex;
          flex-direction: column;
          min-height: 0;
          overflow: hidden;
          background: var(--sapObjectHeader_Background, #fff);
        }
        #cmx-workspace-property-pane > .cmx-ws-tab-cache-root {
          flex: 1 1 auto;
          min-height: 0;
          min-width: 0;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          align-self: stretch;
        }
      </style>
      <div class="outer-tabs" id="prop-outer-tab-row">
        <div class="prop-tab-area" id="prop-tab-area">
          <span class="prop-panel-title" id="prop-panel-title">属性</span>
        </div>
        <div class="outer-spacer"></div>
        <div class="outer-actions">
          <ui5-button icon="decline" design="Transparent" tooltip="关闭属性面板" id="close-btn"></ui5-button>
        </div>
      </div>
      <div id="prop-body-stack">
        <div id="cmx-workspace-property-pane" style="display:none" role="region" aria-label="Workspace property"></div>
      </div>
    `
    this.shadowRoot.getElementById('close-btn')?.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('panel-close', { bubbles: true, composed: true }))
    })
  }
}

customElements.define('portal-property-panel', PortalPropertyPanel)
