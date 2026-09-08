/**
 * HTML 工具函数
 */
import { library } from '../lib/index.js';
import { debugModeRuntimeLiteral } from './user-code-debug.js';

// 内联主题 CSS 变量，使导出页面无需 CDN 即可获得完整样式
import sapHorizonDark    from '@ui5/webcomponents-theming/dist/generated/assets/themes/sap_horizon_dark/parameters-bundle.css.json';
import sapHorizon        from '@ui5/webcomponents-theming/dist/generated/assets/themes/sap_horizon/parameters-bundle.css.json';
import sapHorizonHcb     from '@ui5/webcomponents-theming/dist/generated/assets/themes/sap_horizon_hcb/parameters-bundle.css.json';
import sapHorizonHcw     from '@ui5/webcomponents-theming/dist/generated/assets/themes/sap_horizon_hcw/parameters-bundle.css.json';
import sapFiori3         from '@ui5/webcomponents-theming/dist/generated/assets/themes/sap_fiori_3/parameters-bundle.css.json';
import sapFiori3Dark     from '@ui5/webcomponents-theming/dist/generated/assets/themes/sap_fiori_3_dark/parameters-bundle.css.json';

const THEME_CSS_MAP = {
  sap_horizon_dark: sapHorizonDark,
  sap_horizon:      sapHorizon,
  sap_horizon_hcb:  sapHorizonHcb,
  sap_horizon_hcw:  sapHorizonHcw,
  sap_fiori_3:      sapFiori3,
  sap_fiori_3_dark: sapFiori3Dark,
};

/** 格式化输出 HTML（带缩进） */
export function prettyFormatHtml(raw) {
  const container = document.createElement('div');
  container.innerHTML = raw;

  const walk = (node, depth = 0) => {
    const pad = '  '.repeat(depth);
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent.trim();
      return text ? `${pad}${text}\n` : '';
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const tag = node.tagName.toLowerCase();
    const attrs = Array.from(node.attributes)
      .map((a) => `${a.name}="${a.value}"`)
      .join(' ');
    const open = attrs ? `<${tag} ${attrs}>` : `<${tag}>`;

    const voidTags = ['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'];
    if (voidTags.includes(tag)) return `${pad}${open}\n`;

    if (!node.childNodes.length) return `${pad}${open}</${tag}>\n`;

    let inner = '';
    node.childNodes.forEach((child) => { inner += walk(child, depth + 1); });
    return `${pad}${open}\n${inner}${pad}</${tag}>\n`;
  };

  let out = '';
  container.childNodes.forEach((node) => { out += walk(node, 0); });
  return out.trim() || '<!-- 设计区为空 -->';
}

/** 将设计区内容序列化为干净 HTML（去除设计器内部 data 属性）
 *  getAllowedAttrs(tag) → Set<string> | null  — 若提供则过滤掉未知属性（ui5 内部属性）
 *  forExport=true 时额外清除 {{varName}} 占位符（data-bind-* 保留供运行时绑定）
 */
export function serializeDesignArea(designArea, forExport = false, getAllowedAttrs = null) {
  const clone = designArea.cloneNode(true);
  clone.querySelector('.sel-overlay')?.remove();
  clone.querySelector('.slot-bar')?.remove();
  _stripDesignerAttrs(clone);
  clone.querySelectorAll('*').forEach((el) => _stripDesignerAttrs(el));
  clone.querySelectorAll('[data-design-node]').forEach((el) => {
    el.removeAttribute('data-design-node');
    el.removeAttribute('data-node-id');
    el.classList.remove('selected', 'drop-target', 'dragging');
    _stripInternalAttrs(el, getAllowedAttrs);
    if (forExport) {
      Array.from(el.attributes).forEach((attr) => {
        if (attr.name.startsWith('data-bind-')) return;
        if (/^\{\{[a-zA-Z_$][a-zA-Z0-9_$]*\}\}$/.test(attr.value)) el.setAttribute(attr.name, '');
      });
    }
  });
  return clone.innerHTML.trim() || '<!-- 设计区为空 -->';
}

/** 序列化设计区 HTML，保留 data-node-id 供源码面板定位使用 */
export function serializeDesignAreaWithIds(designArea, getAllowedAttrs = null) {
  const clone = designArea.cloneNode(true);
  clone.querySelector('.sel-overlay')?.remove();
  clone.querySelector('.slot-bar')?.remove();
  _stripDesignerAttrs(clone);
  clone.querySelectorAll('*').forEach((el) => _stripDesignerAttrs(el));
  clone.querySelectorAll('[data-design-node]').forEach((el) => {
    el.removeAttribute('data-design-node');
    el.classList.remove('selected', 'drop-target', 'dragging');
    _stripInternalAttrs(el, getAllowedAttrs);
  });
  return clone.innerHTML.trim() || '<!-- 设计区为空 -->';
}

/**
 * 若设计区序列化结果误含「导出整页」结构：首节点为 `<template id="cmx-page-template-…">`，
 * 则返回其 innerHTML 作为真实页面设计区；否则返回 null（调用方继续用原始序列化串）。
 * 典型成因：从服务器导入时把 `<template>+cmx-html-pages-*` 整块写入了画布。
 * @param {string} html
 * @returns {string | null}
 */
export function extractCmxPageDesignBodyFromScalerHtml(html) {
  const s = String(html ?? '').trim();
  if (!s) return null;
  const doc = new DOMParser().parseFromString(
    `<div id="__cmx_scaler_wrap__">${s}</div>`,
    'text/html',
  );
  const wrap = doc.getElementById('__cmx_scaler_wrap__');
  if (!wrap?.firstElementChild) return null;
  const el = wrap.firstElementChild;
  if (el.tagName !== 'TEMPLATE') return null;
  const id = el.getAttribute('id') || '';
  if (!id.startsWith('cmx-page-template-')) return null;
  const slug = id.slice('cmx-page-template-'.length);
  if (!slug || !/^[a-z0-9.-]+$/i.test(slug)) return null;
  return el.innerHTML;
}

/**
 * 从设计区 HTML 片段中移除可执行的 `<script>`（text/javascript 或无 type），并合并其文本；
 * 同时移除 `<script id="__designer_meta__">`（不入画布）。
 * @param {string} html
 * @returns {{ html: string, scriptsJoined: string }}
 */
export function stripDesignScriptsFromHtmlFragment(html) {
  const s = String(html ?? '');
  if (typeof document === 'undefined' || !document.createElement) {
    return { html: s, scriptsJoined: '' };
  }
  const host = document.createElement('div');
  host.innerHTML = s;
  host.querySelectorAll('script#__designer_meta__').forEach((el) => el.remove());
  const texts = [];
  host.querySelectorAll('script').forEach((el) => {
    const type = (el.getAttribute('type') || '').trim().toLowerCase();
    if (type && type !== 'text/javascript' && type !== 'application/javascript') return;
    texts.push(el.textContent ?? '');
    el.remove();
  });
  return {
    html: host.innerHTML,
    scriptsJoined: texts.map((t) => String(t).trim()).filter(Boolean).join('\n\n').trim(),
  };
}

/** 移除设计器内部运行时属性 */
function _stripDesignerAttrs(el) {
  Array.from(el.attributes).forEach((attr) => {
    if (attr.name.startsWith('data-designer-')) el.removeAttribute(attr.name);
  });
}

/** 移除元素上不在允许列表中的属性（style / slot / data-* / data-event* 始终保留） */
function _stripInternalAttrs(el, getAllowedAttrs) {
  if (!getAllowedAttrs) return;
  const allowed = getAllowedAttrs(el.tagName.toLowerCase());
  if (!allowed) return;
  Array.from(el.attributes).forEach((attr) => {
    const n = attr.name;
    if (n === 'style' || n === 'slot') return;
    if (n.startsWith('data-') || n.startsWith('data-event')) return;
    if (!allowed.has(n)) el.removeAttribute(n);
  });
}

/**
 * 仅画布事件、无 page-data 时：从与 pageId 绑定的 template 取 HTML 注入 Shadow 的空壳页面组件。
 *
 * 设计要点：
 * - **IIFE 形参注入** `templateRoot`：调用方可显式传容器（含 `<template>` 的元素），不再依赖 `typeof __cmxTemplateRoot` 全局嗅探；
 *   未传则按 `window.__cmxTemplateRoot` → `document` 回退（保留与 run-main.js / designer-inline-run.js / portal hydrate 的现有契约）。
 * - **`<template>.content.cloneNode(true)` 替代 `tpl.innerHTML` 字符串路径**：fragment clone 是 inert 的 O(n) 复制，
 *   不再二次序列化/解析；同时与未来直接放 `<script>` 在模板内的扩展兼容（虽然当前路径没有这种用法）。
 * - **`disconnectedCallback` 调用 `host.__cmxDispose?.()`**：业务侧（事件注册、定时器、ResizeObserver 等）可把清理函数挂上来；
 *   `cmx-html-pages-*` 实例由 portal 在标签关闭时 `remove()`，对应的 disconnect 钩子会触发。
 * - 模板查询缓存到 IIFE 闭包：连续多实例时只在首次实例化做一次 querySelector。
 */
function _cmxShellPageComponentScript(tagName, templateId, runtimeClassName, pageCoord) {
  const tplSelector = JSON.stringify(`#${templateId}`);
  // 坐标直接内联到 connectedCallback，不依赖文档级全局变量（避免多页覆盖 + 时序问题）
  const coordAssign = pageCoord
    ? `      if (this.$coord == null) this.$coord = Object.freeze(${JSON.stringify(pageCoord)});`
    : '';
  return [
    '(function (templateRoot) {',
    `  var TAG = ${JSON.stringify(tagName)};`,
    '  var _tpl;',
    '  function _resolveTpl() {',
    '    if (_tpl) return _tpl;',
    '    var tr = templateRoot',
    '      || (typeof window !== "undefined" && window.__cmxTemplateRoot)',
    '      || (typeof document !== "undefined" ? document : null);',
    `    _tpl = tr && tr.querySelector ? tr.querySelector(${tplSelector}) : null;`,
    '    return _tpl;',
    '  }',
    `  class ${runtimeClassName} extends HTMLElement {`,
    '    connectedCallback() {',
    '      if (this.__cmxBoot) return;',
    '      this.__cmxBoot = true;',
    '      if (this.workspace == null) { try {',
    '        var _wsEl = this.closest && this.closest("[data-cmx-workspace-id]");',
    '        var _wsId = _wsEl && _wsEl.dataset && _wsEl.dataset.cmxWorkspaceId;',
    '        var _ma = typeof window !== "undefined" ? window.mainapp : null;',
    '        if (_wsId && _ma) this.workspace = _ma.workspaces[_wsId] || _ma.activityScopes[_wsId] || null;',
    '        if (this.workspace == null && typeof window !== "undefined" && window.workspace != null) this.workspace = window.workspace;',
    '      } catch (_) {} }',
    '      var root = this.attachShadow({ mode: "open" });',
    '      var _s = document.createElement("style");',
    '      _s.textContent = ":host{color:var(--sapTextColor,inherit);background:var(--sapBackgroundColor,transparent);}";',
    '      root.appendChild(_s);',
    '      var tpl = _resolveTpl();',
    '      if (tpl && tpl.content) root.appendChild(tpl.content.cloneNode(true));',
    coordAssign,
    '      __hydrateEvents(root, this);',
    '    }',
    '    disconnectedCallback() {',
    '      try { if (typeof this.__cmxDispose === "function") this.__cmxDispose(); }',
    '      catch (e) { try { console.warn("[cmx-html-pages] dispose failed", e); } catch (_) {} }',
    '    }',
    '  }',
    `  if (!customElements.get(TAG)) customElements.define(TAG, ${runtimeClassName});`,
    '})(typeof window !== "undefined" ? window.__cmxTemplateRoot : null);',
  ].join('\n');
}

/** 生成完整 HTML 文档字符串
 *  metaJson: 可选，设计器状态 JSON 字符串，嵌入 head 供再次导入时恢复
 *  deps: 可选，外部依赖库数组 [{name, url, loadType:'script'|'module', globalName?}]
 *        script 类型 → <script src> 同步加载（UMD/全局库）
 *        module 类型 → 合并进 importmap
 *  pageId: 用于 body 内 <cmx-html-pages-…> 标签名（与 getScriptBlock(pageId) 一致）
 */
export function wrapHtmlDocument(
  bodyInnerHtml,
  scriptBlock = '',
  metaJson = '',
  deps = [],
  pageMeta = 'unnamed',
) {
  // pageMeta 兼容三种形态：字符串（旧调用，仅 id）、{id}、{id,domain,app,module}
  const pm = typeof pageMeta === 'string' ? { id: pageMeta } : (pageMeta || {});
  const pid = pm.id != null && String(pm.id).trim() ? String(pm.id).trim() : 'unnamed';
  const scriptDeps = deps.filter(d => d.loadType === 'script' && d.url);
  const moduleDeps = deps.filter(d => d.loadType === 'module' && d.url && d.name);
  const tagName          = cmxHtmlPagesElementLocalName(pid);
  const templateId       = cmxPageTemplateElementId(pid);
  const runtimeClassName = cmxPageRuntimeClassName(pid);
  const bodyHostEl       = `<${tagName} data-cmx-html-page-host=""></${tagName}>`;
  // 页面级坐标（domain/application/module/doc），来自后端 batch 接口；运行时挂到 host.$coord 供组件兜底。
  const pageCoord = {
    domain: pm.domain || '',
    application: pm.app || pm.application || '',
    module: pm.module || '',
    doc: pm.doc || '',
  };

  const parts = [
    '<!DOCTYPE html>',
    '<html lang="zh-CN">',
    '<head>',
    '  <meta charset="UTF-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    '  <title>导出页面</title>',
  ];
  if (metaJson) {
    parts.push(`  <script type="application/json" id="__designer_meta__">${metaJson}<\/script>`);
  }

  // UMD/全局脚本在 importmap 之前同步加载，确保全局变量在用户代码执行时已可用
  for (const d of scriptDeps) {
    parts.push(`  <script src="${d.url}"><\/script>`);
  }

  // 构建 importmap：UI5 固定条目 + module 类型依赖
  const moduleEntries = moduleDeps
    .map(d => `      ${JSON.stringify(d.name)}: ${JSON.stringify(d.url)}`)
    .join(',\n');
  const moduleBlock = moduleEntries ? `,\n${moduleEntries}` : '';

  parts.push(
    '  <script type="importmap">',
    '  {',
    '    "imports": {',
    '      "@ui5/webcomponents/":                  "https://cdn.jsdelivr.net/npm/@ui5/webcomponents@2.22.0/",',
    '      "@ui5/webcomponents-fiori/":            "https://cdn.jsdelivr.net/npm/@ui5/webcomponents-fiori@2.22.0/",',
    '      "@ui5/webcomponents-base/":             "https://cdn.jsdelivr.net/npm/@ui5/webcomponents-base@2.22.0/",',
    '      "@ui5/webcomponents-icons/":            "https://cdn.jsdelivr.net/npm/@ui5/webcomponents-icons@2.22.0/",',
    '      "@ui5/webcomponents-icons-tnt/":        "https://cdn.jsdelivr.net/npm/@ui5/webcomponents-icons-tnt@2.22.0/",',
    '      "@ui5/webcomponents-icons-business-suite/":"https://cdn.jsdelivr.net/npm/@ui5/webcomponents-icons-business-suite@2.22.0/",',
    '      "@ui5/webcomponents-localization/":     "https://cdn.jsdelivr.net/npm/@ui5/webcomponents-localization@2.22.0/",',
    '      "@ui5/webcomponents-theming/":          "https://cdn.jsdelivr.net/npm/@ui5/webcomponents-theming@2.22.0/"' + moduleBlock,
    '    }',
    '  }',
    '  <\/script>',
    `  <script type="application/json" data-ui5-config>{"theme": "${library.defaultTheme}"}<\/script>`,
    '  <script type="module" src="https://cdn.jsdelivr.net/npm/@ui5/webcomponents@2.22.0/dist/bundle.esm.js"><\/script>',
    '  <script type="module" src="https://cdn.jsdelivr.net/npm/@ui5/webcomponents-fiori@2.22.0/dist/bundle.esm.js"><\/script>',
    '  <script type="module" src="https://cdn.jsdelivr.net/npm/@ui5/webcomponents-icons@2.22.0/dist/AllIcons.js"><\/script>',
    '  <script type="module" src="https://cdn.jsdelivr.net/npm/@ui5/webcomponents-icons-tnt@2.22.0/dist/AllIcons.js"><\/script>',
    '  <script type="module" src="https://cdn.jsdelivr.net/npm/@ui5/webcomponents-icons-business-suite@2.22.0/dist/AllIcons.js"><\/script>',
    `  <style>${THEME_CSS_MAP[library.defaultTheme] ?? ''}</style>`,
    '  <style>',
    '    *, *::before, *::after { box-sizing: border-box; }',
    '    body { margin: 0; padding: 12px; font-family: "Segoe UI", sans-serif; }',
    '  </style>',
    '</head>',
    '<body class="ui5-content-density-compact">',
    `<template id="${escapeAttr(templateId)}">`,
    bodyInnerHtml || '',
    '</template>',
    bodyHostEl,
  );
  // 设计器画布置于与 pageId 绑定的 <template id="cmx-page-template-…">，同文档多页互不冲突。
  // 页内运行等场景可在执行脚本前设置 window.__cmxTemplateRoot = 挂载容器元素，以便在 Shadow 内 querySelector 找到模板。
  // 事件水合用 new Function，避免 eval；为每条事件代码追加 //# sourceURL，DevTools 可按 URL 持久化断点。
  parts.push('<script>');
  parts.push(`if (typeof window !== "undefined" && window.__cmxDebug === undefined) window.__cmxDebug = ${debugModeRuntimeLiteral()};`);
  parts.push(`var __cmxPageId = ${JSON.stringify(slugForCmxHtmlPagesTag(pid))};`);
  parts.push('function __cmxNodeIdOf(el) {');
  parts.push('  try { return (el && el.dataset && el.dataset.nodeId) || (el && el.tagName ? el.tagName.toLowerCase() : "node"); }');
  parts.push('  catch (_) { return "node"; }');
  parts.push('}');
  parts.push('function __cmxDecorate(code, kind, evtName, el) {');
  parts.push('  var url = "cmx://" + kind + "/" + __cmxPageId + "/" + __cmxNodeIdOf(el) + "/" + evtName;');
  parts.push('  var prefix = (typeof window !== "undefined" && window.__cmxDebug) ? "debugger;\\n" : "";');
  parts.push('  return prefix + String(code == null ? "" : code) + "\\n//# sourceURL=" + url;');
  parts.push('}');
  parts.push('function __hydrateEvents(root, host) {');
  parts.push('  if (!root || !root.querySelectorAll) return;');
  parts.push('  root.querySelectorAll("*").forEach(function(el) {');
  parts.push('    Array.from(el.attributes).forEach(function(attr) {');
  parts.push('      if (!attr.name.startsWith("data-event")) return;');
  parts.push('      var evtName = attr.name.slice("data-event".length).toLowerCase();');
  parts.push('      var code = attr.value;');
  parts.push('      if (!evtName || !code) return;');
  parts.push('      var src = __cmxDecorate(code, "event", evtName, el);');
  parts.push('      var localHost = host || (el.closest && el.closest("[data-cmx-html-page-host]")) || null;');
  parts.push('      var compiled;');
  parts.push('      try {');
  parts.push('        compiled = localHost');
  parts.push('          ? new Function("event", "host", "with (host) {\\n" + src + "\\n}")');
  parts.push('          : new Function("event", src);');
  parts.push('      } catch (e) { console.warn("[event compile]", evtName, e); return; }');
  parts.push('      el.addEventListener(evtName, function(event) {');
  parts.push('        try {');
  parts.push('          if (localHost) compiled.call(localHost, event, localHost);');
  parts.push('          else compiled.call(null, event);');
  parts.push('        } catch (e) { console.warn("[event]", evtName, e); }');
  parts.push('      });');
  parts.push('    });');
  parts.push('  });');
  parts.push('}');
  parts.push('');
  if (scriptBlock) {
    parts.push(scriptBlock);
  } else {
    parts.push(_cmxShellPageComponentScript(tagName, templateId, runtimeClassName, pageCoord));
  }
  parts.push('<\/script>');
  parts.push('</body>');
  parts.push('</html>');
  return parts.join('\n');
}

/** 转义 HTML 属性值中的特殊字符 */
export function escapeAttr(val) {
  return String(val ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/** 转义 HTML 文本内容中的特殊字符 */
export function escapeHtml(val) {
  return String(val ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** 将 rgb(r,g,b) 转为 #rrggbb（用于 color input） */
export function rgbToHex(rgb) {
  const m = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
  if (!m) return rgb;
  return '#' + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('');
}

/** 读取元素内联 style 的指定属性当前值（含 rgb→hex 转换） */
export function getStyleValue(el, prop) {
  const val = el.style[prop] || '';
  if (!val) return '';
  if (val.startsWith('rgb(')) return rgbToHex(val);
  return val;
}

/** 将业务 pageId 规范为可作为 HTML 自定义元素名一部分的后缀（小写、数字、连字符） */
export function slugForCmxHtmlPagesTag(pageId) {
  let s = String(pageId ?? 'unnamed').toLowerCase().trim() || 'unnamed';
  s = s.replace(/\./g, '-').replace(/_/g, '-').replace(/[^a-z0-9-]/g, '-');
  s = s.replace(/-+/g, '-').replace(/^-|-$/g, '') || 'unnamed';
  if (s.length > 200) s = s.slice(0, 200).replace(/-+$/g, '') || 'unnamed';
  return s;
}

/** 运行页宿主标签局部名，例如 cmx-html-pages-my-page */
export function cmxHtmlPagesElementLocalName(pageId) {
  return `cmx-html-pages-${slugForCmxHtmlPagesTag(pageId)}`;
}

/** 与 pageId 绑定的 <template> 元素 id，同页多实例互不冲突（例如 cmx-page-template-my-page） */
export function cmxPageTemplateElementId(pageId) {
  return `cmx-page-template-${slugForCmxHtmlPagesTag(pageId)}`;
}

/**
 * 导出/运行脚本内 Web Component 类名（合法 JS 标识符），与 pageId 绑定，多段脚本同文档不冲突。
 * 例：pageId `app.home` → `CmxHtmlPage_app_home`
 */
export function cmxPageRuntimeClassName(pageId) {
  let s = slugForCmxHtmlPagesTag(pageId).replace(/-/g, '_');
  if (!/^[a-zA-Z_$]/.test(s)) s = `_${s}`;
  return `CmxHtmlPage_${s}`;
}

/**
 * 解析设计器「调试」写入 sessionStorage 的载荷。
 * 兼容旧版：整段字符串即 HTML；新版为 JSON { html, pageId }。
 * @returns {{ html: string, pageId: string } | null}
 */
export function parseDesignerRunSession(raw) {
  if (raw == null || raw === '') return null;
  const trimmed = String(raw).trim();
  if (trimmed.startsWith('{')) {
    try {
      const o = JSON.parse(trimmed);
      if (o && typeof o.html === 'string') {
        const pageId =
          typeof o.pageId === 'string' && o.pageId.trim() ? o.pageId.trim() : 'unnamed';
        return { html: o.html, pageId };
      }
    } catch {
      /* 非法 JSON 时按旧版整段 HTML 处理 */
    }
  }
  return { html: String(raw), pageId: 'unnamed' };
}

/**
 * 解析设计器「多页调试」写入 sessionStorage 的载荷（键 `__designer_run_batch__`）。
 * @returns {{ pages: Array<{ pageId: string, html: string, name: string, details: string, timestamp: string }> } | null}
 */
export function parseDesignerRunBatchSession (raw) {
  if (raw == null || raw === '') return null;
  try {
    const o = JSON.parse(String(raw).trim());
    if (!o || typeof o !== 'object' || !Array.isArray(o.pages)) return null;
    const pages = o.pages
      .filter((p) => {
        if (!p || typeof p !== 'object') return false;
        const html = p.html;
        const pageId = p.pageId;
        return typeof html === 'string' && html.trim() !== ''
          && typeof pageId === 'string' && pageId.trim() !== '';
      })
      .map((p) => ({
        pageId: String(p.pageId).trim(),
        html: String(p.html),
        name: typeof p.name === 'string' ? p.name : '',
        details: typeof p.details === 'string' ? p.details : '',
        timestamp: typeof p.timestamp === 'string' ? p.timestamp : '',
      }));
    return pages.length ? { pages } : null;
  } catch {
    return null;
  }
}

const DEFAULT_EXPORT_DOC_TITLE = '导出页面';

/**
 * 调试页 Content 区标签标题：有真实文档标题时用标题；占位「导出页面」时改为「当前调试 / pageId」。
 * @param {string|undefined|null} docTitle `<title>` 或解析得到的文档标题
 * @param {string|undefined|null} pageId 会话中的页面 ID
 * @returns {string}
 */
export function formatDebugRunTabLabel (docTitle, pageId) {
  const pid = pageId != null && String(pageId).trim() ? String(pageId).trim() : 'unnamed';
  const tit = docTitle != null && String(docTitle).trim() ? String(docTitle).trim() : '';
  if (tit && tit !== DEFAULT_EXPORT_DOC_TITLE) return tit;
  return `当前调试 / ${pid}`;
}
