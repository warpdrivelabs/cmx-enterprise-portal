/**
 * <cmx-combo-box> — 数据模型驱动的下拉/树/网格选择器。
 *
 * @component
 * @fires cmx-combo-value-change - 选中值变更，detail: { id, row, source: 'click'|'keyboard'|'api'|'clear' }
 * @fires cmx-combo-open - 弹出层打开，detail: { mode }
 * @fires cmx-combo-close - 弹出层关闭，detail: { committed: boolean }
 * @fires cmx-combo-search - 输入搜索，detail: { text }
 * @fires cmx-combo-search-error - 搜索出错，detail: { error }
 * @fires cmx-combo-clear - 清空选中值，detail: {}
 * @fires cmx-combo-ext-click - 扩展按钮点击，detail: { id, value, row }
 *
 * 标签属性（声明式 data-*，connectedCallback 解析；无 observedAttributes）：
 * @prop {('list'|'tree'|'grid')} [data-cmx-mode] - 弹出层形式，默认 'list'
 * @prop {string} [data-cmx-placeholder] - 输入框占位文本
 * @prop {boolean} [data-cmx-readonly] - 'true' 时只读
 * @prop {boolean} [data-cmx-searchable] - 'false' 关闭搜索
 * @prop {string} [data-cmx-value] - 当前选中 row.id
 * @prop {boolean} [data-cmx-clearable] - 'false' 隐藏清空按钮
 * @prop {object} [data-cmx-extension-buttons] - JSON 扩展按钮规格数组
 * @prop {boolean} [data-cmx-paginated] - 'true' 启用分页
 * @prop {number} [data-cmx-page-size] - 分页大小
 * @prop {object} [data-cmx-options] - JSON 选项集
 * @prop {object} [data-cmx-rows] - JSON 本地数据行
 * @prop {boolean} [data-cmx-fill-host] - 存在时撑满宿主容器
 *
 * 三种弹出模式（dropdown 属性 / setMode 切换）：
 *   - 'list' / 'grid'：复用 <cmx-revo-grid>。list 模式额外把表头隐藏、行高调矮、只取
 *                     CmxColumnModel.getTitleColIds() 拼一个标题列；grid 模式完整列显示。
 *   - 'tree'        ：复用 <cmx-web-treeview>，CmxDataSet 直传，parentField 决定层级。
 *
 * 数据：CmxDataSet + CmxColumnModel；远端数据通过 createPageServiceDataSource 包装。
 *
 * 集成入口：
 *   1) 独立使用：手工 setDataSet / setColumnModel + setMode + setValue / getValue
 *   2) form / grid 编辑器：通过 'combo' field-type 注册（见 cmx-builtin-field-types.js）
 *      读 field.editSettings.{ source, dropdown, parentField, dropdownColumns, ... }
 *
 * 公开 API（与 cmx-* 体系命名风格一致）：
 *   setDataSet(ds)                              直接灌一个 CmxDataSet（适合本地数据/已加载数据）
 *   setColumnModel(model)                       绑定 CmxColumnModel
 *   setMode('list'|'tree'|'grid')               切弹出层形式
 *   setDataSource(source)                       绑定 DataSource（远端搜索源）
 *   setField(field)                             一键绑定 field 配置（form/grid 编辑器路径用）
 *   setHost(host)                               传入页面 host（用于解析 pageService）
 *   setValue(id)                                按 row.id 选中（找不到时调 lookupByKey 异步回填）
 *   getValue()                                  -> string | null
 *   getSelectedRow()                            -> CmxRowSet | null
 *   open() / close() / toggle() / isOpen()
 *   focus()                                     聚焦输入框
 *
 * 事件（bubbles + composed，全 cmx-* 前缀，与 cmx-revo-grid 风格一致）：
 *   cmx-combo-value-change   { id, row, source: 'click'|'keyboard'|'api' }
 *   cmx-combo-open           { mode }
 *   cmx-combo-close          { committed: boolean }
 *   cmx-combo-search         { text }
 *   cmx-combo-search-error   { error }
 */

import { CmxDataSet } from '../lib/cmx-data-set.js'
import { CmxColumn } from '../lib/cmx-column.js'
import { CmxColumnModel } from '../lib/cmx-column-model.js'
import { searchAsync, lookupByKeyAsync, debounceForSource } from '../lib/cmx-async-source.js'
import { createPageServiceDataSource } from '../lib/cmx-page-service-source.js'
/* 确保两个内嵌组件已注册（import 副作用） */
import './cmx-revo-grid.js'
import './cmx-web-treeview.js'

const DROPDOWN_MODES = new Set(['list', 'tree', 'grid'])

export class CmxComboBox extends HTMLElement {
  constructor () {
    super()
    this._mode = 'list'                   // 'list' | 'tree' | 'grid'
    this._open = false                    // 弹出层是否展开
    this._readonly = false                // 是否只读（true 时禁止编辑/下拉选择）
    this._searchable = true               // 是否启用输入搜索
    this._placeholder = ''                // 输入框占位文本
    this._value = null                    // 当前选中 row.id（string|null）
    this._displayText = ''                // 输入框当前显示文本
    this._field = null                    // form/grid 注入的 field（含 editSettings）
    this._host = null                     // page host（pageService 解析所需）
    /** @type {import('../lib/cmx-data-set.js').CmxDataSet|null} 外部传入的本地 ds（直接绑） */
    this._externalDs = null
    /** @type {import('../lib/cmx-column-model.js').CmxColumnModel|null} */
    this._columnModel = null
    this._parentField = ''                // tree 模式专用：父子关系字段
    this._dropdownColumns = null          // grid 模式专用：自定义列模型；缺省复用 _columnModel
    this._dropdownWidth = 'anchor'        // 'anchor' = 与输入框同宽，或 CSS 字符串
    this._dropdownMaxHeight = '320px'     // 弹出层内容区最大高度（CSS 字符串）
    this._emptyText = '无匹配数据'         // 无数据时的空状态提示文案
    /** @type {object|null} 远端 DataSource（含 search/loadByKeys/keyField/labelField） */
    this._dataSource = null
    /** @type {import('../lib/cmx-data-set.js').CmxDataSet} 弹出层共用的内部 ds */
    this._innerDs = new CmxDataSet({ datasetId: 'combo-inner' })
    /** @type {Map<string, object>} 已知 id → row 的小镜像（用于显示文本/setValue 异步前回退） */
    this._knownRows = new Map()
    /** 标记当前 displayText 是否已根据 value 的 lookup 完成 */
    this._pendingLookupKey = null
    /** debounce 包装：每个 DataSource 不同实例有自己的 timer，按 ds 重建 */
    this._debouncedSearch = null
    /** 内部 dropdown 子组件引用 */
    this._gridEl = null                   // list/grid 模式内嵌的 <cmx-revo-grid>
    this._treeEl = null                   // tree 模式内嵌的 <cmx-web-treeview>
    this._activeChild = null              // 'grid' | 'tree' | null（当前激活的弹出子组件类型）
    /** 输入框、popover 引用 */
    this._inputEl = null                  // <ui5-input> 输入框
    this._popoverEl = null                // <ui5-popover> 弹出层
    this._busyEl = null                   // 加载中状态栏（含 busy-indicator）
    this._emptyEl = null                  // 空数据提示元素
    this._errorEl = null                  // 错误信息元素
    /** 输入框右侧按钮组 */
    this._clearBtn = null                 // 清空选中值按钮
    this._caretBtn = null                 // 展开/收起下拉按钮
    this._extBtnsEl = null                // 扩展按钮容器
    /** 清除按钮是否启用（默认开；有 value 时可见，无 value 时隐藏） */
    this._clearable = true
    /** @type {Array<{id?: string, icon?: string, tooltip?: string, design?: string}>}
     *  扩展按钮列表（放在下拉按钮右侧，可多个）。点击派 `cmx-combo-ext-click` { id }。 */
    this._extensionButtons = []
    /** 分页：仅 grid 模式 + remote source 时启用 */
    this._paginated = false
    this._page = 1                        // 当前页码（从 1 起）
    this._pageSize = 50                   // 每页条数
    this._total = null            // null = 未知（远端未返回 total）
    /** 分页 footer DOM refs */
    this._pagerEl = null                  // 分页 footer 容器
    this._pagerInfoEl = null              // 分页信息文本（第 x / y 页）
    this._pagerFirstBtn = null            // 首页按钮
    this._pagerPrevBtn = null             // 上一页按钮
    this._pagerNextBtn = null             // 下一页按钮
    this._pagerLastBtn = null             // 末页按钮
    /** 防止在 setValue 同步回填时反向触发 cmx-combo-value-change */
    this._suppressEmit = false
    /** 防止 input 'input' 事件 与 popover open 同步互相覆盖 */
    this._openSource = null
  }

  // ── 生命周期 ───────────────────────────────────────────────────────────

  /** 首次插入文档时挂载 Shadow DOM、渲染模板、绑定事件、解析声明式属性。 */
  connectedCallback () {
    if (this.shadowRoot) return
    this.attachShadow({ mode: 'open' })
    this._render()
    this._wireEvents()
    this._bootstrapFromAttributes()
    /* field 在 attribute 解析后绑定一次（field 可以由 setField 后续覆盖） */
    if (this._field) this._applyField(this._field)
    else this._applyMode()
    this._writeDisplayToInput()
  }

  /** 从文档移除时解绑 columnModel 监听器，避免内存泄漏。 */
  disconnectedCallback () {
    /* 移除模型监听 */
    if (this._columnModelListener && this._columnModel) {
      try { this._columnModel.removeEventListener('columns-changed', this._columnModelListener) } catch (_) {}
    }
    this._columnModelListener = null
  }

  // ── 公开 API ───────────────────────────────────────────────────────────

  /**
   * 绑定外部 CmxDataSet（本地数据/已加载数据直接灌入）。
   * @param {import('../lib/cmx-data-set.js').CmxDataSet|null} ds - 外部数据集
   */
  setDataSet (ds) {
    this._externalDs = ds || null
    if (ds) {
      for (const r of ds.rows) this._knownRows.set(String(r.id), r)
    }
    this._syncInnerDsFromExternal()
    this._writeDisplayToInput()
  }

  /**
   * 绑定 CmxColumnModel，并监听 columns-changed 事件自动刷新子组件列定义。
   * @param {import('../lib/cmx-column-model.js').CmxColumnModel|null} model - 列模型
   */
  setColumnModel (model) {
    if (this._columnModel && this._columnModelListener) {
      try { this._columnModel.removeEventListener('columns-changed', this._columnModelListener) } catch (_) {}
    }
    this._columnModel = model || null
    if (model && typeof model.addEventListener === 'function') {
      this._columnModelListener = () => this._refreshChildColumnModel()
      model.addEventListener('columns-changed', this._columnModelListener)
    }
    this._refreshChildColumnModel()
    this._writeDisplayToInput()
  }

  /**
   * 切换弹出层形式。非法值回退为 'list'。
   * @param {('list'|'tree'|'grid')} mode - 弹出层模式
   */
  setMode (mode) {
    const next = DROPDOWN_MODES.has(mode) ? mode : 'list'
    if (this._mode === next) return
    this._mode = next
    if (this.shadowRoot) this._applyMode()
  }

  /**
   * 绑定远端 DataSource（提供 search/loadByKeys/keyField/labelField）。
   * @param {object|null} source - 远端数据源，传 null 解绑
   */
  setDataSource (source) {
    this._dataSource = source || null
    this._debouncedSearch = null
  }

  /**
   * 一键绑定 field 配置（form/grid 编辑器路径用），从中派生模式/数据源/列等全部参数。
   * @param {object|null} field - field 配置对象（含 editSettings）
   */
  setField (field) {
    this._field = field || null
    if (this.shadowRoot) this._applyField(this._field)
  }

  /**
   * 传入页面 host（用于解析 pageService）；host 变更后若已绑定 field 会按需重建数据源。
   * @param {object|null} host - 页面宿主对象
   */
  setHost (host) {
    this._host = host || null
    /* host 变了，pageService source 可能要重建：在 _applyField 时按需重建 */
    if (this._field) this._applyField(this._field)
  }

  /**
   * 设置输入框占位文本。
   * @param {string} text - 占位文本
   */
  setPlaceholder (text) {
    this._placeholder = String(text || '')
    if (this._inputEl) this._inputEl.placeholder = this._placeholder
  }

  /**
   * 设置只读状态；只读时禁止编辑且隐藏清空按钮。
   * @param {boolean} b - 是否只读
   */
  setReadonly (b) {
    this._readonly = !!b
    if (this._inputEl) {
      if (this._readonly) this._inputEl.setAttribute('readonly', '')
      else this._inputEl.removeAttribute('readonly')
    }
    this._updateClearVisibility()
  }

  /**
   * 设置是否启用输入搜索。
   * @param {boolean} b - 是否可搜索
   */
  setSearchable (b) {
    this._searchable = !!b
  }

  /**
   * 设置弹出层宽度。'anchor' 表示与输入框同宽，其余值作为 CSS 宽度字符串。
   * @param {string|null} css - 宽度值，如 '300px' / '50%' / 'anchor'
   */
  setDropdownWidth (css) {
    this._dropdownWidth = css || 'anchor'
  }

  /**
   * 设置弹出层内容区最大高度（数字自动转 px）。
   * @param {number|string} px - 像素数值或 CSS 字符串，如 320 / '320px'
   */
  setItemsHeight (px) {
    this._dropdownMaxHeight = typeof px === 'number' ? `${px}px` : String(px || '320px')
  }

  /** 是否启用清除按钮（默认 true）；启用后，当 value 非空时按钮自动可见。 */
  setClearable (b) {
    this._clearable = !!b
    this._updateClearVisibility()
  }

  /**
   * 设置扩展按钮列表（下拉按钮右侧，可多个）。点击派 `cmx-combo-ext-click` { id, value, row }.
   * @param {Array<{id?: string, icon?: string, tooltip?: string, design?: string}>|null} list
   *   - id：业务标识；缺省自动 `ext-0/1/2...`
   *   - icon：UI5 icon name，缺省 'action'
   *   - tooltip：按钮 title 提示
   *   - design：保留参数（暂用 button hover 样式）
   */
  setExtensionButtons (list) {
    this._extensionButtons = Array.isArray(list) ? list.slice() : []
    this._renderExtensionButtons()
  }

  /**
   * 启用 / 关闭分页（仅 grid 模式生效，且需要 source 提供 total）。
   * 开启后 footer 显示「当前页 / 总页数 + 首/上/下/末」按钮，翻页直接调 source.search 并替换 inner ds 行。
   */
  setPaginated (b) {
    this._paginated = !!b
    this._refreshPagerVisibility()
  }

  /** 设置每页大小（同时影响远端请求 pageSize 参数）；默认走 dataSource.pageSize。 */
  setPageSize (n) {
    const v = Math.max(1, Number(n) || 50)
    this._pageSize = v
  }

  /**
   * 按 row.id 设置当前选中值。本地无匹配行时调用 lookupByKey 异步回填显示文本。
   * @param {string|null} id - 目标行 id；传 null/空串清空
   * @param {{silent?: boolean, source?: string}} [opts] - silent=true 不派发事件；source 标记变更来源
   */
  setValue (id, opts = {}) {
    const norm = id == null || id === '' ? null : String(id)
    if (norm === this._value) return
    this._value = norm
    this._writeDisplayToInput()
    if (norm != null) {
      /* 异步把行查回来填显示 */
      this._lookupAndFillDisplay(norm)
    }
    if (!opts.silent) {
      this._emitValueChange(opts.source || 'api')
    }
  }

  /** @returns {string|null} 当前选中行 id */
  getValue () { return this._value }

  /**
   * 取当前选中行对象（依次从 _knownRows / _innerDs / _externalDs 查找）。
   * @returns {import('../lib/cmx-data-set.js').CmxRowSet|object|null}
   */
  getSelectedRow () {
    if (this._value == null) return null
    const k = String(this._value)
    return this._knownRows.get(k) || this._innerDs.getRow(k) || (this._externalDs?.getRow(k) ?? null)
  }

  /** 打开弹出层；首次打开且为远端数据源时触发一次空查询拉首页数据。派发 cmx-combo-open。 */
  open () {
    if (this._open || this._readonly) return
    this._open = true
    /* host 上挂状态标志：CSS [data-cmx-popover-open="1"] .caret-btn ui5-icon { transform: rotate(180deg) } */
    this.setAttribute('data-cmx-popover-open', '1')
    if (this._popoverEl) {
      this._popoverEl.opener = this.shadowRoot.getElementById('cmx-combo-anchor') || this
      this._popoverEl.open = true
    }
    this._applyDropdownWidth()
    this.dispatchEvent(new CustomEvent('cmx-combo-open', {
      bubbles: true, composed: true, detail: { mode: this._mode },
    }))
    /* 首次打开 + 远端数据源 + 当前 ds 为空：触发一次空查询拉一页 */
    if (this._dataSource && this._innerDs.length === 0) {
      if (this._paginated) this._page = 1
      this._runSearch('')
    }
    /* popover 打开后 grid 才有 clientWidth；rAF 让 layout 落定再触发 stretch 重算（list 模式让单列占满）。
       两帧（rAF×2）覆盖 UI5 popover 的 attached-position 流程。 */
    if (this._gridEl && (this._mode === 'list' || this._mode === 'grid')) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (typeof this._gridEl?.refreshLayout === 'function') {
            this._gridEl.refreshLayout()
          }
        })
      })
    }
  }

  /**
   * 关闭弹出层。committed 标记本次关闭是否由"提交选中"触发。
   * 关闭后在下一帧强制宿主 revo-grid 重绘，修复编辑器退场导致的渲染中断。
   * @param {boolean} [committed=false] - 是否为"提交后关闭"
   */
  close (committed = false) {
    if (!this._open) return
    this._open = false
    this.removeAttribute('data-cmx-popover-open')
    if (this._popoverEl) this._popoverEl.open = false
    this.dispatchEvent(new CustomEvent('cmx-combo-close', {
      bubbles: true, composed: true, detail: { committed: !!committed },
    }))
    /* 兜底重绘宿主 revo-grid：用户点击宿主 grid 空白区时 popover 自动关闭，
       此过程在 revo-grid 内部触发 editor disconnect / focus 漂移，部分场景下整张数据区
       渲染中断（cell 空白 + 表格线消失）。这里在 close 后强制宿主 grid 重画一次。 */
    requestAnimationFrame(() => {
      const outerRevo = this._findOuterRevoGrid()
      if (outerRevo && typeof outerRevo.refresh === 'function') {
        try { outerRevo.refresh('all') } catch (_) { /* ignore */ }
      }
    })
  }

  /**
   * 沿 DOM / shadow-root.host 链向上找到包含 combo 的 stencil `<revo-grid>` 元素。
   * 用于在 combo（作为 grid 单元格编辑器）关闭时强制宿主 grid 重画。
   * @returns {HTMLElement|null}
   */
  _findOuterRevoGrid () {
    /** @type {Node|null} */
    let node = this
    for (let i = 0; i < 60 && node; i++) {
      /* 直接向上找 closest('revo-grid') —— 跨过 light DOM 的所有祖先 */
      if (node instanceof Element) {
        const closest = node.closest?.('revo-grid')
        if (closest && (!this._gridEl || !this._gridEl.contains(closest))) {
          return closest
        }
      }
      /* 跨 shadow 边界：getRootNode().host 是当前 shadow tree 的宿主 */
      const root = node.getRootNode?.()
      node = root && root !== document && root !== node ? root.host : null
    }
    return null
  }

  /** 切换弹出层开/关状态。 */
  toggle () { this._open ? this.close() : this.open() }
  /** @returns {boolean} 弹出层是否展开 */
  isOpen () { return this._open }

  /** 聚焦输入框。 */
  focus () {
    if (this._inputEl) /** @type {any} */ (this._inputEl).focus?.()
  }

  // ── 声明式属性引导 ─────────────────────────────────────────────────────

  /** 解析 data-cmx-* 声明式标签属性，初始化模式/数据/分页/扩展按钮等配置。 */
  _bootstrapFromAttributes () {
    const a = (n) => this.getAttribute(n)
    const j = (n) => {
      const v = a(n)
      if (v == null) return undefined
      try { return JSON.parse(v) } catch { return undefined }
    }
    const mode = a('data-cmx-mode')
    if (mode && DROPDOWN_MODES.has(mode)) this._mode = mode
    if (a('data-cmx-placeholder') != null) this._placeholder = a('data-cmx-placeholder')
    if (a('data-cmx-readonly') === 'true') this._readonly = true
    if (a('data-cmx-searchable') === 'false') this._searchable = false
    if (a('data-cmx-value') != null) this._value = a('data-cmx-value')
    if (a('data-cmx-clearable') === 'false') this._clearable = false
    const extList = j('data-cmx-extension-buttons')
    if (Array.isArray(extList)) this._extensionButtons = extList.slice()
    if (a('data-cmx-paginated') === 'true') this._paginated = true
    if (a('data-cmx-page-size') != null) {
      const v = Number(a('data-cmx-page-size'))
      if (Number.isFinite(v) && v > 0) this._pageSize = v
    }
    const opts = j('data-cmx-options')
    if (opts && typeof opts === 'object') {
      if (opts.dropdownWidth != null) this._dropdownWidth = opts.dropdownWidth
      if (opts.dropdownMaxHeight != null) this._dropdownMaxHeight = opts.dropdownMaxHeight
      if (opts.emptyText != null) this._emptyText = opts.emptyText
    }
    const rows = j('data-cmx-rows')
    if (Array.isArray(rows)) {
      const ds = new CmxDataSet({ datasetId: 'combo-attr' })
      for (const r of rows) ds.addRow(r)
      this._externalDs = ds
      for (const r of ds.rows) this._knownRows.set(String(r.id), r)
      this._syncInnerDsFromExternal()
    }
    if (this._inputEl) {
      this._inputEl.placeholder = this._placeholder
      this.setReadonly(this._readonly)
    }
    /* 渲染按钮区（_render 已经初次渲染过，但 attrs 解析后扩展按钮可能更新） */
    this._renderExtensionButtons()
    this._updateClearVisibility()
  }

  // ── field（form/grid 编辑器路径）→ 全部参数派生 ───────────────────────

  /**
   * 从 field.editSettings 派生全部运行参数：弹出模式、列模型、parentField、
   * 数据源（pageService source）、静态 options、分页、扩展按钮等。
   * @param {object} field - field 配置（含 editSettings）
   */
  _applyField (field) {
    if (!field) return
    const es = field.editSettings || {}
    if (es.dropdown && DROPDOWN_MODES.has(es.dropdown)) this._mode = es.dropdown
    else this._mode = inferDropdownMode(es)

    if (es.placeholder || field.placeholder) {
      this._placeholder = String(es.placeholder ?? field.placeholder ?? '')
    }
    if (es.dropdownWidth) this._dropdownWidth = es.dropdownWidth
    if (es.dropdownMaxHeight) this._dropdownMaxHeight = es.dropdownMaxHeight
    if (es.emptyText) this._emptyText = es.emptyText
    if (es.parentField) this._parentField = es.parentField
    if (es.dropdownColumns) this._dropdownColumns = es.dropdownColumns
    if (es.clearable === false) this._clearable = false
    else if (es.clearable === true) this._clearable = true
    if (Array.isArray(es.extensionButtons)) this._extensionButtons = es.extensionButtons.slice()
    if (es.paginated === true) this._paginated = true
    else if (es.paginated === false) this._paginated = false
    if (Number.isFinite(es.pageSize) && es.pageSize > 0) this._pageSize = Number(es.pageSize)

    /* 数据源解析 */
    const src = es.source ?? field.source
    if (src && typeof src === 'object' && src.service) {
      const host = this._host || findHostWithService(this, src.service)
      if (!host) {
        console.warn(`[cmx-combo-box] editSettings.source.service='${src.service}' 未找到对应 host；请用 el.setHost(host) 显式注入，或确认页面已编译该 pageService。field:`, field?.key)
      } else {
        this._host = host
        this._dataSource = createPageServiceDataSource(host, src)
        this._debouncedSearch = null
      }
    }
    /* options 静态选项：直接灌内部 ds，无需远端 */
    if (Array.isArray(es.options) && es.options.length) {
      const ds = new CmxDataSet({ datasetId: 'combo-options' })
      const kf = es.valueField ?? field.valueField ?? 'value'
      const lf = 'label'
      for (const o of es.options) {
        const row = {}
        row.id = o[kf] ?? o.value
        row[kf] = o[kf] ?? o.value
        row[lf] = o[lf] ?? o.label ?? String(row.id)
        ds.addRow(row)
      }
      this._externalDs = ds
      for (const r of ds.rows) this._knownRows.set(String(r.id), r)
      this._syncInnerDsFromExternal()
    }

    if (this._inputEl) {
      this._inputEl.placeholder = this._placeholder
      this.setReadonly(this._readonly)
    }
    this._renderExtensionButtons()
    this._updateClearVisibility()
    this._applyMode()
    this._writeDisplayToInput()
  }

  // ── DOM 渲染 ────────────────────────────────────────────────────────────

  /** 渲染 Shadow DOM 静态模板（输入框 + 按钮组 + popover 容器），并缓存所有 DOM 引用。 */
  _render () {
    /* eslint-disable no-restricted-syntax -- 静态模板，无动态片段 */
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: inline-block; width: 100%; box-sizing: border-box; min-width: 0; }
        :host([data-cmx-fill-host]) {
          display: flex;
          width: 100%; height: 100%;
          box-sizing: border-box;
          min-width: 0;
        }
        :host([data-cmx-fill-host]) .anchor { flex: 1 1 auto; height: 100%; min-width: 0; }
        /* 高度跟随内层 ui5-input；按钮用 align-items: stretch 自动拉到同高。
           不设 min-height，让 host 高度 = ui5-input.height = var(--_ui5_input_height)。 */
        .anchor {
          display: flex;
          align-items: stretch;
          width: 100%;
          box-sizing: border-box;
          border: 1px solid var(--sapField_BorderColor, #ccc);
          border-radius: var(--sapField_BorderCornerRadius, 0.125rem);
          background: var(--sapField_Background, #fff);
          overflow: hidden;
        }
        :host(:focus-within) .anchor {
          border-color: var(--sapField_Focus_BorderColor, var(--sapHighlightColor, #0070f2));
        }
        /* ui5-input 自带边线/底部高亮/焦点框全部抹掉，让外层 .anchor 边框接管视觉；
           ui5-input v2 用 --_ui5-input-border / --sapField_Shadow / --_ui5_input_bottom_border_* / --_ui5_input_focus_*。
           --_ui5_input_min_width=0：ui5-input :host 内置 min-width=2.75rem (cozy)/2rem (compact)，
           在 grid 窄 cell（如 ≤50px 列）里会撑出溢出 → 触发宿主 revo-grid 横向滚动条瞬时显示又消失，
           表现为 grid 进入编辑时闪烁/晃动。把 min-width 透过 CSS 变量打通，允许 ui5-input 收缩到 0。 */
        .anchor ui5-input {
          flex: 1 1 auto;
          min-width: 0;
          margin: 0;
          --_ui5_input_min_width: 0;
          --_ui5-input-border: none;
          --sapField_Shadow: none;
          --_ui5_input_bottom_border_height: 0;
          --_ui5_input_bottom_border_color: transparent;
          --_ui5_input_focus_offset: 0;
          --_ui5_input_focus_outline_color: transparent;
          --_ui5_input_focused_border_color: transparent;
          --sapField_Focus_Background: transparent;
          --sapField_Background: transparent;
          --_ui5_input_background_color: transparent;
          background: transparent;
        }
        /* 右侧按钮区按钮：高度由 stretch 决定，与 ui5-input 一致 */
        .anchor-btn {
          flex: 0 0 auto;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 1.75rem;
          padding: 0 0.375rem;
          border: none;
          border-left: 1px solid var(--sapField_BorderColor, #ccc);
          background: transparent;
          cursor: pointer;
          color: var(--sapContent_IconColor, var(--sapContent_LabelColor, #555));
          font: inherit;
          line-height: 1;
        }
        .anchor-btn:hover:not(:disabled) {
          background: var(--sapButton_Hover_Background, rgba(0,0,0,0.05));
          color: var(--sapContent_IconColor, var(--sapTextColor, #111));
        }
        .anchor-btn:active:not(:disabled) {
          background: var(--sapButton_Active_Background, rgba(0,0,0,0.10));
        }
        .anchor-btn:disabled { opacity: 0.5; cursor: default; }
        .anchor-btn ui5-icon {
          width: 0.875rem; height: 0.875rem;
          color: currentColor;
          pointer-events: none;
          transition: transform 0.18s ease;
        }
        .anchor-btn[hidden] { display: none !important; }
        /* clear 按钮：value 为空时隐藏 */
        .clear-btn[data-show="0"] { display: none !important; }
        /* caret 按钮：展开时图标旋转 180° 朝上 */
        :host([data-cmx-popover-open="1"]) .caret-btn ui5-icon {
          transform: rotate(180deg);
        }
        .ext-wrap { display: inline-flex; align-items: stretch; }
        .ext-wrap[hidden] { display: none !important; }

        .dropdown-host {
          display: flex; flex-direction: column;
          min-width: 240px; min-height: 120px;
          box-sizing: border-box; padding: 0;
        }
        /* UI5 popover 内部 .ui5-popup-content 默认 padding: 1rem var(--_ui5_popup_content_padding_*);
           对 combo 下拉来说太大，用 ::part(content) 把内边距压成 3px 让 grid/tree 顶满 popover。 */
        ui5-popover::part(content) {
          padding: 3px;
        }
        .dropdown-host[data-empty="1"] .dropdown-mount { display: none; }
        .dropdown-mount { flex: 1 1 auto; min-height: 0; display: flex; }
        .dropdown-mount > * { flex: 1 1 auto; min-height: 0; width: 100%; }
        .status-bar {
          display: flex; align-items: center; gap: 6px;
          padding: 4px 8px;
          font-size: 12px;
          color: var(--sapContent_LabelColor, #6a6d70);
          border-bottom: 1px solid var(--sapGroup_TitleBorderColor, #ddd);
          background: var(--sapList_HeaderBackground, #fafafa);
        }
        .status-bar[hidden] { display: none !important; }
        .empty {
          display: none;
          padding: 16px;
          text-align: center;
          color: var(--sapContent_LabelColor, #6a6d70);
          font-size: 13px;
        }
        .empty[data-show="1"] { display: block; }
        .error {
          display: none;
          padding: 6px 8px;
          color: var(--sapNegativeColor, #b00);
          font-size: 12px;
          background: var(--sapErrorBackground, #fff2f2);
          border-bottom: 1px solid var(--sapNegativeColor, #b00);
        }
        .error[data-show="1"] { display: block; }

        /* 分页 footer（仅 grid 模式启用 paginated 时显示） */
        .pager {
          display: none;
          align-items: center;
          gap: 4px;
          padding: 4px 6px;
          border-top: 1px solid var(--sapGroup_TitleBorderColor, #ddd);
          background: var(--sapList_HeaderBackground, #fafafa);
          font-size: 12px;
          color: var(--sapContent_LabelColor, #6a6d70);
          flex-shrink: 0;
        }
        .pager[data-show="1"] { display: flex; }
        .pager .pager-info {
          flex: 1 1 auto;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .pager .pager-btn {
          flex: 0 0 auto;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 1.5rem;
          height: 1.5rem;
          padding: 0 0.25rem;
          border: 1px solid var(--sapField_BorderColor, #ccc);
          border-radius: var(--sapField_BorderCornerRadius, 0.125rem);
          background: var(--sapField_Background, #fff);
          cursor: pointer;
          color: var(--sapContent_IconColor, var(--sapContent_LabelColor, #555));
          font: inherit;
          line-height: 1;
        }
        .pager .pager-btn:hover:not(:disabled) {
          background: var(--sapButton_Hover_Background, rgba(0,0,0,0.05));
        }
        .pager .pager-btn:disabled {
          opacity: 0.4;
          cursor: default;
        }
        .pager .pager-btn ui5-icon {
          width: 0.75rem; height: 0.75rem;
          color: currentColor;
          pointer-events: none;
        }
      </style>
      <div class="anchor" id="cmx-combo-anchor" part="anchor">
        <ui5-input id="cmx-combo-input"></ui5-input>
        <button type="button" class="anchor-btn clear-btn" id="cmx-combo-clear" data-show="0" tabindex="-1" title="清除" aria-label="清除">
          <ui5-icon name="decline"></ui5-icon>
        </button>
        <button type="button" class="anchor-btn caret-btn" id="cmx-combo-caret" tabindex="-1" title="展开" aria-label="展开">
          <ui5-icon name="slim-arrow-down"></ui5-icon>
        </button>
        <span class="ext-wrap" id="cmx-combo-ext" hidden></span>
      </div>
      <ui5-popover id="cmx-combo-popover" placement="Bottom" horizontal-align="Start">
        <div class="dropdown-host" id="cmx-combo-host">
          <div class="status-bar" id="cmx-combo-status" hidden>
            <ui5-busy-indicator id="cmx-combo-busy" size="S" active></ui5-busy-indicator>
            <span>加载中…</span>
          </div>
          <div class="error" id="cmx-combo-error"></div>
          <div class="empty" id="cmx-combo-empty"></div>
          <div class="dropdown-mount" id="cmx-combo-mount"></div>
          <div class="pager" id="cmx-combo-pager" data-show="0">
            <span class="pager-info" id="cmx-combo-pager-info">0 / 0</span>
            <button type="button" class="pager-btn" id="cmx-combo-pager-first" title="首页" aria-label="首页">
              <ui5-icon name="close-command-field"></ui5-icon>
            </button>
            <button type="button" class="pager-btn" id="cmx-combo-pager-prev" title="上一页" aria-label="上一页">
              <ui5-icon name="navigation-left-arrow"></ui5-icon>
            </button>
            <button type="button" class="pager-btn" id="cmx-combo-pager-next" title="下一页" aria-label="下一页">
              <ui5-icon name="navigation-right-arrow"></ui5-icon>
            </button>
            <button type="button" class="pager-btn" id="cmx-combo-pager-last" title="末页" aria-label="末页">
              <ui5-icon name="open-command-field"></ui5-icon>
            </button>
          </div>
        </div>
      </ui5-popover>
    `
    /* eslint-enable no-restricted-syntax */
    this._inputEl   = this.shadowRoot.getElementById('cmx-combo-input')
    this._popoverEl = this.shadowRoot.getElementById('cmx-combo-popover')
    this._busyEl    = this.shadowRoot.getElementById('cmx-combo-status')
    this._emptyEl   = this.shadowRoot.getElementById('cmx-combo-empty')
    this._errorEl   = this.shadowRoot.getElementById('cmx-combo-error')
    this._clearBtn  = this.shadowRoot.getElementById('cmx-combo-clear')
    this._caretBtn  = this.shadowRoot.getElementById('cmx-combo-caret')
    this._extBtnsEl = this.shadowRoot.getElementById('cmx-combo-ext')
    this._pagerEl       = this.shadowRoot.getElementById('cmx-combo-pager')
    this._pagerInfoEl   = this.shadowRoot.getElementById('cmx-combo-pager-info')
    this._pagerFirstBtn = this.shadowRoot.getElementById('cmx-combo-pager-first')
    this._pagerPrevBtn  = this.shadowRoot.getElementById('cmx-combo-pager-prev')
    this._pagerNextBtn  = this.shadowRoot.getElementById('cmx-combo-pager-next')
    this._pagerLastBtn  = this.shadowRoot.getElementById('cmx-combo-pager-last')
    this._inputEl.placeholder = this._placeholder
    if (this._readonly) this._inputEl.setAttribute('readonly', '')
    this._emptyEl.textContent = this._emptyText
    this._renderExtensionButtons()
    this._updateClearVisibility()
    this._refreshPagerVisibility()
  }


  /** 绑定输入框/按钮/popover/分页按钮等全部 DOM 事件监听。 */
  _wireEvents () {
    const input = this._inputEl
    const popover = this._popoverEl
    const caretBtn = this._caretBtn
    const clearBtn = this._clearBtn
    const extWrap = this._extBtnsEl

    /* 输入框点击：打开下拉 */
    input.addEventListener('click', () => {
      if (this._readonly) return
      this.open()
    })

    /* 下拉按钮：切换 popover */
    caretBtn.addEventListener('mousedown', (e) => {
      /* mousedown 抢断默认的焦点逻辑——否则点击会触发 input 的 focus 再触发 popover 关闭 */
      e.preventDefault()
    })
    caretBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      if (this._readonly) return
      this.toggle()
    })

    /* clear 按钮：清空当前选中值 */
    clearBtn.addEventListener('mousedown', (e) => { e.preventDefault() })
    clearBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      if (this._readonly) return
      const hadValue = this._value != null && this._value !== ''
      this._value = null
      this._displayText = ''
      this._writeDisplayToInput()
      this._updateClearVisibility()
      if (hadValue) {
        this.dispatchEvent(new CustomEvent('cmx-combo-clear', {
          bubbles: true, composed: true, detail: {},
        }))
        this._emitValueChange('clear')
      }
    })

    /* 扩展按钮容器：事件委托 */
    extWrap.addEventListener('mousedown', (e) => {
      const t = /** @type {Element|null} */ (e.target)
      if (t && t.closest('.ext-btn')) e.preventDefault()
    })
    extWrap.addEventListener('click', (e) => {
      const t = /** @type {Element|null} */ (e.target)
      const btn = t && t.closest('.ext-btn')
      if (!(btn instanceof HTMLElement)) return
      e.stopPropagation()
      if (this._readonly) return
      const id = btn.dataset.cmxExtId || ''
      this.dispatchEvent(new CustomEvent('cmx-combo-ext-click', {
        bubbles: true, composed: true,
        detail: { id, value: this._value, row: this.getSelectedRow() },
      }))
    })

    /* UI5 input 'input' 事件 detail 含 value */
    input.addEventListener('input', () => {
      if (this._suppressInputEvent) return
      if (!this._searchable) return
      const v = String(input.value ?? '')
      this.dispatchEvent(new CustomEvent('cmx-combo-search', {
        bubbles: true, composed: true, detail: { text: v },
      }))
      if (!this._open) this.open()
      if (this._dataSource) {
        this._scheduleSearch(v)
      } else if (this._activeChild === 'tree' && this._treeEl) {
        /* tree 模式本地过滤直接走 web-treeview 自带 filterNodes */
        this._treeEl.filterNodes(v)
      } else {
        /* list / grid 本地过滤：从 _externalDs 派生临时子集 */
        this._localFilterInto(v)
      }
    })

    /* 键盘 */
    input.addEventListener('keydown', (e) => this._onInputKeydown(e))

    /* popover 关闭事件（含点击外部 / Esc 由 UI5 自动关闭的情况）：
       走完整 close() 路径，确保派发 cmx-combo-close（外部 grid editor 监听该事件才能正确退出编辑），
       并触发宿主 revo-grid 的兜底重绘——否则点击外部时 editor 不退场 + grid 不重绘，
       后续焦点漂移引发的 stencil 重渲会把整张数据 + 表格线一起抹掉。 */
    popover.addEventListener('close', () => {
      if (this._open) this.close()
    })

    /* 分页按钮：首/上/下/末。mousedown preventDefault 防焦点跑到按钮上把 popover 关掉。 */
    const pagerWire = (btn, getTarget) => {
      if (!btn) return
      btn.addEventListener('mousedown', (e) => e.preventDefault())
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const target = getTarget()
        if (target != null && target !== this._page) this._goToPage(target)
      })
    }
    pagerWire(this._pagerFirstBtn, () => 1)
    pagerWire(this._pagerPrevBtn,  () => Math.max(1, this._page - 1))
    pagerWire(this._pagerNextBtn,  () => {
      const max = this._computeTotalPages()
      return max != null ? Math.min(max, this._page + 1) : this._page + 1
    })
    pagerWire(this._pagerLastBtn,  () => this._computeTotalPages() ?? this._page)
  }

  /**
   * 输入框键盘事件处理：方向键移动光标、Enter 提交、Escape 关闭。
   * @param {KeyboardEvent} e
   */
  _onInputKeydown (e) {
    const k = e.key
    if (k === 'ArrowDown' || k === 'Down') {
      e.preventDefault()
      if (!this._open) this.open()
      this._cursorMove(+1)
    } else if (k === 'ArrowUp' || k === 'Up') {
      e.preventDefault()
      if (!this._open) this.open()
      this._cursorMove(-1)
    } else if (k === 'Enter') {
      e.preventDefault()
      this._commitCursor('keyboard')
    } else if (k === 'Escape' || k === 'Esc') {
      if (this._open) { e.preventDefault(); this.close(false) }
    }
  }

  /**
   * 移动内部 ds 的光标（高亮行）；tree 模式交给 web-treeview 自身导航。
   * @param {number} delta - +1 下移，-1 上移
   */
  _cursorMove (delta) {
    if (this._activeChild === 'tree') {
      /* tree 的键盘导航交给内部 web-treeview，无统一 API 可调；首版仅支持 list/grid */
      return
    }
    const ds = this._innerDs
    if (!ds.length) return
    if (!ds.hasCursor) ds.moveTo(delta > 0 ? 0 : ds.length - 1)
    else if (delta > 0) ds.moveNext()
    else ds.movePrev()
  }

  /**
   * 提交当前光标行作为选中值并关闭弹出层（Enter / 点击行触发）。
   * @param {string} sourceTag - 变更来源标记，如 'keyboard' / 'click'
   */
  _commitCursor (sourceTag) {
    let row = null
    if (this._activeChild === 'tree') {
      /* tree 用最近一次 node-clicked 已设置的 _value，Enter 仅关闭 */
      row = this.getSelectedRow()
    } else {
      row = this._innerDs.currentRow || null
    }
    if (row) {
      this._setSelectedFromRow(row, sourceTag)
    }
    this.close(true)
  }

  // ── 模式装载 ────────────────────────────────────────────────────────────

  /** 根据 _mode 装载/切换弹出子组件（tree→cmx-web-treeview，list/grid→cmx-revo-grid）。 */
  _applyMode () {
    const mount = this.shadowRoot?.getElementById('cmx-combo-mount')
    if (!mount) return
    if (this._mode === 'tree') {
      if (this._gridEl) this._gridEl.style.display = 'none'
      if (!this._treeEl) {
        this._treeEl = document.createElement('cmx-web-treeview')
        this._treeEl.setAttribute('id-member', 'id')
        /* LTree 模型：tree-view 按 path-member 拼层级。本组件统一让每行有一个 'path' 字段，
           来源优先级：
             1) 行自带 path 字段（用户的 transform 已经拼好）
             2) parentField 配置 → 按 id+parent 链回溯拼 path（_syncTreePath 完成）
             3) 都没有 → path = id（无父子关系，平铺成根节点） */
        this._treeEl.setAttribute('path-member', 'path')
        this._treeEl.setAttribute('display-value-member', 'cmxLabel')
        this._treeEl.setAttribute('expand-level', '2')
        this._treeEl.style.cssText = `max-height:${this._dropdownMaxHeight};display:block;`
        this._treeEl.addEventListener('node-clicked', (e) => {
          const node = /** @type {CustomEvent<any>} */ (e).detail?.node
          const id = node?.id ?? node?.data?.id
          if (id != null) {
            const row = this._innerDs.getRow(String(id))
            if (row) this._setSelectedFromRow(row, 'click')
            this.close(true)
          }
        })
        mount.appendChild(this._treeEl)
      } else {
        this._treeEl.style.display = ''
      }
      this._activeChild = 'tree'
      /* 灌进 treeview 前给每行同步好 cmxLabel 与 path */
      this._syncTitleField('cmxLabel')
      this._syncTreePath()
      this._treeEl.setDataSet(this._innerDs)
      if (this._columnModel) this._treeEl.setColumnModel(this._columnModel)
    } else {
      if (this._treeEl) this._treeEl.style.display = 'none'
      this._activeChild = 'grid'
      this._ensureInnerGridMounted()
    }
    /* mode 切换后 pager 可见性需要重新计算（仅 grid 模式且 paginated 时显示） */
    this._refreshPagerVisibility()
  }

  /** 创建/初始化 inner cmx-revo-grid（list/grid 模式专用）。 */
  _ensureInnerGridMounted () {
    const mount = this.shadowRoot?.getElementById('cmx-combo-mount')
    if (!mount) return
    if (!this._gridEl) {
      this._gridEl = document.createElement('cmx-revo-grid')
      this._gridEl.setAttribute('data-cmx-embed', '')
      this._gridEl.style.cssText = `max-height:${this._dropdownMaxHeight};display:block;`
      this._gridEl.addEventListener('cmx-row-selected', (e) => {
        const id = /** @type {CustomEvent<{id:string}>} */ (e).detail?.id
        if (id == null) return
        const row = this._innerDs.getRow(String(id))
        if (row) {
          this._setSelectedFromRow(row, 'click')
          this.close(true)
        }
      })
      mount.appendChild(this._gridEl)
    } else {
      this._gridEl.style.display = ''
      this._gridEl.style.maxHeight = this._dropdownMaxHeight
    }
    const rowH = this._mode === 'list' ? 28 : 32
    /* 显式给 theme（非 'auto'），避免内嵌 cmx-revo-grid 在 connectedCallback 走 rAF 重设 theme
       —— 那条路径会 batch 触发 Stencil 全局更新队列，恰好让宿主外层 revo-grid 一起重渲，
       视觉上表现为整张表闪烁。 */
    const isDark = (() => {
      try {
        const bg = getComputedStyle(document.documentElement).getPropertyValue('--sapBackgroundColor').trim()
        if (!bg) return false
        const hex = bg.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i)
        if (hex) {
          const r = parseInt(hex[1], 16), g = parseInt(hex[2], 16), b = parseInt(hex[3], 16)
          return (0.299 * r + 0.587 * g + 0.114 * b) < 128
        }
      } catch (_) { /* ignore */ }
      return false
    })()
    this._gridEl.setOptions({
      selectionMode: 'single',
      rowHeight: rowH,
      headerRowHeight: rowH,
      viewHeight: 240,
      fillHeight: false,
      showRowIndex: this._mode === 'grid',
      stretch: this._mode === 'list',
      theme: isDark ? 'darkMaterial' : 'material',
    })
    this._refreshChildColumnModel()
    this._gridEl.setDataSet(this._innerDs)
    this._applyListHeaderVisibility()
  }

  /** list 模式隐藏 revo-grid 表头；grid 模式恢复显示。 */
  _applyListHeaderVisibility () {
    if (!this._gridEl?.shadowRoot) {
      /* 内部 shadow 还没建好，下一帧重试 */
      requestAnimationFrame(() => this._applyListHeaderVisibility())
      return
    }
    const sr = this._gridEl.shadowRoot
    let styleEl = sr.getElementById('cmx-combo-list-style')
    if (this._mode === 'list') {
      if (!styleEl) {
        styleEl = document.createElement('style')
        styleEl.id = 'cmx-combo-list-style'
        styleEl.textContent = `
          revo-grid revogr-header { display: none !important; }
        `
        sr.appendChild(styleEl)
      }
    } else if (styleEl) {
      styleEl.remove()
    }
  }

  /** 把当前 columnModel 同步到激活的子组件（grid 走 setColumnModel，list 走单列 setColumnModel）。 */
  _refreshChildColumnModel () {
    if (!this._activeChild) return
    if (this._activeChild === 'tree') {
      if (this._treeEl && this._columnModel) this._treeEl.setColumnModel(this._columnModel)
      return
    }
    if (!this._gridEl) return
    if (this._mode === 'grid') {
      const cm = this._dropdownColumns || this._columnModel
      if (cm) this._gridEl.setColumnModel(cm)
      return
    }
    /* list 模式：跳过 setColumnModel 走 setColumns 单列；cmxLabel 由 _syncTitleField 写入行。
       cellTemplate：当 toTitleCols 有 ≥2 个字段时，第一个左对齐、第二个（及后续）右对齐——
       典型用例：code 在左、name 在右。只有 1 个字段时回退到 cmxLabel 整段显示。 */
    this._syncTitleField('cmxLabel')
    const titleIds = this._columnModel?.getTitleColIds?.() ?? []
    const leftKey  = titleIds[0] || null
    const rightKey = titleIds[1] || null
    const cellTemplate = (leftKey && rightKey)
      ? (h, props) => {
          const row = props?.model || {}
          return h('div', {
            style: {
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              width: '100%',
              gap: '8px',
            },
          }, [
            h('span', { style: { textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, String(row[leftKey] ?? '')),
            h('span', { style: { textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--sapContent_LabelColor,#6a6d70)' } }, String(row[rightKey] ?? '')),
          ])
        }
      : null
    const colDef = { id: 'cmxLabel', caption: '', type: 'text', editMode: 'readonly' }
    if (cellTemplate) colDef.display = { render: cellTemplate }
    // list 模式：用单列 CmxColumnModel 驱动内部 grid（列定义统一走 CmxColumnModel）
    this._gridEl.setColumnModel(new CmxColumnModel({ members: [new CmxColumn(colDef)] }))
  }

  /**
   * 把每行的 cmxLabel 字段写成"标题列拼接值"。list 模式专用。
   * 优先用 _columnModel.getTitleColIds()；无 model 时取除 id/_* 外首个非空字段。
   */
  _syncTitleField (_field) {
    const cm = this._columnModel
    const ids = cm?.getTitleColIds?.() ?? []
    const iconCol = cm?.iconCol
    for (const row of this._innerDs.rows) {
      const parts = []
      if (ids.length) {
        for (const k of ids) {
          const v = row[k]
          if (v != null && v !== '') parts.push(String(v))
        }
      } else {
        /* 无 model：取除 id/_* 外第一个非空字段 */
        for (const k of Object.keys(row)) {
          if (k === 'id' || k.startsWith('_') || k === 'cmxLabel' || k === '__cmxRowClass') continue
          if (row[k] != null && row[k] !== '') { parts.push(String(row[k])); break }
        }
      }
      const label = parts.join('  ') || String(row.id)
      if (row.cmxLabel !== label) row.cmxLabel = label
      if (iconCol && row[iconCol] && row.cmxIcon !== row[iconCol]) row.cmxIcon = row[iconCol]
    }
  }

  /**
   * 给每行同步 `path` 字段（LTree 层级路径）；tree 模式专用。
   *   - 行已带 `path` → 不动
   *   - 配了 parentField（如 'parentId'）→ 按 id+parent 链回溯拼 path（用 '.' 分隔）
   *   - 都没有 → path = id（平铺成根节点列表）
   * 假设 inner ds 同一批数据中所有节点都存在；transform 应已展平整棵子树。
   */
  _syncTreePath () {
    const rows = this._innerDs.rows
    if (!rows.length) return
    const parentField = this._parentField
    /* 第一遍：建 id→row 索引，方便 parentField 模式回溯 */
    const byId = new Map()
    for (const r of rows) byId.set(String(r.id), r)
    /* 第二遍：算 path，缓存避免重复计算 */
    const computed = new Map()
    const computePath = (row) => {
      const idStr = String(row.id)
      if (computed.has(idStr)) return computed.get(idStr)
      if (row.path != null && row.path !== '') {
        const v = String(row.path)
        computed.set(idStr, v)
        return v
      }
      if (parentField) {
        const pid = row[parentField]
        if (pid == null || pid === '') {
          computed.set(idStr, idStr)
          return idStr
        }
        const parentRow = byId.get(String(pid))
        if (!parentRow) {
          computed.set(idStr, idStr)
          return idStr
        }
        const pp = computePath(parentRow)
        const v = pp + '.' + idStr
        computed.set(idStr, v)
        return v
      }
      computed.set(idStr, idStr)
      return idStr
    }
    for (const r of rows) {
      const p = computePath(r)
      if (r.path !== p) r.path = p
    }
  }

  /**
   * 在 plain item 数组上直接写 cmxLabel 字段（list/tree 模式下 setRows 前调用）。
   * 与 _syncTitleField 同算法，但作用在 plain 对象而非已添加的 CmxRowSet 上。
   * 这样 setRows 触发 ds-row-added 事件时，treeview / grid 的 _syncToInner 读到的行
   * 已经含有正确的 displayValue 字段，避免 LTree 排序时 displayValue=undefined 崩溃。
   * @param {Array<Record<string, unknown>>} items
   * @param {string} fieldName
   */
  _writeTitleFieldOnItems (items, fieldName) {
    const cm = this._columnModel
    const ids = cm?.getTitleColIds?.() ?? []
    const iconCol = cm?.iconCol
    for (const item of items) {
      if (!item || typeof item !== 'object') continue
      const parts = []
      if (ids.length) {
        for (const k of ids) {
          const v = item[k]
          if (v != null && v !== '') parts.push(String(v))
        }
      } else {
        for (const k of Object.keys(item)) {
          if (k === 'id' || k.startsWith('_') || k === fieldName) continue
          if (item[k] != null && item[k] !== '') { parts.push(String(item[k])); break }
        }
      }
      const label = parts.join('  ') || String(item.id ?? '')
      item[fieldName] = label
      if (iconCol && item[iconCol] && !item.cmxIcon) item.cmxIcon = item[iconCol]
    }
  }

  /**
   * 在 plain item 数组上直接写 path 字段（tree 模式下 setRows 前调用）。
   * 与 _syncTreePath 同算法但作用在 plain 数组上。
   * @param {Array<Record<string, unknown>>} items
   */
  _writePathOnItems (items) {
    if (!items.length) return
    const parentField = this._parentField
    const byId = new Map()
    for (const it of items) {
      if (it && it.id != null) byId.set(String(it.id), it)
    }
    const computed = new Map()
    const computePath = (item) => {
      const idStr = String(item.id ?? '')
      if (computed.has(idStr)) return computed.get(idStr)
      if (item.path != null && item.path !== '') {
        const v = String(item.path)
        computed.set(idStr, v)
        return v
      }
      if (parentField) {
        const pid = item[parentField]
        if (pid == null || pid === '') {
          computed.set(idStr, idStr); return idStr
        }
        const parentItem = byId.get(String(pid))
        if (!parentItem) {
          computed.set(idStr, idStr); return idStr
        }
        const pp = computePath(parentItem)
        const v = pp + '.' + idStr
        computed.set(idStr, v)
        return v
      }
      computed.set(idStr, idStr)
      return idStr
    }
    for (const it of items) {
      if (!it || it.id == null) continue
      const p = computePath(it)
      if (it.path !== p) it.path = p
    }
  }

  // ── inner ds 维护：外部 ds 同步 + 远端搜索结果灌入 ─────────────────────

  /** 把外部 ds 的行（浅拷贝 + 派生字段预写）同步进内部 ds，并刷新子组件与空状态。 */
  _syncInnerDsFromExternal () {
    if (!this._externalDs) {
      this._innerDs.setRows([])
      return
    }
    /* 浅拷贝行（保留必要字段；不直接共享 RowSet 引用以避免双重 ds 归属冲突） */
    const rows = this._externalDs.rows.map((r) => r.toPlainObject())
    /* setRows 前预写入派生字段（同 _runSearch），避免 ds-row-added 中间快照让 treeview LTree 排序炸。 */
    if (this._mode === 'list' || this._mode === 'tree') this._writeTitleFieldOnItems(rows, 'cmxLabel')
    if (this._mode === 'tree') this._writePathOnItems(rows)
    this._innerDs.setRows(rows)
    if (this._mode === 'tree' && this._treeEl) this._treeEl.setDataSet(this._innerDs)
    if (this._activeChild === 'grid' && this._gridEl) this._gridEl.setDataSet(this._innerDs)
    this._updateEmptyState()
  }

  /**
   * 本地过滤：从 _externalDs 按查询文本派生临时子集灌入内部 ds（list/grid 模式，
   * 无远端数据源时使用）。
   * @param {string} query - 用户输入的过滤文本
   */
  _localFilterInto (query) {
    if (!this._externalDs) return
    const q = String(query ?? '').trim().toLowerCase()
    const cm = this._columnModel
    const fields = cm?.getTitleColIds?.()?.length ? cm.getTitleColIds() : null
    const rows = this._externalDs.rows
      .map((r) => r.toPlainObject())
      .filter((r) => {
        if (!q) return true
        if (fields) {
          for (const f of fields) {
            if (String(r[f] ?? '').toLowerCase().includes(q)) return true
          }
          return false
        }
        for (const k of Object.keys(r)) {
          if (k === 'id' || k.startsWith('_')) continue
          if (String(r[k] ?? '').toLowerCase().includes(q)) return true
        }
        return false
      })
    /* setRows 前预写入派生字段（同 _runSearch） */
    if (this._mode === 'list' || this._mode === 'tree') this._writeTitleFieldOnItems(rows, 'cmxLabel')
    if (this._mode === 'tree') this._writePathOnItems(rows)
    this._innerDs.setRows(rows)
    if (this._mode === 'tree' && this._treeEl) this._treeEl.setDataSet(this._innerDs)
    this._updateEmptyState()
  }

  /**
   * 用防抖包装触发远端搜索；分页模式下重置到第 1 页。
   * @param {string} query - 搜索文本
   */
  _scheduleSearch (query) {
    if (!this._dataSource) return
    /* 用户输入触发：搜索内容变了 → 重置到第 1 页 */
    if (this._paginated) this._page = 1
    if (!this._debouncedSearch) {
      this._debouncedSearch = debounceForSource(this._dataSource, (q) => this._runSearch(q))
    }
    this._debouncedSearch(query)
  }

  /**
   * 执行远端搜索（分页或非分页），归一化结果并灌入内部 ds；
   * 捕获错误派发 cmx-combo-search-error。
   * @param {string} query - 搜索文本
   */
  async _runSearch (query) {
    if (!this._dataSource) return
    this._setBusy(true)
    this._setError(null)
    try {
      let items
      if (this._paginated && this._mode === 'grid' && typeof this._dataSource.search === 'function') {
        /* 分页模式：绕过 cmx-async-source 缓存（其按 query 缓存不适用分页），直接调 source.search
           带 page+pageSize；分页参数变化时重发请求是合理行为，缓存反而碍事。 */
        const pageSize = this._pageSize || this._dataSource.pageSize || 50
        const out = await this._dataSource.search(query ?? '', { page: this._page, pageSize })
        items = Array.isArray(out) ? out : (Array.isArray(out?.items) ? out.items : [])
      } else {
        items = await searchAsync(this._dataSource, query)
      }
      const kf = this._dataSource.keyField || 'id'
      /* 装载到 inner ds：先在 plain item 上写好 cmxLabel + path（list/tree 模式），
         setRows 触发 N 次 ds-row-added 时 treeview/grid 各自 _syncToInner 都看到完整字段，
         避免 web-treeview LTree 排序时碰到 undefined displayValue 崩溃。 */
      const normalized = items.map((it) => normalizeRow(it, kf))
      if (this._mode === 'list' || this._mode === 'tree') {
        this._writeTitleFieldOnItems(normalized, 'cmxLabel')
      }
      if (this._mode === 'tree') {
        this._writePathOnItems(normalized)
      }
      this._innerDs.setRows(normalized)
      for (const r of this._innerDs.rows) this._knownRows.set(String(r.id), r)
      if (this._mode === 'tree' && this._treeEl) {
        /* 兜底：再 setDataSet 一次让 treeview 用最终完整数据 _syncToInner（防御 ds-row-added 期间任何中间状态） */
        this._treeEl.setDataSet(this._innerDs)
      }
      /* list/grid：数据进入后让 stretch 重算（数据可能改变滚动条出现/列实际宽度） */
      if (this._gridEl && (this._mode === 'list' || this._mode === 'grid')) {
        requestAnimationFrame(() => {
          if (typeof this._gridEl?.refreshLayout === 'function') this._gridEl.refreshLayout()
        })
      }
      /* 分页：bridge 把最近一次响应的 total 写到 source._lastMeta；同步到本组件 + 更新 footer */
      if (this._paginated && this._mode === 'grid') {
        const meta = this._dataSource?._lastMeta
        this._total = (meta && Number.isFinite(meta.total)) ? Number(meta.total) : null
        this._updatePagerInfo()
      }
      this._updateEmptyState()
    } catch (err) {
      this._setError(err)
      this.dispatchEvent(new CustomEvent('cmx-combo-search-error', {
        bubbles: true, composed: true, detail: { error: err },
      }))
    } finally {
      this._setBusy(false)
    }
  }

  /** 切换加载中状态栏显隐。 */
  _setBusy (active) {
    if (!this._busyEl) return
    this._busyEl.hidden = !active
  }

  /** 设置错误信息元素显隐与内容（传 null/falsy 清除）。 */
  _setError (err) {
    if (!this._errorEl) return
    if (!err) { this._errorEl.dataset.show = '0'; this._errorEl.textContent = ''; return }
    this._errorEl.dataset.show = '1'
    this._errorEl.textContent = err?.message || String(err)
  }

  /** 根据内部 ds 是否为空，切换空状态提示与 dropdown-host 的 data-empty 属性。 */
  _updateEmptyState () {
    if (!this._emptyEl) return
    const empty = this._innerDs.length === 0
    this._emptyEl.dataset.show = empty ? '1' : '0'
    const host = this.shadowRoot?.getElementById('cmx-combo-host')
    if (host) host.dataset.empty = empty ? '1' : '0'
  }

  // ── 分页 ────────────────────────────────────────────────────────────────

  /** 总页数：total 未知时返回 null；当前页 items 满了的话至少 = _page + 1，否则 = _page。 */
  _computeTotalPages () {
    if (this._total != null) {
      const ps = this._pageSize || this._dataSource?.pageSize || 50
      return Math.max(1, Math.ceil(this._total / ps))
    }
    return null
  }

  /** 切换分页 footer 显隐（仅 grid 模式且 paginated 时显示），可见时刷新分页信息。 */
  _refreshPagerVisibility () {
    if (!this._pagerEl) return
    const show = this._paginated && this._mode === 'grid'
    this._pagerEl.dataset.show = show ? '1' : '0'
    if (show) this._updatePagerInfo()
  }

  /** 刷新分页信息文本与各翻页按钮的 disabled 状态。 */
  _updatePagerInfo () {
    if (!this._pagerEl || !this._pagerInfoEl) return
    const totalPages = this._computeTotalPages()
    const totalLabel = totalPages != null ? String(totalPages) : '?'
    const totalRecordsLabel = this._total != null ? `（共 ${this._total} 条）` : ''
    this._pagerInfoEl.textContent = `第 ${this._page} / ${totalLabel} 页${totalRecordsLabel}`
    /* 按钮 disabled 状态 */
    const atFirst = this._page <= 1
    const atLast = totalPages != null ? (this._page >= totalPages) : false
    if (this._pagerFirstBtn) this._pagerFirstBtn.disabled = atFirst
    if (this._pagerPrevBtn)  this._pagerPrevBtn.disabled  = atFirst
    if (this._pagerNextBtn)  this._pagerNextBtn.disabled  = atLast
    if (this._pagerLastBtn)  this._pagerLastBtn.disabled  = (totalPages == null) || atLast
  }

  /**
   * 跳转到指定页（grid + paginated + 远端数据源时生效），保留当前搜索文本重新拉取。
   * @param {number} n - 目标页码（从 1 起）
   */
  _goToPage (n) {
    if (!this._paginated || this._mode !== 'grid' || !this._dataSource) return
    const total = this._computeTotalPages()
    const next = Math.max(1, total != null ? Math.min(total, n) : n)
    if (next === this._page) return
    this._page = next
    /* 取当前 input 文本作为 query；保留搜索状态 */
    const q = String(this._inputEl?.value ?? '')
    this._runSearch(q)
  }

  // ── 选中 / 显示文本 ─────────────────────────────────────────────────────

  /**
   * 由行对象设置当前选中值，更新显示文本并派发变更事件。
   * @param {object} row - 选中的行（需含 id 字段）
   * @param {string} sourceTag - 变更来源标记，如 'click' / 'keyboard'
   */
  _setSelectedFromRow (row, sourceTag) {
    if (!row) return
    const id = String(row.id)
    this._value = id
    this._knownRows.set(id, row.toPlainObject ? row.toPlainObject() : row)
    this._writeDisplayToInput()
    this._emitValueChange(sourceTag)
  }

  /**
   * 派发 cmx-combo-value-change 事件；_suppressEmit 为 true 时抑制。
   * @param {string} sourceTag - 变更来源标记，如 'click' / 'keyboard' / 'api' / 'clear'
   */
  _emitValueChange (sourceTag) {
    if (this._suppressEmit) return
    const row = this.getSelectedRow()
    this.dispatchEvent(new CustomEvent('cmx-combo-value-change', {
      bubbles: true, composed: true,
      detail: { id: this._value, row, source: sourceTag || 'api' },
    }))
  }

  /** 计算并写入输入框显示文本；程序赋值时屏蔽自身 input 事件避免误触发搜索。 */
  _writeDisplayToInput () {
    if (!this._inputEl) return
    const text = this._computeDisplayText(this._value)
    this._displayText = text
    const v = text ?? ''
    if (this._inputEl.value !== v) {
      /* 程序赋值时屏蔽自身 input 监听，避免误判为用户输入触发 search */
      this._suppressInputEvent = true
      try {
        this._inputEl.value = v
      } finally {
        /* UI5 web component 的属性变更可能在 microtask 派发 input 事件，下一帧再恢复 */
        queueMicrotask(() => { this._suppressInputEvent = false })
      }
    }
    this._updateClearVisibility()
  }

  /**
   * 按 id 计算输入框应显示的文本：优先 displayTemplate，其次标题列拼接，最后回退到 labelField。
   * @param {string|null} id - 当前行 id
   * @returns {string} 显示文本
   */
  _computeDisplayText (id) {
    if (id == null || id === '') return ''
    const row = this.getSelectedRow()
    if (!row) return String(id) /* 未拿到行先显示 id，由 _lookupAndFillDisplay 异步覆盖 */
    const f = this._field || {}
    const es = f.editSettings || {}
    const tpl = es.displayTemplate || f.displayTemplate
    if (typeof tpl === 'string' && tpl) {
      return tpl.replace(/\$\{([^}]+)\}/g, (_, k) => String(row[k.trim()] ?? ''))
    }
    const cm = this._columnModel
    const ids = cm?.getTitleColIds?.() ?? []
    if (ids.length) {
      return ids.map((k) => row[k]).filter((v) => v != null && v !== '').join('  ')
    }
    /* 退化到 dataSource.labelField */
    const lf = this._dataSource?.labelField || 'name'
    return String(row[lf] ?? row.id ?? '')
  }

  /**
   * 异步按 id 回查行（本地无命中时走远端 lookupByKey），回填显示文本。
   * @param {string} id - 待回填的行 id
   */
  async _lookupAndFillDisplay (id) {
    if (this._pendingLookupKey === id) return
    this._pendingLookupKey = id
    /* 优先本地 */
    if (this._knownRows.has(String(id))) {
      this._pendingLookupKey = null
      this._writeDisplayToInput()
      return
    }
    if (!this._dataSource) {
      this._pendingLookupKey = null
      return
    }
    try {
      const row = await lookupByKeyAsync(this._dataSource, id)
      if (row && this._value === String(id)) {
        const kf = this._dataSource.keyField || 'id'
        const norm = normalizeRow(row, kf)
        this._knownRows.set(String(id), norm)
        this._writeDisplayToInput()
      }
    } catch (_) {
      /* 静默：lookup 失败不阻塞用户输入 */
    } finally {
      if (this._pendingLookupKey === id) this._pendingLookupKey = null
    }
  }

  // ── 杂项 ────────────────────────────────────────────────────────────────

  /** 应用弹出层宽度：'anchor' 时取输入框宽度，否则用配置的 CSS 宽度值。 */
  _applyDropdownWidth () {
    if (!this._popoverEl) return
    if (this._dropdownWidth === 'anchor') {
      const anchor = this.shadowRoot.getElementById('cmx-combo-anchor')
      if (anchor) {
        const w = anchor.getBoundingClientRect?.().width
        if (w > 0) {
          /** @type {any} */ (this._popoverEl).style.setProperty('width', `${w}px`, 'important')
        }
      }
    } else if (this._dropdownWidth) {
      /** @type {any} */ (this._popoverEl).style.setProperty('width', this._dropdownWidth, 'important')
    }
  }

  /** clear 按钮显隐：仅当 clearable=true 且当前 value 非空时显示 */
  _updateClearVisibility () {
    if (!this._clearBtn) return
    const hasValue = this._value != null && String(this._value) !== ''
    this._clearBtn.dataset.show = (this._clearable && hasValue && !this._readonly) ? '1' : '0'
  }

  /** 根据 this._extensionButtons 重渲扩展按钮区 */
  _renderExtensionButtons () {
    if (!this._extBtnsEl) return
    const list = Array.isArray(this._extensionButtons) ? this._extensionButtons : []
    if (!list.length) {
      this._extBtnsEl.hidden = true
      while (this._extBtnsEl.firstChild) this._extBtnsEl.removeChild(this._extBtnsEl.firstChild)
      return
    }
    this._extBtnsEl.hidden = false
    while (this._extBtnsEl.firstChild) this._extBtnsEl.removeChild(this._extBtnsEl.firstChild)
    for (let i = 0; i < list.length; i++) {
      const spec = list[i] || {}
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'anchor-btn ext-btn'
      btn.tabIndex = -1
      const id = String(spec.id ?? `ext-${i}`)
      btn.dataset.cmxExtId = id
      if (spec.tooltip) {
        btn.title = String(spec.tooltip)
        btn.setAttribute('aria-label', String(spec.tooltip))
      } else {
        btn.setAttribute('aria-label', id)
      }
      const ic = document.createElement('ui5-icon')
      ic.setAttribute('name', String(spec.icon || 'action'))
      btn.appendChild(ic)
      this._extBtnsEl.appendChild(btn)
    }
  }
}

// ── helpers ───────────────────────────────────────────────────────────────

/**
 * 推断弹出模式：editSettings.dropdown 缺省时按其它字段倒推。
 *   - editSettings.parentField → 'tree'
 *   - editSettings.dropdownColumns → 'grid'
 *   - 其余 → 'list'
 */
function inferDropdownMode (es) {
  if (!es) return 'list'
  if (es.parentField) return 'tree'
  if (es.dropdownColumns) return 'grid'
  return 'list'
}

/** 远端 items 进入 inner ds 前的归一化：保证 row.id 存在。 */
function normalizeRow (item, keyField) {
  if (!item || typeof item !== 'object') return { id: String(item ?? '') }
  if (item.id != null) return item
  const id = item[keyField] ?? item.code ?? item.value
  return { ...item, id: id != null ? String(id) : `r_${Math.random().toString(36).slice(2, 9)}` }
}

/**
 * 沿 DOM / shadow-root.host 链向上查找第一个 host[serviceName] 为函数的元素。
 * pageService 在生成页 CE 上挂为 host.<serviceName> = async function；
 * combo-box 嵌在该 CE 的任意层级（直接子节点 / form 内 / grid editor slot 内）都能命中。
 */
function findHostWithService (startEl, serviceName) {
  let node = startEl
  for (let i = 0; i < 50 && node; i++) {
    const root = node.getRootNode?.()
    const host = root && root !== document && root !== node ? root.host : null
    if (host && typeof host[serviceName] === 'function') return host
    node = host || node.parentNode || null
  }
  return null
}

customElements.define('cmx-combo-box', CmxComboBox)
