/**
 * <cmx-dict-select> — 数据字典选择组件（类 combo-box）。
 *
 * @component
 * @slot actions - 扩展按钮区，放入的元素追加到右侧按钮区尾部。
 * @fires cmx-dict-change - 选中或清除，detail: { id, row (CmxRowSet), text }
 * @fires cmx-dict-open - 打开下拉
 * @fires cmx-dict-help - 打开 help 对话框，detail: { layout }
 *
 * 标签属性（observedAttributes，等价于 configure() 同名配置项）：
 * @prop {string} dict-code - 字典编码
 * @prop {string} [id-col='id'] - ID 列名
 * @prop {string} [label-col='name'] - 名称列名
 * @prop {string} [code-col] - 编码列名；设置后显示「编码-名称」
 * @prop {string} [parent-col='parent_id'] - 父级列名（分级用）
 * @prop {string} [placeholder] - 输入框占位文本
 * @prop {('classify'|'group'|'grid')} [help-layout='grid'] - help 对话框布局
 * @prop {boolean} [show-clear] - clear 按钮是否可见
 * @prop {boolean} [hierarchical] - 字典是否分级（true → treegrid）
 * @prop {boolean} [readonly] - 只读
 * @prop {boolean} [disabled] - 禁用
 *
 * 形态：一个 <ui5-input> 输入框 + 右侧按钮区（clear 可控显隐 / help / 可扩展 slot 区）。
 *
 * 交互：
 *   1) 输入框获得焦点 → 自动下拉「最近选过」(MRU，本地 localStorage + 后端个性化存储)。
 *   2) 输入时边输边搜（debounce），下拉切换为搜索结果。
 *   3) 鼠标 / 键盘（↑↓ Enter Esc）选择 → 选中值为 **CmxRowSet** 对象。
 *   4) clear 按钮清除选中值。
 *   5) help 按钮弹出 <cmx-floating-dialog>（沿用 PortalManager dialog-worknode 样式），
 *      据 helpLayout 三种布局：
 *        'classify' — 左分类树 + 右字典 grid
 *        'group'    — 左分组树 + 右字典 grid
 *        'grid'     — 仅字典 grid（字典分级时为 treegrid）
 *      树顶 / grid 顶各带搜索框。
 *
 * 元数据配置（关联哪个字典 + 列映射）：
 *   el.configure({
 *     dictCode, idCol, labelCol, parentCol,   // 字典编码 + ID/名称/ParentID 列
 *     columns,                                // grid 列定义（CmxColumn[] | 描述符）
 *     hierarchical,                           // 字典是否分级（true → grid 走 treegrid）
 *     helpLayout,                             // 'classify' | 'group' | 'grid'
 *     showClear,                              // clear 按钮是否可见
 *     dataSource,                             // { search(q,opts), loadByKeys(keys) }
 *     classifyTreeSource, groupTreeSource,    // 左侧树数据源（help 用）
 *     personalizationService,                 // MRU 后端 { load, save }（可选）
 *     mruMax, placeholder,
 *   })
 *
 * 事件（bubbles + composed）：
 *   cmx-dict-change  { detail: { id, row (CmxRowSet), text } }   选中或清除
 *   cmx-dict-open    打开下拉
 *   cmx-dict-help    打开 help 对话框
 *
 * 扩展按钮：往 slot="actions" 放任意元素即可追加到按钮区尾部。
 */
import '@ui5/webcomponents/dist/Input.js'
import '@ui5/webcomponents/dist/Button.js'
import '@ui5/webcomponents/dist/Icon.js'
import '@ui5/webcomponents/dist/ResponsivePopover.js'
import '@ui5/webcomponents/dist/List.js'
import '@ui5/webcomponents/dist/ListItemStandard.js'
import '@ui5/webcomponents/dist/BusyIndicator.js'

import { CmxDataSet } from '../lib/cmx-data-set.js'
import { CmxColumn } from '../lib/cmx-column.js'
import { CmxColumnModel } from '../lib/cmx-column-model.js'
import {
  searchAsync,
  lookupByKeyAsync,
  debounceForSource,
} from '../lib/cmx-async-source.js'
import {
  CmxDictMru,
  createMruServiceFromPageService,
} from '../lib/cmx-dict-personalization.js'
import './cmx-floating-dialog.js'
import './cmx-revo-grid.js'
import './cmx-web-treeview.js'

const DEFAULT_MRU_MAX = 10

export class CmxDictSelect extends HTMLElement {
  static get observedAttributes () {
    return ['dict-code', 'id-col', 'label-col', 'code-col', 'parent-col', 'placeholder', 'help-layout', 'show-clear', 'hierarchical', 'readonly', 'disabled']
  }

  constructor () {
    super()
    this.attachShadow({ mode: 'open' })

    /**
     * 组件配置规格（由 configure() / 标签属性合并写入）。
     * @type {{
     *   dictCode: string,
     *   idCol: string,
     *   labelCol: string,
     *   codeCol: string,
     *   parentCol: string,
     *   columns: Array<Object>|CmxColumnModel|null,
     *   hierarchical: boolean,
     *   helpLayout: ('classify'|'group'|'grid'),
     *   showClear: boolean,
     *   dataSource: { search?: Function, loadByKeys?: Function }|null,
     *   classifyTreeSource: Object|null,
     *   groupTreeSource: Object|null,
     *   personalizationService: Object|Function|null,
     *   mruMax: number,
     *   placeholder: string,
     *   dictTitle?: string,
     *   readonly?: boolean,
     *   disabled?: boolean,
     * }}
     */
    this._cfg = {
      dictCode: '',            // 字典编码，用于区分 MRU 命名空间
      idCol: 'id',             // ID 列名（行唯一键）
      labelCol: 'name',        // 名称列名（用于显示文本）
      codeCol: '',             // 编码列名；设置后 input 显示「编码-名称」
      parentCol: 'parent_id',  // 父级列名（分级字典用）
      columns: null,           // help grid 列定义（CmxColumn[] | 描述符 | CmxColumnModel）
      hierarchical: false,     // 字典是否分级（true → help grid 走 treegrid）
      helpLayout: 'grid',      // 'classify' | 'group' | 'grid'
      showClear: true,         // 是否显示 clear 按钮
      dataSource: null,        // 数据源：{ search(q,opts), loadByKeys(keys) }
      classifyTreeSource: null, // help 左侧分类树数据源（仅 classify 布局用）
      groupTreeSource: null,    // help 左侧分组树数据源（仅 group 布局用）
      personalizationService: null, // MRU 后端服务 { load, save } 或构造工厂
      mruMax: DEFAULT_MRU_MAX, // MRU 最大保留条数
      placeholder: '请输入或点击查询',
    }

    /**
     * 已知行容器：搜索结果 / MRU / help 选中都会登记到这里，
     * 供按 id 取对应 CmxRowSet（避免重复回查后端）。
     * @type {CmxDataSet}
     */
    this._innerDs = new CmxDataSet({ datasetId: 'dict-select-inner' })
    /** @type {string|null} 当前选中行的 id（idCol 列值） */
    this._value = null
    /** @type {string} 当前显示文本（输入框可见字符串） */
    this._displayText = ''
    /** @type {CmxDictMru|null} 最近选过管理器（本地 localStorage + 后端个性化） */
    this._mru = null
    /** @type {('mru'|'search')} 下拉当前模式：最近选过 / 搜索结果 */
    this._dropMode = 'mru'
    /** @type {number} 下拉高亮索引（键盘 ↑↓ 导航用，-1 表示无高亮） */
    this._activeIdx = -1
    /** @type {object[]} 下拉当前条目（普通对象数组，来源于 MRU 或搜索） */
    this._dropItems = []
    /** @type {Function|null} 防抖搜索器（首次搜索时按 dataSource 懒构造） */
    this._debouncedSearch = null
    /**
     * 是否已完成首次 connectedCallback 装配（DOM/事件绑定只跑一次）。
     * 用于支持 configure() 在挂载前后都能安全调用。
     * @type {boolean}
     */
    this._wired = false
  }

  // ── 配置 API ───────────────────────────────────────────────────────────────

  /**
   * 合并配置；可在挂载前后多次调用。
   * 挂载后再调用会立即把新配置同步到 DOM。
   * @param {Object} cfg - 待合并的配置项（参见 this._cfg 字段列表）
   * @returns {CmxDictSelect} this（链式调用）
   */
  configure (cfg = {}) {
    Object.assign(this._cfg, cfg)
    this._rebuildMru()
    if (this._wired) {
      this._applyCfgToDom()
    }
    return this
  }

  /**
   * 单独设置数据源（search/loadByKeys 接口）。
   * @param {{ search?: Function, loadByKeys?: Function }} ds - 数据源对象
   * @returns {CmxDictSelect} this（链式调用）
   */
  setDataSource (ds) { this._cfg.dataSource = ds; return this }

  /**
   * 设置 help grid 列模型（CmxColumnModel 或描述符数组）。
   * @param {CmxColumnModel|Array<Object>} cols - 列模型或列描述符数组
   * @returns {CmxDictSelect} this（链式调用）
   */
  setColumns (cols) { this._cfg.columns = cols; return this }

  /**
   * 程序化设置选中值（按 id）。
   * 会按以下顺序解析行对象用于显示文本：缓存命中 → rowData 直传 → 后端回查。
   * displayText 非空时直接覆盖显示文本，不再回查后端。
   * @param {string|number|null} id - 选中行 id（idCol 列值）；空值等价于 clearValue
   * @param {Object} [opts]
   * @param {boolean} [opts.silent=false] - true 时不派发 cmx-dict-change 事件
   * @param {string|null} [opts.displayText=null] - 显式指定显示文本（覆盖回查结果）
   * @param {Object|null} [opts.rowData=null] - 直接传入行对象（避免后端回查）
   * @returns {Promise<CmxDictSelect>} this（链式调用）
   */
  async setValue (id, { silent = false, displayText = null, rowData = null } = {}) {
    if (id == null || id === '') return this.clearValue({ silent })
    const key = String(id)
    let row = rowData ? this._ingest(rowData) : this._innerDs.getRow(key)
    if (!row && this._cfg.dataSource) {
      // 缓存未命中且配置了数据源 → 异步回查后端
      const found = await lookupByKeyAsync(this._cfg.dataSource, key)
      const plain = Array.isArray(found) ? found[0] : found
      if (plain) row = this._ingest(plain)
    }
    this._value = key
    this._displayText = displayText != null && String(displayText) !== '' ? String(displayText) : (row ? this._labelOf(row) : key)
    this._syncInputText()
    if (!silent) this._emitChange()
    return this
  }

  /**
   * 取当前选中 id。
   * @returns {string|null} 选中行 id，未选时为 null
   */
  getValue () { return this._value }

  /**
   * 取当前选中行（CmxRowSet）。
   * @returns {import('../lib/cmx-row-set.js').CmxRowSet|null} 选中行，未选时为 null
   */
  getSelectedRow () { return this._value ? this._innerDs.getRow(this._value) : null }

  /**
   * 清空选中值。
   * @param {Object} [opts]
   * @param {boolean} [opts.silent=false] - true 时不派发 cmx-dict-change 事件
   * @returns {CmxDictSelect} this（链式调用）
   */
  clearValue ({ silent = false } = {}) {
    this._value = null
    this._displayText = ''
    this._syncInputText()
    if (!silent) this._emitChange()
    return this
  }

  // ── 生命周期 ───────────────────────────────────────────────────────────────

  /**
   * 首次插入文档时装配组件：渲染 shadow DOM、缓存元素、绑定事件、应用配置。
   * 用 _wired 标志保证只跑一次（防止重复插入文档时重渲染丢状态）。
   */
  connectedCallback () {
    if (this._wired) return
    this._wired = true
    this._readAttributes()
    this._rebuildMru()
    // eslint-disable-next-line no-restricted-syntax -- shadow 模板
    this.shadowRoot.innerHTML = `<style>${this._css()}</style>${this._html()}`
    this._cacheEls()
    this._applyCfgToDom()
    this._wireInput()
    this._wireButtons()
    this._wirePopover()
  }

  /**
   * 从文档移除时清理：关闭下拉、清掉抑制窗口定时器。
   * 不解绑事件——元素一旦被回收，监听器随之 GC。
   */
  disconnectedCallback () {
    this._closeDrop()
    clearTimeout(this._suppressTimer)
    this._suppressOpen = false
  }

  /**
   * 标签属性变更回调（observedAttributes 列表内）。
   * 挂载后才生效：重新读取属性 → 同步到 DOM。
   */
  attributeChangedCallback () {
    if (!this._wired) return
    this._readAttributes()
    this._applyCfgToDom()
  }

  // ── DOM ────────────────────────────────────────────────────────────────────

  /**
   * 组件 shadow DOM 样式表。
   * 设计要点：
   *   - 整体 .wrap 自绘外边框（聚焦时高亮），ui5-input 去边框融入外壳；
   *   - 弹层背景在容器污染 sap 变量为 transparent 时强制重置回 sapBaseColor；
   *   - 通过 data-cmx-fill-host 属性切换「填满宿主」布局（grid 编辑器场景）。
   * @returns {string} CSS 文本
   */
  _css () {
    return `
      :host {
        display: inline-block; width: 100%; box-sizing: border-box; font-size: .875rem;
        --cmx-dict-select-height: var(--_ui5_input_height, 1.75rem);
      }
      /* 下拉悬浮框背景修复：
         UI5 的 <ui5-responsive-popover> 自身 :host 背景规则为
         background-color: var(--_ui5_popover_background)，内部 .ui5-popup-root 再
         background:inherit 继承。当本组件被放进会把 --sapGroup_ContentBackground 等
         背景变量重置为 transparent 的容器时（典型场景：UI5 原生 <ui5-form> 在自身
         :host 上把这些变量置 transparent 以让表单融入容器，cmx-ui5-form 即用到了它），
         该变量解析为 transparent，下拉悬浮框背景透明、能看到底层元素。
         在组件 shadowRoot 内对 ui5-responsive-popover 显式重置该变量——来自父
         shadowRoot 的规则优先级高于 popover 自身 :host——用未被容器污染的
         --sapBaseColor 恢复实色背景（深/浅主题下均与组内容背景一致；不能写成
         包含 --sapGroup_ContentBackground 的 var() 回退链，它已被显式置为 transparent，
         var() 不会对 transparent 触发回退）。 */
      ui5-responsive-popover, ::slotted(ui5-responsive-popover) {
        --_ui5_popover_background: var(--sapBaseColor, #ffffff);
      }
      :host([data-cmx-fill-host]) {
        display: flex;
        width: 100%; height: 100%;
        min-width: 0;
      }
      /* 整个组件一圈外边框，聚焦时高亮，营造「输入框+按钮区」一体感 */
      .wrap {
        display: flex; align-items: stretch; width: 100%; gap: 0;
        min-height: 0;
        height: var(--cmx-dict-select-height);
        box-sizing: border-box;
        border: 1px solid var(--sapField_BorderColor, #89919a);
        border-radius: var(--sapField_BorderCornerRadius, .25rem);
        background: var(--sapField_Background, #fff);
        transition: border-color .1s ease;
      }
      :host([data-cmx-fill-host]) .wrap {
        flex: 1 1 auto;
        height: 100%;
        min-width: 0;
      }
      /* 聚焦时外壳蓝色边框 + 外发光（保留） */
      .wrap.focused {
        border-color: var(--sapField_Hover_BorderColor, var(--sapHighlightColor, #0070f2));
        box-shadow: 0 0 0 1px var(--sapField_Hover_BorderColor, var(--sapHighlightColor, #0070f2));
      }
      /* 内部 ui5-input 去掉自身边框/背景，溶进外壳 */
      ui5-input {
        flex: 1 1 auto; min-width: 0;
        height: 100%;
        margin: 0;
        --_ui5_input_height: calc(var(--cmx-dict-select-height) - 2px);
        --_ui5_input_min_width: 0;
        --_ui5_input_inner_padding: 0 .625rem;
        --_ui5_input_inner_padding_with_icon: 0 .25rem 0 .625rem;
        --_ui5_input_border: none;
        --_ui5-input-border: none;
        --_ui5_input_focus_border_color: transparent;
        --_ui5_input_background_color: transparent;
        /* 关键：UI5 输入框聚焦虚线由内部 .ui5-input-focusable-element:after 画，
           其颜色/内容由可继承的 CSS 变量控制 → 设透明 + 空内容即可去掉那圈虚线 */
        --_ui5_input_focus_outline_color: transparent;
        --ui5_input_focus_pseudo_element_content: none;
        border: none; background: transparent; box-shadow: none;
      }
      ui5-input::part(input) {
        height: 100%;
        min-height: 0;
        line-height: calc(var(--cmx-dict-select-height) - 2px);
        box-sizing: border-box;
        padding-block: 0;
      }
      .btns { display: flex; align-items: center; flex: 0 0 auto; padding-right: 2px; gap: 0; }
      /* 按钮做成正方形：宽 = 高（跟随输入框高度，取整行高度） */
      .btns ui5-button {
        --_ui5_button_base_min_width: calc(var(--cmx-dict-select-height) - 2px);
        --_ui5_button_base_min_height: calc(var(--cmx-dict-select-height) - 2px);
        width: calc(var(--cmx-dict-select-height) - 2px);
        height: calc(var(--cmx-dict-select-height) - 2px);
      }
      /* clear 与 help 之间的竖向分隔线（clear 可见时才显示） */
      .btn-divider {
        flex: 0 0 auto; width: 1px; align-self: stretch;
        margin: .25rem 2px;
        background: var(--sapToolbar_SeparatorColor, var(--sapList_BorderColor, #d9d9d9));
      }
      .btn-divider[hidden] { display: none; }
      ui5-button[hidden] { display: none; }
      .drop-list { max-height: 280px; overflow-y: auto; overflow-x: hidden; }
      .drop-list ui5-li { white-space: nowrap; }
      .drop-empty { padding: .75rem 1rem; color: var(--sapNeutralColor, #6a6d70); font-size: .8125rem; white-space: nowrap; }
      /* 头部：标题独占一行（顶部对齐），下方一行放“清除全部”按钮 */
      .drop-hd { display: flex; flex-direction: column; align-items: flex-start; gap: .125rem;
                 padding: .375rem .75rem .25rem; font-size: .75rem; color: var(--sapContent_LabelColor, #6a6d70);
                 background: var(--sapList_HeaderBackground, #f7f7f7); position: sticky; top: 0; z-index: 1; }
      .drop-hd-title { display: flex; align-items: center; gap: .25rem; width: 100%; line-height: 1.4; font-weight: 600; }
      .drop-hd-icon { color: var(--sapContent_IconColor, var(--sapHighlightColor, #0070f2)); }
      .drop-hd-icon[hidden] { display: none; }
      .drop-hd-clear { --_ui5_button_base_min_width: auto; font-size: .6875rem; margin-left: -.25rem; }
      .drop-hd-clear[hidden] { display: none; }
      /* 行内清除图标：默认半透明，悬停高亮 */
      .drop-li-clear { cursor: pointer; color: var(--sapContent_NonInteractiveIconColor, #8c8c8c);
                       padding: .125rem; flex: 0 0 auto; }
      .drop-li-clear:hover { color: var(--sapNegativeColor, #bb0000); }
      ui5-li[active], ui5-li.active { background: var(--sapList_SelectionBackgroundColor, #e5f0fa); }
    `
  }

  /**
   * 组件 shadow DOM 结构模板。
   * 结构：外壳 .wrap > ui5-input + 按钮区（clear + 分隔线 + help + slot）
   *       + ui5-responsive-popover 下拉（标题头 / ui5-list / 空状态 / busy 指示器）
   * @returns {string} HTML 文本
   */
  _html () {
    return `
      <div class="wrap" id="wrap">
        <ui5-input id="inp" show-suggestions="false"></ui5-input>
        <div class="btns">
          <ui5-button id="clearBtn" icon="decline" design="Transparent" tooltip="清除" hidden></ui5-button>
          <span class="btn-divider" id="btnDivider" hidden></span>
          <ui5-button id="helpBtn" icon="value-help" design="Transparent" tooltip="查询"></ui5-button>
          <slot name="actions"></slot>
        </div>
      </div>
      <ui5-responsive-popover id="pop" placement-type="Bottom" placement="Bottom" hide-arrow prevent-initial-focus class="dict-pop">
        <ui5-busy-indicator id="busy" delay="120" size="S" style="width:100%">
          <div class="drop-hd" id="dropHd">
            <span class="drop-hd-title">
              <ui5-icon class="drop-hd-icon" id="dropHdIcon" name="history"></ui5-icon>
              <span id="dropHdTitle">最近选过</span>
            </span>
            <ui5-button class="drop-hd-clear" id="dropClearAllBtn" design="Transparent" icon="clear-all" tooltip="清除全部最近选过">清除全部</ui5-button>
          </div>
          <ui5-list id="list" class="drop-list" mode="SingleSelect"></ui5-list>
          <div class="drop-empty" id="dropEmpty" hidden>无匹配项</div>
        </ui5-busy-indicator>
      </ui5-responsive-popover>
    `
  }

  /**
   * 缓存 shadow DOM 内关键元素引用到实例属性，避免每次查询。
   * 缓存项：外壳、输入框、按钮（clear/help）、分隔线、弹层、列表、标题区、空状态、busy。
   */
  _cacheEls () {
    const sr = this.shadowRoot
    /** @type {HTMLElement} 外壳 .wrap（聚焦高亮、点击转焦点用） */
    this._wrap = sr.getElementById('wrap')
    /** @type {HTMLElement} ui5-input 输入框 */
    this._inp = sr.getElementById('inp')
    /** @type {HTMLElement} clear 按钮 */
    this._clearBtn = sr.getElementById('clearBtn')
    /** @type {HTMLElement} clear 与 help 之间的竖向分隔线 */
    this._btnDivider = sr.getElementById('btnDivider')
    /** @type {HTMLElement} help（值帮助）按钮 */
    this._helpBtn = sr.getElementById('helpBtn')
    /** @type {HTMLElement} ui5-responsive-popover 下拉弹层 */
    this._pop = sr.getElementById('pop')
    /** @type {HTMLElement} ui5-list 下拉列表 */
    this._list = sr.getElementById('list')
    /** @type {HTMLElement} 下拉标题区容器（sticky 头） */
    this._dropHd = sr.getElementById('dropHd')
    /** @type {HTMLElement} 下拉标题图标 */
    this._dropHdIcon = sr.getElementById('dropHdIcon')
    /** @type {HTMLElement} 下拉标题文字（最近选过 / 搜索"xxx"） */
    this._dropHdTitle = sr.getElementById('dropHdTitle')
    /** @type {HTMLElement} 下拉「清除全部最近选过」按钮 */
    this._dropClearAllBtn = sr.getElementById('dropClearAllBtn')
    /** @type {HTMLElement} 下拉空状态提示 */
    this._dropEmpty = sr.getElementById('dropEmpty')
    /** @type {HTMLElement} ui5-busy-indicator 加载指示器 */
    this._busy = sr.getElementById('busy')
  }

  /**
   * 把当前 _cfg 同步到 DOM（placeholder / readonly / disabled / 按钮可见性 / 显示文本）。
   * configure()、attributeChangedCallback() 都会调用。
   */
  _applyCfgToDom () {
    if (!this._inp) return
    this._inp.placeholder = this._cfg.placeholder || ''
    this._inp.readonly = !!this._cfg.readonly
    this._inp.disabled = !!this._cfg.disabled
    this._syncClearVisible()
    this._syncInputText()
  }

  // ── 输入框交互 ────────────────────────────────────────────────────────────

  /**
   * 绑定输入框相关事件：focus / blur / input / keydown。
   * - focus：高亮外壳 + 打开 MRU 下拉（除非只读 / 禁用 / 抑制窗口内）。
   * - input：边输边搜（空查询回退 MRU）。
   * - keydown：↑↓ 导航 / Enter 选定 / Esc 关闭。
   */
  _wireInput () {
    const inp = this._inp
    // 聚焦 → 下拉 MRU + 外壳高亮
    inp.addEventListener('focus', () => {
      this._wrap?.classList.add('focused')
      if (this._cfg.readonly || this._cfg.disabled) return
      // 选中/关闭后弹层把焦点交还输入框，会再次触发 focus —— 抑制窗口内不重开
      if (this._suppressOpen) return
      this._openMru()
    })
    inp.addEventListener('blur', () => { this._wrap?.classList.remove('focused') })
    // 边输边搜
    inp.addEventListener('input', () => {
      const q = String(inp.value || '').trim()
      this._displayText = inp.value || ''
      this._syncClearVisible()
      if (!q) { this._openMru(); return }
      this._runSearch(q)
    })
    inp.addEventListener('keydown', (e) => this._onInputKeydown(e))
  }

  /**
   * 输入框 keydown 处理：键盘导航。
   * @param {KeyboardEvent} e - 键盘事件
   */
  _onInputKeydown (e) {
    const open = this._pop?.open
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        if (!open) { this._openMru(); return }
        this._moveActive(1); break
      case 'ArrowUp':
        e.preventDefault(); this._moveActive(-1); break
      case 'Enter':
        if (open && this._activeIdx >= 0) {
          e.preventDefault(); this._chooseDropItem(this._activeIdx)
        }
        break
      case 'Escape':
        if (open) { e.preventDefault(); this._closeDrop() }
        break
      default: break
    }
  }

  // ── 按钮 ──────────────────────────────────────────────────────────────────

  /**
   * 绑定按钮区事件：
   *   - clear 按钮 → 清空选中值并回焦输入框；
   *   - help 按钮 → 打开值帮助对话框；
   *   - 外壳空白区 mousedown → 转焦点到输入框（避免「需点两次才聚焦」）。
   */
  _wireButtons () {
    this._clearBtn.addEventListener('click', () => {
      this.clearValue()
      this._inp.focus()
    })
    this._helpBtn.addEventListener('click', () => this.openHelp())
    // 点击外壳空白区（边框/内边距等非按钮区域）时，把焦点转给输入框，避免“需点两次”。
    this._wrap?.addEventListener('mousedown', (e) => {
      const path = e.composedPath()
      if (path.includes(this._inp)) return            // 点的就是 input，交给它自己
      if (this._clearBtn && path.includes(this._clearBtn)) return
      if (this._helpBtn && path.includes(this._helpBtn)) return
      // 其余区域：阻止外壳抢焦点，手动聚焦 input
      e.preventDefault()
      this._inp.focus()
    })
  }

  /**
   * 同步 clear 按钮（及其分隔线）的可见性。
   * 显示条件：showClear !== false 且存在显示文本或选中值。
   */
  _syncClearVisible () {
    const show = this._cfg.showClear !== false && !!(this._displayText || this._value)
    // 空值保护：setValue 可能在 connectedCallback（_cacheEls 填充 _clearBtn）之前被外部调用
    // （如 cmx-dict-field-type.js componentDidRender 在 appendChild 前先 setValue）。
    // 挂载后 _applyCfgToDom 会重新同步，此处跳过即可。
    if (this._clearBtn) this._clearBtn.hidden = !show
    // 分隔线仅在 clear 按钮可见时显示（否则孤立竖线）
    if (this._btnDivider) this._btnDivider.hidden = !show
  }

  /**
   * 把 _displayText 同步到输入框 value，并联动 clear 按钮可见性。
   */
  _syncInputText () {
    if (this._inp && this._inp.value !== this._displayText) this._inp.value = this._displayText
    this._syncClearVisible()
  }

  // ── 下拉（MRU / search 共用一套 ui5-list） ─────────────────────────────────

  /**
   * 绑定下拉弹层（ui5-responsive-popover + ui5-list）相关事件：
   *   - list item-click：选中条目 / 拦截行内清除图标；
   *   - list click：兜底捕获行内清除图标的点击（item-click 不一定冒泡到图标）；
   *   - 「清除全部最近选过」按钮 → 清空 MRU；
   *   - 弹层 before-close → 开启抑制窗口（防止关闭后焦点回弹导致重开）；
   *   - 弹层 after-close → 重置高亮索引。
   */
  _wirePopover () {
    this._list.addEventListener('item-click', (e) => {
      // 点的是行内清除图标 → 移除该 MRU 行，不触发选中
      const path = e.detail?.item ? e.composedPath() : []
      const clearIcon = path.find((el) => el instanceof HTMLElement && el.dataset && el.dataset.mruClear != null)
      if (clearIcon) {
        e.preventDefault?.()
        this._removeMruItem(clearIcon.dataset.mruClear)
        return
      }
      const idx = Number(e.detail?.item?.dataset?.idx)
      if (Number.isFinite(idx)) this._chooseDropItem(idx)
    })
    // 行内清除图标（自定义内容，item-click 不一定冒泡到图标）：直接监听 list 上的点击
    this._list.addEventListener('click', (e) => {
      const icon = e.composedPath().find((el) => el instanceof HTMLElement && el.dataset && el.dataset.mruClear != null)
      if (icon) {
        e.stopPropagation()
        this._removeMruItem(icon.dataset.mruClear)
      }
    })
    // 头部“清除全部最近选过”
    this._dropClearAllBtn?.addEventListener('click', (e) => {
      e.stopPropagation()
      this._mru?.clear()
      this._renderDropItems([])
    })
    // 任何原因导致弹层关闭（点外部、Esc、选中、失焦）都会把焦点交还输入框，
    // 在关闭前就开启抑制窗口，挡掉随之而来的 focus 重开。
    this._pop.addEventListener('before-close', () => this._armSuppress())
    this._pop.addEventListener('after-close', () => { this._activeIdx = -1 })
  }

  /**
   * 打开「最近选过」下拉。
   * 先用本地 MRU 立即渲染（无网络等待），同时异步合并后端个性化，
   * 仅在仍处于 mru 模式时把合并结果刷新到列表。
   * 派发 cmx-dict-open 事件。
   * @returns {Promise<void>}
   */
  async _openMru () {
    this._dropMode = 'mru'
    this._dropHdTitle.textContent = '最近选过'
    if (this._dropHdIcon) { this._dropHdIcon.name = 'history'; this._dropHdIcon.hidden = false }
    if (this._dropClearAllBtn) this._dropClearAllBtn.hidden = false
    this._list.mode = 'SingleSelect'
    let list = this._mru ? this._mru.getLocal() : []
    this._renderDropItems(list)
    this._showDrop()
    this.dispatchEvent(new CustomEvent('cmx-dict-open', { bubbles: true, composed: true }))
    // 异步合并后端个性化
    if (this._mru) {
      const merged = await this._mru.load().catch(() => list)
      if (this._dropMode === 'mru') this._renderDropItems(merged)
    }
  }

  /**
   * 启动一次搜索（防抖）。
   * 切换下拉到 search 模式：标题改为「搜索"query"」、隐藏「清除全部」按钮、
   * 懒构造防抖器（按 dataSource）后触发；同时显示 busy。
   * 无 dataSource 时直接渲染空结果。
   * @param {string} query - 搜索关键字
   */
  _runSearch (query) {
    const src = this._cfg.dataSource
    if (!src) { this._dropMode = 'search'; this._renderDropItems([]); this._showDrop(); return }
    this._dropMode = 'search'
    this._dropHdTitle.textContent = `搜索“${query}”`
    if (this._dropHdIcon) this._dropHdIcon.name = 'search'
    if (this._dropClearAllBtn) this._dropClearAllBtn.hidden = true
    this._list.mode = 'SingleSelect'   // 搜索结果不需要删除按钮
    if (!this._debouncedSearch) {
      this._debouncedSearch = debounceForSource(src, (q) => this._doSearch(q))
    }
    this._busy.active = true
    this._showDrop()
    this._debouncedSearch(query)
  }

  /**
   * 实际执行一次搜索请求（由防抖器触发）。
   * 若期间模式被切回 mru（用户清空输入），结果作废。
   * @param {string} query - 搜索关键字
   * @returns {Promise<void>}
   */
  async _doSearch (query) {
    try {
      const items = await searchAsync(this._cfg.dataSource, query)
      if (this._dropMode !== 'search') return
      this._renderDropItems(Array.isArray(items) ? items : [])
    } catch {
      this._renderDropItems([])
    } finally {
      this._busy.active = false
    }
  }

  /** 渲染下拉条目（普通对象数组）。MRU 模式下 list 处于 Delete 模式，每行右侧带删除按钮。 */
  _renderDropItems (items) {
    this._dropItems = items || []
    this._activeIdx = -1
    this._list.replaceChildren()
    const idCol = this._cfg.idCol
    const isMru = this._dropMode === 'mru'
    this._dropItems.forEach((it, idx) => {
      const id = String(it[idCol] ?? it.id ?? '')
      const li = document.createElement('ui5-li')
      li.dataset.idx = String(idx)
      li.dataset.id = id
      if (isMru) {
        // MRU 行：左侧文本 + 右侧单行清除图标（保持可点击，clear 图标单独拦截）
        const row = document.createElement('span')
        row.style.cssText = 'display:flex;align-items:center;width:100%;gap:.5rem'
        const text = document.createElement('span')
        // 文本不换行、不省略，让内容自然撑开弹层宽度（弹层用 max-content + minWidth=组件宽）
        text.style.cssText = 'flex:1 1 auto;white-space:nowrap'
        text.textContent = this._labelOf(it)
        const del = document.createElement('ui5-icon')
        del.className = 'drop-li-clear'
        del.setAttribute('name', 'decline')
        del.dataset.mruClear = id
        del.title = '从最近选过移除'
        row.append(text, del)
        li.appendChild(row)
      } else {
        li.textContent = this._labelOf(it)
      }
      this._list.appendChild(li)
    })
    const empty = this._dropItems.length === 0
    this._dropEmpty.hidden = !empty
    this._list.hidden = empty
  }

  /** 从 MRU 移除单行（点击行内清除图标）。 */
  _removeMruItem (id) {
    if (!this._mru || id == null) return
    this._mru.remove(id)
    const list = this._mru.getLocal()
    this._renderDropItems(list)
    if (list.length === 0) this._closeDrop()
  }

  /**
   * 移动下拉高亮条目（键盘 ↑↓ 导航），并滚动到可视区。
   * @param {number} delta - 偏移量：+1 下移、-1 上移（循环）
   */
  _moveActive (delta) {
    const n = this._dropItems.length
    if (!n) return
    this._activeIdx = (this._activeIdx + delta + n) % n
    const lis = [...this._list.children]
    lis.forEach((li, i) => li.classList.toggle('active', i === this._activeIdx))
    lis[this._activeIdx]?.scrollIntoView({ block: 'nearest' })
  }

  /**
   * 选定下拉指定索引的条目：提交该行并关闭下拉。
   * @param {number} idx - 下拉条目索引
   */
  _chooseDropItem (idx) {
    const plain = this._dropItems[idx]
    if (!plain) return
    this._commitRow(plain)
    this._closeDrop()
  }

  /**
   * 打开下拉弹层。
   * 宽度策略：按内容自适应（max-content），但不窄于组件本身宽度，
   * 也不超过 min(28rem, 90vw)；对窄列 grid 编辑器尤为重要。
   * 同时设置 preventInitialFocus=true 防止弹层夺走输入框焦点。
   */
  _showDrop () {
    if (this._pop.open) return
    const anchor = this._wrap || this._inp
    /* 弹层宽度与列宽（组件宽）解耦：按内容自适应（max-content），但不窄于组件本身，
       并设上限避免内容过长时撑得过宽。作为窄列 grid 编辑器时尤为重要。 */
    const hostW = Math.round(this.getBoundingClientRect().width) || 0
    try {
      this._pop.style.width = 'max-content'
      this._pop.style.minWidth = hostW > 0 ? `${hostW}px` : '12rem'
      this._pop.style.maxWidth = 'min(28rem, 90vw)'
    } catch (_) {}
    this._pop.placementType = 'Bottom'
    this._pop.placement = 'Bottom'
    // 打开下拉时不抢输入框焦点（否则点一下聚焦立即被弹层夺走，表现为“要点两次”）
    this._pop.preventInitialFocus = true
    this._pop.opener = anchor
    if (typeof this._pop.showAt === 'function') this._pop.showAt(anchor)
    else this._pop.open = true
  }

  /**
   * 关闭下拉弹层。
   * 关闭前先开启抑制窗口，挡掉弹层关闭时焦点回弹到输入框而触发的重开。
   */
  _closeDrop () {
    if (!this._pop) return
    // 关闭时弹层会把焦点交还输入框 → 触发 focus 重开。开一个短抑制窗口挡掉这次回弹。
    this._armSuppress()
    this._pop.open = false
  }

  /** 开启一个短抑制窗口：期间输入框 focus 不重新打开下拉。 */
  _armSuppress () {
    this._suppressOpen = true
    clearTimeout(this._suppressTimer)
    this._suppressTimer = setTimeout(() => { this._suppressOpen = false }, 250)
  }

  // ── help 对话框（三布局） ──────────────────────────────────────────────────

  /**
   * 打开 help（值帮助）对话框。
   * 按 helpLayout 三种布局组装对话框内容：
   *   - 'classify'：左分类树 + 右字典 grid
   *   - 'group'：   左分组树 + 右字典 grid
   *   - 'grid'：    仅字典 grid（分级时为 treegrid）
   * 派发 cmx-dict-help 事件。用户确认且选中行后，提交该行到本组件。
   * @returns {Promise<import('../lib/cmx-row-set.js').CmxRowSet|null>}
   *   确认并选中时返回选中行（CmxRowSet），取消 / 未选时返回 null
   */
  async openHelp () {
    // 打开对话框前先收起下拉，避免下拉浮层盖住对话框
    this._closeDrop()
    const layout = this._cfg.helpLayout || 'grid'
    const dlg = document.createElement('cmx-floating-dialog')
    dlg.configure({
      title: this._cfg.dictTitle || '选择' + (this._cfg.dictCode || '字典'),
      icon: 'value-help',
      confirmText: '确定',
      cancelText: '取消',
      // 弹框尺寸：优先用 configure 传入的 helpDialogWidth/Height（支持百分比等任意 CSS 值），
      // 缺省回退到原固定值（grid 720px / classify·group 900px × 560px）。
      dialogWidth: this._cfg.helpDialogWidth || (layout === 'grid' ? '720px' : '900px'),
      dialogHeight: this._cfg.helpDialogHeight || '560px',
    })

    const grid = this._buildHelpGrid()
    this.dispatchEvent(new CustomEvent('cmx-dict-help', { bubbles: true, composed: true, detail: { layout } }))

    if (layout === 'classify' || layout === 'group') {
      const treeSrc = layout === 'classify' ? this._cfg.classifyTreeSource : this._cfg.groupTreeSource
      const left = this._buildHelpTree(treeSrc, grid, layout)
      dlg.setLeftRight(left, this._wrapWithSearch(grid, 'grid'), {
        leftLabel: layout === 'classify' ? '分类' : '分组',
        leftIcon: layout === 'classify' ? 'tree' : 'group-2',
        rightLabel: '字典数据',
        rightIcon: 'table-view',
      })
    } else {
      dlg.setSingleRegion(this._wrapWithSearch(grid, 'grid'), { label: '字典数据', icon: 'table-view' })
    }

    document.body.appendChild(dlg)
    // 初次加载全量（无分类/分组过滤）
    this._loadHelpGrid(grid, {})

    const result = await dlg.openModal()
    if (result.action === 'confirm') {
      const ids = grid.getSelectedIds?.() || []
      const id = ids[0]
      if (id != null) {
        // getSource() 返回普通行对象数组（非 DataSet），按 id 找当前选中行
        const rows = grid.getSource?.() || []
        const idCol = this._cfg.idCol
        const plain = rows.find((r) => String(r[idCol] ?? r.id ?? '') === String(id))
        if (plain) { this._commitRow(plain); return this.getSelectedRow() }
      }
    }
    return null
  }

  /**
   * 构造 help 对话框内的字典 grid（cmx-revo-grid）。
   * 应用列模型，并按 hierarchical 配置切换 treeMode（分级时启用树形）。
   * @returns {HTMLElement} 配置好的 cmx-revo-grid 元素
   */
  _buildHelpGrid () {
    const grid = document.createElement('cmx-revo-grid')
    grid.setAttribute('data-cmx-embed', '')
    const model = this._asColumnModel()
    if (model) grid.setColumnModel(model)
    // 选择记录的帮助弹框不需要底部「合计」汇总行（选单条记录时求和无意义）
    grid.setOptions?.({ treeMode: !!this._cfg.hierarchical, parentField: this._cfg.parentCol, idField: this._cfg.idCol, showTotals: false })
    return grid
  }

  /**
   * 构造 help 对话框左侧的分类 / 分组树（cmx-web-treeview）。
   * 异步加载树节点；选中节点时按 path（优先）或 id 过滤右侧 grid。
   * 最终包一层顶部搜索框返回。
   * @param {Object} treeSrc - 树数据源（{ search(q) }）
   * @param {HTMLElement} grid - 右侧 grid，节点选中时驱动其过滤
   * @param {('classify'|'group')} layout - 当前布局，作为过滤参数 key
   * @returns {HTMLElement} 包了搜索框的树容器
   */
  _buildHelpTree (treeSrc, grid, layout) {
    const tree = document.createElement('cmx-web-treeview')
    // 告诉 web-treeview 用哪些字段做 id / 层级路径 / 显示文本（节点数据形如 { id, path, name }）
    tree.setAttribute('id-member', 'id')
    tree.setAttribute('path-member', 'path')
    tree.setAttribute('display-value-member', 'name')
    tree.setAttribute('expand-level', '3')
    tree.style.cssText = 'display:block;width:100%;height:100%;'
    const treeDs = new CmxDataSet({ datasetId: `dict-help-${layout}-tree` })
    Promise.resolve()
      .then(() => (treeSrc && typeof treeSrc.search === 'function') ? searchAsync(treeSrc, '') : [])
      .then((nodes) => {
        treeDs.setRows(Array.isArray(nodes) ? nodes : [])
        tree.setDataSet(treeDs)
      })
      .catch(() => {})
    // 选中分类/分组节点 → 过滤右侧 grid（优先用 path 支持子树前缀匹配，兼容多种 detail 形状）
    tree.addEventListener('node-clicked', (e) => {
      const d = e.detail || {}
      const node = d.node || d.data || d.node?.data || d
      const pathVal = node?.path ?? node?.data?.path ?? d.path
      const nid = d.id ?? node?.id ?? node?.data?.id
      const val = pathVal ?? nid
      if (val != null) this._loadHelpGrid(grid, { [layout]: val })
    })
    return this._wrapWithSearch(tree, 'tree')
  }

  /** 给 tree / grid 包一层顶部搜索框。 */
  _wrapWithSearch (inner, kind) {
    const box = document.createElement('div')
    box.style.cssText = 'display:flex;flex-direction:column;height:100%;min-height:0'
    const search = document.createElement('ui5-input')
    search.setAttribute('placeholder', kind === 'tree' ? '搜索节点' : '搜索字典')
    search.style.cssText = 'flex:0 0 auto;margin:4px'
    const body = document.createElement('div')
    body.style.cssText = 'flex:1 1 auto;min-height:0;overflow:hidden'
    body.appendChild(inner)
    box.append(search, body)
    let timer = null
    search.addEventListener('input', () => {
      clearTimeout(timer)
      const q = String(search.value || '').trim()
      timer = setTimeout(() => {
        if (kind === 'grid') this._loadHelpGrid(inner, { keyword: q })
        else inner.filterNodes?.(q)
      }, 250)
    })
    return box
  }

  /**
   * 异步加载 help grid 数据。
   * 用 dataSource.search 拉取，按 idCol 重塑行 id（避免 CmxDataSet 生成随机占位 id），
   * 否则 getSelectedIds() 返回的随机 id 与原 idCol 不匹配 → 选中行找不到。
   * @param {HTMLElement} grid - cmx-revo-grid 元素
   * @param {{ keyword?: string, classify?: string, group?: string }} filter - 过滤参数
   * @returns {Promise<void>}
   */
  async _loadHelpGrid (grid, filter) {
    const src = this._cfg.dataSource
    if (!src || typeof src.search !== 'function') return
    try {
      const items = await searchAsync(src, filter.keyword || '', { ...filter })
      const ds = new CmxDataSet({ datasetId: 'dict-help-grid' })
      // 按 idCol 重塑行 id，避免 CmxDataSet.addRow 生成随机占位 id（r${随机}）。
      // 否则 help grid 的 getSelectedIds() 返回随机 id，与 r[idCol] 不匹配 → 选中行找不到 → 不派发事件。
      const idCol = this._cfg.idCol || 'id'
      const fixed = (Array.isArray(items) ? items : []).map((r) => ({ ...r, id: r[idCol] ?? r.id }))
      ds.setRows(fixed)
      grid.setDataSet(ds)
    } catch { /* ignore */ }
  }

  // ── 数据/工具 ──────────────────────────────────────────────────────────────

  /**
   * 把 _cfg.columns 规范化为 CmxColumnModel（help grid 用）。
   * - 未配置 columns：用 idCol + labelCol 生成默认两列（ID + 名称）；
   * - 已是 CmxColumnModel：原样返回；
   * - 描述符数组：逐个转 CmxColumn 后构造 CmxColumnModel。
   * @returns {CmxColumnModel} 列模型
   */
  _asColumnModel () {
    const cols = this._cfg.columns
    const asColumn = (col) => {
      if (!col || typeof col.toDescriptor === 'function') return col
      return new CmxColumn({
        id: col.id ?? col.key ?? col.field ?? '',
        caption: col.caption ?? col.label ?? col.name ?? col.id ?? col.key ?? '',
        type: col.type ?? 'text',
        width: col.width,
        align: col.align,
        editMode: col.editMode ?? col.mode,
        editSettings: col.editSettings,
        visible: col.visible,
      })
    }
    if (!cols) {
      return new CmxColumnModel({
        caption: this._cfg.dictCode,
        members: [
          new CmxColumn({ id: this._cfg.idCol, caption: 'ID', type: 'text', width: 140 }),
          new CmxColumn({ id: this._cfg.labelCol, caption: '名称', type: 'text' }),
        ],
      })
    }
    if (cols instanceof CmxColumnModel) return cols
    return new CmxColumnModel({ caption: this._cfg.dictCode, members: (Array.isArray(cols) ? cols : []).map(asColumn).filter(Boolean) })
  }

  /** 把普通行对象登记进 innerDs，返回对应 CmxRowSet。 */
  _ingest (plain) {
    const id = String(plain[this._cfg.idCol] ?? plain.id ?? '')
    if (!id) return null
    const existing = this._innerDs.getRow(id)
    if (existing) {
      // 内部缓存行，直接覆盖字段即可，无需走 setValues 的变更通知（无人监听，且会触发 _notifyChange）
      for (const [k, v] of Object.entries(plain)) {
        if (k !== '_children' && k !== '_ds') existing[k] = v
      }
      return existing
    }
    return this._innerDs.addRow({ ...plain })
  }

  /** 提交一个选中行（来自下拉 / help）：登记、记 MRU、更新显示、派发事件。 */
  _commitRow (plain) {
    const row = this._ingest(plain)
    if (!row) return
    this._value = String(row[this._cfg.idCol] ?? row.id ?? '')
    this._displayText = this._labelOf(row)
    this._syncInputText()
    this._mru?.add(plain)
    this._emitChange()
  }

  /**
   * 计算行对象的显示文本。
   * 规则：取 labelCol 列值；若配置了 codeCol 且非空，显示「编码-名称」。
   * @param {Object} row - 行对象（CmxRowSet 或普通对象）
   * @returns {string} 显示文本（无值时返回 ''）
   */
  _labelOf (row) {
    if (row == null) return ''
    const name = String(row[this._cfg.labelCol] ?? row.name ?? row[this._cfg.idCol] ?? '')
    const codeCol = this._cfg.codeCol
    if (codeCol) {
      const code = row[codeCol]
      // 设置了编码列：显示「编码-名称」（编码为空时退化为仅名称）
      if (code != null && String(code) !== '') return `${code}-${name}`
    }
    return name
  }

  /**
   * 派发 cmx-dict-change 事件。
   * detail 同时携带：id、row（CmxRowSet）、plain（纯对象快照，供回写宿主 DataSet）、
   * text（显示文本）、dictCode、idCol。
   * 事件 bubbles + composed，可穿透 shadow 边界。
   */
  _emitChange () {
    const row = this.getSelectedRow()
    // plain：选中行的纯对象快照（含字典所有列），供字段编辑器把各列回写到宿主 CmxDataSet
    const plain = row ? (typeof row.toPlainObject === 'function' ? row.toPlainObject() : { ...row }) : null
    this.dispatchEvent(new CustomEvent('cmx-dict-change', {
      bubbles: true,
      composed: true,
      detail: {
        id: this._value,
        row,
        plain,
        text: this._displayText,
        dictCode: this._cfg.dictCode,
        idCol: this._cfg.idCol,
      },
    }))
  }

  /**
   * 按 _cfg.dictCode 重建 MRU 管理器（无 dictCode 时置空）。
   * 兼容 personalizationService 的两种形态：
   *   - 函数：作为工厂交给 createMruServiceFromPageService 包装；
   *   - 对象（含 load/save）：直接当 service 用。
   */
  _rebuildMru () {
    if (!this._cfg.dictCode) { this._mru = null; return }
    let service = null
    const ps = this._cfg.personalizationService
    if (ps && typeof ps === 'function') service = createMruServiceFromPageService(ps)
    else if (ps && (ps.load || ps.save)) service = ps
    this._mru = new CmxDictMru({
      dictCode: this._cfg.dictCode,
      idCol: this._cfg.idCol,
      max: this._cfg.mruMax,
      service,
    })
  }

  /**
   * 从标签属性读取配置到 _cfg（仅当属性存在时覆盖）。
   * 布尔类属性（show-clear / hierarchical）按 'false' 字符串判定为关闭；
   * readonly / disabled 为存在即生效。
   */
  _readAttributes () {
    const a = (n) => this.getAttribute(n)
    if (a('dict-code') != null) this._cfg.dictCode = a('dict-code')
    if (a('id-col') != null) this._cfg.idCol = a('id-col')
    if (a('label-col') != null) this._cfg.labelCol = a('label-col')
    if (a('code-col') != null) this._cfg.codeCol = a('code-col')
    if (a('parent-col') != null) this._cfg.parentCol = a('parent-col')
    if (a('placeholder') != null) this._cfg.placeholder = a('placeholder')
    if (a('help-layout') != null) this._cfg.helpLayout = a('help-layout')
    if (this.hasAttribute('show-clear')) this._cfg.showClear = a('show-clear') !== 'false'
    if (this.hasAttribute('hierarchical')) this._cfg.hierarchical = a('hierarchical') !== 'false'
    if (this.hasAttribute('readonly')) this._cfg.readonly = true
    if (this.hasAttribute('disabled')) this._cfg.disabled = true
  }
}

if (!customElements.get('cmx-dict-select')) {
  customElements.define('cmx-dict-select', CmxDictSelect)
}
