/**
 * 页面源码 IndexedDB 持久缓存（html_pages runnable doc / native page source）。
 *
 * 设计依据：`documents/20260730_前后端页面加载性能优化方案.md` 第三章。
 * - 存储介质选 IndexedDB 而非 localStorage：localStorage ~5MB 硬上限且同步阻塞主线程，
 *   welcome 页/复杂表单单页可能逼近 MAX_RUN_DOC(1.1M 字符)，50 个就破 5MB；IndexedDB
 *   为 GB 级、异步、不阻塞。
 * - 缓存键：pageId → { rev, source, relPath, ts }。`rev` 是服务端内容版本锚点（xxhash64→16hex），
 *   作 ETag 与本地校验依据：本地 rev === server rev 即命中，跳过 body 传输。
 * - 容量策略：LRU 500 + 启动 `navigator.storage.persist()`（防低压淘汰）+ 写前 `estimate()`
 *   监控 + 捕 `QuotaExceededError` → LRU 淘汰最旧重试。
 *
 * 与 CE 注册态协调（html_pages）/ _pageDefCache（native）见各自入口模块。
 */

const DB_NAME = 'cmx-page-cache'
const DB_VERSION = 1
const STORE_PAGES = 'pages'
/** LRU 上限。单页均 ~30KB → 500 页 ≈ 15MB，GB 级配额无压力。 */
const MAX_ENTRIES = 500

/** @type {Promise<IDBDatabase>|null} */
let _dbPromise = null

/**
 * 打开（并升级初始化）IndexedDB。版本升级时建 `pages` object store（keyPath = id）。
 * @returns {Promise<IDBDatabase>}
 */
function openDb () {
  if (_dbPromise) return _dbPromise
  _dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('当前环境不支持 IndexedDB'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_PAGES)) {
        db.createObjectStore(STORE_PAGES, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error || new Error('打开 IndexedDB 失败'))
  })
  return _dbPromise
}

/**
 * 包装一个 IDB 请求为 Promise。
 * @param {IDBRequest} req
 * @returns {Promise<any>}
 */
function promisifyRequest (req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/**
 * 在读写事务中执行一个 store 操作，返回 Promise。
 * @param {'readonly'|'readwrite'} mode
 * @param {(store: IDBObjectStore) => IDBRequest|void} fn
 * @returns {Promise<any>}
 */
async function withStore (mode, fn) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PAGES, mode)
    const store = tx.objectStore(STORE_PAGES)
    let result
    try {
      result = fn(store)
    } catch (err) {
      reject(err)
      return
    }
    tx.oncomplete = () => resolve(result instanceof IDBRequest ? result.result : result)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error || new Error('事务中止'))
  })
}

/**
 * 读取一个页面的缓存条目。
 * @param {string} pageId
 * @returns {Promise<{ id: string, rev: string, source: string, relPath?: string, ts: number }|null>}
 */
export async function getPage (pageId) {
  try {
    const rec = await withStore('readonly', (store) => store.get(pageId))
    return rec || null
  } catch (err) {
    console.warn('[page-cache] 读取失败，跳过缓存:', err)
    return null
  }
}

/**
 * 读取多个 pageId 的缓存条目（单事务批量，减少往返）。
 * @param {string[]} pageIds
 * @returns {Promise<Map<string, { rev: string, source: string, domain?: string, app?: string, module?: string, doc?: string }>>}
 */
export async function getPages (pageIds) {
  /** @type {Map<string, any>} */
  const out = new Map()
  if (!pageIds || !pageIds.length) return out
  try {
    const db = await openDb()
    const result = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PAGES, 'readonly')
      const store = tx.objectStore(STORE_PAGES)
      const got = new Map()
      let pending = 0
      for (const id of pageIds) {
        pending += 1
        const r = store.get(id)
        r.onsuccess = () => {
          if (r.result) got.set(id, r.result)
          pending -= 1
          if (pending === 0) resolve(got)
        }
        r.onerror = () => { pending -= 1; if (pending === 0) resolve(got) }
      }
      tx.onerror = () => reject(tx.error)
    })
    return result
  } catch (err) {
    console.warn('[page-cache] 批量读取失败，跳过缓存:', err)
    return out
  }
}

/**
 * 写入一个页面缓存条目（含 LRU 淘汰与配额兜底）。
 * @param {string} pageId
 * @param {{ rev: string, source: string, relPath?: string, sourceType?: string, domain?: string, app?: string, module?: string, doc?: string }} entry
 */
export async function putPage (pageId, entry) {
  if (!pageId || !entry || !entry.source) return
  const rec = {
    id: pageId,
    rev: String(entry.rev || ''),
    source: String(entry.source),
    relPath: entry.relPath || '',
    sourceType: String(entry.sourceType || ''),
    // 页面级坐标（domain/application/module/doc）：差异同步命中缓存时需原样恢复，
    // 供 enrich 注入 host.$coord；缺失则存空字符串（向后兼容旧缓存）。
    domain: String(entry.domain || ''),
    app: String(entry.app || ''),
    module: String(entry.module || ''),
    doc: String(entry.doc || ''),
    ts: Date.now(),
  }
  try {
    await writeWithEvict(rec)
  } catch (err) {
    // QuotaExceededError：淘汰最旧的一批后重试一次。
    if (isQuotaError(err)) {
      try {
        await evictOldest(Math.max(1, Math.floor(MAX_ENTRIES * 0.2)))
        await writeWithEvict(rec)
      } catch (err2) {
        console.warn('[page-cache] 写入仍失败（配额），放弃缓存:', err2)
      }
    } else {
      console.warn('[page-cache] 写入失败，放弃缓存:', err)
    }
  }
}

/**
 * 批量写入（单事务），各自带 LRU 与配额兜底语义由 putPage 逐条保证；此处仅做批量落盘。
 * @param {Array<{ id: string, rev: string, source: string, relPath?: string, domain?: string, app?: string, module?: string, doc?: string }>} entries
 */
export async function putPages (entries) {
  if (!entries || !entries.length) return
  await Promise.all(entries.map((e) => putPage(e.id, e)))
}

/**
 * 删除一个页面缓存条目（_reload bustCache 时调用）。
 * @param {string} pageId
 */
export async function deletePage (pageId) {
  if (!pageId) return
  try {
    await withStore('readwrite', (store) => store.delete(pageId))
  } catch (err) {
    console.warn('[page-cache] 删除失败:', err)
  }
}

/**
 * 清空整个缓存（全量 bust 或调试）。
 */
export async function clear () {
  try {
    await withStore('readwrite', (store) => store.clear())
  } catch (err) {
    console.warn('[page-cache] 清空失败:', err)
  }
}

/**
 * 写入一条记录，并在总数超 MAX_ENTRIES 时淘汰最旧的（按 ts 升序）。
 *
 * 采用「写 + 写后 LRU 收敛」两步：先在本事务 put，再单独事务读全量按 ts 排序删最旧。
 * 不在写入事务内做游标淘汰，因 IDB objectStore 默认按主键（id 字符串）排序而非 ts，
 * 建索引会升级 schema；量级 500，读全量排序代价可接受。
 * @param {{ id: string, rev: string, source: string, relPath?: string, ts: number }} rec
 */
async function writeWithEvict (rec) {
  await withStore('readwrite', (store) => store.put(rec))
  await evictIfOverLimit()
}

/**
 * 若条目数超 MAX_ENTRIES，按 ts 升序淘汰最旧的直至回到上限。
 */
async function evictIfOverLimit () {
  try {
    const db = await openDb()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PAGES, 'readwrite')
      const store = tx.objectStore(STORE_PAGES)
      const allReq = store.getAll()
      allReq.onsuccess = () => {
        const all = allReq.result || []
        if (all.length <= MAX_ENTRIES) return
        // 按 ts 升序（旧 → 新），删最旧的 (all.length - MAX_ENTRIES) 条
        all.sort((a, b) => (a.ts || 0) - (b.ts || 0))
        const toRemove = all.slice(0, all.length - MAX_ENTRIES)
        for (const rec of toRemove) store.delete(rec.id)
      }
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
    })
  } catch (err) {
    console.warn('[page-cache] LRU 淘汰失败:', err)
  }
}

/**
 * 淘汰最旧的 n 条（配额不足时主动收缩）。
 * @param {number} n
 */
async function evictOldest (n) {
  if (!n || n <= 0) return
  try {
    const db = await openDb()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PAGES, 'readwrite')
      const store = tx.objectStore(STORE_PAGES)
      const allReq = store.getAll()
      allReq.onsuccess = () => {
        const all = (allReq.result || []).slice().sort((a, b) => (a.ts || 0) - (b.ts || 0))
        for (const rec of all.slice(0, n)) store.delete(rec.id)
      }
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
    })
  } catch (err) {
    console.warn('[page-cache] evictOldest 失败:', err)
  }
}

/**
 * 判断错误是否为配额超限（跨浏览器名称不一）。
 * @param {unknown} err
 * @returns {boolean}
 */
function isQuotaError (err) {
  if (!err) return false
  const name = /** @type {{ name?: string }} */ (err).name || ''
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED'
}

/**
 * 请求持久化存储（best-effort，防浏览器低压淘汰缓存）。启动时调一次即可。
 * 不阻塞主流程，失败静默。
 * @returns {Promise<boolean>} 是否已持久化
 */
export async function requestPersistentStorage () {
  try {
    if (navigator.storage && typeof navigator.storage.persist === 'function') {
      if (await navigator.storage.persisted()) return true
      return await navigator.storage.persist()
    }
  } catch (err) {
    console.warn('[page-cache] 请求持久化存储失败:', err)
  }
  return false
}

/**
 * 查询当前存储配额使用情况（调试/监控用）。
 * @returns {Promise<{ usage: number, quota: number }>}
 */
export async function estimateStorage () {
  try {
    if (navigator.storage && typeof navigator.storage.estimate === 'function') {
      const est = await navigator.storage.estimate()
      return { usage: est.usage || 0, quota: est.quota || 0 }
    }
  } catch (err) {
    console.warn('[page-cache] 查询配额失败:', err)
  }
  return { usage: 0, quota: 0 }
}
