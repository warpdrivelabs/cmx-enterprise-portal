/**
 * Registry API client：与 cmx-container 后端 `/api/registry/*` 对齐。
 * 提供给设计器侧"保存页面"对话框拉 domain / app / module 三级数据。
 */

import { apiFetch } from 'cmx-ui5-runtime/api-client'

const BASE = '/api/registry';


/**
 * 一次取回 { domains, apps, modules }。
 * @returns {Promise<{ domains: Array<Record<string, unknown>>, apps: Array<Record<string, unknown>>, modules: Array<Record<string, unknown>> }>}
 */
export async function getRegistryDam() {
  return apiFetch(`${BASE}/dam`);
}

/** 单独取 domains（一般用 getRegistryDam 即可）。 */
export async function listDomains() {
  const j = await apiFetch(`${BASE}/domains`);
  return Array.isArray(j?.domains) ? j.domains : [];
}

/** 单独取 apps；可按 domain 过滤。 */
export async function listApps(opts = {}) {
  const q = opts.domain ? `?domain=${encodeURIComponent(opts.domain)}` : '';
  const j = await apiFetch(`${BASE}/apps${q}`);
  return Array.isArray(j?.apps) ? j.apps : [];
}

/** 单独取 modules；可按 domain / app 过滤。 */
export async function listModules(opts = {}) {
  const q = [
    opts.domain ? `domain=${encodeURIComponent(opts.domain)}` : '',
    opts.app ? `app=${encodeURIComponent(opts.app)}` : '',
  ].filter(Boolean).join('&');
  const j = await apiFetch(`${BASE}/modules${q ? `?${q}` : ''}`);
  return Array.isArray(j?.modules) ? j.modules : [];
}
