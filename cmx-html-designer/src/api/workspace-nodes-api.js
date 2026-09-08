/**
 * 与 cmx-container 后端提供的工作区节点 REST 对齐（/api/workspace-nodes）
 */

import { apiFetch } from 'cmx-ui5-runtime/api-client'

const BASE = '/api/workspace-nodes'


/**
 * @returns {Promise<{ items: { id: string, name: string, icon: string, details: string, updatedAt: string }[], total: number }>}
 */
export async function listWorkspaceNodes () {
  return apiFetch(BASE, { headers: { Accept: 'application/json' } })
}

/**
 * @param {string} id
 * @returns {Promise<{ id: string, name: string, icon: string, details: string, workspace: object, updatedAt: string }>}
 */
export async function getWorkspaceNode (id) {
  return apiFetch(`${BASE}/${encodeURIComponent(id)}`, {
    headers: { Accept: 'application/json' },
  })
}

/**
 * @param {{ id: string, name?: string, icon?: string, details?: string, workspace: object }} payload
 * @returns {Promise<{ id: string, name: string, icon: string, details: string, workspace: object, updatedAt: string }>}
 */
export async function saveWorkspaceNode (payload) {
  return apiFetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      id: payload.id,
      name: payload.name ?? '',
      icon: payload.icon ?? '',
      details: payload.details ?? '',
      workspace: payload.workspace,
    }),
  })
}

/**
 * @param {string} id
 * @returns {Promise<{ id: string, removed: boolean }>}
 */
export async function deleteWorkspaceNode (id) {
  return apiFetch(`${BASE}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  })
}
