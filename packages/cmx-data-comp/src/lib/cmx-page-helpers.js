/**
 * cmx-page-helpers — 原生页面（native-pages）共享微工具集
 *
 * 原生页面模块经 Blob URL 动态 import，拿不到裸包 import 通道，唯一共享通路是
 * 门户 / 设计器运行时把本库 barrel 挂到 `globalThis.__cmxDataComp`（Portal 见
 * CMXPortalManager/src/import-ui5-and-app.js；Designer 见 plugins/cmx-models-plugin.js）。
 * 页面内用法：
 *   const { escHtml, escAttr, apiJson, apiGet, apiPost } = globalThis.__cmxDataComp
 *
 * 收敛三件最常重复的小轮子（documents/plans/20260827_前端重复代码治理清单.md B-01）：
 *   - escHtml / escAttr — HTML 转义，统一最严格语义（& < > " ' 全转）。两个名字同实现，
 *     只表达插值上下文意图（文本 vs 属性）；比历史各页变体只多转不少转——文本上下文
 *     多转引号不影响渲染，属性上下文多转单引号亦无害，故替换旧宽松 esc 是安全的。
 *   - apiJson / apiGet / apiPost — 统一 fetch 封装：ApiResp 信封解包（{code,msg,data}，
 *     code !== 0 抛错并透传 msg / error）+ HTTP 非 2xx 抛错；错误对象挂 .status / .body
 *     供调用方分支。默认同源 cookie；经 cfg 可切组件壳 Bearer 模式。
 *
 * toast 不在此文件——barrel 已导出 showCmxToast / showCmxError（lib/cmx-toast.js）。
 */

/** HTML 文本 / 属性转义（& < > " ' 全转）。null/undefined 输出空串。 */
export function escHtml (s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** 属性插值上下文专用名（与 escHtml 同语义，双名便于读代码与 grep 审计）。 */
export const escAttr = escHtml

function safeHeaders (h) {
  if (typeof h === 'function') { try { return h() || {} } catch { return {} } }
  return h && typeof h === 'object' ? h : {}
}

/** 错误文案优先级：body.msg / body.error（ApiResp 用 msg、cmx_api_types::Error 用 error）→ 业务码 → HTTP 状态。 */
function errText (j, res) {
  if (j && (j.msg || j.error)) return j.msg || j.error
  if (j && typeof j.code === 'number' && j.code !== 0) return `业务错误 ${j.code}`
  return `HTTP ${res.status}`
}

/**
 * 统一 JSON fetch 封装。
 *
 * B2 例外：native 页经 Blob URL import 装载，无法解析裸模块名，
 * 本函数即该上下文的 apiFetch 等价收敛点（错误挂 .status/.body，能力对齐甚至更强）。
 *
 * @param {string} url API 路径；以 / 开头且 cfg.apiBase 非空时自动加前缀。
 * @param {object} [options] 原样透传 fetch init（method/body/headers 等）。
 * @param {object} [cfg] 页面级配置，可直接传页面 CFG 对象（多余键忽略）：
 *   - apiBase：请求前缀（门户空串 = 同源相对路径）。
 *   - fetchInit：整块 fetch init 默认值（如 { credentials:'omit' }），被 options 覆盖。
 *   - authHeaders：函数或对象，返回附加请求头（组件壳返回 { Authorization:'Bearer …' }）。
 * @returns {Promise<any>} 信封含 data 字段时解包返回 data，否则原样返回 body。
 * @throws {Error} HTTP 非 2xx 或业务 code !== 0；错误对象挂 .status（HTTP 状态）与 .body（响应体）。
 */
export async function apiJson (url, options = {}, cfg = {}) {
  const full = (cfg.apiBase && String(url).charAt(0) === '/') ? cfg.apiBase + url : url
  const res = await fetch(full, {
    credentials: 'same-origin',
    ...(cfg.fetchInit || {}),
    ...options,
    headers: {
      Accept: 'application/json',
      ...safeHeaders(cfg.authHeaders),
      ...(options.headers || {}),
    },
  })
  let j = null
  try { j = await res.json() } catch { /* 非 JSON 响应体（如网关裸 502）走 !res.ok 分支 */ }
  if (!res.ok || (j && typeof j.code === 'number' && j.code !== 0)) {
    const e = new Error(errText(j, res))
    e.status = res.status
    e.body = j
    // 结构化错误契约（对齐 cmx-doc-source，供 presentDocError 等分 conflict/validation/generic 三态）：
    // 门户 fetch 拦截器已把信封拆成非 2xx + {error,msg,code,data?,violations?}，这里两条通路都覆盖。
    if (j && j.code != null) e.code = j.code
    if (res.status === 409 || (j && j.code === 409)) e.conflict = true
    const vio = j && (Array.isArray(j.violations) ? j.violations
      : (j.data && Array.isArray(j.data.violations) ? j.data.violations : null))
    if (vio && vio.length) { e.violations = vio; e.validation = true }
    throw e
  }
  return j && typeof j === 'object' && 'data' in j ? j.data : j
}

/** GET 便捷版；dbId 非空时带 db_id 请求头（多数据源路由，签名对齐 mdm 页面存量 apiGet(url, dbId)）。 */
export async function apiGet (url, dbId, cfg = {}) {
  return apiJson(url, dbId ? { headers: { db_id: dbId } } : {}, cfg)
}

/** POST JSON 便捷版；dbId 非空时带 db_id 请求头（签名对齐 mdm 页面存量 apiPost(url, payload, dbId)）。 */
export async function apiPost (url, payload, dbId, cfg = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (dbId) headers.db_id = dbId
  return apiJson(url, { method: 'POST', headers, body: JSON.stringify(payload || {}) }, cfg)
}
