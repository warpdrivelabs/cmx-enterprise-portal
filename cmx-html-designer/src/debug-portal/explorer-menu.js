/**
 * 资源管理器侧栏菜单：从后端 JSON 构建，字段可扩展。
 * 默认由后端 `GET /api/menu-pages?menu=…` 提供（如 `explorer-menu`、`setting-menu`）。
 *
 * JSON 根可为数组，或 `{ "items": [ ... ] }`。
 * 每项建议包含：`id`, `name`, `caption`, `permissionId`（权限 id，空则不限）,
 * `children`（子菜单）; 可选 `icon`, `expanded`, `dirty`（为 true 时从菜单打开 Content 标签即带「已修改」角标）, `workspace`（见 `workspace-node.js` / `WorkspaceNode`）；
 * `workspace` 中 `content` / `explorer` / `property` / `bottom` 写法一致：可为**单个视图** `{ type, tabLabel?, icon?, data? }`，
 * **多视图数组**，或与 `content` 相同的 **`{ "caption"?: string, "icon"?: string, "views": [ ... ] }`**；`content` / `explorer` / `bottom` 在多于一个视图时底部 Tab 切换；**`property` 区即使仅一个视图也始终使用底部 Tab 条**（与 Explorer 工作区多签模式一致，由门户统一委托点击）。
 * 其余键原样保留在 `extras` 中供业务使用。
 *
 * 全局可设置 `window.__PORTAL_PERMISSION_IDS`：`Set<string>` 或 `string[]`，
 * 未设置或为 `null` 时不按权限过滤（开发态全显）。
 */

import { apiFetch } from 'cmx-ui5-runtime/api-client'

/** @typedef {{ id?: string, name?: string, caption?: string, permissionId?: string|null, icon?: string, expanded?: boolean, selected?: boolean, dirty?: boolean, children?: ExplorerMenuNode[], [key: string]: unknown }} ExplorerMenuNode */

/** @typedef {{ permissionIds: Set<string>|null }} ExplorerMenuContext */

const itemPayload = new WeakMap()

const KNOWN_KEYS = new Set(['id', 'name', 'caption', 'permissionId', 'icon', 'expanded', 'selected', 'children', 'workspace', 'dirty'])

/**
 * @returns {ExplorerMenuContext}
 */
export function getExplorerMenuPermissionContext() {
  const g = typeof globalThis !== 'undefined' ? globalThis : /** @type {any} */ ({})
  const raw = g.__PORTAL_PERMISSION_IDS
  if (raw == null) return { permissionIds: null }
  if (raw instanceof Set) return { permissionIds: raw }
  if (Array.isArray(raw)) return { permissionIds: new Set(raw.map(String)) }
  return { permissionIds: null }
}

/**
 * @param {string|null|undefined} permissionId
 * @param {ExplorerMenuContext} ctx
 */
export function explorerMenuItemPermitted(permissionId, ctx) {
  if (permissionId == null || permissionId === '') return true
  const ids = ctx.permissionIds
  if (ids == null) return true
  return ids.has(String(permissionId))
}

/**
 * @param {ExplorerMenuNode} node
 */
function extrasOf(node) {
  /** @type {Record<string, unknown>} */
  const out = {}
  for (const k of Object.keys(node)) {
    if (!KNOWN_KEYS.has(k)) out[k] = node[k]
  }
  return out
}

/**
 * @param {ExplorerMenuNode} node
 */
function captionOf(node) {
  const c = node.caption
  if (c != null && String(c) !== '') return String(c)
  if (node.name != null && String(node.name) !== '') return String(node.name)
  return node.id != null ? String(node.id) : ''
}

/**
 * 与 {@link filterExplorerMenuBySearchText} 的「节点自身命中」规则一致：caption / id / name 子串、不区分大小写。
 * @param {ExplorerMenuNode} node
 * @param {string|null|undefined} queryRaw
 */
export function explorerMenuNodeMatchesSearchQuery (node, queryRaw) {
  const q = String(queryRaw ?? '').trim().toLowerCase()
  if (!q) return false
  const haystack = [captionOf(node), node.id != null ? String(node.id) : '', node.name != null ? String(node.name) : '']
    .join('\u0000')
    .toLowerCase()
  return haystack.includes(q)
}

/**
 * @param {ExplorerMenuNode[]} nodes
 * @param {ExplorerMenuContext} ctx
 * @returns {ExplorerMenuNode[]}
 */
export function filterExplorerMenuTree(nodes, ctx) {
  if (!Array.isArray(nodes)) return []
  const out = []
  for (const n of nodes) {
    if (!explorerMenuItemPermitted(n.permissionId, ctx)) continue
    const rawChildren = n.children
    const children = rawChildren && rawChildren.length ? filterExplorerMenuTree(rawChildren, ctx) : []
    if (rawChildren && rawChildren.length && children.length === 0) continue
    out.push({ ...n, children })
  }
  return out
}

/**
 * 按展示文案 / id / name 子串过滤菜单树（不区分大小写）。
 * - 节点自身匹配：保留该节点及其原有子树（便于在命中分组下浏览）。
 * - 自身不匹配：仅保留递归后仍有命中的子分支。
 * @param {ExplorerMenuNode[]} nodes 已通过权限等过滤后的树
 * @param {string} query
 * @returns {ExplorerMenuNode[]}
 */
export function filterExplorerMenuBySearchText (nodes, query) {
  if (!Array.isArray(nodes)) return []
  const q = String(query ?? '').trim().toLowerCase()
  if (!q) return nodes

  /** @param {ExplorerMenuNode} n */
  function selfMatches (n) {
    return explorerMenuNodeMatchesSearchQuery(n, query)
  }

  /** @param {ExplorerMenuNode[]} list */
  function walk (list) {
    /** @type {ExplorerMenuNode[]} */
    const out = []
    for (const n of list) {
      const hasKids = Array.isArray(n.children) && n.children.length > 0
      const filteredKids = hasKids ? walk(n.children) : []
      if (selfMatches(n)) {
        out.push(hasKids ? { ...n, children: n.children } : { ...n })
      } else if (filteredKids.length) {
        out.push({ ...n, children: filteredKids })
      }
    }
    return out
  }

  return walk(nodes)
}

/**
 * @param {unknown} json
 * @returns {ExplorerMenuNode[]}
 */
export function parseExplorerMenuResponse(json) {
  if (Array.isArray(json)) return /** @type {ExplorerMenuNode[]} */ (json)
  if (json && typeof json === 'object' && Array.isArray(/** @type {{ items?: unknown }} */ (json).items)) {
    return /** @type {ExplorerMenuNode[]} */ (/** @type {{ items: ExplorerMenuNode[] }} */ (json).items)
  }
  throw new Error('Invalid explorer menu JSON: expected a top-level array or { "items": [...] }')
}

/**
 * @param {string} url
 * @returns {Promise<ExplorerMenuNode[]>}
 */
export async function fetchExplorerMenu(url) {
  const json = await apiFetch(url, { credentials: 'same-origin' })
  return parseExplorerMenuResponse(json)
}

/**
 * @param {HTMLElement} el
 * @param {ExplorerMenuNode} node
 */
function applyMenuDataset(el, node) {
  if (node.id != null) el.dataset.menuId = String(node.id)
  if (node.name != null) el.dataset.menuName = String(node.name)
  if (node.permissionId != null) el.dataset.permissionId = String(node.permissionId)
  const ex = extrasOf(node)
  if (Object.keys(ex).length) {
    try {
      el.dataset.menuExtras = JSON.stringify(ex)
    } catch {
      /* ignore */
    }
  }
  itemPayload.set(el, node)
}

/**
 * @param {HTMLElement} el
 * @param {ExplorerMenuNode} node
 * @param {string} highlightQueryRaw
 */
function applyMenuSearchHitUi (el, node, highlightQueryRaw) {
  if (explorerMenuNodeMatchesSearchQuery(node, highlightQueryRaw)) el.dataset.cmxMenuSearchHit = '1'
  else delete el.dataset.cmxMenuSearchHit
}

/**
 * @param {HTMLElement} parentItem
 * @param {ExplorerMenuNode} node
 * @param {string} highlightQueryRaw
 */
function appendUnderItem (parentItem, node, highlightQueryRaw) {
  const kids = node.children
  if (kids && kids.length) {
    const nested = document.createElement('ui5-side-navigation-item')
    nested.text = captionOf(node)
    if (node.icon) nested.icon = String(node.icon)
    if (node.expanded != null) nested.expanded = !!node.expanded
    if (node.selected) nested.selected = true
    applyMenuDataset(nested, node)
    applyMenuSearchHitUi(nested, node, highlightQueryRaw)
    for (const c of kids) {
      appendUnderItem(nested, c, highlightQueryRaw)
    }
    parentItem.appendChild(nested)
    return
  }
  const sub = document.createElement('ui5-side-navigation-sub-item')
  sub.text = captionOf(node)
  if (node.icon) sub.icon = String(node.icon)
  if (node.selected) sub.selected = true
  applyMenuDataset(sub, node)
  applyMenuSearchHitUi(sub, node, highlightQueryRaw)
  parentItem.appendChild(sub)
}

/**
 * @typedef {{ highlightQuery?: string }} ExplorerSideNavBuildOptions
 * @param {HTMLElement} sideNav
 * @param {ExplorerMenuNode[]} nodes
 * @param {ExplorerSideNavBuildOptions|undefined} options
 */
export function buildExplorerSideNavigation (sideNav, nodes, options) {
  const highlightQueryRaw = options?.highlightQuery != null ? String(options.highlightQuery) : ''
  sideNav.replaceChildren()
  for (const n of nodes) {
    const item = document.createElement('ui5-side-navigation-item')
    item.text = captionOf(n)
    if (n.icon) item.icon = String(n.icon)
    if (n.expanded != null) item.expanded = !!n.expanded
    if (n.selected) item.selected = true
    applyMenuDataset(item, n)
    applyMenuSearchHitUi(item, n, highlightQueryRaw)
    const kids = n.children
    if (kids && kids.length) {
      for (const c of kids) {
        appendUnderItem(item, c, highlightQueryRaw)
      }
    }
    sideNav.appendChild(item)
  }
}

/**
 * @param {EventTarget|null} item
 * @returns {ExplorerMenuNode|null}
 */
export function getExplorerMenuPayloadForItem(item) {
  if (!(item instanceof HTMLElement)) return null
  return itemPayload.get(item) ?? null
}

/**
 * @param {ExplorerMenuNode} node
 */
export function explorerMenuNodeSummary(node) {
  const rawIcon = node.icon
  const icon =
    rawIcon != null && String(rawIcon).trim() !== '' ? String(rawIcon).trim() : null
  const ws = /** @type {{ workspace?: unknown }} */ (node).workspace
  /** @type {Record<string, unknown>} */
  const out = {
    id: node.id,
    name: node.name,
    caption: captionOf(node),
    permissionId: node.permissionId ?? null,
    icon,
    workspace: ws != null && typeof ws === 'object' ? /** @type {Record<string, unknown>} */ ({ .../** @type {object} */ (ws) }) : undefined,
    extras: extrasOf(node),
  }
  if (Object.prototype.hasOwnProperty.call(node, 'dirty')) {
    out.dirty = !!node.dirty
  }
  return out
}
