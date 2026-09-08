/**
 * portal-definition-manager —— 定义中心（DCT 数据字典 / DOC 业务单据）设计期元数据编辑页。
 *
 * 一套通用框架，按 data-kind（DCT|DOC）渲染不同设计区；DCT 与 DOC 各注册一组 workspace view type：
 *   {dct|doc}-def-manager   content 设计区（controller 主体）
 *   {dct|doc}-def-source    content 源码视图（CodeMirror JSON）
 *   {dct|doc}-def-list      explorer 列表（按 kind 过滤的定义文件）
 *   {dct|doc}-def-inspector property 检查器（选中表的元信息 + 字段集引用）
 *
 * 跨区域通信：每个 kind 一个模块级单例 bus（EventTarget + 共享状态 + controller 指针）。
 * 照搬 portal-flexible-combination-manager 的 controller / 焦点保护 / 局部刷新模式。
 */
import { apiFetch } from 'cmx-ui5-runtime/api-client'
import { deepClone as clonePlain } from 'cmx-data-comp/lib/cmx-deep-clone.js'
import { registerWorkspaceViewType } from '../lib/workspace-view-renderer.js'
import '@ui5/webcomponents/dist/Input.js'
import { escAttr, escHtml } from '../lib/escape.js'
import { loadCodeMirrorJsonBundle, cmxJsonTheme, isDarkUi5Theme } from '../lib/codemirror-json.js'
import { getStoredPortalUi5Theme, portalThemeInfo } from '../lib/portal-ui5-theme.js'
import { buildHttpError, extractErrorDetails, showDefError, showDefWarn } from '../lib/notify.js'
import { admConfirm, ADM_ALL_CSS } from '../lib/admin-ui-kit.js'
import { busFor } from '../lib/definition-bus.js'
import {
  itemKey,
  isEditingEl,
  fetchDefinitionItemsForKind,
  syncDefNeoHost,
  defBaseNeoStyleBlock,
} from '../lib/definition-helpers.js'
import {
  itemApplication,
  defFileParts,
  defFileForVersion,
  defItemVersion,
  defItemIsDefault,
  groupDefItemsByStem,
} from '../lib/version-stem.js'
import {
  createFieldClipboardPayload,
  effectiveField,
  diffOverride,
  overrideForField,
  normalizeFieldOverrides,
  materializeTable,
  dematerializeTable,
  fieldCaption,
  fieldId,
  makeDctAdapter,
  readFieldClipboard,
  renderFieldPanel,
  renderFieldTable,
  writeFieldClipboard,
  showCmxMessage,
  newRelationDict,
  isRelationDict,
  applyRelationCompile,
  diagnoseRelation,
  migrateLegacyRelation,
  RELATION_SLOTS,
} from 'cmx-data-comp'

// 定义中心总线（DefinitionBus / busFor）已抽到 ../lib/definition-bus.js

/** 字段是否为主键（isPrimaryKey 存 1/0，兼容 true/"1"/legacy primaryKey）。 */
const isPrimaryKeyField = (f) => {
  const v = f?.isPrimaryKey ?? f?.primaryKey
  return v === 1 || v === true || v === '1'
}
/** 字典类型（dictMeta.dictKind）：5 类，供 content 区类型 tab、字典类型下拉、按类型新增共用。 */
const DICT_KINDS = [
  { value: 'BUSINESS', label: '业务字典' },
  { value: 'CLASSIFY', label: '分类字典' },
  { value: 'GROUP',    label: '分组字典' },
  { value: 'RELATION', label: '关系字典' },
  { value: 'ENUM',     label: '枚举字典' },
]
const DICT_KIND_DEFAULT = 'BUSINESS'
/** 归一字典条目的类型（缺省/未知值归到业务字典）。 */
const dictKindOf = (t) => {
  const k = String(t?.dictMeta?.dictKind || '').toUpperCase()
  return DICT_KINDS.some((d) => d.value === k) ? k : DICT_KIND_DEFAULT
}
/** dictKind → 中文标签。 */
const dictKindLabel = (kind) => (DICT_KINDS.find((d) => d.value === String(kind || '').toUpperCase()) || {}).label || '业务字典'
/** 字典标识取值：统一用 dictMeta.dictCode（业务字典编码，如 comp_unit）——
 *  dictCode 是字典的业务主键，贯穿 DCT 定义 / 后端 /api/dct/* / 字段 refDict。
 *  dictCode 缺失时回退 tableName（老数据兼容）。返回 null 表示无可用标识。 */
const _dictKeyOf = (t) => {
  if (!t) return null
  const meta = t.dictMeta || {}
  return meta.dictCode || meta.tableName || t.tableName || null
}
const portalNativeColorScheme = () => {
  const stored = portalThemeInfo(getStoredPortalUi5Theme())
  if (stored) return stored.dark ? 'dark' : 'light'
  return isDarkUi5Theme() ? 'dark' : 'light'
}

// ════════════════════════════════════════════════════════════════════════
//  主体（content 设计区，controller）
// ════════════════════════════════════════════════════════════════════════

export class PortalDefinitionManager extends HTMLElement {
  constructor () {
    super()
    this.attachShadow({ mode: 'open' })
    this._kind = 'DCT'
    this._bus = busFor('DCT')
    this._items = []
    this._selected = null
    this._doc = null            // 当前定义文件全文 JSON
    this._baseFieldSets = {}    // 引用的 base fieldSet 字段（{ name: fields[] }），只读展示用，不进 _doc
    this._dictCodes = []        // 可引用字典标识（统一用 dictCode 业务字典编码，与 refDict/后端接口对齐）
    this._dictFieldsMap = {}    // dictCode → 字段名数组（供 refField/displayField 下拉）
    this._dictKindMap = {}      // dictCode → 字典类型
    this._dictNameMap = {}      // dictCode → 字典名称
    this._dictRefMap = {}       // dictCode → 该字典定义中引用的其它字典 dictCode
    this._dictTableMap = {}     // dictCode → 数据字典定义表对象（只读展示）
    this._dictFieldSetMap = {}  // dictCode → 引用字段集名 → 字段数组（只读展示）
    this._groupOpen = {}        // 字段分组折叠状态（key→bool）
    this._utf8Encoder = new TextEncoder() // UTF-8 字节计量（自动索引名 63 字节上限等）
    this._selectedTable = ''    // 选中的字典表 / 单据层级(DOC) / 字段集(BASE) 标识
    this._selectedDictTab = DICT_KIND_DEFAULT // DCT：当前激活的字典类型 tab（业务/分类/分组/枚举）
    this._selectedDocTopTab = 'levels' // DOC：content 顶部区域 tab（层级/各类已引用字典）
    this._selectedDocDictCode = '' // DOC：顶部字典 tab 中选中的字典（只影响 property 区）
    this._docDictFieldSetDetail = null // DOC：property 区字段集详情弹窗
    this._selectedDocTable = '' // DOC：当前层级内选中的表（tab）
    this._selectedFieldIndex = -1 // 在 property 区详编的字段索引（-1=未选，显示表信息）
    this._selectedRef = null      // 引用字段详编：{ setName, fieldId, qualified } | null（与 _selectedFieldIndex 互斥）
    this._refWorking = null        // 引用字段的工作态"有效字段"（base ⊕ override 的可变克隆），编辑写它再 diff 回覆盖
    this._fieldsPanelTab = 'fields'
    this._fieldsJsonMessage = ''
    this._fieldsJsonCm = null
    this._fieldsJsonCmHost = null
    this._fieldsJsonCmLoading = false
    this._suppressContentSync = false
    this._split = { contentY: 34 }
    this._message = ''
    this._loading = false
    this._dirty = false
    this._versionDialog = null  // 新建版本弹窗：{ versionNo, versionName } | null
    this._versionManagerOpen = false  // 版本管理弹窗开关
    this._embed = false         // 嵌入模式：不接总线、自带「档案」下拉、由外部 DAM 过滤（集群数据源浏览等复用）
    this._readonly = false      // 只读模式：隐藏编辑按钮 + 拦截所有写入
    this._damFilter = { domain: '', app: '', module: '' } // 嵌入模式下的 DAM 过滤
    this._wired = false
    this._onClick = (e) => this._handleClick(e)
    this._onInput = (e) => this._handleInput(e)
    this._onChange = (e) => this._handleChange(e)
    this._onPointerDown = (e) => this._handleSplitPointerDown(e)
    this._onBusSelect = (e) => { void this._loadConfig(e.detail?.key || '') }
    this._onBusItems = (e) => { this._items = e.detail?.items || [] }
    this._onBusRefresh = () => { void this._loadList() }
    this._codeRules = []          // 编码引擎规则列表（ruleCode + ruleName），供规则码下拉选择
    this._indexTarget = 'main'    // 索引 tab 的目标表（'main' 或 DOC 汇总表 id；自持状态，不依赖 _fieldsPanelTab）
    this._indexDialog = null      // 索引列选择弹窗：{ type: 'unique'|'normal', i, columns: [] } | null；i = -1 新增模式（应用才落库）
    this._pendingIdRename = null  // 物理列名(id)改动待联动：{ fieldIndex, oldId }，change 时机 flush（避开 input 逐字符中间态）
  }

  connectedCallback () {
    this._kind = (this.getAttribute('data-kind') || 'DCT').toUpperCase()
    this._embed = this.hasAttribute('data-embed')
    this._readonly = this.hasAttribute('data-readonly')
    this._busScope = this.getAttribute('data-bus-scope') || ''
    syncDefNeoHost(this, this._kind)
    void this._loadCodeRules()
    // 嵌入模式用「页面作用域」总线（与真实功能页的全局单例隔离，但同页 content↔property 共享）。
    this._bus = busFor(this._kind, this._busScope)
    if (this._embed) {
      // 嵌入模式：自带「档案」下拉替代 explorer，按 DAM 过滤自拉列表；仍接总线以驱动同页 property 检查器。
      this._damFilter = {
        domain: this.getAttribute('data-filter-domain') || '',
        app: this.getAttribute('data-filter-app') || '',
        module: this.getAttribute('data-filter-module') || '',
      }
      this._render()
      this._wire()
      this._bus.addEventListener('select', this._onBusSelect)
      this._bus.addEventListener('items', this._onBusItems)
      this._bus.setController(this)
      void this._loadListEmbed()
      return
    }
    this._render()
    this._wire()
    this._bus.addEventListener('select', this._onBusSelect)
    this._bus.addEventListener('items', this._onBusItems)
    this._bus.addEventListener('refresh', this._onBusRefresh)
    this._bus.setController(this)
    if (this._bus.items.length) this._items = this._bus.items
    if (this._bus.items.length && this._bus.selectedKey) void this._loadConfig(this._bus.selectedKey)
    else void this._loadList()
  }

  disconnectedCallback () {
    const sr = this.shadowRoot
    this._destroyFieldsJsonEditor()
    sr.removeEventListener('click', this._onClick)
    sr.removeEventListener('input', this._onInput)
    sr.removeEventListener('change', this._onChange)
    sr.removeEventListener('pointerdown', this._onPointerDown)
    this._bus.removeEventListener('select', this._onBusSelect)
    this._bus.removeEventListener('items', this._onBusItems)
    if (!this._embed) this._bus.removeEventListener('refresh', this._onBusRefresh)
    this._bus.clearController(this)
    this._wired = false
  }

  _wire () {
    if (this._wired) return
    this._wired = true
    this.shadowRoot.addEventListener('click', this._onClick)
    this.shadowRoot.addEventListener('input', this._onInput)
    this.shadowRoot.addEventListener('change', this._onChange)
    this.shadowRoot.addEventListener('pointerdown', this._onPointerDown)
  }

  _handleSplitPointerDown (e) {
    const bar = e.target instanceof Element ? e.target.closest('[data-def-split]') : null
    if (!(bar instanceof HTMLElement)) return
    const key = bar.dataset.defSplit
    const container = bar.parentElement
    if (key !== 'contentY' || !container) return
    e.preventDefault()
    const topPanel = bar.previousElementSibling
    const bottomPanel = bar.nextElementSibling
    if (!(topPanel instanceof HTMLElement) || !(bottomPanel instanceof HTMLElement)) return
    const startY = e.clientY
    const topStart = topPanel.getBoundingClientRect().height
    const total = Math.max(1, topStart + bottomPanel.getBoundingClientRect().height + bar.getBoundingClientRect().height)
    bar.setPointerCapture?.(e.pointerId)
    bar.classList.add('is-dragging')
    const move = (ev) => {
      const raw = ((topStart + (ev.clientY - startY)) / total) * 100
      const value = Math.max(22, Math.min(72, raw))
      this._split.contentY = value
      container.style.setProperty('--def-content-top', `${value}%`)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      bar.classList.remove('is-dragging')
      bar.releasePointerCapture?.(e.pointerId)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up, { once: true })
  }

  // ─── 数据加载 ────────────────────────────────────────────────────────────

  async _loadList () {
    this._loading = true; this._message = ''; this._render()
    try {
      this._items = await this._bus.loadItems(() => fetchDefinitionItemsForKind(this._kind))
      // 初次自动选中：取第一个逻辑定义的默认版本（而非任意文件），与资源管理器代表项一致。
      if (!this._doc && !this._bus.selectedKey && this._items.length) {
        const first = groupDefItemsByStem(this._items)[0]
        this._bus.select(itemKey(first ? first.default : this._items[0]))
      }
    } catch (err) { this._message = '加载列表失败'; showDefError('加载列表失败', err) }
    finally { this._loading = false; this._render() }
  }

  // ─── 嵌入模式（只读复用：集群数据源浏览等） ────────────────────────────────
  /** 供外部设置 DAM 过滤（不触发总线，仅本实例）。 */
  setDamFilter (domain, app, module) {
    this._damFilter = { domain: domain || '', app: app || '', module: module || '' }
    // 当前选中项已不在过滤范围内 → 清空，改选第一个匹配项。
    void this._loadListEmbed(true)
  }

  /** 嵌入模式：自拉列表（含版本聚合字段），按 DAM 过滤后默认选中第一个逻辑定义的默认版本。 */
  async _loadListEmbed (keepIfPossible = false) {
    this._loading = true; this._render()
    try {
      this._items = await fetchDefinitionItemsForKind(this._kind)
      const filtered = this._embedFilteredItems()
      const stillValid = keepIfPossible && this._selected && filtered.some((x) => itemKey(x) === itemKey(this._selected))
      if (!stillValid) {
        const groups = groupDefItemsByStem(filtered)
        if (groups.length) await this._loadConfig(itemKey(groups[0].default), false)
        else { this._selected = null; this._doc = null }
      }
    } catch (err) { this._message = '加载列表失败'; showDefError('加载列表失败', err) }
    finally { this._loading = false; this._render() }
  }

  /** 嵌入模式下按 DAM 过滤后的列表项。 */
  _embedFilteredItems () {
    const f = this._damFilter || {}
    return (this._items || []).filter((it) =>
      (!f.domain || it.domain === f.domain) &&
      (!f.app || itemApplication(it) === f.app) &&
      (!f.module || it.module === f.module))
  }

  async _loadConfig (key, rerender = true) {
    if (!key) return
    const pool = this._items.length ? this._items : this._bus.items
    let item = pool.find((x) => itemKey(x) === key)
    if (!item) {
      // 兜底：从 key（domain/application/module/file）解析，避免列表未同步时无法加载
      const parts = String(key).split('/')
      if (parts.length === 4) item = { domain: parts[0], application: parts[1], app: parts[1], module: parts[2], file: parts[3] }
      else return
    }
    this._selected = item; this._message = ''
    try {
      const params = new URLSearchParams({ domain: item.domain, application: item.application || item.app, module: item.module, file: item.file })
      const res = await fetch(`/api/definitions/config?${params.toString()}`)
      const data = await res.json().catch(() => null)
      if (!res.ok) throw buildHttpError('装载失败', res, data)
      this._doc = this._normalizeLoadedDoc(data)
      this._selectedTable = this._tableList(data)[0]?.key || ''
      this._selectedFieldIndex = -1
      this._pkUkRef = null
      this._clearRefDetail()
      this._dirty = false
      await this._loadBaseFieldSets(data)
      // base 字段集就绪后反向物化：把带 _materializedFrom 标记的内联字段还原为 fieldOverrides 覆盖态
      this._doc = this._dematerializeLoadedDoc(this._doc)
      await this._loadDictCodes()
    } catch (err) {
      this._message = '装载失败'
      showDefError('装载定义失败', err, { details: extractErrorDetails(err), helpCode: err?.code || 'DEF_LOAD_FAILED' })
    }
    if (rerender) this._render()
  }

  /**
   * 装载后归一：把半成品关系字典（旧 fieldRefDicts）就地升级为 dictMeta.relation（幂等）。
   * 只改内存工作态、不置脏；用户打开→保存即完成设计文档 §6 的一键迁移。非 DCT 或无关系字典时原样返回。
   */
  _normalizeLoadedDoc (doc) {
    if (!doc || typeof doc !== 'object' || this._kind !== 'DCT') return doc
    const key = 'dictionaryTables'
    const tables = Array.isArray(doc[key]) ? doc[key] : null
    if (!tables) return doc
    let changed = false
    const next = tables.map((t) => {
      if (!isRelationDict(t)) return t
      const migrated = migrateLegacyRelation(t)
      if (migrated !== t) changed = true
      return migrated
    })
    return changed ? { ...doc, [key]: next } : doc
  }

  /**
   * 装载后逆物化：base 字段集就绪后，把各表 fields 里带 _materializedFrom 标记的物化字段还原为
   * fieldOverrides 覆盖态（dematerializeTable）。保存时物化的引用字段重新打开后仍以「引用字段 + 覆盖」
   * 形态编辑，不再退化为本表内联字段。只改内存工作态、不置脏；无标记字段恒等返回。
   */
  _dematerializeLoadedDoc (doc) {
    if (!doc || typeof doc !== 'object' || (this._kind !== 'DCT' && this._kind !== 'DOC')) return doc
    const key = this._tablesKey()
    const tables = Array.isArray(doc[key]) ? doc[key] : null
    if (!tables) return doc
    const resolveSetFields = (name) => this._resolveSetFields(name)
    const listSetNames = (table) => this._tableSetNames(table)
    let changed = false
    const next = tables.map((t) => {
      const out = dematerializeTable(t, resolveSetFields, listSetNames)
      if (out !== t) changed = true
      return out
    })
    return changed ? { ...doc, [key]: next } : doc
  }

  /** 缓存各 fieldSet 的字段（只读展示用）。业务文件拉 base 文件；BASE 文件用自身 fieldSets。 */
  async _loadBaseFieldSets (doc) {
    this._baseFieldSets = {}
    if (this._isBase()) {
      const fs = doc?.fieldSets && typeof doc.fieldSets === 'object' ? doc.fieldSets : {}
      const out = {}
      for (const [name, def] of Object.entries(fs)) out[name] = Array.isArray(def?.fields) ? def.fields : []
      this._baseFieldSets = out
      return
    }
    const ref = doc?.[this._kind === 'DOC' ? 'baseDocMetaRef' : 'baseDctMetaRef']
    // 文件未声明 baseXxxMetaRef（如新建文件）→ 回退到该类默认 base 文件
    const file = ref?.file || (this._kind === 'DOC' ? 'base_doc_meta_v1.json' : 'base_dct_meta_v1.json')
    try {
      const params = new URLSearchParams({ domain: 'base', file })
      const base = await apiFetch(`/api/definitions/config?${params.toString()}`)
      if (!base?.fieldSets) return
      const out = {}
      for (const [name, fs] of Object.entries(base.fieldSets)) {
        out[name] = Array.isArray(fs?.fields) ? fs.fields : []
      }
      this._baseFieldSets = out
    } catch { /* 拉不到 base 就只显示本表字段，不报错 */ }
  }

  /**
   * 选中表的字段分组：引用的 base fieldSet 各一组（只读，在上，按引用顺序）+ 本表定义一组（可编辑，在下）。
   * @returns {{key:string, label:string, editable:boolean, fields:object[]}[]}
   */
  _fieldGroups (entry) {
    if (!entry) return []
    const t = entry.table
    const groups = []
    // BASE：选中的 fieldSet 本身。composite(includeFieldSets) → 只读引用各组；否则本字段集可编辑一组。
    if (this._isBase()) {
      if (Array.isArray(t.includeFieldSets)) {
        for (const name of t.includeFieldSets) {
          groups.push({ key: `fs:${name}`, label: name, editable: false, fields: this._baseFieldSets[name] || [], ref: { type: 'include', name } })
        }
        return groups
      }
      groups.push({ key: 'own', label: '字段集字段', editable: true, fields: Array.isArray(t.fields) ? t.fields : [] })
      return groups
    }
    // 引用字段集（顺序优先级高，置于上部）
    if (this._kind === 'DOC') {
      for (const name of (Array.isArray(t.documentFieldSets) ? t.documentFieldSets : [])) {
        groups.push({ key: `fs:${name}`, label: name, editable: false, fields: this._baseFieldSets[name] || [], ref: { type: 'doc', name } })
      }
    } else {
      // DCT：table 上以 *FieldSet 结尾的键，值=base fieldSet 名
      for (const [k, v] of Object.entries(t)) {
        if (k.endsWith('FieldSet') && typeof v === 'string') {
          groups.push({ key: `fs:${k}`, label: `${v}`, editable: false, fields: this._baseFieldSets[v] || [], ref: { type: 'dctKey', key: k } })
        }
      }
      // DCT 额外引用模板（extraFieldSets 数组，由"引用模板列"添加）
      for (const name of (Array.isArray(t.extraFieldSets) ? t.extraFieldSets : [])) {
        groups.push({ key: `extra:${name}`, label: name, editable: false, fields: this._baseFieldSets[name] || [], ref: { type: 'dctExtra', name } })
      }
    }
    // 本表定义字段（可编辑，置于下部）
    groups.push({ key: 'own', label: '本表定义字段', editable: true, fields: Array.isArray(t.fields) ? t.fields : [] })
    return groups
  }

  /**
   * 分组排序：返回 _fieldGroups 的结果，但按 table.fieldSetOrder 重排（设计期「分组排序」产出）。
   * - 有 fieldSetOrder：'own' 对应本表组，其余对应引用字段集名（g.ref.name / g.label）；按清单序，
   *   清单外的组按默认相对序补尾（不丢组）。悬空项忽略。
   * - 无 fieldSetOrder：原样返回 _fieldGroups（引用组在前、本表组在后），向后兼容。
   * 供渲染层使用；_fieldGroups 本身保持默认顺序，供统计/其它逻辑零影响。
   */
  _orderedGroups (entry) {
    const groups = this._fieldGroups(entry)
    const t = entry?.table
    const order = Array.isArray(t?.fieldSetOrder) ? t.fieldSetOrder : null
    if (!order || !order.length) return groups
    // 组的逻辑名：own→'own'；引用组→字段集名（优先 ref.name，回退 label）。
    const segOf = (g) => g.editable ? 'own' : (g.ref?.name || g.label || '')
    const bySeg = new Map()
    for (const g of groups) {
      const seg = segOf(g)
      if (seg && !bySeg.has(seg)) bySeg.set(seg, g)
    }
    const out = []
    const used = new Set()
    for (const raw of order) {
      const seg = String(raw ?? '').trim()
      if (seg && bySeg.has(seg) && !used.has(seg)) { out.push(bySeg.get(seg)); used.add(seg) }
    }
    if (!out.length) return groups
    for (const g of groups) {
      const seg = segOf(g)
      if (!used.has(seg)) { out.push(g); used.add(seg) }
    }
    return out
  }

  /**
   * 把当前分组顺序写回 table.fieldSetOrder（用于分组上下移后持久化）。
   * seg 取值：'own' 或引用字段集名。
   */
  _writeFieldSetOrder (entry, segs) {
    const t = entry?.table
    if (!t) return
    t.fieldSetOrder = segs.map((s) => String(s ?? '').trim()).filter(Boolean)
    this._markDirty()
  }

  /**
   * 引用字段集增删后同步 table.fieldSetOrder：仅当 fieldSetOrder 已存在时生效。
   * - 已删除的引用组：从清单剔除；
   * - 新增的引用组：按 _orderedGroups 默认相对序补尾；
   * - 悬空项（指向已删除组的 id）剔除——与字段级 fieldOrder 不同，分组级不留悬空
   *   （分组增删是显式操作，留悬空无意义）。
   * 未启用排序（无 fieldSetOrder）的表不主动生成，零回归。
   */
  _reconcileFieldSetOrder (entry) {
    const t = entry?.table
    if (!t || !Array.isArray(t.fieldSetOrder) || !t.fieldSetOrder.length) return
    const groups = this._fieldGroups(entry)
    const segOf = (g) => g.editable ? 'own' : (g.ref?.name || g.label || '')
    const have = new Set(groups.map(segOf).filter(Boolean))
    // 先剔除清单里已不存在的段，再补上漏掉的新段。
    const next = t.fieldSetOrder.filter((s) => have.has(String(s)))
    const used = new Set(next.map(String))
    for (const g of groups) {
      const seg = segOf(g)
      if (seg && !used.has(seg)) { next.push(seg); used.add(seg) }
    }
    if (JSON.stringify(next) !== JSON.stringify(t.fieldSetOrder)) {
      t.fieldSetOrder = next
      this._markDirty()
    }
  }

  /**
   * 分组排序：把 groupKey 对应的组在分组顺序里移动 dir 步（-1 上移 / +1 下移）。
   * 按 _orderedGroups 的当前视觉顺序交换相邻组，再把完整顺序写回 table.fieldSetOrder。
   */
  _moveGroup (groupKey, dir) {
    const entry = this._currentTable()
    if (!entry) return
    const groups = this._orderedGroups(entry)
    const segOf = (g) => g.editable ? 'own' : (g.ref?.name || g.label || '')
    const i = groups.findIndex((g) => g.key === groupKey)
    const j = i + dir
    if (i < 0 || j < 0 || j >= groups.length) return
    ;[groups[i], groups[j]] = [groups[j], groups[i]]
    this._writeFieldSetOrder(entry, groups.map(segOf))
    this._render()
  }

  // ─── 引用字段的字段级覆盖（fieldOverrides / 存时物化） ──────────────────────────
  // 引用来的 base fieldSet 字段现在可像自有字段一样详细设置：编辑写入 table.fieldOverrides
  // 的增量 delta（不复制整字段、不改 base）；保存时由 materializeTable 物化进 fields 并删覆盖键。

  /** 表引用的 fieldSet 名（有序），DCT 命名键 + extraFieldSets / DOC documentFieldSets。 */
  _tableSetNames (table) {
    if (!table) return []
    if (this._kind === 'DOC') return Array.isArray(table.documentFieldSets) ? table.documentFieldSets : []
    const out = []
    for (const [k, v] of Object.entries(table)) if (k.endsWith('FieldSet') && typeof v === 'string') out.push(v)
    for (const n of (Array.isArray(table.extraFieldSets) ? table.extraFieldSets : [])) out.push(n)
    return out
  }

  /** 取某 fieldSet 的 base 字段数组（只读共享，来自 _baseFieldSets）。 */
  _resolveSetFields (name) { return this._baseFieldSets[name] || [] }

  /** 某引用字段的"有效字段"= base ⊕ 当前表覆盖（供只读组行改为可覆盖编辑时显示有效值）。 */
  _effectiveRefField (table, baseField, fieldSetName) {
    const overrides = normalizeFieldOverrides(table?.fieldOverrides, table?.fieldRefDicts)
    const ov = overrideForField(overrides, fieldId(baseField), fieldSetName)
    return effectiveField(baseField, ov)
  }

  /** 写引用字段的覆盖：把编辑后的整字段与 base 求 delta，存入 table.fieldOverrides[key]（限定键消歧）。 */
  _writeFieldOverride (table, baseField, fieldSetName, editedField, qualified) {
    const fid = fieldId(baseField)
    if (!fid) return
    const delta = diffOverride(baseField, editedField)
    const key = qualified ? `${fieldSetName}.${fid}` : fid
    if (!table.fieldOverrides || typeof table.fieldOverrides !== 'object') table.fieldOverrides = {}
    if (delta) table.fieldOverrides[key] = delta
    else { delete table.fieldOverrides[key]; if (!Object.keys(table.fieldOverrides).length) delete table.fieldOverrides }
  }


  /** 当前表已引用的模板（base fieldSet 名）集合，用于去重。 */
  _referencedTemplates (entry) {
    const t = entry?.table || {}
    const set = new Set()
    if (this._kind === 'DOC') {
      for (const n of (Array.isArray(t.documentFieldSets) ? t.documentFieldSets : [])) set.add(n)
    } else if (!this._isBase()) {
      for (const [k, v] of Object.entries(t)) { if (k.endsWith('FieldSet') && typeof v === 'string') set.add(v) }
      for (const n of (Array.isArray(t.extraFieldSets) ? t.extraFieldSets : [])) set.add(n)
    }
    return set
  }

  /** 可引用的模板（base fieldSet 名，去掉已引用的）。 */
  _availableTemplates (entry) {
    const refed = this._referencedTemplates(entry)
    return Object.keys(this._baseFieldSets || {}).filter((n) => !refed.has(n))
  }

  /** 表的字段总数（本表定义字段 + 所有引用字段集字段）。 */
  _totalFieldCount (entry) {
    if (!entry) return 0
    return this._fieldGroups(entry).reduce((sum, g) => sum + (Array.isArray(g.fields) ? g.fields.length : 0), 0)
  }

  /** 加载可引用的字典编码：DCT 用本文件字典；DOC 扫描所有 DCT 定义文件的字典。 */
  async _loadDictCodes () {
    this._dictFieldsMap = {}
    this._dictKindMap = {}
    this._dictNameMap = {}
    this._dictRefMap = {}
    this._dictTableMap = {}
    this._dictFieldSetMap = {}
    if (this._kind === 'DCT') {
      this._dictCodes = (this._doc?.dictionaryTables || []).map(_dictKeyOf).filter(Boolean)
      // 本文件各字典的字段（本表字段 + 引用的 base fieldSet 字段），供 refField/displayField 下拉
      for (const t of (this._doc?.dictionaryTables || [])) {
        const key = _dictKeyOf(t)
        if (key) {
          this._dictFieldsMap[key] = this._dictTableFieldNames(t, this._baseFieldSets)
          this._dictKindMap[key] = dictKindOf(t)
          this._dictNameMap[key] = t.dictMeta?.dictName || key
          this._dictRefMap[key] = this._dictTableReferencedCodes(t, this._baseFieldSets)
          this._dictTableMap[key] = clonePlain(t)
          this._dictFieldSetMap[key] = this._dictTableFieldSetMap(t, this._baseFieldSets)
        }
      }
      return
    }
    if (this._kind !== 'DOC') { this._dictCodes = []; return }
    try {
      // 字典池按当前单据所属的 domain/app/module 过滤：单据只引用同应用同模块的数据字典，
      // 避免把同 domain 下其他系统(SAP/EBS/用友/金蝶…)的 DCT 全合并去重，导致字典数虚高且同名字典互相覆盖。
      const listParams = new URLSearchParams({ kind: 'DCT' })
      if (this._selected?.domain) listParams.set('domain', this._selected.domain)
      if (this._selected?.app) listParams.set('application', this._selected.app)
      else if (this._selected?.application) listParams.set('application', this._selected.application)
      if (this._selected?.module) listParams.set('module', this._selected.module)
      const data = await apiFetch(`/api/definitions/list?${listParams.toString()}`)
      const allFiles = Array.isArray(data?.items) ? data.items : []
      // 同一 domain/app/module 可能有多个 DCT 版本（v1/v2/v3…），只加载标记为默认的那份；
      // 没有标记默认时，回退取版本号最大的。避免多版本合并导致同名字典互相覆盖。
      const files = this._pickDefaultDefinitions(allFiles)
      const codes = new Set()
      const baseCache = {} // base 文件名 → fieldSet 字段映射，避免重复拉取
      for (const it of files) {
        try {
          const params = new URLSearchParams({ domain: it.domain, application: it.application || it.app, module: it.module, file: it.file })
          const doc = await apiFetch(`/api/definitions/config?${params.toString()}`)
          const baseFile = doc?.baseDctMetaRef?.file || 'base_dct_meta_v1.json'
          let baseFS = baseCache[baseFile]
          if (!baseFS) { baseFS = await this._fetchBaseFieldSets(baseFile); baseCache[baseFile] = baseFS }
          for (const t of (doc.dictionaryTables || [])) {
            const c = _dictKeyOf(t)
            if (!c) continue
            codes.add(c)
            this._dictFieldsMap[c] = this._dictTableFieldNames(t, baseFS)
            this._dictKindMap[c] = dictKindOf(t)
            this._dictNameMap[c] = t.dictMeta?.dictName || c
            this._dictRefMap[c] = this._dictTableReferencedCodes(t, baseFS)
            this._dictTableMap[c] = clonePlain(t)
            this._dictFieldSetMap[c] = this._dictTableFieldSetMap(t, baseFS)
          }
        } catch { /* 跳过坏文件 */ }
      }
      this._dictCodes = [...codes].sort()
    } catch { this._dictCodes = [] }
  }

  /** 从定义文件清单里，按 (domain/app/module) 分组，每组只保留一份默认定义。
   *  选取规则：优先 isDefault=true 的；都没有标记则取 version 最大；version 也相同则保留清单原顺序首个。
   *  这样每个模块只加载一个 DCT/DOC 文件，避免多版本（v1/v2/v3）合并导致同名字典互相覆盖。 */
  _pickDefaultDefinitions (files) {
    if (!Array.isArray(files) || !files.length) return []
    const groups = new Map()   // key "domain/app/module" → { defaults: [], others: [] }
    for (const f of files) {
      const key = `${f.domain || ''}/${f.application || f.app || ''}/${f.module || ''}`
      if (!groups.has(key)) groups.set(key, { defaults: [], others: [] })
      const g = groups.get(key)
      if (f.isDefault === true) g.defaults.push(f)
      else g.others.push(f)
    }
    const pick = (arr) => {
      if (!arr.length) return null
      // version 最大优先；无 version 字段时取首项
      return arr.slice().sort((a, b) => (Number(b.version) || 0) - (Number(a.version) || 0))[0]
    }
    const out = []
    for (const g of groups.values()) {
      const chosen = pick(g.defaults) || pick(g.others)
      if (chosen) out.push(chosen)
    }
    return out
  }

  /** 拉取某 base 文件的 fieldSet → 字段数组映射（{name: fields[]}）。 */
  async _fetchBaseFieldSets (file) {
    try {
      const params = new URLSearchParams({ domain: 'base', file })
      const base = await apiFetch(`/api/definitions/config?${params.toString()}`)
      if (!base?.fieldSets) return {}
      const out = {}
      for (const [name, fs] of Object.entries(base.fieldSets)) out[name] = Array.isArray(fs?.fields) ? fs.fields : []
      return out
    } catch { return {} }
  }

  /** 某字典表的全部字段名：本表字段 + 引用的 base fieldSet 字段（按引用顺序，引用在前）。 */
  _dictTableFieldNames (t, baseFS) {
    const names = []
    const add = (field) => {
      const n = fieldId(field)
      if (n && !names.includes(n)) names.push(n)
    }
    baseFS = baseFS || {}
    for (const [k, v] of Object.entries(t)) {
      if (k.endsWith('FieldSet') && typeof v === 'string') {
        for (const f of (baseFS[v] || [])) add(f)
      }
    }
    for (const name of (Array.isArray(t?.extraFieldSets) ? t.extraFieldSets : [])) {
      for (const f of (baseFS[name] || [])) add(f)
    }
    for (const f of (Array.isArray(t?.fields) ? t.fields : [])) add(f)
    return names
  }

  /**
   * 加载编码引擎规则列表（GET /api/code/rules），缓存到 this._codeRules。
   * 供「编码规则」编辑器的「规则码」下拉选择——用户无需手敲字符串，直接选已配好的规则。
   * 接口不可用（后端未部署编码引擎 / 未配规则）时静默回退为空列表，不阻塞编辑。
   */
  async _loadCodeRules () {
    try {
      const rulesRoot = await apiFetch('/api/code/rules')
      const list = Array.isArray(rulesRoot?.rules) ? rulesRoot.rules : []
      this._codeRules = list.map((r) => ({
        ruleCode: r.ruleCode || r.rule_code || '',
        ruleName: r.ruleName || r.rule_name || r.ruleCode || r.rule_code || '',
      })).filter((r) => r.ruleCode)
      this._render()
    } catch { this._codeRules = [] }
  }

  /** 某字典定义自身引用到的其它字典 dictCode，用于 DOC 顶部字典 tab 按相关字典扩展展示。
   *  字段 refDict 存的就是 dictCode（业务编码），与字典池键一致，直接收集。 */
  _dictTableReferencedCodes (t, baseFS) {
    const out = []
    const add = (code) => {
      const raw = String(code || '').trim()
      if (raw && !out.includes(raw)) out.push(raw)
    }
    const overrides = (t?.fieldRefDicts && typeof t.fieldRefDicts === 'object') ? t.fieldRefDicts : {}
    Object.values(overrides).forEach(add)
    baseFS = baseFS || {}
    for (const [k, v] of Object.entries(t || {})) {
      if (k.endsWith('FieldSet') && typeof v === 'string') {
        for (const f of (baseFS[v] || [])) add(overrides[fieldId(f)] || f.refDict)
      }
    }
    for (const name of (Array.isArray(t?.extraFieldSets) ? t.extraFieldSets : [])) {
      for (const f of (baseFS[name] || [])) add(overrides[fieldId(f)] || f.refDict)
    }
    for (const f of (t?.fields || [])) add(f.refDict)
    return out
  }

  _dictTableFieldSetMap (t, baseFS) {
    const out = {}
    baseFS = baseFS || {}
    for (const [k, v] of Object.entries(t || {})) {
      if (k.endsWith('FieldSet') && typeof v === 'string') out[v] = clonePlain(baseFS[v] || [])
    }
    for (const name of (Array.isArray(t?.extraFieldSets) ? t.extraFieldSets : [])) out[name] = clonePlain(baseFS[name] || [])
    return out
  }

  /** refDict 指向字典的字段名列表（供 refField/displayField 下拉）。
   *  入参 refDict 是 dictCode（与字典池键一致），直接命中 _dictFieldsMap。 */
  _refDictFieldOptions (refDict) {
    const key = String(refDict || '').trim()
    const fields = (key && this._dictFieldsMap?.[key]) || []
    return ['', ...fields]
  }

  /** refDict 下拉选项（统一用 dictCode）：DCT 排除当前字典自身；DOC 用全部字典。 */
  _refDictOptions (entry) {
    if (this._kind === 'DCT') {
      const self = _dictKeyOf(entry?.table) || entry?.key
      return ['', ...this._dictCodes.filter((c) => c !== self)]
    }
    return ['', ...this._dictCodes]
  }

  /** DOC：当前单据直接/通过 base 字段集引用到的字典 dictCode（保持单据字段出现顺序）。
   *  字段 refDict 存的就是 dictCode（业务编码），与字典池键一致，直接收集。 */
  _docReferencedDictCodes () {
    if (this._kind !== 'DOC') return []
    const out = []
    const add = (code) => {
      const raw = String(code || '').trim()
      if (raw && !out.includes(raw)) out.push(raw)
    }
    const tables = Array.isArray(this._doc?.voucherTables) ? this._doc.voucherTables : []
    for (const t of tables) {
      const overrides = (t.fieldRefDicts && typeof t.fieldRefDicts === 'object') ? t.fieldRefDicts : {}
      Object.values(overrides).forEach(add)
      for (const fsName of (Array.isArray(t.documentFieldSets) ? t.documentFieldSets : [])) {
        for (const f of (this._baseFieldSets?.[fsName] || [])) add(overrides[fieldId(f)] || f.refDict)
      }
      for (const f of (Array.isArray(t.fields) ? t.fields : [])) add(f.refDict)
    }
    return out
  }

  _docReferencedDictEntries (kind) {
    const k = String(kind || '').toUpperCase()
    return this._docRelatedDictCodes()
      .filter((code) => (this._dictKindMap?.[code] || DICT_KIND_DEFAULT) === k)
      .map((code) => ({ code, name: this._dictNameMap?.[code] || code, kind: this._dictKindMap?.[code] || DICT_KIND_DEFAULT }))
  }

  _docRelatedDictCodes () {
    const related = new Set(this._docReferencedDictCodes())
    let changed = true
    while (changed) {
      changed = false
      for (const code of Object.keys(this._dictRefMap || {})) {
        const refs = this._dictRefMap[code] || []
        const include = related.has(code) || refs.some((ref) => related.has(ref))
        if (!include) continue
        if (!related.has(code)) { related.add(code); changed = true }
        for (const ref of refs) {
          if (!related.has(ref)) { related.add(ref); changed = true }
        }
      }
    }
    return this._dictCodes.filter((code) => related.has(code))
  }

  /**
   * 数据类型 → 长度/整数位/小数位 可编辑能力。
   *   VARCHAR：仅长度（字符长度）；INT/BIGINT/TINYINT：固定位数，不需要调整；
   *   DECIMAL：整数位+小数位（长度由两者推导，不需要）；TEXT/DATE/DATETIME/BOOLEAN：均不需要。
   */
  _typeCaps (dataType) {
    switch (String(dataType || '').toUpperCase()) {
      case 'VARCHAR': return { len: true, int: false, dec: false }
      case 'INT': case 'BIGINT': case 'TINYINT': return { len: false, int: false, dec: false }
      case 'DECIMAL': return { len: false, int: true, dec: true }
      default: return { len: false, int: false, dec: false } // TEXT/DATE/DATETIME/BOOLEAN 等
    }
  }

  /** 统一字段适配器（DCT/DOC），桥接规范 schema key ↔ 本端存储键。 */
  _fieldAdapter () {
    if (!this._dctAdapterInst) this._dctAdapterInst = makeDctAdapter({ typeCaps: (f) => this._typeCaps(f.dataType) })
    return this._dctAdapterInst
  }

  /** schema 渲染器 ctx：提供动态下拉 option provider + 类型联动能力。 */
  _fieldCtx (entry) {
    return {
      typeCaps: (f) => this._typeCaps(f.dataType),
      hasDimType: this._hasDimType ? this._hasDimType() : (this._kind === 'DOC' || this._kind === 'BASE-DOC'),
      isBase: this._isBase(),
      refDictOptions: () => this._refDictOptions(entry),
      refFieldOptions: (field) => this._refDictFieldOptions(field?.refDict),
      // 兜底：DCT/DOC 无维度面板，source.*/defaultFrom.* 虽 FLC 独有（appliesTo 不含 DCT/DOC），
      // 但防御性提供空实现，避免任何边界调用 ctx.attrOptions/dimensionCodes 时崩。
      dimensionCodes: [],
      attrOptions: () => [''],
    }
  }


  /** 引用一个模板字段集（去重检查）。 */
  _addTemplateRef (name) {
    if (!name) return
    const entry = this._currentTable()
    if (!entry) return
    const t = entry.table
    if (this._referencedTemplates(entry).has(name)) { this._message = `模板「${name}」已引用，勿重复添加`; this._render(); return }
    if (this._kind === 'DOC') {
      t.documentFieldSets = Array.isArray(t.documentFieldSets) ? t.documentFieldSets : []
      t.documentFieldSets.push(name)
    } else {
      t.extraFieldSets = Array.isArray(t.extraFieldSets) ? t.extraFieldSets : []
      t.extraFieldSets.push(name)
    }
    this._reconcileFieldSetOrder(entry) // 已启用分组排序时，把新引用组补进 fieldSetOrder
    this._message = `已引用模板：${name}`
    this._markDirty(); this._render()
  }

  /** 删除一个引用字段集组（带确认）。按 ref 描述符从对应存储解除引用。 */
  async _removeRef (groupKey) {
    const entry = this._currentTable()
    if (!entry) return
    const g = this._fieldGroups(entry).find((x) => x.key === groupKey)
    if (!g || !g.ref) return
    if (!(await admConfirm({ title: '删除引用', message: `确定删除引用「${g.label}」？仅解除引用，不影响 base 模板本身。`, danger: true }))) return
    const t = entry.table
    const ref = g.ref
    if (ref.type === 'doc') {
      t.documentFieldSets = (t.documentFieldSets || []).filter((n) => n !== ref.name)
      if (!t.documentFieldSets.length) delete t.documentFieldSets
    } else if (ref.type === 'dctExtra') {
      t.extraFieldSets = (t.extraFieldSets || []).filter((n) => n !== ref.name)
      if (!t.extraFieldSets.length) delete t.extraFieldSets
    } else if (ref.type === 'dctKey') {
      delete t[ref.key]
    } else if (ref.type === 'include') {
      t.includeFieldSets = (t.includeFieldSets || []).filter((n) => n !== ref.name)
    }
    this._reconcileFieldSetOrder(entry) // 已启用分组排序时，从 fieldSetOrder 剔除已删引用组
    this._message = `已删除引用：${g.label}`
    this._markDirty(); this._render()
  }

  _isGroupOpen (entry, g) {
    const id = `${this._selectedTable}::${g.key}`
    // 默认：本表定义组展开，引用组收起
    return id in this._groupOpen ? this._groupOpen[id] : g.editable
  }

  async _save () {
    if (!this._selected) { showDefWarn('无法保存', '尚未选择定义文件，请先在左侧列表中打开一个定义文件。'); return }
    // 关系字典保存期校验：错误拦截保存，警告仅提示（设计文档 §5/§9-2）。
    const relDiag = this._collectRelationDiagnostics()
    if (relDiag.errors.length) {
      showDefError('关系字典校验未通过', '请修正以下关系绑定问题后再保存：', { details: relDiag.errors.map((e) => `• ${e.message}`), helpCode: 'RELATION_INVALID' })
      return
    }
    // 物理列名改名联动 flush（防止改完列名直接点保存跳过 change）+ 索引校验：
    // 悬空列引用/重复列序列阻断；冗余与未物化勾选仅提示（对齐关系字典校验范式）。
    this._flushIdRename()
    const idxDiag = this._validateIndexes()
    if (idxDiag.errors.length) {
      showDefError('索引校验未通过', '请修正以下唯一键/索引问题后再保存：', { details: idxDiag.errors.map((e) => `• [${e.table}] ${e.message}`), helpCode: 'INDEX_INVALID' })
      return
    }
    try {
      const params = new URLSearchParams({ domain: this._selected.domain, application: this._selected.application || this._selected.app, module: this._selected.module, file: this._selected.file })
      // 存时物化：把各表的 fieldOverrides（引用字段覆盖）落成完整内联字段，删覆盖键。
      // 磁盘上不留 overlay（消费方拿到完整字段，无需展开）；编辑器内部才临时展开。
      const payload = this._materializeDocForSave(this._doc || {})
      const res = await fetch(`/api/definitions/config?${params.toString()}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw buildHttpError('保存失败', res, data)
      this._doc = data.saved; this._dirty = false; this._message = '已保存'
      await this._loadList()
    } catch (err) {
      // 保存失败是用户最在意的报错 → 专业错误对话框（可复制、带明细、可跳帮助中心），不再只丢一句底部灰字。
      showDefError('保存失败', err, { details: extractErrorDetails(err), helpCode: err?.code || 'DEF_SAVE_FAILED' })
    }
  }

  /** 保存前物化：对 DCT/DOC 各表把 fieldOverrides/fieldRefDicts 物化进 fields（存物化决策）。 */
  _materializeDocForSave (doc) {
    if (!doc || typeof doc !== 'object') return doc
    const key = this._tablesKey()
    const tables = Array.isArray(doc[key]) ? doc[key] : null
    if (!tables) return doc
    const resolveSetFields = (name) => this._resolveSetFields(name)
    const listSetNames = (table) => this._tableSetNames(table)
    const materialized = tables.map((t) => {
      // 关系字典：先把 dictMeta.relation 编译为两个 dimension 槽的 fieldOverrides（用正确槽位键），
      // 再走通用物化--从根上避免 OVERRIDE_FIELD_NOT_FOUND（设计文档 G1）。
      const compiled = isRelationDict(t) ? applyRelationCompile(t) : t
      return materializeTable(compiled, resolveSetFields, listSetNames)
    })
    this._injectDictCoord(materialized)
    return { ...doc, [key]: materialized }
  }

  /** 给 dict-select 录入控件字段注入字典坐标 coord（domain/app/module[/file]）。
   *  运行时 cmx-dict-select 的兜底数据源打 /api/dct/data/search 需要这组坐标定位字典定义；
   *  运行时 host 无坐标，唯一来源是设计期固化进 field.editSettings.coord。
   *  - 仅 DOC（运行时填单据才需要拉字典数据；DCT 自身编辑不需要）；
   *  - dictCode 统一取 field.refDict（录入控件「字典选择」与「引用字典」合一，用户只选一次）；
   *  - coord 的 domain/app/module 取当前 DOC 定义自身的坐标（用户无需手填，保存时自动注入）；
   *    file 不写——由后端 /api/dct/data/search 按 dictCode 自动解析定位 DCT 文件。 */
  _injectDictCoord (tables) {
    if (this._kind !== 'DOC' || !this._selected) return
    const sel = this._selected
    const base = {
      domain: sel.domain,
      application: sel.application || sel.app || '',
      module: sel.module || '',
    }
    if (!base.domain || !base.application || !base.module) return
    for (const t of (tables || [])) {
      for (const f of (t.fields || [])) {
        // 仅处理「字典选择」录入控件（cmx-dict-select）。
        const mode = f.edit?.mode || f.editMode || ''
        if (mode !== 'cmx-dict-select') continue
        // dictCode 统一来自 refDict（兼容历史 editSettings.dictCode）；无 refDict 则跳过。
        const dc = f.refDict || f.editSettings?.dictCode
        if (!dc) continue
        f.editSettings = f.editSettings || {}
        f.editSettings.coord = { ...base }
      }
    }
  }

  /**
   * 汇总当前文件所有关系字典的诊断（保存期校验用）。
   * 主/辅字典存在性用本文件已知字典编码判定；槽位归属用 base 字段集判定。
   * @returns {{errors:object[], warnings:object[]}}
   */
  _collectRelationDiagnostics () {
    const errors = []; const warnings = []
    const key = this._tablesKey()
    const tables = Array.isArray(this._doc?.[key]) ? this._doc[key] : []
    const known = new Set(this._dictCodes || [])
    const resolveDict = (code) => known.has(code)
    const resolveSetFields = (name) => this._resolveSetFields(name)
    const listSetNames = (table) => this._tableSetNames(table)
    for (const t of tables) {
      if (!isRelationDict(t)) continue
      const r = diagnoseRelation(t, { resolveDict, resolveSetFields, listSetNames })
      errors.push(...r.errors); warnings.push(...r.warnings)
    }
    return { errors, warnings }
  }

  // ─── 多版本 ────────────────────────────────────────────────────────────────

  /** 当前选中定义的同 stem 兄弟版本项（按版本号升序；兜底确保当前文件在内）。 */
  _currentVersionItems () {
    if (!this._selected) return []
    const sel = this._selected
    const app = sel.application || sel.app
    const stem = defFileParts(sel.file).stem
    const matched = (this._items || []).filter((it) =>
      it.domain === sel.domain && itemApplication(it) === app && it.module === sel.module && defFileParts(it.file).stem === stem)
    if (!matched.some((it) => it.file === sel.file)) {
      matched.push({
        domain: sel.domain, application: app, app, module: sel.module, file: sel.file,
        version: this._mm?.version ?? defFileParts(sel.file).version ?? 1,
        versionName: this._mm?.versionName || '',
      })
    }
    return matched.sort((a, b) => defItemVersion(a) - defItemVersion(b))
  }

  /** content 标题区版本下拉（右侧，带「版本：」label + 默认★标记）+ 版本管理 + 新建按钮。 */
  _renderVersionControl () {
    if (this._isBase() || !this._doc || !this._selected) return ''
    const versions = this._currentVersionItems()
    const curFile = this._selected.file
    const opts = versions.map((v) => {
      const n = defItemVersion(v)
      const nm = (v.file === curFile ? (this._mm?.versionName || v.versionName) : v.versionName) || ''
      const star = defItemIsDefault(v) ? '★ ' : ''
      const label = `${star}v${n}${nm ? `·${nm}` : ''}`
      return `<option value="${escAttr(v.file)}" ${v.file === curFile ? 'selected' : ''}>${escHtml(label)}</option>`
    }).join('')
    const editBtns = (this._embed || this._readonly) ? '' : `<button class="icon-btn" data-action="open-version-manager" title="版本管理"><ui5-icon name="settings"></ui5-icon></button>
      <button class="icon-btn" data-action="open-version-dialog" title="新建版本"><ui5-icon name="add"></ui5-icon></button>`
    return `<div class="ver-control" title="版本">
      <span class="ver-label">版本：</span>
      <select class="ver-select" data-ver-select aria-label="选择版本">${opts}</select>
      ${editBtns}
    </div>`
  }

  /** 嵌入模式的「档案」下拉：按 DAM 过滤后一逻辑定义一项（选默认版本）。 */
  _renderEmbedDocSelect () {
    const groups = groupDefItemsByStem(this._embedFilteredItems())
    const curStem = this._selected ? defFileParts(this._selected.file).stem : ''
    const curKey = this._selected ? `${this._selected.domain}/${this._selected.application || this._selected.app}/${this._selected.module}/${curStem}` : ''
    const opts = groups.map((g) => `<option value="${escAttr(g.key)}" ${g.key === curKey ? 'selected' : ''}>${escHtml((g.default?.title || g.stem))}（${escHtml(g.domain)}/${escHtml(g.module)}）</option>`).join('')
    return `<select class="ver-select embed-doc-select" data-embed-doc aria-label="选择档案">
      <option value="">${groups.length ? '选择档案' : '当前范围无定义'}</option>${opts}
    </select>`
  }

  /** 切换到同定义的另一版本（未保存修改时确认丢弃，沿用 _addFile/_removeFile 的确认惯例）。 */
  async _switchVersion (file) {
    if (!file || !this._selected || file === this._selected.file) return
    const sel = this._selected
    if (this._embed) { void this._loadConfig(`${sel.domain}/${sel.application || sel.app}/${sel.module}/${file}`); return }
    if (this._dirty && !(await admConfirm({ title: '切换版本', message: '当前修改未保存，切换版本将丢失这些修改。是否继续？' }))) {
      this._render() // 还原下拉为当前版本
      return
    }
    this._bus.select(`${sel.domain}/${sel.application || sel.app}/${sel.module}/${file}`)
  }

  /** 嵌入模式：切换逻辑定义（选中组的默认版本）。 */
  _switchEmbedDoc (stemKey) {
    if (!stemKey) return
    const g = groupDefItemsByStem(this._embedFilteredItems()).find((x) => x.key === stemKey)
    if (g && g.default) void this._loadConfig(itemKey(g.default))
  }

  /** 打开「新建版本」弹窗：默认版本号=现有最大版本号+1。 */
  _openVersionDialog () {
    if (this._isBase() || !this._doc || !this._selected) { showDefWarn('无法新建版本', '请先打开一个定义文件，再新建版本。'); return }
    const maxNo = this._currentVersionItems().reduce((m, v) => Math.max(m, defItemVersion(v)), 0)
    this._versionDialog = { versionNo: String(maxNo + 1), versionName: '', setDefault: false }
    this._versionManagerOpen = false
    this._render()
  }

  /** 「新建版本」弹窗（覆盖层，复用 fieldset-dialog 样式）。 */
  _renderVersionDialog () {
    const d = this._versionDialog
    if (!d) return ''
    const stem = defFileParts(this._selected?.file || '').stem
    const fileName = defFileForVersion(stem, Number(d.versionNo) || '')
    return `<div class="fieldset-dialog-backdrop">
      <section class="fieldset-dialog ver-dialog">
        <div class="fieldset-dialog-head">
          <h3>新建版本</h3>
          <button class="link-back" data-action="close-version-dialog" title="取消">取消</button>
        </div>
        <div class="ver-form">
          <label>版本号</label><input data-ver-field="versionNo" type="number" min="1" step="1" value="${escAttr(d.versionNo)}">
          <label>版本名称</label><input data-ver-field="versionName" value="${escAttr(d.versionName)}" placeholder="如：2024 年度版">
        </div>
        <label class="ver-check"><input type="checkbox" data-ver-field="setDefault" ${d.setDefault ? 'checked' : ''}>创建后设为默认版本</label>
        <div class="ver-file-hint">将基于当前内容创建文件：<code>${escHtml(fileName)}</code></div>
        <div class="ver-dialog-foot">
          <button class="ver-create-btn" data-action="create-version"><ui5-icon name="add"></ui5-icon>创建版本</button>
        </div>
      </section>
    </div>`
  }

  /** 以当前文档为蓝本克隆出新版本文件（写 versionNo/versionName，保存为 *_v<N>.json）。 */
  async _createVersion () {
    const d = this._versionDialog
    if (!d || !this._doc || !this._selected) return
    const verNo = Math.floor(Number(d.versionNo))
    if (!Number.isFinite(verNo) || verNo < 1) { showDefWarn('版本号无效', '请输入有效的版本号（正整数）。'); return }
    const sel = this._selected
    const app = sel.application || sel.app
    const stem = defFileParts(sel.file).stem
    const file = defFileForVersion(stem, verNo)
    if ((this._items || []).some((it) => it.domain === sel.domain && itemApplication(it) === app && it.module === sel.module && it.file === file)) {
      showDefWarn('版本号已存在', `版本号 ${verNo} 已存在（${file}），请换一个版本号。`); return
    }
    const doc = clonePlain(this._doc) || {}
    const mk = this._metaKey
    const mm = (doc[mk] && typeof doc[mk] === 'object') ? doc[mk] : (doc[mk] = {})
    mm.version = verNo
    mm.versionName = d.versionName || ''
    delete mm.isDefault // 新版本默认非默认，避免与现有默认冲突（如需默认走下方 set-default）
    try {
      const params = new URLSearchParams({ domain: sel.domain, application: app, module: sel.module, file })
      const res = await fetch(`/api/definitions/config?${params.toString()}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(doc),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw buildHttpError('创建版本失败', res, data)
      if (d.setDefault) await this._postSetDefault(file)
      this._versionDialog = null
      this._dirty = false
      await this._loadList()
      this._bus.select(`${sel.domain}/${app}/${sel.module}/${file}`)
    } catch (err) { showDefError('创建版本失败', err, { helpCode: err?.code || 'DEF_VERSION_CREATE_FAILED' }) }
  }

  // ─── 版本管理弹窗 ──────────────────────────────────────────────────────────

  _openVersionManager () {
    if (this._isBase() || !this._doc || !this._selected) { showDefWarn('无法打开版本管理', '请先打开一个定义文件，再管理版本。'); return }
    this._versionManagerOpen = true
    this._versionDialog = null
    this._render()
  }

  /** 版本管理弹窗：列出所有版本（号/名/更新时间/默认），可设默认、删除。 */
  _renderVersionManager () {
    if (!this._versionManagerOpen) return ''
    const versions = this._currentVersionItems()
    const curFile = this._selected?.file
    const rows = versions.map((v) => {
      const n = defItemVersion(v)
      const nm = (v.file === curFile ? (this._mm?.versionName || v.versionName) : v.versionName) || ''
      const isDef = defItemIsDefault(v)
      const isCur = v.file === curFile
      const updated = v.updatedAt ? String(v.updatedAt).replace('T', ' ').slice(0, 19) : '—'
      return `<tr class="${isCur ? 'is-current' : ''}">
        <td class="vm-no">v${n}${isCur ? '<span class="vm-cur-tag">当前</span>' : ''}</td>
        <td class="vm-name">${nm ? escHtml(nm) : '<span class="vm-muted">（未命名）</span>'}</td>
        <td class="vm-time">${escHtml(updated)}</td>
        <td class="vm-default">${isDef
          ? '<cmx-status-tag tone="success" variant="subtle" size="sm">★ 默认</cmx-status-tag>'
          : `<button class="vm-link" data-action="set-default-version" data-file="${escAttr(v.file)}">设为默认</button>`}</td>
        <td class="vm-ops">
          ${isCur ? '' : `<button class="vm-link" data-action="vm-switch-version" data-file="${escAttr(v.file)}" title="打开此版本">打开</button>`}
          <button class="vm-link danger" data-action="delete-version" data-file="${escAttr(v.file)}" ${versions.length <= 1 ? 'disabled title="至少保留一个版本"' : 'title="删除此版本"'}>删除</button>
        </td>
      </tr>`
    }).join('')
    return `<div class="fieldset-dialog-backdrop">
      <section class="fieldset-dialog vm-dialog">
        <div class="fieldset-dialog-head">
          <h3>版本管理 · ${escHtml(this._mm?.metaName || this._selected?.title || '')}</h3>
          <button class="link-back" data-action="close-version-manager" title="关闭">关闭</button>
        </div>
        <table class="vm-table">
          <thead><tr><th>版本号</th><th>版本名称</th><th>更新时间</th><th>默认</th><th>操作</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="vm-foot">
          <span class="vm-hint">默认版本在资源管理器中作为该定义的首选打开版本。</span>
          <button class="ver-create-btn" data-action="open-version-dialog"><ui5-icon name="add"></ui5-icon>新建版本</button>
        </div>
      </section>
    </div>`
  }

  /** POST /api/definitions/default：把某文件设为默认（同 stem 互斥，后端原子处理）。 */
  async _postSetDefault (file) {
    const sel = this._selected
    const app = sel.application || sel.app
    const params = new URLSearchParams({ domain: sel.domain, application: app, module: sel.module, file })
    const data = await apiFetch(`/api/definitions/default?${params.toString()}`, { method: 'POST' })
    return data
  }

  /** 设为默认版本（版本管理弹窗内）。若改的是当前打开版本，同步刷新 _doc.isDefault。 */
  async _setDefaultVersion (file) {
    if (!file || !this._selected) return
    try {
      await this._postSetDefault(file)
      await this._loadList()
      // 当前打开的就是被设默认的版本 → 直接更新内存标记，避免丢弃未保存的 _doc。
      if (file === this._selected.file && this._mm) this._doc[this._metaKey].isDefault = true
      else if (this._mm) this._doc[this._metaKey].isDefault = (file === this._selected.file)
      this._render()
    } catch (err) { showDefError('设置默认版本失败', err, { helpCode: err?.code || 'DEF_SET_DEFAULT_FAILED' }) }
  }

  /** 删除某版本（保护：至少留一个；删默认/当前后自动改选其它版本）。 */
  async _deleteVersion (file) {
    if (!file || !this._selected) return
    const sel = this._selected
    const app = sel.application || sel.app
    const versions = this._currentVersionItems()
    if (versions.length <= 1) { showDefWarn('无法删除版本', '至少保留一个版本，不能删除最后一个版本。'); return }
    const victim = versions.find((v) => v.file === file)
    const n = victim ? defItemVersion(victim) : defFileParts(file).version
    if (!(await admConfirm({ title: '删除版本', message: `确定删除版本 v${n}（${file}）？此操作不可恢复。`, danger: true }))) return
    try {
      const params = new URLSearchParams({ domain: sel.domain, application: app, module: sel.module, file })
      const res = await fetch(`/api/definitions/config?${params.toString()}`, { method: 'DELETE' })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw buildHttpError('删除版本失败', res, data)
      const remaining = versions.filter((v) => v.file !== file)
      const wasDefault = victim ? defItemIsDefault(victim) : false
      // 删了默认版本 → 把剩余最新版设为默认，维持「有且仅一个默认」。
      if (wasDefault && remaining.length) {
        try { await this._postSetDefault(remaining[remaining.length - 1].file) } catch { /* 容错：默认重置失败不阻断删除 */ }
      }
      await this._loadList()
      if (file === sel.file) {
        // 删的是当前版本 → 切到剩余默认/最新版。
        const next = remaining.find(defItemIsDefault) || remaining[remaining.length - 1]
        this._dirty = false
        this._bus.select(`${sel.domain}/${app}/${sel.module}/${next.file}`)
      } else {
        this._render()
      }
    } catch (err) { showDefError('删除版本失败', err, { helpCode: err?.code || 'DEF_VERSION_DELETE_FAILED' }) }
  }


  async _importJson () {
    if (typeof document === 'undefined') return
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json,.json'
    input.addEventListener('change', async () => {
      const file = input.files?.[0]
      if (!file) return
      try {
        const text = await file.text()
        const doc = JSON.parse(text || '{}')
        this._doc = doc
        this._selectedTable = this._tableList(doc)[0]?.key || ''
        this._selectedDocTable = ''
        this._selectedFieldIndex = -1
        this._clearRefDetail()
        this._docDictFieldSetDetail = null
        this._dirty = true
        this._message = `已导入 ${file.name}，保存后写回服务器`
        await this._loadBaseFieldSets(doc)
        await this._loadDictCodes()
        this._render()
      } catch (err) {
        this._message = '导入失败'
        showDefError('导入失败', err, { helpCode: 'DEF_IMPORT_FAILED' })
        this._render()
      }
    }, { once: true })
    input.click()
  }

  _exportJson () {
    if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof Blob === 'undefined') return
    const text = this.getSourceText()
    const file = this._selected?.file || `${String(this._kind || 'definition').toLowerCase()}_definition.json`
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = file.endsWith('.json') ? file : `${file}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  /**
   * 从 inspector 的「维护该字典数据」按钮跳转到通用字典数据维护 native 页。
   * 用 inline 菜单节点 + props.dictCode 打开新 Tab（同 dictCode 复用 Tab）。
   * 入口 B：定义中心 → 选中某字典 → inspector → 维护数据。
   */
  _openDictDataPage ({ dictCode, domain, application, module }) {
    if (!dictCode || !domain || !application || !module) return
    const app = document.querySelector('cmx-portal-app')
    if (!app || typeof app.openNode !== 'function') return
    app.openNode({
      id: `dct-data-${domain}-${application}-${module}-${dictCode}`,
      caption: `字典数据 · ${dictCode}`,
      icon: 'database',
      workspace: {
        content: {
          caption: `字典数据 · ${dictCode}`, icon: 'database',
          views: [{
            tabLabel: '字典数据', icon: 'database',
            type: 'native_pages',
            native_page: 'portal.model.dct.data-editor',
            view: 'content',
            props: { domain, application, module, dictCode },
          }],
        },
      },
    })
  }

  _markDirty () {
    this._dirty = true
    this._syncToolbar()
    if (!this._suppressContentSync && !isEditingEl(this.shadowRoot)) {
      this._bus.emitDirty()
      this._syncFieldsTable()
    }
  }

  /** 删除前的非空保护提示：警告级对话框（无 window/组件时回退底部消息）。 */
  _alertBlocked (msg) {
    showDefWarn('无法删除', msg)
  }

  _syncToolbar () {
    const t = this.shadowRoot.querySelector('.main .title')
    if (t) t.textContent = `${this._mm?.metaName || this._selected?.title || '未选择'}${this._dirty ? ' *' : ''}`
  }

  // ─── 表/字段集清单（DCT: dictionaryTables；DOC: voucherTables；BASE: fieldSets） ──

  _isBase () { return this._kind === 'BASE-DCT' || this._kind === 'BASE-DOC' }

  /** 当前定义的业务元信息节点键：DOC/DCT/BASE 三类统一为 moduleMeta。 */
  get _metaKey () { return 'moduleMeta' }
  /** 当前定义的业务元信息节点对象（读写入口，自动按 kind 选键）。 */
  get _mm () { return this._doc?.[this._metaKey] }

  /** 字段 schema 端：字典族(DCT/BASE-DCT)→'DCT'，单据族(DOC/BASE-DOC)→'DOC'。
   *  注意 _kind 含 BASE- 前缀，不能直接 ==='DCT' 判断，否则 BASE-DCT 会误落到 DOC 端。 */
  _schemaEnd () { return /DOC/.test(this._kind) ? 'DOC' : 'DCT' }

  /** 是否含"维度类型"列（DOC 单据字段 + BASE-DOC 基础字段集字段有 dimType）。 */
  _hasDimType () { return this._kind === 'DOC' || this._kind === 'BASE-DOC' }

  /** 列表/标题用的中文 kind 名。 */
  _kindLabel () { return ({ DOC: '单据', BASE: '基础字段集', 'BASE-DCT': '字典基础', 'BASE-DOC': '单据基础' })[this._kind] || '字典' }

  _tablesKey () { return this._kind === 'DOC' ? 'voucherTables' : 'dictionaryTables' }

  /** 左侧清单：DCT=字典表；BASE=字段集；DOC=层级（每层可含多张表）。 */
  _tableList (doc) {
    const d = doc || this._doc || {}
    if (this._isBase()) {
      const fs = d.fieldSets && typeof d.fieldSets === 'object' ? d.fieldSets : {}
      return Object.entries(fs).map(([name, def], i) => ({ key: name, label: name, table: def, index: i, composite: Array.isArray(def?.includeFieldSets) }))
    }
    if (this._kind === 'DOC') {
      // 层级清单：优先按 voucherSchema.schema 的层序，否则按 voucherTables 出现顺序去重
      const levels = this._docLevels(d)
      return levels.map((lv, i) => {
        const lt = this._docLevelTables(lv, d)
        const nm = this._docLevelName(lv, d)
        return { key: lv, label: nm ? `${lv} ${nm}` : lv, level: lv, index: i, tableCount: lt.length, tables: lt.map((x) => ({ alias: x.table.tableAlias || '', name: x.table.tableName || x.key })) }
      })
    }
    const arr = Array.isArray(d[this._tablesKey()]) ? d[this._tablesKey()] : []
    // DCT 选中态用稳定 _uid（不随 dictCode 改动而失联）；_uid 是仅运行期内存标识，不进存储/序列化。
    return arr.map((t, i) => ({ key: this._ensureDictUid(t, i), label: t.dictMeta?.dictName || t.dictMeta?.dictCode || `表${i + 1}`, table: t, index: i }))
  }

  /** 为字典条目分配/读取稳定运行期标识 _uid（content 区选中用，不序列化）。 */
  _ensureDictUid (t, i) {
    if (!t || typeof t !== 'object') return `t${i}`
    if (!t._uid) {
      this._uidSeq = (this._uidSeq || 0) + 1
      Object.defineProperty(t, '_uid', { value: `dct_${this._uidSeq}`, enumerable: false, writable: true, configurable: true })
    }
    return t._uid
  }

  /** DOC：有序层级列表（L1/L2/L3…）。 */
  _docLevels (doc) {
    const d = doc || this._doc || {}
    const schema = d.voucherSchema?.schema
    if (Array.isArray(schema) && schema.length && Array.isArray(schema[0])) {
      // 新结构：schema 为层数组，每层为表节点数组
      const out = []
      schema.forEach((levelNodes, idx) => {
        const lv = (levelNodes[0] && levelNodes[0].level) || `L${idx + 1}`
        if (!out.includes(lv)) out.push(lv)
      })
      return out
    }
    // 回退：从 voucherTables 去重 level（保持出现顺序）
    const tables = Array.isArray(d.voucherTables) ? d.voucherTables : []
    const out = []
    for (const t of tables) { const lv = t.level || 'L1'; if (!out.includes(lv)) out.push(lv) }
    return out
  }

  /** DOC：层级名称（取 schema 节点 levelName），无则空。 */
  _docLevelName (level, doc) {
    const d = doc || this._doc || {}
    const schema = d.voucherSchema?.schema
    if (Array.isArray(schema)) {
      for (const levelNodes of schema) {
        if (Array.isArray(levelNodes)) {
          const node = levelNodes.find((n) => (n.level || '') === level)
          if (node && node.levelName) return node.levelName
        }
      }
    }
    return ''
  }

  /** DOC：某层级的所有表（来自 voucherTables，按 level 过滤）。 */
  _docLevelTables (level, doc) {
    const d = doc || this._doc || {}
    const tables = Array.isArray(d.voucherTables) ? d.voucherTables : []
    return tables.map((t, gi) => ({ t, gi })).filter((x) => (x.t.level || 'L1') === level)
      .map(({ t, gi }) => ({ key: t.tableName || `t${gi}`, label: t.tableAlias || t.tableName || `表`, table: t, gIndex: gi }))
  }

  /** DOC：当前层级的上一层级（按 schema/表定义出现顺序）。 */
  _docPreviousLevel (level, doc) {
    const levels = this._docLevels(doc)
    const idx = levels.indexOf(level)
    if (idx > 0) return levels[idx - 1]
    const m = String(level || '').match(/^L(\d+)$/i)
    if (m && Number(m[1]) > 1) {
      const prev = `L${Number(m[1]) - 1}`
      if (this._docLevelTables(prev, doc).length) return prev
    }
    return ''
  }

  /** DOC：当前层级可选择的父表候选，来自上一层级所有表。 */
  _docParentTableOptions (level, doc) {
    const prevLevel = this._docPreviousLevel(level, doc)
    if (!prevLevel) return []
    return this._docLevelTables(prevLevel, doc)
      .map((x) => {
        const id = x.table.tableName || x.key || ''
        return id ? { value: id, label: x.table.tableAlias || id, level: prevLevel } : null
      })
      .filter(Boolean)
  }

  /** DOC：若上一层级仅一张表，则为本层未指定父表的表补默认 parentTable。 */
  _ensureDefaultParentTables (level) {
    const opts = this._docParentTableOptions(level)
    if (opts.length !== 1) return
    let changed = false
    for (const x of this._docLevelTables(level)) {
      if (x.table && !x.table.parentTable) {
        x.table.parentTable = opts[0].value
        changed = true
      }
    }
    if (changed) {
      const prevSuppress = this._suppressContentSync
      this._suppressContentSync = true
      try { this._markDirty() } finally { this._suppressContentSync = prevSuppress }
    }
  }

  _renderDocParentTableEditor (x, level) {
    const opts = this._docParentTableOptions(level)
    if (!opts.length) return ''
    const value = x.table.parentTable || (opts.length === 1 ? opts[0].value : '')
    const disabled = opts.length === 1 ? ' disabled' : ''
    const placeholder = opts.length === 1 ? '' : '<option value="">请选择父表</option>'
    const optionsHtml = opts.map((o) => {
      const label = o.label && o.label !== o.value ? `${o.label}（${o.value}）` : o.value
      return `<option value="${escAttr(o.value)}" ${value === o.value ? 'selected' : ''}>${escHtml(label)}</option>`
    }).join('')
    return `<div class="lt-row"><label>父表</label><select data-vt-index="${x.gIndex}" data-vt-prop="parentTable"${disabled}>${placeholder}${optionsHtml}</select></div>`
  }

  /**
   * 生成「规则码」下拉的 <option> HTML。
   * @param {string} cur 当前已选规则码（回显选中态；若不在列表中则单独补一条）
   */
  _codeRuleOptions (cur) {
    const rules = Array.isArray(this._codeRules) ? this._codeRules : []
    let opts = ''
    if (!rules.length) {
      // 后端未部署编码引擎或尚未配置规则：给一条占位提示 + 当前值（若有）
      opts = `<option value="">— 暂无规则，请先在「规则管理」配置 —</option>`
    } else {
      opts = `<option value="">— 请选择规则 —</option>`
    }
    for (const r of rules) {
      const label = r.ruleName && r.ruleName !== r.ruleCode ? `${r.ruleName}（${r.ruleCode}）` : r.ruleCode
      opts += `<option value="${escAttr(r.ruleCode)}" ${r.ruleCode === cur ? 'selected' : ''}>${escHtml(label)}</option>`
    }
    // 当前值不在列表中（旧数据 / 规则已删）→ 追加显示，避免值丢失
    if (cur && !rules.some((r) => r.ruleCode === cur)) {
      opts += `<option value="${escAttr(cur)}" selected>${escHtml(cur)}（已失效）</option>`
    }
    return opts
  }

  /** DOC：本层表的 codeRule 编辑器。每行严格一个 label + 一个控件，与"表名""ID"行同款。 */
  _renderDocCodeRuleEditor (x) {
    const raw = x.table.codeRule
    const cr = (typeof raw === 'object' && raw) ? raw : { mode: 'manual', field: 'doc_no' }
    const mode = cr.mode || 'manual'
    const codeField = escAttr(cr.field || 'doc_no')

    // 容器：与 DCT 侧同款 flex column；_handleInput 用 .cmx-coderule-edit 收集值
    let rows = `<div class="cmx-coderule-edit" data-vt-index="${x.gIndex}" data-cur-mode="${mode}" style="display:flex;flex-direction:column;gap:6px;margin-top:6px">`
    // 每行一个 label + 一个控件
    rows += `<div class="lt-row"><label>编码字段</label><input data-coderule-field value="${codeField}" placeholder="如 doc_no"></div>`
    rows += `<div class="lt-row"><label>编码规则</label><select data-coderule-mode>
      <option value="manual" ${mode==='manual'?'selected':''}>手动录入(校验正则)</option>
      <option value="auto" ${mode==='auto'?'selected':''}>自动生成(段引擎)</option>
    </select></div>`
    if (mode === 'manual') {
      rows += `<div class="lt-row"><label>格式校验</label><input data-coderule-pattern placeholder="校验录入格式，如 ^[A-Z]{3}\\d{4}$" title="正则表达式，用于校验用户手动录入的编码是否符合规则（保存时校验）" value="${escAttr(cr.pattern || '')}"></div>`
    } else {
      rows += `<div class="lt-row"><label title="选择编码引擎中已配置的规则，保存时由引擎自动生成编码并回填">规则码</label><select data-coderule-rulecode>${this._codeRuleOptions(cr.ruleCode || '')}</select></div>`
      rows += `<div class="lt-row"><label title="启用后删除/作废单据产生的断号会被回收利用，保证流水连续">连号补偿</label><input type="checkbox" data-coderule-enablegap ${cr.enableGap?'checked':''}></div>`
      rows += `<div class="lt-row"><label>兜底校验</label><input data-coderule-pattern placeholder="可选，引擎生成失败时校验" title="可选正则，当编码引擎生成失败、回退为手动录入时用于校验格式" value="${escAttr(cr.pattern || '')}"></div>`
    }
    rows += `</div>`
    return rows
  }

  /** DOC：当前层级内选中的表（tab），默认第一张。 */
  _currentDocTable () {
    const level = this._selectedTable || this._docLevels()[0]
    const tabs = this._docLevelTables(level)
    return tabs.find((x) => x.key === this._selectedDocTable) || tabs[0] || null
  }

  _currentTable () {
    if (this._kind === 'DOC') return this._currentDocTable()
    const list = this._tableList()
    const hit = list.find((t) => t.key === this._selectedTable)
    if (hit) return hit
    // 未命中：DCT 限定在当前类型 tab 内回退首项（不跨 tab 误选）；BASE 回退列表首项。
    if (this._kind === 'DCT') return list.find((t) => dictKindOf(t.table) === this._selectedDictTab) || null
    return list[0] || null
  }

  /** 当前激活的汇总表对象（summary tab 时），否则 null。 */
  _activeSummary (entry) {
    if (!(typeof this._fieldsPanelTab === 'string' && this._fieldsPanelTab.startsWith('summary:'))) return null
    const id = this._fieldsPanelTab.slice('summary:'.length)
    return (this._tableSummaries(entry) || []).find((x) => x.id === id) || null
  }

  /** 当前字段编辑作用域的 fields 数组（汇总表 tab → 汇总表自有 fields；否则主表 fields），保证存在。 */
  _activeFieldsArray (entry) {
    const sum = this._activeSummary(entry)
    if (sum) { if (!Array.isArray(sum.fields)) sum.fields = []; return sum.fields }
    const t = entry?.table
    if (!t) return []
    if (!Array.isArray(t.fields)) t.fields = []
    return t.fields
  }

  /** 选中表/字段集的字段数组：汇总表 tab 时取汇总表自有 fields，否则主表 fields。 */
  _tableFields (entry) {
    const sum = this._activeSummary(entry)
    if (sum) return Array.isArray(sum.fields) ? sum.fields : []
    return Array.isArray(entry?.table?.fields) ? entry.table.fields : []
  }

  // ─── 事件 ────────────────────────────────────────────────────────────────

  _handleClick (e) {
    const hitMulti = e.target instanceof Element ? e.target.closest('.multi-select') : null
    for (const d of this.shadowRoot.querySelectorAll('details.multi-select[open]')) {
      if (d !== hitMulti) d.open = false
    }
    const t = e.target instanceof Element ? e.target.closest('[data-action]') : null
    if (!(t instanceof HTMLElement)) return
    const a = t.dataset.action
    // 只读模式：仅放行导航类动作（切表/切 tab/切字段/展开等），拦截一切写入类动作。
    if (this._readonly) {
      const NAV_ACTIONS = new Set(['select-table', 'select-doc-table', 'select-doc-top-tab', 'select-doc-dict',
        'show-doc-dict-fieldset', 'close-doc-dict-fieldset', 'select-fields-tab', 'toggle-group',
        'select-field', 'field-detail-back', 'select-dict-tab', 'export-json', 'maintain-dict-data', 'show-field-tips'])
      if (!NAV_ACTIONS.has(a)) return
    }
    if (a === 'show-field-tips') {
      const text = t.dataset.fieldTips || ''
      let pop = this.shadowRoot.querySelector('#cmx-field-tips-popover')
      if (!pop) {
        pop = document.createElement('ui5-popover')
        pop.id = 'cmx-field-tips-popover'
        pop.setAttribute('placement', 'Bottom')
        pop.style.maxWidth = '380px'
        const body = document.createElement('div')
        body.className = 'cmx-field-tips-body'
        pop.appendChild(body)
        this.shadowRoot.appendChild(pop)
      }
      pop.querySelector('.cmx-field-tips-body').textContent = text
      pop.opener = t
      pop.open = true
    }
    if (a === 'remove-file') this._bus.requestRemoveFile()
    if (a === 'add-fieldset') void this._addFieldSet()
    if (a === 'save') void this._save()
    if (a === 'import-json') void this._importJson()
    if (a === 'export-json') this._exportJson()
    if (a === 'maintain-dict-data') this._openDictDataPage({
      dictCode: t.dataset.dictCode || '',
      domain: t.dataset.domain || '',
      application: t.dataset.application || '',
      module: t.dataset.module || '',
    })
    if (a === 'open-version-dialog') this._openVersionDialog()
    if (a === 'close-version-dialog') { this._versionDialog = null; this._render() }
    if (a === 'create-version') void this._createVersion()
    if (a === 'open-version-manager') this._openVersionManager()
    if (a === 'close-version-manager') { this._versionManagerOpen = false; this._render() }
    if (a === 'set-default-version') void this._setDefaultVersion(t.dataset.file || '')
    if (a === 'delete-version') { if (!t.hasAttribute('disabled')) void this._deleteVersion(t.dataset.file || '') }
    if (a === 'vm-switch-version') { this._versionManagerOpen = false; this._switchVersion(t.dataset.file || '') }
    if (a === 'select-table') { this._selectedTable = t.dataset.table || ''; this._selectedDocTable = ''; this._selectedFieldIndex = -1; this._clearRefDetail(); this._render() }
    if (a === 'select-doc-table') { this._selectedDocTable = t.dataset.table || ''; this._selectedFieldIndex = -1; this._clearRefDetail(); this._render() }
    if (a === 'select-doc-top-tab') {
      const k = t.dataset.docTopTab || 'levels'
      if (k !== this._selectedDocTopTab) {
        this._selectedDocTopTab = k
        this._docDictFieldSetDetail = null
        this._selectedFieldIndex = -1
        this._clearRefDetail()
        if (k === 'levels') this._selectedDocDictCode = ''
        else {
          const first = this._docReferencedDictEntries(k)[0]
          this._selectedDocDictCode = first?.code || ''
        }
        this._render()
        this._bus.emitState(true)
      }
    }
    if (a === 'select-doc-dict') {
      this._selectedDocDictCode = t.dataset.dictCode || ''
      this._docDictFieldSetDetail = null
      this._selectedFieldIndex = -1
      this._clearRefDetail()
      this._render()
      this._bus.emitState(true)
    }
    if (a === 'show-doc-dict-fieldset') {
      this._docDictFieldSetDetail = { dictCode: t.dataset.dictCode || this._selectedDocDictCode || '', fieldSet: t.dataset.fieldSet || '' }
      this._render()
    }
    if (a === 'close-doc-dict-fieldset') { this._docDictFieldSetDetail = null; this._render() }
    if (a === 'select-fields-tab') { this._fieldsPanelTab = t.dataset.tab || 'fields'; this._selectedFieldIndex = -1; this._clearRefDetail(); this._fieldsJsonMessage = ''; this._render() }
    if (a === 'add-summary') this._addSummary()
    if (a === 'remove-summary') this._removeSummary(t.dataset.summary || '')
    if (a === 'summary-inherit-columns') this._summaryInheritColumns(t.dataset.summary || '')
    if (a === 'summary-apply') this._applySummaryMeta(t.dataset.summary || '')
    if (a === 'fields-json-refresh') { this._fieldsJsonMessage = 'JSON 已从当前字段刷新'; this._render() }
    if (a === 'fields-json-format') this._formatFieldsJson()
    if (a === 'fields-json-apply') this._applyFieldsJson()
    if (a === 'add-level') this._addLevel()
    if (a === 'remove-level') this._removeLevel()
    if (a === 'add-doc-table') this._addDocTable()
    if (a === 'remove-doc-table') this._removeDocTable()
    if (a === 'select-dict-tab') {
      const k = t.dataset.dictKind || DICT_KIND_DEFAULT
      if (k !== this._selectedDictTab) { this._selectedDictTab = k; this._selectedTable = ''; this._selectedFieldIndex = -1; this._clearRefDetail(); this._render() }
    }
    if (a === 'add-dict') this._addDict(t.dataset.dictKind || this._selectedDictTab)
    if (a === 'remove-dict') this._removeDict(t.dataset.table || '')
    if (a === 'move-dict-up') { if (!t.hasAttribute('disabled')) this._moveDict(t.dataset.table || '', -1) }
    if (a === 'move-dict-down') { if (!t.hasAttribute('disabled')) this._moveDict(t.dataset.table || '', 1) }
    if (a === 'toggle-group') {
      // 点击模板下拉时不折叠分组
      if (e.target instanceof Element && e.target.closest('[data-template-select]')) return
      const id = `${this._selectedTable}::${t.dataset.group || ''}`
      const entry = this._currentTable()
      const g = this._fieldGroups(entry).find((x) => x.key === t.dataset.group)
      const cur = g ? this._isGroupOpen(entry, g) : false
      this._groupOpen[id] = !cur
      this._render()
    }
    if (a === 'add-field') this._addField()
    if (a === 'select-field') {
      // 行内点 input/select/checkbox 或删除按钮时不触发选中（保编辑/删除）；点行其它位置才选中
      if (e.target instanceof Element && e.target.closest('input,select,textarea,.icon-btn.danger')) return
      this._selectedFieldIndex = Number(t.dataset.fieldKey); this._clearRefDetail(); this._render()
    }
    if (a === 'field-detail-back') { this._selectedFieldIndex = -1; this._clearRefDetail(); this._render() }
    // 引用字段：点行选中（不触发行内控件），点"详细设置"进覆盖详编面板
    if (a === 'select-ref-field') {
      if (e.target instanceof Element && e.target.closest('input,select,textarea,button')) return
      this._selectRefField(t.dataset.set || '', t.dataset.fid || '')
    }
    if (a === 'edit-ref-field') { e.stopPropagation(); this._selectRefField(t.dataset.set || '', t.dataset.fid || '') }
    if (a === 'reset-ref-field') this._resetRefField(t.dataset.set || '', t.dataset.fid || '')
    if (a === 'remove-field') this._removeField(Number(t.dataset.fieldKey))
    if (a === 'move-field-up') this._moveField(Number(t.dataset.fieldKey), -1)
    if (a === 'move-field-down') this._moveField(Number(t.dataset.fieldKey), 1)
    // 枚举值（value+label）行编辑：增删枚举项
    if (a === 'add-enum') this._addEnum()
    if (a === 'remove-enum') this._removeEnum(Number(t.dataset.index))
    // 分组排序：整组上移/下移（改 table.fieldSetOrder）。
    if (a === 'move-group-up') { if (!t.hasAttribute('disabled')) this._moveGroup(t.dataset.group || '', -1) }
    if (a === 'move-group-down') { if (!t.hasAttribute('disabled')) this._moveGroup(t.dataset.group || '', 1) }
    if (a === 'remove-ref') this._removeRef(t.dataset.group || '')
    if (a === 'copy-group-fields') { e.stopPropagation(); void this._copyGroupFields(t.dataset.group || '') }
    if (a === 'paste-group-fields') { e.stopPropagation(); void this._pasteGroupFields(t.dataset.group || '') }
    // ── 索引 tab（表级唯一键/普通索引维护）──
    if (a === 'idx-edit') { e.stopPropagation(); this._openIndexDialog(t.dataset.type, Number(t.dataset.i)) }
    if (a === 'idx-pk-locked') { e.stopPropagation(); this._message = '主键条目由「字段定义」区的 isPrimaryKey 勾选自动维护，不可在此编辑'; this._render() }
    if (a === 'add-unique') this._addIndexEntry('unique')
    if (a === 'add-index') this._addIndexEntry('normal')
    if (a === 'idx-remove') this._removeIndexEntry(t.dataset.type, Number(t.dataset.i))
    if (a === 'idx-move') this._moveIndexEntry(t.dataset.type, Number(t.dataset.i), Number(t.dataset.dir))
    // ── 索引列选择弹窗 ──
    if (a === 'idxdlg-move-col') { e.stopPropagation(); this._moveIndexDialogColumn(Number(t.dataset.pos), Number(t.dataset.dir)) }
    if (a === 'idxdlg-ok') this._applyIndexDialog()
    if (a === 'idxdlg-cancel') { this._indexDialog = null; this._render() }
  }

  _handleInput (e) {
    const el = e.target
    if (el instanceof HTMLTextAreaElement && el.id === 'def-json') { if (this._readonly) return; this.updateSourceText(el.value); return }
    if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement)) return
    // 嵌入模式「档案」下拉：切换逻辑定义（导航，不属于 _doc 内容编辑）。
    if (el.dataset.embedDoc != null && el instanceof HTMLSelectElement) { this._switchEmbedDoc(el.value); return }
    // 版本下拉：切到另一版本（导航，不属于 _doc 内容编辑）。
    if (el.dataset.verSelect != null && el instanceof HTMLSelectElement) { this._switchVersion(el.value); return }
    // 只读模式：拦截一切 _doc 内容编辑（导航类下拉已在上方 return）。
    if (this._readonly) return
    // 新建版本弹窗字段：只更新弹窗状态，不重渲染（保留输入焦点），版本号变更时即时刷新文件名提示。
    if (el.dataset.verField && this._versionDialog) {
      this._versionDialog[el.dataset.verField] = (el instanceof HTMLInputElement && el.type === 'checkbox') ? el.checked : el.value
      if (el.dataset.verField === 'versionNo') {
        const hint = this.shadowRoot.querySelector('.ver-file-hint code')
        if (hint) hint.textContent = defFileForVersion(defFileParts(this._selected?.file || '').stem, Number(el.value) || '')
      }
      return
    }
    const prevSuppress = this._suppressContentSync
    this._suppressContentSync = !this.shadowRoot.contains(el)
    try {
      // codeRule 结构化编辑：组装对象写回（mode 切换需重渲染）
      if (el.closest('.cmx-coderule-edit')) {
        const wrap = el.closest('.cmx-coderule-edit')
        // field 优先从 input 取（DOC 侧可编辑），回退 data-code-field
        const codeField = wrap.querySelector('[data-coderule-field]')?.value || wrap.dataset.codeField || 'code'
        const mode = wrap.querySelector('[data-coderule-mode]')?.value || 'manual'
        const rule = { mode, field: codeField }
        if (mode === 'manual') {
          const pattern = wrap.querySelector('[data-coderule-pattern]')?.value || ''
          if (pattern) rule.pattern = pattern
        }
        if (mode === 'auto') {
          const ruleCode = wrap.querySelector('[data-coderule-rulecode]')?.value?.trim() || ''
          if (ruleCode) rule.ruleCode = ruleCode
          const enableGap = wrap.querySelector('[data-coderule-enablegap]')?.checked
          if (enableGap) rule.enableGap = true
          const pattern = wrap.querySelector('[data-coderule-pattern]')?.value || ''
          if (pattern) rule.pattern = pattern
        }
        // DCT 侧 → data-table-prop（_updateTableProp）
        if (wrap.dataset.tableProp) this._updateTableProp(wrap.dataset.tableProp, rule, 'coderule')
        // DOC 侧 → data-vt-index（_updateVoucherTable 写 voucherTables[index].codeRule）
        if (wrap.dataset.vtIndex != null) this._updateVoucherTable(Number(wrap.dataset.vtIndex), 'codeRule', rule)
        // mode 切换 → 下方的"格式校验 / 规则码 / 连号补偿 / 兜底校验"控件组要增减。
        // 编码编辑器渲染在检视面板组件（portal-definition-panels）的独立 shadowRoot 内，
        // this._render() 只重绘内容区，触碰不到面板；必须 emitState(true) 强制面板重渲染。
        if (mode !== wrap.dataset.curMode) {
          wrap.dataset.curMode = mode
          this._bus.emitState(true)
        }
        return
      }
      // 索引 tab：目标表切换（主表/DOC 汇总表；select 的 input 事件）。切表后弹窗内条目下标对新表无效 → 关闭弹窗
      if (el.dataset.indexTarget != null) { this._indexTarget = el.value || 'main'; this._indexDialog = null; this._render(); return }
      // 索引 tab：普通索引名称编辑（直写 indexes[i].name，无联动副作用）
      if (el.dataset.indexName != null) this._updateIndexName(el.dataset.type === 'unique' ? 'unique' : 'normal', Number(el.dataset.indexName), el.value)
      // 索引列选择弹窗：勾选/取消列（勾选顺序 = 列顺序，复合索引顺序敏感）
      if (el.dataset.idxCol != null) this._toggleIndexDialogColumn(el.dataset.idxCol)
      // 字段表格内联编辑（统一渲染器）：data-field-key=行号 + 规范 data-field-prop → 适配器
      if (el.dataset.fieldKey != null && el.dataset.fieldProp) {
        const raw = (el instanceof HTMLInputElement && el.type === 'checkbox') ? el.checked : el.value
        this._updateFieldByIndex(Number(el.dataset.fieldKey), el.dataset.fieldProp, raw, el.dataset.valueType)
      }
      // 字段详编面板（统一 schema 渲染器）：data-field-path 规范 key → 适配器写回本端存储
      // 引用字段详编时 _selectedRef 置位 → 同一面板改走 fieldOverrides 覆盖路径。
      if (el.dataset.fieldPath) {
        const raw = (el instanceof HTMLInputElement && el.type === 'checkbox') ? el.checked : el.value
        if (this._selectedRef) this._updateRefFieldByPath(el.dataset.fieldPath, raw, el.dataset.valueType)
        else this._updateFieldByPath(el.dataset.fieldPath, raw, el.dataset.valueType)
      }
      // 表元信息编辑：data-table-prop（点路径，如 dictMeta.dictName）
      if (el.dataset.tableProp) {
        const raw = (el instanceof HTMLInputElement && el.type === 'checkbox') ? el.checked : el.value
        this._updateTableProp(el.dataset.tableProp, raw, el.dataset.valueType)
      }
      // DOC 层级名称编辑：写回 voucherSchema.schema 该层所有节点的 levelName
      if (el.dataset.levelName != null) this._updateLevelName(el.dataset.levelName, el.value)
      // DOC 本层表编辑：voucherTables[index] 的 tableAlias/tableName
      if (el.dataset.vtIndex != null && el.dataset.vtProp) this._updateVoucherTable(Number(el.dataset.vtIndex), el.dataset.vtProp, el.value)
      // 引用模板列下拉：选中即引用（带去重检查）
      if (el.dataset.templateSelect != null && el.value) { const v = el.value; el.value = ''; this._addTemplateRef(v) }
      // 文件级 moduleMeta 编辑（explorer 底部属性区）
      if (el.dataset.moduleProp) {
        let raw = el.value
        if (el.dataset.moduleProp === 'keyDicts') {
          const root = el.getRootNode()
          const checked = [...(root.querySelectorAll?.('input[data-module-prop="keyDicts"]:checked') || [])]
          raw = checked.map((x) => x.value).filter(Boolean).join(',')
          const host = el.closest('.multi-select')
          const summary = host?.querySelector('summary')
          if (summary) {
            const text = checked.length
              ? checked.map((x) => x.closest('.multi-select-option')?.querySelector('span')?.textContent || x.value).join('，')
              : '请选择关键字典'
            summary.textContent = text
            summary.title = text
          }
        } else if (el instanceof HTMLSelectElement && el.multiple) {
          raw = [...el.selectedOptions].map((opt) => opt.value).filter(Boolean).join(',')
        }
        this._updateModuleProp(el.dataset.moduleProp, raw)
      }
      // 引用字段集中 dimension 行的「引用字典」覆盖：写回当前表 fieldOverrides（统一覆盖机制）
      if (el.dataset.refDictEdit != null && el.dataset.refField != null) this._updateFieldRefDict(el.dataset.refField, el.value, el.dataset.refSet || '')
      // 汇总表 id/name/caption 改为「点应用按钮才生效」，输入时不实时写入（见 summary-apply）
    } finally {
      this._suppressContentSync = prevSuppress
    }
  }

  /** change 时机：物理列名(id)改动的唯一键/索引引用联动。
   *  input 事件只更新字段值（逐字符），联动集中在 change/blur 一次性应用——
   *  避免改名中间态（code→cod→c→""）连锁替换索引列。 */
  _handleChange (e) {
    const el = e.target
    if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLSelectElement)) return
    if ((el.dataset.fieldKey != null && el.dataset.fieldProp === 'id') || el.dataset.fieldPath === 'id') {
      this._flushIdRename()
    }
    // 索引名清空后失焦：存储已退化回自动命名（input 事件处理），输入框回填自动名，
    // 避免空框看不出实际将生成的名字；非空值已在 input 事件实时写为自定义名。
    if (el.dataset.indexName != null && !String(el.value || '').trim()) {
      const type = el.dataset.type === 'unique' ? 'unique' : 'normal'
      const i = Number(el.dataset.indexName)
      const t = this._indexTargetTable(this._currentTable()).table
      const cols = type === 'unique'
        ? (this._ukColumns(Array.isArray(t?.uniqueKeys) ? t.uniqueKeys[i] : null) || [])
        : ((Array.isArray(t?.indexes) ? t.indexes[i] : null)?.columns || [])
      el.value = this._autoIndexName(type === 'unique' ? 'uk' : 'idx', this._indexTableName(t) || 't', cols)
    }
  }

  /** 引用字段的「引用字典」快捷覆盖，写当前表 fieldOverrides[key].refDict（统一机制，set 消歧）。 */
  _updateFieldRefDict (fieldKey, dictCode, setName) {
    if (!fieldKey) return
    const entry = this._currentTable()
    const t = entry?.table
    if (!t) return
    const base = (this._resolveSetFields(setName) || []).find((f) => fieldId(f) === fieldKey) || { id: fieldKey }
    const eff = this._effectiveRefField(t, base, setName)
    const edited = { ...eff }
    if (dictCode) edited.refDict = dictCode; else delete edited.refDict
    // 同名字段跨多 fieldSet 时用限定键消歧（该 set 内是否存在同 id 字段由调用点保证）
    this._writeFieldOverride(t, base, setName, edited, this._refIsAmbiguous(t, fieldKey))
    this._markDirty()
  }

  /** 某引用字段 id 是否在多个引用 fieldSet 中出现（同名歧义 → 需限定键）。 */
  _refIsAmbiguous (table, fieldId_) {
    let n = 0
    for (const setName of this._tableSetNames(table)) {
      if ((this._resolveSetFields(setName) || []).some((f) => fieldId(f) === fieldId_)) n++
      if (n > 1) return true
    }
    return false
  }

  /** 引用字段详编：把工作态字段某规范 key 写入并 diff 回 fieldOverrides。 */
  _updateRefFieldByPath (key, rawValue, valueType) {
    if (!this._selectedRef || !this._refWorking) return
    // enumValues.* 数组点路径：走专用写入（适配器 setPath 不支持数组下标）；其余经适配器
    if (key.startsWith('enumValues.')) {
      this._writeFieldPath(this._refWorking, key, rawValue, valueType)
    } else {
      // 复用字段适配器：按规范 key 路径写入 this._refWorking（有效字段的可变克隆）
      this._fieldAdapter().set(this._refWorking, key, rawValue, valueType)
    }
    const { setName, fieldId: fid } = this._selectedRef
    const base = (this._resolveSetFields(setName) || []).find((f) => fieldId(f) === fid) || { id: fid }
    const entry = this._currentTable()
    if (entry?.table) this._writeFieldOverride(entry.table, base, setName, this._refWorking, this._refIsAmbiguous(entry.table, fid))
    this._markDirty()
    if (key === 'edit.mode') { if (this._suppressContentSync) this._bus.emitState(true); else this._render() }
  }

  /** 打开引用字段详编：建工作态"有效字段"克隆（base ⊕ 当前覆盖），property 区渲染面板。 */
  _selectRefField (setName, fid) {
    const entry = this._currentTable()
    const base = (this._resolveSetFields(setName) || []).find((f) => fieldId(f) === fid)
    if (!base || !entry?.table) return
    this._selectedFieldIndex = -1
    this._selectedRef = { setName, fieldId: fid, qualified: this._refIsAmbiguous(entry.table, fid) }
    this._refWorking = clonePlain(this._effectiveRefField(entry.table, base, setName))
    this._render()
  }

  /**
   * 清除引用字段详编态（_selectedRef 与配套 _refWorking 成对复位）。
   * 切表 / 切 tab / 选本表字段等一切离开该面板的动作都要调用——否则 renderInspectorPanelHtml
   * 因 _selectedRef 优先级最高而卡在旧的引用详编视图，property 区不随选择切换。
   * @returns {boolean} 是否确有引用详编态被清除（用于决定是否需要重渲）
   */
  _clearRefDetail () {
    if (!this._selectedRef && !this._refWorking) return false
    this._selectedRef = null
    this._refWorking = null
    return true
  }

  /** 引用字段某属性还原为 base：从 fieldOverrides 删除该键（整字段还原=删除整条覆盖）。 */
  _resetRefField (setName, fid) {
    const entry = this._currentTable()
    const t = entry?.table
    if (!t) return
    const overrides = normalizeFieldOverrides(t.fieldOverrides, t.fieldRefDicts)
    const key = this._refIsAmbiguous(t, fid) ? `${setName}.${fid}` : fid
    // 归一后重写：清掉旧 fieldRefDicts 里同 id（已并入 overrides），删除目标覆盖键
    if (t.fieldOverrides) { delete t.fieldOverrides[key]; if (!Object.keys(t.fieldOverrides).length) delete t.fieldOverrides }
    if (t.fieldRefDicts) { delete t.fieldRefDicts[fid]; if (!Object.keys(t.fieldRefDicts).length) delete t.fieldRefDicts }
    void overrides
    // 刷新工作态
    const base = (this._resolveSetFields(setName) || []).find((f) => fieldId(f) === fid) || { id: fid }
    this._refWorking = clonePlain(this._effectiveRefField(t, base, setName))
    this._markDirty()
    this._render()
  }

  /** 文件级元信息编辑：DOC/DCT/BASE 三类统一写 moduleMeta.*。 */
  _updateModuleProp (prop, value) {
    if (!this._doc || typeof this._doc !== 'object') this._doc = {}
    const root = this._metaKey
    if (!this._doc[root] || typeof this._doc[root] !== 'object') this._doc[root] = {}
    if (prop === 'version') { const n = Number(value); this._doc[root].version = Number.isFinite(n) ? n : value }
    else if (value === '') delete this._doc[root][prop]
    else this._doc[root][prop] = value
    this._markDirty()
  }

  /** 文件级属性表单 HTML（explorer 底部属性区渲染用）。 */
  renderModulePropsHtml () {
    if (!this._doc) return '<cmx-empty-state icon="document" title="请先选择一个定义文件" size="sm"></cmx-empty-state>'
    if (this._isBase()) {
      const m = this._doc.moduleMeta || {}
      return `<div class="mod-form">
        <label>编码</label><input data-module-prop="moduleCode" value="${escAttr(m.moduleCode || '')}">
        <label>名称</label><input data-module-prop="metaName" value="${escAttr(m.metaName || '')}">
        <label>版本</label><input data-module-prop="version" type="number" value="${escAttr(m.version == null ? '' : String(m.version))}">
        <label>说明</label><input data-module-prop="remark" value="${escAttr(m.remark || '')}">
      </div>`
    }
    const m = this._mm || {}
    const codeProp = 'moduleCode'
    const codeLabel = this._kind === 'DOC' ? '单据模块编码' : '字典分组编码'
    return `<div class="mod-form">
      <label>${codeLabel}</label><input data-module-prop="${codeProp}" value="${escAttr(m[codeProp] || '')}" placeholder="${this._kind === 'DOC' ? '如 cmxfico（取文件名 _doc_meta 前段）' : '如 FICO'}">
      <label>名称</label><input data-module-prop="metaName" value="${escAttr(m.metaName || '')}">
      <label>版本号</label><input data-module-prop="version" type="number" value="${escAttr(m.version == null ? '' : String(m.version))}" readonly title="版本号与文件名绑定，请用标题区「新建版本」创建新版本">
      <label>版本名称</label><input data-module-prop="versionName" value="${escAttr(m.versionName || '')}" placeholder="本版本说明">
      ${this._kind === 'DOC' ? this._renderOrganizationDictSetting(m) : ''}
      ${this._kind === 'DOC' ? this._renderDocumentTypeDictSetting(m) : ''}
      ${this._kind === 'DOC' ? this._renderKeyDictsSetting(m) : ''}
      <label>说明</label><input data-module-prop="remark" value="${escAttr(m.remark || '')}">
    </div>`
  }

  _renderOrganizationDictSetting (mm) {
    const value = String(mm.organizationDict || mm.organizationDictCode || '').trim()
    const refs = this._docReferencedDictCodes()
    const options = value && !refs.includes(value) ? [...refs, value] : refs
    return `<label>组织字典</label><select data-module-prop="organizationDict">
      <option value="">未设置</option>
      ${options.map((key) => `<option value="${escAttr(key)}" ${key === value ? 'selected' : ''}>${escHtml(this._dictNameMap?.[key] || key)}（${escHtml(key)}）</option>`).join('')}
    </select>`
  }

  _renderDocumentTypeDictSetting (mm) {
    const value = String(mm.documentTypeDict || mm.documentTypeDictCode || mm.voucherTypeDict || '').trim()
    const refs = this._docReferencedDictCodes()
    const options = value && !refs.includes(value) ? [...refs, value] : refs
    return `<label>单据类型字典</label><select data-module-prop="documentTypeDict">
      <option value="">未设置</option>
      ${options.map((key) => `<option value="${escAttr(key)}" ${key === value ? 'selected' : ''}>${escHtml(this._dictNameMap?.[key] || key)}（${escHtml(key)}）</option>`).join('')}
    </select>`
  }

  _renderKeyDictsSetting (mm) {
    const value = mm.keyDicts || mm.keyDictCodes || ''
    const selected = String(value || '').split(',').map((x) => x.trim()).filter(Boolean)
    const refs = this._docReferencedDictCodes()
    const options = [...refs]
    for (const key of selected) { if (!options.includes(key)) options.push(key) }
    const summary = selected.length
      ? selected.map((key) => this._dictNameMap?.[key] || key).join('，')
      : '请选择关键字典'
    return `<label>关键字典</label><details class="multi-select">
      <summary title="${escAttr(summary)}">${escHtml(summary)}</summary>
      <div class="multi-select-menu">
        ${options.length ? options.map((key) => `<label class="multi-select-option">
          <input type="checkbox" data-module-prop="keyDicts" value="${escAttr(key)}" ${selected.includes(key) ? 'checked' : ''}>
          <span>${escHtml(this._dictNameMap?.[key] || key)}（${escHtml(key)}）</span>
        </label>`).join('') : '<cmx-empty-state icon="list" title="暂无引用字典" size="sm"></cmx-empty-state>'}
      </div>
    </details>`
  }

  /** 详编面板（统一 schema）按规范 key 写入当前选中字段；适配器负责映射到本端存储键 + 联动。 */
  _updateFieldByPath (key, rawValue, valueType) {
    const entry = this._currentTable()
    const fields = this._tableFields(entry)
    const f = fields[this._selectedFieldIndex]
    if (!f) return
    // enumValues.* 数组点路径：适配器 setPath 不支持数组下标，走专用写入
    if (key.startsWith('enumValues.')) {
      this._writeFieldPath(f, key, rawValue, valueType)
      this._markDirty()
      this._render()
      return
    }
    const prevPk = key === 'isPrimaryKey' ? this._currentPkColumns(entry) : null
    const prevId = key === 'id' ? fieldId(f) : null
    const r = this._fieldAdapter().set(f, key, rawValue, valueType)
    if (key === 'isPrimaryKey') this._syncPrimaryKeyDefinition(entry, prevPk)
    if (prevId != null) this._beginIdRename(this._selectedFieldIndex, prevId)
    this._markDirty()
    if (r && r.relayout && key !== 'id') {
      if (this._suppressContentSync) this._bus.emitState(true)
      else this._render()
    }
  }

  /** 通用点路径写入（供 enumValues.* 等数组路径用）。适配器 setPath 不支持数组下标，故单独实现。 */
  _writeFieldPath (field, path, rawValue, valueType) {
    let value = rawValue
    if (valueType === 'boolean') value = (!!rawValue && rawValue !== 'false')
    else if (valueType === 'number') value = (rawValue === '' || rawValue == null) ? undefined : Number(rawValue)
    const segs = path.split('.')
    const leaf = segs.pop()
    let node = field
    for (let si = 0; si < segs.length; si++) {
      const seg = segs[si]
      const k = /^\d+$/.test(seg) ? Number(seg) : seg
      const nextIsNum = /^\d+$/.test(segs[si + 1] || '')
      if (node[k] == null || typeof node[k] !== 'object') node[k] = nextIsNum ? [] : {}
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

  _addEnum () {
    const entry = this._currentTable()
    const fields = this._tableFields(entry)
    const f = fields[this._selectedFieldIndex]
    if (!f) return
    f.enumValues = Array.isArray(f.enumValues) ? f.enumValues : []
    f.enumValues.push({ value: '', label: '' })
    this._markDirty()
    this._render()
  }

  async _removeEnum (index) {
    const entry = this._currentTable()
    const fields = this._tableFields(entry)
    const f = fields[this._selectedFieldIndex]
    if (!f || !Array.isArray(f.enumValues)) return
    if (!(await admConfirm({ title: '删除枚举项', message: '确定删除该枚举项？', danger: true }))) return
    f.enumValues.splice(index, 1)
    if (!f.enumValues.length) delete f.enumValues
    this._markDirty()
    this._render()
  }

  /** 表格内联（统一 schema）按行号 + 规范 key 写入；适配器映射 + 联动（dataType/refDict 需重渲染）。 */
  _updateFieldByIndex (index, key, rawValue, valueType) {
    const entry = this._currentTable()
    const fields = this._tableFields(entry)
    const f = fields[index]
    if (!f) return
    const prevPk = key === 'isPrimaryKey' ? this._currentPkColumns(entry) : null
    const prevId = key === 'id' ? fieldId(f) : null
    const r = this._fieldAdapter().set(f, key, rawValue, valueType)
    if (key === 'isPrimaryKey') this._syncPrimaryKeyDefinition(entry, prevPk)
    if (prevId != null) this._beginIdRename(index, prevId)
    this._markDirty()
    if (r && r.relayout && key !== 'id') {
      if (this._suppressContentSync) this._bus.emitState(true)
      else this._render()
    }
  }

  /** 该表当前主键列集合：字段级 isPrimaryKey 勾选 + dictMeta.idField（后端 compile 亦认 idField），按字段出现顺序。 */
  _currentPkColumns (entry) {
    const t = entry?.table
    const fields = Array.isArray(t?.fields) ? t.fields : []
    const names = fields.map((f) => fieldId(f))
    const pk = fields.filter((f) => isPrimaryKeyField(f)).map((f) => fieldId(f))
    const idf = t?.dictMeta?.idField
    if (idf && names.includes(idf) && !pk.includes(idf)) pk.unshift(idf)
    return pk
  }

  /**
   * 把字段级 isPrimaryKey 勾选同步到表级「主键定义」uniqueKeys（仅 DCT 主表；汇总表 tab 不处理）。
   * 主键定义 = uniqueKeys 中代表主键那一条；其余条目是业务唯一键，一律原样保留。
   *
   * 识别「主键项」的顺序（避免误伤业务唯一键，如 report_row 的 PK=id + 另一条业务唯一键）：
   *   ① 本会话内已记住的引用 _pkUkRef；
   *   ② 与「改动前主键列集合」prevPk 相等的条目（正常态）；
   *   ③ 是 prevPk 子集的条目（历史脱节：uniqueKeys 落后于字段勾选时的自愈）。
   * 都没有 → 视为新增，追加一条（不动任何现有业务唯一键）。
   * 新主键列集合为空 → 删除主键项（不留空数组/悬空）。
   * @param {string[]|null} prevPk 改动前的主键列集合（调用方在 set() 前用 _currentPkColumns 捕获）
   */
  _syncPrimaryKeyDefinition (entry, prevPk) {
    const t = entry?.table
    if (!t || this._kind !== 'DCT' || this._activeSummary(entry)) return
    const pkCols = this._currentPkColumns(entry)
    const pkSet = new Set(pkCols)
    const eqSet = (arr, set) => Array.isArray(arr) && arr.length === set.size && arr.every((c) => set.has(c))
    const prevSet = new Set(Array.isArray(prevPk) ? prevPk : [])

    let uks = Array.isArray(t.uniqueKeys) ? t.uniqueKeys.slice() : []
    // 定位旧主键项（条目双形态：纯数组 / {name?,columns}，比较一律取列集合）
    let pkIdx = -1
    const remembered = this._pkUkRef && this._pkUkRef.table === t ? this._pkUkRef.key : null
    if (remembered) pkIdx = uks.indexOf(remembered)
    if (pkIdx < 0 && prevSet.size) pkIdx = uks.findIndex((uk) => eqSet(this._ukColumns(uk), prevSet)) // ② 相等
    if (pkIdx < 0 && prevSet.size) {
      pkIdx = uks.findIndex((uk) => {
        const c = this._ukColumns(uk)
        return Array.isArray(c) && c.length && c.every((x) => prevSet.has(x))
      }) // ③ 子集自愈
    }

    if (pkSet.size === 0) {
      if (pkIdx >= 0) uks.splice(pkIdx, 1)
      this._pkUkRef = null
    } else {
      const pkEntry = pkCols.slice()
      if (pkIdx >= 0) uks[pkIdx] = pkEntry
      else uks.push(pkEntry)
      this._pkUkRef = { table: t, key: pkEntry }
    }
    if (uks.length) t.uniqueKeys = uks
    else delete t.uniqueKeys
  }

  _updateTableProp (path, value, valueType = '') {
    const entry = this._currentTable()
    if (!entry) return
    const segs = path.split('.')
    const leaf = segs.pop()
    let node = entry.table
    for (const s of segs) { if (node[s] == null || typeof node[s] !== 'object') node[s] = {}; node = node[s] }
    if (valueType === 'boolean') value = !!value
    if (valueType === 'number') {
      const n = Math.max(1, Math.min(9, Number(value || 1)))
      value = Number.isFinite(n) ? n : 1
    }
    if (valueType === 'digitString') {
      const maxLevel = Math.max(1, Math.min(9, Number(entry.table?.dictMeta?.maxLevel || 1)))
      value = String(value || '').replace(/\D/g, '').slice(0, maxLevel)
    }
    if (value === '') delete node[leaf]; else node[leaf] = value
    if (path === 'dictMeta.selfHierarchy' && !value && entry.table?.dictMeta) {
      delete entry.table.dictMeta.maxLevel
      delete entry.table.dictMeta.codeStructure
    }
    if (path === 'dictMeta.maxLevel' && entry.table?.dictMeta?.codeStructure) {
      entry.table.dictMeta.codeStructure = String(entry.table.dictMeta.codeStructure).replace(/\D/g, '').slice(0, value)
    }
    this._markDirty()
    if (path === 'dictMeta.selfHierarchy') {
      if (this._suppressContentSync) this._bus.emitState(true)
      else this._render()
    } else if (path === 'dictMeta.maxLevel') {
      if (this._suppressContentSync) this._bus.emitState(true)
      else this._render()
    } else if (path === 'dictMeta.relation.master.dict' || path === 'dictMeta.relation.auxiliary.dict') {
      // 改主/辅字典 → 重渲，让值列/显示列下拉刷新为新字典的字段清单
      if (this._suppressContentSync) this._bus.emitState(true)
      else this._render()
    }
  }

  /** DOC：写回 voucherSchema.schema 中该层级所有节点的 levelName。 */
  _updateLevelName (level, value) {
    const schema = this._doc?.voucherSchema?.schema
    if (!Array.isArray(schema)) return
    for (const levelNodes of schema) {
      if (Array.isArray(levelNodes)) {
        for (const n of levelNodes) { if ((n.level || '') === level) n.levelName = value }
      }
    }
    this._markDirty()
  }

  /** DOC：编辑 voucherTables[index] 的 tableAlias/tableName。改 tableName(ID) 时同步 schema 节点 id 与选中 tab。 */
  _updateVoucherTable (index, prop, value) {
    const tables = Array.isArray(this._doc?.voucherTables) ? this._doc.voucherTables : []
    const tbl = tables[index]
    if (!tbl) return
    if (prop === 'tableName') {
      const old = tbl.tableName
      tbl.tableName = value
      // 同步 schema 节点 id（id===old 的节点）
      const schema = this._doc?.voucherSchema?.schema
      if (Array.isArray(schema)) {
        for (const levelNodes of schema) {
          if (Array.isArray(levelNodes)) for (const n of levelNodes) { if (n.id === old) n.id = value }
        }
      }
      // 若改的是当前选中 tab，跟随到新名
      if (this._selectedDocTable === old) this._selectedDocTable = value
      for (const t of tables) {
        if (t && t.parentTable === old) t.parentTable = value
      }
    } else if (prop === 'parentTable') {
      if (value) tbl.parentTable = value
      else delete tbl.parentTable
    } else {
      tbl[prop] = value
    }
    this._markDirty()
  }

  // ─── DOC 层级 / 表 增删 ───────────────────────────────────────────────────

  /** 确保 _doc 上有 voucherSchema.schema 与 voucherTables 容器。 */
  _ensureDocContainers () {
    if (!this._doc || typeof this._doc !== 'object') this._doc = {}
    if (!this._doc.voucherSchema || typeof this._doc.voucherSchema !== 'object') this._doc.voucherSchema = {}
    if (!Array.isArray(this._doc.voucherSchema.schema)) this._doc.voucherSchema.schema = []
    if (!Array.isArray(this._doc.voucherTables)) this._doc.voucherTables = []
  }

  /** 生成唯一物理表名（base + 序号）。 */
  _uniqueTableName (base) {
    const used = new Set((this._doc?.voucherTables || []).map((t) => t.tableName))
    let n = base; let i = 1
    while (used.has(n)) n = `${base}_${++i}`
    return n
  }

  _addLevel () {
    this._ensureDocContainers()
    const schema = this._doc.voucherSchema.schema
    const lv = `L${schema.length + 1}`
    const tableName = this._uniqueTableName(`new_table_${lv.toLowerCase()}`)
    const parentOpts = this._docParentTableOptions(lv)
    const table = { level: lv, tableName, tableAlias: '新表', remark: '', fields: [] }
    if (parentOpts.length === 1) table.parentTable = parentOpts[0].value
    schema.push([{ id: tableName, kind: 'list', level: lv, levelName: '新层级' }])
    this._doc.voucherTables.push(table)
    this._selectedTable = lv
    this._selectedDocTable = tableName
    this._markDirty(); this._render()
  }

  async _removeLevel () {
    const level = this._selectedTable
    if (!level) return
    this._ensureDocContainers()
    const levelTables = this._doc.voucherTables.filter((t) => (t.level || 'L1') === level)
    const tableIds = new Set(levelTables.map((t) => t.tableName).filter(Boolean))
    const fieldCount = levelTables.reduce((n, t) => n + (Array.isArray(t.fields) ? t.fields.length : 0), 0)
    const summaryCount = levelTables.reduce((n, t) => n + (Array.isArray(t.summaries) ? t.summaries.length : 0), 0)
    const levelName = this._docLevelName(level)
    const label = levelName ? `${level} ${levelName}` : level
    const msg = `确定删除层级「${label}」及其 ${levelTables.length} 张表、${fieldCount} 个字段、${summaryCount} 个汇总表？此操作不可恢复。`
    if (!(await admConfirm({ title: '删除确认', message: msg, danger: true }))) return
    this._doc.voucherSchema.schema = this._doc.voucherSchema.schema.filter((nodes) => !(Array.isArray(nodes) && nodes.some((n) => (n.level || '') === level)))
    this._doc.voucherTables = this._doc.voucherTables.filter((t) => (t.level || 'L1') !== level)
    for (const t of this._doc.voucherTables) {
      if (t && tableIds.has(t.parentTable)) delete t.parentTable
    }
    this._selectedTable = this._docLevels()[0] || ''
    this._selectedDocTable = ''
    this._selectedFieldIndex = -1
    this._clearRefDetail()
    this._fieldsPanelTab = 'fields'
    this._markDirty(); this._render()
  }

  _addDocTable () {
    const level = this._selectedTable || this._docLevels()[0]
    if (!level) { this._addLevel(); return }
    this._ensureDocContainers()
    const tableName = this._uniqueTableName(`new_table_${level.toLowerCase()}`)
    const parentOpts = this._docParentTableOptions(level)
    const table = { level, tableName, tableAlias: '新表', remark: '', fields: [] }
    if (parentOpts.length === 1) table.parentTable = parentOpts[0].value
    this._doc.voucherTables.push(table)
    // 在 schema 该层节点数组里加一个节点
    const schema = this._doc.voucherSchema.schema
    let levelArr = schema.find((nodes) => Array.isArray(nodes) && nodes.some((n) => (n.level || '') === level))
    if (!levelArr) { levelArr = []; schema.push(levelArr) }
    levelArr.push({ id: tableName, kind: 'list', level })
    this._selectedDocTable = tableName
    this._markDirty(); this._render()
  }

  async _removeDocTable () {
    const cur = this._currentDocTable()
    if (!cur) return
    const name = cur.table.tableName
    const fieldCount = Array.isArray(cur.table.fields) ? cur.table.fields.length : 0
    const summaryCount = Array.isArray(cur.table.summaries) ? cur.table.summaries.length : 0
    const label = cur.table.tableAlias || name || '未命名表'
    const msg = `确定删除表「${label}」${name ? `（${name}）` : ''}及其 ${fieldCount} 个字段、${summaryCount} 个汇总表？此操作不可恢复。`
    if (!(await admConfirm({ title: '删除确认', message: msg, danger: true }))) return
    this._ensureDocContainers()
    this._doc.voucherTables = this._doc.voucherTables.filter((t) => t.tableName !== name)
    for (const t of this._doc.voucherTables) {
      if (t && t.parentTable === name) delete t.parentTable
    }
    // schema 中移除 id===name 的节点
    for (const nodes of this._doc.voucherSchema.schema) {
      if (Array.isArray(nodes)) { const idx = nodes.findIndex((n) => n.id === name); if (idx !== -1) nodes.splice(idx, 1) }
    }
    this._selectedDocTable = ''
    this._selectedFieldIndex = -1
    this._clearRefDetail()
    this._fieldsPanelTab = 'fields'
    this._markDirty(); this._render()
  }

  // ─── 汇总表（DOC）增删改 ────────────────────────────────────────────────────

  /** 取当前选中表的 summaries（保证数组存在），返回 { table, summaries }。 */
  _ensureSummaries () {
    const entry = this._currentTable()
    const table = entry?.table
    if (!table) return null
    if (!Array.isArray(table.summaries)) table.summaries = []
    return { table, summaries: table.summaries }
  }

  _uniqueSummaryId (base, summaries) {
    const used = new Set((summaries || []).map((s) => s.id))
    let n = base; let i = 1
    while (used.has(n)) n = `${base}_${++i}`
    return n
  }

  /** 新增一个空汇总表（id/name/caption 默认值，用户在面板顶部可改），并切到它的 tab。 */
  _addSummary () {
    const ctx = this._ensureSummaries(); if (!ctx) return
    const base = `${ctx.table.tableName || 'summary'}_sum`
    const id = this._uniqueSummaryId(base, ctx.summaries)
    ctx.summaries.push({ id, name: id, caption: { zh_CN: id }, fields: [] })
    this._selectedFieldIndex = -1
    this._clearRefDetail()
    this._fieldsPanelTab = `summary:${id}`
    this._markDirty(); this._render()
  }

  async _removeSummary (id) {
    const ctx = this._ensureSummaries(); if (!ctx || !id) return
    const s = ctx.summaries.find((x) => x.id === id)
    if (!s) return
    const label = (s.caption && s.caption.zh_CN) || s.name || id
    // 非空保护：汇总表若已定义字段，则不允许删除
    const fieldCount = Array.isArray(s.fields) ? s.fields.length : 0
    if (fieldCount > 0) {
      this._alertBlocked(`汇总表「${label}」已定义 ${fieldCount} 个字段，不能删除。请先清空其字段。`)
      return
    }
    if (!(await admConfirm({ title: '删除汇总表', message: `确定删除汇总表「${label}」？`, danger: true }))) return
    ctx.table.summaries = ctx.summaries.filter((x) => x.id !== id)
    if (this._fieldsPanelTab === `summary:${id}`) this._fieldsPanelTab = 'fields'
    this._markDirty(); this._render()
  }

  /** 继承所在表的所有列：把源表（含引用字段集展开）所有列深拷贝进汇总表 fields（覆盖）。 */
  async _summaryInheritColumns (id) {
    const ctx = this._ensureSummaries(); if (!ctx || !id) return
    const s = ctx.summaries.find((x) => x.id === id); if (!s) return
    const src = this._summarySourceFields()
    if (s.fields && s.fields.length && typeof window !== 'undefined' &&
      !(await admConfirm({ title: '覆盖汇总表字段', message: `将用源表 ${src.length} 列覆盖当前汇总表字段（现有 ${s.fields.length} 列）？` }))) return
    s.fields = src.map((f) => clonePlain(f))
    this._selectedFieldIndex = -1
    this._message = `已继承源表 ${s.fields.length} 列`
    this._markDirty(); this._render()
  }

  /** 应用汇总表顶部 ID/Name/caption（点应用按钮触发）：一次性读取三输入、校验、写回，
   *  改 ID 时同步当前激活 tab，重渲后 tab 标签 title 自动更新。 */
  _applySummaryMeta (id) {
    const ctx = this._ensureSummaries(); if (!ctx || !id) return
    const s = ctx.summaries.find((x) => x.id === id); if (!s) return
    const root = this.shadowRoot
    const get = (prop) => { const el = root.querySelector(`[data-summary-prop="${prop}"][data-summary="${id}"]`); return el ? String(el.value || '') : '' }
    const nid = get('id').trim()
    const name = get('name')
    const caption = get('caption')
    if (!nid) { this._message = '汇总表ID不能为空'; this._render(); return }
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(nid)) { this._message = '汇总表ID须为合法标识（字母/下划线开头）'; this._render(); return }
    if (nid !== s.id && ctx.summaries.some((x) => x !== s && x.id === nid)) { this._message = `汇总表ID「${nid}」已存在`; this._render(); return }
    s.id = nid
    s.name = name
    s.caption = caption ? { zh_CN: caption } : {}
    this._fieldsPanelTab = `summary:${nid}`   // tab key/title 跟随
    this._message = '汇总表属性已应用'
    this._markDirty(); this._render()
  }

  // ─── DCT 字典 增删 ─────────────────────────────────────────────────────────

  /** 生成唯一 dictCode。 */
  _uniqueDictCode (base) {
    const used = new Set((this._doc?.dictionaryTables || []).map((t) => t.dictMeta?.dictCode))
    let n = base; let i = 1
    while (used.has(n)) n = `${base}_${++i}`
    return n
  }

  /** 新增字段集（BASE 系）：弹窗收集英文名（校验非空/格式/重复），写入 fieldSets 后选中等保存。 */
  async _addFieldSet () {
    if (!this._doc || typeof this._doc !== 'object') this._doc = {}
    if (!this._doc.fieldSets || typeof this._doc.fieldSets !== 'object') this._doc.fieldSets = {}
    const form = document.createElement('div')
    form.className = 'crm-new-form'
    // eslint-disable-next-line no-restricted-syntax -- 静态结构；值经转义/受控输入。
    form.innerHTML = `
      <style>
        .crm-new-form{box-sizing:border-box;display:flex;flex-direction:column;gap:12px;font-family:var(--sapFontFamily,Arial,sans-serif);color:var(--sapTextColor,#1d2d3e);padding:4px 2px}
        .crm-new-row{display:grid;grid-template-columns:88px minmax(0,300px);gap:8px 10px;align-items:center;font-size:13px}
        .crm-new-row label{color:var(--sapContent_LabelColor,#6a6d70)}
        .crm-new-row input{width:100%;box-sizing:border-box;height:30px;border:1px solid var(--sapField_BorderColor,#89919a);border-radius:4px;padding:0 8px;font:inherit;font-size:13px;background:var(--sapField_Background,#fff);color:inherit}
        .crm-new-row input:focus{outline:none;border-color:var(--neo-cyan,#00b4d8)}
        .crm-new-row input.is-invalid{border-color:var(--sapNegativeColor,#bb0000)}
        .crm-new-err{grid-column:2;font-size:11px;color:var(--sapNegativeColor,#bb0000);min-height:14px}
        .crm-new-hint{grid-column:2;font-size:11px;color:var(--sapContent_LabelColor,#6a6d70)}
      </style>
      <div class="crm-new-row"><label>字段集名</label><input data-field="name" placeholder="如 dictionaryCommonFields" maxlength="64"></div>
      <div class="crm-new-row"><label></label><div class="crm-new-err" data-err="name"></div></div>
      <div class="crm-new-row"><label></label><div class="crm-new-hint">英文标识（字母开头，驼峰）；创建后可在其中新增字段，业务字典/单据经 *FieldSet 引用</div></div>`
    const nameInput = form.querySelector('[data-field="name"]')
    const errEl = form.querySelector('[data-err="name"]')
    const validate = () => {
      const val = (nameInput.value || '').trim()
      let msg = ''
      if (!val) msg = '请输入字段集名'
      else if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(val)) msg = '须以字母开头，仅含字母、数字、下划线'
      else if (Object.prototype.hasOwnProperty.call(this._doc.fieldSets, val)) msg = `字段集「${val}」已存在`
      errEl.textContent = msg
      nameInput.classList.toggle('is-invalid', !!msg)
      return !msg
    }
    nameInput.addEventListener('input', () => { if (errEl.textContent) validate() })
    const dlg = document.createElement('cmx-floating-dialog')
    dlg.configure({
      title: '新增字段集',
      icon: 'add',
      showConfirm: true,
      showCancel: true,
      confirmText: '创建',
      cancelText: '取消',
      dialogWidth: '460px',
      dialogHeight: '240px',
      beforeClose: async ({ action }) => {
        if (action !== 'confirm') return true
        if (!validate()) { nameInput.focus(); return false }
        const name = (nameInput.value || '').trim()
        this._doc.fieldSets[name] = { fields: [] }
        this._selectedTable = name
        this._markDirty(); this._render()
        return true
      },
    })
    form.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); dlg.close('confirm') } })
    dlg.setContent(form)
    document.body.appendChild(dlg)
    nameInput.focus()
    await dlg.openModal()
    dlg.remove()
  }

  _addDict (kind) {
    if (!this._doc || typeof this._doc !== 'object') this._doc = {}
    if (!Array.isArray(this._doc.dictionaryTables)) this._doc.dictionaryTables = []
    const dictKind = DICT_KINDS.some((d) => d.value === kind) ? kind : (this._selectedDictTab || DICT_KIND_DEFAULT)
    const code = this._uniqueDictCode('new_dict')
    const dict = dictKind === 'RELATION'
      ? newRelationDict({ dictCode: code, dictName: `新${dictKindLabel(dictKind)}` })  // 关系字典专属骨架（relationCommonFields + relation 占位）
      : {
        dictMeta: { dictCode: code, dictName: `新${dictKindLabel(dictKind)}`, dictKind, selfHierarchy: false, tableName: code, idField: 'id', codeField: 'code', labelField: 'name', maxLevel: 1, codeStructure: '', codeRule: { mode: 'manual', field: 'code' }, remark: '' },
        fields: [],
        baseFieldSet: 'dictionaryCommonFields',
      }
    this._doc.dictionaryTables.push(dict)
    this._selectedDictTab = dictKind   // 新增后切到该类型 tab，确保新字典可见
    this._selectedTable = this._ensureDictUid(dict, this._doc.dictionaryTables.length - 1) // 选中用稳定 _uid
    this._markDirty(); this._render()
  }

  async _removeDict (uid) {
    if (!uid) return
    const arr = Array.isArray(this._doc?.dictionaryTables) ? this._doc.dictionaryTables : []
    const dict = arr.find((t) => t._uid === uid)
    if (!dict) return
    const name = dict.dictMeta?.dictName || dict.dictMeta?.dictCode || uid
    // 非空保护：字典若已定义字段，或引用了基础字段集（*FieldSet 键有值），则不允许删除
    const fieldCount = Array.isArray(dict.fields) ? dict.fields.length : 0
    const refSets = Object.entries(dict)
      .filter(([k, v]) => /FieldSet/i.test(k))
      .flatMap(([, v]) => (Array.isArray(v) ? v : [v]))
      .filter((x) => x != null && String(x).trim() !== '')
    if (fieldCount > 0 || refSets.length > 0) {
      this._alertBlocked(`数据字典「${name}」已定义 ${fieldCount} 个字段、引用 ${refSets.length} 个基础字段集，不能删除。请先清空其字段并移除引用的基础字段集。`)
      return
    }
    if (!(await admConfirm({ title: '删除数据字典', message: `确定删除数据字典「${name}」？此操作不可恢复。`, danger: true }))) return
    this._doc.dictionaryTables = arr.filter((t) => t._uid !== uid)
    if (this._selectedTable === uid) this._selectedTable = this._tableList()[0]?.key || ''
    this._markDirty(); this._render()
  }

  /**
   * content 区字典列表上/下移（调整显示顺序）。列表按 dictKind tab 过滤展示，
   * 而存储数组 dictionaryTables 是各类型混排的全集——移动只在「同 dictKind 的相邻项」间交换
   * 底层数组位置，不影响其它类型字典的相对顺序；顺序随保存落盘（数组序即显示序）。
   */
  _moveDict (uid, dir) {
    if (!uid) return
    const arr = Array.isArray(this._doc?.dictionaryTables) ? this._doc.dictionaryTables : []
    const from = arr.findIndex((t) => t._uid === uid)
    if (from < 0) return
    const kind = dictKindOf(arr[from])
    // 沿移动方向找同 dictKind 的相邻可交换项（跳过其它类型）
    let to = -1
    if (dir < 0) {
      for (let i = from - 1; i >= 0; i--) { if (dictKindOf(arr[i]) === kind) { to = i; break } }
    } else {
      for (let i = from + 1; i < arr.length; i++) { if (dictKindOf(arr[i]) === kind) { to = i; break } }
    }
    if (to < 0) return // 已在本类型首/尾
    ;[arr[from], arr[to]] = [arr[to], arr[from]]
    this._markDirty(); this._render()
  }

  _addField () {
    const entry = this._currentTable()
    if (!entry) return
    const fields = this._activeFieldsArray(entry)  // 汇总表 tab → 汇总表 fields；否则主表 fields
    const newField = { id: '', name: '', caption: { zh_CN: '' }, dataType: 'VARCHAR', fieldLength: 64, nullable: true }
    // 在当前选中字段的下一行插入；未选中（-1）或越界则追加到末尾
    const sel = this._selectedFieldIndex
    const at = (sel >= 0 && sel < fields.length) ? sel + 1 : fields.length
    fields.splice(at, 0, newField)
    this._selectedFieldIndex = at
    this._markDirty(); this._render()
  }

  async _removeField (index) {
    const entry = this._currentTable()
    const fields = this._tableFields(entry)
    const f = fields[index]
    if (!f) return
    if (!(await admConfirm({ title: '删除字段', message: `确定删除字段 ${fieldId(f) || `#${index + 1}`}？`, danger: true }))) return
    const wasPk = isPrimaryKeyField(f)
    const removedName = fieldId(f)
    const prevPk = this._currentPkColumns(entry)
    fields.splice(index, 1)
    // 删除的若是主键列 → 从主键定义(uniqueKeys)里剔除；并清理任何引用了该列的悬空唯一键/索引。
    if (wasPk) this._syncPrimaryKeyDefinition(entry, prevPk)
    this._pruneIndexColumns(entry, removedName)
    if (this._selectedFieldIndex === index) this._selectedFieldIndex = -1
    else if (this._selectedFieldIndex > index) this._selectedFieldIndex -= 1
    this._markDirty(); this._render()
  }

  /** 删除某列后，从该表（主表或汇总表，按当前编辑作用域）所有 uniqueKeys / indexes 项里剔除该列名；
   *  变空的项整条删除并提示，最终无项则删键。DCT/DOC 一致清理（放开旧版 DCT-only 限制：
   *  DOC 删字段后悬空索引引用同样是缺陷——编译层虽会 warn 跳过，但定义内留脏数据）。 */
  _pruneIndexColumns (entry, colName) {
    if (!colName) return
    const sum = this._activeSummary(entry)
    const t = sum || entry?.table
    if (!t) return
    const removed = []
    if (Array.isArray(t.uniqueKeys)) {
      t.uniqueKeys.forEach((uk, i) => {
        const cols = this._ukColumns(uk) || []
        if (cols.length && cols.every((c) => c === colName)) {
          removed.push(`唯一键 ${this._ukName(uk) || `#${i + 1}`} [${cols.join(', ')}]`)
        }
      })
      // 剔除该列；变空整条删除；对象形态保留自定义名
      const next = t.uniqueKeys
        .map((uk) => {
          const cols = this._ukColumns(uk)
          if (!cols) return null
          const kept = cols.filter((c) => c !== colName)
          if (!kept.length) return null
          return Array.isArray(uk) ? kept : { ...uk, columns: kept }
        })
        .filter(Boolean)
      if (next.length) t.uniqueKeys = next
      else delete t.uniqueKeys
    }
    if (Array.isArray(t.indexes)) {
      t.indexes.forEach((ix) => {
        if (ix && Array.isArray(ix.columns) && ix.columns.length && ix.columns.every((c) => c === colName)) {
          removed.push(`索引 ${ix.name || '(自动命名)'} [${ix.columns.join(', ')}]`)
        }
      })
      const next = t.indexes
        .map((ix) => (ix && Array.isArray(ix.columns) ? { ...ix, columns: ix.columns.filter((c) => c !== colName) } : ix))
        .filter((ix) => ix && Array.isArray(ix.columns) && ix.columns.length > 0)
      if (next.length) t.indexes = next
      else delete t.indexes
    }
    if (removed.length) this._message = `字段 ${colName} 删除，已移除引用它的：${removed.join('、')}`
  }

  /** 物理列名 old→new：该表所有 uniqueKeys/indexes 条目原位替换（保持列序），返回替换处数。 */
  _renameIndexColumns (tableLike, oldName, newName) {
    const t = tableLike
    if (!t || !oldName || !newName || oldName === newName) return 0
    let n = 0
    if (Array.isArray(t.uniqueKeys)) {
      for (const uk of t.uniqueKeys) {
        const cols = this._ukColumns(uk)
        if (!cols) continue
        for (let i = 0; i < cols.length; i++) {
          if (cols[i] === oldName) { cols[i] = newName; n++ }
        }
      }
    }
    if (Array.isArray(t.indexes)) {
      for (const ix of t.indexes) {
        if (!ix || !Array.isArray(ix.columns)) continue
        for (let i = 0; i < ix.columns.length; i++) {
          if (ix.columns[i] === oldName) { ix.columns[i] = newName; n++ }
        }
      }
    }
    return n
  }

  /** 记录一次待联动的物理列名改动（input 首次进入捕获最初 oldId；中间态不覆盖，见 _handleChange）。 */
  _beginIdRename (fieldIndex, oldId) {
    if (!oldId) return
    if (!this._pendingIdRename) this._pendingIdRename = { fieldIndex, oldId }
  }

  /** 应用待联动的改名（change/blur 与保存前调用）。 */
  _flushIdRename () {
    const p = this._pendingIdRename
    this._pendingIdRename = null
    if (!p || !p.oldId) return
    const entry = this._currentTable()
    const f = this._tableFields(entry)?.[p.fieldIndex]
    const newId = f ? fieldId(f) : ''
    if (!newId || newId === p.oldId) return
    const target = this._activeSummary(entry) || entry?.table
    const n = this._renameIndexColumns(target, p.oldId, newId)
    if (n) {
      this._markDirty()
      this._message = `物理列 ${p.oldId} → ${newId}，已同步 ${n} 处唯一键/索引引用`
      this._render()
    }
  }

  /** 字段级「唯一」勾选 ↔ 表级 uniqueKeys 单列条目物化（编译层只消费 uniqueKeys 单一事实源）。
   *  勾 → 追加 [col] 单列条目（已存在含该列的复合唯一键 → 告警不叠加，单列唯一语义更强）；
   *  取消 → 删除该列纯单列条目（复合条目不动；主键条目由 isPrimaryKey 勾选管理，不在此删）。 */
  _moveField (index, dir) {
    const entry = this._currentTable()
    const fields = this._tableFields(entry)
    const next = index + dir
    if (!fields[index] || next < 0 || next >= fields.length) return
    ;[fields[index], fields[next]] = [fields[next], fields[index]]
    if (this._selectedFieldIndex === index) this._selectedFieldIndex = next
    else if (this._selectedFieldIndex === next) this._selectedFieldIndex = index
    this._markDirty(); this._render()
  }

  async _copyGroupFields (groupKey) {
    const entry = this._currentTable()
    const group = this._fieldGroups(entry).find((g) => g.key === groupKey)
    if (!group) return
    try {
      await writeFieldClipboard(createFieldClipboardPayload({
        source: `CMXPortalManager.${this._kind}.FieldGroup`,
        fields: group.fields || [],
        groups: [],
      }))
      this._message = `已复制「${group.label}」${(group.fields || []).length} 个字段`
      this._render()
    } catch (err) {
      showDefError('复制字段失败', err)
    }
  }

  async _pasteGroupFields (groupKey) {
    const entry = this._currentTable()
    const group = this._fieldGroups(entry).find((g) => g.key === groupKey)
    if (!entry || !group?.editable) return
    try {
      const payload = await readFieldClipboard()
      entry.table.fields = Array.isArray(payload.fields) ? payload.fields : []
      this._selectedFieldIndex = -1
      this._message = `已粘贴 ${entry.table.fields.length} 个字段到「${group.label}」`
      this._markDirty()
      this._render()
    } catch (err) {
      showDefError('粘贴字段失败', err, { helpCode: 'DEF_FIELD_PASTE_FAILED' })
    }
  }

  _fieldsJsonText (entry) {
    // 显示整张表对象（含 fields、summaries 汇总表、level/tableName 等表级信息），而非仅 fields
    return JSON.stringify(entry?.table && typeof entry.table === 'object' ? entry.table : {}, null, 2)
  }

  _formatFieldsJson () {
    try {
      const parsed = JSON.parse(this._getFieldsJsonText() || '{}')
      this._setFieldsJsonText(JSON.stringify(parsed, null, 2))
      this._fieldsJsonMessage = 'JSON 已格式化'
      this._syncFieldsJsonStatus()
    } catch (err) {
      this._fieldsJsonMessage = `JSON 解析失败：${err instanceof Error ? err.message : String(err)}`
      this._syncFieldsJsonStatus(true)
    }
  }

  _applyFieldsJson () {
    const entry = this._currentTable()
    if (!entry || !entry.table) return
    try {
      const parsed = JSON.parse(this._getFieldsJsonText() || '{}')
      const table = entry.table
      if (Array.isArray(parsed)) {
        // 向后兼容：纯字段数组 → 只更新 fields
        table.fields = parsed.map((f) => (f && typeof f === 'object' && !Array.isArray(f)) ? clonePlain(f) : {})
      } else if (parsed && typeof parsed === 'object') {
        // 整张表对象（含 fields / summaries / level / tableName 等）→ 就地替换全部键（保持引用不变）
        const next = clonePlain(parsed)
        for (const k of Object.keys(table)) delete table[k]
        Object.assign(table, next)
        if (!Array.isArray(table.fields)) table.fields = []
      } else {
        throw new Error('JSON 必须是表对象，或字段数组')
      }
      if (this._selectedFieldIndex >= (Array.isArray(table.fields) ? table.fields.length : 0)) this._selectedFieldIndex = -1
      this._fieldsJsonMessage = 'JSON 已应用到当前表定义'
      // 应用后跑索引校验：不阻断（JSON 手编场景），问题透出到状态条提醒
      const idxDiag = this._validateIndexes()
      if (idxDiag.errors.length) this._fieldsJsonMessage = `JSON 已应用，但存在索引问题：${idxDiag.errors[0].table} ${idxDiag.errors[0].message}`
      else if (idxDiag.warnings.length) this._fieldsJsonMessage = `JSON 已应用；提示：${idxDiag.warnings[0]}`
      this._markDirty(); this._render()
    } catch (err) {
      this._fieldsJsonMessage = `JSON 应用失败：${err instanceof Error ? err.message : String(err)}`
      this._syncFieldsJsonStatus(true)
    }
  }

  _syncFieldsJsonStatus (isError = false) {
    const status = this.shadowRoot.getElementById('fields-json-status')
    if (!status) return
    status.textContent = this._fieldsJsonMessage || ''
    status.dataset.tone = isError ? 'err' : 'ok'
  }

  _getFieldsJsonText () {
    if (this._fieldsJsonCm) return this._fieldsJsonCm.state.doc.toString()
    const el = this.shadowRoot.getElementById('fields-json-editor')
    return el instanceof HTMLTextAreaElement ? el.value : ''
  }

  _setFieldsJsonText (text) {
    if (this._fieldsJsonCm) {
      const doc = this._fieldsJsonCm.state.doc
      this._fieldsJsonCm.dispatch({ changes: { from: 0, to: doc.length, insert: text } })
      return
    }
    const el = this.shadowRoot.getElementById('fields-json-editor')
    if (el instanceof HTMLTextAreaElement) el.value = text
  }

  _destroyFieldsJsonEditor () {
    if (!this._fieldsJsonCm) return
    try { this._fieldsJsonCm.destroy() } catch { /* noop */ }
    this._fieldsJsonCm = null
    this._fieldsJsonCmHost = null
  }

  async _initFieldsJsonEditor (entry) {
    if (!entry || this._fieldsPanelTab !== 'json' || this._fieldsJsonCm || this._fieldsJsonCmLoading) return
    const host = this.shadowRoot.getElementById('fields-json-cm-host')
    if (!(host instanceof HTMLElement)) return
    this._fieldsJsonCmHost = host
    this._fieldsJsonCmLoading = true
    try {
      const cm = await loadCodeMirrorJsonBundle()
      if (!this.isConnected || this._fieldsPanelTab !== 'json' || this._fieldsJsonCm || !host.isConnected) return
      const { EditorView, EditorState, basicSetup, keymap, indentWithTab, json, oneDark } = cm
      const exts = [
        basicSetup,
        json(),
        keymap.of([indentWithTab]),
        cmxJsonTheme(EditorView),
        EditorView.lineWrapping,
      ]
      if (isDarkUi5Theme()) exts.push(oneDark)
      this._fieldsJsonCm = new EditorView({
        parent: host,
        root: this.shadowRoot,
        state: EditorState.create({ doc: this._fieldsJsonText(entry), extensions: exts }),
      })
      const fallback = this.shadowRoot.getElementById('fields-json-editor')
      if (fallback instanceof HTMLTextAreaElement) fallback.hidden = true
    } catch {
      const fallback = this.shadowRoot.getElementById('fields-json-editor')
      if (fallback instanceof HTMLTextAreaElement) fallback.hidden = false
    } finally {
      this._fieldsJsonCmLoading = false
    }
  }

  // ─── 对外（panels / source 委托）────────────────────────────────────────

  handlePanelClick (e) { this._handleClick(e) }
  handlePanelInput (e) { this._handleInput(e) }
  handlePanelChange (e) {
    const el = e.target
    if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement)) return
    if (!el.dataset.fieldPath) return
    const raw = (el instanceof HTMLInputElement && el.type === 'checkbox') ? el.checked : el.value
    this._updateFieldByPath(el.dataset.fieldPath, raw, el.dataset.valueType)
    if (el.dataset.fieldPath === 'edit.mode') this._bus.emitState(true)
  }
  getSourceText () { return JSON.stringify(this._doc || {}, null, 2) }
  updateSourceText (text) {
    try { this._doc = JSON.parse(text || '{}'); this._dirty = true; this._render() }
    catch { this._dirty = true; this._syncToolbar() }
  }

  /** Schema 视图：当前定义的完整展开 schema（只读）。 */
  getSchemaText () {
    return JSON.stringify(buildDefinitionResolvedSchema(this._doc, this._kind, this._baseFieldSets), null, 2)
  }

  /** 检查器面板正文：DCT=字典表信息；BASE=字段集信息；DOC=层级信息。 */
  /** 字段详编面板：当前表本表定义字段中 _selectedFieldIndex 指向的字段的完整属性编辑。 */
  _renderFieldDetailHtml () {
    const entry = this._currentTable()
    const fields = this._tableFields(entry)
    const f = fields[this._selectedFieldIndex]
    if (!f) { this._selectedFieldIndex = -1; return null }
    const i = this._selectedFieldIndex
    // 详编面板由统一 schema 渲染器产出（data-field-path 规范 key），事件经适配器写回本端存储键。
    // unique 排除：唯一约束的事实源已收口到表级 uniqueKeys（「索引」页统一维护），字段面板不再提供勾选。
    const panelHtml = renderFieldPanel(f, { end: this._schemaEnd(), adapter: this._fieldAdapter(), ctx: this._fieldCtx(entry), exclude: ['unique'] })
    return `<div class="inspect-body">
      <section class="section">
        <h3>字段属性 · ${escHtml(fieldId(f) || `#${i + 1}`)}
          <button class="link-back" data-action="field-detail-back" title="返回表信息">返回</button>
        </h3>
        <div class="item-sub">字段名、类型、长度等基本属性在表格列上直接编辑；以下为扩展属性，均可选。</div>
      </section>
      ${panelHtml}
    </div>`
  }

  /** 引用字段覆盖详编面板：渲染有效字段（base ⊕ override）的详编，控件 data-field-path 走覆盖写回路径。 */
  _renderRefFieldDetailHtml () {
    const entry = this._currentTable()
    const t = entry?.table
    const sel = this._selectedRef
    if (!t || !sel || !this._refWorking) { this._selectedRef = null; return null }
    const base = (this._resolveSetFields(sel.setName) || []).find((f) => fieldId(f) === sel.fieldId)
    if (!base) { this._selectedRef = null; return null }
    const overrides = normalizeFieldOverrides(t.fieldOverrides, t.fieldRefDicts)
    const ov = overrideForField(overrides, sel.fieldId, sel.setName)
    const ovCount = ov ? Object.keys(ov).length : 0
    // 有效字段进面板：schema 渲染器输出 data-field-path 控件；_handleInput 里 _selectedRef 置位 → 走覆盖写回。
    // unique 排除：与主字段面板一致（事实源在表级 uniqueKeys）。
    const panelHtml = renderFieldPanel(this._refWorking, { end: this._schemaEnd(), adapter: this._fieldAdapter(), ctx: this._fieldCtx(entry), exclude: ['unique'] })
    return `<div class="inspect-body">
      <section class="section">
        <h3>引用字段覆盖 · ${escHtml(sel.fieldId)}
          <button class="link-back" data-action="field-detail-back" title="返回表信息">返回</button>
        </h3>
        <div class="item-sub">来自字段集 <b>${escHtml(sel.setName)}</b>（base 只读）。以下修改仅作为本表的<b>覆盖</b>保存，不改动 base；物理类型/身份不可覆盖，显示精度可改。${ovCount ? `已覆盖 <b>${ovCount}</b> 项。` : ''}
          ${ovCount ? `<button class="link-back" data-action="reset-ref-field" data-set="${escAttr(sel.setName)}" data-fid="${escAttr(sel.fieldId)}" title="清除所有覆盖，还原为 base">还原为 base</button>` : ''}
        </div>
      </section>
      ${panelHtml}
    </div>`
  }

  /** codeRule 对象摘要（DOC 引用字典只读展示用，避免对象当字符串显示 [object Object]）。 */
  codeRuleSummary (cr) {
    if (cr == null || cr === '') return '-'
    if (typeof cr === 'object') return [cr.mode, cr.pattern && `/${cr.pattern}/`, cr.ruleCode].filter(Boolean).join(' · ')
    return String(cr)
  }

  _renderDocDictInspectorHtml () {
    const code = this._selectedDocDictCode
    const t = code ? this._dictTableMap?.[code] : null
    if (!t) return '<div class="inspect-body"><div class="item-sub">请先在中间字典列表选择一个字典。</div></div>'
    const meta = t.dictMeta || {}
    const refs = [
      ...Object.entries(t).filter(([k, v]) => k.endsWith('FieldSet') && typeof v === 'string').map(([, v]) => v),
      ...(Array.isArray(t.extraFieldSets) ? t.extraFieldSets : []),
    ]
    const fields = Array.isArray(t.fields) ? t.fields : []
    const val = (v) => v == null || v === '' ? '—' : String(v)
    const codeRuleSummary = (cr) => this.codeRuleSummary(cr)
    return `<div class="inspect-body">
      <section class="section">
        <h3>表信息（字典）</h3>
        <div class="kv">
          <label>字典编码</label><input value="${escAttr(val(meta.dictCode || code))}" readonly>
          <label>字典名称</label><input value="${escAttr(val(meta.dictName || this._dictNameMap?.[code]))}" readonly>
          <label>字典类型</label><input value="${escAttr(dictKindLabel(dictKindOf(t)))}" readonly>
          <label>物理表</label><input value="${escAttr(val(meta.tableName || t.tableName))}" readonly>
          <label>主键字段</label><input value="${escAttr(val(meta.idField))}" readonly>
          <label>编码字段</label><input value="${escAttr(val(meta.codeField))}" readonly>
          <label>显示字段</label><input value="${escAttr(val(meta.labelField))}" readonly>
          <label>是否分级</label><input value="${meta.selfHierarchy ? '是' : '否'}" readonly>
          <label>编码规则</label><input value="${escAttr(codeRuleSummary(meta.codeRule))}" readonly>
        </div>
      </section>
      <section class="section">
        <h3>引用字段集</h3>
        ${refs.length ? `<div class="chips">${refs.map((f) => `<button class="chip chip-btn" data-action="show-doc-dict-fieldset" data-dict-code="${escAttr(code)}" data-field-set="${escAttr(String(f))}">${escHtml(String(f))}</button>`).join('')}</div>` : '<div class="item-sub">无</div>'}
      </section>
      <section class="section">
        <h3>本表字段（${fields.length}）</h3>
        ${fields.length ? this._renderReadonlyDictFieldsTable(fields) : '<div class="item-sub">无</div>'}
      </section>
      ${this._renderDocDictFieldSetDialog()}
    </div>`
  }

  _renderDocDictFieldSetDialog () {
    const detail = this._docDictFieldSetDetail
    if (!detail?.dictCode || !detail?.fieldSet) return ''
    const fields = this._dictFieldSetMap?.[detail.dictCode]?.[detail.fieldSet] || []
    return `<div class="fieldset-dialog-backdrop">
      <section class="fieldset-dialog">
        <div class="fieldset-dialog-head">
          <h3>${escHtml(detail.fieldSet)}</h3>
          <button class="link-back" data-action="close-doc-dict-fieldset" title="关闭">关闭</button>
        </div>
        ${fields.length ? this._renderReadonlyFieldSetFieldsTable(fields) : '<div class="item-sub">该字段集未解析到字段。</div>'}
      </section>
    </div>`
  }

  _renderReadonlyFieldSetFieldsTable (fields) {
    return `<table class="ro-fields fieldset-fields">
      <thead><tr><th>ID</th><th>Name</th><th>标题</th><th>类型</th><th>长度</th><th>整数位</th><th>小数位</th><th>可空</th><th>主键</th><th>维度类型</th><th>引用字典</th></tr></thead>
      <tbody>${fields.map((f) => `<tr>
        <td>${escHtml(fieldId(f))}</td>
        <td>${escHtml(f.name || '')}</td>
        <td>${escHtml(fieldCaption(f))}</td>
        <td>${escHtml(f.dataType || '')}</td>
        <td>${escHtml(f.fieldLength == null ? '' : String(f.fieldLength))}</td>
        <td>${escHtml(f.intDigits == null ? '' : String(f.intDigits))}</td>
        <td>${escHtml(f.decimalDigits == null ? '' : String(f.decimalDigits))}</td>
        <td>${f.nullable ? '是' : '否'}</td>
        <td style="text-align:center">${isPrimaryKeyField(f) ? '<b class="pk-yes" title="主键">✓</b>' : ''}</td>
        <td>${escHtml(f.dimType || '')}</td>
        <td>${escHtml(f.refDict || '')}</td>
      </tr>`).join('')}</tbody>
    </table>`
  }

  _renderReadonlyDictFieldsTable (fields) {
    return `<table class="ro-fields">
      <thead><tr><th>ID</th><th>Name</th><th>Caption</th><th>DataType</th><th>长度</th></tr></thead>
      <tbody>${fields.map((f) => `<tr>
        <td>${escHtml(fieldId(f))}</td>
        <td>${escHtml(f.name || '')}</td>
        <td>${escHtml(fieldCaption(f))}</td>
        <td>${escHtml(f.dataType || '')}</td>
        <td>${escHtml(f.fieldLength == null ? '' : String(f.fieldLength))}</td>
      </tr>`).join('')}</tbody>
    </table>`
  }

  renderInspectorPanelHtml () {
    if (!this._doc) return '<div class="inspect-body"><div class="item-sub">请先选择一个定义文件。</div></div>'
    // 引用字段覆盖详编（与自有字段详编互斥）：base ⊕ override 的有效字段，改动写 fieldOverrides。
    if (this._selectedRef) {
      const detail = this._renderRefFieldDetailHtml()
      if (detail) return detail
    }
    // 字段详编：点击字段行「更多属性」后，展示该字段的完整属性编辑
    if (this._selectedFieldIndex >= 0) {
      const detail = this._renderFieldDetailHtml()
      if (detail) return detail
    }
    // DOC：左侧选的是层级 → 展示层级信息（层级代码/名称 + 该层表清单）
    if (this._kind === 'DOC') {
      if ((this._selectedDocTopTab || 'levels') !== 'levels') return this._renderDocDictInspectorHtml()
      const level = this._selectedTable || this._docLevels()[0]
      if (!level) return '<div class="inspect-body"><div class="item-sub">该单据没有层级，请在源码视图编辑。</div></div>'
      this._ensureDefaultParentTables(level)
      const lt = this._docLevelTables(level)
      const lvName = this._docLevelName(level)
      const cur = this._currentDocTable()
      return `<div class="inspect-body">
        <section class="section">
          <h3>层级信息</h3>
          <div class="kv">
            <label>层级代码</label><input value="${escAttr(level)}" readonly>
            <label>层级名称</label><input data-level-name="${escAttr(level)}" value="${escAttr(lvName)}" placeholder="如：凭证头">
            <label>表数量</label><input value="${lt.length}" readonly>
          </div>
        </section>
        <section class="section">
          <h3>本层表（${lt.length}）</h3>
          ${lt.length ? `<div class="lvl-tables">${lt.map((x) => `<div class="lvl-table ${x.key === cur?.key ? 'active' : ''}">
            <div class="lt-row"><label>表名</label><input data-vt-index="${x.gIndex}" data-vt-prop="tableAlias" value="${escAttr(x.table.tableAlias || '')}" placeholder="中文名"></div>
            <div class="lt-row"><label>ID</label><input data-vt-index="${x.gIndex}" data-vt-prop="tableName" value="${escAttr(x.table.tableName || '')}" placeholder="物理表名"></div>
            ${this._renderDocParentTableEditor(x, level)}
            ${this._renderDocCodeRuleEditor(x)}
            <div class="lt-meta">${(x.table.fields || []).length} 字段 · 层级 ${escHtml(x.table.level || level)}</div>
          </div>`).join('')}</div>` : '<div class="item-sub">无</div>'}
          <div class="item-sub" style="margin-top:6px">在中间「字段」区切换表标签可编辑各表字段。</div>
        </section>
      </div>`
    }
    const entry = this._currentTable()
    if (!entry) return '<div class="inspect-body"><div class="item-sub">该定义文件没有可编辑的项。</div></div>'
    const t = entry.table
    if (this._isBase()) {
      const includes = Array.isArray(t.includeFieldSets) ? t.includeFieldSets : []
      return `<div class="inspect-body">
        <section class="section">
          <h3>字段集信息</h3>
          <div class="kv">
            <label>名称</label><input value="${escAttr(entry.key)}" readonly>
            <label>类型</label><input value="${includes.length ? '组合(includeFieldSets)' : '字段集'}" readonly>
            <label>说明</label><input data-table-prop="remark" value="${escAttr(t.remark || '')}">
          </div>
        </section>
        ${includes.length ? `<section class="section"><h3>组合引用</h3><div class="chips">${includes.map((f) => `<span class="chip">${escHtml(String(f))}</span>`).join('')}</div><div class="item-sub" style="margin-top:6px">该字段集等价于上述字段集的并集。</div></section>` : ''}
      </div>`
    }
    const meta = (t.dictMeta || {})
    const maxLevel = Math.max(1, Math.min(9, Number(meta.maxLevel || 1)))
    const rows = [
      { path: 'dictMeta.dictCode', label: '字典编码', value: meta.dictCode },
      { path: 'dictMeta.dictName', label: '字典名称', value: meta.dictName },
      { path: 'dictMeta.dictKind', label: '字典类型', value: dictKindOf(t), type: 'select', options: DICT_KINDS.map((d) => ({ value: d.value, label: d.label })) },
      { path: 'dictMeta.tableName', label: '物理表', value: meta.tableName },
      { path: 'dictMeta.idField', label: '主键字段', value: meta.idField ?? '', placeholder: '选填，如 id' },
      { path: 'dictMeta.codeField', label: '编码字段', value: meta.codeField ?? '', placeholder: '选填，如 code' },
      { path: 'dictMeta.labelField', label: '显示字段', value: meta.labelField ?? '', placeholder: '选填，如 name' },
      {
        path: 'dictMeta.dataPermissionAttribute',
        label: '数据权限',
        value: meta.dataPermissionAttribute || '',
        type: 'select',
        options: [
          { value: '', label: '不设置' },
          { value: 'organization', label: '组织规则' },
          { value: 'role', label: '角色规则' },
          { value: 'user', label: '用户规则' },
        ],
      },
      { path: 'dictMeta.selfHierarchy', label: '是否分级', value: !!meta.selfHierarchy, type: 'checkbox' },
    ]
    if (meta.selfHierarchy) {
      rows.push(
        { path: 'dictMeta.maxLevel', label: '最大层级', value: maxLevel, type: 'number', min: 1, max: 9, step: 1 },
        { path: 'dictMeta.codeStructure', label: '编码结构', value: meta.codeStructure || '', type: 'digitString', maxLength: maxLevel },
      )
    }
    const _cr = (typeof meta.codeRule === 'object' && meta.codeRule) ? meta.codeRule : { mode: 'manual', field: meta.codeField || 'code' }
    rows.push({ path: 'dictMeta.codeRule', label: '编码规则', type: 'coderule',
      value: _cr.pattern || '', mode: _cr.mode || 'manual', codeField: meta.codeField || 'code',
      ruleCode: _cr.ruleCode || '', enableGap: _cr.enableGap || false })
    const fieldSetRefs = Object.entries(t).filter(([k]) => k.endsWith('FieldSet')).map(([, v]) => v)
    const extraSets = Array.isArray(t.extraFieldSets) ? t.extraFieldSets : []
    const allSetRefs = [...fieldSetRefs, ...extraSets]
    // 当前定义文件坐标（用于跳转字典数据维护页）
    const sel = this._selected || {}
    const maintainBtn = meta.dictCode ? `
      <div style="margin:6px 0;padding:6px 10px;background:var(--sapInformationBackground,#eaf4ff);border:1px solid var(--sapInformationBorderColor,#bcd8f7);border-radius:3px">
        <button class="link-back" data-action="maintain-dict-data"
                data-dict-code="${escAttr(meta.dictCode || '')}"
                data-domain="${escAttr(sel.domain || '')}"
                data-application="${escAttr(sel.application || sel.app || '')}"
                data-module="${escAttr(sel.module || '')}"
                style="background:transparent;border:none;color:var(--sapInformationColor,#0854a0);cursor:pointer;padding:0;font-size:13px;text-decoration:underline">
          → 维护该字典数据（${escHtml(meta.dictCode)}）
        </button>
      </div>` : ''
    return `<div class="inspect-body">
      <section class="section">
        <h3>表信息（字典）</h3>
        ${maintainBtn}
        <div class="kv">${rows.map((row) => this._renderDictMetaEditor(row)).join('')}</div>
      </section>
      ${isRelationDict(t) ? this._renderRelationPanel(t, entry) : ''}
      <section class="section">
        <h3>引用字段集</h3>
        ${allSetRefs.length ? `<div class="chips">${allSetRefs.map((f) => `<span class="chip">${escHtml(String(f))}</span>`).join('')}</div>` : '<div class="item-sub">无</div>'}
        <div class="item-sub" style="margin-top:6px">这些公共字段集定义在 base 文件，建表时与本表 fields 合并。</div>
      </section>
      <section class="section">
        <h3>说明</h3>
        <div class="item-sub">${escHtml(meta.remark || t.remark || '—')}</div>
      </section>
    </div>`
  }

  /**
   * 关系字典专属配置面板：选主/辅字典 + 值列/显示列 + 基数（只读多对多）+ 成员唯一。
   * 写回走通用 data-table-prop（dictMeta.relation.*，_updateTableProp 支持点路径）；
   * 保存时 relation 由 applyRelationCompile 编译为两个 dimension 槽的 refDict（见 _materializeAllTables）。
   */
  _renderRelationPanel (t, entry) {
    const rel = (t.dictMeta && typeof t.dictMeta.relation === 'object') ? t.dictMeta.relation : {}
    const master = (rel.master && typeof rel.master === 'object') ? rel.master : {}
    const aux = (rel.auxiliary && typeof rel.auxiliary === 'object') ? rel.auxiliary : {}
    const dictOpts = this._refDictOptions(entry)   // ['', ...可引用字典编码]（DCT 排除自身）
    const dictSelect = (path, value) => `<select data-table-prop="${escAttr(path)}">
      ${dictOpts.map((code) => `<option value="${escAttr(code)}" ${code === (value || '') ? 'selected' : ''}>${code ? `${escHtml(this._dictNameMap?.[code] || code)}（${escHtml(code)}）` : '（未选择）'}</option>`).join('')}
    </select>`
    const fieldSelect = (path, refDict, value, fallback) => {
      const opts = this._refDictFieldOptions(refDict)
      const cur = value || fallback || ''
      // 字典字段清单未知时，至少给出常见 code/name 兜底，避免下拉空白
      const list = opts.length > 1 ? opts : ['', 'code', 'name']
      return `<select data-table-prop="${escAttr(path)}">
        ${list.map((f) => `<option value="${escAttr(f)}" ${f === cur ? 'selected' : ''}>${f ? escHtml(f) : '（默认）'}</option>`).join('')}
      </select>`
    }
    const s = RELATION_SLOTS
    return `<section class="section relation-panel">
      <h3>关系绑定</h3>
      <div class="kv">
        <label>主·分组字典</label>${dictSelect('dictMeta.relation.master.dict', master.dict)}
        <label>主·值列</label>${fieldSelect('dictMeta.relation.master.valueField', master.dict, master.valueField, 'code')}
        <label>主·显示列</label>${fieldSelect('dictMeta.relation.master.labelField', master.dict, master.labelField, 'name')}
        <label>辅·业务字典</label>${dictSelect('dictMeta.relation.auxiliary.dict', aux.dict)}
        <label>辅·值列</label>${fieldSelect('dictMeta.relation.auxiliary.valueField', aux.dict, aux.valueField, 'code')}
        <label>辅·显示列</label>${fieldSelect('dictMeta.relation.auxiliary.labelField', aux.dict, aux.labelField, 'name')}
        <label>基数</label><input value="多对多（many-to-many）" readonly title="当前仅支持多对多">
        <label>成员唯一</label><input type="checkbox" data-table-prop="dictMeta.relation.uniqueMember" data-value-type="boolean" ${rel.uniqueMember !== false ? 'checked' : ''}>
      </div>
      <div class="item-sub" style="margin-top:6px">主字典节点绑到 <code>${escHtml(s.master.idField)}</code>，辅字典条目绑到 <code>${escHtml(s.auxiliary.idField)}</code>；保存时自动编译为字段级 refDict。</div>
    </section>`
  }

  _renderDictMetaEditor (row) {
    const path = escAttr(row.path)
    const label = escHtml(row.label)
    if (row.type === 'checkbox') {
      return `<label>${label}</label><input type="checkbox" data-table-prop="${path}" data-value-type="boolean" ${row.value ? 'checked' : ''}>`
    }
    if (row.type === 'number') {
      const min = Number(row.min || 1)
      const max = Number(row.max || 9)
      const step = Number(row.step || 1)
      const value = Math.max(min, Math.min(max, Number(row.value || min)))
      return `<label>${label}</label><input type="number" data-table-prop="${path}" data-value-type="number" min="${min}" max="${max}" step="${step}" value="${escAttr(String(value))}">`
    }
    if (row.type === 'digitString') {
      const maxLength = Math.max(1, Math.min(9, Number(row.maxLength || 9)))
      const value = String(row.value == null ? '' : row.value).replace(/\D/g, '').slice(0, maxLength)
      return `<label>${label}</label><input data-table-prop="${path}" data-value-type="digitString" inputmode="numeric" pattern="[0-9]*" maxlength="${maxLength}" value="${escAttr(value)}">`
    }
    if (row.type === 'select') {
      const value = String(row.value == null ? '' : row.value)
      const options = Array.isArray(row.options) ? row.options : []
      return `<label>${label}</label><select data-table-prop="${path}">${options.map((opt) => `<option value="${escAttr(opt.value)}" ${String(opt.value) === value ? 'selected' : ''}>${escHtml(opt.label)}</option>`).join('')}</select>`
    }
    if (row.type === 'coderule') {
      const mode = row.mode || 'manual'
      const codeField = escAttr(row.codeField || 'code')
      // 与 DOC 侧 _renderDocCodeRuleEditor 完全同款：每行一个 .lt-row + label + 一个控件
      let html = `<div class="lt-row"><label>编码字段</label><input data-coderule-field value="${codeField}" placeholder="如 code"></div>`
      html += `<div class="lt-row"><label>编码规则</label><select data-coderule-mode>
        <option value="manual" ${mode==='manual'?'selected':''}>手动录入(校验正则)</option>
        <option value="auto" ${mode==='auto'?'selected':''}>自动生成(段引擎)</option>
      </select></div>`
      if (mode === 'manual') {
        html += `<div class="lt-row"><label>格式校验</label><input data-coderule-pattern placeholder="校验录入格式，如 ^[A-Z]{3}\\d{4}$" title="正则表达式，用于校验用户手动录入的编码是否符合规则（保存时校验）" value="${escAttr(row.value||'')}"></div>`
      } else {
        html += `<div class="lt-row"><label title="选择编码引擎中已配置的规则，保存时由引擎自动生成编码并回填">规则码</label><select data-coderule-rulecode>${this._codeRuleOptions(row.ruleCode || '')}</select></div>`
        html += `<div class="lt-row"><label title="启用后删除/作废单据产生的断号会被回收利用，保证流水连续">连号补偿</label><input type="checkbox" data-coderule-enablegap ${row.enableGap?'checked':''}></div>`
        html += `<div class="lt-row"><label>兜底校验</label><input data-coderule-pattern placeholder="可选，引擎生成失败时校验" title="可选正则，当编码引擎生成失败、回退为手动录入时用于校验格式" value="${escAttr(row.value||'')}"></div>`
      }
      // 容器占满 .kv 整行（grid-column:1/-1），内部用 .lt-row 垂直排列
      return `<div class="cmx-coderule-edit" data-table-prop="${path}" data-cur-mode="${mode}" style="grid-column:1/-1;display:flex;flex-direction:column;gap:6px">${html}</div>`
    }
    return `<label>${label}</label><input data-table-prop="${path}"${row.placeholder ? ` placeholder="${escAttr(row.placeholder)}"` : ''} value="${escAttr(row.value == null ? '' : String(row.value))}">`
  }

  // ─── 渲染 ────────────────────────────────────────────────────────────────

  _render () {
    const scrollState = this._captureScrollState()
    this._destroyFieldsJsonEditor()
    const tables = this._tableList()
    // DCT：按当前字典类型 tab 过滤出本类字典；选中态在本类范围内归一
    const dctTables = this._kind === 'DCT' ? tables.filter((t) => dictKindOf(t.table) === this._selectedDictTab) : tables
    // 初始化选中：DCT/BASE 选中表/字段集；DOC 选中层级
    if (this._kind === 'DCT') {
      if (dctTables.length && !dctTables.some((t) => t.key === this._selectedTable)) this._selectedTable = dctTables[0].key
      else if (!dctTables.length) this._selectedTable = ''
    } else if (tables.length && !tables.some((t) => t.key === this._selectedTable)) this._selectedTable = tables[0].key
    const entry = this._currentTable()
    // 切表/切层后若当前是某个已不存在的汇总表 Tab，回退到字段定义
    if (typeof this._fieldsPanelTab === 'string' && this._fieldsPanelTab.startsWith('summary:')) {
      const sid = this._fieldsPanelTab.slice('summary:'.length)
      if (!this._isDocLike() || !this._tableSummaries(entry).some((s) => s.id === sid)) this._fieldsPanelTab = 'fields'
    }
    const kindLabel = this._kindLabel()
    const tablesLabel = this._isBase() ? '字段集' : (this._kind === 'DOC' ? '层级' : '字典')
    const nativeColorScheme = portalNativeColorScheme()
    // eslint-disable-next-line no-restricted-syntax -- 动态值均经 escHtml/escAttr。
    this.shadowRoot.innerHTML = `
      <style>
        ${defBaseNeoStyleBlock(this._kind)}
        ${ADM_ALL_CSS}
        :host{display:block;height:100%;min-height:0;background:var(--sapBackgroundColor,#fff);color:var(--sapTextColor,#1d2d3e);font-family:var(--sapFontFamily,Arial,sans-serif);color-scheme:${nativeColorScheme};--cmx-selection-color:var(--neo-cyan,#00b4d8);--cmx-selection-border:color-mix(in srgb,var(--cmx-selection-color) 54%,var(--sapGroup_ContentBackground,#fff));--cmx-selection-bg:color-mix(in srgb,var(--cmx-selection-color) 12%,var(--sapGroup_ContentBackground,#fff));--cmx-selection-bg-soft:color-mix(in srgb,var(--cmx-selection-color) 8%,var(--sapGroup_ContentBackground,#fff));--cmx-selection-text:color-mix(in srgb,var(--cmx-selection-color) 78%,var(--sapTextColor,#1d2d3e));--cmx-splitter-grip:color-mix(in srgb,var(--sapInformationColor,#0a6ed1) 38%,var(--sapContent_LabelColor,#6a6d70));--cmx-splitter-grip-width:30px}
        .main{display:flex;flex-direction:column;height:100%;min-height:0}
        .panel-head{height:40px;display:flex;align-items:center;gap:8px;padding:0 10px;border-bottom:1px solid var(--sapGroup_TitleBorderColor,#d9d9d9);box-sizing:border-box}
        .title{font-weight:700;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .spacer{flex:1}
        .ver-control{display:flex;align-items:center;gap:4px;flex:0 0 auto;padding:2px 4px 2px 8px;border:1px solid var(--sapGroup_TitleBorderColor,#d9d9d9);border-radius:6px;background:var(--sapList_HeaderBackground,#f7f7f7)}
        .ver-control .ver-label{font-size:12px;color:var(--sapContent_LabelColor,#6a6d70);white-space:nowrap;flex:0 0 auto}
        .panel-head>.ver-label{font-size:13px;font-weight:700;color:var(--sapTextColor,#1d2d3e);flex:0 0 auto}
        .embed-doc-select{height:26px;max-width:320px;border:1px solid var(--sapField_BorderColor,#89919a);border-radius:4px;padding:0 6px;background:var(--sapField_Background,#fff);color:inherit;font-size:12px;cursor:pointer}
        :host([data-readonly]) .body input:not([data-ver-select]):not([data-embed-doc]),:host([data-readonly]) .body select:not([data-ver-select]):not([data-embed-doc]),:host([data-readonly]) .body textarea{pointer-events:none;background:var(--sapField_ReadOnly_Background,rgba(0,0,0,.02))}
        :host([data-readonly]) .body input[type=checkbox]{opacity:.7}
        :host([data-readonly]) .icon-btn.danger,:host([data-readonly]) [data-action="add-field"],:host([data-readonly]) [data-action="add-dict"],:host([data-readonly]) [data-action="add-summary"],:host([data-readonly]) [data-action="add-level"],:host([data-readonly]) [data-action="add-doc-table"]{display:none!important}
        .ver-control .ver-select{height:24px;max-width:220px;border:0;background:transparent;padding:0 4px;font-size:12px;color:inherit;cursor:pointer}
        .ver-control .icon-btn{width:22px;height:22px}
        .ver-control .icon-btn ui5-icon{width:14px;height:14px}
        .ver-dialog{width:min(440px,96vw)}
        .ver-form{display:grid;grid-template-columns:72px minmax(0,1fr);gap:10px 8px;align-items:center;font-size:13px;padding:4px 2px}
        .ver-form label{color:var(--sapContent_LabelColor,#6a6d70)}
        .ver-form input{height:30px;border:1px solid var(--sapField_BorderColor,#89919a);border-radius:4px;padding:0 8px;background:var(--sapField_Background,#fff);color:inherit;box-sizing:border-box;width:100%}
        .ver-check{display:flex;align-items:center;gap:6px;margin:10px 2px 0;font-size:12px;color:var(--sapTextColor,#1d2d3e);cursor:pointer}
        .ver-check input{width:15px;height:15px;flex:0 0 auto}
        .ver-file-hint{margin:10px 2px 0;font-size:12px;color:var(--sapContent_LabelColor,#6a6d70)}
        .ver-file-hint code{font-family:ui-monospace,Menlo,Consolas,monospace;background:var(--sapList_HeaderBackground,#f0f0f0);padding:1px 6px;border-radius:4px;color:var(--sapTextColor,#1d2d3e)}
        .ver-dialog-foot{display:flex;justify-content:flex-end;margin-top:14px}
        .ver-create-btn{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 14px;border:0;border-radius:6px;background:var(--sapButton_Emphasized_Background,var(--sapHighlightColor,#0a6ed1));color:var(--sapButton_Emphasized_TextColor,#fff);font-size:13px;font-weight:600;cursor:pointer}
        .ver-create-btn ui5-icon{width:15px;height:15px;color:currentColor}
        .ver-create-btn:hover{background:var(--sapButton_Emphasized_Hover_Background,#085caf)}
        .vm-dialog{width:min(640px,96vw)}
        .vm-table{width:100%;border-collapse:collapse;font-size:12px}
        .vm-table th{text-align:left;color:var(--sapContent_LabelColor,#6a6d70);font-weight:600;padding:6px 8px;border-bottom:1px solid var(--sapGroup_TitleBorderColor,#e5e5e5);background:var(--sapList_HeaderBackground,#f7f7f7)}
        .vm-table td{padding:6px 8px;border-bottom:1px solid var(--sapGroup_TitleBorderColor,#eee);vertical-align:middle}
        .vm-table tr.is-current{background:var(--cmx-selection-bg-soft,#f0f7ff)}
        .vm-no{font-weight:700;white-space:nowrap}
        .vm-cur-tag{margin-left:6px;font-size:10px;font-weight:700;background:var(--sapInformationBackground,#eaf4ff);color:var(--sapInformationColor,#0a6ed1);border-radius:8px;padding:0 6px}
        .vm-time{color:var(--sapContent_LabelColor,#6a6d70);font-variant-numeric:tabular-nums;white-space:nowrap}
        .vm-muted{color:var(--sapContent_LabelColor,#9a9d9f)}
        .vm-default-badge{font-weight:700;color:var(--sapPositiveColor,#107e3e);white-space:nowrap}
        .vm-link{border:0;background:transparent;color:var(--sapHighlightColor,#0a6ed1);cursor:pointer;font-size:12px;padding:2px 4px;border-radius:4px}
        .vm-link:hover{background:var(--sapButton_Hover_Background,rgba(0,0,0,.06))}
        .vm-link.danger{color:var(--sapNegativeColor,#bb0000)}
        .vm-link[disabled]{opacity:.4;cursor:default;background:transparent}
        .vm-ops{white-space:nowrap}
        .vm-foot{display:flex;align-items:center;gap:10px;margin-top:14px}
        .vm-hint{flex:1;font-size:11px;color:var(--sapContent_LabelColor,#6a6d70)}
        .fieldset-dialog-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.18);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;z-index:20}
        .fieldset-dialog{max-height:82vh;overflow:auto;border:1px solid var(--sapGroup_TitleBorderColor,#d9d9d9);border-radius:8px;background:var(--sapTile_Background,#fff);box-shadow:0 12px 32px rgba(0,0,0,.2);padding:14px;box-sizing:border-box}
        .fieldset-dialog-head{display:flex;align-items:center;gap:8px;margin-bottom:10px}
        .fieldset-dialog-head h3{margin:0;font-size:15px;font-weight:700}
        .fieldset-dialog-head .link-back{margin-left:auto;font-size:12px;border:1px solid var(--sapButton_BorderColor,#89919a);background:var(--sapButton_Background,#fff);color:var(--sapButton_TextColor,var(--sapTextColor,#1d2d3e));border-radius:4px;padding:3px 10px;cursor:pointer}
        .fieldset-dialog-head .link-back:hover{background:var(--sapButton_Hover_Background,rgba(0,0,0,.06))}
        .body{flex:1;min-height:0;display:flex;flex-direction:column;padding:12px;overflow:hidden;background:var(--sapGroup_ContentBackground,#fafafa);--def-content-top:${Number(this._split.contentY || 34)}%}
        .box{border:1px solid var(--sapGroup_TitleBorderColor,#d9d9d9);border-radius:6px;background:var(--sapTile_Background,#fff);display:flex;flex-direction:column;min-height:0;overflow:hidden}
        .box.tables{flex:0 0 calc(var(--def-content-top) - 6px);min-height:0}
        .box.fields{flex:1 1 0}
        .def-splitter-y{position:relative;touch-action:none;user-select:none;background:transparent;height:12px;min-height:12px;margin:0;cursor:row-resize;flex:0 0 12px}
        .def-splitter-y::after{content:'';position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:var(--cmx-splitter-grip-width,30px);height:3px;border-radius:2px;background:var(--cmx-splitter-grip);opacity:.72;transition:opacity .15s ease}
        .def-splitter-y:hover::after,.def-splitter-y.is-dragging::after{opacity:1}
        .def-splitter-y:focus-visible{outline:2px solid var(--sapContent_FocusColor,#0070f2);outline-offset:-2px}
        .box-head{height:36px;display:flex;align-items:center;gap:8px;padding:0 10px;border-bottom:1px solid var(--sapGroup_TitleBorderColor,#d9d9d9);flex-shrink:0}
        .box-title{font-weight:700;font-size:13px}
        .dict-type-tabs{display:flex;align-items:center;gap:2px;padding:4px 6px 0;border-bottom:1px solid var(--sapGroup_TitleBorderColor,#d9d9d9);flex-shrink:0;flex-wrap:wrap}
        .dict-type-tab{border:1px solid transparent;border-bottom:0;background:transparent;color:var(--sapContent_LabelColor,#6a6d70);cursor:pointer;font:inherit;font-size:12px;padding:5px 10px;border-radius:6px 6px 0 0;display:inline-flex;align-items:center;gap:5px}
        .dict-type-tab:hover{background:var(--sapList_Hover_Background,#f5f6f7)}
        .dict-type-tab.active{color:var(--sapTextColor,#1d2d3e);font-weight:700;background:var(--sapBackgroundColor,#fff);border-color:var(--sapGroup_TitleBorderColor,#d9d9d9);margin-bottom:-1px}
        .dict-type-tab .dt-count{font-size:10px;font-weight:700;background:var(--sapInformationBackground,#eaf4ff);color:var(--sapInformationColor,#0a6ed1);border-radius:9px;padding:0 6px;min-width:16px;text-align:center}
        .dict-type-tab.doc-level-tab{padding:0 4px 0 0;gap:2px}
        .doc-top-label-btn{height:29px;border:0;background:transparent;color:inherit;font:inherit;font-size:12px;font-weight:inherit;display:inline-flex;align-items:center;gap:5px;padding:5px 8px;cursor:pointer}
        .doc-top-tab-label{display:inline-flex;align-items:center;gap:5px}
        .doc-top-tab-actions{display:inline-flex;align-items:center;gap:2px;margin-left:2px}
        .doc-top-tab-actions .icon-btn{width:22px;height:22px}
        .doc-top-tab-actions .icon-btn ui5-icon{width:14px;height:14px}
        .doc-dict-item{display:block;width:100%;text-align:left;border:1px solid transparent;border-bottom-color:var(--sapGroup_TitleBorderColor,#e5e5e5);background:transparent;padding:8px 10px;color:inherit;font-size:12px;box-sizing:border-box;cursor:pointer}
        .doc-dict-item:hover{background:var(--sapList_Hover_Background,#f5f6f7)}
        .doc-dict-item.active{border-color:var(--cmx-selection-border);background:var(--cmx-selection-bg)}
        .doc-dict-title{font-weight:700}
        .doc-dict-sub{margin-top:2px;font-size:11px;color:var(--sapContent_LabelColor,#6a6d70)}
        .box-body{flex:1;min-height:0;overflow:auto}
        table{width:100%;border-collapse:collapse;font-size:12px}
        th,td{border-bottom:1px solid var(--sapGroup_TitleBorderColor,#e5e5e5);padding:4px;vertical-align:middle}
        th{text-align:left;color:var(--sapContent_LabelColor,#6a6d70);font-weight:600;background:var(--sapList_HeaderBackground,#f7f7f7);position:sticky;top:0;z-index:1}
        th.idx,td.idx{width:36px;text-align:center;color:var(--sapContent_LabelColor,#6a6d70);font-variant-numeric:tabular-nums;user-select:none}
        td input,td select{width:100%}
        input,select{height:26px;border:1px solid var(--sapField_BorderColor,#89919a);border-radius:4px;padding:0 6px;background:var(--sapField_Background,#fff);color:var(--sapField_TextColor,var(--sapTextColor,#1d2d3e));box-sizing:border-box;color-scheme:${nativeColorScheme}}
        input[type=number]{color-scheme:${nativeColorScheme};accent-color:var(--sapHighlightColor,#0a6ed1)}
        td input[type=checkbox]{-webkit-appearance:none;appearance:none;width:16px;height:16px;min-width:16px;flex:none;margin:0;padding:0;border:1px solid var(--sapField_BorderColor,#89919a);border-radius:3px;background:var(--sapField_Background,#fff);cursor:pointer;vertical-align:middle;position:relative}
        td input[type=checkbox]:checked{background:var(--sapInformationElementColor, #0a6ed1);border-color:var(--sapInformationElementColor, #0a6ed1)}
        td input[type=checkbox]:checked::after{content:"";position:absolute;left:4px;top:1px;width:4px;height:8px;border:solid var(--sapGroup_ContentBorderColor, #ffffff);border-width:0 2px 2px 0;transform:rotate(45deg)}
        .tbl-item{display:block;width:100%;text-align:left;border:1px solid transparent;background:transparent;border-radius:6px;padding:6px 8px;color:inherit;cursor:pointer;font-size:12px}
        .tbl-item:hover{background:var(--sapList_Hover_Background,#f5f6f7)}
        .tbl-item.active{border-color:var(--cmx-selection-border);background:var(--cmx-selection-bg)}
        .tbl-item .sub{font-size:11px;color:var(--sapContent_LabelColor,#6a6d70)}
        .tbl-item:has(.tbl-pick){display:flex;align-items:center;gap:4px;padding:2px 4px 2px 0}
        .tbl-pick{flex:1;min-width:0;text-align:left;border:0;background:transparent;color:inherit;cursor:pointer;font-size:12px;padding:6px 8px;border-radius:6px}
        .tbl-del{flex:0 0 auto;opacity:0;transition:opacity .12s}
        .tbl-mv{flex:0 0 auto;opacity:0;transition:opacity .12s}
        .tbl-mv[disabled]{opacity:0 !important;pointer-events:none}
        .tbl-item:hover .tbl-mv:not([disabled]),.tbl-item.active .tbl-mv:not([disabled]){opacity:1}
        .tbl-item:hover .tbl-del,.tbl-item.active .tbl-del{opacity:1}
        .field-panel-tabs{display:flex;align-items:flex-end;gap:2px;height:34px;padding:0 8px;border-bottom:1px solid var(--sapGroup_TitleBorderColor,#d9d9d9);background:var(--sapList_HeaderBackground,#f7f7f7);flex-shrink:0}
        .field-panel-tab{box-sizing:border-box;height:34px;border:0;border-bottom:2px solid transparent;background:transparent;padding:0 12px;color:var(--sapContent_LabelColor,#6a6d70);font-size:12px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:5px}
        .field-panel-tab ui5-icon{width:14px;height:14px;pointer-events:none;flex:0 0 auto}
        .field-panel-tab:hover{color:var(--sapTextColor,#1d2d3e);background:var(--sapList_Hover_Background,#f5f6f7)}
        .field-panel-tab.active{border-bottom-color:var(--sapHighlightColor,#0070f2);color:var(--sapHighlightColor,#0070f2)}
        .field-panel-tab.summary-tab{box-sizing:border-box;height:34px;display:inline-flex;align-items:center;gap:1px;padding:0 4px 0 10px}
        .field-panel-tab.summary-tab.active{border-bottom-color:var(--sapHighlightColor,#0070f2)}
        .summary-tab .summary-tab-label{height:32px;border:0;background:transparent;color:inherit;font:inherit;cursor:pointer;padding:0;display:inline-flex;align-items:center;gap:5px}
        .summary-tab.active .summary-tab-label{color:var(--sapHighlightColor,#0070f2)}
        .summary-tab .summary-tab-del{width:18px;height:18px;line-height:1;padding:0;border-radius:9px;font-size:11px;flex:0 0 auto}
        .summary-panel{display:flex;flex-direction:column;height:100%;box-sizing:border-box;min-height:0}
        .summary-meta{flex-shrink:0;padding:8px 10px;border-bottom:1px solid var(--sapGroup_TitleBorderColor,#eee)}
        .summary-meta .meta-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
        .summary-meta .meta-row label{font-size:12px;color:var(--sapContent_LabelColor,#6a6d70);white-space:nowrap}
        .summary-meta .meta-row input{height:26px;border:1px solid var(--sapField_BorderColor,#89919a);border-radius:4px;padding:0 7px;font-size:12px;box-sizing:border-box;flex:1 1 120px;min-width:90px}
        .summary-meta .summary-apply-btn{flex:0 0 auto;width:30px;height:30px;color:var(--sapPositiveColor,#107e3e)}
        .summary-meta .summary-apply-btn ui5-icon{width:18px;height:18px}
        .summary-fields{display:flex;flex-direction:column;flex:1 1 auto;min-height:0}
        .summary-fields .box-head{display:flex;align-items:center;gap:6px;padding:6px 10px;flex-shrink:0}
        .summary-fields .summary-inherit-btn{width:30px;height:30px}
        .summary-fields .summary-inherit-btn ui5-icon{width:20px;height:20px}
        .summary-fields-body{flex:1 1 auto;min-height:0;overflow:auto;padding:0 4px 8px}
        .fields-json-wrap{display:flex;flex-direction:column;gap:6px;padding:8px;height:100%;box-sizing:border-box;min-height:0}
        .fields-json-toolbar{display:flex;align-items:center;gap:6px;flex-shrink:0}
        .fields-json-title{font-size:12px;font-weight:700;color:var(--sapContent_LabelColor,#6a6d70)}
        .fields-json-cm-host{width:100%;min-height:280px;flex:1;min-height:0;border:1px solid var(--sapField_BorderColor,#89919a);border-radius:4px;overflow:hidden;background:var(--sapField_Background,#fff)}
        .fields-json-cm-host .cm-editor{height:100%;font-size:12px}
        .fields-json-cm-host .cm-scroller{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
        .fields-json-editor{width:100%;min-height:280px;flex:1;resize:vertical;box-sizing:border-box;border:1px solid var(--sapField_BorderColor,#89919a);border-radius:4px;padding:8px;background:var(--sapField_Background,#fff);color:var(--sapField_TextColor,var(--sapTextColor,#1d2d3e));font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color-scheme:${nativeColorScheme}}
        .fields-json-status{min-height:18px;font-size:12px;color:var(--sapContent_LabelColor,#6a6d70)}
        .fields-json-status[data-tone="ok"]{color:var(--sapPositiveTextColor,#107e3e)}
        .fields-json-status[data-tone="err"]{color:var(--sapNegativeTextColor,#bb0000)}
        .fgroup{border:1px solid var(--sapGroup_TitleBorderColor,#e5e5e5);border-radius:6px;margin:8px 8px 0;overflow:hidden}
        .fgroup:last-child{margin-bottom:8px}
        .fgroup-head{display:flex;align-items:center;gap:8px;height:32px;padding:0 10px;cursor:pointer;user-select:none;background:var(--sapList_HeaderBackground,#f7f7f7);font-size:12px}
        .fgroup-head .caret{color:var(--sapContent_LabelColor,#6a6d70);font-size:11px;width:12px}
        .fgroup-head .g-title{font-weight:700}
        .fgroup-head .spacer{flex:1}
        .g-tag{font-size:10px;padding:1px 6px;border-radius:8px;font-weight:600}
        .g-tag.editable{background:var(--sapSuccessBackground,#e8f5e9);color:var(--sapPositiveColor,#107e3e)}
        .g-tag.readonly{background:var(--sapNeutralBackground,#eef0f2);color:var(--sapContent_LabelColor,#6a6d70)}
        .ov-badge{display:inline-block;min-width:16px;padding:0 5px;margin-right:4px;border-radius:8px;background:var(--sapInformationBackground,#eaf4ff);color:var(--sapInformationColor,#0a6ed1);font-size:10px;font-weight:700;line-height:16px;text-align:center;vertical-align:middle}
        .ov-dot{color:var(--sapInformationColor,#0a6ed1);font-size:11px}
        tr.ro.selected{background:var(--cmx-selection-bg,#f0f7ff)}
        tr.ro[data-action]{cursor:pointer}
        .g-count{font-size:11px;color:var(--sapContent_LabelColor,#6a6d70);min-width:18px;text-align:center}
        .tpl-select{height:24px;font-size:11px;border:1px solid var(--sapField_BorderColor,#89919a);border-radius:4px;background:var(--sapField_Background,#fff);color:var(--sapField_TextColor,var(--sapTextColor,#1d2d3e));cursor:pointer;max-width:140px}
        .fgroup-body{border-top:1px solid var(--sapGroup_TitleBorderColor,#e5e5e5)}
        tr.ro td{color:var(--sapContent_LabelColor,#6a6d70);background:var(--sapField_ReadOnly_Background,rgba(0,0,0,.015))}
        tr.ro td select[data-ref-dict-edit]{color:var(--sapField_TextColor,var(--sapTextColor,#1d2d3e));background:var(--sapField_Background,#fff)}
        td .ro-na{color:var(--sapContent_LabelColor,#9aa0a6)}
        td .pk-yes{color:var(--sapPositiveColor,#107e3e);font-weight:700}
        tr.fsel td,tr.cmx-field-row.sel td{background:var(--cmx-selection-bg)}
        tr.cmx-field-row{cursor:pointer}
        tr.cmx-field-row:hover td{background:var(--sapList_Hover_Background,#f5f6f7)}
        tr.cmx-field-row.fsel:hover td,tr.cmx-field-row.sel:hover td{background:var(--cmx-selection-bg)}
        td .cmx-fld-ro{color:var(--sapContent_LabelColor,#6a6d70)}
        td.ro-cell{color:var(--sapContent_LabelColor,#6a6d70);font-size:11px}
        .doc-tabs{display:flex;align-items:stretch;gap:2px;padding:0 8px;height:36px;border-bottom:1px solid var(--sapGroup_TitleBorderColor,#d9d9d9);flex-shrink:0;background:var(--sapList_HeaderBackground,#f7f7f7);flex-wrap:nowrap;overflow-x:auto}
        .doc-tab{align-self:center;height:28px;border:0;border-bottom:2px solid transparent;background:transparent;padding:0 12px;cursor:pointer;color:var(--sapContent_LabelColor,#6a6d70);font-size:12px;white-space:nowrap}
        .doc-tab.active{border-bottom-color:var(--sapHighlightColor,#0070f2);color:var(--sapTextColor,#1d2d3e);font-weight:700}
        .doc-tab-empty{align-self:center;font-size:12px;color:var(--sapContent_LabelColor,#6a6d70);padding:0 8px}
        .doc-tabs .icon-btn{align-self:center}
        .icon-btn{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--sapContent_IconColor,#6a6d70);cursor:pointer;transition:background-color .12s,color .12s}
        .icon-btn ui5-icon{width:16px;height:16px;pointer-events:none}
        .icon-btn:hover{background:var(--sapButton_Hover_Background,rgba(0,0,0,.06));color:var(--sapHighlightColor,#0070f2)}
        .icon-btn.danger:hover{background:rgba(187,0,0,.1);color:var(--sapNegativeColor,#bb0000)}
        .icon-btn.primary{color:var(--sapHighlightColor,#0070f2)}
        .msg{font-size:12px;color:var(--sapContent_LabelColor,#6a6d70);padding:0 12px 8px}
        .item-sub{font-size:12px;color:var(--sapContent_LabelColor,#6a6d70);padding:10px}
        /* ── 索引 tab ── */
        .indexes-panel{display:flex;flex-direction:column;gap:8px;padding:8px 12px;min-height:100%}
        .idx-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
        .idx-target-label{font-size:12px;color:var(--sapContent_LabelColor,#6a6d70);white-space:nowrap}
        .idx-target{font-size:12px;padding:2px 6px;max-width:280px;border:1px solid var(--sapField_BorderColor,#89919a);border-radius:4px;background:var(--sapField_Background,#fff);color:var(--sapTextColor,#1d2d3e)}
        .idx-add{border:1px solid var(--sapButton_BorderColor,#89919a);background:var(--sapButton_Background,#fff);color:var(--sapButton_TextColor,#1d2d3e);border-radius:4px;padding:3px 10px;font-size:12px;cursor:pointer;white-space:nowrap}
        .idx-add:hover{background:var(--sapButton_Hover_Background,rgba(0,0,0,.06))}
        .idx-add.primary{border-color:var(--sapButton_Emphasized_BorderColor,#0070f2);background:var(--sapButton_Emphasized_Background,#0070f2);color:var(--sapButton_Emphasized_TextColor,#fff)}
        .idx-hint{font-size:11px;line-height:1.5;color:var(--sapContent_LabelColor,#6a6d70);background:var(--sapInformationBackground,#f5faff);border:1px solid var(--sapInformationBorderColor,#d0e7fd);border-radius:6px;padding:6px 10px}
        .idx-row{display:flex;align-items:center;gap:8px;padding:5px 8px;border:1px solid var(--sapList_BorderColor,#e5e5e5);border-radius:6px;background:var(--sapList_Background,#fff)}
        .idx-row+.idx-row{margin-top:6px}
        .idx-row.dangling{border-color:var(--sapErrorBorderColor,#ee3939);background:var(--sapErrorBackground,rgba(238,57,57,.06))}
        .idx-kind{flex:none;font-size:10px;font-weight:700;letter-spacing:.5px;border-radius:4px;padding:2px 6px}
        .idx-kind.unique{color:var(--sapInformativeElementColor,#1b90ff);background:var(--sapInformativeBackground,rgba(27,144,255,.1))}
        .idx-kind.normal{color:var(--sapNeutralElementColor,#6a6d70);background:var(--sapNeutralBackground,#f5f5f5)}
        .idx-name{flex:none;width:260px;font-size:12px;padding:2px 6px;border:1px solid var(--sapField_BorderColor,#89919a);border-radius:4px}
        .idx-name-readonly{flex:none;max-width:200px;font-size:12px;color:var(--sapContent_LabelColor,#6a6d70);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .idx-cols{flex:1;min-height:24px;display:flex;align-items:center;flex-wrap:wrap;gap:4px;cursor:pointer;padding:2px 4px;border-radius:4px}
        .idx-cols:hover{background:var(--sapList_Hover_Background,rgba(0,0,0,.04))}
        .idx-cols.locked{cursor:default}
        .idx-cols.locked:hover{background:transparent}
        .idx-chip{display:inline-flex;align-items:center;gap:2px;font-size:11px;font-family:var(--sapFontFamily_Info,monospace);border:1px solid var(--sapButton_BorderColor,#89919a);border-radius:10px;padding:1px 8px;background:var(--sapButton_Background,#fff)}
        .idx-chip.bad{border-color:var(--sapErrorBorderColor,#ee3939);color:var(--sapErrorColor,#ee3939);text-decoration:line-through}
        .idx-chip.dialog{padding:1px 2px}
        .idx-chip.dialog .icon-btn{width:18px;height:18px}
        .idx-chips-empty{font-size:11px;color:var(--sapContent_LabelColor,#6a6d70);font-style:italic}
        /* 索引列选择弹窗 */
        .idxdlg{width:min(560px,92vw);display:flex;flex-direction:column;overflow:hidden}
        .idxdlg-body{flex:1;min-height:0;overflow:auto;padding-right:2px}
        .idxdlg-selected{display:flex;align-items:center;flex-wrap:wrap;gap:4px;margin-bottom:10px;border-bottom:1px dashed var(--sapList_BorderColor,#e5e5e5);padding-bottom:8px;flex:0 0 auto}
        .idxdlg-selected .lbl{font-size:11px;color:var(--sapContent_LabelColor,#6a6d70);width:100%}
        .idxdlg-group{margin-bottom:8px}
        .idxdlg-group-title{font-size:12px;font-weight:600;margin-bottom:4px}
        .idxdlg-warn-title{color:var(--sapErrorColor,#ee3939)}
        .idxdlg-cols{display:flex;flex-wrap:wrap;gap:4px}
        .idxdlg-col{display:inline-flex;align-items:center;gap:4px;font-size:12px;border:1px solid var(--sapList_BorderColor,#e5e5e5);border-radius:6px;padding:2px 8px;cursor:pointer;background:var(--sapButton_Background,#fff)}
        .idxdlg-col:hover{background:var(--sapList_Hover_Background,rgba(0,0,0,.04))}
        .idxdlg-col.on{border-color:var(--cmx-selection-border);background:var(--cmx-selection-bg-soft)}
        .idxdlg-col.on .c-name{color:var(--cmx-selection-text);font-weight:600}
        .idxdlg-col.on .c-cap{color:var(--cmx-selection-text)}
        .idxdlg-col .c-name{font-family:var(--sapFontFamily_Info,monospace)}
        .idxdlg-col .c-cap{color:var(--sapContent_LabelColor,#6a6d70);font-size:11px}
        .idxdlg-foot{display:flex;align-items:center;gap:8px;margin-top:10px;border-top:1px dashed var(--sapList_BorderColor,#e5e5e5);padding-top:8px;flex:0 0 auto}
        .idxdlg-foot .idx-add[disabled]{opacity:.5;cursor:not-allowed}
        .idxdlg-dup-warn{flex:0 0 auto;margin-top:8px;padding:6px 9px;border-radius:6px;font-size:12px;color:var(--sapNegativeColor,#bb0000);background:var(--sapNegativeBackground,#ffebeb);word-break:break-word}
        .idxdlg-count{font-size:12px;color:var(--sapContent_LabelColor,#6a6d70)}
      </style>
      <div class="main">
        <div class="panel-head">
          ${this._embed
            ? `<span class="ver-label">${escHtml(kindLabel)}：</span>${this._renderEmbedDocSelect()}`
            : `<div class="title">${escHtml(this._mm?.metaName || this._selected?.title || `未选择${kindLabel}定义`)}${this._dirty ? ' *' : ''}</div>`}
          <span class="spacer"></span>
          ${this._renderVersionControl()}
          ${this._embed || this._readonly ? '' : `<button type="button" class="adm-icon-btn ghost" data-action="import-json" title="导入 JSON"><ui5-icon name="upload"></ui5-icon></button>
          <button type="button" class="adm-icon-btn ghost" data-action="export-json" title="导出 JSON"><ui5-icon name="download"></ui5-icon></button>
          <button type="button" class="adm-icon-btn primary" data-action="save" title="保存"><ui5-icon name="save"></ui5-icon>保存</button>
          ${this._isBase() ? '' : '<button type="button" class="adm-icon-btn danger" data-action="remove-file" title="删除当前定义文件"><ui5-icon name="delete"></ui5-icon>删除</button>'}`}
        </div>
        <div class="body">
          <section class="box tables">
            ${this._kind === 'DCT' ? `<div class="dict-type-tabs">${DICT_KINDS.map((d) => {
              const n = tables.filter((t) => dictKindOf(t.table) === d.value).length
              return `<button class="dict-type-tab ${this._selectedDictTab === d.value ? 'active' : ''}" data-action="select-dict-tab" data-dict-kind="${d.value}">${escHtml(d.label)}<span class="dt-count">${n}</span></button>`
            }).join('')}<span class="spacer"></span><button class="icon-btn" data-action="add-dict" data-dict-kind="${this._selectedDictTab}" title="增加${escAttr(dictKindLabel(this._selectedDictTab))}"><ui5-icon name="add"></ui5-icon></button></div>` : `
            ${this._kind === 'DOC' ? this._renderDocTopTabs(tables) : `<div class="box-head"><div class="box-title">${tablesLabel}（${tables.length}）</div><span class="spacer"></span>${this._isBase() ? '<button class="icon-btn" data-action="add-fieldset" title="新增字段集"><ui5-icon name="add"></ui5-icon></button>' : ''}</div>`}`}
            <div class="box-body">${this._kind === 'DCT'
              ? (dctTables.length ? dctTables.map((t, i) => `<div class="tbl-item ${t.key === this._selectedTable ? 'active' : ''}">
                  <button class="tbl-pick" data-action="select-table" data-table="${escAttr(t.key)}"><div class="ti-title">${escHtml(t.label)}</div><div class="sub">${escHtml(t.table?.dictMeta?.dictCode || t.table?.tableName || '')} · ${this._totalFieldCount(t)} 字段</div></button>
                  <button class="icon-btn tbl-mv" data-action="move-dict-up" data-table="${escAttr(t.key)}" ${i === 0 ? 'disabled' : ''} title="上移"><ui5-icon name="slim-arrow-up"></ui5-icon></button>
                  <button class="icon-btn tbl-mv" data-action="move-dict-down" data-table="${escAttr(t.key)}" ${i === dctTables.length - 1 ? 'disabled' : ''} title="下移"><ui5-icon name="slim-arrow-down"></ui5-icon></button>
                  <button class="icon-btn danger tbl-del" data-action="remove-dict" data-table="${escAttr(t.key)}" title="删除字典"><ui5-icon name="delete"></ui5-icon></button>
                </div>`).join('') : `<div class="item-sub">「${escHtml(dictKindLabel(this._selectedDictTab))}」下暂无字典，点右上「+」新增。</div>`)
              : (this._kind === 'DOC' ? this._renderDocTopBody(tables) : (tables.length ? tables.map((t) => {
              const sub = this._kind === 'DOC'
                ? `${Number(t.tableCount || 0)} 张表：${(t.tables || []).map((x) => escHtml(`${x.alias || x.name}（${x.name}）`)).join('、') || '—'}`
                : `${escHtml(t.key)} · ${this._totalFieldCount(t)} 字段`
              return `<button class="tbl-item ${t.key === this._selectedTable ? 'active' : ''}" data-action="select-table" data-table="${escAttr(t.key)}"><div class="ti-title">${escHtml(t.label)}</div><div class="sub">${sub}</div></button>`
            }).join('') : '<div class="item-sub">该定义文件没有表，或请在源码视图编辑。</div>'))}</div>
          </section>
          <div class="def-splitter-y" data-def-split="contentY" role="separator" tabindex="0" aria-label="调整区域高度"></div>
          <section class="box fields">
            ${this._kind === 'DOC'
              ? this._renderDocTabs()
              : `<div class="box-head"><div class="box-title">字段（${this._totalFieldCount(entry)}）${entry ? ` · ${escHtml(entry.label)}` : ''}</div></div>`}
            ${this._renderFieldsPanelTabs()}
            <div class="box-body" id="fields-table-host">${this._renderFieldsPanelBody(entry)}</div>
          </section>
        </div>
        <div class="msg">${escHtml(this._message || (this._loading ? '加载中...' : ''))}</div>
      </div>
      ${this._renderVersionDialog()}
      ${this._renderVersionManager()}
      ${this._renderIndexDialog()}`
    if (this._fieldsPanelTab === 'json') void this._initFieldsJsonEditor(entry)
    this._restoreScrollState(scrollState)
    this._bus.emitState()
  }

  _captureScrollState () {
    const sr = this.shadowRoot
    const read = (selector) => {
      const el = sr?.querySelector(selector)
      return el ? { top: el.scrollTop || 0, left: el.scrollLeft || 0 } : null
    }
    return {
      body: read('.body'),
      tables: read('.box.tables .box-body'),
      fields: read('#fields-table-host'),
      docTabs: read('.doc-tabs'),
      idxDlg: read('.idxdlg .idxdlg-body'),
    }
  }

  _restoreScrollState (state) {
    if (!state) return
    const sr = this.shadowRoot
    const write = (selector, pos) => {
      if (!pos) return
      const el = sr?.querySelector(selector)
      if (!el) return
      el.scrollTop = pos.top || 0
      el.scrollLeft = pos.left || 0
    }
    write('.body', state.body)
    write('.box.tables .box-body', state.tables)
    write('#fields-table-host', state.fields)
    write('.doc-tabs', state.docTabs)
    // 索引弹窗字段列表滚动位置：勾选列会触发全量重渲染，不恢复则列表跳回顶部
    write('.idxdlg .idxdlg-body', state.idxDlg)
  }

  _syncFieldsTable () {
    const host = this.shadowRoot.getElementById('fields-table-host')
    if (!host || isEditingEl(this.shadowRoot) || this._fieldsPanelTab === 'json') return
    // eslint-disable-next-line no-restricted-syntax -- 内容经 escHtml/escAttr。
    host.innerHTML = this._renderFieldsPanelBody(this._currentTable())
  }

  /** DOC：content 顶部区域 tab（层级 + 各类已引用字典）。 */
  _renderDocTopTabs (levels) {
    const active = this._selectedDocTopTab || 'levels'
    const levelActive = active === 'levels'
    const levelCount = Array.isArray(levels) ? levels.length : 0
    const dictTabs = DICT_KINDS.map((d) => {
      const n = this._docReferencedDictEntries(d.value).length
      return `<button class="dict-type-tab ${active === d.value ? 'active' : ''}" data-action="select-doc-top-tab" data-doc-top-tab="${escAttr(d.value)}">${escHtml(d.label)}<span class="dt-count">${n}</span></button>`
    }).join('')
    return `<div class="dict-type-tabs">
      <span class="dict-type-tab doc-level-tab ${levelActive ? 'active' : ''}">
        <button class="doc-top-label-btn" data-action="select-doc-top-tab" data-doc-top-tab="levels">
          <span class="doc-top-tab-label">层级<span class="dt-count">${levelCount}</span></span>
        </button>
        <span class="doc-top-tab-actions">
          <button class="icon-btn" data-action="add-level" title="增加层级"><ui5-icon name="add"></ui5-icon></button>
          <button class="icon-btn danger" data-action="remove-level" title="删除当前层级" ${this._selectedTable ? '' : 'disabled'}><ui5-icon name="delete"></ui5-icon></button>
        </span>
      </span>
      ${dictTabs}
    </div>`
  }

  _renderDocTopBody (levels) {
    const active = this._selectedDocTopTab || 'levels'
    if (active === 'levels') {
      return Array.isArray(levels) && levels.length
        ? levels.map((t) => {
          const sub = `${Number(t.tableCount || 0)} 张表：${(t.tables || []).map((x) => escHtml(`${x.alias || x.name}（${x.name}）`)).join('、') || '—'}`
          return `<button class="tbl-item ${t.key === this._selectedTable ? 'active' : ''}" data-action="select-table" data-table="${escAttr(t.key)}"><div class="ti-title">${escHtml(t.label)}</div><div class="sub">${sub}</div></button>`
        }).join('')
        : '<div class="item-sub">该单据定义没有层级，点击「层级」标签上的「+」新增。</div>'
    }
    const kind = DICT_KINDS.some((d) => d.value === active) ? active : DICT_KIND_DEFAULT
    const items = this._docReferencedDictEntries(kind)
    if (items.length && !items.some((d) => d.code === this._selectedDocDictCode)) this._selectedDocDictCode = items[0].code
    return items.length
      ? items.map((d) => `<button class="doc-dict-item ${this._selectedDocDictCode === d.code ? 'active' : ''}" data-action="select-doc-dict" data-dict-code="${escAttr(d.code)}"><div class="doc-dict-title">${escHtml(d.name)}</div><div class="doc-dict-sub">${escHtml(d.code)} · ${escHtml(dictKindLabel(d.kind))}</div></button>`).join('')
      : `<div class="item-sub">本单据暂未引用「${escHtml(dictKindLabel(kind))}」。</div>`
  }

  /** DOC：当前层级内的表 tab 条（一表一标签，单表也是一个标签）。 */
  _renderDocTabs () {
    const level = this._selectedTable || this._docLevels()[0]
    const tabs = this._docLevelTables(level)
    const active = this._currentDocTable()?.key
    const tabBtns = tabs.length
      ? tabs.map((x) => `<button class="doc-tab ${x.key === active ? 'active' : ''}" data-action="select-doc-table" data-table="${escAttr(x.key)}">${escHtml(x.label)}<span style="opacity:.6"> · ${escHtml(x.table.tableName || '')} · ${this._totalFieldCount(x)} 字段</span></button>`).join('')
      : '<span class="doc-tab-empty">本层暂无表</span>'
    return `<div class="doc-tabs">${tabBtns}<span class="spacer"></span>
      <button class="icon-btn" data-action="add-doc-table" title="增加表" ${level ? '' : 'disabled'}><ui5-icon name="add"></ui5-icon></button>
      <button class="icon-btn danger" data-action="remove-doc-table" title="删除当前表" ${active ? '' : 'disabled'}><ui5-icon name="delete"></ui5-icon></button>
      <button class="icon-btn" data-action="add-summary" title="增加汇总表" ${active ? '' : 'disabled'}><ui5-icon name="sum"></ui5-icon></button>
    </div>`
  }

  _renderFieldsPanelTabs () {
    const cur = this._fieldsPanelTab
    const tabs = [`<button class="field-panel-tab ${cur === 'fields' ? 'active' : ''}" type="button" role="tab" aria-selected="${cur === 'fields'}" data-action="select-fields-tab" data-tab="fields"><ui5-icon name="table-column"></ui5-icon><span>字段定义</span></button>`]
    // DOC：在「字段定义」与「JSON源码」之间插入各汇总表 Tab（新增按钮在上方层级表 tab 行）
    if (this._isDocLike()) {
      const entry = this._currentTable()
      const sums = this._tableSummaries(entry)
      for (const s of sums) {
        const sid = `summary:${s.id}`
        tabs.push(`<span class="field-panel-tab summary-tab ${cur === sid ? 'active' : ''}">
          <button class="summary-tab-label" type="button" role="tab" aria-selected="${cur === sid}" data-action="select-fields-tab" data-tab="${escAttr(sid)}" title="${escAttr(fieldCaption(s) || s.id)}"><ui5-icon name="sum"></ui5-icon><span>${escHtml(fieldCaption(s) || s.name || s.id)}</span></button>
          <button class="icon-btn danger summary-tab-del" data-action="remove-summary" data-summary="${escAttr(s.id)}" title="删除此汇总表">✕</button>
        </span>`)
      }
    }
    // 索引 tab：表级唯一键/普通索引统一维护（DCT/DOC 主表 + DOC 汇总表；BASE 字段集不部署成表，不显示）
    if (!this._isBase()) {
      tabs.push(`<button class="field-panel-tab ${cur === 'indexes' ? 'active' : ''}" type="button" role="tab" aria-selected="${cur === 'indexes'}" data-action="select-fields-tab" data-tab="indexes"><ui5-icon name="filter"></ui5-icon><span>索引</span></button>`)
    }
    tabs.push(`<button class="field-panel-tab ${cur === 'json' ? 'active' : ''}" type="button" role="tab" aria-selected="${cur === 'json'}" data-action="select-fields-tab" data-tab="json"><ui5-icon name="source-code"></ui5-icon><span>JSON源码</span></button>`)
    return `<div class="field-panel-tabs" role="tablist" aria-label="字段定义">${tabs.join('')}</div>`
  }

  /** DOC/BASE-DOC 端（带汇总表能力）。 */
  _isDocLike () { return this._kind === 'DOC' || this._kind === 'BASE-DOC' }

  /** 当前选中表的 summaries 数组（原始引用，可增删改）。 */
  _tableSummaries (entry) {
    const t = (entry || this._currentTable())?.table
    if (!t) return []
    if (!Array.isArray(t.summaries)) return []
    return t.summaries
  }

  _renderFieldsPanelBody (entry) {
    if (typeof this._fieldsPanelTab === 'string' && this._fieldsPanelTab.startsWith('summary:')) {
      return this._renderSummaryPanel(entry, this._fieldsPanelTab.slice('summary:'.length))
    }
    return this._fieldsPanelTab === 'json'
      ? this._renderFieldsJsonPanel(entry)
      : this._fieldsPanelTab === 'indexes'
        ? this._renderIndexesPanel(entry)
        : this._renderFieldsTable(entry)
  }

  _renderFieldsJsonPanel (entry) {
    if (!entry) return '<div class="item-sub">先选择一个表。</div>'
    return `<div class="fields-json-wrap">
      <div class="fields-json-toolbar">
        <span class="fields-json-title">当前表 JSON（含字段、汇总表等表级信息）</span>
        <span class="spacer"></span>
        <button class="icon-btn" data-action="fields-json-refresh" title="从当前表刷新 JSON"><ui5-icon name="refresh"></ui5-icon></button>
        <button class="icon-btn" data-action="fields-json-format" title="格式化 JSON"><ui5-icon name="source-code"></ui5-icon></button>
        <button class="icon-btn" data-action="fields-json-apply" title="应用 JSON"><ui5-icon name="accept"></ui5-icon></button>
      </div>
      <div id="fields-json-cm-host" class="fields-json-cm-host"></div>
      <textarea id="fields-json-editor" class="fields-json-editor" spellcheck="false" hidden>${escHtml(this._fieldsJsonText(entry))}</textarea>
      <div id="fields-json-status" class="fields-json-status" data-tone="${this._fieldsJsonMessage ? 'ok' : ''}">${escHtml(this._fieldsJsonMessage)}</div>
    </div>`
  }

  // ─── 索引维护（表级 uniqueKeys + indexes 统一编辑）──────────────────────────

  /** 索引 tab 的目标表（自持 _indexTarget，不依赖 _fieldsPanelTab）：主表或 DOC 汇总表。 */
  _indexTargetTable (entry) {
    if (this._indexTarget && this._indexTarget !== 'main') {
      const sum = (this._tableSummaries(entry) || []).find((x) => x.id === this._indexTarget)
      if (sum) return { table: sum, label: `汇总 · ${fieldCaption(sum) || sum.name || sum.id}`, isSummary: true }
    }
    this._indexTarget = 'main'
    const t = entry?.table
    const name = this._indexTableName(t) || entry?.label || '主表'
    return { table: t, label: `主表 · ${name}`, isSummary: false }
  }

  /** 唯一键条目取列（双形态：纯列数组=存量 / { name?, columns }=对象）。无列返回 null。 */
  _ukColumns (uk) {
    if (Array.isArray(uk)) return uk
    return (uk && !Array.isArray(uk) && Array.isArray(uk.columns)) ? uk.columns : null
  }

  /** 唯一键条目取自定义名（对象形态才有；纯数组返回空串）。 */
  _ukName (uk) {
    return (uk && !Array.isArray(uk) && typeof uk.name === 'string') ? uk.name.trim() : ''
  }

  /** 物理表名（生成缺省索引名展示，命名规则与后端 compile 一致）。 */
  _indexTableName (t) {
    return t?.dictMeta?.tableName || t?.tableName || t?.name || t?.id || ''
  }

  /** 自动索引名：`{prefix}_{table}_{列序列哈希6}`——**不按下标**：列不变名不变，
   *  删除/移动/新增其它条目不影响本条目名，删除条目会同步 DROP 对应旧索引（无孤儿残留）。
   *  超 PG 标识符上限 63 字节时截断表名，且哈希输入混入完整表名防跨表截断撞名。
   *  算法与后端 compile.rs `auto_index_name` 严格一致（改任一侧须同步另一侧），
   *  保证前端展示名 = 实际落库名。 */
  _autoIndexName (prefix, table, columns) {
    const cols = (columns || []).join(',')
    const hash6 = (s) => (this._fnv1a32(s) & 0xffffff).toString(16).padStart(6, '0')
    const full = `${prefix}_${table}_${hash6(cols)}`
    if (this._utf8ByteLen(full) <= 63) return full
    // 预算：{prefix} + 2 个下划线 + 6 位哈希 ≤ 63（按 UTF-8 字节计）
    const tAvail = Math.max(0, 63 - prefix.length - 2 - 6)
    let trunc = ''
    let used = 0
    for (const ch of String(table)) {
      const b = this._utf8ByteLen(ch)
      if (used + b > tAvail) break
      trunc += ch
      used += b
    }
    return `${prefix}_${trunc}_${hash6(`${table}:${cols}`)}`
  }

  /** 字符串的 UTF-8 字节数（PG 标识符上限按字节计）。 */
  _utf8ByteLen (s) {
    return this._utf8Encoder.encode(String(s ?? '')).length
  }

  /** FNV-1a 32 位哈希（UTF-8 字节；Math.imul + >>>0 与 Rust u32 wrapping 结果一致）。 */
  _fnv1a32 (s) {
    let h = 2166136261
    for (const b of this._utf8Encoder.encode(s)) {
      h = (h ^ b) >>> 0
      h = Math.imul(h, 16777619) >>> 0
    }
    return h >>> 0
  }

  /** 某表（主表/汇总表通用）的主键列集合：isPrimaryKey 勾选 + dictMeta.idField 兜底。 */
  _currentPkColumnsFor (t) {
    const fields = Array.isArray(t?.fields) ? t.fields : []
    const pk = fields.filter((f) => isPrimaryKeyField(f)).map((f) => fieldId(f))
    const idf = t?.dictMeta?.idField
    if (idf && !pk.includes(idf)) pk.unshift(idf)
    return pk
  }

  _renderIndexesPanel (entry) {
    if (!entry || !entry.table) return '<div class="item-sub">先选择一个表。</div>'
    const target = this._indexTargetTable(entry)
    const t = target.table
    const tableName = this._indexTableName(t) || 't'
    // 合并列集（本表 fields + 引用字段集展开）——列引用合法性基准，与编译层一致
    const colSet = new Set(this._fieldGroups({ table: t }).flatMap((g) => g.fields.map((f) => fieldId(f))))
    const uks = Array.isArray(t.uniqueKeys) ? t.uniqueKeys : []
    const idxs = Array.isArray(t.indexes) ? t.indexes : []
    const pkCols = this._currentPkColumnsFor(t)
    // 目标表选择器：DOC 且有汇总表才展示（汇总表是独立物理表，索引同样进编译/diff 链路）
    const sums = this._tableSummaries(entry)
    const targetSel = (this._isDocLike() && sums.length)
      ? `<label class="idx-target-label">目标表</label><select class="idx-target" data-index-target>
          <option value="main" ${this._indexTarget === 'main' ? 'selected' : ''}>主表（${escHtml(tableName)}）</option>
          ${sums.map((s) => `<option value="${escAttr(s.id)}" ${this._indexTarget === s.id ? 'selected' : ''}>汇总 · ${escHtml(fieldCaption(s) || s.name || s.id)}</option>`).join('')}
        </select>`
      : ''
    const rows = []
    uks.forEach((uk, i) => {
      const cols = this._ukColumns(uk) || []
      const nm = this._ukName(uk)
      rows.push(this._renderIndexRow('unique', i, cols, nm || this._autoIndexName('uk', tableName, cols), colSet, pkCols))
    })
    idxs.forEach((ix, i) => {
      const cols = (ix && Array.isArray(ix.columns)) ? ix.columns : []
      const nm = (ix && typeof ix.name === 'string') ? ix.name.trim() : ''
      rows.push(this._renderIndexRow('normal', i, cols, nm || this._autoIndexName('idx', tableName, cols), colSet, pkCols))
    })
    return `<div class="indexes-panel">
      <div class="idx-toolbar">
        ${targetSel}
        <span class="spacer"></span>
        <button class="idx-add" data-action="add-unique" title="新增唯一键（可多列联合）">＋ 唯一键</button>
        <button class="idx-add" data-action="add-index" title="新增普通索引（可多列复合）">＋ 普通索引</button>
      </div>
      <div class="idx-hint">🔒 主键条目由「字段定义」中 isPrimaryKey 勾选自动维护；列顺序敏感（复合语义）；删除条目或改列集合后重新部署，对应数据库索引会被 DROP 重建（大表建议先手工 CONCURRENTLY 预建新索引）。名称框预填自动名（可直接修改为自定义名；清空后失焦恢复自动命名）；自动名按列内容哈希生成（列不变名不变，删除条目会同步清理旧索引），超长自动截断表名保证合法；自定义名不超过 63 字节（PG 标识符上限）。部署只自动清理系统命名（uk_/idx_ 前缀）与定义中的索引；其它名字的索引视为用户手工创建，保留不删（部署计划中会提示）。</div>
      ${rows.length ? rows.join('') : '<div class="item-sub">该表暂无唯一键 / 普通索引定义。</div>'}
    </div>`
  }

  /** 单条索引行：类型徽标 + 名称 + 列 chips（点击开列选择弹窗）+ 行操作。 */
  _renderIndexRow (type, i, columns, name, colSet, pkCols) {
    const dangling = columns.some((c) => !colSet.has(c))
    const isPk = type === 'unique' && pkCols.length > 0
      && columns.length === pkCols.length && pkCols.every((c) => columns.includes(c))
    const chips = columns.length
      ? columns.map((c) => `<span class="idx-chip ${colSet.has(c) ? '' : 'bad'}" title="${colSet.has(c) ? '' : '列不存在'}">${escHtml(c)}</span>`).join('')
      : '<span class="idx-chips-empty">点此选择列</span>'
    const colsArea = `<div class="idx-cols ${isPk ? 'locked' : ''}" ${isPk ? 'data-action="idx-pk-locked"' : `data-action="idx-edit" data-type="${type}" data-i="${i}"`} title="${isPk ? '主键条目锁定：请在「字段定义」区调整 isPrimaryKey 勾选' : '点击选择/调整列（顺序敏感）'}">${chips}</div>`
    const nameArea = !isPk
      ? `<input class="idx-name" data-index-name="${i}" data-type="${type}" value="${escAttr(name)}" title="${type === 'unique' ? '唯一键' : '索引'}名（预填自动名，可直接修改；清空后失焦恢复自动命名；PG 标识符上限 63 字节）" maxlength="63" spellcheck="false">`
      : `<span class="idx-name-readonly" title="主键条目">🔒 ${escHtml(name)}</span>`
    const ops = isPk ? '' : `
        <button class="icon-btn" data-action="idx-move" data-type="${type}" data-i="${i}" data-dir="-1" title="上移"><ui5-icon name="slim-arrow-up"></ui5-icon></button>
        <button class="icon-btn" data-action="idx-move" data-type="${type}" data-i="${i}" data-dir="1" title="下移"><ui5-icon name="slim-arrow-down"></ui5-icon></button>
        <button class="icon-btn danger" data-action="idx-remove" data-type="${type}" data-i="${i}" title="删除条目（重新部署时 DROP 对应索引）"><ui5-icon name="delete"></ui5-icon></button>`
    return `<div class="idx-row ${dangling ? 'dangling' : ''}">
      <span class="idx-kind ${type}">${type === 'unique' ? 'UNIQUE' : 'INDEX'}</span>
      ${nameArea}
      ${colsArea}
      <span class="spacer"></span>
      ${ops}
    </div>`
  }

  /** 索引列选择弹窗（复用 fieldset-dialog 样式）：字段 checkbox 按勾选顺序构成列序列，顶部有序 chips 可微调。
   *  标题显式区分「新增/编辑 × 唯一键/索引」；已选列不在字段列表（引用集缺失/列已删）时兜底成组展示，保证可见可移除。 */
  /** 索引列选择弹窗的重复检测：当前列序列与目标表已有唯一键/索引条目完全一致（含顺序）→ 返回冲突条目。
   *  跨类型（唯一键 vs 普通索引）同样视为重复——同列序列建两种索引必有一个冗余；
   *  编辑模式排除自身（type + 下标）。判定口径与保存期 _validateIndexes 一致（序列含顺序）。 */
  _indexDialogDuplicate (d) {
    const t = d.table || this._indexTargetTable(this._currentTable()).table
    if (!t || !d.columns.length) return null
    const mine = d.columns.join(',')
    const all = []
    if (Array.isArray(t.uniqueKeys)) {
      t.uniqueKeys.forEach((uk, i) => all.push({ type: 'unique', i, cols: this._ukColumns(uk) || [], name: this._ukName(uk) }))
    }
    if (Array.isArray(t.indexes)) {
      t.indexes.forEach((ix, i) => all.push({ type: 'normal', i, cols: (ix && Array.isArray(ix.columns)) ? ix.columns : [], name: (ix && typeof ix.name === 'string') ? ix.name.trim() : '' }))
    }
    return all.find((x) => x.cols.length && x.cols.join(',') === mine && !(x.type === d.type && x.i === d.i)) || null
  }

  _renderIndexDialog () {
    const d = this._indexDialog
    if (!d) return ''
    const t = d.table || this._indexTargetTable(this._currentTable()).table
    const targetLabel = d.label || this._indexTargetTable(this._currentTable()).label
    const groups = this._fieldGroups({ table: t })
    const sel = new Set(d.columns)
    // 同名列跨组去重（本表字段与引用字段集可能含同名列）：先出现的组承载勾选项，
    // 后续组跳过——勾选按列名工作，重复展示只会造成"两处勾选状态"的困惑。
    const seenCols = new Set()
    const groupHtml = groups.map((g) => `<div class="idxdlg-group">
      <div class="idxdlg-group-title">${escHtml(g.label)}${g.editable ? '' : '（引用字段集）'}</div>
      <div class="idxdlg-cols">${g.fields.map((f) => {
        const id = fieldId(f)
        if (!id || seenCols.has(id)) return ''
        seenCols.add(id)
        const checked = sel.has(id)
        return `<label class="idxdlg-col ${checked ? 'on' : ''}">
          <input type="checkbox" data-idx-col="${escAttr(id)}" ${checked ? 'checked' : ''}>
          <span class="c-name">${escHtml(id)}</span><span class="c-cap">${escHtml(fieldCaption(f) || '')}</span>
        </label>`
      }).join('')}</div>
    </div>`).join('')
    // 兜底组：已选列不在任何字段组（引用字段集未加载/列已删）→ 单独成组，勾选态展示，点击即移除
    const known = new Set(groups.flatMap((g) => g.fields.map((f) => fieldId(f))).filter(Boolean))
    const danglingCols = d.columns.filter((c) => c && !known.has(c))
    const danglingHtml = danglingCols.length ? `<div class="idxdlg-group">
      <div class="idxdlg-group-title idxdlg-warn-title">已选列（不在当前字段列表，点击取消可移除）</div>
      <div class="idxdlg-cols">${danglingCols.map((c) => `<label class="idxdlg-col on">
        <input type="checkbox" data-idx-col="${escAttr(c)}" checked>
        <span class="c-name">${escHtml(c)}</span><span class="c-cap">列不存在于本表字段/引用字段集</span>
      </label>`).join('')}</div>
    </div>` : ''
    const chipsHtml = d.columns.length
      ? d.columns.map((c, pos) => `<span class="idx-chip dialog">
          <button class="icon-btn" data-action="idxdlg-move-col" data-pos="${pos}" data-dir="-1" ${pos === 0 ? 'disabled' : ''} title="前移"><ui5-icon name="slim-arrow-up"></ui5-icon></button>
          ${escHtml(c)}
          <button class="icon-btn" data-action="idxdlg-move-col" data-pos="${pos}" data-dir="1" ${pos === d.columns.length - 1 ? 'disabled' : ''} title="后移"><ui5-icon name="slim-arrow-down"></ui5-icon></button>
        </span>`).join('')
      : '<span class="idx-chips-empty">勾选下方字段生成列序列</span>'
    const verb = d.i < 0 ? '新增' : '编辑'
    // 重复检测：与已有条目（任意类型，排除自身）列序列一致 → 行内警示 + 禁用「应用」
    const dup = this._indexDialogDuplicate(d)
    const dupHtml = dup
      ? `<div class="idxdlg-dup-warn">⚠ 当前列序列与已有${dup.type === 'unique' ? '唯一键' : '普通索引'}「${escHtml(dup.name || '(自动命名)')}」[${escHtml(dup.cols.join(', '))}] 重复，无法应用</div>`
      : ''
    // 空序列禁用「应用」：新增无意义；编辑删条目走行内删除按钮（带确认），不再经弹窗隐式删除
    const empty = !d.columns.length
    const okTitle = dup ? '列序列与已有条目重复' : (empty ? '未选择任何列' : '')
    const countHint = empty
      ? (d.i < 0 ? '（未选择列）' : '（删除条目请用列表行的删除按钮）')
      : ''
    return `<div class="fieldset-dialog-backdrop">
      <section class="fieldset-dialog idxdlg">
        <div class="fieldset-dialog-head">
          <h3>${verb}${d.type === 'unique' ? '唯一键' : '索引'}列 — ${escHtml(targetLabel)}</h3>
          <button class="link-back" data-action="idxdlg-cancel">取消</button>
        </div>
        <div class="idxdlg-selected"><span class="lbl">列顺序（左=先，复合索引顺序敏感）</span>${chipsHtml}</div>
        <div class="idxdlg-body">${groupHtml}${danglingHtml}</div>
        <div class="idxdlg-foot">
          <span class="idxdlg-count">${d.columns.length} 列${countHint}</span>
          <span class="spacer"></span>
          <button class="idx-add primary" data-action="idxdlg-ok" ${(dup || empty) ? `disabled title="${okTitle}"` : ''}>应用</button>
        </div>
        ${dupHtml}
      </section>
    </div>`
  }

  _openIndexDialog (type, i) {
    const target = this._indexTargetTable(this._currentTable())
    const t = target.table
    if (!t) return
    // i < 0 = 新增模式：不预写数据模型，点「应用」才落库，取消零残留。
    const columns = i < 0 ? [] : (type === 'unique'
      ? ((i >= 0 && Array.isArray(t.uniqueKeys) ? this._ukColumns(t.uniqueKeys[i]) : null) || []).slice()
      : ((t.indexes && Array.isArray(t.indexes[i]?.columns)) ? t.indexes[i].columns : []).slice())
    // 快照目标表引用与显示名：弹窗生命周期内渲染/应用一律用快照，不随 _currentTable() 状态漂移
    this._indexDialog = { type, i, columns, table: t, label: target.label }
    this._render()
  }

  /** 弹窗勾选/取消列：勾选顺序 = 列顺序（push 到尾）。 */
  _toggleIndexDialogColumn (col) {
    const d = this._indexDialog
    if (!d || !col) return
    const pos = d.columns.indexOf(col)
    if (pos >= 0) d.columns.splice(pos, 1)
    else d.columns.push(col)
    this._render()
  }

  _moveIndexDialogColumn (pos, dir) {
    const d = this._indexDialog
    if (!d) return
    const next = pos + dir
    if (pos < 0 || next < 0 || next >= d.columns.length) return
    ;[d.columns[pos], d.columns[next]] = [d.columns[next], d.columns[pos]]
    this._render()
  }

  _applyIndexDialog () {
    const d = this._indexDialog
    if (!d) return
    const t = d.table || this._indexTargetTable(this._currentTable()).table
    // 重复兜底拦截：渲染层已禁用「应用」，此处防御直接调用（如键盘回车触发）——不落库、弹窗保留
    if (this._indexDialogDuplicate(d)) {
      showDefWarn('索引列重复', '当前列序列与已有唯一键/索引条目重复，请调整列后再应用。')
      return
    }
    // 空序列兜底拦截：删除条目统一走行内删除按钮（带确认），不经弹窗隐式删除
    if (!d.columns.length) {
      showDefWarn('未选择列', d.i < 0 ? '请至少勾选一个字段后再应用。' : '未选择任何列；如需删除该条目，请用列表行的删除按钮。')
      return
    }
    this._indexDialog = null
    if (!t) { this._render(); return }
    if (d.type === 'unique') {
      if (!Array.isArray(t.uniqueKeys)) t.uniqueKeys = []
      if (d.i < 0) t.uniqueKeys.push(d.columns.slice())
      else {
        // 编辑列时保留条目既有自定义名（对象形态；无名为纯数组，保持纯数组）
        const nm = this._ukName(t.uniqueKeys[d.i])
        t.uniqueKeys[d.i] = nm ? { name: nm, columns: d.columns.slice() } : d.columns.slice()
      }
    } else {
      if (!Array.isArray(t.indexes)) t.indexes = []
      if (d.i < 0) t.indexes.push({ columns: d.columns.slice() })
      else {
        const ix = t.indexes[d.i] || (t.indexes[d.i] = {})
        ix.columns = d.columns.slice()
      }
    }
    this._message = `${d.type === 'unique' ? '唯一键' : '索引'}列已更新`
    this._markDirty()
    this._render()
  }

  _addIndexEntry (type) {
    const target = this._indexTargetTable(this._currentTable())
    if (!target.table) return
    // 不预写占位条目，弹窗以新增模式（i = -1）打开，取消即无痕。
    this._openIndexDialog(type, -1)
  }

  async _removeIndexEntry (type, i, silent) {
    const target = this._indexTargetTable(this._currentTable())
    const t = target.table
    if (!t) return
    if (!silent && !(await admConfirm({ title: '删除索引条目', message: '确定删除该条目？重新部署时对应数据库索引将被 DROP。', danger: true }))) return
    if (type === 'unique' && Array.isArray(t.uniqueKeys)) {
      t.uniqueKeys.splice(i, 1)
      if (!t.uniqueKeys.length) delete t.uniqueKeys
    } else if (type === 'normal' && Array.isArray(t.indexes)) {
      t.indexes.splice(i, 1)
      if (!t.indexes.length) delete t.indexes
    }
    if (!silent) this._message = '条目已删除（重新部署时 DROP 对应索引）'
    this._markDirty()
    if (!silent) this._render()
  }

  _moveIndexEntry (type, i, dir) {
    const target = this._indexTargetTable(this._currentTable())
    const arr = type === 'unique' ? target.table?.uniqueKeys : target.table?.indexes
    if (!Array.isArray(arr)) return
    const next = i + dir
    if (i < 0 || next < 0 || next >= arr.length) return
    ;[arr[i], arr[next]] = [arr[next], arr[i]]
    this._markDirty()
    this._render()
  }

  /** 普通索引名编辑（input 直写，不重渲染保留焦点；留空恢复自动命名）。 */
  _updateIndexName (type, i, value) {
    const target = this._indexTargetTable(this._currentTable())
    const t = target.table
    if (!t) return
    const v = String(value || '').trim()
    if (type === 'unique') {
      const uks = Array.isArray(t.uniqueKeys) ? t.uniqueKeys : (t.uniqueKeys = [])
      const uk = uks[i]
      if (uk == null) return
      const cols = this._ukColumns(uk)
      if (!cols) return
      // 有自定义名 → 对象形态；清空名 → 退化为纯列数组（JSON 干净，等价自动命名）
      uks[i] = v ? { name: v, columns: cols } : cols.slice()
    } else {
      const ix = t.indexes?.[i]
      if (!ix) return
      if (v) ix.name = v
      else delete ix.name
    }
    this._markDirty()
  }

  /** 保存前索引校验（当前定义全部表：DCT 各字典表 / DOC 主表 + 汇总表）。
   *  errors 阻断保存（悬空列引用 / 重复列序列）；warnings 仅提示（前缀冗余 / 同列序列冗余 /
   *  存量 unique 勾选未物化）；空列条目顺带剔除（静默修正）。
   *  列集基准 = 合并列集（本表 fields + 引用字段集展开，与编译层一致——索引引用字段集列合法）。 */
  _validateIndexes () {
    const errors = []
    const warnings = []
    if (this._isBase()) return { errors, warnings } // BASE 字段集不部署成表，无索引概念
    const tables = Array.isArray(this._doc?.[this._tablesKey()]) ? this._doc[this._tablesKey()] : []
    const checkTable = (t, label) => {
      if (!t || typeof t !== 'object') return
      const colSet = new Set(this._fieldGroups({ table: t }).flatMap((g) => g.fields.map((f) => fieldId(f))))
      const seen = new Set()
      const checkEntries = (entries, type) => {
        if (!Array.isArray(entries)) return
        for (const e of entries) {
          const cols = type === 'unique' ? this._ukColumns(e) : (e && Array.isArray(e.columns) ? e.columns : null)
          if (!Array.isArray(cols) || !cols.length) continue
          const customName = type === 'unique' ? this._ukName(e) : ((e && typeof e.name === 'string') ? e.name.trim() : '')
          const nm = `${type === 'unique' ? '唯一键' : '索引'} ${customName || '(自动命名)'}`
          for (const c of cols) {
            if (!colSet.has(c)) errors.push({ table: label, message: `${nm} 引用了不存在的列「${c}」` })
          }
          // 自定义名超 PG 标识符上限 63 字节 → 阻断（会被 PG 静默截断，每次部署名不匹配
          // 反复 DROP/CREATE）；自动名由 _autoIndexName 保证合法，无需校验。
          if (customName && this._utf8ByteLen(customName) > 63) {
            errors.push({ table: label, message: `${type === 'unique' ? '唯一键' : '索引'}名「${customName}」超过 63 字节（PG 标识符上限，当前 ${this._utf8ByteLen(customName)} 字节），请缩短` })
          }
          const key = type + '::' + cols.join(',')
          if (seen.has(key)) errors.push({ table: label, message: `${nm} 与其它条目列序列重复 [${cols.join(', ')}]` })
          seen.add(key)
        }
      }
      checkEntries(t.uniqueKeys, 'unique')
      checkEntries(t.indexes, 'normal')
      // 冗余告警：单列唯一键是复合唯一键前缀；普通索引与唯一键同列序列
      const uks = (Array.isArray(t.uniqueKeys) ? t.uniqueKeys : [])
        .map((uk) => this._ukColumns(uk)).filter(Array.isArray)
      for (const uk of uks) {
        if (uk.length === 1) {
          const hit = uks.find((x) => x !== uk && x.length > 1 && x[0] === uk[0])
          if (hit) warnings.push(`${label}：单列唯一键 [${uk[0]}] 是复合唯一键 [${hit.join(', ')}] 的前缀，冗余`)
        }
      }
      for (const ix of (Array.isArray(t.indexes) ? t.indexes : [])) {
        const cols = ix && Array.isArray(ix.columns) ? ix.columns : null
        if (cols && uks.some((uk) => uk.join(',') === cols.join(','))) {
          warnings.push(`${label}：索引 ${ix.name || '(自动命名)'} 与唯一键列序列相同 [${cols.join(', ')}]，冗余`)
        }
      }
      // 存量字段级 unique 声明未物化 → 提示（界面已不提供字段级「唯一」勾选，唯一约束统一在「索引」页维护）
      const uniqCols = new Set(uks.filter((uk) => uk.length === 1).map((uk) => uk[0]))
      for (const f of (Array.isArray(t.fields) ? t.fields : [])) {
        const id = fieldId(f)
        if (f && f.unique && id && !uniqCols.has(id) && !uks.some((uk) => uk.includes(id))) {
          warnings.push(`${label}：字段 ${id} 声明了 unique 但表级无对应唯一键定义（当前不生效；请在「索引」页添加唯一键后删除该字段属性）`)
        }
      }
      // 空列条目剔除（双形态：纯数组 / {name?,columns}，取列判定，对象形态不能误删）
      if (Array.isArray(t.uniqueKeys)) {
        const next = t.uniqueKeys.filter((uk) => {
          const cols = this._ukColumns(uk)
          return Array.isArray(cols) && cols.length > 0
        })
        if (next.length !== t.uniqueKeys.length) {
          if (next.length) t.uniqueKeys = next
          else delete t.uniqueKeys
          this._dirty = true
        }
      }
      if (Array.isArray(t.indexes)) {
        const next = t.indexes.filter((ix) => ix && Array.isArray(ix.columns) && ix.columns.length > 0)
        if (next.length !== t.indexes.length) {
          if (next.length) t.indexes = next
          else delete t.indexes
          this._dirty = true
        }
      }
      // DOC 汇总表递归
      if (this._kind === 'DOC') {
        for (const key of ['summaries', 'sum']) {
          for (const s of (Array.isArray(t[key]) ? t[key] : [])) {
            checkTable(s, `${label} · 汇总 ${s?.tableName || s?.name || s?.id || ''}`)
          }
        }
      }
    }
    for (const t of tables) {
      checkTable(t, this._indexTableName(t) || '(未命名表)')
    }
    return { errors, warnings }
  }

  // ─── 汇总表（DOC）──────────────────────────────────────────────────────────

  /** 源表全部字段（本表 fields + 引用字段集展开），供「继承所在表的所有列」复制。 */
  _summarySourceFields (entry) {
    const t = (entry || this._currentTable())?.table
    if (!t) return []
    const out = []
    const seen = new Set()
    const push = (f) => { const id = fieldId(f); if (id && !seen.has(id)) { seen.add(id); out.push(f) } }
    // 引用字段集展开（base 文件解析得到的）
    for (const [k, v] of Object.entries(t)) {
      if (!/FieldSet/i.test(k)) continue
      for (const name of Array.isArray(v) ? v : [v]) {
        for (const f of (this._baseFieldSets?.[name] || [])) push(f)
      }
    }
    if (Array.isArray(t.documentFieldSets)) {
      for (const name of t.documentFieldSets) for (const f of (this._baseFieldSets?.[name] || [])) push(f)
    }
    for (const f of (Array.isArray(t.fields) ? t.fields : [])) push(f)
    return out
  }

  /** 汇总表面板：顶部 ID/Name/caption + 下部字段定义区（与主表字段同一套内联编辑器）。 */
  _renderSummaryPanel (entry, summaryId) {
    const t = (entry || this._currentTable())?.table
    const s = (this._tableSummaries(entry) || []).find((x) => x.id === summaryId)
    if (!t || !s) return '<div class="item-sub">汇总表不存在。</div>'
    if (!Array.isArray(s.fields)) s.fields = []
    const cap = (s.caption && (s.caption.zh_CN ?? s.caption)) || ''
    const fieldsTable = s.fields.length
      ? renderFieldTable(s.fields, {
        end: this._schemaEnd(),
        adapter: this._fieldAdapter(),
        ctx: this._fieldCtx(entry),
        keyOf: (f, i) => String(i),
        selectedKey: this._selectedFieldIndex >= 0 ? String(this._selectedFieldIndex) : null,
        actions: { detail: true, remove: true, move: true },
      })
      : '<div class="item-sub">该汇总表暂无字段。点右上「继承所在表列」或「＋」新增字段。</div>'
    return `<div class="summary-panel">
      <section class="summary-meta">
        <div class="meta-row">
          <label>汇总表ID</label><input data-summary-prop="id" data-summary="${escAttr(s.id)}" value="${escAttr(s.id)}">
          <label>名称(Name)</label><input data-summary-prop="name" data-summary="${escAttr(s.id)}" value="${escAttr(s.name || '')}">
          <label>标题(caption)</label><input data-summary-prop="caption" data-summary="${escAttr(s.id)}" value="${escAttr(cap)}">
          <button class="icon-btn summary-apply-btn" data-action="summary-apply" data-summary="${escAttr(s.id)}" title="应用 ID/名称/标题"><ui5-icon name="accept"></ui5-icon></button>
        </div>
      </section>
      <section class="summary-fields">
        <div class="box-head">
          <div class="box-title">字段定义（${s.fields.length}）</div>
          <span class="spacer"></span>
          <button class="icon-btn summary-inherit-btn" data-action="summary-inherit-columns" data-summary="${escAttr(s.id)}" title="继承所在表的所有列"><ui5-icon name="table-column"></ui5-icon></button>
          <button class="icon-btn" data-action="add-field" title="新增字段"><ui5-icon name="add"></ui5-icon></button>
        </div>
        <div class="summary-fields-body">${fieldsTable}</div>
      </section>
    </div>`
  }

  _renderFieldsTable (entry) {
    if (!entry) return '<div class="item-sub">先选择一个表。</div>'
    const groups = this._orderedGroups(entry)
    const docExtra = this._hasDimType()
    const total = groups.length
    return groups.map((g, gi) => {
      const open = this._isGroupOpen(entry, g)
      const cnt = g.fields.length
      const tag = g.editable
        ? '<span class="g-tag editable">可编辑</span>'
        : '<span class="g-tag readonly">引用·可覆盖</span>'
      const addBtn = g.editable
        ? '<button class="icon-btn" data-action="add-field" title="新增字段"><ui5-icon name="add"></ui5-icon></button>'
        : ''
      const copyBtn = `<button class="icon-btn" data-action="copy-group-fields" data-group="${escAttr(g.key)}" title="复制本段字段"><ui5-icon name="copy"></ui5-icon></button>`
      const pasteBtn = g.editable
        ? `<button class="icon-btn" data-action="paste-group-fields" data-group="${escAttr(g.key)}" title="粘贴字段到本段"><ui5-icon name="paste"></ui5-icon></button>`
        : ''
      const tplSel = (g.editable && !this._isBase()) ? this._renderTemplateSelect(entry) : ''
      const removeRefBtn = (!g.editable && g.ref)
        ? `<button class="icon-btn danger" data-action="remove-ref" data-group="${escAttr(g.key)}" title="删除引用"><ui5-icon name="delete"></ui5-icon></button>`
        : ''
      // 分组排序：整组上移/下移（改 table.fieldSetOrder）。首个/末个对应方向禁用。
      const moveUpBtn = total > 1
        ? `<button class="icon-btn" data-action="move-group-up" data-group="${escAttr(g.key)}" ${gi === 0 ? 'disabled' : ''} title="整组上移"><ui5-icon name="slim-arrow-up"></ui5-icon></button>`
        : ''
      const moveDownBtn = total > 1
        ? `<button class="icon-btn" data-action="move-group-down" data-group="${escAttr(g.key)}" ${gi === total - 1 ? 'disabled' : ''} title="整组下移"><ui5-icon name="slim-arrow-down"></ui5-icon></button>`
        : ''
      return `<section class="fgroup ${open ? 'open' : ''}">
        <div class="fgroup-head" data-action="toggle-group" data-group="${escAttr(g.key)}">
          <span class="caret">${open ? '▾' : '▸'}</span>
          <span class="g-title">${escHtml(g.label)}</span>
          ${tag}
          <span class="g-count">${cnt}</span>
          <span class="spacer"></span>
          ${tplSel}
          ${moveUpBtn}${moveDownBtn}
          ${copyBtn}
          ${pasteBtn}
          ${addBtn}
          ${removeRefBtn}
        </div>
        ${open ? `<div class="fgroup-body">${this._renderGroupTable(g, docExtra, entry)}</div>` : ''}
      </section>`
    }).join('')
  }

  /** "引用模板列"下拉：列出未引用的 base fieldSet 模板。 */
  _renderTemplateSelect (entry) {
    const avail = this._availableTemplates(entry)
    // 点击 select 不应触发分组折叠：onclick 阻止冒泡
    const opts = avail.length
      ? avail.map((n) => `<option value="${escAttr(n)}">${escHtml(n)}</option>`).join('')
      : '<option value="" disabled>（无可引用模板）</option>'
    return `<select class="tpl-select" data-template-select title="引用模板列">
      <option value="">+ 引用模板列…</option>
      ${opts}
    </select>`
  }

  _renderGroupTable (g, docExtra, entry) {
    if (!g.fields.length) return `<div class="item-sub">${g.editable ? '该表暂无自定义字段，点击右上角新增。' : '（base 文件未解析到该字段集）'}</div>`
    // 可编辑组：由统一 schema 渲染器产出表格内联编辑（data-field-key=行号 + 规范 data-field-prop）。
    if (g.editable) {
      return renderFieldTable(g.fields, {
        end: this._schemaEnd(),
        adapter: this._fieldAdapter(),
        ctx: this._fieldCtx(entry),
        keyOf: (f, i) => String(i),
        selectedKey: this._selectedFieldIndex >= 0 ? String(this._selectedFieldIndex) : null,
        actions: { detail: true, remove: true, move: true },
      })
    }
    // 引用组：字段可覆盖编辑。base 已带 refDict 时行内引用字典只读显示；其余属性经"详编"按钮进面板覆盖。
    const refDictEditable = (this._kind === 'DOC' || this._kind === 'DCT')
    const showDim = docExtra || (this._kind === 'DCT')
    const tbl = entry?.table || {}
    const setName = g.ref?.name || (g.ref?.type === 'dctKey' ? tbl[g.ref.key] : '') || g.label
    const overrides = normalizeFieldOverrides(tbl.fieldOverrides, tbl.fieldRefDicts)
    const dictOptions = this._refDictOptions(entry)
    return `<table>
      <thead><tr><th class="idx">#</th><th style="width:130px">ID</th><th style="width:150px">标题</th><th style="width:96px">类型</th><th style="width:52px">长度</th><th style="width:50px">可空</th>${showDim ? '<th style="width:90px">维度类型</th>' : ''}${refDictEditable ? '<th style="width:130px">引用字典</th>' : ''}<th style="width:70px">覆盖</th></tr></thead>
      <tbody>${g.fields.map((base, i) => {
        const id = fieldId(base)
        const ov = overrideForField(overrides, id, setName)
        const eff = effectiveField(base, ov)
        const ovKeys = ov ? Object.keys(ov) : []
        const isSel = this._selectedRef && this._selectedRef.setName === setName && this._selectedRef.fieldId === id
        // 维度 + base 未设引用字典 → 行内可下拉覆盖 refDict（保留既有快捷路径）；否则显示有效值。
        const canEditRefDict = eff.dimType === 'dimension' && !base.refDict
        const refVal = eff.refDict || ''
        const refOpts = refVal && !dictOptions.includes(refVal) ? [...dictOptions, refVal] : dictOptions
        return `<tr class="ro ${isSel ? 'selected' : ''}" data-action="select-ref-field" data-set="${escAttr(setName)}" data-fid="${escAttr(id)}">
        <td class="idx">${i + 1}</td>
        <td>${escHtml(id)}</td>
        <td>${escHtml(fieldCaption(eff))}${ovKeys.includes('caption') ? ' <span class="ov-dot" title="已覆盖">✎</span>' : ''}</td>
        <td>${escHtml(eff.dataType || '')}</td>
        <td>${escHtml(eff.fieldLength == null ? '' : String(eff.fieldLength))}</td>
        <td style="text-align:center">${eff.nullable ? '✓' : ''}</td>
        ${showDim ? `<td>${escHtml(eff.dimType || '')}</td>` : ''}
        ${refDictEditable ? `<td>${canEditRefDict
          ? selOpt(`data-ref-field="${escAttr(id)}" data-ref-set="${escAttr(setName)}" data-ref-dict-edit`, refVal, refOpts)
          : (eff.refDict ? escHtml(eff.refDict) : '<span class="ro-na">—</span>')}</td>` : ''}
        <td style="text-align:center">${ovKeys.length ? `<span class="ov-badge" title="已覆盖 ${ovKeys.length} 项">${ovKeys.length}</span>` : ''}<button class="icon-btn" data-action="edit-ref-field" data-set="${escAttr(setName)}" data-fid="${escAttr(id)}" title="详细设置（覆盖）"><ui5-icon name="edit"></ui5-icon></button></td>
      </tr>`
      }).join('')}</tbody>
    </table>`
  }
}

function selOpt (attrs, value, options) {
  return `<select ${attrs}>${options.map((o) => `<option value="${escAttr(String(o))}" ${String(o) === String(value || '') ? 'selected' : ''}>${escHtml(String(o) || '-')}</option>`).join('')}</select>`
}

function baseFieldsForTable (table, kind, baseFieldSets) {
  const refs = []
  if (kind === 'DOC') {
    for (const name of (Array.isArray(table?.documentFieldSets) ? table.documentFieldSets : [])) {
      refs.push({ key: 'documentFieldSets', name, fields: clonePlain(baseFieldSets?.[name] || []) })
    }
  } else if (kind === 'DCT') {
    for (const [key, name] of Object.entries(table || {})) {
      if (key.endsWith('FieldSet') && typeof name === 'string') {
        refs.push({ key, name, fields: clonePlain(baseFieldSets?.[name] || []) })
      }
    }
    for (const name of (Array.isArray(table?.extraFieldSets) ? table.extraFieldSets : [])) {
      refs.push({ key: 'extraFieldSets', name, fields: clonePlain(baseFieldSets?.[name] || []) })
    }
  }
  return refs
}

function buildDefinitionResolvedSchema (doc, kind, baseFieldSets = {}) {
  const source = clonePlain(doc || {})
  const K = String(kind || 'DCT').toUpperCase()
  if (K === 'BASE-DCT' || K === 'BASE-DOC') {
    const fieldSets = Object.entries(source.fieldSets || {}).map(([name, fs]) => {
      const includeFieldSets = Array.isArray(fs?.includeFieldSets) ? fs.includeFieldSets : []
      const includedFields = includeFieldSets.flatMap((ref) => clonePlain(baseFieldSets?.[ref] || []))
      const fields = clonePlain(fs?.fields || [])
      return { name, includeFieldSets, fields, fullFields: [...includedFields, ...fields] }
    })
    return {
      schemaKind: K,
      moduleMeta: source.moduleMeta || {},
      fieldSets,
      source,
    }
  }
  if (K === 'DOC') {
    const tables = (Array.isArray(source.voucherTables) ? source.voucherTables : []).map((table) => {
      const refs = baseFieldsForTable(table, 'DOC', baseFieldSets)
      const fields = clonePlain(table.fields || [])
      return {
        level: table.level || 'L1',
        tableName: table.tableName || '',
        tableAlias: table.tableAlias || '',
        documentFieldSets: clonePlain(table.documentFieldSets || []),
        fieldSetRefs: refs.map(({ key, name }) => ({ key, name })),
        fields,
        fullFields: [...refs.flatMap((r) => r.fields), ...fields],
      }
    })
    return {
      schemaKind: 'DOC',
      moduleMeta: source.moduleMeta || {},
      baseDocMetaRef: source.baseDocMetaRef || null,
      voucherSchema: source.voucherSchema || { schema: [] },
      tables,
      source,
    }
  }
  const dictionaries = (Array.isArray(source.dictionaryTables) ? source.dictionaryTables : []).map((table) => {
    const refs = baseFieldsForTable(table, 'DCT', baseFieldSets)
    const fields = clonePlain(table.fields || [])
    return {
      dictCode: table.dictMeta?.dictCode || table.tableName || '',
      dictName: table.dictMeta?.dictName || '',
      tableName: table.tableName || table.dictMeta?.tableName || table.dictMeta?.dictCode || '',
      dictMeta: clonePlain(table.dictMeta || {}),
      fieldSetRefs: refs.map(({ key, name }) => ({ key, name })),
      fields,
      fullFields: [...refs.flatMap((r) => r.fields), ...fields],
    }
  })
  return {
    schemaKind: 'DCT',
    moduleMeta: source.moduleMeta || {},
    baseDctMetaRef: source.baseDctMetaRef || null,
    dictionaries,
    source,
  }
}

if (!customElements.get('portal-definition-manager')) customElements.define('portal-definition-manager', PortalDefinitionManager)

// 配套元素（Source/Schema/Inspector/List）已拆到 ./portal-definition-panels.js（副作用注册 customElements.define）
import './portal-definition-panels.js'

for (const [prefix, K] of [['dct', 'DCT'], ['doc', 'DOC'], ['base-dct', 'BASE-DCT'], ['base-doc', 'BASE-DOC']]) {
  registerWorkspaceViewType(`${prefix}-def-manager`, () => `<portal-definition-manager data-kind="${K}"></portal-definition-manager>`)
  registerWorkspaceViewType(`${prefix}-def-source`, () => `<portal-definition-source data-kind="${K}"></portal-definition-source>`)
  if (prefix !== 'dct' && prefix !== 'doc') registerWorkspaceViewType(`${prefix}-def-schema`, () => `<portal-definition-schema data-kind="${K}"></portal-definition-schema>`)
  registerWorkspaceViewType(`${prefix}-def-list`, () => `<portal-definition-list data-kind="${K}"></portal-definition-list>`)
  registerWorkspaceViewType(`${prefix}-def-inspector`, () => `<portal-definition-inspector data-kind="${K}"></portal-definition-inspector>`)
}
