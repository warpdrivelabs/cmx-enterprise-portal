import {
  activateWorkspaceRegionViewByIndex,
  handleWorkspaceRegionTabBarClick,
  hydrateHtmlPagesWorkspaceViewsInRoot,
  normalizeWorkspaceRegionViews,
  renderWorkspaceRegionViewsHtml,
  workspaceRegionOuterTabIcon,
  workspaceRegionOuterTabText,
} from '../lib/workspace-node.js'
import { DROP_TARGET_CLASS, wireWorkspacePanelDnd } from '../lib/workspace-dock-layout.js'
import { wireWorkspaceRegionTabContextMenu } from '../lib/workspace-region-tab-ctxmenu.js'
import { escAttr as escHtml } from '../lib/escape.js'
import { PORTAL_NEO_DROP_TARGET, PORTAL_NEO_TAB_CHROME } from '../lib/portal-neo-theme.js'

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
    this._wireWorkspaceDnd()
    this._wireWorkspaceCtxMenu()
  }

  disconnectedCallback () {
    this.shadowRoot.removeEventListener('click', this._boundWorkspaceTabClick)
    this._dndUnwire?.()
    this._dndUnwire = null
    this._ctxMenuUnwire?.()
    this._ctxMenuUnwire = null
  }

  _wireWorkspaceDnd () {
    if (this._dndUnwire) return
    this._dndUnwire = wireWorkspacePanelDnd(
      this.shadowRoot,
      () => this.shadowRoot.getElementById('cmx-workspace-property-pane'),
      'property',
      () => this._readActiveWsTabId(),
      () => /** @type {Record<string, unknown>|null} */ (this._workspacePropertySpec),
      (detail) => {
        this.dispatchEvent(new CustomEvent('portal-workspace-view-dropped', {
          bubbles: true,
          composed: true,
          detail,
        }))
      },
    )
  }

  _wireWorkspaceCtxMenu () {
    if (this._ctxMenuUnwire) return
    this._ctxMenuUnwire = wireWorkspaceRegionTabContextMenu(
      this.shadowRoot,
      () => this.shadowRoot.getElementById('cmx-workspace-property-pane'),
      'property',
      () => this._readActiveWsTabId(),
      () => /** @type {Record<string, unknown>|null} */ (this._workspacePropertySpec),
      {
        getOuterTab: () => /** @type {HTMLElement|null} */ (
          this.shadowRoot.querySelector('#prop-tab-area .prop-outer-tab')
        ),
      },
    )
  }

  /** @returns {string} */
  _readActiveWsTabId () {
    const app = document.querySelector('cmx-portal-app')
    return (app instanceof HTMLElement && app.dataset?.cmxActiveWsTab) || ''
  }

  /**
   * 顶栏：单颗「工作区」外层签（包装层 caption/icon），与侧栏 Explorer 第二签同源规则。
   * @param {import('../lib/workspace-node.js').WorkspaceRegionViewsInput|null|undefined} raw
   */
  _renderPropertyOuterWorkspaceTab (raw) {
    const area = this.shadowRoot.getElementById('prop-tab-area')
    if (!area) return
    if (!raw || typeof raw !== 'object') {
      // eslint-disable-next-line no-restricted-syntax -- 静态字面量
      area.innerHTML = '<span class="prop-panel-title" id="prop-panel-title">属性</span>'
      return
    }
    const text = workspaceRegionOuterTabText(raw, '属性')
    const iconName = workspaceRegionOuterTabIcon(raw, 'documents')
    const lab = escHtml(text)
    const ic = escHtml(iconName)
    // eslint-disable-next-line no-restricted-syntax -- lab/ic 已经过转义
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
   * 按 viewId（data-cmx-view-id）切换到对应子 tab。viewId 来自 view spec 的 id 字段。
   * 找不到匹配的 pane 时无操作。
   * @param {string} viewId
   */
  activateWorkspaceRegionViewByViewId (viewId) {
    const pane = this.shadowRoot.getElementById('cmx-workspace-property-pane')
    if (!pane) return
    const targetPane = pane.querySelector(`.cmx-ws-tab-pane[data-cmx-view-id="${viewId}"]`)
    if (!(targetPane instanceof HTMLElement)) return
    const targetIdx = targetPane.getAttribute('data-pane-index')
    if (targetIdx == null) return
    activateWorkspaceRegionViewByIndex(pane, 'property', Number(targetIdx))
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
        /* 不清空 pane 子节点，仅设为 display:none —— 保留缓存根挂载，避免内部 CE disconnect 风暴；
           外层 dock 由 portal-app-layout.applyLayout 的 _propertyVisible 通过 data-hidden 隐藏。 */
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
        /* 同一 mountRoot 已挂载：什么都不做。直接 appendChild 同一节点会先 detach 再 attach，
           导致内部自定义元素 disconnect/connect，触发可见闪烁。 */
        if (mountRoot.parentElement !== pane) {
          while (pane.firstChild) pane.removeChild(pane.firstChild)
          pane.appendChild(mountRoot)
          queueMicrotask(() => {
            hydrateHtmlPagesWorkspaceViewsInRoot(mountRoot)
          })
        }
      } else {
        const onlyCache =
          pane.childElementCount === 1 &&
          pane.firstElementChild?.classList?.contains('cmx-ws-tab-cache-root')
        if (!onlyCache) {
          // eslint-disable-next-line no-restricted-syntax -- renderWorkspaceRegionViewsHtml 内部已转义
          pane.innerHTML = renderWorkspaceRegionViewsHtml('property', this._workspacePropertySpec)
        }
        /* 与 Explorer 相同：仅缓存根且未传 mountRoot 时须补 hydrate，避免 html_pages 空白。 */
        hydrateHtmlPagesWorkspaceViewsInRoot(pane)
        queueMicrotask(() => hydrateHtmlPagesWorkspaceViewsInRoot(pane))
      }
    }
  }

  get visible () { return !this.hasAttribute('hidden') }
  set visible (val) {
    val ? this.removeAttribute('hidden') : this.setAttribute('hidden', '')
  }

  _render () {
    // eslint-disable-next-line no-restricted-syntax -- shadow root 模板：静态字面量
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow: hidden;
          background: var(--portal-panel-bg, var(--sapObjectHeader_Background, #fff));
          border-left: 1px solid var(--neo-border-subtle, var(--sapPageHeader_BorderColor, #ddd));
          box-shadow: inset 1px 0 0 color-mix(in srgb, var(--neo-cyan, #00b4d8) 5%, transparent);
        }
        ${PORTAL_NEO_TAB_CHROME}
        .outer-tabs {
          display: flex;
          align-items: stretch;
          border-bottom: 1px solid var(--neo-border-subtle, var(--sapPageHeader_BorderColor, #ddd));
          background: var(--portal-tab-row-bg, var(--sapObjectHeader_Background, #fff));
          flex-shrink: 0;
          height: 35px;
          min-width: 0;
          backdrop-filter: blur(8px);
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
          font-weight: 700;
          letter-spacing: 0.04em;
          font-family: ui-monospace, var(--sapFontFamily, system-ui), monospace;
          color: var(--neo-cyan, var(--sapTextColor, #333));
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
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 600;
          color: var(--neo-cyan, var(--sapHighlightColor, #0070f2));
          border-bottom: 2px solid var(--neo-cyan, var(--sapHighlightColor, #0070f2));
          white-space: nowrap;
          flex-shrink: 0;
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
        .cmx-ws-tab-btn { cursor: grab; }
        .cmx-ws-tab-btn:active { cursor: grabbing; }
        #cmx-workspace-property-pane.${DROP_TARGET_CLASS} {
          ${PORTAL_NEO_DROP_TARGET}
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
