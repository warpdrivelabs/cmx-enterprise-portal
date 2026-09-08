/**
 * cmx-dict-data-source — 常用字典 DataSource 工厂。
 *
 * 通用协议（不绑定具体端点，由 host[service] 实现决定打哪个接口）：
 *   search:     host[service]({ q, page, pageSize, ...extra })
 *   loadByKeys: host[service]({ filters: { [keyField]: keys }, page: 1, pageSize })
 *
 * 注意：字典数据现走 `POST /api/dct/data/search?domain=&application=&module=&dict=`（直读 cf_* 物理表，
 * 旧 /api/dict/* JSON 文件服务已下线）。本工厂不拼 URL，只约定 host[service] 的调用协议；
 * 字典专用直连数据源见 cmx-dict-field-type.js 的 createRestDictDataSource。
 *
 * 返回对象兼容 cmx-dict-select / cmx-async-source：
 *   { id, keyField, labelField, pageSize, search(q, opts), loadByKeys(keys) }
 */

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

function resolveExtraParams (extra, ctx) {
  if (!extra) return {}
  if (typeof extra === 'function') {
    const out = extra(ctx) || {}
    return out && typeof out === 'object' ? out : {}
  }
  return typeof extra === 'object' ? extra : {}
}

/**
 * @param {any} host
 * @param {{
 *   id?: string,
 *   service: string,
 *   keyField?: string,
 *   labelField?: string,
 *   queryParam?: string,
 *   filtersParam?: string,
 *   pageSize?: number,
 *   minPageSizeForKeys?: number,
 *   extraParams?: object|Function,
 *   responsePath?: string|Function,
 *   transform?: Function,
 * }} def
 */
export function createDictDataSource (host, def) {
  if (!host) throw new Error('[cmx-dict-data-source] host required')
  if (!def || typeof def.service !== 'string' || !def.service) {
    throw new Error('[cmx-dict-data-source] def.service required')
  }
  const service = def.service
  const id = def.id || service
  const keyField = def.keyField || 'code'
  const labelField = def.labelField || 'name'
  const queryParam = def.queryParam || 'q'
  const filtersParam = def.filtersParam || 'filters'
  const pageSize = def.pageSize || 50
  const minPageSizeForKeys = def.minPageSizeForKeys || 20

  const call = async (params, signal) => {
    const fn = host[service]
    if (typeof fn !== 'function') {
      throw new Error(`[cmx-dict-data-source] host.${service} is not a function`)
    }
    return fn.call(host, params, { signal })
  }

  const rowsFrom = (res, ctx) => {
    if (typeof def.transform === 'function') {
      const out = def.transform(res, ctx)
      return Array.isArray(out) ? out : []
    }
    if (typeof def.responsePath === 'function') {
      const out = def.responsePath(res, ctx)
      return Array.isArray(out) ? out : []
    }
    if (typeof def.responsePath === 'string' && def.responsePath) {
      const value = def.responsePath.split('.').reduce((cur, key) => cur == null ? undefined : cur[key], res)
      return Array.isArray(value) ? value : []
    }
    return pickRows(res)
  }

  return {
    id,
    keyField,
    labelField,
    pageSize,

    async search (query, opts = {}) {
      const page = opts.page || 1
      const reqSize = opts.pageSize || pageSize
      const params = {
        ...resolveExtraParams(def.extraParams, { query, page, pageSize: reqSize }),
        [queryParam]: query || '',
        page,
        pageSize: reqSize,
      }
      const res = await call(params, opts.signal)
      return rowsFrom(res, { query, page, pageSize: reqSize })
    },

    async loadByKeys (keys, opts = {}) {
      const clean = (keys || []).filter((x) => x != null && String(x) !== '')
      if (!clean.length) return []
      const reqSize = Math.max(minPageSizeForKeys, clean.length)
      const params = {
        ...resolveExtraParams(def.extraParams, { keys: clean, page: 1, pageSize: reqSize }),
        [filtersParam]: { [keyField]: clean },
        page: 1,
        pageSize: reqSize,
      }
      const res = await call(params, opts.signal)
      return rowsFrom(res, { keys: clean, page: 1, pageSize: reqSize })
    },
  }
}

/**
 * 把本地 options 转成同一 DataSource 协议，适合 FlexibleCombination 动态列里的枚举字段。
 */
export function createLocalDictDataSource (options, def = {}) {
  const keyField = def.keyField || 'code'
  const labelField = def.labelField || 'name'
  const rows = (options || []).map((o) => {
    const code = o?.value != null ? o.value : (o?.code != null ? o.code : '')
    const name = o?.label != null ? o.label : (o?.name != null ? o.name : code)
    return { ...(o || {}), id: code, [keyField]: code, [labelField]: name }
  })
  return {
    id: def.id,
    keyField,
    labelField,
    pageSize: def.pageSize || 50,
    async search (query) {
      const q = String(query || '').trim().toLowerCase()
      if (!q) return rows.slice()
      return rows.filter((r) =>
        String(r[keyField] || '').toLowerCase().includes(q) ||
        String(r[labelField] || '').toLowerCase().includes(q)
      )
    },
    async loadByKeys (keys) {
      const set = new Set((keys || []).map((k) => String(k)))
      return rows.filter((r) => set.has(String(r[keyField])))
    },
  }
}
