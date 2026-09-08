/**
 * cmx-web-treeview 专用 Inspector：
 *   - masterSlaveId / datasetId / modelId 绑定（与 cmx-revo-grid 一致）
 *   - 常用 treeview 属性的文本输入行
 */
import { buildModelSelectRow, buildDatasetIdRow } from './model-select-helper.js'

const ATTR = {
  datasetId:     'data-cmx-dataset-id',
  modelId:       'data-cmx-model-id',
  masterSlaveId: 'data-cmx-master-slave-id',
}

function buildTextRow(label, attrName, placeholder, node, onChange) {
  const wrap = document.createElement('div')
  wrap.style.cssText = 'margin-bottom: 0.35rem;'

  const lbl = document.createElement('div')
  lbl.style.cssText = 'font-size: 0.72rem; color: var(--sapContent_LabelColor); font-weight: 500; margin-bottom: 2px;'
  lbl.textContent = label
  wrap.appendChild(lbl)

  const inp = document.createElement('input')
  inp.className = 'model-attr-input'
  inp.style.cssText = 'width: 100%; padding: 0.1rem 0.3rem; border: 1px solid var(--sapField_BorderColor, #8fb4d9); border-radius: 3px; background: var(--sapField_Background, #1a2b40); color: var(--sapField_TextColor, #e2e8f0); font-size: 0.78rem; box-sizing: border-box;'
  inp.placeholder = placeholder
  inp.value = node.getAttribute(attrName) || ''
  inp.addEventListener('input', (e) => {
    const v = e.target.value
    v ? node.setAttribute(attrName, v) : node.removeAttribute(attrName)
    onChange()
  })
  wrap.appendChild(inp)
  return wrap
}

export function buildCmxWebTreeviewInspector(ctx) {
  const { node, mount, onChange, pageData } = ctx
  mount.innerHTML = ''

  const head = document.createElement('div')
  head.style.cssText = 'padding: 0.4rem 0 0.6rem; color: var(--sapContent_LabelColor); font-size: 0.78rem;'
  head.textContent = 'cmx-web-treeview — 树形视图。绑定 CmxDataSet 后自动从行数据生成节点；绑定 CmxColumnModel 后按 toTitleCols / iconCol 生成节点显示与图标。'
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
    placeholder: '例如 deptModel',
    currentVal:  node.getAttribute(ATTR.modelId) || '',
    onInput:     (v) => { v ? node.setAttribute(ATTR.modelId, v) : node.removeAttribute(ATTR.modelId); onChange() },
  }))

  const sep = document.createElement('div')
  sep.style.cssText = 'border-top: 1px dashed var(--sapList_BorderColor); margin: 0.4rem 0;'
  mount.appendChild(sep)

  const treeAttrs = [
    { label: 'idMember',            attr: 'id-member',                       placeholder: 'id' },
    { label: 'pathMember',          attr: 'path-member',                     placeholder: 'path' },
    { label: 'displayValueMember',  attr: 'display-value-member',            placeholder: 'name' },
    { label: 'iconMember',          attr: 'icon-member',                     placeholder: 'icon' },
    { label: 'badgeMember（气泡角标字段）', attr: 'badge-member',            placeholder: 'unread' },
    { label: 'expandLevel',         attr: 'expand-level',                    placeholder: '2' },
    { label: 'treePathSeparator',   attr: 'tree-path-separator',             placeholder: '.' },
    { label: 'shouldToggleOnNodeClick', attr: 'should-toggle-on-node-click', placeholder: 'true' },
    { label: 'isLoading',           attr: 'is-loading',                      placeholder: 'false' },
    { label: 'virtualScroll',       attr: 'virtual-scroll',                  placeholder: 'false' },
    { label: 'virtualRowHeight',    attr: 'virtual-row-height',              placeholder: '' },
    { label: 'expandIconClass',     attr: 'expand-icon-class',               placeholder: '' },
    { label: 'collapseIconClass',   attr: 'collapse-icon-class',             placeholder: '' },
    { label: 'leafIconClass',       attr: 'leaf-icon-class',                 placeholder: '' },
    { label: 'dragDropMode',        attr: 'drag-drop-mode',                  placeholder: '' },
  ]

  for (const a of treeAttrs) {
    mount.appendChild(buildTextRow(a.label, a.attr, a.placeholder, node, onChange))
  }
}
