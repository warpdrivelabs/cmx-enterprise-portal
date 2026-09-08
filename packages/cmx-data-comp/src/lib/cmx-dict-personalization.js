/**
 * cmx-dict-personalization — 数据字典「最近选过」(MRU) 个性化存储。
 *
 * 两层存储：
 *   1) 本地 localStorage（按 dictCode 分桶，立即可用、离线兜底）——主路径。
 *   2) 后端个性化服务（可选）——通过 personalizationService 配置注入的 { load, save } 接口异步同步。
 *
 * 设计取舍：读取时先返回本地，再异步用后端结果合并刷新（先本地兜底、后端异步合并）；
 * 写入时本地立即落、后端 best-effort 异步保存，失败不影响交互。
 *
 * 用法：
 *   const mru = new CmxDictMru({ dictCode: 'ac_subject', max: 10, idCol: 'id', service })
 *   const list = mru.getLocal()              // 同步取本地
 *   await mru.load()                         // 异步合并后端（返回合并后列表）
 *   mru.add(rowPlainObject)                  // 选中后记录（本地立即 + 后端异步）
 *   mru.onChange(list => render(list))       // 订阅变化
 */

const STORE_PREFIX = 'cmx-dict-mru:'

/** 安全读 localStorage（隐私模式 / 配额异常时静默降级）。 */
function readLocal (key) {
  try {
    const raw = globalThis.localStorage?.getItem(key)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function writeLocal (key, list) {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(list))
  } catch {
    /* 配额满 / 隐私模式：忽略，仅内存有效 */
  }
}

export class CmxDictMru {
  /**
   * @param {{
   *   dictCode: string,
   *   idCol?: string,
   *   max?: number,
   *   service?: { load?: (ctx: { dictCode: string }) => Promise<object[]>, save?: (ctx: { dictCode: string, list: object[] }) => Promise<void> } | null,
   * }} opts
   */
  constructor (opts = {}) {
    this.dictCode = String(opts.dictCode || 'default')
    this.idCol = opts.idCol || 'id'
    this.max = Number(opts.max) > 0 ? Number(opts.max) : 10
    this.service = opts.service || null
    this._key = STORE_PREFIX + this.dictCode
    /** @type {object[]} 当前合并后的 MRU（普通对象数组，最近的在前） */
    this._list = readLocal(this._key)
    /** @type {Set<(list: object[]) => void>} */
    this._subs = new Set()
  }

  /** 同步返回当前本地 MRU 列表（最近在前）。 */
  getLocal () {
    return this._list.slice()
  }

  /** 订阅变化，返回取消函数。 */
  onChange (fn) {
    if (typeof fn === 'function') this._subs.add(fn)
    return () => this._subs.delete(fn)
  }

  _emit () {
    const snap = this._list.slice()
    for (const fn of this._subs) {
      try { fn(snap) } catch (_) { /* 订阅者异常隔离 */ }
    }
  }

  _idOf (row) {
    return row == null ? null : String(row[this.idCol] ?? row.id ?? '')
  }

  /**
   * 记录一次选中：去重置顶、截断到 max，本地立即落地，后端 best-effort 异步保存。
   * @param {object} row 选中行的普通对象（会浅拷贝存储）
   */
  add (row) {
    const id = this._idOf(row)
    if (!id) return
    const plain = { ...row }
    const next = [plain, ...this._list.filter((r) => this._idOf(r) !== id)].slice(0, this.max)
    this._list = next
    writeLocal(this._key, next)
    this._emit()
    // 后端异步保存（不阻塞、不抛）
    if (this.service && typeof this.service.save === 'function') {
      Promise.resolve()
        .then(() => this.service.save({ dictCode: this.dictCode, list: next.slice() }))
        .catch(() => { /* best-effort */ })
    }
  }

  /** 清空 MRU（本地 + 后端）。 */
  clear () {
    this._list = []
    writeLocal(this._key, [])
    this._emit()
    if (this.service && typeof this.service.save === 'function') {
      Promise.resolve()
        .then(() => this.service.save({ dictCode: this.dictCode, list: [] }))
        .catch(() => {})
    }
  }

  /**
   * 删除一条 MRU（按 id 或行对象）：本地立即落地，后端 best-effort 异步保存。
   * @param {string|object} idOrRow
   */
  remove (idOrRow) {
    const id = typeof idOrRow === 'object' && idOrRow !== null ? this._idOf(idOrRow) : String(idOrRow ?? '')
    if (!id) return
    const next = this._list.filter((r) => this._idOf(r) !== id)
    if (next.length === this._list.length) return
    this._list = next
    writeLocal(this._key, next)
    this._emit()
    if (this.service && typeof this.service.save === 'function') {
      Promise.resolve()
        .then(() => this.service.save({ dictCode: this.dictCode, list: next.slice() }))
        .catch(() => { /* best-effort */ })
    }
  }

  /**
   * 异步从后端加载并与本地合并（后端优先、本地补充），刷新本地缓存与订阅者。
   * 无后端服务时直接返回本地。
   * @returns {Promise<object[]>}
   */
  async load () {
    if (!this.service || typeof this.service.load !== 'function') {
      return this.getLocal()
    }
    let remote = []
    try {
      remote = await this.service.load({ dictCode: this.dictCode })
    } catch {
      return this.getLocal()  // 后端失败：维持本地
    }
    if (!Array.isArray(remote)) remote = []
    // 合并：后端顺序优先，本地里后端没有的追加在后，去重，截断
    const seen = new Set()
    const merged = []
    for (const r of [...remote, ...this._list]) {
      const id = this._idOf(r)
      if (!id || seen.has(id)) continue
      seen.add(id)
      merged.push({ ...r })
      if (merged.length >= this.max) break
    }
    this._list = merged
    writeLocal(this._key, merged)
    this._emit()
    return this.getLocal()
  }
}

/**
 * 从一个 pageService 包装出 MRU 后端 { load, save } 接口（约定同 combo-box 的 source 风格）。
 * service 形如 (params, _opts) => Promise<any>，约定：
 *   load:  service({ action:'load', dictCode })  → 返回数组或 { items:[] }
 *   save:  service({ action:'save', dictCode, list })
 * @param {(params: object, opts?: object) => Promise<any>} service
 * @returns {{ load: Function, save: Function }}
 */
export function createMruServiceFromPageService (service) {
  return {
    async load ({ dictCode }) {
      const res = await service({ action: 'load', dictCode })
      if (Array.isArray(res)) return res
      if (res && Array.isArray(res.items)) return res.items
      return []
    },
    async save ({ dictCode, list }) {
      await service({ action: 'save', dictCode, list })
    },
  }
}
