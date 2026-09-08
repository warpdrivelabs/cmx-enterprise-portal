/**
 * 工作区节点：由菜单 `workspace` 配置构造，通过 `open_view` 驱动 Content / Explorer / Property / Bottom。
 * 视图 `type` 可通过 {@link registerWorkspaceViewType} 扩展；内置若干默认类型。
 *
 * 各区域 `content` / `explorer` / `property` / `bottom` 写法一致：可为**单个** {@link WorkspaceViewSpec}、**多视图数组** `WorkspaceViewSpec[]`，
 * 或 **`{ icon?: string, caption?: string, views: WorkspaceViewSpec[] }`**（与 `content` 相同；`caption`/`icon` 可作区域级标题与外层签图标，底部多视图 Tab 图标仍取自各 `views[]` 的 `icon`）。多于一个视图时底部 Tab 条切换；
 * 各视图可选 `icon`（`ui5-icon` 的 `name`）；未写则 Tab 用默认 `document`。Explorer **区内**底部多视图 Tab **仅**使用 `views` 里各视图的 `icon`，不使用活动栏图标；**侧栏外层** Explorer 工作区签、**主内容区标签**、**属性面板顶栏**、**底部工作区签**的文案与图标均来自对应区域的 `workspace.*`：{@link workspaceRegionOuterTabText} / {@link workspaceRegionOuterTabIcon}（包装层 `caption`/`icon` 优先，否则取首个视图 `tabLabel`/`icon`）。**主内容区标签**在仍无文案或图标时使用上层菜单的 `caption`/`icon`（见 {@link workspaceContentTabText} / {@link workspaceContentTabIcon}）。
 * 委托点击由 {@link handleWorkspaceRegionTabBarClick} 处理（各宿主在 shadowRoot 上监听 `click`）。
 */

/**
 * @typedef {{ tabLabel?: string, type?: string, icon?: string, data?: Record<string, unknown> }} WorkspaceViewSpec
 */

/**
 * 单个区域：单视图对象、多视图数组，或与 `content` 相同的 **`{ icon?: string, caption?: string, views: WorkspaceViewSpec[] }`** 包装（`views` 为数组来源；`caption` / `icon` 为区域级 UI 文案与图标）。
 * @typedef {WorkspaceViewSpec | WorkspaceViewSpec[] | { icon?: string, caption?: string, views: WorkspaceViewSpec[], [key: string]: unknown } | null | undefined} WorkspaceRegionViewsInput
 */

/**
 * @typedef {{
 *   content?: WorkspaceRegionViewsInput,
 *   explorer?: WorkspaceRegionViewsInput,
 *   property?: WorkspaceRegionViewsInput,
 *   bottom?: WorkspaceRegionViewsInput,
 *   [key: string]: unknown
 * }} WorkspaceConfig
 */

/** @typedef {{ sideNav?: any, propertyPanel?: any, logPanel?: any }} WorkspaceShellContext */

/** @type {Map<string, (region: string, spec: WorkspaceViewSpec) => string>} */
const _customViewTypes = new Map()

/**
 * 注册全局视图类型渲染器（`type` 不区分大小写）。
 * @param {string} type
 * @param {(region: string, spec: WorkspaceViewSpec) => string} renderer
 */
export function registerWorkspaceViewType (type, renderer) {
  _customViewTypes.set(String(type).trim().toLowerCase(), renderer)
}


/**
 * @param {WorkspaceViewSpec} spec
 * @param {string} region
 * @param {number} index
 * @param {Set<string>} taken
 */
function resolveWorkspaceViewId (spec, region, index, taken) {
  const o = spec && typeof spec === 'object' ? /** @type {Record<string, unknown>} */ (spec) : {}
  const explicit = o.id != null ? String(o.id).trim() : ''
  const fromPage = o.html_page != null ? String(o.html_page).trim() : ''
  const base = explicit || fromPage || `${region}.${index}`
  if (!taken.has(base)) {
    taken.add(base)
    return base
  }
  let n = 2
  while (taken.has(`${base}#${n}`)) n++
  const out = `${base}#${n}`
  taken.add(out)
  return out
}

function wrapViewWithMarker (html, region, viewId) {
  return `<div data-cmx-region="${escHtml(region)}" data-cmx-view-id="${escHtml(viewId)}" style="display:contents">${html}</div>`
}

import { safeUi5IconName } from 'cmx-icon-resource/ui5/safe-ui5-icon-name'
import { escHtml } from '../utils/esc.js'

export { safeUi5IconName }

function renderIframe (src, title, height = '100%') {
  return `<iframe title="${escHtml(title)}" src="${escHtml(String(src))}" style="width:100%;height:${escHtml(String(height))};min-height:200px;border:0;background:var(--sapBackgroundColor,#fff)"></iframe>`
}

/**
 * 内置：html / iframe / placeholder / json / code / link / menu-pages（iframe 拉取菜单 JSON 的 URL）
 * @param {string} region
 * @param {WorkspaceViewSpec} spec
 */
function renderBuiltinType (region, spec) {
  const type = String(spec.type || 'placeholder').trim().toLowerCase() || 'placeholder'
  const data = spec.data && typeof spec.data === 'object' ? /** @type {Record<string, unknown>} */ (spec.data) : {}
  const title = data.title != null ? String(data.title) : ''

  if (type === 'html' && data.html != null) {
    return String(data.html)
  }
  if (type === 'iframe' && data.src != null) {
    const h = data.height != null ? String(data.height) : '100%'
    return renderIframe(data.src, title || region, h)
  }
  if (type === 'link' && (data.url != null || data.href != null)) {
    const u = data.url != null ? data.url : data.href
    const h = data.height != null ? String(data.height) : '100%'
    return renderIframe(u, title || String(u), h)
  }
  if (type === 'menu-pages') {
    const menu = data.menu != null ? String(data.menu).trim() : ''
    if (!menu) {
      return `<div style="padding:16px;color:var(--sapContent_LabelColor,#6a6d70)">menu-pages 需提供 <code>data.menu</code>（菜单名）。</div>`
    }
    const base = data.baseUrl != null ? String(data.baseUrl) : ''
    let urlStr = ''
    try {
      const u = new URL('/api/menu-pages', base || (typeof window !== 'undefined' ? window.location.href : 'http://localhost'))
      u.searchParams.set('menu', menu)
      urlStr = u.toString()
    } catch {
      urlStr = `/api/menu-pages?menu=${encodeURIComponent(menu)}`
    }
    return renderIframe(urlStr, title || `menu:${menu}`, data.height != null ? String(data.height) : '100%')
  }
  if (type === 'json') {
    const payload = data.value !== undefined ? data.value : data
    let text = ''
    try {
      text = JSON.stringify(payload, null, 2)
    } catch {
      text = String(payload)
    }
    return `<pre style="margin:0;padding:12px;font-size:11px;line-height:1.45;overflow:auto;max-height:100%;box-sizing:border-box">${escHtml(text)}</pre>`
  }
  if (type === 'code' || type === 'pre') {
    const code = data.code != null ? String(data.code) : (data.text != null ? String(data.text) : '')
    return `<pre style="margin:0;padding:12px;font-size:12px;line-height:1.45;overflow:auto;max-height:100%;box-sizing:border-box;white-space:pre-wrap">${escHtml(code)}</pre>`
  }
  if (type === 'markdown') {
    const md = data.markdown != null ? String(data.markdown) : (data.text != null ? String(data.text) : '')
    return `<div style="padding:16px;font-size:14px;line-height:1.55;max-height:100%;overflow:auto;white-space:pre-wrap">${escHtml(md)}</div>`
  }
  if (type === 'split') {
    const left = data.leftHtml != null ? String(data.leftHtml) : '<div style="padding:8px">左</div>'
    const right = data.rightHtml != null ? String(data.rightHtml) : '<div style="padding:8px">右</div>'
    const ratio = data.ratio != null ? String(data.ratio) : '40%'
    return `<div style="display:flex;height:100%;min-height:220px;gap:1px;background:var(--sapGroup_TitleBorderColor,#ddd)">
      <div style="flex:0 0 ${escHtml(ratio)};min-width:0;overflow:auto;background:var(--sapBackgroundColor,#fff)">${left}</div>
      <div style="flex:1 1 auto;min-width:0;overflow:auto;background:var(--sapBackgroundColor,#fff)">${right}</div>
    </div>`
  }
  if (type === 'placeholder') {
    const t = title || spec.tabLabel || region
    return `<div style="padding:20px;color:var(--sapContent_LabelColor,#6a6d70);font-size:13px;line-height:1.5">
      <div style="font-weight:600;margin-bottom:8px;color:var(--sapTextColor,#333)">${escHtml(t)}</div>
      <p>视图类型 <code style="background:var(--sapShell_Background,#eee);padding:2px 6px;border-radius:4px">${escHtml(type)}</code>（区域 ${escHtml(region)}）</p>
      <pre style="margin-top:12px;padding:10px;background:var(--sapShell_Background,#f5f6f7);border-radius:6px;overflow:auto;font-size:11px">${escHtml(JSON.stringify(data, null, 2))}</pre>
    </div>`
  }
  return `<div style="padding:16px;font-size:13px;color:var(--sapContent_LabelColor,#6a6d70)">
    不支持的视图类型 <strong>${escHtml(type)}</strong>（${escHtml(region)}）。请使用 <code>registerWorkspaceViewType('${escHtml(type)}', fn)</code> 注册。
  </div>`
}

/**
 * @param {WorkspaceRegionViewsInput} raw
 * @returns {Record<string, unknown>|null} 若为 `{ views: WorkspaceViewSpec[] }` 包装则返回该对象，否则 `null`。
 */
function workspaceRegionViewsWrapper (raw) {
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
 * 用于侧栏 / 属性标题 / 底部「工作区」签等：**包装层 `caption`** 优先；否则单视图用其 `tabLabel`；多视图用首个非空 `tabLabel`；再否则 `fallback`。
 * @param {WorkspaceRegionViewsInput} raw
 * @param {string} [fallback]
 */
export function workspaceRegionOuterTabText (raw, fallback = '工作区') {
  const wrap = workspaceRegionViewsWrapper(raw)
  if (wrap && wrap.caption != null && String(wrap.caption).trim() !== '') {
    return String(wrap.caption).trim()
  }
  const views = normalizeWorkspaceRegionViews(raw)
  if (!views.length) return ''
  const labels = views.map((v) => String(v.tabLabel || '').trim()).filter(Boolean)
  return labels[0] || fallback
}

/**
 * 区域外层签 / Tab 图标：**包装层 `icon`** 优先；否则取首个视图非空 `icon`；再否则 `fallback`（经 {@link safeUi5IconName}）。
 * @param {WorkspaceRegionViewsInput} raw
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
 * 主内容区浏览器标签的 `text`：与 {@link workspaceRegionOuterTabText} 一致（`fallback` 传空串）；若仍无文案则用菜单项 `caption`/`name`。
 * @param {WorkspaceRegionViewsInput} contentRaw
 * @param {string} [menuLabel] 上层菜单显示名
 * @param {string} [emptyFallback]
 */
export function workspaceContentTabText (contentRaw, menuLabel, emptyFallback = '工作区') {
  const fromWs = workspaceRegionOuterTabText(contentRaw, '')
  if (fromWs) return fromWs
  const m = menuLabel != null ? String(menuLabel).trim() : ''
  return m || emptyFallback
}

/**
 * 主内容区浏览器标签的 `icon`：包装层 `icon` 优先，否则首个视图非空 `icon`；若工作区配置中**完全未**提供图标则使用菜单项 `icon`。
 * @param {WorkspaceRegionViewsInput} contentRaw
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
 * @param {WorkspaceRegionViewsInput|null|undefined} raw
 * @param {'explorer'|'property'|'bottom'} regionKey
 */
export function workspaceRegionGroupLabel (raw, regionKey) {
  const wrap = workspaceRegionViewsWrapper(raw)
  if (wrap && wrap.caption != null && String(wrap.caption).trim() !== '') {
    return String(wrap.caption).trim()
  }
  if (regionKey === 'explorer') return '侧栏'
  if (regionKey === 'property') return '属性'
  return '底部'
}

/**
 * 渲染某区域全部视图：0 个占位；1 个视图时无底部 Tab（仅一块内容）；多于一个视图时底部 Tab 条切换。
 * @param {string} region
 * @param {WorkspaceRegionViewsInput} raw
 */
export function renderWorkspaceRegionViewsHtml (region, raw) {
  const views = normalizeWorkspaceRegionViews(raw)
  const taken = new Set()
  if (!views.length) {
    if (region === 'content') {
      return `<div style="padding:24px;color:var(--sapContent_LabelColor,#6a6d70)"><p>未配置 content 视图。</p></div>`
    }
    return renderWorkspaceRegionHtml(region, null)
  }
  if (views.length === 1) {
    const vid = resolveWorkspaceViewId(views[0], region, 0, taken)
    return wrapViewWithMarker(renderWorkspaceRegionHtml(region, views[0]), region, vid)
  }
  const hi = 'var(--sapHighlightColor,#0070f2)'
  const border = 'var(--sapPageHeader_BorderColor,#ddd)'
  const bg = 'var(--sapObjectHeader_Background,#fff)'
  const panes = views.map((v, i) => {
    const vid = resolveWorkspaceViewId(v, region, i, taken)
    const inner = renderWorkspaceRegionHtml(region, v)
    const disp = i === 0 ? 'flex' : 'none'
    return `<div class="cmx-ws-tab-pane" data-pane-index="${i}" data-cmx-region="${escHtml(region)}" data-cmx-view-id="${escHtml(vid)}" style="display:${disp};flex:1 1 auto;min-height:0;min-width:0;width:100%;flex-direction:column;overflow:auto;align-self:stretch">${inner}</div>`
  }).join('')
  const tabs = views.map((v, i) => {
    const lab = escHtml(String(v.tabLabel || '').trim() || `视图 ${i + 1}`)
    const on = i === 0
    const col = on ? 'var(--sapTextColor,#333)' : 'var(--sapContent_LabelColor,#6a6d70)'
    const bdr = on ? hi : 'transparent'
    const fw = on ? '600' : '400'
    const rawIcon = v && typeof v === 'object' && v.icon != null ? String(v.icon).trim() : ''
    const ic = safeUi5IconName(rawIcon || 'document')
    return `<button type="button" class="cmx-ws-tab-btn" data-pane-index="${i}" style="display:inline-flex;align-items:center;gap:6px;flex:0 0 auto;padding:0 12px 0 8px;height:32px;font-size:12px;cursor:pointer;border:none;background:transparent;color:${col};border-top:2px solid ${bdr};font-weight:${fw}"><ui5-icon name="${escHtml(ic)}" style="width:14px;height:14px;flex-shrink:0"></ui5-icon><span>${lab}</span></button>`
  }).join('')
  return `<div class="cmx-ws-region" data-cmx-ws-region="${escHtml(region)}" data-active-pane-index="0" style="display:flex;flex-direction:column;flex:1 1 auto;width:100%;height:100%;min-height:0;min-width:0;background:var(--sapBackgroundColor,#fff)">
    <div class="cmx-ws-region-body" style="flex:1 1 auto;min-height:0;min-width:0;width:100%;display:flex;flex-direction:column;overflow:hidden">
      ${panes}
    </div>
    <div class="cmx-ws-region-tabs-bottom" role="tablist" style="flex-shrink:0;display:flex;flex-wrap:nowrap;align-items:stretch;gap:0;border-top:1px solid ${border};background:${bg}">
      ${tabs}
    </div>
  </div>`
}

/**
 * 区域底部多视图 Tab 点击：委托给宿主 `shadowRoot` 的 `click`（仅处理 `.cmx-ws-tab-btn`）。
 * @param {MouseEvent} e
 */
export function handleWorkspaceRegionTabBarClick (e) {
  const t = e.target
  if (!(t instanceof Element)) return
  const btn = t.closest('.cmx-ws-tab-btn')
  if (!(btn instanceof HTMLElement)) return
  const region = btn.closest('.cmx-ws-region')
  if (!(region instanceof HTMLElement)) return
  const idxStr = btn.getAttribute('data-pane-index') || btn.dataset.paneIndex
  const idx = parseInt(String(idxStr ?? ''), 10)
  if (Number.isNaN(idx)) return
  const hi = 'var(--sapHighlightColor,#0070f2)'
  const mute = 'var(--sapContent_LabelColor,#6a6d70)'
  const text = 'var(--sapTextColor,#333)'
  region.querySelectorAll('.cmx-ws-tab-btn').forEach((b) => {
    if (!(b instanceof HTMLElement)) return
    const pi = parseInt(b.getAttribute('data-pane-index') || '', 10)
    const on = pi === idx
    b.style.color = on ? text : mute
    b.style.borderTopColor = on ? hi : 'transparent'
    b.style.fontWeight = on ? '600' : '400'
  })
  region.querySelectorAll('.cmx-ws-tab-pane').forEach((pane) => {
    if (!(pane instanceof HTMLElement)) return
    const pi = parseInt(pane.getAttribute('data-pane-index') || '', 10)
    pane.style.display = pi === idx ? 'flex' : 'none'
  })
}

/**
 * 在已渲染的区域内切换到指定索引的多视图 Tab（无底部 Tab 时无操作）。
 * @param {ParentNode|null} rootEl 宿主内包含 `.cmx-ws-region` 的容器（如 explorer pane 根）
 * @param {'explorer'|'property'|'bottom'} region
 * @param {number} viewIndex
 */
export function activateWorkspaceRegionViewByIndex (rootEl, region, viewIndex) {
  if (!(rootEl instanceof Element)) return
  const regionEl = rootEl.querySelector(`.cmx-ws-region[data-cmx-ws-region="${region}"]`)
  if (!(regionEl instanceof HTMLElement)) return
  const idx = Math.max(0, Math.floor(Number(viewIndex) || 0))
  const btn = regionEl.querySelector(`.cmx-ws-tab-btn[data-pane-index="${idx}"]`)
  if (btn instanceof HTMLElement) {
    handleWorkspaceRegionTabBarClick(/** @type {any} */ ({ target: btn }))
  }
}

/**
 * @param {string} region
 * @param {WorkspaceViewSpec|null|undefined} spec
 */
export function renderWorkspaceRegionHtml (region, spec) {
  if (!spec || spec == null) {
    return `<div style="padding:16px;color:var(--sapContent_LabelColor,#6a6d70);font-size:13px">（${escHtml(region)} 未配置）</div>`
  }
  const typeRaw = String(spec.type || 'placeholder').trim()
  const typeKey = typeRaw.toLowerCase()
  const custom = _customViewTypes.get(typeKey)
  if (custom) {
    try {
      return custom(region, spec)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return `<div style="padding:12px;color:var(--sapNegativeTextColor, #bb0000);font-size:13px">自定义视图 <code>${escHtml(typeRaw)}</code> 渲染失败：${escHtml(msg)}</div>`
    }
  }
  return renderBuiltinType(region, { ...spec, type: typeRaw })
}

/**
 * @param {WorkspaceRegionViewsInput} spec
 */
export function renderContentViewHtml (spec) {
  return renderWorkspaceRegionViewsHtml('content', spec)
}

/**
 * 从完整 `workspace` 中抽出仅影响侧栏 / 属性 / 底部的快照（供 Content 标签绑定）。
 * @param {WorkspaceConfig|null|undefined} ws
 * @returns {Record<string, unknown>|undefined}
 */
export function workspaceShellSnapshot (ws) {
  if (!ws || typeof ws !== 'object') return undefined
  /** @type {Record<string, unknown>} */
  const out = {}
  for (const k of ['explorer', 'property', 'bottom']) {
    if (Object.prototype.hasOwnProperty.call(ws, k)) out[k] = ws[k]
  }
  return Object.keys(out).length ? out : undefined
}

/**
 * 将 Explorer / Property / Bottom 应用到宿主（与 {@link WorkspaceNode.prototype.open_view} 中规则一致）。
 * `workspaceShell === undefined`：不调用（保持）。`null`：三区域均 `set*(null)`。对象则按 key 存在性更新。
 *
 * @param {Record<string, unknown>|null|undefined} workspaceShell
 * @param {WorkspaceShellContext & { sideNav?: any, propertyPanel?: any, logPanel?: any }} ctx
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
    fn(v === null ? null : /** @type {WorkspaceViewSpec|WorkspaceViewSpec[]} */ (v))
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

/**
 * @typedef {{
 *   tabId: string,
 *   label: string,
 *   icon?: string,
 *   menu?: Record<string, unknown>|null,
 *   [key: string]: unknown
 * }} WorkspaceNodeMeta
 */

export class WorkspaceNode {
  /**
   * @param {{ workspace: WorkspaceConfig, meta: WorkspaceNodeMeta, extensions?: Record<string, unknown> }} opts
   */
  constructor (opts) {
    const { workspace, meta, extensions = {} } = opts
    /** @type {WorkspaceConfig} */
    this.workspace = workspace && typeof workspace === 'object' ? { ...workspace } : {}
    /** @type {WorkspaceNodeMeta} */
    this.meta = { ...meta }
    /** 任意扩展属性（版本、来源菜单 id 等） */
    this.extensions = { ...extensions }
  }

  /**
   * @param {Record<string, unknown>} node
   * @param {{ tabId?: string, icon?: string }} [overrides]
   */
  static fromMenuNode (node, overrides = {}) {
    const label = node.caption != null && String(node.caption) !== ''
      ? String(node.caption)
      : (node.name != null ? String(node.name) : String(node.id ?? ''))
    const tabId = overrides.tabId != null && String(overrides.tabId).trim()
      ? String(overrides.tabId).trim()
      : (node.id != null && String(node.id).trim() ? String(node.id).trim() : label)
    const wsRaw = node.workspace
    const workspace = wsRaw != null && typeof wsRaw === 'object'
      ? /** @type {WorkspaceConfig} */ (wsRaw)
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
      extensions: { sourceMenuId: node.id },
    })
  }

  /**
   * @param {{ menu?: Record<string, unknown>|null, text?: string, item?: unknown, view?: string }} detail
   */
  static fromNavSelectionDetail (detail) {
    const m = detail.menu && typeof detail.menu === 'object' ? detail.menu : null
    const label = (m?.caption && String(m.caption)) || (detail.text != null ? String(detail.text) : '') || ''
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
      ? /** @type {WorkspaceConfig} */ (m.workspace)
      : {
          content: {
            type: 'placeholder',
            data: { title: label || '页面' },
          },
        }
    return new WorkspaceNode({
      workspace: ws,
      meta: { tabId, label, icon, menu: m },
      extensions: { navView: detail.view },
    })
  }

  /**
   * @param {WorkspaceConfig} patch
   */
  mergeWorkspace (patch) {
    Object.assign(this.workspace, patch)
  }

  /**
   * @param {{
   *   contentArea: { addTab: (o: Record<string, unknown>) => unknown },
   *   sideNav: { setWorkspaceExplorer?: (spec: WorkspaceRegionViewsInput|null, opts?: object) => void } | null,
   *   propertyPanel: { setWorkspaceProperty?: (spec: WorkspaceRegionViewsInput|null, opts?: object) => void } | null,
   *   logPanel: { setWorkspaceBottom?: (spec: WorkspaceRegionViewsInput|null, opts?: object) => void } | null,
   * }} ctx
   */
  open_view (ctx) {
    const { contentArea } = ctx
    const ws = this.workspace
    const { tabId, label, icon } = this.meta

    const contentRaw = ws.content != null ? ws.content : { type: 'placeholder', data: { title: label } }
    const html = renderWorkspaceRegionViewsHtml('content', /** @type {WorkspaceRegionViewsInput} */ (contentRaw))
    const shell = workspaceShellSnapshot(ws)
    /** @type {Record<string, unknown>} */
    const tabOpts = {
      id: tabId,
      text: workspaceContentTabText(/** @type {WorkspaceRegionViewsInput} */ (contentRaw), label),
      icon: workspaceContentTabIcon(/** @type {WorkspaceRegionViewsInput} */ (contentRaw), icon),
      content: html,
      workspaceShell: shell === undefined ? undefined : shell,
    }
    const menu = this.meta.menu
    if (menu && typeof menu === 'object' && Object.prototype.hasOwnProperty.call(menu, 'dirty')) {
      tabOpts.dirty = !!(/** @type {{ dirty?: unknown }} */ (menu).dirty)
    }
    contentArea.addTab(tabOpts)
  }
}
