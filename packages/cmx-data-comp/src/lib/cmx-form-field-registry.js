/**
 * cmx-form-field-registry — 字段类型统一注册表（form + grid 共用）
 *
 * 一个字段类型可同时声明两面实现，按需注册：
 *
 *   registerFieldType('rating', {
 *     description: '评分（0–N 颗星）',
 *     form: {
 *       create(field, ctx) -> HTMLElement              // 编辑器 DOM；用 ctx.commit(field, v) 提交
 *       write(editor, raw, field, ctx) -> void         // 回填值到编辑器（显示）
 *     },
 *     grid: {
 *       editor(col, save, close) -> EditorBase         // revo-grid EditorCtrCallable：返回 { element, getValue? }
 *       cellTemplate(h, props) -> VNode | string       // 只读单元格自定义渲染（无 editor 时也可用）
 *     }
 *   })
 *
 * form 端无注册时回退到 cmx-ui5-form 内置 switch；grid 端无注册时使用 revo-grid 默认编辑器。
 * 同名 type 会覆盖（注册后生效）。
 */

const REGISTRY = new Map()

export function registerFieldType (name, def) {
  if (!name || typeof name !== 'string') throw new Error('[field-type] name required')
  if (!def || (!def.form && !def.grid)) throw new Error('[field-type] def must include form and/or grid')
  REGISTRY.set(name, def)
}

export function unregisterFieldType (name) { REGISTRY.delete(name) }

export function getFieldType (name) { return REGISTRY.get(name) || null }

export function listFieldTypes () {
  return Array.from(REGISTRY.entries()).map(([name, def]) => ({
    name,
    hasFormCreate:       !!(def.form && def.form.create),
    hasFormWrite:        !!(def.form && def.form.write),
    hasGridEditor:       !!(def.grid && def.grid.editor),
    hasGridCellTemplate: !!(def.grid && def.grid.cellTemplate),
    description: def.description || '',
  }))
}

/** 取所有注册项里有 grid.editor 的，组成 revo-grid 的 editors map：{ name: EditorCtr }。 */
export function getRegisteredGridEditors () {
  const editors = {}
  for (const [name, def] of REGISTRY.entries()) {
    if (def.grid && typeof def.grid.editor === 'function') editors[name] = def.grid.editor
  }
  return editors
}

/** 取指定 type 注册的 grid.cellTemplate（无则 null）。 */
export function getRegisteredGridCellTemplate (name) {
  const def = REGISTRY.get(name)
  return (def && def.grid && def.grid.cellTemplate) || null
}
