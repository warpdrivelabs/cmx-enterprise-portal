/**
 * cmx-builtin-field-types — 内置字段类型外挂示例（按需 import 启用）。
 *
 *   import 'cmx-data-comp/lib/cmx-builtin-field-types.js'   // 注册全部内置外挂
 *
 * 现已内置：
 *   color — 取色器；form 端用原生 <input type="color">，grid 端同款编辑器 + 色块预览 cellTemplate。
 *   combo — 通用组合框（list/tree/grid 三模式 + 远端 pageService 异步搜索），form + grid 双端。
 *   ignite-combo — Ignite igc-combo 静态选项下拉，form + grid 双端。
 *   dict-select — 数据字典选择（分级/分类/分组 + MRU + help 三布局），form + grid 双端。
 *   checkbox - 复选框/布尔（TINYINT 0/1 勾选）；仅 grid 端，form 端用 cmx-ui5-form 内置。
 *
 * 业务方可继续 `registerFieldType()` 增加更多（评分、滑块、标签输入、树选等）。
 */
import { registerFieldType } from './cmx-form-field-registry.js'
/* combo field-type 依赖 <cmx-combo-box>，import 副作用注册 customElement。 */
import '../components/cmx-combo-box.js'
/* ignite-combo field-type 依赖 <cmx-ignite-combo>，import 副作用注册 customElement。 */
import '../components/ignite/cmx-ignite-combo.js'
/* dict-select field-type（form + grid）：副作用注册 'dict-select' 类型与 <cmx-dict-select>。 */
import './cmx-dict-field-type.js'
/* 基础输入列编辑器：text / number / date / datetime（form + grid 同款组件）。副作用注册 customElement。 */
import '../components/cmx-text-input.js'
import '../components/cmx-number-input.js'
import '../components/cmx-date-input.js'
import '../components/cmx-datetime-input.js'
/* select / date grid 编辑器用 UI5 组件（与 cmx-ui5-form 同款，主题感知）：副作用注册 customElement。 */
import '@ui5/webcomponents/dist/Select.js'
import '@ui5/webcomponents/dist/Option.js'
import '@ui5/webcomponents/dist/DatePicker.js'
/* checkbox 字段类型（grid 端）：副作用注册 'checkbox' 类型与 <ui5-checkbox>/<ui5-icon>。 */
import './cmx-checkbox-field-type.js'

const COLOR_RE = /^#[0-9a-f]{6}$/i
const safeColor = (v) => (typeof v === 'string' && COLOR_RE.test(v)) ? v : '#000000'

registerFieldType('color', {
  description: '取色器（form + grid 编辑 + 色块预览）',
  form: {
    create (field, ctx) {
      const el = document.createElement('input')
      el.type = 'color'
      el.style.cssText = 'width:100%;height:1.75rem;border:1px solid var(--sapField_BorderColor,#999);border-radius:0.125rem;padding:0;background:transparent;cursor:pointer;'
      if (field.readonly) el.disabled = true
      el.addEventListener('input',  () => ctx.commit(field, el.value))
      el.addEventListener('change', () => ctx.commit(field, el.value))
      return el
    },
    write (editor, raw) {
      const v = safeColor(raw)
      if (editor.value !== v) editor.value = v
    },
  },
  grid: {
    /** revo-grid v4 EditorBase：返回 { render(h, addData)→VNode, componentDidRender?, ... }。 */
    editor (colData, save, close) {
      const column = colData?.column || colData
      const prop = colData?.prop ?? column?.prop
      const raw = colData?.model ? colData.model[prop] : ''
      const initial = safeColor(raw)
      const editor = {
        editInput: null,
        render (h) {
          return h('input', {
            type: 'color',
            style: 'width:100%;height:100%;border:0;padding:0;background:transparent;cursor:pointer;',
            value: initial,
            ref: (el) => { editor.editInput = el },
            onChange: () => {
              const v = editor.editInput?.value || '#000000'
              save(v)
              close()
            },
          })
        },
      }
      return editor
    },
    cellTemplate (h, props) {
      const v = props.model && props.model[props.prop]
      const color = (typeof v === 'string' && COLOR_RE.test(v)) ? v : null
      if (!color) return ''
      return h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '6px' } }, [
        h('span', { style: { display: 'inline-block', width: '14px', height: '14px', border: '1px solid #999', background: color } }),
        h('span', {}, color.toUpperCase()),
      ])
    },
  },
})

/**
 * combo —— 通用组合框（list / tree / grid 三种弹出形式，远端数据由 pageService 提供）。
 *
 * field.editSettings 关键约定：
 *   source       string | { service, id?, keyField?, labelField?, queryParam?, responsePath?, extraParams? }
 *                  - string：从 form 注入的 dsProvider 解析（与现有 'ref' 字段一致）
 *                  - 对象 + service：把 pageService 包装为 DataSource，**首版主路径**
 *   dropdown     'list' | 'tree' | 'grid'，缺省按 parentField/dropdownColumns 推断
 *   valueField   写回行的字段，缺省 'id'
 *   displayTemplate '${code} - ${name}' 模板字符串
 *   parentField  仅 tree 模式
 *   dropdownColumns  仅 grid 模式（CmxColumnModel）
 *   options      静态选项，存在时不走 source；与 type='select' 等价
 *   dropdownWidth / dropdownMaxHeight / emptyText / placeholder
 */
registerFieldType('combo', {
  description: '组合框（list/tree/grid + pageService 远端搜索）',
  form: {
    create (field, ctx) {
      const el = document.createElement('cmx-combo-box')
      el.style.cssText = 'display:block;width:100%;'
      /* 把 form 的 dsProvider 桥过去：编译器路径用 string source 时复用 cmx-master-slave 注册的源 */
      if (typeof ctx.resolveDataSource === 'function') {
        const src = field.editSettings?.source ?? field.source
        if (typeof src === 'string') {
          const ds = ctx.resolveDataSource(src)
          if (ds) el.setDataSource(ds)
        }
      }
      /* setField 内部会处理 pageService source / options / parentField 等所有约定 */
      el.setField(field)
      el.addEventListener('cmx-combo-value-change', (e) => {
        const id = /** @type {CustomEvent<{id:string|null}>} */ (e).detail?.id
        ctx.commit(field, id ?? null)
      })
      if (field.readonly) el.setReadonly(true)
      return el
    },
    write (editor, raw) {
      if (typeof editor.setValue === 'function') editor.setValue(raw ?? null, { silent: true })
    },
  },
  grid: {
    /**
     * revo-grid v4 编辑器：返回 { render(h, additionalData) → VNode, componentDidRender? } 对象。
     * 第一个参数 `colData` 是 ColumnDataSchemaModel：`{ prop, model, column, rowIndex, colIndex, ... }`，
     * 真正的列定义在 `colData.column`（_cmxCol、editSettings 等都挂在那里）。
     *
     * 渲染策略：用 stencil `h` 渲染 placeholder `<div>`，componentDidRender 再把 `<cmx-combo-box>` 挂入。
     * 这样可以避开 stencil 对 web component 的 VNode 解析限制（cmx-combo-box 内部有自己的 shadow 渲染）。
     */
    editor (colData, save, close) {
      const column = colData?.column || colData
      const cmxCol = column?._cmxCol
      const field = cmxCol ? {
        key: cmxCol.id,
        type: 'combo',
        editSettings: cmxCol.editSettings || {},
        source: cmxCol.editSettings?.source,
        valueField: cmxCol.editSettings?.valueField,
        displayTemplate: cmxCol.editSettings?.displayTemplate,
        placeholder: cmxCol.editSettings?.placeholder,
      } : {
        key: column?.prop || colData?.prop,
        type: 'combo',
        editSettings: column?.editSettings || {},
        source: column?.source,
        valueField: column?.valueField,
        displayTemplate: column?.displayTemplate,
      }
      const initial = colData?.model && (colData?.prop != null) ? colData.model[colData.prop] : null

      /** @type {{ render: Function, componentDidRender?: Function, disconnectedCallback?: Function, getValue?: Function, beforeAutoSave?: Function, _comboEl: HTMLElement|null }} */
      const editor = {
        _comboEl: null,
        render (h /* , _additionalData */) {
          /* placeholder：componentDidRender 时把 cmx-combo-box 替换进去；
             用 flex + 100% 高度，让 combo-box 与单元格等高。 */
          return h('div', {
            class: 'cmx-combo-editor-slot',
            style: { width: '100%', height: '100%', display: 'flex', boxSizing: 'border-box' },
          })
        },
        /* revo-grid 在 disconnect 时若 saveOnClose 会调 getValue() → onSave(val, true)。
           若不提供 getValue，val 就是 undefined → 用户点击宿主 grid 空区域触发 disconnect 时，
           当前单元格被写入 undefined，视觉上就是"数据消失"。返回当前 combo 选中值即可保住数据。 */
        getValue () {
          if (editor._comboEl && typeof editor._comboEl.getValue === 'function') {
            return editor._comboEl.getValue()
          }
          return initial
        },
        /* 如果当前 combo 值没变（用户只是把焦点丢出去），告诉 revo-grid 不要写回。
           只有用户在下拉里"选中了不同的项"时 cmx-combo-value-change 才派发，
           那一路走 save() → onSave，已经写过了；这里防御重复写或写无效值。 */
        beforeAutoSave (val) {
          if (val === initial) return false  // 跳过保存
          return true
        },
        componentDidRender () {
          /* 此回调里 this.element 已指向 revogr-edit 内的根元素；
             第一次调用时把 cmx-combo-box 创建并 appendChild 到 slot 里。 */
          /** @type {HTMLElement|null} */
          const root = (/** @type {any} */ (this)).element
          if (!root) return
          const slot = root.querySelector?.('.cmx-combo-editor-slot') || root
          if (editor._comboEl && editor._comboEl.isConnected) return
          const el = document.createElement('cmx-combo-box')
          /* data-cmx-fill-host：让 combo-box 的 :host 用 flex+100% 占满父槽位（单元格高度） */
          el.setAttribute('data-cmx-fill-host', '')
          el.style.cssText = 'width:100%;height:100%;'
          el.setField(field)
          if (initial != null) el.setValue(initial, { silent: true })
          el.addEventListener('cmx-combo-value-change', (e) => {
            const id = /** @type {CustomEvent<{id:string|null}>} */ (e).detail?.id
            save(id ?? null)
          })
          el.addEventListener('cmx-combo-close', () => close())
          slot.appendChild(el)
          editor._comboEl = el
          /* 双击后立即打开下拉 + 聚焦输入框（用户感知"双击=打开"） */
          requestAnimationFrame(() => {
            try { el.focus?.() } catch (_) {}
            try { el.open?.() } catch (_) {}
          })
        },
        disconnectedCallback () {
          editor._comboEl = null
        },
      }
      return editor
    },
    cellTemplate (h, props) {
      /* 列只读显示：优先取 `${prop}_label` 字段（业务侧可在 onChange 中冗余写入），否则取 prop 原值 */
      const labelKey = `${props.prop}_label`
      const v = props.model?.[labelKey] ?? props.model?.[props.prop] ?? ''
      return v == null ? '' : String(v)
    },
  },
})

/**
 * ignite-combo —— Ignite igc-combo 封装的静态选项下拉。
 *
 * 取值来源（任一）：
 *   field.options            [{value,label}]（form 直接用）
 *   field.editSettings.options 同上（grid/CmxColumn 路径）
 * 可选 editSettings.valueKey / displayKey 调整选项字段名（默认 value / label）。
 *
 * 与 combo 的区别：ignite-combo 主打"本地静态选项 + Ignite 视觉"，不接 pageService 远端搜索。
 */
function igniteComboOptionLabel (field, raw) {
  const es = field?.editSettings || {}
  const valueKey = es.valueField || es.valueKey || 'value'
  const displayKey = es.displayKey || 'label'
  const opts = field?.options || es.options || []
  const hit = opts.find((o) => String(o?.[valueKey]) === String(raw))
  return hit ? (hit[displayKey] ?? hit[valueKey] ?? raw) : raw
}

registerFieldType('ignite-combo', {
  description: 'Ignite 组合框（igc-combo 静态选项下拉，form + grid）',
  form: {
    create (field, ctx) {
      const el = document.createElement('cmx-ignite-combo')
      el.style.cssText = 'display:block;width:100%;'
      el.setField(field)
      /* form 已渲染 ui5-label，进入编辑器模式抑制 igc-combo 自带 label */
      if (typeof el.setEditorMode === 'function') el.setEditorMode(true)
      el.addEventListener('cmx-value-changed', (e) => {
        const v = /** @type {CustomEvent<{value:any}>} */ (e).detail?.value
        ctx.commit(field, v ?? null)
      })
      if (field.readonly) el.setReadonly(true)
      return el
    },
    write (editor, raw) {
      if (typeof editor.setValue === 'function') editor.setValue(raw ?? null, { silent: true })
    },
  },
  grid: {
    /**
     * revo-grid v4 编辑器：placeholder <div> + componentDidRender 挂入 <cmx-ignite-combo>。
     * 与 combo field-type 同构（避开 stencil 对 web component VNode 的解析限制）。
     */
    editor (colData, save, close) {
      const column = colData?.column || colData
      const cmxCol = column?._cmxCol
      const field = cmxCol ? {
        key: cmxCol.id,
        type: 'ignite-combo',
        label: cmxCol.caption,
        editSettings: cmxCol.editSettings || {},
        options: cmxCol.editSettings?.options,
      } : {
        key: column?.prop || colData?.prop,
        type: 'ignite-combo',
        editSettings: column?.editSettings || {},
        options: column?.editSettings?.options || column?.options,
      }
      const initial = colData?.model && (colData?.prop != null) ? colData.model[colData.prop] : null

      const editor = {
        _comboEl: null,
        render (h) {
          return h('div', {
            class: 'cmx-ignite-combo-editor-slot',
            style: { width: '100%', height: '100%', display: 'flex', boxSizing: 'border-box' },
          })
        },
        getValue () {
          if (editor._comboEl && typeof editor._comboEl.getValue === 'function') {
            return editor._comboEl.getValue()
          }
          return initial
        },
        beforeAutoSave (val) {
          if (val === initial) return false
          return true
        },
        componentDidRender () {
          const root = (/** @type {any} */ (this)).element
          if (!root) return
          const slot = root.querySelector?.('.cmx-ignite-combo-editor-slot') || root
          if (editor._comboEl && editor._comboEl.isConnected) return
          const el = document.createElement('cmx-ignite-combo')
          el.setAttribute('data-cmx-fill-host', '')
          el.style.cssText = 'width:100%;height:100%;'
          el.setField(field)
          /* grid 单元格无 label，进入编辑器模式抑制 igc-combo 自带 label 并撑满单元格高度 */
          if (typeof el.setEditorMode === 'function') el.setEditorMode(true)
          if (initial != null) el.setValue(initial, { silent: true })
          el.addEventListener('cmx-value-changed', (e) => {
            const v = /** @type {CustomEvent<{value:any}>} */ (e).detail?.value
            save(v ?? null)
            /* 选中后立即结束编辑：与 combo 编辑器一致，让 RevoGrid 即时落库并收起编辑器。
               否则编辑器悬空、靠失焦兜底——最后一行失焦时 disconnect 会抢先卸载导致这次 save 丢失。 */
            close()
          })
          slot.appendChild(el)
          editor._comboEl = el
          requestAnimationFrame(() => {
            try { el.focus?.() } catch (_) {}
            try { el.open?.() } catch (_) {}
          })
        },
        disconnectedCallback () {
          editor._comboEl = null
        },
      }
      return editor
    },
    cellTemplate (h, props) {
      /* 只读显示：把存储的 value 映射为选项 label。优先 `${prop}_label` 冗余字段，否则按列 editSettings.options 查表。 */
      const labelKey = `${props.prop}_label`
      if (props.model?.[labelKey] != null) return String(props.model[labelKey])
      const raw = props.model?.[props.prop]
      if (raw == null || raw === '') return ''
      const cmxCol = props.column?._cmxCol
      const field = { editSettings: cmxCol?.editSettings || props.column?.editSettings || {}, options: cmxCol?.editSettings?.options || props.column?.options }
      return String(igniteComboOptionLabel(field, raw))
    },
  },
})



/** select 列的选项数组（双路兜底：editSettings.options / _cmxSelectOptions / edit.options）。 */
function _selectOptionsOf (colData) {
  const column = colData?.column || colData
  const cmxCol = column?._cmxCol
  return cmxCol?.editSettings?.options
    ?? column?._cmxSelectOptions
    ?? cmxCol?.edit?.options
    ?? column?.editSettings?.options
    ?? column?.options
    ?? []
}
function _selectKeys (colData) {
  const cmxCol = (colData?.column || colData)?._cmxCol
  const es = cmxCol?.editSettings || {}
  return { valueKey: es.valueField || es.valueKey || 'value', labelKey: es.displayKey || es.labelKey || 'label' }
}
/** 取 select 列是否必填：必填时不加空占位（强制选有效值），非必填才加空占位（允许清空）。 */
function _selectRequired (colData) {
  const column = colData?.column || colData
  const cmxCol = column?._cmxCol
  return !!(cmxCol?.required ?? cmxCol?.edit?.required ?? column?.required)
}
function _selectLabel (colData, raw) {
  if (raw == null || raw === '') return ''
  const { valueKey, labelKey } = _selectKeys(colData)
  for (const o of _selectOptionsOf(colData)) {
    if (o && typeof o === 'object') { if (String(o[valueKey]) === String(raw)) return String(o[labelKey] ?? o[valueKey] ?? raw) }
    else if (String(o) === String(raw)) return String(o)
  }
  return String(raw)
}

registerFieldType('select', {
  description: '静态选项下拉（UI5 ui5-select，form + grid 同款组件）',
  grid: {
    /* 与 cmx-ui5-form 同款编辑器：用 UI5 <ui5-select>（主题感知、交互一致）。
       placeholder + componentDidRender 注入，避开 stencil 对 web component 子 VNode 的解析限制。 */
    editor (colData, save, close) {
      const column = colData?.column || colData
      const prop = colData?.prop ?? column?.prop
      const initial = colData?.model ? colData.model[prop] : null
      const options = _selectOptionsOf(colData)
      const { valueKey, labelKey } = _selectKeys(colData)
      const required = _selectRequired(colData)
      const editor = {
        el: null,
        render (h) {
          return h('div', { class: 'cmx-native-editor-slot', style: { width: '100%', height: '100%', display: 'flex', alignItems: 'center', boxSizing: 'border-box' } })
        },
        componentDidRender () {
          if (editor.el && editor.el.isConnected) return
          const root = this.element
          if (!root) return
          const mount = (root.querySelector && root.querySelector('.cmx-native-editor-slot')) || root
          const sel = document.createElement('ui5-select')
          sel.style.cssText = 'width:100%;'
          // 非必填才加空占位（允许清空）；必填字段强制选有效值，不加空项。
          if (!required) {
            const blank = document.createElement('ui5-option'); blank.textContent = ''; blank.dataset.value = ''; sel.appendChild(blank)
          }
          for (const o of options) {
            const v = (o && typeof o === 'object') ? o[valueKey] : o
            const l = (o && typeof o === 'object') ? (o[labelKey] ?? v) : String(o)
            const opt = document.createElement('ui5-option'); opt.textContent = String(l); opt.dataset.value = String(v ?? '')
            if (String(v) === String(initial)) opt.setAttribute('selected', '')
            sel.appendChild(opt)
          }
          sel.addEventListener('change', (e) => { save(e.detail?.selectedOption?.dataset?.value ?? null); close() })
          mount.appendChild(sel)
          editor.el = sel
        },
        getValue () { return editor.el ? (editor.el.selectedOption?.dataset?.value ?? initial) : initial },
        beforeAutoSave (val) { return val !== initial },
      }
      return editor
    },
    cellTemplate (h, props) {
      const labelKey = `${props.prop}_label`
      if (props.model?.[labelKey] != null) return String(props.model[labelKey])
      return _selectLabel(props.column, props.model?.[props.prop])
    },
  },
})

/* 注：'date' 字段类型由下方「基础输入列编辑器」用 <cmx-date-input> 统一注册（form + grid 双端），
   取代了早期仅 grid 端的 ui5-date-picker 版本。 */

/* ════════════════════════ 基础输入列编辑器（text / number / date / datetime）════════════════════════
 *
 * 四者都是 <cmx-*-input> web component，form + grid 双端同款。统一约定：
 *   - 组件 API：setField(field) / setValue(v,{silent}) / getValue() / setReadonly(b) / focus()
 *   - 组件事件：cmx-value-change { value, valid }
 * grid 端复用 combo 的"placeholder <div> + componentDidRender 挂 web component"范式，避开 stencil
 * 对 web component 子 VNode 的解析限制。
 */

/** 从 grid colData 构造一个 field 配置（CmxColumn 路径优先，回退裸列）。extra 合并额外键。 */
function _fieldFromColData (colData, type, extra = {}) {
  const column = colData?.column || colData
  const cmxCol = column?._cmxCol
  if (cmxCol) {
    return {
      key: cmxCol.id, type, label: cmxCol.caption,
      editSettings: cmxCol.editSettings || {},
      // 把 CmxColumn 顶层常用属性透传给输入组件（组件 setField 会按需读取）
      pattern: cmxCol.pattern ?? cmxCol.edit?.pattern,
      i18n: cmxCol.i18n,
      inputType: cmxCol.inputType ?? cmxCol.editSettings?.inputType,
      length: cmxCol.length, maxlength: cmxCol.length,
      integerDigits: cmxCol.integerDigits, decimalDigits: cmxCol.decimalDigits,
      formatPattern: cmxCol.edit?.formatPattern ?? cmxCol.editSettings?.formatPattern ?? cmxCol.format,
      placeholder: cmxCol.edit?.placeholder ?? cmxCol.editSettings?.placeholder,
      ...extra,
    }
  }
  return {
    key: column?.prop || colData?.prop, type,
    editSettings: column?.editSettings || {},
    pattern: column?.pattern, i18n: column?.i18n, inputType: column?.inputType,
    length: column?.length, maxlength: column?.length,
    integerDigits: column?.integerDigits, decimalDigits: column?.decimalDigits,
    formatPattern: column?.formatPattern || column?.format,
    placeholder: column?.placeholder,
    ...extra,
  }
}

/**
 * 通用 grid 编辑器工厂：把任一 <cmx-*-input> 挂进单元格。
 * @param {string} tag           自定义元素名（cmx-text-input 等）
 * @param {string} type          字段类型名
 * @param {(v:any)=>any} [norm]  保存前归一（如 number → Number）
 */
function makeInputGridEditor (tag, type, norm = (v) => v) {
  return function editor (colData, save, _close) {
    const field = _fieldFromColData(colData, type)
    const initial = colData?.model && (colData?.prop != null) ? colData.model[colData.prop] : null
    const slotClass = `cmx-${type}-editor-slot`
    const ed = {
      _el: null,
      render (h) {
        return h('div', { class: slotClass, style: { width: '100%', height: '100%', display: 'flex', boxSizing: 'border-box' } })
      },
      getValue () {
        if (!ed._el) return initial
        /* revo-grid 在失焦/回车（抢走了组件内部的回车）后直接调 getValue 取值提交。
           先 commitPending：把输入框里未提交的文本求值/归一（number 的 '=12*16' → 192、
           text 同步最新文本、date/datetime 读 picker 当前值），再取 getValue，避免拿到旧值。 */
        if (typeof ed._el.commitPending === 'function') { try { ed._el.commitPending() } catch (_) {} }
        return typeof ed._el.getValue === 'function' ? norm(ed._el.getValue()) : initial
      },
      beforeAutoSave (val) { return val !== initial },
      componentDidRender () {
        const root = (/** @type {any} */ (this)).element
        if (!root) return
        const mount = root.querySelector?.(`.${slotClass}`) || root
        if (ed._el && ed._el.isConnected) return
        const el = document.createElement(tag)
        /* data-cmx-fill-host：让 <cmx-*-input> 的 :host 用 flex+100% 撑满单元格高度（与 combo 编辑器一致），
           否则内部 ui5-input/picker 是自然高度，单元格行高更高时上下留白。 */
        el.setAttribute('data-cmx-fill-host', '')
        el.style.cssText = 'width:100%;height:100%;'
        el.setField(field)
        if (initial != null) el.setValue(initial, { silent: true })
        el.addEventListener('cmx-value-change', (e) => {
          const v = /** @type {CustomEvent<{value:any}>} */ (e).detail?.value
          /* 关键：save 第二参 preventFocus=true —— 编辑期间（尤其 text 逐字符 input 都派发
             cmx-value-change）只把值写回 revo-grid，不关闭编辑器、不把焦点移到下一行。
             否则 text 每输入一个字符就 save(val)（preventFocus 默认 false）→ revo-grid 提交 +
             afteredit 前进焦点 → 焦点逐字符跳到下一行/合计行。最终提交由 revo-grid 在失焦/回车
             （saveOnClose / closeEdit）时调本编辑器的 getValue() 完成。 */
          save(norm(v ?? null), true)
        })
        mount.appendChild(el)
        ed._el = el
        requestAnimationFrame(() => { try { el.focus?.() } catch (_) {} })
      },
      disconnectedCallback () { ed._el = null },
    }
    return ed
  }
}

/** 通用 form 端 create/write（任一 <cmx-*-input>）。 */
function makeInputFormImpl (tag, type, norm = (v) => v) {
  return {
    create (field, ctx) {
      const el = document.createElement(tag)
      el.style.cssText = 'display:block;width:100%;'
      el.setField(field)
      if (field.readonly && typeof el.setReadonly === 'function') el.setReadonly(true)
      el.addEventListener('cmx-value-change', (e) => {
        const v = /** @type {CustomEvent<{value:any}>} */ (e).detail?.value
        ctx.commit(field, norm(v ?? null))
      })
      return el
    },
    write (editor, raw) {
      if (typeof editor.setValue === 'function') editor.setValue(raw ?? null, { silent: true })
    },
  }
}

/* text / cmx-text-input 共用同一字段类型定义，都指向 <cmx-text-input>：
   - 'text'  ：dataType 推断（cmxTypeFromDataType 的文本兜底）与注册表历史用名
   - 'cmx-text-input' ：EDIT_MODES 的"输入"规范值（录入控件下拉里的「输入」项）
   两名同义，闭合"下拉选 cmx-text-input → 直接拿 field.type='cmx-text-input' 的旁路漏到旧 ui5-input"缺口。 */
const TEXT_FIELD_TYPE = {
  description: '字符串输入（正则/多语言/电话/邮件/身份证；form + grid 同款 <cmx-text-input>）',
  form: makeInputFormImpl('cmx-text-input', 'text'),
  grid: { editor: makeInputGridEditor('cmx-text-input', 'text') },
}
registerFieldType('text', TEXT_FIELD_TYPE)
registerFieldType('input', TEXT_FIELD_TYPE)
registerFieldType('cmx-text-input', TEXT_FIELD_TYPE)

const _toNum = (v) => (v == null || v === '' ? null : (Number.isFinite(Number(v)) ? Number(v) : null))
registerFieldType('number', {
  description: '数值输入（小数/整数位限制 + 表达式计算 + 微型计算器；form + grid 同款 <cmx-number-input>）',
  form: makeInputFormImpl('cmx-number-input', 'number', _toNum),
  grid: { editor: makeInputGridEditor('cmx-number-input', 'number', _toNum) },
})

registerFieldType('date', {
  description: '日期输入（格式设置 + 下拉日历；form + grid 同款 <cmx-date-input>）',
  form: makeInputFormImpl('cmx-date-input', 'date'),
  grid: { editor: makeInputGridEditor('cmx-date-input', 'date') },
})

registerFieldType('datetime', {
  description: '日期时间输入（下拉日期/时间；form + grid 同款 <cmx-datetime-input>）',
  form: makeInputFormImpl('cmx-datetime-input', 'datetime'),
  grid: { editor: makeInputGridEditor('cmx-datetime-input', 'datetime') },
})
