import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/index.js', () => ({
  library: { defaultTheme: 'sap_horizon_dark' },
}));

import { buildCmxScriptBlockFromPageState } from '../utils/build-cmx-page-script-block.js';

describe('buildCmxScriptBlockFromPageState · interfaces', () => {
  it('always emits the interface contract section (defaults) even for empty input', () => {
    const out = buildCmxScriptBlockFromPageState({}, 'p');
    expect(out).toContain('host.markDirty');
    expect(out).toContain('host.markClean');
    expect(out).toContain('host.setBusy');
    expect(out).toContain('host.__cmxInitialData');
    expect(out).toMatch(/if \(typeof host\.isDirty !== "function"\)/);
    expect(out).toMatch(/if \(typeof host\.save !== "function"\)/);
  });

  it('injects default implementations when interfaces array is empty', () => {
    const out = buildCmxScriptBlockFromPageState({
      pageInterfaces: [{ name: 'save', enabled: false, body: '' }],
    }, 'home');
    expect(out).toMatch(/if \(typeof host\.isDirty !== "function"\)/);
    expect(out).toMatch(/if \(typeof host\.save !== "function"\)/);
  });

  it('user-active interface uses new Function + sourceURL with iface kind', () => {
    const out = buildCmxScriptBlockFromPageState({
      pageInterfaces: [
        { name: 'save', enabled: true, body: 'return { ok: true, data: { a: 1 } };' },
        { name: 'onMount', enabled: true, body: 'console.log("mounted");' },
      ],
    }, 'app.home');

    expect(out).toMatch(/host\.save\s*=\s*new Function\(/);
    expect(out).toContain('cmx://page-iface/app-home/save');
    expect(out).toMatch(/host\.onMount\s*=\s*new Function\(/);
    expect(out).toContain('cmx://page-iface/app-home/onMount');
    // default save body wrapper should NOT be present when user active
    expect(out).not.toMatch(/if \(typeof host\.save !== "function"\)/);
  });

  it('disconnectedCallback calls onDispose before __cmxDispose', () => {
    const out = buildCmxScriptBlockFromPageState({
      pageFns: [{ name: 'noop', params: '', body: '' }],
    }, 'a');
    const idxOnDispose = out.indexOf('this.onDispose');
    const idxCmxDispose = out.indexOf('this.__cmxDispose');
    expect(idxOnDispose).toBeGreaterThan(-1);
    expect(idxCmxDispose).toBeGreaterThan(idxOnDispose);
  });

  it('always declares $data fallback so fns without page-data still work', () => {
    const out = buildCmxScriptBlockFromPageState({
      pageFns: [{ name: 'foo', params: '', body: 'return 1' }],
    }, 'a');
    expect(out).toContain('var _$dataRaw = {};');
    expect(out).toContain('var $data = _$dataRaw;');
    expect(out).toMatch(/host\.foo\s*=\s*new Function\(/);
  });

  it('skips interfaces whose default is null and not enabled (onMount etc.)', () => {
    const out = buildCmxScriptBlockFromPageState({
      pageFns: [{ name: 'foo', params: '', body: '' }],
    }, 'a');
    // page-fns alone is enough to emit the script; interface block exists with defaults,
    // but onMount has defaultBody === null and not enabled → must NOT appear at all.
    expect(out).not.toMatch(/if \(typeof host\.onMount !== "function"\)/);
    expect(out).not.toMatch(/host\.onMount\s*=\s*new Function/);
  });
});

describe('buildCmxScriptBlockFromPageState · services', () => {
  it('REST service emits AsyncFunction + sourceURL so DevTools lists it separately', () => {
    const out = buildCmxScriptBlockFromPageState({
      pageServices: [
        { name: 'getOrders', type: 'rest', url: '/api/orders', method: 'GET', headers: '', bodyTemplate: '', responseTo: '', responseTransform: '' },
      ],
    }, 'app.demo');
    expect(out).toContain('__AsyncFunction');
    expect(out).toContain('cmx://page-service/app-demo/_getOrders_fetch');
    expect(out).toContain('cmx://page-service/app-demo/getOrders');
    expect(out).toMatch(/host\._getOrders_fetch\s*=\s*new __AsyncFunction\(/);
    expect(out).toMatch(/host\.getOrders\s*=\s*new __AsyncFunction\(/);
    // Should NOT still emit the old inline `async function getOrders(params) {` declaration
    expect(out).not.toMatch(/host\.getOrders\s*=\s*async function/);
  });

  it('REST with responseTransform emits xform sourceURL distinct from wrapper', () => {
    const out = buildCmxScriptBlockFromPageState({
      pageData: [{ name: 'orders', type: 'array', defaultValue: '[]' }],
      pageServices: [
        { name: 'createOrder', type: 'rest', url: '/api/orders', method: 'POST', headers: '', bodyTemplate: '', responseTo: 'orders', responseTransform: 'return data.items;' },
      ],
    }, 'app.demo');
    expect(out).toContain('cmx://page-service/app-demo/createOrder_xform');
    expect(out).toContain('cmx://page-service/app-demo/_createOrder_fetch');
    expect(out).toContain('cmx://page-service/app-demo/createOrder');
    expect(out).toMatch(/\$data\.orders\s*=\s*host\._createOrder_xform\.call\(host/);
  });

  it('JSON-RPC service also uses AsyncFunction + sourceURL', () => {
    const out = buildCmxScriptBlockFromPageState({
      pageServices: [
        { name: 'rpc', type: 'jsonrpc', url: '/rpc', rpcMethod: 'do.thing', headers: '', responseTo: '', responseTransform: '' },
      ],
    }, 'app.demo');
    expect(out).toContain('cmx://page-service/app-demo/_rpc_fetch');
    expect(out).toContain('cmx://page-service/app-demo/rpc');
    expect(out).toMatch(/host\._rpc_fetch\s*=\s*new __AsyncFunction\(/);
  });

  it('WebSocket service stays inline to preserve closure over _ws_<name>', () => {
    const out = buildCmxScriptBlockFromPageState({
      pageServices: [
        { name: 'live', type: 'websocket', url: 'wss://x', headers: '', responseTo: '', responseTransform: '' },
      ],
    }, 'app.demo');
    expect(out).toContain('let _ws_live = null;');
    expect(out).toMatch(/host\.live_connect\s*=\s*function live_connect/);
    expect(out).toMatch(/host\.live_send\s*=\s*function live_send/);
    expect(out).toMatch(/host\.live_close\s*=\s*function live_close/);
  });

  it('REST service accepts (params, _opts) and forwards _opts.signal into fetch init', () => {
    const out = buildCmxScriptBlockFromPageState({
      pageServices: [
        { name: 'getOrders', type: 'rest', url: '/api/orders', method: 'GET', headers: '', bodyTemplate: '', responseTo: '', responseTransform: '' },
      ],
    }, 'app.demo');
    /* outer wrapper signature includes _opts so callers can pass an AbortSignal */
    expect(out).toMatch(/new __AsyncFunction\("\$data", "host", "params", "_opts"/);
    /* inner _fetch body extracts signal and writes into fetch init */
    expect(out).toContain('const _signal = _opts && _opts.signal;');
    expect(out).toContain('if (_signal) _init.signal = _signal;');
    /* wrapper forwards opts to the inner fetch */
    expect(out).toContain('host._getOrders_fetch(params, _opts)');
  });

  it('REST POST service threads _signal into request init', () => {
    const out = buildCmxScriptBlockFromPageState({
      pageServices: [
        { name: 'createOrder', type: 'rest', url: '/api/orders', method: 'POST', headers: '', bodyTemplate: '', responseTo: '', responseTransform: '' },
      ],
    }, 'app.demo');
    expect(out).toContain('const _signal = _opts && _opts.signal;');
    expect(out).toContain('if (_signal) _init.signal = _signal;');
    /* POST init must include body + headers (string lives inside a JSON-stringified arg, so
       quotes appear escaped — match the unescaped key/value sequence loosely) */
    expect(out).toMatch(/_init = \{ method: \\?"POST\\?", headers: _headers, body: JSON\.stringify\(_body\) \}/);
  });

  it('JSON-RPC service threads _signal into POST init', () => {
    const out = buildCmxScriptBlockFromPageState({
      pageServices: [
        { name: 'rpc', type: 'jsonrpc', url: '/rpc', rpcMethod: 'do.thing', headers: '', responseTo: '', responseTransform: '' },
      ],
    }, 'app.demo');
    expect(out).toContain('const _signal = _opts && _opts.signal;');
    expect(out).toContain('if (_signal) _init.signal = _signal;');
  });

  it('GraphQL service threads _signal into POST init', () => {
    const out = buildCmxScriptBlockFromPageState({
      pageServices: [
        { name: 'gql', type: 'graphql', url: '/graphql', gqlQuery: 'query Q { x }', gqlOperationName: 'Q', headers: '', responseTo: '', responseTransform: '' },
      ],
    }, 'app.demo');
    expect(out).toContain('const _signal = _opts && _opts.signal;');
    expect(out).toContain('if (_signal) _init.signal = _signal;');
  });

  it('REST GET with query string in url uses & as separator instead of double ?', () => {
    const out = buildCmxScriptBlockFromPageState({
      pageServices: [
        { name: 'loadDimensions', type: 'rest', url: '/api/flexible-combination/config?domain=fi&scenario=account', method: 'GET', headers: '', bodyTemplate: '', responseTo: '', responseTransform: '' },
      ],
    }, 'app.demo');
    /* url already contains ? → params must be joined with & so we don't get `?...?q=…` (HTTP 400) */
    expect(out).toContain('_qs = _qsRaw ? (\\"&\\" + _qsRaw)');
    /* sanity: a url without ? still uses ? */
    const out2 = buildCmxScriptBlockFromPageState({
      pageServices: [
        { name: 'plain', type: 'rest', url: '/api/plain', method: 'GET', headers: '', bodyTemplate: '', responseTo: '', responseTransform: '' },
      ],
    }, 'app.demo');
    expect(out2).toContain('_qs = _qsRaw ? (\\"?\\" + _qsRaw)');
  });
});
