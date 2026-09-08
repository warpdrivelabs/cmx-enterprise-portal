/**
 * CMX metadata model primitives.
 *
 * The backend metadata JSON keeps reusable field groups as fieldSets and lets
 * dictionary/document tables reference those sets by id. This module keeps each
 * fieldSet stored once, while table-level field access expands lightweight
 * entries that point back to their owner set.
 */
import { deepClone as cloneJson } from './cmx-deep-clone.js'

const DCT_FIELD_SET_KEYS = [
  'baseFieldSet',
  'hierarchyFieldSet',
  'auditFieldSet',
  'scopeFieldSet',
  'effectiveFieldSet',
  'disableFieldSet',
  'systemFieldSet',
]

const DOC_FIELD_SET_KEYS = [
  'documentFieldSets',
  'voucherCommonFieldSet',
  'baseFieldSet',
  'technicalFieldSet',
  'identityFieldSet',
  'sourceFieldSet',
  'lifecycleFieldSet',
  'commonFieldSet',
]

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const v of Object.values(value)) freezeDeep(v)
  return value
}

function asArray(value) {
  if (Array.isArray(value)) return value
  if (value == null || value === '') return []
  return [value]
}

function fieldId(field) {
  return String(field?.fieldName ?? field?.id ?? field?.name ?? '')
}

function tableId(table, kind) {
  if (kind === 'DCT') {
    return String(table?.dictMeta?.dictCode ?? table?.dictCode ?? table?.tableName ?? '')
  }
  return String(table?.voucherMeta?.voucherCode ?? table?.tableCode ?? table?.tableName ?? '')
}

function tableName(table, kind) {
  if (kind === 'DCT') return String(table?.dictMeta?.dictName ?? table?.dictName ?? tableId(table, kind))
  return String(table?.voucherMeta?.voucherName ?? table?.tableAlias ?? tableId(table, kind))
}

function normalizeFieldSets(input) {
  const out = new Map()
  const raw = input && typeof input === 'object' ? input : {}
  if (Array.isArray(raw)) {
    raw.forEach((set, index) => {
      const id = String(set?.id ?? set?.code ?? set?.name ?? `fieldSet${index + 1}`)
      out.set(id, new CmxMetaFieldSet(id, set || {}))
    })
  } else {
    Object.entries(raw).forEach(([id, set]) => {
      out.set(String(id), new CmxMetaFieldSet(String(id), set || {}))
    })
  }
  return out
}

function collectTableFieldSetRefs(table, kind) {
  const refs = []
  const add = (value) => {
    for (const id of asArray(value)) {
      const s = String(id || '').trim()
      if (s && !refs.includes(s)) refs.push(s)
    }
  }
  for (const key of kind === 'DCT' ? DCT_FIELD_SET_KEYS : DOC_FIELD_SET_KEYS) add(table?.[key])
  if (kind === 'DOC') add(table?.documentFieldSets)
  return refs
}

export class CmxMetaFieldSet {
  constructor(id, source = {}) {
    this.id = id
    this.remark = source.remark ?? ''
    this.meta = freezeDeep(cloneJson(source))
    this.fields = freezeDeep(Array.isArray(source.fields) ? source.fields : [])
    this._fieldById = new Map(this.fields.map((field) => [fieldId(field), field]).filter(([id]) => id))
  }

  getField(id) {
    return this._fieldById.get(String(id)) || null
  }

  hasField(id) {
    return this._fieldById.has(String(id))
  }

  listFields() {
    return this.fields
  }

  toJSON() {
    return this.meta
  }
}

export class CmxMetaFieldRef {
  constructor({ field, table, fieldSet = null, source = 'inline', index = 0 }) {
    this.field = field
    this.table = table
    this.fieldSet = fieldSet
    this.fieldSetId = fieldSet?.id || ''
    this.source = source
    this.index = index
    this.id = fieldId(field)
    this.fieldName = this.id
  }

  get(prop) {
    return this.field?.[prop]
  }

  getPath(path) {
    const segs = String(path || '').split('.').filter(Boolean)
    let cur = this.field
    for (const seg of segs) {
      if (cur == null) return undefined
      cur = cur[seg]
    }
    return cur
  }

  isFromFieldSet() {
    return !!this.fieldSet
  }

  toJSON() {
    return this.field
  }
}

export class CmxMetaTable {
  constructor(model, raw, index) {
    this.model = model
    this.raw = freezeDeep(raw || {})
    this.index = index
    this.kind = model.kind
    this.id = tableId(raw, model.kind)
    this.name = tableName(raw, model.kind)
    this.tableName = raw?.dictMeta?.tableName || raw?.tableName || ''
    // 只引用本表声明的字段集（collectTableFieldSetRefs 内部已去重）
    this.fieldSetRefs = freezeDeep(collectTableFieldSetRefs(raw, model.kind))
    this.inlineFields = freezeDeep(Array.isArray(raw?.fields) ? raw.fields : [])
    this._fieldRefs = null
    this._fieldRefById = null
  }

  listFieldSetIds() {
    return this.fieldSetRefs
  }

  listFieldSets() {
    return this.fieldSetRefs.map((id) => this.model.getFieldSet(id)).filter(Boolean)
  }

  listInlineFields() {
    return this.inlineFields
  }

  listFields(options = {}) {
    const refs = this.listFieldRefs(options)
    return refs.map((ref) => ref.field)
  }

  listFieldRefs({ includeFieldSets = true, includeInline = true } = {}) {
    if (!this._fieldRefs) this._buildFieldRefs()
    return this._fieldRefs.filter((ref) =>
      (includeFieldSets || !ref.isFromFieldSet()) &&
      (includeInline || ref.isFromFieldSet())
    )
  }

  getField(id) {
    const ref = this.getFieldRef(id)
    return ref ? ref.field : null
  }

  getFieldRef(id) {
    if (!this._fieldRefById) this._buildFieldRefs()
    return this._fieldRefById.get(String(id)) || null
  }

  get(prop) {
    return this.raw?.[prop]
  }

  getPath(path) {
    const segs = String(path || '').split('.').filter(Boolean)
    let cur = this.raw
    for (const seg of segs) {
      if (cur == null) return undefined
      cur = cur[seg]
    }
    return cur
  }

  toJSON() {
    return this.raw
  }

  _buildFieldRefs() {
    // 分组（段）顺序：若本表声明了 fieldSetOrder（设计期「分组排序」产出），按它决定
    // 各组先后——'own' = 本表 inline 组，其余 = 引用字段集名。无 fieldSetOrder 时默认
    // 「引用组在前（按 fieldSetRefs 声明序）→ 本表组在后」，向后兼容。
    const segs = this._orderedSegments()
    const refs = []
    const pushSet = (setId) => {
      const set = this.model.getFieldSet(setId)
      if (!set) return
      set.listFields().forEach((field, index) => {
        refs.push(new CmxMetaFieldRef({ field, table: this, fieldSet: set, source: 'fieldSet', index }))
      })
    }
    const pushInline = () => {
      this.inlineFields.forEach((field, index) => {
        refs.push(new CmxMetaFieldRef({ field, table: this, source: 'inline', index }))
      })
    }
    for (const seg of segs) {
      if (seg === 'own') pushInline()
      else pushSet(seg)
    }
    // 去重按 id：本表内联字段「遮蔽」同 id 的引用字段集字段（inline-wins）。
    // 这样"字段级 overlay 存时物化"落成的内联字段能覆盖其 base 来源，运行时消费到覆盖后的定义。
    // （旧默认是 fieldSet-first；现实档案里内联很少与 base 同 id，改动仅在同 id 冲突时生效。）
    const byId = new Map()
    for (const ref of refs) if (ref.id && ref.source === 'inline') byId.set(ref.id, ref)
    for (const ref of refs) if (ref.id && !byId.has(ref.id)) byId.set(ref.id, ref)
    refs.forEach((ref) => Object.freeze(ref))
    this._fieldRefs = Object.freeze(refs)
    this._fieldRefById = byId
  }

  /**
   * 计算分组（段）顺序：'own' 与各引用字段集名的排列。
   * - 有 table.fieldSetOrder：按它取（仅保留实际存在的段；悬空项忽略），清单外漏掉的段按
   *   默认相对序补尾（fieldSetRefs 序 + own），不丢分组。
   * - 无 fieldSetOrder：默认 [...fieldSetRefs, 'own']（引用组在前、本表组在后）。
   * @returns {string[]}
   */
  _orderedSegments() {
    const declared = this.fieldSetRefs
    const haveInline = this.inlineFields.length > 0
    const all = haveInline ? [...declared, 'own'] : [...declared]
    const order = Array.isArray(this.raw?.fieldSetOrder) ? this.raw.fieldSetOrder : null
    if (!order || !order.length) return all
    const have = new Set(all)
    const out = []
    const used = new Set()
    for (const raw of order) {
      const seg = String(raw ?? '').trim()
      if (seg && (seg === 'own' ? haveInline : have.has(seg)) && !used.has(seg)) {
        out.push(seg)
        used.add(seg)
      }
    }
    if (!out.length) return all
    // 清单外漏掉的段按默认相对序补尾（不丢分组）。
    for (const seg of all) if (!used.has(seg)) out.push(seg)
    return out
  }


  /**
   * 本表定义的汇总表（DOC：raw.summaries[]）。懒构建并缓存。
   * @returns {CmxMetaSummary[]}
   */
  listSummaries() {
    if (!this._summaries) {
      const arr = Array.isArray(this.raw?.summaries) ? this.raw.summaries : []
      this._summaries = Object.freeze(arr.map((s, i) => new CmxMetaSummary(this, s, i)))
    }
    return this._summaries
  }

  /** 按 id 取本表的某个汇总表。 */
  getSummary(id) {
    return this.listSummaries().find((s) => s.id === String(id)) || null
  }
}

/**
 * 单据汇总表：挂在某张源表下的子表，拥有自己的字段列表 `fields`（可由「继承所在表的所有列」一键填充）。
 * 定义形如 `{ id, name, caption, fields:[ <field> ] }`。
 * 汇总语义（聚合方式等）落在各字段自身的属性上（dimType / agg），与主表字段一致。
 */
export class CmxMetaSummary {
  constructor(sourceTable, raw, index = 0) {
    this.sourceTable = sourceTable
    this.model = sourceTable.model
    this.raw = freezeDeep(raw || {})
    this.index = index
    this.id = String(raw?.id ?? raw?.name ?? `summary${index + 1}`)
    this.name = String(raw?.name ?? raw?.id ?? this.id)
    this.caption = raw?.caption ?? ''
    this.remark = raw?.remark ?? ''
    this.fields = Array.isArray(this.raw?.fields) ? this.raw.fields : []
    this._fieldById = new Map(this.fields.map((f) => [fieldId(f), f]).filter(([id]) => id))
  }

  /** 本汇总表的字段列表（自有列；继承自源表的列在定义时已物化进来）。 */
  listFields() {
    return this.fields
  }

  getField(id) {
    return this._fieldById.get(String(id)) || null
  }

  /** 字段引用（统一接口，source 标记为 summary）。 */
  listFieldRefs() {
    return this.fields.map((field, index) => new CmxMetaFieldRef({ field, table: this.sourceTable, source: 'summary', index }))
  }

  toJSON() {
    return this.raw
  }
}

export class CmxBaseMeta extends EventTarget {
  constructor({ kind, props = {}, tableProp, metaProp }) {
    super()
    this.kind = kind
    this.id = props.id ?? props.metaId ?? ''
    this.domain = props.domain ?? ''
    this.application = props.application ?? props.app ?? ''
    this.module = props.module ?? ''
    this.backendPath = props.backendPath ?? ''       // 后端绝对全路径（批量响应回填）
    this.backendRelPath = props.backendRelPath ?? '' // 相对 definitions 根（/ 分隔）
    this.sourceName = props.sourceName ?? ''
    // 元模块业务编码——DOC/DCT/BASE 三 kind 统一叫 moduleCode（对应 JSON 顶层 moduleMeta.moduleCode）。
    // 语义分层：一个元数据文件 = 一个「元模块」（DOC 一个单据模块 / DCT 一组字典的分组模块 / BASE 一份基础字段集模块），
    // moduleCode 是模块级业务编码；DCT 里各具体字典表的编码另有 dictMeta.dictCode，语义不同、不撞名。
    this.moduleCode = props.moduleCode ?? ''
    this.version = props.version ?? ''
    this.remark = props.remark ?? ''
    this.apiPath = props.apiPath || '/api/definitions/config'
    this.baseApiPath = props.baseApiPath || this.apiPath
    this.serviceFn = props.serviceFn || ''
    this.baseServiceFn = props.baseServiceFn || ''
    this.resolver = typeof props.resolver === 'function' ? props.resolver : null
    this.baseResolver = typeof props.baseResolver === 'function' ? props.baseResolver : null
    this.autoLoad = props.autoLoad === true
    this._host = null
    this._lastLoad = null
    this._tableProp = tableProp
    this._metaProp = metaProp
    this._raw = {}
    this._meta = {}
    this._fieldSets = new Map()
    this._tables = []
    this._tableById = new Map()
    if (props.json || props.meta || props.raw) this.load(props.json || props.meta || props.raw)
    if (props.fieldSets) this.mergeFieldSets({ fieldSets: props.fieldSets })
  }

  bindHost(host) {
    this._host = host || null
    return this
  }

  load(json) {
    const raw = typeof json === 'string' ? JSON.parse(json) : (json || {})
    this._raw = freezeDeep(cloneJson(raw))
    this._meta = freezeDeep(cloneJson(raw?.[this._metaProp] || {}))
    this.moduleCode = this._meta.moduleCode ?? this.moduleCode
    this.version = this._meta.version ?? this.version
    this.remark = this._meta.remark ?? this.remark
    this._fieldSets = normalizeFieldSets(this._raw?.fieldSets)
    // 无全局字段集注入：每张表只引用自己声明的字段集（DCT/DOC 一致）。
    // 用克隆冻结后的 this._raw 建表（不碰传入的原始对象，避免冻结调用方仍在编辑的 JSON）。
    this._tables = Object.freeze((Array.isArray(this._raw?.[this._tableProp]) ? this._raw[this._tableProp] : [])
      .map((table, index) => new CmxMetaTable(this, table, index)))
    this._tableById = new Map(this._tables.map((table) => [table.id, table]).filter(([id]) => id))
    this._emitChange('load')
    return this
  }

  mergeFieldSets(json) {
    const raw = typeof json === 'string' ? JSON.parse(json) : (json || {})
    const incoming = normalizeFieldSets(raw?.fieldSets || raw)
    for (const [id, set] of incoming) this._fieldSets.set(id, set)
    for (const table of this._tables) {
      table._fieldRefs = null
      table._fieldRefById = null
    }
    this._emitChange('merge-field-sets')
    return this
  }

  async loadById(id = this.id, options = {}) {
    if (!id) throw new Error(`[${this.constructor.name}] id required`)
    this.id = id || this.id
    const request = this._buildLoadRequest({ ...options, id: id || this.id })
    // 默认走 /api/definitions/config 时必须有 domain（非 base 还需 module），否则后端 400。
    // 提前给出清晰错误，而不是让用户面对静默的 HTTP 400。
    if (!this.resolver && !(this.serviceFn && this._host && typeof this._host[this.serviceFn] === 'function')) {
      if (!request.domain) throw new Error(`[${this.constructor.name}] loadById(${request.id}) 需要 domain（非 base 还需 module）：请在模型属性配置 domain/module，或改用 loadMetaBatch 一次性加载`)
    }
    const json = await this._resolveMeta(request)
    this.load(json)
    this._lastLoad = { ...request, at: Date.now() }
    // bundle 复用：调用方已持有 batch 返回的 bases 时，直接 mergeFieldSets，跳过单独的 base 网络请求
    if (options.loadBase !== false) {
      const bundleBases = options.bundle && typeof options.bundle === 'object' ? (options.bundle.bases || options.bundle) : null
      const baseFile = options.baseId || this._inferBaseId(json)
      if (bundleBases && baseFile && bundleBases[baseFile]) {
        this.mergeFieldSets(bundleBases[baseFile])
      } else {
        // base 字段集文件位于 domain='base'（约定，baseXxxMetaRef 不含 domain/module）。
        // 不能把主元数据的坐标（如 fi/cmxfico/gl）透传给 base 加载，否则会去 fi/cmxfico/gl/base_*.json → 404。
        const { domain: _d, application: _a, app: _ap, module: _m, id: _i, kind: _k, ...baseOpts } = options
        await this.loadBaseById(options.baseId, { ...baseOpts, meta: json })
      }
    }
    this._emitChange('load-by-id')
    return this
  }

  async loadBaseById(baseId, options = {}) {
    const id = baseId || this._inferBaseId(options.meta || this._raw)
    if (!id) return this
    // 归一为 stem（去 .json + _vN 后缀）：后端 BASE 反查按 moduleCode 定位（约定 = 文件名 stem），
    // 让 URL 用业务编码（base_dct_meta）而非文件名（base_dct_meta_v1.json），并支持多版本经
    // isDefault 自动切换（新增 base_dct_meta_v2.json 并设默认后，前端零改动即生效）。
    const stemId = String(id).replace(/\.json$/i, '').replace(/_v\d+$/i, '')
    const request = this._buildLoadRequest({
      ...options,
      id: stemId,
      domain: options.domain || 'base',
      module: options.module || '',
      // BASE 反查按 moduleCode 定位（仅需 domain=base），强制清空 application/app，
      // 避免 _buildLoadRequest 的 `?? this.application` 回退到主元数据坐标（如 cmxfico）。
      application: '',
      app: '',
      kind: 'BASE',
    })
    const json = await this._resolveBaseMeta(request)
    this.mergeFieldSets(json)
    this._emitChange('load-base-by-id')
    return this
  }

  /**
   * 用「已经取回的批量响应条目」就地装载本实例（不发起任何网络请求）。
   * 供 loadMetaBatch / loadMetaModelsBatch 把单次批量结果灌入模型面板里声明的既有实例
   * （host.dctMeta / host.docMeta），不产生新对象。
   * @param {{doc?:object, domain?:string, module?:string, file?:string, kind?:string, path?:string, relPath?:string}} item
   *        批量条目（path/relPath 为后端返回的该元数据后端全路径）
   * @param {Record<string,object>} [bases] 同一批响应里的 base 字段集（file → {fieldSets}）
   * @param {{includeBase?:boolean}} [opts]
   */
  applyBatchItem(item, bases = {}, { includeBase = true } = {}) {
    if (!item || typeof item !== 'object') return this
    if (item.domain != null) this.domain = item.domain
    if (item.module != null) this.module = item.module
    // 后端批量响应仍带 file 字段（定位段值），落成实例的 id（id 与 file 同值，file 已不再作为实例属性）。
    if (item.file != null && !this.id) this.id = item.file
    if (item.id != null) this.id = item.id
    // 后端批量响应回带的该元数据后端全路径（path 绝对 / relPath 相对），存到实例上供展示与排查
    if (item.path != null) this.backendPath = item.path
    if (item.relPath != null) this.backendRelPath = item.relPath
    const doc = item.doc != null ? item.doc : item
    this.load(doc)
    this._lastLoad = { kind: this.kind, id: this.id, domain: this.domain, module: this.module, path: this.backendPath || '', relPath: this.backendRelPath || '', via: 'batch', at: Date.now() }
    const baseFile = this._inferBaseId(doc)
    if (includeBase && baseFile && bases && bases[baseFile]) this.mergeFieldSets(bases[baseFile])
    this._emitChange('apply-batch-item')
    return this
  }

  getLastLoad() {
    return this._lastLoad ? { ...this._lastLoad } : null
  }

  get meta() {
    return this._meta
  }

  get raw() {
    return this._raw
  }

  getTable(id) {
    return this._tableById.get(String(id)) || null
  }

  listTables() {
    return this._tables
  }

  getFieldSet(id) {
    return this._fieldSets.get(String(id)) || null
  }

  listFieldSets() {
    return [...this._fieldSets.values()]
  }

  getField(tableIdValue, fieldIdValue) {
    return this.getTable(tableIdValue)?.getField(fieldIdValue) || null
  }

  getFieldRef(tableIdValue, fieldIdValue) {
    return this.getTable(tableIdValue)?.getFieldRef(fieldIdValue) || null
  }

  listFields(tableIdValue, options) {
    const table = this.getTable(tableIdValue)
    return table ? table.listFields(options) : []
  }

  listFieldRefs(tableIdValue, options) {
    const table = this.getTable(tableIdValue)
    return table ? table.listFieldRefs(options) : []
  }

  getPath(path) {
    const segs = String(path || '').split('.').filter(Boolean)
    let cur = this._raw
    for (const seg of segs) {
      if (cur == null) return undefined
      cur = cur[seg]
    }
    return cur
  }

  toJSON() {
    return this._raw
  }

  getSummary() {
    return {
      kind: this.kind,
      moduleCode: this.moduleCode,
      version: this.version,
      tables: this._tables.length,
      fieldSets: this._fieldSets.size,
      inlineFields: this._tables.reduce((sum, table) => sum + table.inlineFields.length, 0),
    }
  }

  _emitChange(reason) {
    try {
      this.dispatchEvent(new CustomEvent('meta-changed', { detail: { reason, model: this } }))
    } catch (_) { /* non-browser host */ }
  }

  _buildLoadRequest(options = {}) {
    const id = options.id || this.id || ''
    return {
      kind: options.kind || this.kind,
      id,
      domain: options.domain ?? this.domain,
      application: options.application ?? this.application,
      module: options.module ?? this.module,
      params: options.params && typeof options.params === 'object' ? options.params : {},
      signal: options.signal,
    }
  }

  async _resolveMeta(request) {
    if (typeof this.resolver === 'function') return this.resolver(request)
    if (this.serviceFn && this._host && typeof this._host[this.serviceFn] === 'function') {
      return this._host[this.serviceFn](request)
    }
    return fetchDefinitionConfig(this.apiPath, request)
  }

  async _resolveBaseMeta(request) {
    if (typeof this.baseResolver === 'function') return this.baseResolver(request)
    if (this.baseServiceFn && this._host && typeof this._host[this.baseServiceFn] === 'function') {
      return this._host[this.baseServiceFn](request)
    }
    return fetchDefinitionConfig(this.baseApiPath, request)
  }

  _inferBaseId(meta) {
    const refKey = this.kind === 'DOC' ? 'baseDocMetaRef' : 'baseDctMetaRef'
    return meta?.[refKey]?.file || (this.kind === 'DOC' ? 'base_doc_meta_v1.json' : 'base_dct_meta_v1.json')
  }
}

async function fetchDefinitionConfig(apiPath, request) {
  if (typeof fetch !== 'function') throw new Error('fetch is not available')
  const params = new URLSearchParams()
  const add = (key, value) => {
    if (value != null && value !== '') params.set(key, String(value))
  }
  add('kind', request.kind)
  add('id', request.id)
  add('domain', request.domain)
  add('application', request.application)
  add('module', request.module)
  for (const [key, value] of Object.entries(request.params || {})) add(key, value)
  const sep = String(apiPath).includes('?') ? '&' : '?'
  const res = await fetch(`${apiPath}${sep}${params.toString()}`, {
    headers: { Accept: 'application/json' },
    signal: request.signal,
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
  return data
}

/* kind → 模型类 注册表。子类（CmxDCTMeta/CmxDOCMeta）import 时自注册，
   使 loadMetaBatch 能按 kind 实例化对应模型，避免与子类的循环 import。 */
const META_MODEL_KINDS = new Map()
export function registerMetaModelKind(kind, ModelClass) {
  if (kind && typeof ModelClass === 'function') META_MODEL_KINDS.set(String(kind), ModelClass)
}

async function fetchDefinitionsBatch(apiPath, body, signal) {
  if (typeof fetch !== 'function') throw new Error('fetch is not available')
  const res = await fetch(apiPath, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
  return data
}

/**
 * 一次性批量加载多个元数据对象 + 它们引用的 base 字段集（单次后端请求，字段集不单独加载）。
 *
 * @param {Array<{domain,module,id}>|Array<string>} refs 要加载的定义引用
 * @param {object} [options]
 * @param {string} [options.apiPath='/api/definitions/batch'] 默认 fetch 兜底用的批量接口
 * @param {boolean} [options.includeBase=true] 是否附带 base 字段集
 * @param {object} [options.host] 绑定到各模型的页面 host；也是 serviceFn 的查找对象
 * @param {string} [options.serviceFn] 页面「服务面板」里声明并编译到 host 上的批量服务名。
 *        提供且 host[serviceFn] 为函数时，后端调用走该服务（host[serviceFn](body,{signal})），
 *        而非库内硬编码 fetch——让加载统一走服务面板定义的服务。
 * @param {(body, signal)=>Promise<any>} [options.resolver] 自定义批量加载器（最高优先级，便于测试）
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{ models: CmxBaseMeta[], byId: Record<string,CmxBaseMeta>, byFile: Record<string,CmxBaseMeta>, byKind: Record<string,CmxBaseMeta[]>, dct: CmxBaseMeta[], doc: CmxBaseMeta[], bases: Record<string,object>, basePaths: Record<string,object>, errors: Array, via: string, get(id): CmxBaseMeta|null }>}
 *   via：本次后端调用实际路径——'resolver' | 'service:<serviceFn>' | 'fetch'
 */
export async function loadMetaBatch(refs, options = {}) {
  const apiPath = options.apiPath || '/api/definitions/batch'
  const includeBase = options.includeBase !== false
  const body = { refs: Array.isArray(refs) ? refs : [], includeBase }
  // 后端调用优先级：resolver（测试/自定义） > 服务面板声明的服务(serviceFn) > 默认 fetch 兜底。
  // serviceFn 路径让批量加载与单条加载（CmxBaseMeta._resolveMeta 的 serviceFn）一致地走服务面板。
  // via：记录本次后端调用实际走的路径，随结果返回，供调用方展示「用什么方式加载」。
  let result
  let via
  if (typeof options.resolver === 'function') {
    via = 'resolver'
    result = await options.resolver(body, options.signal)
  } else if (options.serviceFn && options.host && typeof options.host[options.serviceFn] === 'function') {
    via = 'service:' + options.serviceFn
    result = await options.host[options.serviceFn](body, { signal: options.signal })
  } else {
    via = 'fetch'
    result = await fetchDefinitionsBatch(apiPath, body, options.signal)
  }

  const bases = result?.bases && typeof result.bases === 'object' ? result.bases : {}
  const basePaths = result?.basePaths && typeof result.basePaths === 'object' ? result.basePaths : {}
  const items = Array.isArray(result?.items) ? result.items : []
  const errors = Array.isArray(result?.errors) ? [...result.errors] : []

  const targets = options.targets && typeof options.targets === 'object' ? options.targets : null
  const models = []
  const byId = {}
  const byKind = {}
  for (const item of items) {
    // 定位段值：后端批量响应用 file 字段返回文件名（与 id 同值）；优先取 item.id（如后端将来改带 id）。
    const itemId = item.id || item.file
    // 优先命中调用方提供的既有实例（模型面板里声明的 dctMeta/docMeta）：按 id 再按 kind。
    // 否则按 kind 新建一个实例。
    let model = targets ? (targets[itemId] || targets[item.kind] || null) : null
    if (!model) {
      const ModelClass = META_MODEL_KINDS.get(String(item.kind))
      if (!ModelClass) { errors.push({ ref: item, error: `未注册的元数据 kind: ${item.kind}` }); continue }
      model = new ModelClass({ domain: item.domain, module: item.module, id: itemId })
    }
    try {
      if (options.host) model.bindHost(options.host)
      // 就地装载 doc + 合并同批响应里的 base 字段集（不再单独请求）
      model.applyBatchItem(item, bases, { includeBase })
      models.push(model)
      if (itemId) byId[itemId] = model
      ;(byKind[item.kind] = byKind[item.kind] || []).push(model)
    } catch (err) {
      errors.push({ ref: item, error: err && err.message || String(err) })
    }
  }
  return {
    models,
    byId,
    // 向下兼容别名：历史返回 byFile / get(file)，语义与 byId 等价（key 均为文件名值，即 id）。
    byFile: byId,
    byKind,
    dct: byKind.DCT || [],
    doc: byKind.DOC || [],
    bases,
    basePaths,
    errors,
    via,
    get(id) { return byId[String(id)] || null },
  }
}

/**
 * 把「模型面板里已声明的元数据实例」用单次批量请求就地装载。
 *
 * 与 loadMetaBatch 的区别：调用方传入**已存在**的实例（host.dctMeta / host.docMeta，
 * 由 init-page-models 依模型面板声明构造），本函数从各实例的 {domain,module,file}
 * 推断 refs，单次取回后用 applyBatchItem 把数据灌入这些既有对象——不创建新实例、
 * 字段集随响应内联（不单独加载）。
 *
 * @param {Record<string,CmxBaseMeta>|CmxBaseMeta[]} models 已声明的模型实例集合
 *        （对象形式 key 任意，如 { dctMeta, docMeta }；数组形式按顺序）
 * @param {object} [options] 透传给 loadMetaBatch（apiPath/includeBase/host/serviceFn/resolver/signal）
 *        传 serviceFn + host 时，后端调用走服务面板声明的服务（推荐用法）
 * @param {Array} [options.refs] 显式 refs（覆盖从模型推断）
 * @returns {Promise<Awaited<ReturnType<typeof loadMetaBatch>>>}
 */
export async function loadMetaModelsBatch(models, options = {}) {
  const list = (Array.isArray(models) ? models : Object.values(models || {})).filter(Boolean)
  // targets：按 id 与 kind 双索引，让 loadMetaBatch 命中既有实例而非新建
  const targets = {}
  for (const model of list) {
    if (model.id) targets[model.id] = model
    if (model.kind && targets[model.kind] == null) targets[model.kind] = model
  }
  // refs：显式优先，否则从各模型的 domain/module/id 推断（id 必填）
  const refs = Array.isArray(options.refs) && options.refs.length
    ? options.refs
    : list
      .map((model) => ({ kind: model.kind, domain: model.domain, module: model.module, id: model.id }))
      .filter((ref) => ref.id)
  return loadMetaBatch(refs, { ...options, targets })
}
