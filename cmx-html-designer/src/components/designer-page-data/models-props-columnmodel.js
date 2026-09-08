/**
 * CmxColumnModel 属性设置面板
 *
 * 列/列组定义：
 *   - columns: CmxColumn[]（id/caption/dataType/edit/display/width/frozen/visible/agg）
 *   - columnGroups: CmxColumnGroup[]（id/caption/members/aggregate/aggregatePosition）
 *
 * UI 复用弹性组合字段表/Property schema；列对象直接使用 id/name/caption，
 * 保存时只回写到 CmxColumn / CmxColumnGroup。
 */
import {
  deepClone,
  createFieldClipboardPayload,
  fieldId,
  makeFlcAdapter,
  readFieldClipboard,
  renderFieldPanel,
  renderFieldTable,
  writeFieldClipboard,
} from 'cmx-data-comp'
import { loadCodeMirrorJsonBundle } from '../../lib/codemirror-loader.js'
import { cmxCodeMirrorExtensions } from '../../utils/codemirror-theme.js'
import { esc, escAttr } from '../../utils/esc.js'

export function buildColumnModelProps ({
  instance,
  mount,
  onChange,
  selectedColumnPath = '',
  onSelectColumn = () => {},
}) {
  destroyJsonEditor(mount)
  const p = instance.props || (instance.props = {})
  normalizeColumnModelProps(p)
  const adapter = makeFlcAdapter()
  const initialTab = mount.__cmColumnModelActiveTab === 'json' ? 'json' : 'definition'
  let currentSelectedColumnPath = selectedColumnPath

  mount.innerHTML = `
    <div class="props-header">
      <span class="props-type-badge" data-kind="columnmodel">CmxColumnModel</span>
    </div>

    <div class="cm-model-tabs" role="tablist" aria-label="CmxColumnModel 列定义">
      <button class="cm-model-tab-btn ${initialTab === 'definition' ? 'active' : ''}" type="button" role="tab" aria-selected="${initialTab === 'definition'}" data-cm-tab="definition">定义</button>
      <button class="cm-model-tab-btn ${initialTab === 'json' ? 'active' : ''}" type="button" role="tab" aria-selected="${initialTab === 'json'}" data-cm-tab="json">JSON</button>
    </div>

    <div class="cm-model-tab-pane ${initialTab === 'definition' ? 'active' : ''}" data-cm-pane="definition">
      <div class="cols-toolbar">
        <span class="prop-section-title" style="margin:0">列定义</span>
        <div class="cm-field-toolbar-actions">
          <button class="cm-toolbar-icon-btn" id="cm-copy-fields" type="button" title="复制列和列组" aria-label="复制列和列组"><ui5-icon name="copy"></ui5-icon></button>
          <button class="cm-toolbar-icon-btn" id="cm-paste-fields" type="button" title="从剪贴板粘贴列和列组" aria-label="从剪贴板粘贴列和列组"><ui5-icon name="paste"></ui5-icon></button>
          <button class="cm-toolbar-icon-btn" id="cm-add-field" type="button" title="添加列" aria-label="添加列"><ui5-icon name="add"></ui5-icon></button>
        </div>
      </div>
      <div id="cm-fields-host" class="cm-fields-host"></div>
      <div id="cm-field-detail-host" class="cm-field-detail-host"></div>

      <div class="cols-toolbar" style="margin-top:10px">
        <span class="prop-section-title" style="margin:0">列组（CmxColumnGroup）</span>
        <button class="prop-add-btn" id="cm-add-group" style="margin:0">+ 添加列组</button>
      </div>
      <div id="cm-groups-host"></div>
    </div>

    <div class="cm-model-tab-pane ${initialTab === 'json' ? 'active' : ''}" data-cm-pane="json">
      <div class="cm-json-toolbar">
        <span class="prop-section-title" style="margin:0">columns / columnGroups</span>
        <div class="cm-field-toolbar-actions">
          <button class="cm-toolbar-icon-btn" id="cm-json-refresh" type="button" title="从当前定义刷新 JSON" aria-label="从当前定义刷新 JSON"><ui5-icon name="refresh"></ui5-icon></button>
          <button class="cm-toolbar-icon-btn" id="cm-json-format" type="button" title="格式化 JSON" aria-label="格式化 JSON"><ui5-icon name="source-code"></ui5-icon></button>
          <button class="cm-toolbar-icon-btn" id="cm-json-apply" type="button" title="应用 JSON" aria-label="应用 JSON"><ui5-icon name="accept"></ui5-icon></button>
        </div>
      </div>
      <div id="cm-json-cm-host" class="cm-json-cm-host" aria-label="CmxColumnModel JSON 源码"></div>
      <textarea id="cm-json-editor" class="cm-json-editor" spellcheck="false" aria-label="CmxColumnModel JSON 源码" hidden></textarea>
      <div id="cm-json-status" class="cm-json-status"></div>
    </div>
  `

  const commit = (rerender = false) => {
    onChange()
    if (rerender) renderAll()
  }

  const selectField = (fieldName, rerender = true) => {
    const field = (p.columns || []).find((f) => columnId(f) === fieldName) || null
    if (!field) return
    currentSelectedColumnPath = fieldName
    onSelectColumn({ column: field, path: fieldName, model: instance })
    if (rerender) renderAll()
    else renderFieldDetail()
  }

  const fieldCtx = () => ({
    end: 'FLC',
    dimensionCodes: (p.columns || []).filter((f) => f.dimType === 'dimension').map((f) => f.refDict || columnId(f)).filter(Boolean),
    attrOptions: (field, which) => attrsOfDimension(p, which === 'defaultFrom' ? field?.defaultFrom?.dimension : field?.source?.dimension),
    refDictOptions: () => ['', ...(p.columns || []).filter((f) => f.dimType === 'dimension').map((f) => f.refDict || columnId(f)).filter(Boolean)],
    refFieldOptions: (field) => attrsOfDimension(p, field?.refDict),
  })

  function renderAll () {
    renderFields()
    renderFieldDetail()
    renderGroups()
    renderJson()
    if (mount.__cmColumnModelActiveTab === 'json') void initJsonEditor()
  }

  function renderFields () {
    const host = mount.querySelector('#cm-fields-host')
    if (!host) return
    const columns = Array.isArray(p.columns) ? p.columns : []
    columns.forEach(normalizeColumn)
    if (!columns.length) {
      host.innerHTML = '<div class="models-props-empty">当前还没有列，点击上方按钮添加。</div>'
      return
    }
    const rows = columns.map(columnToContextField)
    host.innerHTML = renderFieldTable(rows, {
      end: 'FLC',
      adapter,
      ctx: fieldCtx(),
      keyOf: (f) => fieldId(f),
      selectedKey: currentSelectedColumnPath,
      actions: { detail: true, remove: true, move: true },
    })
  }

  function renderFieldDetail () {
    const host = mount.querySelector('#cm-field-detail-host')
    if (!host) return
    const selected = currentSelectedColumnPath
      ? (p.columns || []).find((f) => columnId(f) === currentSelectedColumnPath)
      : null
    if (!selected) {
      host.innerHTML = '<div class="models-props-empty">选择一列后可编辑录入控件的详细属性。</div>'
      return
    }
    const draft = columnToContextField(selected)
    host.innerHTML = `
      <div class="cols-toolbar" style="margin-top:10px">
        <span class="prop-section-title" style="margin:0">列属性 · ${escHtml(columnId(selected))}</span>
      </div>
      <div class="cm-field-detail-panel">
        ${renderFieldPanel(draft, {
          end: 'FLC',
          adapter,
          ctx: fieldCtx(),
          keyOf: (f) => fieldId(f),
        })}
      </div>
    `
  }

  function renderGroups () {
    const host = mount.querySelector('#cm-groups-host')
    if (!host) return
    const groups = Array.isArray(p.columnGroups) ? p.columnGroups : []
    if (!groups.length) {
      host.innerHTML = '<div class="models-props-empty">未定义列组；运行时所有列平铺为顶层列。点击上方按钮新增列组。</div>'
      return
    }
    const allFieldCodes = (p.columns || []).map(columnId).filter(Boolean)
    host.innerHTML = `<div class="cm-groups-wrap">${groups.map((g, i) => renderGroupNode(g, String(i), allFieldCodes)).join('')}</div>`
  }

  function renderJson () {
    if (mount.__cmColumnJsonView?.hasFocus) return
    setJsonText(columnModelJsonText(p))
  }

  renderAll()

  mount.onclick = (e) => {
    const t = e.target instanceof Element ? e.target.closest('[data-action],[data-cm-tab],#cm-add-field,#cm-add-group,#cm-copy-fields,#cm-paste-fields,#cm-json-refresh,#cm-json-format,#cm-json-apply') : null
    if (!t) return
    e.preventDefault()
    const action = t.dataset.action || t.id
    if (t.dataset.cmTab) {
      switchTab(t.dataset.cmTab)
      return
    }
    if (action === 'select-field' && e.target instanceof Element && e.target.closest('input,select,textarea')) return
    if (action === 'cm-add-field') addField()
    if (action === 'cm-add-group') addGroup()
    if (action === 'cm-copy-fields') void copyFields()
    if (action === 'cm-paste-fields') void pasteFields()
    if (action === 'cm-json-refresh') refreshJson()
    if (action === 'cm-json-format') formatJson()
    if (action === 'cm-json-apply') applyJson()
    if (action === 'select-field') selectField(t.dataset.fieldKey || '', false)
    if (action === 'remove-field') removeField(t.dataset.fieldKey || '')
    if (action === 'move-field-up') moveField(t.dataset.fieldKey || '', -1)
    if (action === 'move-field-down') moveField(t.dataset.fieldKey || '', 1)
    if (action === 'add-subgroup') addSubgroup(t.dataset.path || '')
    if (action === 'remove-group') removeGroup(t.dataset.path || '')
    if (action === 'group-remove-member') groupRemoveMember(t.dataset.path || '', t.dataset.member || '')
    if (action === 'add-enum') addEnum()
    if (action === 'remove-enum') removeEnum(Number(t.dataset.index))
    if (action === 'show-field-tips') {
      const root = t.getRootNode()
      const text = t.dataset.fieldTips || ''
      let pop = root.querySelector('#cmx-field-tips-popover')
      if (!pop) {
        pop = document.createElement('ui5-popover')
        pop.id = 'cmx-field-tips-popover'
        pop.setAttribute('placement', 'Bottom')
        pop.style.maxWidth = '380px'
        const body = document.createElement('div')
        body.className = 'cmx-field-tips-body'
        pop.appendChild(body)
        root.appendChild(pop)
      }
      pop.querySelector('.cmx-field-tips-body').textContent = text
      pop.opener = t
      pop.open = true
    }
  }

  mount.oninput = (e) => {
    const t = e.target
    if (!(t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement)) return
    if (t.dataset.fieldKey && t.dataset.fieldProp) {
      updateFieldByKey(t.dataset.fieldKey, t.dataset.fieldProp, inputRawValue(t), t.dataset.valueType)
      return
    }
    if (t.dataset.fieldPath) {
      updateSelectedFieldPath(t.dataset.fieldPath, inputRawValue(t), t.dataset.valueType)
      return
    }
    if (t.dataset.groupPath && t.dataset.groupProp) {
      updateGroup(t.dataset.groupPath, t.dataset.groupProp, inputRawValue(t), t.dataset.valueType || 'string')
      return
    }
    if (t.dataset.groupAddSelect != null && t.value) {
      groupAddField(t.dataset.groupAddSelect, t.value)
    }
  }
  // select 切换录入控件(edit.mode)时强制重渲染详编面板，让「录入控件属性」分区跟随新 mode。
  // 对齐定义中心 handlePanelChange 的做法（edit.mode 变化触发 emitState 重渲染）。
  mount.onchange = (e) => {
    const t = e.target
    if (!(t instanceof HTMLSelectElement)) return
    if (t.dataset.fieldPath === 'edit.mode') renderFieldDetail()
  }

  async function copyFields () {
    try {
      await writeFieldClipboard(createFieldClipboardPayload({
        source: 'CMXHTMLDesigner.CmxColumnModel',
        fields: (p.columns || []).map(columnToContextField),
        groups: p.columnGroups || [],
      }))
    } catch (err) {
      window.alert(`复制失败：${err?.message || err}`)
    }
  }

  async function pasteFields () {
    try {
      const payload = await readFieldClipboard()
      p.columns = (payload.fields || []).map(contextFieldToColumn)
      p.columnGroups = (payload.groups || []).map(contextGroupToColumnGroup)
      delete p.fields
      delete p.groups
      commit(true)
      const first = columnId(p.columns[0])
      if (first) selectField(first, false)
    } catch (err) {
      window.alert(`粘贴失败：${err?.message || err}`)
    }
  }

  function addField () {
    p.columns = Array.isArray(p.columns) ? p.columns : []
    const fieldName = uniqueCode('column', p.columns.map(columnId))
    const curIdx = p.columns.findIndex((f) => columnId(f) === currentSelectedColumnPath)
    const cur = curIdx >= 0 ? p.columns[curIdx] : null
    const field = cur
      ? { ...deepClone(cur), id: fieldName }
      : newColumn(fieldName)
    normalizeColumn(field)
    if (curIdx >= 0) p.columns.splice(curIdx + 1, 0, field)
    else p.columns.push(field)
    commit(true)
    selectField(fieldName, false)
  }

  function removeField (fieldName) {
    if (!fieldName || !window.confirm(`确定删除列「${fieldName}」？`)) return
    p.columns = (p.columns || []).filter((f) => columnId(f) !== fieldName)
    removeFieldFromGroups(p.columnGroups || [], fieldName)
    commit(true)
  }

  function moveField (fieldName, dir) {
    const fields = p.columns || []
    const i = fields.findIndex((f) => columnId(f) === fieldName)
    const j = i + dir
    if (i < 0 || j < 0 || j >= fields.length) return
    ;[fields[i], fields[j]] = [fields[j], fields[i]]
    commit(true)
  }

  function updateFieldByKey (fieldName, key, rawValue, valueType) {
    const fields = p.columns || []
    const field = fields.find((f) => columnId(f) === fieldName)
    if (!field) return
    if (key === 'id') {
      const next = safeCode(rawValue)
      if (!next || next === fieldName || fields.some((f) => columnId(f) === next)) return
      field.id = next
      renameFieldInGroups(p.columnGroups || [], fieldName, next)
      normalizeColumn(field)
      currentSelectedColumnPath = next
      updateRenderedFieldKey(fieldName, next)
      commit(false)
      onSelectColumn({ column: field, path: next, model: instance })
      return
    }
    const draft = columnToContextField(field)
    let res
    if (key.startsWith('enumValues.')) {
      // enumValues.* 数组点路径：适配器 setPath 不支持数组下标，走专用写入
      writeFieldPath(draft, key, rawValue)
      res = { relayout: true }
    } else {
      res = adapter.set(draft, key, rawValue, valueType)
    }
    applyContextFieldToColumn(field, draft)
    commit(!!res?.relayout)
  }

  /** 通用点路径写入（供 enumValues.* 等数组路径用）。适配器 setPath 不支持数组下标，故单独实现。 */
  function writeFieldPath (field, path, rawValue) {
    const segs = path.split('.')
    const leaf = segs.pop()
    let node = field
    for (let si = 0; si < segs.length; si++) {
      const seg = segs[si]
      const k = /^\d+$/.test(seg) ? Number(seg) : seg
      const nextIsNum = /^\d+$/.test(segs[si + 1] || '')
      if (node[k] == null || typeof node[k] !== 'object') node[k] = nextIsNum ? [] : {}
      node = node[k]
    }
    const leafKey = /^\d+$/.test(leaf) ? Number(leaf) : leaf
    if (rawValue === '' || rawValue == null) {
      if (Array.isArray(node)) node.splice(Number(leafKey), 1)
      else delete node[leafKey]
    } else {
      node[leafKey] = rawValue
    }
  }

  function addEnum () {
    if (!currentSelectedColumnPath) return
    const field = (p.columns || []).find((f) => columnId(f) === currentSelectedColumnPath)
    if (!field) return
    const draft = columnToContextField(field)
    draft.enumValues = Array.isArray(draft.enumValues) ? draft.enumValues : []
    draft.enumValues.push({ value: '', label: '' })
    applyContextFieldToColumn(field, draft)
    commit(true)
  }

  function removeEnum (index) {
    if (!currentSelectedColumnPath) return
    const field = (p.columns || []).find((f) => columnId(f) === currentSelectedColumnPath)
    if (!field || !Array.isArray(field.enumValues)) return
    if (!window.confirm('确定删除该枚举项？')) return
    const draft = columnToContextField(field)
    draft.enumValues.splice(index, 1)
    if (!draft.enumValues.length) delete draft.enumValues
    applyContextFieldToColumn(field, draft)
    commit(true)
  }

  function updateRenderedFieldKey (oldKey, nextKey) {
    const host = mount.querySelector('#cm-fields-host')
    if (!host) return
    host.querySelectorAll(`[data-field-key="${cssEscape(oldKey)}"]`).forEach((el) => {
      if (el instanceof HTMLElement) el.dataset.fieldKey = nextKey
    })
  }

  function updateSelectedFieldPath (key, rawValue, valueType) {
    if (!currentSelectedColumnPath) return
    updateFieldByKey(currentSelectedColumnPath, key, rawValue, valueType)
  }

  function addGroup () {
    p.columnGroups = Array.isArray(p.columnGroups) ? p.columnGroups : []
    p.columnGroups.push({ __type: 'group', caption: '新列组', members: [] })
    commit(true)
  }

  function removeGroup (path) {
    if (!window.confirm('确定删除该列组？组内列不会被删除，仅解除列组。')) return
    const segs = String(path).split('.').filter(Boolean)
    const idx = Number(segs.pop())
    const parent = segs.length ? groupNodeAt(segs.join('.')) : { members: p.columnGroups }
    if (parent && Array.isArray(parent.members)) parent.members.splice(idx, 1)
    if (Array.isArray(p.columnGroups) && !p.columnGroups.length) delete p.columnGroups
    commit(true)
  }

  function addSubgroup (path) {
    const node = groupNodeAt(path)
    if (!node) return
    node.members = Array.isArray(node.members) ? node.members : []
    node.members.push({ __type: 'group', caption: '子列组', members: [] })
    commit(true)
  }

  function groupAddField (path, fieldName) {
    const node = groupNodeAt(path)
    if (!node || !fieldName) return
    node.members = Array.isArray(node.members) ? node.members : []
    if (!node.members.includes(fieldName)) node.members.push(fieldName)
    commit(true)
  }

  function groupRemoveMember (path, member) {
    const node = groupNodeAt(path)
    if (!node || !Array.isArray(node.members)) return
    const idx = node.members.findIndex((m) => (typeof m === 'string' ? m : '') === member)
    if (idx < 0) return
    if (!window.confirm(`确定将列「${member}」移出该列组？`)) return
    node.members.splice(idx, 1)
    commit(true)
  }

  function updateGroup (path, prop, rawValue, valueType) {
    const node = groupNodeAt(path)
    if (!node) return
    const value = coerceValue(rawValue, valueType)
    if (prop.startsWith('aggregate.')) {
      const aggKey = prop.slice('aggregate.'.length)
      node.aggregate = node.aggregate && typeof node.aggregate === 'object' ? node.aggregate : {}
      if (value === true) node.aggregate[aggKey] = true
      else delete node.aggregate[aggKey]
      if (!Object.keys(node.aggregate).length) delete node.aggregate
    } else if (value === '' || value == null) {
      delete node[prop]
    } else {
      node[prop] = value
    }
    commit(false)
  }

  function groupNodeAt (path) {
    if (!Array.isArray(p.columnGroups)) return null
    const segs = String(path).split('.').filter(Boolean)
    let node = { members: p.columnGroups }
    for (const seg of segs) {
      if (seg === 'members') { node = { members: node.members }; continue }
      node = (node.members || [])[Number(seg)]
      if (node == null) return null
    }
    return node
  }

  function switchTab (tab) {
    if (tab !== 'definition' && tab !== 'json') return
    mount.__cmColumnModelActiveTab = tab
    mount.querySelectorAll('[data-cm-tab]').forEach((btn) => {
      const active = btn.dataset.cmTab === tab
      btn.classList.toggle('active', active)
      btn.setAttribute('aria-selected', active ? 'true' : 'false')
    })
    mount.querySelectorAll('[data-cm-pane]').forEach((pane) => {
      pane.classList.toggle('active', pane.dataset.cmPane === tab)
    })
    if (tab === 'json') refreshJson('')
  }

  function refreshJson (message = '已从当前定义刷新 JSON') {
    setJsonText(columnModelJsonText(p))
    void initJsonEditor()
    setJsonStatus(message, message ? 'ok' : '')
  }

  function formatJson () {
    try {
      setJsonText(JSON.stringify(JSON.parse(getJsonText() || '{}'), null, 2))
      setJsonStatus('JSON 已格式化', 'ok')
    } catch (err) {
      setJsonStatus(`JSON 解析失败：${err?.message || err}`, 'err')
    }
  }

  function applyJson () {
    try {
      const parsed = JSON.parse(getJsonText() || '{}')
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('根节点必须是对象')
      const columns = parsed.columns
      const columnGroups = parsed.columnGroups ?? parsed.groups ?? []
      if (columns != null && !Array.isArray(columns)) throw new Error('columns 必须是数组')
      if (columnGroups != null && !Array.isArray(columnGroups)) throw new Error('columnGroups 必须是数组')
      p.columns = (columns || []).map(contextFieldToColumn)
      p.columnGroups = (columnGroups || []).map(contextGroupToColumnGroup)
      delete p.fields
      delete p.groups
      normalizeColumnModelProps(p)
      setJsonText(columnModelJsonText(p))
      setJsonStatus('JSON 已应用到列定义和列组定义', 'ok')
      commit(true)
      const first = columnId(p.columns[0])
      if (first) selectField(first, false)
    } catch (err) {
      setJsonStatus(`JSON 应用失败：${err?.message || err}`, 'err')
    }
  }

  function setJsonStatus (message, tone = '') {
    const status = mount.querySelector('#cm-json-status')
    if (!status) return
    status.textContent = message || ''
    status.dataset.tone = tone || ''
  }

  function getJsonText () {
    const view = mount.__cmColumnJsonView
    if (view) return view.state.doc.toString()
    const editor = mount.querySelector('#cm-json-editor')
    return editor instanceof HTMLTextAreaElement ? editor.value : ''
  }

  function setJsonText (text) {
    const view = mount.__cmColumnJsonView
    if (view) {
      const doc = view.state.doc
      view.dispatch({ changes: { from: 0, to: doc.length, insert: text } })
      return
    }
    const editor = mount.querySelector('#cm-json-editor')
    if (editor instanceof HTMLTextAreaElement) editor.value = text
  }

  async function initJsonEditor () {
    if (mount.__cmColumnJsonView || mount.__cmColumnJsonLoading) return
    const host = mount.querySelector('#cm-json-cm-host')
    if (!(host instanceof HTMLElement)) return
    mount.__cmColumnJsonLoading = true
    try {
      const cm = await loadCodeMirrorJsonBundle()
      if (!host.isConnected || mount.__cmColumnJsonView) return
      const { EditorView, basicSetup, EditorState, json, oneDark } = cm
      const view = new EditorView({
        parent: host,
        state: EditorState.create({
          doc: getJsonText() || columnModelJsonText(p),
          extensions: [
            basicSetup,
            json(),
            ...cmxCodeMirrorExtensions(EditorView, oneDark),
            EditorView.lineWrapping,
          ],
        }),
      })
      mount.__cmColumnJsonView = view
      const editor = mount.querySelector('#cm-json-editor')
      if (editor instanceof HTMLTextAreaElement) editor.hidden = true
    } catch {
      const editor = mount.querySelector('#cm-json-editor')
      if (editor instanceof HTMLTextAreaElement) editor.hidden = false
    } finally {
      mount.__cmColumnJsonLoading = false
    }
  }
}

function destroyJsonEditor (mount) {
  if (!mount?.__cmColumnJsonView) return
  try { mount.__cmColumnJsonView.destroy() } catch { /* noop */ }
  mount.__cmColumnJsonView = null
  mount.__cmColumnJsonLoading = false
}

function columnModelJsonText (p) {
  return JSON.stringify({
    columns: (Array.isArray(p.columns) ? p.columns : []).map(columnForJson),
    columnGroups: (Array.isArray(p.columnGroups) ? p.columnGroups : []).map(columnGroupForJson),
  }, null, 2)
}

function columnForJson (column) {
  const clone = deepClone(column || {})
  normalizeColumn(clone)
  delete clone.fieldName
  delete clone.fieldComment
  delete clone.label
  delete clone.align
  delete clone.type
  delete clone.editMode
  delete clone.column
  delete clone.children
  delete clone.members
  delete clone.__type
  return clone
}

function columnGroupForJson (group) {
  return contextGroupToColumnGroup(group)
}

function renderGroupNode (node, path, allFieldCodes) {
  const members = Array.isArray(node.members) ? node.members : []
  const fieldMembers = members.filter((m) => typeof m === 'string')
  const subGroups = members.map((m, idx) => ({ m, idx })).filter((x) => x.m && typeof x.m === 'object')
  const agg = node.aggregate && typeof node.aggregate === 'object' ? node.aggregate : {}
  const usedCodes = new Set(fieldMembers)
  const addable = allFieldCodes.filter((c) => !usedCodes.has(c))
  const aggCheckbox = (k, label) => `<label><input type="checkbox" data-group-path="${escAttr(path)}" data-group-prop="aggregate.${k}" data-value-type="boolean" ${agg[k] ? 'checked' : ''}>${label}</label>`
  return `<div class="grp">
    <div class="grp-head">
      <input style="flex:1" data-group-path="${escAttr(path)}" data-group-prop="caption" value="${escAttr(node.caption || '')}" placeholder="列组标题">
      ${selectHtml(`data-group-path="${escAttr(path)}" data-group-prop="aggregatePosition"`, node.aggregatePosition || '', ['', 'before', 'after'])}
      <button class="icon-btn" data-action="add-subgroup" data-path="${escAttr(path)}" title="加子分组"><ui5-icon name="add"></ui5-icon></button>
      <button class="icon-btn danger" data-action="remove-group" data-path="${escAttr(path)}" title="删除"><ui5-icon name="delete"></ui5-icon></button>
    </div>
    <div class="agg-row">聚合：${aggCheckbox('sum', '合计')}${aggCheckbox('avg', '平均')}${aggCheckbox('max', '最大')}${aggCheckbox('min', '最小')}${aggCheckbox('count', '计数')}</div>
    <div class="grp-members">
      ${fieldMembers.map((code) => `<span class="chip">${esc(code)}<button data-action="group-remove-member" data-path="${escAttr(path)}" data-member="${escAttr(code)}">×</button></span>`).join('') || '<span class="item-sub">无列</span>'}
    </div>
    ${addable.length ? renderGroupAddRow(path, addable) : ''}
    ${subGroups.map((x) => renderGroupNode(x.m, `${path}.members.${x.idx}`, allFieldCodes)).join('')}
  </div>`
}

function renderGroupAddRow (path, addable) {
  return `<div style="margin-top:4px;display:flex;gap:4px;align-items:center">
    <select data-group-add-select="${escAttr(path)}" style="flex:1">
      <option value="">+ 加入列…</option>
      ${addable.map((c) => `<option value="${escAttr(c)}">${esc(c)}</option>`).join('')}
    </select>
  </div>`
}

function normalizeColumnModelProps (p) {
  if (Array.isArray(p.fields)) {
    p.columns = p.fields.map(contextFieldToColumn)
    p.columnGroups = Array.isArray(p.groups) ? p.groups.map(contextGroupToColumnGroup) : []
    delete p.fields
    delete p.groups
  } else if (!Array.isArray(p.columnGroups)) {
    const converted = legacyColumnsToColumnModel(p.columns || [])
    p.columns = converted.columns
    p.columnGroups = converted.columnGroups
  }
  p.columns = (Array.isArray(p.columns) ? p.columns : []).filter((c) => c && !isGroupNode(c)).map(normalizeColumn)
  p.columnGroups = (Array.isArray(p.columnGroups) ? p.columnGroups : []).map(contextGroupToColumnGroup)
}

function legacyColumnsToColumnModel (nodes) {
  const columns = []
  const columnGroups = []
  const walk = (nodes, outGroups, inGroup = false) => {
    for (const item of nodes || []) {
      if (!item) continue
      if (isGroupNode(item)) {
        const group = {
          __type: 'group',
          id: item.id || '',
          caption: item.caption || item.id || '',
          members: [],
        }
        if (item.aggregate && typeof item.aggregate === 'object') group.aggregate = deepClone(item.aggregate)
        if (item.aggregatePosition) group.aggregatePosition = item.aggregatePosition
        outGroups.push(group)
        walk(item.children || item.members || [], group.members, true)
      } else {
        const col = contextFieldToColumn(item)
        columns.push(col)
        if (inGroup) outGroups.push(columnId(col))
      }
    }
  }
  walk(nodes, columnGroups, false)
  return { columns, columnGroups }
}

function contextFieldToColumn (field) {
  const src = deepClone(field || {})
  const id = src.id || ''
  const column = {
    ...src,   // 扁平 key（width/frozen/visible/agg/display/edit…）直接展开
    id,
    caption: src.caption || { zh_CN: id },
    edit: { ...(src.edit || {}) },
    display: { ...(src.display || {}) },
    dataType: src.dataType || 'VARCHAR',
  }
  normalizeColumn(column)
  delete column.label
  delete column.align
  delete column.type
  delete column.editMode
  delete column.children
  delete column.members
  delete column.__type
  return column
}

function contextGroupToColumnGroup (group) {
  const g = deepClone(group || {})
  g.__type = 'group'
  g.id = g.id || ''
  g.caption = g.caption || g.id || ''
  g.members = (Array.isArray(g.members) ? g.members : []).map((m) => {
    if (typeof m === 'string') return m
    if (m && typeof m === 'object' && isGroupNode(m)) return contextGroupToColumnGroup(m)
    if (m && typeof m === 'object') return columnId(contextFieldToColumn(m))
    return ''
  }).filter(Boolean)
  return g
}

function columnToContextField (column) {
  normalizeColumn(column)
  // 扁平 key（width/frozen/visible/agg）直接随列对象展开，schema 与适配器均按扁平路径读写。
  return {
    ...deepClone(column || {}),
    id: column.id || '',
    name: column.name || '',
    caption: column.caption && typeof column.caption === 'object' ? deepClone(column.caption) : { zh_CN: String(column.caption || column.id || '') },
    dataType: column.dataType || 'VARCHAR',
  }
}

function applyContextFieldToColumn (column, field) {
  const next = contextFieldToColumn(field)
  for (const key of Object.keys(column)) delete column[key]
  Object.assign(column, next)
  return column
}

function normalizeColumn (column) {
  if (!column || typeof column !== 'object') return column
  const id = column.id || ''
  column.id = id
  column.caption = column.caption || { zh_CN: id }
  column.dataType = column.dataType || 'VARCHAR'
  column.edit = column.edit && typeof column.edit === 'object' ? column.edit : {}
  column.display = column.display && typeof column.display === 'object' ? column.display : {}
  if (column.edit.required != null) column.required = column.edit.required
  if (column.display.decimalDigits != null) column.decimalDigits = column.display.decimalDigits
  delete column.label
  delete column.align
  delete column.type
  delete column.editMode
  return column
}

function attrsOfDimension (p, dimCode) {
  if (!dimCode) return ['']
  const dim = (p.columns || []).find((f) => columnId(f) === dimCode || f.refDict === dimCode)
  const attrs = Array.isArray(dim?.attributes) ? dim.attributes : Object.keys(dim?.attributes || {})
  return ['', ...attrs]
}

function isGroupNode (item) {
  return item && (item.__type === 'group' || Array.isArray(item.children) || Array.isArray(item.members))
}

function columnId (column) {
  return column?.id || ''
}

function renameFieldInGroups (groups, oldName, newName) {
  for (const group of groups || []) {
    if (!group || !Array.isArray(group.members)) continue
    group.members = group.members.map((m) => typeof m === 'string' ? (m === oldName ? newName : m) : m)
    renameFieldInGroups(group.members.filter((m) => m && typeof m === 'object'), oldName, newName)
  }
}

function removeFieldFromGroups (groups, fieldName) {
  for (const group of groups || []) {
    if (!group || !Array.isArray(group.members)) continue
    group.members = group.members.filter((m) => !(typeof m === 'string' && m === fieldName))
    removeFieldFromGroups(group.members.filter((m) => m && typeof m === 'object'), fieldName)
  }
}

function inputRawValue (el) {
  if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) return el.checked
  return el.value
}

function coerceValue (raw, valueType) {
  if (valueType === 'number') {
    if (raw === '' || raw == null) return ''
    const n = Number(raw)
    return Number.isFinite(n) ? n : ''
  }
  if (valueType === 'boolean') return raw === true || raw === 'true' || raw === 'on'
  if (valueType === 'boolean-visible') return raw === true || raw === 'true' || raw === 'on' ? '' : false
  if (valueType === 'list') return String(raw || '').split(',').map((x) => x.trim()).filter(Boolean)
  return raw
}

function newColumn (id) {
  return normalizeColumn({ id, name: '', caption: { zh_CN: '新列' }, dataType: 'VARCHAR', edit: { mode: 'cmx-text-input' }, display: { mode: 'text' } })
}

function selectHtml (attrs, value, options) {
  return `<select ${attrs}>${options.map((opt) => {
    const v = String(opt)
    return `<option value="${escAttr(v)}" ${v === String(value || '') ? 'selected' : ''}>${esc(v || '-')}</option>`
  }).join('')}</select>`
}

function safeCode (value) {
  return String(value || '').trim().replace(/[^\w-]/g, '_')
}

function uniqueCode (base, existing) {
  const taken = new Set((existing || []).filter(Boolean))
  let i = 1
  let code = base
  while (taken.has(code)) code = `${base}${++i}`
  return code
}

const cssEscape = (s) => (globalThis.CSS && typeof globalThis.CSS.escape === 'function')
  ? globalThis.CSS.escape(String(s ?? ''))
  : String(s ?? '').replace(/["\\\]]/g, '\\$&')
