/**
 * cmx-doc-error-presenter — DCT/DOC 后端存储服务错误 → 专业信息对话框 的统一展示适配层。
 *
 * 背景：cmx-doc-source.js（saveDocData/loadDocData/…）已把后端错误**结构化**成三类：
 *   ① err.conflict            —— HTTP 409 乐观锁冲突（单据已被他人改）
 *   ② err.validation + err.violations[]  —— 422 列级校验失败（{row,table,column,caption,code,message}）
 *   ③ 普通 Error（带 `[saveDocData] …:` 技术前缀）—— 其它后端/网络失败
 * 另有请求被 AbortSignal 取消（err.name==='AbortError'）——属正常中断，默认不弹窗。
 *
 * 但每个调用方若各自 `if(err.conflict)…else if(err.validation)…` 再决定怎么提示，既重复又易漏。
 * 本模块把「结构化错误 → 级别/标题/正文/明细/帮助码」的判定收敛到一处：
 *   - describeDocError(err, opts)  纯函数 → 描述对象（可单测，不碰 DOM）
 *   - presentDocError(err, opts)   调 showCmxMessage 弹出专业对话框（浏览器端）
 *
 * 用法（任何调用 DCT/DOC 存储服务的页面）：
 *   try { await saveDocData(host, def, { changes }) }
 *   catch (err) {
 *     const r = await presentDocError(err, { action:'save', tableNames:{ cv_batch:'凭证批' } })
 *     if (r?.kind === 'conflict') await reload()   // 冲突：确认后刷新到最新版
 *   }
 *
 * 级别取舍：冲突=warning（可恢复，提示「刷新重试」）；校验/普通失败=error。
 * warning/error 均带 helpCode → 对话框显示「获取帮助」，派发 cmx-help-request，门户帮助中心接管。
 */

import { formatViolations } from './cmx-doc-source.js'
import { showCmxMessage } from './cmx-message-dialog.js'

/** 存储服务错误消息的技术前缀，如 `[saveDocData] 保存失败: ` —— 展示前剥掉。 */
const FUNC_PREFIX_RE = /^\[[^\]]+\]\s*/

/** action → 默认标题 / 帮助码。 */
const ACTION_TITLE = { save: '保存失败', load: '装载失败', delete: '删除失败', op: '操作失败' }
const ACTION_CODE = { save: 'DOC_SAVE_FAILED', load: 'DOC_LOAD_FAILED', delete: 'DOC_DELETE_FAILED', op: 'DOC_OP_FAILED' }

/** 剥掉 `[funcName] ` 技术前缀，得到面向用户的干净文案。 */
function cleanMessage (raw) {
  return String(raw == null ? '' : raw).replace(FUNC_PREFIX_RE, '').trim()
}

/** 是否为请求取消/中断（AbortSignal）——正常中断，默认不作为错误提示。 */
function isAbort (err) {
  if (!err) return false
  if (err.name === 'AbortError') return true
  if (err.code === 20 || err.code === 'ABORT_ERR') return true
  return false
}

/** 从错误消息的 `[funcName]` 前缀推断动作语义（save / load）。 */
function inferAction (rawMsg) {
  const m = /^\[([^\]]+)\]/.exec(String(rawMsg || ''))
  const fn = m ? m[1] : ''
  if (/save/i.test(fn)) return 'save'
  if (/load|children|stream|装载/i.test(fn)) return 'load'
  return 'op'
}

/** violations[] → 逐行明细（复用 cmx-doc-source.formatViolations，保持格式单一来源）。 */
function violationLines (violations, tableNames) {
  const text = formatViolations(violations, tableNames)
  return text ? text.split('\n').filter(Boolean) : undefined
}

/** 校验错误消息里内嵌的多行明细（`msg\n• …\n• …`）→ 明细数组（无 violations 时兜底）。 */
function splitEmbeddedDetail (msg) {
  const lines = String(msg || '').split('\n').map((s) => s.trim()).filter(Boolean)
  const bullets = lines.filter((s) => s.startsWith('•'))
  return bullets.length ? bullets : undefined
}

/**
 * 把 DCT/DOC 存储服务错误翻译为对话框描述对象（纯函数，不碰 DOM）。
 *
 * @param {Error|any} err
 * @param {object} [opts]
 * @param {'save'|'load'|'delete'|'op'} [opts.action]  动作语义（缺省从消息前缀推断），决定默认标题/帮助码
 * @param {object} [opts.tableNames]                   物理表名→中文层名映射（violation 前缀用）
 * @param {string} [opts.title]                        覆盖标题
 * @param {string} [opts.helpCode]                     覆盖帮助码
 * @param {string} [opts.conflictMessage]              覆盖冲突正文
 * @param {string} [opts.validationMessage]            覆盖校验正文
 * @param {boolean}[opts.silentAbort=true]             取消/中断是否静默（不弹窗）
 * @returns {{kind:'abort'|'conflict'|'validation'|'generic', ignore?:boolean,
 *            level?:'info'|'warning'|'error', title?:string, message?:string,
 *            details?:string[], helpCode?:string}}
 */
export function describeDocError (err, opts = {}) {
  const o = opts || {}

  // 取消/中断 → 默认静默
  if (o.silentAbort !== false && isAbort(err)) {
    return { kind: 'abort', ignore: true }
  }

  const rawMsg = err instanceof Error ? err.message : (err == null ? '' : String(err))
  const action = o.action || inferAction(rawMsg)

  // ① 乐观锁冲突（409）→ 警告级，明确「刷新重试」
  if (err && err.conflict) {
    return {
      kind: 'conflict',
      level: 'warning',
      title: o.title || '保存冲突',
      message: o.conflictMessage
        || '当前单据已被他人修改。请刷新后在最新版本上重新编辑并保存，以免覆盖他人的改动。',
      details: undefined,
      helpCode: o.helpCode || (err.code != null ? String(err.code) : 'DOC_SAVE_CONFLICT'),
    }
  }

  // ② 列级校验失败（422）→ 错误级，violations 逐行明细
  const violations = (err && Array.isArray(err.violations) && err.violations.length) ? err.violations : null
  if (err && (err.validation || violations)) {
    return {
      kind: 'validation',
      level: 'error',
      title: o.title || '数据校验未通过',
      message: o.validationMessage || '以下字段未通过校验，请修正后重试：',
      details: violations ? violationLines(violations, o.tableNames) : splitEmbeddedDetail(cleanMessage(rawMsg)),
      helpCode: o.helpCode || (violations && violations[0] && violations[0].code) || 'DOC_VALIDATION_FAILED',
    }
  }

  // ③ 普通失败 → 错误级，剥掉技术前缀
  return {
    kind: 'generic',
    level: 'error',
    title: o.title || ACTION_TITLE[action] || ACTION_TITLE.op,
    message: cleanMessage(rawMsg) || '服务器处理失败，请稍后重试。',
    details: undefined,
    helpCode: o.helpCode || ACTION_CODE[action] || ACTION_CODE.op,
  }
}

/**
 * 弹出专业对话框展示 DCT/DOC 存储服务错误（浏览器端；describeDocError + showCmxMessage）。
 *
 * @param {Error|any} err
 * @param {object} [opts]  同 describeDocError；另 opts.helpUrl 透传对话框（门户无监听时回退新开标签）
 * @returns {Promise<{kind:string, choice:'ok'|'help'}|null>}
 *   已弹出→{ kind, choice }；被静默（取消/中断）→ null。
 *   调用方可据 kind 分支（如 kind==='conflict' 时刷新页面）。
 */
export function presentDocError (err, opts = {}) {
  const d = describeDocError(err, opts)
  if (!d || d.ignore) return Promise.resolve(null)
  // 打"已呈现"标记：err 继续向上 re-throw 时，宿主全局 unhandledrejection 兜底（Portal/Designer
  // 的 toast 兜底）据此跳过本错误，避免「对话框 + toast」双提示。标记挂在错误对象上随引用传播。
  if (err && typeof err === 'object') { try { err.__presented = true } catch (_) {} }
  return showCmxMessage({
    level: d.level,
    title: d.title,
    message: d.message,
    details: d.details,
    helpCode: d.helpCode,
    helpUrl: opts.helpUrl,
  }).then((choice) => ({ kind: d.kind, choice }))
}
