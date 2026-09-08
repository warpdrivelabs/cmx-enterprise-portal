/**
 * page-data-panel-models.js — CMX Models 面板
 *
 * 上半部分：模型实例列表（从调色板 CMX 模型分组拖入，可多实例）
 * 下半部分：tab 切换的「属性」 / 「事件」面板
 *
 * 数据存储在 pd._models: Array<ModelInstance>
 *   ModelInstance: {
 *     id:         string   唯一标识（自动生成）
 *     modelType:  'CmxDataSet' | 'CmxMasterSlave' | 'CmxColumnModel'
 *     instanceId: string   用户命名的实例名（默认自动生成）
 *     props:      object   各模型的属性集合
 *     events:     Record<string,string>   事件名 -> 处理脚本（函数体）
 *   }
 */

import { buildDataSetProps }     from './models-props-dataset.js'
import { buildMasterSlaveProps } from './models-props-masterslave.js'
import { buildColumnModelProps } from './models-props-columnmodel.js'
import { buildFlexibleCombinationProps } from './models-props-flexible-combination.js'
import { buildMetaModelProps } from './models-props-meta.js'
import { TabManager } from '../../utils/tab-manager.js'
import { loadCodeMirrorJsBundle } from '../../lib/codemirror-loader.js'
import {
  attachCodeMirrorResize,
  detachCodeMirrorResize,
  CM_RESIZE_HOST_CLASS,
} from '../../utils/codemirror-resize.js'
import { cmxCodeMirrorExtensions } from '../../utils/codemirror-theme.js'
import {
  MODEL_EVENT_PRESETS,
  getModelEventScriptHintHtml,
} from './models-event-script-hints.js'
import { escHtml } from '../../utils/esc.js'

const MODEL_TYPES = {
  CmxDataSet:      { label: 'CmxDataSet',      icon: '🗂', color: 'var(--sapLinkColor, #0070f2)', defaultPrefix: 'ds' },
  CmxMasterSlave:  { label: 'CmxMasterSlave',  icon: '⚡', color: 'var(--sapCriticalTextColor, #b45309)', defaultPrefix: 'ms' },
  CmxColumnModel:  { label: 'CmxColumnModel',  icon: '📋', color: 'var(--sapPositiveTextColor, #059669)', defaultPrefix: 'model' },
  CmxDCTMeta:      { label: 'CmxDCTMeta',      icon: '▣', color: '#0f766e', defaultPrefix: 'dctMeta' },
  CmxDOCMeta:      { label: 'CmxDOCMeta',      icon: '▤', color: 'var(--sapLinkColor, #2563eb)', defaultPrefix: 'docMeta' },
  FlexibleCombination:  { label: '弹性组合',  icon: '🧭', color: 'var(--neo-violet, #7c3aed)', defaultPrefix: 'flexibleCombination' },
}

const PROPS_BUILDERS = {
  CmxDataSet:     buildDataSetProps,
  CmxMasterSlave: buildMasterSlaveProps,
  CmxColumnModel: buildColumnModelProps,
  CmxDCTMeta: buildMetaModelProps,
  CmxDOCMeta: buildMetaModelProps,
  FlexibleCombination: buildFlexibleCombinationProps,
}

let _idSeq = 0
const genId = () => `m${++_idSeq}`

function bumpIdSeq(models) {
  for (const m of models || []) {
    const match = /^m(\d+)$/.exec(String(m?.id || ''))
    if (match) {
      const n = Number(match[1])
      if (n > _idSeq) _idSeq = n
    }
  }
}

function defaultProps(modelType) {
  switch (modelType) {
    case 'CmxDataSet':    return { dataSource: '', dataSourceEvent: 'onInit', children: [] }
    case 'CmxMasterSlave':return {
      schema: [], aggregations: [],
      autoLoad: false,
      loadKind: '',              // '' 禁用 | 'list' 列表 | 'detail' 单行详情（kind 由 metaModelId 自动带出：DOC/DCT）
      metaModelId: '',           // 关联的 CmxDOCMeta / CmxDCTMeta 实例（同时供出中文表名与驱动 loadKind 派发）
      source: {
        moduleCode: '',          // 模块编码（DOC 单据模块 / DCT 字典分组模块，留空走默认）
        dict: '',                // dictCode（DCT 内具体字典表编码，如 gl_account）
        dbId: '',                // 目标库 header（缺省走后端默认库）
        binary: false,           // true=走 msgpack 列式
        apiPath: '',             // 覆盖默认端点
      },
      limit: '',                 // 行数上限（list 形态用，detail 形态强制 1；使用 cmx-pager 分页时被忽略）
      filter: '',                // 根层过滤（detail 形态用），支持 ${route.id} 占位
      depth: '',                 // 装载深度（detail 形态用）
    }
    case 'CmxColumnModel':return { datasetId: '', columns: [], columnGroups: [], metaModelId: '', metaTable: '' }
    case 'CmxDCTMeta':    return { id: '', domain: '', module: '', apiPath: '/api/definitions/config', baseApiPath: '/api/definitions/config', serviceFn: '', baseServiceFn: '', autoLoad: false, json: {}, baseMeta: {} }
    case 'CmxDOCMeta':    return { id: '', domain: '', module: '', apiPath: '/api/definitions/config', baseApiPath: '/api/definitions/config', serviceFn: '', baseServiceFn: '', autoLoad: false, json: {}, baseMeta: {} }
    // domain/app/module 由页面级全局坐标 host.$coord 自动兜底（resolveCoord 空串即回落全局），无需在此声明；
    // 仅 scenario 为 FC 独有、后端强制必填，必须显式配置。
    // anchorDimensions 已废弃（模型侧从未消费；锚点维度在弹性组合管理页的档案级配置里维护）。
    case 'FlexibleCombination':return { scenario: '',
                                   columnModelId: '', serviceFn: '', apiPath: '/api/flexible-combination/rule' }
    default:              return {}
  }
}

export function bindModelsPanel(pd) {
  if (!pd._models) pd._models = []
  pd._modelsSelectedId = null
  pd._modelsSelectedColumn = null

  pd._modelEvtCmView = null
  pd._modelEvtCmLock = Promise.resolve()
  pd._modelEvtPanelGen = 0
  pd._modelEvtCurrentName = null
  pd._modelEvtKnownEvents = []

  const pane = pd.shadowRoot.getElementById('modelsPane')
  if (!pane) return

  // 下半部分 tab 切换
  pd._modelsTabMgr = new TabManager(
    pd.shadowRoot,
    '.mp-tab-btn',
    '.mp-tab-pane',
    { dataAttr: 'mptab' },
  )

  // ── 拖拽接受区 ────────────────────────────────────────────────────────
  const dropZone = pane.querySelector('.models-drop-zone')
  if (dropZone) {
    dropZone.addEventListener('dragover', (e) => {
      const tag = e.dataTransfer.types.includes('text/plain')
        ? e.dataTransfer.getData('text/plain') : ''
      if (MODEL_TYPES[tag] || !tag) {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        dropZone.classList.add('drag-over')
      }
    })
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'))
    dropZone.addEventListener('drop', (e) => {
      dropZone.classList.remove('drag-over')
      const tag = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('cmx-model-type')
      if (!MODEL_TYPES[tag]) return
      e.preventDefault()
      e.stopPropagation()
      const info = MODEL_TYPES[tag]
      const existCount = pd._models.filter((m) => m.modelType === tag).length
      const instance = {
        id:         genId(),
        modelType:  tag,
        instanceId: `${info.defaultPrefix}${existCount > 0 ? existCount + 1 : ''}`,
        props:      defaultProps(tag),
        events:     {},
      }
      pd._models.push(instance)
      pd._emitPageDataChanged()
      renderModelsList(pd)
      selectModelInstance(pd, instance.id)
    })
  }

  renderModelsList(pd)
}

export function renderModelsList(pd, skipProps = false) {
  const list = pd.shadowRoot.getElementById('modelsInstanceList')
  const empty = pd.shadowRoot.getElementById('modelsEmpty')
  if (!list) return

  list.innerHTML = ''
  if (!pd._models.length) {
    if (empty) empty.style.display = ''
    renderModelProps(pd, null)
    renderModelEvents(pd, null)
    emitModelSelected(pd, null)
    return
  }
  if (empty) empty.style.display = 'none'

  pd._models.forEach((m) => {
    const info = MODEL_TYPES[m.modelType] || {}
    const isSelected = pd._modelsSelectedId === m.id
    const card = document.createElement('div')
    card.className = `model-instance-card${isSelected ? ' selected' : ''}`
    card.innerHTML = `
      <span class="model-icon">${info.icon || '□'}</span>
      <span class="model-type-label" style="color:${info.color || 'var(--sapContent_LabelColor, #666666)'}">${info.label}</span>
      <span class="model-instance-id">${escHtml(m.instanceId)}</span>
      <button class="model-del-btn" title="删除" data-id="${m.id}">×</button>
    `
    card.addEventListener('click', (e) => {
      if (e.target.closest('.model-del-btn')) return
      selectModelInstance(pd, m.id)
    })
    card.querySelector('.model-del-btn').addEventListener('click', () => {
      pd._models = pd._models.filter((x) => x.id !== m.id)
      if (pd._modelsSelectedId === m.id) pd._modelsSelectedId = null
      pd._emitPageDataChanged()
      renderModelsList(pd)
      renderModelProps(pd, null)
      renderModelEvents(pd, null)
      emitModelSelected(pd, null)
    })
    list.appendChild(card)
  })

  if (pd._modelsSelectedId && !skipProps) {
    renderModelProps(pd, pd._modelsSelectedId)
    renderModelEvents(pd, pd._modelsSelectedId)
  }
}

function selectModelInstance(pd, id) {
  pd._modelsSelectedId = id
  pd._modelsSelectedColumn = null
  renderModelsList(pd)
  renderModelProps(pd, id)
  renderModelEvents(pd, id)
  emitModelSelected(pd, pd._models.find((m) => m.id === id) || null)
}

function renderModelProps(pd, id) {
  const propsArea = pd.shadowRoot.getElementById('modelsPropsArea')
  if (!propsArea) return
  propsArea.innerHTML = ''

  if (!id) {
    propsArea.innerHTML = '<div class="models-props-empty">从上方选择一个模型实例来配置属性</div>'
    return
  }
  const instance = pd._models.find((m) => m.id === id)
  if (!instance) return

  const builder = PROPS_BUILDERS[instance.modelType]
  if (!builder) {
    propsArea.innerHTML = `<div class="models-props-empty">${instance.modelType} 暂无属性配置</div>`
    return
  }

  builder({
    instance,
    mount: propsArea,
    allModels: pd._models,
    selectedColumnPath: pd._modelsSelectedColumn?.modelId === instance.id ? pd._modelsSelectedColumn.path : '',
    onSelectColumn: ({ column, path, model }) => {
      pd._modelsSelectedColumn = { modelId: model.id, path }
      emitModelColumnSelected(pd, model, column, path)
      updateSelectedModelFieldRow(propsArea, path)
    },
    onChange: () => {
      pd._emitPageDataChanged()
      renderModelsList(pd, true)
    },
  })
}

function updateSelectedModelFieldRow(propsArea, path) {
  if (!propsArea) return
  propsArea.querySelectorAll('.cmx-field-table tr.cmx-field-row.sel').forEach((row) => row.classList.remove('sel'))
  const key = cssEscape(String(path || ''))
  if (!key) return
  propsArea.querySelector(`.cmx-field-table tr.cmx-field-row[data-field-key="${key}"]`)?.classList.add('sel')
}

function cssEscape(value) {
  if (globalThis.CSS && typeof globalThis.CSS.escape === 'function') return globalThis.CSS.escape(value)
  return String(value).replace(/["\\]/g, '\\$&')
}

function emitModelSelected(pd, model) {
  pd.dispatchEvent(new CustomEvent('model-selected', {
    bubbles: true,
    composed: true,
    detail: { model: model || null },
  }))
}

function emitModelColumnSelected(pd, model, column, path) {
  pd.dispatchEvent(new CustomEvent('model-column-selected', {
    bubbles: true,
    composed: true,
    detail: { model, column, path },
  }))
}

/* ─────────────────────────── 事件 Tab ─────────────────────────── */

function renderModelEvents(pd, id) {
  const area = pd.shadowRoot.getElementById('modelsEventsArea')
  if (!area) return

  pd._modelEvtPanelGen = (pd._modelEvtPanelGen || 0) + 1
  pd._modelEvtCurrentName = null
  detachCodeMirrorResize(pd._modelEvtCmView)
  pd._modelEvtCmView?.destroy()
  pd._modelEvtCmView = null

  area.innerHTML = ''

  if (!id) {
    area.innerHTML = '<div class="models-props-empty">从上方选择一个模型实例来编辑事件</div>'
    return
  }
  const instance = pd._models.find((m) => m.id === id)
  if (!instance) return
  if (!instance.events || typeof instance.events !== 'object') instance.events = {}

  const presets = MODEL_EVENT_PRESETS[instance.modelType] || []
  const boundNames = Object.keys(instance.events).filter((n) => instance.events[n])
  const customNames = boundNames.filter((n) => !presets.includes(n))
  const allChipNames = [...presets, ...customNames]
  pd._modelEvtKnownEvents = presets.slice()

  const chipsHtml = allChipNames.length
    ? allChipNames.map((evt) => {
        const hasCode = !!(instance.events[evt] && instance.events[evt].trim())
        return `<button class="event-chip ${hasCode ? 'bound' : ''}" data-evt="${escHtml(evt)}">${escHtml(evt)}${hasCode ? ' ✓' : ''}</button>`
      }).join('')
    : `<span class="model-evt-empty">该模型类型无内置事件，可点击下方按钮添加自定义事件</span>`

  area.innerHTML = `
    <div class="model-evt-card">
      <div class="model-evt-card-title">事件列表（点击编辑）— ${escHtml(instance.modelType)} · ${escHtml(instance.instanceId)}</div>
      <div class="event-chips" id="modelEvtChips">${chipsHtml}</div>
      <button class="model-evt-custom-btn" id="modelEvtAddCustomBtn">＋ 自定义事件...</button>
    </div>
    <div class="model-evt-editor" id="modelEvtEditor" style="display:none">
      <div class="model-evt-editor-title" id="modelEvtEditorTitle">编辑事件</div>
      <div class="model-evt-custom-row" id="modelEvtCustomRow" style="display:none">
        <label>自定义事件名</label>
        <input type="text" class="prop-input-sm" id="modelEvtCustomName" placeholder="例如 ready" />
      </div>
      <div id="modelEvtHint" class="evt-script-hint" aria-live="polite"></div>
      <div class="model-evt-actions">
        <button class="model-evt-btn-debugger" id="modelEvtInsertDebuggerBtn" title="在光标处插入 debugger;">插入 debugger</button>
      </div>
      <div id="modelEvtCmHost" class="model-evt-cm-host ${CM_RESIZE_HOST_CLASS}"></div>
      <div class="model-evt-actions">
        <button class="model-evt-btn-bind" id="modelEvtBindBtn">绑定事件</button>
        <button class="model-evt-btn-remove" id="modelEvtRemoveBtn">移除事件</button>
      </div>
    </div>
  `

  area.querySelector('#modelEvtChips').addEventListener('click', (e) => {
    const chip = e.target.closest('.event-chip')
    if (!chip) return
    const evt = chip.dataset.evt
    const code = instance.events[evt] || ''
    void openModelEvtEditor(pd, instance, evt, code)
  })

  area.querySelector('#modelEvtAddCustomBtn').addEventListener('click', () => {
    const customRow = area.querySelector('#modelEvtCustomRow')
    if (customRow) customRow.style.display = ''
    pd._modelEvtCurrentName = ''
    void openModelEvtEditor(pd, instance, '', '')
  })

  area.querySelector('#modelEvtCustomName').addEventListener('input', (e) => {
    const v = e.target.value.trim()
    pd._modelEvtCurrentName = v
    if (v) {
      const hint = area.querySelector('#modelEvtHint')
      if (hint) hint.innerHTML = getModelEventScriptHintHtml(instance.modelType, v)
    }
  })

  area.querySelector('#modelEvtBindBtn').addEventListener('click', () => {
    const evt = pd._modelEvtCurrentName ?? ''
    if (!evt) return
    const code = pd._modelEvtCmView?.state.doc.toString() ?? ''
    if (!code.trim()) {
      delete instance.events[evt]
    } else {
      instance.events[evt] = code
    }
    pd._emitPageDataChanged()
    renderModelEvents(pd, id)
  })

  area.querySelector('#modelEvtRemoveBtn').addEventListener('click', () => {
    const evt = pd._modelEvtCurrentName ?? ''
    if (!evt) return
    delete instance.events[evt]
    pd._emitPageDataChanged()
    renderModelEvents(pd, id)
  })

  area.querySelector('#modelEvtInsertDebuggerBtn').addEventListener('click', () => {
    const view = pd._modelEvtCmView
    if (!view) return
    const head = view.state.selection.main.head
    view.dispatch({
      changes: { from: head, to: head, insert: 'debugger;\n' },
      selection: { anchor: head + 'debugger;\n'.length },
    })
    requestAnimationFrame(() => view.focus())
  })
}

async function openModelEvtEditor(pd, instance, evt, code) {
  const area = pd.shadowRoot.getElementById('modelsEventsArea')
  if (!area) return
  const editor = area.querySelector('#modelEvtEditor')
  if (!editor) return

  pd._modelEvtCurrentName = evt
  editor.style.display = ''
  editor.querySelector('#modelEvtEditorTitle').textContent = `编辑事件：${evt || '(待命名)'}`

  const hint = editor.querySelector('#modelEvtHint')
  if (hint) hint.innerHTML = getModelEventScriptHintHtml(instance.modelType, evt)

  const customRow = editor.querySelector('#modelEvtCustomRow')
  const customInput = editor.querySelector('#modelEvtCustomName')
  if (customRow && customInput) {
    const isCustom = evt === '' || !pd._modelEvtKnownEvents.includes(evt)
    customRow.style.display = isCustom ? '' : 'none'
    if (isCustom && evt) customInput.value = evt
    else customInput.value = ''
  }

  const host = editor.querySelector('#modelEvtCmHost')
  if (!host) return

  if (!pd._modelEvtCmView) {
    const gen = pd._modelEvtPanelGen
    pd._modelEvtCmLock = pd._modelEvtCmLock.then(async () => {
      if (pd._modelEvtCmView) return
      const view = await createModelEvtEditor(pd, host, instance, code)
      if (gen !== pd._modelEvtPanelGen || !host.isConnected) {
        detachCodeMirrorResize(view)
        view.destroy()
        return
      }
      pd._modelEvtCmView = view
    })
    await pd._modelEvtCmLock
  }
  pd._modelEvtCmView?.dispatch({
    changes: { from: 0, to: pd._modelEvtCmView.state.doc.length, insert: code },
  })
  requestAnimationFrame(() => pd._modelEvtCmView?.focus())
}

async function createModelEvtEditor(pd, host, instance, initCode) {
  const {
    EditorView,
    basicSetup,
    EditorState,
    javascript,
    oneDark,
  } = await loadCodeMirrorJsBundle()
  const jsSupport = javascript()
  const completionSource = (ctx) => modelEvtCompletionSource(pd, instance, ctx)
  const view = new EditorView({
    parent: host,
    root: pd.shadowRoot,
    state: EditorState.create({
      doc: initCode || '',
      extensions: [
        basicSetup,
        jsSupport,
        jsSupport.language.data.of({ autocomplete: completionSource }),
        ...cmxCodeMirrorExtensions(EditorView, oneDark),
      ],
    }),
  })
  attachCodeMirrorResize(view)
  return view
}

function modelEvtCompletionSource(pd, instance, context) {
  const dataMember = context.matchBefore(/\$data\.\w*/)
  if (dataMember) {
    const pageData = pd._pageData || []
    return {
      from: dataMember.from + '$data.'.length,
      validFor: /^\w*$/,
      options: pageData.filter((d) => d.name).map((d) => ({
        label:  d.name,
        type:   'variable',
        detail: d.type || 'string',
        info:   `页面变量 $data.${d.name}`,
        boost:  10,
      })),
    }
  }

  const word = context.matchBefore(/[\$\w]+/)
  if (!word || (word.from === word.to && !context.explicit)) return null

  const pageFns  = pd._pageFns || []
  const pageSvcs = pd._pageServices || []
  const others   = (pd._models || []).filter((m) => m.id !== instance.id && m.instanceId)

  const options = [
    { label: '$data',     type: 'variable', detail: '页面数据对象', boost: 12,
      apply: (view, _completion, from, to) => view.dispatch({ changes: { from, to, insert: '$data.' } }),
    },
    { label: 'event',     type: 'variable', detail: '触发事件对象', boost: 11 },
    { label: 'event.target',     type: 'property', detail: '事件目标元素', boost: 8 },
    { label: 'event.detail',     type: 'property', detail: '事件 detail 数据', boost: 8 },
    { label: 'host',     type: 'variable', detail: '页面 Web Component 实例', boost: 10 },
    { label: 'this',     type: 'keyword',  detail: `当前模型实例（${instance.modelType}）`, boost: 11 },
    { label: 'console.log()',    type: 'method',   detail: '控制台输出', boost: 4 },
    { label: 'alert()',          type: 'function', detail: '弹出提示框', boost: 3 },
    { label: 'setTimeout()',     type: 'function', detail: '延时执行', boost: 2 },
    { label: 'fetch()',          type: 'function', detail: '发起网络请求', boost: 2 },
    ...others.map((m) => ({
      label:  m.instanceId,
      type:   'variable',
      detail: `模型实例（${m.modelType}）`,
      boost:  9,
    })),
    ...pageFns.filter((f) => f.name).map((f) => ({
      label:  f.name,
      type:   'function',
      detail: '页面函数',
      boost:  10,
      apply:  `${f.name}(`,
    })),
    ...pageSvcs.filter((s) => s.name).map((s) => ({
      label:  s.name,
      type:   'function',
      detail: '页面服务',
      boost:  9,
      apply:  `${s.name}(`,
    })),
  ]

  return { from: word.from, validFor: /^[\$\w]*$/, options }
}

/* ─────────────────────────── 状态持久化 ─────────────────────────── */

export function getModelsState(pd) {
  return (pd._models || []).map((m) => ({
    ...m,
    props:  { ...(m.props || {}) },
    events: { ...(m.events || {}) },
  }))
}

export function setModelsState(pd, arr) {
  pd._models = Array.isArray(arr) ? arr.map((m) => ({
    id:         m.id || genId(),
    modelType:  m.modelType || 'CmxDataSet',
    instanceId: m.instanceId || 'ds',
    props:      m.props || defaultProps(m.modelType),
    events:     m.events && typeof m.events === 'object' ? { ...m.events } : {},
  })) : []
  bumpIdSeq(pd._models)
  pd._modelsSelectedId = null
  renderModelsList(pd)
}

