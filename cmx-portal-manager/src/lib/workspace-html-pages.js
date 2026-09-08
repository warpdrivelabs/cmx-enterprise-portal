/**
 * HTML 页加载层：CE 注册检测、Batch API、html_pages 视图渲染器注册。
 *
 * 复用策略：以 customElements 注册状态为唯一判断依据。
 *   - CE 未注册 → 从服务端拉取完整 HTML，生成 runnableDoc 注入，CE 随之被注册
 *   - CE 已注册 → 直接实例化 CE 元素插入 run-slot，无需任何网络请求或 HTML 解析
 *                  CE 的 connectedCallback 中 _resolveTpl() 使用闭包缓存的 _tpl 引用，
 *                  即使 template 已从 DOM detach，cloneNode 仍可工作
 */
import { apiPost } from 'cmx-ui5-runtime/api-client'
import { cmxHtmlPagesElementLocalName } from '@cmx-html-designer/src/utils/html-utils.js'
import { enrichBatchHtmlPagesWithPreviewFields } from './workspace-html-page-preview.js'
import { escAttr as escHtml } from './escape.js'
import { deletePage, getPages, putPages, requestPersistentStorage } from './page-cache.js'
import {
  collectHtmlPageIdsFromWorkspace,
  htmlPageIdFromViewSpec,
  workspaceRegionViewsWrapper,
  WORKSPACE_HTML_PAGE_REGION_KEYS,
} from './workspace-view-config.js'
import { registerWorkspaceViewType } from './workspace-view-renderer.js'

// 启动即请求持久化存储（best-effort，防浏览器低压淘汰页面缓存）。幂等。
if (typeof navigator !== 'undefined') {
  requestPersistentStorage().catch(() => {})
}

/**
 * 与 CMXHTMLDesigner `wrapHtmlDocument` 一致：页面对应宿主标签名 `cmx-html-pages-<slug>`。
 * @param {string} pageId
 * @returns {boolean} 是否已在当前文档注册
 */
export function isHtmlPageRuntimeCustomElementDefined (pageId) {
  const tag = cmxHtmlPagesElementLocalName(pageId)
  return typeof customElements !== 'undefined' && !!customElements.get(tag)
}

// ---------------------------------------------------------------------------
// Batch 响应合并
// ---------------------------------------------------------------------------

/**
 * @param {import('./workspace-view-config.js').WorkspaceRegionViewsInput|null|undefined} raw
 * @param {Map<string, object>} byId
 * @param {Map<string, string>} errById
 */
function applyHtmlPagesToRegionInput (raw, byId, errById) {
  if (raw == null) return
  if (Array.isArray(raw)) {
    for (const v of raw) mergeHtmlPageIntoViewSpec(/** @type {import('./workspace-view-config.js').WorkspaceViewSpec} */ (v), byId, errById)
    return
  }
  if (typeof raw === 'object') {
    const wrap = workspaceRegionViewsWrapper(/** @type {import('./workspace-view-config.js').WorkspaceRegionViewsInput} */ (raw))
    if (wrap) {
      for (const v of wrap.views) mergeHtmlPageIntoViewSpec(v, byId, errById)
      return
    }
    mergeHtmlPageIntoViewSpec(/** @type {import('./workspace-view-config.js').WorkspaceViewSpec} */ (raw), byId, errById)
  }
}

/**
 * @param {import('./workspace-view-config.js').WorkspaceViewSpec} spec
 * @param {Map<string, object>} byId
 * @param {Map<string, string>} errById
 */
function mergeHtmlPageIntoViewSpec (spec, byId, errById) {
  if (!spec || typeof spec !== 'object') return
  if (String(spec.type || '').trim().toLowerCase() !== 'html_pages') return
  const id = htmlPageIdFromViewSpec(spec)
  if (!id) return
  const o = /** @type {Record<string, unknown>} */ (spec)
  const prev = o.data && typeof o.data === 'object' ? { .../** @type {object} */ (o.data) } : {}
  delete prev.htmlPage
  delete prev.htmlPageLoadError
  delete prev.htmlPageId
  delete prev.htmlPageRunnableDoc
  delete prev.htmlPagePreviewStructure
  delete prev.htmlPageExecutableScripts
  delete prev.htmlPagePreviewError
  const page = byId.get(id)
  const err = errById.get(id)
  if (page && typeof page === 'object') {
    prev.htmlPage = page
    prev.htmlPageId = /** @type {{ id?: string }} */ (page).id != null ? String(/** @type {{ id?: string }} */ (page).id) : id
    const pr = /** @type {Record<string, unknown>} */ (page)
    if (pr.htmlPageRunnableDoc != null) prev.htmlPageRunnableDoc = pr.htmlPageRunnableDoc
    if (pr.htmlPagePreviewStructure != null) prev.htmlPagePreviewStructure = pr.htmlPagePreviewStructure
    if (Array.isArray(pr.htmlPageExecutableScripts)) prev.htmlPageExecutableScripts = pr.htmlPageExecutableScripts
    if (pr.htmlPagePreviewError != null) prev.htmlPagePreviewError = pr.htmlPagePreviewError
  } else {
    prev.htmlPageLoadError = err || '页面未返回或不存在'
    prev.htmlPageId = id
  }
  o.data = prev
}

/**
 * 将 `POST /api/html-pages/batch` 的响应合并进 `workspace` 各 `html_pages` 视图的 `data`（原地修改）。
 * @param {import('./workspace-view-config.js').WorkspaceConfig} workspace
 * @param {{ pages?: unknown[], errors?: { id?: string, error?: string }[] }} batch
 */
export function applyHtmlPagesBatchToWorkspace (workspace, batch) {
  const pages = Array.isArray(batch?.pages) ? batch.pages : []
  const errors = Array.isArray(batch?.errors) ? batch.errors : []
  /** @type {Map<string, object>} */
  const byId = new Map()
  for (const p of pages) {
    if (p && typeof p === 'object' && /** @type {{ id?: unknown }} */ (p).id != null) {
      byId.set(String(/** @type {{ id?: unknown }} */ (p).id).trim(), /** @type {object} */ (p))
    }
  }
  /** @type {Map<string, string>} */
  const errById = new Map()
  for (const e of errors) {
    if (e && typeof e === 'object' && e.id != null) {
      errById.set(String(e.id).trim(), e.error != null ? String(e.error) : '')
    }
  }
  for (const key of WORKSPACE_HTML_PAGE_REGION_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(workspace, key)) continue
    applyHtmlPagesToRegionInput(/** @type {import('./workspace-view-config.js').WorkspaceRegionViewsInput} */ (workspace[key]), byId, errById)
  }
}

/**
 * batch 请求**整体失败**（HTTP 层挂掉，连 per-id errors 都拿不到）时，给 workspace 内所有
 * html_pages 视图写入 htmlPageLoadError——open_view 渲染红字错误占位，替代灰字「未加载（id）」
 * （旧表现让用户误以为页面没配置，而非加载报错）。已有成功数据的视图不覆盖。
 * @param {import('./workspace-view-config.js').WorkspaceConfig} workspace
 * @param {string} message 错误文案
 */
export function markWorkspaceHtmlPagesLoadError (workspace, message) {
  const msg = String(message || '页面批量加载失败')
  if (!workspace || typeof workspace !== 'object') return
  for (const key of WORKSPACE_HTML_PAGE_REGION_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(workspace, key)) continue
    const raw = /** @type {unknown} */ (workspace[key])
    const specs = []
    if (Array.isArray(raw)) specs.push(...raw)
    else if (raw && typeof raw === 'object') {
      const wrap = workspaceRegionViewsWrapper(/** @type {import('./workspace-view-config.js').WorkspaceRegionViewsInput} */ (raw))
      if (wrap) specs.push(...wrap.views)
      else specs.push(/** @type {import('./workspace-view-config.js').WorkspaceViewSpec} */ (raw))
    }
    for (const spec of specs) {
      if (!spec || typeof spec !== 'object') continue
      if (String(/** @type {{ type?: unknown }} */ (spec).type || '').trim().toLowerCase() !== 'html_pages') continue
      const o = /** @type {Record<string, unknown>} */ (spec)
      const prev = o.data && typeof o.data === 'object' ? { .../** @type {object} */ (o.data) } : {}
      if (prev.htmlPage) continue // 已有成功数据的不覆盖
      prev.htmlPageLoadError = msg
      prev.htmlPageId = htmlPageIdFromViewSpec(/** @type {import('./workspace-view-config.js').WorkspaceViewSpec} */ (spec)) || prev.htmlPageId
      o.data = prev
    }
  }
}

// ---------------------------------------------------------------------------
// Batch API
// ---------------------------------------------------------------------------

/**
 * 批量按 ID 从门户同源接口拉取 HTML 页完整定义，支持 `clientRevs` 差异同步。
 *
 * 差异同步（详见方案 2.3）：发请求前从 IndexedDB 读 `{id→rev}` 拼成 `clientRevs` 一并发送；
 * 服务端仅对 `clientRevs[id] !== 索引行 rev` 的 page 返回 body，命中的只出现在 `revs` 清单。
 * 响应里变化的 page（出现在 `pages` 数组）写回 IndexedDB，并用 `revs` 刷新本地 rev 表。
 *
 * @param {string[]} ids
 * @param {{ baseUrl?: string, clientRevs?: Record<string, string> }} [options]
 *   `clientRevs` 显式传入时跳过 IndexedDB 读取（用于强制版本场景）。
 * @returns {Promise<{ pages: object[], revs: Record<string, string>, errors: { id: string, error: string }[] }>}
 */
export async function fetchHtmlPagesByIdsBatch (ids, options = {}) {
  const list = [...new Set((ids || []).map((x) => String(x ?? '').trim()).filter(Boolean))]
  if (!list.length) return { pages: [], revs: {}, errors: [] }
  const base = options.baseUrl != null ? String(options.baseUrl) : ''

  // 拼 clientRevs：显式传入优先，否则从 IndexedDB 读 {id→rev}。
  /** @type {Record<string, string>} */
  let clientRevs = options.clientRevs && typeof options.clientRevs === 'object' ? options.clientRevs : null
  if (!clientRevs) {
    try {
      const cached = await getPages(list)
      clientRevs = {}
      for (const [id, rec] of cached) {
        if (rec && rec.rev) clientRevs[id] = rec.rev
      }
    } catch {
      clientRevs = {}
    }
  }

  let urlStr = ''
  try {
    const u = new URL('/api/html-pages/batch', base || (typeof window !== 'undefined' ? window.location.href : 'http://localhost'))
    urlStr = u.toString()
  } catch {
    urlStr = '/api/html-pages/batch'
  }
  const body = { ids: list }
  // 仅当存在 clientRevs 时携带（缺省则服务端走全量，向后兼容）。
  if (clientRevs && Object.keys(clientRevs).length) body.clientRevs = clientRevs
  // apiPost 拆 ApiResp 信封；HTTP/业务失败抛错（文案取 msg/error）。
  const json = await apiPost(urlStr, body)
  const pages = Array.isArray(json?.pages) ? json.pages : []
  const errors = Array.isArray(json?.errors) ? json.errors : []
  const revs = json?.revs && typeof json.revs === 'object' ? json.revs : {}

  // 变化的 page（服务端返回了 body）写回 IndexedDB，供下次 diff 命中。
  // rev 字段取服务端 revs 清单（权威），page 自身 rev 作回退。
  // 同时保留 domain/app/module/doc 坐标——差异同步命中缓存时需原样恢复，供 enrich 注入 host.$coord。
  try {
    await putPages(pages.map((p) => {
      const pp = /** @type {Record<string, unknown>} */ (p)
      return {
        id: String(/** @type {{ id?: unknown }} */ (p).id || ''),
        rev: String(revs[/** @type {{ id?: unknown }} */ (p).id] || /** @type {{ rev?: unknown }} */ (p).rev || ''),
        source: String(/** @type {{ html?: unknown }} */ (p).html || ''),
        domain: pp.domain != null ? String(pp.domain) : '',
        app: pp.app != null ? String(pp.app) : '',
        module: pp.module != null ? String(pp.module) : '',
        doc: pp.doc != null ? String(pp.doc) : '',
      }
    }).filter((e) => e.id && e.source))
  } catch { /* 缓存写入失败不影响主流程 */ }

  // 差异同步兜底：diff 命中的 page（clientRevs 相等）服务端省略了 body，pages 数组里没有。
  // 但下游 applyHtmlPagesBatchToWorkspace 期望每个视图的 page 都在 pages 里，否则报
  // "页面未返回或不存在"。故对命中的 page 从 IndexedDB 取 source 补全进 pages。
  if (clientRevs && Object.keys(clientRevs).length) {
    const returnedIds = new Set(pages.map((p) => String(/** @type {{ id?: unknown }} */ (p).id || '')))
    const missingIds = list.filter((id) =>
      !returnedIds.has(id) && clientRevs[id] && revs[id] === clientRevs[id],
    )
    if (missingIds.length) {
      try {
        const cached = await getPages(missingIds)
        for (const id of missingIds) {
          const rec = cached.get(id)
          if (rec && rec.source) {
            // 从缓存恢复完整 page 对象（含坐标），与 batch 返回的结构一致，
            // 使下游 enrich 能正确注入 host.$coord。
            pages.push({
              id,
              html: rec.source,
              rev: rec.rev,
              domain: rec.domain || '',
              app: rec.app || '',
              module: rec.module || '',
              doc: rec.doc || '',
            })
          }
        }
      } catch { /* IndexedDB 读取失败：缺失的 page 会被下游当未返回处理 */ }
    }
  }

  return { pages, revs, errors }
}

// ---------------------------------------------------------------------------
// html_pages 视图渲染器
// ---------------------------------------------------------------------------

let _htmlPagesWorkspaceViewRegistered = false

/**
 * 注册 `html_pages` 视图渲染器（幂等，多次调用安全）。
 */
export function registerHtmlPagesWorkspaceViewType () {
  if (_htmlPagesWorkspaceViewRegistered) return
  _htmlPagesWorkspaceViewRegistered = true
  registerWorkspaceViewType('html_pages', renderHtmlPagesWorkspaceView)
}

/**
 * @param {string} region
 * @param {import('./workspace-view-config.js').WorkspaceViewSpec} spec
 */
function renderHtmlPagesWorkspaceView (region, spec) {
  const o = spec && typeof spec === 'object' ? /** @type {Record<string, unknown>} */ (spec) : {}
  const d = o.data && typeof o.data === 'object' ? /** @type {Record<string, unknown>} */ (o.data) : {}
  const page = d.htmlPage && typeof d.htmlPage === 'object' ? /** @type {Record<string, unknown>} */ (d.htmlPage) : null
  const loadErr = d.htmlPageLoadError != null ? String(d.htmlPageLoadError) : ''
  const pid = htmlPageIdFromViewSpec(/** @type {import('./workspace-view-config.js').WorkspaceViewSpec} */ (spec)) || (d.htmlPageId != null ? String(d.htmlPageId) : '')

  /* 静态 props（菜单 view 配置）：序列化到 shell div 的 data-cmx-page-props，
     供 hydrate 注入 CE 宿主后回读挂到 host.props（与 native_pages 的 props attribute 机制对齐）。 */
  const propsObj = o.props && typeof o.props === 'object' ? /** @type {Record<string, unknown>} */ (o.props) : null
  const propsAttr = propsObj ? ` data-cmx-page-props="${escHtml(JSON.stringify(propsObj))}"` : ''

  const shell = (inner) =>
    `<div class="cmx-html-pages-view" data-cmx-html-page-id="${escHtml(pid)}"${propsAttr} style="display:flex;flex-direction:column;flex:1 1 auto;align-self:stretch;width:100%;min-height:0;min-width:0;height:100%;max-height:100%;box-sizing:border-box;overflow:hidden;background:var(--sapBackgroundColor,#fff)">${inner}</div>`

  if (loadErr) {
    return shell(`<div style="padding:10px;font-size:12px;color:var(--sapNegativeTextColor, #bb0000)">${escHtml(loadErr)}</div>`)
  }
  if (!page) {
    return shell(
      `<div style="padding:10px;font-size:12px;color:var(--sapContent_LabelColor,#6a6d70)">未加载${pid ? `（${escHtml(pid)}）` : ''}</div>`,
    )
  }

  const runnable = d.htmlPageRunnableDoc != null ? String(d.htmlPageRunnableDoc)
    : (page.htmlPageRunnableDoc != null ? String(page.htmlPageRunnableDoc) : '')
  const previewErr = d.htmlPagePreviewError != null ? String(d.htmlPagePreviewError)
    : (page.htmlPagePreviewError != null ? String(page.htmlPagePreviewError) : '')

  const MAX_RUN_DOC = 1_100_000
  if (previewErr) {
    return shell(`<div style="padding:10px;font-size:12px;color:var(--sapNegativeTextColor, #bb0000)">${escHtml(previewErr)}</div>`)
  }
  if (!runnable) {
    return shell(
      `<div style="padding:10px;font-size:12px;color:var(--sapContent_LabelColor,#6a6d70)">无可运行文档</div>`,
    )
  }
  if (runnable.length > MAX_RUN_DOC) {
    return shell(
      `<div style="padding:10px;font-size:12px;color:var(--sapContent_LabelColor,#6a6d70)">页面过大（${runnable.length} 字符），无法在此嵌入</div>`,
    )
  }

  return shell(
    `<div class="cmx-html-pages-run-slot" data-cmx-html-pages-run-slot style="flex:1 1 auto;min-height:0;min-width:0;width:100%;display:flex;flex-direction:column;overflow:auto;align-self:stretch;opacity:0;transition:opacity 140ms ease"></div><textarea hidden readonly tabindex="-1" aria-hidden="true" class="cmx-html-pages-runnable-store" data-cmx-html-pages-payload>${escHtml(runnable)}</textarea>`,
  )
}

// ---------------------------------------------------------------------------
// Prepare（CE检测 → 按需拉取 → 写回 workspace）
// ---------------------------------------------------------------------------

/**
 * 收集 ID → 检测 CE 注册状态 → 仅拉取未注册页面 → enrich → 存储 structureHtml → 写回 workspace。
 * CE 已注册的页面直接从 structureHtml 存储重建最小 runnableDoc，无需网络请求。
 * @param {import('./workspace-view-config.js').WorkspaceConfig} workspace
 * @param {{ baseUrl?: string, setLoading?: (active: boolean) => void, bustCache?: boolean }} [options]
 *   `bustCache: true` 时跳过 CE 注册检测，对所有 ID 强制走 batch 拉取（用于"刷新"语义），
 *   拿到最新 server 内容并写回 `spec.data.htmlPageRunnableDoc`。
 * @returns {Promise<{ ids: string[], pages: object[], errors: { id: string, error: string }[], skippedIds: string[] }>}
 */
export async function prepareWorkspaceHtmlPages (workspace, options = {}) {
  registerHtmlPagesWorkspaceViewType()
  const setLoading = typeof options.setLoading === 'function' ? options.setLoading : undefined
  const bustCache = !!options.bustCache
  if (!workspace || typeof workspace !== 'object') {
    return { ids: [], pages: [], errors: [], skippedIds: [] }
  }
  const ids = collectHtmlPageIdsFromWorkspace(workspace)
  if (!ids.length) {
    return { ids: [], pages: [], errors: [], skippedIds: [] }
  }

  /** @type {string[]} */
  const skippedIds = []
  /** @type {object[]} */
  const reusedPages = []
  /** @type {string[]} */
  const idsToFetch = []

  for (const id of ids) {
    if (!bustCache && isHtmlPageRuntimeCustomElementDefined(id)) {
      // CE 已注册：_tpl 闭包已缓存 template 引用，直接注入 CE 宿主元素即可
      // 生成仅含 CE 标签的最小文档，hydrateHtmlPagesWorkspaceViewsInRoot 会解析并 appendChild
      const tag = cmxHtmlPagesElementLocalName(id)
      const minDoc = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body><${tag} data-cmx-html-page-host=""></${tag}></body></html>`
      skippedIds.push(id)
      reusedPages.push({ id, htmlPageRunnableDoc: minDoc })
    } else {
      idsToFetch.push(id)
    }
  }

  const willNetwork = idsToFetch.length > 0
  if (willNetwork) setLoading?.(true)
  try {
    let pages = [...reusedPages]
    let errors = /** @type {{ id: string, error: string }[]} */ ([])
    if (idsToFetch.length) {
      // bustCache：强制取最新版本——不携带 clientRevs（让服务端全量返回），
      // 并清掉 IndexedDB 中这些 id 的旧缓存，避免残留旧 rev 干扰下次 diff。
      const fetchOpts = { ...options }
      if (bustCache) {
        fetchOpts.clientRevs = {}
        // 清缓存 fire-and-forget，不阻塞刷新
        Promise.all(idsToFetch.map((id) => deletePage(id).catch(() => {}))).catch(() => {})
      }
      const batch = await fetchHtmlPagesByIdsBatch(idsToFetch, fetchOpts)
      enrichBatchHtmlPagesWithPreviewFields(batch.pages)
      // enrich 后直接使用，无需额外存储
      pages = [...reusedPages, ...batch.pages]
      errors = batch.errors
    }
    applyHtmlPagesBatchToWorkspace(workspace, { pages, errors })
    return { ids, pages, errors, skippedIds }
  } finally {
    if (willNetwork) setLoading?.(false)
  }
}

/**
 * 先 {@link prepareWorkspaceHtmlPages} 再 `node.open_view`。
 * @param {{ workspace: import('./workspace-view-config.js').WorkspaceConfig, open_view: (ctx: Record<string, unknown>, extras?: { initialContext?: Record<string, unknown> }) => void }} node
 * @param {{ contentArea: { addTab: (o: Record<string, unknown>) => unknown }, sideNav: unknown, propertyPanel: unknown, logPanel: unknown }} ctx
 * @param {{ baseUrl?: string, setLoading?: (active: boolean) => void, extras?: { initialContext?: Record<string, unknown> } }} [options]
 *   `extras.initialContext`：开新 tab 时注入 workspace.context 的初始键值（动态跳转传参）。
 */
export async function openWorkspaceNodeWithHydratedHtmlPages (node, ctx, options = {}) {
  await prepareWorkspaceHtmlPages(node.workspace, options)
  node.open_view(ctx, options.extras)
}
