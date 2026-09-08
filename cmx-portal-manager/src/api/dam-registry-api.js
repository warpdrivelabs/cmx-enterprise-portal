/**
 * 封装 /api/registry/dam -- DAM 注册表（域/应用/模块），供菜单管理页级联选择。
 * 走全局 fetch 拦截器（自动鉴权 + 拆 ApiResp 信封到 data）。
 */
import { apiFetch } from 'cmx-ui5-runtime/api-client'


/**
 * @returns {Promise<{ domains: any[], applications: any[], modules: any[] }>}
 *   applications 每项含 domain/id；modules 每项含 domain/application/id。
 */
export async function fetchDamRegistry (activeOnly = false) {
  const data = await apiFetch(`/api/registry/dam?active_only=${activeOnly ? 'true' : 'false'}`, {
    headers: { Accept: 'application/json' },
  })
  return {
    domains: Array.isArray(data?.domains) ? data.domains : [],
    applications: Array.isArray(data?.applications) ? data.applications : (Array.isArray(data?.apps) ? data.apps : []),
    modules: Array.isArray(data?.modules) ? data.modules : [],
  }
}
