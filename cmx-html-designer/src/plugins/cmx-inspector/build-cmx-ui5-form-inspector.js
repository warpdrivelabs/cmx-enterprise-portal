/**
 * cmx-ui5-form 专用 Inspector：
 *   - masterSlaveId / datasetId（响应式）/ modelId 三个模型绑定选择行
 *   - layout / header 文本输入
 *   - sources / row 各一个 cmx-json-textarea（字段定义只能引用 CmxColumnModel）
 *
 * form 组件默认以 kind=single 绑定（bindForm），无需手动设置 data-cmx-kind。
 */
import './cmx-json-textarea.js'
import { buildModelSelectRow, buildDatasetIdRow } from './model-select-helper.js'

const ATTR = {
  layout:        'data-cmx-layout',
  header:        'data-cmx-header',
  sources:       'data-cmx-sources',
  row:           'data-cmx-row',
  datasetId:     'data-cmx-dataset-id',
  modelId:       'data-cmx-model-id',
  masterSlaveId: 'data-cmx-master-slave-id',
}

export function buildCmxUi5FormInspector (ctx) {
  const { node, mount, onChange, pageData } = ctx
  mount.innerHTML = ''

  const head = document.createElement('div')
  head.style.cssText = 'padding: 0.4rem 0 0.6rem; color: var(--sapContent_LabelColor); font-size: 0.78rem;'
  head.textContent = 'cmx-ui5-form — UI5 Form 单行表单。绑定 CmxMasterSlave 后自动以 bindForm 挂载（kind=single），游标切换时自动刷新字段。'
  mount.appendChild(head)

  let currentMsId = node.getAttribute(ATTR.masterSlaveId) || ''
  const datasetIdContainer = document.createElement('div')

  const renderDatasetId = () => {
    datasetIdContainer.innerHTML = ''
    datasetIdContainer.appendChild(buildDatasetIdRow({
      pageData,
      msId: currentMsId,
      currentVal: node.getAttribute(ATTR.datasetId) || '',
      onInput: (v) => { v ? node.setAttribute(ATTR.datasetId, v) : node.removeAttribute(ATTR.datasetId); onChange() },
    }))
  }

  mount.appendChild(buildModelSelectRow({
    pageData,
    modelType:   'CmxMasterSlave',
    label:       'masterSlaveId（绑定的 CmxMasterSlave）',
    placeholder: '例如 ms',
    currentVal:  currentMsId,
    onInput:     (v) => {
      currentMsId = v
      v ? node.setAttribute(ATTR.masterSlaveId, v) : node.removeAttribute(ATTR.masterSlaveId)
      renderDatasetId()
      onChange()
    },
  }))

  renderDatasetId()
  mount.appendChild(datasetIdContainer)

  mount.appendChild(buildModelSelectRow({
    pageData,
    modelType:   'CmxColumnModel',
    label:       'modelId（绑定的 CmxColumnModel）',
    placeholder: '例如 ordersModel',
    currentVal:  node.getAttribute(ATTR.modelId) || '',
    onInput:     (v) => { v ? node.setAttribute(ATTR.modelId, v) : node.removeAttribute(ATTR.modelId); onChange() },
  }))

  const sep = document.createElement('div')
  sep.style.cssText = 'border-top: 1px dashed var(--sapList_BorderColor); margin: 0.3rem 0;'
  mount.appendChild(sep)

  // layout
  const layoutWrap = document.createElement('div')
  layoutWrap.style.cssText = 'margin-bottom: 0.35rem;'
  const layoutLbl = document.createElement('div')
  layoutLbl.style.cssText = 'font-size: 0.72rem; color: var(--sapContent_LabelColor); font-weight: 500; margin-bottom: 2px;'
  layoutLbl.textContent = 'layout（响应式列数，如 S1 M2 L3 XL3）'
  const layoutInp = document.createElement('input')
  layoutInp.className = 'model-attr-input'
  layoutInp.style.cssText = 'width: 100%; padding: 0.1rem 0.3rem; border: 1px solid var(--sapField_BorderColor, #8fb4d9); border-radius: 3px; background: var(--sapField_Background, #1a2b40); color: var(--sapField_TextColor, #e2e8f0); font-size: 0.78rem; box-sizing: border-box;'
  layoutInp.placeholder = 'S1 M2 L3 XL3'
  layoutInp.value = node.getAttribute(ATTR.layout) || ''
  layoutInp.addEventListener('input', (e) => {
    const v = e.target.value
    v ? node.setAttribute(ATTR.layout, v) : node.removeAttribute(ATTR.layout)
    onChange()
  })
  layoutWrap.appendChild(layoutLbl)
  layoutWrap.appendChild(layoutInp)
  mount.appendChild(layoutWrap)

  // header
  const headerWrap = document.createElement('div')
  headerWrap.style.cssText = 'margin-bottom: 0.35rem;'
  const headerLbl = document.createElement('div')
  headerLbl.style.cssText = 'font-size: 0.72rem; color: var(--sapContent_LabelColor); font-weight: 500; margin-bottom: 2px;'
  headerLbl.textContent = 'header（表单标题）'
  const headerInp = document.createElement('input')
  headerInp.className = 'model-attr-input'
  headerInp.style.cssText = 'width: 100%; padding: 0.1rem 0.3rem; border: 1px solid var(--sapField_BorderColor, #8fb4d9); border-radius: 3px; background: var(--sapField_Background, #1a2b40); color: var(--sapField_TextColor, #e2e8f0); font-size: 0.78rem; box-sizing: border-box;'
  headerInp.placeholder = '例如 订单信息'
  headerInp.value = node.getAttribute(ATTR.header) || ''
  headerInp.addEventListener('input', (e) => {
    const v = e.target.value
    v ? node.setAttribute(ATTR.header, v) : node.removeAttribute(ATTR.header)
    onChange()
  })
  headerWrap.appendChild(headerLbl)
  headerWrap.appendChild(headerInp)
  mount.appendChild(headerWrap)

  // 字段定义提示
  const fieldsHint = document.createElement('div')
  fieldsHint.style.cssText = 'border-top: 1px dashed var(--sapList_BorderColor); margin-top: 0.5rem; padding-top: 0.4rem; color: var(--sapContent_LabelColor); font-size: 0.78rem;'
  fieldsHint.textContent = '字段定义由所选 CmxColumnModel 提供（含分组）。'
  mount.appendChild(fieldsHint)

  // JSON textareas
  const jsonGroups = [
    { attr: ATTR.sources, label: 'sources（字典）',     placeholder: '[{"id":"status","items":[{"code":"1","name":"有效"}]}]', rows: 3 },
    { attr: ATTR.row,     label: 'row（初始行数据）',   placeholder: '{"id":"r1","name":"订单1"}',                             rows: 3 },
  ]
  for (const g of jsonGroups) {
    const sep2 = document.createElement('div')
    sep2.style.cssText = 'border-top: 1px dashed var(--sapList_BorderColor); margin-top: 0.5rem;'
    mount.appendChild(sep2)
    const ed = document.createElement('cmx-json-textarea')
    ed.setAttribute('label', g.label)
    ed.setAttribute('placeholder', g.placeholder)
    ed.setAttribute('rows', String(g.rows))
    ed.setValue(node.getAttribute(g.attr) || '')
    ed.addEventListener('cmx-json-change', (e) => {
      const text = e.detail.value
      if (!text || !text.trim()) {
        node.removeAttribute(g.attr)
      } else if (e.detail.valid) {
        node.setAttribute(g.attr, text)
      }
      onChange()
    })
    mount.appendChild(ed)
  }
}
