/**
 * 用户态代码（事件 / 函数 / 服务）的「可断点化」工具。
 *
 * 设计目标：
 * - 给所有 `new Function(...)` 拼出的用户代码追加稳定的 `//# sourceURL=cmx://…`，
 *   让 DevTools 「Sources」面板把每条代码当作独立虚拟文件展示，断点按 URL 持久化。
 * - 调试模式开启时（顶栏切换），在每条用户代码首行注入 `debugger;`，进入即暂停。
 *   状态写入 sessionStorage，且会注入到导出/运行/调试页的运行时全局变量 `__cmxDebug`。
 */

const SAFE_SLUG = /[^a-zA-Z0-9._-]+/g;

function safeSlug (s, fallback = 'unnamed') {
  const v = String(s ?? '').trim().replace(SAFE_SLUG, '-').replace(/^-+|-+$/g, '');
  return v || fallback;
}

/** 生成稳定的 sourceURL（不含换行），便于 DevTools 按 URL 持久化断点 */
export function makeSourceUrl (kind, parts) {
  const segs = [String(kind).trim()].concat((parts || []).map((p) => safeSlug(p))).filter(Boolean);
  return `cmx://${segs.join('/')}`;
}

/**
 * 装饰用户代码：
 * - opts.breakOnEnter=true → 在首行插入 `debugger;`
 * - 末尾追加 `//# sourceURL=…`
 * @param {string} code
 * @param {string} sourceUrl
 * @param {{ breakOnEnter?: boolean }} [opts]
 */
export function decorateUserCode (code, sourceUrl, opts = {}) {
  const body = String(code ?? '');
  const prefix = opts.breakOnEnter ? 'debugger;\n' : '';
  const suffix = sourceUrl ? `\n//# sourceURL=${sourceUrl}` : '';
  return `${prefix}${body}${suffix}`;
}

const DEBUG_MODE_KEY = '__cmx_designer_debug_mode__';

export function getDesignerDebugMode () {
  try {
    if (typeof sessionStorage === 'undefined') return false;
    return sessionStorage.getItem(DEBUG_MODE_KEY) === '1';
  } catch { return false; }
}

export function setDesignerDebugMode (on) {
  try {
    if (typeof sessionStorage === 'undefined') return;
    if (on) sessionStorage.setItem(DEBUG_MODE_KEY, '1');
    else sessionStorage.removeItem(DEBUG_MODE_KEY);
  } catch {}
}

/** 已序列化为 JS 字面量的调试开关，可直接拼入导出/运行页脚本中作为 `window.__cmxDebug` 的初值 */
export function debugModeRuntimeLiteral () {
  return getDesignerDebugMode() ? 'true' : 'false';
}
