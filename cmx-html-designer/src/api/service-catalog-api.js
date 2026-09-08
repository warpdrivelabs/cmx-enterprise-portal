/**
 * Service Catalog API client：与 cmx-container 后端 `/api/service-catalog` 对齐。
 * 给设计器「服务面板 → 从目录选择」提供 Bruno collection 解析出的服务目录（按 DAM 分类）。
 */

import { apiFetch } from 'cmx-ui5-runtime/api-client'

const BASE = '/api/service-catalog';


/**
 * 列出服务目录条目；可按 domain / app / module 过滤。
 * @param {{ domain?: string, app?: string, module?: string }} [opts]
 * @returns {Promise<Array<{ id: string, domain: string, app: string, module: string, page: string,
 *   label: string, type: string, url: string, urlPreview: string, method: string,
 *   headers: Record<string,string>, bodyTemplate: string,
 *   params: Array<{ key: string, value: string }>, description: string }>>}
 */
export async function listServices(opts = {}) {
  const q = [
    opts.domain ? `domain=${encodeURIComponent(opts.domain)}` : '',
    opts.app ? `app=${encodeURIComponent(opts.app)}` : '',
    opts.module ? `module=${encodeURIComponent(opts.module)}` : '',
  ].filter(Boolean).join('&');
  const j = await apiFetch(`${BASE}${q ? `?${q}` : ''}`);
  return Array.isArray(j?.services) ? j.services : [];
}

/**
 * 取单个服务定义。
 * @param {string} id
 */
export async function getServiceById(id) {
  return apiFetch(`${BASE}/${encodeURIComponent(id)}`);
}
