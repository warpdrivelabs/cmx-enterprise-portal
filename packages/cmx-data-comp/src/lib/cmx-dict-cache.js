/**
 * cmx-dict-cache — 维度解析 L0：前端整典缓存 id→name（方案 §5A.3，落地 Phase 7）
 *
 * 单据列存字典的 id/code，界面要显示对应 name 或字典某属性。L0 策略：
 *   ① 收集单据引用的所有 refDict（collectRefDicts）
 *   ② 逐典拉全量条目（POST /api/dct/data/search，pageSize 拉满）
 *   ③ 建 dictId → Map<key, entry> 缓存，渲染时 O(1) 查表 id→entry[displayField]
 *
 * 收益（§5A）：字典整典只拉一次、跨单据/跨行共用；单据包里只传 id 不传 name（最小传输）；
 * 零后端 JOIN。字典改版 → 版本协商失效重拉。
 *
 * 与后端契约：POST /api/dct/data/search?domain=&application=&module=&dict=
 *   body { page:1, pageSize:<上限> }；响应 { code, data:{ rows:[...], total, page, pageSize } }。
 *   旧 /api/dict/batch-data（JSON 文件存储）已下线，新接口无批量端点，故逐典并发拉取。
 *   坐标 coord（domain/app/module）由调用方在 dicts spec 里提供，或全局共享一份。
 */

const DEFAULT_SEARCH_PATH = '/api/dct/data/search'
// 整典缓存拉全量：用后端允许的 pageSize 上限（dct.rs build_search_sql clamp 上限 5000）。
const FULL_PAGE_SIZE = 5000

/**
 * 字典缓存：dictId → { keyField, labelField, byKey: Map<key, entry> }。
 */
export class CmxDictCache {
  /**
   * @param {object} [opts]
   * @param {string} [opts.keyField='code']      默认主键字段（可被 per-dict 覆盖）
   * @param {string} [opts.labelField='name']    默认显示字段
   * @param {string} [opts.searchPath]           覆盖 /api/dct/data/search
   * @param {object} [opts.coord]                全局坐标 { domain, application, module }（所有字典共用）
   */
  constructor (opts = {}) {
    this._keyField = opts.keyField || 'code'
    this._labelField = opts.labelField || 'name'
    this._searchPath = opts.searchPath || DEFAULT_SEARCH_PATH
    this._coord = opts.coord || null
    /** @type {Map<string, { keyField:string, labelField:string, byKey:Map<string,object>, version?:string }>} */
    this._dicts = new Map()
  }

  /**
   * 批量装载一组字典的全量条目，建 key→entry 映射。
   * @param {object} host        页面 host（可选自定义 fetch）
   * @param {Array<string|{dictId:string,keyField?:string,labelField?:string,coord?:object}>} dicts
   *        coord = { domain, application, module, file? }；缺省用构造时的全局 coord。
   * @param {object} [opts] { dbId?, signal? }
   */
  async loadDicts (host, dicts, opts = {}) {
    const specs = (dicts || []).map((d) =>
      typeof d === 'string' ? { dictId: d } : d).filter((d) => d && d.dictId)
    // 只拉尚未缓存的
    const need = specs.filter((s) => !this._dicts.has(s.dictId))
    if (!need.length) return this

    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' }
    if (opts.dbId) headers.db_id = opts.dbId

    // 逐典并发拉全量（新接口无批量端点）。
    const results = await Promise.all(need.map(async (spec) => {
      const coord = spec.coord || this._coord || {}
      const qs = new URLSearchParams({ dict: spec.dictId })
      if (coord.domain) qs.set('domain', coord.domain)
      if (coord.application) qs.set('application', coord.application)
      else if (coord.app) qs.set('application', coord.app)
      if (coord.module) qs.set('module', coord.module)
      const url = `${this._searchPath}?${qs.toString()}`
      try {
        const res = await _fetch(host, url, {
          method: 'POST', headers, body: JSON.stringify({ page: 1, pageSize: FULL_PAGE_SIZE }), signal: opts.signal,
        })
        const resp = await res.json().catch(() => null)
        const data = (resp && resp.code === 0 && resp.data != null) ? resp.data : resp
        const rows = Array.isArray(data?.rows) ? data.rows : (Array.isArray(data) ? data : [])
        // 数据形态合法 = rows 数组 / {rows,total} / 裸数组；HTTP 失败或信封 code!==0 时 body
        // 形态不符（如拦截器产出的 {error,...}）→ ok=false，调用方不写缓存（保住重试机会）。
        const shaped = Array.isArray(data?.rows) || Array.isArray(data)
        return { spec, rows, ok: !!res.ok && shaped }
      } catch (e) {
        return { spec, rows: [], ok: false, error: e }
      }
    }))

    for (const r of results) {
      const { spec, rows, ok } = r
      if (!ok) {
        // 失败**不写缓存**：写空典会让后续 loadDicts 的 need 过滤永久跳过该典，列只能一直显示
        // 原始 id 且无重试机会。warn 一次供排查；上层（revo-grid 预加载）负责用户可见提示。
        console.warn(`[CmxDictCache] 字典 ${spec.dictId} 装载失败（本次不缓存，下次装载将重试）:`,
          r.error || (r.rows ? '响应非 2xx 或结构异常' : '未知错误'))
        continue
      }
      const keyField = spec.keyField || this._keyField
      const labelField = spec.labelField || this._labelField
      const byKey = new Map()
      for (const row of rows) {
        const k = row?.[keyField]
        if (k != null) byKey.set(String(k), row)
      }
      this._dicts.set(spec.dictId, { keyField, labelField, byKey })
    }
    return this
  }

  /**
   * 解析：字典 key → 某属性值（缺省 labelField）。
   * @param {string} dictId
   * @param {string|number} key
   * @param {string} [field]  字典属性名；缺省用该典 labelField
   * @returns {any} 属性值；未命中返回原 key（优雅降级）
   */
  resolve (dictId, key, field) {
    if (key == null) return key
    const dict = this._dicts.get(dictId)
    if (!dict) return key
    const entry = dict.byKey.get(String(key))
    if (!entry) return key
    const f = field || dict.labelField
    return entry[f] != null ? entry[f] : key
  }

  /**
   * 一次带出多个属性（to attribute 通用化，§5A.2 displayFields）。
   * @returns {object|null} { field: value, ... }；未命中返回 null
   */
  resolveMany (dictId, key, fields) {
    const dict = this._dicts.get(dictId)
    if (!dict || key == null) return null
    const entry = dict.byKey.get(String(key))
    if (!entry) return null
    const out = {}
    for (const f of (fields || [])) out[f] = entry[f]
    return out
  }

  /** 取整条字典条目。 */
  entry (dictId, key) {
    return this._dicts.get(dictId)?.byKey.get(String(key)) ?? null
  }

  has (dictId) { return this._dicts.has(dictId) }

  /** 失效某典（改版后重拉）。 */
  invalidate (dictId) { this._dicts.delete(dictId) }

  clear () { this._dicts.clear() }
}

/**
 * 从单据定义（DocMeta 的 voucherTables 或已解析层）收集所有 refDict。
 * 支持两种输入：
 *   - 原始定义 JSON（含 voucherTables[].fields[].refDict）
 *   - 字段数组 [{ refDict, refField, displayField }, ...]
 * @returns {Array<{dictId:string, keyField?:string, labelField?:string}>} 去重
 */
export function collectRefDicts (docMetaOrFields) {
  const seen = new Map()
  const addField = (f) => {
    if (!f || !f.refDict) return
    if (!seen.has(f.refDict)) {
      seen.set(f.refDict, {
        dictId: f.refDict,
        keyField: f.refField || undefined,
        labelField: f.displayField || undefined,
      })
    }
  }
  if (Array.isArray(docMetaOrFields)) {
    for (const f of docMetaOrFields) addField(f)
  } else if (docMetaOrFields && typeof docMetaOrFields === 'object') {
    const tables = docMetaOrFields.voucherTables || docMetaOrFields.tables || []
    for (const t of tables) {
      for (const f of (t.fields || t.columns || [])) addField(f)
    }
  }
  return [...seen.values()]
}

/**
 * 给 CmxColumn 显示模板生成一个 dict 解析函数，供网格/表单渲染 id→name。
 * 用法：col.display = { kind:'dict', resolve: makeDictResolver(cache, 'gl_account', 'name') }
 * @returns {(rawValue:any)=>any}
 */
export function makeDictResolver (cache, dictId, field) {
  return (raw) => cache.resolve(dictId, raw, field)
}

function _fetch (host, url, opts) {
  if (host && typeof host.fetch === 'function') return host.fetch(url, opts)
  return fetch(url, opts)
}
