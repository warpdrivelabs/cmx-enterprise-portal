/**
 * CmxColumnAdapter — 列描述符适配器
 *
 * 将 CmxColumnModel / CmxColumn / CmxColumnGroup 输出的通用描述符（toDescriptors()）
 * 转换为具体 grid 实现所需的列定义格式。
 *
 * 当前支持：
 *   CmxColumnAdapter.toRevoGrid(model)   → RevoGrid columns + totals 配置（cmx-revo-grid 内部用）
 *   CmxColumnAdapter.toCmxFormGrouped(model) → cmx-ui5-form 字段树（含分组）
 *   CmxColumnAdapter.toAgGrid(model)     → AG Grid columnDefs + defaultColDef 扩展
 *
 * 用法：
 *   import { CmxColumnAdapter } from 'cmx-data-comp/lib/cmx-column-adapter.js'
 *
 *   // revo-grid / ui5-form：组件内部由 setColumnModel(model) 调用对应转换，调用方只需传 model
 *
 *   // ag-grid
 *   const { columnDefs, pinnedSumFields } = CmxColumnAdapter.toAgGrid(model)
 *   el.gridOptions = baseOpts(columnDefs, rowData, { ... })
 *   updatePinned(el.api, pinnedSumFields)
 */

import { CmxColumn }      from './cmx-column.js'
import { CmxColumnGroup } from './cmx-column-group.js'
import { evalFormula }    from './formula-eval.js'
import { editModeKind }   from './cmx-field-uicontrol.js'
import { fieldCaption }   from './cmx-field-meta.js'
import { parseDate, getParts } from 'cmx-shared/datetime'

function descriptorEdit (d) {
  return d && typeof d.edit === 'object' && d.edit ? d.edit : {}
}

function descriptorEditMode (d) {
  return editModeKind(descriptorEdit(d).mode || d.editMode || 'cmx-text-input')
}

function descriptorDataType (d) {
  return String(d?.dataType || '').toUpperCase()
}

function isNumericDescriptor (d) {
  const dt = descriptorDataType(d)
  const em = descriptorEditMode(d)
  // checkbox（布尔）列即使物理类型是 TINYINT 也不当数字处理
  if (em === 'checkbox') return false
  return em === 'number' || ['INT', 'BIGINT', 'TINYINT', 'DECIMAL', 'NUMBER', 'FLOAT', 'DOUBLE'].includes(dt)
}

/**
 * 解析列的显示模式：显式 display.mode 优先；缺省时数值列默认 'number'，其余 'text'。
 * 用于 buildDisplayCellTemplate（决定是否格式化）与 _leafDescriptorToRevoCol（决定是否标 columnType=numeric）。
 */
function resolveDisplayMode (d) {
  const disp = d.display || {}
  return disp.mode || (isNumericDescriptor(d) ? 'number' : 'text')
}

function isDateDescriptor (d) {
  const dt = descriptorDataType(d)
  const mode = descriptorEditMode(d)
  return mode === 'date' || mode === 'datetime' || dt === 'DATE' || dt === 'DATETIME'
}

/** 是否日期时间（比纯日期更具体）：mode=datetime 或 物理类型 DATETIME。 */
function isDatetimeDescriptor (d) {
  const dt = descriptorDataType(d)
  return descriptorEditMode(d) === 'datetime' || dt === 'DATETIME'
}

function isBooleanDescriptor (d) {
  const dt = descriptorDataType(d)
  const mode = descriptorEditMode(d)
  return mode === 'checkbox' || dt === 'BOOLEAN'
}

function cmxTypeFromDataType (d) {
  if (isNumericDescriptor(d)) return 'number'
  if (isDatetimeDescriptor(d)) return 'datetime'   // datetime 先于 date 判定（更具体）
  if (isDateDescriptor(d)) return 'date'
  if (isBooleanDescriptor(d)) return 'checkbox'
  return 'text'
}

function legacyTypeToDataType (type) {
  if (type === 'number') return 'DECIMAL'
  if (type === 'date') return 'DATE'
  if (type === 'datetime') return 'DATETIME'
  if (type === 'boolean' || type === 'checkbox') return 'BOOLEAN'
  return 'VARCHAR'
}

/**
 * 解析列宽 → revo 列尺寸属性补丁。
 *
 * 支持的格式：
 *  - '120px' / '120'  → 固定像素 size
 *  - '20%'            → 百分比（相对 grid 数据列视口宽度），由 stretch mixin 换算为像素
 *  - 'flex'           → 弹性列（参与剩余空间均分，语义等同不设 width）
 *  - { size, min, max } → 对象形式（min/max → revo minSize/maxSize）
 *
 * 返回值字段：
 *  - { size, minSize, maxSize }：直接写入 revo col 的尺寸属性
 *  - { percent }：百分比标记，由 _leafDescriptorToRevoCol 挂到 col._cmxPercent，
 *    stretch mixin 据此按 available * percent/100 计算目标宽度
 *  - { flex }：弹性标记，行为等同默认列（base size 100 参与 stretch 均分）
 */
export function parseColWidth (width) {
  if (width == null) return null
  if (typeof width === 'object') {
    const patch = {}
    if (Number.isFinite(width.size)) patch.size = Number(width.size)
    if (Number.isFinite(width.min)) patch.minSize = Number(width.min)
    if (Number.isFinite(width.max)) patch.maxSize = Number(width.max)
    return Object.keys(patch).length ? patch : null
  }
  const s = String(width).trim()
  if (/^\d+px$/i.test(s)) return { size: parseInt(s, 10) }
  if (/^\d+$/.test(s)) return { size: parseInt(s, 10) }
  // 百分比：保留数值（之前仅打 _flex 死标记导致百分比被静默丢弃）
  const pct = /^(\d+(?:\.\d+)?)%$/.exec(s)
  if (pct) return { percent: parseFloat(pct[1]) }
  if (s === 'flex') return { flex: true }
  return null
}

/**
 * 构建一个数据列的统一 cellTemplate（P0/P1：format 预设 + badge/icon/link + 0不显示）。
 * 返回 (h, props) => VNode|string。仅当 display 配置需要自定义渲染时返回，否则返回 null（用默认）。
 * @param {object} d 列描述符（含 d.display / d.dataType / d.decimalDigits）
 */
export function buildDisplayCellTemplate (d) {
  const disp = d.display || {}
  const isNumber = isNumericDescriptor(d)
  const mode = resolveDisplayMode(d)
  const empty = disp.emptyText ?? ''

  // ── select（静态枚举下拉）列让位 ──
  // select 列的"按 value 回显 label"由 select 字段类型注册表（cmx-builtin-field-types.js）
  // 的 grid.cellTemplate 负责：它读列自带 options，按 value 查 label，查不到回退显示原 value。
  // 若此处对 select 列返回了 cellTemplate（如下方 text+number 分支会返回"原样显示 value"），
  // _leafDescriptorToRevoCol 会把它赋给列（cmx-column-adapter.js: if (tpl) col.cellTemplate = tpl），
  // 导致 applyRegisteredFieldTypesToColumns（cmx-revo-grid.js）因「列已自带 cellTemplate」而跳过
  // select 类型模板的注入——非编辑态就只显示原始 value（如 1），看不到枚举 label（如 启用）。
  // 故对 select 列提前返回 null（不带 cellTemplate），把显示渲染让给字段类型注册表。
  // 注意：数值枚举列（如 TINYINT + edit.mode=select 的 status 字段）isNumber 虽为 true，
  //       但其显示语义是"枚举 label"而非"数值原样"，故同样让位，不受下方 text+number 原样分支影响。
  const em = descriptorEditMode(d)
  if (em === 'select') return null

  // 字典外键回显：grid 层预加载字典后，把 resolver 挂到 display.resolve。
  // resolver(raw) → 字典名称；未预加载/未命中时优雅降级返回原 id。
  if (typeof disp.resolve === 'function') {
    return (h, props) => {
      const raw = props.model ? props.model[props.prop] : undefined
      if (raw == null || raw === '') return empty
      const text = disp.resolve(raw, props.model, props.prop)
      return text == null || text === '' ? String(raw) : String(text)
    }
  }

  // 取格式化后的文本：number 模式走数值格式化；text 模式原样字符串（不碰数值格式化）。
  const fmtText = (raw, row) => {
    if (disp.format != null) return formatByPreset(raw, { format: disp.format, decimalDigits: disp.decimalDigits ?? d.decimalDigits, zeroAsBlank: disp.zeroAsBlank, emptyText: empty }, row)
    if (mode === 'number') return formatGridNumber(raw, { decimalDigits: disp.decimalDigits ?? d.decimalDigits, displayMask: disp.format, zeroAsBlank: disp.zeroAsBlank, thousandSep: disp.thousandSeparator })
    return raw == null || raw === '' ? empty : String(raw)
  }

  // 逃生舱：自定义 render
  if (typeof disp.render === 'function') {
    return (h, props) => disp.render(h, props)
  }

  // badge / icon / link 内置渲染
  if (mode === 'badge' && disp.badgeMap) {
    return (h, props) => {
      const raw = props.model ? props.model[props.prop] : undefined
      const conf = disp.badgeMap[raw] || disp.badgeMap[String(raw)]
      if (!conf) { const t = fmtText(raw, props.model); return t === '' ? '' : t }
      const color = conf.color || 'var(--sapNeutralColor,#6a6d70)'
      const text = conf.text != null ? conf.text : fmtText(raw, props.model)
      const children = conf.icon
        ? [h('ui5-icon', { name: conf.icon, style: { width: '.75rem', height: '.75rem', marginRight: '2px', verticalAlign: '-1px' } }), text]
        : text
      return h('span', { class: 'cmx-cell-badge', style: { display:'inline-block', padding:'1px 8px', borderRadius:'10px', fontSize:'.75rem', color:'var(--sapGroup_ContentBorderColor, #ffffff)', background: color } }, children)
    }
  }
  if (mode === 'icon' && disp.icon) {
    return (h, props) => {
      const raw = props.model ? props.model[props.prop] : undefined
      const name = typeof disp.icon === 'string' ? disp.icon : (disp.icon[raw] || disp.icon[String(raw)])
      if (!name) return fmtText(raw, props.model)
      return h('ui5-icon', { name, style: { color:'var(--sapContent_IconColor,var(--sapHighlightColor))' } })
    }
  }
  if (mode === 'link') {
    const link = disp.link && typeof disp.link === 'object' ? disp.link : {}
    return (h, props) => {
      const raw = props.model ? props.model[props.prop] : undefined
      const text = fmtText(raw, props.model)
      if (text === '') return ''
      const attrs = { class: 'cmx-cell-link', style: { color:'var(--sapLinkColor,#0070f2)', cursor:'pointer', textDecoration:'underline' }, 'data-cmx-link': d.id }
      // display.link.href：模板字符串 {field} 占位 → 渲染真实超链接；否则走 actionRef 点击事件
      if (link.href) {
        const href = String(link.href).replace(/\{(\w+)\}/g, (_, f) => (props.model && props.model[f] != null ? encodeURIComponent(props.model[f]) : ''))
        attrs.href = href
        if (link.target) attrs.target = link.target
      }
      return h('a', attrs, text)
    }
  }
  // actions 模式：一列多个操作按钮（固定文字），每按钮独立 actionRef，点击派发 cmx-cell-link-click。
  // 配置：display.actions:[{ text, actionRef, icon?, color?, variant?, visible?(model)=>bool }]
  // （variant: ''/negative/emphasized；visible 可选，按行 model 过滤按钮，不传或返回非 false 则显示）。
  if (mode === 'actions' && Array.isArray(disp.actions) && disp.actions.length) {
    const actions = disp.actions.filter(a => a && a.actionRef != null)
    return (h, props) => {
      const model = props.model || {}
      const vis = actions.filter(a => (typeof a.visible !== 'function') || a.visible(model))
      if (!vis.length) return ''
      return h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', justifyContent: 'center', height: '100%', boxSizing: 'border-box' } },
      vis.map(a => {
        const color = a.color || (a.variant === 'negative' ? 'var(--sapNegativeColor,#bb0000)'
          : a.variant === 'emphasized' ? 'var(--sapButton_Emphasized_Background,#0070f2)' : 'var(--sapLinkColor,#0070f2)')
        const children = a.icon
          ? [h('ui5-icon', { name: a.icon, style: { width: '0.8rem', height: '0.8rem' } }), a.text || '']
          : [a.text || '']
        return h('span', {
          'data-cmx-link': d.id, 'data-cmx-action': a.actionRef,
          class: 'cmx-cell-action',
          style: { display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 9px',
            border: '1px solid var(--sapButton_Lite_BorderColor,#e0e0e0)', borderRadius: '10px',
            cursor: 'pointer',
            color, fontSize: '0.75rem', lineHeight: '1.4', userSelect: 'none', whiteSpace: 'nowrap' },
        }, children)
      })
    )
    }
  }

  // number 模式 或 配了 format → 用数值格式化模板（含千分位/小数位/负数红字）。
  if (mode === 'number' || disp.format != null) {
    // 数值默认负数标红（display.negativeColor:false 可关）。键名与 schema / 引擎 / CTX 数据统一用 negativeColor。
    const negColor = isNumber && disp.negativeColor !== false
    return (h, props) => {
      const raw = props.model ? props.model[props.prop] : undefined
      const text = fmtText(raw, props.model)
      if (text === '') return ''
      if (negColor && Number(raw) < 0) {
        return h('span', { style: { color: 'var(--sapNegativeColor,#bb0000)' } }, text)
      }
      return text
    }
  }
  // text 模式 + 数值列：原样字符串显示（不走数值格式化，避免 BIGINT id 列出现小数点/千分位）。
  // 必须返回模板，否则 revo-grid 对数值列会用内置格式化。普通文本列（非数值）仍返回 null 走默认渲染。
  if (mode === 'text' && isNumber) {
    return (h, props) => {
      const raw = props.model ? props.model[props.prop] : undefined
      if (raw == null || raw === '') return empty
      return String(raw)
    }
  }
  return null
}

/** 构建条件样式 cellProperties（P2）：合并对齐 + cellStyle 规则 */
export function buildCellProperties (d) {
  const disp = d.display || {}
  const align = disp.align
  // 默认对齐：显式 align 优先；否则 number/date 右对齐、center 居中、其余(文本)左对齐
  const autoRight = isNumericDescriptor(d) || isDateDescriptor(d)
  const baseClass = align === 'right' || (align == null && autoRight) ? 'cmx-revo-align-right'
    : align === 'center' ? 'cmx-revo-align-center'
    : align === 'left' ? null
    : null
  const rules = disp.cellStyle
  const hasRules = Array.isArray(rules) && rules.length
  if (!baseClass && !hasRules) return null
  return (props) => {
    const out = { class: {} }
    if (baseClass) out.class[baseClass] = true
    if (hasRules) {
      const raw = props.model ? props.model[props.prop] : undefined
      /* scope：行字段直接铺平 + value（当前列值）。formula-eval 只认单段标识符，
         故条件用扁平字段名，如 'value < 0' 或 'status != "draft"'（status 为行字段）。 */
      const scope = { ...(props.model || {}), value: raw, __col: d.id }
      const styled = resolveCellStyle(rules, scope, evalFormula)
      if (styled) {
        if (styled.class) Object.assign(out.class, styled.class)
        if (styled.style) out.style = styled.style
      }
    }
    return out
  }
}

/**
 * 数值显示格式化（grid 数值列默认渲染规则）：
 *   1) 值为 0（或空/NaN）→ 不显示（返回空串）
 *   2) 默认千分位 + 2 位小数
 *   3) 列上有定义则按列定义：decimalDigits 指定小数位；displayMask 为函数则优先用之
 * @param {any} raw 原始值
 * @param {{ decimalDigits?: number|null, displayMask?: any, thousandSep?: boolean }} [opt]
 * @returns {string}
 */
export function formatGridNumber (raw, opt = {}) {
  // 自定义格式化函数优先（displayMask 为 function）
  if (typeof opt.displayMask === 'function') {
    try { const r = opt.displayMask(raw); return r == null ? '' : String(r) } catch (_) { /* 落到默认 */ }
  }
  if (raw == null || raw === '') return ''
  const n = Number(raw)
  if (!Number.isFinite(n)) return ''
  if (n === 0 && opt.zeroAsBlank !== false) return ''   // 规则1：0 不显示（可关）
  const decimals = Number.isFinite(opt.decimalDigits) && opt.decimalDigits != null
    ? Number(opt.decimalDigits)
    : 2                                        // 规则2/3：列定义小数位，否则默认 2 位
  const useThousand = opt.thousandSep !== false
  return n.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: useThousand,                  // 千分位
  })
}

/**
 * 按 display.format 预设/函数格式化值（P0 统一格式化入口）。
 * 支持预设：
 *   'thousands' | 'thousands:N'   千分位 N 位小数（默认 2）
 *   'percent'   | 'percent:N'     百分比（值×100，N 位小数）
 *   'currency'  | 'currency:¥'    货币（前缀符号 + 千分位 2 位）
 *   'date:FMT'                    日期格式（FMT 支持 YYYY/MM/DD/HH/mm/ss，默认 YYYY-MM-DD）
 *   'datetime:FMT'                日期时间格式（默认 YYYY-MM-DD HH:mm:ss）
 *   函数(raw,row)=>string         自定义
 * @param {any} raw
 * @param {{ format?:any, decimalDigits?:number, zeroAsBlank?:boolean, emptyText?:string }} opt
 * @param {object} [row]
 * @returns {string}
 */
export function formatByPreset (raw, opt = {}, row = null) {
  const fmt = opt.format
  const empty = opt.emptyText ?? ''
  if (typeof fmt === 'function') {
    try { const r = fmt(raw, row); return r == null ? empty : String(r) } catch (_) { return empty }
  }
  if (typeof fmt === 'string' && fmt) {
    // 用首个冒号切分 name/arg，避免格式串中的冒号（如 HH:mm:ss）被一并切开。
    const idx = fmt.indexOf(':')
    const name = idx >= 0 ? fmt.slice(0, idx) : fmt
    const arg = idx >= 0 ? fmt.slice(idx + 1) : undefined
    if (name === 'thousands') {
      return formatGridNumber(raw, { decimalDigits: arg != null ? Number(arg) : opt.decimalDigits, zeroAsBlank: opt.zeroAsBlank })
    }
    if (name === 'percent') {
      if (raw == null || raw === '' || !Number.isFinite(Number(raw))) return empty
      const dec = arg != null ? Number(arg) : (opt.decimalDigits ?? 2)
      return (Number(raw) * 100).toFixed(dec) + '%'
    }
    if (name === 'currency') {
      const sym = arg || '¥'
      const s = formatGridNumber(raw, { decimalDigits: opt.decimalDigits ?? 2, zeroAsBlank: opt.zeroAsBlank })
      return s ? sym + s : s
    }
    if (name === 'date') {
      return formatDateValue(raw, arg || 'YYYY-MM-DD', empty)
    }
    if (name === 'datetime') {
      return formatDateValue(raw, arg || 'YYYY-MM-DD HH:mm:ss', empty)
    }
  }
  // 无 format：原值（数值列由调用方走 formatGridNumber）
  return raw == null || raw === '' ? empty : String(raw)
}

/** 日期格式化：解析统一走 cmx-shared/datetime（date-only 按本地午夜、无时区串按 UTC，前端时间显示规范），再按 format token 拼接 */
function formatDateValue (raw, fmt, empty) {
  if (raw == null || raw === '') return empty
  const d = parseDate(raw)
  if (!d) {
    // 容错：不可解析非空值直接原样
    return String(raw)
  }
  const p = getParts(d)
  const p2 = (n) => String(n).padStart(2, '0')
  const day = p2(p.day)

  return fmt
    .replace(/YYYY/g, String(p.year))
    .replace(/MM/g, p2(p.month))
      // 日期：支持 DD 和 dd
      .replace(/DD/g, day)
      .replace(/dd/g, day)
    .replace(/HH/g, p2(p.hour))
    .replace(/mm/g, p2(p.minute))
    .replace(/ss/g, p2(p.second))
}

/**
 * 求值条件样式规则（P2）。返回 { class, style } 供 cellProperties 用。
 * @param {Array} rules [{ when, class?, style? }]
 * @param {{ value:any, row:object, col:string }} scope
 * @param {(expr:string,scope:object,fallback:any)=>any} evalFn formula-eval.evalFormula
 */
export function resolveCellStyle (rules, scope, evalFn) {
  if (!Array.isArray(rules) || !rules.length || typeof evalFn !== 'function') return null
  for (const r of rules) {
    if (!r) continue
    const hit = r.when == null || r.when === '' ? true : !!evalFn(r.when, scope, false)
    if (hit) {
      const out = {}
      if (r.class) out.class = typeof r.class === 'string' ? { [r.class]: true } : r.class
      if (r.style) out.style = r.style
      return out
    }
  }
  return null
}


export class CmxColumnAdapter {

  // ─── cmx-ui5-table 适配 ───────────────────────────────────────────────

  /**
   * 将 CmxColumnModel 转换为 cmx-ui5-table 所需的三项配置。
   * @param {CmxColumnModel} model
   * @returns {{ columns: object[], headerGroups: object[], totals: object|null }}
   */
  /** 将单个 CmxColumn 的描述符转为 cmx-ui5-table 列定义 */
  static _descriptorToColumnDef(d) {
    const def = {
      key:   d.id,
      label: d.caption,
      type:  CmxColumnAdapter._cmxTableType(d),
    }
    if (d.width)  def.width  = d.width
    if (d.display?.align)  def.align  = d.display.align

    const es = d.editSettings || {}
    if (es.options)         def.options         = es.options
    if (es.placeholder)     def.placeholder     = es.placeholder
    if (es.source)          def.source          = es.source
    if (es.dependents)      def.dependents      = es.dependents
    if (es.helper)          def.helper          = es.helper
    if (es.valueField)      def.valueField      = es.valueField
    if (es.displayTemplate) def.displayTemplate = es.displayTemplate

    if (d.calcFormula     != null) def.onChange        = d.calcFormula
    if (d.displayMask     != null) def.formatter       = d.displayMask
    if (d.validateFormula != null) def.validateFormula = d.validateFormula

    return def
  }

  /**
   * 将 edit.mode / dataType 映射到 cmx-ui5-table 的 column.type。
   * 优先 edit.mode 语义。
   */
  static _cmxTableType(d) {
    // 取原始 edit.mode（不经 fallback），用于判断是否「显式指定」。
    // cmx-text-input 既是规范文本输入值、又是 CmxColumn._normalizeEdit / descriptorEditMode 的默认值，
    // 无法用 kind 区分用户意图；故 input 不进白名单，仍走 dataType 派生
    // （VARCHAR→text、INT→number、BOOLEAN→checkbox）。
    // 只有「非默认」的文本类（textarea/rich-text/image/video）出现即显式意图，强制返回 text。
    const rawEdit = descriptorEdit(d)
    const rawMode = rawEdit && rawEdit.mode ? String(rawEdit.mode) : (d && d.editMode ? String(d.editMode) : '')
    const em = rawMode ? editModeKind(rawMode) : ''
    if (em === 'readonly' || em === 'none') return 'readonly'
    // 控件型（原样返回，注册表有对应编辑器）：select/ref/combo/ignite-combo/dict-select/checkbox
    //   含 checkbox：避免 TINYINT+checkbox 被 isNumericDescriptor 抢判为 number
    if (['select', 'ref', 'combo', 'ignite-combo', 'dict-select', 'checkbox'].includes(em)) return em
    // 显式文本型（非默认值，出现即用户意图；image/video 无编辑器退化文本）：强制 text
    if (['textarea', 'rich-text', 'image', 'video'].includes(em)) return 'text'
    // 其余（含 input/number/date/datetime 及无 edit.mode）交给 dataType 派生
    return cmxTypeFromDataType(d)
  }

  /**
   * 构建 cmx-ui5-table setHeaderGroups() 所需的树形数组（支持 N 层嵌套）。
   *
   * 树形节点结构：
   *   叶节点（CmxColumn）：{ label, leaf: true }
   *   分组节点（CmxColumnGroup）：{ label, children: [...] }
   *
   * 无任何 CmxColumnGroup 时返回 []（退化为单行表头）。
   */
  static _cmxTableHeaderGroups(model) {
    const hasGroup = model.members.some((m) => m instanceof CmxColumnGroup)
    if (!hasGroup) return []
    return model.members
      .filter((m) => m instanceof CmxColumn ? m.visible !== false : true)
      .map((m) => CmxColumnAdapter._memberToHeaderNode(m))
  }

  /** 递归把 CmxColumn/CmxColumnGroup 转为树形表头节点 */
  static _memberToHeaderNode(m) {
    if (m instanceof CmxColumn) {
      return { label: m.caption || m.id, leaf: true }
    }
    // CmxColumnGroup：递归处理 members
    const children = m.members
      .filter((c) => c instanceof CmxColumn ? c.visible !== false : true)
      .map((c) => CmxColumnAdapter._memberToHeaderNode(c))
    return { label: m.caption || m.id, children }
  }

  /**
   * 构建 cmx-ui5-table setTotals() 所需配置。
   * 收集所有顶层 CmxColumnGroup 中聚合的列 → { key: agg }（sum/avg/max/min/count）。
   * 同列多聚合时后者覆盖（一列一种合计语义）。无聚合时返回 null。
   */
  static _cmxTableTotals(model) {
    const keys = []
    const aggMap = {}
    const seen = new Set()
    let position = null
    for (const m of model.members) {
      if (!(m instanceof CmxColumnGroup)) continue
      if (position == null && m.aggregatePosition) position = m.aggregatePosition
      for (const { key, agg } of m.aggregateColumns()) {
        aggMap[key] = agg
        if (!seen.has(key)) { seen.add(key); keys.push(key) }
      }
    }
    return keys.length ? { label: '合计', columns: keys, aggMap, position: position || 'after' } : null
  }


  // ─── cmx-ui5-form 适配 ────────────────────────────────────────────────

  /**
   * 将 CmxColumnModel 转换为 cmx-ui5-form setFields() 所需的字段数组。
   * 只展平 CmxColumn（跳过 CmxColumnGroup 的包装层），按声明顺序输出。
   * @param {CmxColumnModel} model
   * @returns {object[]}  field[]
   */
  static toCmxForm(model) {
    const fields = []
    for (const d of CmxColumnAdapter._flatDescriptors(model.toDescriptors())) {
      fields.push(CmxColumnAdapter._leafDescriptorToFormField(d))
    }
    return fields
  }

  /**
   * 树形版：保留 CmxColumnGroup 嵌套，输出 cmx-ui5-form `setFields(...)` 的树形输入：
   *   叶节点 = Field（含 key/label/type/...）
   *   分组节点 = { type:'group', caption, children:[Field|Group, ...] }
   * 没有 CmxColumnGroup 时退化为扁平数组（与 toCmxForm 同结果，可直接 setFields）。
   */
  static toCmxFormGrouped(model) {
    return model.toDescriptors().map((d) => CmxColumnAdapter._descriptorToFormNode(d))
  }

  static _descriptorToFormNode(d) {
    if (d.type === 'group') {
      return {
        type:     'group',
        caption:  d.caption || '',
        children: (d.children || []).map((c) => CmxColumnAdapter._descriptorToFormNode(c)),
      }
    }
    return CmxColumnAdapter._leafDescriptorToFormField(d)
  }

  static _leafDescriptorToFormField(d) {
    const f = {
      key:   d.id,
      label: d.caption,
      type:  CmxColumnAdapter._cmxTableType(d),
    }
    if (d.width)       f.width       = d.width
    const editMode = descriptorEditMode(d)
    if (editMode === 'readonly' || editMode === 'none') f.readonly = true
    if (d.required)    f.required    = true
    const ed = d.edit || {}
    const es = d.editSettings || ed
    if (es.options)    f.options      = es.options
    if (es.placeholder) f.placeholder = es.placeholder
    if (es.source)     f.source       = es.source
    if (d.calcFormula) f.onChange     = d.calcFormula
    if (d.displayMask) f.formatter    = d.displayMask
    // 把 edit.* 高级属性提升到 form field 顶层（form 的 ref/select/commit 逻辑读 field.<prop>）
    if (ed.valueField != null && f.valueField == null) f.valueField = ed.valueField
    if (ed.displayTemplate != null && f.displayTemplate == null) f.displayTemplate = ed.displayTemplate
    if (Array.isArray(ed.dependents) && ed.dependents.length) f.dependents = ed.dependents
    if (ed.options && f.options == null) f.options = ed.options
    if (ed.source && f.source == null) f.source = ed.source
    if (ed.placeholder && f.placeholder == null) f.placeholder = ed.placeholder
    // 校验/条件属性透传（form 端若实现校验可读取）
    if (ed.required) f.required = true
    if (ed.requiredWhen) f.requiredWhen = ed.requiredWhen
    if (ed.readonlyWhen) f.readonlyWhen = ed.readonlyWhen
    if (ed.validate != null) f.validate = ed.validate
    if (ed.validateWhen) f.validateWhen = ed.validateWhen
    if (ed.validateMessage) f.validateMessage = ed.validateMessage
    if (ed.requiredMessage) f.requiredMessage = ed.requiredMessage
    // display 透传（form 只读展示态可消费 format/mode 等）
    if (d.display && typeof d.display === 'object') f.display = d.display
    /* 整段 editSettings 透传：combo 等字段类型在 form.create 里读 field.editSettings.{dropdown,
       valueField, displayTemplate, parentField, dropdownColumns, paginated, pageSize, extensionButtons, ...},
       上面 cherry-pick 不够；保留 editSettings 让字段类型自己决定怎么用。 */
    if (d.editSettings) f.editSettings = d.editSettings
    // refDict 透传：dict-select 录入控件的 dictCode 统一取自 field.refDict（与「引用字典」合一）。
    if (d.refDict != null) f.refDict = d.refDict
    if (d.colspan != null) f.colspan = d.colspan
    return f
  }

  /** 递归展平描述符数组（跳过 group 包装，只取叶列） */
  static _flatDescriptors(descriptors) {
    const result = []
    for (const d of descriptors) {
      if (d.type === 'group') result.push(...CmxColumnAdapter._flatDescriptors(d.children || []))
      else result.push(d)
    }
    return result
  }

  // ─── AG Grid 适配 ─────────────────────────────────────────────────────

  /**
   * 将 CmxColumnModel 转换为 AG Grid 所需配置。
   * @param {CmxColumnModel} model
   * @returns {{ columnDefs: object[], pinnedSumFields: string[] }}
   *   columnDefs      传给 createGrid / el.gridOptions 的 columnDefs
   *   pinnedSumFields 传给 updatePinned(api, pinnedSumFields) 的字段列表
   */
  static toAgGrid(model) {
    // toDescriptors() 已递归输出树形 group/column 结构，_descriptorToAgCol 保持嵌套
    const columnDefs      = model.toDescriptors().map((d) => CmxColumnAdapter._descriptorToAgCol(d))
    const aggMap          = model.toAggregateMap()
    const pinnedSumFields = aggMap.get('sum') || []
    return { columnDefs, pinnedSumFields }
  }

  /** 将单个描述符（column 或 group）转为 AG Grid colDef */
  static _descriptorToAgCol(d) {
    if (d.type === 'group') {
      return {
        headerName: d.caption,
        children:   (d.children || []).map((c) => CmxColumnAdapter._descriptorToAgCol(c)),
      }
    }
    return CmxColumnAdapter._leafDescriptorToAgCol(d)
  }

  static _leafDescriptorToAgCol(d) {
    const editMode = descriptorEditMode(d)
    const isReadonly = editMode === 'readonly' || editMode === 'none'
    const RIGHT = { textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
    const fmt2  = (v) => v == null ? '' :
      Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

    const col = {
      colId:      d.id,
      field:      d.id,
      headerName: d.caption,
      editable:   isReadonly ? false : (p) => !p.node?.rowPinned,
    }

    // 宽度
    if (d.width && /^\d+px$/i.test(d.width)) {
      const px = parseInt(d.width)
      col.width = px; col.minWidth = px
    } else {
      col.flex = 1; col.minWidth = 80
    }

    // 类型特定属性
    if (isNumericDescriptor(d)) {
      Object.assign(col, {
        cellDataType: 'number',
        cellEditor: 'agNumberCellEditor',
        cellStyle:  RIGHT,
        valueFormatter: d.displayMask
          ? (p) => d.displayMask(p.value, p.data)
          : (p) => p.value == null ? '' : fmt2(p.value),
      })
      if (d.calcFormula) {
        col.valueSetter = (p) => {
          p.data[d.id] = Number(p.newValue) || 0
          d.calcFormula(p.data, p.data[d.id])
          return true
        }
      }
    } else if (editMode === 'select') {
      const opts = descriptorEdit(d).options || d.editSettings?.options || []
      Object.assign(col, {
        cellEditor: 'agSelectCellEditor',
        cellEditorParams: { values: opts.map((o) => o.value) },
        valueFormatter: (p) => {
          if (p.value == null) return ''
          return opts.find((o) => o.value === p.value)?.label ?? p.value
        },
      })
    } else if (isDateDescriptor(d)) {
      col.cellEditor = 'agDateStringCellEditor'
      if (d.displayMask) col.valueFormatter = (p) => d.displayMask(p.value, p.data)
    } else if (isReadonly) {
      col.cellStyle = { color: 'var(--ag-secondary-foreground-color, #6a6d70)' }
      if (d.displayMask) {
        col.valueFormatter = (p) => d.displayMask(p.value, p.data)
      } else if (isNumericDescriptor(d)) {
        col.valueFormatter = (p) => p.value == null ? '' : fmt2(p.value)
      }
    } else {
      // text
      if (d.displayMask) col.valueFormatter = (p) => d.displayMask(p.value, p.data)
    }

    return col
  }

  // ─── RevoGrid 适配 ────────────────────────────────────────────────────

  /**
   * 将 CmxColumnModel 转换为 cmx-revo-grid / revo-grid 所需配置。
   * @param {CmxColumnModel} model
   * @returns {{ columns: object[], totals: object|null, pinnedSumFields: string[] }}
   */
  static toRevoGrid(model) {
    /* 直接走 members（保留 CmxColumn 引用），不走 toDescriptors —— 后者只产出快照，
       CmxColumn.editSettings 后续被业务代码修改时取不到最新值。 */
    const columns = (model.members || [])
      .filter((m) => m && (m.constructor?.name === 'CmxColumnGroup' || m.visible !== false))
      .map((m) => CmxColumnAdapter._memberToRevoCol(m))
    const aggMap = model.toAggregateMap()
    const pinnedSumFields = aggMap.get('sum') || []
    const totals = CmxColumnAdapter._cmxTableTotals(model)
    return { columns, totals, pinnedSumFields }
  }

  /** CmxColumnGroup → revo header group；CmxColumn → revo leaf。两者均保留对原对象的引用。 */
  static _memberToRevoCol (m) {
    if (m && Array.isArray(m.members)) {
      return {
        // 分组表头 caption 可能是 i18n 对象，解析为当前语言显示串（此路径不经 toDescriptor）
        name: fieldCaption(m) || '',
        children: m.members
          .filter((c) => c && (c.constructor?.name === 'CmxColumnGroup' || c.visible !== false))
          .map((c) => CmxColumnAdapter._memberToRevoCol(c)),
      }
    }
    /* CmxColumn → 用 descriptor 拼 revo 配置；同时把 CmxColumn 原始引用挂为 _cmxCol，
       这样 grid editor / cellTemplate 能拿到"动态最新"的 editSettings。 */
    return CmxColumnAdapter._leafColumnToRevoCol(m)
  }

  static _leafColumnToRevoCol (col) {
    const d = typeof col.toDescriptor === 'function' ? col.toDescriptor() : col
    const out = CmxColumnAdapter._leafDescriptorToRevoCol(d)
    /* 用真实引用替换 _cmxCol（_leafDescriptorToRevoCol 写的是快照） */
    out._cmxCol = col
    return out
  }

  /** cmx-ui5-table 风格列定义 → RevoGrid ColumnRegular */
  static cmxColumnsToRevo(columns) {
    return (columns || []).map((c) => CmxColumnAdapter._cmxColumnToRevo(c))
  }

  /** 树形表头节点 + 叶列数组 → RevoGrid 嵌套 columns（扁平 headerGroups 格式） */
  static cmxHeaderGroupsToRevo(groups, leafColumns) {
    if (!groups?.length) return leafColumns
    const isTree = groups.some((g) => 'leaf' in g || 'children' in g)
    if (isTree) {
      return groups.map((n) => CmxColumnAdapter._headerNodeToRevo(n, leafColumns, { idx: 0 }))
    }
    const revoLeaves = CmxColumnAdapter.cmxColumnsToRevo(leafColumns)
    const out = []
    let offset = 0
    for (const g of groups) {
      const span = Math.max(1, g.span || 1)
      const slice = revoLeaves.slice(offset, offset + span)
      offset += span
      if (!slice.length) break
      if (g.merged && slice.length === 1) {
        out.push({ ...slice[0], name: g.label || slice[0].name })
      } else {
        out.push({ name: g.label || '', children: slice })
      }
    }
    for (const c of revoLeaves.slice(offset)) out.push(c)
    return out
  }

  static _headerNodeToRevo(node, leafCols, counter) {
    if (node.leaf) {
      const col = leafCols[counter.idx++]
      return col ? CmxColumnAdapter._cmxColumnToRevo(col) : null
    }
    const children = (node.children || [])
      .map((ch) => CmxColumnAdapter._headerNodeToRevo(ch, leafCols, counter))
      .filter(Boolean)
    return { name: node.label || '', children }
  }

  static _descriptorToRevoCol(d) {
    if (d.type === 'group') {
      return {
        name: d.caption || '',
        children: (d.children || []).map((c) => CmxColumnAdapter._descriptorToRevoCol(c)),
      }
    }
    return CmxColumnAdapter._leafDescriptorToRevoCol(d)
  }

  static _leafDescriptorToRevoCol(d) {
    const edit = descriptorEdit(d)
    const editMode = descriptorEditMode(d)
    const isReadonly = editMode === 'readonly' || editMode === 'none'
    const col = {
      prop: d.id,
      name: d.caption || d.id,
      readonly: isReadonly,
      _cmxKey: d.id,
      _cmxType: CmxColumnAdapter._cmxTableType(d),
    }
    // 宽度（'px'|'%'|'flex'|{size,min,max}）
    const wp = parseColWidth(d.width)
    if (wp) {
      if (wp.size != null) col.size = wp.size
      if (wp.minSize != null) col.minSize = wp.minSize
      if (wp.maxSize != null) col.maxSize = wp.maxSize
      // 百分比 / flex 标记：由 stretch mixin 消费（_columnsForViewport 按 available 换算）
      if (wp.percent != null) col._cmxPercent = wp.percent
      else if (wp.flex) col._cmxFlex = true
    }
    // 冻结列（pin）：'right'/'end' → 右冻结；'left'/'start'/true(旧布尔兼容) → 左冻结
    if (d.frozen === 'right' || d.frozen === 'end') col.pin = 'colPinEnd'
    else if (d.frozen) col.pin = 'colPinStart'
    // 数值列标记：仅当显示模式走数值格式化（number，即默认或显式 number）时才标 numeric，
    // 避免 revo-grid 对 mode:'text' 的数值列内置格式化（如 BIGINT id 列原样显示）。
    if (isNumericDescriptor(d) && resolveDisplayMode(d) === 'number') col.columnType = 'numeric'
    // 调用方在 CmxColumn 上直接挂的 cellTemplate/cellProperties（经 toDescriptor 透传来），
    // 优先级最高：先搬到 col，再让 buildDisplayCellTemplate / buildCellProperties 在其缺失时补默认。
    if (typeof d.cellTemplate === 'function') col.cellTemplate = d.cellTemplate
    if (typeof d.cellProperties === 'function') col.cellProperties = d.cellProperties
    // 统一显示 cellTemplate（format 预设 / badge / icon / link / 数值 / text 原样）；列已自带不覆盖
    if (!col.cellTemplate) {
      const tpl = buildDisplayCellTemplate(d)
      if (tpl) col.cellTemplate = tpl
    }
    // 单元格属性（对齐 + 条件样式 cellStyle）；列已自带不覆盖
    if (!col.cellProperties) {
      const cp = buildCellProperties(d)
      if (cp) col.cellProperties = cp
    }
    // 编辑后计算
    if (d.calcFormula) col._cmxOnChange = d.calcFormula
    if (d.display?.format) col._cmxFormatter = d.display.format
    if (edit.options?.length) col._cmxSelectOptions = edit.options
    /* _cmxCol：真实/伪 CmxColumn 元数据，供 grid editor / 编辑校验读取最新 display/edit 配置 */
    col._cmxCol = {
      id: d.id, caption: d.caption,
      dataType: d.dataType,
      editSettings: d.editSettings || edit,
      display: d.display, edit,
      // 字典外键回显元数据（供 grid 层预加载字典时收集）
      refDict: d.refDict, refField: d.refField, displayField: d.displayField,
      // 编辑控制元数据（grid 侧消费）
      trigger: edit.trigger, required: edit.required, requiredWhen: edit.requiredWhen,
      validate: edit.validate, validateWhen: edit.validateWhen, readonlyWhen: edit.readonlyWhen,
      dependents: edit.dependents,
    }
    if (d.editSettings) col.editSettings = d.editSettings
    else if (Object.keys(edit).length) col.editSettings = edit
    if (edit.source) col.source = edit.source
    return col
  }

  static _cmxColumnToRevo(col) {
    /* 双轨合一：把 cmx-ui5-table 风格列 {key,label,type,...} 归一为描述符，
       走与 setColumnModel 相同的 _leafDescriptorToRevoCol，单一事实来源。 */
    const d = CmxColumnAdapter._legacyColToDescriptor(col)
    const revo = CmxColumnAdapter._leafDescriptorToRevoCol(d)
    // 旧路径允许调用方直接挂 cellTemplate / cellProperties，优先级最高
    if (typeof col.cellTemplate === 'function') revo.cellTemplate = col.cellTemplate
    if (typeof col.cellProperties === 'function') revo.cellProperties = col.cellProperties
    return revo
  }

  /** cmx-ui5-table 风格列 → 通用描述符（含 display/edit 归一化） */
  static _legacyColToDescriptor(col) {
    const isReadonly = col.type === 'readonly' || col.editable === false
    const display = { ...(col.display || {}) }
    if (display.align == null && col.align != null) display.align = col.align
    if (display.format == null && typeof col.formatter === 'function') display.format = col.formatter
    if (display.format == null && col.displayMask != null) display.format = col.displayMask
    if (display.decimalDigits == null && col.decimalDigits != null) display.decimalDigits = col.decimalDigits
    if (display.mode == null && col.displayMode) display.mode = col.displayMode
    if (display.badgeMap == null && col.badgeMap) display.badgeMap = col.badgeMap
    if (display.cellStyle == null && col.cellStyle) display.cellStyle = col.cellStyle
    if (display.mode == null) display.mode = 'text'
    const edit = { ...(col.editSettings || {}), ...(col.edit || {}) }
    if (edit.mode == null) edit.mode = isReadonly ? 'readonly' : (col.editMode || (col.type === 'number' ? 'cmx-number-input' : 'cmx-text-input'))
    if (edit.options == null && col.options) edit.options = col.options
    if (edit.source == null && col.source) edit.source = col.source
    if (edit.dependents == null && col.dependents) edit.dependents = col.dependents
    if (edit.required == null && col.required != null) edit.required = col.required
    if (edit.trigger == null) edit.trigger = 'inherit'
    return {
      id: col.key, caption: col.label || col.key, dataType: col.dataType || legacyTypeToDataType(col.type),
      width: col.width, frozen: col.frozen,
      calcFormula: col.onChange || col.calcFormula,
      editSettings: col.editSettings,
      decimalDigits: col.decimalDigits,
      display, edit,
    }
  }

  // ─── Ignite Grid 适配 ─────────────────────────────────────────────────

  /**
   * 将 CmxColumnModel 转为 cmx-ignite-grid / igc-grid 列配置。
   * @param {CmxColumnModel} model
   * @returns {{ columns: object[], totals: object|null }}
   */
  static toIgniteGrid (model) {
    const columns = CmxColumnAdapter._flatDescriptors(model.toDescriptors())
      .map((d) => CmxColumnAdapter._descriptorToIgniteCol(d))
    const totals = CmxColumnAdapter._cmxTableTotals(model)
    return { columns, totals }
  }

  /** cmx-ui5-table 风格列 → Ignite 列 */
  static cmxColumnsToIgnite (columns) {
    return (columns || []).map((c) => CmxColumnAdapter._cmxColumnToIgnite(c))
  }

  static _descriptorToIgniteCol (d) {
    const editMode = descriptorEditMode(d)
    const isReadonly = editMode === 'readonly' || editMode === 'none'
    const col = {
      field: d.id,
      header: d.caption || d.id,
      editable: !isReadonly,
      dataType: 'string',
      _cmxKey: d.id,
      _cmxType: CmxColumnAdapter._cmxTableType(d),
    }
    if (isNumericDescriptor(d)) col.dataType = 'number'
    if (isBooleanDescriptor(d)) col.dataType = 'boolean'
    if (isDateDescriptor(d)) col.dataType = 'date'
    if (d.width) col.width = d.width
    const align = d.display?.align
    if (align === 'right' || isNumericDescriptor(d)) col.textAlign = 'right'
    else if (align === 'center') col.textAlign = 'center'
    if (d.calcFormula) col._cmxOnChange = d.calcFormula
    if (d.displayMask) col._cmxFormatter = d.displayMask
    const es = d.editSettings || {}
    if (es.options?.length) col._cmxSelectOptions = es.options
    return col
  }

  static _cmxColumnToIgnite (col) {
    const isReadonly = col.type === 'readonly' || col.editable === false
    const out = {
      field: col.key,
      header: col.label || col.key,
      editable: !isReadonly,
      dataType: col.type === 'number' ? 'number' : 'string',
      _cmxKey: col.key,
      _cmxCol: col,
    }
    if (col.width) out.width = col.width
    if (col.type === 'number' || col.align === 'right') out.textAlign = 'right'
    if (col.onChange) out._cmxOnChange = col.onChange
    if (col.formatter) out._cmxFormatter = col.formatter
    if (col.options?.length) out._cmxSelectOptions = col.options
    return out
  }
}
