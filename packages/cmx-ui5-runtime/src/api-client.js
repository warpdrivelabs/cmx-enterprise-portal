/**
 * 统一 API 客户端（Portal / HTMLDesigner 共享）—— 对接迁移后的 cmx-container（Rust）后端。
 *
 * 后端响应统一为 ApiResp 信封：`{ code: number, msg: string, data: T }`，`code === 0` 表示成功。
 * 本模块把信封拆掉，成功时返回 `data`，失败时抛出带 `msg` 的 Error，使现有调用方
 * （原先直接消费裸 JSON）改动最小：把 `fetch(...).then(r => r.json())` 换成 `apiFetch(...)` 即可。
 *
 * 职责：
 * 1. 自动注入 `Authorization: Bearer <token>`（token 存于 localStorage，登录后写入）。
 * 2. 解析 ApiResp 信封：`code !== 0` 抛错（消息取 `msg`），否则返回 `data`。
 * 3. 401 未授权：清除本地 token 并跳转登录页（全局必登录）。
 * 4. 兼容老后端的裸错误 `{ error }`（迁移过渡期，少数端点可能尚未包信封）。
 *
 * 应用无感：base / API 前缀全部取自宿主应用的 `import.meta.env`（本包为 workspace 链接包，
 * 随应用各自的 Vite 构建静态注入），两端共用同一份实现，差异只剩构建期环境值。
 */

const TOKEN_KEY = 'cmx_access_token'
const REFRESH_KEY = 'cmx_refresh_token'
/**
 * 登录页地址。**必须 base-aware**：同源托管时整个应用挂在 `import.meta.env.BASE_URL`
 * 下（dev=`/`，prod 构建=应用各自 base，如 `/portal/` / `/html/`）。登录页是 vite 多入口产物
 * `login.html`（真实文件，由后端 ServeDir 直接命中，无需 SPA fallback）。硬编码 `/login`
 * 会越过 base 落到未托管的 `/login` → 404 → 白屏，这正是 8080 下访问应用 base 白屏的根因。 */
const APP_BASE = (import.meta.env && import.meta.env.BASE_URL) || '/'
export const LOGIN_PATH = `${APP_BASE.replace(/\/$/, '')}/login.html`

/**
 * 后端 API 基础地址（构建期由 .env 的 VITE_API_BASE 决定）。
 *
 * 用途：前后端不同源部署时（前端在 A 域，后端在 B 域，且不能用 nginx 反代），
 * 通过此变量把所有 `/api/*` 请求重写到后端域名。
 *
 * 默认空字符串 = 同源（fetch('/api/...') 走浏览器当前 origin，命中同站后端或 nginx 反代）。
 * 设置后如 `https://api.example.com` = 跨域（fetch 自动变为 `https://api.example.com/api/...`）。
 *
 * 仅对 `/api/` 开头的相对路径生效，绝对 URL（http(s)://）原样透传。
 */
const API_BASE = (import.meta.env && import.meta.env.VITE_API_BASE) || ''

/** 读取已保存的访问令牌。 */
export function getToken () {
  try { return localStorage.getItem(TOKEN_KEY) || '' } catch { return '' }
}

/** 保存登录令牌（access + 可选 refresh）。 */
export function setTokens (accessToken, refreshToken) {
  try {
    if (accessToken) localStorage.setItem(TOKEN_KEY, accessToken)
    if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken)
  } catch {}
}

/** 清除登录态。 */
export function clearTokens () {
  try {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(REFRESH_KEY)
  } catch {}
}

/** 跳转登录页（带回跳地址），幂等：已在登录页则不跳。 */
function redirectToLogin () {
  if (typeof window === 'undefined') return
  const { pathname, search } = window.location
  // 防回环①：已在登录页则彻底不跳。用「以 login.html 结尾」判定，兼容 base/尾斜杠差异，
  // 比精确 === LOGIN_PATH 更稳（否则大小写/代理改写等导致守卫失效 → 反复叠加 redirect）。
  if (pathname.endsWith('/login.html')) return
  // 防回环②：回跳目标只取干净 pathname，绝不把当前已有的 ?redirect=... 再编码套进去。
  // 旧实现用 pathname+search，401 风暴下每轮把上轮的 redirect 参数再 encode 追加一层，
  // %2F→%252F→%25252F… 指数膨胀，最终 URL 撑破服务器 URI 上限（~64KB）→ HTTP 414。
  const cleanBack = pathname + (search.includes('redirect=') ? '' : search)
  // 防回环③：极端兜底，回跳地址异常长时直接丢弃，回到应用 base。
  const back = encodeURIComponent(cleanBack.length > 2048 ? APP_BASE : cleanBack)
  window.location.assign(`${LOGIN_PATH}?redirect=${back}`)
}

/**
 * 发起一次 API 请求并返回解包后的业务数据（`ApiResp.data`）。
 *
 * @param {string} path 请求路径（如 `/api/domains`）或完整 URL。
 * @param {RequestInit & { rawResponse?: boolean }} [options]
 *   标准 fetch 选项；额外支持 `rawResponse:true` 时返回原始 Response（用于下载等二进制场景）。
 * @returns {Promise<any>} 成功时为 `ApiResp.data`；失败抛 Error。
 */
export async function apiFetch (path, options = {}) {
  const { rawResponse, headers: userHeaders, ...rest } = options
  const headers = new Headers(userHeaders || {})
  if (!headers.has('Accept')) headers.set('Accept', 'application/json')
  // 仅在有 body 且未显式指定时补 JSON Content-Type（FormData 不补，交给浏览器带 boundary）。
  const isForm = typeof FormData !== 'undefined' && rest.body instanceof FormData
  if (rest.body && !isForm && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const token = getToken()
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(path, { ...rest, headers })

  if (rawResponse) {
    if (res.status === 401) { clearTokens(); redirectToLogin() }
    if (!res.ok) throw new Error(await readErrorMessage(res))
    return res
  }

  // 401：清登录态并跳登录页。
  if (res.status === 401) {
    clearTokens()
    redirectToLogin()
    throw new Error('未授权，请重新登录')
  }

  // 解析响应体（可能为空，如 204）。
  let body = null
  const text = await res.text()
  if (text) {
    try { body = JSON.parse(text) } catch { body = text }
  }

  // HTTP 层失败：优先取信封 msg / 裸 error。
  if (!res.ok) {
    throw new Error(extractMessage(body) || `HTTP ${res.status}`)
  }

  // ApiResp 信封：{ code, msg, data }。
  if (body && typeof body === 'object' && typeof body.code === 'number') {
    if (body.code !== 0) throw new Error(body.msg || `业务错误 (code ${body.code})`)
    return body.data
  }

  // 过渡兼容：尚未包信封的裸响应原样返回。
  return body
}

/** 便捷方法：GET 并解包。 */
export function apiGet (path, options = {}) {
  return apiFetch(path, { ...options, method: 'GET' })
}

/** 便捷方法：POST JSON 并解包。 */
export function apiPost (path, jsonBody, options = {}) {
  return apiFetch(path, { ...options, method: 'POST', body: JSON.stringify(jsonBody ?? {}) })
}

/** 便捷方法：DELETE 并解包。 */
export function apiDelete (path, options = {}) {
  return apiFetch(path, { ...options, method: 'DELETE' })
}

/** 从信封或裸错误对象里抽取人类可读消息。 */
function extractMessage (body) {
  if (!body) return ''
  if (typeof body === 'string') return body
  if (typeof body.msg === 'string') return body.msg
  if (typeof body.error === 'string') return body.error
  return ''
}

/** 读取 Response 的错误消息（rawResponse 路径用）。 */
async function readErrorMessage (res) {
  try {
    const text = await res.text()
    if (text) {
      try { return extractMessage(JSON.parse(text)) || res.statusText || `HTTP ${res.status}` }
      catch { return text }
    }
  } catch {}
  return res.statusText || `HTTP ${res.status}`
}

/**
 * 安装全局 fetch 拦截器：给所有 **同源 `/api/*`** 请求自动加 `Authorization: Bearer <token>`，
 * 并在收到 401 时清登录态、跳登录页。
 *
 * 这样大量散落在组件里、未走 apiFetch 的 `fetch('/api/...')` 调用也能携带令牌、统一处理 401，
 * 无需逐个改写。幂等：重复调用只装一次。auth 端点（/api/auth/*）不强加 token（登录/刷新本身无需）。
 */
export function installAuthFetchInterceptor () {
  if (typeof window === 'undefined' || window.__cmxAuthFetchPatched) return
  const orig = window.fetch.bind(window)
  window.__cmxAuthFetchPatched = true

  /** 判断 URL 是否指向本站 `/api/`（绝对或相对皆可）。 */
  const isApiUrl = (url) => {
    try {
      const u = new URL(url, window.location.origin)
      return u.origin === window.location.origin && u.pathname.startsWith('/api/')
    } catch {
      return typeof url === 'string' && url.startsWith('/api/')
    }
  }
  const isAuthUrl = (url) => {
    try {
      const u = new URL(url, window.location.origin)
      return u.pathname.startsWith('/api/auth/')
    } catch {
      return typeof url === 'string' && url.startsWith('/api/auth/')
    }
  }

  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : (input && input.url) || ''
    if (!isApiUrl(url)) return orig(input, init)

    // 前后端不同源时，把相对路径 /api/* 重写到 API_BASE（如 https://api.example.com/api/...）
    // 仅对字符串 input 生效；Request 对象先取 url 改写再重建。
    if (API_BASE) {
      if (typeof input === 'string' && input.startsWith('/api/')) {
        input = API_BASE.replace(/\/$/, '') + input
      } else if (input && typeof input === 'object' && typeof input.url === 'string' && input.url.startsWith('/api/')) {
        const newUrl = API_BASE.replace(/\/$/, '') + input.url
        input = new Request(newUrl, input)
      }
    }

    const token = getToken()
    // 合并 headers（兼容 Request 对象与普通 init）
    const headers = new Headers((init && init.headers) || (typeof input === 'object' && input.headers) || {})
    if (token && !isAuthUrl(url) && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`)
    }
    const res = await orig(input, { ...init, headers })
    if (res.status === 401 && !isAuthUrl(url)) {
      clearTokens()
      redirectToLogin()
    }
    // auth 端点自行处理信封；非 JSON（SSE/下载/二进制）原样透传。
    const ct = res.headers.get('content-type') || ''
    if (isAuthUrl(url) || !ct.includes('application/json')) return res

    // 透明拆 ApiResp 信封：成功时让裸 res.json() 直接拿到内层 data；
    // 业务错误映射为非 2xx + { error }，使 res.ok=false、消费者能读到错误文案。
    // 不拆信封会导致散落各处的 `const data = await getXxx(); data.html` 实际拿到的是
    // `{code,msg,data}` 外壳、`data.html === undefined`（曾导致设计器设计区打不开页面）。
    let text = ''
    try { text = await res.text() } catch { return res }
    let body
    try { body = JSON.parse(text) } catch {
      return new Response(text, { status: res.status, statusText: res.statusText, headers: res.headers })
    }
    const jsonHeaders = { 'Content-Type': 'application/json; charset=utf-8' }
    if (body && typeof body === 'object' && typeof body.code === 'number') {
      if (body.code === 0) {
        const data = body.data === undefined ? null : body.data
        return new Response(JSON.stringify(data), { status: 200, statusText: 'OK', headers: jsonHeaders })
      }
      const status = (body.code >= 400 && body.code < 600) ? body.code : 400
      // 业务错误：保留 msg + code，并**透传 data**（如列校验 data.violations），
      // 使前端能拿到结构化明细逐行高亮/在对话框展开；仅丢 data 会退化成一句笼统错误。
      // 同时输出 msg：raw-fetch 消费者（如 mdm native-page 的 unwrap 按 body.code 分支后读 body.msg）
      // 依赖原始字段名；只写 error 会让它们读到 undefined 而回退成「业务错误 (code N)」。
      const errMsg = body.msg || `业务错误 (code ${body.code})`
      const errPayload = { error: errMsg, msg: errMsg, code: body.code }
      if (body.data !== undefined && body.data !== null) {
        errPayload.data = body.data
        if (Array.isArray(body.data.violations)) errPayload.violations = body.data.violations
      }
      return new Response(JSON.stringify(errPayload),
        { status, statusText: 'Error', headers: jsonHeaders })
    }
    return new Response(text, { status: res.status, statusText: res.statusText, headers: res.headers })
  }
}
