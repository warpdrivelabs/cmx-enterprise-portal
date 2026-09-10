/**
 * CMX Portal 全局 Neo 皮肤：高科技 / 智能化视觉 token 与可复用样式片段。
 * 颜色通过 color-mix + --sap* 变量适配 UI5 亮/暗主题。
 */

/** 注入 document 根节点，供 Shadow DOM 继承 custom properties */
export const PORTAL_NEO_ROOT_VARS = `
  --neo-cyan: #00b4d8;
  --neo-violet: #7c3aed;
  --neo-mint: #10b981;
  --neo-warn: #f59e0b;
  --neo-accent: var(--neo-cyan);
  --neo-accent-2: var(--neo-violet);
  --neo-glass: color-mix(in srgb, var(--sapList_Background, #fff) 88%, transparent);
  --neo-glass-strong: color-mix(in srgb, var(--sapObjectHeader_Background, #f5f6f7) 93%, transparent);
  --neo-border: color-mix(in srgb, var(--neo-cyan) 28%, var(--sapGroup_ContentBorderColor, #d9d9d9));
  --neo-border-subtle: color-mix(in srgb, var(--neo-cyan) 12%, var(--sapGroup_TitleBorderColor, #ddd));
  --neo-glow: color-mix(in srgb, var(--neo-cyan) 20%, transparent);
  --neo-glow-violet: color-mix(in srgb, var(--neo-violet) 16%, transparent);
  --portal-tab-row-bg:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--sapObjectHeader_Background, #fff) 92%, var(--neo-violet) 8%),
      color-mix(in srgb, var(--sapObjectHeader_Background, #fff) 96%, var(--neo-cyan) 4%)
    );
  --portal-panel-bg:
    linear-gradient(
      165deg,
      color-mix(in srgb, var(--sapGroup_ContentBackground, #fafafa) 97%, var(--neo-violet) 3%),
      color-mix(in srgb, var(--sapGroup_ContentBackground, #fafafa) 98%, var(--neo-cyan) 2%)
    );
  --portal-workspace-bg:
    radial-gradient(ellipse 120% 70% at 0% 0%, color-mix(in srgb, var(--neo-violet) 7%, transparent), transparent 52%),
    radial-gradient(ellipse 90% 60% at 100% 100%, color-mix(in srgb, var(--neo-cyan) 6%, transparent), transparent 48%),
    var(--sapBackgroundColor, #f5f6f7);
  --portal-shellbar-bg:
    radial-gradient(ellipse 90% 180% at 0% -40%, color-mix(in srgb, var(--neo-violet) 24%, transparent), transparent 58%),
    radial-gradient(ellipse 80% 160% at 100% -30%, color-mix(in srgb, var(--neo-cyan) 22%, transparent), transparent 55%),
    radial-gradient(ellipse 60% 120% at 50% 120%, color-mix(in srgb, var(--neo-mint) 14%, transparent), transparent 60%),
    linear-gradient(
      102deg,
      color-mix(in srgb, var(--sapShellColor, #1b2a3b) 68%, var(--neo-violet) 32%),
      color-mix(in srgb, var(--sapShellColor, #1b2a3b) 72%, var(--neo-cyan) 28%) 48%,
      color-mix(in srgb, var(--sapShellColor, #1b2a3b) 76%, var(--neo-mint) 24%)
    );
  --portal-statusbar-bg:
    linear-gradient(
      90deg,
      color-mix(in srgb, var(--sapShellColor, #1b2a3b) 92%, var(--neo-violet) 8%),
      color-mix(in srgb, var(--sapShellColor, #1b2a3b) 94%, var(--neo-cyan) 6%)
    );
`

export const PORTAL_NEO_KEYFRAMES = ''

/** :host 级 token（Shadow 内未继承根变量时的兜底） */
export const PORTAL_NEO_HOST_VARS = `
  ${PORTAL_NEO_ROOT_VARS}
`

/** 顶栏 / 状态栏底部高光线（静态，无动画） */
export const PORTAL_NEO_ACCENT_LINE = `
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent,
    var(--neo-violet),
    var(--neo-cyan),
    var(--neo-mint),
    transparent 85%
  );
  opacity: 0.72;
  pointer-events: none;
`

/** 共享 Tab 行 / 标签 neo 样式（侧栏、内容区、日志、属性） */
export const PORTAL_NEO_TAB_CHROME = `
  ${PORTAL_NEO_KEYFRAMES}
  .outer-tab,
  .tab-item,
  .tab-btn,
  .prop-outer-tab {
    position: relative;
    transition:
      color 0.18s ease,
      background 0.18s ease,
      border-color 0.18s ease,
      box-shadow 0.18s ease;
  }
  .outer-tab.active,
  .tab-item.active,
  .tab-btn.active,
  .prop-outer-tab.active {
    color: var(--neo-cyan);
    text-shadow: 0 0 12px color-mix(in srgb, var(--neo-cyan) 25%, transparent);
  }
  .outer-tab.active {
    border-bottom-color: var(--neo-cyan);
    box-shadow: inset 0 -2px 0 var(--neo-cyan), 0 0 14px color-mix(in srgb, var(--neo-cyan) 12%, transparent);
  }
  .tab-item.active {
    background: color-mix(in srgb, var(--sapBackgroundColor, #f5f6f7) 94%, var(--neo-cyan) 6%);
    border-bottom: 2px solid var(--neo-cyan);
    box-shadow: inset 0 -1px 0 color-mix(in srgb, var(--neo-cyan) 35%, transparent);
  }
  .tab-btn.active,
  .prop-outer-tab {
    border-bottom-color: var(--neo-cyan);
    box-shadow: inset 0 -2px 0 var(--neo-cyan);
  }
  .outer-tab:hover,
  .tab-item:hover,
  .tab-btn:hover {
    background: color-mix(in srgb, var(--neo-cyan) 6%, var(--sapHoverColor, transparent));
  }
`

/** Splitter 霓虹拖拽条 */
export const PORTAL_NEO_SPLITTER_STYLES = `
  ${PORTAL_NEO_KEYFRAMES}
  .splitter {
    background: var(--neo-border-subtle);
    position: relative;
    flex-shrink: 0;
    z-index: 2;
    transition: background 0.15s ease, box-shadow 0.15s ease, width 0.12s ease, height 0.12s ease;
  }
  .splitter-v {
    width: 1px;
    cursor: col-resize;
    height: 100%;
  }
  .splitter-h {
    height: 1px;
    cursor: row-resize;
    width: 100%;
  }
  .splitter-v[data-hidden], .splitter-h[data-hidden] {
    display: none;
  }
  .splitter:hover,
  .splitter.dragging {
    background: linear-gradient(
      180deg,
      var(--neo-violet),
      var(--neo-cyan),
      var(--neo-mint)
    );
    box-shadow: 0 0 8px var(--neo-glow);
  }
  .splitter-v:hover,
  .splitter-v.dragging {
    width: 2px;
  }
  .splitter-h:hover,
  .splitter-h.dragging {
    height: 2px;
  }
`

/** 活动栏 neo 样式 */
export const PORTAL_NEO_ACTIVITY_BAR_STYLES = `
  ${PORTAL_NEO_KEYFRAMES}
  :host {
    background: var(--portal-panel-bg);
    border-right: 1px solid var(--neo-border-subtle);
    box-shadow: inset -1px 0 0 color-mix(in srgb, var(--neo-violet) 8%, transparent);
  }
  .act-btn.active {
    color: var(--neo-cyan);
    background: color-mix(in srgb, var(--neo-cyan) 10%, transparent);
  }
  .act-btn.active::before {
    width: 3px;
    background: linear-gradient(180deg, var(--neo-violet), var(--neo-cyan), var(--neo-mint));
    box-shadow: 0 0 10px var(--neo-glow);
    border-radius: 0 3px 3px 0;
  }
  .act-btn:hover {
    background: color-mix(in srgb, var(--neo-cyan) 8%, var(--sapList_Hover_Background, transparent));
    color: var(--sapContent_IconColor, #32363a);
  }
`

/** ShellBar 容器 neo 样式 */
export const PORTAL_NEO_SHELLBAR_STYLES = `
  ${PORTAL_NEO_KEYFRAMES}
  .bar {
    display: flex;
    align-items: center;
    position: relative;
    overflow: hidden;
    isolation: isolate;
    background: var(--portal-shellbar-bg);
    border-bottom: 1px solid var(--neo-border);
    box-shadow:
      inset 0 1px 0 color-mix(in srgb, var(--sapList_Background, #ffffff) 16%, transparent),
      0 8px 28px color-mix(in srgb, var(--neo-violet) 12%, transparent),
      0 2px 12px color-mix(in srgb, var(--neo-cyan) 10%, transparent);
  }
  .bar::before {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 0;
    opacity: 0.55;
    background-image:
      linear-gradient(color-mix(in srgb, var(--neo-cyan) 10%, transparent) 1px, transparent 1px),
      linear-gradient(90deg, color-mix(in srgb, var(--neo-cyan) 10%, transparent) 1px, transparent 1px);
    background-size: 28px 28px;
    mask-image: linear-gradient(180deg, #000 0%, transparent 88%);
  }
  .bar::after {
    ${PORTAL_NEO_ACCENT_LINE}
    z-index: 2;
  }
  .bar > ui5-shellbar {
    position: relative;
    z-index: 1;
  }
  /* UI5 ShellBar 自带 background: var(--sapShellColor)，亮色下会盖住 .bar 渐变 */
  ui5-shellbar {
    background: transparent !important;
    box-shadow: none !important;
  }
  ui5-shellbar-search,
  ui5-shellbar-search::part(root) {
    filter: drop-shadow(0 0 10px color-mix(in srgb, var(--neo-cyan) 12%, transparent));
  }
  ui5-button[design="Transparent"],
  ui5-toggle-button {
    transition: box-shadow 0.18s ease, filter 0.18s ease;
  }
  ui5-button[design="Transparent"]:hover,
  ui5-toggle-button:hover {
    filter: drop-shadow(0 0 6px color-mix(in srgb, var(--neo-cyan) 22%, transparent));
  }
  .portal-domain-item.active {
    background: color-mix(in srgb, var(--neo-cyan) 12%, var(--sapList_SelectionBackgroundColor, transparent));
    color: var(--neo-cyan);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--neo-cyan) 22%, transparent);
  }
  .portal-domain-item:hover {
    background: color-mix(in srgb, var(--neo-violet) 8%, var(--sapList_Hover_Background, transparent));
  }
  #assistant-btn {
    --neo-cyan: #00b4d8;
    --neo-violet: #7c3aed;
    transition: filter 0.2s ease, transform 0.18s ease;
  }
  #assistant-btn[pressed] {
    filter: drop-shadow(0 0 8px color-mix(in srgb, var(--neo-violet) 50%, transparent))
            drop-shadow(0 0 4px color-mix(in srgb, var(--neo-cyan) 40%, transparent));
    transform: scale(1.04);
  }
`

export const PORTAL_NEO_SCROLLBAR_STYLE_ID = 'portal-neo-scrollbar-v3'

/** 侧栏滚动条：极低对比，贴近背景 */
const PORTAL_NEO_SCROLLBAR_MUTED_THUMB = `
  color-mix(in srgb, var(--sapContent_LabelColor, #89919a) 26%, var(--sapGroup_ContentBackground, #fafafa) 74%)
`
const PORTAL_NEO_SCROLLBAR_MUTED_THUMB_HOVER = `
  color-mix(in srgb, var(--sapContent_LabelColor, #89919a) 36%, var(--sapGroup_ContentBackground, #fafafa) 64%)
`

/** 门户侧栏 / 面板可滚动区的 Neo 滚动条（宿主 Shadow 内使用） */
export const PORTAL_NEO_SCROLLBAR_STYLES = `
  .explorer-menu-view,
  .explorer-menu-body,
  .panel-body,
  .search-view,
  .scm-view,
  .ext-view {
    scrollbar-width: thin;
    scrollbar-color: ${PORTAL_NEO_SCROLLBAR_MUTED_THUMB} transparent;
  }
  .explorer-menu-view::-webkit-scrollbar,
  .explorer-menu-body::-webkit-scrollbar,
  .panel-body::-webkit-scrollbar,
  .search-view::-webkit-scrollbar,
  .scm-view::-webkit-scrollbar,
  .ext-view::-webkit-scrollbar {
    width: 5px;
    height: 5px;
  }
  .explorer-menu-view::-webkit-scrollbar-track,
  .explorer-menu-body::-webkit-scrollbar-track,
  .panel-body::-webkit-scrollbar-track,
  .search-view::-webkit-scrollbar-track,
  .scm-view::-webkit-scrollbar-track,
  .ext-view::-webkit-scrollbar-track {
    background: transparent;
    border-radius: 999px;
    margin: 0;
  }
  .explorer-menu-view::-webkit-scrollbar-thumb,
  .explorer-menu-body::-webkit-scrollbar-thumb,
  .panel-body::-webkit-scrollbar-thumb,
  .search-view::-webkit-scrollbar-thumb,
  .scm-view::-webkit-scrollbar-thumb,
  .ext-view::-webkit-scrollbar-thumb {
    background: ${PORTAL_NEO_SCROLLBAR_MUTED_THUMB};
    border-radius: 999px;
    border: 1px solid transparent;
    background-clip: padding-box;
    opacity: 0.55;
  }
  .explorer-menu-view::-webkit-scrollbar-thumb:hover,
  .explorer-menu-body::-webkit-scrollbar-thumb:hover,
  .panel-body::-webkit-scrollbar-thumb:hover,
  .search-view::-webkit-scrollbar-thumb:hover,
  .scm-view::-webkit-scrollbar-thumb:hover,
  .ext-view::-webkit-scrollbar-thumb:hover {
    background: ${PORTAL_NEO_SCROLLBAR_MUTED_THUMB_HOVER};
    opacity: 0.78;
  }
  .explorer-menu-view::-webkit-scrollbar-corner,
  .explorer-menu-body::-webkit-scrollbar-corner,
  .panel-body::-webkit-scrollbar-corner {
    background: transparent;
  }
`

/** 注入 ui5-side-navigation Shadow DOM 内滚动列表的 Neo 滚动条 */
export const PORTAL_NEO_SIDE_NAV_SCROLLBAR_INJECT = `
  .ui5-sn-root,
  .ui5-sn-flexible,
  .ui5-sn-list {
    scrollbar-width: thin;
    scrollbar-color: ${PORTAL_NEO_SCROLLBAR_MUTED_THUMB} transparent;
  }
  /* 右侧留 4px 垫：选中/悬停背景（带圆角）不贴死右边框 */
  .ui5-sn-flexible,
  .ui5-sn-list.ui5-sn-flexible {
    background: transparent;
    padding-inline-end: 0.25rem !important;
  }
  .ui5-sn-list.ui5-sn-fixed {
    padding-inline-end: 0.25rem !important;
  }
  .ui5-sn-root::-webkit-scrollbar,
  .ui5-sn-flexible::-webkit-scrollbar,
  .ui5-sn-list::-webkit-scrollbar {
    width: 5px;
    height: 5px;
  }
  .ui5-sn-root::-webkit-scrollbar-track,
  .ui5-sn-flexible::-webkit-scrollbar-track,
  .ui5-sn-list::-webkit-scrollbar-track {
    background: transparent;
    border-radius: 999px;
    margin: 0;
  }
  .ui5-sn-root::-webkit-scrollbar-thumb,
  .ui5-sn-flexible::-webkit-scrollbar-thumb,
  .ui5-sn-list::-webkit-scrollbar-thumb {
    background: ${PORTAL_NEO_SCROLLBAR_MUTED_THUMB};
    border-radius: 999px;
    border: 1px solid transparent;
    background-clip: padding-box;
    opacity: 0.55;
  }
  .ui5-sn-root::-webkit-scrollbar-thumb:hover,
  .ui5-sn-flexible::-webkit-scrollbar-thumb:hover,
  .ui5-sn-list::-webkit-scrollbar-thumb:hover {
    background: ${PORTAL_NEO_SCROLLBAR_MUTED_THUMB_HOVER};
    opacity: 0.78;
  }
  .ui5-sn-root::-webkit-scrollbar-corner,
  .ui5-sn-flexible::-webkit-scrollbar-corner,
  .ui5-sn-list::-webkit-scrollbar-corner {
    background: transparent;
  }
`

/**
 * 注入 ui5-side-navigation-item / ui5-side-navigation-sub-item 各自 Shadow DOM 的
 * 菜单树紧凑样式（图标左距 / 层级对齐 / 箭头间距）。
 *
 * 注意：
 * 1. 这些 .ui5-sn-item-* 规则位于每个 item 子组件自己的 ShadowRoot 内（不在
 *    ui5-side-navigation 宿主里），必须逐个 item 注入——见
 *    [applyPortalNeoSideNavScrollbar]。
 * 2. UI5 原生样式经 adoptedStyleSheets 加载，级联顺序在 shadowRoot 内普通 <style>
 *    之后——同特异性必然胜出，因此本段覆盖一律加 !important（仅 padding/margin/
 *    border，安全）。
 * 3. UI5 内部类名属私有实现，升级 @ui5/webcomponents-fiori 版本时需回归验证。
 */
export const PORTAL_NEO_SIDE_NAV_TREE_INJECT = `
  /* 展开箭头与文本的间距 16px→4px，配合箭头区收窄把宽度还给文字 */
  :host(:not([unselectable],[side-nav-collapsed],[ui5-side-navigation-group])) .ui5-sn-item-toggle-icon {
    margin-inline-start: 0.25rem !important;
  }
  /* 图标左距 16px→4px（与容器左垫对齐），图标后间距保持 8px */
  .ui5-sn-item-icon {
    padding-inline-start: 0.5rem !important;
    padding-inline-end: 0.5rem !important;
  }
  /* 无图标二级项：原生按图标列宽（40px）对齐，改为与深层级一致的 12px 步进 */
  .ui5-sn-item-level2:not(.ui5-sn-item-has-icon) {
    padding-inline-start: 0.75rem !important;
  }
`

const PORTAL_NEO_TREE_STYLE_ID = 'portal-neo-side-nav-tree-style'

/**
 * 向 ShadowRoot 注入 Neo 滚动条样式（幂等）。
 * @param {ShadowRoot|DocumentFragment|null|undefined} root
 * @param {string} [css]
 * @param {string} [styleId]
 */
export function injectPortalNeoScrollbarStyles (
  root,
  css = PORTAL_NEO_SIDE_NAV_SCROLLBAR_INJECT,
  styleId = PORTAL_NEO_SCROLLBAR_STYLE_ID,
) {
  if (!root || root.getElementById?.(styleId)) return
  const style = document.createElement('style')
  style.id = styleId
  style.textContent = css
  root.appendChild(style)
}

/** 为 ui5-side-navigation 应用 Neo 滚动条 + 菜单树紧凑样式（Shadow DOM 注入）。
 *
 * 两处注入目标：
 *   1. side-navigation 宿主 shadow：滚动条 + 列表右垫（.ui5-sn-list 在宿主内）。
 *   2. 每个 item / sub-item 子组件 shadow：图标左距 / 层级对齐 / 箭头间距
 *      （.ui5-sn-item-* 在子组件内，宿主注入够不着）。菜单每次重建（搜索/刷新）后
 *      都会重新调用本函数，新建 item 由此覆盖；注入按 styleId 幂等。
 */
export function applyPortalNeoSideNavScrollbar (sideNavEl) {
  if (!(sideNavEl instanceof HTMLElement)) return
  const injectAll = () => {
    if (sideNavEl.shadowRoot) {
      injectPortalNeoScrollbarStyles(sideNavEl.shadowRoot)
    }
    let pending = !sideNavEl.shadowRoot
    sideNavEl.querySelectorAll('ui5-side-navigation-item, ui5-side-navigation-sub-item')
      .forEach((item) => {
        if (item.shadowRoot) {
          injectPortalNeoScrollbarStyles(
            item.shadowRoot,
            PORTAL_NEO_SIDE_NAV_TREE_INJECT,
            PORTAL_NEO_TREE_STYLE_ID,
          )
        } else {
          pending = true // custom element 尚未升级（无 shadowRoot），下帧重试
        }
      })
    return pending
  }
  let tries = 0
  const run = () => {
    const pending = injectAll()
    if (pending && ++tries < 10) requestAnimationFrame(run) // 兜底升级慢的 item（最多 ~10 帧）
  }
  run()
}

/** 侧栏 explorer 菜单 + ui5-side-navigation Neo 样式 */
export const PORTAL_NEO_SIDE_NAV_STYLES = `
  ${PORTAL_NEO_KEYFRAMES}
  .explorer-menu-view {
    position: relative;
    background:
      radial-gradient(ellipse 100% 80% at 0% 0%, color-mix(in srgb, var(--neo-violet) 9%, transparent), transparent 55%),
      radial-gradient(ellipse 80% 70% at 100% 100%, color-mix(in srgb, var(--neo-cyan) 8%, transparent), transparent 50%),
      color-mix(in srgb, var(--sapGroup_ContentBackground, #fafafa) 94%, var(--neo-violet) 6%);
  }
  .explorer-menu-view::before {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 0;
    opacity: 0.38;
    background-image:
      linear-gradient(color-mix(in srgb, var(--neo-cyan) 5%, transparent) 1px, transparent 1px),
      linear-gradient(90deg, color-mix(in srgb, var(--neo-cyan) 5%, transparent) 1px, transparent 1px);
    background-size: 24px 24px;
    mask-image: linear-gradient(180deg, #000 0%, transparent 88%);
  }
  .explorer-menu-view > * { position: relative; z-index: 1; }
  .explorer-menu-body {
    background: transparent;
  }
  .portal-menu-search-row {
    background:
      linear-gradient(90deg,
        color-mix(in srgb, var(--neo-violet) 6%, var(--sapGroup_ContentBackground, transparent)),
        color-mix(in srgb, var(--neo-cyan) 8%, var(--sapGroup_ContentBackground, transparent)));
    backdrop-filter: blur(8px);
    box-shadow: inset 0 -1px 0 color-mix(in srgb, var(--neo-cyan) 12%, transparent);
  }
  .portal-menu-search-row ui5-input {
    --sapField_Background: color-mix(in srgb, var(--neo-cyan) 7%, var(--sapField_Background, #fff));
    --sapField_BorderColor: color-mix(in srgb, var(--neo-cyan) 24%, var(--sapField_BorderColor, #89919a));
    --sapField_Shadow: 0 0 10px color-mix(in srgb, var(--neo-cyan) 8%, transparent);
  }
  .explorer-menu-busy {
    background: color-mix(in srgb, var(--neo-violet) 6%, var(--sapGroup_ContentBackground, #fafafa) 88%);
    backdrop-filter: blur(6px);
  }
  .explorer-side-nav {
    flex: 1 1 auto;
    min-height: 0;
    align-self: stretch;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    --_ui5_side_navigation_width: 100%;
    /* 空间紧凑化：容器左垫 8px→4px；首层（无图标）项左垫 16px→4px，尽量贴齐模块头文字列。
       上下垫对称（各 4px）：选中项高亮胶囊不贴死相邻分组头，fixed/flexible 两模式保持一致 */
    --_ui5_side_navigation_padding-flexible: 0.25rem 0 0.25rem 0.25rem;
    --_ui5_side_navigation_padding-fixed: 0.25rem 0 0.25rem 0.25rem;
    --_ui5_side_navigation_item_padding_left: 0.25rem;
    background: transparent !important;
    --_ui5_side_navigation_box_shadow: none;
    --_ui5_side_navigation_border_right: none;
    --sapList_Background: transparent;
    --sapList_Hover_Background: color-mix(in srgb, var(--neo-cyan) 10%, var(--sapGroup_ContentBackground, #f5f5f5));
    --sapList_SelectionBackgroundColor: color-mix(in srgb, var(--neo-cyan) 16%, var(--sapGroup_ContentBackground, #fff));
    --sapList_Hover_SelectionBackground: color-mix(in srgb, var(--neo-cyan) 22%, var(--sapGroup_ContentBackground, #fff));
    --sapHighlightColor: var(--neo-cyan);
    /* 行高收紧 2.75rem→2.5rem；展开箭头区 36px→24px（省出的宽度给文字） */
    --_ui5_side_navigation_item_height: 2.5rem;
    --_ui5_side_navigation_expand_icon_width: 1.5rem;
  }
  .explorer-side-nav ui5-side-navigation-item,
  .explorer-side-nav ui5-side-navigation-sub-item {
    --_ui5_side_navigation_icon_color: color-mix(in srgb, var(--neo-cyan) 80%, var(--sapList_TextColor, #32363a));
    --_ui5_side_navigation_expand_icon_color: var(--neo-violet);
    --_ui5_side_navigation_item_border_radius: 8px;
    --_ui5_side_navigation_item_bottom_margin: 0;
    --_ui5_side_navigation_collapsed_selected_item_background:
      0 100% / 3px 100% no-repeat linear-gradient(180deg, var(--neo-violet), var(--neo-cyan), var(--neo-mint)),
      color-mix(in srgb, var(--neo-cyan) 18%, var(--sapGroup_ContentBackground, #fff));
    --_ui5_side_navigation_collapsed_selected_item_background_hover:
      0 100% / 3px 100% no-repeat linear-gradient(180deg, var(--neo-violet), var(--neo-cyan), var(--neo-mint)),
      color-mix(in srgb, var(--neo-cyan) 24%, var(--sapGroup_ContentBackground, #fff));
  }
  .explorer-side-nav ui5-side-navigation-item[unselectable] {
    --_ui5_side_navigation_icon_color: var(--neo-violet);
    --sapContent_LabelColor: color-mix(in srgb, var(--neo-violet) 70%, var(--sapContent_LabelColor, #6a6d70));
  }
  /* 层级步进：每深一级只右移 0.75rem（12px），替代旧的 calc(icon_width - 2ch)≈28px——
     四级累计偏移 ~110px → ~36px，深层菜单不再被挤出可视区。 */
  .explorer-side-nav ui5-side-navigation-item ui5-side-navigation-item,
  .explorer-side-nav ui5-side-navigation-item ui5-side-navigation-sub-item[icon] {
    padding-inline-start: 0.75rem;
    box-sizing: border-box;
  }
  .explorer-side-nav ui5-side-navigation-item[data-cmx-menu-search-hit],
  .explorer-side-nav ui5-side-navigation-sub-item[data-cmx-menu-search-hit] {
    background: color-mix(in srgb, var(--neo-warn) 14%, transparent);
    box-shadow: inset 3px 0 0 var(--neo-warn);
    border-radius: var(--sapElement_BorderCornerRadius, 0.25rem);
  }
  .search-view, .scm-view, .ext-view {
    background:
      radial-gradient(ellipse 90% 60% at 0% 0%, color-mix(in srgb, var(--neo-violet) 6%, transparent), transparent 50%),
      color-mix(in srgb, var(--sapGroup_ContentBackground, #fafafa) 96%, var(--neo-cyan) 4%);
  }
  .scm-section-title, .ext-section-title {
    color: var(--neo-cyan);
    letter-spacing: 0.08em;
  }
  ${PORTAL_NEO_SCROLLBAR_STYLES}
`

/** 状态栏 neo 样式 */
export const PORTAL_NEO_STATUS_BAR_STYLES = `
  ${PORTAL_NEO_KEYFRAMES}
  :host {
    position: relative;
    background: var(--portal-statusbar-bg);
    border-top: 1px solid var(--neo-border-subtle);
    box-shadow: inset 0 1px 0 color-mix(in srgb, var(--sapList_Background, #ffffff) 8%, transparent);
    font-family: ui-monospace, var(--sapFontFamily, system-ui), monospace;
    letter-spacing: 0.02em;
  }
  :host::before {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--neo-cyan), var(--neo-violet), transparent 80%);
    opacity: 0.55;
    pointer-events: none;
  }
  .status-item[data-clickable]:hover,
  .tray-item:hover {
    background: color-mix(in srgb, var(--neo-cyan) 10%, var(--sapShell_Hover_Background, transparent));
    color: var(--neo-cyan);
  }
  .separator {
    background: var(--neo-border-subtle);
  }
`

/** 侧栏 / 内容区 / dock 面板背景 */
export const PORTAL_NEO_PANEL_SURFACE = `
  background: var(--portal-panel-bg);
  border-color: var(--neo-border-subtle);
`

/** 拖放高亮 */
export const PORTAL_NEO_DROP_TARGET = `
  outline: 2px dashed var(--neo-cyan);
  outline-offset: -2px;
  background: color-mix(in srgb, var(--neo-cyan) 8%, var(--sapList_Background, transparent));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--neo-cyan) 15%, transparent);
`

/** 在 document 根注入 Neo CSS 变量（可选；通常由 portal-neo-theme.css 提供） */
export function initPortalNeoTheme () {
  if (typeof document === 'undefined') return
  const id = 'portal-neo-root-vars'
  if (document.getElementById(id)) return
  const style = document.createElement('style')
  style.id = id
  style.textContent = `:root { ${PORTAL_NEO_ROOT_VARS} }`
  document.head.appendChild(style)
}
