/**
 * 顶部 ShellBar — 布局与交互对齐 CMXHTMLDesigner 的 designer-topbar（ShellBarSearch、主题下拉等）。
 */
import '@ui5/webcomponents/dist/Dialog.js'
import '@ui5/webcomponents/dist/Menu.js'
import '@ui5/webcomponents/dist/MenuItem.js'
import '@ui5/webcomponents/dist/Popover.js'
import '@ui5/webcomponents-fiori/dist/ShellBarItem.js'
import {
  PORTAL_THEMES,
  applyPortalUi5Theme,
  getStoredPortalUi5Theme,
  portalThemeInfo,
} from '../lib/portal-ui5-theme.js'
import {
  PORTAL_LANGUAGES,
  applyPortalUi5Language,
  getPortalCopy,
  getStoredPortalUi5Language,
  portalLanguageInfo,
} from '../lib/portal-ui5-locale.js'
import cmxLogoUrl from '../assets/cmx.png?url'
import { PORTAL_APP_VERSION, PORTAL_BUILD_TIME } from '../portal-build-version.js'
import { escAttr } from '../lib/escape.js'
import { openDialogCentered } from '../lib/dialog-center.js'
import { PORTAL_NEO_SHELLBAR_STYLES } from '../lib/portal-neo-theme.js'
import { saveActiveDam } from '../lib/dam-context.js'

const _themeIcon = (dark) => (dark ? 'dark-mode' : 'light-mode')

/** Simple Icons CDN（与 welcome.html 技术栈 chips 同源） */
const si = (slug) => `https://cdn.simpleicons.org/${encodeURIComponent(slug)}?viewbox=auto&size=14`

/** @typedef {{ name: string, desc: string, icons: string | string[] }} OpenSourceEntry */

/** @type {OpenSourceEntry[]} */
const OPEN_SOURCE_COMPONENTS = [
  { name: 'SAP UI5 Web Components', desc: '@ui5/webcomponents / fiori / icons', icons: si('sap') },
  { name: 'Lit', desc: 'Web Components 基础能力', icons: si('lit') },
  { name: 'Vite', desc: '前端构建与开发服务器', icons: si('vite') },
  { name: 'CodeMirror 6', desc: '代码编辑器能力', icons: si('codemirror') },
  { name: 'cmx-container', desc: 'Rust 企业服务容器与门户后端', icons: cmxLogoUrl },
  { name: 'Axum', desc: 'Rust HTTP 服务框架', icons: si('rust') },
  { name: 'Tokio', desc: 'Rust 异步运行时', icons: si('rust') },
  { name: 'Tower / Tower HTTP', desc: 'HTTP 中间件与服务抽象', icons: si('rust') },
  { name: 'Serde / serde_json', desc: '序列化与 JSON 数据处理', icons: si('rust') },
  { name: 'SQLx', desc: '异步 SQL 数据访问', icons: si('postgresql') },
  { name: 'SeaQuery', desc: 'SQL 查询构建器', icons: si('rust') },
  { name: 'Tracing', desc: '结构化日志与链路追踪', icons: si('rust') },
  { name: 'Utoipa / Swagger UI', desc: 'OpenAPI 文档与接口调试', icons: si('swagger') },
  { name: 'Volo / Volo gRPC', desc: 'Rust RPC 与服务通讯能力', icons: si('grpc') },
  { name: 'Wasmtime / Extism', desc: 'WebAssembly 插件运行能力', icons: si('webassembly') },
  { name: 'OpenDAL', desc: '统一对象存储访问层', icons: si('apache') },
  { name: 'Redis / Moka', desc: '分布式缓存与本地缓存', icons: si('redis') },
  { name: 'jsonwebtoken / Argon2', desc: '认证令牌与密码哈希', icons: si('rust') },
  { name: 'CMX Data Comp', desc: '数据集、主从模型与表格组件', icons: cmxLogoUrl },
  { name: 'CMX Icon Resource', desc: '图标资源', icons: cmxLogoUrl },
  { name: 'CMX UI5 Runtime', desc: '运行时 UI 能力', icons: cmxLogoUrl },
  /* 欢迎页「技术栈」区块（welcome.html chips） */
  { name: 'Web Component', desc: '标准化 Web 组件生态与跨框架 UI 复用', icons: si('webcomponentsdotorg') },
  { name: 'Node.js', desc: '前端工具链与服务端脚本运行时', icons: si('nodedotjs') },
  { name: 'Rust', desc: '高性能系统内核与服务实现语言', icons: si('rust') },
  { name: 'WebAssembly', desc: 'Wasm 字节码与可扩展插件能力', icons: si('webassembly') },
  { name: 'Code Server', desc: '浏览器内 VS Code 远程开发环境', icons: si('vscodium') },
  { name: 'Docker / Kubernetes', desc: '容器化部署与集群编排', icons: [si('docker'), si('kubernetes')] },
  { name: 'PostgreSQL', desc: '开源关系型数据库', icons: si('postgresql') },
  { name: 'MySQL', desc: '关系型数据库与兼容生态', icons: si('mysql') },
  { name: 'Pingora', desc: 'Cloudflare 高性能反向代理与服务框架', icons: [si('cloudflare'), si('rust')] },
  { name: 'Quickwit', desc: '日志检索与分析引擎', icons: 'https://quickwit.io/favicons/favicon-32x32.png' },
  { name: 'Nacos', desc: '服务发现、配置与命名服务', icons: 'https://cdn.jsdelivr.net/gh/log-z/logos@main/website-logos/nacos.svg' },
]

function renderOpenSourceStackIcons (icons) {
  const list = Array.isArray(icons) ? icons : [icons]
  if (list.length === 1) {
    return `<img class="portal-about-stack-icon" src="${escAttr(list[0])}" alt="" loading="lazy" />`
  }
  return `<span class="portal-about-stack-icons">${list.map((url) =>
    `<img class="portal-about-stack-icon" src="${escAttr(url)}" alt="" loading="lazy" />`
  ).join('')}</span>`
}

function renderOpenSourceStackRows () {
  return OPEN_SOURCE_COMPONENTS.map(({ name, desc, icons }) =>
    `<div class="portal-about-stack-row">
      ${renderOpenSourceStackIcons(icons)}
      <div class="portal-about-stack-name">${escAttr(name)}</div>
      <div class="portal-about-stack-desc">${escAttr(desc)}</div>
    </div>`
  ).join('')
}

export class PortalShellbar extends HTMLElement {
  constructor () {
    super()
    this.attachShadow({ mode: 'open' })
    /** @type {{ id: string, icon: string, label: string, activitie: string }[]} */
    this._domains = []
    this._activeDomainId = ''
    /** 通知中心：三中心元信息 + 各中心未读数（红色角标 = total）。 */
    this._notifyCenters = [
      { id: 'task', label: '任务中心', icon: 'task' },
      { id: 'message', label: '消息中心', icon: 'email' },
      { id: 'log', label: '日志中心', icon: 'history' },
    ]
    this._notifyCounts = { task: 0, message: 0, log: 0, total: 0 }
  }

  connectedCallback () {
    this._render()
    this._wireEvents()
  }

  /**
   * @param {{ id: string, icon: string, label: string, activitie: string }[]} domains
   * @param {string} activeDomainId
   */
  setDomains (domains, activeDomainId) {
    this._domains = Array.isArray(domains) ? domains : []
    this._activeDomainId = activeDomainId || (this._domains[0]?.id ?? '')
    this._updateDomainPopover()
  }

  setStartButtonIcon (icon) {
    const btn = this.shadowRoot?.getElementById('start-btn')
    if (btn) btn.setAttribute('icon', icon)
  }

  _themeButtonIcon () {
    const id = getStoredPortalUi5Theme()
    return _themeIcon(portalThemeInfo(id)?.dark ?? true)
  }

  _activeDomain () {
    return this._domains.find(d => d.id === this._activeDomainId) ?? this._domains[0] ?? null
  }

  _domainPopoverItems () {
    return this._domains.map((d) => {
      const isActive = d.id === this._activeDomainId
      return `<button class="portal-domain-item${isActive ? ' active' : ''}" data-domain-id="${escAttr(d.id)}" title="${escAttr(d.label)}">
        <ui5-icon name="${escAttr(d.icon)}" class="portal-domain-icon"></ui5-icon>
        <span>${escAttr(d.label)}</span>
      </button>`
    }).join('')
  }

  /** 通知下拉项：任务/消息/日志中心，各自带未读数角标。 */
  _notifyPopoverItems () {
    const cnt = this._notifyCounts || {}
    return this._notifyCenters.map((c) => {
      const n = Number(cnt[c.id] || 0)
      return `<button class="portal-notif-item" data-notif-center="${escAttr(c.id)}" title="${escAttr(c.label)}">
        <ui5-icon name="${escAttr(c.icon)}" class="portal-notif-icon"></ui5-icon>
        <span class="portal-notif-label">${escAttr(c.label)}</span>
        <span class="portal-notif-badge${n > 0 ? ' has' : ''}">${n > 99 ? '99+' : n}</span>
      </button>`
    }).join('')
  }

  /** 设置三中心元信息（后端 /notifications/centers）。 */
  setNotifyCenters (centers) {
    if (Array.isArray(centers) && centers.length) this._notifyCenters = centers
    this._updateNotifyPopover()
  }

  /** 设置未读计数（后端 /notifications/counts 或 SSE counts 事件）。驱动红色角标 + 下拉项角标。 */
  setNotifyCounts (counts) {
    if (!counts || typeof counts !== 'object') return
    const task = Number(counts.task || 0)
    const message = Number(counts.message || 0)
    const log = Number(counts.log || 0)
    const total = Number(counts.total != null ? counts.total : task + message + log)
    this._notifyCounts = { task, message, log, total }
    const sb = this.shadowRoot?.querySelector('ui5-shellbar')
    if (sb) {
      // UI5 ShellBar 角标：count>0 显示红色数字，=0 时移除属性以隐藏。
      if (total > 0) sb.setAttribute('notifications-count', String(total))
      else sb.removeAttribute('notifications-count')
    }
    this._updateNotifyPopover()
  }

  _render () {
    const lang = getStoredPortalUi5Language()
    const copy = getPortalCopy(lang)
    const langFlag = portalLanguageInfo(lang)?.flag ?? '🇨🇳'
    const primaryTitle = escAttr(this.getAttribute('primary-title') || 'CMX Enterprise Portal')
    const secondaryTitle = escAttr(this.getAttribute('secondary-title') || '')
    const initIcon = this._themeButtonIcon()

    const themeMenuItems = PORTAL_THEMES.map(
      (t) =>
        `<ui5-menu-item text="${escAttr(t.label)}" icon="${_themeIcon(t.dark)}" data-value="${escAttr(t.value)}"></ui5-menu-item>`
    ).join('')
    const langMenuItems = PORTAL_LANGUAGES.map(
      (l) =>
        `<ui5-menu-item text="${escAttr(`${l.flag} ${l.label}`)}" data-value="${escAttr(l.value)}" data-flag="${escAttr(l.flag)}"></ui5-menu-item>`
    ).join('')

    // eslint-disable-next-line no-restricted-syntax -- 模板内所有动态片段都经 escAttr 转义
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        ${PORTAL_NEO_SHELLBAR_STYLES}
        ui5-shellbar {
          flex: 1;
          min-width: 0;
          background: transparent !important;
          box-shadow: none !important;
          /*
           * UI5 默认随断点增大左右留白（XL/XXL 约 3rem≈48px），与 Fiori 页面边距规范对齐。
           * 门户顶栏改为紧凑边距；刘海屏仍取 safe-area 与 0.5rem 的较大值。
           */
          padding-left: max(0.5rem, env(safe-area-inset-left, 0px)) !important;
          padding-right: max(0.5rem, env(safe-area-inset-right, 0px)) !important;
        }
        ui5-shellbar-search {
          --_ui5_shellbar_search_field_background: color-mix(in srgb, var(--neo-cyan) 8%, var(--sapShell_InteractiveBackground, #fff));
          --_ui5_shellbar_search_field_box_shadow:
            0 0 0 1px color-mix(in srgb, var(--neo-cyan) 22%, transparent),
            0 0 16px color-mix(in srgb, var(--neo-cyan) 10%, transparent),
            var(--sapField_Shadow, none);
        }
        ui5-shellbar-search:hover {
          --_ui5_shellbar_search_field_background: color-mix(in srgb, var(--neo-cyan) 12%, var(--sapShell_Hover_Background, #f5f5f5));
          --_ui5_shellbar_search_field_box_shadow:
            0 0 0 1px color-mix(in srgb, var(--neo-violet) 28%, transparent),
            0 0 20px color-mix(in srgb, var(--neo-cyan) 14%, transparent),
            var(--sapField_Hover_Shadow, none);
        }
        #lang-btn {
          --sapFontSize: 1.125rem;
        }
        .portal-profile-menu {
          display: flex;
          flex-direction: column;
          gap: 2px;
          padding: 4px;
          min-width: 10rem;
          box-sizing: border-box;
        }
        .portal-profile-menu ui5-button {
          width: 100%;
          justify-content: flex-start;
        }
        .portal-profile-menu-sep {
          height: 0;
          margin: 6px 0 4px 0;
          border: none;
          border-top: 1px solid var(--sapGroup_TitleBorderColor, #ddd);
          flex-shrink: 0;
        }
        .portal-domain-menu {
          display: flex;
          flex-direction: column;
          gap: 2px;
          padding: 4px;
          min-width: 12rem;
          box-sizing: border-box;
        }
        .portal-domain-menu-title {
          font-size: var(--sapFontSmallSize, 0.75rem);
          color: var(--sapContent_LabelColor, #6a6d70);
          padding: 4px 8px 6px;
          font-weight: 600;
          letter-spacing: 0.02em;
        }
        .portal-domain-item {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          min-height: 52px;
          padding: 8px 12px;
          border: none;
          border-radius: var(--sapElement_BorderCornerRadius, 4px);
          background: transparent;
          color: var(--sapTextColor, #32363a);
          font-size: var(--sapFontSize, 0.875rem);
          cursor: pointer;
          box-sizing: border-box;
          text-align: left;
        }
        .portal-domain-item:hover {
          background: var(--sapList_Hover_Background, rgba(0,0,0,0.04));
        }
        .portal-domain-item.active {
          background: color-mix(in srgb, var(--neo-cyan) 12%, var(--sapList_SelectionBackgroundColor, transparent));
          color: var(--neo-cyan);
        }
        .portal-domain-icon {
          width: 32px;
          height: 32px;
          flex-shrink: 0;
          color: inherit;
        }
        /* 通知中心下拉（与资源域下拉同风格） */
        .portal-notif-menu {
          display: flex;
          flex-direction: column;
          gap: 2px;
          padding: 4px;
          min-width: 13rem;
          box-sizing: border-box;
        }
        .portal-notif-menu-title {
          font-size: var(--sapFontSmallSize, 0.75rem);
          color: var(--sapContent_LabelColor, #6a6d70);
          padding: 4px 8px 6px;
          font-weight: 600;
          letter-spacing: 0.02em;
        }
        .portal-notif-item {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          min-height: 44px;
          padding: 8px 12px;
          border: none;
          border-radius: var(--sapElement_BorderCornerRadius, 4px);
          background: transparent;
          color: var(--sapTextColor, #32363a);
          font-size: var(--sapFontSize, 0.875rem);
          cursor: pointer;
          box-sizing: border-box;
          text-align: left;
        }
        .portal-notif-item:hover {
          background: var(--sapList_Hover_Background, rgba(0,0,0,0.04));
        }
        .portal-notif-icon {
          width: 22px;
          height: 22px;
          flex-shrink: 0;
          color: var(--neo-cyan);
        }
        .portal-notif-label {
          flex: 1 1 auto;
          min-width: 0;
        }
        .portal-notif-badge {
          flex-shrink: 0;
          min-width: 20px;
          height: 20px;
          padding: 0 6px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
          color: var(--sapContent_LabelColor, #6a6d70);
          background: var(--sapNeutralBackground, #eaecee);
        }
        .portal-notif-badge.has {
          color: #fff;
          background: var(--sapNegativeColor, #e90b0b);
        }
        .portal-about-dialog {
          --about-golden: 1.618;
          --about-w: min(760px, calc(100vw - 32px), calc((100vh - 40px) * var(--about-golden)));
          --_ui5_popup_footer_height: var(--_ui5_popup_default_header_height);
          width: var(--about-w);
          height: calc(var(--about-w) / var(--about-golden));
          max-width: calc(100vw - 24px);
          max-height: calc(100vh - 24px);
          box-sizing: border-box;
        }
        .portal-about-dialog::part(content) {
          padding: 0;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          flex: 1 1 auto;
          min-height: 0;
        }
        .portal-about-dialog::part(header) {
          cursor: move;
          min-height: var(--_ui5_popup_default_header_height, 2.75rem);
        }
        .portal-about-dialog::part(footer) {
          padding: 0 var(--_ui5_popup_header_footer_padding_s, 1rem);
          min-height: var(--_ui5_popup_default_header_height, 2.75rem);
          height: var(--_ui5_popup_default_header_height, 2.75rem);
          box-sizing: border-box;
          display: flex;
          align-items: center;
        }
        .portal-about-footer {
          display: flex;
          justify-content: flex-end;
          align-items: center;
          width: 100%;
          height: 100%;
          min-height: var(--_ui5_popup_default_header_height, 2.75rem);
          box-sizing: border-box;
        }
        .portal-about-footer ui5-button {
          --sapButton_Height: 1.625rem;
          --sapContent_FocusWidth: 1px;
        }
        .portal-about {
          box-sizing: border-box;
          color: var(--sapTextColor, #32363a);
          font-size: var(--sapFontSize, 0.875rem);
          display: flex;
          flex-direction: column;
          flex: 1 1 auto;
          min-height: 0;
          height: 100%;
          overflow: hidden;
        }
        .portal-about-banner {
          position: relative;
          flex-shrink: 0;
          padding: 18px 20px 14px;
          color: var(--sapTextColor, #32363a);
          background:
            linear-gradient(135deg,
              color-mix(in srgb, var(--neo-cyan, #00b4d8) 14%, var(--sapObjectHeader_Background, #fff)) 0%,
              color-mix(in srgb, var(--neo-cyan, #00b4d8) 8%, var(--sapGroup_ContentBackground, #f5f6f7)) 55%,
              var(--sapGroup_ContentBackground, #fafafa) 100%);
          border-bottom: 1px solid color-mix(in srgb, var(--neo-cyan, #00b4d8) 22%, var(--sapGroup_TitleBorderColor, #d9d9d9));
          overflow: hidden;
        }
        .portal-about-banner-bg {
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: 0.85;
          background:
            radial-gradient(ellipse 80% 60% at 0% 0%, color-mix(in srgb, var(--neo-cyan, #00b4d8) 18%, transparent), transparent 55%),
            radial-gradient(ellipse 70% 50% at 100% 100%, color-mix(in srgb, var(--neo-cyan, #00b4d8) 12%, transparent), transparent 50%),
            linear-gradient(color-mix(in srgb, var(--neo-cyan, #00b4d8) 8%, transparent) 1px, transparent 1px),
            linear-gradient(90deg, color-mix(in srgb, var(--neo-cyan, #00b4d8) 8%, transparent) 1px, transparent 1px);
          background-size: auto, auto, 26px 26px, 26px 26px;
        }
        :host-context([data-sap-ui-theme*="_dark"]) .portal-about-banner,
        :host-context([data-sap-ui-theme*="_hcb"]) .portal-about-banner {
          color: var(--sapList_TextColor, #fff);
          background: linear-gradient(135deg, color-mix(in srgb, var(--neo-cyan, #00b4d8) 5%, var(--sapBackgroundColor, #1c2228)) 0%, color-mix(in srgb, var(--neo-cyan, #00b4d8) 2%, var(--sapBackgroundColor, #1c2228)) 52%, color-mix(in srgb, var(--neo-cyan, #00b4d8) 1%, var(--sapBackgroundColor, #161b1f)) 100%);
          border-bottom-color: transparent;
        }
        :host-context([data-sap-ui-theme*="_dark"]) .portal-about-banner-bg,
        :host-context([data-sap-ui-theme*="_hcb"]) .portal-about-banner-bg {
          opacity: 1;
          background:
            radial-gradient(ellipse 80% 60% at 0% 0%, color-mix(in srgb, var(--neo-cyan, #00b4d8) 18%, transparent), transparent 55%),
            radial-gradient(ellipse 70% 50% at 100% 100%, color-mix(in srgb, var(--neo-cyan, #00b4d8) 12%, transparent), transparent 50%),
            linear-gradient(color-mix(in srgb, var(--neo-cyan, #00b4d8) 8%, transparent) 1px, transparent 1px),
            linear-gradient(90deg, color-mix(in srgb, var(--neo-cyan, #00b4d8) 8%, transparent) 1px, transparent 1px);
          background-size: auto, auto, 26px 26px, 26px 26px;
        }
        .portal-about-banner-top {
          position: relative;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }
        .portal-about-meta {
          display: flex;
          flex-direction: column;
          align-items: stretch;
          gap: 2px;
          flex-shrink: 0;
          width: min(176px, 40%);
          font-family: SF Mono, Cascadia Code, Consolas, monospace;
          font-size: 10px;
          line-height: 1.45;
          color: color-mix(in srgb, var(--sapTextColor, #32363a) 72%, transparent);
        }
        .portal-about-meta-k {
          color: color-mix(in srgb, var(--neo-cyan, #00b4d8) 78%, var(--sapTextColor, #32363a));
          letter-spacing: 0.5px;
          text-align: left;
          justify-self: start;
        }
        .portal-about-meta-v {
          color: var(--sapTextColor, #32363a);
          font-weight: 600;
          text-align: right;
          justify-self: end;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        :host-context([data-sap-ui-theme*="_dark"]) .portal-about-meta,
        :host-context([data-sap-ui-theme*="_hcb"]) .portal-about-meta {
          color: color-mix(in srgb, var(--sapList_TextColor, #ffffff) 72%, transparent);
        }
        :host-context([data-sap-ui-theme*="_dark"]) .portal-about-meta-k,
        :host-context([data-sap-ui-theme*="_hcb"]) .portal-about-meta-k {
          color: color-mix(in srgb, var(--neo-cyan, #00b4d8) 70%, transparent);
        }
        :host-context([data-sap-ui-theme*="_dark"]) .portal-about-meta-v,
        :host-context([data-sap-ui-theme*="_hcb"]) .portal-about-meta-v {
          color: color-mix(in srgb, var(--sapList_TextColor, #ffffff) 94%, transparent);
        }
        .portal-about-meta-row {
          display: grid;
          grid-template-columns: 2.4em minmax(0, 1fr);
          column-gap: 10px;
          align-items: baseline;
          width: 100%;
          white-space: nowrap;
        }
        .portal-about-brand {
          position: relative;
          display: flex;
          align-items: center;
          gap: 14px;
          min-width: 0;
        }
        .portal-about-logo {
          width: 44px;
          height: 44px;
          object-fit: contain;
          flex-shrink: 0;
        }
        .portal-about-wordmark {
          font-size: 18px;
          font-weight: 700;
          letter-spacing: 0.4px;
          line-height: 1.2;
        }
        .portal-about-wordmark-accent {
          -webkit-text-fill-color: transparent;
          background: linear-gradient(90deg, var(--neo-cyan, #00b4d8), var(--sapLinkColor, #1890ff) 60%, color-mix(in srgb, var(--sapLinkColor, #1890ff) 55%, var(--sapTextColor, #ffffff)));
          -webkit-background-clip: text;
          background-clip: text;
        }
        .portal-about-product {
          margin-top: 4px;
          font-size: 12px;
          letter-spacing: 1.2px;
          color: color-mix(in srgb, var(--sapTextColor, #32363a) 68%, transparent);
        }
        .portal-about-eyebrow {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 4px 10px;
          border-radius: 2px;
          border: 1px solid color-mix(in srgb, var(--neo-cyan, #00b4d8) 35%, var(--sapGroup_TitleBorderColor, #d9d9d9));
          background: color-mix(in srgb, var(--neo-cyan, #00b4d8) 10%, var(--sapList_Background, #fff));
          color: color-mix(in srgb, var(--neo-cyan, #00b4d8) 82%, var(--sapTextColor, #32363a));
          font-family: SF Mono, Cascadia Code, Consolas, monospace;
          font-size: 10px;
          letter-spacing: 2px;
        }
        .portal-about-banner-row {
          position: relative;
          margin-top: 12px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .portal-about-wdl {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          margin-left: auto;
          flex-shrink: 0;
          font-size: 10px;
          letter-spacing: 0.4px;
          color: color-mix(in srgb, var(--sapTextColor, #32363a) 78%, transparent);
          text-decoration: none;
        }
        .portal-about-wdl:hover {
          color: var(--sapTextColor, #32363a);
          text-decoration: underline;
        }
        .portal-about-wdl-mark {
          flex-shrink: 0;
          width: 12px;
          height: 12px;
          background-color: var(--sapContent_NonInteractiveTextColor, #5c6678);
          -webkit-mask: url('${escAttr(cmxLogoUrl)}') center / contain no-repeat;
          mask: url('${escAttr(cmxLogoUrl)}') center / contain no-repeat;
        }
        :host-context([data-sap-ui-theme*="_dark"]) .portal-about-wdl-mark,
        :host-context([data-sap-ui-theme*="_hcb"]) .portal-about-wdl-mark {
          background-color: var(--sapList_TextColor, #ffffff);
        }
        :host-context([data-sap-ui-theme*="_dark"]) .portal-about-wdl,
        :host-context([data-sap-ui-theme*="_hcb"]) .portal-about-wdl {
          color: color-mix(in srgb, var(--sapList_TextColor, #ffffff) 72%, transparent);
        }
        :host-context([data-sap-ui-theme*="_dark"]) .portal-about-wdl:hover,
        :host-context([data-sap-ui-theme*="_hcb"]) .portal-about-wdl:hover {
          color: color-mix(in srgb, var(--sapList_TextColor, #ffffff) 90%, transparent);
        }
        :host-context([data-sap-ui-theme*="_dark"]) .portal-about-product,
        :host-context([data-sap-ui-theme*="_hcb"]) .portal-about-product {
          color: color-mix(in srgb, var(--sapList_TextColor, #ffffff) 66%, transparent);
        }
        :host-context([data-sap-ui-theme*="_dark"]) .portal-about-eyebrow,
        :host-context([data-sap-ui-theme*="_hcb"]) .portal-about-eyebrow {
          border-color: color-mix(in srgb, var(--neo-cyan, #00b4d8) 20%, transparent);
          background: color-mix(in srgb, var(--neo-cyan, #00b4d8) 8%, transparent);
          color: color-mix(in srgb, var(--neo-cyan, #00b4d8) 90%, transparent);
        }
        .portal-about-eyebrow-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: var(--neo-cyan, #36cfc9);
          box-shadow: 0 0 8px color-mix(in srgb, var(--neo-cyan, #36cfc9) 60%, transparent);
        }
        .portal-about-body {
          flex: 1 1 auto;
          min-height: 0;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          padding: 12px 20px 8px;
          background:
            radial-gradient(ellipse 90% 60% at 100% 0%, color-mix(in srgb, var(--neo-cyan, #00b4d8) 8%, transparent), transparent 55%),
            var(--sapGroup_ContentBackground, #fafafa);
        }
        .portal-about-block-head {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 0 0 8px;
          flex-shrink: 0;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          color: var(--sapContent_LabelColor, #6a6d70);
        }
        .portal-about-block-head::before {
          content: '';
          width: 3px;
          height: 12px;
          border-radius: 1px;
          background: linear-gradient(180deg, var(--neo-cyan, #00b4d8), var(--neo-violet, var(--neo-violet, #7c3aed)));
        }
        .portal-about-stack-wrap {
          flex: 1 1 auto;
          min-height: 0;
          overflow-y: auto;
          padding: 8px 10px;
          border-radius: 6px;
          border: 1px solid color-mix(in srgb, var(--neo-cyan, #00b4d8) 18%, var(--sapGroup_TitleBorderColor, #d9d9d9));
          background: color-mix(in srgb, var(--neo-cyan, #00b4d8) 4%, var(--sapList_Background, #fff));
        }
        .portal-about-stack {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin: 0;
        }
        .portal-about-stack-row {
          display: grid;
          grid-template-columns: 20px minmax(6.5rem, 34%) minmax(0, 1fr);
          gap: 8px 10px;
          align-items: start;
        }
        .portal-about-stack-icons {
          display: inline-flex;
          align-items: center;
          gap: 2px;
          min-width: 0;
        }
        .portal-about-stack-icon {
          width: 14px;
          height: 14px;
          margin-top: 2px;
          object-fit: contain;
          flex-shrink: 0;
        }
        .portal-about-stack-name {
          margin: 0;
          font-size: 12px;
          font-weight: 600;
          color: var(--sapTextColor, #32363a);
          line-height: 1.35;
        }
        .portal-about-stack-desc {
          margin: 0;
          font-size: 11px;
          line-height: 1.45;
          color: var(--sapContent_LabelColor, #6a6d70);
        }
        .portal-about-foot {
          margin: 0;
          flex-shrink: 0;
          padding: 10px 20px 14px;
          font-size: 11px;
          line-height: 1.5;
          text-align: center;
          color: var(--sapContent_LabelColor, #6a6d70);
          border-top: 1px solid var(--sapGroup_TitleBorderColor, #e5e5e5);
          background: var(--sapGroup_ContentBackground, #fafafa);
        }
        #about-close-btn {
          /* UI5 Emphasized 用 background-color，渐变无效会导致亮色下按钮透明 */
          --sapButton_Emphasized_Background: #1890ff;
          --sapButton_Emphasized_Hover_Background: #40a9ff;
          --sapButton_Emphasized_Active_Background: #096dd9;
          --sapButton_Emphasized_TextColor: #ffffff;
          --sapButton_Emphasized_Hover_TextColor: #ffffff;
          --sapButton_Emphasized_Active_TextColor: #ffffff;
          --sapButton_Emphasized_BorderColor: #1890ff;
          --sapButton_Emphasized_Hover_BorderColor: #40a9ff;
          --sapButton_Emphasized_Active_BorderColor: #096dd9;
        }

        /* ── 自绘 tooltip（不依赖浏览器原生 title，保证 ShellBar 内所有按钮一致显示）── */
        .cmx-tip {
          position: fixed;
          z-index: 9999;
          max-width: 280px;
          padding: 4px 8px;
          border-radius: 4px;
          /* 品牌例外：提示浮层恒随深色壳层（不随主题），非遗漏 */
          background: #1f1f1f;
          color: #fff;
          font-size: 12px;
          line-height: 1.5;
          white-space: nowrap;
          pointer-events: none;
          opacity: 0;
          transform: translateY(-2px);
          transition: opacity 120ms ease, transform 120ms ease;
          box-shadow: 0 2px 8px rgba(0,0,0,.15);
          /* 默认隐藏，.show 控制显隐，避免初始闪烁 */
        }
        .cmx-tip.show { opacity: 1; transform: translateY(0); }
      </style>
      <div class="bar">
        <ui5-shellbar
          primary-title="${primaryTitle}"
          secondary-title="${secondaryTitle}"
          show-notifications
          show-product-switch>
          <ui5-button icon="menu" slot="startButton" tooltip="${escAttr(copy.menu)}" id="start-btn"></ui5-button>
          <img slot="logo" src="${escAttr(cmxLogoUrl)}" alt="CMX" style="height:32px;width:auto;" />
          <ui5-shellbar-item icon="sys-help" text="${escAttr(copy.help)}" id="help-item"></ui5-shellbar-item>
          <ui5-shellbar-item icon="home" text="欢迎页面" id="welcome-btn"></ui5-shellbar-item>
          <ui5-shellbar-item icon="tree" text="DAM注册中心" id="ws-node-btn"></ui5-shellbar-item>
          <ui5-shellbar-item icon="database" text="集群数据源" id="cluster-ds-btn"></ui5-shellbar-item>
          <ui5-shellbar-item icon="list" text="菜单管理" id="menu-mgr-btn"></ui5-shellbar-item>
          <ui5-shellbar-item id="theme-btn" icon="${initIcon}" text="${escAttr(copy.switchTheme)}"></ui5-shellbar-item>
          <ui5-shellbar-item id="lang-btn" icon="" text="${escAttr(copy.switchLanguage)} ${langFlag}"></ui5-shellbar-item>
          <ui5-shellbar-spacer slot="content"></ui5-shellbar-spacer>
          <ui5-shellbar-search slot="searchField" show-clear-icon placeholder="${escAttr(copy.searchPlaceholder)}"></ui5-shellbar-search>
          <ui5-toggle-button id="assistant-btn" icon="ai" tooltip="${escAttr(copy.assistant)}" slot="assistant"></ui5-toggle-button>
          <ui5-avatar
            slot="profile"
            id="profile-avatar"
            icon="person-placeholder"
            size="XS"
            interactive
            title="${escAttr(copy.profileTitle)}"
            accessible-name="${escAttr(copy.profileTitle)}"
          ></ui5-avatar>
        </ui5-shellbar>
      </div>
      <ui5-menu id="theme-menu">${themeMenuItems}</ui5-menu>
      <ui5-menu id="lang-menu">${langMenuItems}</ui5-menu>
      <ui5-popover id="domain-popover" placement="Bottom" horizontal-align="End">
        <div class="portal-domain-menu">
          <div class="portal-domain-menu-title">资源域切换</div>
          ${this._domainPopoverItems()}
        </div>
      </ui5-popover>
      <ui5-popover id="notif-popover" placement="Bottom" horizontal-align="End">
        <div class="portal-notif-menu">
          <div class="portal-notif-menu-title">通知中心</div>
          ${this._notifyPopoverItems()}
        </div>
      </ui5-popover>
      <ui5-popover id="profile-popover" placement="Bottom" horizontal-align="End">
        <div class="portal-profile-menu">
          <ui5-button id="profile-btn-account" design="Transparent" icon="account" tooltip="${escAttr(copy.profileAccount)}">${escAttr(copy.profileAccount)}</ui5-button>
          <ui5-button id="profile-btn-preferences" design="Transparent" icon="action-settings" tooltip="${escAttr(copy.profilePreferences)}">${escAttr(copy.profilePreferences)}</ui5-button>
          <hr class="portal-profile-menu-sep" role="separator" aria-orientation="horizontal" />
          <ui5-button id="profile-btn-about" design="Transparent" icon="information" tooltip="关于系统">关于系统</ui5-button>
          <ui5-button id="profile-btn-logout" design="Transparent" icon="log" tooltip="${escAttr(copy.profileLogout)}">${escAttr(copy.profileLogout)}</ui5-button>
        </div>
      </ui5-popover>
      <ui5-dialog id="about-dialog" class="portal-about-dialog" header-text="关于系统" draggable>
        <div class="portal-about">
          <div class="portal-about-banner">
            <div class="portal-about-banner-bg"></div>
            <div class="portal-about-banner-top">
              <div class="portal-about-brand">
                <img class="portal-about-logo" src="${escAttr(cmxLogoUrl)}" alt="CMX" />
                <div>
                  <div class="portal-about-wordmark">Cloud<span class="portal-about-wordmark-accent">Matrix</span></div>
                  <div class="portal-about-product">Enterprise Portal · 经典工作台</div>
                </div>
              </div>
              <div class="portal-about-meta">
                <cmx-desc-list label-width="2.4em" data-cmx-skin="none">
                  <cmx-desc-item label="版本">v${escAttr(PORTAL_APP_VERSION)}</cmx-desc-item>
                  <cmx-desc-item label="构建">${escAttr(PORTAL_BUILD_TIME || 'DEV')}</cmx-desc-item>
                  <cmx-desc-item label="内核">Rust</cmx-desc-item>
                </cmx-desc-list>
              </div>
            </div>
            <div class="portal-about-banner-row">
              <div class="portal-about-eyebrow"><span class="portal-about-eyebrow-dot"></span> CLASSIC MODE</div>
              <a class="portal-about-wdl" href="https://warpdrive.run" target="_blank" rel="noopener noreferrer">
                <span class="portal-about-wdl-mark" aria-hidden="true"></span>
                Warp Drive Labs
              </a>
            </div>
          </div>
          <div class="portal-about-body">
            <div class="portal-about-block-head">开源组件与系统</div>
            <div class="portal-about-stack-wrap">
              <div class="portal-about-stack">
                ${renderOpenSourceStackRows()}
              </div>
            </div>
          </div>
          <p class="portal-about-foot">感谢开源社区与贡献者为 CloudMatrix · CMX 提供稳定、开放、可持续的工程能力。</p>
        </div>
        <div slot="footer" class="portal-about-footer">
          <ui5-button id="about-close-btn" design="Emphasized">确定</ui5-button>
        </div>
      </ui5-dialog>
      <div class="cmx-tip" id="cmx-tip" role="tooltip" aria-hidden="true"></div>
    `
  }

  /** 仅刷新域下拉内容，不整体重渲染 */
  /** 切换语言后局部更新 ShellBar 文案，避免整页 _render 打断菜单交互 */
  _refreshShellbarCopy (langId) {
    const copy = getPortalCopy(langId)
    const sr = this.shadowRoot
    if (!sr) return
    // 自绘 tooltip 接管悬浮提示：只更新 data-cmx-tip，不再设 tooltip/title（避免原生 tooltip 重复）
    const setTip = (id, text) => {
      const el = this.shadowRoot.getElementById(id)
      if (!el) return
      el.setAttribute('data-cmx-tip', text)
    }
    setTip('start-btn', copy.menu)
    setTip('assistant-btn', copy.assistant)
    setTip('profile-btn-account', copy.profileAccount)
    setTip('profile-btn-preferences', copy.profilePreferences)
    setTip('profile-btn-logout', copy.profileLogout)
    const avatar = sr.getElementById('profile-avatar')
    if (avatar) {
      avatar.setAttribute('accessible-name', copy.profileTitle)
      avatar.setAttribute('data-cmx-tip', copy.profileTitle)
    }
    const helpItem = sr.getElementById('help-item')
    if (helpItem) {
      helpItem.setAttribute('text', copy.help)
      helpItem.setAttribute('data-cmx-tip', copy.help)
    }
    const themeBtn = sr.getElementById('theme-btn')
    if (themeBtn) {
      themeBtn.setAttribute('text', copy.switchTheme)
      themeBtn.setAttribute('data-cmx-tip', copy.switchTheme)
    }
    this._syncLangBtnFlag(langId)
    const search = sr.querySelector('ui5-shellbar-search')
    if (search) search.setAttribute('placeholder', copy.searchPlaceholder)
    const setBtnText = (id, text) => {
      const btn = sr.getElementById(id)
      if (btn) btn.textContent = text
    }
    setBtnText('profile-btn-account', copy.profileAccount)
    setBtnText('profile-btn-preferences', copy.profilePreferences)
    setBtnText('profile-btn-logout', copy.profileLogout)
  }

  /** @param {Event} e @param {HTMLElement|null} menuEl @param {{ value: string, label?: string }[]} [options] */
  _resolveMenuItemValue (e, menuEl, options = PORTAL_LANGUAGES) {
    const eventTarget = /** @type {HTMLElement|null} */ (e.target instanceof HTMLElement ? e.target : null)
    const currentTarget = /** @type {HTMLElement|null} */ (e.currentTarget instanceof HTMLElement ? e.currentTarget : null)
    const item = e.detail?.item ||
      eventTarget?.closest?.('ui5-menu-item') ||
      (currentTarget?.matches?.('ui5-menu-item') ? currentTarget : null)
    if (item && typeof item === 'object') {
      const el = /** @type {HTMLElement} */ (item)
      const fromAttr = el.getAttribute?.('data-value') || el.dataset?.value
      if (fromAttr) return fromAttr
    }
    if (menuEl && item) {
      const items = menuEl.querySelectorAll('ui5-menu-item')
      const idx = Array.from(items).indexOf(/** @type {Element} */ (item))
      if (idx >= 0 && options[idx]) return options[idx].value
    }
    const text = String(e.detail?.text ?? '')
    const byLabel = options.find(l => l.label && text.includes(l.label))
    return byLabel?.value ?? ''
  }

  _updateDomainPopover () {
    const sr = this.shadowRoot
    const pop = sr?.getElementById('domain-popover')
    if (!pop) return
    const menu = pop.querySelector('.portal-domain-menu')
    if (!menu) return
    // eslint-disable-next-line no-restricted-syntax -- 已转义
    menu.innerHTML = `
      <div class="portal-domain-menu-title">资源域切换</div>
      ${this._domainPopoverItems()}
    `
    this._wireDomainPopoverItems()
  }

  _updateNotifyPopover () {
    const sr = this.shadowRoot
    const pop = sr?.getElementById('notif-popover')
    if (!pop) return
    const menu = pop.querySelector('.portal-notif-menu')
    if (!menu) return
    // eslint-disable-next-line no-restricted-syntax -- 已转义
    menu.innerHTML = `
      <div class="portal-notif-menu-title">通知中心</div>
      ${this._notifyPopoverItems()}
    `
    this._wireNotifyPopoverItems()
  }

  _wireNotifyPopoverItems () {
    const sr = this.shadowRoot
    const pop = sr?.getElementById('notif-popover')
    if (!pop) return
    pop.querySelectorAll('[data-notif-center]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const center = btn.getAttribute('data-notif-center')
        pop.open = false
        // 交给 portal-app 打开对应中心（任务/消息/日志）。
        this.dispatchEvent(new CustomEvent('shellbar-notif-center-click', {
          detail: { center }, bubbles: true, composed: true,
        }))
      })
    })
  }

  _wireEvents () {
    const sr = this.shadowRoot
    const shellbar = sr.querySelector('ui5-shellbar')
    const themeBtn = sr.getElementById('theme-btn')
    const themeMenu = sr.getElementById('theme-menu')
    const langBtn = sr.getElementById('lang-btn')
    const langMenu = sr.getElementById('lang-menu')
    const startBtn = sr.getElementById('start-btn')
    const assistantBtn = sr.getElementById('assistant-btn')

    shellbar.addEventListener('notifications-click', (e) => {
      // 点铃铛 → 打开通知中心下拉（任务/消息/日志），锚定到铃铛按钮。
      const pop = sr.getElementById('notif-popover')
      if (!pop) return
      pop.opener = e.detail?.targetRef || shellbar
      pop.open = !pop.open
    })
    shellbar.addEventListener('profile-click', (e) => {
      e.stopPropagation()
      this._toggleProfilePopover()
    })
    shellbar.addEventListener('product-switch-click', (e) => {
      const pop = sr.getElementById('domain-popover')
      if (!pop || !this._domains.length) return
      /* targetRef 是 UI5 ShellBar 产品切换按钮的 DOM 引用，用作 popover 锚点 */
      pop.opener = e.detail?.targetRef || shellbar
      pop.open = !pop.open
    })

    /* 渲染完成后，为 ShellBar 内所有按钮统一挂载自绘 tooltip（data-cmx-tip 存文案）。
       不依赖浏览器原生 title：原生 title tooltip 在 UI5 ShellBar 的部分 slot 投射位置不稳定，
       自绘方案保证所有按钮行为一致（hover / focus 延迟显示，离开立即隐藏）。 */
    requestAnimationFrame(() => {
      this._wireTooltips(shellbar)
    })

    if (assistantBtn) {
      assistantBtn.addEventListener('click', () => {
        this.dispatchEvent(new CustomEvent('shellbar-assistant-click', { bubbles: true, composed: true }))
      })
    }

    this._wireProfileMenu()
    this._wireDomainPopoverItems()
    this._wireNotifyPopoverItems()

    /** 语言按钮用 ui5-shellbar-item，条内只显示国旗 emoji（无地球图标） */
    this._syncLangBtnFlag()

    /**
     * ui5-shellbar-item 已改为在条目上触发 `click`（见 @ui5/webcomponents-fiori CHANGELOG），
     * 不再依赖 ui5-shellbar 的 `item-click` + detail.item.id。
     */
    const wireShellbarItem = (itemId, kind) => {
      const el = sr.getElementById(itemId)
      if (!el) return
      el.addEventListener('click', () => {
        if (kind === 'help') {
          this.dispatchEvent(new CustomEvent('shellbar-help-click', { bubbles: true, composed: true }))
          return
        }
        if (kind === 'welcome') {
          this.dispatchEvent(new CustomEvent('shellbar-welcome-click', { bubbles: true, composed: true }))
        }
        if (kind === 'ws-node') {
          this.dispatchEvent(new CustomEvent('shellbar-dam-registry-click', { bubbles: true, composed: true }))
        }
        if (kind === 'cluster-ds') {
          this.dispatchEvent(new CustomEvent('shellbar-cluster-datasource-click', { bubbles: true, composed: true }))
        }
        if (kind === 'menu-mgr') {
          this.dispatchEvent(new CustomEvent('shellbar-menu-manager-click', { bubbles: true, composed: true }))
        }
      })
    }
    wireShellbarItem('help-item', 'help')
    wireShellbarItem('welcome-btn', 'welcome')
    wireShellbarItem('ws-node-btn', 'ws-node')
    wireShellbarItem('cluster-ds-btn', 'cluster-ds')
    wireShellbarItem('menu-mgr-btn', 'menu-mgr')

    if (startBtn) {
      startBtn.addEventListener('click', () => {
        this.dispatchEvent(new CustomEvent('shellbar-start-click', { bubbles: true, composed: true }))
      })
    }

    if (themeBtn && themeMenu) {
      themeBtn.addEventListener('click', () => {
        themeMenu.opener = themeBtn
        themeMenu.open = true
      })
      let lastThemeEvent = null
      const onThemeMenuItemClick = async (e) => {
        if (e === lastThemeEvent) return
        lastThemeEvent = e
        const value = this._resolveMenuItemValue(e, themeMenu, PORTAL_THEMES)
        if (!value) return
        await applyPortalUi5Theme(value)
        const info = portalThemeInfo(value)
        if (info) themeBtn.setAttribute('icon', _themeIcon(info.dark))
      }
      themeMenu.addEventListener('ui5-item-click', onThemeMenuItemClick)
      themeMenu.addEventListener('item-click', onThemeMenuItemClick)
      themeMenu.addEventListener('click', onThemeMenuItemClick)
      themeMenu.querySelectorAll('ui5-menu-item').forEach((item) => {
        item.addEventListener('click', onThemeMenuItemClick)
      })
    }

    if (langBtn && langMenu) {
      langBtn.addEventListener('click', () => {
        langMenu.opener = langBtn
        langMenu.open = true
      })
      let lastLangEvent = null
      const onLangMenuItemClick = async (e) => {
        if (e === lastLangEvent) return
        lastLangEvent = e
        const value = this._resolveMenuItemValue(e, langMenu)
        if (!value) return
        try {
          const ok = await applyPortalUi5Language(value)
          if (ok) this._refreshShellbarCopy(value)
        } catch (err) {
          console.error('[portal-shellbar] language switch failed:', err)
        }
      }
      langMenu.addEventListener('ui5-item-click', onLangMenuItemClick)
      langMenu.addEventListener('item-click', onLangMenuItemClick)
      langMenu.addEventListener('click', onLangMenuItemClick)
      langMenu.querySelectorAll('ui5-menu-item').forEach((item) => {
        item.addEventListener('click', onLangMenuItemClick)
      })
    }
  }

  /**
   * 为 ShellBar 内各按钮挂载自绘 tooltip。
   * @param {HTMLElement} shellbar ui5-shellbar 元素
   *
   * 实现要点：
   * - 用 data-cmx-tip 属性存文案，hover/focus 时读取并定位到 .cmx-tip 容器
   * - 延迟 500ms 显示（贴近原生 title 体验），离开/focusout 立即隐藏
   * - ShellBar 内置按钮（产品切换/通知）在它自己的 shadowRoot 里，需跨 shadow 边界查找
   */
  _wireTooltips (shellbar) {
    const sr = this.shadowRoot
    if (!sr) return
    const tipEl = sr.getElementById('cmx-tip')
    if (!tipEl) return

    /** @type {number|null} */
    let showTimer = null
    const DELAY = 500

    const positionTip = (host) => {
      const r = host.getBoundingClientRect()
      // 先让 tooltip 可见以便测量宽度（已含 padding/border）
      const tipRect = tipEl.getBoundingClientRect()
      const tipW = tipRect.width
      const GAP = 6
      const vw = window.innerWidth
      // 默认居中对齐到按钮中心，再修正左右边界溢出
      let left = r.left + r.width / 2 - tipW / 2
      const minLeft = 4
      const maxLeft = vw - tipW - 4
      if (left < minLeft) left = minLeft
      else if (left > maxLeft) left = maxLeft
      tipEl.style.left = Math.round(left) + 'px'
      tipEl.style.top = Math.round(r.top + r.height + GAP) + 'px'
    }

    const showTip = (host) => {
      const text = host.getAttribute('data-cmx-tip')
      if (!text) return
      clearTimeout(showTimer)
      showTimer = setTimeout(() => {
        tipEl.textContent = text
        positionTip(host)
        tipEl.classList.add('show')
        tipEl.setAttribute('aria-hidden', 'false')
      }, DELAY)
    }

    const hideTip = () => {
      clearTimeout(showTimer)
      tipEl.classList.remove('show')
      tipEl.setAttribute('aria-hidden', 'true')
    }

    /**
     * 为单个元素绑定自绘 tooltip 文案与事件，并清除原生 tooltip 来源（避免重复悬浮）。
     * @param {Element} host 挂载目标
     * @param {string} text 提示文案
     */
    const attach = (host, text) => {
      if (!host || !text) return
      host.setAttribute('data-cmx-tip', text)
      // 清除原生 tooltip：UI5 组件用 tooltip= 属性（映射到内部 button.title），
      // light DOM 元素用 title= 属性。自绘 tooltip 接管后这两种都要去掉，否则会重复。
      host.removeAttribute('tooltip')
      host.removeAttribute('title')
      host.addEventListener('mouseenter', () => showTip(host))
      host.addEventListener('mouseleave', hideTip)
      host.addEventListener('focus', () => showTip(host))
      host.addEventListener('blur', hideTip)
    }

    // 1) light DOM 内可直接拿到的按钮（slot 投射 + popover 内的 ui5-button）
    const copy = getPortalCopy(getStoredPortalUi5Language())
    attach(sr.getElementById('start-btn'), copy.menu)
    attach(sr.getElementById('assistant-btn'), copy.assistant)
    attach(sr.getElementById('profile-btn-account'), copy.profileAccount)
    attach(sr.getElementById('profile-btn-preferences'), copy.profilePreferences)
    attach(sr.getElementById('profile-btn-about'), '关于系统')
    attach(sr.getElementById('profile-btn-logout'), copy.profileLogout)
    const avatarHost = sr.getElementById('profile-avatar')
    attach(avatarHost, copy.profileTitle)

    // 2) ui5-shellbar-item 的 text 属性即提示文案
    sr.querySelectorAll('ui5-shellbar-item').forEach((item) => {
      attach(item, item.getAttribute('text') || '')
    })

    // 3) ShellBar 内置按钮（产品切换 / 通知铃铛 / profile 包裹层）在其 shadowRoot 内
    const psBtn = shellbar.productSwitchDomRef
    if (psBtn) attach(psBtn, '资源域切换')
    try {
      const sbSr = shellbar.shadowRoot
      if (sbSr) {
        const notifBtn = sbSr.querySelector('[ui5-button][icon="bell"]')
        if (notifBtn) attach(notifBtn, '通知中心')
        // ShellBar 给 profile slot 套了自己的 <ui5-button class="ui5-shellbar-image-button">，
        // 它的 tooltip="用户菜单" 来自 UI5 i18n（actionsAccessibilityInfo.profile.title），
        // 会显示成原生白色 tooltip，与自绘 tooltip 重复 —— 同样用 attach 接管。
        const profileWrapper = sbSr.querySelector('slot[name=profile]')?.parentElement
        if (profileWrapper && profileWrapper !== avatarHost) attach(profileWrapper, copy.profileTitle)
      }
    } catch { /* shadowRoot 结构因 UI5 版本而异，查不到则跳过 */ }

    // 暴露给语言切换后局部更新文案（避免整体 _render 清掉已绑定的事件）
    this._tip = { tipEl, attach }
  }

  _wireDomainPopoverItems () {
    const sr = this.shadowRoot
    const pop = sr?.getElementById('domain-popover')
    if (!pop) return
    pop.querySelectorAll('.portal-domain-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = /** @type {HTMLElement} */ (btn).dataset.domainId
        if (!id) return
        pop.open = false
        if (id === this._activeDomainId) return
        this._activeDomainId = id
        this._updateDomainPopover()
        const domain = this._domains.find(d => d.id === id)
        // 持久化当前域 id + 清空 activity（切域时新域的应用由 list[0] 决定）
        if (domain) saveActiveDam({ domain: domain.id, application: '' })
        if (domain) {
          this.dispatchEvent(new CustomEvent('domain-change', {
            bubbles: true,
            composed: true,
            detail: { id: domain.id, label: domain.label, application: domain.application },
          }))
        }
      })
    })
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

  _wireProfileMenu () {
    const sr = this.shadowRoot
    const fire = (name) => {
      this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true }))
    }
    const wireBtn = (id, eventName) => {
      const btn = sr.getElementById(id)
      if (!btn) return
      btn.addEventListener('click', () => {
        this._closeProfilePopover()
        fire(eventName)
      })
    }
    wireBtn('profile-btn-account', 'shellbar-profile-account')
    wireBtn('profile-btn-preferences', 'shellbar-profile-settings')
    const aboutBtn = sr.getElementById('profile-btn-about')
    const aboutDialog = sr.getElementById('about-dialog')
    const aboutCloseBtn = sr.getElementById('about-close-btn')
    if (aboutBtn && aboutDialog) {
      aboutBtn.addEventListener('click', () => {
        this._closeProfilePopover()
        openDialogCentered(aboutDialog)
      })
    }
    if (aboutCloseBtn && aboutDialog) {
      aboutCloseBtn.addEventListener('click', () => {
        aboutDialog.open = false
      })
    }
    wireBtn('profile-btn-logout', 'shellbar-profile-logout')
  }

  /** @param {string} [langId] */
  _syncLangBtnFlag (langId) {
    const lang = langId ?? getStoredPortalUi5Language()
    const copy = getPortalCopy(lang)
    const flag = portalLanguageInfo(lang)?.flag ?? '🇨🇳'
    const item = this.shadowRoot?.getElementById('lang-btn')
    if (!item) return
    item.setAttribute('icon', '')
    item.setAttribute('text', `${copy.switchLanguage} ${flag}`)
    const paint = () => {
      const btn = item.shadowRoot?.querySelector('ui5-button')
      if (!btn) return false
      btn.removeAttribute('icon')
      btn.textContent = flag
      btn.style.fontSize = '1.125rem'
      btn.style.minWidth = '2.25rem'
      btn.style.justifyContent = 'center'
      return true
    }
    if (!paint()) requestAnimationFrame(() => { paint() })
  }
}

customElements.define('portal-shellbar', PortalShellbar)
