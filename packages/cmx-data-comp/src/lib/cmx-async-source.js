/**
 * cmx-async-source — DataSource 远程加载支撑工具：
 *   - LRU 缓存（按 query 字符串 / 单值 key）
 *   - debounce（输入即时过滤场景，控制 search 频率）
 *   - AbortController（同一个 source 同时只保留最后一次未完成请求）
 *
 * 这是 cmx-ui5-table / cmx-ui5-form 内部使用的轻量工具，不对外公开为正式 API。
 */

class LRU {
  constructor(max = 200) {
    this.max = max
    this.map = new Map()
  }
  get(k) {
    if (!this.map.has(k)) return undefined
    const v = this.map.get(k)
    this.map.delete(k)
    this.map.set(k, v)
    return v
  }
  set(k, v) {
    if (this.map.has(k)) this.map.delete(k)
    else if (this.map.size >= this.max) {
      const first = this.map.keys().next().value
      this.map.delete(first)
    }
    this.map.set(k, v)
  }
  clear() { this.map.clear() }
}

/**
 * 给 DataSource 创建/取出共享的远程辅助缓存对象。
 * 同一 source 实例多次调用返回同一份缓存，避免重复创建。
 */
export function getAsyncSourceCache(source) {
  if (!source) return null
  if (source.__asyncCache) return source.__asyncCache
  const cache = {
    queryCache: new LRU(source.cacheSize || 200),  // query string → items[]
    keyCache:   new LRU(source.cacheSize || 200),  // valueField → row
    debounceMs: source.debounceMs ?? 250,
    pageSize:   source.pageSize   ?? 20,
    abortCtrl:  null,
    debounceTimer: null,
  }
  source.__asyncCache = cache
  return cache
}

/**
 * 在 source 上做一次远程搜索；同一 source 上前一次未结束的请求会被 abort。
 * 返回 Promise<items[]>。命中缓存直接同步 resolve。
 */
export function searchAsync(source, query, opts = {}) {
  if (!source || typeof source.search !== 'function') return Promise.resolve([])
  const cache = getAsyncSourceCache(source)
  const q = String(query ?? '')
  const cacheKey = `${q}::${stableOptsKey(opts)}`
  const cached = cache.queryCache.get(cacheKey)
  if (cached) return Promise.resolve(cached)
  if (cache.abortCtrl) cache.abortCtrl.abort()
  const ctrl = new AbortController()
  cache.abortCtrl = ctrl
  return Promise.resolve(source.search(q, { ...opts, signal: ctrl.signal, page: opts.page || 1, pageSize: opts.pageSize || cache.pageSize }))
    .then((res) => {
      const items = Array.isArray(res) ? res : (Array.isArray(res?.items) ? res.items : [])
      cache.queryCache.set(cacheKey, items)
      // 顺便填 keyCache
      const kf = source.keyField || 'code'
      for (const it of items) {
        if (it && it[kf] != null) cache.keyCache.set(String(it[kf]), it)
      }
      return items
    })
    .catch((err) => {
      if (err?.name === 'AbortError') return []
      throw err
    })
}

/**
 * 按 keyField 单值查找：先看 source.items（同步），再看 keyCache，最后远程查。
 * 优先调用 source.loadByKeys([key])，否则回退用 source.search(key)。
 */
export function lookupByKeyAsync(source, key) {
  if (key == null || key === '') return Promise.resolve(null)
  const k = String(key)
  // 同步：source.items 直接命中
  if (Array.isArray(source.items) && source.items.length) {
    const kf = source.keyField || 'code'
    const found = source.items.find((it) => String(it[kf]) === k)
    if (found) return Promise.resolve(found)
  }
  const cache = getAsyncSourceCache(source)
  const cached = cache.keyCache.get(k)
  if (cached) return Promise.resolve(cached)
  // 远程
  if (typeof source.loadByKeys === 'function') {
    return Promise.resolve(source.loadByKeys([k])).then((res) => {
      const arr = Array.isArray(res) ? res : (Array.isArray(res?.items) ? res.items : [])
      const kf = source.keyField || 'code'
      for (const it of arr) cache.keyCache.set(String(it[kf]), it)
      return arr.find((it) => String(it[kf]) === k) || null
    })
  }
  if (typeof source.search === 'function') {
    return searchAsync(source, k).then((items) => {
      const kf = source.keyField || 'code'
      return items.find((it) => String(it[kf]) === k) || null
    })
  }
  return Promise.resolve(null)
}

/**
 * 工厂：返回一个 debounce 包装函数。同一 sourceCache 共享 timer，
 * 多次快速调用只触发最后一次。
 */
export function debounceForSource(source, fn) {
  const cache = getAsyncSourceCache(source)
  return (...args) => {
    if (cache.debounceTimer) clearTimeout(cache.debounceTimer)
    cache.debounceTimer = setTimeout(() => {
      cache.debounceTimer = null
      fn(...args)
    }, cache.debounceMs)
  }
}

function stableOptsKey (opts) {
  if (!opts || typeof opts !== 'object') return ''
  const clean = {}
  for (const k of Object.keys(opts).sort()) {
    if (k === 'signal') continue
    const v = opts[k]
    if (typeof v === 'function') continue
    clean[k] = v
  }
  try { return JSON.stringify(clean) } catch (_) { return '' }
}
