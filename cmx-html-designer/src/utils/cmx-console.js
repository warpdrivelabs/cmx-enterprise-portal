/**
 * 设计器内 console 桥接：保留原生引用 `cmx_log`，将全局 console.log/warn/error
 * 双写到 DevTools 与自定义 sink（如 inspector 调试区）。
 */

/** 原生 console 方法（绕过当前劫持，仅供内部或需避免递归时使用） */
export const cmx_log = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

/** @type {{ log?: typeof console.log, warn?: typeof console.warn, error?: typeof console.error } | null} */
let _saved = null;
let _installed = false;

function formatArg(a) {
  if (a === undefined) return 'undefined';
  if (a === null) return 'null';
  if (typeof a === 'string') return a;
  if (a instanceof Error) return a.stack || `${a.name}: ${a.message}`;
  try {
    return JSON.stringify(a);
  } catch {
    return String(a);
  }
}

function formatArgs(args) {
  return Array.from(args, formatArg).join(' ');
}

/**
 * 劫持 window.console 的 log / warn / error：先调用原生输出，再调用 sink。
 * @param {(level: 'log' | 'warn' | 'error', line: string) => void} sink
 */
export function installCmxConsoleTap(sink) {
  if (_installed) uninstallCmxConsoleTap();
  _saved = {
    log: console.log,
    warn: console.warn,
    error: console.error,
  };
  console.log = (...args) => {
    cmx_log.log(...args);
    try {
      sink('log', formatArgs(args));
    } catch {
      /* sink 内勿抛错影响业务 */
    }
  };
  console.warn = (...args) => {
    cmx_log.warn(...args);
    try {
      sink('warn', formatArgs(args));
    } catch {
      /* ignore */
    }
  };
  console.error = (...args) => {
    cmx_log.error(...args);
    try {
      sink('error', formatArgs(args));
    } catch {
      /* ignore */
    }
  };
  _installed = true;
}

/** 恢复劫持前的 console.log / warn / error */
export function uninstallCmxConsoleTap() {
  if (!_installed || !_saved) return;
  console.log = _saved.log;
  console.warn = _saved.warn;
  console.error = _saved.error;
  _saved = null;
  _installed = false;
}

export function isCmxConsoleTapInstalled() {
  return _installed;
}
