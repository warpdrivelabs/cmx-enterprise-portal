/**
 * <cmx-ui5-form> — 基于 UI5 Form 的单行编辑表单组件。
 *
 * @component
 * @fires cmx-ui5-form-changed - 字段值变更，detail: { key, value, row }
 * @fires cmx-ui5-form-invalid - validate() 校验失败，detail: { errors:[{key,label,message}], row }
 *
 * 标签属性（声明式 data-*，connectedCallback 解析；无 observedAttributes）：
 * @prop {string} data-cmx-model-id - 关联的 CmxColumnModel id（字段定义唯一入口）
 * @prop {string} [data-cmx-layout] - 列布局，例 'S1 M2 L3 XL3'
 * @prop {string} [data-cmx-header] - 表单标题
 * @prop {object} [data-cmx-sources] - JSON 数据源集
 * @prop {object} [data-cmx-row] - JSON 绑定的单行对象
 * @prop {string} [data-cmx-skin] - 皮肤：'neo' | 'plain' | 'default' | 'none'
 * @prop {string} [data-cmx-skin-tone] - Neo 皮肤强调色，例 'mint'
 * @prop {string} [data-cmx-style-id] - 同页 <template> 覆盖样式 id
 * @prop {string} [data-cmx-density] - 'compact' 启用紧凑密度
 * @prop {string} [data-neo-form-lane] - 旧版页面自行注入皮肤，跳过全局默认
 *
 * 能力：
 *   - 字段定义只能来自 CmxColumnModel（setColumnModel / data-cmx-model-id）
 *   - 字段类型：text / number / select / readonly / date / textarea / checkbox
 *   - 响应式列布局（基于 ui5-form 的 layout）
 *   - 字段联动（onChange + dependents）
 *
 * 事件：
 *   - cmx-ui5-form-changed   { detail: { key, value, row } }
 *   - cmx-ui5-form-invalid   { detail: { errors:[{key,label,message}], row } }   validate() 失败时
 *
 * API：
 *   setColumnModel(model)    // 唯一的字段定义入口（声明式用 data-cmx-model-id）
 *   setLayout(layout)        // 例: 'S1 M2 L3 XL3'
 *   setHeaderText(text)
 *   setDataSet(dsOrRow, opts?) // 绑定 CmxDataSet 或单行对象
 *   getData()                // 浅拷贝返回当前 row
 *   setSkinStyles(cssText)   // 注入页面级皮肤 CSS
 *
 * 外观：
 *   未设置 data-cmx-skin 时默认 Neo（可由 globalThis.__cmxDefaultFormSkin 覆盖，门户默认为 neo）
 *   data-cmx-skin="plain" | "default" | "none" — 使用经典 UI5 样式
 *   data-cmx-skin="neo" — 显式 Neo 皮肤
 *   data-cmx-skin-tone="mint" — Neo 薄荷色强调
 *   data-cmx-style-id — 同页 <template> 注入覆盖样式
 *   data-neo-form-lane — 旧版 trade/voucher-neo 页自行注入皮肤，跳过全局默认
 */
import '@ui5/webcomponents/dist/Form.js'
import { CmxColumnAdapter, formatByPreset } from '../lib/cmx-column-adapter.js'
import '@ui5/webcomponents/dist/FormGroup.js'
import '@ui5/webcomponents/dist/FormItem.js'
import '@ui5/webcomponents/dist/Label.js'
import '@ui5/webcomponents/dist/Input.js'
import '@ui5/webcomponents/dist/Select.js'
import '@ui5/webcomponents/dist/Option.js'
import '@ui5/webcomponents/dist/ComboBox.js'
import '@ui5/webcomponents/dist/ComboBoxItem.js'
import '@ui5/webcomponents/dist/SuggestionItem.js'
import '@ui5/webcomponents/dist/DatePicker.js'
import '@ui5/webcomponents/dist/TextArea.js'
import '@ui5/webcomponents/dist/CheckBox.js'
import { searchAsync, debounceForSource, lookupByKeyAsync } from '../lib/cmx-async-source.js'
import { invokePreset } from '../lib/cmx-column-presets.js'
import { getFieldType } from '../lib/cmx-form-field-registry.js'
import { evalFormula } from '../lib/formula-eval.js'
import { CMX_FORM_NEO_SKIN_CSS } from '../lib/cmx-form-neo-skin.js'
import { setSkinStyle, applyNeoSkin, applyPageStyleId } from '../lib/cmx-skin-runtime.js'

const DEFAULT_LAYOUT = 'S1 M2 L3 XL3'

export class CmxUi5Form extends HTMLElement {
  constructor() {
    super()
    /** @type {object[]} 扁平化的字段定义数组（叶字段，由 setColumnModel 应用；读写值使用） */
    this._fields = []
    /** @type {string} 列布局字符串，例 'S1 M2 L3 XL3'（响应式，S/M/L/XL 四档断点列数） */
    this._layout = DEFAULT_LAYOUT
    /** @type {string} 表单标题文本（渲染到 ui5-form 的 header-text） */
    this._headerText = ''
    /** @type {string} 分组渲染样式：card=卡片分区（默认），bar=色条+下分隔线。仅分组模式（CmxColumnGroup）生效 */
    this._groupStyle = 'card'
    /**
     * 字段流向：'row'=行优先（从左到右再换行，自建 CSS Grid 接管，绕开 ui5-form 的 column-count 列优先）；
     *           'col'=列优先（原 ui5-form standaloneItemsLayout 报纸式多列）。
     * 默认 'row'：末位字段不再落单最右列。个别页面可 data-cmx-flow="col" 回退。
     */
    this._flow = 'row'
    /** @type {object} 当前绑定的单行数据对象（普通对象或 CmxRow 代理） */
    this._row = {}
    /** @type {object|null} 绑定的 CmxDataSet 实例（setDataSet 传入时存在，监听其 cursor/row 变化） */
    this._ds  = null
    /**
     * 每个字段的渲染句柄缓存：key → { item, editor, label, field, _optEls, _lastRaw }
     * - item:   ui5-form-item 容器
     * - editor: 字段对应的输入控件（ui5-input / ui5-select / span 等）
     * - label:  ui5-label 元素
     * - field:  原始字段定义
     * - _optEls: select 类编辑器缓存的 ui5-option 列表（避免重复 querySelectorAll）
     * - _lastRaw: _writeOne 的脏检查缓存（上次写入的原始值，相同则跳过避免重置光标）
     * @type {Map<string, { item: HTMLElement, editor: HTMLElement, label: HTMLElement, field: object, _optEls?: HTMLElement[], _lastRaw?: any }>}
     */
    this._cells = new Map()
    /** @type {Map<string, object>} 组件级局部数据源（id → ds），优先级高于协调器级 provider */
    this._localDataSources = new Map()
    /** @type {Function|null} 数据源解析器（由协调器注入：传入 id 返回 ds 实例） */
    this._dsProvider = null
    /** @type {boolean} 表单整体编辑状态（字段自身 readonly 仍优先；false 时全部只读） */
    this._editable = true
    // —— 以下字段由各生命周期/方法在运行时挂载，不在 constructor 初始化 ——
    /** @type {HTMLElement|null} Shadow DOM 内的表单根（col 模式为 <ui5-form>；row 模式为 .cmx-form-row grid div） */
    // this._form
    /** @type {object|null} 绑定的 CmxColumnModel 实例（setColumnModel 时缓存，用于语言切换重解析） */
    // this._boundColModel
    /** @type {Function|null} columns-changed 监听器（model 动态换列时重渲染） */
    // this._boundColModelListener
    /** @type {object[]|null} 树形字段（含分组节点）；无分组时为 null，回退用 _fields */
    // this._fieldTree
    /** @type {Function|null} ds 的 cursor-changed 监听（游标切换→换行刷新） */
    // this._cursorListener
    /** @type {Function|null} ds 的 row-changed 监听（同行字段值变化→回写） */
    // this._rowChangedListener
    /** @type {Function|null} 共享运行时语言切换监听（语言变化→重解析 caption） */
    // this._onLanguageChange
  }

  /**
   * 首次插入文档时执行：一次性创建 Shadow DOM、写入基础样式与模板、应用皮肤、渲染字段，
   * 再解析 data-cmx-* 声明式属性。重插入（shadowRoot 已存在）时直接复用，不重建。
   * 同时补注册 ds 游标监听（重插入场景）与共享运行时语言切换监听。
   */
  connectedCallback() {
    if (this.shadowRoot) return
    try {
      this.attachShadow({ mode: 'open' })
      this.shadowRoot.innerHTML = `<style id="cmx-form-base">${this._styles()}</style>${this._template()}`
      this._formRoot = this.shadowRoot.getElementById('form-root')
      this._applySkin()
      this._render()
      this._bootstrapFromAttributes()
    } catch (err) {
      console.error(`[${this.tagName}] connect failed`, err)
    }
    // 重插入场景：ds 仍在但 disconnectedCallback 已解绑 cursor 监听
    if (this._ds && !this._cursorListener) {
      this._registerCursorListener(this._ds)
    }
    /* 界面语言变更：字段 label（caption）可能是多语言对象。只按新语言重解析 caption 并就地
       改 label.textContent，不重建字段——保留编辑器实例/焦点/值，开销最小。
       语言 API 由共享运行时暴露（不能直接 import UI5 dist）。 */
    if (!this._onLanguageChange) {
      this._onLanguageChange = () => this._relabelFromModel()
      const rt = globalThis.__cmxUi5
      if (rt && typeof rt.attachLanguageChange === 'function') {
        rt.attachLanguageChange(this._onLanguageChange)
      }
    }
  }

  /** 语言切换后：从绑定的列模型按当前语言重解析各字段 caption，就地更新 label 文本（不重建字段）。 */
  _relabelFromModel() {
    const model = this._boundColModel
    if (!model || typeof model.toDescriptors !== 'function') return
    const flat = CmxColumnAdapter._flatDescriptors(model.toDescriptors())
    const byId = new Map(flat.map((d) => [d.id, d]))
    for (const [key, cell] of this._cells) {
      const d = byId.get(key)
      if (d && cell.label && d.caption != null) cell.label.textContent = String(d.caption)
    }
  }

  /**
   * 从文档移除时解绑所有外部监听，避免内存泄漏：
   * - CmxDataSet 的 cursor-changed / row-changed
   * - CmxColumnModel 的 columns-changed
   * - 共享运行时语言切换
   */
  disconnectedCallback() {
    if (this._ds && this._cursorListener) {
      this._ds.removeEventListener('cursor-changed', this._cursorListener)
      this._cursorListener = null
    }
    if (this._ds && this._rowChangedListener) {
      this._ds.removeEventListener('row-changed', this._rowChangedListener)
      this._rowChangedListener = null
    }
    if (this._boundColModel && this._boundColModelListener) {
      this._boundColModel.removeEventListener('columns-changed', this._boundColModelListener)
      this._boundColModelListener = null
    }
    if (this._onLanguageChange) {
      const rt = globalThis.__cmxUi5
      if (rt && typeof rt.detachLanguageChange === 'function') rt.detachLanguageChange(this._onLanguageChange)
      this._onLanguageChange = null
    }
  }

  /**
   * 解析 data-cmx-* attribute（JSON 字符串）→ 调用对应 setter。
   *   data-cmx-layout  → setLayout (字符串，不 JSON.parse)
   *   data-cmx-header  → setHeaderText (字符串)
   *   data-cmx-sources → setDataSources
   *   data-cmx-row     → setDataSet
   *   （字段定义不在此解析：只能经 setColumnModel / data-cmx-model-id）
   */
  _bootstrapFromAttributes() {
    const parseJson = (k) => {
      if (!this.hasAttribute(k)) return undefined
      try { return JSON.parse(this.getAttribute(k)) }
      catch (e) { console.warn(`[cmx-ui5-form] failed to parse ${k}:`, e?.message || e); return undefined }
    }
    if (this.hasAttribute('data-cmx-layout'))  this.setLayout(this.getAttribute('data-cmx-layout'))
    if (this.hasAttribute('data-cmx-header'))  this.setHeaderText(this.getAttribute('data-cmx-header'))
    if (this.hasAttribute('data-cmx-group-style')) this.setGroupStyle(this.getAttribute('data-cmx-group-style'))
    if (this.hasAttribute('data-cmx-flow')) this.setFlow(this.getAttribute('data-cmx-flow'))
    const sources = parseJson('data-cmx-sources')
    const row     = parseJson('data-cmx-row')
    if (sources) this.setDataSources(sources)
    if (row)     this.setDataSet(row)
    // 字段定义只能来自 CmxColumnModel（init-page-models 按 data-cmx-model-id 调 setColumnModel）。
  }

  /**
   * 注入页面级或内置皮肤 CSS（作用于 Shadow DOM 内 ui5-form）。
   * @param {string} cssText
   * @param {'neo'|'page'|'custom'} [layer]
   */
  setSkinStyles (cssText, layer = 'custom') {
    setSkinStyle(this.shadowRoot, 'cmx-form', cssText, layer)
    return this
  }

  /**
   * 应用皮肤：根据 data-cmx-skin / data-cmx-skin-tone / globalThis.__cmxDefaultFormSkin
   * 决定是否注入 Neo 皮肤 CSS（默认 neo）。data-neo-form-lane 存在时跳过全局默认注入
   *（旧版页面自行注入皮肤）。最后调用 _applyPageStyleId 处理页面级覆盖样式。
   */
  _applySkin () {
    if (!this.hasAttribute('data-neo-form-lane')) {
      applyNeoSkin({
        host: this,
        shadow: this.shadowRoot,
        idBase: 'cmx-form',
        neoCss: CMX_FORM_NEO_SKIN_CSS,
        globalKey: '__cmxDefaultFormSkin',
        activeClass: 'cmx-form-neo',
        toneClass: (tone) => (tone === 'mint' ? 'cmx-form-neo--mint' : null),
      })
    }
    this._applyPageStyleId()
  }

  /**
   * 读取 data-cmx-style-id 指向的同页 <template>/<style> 节点的 CSS，作为页面级覆盖样式注入
   *（layer='page'）。优先在根节点查找，回退 document。
   */
  _applyPageStyleId () {
    applyPageStyleId(this, this.shadowRoot, 'cmx-form')
  }

  /**
   * 生成 Shadow DOM 基础样式（:host / ui5-form / 字段项 / 只读态等）。
   * data-cmx-density='compact' 时启用紧凑密度（更小字号/行高/内边距、固定 label 列宽）。
   * @returns {string} 注入到 <style id="cmx-form-base"> 的 CSS 文本
   */
  _styles() {
    const compact = this.getAttribute('data-cmx-density') === 'compact'
    return `
      :host { display: block; }
      .cmx-field-invalid { outline: 1px solid var(--sapNegativeColor,#bb0000); border-radius: 2px; }
      ui5-form {
        width: 100%;
        --_ui5_input_readonly_border: 0 solid transparent;
        --_ui5_input_readonly_border_color: transparent;
        --_ui5_textarea_readonly_border_style: none;
        --sapField_ReadOnly_BorderColor: transparent;
        --sapField_ReadOnly_BorderStyle: none;
        --ui5-v2-form-vertical-spacing: ${compact ? '0' : '0.25rem'};
        --ui5-v2-form-item-spacing: ${compact ? '0' : '0.25rem'};
        ${compact ? '--ui5-form-item-label-padding: 0; --ui5-form-item-layout: var(--cmx-form-label-w, 6.5rem) 1fr 0fr;' : ''}
      }
      ui5-form::part(header) {
        padding: 0 0 0.25rem;
        font-size: 0.85rem;
      }
      /* 分组容器（groupStyle）：分组模式每分组一个 ui5-form + 外层 div 控制 card/bar 视觉 */
      .cmx-form-group { margin-bottom: 0.4rem; }
      .cmx-form-group > ui5-form { width: 100%; }
      /* card：对齐 cr-form「关键信息卡片」(.sec) 样式——UI5 主题变量，暗/亮自适应，边框/背景/标题栏标准协调 */
      .cmx-form-group-card { border: 1px solid var(--sapGroup_ContentBorderColor, #e0e0e0); border-radius: 6px; overflow: hidden; background: var(--sapList_Background, #fff); }
      .cmx-form-group-card > ui5-form::part(header) { padding: 6px 10px; margin: 0; background: var(--sapGroup_TitleBackground, transparent); border-bottom: 1px solid var(--sapGroup_ContentBorderColor, #e0e0e0); font-weight: 700; color: var(--sapTitleColor); font-size: 0.95rem; }
      .cmx-form-group-card > ui5-form::part(layout) { padding: 8px 10px; }
      /* bar：左色条 + 标题加粗 + 字段区下分隔线（轻量，无外框） */
      .cmx-form-group-bar > ui5-form::part(header) { padding: 2px 0 2px 10px; margin: 0 0 4px; border-left: 3px solid var(--sapButton_Emphasized_Background,#0a6ed1); font-weight: 700; color: var(--sapTitleColor); font-size: 0.95rem; }
      .cmx-form-group-bar > ui5-form::part(layout) { padding: 4px 0 6px; border-bottom: 1px solid var(--sapGroup_ContentBorderColor, #e0e0e0); }
      /* UI5 ui5-form-layout(dl) 默认 padding:16px 12px,内部上下左右留白过大；收紧。compact 更紧。 */
      ui5-form::part(layout) { padding: ${compact ? '2px 4px' : '4px 8px'}; }
      ui5-form-item::part(root) { min-height: ${compact ? '0' : '1.75rem'}; }
      ui5-form-item::part(layout) { align-items: center; }
      /* content(dd) 默认 content-box + width:100% + padding:0 .25rem——宽不含 padding，
         border-box 总宽超出 grid 轨道（每列 ~8px），把表单整体撑出容器 ~2px 横向溢出。 */
      ui5-form-item::part(content) { display: flex; align-items: center; box-sizing: border-box; }
      ui5-form-item::part(content) .ui5-form-item-content-child { display: flex; align-items: center; min-height: var(--_ui5_input_height, 1.9rem); }
      ${compact ? `
      ui5-label { font-size: 0.875rem; line-height: 1.2; }
      ui5-form-item ui5-input,
      ui5-form-item cmx-dict-select,
      ui5-form-item ui5-select {
        --_ui5_input_height: 1.625rem;
        font-size: 0.875rem;
      }
      ui5-form-item ui5-date-picker {
        --_ui5_input_height: var(--cmx-form-date-picker-height, 1.75rem);
        --_ui5_input_min_width: 0;
        min-height: var(--cmx-form-date-picker-height, 1.75rem);
        font-size: 0.875rem;
      }
      ` : ''}
      /* 只读文本（edit.mode=none / readonly）：宽度撑满、文字溢出省略；
         font-size/line-height 不在此覆盖——由默认样式或 neo skin 与 ui5-label 对齐。 */
      .readonly-display {
        width: 100%;
        box-sizing: border-box;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      ui5-form-item ui5-date-picker,
      ui5-form-item ui5-input,
      ui5-form-item cmx-dict-select,
      ui5-form-item ui5-select,
      ui5-form-item ui5-combobox,
      ui5-form-item ui5-textarea {
        width: 100%;
        min-width: 0;
        box-sizing: border-box;
      }
      ui5-form-item ui5-select,
      ui5-form-item ui5-date-picker,
      ui5-form-item ui5-combobox {
        /* 弹层背景跟随 UI5 主题：popover→list→group 链式回退，最末才用主题的 sapBaseColor，
           不再硬编码 var(--sapList_Background, #ffffff)（否则暗色主题下下拉/日历弹层会变白底）。 */
        --sapList_Background: var(--sapPopover_Background, var(--sapList_Background, var(--sapGroup_ContentBackground, var(--sapBaseColor))));
        --sapList_HeaderBackground: var(--sapPopover_Background, var(--sapList_HeaderBackground, var(--sapGroup_ContentBackground, var(--sapBaseColor))));
      }
      ui5-form-item ui5-date-picker {
        display: block;
        --_ui5_input_height: var(--cmx-form-date-picker-height, 1.75rem);
        --_ui5_input_min_width: 0;
        min-height: var(--cmx-form-date-picker-height, 1.75rem);
      }
      ui5-form-item ui5-date-picker::part(input) {
        width: 100%;
        min-width: 0;
      }
      ui5-form-item ui5-input[readonly],
      ui5-form-item ui5-combobox[readonly],
      ui5-form-item ui5-date-picker[readonly],
      ui5-form-item ui5-textarea[readonly],
      ui5-form-item ui5-select[disabled],
      ui5-form-item ui5-combobox[disabled] {
        --_ui5_input_readonly_border: none;
        --_ui5_input_readonly_border_color: transparent;
        --_ui5_textarea_readonly_border_style: none;
        --sapField_ReadOnly_BorderColor: transparent;
        --sapField_ReadOnly_BorderStyle: none;
        --ui5_input_focus_pseudo_element_content: none;
        --_ui5_textarea_focus_pseudo_element_content: none;
        --_ui5_input_focus_outline_color: transparent;
        --_ui5_textarea_focus_outline_color: transparent;
        border: none;
        box-shadow: none;
      }
      .readonly-display {
        display: inline-block;
        min-height: 1.5rem;
        padding: 2px 4px;
        color: var(--sapTextColor);
        display: inline-flex;
        align-items: center;
      }
      .readonly-display.placeholder {
        color: var(--sapField_PlaceholderTextColor);
        font-style: italic;
      }
      /* 必填星号前置（_renderFieldInto 插入，替代 ui5-label[required] 的后置伪元素星号）：
         颜色/字重对齐 UI5 required 规范；line-height:0 + middle 对齐，不撑 label 行高。 */
      .cmx-label-star {
        color: var(--sapField_RequiredColor);
        font-size: var(--sapFontLargeSize);
        font-weight: bold;
        line-height: 0;
        vertical-align: middle;
        padding-inline-end: 0.125rem;
      }

      /* —— row 流向：行优先 CSS Grid（绕开 ui5-form column-count 列优先）——
         :host 建立 container context；@container 按表单宽度切列数（对齐 UI5 599/1023/1439px 断点）。
         列数由 --cmx-flow-cols-{s/m/l/xl} 驱动（setLayout→_applyFlowCols 写入）。 */
      :host { container-type: inline-size; }
      .cmx-form-row {
        display: grid;
        grid-auto-flow: row;
        gap: 0.25rem 1rem;
        grid-template-columns: repeat(var(--cmx-flow-cols, 3), minmax(0, 1fr));
        width: 100%;
      }
      /* row 模式下 ui5-form-item 是 grid 直接子项：跨列字段用 grid-column:span N（_renderFieldInto 设）。
         label 列宽不在此覆盖——沿用 UI5 默认比例布局（4fr 8fr 0fr，随列宽伸缩），长 label 不截断；
         compact 密度才由 _renderFieldInto 内联固定 label 列宽（--cmx-form-label-w，6.5rem），与 col 模式一致。 */
      .cmx-form-row > ui5-form-item { min-width: 0; }
      /* row 模式分组标题（col 模式用 ui5-form::part(header)；row 模式无 ui5-form，用普通 div）。 */
      .cmx-form-row-title {
        padding: 2px 0 2px 10px; margin: 0 0 4px;
        font-weight: 700; color: var(--sapTitleColor); font-size: 0.95rem;
      }
      .cmx-form-group-card > .cmx-form-row-title {
        padding: 6px 10px; margin: 0;
        background: var(--sapGroup_TitleBackground, transparent);
        border-bottom: 1px solid var(--sapGroup_ContentBorderColor, #e0e0e0);
      }
      .cmx-form-group-bar > .cmx-form-row-title {
        border-left: 3px solid var(--sapButton_Emphasized_Background, #0a6ed1);
      }
      .cmx-form-group-card .cmx-form-row { padding: 8px 10px; }
      .cmx-form-group-bar .cmx-form-row { padding: 4px 0 6px; border-bottom: 1px solid var(--sapGroup_ContentBorderColor, #e0e0e0); }
      /* 响应式列数：@container 按表单宽度选断点列数变量（fallback 对齐 DEFAULT_LAYOUT = S1 M2 L3 XL3）。 */
      @container (max-width: 599px) { .cmx-form-row { --cmx-flow-cols: var(--cmx-flow-cols-s, 1); } }
      @container (min-width: 600px) and (max-width: 1023px) { .cmx-form-row { --cmx-flow-cols: var(--cmx-flow-cols-m, 2); } }
      @container (min-width: 1024px) and (max-width: 1439px) { .cmx-form-row { --cmx-flow-cols: var(--cmx-flow-cols-l, 3); } }
      @container (min-width: 1440px) { .cmx-form-row { --cmx-flow-cols: var(--cmx-flow-cols-xl, 3); } }
      /* S 断点对齐 UI5 S12 行为：label 独占一行在上（左对齐）、输入框整行在下；
         单列时跨列字段收回 auto——grid-column:span N 在 1 列 grid 会建隐式列轨横向溢出，!important 压过内联 span。 */
      @container (max-width: 599px) {
        .cmx-form-row > ui5-form-item {
          grid-column: auto !important;
          --ui5-form-item-layout: 1fr;
          --ui5-form-item-label-justify: start;
          --ui5-form-item-label-padding: 0.625rem 0.25rem 0 0.25rem;
        }
      }
    `
  }

  /**
   * 生成 Shadow DOM 初始模板：容器 div（_render 按扁平/分组动态创建 ui5-form）。
   * 分组模式（CmxColumnModel 含 CmxColumnGroup）时每分组一个独立 ui5-form，
   * 标题用 ui5-form::part(header)（CSS 可控），绕过 ui5-form-group 标题在 Shadow 不可穿透的限制。
   * @returns {string} 初始 innerHTML 模板字符串
   */
  _template() {
    return '<div id="form-root"></div>'
  }

  // ─── 公开 API ───────────────────────────────────────────────────────────

  /**
   * 通过 CmxColumnModel 设置字段：先套一次当前快照，再订阅 model 的 columns-changed
   * 事件，使 FlexibleCombination.loadByAnchor 之类的动态换列在表单上同步生效。
   *
   * 与 cmx-revo-grid.setColumnModel 行为一致：切换到另一个 model 时自动解绑旧的订阅。
   */
  setColumnModel(model) {
    if (!model) return
    if (this._boundColModel && this._boundColModelListener) {
      this._boundColModel.removeEventListener('columns-changed', this._boundColModelListener)
      this._boundColModelListener = null
    }
    this._boundColModel = model
    this._applyFields(CmxColumnAdapter.toCmxFormGrouped(model))
    if (typeof model.addEventListener === 'function') {
      this._boundColModelListener = () => this._applyFields(CmxColumnAdapter.toCmxFormGrouped(model))
      model.addEventListener('columns-changed', this._boundColModelListener)
    }
  }

  /**
   * 内部：应用字段定义（仅由 setColumnModel 调用）。两种形态：
   *   1) 扁平：`Field[]`
   *   2) 树形：每个节点可为 `Field` 或 `{ type:'group', caption, children:[Field|Group] }`（任意层嵌套）
   *
   * 树形输入会渲染为 `<ui5-form-group>` 包裹的分组；同时自动展平到 `this._fields` 供值读写使用。
   * 字段定义只能源自 CmxColumnModel，不对外暴露 setFields。
   */
  _applyFields(input) {
    const arr = Array.isArray(input) ? input.slice() : []
    const hasGroup = arr.some((n) => n && (n.type === 'group' || Array.isArray(n.children)))
    this._fieldTree = hasGroup ? arr : null
    this._fields    = hasGroup ? CmxUi5Form._flattenFieldTree(arr) : arr
    // 分组标记：neo 皮肤借此关掉宿主圆角裁剪（overflow:hidden + 9px 圆角会把首个分组
    // 标题左色条 border-left 的顶部按圆角弧线裁掉，竖条显示不完整）
    this.classList.toggle('cmx-form-grouped', hasGroup)
    if (this.shadowRoot) this._render()
  }

  /** 递归把树扁平为 Field[]（仅叶节点；跳过 group 包装层）。 */
  static _flattenFieldTree(nodes) {
    const out = []
    const walk = (list) => {
      if (!Array.isArray(list)) return
      for (const n of list) {
        if (!n) continue
        if (n.type === 'group' || Array.isArray(n.children)) walk(n.children || [])
        else if (n.key || n.id) out.push(n)
      }
    }
    walk(nodes)
    return out
  }

  /**
   * 设置列布局字符串。
   * @param {string} layout - 布局字符串，例 'S1 M2 L3 XL3'（S/M/L/XL 四档断点列数）；空值回退默认布局
   */
  setLayout(layout) {
    this._layout = layout || DEFAULT_LAYOUT
    if (this.shadowRoot) {
      this.shadowRoot.querySelectorAll('#form-root ui5-form').forEach((f) => f.setAttribute('layout', this._layout))
      this._applyFlowCols()
    }
  }

  /**
   * 解析响应式列布局字符串为各断点列数。
   * @param {string} layout - 'S1 M2 L3 XL3' 格式（S/M/L/XL 四档）；未出现的断点回退默认 {S:1,M:2,L:3,XL:3}
   * @returns {{S:number,M:number,L:number,XL:number}}
   */
  _parseLayoutCols(layout) {
    const out = { S: 1, M: 2, L: 3, XL: 3 }
    if (!layout || typeof layout !== 'string') return out
    for (const part of layout.split(/\s+/)) {
      const m = /^(S|M|L|XL)(\d+)$/i.exec(part)
      if (m) out[m[1].toUpperCase()] = Number(m[2])
    }
    return out
  }

  /**
   * 把 _layout 解析出的各断点列数写入所有 row 容器的 CSS 变量（--cmx-flow-cols-s/m/l/xl），
   * 供 @container 响应式规则消费。col 模式（ui5-form）不受影响。
   */
  _applyFlowCols() {
    if (!this.shadowRoot) return
    const c = this._parseLayoutCols(this._layout)
    const vars = {
      '--cmx-flow-cols-s': c.S, '--cmx-flow-cols-m': c.M,
      '--cmx-flow-cols-l': c.L, '--cmx-flow-cols-xl': c.XL,
    }
    this.shadowRoot.querySelectorAll('#form-root .cmx-form-row').forEach((el) => {
      for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, String(v))
    })
  }

  /**
   * 设置表单标题。
   * @param {string} text - 标题文本，渲染到 ui5-form 的 header-text；空值清空
   */
  setHeaderText(text) {
    this._headerText = text || ''
    if (this.shadowRoot) this._render()
  }

  /**
   * 设置分组渲染样式（仅分组模式 CmxColumnGroup 生效）。
   * @param {'card'|'bar'} style - card=卡片分区（边框+标题栏底色），bar=色条+下分隔线（轻量）
   */
  setGroupStyle(style) {
    this._groupStyle = style === 'bar' ? 'bar' : 'card'
    if (this.shadowRoot) this._render()
  }

  /**
   * 设置字段流向。
   * @param {'row'|'col'} flow - 'row'=行优先（从左到右再换行，默认）；'col'=列优先（原 ui5-form 报纸式多列）
   */
  setFlow(flow) {
    this._flow = flow === 'col' ? 'col' : 'row'
    if (this.shadowRoot) {
      this._applyFlowCols()
      this._render()
    }
  }

  /**
   * 绑定数据：接受 CmxDataSet 或单行对象。
   *   - 传 CmxDataSet：取当前行（优先 opts.currentRowId → ds.currentRow → rows[0]），
   *     并订阅 cursor-changed / row-changed 事件，自动跟随游标与同行字段值变化刷新。
   *   - 传普通对象：作为静态行直接绑定（不订阅事件）。
   *   切换到新 ds 时自动解绑旧 ds 的监听。
   * @param {object} dsOrRow - CmxDataSet 实例（含 addRow 等方法）或单行数据对象
   * @param {object} [opts]
   * @param {string|number} [opts.currentRowId] - 指定初始显示行的 id（仅 ds 模式）
   * @returns {void}
   */
  setDataSet(dsOrRow, opts = {}) {
    const isDs = dsOrRow && typeof dsOrRow.addRow === 'function'

    // 解绑旧 ds 的游标 + 行变化监听（ds 切换时）
    if (this._ds && this._ds !== dsOrRow && this._cursorListener) {
      this._ds.removeEventListener('cursor-changed', this._cursorListener)
      this._cursorListener = null
    }
    if (this._ds && this._ds !== dsOrRow && this._rowChangedListener) {
      this._ds.removeEventListener('row-changed', this._rowChangedListener)
      this._rowChangedListener = null
    }

    if (isDs) {
      this._ds = dsOrRow
      const id = opts.currentRowId
      this._row = (id ? dsOrRow.getRow(id) : null)
                  ?? dsOrRow.currentRow
                  ?? dsOrRow.rows[0] ?? {}
      // 注册游标监听（新 ds 或重插入后重新注册）
      if (!this._cursorListener) {
        this._registerCursorListener(dsOrRow)
      }
    } else {
      this._ds = null
      this._row = dsOrRow || {}
    }
    if (this._fields.some((f) => f.type === 'ref-display')) this._materializeRefDisplay()
    if (this.shadowRoot) this._writeValues()
  }

  /**
   * 为 CmxDataSet 注册两个事件监听并缓存到实例，便于 disconnectedCallback 解绑：
   *   - cursor-changed：游标切换→更新 _row、重算 ref-display、刷新所有字段值。
   *   - row-changed：同行字段值变化→只回写对应字段及其 dependents（带脏检查防回环）。
   * @param {object} ds - CmxDataSet 实例
   */
  _registerCursorListener(ds) {
    this._cursorListener = (e) => {
      this._row = e.detail.row || {}
      if (this._fields.some((f) => f.type === 'ref-display')) this._materializeRefDisplay()
      if (this.shadowRoot) this._writeValues()
    }
    ds.addEventListener('cursor-changed', this._cursorListener)

    /* 行字段值变化（如另一视图 grid 编辑同一行、或 calcFormula/聚合回写）：
       若变化的是本表单当前显示行，则回写字段值。CmxDataSet 是所有绑定视图的单一真相源。
       注：本表单自身 _commit 也会触发 row-changed，但 _writeOne 内有 _lastRaw 脏检查，幂等无回环。 */
    this._rowChangedListener = (e) => {
      const changedRow = e.detail?.row
      /* 匹配当前显示行：优先对象引用，回退到 id 比较（grid 编辑触发游标移动后，
         本表单 _row 已指向同一行；但若引用因某些路径不一致，用 id 兜底，避免漏刷）。 */
      const cur = this._row
      const same = changedRow && cur &&
        (changedRow === cur || (changedRow.id != null && changedRow.id === cur.id))
      if (!same) return
      const key = e.detail?.key
      if (key) {
        const cell = this._cells.get(key)
        if (cell) this._writeOne(cell, this._row[key])
        /* 该字段的 dependents（ref-display / 计算列）一并刷新 */
        const f = cell?.field
        if (f?.dependents?.length) {
          for (const depKey of f.dependents) {
            const dep = this._cells.get(depKey)
            if (dep) this._writeOne(dep, this._row[depKey])
          }
        }
      } else if (this.shadowRoot) {
        this._writeValues()
      }
    }
    ds.addEventListener('row-changed', this._rowChangedListener)
  }

  /**
   * 获取当前行数据的浅拷贝。
   * @returns {object} 当前 _row 的浅拷贝（不暴露内部引用）
   */
  getData() { return { ...this._row } }

  /**
   * 提交校验：逐字段按 required/requiredWhen/validate/validateWhen 校验当前行值。
   * 失败字段标红（UI5 value-state=Negative + 消息），返回 { valid, errors:[{key,label,message}] }。
   * 同时 dispatch 'cmx-ui5-form-invalid'（失败时）。表达式 scope = 当前整行 this._row。
   */
  validate() {
    const row = this._row || {}
    const errors = []
    // 先清除上一轮标红
    for (const [, cell] of this._cells) this._setFieldError(cell, '')
    for (const field of (this._fields || [])) {
      if (field.readonly) continue
      const val = row[field.key]
      const empty = val == null || val === '' || (Array.isArray(val) && val.length === 0)
      // 必填：required 或 requiredWhen 求值为真
      const isReq = !!field.required || (field.requiredWhen ? !!this._evalExpr(field.requiredWhen, row, false) : false)
      if (isReq && empty) {
        const msg = field.requiredMessage || '必填项不能为空'
        errors.push({ key: field.key, label: field.label || field.key, message: msg })
        this._setFieldError(this._cells.get(field.key), msg)
        continue
      }
      if (empty) continue // 非必填且空 → 跳过 validate
      // validateWhen 闸门（真才校验，默认校验）
      const gate = field.validateWhen ? !!this._evalExpr(field.validateWhen, row, true) : true
      if (!gate || field.validate == null) continue
      let pass = true
      let failMsg = null
      if (typeof field.validate === 'function') { try { pass = !!field.validate(row, val) } catch { pass = false } }
      else if (Array.isArray(field.validate)) {
        // 规则数组 [{expr,message} | {test,message}]：逐条校验，首条失败取其 message
        for (const rule of field.validate) {
          if (!rule) continue
          const ok = typeof rule.test === 'function'
            ? !!rule.test(val, row)
            : (rule.expr ? !!this._evalExpr(rule.expr, row, true) : true)
          if (!ok) { pass = false; failMsg = rule.message || null; break }
        }
      }
      else pass = !!this._evalExpr(field.validate, row, true)
      if (!pass) {
        const msg = failMsg || field.validateMessage || field.message || '校验未通过'
        errors.push({ key: field.key, label: field.label || field.key, message: msg })
        this._setFieldError(this._cells.get(field.key), msg)
      }
    }
    if (errors.length) {
      this.dispatchEvent(new CustomEvent('cmx-ui5-form-invalid', { bubbles: true, composed: true, detail: { errors, row: { ...row } } }))
    }
    return { valid: errors.length === 0, errors }
  }

  /** 字符串表达式求值（formula-eval），异常回退 fallback。 */
  _evalExpr(expr, scope, fallback) {
    try { return evalFormula(expr, scope, fallback) } catch { return fallback }
  }

  /** 给字段编辑器设/清错误态：UI5 控件用 value-state，其余加 class 兜底。 */
  _setFieldError(cell, message) {
    if (!cell || !cell.editor) return
    const ed = cell.editor
    const tag = (ed.tagName || '').toLowerCase()
    const ui5HasState = /^ui5-(input|select|combobox|date-picker|datetime-picker|textarea|multi-input|multi-combobox|step-input)$/.test(tag)
    if (message) {
      if (ui5HasState) { ed.setAttribute('value-state', 'Negative'); ed.setAttribute('value-state-message', message) }
      ed.classList.add('cmx-field-invalid')
      ed.setAttribute('title', message)
    } else {
      if (ui5HasState) {
        const cur = ed.getAttribute('value-state')
        if (cur === 'Negative') { ed.removeAttribute('value-state'); ed.removeAttribute('value-state-message') }
      }
      ed.classList.remove('cmx-field-invalid')
      if (ed.getAttribute('title')) ed.removeAttribute('title')
    }
  }

  /** 清除所有字段的错误态。 */
  clearValidation() {
    for (const [, cell] of this._cells) this._setFieldError(cell, '')
  }

  /** 注册局部 DataSource（组件级，可覆盖协调器级） */
  setDataSources(sources) {
    this._localDataSources.clear()
    for (const ds of (sources || [])) {
      if (ds && ds.id) this._localDataSources.set(ds.id, ds)
    }
    if (this.shadowRoot) this._render()
  }

  /** 协调器调用：注入 DataSource provider */
  _setDataSourceProvider(fn) {
    this._dsProvider = typeof fn === 'function' ? fn : null
    if (this.shadowRoot) this._render()
  }

  /**
   * 数据源内容变化通知：触发全量重渲染（重建选项列表等）。
   */
  _notifyDataSourcesChanged() {
    if (this.shadowRoot) this._render()
  }

  /**
   * 设置表单整体编辑状态。字段自身 readonly 仍然优先，切回编辑态时不会被打开。
   * @param {boolean} flag
   */
  setEditable(flag) {
    this._editable = !!flag
    for (const cell of this._cells.values()) this._applyEditableToCell(cell)
    return this
  }

  /**
   * 查询表单当前整体编辑状态。
   * @returns {boolean} true 表示可编辑（字段自身 readonly 不受此影响）
   */
  isEditable() {
    return !!this._editable
  }

  /**
   * 清空所有字段的值（重置查询条件场景）。
   *
   * 构造全空行调 _writeValues，复用 _writeOne 的全类型清空逻辑
   *（text/number/date → value=''，checkbox → checked=false，
   *  select → 选空占位，ref-display → 显示 —）。
   * 保留 _ds 绑定与监听（重置后仍可继续编辑/查询），不清字段定义。
   * @returns {this}
   */
  reset() {
    const empty = {}
    for (const f of this._fields) { if (f.key) empty[f.key] = '' }
    this._row = empty
    if (this.shadowRoot) this._writeValues()
    return this
  }

  /**
   * 解析数据源：组件级 _localDataSources 优先，其次协调器注入的 _dsProvider。
   * @param {string} id - 数据源 id
   * @returns {object|null} 数据源对象，未找到返回 null
   */
  _resolveDataSource(id) {
    if (!id) return null
    if (this._localDataSources.has(id)) return this._localDataSources.get(id)
    if (this._dsProvider) return this._dsProvider(id)
    return null
  }

  /** 外挂字段类型可用的上下文：commit 写值 / 拿当前 row / 拿数据源 / form 实例。 */
  _fieldCtx(field) {
    const form = this
    return {
      field,
      form,
      get row()  { return form._row },
      commit:            (f, v) => form._commit(f || field, v),
      resolveDataSource: (id)   => form._resolveDataSource(id),
      dispatch:          (name, detail) => form.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail })),
    }
  }

  /**
   * 数据源就绪后重算 ref-display 字段并刷新显示值。
   * 协调器在异步数据源加载完成后调用，使 ref-display 字段能拿到引用对象的其他字段。
   * @returns {void}
   */
  rehydrateFromSources() {
    this._materializeRefDisplay()
    if (this.shadowRoot) this._writeValues()
  }

  /**
   * 在指定数据源的 items 中按 value 字段（ds.keyField 默认 'code'）查找匹配行。
   * @param {string} sourceId - 数据源 id
   * @param {*} value - 待匹配的值（按字符串比较）
   * @returns {object|null} 匹配的行对象，未找到返回 null
   */
  _lookupSourceRow(sourceId, value) {
    const ds = this._resolveDataSource(sourceId)
    if (!ds) return null
    const items = Array.isArray(ds.items) ? ds.items : []
    const valueField = ds.keyField || 'code'
    return items.find((r) => String(r[valueField]) === String(value)) || null
  }

  /**
   * 物化所有 ref-display 字段：依据当前行 _row[from] 的引用值，从数据源查找对应行，
   * 把其 field 字段的值写回 _row[key]。本地无命中且为远程 source（含 search/loadByKeys）
   * 时异步查找后补刷对应单元格；materialize===false 的字段跳过。
   * @returns {void}
   */
  _materializeRefDisplay() {
    if (!this._row) return
    for (const f of this._fields) {
      if (f.type !== 'ref-display') continue
      if (f.materialize === false) continue
      const refValue = this._row[f.from]
      const item = this._lookupSourceRow(f.source, refValue)
      if (item) {
        this._row[f.key] = item[f.field] ?? ''
      } else if (refValue != null && refValue !== '') {
        // 远程 source：异步查后补刷
        const ds = this._resolveDataSource(f.source)
        if (ds && (typeof ds.search === 'function' || typeof ds.loadByKeys === 'function')) {
          lookupByKeyAsync(ds, refValue).then((it) => {
            if (!it) return
            this._row[f.key] = it[f.field] ?? ''
            const cell = this._cells.get(f.key)
            if (cell) this._writeOne(cell, this._row[f.key])
          }).catch(() => {})
        } else {
          this._row[f.key] = ''
        }
      } else {
        this._row[f.key] = ''
      }
    }
  }

  /**
   * 简易模板渲染：把字符串里的 ${name} 占位符替换为 ctx 中对应字段值（缺失则为空串）。
   * @param {string} tpl - 含 ${name} 占位的模板字符串
   * @param {object} [ctx] - 取值上下文
   * @returns {string} 渲染后的字符串
   */
  _renderTemplate(tpl, ctx) {
    return String(tpl).replace(/\$\{(\w+)\}/g, (_, k) => (ctx?.[k] ?? ''))
  }

  // ─── 渲染 ───────────────────────────────────────────────────────────────

  /**
   * 全量渲染表单：清空 form-root → 按扁平/分组渲染 → 写入当前行值。
   * 分组模式（CmxColumnModel 含 CmxColumnGroup）：每分组一个独立 ui5-form（标题=组名）+ card/bar 外层，
   * 组标题用 ui5-form::part(header) 渲染（CSS 可控，绕过 ui5-form-group 标题在 Shadow 不可穿透）。
   * 扁平模式：单个 ui5-form（标题=表单 headerText）。
   */
  _render() {
    const root = this._formRoot
    if (!root) return
    root.innerHTML = ''
    this._cells.clear()

    if (this._flow === 'row') this._renderRowMode(root)
    else this._renderColMode(root)
    this._writeValues()
  }

  /** col 流向渲染：原 ui5-form 路径（standaloneItemsLayout，报纸式列优先）。 */
  _renderColMode(root) {
    const tree = (Array.isArray(this._fieldTree) && this._fieldTree.length) ? this._fieldTree : null
    if (tree) {
      // 分组模式：group → 独立 ui5-form + card/bar 外层；散列叶字段归无标题 ui5-form
      let looseForm = null
      for (const node of tree) {
        if (node && (node.type === 'group' || Array.isArray(node.children))) {
          looseForm = null
          this._renderGroupForm(root, node)
        } else if (node && (node.key || node.id)) {
          if (!looseForm) looseForm = this._appendBareForm(root)
          this._renderFieldInto(looseForm, node)
        }
      }
    } else {
      // 扁平模式：单个 ui5-form
      this._form = this._createForm(this._headerText)
      root.appendChild(this._form)
      for (const f of (this._fields || [])) this._renderFieldInto(this._form, f)
    }
  }

  /** row 流向渲染：字段按行优先 CSS Grid 排布，绕开 ui5-form 的 column-count 列优先。 */
  _renderRowMode(root) {
    const tree = (Array.isArray(this._fieldTree) && this._fieldTree.length) ? this._fieldTree : null
    if (tree) {
      // 分组模式：每组 card/bar 外框 + 标题 + row grid；散列叶字段归无标题 row grid
      let looseGrid = null
      for (const node of tree) {
        if (node && (node.type === 'group' || Array.isArray(node.children))) {
          looseGrid = null
          this._renderGroupRow(root, node)
        } else if (node && (node.key || node.id)) {
          if (!looseGrid) looseGrid = this._appendBareRow(root)
          this._renderFieldInto(looseGrid, node)
        }
      }
    } else {
      // 扁平模式：可选标题 + 单个 row grid
      if (this._headerText) {
        const t = document.createElement('div')
        t.className = 'cmx-form-row-title'
        t.textContent = this._headerText
        root.appendChild(t)
      }
      const grid = this._createRowGrid()
      root.appendChild(grid)
      this._form = grid
      for (const f of (this._fields || [])) this._renderFieldInto(grid, f)
    }
    // 新建 grid 后需把列数 CSS 变量写入（@container 响应式规则消费）
    this._applyFlowCols()
  }

  /** row 模式分组：card/bar 外框 + 组标题 + row grid（嵌套子组展平进同一 grid）。 */
  _renderGroupRow(root, node) {
    const gs = this._groupStyle === 'bar' ? 'bar' : 'card'
    const wrap = document.createElement('div')
    wrap.className = 'cmx-form-group cmx-form-group-' + gs
    const caption = node.caption || node.label || ''
    if (caption) {
      const t = document.createElement('div')
      t.className = 'cmx-form-row-title'
      t.textContent = caption
      wrap.appendChild(t)
    }
    const grid = this._createRowGrid()
    wrap.appendChild(grid)
    root.appendChild(wrap)
    for (const ch of (node.children || [])) {
      if (ch && (ch.type === 'group' || Array.isArray(ch.children))) this._renderGroupLeavesIntoRow(grid, ch)
      else if (ch && (ch.key || ch.id)) this._renderFieldInto(grid, ch)
    }
  }

  /** row 模式：把（嵌套）分组下的所有叶字段展平渲染进同一 row grid。 */
  _renderGroupLeavesIntoRow(gridEl, node) {
    for (const ch of (node.children || [])) {
      if (ch && (ch.type === 'group' || Array.isArray(ch.children))) this._renderGroupLeavesIntoRow(gridEl, ch)
      else if (ch && (ch.key || ch.id)) this._renderFieldInto(gridEl, ch)
    }
  }

  /** row 模式：顶层散列叶字段归一个无标题 row grid（不包 card/bar 外层）。 */
  _appendBareRow(root) {
    const grid = this._createRowGrid()
    root.appendChild(grid)
    return grid
  }

  /** 创建行优先 grid 容器（响应式列数由 @container + --cmx-flow-cols-* 驱动）。 */
  _createRowGrid() {
    const grid = document.createElement('div')
    grid.className = 'cmx-form-row'
    return grid
  }

  /** 创建一个 ui5-form（layout + 可选 header-text）。 */
  _createForm(headerText) {
    const form = document.createElement('ui5-form')
    form.setAttribute('layout', this._layout)
    if (headerText) form.setAttribute('header-text', headerText)
    return form
  }

  /**
   * 渲染一个分组：card/bar 外层 div（groupStyle 控制）+ 内含 ui5-form（标题=组名）+ 字段。
   * 组标题用 ui5-form::part(header)（CSS 可控），不再依赖 ui5-form-group。
   */
  _renderGroupForm(root, node) {
    const gs = this._groupStyle === 'bar' ? 'bar' : 'card'
    const wrap = document.createElement('div')
    wrap.className = 'cmx-form-group cmx-form-group-' + gs
    const form = this._createForm(node.caption || node.label || '')
    wrap.appendChild(form)
    root.appendChild(wrap)
    for (const ch of (node.children || [])) {
      if (ch && (ch.type === 'group' || Array.isArray(ch.children))) this._renderGroupLeavesInto(form, ch)
      else if (ch && (ch.key || ch.id)) this._renderFieldInto(form, ch)
    }
  }

  /** 顶层散列叶字段：归入一个无标题 ui5-form（不包 card/bar 外层）。 */
  _appendBareForm(root) {
    const form = this._createForm('')
    root.appendChild(form)
    return form
  }

  /** 把（嵌套）分组下的所有叶字段展平渲染进同一 ui5-form。 */
  _renderGroupLeavesInto(formEl, node) {
    for (const ch of (node.children || [])) {
      if (ch && (ch.type === 'group' || Array.isArray(ch.children))) this._renderGroupLeavesInto(formEl, ch)
      else if (ch && (ch.key || ch.id)) this._renderFieldInto(formEl, ch)
    }
  }

  /** 单字段渲染 + cell 注册（原 _render 循环体抽出）。 */
  _renderFieldInto(parentEl, field) {
    const item = document.createElement('ui5-form-item')
    // 固定 label 列宽(--cmx-form-label-w)：UI5 默认按 label-span 比例(4fr 8fr)分 label 列，
    // 宽度随各 item 自身内容/宽度自适应——同表单内长 label 项（或跨列项）label 列更宽，
    // 输入框左缘右移参差（值起始线不齐）。统一固定像素列宽后全部对齐（跨列字段输入框
    // 左对齐其所跨首列）。默认启用；页面设 data-cmx-label-auto 可退回 UI5 比例分列。
    // 默认密度 9rem≈144px 容纳 8 个中文字+星+冒号；compact 保持 6.5rem。
    const compact = this.getAttribute('data-cmx-density') === 'compact'
    if (!this.hasAttribute('data-cmx-label-auto')) {
      item.style.setProperty('--ui5-form-item-layout', `var(--cmx-form-label-w, ${compact ? '6.5rem' : '9rem'}) 1fr 0fr`)
    }
    // 字段可声明 colspan / columnSpan，让某字段占多列。
    // - row 流向：ui5-form-item 是 grid 直接子项，grid-column:span N 真正生效。
    // - col 流向：映射到 ui5-form-item 的 column-span 属性（注：UI5 2.23.2 未接线 FormItem.columnSpan，
    //   当前为 no-op；保留供未来 UI5 升级或 col 模式适配）。
    const span = field.colspan ?? field.columnSpan
    if (span != null && Number(span) > 1) {
      if (this._flow === 'row') item.style.gridColumn = `span ${Number(span)}`
      else item.setAttribute('column-span', String(Number(span)))
    }
    const label = document.createElement('ui5-label')
    label.setAttribute('slot', 'labelContent')
    label.setAttribute('show-colon', '')
    // label 列定宽后，超长文字换行显示（默认 None 会在固定宽度内省略号截断，丢字段名）。
    label.setAttribute('wrapping-type', 'Normal')
    // 必填星号前置：UI5 内置 required 星号是冒号元素的 :after 伪元素（固定在文字后、无 exportparts 无法重排），
    // label 右对齐时星号把冒号顶开、与非必填字段冒号不对齐。改为在文本前插入必填色 * 占位，冒号右缘统一对齐。
    if (field.required) {
      const star = document.createElement('span')
      star.className = 'cmx-label-star'
      star.textContent = '*'
      star.setAttribute('aria-hidden', 'true')
      label.appendChild(star)
    }
    label.appendChild(document.createTextNode(field.label || field.key || ''))
    item.appendChild(label)

    const editor = this._createEditor(field)
    this._installReadonlyChrome(editor)
    this._markFieldReadonly(editor, field)
    item.appendChild(editor)
    parentEl.appendChild(item)
    const cell = { item, editor, label, field, _optEls: null, _lastRaw: undefined }
    if ((field.type === 'select' || field.type === 'ref') && editor.tagName?.toLowerCase() === 'ui5-select') {
      cell._optEls = Array.from(editor.querySelectorAll('ui5-option'))
    }
    this._cells.set(field.key, cell)
    this._applyEditableToCell(cell)
  }

  /**
   * 给字段编辑器打上 data-cmx-field-readonly='true' 标记，作为字段级只读的持久标记
   *（setEditable 切换整体编辑态时仍保留该字段只读，不会被重新打开）。
   */
  _markFieldReadonly(editor, field) {
    if (!editor || !field?.readonly) return
    editor.setAttribute?.('data-cmx-field-readonly', 'true')
  }

  /**
   * 应用编辑态到单个 cell：综合表单整体 _editable 与字段级只读标记，决定最终 editable。
   */
  _applyEditableToCell(cell) {
    if (!cell?.editor) return
    const editor = cell.editor
    const fieldReadonly = !!cell.field?.readonly || editor.getAttribute?.('data-cmx-field-readonly') === 'true'
    const editable = this._editable && !fieldReadonly
    this._applyEditableToEditor(editor, editable)
  }

  /**
   * 按 UI5 控件类型把 editable 落到具体编辑器：优先 setEditable API，
   * 回退到 disabled/readonly 属性切换（select/checkbox/combobox 用 disabled，input/datepicker/textarea 用 readonly）。
   */
  _applyEditableToEditor(editor, editable) {
    if (!editor || !editor.tagName) return
    if (typeof editor.setEditable === 'function') {
      editor.setEditable(editable)
      return
    }
    const tag = editor.tagName.toLowerCase()
    if (tag === 'cmx-dict-select' && typeof editor.configure === 'function') {
      editor.configure({ readonly: !editable })
      return
    }
    if (tag === 'ui5-select' || tag === 'ui5-checkbox' || tag === 'ui5-combobox') {
      if (editable) editor.removeAttribute('disabled')
      else editor.setAttribute('disabled', '')
      return
    }
    if (tag === 'ui5-input' || tag === 'ui5-date-picker' || tag === 'ui5-textarea') {
      if (editable) editor.removeAttribute('readonly')
      else editor.setAttribute('readonly', '')
    }
  }

  /**
   * 为指定 UI5 输入类控件注入"只读净化样式"：去除 readonly/disabled 态下的边框、焦点环、阴影，
   * 使只读字段呈现为纯文本外观。样式注入到控件自身的 shadowRoot（标记 data-cmx-readonly-clean 防重复），
   * 并在控件定义就绪后多帧重试（requestAnimationFrame，最多 5 次）以应对异步渲染与嵌套输入（date-picker 内的 input）。
   */
  _installReadonlyChrome(editor) {
    if (!editor || !editor.tagName) return
    const tag = editor.tagName.toLowerCase()
    if (!['ui5-input', 'ui5-combobox', 'ui5-date-picker', 'ui5-textarea', 'ui5-select'].includes(tag)) return

    const css = `
      :host([readonly]:not([disabled])),
      :host([disabled]) {
        border: 0 solid transparent !important;
        border-color: transparent !important;
        border-style: none !important;
        box-shadow: none !important;
        background-image: none !important;
      }
      :host([readonly]) .ui5-input-root,
      :host([readonly]) .ui5-input-content,
      :host([readonly]) .ui5-combobox-root,
      :host([readonly]) .ui5-date-picker-root,
      :host([readonly]) .ui5-textarea-wrapper,
      :host([disabled]) .ui5-select-root,
      :host([disabled]) .ui5-input-root,
      :host([disabled]) .ui5-input-content {
        border: 0 solid transparent !important;
        border-color: transparent !important;
        border-style: none !important;
        box-shadow: none !important;
        background-image: none !important;
      }
      :host([readonly]) .ui5-input-root::before,
      :host([disabled]) .ui5-input-root::before {
        content: none !important;
        display: none !important;
      }
      :host([readonly]) .ui5-input-focusable-element::after,
      :host([readonly][focused]) .ui5-input-focusable-element::after,
      :host([disabled]) .ui5-input-focusable-element::after,
      :host([readonly]) .ui5-textarea-wrapper::after,
      :host([readonly][focused]) .ui5-textarea-wrapper::after {
        content: none !important;
        border: 0 solid transparent !important;
        outline: none !important;
        box-shadow: none !important;
      }
    `
    const apply = (el) => {
      if (!el) return
      el.style.setProperty('--_ui5_input_readonly_border', '0 solid transparent')
      el.style.setProperty('--_ui5_input_readonly_border_color', 'transparent')
      el.style.setProperty('--_ui5_textarea_readonly_border_style', 'none')
      el.style.setProperty('--sapField_ReadOnly_BorderColor', 'transparent')
      el.style.setProperty('--sapField_ReadOnly_BorderStyle', 'none')
      const sr = el.shadowRoot
      if (!sr || sr.querySelector('style[data-cmx-readonly-clean]')) return
      const st = document.createElement('style')
      st.setAttribute('data-cmx-readonly-clean', '')
      st.textContent = css
      sr.appendChild(st)
    }
    const applyDeep = () => {
      apply(editor)
      const inner = editor.shadowRoot?.querySelector('.ui5-date-picker-input, .ui5-step-input-input')
      apply(inner)
    }
    const schedule = (tries = 5) => {
      applyDeep()
      if (tries <= 0) return
      const nextFrame = typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame
        : (fn) => setTimeout(fn, 16)
      nextFrame(() => schedule(tries - 1))
    }
    customElements.whenDefined(tag).then(() => schedule()).catch(() => schedule())
  }

  /**
   * 根据字段 type 创建对应的输入编辑器并绑定 change/input 事件 → _commit。
   * 解析优先级：
   *   1. 外挂注册类型（cmx-form-field-registry 的 form.create）—— 优先返回；
   *   2. 内置类型 switch：readonly / ref-display / ref / date / select / number / textarea / checkbox / text(默认)。
   * @param {object} field - 字段定义
   * @returns {HTMLElement} 编辑器 DOM 元素
   */
  _createEditor(field) {
    const type = field.type || 'text'
    // 外挂注册的字段类型优先（cmx-form-field-registry）；未注册时回退到下面内置 switch
    const def = getFieldType(type)
    if (def && def.form && typeof def.form.create === 'function') {
      return def.form.create(field, this._fieldCtx(field))
    }
    if (type === 'readonly' || type === 'ref-display') {
      const span = document.createElement('span')
      span.className = 'readonly-display'
      return span
    }
    if (type === 'ref') {
      const helper = this._resolveHelper(field)
      // ref 字段统一提交逻辑：写值 → 物化关联的 ref-display → 刷新 ref-display 与 dependents → 派发 changed 事件
      const commit = (v) => {
        if (this._row && typeof this._row.set === 'function') {
          this._row.set(field.key, v)
        } else {
          this._row[field.key] = v
        }
        this._materializeRefDisplay()
        // 刷新所有引用本 ref 字段（source + from 匹配）的 ref-display 单元格
        for (const f of this._fields) {
          if (f.type === 'ref-display' && f.source === field.source && f.from === field.key) {
            const dep = this._cells.get(f.key)
            if (dep) this._writeOne(dep, this._row[f.key])
          }
        }
        // 刷新字段定义里显式声明的 dependents
        if (field.dependents) {
          for (const dk of field.dependents) {
            const dep = this._cells.get(dk)
            if (dep) this._writeOne(dep, this._row[dk])
          }
        }
        this.dispatchEvent(new CustomEvent('cmx-ui5-form-changed', {
          bubbles: true, composed: true, detail: { key: field.key, value: v, row: this._row },
        }))
      }
      // helper=combo-search：本地可搜索 combobox，selection-change 与 change（失焦精确匹配）双触发
      if (helper === 'combo-search') {
        const el = document.createElement('ui5-combobox')
        if (field.readonly) el.setAttribute('disabled', '')
        if (field.placeholder) el.setAttribute('placeholder', field.placeholder)
        this._fillRefComboItems(el, field)
        el.addEventListener('selection-change', (e) => {
          const item = e.detail?.item
          const v = item?.dataset?.value ?? item?.getAttribute?.('data-value') ?? ''
          commit(v)
        })
        el.addEventListener('change', () => {
          const ds = this._resolveDataSource(field.source)
          const valueField = field.valueField || ds?.keyField || 'code'
          const items = Array.isArray(ds?.items) ? ds.items : []
          const matched = items.find((it) => String(it[valueField]) === String(el.value))
          if (matched) commit(String(el.value))
        })
        return el
      }
      // helper=remote-search：远程异步搜索 input + suggestion，按 key 防抖触发 ds.search；缺 search() 回退 dropdown
      if (helper === 'remote-search') {
        const ds = this._resolveDataSource(field.source)
        const el = document.createElement('ui5-input')
        el.setAttribute('show-suggestions', '')
        if (field.readonly) el.setAttribute('readonly', '')
        if (field.placeholder) el.setAttribute('placeholder', field.placeholder || '输入关键字搜索…')
        if (!ds || typeof ds.search !== 'function') {
          console.warn(`[cmx-ui5-form] remote-search source "${field.source}" lacks search()，回退 dropdown`)
          // fall through to dropdown
        } else {
          // 重填 suggestion 列表：先清旧 ui5-suggestion-item，再按 displayTemplate 或默认 'value · label' 渲染
          const refill = (items) => {
            Array.from(el.children).forEach((c) => {
              if (c.tagName?.toLowerCase() === 'ui5-suggestion-item') c.remove()
            })
            const valueField = field.valueField || ds.keyField || 'code'
            const labelField = ds.labelField || 'name'
            for (const it of items) {
              const o = document.createElement('ui5-suggestion-item')
              const v = String(it[valueField] ?? '')
              o.setAttribute('text', field.displayTemplate
                ? this._renderTemplate(field.displayTemplate, it)
                : `${v}${it[labelField] ? ' · ' + it[labelField] : ''}`)
              o.dataset.value = v
              el.appendChild(o)
            }
          }
          const trigger = debounceForSource(ds, async (q) => {
            try { refill(await searchAsync(ds, q)) }
            catch (e) { console.warn('[cmx-ui5-form] remote-search failed:', e?.message || e) }
          })
          el.addEventListener('input', () => trigger(el.value || ''))
          el.addEventListener('suggestion-item-select', (ev) => {
            const it = ev.detail?.item
            const v = it?.dataset?.value ?? it?.getAttribute?.('data-value') ?? ''
            commit(v)
          })
          return el
        }
      }
      // dropdown 默认
      const el = document.createElement('ui5-select')
      if (field.readonly) el.setAttribute('disabled', '')
      this._fillRefOptions(el, field)
      el.addEventListener('change', (e) => {
        const v = e.detail?.selectedOption?.dataset?.value ?? ''
        commit(v)
      })
      return el
    }
    if (type === 'date') {
      const el = document.createElement('ui5-date-picker')
      el.setAttribute('format-pattern', field.formatPattern || 'yyyy-MM-dd')
      if (field.readonly) el.setAttribute('readonly', '')
      el.addEventListener('change', (e) => {
        const v = e.detail?.value ?? e.target.value ?? ''
        this._commit(field, v)
      })
      return el
    }
    if (type === 'select') {
      const el = document.createElement('ui5-select')
      if (field.readonly) el.setAttribute('disabled', '')
      this._fillSelectOptions(el, field)
      el.addEventListener('change', (e) => {
        const v = e.detail?.selectedOption?.dataset?.value ?? ''
        this._commit(field, v)
      })
      return el
    }
    if (type === 'number') {
      const el = document.createElement('ui5-input')
      el.setAttribute('type', 'Number')
      if (field.readonly) el.setAttribute('readonly', '')
      if (field.placeholder) el.setAttribute('placeholder', field.placeholder)
      el.addEventListener('input', (e) => {
        const raw = e.target.value
        const v = raw === '' ? '' : Number(raw)
        this._commit(field, v)
      })
      return el
    }
    if (type === 'textarea') {
      const el = document.createElement('ui5-textarea')
      if (field.rows) el.setAttribute('rows', String(field.rows))
      if (field.readonly) el.setAttribute('readonly', '')
      if (field.placeholder) el.setAttribute('placeholder', field.placeholder)
      el.addEventListener('input', (e) => this._commit(field, e.target.value))
      return el
    }
    if (type === 'checkbox') {
      const el = document.createElement('ui5-checkbox')
      if (field.label) el.setAttribute('text', '')   // label 已由 form-item 渲染
      if (field.readonly) el.setAttribute('disabled', '')
      el.addEventListener('change', () => {
        this._commit(field, !!el.checked)
      })
      return el
    }
    // text 默认
    const el = document.createElement('ui5-input')
    if (field.readonly) el.setAttribute('readonly', '')
    if (field.placeholder) el.setAttribute('placeholder', field.placeholder)
    el.addEventListener('input', (e) => this._commit(field, e.target.value))
    return el
  }

  /**
   * 填充普通 select 的选项：其后为 field.options。
   * 空占位（placeholder 或 '— 请选择 —'）仅在非必填时加首项——必填字段不允许空值，
   * 故必填（field.required 为真）时不插入空占位，强制用户从有效选项中选择。
   * @param {HTMLElement} sel - ui5-select 元素
   * @param {object} field - 字段定义（读取 options / placeholder / required）
   */
  _fillSelectOptions(sel, field) {
    sel.innerHTML = ''
    // 非必填才加空占位（让用户能清空选择）；必填字段不提供空项，强制选有效值。
    if (!field.required) {
      const empty = document.createElement('ui5-option')
      empty.textContent = field.placeholder || '— 请选择 —'
      empty.dataset.value = ''
      sel.appendChild(empty)
    }
    for (const opt of (field.options || [])) {
      const o = document.createElement('ui5-option')
      o.textContent = opt.label ?? opt.value
      o.dataset.value = opt.value
      sel.appendChild(o)
    }
  }

  /**
   * 填充 ref 字段下拉（ui5-select）选项：从 field.source 数据源取 items，
   * 每项文本用 displayTemplate 渲染或默认 '{value} · {label}' 格式，value 存 dataset.value。
   * 空占位仅在非必填时加首项——必填字段不允许空值，故必填（field.required 为真）时不插入空占位。
   * @param {HTMLElement} sel - ui5-select 元素
   * @param {object} field - 字段定义（读取 source / valueField / displayTemplate / placeholder / required）
   */
  _fillRefOptions(sel, field) {
    sel.innerHTML = ''
    // 非必填才加空占位（让用户能清空选择）；必填字段不提供空项，强制选有效值。
    if (!field.required) {
      const empty = document.createElement('ui5-option')
      empty.textContent = field.placeholder || '— 请选择 —'
      empty.dataset.value = ''
      sel.appendChild(empty)
    }
    const ds = this._resolveDataSource(field.source)
    if (!ds) return
    const items = Array.isArray(ds.items) ? ds.items : []
    const valueField = field.valueField || ds.keyField || 'code'
    const labelField = ds.labelField || 'name'
    for (const it of items) {
      const o = document.createElement('ui5-option')
      const v = String(it[valueField] ?? '')
      o.textContent = field.displayTemplate
        ? this._renderTemplate(field.displayTemplate, it)
        : `${v}${it[labelField] ? ' · ' + it[labelField] : ''}`
      o.dataset.value = v
      sel.appendChild(o)
    }
  }

  /**
   * 填充 ref 字段 combobox（ui5-combobox）的 ui5-cb-item 项，逻辑同 _fillRefOptions
   * 但使用 text 属性而非 textContent。
   * @param {HTMLElement} cb - ui5-combobox 元素
   * @param {object} field - 字段定义
   */
  _fillRefComboItems(cb, field) {
    cb.innerHTML = ''
    const ds = this._resolveDataSource(field.source)
    if (!ds) return
    const items = Array.isArray(ds.items) ? ds.items : []
    const valueField = field.valueField || ds.keyField || 'code'
    const labelField = ds.labelField || 'name'
    for (const it of items) {
      const o = document.createElement('ui5-cb-item')
      const v = String(it[valueField] ?? '')
      o.setAttribute('text',
        field.displayTemplate
          ? this._renderTemplate(field.displayTemplate, it)
          : `${v}${it[labelField] ? ' · ' + it[labelField] : ''}`)
      o.dataset.value = v
      cb.appendChild(o)
    }
  }

  /**
   * 解析 ref 字段的交互 helper 类型：field.helper 优先，回退到数据源的 helper，最终默认 'dropdown'。
   * 取值：'dropdown' / 'combo-search' / 'remote-search'。
   * @param {object} field - 字段定义
   * @returns {string} helper 类型字符串
   */
  _resolveHelper(field) {
    if (field.helper) return typeof field.helper === 'string' ? field.helper : (field.helper.type || 'dropdown')
    const ds = this._resolveDataSource(field.source)
    if (ds?.helper) return typeof ds.helper === 'string' ? ds.helper : (ds.helper.type || 'dropdown')
    return 'dropdown'
  }

  /**
   * 设置 ui5-select 的选中项：遍历 option 列表，按 dataset.value 与 target 比对切换 selected 属性。
   * @param {HTMLElement} sel - ui5-select 元素
   * @param {string} value - 目标值（与 option.dataset.value 比较）
   * @param {HTMLElement[]} [optEls] - 预缓存的 option 列表（避免重复查询）
   */
  _setSelectValue(sel, value, optEls = null) {
    const target = value ?? ''
    const opts = optEls ?? Array.from(sel.querySelectorAll('ui5-option'))
    for (const o of opts) {
      const match = o.dataset.value === target
      if (match && !o.hasAttribute('selected'))       o.setAttribute('selected', '')
      else if (!match && o.hasAttribute('selected'))  o.removeAttribute('selected')
    }
  }

  /**
   * 把当前行 _row 的所有字段值批量写入对应编辑器。
   * 行切换入口：清空每个 cell 的脏检查缓存 _lastRaw，确保新值一定写入（不被缓存拦截）。
   */
  _writeValues() {
    for (const [key, cell] of this._cells) {
      cell._lastRaw = undefined  // 行切换时清脏检查缓存，确保新值一定写入
      this._writeOne(cell, this._row[key])
    }
  }

  /**
   * 把单个原始值 raw 写入指定 cell 的编辑器（按字段 type 分发）。
   * 解析优先级：外挂注册类型的 form.write → 内置 type 分支（readonly/ref-display/select/ref/date/checkbox/number/text/textarea）。
   * select/ref 类型带脏检查（cell._lastRaw）：相同值跳过，避免重置光标/触发不必要渲染；
   * 若缓存的 option 列表脱离 DOM（_render 重建后失效）则自动刷新引用。
   * @param {object} cell - _cells 中的渲染句柄
   * @param {*} raw - 待写入的原始值
   */
  _writeOne(cell, raw) {
    const { editor, field } = cell
    const type = field.type || 'text'
    // 外挂注册类型优先（cmx-form-field-registry）
    const def = getFieldType(type)
    if (def && def.form && typeof def.form.write === 'function') {
      def.form.write(editor, raw, field, this._fieldCtx(field))
      return
    }
    if (type === 'readonly') {
      let v = raw
      // 有 formatter 预设时调用其 format 方法格式化展示值（如金额千分位、日期格式化）
      if (field.formatter) {
        const out = invokePreset(field.formatter, 'format', this._row, { value: raw, key: field.key, form: this })
        if (out !== undefined) v = out
      }
      // 有 display.format 预设时按预设格式化（date:/datetime: 等），与表格展示保持一致
      // （field.display 由列适配器 _leafDescriptorToFormField 透传，line 530）
      const dispFmt = field.display && field.display.format
      if (dispFmt && v != null && v !== '') {
        v = formatByPreset(v, { format: dispFmt })
      }
      const empty = v == null || v === ''
      const text = empty ? '—' : String(v)
      if (editor.textContent !== text) editor.textContent = text
      editor.classList.toggle('placeholder', empty)
      return
    }
    if (type === 'ref-display') {
      let v = raw
      // 当前值空且未禁用物化时，按引用字段 from 的值从数据源反查显示文本
      if ((v == null || v === '') && field.materialize !== false) {
        const item = this._lookupSourceRow(field.source, this._row[field.from])
        if (item) v = item[field.field] ?? ''
      }
      const empty = v == null || v === ''
      const text = empty ? '—' : String(v)
      if (editor.textContent !== text) editor.textContent = text
      editor.classList.toggle('placeholder', empty)
      return
    }
    if (type === 'select' || type === 'ref') {
      const tag = editor?.tagName?.toLowerCase()
      if (tag === 'ui5-combobox') {
        // combobox 写的是显示文本（value · label 或 displayTemplate），不是原始 code
        const ds = type === 'ref' ? this._resolveDataSource(field.source) : null
        if (ds) {
          const item = this._lookupSourceRow(field.source, raw)
          const labelField = ds.labelField || 'name'
          const v = item
            ? (field.displayTemplate ? this._renderTemplate(field.displayTemplate, item) : `${raw}${item[labelField] ? ' · ' + item[labelField] : ''}`)
            : (raw ?? '')
          if (editor.value !== v) editor.value = v
        } else {
          const v = raw ?? ''
          if (editor.value !== String(v)) editor.value = v
        }
      } else {
        // 脏检查：相同值跳过
        if (cell._lastRaw === raw) return
        cell._lastRaw = raw
        // 若缓存 optEls 已脱离 DOM（_render 后被重建），自动刷新引用
        if (cell._optEls?.length > 0 && !cell._optEls[0].isConnected) {
          cell._optEls = Array.from(editor.querySelectorAll('ui5-option'))
        }
        this._setSelectValue(editor, raw ?? '', cell._optEls)
      }
      return
    }
    if (type === 'date') {
      const v = raw ?? ''
      if (editor.value !== v) editor.value = v
      return
    }
    if (type === 'checkbox') {
      if (!!raw !== !!editor.checked) editor.checked = !!raw
      return
    }
    if (type === 'number') {
      const v = raw == null || raw === '' ? '' : String(raw)
      if (editor.value !== v) editor.value = v
      return
    }
    // text / textarea
    const v = raw ?? ''
    if (editor.value !== String(v)) editor.value = v
  }

  /**
   * 提交字段值到数据层：清该字段的校验错误态 → 写入 _row（优先 row.set 触发 row-changed，
   * 由 CmxMasterSlave 执行 calcFormula + 聚合）→ 刷新 dependents 显示 → 派发 cmx-ui5-form-changed 事件。
   * @param {object} field - 字段定义
   * @param {*} value - 新值
   */
  _commit(field, value) {
    // 编辑该字段即清除其校验错误态
    const c = this._cells.get(field.key)
    if (c) this._setFieldError(c, '')
    // row.set 写值 + 触发 row-changed（由 CmxMasterSlave 执行 calcFormula + 聚合）
    if (this._row && typeof this._row.set === 'function') {
      this._row.set(field.key, value)
    } else {
      this._row[field.key] = value
    }
    // 刷新 dependents 的显示
    if (field.dependents?.length) {
      for (const depKey of field.dependents) {
        const dep = this._cells.get(depKey)
        if (dep) this._writeOne(dep, this._row[depKey])
      }
    }
    this.dispatchEvent(new CustomEvent('cmx-ui5-form-changed', {
      bubbles: true, composed: true,
      detail: { key: field.key, value, row: this._row },
    }))
  }
}

customElements.define('cmx-ui5-form', CmxUi5Form)

/** @deprecated 兼容旧标签 <cmx-form> */
if (!customElements.get('cmx-form')) {
  customElements.define('cmx-form', class CmxFormLegacy extends CmxUi5Form {})
}
