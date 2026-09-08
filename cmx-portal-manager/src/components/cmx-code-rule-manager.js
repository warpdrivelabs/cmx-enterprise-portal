/**
 * cmx-code-rule-manager —— 编码规则管理页（三区架构，照搬定义中心）。
 *
 * 三个独立组件 + view type，由 workspace 框架分别放入 explorer / content / property 区：
 *   explorer  → cmx-code-rule-list       规则列表（GET /api/code/rules，点选/新建）
 *   content   → cmx-code-rule-manager    段序列编辑 + 保存/删除（controller，持有状态）
 *   property  → cmx-code-rule-inspector  规则属性表单（委托 controller 收集值）
 *
 * 三者通过 code-rule-bus 单例联动：
 *   list 点选 → bus.select(code) → controller 加载 → bus.emitState() → inspector 刷新
 *   inspector 编辑 → handlePanelInput 委托 controller 同步到 _currentRule（不重渲染，保焦点）
 *   controller 保存/删除后 → bus.setItems 刷新 list + bus.emitState 刷新 inspector
 *
 * 渲染：命令式 innerHTML（非 Lit html``），CSS 内联 <style>，事件用 data-action 委托。
 * 风格对齐 portal-definition-manager / portal-definition-panels。
 */
import { LitElement } from 'lit'
import { apiFetch } from 'cmx-ui5-runtime/api-client'
import { registerWorkspaceViewType } from '../lib/workspace-view-renderer.js'
import { ADM_ALL_CSS, admConfirm, admColorSchemeCss, admEmptyHtml, admEntryDam } from '../lib/admin-ui-kit.js'
import { damOptionHtml } from '../lib/dam-options.js'
import { busForCodeRule } from '../lib/code-rule-bus.js'
import { buildHttpError, extractErrorDetails, showDefError } from '../lib/notify.js'
import { escHtml, escAttr } from '../lib/escape.js'

const isEditingEl = (root) => {
  const ae = root && root.activeElement
  return ae instanceof HTMLElement && /^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName)
}

/** 判断段是否有用户填写的非默认值（用于切换段类型前的确认判断）。 */
const hasUserData = (seg) => {
  const base = String(seg.type || '').split(':')[0]
  switch (base) {
    case 'const': return String(seg.value ?? '').trim() !== ''
    case 'ref': {
      // map 可能是对象（后端存储形态），不能用 String() 判空（会得 [object Object]）
      const m = seg.map
      const hasMap = m != null && (typeof m === 'object' ? Object.keys(m).length > 0 : String(m).trim() !== '')
      return String(seg.field ?? '').trim() !== '' || hasMap
    }
    case 'custom': return String(seg.type ?? '').includes(':')
    case 'random': return String(seg.charset ?? '0123456789') !== '0123456789' || String(seg.mode ?? 'charset') !== 'charset'
    // serial/date/dateSerial 的字段都有默认值，只有用户改动 width/start 才算有数据
    case 'serial':
      return (Number(seg.width) || 4) !== 4 || (Number(seg.start) || 1) !== 1 || (Number(seg.step) || 1) !== 1
    case 'dateSerial':
      return (Number(seg.width) || 4) !== 4 || (Number(seg.start) || 1) !== 1
    default: return false
  }
}

// ── DAM 解析 + 统一 fetch（带 domain/app/module 请求头） ──────────────────
// 规则按 domain/application/module 隔离。DAM 不走菜单配置（旧 getMenuCache 方式已废弃）：
// openNode 时由框架（dam-context.injectDamIntoExtras）自动注入 workspace.context，
// 页面组件向上找到标 data-cmx-workspace-id 的 tab pane，经 mainapp.workspaces 取回
// context，读短名三键（domain/application/module，约定见 lib/dam-context.js DAM_KEYS）。
// context 同步可读、随 tab 切换刷新，无需缓存。读不到时给空串 → 不带头（后端返回全部规则）。
// db_id 不传（后端 resolve_db_id 自动路由到业务库）。

/** 规则管理专用 fetch：自动带 DAM 请求头（有值才带）。el 传组件实例。
 *  头取 bus.damFilter（列表三级筛选的当前值）：列表/查看/保存/删除共用同一筛选口径——
 *  列表里看得到的规则必然匹配当前筛选，对它操作带同样头不会错配；新建时空 body 由后端按头补归属。
 *  damFilter 为 null（未初始化）时不带头（后端返回全部规则）。 */
function codeFetch (url, opts = {}, el = null) {
  const headers = { ...(opts.headers || {}) }
  const f = el && el._bus ? el._bus.damFilter : null
  if (f) {
    if (f.domain) headers.domain_code = f.domain
    if (f.application) headers.application_code = f.application
    if (f.module) headers.module_code = f.module
  }
  return fetch(url, { ...opts, headers })
}

// ── 常量 ────────────────────────────────────────────────────────────────
/** 段类型中文标签（type 前缀匹配：custom:xxx 归到 custom）。 */
const SEG_TYPES = [
  { value: 'const', label: '固定段' },
  { value: 'serial', label: '流水段' },
  { value: 'date', label: '日期段' },
  { value: 'dateSerial', label: '日期流水' },
  { value: 'ref', label: '引用段' },
  { value: 'random', label: '随机段' },
  { value: 'custom', label: '自定义' },
]

/** 流水重置周期。 */
const RESET_BYS = [
  { value: 'global', label: '全局' },
  { value: 'daily', label: '按日' },
  { value: 'classify', label: '按分类' },
  { value: 'org', label: '按组织' },
]
/** 日期格式。 */
const DATE_FORMATS = ['YYYYMMDD', 'YYMMDD', 'YYYYMM', 'YYMM']
/** 规则模式（后端契约：auto=引擎生成 / manual=用户手敲校验）。 */
const RULE_MODES = [
  { value: 'auto', label: '自动生成（段引擎）' },
  { value: 'manual', label: '手动录入（正则校验）' },
]

/** 规则属性默认值（新建规则用）。 */
const DEFAULT_RULE_SPEC = () => ({
  rule_code: '',
  rule_name: '',
  mode: 'auto',
  org_scope: '',
  condition: '',
  segments: [],
  joiner: '',
  pattern: '',
  enable_gap: false,
  priority: 0,
  is_active: true,
})

/** 新段默认值（按段类型）。 */
const DEFAULT_SEGMENT = (type) => {
  const base = String(type || '').split(':')[0]
  switch (base) {
    case 'const': return { type: 'const', value: '' }
    case 'serial': return { type: 'serial', width: 4, start: 1, step: 1, reset_by: 'global' }
    case 'date': return { type: 'date', format: 'YYYYMMDD' }
    case 'dateSerial': return { type: 'dateSerial', format: 'YYYYMMDD', width: 4, start: 1, step: 1, reset_by: 'daily' }
    case 'ref': return { type: 'ref', field: '', map: '', take: 0 }
    case 'random': return { type: 'random', mode: 'charset', charset: '0123456789', width: 4, min: 0, max: 9999, pad: 0 }
    case 'custom': return { type: 'custom', name: '' }
    default: return { type: 'const', value: '' }
  }
}

/** 段字段说明（label → title tooltip），帮助用户理解术语。 */
const SEG_FIELD_HINTS = {
  value: '固定文本，直接拼进编码',
  width: '数字长度，不足时左侧补零（如 width=4 → 0001）',
  start: '流水起始值',
  step: '每次递增量',
  reset_by: '流水归零周期：全局/按日/按分类/按组织',
  format: '日期格式，如 YYYYMMDD 表示年月日',
  field: '引用的业务字段名，编码时取该字段值',
  map: '字段值→显示值的映射，JSON 格式',
  take: '取字段值的前 N 位',
  pad: '不足此宽度时补齐',
  min: '随机数最小值（range 模式）',
  max: '随机数最大值（range 模式）',
  charset: '随机字符来源：digit/alpha/alnum/hex 或自定义字符',
  mode: '随机生成方式：字符集 或 数值区间',
  name: '自定义段类型名，如 check_digit（校验位）',
}

/** 快捷模板（新建态一键填充段序列）。 */
const TEMPLATES = [
  {
    id: 'prefix-date-serial',
    label: '前缀 + 日期 + 流水',
    hint: '最常用：单据号 = 固定前缀 + 日期 + 流水号',
    segments: [
      { type: 'const', value: 'DOC' },
      { type: 'date', format: 'YYYYMMDD' },
      { type: 'serial', width: 4, start: 1, step: 1, reset_by: 'daily' },
    ],
  },
  {
    id: 'prefix-serial',
    label: '前缀 + 流水',
    hint: '全局连续流水号：固定前缀 + 流水号',
    segments: [
      { type: 'const', value: 'PRE' },
      { type: 'serial', width: 4, start: 1, step: 1, reset_by: 'global' },
    ],
  },
  {
    id: 'date-serial',
    label: '日期流水',
    hint: '按日重置：日期 + 当日流水号',
    segments: [
      { type: 'dateSerial', format: 'YYYYMMDD', width: 4, start: 1, step: 1, reset_by: 'daily' },
    ],
  },
]

/**
 * 本地预览引擎：忠实模拟后端 rule_algo::evaluate_segments 的段拼接逻辑。
 *
 * 与后端的对应关系：
 * - const/date/ref/custom → Literal 直接拼前缀
 * - serial/dateSerial → 示例号（用 start 值补零），标注「示例，实际=反查max+1」
 * - random → 生成一个示例串，标注「示例」
 * - joiner → 段间插入连接符
 *
 * @param {object} rule - 规则 spec（取 joiner）
 * @param {Array} segments - 段序列
 * @returns {{ code: string, warnings: string[], hasExample: boolean }}
 */
function previewSegments (rule, segments) {
  const joiner = rule && rule.joiner ? rule.joiner : ''
  const warnings = []
  let hasExample = false
  const parts = []
  const validFormats = ['YYYY', 'YY', 'YYYYMM', 'YYMM', 'YYYYMMDD', 'YYMMDD', 'MM', 'DD']

  for (const seg of segments) {
    const base = String(seg.type || '').split(':')[0]
    let part = ''
    switch (base) {
      case 'const':
        part = String(seg.value ?? '')
        if (!part) warnings.push('固定段的「值」为空')
        break
      case 'date': {
        const fmt = seg.format || 'YYYYMMDD'
        if (!validFormats.includes(fmt)) warnings.push(`日期格式「${fmt}」不在支持列表内`)
        part = formatDatePreview(fmt)
        break
      }
      case 'serial': {
        // 纯流水段：仅输出流水串（reset 维度由可选 resetBy 决定，日期由别处 date 段提供）
        const w = Math.max(1, Number(seg.width) || 4)
        const start = Number(seg.start) || 1
        part = String(start).padStart(w, '0')
        hasExample = true
        break
      }
      case 'dateSerial': {
        // 日期流水段（date + serial 语法糖）：日期串 + 日内流水串，按日重置。
        // 对齐后端 cmx-code date_serial.rs：format_date(now, format) 拼入前缀作 reset_key，
        // 再拼流水号。例 format=YYYYMMDD,width=6,start=1 → 20260807000001
        const fmt = seg.format || 'YYYYMMDD'
        if (!validFormats.includes(fmt)) warnings.push(`日期格式「${fmt}」不在支持列表内`)
        const dateStr = formatDatePreview(fmt)
        const w = Math.max(1, Number(seg.width) || 4)
        const start = Number(seg.start) || 1
        const serialStr = String(start).padStart(w, '0')
        part = `${dateStr}${serialStr}`
        hasExample = true
        break
      }
      case 'ref': {
        const field = String(seg.field ?? '').trim()
        if (!field) warnings.push('引用段未指定字段名')
        part = field ? `{${field}}` : '{字段}'
        break
      }
      case 'random': {
        const mode = seg.mode || 'charset'
        if (mode === 'charset') {
          const charset = String(seg.charset || '0123456789')
          const w = Math.max(1, Number(seg.width) || 4)
          let s = ''
          for (let i = 0; i < w; i++) s += charset[i % charset.length] || '0'
          part = s
        } else {
          const min = Number(seg.min) || 0
          const max = Number(seg.max) || 9999
          const w = Math.max(1, Number(seg.pad) || 0) || String(max).length
          part = String(min).padStart(w, '0')
        }
        hasExample = true
        break
      }
      case 'custom': {
        const name = String(seg.type || '').split(':')[1] || ''
        if (name === 'check_digit') {
          // mod11 校验位：对已拼前缀算（与后端 segments/custom.rs 一致）
          const prefix = parts.join(joiner)
          part = mod11CheckDigit(prefix)
        } else {
          part = '?'
          warnings.push(name ? `自定义段「${name}」未实现预览` : '自定义段未指定类型名')
        }
        break
      }
      default:
        warnings.push(`未知段类型「${base}」`)
        part = '?'
    }
    parts.push(part)
  }

  const code = parts.join(joiner)
  return { code, warnings, hasExample }
}

/** 按格式生成当前日期预览串（对齐后端 chrono 格式）。 */
function formatDatePreview (format) {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const yy = String(y).slice(-2)
  switch (format) {
    case 'YYYY': return String(y)
    case 'YY': return yy
    case 'YYYYMM': return `${y}${m}`
    case 'YYMM': return `${yy}${m}`
    case 'YYYYMMDD': return `${y}${m}${d}`
    case 'YYMMDD': return `${yy}${m}${d}`
    case 'MM': return m
    case 'DD': return d
    default: return `${y}${m}${d}`
  }
}

/** mod11 校验位算法（对齐后端 segments/custom.rs check_digit）。权重 2..7 循环，余数 10→X。 */
function mod11CheckDigit (s) {
  const weights = [2, 3, 4, 5, 6, 7]
  let sum = 0
  let wi = 0
  for (let i = s.length - 1; i >= 0; i--) {
    const ch = s[i]
    if (ch >= '0' && ch <= '9') {
      sum += (ch.charCodeAt(0) - 48) * weights[wi % weights.length]
      wi++
    }
  }
  const r = sum % 11
  return r === 10 ? 'X' : String(r)
}

// ════════════════════════════════════════════════════════════════════════
//  Controller（content 区）：段序列编辑 + 保存/删除，持有 _currentRule/_segments
// ════════════════════════════════════════════════════════════════════════
class CmxCodeRuleManager extends LitElement {
  constructor () {
    super()
    this.attachShadow({ mode: 'open' })
    /** @type {CodeRuleBus} */
    this._bus = busForCodeRule()
    this._currentRule = null   // 当前规则完整 RuleSpec（null=未选/新建态）
    this._segments = []        // 段序列工作态（与 _currentRule.segments 同步）
    this._isNew = false        // 是否新建态
    this._loading = false
    this._message = ''
    this._saving = false
    this._wired = false
    this._validationErrors = {}  // { [prop]: errorMsg } 字段级校验错误（供 inspector 渲染红框）
    this._onClick = (e) => this._handleClick(e)
    this._onInput = (e) => this._handleInput(e)
    this._onChange = (e) => this._handleChange(e)
    this._onBusSelect = (e) => { void this._loadRule(e.detail?.code || '') }
  }

  connectedCallback () {
    super.connectedCallback()
    this._render()
    this._wire()
    this._bus.setController(this)
    this._bus.addEventListener('select', this._onBusSelect)
    // 首次进入：若总线已有选中，加载之
    if (this._bus.selectedCode) void this._loadRule(this._bus.selectedCode)
  }

  disconnectedCallback () {
    super.disconnectedCallback()
    const sr = this.shadowRoot
    if (sr) {
      sr.removeEventListener('click', this._onClick)
      sr.removeEventListener('input', this._onInput)
      sr.removeEventListener('change', this._onChange)
    }
    this._bus.removeEventListener('select', this._onBusSelect)
    this._bus.clearController(this)
    this._wired = false
    if (this._previewTimer) { clearTimeout(this._previewTimer); this._previewTimer = null }
  }

  _wire () {
    if (this._wired) return
    this._wired = true
    const sr = this.shadowRoot
    sr.addEventListener('click', this._onClick)
    sr.addEventListener('input', this._onInput)
    sr.addEventListener('change', this._onChange)
  }

  // ── 数据装载 ──────────────────────────────────────────────────────────
  async _loadRule (ruleCode) {
    if (!ruleCode) { this._startNew(); return }
    this._loading = true
    this._message = ''
    this._render()
    try {
      const res = await codeFetch(`/api/code/rules/${encodeURIComponent(ruleCode)}`, {}, this)
      const data = await res.json().catch(() => null)
      if (!res.ok) throw buildHttpError('加载规则失败', res, data)
      const spec = (data && (data.data || data)) || null
      if (!spec || typeof spec !== 'object') throw new Error('规则数据为空')
      this._currentRule = normalizeRule(spec)
      this._segments = Array.isArray(this._currentRule.segments) ? this._currentRule.segments.map((s) => ({ ...s })) : []
      this._isNew = false
    } catch (err) {
      this._message = '加载规则失败'
      showDefError('加载规则失败', err, { details: extractErrorDetails(err), helpCode: 'CODE_RULE_LOAD_FAILED' })
    } finally {
      this._loading = false
      this._render()
      this._bus.emitState(true)
    }
  }

  _startNew () {
    this._currentRule = DEFAULT_RULE_SPEC()
    this._segments = []
    this._isNew = true
    this._message = ''
    this._render()
    this._bus.emitState(true)
  }

  /** 把后端返回的 RuleSpec（下划线命名）归一到内部统一形态。 */
  get currentRule () { return this._currentRule }
  get segments () { return this._segments }
  get isNew () { return this._isNew }
  get message () { return this._message }
  get saving () { return this._saving }
  get validationErrors () { return this._validationErrors }

  // ── 段序列操作 ────────────────────────────────────────────────────────
  _addSegment () {
    this._segments.push(DEFAULT_SEGMENT('const'))
    this._render()
    const rows = this.shadowRoot.querySelectorAll('.seg-row')
    if (rows.length) {
      const sel = rows[rows.length - 1].querySelector('select[data-seg-type]')
      if (sel) sel.focus()
    }
  }

  /** 应用快捷模板：替换当前段序列（仅新建态或用户确认后）。 */
  async _applyTemplate (tplId) {
    const tpl = TEMPLATES.find((t) => t.id === tplId)
    if (!tpl) return
    // 已有段时确认是否替换
    if (this._segments.length > 0) {
      const ok1 = await admConfirm({ title: '应用模板', message: '当前已有段配置，应用模板将替换它们，是否继续？' })
      if (!ok1) return
    }
    this._segments = tpl.segments.map((s) => ({ ...s }))
    this._render()
  }

  _removeSegment (idx) {
    if (idx < 0 || idx >= this._segments.length) return
    this._segments.splice(idx, 1)
    this._render()
  }

  _moveSegment (idx, dir) {
    const j = idx + dir
    if (idx < 0 || j < 0 || idx >= this._segments.length || j >= this._segments.length) return
    const arr = this._segments
    const tmp = arr[idx]; arr[idx] = arr[j]; arr[j] = tmp
    this._render()
  }

  async _changeSegmentType (idx, newType) {
    if (idx < 0 || idx >= this._segments.length) return
    // 旧段若有用户填写的非默认值，提示确认避免静默丢失（切换类型会用 DEFAULT_SEGMENT 整段替换）
    const oldSeg = this._segments[idx]
    if (oldSeg && hasUserData(oldSeg) && oldSeg.type !== newType) {
      const ok2 = await admConfirm({ title: '切换段类型', message: '切换段类型会清空当前段的已填内容，是否继续？' })
      if (!ok2) {
        // 用户取消 → 恢复 select 的显示值（不改 _segments），不做任何变更
        const row = this.shadowRoot.querySelectorAll('.seg-row')[idx]
        if (row) {
          const sel = row.querySelector('select[data-seg-type]')
          if (sel) {
            sel.value = String(oldSeg.type || 'const').split(':')[0]
          }
        }
        return
      }
    }
    this._segments[idx] = DEFAULT_SEGMENT(newType)
    this._render()
  }

  /** 把段编辑区的 DOM 输入同步回 this._segments（input/change 时调用）。 */
  _syncSegmentsFromDom () {
    const rows = this.shadowRoot.querySelectorAll('.seg-row')
    rows.forEach((row, i) => {
      const seg = this._segments[i]
      if (!seg) return
      const typeSel = row.querySelector('select[data-seg-type]')
      if (typeSel) seg.type = typeSel.value
      row.querySelectorAll('[data-seg-field]').forEach((el) => {
        const field = el.getAttribute('data-seg-field')
        if (!field) return
        let v = el.value
        if (el.type === 'checkbox') v = el.checked
        else if (el.type === 'number') v = v === '' ? '' : Number(v)
        else if (field === 'map' && typeof v === 'string' && v.trim()) {
          // ref 段映射在文本框里是 JSON 文本，回收时反序列化回对象；非法 JSON 保留原串，留待 _validate 提示
          try { v = JSON.parse(v) } catch { /* 非法 JSON，保留字符串，校验阶段报错 */ }
        }
        seg[field] = v
      })
    })
  }

  // ── 检视器委托：属性表单 input 时收集到 _currentRule（不重渲染，保焦点） ──
  handlePanelInput (e) {
    const el = e.target
    if (!(el instanceof HTMLElement) || !this._currentRule) return
    if (!el.dataset.prop) return
    const r = this._currentRule
    const p = el.dataset.prop
    if (el.type === 'checkbox') r[p] = el.checked
    else if (el.type === 'number') r[p] = el.value === '' ? 0 : Number(el.value)
    else r[p] = el.value
  }

  handlePanelChange (e) {
    this.handlePanelInput(e)
    // mode 或 pattern 变化时，中间区需重渲染（manual 模式切换段编辑/正则面板）
    const el = e.target
    if (el instanceof HTMLElement && (el.dataset.prop === 'mode' || el.dataset.prop === 'pattern')) {
      this._render()
    }
  }

  // ── 保存 / 删除 ───────────────────────────────────────────────────────
  /** 前置校验：返回错误对象 { [prop]: msg }，空对象=通过。 */
  _validate () {
    const r = this._currentRule
    const errs = {}
    if (!String(r.rule_code || '').trim()) errs.rule_code = '请填写规则编码'
    else if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(String(r.rule_code).trim())) {
      errs.rule_code = '编码须以字母开头，仅含字母、数字、下划线'
    }
    if (!String(r.rule_name || '').trim()) errs.rule_name = '请填写规则名称'
    if ((r.mode || 'auto') === 'auto' && this._segments.length === 0) {
      errs.segments = '自动生成模式至少需要 1 个段'
    }
    // ref 段的「映射」若填写，须为合法 JSON 对象（数组 / 非法文本报错）
    for (const seg of this._segments) {
      if (String(seg.type || '').split(':')[0] !== 'ref') continue
      const m = seg.map
      if (m == null || m === '') continue
      if (typeof m === 'string') {
        errs.segments = '引用段「映射」须为合法 JSON 对象，例如 {"gys":"GYS"}'
        break
      }
      if (Array.isArray(m)) {
        errs.segments = '引用段「映射」须为 JSON 对象（不能是数组）'
        break
      }
    }
    return errs
  }

  async _save () {
    if (!this._currentRule) return
    const r = this._currentRule
    // 前置校验（不发请求）：字段级错误供 inspector 红框
    this._validationErrors = this._validate()
    if (Object.keys(this._validationErrors).length) {
      // 取第一条错误作为消息行（segments 错误来自中间区，其余来自属性表单）
      const firstProp = Object.keys(this._validationErrors)[0]
      this._message = this._validationErrors[firstProp]
      this._render()
      this._bus.emitState(true)  // 触发 inspector 重渲染显示红框
      return
    }
    this._validationErrors = {}
    const body = {
      rule_code: String(r.rule_code ?? '').trim(),
      rule_name: String(r.rule_name ?? '').trim(),
      mode: r.mode || 'auto',
      org_scope: r.org_scope || '',
      condition: r.condition || '',
      segments: this._segments.map((s) => ({ ...s })),
      joiner: r.joiner || '',
      pattern: r.pattern || '',
      enable_gap: !!r.enable_gap,
      priority: Number(r.priority) || 0,
      is_active: r.is_active !== false,
      domain_code: r.domain_code || '',
      application_code: r.application_code || '',
      module_code: r.module_code || '',
    }
    const isNew = this._isNew || !this._bus.items.some((x) => x.ruleCode === body.rule_code)
    this._saving = true
    this._message = ''
    this._render()
    try {
      // POST 新建 → /api/code/rules（ruleCode 在 body）；PUT 更新 → /api/code/rules/{ruleCode}
      const url = isNew ? '/api/code/rules' : `/api/code/rules/${encodeURIComponent(body.rule_code)}`
      const res = await codeFetch(url, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }, this)
      const data = await res.json().catch(() => null)
      if (!res.ok) throw buildHttpError('保存规则失败', res, data)
      this._isNew = false
      this._currentRule = normalizeRule(body)
      this._validationErrors = {}
      this._message = '已保存'
      // 刷新列表
      await refreshRuleList(this._bus, this)
      this._bus.select(body.rule_code)
    } catch (err) {
      this._message = '保存规则失败'
      showDefError('保存规则失败', err, { details: extractErrorDetails(err), helpCode: 'CODE_RULE_SAVE_FAILED' })
    } finally {
      this._saving = false
      this._render()
      this._bus.emitState(true)
    }
  }

  async _delete () {
    const r = this._currentRule
    if (!r || !r.rule_code) return
    const ok = await admConfirm({ title: '删除规则', message: `确认删除规则「${r.rule_name || r.rule_code}」？此操作不可撤销。`, danger: true })
    if (!ok) return
    this._saving = true
    this._message = ''
    this._render()
    this._bus.emitState(true)
    try {
      const res = await codeFetch(`/api/code/rules/${encodeURIComponent(r.rule_code)}`, { method: 'DELETE' }, this)
      const data = await res.json().catch(() => null)
      if (!res.ok) throw buildHttpError('删除规则失败', res, data)
      this._currentRule = null
      this._segments = []
      this._isNew = false
      this._message = '已删除'
      await refreshRuleList(this._bus, this)
      this._bus.select('')
    } catch (err) {
      this._message = '删除规则失败'
      showDefError('删除规则失败', err, { details: extractErrorDetails(err), helpCode: 'CODE_RULE_DELETE_FAILED' })
    } finally {
      this._saving = false
      this._render()
      this._bus.emitState(true)
    }
  }

  // ── 事件路由 ──────────────────────────────────────────────────────────
  _handleClick (e) {
    const t = e.target
    if (!(t instanceof Element)) return
    const btn = t.closest('[data-action]')
    if (!(btn instanceof HTMLElement)) return
    const action = btn.getAttribute('data-action')
    const idxAttr = btn.getAttribute('data-idx')
    const idx = idxAttr != null ? parseInt(idxAttr, 10) : NaN
    switch (action) {
      case 'save': void this._save(); return
      case 'delete': void this._delete(); return
      case 'add-seg': this._addSegment(); return
      case 'del-seg': if (!Number.isNaN(idx)) this._removeSegment(idx); return
      case 'up-seg': if (!Number.isNaN(idx)) this._moveSegment(idx, -1); return
      case 'down-seg': if (!Number.isNaN(idx)) this._moveSegment(idx, 1); return
      case 'apply-template': {
        const tplId = btn.getAttribute('data-tpl')
        if (tplId) this._applyTemplate(tplId)
        return
      }
      default: return
    }
  }

  _handleInput (e) {
    const t = e.target
    if (!(t instanceof Element)) return
    if (t.closest('.seg-row')) {
      this._syncSegmentsFromDom()
      this._schedulePreviewRefresh()
    }
  }

  _handleChange (e) {
    const t = e.target
    if (!(t instanceof Element)) return
    if (t.matches('select[data-seg-type]')) {
      const row = t.closest('.seg-row')
      if (row) {
        const rows = Array.from(this.shadowRoot.querySelectorAll('.seg-row'))
        const idx = rows.indexOf(row)
        if (idx >= 0) this._changeSegmentType(idx, t.value)
      }
      return
    }
    if (t.closest('.seg-row')) {
      this._syncSegmentsFromDom()
      this._schedulePreviewRefresh()
    }
  }

  /** 防抖重渲染预览：段字段变化时延迟刷新，避免 input 每次都重建 DOM 丢焦点。
   *  只重渲染预览区（而非整个中间区），用 DOM patch 保持段输入焦点。 */
  _schedulePreviewRefresh () {
    if (this._previewTimer) clearTimeout(this._previewTimer)
    this._previewTimer = setTimeout(() => this._refreshPreviewOnly(), 300)
  }

  /** 仅更新预览卡片 DOM，不重建整个中间区（保焦点）。 */
  _refreshPreviewOnly () {
    if (!this._currentRule) return
    const isManual = (this._currentRule.mode || 'auto') === 'manual'
    if (isManual) return  // manual 模式无预览卡片
    const previewWrap = this.shadowRoot.querySelector('.crm-preview')
    if (!previewWrap) return
    const { code, warnings, hasExample } = previewSegments(this._currentRule, this._segments)
    const warnHtml = warnings.length
      ? `<ul class="prev-warns">${warnings.map((w) => `<li>${escHtml(w)}</li>`).join('')}</ul>`
      : ''
    const exampleTag = hasExample
      ? `<span class="prev-tag" title="流水/随机号为示例值，实际生成时按反查max+1">ⓘ 示例号</span>`
      : ''
    const codeHtml = code
      ? `<code class="prev-code">${escHtml(code)}</code>`
      : '<span class="prev-empty">添加段并填写内容后可预览编码</span>'
    // eslint-disable-next-line no-restricted-syntax -- 动态值均经 escHtml/escAttr。
    previewWrap.innerHTML = `<span class="prev-label">预览</span>${codeHtml}${exampleTag}${warnHtml}`
  }

  // ── 渲染 ──────────────────────────────────────────────────────────────
  _render () {
    if (!this.shadowRoot) return
    // eslint-disable-next-line no-restricted-syntax -- 动态值均经 escHtml/escAttr。
    this.shadowRoot.innerHTML = `
      <style>${CONTROLLER_STYLES}${admColorSchemeCss()}</style>
      <div class="crm-content">
        ${this._renderBody()}
      </div>
    `
  }

  _renderBody () {
    const has = !!this._currentRule
    if (!has) {
      return `<div class="crm-empty">请在左侧选择或新建规则</div>`
    }
    if (this._loading) {
      return `<div class="crm-loading">加载中…</div>`
    }
    const r = this._currentRule
    const isManual = (r.mode || 'auto') === 'manual'
    // 模式 chip（修复原 SEG_TYPE_LABEL('') 永远显示"段"的 bug）
    const modeLabel = isManual ? '手动录入' : '自动生成'
    const msgLine = this._message
      ? `<div class="crm-msg ${/失败|错误|请填|已存在|至少需要/.test(this._message) ? 'err' : 'ok'}">${escHtml(this._message)}</div>`
      : ''
    const toolbar = `
      <div class="crm-toolbar">
        <span class="crm-title">${isManual ? '正则校验' : '段序列'}</span>
        <span class="chip">${escHtml(modeLabel)}</span>
        <span class="spacer"></span>
        <button type="button" class="adm-icon-btn primary" data-action="save" ${this._saving ? 'disabled' : ''}>${this._saving ? '保存中…' : '保存'}</button>
        <button type="button" class="adm-icon-btn danger" data-action="delete" ${this._isNew || this._saving ? 'disabled' : ''}>删除</button>
      </div>`

    // manual 模式：中间区显示正则校验说明面板（段被 saver 忽略，不应在此编辑段）
    if (isManual) {
      const segErr = this._validationErrors.segments
        ? `<div class="crm-msg err">${escHtml(this._validationErrors.segments)}</div>` : ''
      return `
        ${toolbar}
        <div class="crm-seg-area">
          <div class="manual-panel">
            <div class="manual-icon">✎</div>
            <div class="manual-text">
              <p class="manual-title">手动录入模式</p>
              <p class="manual-desc">此模式下编码由用户在业务录入时手动填写，引擎不会自动生成。你在右侧「模板」中填写的正则表达式用于校验用户输入的格式。</p>
              <p class="manual-desc">例如模板填 <code>^[A-Z]{2}-\\d{6}$</code>，则用户输入需匹配「2 字母 + 横杠 + 6 位数字」（如 <code>AB-123456</code>）。</p>
              <p class="manual-hint">提示：段序列仅对「自动生成」模式生效，手动模式请忽略段配置。</p>
            </div>
          </div>
          ${segErr}
        </div>
        ${msgLine}
      `
    }

    // auto 模式：段序列编辑 + 预览
    const segs = this._segments
    const preview = this._renderPreview(r, segs)
    const segsErr = this._validationErrors.segments
      ? `<div class="crm-msg err">${escHtml(this._validationErrors.segments)}</div>` : ''
    const isNewEmpty = this._isNew && segs.length === 0
    const rowsHtml = segs.length
      ? segs.map((s, i) => this._renderSegRow(s, i, segs.length)).join('')
      : (isNewEmpty
        ? this._renderGuide()  // 新建空态：显示引导面板
        : `<div class="seg-empty">暂无段，点击下方添加</div>`)
    return `
      ${toolbar}
      ${preview}
      <div class="crm-seg-area">
        ${segsErr}
        ${rowsHtml}
        ${isNewEmpty ? '' : '<button type="button" class="adm-icon-btn primary" data-action="add-seg"><ui5-icon name="add"></ui5-icon>添加段</button>'}
      </div>
      ${msgLine}
    `
  }

  /** 渲染实时预览卡片。 */
  _renderPreview (rule, segments) {
    if (!segments.length) return ''  // 空段时不显示预览（引导面板已替代）
    const { code, warnings, hasExample } = previewSegments(rule, segments)
    const warnHtml = warnings.length
      ? `<ul class="prev-warns">${warnings.map((w) => `<li>${escHtml(w)}</li>`).join('')}</ul>`
      : ''
    const exampleTag = hasExample
      ? `<span class="prev-tag" title="流水/随机号为示例值，实际生成时按反查max+1">ⓘ 示例号</span>`
      : ''
    const codeHtml = code
      ? `<code class="prev-code">${escHtml(code)}</code>`
      : '<span class="prev-empty">添加段并填写内容后可预览编码</span>'
    return `
      <div class="crm-preview">
        <span class="prev-label">预览</span>
        ${codeHtml}
        ${exampleTag}
        ${warnHtml}
      </div>
    `
  }

  /** 渲染新建态引导面板（空段时显示模板快捷入口）。 */
  _renderGuide () {
    const tplButtons = TEMPLATES.map((t) =>
      `<button type="button" class="tpl-btn" data-action="apply-template" data-tpl="${escAttr(t.id)}" title="${escAttr(t.hint)}">
        <span class="tpl-label">${escHtml(t.label)}</span>
        <span class="tpl-hint">${escHtml(t.hint)}</span>
      </button>`).join('')
    return `
      <div class="crm-guide">
        <div class="guide-head">
          <span class="guide-icon">🧩</span>
          <div>
            <p class="guide-title">编码规则由多个「段」按顺序拼接而成</p>
            <p class="guide-sub">例如 单据号 = <code>[前缀]</code> + <code>[日期]</code> + <code>[流水]</code> → <code>DOC-20260806-0001</code></p>
          </div>
        </div>
        <div class="guide-section-label">快捷模板（点击应用）</div>
        <div class="tpl-list">${tplButtons}</div>
        <div class="guide-section-label">或从零开始</div>
        <button type="button" class="adm-icon-btn primary" data-action="add-seg"><ui5-icon name="add"></ui5-icon>添加段</button>
      </div>
    `
  }

  _renderSegRow (seg, i, total) {
    const type = String(seg.type || 'const')
    const typeBase = type.split(':')[0]
    const fields = this._renderSegFields(seg, type)
    return `<div class="seg-row">
      <span class="seg-no">${i + 1}</span>
      <label class="seg-type" title="段类型"><span class="sf-label">类型</span>
        <select class="seg-type-sel" data-seg-type>
        ${SEG_TYPES.map((s) => `<option value="${escAttr(s.value)}"${s.value === typeBase ? ' selected' : ''}>${escHtml(s.label)}</option>`).join('')}
        </select></label>
      <div class="seg-fields">${fields}</div>
      <div class="seg-ops">
        <button type="button" class="adm-icon-btn" data-action="up-seg" data-idx="${i}" title="上移" ${i === 0 ? 'disabled' : ''}><ui5-icon name="slim-arrow-up"></ui5-icon></button>
        <button type="button" class="adm-icon-btn" data-action="down-seg" data-idx="${i}" title="下移" ${i === total - 1 ? 'disabled' : ''}><ui5-icon name="slim-arrow-down"></ui5-icon></button>
        <button type="button" class="adm-icon-btn danger" data-action="del-seg" data-idx="${i}" title="删除"><ui5-icon name="delete"></ui5-icon></button>
      </div>
    </div>`
  }

  _renderSegFields (seg, type) {
    const v = (k, def = '') => (seg[k] != null ? seg[k] : def)
    const num = (k, def = 0) => (seg[k] != null && seg[k] !== '' ? seg[k] : def)
    const hint = (k) => SEG_FIELD_HINTS[k] || ''
    // 字段统一「label 在上 + 控件在下」竖排（对齐激活映射页 .f-item 范式）
    const text = (label, k, ph = '') => {
      // 对象/数组类值（如 ref 段的 map 映射 {gys:"GYS"}）以 JSON 文本展示，
      // 否则 escAttr 会把对象 String() 化成 [object Object]
      const raw = v(k)
      const val = raw && typeof raw === 'object' ? JSON.stringify(raw) : raw
      return `<label class="seg-field"${hint(k) ? ` title="${escAttr(hint(k))}"` : ''}><span class="sf-label">${escHtml(label)}</span>
        <input type="text" data-seg-field="${escAttr(k)}" value="${escAttr(val)}" placeholder="${escAttr(ph)}">
      </label>`
    }
    const number = (label, k, def = 0) => `<label class="seg-field"${hint(k) ? ` title="${escAttr(hint(k))}"` : ''}><span class="sf-label">${escHtml(label)}</span>
        <input type="number" data-seg-field="${escAttr(k)}" value="${escAttr(num(k, def))}">
      </label>`
    const select = (label, k, opts) => `<label class="seg-field"${hint(k) ? ` title="${escAttr(hint(k))}"` : ''}><span class="sf-label">${escHtml(label)}</span>
        <select data-seg-field="${escAttr(k)}">${opts.map((o) => `<option value="${escAttr(o.value)}"${String(v(k)) === String(o.value) ? ' selected' : ''}>${escHtml(o.label)}</option>`).join('')}</select>
      </label>`

    switch (type.split(':')[0]) {
      case 'const':
        return text('值', 'value', '固定文本')
      case 'serial':
        return [
          number('位数', 'width', 4),
          number('起始', 'start', 1),
          number('步长', 'step', 1),
          select('重置', 'reset_by', RESET_BYS),
        ].join('')
      case 'date':
        return select('格式', 'format', DATE_FORMATS.map((f) => ({ value: f, label: f })))
      case 'dateSerial':
        return [
          select('格式', 'format', DATE_FORMATS.map((f) => ({ value: f, label: f }))),
          number('位数', 'width', 4),
          number('起始', 'start', 1),
          number('步长', 'step', 1),
          select('重置', 'reset_by', RESET_BYS),
        ].join('')
      case 'ref':
        return [
          text('字段', 'field', '引用字段名'),
          text('映射', 'map', '键值映射 JSON'),
          number('取位', 'take', 0),
        ].join('')
      case 'random': {
        const modeSel = select('模式', 'mode', [
          { value: 'charset', label: '字符集' },
          { value: 'range', label: '数值区间' },
        ])
        const charset = text('字符集', 'charset', '0123456789')
        const width = number('位数', 'width', 4)
        const min = number('最小', 'min', 0)
        const max = number('最大', 'max', 9999)
        const pad = number('补位', 'pad', 0)
        return [modeSel, charset, width, min, max, pad].join('')
      }
      case 'custom':
        return text('类型名', 'name', 'custom:xxx')
      default:
        return text('值', 'value', '')
    }
  }
}

// ════════════════════════════════════════════════════════════════════════
//  List（explorer 区）：规则列表 + 新建/刷新
// ════════════════════════════════════════════════════════════════════════
const CODE_RULE_LIST_PAGE_SIZE = 10

class CmxCodeRuleList extends HTMLElement {
  constructor () {
    super()
    this.attachShadow({ mode: 'open' })
    /** @type {CodeRuleBus} */
    this._bus = busForCodeRule()
    this._loading = false
    this._wired = false
    this._kw = ''
    this._page = 1
    this._dam = { domains: [], apps: [], modules: [] }  // 域/应用/模块 选项（/api/registry/dam）
    this._onClick = (e) => this._handleClick(e)
    this._onInput = (e) => this._handleInput(e)
    this._onPageChange = (e) => this._handlePageChange(e)
    this._onFilterChange = (e) => this._handleFilterChange(e)
    this._onBusItems = () => this._refreshListRegion()
    this._onBusSelect = () => this._refreshListRegion()
  }

  connectedCallback () {
    this._render()
    if (!this._wired) {
      this._wired = true
      this.shadowRoot.addEventListener('click', this._onClick)
      this.shadowRoot.addEventListener('input', this._onInput)
      this.shadowRoot.addEventListener('page-change', this._onPageChange)
      this.shadowRoot.addEventListener('change', this._onFilterChange)
    }
    this._bus.addEventListener('items', this._onBusItems)
    this._bus.addEventListener('select', this._onBusSelect)
    // 筛选初值 = 入口模块的 DAM（workspace.context 注入）；此后以用户在三级下拉的选择为准
    if (!this._bus.damFilter) {
      const entry = admEntryDam(this)
      this._bus.damFilter = { domain: entry.domain, application: entry.application, module: entry.module }
    }
    if (!this._bus.items.length) void refreshRuleList(this._bus, this)
    void this._loadDam()
  }

  disconnectedCallback () {
    this.shadowRoot.removeEventListener('click', this._onClick)
    this.shadowRoot.removeEventListener('input', this._onInput)
    this.shadowRoot.removeEventListener('page-change', this._onPageChange)
    this.shadowRoot.removeEventListener('change', this._onFilterChange)
    this._bus.removeEventListener('items', this._onBusItems)
    this._bus.removeEventListener('select', this._onBusSelect)
    this._wired = false
  }

  async _loadDam () {
    try {
      const dam = await apiFetch('/api/registry/dam?active_only=true')
      this._dam = { domains: dam.domains || [], apps: dam.apps || [], modules: dam.modules || [] }
      this._renderFilterBar()
    } catch (err) { console.warn('[cmx-code-rule-manager] DAM 注册表拉取失败，筛选仅保留「全部」:', err?.message || err) }
  }

  /** DAM 三级筛选下拉（对齐定义中心/弹性组合列表）。inner=true 返回 HTML 供 _render 内联；
   *  否则局部刷新 #crl-filter（DAM 注册表加载完成后补选项）。 */
  _renderFilterBar (inner) {
    const f = this._bus.damFilter || { domain: '', application: '', module: '' }
    const domains = this._dam.domains || []
    const apps = (this._dam.apps || []).filter((a) => !f.domain || a.domain === f.domain)
    const modules = (this._dam.modules || []).filter((m) =>
      (!f.domain || m.domain === f.domain) &&
      (!f.application || (m.application || m.app) === f.application))
    const html = `
      <div class="filter-row">
        <ui5-select data-filter="domain" title="域">
          <ui5-option value="" icon="filter" ${!f.domain ? 'selected' : ''}>全部域</ui5-option>
          ${domains.map((d) => damOptionHtml(d, d.id, d.id === f.domain, 'folder')).join('')}
        </ui5-select>
        <ui5-select data-filter="application" title="应用">
          <ui5-option value="" icon="filter" ${!f.application ? 'selected' : ''}>全部应用</ui5-option>
          ${apps.map((a) => damOptionHtml(a, a.id, a.id === f.application, 'grid')).join('')}
        </ui5-select>
      </div>
      <div class="filter-row filter-row-module">
        <ui5-select data-filter="module" title="模块">
          <ui5-option value="" icon="filter" ${!f.module ? 'selected' : ''}>全部模块</ui5-option>
          ${modules.map((m) => { const mid = m.id || m.module; return damOptionHtml(m, mid, mid === f.module, 'product') }).join('')}
        </ui5-select>
      </div>`
    if (inner) return html
    const host = this.shadowRoot.getElementById('crl-filter')
    // eslint-disable-next-line no-restricted-syntax -- 选项经 damOptionHtml 转义。
    if (host) host.innerHTML = html
  }

  /** DAM 三级下拉 change：级联清空下级、更新 bus.damFilter、重拉列表并清选中。 */
  _handleFilterChange (e) {
    const el = e.target instanceof Element ? e.target.closest('[data-filter]') : null
    if (!(el instanceof HTMLElement)) return
    const f = this._bus.damFilter || (this._bus.damFilter = { domain: '', application: '', module: '' })
    const val = e.detail?.selectedOption?.value ?? el.value ?? ''
    const kind = el.dataset.filter
    if (kind === 'domain') { f.domain = val; f.application = ''; f.module = ''; this._renderFilterBar() }
    else if (kind === 'application') { f.application = val; f.module = ''; this._renderFilterBar() }
    else if (kind === 'module') { f.module = val }
    else return
    this._page = 1
    this._bus.select('')
    void refreshRuleList(this._bus, this)
  }

  _handleClick (e) {
    const t = e.target
    if (!(t instanceof Element)) return
    const item = t.closest('[data-action="select-rule"]')
    if (item) {
      this._bus.select(item.getAttribute('data-rule-code') || '')
      return
    }
    const btn = t.closest('[data-action]')
    if (btn instanceof HTMLElement) {
      const action = btn.getAttribute('data-action')
      if (action === 'reload') void refreshRuleList(this._bus, this)
      else if (action === 'new-rule') void this._newRuleDialog()
    }
  }

  /** 新建规则弹窗（统一 floating-dialog 范式）：编码/名称/模式 + auto 快捷模板，确认后进编辑态。 */
  async _newRuleDialog () {
    const c = this._bus.controller
    const form = document.createElement('div')
    form.className = 'crm-new-form'
    // eslint-disable-next-line no-restricted-syntax -- 静态结构；值经转义/受控输入。
    form.innerHTML = `
      <style>
        .crm-new-form{box-sizing:border-box;display:flex;flex-direction:column;gap:12px;font-family:var(--sapFontFamily,Arial,sans-serif);color:var(--sapTextColor,#1d2d3e);padding:4px 2px}
        .crm-new-row{display:grid;grid-template-columns:88px minmax(0,300px);gap:8px 10px;align-items:center;font-size:13px}
        .crm-new-row label{color:var(--sapContent_LabelColor,#6a6d70)}
        .crm-new-row input,.crm-new-row select{width:100%;box-sizing:border-box;height:30px;border:1px solid var(--sapField_BorderColor,#89919a);border-radius:4px;padding:0 8px;font:inherit;font-size:13px;background:var(--sapField_Background,#fff);color:inherit}
        .crm-new-row input:focus,.crm-new-row select:focus{outline:none;border-color:var(--neo-cyan,#00b4d8)}
        .crm-new-row input.is-invalid{border-color:var(--sapNegativeColor,#bb0000)}
        .crm-new-err{grid-column:2;font-size:11px;color:var(--sapNegativeColor,#bb0000);min-height:14px}
        .crm-new-tpl-title{font-size:12px;color:var(--sapContent_LabelColor,#6a6d70);margin-top:2px}
        .crm-new-tpl{display:flex;flex-direction:column;gap:6px}
        .crm-new-tpl button{display:flex;flex-direction:column;align-items:flex-start;gap:2px;text-align:left;padding:8px 10px;border:1px dashed var(--sapGroup_TitleBorderColor,#d9d9d9);border-radius:6px;background:transparent;cursor:pointer;font:inherit}
        .crm-new-tpl button:hover{border-color:var(--neo-cyan,#00b4d8);background:color-mix(in srgb,var(--neo-cyan,#00b4d8) 6%,transparent)}
        .crm-new-tpl .t{font-size:13px;font-weight:600;color:inherit}
        .crm-new-tpl .h{font-size:11px;color:var(--sapContent_LabelColor,#6a6d70)}
      </style>
      <div class="crm-new-row"><label>规则编码</label><input data-field="rule_code" placeholder="如 MDM_XM（字母开头）" maxlength="64"></div>
      <div class="crm-new-row"><label></label><div class="crm-new-err" data-err="rule_code"></div></div>
      <div class="crm-new-row"><label>规则名称</label><input data-field="rule_name" placeholder="如 项目编码（前缀+日期+流水）" maxlength="120"></div>
      <div class="crm-new-row"><label>规则模式</label>
        <select data-field="mode">
          <option value="auto">自动生成（段引擎）</option>
          <option value="manual">手动录入（正则校验）</option>
        </select>
      </div>
      <div data-area="tpl">
        <div class="crm-new-tpl-title">或从快捷模板开始（自动填充段序列）：</div>
        <div class="crm-new-tpl">
          ${TEMPLATES.map((t) => `<button type="button" data-tpl="${t.id}" title="应用模板：${t.hint}"><span class="t">${t.hint}</span><span class="h">${t.label}</span></button>`).join('')}
        </div>
      </div>`
    const codeInput = form.querySelector('[data-field="rule_code"]')
    const nameInput = form.querySelector('[data-field="rule_name"]')
    const modeSel = form.querySelector('[data-field="mode"]')
    const errEl = form.querySelector('[data-err="rule_code"]')
    const tplArea = form.querySelector('[data-area="tpl"]')

    /** 校验规则编码：空 / 格式 / 重复。返回是否通过。 */
    const validateCode = () => {
      const val = (codeInput.value || '').trim()
      let msg = ''
      if (!val) msg = '请输入规则编码'
      else if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(val)) msg = '编码须以字母开头，仅含字母、数字、下划线'
      else if (this._bus.items.some((x) => x.ruleCode === val)) msg = `规则「${val}」已存在`
      errEl.textContent = msg
      codeInput.classList.toggle('is-invalid', !!msg)
      return !msg
    }
    codeInput.addEventListener('input', () => { if (errEl.textContent) validateCode() })

    // manual 模式隐藏模板区
    modeSel.addEventListener('change', () => { tplArea.style.display = modeSel.value === 'manual' ? 'none' : '' })

    /** 进编辑态（预填基础字段 + 可选模板段），选中切到新建态。 */
    const startEdit = (tplId) => {
      if (!c) return
      this._bus.select('')
      c._startNew()
      const r = c.currentRule
      if (r) {
        r.rule_code = (codeInput.value || '').trim()
        r.rule_name = (nameInput.value || '').trim() || (codeInput.value || '').trim()
        r.mode = modeSel.value || 'auto'
      }
      if (tplId && modeSel.value !== 'manual') c._applyTemplate(tplId)
      c._render()
      this._bus.emitState(true)
    }

    const dlg = document.createElement('cmx-floating-dialog')
    dlg.configure({
      title: '新建规则',
      icon: 'add',
      showConfirm: true,
      showCancel: true,
      confirmText: '创建',
      cancelText: '取消',
      dialogWidth: '480px',
      dialogHeight: '420px',
      beforeClose: async ({ action }) => {
        if (action !== 'confirm') return true
        if (!validateCode()) { codeInput.focus(); return false }
        startEdit('')
        return true
      },
    })
    // 模板按钮：选定即创建（等价于填空+确认）
    form.addEventListener('click', (e) => {
      const b = e.target instanceof Element ? e.target.closest('[data-tpl]') : null
      if (!b) return
      if (!validateCode()) { codeInput.focus(); return }
      startEdit(b.dataset.tpl || '')
      dlg.close('confirm', { force: true })
    })
    // 回车触发「创建」（走 beforeClose 校验）
    form.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); dlg.close('confirm') } })
    dlg.setContent(form)
    document.body.appendChild(dlg)
    codeInput.focus()
    await dlg.openModal()
    dlg.remove()
  }

  /** 搜索框输入：只重绘列表体（整树重绘会打断输入焦点）。命中范围=名称/编码（对齐激活映射列表）。 */
  _handleInput (e) {
    const t = e.target
    if (!(t instanceof HTMLInputElement) || t.id !== 'crl-kw') return
    this._kw = t.value
    this._page = 1
    this._refreshListRegion()
  }

  _handlePageChange (e) {
    const page = Number(e?.detail?.page)
    if (!Number.isFinite(page) || page < 1) return
    this._page = page
    this._refreshListRegion()
  }

  /** 局部刷新列表区（列表体 + 计数标题 + 分页器）。选中/列表/搜索/翻页共用——
   *  不整树重绘：筛选栏与搜索框保持不动（重绘会清筛选内容、丢输入焦点）。 */
  _refreshListRegion () {
    const body = this.shadowRoot.querySelector('.crm-list-body')
    // eslint-disable-next-line no-restricted-syntax -- 内容来自 _renderBody()（内部已转义）。
    if (body) body.innerHTML = this._renderBody()
    const head = this.shadowRoot.querySelector('.adm-head .adm-title')
    if (head) head.textContent = `规则（${this._filteredItems().length}/${this._bus.items.length}）`
    this._syncPager()
  }

  /** 搜索/刷新/选中变化后同步分页栏；page-change 由 cmx-pager 自身先行完成状态刷新。 */
  _syncPager () {
    const pager = this.shadowRoot.querySelector('cmx-pager')
    if (!pager) return
    pager.page = this._page
    pager.total = this._filteredItems().length
  }

  _filteredItems () {
    const kw = (this._kw || '').trim().toLowerCase()
    if (!kw) return this._bus.items
    return this._bus.items.filter((r) =>
      (r.ruleCode || '').toLowerCase().includes(kw) || (r.ruleName || '').toLowerCase().includes(kw))
  }

  /** 夹紧页码并返回当前页数据；翻页时不因选中项仍在旧页而把页码拉回去。 */
  _normalizedPage () {
    const items = this._filteredItems()
    const totalPages = Math.max(1, Math.ceil(items.length / CODE_RULE_LIST_PAGE_SIZE))
    this._page = Math.min(Math.max(1, this._page), totalPages)
    return items.slice((this._page - 1) * CODE_RULE_LIST_PAGE_SIZE, this._page * CODE_RULE_LIST_PAGE_SIZE)
  }

  _renderBody () {
    const cur = this._bus.selectedCode
    const items = this._normalizedPage()
    if (this._loading && !this._bus.items.length) return '<div class="adm-empty">加载中…</div>'
    if (!this._bus.items.length) return admEmptyHtml({ total: 0, itemLabel: '规则' })
    if (!items.length) return admEmptyHtml({ total: 1, keyword: this._kw, itemLabel: '规则' })
    // 标题=规则名称；副标题1=归属(域/模块)·模式，副标题2=规则编码；圆点=启用态（对齐定义中心列表信息密度）
    return items.map((r) => {
      const on = cur && r.ruleCode === cur
      const owner = (r.domainCode || r.moduleCode)
        ? `${r.domainCode || '＿'}${r.moduleCode ? '/' + r.moduleCode : ''}` : '未归属'
      const modeLabel = r.mode === 'manual' ? '手动' : '自动'
      return `<div class="adm-row${on ? ' is-current' : ''}" data-action="select-rule" data-rule-code="${escAttr(r.ruleCode)}" title="${escAttr(r.ruleCode)}">
        <span class="adm-dot${r.isActive === false ? ' off' : ''}" title="${r.isActive === false ? '已停用' : '已启用'}"></span>
        <div class="adm-main">
          <div class="adm-name">${escHtml(r.ruleName || r.ruleCode)}</div>
          <div class="adm-sub">${escHtml(owner)} · ${escHtml(modeLabel)}</div>
          <div class="adm-sub">${escHtml(r.ruleCode)}</div>
        </div>
      </div>`
    }).join('')
  }

  _render () {
    // eslint-disable-next-line no-restricted-syntax -- 动态值均经 escHtml/escAttr；搜索值回填保持输入连续。
    this.shadowRoot.innerHTML = `
      <style>${LIST_STYLES}${admColorSchemeCss()}</style>
      <div class="crm-list">
        <div class="adm-head">
          <span class="adm-title">规则（${this._filteredItems().length}/${this._bus.items.length}）</span>
          <span class="spacer"></span>
          <button type="button" class="adm-icon-btn ghost" data-action="reload" title="刷新"><ui5-icon name="refresh"></ui5-icon></button>
          <button type="button" class="adm-icon-btn primary" data-action="new-rule" title="新建规则"><ui5-icon name="add"></ui5-icon>新建</button>
        </div>
        <div class="filter-bar" id="crl-filter">${this._renderFilterBar(true)}</div>
        <div class="crm-search">
          <input type="text" id="crl-kw" placeholder="搜索名称 / 编码…" value="${escAttr(this._kw)}">
        </div>
        <div class="crm-list-body">${this._renderBody()}</div>
        <div class="crm-pager">
          <cmx-pager compact page="${this._page}" page-size="${CODE_RULE_LIST_PAGE_SIZE}" total="${this._filteredItems().length}"></cmx-pager>
        </div>
      </div>
    `
  }
}

// ════════════════════════════════════════════════════════════════════════
//  Inspector（property 区）：规则属性表单，委托 controller 收集值
// ════════════════════════════════════════════════════════════════════════
class CmxCodeRuleInspector extends HTMLElement {
  constructor () {
    super()
    this.attachShadow({ mode: 'open' })
    /** @type {CodeRuleBus} */
    this._bus = busForCodeRule()
    this._wired = false
    this._onInput = (e) => { const c = this._bus.controller; if (c) c.handlePanelInput(e) }
    this._onChange = (e) => { const c = this._bus.controller; if (c) c.handlePanelChange(e) }
    this._onState = (e) => {
      if (e?.detail?.force || !isEditingEl(this.shadowRoot)) {
        this._render()
        // 新建态自动聚焦规则编码输入框（首次进入新建态时）
        if (e?.detail?.force && this._bus.controller && this._bus.controller.isNew) {
          const codeInput = this.shadowRoot.querySelector('[data-prop="rule_code"]')
          if (codeInput && document.activeElement !== codeInput) codeInput.focus()
        }
      }
    }
  }

  connectedCallback () {
    this._render()
    if (!this._wired) {
      this._wired = true
      this.shadowRoot.addEventListener('input', this._onInput)
      this.shadowRoot.addEventListener('change', this._onChange)
    }
    this._bus.addEventListener('state', this._onState)
    this._bus.addEventListener('controller', this._onState)
  }

  disconnectedCallback () {
    this.shadowRoot.removeEventListener('input', this._onInput)
    this.shadowRoot.removeEventListener('change', this._onChange)
    this._bus.removeEventListener('state', this._onState)
    this._bus.removeEventListener('controller', this._onState)
    this._wired = false
  }

  _render () {
    const c = this._bus.controller
    const r = c ? c.currentRule : null
    if (!r) {
      // eslint-disable-next-line no-restricted-syntax -- 静态文案。
      this.shadowRoot.innerHTML = `<style>${INSPECTOR_STYLES}${admColorSchemeCss()}</style><div class="inspect-body"><div class="crm-empty">未选择规则</div></div>`
      return
    }
    const isNew = c.isNew
    const errs = c.validationErrors || {}
    // 字段渲染辅助：生成 label（带必填标记）+ input + 错误提示
    const fieldLabel = (text, prop) => `<label class="${errs[prop] ? 'is-invalid-label' : ''}">${escHtml(text)}${['rule_code', 'rule_name'].includes(prop) ? '<span class="req">*</span>' : ''}</label>`
    const errHtml = (prop) => errs[prop] ? `<div class="kv-err">${escHtml(errs[prop])}</div>` : ''
    // eslint-disable-next-line no-restricted-syntax -- 动态值均经 escHtml/escAttr。
    this.shadowRoot.innerHTML = `
      <style>${INSPECTOR_STYLES}${admColorSchemeCss()}</style>
      <div class="inspect-body">
        <div class="insp-head">
          <span class="tick"></span>
          <span class="title">规则属性</span>
          <span class="spacer"></span>
          ${r.rule_code ? `<span class="chip">${escHtml(r.rule_code)}</span>` : ''}
          ${r.is_active === false ? `<span class="chip muted">停用</span>` : `<span class="chip success">启用</span>`}
        </div>
        <section class="section">
          <h3>基本信息</h3>
          <div class="section-body">
          <div class="kv">
            ${fieldLabel('规则编码', 'rule_code')}
            <input type="text" data-prop="rule_code" value="${escAttr(r.rule_code)}" placeholder="如 DOC_NO_RULE，字母开头+字母数字下划线" ${isNew ? '' : 'readonly'} class="${errs.rule_code ? 'is-invalid' : ''}">
            ${errHtml('rule_code')}
            ${fieldLabel('规则名称', 'rule_name')}
            <input type="text" data-prop="rule_name" value="${escAttr(r.rule_name)}" placeholder="规则中文名" class="${errs.rule_name ? 'is-invalid' : ''}">
            ${errHtml('rule_name')}
            <label>模式</label>
            <select data-prop="mode">
              ${RULE_MODES.map((m) => `<option value="${escAttr(m.value)}"${m.value === r.mode ? ' selected' : ''}>${escHtml(m.label)}</option>`).join('')}
            </select>
            <label>优先级</label>
            <input type="number" data-prop="priority" value="${escAttr(Number.isFinite(Number(r.priority)) ? r.priority : 0)}">
            <label>组织范围</label>
            <input type="text" data-prop="org_scope" value="${escAttr(r.org_scope || '')}" placeholder="如 * 或指定组织编码">
            <label>启用</label>
            <label class="kv-check"><input type="checkbox" data-prop="is_active" ${r.is_active !== false ? 'checked' : ''}>规则生效</label>
            <label>允许跳号</label>
            <label class="kv-check"><input type="checkbox" data-prop="enable_gap" ${r.enable_gap ? 'checked' : ''}>流水允许产生间隔（gap）</label>
          </div>
          </div>
        </section>
        <section class="section">
          <h3>拼接与模板</h3>
          <div class="section-body">
          <div class="kv">
            <label>连接符</label>
            <input type="text" data-prop="joiner" value="${escAttr(r.joiner || '')}" placeholder="段间分隔符，可空">
            <label>模板</label>
            <textarea data-prop="pattern" placeholder="pattern 模式下的模板，如 {date}-{serial}">${escHtml(r.pattern || '')}</textarea>
            <label>条件</label>
            <textarea data-prop="condition" placeholder="启用条件表达式（可选）">${escHtml(r.condition || '')}</textarea>
          </div>
          </div>
        </section>
      </div>
    `
  }
}

// ════════════════════════════════════════════════════════════════════════
//  辅助：归一化 + 列表刷新
// ════════════════════════════════════════════════════════════════════════
function normalizeRule (spec) {
  return {
    rule_code: spec.rule_code ?? spec.ruleCode ?? '',
    rule_name: spec.rule_name ?? spec.ruleName ?? '',
    mode: spec.mode || 'auto',
    org_scope: spec.org_scope ?? '',
    condition: spec.condition ?? '',
    segments: Array.isArray(spec.segments) ? spec.segments.map((s) => ({ ...s })) : [],
    joiner: spec.joiner ?? '',
    pattern: spec.pattern ?? '',
    enable_gap: !!spec.enable_gap,
    priority: Number.isFinite(Number(spec.priority)) ? Number(spec.priority) : 0,
    is_active: spec.is_active !== false,
    // DAM 归属三键原样透传：查看时读到什么保存时还回什么。后端 body 有值即不覆盖，
    // 缺省（新建或「全部」模式下编辑无归属规则）再由请求头补全——避免保存把归属清空。
    domain_code: spec.domain_code ?? '',
    application_code: spec.application_code ?? '',
    module_code: spec.module_code ?? '',
  }
}

/** 拉 GET /api/code/rules 刷新总线 items（list 和 controller 共用）。el 传组件实例（供取 DAM）。 */
async function refreshRuleList (bus, el = null) {
  try {
    const res = await codeFetch('/api/code/rules', {}, el)
    const data = await res.json().catch(() => null)
    if (!res.ok) throw buildHttpError('加载规则列表失败', res, data)
    const rulesRoot = (data && (data.data || data)) || {}
    const list = Array.isArray(rulesRoot.rules) ? rulesRoot.rules : []
    bus.setItems(list.map((r) => ({
      ruleCode: r.ruleCode || r.rule_code || '',
      ruleName: r.ruleName || r.rule_name || r.ruleCode || r.rule_code || '',
      isActive: r.isActive ?? r.is_active ?? true,
      mode: r.mode || 'auto',
      domainCode: r.domainCode || r.domain_code || '',
      applicationCode: r.applicationCode || r.application_code || '',
      moduleCode: r.moduleCode || r.module_code || '',
    })))
  } catch (err) {
    showDefError('加载规则列表失败', err, { details: extractErrorDetails(err), helpCode: 'CODE_RULE_LIST_FAILED' })
    bus.setItems([])
  }
}

// ════════════════════════════════════════════════════════════════════════
//  CSS
// ════════════════════════════════════════════════════════════════════════
const COMMON_CSS = `${ADM_ALL_CSS}
  :host{display:block;height:100%;min-height:0;background:var(--sapBackgroundColor,#fff);color:var(--sapTextColor,#1d2d3e);font-family:var(--sapFontFamily,Arial,sans-serif);font-size:13px;color-scheme:light dark;
    /* 选中/强调色统一走 neo 青（对齐激活映射配置页设计语言）；neo 色值继承主题，缺省带兜底 */
    --cmx-selection-color:var(--neo-cyan,#00b4d8);
    --cmx-selection-border:color-mix(in srgb,var(--cmx-selection-color) 54%,var(--sapBackgroundColor,#fff));
    --cmx-selection-bg:color-mix(in srgb,var(--cmx-selection-color) 12%,var(--sapBackgroundColor,#fff));
    --cmx-selection-bg-soft:color-mix(in srgb,var(--cmx-selection-color) 8%,var(--sapBackgroundColor,#fff));
    --cmx-selection-text:color-mix(in srgb,var(--cmx-selection-color) 78%,var(--sapTextColor,#1d2d3e));
  }
  .chip{display:inline-flex;align-items:center;gap:3px;height:18px;padding:0 7px;border-radius:8px;font-size:10px;font-weight:600;background:color-mix(in srgb,var(--neo-cyan,#00b4d8) 12%,transparent);color:var(--neo-cyan,#00b4d8);white-space:nowrap}
  .chip.muted{background:color-mix(in srgb,var(--sapContent_LabelColor,#6a6d70) 16%,transparent);color:var(--sapContent_LabelColor,#6a6d70)}
  .chip.success{background:color-mix(in srgb,var(--neo-green,#2f855a) 14%,transparent);color:var(--neo-green,#2f855a)}
  .crm-loading{padding:18px 10px;text-align:center;color:var(--sapContent_LabelColor,#9a9d9f);font-size:12px}
  .crm-empty{padding:32px 16px;text-align:center;color:var(--sapContent_LabelColor,#9a9d9f);font-size:12px}
  .crm-msg{padding:4px 12px;font-size:11px;color:var(--sapContent_LabelColor,#6a6d70)}
  .crm-msg.err{color:var(--neo-red,#c53030)}
  .crm-msg.ok{color:var(--neo-green,#2f855a)}
`

const CONTROLLER_STYLES = `${COMMON_CSS}
  .crm-content{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--sapBackgroundColor,#fff)}
  .crm-toolbar{display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--sapGroup_TitleBorderColor,#d9d9d9);background:color-mix(in srgb,var(--sapBackgroundColor,#fff) 75%,#000 0%);flex-shrink:0}
  .crm-title{font-weight:600;font-size:13px;color:var(--sapTitleColor,var(--sapTextColor,#1d2d3e))}
  .crm-toolbar .spacer{flex:1}
  .crm-seg-area{flex:1;min-height:0;overflow:auto;padding:14px;display:flex;flex-direction:column;gap:8px;align-items:flex-start}
  .crm-seg-area>.crm-msg,.crm-seg-area>.seg-empty{align-self:stretch}
  .seg-row{display:flex;align-items:flex-end;gap:10px;padding:10px 12px;border:1px solid var(--sapGroup_TitleBorderColor,#e5e5e5);border-radius:8px;background:color-mix(in srgb,var(--sapBackgroundColor,#fff) 92%,#000 0%);flex-wrap:wrap;align-self:stretch;box-sizing:border-box}
  .seg-no{flex:0 0 auto;width:18px;height:18px;border-radius:50%;background:var(--neo-cyan,#00b4d8);color: #fff;font-size:11px;font-weight:600;display:inline-flex;align-items:center;justify-content:center;margin-bottom:5px}
  /* 字段统一竖排：label 在上、控件在下（对齐激活映射页 .f-item 范式） */
  .seg-type{flex:0 0 auto;display:flex;flex-direction:column;gap:4px;min-width:118px}
  .sf-label{font-size:11px;color:var(--sapContent_LabelColor,#6a6d70);white-space:nowrap}
  .seg-type-sel{height:28px;border:1px solid var(--sapField_BorderColor,#89919a);border-radius:5px;padding:0 6px;background:var(--sapField_Background,#fff);color:inherit;font:inherit;font-size:12px;width:100%}
  .seg-fields{flex:1 1 auto;min-width:0;display:flex;flex-wrap:wrap;align-items:flex-end;gap:8px 12px}
  .seg-field{display:flex;flex-direction:column;gap:4px;min-width:0}
  .seg-field>input,.seg-field>select{height:28px;border:1px solid var(--sapField_BorderColor,#89919a);border-radius:5px;padding:0 6px;background:var(--sapField_Background,#fff);color:inherit;font:inherit;font-size:12px;box-sizing:border-box}
  .seg-field>input:focus,.seg-field>select:focus,.seg-type-sel:focus{outline:none;border-color:var(--neo-cyan,#00b4d8)}
  .seg-field>input[type=number]{width:78px}
  .seg-field>input[type=text]{width:150px}
  .seg-field>select{width:112px}
  .seg-ops{flex:0 0 auto;display:flex;align-items:center;gap:3px;margin-bottom:2px}
  .seg-ops .adm-icon-btn{height:24px;min-width:24px;padding:0 4px}
  .seg-empty{padding:18px 10px;text-align:center;color:var(--sapContent_LabelColor,#9a9d9f);font-size:12px}

  /* ── 实时预览卡片（banner.info 风格：青色淡底 + 边框） ── */
  .crm-preview{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:9px 14px;border-bottom:1px solid var(--sapGroup_TitleBorderColor,#eee);
    background:color-mix(in srgb,var(--neo-cyan,#00b4d8) 7%,var(--sapBackgroundColor,#fff));flex-shrink:0}
  .prev-label{font-size:11px;font-weight:600;color:var(--sapContent_LabelColor,#6a6d70);flex-shrink:0}
  .prev-code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:14px;font-weight:700;color:var(--neo-cyan,#00b4d8);background:color-mix(in srgb,var(--neo-cyan,#00b4d8) 10%,transparent);padding:2px 10px;border-radius:4px;word-break:break-all}
  .prev-tag{font-size:10px;color:var(--sapContent_LabelColor,#9a9d9f);flex-shrink:0;cursor:help}
  .prev-empty{font-size:12px;color:var(--sapContent_LabelColor,#9a9d9f)}
  .prev-warns{flex-basis:100%;margin:2px 0 0;padding:0;list-style:none}
  .prev-warns li{font-size:11px;color:var(--neo-red,#c53030);padding:1px 0}
  .prev-warns li::before{content:"⚠ ";font-size:10px}

  /* ── 新建态引导面板 ── */
  .crm-guide{padding:8px 4px;align-self:stretch}
  .guide-head{display:flex;align-items:flex-start;gap:10px;margin-bottom:16px}
  .guide-icon{font-size:24px;flex-shrink:0;line-height:1.2}
  .guide-title{margin:0 0 4px;font-size:13px;font-weight:600;color:var(--sapTextColor,#1d2d3e)}
  .guide-sub{margin:0;font-size:12px;color:var(--sapContent_LabelColor,#6a6d70);line-height:1.6}
  .guide-sub code{font-family:ui-monospace,Menlo,Consolas,monospace;background:color-mix(in srgb,var(--sapTextColor,#1d2d3e) 8%,transparent);padding:0 4px;border-radius:3px;font-size:11px}
  .guide-section-label{font-size:11px;font-weight:600;color:var(--sapContent_LabelColor,#6a6d70);margin:12px 0 6px}
  .tpl-list{display:flex;flex-direction:column;gap:6px;margin-bottom:8px}
  .tpl-btn{display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:8px 10px;border:1px solid var(--sapGroup_TitleBorderColor,#d9d9d9);border-radius:6px;background:color-mix(in srgb,var(--sapBackgroundColor,#fff) 92%,#000 0%);cursor:pointer;text-align:left;font:inherit;transition:border-color .1s,background .1s}
  .tpl-btn:hover{border-color:var(--neo-cyan,#00b4d8);background:color-mix(in srgb,var(--neo-cyan,#00b4d8) 8%,transparent)}
  .tpl-label{font-size:12px;font-weight:600;color:var(--sapTextColor,#1d2d3e)}
  .tpl-hint{font-size:11px;color:var(--sapContent_LabelColor,#6a6d70)}

  /* ── manual 模式说明面板 ── */
  .manual-panel{display:flex;align-items:flex-start;gap:12px;padding:20px;background:color-mix(in srgb,var(--sapBackgroundColor,#fff) 92%,#000 0%);border:1px solid var(--sapGroup_TitleBorderColor,#e5e5e5);border-radius:8px}
  .manual-icon{font-size:28px;flex-shrink:0;line-height:1}
  .manual-title{margin:0 0 6px;font-size:13px;font-weight:600;color:var(--sapTextColor,#1d2d3e)}
  .manual-desc{margin:0 0 8px;font-size:12px;color:var(--sapContent_LabelColor,#6a6d70);line-height:1.6}
  .manual-desc code{font-family:ui-monospace,Menlo,Consolas,monospace;background:color-mix(in srgb,var(--sapTextColor,#1d2d3e) 8%,transparent);padding:0 4px;border-radius:3px;font-size:11px}
  .manual-hint{margin:8px 0 0;font-size:11px;color:var(--sapContent_LabelColor,#9a9d9f);font-style:italic}
`

const LIST_STYLES = `${COMMON_CSS}
  /* 整体照搬激活映射配置页侧栏卡片（side-card）结构：头（图标+计数）→ 搜索 → 列表体内部滚动 */
  .crm-list{display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden;
    background:var(--sapBackgroundColor,#fff)}
  .filter-bar{display:flex;flex-direction:column;gap:6px;padding:6px 10px;border-bottom:1px solid var(--sapGroup_TitleBorderColor,#d9d9d9);flex-shrink:0;background:var(--sapGroup_ContentBackground,#fafafa)}
  .crm-search{flex:0 0 auto;padding:10px 12px 4px;display:flex;gap:6px}
  .filter-bar .filter-row{display:grid;grid-template-columns:1fr 1fr;gap:6px}
  .filter-bar .filter-row-module{grid-template-columns:1fr}
  .filter-bar ui5-select{width:100%;min-width:0}
  .crm-search input{flex:1 1 auto;min-width:0;box-sizing:border-box;padding:7px 10px;
    border:1px solid var(--sapList_BorderColor,#e5e5e5);border-radius:5px;font-size:13px;
    background:color-mix(in srgb,var(--sapBackgroundColor,#fff) 85%,#000 0%);color:var(--sapTextColor,#1d2d3e)}
  .crm-search input:focus{outline:none;border-color:var(--neo-cyan,#00b4d8)}

  .crm-list-body{flex:1 1 auto;min-height:0;overflow-y:auto;display:flex;flex-direction:column;padding:4px 6px;gap:2px}
  .crm-pager{flex:0 0 auto;display:flex;align-items:center;padding:4px 6px 6px;
    border-top:1px solid var(--sapList_BorderColor,#e5e5e5)}
  .crm-pager cmx-pager{flex:1 1 auto;min-width:0;display:flex}
  .crm-pager cmx-pager::part(root){width:100%;justify-content:center;gap:0;padding:2px 0}
  .crm-pager cmx-pager::part(info){flex:1 1 auto;min-width:0}
  .crm-pager cmx-pager::part(size),
  .crm-pager cmx-pager::part(suffix){display:none}
`

const INSPECTOR_STYLES = `${COMMON_CSS}
  :host{display:flex;flex-direction:column;height:100%;min-height:0;overflow:auto;background:var(--sapBackgroundColor,#fff);
    --cmx-selection-color:var(--neo-cyan,#00b4d8);
    --cmx-selection-border:color-mix(in srgb,var(--cmx-selection-color) 54%,var(--sapBackgroundColor,#fff));
    --cmx-selection-bg:color-mix(in srgb,var(--cmx-selection-color) 12%,var(--sapBackgroundColor,#fff));
    --cmx-selection-bg-soft:color-mix(in srgb,var(--cmx-selection-color) 8%,var(--sapBackgroundColor,#fff));
    --cmx-selection-text:color-mix(in srgb,var(--cmx-selection-color) 78%,var(--sapTextColor,#1d2d3e));
  }
  .inspect-body{padding:12px;display:flex;flex-direction:column;gap:12px}
  .insp-head{display:flex;align-items:center;gap:8px;margin:-4px 0 0}
  .insp-head .tick{width:6px;height:6px;border-radius:50%;background:var(--neo-cyan,#00b4d8);flex-shrink:0}
  .insp-head .title{font-weight:600;font-size:12px;color:var(--sapTitleColor,var(--sapTextColor,#1d2d3e))}
  .insp-head .spacer{flex:1}
  .section{border:1px solid var(--sapGroup_TitleBorderColor,#d9d9d9);border-radius:8px;background:color-mix(in srgb,var(--sapBackgroundColor,#fff) 92%,#000 0%);overflow:hidden}
  .section h3{margin:0;padding:8px 12px;font-size:12px;font-weight:600;color:var(--sapTitleColor,var(--sapTextColor,#1d2d3e));display:flex;align-items:center;gap:7px;
    border-bottom:1px solid var(--sapGroup_TitleBorderColor,#d9d9d9);background:color-mix(in srgb,var(--sapBackgroundColor,#fff) 75%,#000 0%)}
  .section h3::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--neo-cyan,#00b4d8);flex-shrink:0}
  .section-body{padding:12px}
  .kv{display:grid;grid-template-columns:88px minmax(0,1fr);gap:8px 8px;align-items:center;font-size:12px}
  .kv>label{color:var(--sapContent_LabelColor,#6a6d70);white-space:nowrap}
  .kv>input,.kv>select,.kv>textarea{width:100%;box-sizing:border-box;height:28px;border:1px solid var(--sapField_BorderColor,#89919a);border-radius:5px;padding:0 6px;background:var(--sapField_Background,#fff);color:inherit;font:inherit;font-size:12px}
  .kv>textarea{height:auto;padding:4px 6px;resize:vertical;min-height:48px}
  .kv>input:focus,.kv>select:focus,.kv>textarea:focus{outline:none;border-color:var(--neo-cyan,#00b4d8)}
  .kv-check{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--sapTextColor,#1d2d3e);grid-column:2}
  .kv-check input{width:15px;height:15px}
  .req{color:var(--neo-red,#c53030);margin-left:2px;font-weight:700}
  .kv>input.is-invalid{border-color:var(--neo-red,#c53030);outline:2px solid color-mix(in srgb,var(--neo-red,#c53030) 30%,transparent);outline-offset:-1px}
  .kv-err{grid-column:2;margin-top:-4px;font-size:11px;color:var(--neo-red,#c53030);line-height:1.4}
  .is-invalid-label{color:var(--neo-red,#c53030)!important}
`

// ════════════════════════════════════════════════════════════════════════
//  注册
// ════════════════════════════════════════════════════════════════════════
if (!customElements.get('cmx-code-rule-manager')) {
  customElements.define('cmx-code-rule-manager', CmxCodeRuleManager)
}
if (!customElements.get('cmx-code-rule-list')) {
  customElements.define('cmx-code-rule-list', CmxCodeRuleList)
}
if (!customElements.get('cmx-code-rule-inspector')) {
  customElements.define('cmx-code-rule-inspector', CmxCodeRuleInspector)
}

// 注册 workspace view type（与定义中心三视图同款）
registerWorkspaceViewType('code-rule-manager', () => '<cmx-code-rule-manager></cmx-code-rule-manager>')
registerWorkspaceViewType('code-rule-list', () => '<cmx-code-rule-list></cmx-code-rule-list>')
registerWorkspaceViewType('code-rule-inspector', () => '<cmx-code-rule-inspector></cmx-code-rule-inspector>')
