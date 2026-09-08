/**
 * 封装 /api/iam/permissions/list -- 权限（功能码）列表，供菜单管理页功能码选择。
 * 走全局 fetch 拦截器：自动鉴权 + 拆 ApiResp 信封（code===0 时返回 data 数组）。
 */
import { apiFetch } from 'cmx-ui5-runtime/api-client'


/**
 * 拉取全部菜单类权限（resource_type=menu），不按 DAM 过滤。
 * @returns {Promise<Array<Record<string, any>>>}
 */
async function fetchAllMenuPermissions () {
  const data = await apiFetch('/api/iam/permissions/list', {
    method: 'POST',
    body: JSON.stringify({ filters: [{ resource_type: { $eq: 'menu' } }] }),
    credentials: 'same-origin',
  })
  return Array.isArray(data) ? data : []
}

/**
 * 查询菜单类权限（功能码）列表，供菜单节点绑定功能码。
 *
 * 注意：权限表的 domain/app/module 编码大小写与命名（如 FIN/FI/GL）常与菜单树的
 * DAM 编码（fi/cmxfico/gl）不一致，按 DAM 精确过滤会恒空。因此这里**先拉全量菜单权限**，
 * 再在**客户端做大小写不敏感的软过滤**：命中则返回过滤结果，命中 0 则回退全量（附 `_unfiltered` 标记），
 * 让调用方能提示「已展示全部功能码」而非空列表。
 *
 * @param {{ domain_code?: string, app_code?: string, module_code?: string }} [ctx]
 * @returns {Promise<Array<{ code: string, name: string, resource_type: string, description?: string, _unfiltered?: boolean }>>}
 */
export async function listMenuPermissions (ctx = {}) {
  const all = await fetchAllMenuPermissions()
  const norm = (v) => String(v ?? '').trim().toLowerCase()
  const want = { d: norm(ctx.domain_code), a: norm(ctx.app_code), m: norm(ctx.module_code) }
  // 无任何过滤条件 → 直接全量
  if (!want.d && !want.a && !want.m) return all
  const filtered = all.filter((p) => {
    const okD = !want.d || norm(p.domain_code) === want.d
    const okA = !want.a || norm(p.app_code) === want.a
    const okM = !want.m || norm(p.module_code) === want.m
    return okD && okA && okM
  })
  if (filtered.length > 0) return filtered
  // 软过滤后为空 → 回退全量，并打标记供 UI 提示
  return all.map((p) => ({ ...p, _unfiltered: true }))
}

