/**
 * cmx-doc-source — 业务单据数据装载/回存前端适配层（方案 §5.3 / §6.3，落地 Phase 6）
 *
 * 三件事：
 *   ① loadDocData(host, def)      GET /api/doc/data/<驱动>-<内存>-<传输> → 列式包 → CmxDataSet.fromJSON → { rootId: CmxDataSet }
 *   ② ChangeSetCollector(coord)   订阅协调器各层 CmxDataSet 事件，累积 inserted/updated/deleted（§6.3）
 *   ③ saveDocData(host, def, cs)  changeset → POST /api/doc/save（merge/replace 双模式）
 *
 * 与后端契约对齐：列式包结构 { datasetId, columns, rows:[[...]], childRows } 由
 * `CmxDataSet.fromJSON` 原生识别（cmx-data-set.js:362）；后端 ColumnarCodec 产出同构结构。
 */

import { CmxDataSet } from './cmx-data-set.js'
import { decodeMsgpack } from './cmx-msgpack-decode.js'
import { normalizeDocCoord, docCoordQuery, isFileAbsent } from './cmx-doc-coord.js'

const DEFAULT_API = {
  // 装载端点命名：/api/doc/data/<驱动>-<内存模式>-<传输>
  //   缺省（JSON）：sqlx + 老 DataSet(全拷贝) + JSON
  //   binary 缺省（msgpack）：tokio + ZmcDataSet(零拷贝) + msgpack 二进制
  dataPath: '/api/doc/data/sqlx-dataset-json',
  dataPathBin: '/api/doc/data/tokio-zmc-msgpack',
  childrenPath: '/api/doc/data/children',
  savePath: '/api/doc/save',
}

/**
 * 装载单据数据为 { rootId: CmxDataSet } 树。
 *
 * @param {object} host        页面 host（可选，用于 pageService/自定义 fetch；缺省用全局 fetch）
 * @param {object} def
 * @param {string} def.domain
 * @param {string} def.application
 * @param {string} def.module
 * @param {string} def.file          单据定义文件名
 * @param {string} [def.filter]      根层过滤 "col:value"
 * @param {number} [def.limit]
 * @param {number} [def.depth]
 * @param {string} [def.dbId]        目标库（写入 db_id 头）
 * @param {string} [def.apiPath]     覆盖默认端点（缺省 /api/doc/data/sqlx-dataset-json）
 * @param {boolean} [def.binary]     true=走列式二进制(msgpack)通道 /api/doc/data/tokio-zmc-msgpack(零拷贝)；
 *                                   解码后结构与 JSON 版逐字段同构，fromJSON 与组件均无改动
 * @param {AbortSignal} [def.signal]
 * @returns {Promise<{ dsMap: Record<string,CmxDataSet>, pkg: object, total: number|null }>}
 *          total 为后端在 count_total=true 时回传的根层 COUNT(*) 行数；未传则 null。
 */
export async function loadDocData (host, def) {
  const useBinary = def.binary === true
  const apiPath = def.apiPath || (useBinary ? DEFAULT_API.dataPathBin : DEFAULT_API.dataPath)
  const params = docCoordQuery(def)
  if (def.filter != null) params.set('filter', def.filter)
  if (def.limit != null) params.set('limit', String(def.limit))
  if (def.depth != null) params.set('depth', String(def.depth))

  const headers = { Accept: useBinary ? 'application/x-msgpack' : 'application/json' }
  if (def.dbId) headers.db_id = def.dbId

  // def.query 存在（DocQuery：每层条件/排序/分页/游标）→ POST body；否则 GET 便捷路径。
  let res
  if (def.query && Object.keys(def.query).length) {
    headers['Content-Type'] = 'application/json'
    res = await _fetch(host, `${apiPath}?${params.toString()}`, {
      method: 'POST', headers, body: JSON.stringify(def.query), signal: def.signal,
    })
  } else {
    res = await _fetch(host, `${apiPath}?${params.toString()}`, { headers, signal: def.signal })
  }

  // 二进制:arrayBuffer + msgpack.decode；JSON:res.json()。解出的 body 结构一致。
  let body
  if (useBinary) {
    const buf = await res.arrayBuffer().catch(() => null)
    body = buf ? safeDecode(new Uint8Array(buf)) : null
  } else {
    body = await res.json().catch(() => null)
  }
  const pkg = _unwrapPkg(body, res)
  // 列式包 → CmxDataSet（含 childRows 递归还原）—— 两条路线走同一 fromJSON,零差异
  const rootDs = CmxDataSet.fromJSON(pkg)
  const dsMap = { [pkg.datasetId]: rootDs }
  // pkg.total 仅在后端 count_total=true 时出现；否则降级为 null，调用方按 null 处理（如分页工具栏显示「?」）。
  return { dsMap, pkg, total: pkg.total != null ? pkg.total : null }
}

/**
 * 读取失败响应的后端文案：`{error, msg}`（门户拦截器产物 / ApiResp 信封）优先，
 * 兜底 `HTTP <status> <statusText>`。doc / dct / 弹性组合三条装载链路共用，
 * 消灭各自内联的 `(body && (body.error || body.msg)) || HTTP…` 重复。
 */
export function readHttpErrorMessage (body, res) {
  const m = body && typeof body === 'object' ? (body.error || body.msg) : body
  if (m != null && m !== '') return String(m)
  const status = (res && res.status) != null ? res.status : ''
  const statusText = res && res.statusText ? ` ${res.statusText}` : ''
  return `HTTP ${status}${statusText}`
}

/**
 * 归一取列式包 pkg：兼容原始 ApiResp 信封与门户已拆信封的裸 pkg 两种形态。
 * HTTP 失败 / 信封业务码非 0 时抛带后端文案的错误（对齐 saveDocData：先按 HTTP 状态判
 * 失败再读 error/msg，门户拦截器把业务错误映射为 {error,msg} + 非 2xx，只读 msg 会丢文案）。
 */
function _unwrapPkg (body, res) {
  // ① HTTP 层失败（含门户拦截器映射后的业务错误 {error, msg, code?}）。
  //    须在信封判定之前：拦截器产物也可能带数字 code，先看 HTTP 状态才不会把 error 误当信封。
  if (!res.ok) {
    throw new Error(`[loadDocData] 装载失败: ${readHttpErrorMessage(body, res)}`)
  }
  // ② 原始 ApiResp 信封 { code, msg, data }（后端校验失败等走 HTTP 200）。
  if (body && typeof body.code === 'number') {
    if (body.code !== 0 || body.data == null) {
      throw new Error(`[loadDocData] 装载失败: ${body.msg || body.error || readHttpErrorMessage(body, res)}`)
    }
    return body.data
  }
  // ③ 门户已拆信封的裸列式包。
  if (body && body.datasetId != null) return body
  throw new Error(`[loadDocData] 装载失败: ${readHttpErrorMessage(body, res)}`)
}

/**
 * 懒下钻：装载某层在给定父 id 下的子树（含可选孙层），供 grid 展开时按需拉取。
 *
 * @param {object} host
 * @param {object} def   { domain, application, module, file, dbId }
 * @param {object} opts  { layer:string, parentIds:any[], query?:object(LayerQuery), depth?:number, exit?:string }
 * @returns {Promise<{ pkg:object, ds:CmxDataSet }>}  子树列式包 + 还原的 CmxDataSet
 */
export async function loadChildren (host, def, opts) {
  const c = normalizeDocCoord(def)
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' }
  if (c.dbId) headers.db_id = c.dbId
  const reqBody = {
    domain: c.domain, application: c.application, module: c.module,
    layer: opts.layer, parentIds: opts.parentIds || [],
    query: opts.query || undefined, depth: opts.depth, exit: opts.exit,
  }
  // file 有值才放进 body（空值/脏值后端自动解析），过滤强度与 docCoordQuery 一致。
  if (!isFileAbsent(c.file)) reqBody.file = c.file
  const res = await _fetch(host, DEFAULT_API.childrenPath, {
    method: 'POST', headers, body: JSON.stringify(reqBody), signal: opts.signal,
  })
  const body = await res.json().catch(() => null)
  const pkg = _unwrapPkg(body, res)
  return { pkg, ds: CmxDataSet.fromJSON(pkg) }
}

/** msgpack 解码兜底：解码异常时返回 null，交由上层抛统一错误。 */
function safeDecode (bytes) {
  try {
    return decodeMsgpack(bytes)
  } catch (e) {
    console.error('[loadDocData] msgpack 解码失败:', e)
    return null
  }
}

/**
 * 把后端返回的结构化校验 violations 格式化成多行中文提示。
 *
 * 后端 422 响应体 `data.violations[]` 每条形如
 *   `{ row, table, column, caption, code, message }`
 * 其中 message 已是中文（如「凭证批名称」长度超限：最多 50 个字符，实际 60 个）。
 *
 * 每行格式：`• [中文名(表名)] 中文原因 [数字码-字符串码]`，错误码便于对照帮助中心 / 上报。
 *
 * @param {Array<object>} violations 校验失败明细
 * @param {object} [tableNames]      物理表名 → 中文层名映射（如 { cv_batch:'凭证批' }）；
 *                                   有则前缀显示「中文名(英文名)」，无则仅英文表名
 * @returns {string} 多行提示（每条一行，前缀 • ）
 */
export function formatViolations (violations, tableNames) {
  if (!Array.isArray(violations) || !violations.length) return ''
  const nameOf = (t) => {
    const zh = tableNames && tableNames[t]
    return zh ? `${zh}(${t})` : (t || '')
  }
  const lines = violations.map((v) => {
    const layer = nameOf(v.table)
    // message 已含列中文名 + 原因；层前缀帮助定位「哪张表/哪层」。
    const prefix = layer ? `[${layer}] ` : ''
    const body = v.message || v.code || '校验未通过'
    // 末尾附错误码 `[数字-字符串]`（如 [1002-VALUE_TOO_LONG]）；缺数字码时退化为纯字符串码。
    const codeLabel = codeTag(v)
    const suffix = (codeLabel && v.message) ? `  [${codeLabel}]` : ''
    return `• ${prefix}${body}${suffix}`
  })
  return lines.join('\n')
}

/** 拼错误码标签：优先 `数字-字符串`（两者都有），否则取其一，都没有则空串。 */
function codeTag (v) {
  const num = (v.code_num != null) ? v.code_num : v.codeNum // 兼容后端 snake / 前端 camel
  const str = v.code
  if (num != null && str) return `${num}-${str}`
  if (num != null) return String(num)
  return str || ''
}

/**
 * 从一个（可能是校验失败的）响应体里提取 violations 数组。
 * 兼容两种形态：① 原始信封 { code, msg, data:{violations} }；② 已拆信封 { violations }。
 * @returns {Array<object>|null}
 */
export function extractViolations (resp) {
  if (!resp || typeof resp !== 'object') return null
  if (Array.isArray(resp.violations)) return resp.violations
  if (resp.data && Array.isArray(resp.data.violations)) return resp.data.violations
  return null
}

/**
 * 回存单据。
 *
 * @param {object} host
 * @param {object} def   同 loadDocData 的 domain/application/module/file/dbId/apiPath
 * @param {object} payload
 * @param {'merge'|'replace'} [payload.saveMode='merge']
 * @param {object} [payload.changes]    merge 模式 changeset（来自 ChangeSetCollector.export）
 * @param {object} [payload.snapshot]   replace 模式整树 snapshot
 * @param {AbortSignal} [payload.signal]
 * @returns {Promise<{ ok:boolean, mode:string, affected:number }>}
 */
export async function saveDocData (host, def, payload) {
  const c = normalizeDocCoord(def)
  const apiPath = def.saveApiPath || DEFAULT_API.savePath
  const params = docCoordQuery(c)
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' }
  if (c.dbId) headers.db_id = c.dbId

  const body = { saveMode: payload.saveMode || 'merge' }
  if (payload.changes) body.changes = payload.changes
  if (payload.snapshot) body.snapshot = payload.snapshot
  // 单据字段铸号规则覆盖（MDM cr-form 填 activation.doc_code_rules → 后端 saver 覆盖铸号）。
  if (payload.codeRuleOverrides) body.codeRuleOverrides = payload.codeRuleOverrides

  const res = await _fetch(host, `${apiPath}?${params.toString()}`, {
    method: 'POST', headers, body: JSON.stringify(body), signal: payload.signal,
  })
  const resp = await res.json().catch(() => null)
  // 兼容两种响应形态（同 _unwrapPkg）：
  //   ① 原始 ApiResp 信封 { code, msg, data } —— 直连后端时（code===0 成功）
  //   ② 门户拦截器已拆信封的裸结果 { ok, mode, affected } —— native 成功时（HTTP 200，无 code）
  //      门户拦截器把业务错误映射为 { error, code } + HTTP 4xx/5xx —— 故错误也可能带 code，
  //      须先按 HTTP 状态判失败，再读 error/msg，避免误当成信封而丢掉 error 文案。
  if (!res.ok) {
    const msg = (resp && (resp.error || resp.msg)) || res.status
    // B2 乐观锁：后端并发冲突返回 HTTP 409 → 抛可识别错误，供 UI 提示「单据已被他人修改，请刷新」。
    if (res.status === 409) {
      const err = new Error(`[saveDocData] 保存冲突: ${msg}`)
      err.conflict = true
      throw err
    }
    // 若门户拦截器把 422 映射成 4xx，仍可能带 violations（信封或裸形态）→ 结构化抛出。
    const vErr = _validationError(resp, msg, payload.tableNames)
    if (vErr) throw vErr
    throw new Error(`[saveDocData] 保存失败: ${msg}`)
  }
  // 成功结果（拆信封后）：{ ok, mode, affected, updatedAt? }。
  // 注意：后端**校验失败(422)也走 HTTP 200**（ApiResp 无 IntoResponse），body = { code:422, msg, data:{violations} }，
  // 故 code!==0 分支必须先看是不是校验失败，读出 violations 结构化抛出，而非只丢一句「保存失败」。
  const data = (resp && typeof resp.code === 'number')
    ? (resp.code !== 0
        ? (() => {
            const vErr = _validationError(resp, resp.msg || resp.error || res.status, payload.tableNames)
            if (vErr) throw vErr
            throw new Error(`[saveDocData] 保存失败: ${resp.msg || resp.error || res.status}`)
          })()
        : resp.data)
    : resp
  // B2：用后端回传的新 update_time 刷新前端乐观锁基线，支持「连续保存不刷新页」不误报冲突。
  if (payload.collector && data && Array.isArray(data.updatedAt)) {
    payload.collector.refreshBaselines(data.updatedAt)
  }
  // 保存后用 idMap 把前端临时 id（b1/h1）换成落库真实雪花 id（含 upper_id 重路由）。
  // 在 saveDoc/saveDict 的 collector.reset() 之前执行（顺序：换 id → 清 changeset），
  // doc 与 dct 两条保存链路均传 collector，故此处一处即覆盖两端。
  if (payload.collector && data && data.idMap && typeof data.idMap === 'object') {
    payload.collector.applyIdMap(data.idMap)
  }
  return data
}

/**
 * 从响应体构造「列级校验失败」错误（带多行中文明细 + err.violations）。
 * 非校验失败（无 violations）返回 null，交由调用方按普通失败处理。
 * @returns {Error|null}
 */
function _validationError (resp, msg, tableNames) {
  const violations = extractViolations(resp)
  if (!violations || !violations.length) return null
  const detail = formatViolations(violations, tableNames)
  const err = new Error(`${msg || '数据校验未通过'}\n${detail}`)
  err.validation = true
  err.violations = violations
  return err
}

/**
 * 批量回存多单（方案 F）。一批可混多种单据（每单自带坐标）。
 *
 * @param {object} host
 * @param {object} payload
 * @param {Array<{domain,application,module,file,saveMode?,changes?,snapshot?}>} payload.docs 各单
 * @param {boolean} [payload.atomic=true] true=一个大事务全成全败；false=每单独立事务逐单成败
 * @param {string}  [payload.apiPath='/api/doc/save/batch']
 * @param {object}  [payload.collector] 传则用回传 updatedAt 刷新各单乐观锁基线
 * @param {AbortSignal} [payload.signal]
 * @returns {Promise<{ atomic:boolean, count:number, results:Array<{index,ok,mode,affected,updatedAt?,error?}> }>}
 * @throws {Error} atomic 模式下任一单冲突 → err.conflict=true（整批回滚）
 */
export async function saveDocDataBatch (host, payload) {
  const apiPath = payload.apiPath || `${DEFAULT_API.savePath}/batch`
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' }
  if (payload.dbId) headers.db_id = payload.dbId
  const body = { atomic: payload.atomic !== false, docs: payload.docs || [] }

  const res = await _fetch(host, apiPath, {
    method: 'POST', headers, body: JSON.stringify(body), signal: payload.signal,
  })
  const resp = await res.json().catch(() => null)
  if (!res.ok) {
    const msg = (resp && (resp.error || resp.msg)) || res.status
    if (res.status === 409) {
      const err = new Error(`[saveDocDataBatch] 批量保存冲突: ${msg}`)
      err.conflict = true
      throw err
    }
    throw new Error(`[saveDocDataBatch] 批量保存失败: ${msg}`)
  }
  const data = (resp && typeof resp.code === 'number')
    ? (resp.code !== 0
        ? (() => { throw new Error(`[saveDocDataBatch] 批量保存失败: ${resp.msg || resp.error || res.status}`) })()
        : resp.data)
    : resp
  // 用各单回传的新 update_time 刷新前端乐观锁基线（非 atomic 逐单模式尤其有用）。
  if (payload.collector && data && Array.isArray(data.results)) {
    for (const r of data.results) {
      if (r && r.ok && Array.isArray(r.updatedAt) && r.updatedAt.length) {
        payload.collector.refreshBaselines(r.updatedAt)
      }
    }
  }
  return data
}
function _fetch (host, url, opts) {
  if (host && typeof host.fetch === 'function') return host.fetch(url, opts)
  return fetch(url, opts)
}

/**
 * ChangeSetCollector — 订阅协调器各层 CmxDataSet 事件，累积按层 changeset（§6.3）。
 *
 * 用法：
 *   const cs = new ChangeSetCollector(ms)   // ms = CmxMasterSlave
 *   cs.attach()                              // 装载后调用（此时各层 ds 已在 ms 内）
 *   ... 用户编辑 ...
 *   const changes = cs.export()              // { path: { inserted:[...], updated:[...], deleted:[...] } }
 *   await saveDocData(host, def, { saveMode:'merge', changes })
 *   cs.reset()
 *
 * 语义（净化）：
 *   - 新增行 → inserted；若该行随后被删 → 两者抵消（净零，不回后端）
 *   - 改字段 → 若非新增行，updated（合并同一行的多次改动）
 *   - 删除行 → deleted；若之前是新增 → 从 inserted 移除（不进 deleted）
 */
export class ChangeSetCollector {
  /** @param {import('./cmx-master-slave.js').CmxMasterSlave} coord */
  constructor (coord) {
    this._coord = coord
    /** path → { inserted:Map<id,row>, updated:Map<id,Set<key>>, deleted:Set<id> } */
    this._byPath = new Map()
    /** 已挂监听的 ds → { path, listeners } */
    this._bound = new Map()
  }

  /** 遍历协调器所有层 ds，挂监听。装载（setDataSet）后调用。 */
  attach () {
    this.detach()
    const tables = this._coord?._data?.tables || {}
    for (const [rootId, ds] of Object.entries(tables)) {
      if (ds) this._bindRecursive(ds, rootId)
    }
    return this
  }

  _bindRecursive (ds, path) {
    if (!ds || this._bound.has(ds)) return
    const onAdded = (ev) => this._onAdded(path, ev.detail?.row)
    const onRemoved = (ev) => this._onRemoved(path, ev.detail?.row)
    const onChanged = (ev) => this._onChanged(path, ev.detail?.row, ev.detail?.key)
    ds.addEventListener('ds-row-added', onAdded)
    ds.addEventListener('ds-row-removed', onRemoved)
    ds.addEventListener('row-changed', onChanged)
    this._bound.set(ds, { path, onAdded, onRemoved, onChanged })
    // 递归子层
    for (const row of (ds.rows || [])) {
      for (const [cid, cds] of Object.entries(row._children || {})) {
        this._bindRecursive(cds, `${path}.${cid}`)
      }
    }
  }

  detach () {
    for (const [ds, b] of this._bound) {
      ds.removeEventListener('ds-row-added', b.onAdded)
      ds.removeEventListener('ds-row-removed', b.onRemoved)
      ds.removeEventListener('row-changed', b.onChanged)
    }
    this._bound.clear()
  }

  _bucket (path) {
    if (!this._byPath.has(path)) {
      this._byPath.set(path, { inserted: new Map(), updated: new Map(), deleted: new Set() })
    }
    return this._byPath.get(path)
  }

  _onAdded (path, row) {
    if (!row || row.id == null) return
    const b = this._bucket(path)
    // 新增行子层可能也要监听
    for (const [cid, cds] of Object.entries(row._children || {})) {
      this._bindRecursive(cds, `${path}.${cid}`)
    }
    b.deleted.delete(row.id)   // 撤销可能的删除
    b.inserted.set(row.id, row)
  }

  _onRemoved (path, row) {
    if (!row || row.id == null) return
    const b = this._bucket(path)
    if (b.inserted.has(row.id)) {
      b.inserted.delete(row.id)   // 新增又删 → 净零
    } else {
      b.updated.delete(row.id)
      b.deleted.add(row.id)
    }
  }

  _onChanged (path, row, key) {
    if (!row || row.id == null) return
    // 空 key 的 row-changed（"整行变化"类通知）不登记——只登记行不记键会在导出时
    // 产出 fields:{} 的更新行，服务端过滤后为空集，触发「期望 N 实际 0」假对账冲突。
    if (key == null) return
    const b = this._bucket(path)
    if (b.inserted.has(row.id)) return   // 新增行的改动并入 inserted
    if (b.deleted.has(row.id)) return
    if (!b.updated.has(row.id)) b.updated.set(row.id, new Set())
    b.updated.get(row.id).add(key)
  }

  /**
   * 导出最小 changeset。
   * @returns {Record<string,{inserted?:object[],updated?:object[],deleted?:string[]}>}
   */
  export () {
    const out = {}
    for (const [path, b] of this._byPath) {
      const layer = {}
      if (b.inserted.size) {
        layer.inserted = [...b.inserted.values()].map((row) => this._insertedRow(row))
      }
      if (b.updated.size) {
        const updated = []
        for (const [id, keys] of b.updated.entries()) {
          const row = this._findRow(path, id)
          const fields = {}
          for (const k of keys) if (row) fields[k] = row[k]
          // 行已不在数据集（或键集为空）→ fields 为空，服务端无可更新列：跳过不发，
          // 避免「期望 N 实际 0」假对账冲突；warn 便于定位脏标记来源。
          if (!Object.keys(fields).length) {
            console.warn(`[ChangeSetCollector] 跳过空字段更新行：path=${path} id=${id}（行未找到或无键）`)
            continue
          }
          // B2 乐观锁基线：回传装载时的 update_time（服务端权威 readonly 列，用户不改动 →
          // 仍是装载原值）。后端仅根层用它做并发冲突检测；缺列/新增未存过 → null（后端退化为不加锁）。
          updated.push({ id, fields, baseline: row?.update_time ?? null })
        }
        if (updated.length) layer.updated = updated
      }
      if (b.deleted.size) layer.deleted = [...b.deleted]
      if (Object.keys(layer).length) out[path] = layer
    }
    return out
  }

  /** 新增行 → { id, upper_id?, line_no?, fields:{...} } */
  _insertedRow (row) {
    const fields = {}
    for (const k of Object.keys(row)) {
      if (k.startsWith('_') || k === 'id' || k === 'upper_id' || k === 'line_no') continue
      fields[k] = row[k]
    }
    const out = { id: row.id, fields }
    if (row.upper_id != null) out.upper_id = row.upper_id
    if (row.line_no != null) out.line_no = row.line_no
    return out
  }

  /** 在某层 ds 里找行（用于 updated 取最新值）。 */
  _findRow (path, id) {
    for (const [ds, b] of this._bound) {
      if (b.path === path) {
        const r = ds.getRow?.(id)
        if (r) return r
      }
    }
    return null
  }

  /**
   * B2 乐观锁：用后端回传的新 update_time 刷新对应行的基线（`row.update_time`）。
   *
   * 保存成功后调用，让「连续保存不刷新页」的第二次保存回传新基线而非陈旧值，避免误报冲突。
   * 直写属性（不走 row.set，避免触发 row-changed / 脏标记；update_time 是只读技术列）。
   *
   * @param {Array<{id:string, updateTime:string}>} updatedAt 后端 SaveResult.updatedAt
   */
  refreshBaselines (updatedAt) {
    if (!Array.isArray(updatedAt) || !updatedAt.length) return this
    const byId = new Map(updatedAt.map((u) => [String(u.id), u.updateTime]))
    for (const [ds] of this._bound) {
      for (const [id, ts] of byId) {
        const r = ds.getRow?.(id)
        if (r && ts != null) r.update_time = ts
      }
    }
    return this
  }

  /**
   * 保存成功后用后端回传的 idMap 把「前端临时 id」替换成「落库真实雪花 id」。
   *
   * 后端 mint_ids_for_changeset（saver.rs:1147）对新增行铸真实 id 并在 changeset 里
   * 重路由 upper_id；但前端 DataSet 里仍是临时 id（b1/h1），若不替换，下一次保存时
   * collector 导出的新行 upper_id 仍指向已失效的临时父 id → 数据断链。
   *
   * 直写 row.id / row.upper_id（不走 row.set，避免触发 row-changed / 脏标记，
   * 与 refreshBaselines 直写 update_time 一致）。
   *
   * @param {Record<string, string|number>} idMap 临时id → 真实id（后端 SaveResult.idMap）
   * @returns {this}
   */
  applyIdMap (idMap) {
    if (!idMap || typeof idMap !== 'object') return this
    const m = new Map()
    for (const [k, v] of Object.entries(idMap)) m.set(String(k), v)
    if (!m.size) return this
    // 1) 每层 ds：换行 id（_index key）+ 重路由子行 upper_id
    for (const [ds] of this._bound) {
      if (!ds || !ds._index) continue
      for (const [oldId, row] of ds._index) {
        const newId = m.get(String(oldId))
        if (newId == null) continue
        row.id = newId
        ds._index.delete(oldId)
        ds._index.set(newId, row)
      }
      for (const row of (ds.rows || [])) {
        if (row.upper_id != null) {
          const nu = m.get(String(row.upper_id))
          if (nu != null) row.upper_id = nu
        }
      }
    }
    // 2) 同步 collector.inserted 的 key（后续 _onRemoved/_onChanged 按 row.id 查）
    for (const b of this._byPath.values()) {
      for (const [oldId, row] of b.inserted) {
        const newId = m.get(String(oldId))
        if (newId != null) { b.inserted.delete(oldId); b.inserted.set(newId, row) }
      }
    }
    return this
  }

  /** 清空累积（保存成功后调用）。 */
  reset () {
    this._byPath.clear()
    return this
  }

  /** 是否有未保存变更。 */
  isDirty () {
    for (const b of this._byPath.values()) {
      if (b.inserted.size || b.updated.size || b.deleted.size) return true
    }
    return false
  }
}
