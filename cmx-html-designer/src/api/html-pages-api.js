/**
 * 与 cmx-container 后端提供的 HTML 页面 REST 对齐（/api/html-pages）
 */

import { apiFetch } from 'cmx-ui5-runtime/api-client'

const BASE = '/api/html-pages';


/**
 * @param {number} [page=1]
 * @param {number} [pageSize=10]
 * @param {{ domain?: string, app?: string, module?: string, keyword?: string }} [filter]
 *   - `domain/app/module`：按 DAM 三级过滤（任一非空即生效，基于 id 点分解析）
 *   - `keyword`：对 id / name / details 做不区分大小写的包含匹配
 * @returns {Promise<{ items: { id: string, name: string, details: string, latestHtmlFile: string, timestamp: string, domain?: string, app?: string, module?: string, relPath?: string }[], total: number, page: number, pageSize: number }>}
 * `timestamp` 与 `latestHtmlFile` 中 `{pageId}_` 与 `.html` 之间的片段一致（如 `20260506_224121880`）。
 */
export async function listHtmlPages(page = 1, pageSize = 10, filter = {}) {
  const u = new URL(BASE, window.location.origin);
  u.searchParams.set('page', String(page));
  u.searchParams.set('pageSize', String(pageSize));
  if (filter && typeof filter === 'object') {
    if (filter.domain) u.searchParams.set('domain', String(filter.domain));
    if (filter.app) u.searchParams.set('app', String(filter.app));
    if (filter.module) u.searchParams.set('module', String(filter.module));
    if (filter.keyword) u.searchParams.set('keyword', String(filter.keyword));
  }
  return apiFetch(u.toString(), { headers: { Accept: 'application/json' } });
}

/**
 * @param {string} id
 * @returns {Promise<{ id: string, name: string, details: string, domain: string|null, app: string|null, module: string|null, doc: string|null, relPath: string|null, rev: string, latestHtmlFile: string, timestamp: string, html: string }>}
 *   `domain/app/module/doc` 为行字段业务坐标（v1 旧行可能为 null；`doc` 对 DOC 单据页非空）。
 *   打开已有页时应透传给保存流程（C6①：防保存丢坐标落到引擎 id 推导兜底）。
 */
export async function getHtmlPage(id) {
  return apiFetch(`${BASE}/${encodeURIComponent(id)}`, {
    headers: { Accept: 'application/json' },
  });
}

/**
 * 保存或更新页面（与 POST /api/html-pages 一致，按 id upsert）
 * @param {{ id: string, name?: string, details?: string, html: string, domain?: string, app?: string, module?: string }} payload
 *   `domain/app/module` 为可选；若未传，后端从 id 命名空间自动解析（不含点的 id → `_legacy` 域）。
 * @returns {Promise<{ id: string, name: string, details: string, latestHtmlFile: string, timestamp: string }>} `timestamp` 与文件名中段一致
 */
export async function saveHtmlPage(payload) {
  const body = {
    id: payload.id,
    name: payload.name ?? '',
    details: payload.details ?? '',
    html: payload.html,
  };
  /* 仅当显式提供时透传 v2 字段（避免空字符串覆盖后端的 id 自动解析）。 */
  if (typeof payload.domain === 'string' && payload.domain.trim()) body.domain = payload.domain.trim();
  if (typeof payload.app === 'string' && payload.app.trim()) body.app = payload.app.trim();
  if (typeof payload.module === 'string' && payload.module.trim()) body.module = payload.module.trim();
  return apiFetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * 批量按页面 ID 获取完整定义（与单条 GET 结构一致，含 html）。
 * @param {string[]} ids
 * @returns {Promise<{ pages: { id: string, name: string, details: string, latestHtmlFile: string, timestamp: string, html: string }[], errors: { id: string, error: string }[] }>}
 */
export async function getHtmlPagesBatch(ids) {
  return apiFetch(`${BASE}/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ ids }),
  });
}
