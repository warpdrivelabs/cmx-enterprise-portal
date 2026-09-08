/**
 * 定义中心共享提示 / 错误工具 —— 供 PortalDefinitionManager 与 PortalDefinitionList 复用。
 *
 * 这两个类是各自独立的 custom element（无继承关系），历史上把同一套 `_notify/_showError/
 * _showWarn/_httpError/_errorDetails` 各抄了一份。本模块把这套逻辑抽成纯函数，消除重复、
 * 避免策略漂移（见 cmx-components-guide 技能 frontend-conventions.md 总则）。
 *
 * 复用入口：
 * - 弹提示：showDefError / showDefWarn（showCmxMessage 的领域便捷封装）
 * - 组装错误：buildHttpError（从后端失败响应构造带 code/violations/detail 的 Error）
 * - 抽明细：extractErrorDetails（从 Error 抽出可逐行展示的 violations / detail）
 */
import { showCmxMessage } from 'cmx-data-comp'

/**
 * 从后端失败响应构造带错误码的 Error：优先 data.error/message，附带 HTTP 状态与 data.code。
 *
 * 注：PortalManager 的 `installAuthFetchInterceptor` 已全局把 ApiResp 信封透明拆成
 * `{ error, code, violations, detail }` 形态，故这里的 data 形状由拦截器保证。
 *
 * @param {string} fallback  无后端文案时的兜底标题
 * @param {Response} res
 * @param {any} data         已解析的响应体（可能为 null）
 * @returns {Error}
 */
export function buildHttpError (fallback, res, data) {
  const msg = (data && (data.error || data.message)) || `${fallback}（HTTP ${res.status}）`
  const err = new Error(msg)
  if (data && data.code != null) err.code = data.code
  if (data && Array.isArray(data.violations)) err.violations = data.violations
  if (data && data.detail != null) err.detail = data.detail
  return err
}

/**
 * 从 Error 上抽取可逐行展示的明细：列级校验 violations，或后端 detail（字符串按行拆）。
 * @param {Error & { violations?: unknown[], detail?: string }} err
 * @returns {string[]|undefined}
 */
export function extractErrorDetails (err) {
  if (err && Array.isArray(err.violations) && err.violations.length) {
    return err.violations.map((v) => {
      const loc = [v.table, v.column].filter(Boolean).join('.')
      return `• ${loc ? `[${loc}] ` : ''}${v.message || v.code || '校验未通过'}`
    })
  }
  if (err && typeof err.detail === 'string' && err.detail.trim()) {
    return err.detail.split('\n').map((s) => s.trim()).filter(Boolean).map((s) => (s.startsWith('•') ? s : `• ${s}`))
  }
  return undefined
}

/**
 * 统一提示入口（showCmxMessage 的领域封装）：Error 自动取 message，warning/error 默认补 helpCode。
 *
 * @param {'info'|'warning'|'error'} level
 * @param {string} title            简短标题（如「保存失败」）
 * @param {string|Error} body       正文；传 Error 时取其 message（含多行校验明细）
 * @param {object} [opts]
 * @param {string[]} [opts.details] 明细列表（每条一行，如各条 violation）
 * @param {string}  [opts.helpCode] 帮助定位码/错误码（warning/error 显示「获取帮助」）
 * @param {string}  [opts.helpUrl]  帮助 URL（门户无监听时回退新开标签）
 * @returns {Promise<'ok'|'help'>}
 */
export function notifyDef (level, title, body, opts = {}) {
  const message = body instanceof Error ? (body.message || String(body)) : (body == null ? '' : String(body))
  // warning/error 默认给帮助定位码（用标题兜底），让「获取帮助」始终可用、可带上下文。
  const helpCode = opts.helpCode != null ? opts.helpCode
    : ((level === 'warning' || level === 'error') ? title : undefined)
  return showCmxMessage({ level, title, message, details: opts.details, helpCode, helpUrl: opts.helpUrl })
}

/** error 级对话框便捷入口（默认带「获取帮助」）。 */
export function showDefError (title, body, opts) { return notifyDef('error', title, body, opts) }

/** warning 级对话框便捷入口（默认带「获取帮助」）。 */
export function showDefWarn (title, body, opts) { return notifyDef('warning', title, body, opts) }
