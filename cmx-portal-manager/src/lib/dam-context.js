/**
 * DAM（domain/application/module）当前值的持久化与读取。
 *
 * 职责：
 *   - 选中域时写 localStorage（key: cmx-active-dam），刷新时读回恢复域 + 加载菜单
 *   - openNode 时取当前活动 DAM，注入到新页面 workspace.context，供页面统一读取
 *
 * 存储内容：只存 `{ domain }`（domain id）。
 *   shellbar 的 application 是 .json 文件名（如 'cmxfico.json'），不是 application code，
 *   不能用于恢复；application 由 domain → activities 链路重新派生。
 *
 * 多 tab 共享同一 localStorage（浏览器标准行为）：新开 tab 默认进上次域。
 *
 * key 命名约定：注入 workspace.context 与读取统一用短名 `domain/application/module`
 * （与菜单 JSON props 现状一致），由 DAM_KEYS 常量集中管理。
 */

/** workspace.context 中 DAM 三键的短名（与菜单 JSON props 字段名一致）。 */
export const DAM_KEYS = /** @type {const} */ (['domain', 'application', 'module'])

const DAM_STORAGE_KEY = 'cmx-active-dam'

/**
 * 读取上次持久化的域 + 应用。返回 null 表示无记录（首访、隐私模式、JSON 损坏）。
 * @returns {{ domain: string, application: string } | null}
 *   application 为空串表示无应用记录（同域多应用场景下会回退到 list[0]）。
 */
export function loadActiveDam () {
  try {
    const raw = localStorage.getItem(DAM_STORAGE_KEY)
    if (!raw) return null
    const v = JSON.parse(raw)
    if (!v || typeof v !== 'object' || typeof v.domain !== 'string' || !v.domain) return null
    return { domain: v.domain, application: typeof v.application === 'string' ? v.application : '' }
  } catch {
    return null
  }
}

/**
 * 持久化当前选中的域 + 应用。
 *
 * 只在"用户主动切域/切应用"（shellbar 点击域 / domain-change / activity-change）时调用；
 * 深链被动切域（switchActivityForMenu）不应调用，避免覆盖用户上次选择。
 *
 * 同域多应用恢复：同域内切应用时 application 字段更新，F5 后能恢复到上次的应用
 * 而非 list[0]。切域时 application 清空（新域的应用由首屏/域切换逻辑按 list[0] 决定）。
 *
 * @param {{ domain: string, application?: string }} dam
 *   domain 必填；application 可选，省略时保留原 application（用于 activity-change 单独更新应用）。
 */
export function saveActiveDam (dam) {
  try {
    if (!dam || typeof dam.domain !== 'string' || !dam.domain) return
    // 读旧记录合并：activity-change 单独更新应用时，domain 沿用上次值
    let prev = {}
    try { prev = JSON.parse(localStorage.getItem(DAM_STORAGE_KEY) || '{}') || {} } catch { /* ignore */ }
    const next = {
      domain: dam.domain,
      application: typeof dam.application === 'string' ? dam.application : (prev.application || ''),
    }
    localStorage.setItem(DAM_STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* 隐私模式 / 配额满 / JSON 序列化失败：静默忽略，不阻塞主流程 */
  }
}

/**
 * 取当前活动 DAM（供 openNode 注入页面用）。
 *
 * domain/application 来自 host 当前活动域；moduleCode 反查当前 tab 的菜单节点（门户层
 * 本身不持有 module，只有打开的菜单 tab 才知道所属 module）。查不到给空串，页面侧按需兜底。
 *
 * @param {HTMLElement} host  cmx-portal-app 实例
 * @param {{ getMenuCache?: () => { findByCode?: (code: string) => any } }} [inject]
 *   测试用注入；运行时省略，内部动态 import menu-cache
 * @returns {{ domain: string, application: string, module: string }}
 *   返回短名形式（与 DAM_KEYS 一致），值可能为空串
 */
export async function getCurrentDam (host, inject) {
  const empty = { domain: '', application: '', module: '' }
  if (!host) return empty
  // domain/application：优先从 shellbar 域选择器取（最准）
  /** @type {any} */
  const shellbar = host.shadowRoot?.querySelector?.('portal-shellbar')
  const domainId = shellbar?._activeDomainId || ''
  // domain id 即 domain code（domains 列表的 id 字段，如 'basic' / 'fi'）
  // application 反查当前活动条目（activities 列表）
  let application = ''
  if (domainId) {
    try {
      const mod = await import('./menu-cache.js')
      const cache = (inject?.getMenuCache?.()) || mod.getMenuCache?.()
      // 当前活动 tab 的菜单节点反查 moduleCode
      const content = host.shadowRoot?.getElementById?.('content-area')
      const tabId = typeof content?.getActiveTabId === 'function' ? content.getActiveTabId() : null
      const node = tabId ? cache?.findByCode?.(tabId) : null
      if (node?.moduleCode) {
        return { domain: node.domainCode || domainId, application: node.applicationCode || '', module: node.moduleCode }
      }
    } catch {
      /* menu-cache 不可用：返回 domain id + 空 module */
    }
  }
  return { domain: domainId, application, module: '' }
}

/**
 * 把当前活动 DAM 合并进 extras.initialContext，供 openWorkspaceNodeWithPrepare 注入到
 * 新页面 workspace.context。
 *
 * dam 来源优先级：
 *   1. wsNode.extensions 上的 domainCode/applicationCode/moduleCode（菜单节点自带，最准）
 *   2. host 当前活动 dam（fallback，给动态构造的无 dam 节点用）
 *
 * 不覆盖调用方显式传入的同名 key（extras.initialContext 优先），保证业务跳转传参（如 docId）
 * 不被 dam 覆盖。
 *
 * @param {HTMLElement} host  cmx-portal-app 实例
 * @param {{ extensions?: Record<string, unknown> }} wsNode  WorkspaceNode 实例
 * @param {{ initialContext?: Record<string, unknown> }} [extras]
 * @returns {Promise<{ initialContext?: Record<string, unknown> }>}
 */
export async function injectDamIntoExtras (host, wsNode, extras) {
  // 1. 优先从 wsNode.extensions 取（菜单节点经 fromMenuNode/fromNavSelectionDetail 拷贝而来）
  /** @type {Record<string, string>} */
  const ext = (wsNode?.extensions && typeof wsNode.extensions === 'object') ? wsNode.extensions : {}
  let dam = {
    domain: ext.domainCode || ext.domain_code || '',
    application: ext.applicationCode || ext.application_code || '',
    module: ext.moduleCode || ext.module_code || '',
  }
  // 2. extensions 没有 → fallback host 当前活动 dam
  if (!dam.domain) {
    dam = await getCurrentDam(host)
  }
  // 无 dam 可注入（如欢迎页、内置页）→ 原样返回
  if (!dam.domain && !dam.application && !dam.module) return extras || {}
  // 合并：dam 作底，调用方显式传入的 initialContext 覆盖（业务参数优先）
  const userCtx = extras?.initialContext && typeof extras.initialContext === 'object' ? extras.initialContext : {}
  const merged = { domain: dam.domain, application: dam.application, module: dam.module, ...userCtx }
  return { ...(extras || {}), initialContext: merged }
}
