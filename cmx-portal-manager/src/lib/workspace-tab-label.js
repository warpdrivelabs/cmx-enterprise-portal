/**
 * 工作区标签文案与图标辅助函数：为各区域外层 Tab、内容区浏览器标签、准备对话框提供显示文案与图标。
 */
import {
  workspaceRegionViewsWrapper,
  normalizeWorkspaceRegionViews,
} from './workspace-view-config.js'
import { safeUi5IconName } from './workspace-view-renderer.js'
import { portalDisplayText } from './display-text.js'

/**
 * 用于侧栏 / 属性标题 / 底部「工作区」签等：**包装层 `caption`** 优先；否则单视图用其 `tabLabel`；多视图用首个非空 `tabLabel`；再否则 `fallback`。
 * @param {import('./workspace-view-config.js').WorkspaceRegionViewsInput} raw
 * @param {string} [fallback]
 */
export function workspaceRegionOuterTabText (raw, fallback = '工作区') {
  const wrap = workspaceRegionViewsWrapper(raw)
  if (wrap) {
    const caption = portalDisplayText(wrap.caption)
    if (caption) return caption
  }
  const views = normalizeWorkspaceRegionViews(raw)
  if (!views.length) return ''
  const labels = views.map((v) => portalDisplayText(v.tabLabel)).filter(Boolean)
  return labels[0] || fallback
}

/**
 * 区域外层签 / Tab 图标：**包装层 `icon`** 优先；否则取首个视图非空 `icon`；再否则 `fallback`（经 {@link safeUi5IconName}）。
 * @param {import('./workspace-view-config.js').WorkspaceRegionViewsInput} raw
 * @param {string} [fallback]
 */
export function workspaceRegionOuterTabIcon (raw, fallback = 'document') {
  const wrap = workspaceRegionViewsWrapper(raw)
  if (wrap && wrap.icon != null && String(wrap.icon).trim() !== '') {
    return safeUi5IconName(String(wrap.icon).trim())
  }
  const views = normalizeWorkspaceRegionViews(raw)
  if (!views.length) return safeUi5IconName(fallback)
  for (const v of views) {
    if (v && typeof v === 'object' && v.icon != null && String(v.icon).trim() !== '') {
      return safeUi5IconName(String(v.icon).trim())
    }
  }
  return safeUi5IconName(fallback)
}

/**
 * 准备对话框标题与尺寸：`caption` / `icon` 与 {@link workspaceRegionOuterTabText} / {@link workspaceRegionOuterTabIcon} 一致；包装对象可选 `width`、`height`（CSS 尺寸字符串）。
 * @param {import('./workspace-view-config.js').WorkspaceRegionViewsInput} prepareRaw
 * @param {string} [menuLabelFallback]
 * @returns {{ caption: string, icon: string, width: string, height: string }}
 */
export function workspacePrepareDialogMeta (prepareRaw, menuLabelFallback = '') {
  const caption = workspaceRegionOuterTabText(prepareRaw, menuLabelFallback || '工作区')
  const icon = workspaceRegionOuterTabIcon(prepareRaw, 'document')
  let width = ''
  let height = ''
  if (prepareRaw != null && typeof prepareRaw === 'object' && !Array.isArray(prepareRaw)) {
    const o = /** @type {Record<string, unknown>} */ (prepareRaw)
    if (o.width != null) width = String(o.width).trim()
    if (o.height != null) height = String(o.height).trim()
  }
  return { caption, icon, width, height }
}

/**
 * 主内容区浏览器标签的 `text`：与 {@link workspaceRegionOuterTabText} 一致（`fallback` 传空串）；若仍无文案则用菜单项 `caption`/`name`。
 * @param {import('./workspace-view-config.js').WorkspaceRegionViewsInput} contentRaw
 * @param {string} [menuLabel] 上层菜单显示名
 * @param {string} [emptyFallback]
 */
export function workspaceContentTabText (contentRaw, menuLabel, emptyFallback = '工作区') {
  const fromWs = workspaceRegionOuterTabText(contentRaw, '')
  if (fromWs) return fromWs
  const m = portalDisplayText(menuLabel)
  return m || emptyFallback
}

/**
 * 主内容区浏览器标签的 `icon`：包装层 `icon` 优先，否则首个视图非空 `icon`；若工作区配置中**完全未**提供图标则使用菜单项 `icon`。
 * @param {import('./workspace-view-config.js').WorkspaceRegionViewsInput} contentRaw
 * @param {string} [menuIcon] 上层菜单图标（`ui5-icon` name）
 * @param {string} [iconFallback] 菜单也无图标时的回退
 */
export function workspaceContentTabIcon (contentRaw, menuIcon, iconFallback = 'document') {
  const wrap = workspaceRegionViewsWrapper(contentRaw)
  if (wrap && wrap.icon != null && String(wrap.icon).trim() !== '') {
    return safeUi5IconName(String(wrap.icon).trim())
  }
  const views = normalizeWorkspaceRegionViews(contentRaw)
  for (const v of views) {
    if (v && typeof v === 'object' && v.icon != null && String(v.icon).trim() !== '') {
      return safeUi5IconName(String(v.icon).trim())
    }
  }
  const m = menuIcon != null && String(menuIcon).trim() !== '' ? String(menuIcon).trim() : ''
  return safeUi5IconName(m || iconFallback)
}

/**
 * Content 标签右键「视图」菜单里分组标题：包装层 `caption` 优先，否则按区域返回默认「侧栏 / 属性 / 底部」。
 * @param {import('./workspace-view-config.js').WorkspaceRegionViewsInput|null|undefined} raw
 * @param {'explorer'|'property'|'bottom'|'floatview'} regionKey
 */
export function workspaceRegionGroupLabel (raw, regionKey) {
  const wrap = workspaceRegionViewsWrapper(raw)
  if (wrap) {
    const caption = portalDisplayText(wrap.caption)
    if (caption) return caption
  }
  if (regionKey === 'explorer') return '侧栏'
  if (regionKey === 'property') return '属性'
  if (regionKey === 'floatview') return '浮动'
  return '底部'
}
