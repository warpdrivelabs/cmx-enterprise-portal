/**
 * cmx-page-service-source — 把设计器"自定义服务"(pageService) 包装成 DataSource。
 *
 * pageService 在运行时编译为 host.<serviceName>(params) → Promise<any>，
 * 而 cmx-async-source / cmx-combo-box / 其它组件期待的 DataSource 接口是：
 *   { id, keyField, labelField, search(query, opts), loadByKeys(keys), debounceMs, pageSize, cacheSize }
 *
 * 这个工厂只做"参数装配 + 响应取值"两件事，不改 pageService 编译器；
 * AbortSignal 透传依赖 pageService fetch 模板是否接 signal（首版 REST 模板尚未接，
 * 不影响功能正确性 —— cmx-async-source 内部仍能丢弃旧响应）。
 *
 * 例：
 *   const ds = createPageServiceDataSource(host, {
 *     id: 'customers',
 *     service: 'loadCustomers',
 *     keyField: 'code', labelField: 'name',
 *     queryParam: 'q',
 *     responsePath: 'data.items',
 *     extraParams: { domain: 'fi' },
 *   })
 *   const items = await ds.search('张')
 */

/**
 * @typedef {object} PageServiceSourceDef
 * @property {string} service             pageService 函数名（host[service] 必须可用）
 * @property {string} [id]                DataSource id（缺省 = service）
 * @property {string} [keyField='id']     行的主键字段
 * @property {string} [labelField='name'] 行的显示字段
 * @property {string} [queryParam='q']    search 时把搜索文本放进 params 的哪个 key
 * @property {string} [keysParam='ids']   loadByKeys 时把 key 列表放进 params 的哪个 key
 * @property {string} [pageParam='page']  分页时把当前页号放进 params 的哪个 key
 * @property {string} [pageSizeParam='pageSize']  分页时把每页大小放进 params 的哪个 key
 * @property {string|((res:any)=>any[])} [responsePath]  从响应取 items 数组（点号路径或函数）
 * @property {string|((res:any)=>number|null)} [totalPath]
 *                                        从响应取 total 总记录数（点号路径或函数；缺省自动嗅探
 *                                        `res.total` / `res.data.total` / `res.totalCount` 等）
 * @property {(res:any, ctx:{query?:string,keys?:any[]})=>any[]} [transform]
 *                                        本地变换：拿到响应后做任意 dict→array / 二次过滤 / 排序，
 *                                        返回 items 数组。优先级高于 responsePath。
 * @property {Record<string,unknown>|((ctx:{query?:string,keys?:any[],page?:number,pageSize?:number})=>Record<string,unknown>)} [extraParams]
 *                                        固定额外参数，或返回额外参数的函数
 * @property {number} [pageSize=50]
 * @property {number} [debounceMs=250]
 * @property {number} [cacheSize=200]
 */

/**
 * @param {any} host                       页面 host（生成页 Web Component 实例；其上挂 pageService 方法）
 * @param {PageServiceSourceDef} def
 * @returns {object} DataSource
 */
export function createPageServiceDataSource (host, def) {
  if (!host) throw new Error('[cmx-page-service-source] host required')
  if (!def || typeof def.service !== 'string' || !def.service) {
    throw new Error('[cmx-page-service-source] def.service (pageService name) required')
  }
  const svcName    = def.service
  const id         = def.id ?? svcName
  const keyField   = def.keyField   ?? 'id'
  const labelField = def.labelField ?? 'name'
  const queryParam = def.queryParam ?? 'q'
  const keysParam  = def.keysParam  ?? 'ids'
  const pageParam      = def.pageParam     ?? 'page'
  const pageSizeParam  = def.pageSizeParam ?? 'pageSize'
  const pageSize   = def.pageSize   ?? 50
  const debounceMs = def.debounceMs ?? 250
  const cacheSize  = def.cacheSize  ?? 200

  const callService = async (params, signal) => {
    const fn = host[svcName]
    if (typeof fn !== 'function') {
      throw new Error(`[cmx-page-service-source] host.${svcName} is not a function`)
    }
    /* pageService 编译模板签名是 (params) → Promise；第二个可选 signal 透传由模板自行决定支持
       与否。这里多传一个不会被消费，但保留扩展点。 */
    return fn.call(host, params, { signal })
  }

  const source = {
    id,
    keyField,
    labelField,
    pageSize,
    debounceMs,
    cacheSize,
    /** @type {{ total:number|null, page:number, pageSize:number }|null} 最近一次响应的分页元数据 */
    _lastMeta: null,

    async search (query, opts = {}) {
      const page     = opts.page     ?? 1
      const reqSize  = opts.pageSize ?? pageSize
      const extras = resolveExtraParams(def.extraParams, { query, page, pageSize: reqSize })
      const params = {
        ...extras,
        [queryParam]: query ?? '',
        [pageParam]: page,
        [pageSizeParam]: reqSize,
      }
      const res = await callService(params, opts.signal)
      /* 提取 total（用于分页 footer）。transform 路径下也尝试提取。 */
      source._lastMeta = {
        total: pickTotal(res, def.totalPath),
        page,
        pageSize: reqSize,
      }
      if (typeof def.transform === 'function') {
        const out = def.transform(res, { query, page, pageSize: reqSize })
        return Array.isArray(out) ? out : []
      }
      return pickItems(res, def.responsePath)
    },

    async loadByKeys (keys) {
      const extras = resolveExtraParams(def.extraParams, { keys })
      const params = { ...extras, [keysParam]: keys }
      const res = await callService(params)
      if (typeof def.transform === 'function') {
        const out = def.transform(res, { keys })
        return Array.isArray(out) ? out : []
      }
      return pickItems(res, def.responsePath)
    },
  }
  return source
}

/**
 * 从响应里取出 items 数组。
 *   - undefined / null：递归在 res 上找首个 array 字段（兼容 {data:[...]} / {items:[...]} / {data:{items:[...]}} 等）
 *   - string：按点号路径取值（'data.items'）
 *   - function：直接调
 *   - 取不到时返回 []
 */
function pickItems (res, path) {
  if (res == null) return []
  if (Array.isArray(res)) return res
  if (typeof path === 'function') {
    const out = path(res)
    return Array.isArray(out) ? out : []
  }
  if (typeof path === 'string' && path) {
    const v = getByPath(res, path)
    return Array.isArray(v) ? v : []
  }
  /* 自动嗅探：res.items / res.data / res.data.items 中第一个数组 */
  if (Array.isArray(res.items)) return res.items
  if (Array.isArray(res.data))  return res.data
  if (res.data && Array.isArray(res.data.items)) return res.data.items
  if (res.data && Array.isArray(res.data.rows))  return res.data.rows
  if (Array.isArray(res.rows))  return res.rows
  return []
}

function getByPath (obj, path) {
  const segs = path.split('.')
  let cur = obj
  for (const s of segs) {
    if (cur == null) return undefined
    cur = cur[s]
  }
  return cur
}

/**
 * 从响应里取 total（总记录数）。
 *   - function：直接调
 *   - string：按点号路径取值
 *   - 缺省：依次尝试 res.total / res.totalCount / res.data.total / res.data.totalCount
 *   - 取不到时返回 null
 */
function pickTotal (res, path) {
  if (res == null || typeof res !== 'object') return null
  if (typeof path === 'function') {
    const v = path(res)
    return Number.isFinite(v) ? Number(v) : null
  }
  if (typeof path === 'string' && path) {
    const v = getByPath(res, path)
    return Number.isFinite(v) ? Number(v) : null
  }
  const candidates = [
    res.total, res.totalCount,
    res.data?.total, res.data?.totalCount,
  ]
  for (const c of candidates) {
    if (Number.isFinite(c)) return Number(c)
  }
  return null
}

function resolveExtraParams (extra, ctx) {
  if (!extra) return {}
  if (typeof extra === 'function') {
    const out = extra(ctx) || {}
    return typeof out === 'object' ? out : {}
  }
  return typeof extra === 'object' ? extra : {}
}
