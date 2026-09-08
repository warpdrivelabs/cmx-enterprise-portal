/**
 * <designer-source-panel> — HTML 源码编辑面板（CodeMirror 6）
 */
import { prettyFormatHtml } from '../utils/html-utils.js';
import { TOOLBAR_BASE } from '../styles/shared-styles.js';
import { DesignerBaseComponent } from './designer-base-component.js';
import {
  attachCodeMirrorResize,
  detachCodeMirrorResize,
  CODEMIRROR_RESIZE_STYLES,
  CM_RESIZE_HOST_CLASS,
} from '../utils/codemirror-resize.js';
import { cmxCodeMirrorExtensions } from '../utils/codemirror-theme.js';
import { loadCodeMirrorHtmlBundle } from '../lib/codemirror-loader.js';
const STYLE = `${TOOLBAR_BASE}
${CODEMIRROR_RESIZE_STYLES}
  :host { display: flex; flex-direction: column; height: 100%; min-height: 0; }

  .toolbar {
    border-bottom: none;
    flex-wrap: wrap;
    gap: 4px 0;
  }

  #cm-host.${CM_RESIZE_HOST_CLASS} {
    flex: 1 1 260px;
    min-height: 160px;
  }

  #cm-host .cm-editor {
    font-size: 12px;
    font-family: Consolas, 'Courier New', monospace;
  }
  #cm-host .cm-scroller {
    overflow: auto !important;
  }

  .source-script-toggle-wrap {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-inline-start: auto;
    flex-shrink: 0;
  }
  .source-script-toggle-wrap ui5-label {
    font-size: 12px;
    color: var(--sapContent_LabelColor, #8fa7c0);
    white-space: nowrap;
  }
`;

export class DesignerSourcePanel extends DesignerBaseComponent {
  constructor() {
    super();
    this._mutationLocked = false;
    this._suppressShowScriptSwitchEvent = false;
  }

  styles() { return STYLE; }

  template() {
    return `
      <div class="toolbar">
        <ui5-button id="btnApply"   design="Emphasized" icon="accept"      title="应用源码到画布"></ui5-button>
        <div class="tb-sep"></div>
        <ui5-button id="btnCopy"    design="Transparent" icon="copy"       title="复制全部源码"></ui5-button>
        <ui5-button id="btnPaste"   design="Transparent" icon="paste"      title="从剪贴板粘贴"></ui5-button>
        <div class="tb-sep"></div>
        <ui5-button id="btnIndent"  design="Transparent" icon="indent"     title="增加缩进"></ui5-button>
        <ui5-button id="btnOutdent" design="Transparent" icon="outdent"    title="减少缩进"></ui5-button>
        <div class="tb-sep"></div>
        <ui5-button id="btnFormat"  design="Transparent" icon="source-code" title="格式化 HTML"></ui5-button>
        <div class="source-script-toggle-wrap">
          <ui5-label id="lblShowScript" for="showScriptSwitch" wrapping-type="Normal" show-colon="false">显示脚本</ui5-label>
          <ui5-switch id="showScriptSwitch" design="Graphical" accessible-name-ref="lblShowScript" tooltip="开启后在源码区显示 &lt;script&gt;；关闭时仅显示 HTML。保存/导入始终为完整内容。"></ui5-switch>
        </div>
      </div>
      <div id="cm-host" class="${CM_RESIZE_HOST_CLASS}"></div>`;
  }

  async init() {
    this._programmaticSelect = false;
    this._pageDataComp = null;
    const host = this.shadowRoot.getElementById('cm-host');
    if (!host) return;

    const {
      EditorView,
      basicSetup,
      EditorState,
      Compartment,
      html,
      javascriptLanguage,
      indentMore,
      indentLess,
      oneDark,
    } = await loadCodeMirrorHtmlBundle();
    if (!host.isConnected) return;

    this._cmIndentMore = indentMore;
    this._cmIndentLess = indentLess;
    this._EditorState = EditorState;
    this._readOnlyComp = new Compartment();

    this._view = new EditorView({
      parent: host,
      root: this.shadowRoot,
      state: EditorState.create({
        doc: '<!-- 设计区为空 -->',
        extensions: [
          this._readOnlyComp.of(
            EditorState.readOnly.of(
              this._mutationLocked || this.hasAttribute('view-only'),
            ),
          ),
          basicSetup,
          html(),
          javascriptLanguage.data.of({ autocomplete: this._jsCompletionSource.bind(this) }),
          ...cmxCodeMirrorExtensions(EditorView, oneDark),
          EditorView.theme({
            '.cm-content': { padding: '4px 0' },
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              this.dispatchEvent(new CustomEvent('source-change', {
                bubbles: true, composed: true,
                detail: { html: update.state.doc.toString() },
              }));
            }
            if (update.selectionSet && !update.docChanged && !this._programmaticSelect) {
              const pos    = update.state.selection.main.head;
              const nodeId = this._nodeIdAtCursor(pos, update.state.doc.toString());
              if (nodeId) {
                this.dispatchEvent(new CustomEvent('source-select', {
                  bubbles: true, composed: true,
                  detail: { nodeId },
                }));
              }
            }
          }),
          EditorView.lineWrapping,
        ],
      }),
    });

    attachCodeMirrorResize(this._view);
    this._bindToolbar();
  }

  /**
   * 为 true 时源码只读，且 setContent 默认拒绝写入（页内运行与主窗口同域）。
   * @param {boolean} locked
   */
  setMutationLocked(locked) {
    this._mutationLocked = !!locked;
    this.toggleAttribute('data-mutation-locked', locked);
    if (this._view && this._readOnlyComp && this._EditorState) {
      const ro = this._mutationLocked || this.hasAttribute('view-only');
      this._view.dispatch({
        effects: this._readOnlyComp.reconfigure(
          this._EditorState.readOnly.of(ro),
        ),
      });
    }
    const sr = this.shadowRoot;
    if (!sr) return;
    for (const id of ['btnApply', 'btnPaste', 'btnIndent', 'btnOutdent', 'btnFormat', 'showScriptSwitch']) {
      const b = sr.getElementById(id);
      if (b) b.disabled = locked;
    }
  }

  /** 与父级「仅 HTML / 含 script」展示状态同步（不派发 toggle） */
  syncShowScriptSwitch(show) {
    const sw = this.shadowRoot?.getElementById('showScriptSwitch');
    if (!sw) return;
    const on = !!show;
    if (sw.checked === on) return;
    this._suppressShowScriptSwitchEvent = true;
    sw.checked = on;
    this._suppressShowScriptSwitchEvent = false;
  }

  cleanup() {
    detachCodeMirrorResize(this._view);
    this._view?.destroy();
    this._view = null;
    this._cmIndentMore = null;
    this._cmIndentLess = null;
  }

  _bindToolbar() {
    const sr = this.shadowRoot;

    sr.getElementById('btnApply').addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('source-apply', {
        bubbles: true, composed: true,
        detail: { html: this._view.state.doc.toString() },
      }));
    });

    sr.getElementById('btnCopy').addEventListener('click', async () => {
      await navigator.clipboard.writeText(this._view.state.doc.toString());
    });

    sr.getElementById('btnPaste').addEventListener('click', async () => {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      this._view.dispatch({
        changes: { from: 0, to: this._view.state.doc.length, insert: text },
      });
    });

    sr.getElementById('btnIndent').addEventListener('click', () => {
      if (this._view && this._cmIndentMore) this._cmIndentMore(this._view);
      this._view?.focus();
    });

    sr.getElementById('btnOutdent').addEventListener('click', () => {
      if (this._view && this._cmIndentLess) this._cmIndentLess(this._view);
      this._view?.focus();
    });

    sr.getElementById('btnFormat').addEventListener('click', () => {
      const formatted = prettyFormatHtml(this._view.state.doc.toString());
      this._view.dispatch({
        changes: { from: 0, to: this._view.state.doc.length, insert: formatted },
      });
      this._view.focus();
    });

    sr.getElementById('showScriptSwitch')?.addEventListener('change', (e) => {
      if (this._suppressShowScriptSwitchEvent) return;
      this.dispatchEvent(
        new CustomEvent('source-show-script-toggle', {
          bubbles: true,
          composed: true,
          detail: { show: !!e.target.checked },
        }),
      );
    });
  }

  highlightNode(nodeId) {
    if (!this._view || !nodeId) return;
    const content = this._view.state.doc.toString();
    const search  = `data-node-id="${nodeId}"`;
    const idx     = content.indexOf(search);
    if (idx === -1) return;
    // expand to full opening tag: find '<' before idx and '>' after
    const tagStart = content.lastIndexOf('<', idx);
    const tagEnd   = content.indexOf('>', idx) + 1;
    if (tagStart === -1 || tagEnd === 0) return;
    this._programmaticSelect = true;
    this._view.dispatch({
      selection: { anchor: tagStart, head: tagEnd },
      scrollIntoView: true,
    });
    this._programmaticSelect = false;
  }

  // Find the data-node-id of the opening tag that contains document offset `pos`.
  _nodeIdAtCursor(pos, text) {
    const re = /data-node-id="([^"]+)"/g;
    let match;
    while ((match = re.exec(text)) !== null) {
      const tagStart = text.lastIndexOf('<', match.index);
      const tagEnd   = text.indexOf('>', match.index);
      if (tagStart !== -1 && tagEnd !== -1 && tagStart <= pos && pos <= tagEnd + 1) {
        return match[1];
      }
    }
    return null;
  }

  /**
   * @param {string} rawHtml
   * @param {{ bypassMutationLock?: boolean }} [opts] 设计器内部同步画布→源码时传入 true
   */
  setContent(rawHtml, opts = {}) {
    if (!this._view) return;
    if (this._mutationLocked && !opts.bypassMutationLock) return;
    const formatted = prettyFormatHtml(rawHtml);
    this._view.dispatch({
      changes: { from: 0, to: this._view.state.doc.length, insert: formatted },
    });
  }

  getContent() {
    return this._view?.state.doc.toString() ?? '';
  }

  setPageData(comp) {
    this._pageDataComp = comp;
  }

  _jsCompletionSource(context) {
    const dataMember = context.matchBefore(/\$data\.\w*/);
    if (dataMember) {
      const pageData = this._pageDataComp?._pageData || [];
      return {
        from: dataMember.from + '$data.'.length,
        validFor: /^\w*$/,
        options: pageData.filter(d => d.name).map(d => ({
          label: d.name, type: 'variable', detail: d.type || 'string', boost: 10,
          info: `页面变量 $data.${d.name}`,
        })),
      };
    }
    const word = context.matchBefore(/[\$\w]+/);
    if (!word || (word.from === word.to && !context.explicit)) return null;
    const pageFns  = this._pageDataComp?._pageFns     || [];
    const pageSvcs = this._pageDataComp?._pageServices || [];
    return {
      from: word.from, validFor: /^[\$\w]*$/,
      options: [
        { label: '$data',         type: 'variable', detail: '页面数据对象', boost: 12,
          apply: (view, _, from, to) => view.dispatch({ changes: { from, to, insert: '$data.' } }) },
        { label: 'event',         type: 'variable', detail: '事件对象',     boost: 11 },
        { label: 'console.log()', type: 'method',   detail: '控制台输出',   boost: 5 },
        { label: 'alert()',       type: 'function', detail: '弹出提示框',   boost: 3 },
        { label: 'fetch()',       type: 'function', detail: '发起请求',     boost: 3 },
        ...pageFns.filter(f => f.name).map(f => ({
          label: f.name, type: 'function', detail: '页面函数', boost: 10, apply: `${f.name}(`,
        })),
        ...pageSvcs.filter(s => s.name).map(s => ({
          label: s.name, type: 'function', detail: '页面服务', boost: 9, apply: `${s.name}(`,
        })),
      ],
    };
  }
}

customElements.define('designer-source-panel', DesignerSourcePanel);
