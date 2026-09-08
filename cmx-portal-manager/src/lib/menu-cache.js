import { showCmxToast } from 'cmx-data-comp/lib/cmx-toast.js'
import { apiFetch } from 'cmx-ui5-runtime/api-client'

/**
 * 全量菜单树缓存（单例）。
 *
 * 一次 `GET /api/menu/tree` 拉取，所有模块/路由复用，避免：
 *   - portal-side-nav-menu.js#fetchModuleMenuNodes 每个 module 调一次 /api/menu/tree?domain_code=...
 *   - portal-router.js 再调一次 /api/menu/tree（无 filter）
 *
 * 模块过滤改在前端做（filterRawTreeByModule）：按 domain_code/application_code/module_code
 * 过滤扁平列表，再用 parent_id 重建树。语义等价于后端 `/api/menu/tree?domain_code=X&...`。
 *
 * 内存模型：
 *   - _rawTree: TreeNode<MenuTreeNodeData>[]           原始树（保留所有字段）
 *   - _allExplorerNodes: ExplorerMenuNode[]             转换后的完整树
 *   - _flatByCode: Map<code, ExplorerMenuNode>          扁平索引（router 按 code 查找）
 *   - _moduleCache: Map<moduleKey, ExplorerMenuNode[]>  按 (domain|app|module) 缓存过滤结果
 *
 * 失败兜底：拉取失败时缓存空数组，下次调用不再重试（避免反复打挂掉的后端）。
 * 调用方拿到空数组时按"无菜单"处理。
 */

/**
 * 把 /api/menu/tree 返回的 TreeNode<MenuTreeNodeData>[] 转为 ExplorerMenuNode[]。
 * workspace/dialogspace 等富数据从节点 definition 取出；嵌入 _cmxId 供编辑弹框定位。
 *
 * **可见性过滤**：`data.visible === 0` 的节点整枝剪除（含子树），不出现在侧边菜单、
 * 也不进 router 的 code 索引（深链访问该 code → 404 占位页，语义等同"菜单已下架"）。
 * 这与"编辑器/管理工具"等非业务菜单走 code-path 直链、不经菜单树展示的场景不冲突——
 * 那类页面根本不在 cmx_menu 里，不受 visible 影响。
 *
 * 从 portal-side-nav-menu.js 迁移而来，作为单一来源供 side-nav 和 router 复用。
 * @param {any[]} treeNodes
 * @returns {any[]}
 */
export function treeNodesToExplorerNodes (treeNodes) {
  if (!Array.isArray(treeNodes)) return []
  const out = []
  for (const tn of treeNodes) {
    const d = (tn && tn.data) || {}
    // visible: 0 隐藏 / 1 显示（cmx_menu.visible，i32）。缺省按可见处理（兼容旧数据）。
    if (Number(d.visible) === 0) continue
    const def = (d.definition && typeof d.definition === 'object') ? d.definition : {}
    const node = {
      id: d.code,
      name: def.name || d.name,
      caption: def.caption != null ? def.caption : d.name,
      icon: d.icon || '',
      permissionId: d.fun_code || null,
      workspace: def.workspace || {},
      _cmxId: d.id,
      // DAM 维度（原始 cmx_menu 字段透传，供规则管理等需要按模块隔离的页面取用）
      domainCode: d.domain_code || '',
      applicationCode: d.application_code || '',
      moduleCode: d.module_code || '',
      children: treeNodesToExplorerNodes(tn.children || []),
    }
    if (def.dialogspace != null) node.dialogspace = def.dialogspace
    if (def.expanded != null) node.expanded = def.expanded
    if (def.type != null) node.type = def.type
    out.push(node)
  }
  return out
}

/**
 * 扁平化原始树。
 * @param {any[]} treeNodes
 * @returns {any[]}
 */
function flattenRawTree (treeNodes) {
  const out = []
  /** @param {any[]} nodes */
  const walk = (nodes) => {
    if (!Array.isArray(nodes)) return
    for (const tn of nodes) {
      out.push(tn)
      walk(tn?.children || [])
    }
  }
  walk(treeNodes)
  return out
}

/**
 * 用 parent_id 从扁平列表重建树。
 * 与后端 cmx_api_types::TreeNode::from_list 语义一致。
 * @param {any[]} list  扁平的 TreeNode[]（含 data.parent_id）
 * @returns {any[]}
 */
function buildRawTreeFromList (list) {
  /** @type {Map<unknown, any>} */
  const byId = new Map()
  for (const tn of list) {
    const id = tn?.data?.id
    if (id == null) continue
    byId.set(id, { ...tn, children: [] })
  }
  const roots = []
  for (const tn of list) {
    const id = tn?.data?.id
    if (id == null) continue
    const node = byId.get(id)
    const parentId = tn?.data?.parent_id
    const parent = parentId != null ? byId.get(parentId) : null
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  return roots
}

/**
 * 按域/应用/模块过滤原始树。
 * 语义等价于后端 `/api/menu/tree?domain_code=X&application_code=Y&module_code=Z`：
 * 先 WHERE 过滤扁平列表，再用 parent_id 重建树。
 * @param {any[]} treeNodes
 * @param {{ domain?: string, application?: string, module?: string }} mod
 * @returns {any[]}
 */
function filterRawTreeByModule (treeNodes, mod) {
  if (!Array.isArray(treeNodes)) return []
  const wantDomain = mod.domain != null && mod.domain !== ''
  const wantApp = mod.application != null && mod.application !== ''
  const wantModule = mod.module != null && mod.module !== ''
  if (!wantDomain && !wantApp && !wantModule) return treeNodes

  const flat = flattenRawTree(treeNodes)
  const filtered = flat.filter((tn) => {
    const d = (tn && tn.data) || {}
    if (wantDomain && d.domain_code !== mod.domain) return false
    if (wantApp && d.application_code !== mod.application) return false
    if (wantModule && d.module_code !== mod.module) return false
    return true
  })
  if (filtered.length === flat.length) return treeNodes
  return buildRawTreeFromList(filtered)
}

/**
 * 模块缓存 key。
 * @param {{ domain?: string, application?: string, module?: string }} mod
 * @returns {string}
 */
function moduleKey (mod) {
  return `${mod.domain || ''}|${mod.application || ''}|${mod.module || ''}`
}

class MenuCache {
  constructor () {
    /** @type {any[]|null} 原始树（含所有字段） */
    this._rawTree = null
    /** @type {any[]|null} 转换后的完整 ExplorerMenuNode[] */
    this._allExplorerNodes = null
    /** @type {Map<string, any>} code → ExplorerMenuNode 扁平索引（仅根级节点；children 嵌套结构） */
    this._flatByCode = new Map()
    /** @type {Map<string, any[]>} (domain|app|module) → ExplorerMenuNode[] 模块缓存 */
    this._moduleCache = new Map()
    /** @type {Promise<any[]>|null} 全量加载中 */
    this._loadPromise = null
    /** @type {boolean} 是否加载过（含失败） */
    this._loaded = false
  }

  /**
   * 拉取全量菜单树并构建索引（幂等，多次调用复用同一 Promise）。
   * 失败时返回空数组（调用方渲染空菜单），但**不置已加载标记**——下次调用会重试；
   * 并 toast 一条让失败可见（旧实现失败也标记已加载 + 缓存空数组 → 永不重试且无提示）。
   * @returns {Promise<any[]>} ExplorerMenuNode[]
   */
  async loadAll () {
    if (this._loaded) return this._allExplorerNodes || []
    if (!this._loadPromise) {
      this._loadPromise = (async () => {
        let ok = false
        try {
          const tree = await apiFetch('/api/menu/tree', { credentials: 'same-origin' })
          this._rawTree = Array.isArray(tree) ? tree : []
          this._allExplorerNodes = treeNodesToExplorerNodes(this._rawTree)
          this._buildFlatIndex(this._allExplorerNodes)
          ok = true
        } catch (err) {
          console.warn('[menu-cache] load failed:', err)
        } finally {
          if (ok) {
            this._loaded = true
          } else {
            this._rawTree = []
            this._allExplorerNodes = []
            showCmxToast('业务菜单加载失败，侧栏菜单可能为空（稍后将自动重试）', { level: 'error', title: '菜单加载' })
          }
          this._loadPromise = null
        }
      })()
    }
    await this._loadPromise
    return this._allExplorerNodes || []
  }

  /**
   * 取所有菜单（已转换为 ExplorerMenuNode[]）。若未加载则触发加载。
   * @returns {Promise<any[]>}
   */
  async getAll () {
    return this.loadAll()
  }

  /**
   * 按域/应用/模块取菜单树（已转换为 ExplorerMenuNode[]）。
   * 内部用缓存的原始树过滤，不再请求后端。
   * @param {{ domain?: string, application?: string, module?: string }} mod
   * @returns {Promise<any[]>}
   */
  async getModuleNodes (mod) {
    await this.loadAll()
    const key = moduleKey(mod)
    const cached = this._moduleCache.get(key)
    if (cached) return cached
    const filteredRaw = filterRawTreeByModule(this._rawTree || [], mod)
    const explorerNodes = treeNodesToExplorerNodes(filteredRaw)
    this._moduleCache.set(key, explorerNodes)
    return explorerNodes
  }

  /**
   * 按 code 查找菜单节点（router 用）。返回的是扁平索引中的节点（含 children）。
   * @param {string} code
   * @returns {Promise<any|null>}
   */
  async findByCode (code) {
    if (!code) return null
    if (!this._flatByCode.has(code)) await this.loadAll()
    return this._flatByCode.get(code) || null
  }

  /**
   * 构建扁平索引：code → ExplorerMenuNode（含 children 嵌套）。
   * 同一 code 多次出现只保留第一个。
   * @param {any[]} nodes
   */
  _buildFlatIndex (nodes) {
    /** @param {any[]} ns */
    const walk = (ns) => {
      if (!Array.isArray(ns)) return
      for (const n of ns) {
        if (n && n.id != null && !this._flatByCode.has(n.id)) {
          this._flatByCode.set(n.id, n)
        }
        if (n && Array.isArray(n.children)) walk(n.children)
      }
    }
    walk(nodes)
  }
}

/** @type {MenuCache|null} */
let _instance = null

/**
 * 获取菜单缓存单例。
 * @returns {MenuCache}
 */
export function getMenuCache () {
  if (!_instance) _instance = new MenuCache()
  return _instance
}
