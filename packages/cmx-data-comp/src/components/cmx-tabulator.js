/**
 * 基于 Tabulator 6.4 的数据表格 Web Component 封装（<cmx-tabulator>）。
 *
 * 目标：
 *   - 作为 cmx-data-comp 的第三种表格视图，保持与 cmx-ui5-table / cmx-revo-grid 相近的 API。
 *   - 支持 CmxColumnModel / CmxDataSet / CmxMasterSlave 绑定。
 *   - 将 Tabulator 常用事件转发为 cmx-* CustomEvent，便于页面脚本与设计器事件面板使用。
 *
 * treegrid（树形表格）能力：
 *   借鉴 cmx-revo-grid（主题 + CmxColumnModel/CmxDataSet 绑定）与 cmx-web-treeview
 *   （扁平行→层级、展开态保持、iconCol 图标）两个组件的模式，
 *   基于 Tabulator 6 原生 dataTree 实现：
 *     - 数据：扁平行（parentField 外键）或预嵌套（childField 数组）皆可，
 *       由 lib/cmx-tree-data.js 归一为 Tabulator 嵌套数组
 *     - 展开/折叠：expandAll / collapseAll / expandRow / collapseRow / toggleRow，
 *       刷新数据时通过 _expandedIds 快照保持展开态（同 cmx-web-treeview）
 *     - 图标：列模型 iconCol 或 data-cmx-icon-field → 树列单元格前缀 <ui5-icon>
 *
 * @component
 *
 * 声明式属性（关键）：
 *   data-cmx-columns / data-cmx-options / data-cmx-rows
 *   data-cmx-master-slave-id / data-cmx-dataset-id / data-cmx-model-id
 *   data-cmx-tree / data-cmx-parent-field / data-cmx-tree-column /
 *   data-cmx-tree-child-field / data-cmx-tree-start-expanded / data-cmx-icon-field
 *   data-cmx-height / data-cmx-layout / data-cmx-pagination / data-cmx-page-size /
 *   data-cmx-selection-mode / data-cmx-placeholder / data-cmx-movable-columns /
 *   data-cmx-reactive-data / data-cmx-auto-columns
 *
 * @fires cmx-row-selected          - detail:{ id, row } 单击选中行时派发（非主从绑定时）
 * @fires cmx-row-selection-change  - detail:{ ids, rows } 多选复选框勾选状态变化时派发
 * @fires cmx-cell-changed          - detail:{ id, key, value, row } 单元格编辑后派发
 * @fires cmx-row-added             - detail:{ id, row, index } 新增行时派发
 * @fires cmx-row-removed           - detail:{ ids, rows } 删除行时派发
 * @fires cmx-tree-row-expanded     - detail:{ id, row, level } 树形表格展开行时派发
 * @fires cmx-tree-row-collapsed    - detail:{ id, row, level } 树形表格折叠行时派发
 * @fires cmx-tabulator-ready       - detail:{ table } 表格构建完成时派发
 * @fires cmx-tabulator-data-changed - detail:{ rows } 数据变更时派发
 * @fires cmx-tabulator-filtered    - detail:{ filters, rowCount } 过滤后派发
 * @fires cmx-tabulator-sorted      - detail:{ sorters, rowCount } 排序后派发
 * @fires cmx-tabulator-page-loaded - detail:{ page } 分页加载后派发
 * @fires cmx-tabulator-column-moved - detail:{ field, columns } 列拖动移位后派发
 * @fires cmx-tabulator-cell-edited - detail:{ id, key, value, row, cell } 单元格编辑（含原生 cell）时派发
 */
import { TabulatorFull as Tabulator } from 'tabulator-tables'
import TABULATOR_CSS from 'tabulator-tables/dist/css/tabulator.min.css?inline'
import { CmxColumnAdapter } from '../lib/cmx-column-adapter.js'
import { detectDarkMode } from '../lib/cmx-theme-detect.js'
import { normalizeTreeData } from '../lib/cmx-tree-data.js'

/** Tabulator 默认选项（与 cmx 级选项混合，_tabulatorOptions 里再翻译为 Tabulator 原生参数）。 */
const DEFAULT_OPTIONS = {
  layout: 'fitColumns',          // 列宽布局模式
  height: '100%',                // 表格高度
  selectableRows: 1,             // 行选择模式：1=单选 / true=多选 / false=禁用
  selectionCheckbox: false,      // 是否在首列渲染复选框
  selectionCheckboxWidth: 36,    // 复选框列宽（像素）
  rowHeight: null,               // 行高（null=自适应）
  reactiveData: false,           // 是否启用 Tabulator 响应式数据绑定
  movableColumns: true,          // 是否允许拖拽移动列
  resizableColumnFit: false,     // 是否允许拖拽调整列宽
  pagination: false,             // 分页：false=关闭 / 'local'=本地分页 / 'remote'=远程分页
  paginationSize: 20,            // 每页行数
  placeholder: '暂无数据',       // 空表占位文案
  index: 'id',                   // 行唯一索引字段名
  autoColumns: false,            // 是否根据数据自动生成列定义
  /* ── treegrid（cmx 级选项；_tabulatorOptions 里翻译为 Tabulator dataTree*）── */
  dataTree: false,              // 总开关：开启树形表格
  parentField: 'parentId',      // 扁平行的父键字段（flat→nested 重建层级用）
  dataTreeChildField: '_children', // 嵌套子数组字段（与 Tabulator dataTreeChildField 对齐）
  dataTreeChildIndent: 14,      // 每层缩进像素
  treeColumn: null,             // 显示展开把手的列 id（null = 第一列），→ dataTreeElementColumn
  treeStartExpanded: false,     // 初始展开：true 全展开 / false 全折叠 / number 展开前 N 层 / number[] 指定层级
}

/** 布尔型声明式属性集合（值为 'true'/'1'/'yes' → true，'false'/'0'/'no' → false）。 */
const BOOL_ATTRS = new Set([
  'data-cmx-pagination',
  'data-cmx-movable-columns',
  'data-cmx-reactive-data',
  'data-cmx-auto-columns',
  'data-cmx-tree',
  'data-cmx-borderless',
  'data-cmx-flat',
])

/**
 * 安全解析元素的 JSON 属性，失败时返回 undefined 并打印警告。
 * @param {HTMLElement} el   - 宿主元素
 * @param {string} name      - 属性名
 * @returns {*} 解析后的值；属性不存在或解析失败时返回 undefined
 */
function parseJsonAttr (el, name) {
  if (!el.hasAttribute(name)) return undefined
  try {
    return JSON.parse(el.getAttribute(name))
  } catch (e) {
    console.warn(`[cmx-tabulator] failed to parse ${name}:`, e?.message || e)
    return undefined
  }
}

/**
 * 把声明式属性值解析为布尔值。
 * @param {HTMLElement} el       - 宿主元素
 * @param {string} name          - 属性名
 * @param {boolean} fallback     - 属性不存在时的回退值
 * @returns {boolean|*} 解析结果；无法识别时返回 fallback
 */
function attrBool (el, name, fallback) {
  if (!el.hasAttribute(name)) return fallback
  const v = String(el.getAttribute(name) || '').trim().toLowerCase()
  if (v === '' || v === 'true' || v === '1' || v === 'yes') return true
  if (v === 'false' || v === '0' || v === 'no') return false
  return fallback
}

/**
 * 把任意值转换为有限数字，不可转换时返回 null。
 * @param {*} value
 * @returns {number|null}
 */
function toNumberOrNull (value) {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/**
 * 归一列宽给 Tabulator。
 * Tabulator 的 setWidthActual：width `isNaN` 时按**百分比**算（clientWidth/100*parseInt）。
 * 故 '300px' 这种字符串会被当成 300% → 列宽爆炸到表宽的 3 倍。
 * 这里把 '300px'/'300' → 数字 300（按像素）；'50%' 原样保留（交给 Tabulator 的百分比逻辑）；
 * 'flex'/非法值 → undefined（让 Tabulator 自动分配）。
 */
function normalizeColWidth (width) {
  if (width == null || width === '') return undefined
  if (typeof width === 'number') return Number.isFinite(width) ? width : undefined
  const s = String(width).trim()
  if (/%$/.test(s)) return s                       // 百分比：Tabulator 原生支持
  const px = s.match(/^(\d+(?:\.\d+)?)\s*px$/i)
  if (px) return Number(px[1])                     // '300px' → 300
  if (/^\d+(?:\.\d+)?$/.test(s)) return Number(s)  // '300' → 300
  return undefined                                  // 'flex' 等：自动分配
}

/**
 * 归一行 id：非对象行或无 id 时自动生成 `r{index+1}`。
 * @param {*} row               - 原始行数据
 * @param {number} [index=0]    - 行序号（用于生成兜底 id）
 * @returns {{id:*, value?:*}|object} 带 id 的行对象
 */
function normalizeRowId (row, index) {
  if (!row || typeof row !== 'object') return { id: `r${index + 1}`, value: row }
  if (row.id != null && row.id !== '') return row
  return { id: `r${index + 1}`, ...row }
}

/**
 * 归一对齐方式：显式 left/right/center 优先；否则按列类型推断（数值/金额右对齐）。
 * @param {string} [align] - 显式对齐
 * @param {string} [type]  - 列类型
 * @returns {string|undefined}
 */
function normalizeAlign (align, type) {
  if (align === 'right' || align === 'center' || align === 'left') return align
  if (type === 'number' || type === 'currency' || type === 'amount') return 'right'
  return undefined
}

/**
 * 根据列定义推断 Tabulator formatter。
 * money / currency / amount → 'money'；checkbox / boolean → 'tickCross'；date → 'datetime'。
 * @param {object} col - 列定义
 * @returns {string|undefined}
 */
function formatterForColumn (col) {
  if (col.formatter === 'money' || col.type === 'currency' || col.type === 'amount') return 'money'
  if (col.formatter === 'tickCross' || col.type === 'checkbox' || col.type === 'boolean') return 'tickCross'
  if (col.type === 'date') return 'datetime'
  return col.formatter || undefined
}

/**
 * 根据列定义推断 Tabulator editor 类型；只读列返回 false。
 * @param {object} col       - 列定义
 * @param {boolean} readonly - 全局只读标记
 * @returns {string|false}
 */
function editorForColumn (col, readonly) {
  if (readonly || col.readonly || col.editable === false || col.editMode === 'readonly') return false
  const type = col.editor || col.type
  if (type === 'number' || type === 'currency' || type === 'amount') return 'number'
  if (type === 'select' || type === 'list') return 'list'
  if (type === 'checkbox' || type === 'boolean') return 'tickCross'
  if (type === 'textarea') return 'textarea'
  if (type === 'date') return 'date'
  return col.editable ? 'input' : false
}

/**
 * 构造 Tabulator list editor 的 editorParams：把 options/values 数组归一为 {value:label} 映射。
 * @param {object} col - 列定义
 * @returns {object|undefined}
 */
function tabulatorEditorParams (col) {
  const opts = col.options || col.values || col.editorParams?.values
  if (Array.isArray(opts)) {
    const values = {}
    for (const o of opts) {
      if (o == null) continue
      if (typeof o === 'object') values[o.value ?? o.id ?? o.key] = o.label ?? o.text ?? o.name ?? o.value ?? o.id ?? o.key
      else values[o] = o
    }
    return { values, ...(col.editorParams || {}) }
  }
  return col.editorParams || undefined
}

/**
 * 把 cmx 列定义转换为 Tabulator 列定义。
 * 支持多级表头（children 数组递归）；清理空值字段后返回。
 * @param {object} col              - cmx 列定义（field/key/id/title/width/formatter/editor…）
 * @param {object} [opts={}]        - 附加选项（readonly 等）
 * @param {boolean} [opts.readonly] - 全局只读标记
 * @returns {object|null} Tabulator 列定义；col 无有效 field 且无 children 时返回 null
 */
function toTabulatorColumn (col, opts = {}) {
  if (!col || typeof col !== 'object') return null
  const field = col.field || col.key || col.id
  if (!field && !Array.isArray(col.children)) return null
  if (Array.isArray(col.children) && col.children.length) {
    return {
      title: col.title || col.label || col.caption || '',
      columns: col.children.map((c) => toTabulatorColumn(c, opts)).filter(Boolean),
      headerHozAlign: col.headerHozAlign || 'center',
    }
  }
  const out = {
    title: col.title || col.label || col.caption || field,
    field,
    width: normalizeColWidth(col.width),
    minWidth: normalizeColWidth(col.minWidth),
    maxWidth: normalizeColWidth(col.maxWidth),
    visible: col.visible !== false,
    headerSort: col.headerSort !== false,
    sorter: col.sorter || (col.type === 'number' ? 'number' : undefined),
    formatter: formatterForColumn(col),
    hozAlign: normalizeAlign(col.align || col.hozAlign, col.type),
    headerHozAlign: col.headerAlign || col.headerHozAlign || 'center',
    editor: editorForColumn(col, opts.readonly),
    editorParams: tabulatorEditorParams(col),
    bottomCalc: col.bottomCalc,
    frozen: !!col.frozen,
    tooltip: col.tooltip,
    cssClass: col.cssClass || col.className,
  }
  for (const key of Object.keys(out)) if (out[key] == null || out[key] === '') delete out[key]
  return out
}

export class CmxTabulator extends HTMLElement {
  /** 声明式属性变化时触发的监听列表（属性名 → 自动重渲染）。 */
  static get observedAttributes () {
    return [
      'data-cmx-options',
      'data-cmx-columns',
      'data-cmx-rows',
      'data-cmx-height',
      'data-cmx-layout',
      'data-cmx-pagination',
      'data-cmx-page-size',
      'data-cmx-selection-mode',
      'data-cmx-placeholder',
      'data-cmx-movable-columns',
      'data-cmx-reactive-data',
      'data-cmx-auto-columns',
      'data-cmx-readonly',
      'data-cmx-tree',
      'data-cmx-parent-field',
      'data-cmx-tree-column',
      'data-cmx-tree-child-field',
      'data-cmx-tree-start-expanded',
      'data-cmx-icon-field',
      'data-cmx-skin',
      'data-cmx-borderless',
      'data-cmx-flat',
    ]
  }

  constructor () {
    super()
    /** @type {Array<object>} 列定义数组（cmx 格式，_tabulatorColumns 时转换为 Tabulator 格式） */
    this._columns = []
    /** @type {Array<object>} 行数据数组（已归一 id） */
    this._rows = []
    /** @type {object} 当前选项（DEFAULT_OPTIONS 与声明式属性 / setOptions 合并结果） */
    this._opts = { ...DEFAULT_OPTIONS }
    /** @type {*|null} 当前选中行 id（单选模式） */
    this._selectedId = null
    /** @type {Set<*>} 多选模式下勾选的行 id 集合 */
    this._selectedIds = new Set()
    /** @type {object|null} 绑定的 CmxDataSet 实例（若有） */
    this._ds = null
    /** @type {Tabulator|null} Tabulator 表格实例 */
    this._table = null
    /** @type {object|null} 绑定的 CmxColumnModel 实例（若有） */
    this._model = null
    /** @type {Function|null} 列模型 columns-changed 事件监听器引用（用于解绑） */
    this._boundModelListener = null
    /** @type {ResizeObserver|null} 容器尺寸观察器（触发 redraw） */
    this._resizeObserver = null
    /** @type {string} 树形图标字段（来自列模型 iconCol 或 data-cmx-icon-field） */
    this._iconField = ''
    /** @type {Set<*>} 展开行 id 快照（刷新数据时保持展开态，模式同 cmx-web-treeview） */
    this._expandedIds = new Set()
    /** @type {Function|null} 门户主题切换事件（cmx-portal-theme-change）监听器引用 */
    this._onPortalThemeChange = null
  }

  /** 元素插入 DOM 时：创建 shadow root、构建表格、挂 ResizeObserver 与主题监听。 */
  connectedCallback () {
    if (this.shadowRoot) return
    this.attachShadow({ mode: 'open' })
    this.shadowRoot.innerHTML = `<style>${this._styles()}</style><div class="cmx-tabulator-host" id="host"></div>`
    this._host = this.shadowRoot.getElementById('host')
    this._bootstrapFromAttributes()
    this._createTable()
    this._resizeObserver = new ResizeObserver(() => this.redraw())
    this._resizeObserver.observe(this)
    // 主题：与 cmx-revo-grid / cmx-web-treeview 一致，延一帧检测暗色并监听门户主题切换
    this._applyTheme()
    this._onPortalThemeChange = () => this._applyTheme()
    window.addEventListener('cmx-portal-theme-change', this._onPortalThemeChange)
  }

  /** 元素移出 DOM 时：断开观察器、解绑监听、销毁表格实例。 */
  disconnectedCallback () {
    this._resizeObserver?.disconnect()
    this._resizeObserver = null
    if (this._onPortalThemeChange) {
      window.removeEventListener('cmx-portal-theme-change', this._onPortalThemeChange)
      this._onPortalThemeChange = null
    }
    this._unbindDsListeners()
    this._unbindColumnModel()
    this._destroyTable()
  }

  /**
   * 声明式属性变化回调：首次插入（shadowRoot 尚未就绪）时跳过；
   * 之后按属性名分流——columns/rows/icon-field 单独处理，其余统一重建选项。
   * @param {string} name      - 变化的属性名
   * @param {string} oldValue  - 旧值
   * @param {string} newValue  - 新值
   */
  attributeChangedCallback (name, oldValue, newValue) {
    if (oldValue === newValue || !this.shadowRoot) return
    if (name === 'data-cmx-columns') {
      const cols = parseJsonAttr(this, 'data-cmx-columns')
      if (cols) this.setColumns(cols)
      return
    }
    if (name === 'data-cmx-rows') {
      const rows = parseJsonAttr(this, 'data-cmx-rows')
      if (rows) this.setData(rows)
      return
    }
    if (name === 'data-cmx-icon-field') {
      this._iconField = this.getAttribute('data-cmx-icon-field') || ''
      if (this._table) this._table.setColumns(this._tabulatorColumns())
      return
    }
    this._bootstrapOptionsFromAttributes()
    this.setOptions(this._opts)
  }

  /** 从声明式属性（data-cmx-*）一次性初始化选项、列、行数据（connectedCallback 首次调用）。 */
  _bootstrapFromAttributes () {
    this._bootstrapOptionsFromAttributes()
    const opts = parseJsonAttr(this, 'data-cmx-options')
    if (opts) this._opts = { ...this._opts, ...opts }
    if (this.hasAttribute('data-cmx-icon-field')) this._iconField = this.getAttribute('data-cmx-icon-field') || ''
    const cols = parseJsonAttr(this, 'data-cmx-columns')
    if (cols) this._columns = Array.isArray(cols) ? cols.slice() : []
    const rows = parseJsonAttr(this, 'data-cmx-rows')
    if (rows) this._rows = Array.isArray(rows) ? rows.map(normalizeRowId) : []
  }

  /** 把所有 data-cmx-* 声明式属性解析到 _opts（每次属性变化时重新解析全量）。 */
  _bootstrapOptionsFromAttributes () {
    const next = { ...this._opts }
    if (this.hasAttribute('data-cmx-height')) next.height = this.getAttribute('data-cmx-height') || DEFAULT_OPTIONS.height
    if (this.hasAttribute('data-cmx-layout')) next.layout = this.getAttribute('data-cmx-layout') || DEFAULT_OPTIONS.layout
    if (this.hasAttribute('data-cmx-placeholder')) next.placeholder = this.getAttribute('data-cmx-placeholder') || DEFAULT_OPTIONS.placeholder
    if (this.hasAttribute('data-cmx-page-size')) next.paginationSize = toNumberOrNull(this.getAttribute('data-cmx-page-size')) || DEFAULT_OPTIONS.paginationSize
    if (this.hasAttribute('data-cmx-selection-mode')) next.selectableRows = this._selectionModeToTabulator(this.getAttribute('data-cmx-selection-mode'))
    if (this.hasAttribute('data-cmx-readonly')) next.readonly = attrBool(this, 'data-cmx-readonly', false)
    if (this.hasAttribute('data-cmx-skin')) next.skin = this.getAttribute('data-cmx-skin') || ''
    if (this.hasAttribute('data-cmx-borderless')) next.borderless = attrBool(this, 'data-cmx-borderless', false)
    if (this.hasAttribute('data-cmx-flat')) next.borderless = attrBool(this, 'data-cmx-flat', true)
    if (this.hasAttribute('data-cmx-parent-field')) next.parentField = this.getAttribute('data-cmx-parent-field') || DEFAULT_OPTIONS.parentField
    if (this.hasAttribute('data-cmx-tree-column')) next.treeColumn = this.getAttribute('data-cmx-tree-column') || null
    if (this.hasAttribute('data-cmx-tree-child-field')) next.dataTreeChildField = this.getAttribute('data-cmx-tree-child-field') || DEFAULT_OPTIONS.dataTreeChildField
    if (this.hasAttribute('data-cmx-tree-start-expanded')) next.treeStartExpanded = this._parseStartExpanded(this.getAttribute('data-cmx-tree-start-expanded'))
    for (const attr of BOOL_ATTRS) {
      if (!this.hasAttribute(attr)) continue
      const key = {
        'data-cmx-pagination': 'pagination',
        'data-cmx-movable-columns': 'movableColumns',
        'data-cmx-reactive-data': 'reactiveData',
        'data-cmx-auto-columns': 'autoColumns',
        'data-cmx-tree': 'dataTree',
      }[attr]
      next[key] = attrBool(this, attr, next[key])
    }
    if (next.pagination === true) next.pagination = 'local'
    this._opts = next
  }

  /** 解析 data-cmx-tree-start-expanded：'true'/'false' | 数字 | JSON 数组 → treeStartExpanded */
  _parseStartExpanded (raw) {
    const v = String(raw ?? '').trim()
    if (v === '' || v === 'true' || v === '1' || v === 'yes') return true
    if (v === 'false' || v === '0' || v === 'no') return false
    if (/^\d+$/.test(v)) return Number(v)
    if (v.startsWith('[')) { try { return JSON.parse(v) } catch { return false } }
    return false
  }

  /**
   * 把 cmx selection-mode 映射为 Tabulator selectableRows：
   * none/false/0/manual/cursor → false（禁用内置选择，用 cmx-current-row 标记）；
   * multi/multiple → true；其余 → 1（单选）。
   * @param {string} mode
   * @returns {boolean|number}
   */
  _selectionModeToTabulator (mode) {
    const m = String(mode || '').toLowerCase()
    if (m === 'none' || m === 'false' || m === '0') return false
    if (m === 'manual' || m === 'cursor') return false
    if (m === 'multi' || m === 'multiple') return true
    return 1
  }

  /** 返回 shadow DOM 内联样式：Tabulator 基础 CSS + SAP 主题变量覆盖 + 树形图标样式。 */
  _styles () {
    return `
      ${TABULATOR_CSS}
      :host {
        display: block;
        min-height: 240px;
        height: var(--cmx-tabulator-height, auto);
        color: var(--sapTextColor, #32363a);
        background: var(--sapList_Background, #fff);
      }
      .cmx-tabulator-host {
        width: 100%;
        height: 100%;
        min-height: inherit;
        box-sizing: border-box;
      }
      :host([data-cmx-skin="flat"]),
      :host([data-cmx-borderless]),
      :host([data-cmx-flat]) {
        background: transparent;
      }
      :host([data-cmx-skin="flat"]) .tabulator,
      :host([data-cmx-borderless]) .tabulator,
      :host([data-cmx-flat]) .tabulator {
        border: 0 !important;
        border-radius: 0 !important;
        box-shadow: none !important;
      }
      .tabulator {
        border: 1px solid var(--sapList_BorderColor, #d9d9d9);
        background: var(--sapList_Background, #fff);
        color: var(--sapTextColor, #32363a);
        font-family: var(--sapFontFamily, system-ui, sans-serif);
        font-size: var(--sapFontSize, 0.875rem);
      }
      .tabulator .tabulator-header {
        background: var(--sapList_HeaderBackground, #f7f7f7);
        border-bottom-color: var(--sapList_BorderColor, #d9d9d9);
        color: var(--sapList_HeaderTextColor, #32363a);
      }
      .tabulator .tabulator-header .tabulator-col {
        background: var(--sapList_HeaderBackground, #f7f7f7);
        border-right-color: var(--sapList_BorderColor, #d9d9d9);
      }
      .tabulator .tabulator-row {
        background: var(--sapList_Background, #fff);
        color: var(--sapTextColor, #32363a);
        border-bottom-color: var(--sapList_BorderColor, #d9d9d9);
      }
      .tabulator .tabulator-row.tabulator-row-even {
        background: var(--sapList_AlternatingBackground, #fafafa);
      }
      .tabulator .tabulator-row.tabulator-selected,
      .tabulator .tabulator-row.cmx-current-row {
        background: var(--sapList_SelectionBackgroundColor, #e5f0fa);
      }
      .tabulator .tabulator-row:hover {
        background: var(--sapList_Hover_Background, #f5f5f5);
      }
      .tabulator .tabulator-cell {
        border-right-color: var(--sapList_BorderColor, #d9d9d9);
      }
      .tabulator .tabulator-footer {
        background: var(--sapList_FooterBackground, #f7f7f7);
        border-top-color: var(--sapList_BorderColor, #d9d9d9);
        color: var(--sapList_FooterTextColor, #32363a);
      }
      .cmx-tabulator-empty {
        color: var(--sapContent_LabelColor, #6a6d70);
        padding: 1rem;
      }
      /* ── treegrid：展开把手主题化（Tabulator 默认硬编码 #333，这里改用 SAP 变量） ── */
      .tabulator .tabulator-row .tabulator-cell .tabulator-data-tree-control {
        border-color: var(--sapContent_IconColor, var(--sapContent_LabelColor, #6a6d70));
        background: transparent;
      }
      .tabulator .tabulator-row .tabulator-cell .tabulator-data-tree-control:hover {
        background: var(--sapList_Hover_Background, rgba(0,0,0,0.08));
      }
      .tabulator .tabulator-row .tabulator-cell .tabulator-data-tree-control .tabulator-data-tree-control-expand,
      .tabulator .tabulator-row .tabulator-cell .tabulator-data-tree-control .tabulator-data-tree-control-expand:after,
      .tabulator .tabulator-row .tabulator-cell .tabulator-data-tree-control .tabulator-data-tree-control-collapse:after {
        background: var(--sapContent_IconColor, var(--sapContent_LabelColor, #6a6d70));
      }
      /* 树形单元格图标（iconCol → <ui5-icon> 前缀） */
      .cmx-tree-cell-icon {
        width: 1rem;
        height: 1rem;
        flex-shrink: 0;
        margin-right: 6px;
        vertical-align: text-bottom;
        color: var(--sapContent_NonInteractiveIconColor, var(--sapHighlightColor, #0070f2));
      }
    `
  }

  /** 创建 Tabulator 实例（先销毁旧实例），并绑定事件转发。 */
  _createTable () {
    if (!this._host) return
    this._destroyTable()
    this._table = new Tabulator(this._host, this._tabulatorOptions())
    this._wireTabulatorEvents()
  }

  /** 销毁当前 Tabulator 实例并释放引用。 */
  _destroyTable () {
    if (!this._table) return
    try { this._table.destroy() } catch {}
    this._table = null
  }

  /**
   * 构造传给 Tabulator 构造函数的完整配置对象。
   * 把 cmx 级选项（parentField/treeColumn/treeStartExpanded/selectionMode）翻译为
   * Tabulator 原生选项（dataTree 系列 / dataTreeElementColumn / dataTreeStartExpanded），
   * 并注入数据（_treeRows）和列定义（_tabulatorColumns）。
   * @returns {object} Tabulator 配置对象
   */
  _tabulatorOptions () {
    // parentField / treeColumn / treeStartExpanded 是 cmx 级选项，Tabulator 不认识，
    // 从展开到 base 的 rest 里剔除（parentField 仅用于剔除，故下划线命名）。
    const { dataTree, parentField: _parentField, treeColumn, treeStartExpanded, selectionMode: _selectionMode, ...rest } = this._opts
    const base = {
      ...rest,
      data: this._treeRows(),
      columns: this._tabulatorColumns(),
    }
    if (dataTree) {
      base.dataTree = true
      base.dataTreeChildField = this._opts.dataTreeChildField || '_children'
      base.dataTreeChildIndent = this._opts.dataTreeChildIndent ?? 14
      base.dataTreeStartExpanded = this._toTabulatorStartExpanded(treeStartExpanded)
      base.dataTreeElementColumn = treeColumn || (this._columns[0]?.field || this._columns[0]?.key || this._columns[0]?.id)
      base.dataTreeSelectPropagate = this._opts.dataTreeSelectPropagate ?? false
      // 把展开/折叠控件渲染到树列；Tabulator 默认就有，这里显式保证开关行为
      base.dataTreeBranchElement = this._opts.dataTreeBranchElement ?? true
    } else {
      base.dataTree = false
    }
    return base
  }

  /**
   * 归一 treeStartExpanded → Tabulator 认得的 dataTreeStartExpanded。
   * Tabulator 只支持 boolean | function(row,level) | boolean[]（按 level 取）三种；
   * **不支持纯数字**——数字会落进它的 default 分支当数组下标取，返回 undefined → 全折叠。
   * 故这里把「数字 N＝展开前 N 层」翻译为 function：level < N 时返回 true。
   * @param {boolean|number|Array<boolean>|Function} v
   * @returns {boolean|Function|Array<boolean>}
   */
  _toTabulatorStartExpanded (v) {
    if (typeof v === 'number') {
      const depth = v
      return (_row, level) => Number(level) < depth   // level 从 0 起：N=1 只展开根层
    }
    if (typeof v === 'boolean' || typeof v === 'function' || Array.isArray(v)) return v
    return false
  }

  /** 数据：树模式下用 lib/cmx-tree-data 归一为嵌套数组；非树模式原样。 */
  _treeRows () {
    if (!this._opts.dataTree) return this._rows
    return normalizeTreeData(this._rows, {
      idField: this._opts.index || 'id',
      parentField: this._opts.parentField || 'parentId',
      childField: this._opts.dataTreeChildField || '_children',
    })
  }

  /**
   * 把 _columns 转换为 Tabulator 列定义数组。
   * 按 selectionCheckbox 选项在首列插入复选框列；树模式且配置了 iconField 时叠加图标 formatter。
   * @returns {Array<object>} Tabulator 列定义数组
   */
  _tabulatorColumns () {
    const cols = this._columns.map((c) => toTabulatorColumn(c, { readonly: !!this._opts.readonly })).filter(Boolean)
    if (this._opts.selectionCheckbox) {
      cols.unshift({
        formatter: (cell) => this._selectionCheckboxFormatter(cell),
        titleFormatter: () => '<input type="checkbox" class="cmx-selection-checkbox cmx-selection-checkbox-all" aria-label="全选">',
        hozAlign: 'center',
        headerHozAlign: 'center',
        headerSort: false,
        resizable: false,
        frozen: true,
        width: normalizeColWidth(this._opts.selectionCheckboxWidth) || 36,
        cellClick: (e, cell) => {
          e.stopPropagation()
          this._toggleCheckboxRow(cell.getRow())
        },
        headerClick: (e) => {
          e.stopPropagation()
          this._toggleCheckboxAll()
        },
      })
    }
    if (this._opts.dataTree && this._iconField) this._applyTreeIconFormatter(cols)
    return cols
  }

  /**
   * 给树列（dataTreeElementColumn 或第一列）叠加图标 formatter：
   * 单元格文本前插入 <ui5-icon name="{iconField 值}">，模式同 cmx-web-treeview 的 iconCol。
   * 不覆盖列自带的 formatter（仅在无自定义 formatter 时叠加）。
   */
  _applyTreeIconFormatter (cols) {
    const treeField = this._opts.treeColumn || cols[0]?.field
    const target = cols.find((c) => c.field === treeField) || cols[0]
    if (!target || target.formatter) return
    const iconField = this._iconField
    target.formatter = (cell) => {
      const data = cell.getRow()?.getData?.() || {}
      const text = cell.getValue()
      const safe = (text == null ? '' : String(text))
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      const iconName = data[iconField]
      const icon = iconName
        ? `<ui5-icon name="${String(iconName).replace(/"/g, '&quot;')}" class="cmx-tree-cell-icon"></ui5-icon>`
        : ''
      return `<span style="display:inline-flex;align-items:center;min-width:0;">${icon}<span style="overflow:hidden;text-overflow:ellipsis;">${safe}</span></span>`
    }
  }

  /** 把 Tabulator 原生事件转发为 cmx-* CustomEvent；树模式额外同步 _expandedIds 快照。 */
  _wireTabulatorEvents () {
    if (!this._table) return
    this._table.on('rowClick', (_e, row) => this._onRowSelected(row))
    this._table.on('rowSelected', (row) => this._emitRowSelection())
    this._table.on('rowDeselected', (row) => this._emitRowSelection())
    this._table.on('cellEdited', (cell) => this._onCellEdited(cell))
    this._table.on('dataChanged', (data) => this._emit('cmx-tabulator-data-changed', { rows: data }))
    this._table.on('dataFiltered', (filters, rows) => this._emit('cmx-tabulator-filtered', { filters, rowCount: rows.length }))
    this._table.on('dataSorted', (sorters, rows) => this._emit('cmx-tabulator-sorted', { sorters, rowCount: rows.length }))
    this._table.on('pageLoaded', (pageNo) => this._emit('cmx-tabulator-page-loaded', { page: pageNo }))
    this._table.on('columnMoved', (column, columns) => this._emit('cmx-tabulator-column-moved', {
      field: column.getField?.(),
      columns: columns.map((c) => c.getField?.()).filter(Boolean),
    }))
    // treegrid：展开/折叠 → 同步 _expandedIds 快照 + 转发 cmx 事件
    this._table.on('dataTreeRowExpanded', (row, level) => {
      const data = row?.getData?.() || {}
      if (data.id != null) this._expandedIds.add(data.id)
      this._emit('cmx-tree-row-expanded', { id: data.id, row: data, level })
    })
    this._table.on('dataTreeRowCollapsed', (row, level) => {
      const data = row?.getData?.() || {}
      if (data.id != null) this._expandedIds.delete(data.id)
      this._emit('cmx-tree-row-collapsed', { id: data.id, row: data, level })
    })
    this._table.on('tableBuilt', () => this._emit('cmx-tabulator-ready', { table: this._table }))
  }

  /** rowClick / rowSelected 回调：记录选中 id、同步 DataSet 游标、派发 cmx-row-selected。 */
  _onRowSelected (rowComp) {
    const data = rowComp?.getData?.()
    if (!data || data.__cmxFiller) return
    this._selectedId = data.id ?? null
    if (this._ds && this._selectedId != null && typeof this._ds.moveToId === 'function') {
      this._ds.moveToId(this._selectedId)
      return
    }
    this._emit('cmx-row-selected', { id: this._selectedId, row: data })
  }

  /** 多选模式下：读取 Tabulator 当前选中行数据，更新 _selectedIds 并派发 cmx-row-selection-change。 */
  _emitRowSelection () {
    if (!this._table) return
    const selectedRows = this._table.getSelectedData()
    this._selectedIds = new Set(selectedRows.map((r) => r.id).filter((id) => id != null))
    this._emit('cmx-row-selection-change', { ids: this.getSelectedIds(), rows: selectedRows })
  }

  /** 复选框列的 cell formatter：根据 _selectedIds 渲染勾选状态的 checkbox。 */
  _selectionCheckboxFormatter (cell) {
    const data = cell?.getRow?.()?.getData?.() || {}
    const checked = data.id != null && this._selectedIds.has(data.id)
    return `<input type="checkbox" class="cmx-selection-checkbox" aria-label="选择行"${checked ? ' checked' : ''}>`
  }

  /** 深度遍历所有行组件（含树形子行），对每个 RowComponent 调用 visitor。 */
  _walkRowComponents (visitor) {
    if (!this._table || typeof visitor !== 'function') return
    const walk = (rows) => {
      for (const row of rows || []) {
        visitor(row)
        const kids = typeof row.getTreeChildren === 'function' ? row.getTreeChildren() : []
        if (kids && kids.length) walk(kids)
      }
    }
    try { walk(this._table.getRows()) } catch {}
  }

  /** 从 _rows 中筛出 _selectedIds 包含的行数据（用于复选框模式的事件回调）。 */
  _selectedRowsFromIds () {
    const ids = new Set(Array.from(this._selectedIds).map((id) => String(id)))
    return this._rows.filter((r) => r && r.id != null && ids.has(String(r.id)))
  }

  /** 切换单行复选框勾选态，同步 UI 并派发 cmx-row-selection-change。 */
  _toggleCheckboxRow (rowComp) {
    const data = rowComp?.getData?.()
    if (!data || data.__cmxFiller || data.id == null) return
    if (this._selectedIds.has(data.id)) this._selectedIds.delete(data.id)
    else this._selectedIds.add(data.id)
    this._syncSelectionCheckboxes()
    this._emit('cmx-row-selection-change', { ids: Array.from(this._selectedIds), rows: this._selectedRowsFromIds() })
  }

  /** 全选/全不选：遍历所有可见行，根据当前是否全选来决定勾选或取消勾选。 */
  _toggleCheckboxAll () {
    if (!this._table) return
    const rows = []
    this._walkRowComponents((row) => {
      const data = row?.getData?.()
      if (data && !data.__cmxFiller && data.id != null) rows.push(data)
    })
    const allSelected = rows.length > 0 && rows.every((r) => this._selectedIds.has(r.id))
    rows.forEach((r) => {
      if (allSelected) this._selectedIds.delete(r.id)
      else this._selectedIds.add(r.id)
    })
    this._syncSelectionCheckboxes()
    this._emit('cmx-row-selection-change', { ids: Array.from(this._selectedIds), rows: this._selectedRowsFromIds() })
  }

  /** 同步所有行复选框和表头全选框的勾选 / 半选（indeterminate）状态。 */
  _syncSelectionCheckboxes () {
    if (!this._table) return
    const visible = []
    this._walkRowComponents((row) => {
      const data = row?.getData?.() || {}
      const el = row?.getElement?.()
      if (!el || data.id == null) return
      visible.push(data.id)
      const cb = el.querySelector('.cmx-selection-checkbox')
      if (cb) cb.checked = this._selectedIds.has(data.id)
    })
    const header = this.shadowRoot?.querySelector('.cmx-selection-checkbox-all')
    if (header) {
      const count = visible.filter((id) => this._selectedIds.has(id)).length
      header.checked = visible.length > 0 && count === visible.length
      header.indeterminate = count > 0 && count < visible.length
    }
  }

  /** cellEdited 回调：同步写回 DataSet 并派发 cmx-cell-changed / cmx-tabulator-cell-edited。 */
  _onCellEdited (cell) {
    const row = cell.getRow().getData()
    const key = cell.getField()
    const value = cell.getValue()
    if (this._ds && row?.id != null && typeof this._ds.set === 'function') {
      this._ds.set(row.id, key, value)
    }
    this._emit('cmx-cell-changed', { id: row?.id, key, value, row })
    this._emit('cmx-tabulator-cell-edited', { id: row?.id, key, value, row, cell })
  }

  /** 派发 cmx-* CustomEvent（bubbles + composed，可穿透 shadow DOM）。 */
  _emit (name, detail = {}) {
    this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail }))
  }

  /** 解绑列模型的 columns-changed 监听器并清空引用。 */
  _unbindColumnModel () {
    if (this._model && this._boundModelListener && typeof this._model.removeEventListener === 'function') {
      this._model.removeEventListener('columns-changed', this._boundModelListener)
    }
    this._model = null
    this._boundModelListener = null
  }

  /**
   * 绑定 CmxColumnModel：把模型描述符转为列定义并应用，监听 columns-changed 自动刷新。
   * @param {object} model - CmxColumnModel 实例（需实现 toDescriptors / addEventListener）
   */
  setColumnModel (model) {
    if (!model) return
    this._unbindColumnModel()
    this._model = model
    const apply = () => {
      // 树形图标字段：与 cmx-web-treeview 一致，优先列模型 iconCol，其次声明式 data-cmx-icon-field
      if (model.iconCol) this._iconField = model.iconCol
      const descriptors = typeof model.toDescriptors === 'function'
        ? CmxColumnAdapter._flatDescriptors(model.toDescriptors())
        : []
      const columns = descriptors.length
        ? descriptors.map((d) => CmxColumnAdapter._descriptorToColumnDef(d))
        : []
      this.setColumns(columns)
    }
    apply()
    if (typeof model.addEventListener === 'function') {
      this._boundModelListener = apply
      model.addEventListener('columns-changed', this._boundModelListener)
    }
  }

  /**
   * 设置列定义并刷新表格列。
   * @param {Array<object>} columns - cmx 列定义数组
   */
  setColumns (columns) {
    this._columns = Array.isArray(columns) ? columns.slice() : []
    if (this._table) this._table.setColumns(this._tabulatorColumns())
  }

  /**
   * 合并选项并重建表格（选项变化无法热更新时整体重建）。
   * @param {object} [opts={}] - 要合并的选项
   */
  setOptions (opts = {}) {
    const next = { ...opts }
    if (Object.prototype.hasOwnProperty.call(next, 'selectionMode')) {
      next.selectableRows = this._selectionModeToTabulator(next.selectionMode)
    }
    this._opts = { ...this._opts, ...next }
    if (!this._table) return
    this._createTable()
    this._restoreSelection()
  }

  /**
   * 设置行数据（纯数组模式，解绑已有 DataSet）。
   * @param {Array<object>} [rows=[]] - 行数据数组
   * @param {object} [sel={}]         - 选中参数 { selectedId, selectedIds }
   */
  setData (rows = [], sel = {}) {
    this._unbindDsListeners()
    this._rows = Array.isArray(rows) ? rows.map(normalizeRowId) : []
    this._applySelectionArgs(sel)
    this._pushData()
  }

  /**
   * 绑定 CmxDataSet 实例（或直接传纯数组）。
   * DataSet 模式下自动监听 cursor-changed / ds-row-added / ds-row-removed / row-changed 事件。
   * @param {object|Array} dsOrRows - CmxDataSet 实例或纯数组
   * @param {object} [sel={}]       - 选中参数 { selectedId, selectedIds }
   */
  setDataSet (dsOrRows, sel = {}) {
    const isDs = dsOrRows && typeof dsOrRows === 'object'
      && Array.isArray(dsOrRows.rows) && typeof dsOrRows.addRow === 'function'
    if (!isDs) {
      this.setData(dsOrRows, sel)
      return
    }
    const prev = this._ds
    if (prev && prev !== dsOrRows) this._unbindDsListeners()
    this._ds = dsOrRows
    this._rows = dsOrRows.rows
    this._applySelectionArgs(sel)
    this._pushData()
    if (prev === dsOrRows) return
    this._cursorListener = (e) => {
      const row = e.detail?.row
      this._selectedId = row?.id ?? null
      this._restoreSelection()
      if (row) this._emit('cmx-row-selected', { id: row.id, row })
    }
    this._dsRowListener = () => this.refreshData()
    dsOrRows.addEventListener('cursor-changed', this._cursorListener)
    dsOrRows.addEventListener('ds-row-added', this._dsRowListener)
    dsOrRows.addEventListener('ds-row-removed', this._dsRowListener)
    dsOrRows.addEventListener('row-changed', this._dsRowListener)
    if (dsOrRows.currentRow) this._selectedId = dsOrRows.currentRow.id
  }

  /**
   * 把 _rows 推入 Tabulator。树模式经 _treeRows 归一为嵌套数组，
   * 推完后恢复选中 + 展开态快照（_expandedIds），模式同 cmx-web-treeview 的 setDataSet。
   */
  _pushData () {
    if (!this._table) return
    this._table.setData(this._treeRows())
      .then(() => { this._restoreSelection(); this._restoreExpanded() })
      .catch((e) => console.warn('[cmx-tabulator] setData failed:', e?.message || e))
  }

  /** 按 _expandedIds 快照恢复展开态（树模式刷新数据后保持用户已展开的节点）。 */
  _restoreExpanded () {
    if (!this._table || !this._opts.dataTree || !this._expandedIds.size) return
    for (const id of this._expandedIds) {
      try {
        const row = this._table.getRow(id)
        if (row && typeof row.treeExpand === 'function' && !row.isTreeExpanded()) row.treeExpand()
      } catch {}
    }
  }

  /** 应用选中参数（selectedId / selectedIds）到内部状态。 */
  _applySelectionArgs (sel = {}) {
    if ('selectedId' in sel) this._selectedId = sel.selectedId ?? null
    if ('selectedIds' in sel) this._selectedIds = new Set(sel.selectedIds || [])
  }

  /** 数据刷新后恢复选中态：Tabulator selectRow + cmx-current-row 标记 + 复选框同步。 */
  _restoreSelection () {
    if (!this._table) return
    const ids = this._selectedIds.size ? this.getSelectedIds() : (this._selectedId != null ? [this._selectedId] : [])
    const manual = this._opts.selectableRows === false
    if (manual) {
      this._markCurrentRows(this._selectedId != null ? [this._selectedId] : [])
      this._syncSelectionCheckboxes()
      return
    }
    try { this._table.deselectRow() } catch {}
    for (const id of ids) {
      try { this._table.selectRow(id) } catch {}
    }
    this._markCurrentRows(ids)
    this._syncSelectionCheckboxes()
  }

  /** 给指定 id 的行添加 cmx-current-row CSS 类（manual 选择模式下的视觉高亮）。 */
  _markCurrentRows (ids = []) {
    if (!this._table) return
    const wanted = new Set((ids || []).map((id) => String(id)))
    const walk = (rows) => {
      for (const row of rows || []) {
        const data = row?.getData?.() || {}
        const el = row?.getElement?.()
        if (el) el.classList.toggle('cmx-current-row', data.id != null && wanted.has(String(data.id)))
        const kids = typeof row.getTreeChildren === 'function' ? row.getTreeChildren() : []
        if (kids && kids.length) walk(kids)
      }
    }
    try { walk(this._table.getRows()) } catch {}
  }

  /** 解绑 DataSet 的 cursor-changed / ds-row-added / ds-row-removed / row-changed 监听器。 */
  _unbindDsListeners () {
    if (!this._ds) return
    if (this._cursorListener) this._ds.removeEventListener('cursor-changed', this._cursorListener)
    if (this._dsRowListener) {
      this._ds.removeEventListener('ds-row-added', this._dsRowListener)
      this._ds.removeEventListener('ds-row-removed', this._dsRowListener)
      this._ds.removeEventListener('row-changed', this._dsRowListener)
    }
    this._cursorListener = null
    this._dsRowListener = null
    this._ds = null
  }

  /** 从 DataSet 拉取最新行数据并整体替换（replaceData），树模式重建嵌套结构后恢复展开态。 */
  refreshData () {
    if (!this._table) return
    this._rows = this._ds?.rows || this._rows
    // 树模式下层级可能因增删改变化 → 重建嵌套结构后整体替换，并恢复展开态
    if (this._opts.dataTree) {
      this._table.replaceData(this._treeRows())
        .then(() => { this._restoreSelection(); this._restoreExpanded() })
        .catch(() => {})
      return
    }
    this._table.replaceData(this._rows).then(() => this._restoreSelection()).catch(() => {})
  }

  /** 强制重绘表格（容器尺寸变化时由 ResizeObserver 触发）。 */
  redraw () {
    if (!this._table) return
    try { this._table.redraw(true) } catch {}
  }

  /**
   * 新增一行：写入 DataSet 或直接追加到 _rows；树模式重建嵌套结构。
   * @param {object} [row={}]    - 行数据
   * @param {object} [opts={}]   - 选项 { select: boolean } 是否自动选中新行
   * @returns {object} 新增的行对象（含归一 id）
   */
  addRow (row = {}, opts = {}) {
    const next = normalizeRowId(row, this._rows.length)
    if (this._ds && typeof this._ds.addRow === 'function') {
      this._ds.addRow(next)
    } else if (this._opts.dataTree) {
      // 树模式：新行可能挂在某父节点下（parentField），无法用 Tabulator.addRow 顶层追加，
      // 直接重建嵌套结构整体刷新（_pushData 会恢复选中 + 展开态）。
      this._rows.push(next)
      this._pushData()
    } else {
      this._rows.push(next)
      this._table?.addRow(next, false)
    }
    this._emit('cmx-row-added', { id: next.id, row: next, index: this._rows.length - 1 })
    if (opts.select) {
      this._selectedId = next.id
      this._restoreSelection()
    }
    return next
  }

  /**
   * 删除指定 id 的行（支持单个 id 或 id 数组），并派发 cmx-row-removed。
   * @param {*|Array<*>} ids - 要删除的行 id 或 id 数组
   */
  removeRows (ids = []) {
    const list = Array.isArray(ids) ? ids : [ids]
    const removed = this._rows.filter((r) => list.includes(r.id))
    if (this._ds && typeof this._ds.removeRows === 'function') {
      this._ds.removeRows(list)
    } else if (this._opts.dataTree) {
      // 树模式：删父节点连带子树，直接重建嵌套结构刷新
      this._rows = this._rows.filter((r) => !list.includes(r.id))
      list.forEach((id) => this._expandedIds.delete(id))
      this._pushData()
    } else {
      this._rows = this._rows.filter((r) => !list.includes(r.id))
      this._table?.deleteRow(list).catch(() => {})
    }
    this._emit('cmx-row-removed', { ids: list, rows: removed })
  }

  /**
   * 获取当前表格数据（Tabulator 处理后的副本）。
   * @returns {Array<object>} 行数据数组
   */
  getData () {
    return this._table ? this._table.getData() : this._rows.slice()
  }

  /**
   * 获取当前选中行的 id 列表（多选优先返回 _selectedIds，否则返回单选 _selectedId）。
   * @returns {Array<*>} 选中行 id 数组
   */
  getSelectedIds () {
    if (this._selectedIds.size) return Array.from(this._selectedIds)
    return this._selectedId != null ? [this._selectedId] : []
  }

  /**
   * 获取当前选中行的完整数据。
   * @returns {Array<object>} 选中行数据数组
   */
  getSelectedRows () {
    if (this._table && this._opts.selectableRows !== false) return this._table.getSelectedData()
    const ids = new Set(this.getSelectedIds().map((id) => String(id)))
    return this._rows.filter((r) => r && r.id != null && ids.has(String(r.id)))
  }

  /**
   * 获取底层 Tabulator 实例（供外部高级操作）。
   * @returns {Tabulator|null}
   */
  getTabulator () {
    return this._table
  }

  // ── treegrid 展开/折叠 API（借鉴 cmx-web-treeview expandAll/collapseAll/expandNodes） ──

  /** 展开全部树节点；同时把所有可展开节点记入 _expandedIds 快照。 */
  expandAll () {
    if (!this._table || !this._opts.dataTree) return
    const rows = this._table.getRows()
    for (const row of rows) this._expandRowDeep(row)
  }

  /** 递归展开一行及其所有子孙行，同时把所有可展开节点记入 _expandedIds 快照。 */
  _expandRowDeep (row) {
    try {
      if (typeof row.treeExpand !== 'function') return
      const data = row.getData?.() || {}
      const kids = row.getTreeChildren?.() || []
      if (kids.length) {
        if (!row.isTreeExpanded()) row.treeExpand()
        if (data.id != null) this._expandedIds.add(data.id)
        for (const k of kids) this._expandRowDeep(k)
      }
    } catch {}
  }

  /** 折叠全部顶层树节点，并清空展开态快照。 */
  collapseAll () {
    if (!this._table || !this._opts.dataTree) return
    for (const row of this._table.getRows()) {
      try { if (typeof row.treeCollapse === 'function' && row.isTreeExpanded()) row.treeCollapse() } catch {}
    }
    this._expandedIds.clear()
  }

  /** 展开指定 id 的行。 */
  expandRow (id) {
    if (!this._table) return
    try {
      const row = this._table.getRow(id)
      if (row && typeof row.treeExpand === 'function') { row.treeExpand(); this._expandedIds.add(id) }
    } catch {}
  }

  /** 折叠指定 id 的行。 */
  collapseRow (id) {
    if (!this._table) return
    try {
      const row = this._table.getRow(id)
      if (row && typeof row.treeCollapse === 'function') { row.treeCollapse(); this._expandedIds.delete(id) }
    } catch {}
  }

  /** 切换指定 id 行的展开/折叠态。 */
  toggleRow (id) {
    if (!this._table) return
    try {
      const row = this._table.getRow(id)
      if (!row || typeof row.treeToggle !== 'function') return
      row.treeToggle()
      if (row.isTreeExpanded()) this._expandedIds.add(id)
      else this._expandedIds.delete(id)
    } catch {}
  }

  /** 当前展开节点 id 列表（快照）。 */
  getExpandedIds () {
    return Array.from(this._expandedIds)
  }

  // ── 主题（与 cmx-revo-grid / cmx-web-treeview 一致：暗色检测 + 门户主题切换） ──

  /**
   * 检测当前是否暗色模式：优先读 --sapBackgroundColor 的亮度（< 128 视为暗色），
   * 无法读取时回退到 prefers-color-scheme 媒体查询。
   * @returns {boolean}
   */
  _detectDarkMode () {
    return detectDarkMode()
  }

  /**
   * Tabulator 自带 :host 内联 CSS 全部走 SAP 变量，暗色由门户切换 --sap* 变量自动生效。
   * 这里仅在 host 上打 data-cmx-theme 标记，便于外部样式钩子 / 调试，并触发一次 redraw。
   */
  _applyTheme () {
    if (!this.shadowRoot) return
    const dark = this._detectDarkMode()
    this.setAttribute('data-cmx-theme', dark ? 'dark' : 'light')
    requestAnimationFrame(() => this.redraw())
  }
}

if (!customElements.get('cmx-tabulator')) {
  customElements.define('cmx-tabulator', CmxTabulator)
}
