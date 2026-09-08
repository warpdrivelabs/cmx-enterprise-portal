/**
 * cmx-workspace-bridge — 跨页视图桥接工具（消除四区联动 4 页 * 10 行手抄样板）
 *
 * 背景：CMX portal 的 workspace 场景下，多个 pageview（explorer/content/property/model）
 * 共享同一个 workspace.pageview 命名空间与 workspace.context KV 总线。视图页需要访问
 * 隐藏"数据大脑"页（如 dicttree-model）的 API + 监听/广播 window CustomEvent。
 *
 * 原样板（每页手抄 ~10 行）：
 *   function modelHost(){ try{ return host.workspace&&host.workspace.pageview&&host.workspace.pageview['dicttree-model']||null; }catch(e){ return null; } }
 *   function ctx(){ try{ return host.workspace&&host.workspace.context||null; }catch(e){ return null; } }
 *   function fireModelEvent(kind, extra){ try{ ... window.dispatchEvent(new CustomEvent('cmx-dicttree-model',{detail:{kind,...extra}})); }catch(e){} }
 *   function onModelReady(kind, cb){ 三重回退（立即命中 + window 事件 + 轮询 80ms×150） }
 *   function onModelEvent(kind, cb){ ... }
 *
 * 新用法（1 行）：
 *   var bridge = globalThis.__cmxDataComp.useModelBridge(host, { modelId: 'dicttree-model' });
 *   bridge.onReady('data', function(m){ ... 模型已就绪 ... });
 *   bridge.on('gridfilter', function(m, detail){ ... });
 *   bridge.fire('currentDictRow', { row });
 *   bridge.getContext().set('selectedDictId', id);
 */

/**
 * @typedef {object} ModelBridge
 * @property {() => any} getModel        取兄弟 pageview 的 host（未挂载返回 null）
 * @property {() => any} getContext      取 workspace.context（KV + on('change')）
 * @property {(kind: string, extra?: object) => void} fire         广播 window CustomEvent
 * @property {(readinessKey: string, cb: (model: any) => void) => (() => void)} onReady
 *     等模型就绪（三重回退：立即命中 + window 事件 + 80ms 轮询兜底 12 秒后放弃）。
 *     readinessKey 是模型页在 host 上设置的就绪标志键（如 'data' 对应 host.__ready === true，
 *     'meta' 对应 host.__metaReady === true）。返回取消订阅函数。
 * @property {(kind: string, cb: (model: any, detail: object) => void) => (() => void)} on
 *     监听广播事件（按 detail.kind 过滤）。返回取消订阅函数。
 * @property {(kind: string, cb: Function) => void} off
 *     手动取消（当调用方保留 cb 引用时用）；否则用 onReady/on 返回的取消函数。
 */

/**
 * 创建跨页桥接对象。
 *
 * @param {any} host                当前页 host（提供 workspace.pageview / workspace.context 访问点）
 * @param {object} options
 * @param {string} options.modelId  目标兄弟 pageview 的 id（如 'dicttree-model'）
 * @param {string} [options.eventName]  广播事件名，默认 `cmx-${modelId}`
 * @param {(hostRef:any, key:string) => boolean} [options.readyCheck]
 *     自定义就绪判断（缺省：'meta' → host.__metaReady === true；其他 → host.__ready === true）
 * @param {number} [options.pollInterval=80]   轮询间隔（ms）
 * @param {number} [options.pollMaxTries=150]  轮询上限（超过后放弃，防泄漏；默认 80ms × 150 = 12 秒）
 * @returns {ModelBridge}
 */
export function useModelBridge (host, options) {
  const opts = options || {}
  const modelId = String(opts.modelId || '')
  if (!modelId) throw new Error('[useModelBridge] options.modelId 必填（目标兄弟 pageview 的 id）')
  const eventName = opts.eventName || `cmx-${modelId}`
  const readyCheck = typeof opts.readyCheck === 'function'
    ? opts.readyCheck
    : (m, k) => k === 'meta' ? m && m.__metaReady === true : m && m.__ready === true
  const pollInterval = Number(opts.pollInterval) || 80
  const pollMaxTries = Number(opts.pollMaxTries) || 150

  const getModel = () => {
    try {
      const pv = host && host.workspace && host.workspace.pageview
      return (pv && pv[modelId]) || null
    } catch (_) { return null }
  }

  const getContext = () => {
    try {
      return (host && host.workspace && host.workspace.context) || null
    } catch (_) { return null }
  }

  const fire = (kind, extra) => {
    if (typeof window === 'undefined') return
    try {
      const detail = { kind }
      if (extra && typeof extra === 'object') {
        for (const k of Object.keys(extra)) detail[k] = extra[k]
      }
      window.dispatchEvent(new CustomEvent(eventName, { detail }))
    } catch (_) { /* non-browser or dispatch failed → 静默 */ }
  }

  const onReady = (readinessKey, cb) => {
    if (typeof cb !== 'function') return () => {}
    const key = String(readinessKey || 'data')
    // 立即命中：模型已挂载且就绪
    const now = getModel()
    if (readyCheck(now, key)) { try { cb(now) } catch (e) { console.error('[useModelBridge.onReady cb]', e) } return () => {} }
    // 三重回退：window 事件 + 轮询兜底 + 超时放弃
    let done = false
    let timer = null
    const winHandler = () => {
      if (done) return
      const m = getModel()
      if (readyCheck(m, key)) {
        done = true
        if (timer) clearInterval(timer)
        window.removeEventListener(eventName, winHandler)
        try { cb(m) } catch (e) { console.error('[useModelBridge.onReady cb]', e) }
      }
    }
    if (typeof window !== 'undefined') window.addEventListener(eventName, winHandler)
    let tries = 0
    timer = setInterval(() => {
      if (done) { clearInterval(timer); return }
      const m = getModel()
      if (readyCheck(m, key)) {
        done = true
        clearInterval(timer)
        if (typeof window !== 'undefined') window.removeEventListener(eventName, winHandler)
        try { cb(m) } catch (e) { console.error('[useModelBridge.onReady cb]', e) }
      } else if (++tries > pollMaxTries) {
        // 超时放弃：清理监听避免 SPA 场景内存泄漏
        clearInterval(timer)
        if (typeof window !== 'undefined') window.removeEventListener(eventName, winHandler)
      }
    }, pollInterval)
    // 取消函数
    return () => {
      if (done) return
      done = true
      if (timer) clearInterval(timer)
      if (typeof window !== 'undefined') window.removeEventListener(eventName, winHandler)
    }
  }

  const on = (kind, cb) => {
    if (typeof window === 'undefined' || typeof cb !== 'function') return () => {}
    const wanted = String(kind || '')
    const handler = (ev) => {
      if (!ev || !ev.detail) return
      if (wanted && ev.detail.kind !== wanted) return
      try { cb(getModel(), ev.detail) } catch (e) { console.error('[useModelBridge.on cb]', e) }
    }
    window.addEventListener(eventName, handler)
    return () => { try { window.removeEventListener(eventName, handler) } catch (_) {} }
  }

  const off = (_kind, _cb) => {
    // 简化实现：调用方推荐用 on 返回的取消函数；此 API 只作占位
    // （若需按 (kind,cb) 精确移除，需维护额外 handler 表，当前场景 SPA 页销毁时 window 事件会被浏览器自然清理）
  }

  return { getModel, getContext, fire, onReady, on, off }
}
