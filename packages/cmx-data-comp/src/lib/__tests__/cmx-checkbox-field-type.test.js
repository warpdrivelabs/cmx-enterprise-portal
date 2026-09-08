// @vitest-environment jsdom
/**
 * checkbox 字段类型注册回归测试。
 *
 * 验证全链路：cmx-checkbox-field-type 副作用注册 'checkbox' 类型 ->
 * getFieldType('checkbox') 可取 -> getRegisteredGridEditors 含 checkbox（revo-grid.editors 能识别）->
 * editor/cellTemplate 行为正确（0/1 勾选）。
 *
 * 仅 import cmx-checkbox-field-type.js（轻量，只依赖 UI5 CheckBox/Icon），不拉 combo/ignite 重依赖。
 */
import { describe, it, expect } from 'vitest'
import '../cmx-checkbox-field-type.js'
import { getFieldType, getRegisteredGridEditors } from '../cmx-form-field-registry.js'
import { CmxColumnAdapter } from '../cmx-column-adapter.js'
import { CmxColumn } from '../cmx-column.js'

// 轻量 h()：返回 {tag, attrs, children} 便于断言（同 cmx-column-adapter.test.js）
const h = (tag, attrs, children) => ({ tag, attrs, children })

describe('checkbox 字段类型注册（grid 编辑器全链路）', () => {
  it('getFieldType("checkbox") 已注册，含 grid.editor + cellTemplate', () => {
    const def = getFieldType('checkbox')
    expect(def).not.toBeNull()
    expect(typeof def.grid.editor).toBe('function')
    expect(typeof def.grid.cellTemplate).toBe('function')
  })

  it('getRegisteredGridEditors 含 checkbox（revo-grid.editors 能识别）', () => {
    const editors = getRegisteredGridEditors()
    expect(typeof editors.checkbox).toBe('function')
  })

  it('editor：未渲染时 getValue 返回 initial；beforeAutoSave 按 0/1 判变', () => {
    const def = getFieldType('checkbox')
    const colData = { prop: 'status', model: { status: 1 } }
    let saved = null
    const ed = def.grid.editor(colData, (v) => { saved = v }, () => {})
    expect(typeof ed.getValue).toBe('function')
    expect(typeof ed.beforeAutoSave).toBe('function')
    // 未渲染（无 componentDidRender）-> getValue 返回 initial
    expect(ed.getValue()).toBe(1)
    // beforeAutoSave：val 与 initial(1) 比较
    expect(ed.beforeAutoSave(0)).toBe(true)   // 0 != 1 -> 变了
    expect(ed.beforeAutoSave(1)).toBe(false)  // 1 == 1 -> 没变
    expect(saved).toBeNull()                  // 未交互不 save
  })

  it('cellTemplate：值为 1 渲染 ui5-icon（✓），值为 0/空 渲染灰色空心框 span', () => {
    const def = getFieldType('checkbox')
    const tpl = def.grid.cellTemplate
    const on = tpl(h, { prop: 'status', model: { status: 1 } })
    expect(on.tag).toBe('ui5-icon')
    expect(on.attrs.name).toBe('accept')
    // 未勾选：不再空串，渲染灰色空心框 span（避免单元格空白）
    const off = tpl(h, { prop: 'status', model: { status: 0 } })
    expect(off.tag).toBe('span')
    expect(off.attrs.class).toBe('cmx-cb-empty')
    expect(tpl(h, { prop: 'status', model: { status: null } }).tag).toBe('span')
    // 字符串 '1' 也应识别为勾选
    expect(tpl(h, { prop: 'status', model: { status: '1' } }).tag).toBe('ui5-icon')
  })

  it('editor render：div class 不含 "-editor-slot"（避开撑满规则），背景透明', () => {
    const def = getFieldType('checkbox')
    const ed = def.grid.editor({ prop: 'status', model: { status: 0 } }, () => {}, () => {})
    const vnode = ed.render(h)
    expect(vnode.tag).toBe('div')
    expect(vnode.attrs.class).toBe('cmx-checkbox-edit')
    expect(vnode.attrs.style.background).toBe('transparent')
  })
})

describe('CmxColumnAdapter._cmxTableType - checkbox 路由不回归', () => {
  it('edit.mode=checkbox -> "checkbox"（不被 TINYINT 数字派生抢判）', () => {
    expect(CmxColumnAdapter._cmxTableType({ id: 'status', dataType: 'TINYINT', edit: { mode: 'checkbox' } })).toBe('checkbox')
    expect(CmxColumnAdapter._cmxTableType({ id: 'flag', dataType: 'BOOLEAN', edit: { mode: 'checkbox' } })).toBe('checkbox')
  })

  it('CmxColumn 经 toDescriptor -> _cmxTableType 仍为 checkbox（端到端）', () => {
    const col = new CmxColumn({ id: 'status', caption: '状态', dataType: 'TINYINT', edit: { mode: 'checkbox', trigger: 'click' } })
    const d = col.toDescriptor()
    expect(CmxColumnAdapter._cmxTableType(d)).toBe('checkbox')
  })
})
