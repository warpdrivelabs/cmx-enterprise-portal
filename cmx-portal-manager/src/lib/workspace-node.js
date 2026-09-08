/**
 * 工作区节点主控：WorkspaceNode 类、Shell 快照/应用，以及所有子模块 re-export（零破坏性变更）。
 */
import {
  applyDockLayoutToWorkspace,
  deriveWorkspaceLayoutId,
  readDockLayout,
} from './workspace-dock-layout.js'
import { deepClone } from 'cmx-data-comp/lib/cmx-deep-clone.js'
import { renderWorkspaceRegionViewsHtml } from './workspace-view-renderer.js'
import { workspaceContentTabText, workspaceContentTabIcon } from './workspace-tab-label.js'
import { portalDisplayText } from './display-text.js'

export { hydrateHtmlPagesWorkspaceViewsInRoot } from './workspace-html-page-preview.js'

export * from './workspace-view-config.js'
export * from './workspace-view-renderer.js'
export * from './workspace-tab-label.js'
export * from './workspace-html-pages.js'
export * from './workspace-native-pages.js'

// ---------------------------------------------------------------------------
// Shell 快照 / 应用
// ---------------------------------------------------------------------------

/**
 * 从完整 `workspace` 中抽出仅影响侧栏 / 属性 / 底部 / 浮动窗口的快照（供 Content 标签绑定）。
 * 浮动窗口区域同时接受 `floatview`（规范名）与 `float`（菜单 JSON 别名），统一规范化到 `floatview`。
 * @param {import('./workspace-view-config.js').WorkspaceConfig|null|undefined} ws
 * @returns {Record<string, unknown>|undefined}
 */
export function workspaceShellSnapshot (ws) {
  if (!ws || typeof ws !== 'object') return undefined
  /** @type {Record<string, unknown>} */
  const out = {}
  for (const k of ['explorer', 'property', 'bottom']) {
    if (Object.prototype.hasOwnProperty.call(ws, k)) out[k] = ws[k]
  }
  const o = /** @type {Record<string, unknown>} */ (ws)
  if (Object.prototype.hasOwnProperty.call(o, 'floatview')) {
    out.floatview = o.floatview
  } else if (Object.prototype.hasOwnProperty.call(o, 'float')) {
    out.floatview = o.float
  }
  if (Object.prototype.hasOwnProperty.call(o, 'model')) {
    out.model = o.model
  }
  if (Object.prototype.hasOwnProperty.call(o, 'inner')) {
    out.inner = o.inner
  }
  if (Object.prototype.hasOwnProperty.call(o, 'embed')) {
    out.embed = o.embed
  }
  return Object.keys(out).length ? out : undefined
}

/**
 * 将 Explorer / Property / Bottom 应用到宿主（与 {@link WorkspaceNode.prototype.open_view} 中规则一致）。
 * `workspaceShell === undefined`：不调用（保持）。`null`：三区域均 `set*(null)`。对象则按 key 存在性更新。
 *
 * @param {Record<string, unknown>|null|undefined} workspaceShell
 * @param {import('./workspace-view-config.js').WorkspaceShellContext & { sideNav?: any, propertyPanel?: any, logPanel?: any }} ctx
 * @param {{
 *   activate?: boolean,
 *   mounts?: Partial<Record<'explorer'|'property'|'bottom', HTMLElement>>,
 * }} [options]
 * `activate: true` 时在非 `null` 的 spec 上同步选中各区域工作区签（Explorer / Property 外层签、Bottom 的 `cmx_ws_bottom`）。
 * `mounts`：各区域挂载 **Content 标签缓存的根节点**（只创建一次，切换时移动挂载）；缺省时由各面板自行 `renderWorkspaceRegionViewsHtml`。
 */
export function applyWorkspaceShell (workspaceShell, ctx, options = {}) {
  const { sideNav, propertyPanel, logPanel } = ctx
  const activate = !!options.activate
  const mounts = options.mounts && typeof options.mounts === 'object' ? options.mounts : {}
  if (workspaceShell === undefined) return
  if (workspaceShell === null) {
    sideNav?.setWorkspaceExplorer?.(null)
    propertyPanel?.setWorkspaceProperty?.(null)
    logPanel?.setWorkspaceBottom?.(null)
    return
  }
  const ws = workspaceShell
  const apply = (key, fn) => {
    if (!fn || !Object.prototype.hasOwnProperty.call(ws, key)) return
    const v = ws[key]
    fn(v === null ? null : /** @type {import('./workspace-view-config.js').WorkspaceViewSpec|import('./workspace-view-config.js').WorkspaceViewSpec[]} */ (v))
  }
  apply('explorer', (s) => sideNav?.setWorkspaceExplorer?.(s, {
    activateWorkspace: activate && s != null,
    mountRoot: mounts.explorer,
  }))
  apply('property', (s) => propertyPanel?.setWorkspaceProperty?.(s, {
    activateWorkspace: activate && s != null,
    mountRoot: mounts.property,
  }))
  apply('bottom', (s) => logPanel?.setWorkspaceBottom?.(s, {
    activateWorkspace: activate && s != null,
    mountRoot: mounts.bottom,
  }))
}

// ---------------------------------------------------------------------------
// WorkspaceNode
// ---------------------------------------------------------------------------

/**
 * 从菜单节点提取 DAM 三元组（camelCase 优先，兼容 snake_case + summary.extras 结构）。
 * 三种来源：
 *   - menu-cache 标准化节点：顶层 camelCase（domainCode/applicationCode/moduleCode）
 *   - explorerMenuNodeSummary 输出：domainCode 收进 node.extras（非 KNOWN_KEYS）
 *   - 动态构造节点（cr-editor）：snake_case（domain_code 等）
 * @param {Record<string, unknown>} node
 * @returns {{ domainCode: string, applicationCode: string, moduleCode: string }}
 */
function extractDamFromNode (node) {
  if (!node || typeof node !== 'object') return { domainCode: '', applicationCode: '', moduleCode: '' }
  /** @type {Record<string, unknown>} */
  const ex = (node.extras && typeof node.extras === 'object') ? node.extras : {}
  return {
    domainCode: String(node.domainCode ?? ex.domainCode ?? node.domain_code ?? ex.domain_code ?? ''),
    applicationCode: String(node.applicationCode ?? ex.applicationCode ?? node.application_code ?? ex.application_code ?? ''),
    moduleCode: String(node.moduleCode ?? ex.moduleCode ?? node.module_code ?? ex.module_code ?? ''),
  }
}

export class WorkspaceNode {
  /**
   * @param {{ workspace: import('./workspace-view-config.js').WorkspaceConfig, meta: import('./workspace-view-config.js').WorkspaceNodeMeta, extensions?: Record<string, unknown> }} opts
   */
  constructor (opts) {
    const { workspace, meta, extensions = {} } = opts
    /** @type {import('./workspace-view-config.js').WorkspaceConfig} */
    this.workspace = workspace && typeof workspace === 'object' ? { ...workspace } : {}
    /** @type {import('./workspace-view-config.js').WorkspaceNodeMeta} */
    this.meta = { ...meta }
    /** 任意扩展属性（版本、来源菜单 id 等） */
    this.extensions = { ...extensions }
  }

  /**
   * @param {Record<string, unknown>} node
   * @param {{ tabId?: string, icon?: string }} [overrides]
   */
  static fromMenuNode (node, overrides = {}) {
    const label = portalDisplayText(node.caption, portalDisplayText(node.name, String(node.id ?? '')))
    const tabId = overrides.tabId != null && String(overrides.tabId).trim()
      ? String(overrides.tabId).trim()
      : (node.id != null && String(node.id).trim() ? String(node.id).trim() : label)
    const wsRaw = node.workspace
    const workspace = wsRaw != null && typeof wsRaw === 'object'
      ? /** @type {import('./workspace-view-config.js').WorkspaceConfig} */ (wsRaw)
      : {
          content: {
            type: 'placeholder',
            data: { title: label },
          },
        }
    const icon = overrides.icon != null && String(overrides.icon).trim()
      ? String(overrides.icon).trim()
      : (node.icon != null && String(node.icon).trim() ? String(node.icon).trim() : 'document')
    return new WorkspaceNode({
      workspace,
      meta: { tabId, label, icon, menu: /** @type {Record<string, unknown>|null} */ (node) },
      extensions: { sourceMenuId: node.id, ...extractDamFromNode(node) },
    })
  }

  /**
   * @param {{ menu?: Record<string, unknown>|null, text?: string, item?: unknown, view?: string }} detail
   */
  static fromNavSelectionDetail (detail) {
    const m = detail.menu && typeof detail.menu === 'object' ? detail.menu : null
    const label = portalDisplayText(m?.caption, portalDisplayText(detail.text))
    const tabId = (m?.id != null && String(m.id).trim()) ? String(m.id).trim() : label
    let icon = 'document'
    if (m?.icon != null && String(m.icon).trim()) {
      icon = String(m.icon).trim()
    } else {
      const sel = detail.item
      if (sel && typeof sel === 'object' && 'icon' in sel) {
        const ic = /** @type {{ icon?: string }} */ (sel).icon
        if (ic != null && String(ic).trim()) icon = String(ic).trim()
      }
    }
    const ws = m?.workspace != null && typeof m.workspace === 'object'
      ? /** @type {import('./workspace-view-config.js').WorkspaceConfig} */ (m.workspace)
      : {
          content: {
            type: 'placeholder',
            data: { title: label || '页面' },
          },
        }
    return new WorkspaceNode({
      workspace: ws,
      meta: { tabId, label, icon, menu: m },
      extensions: { navView: detail.view, ...(m ? extractDamFromNode(m) : {}) },
    })
  }

  /**
   * @param {import('./workspace-view-config.js').WorkspaceConfig} patch
   */
  mergeWorkspace (patch) {
    Object.assign(this.workspace, patch)
  }

  /**
   * @param {{
   *   contentArea: { addTab: (o: Record<string, unknown>) => unknown },
   *   sideNav: { setWorkspaceExplorer?: (spec: import('./workspace-view-config.js').WorkspaceRegionViewsInput|null, opts?: object) => void } | null,
   *   propertyPanel: { setWorkspaceProperty?: (spec: import('./workspace-view-config.js').WorkspaceRegionViewsInput|null, opts?: object) => void } | null,
   *   logPanel: { setWorkspaceBottom?: (spec: import('./workspace-view-config.js').WorkspaceRegionViewsInput|null, opts?: object) => void } | null,
   * }} ctx
   * @param {{ initialContext?: Record<string, unknown> }} [extras]
   *   `initialContext`：在 tab 对应 Workspace `createWorkspace` 之后、CE hydrate 之前
   *   逐键 `ws.context.set(k, v)`，供 content 视图脚本启动期同步读取（典型用法：把 prepare 对话框确定后的 result 透传过来）。
   */
  open_view (ctx, extras = {}) {
    const { contentArea } = ctx
    const ws = this.workspace
    const { tabId, label, icon } = this.meta

    /* 抓取 layout restore 前的「菜单原始布局」snapshot，作为「重置视图位置」的目标态。
       deep clone：layout apply 会替换 ws[r] 引用，浅拷贝撑不住。 */
    const originalWorkspace = deepClone(ws)

    /* dock 布局 restore：在 content/shell 抽取前 mutate ws，下游渲染管线天然吃到新布局。 */
    let workspaceLayoutId = ''
    try {
      workspaceLayoutId = deriveWorkspaceLayoutId(this)
      if (workspaceLayoutId) {
        const layout = readDockLayout(workspaceLayoutId)
        if (layout) applyDockLayoutToWorkspace(/** @type {Record<string, unknown>} */ (ws), layout)
      }
    } catch (err) {
      console.warn('[cmx-portal] restore workspace dock layout failed', err)
    }

    const contentRaw = ws.content != null ? ws.content : { type: 'placeholder', data: { title: label } }
    const html = renderWorkspaceRegionViewsHtml('content', /** @type {import('./workspace-view-config.js').WorkspaceRegionViewsInput} */ (contentRaw))
    const shell = workspaceShellSnapshot(ws)
    /** @type {Record<string, unknown>} */
    const tabOpts = {
      id: tabId,
      text: workspaceContentTabText(/** @type {import('./workspace-view-config.js').WorkspaceRegionViewsInput} */ (contentRaw), label),
      icon: workspaceContentTabIcon(/** @type {import('./workspace-view-config.js').WorkspaceRegionViewsInput} */ (contentRaw), icon),
      content: html,
      workspaceShell: shell === undefined ? undefined : shell,
      contentSpec: contentRaw,
      workspaceLayoutId,
      originalWorkspace,
    }
    const menu = this.meta.menu
    // 完整原始 menu node 快照（含 id/workspace/model）——供 router 存 history.state，
    // 浏览器前进/回退时对动态节点（报表等，findByCode 查不到）直接 openNode 重建。
    // 注意与 originalWorkspace 区别：后者只是 workspace 子对象（用于「重置视图布局」），
    // 不含外层 id/name，不能拿去 openNode。
    /** @type {Record<string, unknown>|undefined} */
    let sourceNode
    try {
      if (menu && typeof menu === 'object') {
        sourceNode = deepClone(menu)
      }
    } catch { sourceNode = undefined }
    tabOpts.sourceNode = sourceNode
    if (menu && typeof menu === 'object' && Object.prototype.hasOwnProperty.call(menu, 'dirty')) {
      tabOpts.dirty = !!(/** @type {{ dirty?: unknown }} */ (menu).dirty)
    }
    if (extras && extras.initialContext && typeof extras.initialContext === 'object') {
      tabOpts.initialContext = extras.initialContext
    }
    contentArea.addTab(tabOpts)
  }
}
