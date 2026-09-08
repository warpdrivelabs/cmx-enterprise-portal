/**
 * cmx-field-ui — schema 驱动的字段/列定义 UI 渲染器（纯函数，输出 HTML 字符串）
 *
 * 由 cmx-field-schema.js 的属性定义 + cmx-field-adapter.js 的读值，
 * 渲染两块 UI：
 *   renderFieldTable(...)  表格内联编辑（placement=inline 的属性）
 *   renderFieldPanel(...)  property 详编面板（placement=panel 的属性，按 section 分块）
 *
 * 沿用各端现有 DOM 事件协议（保持向后兼容，不改主体事件处理）：
 *   - 表格内联控件：data-field-key="{fieldKey}" data-field-prop="{规范key}" [data-value-type]
 *   - 详编面板控件：data-field-path="{规范key}" [data-value-type]
 *   - 行/按钮动作：data-action="select-field|remove-field|move-field-up|move-field-down|open-formula|add-validation|remove-validation"
 * 各端主体在 _handleInput 里按 data-field-prop / data-field-path 调 adapter.set 即可。
 */

import { editorPropsFor, inlineFieldsFor, panelSectionsFor, placementOf } from './cmx-field-schema.js'
import { fieldId } from './cmx-field-meta.js'
import { escHtml as esc } from './cmx-page-helpers.js'


/* ── 单控件渲染 ── */
function renderControl (f, value, attrs, ctx, field, editable = true) {
  const vt = f.valueType ? ` data-value-type="${f.valueType}"` : ''
  if (!editable) return `<span class="cmx-fld-ro">${esc(value)}</span>`
  switch (f.control) {
    case 'number':
      return `<input type="number" ${attrs}${vt} value="${esc(value ?? '')}"${f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : ''}>`
    case 'checkbox': {
      // boolean-visible（visible 列）：默认可见——无键/true 均勾选，仅显式 false 才取消。
      // 其余 checkbox（boolean / boolean-int）按真值判定（0/1、true/false）。
      const checked = f.valueType === 'boolean-visible' ? (value !== false) : !!value
      return `<input type="checkbox" ${attrs}${vt} ${checked ? 'checked' : ''}>`
    }
    case 'select': {
      const opts = resolveOptions(f, ctx, field)
      return selectHtml(attrs, value, opts)
    }
    case 'select-labeled': {
      const opts = resolveOptions(f, ctx, field)
      return selectLabeledHtml(attrs, value, opts)
    }
    case 'select-text': {
      // 复合控件：下拉(select)选高频预设 + 文本框(input)手改任意值，两者同值（共用同一 data-field-path）。
      // 不触发 relayout（避免 input 每字符全量重渲导致跳顶/失焦）。联动靠 select 的内联 onchange：
      // 选中预设时直接把值写入同 div 内 input.value（纯 DOM 局部更新，不重渲染、不跳顶）；
      // 数据持久化由 change 冒泡到宿主 _handleInput 写入 field 完成。
      // input 手改的自定义值（如 currency:$）由 selectHtml 防丢值机制在下次渲染时补 option 显示。
      const opts = resolveOptions(f, ctx, field)
      const ph = f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : ''
      // onchange：this=select，this.nextElementSibling=同 div 内的 input。同步 input 显示。
      const selectAttrs = `${attrs} onchange="var i=this.nextElementSibling;if(i)i.value=this.value"`
      return `<div class="cmx-select-text">${selectHtml(selectAttrs, value, opts)}<input ${attrs}${vt} value="${esc(value ?? '')}"${ph}></div>`
    }
    case 'formula':
      // FLC 端有公式编辑器（open-formula 动作）；DCT/DOC 端降级为纯文本输入（无维度上下文，编辑器打不开）。
      if (ctx.end === 'FLC') {
        return `<div class="fx-cell"><input ${attrs}${vt} value="${esc(value ?? '')}" placeholder="公式"><button class="icon-btn" data-action="open-formula" data-field-key="${esc(ctx._curKey)}" title="公式编辑器"><ui5-icon name="fx"></ui5-icon></button></div>`
      }
      return `<input ${attrs}${vt} value="${esc(value ?? '')}" placeholder="公式，如 amount*price">`
    case 'validations':
      return renderValidations(field, ctx)
    case 'enum-values':
      return renderEnumValues(field)
    case 'text':
    default:
      return `<input ${attrs}${vt} value="${esc(value ?? '')}"${f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : ''}>`
  }
}

/** 选项 provider 解析 + 防丢值（当前值不在选项中则补入）。返回 [{value,label}]。 */
function resolveOptions (f, ctx, field) {
  let raw = typeof f.options === 'function' ? f.options(ctx, field) : (f.options || [])
  // 归一为 {value,label}
  let opts = raw.map((o) => (o && typeof o === 'object') ? { value: o.value, label: o.label ?? o.value } : { value: o, label: String(o) || '-' })
  return opts
}

function selectHtml (attrs, value, options) {
  const v = String(value == null ? '' : value)
  let has = options.some((o) => String(o.value) === v)
  const extra = (!has && v) ? `<option value="${esc(v)}" selected>${esc(v)}</option>` : ''
  return `<select ${attrs}>${options.map((o) => `<option value="${esc(o.value)}" ${String(o.value) === v ? 'selected' : ''}>${esc(o.label) || '-'}</option>`).join('')}${extra}</select>`
}

function selectLabeledHtml (attrs, value, options) {
  return selectHtml(attrs, value, options)
}

function renderValidations (field, ctx) {
  const list = Array.isArray(field.validations) ? field.validations : []
  const rows = list.map((v, i) => `<div class="vrow">
      <input data-field-path="validations.${i}.expr" value="${esc(v.expr || '')}" placeholder="校验表达式，如 quantity > 0">
      <input data-field-path="validations.${i}.message" value="${esc(v.message || '')}" placeholder="失败提示">
      <ui5-button design="Transparent" icon="delete" data-action="remove-validation" data-index="${i}"></ui5-button>
    </div>`).join('')
  return `<div class="vlist">${rows}<ui5-button design="Transparent" icon="add" data-action="add-validation">新增校验</ui5-button></div>`
}

/** 枚举值（value+label）行表格渲染。兼容旧 string[] / 逗号串 → 归一为 [{value,label}]。
 *  value 唯一性：重复 value 行加 enum-dup class（红框提示，非阻塞）。 */
function renderEnumValues (field) {
  const raw = field.enumValues
  let list = []
  if (Array.isArray(raw)) list = raw
  else if (typeof raw === 'string' && raw.trim()) list = raw.split(',').map((s) => s.trim()).filter(Boolean)
  const items = list.map((v) => (v && typeof v === 'object') ? { value: v.value ?? '', label: v.label ?? '' } : { value: String(v), label: '' })

  // value 唯一性检测（空 value 不参与）
  const counts = new Map()
  for (const it of items) { if (it.value !== '') counts.set(it.value, (counts.get(it.value) || 0) + 1) }

  const rows = items.map((it, i) => {
    const dup = counts.get(it.value) > 1
    return `<div class="enum-row${dup ? ' enum-dup' : ''}">
      <input data-field-path="enumValues.${i}.value" value="${esc(it.value)}" placeholder="value">
      <input data-field-path="enumValues.${i}.label" value="${esc(it.label)}" placeholder="label(可选)">
      <ui5-button design="Transparent" icon="delete" data-action="remove-enum" data-index="${i}"></ui5-button>
    </div>`
  }).join('')
  return `<div class="enum-list">${rows}<ui5-button design="Transparent" icon="add" data-action="add-enum">添加枚举项</ui5-button></div>`
}

/**
 * 渲染字段表格内联编辑。
 * @param {object[]} fields  已取好的字段数组（各端宿主提供）
 * @param {object} opts {
 *   end, adapter, ctx, editable(默认true), selectedKey,
 *   keyOf(field, index)=>string  字段唯一标识（DCT=index, CTX=code）
 *   actions: { detail?, remove?, move? }  哪些操作列按钮显示（默认全开）
 * }
 */
export function renderFieldTable (fields, opts) {
  const { end, adapter, ctx = {}, editable = true, selectedKey, keyOf, actions = {} } = opts
  ctx.end = end // 注入端标识，供 visibleWhen 按端判断
  const cols = inlineFieldsFor(end)
  const showDetail = actions.detail !== false
  const showRemove = actions.remove !== false
  const showMove = actions.move === true // 默认不显示移动（CTX 才开）

  const headCells = ['<th style="width:36px">#</th>', ...cols.map((c) => `<th>${esc(c.label)}</th>`)]
  if (showDetail || showRemove || showMove) headCells.push('<th style="width:120px"></th>')

  const body = fields.map((field, i) => {
    const fkey = keyOf ? keyOf(field, i) : String(i)
    const sel = selectedKey != null && String(fkey) === String(selectedKey) ? ' sel' : ''
    const tds = [`<td class="idx">${i + 1}</td>`]
    for (const c of cols) {
      const vis = c.visibleWhen ? c.visibleWhen(field, ctx) : true
      if (!vis) { tds.push('<td></td>'); continue }
      const en = editable && (c.enableWhen ? c.enableWhen(field, ctx) : true)
      const attrs = `data-field-key="${esc(fkey)}" data-field-prop="${esc(c.key)}"`
      ctx._curKey = fkey
      const value = adapter.get(field, c.key)
      tds.push(`<td>${renderControl(c, value, attrs, ctx, field, en)}</td>`)
    }
    if (showDetail || showRemove || showMove) {
      const btns = []
      if (showDetail) btns.push(`<button class="icon-btn" data-action="select-field" data-field-key="${esc(fkey)}" title="属性"><ui5-icon name="detail-view"></ui5-icon></button>`)
      if (showMove) {
        btns.push(`<button class="icon-btn" data-action="move-field-up" data-field-key="${esc(fkey)}" ${i === 0 ? 'disabled' : ''} title="上移"><ui5-icon name="slim-arrow-up"></ui5-icon></button>`)
        btns.push(`<button class="icon-btn" data-action="move-field-down" data-field-key="${esc(fkey)}" ${i === fields.length - 1 ? 'disabled' : ''} title="下移"><ui5-icon name="slim-arrow-down"></ui5-icon></button>`)
      }
      if (showRemove) btns.push(`<button class="icon-btn danger" data-action="remove-field" data-field-key="${esc(fkey)}" title="删除"><ui5-icon name="delete"></ui5-icon></button>`)
      tds.push(`<td>${btns.join('')}</td>`)
    }
    return `<tr class="cmx-field-row${sel}" data-action="select-field" data-field-key="${esc(fkey)}">${tds.join('')}</tr>`
  }).join('')

  return `<table class="cmx-field-table"><thead><tr>${headCells.join('')}</tr></thead><tbody>${body}</tbody></table>`
}

/**
 * 渲染字段详编面板（按 section 分块）。
 * @param {object} field  当前选中字段
 * @param {object} opts { end, adapter, ctx, keyOf, exclude }
 *   exclude：可选（数组/Set），按 schema key 排除面板项——宿主端把某属性的事实源
 *   收口到别处（如 DCT/DOC 的 unique 收口到表级 uniqueKeys）时，隐藏该控件的渲染入口。
 */
export function renderFieldPanel (field, opts) {
  if (!field) return ''
  const { end, adapter, ctx = {}, keyOf, exclude } = opts
  const excluded = exclude ? new Set(exclude) : null
  ctx.end = end // 注入端标识，供 visibleWhen 按端判断
  // 公式按钮等需要字段标识：优先 keyOf，回退 code/id
  ctx._curKey = keyOf ? keyOf(field) : (field.code ?? fieldId(field) ?? '')
  const sections = panelSectionsFor(end)
  return sections.map((s) => {
    const sectionFields = s.id === 'editorProps'
      ? editorPropsFor(adapter.get(field, 'edit.mode') || '', end)
      : s.fields
    if (s.id === 'editorProps' && !sectionFields.length) return ''
    const rows = sectionFields.map((f) => {
      if (excluded && excluded.has(f.key)) return '' // 宿主端按 key 排除
      if (placementOf(f, end) === 'inline') return '' // 仅渲染面板项
      const vis = f.visibleWhen ? f.visibleWhen(field, ctx) : true
      if (!vis) return ''
      const value = adapter.get(field, f.key)
      const attrs = `data-field-path="${esc(f.key)}"`
      if (f.control === 'validations') return `<div class="insp-full">${renderValidations(field, ctx)}</div>`
      if (f.control === 'enum-values') return `<div class="insp-full">${renderEnumValues(field)}</div>`
      // tips（可选）：label 后跟问号图标，点击弹出 Popover 显示配置说明（data-action=show-field-tips 由宿主接住）
      const tipIcon = f.tips ? `<button type="button" class="cmx-field-tip" data-action="show-field-tips" data-field-tips="${esc(f.tips)}" title="配置说明"><ui5-icon name="hint"></ui5-icon></button>` : ''
      return `<label>${esc(f.label)}${tipIcon}</label>${renderControl(f, value, attrs, ctx, field, true)}`
    }).join('')
    if (!rows.trim()) return ''
    return `<section class="insp-section"><h4 class="sub-h">${esc(s.title)}</h4><div class="insp-grid">${rows}</div></section>`
  }).join('')
}
