/**
 * cmx-revo-grid 专用 Inspector：
 *   - 列定义只能引用 CmxColumnModel（modelId 选择行 → data-cmx-model-id）
 *   - options / rows 各一个 cmx-json-textarea（非列定义）
 *
 * 配置序列化到 data-cmx-* attribute，由 cmx-revo-grid 在 connectedCallback 时读取；
 * 列定义由 init-page-models 按 data-cmx-model-id 调 setColumnModel 注入。
 */
import './cmx-json-textarea.js'
import { buildModelSelectRow, buildDatasetIdRow } from './model-select-helper.js'

const ATTR = {
  options:       'data-cmx-options',
  rows:          'data-cmx-rows',
  datasetId:     'data-cmx-dataset-id',
  modelId:       'data-cmx-model-id',
  masterSlaveId: 'data-cmx-master-slave-id',
}

export function buildCmxRevoGridInspector (ctx) {
  const { node, mount, onChange, pageData } = ctx
  mount.innerHTML = ''

  const head = document.createElement('div')
  head.style.cssText = 'padding: 0.4rem 0 0.6rem; color: var(--sapContent_LabelColor); font-size: 0.78rem;'
  head.textContent = 'cmx-revo-grid — RevoGrid 数据网格。配置存储在 data-cmx-* attribute，运行时由 init / pageFns 读取并调用组件 API。'
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
    placeholder: '例如 itemsModel',
    currentVal:  node.getAttribute(ATTR.modelId) || '',
    onInput:     (v) => { const a = ATTR.modelId; v ? node.setAttribute(a, v) : node.removeAttribute(a); onChange() },
  }))

  const sepModel = document.createElement('div')
  sepModel.style.cssText = 'border-top: 1px dashed var(--sapList_BorderColor); margin: 0.3rem 0;'
  mount.appendChild(sepModel)

  const colsHead = document.createElement('div')
  colsHead.style.cssText = 'color: var(--sapContent_LabelColor); font-size: 0.78rem; padding: 0.3rem 0;'
  colsHead.textContent = '列定义由所选 CmxColumnModel 提供（含分组表头与合计）。'
  mount.appendChild(colsHead)

  const jsonGroups = [
    { attr: ATTR.options,      label: 'options',      placeholder: '{"selectionMode":"single","rowHeight":32,"totalsMode":"pinned"}', rows: 4 },
    { attr: ATTR.rows,         label: 'rows (初始数据)', placeholder: '[{"id":"r1","sku":"A","amount":100}]', rows: 4 },
  ]
  for (const g of jsonGroups) {
    const sep = document.createElement('div')
    sep.style.cssText = 'border-top: 1px dashed var(--sapList_BorderColor); margin-top: 0.5rem;'
    mount.appendChild(sep)
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
