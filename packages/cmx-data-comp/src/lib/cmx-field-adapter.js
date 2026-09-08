/**
 * cmx-field-adapter — 各端字段对象 ↔ 统一 schema 规范键 的读写桥接
 *
 * 三端存储键统一为 id / name / caption / dimType / dataType(物理) / edit.mode /
 * refDict / refField / displayField / display.x / source.x / defaultFrom.x / column.x 等）。
 * 本适配器只在 UI 读写时把 schema 规范 key（见 cmx-field-schema.js）映射到存储路径，
 * 并封装少数特殊键行为（enumValues 数组、嵌套路径删空回收、dataType/refDict 联动、boolean-visible）。
 *
 * 适配器接口：
 *   end                              端标识 'DCT'|'DOC'|'FLC'
 *   get(field, key)                  读规范属性值（用于渲染控件当前值）
 *   set(field, key, rawValue, vt)    写规范属性值；返回 { changed, relayout } —— relayout=true 表示需重渲染（联动）
 *   fieldKey(field)                  该字段在表格里的唯一标识（DCT=index 由外部给；CTX=code）
 *
 * 注：list/add/remove/move 这类"集合操作"涉及各端宿主结构（fieldGroups / fsc.fieldsOwner），
 *     仍由各端主体负责，本适配器只管"单字段属性读写"。
 */

import { toEditMode } from './cmx-field-uicontrol.js'
import { fieldCaption, fieldDisplayName, fieldId, setFieldCaption, setFieldId, setFieldName } from './cmx-field-meta.js'

/* ── 通用工具 ── */
function getPath (obj, path) {
  const segs = path.split('.')
  let cur = obj
  for (const s of segs) { if (cur == null) return undefined; cur = cur[s] }
  return cur
}
function setPath (obj, path, value) {
  const segs = path.split('.')
  let cur = obj
  for (let i = 0; i < segs.length - 1; i++) {
    const s = segs[i]
    if (cur[s] == null || typeof cur[s] !== 'object') cur[s] = {}
    cur = cur[s]
  }
  cur[segs[segs.length - 1]] = value
}
function delPath (obj, path) {
  const segs = path.split('.')
  let cur = obj
  const stack = []
  for (let i = 0; i < segs.length - 1; i++) {
    const s = segs[i]
    if (cur[s] == null) return
    stack.push([cur, s]); cur = cur[s]
  }
  delete cur[segs[segs.length - 1]]
  // 回收空对象
  for (let i = stack.length - 1; i >= 0; i--) {
    const [parent, key] = stack[i]
    if (parent[key] && typeof parent[key] === 'object' && Object.keys(parent[key]).length === 0) delete parent[key]
    else break
  }
}
function coerce (raw, vt) {
  if (vt === 'number') { if (raw === '' || raw == null) return undefined; const n = Number(raw); return Number.isNaN(n) ? undefined : n }
  if (vt === 'boolean') return !!raw && raw !== 'false'
  // boolean-int：复选框 → 整数 1(是)/0(否)，存储用数字而非布尔（主键 isPrimaryKey 等）
  if (vt === 'boolean-int') return (!!raw && raw !== 'false' && raw !== '0' && raw !== 0) ? 1 : 0
  if (vt === 'list') return String(raw || '').split(',').map((s) => s.trim()).filter(Boolean)
  if (vt === 'boolean-visible') return raw ? '' : false // 勾选=删键(默认可见)，取消=显式 false
  return raw
}

/* ════════════════════════ DCT / DOC 适配器 ════════════════════════ */

/** schema key 已与存储键完全一致（id/name/caption/dataType/dimType/edit.mode/refDict…），
 *  无需键名映射；仅封装少数值变换：录入控件规范化、enumValues 数组、数字键、dataType/refDict 联动。 */
const DCT_NUMERIC = new Set(['fieldLength', 'intDigits', 'decimalDigits'])

export function makeDctAdapter ({ typeCaps } = {}) {
  return {
    end: 'DCT',
    get (field, key) {
      if (!field) return undefined
      if (key === 'id') return fieldId(field)
      if (key === 'name') return fieldDisplayName(field)
      if (key === 'caption') return fieldCaption(field)
      // 录入控件：edit.mode 收敛为规范值
      if (key === 'edit.mode') return toEditMode(getPath(field, 'edit.mode'), '')
      // enumValues 由 enum-values 控件直接读 field.enumValues（不经 adapter.get），故无 get 分支。
      if (key === 'dependsOn') return Array.isArray(field.dependsOn) ? field.dependsOn.join(', ') : (field.dependsOn || '')
      return getPath(field, key)
    },
    set (field, key, rawValue, vt) {
      if (!field) return { changed: false }
      if (key === 'id') { setFieldId(field, rawValue); return { changed: true, relayout: true } }
      if (key === 'name') { setFieldName(field, rawValue); return { changed: true } }
      if (key === 'caption') { setFieldCaption(field, rawValue); return { changed: true } }
      // 录入控件：写 edit.mode（规范值）
      if (key === 'edit.mode') {
        const v = toEditMode(rawValue, '')
        if (!v) delPath(field, 'edit.mode'); else setPath(field, 'edit.mode', v)
        return { changed: true, relayout: true }
      }
      // 嵌套路径（edit.* / display.* 等）：空/false 删，否则写
      if (key.includes('.')) {
        const v = coerce(rawValue, vt)
        if (v == null || v === '' || v === false) delPath(field, key)
        else setPath(field, key, v)
        // display.mode 变更影响同 section 其他属性（小数位/千分位等）的 visibleWhen 联动，需重渲染面板。
        // display.format 不触发 relayout：避免 input 每输入一个字符就全量重渲染面板导致跳顶/失焦；
        // select 与 input 的同步交给下次自然重渲染（如切换字段/改 display.mode），数据始终正确。
        return { changed: true, relayout: key === 'display.mode' }
      }
      // enumValues 由 enum-values 控件走点路径（enumValues.0.value）写回，增删走宿主 action，不经 adapter.set。
      // dependsOn：逗号串 ↔ 数组。必须存数组，否则 FLC 引擎消费 .some/.includes 会崩或语义错。
      if (key === 'dependsOn') {
        const arr = coerce(rawValue, 'list')
        if (arr.length) field.dependsOn = arr; else delete field.dependsOn
        return { changed: true }
      }
      // boolean-visible（visible 列）：勾选(true)=可见=删键（默认可见）；不勾(false)=存 false 隐藏。
      if (vt === 'boolean-visible') {
        if (coerce(rawValue, 'boolean')) delete field[key]
        else field[key] = false
        return { changed: true }
      }
      if (DCT_NUMERIC.has(key)) {
        const v = coerce(rawValue, 'number')
        if (v === undefined) delete field[key]; else field[key] = v
        return { changed: true }
      }
      if (vt === 'boolean') { field[key] = coerce(rawValue, 'boolean'); return { changed: true } }
      // boolean-int：主键等，存 1/0（显式写 0，不做空删，保证"非主键"也落库为 0）
      if (vt === 'boolean-int') { field[key] = coerce(rawValue, 'boolean-int'); return { changed: true } }
      // dataType 联动：清掉不适用的长度三件套，要求重渲染
      if (key === 'dataType') {
        field.dataType = rawValue
        if (typeCaps) {
          const caps = typeCaps(field)
          if (!caps.len) delete field.fieldLength
          if (!caps.int) delete field.intDigits
          if (!caps.dec) delete field.decimalDigits
        }
        return { changed: true, relayout: true }
      }
      // refDict 联动：清依赖字段，重渲染
      if (key === 'refDict') {
        if (rawValue === '' || rawValue == null) delete field.refDict; else field.refDict = rawValue
        delete field.refField; delete field.displayField
        return { changed: true, relayout: true }
      }
      // dimType 联动：CTX/DOC/DCT 字段面板里 reference 区显隐依赖该值。
      if (key === 'dimType') {
        if (rawValue === '' || rawValue == null) {
          delete field.dimType
          delete field.refDict
          delete field.refField
          delete field.displayField
        } else {
          field.dimType = rawValue
        }
        return { changed: true, relayout: true }
      }
      // 普通字符串：空删
      if (rawValue === '' || rawValue == null) delete field[key]; else field[key] = rawValue
      return { changed: true }
    },
  }
}

/* ════════════════════════ CTX（弹性组合）适配器 ════════════════════════ */

export function makeFlcAdapter () {
  return {
    end: 'FLC',
    // schema key 已与存储路径完全一致（id/name/caption/dataType/dimType/edit.*/display.*/
    // source.*/defaultFrom.*/column.*/refDict/refField/displayField…），无需键名映射，按路径直读写。
    get (field, key) {
      if (!field) return undefined
      if (key === 'id') return fieldId(field)
      if (key === 'name') return fieldDisplayName(field)
      if (key === 'caption') return fieldCaption(field)
      if (key === 'dependsOn') return Array.isArray(field.dependsOn) ? field.dependsOn.join(', ') : (field.dependsOn || '')
      return getPath(field, key)
    },
    set (field, key, rawValue, vt) {
      if (!field) return { changed: false }
      if (key === 'id') { setFieldId(field, rawValue); return { changed: true, relayout: true } }
      if (key === 'name') { setFieldName(field, rawValue); return { changed: true } }
      if (key === 'caption') { setFieldCaption(field, rawValue); return { changed: true } }
      if (key === 'dependsOn') {
        const arr = coerce(rawValue, 'list')
        if (arr.length) field.dependsOn = arr; else delete field.dependsOn
        return { changed: true }
      }
      const v = coerce(rawValue, vt)
      // 叶子空值删除（含 boolean-visible 的 '' 删键语义）
      if (v == null || v === '' || (vt === 'boolean' && v === false)) {
        delPath(field, key)
      } else {
        setPath(field, key, v)
      }
      // edit.mode 切换要重渲染 editorProps section；display.mode 切换要重渲染 display section 的 visibleWhen 联动。
      // display.format 不触发 relayout：避免 input 每输入一个字符就全量重渲染面板导致跳顶/失焦；
      // select 与 input 的同步交给下次自然重渲染（如切换字段/改 display.mode），数据始终正确。
      return { changed: true, relayout: key === 'edit.mode' || key === 'display.mode' }
    },
  }
}
