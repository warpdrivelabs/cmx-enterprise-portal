/**
 * <cmx-revo-grid> — 基于 RevoGrid 的数据表格 Web Component 封装
 *
 * 结构：外层 <cmx-revo-grid>（Shadow DOM）内嵌原生 <revo-grid>，便于 CmxMasterSlave 主从协调器绑定。
 *
 * 列定义：只能通过 CmxColumnModel —— 运行时 setColumnModel(model)，
 *   声明式用 data-cmx-model-id="<CmxColumnModel instanceId>"（由 init-page-models 注入）。
 *   不再提供 setColumns/setHeaderGroups/setTotals 等自有列设置 API。
 *
 * 事件：
 *   cmx-row-selected           单选行变化
 *   cmx-row-selection-change   多选行变化
 *   cmx-cell-changed           单元格编辑完成
 *   cmx-row-added / cmx-row-removed
 *
 * 声明式属性（JSON 字符串）：data-cmx-options / data-cmx-rows
 *
 * 外观：
 *   未设置 data-cmx-skin 时默认 Neo（可由 globalThis.__cmxDefaultGridSkin 覆盖，门户默认为 neo）
 *   data-cmx-skin="plain" | "default" | "none" — 经典表格样式
 *   data-cmx-skin="neo" — 显式 Neo 皮肤
 *   data-cmx-skin-tone="cyan" | "azure" | "violet" | "mint" — 强调色
 *   data-cmx-style-id — 同页 <template> 注入覆盖样式
 *   data-cmx-embed — 内嵌于 combo/dict 弹层，默认不套 Neo（除非显式 data-cmx-skin）
 *   data-neo-grid-tone / data-neo-grid-lane — 旧版 neo 页自行注入，跳过全局默认
 */
import { defineCustomElements } from '@revolist/revogrid/loader'
import { CmxColumnAdapter } from '../lib/cmx-column-adapter.js'
import { detectDarkMode } from '../lib/cmx-theme-detect.js'
import { evalFormula } from '../lib/formula-eval.js'
import { getRegisteredGridEditors } from '../lib/cmx-form-field-registry.js'
import { CMX_GRID_NEO_SKIN_CSS } from '../lib/cmx-grid-neo-skin.js'
import { setSkinStyle, applyNeoSkin, applyPageStyleId } from '../lib/cmx-skin-runtime.js'
import { CmxDictCache, collectRefDicts, makeDictResolver } from '../lib/cmx-dict-cache.js'
import { showCmxToast } from '../lib/cmx-toast.js'
import { revoGridStretchMixin } from './revo-grid/revo-grid-stretch-mixin.js'
import { revoGridSelectionMixin } from './revo-grid/revo-grid-selection-mixin.js'
import { revoGridMultiHeaderMixin } from './revo-grid/revo-grid-multi-header-mixin.js'
import { revoGridSyncMixin } from './revo-grid/revo-grid-sync-mixin.js'
import { revoGridEventsMixin } from './revo-grid/revo-grid-events-mixin.js'
import { revoGridTooltipMixin } from './revo-grid/revo-grid-tooltip-mixin.js'
import { revoGridTextSelectMixin } from './revo-grid/revo-grid-text-select-mixin.js'
import { revoGridResizeMixin } from './revo-grid/revo-grid-resize-mixin.js'

const GRID_NEO_TONE_CLASSES = ['cmx-grid-neo--mint', 'cmx-grid-neo--violet', 'cmx-grid-neo--cyan', 'cmx-grid-neo--azure']
/** 空数组常量：_rows 为 null/undefined 时的兜底引用，避免每次 _displaySource 都新建数组。 */
const EMPTY_ROWS = Object.freeze([])

/** 是否已调用过 RevoGrid 的 customElements 注册，避免重复 define */
let _revoRegistered = false

/**
 * 确保浏览器中已注册 <revo-grid> 自定义元素。
 * 首次调用时通过 Stencil loader 批量注册 RevoGrid 全家桶组件。
 */
function ensureRevoGridElement() {
  if (_revoRegistered) return
  // 仅在浏览器环境且尚未注册时执行
  if (typeof customElements !== 'undefined' && !customElements.get('revo-grid')) {
    defineCustomElements()
  }
  _revoRegistered = true
}

/**
 * cmx-revo-grid 默认配置。
 *
 * 通过 `grid.setOptions(opts)` 覆盖任意键，未显式设置的键回退到此处的默认值。
 * 分为五大类：选择 / 布局 / 编辑 / 显示 / 其他。
 */
const DEFAULT_OPTIONS = {
  /* ── 选择 ── */
  /** 行选择模式：
   *  - 'none'   不可选，点击单元格不选中行
   *  - 'single' 单选（默认），同时只有一行高亮
   *  - 'multi'  多选，Ctrl/Shift 批量选择，配合 getSelectedIds() 获取选中行 id 数组 */
  selectionMode: 'single',
  /** 是否允许框选范围（拖拽选多个单元格）。默认 false。
   *  注意：selectionMode='multi' 时会自动启用 range 语义（多选行），此选项仅用于显式控制。 */
  range: false,

  /* ── 布局 ── */
  /** 数据行高（px）。影响虚拟滚动每屏行数。 */
  rowHeight: 32,
  /** 表头行高（px）。null = 与 rowHeight 一致。 */
  headerRowHeight: null,
  /** 固定视口高度（px）。fillHeight=true 时此项被忽略，grid 撑满父容器。 */
  viewHeight: 300,
  /** 是否撑满父容器高度（flex:1）。设为 false 时使用 viewHeight 固定高度。 */
  fillHeight: false,
  /** 是否启用虚拟滚动（大数据量必须开启）。 */
  virtualScroll: true,
  /** 最少渲染行数（即使数据不足也保留这么多空白行高度，避免表格太矮）。 */
  minRows: 0,
  /** 列宽是否按比例拉伸占满 grid 视图区域。设为 false 则列宽完全由列定义控制。 */
  stretch: true,
  /** 是否允许手动拖动表头边缘调节列宽。默认 false。
   *  开启后表头右缘出现拖把；用户拖动过的列宽被锁定（不参与 stretch 再分配），
   *  其余列继续自适应。列的 minSize/maxSize（width 对象形式的 min/max）约束拖动范围。
   *  setColumnModel 时清空历史拖动记录。 */
  resize: false,

  /* ── 编辑 ── */
  /** 是否允许进入编辑状态（总开关）。默认 false = 整表只读。
   *  设为 true 后才允许点击单元格进入编辑（仍受列自身 editMode='readonly' 等约束）。
   *  优先级高于 readonly；未显式设置 editable 时回退为 !readonly 以兼容旧用法。 */
  editable: false,
  /** 整表只读快捷开关（editable 的反向语义，兼容旧用法）。 */
  readonly: false,
  /** 编辑触发方式：
   *  - 'dblclick' 单击聚焦 + 双击/Enter 进入编辑（默认，revo-grid 原生方式）
   *  - 'click'    单击单元格即进入编辑（进入后方向键归编辑器） */
  editTrigger: 'dblclick',

  /* ── 显示 ── */
  /** 视觉主题：
   *  - 'auto'        自动检测（根据 SAP UI5 CSS 变量 / prefers-color-schema）
   *  - 'default'     亮色 Material
   *  - 'compact'     紧凑 Material（行高更小）
   *  - 'darkMaterial' / 'darkCompact'  暗色主题 */
  theme: 'auto',
  /** 是否显示序号列（revo-grid 原生 rowHeaders）。 */
  showRowIndex: true,
  /** 序号列列头文字。 */
  rowIndexLabel: '序号',
  /** 序号列宽度（px）。 */
  rowIndexWidth: 40,
  /** 是否显示合计行。为 true 且未显式 setTotals 时，自动汇总所有数值列。 */
  showTotals: true,
  /** 合计行显式配置，覆盖自动汇总。
   *  格式：{ label?, columns?: string[], extra?: (rows, sums) => {} } */
  totals: null,
  /** 是否在列头显示必填标识（红色 *）。默认 true。
   *  标识仅作用于 _cmxCol.required 为真的叶子列（由 cmx-column-adapter 挂载）。
   *  只读展示页如需关闭：setOptions({ showRequiredMark: false })。 */
  showRequiredMark: true,
  /** 是否启用隔行换色（斑马纹 / zebra striping）。默认 true。
   *  仅影响 Neo 皮肤内置的偶数行背景规则（cmx-grid-neo-skin.js）——
   *  设 false 时所有行用同一背景，no zebra 视觉。
   *  非 Neo 皮肤本身就没有内置交替色，本选项对其无影响。
   *  设 true 时在宿主上加 .cmx-grid-alt-rows class，由 cmx-grid-neo-skin.js
   *  内的 CSS 选择器 :host(.cmx-grid-neo.cmx-grid-alt-rows) 命中。
   *  使用：setOptions({ alternateRowColor: false }) 或
   *        data-cmx-options='{"alternateRowColor": false}'。 */
  alternateRowColor: true,
  /** 单元格截断悬浮提示。默认 true：列宽不足导致文本被 ellipsis 裁剪时，
   *  鼠标悬浮 250ms 后显示完整内容的跟随浮层。设 false 关闭。
   *  表头单元格、序号列不提示。虚拟滚动安全（事件委托）。 */
  cellTooltip: true,
  /** 只读单元格文本选择。默认 false（revo-grid host 自带 user-select:none，文本不可拖选）。
   *  设 true 给数据单元格开 user-select:text，允许鼠标拖选文本 + Ctrl+C 复制选中部分。
   *  复制整格值不需要此选项：点单元格聚焦后 Ctrl+C 由 revo-grid 内置剪贴板支持。
   *  只读展示页（editable:false）推荐开启；编辑态开启会与编辑器点击冲突，不建议。 */
  allowTextSelect: false,
}

/**
 * 从宿主元素的 data-cmx-* 属性解析 JSON。
 * @param {HTMLElement} el
 * @param {string} name  属性名，如 'data-cmx-columns'
 * @returns {any|undefined} 解析失败时打 warn 并返回 undefined
 */
function parseJsonAttr(el, name) {
  if (!el.hasAttribute(name)) return undefined
  try {
    return JSON.parse(el.getAttribute(name))
  } catch (e) {
    console.warn(`[cmx-revo-grid] failed to parse ${name}:`, e?.message || e)
    return undefined
  }
}

/**
 * 下一帧回调封装：优先用 requestAnimationFrame，非浏览器环境降级到 setTimeout(0)。
 * @param {() => void} fn
 * @returns {number} 定时器 id（可用于取消）
 */
function nextFrame(fn) {
  if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(fn)
  return setTimeout(fn, 0)
}

export class CmxRevoGrid extends HTMLElement {
  /**
   * 初始化内部状态；DOM 在 connectedCallback 中懒创建。
   */
  constructor() {
    super()
    /** @type {object[]} cmx-ui5-table 风格的列定义 { key, label, type, ... } */
    this._columns = []
    /** @type {object[]} 分组表头配置（扁平 span 或树形 children） */
    this._headerGroups = []
    /** @type {typeof DEFAULT_OPTIONS} 运行时选项 */
    this._opts = { ...DEFAULT_OPTIONS }
    /** @type {object[]} 当前数据行（业务对象，需含 id） */
    this._rows = []
    /** @type {import('../lib/cmx-data-set.js').CmxDataSet|null} 若通过 setDataSet 绑定 */
    this._ds = null
    /** @type {string|null} 单选模式下当前选中行 id */
    this._selectedId = null
    /** @type {Set<string>} 多选模式下已选行 id 集合 */
    this._selectedIds = new Set()
    /** @type {string|null} 多选模式下用于 Shift 区间选择的锚点（普通/Ctrl 点击会移动） */
    this._selectionAnchorId = null
    /** @type {{ctrlKey:boolean,shiftKey:boolean,metaKey:boolean,time:number}|null}
     *  最近一次 pointerdown 携带的修饰键与时间戳，_onAfterFocus 据此还原用户的点击意图。
     *  仅在 200ms 内有效，避免陈旧状态污染后续 focus 事件。 */
    this._lastClickModifiers = null
    /** @type {object[]} 已转换的 RevoGrid columns（含分组 children） */
    this._revoColumns = []
    /** @type {Map<string, number>} 用户手动拖动过的列宽（key=列 prop，value=像素宽）。
     *  resize 开启后，aftercolumnresize 事件回写此处；_columnsForViewport 把这些列当
     *  "锁定值"排除出 stretch 再分配，其余列继续自适应。setColumnModel 时清空。 */
    this._userColSizes = new Map()
    /** @type {ResizeObserver|null} host 尺寸监听（fillHeight/stretch 任一开启时安装） */
    this._hostResizeRo = null
    /** @type {boolean} stretch 刷新是否已排在下一帧（去重标记，避免一帧内多次 refresh） */
    this._stretchRefreshPending = false
    /** @type {Object<string, any>} revo-grid 各 prop 的最近一次签名值，用于 _setRevoProp 同值跳过 */
    this._revoPropSigs = Object.create(null)
    /** @type {boolean} 合计行列宽刷新是否已排在下一帧（去重标记） */
    this._totalsColumnsRefreshPending = false
    /** @type {number} 数据源版本号，每次 _assignSource 自增，纳入 _sourceSignature 区分变更 */
    this._sourceRevision = 0
    /** @type {object[]|null} _displaySource 的缓存结果（rows 引用 + minRows + length 三者不变即复用） */
    this._displaySourceCache = null
    /** @type {object[]|null} 缓存对应的 _rows 引用，用于判定缓存是否仍然有效 */
    this._displaySourceBaseRows = null
    /** @type {number} 缓存对应的 minRows */
    this._displaySourceMinR = -1
    /** @type {number} 缓存对应的 _rows.length */
    this._displaySourceLen = -1
    /** @type {HTMLElement|null} 内部 revo-grid 实例 */
    this._revo = null
    /** @type {HTMLElement|null} Shadow DOM 内挂载 revo-grid 的容器 #host */
    this._host = null
    /** @type {((id: string) => any)|null} 协调器注入的数据源解析函数（ref 列扩展用） */
    this._dsProvider = null
    /** @type {CmxDictCache|null} 字典外键回显缓存（setDictCache 注入；列有 refDict 时预加载并回显） */
    this._dictCache = null
  }

  /**
   * 元素插入文档时：创建 Shadow DOM、挂载 revo-grid、绑定事件并应用属性配置。
   * 若已存在 shadowRoot（例如被移动节点）则直接返回，避免重复初始化。
   */
  connectedCallback() {
    if (this.shadowRoot) return

    ensureRevoGridElement()

    // 开放 Shadow DOM：隔离样式，同时允许 revo-grid 在内部正常渲染
    this.attachShadow({ mode: 'open' })
    this.shadowRoot.innerHTML = `<style>${this._css()}</style>${this._html()}`

    this._host = this.shadowRoot.getElementById('host')

    // 创建真正的 RevoGrid 实例并铺满 host 区域
    this._revo = document.createElement('revo-grid')
    this._revo.className = 'cmx-revo-inner'
    // 隐藏 RevoGrid 左下角的归属信息小三角（revogr-attribution）
    this._revo.setAttribute('hide-attribution', '')
    // 注入 cmx-form-field-registry 里所有 grid.editor，使列上 editor:'<type>' 能被 revo-grid 识别
    this._revo.editors = { ...getRegisteredGridEditors() }
    this._host.appendChild(this._revo)

    this._applySkin()
    this._applySize()
    this._applyDisabledCellOverride()
    this._bindRevoEvents()
    this._bindCellTooltip()
    this._bindTextSelect()
    this._bindRealtimeResize()
    this._applyAllowTextSelect()
    this._bindHeaderRenderListener()
    // 读取 HTML 上的 data-cmx-* 初始配置
    this._bootstrapFromAttributes()
    // 首次把列、数据、选项写入 revo-grid
    this._syncToRevo()

    // auto 主题：connectedCallback 时 UI5 adoptedStyleSheets 可能尚未生效，延一帧重新 apply
    if (!this._opts.theme || this._opts.theme === 'auto') {
      requestAnimationFrame(() => {
        if (!this._revo) return
        const next = this._resolveTheme()
        /* 同值跳过：避免触发 Stencil 不必要的 prop diff/render（在被嵌入 popover/编辑器槽时
           可能拖累宿主 grid 一起进入 render 队列，视觉上"宿主整张表闪烁"）。 */
        if (this._revo.theme === next) return
        this._setRevoProp('theme', next)
      })
      this._onPortalThemeChange = () => {
        if (!this._revo) return
        this._setRevoProp('theme', this._resolveTheme())
        /* 补刷一次：revo-grid 虚拟滚动下已渲染单元格不一定随 theme 属性重绘。
           CSS 变量驱动的颜色（如上方 --revo-grid-text → --sapTextColor 重映射）
           浏览器会自动重算，但 Neo 皮肤里按 [theme] 选择器分支的规则需 refresh
           才能落到 DOM（见 _syncSelection 同类注释 L704-707）。 */
        try { this._revo.refresh?.('all') } catch (_) { /* ignore */ }
      }
      window.addEventListener('cmx-portal-theme-change', this._onPortalThemeChange)
    }

    /* 界面语言变更：列头 caption 可能是多语言对象，重建列以按新语言重新解析。
       语言 API 由共享运行时暴露（不能直接 import UI5 dist，会被 shim 置空）。 */
    this._onLanguageChange = () => {
      if (this._boundModel) this._applyColumnModel(this._boundModel)
    }
    const rt = globalThis.__cmxUi5
    if (rt && typeof rt.attachLanguageChange === 'function') {
      rt.attachLanguageChange(this._onLanguageChange)
    }
  }

  /**
   * 元素从文档移除时：断开 ResizeObserver，释放 revo 引用。
   */
  disconnectedCallback() {
    this._stopHostResizeObserver()
    this._unbindDsListeners()
    if (this._onPortalThemeChange) {
      window.removeEventListener('cmx-portal-theme-change', this._onPortalThemeChange)
      this._onPortalThemeChange = null
    }
    if (this._onLanguageChange) {
      const rt = globalThis.__cmxUi5
      if (rt && typeof rt.detachLanguageChange === 'function') rt.detachLanguageChange(this._onLanguageChange)
      this._onLanguageChange = null
    }
    if (this._revo) {
      if (this._onAfterEditBound)  this._revo.removeEventListener('afteredit',  this._onAfterEditBound)
      if (this._onAfterFocusBound) this._revo.removeEventListener('afterfocus', this._onAfterFocusBound)
      if (this._onBeforeEditBound) this._revo.removeEventListener('beforeedit', this._onBeforeEditBound)
      if (this._onCloseEditBound)  this._revo.removeEventListener('closeedit',  this._onCloseEditBound)
      if (this._onAfterColumnResizeBound) this._revo.removeEventListener('aftercolumnresize', this._onAfterColumnResizeBound)
    }
    if (this._host && this._onHostPointerDownBound) {
      this._host.removeEventListener('pointerdown', this._onHostPointerDownBound, true)
      this._onHostPointerDownBound = null
    }
    if (this._host && this._onHostPointerDownForSelection) {
      this._host.removeEventListener('pointerdown', this._onHostPointerDownForSelection, true)
      this._onHostPointerDownForSelection = null
    }
    this._unbindHeaderRenderListener()
    this._unbindCellTooltip()
    this._unbindTextSelect()
    this._unbindRealtimeResize()
    this._revo = null
  }

  /**
   * 注入页面级或内置皮肤 CSS（作用于 Shadow DOM 内 revo-grid）。
   * @param {string} cssText
   * @param {'neo'|'page'|'custom'} [layer]
   */
  setSkinStyles (cssText, layer = 'custom') {
    setSkinStyle(this.shadowRoot, 'cmx-grid', cssText, layer)
    return this
  }

  /**
   * 根据 data-cmx-skin / data-cmx-skin-tone 等属性应用皮肤：
   *   - 嵌入模式（data-cmx-embed）且未显式指定 skin 时跳过，避免给弹层 grid 强套 Neo；
   *   - 已注入 data-neo-grid-tone / data-neo-grid-lane 的页面自行接管，跳过全局默认；
   *   - 'flat'（或 data-cmx-borderless / data-cmx-flat）→ 无边框扁平样式；
   *   - 'neo' → 注入 Neo 皮肤 CSS 并按 tone 加强调色类；
   *   - 其余值（plain/default/none）→ 不注入皮肤，沿用 revo-grid 原生外观。
   */
  _applySkin () {
    if (this.hasAttribute('data-cmx-embed') && !this.hasAttribute('data-cmx-skin')) return
    if (this.hasAttribute('data-neo-grid-tone') || this.hasAttribute('data-neo-grid-lane')) return
    const raw = this.getAttribute('data-cmx-skin')
    const fallback = (typeof globalThis.__cmxDefaultGridSkin === 'string' && globalThis.__cmxDefaultGridSkin.trim())
        ? globalThis.__cmxDefaultGridSkin.trim().toLowerCase()
        : 'neo'
    const skin = (raw != null && raw !== '') ? raw.trim().toLowerCase() : fallback
    if (skin === 'flat' || this.hasAttribute('data-cmx-borderless') || this.hasAttribute('data-cmx-flat')) {
      this.classList.add('cmx-grid-flat')
      this.setSkinStyles(':host(.cmx-grid-flat) .host-wrap,.host-wrap{border:0!important;border-radius:0!important;box-shadow:none!important;background:var(--sapList_Background,#fff);} :host(.cmx-grid-flat),:host([data-cmx-borderless]),:host([data-cmx-flat]){border:0!important;border-radius:0!important;box-shadow:none!important;overflow:hidden!important;} revo-grid{border:0!important;border-radius:0!important;box-shadow:none!important;}', 'page')
      this._applyPageStyleId()
      return
    }
    if (skin !== 'neo') return
    this.classList.remove(...GRID_NEO_TONE_CLASSES)
    applyNeoSkin({
      host: this,
      shadow: this.shadowRoot,
      idBase: 'cmx-grid',
      neoCss: CMX_GRID_NEO_SKIN_CSS,
      globalKey: '__cmxDefaultGridSkin',
      activeClass: 'cmx-grid-neo',
      toneClass: (tone) => (tone && tone !== 'default' && tone !== 'cyan' ? `cmx-grid-neo--${tone}` : null),
    })
    this._applyPageStyleId()
    this._applyAltRowClass()
  }

  /**
   * 覆盖 revo-grid 自带的"禁用编辑"单元格灰色背景。
   *
   * revo-grid 在 .rgCell.disabled 上用 var(--revo-grid-cell-disabled-bg)
   * 作为背景色（默认 rgba(0,0,0,0.07)，暗色主题 rgba(255,255,255,0.07)）。
   * cmx-data-comp 没自定义该样式。
   *
   * revo-grid 使用 Shadow DOM，CSS 变量无法从外部穿透，因此直接在
   * revo-grid 的 shadowRoot 中注入 <style> 覆盖 .rgCell.disabled 背景色。
   * 若 revo-grid 的 shadowRoot 尚未创建（Stencil 异步初始化），下一帧重试；
   * 若 revo-grid 不使用 Shadow DOM（降级），则在 cmx-revo-grid 的 ShadowRoot 中覆盖。
   * 与 _applySkin 无关：所有 grid（neo/flat/plain/embed）都生效。
   */
  _applyDisabledCellOverride () {
    const CSS = '.rgCell.disabled{background-color:transparent!important}'
    const STYLE_ID = 'cmx-disabled-cell-override'
    const inject = (root) => {
      if (!root) return false
      if (root.getElementById(STYLE_ID)) return true
      const s = document.createElement('style')
      s.id = STYLE_ID
      s.textContent = CSS
      root.appendChild(s)
      return true
    }
    const tryRevoShadow = () => {
      const sr = this._revo && this._revo.shadowRoot
      return sr ? inject(sr) : false
    }
    if (!tryRevoShadow()) {
      // revo-grid 的 shadowRoot 可能还没创建，下一帧重试
      requestAnimationFrame(() => {
        if (!tryRevoShadow()) {
          // 后备：revo-grid 不用 Shadow DOM 时，在 cmx-revo-grid 的 ShadowRoot 中覆盖
          inject(this.shadowRoot)
        }
      })
    }
  }

  /**
   * 读取 data-cmx-style-id 指向的 <template> 或 <style> 节点，将其内容作为页面级皮肤 CSS 注入。
   * 查找范围：先在宿主所在的根节点（含 ShadowRoot）找，再降级到 document。
   */
  _applyPageStyleId () {
    applyPageStyleId(this, this.shadowRoot, 'cmx-grid')
  }

  /**
   * 根据 _opts.alternateRowColor 在宿主上增删 .cmx-grid-alt-rows class。
   * Neo 皮肤下 cmx-grid-neo-skin.js 内"偶数行背景"规则的 selector
   * (:host(.cmx-grid-neo.cmx-grid-alt-rows) ...) 在 class 存在时才命中，
   * 因此切 class 即可即时启用/关闭隔行换色，无需重新注入 CSS。
   * 兼容：未连接（connectedCallback 之前）直接返回，避免空操作抛错。
   */
  _applyAltRowClass () {
    if (!this.classList) return
    if (this._opts.alternateRowColor) this.classList.add('cmx-grid-alt-rows')
    else this.classList.remove('cmx-grid-alt-rows')
  }

  // ─── 公开 API（供业务与 CmxMasterSlave 调用）────────────────────────────

  /**
   * 通过 CmxColumnModel 一次性设置列结构、分组表头与合计配置。
   * 同时订阅模型的 `columns-changed`：当 FlexibleCombination 等动态列驱动者
   * 改变模型成员时，自动重新同步并派发 `cmx-columns-changed`，
   * 让页面（如 voucher/trade 的 tuneGrid + setTotals）有钩子可挂。
   * @param {import('../lib/cmx-column-model.js').CmxColumnModel} model
   */
  setColumnModel(model) {
    if (!model) return

    // 解绑上一个模型的监听
    if (this._boundModel && this._boundModelListener && typeof this._boundModel.removeEventListener === 'function') {
      this._boundModel.removeEventListener('columns-changed', this._boundModelListener)
    }
    this._boundModel = model
    this._applyColumnModel(model)

    if (typeof model.addEventListener === 'function') {
      this._boundModelListener = () => {
        this._applyColumnModel(model)
      }
      model.addEventListener('columns-changed', this._boundModelListener)
    }
    // 自动触发字典回显：列有 refDict 时，从 editSettings.coord 提取坐标预加载字典缓存，
    // 避免每个页面都需手动调 enableDictEcho。不阻断渲染（异步，失败静默降级）。
    //fixme 0727 有性能问题，注释掉自动回显
    // this._autoEnableDictEcho()
  }

  /**
   * 从列模型收集 refDict 列的 editSettings.coord，自动预加载字典缓存并挂 resolver。
   * 仅在列有 refDict 且 editSettings.coord 有坐标时触发；已手动调过 enableDictEcho 的不重复。
   */
  _autoEnableDictEcho () {
    const model = this._boundModel
    if (!model || !Array.isArray(model.members)) return
    const hasRefDict = model.members.some((m) => m && m.refDict)
    if (!hasRefDict) return
    // 从第一个有 editSettings.coord 的列取坐标
    let coord = null
    let dbId = ''
    for (const col of model.members) {
      if (col && col.refDict && col.editSettings && col.editSettings.coord) {
        const c = col.editSettings.coord
        if (c.domain && c.module) { coord = c; dbId = c.dbId || ''; break }
      }
    }
    if (!coord) return
    // 异步触发，不阻塞 setColumnModel 返回
    Promise.resolve().then(() => this.enableDictEcho({ coord, dbId }))
      .catch((e) => { console.warn('[cmx-revo-grid] enableDictEcho failed:', e && e.message || e) })
  }

  /**
   * 注入字典缓存并触发外键回显。
   *
   * 扫描当前列模型的 refDict，逐典预加载全量条目（POST /api/dct/data/search），
   * 完成后给每列的 display 挂上 resolver（id→名称），再 refresh 重绘单元格。
   * 未预加载/未命中时 resolver 优雅降级返回原 id，不阻断渲染。
   *
   * @param {object} [ctx] { coord?:object, dbId?:string } 坐标与库标识
   * @param {object} [host] 带 fetch 的页面 host（缺省用全局 fetch）
   * @returns {Promise<void>}
   */
  async enableDictEcho (ctx = {}, host) {
    const model = this._boundModel
    if (!model) return
    const members = model.members || model.toDescriptors?.() || []
    const fields = Array.isArray(members) ? members : []
    const specs = collectRefDicts(fields)
    if (!specs.length) return
    if (!this._dictCache) this._dictCache = new CmxDictCache({ coord: ctx.coord || null })
    try {
      await this._dictCache.loadDicts(host, specs, { dbId: ctx.dbId })
    } catch (e) { /* 预加载异常：保持原 id 显示，不阻断渲染 */ console.warn('[cmx-revo-grid] dict echo preload failed:', e && e.message || e) }
    // 失败典提示：CmxDictCache 失败不写缓存，loadDicts 后 has() 仍为 false 的典 = 本次装载失败，
    // 相关列将显示原始 id——toast 一条汇总（同文案自动去重），不再完全静默。
    const failedDicts = specs.filter((s) => !this._dictCache.has(s.dictId))
    if (failedDicts.length) {
      showCmxToast(`字典 ${failedDicts.map((s) => s.dictId).join('、')} 装载失败，相关列暂按编码显示`,
        { level: 'warning', title: '字典回显' })
    }
    // 给每列挂 resolver：对所有有 refDict 的列。
    // dict-select 编辑列也挂——其 cellTemplate（formatDictCellValue）在展开字段缺失时
    // （后端首次加载的行无展开字段）会降级到 resolve 查 CmxDictCache，实现 id→name 回显。
    let touched = false
    for (const col of model.members || []) {
      const dictId = col.refDict
      if (!dictId) continue
      const field = col.displayField || this._dictCache._labelField
      const display = col.display || (col.display = {})
      if (typeof display.resolve !== 'function') {
        display.resolve = makeDictResolver(this._dictCache, dictId, field)
        touched = true
      }
    }
    if (touched) {
      this._applyColumnModel(model)
      if (this._revo && typeof this._revo.refresh === 'function') {
        try { this._revo.refresh('all') } catch (_) { /* ignore */ }
      }
    }
  }

  /** 把模型同步到内部列结构 + 派发 `cmx-columns-changed`。 */
  _applyColumnModel(model) {
    const { columns, totals } = CmxColumnAdapter.toRevoGrid(model)
    // 把 _cmxCol.edit.readonlyWhen 翻译为 revo-grid 的 readonly 函数：
    // revo-grid 在 canEdit() 阶段调 readonly(data)，返回 true 就直接跳过编辑、不开编辑器。
    // 只把 cmx 侧未硬编为 readonly 的列重写为函数（已 readonly=true 的列不覆盖）。
    for (const c of columns) {
      this._patchReadonlyFn(c)
    }
    this._revoColumns = columns
    // 列定义整体替换：用户之前的手动列宽调整失效（旧 prop 可能已不存在）
    if (this._userColSizes) this._userColSizes.clear()

    this._columns = CmxColumnAdapter._flatDescriptors(model.toDescriptors())
        .map((d) => CmxColumnAdapter._descriptorToColumnDef(d))
    this._headerGroups = CmxColumnAdapter._cmxTableHeaderGroups(model)

    if (totals) this._opts = { ...this._opts, totals }

    if (this._revo) {
      this._syncToRevo()
      this._scheduleStretchRefresh()
    }
    this.dispatchEvent(new CustomEvent('cmx-columns-changed', {
      bubbles: true, composed: true,
      detail: { model, columns: this._revoColumns },
    }))
  }

  /**
   * 递归把 _cmxCol.edit.readonlyWhen 翻译为 revo-grid 列的 readonly 函数。
   * 仅在列当前非 readonly 且存在表达式时改写；列原本 readonly=true（业务锁）保持不变。
   * 函数闭包捕获表达式串；revo-grid 调用时传入 row model（应支持数组形态 rowDataModel 返回值）。
   */
  _patchReadonlyFn(col) {
    if (!col) return
    if (Array.isArray(col.children)) {
      for (const c of col.children) this._patchReadonlyFn(c)
      return
    }
    /* revo-grid 4.x 的 column.service.isReadOnly(r, c) 在 canEdit 阶段用
       rowDataModel(r, c) 调 readonly(data)——传入的是 { prop, model, data, column,
       rowIndex, colIndex, colType, type, value }，真正的行数据在 data.model。
       直接展开 data object 会让 scope.id 等业务字段全部丢失，公式一律按"未匹配"处理，
       把所有行都误判为只读。识别 .model 存在时取它，否则按"直接传 row"路径兼容。
       旧实现"click 模式"能绕开是因为 _maybeEditOnFocus 走 setCellEdit→setEditByCell
       不经 canEdit；dblclick 模式必经 canEdit，所以新增行的编码列打不开编辑器。 */
    if (col.readonly === true) return
    const cmxCol = col._cmxCol
    const rw = cmxCol?.edit?.readonlyWhen ?? cmxCol?.readonlyWhen
    if (typeof rw !== 'string' || !rw.trim()) return
    const prop = col.prop
    col.readonly = (data) => {
      const outer = (data && typeof data === 'object') ? data : {}
      const row = (outer.model && typeof outer.model === 'object') ? outer.model : outer
      try {
        return !!evalFormula(rw, { ...row, value: row[prop], __col: prop }, false)
      } catch (_) {
        return false
      }
    }
  }

  /**
   * 增量合并运行时选项（行高、选择模式、只读、主题等）。
   * @param {Partial<typeof DEFAULT_OPTIONS>} opts
   */
  setOptions(opts) {
    this._opts = { ...this._opts, ...(opts || {}) }
    if (this.shadowRoot) {
      this._applySize()
      this._syncToRevo()
      // alternateRowColor 改变时同步宿主 class，使 cmx-grid-neo-skin.js
      // 内的偶数行背景规则即时失效/生效。class 切换是纯 DOM 增量，无须 refresh。
      this._applyAltRowClass()
      // allowTextSelect 改变时同步 _revo class（_css() 据此开 user-select:text）
      this._applyAllowTextSelect()
    }
  }

  /**
   * 设置整表是否允许进入编辑状态（总开关）。
   * 默认不可编辑；设为 true 后才允许点击单元格进入编辑（仍受列自身 editMode 等约束）。
   * @param {boolean} flag
   */
  setEditable(flag) {
    this._opts = { ...this._opts, editable: !!flag }
    if (this._revo) this._setRevoProp('readonly', this._resolveReadonly())
    return this
  }

  /** @returns {boolean} 当前是否允许编辑。 */
  isEditable() {
    return !this._resolveReadonly()
  }

  /**
   * 强制提交当前正在编辑的单元格（保存值并结束编辑）。
   *
   * 用于"保存前收拢编辑"场景：用户编辑了某格但焦点未失，直接保存会让该格值
   * 滞留在编辑器内部（未触发 afteredit 写回 DataSet）而丢失。
   *
   * 实现说明：revo-grid 默认未开 applyOnClose，编辑器 blur 只会派发
   * closeedit/canceledit（取消语义，丢值）而非 afteredit（提交语义）。
   * 故此处通过向编辑器派发合成 Enter 键事件，复用 revo-grid 原生 save 链路
   *（TextEditor.onKeyDown Enter → saveCallback → onSave → celleditinit
   *  → afteredit → _onAfterEdit 写回 DataSet）。
   * cmx 输入组件的 commitPending（pending 文本归一）在其内部 Enter 处理中完成。
   *
   * @returns {Promise<void>} 编辑值写回 DataSet 后 resolve；无编辑时立即 resolve。
   */
  async commitEdit () {
    if (!this._revo || !this.hasAttribute('data-cmx-editing')) return
    // 定位当前编辑器宿主 → cmx 编辑器槽位 → 实际编辑器组件 / 原生 input
    const editHost = this._revo.querySelector('revogr-edit')
    if (!editHost) return
    const editorEl = editHost.querySelector('[class$="-editor-slot"] > *')
                || editHost.querySelector('.edit-input-wrapper > *')
                || editHost.querySelector('input')
    if (!editorEl) return
    // 合成 Enter 键事件走 revo-grid 原生 save 链路（Enter→saveCallback→afteredit→写回）
    try {
      editorEl.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
        bubbles: true, cancelable: true,
      }))
    } catch (_) { /* 老环境 KeyboardEvent 不支持 keyCode 初始化，忽略 */ }
    // 等 afteredit 同步写回完成（_onAfterEdit 内 model.set 同步执行）
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  }

  /**
   * 计算最终传给 revo-grid 的 readonly：
   * editable 显式为 true → 可编辑；显式为 false → 只读；
   * 未显式设置 editable 时回退到 !readonly（兼容旧用法），默认只读。
   * @returns {boolean}
   */
  _resolveReadonly() {
    if (typeof this._opts.editable === 'boolean') return !this._opts.editable
    return !!this._opts.readonly
  }

  /**
   * 公开方法：强制刷新内层 revo-grid 的尺寸 / 拉伸 / 视口测量。
   * 用于"宿主从隐藏 / 0 宽变为可见"的场景：popover 打开、tab 切回等。
   *
   * stretch 模式下不使用 RevoGrid 内置 StretchColumn（它会把剩余宽度给末列），而是
   * 基于列原始 width/size 的比例重新生成一份 columns，让所有列按权重一起铺满可用宽度。
   */
  refreshLayout () {
    if (!this._revo) return
    if (!this._isLayoutVisible()) return
    if (this._opts.stretch && Array.isArray(this._revoColumns) && this._revoColumns.length > 0) {
      const columns = this._columnsForViewport()
      this._setRevoProp('columns', columns, this._columnsSignature(columns))
    }
    if (typeof this._revo.refresh === 'function') {
      try { this._revo.refresh('all') } catch (_) { /* refresh 在某些状态下不可用，忽略 */ }
    }
  }

  /**
   * 替换全部数据行，并可选恢复选中状态。
   * @param {object[]} rows  每行需有唯一 id
   * @param {object} [sel]
   * @param {string|null} [sel.selectedId]
   * @param {string[]} [sel.selectedIds]
   * @param {boolean} [sel.preserveScroll]  false 时滚动回顶部
   */
  /** 纯数组模式入口（内部用）。外部统一使用 setDataSet。 */
  _setData(rows, sel = {}) {
    // 普通数组模式，断开与 CmxDataSet 的关联
    this._ds = null
    this._rows = Array.isArray(rows) ? rows : []

    if ('selectedId' in sel) this._selectedId = sel.selectedId ?? null
    if ('selectedIds' in sel) this._selectedIds = new Set(sel.selectedIds || [])

    // 去掉已不存在行上的选中残留
    this._pruneSelection()

    if (this._revo) {
      this._assignSource(this._displaySource())
      if (!sel.preserveScroll) this._revo.scrollTo?.({ top: 0 })
      this._renderTotals()
      // 数据量变化会影响主区垂直滚动条的有无，进而改变主区实际可用宽度——
      // 排一次 stretch refresh，让 _columnsForViewport 用更新后的 mainVp.clientWidth 重算。
      this._scheduleStretchRefresh()
    }
  }

  /**
   * 绑定 CmxDataSet 或回退为 setData。
   * DataSet 模式下增删行会走 ds API，_rows 与 ds.rows 共享引用。
   * @param {import('../lib/cmx-data-set.js').CmxDataSet|object[]} dsOrRows
   * @param {object} [sel]  同 setData
   */
  setDataSet(dsOrRows, sel = {}) {
    const isDs = dsOrRows && typeof dsOrRows === 'object'
        && Array.isArray(dsOrRows.rows) && typeof dsOrRows.addRow === 'function'

    if (isDs) {
      const prevDs = this._ds
      if (prevDs && prevDs !== dsOrRows) this._unbindDsListeners()
      this._ds = dsOrRows
      this._rows = dsOrRows.rows

      if ('selectedId' in sel)  this._selectedId  = sel.selectedId ?? null
      if ('selectedIds' in sel) this._selectedIds = new Set(sel.selectedIds || [])
      // ds 切换时清空选中，但不覆盖调用方显式传入的 selectedIds
      if (prevDs !== dsOrRows && !('selectedIds' in sel)) this._selectedIds = new Set()
      this._pruneSelection()

      if (this._revo) {
        if (prevDs === dsOrRows) {
          this._syncSelection()
        } else {
          this._assignSource(this._displaySource())
          this._renderTotals()
          // 数据切换后主区垂直滚动条可能出现/消失，重算 stretch 避免横向溢出。
          this._scheduleStretchRefresh()
        }
      }

      // 注册新 ds 的游标监听（ds 切换时或首次注册）
      if (prevDs !== dsOrRows) {
        this._cursorListener = (e) => {
          const row = e.detail.row
          this._selectedId = row?.id ?? null
          // 单选模式下同步 _selectedIds；多选模式下保持 _selectedIds 不变（由用户 toggle 控制）。
          // 统一存 String(id) 与内部 Set<string> 契约一致（multi 路径均 String 化存储）。
          if (this._opts.selectionMode !== 'multi') {
            this._selectedIds = row ? new Set([String(row.id)]) : new Set()
          }
          if (this._revo) this._syncSelection()
          if (row && this._opts.selectionMode !== 'none') {
            this.dispatchEvent(new CustomEvent('cmx-row-selected', {
              bubbles: true, composed: true, detail: { id: row.id },
            }))
          }
        }
        dsOrRows.addEventListener('cursor-changed', this._cursorListener)

        this._dsRowAddedListener = () => this._refreshSource()
        this._dsRowRemovedListener = () => this._refreshSource()
        dsOrRows.addEventListener('ds-row-added', this._dsRowAddedListener)
        dsOrRows.addEventListener('ds-row-removed', this._dsRowRemovedListener)

        /* 行内字段值变化（如另一视图 form 编辑同一行、或 calcFormula/聚合回写）：
           重绘数据让单元格显示最新值。CmxDataSet 数据是所有绑定视图的单一真相源。
           本表格自身编辑写回（afteredit → model.set）期间跳过：revo-grid 已内部更新，
           且此时重推 source 会打断正在进行的编辑（data-cmx-editing 标记编辑期）。 */
        this._dsRowChangedListener = () => {
          if (this.hasAttribute('data-cmx-editing')) return
          this._refreshSource()
        }
        dsOrRows.addEventListener('row-changed', this._dsRowChangedListener)

        // 若 ds 已有游标，立即同步
        if (dsOrRows.hasCursor && dsOrRows.currentRow) {
          this._selectedId = dsOrRows.currentRow.id
        }
      }
    } else {
      this._unbindDsListeners()
      this._setData(dsOrRows, sel)
    }
  }

  /** 同步选中高亮到 revo-grid：把每行的 rowClass 重写到行数据上，再触发 revo-grid 重新计算类。
   *  必须用 refresh('all') 而不是 refresh('data')：RevoGrid 在 updateSource/diff 路径里只
   *  读新增/变化行的 rowClass 字段，已渲染行的 class 不会被重读，结果就是清不掉"上一轮"的类，
   *  视觉上多选集合从 [A,B,C] → [D] 之后还残留 A/B/C 的高亮。'all' 强制走完整 row render，
   *  会把每行 class 字段重新打到 .rgRow 上。 */
  _syncSelection() {
    if (!this._revo) return
    /* 选中集合：
       - multi 模式：以 _selectedIds 为准（多行同色高亮，视觉上一眼看出"被勾上的几行"）
       - single 模式：以 _selectedId 为准（只高亮当前焦点行）
       rowClass 走的是同一个 CSS 类 cmx-current-row，所以两种模式下每一行的
       背景色是一致的——多选时所有被勾选行和单选时被选中行的视觉表现完全相同。 */
    const isMulti = this._opts.selectionMode === 'multi'
    const selectedSet = isMulti
        ? this._selectedIds
        : (this._selectedId != null ? new Set([String(this._selectedId)]) : new Set())
    for (const row of this._rows) {
      const cur = row.__cmxRowClass || ''
      const next = (row.id != null && selectedSet.has(String(row.id))) ? 'cmx-current-row' : ''
      if (cur !== next) row.__cmxRowClass = next
    }
    // refresh('all') 会触发每行重渲，性能上 multi 选中切换的开销 = 视口行数 × 全 row render；
    // 考虑到选中是高交互频率动作（不是大数据滚动），'all' 的成本可以接受，换来多选视觉同步的可靠性。
    try { this._revo.refresh?.('all') } catch (_) { /* ignore */ }
  }

  /**
   * 解绑 CmxDataSet 上的全部事件监听（cursor-changed / ds-row-added / ds-row-removed / row-changed）。
   * @param {import('../lib/cmx-data-set.js').CmxDataSet} [ds]  目标 ds，缺省取 this._ds
   */
  _unbindDsListeners(ds) {
    const target = ds || this._ds
    if (!target) return
    if (this._cursorListener) {
      target.removeEventListener('cursor-changed', this._cursorListener)
      this._cursorListener = null
    }
    if (this._dsRowAddedListener) {
      target.removeEventListener('ds-row-added', this._dsRowAddedListener)
      this._dsRowAddedListener = null
    }
    if (this._dsRowRemovedListener) {
      target.removeEventListener('ds-row-removed', this._dsRowRemovedListener)
      this._dsRowRemovedListener = null
    }
    if (this._dsRowChangedListener) {
      target.removeEventListener('row-changed', this._dsRowChangedListener)
      this._dsRowChangedListener = null
    }
  }

  /** DataSet 数据变化（行增删/字段改写）后重新拉取行数组、修剪选中、重推 source 与合计行。 */
  _refreshSource() {
    if (!this._revo) return
    this._rows = this._ds?.rows || this._rows
    this._pruneSelection()
    this._assignSource(this._displaySource())
    this._renderTotals()
  }

  /**
   * 追加一行；row 必须带 id。
   * @param {object} row
   * @param {object} [opts]
   * @param {boolean} [opts.scrollIntoView=true]  是否滚到新行
   * @returns {object|null} 实际写入的行对象
   */
  addRow(row, opts = {}) {
    if (!row?.id) return null

    const added = this._ds ? this._ds.addRow(row) : row
    if (!this._ds) this._rows.push(added)

    if (this._revo) {
      this._assignSource(this._displaySource())
      this._renderTotals()
      if (opts.scrollIntoView !== false) {
        queueMicrotask(() => this._scrollToRow(added.id))
      }
    }

    this.dispatchEvent(new CustomEvent('cmx-row-added', {
      bubbles: true, composed: true,
      detail: { id: added.id, row: added, index: this._rows.length - 1 },
    }))
    return added
  }

  /**
   * 按 id 列表删除行。
   * @param {string[]} ids
   * @returns {object[]} 实际被删除的行对象数组
   */
  removeRows(ids) {
    if (!Array.isArray(ids) || !ids.length) return []

    // 统一 String 化入参与 r.id 再匹配：入参可能来自 getSelectedIds()（string[]），
    // r.id 可能是整数主键（number），不 String 化则 Set.has 跨类型恒 false → 找不到行。
    const set = new Set(ids.map((x) => String(x)))
    const removed = this._rows.filter((r) => set.has(String(r.id)))
    if (!removed.length) return []

    if (this._ds) {
      // DataSet 模式：必须用行原始 r.id 调 ds.removeRow（与 ds._index 的 key 同类型）。
      // 不能用入参 ids——getSelectedIds() 返回 string[]，而 r.id 为整数主键(number)时
      // ds._index 的 key 是 number，Map.get 跨类型恒 undefined → 删不掉（"有数据行删不掉"根因）。
      for (const r of removed) this._ds.removeRow(r.id)
    } else {
      this._rows = this._rows.filter((r) => !set.has(String(r.id)))
    }

    for (const r of removed) {
      this._selectedIds.delete(String(r.id))
      if (this._selectedId != null && String(this._selectedId) === String(r.id)) this._selectedId = null
    }

    if (this._revo) {
      this._assignSource(this._displaySource())
      this._renderTotals()
    }

    this.dispatchEvent(new CustomEvent('cmx-row-removed', {
      bubbles: true, composed: true,
      detail: { ids: removed.map((r) => r.id), rows: removed },
    }))
    return removed
  }

  /**
   * 返回当前多选集合中的 id 列表（按 _rows 顺序）。
   * @returns {string[]}
   */
  getSelectedIds() {
    // _selectedIds 内部统一存 String(id)（见 _computeMultiSelection/_selectRange/_pruneSelection）。
    // 过滤与输出都 String 化 r.id：
    //   1) filter 必须 String 化，否则整数主键场景 Set<string>.has(number) 恒 false → 返回空
    //      （视觉高亮正常因为 _syncSelection 用了 String，造成"看着选中了接口却说没选中"的错觉）
    //   2) map 也 String 化，与 JSDoc 声明 @returns {string[]}、内部 Set 存储类型、
    //      cmx-row-selection-change 事件 detail.ids 类型保持一致，让外部消费者可无脑按字符串处理
    return this._rows.filter((r) => this._selectedIds.has(String(r.id))).map((r) => String(r.id))
  }

  /**
   * 返回当前数据行的浅拷贝（不含占位 filler 行的业务语义，但含 __cmxFiller 若未过滤）。
   * @returns {object[]}
   */
  getSource() {
    return this._rows.slice()
  }

  /**
   * 协调器注入：按 id 解析 DataSource（ref 列扩展用，当前列适配可消费）。
   * @param {((id: string) => any)|null} fn
   */
  _setDataSourceProvider(fn) {
    this._dsProvider = typeof fn === 'function' ? fn : null
  }

  /**
   * 协调器通知字典变更后，重新同步 revo-grid（列/源刷新入口）。
   */
  _notifyDataSourcesChanged() {
    if (this._revo) this._syncToRevo()
  }

  // ─── 声明式属性引导 ─────────────────────────────────────────────────────

  /**
   * 解析宿主上的 data-cmx-* JSON 属性，等价于依次调用各 setter。
   * 供静态 HTML 与设计器导出页面使用。
   */
  _bootstrapFromAttributes() {
    const opts = parseJsonAttr(this, 'data-cmx-options')
    const rows = parseJsonAttr(this, 'data-cmx-rows')

    if (opts) this.setOptions(opts)
    if (rows) this._setData(rows)
    // 布尔属性快捷开关：与 data-cmx-options={'{fillHeight:true}'} 等价，但更直观。
    // 用于 grid 嵌在 flex 容器里需要填满父高度的场景（凭证页 4 个 grid 都要）。
    if (this.hasAttribute('data-cmx-fill-height')) {
      this.setOptions({ fillHeight: true })
    }
    // 列定义只能来自 CmxColumnModel（init-page-models 按 data-cmx-model-id 调 setColumnModel）。
  }

  // ─── RevoGrid 列与数据同步 ───────────────────────────────────────────────

  /** 判断 grid 是否真正可见（已连接、有尺寸、在视口内），用于跳过隐藏容器的无效 refresh。 */
  _isLayoutVisible() {
    if (!this.isConnected || !this._host) return false
    if (this._host.clientWidth <= 1 || this._host.clientHeight <= 1) return false
    return this.getClientRects().length > 0 && this._host.getClientRects().length > 0
  }

  // 列宽 stretch 计算（_columnsForViewport / _dataColumnViewportWidth / _baseColumnSize / _scaleColumnSizes）
  // 已抽到 ./revo-grid/revo-grid-stretch-mixin.js，经 Object.assign 挂到原型。

  /**
   * 按开关给必填叶子列挂 columnTemplate（红色 * + 标题）。
   *
   * revo-grid 列头 renderer 读 data.columnTemplate(createElement, columnData) 返回 VNode；
   * HTML 字符串会被 stencil 转义，必须用 h() 构造 VNode（参考 cellTemplate 的 h('span', {...}, [...}) 写法）。
   * 必填判定读 col._cmxCol.required（由 cmx-column-adapter._leafDescriptorToRevoCol 挂载），
   * 兼容 _cmxCol.edit.required（_leafColumnToRevoCol 会把 _cmxCol 替换成真实 CmxColumn 引用）。
   *
   * 递归处理多级表头（children）；已有 columnTemplate 的列不覆盖（保留自定义列头）。
   * 默认 showRequiredMark=false 时直接返回原数组（零开销，只读页不受影响）。
   */
  _applyRequiredMarks(cols) {
    if (!this._opts.showRequiredMark || !Array.isArray(cols)) return cols
    const walk = (list) => {
      for (const col of list) {
        if (!col) continue
        if (Array.isArray(col.children) && col.children.length) {
          walk(col.children)
          continue
        }
        const cmxCol = col._cmxCol
        const required = cmxCol && (cmxCol.required === true
            || (cmxCol.edit && cmxCol.edit.required === true))
        // 非必填 或 已有自定义列头模板 → 不覆盖
        if (!required || col.columnTemplate) continue
        const title = col.name || col.prop
        // 【关键】直接修改原对象而非创建新对象。
        // 原因：Stencil 框架在 lazy load 模式下对 prop watcher 第一次触发时，
        // 内部存在一个会丢失新建对象 columnTemplate 的时机（具体见 revo-grid entry
        // 的 columnChanged 链路：第一次 componentWillLoad 后的 watcher 与我们随后
        // 的 _setRevoProp 之间的初始化竞态）。直接修改原对象可绕开该问题——StenciL
        // 只会修改 watcher 收到的引用本身，原始 column 对象的 columnTemplate 属性
        // 仍能保留。
        col.columnTemplate = (h) => [
          h('span', {
            class: 'cmx-req-mark',
            style: {
              color: 'var(--sapNegativeColor,#bb0000)',
              fontWeight: '700',
              marginRight: '3px',
            },
          }, '*'),
          h('span', {}, title),
        ]
      }
      return list
    }
    return walk(cols)
  }

  /**
   * 将 opts.theme 的 'auto' 解析为实际主题名。
   * 'auto' 时检测文档暗色模式；其余值直接透传。
   */
  _resolveTheme() {
    const t = this._opts.theme
    if (!t || t === 'auto') return detectDarkMode() ? 'darkMaterial' : 'material'
    return t
  }

  /**
   * 构造传给 revo-grid.source 的行数组：真实数据 + minRows 占位行。
   * 占位行带 __cmxFiller，编辑与聚焦逻辑会忽略。
   *
   * 缓存策略：结果只依赖 _rows 引用 / _rows.length / minRows 三者，与行内字段值无关。
   * 三者不变时直接复用上一次的数组实例——这反而更符合 revo-grid 期望（同引用不会
   * 触发 updateSource/diff 重走，避免编辑期重渲抖动）。_rows 引用替换或长度变化时重建。
   * @returns {object[]}
   */
  _displaySource() {
    const minR = this._opts.minRows ?? 0
    const rows = this._rows || EMPTY_ROWS
    const len = rows.length
    // 命中缓存：rows 引用、长度、minRows 均未变 → 直接复用
    if (this._displaySourceBaseRows === rows
        && this._displaySourceLen === len
        && this._displaySourceMinR === minR
        && this._displaySourceCache) {
      return this._displaySourceCache
    }
    const pad = Math.max(0, minR - len)
    let result
    if (pad > 0) {
      const fillers = Array.from({ length: pad }, (_, i) => ({
        id: `__cmx_fill_${i}`,
        __cmxFiller: true,
      }))
      result = [...rows, ...fillers]
    } else {
      // pad===0：无占位行。用浅拷贝而非 this._rows 本身，避免 revo-grid 可能的
      // 数组结构修改（splice/sort）回写污染业务数据；缓存命中时仍复用同一拷贝实例。
      result = rows.slice()
    }
    this._displaySourceCache = result
    this._displaySourceBaseRows = rows
    this._displaySourceLen = len
    this._displaySourceMinR = minR
    return result
  }

  /**
   * 滚动到指定 id 所在行（若 revo-grid 支持 scrollToRow API）。
   * @param {string} id
   */
  async _scrollToRow(id) {
    const idx = this._rows.findIndex((r) => r.id === id)
    if (idx < 0) return
    await this._revo?.scrollToRow?.(idx)
  }

  // ─── 布局与尺寸 ──────────────────────────────────────────────────────────

  /**
   * 根据 fillHeight / viewHeight 设置外层 host-wrap 高度与 flex 行为。
   */
  _applySize() {
    const wrap = this.shadowRoot?.querySelector('.host-wrap')
    if (!wrap || !this._host) return

    if (this._opts.fillHeight) {
      this.setAttribute('data-fill-height', '')
      this.style.display = 'flex'
      this.style.flexDirection = 'column'
      this.style.minHeight = '0'
      wrap.style.height = ''
      wrap.style.flex = '1 1 0%'
      wrap.style.minHeight = '0'
      this._syncHostResizeObserver()
    } else {
      this.removeAttribute('data-fill-height')
      this._syncHostResizeObserver()
      this.style.display = 'block'
      this.style.flexDirection = ''
      this.style.minHeight = ''
      wrap.style.flex = ''
      wrap.style.minHeight = ''
      wrap.style.height = `${this._opts.viewHeight}px`
    }
  }

  /**
   * host 尺寸监听：fillHeight / stretch 任一开启时安装，width 或 height 变化都在下一帧
   * refreshLayout 重算。合并原 fillHeight 与 stretch 两套监听——两者都 observe(_host)，同开
   * 时切换页面恢复会各自触发一次 refresh('all') 造成双倍重绘；统一后只触发一次。两者都关
   * 闭时断开。尺寸未变（editor 进入单元格、popover 短暂占位等）跳过，避免无谓闪烁。
   */
  _syncHostResizeObserver() {
    if (!this._opts.fillHeight && !this._opts.stretch) {
      this._stopHostResizeObserver()
      return
    }
    if (this._hostResizeRo || typeof ResizeObserver === 'undefined' || !this._host) return

    let lastW = -1
    let lastH = -1
    let pending = false
    this._hostResizeRo = new ResizeObserver((entries) => {
      const r = entries?.[0]?.contentRect || this._host?.getBoundingClientRect?.()
      if (!r) return
      const w = Math.round(r.width)
      const h = Math.round(r.height)
      if (w === lastW && h === lastH) return
      lastW = w; lastH = h
      if (w <= 1 || h <= 1) return
      if (pending) return
      pending = true
      nextFrame(() => {
        pending = false
        this.refreshLayout()
      })
    })
    this._hostResizeRo.observe(this._host)
  }

  /** stretch 列模型/数据变化后，排一次 refreshLayout 重算列宽（用 _stretchRefreshPending 去重）。
   *  双 rAF：第一帧让 revo-grid 渲染新数据（垂直滚动条出现/消失，影响可用宽度估算），
   *  第二帧再按稳定的尺寸重算 stretch，避免滚动条占用未定时就铺满导致溢出。 */
  _scheduleStretchRefresh() {
    if (!this._opts.stretch || this._stretchRefreshPending) return
    this._stretchRefreshPending = true
    nextFrame(() => nextFrame(() => {
      this._stretchRefreshPending = false
      this.refreshLayout()
    }))
  }

  /** 断开并释放 host 尺寸 ResizeObserver。 */
  _stopHostResizeObserver() {
    if (this._hostResizeRo) {
      this._hostResizeRo.disconnect()
      this._hostResizeRo = null
    }
  }

  /**
   * Shadow 内组件样式：SAP 变量兼容、合计条、单元格对齐类。
   * @returns {string}
   */
  _css() {
    return `
      :host {
        display: block;
      }
      :host([data-fill-height]) {
        display: flex;
        flex-direction: column;
        min-height: 0;
      }
      .host-wrap {
        display: flex;
        flex-direction: column;
        min-height: 0;
        border: 1px solid var(--sapList_BorderColor, #d9d9d9);
        background: var(--sapList_Background, #fff);
      }
      :host([data-cmx-skin="flat"]) .host-wrap,
      :host([data-cmx-borderless]) .host-wrap,
      :host([data-cmx-flat]) .host-wrap {
        border: 0 !important;
        border-radius: 0 !important;
        box-shadow: none !important;
      }
      :host([data-fill-height]) .host-wrap {
        flex: 1 1 0%;
        min-height: 0;
      }
      #host {
        flex: 1 1 0%;
        min-height: 0;
        overflow: hidden;
        width: 100%;
        height: 100%;
      }
      .cmx-revo-inner {
        width: 100%;
        height: 100%;
        display: block;
      }
      /* 编辑期：锁住内部 revogr-viewport-scroll 的横向溢出，防止编辑器（cmx-combo-box 等）
         瞬时撑出 cell 触发横向滚动条闪现 → 整张 grid 抖动。
         revogr-viewport-scroll 默认 overflow-x: auto；编辑期间临时压成 hidden，
         编辑结束（afteredit / closeedit）解除。 */
      :host([data-cmx-editing]) revo-grid revogr-viewport-scroll {
        overflow-x: hidden !important;
      }
      /* ─── 自定义输入编辑器（cmx-*-input）撑满单元格 ─────────────────
       * revogr-edit 默认 position:absolute、运行时 inline 定位到单元格（含 height=行高）。
       * 用 block 布局让编辑器槽与 <cmx-*-input> 显式填满宽高（flex 会导致宽度不撑满/高度被
       * ui5 固有 min-height 撑溢）。 */
      revo-grid revogr-edit {
        height: 100%;
        padding: 0 !important;
        box-sizing: border-box;
        overflow: hidden;
      }
      revo-grid revogr-edit > [class*="-editor-slot"] {
        display: block !important;
        width: 100%;
        height: 100%;
        box-sizing: border-box;
      }
      /* checkbox editor：透明背景，避免编辑态大白底（<ui5-checkbox> 自身无背景，融入行背景） */
      revo-grid revogr-edit:has(.cmx-checkbox-edit) { background: transparent !important; }
      revo-grid revogr-edit cmx-text-input,
      revo-grid revogr-edit cmx-number-input,
      revo-grid revogr-edit cmx-date-input,
      revo-grid revogr-edit cmx-datetime-input {
        display: block;
        width: 100%;
        height: 100%;
        margin: 0;
        vertical-align: top;
        box-sizing: border-box;
      }
      /* ─── 布局/边框默认修复（原页面 tuneGrid 内置化）─────────────────
       * 让 revo-grid 在 flex 容器内正确收缩、内容表撑满、合计行(footer)悬浮分隔、
       * 单元格补内描边线（revo 默认只有下边线，补左边线形成网格）。 */
      revo-grid { min-height: 0 !important; }
      /* revo-grid 内置 CSS 把 --revo-grid-text / --revo-grid-foreground 硬编码为 black，
       * darkMaterial 主题也不覆盖任何颜色变量（只有 padding/line-height）。
       * 把它们重映射到 UI5 的 --sapTextColor，让暗色/高对比黑主题下字体跟随主题变浅。
       * 同时修正 header-bg / cell-border 等，保持与 UI5 视觉一致。 */
      revo-grid {
        --revo-grid-text: var(--sapTextColor, #1d2d3e);
        --revo-grid-foreground: var(--sapTextColor, #1d2d3e);
        --revo-grid-header-bg: var(--sapList_HeaderBackground, #f5f6f7);
        --revo-grid-header-color: var(--sapList_HeaderTextColor, #1d2d3e);
        --revo-grid-cell-border: var(--sapList_BorderColor, #d9d9d9);
        --revo-grid-header-border: var(--sapList_BorderColor, #d9d9d9);
      }
      revo-grid revogr-viewport-scroll .inner-content-table { height: 100% !important; }
      revo-grid .footer-wrapper {
        flex-shrink: 0 !important;
        z-index: 6;
        background: var(--sapList_Background, #fff);
        box-shadow: 0 -2px 0 var(--sapList_BorderColor, #666) !important;
      }
      revo-grid revogr-header .rgHeaderCell,
      revo-grid revogr-data .rgCell {
        box-shadow: 0 -1px 0 0 var(--revo-grid-cell-border) inset,
                    -1px 0 0 0 var(--revo-grid-cell-border) inset !important;
      }
      /* resize 拖把：revo-grid 原生 .resizable 全透明（6px），把命中宽度加到 10px，
         鼠标移到列分隔线时光标变 ew-resize（↔）提示可拖动。仅 resize=true 时存在。 */
      revo-grid .rgHeaderCell .resizable { cursor: ew-resize; width: 10px !important; }
      /* 覆盖 revo-grid 内置的 .resizable:hover { background: deepskyblue }
         （revogr-header-style.css:65）——那个亮蓝hover色块太突兀，去掉，仅靠光标提示可拖动。 */
      revo-grid .rgHeaderCell .resizable:hover { background-color: transparent !important; }
      /* 冻结列段（row order "序" 列所在的 colPinStart 视口）右侧的 1px 分割线由 revo-grid
       * 内置 CSS 通过 box-shadow 绘制在视口本身。该视口铺满整个 grid 高度（与 .rgCell 不同，
       * 它不是按行渲染的 cell），导致数据行以外的空白区域也会延伸出同一条 1px 灰线，
       * 视觉上像一条"长竖线"。
       * 表头/数据区的列分隔已由上面 .rgHeaderCell / .rgCell 的右 box-shadow 负责，
       * 视口本身的 box-shadow 是冗余的：去掉后表头/数据区仍有分割线，空白区不再出怪线。 */
      revo-grid revogr-viewport-scroll.colPinStart {
        box-shadow: none !important;
      }
      /* 右侧冻结列（frozen: 'right'，即 colPinEnd 视口）左侧也有同样的 box-shadow：
       * revo-grid 内置 CSS：
       *   revo-grid revogr-viewport-scroll.colPinEnd { box-shadow: -1px 0 0 var(--revo-grid-cell-border) }
       *   revo-grid[theme=default] revogr-viewport-scroll.colPinEnd, ... revogr-header { box-shadow: 1px 0 0 var(--revo-grid-header-border) inset }
       * 同样铺满整个 grid 高度，导致空白区域延伸出长竖线。处理方式与 colPinStart 对称。 */
      revo-grid revogr-viewport-scroll.colPinEnd,
      revo-grid[theme=default] revogr-viewport-scroll.colPinEnd,
      revo-grid[theme=default] revogr-viewport-scroll.colPinEnd revogr-header {
        box-shadow: none !important;
      }
      .cmx-revo-align-right  { text-align: right;  font-variant-numeric: tabular-nums; }
      .cmx-revo-align-center { text-align: center; }
      /* 单元格默认正文字色：revo-grid 内置 CSS 把 --revo-grid-text 硬编码为 black，
       * 且 darkMaterial 主题不覆盖颜色变量。revo-grid 的 CSS 通过 Stencil 全局注入，
       * 外部无法可靠覆盖其 CSS 变量——直接在 shadow 内用 .cmx-revo-inner .rgCell 选择器
       * 强制设 color，绑定 UI5 的 --sapTextColor，让所有主题（含 hcb 高对比黑）下
       * 字体颜色自动跟随主题。注意：必须放 .text-negative 等条件类之前，
       * 让条件类覆盖默认色。 */
      .cmx-revo-inner revogr-data .rgCell { color: var(--sapTextColor, #1d2d3e); }
      /* 条件样式内置类（cellStyle 可引用）+ 徽章/链接显示 */
      .cmx-revo-inner .rgCell.text-negative { color: var(--sapNegativeColor,#bb0000); }
      .cmx-revo-inner .rgCell.text-positive { color: var(--sapPositiveColor,#107e3e); }
      .cmx-revo-inner .rgCell.text-warning  { color: var(--sapCriticalColor,#e9730c); }
      .cmx-revo-inner .rgCell.text-muted    { color: var(--sapContent_LabelColor,#6a6d70); }
      .cmx-revo-inner .rgCell.cell-bold     { font-weight: 700; }
      /* allowTextSelect：覆盖 revo-grid host 的 user-select:none（继承到 .rgCell）。
         revo-grid 是 shadow:none（light DOM），本 shadow CSS 可达 .rgCell。
         !important 以压过 badge 等内联 userSelect:none，让整格内容可选。 */
      .cmx-revo-inner.cmx-allow-text-select revogr-data .rgCell,
      .cmx-revo-inner.cmx-allow-text-select revogr-data .rgCell * {
        -webkit-user-select: text !important;
        -moz-user-select: text !important;
        -ms-user-select: text !important;
        user-select: text !important;
        -webkit-touch-callout: default !important;
      }
      .cmx-cell-badge { line-height: 1.4; }
      .cmx-cell-link:hover { text-decoration: none; }
      /* cmx-current-row：通过 rowClass 属性由 RevoGrid 原生打到 .rgRow 上
       * 多选时所有被勾选行同色高亮，背景用 SAP 选中色 + 左侧 4px 强调条 + 顶/底 1px 细边，
       * 密集行里也一眼能看出"这几行被选中了"。
       *
       * 特异性（CSS 选择器优先级 a/b/c）：
       *   - 皮肤偶数行规则：:host(.cmx-grid-neo) revo-grid[theme=material] revogr-data
       *     .rgRow:nth-child(even) .rgCell
       *     = :host(1) + .cmx-grid-neo(1) + revo-grid(0) + [theme=](1) + revogr-data(0)
       *     + .rgRow(1) + :nth-child(1) + .rgCell(1) = (0,6,2)
       *   - 本规则：把 revo-grid 固定 class cmx-revo-inner 写进 compound selector 撑高 b
       *     维度 → (0,7,2)，!important 互压时胜出。cmx-revo-inner 是 cmx-revo-grid.js
       *     在 connectedCallback 里固定的 class（_revo.className = 'cmx-revo-inner'），稳定
       *     可用。
       *   - 早期版本错用 .cmx-revo-inner revo-grid 作为后代链，.cmx-revo-inner 是 revo-grid
       *     自身的 class 不是任何祖先的类，整条选择器零匹配，规则被静默忽略——这是上一版"多选
       *     高亮看不出来"的根因。正确写法见下面注释，必须把 revo-grid.cmx-revo-inner[theme]
       *     写在一起。
       *
       * 注意：_css() 是 JS 模板字符串（外层用反引号），本注释块内不能出现裸反引号，否则
       * JS 解析器会把反引号当作字符串结束符截断模板，导致整个 cmx-revo-grid.js 解析失败、
       * 所有依赖它的页面 bootstrap 全挂。 */
      :host(.cmx-grid-neo) revo-grid.cmx-revo-inner[theme="material"] revogr-data .rgRow.cmx-current-row .rgCell,
      :host(.cmx-grid-neo) revo-grid.cmx-revo-inner[theme="compact"]  revogr-data .rgRow.cmx-current-row .rgCell,
      :host(.cmx-grid-neo) revo-grid.cmx-revo-inner[theme^="dark"]     revogr-data .rgRow.cmx-current-row .rgCell,
      :host(.cmx-grid-neo) revo-grid.cmx-revo-inner[theme="material"] revogr-data .rgRow.cmx-current-row:nth-child(even) .rgCell,
      :host(.cmx-grid-neo) revo-grid.cmx-revo-inner[theme="compact"]  revogr-data .rgRow.cmx-current-row:nth-child(even) .rgCell,
      :host(.cmx-grid-neo) revo-grid.cmx-revo-inner[theme^="dark"]     revogr-data .rgRow.cmx-current-row:nth-child(even) .rgCell {
        /* 不用 --sapList_SelectionBackgroundColor：dark 主题下 UI5 把该变量设为 var(--sapInformationElementColor, #1d2d3e) 深色，
         * 跟未选中深色背景几乎无视觉差，密集行里完全看不出哪几行被勾选。
         * 这里用 25% neo-grid-accent + 70% sapList_Background 的混合：
         *   - light（sapList_Background=var(--sapList_Background, #ffffff), accent=var(--sapInformationElementColor, #00b4d8)）→ 25% cyan + 70% 白 = #ade0e8 中亮 cyan
         *   - dark （sapList_Background=var(--sapInformationElementColor, #1a1f26)）              → 25% cyan + 70% 深 = #2c8b9c 中等 cyan
         * 两种主题下选中色都比未选中行亮一档以上（dark: 选 #2c8b9c vs 未选 var(--sapInformationElementColor, #1a3039)，蓝色分量差
         * 约 50），密集行里"被勾上几行"一目了然，但又不至于像 40%+ 那样过亮抢戏。 */
        background: color-mix(in srgb, var(--neo-grid-accent, #00b4d8) 25%, var(--sapList_Background, #fff)) !important;
      }
      /* 序号列段（rowHeaders 内的 .rgRow.cmx-current-row .rgCell）也强制同色——默认 skin 用
       * 45% accent 强调色跟主数据不一致，多选时两段视觉割裂。这里用同公式覆盖为同色。 */
      :host(.cmx-grid-neo) revo-grid.cmx-revo-inner[theme] .rowHeaders revogr-data .rgRow.cmx-current-row .rgCell {
        background: color-mix(in srgb, var(--neo-grid-accent, #00b4d8) 25%, var(--sapList_Background, #fff)) !important;
      }
      /* box-shadow 左 4px 强调条只贴在主数据区（revogr-data 限定），不要跟随到 rowHeaders
       * 序号列段。原因：rowHeaders 段是独立 render tree，行号 cell 由 cellTemplate 生成
       * 的 span 标签只显示数字，背景+box-shadow 走 main data 区的 rowClass 配置。如果不加
       * revogr-data 限定，rowHeaders 段也带 .cmx-current-row，box-shadow 也会渲染——但
       * rowHeaders 段 nth-child(odd) 的行会出现"没选中却有 4px 强调条"的视觉错位（误以为
       * 是选中）。rowHeaders 序号列段的"选中高亮"由上面 .rowHeaders 选择器单独处理。 */
      :host(.cmx-grid-neo) revo-grid.cmx-revo-inner[theme="material"] revogr-data .rgRow.cmx-current-row,
      :host(.cmx-grid-neo) revo-grid.cmx-revo-inner[theme="compact"]  revogr-data .rgRow.cmx-current-row,
      :host(.cmx-grid-neo) revo-grid.cmx-revo-inner[theme^="dark"]     revogr-data .rgRow.cmx-current-row {
        background: color-mix(in srgb, var(--neo-grid-accent, #00b4d8) 25%, var(--sapList_Background, #fff)) !important;
        box-shadow:
          inset 4px 0 0 0 var(--sapSelectedColor, #266ae8),
          inset 0 1px 0 0 color-mix(in srgb, var(--sapSelectedColor, #266ae8) 50%, transparent),
          inset 0 -1px 0 0 color-mix(in srgb, var(--sapSelectedColor, #266ae8) 35%, transparent);
      }

      /* ─── 多级表头修复 ─────────────────────────────────────────────
       * RevoGrid 把所有 group cell 都绝对定位 top:0 + height:100% 于 .group-rgRow,
       * 导致 N 层 group 全部在顶部互相覆盖。改成按"在它之前出现了几个 spacer"
       * (.header-rgRow.group) 来推断 level，逐级 top:level*32px、height:32px。
       *
       * 同时给 cell 加 align-items:center, 保证文字垂直居中（高度不止 32 的合并叶
       * 单元格也能看起来正常）。
       * ──────────────────────────────────────────────────────────── */
      /* 表头标题：横向 + 纵向都居中（默认） */
      /* 表头标题：横向 + 纵向都居中（默认）。
         padding 统一收紧到 6px（revo-grid 默认 0 15px 偏大，窄列如序号列的标题易被裁）。
         !important：revo-grid 表头 padding 由主题 CSS 在 light DOM 动态插入、源序晚于本组件
         shadow <style>，同特异性下会覆盖本规则（与下方 --cmx-rg-header-h 同理）。 */
      revo-grid revogr-header .rgHeaderCell {
        align-items: center;
        justify-content: center;
        text-align: center;
        padding-left: 6px !important;
        padding-right: 6px !important;
      }
      /* 自定义表头行高（opts.headerRowHeight 设值时通过 --cmx-rg-header-h 接管 revo-grid 主题默认）。
         !important 因为 revo-grid 自带的 .header-rgRow height 规则在 light DOM 内动态插入、
         源序晚于本组件 shadow root 的 <style>，同特异性下会覆盖本规则。 */
      revo-grid[style*="--cmx-rg-header-h"] revogr-header,
      revo-grid[style*="--cmx-rg-header-h"] revogr-header .header-rgRow {
        line-height: var(--cmx-rg-header-h) !important;
      }
      revo-grid[style*="--cmx-rg-header-h"] revogr-header .header-rgRow {
        height: var(--cmx-rg-header-h) !important;
      }
      /* 数据行单元格垂直居中：revo-grid 默认 .rgRow { line-height: 27px } 而 rowSize 通常是 32+，
         文字基线明显偏上。仅改 .rgCell 的 line-height = rowSize 即可让纯文本居中；
         不改 display，避免影响业务页面 cellTemplate 返回非 flex-compatible 内容时的布局。 */
      revo-grid[style*="--cmx-rg-row-h"] revogr-data .rgCell {
        line-height: var(--cmx-rg-row-h);
      }
      revo-grid revogr-header .group-rgRow > .rgHeaderCell {
        top: 0;
        height: var(--cmx-header-row-h, 32px);
      }
      revo-grid revogr-header .group-rgRow > .header-rgRow.group ~ .rgHeaderCell {
        top: calc(var(--cmx-header-row-h, 32px) * 1);
      }
      revo-grid revogr-header .group-rgRow > .header-rgRow.group ~ .header-rgRow.group ~ .rgHeaderCell {
        top: calc(var(--cmx-header-row-h, 32px) * 2);
      }
      revo-grid revogr-header .group-rgRow > .header-rgRow.group ~ .header-rgRow.group ~ .header-rgRow.group ~ .rgHeaderCell {
        top: calc(var(--cmx-header-row-h, 32px) * 3);
      }
      revo-grid revogr-header .group-rgRow > .header-rgRow.group ~ .header-rgRow.group ~ .header-rgRow.group ~ .header-rgRow.group ~ .rgHeaderCell {
        top: calc(var(--cmx-header-row-h, 32px) * 4);
      }
      /* 孤立叶（少于 groupingDepth 层 group 的叶列）由 JS 在数据属性
       * data-cmx-leaf-orphan-rows 上写出需要向上合并的行数，CSS 据此调整高度 + 上推。
       * background + z-index：合并后会覆盖原本 .group-rgRow 里空 spacer 范围中的列分隔/边线/底色，
       * 单纯改高度的话下面那一层 cell 边线还透出来。所以这里给一层 SAP/material 兼容的实底色 + 叠在 group cell 之上。 */
      revo-grid revogr-header .actual-rgRow > .rgHeaderCell[data-cmx-leaf-orphan-rows] {
        background: var(--revo-grid-header-bg, var(--sapList_Background, #fff));
        z-index: 2;
      }
      revo-grid revogr-header .actual-rgRow > .rgHeaderCell[data-cmx-leaf-orphan-rows="1"] {
        height: calc(var(--cmx-header-row-h, 32px) * 2);
        margin-top: calc(var(--cmx-header-row-h, 32px) * -1);
      }
      revo-grid revogr-header .actual-rgRow > .rgHeaderCell[data-cmx-leaf-orphan-rows="2"] {
        height: calc(var(--cmx-header-row-h, 32px) * 3);
        margin-top: calc(var(--cmx-header-row-h, 32px) * -2);
      }
      revo-grid revogr-header .actual-rgRow > .rgHeaderCell[data-cmx-leaf-orphan-rows="3"] {
        height: calc(var(--cmx-header-row-h, 32px) * 4);
        margin-top: calc(var(--cmx-header-row-h, 32px) * -3);
      }
      revo-grid revogr-header .actual-rgRow > .rgHeaderCell[data-cmx-leaf-orphan-rows="4"] {
        height: calc(var(--cmx-header-row-h, 32px) * 5);
        margin-top: calc(var(--cmx-header-row-h, 32px) * -4);
      }

      /* 序号列（rowHeaders）：主表头多级时，rowHeaders 的 revogr-header 其实 revo-grid 自己已经按
       * 继承下来的 groupingDepth 在 .group-rgRow 里推了 N 个空 spacer，所以总高度本来就 = 主表头同高
       *（(groupingDepth+1)*rowH）。问题是：.actual-rgRow 排在那 N 个 spacer 之后，序号 cell 默认只
       * 占最底下一行（即"第 N+1 行表头"）。要让序号 cell 从第 1 行就开始铺，要把 cell 用 margin-top
       * 上推到 revogr-header 顶部，并把 height 拉到整段表头高。
       *
       * 不要再加 min-height 或动 .actual-rgRow 的高度——revo-grid 已经把 wrapper 自动布到位了，
       * 强行再撑会造成 revo-grid 内部 header-wrapper.clientHeight / ResizeObserver 算出多余的高度，
       * 把数据起点又下推一遍，最终让序号侧数据行错位 / 序号 cell 又溢出到数据区。 */
      revo-grid .rowHeaders revogr-header .actual-rgRow > .rgHeaderCell {
        height: var(--cmx-main-header-h, var(--cmx-header-row-h, 32px));
        margin-top: calc(var(--cmx-header-row-h, 32px) - var(--cmx-main-header-h, var(--cmx-header-row-h, 32px)));
        background: var(--revo-grid-header-bg, var(--sapList_Background, #fff));
        z-index: 2;
      }
    `
  }

  /**
   * Shadow DOM 静态结构：表格宿主 + 可选 div 合计区。
   * @returns {string}
   */
  _html() {
    return `<div class="host-wrap"><div id="host"></div></div>`
  }
}

// 把各 mixin 挂到原型（运行时 this 指向组件实例，实例字段由构造器初始化）
Object.assign(CmxRevoGrid.prototype, revoGridStretchMixin, revoGridSelectionMixin, revoGridMultiHeaderMixin, revoGridSyncMixin, revoGridEventsMixin, revoGridTooltipMixin, revoGridTextSelectMixin, revoGridResizeMixin)

customElements.define('cmx-revo-grid', CmxRevoGrid)
