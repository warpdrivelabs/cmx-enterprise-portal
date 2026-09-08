/**
 * cmx-dct-source — 字典（DCT）数据装载/回存前端适配层（对标 cmx-doc-source，简化为单表）
 *
 * 三件事：
 *   ① loadDictData(host, def)                POST /api/dct/data/tokio-zmc-msgpack（主，二进制）
 *                                             + JSON 兜底 /api/dct/data/search
 *                                             → 列压缩包 → CmxDataSet.fromJSON → { dict: CmxDataSet }
 *   ② loadDictChildren(host, def, opts)     按 parentId 拉取字典层级树的直接子层
 *   ③ saveDictData(host, def, payload)      merge/replace changeset → POST /api/dct/save
 *   附：deleteDictEntry / upsertDictEntries / sanitizeChangeSet / normalizeDictRow
 *
 * 与 cmx-doc-source 的差异：
 *   - 字典是**单表**（协调器 schema 只 `dict` 一层），dsMap 只一个键；不需要嵌套 _children
 *   - selfHierarchy=true 的层级字典（如 gl_account），运行时需派生 hasChildren/full_path/level_no
 *     等 UI 字段——`normalizeDictRow` 提供通用归一化，`sanitizeChangeSet` 保存时过滤 UI 字段
 *   - 端点固定在 /api/dct/*（区别于 /api/doc/*），坐标查询参数 `dict={字典编码}` 必带
 */

import { CmxDataSet } from './cmx-data-set.js'
import { decodeMsgpack } from './cmx-msgpack-decode.js'
import { normalizeDocCoord, docCoordQuery } from './cmx-doc-coord.js'
import { readHttpErrorMessage } from './cmx-doc-source.js'

const DEFAULT_API = {
  // 装载端点：/api/dct/data/tokio-zmc-msgpack（主，二进制零拷贝）+ /api/dct/data/search（JSON 兜底）
  dataPathBin: '/api/dct/data/tokio-zmc-msgpack',
  dataPathJson: '/api/dct/data/search',
  childrenPath: '/api/dct/data/children',
  savePath: '/api/dct/save',
  upsertPath: '/api/dct/entries',
  deletePath: '/api/dct/entries',   // + /{id}
}

/** UI-only 字段集合（前端派生，不能进 DB）。sanitizeChangeSet / _insertedFields 用。 */
const UI_ONLY_FIELDS = new Set([
  'is_selected', 'children_loading', 'displayValue', 'hasChildren',
  'sortKey', 'fullText', 'path', 'pathStr',
])

/** 只读服务端字段（新增/更新时都不传）。 */
const READONLY_FIELDS = new Set([
  'create_time', 'update_time', 'create_by', 'update_by',
  'full_path', 'level_no',   // 树形派生列由后端物化
])

/**
 * 装载字典数据为 { dict: CmxDataSet }。
 *
 * @param {object} host                页面 host（提供可选自定义 fetch）
 * @param {object} def
 * @param {string} def.domain
 * @param {string} def.application
 * @param {string} def.module
 * @param {string} def.file            DCT 定义文件名（cmxfico_dct_meta_v3.json 之类）
 * @param {string} def.dict            字典编码（gl_account 等；必填）
 * @param {string} [def.datasetId]     协调器 schema 层 id（默认 'dict'）
 * @param {string} [def.dbId]          目标库（写入 db_id 头）
 * @param {string} [def.apiPath]       覆盖默认端点
 * @param {boolean} [def.binary=true]  false 时直接走 JSON /api/dct/data/search，跳过 msgpack
 * @param {object}  [def.query]        分页 / 过滤 body（{ parentId, page, pageSize, filter, ... }）
 * @param {any}     [def.parentId]     便捷参数：等价 def.query.parentId
 * @param {number}  [def.page]         便捷参数：等价 def.query.page
 * @param {number}  [def.pageSize]     便捷参数：等价 def.query.pageSize
 * @param {AbortSignal} [def.signal]
 * @returns {Promise<{ dsMap: Record<string,CmxDataSet>, pkg: object, total: number|null, rows: object[] }>}
 */
export async function loadDictData (host, def) {
  if (!def || !def.dict) throw new Error('[loadDictData] def.dict 必填（字典编码，如 gl_account）')
  const useBinary = def.binary !== false
  const datasetId = def.datasetId || 'dict'
  const apiPath = def.apiPath || (useBinary ? DEFAULT_API.dataPathBin : DEFAULT_API.dataPathJson)

  const params = docCoordQuery(def)
  params.set('dict', def.dict)

  const headers = { 'Content-Type': 'application/json', Accept: useBinary ? 'application/x-msgpack' : 'application/json' }
  if (def.dbId) headers.db_id = def.dbId

  const body = _buildQueryBody(def)

  let res
  try {
    res = await _fetch(host, `${apiPath}?${params.toString()}`, {
      method: 'POST', headers, body: JSON.stringify(body), signal: def.signal,
    })
  } catch (e) {
    // 网络错误直接抛，跳过 msgpack 兜底
    throw new Error(`[loadDictData] 请求失败: ${e && e.message || e}`)
  }

  // 二进制 → arrayBuffer + msgpack decode；JSON → res.json()。解出结构一致。
  let pkg = null
  if (useBinary) {
    const ct = res.headers && res.headers.get ? (res.headers.get('content-type') || '') : ''
    if (ct.indexOf('msgpack') >= 0) {
      const buf = await res.arrayBuffer().catch(() => null)
      const body = buf ? _safeDecode(new Uint8Array(buf)) : null
      pkg = _unwrapDictPkg(body, res)
    } else {
      // 后端未按 msgpack 返回（可能环境不支持 zmc）→ 解 JSON
      const bodyJson = await res.json().catch(() => null)
      pkg = _unwrapDictPkg(bodyJson, res)
    }
  } else {
    const bodyJson = await res.json().catch(() => null)
    pkg = _unwrapDictPkg(bodyJson, res)
  }

  // pkg 有 datasetId+columns+rows 时走 fromJSON（列压缩包），否则退化 rows 直建（兼容 search 端点旧格式）。
  let ds
  if (pkg && pkg.datasetId != null && Array.isArray(pkg.columns)) {
    ds = CmxDataSet.fromJSON({ ...pkg, datasetId })   // 强制统一 datasetId 到协调器 schema
  } else {
    const rows = (pkg && Array.isArray(pkg.rows)) ? pkg.rows : []
    ds = new CmxDataSet({ datasetId })
    if (rows.length) ds.setRows(rows)
  }

  const dsMap = { [datasetId]: ds }
  const total = pkg && pkg.total != null ? pkg.total : null
  const rows = ds.rows || []
  return { dsMap, pkg, total, rows }
}

/**
 * 按 parentId 拉字典层级树的直接子层。selfHierarchy=true 的字典懒下钻用。
 * 未来后端 /api/dct/data/children 就绪时改走那里；当前退化为 loadDictData(parentId=...)。
 *
 * @param {object} host
 * @param {object} def   同 loadDictData
 * @param {object} opts  { parentId, pageSize?, signal? }
 * @returns {Promise<{ rows: object[], total: number|null, pkg: object }>}
 */
export async function loadDictChildren (host, def, opts) {
  const parentId = opts && opts.parentId != null ? opts.parentId : null
  const r = await loadDictData(host, {
    ...def,
    parentId,
    page: 1,
    pageSize: (opts && opts.pageSize) || 300,
    signal: opts && opts.signal,
  })
  return { rows: r.rows, total: r.total, pkg: r.pkg }
}

/**
 * 回存字典 changeset。行为对齐 saveDocData：
 *   - HTTP 409 → err.conflict=true
 *   - 422 或 code=422 或 data.violations 非空 → err.validation=true, err.violations=[]
 *   - payload.collector.refreshBaselines(updatedAt) 用后端回传新 update_time 刷新基线
 *
 * changeset 里的 UI-only 字段（is_selected/children_loading/...）由本函数在发送前 sanitize，
 * 调用方不需要提前过滤。
 *
 * @param {object} host
 * @param {object} def       { domain, application, module, file, dbId, dict, apiPath? }
 * @param {object} payload
 * @param {'merge'|'replace'} [payload.saveMode='merge']
 * @param {object} [payload.changes]     merge 模式 changeset（{[path]: {inserted,updated,deleted}}）
 * @param {object} [payload.collector]   传则用回传 updatedAt 刷新前端基线
 * @param {object} [payload.tableNames]  物理表名 → 中文别名，出错时格式化 violations 用
 * @param {AbortSignal} [payload.signal]
 * @returns {Promise<{ok:boolean, mode:string, affected:number, updatedAt?:object[]}>}
 */
export async function saveDictData (host, def, payload) {
  if (!def || !def.dict) throw new Error('[saveDictData] def.dict 必填')
  const c = normalizeDocCoord(def)
  const apiPath = def.saveApiPath || DEFAULT_API.savePath
  const params = docCoordQuery(c)
  params.set('dict', def.dict)
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' }
  if (c.dbId) headers.db_id = c.dbId

  const body = { saveMode: payload.saveMode || 'merge' }
  if (payload.changes) body.changes = sanitizeChangeSet(payload.changes)
  if (payload.snapshot) body.snapshot = payload.snapshot

  const res = await _fetch(host, `${apiPath}?${params.toString()}`, {
    method: 'POST', headers, body: JSON.stringify(body), signal: payload.signal,
  })
  const resp = await res.json().catch(() => null)
  if (!res.ok) {
    const msg = (resp && (resp.error || resp.msg)) || res.status
    if (res.status === 409) {
      const err = new Error(`[saveDictData] 保存冲突: ${msg}`)
      err.conflict = true
      throw err
    }
    const vErr = _validationError(resp, msg, payload.tableNames)
    if (vErr) throw vErr
    throw new Error(`[saveDictData] 保存失败: ${msg}`)
  }
  const data = (resp && typeof resp.code === 'number')
    ? (resp.code !== 0
        ? (() => {
            const vErr = _validationError(resp, resp.msg || resp.error || res.status, payload.tableNames)
            if (vErr) throw vErr
            throw new Error(`[saveDictData] 保存失败: ${resp.msg || resp.error || res.status}`)
          })()
        : resp.data)
    : resp
  if (payload.collector && data && Array.isArray(data.updatedAt)) {
    payload.collector.refreshBaselines(data.updatedAt)
  }
  return data
}

/**
 * 单行 upsert（新增或按 id 更新单条）。适合"立即保存"型交互。
 * @param {object} host
 * @param {object} def   { domain, application, module, file, dict, dbId }
 * @param {object[]} rows
 * @returns {Promise<object>} 后端返回原样（拆信封后）
 */
export async function upsertDictEntries (host, def, rows) {
  if (!def || !def.dict) throw new Error('[upsertDictEntries] def.dict 必填')
  const c = normalizeDocCoord(def)
  const params = docCoordQuery(c)
  params.set('dict', def.dict)
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' }
  if (c.dbId) headers.db_id = c.dbId
  const body = (rows || []).map((r) => _stripReadonly(_plain(r)))
  const res = await _fetch(host, `${DEFAULT_API.upsertPath}?${params.toString()}`, {
    method: 'POST', headers, body: JSON.stringify(body),
  })
  const resp = await res.json().catch(() => null)
  if (!res.ok) throw new Error(`[upsertDictEntries] 保存失败: ${(resp && (resp.error || resp.msg)) || res.status}`)
  return (resp && typeof resp.code === 'number') ? resp.data : resp
}

/**
 * 按 id 删单条字典行。
 * @param {object} host
 * @param {object} def   { domain, application, module, file, dict, dbId }
 * @param {string|number} id
 * @returns {Promise<object>}
 */
export async function deleteDictEntry (host, def, id) {
  if (!def || !def.dict) throw new Error('[deleteDictEntry] def.dict 必填')
  const c = normalizeDocCoord(def)
  const params = docCoordQuery(c)
  params.set('dict', def.dict)
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' }
  if (c.dbId) headers.db_id = c.dbId
  const res = await _fetch(host, `${DEFAULT_API.deletePath}/${encodeURIComponent(id)}?${params.toString()}`, {
    method: 'DELETE', headers,
  })
  const resp = await res.json().catch(() => null)
  if (!res.ok) throw new Error(`[deleteDictEntry] 删除失败: ${(resp && (resp.error || resp.msg)) || res.status}`)
  return (resp && typeof resp.code === 'number') ? resp.data : resp
}

// ─── UI 归一化辅助 ─────────────────────────────────────────────────────────

/**
 * 归一化一条字典行：补 UI 派生字段（hasChildren/full_path/level_no/displayValue）。
 *
 * 对 selfHierarchy=true 的层级字典生效。字典元数据里通常有：
 *   idField='id', codeField='code', labelField='name', parentField='parent_id'
 * 都可以从 dictMeta 传入（未传时用约定名兜底）。
 *
 * @param {object} row
 * @param {object} [dictMeta]  {idField,codeField,labelField,parentField,titleCols?}
 * @returns {object} 归一化后的新对象（不修改入参）
 */
export function normalizeDictRow (row, dictMeta) {
  if (!row || typeof row !== 'object') return row
  const meta = dictMeta || {}
  const idF = meta.idField || 'id'
  const codeF = meta.codeField || 'code'
  const labelF = meta.labelField || 'name'
  const parentF = meta.parentField || 'parent_id'
  const r = _plain(row)
  if (r[idF] == null && r[codeF] != null) r[idF] = r[codeF]
  // displayValue：优先 "code name"（tree 头部/搜索匹配用）
  if (!r.displayValue) {
    const parts = [r[codeF], r[labelF]].filter(Boolean)
    r.displayValue = parts.join(' ')
  }
  // hasChildren：is_leaf 反义（1/true/'1' 视为叶）
  const leafRaw = r.is_leaf
  const isLeaf = leafRaw === true || leafRaw === 1 || leafRaw === '1'
  r.hasChildren = !isLeaf
  r.children_loading = !!r.children_loading
  // full_path / level_no 派生
  const pid = r[parentF] == null ? '' : String(r[parentF])
  if (!r.full_path) r.full_path = pid ? `${pid}.${r[idF]}` : String(r[idF])
  if (!r.level_no) r.level_no = String(r.full_path).split('.').length
  return r
}

/**
 * 从 ChangeSetCollector.export() 得到的 changes 里剔除 UI-only 字段。
 * 剔除后如果某个 updated 项 fields 变空 → 整项丢掉；某层桶变空 → 整层丢掉。
 *
 * @param {Record<string,{inserted?,updated?,deleted?}>} changes
 * @returns {Record<string,{inserted?,updated?,deleted?}>}
 */
export function sanitizeChangeSet (changes) {
  if (!changes || typeof changes !== 'object') return changes
  const out = {}
  for (const path of Object.keys(changes)) {
    const bkt = changes[path] || {}
    const nb = {}
    if (Array.isArray(bkt.inserted) && bkt.inserted.length) {
      // inserted 行的 fields 也过滤 UI-only 字段
      nb.inserted = bkt.inserted.map((row) => {
        if (!row) return row
        const clean = { ...row }
        if (clean.fields && typeof clean.fields === 'object') {
          const f = {}
          for (const k of Object.keys(clean.fields)) {
            if (!UI_ONLY_FIELDS.has(k) && !READONLY_FIELDS.has(k)) f[k] = clean.fields[k]
          }
          clean.fields = f
        }
        return clean
      })
    }
    if (Array.isArray(bkt.updated) && bkt.updated.length) {
      const kept = []
      for (const u of bkt.updated) {
        if (!u || !u.fields) continue
        const f = {}
        for (const k of Object.keys(u.fields)) {
          if (!UI_ONLY_FIELDS.has(k) && !READONLY_FIELDS.has(k)) f[k] = u.fields[k]
        }
        if (Object.keys(f).length) kept.push({ ...u, fields: f })
      }
      if (kept.length) nb.updated = kept
    }
    if (Array.isArray(bkt.deleted) && bkt.deleted.length) nb.deleted = bkt.deleted.slice()
    if (Object.keys(nb).length) out[path] = nb
  }
  return out
}

/**
 * 把后端返回的结构化 violations 格式化成多行中文提示（与 cmx-doc-source.formatViolations 同签名）。
 */
export function formatDictViolations (violations, tableNames) {
  if (!Array.isArray(violations) || !violations.length) return ''
  const nameOf = (t) => {
    const zh = tableNames && tableNames[t]
    return zh ? `${zh}(${t})` : (t || '')
  }
  return violations.map((v) => {
    const layer = nameOf(v.table)
    const prefix = layer ? `[${layer}] ` : ''
    const body = v.message || v.code || '校验未通过'
    const num = v.code_num != null ? v.code_num : v.codeNum
    const codeLabel = num != null && v.code ? `${num}-${v.code}` : (num != null ? String(num) : (v.code || ''))
    const suffix = (codeLabel && v.message) ? `  [${codeLabel}]` : ''
    return `• ${prefix}${body}${suffix}`
  }).join('\n')
}

// ─── 内部工具 ─────────────────────────────────────────────────────────────

/**
 * 归一取包：兼容 ApiResp 信封与已拆信封的裸包。
 * HTTP 失败时**必须抛错**（对齐 saveDictData / _unwrapPkg）：门户拦截器把业务错误映射为
 * {error, msg} + 非 2xx——无数值 code，若按裸包返回会被 loadDictData 退化成空数据集，
 * 表格静默空白无任何提示（这正是"报错无提示"的典型路径）。
 */
function _unwrapDictPkg (body, res) {
  if (res && res.ok === false) {
    throw new Error(`[loadDictData] 装载失败: ${readHttpErrorMessage(body, res)}`)
  }
  if (body == null) throw new Error(`[loadDictData] 装载失败: ${readHttpErrorMessage(null, res)}`)
  if (typeof body.code === 'number') {
    if (body.code !== 0 || body.data == null) {
      throw new Error(`[loadDictData] 装载失败: ${body.msg || body.error || readHttpErrorMessage(body, res)}`)
    }
    return body.data
  }
  // 已拆信封或裸列压缩包 / {rows,total}
  return body
}

function _buildQueryBody (def) {
  // 便捷参数（parentId/page/pageSize）合入 query
  const q = (def.query && typeof def.query === 'object') ? { ...def.query } : {}
  if (def.parentId !== undefined && q.parentId === undefined) q.parentId = def.parentId
  if (def.page !== undefined && q.page === undefined) q.page = def.page
  if (def.pageSize !== undefined && q.pageSize === undefined) q.pageSize = def.pageSize
  if (def.filter !== undefined && q.filter === undefined) q.filter = def.filter
  return q
}

function _plain (row) {
  return row && typeof row.toPlainObject === 'function' ? row.toPlainObject() : { ...(row || {}) }
}

function _stripReadonly (o) {
  const out = {}
  for (const k of Object.keys(o || {})) {
    if (!READONLY_FIELDS.has(k) && !UI_ONLY_FIELDS.has(k) && o[k] !== undefined) out[k] = o[k]
  }
  return out
}

function _safeDecode (bytes) {
  try { return decodeMsgpack(bytes) }
  catch (e) { console.error('[loadDictData] msgpack 解码失败:', e); return null }
}

function _validationError (resp, msg, tableNames) {
  const violations = _extractViolations(resp)
  if (!violations || !violations.length) return null
  const detail = formatDictViolations(violations, tableNames)
  const err = new Error(`${msg || '数据校验未通过'}\n${detail}`)
  err.validation = true
  err.violations = violations
  return err
}

function _extractViolations (resp) {
  if (!resp || typeof resp !== 'object') return null
  if (Array.isArray(resp.violations)) return resp.violations
  if (resp.data && Array.isArray(resp.data.violations)) return resp.data.violations
  return null
}

function _fetch (host, url, opts) {
  if (host && typeof host.fetch === 'function') return host.fetch(url, opts)
  return fetch(url, opts)
}
