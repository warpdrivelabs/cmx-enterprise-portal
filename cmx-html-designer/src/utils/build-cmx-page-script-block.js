import {
  cmxHtmlPagesElementLocalName,
  cmxPageRuntimeClassName,
  cmxPageTemplateElementId,
  slugForCmxHtmlPagesTag,
} from './html-utils.js';
import { genServiceCode, genServiceFnBody } from '../components/designer-page-data/page-data-panel-svc.js';
import {
  PAGE_INTERFACE_REGISTRY,
  VALID_INTERFACE_ID,
  normalizePageInterfaces,
} from '../components/designer-page-data/page-interface-registry.js';

/**
 * 与 `DesignerPageData#getScriptBlock` 逻辑一致，
 * 但接受纯 JSON 状态，供调试页把「服务端保存的片段 HTML」包成可运行整页。
 *
 * @param {{
 *   pageData?: unknown[],
 *   pageFns?: unknown[],
 *   pageServices?: unknown[],
 *   pageDeps?: unknown[],
 *   pageInterfaces?: unknown[],
 * } | null | undefined} state
 * @param {string|{id?:string, domain?:string, app?:string, module?:string}} pageMeta 页面 id 或含坐标的元信息
 * @returns {string}
 */
export function buildCmxScriptBlockFromPageState (state, pageMeta = 'unnamed') {
  // pageMeta 兼容字符串（仅 id）与对象（{id,domain,app,module}）
  const pm = typeof pageMeta === 'string' ? { id: pageMeta } : (pageMeta || {});
  const pageId = pm.id != null && String(pm.id).trim() ? String(pm.id).trim() : 'unnamed';
  const validId = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;
  const pageData = Array.isArray(state?.pageData) ? state.pageData : [];
  const pageFns = Array.isArray(state?.pageFns) ? state.pageFns : [];
  const pageServices = Array.isArray(state?.pageServices) ? state.pageServices : [];
  const pageInterfaces = normalizePageInterfaces(state?.pageInterfaces);

  const validData = pageData.filter((d) => d && d.name && validId.test(d.name));
  const validFns = pageFns.filter((f) => f && f.name && validId.test(f.name));
  const validSvcs = pageServices.filter((s) => s && s.name && validId.test(s.name));
  /**
   * 接口生成集合：包含「作者启用且有 body」+「未启用但有 defaultBody」。
   * 顺序与 registry 保持一致（保证宿主侧消费时的稳定性）。
   */
  const ifaceEntries = PAGE_INTERFACE_REGISTRY
    .filter((def) => VALID_INTERFACE_ID.test(def.name))
    .map((def) => {
      const item = pageInterfaces.find((x) => x.name === def.name);
      const userActive = !!(item && item.enabled && typeof item.body === 'string' && item.body.trim());
      return { def, item, userActive };
    })
    .filter(({ def, userActive }) => userActive || def.defaultBody !== null);

  if (!validData.length && !validFns.length && !validSvcs.length && !ifaceEntries.length) return '';

  const pid = pageId;
  const tagName = cmxHtmlPagesElementLocalName(pid);
  const templateId = cmxPageTemplateElementId(pid);
  const runtimeClassName = cmxPageRuntimeClassName(pid);
  const hr = 'host';
  const indent = (n) => ' '.repeat(n);
  const lines = [];

  // 设计要点（与 _cmxShellPageComponentScript 保持一致）：
  // - IIFE 形参 `templateRoot` 注入：调用方可显式传容器；未传则按 window.__cmxTemplateRoot → document 回退。
  // - `_resolveTpl()` 把 querySelector 结果缓存到闭包，多实例时避免重复查询。
  // - `tpl.content.cloneNode(true)` 替代 `root.innerHTML = tpl.innerHTML`：fragment clone 是 inert 的 O(n) 复制，
  //   不再二次序列化/解析，且对未来直接放 `<script>` 在模板内的扩展兼容。
  // - `disconnectedCallback` 调用 `host.__cmxDispose?.()`，业务侧（Proxy 监听、定时器、WebSocket、ResizeObserver）
  //   可挂清理函数；portal 关闭标签 `remove()` 时会触发。
  const tplSelector = JSON.stringify(`#${templateId}`);
  lines.push('// === CMX 页面 Web Component（#cmx-page-template-<页slug> → Shadow + 实例方法）===');
  lines.push('(function (templateRoot) {');
  lines.push(`  var TAG = ${JSON.stringify(tagName)};`);
  lines.push('  var _tpl;');
  lines.push('  function _resolveTpl() {');
  lines.push('    if (_tpl) return _tpl;');
  lines.push('    var tr = templateRoot');
  lines.push('      || (typeof window !== "undefined" && window.__cmxTemplateRoot)');
  lines.push('      || (typeof document !== "undefined" ? document : null);');
  lines.push(`    _tpl = tr && tr.querySelector ? tr.querySelector(${tplSelector}) : null;`);
  lines.push('    return _tpl;');
  lines.push('  }');
  lines.push(`  class ${runtimeClassName} extends HTMLElement {`);
  lines.push('    connectedCallback() {');
  lines.push('      if (this.__cmxBoot) return;');
  lines.push('      this.__cmxBoot = true;');
  lines.push('      if (this.workspace == null) { try {');
  lines.push('        var _wsEl = this.closest && this.closest("[data-cmx-workspace-id]");');
  lines.push('        var _wsId = _wsEl && _wsEl.dataset && _wsEl.dataset.cmxWorkspaceId;');
  lines.push('        var _ma = typeof window !== "undefined" ? window.mainapp : null;');
  lines.push('        if (_wsId && _ma) this.workspace = _ma.workspaces[_wsId] || _ma.activityScopes[_wsId] || null;');
  lines.push('        if (this.workspace == null && typeof window !== "undefined" && window.workspace != null) this.workspace = window.workspace;');
  lines.push('      } catch (_) {} }');
  lines.push('      var root = this.attachShadow({ mode: "open" });');
  lines.push('      var _s = document.createElement("style");');
  lines.push('      _s.textContent = ":host{color:var(--sapTextColor,inherit);background:var(--sapBackgroundColor,transparent);}";');
  lines.push('      root.appendChild(_s);');
  lines.push('      var tpl = _resolveTpl();');
  lines.push('      if (tpl && tpl.content) root.appendChild(tpl.content.cloneNode(true));');
  lines.push(`      var ${hr} = this;`);
  // 页面级坐标（domain/application/module/doc）直接内联到 connectedCallback，不依赖文档级全局变量。
  // 供 pageFns（loadVoucher 等）与 initPageModels 里的组件兜底使用（host.$coord）。
  const _coord = { domain: pm.domain || '', application: pm.app || pm.application || '', module: pm.module || '', doc: pm.doc || '' };
  lines.push(`      if (${hr}.$coord == null) ${hr}.$coord = Object.freeze(${JSON.stringify(_coord)});`);
  // 即便没有 page-data，仍声明一个空 $data 供 fns / 接口闭包使用，避免下游引用未定义。
  lines.push('      var _$dataRaw = {};');
  lines.push('      var $data = _$dataRaw;');

  if (validData.length) {
    lines.push('      function __applyBindings(varName, value) {');
    lines.push('        root.querySelectorAll("*").forEach(function(el) {');
    lines.push('          Array.from(el.attributes).forEach(function(attr) {');
    lines.push('            if (!attr.name.startsWith("data-bind-")) return;');
    lines.push('            if (attr.value !== varName) return;');
    lines.push('            var targetAttr = attr.name.slice("data-bind-".length);');
    lines.push(
      '            if (typeof el[targetAttr] !== "undefined") el[targetAttr] = value;',
    );
    lines.push(
      '            else el.setAttribute(targetAttr, value == null ? "" : String(value));',
    );
    lines.push('          });');
    lines.push('        });');
    lines.push('      }');
    lines.push('      _$dataRaw = {');
    const entries = validData.map((d) => {
      let defVal = d.defaultValue ?? '';
      switch (d.type) {
        case 'string':
          defVal = `"${String(defVal).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
          break;
        case 'number':
          defVal = defVal || '0';
          break;
        case 'boolean':
          defVal = (defVal === 'false' || !defVal) ? 'false' : 'true';
          break;
        case 'object':
          defVal = defVal || '{}';
          break;
        case 'array':
          defVal = defVal || '[]';
          break;
        default:
          defVal = `"${String(defVal).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
      }
      return `${indent(8)}${d.name}: ${defVal}`;
    });
    lines.push(entries.join(',\n'));
    lines.push('      };');
    lines.push('      $data = new Proxy(_$dataRaw, {');
    lines.push('        set: function(target, key, value) {');
    lines.push('          target[key] = value;');
    lines.push('          __applyBindings(key, value);');
    lines.push('          return true;');
    lines.push('        }');
    lines.push('      });');
    lines.push(`      ${hr}.$data = $data;`);
    lines.push(
      '      Object.keys(_$dataRaw).forEach(function(k) { __applyBindings(k, _$dataRaw[k]); });',
    );
  }

  if (validFns.length) {
    lines.push('      // --- 页面函数（组件实例方法；逐条 new Function 注入，DevTools 按 sourceURL 分文件）---');
    const pidSlug = slugForCmxHtmlPagesTag(pid);
    for (const f of validFns) {
      const params = String(f.params || '').split(',').map((s) => s.trim()).filter(Boolean);
      const userParamArgs = params.map((p) => JSON.stringify(p)).join(', ');
      const sourceUrl = `cmx://page-fn/${pidSlug}/${f.name}`;
      const bodyStr = JSON.stringify(
        `${String(f.body || '')}\n//# sourceURL=${sourceUrl}`,
      );
      const dbgGuard = `(typeof window !== "undefined" && window.__cmxDebug ? "debugger;\\n" : "")`;
      const ctorArgs = ['"$data"', '"host"', userParamArgs, `${dbgGuard} + ${bodyStr}`]
        .filter(Boolean).join(', ');
      lines.push(`      ${hr}.${f.name} = new Function(${ctorArgs}).bind(${hr}, $data, ${hr});`);
    }
  }

  if (validSvcs.length) {
    lines.push('      // --- 页面服务（组件实例方法；REST / JSON-RPC / GraphQL 用 new AsyncFunction + sourceURL，DevTools 按服务分文件）---');
    lines.push('      var __AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;');
    const pidSlug = slugForCmxHtmlPagesTag(pid);
    for (const s of validSvcs) {
      lines.push('');
      if (s.type === 'websocket') {
        // WS 三个函数共享 `_ws_${name}` 闭包变量，必须保持内联以维持闭包关系。
        lines.push(...genServiceCode(s, hr).map((l) => `      ${l}`));
      } else {
        const inner = { ...s, name: `_${s.name}_fetch` };
        const fnBody = genServiceFnBody(inner);
        if (fnBody) {
          const fetchUrl = `cmx://page-service/${pidSlug}/${inner.name}`;
          const fetchBody = JSON.stringify(`${fnBody}\n//# sourceURL=${fetchUrl}`);
          const fetchDbg = `(typeof window !== "undefined" && window.__cmxDebug ? "debugger;\\n" : "")`;
          lines.push(
            `      ${hr}.${inner.name} = new __AsyncFunction("$data", "host", "params", "_opts", ${fetchDbg} + ${fetchBody}).bind(${hr}, $data, ${hr});`,
          );
        } else {
          lines.push(...genServiceCode(inner, hr).map((l) => `      ${l}`));
        }
        const hasTransform = !!s.responseTo && !!s.responseTransform?.trim();
        if (hasTransform) {
          const xformUrl = `cmx://page-service/${pidSlug}/${s.name}_xform`;
          const xformBody = JSON.stringify(
            `${String(s.responseTransform)}\n//# sourceURL=${xformUrl}`,
          );
          const xformDbg = `(typeof window !== "undefined" && window.__cmxDebug ? "debugger;\\n" : "")`;
          lines.push(
            `      ${hr}._${s.name}_xform = new Function("data", "$data", "host", ${xformDbg} + ${xformBody});`,
          );
        }
        const wrapUrl = `cmx://page-service/${pidSlug}/${s.name}`;
        const wrapLines = [];
        wrapLines.push(`var _result = await host._${s.name}_fetch(params, _opts);`);
        if (s.responseTo) {
          if (hasTransform) {
            wrapLines.push(`$data.${s.responseTo} = host._${s.name}_xform.call(host, _result, $data, host);`);
          } else {
            wrapLines.push(`$data.${s.responseTo} = _result;`);
          }
        }
        wrapLines.push('return _result;');
        const wrapBody = JSON.stringify(`${wrapLines.join('\n')}\n//# sourceURL=${wrapUrl}`);
        const wrapDbg = `(typeof window !== "undefined" && window.__cmxDebug ? "debugger;\\n" : "")`;
        lines.push(
          `      ${hr}.${s.name} = new __AsyncFunction("$data", "host", "params", "_opts", ${wrapDbg} + ${wrapBody}).bind(${hr}, $data, ${hr});`,
        );
      }
    }
  }

  if (ifaceEntries.length) {
    const pidSlug = slugForCmxHtmlPagesTag(pid);
    lines.push('      // --- 对外接口：dirty 跟踪 + 默认实现 + 作者覆盖（组件实例方法）---');
    // 脏标记控制（作者精确控制；$data 写入不会自动置脏）
    lines.push(`      ${hr}.markDirty = function (on) {`);
    lines.push(`        var v = (on === undefined ? true : !!on);`);
    lines.push(`        if (${hr}.__cmxDirty === v) return;`);
    lines.push(`        ${hr}.__cmxDirty = v;`);
    lines.push(`        try { ${hr}.dispatchEvent(new CustomEvent("cmx-page-dirty-changed", { bubbles: true, composed: true, detail: { dirty: v } })); } catch (_) {}`);
    lines.push('      };');
    lines.push(`      ${hr}.markClean = function () { ${hr}.markDirty(false); };`);
    // 忙状态广播（save/refresh 等长耗时操作的统一入口）
    lines.push(`      ${hr}.setBusy = function (on, message) {`);
    lines.push(`        var v = !!on;`);
    lines.push(`        ${hr}.__cmxBusy = v;`);
    lines.push(`        try { ${hr}.dispatchEvent(new CustomEvent("cmx-page-busy-changed", { bubbles: true, composed: true, detail: { busy: v, message: message || "" } })); } catch (_) {}`);
    lines.push('      };');
    // 初始快照（供 reset 使用）；放在 fns/svcs 注册之后、接口注册之前以反映最终 $data 形状
    lines.push('      try {');
    lines.push(`        ${hr}.__cmxInitialData = (typeof structuredClone === "function")`);
    lines.push('          ? structuredClone(_$dataRaw)');
    lines.push('          : JSON.parse(JSON.stringify(_$dataRaw));');
    lines.push(`      } catch (_) { ${hr}.__cmxInitialData = Object.assign({}, _$dataRaw); }`);

    for (const { def, item, userActive } of ifaceEntries) {
      if (userActive) {
        const userParams = String(def.params || '').split(',').map((s) => s.trim()).filter(Boolean);
        const userParamArgs = userParams.map((p) => JSON.stringify(p)).join(', ');
        const sourceUrl = `cmx://page-iface/${pidSlug}/${def.name}`;
        const bodyStr = JSON.stringify(`${String(item.body)}\n//# sourceURL=${sourceUrl}`);
        const dbgGuard = `(typeof window !== "undefined" && window.__cmxDebug ? "debugger;\\n" : "")`;
        const ctorArgs = ['"$data"', '"host"', userParamArgs, `${dbgGuard} + ${bodyStr}`]
          .filter(Boolean).join(', ');
        lines.push(`      ${hr}.${def.name} = new Function(${ctorArgs}).bind(${hr}, $data, ${hr});`);
      } else if (def.defaultBody !== null) {
        const params = ['$data', 'host', ...String(def.params || '').split(',').map((s) => s.trim()).filter(Boolean)];
        lines.push(`      if (typeof ${hr}.${def.name} !== "function") {`);
        lines.push(`        ${hr}.${def.name} = (function (${params.join(', ')}) {`);
        for (const ln of String(def.defaultBody).split('\n')) {
          lines.push(`          ${ln}`);
        }
        lines.push(`        }).bind(${hr}, $data, ${hr});`);
        lines.push('      }');
      }
    }
  }

  lines.push(`      __hydrateEvents(root, ${hr});`);

  // ── 模型初始化：委托给 cmx-data-comp/lib/init-page-models.js，框架不感知具体模型类 ──
  const dataFlow    = state?.dataFlow && typeof state.dataFlow === 'object' ? state.dataFlow : null;
  const dataSources = Array.isArray(state?.dataSources) ? state.dataSources : [];
  const models      = Array.isArray(state?.models) ? state.models : [];
  const pageModelsConfig = JSON.stringify({ dataFlow, dataSources, models });
  lines.push('      // === 页面模型初始化（委托给 cmx-data-comp，框架不感知具体模型类） ===');
  lines.push(`      (typeof globalThis !== "undefined" && globalThis.__cmxInitPageModels`);
  lines.push(`        ? Promise.resolve(globalThis.__cmxInitPageModels)`);
  lines.push(`        : import("cmx-data-comp/lib/init-page-models.js").then(function(m) { return m.initPageModels; })`);
  lines.push(`      ).then(function(initPageModels) {`);
  lines.push(`        return initPageModels(${pageModelsConfig}, ${hr}, root, $data);`);
  lines.push('      }).catch(function(e) {');
  lines.push('        try { console.warn("[cmx-html-pages] initPageModels failed:", e); } catch(_){}');
  lines.push(`        if (typeof ${hr}.initPage === "function") { try { ${hr}.initPage({}); } catch(_){} }`);
  lines.push('      });');

  lines.push('    }');
  lines.push('    disconnectedCallback() {');
  lines.push('      try { if (typeof this.onDispose === "function") this.onDispose(); }');
  lines.push('      catch (e) { try { console.warn("[cmx-html-pages] onDispose failed", e); } catch (_) {} }');
  lines.push('      try { if (typeof this.__cmxDispose === "function") this.__cmxDispose(); }');
  lines.push('      catch (e) { try { console.warn("[cmx-html-pages] dispose failed", e); } catch (_) {} }');
  lines.push('    }');
  lines.push('  }');
  lines.push(`  if (!customElements.get(TAG)) customElements.define(TAG, ${runtimeClassName});`);
  lines.push('})(typeof window !== "undefined" ? window.__cmxTemplateRoot : null);');

  return lines.join('\n');
}
