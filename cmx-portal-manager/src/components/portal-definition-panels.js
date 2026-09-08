/**
 * 定义中心的配套元素：源码视图 / Schema 视图 / 检查器 / 列表。
 *
 * 从 portal-definition-manager.js 拆出，依赖已抽到 lib/ 的 bus / helpers / version-stem，
 * 不反向依赖主类实现（主类通过 bus.controller 协议与面板解耦）。
 */
import '@ui5/webcomponents/dist/Input.js'
import { apiFetch } from 'cmx-ui5-runtime/api-client'
import { escAttr, escHtml } from '../lib/escape.js'
import { loadCodeMirrorJsonBundle, cmxJsonTheme, isDarkUi5Theme } from '../lib/codemirror-json.js'
import { buildHttpError, showDefError, showDefWarn } from '../lib/notify.js'
import { damOptionHtml } from '../lib/dam-options.js'
import { busFor } from '../lib/definition-bus.js'
import { ADM_PAGE_SIZE, ADM_ALL_CSS, admCountTitle, admEmptyHtml, admConfirm, admColorSchemeCss, admEntryDam } from '../lib/admin-ui-kit.js'
import {
  itemKey,
  isEditingEl,
  fetchDefinitionItemsForKind,
  isBaseDefKind,
  syncDefNeoHost,
  defBaseNeoStyleBlock,
} from '../lib/definition-helpers.js'
import {
  itemApplication,
  defFileParts,
  defItemVersion,
  defItemIsDefault,
  groupDefItemsByStem,
} from '../lib/version-stem.js'

// ════════════════════════════════════════════════════════════════════════
//  源码视图（content，CodeMirror）
// ════════════════════════════════════════════════════════════════════════

export class PortalDefinitionSource extends HTMLElement {
  constructor () {
    super()
    this.attachShadow({ mode: 'open' })
    this._kind = 'DCT'; this._bus = busFor('DCT')
    this._cm = null; this._cmHost = null; this._mode = 'pending'; this._initing = false; this._applyingRemote = false
    this._onTextareaInput = (e) => { const c = this._bus.controller; if (c) c.updateSourceText(e.target.value) }
    this._onState = () => this._syncText()
  }

  connectedCallback () {
    this._kind = (this.getAttribute('data-kind') || 'DCT').toUpperCase()
    syncDefNeoHost(this, this._kind)
    this._bus = busFor(this._kind, this.getAttribute('data-bus-scope') || '')
    this._renderShell()
    this._bus.addEventListener('state', this._onState)
    this._bus.addEventListener('controller', this._onState)
    void this._initEditor()
  }

  disconnectedCallback () {
    this._bus.removeEventListener('state', this._onState)
    this._bus.removeEventListener('controller', this._onState)
    if (this._cm) { try { this._cm.destroy() } catch { /* noop */ } this._cm = null }
  }

  _renderShell () {
    // eslint-disable-next-line no-restricted-syntax -- 静态外壳。
    this.shadowRoot.innerHTML = `<style>${defBaseNeoStyleBlock(this._kind)}:host{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--sapField_Background,#fff)}#cm-host{flex:1;min-height:0;overflow:auto}#cm-host .cm-editor{height:100%}textarea{flex:1;min-height:0;border:0;resize:none;outline:none;padding:12px;font:12px/1.5 ui-monospace,Menlo,Consolas,monospace;color:var(--sapTextColor,#1d2d3e);background:var(--sapField_Background,#fff);box-sizing:border-box}.empty{padding:16px;color:var(--sapContent_LabelColor,#6a6d70);font-size:13px}</style><div id="cm-host"></div>`
    this._cmHost = this.shadowRoot.getElementById('cm-host')
  }

  async _initEditor () {
    if (this._initing || this._cm) return
    const c = this._bus.controller
    if (!c) { this._renderEmpty(); return }
    this._initing = true
    try {
      const cm = await loadCodeMirrorJsonBundle()
      if (!this.isConnected || !this._cmHost || this._cm) return
      const ctrl = this._bus.controller
      if (!ctrl) { this._renderEmpty(); return }
      const { EditorView, EditorState, basicSetup, keymap, indentWithTab, json, oneDark } = cm
      const exts = [basicSetup, json(), keymap.of([indentWithTab]), cmxJsonTheme(EditorView),
        EditorView.updateListener.of((u) => { if (u.docChanged && !this._applyingRemote) { const cc = this._bus.controller; if (cc) cc.updateSourceText(u.state.doc.toString()) } })]
      if (isDarkUi5Theme()) exts.push(oneDark)
      this._cm = new EditorView({ parent: this._cmHost, root: this.shadowRoot, state: EditorState.create({ doc: ctrl.getSourceText(), extensions: exts }) })
      this._mode = 'cm'; this._syncText()
    } catch { this._renderTextarea() }
    finally { this._initing = false }
  }

  _renderTextarea () {
    const c = this._bus.controller; this._mode = 'textarea'
    // eslint-disable-next-line no-restricted-syntax -- 内容经 escHtml。
    this.shadowRoot.innerHTML = `<style>:host{display:flex;flex-direction:column;height:100%;min-height:0}textarea{flex:1;min-height:0;border:0;resize:none;outline:none;padding:12px;font:12px/1.5 ui-monospace,Menlo,Consolas,monospace;color:var(--sapTextColor,#1d2d3e);background:var(--sapField_Background,#fff);box-sizing:border-box}</style><textarea id="def-json" spellcheck="false">${escHtml(c ? c.getSourceText() : '')}</textarea>`
    const ta = this.shadowRoot.getElementById('def-json'); if (ta) ta.addEventListener('input', this._onTextareaInput)
  }

  _renderEmpty () {
    this._mode = 'pending'; this._cmHost = null
    // eslint-disable-next-line no-restricted-syntax -- 静态文案。
    this.shadowRoot.innerHTML = `<style>:host{display:block}.empty{padding:16px;color:var(--sapContent_LabelColor,#6a6d70);font-size:13px}</style><cmx-empty-state icon="document" title="请先在内容区打开定义文件" size="sm"></cmx-empty-state>`
  }

  _syncText () {
    const c = this._bus.controller
    if (!c) { if (this._cm) { try { this._cm.destroy() } catch { /* noop */ } this._cm = null } if (this._mode !== 'pending') this._renderEmpty(); return }
    if (this._mode === 'pending' || this._initing) { if (!this._cmHost) this._renderShell(); void this._initEditor(); return }
    if (this._mode === 'cm' && this._cm) {
      if (this._cm.hasFocus) return
      const next = c.getSourceText()
      if (next === this._cm.state.doc.toString()) return
      this._applyingRemote = true
      this._cm.dispatch({ changes: { from: 0, to: this._cm.state.doc.length, insert: next } })
      this._applyingRemote = false
      return
    }
    if (this._mode === 'textarea') {
      const ta = this.shadowRoot.getElementById('def-json')
      if (!(ta instanceof HTMLTextAreaElement) || this.shadowRoot.activeElement === ta) return
      ta.value = c.getSourceText()
    }
  }
}

if (!customElements.get('portal-definition-source')) customElements.define('portal-definition-source', PortalDefinitionSource)

// ════════════════════════════════════════════════════════════════════════
//  Schema 视图（content，只读 CodeMirror）
// ════════════════════════════════════════════════════════════════════════

export class PortalDefinitionSchema extends PortalDefinitionSource {
  _renderShell () {
    // eslint-disable-next-line no-restricted-syntax -- 纯静态外壳。
    this.shadowRoot.innerHTML = `<style>:host{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--sapField_Background,#fff)}#cm-host{flex:1;min-height:0;overflow:auto}#cm-host .cm-editor{height:100%}.empty{padding:16px;color:var(--sapContent_LabelColor,#6a6d70);font-size:13px}</style><div id="cm-host"></div>`
    this._cmHost = this.shadowRoot.getElementById('cm-host')
  }

  async _initEditor () {
    if (this._initing || this._cm) return
    const c = this._bus.controller
    if (!c) { this._renderEmpty(); return }
    this._initing = true
    try {
      const cm = await loadCodeMirrorJsonBundle()
      if (!this.isConnected || !this._cmHost || this._cm) return
      const ctrl = this._bus.controller
      if (!ctrl) { this._renderEmpty(); return }
      const { EditorView, EditorState, basicSetup, keymap, indentWithTab, json, oneDark } = cm
      const exts = [basicSetup, json(), keymap.of([indentWithTab]), cmxJsonTheme(EditorView), EditorView.editable.of(false)]
      if (isDarkUi5Theme()) exts.push(oneDark)
      this._cm = new EditorView({ parent: this._cmHost, root: this.shadowRoot, state: EditorState.create({ doc: ctrl.getSchemaText(), extensions: exts }) })
      this._mode = 'cm'; this._syncText()
    } catch { this._renderTextarea() }
    finally { this._initing = false }
  }

  _renderTextarea () {
    const c = this._bus.controller; this._mode = 'textarea'
    // eslint-disable-next-line no-restricted-syntax -- schema 文本经 escHtml。
    this.shadowRoot.innerHTML = `<style>:host{display:flex;flex-direction:column;height:100%;min-height:0}textarea{flex:1;min-height:0;border:0;resize:none;outline:none;padding:12px;font:12px/1.5 ui-monospace,Menlo,Consolas,monospace;color:var(--sapTextColor,#1d2d3e);background:var(--sapField_Background,#fff);box-sizing:border-box}</style><textarea id="def-json" spellcheck="false" readonly>${escHtml(c ? c.getSchemaText() : '')}</textarea>`
  }

  _syncText () {
    const c = this._bus.controller
    if (!c) { if (this._cm) { try { this._cm.destroy() } catch { /* noop */ } this._cm = null } if (this._mode !== 'pending') this._renderEmpty(); return }
    if (this._mode === 'pending' || this._initing) { if (!this._cmHost) this._renderShell(); void this._initEditor(); return }
    const next = c.getSchemaText()
    if (this._mode === 'cm' && this._cm) {
      if (next === this._cm.state.doc.toString()) return
      this._cm.dispatch({ changes: { from: 0, to: this._cm.state.doc.length, insert: next } })
      return
    }
    if (this._mode === 'textarea') {
      const ta = this.shadowRoot.getElementById('def-json')
      if (ta instanceof HTMLTextAreaElement) ta.value = next
    }
  }
}

if (!customElements.get('portal-definition-schema')) customElements.define('portal-definition-schema', PortalDefinitionSchema)

// ════════════════════════════════════════════════════════════════════════
//  检查器面板（property，薄壳委托 controller）
// ════════════════════════════════════════════════════════════════════════

export class PortalDefinitionInspector extends HTMLElement {
  constructor () {
    super()
    this.attachShadow({ mode: 'open' })
    this._kind = 'DCT'; this._bus = busFor('DCT'); this._wired = false
    this._onClick = (e) => { const c = this._bus.controller; if (c) c.handlePanelClick(e) }
    this._onInput = (e) => { const c = this._bus.controller; if (c) c.handlePanelInput(e) }
    this._onChange = (e) => { const c = this._bus.controller; if (c) c.handlePanelChange(e) }
    this._onState = (e) => { if (e?.detail?.force || !isEditingEl(this.shadowRoot)) this._render() }
  }

  connectedCallback () {
    this._kind = (this.getAttribute('data-kind') || 'DCT').toUpperCase()
    syncDefNeoHost(this, this._kind)
    this._bus = busFor(this._kind, this.getAttribute('data-bus-scope') || '')
    this._render()
    if (!this._wired) {
      this._wired = true
      this.shadowRoot.addEventListener('click', this._onClick)
      this.shadowRoot.addEventListener('input', this._onInput)
      this.shadowRoot.addEventListener('change', this._onChange)
    }
    this._bus.addEventListener('state', this._onState)
    this._bus.addEventListener('controller', this._onState)
  }

  disconnectedCallback () {
    this._bus.removeEventListener('state', this._onState)
    this._bus.removeEventListener('controller', this._onState)
    this.shadowRoot.removeEventListener('click', this._onClick)
    this.shadowRoot.removeEventListener('input', this._onInput)
    this.shadowRoot.removeEventListener('change', this._onChange)
    this._wired = false
  }

  _render () {
    const c = this._bus.controller
    // 上段：模块属性卡（原列表底栏属性表单迁入）；下段：字段检查器
    const propsTitle = isBaseDefKind(this._kind) ? '元数据属性' : (/DOC/.test(this._kind) ? '单据属性' : '字典属性')
    const props = c ? `<div class="inspect-body"><section class="section module-props"><h3>${propsTitle}</h3>${c.renderModulePropsHtml()}</section></div>` : ''
    const inner = c ? c.renderInspectorPanelHtml() : '<div class="inspect-body"><div class="item-sub">请先在内容区打开定义文件。</div></div>'
    // eslint-disable-next-line no-restricted-syntax -- 正文由 controller 输出，已转义。
    this.shadowRoot.innerHTML = `<style>${defBaseNeoStyleBlock(this._kind)}${PANEL_STYLES}${MOD_PROPS_STYLES}</style>${props}${inner}`
  }
}

const PANEL_STYLES = `
  :host{display:flex;flex-direction:column;height:100%;min-height:0;overflow:auto;background:var(--sapGroup_ContentBackground,#fafafa);color:var(--sapTextColor,#1d2d3e);font-family:var(--sapFontFamily,Arial,sans-serif);color-scheme:light dark;--cmx-selection-color:var(--sapHighlightColor,#0a6ed1);--cmx-selection-border:color-mix(in srgb,var(--cmx-selection-color) 54%,var(--sapGroup_ContentBackground,#fff));--cmx-selection-bg:color-mix(in srgb,var(--cmx-selection-color) 12%,var(--sapGroup_ContentBackground,#fff));--cmx-selection-bg-soft:color-mix(in srgb,var(--cmx-selection-color) 8%,var(--sapGroup_ContentBackground,#fff))}
  :host([data-readonly]) input:not([readonly]),:host([data-readonly]) select,:host([data-readonly]) textarea{pointer-events:none;background:var(--sapField_ReadOnly_Background,rgba(0,0,0,.02))}
  :host([data-readonly]) .icon-btn.danger,:host([data-readonly]) .link-back{display:none}
  .inspect-body{padding:12px;display:flex;flex-direction:column;gap:12px}
  .section{border:1px solid var(--sapGroup_TitleBorderColor,#d9d9d9);border-radius:6px;background:var(--sapTile_Background,#fff);padding:10px}
  .section h3{margin:0 0 8px;font-size:13px;display:flex;align-items:center;gap:8px}
  .link-back{margin-left:auto;font-size:11px;font-weight:400;border:1px solid var(--sapButton_BorderColor,#89919a);background:var(--sapButton_Background,#fff);color:var(--sapButton_TextColor,var(--sapTextColor,#1d2d3e));border-radius:4px;padding:1px 8px;cursor:pointer}
  .link-back:hover{background:var(--sapButton_Hover_Background,rgba(0,0,0,.06))}
  .kv{display:grid;grid-template-columns:88px minmax(0,1fr);gap:6px;font-size:12px;align-items:center}
  .kv label{color:var(--sapContent_LabelColor,#6a6d70)}
  .kv input{width:100%;height:26px;border:1px solid var(--sapField_BorderColor,#89919a);border-radius:4px;padding:0 8px;background:var(--sapField_Background,#fff);color:inherit;box-sizing:border-box}
  .kv input[type=checkbox]{-webkit-appearance:none;appearance:none;width:16px;height:16px;min-width:16px;flex:none;margin:0;padding:0;border:1px solid var(--sapField_BorderColor,#89919a);border-radius:3px;background:var(--sapField_Background,#fff);cursor:pointer;vertical-align:middle;position:relative}
  .kv input[type=checkbox]:checked{background:var(--sapInformationElementColor, #0a6ed1);border-color:var(--sapInformationElementColor, #0a6ed1)}
  .kv input[type=checkbox]:checked::after{content:"";position:absolute;left:4px;top:1px;width:4px;height:8px;border:solid var(--sapGroup_ContentBorderColor, #ffffff);border-width:0 2px 2px 0;transform:rotate(45deg)}
  .kv select{width:100%;height:26px;border:1px solid var(--sapField_BorderColor,#89919a);border-radius:4px;padding:0 6px;background:var(--sapField_Background,#fff);color:var(--sapField_TextColor,var(--sapTextColor,#1d2d3e));box-sizing:border-box}
  .kv input[readonly]{background:var(--sapField_ReadOnly_Background,rgba(0,0,0,.03));color:var(--sapContent_LabelColor,#6a6d70)}
  .chips{display:flex;flex-wrap:wrap;gap:4px}
  .chip{display:inline-block;font-size:11px;background:var(--cmx-selection-bg-soft);border:1px solid var(--cmx-selection-border);border-radius:10px;padding:1px 8px}
  .chip-btn{cursor:pointer;color:var(--sapLinkColor,var(--sapHighlightColor,#0a6ed1));font:inherit}
  .chip-btn:hover{background:var(--cmx-selection-bg)}
  .lvl-tables{display:flex;flex-direction:column;gap:8px}
  .lvl-table{display:flex;flex-direction:column;gap:5px;padding:8px;border:1px solid var(--sapGroup_TitleBorderColor,#e5e5e5);border-radius:6px;background:var(--sapList_Background,#fff)}
  .lvl-table.active{border-color:var(--cmx-selection-border);background:var(--cmx-selection-bg)}
  .lvl-table .lt-row{display:grid;grid-template-columns:64px minmax(0,1fr);gap:6px;align-items:center}
  .lvl-table .lt-row label{font-size:11px;color:var(--sapContent_LabelColor,#6a6d70)}
  .lvl-table .lt-row input{width:100%;height:26px;border:1px solid var(--sapField_BorderColor,#89919a);border-radius:4px;padding:0 8px;background:var(--sapField_Background,#fff);color:inherit;box-sizing:border-box}
  .lvl-table .lt-row select{width:100%;height:26px;border:1px solid var(--sapField_BorderColor,#89919a);border-radius:4px;padding:0 6px;background:var(--sapField_Background,#fff);color:var(--sapField_TextColor,var(--sapTextColor,#1d2d3e));box-sizing:border-box}
  .lvl-table .lt-row input[type=checkbox]{-webkit-appearance:none;appearance:none;width:16px;height:16px;min-width:16px;flex:none;margin:0;padding:0;border:1px solid var(--sapField_BorderColor,#89919a);border-radius:3px;background:var(--sapField_Background,#fff);cursor:pointer;vertical-align:middle;position:relative}
  .lvl-table .lt-row input[type=checkbox]:checked{background:var(--sapInformationElementColor, #0a6ed1);border-color:var(--sapInformationElementColor, #0a6ed1)}
  .lvl-table .lt-row input[type=checkbox]:checked::after{content:"";position:absolute;left:4px;top:1px;width:4px;height:8px;border:solid var(--sapGroup_ContentBorderColor, #ffffff);border-width:0 2px 2px 0;transform:rotate(45deg)}
  .lvl-table .lt-meta{font-size:11px;color:var(--sapContent_LabelColor,#6a6d70)}
  .cmx-coderule-edit{margin-top:6px}
  .cmx-coderule-edit .lt-row{display:grid;grid-template-columns:64px minmax(0,1fr);gap:6px;align-items:center;font-size:12px}
  .cmx-coderule-edit .lt-row label{color:var(--sapContent_LabelColor,#6a6d70)}
  .cmx-coderule-edit .lt-row input{width:100%;height:26px;border:1px solid var(--sapField_BorderColor,#89919a);border-radius:4px;padding:0 8px;background:var(--sapField_Background,#fff);color:inherit;box-sizing:border-box}
  .cmx-coderule-edit .lt-row select{width:100%;height:26px;border:1px solid var(--sapField_BorderColor,#89919a);border-radius:4px;padding:0 6px;background:var(--sapField_Background,#fff);color:var(--sapField_TextColor,var(--sapTextColor,#1d2d3e));box-sizing:border-box}
  .cmx-coderule-edit .lt-row input[type=checkbox]{-webkit-appearance:none;appearance:none;width:16px;height:16px;min-width:16px;flex:none;margin:0;padding:0;border:1px solid var(--sapField_BorderColor,#89919a);border-radius:3px;background:var(--sapField_Background,#fff);cursor:pointer;vertical-align:middle;position:relative}
  .cmx-coderule-edit .lt-row input[type=checkbox]:checked{background:var(--sapInformationElementColor, #0a6ed1);border-color:var(--sapInformationElementColor, #0a6ed1)}
  .cmx-coderule-edit .lt-row input[type=checkbox]:checked::after{content:"";position:absolute;left:4px;top:1px;width:4px;height:8px;border:solid var(--sapGroup_ContentBorderColor, #ffffff);border-width:0 2px 2px 0;transform:rotate(45deg)}
  .ro-fields{width:100%;border-collapse:collapse;font-size:12px}
  .ro-fields th,.ro-fields td{border-bottom:1px solid var(--sapGroup_TitleBorderColor,#e5e5e5);padding:4px;text-align:left;vertical-align:middle}
  .ro-fields th{color:var(--sapContent_LabelColor,#6a6d70);font-weight:600;background:var(--sapList_HeaderBackground,#f7f7f7)}
  .ro-fields td{color:var(--sapTextColor,#1d2d3e)}
  .fieldset-dialog-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.18);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;z-index:20}
  .fieldset-dialog{width:min(980px,96vw);max-height:82vh;overflow:auto;border:1px solid var(--sapGroup_TitleBorderColor,#d9d9d9);border-radius:6px;background:var(--sapTile_Background,#fff);box-shadow:0 12px 32px rgba(0,0,0,.2);padding:10px;box-sizing:border-box}
  .fieldset-dialog-head{display:flex;align-items:center;gap:8px;margin-bottom:8px}
  .fieldset-dialog-head h3{margin:0;font-size:13px}
  .fieldset-fields{min-width:900px}
  .item-sub{font-size:12px;color:var(--sapContent_LabelColor,#6a6d70)}
  /* 统一字段详编渲染器（cmx-field-ui）样式 */
  .insp-section{border:1px solid var(--sapGroup_TitleBorderColor,#d9d9d9);border-radius:6px;background:var(--sapTile_Background,#fff);padding:10px}
  .insp-section .sub-h{margin:0 0 8px;font-size:13px;font-weight:600}
  .insp-grid{display:grid;grid-template-columns:88px minmax(0,1fr);gap:6px;font-size:12px;align-items:center}
  .insp-grid>label{color:var(--sapContent_LabelColor,#6a6d70)}
  .insp-grid input,.insp-grid select{width:100%;height:26px;border:1px solid var(--sapField_BorderColor,#89919a);border-radius:4px;padding:0 8px;background:var(--sapField_Background,#fff);color:var(--sapField_TextColor,var(--sapTextColor,#1d2d3e));box-sizing:border-box}
  .insp-grid input[type=checkbox]{-webkit-appearance:none;appearance:none;width:16px;height:16px;min-width:16px;flex:none;padding:0;border:1px solid var(--sapField_BorderColor,#89919a);border-radius:3px;cursor:pointer;position:relative}
  .insp-grid input[type=checkbox]:checked{background:var(--sapInformationElementColor, #0a6ed1);border-color:var(--sapInformationElementColor, #0a6ed1)}
  .insp-grid input[type=checkbox]:checked::after{content:"";position:absolute;left:4px;top:1px;width:4px;height:8px;border:solid var(--sapGroup_ContentBorderColor, #ffffff);border-width:0 2px 2px 0;transform:rotate(45deg)}
  .insp-full{grid-column:1/-1}
  .cmx-fld-ro{color:var(--sapContent_LabelColor,#6a6d70)}
  .vlist{display:flex;flex-direction:column;gap:4px}
  .vrow{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto;gap:4px;align-items:center}
  .enum-list{display:flex;flex-direction:column;gap:4px}
  .enum-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto;gap:4px;align-items:center}
  .enum-row.enum-dup input{outline:1px solid var(--sapNegativeElementColor, #d95050)}
  .fx-cell{display:flex;gap:4px;align-items:center}
  .cmx-select-text{display:flex;flex-direction:column;gap:4px;align-items:stretch}
  .cmx-select-text select{min-width:0;width:100%}
  .cmx-select-text input{min-width:0;width:100%}
  .cmx-field-tip{display:inline-flex;align-items:center;border:none;background:none;cursor:pointer;padding:0 0 0 2px;color:var(--sapContent_NonInteractiveIconColor,#89919a);vertical-align:middle}
  .cmx-field-tip ui5-icon{width:12px;height:12px}
  .cmx-field-tip:hover{color:var(--sapHighlightColor,#0a6ed1)}
  .cmx-field-tips-body{white-space:pre-wrap;padding:12px;font-size:12px;line-height:1.6;color:var(--sapTextColor,#1d2d3e)}
`
const MOD_PROPS_STYLES = `
        .mod-form{display:grid;grid-template-columns:64px minmax(0,1fr);gap:6px 8px;font-size:12px;align-items:center}
        .mod-form label{color:var(--sapContent_LabelColor,#6a6d70)}
        .mod-form input,.mod-form select{width:100%;height:26px;border:1px solid var(--sapField_BorderColor,#89919a);border-radius:4px;padding:0 8px;background:var(--sapField_Background,#fff);color:inherit;box-sizing:border-box}
        .mod-form select[multiple]{height:auto;min-height:54px;padding:3px 6px}
        .multi-select{position:relative;min-width:0}
        .multi-select summary{height:26px;border:1px solid var(--sapField_BorderColor,#89919a);border-radius:4px;padding:0 22px 0 8px;background:var(--sapField_Background,#fff);color:inherit;box-sizing:border-box;display:flex;align-items:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;font-size:12px;list-style:none}
        .multi-select summary::-webkit-details-marker{display:none}
        .multi-select summary::after{content:"";position:absolute;right:9px;top:10px;border-left:4px solid transparent;border-right:4px solid transparent;border-top:5px solid var(--sapContent_IconColor,#6a6d70)}
        .multi-select[open] summary::after{transform:rotate(180deg)}
        .multi-select-menu{position:absolute;left:0;right:0;top:30px;z-index:10;max-height:180px;overflow:auto;border:1px solid var(--sapField_BorderColor,#89919a);border-radius:4px;background:var(--sapField_Background,#fff);box-shadow:0 8px 24px rgba(0,0,0,.14);padding:4px;box-sizing:border-box}
        .multi-select-option{display:flex;align-items:center;gap:6px;min-height:24px;padding:2px 4px;border-radius:4px;color:inherit}
        .multi-select-option:hover{background:var(--sapList_Hover_Background,#f5f6f7)}
        .multi-select-option input{width:14px;height:14px;padding:0;flex:none}
        .multi-select-empty{font-size:12px;color:var(--sapContent_LabelColor,#6a6d70);padding:6px}
`


if (!customElements.get('portal-definition-inspector')) customElements.define('portal-definition-inspector', PortalDefinitionInspector)

// ════════════════════════════════════════════════════════════════════════
//  列表（explorer）
// ════════════════════════════════════════════════════════════════════════

export class PortalDefinitionList extends HTMLElement {
  constructor () {
    super()
    this.attachShadow({ mode: 'open' })
    this._kind = 'DCT'; this._bus = busFor('DCT')
    this._items = []; this._selectedKey = ''; this._loading = false; this._wired = false
    this._dam = { domains: [], apps: [], modules: [] }   // 域/应用/模块 选项（/api/registry/dam）
    this._fDomain = ''; this._fApp = ''; this._fModule = ''  // 当前过滤选择
    this._kw = ''; this._page = 1  // 关键字搜索 + 分页（统一列表壳）
    this._onClick = (e) => this._handleClick(e)
    this._onInput = (e) => this._handleInput(e)
    this._onFilterChange = (e) => this._handleFilterChange(e)
    this._onFocusOut = (e) => this._handleFocusOut(e)
    this._onPageChange = (e) => this._handlePageChange(e)
    this._onBusItems = (e) => { this._items = e.detail?.items || []; this._renderListBody() }
    this._onBusRemoveReq = () => void this._removeFile()
    this._onBusSelect = (e) => { this._selectedKey = e.detail?.key || ''; this._renderListBody() }
  }

  connectedCallback () {
    this._kind = (this.getAttribute('data-kind') || 'DCT').toUpperCase()
    syncDefNeoHost(this, this._kind)
    this._bus = busFor(this._kind)
    this._items = this._bus.items; this._selectedKey = this._bus.selectedKey
    // 筛选初值 = 入口模块归属（从哪个模块进默认看哪个模块；BASE 系数据域是 base、
    // 不随业务模块归属，保持「全部」）。仅首次连接设置，重连（dock 拖动）不覆盖用户选择。
    if (!this._fInitialized) {
      this._fInitialized = true
      if (!this._isBaseKind()) {
        const entry = admEntryDam(this)
        if (entry.domain || entry.application || entry.module) {
          this._fDomain = entry.domain; this._fApp = entry.application; this._fModule = entry.module
        }
      }
    }
    this._render()
    if (!this._wired) {
      this._wired = true
      this.shadowRoot.addEventListener('click', this._onClick)
      this.shadowRoot.addEventListener('input', this._onInput)
      this.shadowRoot.addEventListener('change', this._onFilterChange)
      this.shadowRoot.addEventListener('focusout', this._onFocusOut)
      this.shadowRoot.addEventListener('page-change', this._onPageChange)
    }
    this._bus.addEventListener('items', this._onBusItems)
    this._bus.addEventListener('remove-file-request', this._onBusRemoveReq)
    this._bus.addEventListener('select', this._onBusSelect)
    if (!this._items.length) void this._loadList()
    void this._loadDam()
  }

  async _loadDam () {
    try {
      const dam = await apiFetch('/api/registry/dam?active_only=true')
      this._dam = { domains: dam.domains || [], apps: dam.apps || [], modules: dam.modules || [] }
      this._renderFilterBar()
    } catch (err) { console.warn('[portal-definition-panels] DAM 注册表拉取失败，筛选仅保留「全部」:', err?.message || err) }
  }

  _handleInput (e) {
    const el = e.target
    if (!(el instanceof Element)) return
    // 搜索框即时过滤（局部刷新列表体 + 计数 + 分页，不整树重绘以免打断输入焦点）
    if (el.id === 'def-kw') {
      const kw = el.value
      if (kw === this._kw) return
      this._kw = kw
      this._page = 1
      this._renderListBody()
      return
    }
    // 属性表单委托 controller（DAM 过滤下拉改用 ui5-select，走 _handleFilterChange）
    const c = this._bus.controller
    if (c && el.closest('[data-module-prop]')) c.handlePanelInput(e)
  }

  /** cmx-pager 翻页：只刷新列表体（搜索词/过滤不变）。 */
  _handlePageChange (e) {
    const p = e.detail || {}
    const page = Math.max(1, Number(p.page) || 1)
    if (page === this._page) return
    this._page = page
    this._renderListBody()
  }

  /** DAM 过滤下拉（ui5-select）change：域/应用/模块级联过滤。 */
  _handleFilterChange (e) {
    const el = e.target instanceof Element ? e.target.closest('[data-filter]') : null
    if (!(el instanceof HTMLElement)) return
    const val = e.detail?.selectedOption?.value ?? el.value ?? ''
    const kind = el.dataset.filter
    if (kind === 'domain') { this._fDomain = val; this._fApp = ''; this._fModule = ''; this._page = 1; this._renderFilterBar(); this._renderListBody() }
    else if (kind === 'app') { this._fApp = val; this._fModule = ''; this._page = 1; this._renderFilterBar(); this._renderListBody() }
    else if (kind === 'module') { this._fModule = val; this._page = 1; this._renderListBody() }
  }

  disconnectedCallback () {
    this.shadowRoot.removeEventListener('click', this._onClick)
    this.shadowRoot.removeEventListener('input', this._onInput)
    this.shadowRoot.removeEventListener('change', this._onFilterChange)
    this.shadowRoot.removeEventListener('focusout', this._onFocusOut)
    this.shadowRoot.removeEventListener('page-change', this._onPageChange)
    this._bus.removeEventListener('items', this._onBusItems)
    this._bus.removeEventListener('remove-file-request', this._onBusRemoveReq)
    this._bus.removeEventListener('select', this._onBusSelect)
    this._wired = false
  }

  _apiKind () { return (this._kind === 'BASE-DCT' || this._kind === 'BASE-DOC') ? 'BASE' : this._kind }

  async _loadList () {
    this._loading = true; this._renderListBody()
    try {
      await this._bus.loadItems(() => fetchDefinitionItemsForKind(this._kind))
    } catch { /* 主体也会拉 */ } finally { this._loading = false; this._renderListBody() }
  }

  _handleClick (e) {
    const t = e.target instanceof Element ? e.target.closest('[data-action]') : null
    if (!(t instanceof HTMLElement)) return
    const a = t.dataset.action
    if (a === 'refresh') { this._bus.requestRefresh(); void this._loadList() }
    if (a === 'load') this._bus.select(t.dataset.key || '')
    if (a === 'add-file') void this._addFile()
  }

  _handleFocusOut (e) {
    const from = e.target instanceof Element ? e.target.closest('.multi-select') : null
    if (!from) return
    const to = e.relatedTarget instanceof Element ? e.relatedTarget : null
    if (!to || !from.contains(to)) from.open = false
  }

  /** 新建定义文件：校验域/应用/模块后弹出新建对话框（分组编码 + 名称），确认后落盘。 */
  async _addFile () {
    if (this._kind === 'BASE-DCT' || this._kind === 'BASE-DOC') { showDefWarn('无法新建', '基础元数据为公共模板，不支持新建文件。'); return }
    const domain = this._fDomain
    const application = this._fApp
    const module = this._fModule
    if (!domain || !application || !module) { showDefWarn('信息不完整', '请先在上方选择「域」「应用」「模块」，再新建。'); return }
    const isDoc = this._kind === 'DOC'
    const codeLabel = isDoc ? '单据编码' : '分组编码'
    const nameDefault = isDoc ? '新单据' : '新字典'
    // 构建表单内容（注入对话框 body）
    const form = document.createElement('div')
    form.className = 'cmx-create-form'
    const fileOf = (gc) => `${gc || '＿'}_${module}_${application}_${domain}__meta_v1.json`
    const codeField = 'moduleCode'
    // eslint-disable-next-line no-restricted-syntax -- 静态结构，值经 escHtml/escAttr 转义。
    form.innerHTML = `
      <style>
        .cmx-create-form { box-sizing: border-box; display: flex; flex-direction: column; gap: 12px; font-family: var(--sapFontFamily, inherit); color: var(--sapTextColor, #1d2d3e); }
        .cmx-create-row { display: grid; grid-template-columns: 72px 280px; gap: 8px 10px; align-items: center; font-size: 13px; }
        .cmx-create-row label { color: var(--sapContent_LabelColor, #6a6d70); }
        .cmx-create-row ui5-input { width: 280px; }
        .cmx-create-hint { font-size: 12px; color: var(--sapContent_LabelColor, #6a6d70); word-break: break-all; }
        .cmx-create-hint code { font-family: var(--sapFontMonospaceFamily, monospace); background: var(--sapList_TableGroupHeaderBackground, #f0f0f0); padding: 1px 5px; border-radius: 3px; }
      </style>
      <div class="cmx-create-row"><label>${escHtml(codeLabel)}</label><ui5-input data-field="groupCode" placeholder="${escAttr(isDoc ? '如 cmxfico（全局唯一）' : '如 FICO（全局唯一）')}"></ui5-input></div>
      <div class="cmx-create-row"><label>名称</label><ui5-input data-field="metaName" placeholder="${escAttr(nameDefault)}"></ui5-input></div>
      <div class="cmx-create-hint">位置：${escHtml(domain + '/' + application + '/' + module)}</div>
      <div class="cmx-create-hint">将创建文件：<code class="cmx-create-file"></code></div>`
    const codeInput = form.querySelector('[data-field="groupCode"]')
    const nameInput = form.querySelector('[data-field="metaName"]')
    const fileEl = form.querySelector('.cmx-create-file')
    const syncFile = () => { fileEl.textContent = fileOf((codeInput.value || '').trim()) }
    /** 实时校验分组编码：空 / 全局重复 → 标红 + value-state-message，返回是否通过。 */
    const validateCode = () => {
      const val = (codeInput.value || '').trim()
      let msg = ''
      if (!val) msg = '请输入' + codeLabel
      else {
        const hit = (this._items || []).find((it) => (it[codeField] || '').toLowerCase() === val.toLowerCase())
        if (hit) msg = `${codeLabel}「${val}」已存在（${hit.domain}/${hit.application || hit.app}/${hit.module}/${hit.file}）`
      }
      if (msg) { codeInput.setAttribute('value-state', 'Negative'); codeInput.setAttribute('value-state-message', msg); return false }
      codeInput.removeAttribute('value-state'); codeInput.removeAttribute('value-state-message'); return true
    }
    codeInput.addEventListener('input', () => { syncFile(); if (codeInput.getAttribute('value-state') === 'Negative') validateCode() })
    codeInput.addEventListener('change', validateCode)
    syncFile()
    // 落盘（成功后 force 关闭，跳过 beforeClose 二次校验）
    const doCreate = async () => {
      const groupCode = (codeInput.value || '').trim()
      const metaName = (nameInput.value || '').trim()
      const file = fileOf(groupCode)
      const skeleton = isDoc
        ? { moduleMeta: { moduleCode: groupCode, metaName: metaName || '新单据', metaKind: 'DOC', version: 1, versionName: '初始版本', isDefault: true }, baseDocMetaRef: { file: 'base_doc_meta_v1.json', version: 1 }, voucherSchema: { schema: [] }, voucherTables: [] }
        : { moduleMeta: { moduleCode: groupCode, metaName: metaName || '新字典', metaKind: 'DCT', version: 1, versionName: '初始版本', isDefault: true }, baseDctMetaRef: { file: 'base_dct_meta_v1.json', version: 1 }, dictionaryTables: [] }
      try {
        const params = new URLSearchParams({ domain, application, module, file })
        const res = await fetch(`/api/definitions/config?${params.toString()}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(skeleton) })
        const data = await res.json().catch(() => null)
        if (!res.ok) throw buildHttpError('新建失败', res, data)
        dlg.close('confirm', { force: true })
        await this._loadList()
        this._bus.select(`${domain}/${application}/${module}/${file}`)
      } catch (err) { showDefError('新建失败', err, { helpCode: err?.code || 'DEF_CREATE_FAILED' }) }
    }
    // 弹出对话框：用 CmxFloatingDialog 内置底部按钮栏（统一风格，按钮在最右）；beforeClose 拦截校验。
    const dlg = document.createElement('cmx-floating-dialog')
    dlg.configure({
      title: isDoc ? '新建单据定义' : '新建字典定义',
      icon: 'add',
      showConfirm: true,
      showCancel: true,
      confirmText: '创建',
      cancelText: '取消',
      dialogWidth: '460px',
      dialogHeight: '280px',
      // 点「创建」时先校验：不过则阻止关闭并聚焦；通过则落盘，成功后 doCreate 内部 force 关闭。
      beforeClose: async ({ action }) => {
        if (action !== 'confirm') return true
        if (!validateCode()) { codeInput.focus(); return false }
        await doCreate()
        return false // doCreate 成功已自行关闭；失败时保持打开让用户改。返回 false 避免此处二次关闭。
      },
    })
    dlg.setContent(form)
    document.body.appendChild(dlg)
    // 回车触发「创建」（走 close('confirm') → beforeClose 校验）
    form.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); dlg.close('confirm') } })
    codeInput.focus()
    await dlg.openModal()
  }

  /** 删除当前选中定义文件（非空保护 + 确认）。 */
  async _removeFile () {
    const it = this._items.find((x) => itemKey(x) === this._selectedKey)
    if (!it) { showDefWarn('未选择文件', '请先选择要删除的定义文件。'); return }
    if (it.kind === 'BASE' || it.domain === 'base') { showDefWarn('无法删除', '基础元数据为公共模板，不可删除。'); return }
    // 非空保护：读取定义内容，单据有层级 / 字典有字典表则不允许删除
    try {
      const q = new URLSearchParams({ domain: it.domain, application: it.application || it.app, module: it.module, file: it.file })
      const res = await fetch(`/api/definitions/config?${q.toString()}`, { headers: { Accept: 'application/json' } })
      const doc = await res.json().catch(() => null)
      if (!res.ok) throw buildHttpError('读取定义失败', res, doc)
      const isDoc = (doc?.[this._metaKey]?.metaKind || it.kind) === 'DOC'
      if (isDoc) {
        const schema = doc?.voucherSchema?.schema
        const levelCount = Array.isArray(schema) ? schema.filter((nodes) => Array.isArray(nodes) && nodes.length).length : 0
        if (levelCount > 0) { showDefWarn('无法删除', `单据「${it.title || it.file}」已定义 ${levelCount} 个层级，不能删除。请先删除其所有层级。`); return }
      } else {
        const dictCount = Array.isArray(doc?.dictionaryTables) ? doc.dictionaryTables.length : 0
        if (dictCount > 0) { showDefWarn('无法删除', `「${it.title || it.file}」已定义 ${dictCount} 个字典表，不能删除。请先删除其所有字典表。`); return }
      }
    } catch (err) { showDefError('删除前检查失败', err); return }
    if (!(await admConfirm({ title: '删除定义文件', message: `确定删除定义文件「${it.title || it.file}」(${it.domain}/${it.module}/${it.file})？此操作不可恢复。`, danger: true }))) return
    try {
      const params = new URLSearchParams({ domain: it.domain, application: it.application || it.app, module: it.module, file: it.file })
      const res = await fetch(`/api/definitions/config?${params.toString()}`, { method: 'DELETE' })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw buildHttpError('删除失败', res, data)
      this._bus.selectedKey = ''
      await this._loadList()
    } catch (err) { showDefError('删除失败', err, { helpCode: err?.code || 'DEF_DELETE_FAILED' }) }
  }

  _render () {
    const kindLabel = ({ DOC: '单据定义', 'BASE-DCT': '字典基础元数据', 'BASE-DOC': '单据基础元数据' })[this._kind] || '字典定义'
    const canEdit = !(this._kind === 'BASE-DCT' || this._kind === 'BASE-DOC')
    // eslint-disable-next-line no-restricted-syntax -- 动态值经 escHtml/escAttr。
    this.shadowRoot.innerHTML = `
      <style>
        ${defBaseNeoStyleBlock(this._kind)}
        ${ADM_ALL_CSS}
        ${admColorSchemeCss()}
        :host{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--sapList_Background,#fff);color:var(--sapTextColor,#1d2d3e);font-family:var(--sapFontFamily,Arial,sans-serif);color-scheme:light dark;}
        .list-region{flex:1 1 auto;min-height:0;display:flex;flex-direction:column}
        .adm-rows{padding:4px 6px}
        .ver-badge{font-size:10px;font-weight:700;background:var(--sapInformationBackground,#eaf4ff);color:var(--sapInformationColor,#0a6ed1);border-radius:9px;padding:0 7px;line-height:16px;white-space:nowrap}
        .filter-bar{display:flex;flex-direction:column;gap:6px;padding:6px 10px;border-bottom:1px solid var(--sapGroup_TitleBorderColor,#d9d9d9);flex-shrink:0;background:var(--sapGroup_ContentBackground,#fafafa)}
        .filter-bar .filter-row{display:grid;grid-template-columns:1fr 1fr;gap:6px}
        .filter-bar .filter-row-module{grid-template-columns:1fr}
        .filter-bar ui5-select{width:100%;min-width:0}
        .filter-bar select{width:100%;height:28px;border:1px solid var(--sapField_BorderColor,#89919a);border-radius:4px;padding:0 6px;background:var(--sapField_Background,#fff);color:var(--sapField_TextColor,var(--sapTextColor,#1d2d3e));box-sizing:border-box;font-size:12px}
      </style>
      <div class="adm-head">
        <span class="adm-title" id="def-count" title="${escHtml(kindLabel)}">${escHtml(this._countTitle())}</span>
        <button type="button" class="adm-icon-btn ghost" data-action="refresh" title="刷新"><ui5-icon name="refresh"></ui5-icon></button>
        ${canEdit ? `<button type="button" class="adm-icon-btn primary" data-action="add-file" title="新建定义文件"><ui5-icon name="add"></ui5-icon>新建</button>` : ''}
      </div>
      ${this._isBaseKind() ? '' : '<div class="filter-bar" id="def-filter">' + this._renderFilterBar(true) + '</div>'}
      <div class="adm-search"><input type="text" id="def-kw" placeholder="搜索名称 / 分组编码…" value="${escAttr(this._kw)}"></div>
      <div class="list-region">
        <div class="adm-rows" id="def-list">${this._renderList()}</div>
        <div class="adm-pager" id="def-pager">${this._renderPager()}</div>
      </div>`
  }

  /** 计数标题：可见组数/总组数（DAM + 关键字过滤后）。 */
  _countTitle () {
    const groups = this._visibleGroups()
    const total = groupDefItemsByStem(this._filteredItems()).length
    return admCountTitle(this._kindLabel(), groups.length, total)
  }

  _kindLabel () {
    return ({ DOC: '单据定义', 'BASE-DCT': '字典基础元数据', 'BASE-DOC': '单据基础元数据' })[this._kind] || '字典定义'
  }

  /** DAM + 关键字过滤后的分组列表（列表/计数/分页共用）。关键字命中：名称/文件名/stem/域/模块。 */
  _visibleGroups () {
    const kw = (this._kw || '').trim().toLowerCase()
    let items = this._filteredItems()
    if (kw) {
      items = items.filter((it) =>
        [it.title, it.file, it.stem, it.domain, it.module, it.moduleCode].some((v) => String(v || '').toLowerCase().includes(kw)))
    }
    return groupDefItemsByStem(items)
  }

  /** 分页器 HTML（超过一页才渲染）。 */
  _renderPager () {
    const total = this._visibleGroups().length
    if (total <= ADM_PAGE_SIZE) return ''
    const pages = Math.ceil(total / ADM_PAGE_SIZE)
    if (this._page > pages) this._page = pages
    return `<cmx-pager compact page="${this._page}" page-size="${ADM_PAGE_SIZE}" total="${total}"></cmx-pager>`
  }

  /** 域/应用过滤下拉（ui5-select + ui5-option，option 带 DAM 图标）。inner=true 时只返回内部 HTML（供局部刷新）。 */
  _renderFilterBar (inner) {
    const domains = this._dam.domains || []
    const apps = (this._dam.apps || []).filter((a) => !this._fDomain || a.domain === this._fDomain)
    const modules = (this._dam.modules || []).filter((m) =>
      (!this._fDomain || m.domain === this._fDomain) &&
      (!this._fApp || (m.application || m.app) === this._fApp))
    const html = `
      <div class="filter-row">
        <ui5-select data-filter="domain" title="域">
          <ui5-option value="" icon="filter" ${!this._fDomain ? 'selected' : ''}>全部域</ui5-option>
          ${domains.map((d) => damOptionHtml(d, d.id, d.id === this._fDomain, 'folder')).join('')}
        </ui5-select>
        <ui5-select data-filter="app" title="应用">
          <ui5-option value="" icon="filter" ${!this._fApp ? 'selected' : ''}>全部应用</ui5-option>
          ${apps.map((a) => damOptionHtml(a, a.id, a.id === this._fApp, 'grid')).join('')}
        </ui5-select>
      </div>
      <div class="filter-row filter-row-module">
        <ui5-select data-filter="module" title="模块">
          <ui5-option value="" icon="filter" ${!this._fModule ? 'selected' : ''}>全部模块</ui5-option>
          ${modules.map((m) => { const mid = m.id || m.module; return damOptionHtml(m, mid, mid === this._fModule, 'product') }).join('')}
        </ui5-select>
      </div>`
    if (inner) return html
    const host = this.shadowRoot.getElementById('def-filter')
    // eslint-disable-next-line no-restricted-syntax -- 选项经 escHtml/escAttr。
    if (host) host.innerHTML = html
    return ''
  }

  /** 当前过滤后的列表项（按 域/应用/模块 过滤）。 */
  _filteredItems () {
    return this._items.filter((it) =>
      (!this._fDomain || it.domain === this._fDomain) &&
      (!this._fApp || itemApplication(it) === this._fApp) &&
      (!this._fModule || it.module === this._fModule))
  }

  _isBaseKind () { return this._kind === 'BASE-DCT' || this._kind === 'BASE-DOC' }

  /** 当前定义的业务元信息节点键（与 PortalDefinitionManager._metaKey 同语义）。 */
  get _metaKey () { return 'moduleMeta' }

  _renderListBody () {
    const host = this.shadowRoot.getElementById('def-list')
    if (!host) { this._render(); return }
    const top = host.scrollTop || 0
    const left = host.scrollLeft || 0
    // eslint-disable-next-line no-restricted-syntax -- 经 escHtml/escAttr。
    host.innerHTML = this._renderList()
    host.scrollTop = top
    host.scrollLeft = left
    // 计数标题与分页器同步（搜索/翻页/DAM 过滤共用此局部刷新路径）
    const count = this.shadowRoot.getElementById('def-count')
    if (count) count.textContent = this._countTitle()
    const pager = this.shadowRoot.getElementById('def-pager')
    // eslint-disable-next-line no-restricted-syntax -- 组件模板，数值插值。
    if (pager) pager.innerHTML = this._renderPager()
  }

  /** 当前选中版本所属的逻辑定义键（domain/app/module/stem），用于分组高亮。 */
  _selectedStemKey () {
    const parts = String(this._selectedKey || '').split('/')
    if (parts.length !== 4) return ''
    const [domain, application, module, file] = parts
    return `${domain}/${application}/${module}/${defFileParts(file).stem}`
  }

  _renderList () {
    if (this._loading && !this._items.length) return '<div class="adm-empty">加载中…</div>'
    if (!this._items.length) {
      return admEmptyHtml({ total: 0, itemLabel: this._kindLabel(), actionLabel: '新建' })
    }
    // 多版本聚合：一逻辑定义一行；组内活动时用当前选中版本作代表，否则用默认版（无默认则最新版）。
    const groups = this._visibleGroups()
    if (!groups.length) {
      // 有关键字 → 搜索无结果；否则是 DAM 过滤无命中
      if ((this._kw || '').trim()) return admEmptyHtml({ total: 1, keyword: this._kw, itemLabel: this._kindLabel() })
      return `<div class="adm-empty">当前域/应用下暂无${escHtml(this._kindLabel())}<div class="adm-empty-hint">调整上方过滤条件</div></div>`
    }
    // 分页切片
    const start = (this._page - 1) * ADM_PAGE_SIZE
    const pageGroups = groups.slice(start, start + ADM_PAGE_SIZE)
    const activeStem = this._selectedStemKey()
    return pageGroups.map((g) => {
      const active = g.key === activeStem
      const rep = (active && g.versions.find((v) => itemKey(v) === this._selectedKey)) || g.default
      const key = itemKey(rep)
      const verCount = g.versions.length
      const defNo = defItemVersion(g.default)
      const countLabel = this._isBaseKind() ? '字段集' : '表'
      const stat = `${Number(rep.tableCount || rep.fieldSetCount || 0)} ${countLabel} · v${defItemVersion(rep)}${defItemIsDefault(rep) ? ' ★' : ''}`
      return `<button type="button" class="adm-row${active ? ' is-current' : ''}" data-action="load" data-key="${escAttr(key)}" title="${escAttr(rep.title || rep.file)}">
        <div class="adm-main">
          <div class="adm-name">${escHtml(rep.title || rep.file)}</div>
          <div class="adm-sub">${escHtml(rep.domain)}/${escHtml(rep.module)} · ${escHtml(g.stem)}</div>
          <div class="adm-sub">${escHtml(stat)}</div>
        </div>
        ${verCount > 1 ? `<span class="adm-badge" title="${escAttr(`${verCount} 个版本，默认 v${defNo}`)}">${verCount} 版本</span>` : ''}
      </button>`
    }).join('')
  }
}

if (!customElements.get('portal-definition-list')) customElements.define('portal-definition-list', PortalDefinitionList)

// ════════════════════════════════════════════════════════════════════════
//  view type 注册：DCT / DOC 各一组
// ════════════════════════════════════════════════════════════════════════
