/**
 * 全局 console / 错误桥接：把 `console.log/info/warn/error/debug`、`window.error`、
 * `unhandledrejection` 统一转发到注册的 sink（如 portal-log-panel）。
 *
 * 设计要点：
 * - **单例** `installConsoleBridge()` 全局只生效一次（多次调用安全）；保留原 console 引用，
 *   `uninstallConsoleBridge()` 可还原（HMR / 单元测试用）。
 * - 桥接同时调用原始 console，开发者仍能在 DevTools 看到原始对象（不丢失对象引用与样式）。
 * - **递归保护**：sink 内部若再触发 console.* 不会形成栈溢出（`_inSink` 哨兵）。
 * - **挂载前的日志不丢**：保留环形 buffer（默认 500 条），sink 注册时 flush。
 * - **限流**：按 microtask 合批 flush，避免高频日志阻塞渲染线程。
 */

/** @typedef {{ level: 'info'|'warn'|'error'|'debug'|'success', message: string, source: string, time: number }} BridgedLogEntry */
/** @typedef {(entry: BridgedLogEntry) => void} LogSink */

const BUFFER_LIMIT = 500

let _installed = false
/** @type {Partial<Record<'log'|'info'|'warn'|'error'|'debug', (...args: unknown[]) => void>>} */
let _origConsole = {}
/** @type {((ev: ErrorEvent) => void) | null} */
let _onError = null
/** @type {((ev: PromiseRejectionEvent) => void) | null} */
let _onRejection = null

/** @type {Set<LogSink>} */
const _sinks = new Set()
/** @type {BridgedLogEntry[]} */
const _buffer = []
let _inSink = false

/** @type {BridgedLogEntry[]} */
const _pendingFlush = []
let _flushScheduled = false

/** @param {unknown} a */
function _stringifyArg (a) {
  if (a instanceof Error) return a.stack || a.message
  if (typeof a === 'string') return a
  if (typeof a === 'object' && a !== null) {
    try { return JSON.stringify(a) } catch { return String(a) }
  }
  return String(a)
}

/** @param {unknown[]} args */
function _formatArgs (args) {
  return args.map(_stringifyArg).join(' ')
}

/** @param {'log'|'info'|'warn'|'error'|'debug'} fn @param {unknown[]} args */
function _shouldSuppressConsoleMessage (fn, args) {
  if (fn !== 'warn') return false
  const msg = _formatArgs(args)
  return /^Key (INPUT_SUGGESTIONS_COLLAPSED|LIST_ROLE_DESCRIPTION) not found in the i18n bundle\b/.test(msg)
}

/** @param {BridgedLogEntry} entry */
function _dispatch (entry) {
  if (_buffer.push(entry) > BUFFER_LIMIT) _buffer.shift()
  if (_sinks.size === 0) return
  _pendingFlush.push(entry)
  if (_flushScheduled) return
  _flushScheduled = true
  queueMicrotask(_flush)
}

function _flush () {
  _flushScheduled = false
  const batch = _pendingFlush.splice(0, _pendingFlush.length)
  if (batch.length === 0) return
  _inSink = true
  try {
    for (const entry of batch) {
      for (const sink of _sinks) {
        try { sink(entry) } catch { /* 单个 sink 失败不影响其他 */ }
      }
    }
  } finally {
    _inSink = false
  }
}

/**
 * 安装桥接。重复调用是 no-op。
 */
export function installConsoleBridge () {
  if (_installed || typeof window === 'undefined') return
  _installed = true

  /** @type {Array<['log'|'info'|'warn'|'error'|'debug', BridgedLogEntry['level']]>} */
  const map = [
    ['log', 'info'],
    ['info', 'info'],
    ['warn', 'warn'],
    ['error', 'error'],
    ['debug', 'debug'],
  ]
  for (const [fn, level] of map) {
    const orig = console[fn].bind(console)
    _origConsole[fn] = orig
    console[fn] = (...args) => {
      if (_shouldSuppressConsoleMessage(fn, args)) return
      orig(...args)
      if (_inSink) return
      _dispatch({
        level,
        message: _formatArgs(args),
        source: 'console',
        time: Date.now(),
      })
    }
  }

  _onError = (ev) => {
    _dispatch({
      level: 'error',
      message: `${ev.message}${ev.filename ? ` @ ${ev.filename}:${ev.lineno}:${ev.colno}` : ''}`,
      source: 'window',
      time: Date.now(),
    })
  }
  _onRejection = (ev) => {
    const r = /** @type {any} */ (ev.reason)
    _dispatch({
      level: 'error',
      message: r?.stack || r?.message || _stringifyArg(r),
      source: 'unhandledrejection',
      time: Date.now(),
    })
  }
  window.addEventListener('error', _onError)
  window.addEventListener('unhandledrejection', _onRejection)
}

export function uninstallConsoleBridge () {
  if (!_installed) return
  _installed = false
  for (const fn of /** @type {const} */ (['log', 'info', 'warn', 'error', 'debug'])) {
    const orig = _origConsole[fn]
    if (orig) console[fn] = orig
  }
  _origConsole = {}
  if (_onError) window.removeEventListener('error', _onError)
  if (_onRejection) window.removeEventListener('unhandledrejection', _onRejection)
  _onError = null
  _onRejection = null
}

/**
 * 注册 sink。返回反注册函数。注册时会 flush buffer 中已有日志（最多 BUFFER_LIMIT 条）。
 * @param {LogSink} sink
 */
export function addConsoleSink (sink) {
  _sinks.add(sink)
  if (_buffer.length > 0) {
    _inSink = true
    try {
      for (const entry of _buffer) {
        try { sink(entry) } catch { /* ignore */ }
      }
    } finally {
      _inSink = false
    }
  }
  return () => { _sinks.delete(sink) }
}
