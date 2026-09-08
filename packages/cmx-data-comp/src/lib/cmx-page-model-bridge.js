export function createPageModelBridge(host, options = {}) {
  const pageId = options.pageId || ''
  const eventName = options.eventName || 'cmx-page-model'
  const root = options.root || host?.shadowRoot || null

  function $(selector) { return root?.querySelector?.(selector) || null }
  function $all(selector) { return Array.from(root?.querySelectorAll?.(selector) || []) }
  function setText(id, value) {
    const el = $('#' + id)
    if (el) el.textContent = value == null ? '' : String(value)
  }
  function modelHost() {
    try { return host?.workspace?.pageview?.[pageId] || null } catch (_) { return null }
  }
  function ctx() {
    try { return host?.workspace?.context || null } catch (_) { return null }
  }
  function fire(kind, extra = {}) {
    try { window.dispatchEvent(new CustomEvent(eventName, { detail: { kind, ...extra } })) } catch (_) {}
  }
  function fireModelReady(kind, extra = {}) {
    fire(kind, extra)
  }
  function fireModelEvent(kind, extra = {}) {
    fire(kind, extra)
  }
  function ready(kind, cb, opts = {}) {
    const timeout = opts.timeout || 120
    const interval = opts.interval || 80
    function hit(m) { return kind === 'meta' ? m?.__metaReady : m?.__ready }
    const m = modelHost()
    if (hit(m)) { cb(m); return () => {} }
    function h() {
      const mm = modelHost()
      if (hit(mm)) { clearInterval(t); window.removeEventListener(eventName, h); cb(mm) }
    }
    window.addEventListener(eventName, h)
    let n = 0
    const t = setInterval(() => {
      const mm = modelHost()
      if (hit(mm)) { clearInterval(t); window.removeEventListener(eventName, h); cb(mm) }
      if (++n > timeout) { clearInterval(t); window.removeEventListener(eventName, h) }
    }, interval)
    return () => { clearInterval(t); window.removeEventListener(eventName, h) }
  }
  function on(kind, cb) {
    const h = (ev) => { if (ev?.detail?.kind === kind) cb(modelHost(), ev.detail) }
    window.addEventListener(eventName, h)
    return () => window.removeEventListener(eventName, h)
  }
  function getContext(key) {
    const c = ctx()
    return c?.get ? c.get(key) : undefined
  }
  function setContext(key, value) {
    const c = ctx()
    if (c?.set) c.set(key, value)
  }
  function onContext(key, cb) {
    const c = ctx()
    if (!c?.on) return () => {}
    const h = (ev) => {
      if (ev?.key === key) cb(ev.value, ev)
    }
    c.on('change', h)
    return () => {
      try {
        if (typeof c.off === 'function') c.off('change', h)
        else if (typeof c.removeListener === 'function') c.removeListener('change', h)
      } catch (_) {}
    }
  }
  return {
    $,
    $all,
    all: $all,
    setText,
    modelHost,
    model: modelHost,
    ctx,
    context: ctx,
    fire,
    fireModelReady,
    fireModelEvent,
    ready,
    on,
    onModelReady: ready,
    onModelEvent: on,
    getContext,
    setContext,
    onContext,
  }
}
