/**
 * <portal-menu-editor> —— 菜单管理「两段式」的 content 区：选中节点的表单编辑 / 新增 / 删除。
 *
 * 经模块单例总线 `menuBus` 与 explorer 区 <portal-menu-tree> 协作：
 *   - 监听 'select'：渲染表单（编辑 / 新增子 / 新增根 / 空态）
 *   - 监听 'ctx'   ：更新功能码选择器所需的 DAM 上下文；并复位空态（修复「切换后残留」）
 *   - CRUD 成功    ：menuBus.requestReload() 让树刷新（可指定新选中）
 *
 * Bug 修复：
 *   - 功能码选择器恒空：改用 iam-api.listMenuPermissions 的软过滤（全量+客户端匹配+回退）。
 *   - 功能码回显：加载节点时用权限 name 回显（拿不到退回码）。
 *   - 排序默认：新增默认 1，编辑用节点值（含 0）。
 *
 * 视觉：门户 Neo 科技风（--neo-cyan/violet/mint 玻璃拟态卡片 + smart-field 浮层字段）。
 */
import { registerWorkspaceViewType } from '../lib/workspace-view-renderer.js'
import { createMenu, updateMenu, deleteMenu } from '../api/menu-api.js'
import { listMenuPermissions } from '../api/iam-api.js'
import { menuBus } from '../lib/menu-manager-bus.js'
import { escAttr } from '../lib/escape.js'
import { CmxFloatingDialog } from 'cmx-data-comp'

registerWorkspaceViewType('menu_editor', () =>
  '<portal-menu-editor style="display:flex;flex:1 1 auto;width:100%;height:100%;min-width:0;min-height:0;box-sizing:border-box"></portal-menu-editor>'
)

const OPEN_TYPES = [
  { value: 0, label: '应用页标签', icon: 'sap-icon://open-command-field' },
  { value: 1, label: '浏览器标签', icon: 'internet-browser' },
  { value: 2, label: '弹窗', icon: 'popup-window' },
  { value: 3, label: '抽屉', icon: 'menu2' },
  { value: 4, label: '全屏显示', icon: 'full-screen' },
  { value: 5, label: '下拉菜单', icon: 'slim-arrow-down' },
]

const STYLE = `
  :host{display:flex;flex:1 1 auto;min-width:0;min-height:0;background:var(--sapBackgroundColor,#fff);color:var(--sapTextColor,#1d2d3e);font-family:var(--sapFontFamily,-apple-system,'Segoe UI','PingFang SC',sans-serif);font-size:13px;
    --mep-bg:var(--sapGroup_ContentBackground,#fafafa)}
  *{box-sizing:border-box}
  .scroll{flex:1 1 auto;min-width:0;min-height:0;overflow:auto;padding:16px 18px 22px;
    background:
      radial-gradient(ellipse 120% 60% at 0% 0%, color-mix(in srgb,var(--neo-violet) 5%,transparent), transparent 55%),
      radial-gradient(ellipse 100% 60% at 100% 100%, color-mix(in srgb,var(--neo-cyan) 4%,transparent), transparent 55%),
      var(--sapBackgroundColor,#fff)}
  .card{max-width:720px;margin:0 auto;border:1px solid color-mix(in srgb,var(--neo-cyan) 12%,var(--sapGroup_TitleBorderColor,#d9d9d9));border-radius:12px;overflow:hidden;
    background:color-mix(in srgb,var(--sapObjectHeader_Background,#fff) 96%,var(--neo-cyan) 4%);box-shadow:0 1px 3px rgba(0,0,0,.04),0 8px 28px -18px color-mix(in srgb,var(--neo-violet) 40%,transparent)}
  /* 头部条 */
  .head{display:grid;grid-template-columns:38px minmax(0,1fr) auto;gap:11px;align-items:center;padding:12px 15px;
    border-bottom:1px solid color-mix(in srgb,var(--neo-cyan) 12%,var(--sapGroup_TitleBorderColor,#d9d9d9));
    background:linear-gradient(120deg,color-mix(in srgb,var(--neo-cyan) 9%,var(--sapObjectHeader_Background,#fff)),color-mix(in srgb,var(--neo-violet) 5%,var(--sapObjectHeader_Background,#fff)))}
  .head-orbit{width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;color:var(--sapGroup_ContentBorderColor, #ffffff);
    background:linear-gradient(135deg,var(--neo-cyan),color-mix(in srgb,var(--neo-violet) 45%,var(--neo-cyan)));box-shadow:0 0 16px color-mix(in srgb,var(--neo-cyan) 22%,transparent),inset 0 0 0 1px rgba(255,255,255,.22)}
  .head-orbit ui5-icon{width:1.05rem;height:1.05rem}
  .head-id{min-width:0}
  .head-title{font-size:15px;font-weight:750;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--sapTitleColor,#1d2d3e)}
  .head-meta{margin-top:3px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:10.5px;color:var(--sapContent_LabelColor,#6a6d70);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;gap:8px;flex-wrap:wrap}
  .head-meta b{font-weight:700;color:color-mix(in srgb,var(--neo-cyan) 70%,var(--sapTextColor,#1d2d3e))}
  .mode-pill{display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 10px;border-radius:999px;font-size:11px;font-weight:750;letter-spacing:.02em;
    color:var(--neo-cyan);background:color-mix(in srgb,var(--neo-cyan) 12%,transparent);border:1px solid color-mix(in srgb,var(--neo-cyan) 28%,transparent)}
  .mode-pill.new{color:var(--neo-mint);background:color-mix(in srgb,var(--neo-mint) 12%,transparent);border-color:color-mix(in srgb,var(--neo-mint) 28%,transparent)}
  .mode-pill ui5-icon{width:.72rem;height:.72rem}
  /* 表单 */
  .body{padding:14px 15px 6px}
  .cluster{border:1px solid color-mix(in srgb,var(--neo-cyan) 10%,var(--sapGroup_TitleBorderColor,#d9d9d9));border-radius:10px;overflow:hidden;margin-bottom:12px;
    background:color-mix(in srgb,var(--sapTile_Background,var(--mep-bg)) 96%,var(--neo-cyan) 4%)}
  .cluster-head{height:30px;display:flex;align-items:center;gap:7px;padding:0 11px;font-size:11px;font-weight:750;letter-spacing:.05em;text-transform:uppercase;color:var(--sapContent_LabelColor,#6a6d70);
    background:color-mix(in srgb,var(--neo-cyan) 7%,var(--sapList_HeaderBackground,#eef2f6));border-bottom:1px solid color-mix(in srgb,var(--neo-cyan) 10%,var(--sapGroup_TitleBorderColor,#d9d9d9))}
  .cluster-head ui5-icon{width:.8rem;height:.8rem;color:var(--neo-cyan)}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;padding:10px}
  .field{min-width:0;display:flex;flex-direction:column;gap:4px;padding:8px 10px;border:1px solid color-mix(in srgb,var(--neo-cyan) 8%,transparent);border-radius:9px;
    background:color-mix(in srgb,var(--sapField_Background,#fff) 94%,var(--neo-cyan) 6%);transition:border-color .15s ease,box-shadow .15s ease}
  .field.wide{grid-column:1/-1}
  .field:focus-within{border-color:color-mix(in srgb,var(--neo-cyan) 48%,transparent);box-shadow:0 0 0 3px color-mix(in srgb,var(--neo-cyan) 13%,transparent)}
  .field label{display:inline-flex;align-items:center;gap:5px;font-size:10.5px;font-weight:750;letter-spacing:.02em;color:var(--sapContent_LabelColor,#6a6d70)}
  .field label ui5-icon{width:.72rem;height:.72rem;color:var(--neo-cyan);flex:0 0 auto}
  .field input,.field select{width:100%;border:0;background:transparent;color:var(--sapField_TextColor,var(--sapTextColor,#1d2d3e));font:inherit;font-size:13px;font-weight:600;line-height:1.3;outline:none;padding:1px 0}
  .field input[readonly]{color:var(--sapContent_LabelColor,#6a6d70);cursor:default}
  .field select{appearance:none;-webkit-appearance:none;-moz-appearance:none;cursor:pointer;padding-right:16px;
    background-image:linear-gradient(45deg,transparent 50%,var(--sapContent_LabelColor,#6a6d70) 50%),linear-gradient(135deg,var(--sapContent_LabelColor,#6a6d70) 50%,transparent 50%);
    background-position:calc(100% - 6px) 55%,calc(100% - 2px) 55%;background-size:4px 4px;background-repeat:no-repeat}
  /* “打开方式”用 ui5-select（option 弹层跟随 UI5 主题换肤）：.field 退化为纯布局容器，避免与 ui5-select 自带外观叠加成“框中框” */
  .field:has(ui5-select){padding:0;border:0;background:transparent}
  .field:has(ui5-select):focus-within{border-color:transparent;box-shadow:none}
  .field ui5-select{width:100%}
  .field .lock{font-size:8.5px;font-weight:800;letter-spacing:.08em;color:var(--sapContent_LabelColor,#6a6d70);background:color-mix(in srgb,var(--sapContent_LabelColor,#6a6d70) 10%,transparent);border-radius:999px;padding:1px 6px;margin-left:auto}
  .field-top{display:flex;align-items:center;gap:6px}
  /* 功能码行 */
  .funcode{display:flex;align-items:center;gap:7px;width:100%}
  .funcode .fc-name{flex:1 1 auto;min-width:0;font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--sapField_TextColor,var(--sapTextColor,#1d2d3e))}
  .funcode .fc-name.empty{color:var(--sapField_PlaceholderTextColor,var(--sapContent_LabelColor,#9aa7b5));font-weight:500}
  .funcode .fc-code{flex:0 0 auto;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:10px;color:var(--sapContent_LabelColor,#6a6d70);background:color-mix(in srgb,var(--neo-cyan) 8%,transparent);padding:1px 6px;border-radius:4px;max-width:40%;overflow:hidden;text-overflow:ellipsis}
  .mini-btn{flex:0 0 auto;height:24px;display:inline-flex;align-items:center;gap:4px;padding:0 9px;border-radius:6px;cursor:pointer;font:inherit;font-size:11px;font-weight:650;
    border:1px solid color-mix(in srgb,var(--neo-cyan) 22%,transparent);background:color-mix(in srgb,var(--sapList_Background,#fff) 90%,var(--neo-cyan) 10%);color:var(--neo-cyan);transition:background .14s,border-color .14s,box-shadow .14s}
  .mini-btn ui5-icon{width:.7rem;height:.7rem}
  .mini-btn:hover{background:color-mix(in srgb,var(--neo-cyan) 14%,var(--sapList_Background,#fff));border-color:color-mix(in srgb,var(--neo-cyan) 38%,transparent);box-shadow:0 0 10px color-mix(in srgb,var(--neo-cyan) 16%,transparent)}
  .mini-btn.ghost{color:var(--sapContent_LabelColor,#6a6d70);border-color:color-mix(in srgb,var(--sapContent_LabelColor,#6a6d70) 20%,transparent);background:transparent}
  /* 动作条 */
  .actions{display:flex;gap:9px;flex-wrap:wrap;align-items:center;padding:14px 15px;border-top:1px solid color-mix(in srgb,var(--neo-cyan) 10%,var(--sapGroup_TitleBorderColor,#d9d9d9));
    background:color-mix(in srgb,var(--mep-bg) 60%,transparent)}
  .btn{height:32px;display:inline-flex;align-items:center;gap:6px;padding:0 15px;border-radius:8px;cursor:pointer;font:inherit;font-size:13px;font-weight:650;border:1px solid color-mix(in srgb,var(--neo-cyan) 24%,transparent);
    background:color-mix(in srgb,var(--sapButton_Background,#fff) 92%,var(--neo-cyan) 8%);color:var(--neo-cyan);transition:filter .15s,background .15s,box-shadow .15s,transform .1s}
  .btn ui5-icon{width:.82rem;height:.82rem}
  .btn:hover{background:color-mix(in srgb,var(--neo-cyan) 12%,var(--sapButton_Background,#fff));box-shadow:0 0 12px color-mix(in srgb,var(--neo-cyan) 16%,transparent)}
  .btn:active{transform:translateY(1px)}
  .btn.primary{color:#fff;border-color:transparent;background:linear-gradient(135deg,var(--neo-cyan),color-mix(in srgb,var(--neo-violet) 42%,var(--neo-cyan)));box-shadow:0 2px 10px color-mix(in srgb,var(--neo-cyan) 26%,transparent)}
  .btn.primary:hover{filter:brightness(1.06)}
  .btn.danger{color:var(--sapNegativeTextColor,#b00);border-color:color-mix(in srgb,var(--sapNegativeElementColor,#b00) 26%,transparent);background:color-mix(in srgb,var(--sapNegativeElementColor,#b00) 7%,var(--sapButton_Background,#fff))}
  .btn.danger:hover{background:color-mix(in srgb,var(--sapNegativeElementColor,#b00) 13%,var(--sapButton_Background,#fff));box-shadow:0 0 12px color-mix(in srgb,#b00 14%,transparent)}
  .btn:disabled{opacity:.5;cursor:not-allowed;filter:none;box-shadow:none}
  .status{flex:1 1 auto;text-align:right;font-size:12px;font-weight:600;min-height:16px;color:var(--sapContent_LabelColor,#6a6d70)}
  .status.err{color:var(--sapNegativeTextColor,#b00)}
  .status.ok{color:var(--sapPositiveTextColor,#107e3e)}
  /* 空态 */
  .empty{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:40px;text-align:center;color:var(--sapContent_LabelColor,#6a6d70)}
  .empty-orbit{width:64px;height:64px;border-radius:18px;display:flex;align-items:center;justify-content:center;color:var(--sapGroup_ContentBorderColor, #ffffff);
    background:linear-gradient(135deg,color-mix(in srgb,var(--neo-cyan) 85%,#fff),color-mix(in srgb,var(--neo-violet) 55%,var(--neo-cyan)));box-shadow:0 8px 30px -8px color-mix(in srgb,var(--neo-violet) 55%,transparent),inset 0 0 0 1px rgba(255,255,255,.25)}
  .empty-orbit ui5-icon{width:1.7rem;height:1.7rem}
  .empty-title{font-size:15px;font-weight:700;color:var(--sapTextColor,#1d2d3e)}
  .empty-sub{font-size:13px;line-height:1.6;max-width:340px}
`

export class PortalMenuEditor extends HTMLElement {
  constructor () {
    super()
    this.attachShadow({ mode: 'open' })
    /** @type {any|null} 当前编辑节点 data（null=新增或空态） */
    this._node = null
    /** @type {any|null} 新增态的父节点 data（null=新增根） */
    this._parent = null
    /** @type {boolean} */
    this._isNew = false
    /** @type {boolean} 是否处于空态（未选中） */
    this._empty = true
    /** @type {string} 功能码展示名 */
    this._funCodeLabel = ''
    /** @type {string} 当前功能码 */
    this._funCode = ''
    /** @type {Array<any>|null} 功能码权限缓存（首次打开选择器加载后复用） */
    this._perms = null
  }

  connectedCallback () {
    this._renderStyle()
    this._offSelect = menuBus.on('select', (p) => this._onSelect(p))
    this._offCtx = menuBus.on('ctx', () => { this._perms = null /* DAM 变了功能码缓存作废 */ })
    // 初次挂载：同步总线当前态（explorer 可能已先选）
    if (menuBus.selected) this._onSelect({ node: menuBus.selected, parent: null, isNew: false })
    else this._renderEmpty()
  }

  disconnectedCallback () {
    if (this._offSelect) this._offSelect()
    if (this._offCtx) this._offCtx()
  }

  _setHtml (el, html) {
    // eslint-disable-next-line no-restricted-syntax -- 动态片段已用 escAttr 转义
    el.innerHTML = html
  }

  _renderStyle () {
    const style = document.createElement('style')
    style.textContent = STYLE
    this.shadowRoot.replaceChildren(style)
    this._mount = document.createElement('div')
    this._mount.style.cssText = 'display:flex;flex:1 1 auto;flex-direction:column;min-width:0;min-height:0;width:100%;height:100%'
    this.shadowRoot.appendChild(this._mount)
  }

  _onSelect (p) {
    if (p && p.isNew) {
      this._isNew = true; this._empty = false
      this._node = null; this._parent = p.parent || null
      this._funCode = ''; this._funCodeLabel = ''
      this._renderForm()
    } else if (p && p.node) {
      this._isNew = false; this._empty = false
      this._node = p.node; this._parent = null
      this._funCode = p.node.fun_code || ''
      this._funCodeLabel = '' // 先空，随后异步用权限 name 回显
      this._renderForm()
      if (this._funCode) this._resolveFunCodeLabel(this._funCode)
    } else {
      // 空态（含 DAM 切换后的复位）
      this._isNew = false; this._empty = true; this._node = null; this._parent = null
      this._renderEmpty()
    }
  }

  _renderEmpty () {
    this._setHtml(this._mount, `
      <cmx-empty-state icon="menu2" title="菜单节点编辑" description="在左侧「菜单树」中选择一个节点查看 / 编辑，或点「＋ 根节点」新增。右键节点可打开 workspace 编辑弹框。"></cmx-empty-state>`)
  }

  _renderForm () {
    const d = this._isNew ? null : this._node
    const parentText = this._isNew
      ? (this._parent ? `${this._parent.name || this._parent.code}（${this._parent.code}）` : '（根节点）')
      : (d && d.parent_id ? `${d.parent_code || d.parent_id}` : '（根节点）')
    const openTypeOpts = OPEN_TYPES.map((o) => `<ui5-option value="${o.value}" ${d && d.open_type === o.value ? 'selected' : ''}>${o.value}-${escAttr(o.label)}</ui5-option>`).join('')
    const sortVal = this._isNew ? 1 : (d && Number.isFinite(d.sort_order) ? d.sort_order : 1)

    const headMeta = (!this._isNew && d)
      ? `<div class="head-meta"><span>主键 <b>${escAttr(d.id)}</b></span><span>编码 <b>${escAttr(d.code)}</b></span><span>层级 <b>${escAttr(d.depth)}</b></span></div>`
      : `<div class="head-meta"><span>父节点 <b>${escAttr(parentText)}</b></span></div>`

    this._setHtml(this._mount, `
      <div class="scroll">
        <div class="card">
          <div class="head">
            <div class="head-orbit"><ui5-icon name="${this._isNew ? 'add' : 'edit'}"></ui5-icon></div>
            <div class="head-id">
              <div class="head-title">${this._isNew ? '新增菜单节点' : escAttr(d.name || d.code || '菜单节点')}</div>
              ${headMeta}
            </div>
            <span class="mode-pill ${this._isNew ? 'new' : ''}"><ui5-icon name="${this._isNew ? 'add' : 'edit'}"></ui5-icon>${this._isNew ? '新增' : '编辑'}</span>
          </div>
          <div class="body">
            <div class="cluster">
              <div class="cluster-head"><ui5-icon name="hint"></ui5-icon>基本信息</div>
              <div class="grid">
                <div class="field">
                  <div class="field-top"><label><ui5-icon name="key"></ui5-icon>编码</label>${this._isNew ? '' : '<span class="lock">只读</span>'}</div>
                  <input id="ff-code" value="${this._isNew ? '' : escAttr(d.code)}" ${this._isNew ? 'placeholder="唯一编码，如 fi-gl-xxx"' : 'readonly'}>
                </div>
                <div class="field">
                  <label><ui5-icon name="text"></ui5-icon>名称</label>
                  <input id="ff-name" value="${d ? escAttr(d.name || '') : ''}" placeholder="菜单显示名称">
                </div>
                <div class="field">
                  <label><ui5-icon name="picture"></ui5-icon>图标</label>
                  <input id="ff-icon" value="${d ? escAttr(d.icon || '') : ''}" placeholder="ui5 图标名，如 account">
                </div>
                <div class="field">
                  <label><ui5-icon name="sort"></ui5-icon>排序</label>
                  <input id="ff-sort" type="number" value="${escAttr(sortVal)}">
                </div>
              </div>
            </div>

            <div class="cluster">
              <div class="cluster-head"><ui5-icon name="locked"></ui5-icon>权限 / 行为</div>
              <div class="grid">
                <div class="field wide">
                  <label><ui5-icon name="key-user-settings"></ui5-icon>功能码</label>
                  <div class="funcode">
                    <span id="fc-name" class="fc-name empty">未绑定功能码</span>
                    <span id="fc-code" class="fc-code" style="${this._funCode ? '' : 'display:none'}">${escAttr(this._funCode)}</span>
                    <button id="btn-fc-pick" class="mini-btn" type="button"><ui5-icon name="value-help"></ui5-icon>选择</button>
                    <button id="btn-fc-clear" class="mini-btn ghost" type="button"><ui5-icon name="clear-all"></ui5-icon>清除</button>
                  </div>
                </div>
                <div class="field">
                  <label><ui5-icon name="show"></ui5-icon>可见性</label>
                  <ui5-select id="ff-visible">
                    <ui5-option value="1" ${!d || d.visible === 1 ? 'selected' : ''}>显示</ui5-option>
                    <ui5-option value="0" ${d && d.visible === 0 ? 'selected' : ''}>隐藏</ui5-option>
                  </ui5-select>
                </div>
                <div class="field">
                  <label><ui5-icon name="action-settings"></ui5-icon>打开方式</label>
                  <ui5-select id="ff-opentype">${openTypeOpts}</ui5-select>
                </div>
                <div class="field wide">
                  <label><ui5-icon name="chain-link"></ui5-icon>父节点</label>
                  <input value="${escAttr(parentText)}" readonly>
                </div>
              </div>
            </div>
          </div>
          <div class="actions">
            <button id="btn-save" class="btn primary"><ui5-icon name="${this._isNew ? 'add' : 'save'}"></ui5-icon>${this._isNew ? '创建' : '保存'}</button>
            ${!this._isNew && d ? '<button id="btn-add-child" class="btn"><ui5-icon name="add-activity"></ui5-icon>新增子节点</button>' : ''}
            ${!this._isNew && d ? '<button id="btn-edit-ws" class="btn"><ui5-icon name="request"></ui5-icon>编辑 workspace</button>' : ''}
            ${!this._isNew && d ? '<button id="btn-delete" class="btn danger"><ui5-icon name="delete"></ui5-icon>删除</button>' : ''}
            <span id="ff-status" class="status"></span>
          </div>
        </div>
      </div>`)

    // 回显功能码名（若已解析）
    this._paintFunCode()

    const $ = (id) => this.shadowRoot.getElementById(id)
    $('btn-save').addEventListener('click', () => this._save())
    $('btn-fc-pick').addEventListener('click', () => this._openFunCodePicker())
    $('btn-fc-clear').addEventListener('click', () => {
      this._funCode = ''; this._funCodeLabel = ''; this._paintFunCode()
    })
    if (!this._isNew && d) {
      $('btn-add-child').addEventListener('click', () => menuBus.setNewNode(d))
      $('btn-edit-ws').addEventListener('click', () => this._editWorkspace(d))
      $('btn-delete').addEventListener('click', () => this._delete(d))
    }
  }

  _paintFunCode () {
    const name = this.shadowRoot.getElementById('fc-name')
    const code = this.shadowRoot.getElementById('fc-code')
    if (!name || !code) return
    if (this._funCode) {
      name.textContent = this._funCodeLabel || this._funCode
      name.classList.remove('empty')
      code.textContent = this._funCode
      code.style.display = ''
    } else {
      name.textContent = '未绑定功能码'
      name.classList.add('empty')
      code.style.display = 'none'
    }
  }

  /** 用权限列表解析功能码 → 展示名（修复回显为码的 bug）。 */
  async _resolveFunCodeLabel (code) {
    try {
      if (!this._perms) this._perms = await listMenuPermissions(this._ctx())
      const hit = this._perms.find((p) => p.code === code)
      if (hit && this._funCode === code) { this._funCodeLabel = hit.name || ''; this._paintFunCode() }
    } catch { /* 拿不到就保持显示码 */ }
  }

  _ctx () {
    const c = menuBus.ctx || {}
    return { domain_code: c.domain_code, app_code: c.application_code, module_code: c.module_code }
  }

  _setStatus (msg, kind = '') {
    const s = this.shadowRoot.getElementById('ff-status')
    if (!s) return
    s.textContent = msg
    s.className = 'status' + (kind ? ' ' + kind : '')
  }

  async _save () {
    const $ = (id) => this.shadowRoot.getElementById(id)
    const name = $('ff-name').value.trim()
    if (!name) { this._setStatus('请填写名称', 'err'); $('ff-name').focus(); return }
    const common = {
      name,
      icon: $('ff-icon').value.trim() || null,
      fun_code: this._funCode || null,
      sort_order: parseInt($('ff-sort').value, 10) || 1,
      visible: parseInt($('ff-visible').selectedOption.value, 10),
      open_type: parseInt($('ff-opentype').selectedOption.value, 10),
    }
    this._setStatus('保存中…')
    try {
      if (this._isNew) {
        const code = $('ff-code').value.trim()
        if (!code) { this._setStatus('请填写编码', 'err'); $('ff-code').focus(); return }
        const ctx = menuBus.ctx || {}
        const res = await createMenu({
          code, name: common.name, icon: common.icon, fun_code: common.fun_code,
          sort_order: common.sort_order, visible: common.visible, open_type: common.open_type,
          domain_code: ctx.domain_code, application_code: ctx.application_code, module_code: ctx.module_code,
          parent_id: this._parent ? this._parent.id : null,
        })
        this._setStatus(`已创建 ${code}`, 'ok')
        // 取新建主键（DataSet 形态多样，尽力解析），让树重载后选中
        const newId = this._extractNewId(res)
        menuBus.requestReload({ reason: 'create', selectId: newId })
      } else {
        await updateMenu({ id: this._node.id, data: common })
        this._setStatus('已保存', 'ok')
        menuBus.requestReload({ reason: 'update', selectId: this._node.id })
      }
    } catch (err) {
      this._setStatus(err instanceof Error ? err.message : String(err), 'err')
    }
  }

  /** 尽力从 create 返回的 DataSet 里取出新主键（失败返回空串，树按默认刷新）。 */
  _extractNewId (res) {
    try {
      if (!res) return ''
      // DataSet 形态：{ id:'create_menu'(操作名，非主键), schema, rows:[{ id, ... }] }
      // 故优先从 rows[0].id 取真实雪花主键，不能用顶层 res.id（那是操作名）。
      const rows = res.rows || res.data?.rows || (Array.isArray(res.data) ? res.data : null)
      if (Array.isArray(rows) && rows[0] && typeof rows[0] === 'object') {
        const id = String(rows[0].id ?? rows[0].ID ?? '')
        if (id) return id
      }
      // 兜底：仅当顶层 id 看起来是数字主键（雪花）而非操作名时才用
      if (typeof res.id === 'string' && /^\d{6,}$/.test(res.id)) return res.id
    } catch { /* noop */ }
    return ''
  }

  async _delete (d) {
    const confirmDlg = new CmxFloatingDialog()
    confirmDlg.configure({
      title: '删除确认', icon: 'delete',
      description: `确定删除菜单节点「${d.name || d.code}」？其所有子节点将一并删除，此操作不可恢复。`,
      showConfirm: true, showCancel: true, confirmText: '删除', cancelText: '取消',
      dialogWidth: '440px', dialogHeight: '230px',
    })
    document.body.appendChild(confirmDlg)
    const { action } = await confirmDlg.openModal()
    if (action !== 'confirm') return
    this._setStatus('删除中…')
    try {
      await deleteMenu([d.id])
      this._setStatus('已删除', 'ok')
      menuBus.setSelected(null) // 编辑区复位空态
      menuBus.requestReload({ reason: 'delete' })
    } catch (err) {
      this._setStatus(err instanceof Error ? err.message : String(err), 'err')
    }
  }

  _editWorkspace (d) {
    const def = d.definition && typeof d.definition === 'object' ? d.definition : {}
    const node = {
      _cmxId: d.id, id: d.code, name: d.name,
      caption: def.caption != null ? def.caption : d.name,
      icon: d.icon || '', workspace: def.workspace || {},
      dialogspace: def.dialogspace, expanded: def.expanded, type: def.type,
    }
    this.dispatchEvent(new CustomEvent('nav-edit-node', { bubbles: true, composed: true, detail: { node } }))
  }

  /** 功能码选择器：弹窗 + 搜索 + 表格单选（软过滤，修复恒空 bug）。 */
  async _openFunCodePicker () {
    const dlg = new CmxFloatingDialog()
    const root = document.createElement('div')
    root.className = 'cmx-menu-funcode-picker'
    const style = document.createElement('style')
    style.textContent = `
.cmx-menu-funcode-picker{box-sizing:border-box;display:flex;flex-direction:column;gap:10px;flex:1 1 auto;min-height:0;font-family:var(--sapFontFamily,-apple-system,'Segoe UI','PingFang SC',sans-serif);font-size:13px;color:var(--sapTextColor,#1d2d3e);background:var(--sapGroup_ContentBackground,#fff)}
.cmx-menu-funcode-picker *{box-sizing:border-box}
.cmx-menu-funcode-picker .mfp-note{font-size:11px;color:var(--sapContent_LabelColor,#6a6d70);display:none;align-items:center;gap:6px;padding:6px 9px;border-radius:6px;background:color-mix(in srgb,var(--neo-warn,#f59e0b) 10%,transparent);border:1px solid color-mix(in srgb,var(--neo-warn,#f59e0b) 26%,transparent);color:color-mix(in srgb,var(--neo-warn,#f59e0b) 80%,var(--sapTextColor,#333))}
.cmx-menu-funcode-picker .mfp-note.show{display:flex}
.cmx-menu-funcode-picker .mfp-search{display:flex;align-items:center;gap:8px;flex:0 0 auto}
.cmx-menu-funcode-picker .mfp-search input{flex:1 1 auto;min-width:0;height:32px;border:1px solid color-mix(in srgb,var(--neo-cyan,#00b4d8) 22%,var(--sapField_BorderColor,#89919a));border-radius:8px;padding:0 12px;font-size:13px;background:var(--sapField_Background,#fff);color:var(--sapTextColor,#1d2d3e)}
.cmx-menu-funcode-picker .mfp-search input:focus{outline:none;border-color:color-mix(in srgb,var(--neo-cyan,#00b4d8) 50%,transparent);box-shadow:0 0 0 3px color-mix(in srgb,var(--neo-cyan,#00b4d8) 14%,transparent)}
.cmx-menu-funcode-picker .mfp-cnt{font-size:12px;color:var(--sapContent_LabelColor,#6a6d70);white-space:nowrap}
.cmx-menu-funcode-picker .mfp-table-wrap{flex:1 1 auto;min-height:0;overflow:auto;border:1px solid color-mix(in srgb,var(--neo-cyan,#00b4d8) 12%,var(--sapGroup_TitleBorderColor,#e5e5e5));border-radius:8px;background:var(--sapList_Background,#fff)}
.cmx-menu-funcode-picker table{width:100%;border-collapse:collapse;font-size:12px}
.cmx-menu-funcode-picker thead th{position:sticky;top:0;z-index:1;text-align:left;color:var(--sapContent_LabelColor,#6a6d70);font-weight:700;font-size:11px;letter-spacing:.03em;text-transform:uppercase;padding:9px 12px;border-bottom:1px solid color-mix(in srgb,var(--neo-cyan,#00b4d8) 16%,var(--sapList_TableFooterBorder,#d9d9d9));background:var(--sapList_HeaderBackground,#f7f7f7)}
.cmx-menu-funcode-picker tbody td{padding:8px 12px;border-bottom:1px solid color-mix(in srgb,var(--neo-cyan,#00b4d8) 6%,var(--sapGroup_ContentBorder,#f0f0f0));color:var(--sapTextColor,#1d2d3e)}
.cmx-menu-funcode-picker tbody tr{cursor:pointer;transition:background .1s}
.cmx-menu-funcode-picker tbody tr:hover{background:color-mix(in srgb,var(--neo-cyan,#00b4d8) 6%,var(--sapList_Hover_Background,#f5f5f5))}
.cmx-menu-funcode-picker tbody tr.sel{background:color-mix(in srgb,var(--neo-cyan,#00b4d8) 12%,transparent)}
.cmx-menu-funcode-picker .col-code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11px}
.cmx-menu-funcode-picker .col-dam{font-size:10.5px;color:var(--sapContent_LabelColor,#6a6d70);font-family:ui-monospace,Menlo,Consolas,monospace}
.cmx-menu-funcode-picker .col-op{text-align:right;width:80px}
.cmx-menu-funcode-picker .op-btn{display:inline-flex;align-items:center;height:26px;padding:0 12px;border:1px solid transparent;background:linear-gradient(135deg,var(--neo-cyan,#00b4d8),color-mix(in srgb,var(--neo-violet,var(--neo-violet, #7c3aed)) 40%,var(--neo-cyan,#00b4d8)));color: #fff;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600}
.cmx-menu-funcode-picker .op-btn:hover{filter:brightness(1.06)}
.cmx-menu-funcode-picker .op-cur{color:var(--sapPositiveColor,#107e3e);font-weight:700;font-size:12px}
.cmx-menu-funcode-picker .mfp-state{flex:1 1 auto;display:flex;align-items:center;justify-content:center;color:var(--sapContent_LabelColor,#6a6d70);font-size:13px;min-height:120px}
`
    dlg.configure({
      title: '选择功能码', icon: 'key-user-settings',
      showCancel: true, cancelText: '关闭',
      dialogWidth: '620px', dialogHeight: '500px',
    })
    dlg.setContent(root)
    document.body.appendChild(dlg)

    const renderState = (text) => {
      const s = document.createElement('div')
      s.className = 'mfp-state'
      s.textContent = text
      root.replaceChildren(style, s)
    }
    renderState('加载中…')

    let perms = []
    let unfiltered = false
    try {
      perms = await listMenuPermissions(this._ctx())
      this._perms = perms
      unfiltered = perms.length > 0 && perms.every((p) => p._unfiltered)
    } catch (err) {
      renderState('加载失败：' + (err instanceof Error ? err.message : String(err)))
      await dlg.openModal()
      return
    }

    const curCode = this._funCode || ''

    const note = document.createElement('div')
    note.className = 'mfp-note' + (unfiltered ? ' show' : '')
    this._setHtml(note, '<ui5-icon name="alert" style="width:.85rem;height:.85rem"></ui5-icon>当前模块下无匹配功能码，已展示全部菜单功能码')

    const search = document.createElement('div')
    search.className = 'mfp-search'
    const input = document.createElement('input')
    input.type = 'text'
    input.placeholder = '按编码 / 名称搜索'
    const cnt = document.createElement('span')
    cnt.className = 'mfp-cnt'
    search.append(input, cnt)

    const wrap = document.createElement('div')
    wrap.className = 'mfp-table-wrap'

    const pick = (p) => {
      this._funCode = p.code || ''
      this._funCodeLabel = p.name || ''
      this._paintFunCode()
      dlg.close()
    }
    const render = () => {
      const kw = input.value.trim().toLowerCase()
      const list = perms.filter((p) => {
        if (!kw) return true
        return (p.code || '').toLowerCase().includes(kw) || (p.name || '').toLowerCase().includes(kw)
      })
      cnt.textContent = `共 ${list.length} 条`
      if (list.length === 0) {
        const empty = document.createElement('div')
        empty.className = 'mfp-state'
        empty.textContent = kw ? '无匹配功能码' : '暂无菜单类功能码'
        root.replaceChildren(style, note, search, empty)
        return
      }
      const rows = list.map((p) => {
        const isCur = p.code === curCode
        const dam = [p.domain_code, p.app_code, p.module_code].filter(Boolean).join('/')
        return `<tr data-code="${escAttr(p.code)}" class="${isCur ? 'sel' : ''}">
          <td class="col-code">${escAttr(p.code)}</td>
          <td>${escAttr(p.name)}</td>
          <td class="col-dam">${escAttr(dam)}</td>
          <td class="col-op">${isCur ? '<span class="op-cur">已选</span>' : '<button class="op-btn" type="button">选择</button>'}</td>
        </tr>`
      }).join('')
      this._setHtml(wrap, `<table><thead><tr><th>编码</th><th>名称</th><th>域/应用/模块</th><th class="col-op">操作</th></tr></thead><tbody>${rows}</tbody></table>`)
      wrap.querySelectorAll('tbody tr').forEach((tr) => {
        tr.addEventListener('click', () => {
          const code = tr.getAttribute('data-code')
          const p = perms.find((x) => x.code === code)
          if (p) pick(p)
        })
      })
      root.replaceChildren(style, note, search, wrap)
    }
    input.addEventListener('input', render)
    render()
    await dlg.openModal()
  }
}

if (!customElements.get('portal-menu-editor')) {
  customElements.define('portal-menu-editor', PortalMenuEditor)
}
