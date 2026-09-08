/**
 * <designer-workspace-node-dialog> — 工作区节点（{@link WorkspaceConfig}）可视化定义对话框。
 *
 * 数据结构：节点根 `{ id, name, details, workspace }`；`workspace` 包含 5 个区域键
 * （content / explorer / property / bottom / prepare），每个区域为
 * `{ caption?, icon?, views: View[], width?, height? }`（width/height 仅 prepare 使用）。
 * 单个 View：`{ id?, tabLabel?, type, icon?, html_page?, data? }`，其中
 * - `type === 'html_pages'` 时通过「选择页面」按钮调出现有 multi-pages 对话框（单选模式）
 * - 其它内置类型：placeholder / html / iframe / link / json / code / markdown / split / menu-pages
 *
 * 与 multi-pages 对话框协作：本组件**不**自带 html_page 选择 UI，调用方在 designer-app
 * 注入的 `requestHtmlPagePicker(callback)` 回调中委托给同一份 multi-pages 对话框（mode='single'）。
 */
import {
  listWorkspaceNodes,
  getWorkspaceNode,
  saveWorkspaceNode,
  deleteWorkspaceNode,
} from '../../api/workspace-nodes-api.js'
import { loadCodeMirrorJsBundle } from '../../lib/codemirror-loader.js'
import { cmxCodeMirrorExtensions } from '../../utils/codemirror-theme.js'
import { openDialogCentered } from './dialog-center.js'
import { escHtml } from '../../utils/esc.js'

const VIEW_TYPES = [
  { value: 'placeholder',  label: '占位（placeholder）' },
  { value: 'html_pages',   label: 'HTML 页面（html_pages）' },
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
  }
}
function emptyView () {
  return { id: '', tabLabel: '', type: 'placeholder', icon: '', html_page: '', data: {} }
}

/* ── 与 workspace-node.js `normalizeWorkspaceRegionViews` 的逆运算：把宽松输入收敛为
 *    `{caption, icon, views[], width?, height?}` 的可编辑结构 ── */
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
  if (o.data && typeof o.data === 'object' && !Array.isArray(o.data)) {
    v.data = /** @type {Record<string, unknown>} */ (o.data)
    if (!v.html_page && typeof v.data.html_page === 'string') v.html_page = v.data.html_page
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
  }
  /* data：仅当存在键值时附带；对 html_pages 视图，html_page 是顶层字段足够 */
  if (v.data && typeof v.data === 'object' && Object.keys(v.data).length > 0) {
    /* 移除运行时字段，避免编辑后误传 */
    const cleaned = { ...v.data }
    for (const k of ['htmlPage', 'htmlPageId', 'htmlPageRunnableDoc',
      'htmlPagePreviewStructure', 'htmlPageExecutableScripts',
      'htmlPagePreviewError', 'htmlPageLoadError']) delete cleaned[k]
    if (Object.keys(cleaned).length > 0) out.data = cleaned
  }
  return out
}

export class DesignerWorkspaceNodeDialog extends HTMLElement {
  constructor () {
    super()
    this.attachShadow({ mode: 'open' })
    /** @type {{ id: string, name: string, icon: string, details: string, workspace: ReturnType<typeof emptyWorkspace> }} */
    this._model = { id: '', name: '', icon: '', details: '', workspace: emptyWorkspace() }
    this._activeRegion = 'content'
    this._activeViewIndex = 0
    /** @type {((onPick: (page: { id: string, name: string }) => void) => void) | null} */
    this._htmlPagePicker = null
    /** @type {{ id: string, name: string, details: string, updatedAt: string }[]} */
    this._existingNodes = []
    /** @type {'visual'|'json'} */
    this._activeTab = 'visual'
    /** @type {import('@codemirror/view').EditorView | null} */
    this._jsonView = null
    this._jsonStatusTimer = null
  }

  /** 注入 html_page 单选选择器（由 designer-app 委托至 multi-pages 对话框）。 */
  setHtmlPagePicker (fn) {
    this._htmlPagePicker = typeof fn === 'function' ? fn : null
  }

  connectedCallback () {
    this._render()
    this._wire()
  }

  /** 打开对话框；可选 `id` 预加载已有节点。 */
  async open (id) {
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
    for (const region of REGION_KEYS) {
      out[region.key] = normalizeRegionForEdit(ws[region.key])
    }
    return out
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
      `<ui5-option value="${escHtml(t.value)}">${escHtml(t.label)}</ui5-option>`).join('')
    const regionTabs = REGION_KEYS.map(r =>
      `<button class="region-tab" data-region="${r.key}">${escHtml(r.label)} <span class="region-count" data-region-count="${r.key}">0</span></button>`).join('')

    /* eslint-disable-next-line no-restricted-syntax -- 静态字面量；动态值 typeOpts/regionTabs 已转义 */
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        ui5-dialog#wsNodeDlg::part(content) { padding: 0; }
        .ws-dlg-header { display: flex; align-items: center; gap: 8px; }
        .ws-dlg-body {
          display: flex;
          flex-direction: column;
          width: 80vw; max-width: 1100px;
          height: 70vh; max-height: 720px;
          min-width: 720px; min-height: 480px;
          background: var(--sapBackgroundColor, #fff);
        }
        .top-tabs {
          display: flex; align-items: stretch; gap: 0;
          border-bottom: 1px solid var(--sapPageHeader_BorderColor, #ddd);
          background: var(--sapObjectHeader_Background, #fafafa);
          padding: 0 8px;
        }
        .top-tab {
          padding: 8px 16px;
          background: transparent; border: none; cursor: pointer;
          font-size: 13px; color: var(--sapContent_LabelColor, #6a6d70);
          border-bottom: 2px solid transparent;
          display: inline-flex; align-items: center; gap: 6px;
        }
        .top-tab:hover { color: var(--sapTextColor, #333); }
        .top-tab.active {
          color: var(--sapHighlightColor, #0070f2);
          border-bottom-color: var(--sapHighlightColor, #0070f2);
          font-weight: 600;
        }

        .pane { flex: 1 1 auto; min-height: 0; display: none; }
        .pane.active { display: grid; }

        .pane-visual {
          grid-template-columns: 280px 1fr;
          grid-template-rows: auto 1fr;
        }
        .pane-json {
          grid-template-columns: 1fr;
          grid-template-rows: auto 1fr;
        }

        .meta-bar {
          grid-column: 1 / span 2;
          padding: 10px 12px;
          border-bottom: 1px solid var(--sapPageHeader_BorderColor, #ddd);
          display: grid;
          grid-template-columns: 200px 1fr 200px auto;
          gap: 8px 12px;
          align-items: center;
          background: var(--sapObjectHeader_Background, #fafafa);
        }
        .meta-bar ui5-input, .meta-bar ui5-select { width: 100%; }
        .meta-row-label { font-size: 12px; color: var(--sapContent_LabelColor, #6a6d70); }

        .left-pane {
          border-right: 1px solid var(--sapPageHeader_BorderColor, #ddd);
          background: var(--sapObjectHeader_Background, #fafafa);
          overflow-y: auto;
          padding: 8px;
        }
        .right-pane { overflow: auto; padding: 12px; min-width: 0; }

        .json-toolbar {
          display: flex; align-items: center; gap: 6px;
          padding: 6px 12px;
          border-bottom: 1px solid var(--sapPageHeader_BorderColor, #ddd);
          background: var(--sapObjectHeader_Background, #fafafa);
        }
        .json-toolbar .spacer { flex: 1 1 auto; }
        .json-host {
          flex: 1 1 auto; min-height: 0;
          overflow: hidden;
          background: var(--sapField_Background, var(--sapBaseColor, #fff));
        }
        .json-host .cm-editor {
          height: 100%;
          font-size: 12px;
          font-family: Consolas, 'Courier New', monospace;
        }
        .json-host .cm-scroller { overflow: auto !important; }

        .json-wrap {
          display: flex; flex-direction: column;
          height: 100%; min-height: 0;
        }

        .region-list-title {
          font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase;
          color: var(--sapContent_LabelColor, #6a6d70); padding: 6px 4px 4px 4px;
        }
        .region-tab {
          display: flex; align-items: center; justify-content: space-between;
          width: 100%; padding: 8px 10px; margin-bottom: 4px;
          border: 1px solid transparent; border-radius: 4px;
          background: transparent; cursor: pointer; text-align: left;
          font-size: 13px; color: var(--sapTextColor, #333);
        }
        .region-tab:hover { background: var(--sapHoverColor, #eee); }
        .region-tab.active {
          background: var(--sapList_SelectionBackgroundColor, #e6f0fa);
          border-color: var(--sapHighlightColor, #0070f2);
          color: var(--sapHighlightColor, #0070f2);
        }
        .region-count {
          background: var(--sapHighlightColor, #0070f2);
          color: #fff; font-size: 10px; min-width: 18px; height: 18px;
          border-radius: 9px; display: inline-flex; align-items: center; justify-content: center;
          padding: 0 5px;
        }
        .region-tab:not(.active) .region-count { background: var(--sapNeutralBackground, #aab); }

        .region-meta-grid {
          display: grid; grid-template-columns: 100px 1fr 100px 1fr; gap: 8px 12px;
          margin-bottom: 12px; align-items: center;
        }
        .region-meta-grid ui5-input { width: 100%; }
        .region-meta-grid .full { grid-column: 1 / span 4; }

        .views-section-title {
          font-size: 12px; font-weight: 600; color: var(--sapTextColor, #333);
          margin: 16px 0 8px 0; padding-bottom: 4px;
          border-bottom: 1px solid var(--sapPageHeader_BorderColor, #ddd);
          display: flex; align-items: center; justify-content: space-between;
        }

        .views-table {
          width: 100%; border-collapse: collapse; font-size: 13px;
          border: 1px solid var(--sapPageHeader_BorderColor, #ddd);
        }
        .views-table th, .views-table td {
          border-right: 1px solid var(--sapPageHeader_BorderColor, #eee);
          border-bottom: 1px solid var(--sapPageHeader_BorderColor, #eee);
          padding: 6px 8px; text-align: left; vertical-align: middle;
        }
        .views-table th {
          background: var(--sapObjectHeader_Background, #fafafa);
          font-size: 11px; font-weight: 600; letter-spacing: .04em;
          color: var(--sapContent_LabelColor, #6a6d70);
        }
        .views-table tr.active { background: var(--sapList_SelectionBackgroundColor, #e6f0fa); }
        .views-table tr { cursor: pointer; }
        .views-table tr:hover:not(.active) { background: var(--sapHoverColor, #f5f5f5); }
        .col-idx { width: 32px; text-align: center; color: var(--sapContent_LabelColor, #6a6d70); }
        .col-actions { width: 60px; text-align: center; }

        .view-detail-form {
          display: grid; grid-template-columns: 110px 1fr 110px 1fr; gap: 8px 12px;
          margin-top: 12px; padding: 12px;
          background: var(--sapObjectHeader_Background, #fafafa);
          border: 1px solid var(--sapPageHeader_BorderColor, #ddd);
          border-radius: 4px;
        }
        .view-detail-form .full { grid-column: 1 / span 4; }
        .view-detail-form ui5-input,
        .view-detail-form ui5-select,
        .view-detail-form ui5-textarea { width: 100%; }
        .label-r { font-size: 12px; color: var(--sapContent_LabelColor, #6a6d70); text-align: right; }
        .empty-hint {
          padding: 24px; text-align: center; color: var(--sapContent_LabelColor, #6a6d70);
          font-size: 13px; border: 1px dashed var(--sapPageHeader_BorderColor, #ddd);
          border-radius: 4px; background: var(--sapObjectHeader_Background, #fafafa);
        }
        .picker-row { display: flex; gap: 6px; align-items: center; }
        .picker-row ui5-input { flex: 1 1 auto; }
        .strip-wrap { padding: 0 12px; }
        ui5-message-strip[hidden] { display: none; }

        .footer-row {
          display: flex; gap: 8px; align-items: center; width: 100%;
        }
        .footer-row .spacer { flex: 1 1 auto; }
      </style>

      <ui5-dialog id="wsNodeDlg" resizable draggable>
        <div slot="header" class="ws-dlg-header">
          <ui5-icon name="folder-blank"></ui5-icon>
          <ui5-title level="H5" wrapping-type="None">工作区节点（workspace-node）</ui5-title>
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

            <span class="label-r" id="vfDataLabel">data (JSON)</span>
            <ui5-textarea id="vfData" rows="4" placeholder='可选；类型为 html/iframe/code 等时承载具体内容，如 {"title":"…"}' class="full" style="grid-column: 2 / span 3;"></ui5-textarea>
          </div>
        </template>
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
    const { EditorView, basicSetup, EditorState, javascript, oneDark } = await loadCodeMirrorJsBundle()
    if (!host.isConnected) return
    this._jsonView = new EditorView({
      parent: host,
      root: this.shadowRoot,
      state: EditorState.create({
        doc: this._modelToJsonText(),
        extensions: [
          basicSetup,
          javascript(),
          ...cmxCodeMirrorExtensions(EditorView, oneDark),
          EditorView.theme({
            '.cm-content': { padding: '4px 0' },
          }),
          EditorView.lineWrapping,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) this._setJsonStatus('已修改（点击「应用源码」生效）', 'pending')
          }),
        ],
      }),
    })
  }

  _refreshJsonFromModel () {
    if (!this._jsonView) return
    const txt = this._modelToJsonText()
    this._jsonView.dispatch({
      changes: { from: 0, to: this._jsonView.state.doc.length, insert: txt },
    })
    this._setJsonStatus('已与可视化模型同步', 'ok')
  }

  _formatJsonDoc () {
    if (!this._jsonView) return
    const raw = this._jsonView.state.doc.toString().trim()
    if (!raw) return
    try {
      const j = JSON.parse(raw)
      const pretty = JSON.stringify(j, null, 2)
      this._jsonView.dispatch({
        changes: { from: 0, to: this._jsonView.state.doc.length, insert: pretty },
      })
      this._setJsonStatus('已格式化', 'ok')
    } catch (err) {
      this._setJsonStatus('JSON 不合法：' + (err instanceof Error ? err.message : String(err)), 'err')
    }
  }

  async _copyJsonDoc () {
    if (!this._jsonView) return
    const txt = this._jsonView.state.doc.toString()
    try {
      await navigator.clipboard.writeText(txt)
      this._setJsonStatus('已复制到剪贴板', 'ok')
    } catch (err) {
      this._setJsonStatus('复制失败：' + (err instanceof Error ? err.message : String(err)), 'err')
    }
  }

  _applyJsonToModel () {
    if (!this._jsonView) return
    const raw = this._jsonView.state.doc.toString().trim()
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
      if (typeof this._htmlPagePicker !== 'function') {
        this._setStatus('未注入 html_page 选择器', true)
        return
      }
      this._htmlPagePicker((page) => {
        if (!page || typeof page !== 'object') return
        v.html_page = String(page.id || '').trim()
        if (!v.tabLabel && page.name) v.tabLabel = String(page.name)
        this._renderRightPane()
      })
    })

    /* data JSON 编辑 */
    const dataEl = root.querySelector('#vfData')
    try {
      dataEl.value = (v.data && Object.keys(v.data).length > 0)
        ? JSON.stringify(v.data, null, 2)
        : ''
    } catch { dataEl.value = '' }
    dataEl.addEventListener('input', e => {
      const txt = String(e.target.value || '').trim()
      if (!txt) { v.data = {}; return }
      try {
        const j = JSON.parse(txt)
        if (j && typeof j === 'object' && !Array.isArray(j)) v.data = j
      } catch {
        /* 解析失败暂不写回，避免保存出错；状态栏给出提示 */
        this._setStatus('data 不是合法 JSON 对象，将不更新', true)
      }
    })
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
      }
    }

    const payload = {
      id,
      name: this._model.name || '',
      icon: this._model.icon || '',
      details: this._model.details || '',
      workspace: serializeWorkspace(this._model.workspace),
    }
    try {
      this._setStatus('保存中…', false)
      await saveWorkspaceNode(payload)
      this._setStatus(`已保存 ${id}`, false)
      await this._reloadExistingNodes()
      this._renderLoadSelect()
      this.dispatchEvent(new CustomEvent('workspace-node-saved', {
        bubbles: true, composed: true, detail: { id, payload },
      }))
      /* 自动关闭，避免用户重复点击；如需继续编辑可再次打开 */
      setTimeout(() => { this._dlg().open = false }, 300)
    } catch (err) {
      this._setStatus(err instanceof Error ? err.message : String(err), true)
    }
  }

  async _delete () {
    const id = String(this._model.id || '').trim()
    if (!id) { this._setStatus('请先填写或选择要删除的节点 ID', true); return }
    if (!confirm(`确定删除工作区节点「${id}」？此操作不可恢复。`)) return
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

customElements.define('designer-workspace-node-dialog', DesignerWorkspaceNodeDialog)
