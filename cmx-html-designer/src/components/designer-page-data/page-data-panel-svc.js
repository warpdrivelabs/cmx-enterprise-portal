import { escapeAttr } from '../../utils/html-utils.js';
import {
  CM_RESIZE_HOST_CLASS,
  detachCodeMirrorResize,
} from '../../utils/codemirror-resize.js';
import { loadCodeMirrorJsBundle } from '../../lib/codemirror-loader.js';
import { createJsEditor, svcTransformCompletionSource } from './page-data-codemirror.js';
import { bindPageDataJsCmToolbar } from './page-data-js-cm-toolbar.js';
import './service-catalog-picker.js';

export function persistSvcEditorToModel(pd) {
  const ed = pd._svcCmEditors[0];
  const i = pd._svcCmBoundIndex;
  if (ed && i >= 0 && i < pd._pageServices.length) {
    pd._pageServices[i].responseTransform = ed.state.doc.toString();
  }
}

const SVC_TYPE_ICONS = {
  rest:      '🌐',
  jsonrpc:   '⚡',
  websocket: '🔌',
  graphql:   '💎',
};

const HTTP_METHOD_ICONS = {
  GET:    '🔍',
  POST:   '➕',
  PUT:    '🔄',
  PATCH:  '✏️',
  DELETE: '🗑️',
};

function svcTypeIcon(type) {
  return SVC_TYPE_ICONS[type] || SVC_TYPE_ICONS.rest;
}

function httpMethodIcon(method) {
  return HTTP_METHOD_ICONS[String(method || '').toUpperCase()] || '';
}

function svcSidebarTitle(s) {
  const t = s.type || 'rest';
  const isRest = t === 'rest';
  const method = isRest ? String(s.method || 'GET').toUpperCase() : '';
  const iconPart = isRest ? `${svcTypeIcon(t)}${httpMethodIcon(method)}` : svcTypeIcon(t);
  const tail = isRest && method ? `${String(t).toUpperCase()} · ${method}` : String(t).toUpperCase();
  return `${iconPart} ${s.name || '(未命名)'} · ${tail}`;
}

function fillSvcRespToOptions(pd, selectEl) {
  if (!selectEl) return;
  const cur = pd._svcSelectedIndex >= 0 && pd._pageServices[pd._svcSelectedIndex]
    ? pd._pageServices[pd._svcSelectedIndex].responseTo || ''
    : '';
  const varOpts = pd._pageData
    .filter(d => d.name)
    .map(d => `<option value="${escapeAttr(d.name)}">${escapeAttr(d.name)}</option>`)
    .join('');
  selectEl.innerHTML = `<option value="">— 不存储 —</option>${varOpts}`;
  selectEl.value = cur;
}

let _svcDetailFormWired = false;
let _svcCmToolbarWired = false;

function wireSvcDetailFormOnce(pd) {
  if (_svcDetailFormWired) return;
  _svcDetailFormWired = true;
  const sr = pd.shadowRoot;
  const form = sr.getElementById('svcDetailForm');
  if (!form) return;

  const onField = () => {
    const i = pd._svcSelectedIndex;
    if (i < 0 || i >= pd._pageServices.length) return;
    const s = pd._pageServices[i];
    s.name = (sr.getElementById('svcDetailName')?.value ?? '').trim();
    s.type = sr.getElementById('svcDetailType')?.value || 'rest';
    s.url = sr.getElementById('svcDetailUrl')?.value ?? '';
    s.method = sr.getElementById('svcDetailMethod')?.value || 'GET';
    s.rpcMethod = sr.getElementById('svcDetailRpc')?.value ?? '';
    s.gqlOperationName = sr.getElementById('svcDetailGqlOp')?.value ?? '';
    s.gqlQuery = sr.getElementById('svcDetailGqlQuery')?.value ?? '';
    s.headers = sr.getElementById('svcDetailHeaders')?.value ?? '';
    s.bodyTemplate = sr.getElementById('svcDetailBody')?.value ?? '';
    s.responseTo = sr.getElementById('svcDetailRespTo')?.value ?? '';
    updateSvcSidebarLabels(pd);
    const root = sr.getElementById('svcDetailForm');
    updateSvcCardVis(pd, root, s.type, s.method);
    pd._emitPageDataChanged();
  };

  ['svcDetailName', 'svcDetailUrl', 'svcDetailRpc', 'svcDetailGqlOp', 'svcDetailGqlQuery', 'svcDetailHeaders', 'svcDetailBody'].forEach((id) => {
    sr.getElementById(id)?.addEventListener('input', onField);
  });
  ['svcDetailType', 'svcDetailMethod', 'svcDetailRespTo'].forEach((id) => {
    sr.getElementById(id)?.addEventListener('change', onField);
  });

  sr.getElementById('svcDelCurrentBtn')?.addEventListener('click', () => {
    persistSvcEditorToModel(pd);
    const i = pd._svcSelectedIndex;
    if (i < 0 || !pd._pageServices.length) return;
    pd._pageServices.splice(i, 1);
    if (pd._svcSelectedIndex >= pd._pageServices.length) {
      pd._svcSelectedIndex = Math.max(0, pd._pageServices.length - 1);
    }
    void renderSvcList(pd).then(() => pd._emitPageDataChanged());
  });
}

function updateSvcSidebarLabels(pd) {
  const list = pd.shadowRoot.getElementById('svcList');
  if (!list) return;
  const rows = list.querySelectorAll('.sidebar-item-row');
  rows.forEach((row, i) => {
    const btn = row.querySelector('.sidebar-item');
    if (btn && pd._pageServices[i]) btn.textContent = svcSidebarTitle(pd._pageServices[i]);
  });
}

export function bindSvcPanel(pd) {
  wireSvcDetailFormOnce(pd);
  if (!_svcCmToolbarWired) {
    _svcCmToolbarWired = true;
    bindPageDataJsCmToolbar(pd, {
      idPrefix: 'svcCmTb',
      debuggerBtnId: 'svcInsertDebuggerBtn',
      getView: () => pd._svcCmEditors[0],
      persist: () => persistSvcEditorToModel(pd),
    });
  }
  pd.shadowRoot.getElementById('addSvcBtn').addEventListener('click', () => {
    persistSvcEditorToModel(pd);
    pd._pageServices.push({
      name: '', type: 'rest', url: '', method: 'GET',
      rpcMethod: '', gqlOperationName: '', gqlQuery: '',
      headers: '', bodyTemplate: '',
      responseTo: '', responseTransform: '',
    });
    pd._svcSelectedIndex = pd._pageServices.length - 1;
    void renderSvcList(pd).then(() => pd._emitPageDataChanged());
  });

  /* 「从目录选择」：弹服务目录选择对话框（Bruno collection），选中条目投影成 pageService。 */
  const pickBtn = pd.shadowRoot.getElementById('pickSvcBtn');
  if (pickBtn) {
    pickBtn.addEventListener('click', () => {
      let picker = pd._svcCatalogPicker;
      if (!picker) {
        picker = document.createElement('service-catalog-picker');
        pd.shadowRoot.appendChild(picker);
        picker.addEventListener('service-picked', (e) => {
          persistSvcEditorToModel(pd);
          pd._pageServices.push(projectCatalogServiceToPageService(e.detail, pd._pageServices));
          pd._svcSelectedIndex = pd._pageServices.length - 1;
          void renderSvcList(pd).then(() => pd._emitPageDataChanged());
        });
        pd._svcCatalogPicker = picker;
      }
      void picker.open();
    });
  }
}

/** 把合法 JS 标识符从任意字符串里清洗出来（用作服务函数名）。 */
function sanitizeSvcName(raw) {
  let s = String(raw || '').trim();
  /* 只保留字母数字下划线 $；首字符若非字母/_/$ 则加前缀。 */
  s = s.replace(/[^a-zA-Z0-9_$]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  if (!s) s = 'svc';
  if (!/^[a-zA-Z_$]/.test(s)) s = '_' + s;
  return s;
}

/**
 * 把服务目录条目投影成页面服务（快照，可在面板里继续微调）。
 * 字段对齐：type / url(保留 {{var}} 模板) / method / headers(对象→JSON 字符串) / bodyTemplate；
 * jsonrpc 时从 bodyTemplate 的 JSON 里提取 method 作为 rpcMethod。
 * @param {Record<string, any>} svc 服务目录条目
 * @param {Array<{name:string}>} existing 现有页面服务（用于去重命名）
 */
export function projectCatalogServiceToPageService(svc, existing = []) {
  const s = svc || {};
  /* 服务名：优先用 page 段（已是 kebab/标识友好），清洗成合法 JS 标识符；去重。 */
  let base = sanitizeSvcName(s.page || s.id || s.label);
  let name = base;
  const taken = new Set((existing || []).map((x) => x && x.name).filter(Boolean));
  let k = 2;
  while (taken.has(name)) { name = `${base}_${k}`; k++; }

  const type = ['rest', 'jsonrpc', 'websocket', 'graphql'].includes(s.type) ? s.type : 'rest';
  /* headers：目录给的是对象；面板存 JSON 字符串。空对象 → 空串。 */
  let headers = '';
  if (s.headers && typeof s.headers === 'object' && Object.keys(s.headers).length) {
    try { headers = JSON.stringify(s.headers); } catch { headers = ''; }
  }
  /* rpcMethod：jsonrpc 从 bodyTemplate JSON 里提取 method。 */
  let rpcMethod = '';
  if (type === 'jsonrpc' && s.bodyTemplate) {
    try {
      const parsed = JSON.parse(s.bodyTemplate);
      if (parsed && typeof parsed.method === 'string') rpcMethod = parsed.method;
    } catch { /* ignore */ }
  }
  /* graphql：从 bodyTemplate JSON 里抽 query / operationName。 */
  let gqlQuery = '';
  let gqlOperationName = '';
  if (type === 'graphql') {
    if (typeof s.gqlQuery === 'string') gqlQuery = s.gqlQuery;
    if (typeof s.gqlOperationName === 'string') gqlOperationName = s.gqlOperationName;
    if ((!gqlQuery || !gqlOperationName) && s.bodyTemplate) {
      try {
        const parsed = JSON.parse(s.bodyTemplate);
        if (parsed && typeof parsed.query === 'string' && !gqlQuery) gqlQuery = parsed.query;
        if (parsed && typeof parsed.operationName === 'string' && !gqlOperationName) gqlOperationName = parsed.operationName;
      } catch { /* ignore */ }
    }
  }
  return {
    name,
    type,
    url: s.url || '',                 // 保留 {{baseUrl}} 模板，运行时解析
    method: type === 'websocket' ? 'GET' : (type === 'graphql' ? 'POST' : (s.method || 'GET')),
    rpcMethod,
    gqlOperationName,
    gqlQuery,
    headers,
    bodyTemplate: type === 'graphql' ? '' : (s.bodyTemplate || ''),
    responseTo: '',
    responseTransform: '',
  };
}

export function updateSvcCardVis(pd, root, type, method) {
  if (!root) return;
  const isRest  = type === 'rest';
  const isRpc   = type === 'jsonrpc';
  const isWs    = type === 'websocket';
  const isGql   = type === 'graphql';
  const hasBody = isRpc || (isRest && ['POST', 'PUT', 'PATCH'].includes(method));
  const q = (sel) => root.querySelector(sel);
  const restRow = q('.svc-rest-row');
  const rpcRow = q('.svc-rpc-row');
  if (restRow) restRow.style.display = isRest ? '' : 'none';
  if (rpcRow) rpcRow.style.display = isRpc ? '' : 'none';
  const gqlOpRow = q('.svc-graphql-op-row');
  if (gqlOpRow) gqlOpRow.style.display = isGql ? '' : 'none';
  const gqlQueryRow = q('.svc-graphql-query-row');
  if (gqlQueryRow) gqlQueryRow.style.display = isGql ? 'flex' : 'none';
  const nonWs = q('.svc-non-ws-row');
  if (nonWs) nonWs.style.display = isWs ? 'none' : 'flex';
  const bodyRow = q('.svc-body-row');
  if (bodyRow) bodyRow.style.display = (hasBody && !isGql) ? 'flex' : 'none';
  const mapRow = q('.svc-resp-mapping-row');
  if (mapRow) mapRow.style.display = isWs ? 'none' : '';
  const trRow = q('.svc-resp-transform-row');
  if (trRow) trRow.style.display = isWs ? 'none' : 'flex';
}

export async function renderSvcList(pd) {
  const gen = ++pd._svcListGen;
  persistSvcEditorToModel(pd);
  pd._svcCmEditors.forEach((v) => {
    detachCodeMirrorResize(v);
    v.destroy();
  });
  pd._svcCmEditors = [];

  const sr = pd.shadowRoot;
  const split = sr.getElementById('svcSplit');
  const globalEmpty = sr.getElementById('svcGlobalEmpty');
  const list = sr.getElementById('svcList');
  const detailForm = sr.getElementById('svcDetailForm');
  const detailEmpty = sr.getElementById('svcDetailEmpty');

  if (!list || !split) return;

  if (!pd._pageServices.length) {
    split.style.display = 'none';
    if (globalEmpty) globalEmpty.style.display = '';
    if (detailForm) detailForm.hidden = true;
    if (detailEmpty) detailEmpty.hidden = true;
    list.innerHTML = '';
    pd._svcCmBoundIndex = -1;
    return;
  }

  if (globalEmpty) globalEmpty.style.display = 'none';
  split.style.display = 'flex';
  pd._svcSelectedIndex = Math.max(0, Math.min(pd._svcSelectedIndex | 0, pd._pageServices.length - 1));

  list.innerHTML = '';
  pd._pageServices.forEach((s, i) => {
    const row = document.createElement('div');
    row.className = 'sidebar-item-row';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sidebar-item' + (i === pd._svcSelectedIndex ? ' active' : '');
    btn.dataset.idx = String(i);
    btn.textContent = svcSidebarTitle(s);
    btn.addEventListener('click', () => {
      pd._svcSelectedIndex = i;
      void renderSvcList(pd).then(() => pd._emitPageDataChanged());
    });
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'del-row-btn sidebar-item-del';
    del.title = '删除';
    del.textContent = '×';
    del.addEventListener('click', (ev) => {
      ev.stopPropagation();
      persistSvcEditorToModel(pd);
      const wasSel = pd._svcSelectedIndex;
      pd._pageServices.splice(i, 1);
      if (wasSel === i) pd._svcSelectedIndex = Math.min(i, pd._pageServices.length - 1);
      else if (wasSel > i) pd._svcSelectedIndex--;
      void renderSvcList(pd).then(() => pd._emitPageDataChanged());
    });
    row.append(btn, del);
    list.appendChild(row);
  });

  const i = pd._svcSelectedIndex;
  const s = pd._pageServices[i];
  if (detailEmpty) detailEmpty.hidden = true;
  if (detailForm) {
    detailForm.hidden = false;
    sr.getElementById('svcDetailName').value = s.name || '';
    sr.getElementById('svcDetailType').value = s.type || 'rest';
    sr.getElementById('svcDetailUrl').value = s.url || '';
    sr.getElementById('svcDetailMethod').value = s.method || 'GET';
    sr.getElementById('svcDetailRpc').value = s.rpcMethod || '';
    sr.getElementById('svcDetailGqlOp').value = s.gqlOperationName || '';
    sr.getElementById('svcDetailGqlQuery').value = s.gqlQuery || '';
    sr.getElementById('svcDetailHeaders').value = s.headers || '';
    sr.getElementById('svcDetailBody').value = s.bodyTemplate || '';
    fillSvcRespToOptions(pd, sr.getElementById('svcDetailRespTo'));
    updateSvcCardVis(pd, detailForm, s.type, s.method);
  }

  const host = sr.getElementById('svcDetailCmHost');
  if (!host) {
    pd._svcCmBoundIndex = -1;
    return;
  }
  host.classList.add(CM_RESIZE_HOST_CLASS);
  const cm = await loadCodeMirrorJsBundle();
  if (gen !== pd._svcListGen || !host.isConnected) return;
  const view = createJsEditor(
    pd,
    cm,
    host,
    s.responseTransform || '',
    (code) => {
      if (pd._svcSelectedIndex >= 0 && pd._svcSelectedIndex < pd._pageServices.length) {
        pd._pageServices[pd._svcSelectedIndex].responseTransform = code;
      }
      pd._emitPageDataChanged();
    },
    (ctx) => svcTransformCompletionSource(pd, ctx),
  );
  if (gen !== pd._svcListGen) {
    detachCodeMirrorResize(view);
    view.destroy();
    return;
  }
  pd._svcCmEditors.push(view);
  pd._svcCmBoundIndex = i;
}

export function genServiceCode(s, hostRef = 'host') {
  const url = s.url;
  const H  = hostRef;

  // 只在需要请求体时加 Content-Type
  let headers = {};
  try { if (s.headers) headers = JSON.parse(s.headers); } catch (_) {}
  const hasBody = s.type === 'jsonrpc' || s.type === 'graphql' || (s.type === 'rest' && ['POST', 'PUT', 'PATCH'].includes(s.method));
  if (hasBody && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const headersJson = JSON.stringify(headers);

  if (s.type === 'rest') {
    const lines = [`${H}.${s.name} = async function ${s.name}(params, _opts) {`];
    lines.push(`  const _signal = _opts && _opts.signal;`);
    if (hasBody) {
      lines.push(`  const _headers = ${headersJson};`);
      if (s.bodyTemplate) {
        lines.push(`  const _body = Object.assign(${s.bodyTemplate}, params || {});`);
      } else {
        lines.push(`  const _body = Object.assign({}, params);`);
      }
      lines.push(`  const _init = { method: "${s.method}", headers: _headers, body: JSON.stringify(_body) };`);
      lines.push(`  if (_signal) _init.signal = _signal;`);
      lines.push(`  const _res = await fetch("${url}", _init);`);
    } else {
      // GET / DELETE：params 拼为 query string；URL 已含 ? 时用 &，否则用 ?
      const sep = String(url).indexOf('?') >= 0 ? '&' : '?';
      lines.push(`  const _qsRaw = params ? new URLSearchParams(params).toString() : "";`);
      lines.push(`  const _qs = _qsRaw ? ("${sep}" + _qsRaw) : "";`);
      if (Object.keys(headers).length) {
        lines.push(`  const _headers = ${headersJson};`);
        lines.push(`  const _init = { method: "${s.method}", headers: _headers };`);
      } else {
        lines.push(`  const _init = { method: "${s.method}" };`);
      }
      lines.push(`  if (_signal) _init.signal = _signal;`);
      lines.push(`  const _res = await fetch("${url}" + _qs, _init);`);
    }
    lines.push(`  if (!_res.ok) throw new Error(\`HTTP \${_res.status}: \${_res.statusText}\`);`);
    lines.push(`  return _res.json();`);
    lines.push('};');
    return lines;
  }

  if (s.type === 'jsonrpc') {
    const rpcMethod = s.rpcMethod || s.name;
    return [
      `${H}.${s.name} = async function ${s.name}(params, _opts) {`,
      `  const _signal = _opts && _opts.signal;`,
      `  const _headers = ${headersJson};`,
      `  const _payload = { jsonrpc: "2.0", method: "${rpcMethod}", params: Object.assign({}, params), id: Date.now() };`,
      `  const _init = { method: "POST", headers: _headers, body: JSON.stringify(_payload) };`,
      `  if (_signal) _init.signal = _signal;`,
      `  const _res = await fetch("${url}", _init);`,
      `  if (!_res.ok) throw new Error(\`HTTP \${_res.status}: \${_res.statusText}\`);`,
      `  const _data = await _res.json();`,
      `  if (_data.error) throw new Error(_data.error.message || "RPC Error");`,
      `  return _data.result;`,
      '};',
    ];
  }

  if (s.type === 'graphql') {
    const queryStr = JSON.stringify(String(s.gqlQuery || ''));
    const opNameStr = JSON.stringify(String(s.gqlOperationName || ''));
    return [
      `${H}.${s.name} = async function ${s.name}(params, _opts) {`,
      `  const _signal = _opts && _opts.signal;`,
      `  const _headers = ${headersJson};`,
      `  const _opName = ${opNameStr};`,
      `  const _payload = { query: ${queryStr}, variables: Object.assign({}, params) };`,
      `  if (_opName) _payload.operationName = _opName;`,
      `  const _init = { method: "POST", headers: _headers, body: JSON.stringify(_payload) };`,
      `  if (_signal) _init.signal = _signal;`,
      `  const _res = await fetch("${url}", _init);`,
      `  if (!_res.ok) throw new Error(\`HTTP \${_res.status}: \${_res.statusText}\`);`,
      `  const _data = await _res.json();`,
      `  if (_data.errors && _data.errors.length) throw new Error(_data.errors.map(e => e && e.message).filter(Boolean).join("; ") || "GraphQL Error");`,
      `  return _data.data;`,
      '};',
    ];
  }

  if (s.type === 'websocket') {
    const n = s.name;
    return [
      `let _ws_${n} = null;`,
      `${H}.${n}_connect = function ${n}_connect(onMessage) {`,
      `  _ws_${n} = new WebSocket("${url}");`,
      `  _ws_${n}.addEventListener("open",    () => console.log("[${n}] connected"));`,
      `  _ws_${n}.addEventListener("message", (e) => onMessage && onMessage(e.data));`,
      `  _ws_${n}.addEventListener("close",   () => { _ws_${n} = null; });`,
      `  _ws_${n}.addEventListener("error",   (e) => console.error("[${n}] error", e));`,
      `  return _ws_${n};`,
      '};',
      `${H}.${n}_send = function ${n}_send(data) {`,
      `  if (!_ws_${n} || _ws_${n}.readyState !== WebSocket.OPEN) throw new Error("[${n}] not connected");`,
      `  _ws_${n}.send(typeof data === "string" ? data : JSON.stringify(data));`,
      '};',
      `${H}.${n}_close = function ${n}_close() { _ws_${n}?.close(); };`,
    ];
  }

  return [];
}

/**
 * 仅返回 REST / JSON-RPC / GraphQL 服务函数的「函数体」字符串（不含外层 `function (...) { ... }` 包裹），
 * 供 {@link ../../utils/build-cmx-page-script-block.js} 用 `new AsyncFunction(...)` + `//# sourceURL=`
 * 重新打包，使每个服务在浏览器 DevTools 的 Sources 里独立显示为一份文件。
 *
 * 函数体可以假定作用域里有：`params`、`$data`、`host`（由 AsyncFunction 的形参列表提供）。
 *
 * @param {{
 *   name: string, type?: string, url?: string, method?: string,
 *   rpcMethod?: string, gqlOperationName?: string, gqlQuery?: string,
 *   headers?: string, bodyTemplate?: string,
 * }} s
 * @returns {string|null} 函数体字符串；类型为 websocket / 未识别时返回 null
 */
export function genServiceFnBody(s) {
  const url = s.url || '';
  let headers = {};
  try { if (s.headers) headers = JSON.parse(s.headers); } catch (_) {}
  const hasBody = s.type === 'jsonrpc' || s.type === 'graphql' || (s.type === 'rest' && ['POST', 'PUT', 'PATCH'].includes(s.method));
  if (hasBody && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const headersJson = JSON.stringify(headers);

  if (s.type === 'rest') {
    const lines = []
    lines.push(`const _signal = _opts && _opts.signal;`)
    if (hasBody) {
      lines.push(`const _headers = ${headersJson};`);
      if (s.bodyTemplate) {
        lines.push(`const _body = Object.assign(${s.bodyTemplate}, params || {});`);
      } else {
        lines.push(`const _body = Object.assign({}, params);`);
      }
      lines.push(`const _init = { method: "${s.method}", headers: _headers, body: JSON.stringify(_body) };`);
      lines.push(`if (_signal) _init.signal = _signal;`);
      lines.push(`const _res = await fetch("${url}", _init);`);
    } else {
      const sep = String(url).indexOf('?') >= 0 ? '&' : '?';
      lines.push(`const _qsRaw = params ? new URLSearchParams(params).toString() : "";`);
      lines.push(`const _qs = _qsRaw ? ("${sep}" + _qsRaw) : "";`);
      if (Object.keys(headers).length) {
        lines.push(`const _headers = ${headersJson};`);
        lines.push(`const _init = { method: "${s.method}", headers: _headers };`);
      } else {
        lines.push(`const _init = { method: "${s.method}" };`);
      }
      lines.push(`if (_signal) _init.signal = _signal;`);
      lines.push(`const _res = await fetch("${url}" + _qs, _init);`);
    }
    lines.push(`if (!_res.ok) throw new Error(\`HTTP \${_res.status}: \${_res.statusText}\`);`);
    lines.push(`return _res.json();`);
    return lines.join('\n');
  }

  if (s.type === 'jsonrpc') {
    const rpcMethod = s.rpcMethod || s.name;
    return [
      `const _signal = _opts && _opts.signal;`,
      `const _headers = ${headersJson};`,
      `const _payload = { jsonrpc: "2.0", method: "${rpcMethod}", params: Object.assign({}, params), id: Date.now() };`,
      `const _init = { method: "POST", headers: _headers, body: JSON.stringify(_payload) };`,
      `if (_signal) _init.signal = _signal;`,
      `const _res = await fetch("${url}", _init);`,
      `if (!_res.ok) throw new Error(\`HTTP \${_res.status}: \${_res.statusText}\`);`,
      `const _data = await _res.json();`,
      `if (_data.error) throw new Error(_data.error.message || "RPC Error");`,
      `return _data.result;`,
    ].join('\n');
  }

  if (s.type === 'graphql') {
    const queryStr = JSON.stringify(String(s.gqlQuery || ''));
    const opNameStr = JSON.stringify(String(s.gqlOperationName || ''));
    return [
      `const _signal = _opts && _opts.signal;`,
      `const _headers = ${headersJson};`,
      `const _opName = ${opNameStr};`,
      `const _payload = { query: ${queryStr}, variables: Object.assign({}, params) };`,
      `if (_opName) _payload.operationName = _opName;`,
      `const _init = { method: "POST", headers: _headers, body: JSON.stringify(_payload) };`,
      `if (_signal) _init.signal = _signal;`,
      `const _res = await fetch("${url}", _init);`,
      `if (!_res.ok) throw new Error(\`HTTP \${_res.status}: \${_res.statusText}\`);`,
      `const _data = await _res.json();`,
      `if (_data.errors && _data.errors.length) throw new Error(_data.errors.map(e => e && e.message).filter(Boolean).join("; ") || "GraphQL Error");`,
      `return _data.data;`,
    ].join('\n');
  }

  return null;
}
