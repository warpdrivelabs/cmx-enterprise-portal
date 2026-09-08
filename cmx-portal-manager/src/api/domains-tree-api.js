/**
 * 域-应用-模块树统一接口（POST /api/domains/tree）。
 *
 * 取代三个分散接口（GET /api/domains、/api/activities?name=X、/api/menu-pages?menu=dam:X/Y）：
 *   - 一次 POST /api/domains/tree 返回三层树（域→应用→模块），前端 reduce 出所需视图。
 *   - 业务菜单仍走 GET /api/menu/tree（menu-cache.js，不变）。
 *
 * 缓存模型：
 *   - _tree：整棵树单例缓存（一次请求，所有调用方复用）。
 *   - _activitiesByDomain：Map<domainId, activities[]>，treeToActivities 按 domainId 派生并缓存，
 *     切域 A→B→A 不丢数据（区别于单变量缓存）。
 *   - findActivityIdByMenuPage / getCachedActivityEntry 遍历所有 domain 的 activities 查找，
 *     与旧 activities-api 的 _cachedEntries 等价。
 */
import { apiFetch } from 'cmx-ui5-runtime/api-client'
import { showCmxError } from 'cmx-data-comp/lib/cmx-toast.js'

/** @type {Promise<any[]>|null} */
let _treeInflight = null
/** @type {any[]|null} */
let _tree = null
/** @type {Map<string, any[]>} 映射：domainId → activities[] */
const _activitiesByDomain = new Map()

/**
 * 拆 ApiResp 信封并返回 data（TreeNode[]）。
 * 后端响应：ApiResp<Vec<TreeNode<DomainTreeNodeData>>>，data 即树节点数组。
 * @param {unknown} doc
 * @returns {any[]}
 */
function parseTree (doc) {
  // apiFetch 已拆过一层信封返回 data；data 是 { children, data } 形态的树根数组
  const arr = Array.isArray(doc) ? doc : (doc && Array.isArray(doc.children) ? [doc] : [])
  return arr
}

/**
 * 加载完整域-应用-模块树（单例缓存，重复调用复用）。
 * @returns {Promise<any[]>} TreeNode<DomainTreeNodeData>[]（已是父子嵌套结构）
 */
export async function ensureDomainTreeLoaded () {
  if (_tree !== null) return _tree
  if (_treeInflight) return _treeInflight
  _treeInflight = (async () => {
    try {
      const doc = await apiFetch('/api/domains/tree', { method: 'POST' })
      _tree = parseTree(doc)
    } catch (err) {
      // 失败**不缓存空树**：保持 _tree=null 让下次调用重试（旧实现缓存 [] 后永不重试，
      // 空域/空菜单被当成正常空态渲染）。返回 [] 兼容现有调用方（渲染空骨架）。
      showCmxError('域/应用骨架加载失败', err)
      return []
    } finally {
      _treeInflight = null
    }
    return _tree
  })()
  return _treeInflight
}

/**
 * 取已缓存的树（同步，未加载返回空数组）。
 * @returns {ReadonlyArray<any>}
 */
export function getCachedDomainTree () {
  return _tree ?? []
}

/**
 * 树 → domains 列表（替代旧 parseDomains）。
 * 注意：不再有 application 伪字段（旧 domain.application 是 .json 文件名，无意义）。
 * @param {any[]} tree
 * @returns {{ id: string, icon: string, label: string }[]}
 */
export function treeToDomains (tree) {
  if (!Array.isArray(tree)) return []
  return tree
    .filter((n) => n && n.data && n.data.level === 1)
    .map((n) => ({
      id: String(n.data.code || ''),
      icon: String(n.data.icon || 'folder'),
      label: String(n.data.name || n.data.title || n.data.code || ''),
    }))
}

/**
 * 树 → 某域的 activities 列表（替代旧 /api/activities?name=X）。
 * 从 level=2（应用）节点拼装，sideNav.menu 仍用 `dam:<domain>/<app>` 约定（兼容期）。
 * 结果按 domainId 缓存到 _activitiesByDomain，切域不丢。
 * @param {any[]} tree
 * @param {string} domainId
 * @returns {{ id: string, domain: string, icon: string, label: string, position: 'top', sideNav: { type: 'module', menu: string, title: string } }[]}
 */
export function treeToActivities (tree, domainId) {
  if (!Array.isArray(tree) || !domainId) return []
  // 命中缓存直接返回
  const cached = _activitiesByDomain.get(domainId)
  if (cached) return cached
  const domainNode = tree.find((n) => n && n.data && n.data.level === 1 && n.data.code === domainId)
  if (!domainNode) return []
  const apps = (domainNode.children || []).filter((n) => n && n.data && n.data.level === 2)
  const out = apps.map((app) => {
    const appCode = String(app.data.code || '')
    // 应用图标：优先 app.icon，否则取首个 module 的 icon，再否则 'application'
    let icon = String(app.data.icon || '')
    if (!icon) {
      const firstMod = (app.children || []).find((n) => n && n.data && n.data.level === 3)
      icon = String(firstMod?.data?.icon || 'application')
    }
    const label = String(app.data.name || app.data.title || appCode)
    return {
      id: appCode,
      domain: domainId,
      icon,
      label,
      position: 'top',
      sideNav: { type: 'module', menu: `dam:${domainId}/${appCode}`, title: label },
    }
  })
  _activitiesByDomain.set(domainId, out)
  return out
}

/**
 * 树 → 某应用的模块骨架（替代旧 /api/menu-pages?menu=dam:X/Y 的 modules）。
 * 从 level=3（模块）节点取，不含 theme/themeColor（已砍主题定制）。
 * @param {any[]} tree
 * @param {string} domainId
 * @param {string} applicationId
 * @returns {{ id: string, domain: string, application: string, module: string, title: string, icon: string }[]}
 */
export function treeToModules (tree, domainId, applicationId) {
  if (!Array.isArray(tree) || !domainId || !applicationId) return []
  const domainNode = tree.find((n) => n && n.data && n.data.level === 1 && n.data.code === domainId)
  if (!domainNode) return []
  const appNode = (domainNode.children || []).find(
    (n) => n && n.data && n.data.level === 2 && n.data.code === applicationId,
  )
  if (!appNode) return []
  return (appNode.children || [])
    .filter((n) => n && n.data && n.data.level === 3)
    .map((m) => ({
      id: String(m.data.module_code || m.data.code || ''),
      domain: String(m.data.domain_code || domainId),
      application: String(m.data.application_code || applicationId),
      module: String(m.data.module_code || m.data.code || ''),
      title: String(m.data.name || m.data.title || m.data.code || ''),
      icon: String(m.data.icon || 'folder'),
    }))
}

/**
 * 按 sideNav.menu 反查活动 id（替代旧 findActivityIdByMenuPage）。
 * 遍历所有已派生的 domain activities 查找（跨域）。
 * @param {string} menuKey 如 'dam:fi/cmxfico' 或 'setting-menu'
 * @returns {string|null}
 */
export function findActivityIdByMenuPage (menuKey) {
  const key = String(menuKey || '')
  if (!key) return null
  for (const activities of _activitiesByDomain.values()) {
    const hit = activities.find(
      (a) => (a.sideNav?.type === 'module' || a.sideNav?.type === 'menu-pages') && a.sideNav?.menu === key,
    )
    if (hit) return hit.id
  }
  return null
}

/**
 * 按活动 id 取条目（替代旧 getCachedActivityEntry）。
 * 遍历所有已派生的 domain activities 查找（跨域，id 是 application code）。
 * @param {string} id 活动 id（application code）
 * @returns {{ id: string, domain: string, icon: string, label: string, position: string, sideNav: object } | null}
 */
export function getCachedActivityEntry (id) {
  const sid = String(id ?? '').trim()
  if (!sid) return null
  for (const activities of _activitiesByDomain.values()) {
    const hit = activities.find((a) => a.id === sid)
    if (hit) return hit
  }
  return null
}

/**
 * 解析 dam: 菜单 key 为 { domainId, applicationId }。
 * @param {string} menuKey 如 'dam:fi/cmxfico' 或 'dam:fi/cmxfico/gl'
 * @returns {{ domainId: string, applicationId: string, moduleId?: string } | null}
 */
export function parseDamMenuKey (menuKey) {
  const s = String(menuKey || '').trim()
  if (!s.startsWith('dam:')) return null
  const parts = s.slice(4).split('/')
  if (parts.length < 2) return null
  const [domainId, applicationId, moduleId] = parts
  if (!domainId || !applicationId) return null
  return moduleId ? { domainId, applicationId, moduleId } : { domainId, applicationId }
}
