/**
 * 调试页入口 — 暗色 Shell + ShellBar，加载 UI5 后在主区注入导出 HTML 的 body 并执行内联脚本。
 *
 * 导出文档已在 body 内含 `<cmx-html-pages-…>` 与脚本：脚本注册 Web Component（Shadow DOM），
 * 画布内容在 <template id="cmx-page-template-<页slug>"> 中，与 pageId 绑定，多页同文档不冲突。
 *
 * 内容挂在 `portal-content-area` 的 Shadow 内时，`document` 无法 query 到模板；须在执行页内脚本前设置
 * `globalThis.__cmxTemplateRoot` 为含 `<template>` 与页面宿主的容器（与 wrapHtmlDocument / page-data 脚本约定一致）。
 */
import { ensureCmxUi5Runtime } from 'cmx-ui5-runtime/client';
import { library } from './lib/index.js';
import {
  formatDebugRunTabLabel,
  parseDesignerRunBatchSession,
  parseDesignerRunSession,
  slugForCmxHtmlPagesTag,
} from './utils/html-utils.js';
import {
  createWorkspace,
  disposeWorkspace,
  registerView,
  unregisterView,
} from './debug-portal/mainapp.js';
import cmxLogoUrl from '../assets/cmx.png?url';
import './debug-portal/debug-portal-body.js';
import { escAttr } from './utils/esc.js';

const _ver = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '';
const _built = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : '';


const DEBUG_HOST_STYLES = `
  /* 与门户 app-shell / index 关键样式一致；勿对 cmx-debug-portal-body 使用 display:block，否则会覆盖 shadow :host{display:grid} */
  :root,
  html {
    height: 100%;
    height: -webkit-fill-available;
  }
  html, body {
    margin: 0;
    padding: 0;
    width: 100%;
    height: 100%;
    height: -webkit-fill-available;
    box-sizing: border-box;
    overflow: hidden;
  }
  *, *::before, *::after { box-sizing: inherit; }
  body {
    display: flex;
    flex-direction: column;
    background: var(--sapShell_Background, #1c2228);
    color: var(--sapTextColor, #f5f6f8);
  }
  .debug-host {
    display: flex;
    flex-direction: column;
    flex: 1 1 0%;
    min-height: 0;
    width: 100%;
    overflow: hidden;
  }
  .debug-host__bar {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    background: var(--sapShellColor, #1b2a3b);
  }
  .debug-host__bar ui5-shellbar {
    flex: 1;
    min-width: 0;
    padding-left: max(0.5rem, env(safe-area-inset-left, 0px)) !important;
    padding-right: max(0.5rem, env(safe-area-inset-right, 0px)) !important;
  }
  cmx-debug-portal-body,
  cmx-debug-portal-body.debug-host__workspace {
    display: grid;
    flex: 1 1 0%;
    min-height: 0;
    width: 100%;
    overflow: hidden;
  }
`;

function injectDebugHostStyles () {
  const el = document.createElement('style');
  el.setAttribute('data-debug-host', '');
  el.textContent = DEBUG_HOST_STYLES;
  document.head.appendChild(el);
}

/** 先于主题：与 debug.html 关键样式一起锁死高度链，避免 UI5 全局样式抢先破坏 flex/grid */
injectDebugHostStyles();

function secondaryTitle () {
  if (_ver) return `v${_ver}${_built ? ' · ' + _built : ''}`;
  return _built || 'local';
}

function buildDebugChrome () {
  document.body.replaceChildren();

  const host = document.createElement('div');
  host.className = 'debug-host';

  const bar = document.createElement('div');
  bar.className = 'debug-host__bar';
  bar.innerHTML = `
    <ui5-shellbar
      primary-title="${escAttr('Web Component HTML 可视化调试器')}"
      secondary-title="${escAttr(secondaryTitle())}"
      show-notifications
      show-product-switch
      notifications-count="0">
      <ui5-button icon="menu2" slot="startButton" tooltip="菜单" id="debug-start-btn"></ui5-button>
      <img slot="logo" src="${escAttr(cmxLogoUrl)}" alt="CMX" style="height:32px;width:auto;" />
      <ui5-shellbar-item icon="sys-help" text="帮助" id="debug-help-item"></ui5-shellbar-item>
      <ui5-shellbar-item icon="action-settings" text="设置" id="debug-settings-item"></ui5-shellbar-item>
      <ui5-shellbar-spacer slot="content"></ui5-shellbar-spacer>
      <ui5-shellbar-search slot="searchField" show-clear-icon placeholder="搜索应用、产品"></ui5-shellbar-search>
      <ui5-toggle-button icon="ai" tooltip="助手" slot="assistant"></ui5-toggle-button>
      <ui5-avatar
        slot="profile"
        id="debug-profile-avatar"
        icon="person-placeholder"
        size="XS"
        interactive
        title="用户与账号"
        accessible-name="用户与账号"
      ></ui5-avatar>
    </ui5-shellbar>
  `;

  const workspace = document.createElement('cmx-debug-portal-body');
  workspace.className = 'debug-host__workspace';

  host.appendChild(bar);
  host.appendChild(workspace);
  document.body.appendChild(host);

  return workspace;
}

/**
 * 切换 Content 标签时把模板根切到对应 pane，便于多页调试。
 * @param {Element} ca portal-content-area
 */
function wireDebugContentTabTemplateRoot (ca) {
  const sync = () => {
    const id = typeof ca.getActiveTabId === 'function' ? ca.getActiveTabId() : null;
    if (!id || id === 'debug-empty') return;
    const pane = ca.shadowRoot?.querySelector(`.tab-pane[data-id="${id}"]`);
    if (pane) globalThis.__cmxTemplateRoot = pane;
  };
  sync();
  ca.addEventListener('portal-content-tab-activate', sync);
}

/**
 * 调试 tab 关闭时回收对应 workspace。
 * @param {Element} ca
 * @param {Set<string>} liveTabIds
 */
function wireDebugWorkspaceDispose (ca, liveTabIds) {
  ca.addEventListener('portal-content-tab-activate', () => {
    const tabs = /** @type {{ id: string }[] | undefined} */ (ca._tabs);
    if (!Array.isArray(tabs)) return;
    const present = new Set(tabs.map(t => String(t.id)));
    for (const tabId of Array.from(liveTabIds)) {
      if (!present.has(tabId)) {
        liveTabIds.delete(tabId);
        disposeWorkspace('tab:' + tabId);
      }
    }
  });
}

/**
 * @param {HTMLElement} pane
 * @param {string[]} scripts
 * @param {import('./debug-portal/mainapp.js').Workspace} scope
 */
function runPageScriptsInWorkspace (pane, scripts, scope) {
  const prevWs = /** @type {any} */ (globalThis).workspace;
  const prevRoot = globalThis.__cmxTemplateRoot;
  /** @type {any} */ (globalThis).workspace = scope;
  globalThis.__cmxTemplateRoot = pane;
  try {
    for (const text of scripts) {
      const el = document.createElement('script');
      el.textContent = text;
      pane.appendChild(el);
    }
  } finally {
    /** @type {any} */ (globalThis).workspace = prevWs;
    globalThis.__cmxTemplateRoot = prevRoot;
  }
}

/**
 * 与 Portal 的 html_pages 运行槽保持一致：自定义元素默认 inline，
 * 在 flex 容器中会影响页面组件的宽高计算。
 * @param {HTMLElement} host
 */
function applyHtmlPageHostLayout (host) {
  host.style.display = 'block';
  host.style.width = '100%';
  host.style.minWidth = '0';
  host.style.boxSizing = 'border-box';
  host.style.flex = '1 1 auto';
  host.style.minHeight = '0';
  host.style.alignSelf = 'stretch';
}

/**
 * @param {HTMLElement} pane
 * @param {string} scopeId
 * @param {string} pageId
 */
function registerPageHostInPane (pane, scopeId, pageId) {
  const host = /** @type {HTMLElement | null} */ (pane.querySelector('[data-cmx-html-page-host]'));
  if (!host) return;
  applyHtmlPageHostLayout(host);
  registerView(scopeId, pageId, 'content', pageId, host);
  const prevDispose = /** @type {any} */ (host).__cmxDispose;
  /** @type {any} */ (host).__cmxDispose = function () {
    try {
      if (typeof prevDispose === 'function') prevDispose.call(host);
    } finally {
      unregisterView(scopeId, pageId, host);
    }
  };
}

const EMPTY_TAB_HTML =
  '<p style="margin:16px;color:var(--sapNeutralTextColor,#aaa);font:0.875rem/1.5 system-ui,sans-serif">没有可调试的页面，请返回设计器点击「调试」按钮</p>';

void (async () => {
  await ensureCmxUi5Runtime();
  library.applyTheme('sap_horizon_dark');

  const batchRaw = sessionStorage.getItem('__designer_run_batch__');
  const batchPayload = parseDesignerRunBatchSession(batchRaw);
  const raw = sessionStorage.getItem('__designer_run__');
  const payload = parseDesignerRunSession(raw);

  const debugWorkspace = buildDebugChrome();
  await customElements.whenDefined('cmx-debug-portal-body');
  const ca = debugWorkspace.shadowRoot?.getElementById('content-area');
  if (!ca || typeof ca.addTab !== 'function') return;

  const parser = new DOMParser();

  if (batchPayload?.pages?.length) {
    /** @type {{ tabId: string, pageId: string, text: string, content: string, scripts: string[], bodyClass: string }[]} */
    const mounts = [];
    for (const entry of batchPayload.pages) {
      const doc = parser.parseFromString(entry.html, 'text/html');
      const tabLabel = formatDebugRunTabLabel(doc.title, entry.pageId);
      const bodyClone = doc.body.cloneNode(true);
      const scriptEls = Array.from(bodyClone.querySelectorAll('script')).filter(
        s => !s.type || s.type === 'text/javascript',
      );
      const scripts = scriptEls.map(s => s.textContent || '');
      scriptEls.forEach(s => s.remove());
      const tabId = `debug-page-${slugForCmxHtmlPagesTag(entry.pageId)}`;
      const bodyClass = (doc.body.getAttribute('class') || '').trim();
      mounts.push({
        tabId,
        pageId: entry.pageId,
        text: tabLabel,
        content: bodyClone.innerHTML,
        scripts,
        bodyClass,
      });
    }
    document.title = mounts[0]?.text ?? document.title;
    /** @type {Set<string>} */
    const liveTabIds = new Set();
    for (const m of mounts) {
      ca.addTab({
        id: m.tabId,
        text: m.text,
        icon: 'show-edit',
        content: m.content,
        closeable: true,
      });
      liveTabIds.add(m.tabId);
    }
    const firstTabId = mounts[0]?.tabId;
    if (firstTabId) ca.selectTabById(firstTabId);
    for (const m of mounts) {
      const slug = m.tabId.replace(/^debug-page-/, '');
      const pane = ca.shadowRoot?.querySelector(`.tab-pane[data-id="${m.tabId}"]`);
      if (pane) {
        pane.id = `debug-mount-${slug}`;
        if (m.bodyClass) pane.className = `${pane.className} ${m.bodyClass}`.trim();
      }
    }
    wireDebugContentTabTemplateRoot(ca);
    wireDebugWorkspaceDispose(ca, liveTabIds);
    // 非激活标签的 .tab-pane 为 display:none；在隐藏容器内执行页内脚本时，UI5 / 自定义元素往往无法正确绑定事件。
    // 因此每页脚本执行前先激活对应标签并强制一次布局，再恢复默认选中的第一个标签。
    for (const m of mounts) {
      ca.selectTabById(m.tabId);
      const pane = /** @type {HTMLElement | null} */ (ca.shadowRoot?.querySelector(`.tab-pane[data-id="${m.tabId}"]`));
      if (!pane) continue;
      void pane.offsetHeight;
      const scopeId = 'tab:' + m.tabId;
      const scope = createWorkspace(scopeId, { label: m.text });
      runPageScriptsInWorkspace(pane, m.scripts, scope);
      registerPageHostInPane(pane, scopeId, m.pageId);
    }
    if (firstTabId) {
      ca.selectTabById(firstTabId);
      const pane0 = ca.shadowRoot?.querySelector(`.tab-pane[data-id="${firstTabId}"]`);
      if (pane0) globalThis.__cmxTemplateRoot = pane0;
    }
    return;
  }

  if (!payload) {
    ca.addTab({
      id: 'debug-empty',
      text: '提示',
      icon: 'information',
      content: EMPTY_TAB_HTML,
      closeable: false,
    });
    return;
  }

  const doc = parser.parseFromString(payload.html, 'text/html');

  const tabLabel = formatDebugRunTabLabel(doc.title, payload.pageId);
  document.title = tabLabel;

  const bodyClone = doc.body.cloneNode(true);
  const scriptEls = Array.from(bodyClone.querySelectorAll('script')).filter(
    s => !s.type || s.type === 'text/javascript',
  );
  scriptEls.forEach(s => s.remove());

  const tabId = `debug-page-${slugForCmxHtmlPagesTag(payload.pageId)}`;
  ca.addTab({
    id: tabId,
    text: tabLabel,
    icon: 'show-edit',
    content: bodyClone.innerHTML,
    closeable: false,
  });
  ca.selectTabById(tabId);

  const pane = /** @type {HTMLElement | null} */ (ca.shadowRoot?.querySelector(`.tab-pane[data-id="${tabId}"]`));
  if (pane) {
    pane.id = 'debug-mount';
    const cls = (doc.body.getAttribute('class') || '').trim();
    if (cls) pane.className = `${pane.className} ${cls}`.trim();
    /** @see html-utils.js wrapHtmlDocument 注释 — 模板在 Shadow 内时不能用 document 查找 */
    globalThis.__cmxTemplateRoot = pane;
  }

  wireDebugContentTabTemplateRoot(ca);

  if (pane) {
    const scopeId = 'tab:' + tabId;
    const scope = createWorkspace(scopeId, { label: tabLabel });
    const scripts = scriptEls.map(s => s.textContent || '');
    runPageScriptsInWorkspace(pane, scripts, scope);
    registerPageHostInPane(pane, scopeId, payload.pageId);
  }
})();
