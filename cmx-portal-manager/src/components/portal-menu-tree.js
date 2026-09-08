/**
 * <portal-menu-tree> —— 菜单管理「两段式」的 explorer 区：DAM 三联选择 + 菜单树 + 拖拽换父 + 搜索。
 *
 * 与 content 区 <portal-menu-editor> 经模块单例总线 `menuBus` 通信：
 *   - 选中节点 / 新增态 → menuBus.setSelected / setNewNode
 *   - DAM 变更          → menuBus.setCtx（同时清空选中，编辑区复位）
 *   - CRUD 后            → 监听 menuBus 'reload' 重新拉树
 *
 * 视觉：门户 Neo 科技风（--neo-cyan/violet/mint 玻璃拟态），随 --sap* 深浅自适应。
 */
import { registerWorkspaceViewType } from '../lib/workspace-view-renderer.js'
import { getMenuTree, updateMenu } from '../api/menu-api.js'
import { fetchDamRegistry } from '../api/dam-registry-api.js'
import { menuBus } from '../lib/menu-manager-bus.js'
import { escAttr } from '../lib/escape.js'

registerWorkspaceViewType('menu_tree', () =>
  '<portal-menu-tree style="display:flex;flex:1 1 auto;width:100%;height:100%;min-width:0;min-height:0;box-sizing:border-box"></portal-menu-tree>'
)

const STYLE = `
  :host{display:flex;flex:1 1 auto;flex-direction:column;min-width:0;min-height:0;background:var(--dam-body-bg,var(--sapGroup_ContentBackground,#fafafa));color:var(--sapTextColor,#1d2d3e);font-family:var(--sapFontFamily,-apple-system,'Segoe UI','PingFang SC',sans-serif);font-size:13px}
  *{box-sizing:border-box}
  .wrap{display:flex;flex-direction:column;height:100%;min-height:0}
  /* 头部：DAM 选择 */
  .head{flex:0 0 auto;padding:8px 10px 9px;border-bottom:1px solid color-mix(in srgb,var(--neo-cyan) 18%,var(--sapGroup_TitleBorderColor,#d9d9d9));
    background:linear-gradient(120deg,color-mix(in srgb,var(--neo-cyan) 8%,var(--sapObjectHeader_Background,#fff)),color-mix(in srgb,var(--neo-violet) 5%,var(--sapObjectHeader_Background,#fff)))}
  .head-title{display:flex;align-items:center;gap:7px;font-weight:750;font-size:13px;margin-bottom:8px;color:var(--sapTitleColor,#1d2d3e)}
  .head-orbit{width:22px;height:22px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;color:var(--sapGroup_ContentBorderColor, #ffffff);flex:0 0 auto;
    background:linear-gradient(135deg,var(--neo-cyan),color-mix(in srgb,var(--neo-violet) 42%,var(--neo-cyan)));box-shadow:0 0 10px color-mix(in srgb,var(--neo-cyan) 20%,transparent),inset 0 0 0 1px rgba(255,255,255,.22)}
  .head-orbit ui5-icon{width:.82rem;height:.82rem}
  .dam-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}
  .dam-field{min-width:0;display:flex;flex-direction:column;gap:2px}
  .dam-field.wide{grid-column:1/-1}
  .dam-field label{font-size:10px;font-weight:700;letter-spacing:.03em;color:var(--sapContent_LabelColor,#6a6d70);display:inline-flex;align-items:center;gap:4px}
  .dam-field label ui5-icon{width:.7rem;height:.7rem;color:var(--neo-cyan)}
  select{width:100%;height:28px;border:1px solid color-mix(in srgb,var(--neo-cyan) 20%,var(--sapField_BorderColor,#89919a));border-radius:6px;padding:0 22px 0 8px;font:inherit;font-size:12px;font-weight:600;color:var(--sapField_TextColor,var(--sapTextColor,#1d2d3e));
    background:color-mix(in srgb,var(--sapField_Background,#fff) 94%,var(--neo-cyan) 6%);
    appearance:none;-webkit-appearance:none;-moz-appearance:none;cursor:pointer;
    background-image:linear-gradient(45deg,transparent 50%,var(--sapContent_LabelColor,#6a6d70) 50%),linear-gradient(135deg,var(--sapContent_LabelColor,#6a6d70) 50%,transparent 50%);
    background-position:calc(100% - 12px) 50%,calc(100% - 8px) 50%;background-size:4px 4px;background-repeat:no-repeat;transition:border-color .16s ease,box-shadow .16s ease}
  select:focus{outline:none;border-color:color-mix(in srgb,var(--neo-cyan) 48%,transparent);box-shadow:0 0 0 3px color-mix(in srgb,var(--neo-cyan) 14%,transparent)}
  /* 工具条：搜索 + 新增根 */
  .toolbar{flex:0 0 auto;display:flex;align-items:center;gap:6px;padding:7px 10px;border-bottom:1px solid var(--neo-border-subtle,color-mix(in srgb,var(--neo-cyan) 12%,var(--sapGroup_TitleBorderColor,#ddd)))}
  .search{flex:1 1 auto;position:relative;min-width:0}
  .search ui5-icon{position:absolute;left:8px;top:50%;transform:translateY(-50%);width:.8rem;height:.8rem;color:var(--sapContent_LabelColor,#6a6d70);pointer-events:none}
  .search input{width:100%;height:28px;border:1px solid color-mix(in srgb,var(--neo-cyan) 16%,var(--sapField_BorderColor,#89919a));border-radius:999px;padding:0 10px 0 26px;font:inherit;font-size:12px;
    background:color-mix(in srgb,var(--sapField_Background,#fff) 96%,var(--neo-cyan) 4%);color:var(--sapTextColor,#1d2d3e);transition:border-color .16s ease,box-shadow .16s ease}
  .search input:focus{outline:none;border-color:color-mix(in srgb,var(--neo-cyan) 45%,transparent);box-shadow:0 0 0 3px color-mix(in srgb,var(--neo-cyan) 12%,transparent)}
  .btn-add{flex:0 0 auto;height:28px;display:inline-flex;align-items:center;gap:5px;padding:0 11px;border-radius:6px;border:1px solid transparent;cursor:pointer;font:inherit;font-size:12px;font-weight:650;color:var(--sapGroup_ContentBorderColor, #ffffff);
    background:linear-gradient(135deg,var(--neo-cyan),color-mix(in srgb,var(--neo-violet) 40%,var(--neo-cyan)));box-shadow:0 1px 6px color-mix(in srgb,var(--neo-cyan) 22%,transparent);transition:filter .15s ease,box-shadow .15s ease,transform .1s ease}
  .btn-add ui5-icon{width:.8rem;height:.8rem}
  .btn-add:hover{filter:brightness(1.06);box-shadow:0 2px 12px color-mix(in srgb,var(--neo-cyan) 30%,transparent)}
  .btn-add:active{transform:translateY(1px)}
  /* 树 */
  .tree-box{flex:1 1 auto;overflow:auto;padding:6px 6px 2px;min-height:0}
  .tree-node{display:flex;align-items:center;gap:6px;padding:5px 8px;margin:1px 0;border-radius:7px;cursor:pointer;white-space:nowrap;user-select:none;position:relative;
    border:1px solid transparent;transition:background .14s ease,border-color .14s ease,box-shadow .14s ease}
  .tree-node:hover{background:color-mix(in srgb,var(--neo-cyan) 6%,var(--sapList_Hover_Background,#f5f5f5))}
  .tree-node.sel{border-color:color-mix(in srgb,var(--neo-cyan) 45%,transparent);
    background:linear-gradient(90deg,color-mix(in srgb,var(--neo-cyan) 13%,var(--sapList_Background,#fff)),color-mix(in srgb,var(--neo-violet) 6%,var(--sapList_Background,#fff)));
    box-shadow:inset 3px 0 0 var(--neo-cyan),0 0 14px color-mix(in srgb,var(--neo-cyan) 12%,transparent)}
  .tree-node.drop-over{outline:2px dashed var(--neo-cyan);outline-offset:-2px;background:color-mix(in srgb,var(--neo-cyan) 8%,transparent)}
  .tree-node.drop-invalid{outline:2px dashed var(--sapNegativeColor,#bb0000);outline-offset:-2px;background:color-mix(in srgb,var(--sapNegativeColor,#bb0000) 6%,transparent)}
  .tree-node.dragging{opacity:.45}
  .arrow{flex:0 0 auto;width:16px;height:16px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;color:var(--sapContent_IconColor,#6a6d70);transition:transform .14s ease;border-radius:4px}
  .arrow ui5-icon{width:.7rem;height:.7rem}
  .arrow.expanded{transform:rotate(90deg)}
  .arrow.leaf{visibility:hidden;cursor:default}
  .node-ico{flex:0 0 auto;width:22px;height:22px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;color:var(--neo-cyan);
    background:linear-gradient(145deg,color-mix(in srgb,var(--neo-cyan) 12%,var(--sapButton_Lite_Background,#f7f7f7)),color-mix(in srgb,var(--neo-violet) 8%,var(--sapButton_Lite_Background,#f7f7f7)));
    box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--neo-cyan) 16%,transparent)}
  .node-ico ui5-icon{width:.78rem;height:.78rem}
  .tree-node.sel .node-ico{color: #fff;background:linear-gradient(135deg,var(--neo-cyan),color-mix(in srgb,var(--neo-violet) 42%,var(--neo-cyan)))}
  .txt{overflow:hidden;text-overflow:ellipsis;min-width:0;flex:1 1 auto;font-weight:550}
  .badge{flex:0 0 auto;font-size:10px;font-weight:700;padding:0 6px;height:16px;line-height:16px;border-radius:999px;color:var(--neo-violet);
    background:color-mix(in srgb,var(--neo-violet) 10%,transparent);border:1px solid color-mix(in srgb,var(--neo-violet) 24%,transparent)}
  .badge.leaf{color:var(--sapContent_LabelColor,#6a6d70);background:color-mix(in srgb,var(--sapContent_LabelColor,#6a6d70) 8%,transparent);border-color:transparent}
  .root-drop{margin:6px 2px 8px;padding:11px;border:1px dashed color-mix(in srgb,var(--neo-cyan) 24%,var(--sapGroup_TitleBorderColor,#ccc));border-radius:8px;text-align:center;color:var(--sapContent_LabelColor,#6a6d70);font-size:12px;display:flex;align-items:center;justify-content:center;gap:6px}
  .root-drop ui5-icon{width:.85rem;height:.85rem;color:color-mix(in srgb,var(--neo-cyan) 55%,var(--sapContent_LabelColor,#6a6d70))}
  .root-drop.drop-over{border-color:var(--neo-cyan);background:color-mix(in srgb,var(--neo-cyan) 8%,transparent);color:var(--neo-cyan)}
  /* 状态区 */
  .hint{padding:24px 16px;color:var(--sapContent_LabelColor,#6a6d70);font-size:13px;text-align:center;line-height:1.6}
  .hint.err{color:var(--sapNegativeColor,#bb0000)}
  .empty{display:flex;flex-direction:column;align-items:center;gap:10px;padding:34px 16px;color:var(--sapContent_LabelColor,#6a6d70);text-align:center}
  .empty ui5-icon{width:1.6rem;height:1.6rem;color:color-mix(in srgb,var(--neo-cyan) 50%,var(--sapContent_LabelColor,#6a6d70));opacity:.8}
  .toast{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);z-index:20;display:none;align-items:center;gap:7px;padding:8px 14px;border-radius:8px;font-size:12px;font-weight:600;box-shadow:0 6px 18px rgba(0,0,0,.16);max-width:90%}
  .toast.show{display:inline-flex}
  .toast.ok{color:var(--sapPositiveTextColor,#107e3e);background:color-mix(in srgb,#107e3e 10%,#fff);border:1px solid color-mix(in srgb,#107e3e 24%,transparent)}
  .toast.err{color:var(--sapNegativeTextColor,#b00);background:color-mix(in srgb,#b00 10%,#fff);border:1px solid color-mix(in srgb,#b00 24%,transparent)}
`

export class PortalMenuTree extends HTMLElement {
  constructor () {
    super()
    this.attachShadow({ mode: 'open' })
    /** @type {{domains:any[],applications:any[],modules:any[]}|null} */
    this._registry = null
    this._ctx = { domain_code: '', application_code: '', module_code: '' }
    /** @type {any[]|null} 菜单树（TreeNode[]） */
    this._tree = null
    /** @type {Set<string>} 展开的节点主键集合 */
    this._expanded = new Set()
    /** @type {string} 选中节点主键 */
    this._selectedId = ''
    /** @type {any|null} 拖拽中的节点 data */
    this._dragged = null
    /** @type {string} 搜索关键字 */
    this._kw = ''
    /** @type {Map<string, any>} id → node.data 索引（供祖先判定） */
    this._index = new Map()
    /** @type {Map<string, string|null>} id → parent_id 索引 */
    this._parentOf = new Map()
    this._toastTimer = null
  }

  connectedCallback () {
    this._renderShell()
    this._wireShell()
    // 订阅：编辑区 CRUD 成功后请求重载
    this._offReload = menuBus.on('reload', (opts) => {
      if (this._ctx.module_code) this._loadTree(opts && opts.selectId)
    })
    // 兼容既有 workspace 编辑弹框保存事件（写回 definition 后刷新树）
    this._onMenuNodeSaved = () => { if (this._ctx.module_code) this._loadTree() }
    window.addEventListener('menu-node-saved', this._onMenuNodeSaved)
    this._loadRegistry()
  }

  disconnectedCallback () {
    if (this._offReload) this._offReload()
    if (this._onMenuNodeSaved) window.removeEventListener('menu-node-saved', this._onMenuNodeSaved)
  }

  _setHtml (el, html) {
    // eslint-disable-next-line no-restricted-syntax -- 动态片段已用 escAttr/escHtml 转义
    el.innerHTML = html
  }

  _renderShell () {
    this._setHtml(this.shadowRoot, `<style>${STYLE}</style>
      <div class="wrap">
        <div class="head">
          <div class="head-title"><span class="head-orbit"><ui5-icon name="tree"></ui5-icon></span><span>菜单树</span></div>
          <div class="dam-grid">
            <div class="dam-field"><label><ui5-icon name="globe"></ui5-icon>域</label><select id="sel-domain"></select></div>
            <div class="dam-field"><label><ui5-icon name="grid"></ui5-icon>应用</label><select id="sel-app"></select></div>
            <div class="dam-field wide"><label><ui5-icon name="folder"></ui5-icon>模块</label><select id="sel-module"></select></div>
          </div>
        </div>
        <div class="toolbar">
          <span class="search"><ui5-icon name="search"></ui5-icon><input id="kw" type="text" placeholder="搜索菜单名称 / 编码" autocomplete="off"></span>
          <button id="btn-add-root" class="btn-add" title="新增根节点"><ui5-icon name="add"></ui5-icon>根节点</button>
        </div>
        <div class="tree-box" id="tree-box"><div class="hint">加载中…</div></div>
        <div class="toast" id="toast"></div>
      </div>`)
  }

  _wireShell () {
    const $ = (id) => this.shadowRoot.getElementById(id)
    $('btn-add-root').addEventListener('click', () => {
      this._selectedId = ''
      this._paintSelection()
      menuBus.setNewNode(null)
    })
    $('sel-domain').addEventListener('change', (e) => this._onDomainChange(e.target.value))
    $('sel-app').addEventListener('change', (e) => this._onAppChange(e.target.value))
    $('sel-module').addEventListener('change', (e) => this._onModuleChange(e.target.value))
    $('kw').addEventListener('input', (e) => { this._kw = e.target.value.trim().toLowerCase(); this._renderTree() })
  }

  _onDomainChange (domain) {
    this._ctx.domain_code = domain
    const apps = this._appsOf(domain)
    this._ctx.application_code = apps[0]?.id || ''
    this._ctx.module_code = this._modulesOf(domain, this._ctx.application_code)[0]?.id || ''
    this._renderSelects()
    this._publishCtxAndLoad()
  }

  _onAppChange (app) {
    this._ctx.application_code = app
    this._ctx.module_code = this._modulesOf(this._ctx.domain_code, app)[0]?.id || ''
    this._renderSelects()
    this._publishCtxAndLoad()
  }

  _onModuleChange (mod) {
    this._ctx.module_code = mod
    this._publishCtxAndLoad()
  }

  /** DAM 变更：广播 ctx（总线内会清空选中→编辑区复位，修复「切换后残留」bug）+ 重载树。 */
  _publishCtxAndLoad () {
    this._selectedId = ''
    menuBus.setCtx({ ...this._ctx })
    this._loadTree()
  }

  async _loadRegistry () {
    try {
      this._registry = await fetchDamRegistry(false)
    } catch {
      this._registry = { domains: [], applications: [], modules: [] }
    }
    const d = this._registry.domains
    const find = (arr, v) => arr.find((x) => x.id === v)
    this._ctx.domain_code = find(d, 'fi')?.id || d[0]?.id || ''
    const apps = this._appsOf(this._ctx.domain_code)
    this._ctx.application_code = find(apps, 'cmxfico')?.id || apps[0]?.id || ''
    const mods = this._modulesOf(this._ctx.domain_code, this._ctx.application_code)
    this._ctx.module_code = find(mods, 'gl')?.id || mods[0]?.id || ''
    this._renderSelects()
    // 初次也广播一次 ctx，编辑区（若已挂载）拿到功能码过滤上下文
    menuBus.setCtx({ ...this._ctx })
    if (this._ctx.module_code) this._loadTree()
    else this._setHtml(this.shadowRoot.getElementById('tree-box'), '<div class="hint">请选择域 / 应用 / 模块。</div>')
  }

  _appsOf (domain) {
    if (!this._registry) return []
    return this._registry.applications.filter((a) => (a.domain || '') === domain)
  }

  _modulesOf (domain, app) {
    if (!this._registry) return []
    return this._registry.modules.filter((m) => (m.domain || '') === domain && (m.application || m.app || '') === app)
  }

  _renderSelects () {
    const $ = (id) => this.shadowRoot.getElementById(id)
    if (!this._registry) return
    const opt = (list, cur) => list.map((x) => `<option value="${escAttr(x.id)}" ${x.id === cur ? 'selected' : ''}>${escAttr(x.name || x.title || x.id)}</option>`).join('')
    this._setHtml($('sel-domain'), opt(this._registry.domains, this._ctx.domain_code))
    this._setHtml($('sel-app'), opt(this._appsOf(this._ctx.domain_code), this._ctx.application_code))
    this._setHtml($('sel-module'), opt(this._modulesOf(this._ctx.domain_code, this._ctx.application_code), this._ctx.module_code))
  }

  async _loadTree (selectId) {
    if (!this._ctx.module_code) return
    const box = this.shadowRoot.getElementById('tree-box')
    this._setHtml(box, '<div class="hint">加载中…</div>')
    try {
      this._tree = await getMenuTree(this._ctx)
      this._buildIndex()
      // 默认展开根节点
      this._expanded = new Set((this._tree || []).map((n) => n.data?.id).filter(Boolean))
      menuBus.publishTree(this._tree)
      this._renderTree()
      // CRUD 后可指定重新选中某节点（如新建成功）
      if (selectId && this._index.has(selectId)) {
        this._selectedId = selectId
        this._paintSelection()
        menuBus.setSelected(this._index.get(selectId))
      }
    } catch (err) {
      this._setHtml(box, `<div class="hint err">加载失败：${escAttr(err instanceof Error ? err.message : String(err))}</div>`)
    }
  }

  /** 建立 id→data / id→parent_id 索引（供祖先判定，替代 code_path）。 */
  _buildIndex () {
    this._index = new Map()
    this._parentOf = new Map()
    const walk = (nodes) => {
      for (const n of nodes || []) {
        const d = n.data || {}
        if (d.id) {
          this._index.set(d.id, d)
          this._parentOf.set(d.id, d.parent_id || null)
        }
        if (Array.isArray(n.children) && n.children.length) walk(n.children)
      }
    }
    walk(this._tree)
  }

  /** target 是否是 dragged 的自身或子孙（按 parent_id 向上回溯 target 的祖先链）。 */
  _isSelfOrDescendant (draggedId, targetId) {
    if (!draggedId || !targetId) return false
    let cur = targetId
    const guard = new Set()
    while (cur) {
      if (cur === draggedId) return true
      if (guard.has(cur)) break // 防御既有环
      guard.add(cur)
      cur = this._parentOf.get(cur) || null
    }
    return false
  }

  _renderTree () {
    const box = this.shadowRoot.getElementById('tree-box')
    box.replaceChildren()
    if (!this._tree || this._tree.length === 0) {
      this._setHtml(box, `<cmx-empty-state icon="tree" title="该模块暂无菜单数据" description="可点上方「根节点」新增，或先执行迁移 SQL 导入" size="sm"></cmx-empty-state>`)
      return
    }
    const frag = document.createDocumentFragment()
    // 搜索时：命中节点及其祖先链均显示，并强制展开
    const matchSet = this._kw ? this._computeMatches() : null
    for (const node of this._tree) {
      const el = this._renderTreeNode(node, 0, matchSet)
      if (el) frag.appendChild(el)
    }
    box.appendChild(frag)
    // 根放置区
    const root = document.createElement('div')
    root.className = 'root-drop'
    this._setHtml(root, '<ui5-icon name="arrow-top"></ui5-icon>拖到此处成为根节点')
    root.addEventListener('dragover', (e) => { if (!this._dragged) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; root.classList.add('drop-over') })
    root.addEventListener('dragleave', () => root.classList.remove('drop-over'))
    root.addEventListener('drop', (e) => { e.preventDefault(); root.classList.remove('drop-over'); this._reparent(this._dragged, null) })
    box.appendChild(root)
    this._paintSelection()
  }

  /** 计算搜索命中集合（含命中节点的所有祖先，保证可见路径）。 */
  _computeMatches () {
    const set = new Set()
    const kw = this._kw
    const hit = (d) => (d.name || '').toLowerCase().includes(kw) || (d.code || '').toLowerCase().includes(kw)
    const walk = (nodes, ancestors) => {
      for (const n of nodes || []) {
        const d = n.data || {}
        const chain = [...ancestors, d.id]
        if (hit(d)) chain.forEach((id) => id && set.add(id))
        if (Array.isArray(n.children) && n.children.length) walk(n.children, chain)
      }
    }
    walk(this._tree, [])
    return set
  }

  _renderTreeNode (node, depth, matchSet) {
    const data = node.data || {}
    if (matchSet && !matchSet.has(data.id)) return null
    const hasKids = Array.isArray(node.children) && node.children.length > 0
    const expanded = matchSet ? true : this._expanded.has(data.id)
    const wrap = document.createElement('div')

    const el = document.createElement('div')
    el.className = 'tree-node'
    el.style.paddingLeft = `${depth * 16 + 6}px`
    el._nodeData = data
    el.dataset.id = data.id || ''
    el.draggable = true

    const arrow = document.createElement('span')
    arrow.className = 'arrow' + (hasKids ? (expanded ? ' expanded' : '') : ' leaf')
    this._setHtml(arrow, '<ui5-icon name="navigation-right-arrow"></ui5-icon>')
    if (hasKids && !matchSet) {
      arrow.title = expanded ? '折叠' : '展开'
      arrow.addEventListener('click', (e) => { e.stopPropagation(); this._toggleExpand(data.id) })
    }
    el.appendChild(arrow)

    const ico = document.createElement('span')
    ico.className = 'node-ico'
    const iconName = this._safeIcon(data.icon) || (hasKids ? 'folder' : 'document')
    this._setHtml(ico, `<ui5-icon name="${escAttr(iconName)}"></ui5-icon>`)
    el.appendChild(ico)

    const txt = document.createElement('span')
    txt.className = 'txt'
    txt.textContent = data.name || data.code || '(未命名)'
    el.appendChild(txt)
    // 编码与层级信息用原生 tooltip 展示，避免在窄侧栏挤占名称显示宽度
    el.title = `${data.name || ''}${data.code ? ' · ' + data.code : ''}`

    const badge = document.createElement('span')
    if (hasKids) { badge.className = 'badge'; badge.textContent = String(node.children.length) }
    else { badge.className = 'badge leaf'; badge.textContent = '叶' }
    el.appendChild(badge)

    el.addEventListener('click', () => this._select(data))
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); this._select(data); this._editWorkspace(data) })
    el.addEventListener('dragstart', (e) => {
      this._dragged = data; el.classList.add('dragging')
      e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', data.id || '')
    })
    el.addEventListener('dragend', () => { el.classList.remove('dragging'); this._dragged = null })
    el.addEventListener('dragover', (e) => {
      if (!this._dragged) return
      e.preventDefault(); e.dataTransfer.dropEffect = 'move'
      const invalid = this._isSelfOrDescendant(this._dragged.id, data.id)
      el.classList.toggle('drop-invalid', invalid)
      el.classList.toggle('drop-over', !invalid)
    })
    el.addEventListener('dragleave', () => { el.classList.remove('drop-over'); el.classList.remove('drop-invalid') })
    el.addEventListener('drop', (e) => {
      e.preventDefault(); e.stopPropagation()
      el.classList.remove('drop-over'); el.classList.remove('drop-invalid')
      this._reparent(this._dragged, data)
    })

    wrap.appendChild(el)
    if (hasKids && expanded) {
      for (const ch of node.children) {
        const childEl = this._renderTreeNode(ch, depth + 1, matchSet)
        if (childEl) wrap.appendChild(childEl)
      }
    }
    return wrap
  }

  _safeIcon (name) {
    const s = String(name || '').trim()
    // 允许 ui5 标准名与 collection/name 形式；非法则不用（回退默认）
    return /^[a-z0-9-]+(\/[a-z0-9-]+)?$/i.test(s) ? s : ''
  }

  _toggleExpand (id) {
    if (this._expanded.has(id)) this._expanded.delete(id)
    else this._expanded.add(id)
    this._renderTree()
  }

  _select (data) {
    this._selectedId = data?.id || ''
    this._paintSelection()
    menuBus.setSelected(data)
  }

  _paintSelection () {
    this.shadowRoot.querySelectorAll('.tree-node').forEach((n) => {
      n.classList.toggle('sel', n.dataset.id === this._selectedId && !!this._selectedId)
    })
  }

  /**
   * 拖拽换父：更新 parent_id（后端级联重算路径/depth/leaf）。
   * 修复：环检测改为在已加载树上按 parent_id 判定 target 是否为 dragged 的自身/子孙
   * （原实现依赖 code_path，但 /api/menu/tree 不返回该字段 → 守卫恒失效、可拖成环损坏树）。
   */
  async _reparent (dragged, target) {
    if (!dragged) return
    if (target && dragged.id === target.id) { this._dragged = null; return }
    if (target && this._isSelfOrDescendant(dragged.id, target.id)) {
      this._toast('不能移动到自身或其子孙节点下', 'err'); this._dragged = null; return
    }
    // 已是目标父的子节点 / 已是根：无需操作
    if (target && dragged.parent_id === target.id) { this._dragged = null; return }
    if (!target && (dragged.parent_id == null || dragged.parent_id === '')) { this._dragged = null; return }
    try {
      await updateMenu({ id: dragged.id, data: { parent_id: target ? target.id : null } })
      this._toast(`已将「${dragged.name || dragged.code}」移至${target ? '「' + (target.name || target.code) + '」下' : '根节点'}`, 'ok')
      // 保持选中并展开新父
      if (target) this._expanded.add(target.id)
      this._selectedId = dragged.id
      await this._loadTree(dragged.id)
    } catch (err) {
      this._toast(err instanceof Error ? err.message : String(err), 'err')
    } finally {
      this._dragged = null
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

  _toast (msg, kind = 'ok') {
    const t = this.shadowRoot.getElementById('toast')
    if (!t) return
    t.className = `toast show ${kind}`
    t.textContent = msg
    if (this._toastTimer) clearTimeout(this._toastTimer)
    this._toastTimer = setTimeout(() => { t.className = 'toast' }, 3000)
  }
}

if (!customElements.get('portal-menu-tree')) {
  customElements.define('portal-menu-tree', PortalMenuTree)
}
