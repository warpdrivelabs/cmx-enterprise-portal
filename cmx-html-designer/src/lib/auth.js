/**
 * 认证助手 —— 对接 cmx-container 的 /api/auth/*。
 *
 * 登录/登出/取当前用户/刷新令牌；token 存取复用 api-client.js 的 localStorage 封装。
 * 登录页（login.html）与主应用（main.js 启动门）共用本模块。
 */

// 登记例外：本文件保留 raw fetch——登录/刷新为 auth 端点，apiFetch 的 401→清 token 跳登录语义会吞掉"密码错误"等提示（拦截器对 /api/auth/* 亦不强加 token）。

import { setTokens, clearTokens, getToken, LOGIN_PATH } from 'cmx-ui5-runtime/api-client'

const AUTH_BASE = '/api/auth'

/** 解析 ApiResp 信封（与 apiFetch 同口径，但不触发 401 跳转，供登录页自行处理错误）。 */
async function authJson (res) {
  let body = null
  const text = await res.text()
  if (text) { try { body = JSON.parse(text) } catch { body = text } }
  if (body && typeof body === 'object' && typeof body.code === 'number') {
    if (body.code !== 0) {
      const err = new Error(body.msg || `登录失败 (code ${body.code})`)
      err.code = body.code
      throw err
    }
    return body.data
  }
  if (!res.ok) throw new Error((body && body.msg) || (body && body.error) || `HTTP ${res.status}`)
  return body
}

/**
 * 登录。成功后写入 access/refresh token 并返回令牌信息。
 * @param {{ username: string, password: string, deviceType?: string, deviceId?: string }} creds
 */
export async function login ({ username, password, deviceType = 'web', deviceId } = {}) {
  const res = await fetch(`${AUTH_BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      username,
      password,
      device_type: deviceType,
      device_id: deviceId || `web-${Math.random().toString(36).slice(2, 10)}`,
    }),
  })
  const data = await authJson(res)
  setTokens(data.access_token, data.refresh_token)
  return data
}

/** 登出：调后端使令牌失效，并清本地 token。即使后端失败也清本地。 */
export async function logout () {
  const token = getToken()
  try {
    if (token) {
      await fetch(`${AUTH_BASE}/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      })
    }
  } catch {} finally {
    clearTokens()
  }
}

/** 取当前登录用户信息（/api/auth/me）；未登录或失效时返回 null。 */
export async function fetchCurrentUser () {
  const token = getToken()
  if (!token) return null
  try {
    const res = await fetch(`${AUTH_BASE}/me`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
    if (res.status === 401) { clearTokens(); return null }
    return await authJson(res)
  } catch {
    return null
  }
}

/** 是否已登录（本地有 token；不校验有效性，失效由 401 拦截处理）。 */
export function isLoggedIn () {
  return !!getToken()
}

/** 跳转到登录页（带回跳地址）。 */
export function gotoLogin () {
  if (typeof window === 'undefined') return
  const back = encodeURIComponent(window.location.pathname + window.location.search)
  window.location.assign(`${LOGIN_PATH}?redirect=${back}`)
}

/**
 * 主应用启动门：未登录直接跳登录页并返回 false（调用方应中止后续启动）。
 * @returns {boolean} 是否已登录
 */
export function requireAuthOrRedirect () {
  if (isLoggedIn()) return true
  gotoLogin()
  return false
}
