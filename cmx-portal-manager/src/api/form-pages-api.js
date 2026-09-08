/**
 * 与 cmx-node-server 提供的表单页 REST 对齐（/api/form-pages）
 * 与 CMXFormDesigner/src/api/form-pages-api.js 一致。
 */

import { apiFetch } from 'cmx-ui5-runtime/api-client'

const BASE = '/api/form-pages'

/**
 * @param {number} [page=1]
 * @param {number} [pageSize=10]
 */
export async function listFormPages(page = 1, pageSize = 10) {
  const u = new URL(BASE, window.location.origin)
  u.searchParams.set('page', String(page))
  u.searchParams.set('pageSize', String(pageSize))
  return apiFetch(u.toString(), { headers: { Accept: 'application/json' } })
}

/**
 * @param {string} id
 * @returns {Promise<{ id: string, name: string, details: string, form: string }>}
 */
export async function getFormPage(id) {
  return apiFetch(`${BASE}/${encodeURIComponent(id)}`, {
    headers: { Accept: 'application/json' },
  })
}

/**
 * @param {{ id: string, name?: string, details?: string, form: string }} payload
 */
export async function saveFormPage(payload) {
  return apiFetch(BASE, {
    method: 'POST',
    body: JSON.stringify({
      id: payload.id,
      name: payload.name ?? '',
      details: payload.details ?? '',
      form: payload.form,
    }),
  })
}
