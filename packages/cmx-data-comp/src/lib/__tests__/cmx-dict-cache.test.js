import { describe, it, expect, vi } from 'vitest'
import { CmxDictCache, collectRefDicts, makeDictResolver } from '../cmx-dict-cache.js'

/** 模拟 host.fetch：按 URL query 里的 dict 参数返回该字典的全量行（新 /api/dct/data/search 契约）。
 *  新接口逐典并发拉取，响应 { code, data:{ rows, total } }。 */
function mockHost (dictData) {
  return {
    fetch: async (url, _opts) => {
      // 从 query 取 dict 参数；dictData 以 dictId 为键。
      const m = String(url).match(/[?&]dict=([^&]+)/)
      const dictId = m ? decodeURIComponent(m[1]) : ''
      const bucket = dictData[dictId] || { rows: [] }
      const rows = Array.isArray(bucket?.rows) ? bucket.rows : (Array.isArray(bucket) ? bucket : [])
      return {
        ok: true,
        json: async () => ({ code: 0, msg: 'ok', data: { rows, total: rows.length, page: 1, pageSize: rows.length } }),
      }
    },
  }
}

describe('cmx-dict-cache: L0 维度解析', () => {
  it('loadDicts 逐典装载并建 key→entry 映射，resolve 返回 name', async () => {
    const host = mockHost({
      gl_account: {
        rows: [
          { code: '1122', name: '应收账款', category: '资产' },
          { code: '2221', name: '应交税费', category: '负债' },
        ],
        total: 2,
      },
    })
    const cache = new CmxDictCache({ coord: { domain: 'fi', application: 'cmxfico', module: 'gl' } })
    await cache.loadDicts(host, ['gl_account'])

    expect(cache.has('gl_account')).toBe(true)
    // id→name
    expect(cache.resolve('gl_account', '1122')).toBe('应收账款')
    // to attribute（displayField=category）
    expect(cache.resolve('gl_account', '2221', 'category')).toBe('负债')
    // 未命中优雅降级返回原 key
    expect(cache.resolve('gl_account', '9999')).toBe('9999')
    expect(cache.resolve('unknown_dict', 'x')).toBe('x')
  })

  it('resolveMany 一次带出多属性', async () => {
    const host = mockHost({
      client: { rows: [{ code: 'C1', name: '甲公司', region: '华东' }] },
    })
    const cache = new CmxDictCache({ keyField: 'code' })
    await cache.loadDicts(host, ['client'])
    const attrs = cache.resolveMany('client', 'C1', ['name', 'region'])
    expect(attrs).toEqual({ name: '甲公司', region: '华东' })
  })

  it('per-dict keyField/labelField 覆盖默认', async () => {
    const host = mockHost({
      emp: { rows: [{ id: 'E1', full_name: '张三' }] },
    })
    const cache = new CmxDictCache()
    await cache.loadDicts(host, [{ dictId: 'emp', keyField: 'id', labelField: 'full_name' }])
    expect(cache.resolve('emp', 'E1')).toBe('张三')
  })

  it('已缓存的字典不重复拉取', async () => {
    let calls = 0
    const host = {
      fetch: async () => {
        calls++
        return { ok: true, json: async () => ({ code: 0, data: { rows: [{ code: 'x', name: 'X' }] } }) }
      },
    }
    const cache = new CmxDictCache()
    await cache.loadDicts(host, ['d'])
    await cache.loadDicts(host, ['d'])   // 第二次应跳过
    expect(calls).toBe(1)
  })

  it('invalidate 后可重拉', async () => {
    const host = mockHost({ d: { rows: [{ code: 'x', name: 'X' }] } })
    const cache = new CmxDictCache()
    await cache.loadDicts(host, ['d'])
    expect(cache.has('d')).toBe(true)
    cache.invalidate('d')
    expect(cache.has('d')).toBe(false)
  })
})

describe('collectRefDicts', () => {
  it('从单据定义 voucherTables 收集去重 refDict', () => {
    const doc = {
      voucherTables: [
        { fields: [
          { name: 'gl_account_id', refDict: 'gl_account', refField: 'code', displayField: 'name' },
          { name: 'client_id', refDict: 'client', refField: 'code' },
        ] },
        { fields: [
          { name: 'acc2', refDict: 'gl_account' },   // 重复，去重
          { name: 'plain' },                          // 无 refDict，忽略
        ] },
      ],
    }
    const dicts = collectRefDicts(doc)
    const ids = dicts.map((d) => d.dictId).sort()
    expect(ids).toEqual(['client', 'gl_account'])
    const acc = dicts.find((d) => d.dictId === 'gl_account')
    expect(acc.keyField).toBe('code')
    expect(acc.labelField).toBe('name')
  })

  it('接受字段数组输入', () => {
    const dicts = collectRefDicts([{ refDict: 'a' }, { refDict: 'b' }, { name: 'x' }])
    expect(dicts.map((d) => d.dictId).sort()).toEqual(['a', 'b'])
  })
})

describe('makeDictResolver', () => {
  it('生成绑定解析函数', async () => {
    const host = mockHost({ d: { rows: [{ code: '1', name: '一' }] } })
    const cache = new CmxDictCache()
    await cache.loadDicts(host, ['d'])
    const fn = makeDictResolver(cache, 'd', 'name')
    expect(fn('1')).toBe('一')
    expect(fn('9')).toBe('9')
  })
})

describe('cmx-dict-cache: 失败不缓存（重试语义）', () => {
  /**
   * 回归：旧实现失败也写空典缓存 → loadDicts 的 need 过滤永久跳过该典，
   * 列一直显示原始 id 且无重试机会。现在失败不写缓存，下次装载重试。
   */
  it('HTTP 失败 → 不写缓存；重试成功后可解析', async () => {
    let fail = true
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const host = {
        fetch: async () => {
          if (fail) return { ok: false, status: 500, json: async () => ({ error: 'boom' }) }
          return { ok: true, json: async () => ({ code: 0, data: { rows: [{ code: 'A', name: '甲' }], total: 1 } }) }
        },
      }
      const cache = new CmxDictCache()
      await cache.loadDicts(host, ['d1'])
      expect(cache.has('d1')).toBe(false)        // 失败不写空典
      expect(cache.resolve('d1', 'A')).toBe('A') // 未缓存优雅降级返回原 key
      fail = false
      await cache.loadDicts(host, ['d1'])        // 重试（need 过滤不再跳过）
      expect(cache.has('d1')).toBe(true)
      expect(cache.resolve('d1', 'A')).toBe('甲')
    } finally {
      warn.mockRestore()
    }
  })

  it('信封 code!==0（HTTP 200）→ 同样不写缓存', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const host = { fetch: async () => ({ ok: true, json: async () => ({ code: 500, msg: '内部错误' }) }) }
      const cache = new CmxDictCache()
      await cache.loadDicts(host, ['d2'])
      expect(cache.has('d2')).toBe(false)
    } finally {
      warn.mockRestore()
    }
  })

  it('fetch 网络异常 → 同样不写缓存', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const host = { fetch: async () => { throw new Error('network down') } }
      const cache = new CmxDictCache()
      await cache.loadDicts(host, ['d3'])
      expect(cache.has('d3')).toBe(false)
    } finally {
      warn.mockRestore()
    }
  })
})
