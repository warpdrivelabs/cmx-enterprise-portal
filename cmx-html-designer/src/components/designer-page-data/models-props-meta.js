import { loadCodeMirrorJsBundle } from '../../lib/codemirror-loader.js'
import { cmxCodeMirrorExtensions } from '../../utils/codemirror-theme.js'
import { esc } from '../../utils/esc.js'


export function buildMetaModelProps({ instance, mount, onChange }) {
  const props = instance.props || (instance.props = {})
  if (!props.json) props.json = {}
  if (!props.baseMeta) props.baseMeta = {}
  if (props.apiPath == null) props.apiPath = '/api/definitions/config'
  if (props.baseApiPath == null) props.baseApiPath = '/api/definitions/config'
  if (props.autoLoad == null) props.autoLoad = false

  const stats = summarize(instance.modelType, props)
  mount.innerHTML = `
    <div class="props-section-title">
      <span class="props-type-badge" data-kind="meta">${esc(instance.modelType === 'CmxDCTMeta' ? '字典元模型' : '单据元模型')}</span>
      <span>${esc(instance.instanceId || instance.modelType)}</span>
    </div>
    <div class="models-props-empty" style="text-align:left">
      ${esc(stats.tablesLabel)}：${stats.tables}；字段集：${stats.fieldSets}；内联字段：${stats.inlineFields}
    </div>
    <div class="props-grid" style="padding:0.35rem 0.5rem">
      ${renderInput('id', '元数据标识', props.id || props.metaId || '', '单据填模块编码（如 cmxfico），字典填字典编码（如 gl_account）')}
      ${renderInput('domain', '业务域', props.domain || '', '可选，如 fi')}
      ${renderInput('application', '应用', props.application || props.app || '', '可选，如 cmxfico')}
      ${renderInput('module', '模块', props.module || '', '可选，如 gl')}
      ${renderInput('apiPath', '元数据接口', props.apiPath, '/api/definitions/config')}
      ${renderInput('baseApiPath', '字段集接口', props.baseApiPath, '/api/definitions/config')}
      ${renderInput('serviceFn', '元数据服务函数', props.serviceFn || '', '可选：页面服务函数名')}
      ${renderInput('baseServiceFn', '字段集服务函数', props.baseServiceFn || '', '可选：页面服务函数名')}
      <label class="prop-row">
        <span>自动加载</span>
        <input type="checkbox" data-prop="autoLoad" ${props.autoLoad ? 'checked' : ''} />
      </label>
    </div>
    <div class="cm-model-tabs" role="tablist" aria-label="${esc(instance.modelType)} 元数据">
      <button class="cm-tab-btn active" data-tab="json">元数据 JSON</button>
      <button class="cm-tab-btn" data-tab="base">共享字段集 JSON</button>
    </div>
    <div class="cm-tab-pane active" data-pane="json">
      <div class="models-props-empty" style="text-align:left">粘贴后端返回的完整模块元数据 JSON。</div>
      <div id="meta-json-host" class="cm-json-cm-host" aria-label="元数据 JSON"></div>
    </div>
    <div class="cm-tab-pane" data-pane="base">
      <div class="models-props-empty" style="text-align:left">可选：粘贴共享字段集（base_meta / base_dct_meta / base_doc_meta 的 fieldSets）。运行时按引用共享访问。</div>
      <div id="meta-base-host" class="cm-json-cm-host" aria-label="共享字段集 JSON"></div>
    </div>
  `

  mount.querySelectorAll('[data-prop]').forEach((el) => {
    el.addEventListener('input', () => {
      const key = el.getAttribute('data-prop')
      if (!key) return
      props[key] = el.type === 'checkbox' ? !!el.checked : el.value
      if (key === 'id') {
        props.metaId = props.id
      }
      onChange?.()
    })
    el.addEventListener('change', () => {
      if (el.type !== 'checkbox') return
      const key = el.getAttribute('data-prop')
      props[key] = !!el.checked
      onChange?.()
    })
  })

  const tabBtns = [...mount.querySelectorAll('.cm-tab-btn')]
  const panes = [...mount.querySelectorAll('.cm-tab-pane')]
  tabBtns.forEach((btn) => btn.addEventListener('click', () => {
    const id = btn.dataset.tab
    tabBtns.forEach((b) => b.classList.toggle('active', b === btn))
    panes.forEach((p) => p.classList.toggle('active', p.dataset.pane === id))
  }))

  void createJsonEditor(mount.querySelector('#meta-json-host'), props.json, (value) => {
    props.json = value
    onChange?.()
  })
  void createJsonEditor(mount.querySelector('#meta-base-host'), props.baseMeta, (value) => {
    props.baseMeta = value
    onChange?.()
  })
}

async function createJsonEditor(host, value, onValue) {
  if (!host) return
  const { EditorView, EditorState, basicSetup, json, oneDark } = await loadCodeMirrorJsBundle()
  new EditorView({
    parent: host,
    state: EditorState.create({
      doc: JSON.stringify(value || {}, null, 2),
      extensions: [
        basicSetup,
        json(),
        ...cmxCodeMirrorExtensions(EditorView, oneDark),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return
          try {
            onValue(JSON.parse(update.state.doc.toString() || '{}'))
            host.classList.remove('cm-json-invalid')
          } catch (_) {
            host.classList.add('cm-json-invalid')
          }
        }),
      ],
    }),
  })
}

function summarize(modelType, props) {
  const json = props?.json && typeof props.json === 'object' ? props.json : {}
  const base = props?.baseMeta && typeof props.baseMeta === 'object' ? props.baseMeta : {}
  const tables = modelType === 'CmxDCTMeta'
    ? (Array.isArray(json.dictionaryTables) ? json.dictionaryTables.length : 0)
    : (Array.isArray(json.voucherTables) ? json.voucherTables.length : 0)
  const fieldSets = countFieldSets(json.fieldSets) + countFieldSets(base.fieldSets || base)
  const tableList = modelType === 'CmxDCTMeta' ? json.dictionaryTables : json.voucherTables
  const inlineFields = Array.isArray(tableList)
    ? tableList.reduce((sum, table) => sum + (Array.isArray(table.fields) ? table.fields.length : 0), 0)
    : 0
  return {
    tablesLabel: modelType === 'CmxDCTMeta' ? '字典表' : '单据表',
    tables,
    fieldSets,
    inlineFields,
  }
}

function countFieldSets(value) {
  if (Array.isArray(value)) return value.length
  if (value && typeof value === 'object') return Object.keys(value).length
  return 0
}

function renderInput(prop, label, value, placeholder = '') {
  return `
    <label class="prop-row">
      <span>${esc(label)}</span>
      <input type="text" data-prop="${esc(prop)}" value="${esc(value)}" placeholder="${esc(placeholder)}" />
    </label>
  `
}
