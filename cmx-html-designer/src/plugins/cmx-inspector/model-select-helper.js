/**
 * model-select-helper — 在 Inspector 中渲染「从模型面板选择」的下拉行
 *
 * 当 pageData._models 中存在对应类型实例时，渲染一个 <select> 供快速选择；
 * 输入框仍保留，允许手动输入。
 *
 * @param {object} opts
 * @param {*}      opts.pageData    inspector ctx.pageData（designer-page-data 实例）
 * @param {string} opts.modelType   'CmxDataSet' | 'CmxColumnModel' | 'CmxMasterSlave'
 * @param {string} opts.label       字段标签
 * @param {string} opts.placeholder 输入框占位文字
 * @param {string} opts.currentVal  当前值
 * @param {string} opts.attrStyle   输入框额外 style
 * @param {Function} opts.onInput   (value: string) => void，值变化回调
 * @param {{ value: string, label: string }[]} [opts.items]  直接指定选项列表（优先于 pageData + modelType）
 * @returns {HTMLElement}  包含 label + 输入行（含选择器）的容器
 */
export function buildModelSelectRow({
  pageData,
  modelType,
  label,
  placeholder,
  currentVal,
  attrStyle = '',
  onInput,
  items: customItems,
}) {
  const models = customItems
    ?? (pageData?._models || []).filter((m) => m.modelType === modelType).map((m) => ({ value: m.instanceId, label: m.instanceId }))

  const wrap = document.createElement('div')
  wrap.style.cssText = 'margin-bottom: 0.35rem;'

  // label
  const lbl = document.createElement('div')
  lbl.style.cssText = 'font-size: 0.72rem; color: var(--sapContent_LabelColor); font-weight: 500; margin-bottom: 2px;'
  lbl.textContent = label
  wrap.appendChild(lbl)

  // 输入行
  const row = document.createElement('div')
  row.style.cssText = 'display: flex; gap: 4px; align-items: center;'
  wrap.appendChild(row)

  // 文本输入框
  const inp = document.createElement('input')
  inp.className = 'model-attr-input'
  inp.style.cssText = `flex: 1; padding: 0.1rem 0.3rem; border: 1px solid var(--sapField_BorderColor, #8fb4d9); border-radius: 3px; background: var(--sapField_Background, #1a2b40); color: var(--sapField_TextColor, #e2e8f0); font-size: 0.78rem; box-sizing: border-box; min-width: 0; ${attrStyle}`
  inp.placeholder = placeholder
  inp.value = currentVal || ''
  inp.addEventListener('input', (e) => onInput(e.target.value))
  row.appendChild(inp)

  if (models.length) {
    // 下拉选择器
    const sel = document.createElement('select')
    sel.title = `从模型面板选择`
    sel.style.cssText = 'padding: 0.1rem 0.2rem; border: 1px solid var(--sapField_BorderColor, #8fb4d9); border-radius: 3px; background: var(--sapField_Background, #1a2b40); color: var(--sapField_TextColor, #e2e8f0); font-size: 0.72rem; cursor: pointer; flex-shrink: 0; max-width: 96px;'

    const emptyOpt = document.createElement('option')
    emptyOpt.value = ''
    emptyOpt.textContent = '选择…'
    sel.appendChild(emptyOpt)

    for (const m of models) {
      const opt = document.createElement('option')
      opt.value = m.value
      opt.textContent = m.label
      if (m.value === currentVal) opt.selected = true
      sel.appendChild(opt)
    }

    sel.addEventListener('change', (e) => {
      if (!e.target.value) return
      inp.value = e.target.value
      onInput(e.target.value)
      // 重置回"选择…"，让用户感知是选了一次
      setTimeout(() => { sel.value = '' }, 80)
    })
    row.appendChild(sel)
  }

  return wrap
}

// ─── datasetId 动态行 ──────────────────────────────────────────────────────

/** 递归收集 CmxMasterSlave schema 节点的所有路径 */
function collectSchemaPaths (nodes, prefix) {
  const paths = []
  for (const n of (nodes || [])) {
    const p = prefix ? `${prefix}.${n.id}` : n.id
    paths.push(p)
    if (n.children?.length) paths.push(...collectSchemaPaths(n.children, p))
  }
  return paths
}

/**
 * 构建 datasetId 输入行（响应 masterSlaveId 变化）：
 *   - msId 有值 → 从对应 CmxMasterSlave 的 schema 提取路径作为下拉选项
 *   - msId 为空 → 从 CmxDataSet 模型列表作为下拉选项
 *
 * @param {object} opts
 * @param {*}      opts.pageData
 * @param {string} opts.msId        当前 masterSlaveId 值
 * @param {string} opts.currentVal  当前 datasetId 值
 * @param {Function} opts.onInput
 * @returns {HTMLElement}
 */
export function buildDatasetIdRow ({ pageData, msId, currentVal, onInput }) {
  const models = pageData?._models || []
  let labelText, placeholder, items = []

  if (msId) {
    const msModel = models.find((m) => m.modelType === 'CmxMasterSlave' && m.instanceId === msId)
    const paths = collectSchemaPaths(msModel?.props?.schema || [])
    items = paths.map((p) => ({ value: p, label: p }))
    labelText = `datasetId（${msId} schema 路径）`
    placeholder = items[0]?.value || '例如 orders'
  } else {
    items = models
      .filter((m) => m.modelType === 'CmxDataSet')
      .map((m) => ({ value: m.instanceId, label: m.instanceId }))
    labelText = 'datasetId（绑定的 CmxDataSet）'
    placeholder = '例如 ordersDs'
  }

  return buildModelSelectRow({ pageData: null, label: labelText, placeholder, currentVal, onInput, items })
}

