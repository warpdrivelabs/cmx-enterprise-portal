import { loadCodeMirrorJsonBundle, cmxJsonTheme, isDarkUi5Theme } from '../lib/codemirror-json.js'

/**
 * <portal-json-code-viewer>
 *
 * Reusable JSON CodeMirror viewer/editor for Portal pages and html_page content.
 * Defaults to readonly. Falls back to a readonly textarea if CodeMirror cannot load.
 */
export class PortalJsonCodeViewer extends HTMLElement {
  static get observedAttributes () { return ['readonly'] }

  constructor () {
    super()
    this.attachShadow({ mode: 'open' })
    this._value = ''
    this._cm = null
    this._mode = 'pending'
    this._initing = false
  }

  connectedCallback () {
    this._renderShell()
    void this._initEditor()
  }

  disconnectedCallback () {
    if (this._cm) {
      try { this._cm.destroy() } catch { /* noop */ }
      this._cm = null
    }
  }

  attributeChangedCallback () {
    if (this.isConnected) this._recreateEditor()
  }

  get value () {
    if (this._mode === 'cm' && this._cm) return this._cm.state.doc.toString()
    const ta = this.shadowRoot.getElementById('fallback')
    if (ta instanceof HTMLTextAreaElement) return ta.value
    return this._value
  }

  set value (text) {
    this.setValue(text)
  }

  setValue (text) {
    const next = text == null ? '' : String(text)
    this._value = next
    if (this._mode === 'cm' && this._cm) {
      const cur = this._cm.state.doc.toString()
      if (cur !== next) this._cm.dispatch({ changes: { from: 0, to: cur.length, insert: next } })
      return
    }
    const ta = this.shadowRoot.getElementById('fallback')
    if (ta instanceof HTMLTextAreaElement && ta.value !== next) ta.value = next
  }

  getValue () {
    return this.value
  }

  _renderShell () {
    // eslint-disable-next-line no-restricted-syntax -- Static shadow DOM shell; no dynamic interpolation.
    this.shadowRoot.innerHTML = `
      <style>
        :host{display:block;width:100%;height:100%;min-height:0;background:var(--sapField_Background,#fff)}
        #cm-host{width:100%;height:100%;min-height:0;overflow:auto}
        #cm-host .cm-editor{height:100%}
        #cm-host .cm-scroller{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
        textarea{width:100%;height:100%;min-height:0;border:0;outline:none;resize:none;box-sizing:border-box;padding:12px;font:12px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--sapTextColor,#32363a);background:var(--sapField_Background,#fff)}
      </style>
      <div id="cm-host"></div>`
  }

  async _initEditor () {
    if (this._initing || this._cm) return
    this._initing = true
    try {
      const cm = await loadCodeMirrorJsonBundle()
      if (!this.isConnected) return
      const host = this.shadowRoot.getElementById('cm-host')
      if (!host) return
      const { EditorView, EditorState, basicSetup, keymap, indentWithTab, json, oneDark } = cm
      const readonly = this.hasAttribute('readonly')
      const exts = [
        basicSetup,
        json(),
        keymap.of([indentWithTab]),
        cmxJsonTheme(EditorView),
        EditorView.editable.of(!readonly),
        EditorState.readOnly.of(readonly),
        EditorView.updateListener.of((u) => {
          if (!u.docChanged) return
          this._value = u.state.doc.toString()
          this.dispatchEvent(new CustomEvent('value-change', { detail: { value: this._value } }))
        }),
      ]
      if (isDarkUi5Theme()) exts.push(oneDark)
      this._cm = new EditorView({
        parent: host,
        root: this.shadowRoot,
        state: EditorState.create({ doc: this._value, extensions: exts }),
      })
      this._mode = 'cm'
    } catch {
      this._renderFallback()
    } finally {
      this._initing = false
    }
  }

  _renderFallback () {
    this._mode = 'textarea'
    // eslint-disable-next-line no-restricted-syntax -- Static shadow DOM shell; value is assigned via textarea.value.
    this.shadowRoot.innerHTML = `
      <style>
        :host{display:block;width:100%;height:100%;min-height:0;background:var(--sapField_Background,#fff)}
        textarea{width:100%;height:100%;min-height:0;border:0;outline:none;resize:none;box-sizing:border-box;padding:12px;font:12px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--sapTextColor,#32363a);background:var(--sapField_Background,#fff)}
      </style>
      <textarea id="fallback" spellcheck="false"></textarea>`
    const ta = this.shadowRoot.getElementById('fallback')
    if (ta instanceof HTMLTextAreaElement) {
      ta.readOnly = this.hasAttribute('readonly')
      ta.value = this._value
      ta.addEventListener('input', () => {
        this._value = ta.value
        this.dispatchEvent(new CustomEvent('value-change', { detail: { value: this._value } }))
      })
    }
  }

  _recreateEditor () {
    const value = this.value
    if (this._cm) {
      try { this._cm.destroy() } catch { /* noop */ }
      this._cm = null
    }
    this._value = value
    this._mode = 'pending'
    this._renderShell()
    void this._initEditor()
  }
}

if (!customElements.get('portal-json-code-viewer')) {
  customElements.define('portal-json-code-viewer', PortalJsonCodeViewer)
}
