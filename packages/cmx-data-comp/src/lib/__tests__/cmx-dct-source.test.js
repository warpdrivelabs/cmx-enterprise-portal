import { describe, it, expect } from 'vitest'
import { loadDictData } from '../cmx-dct-source.js'

/**
 * loadDictData 错误路径回归：门户 fetch 拦截器把业务错误映射为非 2xx + {error, msg}，
 * 旧 _unwrapDictPkg 把该 body 当「已拆信封裸包」返回 → loadDictData 退化成空数据集，
 * 表格静默空白无任何提示。现在必须抛带后端文案的错误。
 */
describe('cmx-dct-source: loadDictData 错误路径', () => {
  const host = (status, body) => ({
    fetch: async () => ({
      ok: status < 400, status, statusText: 'Bad Request',
      json: async () => body,
    }),
  })
  const def = { dict: 'gl_account', binary: false }

  it('HTTP 400 + {error}（门户拦截器形态）→ 抛错带后端文案，而非返回空数据集', async () => {
    await expect(loadDictData(host(400, { error: '字典不存在', code: 40400 }), def))
      .rejects.toThrow('字典不存在')
  })

  it('HTTP 500 非 JSON body → 抛错含状态码', async () => {
    await expect(loadDictData(host(500, null), def))
      .rejects.toThrow('500')
  })

  it('HTTP 200 信封 code!==0 → 抛信封 msg（对齐 saveDictData 的双字段读取）', async () => {
    await expect(loadDictData(host(200, { code: 500, msg: '后端内部错误' }), def))
      .rejects.toThrow('后端内部错误')
  })

  it('信封 code!==0 且只有 error 字段 → 也能读到（双字段兜底）', async () => {
    await expect(loadDictData(host(200, { code: 404, error: '元数据缺失' }), def))
      .rejects.toThrow('元数据缺失')
  })
})
