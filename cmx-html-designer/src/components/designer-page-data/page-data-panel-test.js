import { escapeAttr } from '../../utils/html-utils.js';
import { PAGE_DATA_STRINGS } from './page-data-static-strings.js';

export function setTestData(pd, fns, svcs) {
  pd._testFns  = fns  || [];
  pd._testSvcs = svcs || [];
  renderTestPanel(pd);
}

export function bindTestPanel(pd) {
  const sr = pd.shadowRoot;
  sr.getElementById('testTypeSelect').addEventListener('change', () => renderTestTargets(pd));
  sr.getElementById('testRunBtn').addEventListener('click', () => runTest(pd));
  renderTestPanel(pd);
}

export function renderTestPanel(pd) {
  renderTestTargets(pd);
}

export function renderTestTargets(pd) {
  const sr           = pd.shadowRoot;
  const typeSelect   = sr.getElementById('testTypeSelect');
  const targetSelect = sr.getElementById('testTargetSelect');
  if (!typeSelect || !targetSelect) return;
  const items = typeSelect.value === 'fn' ? (pd._testFns || []) : (pd._testSvcs || []);
  targetSelect.innerHTML = `<option value="">${PAGE_DATA_STRINGS.testSelectPlaceholder}</option>` +
    items.filter(x => x.name)
         .map(x => `<option value="${escapeAttr(x.name)}">${escapeAttr(x.name)}</option>`)
         .join('');
}

export async function runTest(pd) {
  const sr         = pd.shadowRoot;
  const typeSelect = sr.getElementById('testTypeSelect');
  const targetSel  = sr.getElementById('testTargetSelect');
  const paramsInp  = sr.getElementById('testParamsInput');
  const resultBox  = sr.getElementById('testResultBox');
  const dot        = sr.getElementById('testStatusDot');
  const statusTxt  = sr.getElementById('testStatusText');

  const targetName = targetSel.value;
  if (!targetName) {
    resultBox.textContent = PAGE_DATA_STRINGS.testPickTargetFirst;
    resultBox.className   = 'test-result-box error';
    return;
  }

  let params = {};
  try {
    const raw = paramsInp.value.trim();
    params = raw ? JSON.parse(raw) : {};
  } catch (e) {
    resultBox.textContent = `${PAGE_DATA_STRINGS.testJsonParseErrorPrefix}${e.message}`;
    resultBox.className   = 'test-result-box error';
    return;
  }

  dot.className         = 'test-status-dot running';
  statusTxt.textContent = PAGE_DATA_STRINGS.testStatusRunning;
  resultBox.textContent = '';
  resultBox.className   = 'test-result-box';

  try {
    let result;
    if (typeSelect.value === 'fn') {
      const f = pd._testFns.find(x => x.name === targetName);
      if (!f) throw new Error(PAGE_DATA_STRINGS.testFnNotFound(targetName));
      const fn = new Function(f.params || '_params', f.body || '');
      result = await fn(params);
    } else {
      const s = pd._testSvcs.find(x => x.name === targetName);
      if (!s) throw new Error(PAGE_DATA_STRINGS.testSvcNotFound(targetName));
      if (s.type === 'websocket') throw new Error(PAGE_DATA_STRINGS.testWsNotSupported);
      result = await callService(pd, s, params);
    }

    const display = result === undefined ? PAGE_DATA_STRINGS.testResultNone
      : typeof result === 'string' ? result
      : JSON.stringify(result, null, 2);
    resultBox.textContent = display;
    resultBox.className   = 'test-result-box success';
    dot.className         = 'test-status-dot success';
    statusTxt.textContent = PAGE_DATA_STRINGS.testStatusSuccess;
  } catch (err) {
    resultBox.textContent = `${PAGE_DATA_STRINGS.testErrorPrefix}${err.message}`;
    resultBox.className   = 'test-result-box error';
    dot.className         = 'test-status-dot error';
    statusTxt.textContent = PAGE_DATA_STRINGS.testStatusFail;
  }
}

export async function callService(pd, s, params) {
  let headers = {};
  try { if (s.headers) headers = JSON.parse(s.headers); } catch (_) {}
  const hasBody = s.type === 'jsonrpc' || s.type === 'graphql' || (s.type === 'rest' && ['POST','PUT','PATCH'].includes(s.method));
  if (hasBody && !headers['Content-Type']) headers['Content-Type'] = 'application/json';

  if (s.type === 'rest') {
    let url  = s.url;
    let opts;
    if (hasBody) {
      let body = {};
      try { if (s.bodyTemplate) body = JSON.parse(s.bodyTemplate); } catch (_) {}
      Object.assign(body, params);
      opts = { method: s.method, headers, body: JSON.stringify(body) };
    } else {
      const qs = Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : '';
      url  = url + qs;
      opts = { method: s.method, headers };
    }
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    return ct.includes('json') ? res.json() : res.text();
  }

  if (s.type === 'jsonrpc') {
    const rpcMethod = s.rpcMethod || s.name;
    const payload   = { jsonrpc: '2.0', method: rpcMethod, params: Object.assign({}, params), id: Date.now() };
    const res       = await fetch(s.url, { method: 'POST', headers, body: JSON.stringify(payload) });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || 'RPC Error');
    return data.result;
  }

  if (s.type === 'graphql') {
    const payload = { query: String(s.gqlQuery || ''), variables: Object.assign({}, params) };
    const opName  = String(s.gqlOperationName || '');
    if (opName) payload.operationName = opName;
    const res = await fetch(s.url, { method: 'POST', headers, body: JSON.stringify(payload) });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const data = await res.json();
    if (data.errors && data.errors.length) {
      throw new Error(data.errors.map(e => e && e.message).filter(Boolean).join('; ') || 'GraphQL Error');
    }
    return data.data;
  }

  throw new Error(PAGE_DATA_STRINGS.unknownSvcType(s.type));
}
