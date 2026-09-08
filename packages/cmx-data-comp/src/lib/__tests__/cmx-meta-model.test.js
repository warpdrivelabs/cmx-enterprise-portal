import { describe, expect, it } from 'vitest'
import { CmxDCTMeta } from '../cmx-dct-meta.js'
import { CmxDOCMeta } from '../cmx-doc-meta.js'
import { loadMetaBatch, loadMetaModelsBatch } from '../cmx-meta-model.js'

const baseMeta = {
  fieldSets: {
    common: {
      fields: [
        { fieldName: 'id', dataType: 'BIGINT' },
        { fieldName: 'code', dataType: 'VARCHAR' },
      ],
    },
  },
}

describe('CmxDCTMeta', () => {
  it('loads dictionary tables and expands shared fieldSets without cloning fields', () => {
    const model = new CmxDCTMeta({
      json: {
        moduleMeta: { moduleCode: 'GL', version: 1 },
        fieldSets: baseMeta.fieldSets,
        dictionaryTables: [
          {
            dictMeta: { dictCode: 'currency', dictName: '币种', tableName: 'gl_currency' },
            baseFieldSet: 'common',
            fields: [{ fieldName: 'symbol', dataType: 'VARCHAR' }],
          },
        ],
      },
    })

    const table = model.getDictionary('currency')
    expect(model.getSummary()).toMatchObject({ kind: 'DCT', tables: 1, fieldSets: 1, inlineFields: 1 })
    expect(table.listFieldSetIds()).toEqual(['common'])
    expect(table.listFields().map((f) => f.fieldName)).toEqual(['id', 'code', 'symbol'])
    expect(table.getFieldRef('id').isFromFieldSet()).toBe(true)
    expect(table.getFieldRef('symbol').isFromFieldSet()).toBe(false)
    expect(table.getField('id')).toBe(model.getFieldSet('common').getField('id'))
  })

  it('单表加载（dictionaryTables 只1张，后端按 dictCode 过滤返回）：listTables/getTable 正常', () => {
    // 模拟后端按 dictCode 反查 + 单表过滤后的响应：dictionaryTables 只含命中表
    const model = new CmxDCTMeta({
      json: {
        moduleMeta: { moduleCode: 'GL', version: 1 },
        fieldSets: baseMeta.fieldSets,
        dictionaryTables: [
          {
            dictMeta: { dictCode: 'gl_account', dictName: '会计科目', tableName: 'cf_gl_account' },
            baseFieldSet: 'common',
            fields: [{ fieldName: 'balance_dir', dataType: 'VARCHAR' }],
          },
        ],
      },
    })
    // 单表：listTables 长度1，getDictionary/listDictionaries 正常工作
    expect(model.listTables()).toHaveLength(1)
    expect(model.listDictionaries()).toHaveLength(1)
    const table = model.getDictionary('gl_account')
    expect(table).toBeTruthy()
    expect(model.getTable('gl_account')).toBe(table)
    // 字段仍正确展开（base fieldSet + inline）
    expect(table.listFields().map((f) => f.fieldName)).toEqual(['id', 'code', 'balance_dir'])
    // getTable 取不存在的 dictCode 返回 null
    expect(model.getTable('nonexistent')).toBeNull()
  })

  it('loads metadata and base fieldSets by id through resolver api', async () => {
    const calls = []
    const model = new CmxDCTMeta({
      id: 'gl_dct.json',
      resolver: async (req) => {
        calls.push(req)
        return {
          moduleMeta: { moduleCode: 'GL' },
          baseDctMetaRef: { file: 'base_dct_meta_v1.json' },
          dictionaryTables: [{ dictMeta: { dictCode: 'currency' }, baseFieldSet: 'common', fields: [] }],
        }
      },
      baseResolver: async (req) => {
        calls.push(req)
        return baseMeta
      },
    })

    await model.loadById()
    // base 字段集按 moduleCode 反查（stem 形式 base_dct_meta，非文件名 base_dct_meta_v1.json），
    // 后端 BASE 反查按 moduleCode 定位并支持多版本经 isDefault 自动切换。
    expect(calls.map((c) => c.id)).toEqual(['gl_dct.json', 'base_dct_meta'])
    // file 已移除：request 只用 id 定位，不再带 file 字段
    expect(calls.every((c) => c.file === undefined)).toBe(true)
    expect(model.getDictionary('currency').getField('id')).toBe(model.getFieldSet('common').getField('id'))
  })
})

describe('CmxDOCMeta', () => {
  it('loads voucher tables and can merge external base fieldSets', () => {
    const model = new CmxDOCMeta({
      json: {
        moduleMeta: { moduleCode: 'GL', version: 1 },
        voucherTables: [
          {
            tableCode: 'voucher_header',
            tableName: 'gl_voucher',
            documentFieldSets: ['common'],
            fields: [{ fieldName: 'summary', dataType: 'VARCHAR' }],
          },
        ],
      },
      fieldSets: baseMeta.fieldSets,
    })

    const table = model.getDocument('voucher_header')
    expect(model.getSummary()).toMatchObject({ kind: 'DOC', tables: 1, fieldSets: 1, inlineFields: 1 })
    expect(table.listFields().map((f) => f.fieldName)).toEqual(['id', 'code', 'summary'])
    expect(model.getField('voucher_header', 'code')).toBe(model.getFieldSet('common').getField('code'))
  })

  it('表只引用自己声明的字段集：不继承文档根 voucherCommonFieldSet（无全局注入）', () => {
    const model = new CmxDOCMeta({
      json: {
        moduleMeta: { metaKind: 'DOC', moduleCode: 'GL' },
        voucherCommonFieldSet: 'common', // 文档根级"公共字段集"——不应自动注入到每张表
        fieldSets: { common: { fields: [{ fieldName: 'create_by' }, { fieldName: 'create_time' }] } },
        voucherTables: [
          { tableName: 'voucher_header', documentFieldSets: ['common'], fields: [{ fieldName: 'summary' }] },
          { tableName: 'voucher_entry', fields: [{ fieldName: 'line_no' }] },
        ],
      },
    })
    // header 自己引用 common → 含其字段；entry 未引用任何字段集 → 只有自己的 inline，绝不含 common
    expect(model.getDocument('voucher_header').listFields().map((f) => f.fieldName)).toEqual(['create_by', 'create_time', 'summary'])
    expect(model.getDocument('voucher_entry').listFieldSetIds()).toEqual([])
    expect(model.getDocument('voucher_entry').listFields().map((f) => f.fieldName)).toEqual(['line_no'])
  })
})

describe('loadById domain/module 校验与 bundle 复用', () => {
  it('默认加载缺 domain 时报清晰错误（而非静默 400）', async () => {
    const model = new CmxDCTMeta({ id: 'gl_md_dct_meta_v1.json' })
    await expect(model.loadById()).rejects.toThrow(/需要 domain/)
  })

  it('bundle 选项复用 base，不再单独请求基础字段集', async () => {
    let baseCalls = 0
    const model = new CmxDCTMeta({
      id: 'gl_dct.json',
      domain: 'fi',
      module: 'gl',
      resolver: async () => ({
        moduleMeta: { moduleCode: 'GL', metaKind: 'DCT' },
        baseDctMetaRef: { file: 'base_dct_meta_v1.json' },
        dictionaryTables: [{ dictMeta: { dictCode: 'currency' }, baseFieldSet: 'common', fields: [] }],
      }),
      baseResolver: async () => { baseCalls += 1; return baseMeta },
    })
    await model.loadById('gl_dct.json', { domain: 'fi', module: 'gl', bundle: { bases: { 'base_dct_meta_v1.json': baseMeta } } })
    expect(baseCalls).toBe(0) // bundle 命中，未调 baseResolver
    expect(model.getDictionary('currency').getField('id')).toBe(model.getFieldSet('common').getField('id'))
  })

  it('base 字段集加载不透传主文件 domain/module（修复 base 404 根因）', async () => {
    let baseReq = null
    const model = new CmxDCTMeta({
      id: 'gl_dct.json',
      domain: 'fi',
      module: 'gl',
      resolver: async () => ({
        moduleMeta: { moduleCode: 'GL', metaKind: 'DCT' },
        baseDctMetaRef: { file: 'base_dct_meta_v1.json' },
        dictionaryTables: [{ dictMeta: { dictCode: 'currency' }, baseFieldSet: 'common', fields: [] }],
      }),
      baseResolver: async (req) => { baseReq = req; return baseMeta },
    })
    await model.loadById('gl_dct.json', { domain: 'fi', module: 'gl' })
    // base 文件位于 domain='base'：绝不能继承主文件的 fi/gl/cmxfico，否则后端 404
    expect(baseReq).toBeTruthy()
    expect(baseReq.domain).toBe('base')
    expect(baseReq.module).toBe('')
    expect(baseReq.application).toBe('')
    // id 归一为 stem（base_dct_meta），URL 用业务编码而非文件名
    expect(baseReq.id).toBe('base_dct_meta')
    expect(model.getDictionary('currency').getField('id')).toBe(model.getFieldSet('common').getField('id'))
  })
})

describe('loadMetaBatch 一次性批量加载', () => {
  it('单次响应加载多个元数据 + 共享 base，按 kind/id 归类', async () => {
    let batchCalls = 0
    const bundle = await loadMetaBatch(
      [
        { domain: 'fi', module: 'gl', id: 'gl_dct.json' },
        { domain: 'fi', module: 'gl', id: 'gl_doc.json' },
      ],
      {
        resolver: async (body) => {
          batchCalls += 1
          expect(body.refs.length).toBe(2)
          return {
            items: [
              { domain: 'fi', module: 'gl', file: 'gl_dct.json', kind: 'DCT', doc: {
                moduleMeta: { metaKind: 'DCT', moduleCode: 'GL' },
                baseDctMetaRef: { file: 'base_dct_meta_v1.json' },
                dictionaryTables: [{ dictMeta: { dictCode: 'currency' }, baseFieldSet: 'common', fields: [] }],
              } },
              { domain: 'fi', module: 'gl', file: 'gl_doc.json', kind: 'DOC', doc: {
                moduleMeta: { metaKind: 'DOC', moduleCode: 'GL' },
                baseDocMetaRef: { file: 'base_doc_meta_v1.json' },
                voucherTables: [{ tableName: 'voucher_header', documentFieldSets: ['common'], fields: [] }],
              } },
            ],
            bases: {
              'base_dct_meta_v1.json': baseMeta,
              'base_doc_meta_v1.json': baseMeta,
            },
            errors: [],
          }
        },
      },
    )

    expect(batchCalls).toBe(1) // 只一次后端调用
    expect(bundle.dct.length).toBe(1)
    expect(bundle.doc.length).toBe(1)
    expect(bundle.get('gl_dct.json')).toBeInstanceOf(CmxDCTMeta)
    expect(bundle.get('gl_doc.json')).toBeInstanceOf(CmxDOCMeta)
    // base 字段集已从同一响应合并，无需单独加载
    expect(bundle.get('gl_dct.json').getDictionary('currency').getField('id'))
      .toBe(bundle.get('gl_dct.json').getFieldSet('common').getField('id'))
    expect(bundle.get('gl_doc.json').getDocument('voucher_header').getField('code'))
      .toBe(bundle.get('gl_doc.json').getFieldSet('common').getField('code'))
  })

  it('单个 ref 失败进 errors，不影响其它', async () => {
    const bundle = await loadMetaBatch(['ok.json', 'missing.json'], {
      resolver: async () => ({
        items: [{ domain: 'fi', module: 'gl', file: 'ok.json', kind: 'DCT', doc: { moduleMeta: { metaKind: 'DCT' }, dictionaryTables: [] } }],
        bases: {},
        errors: [{ ref: { file: 'missing.json' }, error: '定义文件不存在' }],
      }),
    })
    expect(bundle.models.length).toBe(1)
    expect(bundle.errors.length).toBe(1)
    expect(bundle.errors[0].error).toMatch(/不存在/)
  })

  it('后端返回的元数据全路径(path/relPath)灌入实例 + basePaths 透出', async () => {
    const bundle = await loadMetaBatch([{ domain: 'fi', module: 'gl', id: 'gl_dct.json' }], {
      resolver: async () => ({
        items: [{
          domain: 'fi', module: 'gl', file: 'gl_dct.json', kind: 'DCT',
          path: '/srv/data/meta/definitions/fi/gl/gl_dct.json',
          relPath: 'fi/gl/gl_dct.json',
          doc: { moduleMeta: { metaKind: 'DCT' }, baseDctMetaRef: { file: 'base_dct_meta_v1.json' }, dictionaryTables: [] },
        }],
        bases: { 'base_dct_meta_v1.json': baseMeta },
        basePaths: { 'base_dct_meta_v1.json': { path: '/srv/data/meta/definitions/base/base_dct_meta_v1.json', relPath: 'base/base_dct_meta_v1.json' } },
        errors: [],
      }),
    })
    const model = bundle.get('gl_dct.json')
    expect(model.backendPath).toBe('/srv/data/meta/definitions/fi/gl/gl_dct.json')
    expect(model.backendRelPath).toBe('fi/gl/gl_dct.json')
    expect(model.getLastLoad().relPath).toBe('fi/gl/gl_dct.json')
    expect(bundle.basePaths['base_dct_meta_v1.json'].relPath).toBe('base/base_dct_meta_v1.json')
  })
})

describe('loadMetaModelsBatch 灌入模型面板既有实例', () => {
  it('单次请求把数据就地装载进既有 dctMeta/docMeta，不新建对象', async () => {
    // 模拟模型面板声明并由 init-page-models 构造好的既有实例
    const dctMeta = new CmxDCTMeta({ domain: 'fi', module: 'gl', id: 'gl_dct.json' })
    const docMeta = new CmxDOCMeta({ domain: 'fi', module: 'gl', id: 'gl_doc.json' })
    let batchCalls = 0
    let seenRefs = null

    const bundle = await loadMetaModelsBatch(
      { dctMeta, docMeta },
      {
        resolver: async (body) => {
          batchCalls += 1
          seenRefs = body.refs
          return {
            items: [
              { domain: 'fi', module: 'gl', file: 'gl_dct.json', kind: 'DCT', doc: {
                moduleMeta: { metaKind: 'DCT', moduleCode: 'GL' },
                baseDctMetaRef: { file: 'base_dct_meta_v1.json' },
                dictionaryTables: [{ dictMeta: { dictCode: 'currency' }, baseFieldSet: 'common', fields: [] }],
              } },
              { domain: 'fi', module: 'gl', file: 'gl_doc.json', kind: 'DOC', doc: {
                moduleMeta: { metaKind: 'DOC', moduleCode: 'GL' },
                baseDocMetaRef: { file: 'base_doc_meta_v1.json' },
                voucherTables: [{ tableName: 'voucher_header', documentFieldSets: ['common'], fields: [] }],
              } },
            ],
            bases: { 'base_dct_meta_v1.json': baseMeta, 'base_doc_meta_v1.json': baseMeta },
            errors: [],
          }
        },
      },
    )

    // 只一次后端调用；refs 从既有实例的 domain/module/id 推断
    expect(batchCalls).toBe(1)
    expect(seenRefs.map((r) => r.id).sort()).toEqual(['gl_dct.json', 'gl_doc.json'])
    // 关键：灌入的就是既有实例本身（同一对象引用），不是新建对象
    expect(bundle.get('gl_dct.json')).toBe(dctMeta)
    expect(bundle.get('gl_doc.json')).toBe(docMeta)
    expect(bundle.dct[0]).toBe(dctMeta)
    expect(bundle.doc[0]).toBe(docMeta)
    // 数据已就地装载，且 base 字段集随同一响应合并（不单独加载）
    expect(dctMeta.getDictionary('currency').getField('id'))
      .toBe(dctMeta.getFieldSet('common').getField('id'))
    expect(docMeta.getDocument('voucher_header').getField('code'))
      .toBe(docMeta.getFieldSet('common').getField('code'))
  })

  it('支持数组形式与显式 refs 覆盖', async () => {
    const dctMeta = new CmxDCTMeta({ domain: 'fi', module: 'gl', id: 'gl_dct.json' })
    let seenRefs = null
    await loadMetaModelsBatch([dctMeta], {
      refs: [{ domain: 'fi', module: 'gl', id: 'override.json', kind: 'DCT' }],
      resolver: async (body) => {
        seenRefs = body.refs
        return { items: [{ domain: 'fi', module: 'gl', file: 'override.json', kind: 'DCT', doc: { moduleMeta: { metaKind: 'DCT' }, dictionaryTables: [] } }], bases: {}, errors: [] }
      },
    })
    // 显式 refs 覆盖了从实例推断的 id
    expect(seenRefs.map((r) => r.id)).toEqual(['override.json'])
    // 命中既有实例（按 kind 索引），仍就地装载
    expect(dctMeta.getSummary().kind).toBe('DCT')
  })

  it('serviceFn 路由：后端调用走服务面板声明的服务（host[serviceFn]）而非库内 fetch', async () => {
    const dctMeta = new CmxDCTMeta({ domain: 'fi', module: 'gl', id: 'gl_dct.json' })
    let svcCalls = 0
    let seenBody = null
    let seenOpts = null
    // 模拟「服务面板」编译到 host 上的批量服务：host.loadDefinitionsBatch(params, _opts)
    const host = {
      loadDefinitionsBatch: async (params, _opts) => {
        svcCalls += 1
        seenBody = params
        seenOpts = _opts
        return {
          items: [{ domain: 'fi', module: 'gl', file: 'gl_dct.json', kind: 'DCT', doc: { moduleMeta: { metaKind: 'DCT' }, dictionaryTables: [] } }],
          bases: {},
          errors: [],
        }
      },
    }
    const ctrl = new AbortController()
    const bundle = await loadMetaModelsBatch({ dctMeta }, { host, serviceFn: 'loadDefinitionsBatch', signal: ctrl.signal })
    // 走了服务面板服务（被调用 1 次）
    expect(svcCalls).toBe(1)
    // 服务收到的 params 就是批量 body：{ refs, includeBase }
    expect(seenBody.includeBase).toBe(true)
    expect(seenBody.refs.map((r) => r.id)).toEqual(['gl_dct.json'])
    // signal 经 _opts 透传给服务（与编译后的 pageService 签名 (params,_opts) 对齐）
    expect(seenOpts && seenOpts.signal).toBe(ctrl.signal)
    // 数据仍就地灌入既有实例
    expect(bundle.get('gl_dct.json')).toBe(dctMeta)
    // via 标记实际走了服务面板服务
    expect(bundle.via).toBe('service:loadDefinitionsBatch')
  })

  it('resolver 优先于 serviceFn（resolver 最高优先级）', async () => {
    const dctMeta = new CmxDCTMeta({ domain: 'fi', module: 'gl', id: 'gl_dct.json' })
    let svcCalls = 0
    let resolverCalls = 0
    const host = { loadDefinitionsBatch: async () => { svcCalls += 1; return { items: [], bases: {}, errors: [] } } }
    const bundle = await loadMetaModelsBatch({ dctMeta }, {
      host,
      serviceFn: 'loadDefinitionsBatch',
      resolver: async () => {
        resolverCalls += 1
        return { items: [{ domain: 'fi', module: 'gl', file: 'gl_dct.json', kind: 'DCT', doc: { moduleMeta: { metaKind: 'DCT' }, dictionaryTables: [] } }], bases: {}, errors: [] }
      },
    })
    expect(resolverCalls).toBe(1)
    expect(svcCalls).toBe(0)
    expect(bundle.via).toBe('resolver')
  })
})

describe('CmxMetaSummary 单据汇总表（子表 fields 形态）', () => {
  function makeDoc() {
    return new CmxDOCMeta({
      json: {
        moduleMeta: { metaKind: 'DOC', moduleCode: 'GL' },
        voucherTables: [
          {
            level: 'L2', tableName: 'voucher_entry', tableAlias: '分录',
            fields: [
              { id: 'account_id', name: 'account_id', dataType: 'BIGINT', dimType: 'dimension', refDict: 'gl_account', caption: { zh_CN: '科目ID' } },
              { id: 'debit_amount', name: 'debit_amount', dataType: 'DECIMAL', dimType: 'measure', agg: 'sum', caption: { zh_CN: '借方金额' } },
            ],
            summaries: [
              {
                id: 'voucher_entry_sum_account', name: 'voucher_entry_sum_account',
                caption: { zh_CN: '分录汇总·科目' },
                fields: [
                  { id: 'account_id', name: 'account_id', dataType: 'BIGINT', dimType: 'dimension', caption: { zh_CN: '科目ID' } },
                  { id: 'debit_amount', name: 'debit_amount', dataType: 'DECIMAL', dimType: 'measure', agg: 'sum', caption: { zh_CN: '借方合计' } },
                ],
              },
            ],
          },
        ],
      },
    })
  }

  it('table.listSummaries / getSummary 解析为子表对象', () => {
    const doc = makeDoc()
    const entry = doc.getDocument('voucher_entry')
    expect(entry.listSummaries().length).toBe(1)
    const s = entry.getSummary('voucher_entry_sum_account')
    expect(s).toBeTruthy()
    expect(s.name).toBe('voucher_entry_sum_account')
    expect(s.caption.zh_CN).toBe('分录汇总·科目')
  })

  it('汇总表拥有自己的 fields（含 dimType/agg），可按 id 取字段', () => {
    const s = makeDoc().getDocument('voucher_entry').getSummary('voucher_entry_sum_account')
    expect(s.listFields().map((f) => f.id)).toEqual(['account_id', 'debit_amount'])
    expect(s.getField('debit_amount').agg).toBe('sum')
    expect(s.listFieldRefs().map((r) => r.id)).toEqual(['account_id', 'debit_amount'])
    expect(s.listFieldRefs()[0].source).toBe('summary')
  })

  it('模型层枚举：listSummaries / listSummariesByLevel', () => {
    const doc = makeDoc()
    expect(doc.listSummaries().length).toBe(1)
    expect(doc.listSummariesByLevel('L2').length).toBe(1)
    expect(doc.listSummariesByLevel('L1').length).toBe(0)
    expect(doc.getDocument('voucher_entry').listSummaries().length).toBe(1)
  })

  it('toJSON 原样保真（往返不丢 summaries.fields）', () => {
    const raw = makeDoc().toJSON()
    const entryRaw = raw.voucherTables.find((t) => t.tableName === 'voucher_entry')
    expect(entryRaw.summaries[0].fields.map((f) => f.id)).toEqual(['account_id', 'debit_amount'])
  })

  it('load() 不冻结调用方传入的原始 JSON（可继续编辑）', () => {
    const doc = { moduleMeta: { metaKind: 'DOC' }, voucherTables: [{ level: 'L2', tableName: 't', fields: [], summaries: [{ id: 's', fields: [] }] }] }
    const m = new CmxDOCMeta({ json: doc })
    expect(Object.isFrozen(doc.voucherTables[0])).toBe(false)
    doc.voucherTables[0].summaries[0].fields.push({ id: 'x' }) // 不应抛错
    expect(doc.voucherTables[0].summaries[0].fields.length).toBe(1)
    // 模型读自己的克隆，不受影响
    expect(m.getDocument('t').getSummary('s').listFields().length).toBe(0)
  })
})
