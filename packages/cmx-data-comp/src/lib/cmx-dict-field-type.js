/**
 * cmx-dict-field-type — 注册 `dict-select` 字段类型（form + grid 双端）。
 *
 *   import 'cmx-data-comp/lib/cmx-dict-field-type.js'   // 副作用注册
 *
 * 让 CmxColumn / cmx-ui5-form 字段通过 `type:'dict-select'` 即可使用 <cmx-dict-select>，
 * 把「关联哪个字典 + ID/名称/ParentID 列 + help 布局 + 数据源」放在 field.editSettings 里。
 *
 * field.editSettings 约定（与 <cmx-dict-select>.configure 同名透传）：
 *   dictCode, idCol, labelCol, parentCol, hierarchical,
 *   helpLayout('classify'|'group'|'grid'), columns,
 *   dataSource | source(string，走 form dsProvider),
 *   coord{domain,application,module,file?} —— 字典坐标，兜底数据源拼 /api/dct/data/search 用，
 *       由定义中心设计期自动注入（运行时 host 无坐标，这是唯一来源；file 可缺，后端自动解析）,
 *   classifyTreeSource, groupTreeSource, personalizationService,
 *   showClear, mruMax, placeholder,
 *   valueField, displayField, displayMode('auto'|'value'|'code'|'label'|'code-label'),
 *   writeBack, writeBackFields, excludeWriteBackFields
 *
 * 取值：默认选中行的 id 写回字段；设置 valueField 后取字典行对应列。
 * 旧模式仍保留：字典行列值写到 `${prop}.${dictCode}.${colId}`；
 * 显示文本走 `${prop}_label` 冗余字段（业务可在变更时写入）。
 * 新模式：writeBack 把字典行字段映射到当前宿主 row 任意字段，可见/隐藏列都可写入。
 */
import { registerFieldType } from './cmx-form-field-registry.js'
import '../components/cmx-dict-select.js'

const DEFAULT_DICT_WRITEBACK_EXCLUDE = new Set([
  'children',
  'group',
  'groups',
  'group_id',
  'group_ids',
  'group_code',
  'group_name',
  'group_path',
  'classify',
  'classify_id',
  'classify_code',
  'classify_name',
  'classify_path',
])

function asFieldSet (value) {
  if (!value) return null
  if (value instanceof Set) return value
  if (Array.isArray(value)) return new Set(value.map(String))
  if (typeof value === 'string') {
    return new Set(value.split(',').map(s => s.trim()).filter(Boolean))
  }
  return null
}

function shouldWriteBackDictCol (colId, opts = {}) {
  if (!colId || colId.startsWith('_')) return false
  const include = asFieldSet(opts.writeBackFields)
  if (include) return include.has(colId)
  const exclude = asFieldSet(opts.excludeWriteBackFields) || new Set()
  if (DEFAULT_DICT_WRITEBACK_EXCLUDE.has(colId) || exclude.has(colId)) return false
  return true
}

function dictWriteBackNamespaceFromField (field) {
  const es = field?.editSettings || {}
  // dictCode 统一取自 field.refDict（与「引用字典」合一）；兼容历史 editSettings.dictCode。
  return String(field?.refDict ?? es.dictCode ?? es.source ?? field?.source ?? field?.key ?? '').trim()
}

function fieldFromGridCellProps (props = {}) {
  const column = props.column || {}
  const cmxCol = column._cmxCol
  return cmxCol
    ? { key: cmxCol.id || props.prop, editSettings: cmxCol.editSettings || {}, source: cmxCol.editSettings?.source || column.source, refDict: cmxCol.refDict, resolve: cmxCol.display?.resolve }
    : { key: props.prop, editSettings: column.editSettings || {}, source: column.source, refDict: column.refDict, resolve: column.display?.resolve }
}

function firstNonBlank (row, keys) {
  for (const key of keys) {
    const value = row?.[key]
    if (value != null && String(value) !== '') return value
  }
  return null
}

function valueAtPath (obj, path) {
  if (!obj || path == null || path === '') return undefined
  const parts = String(path).split('.').filter(Boolean)
  let cur = obj
  for (const p of parts) {
    if (cur == null) return undefined
    cur = cur[p]
  }
  return cur
}

function renderTemplate (tpl, row) {
  return String(tpl).replace(/\$\{([^}]+)\}/g, (_m, expr) => {
    const v = valueAtPath(row, String(expr).trim())
    return v == null ? '' : String(v)
  })
}

function normalizeWriteBackMap (writeBack) {
  if (!writeBack) return null
  if (typeof writeBack === 'function') return writeBack
  if (typeof writeBack !== 'object') return null
  const out = {}
  const add = (obj) => {
    if (!obj || typeof obj !== 'object') return
    for (const [k, v] of Object.entries(obj)) out[k] = v
  }
  add(writeBack)
  // 可选语义分组；是否展示仍由 ColumnModel 决定，这里统一写 row。
  add(writeBack.visible)
  add(writeBack.hidden)
  delete out.visible
  delete out.hidden
  return Object.keys(out).length ? out : null
}

function resolveMappedValue (plain, sourceSpec, row, fieldKey) {
  if (typeof sourceSpec === 'function') return sourceSpec(plain, row, fieldKey)
  if (sourceSpec == null) return undefined
  if (typeof sourceSpec === 'string') {
    const s = sourceSpec.trim()
    if (s.includes('${')) return renderTemplate(s, plain)
    return valueAtPath(plain, s)
  }
  return sourceSpec
}

function selectedValueFromDictRow (plain, field, fallback) {
  const es = field?.editSettings || {}
  const valueField = es.valueField ?? es.idCol
  if (plain && valueField) {
    const v = valueAtPath(plain, valueField)
    if (v != null) return v
  }
  return fallback
}

function dictCachedRowFromHost (row, fieldKey, dictCode) {
  if (!row || !fieldKey || !dictCode) return null
  const baseKey = `${fieldKey}.${dictCode}.`
  const plain = {}
  let hasAny = false
  for (const key of Object.keys(row)) {
    if (!key.startsWith(baseKey)) continue
    plain[key.slice(baseKey.length)] = row[key]
    hasAny = true
  }
  return hasAny ? plain : null
}

function pickRows (res) {
  if (res == null) return []
  if (Array.isArray(res)) return res
  if (Array.isArray(res.rows)) return res.rows
  if (Array.isArray(res.items)) return res.items
  if (Array.isArray(res.data)) return res.data
  if (Array.isArray(res.data?.rows)) return res.data.rows
  if (Array.isArray(res.data?.items)) return res.data.items
  return []
}

function createRestDictDataSource (es, field) {
  // dictCode 统一取自 field.refDict（与「引用字典」合一）；兼容历史 editSettings.dictCode。
  const dictCode = field?.refDict ?? es.dictCode ?? field?.source
  if (!dictCode || typeof fetch !== 'function') return null
  const coord = es.coord || {}
  const valueField = es.valueField ?? es.codeCol ?? es.idCol ?? 'code'
  const labelField = es.labelCol ?? 'name'
  // 新字典数据服务：POST /api/dct/data/search —— 直读 cf_* 物理表（旧 /api/dict/* 已下线）。
  // query 带 domain/application/module/dict 四元坐标；file 不传，后端按 dictCode 自动解析定位 DCT 文件。
  // 坐标在设计期固化进 field.editSettings.coord（运行时 host 无坐标，唯一来源）。
  const qs = new URLSearchParams({ dict: dictCode })
  if (coord.domain) qs.set('domain', coord.domain)
  if (coord.application) qs.set('application', coord.application)
  if (coord.app && !coord.application) qs.set('application', coord.app)
  if (coord.module) qs.set('module', coord.module)
  const url = es.dataSourceUrl || `/api/dct/data/search?${qs.toString()}`
  const baseFilters = es.filters || es.dictFilters || null
  const pageSize = es.pageSize || 50
  const withFilters = (filters) => {
    const out = { ...(baseFilters || {}) }
    if (filters && typeof filters === 'object') Object.assign(out, filters)
    return out
  }
  const post = async (body, signal) => {
    const headers = { 'content-type': 'application/json' }
    // db_id 指向字典数据所在的物理库（如 fico-db）；缺失时后端回退默认库。
    // 设计期随 coord 一起固化进 editSettings.coord.dbId。
    if (coord.dbId) headers.db_id = coord.dbId
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body || {}),
      signal,
    })
    if (!res.ok) throw new Error(`[cmx-dict-select] dict ${dictCode} search failed: HTTP ${res.status}`)
    return res.json()
  }
  return {
    id: dictCode,
    keyField: valueField,
    labelField,
    pageSize,
    async search (q, opts = {}) {
      const res = await post({
        q: q || '',
        filters: withFilters(opts.filters),
        page: opts.page || 1,
        pageSize: opts.pageSize || pageSize,
      }, opts.signal)
      return pickRows(res)
    },
    async loadByKeys (keys, opts = {}) {
      const clean = (keys || []).filter((x) => x != null && String(x) !== '')
      if (!clean.length) return []
      const res = await post({
        filters: withFilters({ [valueField]: clean }),
        page: 1,
        pageSize: Math.max(20, clean.length),
      }, opts.signal)
      return pickRows(res)
    },
  }
}

function formatDictDisplayFromRow (row, field, raw) {
  const fieldKey = field?.key
  const dictCode = dictWriteBackNamespaceFromField(field)
  const es = field?.editSettings || {}
  if (fieldKey && dictCode) {
    const cached = dictCachedRowFromHost(row, fieldKey, dictCode)
    const mode = es.displayMode || (es.displayField ? 'field' : 'auto')
    if (cached) {
      if (es.displayField) {
        const v = valueAtPath(cached, es.displayField)
        if (v != null && String(v) !== '') return String(v)
      }
      const codeField = es.codeCol || 'code'
      const labelField = es.labelCol || 'name'
      const code = firstNonBlank(cached, [codeField, 'code', 'item_code', 'item-code'])
      const name = firstNonBlank(cached, [labelField, 'name', 'item_name', 'item-name'])
      if (mode === 'value') return raw == null ? '' : String(raw)
      if (mode === 'code') return code == null ? (raw == null ? '' : String(raw)) : String(code)
      if (mode === 'label') return name == null ? (raw == null ? '' : String(raw)) : String(name)
      if (mode === 'code-label' || mode === 'auto' || mode === 'field') {
        if (code != null || name != null) {
          if (code != null && name != null) return `${code} - ${name}`
          return String(code ?? name)
        }
      }
    }
  }
  const label = row?.[`${fieldKey}_label`]
  if (label != null && String(label) !== '') return String(label)
  // 展开字段和 _label 都缺失（后端首次加载的行无展开字段）：
  // 回退到列上的 display.resolve（由 enableDictEcho 从 CmxDictCache 挂上，O(1) 查 id→name）。
  if (typeof field.resolve === 'function' && raw != null && String(raw) !== '') {
    const resolved = field.resolve(raw)
    if (resolved != null && String(resolved) !== '' && String(resolved) !== String(raw)) return String(resolved)
  }
  return raw == null ? '' : String(raw)
}

function formatDictCellValue (props = {}) {
  const field = fieldFromGridCellProps(props)
  return formatDictDisplayFromRow(props.model || {}, field, props.model?.[props.prop])
}

/**
 * 把字典选中行的业务列值回写到宿主数据行上，键名格式为 `${fieldKey}.${dictCode}.${colId}`。
 * 例如字段 key='customer'，绑定字典 dictCode='customer'，选中行 { code:'C001', name:'上海', region:'华东' }
 *   → row['customer.customer.code']='C001'、row['customer.customer.name']='上海'、row['customer.customer.region']='华东'
 * 同时把 `${fieldKey}_label` 冗余写入，供 cellTemplate / 只读显示。
 * @param {object} row     宿主数据行（CmxRowSet 或普通对象）
 * @param {string} fieldKey 被维护字段名（dictid）
 * @param {string} dictCode 绑定字典 id / dictCode
 * @param {object} plain   字典选中行的纯对象（含所有列）
 * @param {string} [labelText] input 显示文本（编码-名称）
 * @param {object} [opts]  回写选项：writeBackFields / excludeWriteBackFields / previousValue
 */
function applyDictRowToHost (row, fieldKey, dictCode, plain, labelText, opts = {}) {
  if (!row || !fieldKey) return
  const namespace = dictCode == null || dictCode === '' ? '' : String(dictCode).trim()
  const previousValue = opts.previousValue == null || opts.previousValue === '' ? '' : String(opts.previousValue)
  const baseKey = namespace ? `${fieldKey}.${namespace}.` : ''
  const setOne = (k, v) => {
    // 字典展开字段是内部缓存字段，静默写入；主业务字段由 ctx.commit / grid save 负责通知。
    row[k] = v
  }
  const deleteOne = (k) => {
    if (!Object.prototype.hasOwnProperty.call(row, k)) return
    delete row[k]
  }
  const nextKeys = new Set()
  if (baseKey && plain && typeof plain === 'object') {
    for (const colId of Object.keys(plain)) {
      if (!shouldWriteBackDictCol(colId, opts)) continue
      nextKeys.add(`${baseKey}${colId}`)
    }
  }
  const stalePrefixes = new Set()
  if (baseKey) stalePrefixes.add(baseKey)
  // 兼容清理早期误用“选中字典项 id”作为中间段而写出的旧键，如 customer.C001.code。
  if (previousValue) stalePrefixes.add(`${fieldKey}.${previousValue}.`)
  for (const key of Object.keys(row)) {
    for (const prefix of stalePrefixes) {
      if (key.startsWith(prefix) && !nextKeys.has(key)) {
        deleteOne(key)
        break
      }
    }
  }
  if (baseKey && plain && typeof plain === 'object') {
    for (const colId of Object.keys(plain)) {
      if (!shouldWriteBackDictCol(colId, opts)) continue
      setOne(`${baseKey}${colId}`, plain[colId])
    }
  }
  if (labelText != null || !plain) setOne(`${fieldKey}_label`, labelText ?? '')
  const writeBack = normalizeWriteBackMap(opts.writeBack)
  if (!writeBack) return
  if (typeof writeBack === 'function') {
    writeBack(row, plain || null, { fieldKey, dictCode, labelText })
    return
  }
  const kv = {}
  for (const [targetField, sourceSpec] of Object.entries(writeBack)) {
    if (!targetField) continue
    kv[targetField] = plain ? resolveMappedValue(plain, sourceSpec, row, fieldKey) : null
  }
  if (typeof row.setValues === 'function') row.setValues(kv)
  else Object.assign(row, kv)
}

/** 从 field 收敛出传给 <cmx-dict-select>.configure 的配置对象。 */
function dictCfgFromField (field, resolveDataSource) {
  const es = field?.editSettings || {}
  const cfg = {
    dictCode: field?.refDict ?? es.dictCode ?? field?.source ?? '',
    idCol: es.idCol ?? 'id',
    labelCol: es.labelCol ?? 'name',
    codeCol: es.codeCol ?? '',
    parentCol: es.parentCol ?? 'parent_id',
    hierarchical: !!es.hierarchical,
    helpLayout: es.helpLayout ?? 'grid',
    columns: es.columns ?? null,
    classifyTreeSource: es.classifyTreeSource ?? null,
    groupTreeSource: es.groupTreeSource ?? null,
    personalizationService: es.personalizationService ?? null,
    showClear: es.showClear !== false,
    mruMax: es.mruMax,
    placeholder: es.placeholder,
    dictTitle: es.dictTitle,
  }
  // 数据源：优先显式对象；否则 string source 经 form dsProvider 解析
  if (es.dataSource && typeof es.dataSource.search === 'function') {
    cfg.dataSource = es.dataSource
  } else {
    const src = es.source ?? field?.source
    if (typeof src === 'string' && typeof resolveDataSource === 'function') {
      const ds = resolveDataSource(src)
      if (ds) cfg.dataSource = ds
    }
    if (!cfg.dataSource) {
      const ds = createRestDictDataSource(es, field)
      if (ds) cfg.dataSource = ds
    }
  }
  return cfg
}

registerFieldType('dict-select', {
  description: '数据字典选择（分级/分类/分组 + MRU + 边输边搜 + help 三布局）',
  form: {
    create (field, ctx) {
      const el = document.createElement('cmx-dict-select')
      el.style.cssText = 'display:block;width:100%;'
      el.configure(dictCfgFromField(field, ctx.resolveDataSource))
      if (field.readonly) el.configure({ readonly: true })
      el.addEventListener('cmx-dict-change', (e) => {
        const d = e.detail || {}
        const previousValue = ctx.row?.[field.key]
        const dictCode = dictWriteBackNamespaceFromField(field)
        const selectedValue = selectedValueFromDictRow(d.plain, field, d.id ?? null)
        // 把字典选中行的业务列回写到当前行：${field.key}.${dictCode}.${colId} = value
        applyDictRowToHost(ctx.row, field.key, dictCode, d.plain, d.text, { ...(field.editSettings || {}), previousValue })
        ctx.commit(field, selectedValue)
      })
      return el
    },
    write (editor, raw, field, ctx) {
      if (typeof editor.setValue !== 'function') return
      const row = ctx?.row || null
      const dictCode = dictWriteBackNamespaceFromField(field)
      const rowData = dictCachedRowFromHost(row, field?.key, dictCode)
      const displayText = formatDictDisplayFromRow(row, field, raw)
      editor.setValue(raw ?? null, { silent: true, displayText, rowData })
    },
  },
  grid: {
    /** revo-grid v4：placeholder <div> + componentDidRender 挂入 <cmx-dict-select>（同 combo 套路）。 */
    editor (colData, save, close) {
      const column = colData?.column || colData
      const cmxCol = column?._cmxCol
      const field = cmxCol
        ? { key: cmxCol.id, type: 'dict-select', editSettings: cmxCol.editSettings || {}, source: cmxCol.editSettings?.source, refDict: cmxCol.refDict }
        : { key: column?.prop || colData?.prop, type: 'dict-select', editSettings: column?.editSettings || {}, source: column?.source, refDict: column?.refDict }
      const initial = colData?.model && (colData?.prop != null) ? colData.model[colData.prop] : null
      const dictCode = dictWriteBackNamespaceFromField(field)
      const initialRowData = dictCachedRowFromHost(colData?.model, field.key, dictCode)
      const initialDisplayText = formatDictDisplayFromRow(colData?.model || {}, field, initial)

      const editor = {
        _el: null,
        render (h) {
          return h('div', {
            class: 'cmx-dict-editor-slot',
            style: { width: '100%', height: '100%', display: 'flex', boxSizing: 'border-box' },
          })
        },
        getValue () {
          if (editor._el && typeof editor._el.getValue === 'function') return editor._el.getValue()
          return initial
        },
        beforeAutoSave (val) { return val !== initial },
        componentDidRender () {
          const root = (/** @type {any} */ (this)).element
          if (!root) return
          const slot = root.querySelector?.('.cmx-dict-editor-slot') || root
          if (editor._el && editor._el.isConnected) return
          const el = document.createElement('cmx-dict-select')
          el.setAttribute('data-cmx-fill-host', '')
          el.style.cssText = 'width:100%;height:100%;'
          el.configure(dictCfgFromField(field, null))
          if (initial != null) el.setValue(initial, { silent: true, rowData: initialRowData, displayText: initialDisplayText })
          el.addEventListener('cmx-dict-change', (e) => {
            const d = e.detail || {}
            const previousValue = colData?.model?.[field.key]
            const selectedValue = selectedValueFromDictRow(d.plain, field, d.id ?? null)
            // 先把字典业务列回写到当前 grid 行（model 即宿主行对象）：${field.key}.${dictCode}.${colId}=value
            applyDictRowToHost(colData?.model, field.key, dictCode, d.plain, d.text, { ...(field.editSettings || {}), previousValue })
            save(selectedValue)
            /* 选中后立即结束编辑：与 combo / ignite-combo 编辑器一致，让 RevoGrid 即时落库并收起编辑器。
               否则编辑器悬空、靠失焦兜底——最后一行失焦时 disconnect 会抢先卸载导致这次 save 丢失。 */
            close()
          })
          slot.appendChild(el)
          editor._el = el
          requestAnimationFrame(() => { try { el.shadowRoot?.getElementById('inp')?.focus() } catch (_) {} })
        },
        disconnectedCallback () { editor._el = null },
      }
      return editor
    },
    cellTemplate (h, props) {
      return formatDictCellValue(props)
    },
  },
})
