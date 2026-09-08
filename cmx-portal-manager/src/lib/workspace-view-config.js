/**
 * 工作区视图配置：Typedef、配置规范化、视图 ID 工具函数。
 * 无本地依赖，可被所有 workspace-* 模块安全引用。
 */

/**
 * @typedef {{ id?: string, tabLabel?: string, type?: string, icon?: string, html_page?: string, htmlPageId?: string, data?: Record<string, unknown> }} WorkspaceViewSpec
 */

/**
 * 单个区域：单视图对象、多视图数组，或与 `content` 相同的 **`{ icon?: string, caption?: string, views: WorkspaceViewSpec[] }`** 包装（`views` 为数组来源；`caption` / `icon` 为区域级 UI 文案与图标）。**`prepare` 包装**还可选 **`width`**、**`height`**（CSS 尺寸字符串）供准备对话框使用。
 * @typedef {WorkspaceViewSpec | WorkspaceViewSpec[] | { icon?: string, caption?: string, views: WorkspaceViewSpec[], width?: string, height?: string, [key: string]: unknown } | null | undefined} WorkspaceRegionViewsInput
 */

/**
 * @typedef {{
 *   content?: WorkspaceRegionViewsInput,
 *   explorer?: WorkspaceRegionViewsInput,
 *   property?: WorkspaceRegionViewsInput,
 *   bottom?: WorkspaceRegionViewsInput,
 *   prepare?: WorkspaceRegionViewsInput,
 *   floatview?: WorkspaceRegionViewsInput,
 *   model?: WorkspaceRegionViewsInput,
 *   inner?: WorkspaceRegionViewsInput,
 *   embed?: WorkspaceRegionViewsInput,
 *   [key: string]: unknown
 * }} WorkspaceConfig
 *
 * `model`：永远不显示的数据/服务页面，CE 立即 hydrate 到隐藏容器 `#model-region-host`，仅作为 API 提供方。
 * `inner`：CE 立即 hydrate 到隐藏容器 `#inner-region-host`，用户脚本后续可按需把 host 元素挪到对话框显示，
 *         显示时机由用户决定。框架提供 `workspace.openInnerPageView(opts?)` / `closeInnerPageView()`：
 *         复用 dialogWorkspace 的对话框外壳，把 inner mount root 临时移入对话框；多视图时底部 Tab 切换。
 * `embed`：嵌入型页面，每个 view 独立 hydrate 到隐藏容器 `#embed-region-host`，由其它页面里的
 *         `<cmx-embed-page page="<viewId>">` 组件**借出**其根节点到自己 shadow 中展示。**独占借出**：同一 viewId
 *         同时只能被一个 cmx-embed-page 引用。
 */

/** @typedef {{ sideNav?: any, propertyPanel?: any, logPanel?: any }} WorkspaceShellContext */

/**
 * @typedef {{
 *   tabId: string,
 *   label: string,
 *   icon?: string,
 *   menu?: Record<string, unknown>|null,
 *   [key: string]: unknown
 * }} WorkspaceNodeMeta
 */

/** 参与收集 `html_pages` / 批量拉取的 workspace 区域键（含 `prepare`、`floatview` 与其别名 `float`、`model`、`inner`、`embed`）。 */
export const WORKSPACE_HTML_PAGE_REGION_KEYS = /** @type {const} */ ([
  'content',
  'explorer',
  'property',
  'bottom',
  'floatview',
  'float',
  'prepare',
  'model',
  'inner',
  'embed',
])

/**
 * @param {WorkspaceRegionViewsInput} raw
 * @returns {Record<string, unknown>|null} 若为 `{ views: WorkspaceViewSpec[] }` 包装则返回该对象，否则 `null`。
 */
export function workspaceRegionViewsWrapper (raw) {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = /** @type {Record<string, unknown>} */ (raw)
  return Array.isArray(o.views) ? o : null
}

/**
 * 将某区域的配置规范为视图数组（`null`/`undefined` → `[]`；单对象 → 单元素数组；
 * 若为 **`{ views: [...] }`** 则展开 `views`，与 `content` 等区域写法一致）。
 * @param {WorkspaceRegionViewsInput} raw
 * @returns {WorkspaceViewSpec[]}
 */
export function normalizeWorkspaceRegionViews (raw) {
  if (raw == null) return []
  if (Array.isArray(raw)) {
    return raw.filter((v) => v && typeof v === 'object').map((v) => /** @type {WorkspaceViewSpec} */ (v))
  }
  if (typeof raw === 'object') {
    const wrap = workspaceRegionViewsWrapper(raw)
    if (wrap) {
      return wrap.views.filter((v) => v && typeof v === 'object').map((v) => /** @type {WorkspaceViewSpec} */ (v))
    }
    return [/** @type {WorkspaceViewSpec} */ (raw)]
  }
  return []
}

/**
 * @param {WorkspaceViewSpec} spec
 * @returns {string}
 */
export function htmlPageIdFromViewSpec (spec) {
  if (!spec || typeof spec !== 'object') return ''
  const o = /** @type {Record<string, unknown>} */ (spec)
  if (o.html_page != null && String(o.html_page).trim()) return String(o.html_page).trim()
  if (o.htmlPageId != null && String(o.htmlPageId).trim()) return String(o.htmlPageId).trim()
  const d = o.data && typeof o.data === 'object' ? /** @type {Record<string, unknown>} */ (o.data) : null
  if (d && d.html_page != null && String(d.html_page).trim()) return String(d.html_page).trim()
  if (d && d.htmlPageId != null && String(d.htmlPageId).trim()) return String(d.htmlPageId).trim()
  return ''
}

/**
 * 收集 `workspace` 各区域中 `type` 为 `html_pages` 的视图所引用的页面 ID（去重）。
 * @param {WorkspaceConfig|null|undefined} workspace
 * @returns {string[]}
 */
export function collectHtmlPageIdsFromWorkspace (workspace) {
  if (!workspace || typeof workspace !== 'object') return []
  /** @type {Set<string>} */
  const ids = new Set()
  for (const key of WORKSPACE_HTML_PAGE_REGION_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(workspace, key)) continue
    const views = normalizeWorkspaceRegionViews(/** @type {WorkspaceRegionViewsInput} */ (workspace[key]))
    for (const v of views) {
      if (String(v.type || '').trim().toLowerCase() !== 'html_pages') continue
      const id = htmlPageIdFromViewSpec(v)
      if (id) ids.add(id)
    }
  }
  return [...ids]
}

/**
 * 视图 ID 解析：`spec.id` → `spec.html_page` → `<region>.<index>`；同 scope 重名追加 `#2/#3...`。
 * 由调用方维护 `taken` 集合（同一 scope 内累积）。
 *
 * @param {WorkspaceViewSpec} spec
 * @param {string} region
 * @param {number} index
 * @param {Set<string>} taken
 * @returns {string}
 */
export function resolveWorkspaceViewId (spec, region, index, taken) {
  const o = spec && typeof spec === 'object' ? /** @type {Record<string, unknown>} */ (spec) : {}
  const explicit = o.id != null ? String(o.id).trim() : ''
  const fromPage = o.html_page != null ? String(o.html_page).trim() : ''
  const base = explicit || fromPage || `${region}.${index}`
  if (!taken.has(base)) {
    taken.add(base)
    return base
  }
  console.warn(`[workspace] 视图 id 重名：${base}（追加序号）`)
  let n = 2
  while (taken.has(`${base}#${n}`)) n++
  const out = `${base}#${n}`
  taken.add(out)
  return out
}
