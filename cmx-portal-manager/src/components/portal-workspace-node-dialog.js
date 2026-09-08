/**
 * <portal-workspace-node-dialog> — 工作区节点（WorkspaceConfig）可视化定义对话框。
 *
 * 移植自 CMXHTMLDesigner/src/components/designer-app/designer-workspace-node-dialog.js。
 * 改动：① 元素/类名 portal- 前缀；② import 重映射到 Portal 等价依赖；③ JSON 源码 Tab
 * 改用 Portal 的 codemirror-json（json() 语言 + cmxJsonTheme）；④ 内置轻量 html_page 选择器
 * （基于 GET /api/html-pages，Portal 无 multi-pages 对话框）。
 *
 * 数据结构：节点根 `{ id, name, icon, details, workspace }`；`workspace` 含区域键
 * （prepare / content / explorer / property / bottom / floatview / model / inner / embed），每个区域为
 * `{ caption?, icon?, views: View[], width?, height? }`（width/height 仅 prepare 使用）。
 * 单个 View：`{ id?, tabLabel?, type, icon?, html_page?, data? }`。
 *
 * 可选注入 `setHtmlPagePicker(fn)`：自定义 html_page 选择器；不注入时用内置轻量选择器。
 */
import {
  listWorkspaceNodes,
  getWorkspaceNode,
  saveWorkspaceNode,
  deleteWorkspaceNode,
} from '../api/workspace-nodes-api.js'
import { updateMenu } from '../api/menu-api.js'
import { apiFetch } from 'cmx-ui5-runtime/api-client'
import { loadCodeMirrorJsonBundle, cmxJsonTheme } from '../lib/codemirror-json.js'
import { openDialogCentered } from '../lib/dialog-center.js'
import { escAttr, escHtml } from '../lib/escape.js'
import { CmxFloatingDialog } from 'cmx-data-comp'

const VIEW_TYPES = [
  { value: 'placeholder',  label: '占位（placeholder）' },
  { value: 'html_pages',   label: 'HTML 页面（html_pages）' },
  { value: 'native_pages', label: '原生页面（native_pages）' },
  { value: 'html',         label: '原生 HTML 片段（html）' },
  { value: 'iframe',       label: '内嵌 iframe（iframe）' },
  { value: 'link',         label: '外链 URL（link）' },
  { value: 'json',         label: 'JSON 显示（json）' },
  { value: 'code',         label: '代码块（code）' },
  { value: 'markdown',     label: 'Markdown（markdown）' },
  { value: 'split',        label: '左右分栏（split）' },
  { value: 'menu-pages',   label: '菜单页面 iframe（menu-pages）' },
]

const REGION_KEYS = /** @type {const} */ ([
  { key: 'prepare',   label: '准备对话框（prepare）',  defaultIcon: 'sys-help' },
  { key: 'content',   label: '主内容区（content）',    defaultIcon: 'document' },
  { key: 'explorer',  label: '侧栏区（explorer）',     defaultIcon: 'folder-blank' },
  { key: 'property',  label: '属性区（property）',     defaultIcon: 'detail-view' },
  { key: 'bottom',    label: '底部区（bottom）',       defaultIcon: 'log' },
  { key: 'floatview', label: '浮动视图（floatview）',  defaultIcon: 'popup-window' },
  { key: 'model',     label: '共享模型（model）',      defaultIcon: 'database' },
  { key: 'inner',     label: '内部对话框（inner）',    defaultIcon: 'form' },
  { key: 'embed',     label: '内嵌视图（embed）',      defaultIcon: 'add-document' },
])

const SAFE_ID = /^[a-zA-Z0-9._-]{1,128}$/
const SAFE_ICON = /^[a-zA-Z][a-zA-Z0-9_-]*$/

function emptyRegion () {
  return { caption: '', icon: '', views: [], width: '', height: '' }
}
function emptyWorkspace () {
  return {
    content: emptyRegion(),
    explorer: emptyRegion(),
    property: emptyRegion(),
    bottom: emptyRegion(),
    prepare: emptyRegion(),
    floatview: emptyRegion(),
    model: emptyRegion(),
    inner: emptyRegion(),
    embed: emptyRegion(),
  }
}
function emptyView () {
  return { id: '', tabLabel: '', type: 'placeholder', icon: '', html_page: '', native_page: '', view: '', props: {}, data: {} }
}

/* ── 把宽松输入收敛为 `{caption, icon, views[], width?, height?}` 的可编辑结构 ── */
function normalizeRegionForEdit (raw) {
  if (raw == null) return emptyRegion()
  if (Array.isArray(raw)) {
    return { caption: '', icon: '', views: raw.map(normalizeViewForEdit), width: '', height: '' }
  }
  if (typeof raw === 'object') {
    const o = /** @type {Record<string, unknown>} */ (raw)
    if (Array.isArray(o.views)) {
      return {
        caption: typeof o.caption === 'string' ? o.caption : '',
        icon: typeof o.icon === 'string' ? o.icon : '',
        views: o.views.map(normalizeViewForEdit),
        width: typeof o.width === 'string' ? o.width : '',
        height: typeof o.height === 'string' ? o.height : '',
      }
    }
    return { caption: '', icon: '', views: [normalizeViewForEdit(o)], width: '', height: '' }
  }
  return emptyRegion()
}
function normalizeViewForEdit (raw) {
  const v = emptyView()
  if (!raw || typeof raw !== 'object') return v
  const o = /** @type {Record<string, unknown>} */ (raw)
  if (typeof o.id === 'string') v.id = o.id
  if (typeof o.tabLabel === 'string') v.tabLabel = o.tabLabel
  if (typeof o.type === 'string') v.type = o.type
  if (typeof o.icon === 'string') v.icon = o.icon
  if (typeof o.html_page === 'string') v.html_page = o.html_page
  if (typeof o.native_page === 'string') v.native_page = o.native_page
  else if (typeof o.nativePageId === 'string') v.native_page = o.nativePageId
  if (typeof o.view === 'string') v.view = o.view
  if (o.props && typeof o.props === 'object' && !Array.isArray(o.props)) v.props = /** @type {Record<string, unknown>} */ (o.props)
  if (o.data && typeof o.data === 'object' && !Array.isArray(o.data)) {
    v.data = /** @type {Record<string, unknown>} */ (o.data)
    if (!v.html_page && typeof v.data.html_page === 'string') v.html_page = v.data.html_page
    if (!v.native_page && typeof v.data.native_page === 'string') v.native_page = v.data.native_page
    if (!v.native_page && typeof v.data.nativePageId === 'string') v.native_page = v.data.nativePageId
    if (!v.view && typeof v.data.view === 'string') v.view = v.data.view
    if (Object.keys(v.props).length === 0 && v.data.props && typeof v.data.props === 'object' && !Array.isArray(v.data.props)) {
      v.props = /** @type {Record<string, unknown>} */ (v.data.props)
    }
  }
  return v
}

/** 序列化时清空 placeholder/空字符串字段，避免噪声 */
function serializeWorkspace (ws) {
  const out = {}
  for (const region of REGION_KEYS) {
    const r = ws[region.key]
    if (!r || !Array.isArray(r.views) || r.views.length === 0) continue
    const wrap = {}
    if (r.caption) wrap.caption = r.caption
    if (r.icon) wrap.icon = r.icon
    if (region.key === 'prepare') {
      if (r.width) wrap.width = r.width
      if (r.height) wrap.height = r.height
    }
    wrap.views = r.views.map(serializeView)
    out[region.key] = wrap
  }
  return out
}
function serializeView (v) {
  const out = { type: v.type || 'placeholder' }
  if (v.id) out.id = v.id
  if (v.tabLabel) out.tabLabel = v.tabLabel
  if (v.icon) out.icon = v.icon
  if (out.type === 'html_pages') {
    if (v.html_page) out.html_page = v.html_page
    if (v.props && typeof v.props === 'object' && !Array.isArray(v.props) && Object.keys(v.props).length > 0) out.props = v.props
  }
  if (out.type === 'native_pages') {
    if (v.native_page) out.native_page = v.native_page
    if (v.view && v.view !== 'default') out.view = v.view
    if (v.props && typeof v.props === 'object' && !Array.isArray(v.props) && Object.keys(v.props).length > 0) out.props = v.props
  }
  /* data：仅当存在键值时附带；对 html_pages 视图，html_page 是顶层字段足够 */
  if (v.data && typeof v.data === 'object' && Object.keys(v.data).length > 0) {
    const cleaned = { ...v.data }
    for (const k of ['htmlPage', 'htmlPageId', 'htmlPageRunnableDoc',
      'htmlPagePreviewStructure', 'htmlPageExecutableScripts',
      'htmlPagePreviewError', 'htmlPageLoadError']) delete cleaned[k]
    if (Object.keys(cleaned).length > 0) out.data = cleaned
  }
  return out
}

/** 解析 JSON 对象文本；解析失败或非 plain object（数组/标量）返回 null。 */
function parseJsonObjText (txt) {
  try {
    const j = JSON.parse(txt)
    return (j && typeof j === 'object' && !Array.isArray(j)) ? /** @type {Record<string, unknown>} */ (j) : null
  } catch {
    return null
  }
}

export class PortalWorkspaceNodeDialog extends HTMLElement {
  constructor () {
    super()
    this.attachShadow({ mode: 'open' })
    /** @type {{ id: string, name: string, icon: string, details: string, workspace: ReturnType<typeof emptyWorkspace> }} */
    this._model = { id: '', name: '', icon: '', details: '', workspace: emptyWorkspace() }
    this._activeRegion = 'content'
    this._activeViewIndex = 0
    /** @type {((onPick: (page: { id: string, name: string }) => void) => void) | null} */
    this._htmlPagePicker = null
    /** @type {((onPick: (page: { id: string, name: string }) => void) => void) | null} */
    this._nativePagePicker = null
    /** @type {{ id: string, name: string, details: string, updatedAt: string }[]} */
    this._existingNodes = []
    /** @type {'visual'|'json'} */
    this._activeTab = 'visual'
    /** @type {import('@codemirror/view').EditorView | null} */
    this._jsonView = null
    this._jsonStatusTimer = null
    /** 'menu-node'（保存到 cmx_menu）/ 'workspace-node'（保存到 /api/workspace-nodes，默认） */
    this._mode = 'workspace-node'
    /** 菜单节点模式下，cmx_menu 主键（用于 /api/menu/update） */
    this._cmxId = ''
    /** 菜单节点模式下，原节点需保留的 definition 字段（workspace 由弹框编辑覆盖） */
    this._menuExtras = {}
  }

  /** 注入 html_page 单选选择器（可选；不注入时用内置轻量选择器）。 */
  setHtmlPagePicker (fn) {
    this._htmlPagePicker = typeof fn === 'function' ? fn : null
  }

  /** 注入 native_page 单选选择器（可选；不注入时用内置轻量选择器）。 */
  setNativePagePicker (fn) {
    this._nativePagePicker = typeof fn === 'function' ? fn : null
  }

  connectedCallback () {
    this._render()
    this._wire()
  }

  /** 打开对话框；可选 `id` 预加载已有节点。 */
  async open (id) {
    this._mode = 'workspace-node'
    this._cmxId = ''
    this._menuExtras = {}
    if (id) {
      try {
        const row = await getWorkspaceNode(id)
        this._model = {
          id: row.id || '',
          name: row.name || '',
          icon: typeof row.icon === 'string' ? row.icon : '',
          details: row.details || '',
          workspace: this._normalizeWorkspaceForEdit(row.workspace || {}),
        }
      } catch (err) {
        this._setStatus((err instanceof Error ? err.message : String(err)), true)
        this._model = { id: '', name: '', icon: '', details: '', workspace: emptyWorkspace() }
      }
    } else {
      this._model = { id: '', name: '', icon: '', details: '', workspace: emptyWorkspace() }
    }
    this._activeRegion = 'prepare'
    this._activeViewIndex = 0
    await this._reloadExistingNodes()
    /* 回到可视化 Tab（首次打开也统一） */
    this._activeTab = 'visual'
    const sr = this.shadowRoot
    sr.querySelectorAll('.top-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === 'visual'))
    sr.getElementById('paneVisual').classList.add('active')
    sr.getElementById('paneJson').classList.remove('active')
    this._renderAll()
    openDialogCentered(this._dlg())
  }

  _normalizeWorkspaceForEdit (ws) {
    const out = emptyWorkspace()
    const src = ws && typeof ws === 'object' ? ws : {}
    for (const region of REGION_KEYS) {
      /* floatview 兼容菜单 JSON 别名 `float`（运行时 workspace-node.js 同样把 float 归一到 floatview）。 */
      const raw = region.key === 'floatview' && src.floatview == null && src.float != null
        ? src.float
        : src[region.key]
      out[region.key] = normalizeRegionForEdit(raw)
    }
    return out
  }

  /**
   * 直接用一个「菜单节点对象」打开（区别于 open(id) 从 nodes.json 库读取）。
   * 左侧菜单树右键「编辑」用：菜单项的 workspace 内联在 explorer-menu.json 里，
   * 故直接 seed 模型，而不查独立节点库。
   * @param {Record<string, unknown>} node 菜单节点（含 id/name/caption/icon/workspace 等）
   */
  async openWithNode (node) {
    const n = node && typeof node === 'object' ? node : {}
    const ws = (n.workspace && typeof n.workspace === 'object') ? n.workspace : {}
    this._model = {
      id: typeof n.id === 'string' ? n.id : String(n.id ?? ''),
      name: typeof n.name === 'string' ? n.name : (typeof n.caption === 'string' ? n.caption : ''),
      icon: typeof n.icon === 'string' ? n.icon : '',
      details: typeof n.details === 'string' ? n.details : '',
      workspace: this._normalizeWorkspaceForEdit(ws),
    }
    // 菜单节点模式：保存时走 /api/menu/update 写回 cmx_menu.definition
    this._mode = 'menu-node'
    this._cmxId = typeof n._cmxId === 'string' ? n._cmxId : ''
    // 保留原节点 extras，_save 时合回 definition（workspace 由弹框编辑覆盖）
    this._menuExtras = {
      caption: n.caption,
      expanded: n.expanded,
      type: n.type,
      dialogspace: n.dialogspace,
      name: n.name,
    }
    this._activeRegion = 'prepare'
    this._activeViewIndex = 0
    await this._reloadExistingNodes()
    this._activeTab = 'visual'
    const sr = this.shadowRoot
    sr.querySelectorAll('.top-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === 'visual'))
    sr.getElementById('paneVisual').classList.add('active')
    sr.getElementById('paneJson').classList.remove('active')
    this._renderAll()
    openDialogCentered(this._dlg())
  }

  async _reloadExistingNodes () {
    try {
      const r = await listWorkspaceNodes()
      this._existingNodes = Array.isArray(r.items) ? r.items : []
    } catch {
      this._existingNodes = []
    }
  }

  _dlg () { return this.shadowRoot.getElementById('wsNodeDlg') }

  _setStatus (text, isError = false) {
    const strip = this.shadowRoot.getElementById('wsNodeStrip')
    if (!strip) return
    strip.replaceChildren()
    if (!text) { strip.hidden = true; return }
    strip.hidden = false
    strip.design = isError ? 'Negative' : 'Information'
    strip.append(document.createTextNode(text))
  }

  _render () {
    const typeOpts = VIEW_TYPES.map(t =>
      `<ui5-option value="${escAttr(t.value)}">${escHtml(t.label)}</ui5-option>`).join('')
    const regionTabs = REGION_KEYS.map(r =>
      `<button class="region-tab" data-region="${r.key}">${escHtml(r.label)} <span class="region-count" data-region-count="${r.key}">0</span></button>`).join('')

    /* eslint-disable-next-line no-restricted-syntax -- 静态字面量；动态值 typeOpts/regionTabs 已转义 */
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        /* ── Neo 科技风：对话框外壳（玻璃 + 渐变 + 青紫辉光） ── */
        ui5-dialog#wsNodeDlg {
          --_ui5_popup_default_header_height: 3rem;
          border-radius: 14px;
        }
        ui5-dialog#wsNodeDlg::part(root) {
          border: 1px solid color-mix(in srgb, var(--neo-cyan, #00b4d8) 30%, var(--sapGroup_TitleBorderColor, #d9d9d9));
          border-radius: 14px;
          box-shadow:
            0 24px 70px -24px color-mix(in srgb, var(--neo-violet, var(--neo-violet, #7c3aed)) 55%, transparent),
            0 8px 30px -12px rgba(0,0,0,.35),
            inset 0 0 0 1px color-mix(in srgb, var(--sapList_Background, #ffffff) 6%, transparent);
          overflow: hidden;
        }
        ui5-dialog#wsNodeDlg::part(content) { padding: 0; }
        ui5-dialog#wsNodeDlg::part(header) {
          cursor: move;
          padding: 0;
          border-bottom: 1px solid color-mix(in srgb, var(--neo-cyan, #00b4d8) 26%, var(--sapPageHeader_BorderColor, #ddd));
          background:
            radial-gradient(ellipse 80% 200% at 0% -60%, color-mix(in srgb, var(--neo-violet, var(--neo-violet, #7c3aed)) 26%, transparent), transparent 60%),
            radial-gradient(ellipse 70% 180% at 100% -50%, color-mix(in srgb, var(--neo-cyan, #00b4d8) 24%, transparent), transparent 58%),
            linear-gradient(100deg,
              color-mix(in srgb, var(--sapObjectHeader_Background, #fff) 90%, var(--neo-violet, var(--neo-violet, #7c3aed)) 10%),
              color-mix(in srgb, var(--sapObjectHeader_Background, #fff) 92%, var(--neo-cyan, #00b4d8) 8%));
        }
        ui5-dialog#wsNodeDlg::part(footer) {
          padding: 0;
          border-top: 1px solid color-mix(in srgb, var(--neo-cyan, #00b4d8) 18%, var(--sapPageHeader_BorderColor, #ddd));
          background: linear-gradient(180deg,
            color-mix(in srgb, var(--sapObjectHeader_Background, #fafafa) 94%, var(--neo-cyan, #00b4d8) 6%),
            var(--sapObjectHeader_Background, #fafafa));
        }

        /* 头部：orbit 图标 + 单行标题 */
        .ws-dlg-header {
          display: flex; align-items: center; gap: 11px;
          padding: 8px 16px; width: 100%; box-sizing: border-box;
        }
        .ws-dlg-header .hdr-orbit {
          width: 30px; height: 30px; border-radius: 9px; flex: 0 0 auto;
          display: inline-flex; align-items: center; justify-content: center; color: #fff;
          background: linear-gradient(135deg, var(--neo-cyan, #00b4d8), color-mix(in srgb, var(--neo-violet, var(--neo-violet, #7c3aed)) 46%, var(--neo-cyan, #00b4d8)));
          box-shadow: 0 0 14px color-mix(in srgb, var(--neo-cyan, #00b4d8) 30%, transparent), inset 0 0 0 1px rgba(255,255,255,.25);
        }
        .ws-dlg-header .hdr-orbit ui5-icon { width: .95rem; height: .95rem; color: #fff; }
        .ws-dlg-header .hdr-title {
          font-size: 14px; font-weight: 750; line-height: 1.2; color: var(--sapTitleColor, #1d2d3e);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0;
        }
        .ws-dlg-header .hdr-sub {
          font-size: 11px; font-weight: 600; letter-spacing: .03em; color: var(--sapContent_LabelColor, #6a6d70);
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; white-space: nowrap; flex: 0 0 auto;
        }
        .ws-dlg-header .hdr-sub::before { content: '· '; opacity: .6; }

        .ws-dlg-body {
          display: flex;
          flex-direction: column;
          width: 80vw; max-width: 1100px;
          height: 70vh; max-height: 720px;
          min-width: 720px; min-height: 480px;
          background:
            radial-gradient(ellipse 100% 60% at 0% 0%, color-mix(in srgb, var(--neo-violet, var(--neo-violet, #7c3aed)) 5%, transparent), transparent 55%),
            radial-gradient(ellipse 90% 55% at 100% 100%, color-mix(in srgb, var(--neo-cyan, #00b4d8) 4%, transparent), transparent 55%),
            var(--sapBackgroundColor, #fff);
        }

        /* 顶部大 Tab（可视化 / JSON） */
        .top-tabs {
          display: flex; align-items: stretch; gap: 4px;
          border-bottom: 1px solid color-mix(in srgb, var(--neo-cyan, #00b4d8) 16%, var(--sapPageHeader_BorderColor, #ddd));
          background: color-mix(in srgb, var(--sapObjectHeader_Background, #fafafa) 70%, transparent);
          padding: 6px 10px 0;
        }
        .top-tab {
          padding: 8px 16px; position: relative;
          background: transparent; border: none; cursor: pointer;
          font-size: 13px; font-weight: 600; color: var(--sapContent_LabelColor, #6a6d70);
          border-radius: 8px 8px 0 0;
          display: inline-flex; align-items: center; gap: 6px;
          transition: color .15s ease, background .15s ease;
        }
        .top-tab ui5-icon { width: .85rem; height: .85rem; }
        .top-tab:hover { color: var(--sapTextColor, #333); background: color-mix(in srgb, var(--neo-cyan, #00b4d8) 6%, transparent); }
        .top-tab.active {
          color: var(--neo-cyan, #0070f2);
          background: linear-gradient(180deg, color-mix(in srgb, var(--neo-cyan, #00b4d8) 12%, transparent), transparent);
        }
        .top-tab.active::after {
          content: ''; position: absolute; left: 10px; right: 10px; bottom: 0; height: 2px; border-radius: 2px 2px 0 0;
          background: linear-gradient(90deg, var(--neo-cyan, #0070f2), color-mix(in srgb, var(--neo-violet, var(--neo-violet, #7c3aed)) 60%, var(--neo-cyan, #00b4d8)));
          box-shadow: 0 0 10px color-mix(in srgb, var(--neo-cyan, #00b4d8) 45%, transparent);
        }

        .pane { flex: 1 1 auto; min-height: 0; display: none; }
        .pane.active { display: grid; }

        .pane-visual {
          grid-template-columns: 272px 1fr;
          grid-template-rows: auto 1fr;
        }
        .pane-json {
          grid-template-columns: 1fr;
          grid-template-rows: auto 1fr;
        }

        /* 顶部元信息条 */
        .meta-bar {
          grid-column: 1 / span 2;
          padding: 12px 14px;
          border-bottom: 1px solid color-mix(in srgb, var(--neo-cyan, #00b4d8) 12%, var(--sapPageHeader_BorderColor, #ddd));
          display: grid;
          grid-template-columns: 68px 1fr 68px 1fr;
          gap: 9px 12px;
          align-items: center;
          background: linear-gradient(120deg,
            color-mix(in srgb, var(--neo-cyan, #00b4d8) 5%, var(--sapObjectHeader_Background, #fafafa)),
            color-mix(in srgb, var(--neo-violet, var(--neo-violet, #7c3aed)) 4%, var(--sapObjectHeader_Background, #fafafa)));
        }
        .meta-bar ui5-input, .meta-bar ui5-select { width: 100%; }
        .meta-row-label {
          font-size: 11px; font-weight: 700; letter-spacing: .02em;
          color: var(--sapContent_LabelColor, #6a6d70); text-align: right;
        }

        /* 左侧区域导航 */
        .left-pane {
          border-right: 1px solid color-mix(in srgb, var(--neo-cyan, #00b4d8) 12%, var(--sapPageHeader_BorderColor, #ddd));
          background: color-mix(in srgb, var(--sapObjectHeader_Background, #fafafa) 55%, transparent);
          overflow-y: auto;
          padding: 10px 9px;
        }
        .right-pane { overflow: auto; padding: 14px 16px; min-width: 0; }

        /* JSON 工具条 + 编辑器 */
        .json-toolbar {
          display: flex; align-items: center; gap: 6px;
          padding: 8px 14px;
          border-bottom: 1px solid color-mix(in srgb, var(--neo-cyan, #00b4d8) 12%, var(--sapPageHeader_BorderColor, #ddd));
          background: color-mix(in srgb, var(--sapObjectHeader_Background, #fafafa) 60%, transparent);
        }
        .json-toolbar .spacer { flex: 1 1 auto; }
        .json-host {
          flex: 1 1 auto; min-height: 0;
          overflow: hidden;
          margin: 10px; border-radius: 10px;
          border: 1px solid color-mix(in srgb, var(--neo-cyan, #00b4d8) 16%, var(--sapGroup_TitleBorderColor, #d9d9d9));
          background: var(--sapField_Background, var(--sapBaseColor, #fff));
          box-shadow: inset 0 1px 3px rgba(0,0,0,.04);
        }
        .json-host .cm-editor {
          height: 100%;
          font-size: 12px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Courier New', monospace;
        }
        .json-host .cm-scroller { overflow: auto !important; }

        .json-wrap {
          display: flex; flex-direction: column;
          height: 100%; min-height: 0;
        }

        .region-list-title {
          font-size: 10px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase;
          color: color-mix(in srgb, var(--neo-cyan, #00b4d8) 60%, var(--sapContent_LabelColor, #6a6d70));
          padding: 2px 6px 8px 6px;
          display: flex; align-items: center; gap: 6px;
        }
        .region-list-title::before {
          content: ''; width: 12px; height: 2px; border-radius: 2px;
          background: linear-gradient(90deg, var(--neo-cyan, #00b4d8), var(--neo-violet, var(--neo-violet, #7c3aed)));
        }
        .region-tab {
          display: flex; align-items: center; justify-content: space-between; gap: 8px;
          width: 100%; padding: 8px 10px; margin-bottom: 4px;
          border: 1px solid transparent; border-radius: 8px;
          background: transparent; cursor: pointer; text-align: left;
          font-size: 12.5px; font-weight: 550; color: var(--sapTextColor, #333);
          transition: background .14s ease, border-color .14s ease, box-shadow .14s ease, transform .1s ease;
        }
        .region-tab:hover {
          background: color-mix(in srgb, var(--neo-cyan, #00b4d8) 7%, var(--sapHoverColor, #eee));
          border-color: color-mix(in srgb, var(--neo-cyan, #00b4d8) 18%, transparent);
        }
        .region-tab.active {
          background: linear-gradient(90deg,
            color-mix(in srgb, var(--neo-cyan, #00b4d8) 14%, var(--sapList_Background, #fff)),
            color-mix(in srgb, var(--neo-violet, var(--neo-violet, #7c3aed)) 7%, var(--sapList_Background, #fff)));
          border-color: color-mix(in srgb, var(--neo-cyan, #00b4d8) 45%, transparent);
          color: var(--sapTitleColor, #1d2d3e); font-weight: 700;
          box-shadow: inset 3px 0 0 var(--neo-cyan, #0070f2), 0 0 14px color-mix(in srgb, var(--neo-cyan, #00b4d8) 12%, transparent);
        }
        .region-count {
          background: color-mix(in srgb, var(--sapContent_LabelColor, #6a6d70) 22%, transparent);
          color: var(--sapContent_LabelColor, #6a6d70); font-size: 10px; font-weight: 700; min-width: 20px; height: 18px;
          border-radius: 9px; display: inline-flex; align-items: center; justify-content: center;
          padding: 0 6px; flex: 0 0 auto; transition: background .14s ease, color .14s ease;
        }
        .region-tab.active .region-count {
          background: linear-gradient(135deg, var(--neo-cyan, #0070f2), color-mix(in srgb, var(--neo-violet, var(--neo-violet, #7c3aed)) 45%, var(--neo-cyan, #00b4d8)));
          color: #fff; box-shadow: 0 0 8px color-mix(in srgb, var(--neo-cyan, #00b4d8) 30%, transparent);
        }

        /* 区域元信息栅格（卡片化） */
        .region-meta-grid {
          display: grid; grid-template-columns: 64px 1fr 64px 1fr; gap: 9px 12px;
          margin-bottom: 14px; align-items: center;
          padding: 12px; border-radius: 10px;
          border: 1px solid color-mix(in srgb, var(--neo-cyan, #00b4d8) 10%, var(--sapGroup_TitleBorderColor, #d9d9d9));
          background: color-mix(in srgb, var(--sapTile_Background, var(--sapObjectHeader_Background, #fafafa)) 96%, var(--neo-cyan, #00b4d8) 4%);
        }
        .region-meta-grid ui5-input { width: 100%; }
        .region-meta-grid .full { grid-column: 1 / span 4; }

        .views-section-title {
          font-size: 12.5px; font-weight: 700; color: var(--sapTitleColor, #1d2d3e);
          margin: 4px 0 10px 0; padding-bottom: 7px;
          border-bottom: 1px solid color-mix(in srgb, var(--neo-cyan, #00b4d8) 14%, var(--sapPageHeader_BorderColor, #ddd));
          display: flex; align-items: center; justify-content: space-between; gap: 8px;
        }
        .views-section-title > span { display: inline-flex; align-items: center; gap: 7px; }
        .views-section-title > span::before {
          content: ''; width: 4px; height: 14px; border-radius: 2px; flex: 0 0 auto;
          background: linear-gradient(180deg, var(--neo-cyan, #00b4d8), var(--neo-violet, var(--neo-violet, #7c3aed)));
        }

        .views-table {
          width: 100%; border-collapse: separate; border-spacing: 0; font-size: 12.5px;
          border: 1px solid color-mix(in srgb, var(--neo-cyan, #00b4d8) 12%, var(--sapGroup_TitleBorderColor, #d9d9d9));
          border-radius: 10px; overflow: hidden;
        }
        .views-table th, .views-table td {
          border-bottom: 1px solid color-mix(in srgb, var(--neo-cyan, #00b4d8) 7%, var(--sapPageHeader_BorderColor, #eee));
          padding: 8px 10px; text-align: left; vertical-align: middle;
        }
        .views-table tbody tr:last-child td { border-bottom: none; }
        .views-table th {
          background: color-mix(in srgb, var(--neo-cyan, #00b4d8) 6%, var(--sapObjectHeader_Background, #fafafa));
          font-size: 10.5px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase;
          color: var(--sapContent_LabelColor, #6a6d70);
        }
        .views-table tbody tr, .views-table tr { cursor: pointer; transition: background .12s ease; }
        .views-table tbody tr:hover:not(.active) { background: color-mix(in srgb, var(--neo-cyan, #00b4d8) 5%, var(--sapHoverColor, #f5f5f5)); }
        .views-table tr.active {
          background: linear-gradient(90deg,
            color-mix(in srgb, var(--neo-cyan, #00b4d8) 12%, var(--sapList_Background, #fff)),
            color-mix(in srgb, var(--neo-violet, var(--neo-violet, #7c3aed)) 5%, var(--sapList_Background, #fff)));
          box-shadow: inset 3px 0 0 var(--neo-cyan, #0070f2);
        }
        .col-idx { width: 34px; text-align: center; color: var(--sapContent_LabelColor, #6a6d70); font-family: ui-monospace, Menlo, Consolas, monospace; }
        .col-actions { width: 60px; text-align: center; }

        /* 当前视图编辑卡片 */
        .view-detail-form {
          display: grid; grid-template-columns: 120px 1fr; gap: 9px 12px;
          margin-top: 14px; padding: 14px;
          background: color-mix(in srgb, var(--sapTile_Background, var(--sapObjectHeader_Background, #fafafa)) 96%, var(--neo-violet, var(--neo-violet, #7c3aed)) 4%);
          border: 1px solid color-mix(in srgb, var(--neo-violet, var(--neo-violet, #7c3aed)) 14%, var(--sapGroup_TitleBorderColor, #d9d9d9));
          border-radius: 10px;
          box-shadow: 0 6px 22px -16px color-mix(in srgb, var(--neo-violet, #7c3aed) 60%, transparent);
        }
        .view-detail-form .full { grid-column: 1 / span 2; }
        .view-detail-form ui5-input,
        .view-detail-form ui5-select,
        .view-detail-form ui5-textarea { width: 100%; }
        .label-r { font-size: 11.5px; font-weight: 600; color: var(--sapContent_LabelColor, #6a6d70); text-align: right; align-self: center; }
        .empty-hint {
          padding: 28px 24px; text-align: center; color: var(--sapContent_LabelColor, #6a6d70);
          font-size: 13px; border: 1px dashed color-mix(in srgb, var(--neo-cyan, #00b4d8) 24%, var(--sapPageHeader_BorderColor, #ddd));
          border-radius: 10px;
          background: color-mix(in srgb, var(--neo-cyan, #00b4d8) 3%, var(--sapObjectHeader_Background, #fafafa));
        }
        .picker-row { display: flex; gap: 6px; align-items: center; }
        .picker-row ui5-input { flex: 1 1 auto; }
        .strip-wrap { padding: 0 14px; flex: 1 1 auto; min-width: 0; }
        ui5-message-strip[hidden] { display: none; }

        /* footer slot 撑满，按钮行靠右 */
        ui5-dialog#wsNodeDlg [slot="footer"] { display: flex; flex-direction: column; width: 100%; box-sizing: border-box; }
        .footer-row {
          display: flex; gap: 8px; align-items: center; justify-content: flex-end;
          width: 100%; box-sizing: border-box;
          padding: 8px 14px;
        }
        .footer-row .spacer { flex: 1 1 auto; }
        /* 强调保存按钮：科技辉光边框 + 高对比文字（不覆盖 UI5 内部背景变量，避免亮色下文字看不清） */
        #wsNodeSaveBtn {
          --_ui5_button_focus_offset: 1px;
          box-shadow: 0 0 0 1px color-mix(in srgb, var(--neo-cyan, #00b4d8) 55%, transparent), 0 2px 10px -2px color-mix(in srgb, var(--neo-cyan, #00b4d8) 40%, transparent);
          border-radius: 8px;
        }

        /* 内置 html_page / native_page 选择器对话框 */
        #hpPickDlg::part(root), #npPickDlg::part(root) {
          border: 1px solid color-mix(in srgb, var(--neo-cyan, #00b4d8) 26%, var(--sapGroup_TitleBorderColor, #d9d9d9));
          border-radius: 12px;
          box-shadow: 0 18px 50px -20px color-mix(in srgb, var(--neo-violet, #7c3aed) 50%, transparent), 0 6px 20px -10px rgba(0,0,0,.3);
        }
        .hp-pick-body { display: flex; flex-direction: column; width: 60vw; max-width: 640px; height: 60vh; max-height: 520px; }
        .hp-pick-search { padding: 10px 12px; border-bottom: 1px solid color-mix(in srgb, var(--neo-cyan, #00b4d8) 14%, var(--sapPageHeader_BorderColor, #ddd)); }
        .hp-pick-search ui5-input { width: 100%; }
        .hp-pick-list { flex: 1 1 auto; min-height: 0; overflow: auto; }
      </style>

      <ui5-dialog id="wsNodeDlg" resizable draggable>
        <div slot="header" class="ws-dlg-header">
          <span class="hdr-orbit"><ui5-icon name="tree"></ui5-icon></span>
          <span class="hdr-title">工作区节点编辑器</span>
          <span class="hdr-sub">workspace-node</span>
        </div>

        <div class="ws-dlg-body">
          <div class="top-tabs" role="tablist">
            <button class="top-tab active" data-tab="visual" role="tab">
              <ui5-icon name="edit"></ui5-icon>可视化编辑
            </button>
            <button class="top-tab" data-tab="json" role="tab">
              <ui5-icon name="source-code"></ui5-icon>JSON 源码
            </button>
          </div>

          <div class="pane pane-visual active" id="paneVisual" role="tabpanel">
            <div class="meta-bar">
              <span class="meta-row-label">节点 ID</span>
              <ui5-input id="wsNodeId" placeholder="字母数字 ._- 长度 1-128"></ui5-input>
              <span class="meta-row-label">载入已有</span>
              <ui5-select id="wsNodeLoadSel">
                <ui5-option value="">— 新建 —</ui5-option>
              </ui5-select>

              <span class="meta-row-label">名称</span>
              <ui5-input id="wsNodeName" placeholder="人类可读名称"></ui5-input>
              <span class="meta-row-label">图标</span>
              <ui5-input id="wsNodeIcon" placeholder="ui5-icon name，如 folder-blank"></ui5-input>

              <span class="meta-row-label">详情</span>
              <ui5-input id="wsNodeDetails" placeholder="说明备注" class="full-row" style="grid-column: 2 / span 3;"></ui5-input>
            </div>

            <div class="left-pane">
              <div class="region-list-title">区域</div>
              ${regionTabs}
            </div>

            <div class="right-pane" id="rightPane"></div>
          </div>

          <div class="pane pane-json" id="paneJson" role="tabpanel">
            <div class="json-toolbar">
              <ui5-button id="jsonApplyBtn" design="Emphasized" icon="accept" tooltip="将源码解析并应用到可视化编辑器">应用源码</ui5-button>
              <ui5-button id="jsonRevertBtn" design="Transparent" icon="undo" tooltip="从当前模型重新生成 JSON">从模型刷新</ui5-button>
              <ui5-button id="jsonFormatBtn" design="Transparent" icon="source-code" tooltip="格式化 JSON（2 空格缩进）">格式化</ui5-button>
              <ui5-button id="jsonCopyBtn" design="Transparent" icon="copy" tooltip="复制 JSON 到剪贴板">复制</ui5-button>
              <span class="spacer"></span>
              <ui5-label id="jsonStatusLabel" wrapping-type="None" show-colon="false"></ui5-label>
            </div>
            <div class="json-wrap">
              <div id="jsonHost" class="json-host"></div>
            </div>
          </div>
        </div>

        <div slot="footer">
          <div class="strip-wrap">
            <ui5-message-strip id="wsNodeStrip" design="Information" hide-close-button hidden></ui5-message-strip>
          </div>
          <div class="footer-row">
            <span class="spacer"></span>
            <ui5-button id="wsNodeDeleteBtn" design="Transparent" icon="delete">删除</ui5-button>
            <ui5-button id="wsNodeCancelBtn" design="Transparent">取消</ui5-button>
            <ui5-button id="wsNodeSaveBtn" design="Emphasized" icon="save">保存</ui5-button>
          </div>
        </div>

        <template id="tplViewForm">
          <div class="view-detail-form" id="viewDetailForm">
            <span class="label-r">类型</span>
            <ui5-select id="vfType">${typeOpts}</ui5-select>
            <span class="label-r">标签 (tabLabel)</span>
            <ui5-input id="vfLabel" placeholder="底部 Tab 文案"></ui5-input>

            <span class="label-r">视图 ID</span>
            <ui5-input id="vfId" placeholder="可选，业务标识"></ui5-input>
            <span class="label-r">图标</span>
            <ui5-input id="vfIcon" placeholder="ui5-icon name，如 document"></ui5-input>

            <span class="label-r" id="vfHtmlPageLabel">html_page</span>
            <div class="picker-row" id="vfHtmlPageRow">
              <ui5-input id="vfHtmlPage" placeholder="点右侧按钮选择"></ui5-input>
              <ui5-button id="vfHtmlPagePickBtn" design="Default" icon="folder-blank">选择页面</ui5-button>
            </div>

            <span class="label-r" id="vfNativePageLabel">native_page</span>
            <div class="picker-row" id="vfNativePageRow">
              <ui5-input id="vfNativePage" placeholder="点右侧按钮选择"></ui5-input>
              <ui5-button id="vfNativePagePickBtn" design="Default" icon="folder-blank">选择页面</ui5-button>
            </div>
            <span class="label-r" id="vfViewLabel">view</span>
            <ui5-input id="vfView" placeholder="视图名，默认 default"></ui5-input>
            <span class="label-r" id="vfPropsLabel">props (JSON)</span>
            <ui5-textarea id="vfProps" rows="3" placeholder='可选；传给视图的 props 对象，如 {"title":"…"}'></ui5-textarea>

            <span class="label-r" id="vfDataLabel">data (JSON)</span>
            <ui5-textarea id="vfData" rows="4" placeholder='可选；类型为 html/iframe/code 等时承载具体内容，如 {"title":"…"}'></ui5-textarea>
          </div>
        </template>
      </ui5-dialog>

      <ui5-dialog id="hpPickDlg" header-text="选择 HTML 页面">
        <div class="hp-pick-body">
          <div class="hp-pick-search">
            <ui5-input id="hpPickSearch" placeholder="输入关键字过滤 id / 名称…" show-clear-icon></ui5-input>
          </div>
          <ui5-list id="hpPickList" class="hp-pick-list" mode="SingleSelect"></ui5-list>
        </div>
        <div slot="footer" class="footer-row">
          <span class="spacer"></span>
          <ui5-button id="hpPickCancelBtn" design="Transparent">取消</ui5-button>
          <ui5-button id="hpPickConfirmBtn" design="Emphasized" icon="accept">选择</ui5-button>
        </div>
      </ui5-dialog>

      <ui5-dialog id="npPickDlg" header-text="选择原生页面">
        <div class="hp-pick-body">
          <div class="hp-pick-search">
            <ui5-input id="npPickSearch" placeholder="输入关键字过滤 id / 名称…" show-clear-icon></ui5-input>
          </div>
          <ui5-list id="npPickList" class="hp-pick-list" mode="SingleSelect"></ui5-list>
        </div>
        <div slot="footer" class="footer-row">
          <span class="spacer"></span>
          <ui5-button id="npPickCancelBtn" design="Transparent">取消</ui5-button>
          <ui5-button id="npPickConfirmBtn" design="Emphasized" icon="accept">选择</ui5-button>
        </div>
      </ui5-dialog>
    `
  }

  _wire () {
    const sr = this.shadowRoot

    /* 顶部 meta */
    sr.getElementById('wsNodeId').addEventListener('input', e => {
      this._model.id = String(e.target.value || '').trim()
    })
    sr.getElementById('wsNodeName').addEventListener('input', e => {
      this._model.name = String(e.target.value || '')
    })
    sr.getElementById('wsNodeIcon').addEventListener('input', e => {
      this._model.icon = String(e.target.value || '').trim()
    })
    sr.getElementById('wsNodeDetails').addEventListener('input', e => {
      this._model.details = String(e.target.value || '')
    })

    /* 载入已有节点 */
    sr.getElementById('wsNodeLoadSel').addEventListener('change', async e => {
      const id = String(e.detail?.selectedOption?.value || '').trim()
      if (!id) return
      try {
        const row = await getWorkspaceNode(id)
        this._model = {
          id: row.id || '',
          name: row.name || '',
          icon: typeof row.icon === 'string' ? row.icon : '',
          details: row.details || '',
          workspace: this._normalizeWorkspaceForEdit(row.workspace || {}),
        }
        this._activeRegion = 'prepare'
        this._activeViewIndex = 0
        this._renderAll()
        this._setStatus(`已载入 ${id}`, false)
      } catch (err) {
        this._setStatus(err instanceof Error ? err.message : String(err), true)
      }
    })

    /* 区域切换 */
    sr.querySelectorAll('.region-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        this._activeRegion = btn.dataset.region
        this._activeViewIndex = 0
        this._renderRegionTabs()
        this._renderRightPane()
      })
    })

    /* 底部按钮 */
    sr.getElementById('wsNodeCancelBtn').addEventListener('click', () => {
      this._dlg().open = false
    })
    sr.getElementById('wsNodeSaveBtn').addEventListener('click', () => this._save())
    sr.getElementById('wsNodeDeleteBtn').addEventListener('click', () => this._delete())

    /* 顶部 Tab 切换（可视化 ↔ JSON 源码） */
    sr.querySelectorAll('.top-tab').forEach(btn => {
      btn.addEventListener('click', () => this._switchTopTab(btn.dataset.tab))
    })

    /* JSON 工具栏 */
    sr.getElementById('jsonApplyBtn').addEventListener('click', () => this._applyJsonToModel())
    sr.getElementById('jsonRevertBtn').addEventListener('click', () => this._refreshJsonFromModel())
    sr.getElementById('jsonFormatBtn').addEventListener('click', () => this._formatJsonDoc())
    sr.getElementById('jsonCopyBtn').addEventListener('click', () => this._copyJsonDoc())

    /* 内置 html_page 选择器 */
    sr.getElementById('hpPickCancelBtn').addEventListener('click', () => {
      sr.getElementById('hpPickDlg').open = false
    })
    sr.getElementById('hpPickSearch').addEventListener('input', e => {
      this._filterHtmlPageList(String(e.target.value || ''))
    })

    /* 内置 native_page 选择器 */
    sr.getElementById('npPickCancelBtn').addEventListener('click', () => {
      sr.getElementById('npPickDlg').open = false
    })
    sr.getElementById('npPickSearch').addEventListener('input', e => {
      this._filterNativePageList(String(e.target.value || ''))
    })
  }

  _renderAll () {
    this.shadowRoot.getElementById('wsNodeId').value = this._model.id
    this.shadowRoot.getElementById('wsNodeName').value = this._model.name
    this.shadowRoot.getElementById('wsNodeIcon').value = this._model.icon
    this.shadowRoot.getElementById('wsNodeDetails').value = this._model.details
    this._renderLoadSelect()
    this._renderRegionTabs()
    this._renderRightPane()
    if (this._activeTab === 'json') this._refreshJsonFromModel()
  }

  /* ── JSON Tab：CodeMirror 编辑、应用、刷新 ── */

  /** 整个对外可序列化的 JSON 文档（与 _save 的 payload 同结构，去掉 updatedAt） */
  _modelToJsonText () {
    const payload = {
      id: this._model.id || '',
      name: this._model.name || '',
      icon: this._model.icon || '',
      details: this._model.details || '',
      workspace: serializeWorkspace(this._model.workspace),
    }
    return JSON.stringify(payload, null, 2)
  }

  async _switchTopTab (tab) {
    if (tab !== 'visual' && tab !== 'json') return
    if (tab === this._activeTab) return
    this._activeTab = tab
    const sr = this.shadowRoot
    sr.querySelectorAll('.top-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab))
    sr.getElementById('paneVisual').classList.toggle('active', tab === 'visual')
    sr.getElementById('paneJson').classList.toggle('active', tab === 'json')
    if (tab === 'json') {
      await this._ensureJsonEditor()
      this._refreshJsonFromModel()
    }
  }

  async _ensureJsonEditor () {
    if (this._jsonView) return
    const host = this.shadowRoot.getElementById('jsonHost')
    if (!host) return
    let bundle
    try {
      bundle = await loadCodeMirrorJsonBundle()
    } catch {
      /* CodeMirror 加载失败：降级为原生 textarea */
      this._setupJsonTextareaFallback(host)
      this._setJsonStatus('CodeMirror 加载失败，已降级为文本框', 'pending')
      return
    }
    if (!host.isConnected) return
    const { EditorView, basicSetup, EditorState, json } = bundle
    this._jsonView = new EditorView({
      parent: host,
      root: this.shadowRoot,
      state: EditorState.create({
        doc: this._modelToJsonText(),
        extensions: [
          basicSetup,
          json(),
          cmxJsonTheme(EditorView),
          EditorView.lineWrapping,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) this._setJsonStatus('已修改（点击「应用源码」生效）', 'pending')
          }),
        ],
      }),
    })
  }

  /** CodeMirror 不可用时的降级：原生 textarea，复用同一套读写 API（通过 _jsonDoc 抽象）。 */
  _setupJsonTextareaFallback (host) {
    const ta = document.createElement('textarea')
    ta.style.cssText = 'width:100%;height:100%;box-sizing:border-box;border:0;outline:none;resize:none;font:12px/1.5 Consolas,monospace;padding:6px;background:var(--sapField_Background,#fff);color:var(--sapTextColor,#333);'
    ta.value = this._modelToJsonText()
    ta.addEventListener('input', () => this._setJsonStatus('已修改（点击「应用源码」生效）', 'pending'))
    host.replaceChildren(ta)
    this._jsonTextarea = ta
  }

  /** 统一取 JSON 文档文本（CodeMirror 或降级 textarea）。 */
  _jsonDocText () {
    if (this._jsonView) return this._jsonView.state.doc.toString()
    if (this._jsonTextarea) return this._jsonTextarea.value
    return ''
  }

  /** 统一写 JSON 文档文本。 */
  _setJsonDocText (txt) {
    if (this._jsonView) {
      this._jsonView.dispatch({ changes: { from: 0, to: this._jsonView.state.doc.length, insert: txt } })
    } else if (this._jsonTextarea) {
      this._jsonTextarea.value = txt
    }
  }

  _refreshJsonFromModel () {
    if (!this._jsonView && !this._jsonTextarea) return
    this._setJsonDocText(this._modelToJsonText())
    this._setJsonStatus('已与可视化模型同步', 'ok')
  }

  _formatJsonDoc () {
    const raw = this._jsonDocText().trim()
    if (!raw) return
    try {
      const j = JSON.parse(raw)
      this._setJsonDocText(JSON.stringify(j, null, 2))
      this._setJsonStatus('已格式化', 'ok')
    } catch (err) {
      this._setJsonStatus('JSON 不合法：' + (err instanceof Error ? err.message : String(err)), 'err')
    }
  }

  async _copyJsonDoc () {
    const txt = this._jsonDocText()
    try {
      await navigator.clipboard.writeText(txt)
      this._setJsonStatus('已复制到剪贴板', 'ok')
    } catch (err) {
      this._setJsonStatus('复制失败：' + (err instanceof Error ? err.message : String(err)), 'err')
    }
  }

  _applyJsonToModel () {
    const raw = this._jsonDocText().trim()
    if (!raw) { this._setJsonStatus('源码为空', 'err'); return }
    let parsed
    try { parsed = JSON.parse(raw) }
    catch (err) {
      this._setJsonStatus('JSON 解析失败：' + (err instanceof Error ? err.message : String(err)), 'err')
      return
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      this._setJsonStatus('源码必须为对象 { id, name, icon, details, workspace }', 'err'); return
    }
    const ws = parsed.workspace
    if (!ws || typeof ws !== 'object' || Array.isArray(ws)) {
      this._setJsonStatus('workspace 字段必须为对象', 'err'); return
    }
    this._model = {
      id: typeof parsed.id === 'string' ? parsed.id.trim() : '',
      name: typeof parsed.name === 'string' ? parsed.name : '',
      icon: typeof parsed.icon === 'string' ? parsed.icon.trim() : '',
      details: typeof parsed.details === 'string' ? parsed.details : '',
      workspace: this._normalizeWorkspaceForEdit(ws),
    }
    this._activeViewIndex = 0
    /* 仅更新可视化区域的输入与列表，不重写 JSON 文档（保留用户原始格式） */
    this.shadowRoot.getElementById('wsNodeId').value = this._model.id
    this.shadowRoot.getElementById('wsNodeName').value = this._model.name
    this.shadowRoot.getElementById('wsNodeIcon').value = this._model.icon
    this.shadowRoot.getElementById('wsNodeDetails').value = this._model.details
    this._renderRegionTabs()
    this._renderRightPane()
    this._setJsonStatus('已应用到可视化模型', 'ok')
  }

  _setJsonStatus (text, kind = 'ok') {
    const lbl = this.shadowRoot.getElementById('jsonStatusLabel')
    if (!lbl) return
    lbl.textContent = text || ''
    lbl.style.color = kind === 'err'
      ? 'var(--sapNegativeColor, #b91c1c)'
      : kind === 'pending'
        ? 'var(--sapCriticalColor, #c87f00)'
        : 'var(--sapPositiveColor, #107e3e)'
    if (this._jsonStatusTimer) clearTimeout(this._jsonStatusTimer)
    if (kind === 'pending') return
    this._jsonStatusTimer = setTimeout(() => { lbl.textContent = '' }, 3000)
  }

  _renderLoadSelect () {
    const sel = this.shadowRoot.getElementById('wsNodeLoadSel')
    if (!sel) return
    sel.replaceChildren()
    const empty = document.createElement('ui5-option')
    empty.value = ''
    empty.textContent = '— 新建 —'
    sel.appendChild(empty)
    for (const row of this._existingNodes) {
      const opt = document.createElement('ui5-option')
      opt.value = row.id
      const display = row.name ? `${row.id} · ${row.name}` : row.id
      opt.textContent = display
      if (row.id === this._model.id) opt.setAttribute('selected', '')
      sel.appendChild(opt)
    }
  }

  _renderRegionTabs () {
    for (const region of REGION_KEYS) {
      const btn = this.shadowRoot.querySelector(`.region-tab[data-region="${region.key}"]`)
      if (btn) btn.classList.toggle('active', region.key === this._activeRegion)
      const cnt = this.shadowRoot.querySelector(`[data-region-count="${region.key}"]`)
      if (cnt) cnt.textContent = String(this._model.workspace[region.key]?.views?.length || 0)
    }
  }

  _renderRightPane () {
    const region = REGION_KEYS.find(r => r.key === this._activeRegion)
    if (!region) return
    const r = this._model.workspace[region.key]
    const pane = this.shadowRoot.getElementById('rightPane')
    pane.replaceChildren()

    /* 区域元信息 */
    const meta = document.createElement('div')
    meta.className = 'region-meta-grid'
    /* eslint-disable-next-line no-restricted-syntax -- 静态字面量；用户输入仅写到 .value，不拼接 */
    meta.innerHTML = `
      <span class="label-r">caption</span>
      <ui5-input id="regionCaption" placeholder="区域级标题（包装层 caption）"></ui5-input>
      <span class="label-r">icon</span>
      <ui5-input id="regionIcon" placeholder="ui5-icon name（包装层 icon）"></ui5-input>
      ${region.key === 'prepare' ? `
      <span class="label-r">width</span>
      <ui5-input id="regionWidth" placeholder="对话框宽度，如 640px / 70vw"></ui5-input>
      <span class="label-r">height</span>
      <ui5-input id="regionHeight" placeholder="对话框高度，如 480px / 70vh"></ui5-input>` : ''}
    `
    pane.appendChild(meta)
    pane.querySelector('#regionCaption').value = r.caption || ''
    pane.querySelector('#regionIcon').value = r.icon || ''
    pane.querySelector('#regionCaption').addEventListener('input', e => {
      r.caption = String(e.target.value || '')
    })
    pane.querySelector('#regionIcon').addEventListener('input', e => {
      r.icon = String(e.target.value || '').trim()
    })
    if (region.key === 'prepare') {
      pane.querySelector('#regionWidth').value = r.width || ''
      pane.querySelector('#regionHeight').value = r.height || ''
      pane.querySelector('#regionWidth').addEventListener('input', e => {
        r.width = String(e.target.value || '').trim()
      })
      pane.querySelector('#regionHeight').addEventListener('input', e => {
        r.height = String(e.target.value || '').trim()
      })
    }

    /* 视图列表 + 工具栏 */
    const titleBar = document.createElement('div')
    titleBar.className = 'views-section-title'
    /* eslint-disable-next-line no-restricted-syntax -- 静态字面量 */
    titleBar.innerHTML = `
      <span>视图列表（${escHtml(region.label)}）</span>
      <div>
        <ui5-button id="addViewBtn" design="Transparent" icon="add">新增视图</ui5-button>
      </div>
    `
    pane.appendChild(titleBar)
    pane.querySelector('#addViewBtn').addEventListener('click', () => this._addView())

    if (!r.views.length) {
      const empty = document.createElement('div')
      empty.className = 'empty-hint'
      empty.textContent = '尚未添加任何视图。点击「新增视图」开始定义。'
      pane.appendChild(empty)
      return
    }

    const table = document.createElement('table')
    table.className = 'views-table'
    /* eslint-disable-next-line no-restricted-syntax -- 静态字面量 */
    table.innerHTML = `
      <thead>
        <tr><th class="col-idx">#</th><th>类型</th><th>标签</th><th>图标</th><th>html_page / 摘要</th><th class="col-actions">操作</th></tr>
      </thead>
      <tbody></tbody>
    `
    const tbody = table.querySelector('tbody')
    r.views.forEach((v, i) => {
      const tr = document.createElement('tr')
      if (i === this._activeViewIndex) tr.classList.add('active')
      const summary = v.type === 'html_pages'
        ? (v.html_page || '(未选择)')
        : v.type === 'native_pages'
          ? (v.native_page ? (v.native_page + (v.view && v.view !== 'default' ? ' · ' + v.view : '')) : '(未选择)')
          : (v.tabLabel || v.id || '')
      const tdIdx = document.createElement('td'); tdIdx.className = 'col-idx'; tdIdx.textContent = String(i + 1)
      const tdType = document.createElement('td'); tdType.textContent = v.type || 'placeholder'
      const tdLabel = document.createElement('td'); tdLabel.textContent = v.tabLabel || ''
      const tdIcon = document.createElement('td'); tdIcon.textContent = v.icon || ''
      const tdSummary = document.createElement('td'); tdSummary.textContent = summary
      const tdAct = document.createElement('td'); tdAct.className = 'col-actions'
      const delBtn = document.createElement('ui5-button')
      delBtn.setAttribute('design', 'Transparent')
      delBtn.setAttribute('icon', 'delete')
      delBtn.title = '删除该视图'
      delBtn.addEventListener('click', e => {
        e.stopPropagation()
        this._removeViewAt(i)
      })
      tdAct.appendChild(delBtn)
      tr.append(tdIdx, tdType, tdLabel, tdIcon, tdSummary, tdAct)
      tr.addEventListener('click', () => {
        this._activeViewIndex = i
        this._renderRightPane()
      })
      tbody.appendChild(tr)
    })
    pane.appendChild(table)

    /* 当前视图编辑表单 */
    const v = r.views[this._activeViewIndex]
    if (v) this._renderViewForm(pane, v)
  }

  _renderViewForm (pane, v) {
    const tpl = this.shadowRoot.getElementById('tplViewForm')
    const node = tpl.content.cloneNode(true)
    pane.appendChild(node)
    const root = pane.querySelector('#viewDetailForm')
    if (!root) return

    const typeSel = root.querySelector('#vfType')
    typeSel.value = v.type || 'placeholder'
    typeSel.addEventListener('change', e => {
      v.type = String(e.detail?.selectedOption?.value || 'placeholder')
      this._renderRightPane()
    })

    const setInput = (sel, value, onInput) => {
      const el = root.querySelector(sel)
      if (!el) return
      el.value = value || ''
      el.addEventListener('input', e => onInput(String(e.target.value || '')))
    }
    setInput('#vfLabel', v.tabLabel, val => { v.tabLabel = val; this._renderRightPane() })
    setInput('#vfId', v.id, val => { v.id = val.trim(); this._renderRightPane() })
    setInput('#vfIcon', v.icon, val => { v.icon = val.trim(); this._renderRightPane() })
    setInput('#vfHtmlPage', v.html_page, val => { v.html_page = val.trim(); this._renderRightPane() })

    /* 仅 html_pages 显示页面选择行；其它类型隐藏（type 决定） */
    const isHtmlPages = (v.type || '').toLowerCase() === 'html_pages'
    root.querySelector('#vfHtmlPageLabel').style.display = isHtmlPages ? '' : 'none'
    root.querySelector('#vfHtmlPageRow').style.display = isHtmlPages ? '' : 'none'

    root.querySelector('#vfHtmlPagePickBtn').addEventListener('click', () => {
      const onPick = (page) => {
        if (!page || typeof page !== 'object') return
        v.html_page = String(page.id || '').trim()
        if (!v.tabLabel && page.name) v.tabLabel = String(page.name)
        this._renderRightPane()
      }
      /* 优先用注入的选择器；否则用内置轻量选择器 */
      if (typeof this._htmlPagePicker === 'function') this._htmlPagePicker(onPick)
      else this._openBuiltinHtmlPagePicker(onPick)
    })

    /* native_page / view 仅 native_pages 显示；props 对 native_pages 与 html_pages 均开放
      （html_pages 的 props 经 renderer 透传到 host.props，供页面 pageFns 读取） */
    const vtype = (v.type || '').toLowerCase()
    const isNativePages = vtype === 'native_pages'
    const supportsProps = vtype === 'native_pages' || vtype === 'html_pages'
    for (const sel of ['#vfNativePageLabel', '#vfNativePageRow', '#vfViewLabel', '#vfView']) {
      const el = root.querySelector(sel)
      if (el) el.style.display = isNativePages ? '' : 'none'
    }
    for (const sel of ['#vfPropsLabel', '#vfProps']) {
      const el = root.querySelector(sel)
      if (el) el.style.display = supportsProps ? '' : 'none'
    }
    setInput('#vfNativePage', v.native_page, val => { v.native_page = val.trim(); this._renderRightPane() })
    setInput('#vfView', v.view, val => { v.view = val.trim(); this._renderRightPane() })

    root.querySelector('#vfNativePagePickBtn').addEventListener('click', () => {
      const onPick = (page) => {
        if (!page || typeof page !== 'object') return
        v.native_page = String(page.id || '').trim()
        if (!v.tabLabel && page.name) v.tabLabel = String(page.name)
        this._renderRightPane()
      }
      if (typeof this._nativePagePicker === 'function') this._nativePagePicker(onPick)
      else this._openBuiltinNativePagePicker(onPick)
    })

    /* props JSON 编辑（native_pages 专用） */
    const propsEl = root.querySelector('#vfProps')
    if (propsEl) {
      try {
        propsEl.value = (v.props && typeof v.props === 'object' && Object.keys(v.props).length > 0)
          ? JSON.stringify(v.props, null, 2)
          : ''
      } catch { propsEl.value = '' }
      this._bindJsonObjInput(propsEl, 'props', obj => { v.props = obj })
    }

    /* data JSON 编辑 */
    const dataEl = root.querySelector('#vfData')
    try {
      dataEl.value = (v.data && Object.keys(v.data).length > 0)
        ? JSON.stringify(v.data, null, 2)
        : ''
    } catch { dataEl.value = '' }
    this._bindJsonObjInput(dataEl, 'data', obj => { v.data = obj })
  }

  /**
   * 绑定 props/data 这类「JSON 对象文本框」。
   *
   * 输入过程中 JSON 必然短暂不完整（刚敲 `{` 或 `{"a` 时 parse 必失败），
   * 因此不即时报错：防抖 600ms，触发前再校验一次（元素可能已因重渲染销毁、
   * 内容也可能已修正）。内容合法或清空时立即应用，并清除残留的错误提示。
   * @param {HTMLTextAreaElement} el
   * @param {string} fieldLabel 提示文案用字段名（props / data）
   * @param {(obj: Record<string, unknown>) => void} apply
   */
  _bindJsonObjInput (el, fieldLabel, apply) {
    let timer = null
    el.addEventListener('input', e => {
      if (timer) { clearTimeout(timer); timer = null }
      const txt = String(e.target.value || '').trim()
      if (!txt) { apply({}); this._setStatus(''); return }
      const j = parseJsonObjText(txt)
      if (j) {
        apply(j)
        this._setStatus('')
        return
      }
      timer = setTimeout(() => {
        /* 触发时二次校验：避免对已重渲染移除的元素或已修正的内容误报 */
        if (!el.isConnected) return
        const cur = String(el.value || '').trim()
        if (!cur || parseJsonObjText(cur)) return
        this._setStatus(`${fieldLabel} 不是合法 JSON 对象，将保留上次合法值`, true)
      }, 600)
    })
  }

  /* ── 内置轻量 html_page 选择器（基于 GET /api/html-pages）── */

  async _openBuiltinHtmlPagePicker (onPick) {
    const sr = this.shadowRoot
    const dlg = sr.getElementById('hpPickDlg')
    const list = sr.getElementById('hpPickList')
    const search = sr.getElementById('hpPickSearch')
    this._hpPickOnPick = typeof onPick === 'function' ? onPick : null
    list.replaceChildren()
    search.value = ''
    /* 拉取页面列表（大页量时取较大 pageSize；首版简单全量） */
    let items = []
    try {
      const data = await apiFetch('/api/html-pages?page=1&pageSize=500')
      items = Array.isArray(data?.items) ? data.items : []
    } catch (err) {
      this._setStatus('加载页面列表失败：' + (err instanceof Error ? err.message : String(err)), true)
      return
    }
    this._hpPickItems = items
    this._renderHtmlPageList(items)

    const confirmBtn = sr.getElementById('hpPickConfirmBtn')
    /* 重新绑定 confirm（避免叠加多次监听）：克隆替换 */
    const fresh = confirmBtn.cloneNode(true)
    confirmBtn.replaceWith(fresh)
    fresh.addEventListener('click', () => {
      const sel = list.getSelectedItems ? list.getSelectedItems()[0] : list.querySelector('[selected]')
      const id = sel?.dataset?.pageId
      if (!id) { this._setStatus('请选择一个页面', true); return }
      const hit = (this._hpPickItems || []).find(it => String(it.id) === String(id))
      dlg.open = false
      if (this._hpPickOnPick) this._hpPickOnPick({ id, name: hit?.name || '' })
    })
    /* 双击直接选定 */
    list.addEventListener('item-click', (e) => {
      const id = e.detail?.item?.dataset?.pageId
      if (!id) return
    }, { once: true })

    openDialogCentered(dlg)
  }

  _renderHtmlPageList (items) {
    const list = this.shadowRoot.getElementById('hpPickList')
    list.replaceChildren()
    for (const it of items) {
      const li = document.createElement('ui5-li')
      li.dataset.pageId = String(it.id || '')
      li.setAttribute('description', String(it.name || it.details || ''))
      li.textContent = String(it.id || '')
      list.appendChild(li)
    }
  }

  _filterHtmlPageList (kw) {
    const k = String(kw || '').trim().toLowerCase()
    const items = (this._hpPickItems || []).filter(it =>
      !k ||
      String(it.id || '').toLowerCase().includes(k) ||
      String(it.name || '').toLowerCase().includes(k))
    this._renderHtmlPageList(items)
  }

  /* ── 内置轻量 native_page 选择器（基于 GET /api/native-pages）── */

  async _openBuiltinNativePagePicker (onPick) {
    const sr = this.shadowRoot
    const dlg = sr.getElementById('npPickDlg')
    const list = sr.getElementById('npPickList')
    const search = sr.getElementById('npPickSearch')
    this._npPickOnPick = typeof onPick === 'function' ? onPick : null
    list.replaceChildren()
    search.value = ''
    let items = []
    try {
      const data = await apiFetch('/api/native-pages?page=1&pageSize=500')
      items = Array.isArray(data?.items) ? data.items : []
    } catch (err) {
      this._setStatus('加载原生页面列表失败：' + (err instanceof Error ? err.message : String(err)), true)
      return
    }
    this._npPickItems = items
    this._renderNativePageList(items)

    const confirmBtn = sr.getElementById('npPickConfirmBtn')
    /* 重新绑定 confirm（避免叠加多次监听）：克隆替换 */
    const fresh = confirmBtn.cloneNode(true)
    confirmBtn.replaceWith(fresh)
    fresh.addEventListener('click', () => {
      const sel = list.getSelectedItems ? list.getSelectedItems()[0] : list.querySelector('[selected]')
      const id = sel?.dataset?.pageId
      if (!id) { this._setStatus('请选择一个原生页面', true); return }
      const hit = (this._npPickItems || []).find(it => String(it.id) === String(id))
      dlg.open = false
      if (this._npPickOnPick) this._npPickOnPick({ id, name: hit?.name || '' })
    })

    openDialogCentered(dlg)
  }

  _renderNativePageList (items) {
    const list = this.shadowRoot.getElementById('npPickList')
    list.replaceChildren()
    for (const it of items) {
      const li = document.createElement('ui5-li')
      li.dataset.pageId = String(it.id || '')
      li.setAttribute('description', String(it.name || it.details || ''))
      li.textContent = String(it.id || '')
      list.appendChild(li)
    }
  }

  _filterNativePageList (kw) {
    const k = String(kw || '').trim().toLowerCase()
    const items = (this._npPickItems || []).filter(it =>
      !k ||
      String(it.id || '').toLowerCase().includes(k) ||
      String(it.name || '').toLowerCase().includes(k))
    this._renderNativePageList(items)
  }

  _addView () {
    const r = this._model.workspace[this._activeRegion]
    r.views.push(emptyView())
    this._activeViewIndex = r.views.length - 1
    this._renderRegionTabs()
    this._renderRightPane()
  }

  _removeViewAt (i) {
    const r = this._model.workspace[this._activeRegion]
    r.views.splice(i, 1)
    if (this._activeViewIndex >= r.views.length) {
      this._activeViewIndex = Math.max(0, r.views.length - 1)
    }
    this._renderRegionTabs()
    this._renderRightPane()
  }

  /** 校验 → POST → 关闭。 */
  async _save () {
    const id = String(this._model.id || '').trim()
    if (!id) { this._setStatus('请填写节点 ID', true); return }
    if (!SAFE_ID.test(id)) {
      this._setStatus('id 仅允许字母、数字、._-，长度 1–128', true); return
    }
    if (this._model.icon && !SAFE_ICON.test(this._model.icon)) {
      this._setStatus(`节点图标命名非法：${this._model.icon}`, true); return
    }
    /* 保存前终检当前可见的 JSON 文本框（props/data）：仍非法则阻断，
      避免静默以「上次合法值」落库（切换区域/视图会丢弃未应用的输入） */
    for (const [sel, label] of [['#vfProps', 'props'], ['#vfData', 'data']]) {
      const el = this.shadowRoot.querySelector(sel)
      if (!el || el.style.display === 'none') continue
      const txt = String(el.value || '').trim()
      if (!txt || parseJsonObjText(txt)) continue
      this._setStatus(`当前视图 ${label} 不是合法 JSON 对象，请修正后再保存`, true)
      return
    }
    /* 子项校验：图标命名、html_pages 必填 */
    for (const region of REGION_KEYS) {
      const r = this._model.workspace[region.key]
      if (r.icon && !SAFE_ICON.test(r.icon)) {
        this._setStatus(`${region.label} 图标命名非法：${r.icon}`, true); return
      }
      for (let i = 0; i < r.views.length; i++) {
        const v = r.views[i]
        if (v.icon && !SAFE_ICON.test(v.icon)) {
          this._setStatus(`${region.label} 第 ${i + 1} 个视图：图标命名非法`, true); return
        }
        if ((v.type || '').toLowerCase() === 'html_pages' && !v.html_page) {
          this._setStatus(`${region.label} 第 ${i + 1} 个视图（html_pages）需选择页面`, true); return
        }
        if ((v.type || '').toLowerCase() === 'native_pages' && !v.native_page) {
          this._setStatus(`${region.label} 第 ${i + 1} 个视图（native_pages）需选择原生页面`, true); return
        }
      }
    }

    const ws = serializeWorkspace(this._model.workspace)
    try {
      this._setStatus('保存中…', false)
      if (this._mode === 'menu-node') {
        // 菜单节点模式：写回 cmx_menu.definition（经 /api/menu/update）
        if (!this._cmxId) {
          this._setStatus('缺少菜单主键 _cmxId，无法更新', true); return
        }
        // definition：保留原节点 extras + 覆盖 workspace/details
        const definition = { ...this._menuExtras }
        definition.workspace = ws
        if (this._model.details) definition.details = this._model.details
        await updateMenu({
          id: this._cmxId,
          data: {
            name: this._model.name || '',
            icon: this._model.icon || '',
            definition,
          },
        })
        this._setStatus(`已更新菜单 ${id}`, false)
        this.dispatchEvent(new CustomEvent('menu-node-saved', {
          bubbles: true, composed: true, detail: { id: this._cmxId, code: id },
        }))
        setTimeout(() => { this._dlg().open = false }, 300)
      } else {
        const payload = {
          id,
          name: this._model.name || '',
          icon: this._model.icon || '',
          details: this._model.details || '',
          workspace: ws,
        }
        await saveWorkspaceNode(payload)
        this._setStatus(`已保存 ${id}`, false)
        await this._reloadExistingNodes()
        this._renderLoadSelect()
        this.dispatchEvent(new CustomEvent('workspace-node-saved', {
          bubbles: true, composed: true, detail: { id, payload },
        }))
        /* 自动关闭，避免用户重复点击；如需继续编辑可再次打开 */
        setTimeout(() => { this._dlg().open = false }, 300)
      }
    } catch (err) {
      this._setStatus(err instanceof Error ? err.message : String(err), true)
    }
  }

  async _delete () {
    const id = String(this._model.id || '').trim()
    if (!id) { this._setStatus('请先填写或选择要删除的节点 ID', true); return }
    /* 删除确认：用 CmxFloatingDialog（禁用原生 confirm，见前端复用规范红线）。 */
    const confirmDlg = new CmxFloatingDialog()
    confirmDlg.configure({
      title: '删除确认',
      icon: 'delete',
      description: `确定删除工作区节点「${id}」？此操作不可恢复。`,
      showConfirm: true,
      showCancel: true,
      confirmText: '删除',
      cancelText: '取消',
      dialogWidth: '420px',
      dialogHeight: '220px',
    })
    document.body.appendChild(confirmDlg)
    const { action } = await confirmDlg.openModal()
    if (action !== 'confirm') return
    try {
      await deleteWorkspaceNode(id)
      this._setStatus(`已删除 ${id}`, false)
      this._model = { id: '', name: '', icon: '', details: '', workspace: emptyWorkspace() }
      this._activeRegion = 'prepare'
      this._activeViewIndex = 0
      await this._reloadExistingNodes()
      this._renderAll()
    } catch (err) {
      this._setStatus(err instanceof Error ? err.message : String(err), true)
    }
  }
}

if (!customElements.get('portal-workspace-node-dialog')) {
  customElements.define('portal-workspace-node-dialog', PortalWorkspaceNodeDialog)
}
