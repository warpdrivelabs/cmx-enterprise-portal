/**
 * 封装 cmx-container 的 /api/menu/* 接口（菜单树形 CRUD）。
 *
 * 走全局 fetch 拦截器（api-client.js monkey-patch window.fetch）：自动加 Bearer 鉴权 +
 * 透明拆 ApiResp 信封（code===0 时 res.json() 直接返回 data）。
 *
 * 响应（解包后）：
 *   - getMenuTree: TreeNode<MenuTreeNodeData>[]
 *   - getMenu/createMenu/updateMenu/deleteMenu: DataSet
 */

import { apiFetch } from 'cmx-ui5-runtime/api-client'

const BASE = '/api/menu'

function req (path, init) {
  return apiFetch(`${BASE}${path}`, init)
}

function jsonInit (body) {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  }
}

/** GET /api/menu/tree -- 按域/应用/模块加载菜单树。 */
export async function getMenuTree (params = {}) {
  const q = new URLSearchParams()
  if (params.domain_code) q.set('domain_code', params.domain_code)
  if (params.application_code) q.set('application_code', params.application_code)
  if (params.module_code) q.set('module_code', params.module_code)
  return req(`/tree?${q.toString()}`, { headers: { Accept: 'application/json' } })
}

/** GET /api/menu/get?id= -- 取单个菜单（含 definition）。 */
export async function getMenu (id) {
  return req(`/get?id=${encodeURIComponent(id)}`, { headers: { Accept: 'application/json' } })
}

/** POST /api/menu/create -- 新增菜单节点。data 为 MenuForCreate。 */
export async function createMenu (data) {
  return req('/create', jsonInit(data))
}

/** POST /api/menu/update -- 更新菜单节点。payload = { id, data: MenuForUpdate }。 */
export async function updateMenu (payload) {
  return req('/update', jsonInit(payload))
}

/** POST /api/menu/delete -- 删除菜单节点。ids 为主键数组。 */
export async function deleteMenu (ids) {
  return req('/delete', jsonInit({ ids }))
}
