// cmx-page-helpers 单元测试：转义语义（最严格版五字符全转）与 apiJson 信封解包 /
// 错误透传契约——原生页面逐页替换（治理清单 B-03/B-04）依赖这些行为分毫不差。

import { describe, it, expect, vi, afterEach } from 'vitest'
import { escHtml, escAttr, apiJson, apiGet, apiPost } from '../cmx-page-helpers.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

/** 构造 fetch 桩：记录收到的 (url, init)，按脚本依次回放响应。 */
function stubFetch (script) {
  const calls = []
  let i = 0
  vi.stubGlobal('fetch', async (url, init) => {
    calls.push({ url, init })
    const step = script[Math.min(i++, script.length - 1)]
    return {
      ok: step.ok !== false,
      status: step.status || 200,
      json: async () => step.body,
    }
  })
  return calls
}

describe('escHtml / escAttr', () => {
  it('五类敏感字符全转（& < > " \'），与历史最宽松变体对齐', () => {
    expect(escHtml('<a href="x" class=\'y\'>&amp;</a>'))
      .toBe('&lt;a href=&quot;x&quot; class=&#39;y&#39;&gt;&amp;amp;&lt;/a&gt;')
  })

  it('null / undefined / 数字 / 对象按 String 收敛（null 与 undefined 为空串）', () => {
    expect(escHtml(null)).toBe('')
    expect(escHtml(undefined)).toBe('')
    expect(escHtml(0)).toBe('0')
    expect(escHtml({ a: 1 })).toBe('[object Object]')
  })

  it('escAttr 与 escHtml 同语义（属性上下文专用名）', () => {
    expect(escAttr('a"b\'c&<d>')).toBe(escHtml('a"b\'c&<d>'))
  })
})

describe('apiJson', () => {
  it('信封 {code:0,data} 解包返回 data；apiBase 前缀 + authHeaders + fetchInit 合并', async () => {
    const calls = stubFetch([{ body: { code: 0, msg: 'ok', data: { rows: [1, 2] } } }])
    const out = await apiJson('/api/x/list', { method: 'POST', body: '{}' }, {
      apiBase: 'https://svc.example',
      fetchInit: { credentials: 'omit' },
      authHeaders: () => ({ Authorization: 'Bearer t' }),
    })
    expect(out).toEqual({ rows: [1, 2] })
    expect(calls[0].url).toBe('https://svc.example/api/x/list')
    expect(calls[0].init.credentials).toBe('omit')
    expect(calls[0].init.headers.Accept).toBe('application/json')
    expect(calls[0].init.headers.Authorization).toBe('Bearer t')
  })

  it('无 data 字段的响应原样返回 body', async () => {
    stubFetch([{ body: { hello: 'world' } }])
    await expect(apiJson('/api/ping')).resolves.toEqual({ hello: 'world' })
  })

  it('业务 code !== 0 抛错：透传 msg，挂 .status 与 .body', async () => {
    stubFetch([{ body: { code: 40901, msg: '编码规则不存在' } }])
    const err = await apiJson('/api/x').catch((e) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toBe('编码规则不存在')
    expect(err.status).toBe(200)
    expect(err.body.code).toBe(40901)
  })

  it('HTTP 非 2xx：优先 body.error（cmx_api_types 双字段名），兜底 HTTP 状态', async () => {
    stubFetch([
      { ok: false, status: 400, body: { error: '参数缺失' } },
      { ok: false, status: 502, body: null },
    ])
    await expect(apiJson('/api/x')).rejects.toThrow('参数缺失')
    await expect(apiJson('/api/x')).rejects.toThrow('HTTP 502')
  })

  it('业务错误无 msg 时回退「业务错误 N」（mdm 变体语义，比 HTTP 200 更可诊断）', async () => {
    stubFetch([{ body: { code: 500, msg: '' } }])
    await expect(apiJson('/api/x')).rejects.toThrow('业务错误 500')
  })

  it('结构化错误契约：code/conflict(409)/violations(data.violations 平铺与顶层两种形态)', async () => {
    stubFetch([
      { ok: false, status: 409, body: { error: '已他人修改', msg: '已他人修改', code: 409 } },
      { ok: false, status: 400, body: { error: '校验失败', code: 1001, data: { violations: [{ field: 'name', message: '必填' }] } } },
      { ok: false, status: 400, body: { error: '校验失败', code: 1002, violations: [{ field: 'code', message: '重复' }] } },
    ])
    const e1 = await apiJson('/api/x').catch((e) => e)
    expect(e1.conflict).toBe(true)
    expect(e1.code).toBe(409)
    const e2 = await apiJson('/api/x').catch((e) => e)
    expect(e2.validation).toBe(true)
    expect(e2.violations).toEqual([{ field: 'name', message: '必填' }])
    const e3 = await apiJson('/api/x').catch((e) => e)
    expect(e3.violations).toEqual([{ field: 'code', message: '重复' }])
    expect(e3.conflict).toBeUndefined()
  })
})

describe('apiGet / apiPost', () => {
  it('apiGet：dbId 非空带 db_id 请求头，空则不带', async () => {
    const calls = stubFetch([{ body: { code: 0, data: [] } }])
    await apiGet('/api/dct/list', 'db2')
    await apiGet('/api/dct/list')
    expect(calls[0].init.headers.db_id).toBe('db2')
    expect(calls[1].init.headers.db_id).toBeUndefined()
  })

  it('apiPost：POST + JSON 序列化 + db_id 请求头', async () => {
    const calls = stubFetch([{ body: { code: 0, data: { id: 9 } } }])
    const out = await apiPost('/api/dct/save', { name: 'x' }, 'db3')
    expect(out).toEqual({ id: 9 })
    expect(calls[0].init.method).toBe('POST')
    expect(calls[0].init.headers['Content-Type']).toBe('application/json')
    expect(calls[0].init.headers.db_id).toBe('db3')
    expect(calls[0].init.body).toBe('{"name":"x"}')
  })
})
