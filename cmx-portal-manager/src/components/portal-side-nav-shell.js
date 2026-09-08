/**
 * 侧边导航 Shell：静态 HTML/CSS 模板、属性解析工具、菜单 URL 构建。
 */
import { DROP_TARGET_CLASS } from '../lib/workspace-dock-layout.js'
import { PORTAL_TAB_OVERFLOW_STYLES } from '../lib/tab-strip-overflow.js'
import { PORTAL_NEO_DROP_TARGET, PORTAL_NEO_SIDE_NAV_STYLES, PORTAL_NEO_TAB_CHROME } from '../lib/portal-neo-theme.js'

import { portalDisplayText } from '../lib/display-text.js'

/** 由 `sideNav.type === "module"`（或旧 `"menu-pages"`）使用，DOM id 固定，与具体 application id 无关 */
export const MENU_PAGES_PANEL_HTML = `
  <div class="explorer-menu-view">
    <ui5-message-strip id="portal-menu-strip" design="Negative" hidden></ui5-message-strip>
    <div class="portal-menu-search-row">
      <ui5-input id="portal-menu-search" placeholder="搜索菜单…（/ 或 Alt+S 聚焦）" style="flex:1;min-width:0"></ui5-input>
      <ui5-button id="portal-menu-refresh" icon="refresh" design="Transparent" tooltip="刷新菜单"></ui5-button>
    </div>
    <div class="explorer-menu-body">
      <ui5-busy-indicator id="portal-menu-busy" active delay="0" class="explorer-menu-busy" text="加载菜单…"></ui5-busy-indicator>
      <div id="portal-menu-panels" class="portal-menu-panels"></div>
    </div>
  </div>
`

/** 内置占位侧栏：`sideNav.type === "built-in"` + `template` */
export const BUILTIN_TEMPLATES = {
  search: {
    render: () => `
      <div class="search-view">
        <div class="search-input-row">
          <ui5-input placeholder="搜索页面、组件、服务..." id="search-input" style="flex:1"></ui5-input>
          <ui5-button icon="search" design="Transparent" id="do-search"></ui5-button>
        </div>
        <div class="search-tip">输入关键字并按回车搜索</div>
        <div class="search-results" id="search-results"></div>
      </div>
    `,
  },
  scm: {
    render: () => `
      <div class="scm-view">
        <div class="scm-section-title">更改 (3)</div>
        <ui5-list id="scm-list">
          <ui5-list-item-standard icon="edit" description="已修改" additional-text="M">
            portal-app.js
          </ui5-list-item-standard>
          <ui5-list-item-standard icon="add" description="新增" additional-text="A">
            portal-side-nav.js
          </ui5-list-item-standard>
          <ui5-list-item-standard icon="decline" description="已删除" additional-text="D">
            old-layout.js
          </ui5-list-item-standard>
        </ui5-list>
        <div style="padding: 8px; display:flex; gap:4px;">
          <ui5-button design="Emphasized" style="flex:1">提交</ui5-button>
          <ui5-button design="Default" icon="refresh">刷新</ui5-button>
        </div>
      </div>
    `,
  },
  extensions: {
    render: () => `
      <div class="ext-view">
        <div class="ext-search-row">
          <ui5-input placeholder="搜索扩展..." style="flex:1"></ui5-input>
        </div>
        <div class="ext-section-title">已安装</div>
        <ui5-list>
          <ui5-list-item-standard icon="puzzle" description="表单设计器 v1.2.0" additional-text="✓">
            CMX Form Designer
          </ui5-list-item-standard>
          <ui5-list-item-standard icon="puzzle" description="HTML设计器 v1.1.0" additional-text="✓">
            CMX HTML Designer
          </ui5-list-item-standard>
          <ui5-list-item-standard icon="puzzle" description="节点服务 v1.0.0" additional-text="✓">
            CMX Node Service
          </ui5-list-item-standard>
        </ui5-list>
        <div class="ext-section-title">推荐安装</div>
        <ui5-list>
          <ui5-list-item-standard icon="puzzle" description="流程设计器" additional-text="↓">
            CMX Flow Designer
          </ui5-list-item-standard>
        </ui5-list>
      </div>
    `,
  },
}

/**
 * 返回完整的 Shadow DOM CSS + 外层结构 HTML。
 * @returns {string}
 */
export function createSideNavTemplate () {
  return `
    <style>
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
        background: var(--portal-panel-bg);
        border-right: 1px solid var(--neo-border-subtle, var(--sapPageHeader_BorderColor, #ddd));
        box-shadow: inset -1px 0 0 color-mix(in srgb, var(--neo-violet, #7c3aed) 6%, transparent);
      }
      ${PORTAL_NEO_TAB_CHROME}
      ${PORTAL_NEO_SIDE_NAV_STYLES}
      .outer-tab-row {
        --portal-tab-row-bg: var(--sapGroup_ContentBackground, #fafafa);
        display: flex;
        flex-direction: row;
        align-items: stretch;
        flex-shrink: 0;
        height: 35px;
        min-width: 0;
        border-bottom: 1px solid var(--neo-border-subtle, var(--sapPageHeader_BorderColor, #ddd));
        background: var(--portal-tab-row-bg);
        backdrop-filter: blur(8px);
      }
      .outer-tab-strip {
        flex: 1 1 auto;
        min-width: 0;
        overflow: hidden;
        display: flex;
        align-items: stretch;
      }
      ${PORTAL_TAB_OVERFLOW_STYLES}
      .outer-tab {
        padding: 0 12px;
        display: flex;
        align-items: center;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        color: var(--sapContent_LabelColor, #6a6d70);
        border-bottom: 2px solid transparent;
        white-space: nowrap;
        user-select: none;
        flex-shrink: 0;
      }
      .outer-tab:hover { color: var(--sapTextColor, #333); }
      .outer-tab.active {
        color: var(--neo-cyan, var(--sapHighlightColor, #0070f2));
        border-bottom-color: var(--neo-cyan, var(--sapHighlightColor, #0070f2));
      }
      .panel-body {
        flex: 1 1 auto;
        min-height: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      /* 活动侧栏 html_pages 模式的 pane：flex 布局通过样式表声明，避免 setWorkspaceExplorer 切换
         显隐时把内联 display 置空后退化为 block 导致内部高度塌陷。 */
      #cmx-html-pages-sidenav-pane {
        position: relative;
        flex: 1 1 auto;
        min-height: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      #cmx-workspace-explorer-pane > .cmx-ws-tab-cache-root {
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
      #cmx-workspace-explorer-pane.${DROP_TARGET_CLASS} {
        ${PORTAL_NEO_DROP_TARGET}
      }
      .explorer-menu-view {
        display: flex;
        flex-direction: column;
        flex: 1 1 auto;
        min-height: 0;
        position: relative;
        overflow-y: auto;
        overflow-x: hidden;
      }
      .explorer-menu-view ui5-message-strip {
        flex-shrink: 0;
      }
      .portal-menu-search-row {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        gap: 4px;
        min-height: 30px;
        padding: 2px 4px;
        border-bottom: 1px solid var(--neo-border-subtle, var(--sapPageHeader_BorderColor, #ddd));
        box-sizing: border-box;
      }
      .portal-menu-search-row ui5-input {
        height: 26px;
      }
      #portal-menu-refresh {
        width: 26px;
        height: 26px;
        min-width: 26px;
        flex: 0 0 26px;
      }
      .explorer-menu-body {
        flex: 1 1 auto;
        min-height: 0;
        position: relative;
        display: flex;
        flex-direction: column;
      }
      .portal-menu-panels {
        flex: 1 1 auto;
        min-height: 0;
        height: 100%;
        display: flex;
        flex-direction: column;
        gap: 0;
        padding: 0;
        box-sizing: border-box;
        overflow: hidden auto;
      }
      .portal-menu-accordion {
        flex: 0 0 30px;
        min-height: 30px;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        background: var(--module-content-bg, var(--sapGroup_ContentBackground, #fff));
        border-bottom: 1px solid var(--module-border, var(--neo-border-subtle, var(--sapPageHeader_BorderColor, #ddd)));
      }
      /* 展开分组按内容自适应高度（不撑满整个侧栏）：分组少时后续分组头紧随其下，
         不被挤到面板底部；分组内容超出可视高度时由 .portal-menu-panels 整体滚动。 */
      .portal-menu-accordion[data-open="1"] {
        flex: 0 0 auto;
        min-height: 30px;
      }
      .portal-menu-accordion-head {
        width: 100%;
        height: 30px;
        flex: 0 0 30px;
        display: flex;
        align-items: center;
        justify-content: flex-start;
        gap: 6px;
        min-width: 0;
        padding: 0 8px 0 6px;
        border: 0;
        border-left: 3px solid var(--module-accent, var(--sapHighlightColor, #0070f2));
        background: linear-gradient(
          90deg,
          color-mix(in srgb, var(--module-accent, var(--sapHighlightColor, #0070f2)) 12%, var(--module-header-bg, var(--sapList_HeaderBackground, #fff))),
          var(--module-header-bg, var(--sapList_HeaderBackground, #fff))
        );
        font-size: 13px;
        font-weight: 600;
        color: var(--module-header-text, var(--sapGroup_TitleTextColor, var(--sapTextColor, #1d2d3e)));
        cursor: pointer;
        box-sizing: border-box;
        text-align: left;
        transition: background .18s ease, border-color .18s ease, color .18s ease;
      }
      .portal-menu-accordion[data-module-tone="light"] .portal-menu-accordion-head {
        border-left-width: 3px;
      }
      .portal-menu-accordion[data-module-tone="light"] .portal-menu-accordion-head:hover {
        background: linear-gradient(
          90deg,
          color-mix(in srgb, var(--module-accent) 20%, #ffffff),
          color-mix(in srgb, var(--module-accent) 10%, #ffffff)
        );
      }
      .portal-menu-accordion[data-open="1"] .portal-menu-accordion-head {
        border-left-width: 4px;
        box-shadow: inset 0 -1px 0 var(--module-border, var(--neo-border-subtle, var(--sapPageHeader_BorderColor, #ddd)));
      }
      .portal-menu-accordion-head:hover {
        background: color-mix(in srgb, var(--module-accent, var(--sapHighlightColor, #0070f2)) 12%, var(--module-header-bg, var(--sapList_Hover_Background, rgba(0, 0, 0, 0.03))));
      }
      .portal-menu-accordion-arrow {
        width: 12px;
        height: 12px;
        flex: 0 0 12px;
        color: var(--module-accent, var(--sapContent_IconColor, #5b6b7a));
      }
      .portal-menu-module-icon {
        width: 15px;
        height: 15px;
        flex: 0 0 auto;
        color: var(--module-accent, var(--sapContent_IconColor, #5b6b7a));
      }
      .portal-menu-module-title {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .portal-menu-accordion-content[hidden] {
        display: none;
      }
      .portal-menu-accordion-content {
        flex: 1 1 auto;
        min-height: 0;
        overflow: auto;
        background: var(--module-content-bg, var(--sapGroup_ContentBackground, #fff));
      }
      .portal-menu-accordion .explorer-side-nav {
        width: 100%;
        min-height: 100%;
        border: 0;
        background: var(--module-content-bg, var(--sapGroup_ContentBackground, #fff)) !important;
        --sapList_Background: var(--module-content-bg, var(--sapGroup_ContentBackground, #fff));
        --sapGroup_ContentBackground: var(--module-content-bg, var(--sapGroup_ContentBackground, #fff));
        --sapList_Hover_Background: color-mix(in srgb, var(--module-accent, var(--sapHighlightColor, #0070f2)) 12%, var(--module-content-bg, var(--sapGroup_ContentBackground, #fff)));
        --sapList_SelectionBackgroundColor: color-mix(in srgb, var(--module-accent, var(--sapHighlightColor, #0070f2)) 20%, var(--module-content-bg, var(--sapGroup_ContentBackground, #fff)));
        --sapList_Hover_SelectionBackground: color-mix(in srgb, var(--module-accent, var(--sapHighlightColor, #0070f2)) 26%, var(--module-content-bg, var(--sapGroup_ContentBackground, #fff)));
        --sapHighlightColor: var(--module-accent, var(--sapHighlightColor, #0070f2));
      }
      .portal-menu-accordion .explorer-side-nav ui5-side-navigation-item,
      .portal-menu-accordion .explorer-side-nav ui5-side-navigation-sub-item {
        --_ui5_side_navigation_icon_color: var(--module-accent, var(--sapContent_IconColor, #5b6b7a));
        --_ui5_side_navigation_expand_icon_color: var(--module-accent, var(--sapContent_IconColor, #5b6b7a));
        --_ui5_side_navigation_collapsed_selected_item_background:
          0 100% / 3px 100% no-repeat linear-gradient(180deg, var(--module-accent, var(--sapHighlightColor, #0070f2)), var(--module-accent, var(--sapHighlightColor, #0070f2))),
          color-mix(in srgb, var(--module-accent, var(--sapHighlightColor, #0070f2)) 20%, var(--module-content-bg, var(--sapGroup_ContentBackground, #fff)));
        --_ui5_side_navigation_collapsed_selected_item_background_hover:
          0 100% / 3px 100% no-repeat linear-gradient(180deg, var(--module-accent, var(--sapHighlightColor, #0070f2)), var(--module-accent, var(--sapHighlightColor, #0070f2))),
          color-mix(in srgb, var(--module-accent, var(--sapHighlightColor, #0070f2)) 26%, var(--module-content-bg, var(--sapGroup_ContentBackground, #fff)));
      }
      .explorer-menu-busy {
        position: absolute;
        inset: 0;
        z-index: 2;
        justify-content: center;
        align-items: center;
      }
      .explorer-menu-busy:not([active]) {
        visibility: hidden;
        pointer-events: none;
      }
      .search-view, .scm-view, .ext-view {
        padding: 8px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .search-input-row, .ext-search-row {
        display: flex;
        gap: 4px;
        align-items: center;
      }
      .search-tip {
        font-size: 12px;
        color: var(--sapContent_LabelColor, #6a6d70);
        padding: 4px 0;
      }
      .scm-section-title, .ext-section-title {
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.05em;
        padding: 8px 4px 4px 4px;
        text-transform: uppercase;
      }
    </style>
    <div class="outer-tab-row" id="outer-tab-row">
      <div class="outer-tab-strip" id="outer-tab-strip"></div>
      <div class="portal-tab-overflow-wrap" id="outer-tab-overflow-wrap" style="display:none">
        <button type="button" class="portal-tab-overflow-trigger" id="outer-tab-overflow-btn" aria-label="更多" title="更多">
          <ui5-icon name="slim-arrow-down"></ui5-icon>
        </button>
      </div>
    </div>
    <ui5-menu id="outer-tab-overflow-menu" horizontal-align="End"></ui5-menu>
    <div class="panel-body" id="panel-body"></div>
  `
}

/**
 * 解析 `side-nav-spec` attribute，返回类型化对象或 null。
 * @param {HTMLElement} host
 * @returns {{ type: 'module', menu: string, title: string } | { type: 'built-in', template: string, title: string } | { type: 'html_pages', views: object[], title: string } | null}
 */
export function parseSideNavSpecFromAttrs (host) {
  const raw = host.getAttribute('side-nav-spec')?.trim()
  if (!raw) return null
  try {
    const o = JSON.parse(raw)
    if (!o || typeof o !== 'object') return null
    const type = String(o.type ?? '').trim()
    /* `module` 与旧名 `menu-pages` 语义等价。 */
    if (type === 'module' || type === 'menu-pages') {
      const menu = String(o.menu ?? '').trim()
      const title = portalDisplayText(o.title)
      if (!menu) return null
      return { type: 'module', menu, title }
    }
    if (type === 'built-in') {
      const template = String(o.template ?? '').trim()
      const title = portalDisplayText(o.title)
      if (!template || !BUILTIN_TEMPLATES[template]) return null
      return { type: 'built-in', template, title }
    }
    if (type === 'html_pages') {
      const views = Array.isArray(o.views)
        ? o.views.filter((v) => v && typeof v === 'object')
        : []
      const title = portalDisplayText(o.title)
      if (!views.length) return null
      return { type: 'html_pages', views, title }
    }
    return null
  } catch {
    return null
  }
}

/**
 * 【遗留】构建菜单页 API URL（GET /api/menu-pages?menu=…）。
 * 后端该路由已注释废弃（cmx-common-api/src/handlers/portal/mod.rs，由 POST /api/domains/tree +
 * GET /api/menu/tree 替代）；本构造器仅服务 portal-side-nav-menu.js 非 DAM 菜单 key 的兼容分支，
 * 当前无实际触发方（setting-menu 已是死代码），若触发会 404。勿在新代码使用。
 * @param {HTMLElement} host
 * @param {string} menuKey
 * @returns {string}
 */
export function menuPagesUrl (host, menuKey) {
  const override = host.getAttribute('menu-pages-url')?.trim()
  if (override) {
    try {
      const u = new URL(override, window.location.href)
      u.searchParams.set('menu', menuKey)
      return u.toString()
    } catch {
      /* fall through */
    }
  }
  const u = new URL('/api/menu-pages', window.location.href)
  u.searchParams.set('menu', menuKey)
  return u.toString()
}
