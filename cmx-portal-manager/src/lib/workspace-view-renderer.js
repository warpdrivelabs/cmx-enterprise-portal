/**
 * 工作区视图渲染层：视图类型注册表、内置渲染器、多 Tab HTML 生成、Tab 点击委托。
 */
import {
  normalizeWorkspaceRegionViews,
  resolveWorkspaceViewId,
} from './workspace-view-config.js'
import { escAttr as escHtml } from './escape.js'
import { safeUi5IconName } from 'cmx-icon-resource/ui5/safe-ui5-icon-name'

export { safeUi5IconName }

/** @type {Map<string, (region: string, spec: import('./workspace-view-config.js').WorkspaceViewSpec) => string>} */
const _customViewTypes = new Map()

/**
 * 注册全局视图类型渲染器（`type` 不区分大小写）。
 * @param {string} type
 * @param {(region: string, spec: import('./workspace-view-config.js').WorkspaceViewSpec) => string} renderer
 */
export function registerWorkspaceViewType (type, renderer) {
  _customViewTypes.set(String(type).trim().toLowerCase(), renderer)
}

function renderIframe (src, title, height = '100%') {
  return `<iframe title="${escHtml(title)}" src="${escHtml(String(src))}" style="width:100%;height:${escHtml(String(height))};min-height:200px;border:0;background:var(--sapBackgroundColor,#fff)"></iframe>`
}

/**
 * 内置视图类型渲染器。
 * @param {string} region
 * @param {import('./workspace-view-config.js').WorkspaceViewSpec} spec
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
  // 【遗留休眠】menu-pages 视图类型 iframe 指向旧 GET /api/menu-pages——后端路由已注释废弃
  // （cmx-common-api portal/mod.rs），且当前无任何菜单 JSON 使用该类型。勿在新菜单中使用，
  // 页面类视图请改用 native_pages / html_pages。
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
 * 把 view 外层包一个 `data-cmx-region` / `data-cmx-view-id` 标记 div；后续 CE wrapper 注册时由此读取。
 * 包装层只负责标记，不改 flex 链：保持 `display:contents` 让原渲染输出的尺寸控制不变。
 */
function wrapViewWithMarker (html, region, viewId) {
  return `<div data-cmx-region="${escHtml(region)}" data-cmx-view-id="${escHtml(viewId)}" style="display:contents">${html}</div>`
}

/**
 * 渲染单个视图的 HTML（委托到自定义类型或内置类型）。
 * @param {string} region
 * @param {import('./workspace-view-config.js').WorkspaceViewSpec|null|undefined} spec
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
 * 渲染某区域全部视图：0 个占位；1 个视图时无 Tab 条（仅一块内容）；多于一个视图时 Tab 条切换。
 * @param {string} region
 * @param {import('./workspace-view-config.js').WorkspaceRegionViewsInput} raw
 * @param {{ tabsAt?: 'top'|'bottom', viewIdTaken?: Set<string> }} [opts] 默认 `'bottom'`。
 *   `viewIdTaken`：跨多次渲染共享的同 scope viewId 占用集合；不传则本次内部新建（同 region 内仍能去重，但跨 region 无法对齐）。
 */
export function renderWorkspaceRegionViewsHtml (region, raw, opts = {}) {
  const views = normalizeWorkspaceRegionViews(raw)
  const tabsAt = opts && opts.tabsAt === 'top' ? 'top' : 'bottom'
  const taken = opts && opts.viewIdTaken instanceof Set ? opts.viewIdTaken : new Set()
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
    const borderEdge = tabsAt === 'top' ? 'border-bottom' : 'border-top'
    /* view spec 声明 hideProperty: true 时，切换到此 tab 派发事件让 portal-app 隐藏右侧栏。
       syncPropertyView 声明联动到 property region 的哪个 view（按 viewId 匹配）。
       仅 content region 生效（其他区域不影响 property 栏）。 */
    const specObj = v && typeof v === 'object' ? /** @type {any} */ (v) : null
    const hidePropAttr = region === 'content' && specObj?.hideProperty ? ' data-hide-property="1"' : ''
    const syncPropView = region === 'content' && specObj?.syncPropertyView ? String(specObj.syncPropertyView).trim() : ''
    const syncPropAttr = syncPropView ? ` data-sync-property-view="${escHtml(syncPropView)}"` : ''
    return `<button type="button" draggable="true" class="cmx-ws-tab-btn" data-pane-index="${i}"${hidePropAttr}${syncPropAttr} style="display:inline-flex;align-items:center;gap:6px;flex:0 0 auto;padding:0 12px 0 8px;height:32px;font-size:12px;cursor:pointer;border:none;background:transparent;color:${col};${borderEdge}:2px solid ${bdr};font-weight:${fw}"><ui5-icon name="${escHtml(ic)}" style="width:14px;height:14px;flex-shrink:0"></ui5-icon><span>${lab}</span></button>`
  }).join('')
  const tabsClass = tabsAt === 'top' ? 'cmx-ws-region-tabs-top' : 'cmx-ws-region-tabs-bottom'
  const tabsBorderEdge = tabsAt === 'top' ? 'border-bottom' : 'border-top'
  const tabsBar = `<div class="${tabsClass}" role="tablist" style="flex-shrink:0;display:flex;flex-wrap:nowrap;align-items:stretch;gap:0;${tabsBorderEdge}:1px solid ${border};background:${bg}">
      ${tabs}
    </div>`
  const body = `<div class="cmx-ws-region-body" style="flex:1 1 auto;min-height:0;min-width:0;width:100%;display:flex;flex-direction:column;overflow:hidden">
      ${panes}
    </div>`
  const inner = tabsAt === 'top' ? `${tabsBar}${body}` : `${body}${tabsBar}`
  return `<div class="cmx-ws-region" data-cmx-ws-region="${escHtml(region)}" data-active-pane-index="0" style="display:flex;flex-direction:column;flex:1 1 auto;width:100%;height:100%;min-height:0;min-width:0;background:var(--sapBackgroundColor,#fff)">
    ${inner}
  </div>`
}

/**
 * @param {import('./workspace-view-config.js').WorkspaceRegionViewsInput} spec
 */
export function renderContentViewHtml (spec) {
  return renderWorkspaceRegionViewsHtml('content', spec)
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
  const prevIdx = parseInt(region.dataset.activePaneIndex || '0', 10)
  if (prevIdx === idx) return
  const hi = 'var(--sapHighlightColor,#0070f2)'
  const mute = 'var(--sapContent_LabelColor,#6a6d70)'
  const text = 'var(--sapTextColor,#333)'
  /* tabs-at-top 时 active 边框在底，tabs-at-bottom 时在顶；按 tab-bar 的 class 判定一次 */
  const tabBar = directChildByClass(region, 'cmx-ws-region-tabs-top') || directChildByClass(region, 'cmx-ws-region-tabs-bottom')
  const body = directChildByClass(region, 'cmx-ws-region-body')
  const tabsAtTop = tabBar?.classList.contains('cmx-ws-region-tabs-top') || false
  const syncBtn = (b, on) => {
    if (!(b instanceof HTMLElement)) return
    b.style.color = on ? text : mute
    if (tabsAtTop) {
      b.style.borderBottomColor = on ? hi : 'transparent'
    } else {
      b.style.borderTopColor = on ? hi : 'transparent'
    }
    b.style.fontWeight = on ? '600' : '400'
  }
  const prevBtn = directIndexedChild(tabBar, 'cmx-ws-tab-btn', prevIdx)
  const nextBtn = directIndexedChild(tabBar, 'cmx-ws-tab-btn', idx)
  syncBtn(prevBtn, false)
  syncBtn(nextBtn || btn, true)

  const prevPane = directIndexedChild(body, 'cmx-ws-tab-pane', prevIdx)
  const nextPane = directIndexedChild(body, 'cmx-ws-tab-pane', idx)
  if (prevPane instanceof HTMLElement) prevPane.style.display = 'none'
  if (nextPane instanceof HTMLElement) nextPane.style.display = 'flex'
  region.dataset.activePaneIndex = String(idx)

  /* content region 切换 view 时，按目标 tab 的 data-hide-property / data-sync-property-view
     派发事件，让 portal-app 联动右侧 property 栏显隐和内部 tab 切换。 */
  if (region.getAttribute('data-cmx-ws-region') === 'content') {
    const hideProperty = btn.hasAttribute('data-hide-property')
    const syncPropertyView = btn.getAttribute('data-sync-property-view') || ''
    region.dispatchEvent(new CustomEvent('portal-content-view-change', {
      bubbles: true,
      composed: true,
      detail: { viewIndex: idx, hideProperty, syncPropertyView },
    }))
  }
}

/**
 * @param {Element} parent
 * @param {string} className
 * @returns {HTMLElement|null}
 */
function directChildByClass (parent, className) {
  for (const child of parent.children) {
    if (child instanceof HTMLElement && child.classList.contains(className)) return child
  }
  return null
}

/**
 * @param {Element|null|undefined} parent
 * @param {string} className
 * @param {number} index
 * @returns {HTMLElement|null}
 */
function directIndexedChild (parent, className, index) {
  if (!(parent instanceof Element)) return null
  const key = String(index)
  for (const child of parent.children) {
    if (child instanceof HTMLElement && child.classList.contains(className) && child.getAttribute('data-pane-index') === key) return child
  }
  return null
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
