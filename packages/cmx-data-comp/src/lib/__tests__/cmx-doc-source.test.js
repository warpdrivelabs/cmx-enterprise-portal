import { describe, it, expect, vi } from 'vitest'
import { CmxDataSet } from '../cmx-data-set.js'
import { CmxMasterSlave } from '../cmx-master-slave.js'
import { ChangeSetCollector, loadDocData, saveDocData, saveDocDataBatch } from '../cmx-doc-source.js'

/**
 * 后端 ColumnarCodec 产出的列式包结构（§5.2），验证 fromJSON 能原样还原成主从树。
 */
function backendColumnarPackage () {
  return {
    datasetId: 'cv_header',
    columns: ['id', 'upper_id', 'total_dr'],
    rows: [
      ['H1', null, 100],
      ['H2', null, 50],
    ],
    childRows: {
      H1: {
        cv_line: {
          datasetId: 'cv_line',
          columns: ['id', 'upper_id', 'amount'],
          rows: [
            ['L1', 'H1', 60],
            ['L2', 'H1', 40],
          ],
        },
      },
    },
  }
}

describe('cmx-doc-source: 列式包还原', () => {
  it('fromJSON 把后端列式包还原为嵌套 CmxDataSet 主从树', () => {
    const ds = CmxDataSet.fromJSON(backendColumnarPackage())
    expect(ds.datasetId).toBe('cv_header')
    expect(ds.length).toBe(2)
    // 父行 H1 的 total_dr
    expect(ds.getRow('H1').total_dr).toBe(100)
    // 子层挂在 _children.cv_line
    const lines = ds.getRow('H1')._children.cv_line
    expect(lines).toBeTruthy()
    expect(lines.length).toBe(2)
    expect(lines.getRow('L1').amount).toBe(60)
    // H2 无子
    expect(ds.getRow('H2')._children.cv_line).toBeUndefined()
  })
})

describe('cmx-doc-source: ChangeSetCollector', () => {
  function buildCoord () {
    const ms = new CmxMasterSlave({
      schema: [{ id: 'cv_header', children: [{ id: 'cv_line' }] }],
    })
    const ds = CmxDataSet.fromJSON(backendColumnarPackage())
    ms.setDataSet({ cv_header: ds })
    return ms
  }

  it('捕获 updated（改字段）', () => {
    const ms = buildCoord()
    const cs = new ChangeSetCollector(ms).attach()
    // 改父行字段
    const header = ms.getRootDataSet('cv_header').getRow('H1')
    header.set('total_dr', 999)

    const changes = cs.export()
    expect(changes.cv_header).toBeTruthy()
    expect(changes.cv_header.updated).toHaveLength(1)
    expect(changes.cv_header.updated[0].id).toBe('H1')
    expect(changes.cv_header.updated[0].fields.total_dr).toBe(999)
    // B2：updated 行带 baseline 字段（本 fixture 无 update_time → null，后端退化不加锁）
    expect(changes.cv_header.updated[0]).toHaveProperty('baseline')
    expect(changes.cv_header.updated[0].baseline).toBeNull()
  })

  it('空 key 的 row-changed 不登记更新行（防 fields:{} 假对账冲突）', () => {
    const ms = buildCoord()
    const cs = new ChangeSetCollector(ms).attach()
    const ds = ms.getRootDataSet('cv_header')
    // 模拟"整行变化"类通知（key 为空）——旧实现只登记行不记键，导出 fields:{}
    ds._notifyChange(ds.getRow('H1'), null, null)
    ds._notifyChange(ds.getRow('H2'), undefined, undefined)
    expect(cs.export().cv_header).toBeUndefined()
  })

  it('导出时行已不在数据集 → 跳过该空字段行（防 fields:{} 假对账冲突）', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const ms = buildCoord()
      const cs = new ChangeSetCollector(ms).attach()
      // 直接登记一个数据集里不存在的行（模拟行丢失/脏标记残留）
      cs._onChanged('cv_header', { id: 'GONE' }, 'total_dr')
      expect(cs.export().cv_header).toBeUndefined()
      expect(warn).toHaveBeenCalledTimes(1)
    } finally {
      warn.mockRestore()
    }
  })

  it('数字 id（BIGINT 行）经 fromJSON 装载后收集器可正常取值（回归：索引裸数字键）', () => {
    // 单据装载（JSON/msgpack 同构）的行 id 是数字；曾因 fromJSON 索引裸数字入键，
    // getRow(String(id)) 查不到行 → 导出 fields 为空 →「回存对账失败」/静默零写。
    const pkg = {
      datasetId: 'cv_batch',
      columns: ['id', 'doc_type_id', 'update_time'],
      rows: [[10982000000, 'SA', '2026-08-24T00:00:00Z']],
      childRows: {
        '10982000000': {
          cv_header: {
            datasetId: 'cv_header',
            columns: ['id', 'upper_id', 'doc_type_id', 'update_time'],
            rows: [
              [10982000002, 10982000000, 'SA', '2026-08-24T00:00:00Z'],
              [10982000003, 10982000000, 'SA', '2026-08-24T00:00:00Z'],
            ],
          },
        },
      },
    }
    const ms = new CmxMasterSlave({
      schema: [{ id: 'cv_batch', children: [{ id: 'cv_header' }] }],
    })
    ms.setDataSet({ cv_batch: CmxDataSet.fromJSON(pkg) })
    const cs = new ChangeSetCollector(ms).attach()

    const header = ms.getRootDataSet('cv_batch').getRow(10982000000)._children.cv_header.getRow(10982000002)
    header.set('doc_type_id', 'AB')

    const changes = cs.export()
    expect(changes['cv_batch.cv_header'].updated).toHaveLength(1)
    expect(changes['cv_batch.cv_header'].updated[0].fields.doc_type_id).toBe('AB')
    expect(changes['cv_batch.cv_header'].updated[0].baseline).toBe('2026-08-24T00:00:00Z')
  })

  it('B2: updated 行带 update_time 基线（乐观锁）', () => {
    // 带 update_time 列的列式包 → 装载后行上有 update_time → export 回传为 baseline
    const pkg = {
      datasetId: 'cv_header',
      columns: ['id', 'upper_id', 'total_dr', 'update_time'],
      rows: [['H1', null, 100, '2026-07-08T01:02:03.123456Z']],
    }
    const ms = new CmxMasterSlave({ schema: [{ id: 'cv_header', children: [] }] })
    ms.setDataSet({ cv_header: CmxDataSet.fromJSON(pkg) })
    const cs = new ChangeSetCollector(ms).attach()
    ms.getRootDataSet('cv_header').getRow('H1').set('total_dr', 999)

    const u = cs.export().cv_header.updated[0]
    expect(u.baseline).toBe('2026-07-08T01:02:03.123456Z')
    // update_time 是只读技术列，不应出现在 fields（用户没改它）
    expect(u.fields).not.toHaveProperty('update_time')
  })

  it('B2: refreshBaselines 用新 update_time 刷新行基线', () => {
    const pkg = {
      datasetId: 'cv_header',
      columns: ['id', 'upper_id', 'update_time'],
      rows: [['H1', null, '2026-07-08T01:00:00Z']],
    }
    const ms = new CmxMasterSlave({ schema: [{ id: 'cv_header', children: [] }] })
    ms.setDataSet({ cv_header: CmxDataSet.fromJSON(pkg) })
    const cs = new ChangeSetCollector(ms).attach()

    cs.refreshBaselines([{ id: 'H1', updateTime: '2026-07-08T09:99:99Z' }])
    expect(ms.getRootDataSet('cv_header').getRow('H1').update_time).toBe('2026-07-08T09:99:99Z')
  })

  it('applyIdMap：临时id→真实id 替换 + upper_id 重路由 + inserted key 同步', () => {
    // 单层多行：H1（父，临时）+ H2/H3（临时，upper_id=H1）模拟父子引用
    const ms = new CmxMasterSlave({ schema: [{ id: 'cv_header', children: [] }] })
    const headerDs = CmxDataSet.fromJSON({
      datasetId: 'cv_header',
      columns: ['id', 'upper_id', 'amount'],
      rows: [
        ['H1', null, 0],
        ['H2', 'H1', 100],
        ['H3', 'H1', 200],
      ],
    })
    ms.setDataSet({ cv_header: headerDs })
    const cs = new ChangeSetCollector(ms).attach()

    // 新增一条临时行 H4（upper_id=H1），进 collector.inserted
    headerDs.addRow({ id: 'H4', upper_id: 'H1', amount: 300 })

    // 模拟后端 SaveResult.idMap：H1→1000, H2→2000, H3→2001, H4→2002
    cs.applyIdMap({ H1: 1000, H2: 2000, H3: 2001, H4: 2002 })

    // 1) 行 id 替换：H1→1000，且 _index key 同步（旧 id 查不到，新 id 查得到）
    expect(ms.getRow('cv_header', 1000)).toBeTruthy()
    expect(ms.getRow('cv_header', 'H1')).toBeNull()
    expect(ms.getRow('cv_header', 2002)).toBeTruthy()

    // 2) upper_id 重路由：H2/H3/H4 的 upper_id 从 H1 → 1000
    expect(ms.getRow('cv_header', 2000).upper_id).toBe(1000)
    expect(ms.getRow('cv_header', 2001).upper_id).toBe(1000)
    expect(ms.getRow('cv_header', 2002).upper_id).toBe(1000)

    // 3) collector.inserted 的 key 同步：H4→2002（后续 _onRemoved/_onChanged 按 row.id 查得到）
    const layer = cs.export()
    expect(layer.cv_header.inserted).toHaveLength(1)
    expect(layer.cv_header.inserted[0].id).toBe(2002)
    expect(layer.cv_header.inserted[0].upper_id).toBe(1000)
  })

  it('捕获 inserted（新增行）', () => {
    const ms = buildCoord()
    const cs = new ChangeSetCollector(ms).attach()
    ms.getRootDataSet('cv_header').addRow({ id: 'H3', total_dr: 7 })

    const changes = cs.export()
    expect(changes.cv_header.inserted).toHaveLength(1)
    expect(changes.cv_header.inserted[0].id).toBe('H3')
    expect(changes.cv_header.inserted[0].fields.total_dr).toBe(7)
  })

  it('捕获 deleted（删除已有行）', () => {
    const ms = buildCoord()
    const cs = new ChangeSetCollector(ms).attach()
    ms.getRootDataSet('cv_header').removeRow('H2')

    const changes = cs.export()
    expect(changes.cv_header.deleted).toContain('H2')
  })

  it('新增又删 → 净零（不回后端）', () => {
    const ms = buildCoord()
    const cs = new ChangeSetCollector(ms).attach()
    const ds = ms.getRootDataSet('cv_header')
    ds.addRow({ id: 'H9', total_dr: 1 })
    ds.removeRow('H9')

    const changes = cs.export()
    const layer = changes.cv_header || {}
    expect(layer.inserted || []).toHaveLength(0)
    expect((layer.deleted || [])).not.toContain('H9')
  })

  it('reset 清空累积；isDirty 反映状态', () => {
    const ms = buildCoord()
    const cs = new ChangeSetCollector(ms).attach()
    ms.getRootDataSet('cv_header').getRow('H1').set('total_dr', 1)
    expect(cs.isDirty()).toBe(true)
    cs.reset()
    expect(cs.isDirty()).toBe(false)
    expect(Object.keys(cs.export())).toHaveLength(0)
  })
})

describe('cmx-doc-source: saveDocData 兼容两种响应形态', () => {
  const DEF = { domain: 'fi', application: 'a', module: 'm', file: 'f.json', dbId: 'db' }
  // host.fetch 返回一个最小 Response（只需 json()/ok/status）
  const hostWith = (payload, status = 200) => ({
    fetch: async () => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => payload,
    }),
  })

  it('原始信封 { code:0, data } → 返回 data（直连后端 / html 模式）', async () => {
    const host = hostWith({ code: 0, data: { ok: true, mode: 'merge', affected: 3 } })
    const r = await saveDocData(host, DEF, { saveMode: 'merge', changes: {} })
    expect(r).toEqual({ ok: true, mode: 'merge', affected: 3 })
  })

  it('门户已拆信封的裸结果 { ok, affected }（无 code）→ 成功返回（native 模式，修复点）', async () => {
    // 门户拦截器成功时把信封拆成裸 data + HTTP 200，无 code 字段
    const host = hostWith({ ok: true, mode: 'merge', affected: 2 }, 200)
    const r = await saveDocData(host, DEF, { saveMode: 'merge', changes: {} })
    expect(r).toEqual({ ok: true, mode: 'merge', affected: 2 })
  })

  it('原始信封业务错误 { code:1, msg } → 抛错', async () => {
    const host = hostWith({ code: 1, msg: '回存对账失败' })
    await expect(saveDocData(host, DEF, { saveMode: 'merge', changes: {} }))
      .rejects.toThrow(/回存对账失败/)
  })

  it('门户拦截器映射的业务错误（HTTP 4xx + { error }）→ 抛错（native 错误路径）', async () => {
    const host = hostWith({ error: '回存对账失败', code: 1 }, 400)
    await expect(saveDocData(host, DEF, { saveMode: 'merge', changes: {} }))
      .rejects.toThrow(/回存对账失败/)
  })

  it('B2: HTTP 409 → 抛冲突错误（err.conflict=true）', async () => {
    const host = hostWith({ error: '单据已被他人修改，请刷新后重试（乐观锁冲突）' }, 409)
    await expect(saveDocData(host, DEF, { saveMode: 'merge', changes: {} }))
      .rejects.toMatchObject({ conflict: true })
  })

  it('B2: 成功响应带 updatedAt → 调 collector.refreshBaselines', async () => {
    const host = hostWith({ ok: true, mode: 'merge', affected: 1, updatedAt: [{ id: 'H1', updateTime: '2026-07-08T09:00:00Z' }] }, 200)
    let got = null
    const collector = { refreshBaselines: (u) => { got = u } }
    const r = await saveDocData(host, DEF, { saveMode: 'merge', changes: {}, collector })
    expect(r.affected).toBe(1)
    expect(got).toEqual([{ id: 'H1', updateTime: '2026-07-08T09:00:00Z' }])
  })

  it('成功响应带 idMap → 调 collector.applyIdMap（临时id换真实id）', async () => {
    const host = hostWith({ ok: true, mode: 'merge', affected: 1, idMap: { b1: 9001, h1: 9002 } }, 200)
    let got = null
    const collector = { applyIdMap: (m) => { got = m } }
    const r = await saveDocData(host, DEF, { saveMode: 'merge', changes: {}, collector })
    expect(r.idMap).toEqual({ b1: 9001, h1: 9002 })
    expect(got).toEqual({ b1: 9001, h1: 9002 })
  })

  it('响应无 idMap 时不调 applyIdMap（向后兼容）', async () => {
    const host = hostWith({ ok: true, mode: 'merge', affected: 1 }, 200)
    let called = false
    const collector = { applyIdMap: () => { called = true } }
    await saveDocData(host, DEF, { saveMode: 'merge', changes: {}, collector })
    expect(called).toBe(false)
  })
})

describe('cmx-doc-source: saveDocDataBatch 批量保存（方案 F）', () => {
  const hostWith = (payload, status = 200) => ({
    fetch: async (url, opts) => {
      // 断言打到批量端点 + body 结构
      expect(url).toMatch(/\/save\/batch$/)
      const b = JSON.parse(opts.body)
      expect(Array.isArray(b.docs)).toBe(true)
      return { ok: status >= 200 && status < 300, status, json: async () => payload }
    },
  })

  it('成功 → 返回 results，逐单基线刷新', async () => {
    const payload = {
      atomic: true,
      count: 2,
      results: [
        { index: 0, ok: true, mode: 'merge', affected: 1, updatedAt: [{ id: 'A', updateTime: 't1' }] },
        { index: 1, ok: true, mode: 'merge', affected: 2, updatedAt: [{ id: 'B', updateTime: 't2' }] },
      ],
    }
    const host = hostWith(payload, 200)
    const refreshed = []
    const collector = { refreshBaselines: (u) => refreshed.push(...u) }
    const r = await saveDocDataBatch(host, {
      atomic: true,
      docs: [{ file: 'x.json', changes: {} }, { file: 'y.json', changes: {} }],
      collector,
    })
    expect(r.count).toBe(2)
    expect(refreshed).toEqual([{ id: 'A', updateTime: 't1' }, { id: 'B', updateTime: 't2' }])
  })

  it('atomic 冲突 → HTTP 409 抛 err.conflict=true', async () => {
    const host = hostWith({ error: '第 2 单保存失败: 单据已被他人修改' }, 409)
    await expect(saveDocDataBatch(host, { atomic: true, docs: [{ file: 'x.json', changes: {} }] }))
      .rejects.toMatchObject({ conflict: true })
  })
})

describe('cmx-doc-source: loadDocData URL 拼接', () => {
  // 最小列式包：根层 cv_batch 单行，无子表。loadDocData 用 CmxDataSet.fromJSON 还原后返回 { dsMap, pkg }。
  const minimalPkg = () => ({
    datasetId: 'cv_batch',
    columns: ['id', 'name'],
    rows: [['B1', 'x']],
    childRows: {},
  })
  // 捕获请求 URL 的 host（GET 走 json()）
  const spyHost = (pkg) => {
    let calledUrl = null
    return {
      _url: () => calledUrl,
      fetch: async (url) => {
        calledUrl = url
        return { ok: true, status: 200, json: async () => pkg }
      },
    }
  }

  it('省略 file → URL 不含 file 参数（后端自动解析默认 DOC 定义）', async () => {
    const host = spyHost(minimalPkg())
    await loadDocData(host, { domain: 'fi', application: 'cmxfico', module: 'gl', limit: 50 })
    const url = host._url()
    expect(url).toMatch(/[?&]domain=fi/)
    expect(url).toMatch(/[?&]module=gl/)
    expect(url).not.toMatch(/[?&]file=/)
  })

  it('file 为 undefined（脏值）→ URL 同样不含 file', async () => {
    const host = spyHost(minimalPkg())
    await loadDocData(host, { domain: 'fi', application: 'cmxfico', module: 'gl', file: undefined })
    expect(host._url()).not.toMatch(/[?&]file=/)
  })

  it('显式 file → URL 带上 file 参数', async () => {
    const host = spyHost(minimalPkg())
    await loadDocData(host, {
      domain: 'fi', application: 'cmxfico', module: 'gl',
      file: 'cmxfico_doc_meta_v1.json', limit: 5,
    })
    expect(host._url()).toMatch(/[?&]file=cmxfico_doc_meta_v1\.json/)
  })
})


describe('cmx-doc-source: loadDocData 错误路径', () => {
  /**
   * 回归：门户 fetch 拦截器把业务错误映射为非 2xx + {error, msg}；旧 _unwrapPkg
   * 只读 body.msg（且不查 res.ok）→ error 文案丢失，用户只看到裸状态码。
   */
  const errHost = (status, body, statusText = '') => ({
    fetch: async () => ({
      ok: status >= 200 && status < 300, status, statusText,
      json: async () => body,
    }),
  })
  const def = { domain: 'fi', application: 'cmxfico', module: 'gl' }

  it('HTTP 400 + {error}（门户拦截器形态）→ 抛错带后端 error 文案', async () => {
    await expect(loadDocData(errHost(400, { error: '单据定义不存在', code: 40400 }), def))
      .rejects.toThrow('单据定义不存在')
  })

  it('HTTP 502 非 JSON body → 抛错含状态码与 statusText', async () => {
    await expect(loadDocData(errHost(502, null, 'Bad Gateway'), def))
      .rejects.toThrow('HTTP 502 Bad Gateway')
  })

  it('HTTP 200 信封 code!==0 → 抛信封 msg', async () => {
    await expect(loadDocData(errHost(200, { code: 500, msg: '后端内部错误' }), def))
      .rejects.toThrow('后端内部错误')
  })

  it('HTTP 200 信封 code!==0 且只有 error 字段 → 双字段兜底可读到', async () => {
    await expect(loadDocData(errHost(200, { code: 404, error: '定义文件缺失' }), def))
      .rejects.toThrow('定义文件缺失')
  })
})
