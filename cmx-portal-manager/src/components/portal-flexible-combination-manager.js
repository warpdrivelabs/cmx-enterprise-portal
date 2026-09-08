import { apiFetch, apiPost } from 'cmx-ui5-runtime/api-client'
import { registerWorkspaceViewType } from '../lib/workspace-view-renderer.js'
import { escAttr, escHtml } from '../lib/escape.js'
import { combinationBus, combinationBusFor } from '../lib/flexible-combination-bus.js'
import { FLC_MANAGER_STYLES } from './portal-flexible-combination-styles.js'
import {
  fcScenarioParts,
  fcScenarioForVersion,
  fcItemVersion,
  fcItemIsDefault,
  groupFcItemsByStem,
  docItemVersion,
  docItemIsDefault,
  groupDocItemsByStem,
} from '../lib/version-stem.js'
import { showCmxMessage } from 'cmx-data-comp'
import { showDefError, showDefWarn } from '../lib/notify.js'
import { admConfirm, ADM_ALL_CSS, admColorSchemeCss } from '../lib/admin-ui-kit.js'
import {
  compileFormula,
  FlexibleCombinationEngine,
  createFieldClipboardPayload,
  diagnoseReferences,
  expandRuleDetail,
  fieldCaption,
  fieldId,
  makeFlcAdapter,
  readFieldClipboard,
  renderFieldPanel,
  renderFieldTable,
  editModeKind,
  writeFieldClipboard,
} from 'cmx-data-comp'

// 弹性组合总线（FlexibleCombinationBus / combinationBus / combinationBusFor）已抽到 ../lib/flexible-combination-bus.js

const DEFAULT_PANEL = '默认面板'

const DEFAULT_COMBINATION = {
  version: 1,
  title: '',
  description: '',
  status: 'draft',
  tags: [],
  anchorDimensions: [],
  dimensions: {},
  rules: [],
}

// DAM 下拉选项 / 多版本聚合工具已抽到 ../lib/dam-options.js 与 ../lib/version-stem.js（与 definition-manager 共享）

export class PortalFlexibleCombinationManager extends HTMLElement {
  constructor () {
    super()
    this.attachShadow({ mode: 'open' })
    this._pbus = combinationBus  // 总线：普通模式=全局单例；嵌入模式在 connectedCallback 换私有实例
    this._embed = false      // 嵌入模式：不接全局总线，自带「档案」下拉，自拉列表（集群数据源浏览等复用）
    this._readonly = false   // 只读模式：隐藏编辑按钮 + 拦截所有写入
    this._damFilter = { domain: '', app: '', module: '' }
    this._items = []
    this._selected = null
    this._combination = null
    this._diagnostics = null
    this._preview = null
    this._message = ''
    this._messageType = ''      // ''|'error'|'success'|'warning' → ui5-message-strip design
    this._loading = false
    this._dirty = false
    this._dimensionsOpen = false
    this._groupsOpen = false
    this._columnModelOpen = false
    this._selectedRuleId = ''
    this._selectedPanel = ''     // 当前选中的规则面板（tab）；按 rule.panel 分组
    this._extraPanels = []       // 新建但尚无规则的空面板名（仅 UI，保存时随规则落盘）
    this._tablePicker = null     // 表树形选择器：null 或 {mode:'add'|'rename', panel}
    this._selectedFieldCode = ''
    this._selectedFieldSet = 0   // 选中的明细字段集 tab：''=主字段集(rule.detail)，否则 fieldTabs[].id
    this._ruleInspect = false   // true=property 区显示选中规则的 form 编辑器（点规则行触发）
    this._formulaEdit = null    // 公式编辑器：null 或 { code, draft }（模态）
    this._matchRows = null      // 规则匹配条件的工作态行 [{col,op,val}]（含未填完的行）
    this._anchorValues = {}
    this._docList = []          // 可引用的业务单据定义文件列表
    this._docMeta = null        // 已引用并加载的业务单据定义全文
    this._docBaseFieldSets = {} // 单据引用的 base doc fieldSet（name→fields[]）
    this._selectedDocTable = '' // 查看详情时选中的单据表（property 区展示其列分组）
    this._docInfoView = false   // true=property 区展示单据整体信息（只读）
    this._refDictStack = []     // 列信息中点击引用字典联查的钻取栈（dictCode[]），支持返回
    this._dictColumnsMap = {}   // 字典编码 → 列名数组（维度属性多选下拉的候选）
    this._dictGroupsMap = {}    // 字典编码 → [{name, ref, fields[]}]（维度列信息分组只读展示）
    this._selectedDimCode = ''  // 选中的维度编码（property 区展示其字典列信息）
    this._fieldEditKeys = new WeakMap()
    this._fieldEditKeySeq = 0
    this._suppressContentSync = false
    this._openDimAttr = ''      // 当前展开属性多选下拉的维度编码（重渲染保持打开）
    this._openRuleAnchor = ''   // 当前展开锚点多选下拉的规则 id（重渲染保持打开）
    this._versionDialog = null  // 新建版本弹窗：{ versionNo, versionName, setDefault } | null
    this._versionManagerOpen = false // 版本管理弹窗开关
    this._wired = false
    this._onClick = (e) => this._handleClick(e)
    this._onInput = (e) => this._handleInput(e)
    this._onToggle = (e) => this._handleToggle(e)
    this._onStripClose = (e) => this._handleStripClose(e)
    this._onBusSelect = (e) => { void this._loadCombination(e.detail?.key || '') }
    this._onBusRefresh = () => { void this._loadList() }
  }

  connectedCallback () {
    this._embed = this.hasAttribute('data-embed')
    this._readonly = this.hasAttribute('data-readonly')
    // 作用域总线：普通模式=全局单例；嵌入模式=页面私有实例（同页 content↔property 共享，与真实功能页隔离）。
    this._pbus = combinationBusFor(this.getAttribute('data-bus-scope') || '')
    if (this._embed) {
      // 嵌入模式：自带「档案」下拉替代 explorer，按 DAM 过滤自拉列表；仍接总线以驱动同页 property 检查器。
      this._damFilter = {
        domain: this.getAttribute('data-filter-domain') || '',
        app: this.getAttribute('data-filter-app') || '',
        module: this.getAttribute('data-filter-module') || '',
      }
      this._render()
      this._wire()
      this._pbus.setController(this)
      void this._loadDocList()
      void this._loadDictColumns()
      void this._loadListEmbed()
      return
    }
    this._render()
    this._wire()
    // 列表(explorer)选中某弹性组合 → 主体加载它
    this._pbus.addEventListener('select', this._onBusSelect)
    this._pbus.addEventListener('refresh', this._onBusRefresh)
    // 主体即控制器：检查器/校验预览面板(property 区)把渲染与事件委托给它
    this._pbus.setController(this)
    void this._loadDocList()
    void this._loadDictColumns()
    // 若列表已先行加载并选中，仅同步本地 items 引用；详情加载统一由 bus select 事件驱动（避免首屏竞态双发）
    if (this._pbus.items.length) this._items = this._pbus.items
    // 列表尚未就绪或无选中：拉一次列表（list/manager 任一方拉到都经 bus 共享并默认选中第一条 → 触发 select → _loadCombination）
    if (!this._pbus.selectedKey) void this._loadList()
  }

  _wire () {
    if (this._wired) return
    this._wired = true
    const sr = this.shadowRoot
    sr.addEventListener('click', this._onClick)
    sr.addEventListener('input', this._onInput)
    // toggle 不冒泡，用捕获阶段记住折叠区开合，避免重渲后被重置
    sr.addEventListener('toggle', this._onToggle, true)
    // ui5-message-strip 的关闭按钮(✕)派发 close 事件：清空消息，否则下次重渲会复现
    sr.addEventListener('close', this._onStripClose, true)
    sr.addEventListener('ui5-close', this._onStripClose, true)
  }

  disconnectedCallback () {
    this.shadowRoot.removeEventListener('click', this._onClick)
    this.shadowRoot.removeEventListener('input', this._onInput)
    this.shadowRoot.removeEventListener('toggle', this._onToggle, true)
    this.shadowRoot.removeEventListener('close', this._onStripClose, true)
    this.shadowRoot.removeEventListener('ui5-close', this._onStripClose, true)
    this._pbus.removeEventListener('select', this._onBusSelect)
    this._pbus.removeEventListener('refresh', this._onBusRefresh)
    this._pbus.clearController(this)
    this._wired = false
  }

  _handleToggle (e) {
    const el = e.target
    if (!(el instanceof HTMLDetailsElement) || !el.dataset.collapse) return
    if (el.dataset.collapse === 'groups') this._groupsOpen = el.open
    if (el.dataset.collapse === 'columnModel') this._columnModelOpen = el.open
  }

  /** 消息条(ui5-message-strip)的关闭按钮：清空消息与类型并重渲，使绿色/红色提示条可被关闭。 */
  _handleStripClose (e) {
    const el = e.target
    if (!(el instanceof Element) || !el.closest('.fc-strip')) return
    this._message = ''
    this._messageType = ''
    this._render()
  }

  _handleClick (e) {
    // 维度属性多选下拉：展开/收起（自绘，非 data-action）
    const toggle = e.target instanceof Element ? e.target.closest('[data-attr-toggle]') : null
    if (toggle instanceof HTMLElement) {
      const code = toggle.dataset.dimCode || ''
      this._openDimAttr = this._openDimAttr === code ? '' : code
      this._render()
      return
    }
    // 规则锚点多选下拉：展开/收起
    const aToggle = e.target instanceof Element ? e.target.closest('[data-anchor-toggle]') : null
    if (aToggle instanceof HTMLElement) {
      const key = `${aToggle.dataset.rule || ''}::${aToggle.dataset.kind || 'cols'}`
      this._openRuleAnchor = this._openRuleAnchor === key ? '' : key
      this._render()
      return
    }
    // 点击下拉浮层内部（勾选项）由 input 事件处理，不在此关闭
    if (e.target instanceof Element && e.target.closest('.ms-pop')) return
    // 点击下拉之外任意处 → 收起已展开的属性/锚点下拉（不 return，继续处理本次点击命中的其它按钮）
    if (this._openDimAttr && !(e.target instanceof Element && e.target.closest('.ms'))) {
      this._openDimAttr = ''
      this._render()
    }
    if (this._openRuleAnchor && !(e.target instanceof Element && e.target.closest('.ms'))) {
      this._openRuleAnchor = ''
      this._render()
    }
    const t = e.target instanceof Element ? e.target.closest('[data-action]') : null
    if (!(t instanceof HTMLElement)) return
    const action = t.dataset.action
    // 只读模式：仅放行导航/查看类动作，拦截一切写入类动作。
    if (this._readonly) {
      const NAV_ACTIONS = new Set(['toggle-dim', 'select-dim', 'select-panel', 'pick-table',
        'view-doc-detail', 'view-doc-info', 'view-doc-table-from-info', 'view-ref-dict', 'back-ref-dict',
        'close-table-picker', 'select-rule', 'select-field-tab', 'select-field', 'validate', 'preview', 'show-field-tips'])
      if (!NAV_ACTIONS.has(action)) return
    }
    // 这些按钮位于 <summary> 内，阻止默认的 details 折叠切换
    if (action === 'add-group' || action === 'add-subgroup') e.preventDefault()
    // 内嵌消息行关闭按钮：清空消息并重渲
    if (action === 'dismiss-msg') {
      this._message = ''
      this._messageType = ''
      this._render()
      return
    }
    if (action === 'show-field-tips') {
      const root = t.getRootNode()
      const text = t.dataset.fieldTips || ''
      let pop = root.querySelector('#cmx-field-tips-popover')
      if (!pop) {
        pop = document.createElement('ui5-popover')
        pop.id = 'cmx-field-tips-popover'
        pop.setAttribute('placement', 'Bottom')
        pop.style.maxWidth = '380px'
        const body = document.createElement('div')
        body.className = 'cmx-field-tips-body'
        pop.appendChild(body)
        root.appendChild(pop)
      }
      pop.querySelector('.cmx-field-tips-body').textContent = text
      pop.opener = t
      pop.open = true
    }
    if (action === 'toggle-dim') { this._dimensionsOpen = !this._dimensionsOpen; this._render() }
    if (action === 'add-dim') this._addDimension()
    if (action === 'remove-dim') this._removeDimension(t.dataset.code || '')
    if (action === 'select-dim') this._selectDimFromClick(e, t.dataset.code || '')
    if (action === 'select-panel') this._selectPanel(t.dataset.panel || '')
    if (action === 'add-panel') this._addPanel(t)
    if (action === 'remove-panel') this._removePanel(t.dataset.panel || '')
    if (action === 'rename-panel') this._renamePanel(t.dataset.panel || '', t)
    if (action === 'pick-table') this._pickTable(t.dataset.table || '')
    if (action === 'refresh-fieldtab-cols') { e.stopPropagation(); this._refreshFieldTabColumns(t.dataset.table || '') }
    if (action === 'view-doc-detail') this._viewDocDetail(t)
    if (action === 'view-doc-info') this._viewDocInfo()
    if (action === 'view-doc-table-from-info') { this._docInfoView = false; this._selectedDocTable = t.dataset.table || ''; this._render() }
    if (action === 'view-ref-dict') { const d = t.dataset.dict || ''; if (d) { this._refDictStack = [...this._refDictStack, d]; this._render() } }
    if (action === 'back-ref-dict') { this._refDictStack = this._refDictStack.slice(0, -1); this._render() }
    if (action === 'match-add-row') this._matchAddRow()
    if (action === 'match-remove-row') this._matchRemoveRow(Number(t.dataset.index))
    if (action === 'close-table-picker') { if (e.target === t || t.classList.contains('tp-x')) { this._tablePicker = null; this._render() } }
    if (action === 'add-rule') this._addRule()
    if (action === 'remove-rule') this._removeRule(t.dataset.rule || '')
    if (action === 'move-rule-up') this._moveRule(t.dataset.rule || '', -1)
    if (action === 'move-rule-down') this._moveRule(t.dataset.rule || '', 1)
    if (action === 'select-rule') this._selectRuleFromClick(e, t.dataset.rule || '')
    if (action === 'select-field-tab') this._selectFieldTab(t.dataset.fsindex || '0')
    if (action === 'add-field-tab') this._addFieldTab(t)
    if (action === 'remove-field-tab') this._removeFieldTab(t.dataset.fsindex || '0')
    if (action === 'rename-field-tab') this._renameFieldTab(t.dataset.fsindex || '0', t)
    if (action === 'add-field') this._addField()
    if (action === 'copy-fields') void this._copyFields()
    if (action === 'paste-fields') void this._pasteFields()
    if (action === 'open-formula') this._openFormula(t.dataset.fieldKey || t.dataset.code || '')
    if (action === 'formula-cancel') { if (e.target === t || (e.target instanceof Element && e.target.classList.contains('fx-x'))) { this._formulaEdit = null; this._render() } }
    if (action === 'formula-save') this._saveFormula()
    if (action === 'formula-insert') this._formulaInsert(t.dataset.token || '')
    if (action === 'formula-clear') { if (this._formulaEdit) { this._formulaEdit.draft = ''; this._render() } }
    if (action === 'remove-field') this._removeField(t.dataset.fieldKey || t.dataset.code || '')
    if (action === 'move-field-up') this._moveField(t.dataset.fieldKey || t.dataset.code || '', -1)
    if (action === 'move-field-down') this._moveField(t.dataset.fieldKey || t.dataset.code || '', 1)
    if (action === 'select-field') this._selectFieldFromClick(e, t.dataset.fieldKey || t.dataset.code || '')
    if (action === 'add-validation') this._addValidation()
    if (action === 'remove-validation') this._removeValidation(Number(t.dataset.index))
    if (action === 'add-enum') this._addEnum()
    if (action === 'remove-enum') this._removeEnum(Number(t.dataset.index))
    if (action === 'add-group') this._addGroup()
    if (action === 'remove-group') this._removeGroup(t.dataset.path || '')
    if (action === 'add-subgroup') this._addSubgroup(t.dataset.path || '')
    if (action === 'group-add-field') this._groupAddField(t.dataset.path || '', t.dataset.code || '')
    if (action === 'group-remove-member') this._groupRemoveMember(t.dataset.path || '', t.dataset.member || '')
    if (action === 'validate') void this._validate()
    if (action === 'preview') void this._previewCombination()
    if (action === 'save') void this._save()
    if (action === 'delete-combination') void this._deleteCombination()
    // 多版本
    if (action === 'open-version-dialog') this._openVersionDialog()
    if (action === 'close-version-dialog') { if (e.target === t || (e.target instanceof Element && e.target.classList.contains('ver-x'))) { this._versionDialog = null; this._render() } }
    if (action === 'create-version') void this._createVersion()
    if (action === 'open-version-manager') this._openVersionManager()
    if (action === 'close-version-manager') { if (e.target === t || (e.target instanceof Element && e.target.classList.contains('ver-x'))) { this._versionManagerOpen = false; this._render() } }
    if (action === 'set-default-version') void this._setDefaultVersion(t.dataset.scenario || '')
    if (action === 'delete-version') { if (!t.hasAttribute('disabled')) void this._deleteVersion(t.dataset.scenario || '') }
    if (action === 'vm-switch-version') { this._versionManagerOpen = false; this._switchVersion(t.dataset.scenario || '') }
  }

  _handleInput (e) {
    const t = e.target
    if (t instanceof HTMLTextAreaElement && t.id === 'combination-json') {
      // 源码视图 textarea 降级路径：回写 _combination。
      this.updateSourceText(t.value)
      return
    }
    if (t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement) {
      const prevSuppress = this._suppressContentSync
      this._suppressContentSync = !this.shadowRoot.contains(t)
      try {
      // 公式编辑器文本区：实时存草稿（不重渲染，保焦点）
      if (t instanceof HTMLTextAreaElement && t.dataset.formulaDraft != null) { if (this._formulaEdit) this._formulaEdit.draft = t.value; this._syncFormulaPreview(); return }
      // 维度属性多选下拉勾选：增删该列，局部更新摘要并保持下拉展开（不整体重渲染）
      if (t instanceof HTMLInputElement && t.dataset.attrPick != null) {
        this._toggleDimAttr(t.dataset.dimCode || '', t.dataset.col || '', t.checked)
        return
      }
      if (t instanceof HTMLInputElement && t.dataset.anchorPick != null) {
        this._toggleRuleAnchor(t.dataset.rule || '', t.dataset.kind || 'cols', t.dataset.col || '', t.checked)
        return
      }
      if (t.dataset.docRef != null) { if (this._readonly) return; void this._setDocRef(t.value); return }
      // 嵌入模式「档案」下拉：切换逻辑档案（导航）
      if (t.dataset.embedDoc != null && t instanceof HTMLSelectElement) { this._switchEmbedDoc(t.value); return }
      // 版本下拉：切到另一版本（导航，不属于 _combination 内容编辑）
      if (t.dataset.verSelect != null && t instanceof HTMLSelectElement) { this._switchVersion(t.value); return }
      // 只读模式：拦截一切 _combination 内容编辑（导航类下拉已在上方 return）
      if (this._readonly) return
      // 新建版本弹窗字段：只更新弹窗状态，不重渲染（保留输入焦点），版本号变更即时刷新提示
      if (t.dataset.verField && this._versionDialog) {
        this._versionDialog[t.dataset.verField] = (t instanceof HTMLInputElement && t.type === 'checkbox') ? t.checked : t.value
        if (t.dataset.verField === 'versionNo') {
          const hint = this.shadowRoot.querySelector('.ver-file-hint code')
          if (hint) hint.textContent = fcScenarioForVersion(fcScenarioParts(this._selected?.scenario || '').stem, Number(t.value) || 1)
        }
        return
      }
      // 规则匹配条件行式编辑（列/操作符/值）
      if (t.dataset.matchRow != null && t.dataset.matchPart) { this._updateMatchRow(Number(t.dataset.matchRow), t.dataset.matchPart, t.value); return }
      if (t.dataset.combinationProp) this._updateCombinationProp(t.dataset.combinationProp, t.value)
      if (t.dataset.dimensionCode && t.dataset.dimensionProp) this._updateDimension(t.dataset.dimensionCode, t.dataset.dimensionProp, t.value)
      if (t.dataset.ruleId && t.dataset.ruleProp) this._updateRule(t.dataset.ruleId, t.dataset.ruleProp, t.value)
      // 字段表格内联（统一渲染器）：data-field-key=code + 规范 data-field-prop → 适配器
      if (t.dataset.fieldKey && t.dataset.fieldProp) this._updateFieldByKey(t.dataset.fieldKey, t.dataset.fieldProp, inputRawValue(t), t.dataset.valueType)
      // Inspector：选中字段的规范 key 编辑（统一 schema 渲染器，data-field-path）→ 适配器
      if (t.dataset.fieldPath) this._updateFieldByPath(t.dataset.fieldPath, inputRawValue(t), t.dataset.valueType || 'string')
      // 分组节点属性（caption/aggregate.*/aggregatePosition）
      if (t.dataset.groupPath && t.dataset.groupProp) this._updateGroup(t.dataset.groupPath, t.dataset.groupProp, inputRawValue(t), t.dataset.valueType || 'string')
      // 模型级属性（combination.columnModel / rule.columnModel）
      if (t.dataset.columnModelScope && t.dataset.columnModelProp) this._updateColumnModel(t.dataset.columnModelScope, t.dataset.columnModelProp, t.value)
      // 分组加入字段下拉
      if (t.dataset.groupAddSelect != null && t.value) { this._groupAddField(t.dataset.groupAddSelect, t.value); return }
      // 校验/预览面板的锚点输入：存入状态（面板在独立 shadow，不能靠 DOM 查询回收）
      if (t.dataset.anchor) {
        const v = t.value
        if (v === '' || v == null) delete this._anchorValues[t.dataset.anchor]
        else this._anchorValues[t.dataset.anchor] = v
        this._preview = null
      }
      } finally {
        this._suppressContentSync = prevSuppress
      }
    }
  }

  async _loadList () {
    this._loading = true
    this._message = ''
    this._render()
    try {
      const data = await apiFetch('/api/flexible-combination/list')
      this._items = Array.isArray(data.items) ? data.items : []
      this._pbus.setItems(this._items)
      // 无任何选中时默认选第一个逻辑档案的默认版本（经总线广播，列表同步高亮）
      if (!this._combination && !this._pbus.selectedKey && this._items.length) {
        const first = groupFcItemsByStem(this._items)[0]
        this._pbus.select(this._itemKey(first ? first.default : this._items[0]))
      }
    } catch (err) {
      this._message = err instanceof Error ? err.message : String(err)
    } finally {
      this._loading = false
      this._render()
    }
  }

  /** 刷新列表元数据但保持当前选中：拉 list → setItems，不走默认 select、不重拉 config。
   *  用于保存/创建版本/删版本等写操作后——本地已是最新（data.saved）或目标不同 scenario 需另 select，
   *  只需更新左侧列表的标题/规则数/更新时间，不触发详情重复加载。 */
  async _refreshListKeepSelection () {
    try {
      const data = await apiFetch('/api/flexible-combination/list')
      this._items = Array.isArray(data.items) ? data.items : []
      this._pbus.setItems(this._items)
      // 更新当前选中 item 引用（保持高亮与最新元数据），但不触发 config 重新加载
      if (this._selected) {
        const cur = this._items.find((x) => this._itemKey(x) === this._itemKey(this._selected))
        if (cur) this._selected = cur
      }
    } catch (err) {
      this._message = err instanceof Error ? err.message : String(err)
    }
    this._render()
  }

  // ─── 嵌入模式（只读复用：集群数据源浏览等） ────────────────────────────────
  setDamFilter (domain, app, module) {
    this._damFilter = { domain: domain || '', app: app || '', module: module || '' }
    void this._loadListEmbed(true)
  }

  _embedFilteredItems () {
    const f = this._damFilter || {}
    return (this._items || []).filter((it) =>
      (!f.domain || it.domain === f.domain) &&
      (!f.app || it.app === f.app) &&
      (!f.module || it.module === f.module))
  }

  async _loadListEmbed (keepIfPossible = false) {
    this._loading = true; this._render()
    try {
      const data = await apiFetch('/api/flexible-combination/list')
      this._items = Array.isArray(data.items) ? data.items : []
      const filtered = this._embedFilteredItems()
      const stillValid = keepIfPossible && this._selected && filtered.some((x) => this._itemKey(x) === this._itemKey(this._selected))
      if (!stillValid) {
        const groups = groupFcItemsByStem(filtered)
        if (groups.length) await this._loadCombinationEmbed(this._itemKey(groups[0].default))
        else { this._selected = null; this._combination = null }
      }
    } catch (err) { this._message = err instanceof Error ? err.message : String(err) }
    finally { this._loading = false; this._render() }
  }

  /** 嵌入模式：直接加载某弹性组合版本（不经总线）。 */
  async _loadCombinationEmbed (key) {
    const item = (this._items || []).find((x) => this._itemKey(x) === key)
    if (!item) return
    this._selected = item
    try {
      const params = new URLSearchParams({ domain: item.domain, app: item.app, module: item.module, scenario: item.scenario })
      const data = await apiFetch(`/api/flexible-combination/config?${params.toString()}`)
      this._combination = data
      this._selectedRuleId = data?.rules?.[0]?.id || ''
      this._selectedPanel = ''
      this._dirty = false
      this._diagnostics = null
      this._preview = null
      await this._loadDocMeta()
    } catch (err) { this._message = err instanceof Error ? err.message : String(err) }
    this._render()
  }

  /** 嵌入模式「档案」下拉：一逻辑档案一项（选默认版本）。 */
  _renderEmbedDocSelect () {
    const groups = groupFcItemsByStem(this._embedFilteredItems())
    const curStem = this._selected ? fcScenarioParts(this._selected.scenario).stem : ''
    const curKey = this._selected ? `${this._selected.domain}/${this._selected.app}/${this._selected.module}/${curStem}` : ''
    const opts = groups.map((g) => `<option value="${escAttr(g.key)}" ${g.key === curKey ? 'selected' : ''}>${escHtml(g.default?.title || g.stem)}（${escHtml(g.domain)}/${escHtml(g.module)}）</option>`).join('')
    return `<select class="ver-select embed-doc-select" data-embed-doc aria-label="选择档案">
      <option value="">${groups.length ? '选择弹性组合' : '当前范围无弹性组合'}</option>${opts}
    </select>`
  }

  /** 嵌入模式：切换逻辑档案（默认版本）。 */
  _switchEmbedDoc (stemKey) {
    if (!stemKey) return
    const g = groupFcItemsByStem(this._embedFilteredItems()).find((x) => x.key === stemKey)
    if (g && g.default) void this._loadCombinationEmbed(this._itemKey(g.default))
  }

  async _loadCombination (key, rerender = true) {
    // 同一档案已加载且无未保存修改 → 不重复请求（请求去重）
    if (this._selected && this._itemKey(this._selected) === key && !this._dirty && this._combination) return
    // 仍是当前选中且有未保存草稿 → 不用服务器数据覆盖本地草稿（原语义保留）
    if (this._selected && this._itemKey(this._selected) === key && this._dirty && this._combination) return
    const pool = this._items.length ? this._items : this._pbus.items
    const item = pool.find((x) => this._itemKey(x) === key)
    if (!item) return
    if (this._dirty && !(await admConfirm({ title: '切换档案', message: '当前 JSON 有未保存修改，确定切换档案吗？' }))) return
    this._selected = item
    this._message = ''
    try {
      const params = new URLSearchParams({
        domain: item.domain,
        app: item.app,
        module: item.module,
        scenario: item.scenario,
      })
      const data = await apiFetch(`/api/flexible-combination/config?${params.toString()}`)
      this._combination = data
      this._selectedRuleId = data?.rules?.[0]?.id || ''
      this._selectedPanel = ''
      this._selectedFieldSet = 0
      this._selectedDimCode = ''
      this._selectedDocTable = ''
      this._docInfoView = false
      this._refDictStack = []
      this._extraPanels = []
      this._dirty = false
      this._diagnostics = null
      this._preview = null
      await this._loadDocMeta()
    } catch (err) {
      this._message = err instanceof Error ? err.message : String(err)
    }
    if (rerender) {
      this._render()
    }
  }

  // ─── 引用业务单据定义（docRef） ─────────────────────────────────────────────

  /** 拉取可引用的业务单据定义文件列表（DOC）。 */
  async _loadDocList () {
    try {
      const data = await apiFetch('/api/definitions/list?kind=DOC')
      this._docList = Array.isArray(data?.items) ? data.items : []
      this._pbus.emitState()
    } catch (err) { console.warn('[flex-combo] 单据定义列表拉取失败，引用下拉为空:', err?.message || err) }
  }

  /**
   * 加载各数据字典的列名，建 dictCode → [列名] 映射，供维度「属性」多选下拉做候选。
   * 列 = 字典本表字段 + 引用的 base fieldSet 字段（引用在前、去重）。
   */
  async _loadDictColumns () {
    const map = {}
    const groups = {}
    try {
      const data = await apiFetch('/api/definitions/list?kind=DCT')
      const files = Array.isArray(data?.items) ? data.items : []
      const baseCache = {}
      for (const it of files) {
        try {
          const params = new URLSearchParams({ domain: it.domain, application: it.application || it.app, module: it.module, file: it.file })
          const doc = await apiFetch(`/api/definitions/config?${params.toString()}`)
          const baseFile = doc?.baseDctMetaRef?.file || 'base_dct_meta_v1.json'
          let baseFS = baseCache[baseFile]
          if (!baseFS) { baseFS = await this._fetchBaseFieldSets(baseFile); baseCache[baseFile] = baseFS }
          for (const t of (doc.dictionaryTables || [])) {
            const code = t.dictMeta?.dictCode || t.tableName
            if (!code) continue
            const names = []
            const grps = []
            // 引用的 base fieldSet 各一组（只读，在前）
            for (const [k, v] of Object.entries(t)) {
              if (k.endsWith('FieldSet') && typeof v === 'string') {
                const fields = baseFS[v] || []
                grps.push({ name: v, ref: true, fields })
                for (const fld of fields) { const id = fieldId(fld); if (id) names.push(id) }
              }
            }
            // 本表自定义字段一组（在后）
            const own = Array.isArray(t.fields) ? t.fields : []
            if (own.length) grps.push({ name: '本字典定义字段', ref: false, fields: own })
            for (const fld of own) { const id = fieldId(fld); if (id) names.push(id) }
            map[code] = [...new Set(names)]
            groups[code] = grps
          }
        } catch { /* 跳过坏文件 */ }
      }
    } catch { /* 无字典定义则候选为空 */ }
    this._dictColumnsMap = map
    this._dictGroupsMap = groups
    this._pbus.emitState()
    this._render()
  }

  /** 拉取某 base 文件的 fieldSet → 字段数组映射（{name: fields[]}）。 */
  async _fetchBaseFieldSets (file) {
    try {
      // 业务编码定位：把文件名（base_doc_meta_v1.json）归一为 stem（base_doc_meta），
      // 用 kind=BASE&id=stem 让后端按 moduleCode 反查（支持多版本 isDefault 自动切换），不再裸读文件
      const stem = String(file || '').replace(/\.json$/i, '').replace(/_v\d+$/i, '')
      const params = new URLSearchParams({ kind: 'BASE', id: stem, domain: 'base' })
      const base = await apiFetch(`/api/definitions/config?${params.toString()}`)
      if (!base?.fieldSets) return {}
      const out = {}
      for (const [name, fs] of Object.entries(base.fieldSets)) out[name] = Array.isArray(fs?.fields) ? fs.fields : []
      return out
    } catch { return {} }
  }

  /** 某维度「属性」多选下拉的候选列：取该维度所引字典的列；无字典则返回空。 */
  _dimAttrOptions (dim) {
    const dictId = dim?.dict?.dictId
    return (dictId && this._dictColumnsMap[dictId]) || []
  }

  /** 规则锚点多选下拉的候选列：当前规则关联表（rule.panel/detail.table）在引用单据中的字段名。 */
  _ruleTableColumns (rule) {
    const tableName = rule?.panel || rule?.detail?.table || ''
    if (!tableName) return []
    const tables = Array.isArray(this._docMeta?.voucherTables) ? this._docMeta.voucherTables : []
    const t = tables.find((x) => x.tableName === tableName)
    if (!t) return []
    return (t.fields || []).map((f) => fieldId(f)).filter(Boolean)
  }

  /** 某单据表的全部列名：本表字段 + 引用的 documentFieldSet 列（用于「列是否在表中」校验/分组）。 */
  _docTableAllColumns (tableName) {
    if (!tableName) return []
    const tables = Array.isArray(this._docMeta?.voucherTables) ? this._docMeta.voucherTables : []
    const t = tables.find((x) => x.tableName === tableName)
    if (!t) return []
    const baseFS = this._docBaseFieldSets || {}
    const names = []
    for (const name of (Array.isArray(t.documentFieldSets) ? t.documentFieldSets : [])) {
      for (const f of (baseFS[name] || [])) { const id = fieldId(f); if (id) names.push(id) }
    }
    for (const f of (t.fields || [])) { const id = fieldId(f); if (id) names.push(id) }
    return [...new Set(names)]
  }

  /** 规则关联表的全部列（本表字段 + 引用 fieldSet 列）。 */
  _ruleTableAllColumns (rule) {
    return this._docTableAllColumns(rule?.panel || rule?.detail?.table || '')
  }

  /** 某单据表的全部字段对象（引用 documentFieldSet 字段 + 本表字段，去重）。 */
  _docTableAllFields (tableName) {
    if (!tableName) return []
    const tables = Array.isArray(this._docMeta?.voucherTables) ? this._docMeta.voucherTables : []
    const t = tables.find((x) => x.tableName === tableName)
    if (!t) return []
    const baseFS = this._docBaseFieldSets || {}
    const seen = new Set()
    const out = []
    const push = (f) => { const id = fieldId(f); if (!id || seen.has(id)) return; seen.add(id); out.push(f) }
    for (const name of (Array.isArray(t.documentFieldSets) ? t.documentFieldSets : [])) {
      for (const f of (baseFS[name] || [])) push(f)
    }
    for (const f of (t.fields || [])) push(f)
    // dimension 行的「引用字典」存在表级覆盖 t.fieldRefDicts[id]（不在列对象上）；
    // 导入时合并到列的 refDict，保证维度/引用字典随字段一起继承过来（与 _docTableOwnFields 一致）。
    const ovr = (t.fieldRefDicts && typeof t.fieldRefDicts === 'object') ? t.fieldRefDicts : {}
    return out.map((c) => {
      const dictOvr = ovr[fieldId(c)]
      return (dictOvr && !c.refDict) ? { ...c, refDict: dictOvr } : c
    })
  }

  /** 某单据表的「非参考列」=本表自定义字段（t.fields，不含引用 documentFieldSet 的公共列）。 */
  _docTableOwnFields (tableName) {
    if (!tableName) return []
    const tables = Array.isArray(this._docMeta?.voucherTables) ? this._docMeta.voucherTables : []
    const t = tables.find((x) => x.tableName === tableName)
    const fields = Array.isArray(t?.fields) ? t.fields : []
    // dimension 行的「引用字典」存在表级覆盖 t.fieldRefDicts[id]（不在列对象上）；
    // 导入时合并到列的 refDict，保证维度/引用字典随字段一起继承过来。
    const ovr = (t?.fieldRefDicts && typeof t.fieldRefDicts === 'object') ? t.fieldRefDicts : {}
    return fields.map((c) => {
      const dictOvr = ovr[fieldId(c)]
      return (dictOvr && !c.refDict) ? { ...c, refDict: dictOvr } : c
    })
  }

  /**
   * 单据表列（字典/单据字段对象）→ 弹性组合明细字段对象。列上所有属性继承到字段属性：
   *   id/name/caption、dimType、refDict 等；
   *   其余列属性（uiControl/dataType/fieldLength/nullable/enumValues/refField...）原样并入字段，便于编辑。
   */
  _docColumnToField (col) {
    // 存储键已三端统一：单据列与 CTX 字段同键，完整继承列的所有属性设置（不丢进逃生舱）。
    // 深拷贝整列作为基底，保证 fieldLength/intDigits/decimalDigits/agg/edit/refField… 全部带过来。
    const f = deepClone(col)
    // 标题回退、edit.mode 兜底
    f.id = fieldId(col)
    f.name = col.name || ''
    f.caption = (col.caption && typeof col.caption === 'object') ? { ...col.caption } : { zh_CN: fieldCaption(col) || col.label || fieldId(col) || '' }
    f.dimType = col.dimType || ''
    f.dataType = col.dataType || ''
    f.edit = { ...(col.edit && typeof col.edit === 'object' ? col.edit : {}), mode: col.edit?.mode || 'cmx-text-input' }
    if (col.nullable === false) f.edit.required = true
    // 引用字典：dimension 列绑定到 combination 维度（维度 code = refDict || id）
    const dimCode = col.refDict || (col.dimType === 'dimension' ? fieldId(col) : '')
    if (dimCode) f.refDict = dimCode
    return f
  }

  /**
   * 解析匹配条件列(key)的字段元数据 → { uiControl, dataType, refDict, enumValues }。
   *   本表列：从规则关联表字段查（id 匹配）。
   *   维度属性「维度.属性」：从该维度所引字典的字段查（id=属性名）。
   * 找不到返回 {}（回退普通文本输入）。
   */
  _matchColMeta (rule, combination, col) {
    if (!col) return {}
    if (col.includes('.')) {
      const [dimCode, attr] = col.split('.')
      const dictId = combination?.dimensions?.[dimCode]?.dict?.dictId
      const fields = (dictId && (this._dictGroupsMap[dictId] || []).flatMap((g) => g.fields || [])) || []
      const f = fields.find((x) => fieldId(x) === attr)
      return f ? { uiControl: f.edit?.mode, dataType: f.dataType, refDict: f.refDict, enumValues: f.enumValues } : {}
    }
    const f = this._docTableAllFields(rule?.panel || rule?.detail?.table || '').find((x) => fieldId(x) === col)
    return f ? { uiControl: f.edit?.mode, dataType: f.dataType, refDict: f.refDict, enumValues: f.enumValues } : {}
  }

  /** 按 combination.docRef 加载引用的业务单据定义全文。 */
  async _loadDocMeta () {
    this._docMeta = null
    this._docBaseFieldSets = {}
    const ref = this._combination?.docRef
    if (!ref?.file && !ref?.id && !ref?.application && !ref?.app) return
    try {
      // 业务编码定位（kind=DOC&id=moduleCode），不再传 file=.json 走裸文件读取
      // id 优先用 ref.id（新格式），回退 application/app（= moduleCode），最后回退 file（兼容旧 docRef）
      const docId = ref.id || ref.application || ref.app || ''
      const params = docId
        ? new URLSearchParams({ kind: 'DOC', id: docId, domain: ref.domain || '', application: ref.application || ref.app || '', module: ref.module || '' })
        : new URLSearchParams({ domain: ref.domain || '', application: ref.application || ref.app || '', module: ref.module || '', file: ref.file })
      const data = await apiFetch(`/api/definitions/config?${params.toString()}`)
      this._docMeta = data
      // 加载单据引用的 base doc fieldSet（供查看表列信息时展开 documentFieldSets）
      // base 也走业务编码定位（kind=BASE&id=stem），不再传 file=.json
      const baseFile = data?.baseDocMetaRef?.file || 'base_doc_meta_v1.json'
      this._docBaseFieldSets = await this._fetchBaseFieldSets(baseFile)
    } catch { /* 拉不到则忽略 */ }
  }

  /** 该单据各表的"维度字段"（dimType=dimension），派生为上下文维度池。 */
  _docDimensions () {
    const tables = Array.isArray(this._docMeta?.voucherTables) ? this._docMeta.voucherTables : []
    const out = []
    const seen = new Set()
    for (const t of tables) {
      for (const f of (t.fields || [])) {
        if (f.dimType !== 'dimension') continue
        const id = fieldId(f)
        const code = f.refDict || id
        if (!code || seen.has(code)) continue
        seen.add(code)
        out.push({
          code,
          name: fieldCaption(f) || code,
          dict: f.refDict ? { dictId: f.refDict, valueField: 'code', displayMode: 'code-label', helpLayout: 'grid' } : undefined,
          fromField: id,
          fromTable: t.tableName,
        })
      }
    }
    return out
  }

  /** 选择/清除引用的业务单据定义。key 形如 domain/application/module/file，空串=清除。 */
  async _setDocRef (key) {
    const p = normalizeCombination(this._combination || DEFAULT_COMBINATION)
    this._selectedDocTable = ''
    this._docInfoView = false
    this._refDictStack = []
    if (!key) { delete p.docRef } else {
      const it = this._docList.find((x) => this._docRefKey(x) === key)
      if (!it) return
      p.docRef = { domain: it.domain, application: it.application || it.app, app: it.application || it.app, module: it.module, file: it.file, title: it.title || it.file }
    }
    this._combination = p
    await this._loadDocMeta()
    // 引用后用单据维度覆盖维度池（维度来自业务单据定义引用到的维度）
    if (p.docRef) {
      const dims = {}
      for (const d of this._docDimensions()) {
        dims[d.code] = { name: d.name, attributes: ['name'], dict: d.dict }
      }
      p.dimensions = dims
      // 维度池被替换：清理 anchorDimensions / 各规则 anchor 中指向已不存在维度的悬空引用，
      // 否则校验报 ANCHOR_DIMENSION_UNKNOWN 导致保存 422。
      const validCodes = new Set(Object.keys(dims))
      p.anchorDimensions = (p.anchorDimensions || []).filter((c) => validCodes.has(c))
      for (const rule of (p.rules || [])) {
        if (Array.isArray(rule.anchor?.dimensions)) {
          rule.anchor.dimensions = rule.anchor.dimensions.filter((c) => validCodes.has(c))
        }
        if (rule.anchor?.match && typeof rule.anchor.match === 'object') {
          for (const k of Object.keys(rule.anchor.match)) if (!validCodes.has(k)) delete rule.anchor.match[k]
        }
      }
    }
    this._markDirty()
    this._render()
  }

  _readCombination () {
    // 源码视图编辑时已实时回写 _combination，这里直接归一化即可。
    return normalizeCombination(this._combination || DEFAULT_COMBINATION)
  }

  async _validate () {
    try {
      const combination = this._readCombination()
      // apiPost：HTTP/业务失败抛错进 catch 显示——不再出现「校验接口失败被当成校验通过」。
      const diag = (await apiPost('/api/flexible-combination/validate', { combination })) || {}
      // 合并客户端表结构相关校验（后端无引用单据表结构，无法判断列/字段是否在表中）
      const extra = this._clientDiagnostics(combination)
      const errors = [...(diag.errors || []), ...extra.errors]
      const warnings = [...(diag.warnings || []), ...extra.warnings]
      this._diagnostics = { valid: errors.length === 0, errors, warnings }
      // 校验结果统一走弹窗展示（通过/未通过 + 错误/警告逐条明细），不再重复设底部消息条
      this._message = ''
      this._messageType = ''
      const details = [
        ...errors.map((e) => `✕ ${e.path ? e.path + ' ' : ''}${e.message}`),
        ...warnings.map((w) => `⚠ ${w.path ? w.path + ' ' : ''}${w.message}`),
      ]
      await showCmxMessage({
        level: this._diagnostics.valid ? 'info' : 'error',
        title: this._diagnostics.valid ? '校验通过' : '校验未通过',
        message: this._diagnostics.valid
          ? '所有规则校验通过，无错误。'
          : `共 ${errors.length} 项错误${warnings.length ? `、${warnings.length} 项警告` : ''}。`,
        details: details.length ? details : undefined,
      })
    } catch (err) {
      this._message = err instanceof Error ? err.message : String(err)
      this._messageType = 'error'
    }
    this._render()
  }

  /**
   * 客户端表结构相关校验（依赖已加载的引用单据 _docMeta）：
   *   - 锚点维度是否在 dimensions 中定义
   *   - 锚点列是否在规则所在表中
   *   - 明细字段（dimension 类型）的维度引用、字段绑定列是否在所在表中
   * 引用单据未加载或规则未关联表时跳过对应检查（避免误报）。
   */
  _clientDiagnostics (combination) {
    const errors = []; const warnings = []
    const dimCodes = new Set(Object.keys(combination.dimensions || {}))
    const hasDoc = Array.isArray(this._docMeta?.voucherTables) && this._docMeta.voucherTables.length > 0
    ;(combination.rules || []).forEach((rule, ri) => {
      const rp = `rules.${ri}`
      const tableName = rule.panel || rule.detail?.table || ''
      // 锚点维度 ∈ dimensions
      for (const [i, d] of (rule.anchor?.dimensions || []).entries()) {
        if (!dimCodes.has(d)) errors.push({ path: `${rp}.anchor.dimensions.${i}`, code: 'ANCHOR_DIMENSION_UNKNOWN', message: `锚点维度 ${d} 未在维度列表中定义` })
      }
      // 锚点列 ∈ 规则所在表
      if (hasDoc && tableName) {
        const cols = new Set(this._docTableAllColumns(tableName))
        for (const [i, c] of (rule.anchor?.columns || []).entries()) {
          if (!cols.has(c)) errors.push({ path: `${rp}.anchor.columns.${i}`, code: 'ANCHOR_COLUMN_NOT_IN_TABLE', message: `锚点列 ${c} 不在规则所在表 ${tableName} 中` })
        }
      }
      // 明细字段：各字段集字段绑定的列是否在其关联表中（id/sourceColumn）
      if (hasDoc) {
        for (const fs of this._fieldSets(rule)) {
          const fsTable = fs.table || tableName
          if (!fsTable) continue
          const cols = new Set(this._docTableAllColumns(fsTable))
          if (!cols.size) continue
          for (const [i, f] of (this._resolvedFields(fs).entries())) {
            const id = fieldId(f)
            const colRef = f.sourceColumn || f.column?.field || id
            // 仅当字段显式声明了来源列时才校验（公式/常量等无来源列字段跳过）
            if (colRef && (f.dimType === 'dimension' || f.dimType === 'attribute' || f.sourceColumn) && !cols.has(colRef)) {
              warnings.push({ path: `${rp}.fieldSet[${fs.index}].fields.${i}`, code: 'FIELD_COLUMN_NOT_IN_TABLE', message: `字段 ${id} 绑定列 ${colRef} 不在表 ${fsTable} 中` })
            }
          }
        }
      }
    })
    // 引用类诊断（overlay use/pick/over 的断表/断列/物理类型/跨 DAM 可见性）——
    // 复用统一 diagnoseReferences，注入本组件已加载的单据表列访问器。
    if (hasDoc) {
      const ref = diagnoseReferences(combination, {
        tableCols: (t) => {
          const tab = (this._docMeta?.voucherTables || []).find((x) => x.tableName === t)
          return tab ? this._docTableAllFields(t) : null
        },
        hasDoc,
      })
      errors.push(...ref.errors)
      warnings.push(...ref.warnings)
    }
    return { errors, warnings }
  }

  async _previewCombination () {
    try {
      const combination = this._readCombination()
      const anchor = {}
      for (const [k, v] of Object.entries(this._anchorValues || {})) {
        if (v !== '' && v != null) anchor[k] = v
      }
      const data = await apiFetch('/api/flexible-combination/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ combination, anchor }),
      })
      this._preview = data
      this._diagnostics = data.diagnostics
      // 预览结果统一走弹窗展示（匹配规则 + 列模型 + 成员明细），不再重复设底部消息条
      this._message = ''
      this._showPreviewDialog(data)
    } catch (err) {
      this._message = err instanceof Error ? err.message : String(err)
    }
    this._render()
  }

  /** 预览结果弹窗：用 CmxFloatingDialog 纯展示（无确认/取消按钮），关掉即消失、不占布局。 */
  _showPreviewDialog (data) {
    const matched = data?.ruleId
    const members = Array.isArray(data?.members) ? data.members : []
    const cm = data?.columnModel
    const body = document.createElement('div')
    body.className = 'fc-preview-body'
    // eslint-disable-next-line no-restricted-syntax -- 静态结构，值经 escHtml/escAttr 转义。
    body.innerHTML = `
      <style>
        .fc-preview-body { flex: 1 1 auto; min-height: 0; overflow: auto; font-family: var(--sapFontFamily, inherit); color: var(--sapTextColor, #1d2d3e); font-size: 13px; }
        .fc-preview-row { margin-bottom: 12px; }
        .fc-preview-row h4 { margin: 0 0 6px; font-size: 13px; color: var(--sapContent_LabelColor, #6a6d70); font-weight: 600; }
        .fc-preview-row code { font-family: var(--sapFontMonospaceFamily, monospace); background: var(--sapList_TableGroupHeaderBackground, #f0f0f0); padding: 2px 6px; border-radius: 3px; }
        .fc-preview-row pre { margin: 0; background: var(--sapList_TableGroupHeaderBackground, #f0f0f0); padding: 8px 10px; border-radius: 4px; font-family: var(--sapFontMonospaceFamily, monospace); font-size: 12px; white-space: pre-wrap; word-break: break-all; max-height: 200px; overflow: auto; }
        .fc-preview-empty { color: var(--sapContent_LabelColor, #6a6d70); padding: 8px 0; }
      </style>
      <div class="fc-preview-row"><h4>匹配规则</h4>${matched ? `<code>${escHtml(matched)}</code>` : '<span class="fc-preview-empty">未匹配到规则（检查锚点值是否命中规则条件）</span>'}</div>
      ${cm ? `<div class="fc-preview-row"><h4>列模型（${Array.isArray(cm) ? cm.length : 0} 列）</h4><pre>${escHtml(JSON.stringify(cm, null, 2))}</pre></div>` : ''}
      ${members.length ? `<div class="fc-preview-row"><h4>成员明细（${members.length} 项）</h4><pre>${escHtml(JSON.stringify(members, null, 2))}</pre></div>` : ''}`
    const dlg = document.createElement('cmx-floating-dialog')
    dlg.configure({
      title: '预览结果',
      icon: 'show',
      showConfirm: false,
      showCancel: false,
      dialogWidth: '560px',
      dialogHeight: '480px',
    })
    dlg.setContent(body)
    document.body.appendChild(dlg)
    void dlg.openModal()
  }

  async _save () {
    try {
      const combination = this._readCombination()
      const domain = combination.domain || this._selected?.domain
      const app = combination.app || this._selected?.app
      const module = combination.module || this._selected?.module
      const scenario = combination.scenario || this._selected?.scenario
      const params = new URLSearchParams({ domain, app, module, scenario })
      // B2 例外：保存校验失败时须读响应体里的 diagnostics 结构化明细（逐条 path+message），
      // apiFetch 抛错会丢弃 body，故保持 raw fetch 自行判错。
      const res = await fetch(`/api/flexible-combination/config?${params.toString()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(combination),
      })
      const data = await res.json()
      if (!res.ok) {
        this._diagnostics = data?.diagnostics || null
        const errs = data?.diagnostics?.errors || []
        const detail = errs.length ? `：${errs.slice(0, 3).map((e) => `${e.path} ${e.message}`).join('；')}${errs.length > 3 ? ` 等${errs.length}项` : ''}` : ''
        throw new Error((data?.error || '保存失败（校验未通过）') + detail)
      }
      this._combination = data.saved
      this._selected = { domain, app, module, scenario }
      this._dirty = false
      this._message = '已保存'
      this._messageType = 'success'
      // 刷新列表元数据（标题/规则数/更新时间），但不重选、不重拉 config（本地 data.saved 已是最新）
      await this._refreshListKeepSelection()
    } catch (err) {
      this._message = err instanceof Error ? err.message : String(err)
      this._messageType = 'error'
      this._render()
    }
  }

  /** 删除前的非空保护提示：弹窗 + 底部消息。 */
  _alertBlocked (msg) {
    showDefWarn('操作受限', msg)
    this._message = msg
    this._messageType = 'error'
    this._render()
  }

  /** 删除当前弹性组合：有规则则禁删，无规则则确认后删除后端文件并重置为空草稿。 */
  async _deleteCombination () {
    const sel = this._selected
    if (!sel || !sel.scenario) { this._alertBlocked('请先选择一个弹性组合。'); return }
    const p = normalizeCombination(this._combination || DEFAULT_COMBINATION)
    const ruleCount = Array.isArray(p.rules) ? p.rules.length : 0
    // 非空保护：已定义规则则不允许删除
    if (ruleCount > 0) {
      this._alertBlocked(`弹性组合「${this._combination?.title || sel.scenario}」已定义 ${ruleCount} 条规则，不能删除。请先删除其所有规则。`)
      return
    }
    const delOk = await admConfirm({ title: '删除弹性组合', message: `确定删除弹性组合「${this._combination?.title || sel.scenario}」(${sel.domain}/${sel.app}/${sel.module}/${sel.scenario})？此操作不可恢复。`, danger: true })
    if (!delOk) return
    try {
      const params = new URLSearchParams({ domain: sel.domain, app: sel.app, module: sel.module, scenario: sel.scenario })
      await apiFetch(`/api/flexible-combination/config?${params.toString()}`, { method: 'DELETE' })
      this._combination = null
      this._selected = null
      this._dirty = false
      this._selectedRuleId = ''
      this._message = '弹性组合已删除'
      this._messageType = 'success'
      if (typeof this._pbus !== 'undefined' && this._pbus) this._pbus.selectedKey = ''
      await this._loadList()
      this._render()
    } catch (err) {
      this._message = '删除失败：' + (err instanceof Error ? err.message : String(err))
      this._messageType = 'error'
      this._render()
    }
  }
  _render () {
    const combination = normalizeCombination(this._combination || DEFAULT_COMBINATION)
    // 全量重建会丢失滚动位置 → 渲染前记下各滚动容器位置，渲染后恢复（消除点行后跳顶）
    const scrollState = this._captureScrollState()
    // eslint-disable-next-line no-restricted-syntax -- 所有动态文本/属性均经 escHtml/escAttr；保留模板渲染便于维护。
    this.shadowRoot.innerHTML = `
      <style>
        ${FLC_MANAGER_STYLES}
        ${ADM_ALL_CSS}
        ${admColorSchemeCss()}
      </style>
      <div class="wrap">
        <main class="main">
          <div class="panel-head">
            ${this._embed
              ? `<span class="embed-kind-label">弹性组合：</span>${this._renderEmbedDocSelect()}`
              : `<div class="title">${escHtml(this._combination?.title || this._combination?.scenario || '未选择弹性组合')}${this._dirty ? ' *' : ''}</div>`}
            ${this._renderDocRefInline(combination)}
            <span class="spacer"></span>
            ${this._renderVersionControl()}
            ${this._embed || this._readonly ? '' : `<button type="button" class="adm-icon-btn ghost" data-action="validate" title="校验"><ui5-icon name="validate"></ui5-icon></button>
            <button type="button" class="adm-icon-btn ghost" data-action="preview" title="预览"><ui5-icon name="show"></ui5-icon></button>
            <button type="button" class="adm-icon-btn danger" data-action="delete-combination" title="删除当前弹性组合"><ui5-icon name="delete"></ui5-icon></button>
            <button type="button" class="adm-icon-btn primary" data-action="save" title="保存"><ui5-icon name="save"></ui5-icon></button>`}
          </div>
          ${this._renderDesigner(combination)}
          ${this._renderMessage()}
        </main>
        ${this._renderFormulaEditor(combination)}
        ${this._renderVersionDialog()}
        ${this._renderVersionManager()}
      </div>
    `
    this._restoreScrollState(scrollState)
    // 通知 property 区的面板 + content 区「源码」视图同步重渲
    this._pbus.emitState()
  }

  _captureScrollState () {
    const selectors = ['.design-layout', '.rule-table-scroll', '.fields-table-scroll', '.design-row .box-body', '.tp-list']
    return selectors.map((selector) => ({
      selector,
      positions: Array.from(this.shadowRoot.querySelectorAll(selector)).map((el) => ({
        top: el.scrollTop || 0,
        left: el.scrollLeft || 0,
      })),
    }))
  }

  _restoreScrollState (state) {
    if (!Array.isArray(state)) return
    for (const item of state) {
      const nodes = Array.from(this.shadowRoot.querySelectorAll(item.selector))
      nodes.forEach((el, index) => {
        const pos = item.positions[index]
        if (!pos) return
        el.scrollTop = pos.top || 0
        el.scrollLeft = pos.left || 0
      })
    }
  }

  _renderDimensionsTable (combination) {
    const rows = Object.entries(combination.dimensions || {})
    if (!rows.length) return '<div class="item-sub" style="padding:10px">还没有维度，点击右上角新增。</div>'
    return `<table>
      <thead><tr><th class="idx">#</th><th style="width:120px">编码</th><th style="width:140px">名称</th><th>属性</th><th style="width:70px"></th></tr></thead>
      <tbody>${rows.map(([code, dim], i) => `<tr class="dim-row ${code === this._selectedDimCode ? 'selected' : ''}" data-action="select-dim" data-code="${escAttr(code)}">
        <td class="idx">${i + 1}</td>
        <td><input data-dimension-code="${escAttr(code)}" data-dimension-prop="code" value="${escAttr(code)}"></td>
        <td><input data-dimension-code="${escAttr(code)}" data-dimension-prop="name" value="${escAttr(dim.name || dim.caption || '')}"></td>
        <td class="ms-cell">${this._renderAttrMultiSelect(code, dim)}</td>
        <td>
          <button class="icon-btn ${code === this._selectedDimCode ? 'on' : ''}" data-action="select-dim" data-code="${escAttr(code)}" title="查看列信息"><ui5-icon name="detail-view"></ui5-icon></button>
          <button class="icon-btn danger" data-action="remove-dim" data-code="${escAttr(code)}" title="删除"><ui5-icon name="delete"></ui5-icon></button>
        </td>
      </tr>`).join('')}</tbody>
    </table>`
  }

  /**
   * 维度「属性」多选下拉（自绘，全量重渲染友好）：候选=该维度所引字典的列，多选以逗号分隔存为数组。
   * 用 data-attr-toggle 控制展开（_openDimAttr 记忆，避免重渲染收起）；勾选走 data-attr-pick。
   */
  _renderAttrMultiSelect (code, dim) {
    const selected = Array.isArray(dim.attributes) ? dim.attributes : (dim.attributes && typeof dim.attributes === 'object' ? Object.keys(dim.attributes) : [])
    const options = this._dimAttrOptions(dim)
    // 候选可能不含已选项（字典未加载/列已删）→ 合并，保证已选可见可取消
    const all = [...new Set([...options, ...selected])]
    const open = this._openDimAttr === code
    const summary = selected.length ? escHtml(selected.join(', ')) : '<span class="ms-ph">选择属性列…</span>'
    const noDict = !dim?.dict?.dictId
    const list = all.length
      ? all.map((col) => `<label class="ms-opt"><input type="checkbox" data-attr-pick data-dim-code="${escAttr(code)}" data-col="${escAttr(col)}" ${selected.includes(col) ? 'checked' : ''}><span>${escHtml(col)}</span></label>`).join('')
      : `<cmx-empty-state icon="search" title="${noDict ? '该维度未引用字典，无候选列' : '字典无可选列'}" size="sm"></cmx-empty-state>`
    return `<div class="ms ${open ? 'open' : ''}">
      <button type="button" class="ms-head" data-attr-toggle data-dim-code="${escAttr(code)}" title="多选属性列">
        <span class="ms-val">${summary}</span><span class="ms-caret">▾</span>
      </button>
      ${open ? `<div class="ms-pop">${list}</div>` : ''}
    </div>`
  }

  /**
   * 规则锚点多选下拉（自绘）。kind:
   *   'dims' → 候选=弹性组合维度(combination.dimensions)，存 anchor.dimensions（锚点维度）
   *   'cols' → 候选=规则关联表的列，存 anchor.columns（锚点列）
   * 用 data-anchor-toggle + data-kind 控制展开（_openRuleAnchor 记 `${id}::${kind}`）；勾选走 data-anchor-pick。
   */
  _renderAnchorMultiSelect (rule, combination, kind) {
    const isDims = kind === 'dims'
    const selected = isDims
      ? (Array.isArray(rule.anchor?.dimensions) ? rule.anchor.dimensions : [])
      : (Array.isArray(rule.anchor?.columns) ? rule.anchor.columns : [])
    const options = isDims ? Object.keys(combination.dimensions || {}) : this._ruleTableColumns(rule)
    const all = [...new Set([...options, ...selected])]
    const key = `${rule.id}::${kind}`
    const open = this._openRuleAnchor === key
    const ph = isDims ? '选择锚点维度…' : '选择锚点列…'
    const summary = selected.length ? escHtml(selected.join(', ')) : `<span class="ms-ph">${ph}</span>`
    const noTable = !isDims && !(rule.panel || rule.detail?.table)
    const empty = isDims ? '档案未定义维度' : (noTable ? '该规则未关联数据表，无候选列' : '关联表无可选列')
    const list = all.length
      ? all.map((col) => `<label class="ms-opt"><input type="checkbox" data-anchor-pick data-rule="${escAttr(rule.id)}" data-kind="${kind}" data-col="${escAttr(col)}" ${selected.includes(col) ? 'checked' : ''}><span>${escHtml(col)}</span></label>`).join('')
      : `<cmx-empty-state icon="list" title="${empty}" size="sm"></cmx-empty-state>`
    return `<div class="ms ${open ? 'open' : ''}">
      <button type="button" class="ms-head" data-anchor-toggle data-rule="${escAttr(rule.id)}" data-kind="${kind}" title="${ph}">
        <span class="ms-val">${summary}</span><span class="ms-caret">▾</span>
      </button>
      ${open ? `<div class="ms-pop">${list}</div>` : ''}
    </div>`
  }

  // ─── property 区面板（检查器 / 校验预览）的对外渲染与事件入口 ───────────────
  // 这两个面板是独立 Web Component（分属另一 shadowRoot），把渲染与事件委托回主体，
  // 复用既有 _renderInspector / _renderDiagnostics / _handleClick / _handleInput 全部逻辑。

  /** 「检查器」面板正文 HTML（选中字段的显示/编辑/字典/带出/校验/列属性）。 */
  renderInspectorPanelHtml () {
    const combination = normalizeCombination(this._combination || DEFAULT_COMBINATION)
    return `<div class="inspect-body">${this._renderInspector(combination)}</div>`
  }

  /** 「校验/预览」面板正文 HTML（锚点输入 + 诊断 + 预览）。 */
  renderVerifyPanelHtml () {
    const combination = normalizeCombination(this._combination || DEFAULT_COMBINATION)
    const anchors = Array.isArray(combination.anchorDimensions) ? combination.anchorDimensions : []
    const av = this._anchorValues || {}
    return `<div class="inspect-body">
      <div class="panel-head">
        <div class="title">校验与预览</div><span class="spacer"></span>
        <ui5-button icon="validate" design="Transparent" data-action="validate">校验</ui5-button>
        <ui5-button icon="show" design="Transparent" data-action="preview">预览</ui5-button>
      </div>
      <section class="section">
        <h3>锚点</h3>
        <div class="kv">${anchors.length ? anchors.map((a) => `<label>${escHtml(a)}</label><input data-anchor="${escAttr(a)}" value="${escAttr(av[a] || '')}" placeholder="${escAttr(a)}">`).join('') : '<div style="grid-column:1/-1;color:var(--sapContent_LabelColor,#6a6d70)">未定义 anchorDimensions</div>'}</div>
      </section>
      <section class="section">
        <h3>诊断</h3>
        ${this._renderDiagnostics()}
      </section>
      <section class="section">
        <h3>预览</h3>
        <pre>${escHtml(this._preview ? JSON.stringify({ ruleId: this._preview.ruleId, columnModel: this._preview.columnModel, members: this._preview.members }, null, 2) : '尚未预览')}</pre>
      </section>
      <div class="msg">${escHtml(this._message || '')}</div>
    </div>`
  }

  /** 面板事件转发（target 在面板 shadow 内，但 _handleClick/_handleInput 用 closest，跨 shadow 可用）。 */
  handlePanelClick (e) { this._handleClick(e) }
  handlePanelInput (e) { this._handleInput(e) }

  /** ui5-checkbox / cmx-dict-select 的 change/cmx-dict-change：取值写回匹配条件值。 */
  handlePanelChange (e) {
    const t = e.target
    if (!(t instanceof HTMLElement)) return
    if (t.dataset.fieldPath) {
      this._updateFieldByPath(t.dataset.fieldPath, inputRawValue(t), t.dataset.valueType || 'string')
      if (t.dataset.fieldPath === 'edit.mode') this._pbus.emitState(true)
      return
    }
    if (t.dataset.matchRow == null || t.dataset.matchPart !== 'val') return
    let value = ''
    if (t.dataset.matchControl === 'checkbox') value = t.checked ? 'true' : ''
    else if (t.dataset.matchControl === 'dict') value = (e.detail && e.detail.id != null) ? String(e.detail.id) : (t.getValue ? (t.getValue() || '') : '')
    else value = t.value != null ? String(t.value) : ''
    this._updateMatchRow(Number(t.dataset.matchRow), 'val', value)
  }

  /** content 区标题行内联「引用单据」下拉（按单据分组，版本缩进分层展示）。 */
  _renderDocRefInline (_combination) {
    const ref = this._combination?.docRef
    const refKey = ref ? this._docRefKey(ref) : ''
    // 按逻辑单据(stem)分组，每个单据下用 optgroup 缩进列出其各版本。
    const groups = groupDocItemsByStem(this._docList || [])
    const docOpts = groups.map((g) => {
      const dam = `${g.domain}/${g.application}/${g.module}`
      const opts = g.versions.map((it) => {
        const k = this._docRefKey(it)
        const n = docItemVersion(it)
        const star = docItemIsDefault(it) ? '★ ' : ''
        const vn = it.versionName ? `·${it.versionName}` : ''
        return `<option value="${escAttr(k)}" ${k === refKey ? 'selected' : ''}>${escHtml(`${star}版本 ${n}${vn}`)}</option>`
      }).join('')
      // 单层 optgroup：label=单据标题（DAM），版本作为缩进选项。
      return `<optgroup label="${escAttr(`${g.title}（${dam}）`)}">${opts}</optgroup>`
    }).join('')
    const mm = this._docMeta?.moduleMeta
    const title = (ref && mm) ? `引用单据：${mm.metaName || ''}（${mm.moduleCode || ''}）` : '引用业务单据定义（维度来源）'
    return `<div class="docref-inline" title="${escAttr(title)}">
      <span class="docref-label">引用单据</span>
      <select data-doc-ref>
        <option value="">（不引用）</option>
        ${docOpts}
      </select>
      <button type="button" class="docref-view icon-btn" data-action="view-doc-detail" title="查看单据定义详情" ${ref ? '' : 'disabled'}><ui5-icon name="detail-view"></ui5-icon></button>
    </div>`
  }

  // ─── 多版本 ────────────────────────────────────────────────────────────────

  /** 当前选中档案的同 stem 兄弟版本项（按版本号升序；兜底确保当前 scenario 在内）。 */
  _currentVersionItems () {
    const sel = this._selected
    if (!sel || !sel.scenario) return []
    const stem = fcScenarioParts(sel.scenario).stem
    const matched = (this._items || []).filter((it) =>
      it.domain === sel.domain && it.app === sel.app && it.module === sel.module && fcScenarioParts(it.scenario).stem === stem)
    if (!matched.some((it) => it.scenario === sel.scenario)) {
      matched.push({
        domain: sel.domain, app: sel.app, module: sel.module, scenario: sel.scenario,
        versionName: this._combination?.versionName || '',
        isDefault: this._combination?.isDefault === true,
        title: this._combination?.title || sel.scenario,
      })
    }
    return matched.sort((a, b) => fcItemVersion(a) - fcItemVersion(b))
  }

  /** content 标题区版本下拉（右侧，带「版本：」label + 默认★）+ 版本管理 + 新建。 */
  _renderVersionControl () {
    if (!this._combination || !this._selected?.scenario) return ''
    const versions = this._currentVersionItems()
    const curScenario = this._selected.scenario
    const opts = versions.map((v) => {
      const n = fcItemVersion(v)
      const nm = (v.scenario === curScenario ? (this._combination?.versionName || v.versionName) : v.versionName) || ''
      const star = fcItemIsDefault(v) ? '★ ' : ''
      const label = `${star}v${n}${nm ? `·${nm}` : ''}`
      return `<option value="${escAttr(v.scenario)}" ${v.scenario === curScenario ? 'selected' : ''}>${escHtml(label)}</option>`
    }).join('')
    return `<div class="ver-control" title="版本">
      <span class="ver-label">版本：</span>
      <select class="ver-select" data-ver-select aria-label="选择版本">${opts}</select>
      ${(this._embed || this._readonly) ? '' : `<button type="button" class="icon-btn ver-btn" data-action="open-version-manager" title="版本管理"><ui5-icon name="settings"></ui5-icon></button>
      <button type="button" class="icon-btn ver-btn" data-action="open-version-dialog" title="新建版本"><ui5-icon name="add"></ui5-icon></button>`}
    </div>`
  }

  /** 切换到同档案的另一版本（未保存修改时确认丢弃）。 */
  async _switchVersion (scenario) {
    if (!scenario || !this._selected || scenario === this._selected.scenario) return
    if (this._embed) { void this._loadCombinationEmbed(`${this._selected.domain}/${this._selected.app}/${this._selected.module}/${scenario}`); return }
    if (this._dirty && !(await admConfirm({ title: '切换版本', message: '当前修改未保存，切换版本将丢失这些修改。是否继续？' }))) {
      this._render()
      return
    }
    const sel = this._selected
    this._dirty = false
    this._pbus.select(`${sel.domain}/${sel.app}/${sel.module}/${scenario}`)
  }

  /** 打开「新建版本」弹窗：默认版本号=现有最大版本号+1。 */
  async _openVersionDialog () {
    if (!this._combination || !this._selected?.scenario) { showDefWarn('未打开档案', '请先打开一个弹性组合。'); return }
    const maxNo = this._currentVersionItems().reduce((m, v) => Math.max(m, fcItemVersion(v)), 0)
    this._versionDialog = { versionNo: String(maxNo + 1), versionName: '', setDefault: false }
    this._versionManagerOpen = false
    this._render()
  }

  /** 「新建版本」弹窗（覆盖层，复用 fx-backdrop 风格）。 */
  _renderVersionDialog () {
    const d = this._versionDialog
    if (!d) return ''
    const stem = fcScenarioParts(this._selected?.scenario || '').stem
    const scen = fcScenarioForVersion(stem, Number(d.versionNo) || 1)
    return `<div class="ver-backdrop" data-action="close-version-dialog">
      <section class="ver-modal" data-ver-stop>
        <div class="ver-modal-head"><h3>新建版本</h3><button type="button" class="ver-x" data-action="close-version-dialog" title="取消">✕</button></div>
        <div class="ver-form">
          <label>版本号</label><input data-ver-field="versionNo" type="number" min="1" step="1" value="${escAttr(d.versionNo)}">
          <label>版本名称</label><input data-ver-field="versionName" value="${escAttr(d.versionName)}" placeholder="如：2024 年度版">
        </div>
        <label class="ver-check"><input type="checkbox" data-ver-field="setDefault" ${d.setDefault ? 'checked' : ''}>创建后设为默认版本</label>
        <div class="ver-file-hint">将基于当前内容创建档案：<code>${escHtml(scen)}</code></div>
        <div class="ver-modal-foot"><button type="button" class="ver-create-btn" data-action="create-version"><ui5-icon name="add"></ui5-icon>创建版本</button></div>
      </section>
    </div>`
  }

  /** 以当前档案为蓝本克隆出新版本（写 versionName，保存为新 scenario）。 */
  async _createVersion () {
    const d = this._versionDialog
    if (!d || !this._combination || !this._selected?.scenario) return
    const verNo = Math.floor(Number(d.versionNo))
    if (!Number.isFinite(verNo) || verNo < 1) { showDefWarn('版本号无效', '请输入有效的版本号（正整数）。'); return }
    const sel = this._selected
    const stem = fcScenarioParts(sel.scenario).stem
    const scenario = fcScenarioForVersion(stem, verNo)
    if ((this._items || []).some((it) => it.domain === sel.domain && it.app === sel.app && it.module === sel.module && it.scenario === scenario)) {
      showDefWarn('版本号重复', `版本号 ${verNo} 已存在（${scenario}），请换一个版本号。`); return
    }
    const combination = normalizeCombination(this._readCombination())
    combination.domain = sel.domain; combination.app = sel.app; combination.application = sel.app; combination.module = sel.module
    combination.scenario = scenario
    combination.versionName = d.versionName || ''
    combination.isDefault = false
    try {
      const params = new URLSearchParams({ domain: sel.domain, app: sel.app, module: sel.module, scenario })
      await apiFetch(`/api/flexible-combination/config?${params.toString()}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(combination),
      })
      if (d.setDefault) await this._postSetDefault(scenario)
      this._versionDialog = null
      this._dirty = false
      // 刷新列表（含新版本），但不走默认 select；随后显式 select 新版本（不同 key，_loadCombination 必然加载新数据）
      await this._refreshListKeepSelection()
      this._pbus.select(`${sel.domain}/${sel.app}/${sel.module}/${scenario}`)
    } catch (err) { showDefError('创建版本失败', err instanceof Error ? err.message : String(err)) }
  }

  // ─── 版本管理弹窗 ──────────────────────────────────────────────────────────

  async _openVersionManager () {
    if (!this._combination || !this._selected?.scenario) { window.alert('请先打开一个弹性组合。'); return }
    this._versionManagerOpen = true
    this._versionDialog = null
    this._render()
  }

  /** 版本管理弹窗：列出所有版本（号/名/更新时间/默认），可设默认、删除、打开。 */
  _renderVersionManager () {
    if (!this._versionManagerOpen) return ''
    const versions = this._currentVersionItems()
    const curScenario = this._selected?.scenario
    const rows = versions.map((v) => {
      const n = fcItemVersion(v)
      const nm = (v.scenario === curScenario ? (this._combination?.versionName || v.versionName) : v.versionName) || ''
      const isDef = fcItemIsDefault(v)
      const isCur = v.scenario === curScenario
      const updated = v.updatedAt ? String(v.updatedAt).replace('T', ' ').slice(0, 19) : '—'
      return `<tr class="${isCur ? 'is-current' : ''}">
        <td class="vm-no">v${n}${isCur ? '<span class="vm-cur-tag">当前</span>' : ''}</td>
        <td class="vm-name">${nm ? escHtml(nm) : '<span class="vm-muted">（未命名）</span>'}</td>
        <td class="vm-time">${escHtml(updated)}</td>
        <td class="vm-default">${isDef
          ? '<cmx-status-tag tone="success" variant="subtle" size="sm">★ 默认</cmx-status-tag>'
          : `<button type="button" class="vm-link" data-action="set-default-version" data-scenario="${escAttr(v.scenario)}">设为默认</button>`}</td>
        <td class="vm-ops">
          ${isCur ? '' : `<button type="button" class="vm-link" data-action="vm-switch-version" data-scenario="${escAttr(v.scenario)}" title="打开此版本">打开</button>`}
          <button type="button" class="vm-link danger" data-action="delete-version" data-scenario="${escAttr(v.scenario)}" ${versions.length <= 1 ? 'disabled title="至少保留一个版本"' : 'title="删除此版本"'}>删除</button>
        </td>
      </tr>`
    }).join('')
    return `<div class="ver-backdrop" data-action="close-version-manager">
      <section class="ver-modal vm-modal" data-ver-stop>
        <div class="ver-modal-head"><h3>版本管理 · ${escHtml(this._combination?.title || this._selected?.scenario || '')}</h3><button type="button" class="ver-x" data-action="close-version-manager" title="关闭">✕</button></div>
        <table class="vm-table">
          <thead><tr><th>版本号</th><th>版本名称</th><th>更新时间</th><th>默认</th><th>操作</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="vm-foot">
          <span class="vm-hint">默认版本在资源管理器中作为该档案的首选打开版本。</span>
          <button type="button" class="ver-create-btn" data-action="open-version-dialog"><ui5-icon name="add"></ui5-icon>新建版本</button>
        </div>
      </section>
    </div>`
  }

  /** POST /api/flexible-combination/default：把某 scenario 设为默认（同 stem 互斥，后端原子）。 */
  async _postSetDefault (scenario) {
    const sel = this._selected
    const params = new URLSearchParams({ domain: sel.domain, app: sel.app, module: sel.module, scenario })
    const data = await apiFetch(`/api/flexible-combination/default?${params.toString()}`, { method: 'POST' })
    return data
  }

  /** 设为默认版本（版本管理弹窗内）。 */
  async _setDefaultVersion (scenario) {
    if (!scenario || !this._selected) return
    try {
      await this._postSetDefault(scenario)
      await this._loadList()
      if (this._combination) this._combination.isDefault = (scenario === this._selected.scenario)
      this._render()
    } catch (err) { showDefError('设置默认版本失败', err instanceof Error ? err.message : String(err)) }
  }

  /** 删除某版本（保护：至少留一个；删默认/当前后自动改选其它版本）。 */
  async _deleteVersion (scenario) {
    if (!scenario || !this._selected) return
    const sel = this._selected
    const versions = this._currentVersionItems()
    if (versions.length <= 1) { showDefWarn('无法删除', '至少保留一个版本，不能删除最后一个版本。'); return }
    const victim = versions.find((v) => v.scenario === scenario)
    const n = victim ? fcItemVersion(victim) : fcScenarioParts(scenario).version
    const vdelOk = await admConfirm({ title: '删除版本', message: `确定删除版本 v${n}（${scenario}）？此操作不可恢复。`, danger: true })
    if (!vdelOk) return
    try {
      const params = new URLSearchParams({ domain: sel.domain, app: sel.app, module: sel.module, scenario })
      await apiFetch(`/api/flexible-combination/config?${params.toString()}`, { method: 'DELETE' })
      const remaining = versions.filter((v) => v.scenario !== scenario)
      const wasDefault = victim ? fcItemIsDefault(victim) : false
      if (wasDefault && remaining.length) {
        try { await this._postSetDefault(remaining[remaining.length - 1].scenario) } catch { /* 容错 */ }
      }
      await this._refreshListKeepSelection()
      if (scenario === sel.scenario) {
        const next = remaining.find(fcItemIsDefault) || remaining[remaining.length - 1]
        this._dirty = false
        // 切到下一版本（不同 key，_loadCombination 必然加载——删当前版本后用户需看到剩余版本）
        this._pbus.select(`${sel.domain}/${sel.app}/${sel.module}/${next.scenario}`)
      } else {
        this._render()
      }
    } catch (err) { showDefError('删除版本失败', err instanceof Error ? err.message : String(err)) }
  }

  /** 「弹性组合属性」表单 HTML（explorer 区列表视图下部渲染用）。编辑经 data-combination-prop 走 handlePanelInput。 */
  renderCombinationPropsHtml () {
    const combination = normalizeCombination(this._combination || DEFAULT_COMBINATION)
    const ref = this._combination?.docRef
    const mm = this._docMeta?.moduleMeta
    const docInfo = (ref && mm)
      ? `<div class="doc-info">
          <div class="di-row"><span class="di-k">引用单据</span><span class="di-v">${escHtml(mm.metaName || '')}（${escHtml(mm.moduleCode || '')}）</span></div>
          <div class="di-row"><span class="di-k">表/维度</span><span class="di-v">${Number((this._docMeta.voucherTables || []).length)} 表 · ${this._docDimensions().length} 维度</span></div>
          <div class="di-row"><span class="di-k">说明</span><span class="di-v">${escHtml(mm.remark || '—')}</span></div>
        </div>`
      : (ref ? '<div class="doc-info"><div class="item-sub">引用单据加载中或不可用</div></div>' : '')
    return `<div class="fc-props-form">
      <label>场景标识</label><input data-combination-prop="scenario" value="${escAttr(combination.scenario)}">
      <label>标题</label><input data-combination-prop="title" value="${escAttr(combination.title)}">
      <label>状态</label><input data-combination-prop="status" value="${escAttr(combination.status)}">
      <label>锚点维度</label><input data-combination-prop="anchorDimensions" value="${escAttr(combination.anchorDimensions.join(', '))}">
      <label>标签</label><input data-combination-prop="tags" value="${escAttr(combination.tags.join(', '))}">
      <label>说明</label><input data-combination-prop="description" value="${escAttr(combination.description)}">
    </div>${docInfo}`
  }

  /** 「源码」视图的当前 JSON 文本（content 区 source 视图渲染用）。 */
  getSourceText () {
    return JSON.stringify(normalizeCombination(this._combination || DEFAULT_COMBINATION), null, 2)
  }

  /** Schema 视图：弹性组合的完整编译 schema（只读）。 */
  getSchemaText () {
    const combination = normalizeCombination(this._combination || DEFAULT_COMBINATION)
    return JSON.stringify(buildContextResolvedSchema(combination, this._docMeta), null, 2)
  }

  /** 源码视图（CodeMirror/textarea）编辑 JSON → 回写 _combination。解析失败仅标脏不覆盖。 */
  updateSourceText (text) {
    try {
      this._combination = JSON.parse(text || '{}')
      this._dirty = true
      this._diagnostics = null
      this._preview = null
      this._render()
    } catch {
      this._dirty = true
      this._syncToolbar()
    }
  }

  /** 消息条：有类型用统一 adm-msg（错误红/成功绿/警告黄，可关闭），否则用淡色 .msg 文本（加载/普通提示）。
   *  明细（错误/警告逐条）走校验/预览弹窗展示，横幅只保留状态文字，避免挤一行难读。 */
  _renderMessage () {
    const msg = this._message || (this._loading ? '加载中...' : '')
    if (!msg) return '<div class="msg"></div>'
    if (this._messageType) {
      const cls = this._messageType === 'error' ? 'err' : this._messageType === 'success' ? 'ok' : 'warn'
      return `<div class="adm-msg ${cls}">${escHtml(msg)}<button type="button" class="adm-msg-close" data-action="dismiss-msg" title="关闭">✕</button></div>`
    }
    return `<div class="msg">${escHtml(msg)}</div>`
  }

  _renderDesigner (combination) {
    const rules = Array.isArray(combination.rules) ? combination.rules : []
    // 规则面板（tab）：按 rule.panel 分组；未命名归入「默认」面板。面板仅为 UI 分组，引擎遍历 rules 不变。
    const panels = this._rulePanels(combination)
    let activePanel = this._selectedPanel
    if (!panels.includes(activePanel)) activePanel = panels[0] || ''
    this._selectedPanel = activePanel
    const panelRules = rules.filter((r) => (r.panel || DEFAULT_PANEL) === activePanel)
    let selectedRule = panelRules.find((r) => r.id === this._selectedRuleId) || panelRules[0] || null
    if (selectedRule && this._selectedRuleId !== selectedRule.id) this._selectedRuleId = selectedRule.id
    const hasGroups = Array.isArray(selectedRule?.detail?.groups) && selectedRule.detail.groups.length > 0
    const hasColumnModel = (combination.columnModel && Object.keys(combination.columnModel).length) || (selectedRule?.columnModel && Object.keys(selectedRule.columnModel).length)
    const groupsOpen = this._groupsOpen || hasGroups
    const columnModelOpen = this._columnModelOpen || hasColumnModel
    const dimCount = Object.keys(combination.dimensions || {}).length
    return `<div class="design-layout">
      <section class="box design-row dim-section ${this._dimensionsOpen ? 'open' : 'collapsed'}">
        <div class="box-head dim-toggle" data-action="toggle-dim">
          <span class="dim-caret">${this._dimensionsOpen ? '▾' : '▸'}</span>
          <div class="box-title">维度（${dimCount}）</div><span class="spacer"></span>
          <ui5-button class="mini" icon="add" design="Transparent" data-action="add-dim"></ui5-button>
        </div>
        ${this._dimensionsOpen ? `<div class="box-body">${this._renderDimensionsTable(combination)}</div>` : ''}
      </section>
      <section class="box design-row">
        <div class="rule-tabs">
          ${panels.map((name) => {
            const sel = name === activePanel
            const cnt = rules.filter((r) => (r.panel || DEFAULT_PANEL) === name).length
            return `<button type="button" class="rule-tab ${sel ? 'active' : ''}" data-action="select-panel" data-panel="${escAttr(name)}" title="${escAttr(name)}">
              <span class="rt-name">${escHtml(this._panelLabel(name))}</span><span class="rt-count">${cnt}</span>
              ${sel ? `<span class="rt-add" data-action="add-rule" title="新增规则">＋</span><span class="rt-rename" data-action="rename-panel" data-panel="${escAttr(name)}" title="更换关联表">✎</span><span class="rt-del" data-action="remove-panel" data-panel="${escAttr(name)}" title="删除面板">✕</span>` : ''}
            </button>`
          }).join('')}
          <button type="button" class="rule-tab add" data-action="add-panel" title="新增规则面板">＋</button>
        </div>
        <div class="box-body rule-body">
          ${this._renderPanelBody(combination, activePanel, panelRules, selectedRule, { groupsOpen, columnModelOpen })}
        </div>
        ${this._renderTablePicker(combination)}
      </section>
    </div>`
  }

  /** 规则面板（tab）名列表：按 rule.panel 分组去重，保留首次出现顺序；空时给一个默认面板。 */
  _rulePanels (combination) {
    const names = []
    for (const r of (combination.rules || [])) {
      const p = r.panel || DEFAULT_PANEL
      if (!names.includes(p)) names.push(p)
    }
    if (this._extraPanels) for (const p of this._extraPanels) { if (!names.includes(p)) names.push(p) }
    return names.length ? names : [DEFAULT_PANEL]
  }

  /** 引用单据按层级分组的表树：[{level, levelName, tables:[{tableName, alias}]}]；无引用单据返回 []。 */
  _docTableTree () {
    const meta = this._docMeta
    if (!meta) return []
    const tables = Array.isArray(meta.voucherTables) ? meta.voucherTables : []
    // 层级顺序与名称取自 voucherSchema.schema（数组的数组，每组同层）
    const levelName = {}
    const order = []
    const schema = meta.voucherSchema?.schema
    if (Array.isArray(schema)) {
      for (const group of schema) {
        if (!Array.isArray(group)) continue
        for (const node of group) {
          const lv = node.level || ''
          if (lv && !order.includes(lv)) order.push(lv)
          if (lv && node.levelName) levelName[lv] = node.levelName
        }
      }
    }
    const byLevel = new Map()
    for (const t of tables) {
      const lv = t.level || '—'
      if (!byLevel.has(lv)) byLevel.set(lv, [])
      byLevel.get(lv).push({ tableName: t.tableName, alias: t.tableAlias || t.tableName })
    }
    // 先按 schema 顺序，再补 schema 未列出的层级
    for (const lv of byLevel.keys()) if (!order.includes(lv)) order.push(lv)
    return order.filter((lv) => byLevel.has(lv)).map((lv) => ({ level: lv, levelName: levelName[lv] || lv, tables: byLevel.get(lv) }))
  }

  /** 给定面板标识（tableName），返回 tab 上显示名（表别名）；找不到回退原值。 */
  _panelLabel (panel) {
    if (panel === DEFAULT_PANEL) return panel
    for (const grp of this._docTableTree()) {
      const hit = grp.tables.find((t) => t.tableName === panel)
      if (hit) return hit.alias
    }
    return panel
  }

  /** 触发元素的视口坐标（用于把 fixed 下拉 popup 锚定在按钮下方）。 */
  _anchorRect (el) {
    try {
      if (!el || !el.getBoundingClientRect) return null
      const r = el.getBoundingClientRect()
      return { left: r.left, top: r.bottom, right: r.right }
    } catch { return null }
  }

  /** 表树形下拉 popup HTML（新增/更换面板共用）；锚定触发按钮下方，含层级与各级表。 */
  /** 打开"查看单据表详情"下拉（树形，view 模式）。 */
  _viewDocDetail (anchorEl) {
    if (!this._docTableTree().length) { window.alert('当前未引用业务单据，或单据无表定义'); return }
    this._tablePicker = { mode: 'view', anchor: this._anchorRect(anchorEl) }
    this._render()
  }

  /** 点 view 下拉顶部标题 → 关闭下拉，在 property 区展示单据整体信息（只读）。 */
  _viewDocInfo () {
    this._tablePicker = null
    this._selectedDocTable = ''
    this._docInfoView = true
    this._selectedDimCode = ''
    this._refDictStack = []
    this._render()
  }

  /** 单据整体信息（只读）：单据元信息 + 层级/表清单概要。 */
  _renderDocInfo () {
    const mm = this._docMeta?.moduleMeta || {}
    const ref = this._combination?.docRef || {}
    const tables = Array.isArray(this._docMeta?.voucherTables) ? this._docMeta.voucherTables : []
    const tree = this._docTableTree()
    const head = `<section class="section">
      <h3>单据信息 · ${escHtml(mm.metaName || ref.title || ref.file || '')}</h3>
      <div class="insp-grid">
        <label>名称</label><span class="di-v">${escHtml(mm.metaName || '')}</span>
        <label>编码</label><span class="di-v">${escHtml(mm.moduleCode || '')}</span>
        <label>定义文件</label><span class="di-v">${escHtml(ref.domain || '')}/${escHtml(ref.module || '')}/${escHtml(ref.file || '')}</span>
        <label>层级数</label><span class="di-v">${tree.length}</span>
        <label>表数</label><span class="di-v">${tables.length}</span>
        <label>说明</label><span class="di-v">${escHtml(mm.remark || '—')}</span>
      </div>
    </section>`
    if (!tree.length) return head + '<section class="section"><div class="item-sub">该单据无层级/表定义。</div></section>'
    const body = tree.map((g) => `<section class="section">
      <h3>${escHtml(g.levelName)}<span class="di-tag">${escHtml(g.level)}</span><span class="di-cnt">（${g.tables.length} 表）</span></h3>
      <table class="dim-cols">
        <thead><tr><th class="idx">#</th><th>表别名</th><th>表名</th></tr></thead>
        <tbody>${g.tables.map((t, i) => `<tr>
          <td class="idx">${i + 1}</td>
          <td>${escHtml(t.alias)}</td>
          <td><button type="button" class="dict-link" data-action="view-doc-table-from-info" data-table="${escAttr(t.tableName)}" title="查看该表列定义">${escHtml(t.tableName)}</button></td>
        </tr>`).join('')}</tbody>
      </table>
    </section>`).join('')
    return head + body
  }

  _renderTablePicker (combination) {
    if (!this._tablePicker) return ''
    const tree = this._docTableTree()
    const mode = this._tablePicker.mode
    const isFieldTab = mode === 'fieldtab-add' || mode === 'fieldtab-rename'
    const isView = mode === 'view'
    let used, editing
    if (isView) {
      used = new Set()
      editing = this._selectedDocTable || ''
    } else if (isFieldTab) {
      // 字段集模式：已用表 = 本规则各字段集关联表（含 index0 的 rule.detail.table）
      const rule = (combination.rules || []).find((r) => r.id === (this._tablePicker.ruleId || this._selectedRuleId))
      const sets = this._fieldSets(rule)
      used = new Set(sets.map((s) => s.table).filter(Boolean))
      editing = mode === 'fieldtab-rename' ? (sets[Number(this._tablePicker.fsIndex) || 0]?.table || '') : ''
    } else {
      used = new Set((combination.rules || []).map((r) => r.panel).filter(Boolean))
      editing = mode === 'rename' ? this._tablePicker.panel : ''
    }
    const headTitle = isView
      ? '查看单据信息（点表看列定义）'
      : isFieldTab
        ? (mode === 'fieldtab-rename' ? '更换字段集关联表' : '选择表建立字段集')
        : (mode === 'rename' ? '更换关联表' : '选择表建立规则面板')
    const body = tree.length
      ? tree.map((grp) => `
          <div class="tp-level">${escHtml(grp.levelName)}<span class="tp-lv-code">${escHtml(grp.level)}</span></div>
          ${grp.tables.map((t) => {
            const dis = used.has(t.tableName) && t.tableName !== editing
            const cur = t.tableName === editing
            const refreshable = isFieldTab && mode === 'fieldtab-rename' && cur
            return `<button type="button" class="tp-table ${dis ? 'disabled' : ''} ${cur ? 'current' : ''}" ${dis ? 'disabled' : `data-action="pick-table" data-table="${escAttr(t.tableName)}"`} title="${escAttr(t.tableName)}">
              <ui5-icon name="table-view"></ui5-icon><span class="tp-tname">${escHtml(t.alias)}</span><span class="tp-tcode">${escHtml(t.tableName)}</span>${cur ? '<span class="tp-used cur">当前</span>' : (dis ? '<span class="tp-used">已使用</span>' : '')}${refreshable ? `<span class="tp-refresh" data-action="refresh-fieldtab-cols" data-table="${escAttr(t.tableName)}" title="将本表自定义字段同步到字段表（已存在不覆盖，缺失补上）"><ui5-icon name="refresh"></ui5-icon></span>` : ''}
            </button>`
          }).join('')}`).join('')
      : '<cmx-empty-state icon="document" title="当前档案未引用业务单据" description="或单据无表定义。请先在标题栏选择「引用单据」。" size="sm"></cmx-empty-state>'
    // 锚点定位：贴触发按钮下方左对齐；超出右边界则右对齐到按钮右缘
    const a = this._tablePicker.anchor
    const W = 320
    const vw = (typeof window !== 'undefined' && window.innerWidth) || 1280
    let pos = 'left:12px;top:48px'
    if (a) {
      const left = (a.left + W > vw - 8) ? Math.max(8, a.right - W) : Math.max(8, a.left)
      pos = `left:${Math.round(left)}px;top:${Math.round(a.top) + 4}px`
    }
    return `<div class="tp-backdrop" data-action="close-table-picker">
      <div class="tp-pop" data-tp-pop style="${pos}">
        <div class="tp-head">${isView ? `<button type="button" class="tp-head-link" data-action="view-doc-info" title="点击查看单据整体信息">${headTitle}</button>` : headTitle}<span class="tp-x" data-action="close-table-picker">✕</span></div>
        <div class="tp-list">${body}</div>
      </div>
    </div>`
  }

  /** 一个规则面板的内容：规则表格（多行）+ 明细字段（随选中规则联动）+ 分组 + 列模型。 */
  _renderPanelBody (combination, panel, panelRules, selectedRule, { groupsOpen, columnModelOpen }) {
    return `
      <div class="rule-table-scroll">${this._renderRulesTable(combination, panelRules)}</div>
      ${selectedRule ? this._renderFieldTabsArea(combination, selectedRule, { groupsOpen, columnModelOpen }) : '<div class="item-sub" style="padding:10px">先选择或新增一条规则。</div>'}`
  }

  /** 规则下「明细字段集」tab 区：每个字段集一个 tab（一视同仁，各自关联一张表）。 */
  _renderFieldTabsArea (combination, rule, { groupsOpen, columnModelOpen }) {
    const sets = this._fieldSets(rule)
    const active = this._activeFsc(rule)
    const tabBtn = (set, sel) => {
      const label = this._fscLabel(rule, set.index)
      const cnt = this._resolvedFields(set).length
      return `<button type="button" class="ft-tab ${sel ? 'active' : ''}" data-action="select-field-tab" data-fsindex="${set.index}" title="${escAttr(label)}">
        <span class="ft-name">${escHtml(label)}</span><span class="rt-count">${cnt}</span>
        ${sel ? `<span class="ft-act ft-add-field" data-action="add-field" title="新增字段">＋</span><span class="ft-act ft-rename" data-action="rename-field-tab" data-fsindex="${set.index}" title="更换关联表/改名">✎</span><span class="ft-act ft-del" data-action="remove-field-tab" data-fsindex="${set.index}" title="删除该字段集">✕</span>` : ''}
      </button>`
    }
    return `
      <div class="ft-tabs">
        ${sets.map((s) => tabBtn(s, s.index === active.index)).join('')}
        <button type="button" class="ft-tab add" data-action="add-field-tab" title="新增字段集（关联另一张表）">＋</button>
        <span class="spacer"></span>
        <button type="button" class="icon-btn" data-action="copy-fields" title="复制当前字段集字段和分组"><ui5-icon name="copy"></ui5-icon></button>
        <button type="button" class="icon-btn" data-action="paste-fields" title="粘贴字段和分组到当前字段集"><ui5-icon name="paste"></ui5-icon></button>
      </div>
      <div class="ft-body">
        <div class="fields-table-scroll"><div id="fields-table-host">${this._renderFieldsTable(rule, combination)}</div></div>
        <div class="item-sub" style="padding:4px 10px">${this._renderFieldHint(active)}</div>
        <details class="collapse" data-collapse="groups" ${groupsOpen ? 'open' : ''}>
          <summary class="box-head">
            <div class="box-title">分组</div><span class="spacer"></span>
            <ui5-button class="mini" icon="add" design="Transparent" data-action="add-group"></ui5-button>
          </summary>
          ${this._renderGroups(rule)}
        </details>
        <details class="collapse" data-collapse="columnModel" ${columnModelOpen ? 'open' : ''}>
          <summary class="box-head"><div class="box-title">列模型属性（CmxColumnModel）</div></summary>
          ${this._renderColumnModelPanel(combination, rule)}
        </details>
      </div>`
  }

  /** 字段集提示文案：overlay 模式（use/pick）提示引用语义，inline 模式提示基本操作。 */
  _renderFieldHint (fsc) {
    const owner = fsc?.fieldsOwner
    if (!owner) return '提示：点击规则行可切换；点击字段行右侧「检查器」可编辑高级配置。'
    if (owner.use === '*' || owner.use === 'all') {
      const alias = owner.table ? this._tableAlias(owner.table) : '关联表'
      return `引用模式（use:"*"）：当前字段集引用「${escHtml(alias)}」的全部列，单据列变更自动跟随。编辑某列属性会生成增量覆盖（pick）；删除某列会转为显式 pick 列出保留列。`
    }
    if (Array.isArray(owner.pick) && owner.pick.length) {
      const alias = owner.table ? this._tableAlias(owner.table) : '关联表'
      const refCnt = owner.pick.length
      return `引用模式（pick）：当前字段集从「${escHtml(alias)}」挑选了 ${refCnt} 列（含增量覆盖）。单据列属性变更自动跟随；字段顺序可拖动调整。`
    }
    return '提示：点击规则行可切换；点击字段行右侧「检查器」可编辑高级配置。'
  }

  /** 字段集 tab 显示名（按索引）：有关联表显示表别名，否则自定义名，再否则「字段集N」。 */
  _fscLabel (rule, index) {
    const sets = this._fieldSets(rule)
    const set = sets[index] || sets[0]
    if (!set) return `字段集${index + 1}`
    if (set.table) return this._tableAlias(set.table)
    if (set.name) return set.name
    return `字段集${index + 1}`
  }

  /** tableName → 表别名（取引用单据表树）；找不到回退原值。 */
  _tableAlias (tableName) {
    for (const grp of this._docTableTree()) {
      const hit = grp.tables.find((t) => t.tableName === tableName)
      if (hit) return hit.alias
    }
    return tableName
  }


  /** 规则表格（一个面板内的多行规则）。点行切换选中规则；明细字段随之联动。 */
  _renderRulesTable (combination, rules) {
    if (!rules.length) return '<div class="item-sub" style="padding:10px">该面板还没有规则，点击右上角新增。</div>'
    return `<table>
      <thead><tr><th class="idx">#</th><th style="width:110px">规则ID</th><th style="width:120px">名称</th><th style="width:140px">锚点维度</th><th style="width:140px">锚点列</th><th>匹配JSON</th><th style="width:118px"></th></tr></thead>
      <tbody>${rules.map((rule, i) => {
        const selected = rule.id === this._selectedRuleId
        const matchText = JSON.stringify(rule.anchor?.match || {})
        return `<tr class="rule-row ${selected ? 'selected' : ''}" data-action="select-rule" data-rule="${escAttr(rule.id)}">
          <td class="idx">${i + 1}</td>
          <td><input data-rule-id="${escAttr(rule.id)}" data-rule-prop="id" value="${escAttr(rule.id)}"></td>
          <td><input data-rule-id="${escAttr(rule.id)}" data-rule-prop="caption" value="${escAttr(rule.caption || rule.name || '')}"></td>
          <td class="ms-cell">${this._renderAnchorMultiSelect(rule, combination, 'dims')}</td>
          <td class="ms-cell">${this._renderAnchorMultiSelect(rule, combination, 'cols')}</td>
          <td><input data-rule-id="${escAttr(rule.id)}" data-rule-prop="match" value="${escAttr(matchText)}"></td>
          <td>
            <button class="icon-btn ${selected ? 'on' : ''}" data-action="select-rule" data-rule="${escAttr(rule.id)}" title="选中此规则"><ui5-icon name="${selected ? 'accept' : 'select-appointments'}"></ui5-icon></button>
            <button class="icon-btn" data-action="move-rule-up" data-rule="${escAttr(rule.id)}" title="上移" ${i === 0 ? 'disabled' : ''}><ui5-icon name="slim-arrow-up"></ui5-icon></button>
            <button class="icon-btn" data-action="move-rule-down" data-rule="${escAttr(rule.id)}" title="下移" ${i === rules.length - 1 ? 'disabled' : ''}><ui5-icon name="slim-arrow-down"></ui5-icon></button>
            <button class="icon-btn danger" data-action="remove-rule" data-rule="${escAttr(rule.id)}" title="删除"><ui5-icon name="delete"></ui5-icon></button>
          </td>
        </tr>`
      }).join('')}</tbody>
    </table>`
  }

  _renderFieldsTable (rule, combination) {
    if (!rule) return '<div class="item-sub" style="padding:10px">先选择或新增一条规则。</div>'
    const fsc = this._activeFsc(rule)
    const fields = this._resolvedFields(fsc)
    if (!fields.length) return '<div class="item-sub" style="padding:10px">当前字段集还没有字段，点击右上角新增。</div>'
    // 表格内联由统一 schema 渲染器产出（data-field-key=fieldId + 规范 data-field-prop），开启移动按钮。
    // keyOf 用 fieldId（稳定标识）而非 WeakMap editKey——overlay 解析层每次展开可能产生新对象，
    // WeakMap key 会失效导致选中/编辑断链；fieldId 在 pick.ref.col / inline id 上稳定。
    return renderFieldTable(fields, {
      end: 'FLC',
      adapter: this._fieldAdapter(),
      ctx: this._fieldCtx(combination),
      keyOf: (f) => fieldId(f),
      selectedKey: this._selectedFieldCode || null,
      actions: { detail: true, remove: true, move: true },
    })
  }

  _fieldEditKey (field) {
    if (!field || typeof field !== 'object') return ''
    let key = this._fieldEditKeys.get(field)
    if (!key) {
      key = `f${++this._fieldEditKeySeq}`
      this._fieldEditKeys.set(field, key)
    }
    return key
  }

  _fieldByEditKey (fields, key) {
    return fields.find((f) => this._fieldEditKey(f) === key) || fields.find((f) => fieldId(f) === key) || null
  }

  _fieldCodeFromKey (key) {
    const combination = normalizeCombination(this._combination || DEFAULT_COMBINATION)
    const rule = combination.rules.find((r) => r.id === this._selectedRuleId) || combination.rules[0] || null
    const fields = this._resolvedFields(this._activeFsc(rule))
    const field = this._fieldByEditKey(fields, key)
    return field ? fieldId(field) : key
  }

  // ─── Inspector 渲染：选中字段的全量高级配置 ─────────────────────────────

  /** 维度列信息（只读）：按引用的 base fieldSet 分组 + 本字典自定义字段，参考数据字典字段面板。 */
  _renderDimColumnsInfo (dim, code) {
    const dictId = dim?.dict?.dictId
    const groups = (dictId && this._dictGroupsMap[dictId]) || []
    const total = groups.reduce((n, g) => n + (Array.isArray(g.fields) ? g.fields.length : 0), 0)
    const head = `<section class="section">
      <h3>维度列信息 · ${escHtml(dim.name || code)}</h3>
      <div class="insp-grid">
        <label>维度编码</label><span class="di-v">${escHtml(code)}</span>
        <label>引用字典</label><span class="di-v">${escHtml(dictId || '（未引用字典）')}</span>
        <label>列数</label><span class="di-v">${total}</span>
      </div>
    </section>`
    if (!dictId) return head + '<section class="section"><div class="item-sub">该维度未引用字典，无列信息。可在「取值方式」选 dict-select 并在属性列选列后查看。</div></section>'
    if (!groups.length) return head + '<section class="section"><div class="item-sub">未找到字典「' + escHtml(dictId) + '」的定义，或字典无字段。</div></section>'
    const body = groups.map((g) => `<section class="section">
      <h3>${escHtml(g.name)}${g.ref ? ' <span class="di-tag">引用</span>' : ' <span class="di-tag own">本字典</span>'}<span class="di-cnt">（${(g.fields || []).length}）</span></h3>
      ${(g.fields || []).length ? this._fieldRowsTable(g.fields) : '<div class="item-sub">无字段</div>'}
    </section>`).join('')
    return head + body
  }

  /** 只读字段表（字段名/注释/类型/长度/可空/引用字典），维度列信息与单据表列信息共用。引用字典可点击联查。 */
  _fieldRowsTable (fields) {
    return `<table class="dim-cols">
      <thead><tr><th class="idx">#</th><th>ID</th><th>Name</th><th>标题</th><th style="width:84px">类型</th><th style="width:48px">长度</th><th style="width:40px">可空</th><th style="width:110px">引用字典</th></tr></thead>
      <tbody>${(fields || []).map((f, i) => `<tr>
        <td class="idx">${i + 1}</td>
        <td>${escHtml(fieldId(f))}</td>
        <td>${escHtml(f.name || '')}</td>
        <td>${escHtml(fieldCaption(f))}</td>
        <td>${escHtml(f.dataType || '')}</td>
        <td>${escHtml(f.fieldLength == null ? '' : String(f.fieldLength))}</td>
        <td style="text-align:center">${f.nullable ? '✓' : ''}</td>
        <td>${f.refDict ? `<button type="button" class="dict-link" data-action="view-ref-dict" data-dict="${escAttr(f.refDict)}" title="查看字典 ${escAttr(f.refDict)} 的列定义">${escHtml(f.refDict)}</button>` : ''}</td>
      </tr>`).join('')}</tbody>
    </table>`
  }

  /** 单据表列信息（只读）：按引用的 base doc fieldSet 分组 + 本表自定义字段，参考字典字段面板。 */
  _renderDocTableInfo (tableName) {
    const tables = Array.isArray(this._docMeta?.voucherTables) ? this._docMeta.voucherTables : []
    const t = tables.find((x) => x.tableName === tableName)
    if (!t) { this._selectedDocTable = ''; return null }
    const baseFS = this._docBaseFieldSets || {}
    const groups = []
    for (const name of (Array.isArray(t.documentFieldSets) ? t.documentFieldSets : [])) {
      groups.push({ name, ref: true, fields: baseFS[name] || [] })
    }
    const own = Array.isArray(t.fields) ? t.fields : []
    if (own.length) groups.push({ name: '本表定义字段', ref: false, fields: own })
    const total = groups.reduce((n, g) => n + (g.fields || []).length, 0)
    const head = `<section class="section">
      <h3>单据表列信息 · ${escHtml(t.tableAlias || tableName)}</h3>
      <div class="insp-grid">
        <label>表名</label><span class="di-v">${escHtml(tableName)}</span>
        <label>层级</label><span class="di-v">${escHtml(t.level || '')}</span>
        <label>说明</label><span class="di-v">${escHtml(t.remark || '—')}</span>
        <label>列数</label><span class="di-v">${total}</span>
      </div>
    </section>`
    if (!groups.length) return head + '<section class="section"><div class="item-sub">该表无字段定义。</div></section>'
    const body = groups.map((g) => `<section class="section">
      <h3>${escHtml(g.name)}${g.ref ? ' <span class="di-tag">引用</span>' : ' <span class="di-tag own">本表</span>'}<span class="di-cnt">（${(g.fields || []).length}）</span></h3>
      ${(g.fields || []).length ? this._fieldRowsTable(g.fields) : '<div class="item-sub">无字段</div>'}
    </section>`).join('')
    return head + body
  }

  /** 引用字典联查（钻取）：展示某字典的列分组定义 + 返回按钮（返回上一层视图）。可继续点字段的引用字典逐层下钻。 */
  _renderRefDictInfo (dictCode) {
    const groups = this._dictGroupsMap[dictCode] || []
    const total = groups.reduce((n, g) => n + (g.fields || []).length, 0)
    const depth = this._refDictStack.length
    const trail = this._refDictStack.join(' › ')
    const head = `<section class="section">
      <h3>引用字典 · ${escHtml(dictCode)}
        <button type="button" class="link-back" data-action="back-ref-dict" title="返回上一层">返回</button>
      </h3>
      <div class="insp-grid">
        <label>字典编码</label><span class="di-v">${escHtml(dictCode)}</span>
        <label>列数</label><span class="di-v">${total}</span>
        ${depth > 1 ? `<label>钻取路径</label><span class="di-v">${escHtml(trail)}</span>` : ''}
      </div>
    </section>`
    if (!groups.length) return head + '<section class="section"><div class="item-sub">未找到字典「' + escHtml(dictCode) + '」的定义，或字典无字段。</div></section>'
    const body = groups.map((g) => `<section class="section">
      <h3>${escHtml(g.name)}${g.ref ? ' <span class="di-tag">引用</span>' : ' <span class="di-tag own">本字典</span>'}<span class="di-cnt">（${(g.fields || []).length}）</span></h3>
      ${(g.fields || []).length ? this._fieldRowsTable(g.fields) : '<div class="item-sub">无字段</div>'}
    </section>`).join('')
    return head + body
  }

  /**
   * 规则定义 form 编辑器（点规则行后在 property 区展示）。match 用行式编辑：每行 = 列 + 操作符 + 值，
   * 告别裸 JSON。操作符：等于/不等于/属于/不属于/存在/通配；值按需为单值或逗号分隔多值。
   */
  _renderRuleInspector (rule, combination) {
    const anchorDims = Array.isArray(rule.anchor?.dimensions) ? rule.anchor.dimensions : []
    const anchorCols = Array.isArray(rule.anchor?.columns) ? rule.anchor.columns : []
    // 匹配列下拉分组：「本表列」(规则所在表全部列) + 每个锚点维度一组(组内为该维度定义的属性列)
    const tableCols = [...new Set([...this._ruleTableAllColumns(rule), ...anchorCols])]
    const dimGroups = anchorDims.map((code) => {
      const dim = combination?.dimensions?.[code]
      const attrs = dim ? (Array.isArray(dim.attributes) ? dim.attributes : Object.keys(dim.attributes || {})) : []
      // 维度属性以 维度.属性 作为匹配变量名
      return { code, name: (dim?.name || code), vars: attrs.map((a) => `${code}.${a}`) }
    })
    // 当前已选值若不在任何分组，补一个「其它」组以防丢
    const known = new Set([...tableCols, ...dimGroups.flatMap((g) => g.vars)])
    const colOptgroups = (cur) => {
      const opt = (v) => `<option value="${escAttr(v)}" ${v === cur ? 'selected' : ''}>${escHtml(v)}</option>`
      let html = `<option value="" ${!cur ? 'selected' : ''}>（选列）</option>`
      if (tableCols.length) html += `<optgroup label="本表列">${tableCols.map(opt).join('')}</optgroup>`
      for (const g of dimGroups) {
        if (g.vars.length) html += `<optgroup label="维度：${escAttr(g.name)}">${g.vars.map(opt).join('')}</optgroup>`
      }
      if (cur && !known.has(cur)) html += `<optgroup label="其它">${opt(cur)}</optgroup>`
      return html
    }
    const match = (rule.anchor && rule.anchor.match && typeof rule.anchor.match === 'object') ? rule.anchor.match : {}
    const rows = Array.isArray(this._matchRows) ? this._matchRows : this._matchToRows(match)
    const OPS = [
      { v: 'eq', label: '等于' }, { v: 'ne', label: '不等于' },
      { v: 'in', label: '属于(多值)' }, { v: 'nin', label: '不属于(多值)' },
      { v: 'under', label: '属于子级($under)' },
      { v: 'exists', label: '存在(非空)' }, { v: 'any', label: '通配(*)' },
    ]
    const opSel = (i, op) => `<select data-match-row="${i}" data-match-part="op">${OPS.map((o) => `<option value="${o.v}" ${o.v === op ? 'selected' : ''}>${o.label}</option>`).join('')}</select>`
    const valCell = (i, op, val, col) => {
      if (op === 'exists' || op === 'any') return '<span class="mr-novalue">无需取值</span>'
      // 多值操作符固定为逗号分隔文本，便于一次填多个
      if (op === 'in' || op === 'nin') return `<input data-match-row="${i}" data-match-part="val" value="${escAttr(val)}" placeholder="多值逗号分隔">`
      const meta = this._matchColMeta(rule, combination, col)
      const da = `data-match-row="${i}" data-match-part="val"`
      // 收敛为运行时 edit.mode 语义，再决定值控件。
      switch (editModeKind(meta.uiControl, '')) {
        case 'dict-select':
          return `<cmx-dict-select ${da} dict-code="${escAttr(meta.refDict || '')}" placeholder="选择字典值" data-match-control="dict" data-init-value="${escAttr(val)}"></cmx-dict-select>`
        case 'select': {
          // enumValues 兼容 [{value,label}] 对象数组与 string[]/标量两种形态
          const raw = Array.isArray(meta.enumValues) ? meta.enumValues : []
          const opts = raw.map((e) => (e && typeof e === 'object') ? { value: e.value, label: e.label ?? e.value } : { value: e, label: String(e) })
          const exists = val != null && val !== '' && opts.some((o) => o.value === val)
          return `<select ${da}><option value="">（选值）</option>${opts.map((o) => `<option value="${escAttr(o.value)}" ${o.value === val ? 'selected' : ''}>${escHtml(o.label)}</option>`).join('')}${val && !exists ? `<option value="${escAttr(val)}" selected>${escHtml(val)}</option>` : ''}</select>`
        }
        case 'checkbox':
          return `<ui5-checkbox ${da} data-match-control="checkbox" ${val === 'true' || val === '1' ? 'checked' : ''} text=""></ui5-checkbox>`
        case 'number':
          return `<input ${da} type="number" value="${escAttr(val)}" placeholder="数值">`
        case 'date':
          return `<input ${da} type="date" value="${escAttr(val)}">`
        case 'datetime':
          return `<input ${da} type="datetime-local" value="${escAttr(val)}">`
        default:
          return `<input ${da} value="${escAttr(val)}" placeholder="匹配值">`
      }
    }
    const matchRows = rows.length
      ? rows.map((r, i) => `<div class="mr-row">
          <select data-match-row="${i}" data-match-part="col">${colOptgroups(r.col)}</select>
          ${opSel(i, r.op)}
          ${valCell(i, r.op, r.val, r.col)}
          <button type="button" class="icon-btn danger" data-action="match-remove-row" data-index="${i}" title="删除条件"><ui5-icon name="delete"></ui5-icon></button>
        </div>`).join('')
      : '<div class="item-sub">无匹配条件 → 该规则为兜底（任意锚点都命中，得分最低）。</div>'
    return `<section class="section">
      <h3>规则定义 · ${escHtml(rule.id)}</h3>
      <div class="insp-grid">
        <label>规则ID</label><input data-rule-id="${escAttr(rule.id)}" data-rule-prop="id" value="${escAttr(rule.id)}">
        <label>名称</label><input data-rule-id="${escAttr(rule.id)}" data-rule-prop="caption" value="${escAttr(rule.caption || rule.name || '')}">
        <label>关联表</label><span class="di-v">${escHtml(rule.panel ? this._tableAlias(rule.panel) : (rule.detail?.table ? this._tableAlias(rule.detail.table) : '（未关联）'))}</span>
      </div>
    </section>
    <section class="section">
      <h3>锚点维度 <span class="di-cnt">（${anchorDims.length}）</span></h3>
      <div class="item-sub" style="margin-bottom:6px">参与匹配的维度。在规则表「锚点维度」列多选；此处只读展示。</div>
      <div class="mr-chips">${anchorDims.length ? anchorDims.map((c) => `<span class="mr-chip">${escHtml(c)}</span>`).join('') : '<span class="item-sub">未选锚点维度</span>'}</div>
    </section>
    <section class="section">
      <h3>锚点列 <span class="di-cnt">（${anchorCols.length}）</span></h3>
      <div class="item-sub" style="margin-bottom:6px">参与匹配的列。在规则表「锚点列」列多选；此处只读展示。</div>
      <div class="mr-chips">${anchorCols.length ? anchorCols.map((c) => `<span class="mr-chip">${escHtml(c)}</span>`).join('') : '<span class="item-sub">未选锚点列</span>'}</div>
    </section>
    <section class="section">
      <h3>匹配条件 <span class="di-cnt">（${rows.length}）</span>
        <button type="button" class="link-back" data-action="match-add-row" title="新增匹配条件">＋ 条件</button>
      </h3>
      <div class="mr-list">${matchRows}</div>
      <div class="item-sub" style="margin-top:6px">多条件为「且」关系；越具体得分越高（等于&gt;属于&gt;通配）。</div>
    </section>`
  }

  /** anchor.match 对象 → 行式条件 [{col, op, val}]（op: eq/ne/in/nin/exists/any）。 */
  _matchToRows (match) {
    const rows = []
    for (const [col, cond] of Object.entries(match || {})) {
      if (cond === '*' || cond === undefined) { rows.push({ col, op: 'any', val: '' }); continue }
      if (Array.isArray(cond)) { rows.push({ col, op: 'in', val: cond.join(', ') }); continue }
      if (cond && typeof cond === 'object') {
        if (cond.$exists != null) { rows.push({ col, op: 'exists', val: '' }); continue }
        if (cond.$eq != null) { rows.push({ col, op: 'eq', val: String(cond.$eq) }); continue }
        if (cond.$ne != null) { rows.push({ col, op: 'ne', val: String(cond.$ne) }); continue }
        if (cond.$in != null) { rows.push({ col, op: 'in', val: (Array.isArray(cond.$in) ? cond.$in : [cond.$in]).join(', ') }); continue }
        if (cond.$nin != null) { rows.push({ col, op: 'nin', val: (Array.isArray(cond.$nin) ? cond.$nin : [cond.$nin]).join(', ') }); continue }
        // $under 层级泛化：值等于该节点或其子孙（树形维度配祖先节点联动子孙）
        if (cond.$under != null) { rows.push({ col, op: 'under', val: String(cond.$under) }); continue }
        // 属性对象等高级形态：降级为只读 JSON 行（用 eq 承载原值字符串，避免丢失）
        rows.push({ col, op: 'eq', val: JSON.stringify(cond) })
        continue
      }
      rows.push({ col, op: 'eq', val: String(cond) })
    }
    return rows
  }

  /** 行式条件 [{col,op,val}] → anchor.match 对象。 */
  _rowsToMatch (rows) {
    const match = {}
    for (const r of rows) {
      const col = (r.col || '').trim()
      if (!col) continue
      const val = (r.val || '').trim()
      switch (r.op) {
        case 'any': match[col] = '*'; break
        case 'exists': match[col] = { $exists: true }; break
        case 'eq': if (val) match[col] = val; break
        case 'ne': if (val) match[col] = { $ne: val }; break
        case 'in': { const a = val.split(',').map((s) => s.trim()).filter(Boolean); if (a.length) match[col] = { $in: a }; break }
        case 'nin': { const a = val.split(',').map((s) => s.trim()).filter(Boolean); if (a.length) match[col] = { $nin: a }; break }
        case 'under': if (val) match[col] = { $under: val }; break
        default: if (val) match[col] = val
      }
    }
    return match
  }

  /** 把当前工作态行写回选中规则的 anchor.match。 */
  /** 确保 _matchRows 已初始化（从当前选中规则的 match 派生）；返回工作态行数组。 */
  _ensureMatchRows () {
    if (!Array.isArray(this._matchRows)) {
      const rule = this._currentRule(normalizeCombination(this._combination || DEFAULT_COMBINATION))
      this._matchRows = this._matchToRows(rule?.anchor?.match || {})
    }
    return this._matchRows
  }

  _persistMatchRows () {
    const p = normalizeCombination(this._combination || DEFAULT_COMBINATION)
    const rule = p.rules.find((r) => r.id === this._selectedRuleId)
    if (!rule) return
    rule.anchor = rule.anchor || { dimensions: [], columns: [], match: {} }
    rule.anchor.match = this._rowsToMatch(this._matchRows || [])
    this._combination = p
    this._markDirty()
  }

  _matchAddRow () {
    this._ensureMatchRows().push({ col: '', op: 'eq', val: '' })
    this._render()
  }

  _matchRemoveRow (i) {
    this._ensureMatchRows().splice(i, 1)
    this._persistMatchRows()
    this._render()
  }

  _updateMatchRow (i, part, value) {
    const rows = this._ensureMatchRows()
    if (!rows[i]) return
    const row = rows[i]
    if (part === 'col') { row.col = value }
    else if (part === 'op') { row.op = value; if (value === 'exists' || value === 'any') row.val = '' }
    else { row.val = value }
    this._persistMatchRows()
    // 列/操作符变化需重渲染（值单元格随之切换控件）；强制 property 面板重建，无视焦点保护
    if (part === 'op' || part === 'col') { this._render(); this._pbus.emitState(true) }
  }

  _renderInspector (combination) {
    // 引用字典联查钻取栈优先：展示当前钻取的字典列定义 + 返回按钮
    if (this._refDictStack.length) {
      return this._renderRefDictInfo(this._refDictStack[this._refDictStack.length - 1])
    }
    // 单据整体信息（点 view 下拉顶部标题）
    if (this._docInfoView) {
      return this._renderDocInfo()
    }
    // 查看单据表详情优先：展示该单据表列定义（按 fieldSet 分组，只读）
    if (this._selectedDocTable) {
      const info = this._renderDocTableInfo(this._selectedDocTable)
      if (info) return info
    }
    // 维度选中：展示该维度所引字典的完整列信息（按 fieldSet 分组，只读）
    if (this._selectedDimCode && combination.dimensions?.[this._selectedDimCode]) {
      return this._renderDimColumnsInfo(combination.dimensions[this._selectedDimCode], this._selectedDimCode)
    }
    // 规则行选中：以 form 方式展示该规则定义编辑器（含 match 行式编辑器）
    if (this._ruleInspect) {
      const r = this._currentRule(combination)
      if (r) return this._renderRuleInspector(r, combination)
    }
    const rule = this._currentRule(combination)
    const field = this._currentField(combination)
    if (!rule) return '<section class="section"><div class="item-sub">先在「设计」里选择一条规则。</div></section>'
    if (!field) return '<section class="section"><div class="item-sub">点击字段行右侧的「检查器」图标，选择一个字段进行编辑。</div></section>'
    // 字段详编面板由统一 schema 渲染器产出（data-field-path 规范 key），事件经 CTX 适配器写回。
    const panelHtml = renderFieldPanel(field, { end: 'FLC', adapter: this._fieldAdapter(), ctx: this._fieldCtx(combination) })
    return `
    <section class="section">
      <h3>字段：${escHtml(fieldCaption(field))} <span class="item-sub">(${escHtml(field.dimType || '')})</span></h3>
    </section>
    ${panelHtml}`
  }

  // ─── 分组 groups 嵌套渲染 ──────────────────────────────────────────────

  _renderGroups (rule) {
    if (!rule) return '<div class="item-sub" style="padding:10px">先选择或新增一条规则。</div>'
    const fsc = this._activeFsc(rule)
    const groups = Array.isArray(fsc.groupsOwner?.groups) ? fsc.groupsOwner.groups : []
    if (!groups.length) return '<div class="item-sub" style="padding:10px">未定义分组；编译时所有字段平铺为顶层列。点击右上角新增分组。</div>'
    const allFieldCodes = this._resolvedFields(fsc).map((f) => fieldId(f)).filter(Boolean)
    return `<div style="padding:8px 10px">${groups.map((g, i) => this._renderGroupNode(g, String(i), allFieldCodes)).join('')}</div>`
  }

  _renderGroupNode (node, path, allFieldCodes) {
    const members = Array.isArray(node.members) ? node.members : []
    const fieldMembers = members.filter((m) => typeof m === 'string')
    const subGroups = members.map((m, idx) => ({ m, idx })).filter((x) => x.m && typeof x.m === 'object')
    const agg = node.aggregate && typeof node.aggregate === 'object' ? node.aggregate : {}
    const aggCheckbox = (k, label) => `<label><input type="checkbox" data-group-path="${escAttr(path)}" data-group-prop="aggregate.${k}" data-value-type="boolean" ${agg[k] ? 'checked' : ''}>${label}</label>`
    const usedCodes = new Set(fieldMembers)
    const addable = allFieldCodes.filter((c) => !usedCodes.has(c))
    return `<div class="grp">
      <div class="grp-head">
        <input style="flex:1" data-group-path="${escAttr(path)}" data-group-prop="caption" value="${escAttr(node.caption || '')}" placeholder="分组标题">
        ${selectHtml({ attrs: `data-group-path="${escAttr(path)}" data-group-prop="aggregatePosition"`, value: node.aggregatePosition || '', options: ['', 'before', 'after'] })}
        <ui5-button class="mini" icon="add" design="Transparent" data-action="add-subgroup" data-path="${escAttr(path)}" title="加子分组"></ui5-button>
        <ui5-button class="mini" icon="delete" design="Transparent" data-action="remove-group" data-path="${escAttr(path)}"></ui5-button>
      </div>
      <div class="agg-row">聚合：${aggCheckbox('sum', '合计')}${aggCheckbox('avg', '平均')}${aggCheckbox('max', '最大')}${aggCheckbox('min', '最小')}${aggCheckbox('count', '计数')}</div>
      <div class="grp-members">
        ${fieldMembers.map((code) => `<span class="chip">${escHtml(code)}<button data-action="group-remove-member" data-path="${escAttr(path)}" data-member="${escAttr(code)}">×</button></span>`).join('') || '<span class="item-sub">无字段</span>'}
      </div>
      ${addable.length ? this._renderGroupAddRow(path, addable) : ''}
      ${subGroups.map((x) => this._renderGroupNode(x.m, `${path}.members.${x.idx}`, allFieldCodes)).join('')}
    </div>`
  }

  _renderGroupAddRow (path, addable) {
    return `<div style="margin-top:4px;display:flex;gap:4px;align-items:center">
      <select data-group-add-select="${escAttr(path)}" style="flex:1">
        <option value="">+ 加入字段…</option>
        ${addable.map((c) => `<option value="${escAttr(c)}">${escHtml(c)}</option>`).join('')}
      </select>
    </div>`
  }

  // ─── 列模型属性 columnModel ────────────────────────────────────────────

  _renderColumnModelPanel (combination, rule) {
    const pcm = combination.columnModel && typeof combination.columnModel === 'object' ? combination.columnModel : {}
    const fsc = rule ? this._activeFsc(rule) : null
    const cmOwner = fsc?.cmOwner
    const rcm = cmOwner?.columnModel && typeof cmOwner.columnModel === 'object' ? cmOwner.columnModel : {}
    const scopeLabel = fsc && fsc.id ? `字段集「${escHtml(fsc.name)}」` : (rule ? `规则 ${escHtml(rule.id)}` : '')
    const row = (scope, prop, label, val, ph) => `<label>${label}</label><input data-column-model-scope="${scope}" data-column-model-prop="${prop}" value="${escAttr(val || '')}" placeholder="${escAttr(ph || '')}">`
    return `<div class="form-grid">
      <div class="sub-h" style="grid-column:1/-1">档案级（combination.columnModel）</div>
      ${row('combination', 'caption', '标题', pcm.caption, '辅助核算明细')}
      ${row('combination', 'datasetId', '数据集', pcm.datasetId, 'orders.details')}
      ${row('combination', 'toTitleCols', '标题列', pcm.toTitleCols, 'code,name')}
      ${row('combination', 'iconCol', '图标列', pcm.iconCol, '')}
      <div class="sub-h" style="grid-column:1/-1">规则级覆盖（${scopeLabel}）</div>
      ${rule ? `${row('rule', 'caption', '标题', rcm.caption, '')}${row('rule', 'datasetId', '数据集', rcm.datasetId, '')}${row('rule', 'toTitleCols', '标题列', rcm.toTitleCols, '')}${row('rule', 'iconCol', '图标列', rcm.iconCol, '')}` : '<div class="item-sub" style="grid-column:1/-1">先选择一条规则。</div>'}
    </div>`
  }

  _renderDiagnostics () {
    const d = this._diagnostics
    if (!d) return '<pre>尚未校验</pre>'
    const errors = Array.isArray(d.errors) ? d.errors : []
    const warnings = Array.isArray(d.warnings) ? d.warnings : []
    const lines = [
      d.valid ? 'OK: valid' : 'ERROR: invalid',
      ...errors.map((x) => `[ERROR] ${x.path}: ${x.message}`),
      ...warnings.map((x) => `[WARN] ${x.path}: ${x.message}`),
    ]
    return `<pre class="${d.valid ? 'ok' : 'bad'}">${escHtml(lines.join('\n'))}</pre>`
  }

  _syncToolbar () {
    const title = this.shadowRoot.querySelector('.main .title')
    if (title) title.textContent = `${this._combination?.title || this._combination?.scenario || '未选择弹性组合'}${this._dirty ? ' *' : ''}`
  }

  _isEditingSelf () {
    const ae = this.shadowRoot.activeElement
    return ae instanceof HTMLElement && /^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName)
  }

  _markDirty () {
    this._dirty = true
    this._diagnostics = null
    this._preview = null
    // overlay 合并视图缓存失效：owner 内容已变（pick/over/fields 被改），下次 _resolvedFields 需重新展开
    if (this._resolvedCache) this._resolvedCache = new WeakMap()
    // 编辑即清除上一次保存/校验的成功/错误提示，避免过期横幅残留
    if (this._messageType) { this._message = ''; this._messageType = '' }
    this._syncToolbar()
    if (!this._suppressContentSync && !this._isEditingSelf()) {
      // 通知源码视图同步；property/list 面板不订阅 dirty，避免打字时跨区重绘。
      this._pbus.emitDirty()
      // content 区明细字段表与检查器双向联动：表格自身在编辑时跳过，避免丢焦点。
      this._syncFieldsTable()
    }
  }

  /** 焦点保护地局部刷新明细字段表（本 shadow 正在编辑时跳过）。 */
  _syncFieldsTable () {
    const host = this.shadowRoot.getElementById('fields-table-host')
    if (!host) return
    const ae = this.shadowRoot.activeElement
    if (ae instanceof HTMLElement && /^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName)) return // 表格正在编辑，勿打断
    const combination = normalizeCombination(this._combination || DEFAULT_COMBINATION)
    const rule = combination.rules.find((r) => r.id === this._selectedRuleId) || combination.rules[0] || null
    // eslint-disable-next-line no-restricted-syntax -- 内容经 escHtml/escAttr。
    host.innerHTML = this._renderFieldsTable(rule, combination)
  }

  _updateCombinationProp (prop, value) {
    const p = normalizeCombination(this._combination || DEFAULT_COMBINATION)
    if (prop === 'anchorDimensions' || prop === 'tags') p[prop] = splitList(value)
    else p[prop] = value
    this._combination = p
    this._markDirty()
    if (prop === 'anchorDimensions') this._render()
  }

  _addDimension () {
    const p = normalizeCombination(this._combination || DEFAULT_COMBINATION)
    let code = uniqueCode('dim', Object.keys(p.dimensions))
    p.dimensions[code] = { name: '新维度', attributes: [] }
    if (!p.anchorDimensions.includes(code)) p.anchorDimensions.push(code)
    this._dimensionsOpen = true
    this._combination = p
    this._markDirty()
    this._render()
  }

  _removeDimension (code) {
    if (!code) return
    if (!window.confirm(`确定删除维度「${code}」？`)) return
    const p = normalizeCombination(this._combination || DEFAULT_COMBINATION)
    delete p.dimensions[code]
    p.anchorDimensions = p.anchorDimensions.filter((x) => x !== code)
    if (this._selectedDimCode === code) this._selectedDimCode = ''
    this._combination = p
    this._markDirty()
    this._render()
  }

  /** 维度行点击：命中行内 input/select/多选下拉/删除按钮时不选中；点查看图标或空白处则选中。 */
  _selectDimFromClick (e, code) {
    if (e.target instanceof Element && e.target.closest('input,select,.ms,.icon-btn.danger')) return
    this._selectDim(code)
  }

  _selectDim (code) {
    this._selectedDimCode = this._selectedDimCode === code ? '' : code
    this._selectedDocTable = ''
    this._docInfoView = false
    this._refDictStack = []
    this._render()
  }

  /** 维度属性多选：勾选/取消某列。保持下拉展开，只局部刷新该行摘要文本。 */
  _toggleDimAttr (code, col, checked) {
    if (!col) return
    const p = normalizeCombination(this._combination || DEFAULT_COMBINATION)
    const dim = p.dimensions[code]
    if (!dim) return
    let attrs = Array.isArray(dim.attributes) ? [...dim.attributes] : (dim.attributes && typeof dim.attributes === 'object' ? Object.keys(dim.attributes) : [])
    if (checked) { if (!attrs.includes(col)) attrs.push(col) }
    else attrs = attrs.filter((x) => x !== col)
    dim.attributes = attrs
    this._combination = p
    this._markDirty()
    // 局部更新：只刷新该维度行的摘要文本，避免整表重渲染收起下拉、丢失勾选焦点
    const head = this.shadowRoot.querySelector(`.ms-head[data-dim-code="${CSS.escape(code)}"] .ms-val`)
    // eslint-disable-next-line no-restricted-syntax -- 摘要文本经 escHtml 转义；占位符为静态字面量。
    if (head) head.innerHTML = attrs.length ? escHtml(attrs.join(', ')) : '<span class="ms-ph">选择属性列…</span>'
  }

  /** 规则锚点多选：勾选/取消某项。kind='dims'→anchor.dimensions（维度）；'cols'→anchor.columns（列）。局部刷新摘要不收起下拉。 */
  _toggleRuleAnchor (ruleId, kind, val, checked) {
    if (!val) return
    const isDims = kind === 'dims'
    const prop = isDims ? 'dimensions' : 'columns'
    const ph = isDims ? '选择锚点维度…' : '选择锚点列…'
    const p = normalizeCombination(this._combination || DEFAULT_COMBINATION)
    const rule = p.rules.find((r) => r.id === ruleId)
    if (!rule) return
    rule.anchor = rule.anchor || { dimensions: [], match: {} }
    let list = Array.isArray(rule.anchor[prop]) ? [...rule.anchor[prop]] : []
    if (checked) { if (!list.includes(val)) list.push(val) }
    else list = list.filter((x) => x !== val)
    rule.anchor[prop] = list
    this._combination = p
    this._markDirty()
    const head = this.shadowRoot.querySelector(`.ms-head[data-anchor-toggle][data-rule="${CSS.escape(ruleId)}"][data-kind="${kind}"] .ms-val`)
    // eslint-disable-next-line no-restricted-syntax -- 摘要文本经 escHtml 转义；占位符为静态字面量。
    if (head) head.innerHTML = list.length ? escHtml(list.join(', ')) : `<span class="ms-ph">${ph}</span>`
  }

  _updateDimension (code, prop, value) {
    const p = normalizeCombination(this._combination || DEFAULT_COMBINATION)
    const dim = p.dimensions[code]
    if (!dim) return
    if (prop === 'code') {
      const next = safeCode(value)
      if (!next || next === code || p.dimensions[next]) return
      p.dimensions[next] = dim
      delete p.dimensions[code]
      p.anchorDimensions = p.anchorDimensions.map((x) => x === code ? next : x)
      for (const rule of p.rules) {
        if (Array.isArray(rule.anchor?.dimensions)) rule.anchor.dimensions = rule.anchor.dimensions.map((x) => x === code ? next : x)
      }
      this._combination = p
      this._markDirty()
      this._render()
      return
    } else if (prop === 'attributes') {
      dim.attributes = splitList(value)
    } else {
      dim[prop] = value
    }
    this._combination = p
    this._markDirty()
  }

  _addRule () {
    const p = normalizeCombination(this._combination || DEFAULT_COMBINATION)
    const id = uniqueCode('rule', p.rules.map((r) => r.id))
    const panel = this._selectedPanel || DEFAULT_PANEL
    const rule = { id, caption: '新规则', anchor: { dimensions: [...p.anchorDimensions], match: {} }, detail: { fields: [] } }
    if (panel !== DEFAULT_PANEL) rule.panel = panel
    // 复制当前选中规则的内容（锚点/匹配/字段/分组/字段集 tab/列模型），便于成套复用
    const cur = p.rules.find((r) => r.id === this._selectedRuleId && (r.panel || DEFAULT_PANEL) === panel)
        || [...p.rules].reverse().find((r) => (r.panel || DEFAULT_PANEL) === panel)
    if (cur) {
      rule.anchor = cur.anchor ? deepClone(cur.anchor) : { dimensions: [...p.anchorDimensions], match: {} }
      rule.detail = cur.detail ? deepClone(cur.detail) : { fields: [] }
      if (!Array.isArray(rule.detail.fields)) rule.detail.fields = []
      if (cur.columnModel && Object.keys(cur.columnModel).length) rule.columnModel = deepClone(cur.columnModel)
    }
    // 插入到当前选中规则的下方（找不到则追加到末尾）
    const curIdx = p.rules.findIndex((r) => r.id === this._selectedRuleId)
    if (curIdx >= 0) p.rules.splice(curIdx + 1, 0, rule)
    else p.rules.push(rule)
    this._selectedRuleId = id
    this._selectedFieldSet = 0
    this._selectedFieldCode = ''
    // 该面板原是空 _extraPanels，现已落入真实规则，可从临时列表移除
    this._extraPanels = (this._extraPanels || []).filter((x) => x !== panel)
    this._combination = p
    this._markDirty()
    this._render()
  }

  _removeRule (id) {
    const p = normalizeCombination(this._combination || DEFAULT_COMBINATION)
    const rule = (p.rules || []).find((r) => r.id === id)
    // 非空保护：规则若已定义某张表的列（detail.fields 或各 fieldTab.fields），则不允许删除
    if (rule) {
      let fieldCount = Array.isArray(rule.detail?.fields) ? rule.detail.fields.length : 0
      const tabs = Array.isArray(rule.detail?.fieldTabs) ? rule.detail.fieldTabs : []
      for (const tb of tabs) fieldCount += Array.isArray(tb?.fields) ? tb.fields.length : 0
      if (fieldCount > 0) {
        this._alertBlocked(`规则「${rule.caption || id}」已定义 ${fieldCount} 个列字段，不能删除。请先清空其字段。`)
        return
      }
    }
    if (!window.confirm(`确定删除规则「${(rule && rule.caption) || id}」？`)) return
    p.rules = p.rules.filter((r) => r.id !== id)
    if (this._selectedRuleId === id) this._selectedRuleId = p.rules[0]?.id || ''
    this._combination = p
    this._markDirty()
    this._render()
  }

  /** 在同一面板内上(-1)/下(+1)移动规则，调整其在 p.rules 中的顺序。 */
  _moveRule (id, dir) {
    const p = normalizeCombination(this._combination || DEFAULT_COMBINATION)
    const panel = this._selectedPanel || DEFAULT_PANEL
    // 同面板规则在 p.rules 中的全局下标列表（保持原相对顺序）
    const idxs = p.rules.map((r, gi) => ({ r, gi })).filter((x) => (x.r.panel || DEFAULT_PANEL) === panel).map((x) => x.gi)
    const pos = idxs.findIndex((gi) => p.rules[gi].id === id)
    if (pos < 0) return
    const target = pos + dir
    if (target < 0 || target >= idxs.length) return
    const a = idxs[pos]; const b = idxs[target]
    ;[p.rules[a], p.rules[b]] = [p.rules[b], p.rules[a]]
    this._combination = p
    this._markDirty()
    this._render()
  }

  // ─── 规则面板（tab）─────────────────────────────────────────────────────────

  _selectPanel (name) {
    this._selectedPanel = name
    // 切面板时选中该面板第一条规则
    const p = normalizeCombination(this._combination || DEFAULT_COMBINATION)
    const first = (p.rules || []).find((r) => (r.panel || DEFAULT_PANEL) === name)
    this._selectedRuleId = first?.id || ''
    this._selectedFieldSet = 0
    this._selectedFieldCode = ''
    this._render()
  }

  _addPanel (anchorEl) {
    // 有引用单据 → 弹表树形下拉，选一张表建面板；无引用单据 → 回退手工命名
    if (this._docTableTree().length) {
      this._tablePicker = { mode: 'add', panel: '', anchor: this._anchorRect(anchorEl) }
      this._render()
      return
    }
    const existing = this._rulePanels(normalizeCombination(this._combination || DEFAULT_COMBINATION))
    let name = window.prompt('新规则面板名称：', '')
    if (name == null) return
    name = String(name).trim()
    if (!name) return
    if (existing.includes(name)) { this._selectPanel(name); return }
    this._extraPanels = [...(this._extraPanels || []), name]
    this._selectedPanel = name
    this._selectedRuleId = ''
    this._render()
  }

  _renamePanel (oldName, anchorEl) {
    // 有引用单据 → 弹下拉更换关联表；无引用单据 → 回退手工改名
    if (this._docTableTree().length) {
      this._tablePicker = { mode: 'rename', panel: oldName, anchor: this._anchorRect(anchorEl) }
      this._render()
      return
    }
    let name = window.prompt('重命名规则面板：', oldName)
    if (name == null) return
    name = String(name).trim()
    if (!name || name === oldName) return
    const existing = this._rulePanels(normalizeCombination(this._combination || DEFAULT_COMBINATION))
    if (existing.includes(name)) { window.alert(`面板「${name}」已存在`); return }
    const p = normalizeCombination(this._combination || DEFAULT_COMBINATION)
    for (const r of p.rules) {
      if ((r.panel || DEFAULT_PANEL) === oldName) {
        if (name === DEFAULT_PANEL) delete r.panel; else r.panel = name
      }
    }
    this._extraPanels = (this._extraPanels || []).map((x) => x === oldName ? name : x)
    this._selectedPanel = name
    this._combination = p
    this._markDirty()
    this._render()
  }

  /** 表树形选择器选中一张表：新增模式建面板，更换模式把面板关联表改为新表（同步其下规则 panel）。 */
  _pickTable (tableName) {
    if (!tableName) return
    const picker = this._tablePicker
    this._tablePicker = null
    // 查看模式：仅选中要在 property 区展示列定义的单据表，不改任何数据
    if (picker?.mode === 'view') {
      this._selectedDocTable = tableName
      this._docInfoView = false
      this._selectedDimCode = ''
      this._refDictStack = []
      this._render()
      return
    }
    // 字段集 tab 模式：建立/更换字段集关联表
    if (picker?.mode === 'fieldtab-add' || picker?.mode === 'fieldtab-rename') {
      this._applyFieldTabTable(picker, tableName)
      return
    }
    const existing = this._rulePanels(normalizeCombination(this._combination || DEFAULT_COMBINATION))
    if (picker?.mode === 'rename') {
      const oldName = picker.panel
      if (tableName === oldName) { this._render(); return }
      if (existing.includes(tableName)) { window.alert('该表已建立面板'); this._render(); return }
      const p = normalizeCombination(this._combination || DEFAULT_COMBINATION)
      for (const r of p.rules) { if ((r.panel || DEFAULT_PANEL) === oldName) r.panel = tableName }
      this._extraPanels = (this._extraPanels || []).map((x) => x === oldName ? tableName : x)
      this._selectedPanel = tableName
      this._combination = p
      this._markDirty()
      this._render()
      return
    }
    // add 模式
    if (existing.includes(tableName)) { this._selectPanel(tableName); return }
    this._extraPanels = [...(this._extraPanels || []), tableName]
    this._selectedPanel = tableName
    this._selectedRuleId = ''
    this._render()
  }

  // ─── 明细字段集 tab（index 0=rule.detail，≥1=rule.detail.fieldTabs[]）──────────

  _selectFieldTab (index) {
    this._selectedFieldSet = Math.max(0, Number(index) || 0)
    this._selectedFieldCode = ''
    this._render()
  }

  /** 新增字段集：有引用单据弹表树（mode fieldtab-add），否则手工命名建一个无表字段集。 */
  _addFieldTab (anchorEl) {
    if (this._docTableTree().length) {
      this._tablePicker = { mode: 'fieldtab-add', ruleId: this._selectedRuleId, anchor: this._anchorRect(anchorEl) }
      this._render()
      return
    }
    let name = window.prompt('新字段集名称：', '')
    if (name == null) return
    name = String(name).trim()
    if (!name) return
    this._applyFieldTabTable({ mode: 'fieldtab-add', ruleId: this._selectedRuleId }, '', name)
  }

  /** 更换字段集关联表（有引用单据弹表树），无引用单据则改名。index 指字段集序号。 */
  _renameFieldTab (index, anchorEl) {
    const idx = Number(index) || 0
    if (this._docTableTree().length) {
      this._tablePicker = { mode: 'fieldtab-rename', ruleId: this._selectedRuleId, fsIndex: idx, anchor: this._anchorRect(anchorEl) }
      this._render()
      return
    }
    const p = normalizeCombination(this._combination || DEFAULT_COMBINATION)
    const rule = p.rules.find((r) => r.id === this._selectedRuleId)
    if (!rule) return
    const owner = idx === 0 ? rule.detail : this._fieldTabs(rule)[idx - 1]
    if (!owner) return
    let name = window.prompt('字段集名称：', owner.fieldSetName || owner.name || '')
    if (name == null) return
    name = String(name).trim()
    if (idx === 0) { if (name) rule.detail.fieldSetName = name; else delete rule.detail.fieldSetName }
    else { if (name) owner.name = name; else delete owner.name }
    this._combination = p
    this._markDirty()
    this._render()
  }

  /**
   * 刷新字段集关联表的列。overlay 模式（use:"*" / pick）下列变更自动跟随（SSOT），提示无需同步；
   * 仅 inline fields 模式下补齐缺失列（已存在不覆盖）。picker.fsIndex 指目标字段集。
   */
  _refreshFieldTabColumns (tableName) {
    const picker = this._tablePicker
    this._tablePicker = null
    const idx = Number(picker?.fsIndex) || 0
    const p = normalizeCombination(this._combination || DEFAULT_COMBINATION)
    const rule = p.rules.find((r) => r.id === (picker?.ruleId || this._selectedRuleId))
    if (!rule) { this._render(); return }
    rule.detail = rule.detail || { fields: [] }
    const owner = idx === 0 ? rule.detail : (Array.isArray(rule.detail.fieldTabs) ? rule.detail.fieldTabs[idx - 1] : null)
    if (!owner) { this._render(); return }
    // overlay 模式（use/pick）下列变更自动跟随单据定义，无需手动同步
    const isOverlay = owner.use === '*' || owner.use === 'all' || (Array.isArray(owner.pick) && owner.pick.length)
    if (isOverlay) {
      this._message = '当前字段集以引用方式（use/pick）关联表，列变更自动跟随单据定义，无需手动同步'
      this._messageType = 'success'
      this._render()
      return
    }
    owner.fields = Array.isArray(owner.fields) ? owner.fields : []
    const existing = new Set(owner.fields.map((f) => fieldId(f)))
    const imported = this._docTableAllFields(tableName).map((c) => this._docColumnToField(c)).filter((f) => fieldId(f) && !existing.has(fieldId(f)))
    if (imported.length) owner.fields.push(...imported)
    this._selectedFieldSet = idx
    this._combination = p
    this._markDirty()
    this._message = imported.length ? `已同步 ${imported.length} 个字段（含引用字段集）` : '无新增字段（均已存在）'
    this._messageType = 'success'
    this._render()
  }

  /** 应用字段集关联表：add 新建 fieldTabs 项；rename 更更新指定索引字段集的 table（+清派生名）。
   *  overlay 模式：选表后产出 use:"*"（引用全表列）而非深拷贝 fields，保持 SSOT。 */
  _applyFieldTabTable (picker, tableName, explicitName) {
    const p = normalizeCombination(this._combination || DEFAULT_COMBINATION)
    const rule = p.rules.find((r) => r.id === (picker.ruleId || this._selectedRuleId))
    if (!rule) { this._render(); return }
    rule.detail = rule.detail || { fields: [] }
    rule.detail.fieldTabs = Array.isArray(rule.detail.fieldTabs) ? rule.detail.fieldTabs : []
    const ownerEmpty = (owner) => !((Array.isArray(owner.fields) && owner.fields.length) || (Array.isArray(owner.pick) && owner.pick.length) || owner.use === '*' || owner.use === 'all')
    if (picker.mode === 'fieldtab-rename') {
      const idx = Number(picker.fsIndex) || 0
      const owner = idx === 0 ? rule.detail : rule.detail.fieldTabs[idx - 1]
      if (owner) {
        if (tableName) owner.table = tableName; else delete owner.table
        if (tableName) { delete owner.name; delete owner.fieldSetName }
        // 仅当字段集尚无任何字段来源（fields/pick/use 全空）时自动设 use:"*" 引用全表列，避免覆盖已编辑内容
        if (tableName && ownerEmpty(owner)) owner.use = '*'
      }
      this._selectedFieldSet = idx
    } else {
      // add：表名重复则切到已存在的字段集
      const sets = this._fieldSets(rule)
      const dupIdx = sets.findIndex((s) => s.table && s.table === tableName)
      if (dupIdx >= 0) { this._selectedFieldSet = dupIdx; this._combination = p; this._render(); return }
      const id = uniqueCode('ftab', rule.detail.fieldTabs.map((x) => x.id))
      const item = { id }
      if (tableName) { item.table = tableName; item.use = '*' }
      if (explicitName) item.name = explicitName
      rule.detail.fieldTabs.push(item)
      this._selectedFieldSet = rule.detail.fieldTabs.length // index = detail(0) + 前面的 tabs + 本项
    }
    this._selectedFieldCode = ''
    this._combination = p
    this._markDirty()
    this._render()
  }

  /** 删除字段集。删 index 0（rule.detail）时把 fieldTabs[0] 提升为 detail.fields（保引擎契约）。 */
  _removeFieldTab (index) {
    const idx = Number(index) || 0
    const p = normalizeCombination(this._combination || DEFAULT_COMBINATION)
    const rule = p.rules.find((r) => r.id === this._selectedRuleId)
    if (!rule) return
    const sets = this._fieldSets(rule)
    if (sets.length <= 1) { window.alert('至少保留一个字段集'); return }
    const set = sets[idx]
    if (!set) return
    const cnt = this._resolvedFields(set).length
    if (!window.confirm(`确定删除字段集「${this._fscLabel(rule, idx)}」及其 ${cnt} 个字段？`)) return
    const tabs = Array.isArray(rule.detail.fieldTabs) ? rule.detail.fieldTabs : []
    if (idx === 0) {
      // 把 fieldTabs[0] 提升为新的 rule.detail（fields/groups/columnModel）
      const promoted = tabs.shift()
      rule.detail = {
        fields: Array.isArray(promoted?.fields) ? promoted.fields : [],
        ...(Array.isArray(promoted?.groups) ? { groups: promoted.groups } : {}),
        ...(promoted?.table ? { table: promoted.table } : {}),
        ...(promoted?.name ? { fieldSetName: promoted.name } : {}),
        ...(tabs.length ? { fieldTabs: tabs } : {}),
      }
      if (promoted?.columnModel && Object.keys(promoted.columnModel).length) rule.columnModel = promoted.columnModel
      else delete rule.columnModel
    } else {
      tabs.splice(idx - 1, 1)
      if (tabs.length) rule.detail.fieldTabs = tabs; else delete rule.detail.fieldTabs
    }
    this._selectedFieldSet = 0
    this._selectedFieldCode = ''
    this._combination = p
    this._markDirty()
    this._render()
  }


  _removePanel (name) {
    const p = normalizeCombination(this._combination || DEFAULT_COMBINATION)
    const inPanel = (p.rules || []).filter((r) => (r.panel || DEFAULT_PANEL) === name)
    // 非空保护：该面板下若已定义规则，则不允许删除
    if (inPanel.length) {
      this._alertBlocked(`面板「${name}」下已定义 ${inPanel.length} 条规则，不能删除。请先删除该面板下的所有规则。`)
      return
    }
    if (!window.confirm(`确定删除面板「${name}」？`)) return
    p.rules = (p.rules || []).filter((r) => (r.panel || DEFAULT_PANEL) !== name)
    this._extraPanels = (this._extraPanels || []).filter((x) => x !== name)
    this._selectedPanel = ''
    this._selectedFieldSet = 0
    this._selectedRuleId = ''
    this._combination = p
    this._markDirty()
    this._render()
  }

  /** 规则行点击：命中行内 input/select（编辑）或删除按钮时不切换；点选中图标或空白处则切换。 */
  _selectRuleFromClick (e, id) {
    if (e.target instanceof Element && e.target.closest('input,select,.icon-btn.danger')) return
    this._selectRule(id)
    // 点规则行 → property 区展示该规则的 form 编辑器，初始化匹配条件工作态行
    this._ruleInspect = true
    const r = this._currentRule(normalizeCombination(this._combination || DEFAULT_COMBINATION))
    this._matchRows = this._matchToRows(r?.anchor?.match || {})
    this._render()
  }

  _selectRule (id) {
    this._selectedRuleId = id
    this._selectedFieldSet = 0
    this._selectedFieldCode = ''
    this._selectedDimCode = ''
    this._selectedDocTable = ''
    this._docInfoView = false
    this._refDictStack = []
    this._ruleInspect = false
    this._matchRows = null
    this._render()
  }

  _updateRule (id, prop, value) {
    const p = normalizeCombination(this._combination || DEFAULT_COMBINATION)
    const rule = p.rules.find((r) => r.id === id)
    if (!rule) return
    if (prop === 'id') {
      const next = safeCode(value)
      if (!next || next === id || p.rules.some((r) => r.id === next)) return
      rule.id = next
      this._selectedRuleId = next
      this._combination = p
      this._markDirty()
      this._render()
      return
    } else if (prop === 'anchorDimensions') {
      rule.anchor = rule.anchor || {}
      rule.anchor.dimensions = splitList(value)
    } else if (prop === 'match') {
      try { rule.anchor = { ...(rule.anchor || {}), match: value.trim() ? JSON.parse(value) : {} } } catch { return }
    } else {
      rule[prop] = value
    }
    this._combination = p
    this._markDirty()
  }

  // ─── 公式编辑器（模态）────────────────────────────────────────────────────

  _openFormula (code) {
    code = this._fieldCodeFromKey(code)
    const combination = normalizeCombination(this._combination || DEFAULT_COMBINATION)
    const rule = this._currentRule(combination)
    const field = this._resolvedFields(this._activeFsc(rule)).find((f) => fieldId(f) === code)
    if (!field) return
    this._formulaEdit = { code, draft: field.formula || '' }
    this._render()
  }

  _saveFormula () {
    if (!this._formulaEdit) return
    if (!this._checkFormula(this._formulaEdit.draft).ok) { window.alert('公式语法有误，请修正后再确定'); return }
    const p = normalizeCombination(this._combination || DEFAULT_COMBINATION)
    const rule = p.rules.find((r) => r.id === this._selectedRuleId) || p.rules[0]
    if (!rule) { this._formulaEdit = null; this._render(); return }
    const fsc = this._activeFsc(rule)
    const code = this._formulaEdit.code
    const expr = (this._formulaEdit.draft || '').trim()
    // formula 写到存储层 overlay（pick.over.formula / inline field.formula）
    this._setOverlayProp(fsc, code, 'formula', expr || null)
    this._formulaEdit = null
    this._combination = p
    this._markDirty()
    this._render()
  }

  /** 在公式草稿光标处插入 token（变量/函数/运算符）。无法取光标时追加到末尾。 */
  _formulaInsert (token) {
    if (!this._formulaEdit || !token) return
    const ta = this.shadowRoot.querySelector('textarea[data-formula-draft]')
    let next
    if (ta) {
      const s = ta.selectionStart ?? ta.value.length
      const e = ta.selectionEnd ?? ta.value.length
      next = ta.value.slice(0, s) + token + ta.value.slice(e)
      this._formulaEdit.draft = next
      this._render()
      // 重渲染后恢复光标到插入点之后
      const ta2 = this.shadowRoot.querySelector('textarea[data-formula-draft]')
      if (ta2) { const pos = s + token.length; ta2.focus(); ta2.setSelectionRange(pos, pos) }
      this._syncFormulaPreview()
    } else {
      this._formulaEdit.draft = (this._formulaEdit.draft || '') + token
      this._render()
    }
  }

  /** 校验当前草稿表达式，返回 {ok, message}。 */
  _checkFormula (expr) {
    const e = (expr || '').trim()
    if (!e) return { ok: true, message: '空公式' }
    try { compileFormula(e); return { ok: true, message: '语法正确' } } catch (err) { return { ok: false, message: err instanceof Error ? err.message : String(err) } }
  }

  /** 局部刷新公式预览/校验行（不整体重渲染，保文本区焦点）。 */
  _syncFormulaPreview () {
    if (!this._formulaEdit) return
    const el = this.shadowRoot.querySelector('.fx-status')
    if (!el) return
    const r = this._checkFormula(this._formulaEdit.draft)
    el.className = `fx-status ${r.ok ? 'ok' : 'bad'}`
    el.textContent = r.ok ? `✓ ${r.message}` : `✗ ${r.message}`
  }

  /** 公式编辑器模态 HTML（变量树 + 函数面板 + 表达式区 + 校验）。 */
  _renderFormulaEditor (combination) {
    if (!this._formulaEdit) return ''
    const rule = this._currentRule(combination)
    const fsc = this._activeFsc(rule)
    const fsTable = fsc?.table || rule?.panel || rule?.detail?.table || ''
    // 变量：当前字段集表的列 + 各维度的属性列（维度.属性）
    const tableCols = this._docTableAllColumns(fsTable)
    const dimVars = []
    for (const code of Object.keys(combination.dimensions || {})) {
      const dim = combination.dimensions[code]
      const attrs = Array.isArray(dim?.attributes) ? dim.attributes : Object.keys(dim?.attributes || {})
      if (attrs.length) dimVars.push({ code, name: dim?.name || code, vars: attrs.map((a) => `${code}.${a}`) })
    }
    const varChip = (v) => `<button type="button" class="fx-var" data-action="formula-insert" data-token="${escAttr(v)}" title="${escAttr(v)}">${escHtml(v)}</button>`
    const fnGroups = [
      { name: '逻辑', fns: ['IF(,,)', 'AND(,)', 'OR(,)', 'NOT()', 'ISEMPTY()', 'COALESCE(,)'] },
      { name: '数值', fns: ['ROUND(,)', 'ABS()', 'FLOOR()', 'CEIL()', 'MIN(,)', 'MAX(,)', 'SUM(,)', 'AVG(,)', 'MOD(,)', 'POWER(,)', 'SQRT()'] },
      { name: '字符串', fns: ['CONCAT(,)', 'LEN()', 'UPPER()', 'LOWER()', 'TRIM()', 'LEFT(,)', 'RIGHT(,)', 'MID(,,)', 'REPLACE(,,)', 'CONTAINS(,)', 'STARTSWITH(,)', 'ENDSWITH(,)'] },
      { name: '日期', fns: ['TODAY()', 'NOW()', 'YEAR()', 'MONTH()', 'DAY()', 'HOUR()', 'MINUTE()', 'DATEADD(,)', 'DATEDIFF(,)'] },
    ]
    const ops = ['+', '-', '*', '/', '(', ')', '>', '<', '>=', '<=', '==', '!=', '&&', '||']
    const fnBtn = (f) => `<button type="button" class="fx-fn" data-action="formula-insert" data-token="${escAttr(f)}" title="${escAttr(f)}">${escHtml(f.replace(/\(.*/, ''))}</button>`
    const status = this._checkFormula(this._formulaEdit.draft)
    return `<div class="fx-backdrop" data-action="formula-cancel">
      <div class="fx-modal" data-fx-stop>
        <div class="fx-head">公式编辑器 · ${escHtml(this._formulaEdit.code)}<span class="fx-x" data-action="formula-cancel">✕</span></div>
        <div class="fx-body">
          <div class="fx-vars">
            <div class="fx-sec-title">变量</div>
            <div class="fx-grp-title">本表列（${escHtml(this._tableAlias(fsTable) || fsTable || '未关联表')}）</div>
            <div class="fx-chips">${tableCols.length ? tableCols.map(varChip).join('') : '<span class="item-sub">无</span>'}</div>
            ${dimVars.map((g) => `<div class="fx-grp-title">维度：${escHtml(g.name)}</div><div class="fx-chips">${g.vars.map(varChip).join('')}</div>`).join('')}
          </div>
          <div class="fx-main">
            <div class="fx-toolbar">${ops.map((o) => `<button type="button" class="fx-op" data-action="formula-insert" data-token="${escAttr(o)}">${escHtml(o)}</button>`).join('')}</div>
            <textarea data-formula-draft class="fx-expr" spellcheck="false" placeholder="如 IF(amount > 0, amount * rate, 0)">${escHtml(this._formulaEdit.draft || '')}</textarea>
            <div class="fx-status ${status.ok ? 'ok' : 'bad'}">${status.ok ? '✓ ' : '✗ '}${escHtml(status.message)}</div>
            <div class="fx-fns">
              ${fnGroups.map((g) => `<div class="fx-fn-grp"><div class="fx-grp-title">${escHtml(g.name)}函数</div><div class="fx-fn-list">${g.fns.map(fnBtn).join('')}</div></div>`).join('')}
            </div>
          </div>
        </div>
        <div class="fx-foot">
          <button type="button" class="fx-clear" data-action="formula-clear">清空</button>
          <span class="spacer"></span>
          <button type="button" class="fx-cancel" data-action="formula-cancel">取消</button>
          <button type="button" class="fx-ok ${status.ok ? '' : 'disabled'}" data-action="formula-save">确定</button>
        </div>
      </div>
    </div>`
  }

  _addField () {
    const p = normalizeCombination(this._combination || DEFAULT_COMBINATION)
    const rule = p.rules.find((r) => r.id === this._selectedRuleId) || p.rules[0]
    if (!rule) return
    const fsc = this._activeFsc(rule)
    // 新增字段是纯 inline（无物理对应），追加到 owner.fields（inline 与 overlay pick/use 合法共存）
    fsc.fieldsOwner.fields = Array.isArray(fsc.fieldsOwner.fields) ? fsc.fieldsOwner.fields : []
    const fields = fsc.fieldsOwner.fields
    const resolved = this._resolvedFields(fsc)
    const code = uniqueCode('field', resolved.map((f) => fieldId(f)))
    // 复制当前选中字段（在合并视图里找；找不到建空字段）
    const cur = resolved.find((f) => fieldId(f) === this._selectedFieldCode)
    const field = cur ? { ...deepClone(cur), id: code, ref: undefined, over: undefined, use: undefined, as: undefined } : { id: code, name: '', caption: { zh_CN: '新字段' }, dimType: '', dataType: 'VARCHAR', edit: { mode: 'cmx-text-input' } }
    // 插入到当前选中字段的下方（在合并视图里定位插入位置对应的 fields 末尾）
    fields.push(field)
    this._selectedFieldCode = code
    this._combination = p
    this._markDirty()
    this._render()
  }

  async _copyFields () {
    const p = normalizeCombination(this._combination || DEFAULT_COMBINATION)
    const rule = p.rules.find((r) => r.id === this._selectedRuleId) || p.rules[0]
    if (!rule) return
    const fsc = this._activeFsc(rule)
    const owner = fsc?.fieldsOwner || {}
    try {
      // 携带 overlay 结构（pick/use/fields）原样复制，粘贴时整体还原
      await writeFieldClipboard(createFieldClipboardPayload({
        source: 'CMXPortalManager.FlexibleCombination',
        fields: owner.fields || [],
        groups: fsc?.groupsOwner?.groups || [],
        // overlay 扩展：pick/use 也带上（clipboard payload 容忍额外字段）
        pick: owner.pick,
        use: owner.use,
        table: owner.table,
      }))
    } catch (err) {
      window.alert(`复制失败：${err?.message || err}`)
    }
  }

  async _pasteFields () {
    const p = normalizeCombination(this._combination || DEFAULT_COMBINATION)
    const rule = p.rules.find((r) => r.id === this._selectedRuleId) || p.rules[0]
    if (!rule) return
    try {
      const payload = await readFieldClipboard()
      const fsc = this._activeFsc(rule)
      const owner = fsc.fieldsOwner
      // 整体替换字段集内容（支持 overlay 结构还原）
      owner.fields = payload.fields || []
      if (Array.isArray(payload.pick)) owner.pick = payload.pick; else delete owner.pick
      if (payload.use) owner.use = payload.use; else delete owner.use
      if (payload.table) owner.table = payload.table
      fsc.groupsOwner.groups = payload.groups || []
      // 选中第一个字段（合并视图）
      const resolved = this._resolvedFields(fsc)
      this._selectedFieldCode = resolved.length ? fieldId(resolved[0]) : ''
      this._combination = p
      this._markDirty()
      this._render()
    } catch (err) {
      window.alert(`粘贴失败：${err?.message || err}`)
    }
  }

  _removeField (code) {
    const p = normalizeCombination(this._combination || DEFAULT_COMBINATION)
    const rule = p.rules.find((r) => r.id === this._selectedRuleId)
    if (!rule) return
    const fsc = this._activeFsc(rule)
    const owner = fsc.fieldsOwner
    // 先在合并视图里确认字段存在 + 取真实 code
    const resolved = this._resolvedFields(fsc)
    const field = this._fieldByEditKey(resolved, code)
    if (!field) return
    const actualCode = fieldId(field)
    if (!window.confirm(`确定删除字段「${actualCode}」？`)) return
    const hit = this._findOverlayItem(fsc, actualCode)
    if (hit?.kind === 'pick') {
      // pick 项：直接从 pick 数组移除
      owner.pick = (owner.pick || []).filter((x) => x !== hit.item)
    } else if (hit?.kind === 'inline') {
      // inline 项：从 fields 数组移除
      owner.fields = (owner.fields || []).filter((f) => f !== hit.item)
    } else if (hit?.kind === 'use') {
      // use:'*' 模式：全表引用下删除某列 → 转为显式 pick（列出保留列），排除被删列
      const table = hit.table
      const cols = table ? this._docTableAllFields(table) : []
      if (!Array.isArray(owner.pick)) owner.pick = []
      // 删除 use，用 pick 显式列出除被删列外的所有列
      delete owner.use
      for (const c of cols) {
        const cid = fieldId(c)
        if (cid === actualCode) continue
        owner.pick.push({ ref: `${table}.${cid}` })
      }
    }
    this._combination = p
    this._markDirty()
    this._render()
  }

  /** 在当前字段集内上(-1)/下(+1)移动字段，调整其顺序。
   *  overlay 模式：移动 pick 项顺序（pick 顺序=渲染顺序）；use:'*' 模式列顺序跟随 DOC，提示无法移动。 */
  _moveField (code, dir) {
    const p = normalizeCombination(this._combination || DEFAULT_COMBINATION)
    const rule = p.rules.find((r) => r.id === this._selectedRuleId)
    if (!rule) return
    const fsc = this._activeFsc(rule)
    const owner = fsc.fieldsOwner
    const hit = this._findOverlayItem(fsc, code)
    if (hit?.kind === 'pick') {
      // 移动 pick 项顺序
      const arr = owner.pick
      const i = arr.indexOf(hit.item)
      const j = i + dir
      if (i < 0 || j < 0 || j >= arr.length) return
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
    } else if (hit?.kind === 'inline') {
      // 移动 inline field 顺序
      const fields = owner.fields
      if (!Array.isArray(fields)) return
      const i = fields.indexOf(hit.item)
      const j = i + dir
      if (i < 0 || j < 0 || j >= fields.length) return
      ;[fields[i], fields[j]] = [fields[j], fields[i]]
    } else if (hit?.kind === 'use') {
      this._message = 'use:"*" 模式下列顺序跟随单据定义，如需自定义顺序请改为逐列 pick'
      this._messageType = 'warning'
    }
    this._combination = p
    this._markDirty()
    this._render()
  }

  /** 表格内联（统一渲染器）按 code + 规范 key 写入；id(=code) 走重命名逻辑，余者经适配器。 */
  _updateFieldByKey (code, key, rawValue, valueType) {
    const p = normalizeCombination(this._combination || DEFAULT_COMBINATION)
    const rule = p.rules.find((r) => r.id === this._selectedRuleId)
    if (!rule) return
    const fsc = this._activeFsc(rule)
    if (key === 'id') {
      // id 重命名：合并视图里找字段，存储层 overlay 项改 as/id，同步 group member
      const fields = this._resolvedFields(fsc)
      const field = this._fieldByEditKey(fields, code)
      if (!field) return
      const oldCode = fieldId(field)
      const next = safeCode(rawValue)
      if (!next || next === oldCode || fields.some((f) => f !== field && fieldId(f) === next)) return
      // 同步到存储层 overlay 项
      const hit = this._findOverlayItem(fsc, oldCode)
      if (hit?.kind === 'pick') hit.item.as = next
      else if (hit?.kind === 'inline') hit.item.id = next
      replaceGroupMemberCode(fsc.groupsOwner?.groups, oldCode, next)
      if (this._selectedFieldCode === oldCode) this._selectedFieldCode = next
      this._combination = p; this._markDirty()
      return
    }
    // 属性写回：用适配器 coerce 值 + 判断 relayout，再同步到存储层 overlay
    const fields = this._resolvedFields(fsc)
    const field = this._fieldByEditKey(fields, code)
    if (!field) return
    const ret = this._fieldAdapter().set(field, key, rawValue, valueType)
    // 把 coerce 后的值同步到存储层 overlay（pick.over / inline field / use→pick 新建）
    const coerced = this._readPath(field, key)
    this._setOverlayProp(fsc, code, key, coerced)
    this._combination = p
    this._markDirty()
    if (ret?.relayout && !this._suppressContentSync) this._render()
  }

  /** 详编面板（统一 schema）按规范 key/点路径写入选中字段；validations.* 用点路径，其余经适配器。
   *  overlay 模式下，属性变更同步到存储层 overlay（pick.over / inline field）。 */
  _updateFieldByPath (path, rawValue, valueType) {
    const p = normalizeCombination(this._combination || DEFAULT_COMBINATION)
    const rule = this._currentRule(p)
    const field = this._currentField(p)
    if (!field || !path || !rule) return
    const fsc = this._activeFsc(rule)
    const code = fieldId(field)
    if (path.startsWith('validations.') || path.startsWith('enumValues.')) {
      this._writeFieldPath(field, path, rawValue, valueType)
      // 数组整体同步到 overlay（数组替换语义）；arrKey = validations 或 enumValues
      const arrKey = path.split('.')[0]
      this._setOverlayProp(fsc, code, arrKey, field[arrKey] || [])
    } else {
      this._fieldAdapter().set(field, path, rawValue, valueType)
      const coerced = this._readPath(field, path)
      this._setOverlayProp(fsc, code, path, coerced)
    }
    // 选中引用字典（refDict→维度绑定）后，自动带出引用字段/显示字段默认值（取该维度属性列），重渲染刷新下拉
    if (path === 'refDict') {
      this._autofillDictFields(field, p)
      // refDict 自动带出的 refField/displayField 也同步到 overlay
      this._setOverlayProp(fsc, code, 'refField', field.refField)
      this._setOverlayProp(fsc, code, 'displayField', field.displayField)
      this._combination = p
      this._markDirty()
      if (!this._suppressContentSync) this._render()
      return
    }
    this._combination = p
    this._markDirty()
  }

  /** 选中引用字典(维度)后自动填充 引用字段/显示字段：取该维度属性列（dim.attributes），首列作值、含 name 优先作显示。 */
  _autofillDictFields (field, p) {
    const dim = p?.dimensions?.[field?.refDict]
    if (!dim) { delete field.refField; delete field.displayField; return }
    const attrs = Array.isArray(dim.attributes) ? dim.attributes : Object.keys(dim.attributes || {})
    if (!attrs.length) return
    field.refField = attrs.find((a) => /code|id/i.test(a)) || attrs[0]
    field.displayField = attrs.find((a) => /name|label|desc/i.test(a)) || attrs[attrs.length - 1]
  }

  /** 通用点路径写入（供 validations.* 等数组路径用）。 */
  _writeFieldPath (field, path, rawValue, valueType) {
    const value = coerceValue(rawValue, valueType)
    const segs = path.split('.')
    const leaf = segs.pop()
    let node = field
    for (const seg of segs) {
      const k = /^\d+$/.test(seg) ? Number(seg) : seg
      if (node[k] == null || typeof node[k] !== 'object') node[k] = /^\d+$/.test(segs[segs.indexOf(seg) + 1] || '') ? [] : {}
      node = node[k]
    }
    const leafKey = /^\d+$/.test(leaf) ? Number(leaf) : leaf
    if (value === '' || value == null) {
      if (Array.isArray(node)) node.splice(Number(leafKey), 1)
      else delete node[leafKey]
    } else {
      node[leafKey] = value
    }
  }

  _itemKey (item) {
    return `${item.domain}/${item.app}/${item.module}/${item.scenario}`
  }

  _docRefKey (item) {
    return `${item.domain}/${item.application || item.app || ''}/${item.module}/${item.file}`
  }


  // ─── Inspector / 选中字段 ──────────────────────────────────────────────

  /** 字段行点击：命中行内 input/select（编辑）或删除按钮时不选中；点检查器图标或空白处则选中。 */
  _selectFieldFromClick (e, code) {
    if (e.target instanceof Element && e.target.closest('input,select,textarea,.icon-btn:not([data-action="select-field"])')) return
    this._selectField(this._fieldCodeFromKey(code))
  }

  _selectField (code) {
    if (!code || code === this._selectedFieldCode) {
      if (code) this._pbus.emitState(true)
      return
    }
    this._selectedFieldCode = code
    this._selectedDimCode = ''
    this._selectedDocTable = ''
    this._docInfoView = false
    this._refDictStack = []
    this._ruleInspect = false
    this._matchRows = null
    this._syncFieldsTable()
    this._pbus.emitState(true)
  }

  /** 取当前选中规则 + 选中字段（供 Inspector 渲染/编辑）。 */
  _currentRule (p) {
    const prof = p || normalizeCombination(this._combination || DEFAULT_COMBINATION)
    return prof.rules.find((r) => r.id === this._selectedRuleId) || prof.rules[0] || null
  }

  /**
   * 字段集列表抽象：所有字段集 tab 一视同仁，底层映射见 _fieldSets。
   * 原 rule.detail.fields/groups + rule.columnModel 结构不变（引擎照常直读 index 0）。
   */
  _fieldTabs (rule) {
    return Array.isArray(rule?.detail?.fieldTabs) ? rule.detail.fieldTabs : []
  }

  /**
   * 规则的字段集统一列表（每个 tab 一视同仁）：
   *   index 0 → rule.detail 本身（fields/groups 在 detail，columnModel 在 rule）——保持原结构供引擎直读；
   *   index ≥1 → rule.detail.fieldTabs[index-1]（fields/groups/columnModel 都在该项上）。
   * 返回 [{index, owner, table, name, fieldsOwner, groupsOwner, cmOwner}]，UI 不区分主次。
   */
  _fieldSets (rule) {
    if (!rule) return []
    rule.detail = rule.detail || { fields: [] }
    const sets = [{ index: 0, table: rule.detail.table || '', name: rule.detail.fieldSetName || '', fieldsOwner: rule.detail, groupsOwner: rule.detail, cmOwner: rule }]
    this._fieldTabs(rule).forEach((t, i) => {
      t.fields = Array.isArray(t.fields) ? t.fields : []
      sets.push({ index: i + 1, table: t.table || '', name: t.name || '', fieldsOwner: t, groupsOwner: t, cmOwner: t })
    })
    return sets
  }

  _activeFsc (rule) {
    if (!rule) return null
    const sets = this._fieldSets(rule)
    let idx = Number(this._selectedFieldSet) || 0
    if (idx < 0 || idx >= sets.length) { idx = 0; this._selectedFieldSet = 0 }
    return sets[idx]
  }

  /**
   * 把字段集的 overlay 形态（pick/use + inline fields）展开成「合并视图完整字段数组」供渲染器使用。
   * - 有 pick/use 时：调 expandRuleDetail 读时展开（DOC 列基底 + over 增量），渲染器看到完整字段。
   * - 无 pick/use（纯 inline 或旧档案）时：原样返回 fieldsOwner.fields。
   * 编辑器存储层仍是 overlay（pick/use/over），渲染层是合并视图——两者解耦，DCT/DOC 端零影响。
   *
   * 缓存：用 owner 做 WeakMap key 缓存展开结果。同一 owner 在「渲染→编辑」周期内引用不变，
   * WeakMap editKey 机制才能匹配（否则 expandRuleDetail 每次产生新对象 → editKey 失效 → 编辑写不进）。
   * owner 被修改时（_markDirty / _setOverlayProp 等改 pick/over），下次 _resolvedFields 会拿到同一 owner 对象，
   * 但内容已变——需要失效缓存。_markDirty 是统一的"内容变了"信号，在那里清缓存。
   */
  _resolvedFields (fsc) {
    if (!fsc?.fieldsOwner) return []
    const owner = fsc.fieldsOwner
    const hasOverlay = Array.isArray(owner.pick) && owner.pick.length || owner.use === '*' || owner.use === 'all'
    if (!hasOverlay) return Array.isArray(owner.fields) ? owner.fields : []
    // 缓存命中：owner 没变就直接复用上次的展开结果（保持字段对象引用稳定）
    if (!this._resolvedCache) this._resolvedCache = new WeakMap()
    const cached = this._resolvedCache.get(owner)
    if (cached) return cached
    // overlay 展开：注入单据表列访问器；dictOf 可选（编辑器侧字典配置运行时由服务端补，此处略）
    const expanded = expandRuleDetail(owner, {
      tableCols: (t) => this._docTableAllFields(t),
      defaultTable: owner.table || fsc.table || '',
    })
    const fields = expanded.fields || []
    this._resolvedCache.set(owner, fields)
    return fields
  }

  /**
   * 在存储层定位某 fieldId 对应的 overlay 项（ref 项 / inline 项 / use:* 全表引用）。
   * @returns {{kind:'pick'|'inline'|'use', item:object, owner:object}|null}
   *   - pick：item = owner.pick 里 {ref,over,as} 的那一项；写属性改 item.over
   *   - inline：item = owner.fields 里的完整字段；写属性直接改 item
   *   - use：owner.use='*'，该 id 在全表列里；写属性需新建一个 pick 项 {ref,over} 承载 over
   */
  _findOverlayItem (fsc, code) {
    if (!fsc?.fieldsOwner || !code) return null
    const owner = fsc.fieldsOwner
    const table = owner.table || fsc.table || ''
    // 1. pick 里的 ref 项
    if (Array.isArray(owner.pick)) {
      for (const p of owner.pick) {
        if (!p || !p.ref) continue
        // ref = "table.col"，as 覆盖 id；无 as 时用 ref 里的 col
        const dot = p.ref.lastIndexOf('.')
        const col = dot >= 0 ? p.ref.slice(dot + 1) : p.ref
        const id = p.as || col
        if (id === code) return { kind: 'pick', item: p, owner }
      }
    }
    // 2. inline fields
    if (Array.isArray(owner.fields)) {
      for (const f of owner.fields) {
        if (fieldId(f) === code) return { kind: 'inline', item: f, owner }
      }
    }
    // 3. use:'*' —— 该 id 在全表列里但无独立 pick 项；返回 use 标记，调用方按需新建 pick 项
    if (owner.use === '*' || owner.use === 'all') {
      const cols = table ? this._docTableAllFields(table) : []
      if (cols.some((c) => fieldId(c) === code)) return { kind: 'use', item: null, owner, table, code }
    }
    return null
  }

  /**
   * 把字段属性变更写回存储层 overlay：
   * - pick 项：写 item.over（deepMerge 语义，null=删除键）
   * - inline 项：直接 setPath/delPath 改 item
   * - use 项：新建 pick 项 {ref:"table.code", over:{key:value}} 承载 over
   * key 用规范 schema key（如 'caption.zh_CN' / 'edit.required' / 'display.decimalDigits'）。
   */
  _setOverlayProp (fsc, code, key, value) {
    const hit = this._findOverlayItem(fsc, code)
    if (!hit) return false
    if (hit.kind === 'pick') {
      if (!hit.item.over) hit.item.over = {}
      if (value == null || value === '' || (typeof value === 'boolean' && value === false)) {
        // 删除键：deepMerge 语义里 over[key]=null 表示删除
        this._delPath(hit.item.over, key)
      } else {
        this._setPath(hit.item.over, key, value)
      }
      return true
    }
    if (hit.kind === 'inline') {
      if (value == null || value === '' || (typeof value === 'boolean' && value === false)) {
        this._delPath(hit.item, key)
      } else {
        this._setPath(hit.item, key, value)
      }
      return true
    }
    if (hit.kind === 'use') {
      // use:'*' 模式下首次覆盖某列属性：新建一个 pick 项承载 over
      if (!Array.isArray(hit.owner.pick)) hit.owner.pick = []
      const over = {}
      this._setPath(over, key, value)
      hit.owner.pick.push({ ref: `${hit.table}.${hit.code}`, over })
      return true
    }
    return false
  }

  /** 点路径写值（setPath 简易实现：'a.b' → obj.a.b = v）。 */
  _setPath (obj, path, value) {
    const parts = String(path).split('.')
    let cur = obj
    for (let i = 0; i < parts.length - 1; i++) {
      const k = parts[i]
      if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {}
      cur = cur[k]
    }
    cur[parts[parts.length - 1]] = value
  }

  /** 点路径删值（'a.b' → delete obj.a.b；空对象清理可选）。 */
  _delPath (obj, path) {
    const parts = String(path).split('.')
    let cur = obj
    for (let i = 0; i < parts.length - 1; i++) {
      const k = parts[i]
      if (cur[k] == null || typeof cur[k] !== 'object') return
      cur = cur[k]
    }
    delete cur[parts[parts.length - 1]]
  }

  /** 点路径读值（'a.b' → obj.a.b）。 */
  _readPath (obj, path) {
    const parts = String(path).split('.')
    let cur = obj
    for (let i = 0; i < parts.length; i++) {
      if (cur == null || typeof cur !== 'object') return undefined
      cur = cur[parts[i]]
    }
    return cur
  }

  /** 统一字段适配器（CTX），桥接规范 schema key 到本端存储键（code / edit.mode / display / dict 等）。 */
  _fieldAdapter () {
    if (!this._flcAdapterInst) this._flcAdapterInst = makeFlcAdapter()
    return this._flcAdapterInst
  }

  /** schema 渲染器 ctx：引用字典(=维度)下拉 + 引用/显示字段(维度属性列)下拉。 */
  _fieldCtx (combination) {
    const dimCodes = Object.keys(combination?.dimensions || {})
    const attrsOf = (dimCode) => {
      const dim = combination?.dimensions?.[dimCode]
      const attrs = dim ? (Array.isArray(dim.attributes) ? dim.attributes : Object.keys(dim.attributes || {})) : []
      return ['', ...attrs]
    }
    return {
      end: 'FLC',
      dimensionCodes: dimCodes,
      attrOptions: (field, which) => attrsOf(which === 'defaultFrom' ? field?.defaultFrom?.dimension : field?.source?.dimension),
      // 引用字典(refDict) = 维度绑定 → 候选为 combination 维度编码
      refDictOptions: () => ['', ...dimCodes],
      // 引用字段/显示字段 = 所选维度在维度面板属性列上选定的列（dim.attributes）
      refFieldOptions: (field) => attrsOf(field?.refDict),
      // 录入控件下拉与数据字典/业务单据保持一致：使用 schema 默认 EDIT_MODE_OPTIONS
    }
  }

  _currentField (p) {
    const rule = this._currentRule(p)
    if (!rule) return null
    const fields = this._resolvedFields(this._activeFsc(rule))
    return fields.find((f) => fieldId(f) === this._selectedFieldCode) || null
  }

  _addValidation () {
    const p = normalizeCombination(this._combination || DEFAULT_COMBINATION)
    const field = this._currentField(p)
    if (!field) return
    field.validations = Array.isArray(field.validations) ? field.validations : []
    field.validations.push({ expr: '', message: '' })
    this._combination = p
    this._markDirty()
    this._render()
  }

  _removeValidation (index) {
    const p = normalizeCombination(this._combination || DEFAULT_COMBINATION)
    const field = this._currentField(p)
    if (!field || !Array.isArray(field.validations)) return
    if (!window.confirm('确定删除该校验规则？')) return
    field.validations.splice(index, 1)
    if (!field.validations.length) delete field.validations
    this._combination = p
    this._markDirty()
    this._render()
  }

  _addEnum () {
    const p = normalizeCombination(this._combination || DEFAULT_COMBINATION)
    const field = this._currentField(p)
    if (!field) return
    field.enumValues = Array.isArray(field.enumValues) ? field.enumValues : []
    field.enumValues.push({ value: '', label: '' })
    this._combination = p
    this._markDirty()
    this._render()
  }

  _removeEnum (index) {
    const p = normalizeCombination(this._combination || DEFAULT_COMBINATION)
    const field = this._currentField(p)
    if (!field || !Array.isArray(field.enumValues)) return
    if (!window.confirm('确定删除该枚举项？')) return
    field.enumValues.splice(index, 1)
    if (!field.enumValues.length) delete field.enumValues
    this._combination = p
    this._markDirty()
    this._render()
  }

  // ─── 分组 groups 嵌套编辑 ──────────────────────────────────────────────

  /** 按点路径（如 '0' / '0.members.1'）定位 groups 树节点（当前激活字段集）。 */
  _groupNodeAt (rule, path) {
    const owner = this._activeFsc(rule)?.groupsOwner
    if (!owner?.groups) return null
    const segs = String(path).split('.').filter(Boolean)
    let node = { members: owner.groups }
    for (const seg of segs) {
      if (seg === 'members') { node = { members: node.members }; continue }
      const idx = Number(seg)
      const arr = node.members || []
      node = arr[idx]
      if (node == null) return null
    }
    return node
  }

  _addGroup () {
    const p = normalizeCombination(this._combination || DEFAULT_COMBINATION)
    const rule = this._currentRule(p)
    if (!rule) return
    const owner = this._activeFsc(rule).groupsOwner
    owner.groups = Array.isArray(owner.groups) ? owner.groups : []
    owner.groups.push({ caption: '新分组', members: [] })
    this._groupsOpen = true
    this._combination = p
    this._markDirty()
    this._render()
  }

  _removeGroup (path) {
    const p = normalizeCombination(this._combination || DEFAULT_COMBINATION)
    const rule = this._currentRule(p)
    if (!rule) return
    const owner = this._activeFsc(rule).groupsOwner
    if (!owner?.groups) return
    if (!window.confirm('确定删除该分组？组内字段不会被删除，仅解除分组。')) return
    const segs = String(path).split('.').filter(Boolean)
    const idx = Number(segs.pop())
    const parent = segs.length ? this._groupNodeAt(rule, segs.join('.')) : { members: owner.groups }
    if (parent && Array.isArray(parent.members)) parent.members.splice(idx, 1)
    if (!owner.groups.length) delete owner.groups
    this._combination = p
    this._markDirty()
    this._render()
  }

  _addSubgroup (path) {
    const p = normalizeCombination(this._combination || DEFAULT_COMBINATION)
    const rule = this._currentRule(p)
    const node = this._groupNodeAt(rule, path)
    if (!node) return
    node.members = Array.isArray(node.members) ? node.members : []
    node.members.push({ caption: '子分组', members: [] })
    this._combination = p
    this._markDirty()
    this._render()
  }

  _groupAddField (path, code) {
    if (!code) return
    const p = normalizeCombination(this._combination || DEFAULT_COMBINATION)
    const rule = this._currentRule(p)
    const node = this._groupNodeAt(rule, path)
    if (!node) return
    node.members = Array.isArray(node.members) ? node.members : []
    // 同一字段不重复加入同一分组
    if (!node.members.includes(code)) node.members.push(code)
    this._combination = p
    this._markDirty()
    this._render()
  }

  _groupRemoveMember (path, member) {
    const p = normalizeCombination(this._combination || DEFAULT_COMBINATION)
    const rule = this._currentRule(p)
    const node = this._groupNodeAt(rule, path)
    if (!node || !Array.isArray(node.members)) return
    const idx = node.members.findIndex((m) => (typeof m === 'string' ? m : '') === member)
    if (idx === -1) return
    if (!window.confirm(`确定将字段「${member}」移出该分组？`)) return
    node.members.splice(idx, 1)
    this._combination = p
    this._markDirty()
    this._render()
  }

  _updateGroup (path, prop, rawValue, valueType) {
    const p = normalizeCombination(this._combination || DEFAULT_COMBINATION)
    const rule = this._currentRule(p)
    const node = this._groupNodeAt(rule, path)
    if (!node) return
    const value = coerceValue(rawValue, valueType)
    if (prop.startsWith('aggregate.')) {
      const aggKey = prop.slice('aggregate.'.length)
      node.aggregate = node.aggregate && typeof node.aggregate === 'object' ? node.aggregate : {}
      if (value === true) node.aggregate[aggKey] = true
      else delete node.aggregate[aggKey]
      if (!Object.keys(node.aggregate).length) delete node.aggregate
    } else if (value === '' || value == null) {
      delete node[prop]
    } else {
      node[prop] = value
    }
    this._combination = p
    this._markDirty()
  }

  // ─── 模型级属性 columnModel ────────────────────────────────────────────

  _updateColumnModel (scope, prop, value) {
    const p = normalizeCombination(this._combination || DEFAULT_COMBINATION)
    let target
    if (scope === 'combination') {
      target = p
    } else {
      const rule = this._currentRule(p)
      if (!rule) return
      target = this._activeFsc(rule).cmOwner
      if (!target) return
    }
    target.columnModel = target.columnModel && typeof target.columnModel === 'object' ? target.columnModel : {}
    if (value === '' || value == null) delete target.columnModel[prop]
    else target.columnModel[prop] = value
    if (!Object.keys(target.columnModel).length) delete target.columnModel
    this._combination = p
    this._markDirty()
  }
}

if (!customElements.get('portal-flexible-combination-manager')) {
  customElements.define('portal-flexible-combination-manager', PortalFlexibleCombinationManager)
}

function normalizeCombination (combination) {
  const p = combination && typeof combination === 'object' ? { ...combination } : { ...DEFAULT_COMBINATION }
  p.version = p.version ?? 1
  p.domain = p.domain || ''
  p.app = p.app || ''
  p.module = p.module || ''
  p.scenario = p.scenario || ''
  p.title = p.title || p.name || p.caption || ''
  p.description = p.description || ''
  p.status = p.status || 'draft'
  p.tags = Array.isArray(p.tags) ? p.tags : splitList(p.tags)
  p.anchorDimensions = Array.isArray(p.anchorDimensions) ? p.anchorDimensions : splitList(p.anchorDimensions)
  p.dimensions = p.dimensions && typeof p.dimensions === 'object' && !Array.isArray(p.dimensions) ? p.dimensions : {}
  p.rules = Array.isArray(p.rules) ? p.rules : []
  p.rules = p.rules.map((rule) => ({
    ...rule,
    id: rule.id || '',
    anchor: {
      dimensions: Array.isArray(rule.anchor?.dimensions) ? rule.anchor.dimensions : [...p.anchorDimensions],
      columns: Array.isArray(rule.anchor?.columns) ? rule.anchor.columns : [],
      match: rule.anchor?.match && typeof rule.anchor.match === 'object' ? rule.anchor.match : {},
    },
    detail: {
      ...(rule.detail || {}),
      fields: Array.isArray(rule.detail?.fields) ? rule.detail.fields : [],
    },
  }))
  return p
}

function splitList (value) {
  if (Array.isArray(value)) return value.map((x) => String(x).trim()).filter(Boolean)
  return String(value || '').split(',').map((x) => x.trim()).filter(Boolean)
}

/** 读取输入元素的有效原始值：checkbox 取 checked，其余取 value。 */
function inputRawValue (el) {
  if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) return el.checked
  return el.value
}

/** 把表单字符串值按声明类型转换：string|number|boolean|list。空串原样返回供调用方判定删除。 */
function coerceValue (raw, valueType) {
  if (valueType === 'number') {
    if (raw === '' || raw == null) return ''
    const n = Number(raw)
    return Number.isFinite(n) ? n : ''
  }
  if (valueType === 'boolean') return raw === true || raw === 'true' || raw === 'on'
  // boolean-visible：勾选=默认可见（返回''→删除 visible 键），取消勾选=显式 visible:false
  if (valueType === 'boolean-visible') {
    const checked = raw === true || raw === 'true' || raw === 'on'
    return checked ? '' : false
  }
  if (valueType === 'list') return splitList(raw)
  return raw
}

function safeCode (value) {
  return String(value || '').trim().replace(/[^\w-]/g, '_')
}

function uniqueCode (base, existing) {
  const taken = new Set((existing || []).filter(Boolean))
  let i = 1
  let code = base
  while (taken.has(code)) code = `${base}${++i}`
  return code
}

function replaceGroupMemberCode (groups, oldCode, nextCode) {
  if (!Array.isArray(groups) || !oldCode || !nextCode) return
  for (const group of groups) {
    if (!group || typeof group !== 'object' || !Array.isArray(group.members)) continue
    group.members = group.members.map((member) => {
      if (member === oldCode) return nextCode
      if (member && typeof member === 'object') replaceGroupMemberCode([member], oldCode, nextCode)
      return member
    })
  }
}

function selectHtml ({ attrs, value, options }) {
  return `<select ${attrs}>${options.map((opt) => {
    const v = String(opt)
    return `<option value="${escAttr(v)}" ${v === String(value || '') ? 'selected' : ''}>${escHtml(v || '-')}</option>`
  }).join('')}</select>`
}

registerWorkspaceViewType('flexible-combination-manager', (_region, spec) => {
  const data = spec?.data && typeof spec.data === 'object' ? spec.data : {}
  const attrs = Object.entries(data)
    .filter(([, v]) => v != null && typeof v !== 'object')
    .map(([k, v]) => ` data-${escAttr(k)}="${escAttr(v)}"`)
    .join('')
  return `<portal-flexible-combination-manager${attrs}></portal-flexible-combination-manager>`
})

/** 检查器/校验预览面板共享样式（取自主体右栏的 inspector 相关样式子集）。 */

/**
 * 检查器/校验预览面板的共同薄壳基类：自身不持业务状态，渲染与事件全部委托给
 * combinationBus.controller（主体 <portal-flexible-combination-manager>）。监听 bus 的
 * state/controller 事件自动重渲；controller 不在时显示占位提示。
 *
 * 子类实现：
 *   _renderInner()  返回正文 HTML（调用 controller 的对应 render* 方法）
 */

/**
 * <portal-flexible-combination-source> —— 源码视图（content 区第二个 view，与「设计」并列）。
 *
 * 默认用 CodeMirror 6（JSON 高亮/行号/折叠/括号匹配）；CodeMirror 动态加载失败
 * （缺包/网络）时降级为原生 textarea。两条路径都把编辑文本回写 controller.updateSourceText。
 *
 * 状态同步与焦点保护：controller 的 state 事件触发 _syncText —— 编辑器/文本框获焦编辑时
 * 不打断（不覆盖文档），失焦时把 controller 最新 JSON 刷入。
 */

function contextPlain (value) {
  return value == null ? value : deepClone(value)
}

function buildContextResolvedSchema (combination, docMeta) {
  const p = normalizeCombination(combination || DEFAULT_COMBINATION)
  const engine = new FlexibleCombinationEngine({
    dimensions: p.dimensions,
    rules: p.rules,
    // DRN 引用上下文：让字段 refDict 支持 @别名 / drn: 写法（裸 code 不受影响）
    from: { domain: p.domain, app: p.app || p.application, module: p.module },
    imports: Array.isArray(p.imports) ? p.imports : null,
  })
  const rules = (Array.isArray(p.rules) ? p.rules : []).map((rule) => {
    let fieldSets = []
    try {
      fieldSets = engine.buildAllFieldSets(rule, p).map((fs) => ({
        index: fs.index,
        table: fs.table || '',
        name: fs.name || '',
        columns: contextPlain(fs.columns || []),
        members: contextPlain(fs.members || []),
        columnModel: contextPlain(fs.columnModel || {}),
      }))
    } catch (err) {
      fieldSets = [{ error: err instanceof Error ? err.message : String(err) }]
    }
    return {
      id: rule.id || '',
      anchor: contextPlain(rule.anchor || {}),
      detail: contextPlain(rule.detail || {}),
      fieldSets,
    }
  })
  return {
    schemaKind: 'FLEXIBLE_COMBINATION',
    combination: p,
    docRef: p.docRef || null,
    docSchema: docMeta ? {
      docMeta: contextPlain(docMeta.docMeta || {}),
      voucherSchema: contextPlain(docMeta.voucherSchema || {}),
      voucherTables: contextPlain(docMeta.voucherTables || []),
    } : null,
    dimensions: contextPlain(p.dimensions || {}),
    rules,
  }
}

// 配套元素（Inspector/Verify/Source/Schema/List）已拆到 ./portal-flexible-combination-panels.js（副作用注册 + registerWorkspaceViewType）
import './portal-flexible-combination-panels.js'
import { deepClone } from 'cmx-data-comp/lib/cmx-deep-clone.js'
