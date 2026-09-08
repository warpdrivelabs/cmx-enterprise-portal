/**
 * cmx-doc-stream — 通用单据**流式装载**前端解码器（配后端 /api/doc/data/tokio-zmc-stream）。
 *
 * 后端出口是**长度分帧**二进制流（见 cmx_rowsource::encode_frame_*）：
 *   [帧] = [u32 大端 len][payload]
 *   第 1 帧: header  payload = msgpack { datasetId, columns:[...] }
 *   第 2..N 帧: row  payload = msgpack 行数组 [值...]
 *   终止帧: len = 0
 *
 * 本模块用 fetch + ReadableStream 边收边解，把帧组装回**与非流式同构**的列式包
 * `{ datasetId, columns, rows }`（扁平单层，无 childRows），可直接喂 CmxDataSet.fromJSON。
 * 支持 onRow 回调（每行到达即回调，真正的增量消费）。
 */

import { decodeMsgpack } from './cmx-msgpack-decode.js'
import { docCoordQuery } from './cmx-doc-coord.js'

/**
 * 流式装载单层大结果。
 *
 * @param {object} host  可选，提供自定义 fetch
 * @param {object} def   { domain, application, module, file, dbId, layer?, query?, limit?, filter?, apiPath? }
 *   - query: { filter?, orderBy?, limit? }（POST body）；或用 GET 便捷 filter/limit
 * @param {object} [opts]
 *   @param {(row:any[], index:number)=>void} [opts.onRow]   每行到达回调（增量消费）
 *   @param {(n:number)=>void} [opts.onProgress]             每收到一批后回调已收行数
 *   @param {AbortSignal} [opts.signal]
 * @returns {Promise<{ datasetId:string, columns:string[], rows:any[][] }>} 组装好的列式包
 */
export async function loadDocDataStream (host, def, opts = {}) {
  const apiPath = def.apiPath || '/api/doc/data/tokio-zmc-stream'
  const params = docCoordQuery(def)
  if (def.filter != null) params.set('filter', def.filter)
  if (def.limit != null) params.set('limit', String(def.limit))

  const headers = { Accept: 'application/octet-stream' }
  if (def.dbId) headers.db_id = def.dbId
  let fetchOpts = { headers, credentials: 'same-origin', signal: opts.signal }
  // 有 query（filter/orderBy/limit）→ POST body；否则 GET 便捷路径。
  if (def.query && Object.keys(def.query).length) {
    headers['Content-Type'] = 'application/json'
    const bodyObj = { ...def.query }
    if (def.layer) bodyObj.layer = def.layer
    fetchOpts = { ...fetchOpts, method: 'POST', body: JSON.stringify(bodyObj) }
  }

  const _fetch = (host && typeof host.fetch === 'function') ? host.fetch.bind(host) : fetch
  const res = await _fetch(`${apiPath}?${params.toString()}`, fetchOpts)
  if (!res.ok) throw new Error(`[loadDocDataStream] HTTP ${res.status}`)
  if (!res.body || typeof res.body.getReader !== 'function') {
    throw new Error('[loadDocDataStream] 响应无可读流（浏览器不支持或被代理缓冲）')
  }

  const parser = new FrameStreamParser()
  const reader = res.body.getReader()
  let datasetId = ''
  let columns = []
  const rows = []
  let onRow = typeof opts.onRow === 'function' ? opts.onRow : null

  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    parser.push(value)
    let frame
    while ((frame = parser.next()) !== null) {
      if (frame.end) { return finalize(); }
      const payload = decodeMsgpack(frame.payload)
      if (!datasetId && payload && payload.datasetId != null) {
        // header 帧
        datasetId = payload.datasetId
        columns = payload.columns || []
      } else if (Array.isArray(payload)) {
        // row 帧
        if (onRow) onRow(payload, rows.length)
        rows.push(payload)
        if (opts.onProgress && (rows.length % 500 === 0)) opts.onProgress(rows.length)
      }
    }
  }
  return finalize()

  function finalize () {
    if (opts.onProgress) opts.onProgress(rows.length)
    return { datasetId, columns, rows }
  }
}

/**
 * 长度分帧解析器：喂入字节块，产出完整帧。跨块边界安全（内部缓冲不足则等下一块）。
 * 帧：`[u32 大端 len][payload]`；len==0 → { end:true }。
 */
export class FrameStreamParser {
  constructor () {
    this._buf = new Uint8Array(0)
  }

  /** 追加一块字节。 */
  push (chunk) {
    if (!chunk || !chunk.length) return
    const merged = new Uint8Array(this._buf.length + chunk.length)
    merged.set(this._buf, 0)
    merged.set(chunk, this._buf.length)
    this._buf = merged
  }

  /** 取下一个完整帧；不足一帧返回 null。 */
  next () {
    if (this._buf.length < 4) return null
    const dv = new DataView(this._buf.buffer, this._buf.byteOffset, this._buf.byteLength)
    const len = dv.getUint32(0, false) // 大端
    if (len === 0) {
      this._buf = this._buf.subarray(4)
      return { end: true }
    }
    if (this._buf.length < 4 + len) return null // 等更多字节
    const payload = this._buf.subarray(4, 4 + len)
    this._buf = this._buf.subarray(4 + len)
    return { end: false, payload }
  }
}
