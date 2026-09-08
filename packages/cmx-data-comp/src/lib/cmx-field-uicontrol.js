/**
 * cmx-field-uicontrol — 录入控件（edit.mode）统一值域
 *
 * 本模块确立**唯一规范值域** EDIT_MODES，供数据字典、业务单据、
 * 弹性组合与 HTML Designer 的 CmxColumnModel 列设置共用。
 */

/** 规范录入控件值域（= CmxColumn.edit.mode 全集，P0 已扩） */
export const EDIT_MODES = Object.freeze([
  'cmx-text-input',      // 输入
  'cmx-textarea-input',  // 多行文本
  'cmx-richtext-input',  // 富文本
  'cmx-number-input',    // 数字
  'cmx-date-input',      // 日期
  'cmx-datetime-input',  // 日期时间
  'checkbox',     // 复选框 / 布尔
  'select',       // 静态枚举下拉
  'ref',          // 外键引用选择
  'combo',        // 组合框（远端搜索）
  'ignite-combo', // Ignite 组合框
  'cmx-dict-select', // 数据字典选择
  'image',        // 图片
  'video',        // 视频
  'readonly',     // 只读
  'none',         // 不可编辑
])

/** 规范值 → 中文标签（用于各端下拉 UI 统一显示） */
export const EDIT_MODE_LABELS = Object.freeze({
  'cmx-text-input': '输入',
  'cmx-textarea-input': '多行文本',
  'cmx-richtext-input': '富文本',
  'cmx-number-input': '数字',
  'cmx-date-input': '日期',
  'cmx-datetime-input': '日期时间',
  checkbox: '复选框', select: '枚举下拉',
  ref: '外键引用', combo: '组合框', 'ignite-combo': 'Ignite组合框', 'cmx-dict-select': '字典选择',
  image: '图片', video: '视频', readonly: '只读', none: '不可编辑',
})

export const EDIT_MODE_RUNTIME_KINDS = Object.freeze({
  'cmx-text-input': 'input',
  'cmx-textarea-input': 'textarea',
  'cmx-richtext-input': 'rich-text',
  'cmx-number-input': 'number',
  'cmx-date-input': 'date',
  'cmx-datetime-input': 'datetime',
  'cmx-dict-select': 'dict-select',
})

/**
 * 把任意来源的录入控件值收敛为规范 edit.mode。
 * 接受：规范值（原样返回）、空/未知（返回 fallback）。
 * @param {string} v
 * @param {string} [fallback='cmx-text-input']
 * @returns {string}
 */
export function toEditMode (v, fallback = 'cmx-text-input') {
  if (!v) return fallback
  if (EDIT_MODES.includes(v)) return v
  return fallback
}

/** 把下拉存储值收敛为运行时语义值，供 adapter 选择实际编辑器。 */
export function editModeKind (v, fallback = 'cmx-text-input') {
  const mode = toEditMode(v, fallback)
  return EDIT_MODE_RUNTIME_KINDS[mode] || mode
}

/** 录入控件下拉显示标签：中文(英文值)，如 "字典选择(cmx-dict-select)"。 */
export function editModeLabel (v) {
  const mode = toEditMode(v, v)
  const cn = EDIT_MODE_LABELS[mode]
  return cn ? `${cn}(${mode})` : mode
}

/** uiControl 在 DCT 字段编辑器下拉里的可选项（规范值 + 中文(英文) 标签），供 definition-manager 使用。 */
export function uiControlOptions () {
  return EDIT_MODES.map((v) => ({ value: v, label: editModeLabel(v) }))
}
