/**
 * 弹性组合的配套元素：检查器/校验预览/源码视图/Schema 视图/列表。
 *
 * 从 portal-flexible-combination-manager.js 拆出，它们只依赖总线单例与若干已抽到 lib/ 的工具，
 * 不反向依赖主类实现（主类通过 bus.controller 协议与面板解耦）。
 */
import { registerWorkspaceViewType } from '../lib/workspace-view-renderer.js'
import { apiFetch } from 'cmx-ui5-runtime/api-client'
import { escAttr, escHtml } from '../lib/escape.js'
import { loadCodeMirrorJsonBundle, cmxJsonTheme, isDarkUi5Theme } from '../lib/codemirror-json.js'
import { buildHttpError, showDefError, showDefWarn } from '../lib/notify.js'
import { damOptionHtml } from '../lib/dam-options.js'
import { combinationBus, combinationBusFor } from '../lib/flexible-combination-bus.js'
import { groupFcItemsByStem, fcScenarioParts, fcItemVersion, fcItemIsDefault } from '../lib/version-stem.js'
import { ADM_PAGE_SIZE, ADM_ALL_CSS, admCountTitle, admEmptyHtml, admColorSchemeCss, admEntryDam } from '../lib/admin-ui-kit.js'

const PANEL_STYLES = `
        .fc-props-form{display:grid;grid-template-columns:64px minmax(0,1fr);gap:6px 8px;font-size:12px;align-items:center}
        .fc-props-form label{color:var(--sapContent_LabelColor,#6a6d70)}
        .fc-props-form input{width:100%;height:26px;border:1px solid var(--sapField_BorderColor,#89919a);border-radius:4px;padding:0 8px;background:var(--sapField_Background,#fff);color:inherit;box-sizing:border-box}
        .fc-props-form select{width:100%;height:26px;border:1px solid var(--sapField_BorderColor,#89919a);border-radius:4px;padding:0 6px;background:var(--sapField_Background,#fff);color:var(--sapField_TextColor,var(--sapTextColor,#1d2d3e));box-sizing:border-box;font-size:12px}
        .doc-info{margin-top:8px;padding:8px;border:1px solid var(--sapGroup_TitleBorderColor,#d9d9d9);border-radius:6px;background:var(--sapTile_Background,#fff)}
        .doc-info .di-row{display:grid;grid-template-columns:56px minmax(0,1fr);gap:6px;font-size:12px;margin-bottom:3px}
        .doc-info .di-k{color:var(--sapContent_LabelColor,#6a6d70)}
  :host{display:flex;flex-direction:column;height:100%;min-height:0;overflow:auto;background:var(--sapGroup_ContentBackground,#fafafa);color:var(--sapTextColor,#1d2d3e);font-family:var(--sapFontFamily,Arial,sans-serif);color-scheme:light dark;--cmx-selection-color:var(--sapHighlightColor,#0a6ed1);--cmx-selection-border:color-mix(in srgb,var(--cmx-selection-color) 54%,var(--sapGroup_ContentBackground,#fff));--cmx-selection-bg:color-mix(in srgb,var(--cmx-selection-color) 12%,var(--sapGroup_ContentBackground,#fff));--cmx-selection-bg-soft:color-mix(in srgb,var(--cmx-selection-color) 8%,var(--sapGroup_ContentBackground,#fff))}
  :host([data-readonly]) input:not([readonly]),:host([data-readonly]) select,:host([data-readonly]) textarea,:host([data-readonly]) ui5-checkbox,:host([data-readonly]) cmx-dict-select{pointer-events:none}
  :host([data-readonly]) input:not([readonly]),:host([data-readonly]) select,:host([data-readonly]) textarea{background:var(--sapField_ReadOnly_Background,rgba(0,0,0,.02))}
  :host([data-readonly]) .icon-btn,:host([data-readonly]) .link-back{display:none}
  .inspect-body{padding:12px;overflow:auto;min-height:0;display:flex;flex-direction:column;gap:12px}
  .panel-head{display:flex;align-items:center;gap:8px;padding:0 0 8px;border-bottom:1px solid var(--sapGroup_TitleBorderColor,#d9d9d9)}
  .spacer{flex:1}
  .section{border:1px solid var(--sapGroup_TitleBorderColor,#d9d9d9);border-radius:6px;background:var(--sapTile_Background,#fff);padding:10px}
  .section h3{margin:0 0 8px;font-size:13px;display:flex;align-items:center;gap:8px}
  .link-back{margin-left:auto;font-size:11px;font-weight:400;border:1px solid var(--sapButton_BorderColor,#0a6ed1);color:var(--sapButton_TextColor,#0a6ed1);background:transparent;border-radius:4px;padding:1px 8px;height:22px;cursor:pointer}
  .link-back:hover{background:color-mix(in srgb, var(--sapInformationElementColor, #0a6ed1) 10%, transparent)}
  .dict-link{border:0;background:transparent;color:var(--sapLinkColor,#0a6ed1);text-decoration:underline;cursor:pointer;font-size:12px;padding:0}
  .dict-link:hover{color:var(--sapLink_Hover_Color,#0854a0)}
  .mr-chips{display:flex;flex-wrap:wrap;gap:4px}
  .mr-chip{display:inline-flex;align-items:center;font-size:11px;background:var(--cmx-selection-bg-soft);border:1px solid var(--cmx-selection-border);border-radius:10px;padding:1px 8px}
  .mr-list{display:flex;flex-direction:column;gap:6px}
  .mr-row{display:grid;grid-template-columns:minmax(0,1fr) 96px minmax(0,1.2fr) 28px;gap:6px;align-items:center}
  .mr-row cmx-dict-select{min-width:0;width:100%}
  .mr-row ui5-checkbox{min-width:0}
  .mr-row .mr-novalue{font-size:11px;color:var(--sapContent_LabelColor,#6a6d70)}
  .icon-btn{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--sapContent_IconColor,#6a6d70);cursor:pointer}
  .icon-btn:hover{background:var(--sapButton_Hover_Background,rgba(0,0,0,.06))}
  .icon-btn ui5-icon{width:16px;height:16px;pointer-events:none}
  .mr-row .icon-btn{width:24px;height:24px}
  .mr-row .icon-btn ui5-icon{width:14px;height:14px;color:var(--sapNegativeColor,#bb0000)}
  .kv{display:grid;grid-template-columns:88px minmax(0,1fr);gap:6px;font-size:12px;align-items:center}
  .kv label{color:var(--sapContent_LabelColor,#6a6d70)}
  input,select,textarea{min-width:0;height:28px;border:1px solid var(--sapField_BorderColor,#89919a);border-radius:4px;padding:0 8px;background:var(--sapField_Background,#fff);color:inherit;box-sizing:border-box}
  pre{margin:0;white-space:pre-wrap;overflow:auto;font-size:11px;line-height:1.45;max-height:360px}
  .msg{font-size:12px;color:var(--sapContent_LabelColor,#6a6d70)}
  .bad{color:var(--sapNegativeTextColor,#bb0000)}
  .ok{color:var(--sapPositiveTextColor,#107e3e)}
  .insp-grid{display:grid;grid-template-columns:96px minmax(0,1fr);gap:6px 8px;font-size:12px;align-items:center}
  .insp-grid label{color:var(--sapContent_LabelColor,#6a6d70)}
  .insp-grid input,.insp-grid select,.insp-grid textarea{width:100%;box-sizing:border-box}
  .insp-grid .full{grid-column:1/-1}
  .insp-grid input[type=checkbox]{-webkit-appearance:none;appearance:none;width:16px;height:16px;min-width:16px;flex:none;margin:0;padding:0;border:1px solid var(--sapField_BorderColor,#89919a);border-radius:3px;background:var(--sapField_Background,#fff);cursor:pointer;vertical-align:middle;position:relative}
  .insp-grid input[type=checkbox]:checked{background:var(--sapInformationElementColor, #0a6ed1);border-color:var(--sapInformationElementColor, #0a6ed1)}
  .insp-grid input[type=checkbox]:checked::after{content:"";position:absolute;left:4px;top:1px;width:4px;height:8px;border:solid var(--sapGroup_ContentBorderColor, #ffffff);border-width:0 2px 2px 0;transform:rotate(45deg)}
  .sub-h{font-size:11px;font-weight:700;color:var(--sapContent_LabelColor,#6a6d70);text-transform:uppercase;letter-spacing:.04em;margin:4px 0 2px;grid-column:1/-1}
  .vrow{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) 28px;gap:6px;align-items:center;margin-bottom:4px}
  .enum-list{display:flex;flex-direction:column;gap:6px}
  .enum-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) 28px;gap:6px;align-items:center;margin-bottom:4px}
  .enum-row.enum-dup input{outline:1px solid var(--sapNegativeElementColor, #d95050)}
  .insp-section{border:1px solid var(--sapGroup_TitleBorderColor,#d9d9d9);border-radius:6px;padding:8px 10px;margin-bottom:8px}
  .insp-section>.sub-h{margin:0 0 6px;text-transform:none;font-size:12px;color:var(--sapTextColor,#1d2d3e)}
  .insp-full{grid-column:1/-1}
  .cmx-fld-ro{color:var(--sapContent_LabelColor,#6a6d70)}
  .item-sub{font-size:11px;color:var(--sapContent_LabelColor,#6a6d70)}
  .di-v{font-size:12px}
  .di-tag{font-size:10px;font-weight:600;color:var(--sapContent_LabelColor,#6a6d70);border:1px solid var(--sapGroup_TitleBorderColor,#d9d9d9);border-radius:8px;padding:0 6px;margin-left:4px}
  .di-tag.own{color:var(--sapInformationElementColor, #0a6ed1);border-color:var(--sapLinkColor, #0a6ed1)}
  .di-cnt{font-size:11px;font-weight:400;color:var(--sapContent_LabelColor,#6a6d70)}
  .dim-cols{width:100%;border-collapse:collapse;font-size:12px}
  .dim-cols th,.dim-cols td{border-bottom:1px solid var(--sapGroup_TitleBorderColor,#e5e5e5);padding:4px 6px;text-align:left;vertical-align:middle}
  .dim-cols th{color:var(--sapContent_LabelColor,#6a6d70);font-weight:600;background:var(--sapList_HeaderBackground,#f7f7f7)}
  .dim-cols th.idx,.dim-cols td.idx{width:30px;text-align:center;color:var(--sapContent_LabelColor,#6a6d70)}
`

class FlexibleCombinationPanelBase extends HTMLElement {
  constructor () {
    super()
    this.attachShadow({ mode: 'open' })
    this._wired = false
    this._pbus = combinationBus  // 默认全局；connectedCallback 按 data-bus-scope 换作用域总线
    this._onClick = (e) => { const c = this._pbus.controller; if (c) c.handlePanelClick(e) }
    this._onInput = (e) => { const c = this._pbus.controller; if (c) c.handlePanelInput(e) }
    // ui5-checkbox 触发 change、cmx-dict-select 触发 cmx-dict-change，均非原生 input → 单独委托
    this._onChange = (e) => { const c = this._pbus.controller; if (c && c.handlePanelChange) c.handlePanelChange(e) }
    // 焦点保护：本面板正在被编辑（activeElement 是自身输入控件）时不重建，避免打字丢焦点；force=true 强制重建
    this._onState = (e) => { if (e?.detail?.force || !this._isEditingSelf()) this._render() }
  }

  _isEditingSelf () {
    const ae = this.shadowRoot.activeElement
    return ae instanceof HTMLElement && /^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName)
  }

  connectedCallback () {
    this._pbus = combinationBusFor(this.getAttribute('data-bus-scope') || '')
    this._render()
    if (!this._wired) {
      this._wired = true
      this.shadowRoot.addEventListener('click', this._onClick)
      this.shadowRoot.addEventListener('input', this._onInput)
      this.shadowRoot.addEventListener('change', this._onChange)
      this.shadowRoot.addEventListener('cmx-dict-change', this._onChange)
    }
    this._pbus.addEventListener('state', this._onState)
    this._pbus.addEventListener('controller', this._onState)
  }

  disconnectedCallback () {
    this.shadowRoot.removeEventListener('click', this._onClick)
    this.shadowRoot.removeEventListener('input', this._onInput)
    this.shadowRoot.removeEventListener('change', this._onChange)
    this.shadowRoot.removeEventListener('cmx-dict-change', this._onChange)
    this._pbus.removeEventListener('state', this._onState)
    this._pbus.removeEventListener('controller', this._onState)
    this._wired = false
  }

  _render () {
    const inner = this._pbus.controller
      ? this._renderInner(this._pbus.controller)
      : '<div class="inspect-body"><div class="item-sub">请先在内容区打开「弹性组合管理」。</div></div>'
    // eslint-disable-next-line no-restricted-syntax -- 正文由主体 render* 输出，已全程 escHtml/escAttr。
    this.shadowRoot.innerHTML = `<style>${PANEL_STYLES}</style>${inner}`
    // cmx-dict-select 初值需命令式设置（无 value 属性）：渲染后回填 data-init-value
    for (const el of this.shadowRoot.querySelectorAll('cmx-dict-select[data-init-value]')) {
      const v = el.getAttribute('data-init-value')
      if (v && el.setValue) { try { el.setValue(v, { silent: true }) } catch { /* 组件未就绪则忽略 */ } }
    }
  }

  /** @abstract */
  _renderInner (_controller) { return '' }
}

/** 「检查器」面板（property 区视图 flexible-combination-inspector）。 */
export class PortalFlexibleCombinationInspector extends FlexibleCombinationPanelBase {
  _renderInner (controller) {
    // 上段：弹性组合属性卡（原列表底栏属性表单迁入）；下段：字段检查器
    const props = `<div class="inspect-body"><section class="insp-section"><div class="sub-h">弹性组合属性</div>${controller.renderCombinationPropsHtml()}</section></div>`
    return props + controller.renderInspectorPanelHtml()
  }
}

/** 「校验/预览」面板（property 区视图 flexible-combination-verify）。 */
export class PortalFlexibleCombinationVerify extends FlexibleCombinationPanelBase {
  _renderInner (controller) { return controller.renderVerifyPanelHtml() }
}

if (!customElements.get('portal-flexible-combination-inspector')) {
  customElements.define('portal-flexible-combination-inspector', PortalFlexibleCombinationInspector)
}
if (!customElements.get('portal-flexible-combination-verify')) {
  customElements.define('portal-flexible-combination-verify', PortalFlexibleCombinationVerify)
}

registerWorkspaceViewType('flexible-combination-inspector', () => '<portal-flexible-combination-inspector></portal-flexible-combination-inspector>')
registerWorkspaceViewType('flexible-combination-verify', () => '<portal-flexible-combination-verify></portal-flexible-combination-verify>')

export class PortalFlexibleCombinationSource extends HTMLElement {
  constructor () {
    super()
    this.attachShadow({ mode: 'open' })
    this._cm = null              // CodeMirror EditorView（成功时）
    this._cmHost = null          // CodeMirror 挂载容器
    this._mode = 'pending'       // 'pending' | 'cm' | 'textarea'
    this._initing = false        // _initEditor 正在进行（防并发重复挂载）
    this._applyingRemote = false // 程序化 setDoc 期间，忽略自身 updateListener 回写
    this._pbus = combinationBus
    this._onTextareaInput = (e) => { const c = this._pbus.controller; if (c) c.updateSourceText(e.target.value) }
    this._onState = () => this._syncText()
  }

  connectedCallback () {
    this._pbus = combinationBusFor(this.getAttribute('data-bus-scope') || '')
    this._renderShell()
    this._pbus.addEventListener('state', this._onState)
    this._pbus.addEventListener('controller', this._onState)
    this._pbus.addEventListener('dirty', this._onState)
    void this._initEditor()
  }

  disconnectedCallback () {
    this._pbus.removeEventListener('state', this._onState)
    this._pbus.removeEventListener('controller', this._onState)
    this._pbus.removeEventListener('dirty', this._onState)
    if (this._cm) { try { this._cm.destroy() } catch { /* noop */ } this._cm = null }
  }

  _renderShell () {
    // eslint-disable-next-line no-restricted-syntax -- 纯静态外壳，无动态插值。
    this.shadowRoot.innerHTML = `
      <style>
        :host{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--sapField_Background,#fff)}
        #cm-host{flex:1;min-height:0;overflow:auto}
        #cm-host .cm-editor{height:100%}
        textarea{flex:1;min-height:0;border:0;resize:none;outline:none;padding:12px;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--sapTextColor,#1d2d3e);background:var(--sapField_Background,#fff);box-sizing:border-box}
        .empty{padding:16px;color:var(--sapContent_LabelColor,#6a6d70);font-size:13px}
      </style>
      <div id="cm-host"></div>`
    this._cmHost = this.shadowRoot.getElementById('cm-host')
  }

  async _initEditor () {
    if (this._initing || this._cm) return     // 防并发/重复挂载
    const c = this._pbus.controller
    if (!c) { this._renderEmpty(); return }
    this._initing = true
    try {
      const cm = await loadCodeMirrorJsonBundle()
      // 加载期间可能已被卸载或已被其它路径建好
      if (!this.isConnected || !this._cmHost || this._cm) return
      const ctrl = this._pbus.controller
      if (!ctrl) { this._renderEmpty(); return }
      const { EditorView, EditorState, basicSetup, keymap, indentWithTab, json, oneDark } = cm
      const exts = [
        basicSetup,
        json(),
        keymap.of([indentWithTab]),
        cmxJsonTheme(EditorView),
        EditorView.updateListener.of((u) => {
          if (u.docChanged && !this._applyingRemote) {
            const cc = this._pbus.controller
            if (cc) cc.updateSourceText(u.state.doc.toString())
          }
        }),
      ]
      if (isDarkUi5Theme()) exts.push(oneDark)
      // 用最新文本（await 期间档案可能刚加载完成），避免显示旧/空内容
      this._cm = new EditorView({
        parent: this._cmHost,
        root: this.shadowRoot,
        state: EditorState.create({ doc: ctrl.getSourceText(), extensions: exts }),
      })
      this._mode = 'cm'
      // 兜底：建好后再同步一次最新文本（防 await 末尾又有变更）
      this._syncText()
    } catch {
      // CodeMirror 不可用 → 降级 textarea
      this._renderTextarea()
    } finally {
      this._initing = false
    }
  }

  _renderTextarea () {
    const c = this._pbus.controller
    this._mode = 'textarea'
    // eslint-disable-next-line no-restricted-syntax -- 内容经 escHtml。
    this.shadowRoot.innerHTML = `
      <style>
        :host{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--sapField_Background,#fff)}
        textarea{flex:1;min-height:0;border:0;resize:none;outline:none;padding:12px;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--sapTextColor,#1d2d3e);background:var(--sapField_Background,#fff);box-sizing:border-box}
      </style>
      <textarea id="combination-json" spellcheck="false" placeholder="FlexibleCombination JSON">${escHtml(c ? c.getSourceText() : '')}</textarea>`
    const ta = this.shadowRoot.getElementById('combination-json')
    if (ta) ta.addEventListener('input', this._onTextareaInput)
  }

  _renderEmpty () {
    this._mode = 'pending'
    // eslint-disable-next-line no-restricted-syntax -- 纯静态文案。
    this.shadowRoot.innerHTML = `
      <style>:host{display:block}.empty{padding:16px;color:var(--sapContent_LabelColor,#6a6d70);font-size:13px}</style>
      <cmx-empty-state icon="detail-view" title="请先在内容区打开「弹性组合管理」" size="sm"></cmx-empty-state>`
    this._cmHost = null
  }

  /** controller 状态变化：未获焦时把最新 JSON 刷入编辑器/文本框（编辑中不打断）。 */
  _syncText () {
    const c = this._pbus.controller
    if (!c) {
      if (this._cm) { try { this._cm.destroy() } catch { /* noop */ } this._cm = null }
      if (this._mode !== 'pending') this._renderEmpty()
      return
    }
    // 尚未建好编辑器（含 await 中）：交给 _initEditor，避免重复挂载
    if (this._mode === 'pending' || this._initing) {
      if (!this._cmHost) this._renderShell()
      void this._initEditor()
      return
    }
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
      const ta = this.shadowRoot.getElementById('combination-json')
      if (!(ta instanceof HTMLTextAreaElement)) return
      if (this.shadowRoot.activeElement === ta) return
      ta.value = c.getSourceText()
    }
  }
}

if (!customElements.get('portal-flexible-combination-source')) {
  customElements.define('portal-flexible-combination-source', PortalFlexibleCombinationSource)
}

registerWorkspaceViewType('flexible-combination-source', () => '<portal-flexible-combination-source></portal-flexible-combination-source>')

export class PortalFlexibleCombinationSchema extends PortalFlexibleCombinationSource {
  async _initEditor () {
    if (this._initing || this._cm) return
    const c = this._pbus.controller
    if (!c) { this._renderEmpty(); return }
    this._initing = true
    try {
      const cm = await loadCodeMirrorJsonBundle()
      if (!this.isConnected || !this._cmHost || this._cm) return
      const ctrl = this._pbus.controller
      if (!ctrl) { this._renderEmpty(); return }
      const { EditorView, EditorState, basicSetup, keymap, indentWithTab, json, oneDark } = cm
      const exts = [basicSetup, json(), keymap.of([indentWithTab]), cmxJsonTheme(EditorView), EditorView.editable.of(false)]
      if (isDarkUi5Theme()) exts.push(oneDark)
      this._cm = new EditorView({
        parent: this._cmHost,
        root: this.shadowRoot,
        state: EditorState.create({ doc: ctrl.getSchemaText(), extensions: exts }),
      })
      this._mode = 'cm'
      this._syncText()
    } catch {
      this._renderTextarea()
    } finally {
      this._initing = false
    }
  }

  _renderTextarea () {
    const c = this._pbus.controller
    this._mode = 'textarea'
    // eslint-disable-next-line no-restricted-syntax -- schema 文本经 escHtml。
    this.shadowRoot.innerHTML = `
      <style>
        :host{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--sapField_Background,#fff)}
        textarea{flex:1;min-height:0;border:0;resize:none;outline:none;padding:12px;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--sapTextColor,#1d2d3e);background:var(--sapField_Background,#fff);box-sizing:border-box}
      </style>
      <textarea id="combination-json" spellcheck="false" readonly>${escHtml(c ? c.getSchemaText() : '')}</textarea>`
  }

  _syncText () {
    const c = this._pbus.controller
    if (!c) {
      if (this._cm) { try { this._cm.destroy() } catch { /* noop */ } this._cm = null }
      if (this._mode !== 'pending') this._renderEmpty()
      return
    }
    if (this._mode === 'pending' || this._initing) {
      if (!this._cmHost) this._renderShell()
      void this._initEditor()
      return
    }
    const next = c.getSchemaText()
    if (this._mode === 'cm' && this._cm) {
      if (next === this._cm.state.doc.toString()) return
      this._cm.dispatch({ changes: { from: 0, to: this._cm.state.doc.length, insert: next } })
      return
    }
    if (this._mode === 'textarea') {
      const ta = this.shadowRoot.getElementById('combination-json')
      if (ta instanceof HTMLTextAreaElement) ta.value = next
    }
  }
}

if (!customElements.get('portal-flexible-combination-schema')) {
  customElements.define('portal-flexible-combination-schema', PortalFlexibleCombinationSchema)
}

registerWorkspaceViewType('flexible-combination-schema', () => '<portal-flexible-combination-schema></portal-flexible-combination-schema>')

/**
 * <portal-flexible-combination-list> —— 弹性组合列表（显示在门户 explorer 侧栏区域）。
 *
 * 与主体 <portal-flexible-combination-manager>（content 区）通过模块级 combinationBus 联动：
 *   - 自己拉 /api/flexible-combination/list 填充列表（主体也会拉并经 bus 共享，二者去重）
 *   - 点击某项 → bus.select(key) → 主体加载该档案
 *   - "新建" → list._addCombination()（弹窗收集 scenario+标题 → 直接 POST 落盘 → 刷新列表并 select 进编辑态）
 *   - "刷新" → bus.requestRefresh() → 主体重拉列表
 *   - 监听 bus 的 items/select 事件，保持列表内容与高亮同步
 */
export class PortalFlexibleCombinationList extends HTMLElement {
  constructor () {
    super()
    this.attachShadow({ mode: 'open' })
    this._pbus = combinationBus
    this._items = this._pbus.items
    this._selectedKey = this._pbus.selectedKey
    this._loading = false
    this._wired = false
    this._dam = { domains: [], apps: [], modules: [] }
    this._fDomain = ''; this._fApp = ''; this._fModule = ''
    this._kw = ''; this._page = 1  // 关键字搜索 + 分页（统一列表壳）
    this._onClick = (e) => this._handleClick(e)
    this._onInput = (e) => this._handleInput(e)
    this._onFilterChange = (e) => this._handleFilterChange(e)
    this._onPageChange = (e) => this._handlePageChange(e)
    this._onBusItems = (e) => { this._items = e.detail?.items || []; this._renderListBody() }
    this._onBusSelect = (e) => { this._selectedKey = e.detail?.key || ''; this._renderListBody() }
  }

  connectedCallback () {
    this._pbus = combinationBusFor(this.getAttribute('data-bus-scope') || '')
    this._items = this._pbus.items
    this._selectedKey = this._pbus.selectedKey
    // 筛选初值 = 入口模块归属（从哪个模块进默认看哪个模块）。
    // 仅首次连接设置，重连（dock 拖动）不覆盖用户选择。
    if (!this._fInitialized) {
      this._fInitialized = true
      const entry = admEntryDam(this)
      if (entry.domain || entry.application || entry.module) {
        this._fDomain = entry.domain; this._fApp = entry.application; this._fModule = entry.module
      }
    }
    this._render()
    if (!this._wired) {
      this._wired = true
      this.shadowRoot.addEventListener('click', this._onClick)
      this.shadowRoot.addEventListener('input', this._onInput)
      this.shadowRoot.addEventListener('change', this._onFilterChange)
      this.shadowRoot.addEventListener('page-change', this._onPageChange)
    }
    this._pbus.addEventListener('items', this._onBusItems)
    this._pbus.addEventListener('select', this._onBusSelect)
    // 列表也主动拉一次：保证即便主体尚未挂载，侧栏也有内容
    if (!this._items.length) void this._loadList()
    void this._loadDam()
  }

  async _loadDam () {
    try {
      const dam = await apiFetch('/api/registry/dam?active_only=true')
      this._dam = { domains: dam.domains || [], apps: dam.apps || [], modules: dam.modules || [] }
      this._renderFilterBar()
    } catch (err) { console.warn('[flex-combo-panels] DAM 注册表拉取失败，筛选仅保留「全部」:', err?.message || err) }
  }

  _handleInput (e) {
    const el = e.target
    if (!(el instanceof Element)) return
    // 搜索框即时过滤（局部刷新列表体 + 计数 + 分页，不整树重绘以免打断输入焦点）
    if (el.id === 'fc-kw') {
      const kw = el.value
      if (kw === this._kw) return
      this._kw = kw
      this._page = 1
      this._renderListBody()
      return
    }
    // DAM 过滤下拉改用 ui5-select，走 _handleFilterChange；此处只委托档案/引用单据表单编辑。
    const c = this._pbus.controller
    if (c && (el.closest('[data-combination-prop]') || el.closest('[data-doc-ref]'))) c.handlePanelInput(e)
  }

  /** cmx-pager 翻页：只刷新列表体。 */
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
    this.shadowRoot.removeEventListener('page-change', this._onPageChange)
    this._pbus.removeEventListener('items', this._onBusItems)
    this._pbus.removeEventListener('select', this._onBusSelect)
    this._wired = false
  }

  async _loadList () {
    this._loading = true
    this._renderListBody()
    try {
      const data = await apiFetch('/api/flexible-combination/list')
      this._pbus.setItems(Array.isArray(data?.items) ? data.items : [])
    } catch { /* 静默；主体也会拉并经 bus 共享 */ } finally {
      this._loading = false
      this._renderListBody()
    }
  }

  _handleClick (e) {
    const t = e.target instanceof Element ? e.target.closest('[data-action]') : null
    if (!(t instanceof HTMLElement)) return
    const action = t.dataset.action
    if (action === 'refresh') { this._pbus.requestRefresh(); void this._loadList() }
    if (action === 'new') void this._addCombination()
    if (action === 'load') this._pbus.select(t.dataset.key || '')
  }

  /** 新建弹性组合：校验域/应用/模块后弹出对话框（scenario + 标题），确认后落盘创建空骨架文件。
   *  对齐 portal-definition-manager 的 _addFile：弹窗收集关键信息 → 直接 POST → 刷新列表选中进编辑态。 */
  async _addCombination () {
    const domain = this._fDomain
    const app = this._fApp
    const module = this._fModule
    if (!domain || !app || !module) { showDefWarn('信息不完整', '请先在上方选择「域」「应用」「模块」，再新建。'); return }
    // 构建表单内容（注入对话框 body）
    const form = document.createElement('div')
    form.className = 'cmx-create-form'
    const fileOf = (sc) => `${sc || '＿'}.json`
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
      <div class="cmx-create-row"><label>场景标识</label><ui5-input data-field="scenario" placeholder="如 account（同应用/模块下唯一）"></ui5-input></div>
      <div class="cmx-create-row"><label>标题</label><ui5-input data-field="title" placeholder="新建弹性组合"></ui5-input></div>
      <div class="cmx-create-hint">位置：${escHtml(domain + '/' + app + '/' + module)}</div>
      <div class="cmx-create-hint">将创建文件：<code class="cmx-create-file"></code></div>`
    const scenarioInput = form.querySelector('[data-field="scenario"]')
    const titleInput = form.querySelector('[data-field="title"]')
    const fileEl = form.querySelector('.cmx-create-file')
    const syncFile = () => { fileEl.textContent = fileOf((scenarioInput.value || '').trim()) }
    /** 实时校验场景标识：空 / 同坐标下重复 → 标红 + value-state-message，返回是否通过。 */
    const validateScenario = () => {
      const val = (scenarioInput.value || '').trim()
      let msg = ''
      if (!val) msg = '请输入场景标识'
      else {
        const hit = (this._items || []).find((it) => it.domain === domain && it.app === app && it.module === module && (it.scenario || '').toLowerCase() === val.toLowerCase())
        if (hit) msg = `场景标识「${val}」已存在（${hit.domain}/${hit.app}/${hit.module}/${hit.scenario}）`
      }
      if (msg) { scenarioInput.setAttribute('value-state', 'Negative'); scenarioInput.setAttribute('value-state-message', msg); return false }
      scenarioInput.removeAttribute('value-state'); scenarioInput.removeAttribute('value-state-message'); return true
    }
    scenarioInput.addEventListener('input', () => { syncFile(); if (scenarioInput.getAttribute('value-state') === 'Negative') validateScenario() })
    scenarioInput.addEventListener('change', validateScenario)
    syncFile()
    // 落盘（成功后 force 关闭，跳过 beforeClose 二次校验）
    const doCreate = async () => {
      const scenario = (scenarioInput.value || '').trim()
      const titleVal = (titleInput.value || '').trim()
      const skeleton = {
        version: 1, versionName: '初始版本', isDefault: true,
        scenario, domain, app, application: app, module,
        title: titleVal || '新建弹性组合',
        anchorDimensions: [], description: '', status: 'draft', tags: [],
        dimensions: {}, rules: [],
      }
      try {
        const params = new URLSearchParams({ domain, app, module, scenario })
        // B2 例外：失败经 buildHttpError(label, res, data) 构造结构化错误（需读响应体），保持 raw fetch。
        const res = await fetch(`/api/flexible-combination/config?${params.toString()}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(skeleton) })
        const data = await res.json().catch(() => null)
        if (!res.ok) throw buildHttpError('新建失败', res, data)
        dlg.close('confirm', { force: true })
        await this._loadList()
        this._pbus.select(`${domain}/${app}/${module}/${scenario}`)
      } catch (err) { showDefError('新建失败', err, { helpCode: err?.code || 'FC_CREATE_FAILED' }) }
    }
    // 弹出对话框：用 CmxFloatingDialog 内置底部按钮栏（统一风格，按钮在最右）；beforeClose 拦截校验。
    const dlg = document.createElement('cmx-floating-dialog')
    dlg.configure({
      title: '新建弹性组合',
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
        if (!validateScenario()) { scenarioInput.focus(); return false }
        await doCreate()
        return false // doCreate 成功已自行关闭；失败时保持打开让用户改。返回 false 避免此处二次关闭。
      },
    })
    dlg.setContent(form)
    document.body.appendChild(dlg)
    // 回车触发「创建」（走 close('confirm') → beforeClose 校验）
    form.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); dlg.close('confirm') } })
    scenarioInput.focus()
    await dlg.openModal()
  }

  _itemKey (item) {
    return `${item.domain}/${item.app}/${item.module}/${item.scenario}`
  }

  _render () {
    // eslint-disable-next-line no-restricted-syntax -- 动态文本/属性均经 escHtml/escAttr。
    this.shadowRoot.innerHTML = `
      <style>
        ${ADM_ALL_CSS}
        ${admColorSchemeCss()}
        :host{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--sapList_Background,#fff);color:var(--sapTextColor,#1d2d3e);font-family:var(--sapFontFamily,Arial,sans-serif);color-scheme:light dark}
        .list-region{flex:1 1 auto;min-height:0;display:flex;flex-direction:column}
        .filter-bar{display:flex;flex-direction:column;gap:6px;padding:6px 10px;border-bottom:1px solid var(--sapGroup_TitleBorderColor,#d9d9d9);flex-shrink:0;background:var(--sapGroup_ContentBackground,#fafafa)}
        .filter-bar .filter-row{display:grid;grid-template-columns:1fr 1fr;gap:6px}
        .filter-bar .filter-row-module{grid-template-columns:1fr}
        .filter-bar ui5-select{width:100%;min-width:0}
        .filter-bar select{width:100%;height:28px;border:1px solid var(--sapField_BorderColor,#89919a);border-radius:4px;padding:0 6px;background:var(--sapField_Background,#fff);color:var(--sapField_TextColor,var(--sapTextColor,#1d2d3e));box-sizing:border-box;font-size:12px}
      </style>
      <div class="adm-head">
        <span class="adm-title" id="fc-count" title="弹性组合">${escHtml(this._countTitle())}</span>
        <button type="button" class="adm-icon-btn ghost" data-action="refresh" title="刷新"><ui5-icon name="refresh"></ui5-icon></button>
        <button type="button" class="adm-icon-btn primary" data-action="new" title="新建弹性组合"><ui5-icon name="add"></ui5-icon>新建</button>
      </div>
      <div class="filter-bar" id="fc-filter">${this._renderFilterBar(true)}</div>
      <div class="adm-search"><input type="text" id="fc-kw" placeholder="搜索名称 / 场景编码…" value="${escAttr(this._kw)}"></div>
      <div class="list-region">
        <div class="adm-rows" id="fc-list">${this._renderList()}</div>
        <div class="adm-pager" id="fc-pager">${this._renderPager()}</div>
      </div>`
  }

  /** 计数标题：可见组数/总组数（DAM + 关键字过滤后）。 */
  _countTitle () {
    const groups = this._visibleGroups()
    const total = groupFcItemsByStem(this._filteredItems()).length
    return admCountTitle('弹性组合', groups.length, total)
  }

  /** DAM + 关键字过滤后的分组列表（列表/计数/分页共用）。命中：标题/场景/stem/域/应用/模块。 */
  _visibleGroups () {
    const kw = (this._kw || '').trim().toLowerCase()
    let items = this._filteredItems()
    if (kw) {
      items = items.filter((it) =>
        [it.title, it.scenario, it.stem, it.domain, it.app, it.module].some((v) => String(v || '').toLowerCase().includes(kw)))
    }
    return groupFcItemsByStem(items)
  }

  /** 分页器 HTML（超过一页才渲染）。 */
  _renderPager () {
    const total = this._visibleGroups().length
    if (total <= ADM_PAGE_SIZE) return ''
    const pages = Math.ceil(total / ADM_PAGE_SIZE)
    if (this._page > pages) this._page = pages
    return `<cmx-pager compact page="${this._page}" page-size="${ADM_PAGE_SIZE}" total="${total}"></cmx-pager>`
  }

  /** 域/应用过滤下拉（ui5-select + ui5-option，option 带 DAM 图标）。inner=true 仅返回内部 HTML（局部刷新用）。 */
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
    const host = this.shadowRoot.getElementById('fc-filter')
    // eslint-disable-next-line no-restricted-syntax -- 选项经 escHtml/escAttr。
    if (host) host.innerHTML = html
    return ''
  }

  _filteredItems () {
    return this._items.filter((it) =>
      (!this._fDomain || it.domain === this._fDomain) &&
      (!this._fApp || it.app === this._fApp) &&
      (!this._fModule || it.module === this._fModule))
  }

  /** 仅重渲列表区（不动弹性组合属性表单，避免打字丢焦点）。 */
  _renderListBody () {
    const host = this.shadowRoot.getElementById('fc-list')
    if (!host) { this._render(); return }
    const top = host.scrollTop || 0
    const left = host.scrollLeft || 0
    // eslint-disable-next-line no-restricted-syntax -- 内容经 escHtml/escAttr。
    host.innerHTML = this._renderList()
    host.scrollTop = top
    host.scrollLeft = left
    // 计数标题与分页器同步（搜索/翻页/DAM 过滤共用此局部刷新路径）
    const count = this.shadowRoot.getElementById('fc-count')
    if (count) count.textContent = this._countTitle()
    const pager = this.shadowRoot.getElementById('fc-pager')
    // eslint-disable-next-line no-restricted-syntax -- 组件模板，数值插值。
    if (pager) pager.innerHTML = this._renderPager()
  }

  _renderList () {
    if (this._loading && !this._items.length) return '<div class="adm-empty">加载中…</div>'
    if (!this._items.length) return admEmptyHtml({ total: 0, itemLabel: '弹性组合' })
    // 多版本聚合：一逻辑档案一行；选中组内用当前选中版本作代表，否则用默认版（无默认则最新）。
    const groups = this._visibleGroups()
    if (!groups.length) {
      if ((this._kw || '').trim()) return admEmptyHtml({ total: 1, keyword: this._kw, itemLabel: '弹性组合' })
      return '<div class="adm-empty">当前域/应用下暂无档案<div class="adm-empty-hint">调整上方过滤条件</div></div>'
    }
    // 分页切片
    const start = (this._page - 1) * ADM_PAGE_SIZE
    const pageGroups = groups.slice(start, start + ADM_PAGE_SIZE)
    const selParts = String(this._selectedKey || '').split('/')
    const activeStem = selParts.length === 4 ? `${selParts[0]}/${selParts[1]}/${selParts[2]}/${fcScenarioParts(selParts[3]).stem}` : ''
    return pageGroups.map((g) => {
      const active = g.key === activeStem
      const rep = (active && g.versions.find((v) => this._itemKey(v) === this._selectedKey)) || g.default
      const key = this._itemKey(rep)
      const verCount = g.versions.length
      const defNo = fcItemVersion(g.default)
      const stat = `${escHtml((rep.anchorDimensions || []).join(' + ') || '无锚点')} · ${Number(rep.ruleCount || 0)} rules · v${fcItemVersion(rep)}${fcItemIsDefault(rep) ? ' ★' : ''}`
      return `<button type="button" class="adm-row${active ? ' is-current' : ''}" data-action="load" data-key="${escAttr(key)}" title="${escAttr(rep.title || rep.scenario)}">
        <div class="adm-main">
          <div class="adm-name">${escHtml(rep.title || rep.scenario)}</div>
          <div class="adm-sub">${escHtml(g.domain)}/${escHtml(g.app)}/${escHtml(g.module)} · ${escHtml(g.stem)}</div>
          <div class="adm-sub">${stat}</div>
        </div>
        ${verCount > 1 ? `<span class="adm-badge" title="${escAttr(`${verCount} 个版本，默认 v${defNo}`)}">${verCount} 版本</span>` : ''}
      </button>`
    }).join('')
  }
}

if (!customElements.get('portal-flexible-combination-list')) {
  customElements.define('portal-flexible-combination-list', PortalFlexibleCombinationList)
}

registerWorkspaceViewType('flexible-combination-list', () => '<portal-flexible-combination-list></portal-flexible-combination-list>')
