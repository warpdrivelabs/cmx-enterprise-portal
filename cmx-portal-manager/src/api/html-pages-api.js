/**
 * 与 cmx-container 提供的 HTML 页面 REST 对齐（/api/html-pages）
 * 与 CMXHTMLDesigner/src/api/html-pages-api.js 一致。
 *
 * 已统一走 apiFetch：自动带登录令牌、解包 ApiResp 信封（返回 data）、401 跳登录。
 */

import { apiFetch, apiPost } from 'cmx-ui5-runtime/api-client'

const BASE = '/api/html-pages'

/**
 * @param {number} [page=1]
 * @param {number} [pageSize=10]
 */
export async function listHtmlPages (page = 1, pageSize = 10) {
  const u = new URL(BASE, window.location.origin)
  u.searchParams.set('page', String(page))
  u.searchParams.set('pageSize', String(pageSize))
  return apiFetch(u.toString())
}

/**
 * @param {string} id
 * @returns {Promise<{ id: string, name: string, details: string, latestHtmlFile?: string, html: string }>}
 */
export async function getHtmlPage (id) {
  return apiFetch(`${BASE}/${encodeURIComponent(id)}`)
}

/**
 * 保存或更新页面（与 POST /api/html-pages 一致，按 id upsert）
 * @param {{ id: string, name?: string, details?: string, html: string }} payload
 */
export async function saveHtmlPage (payload) {
  return apiPost(BASE, {
    id: payload.id,
    name: payload.name ?? '',
    details: payload.details ?? '',
    html: payload.html,
  })
}

/**
 * 批量按页面 ID 获取完整定义（与 CMXHTMLDesigner `getHtmlPagesBatch` 一致）。
 * @param {string[]} ids
 * @returns {Promise<{ pages: { id: string, name: string, details: string, latestHtmlFile?: string, html: string }[], errors: { id: string, error: string }[] }>}
 */
export async function getHtmlPagesBatch (ids) {
  return apiPost(`${BASE}/batch`, { ids })
}
