/**
 * <designer-page-data> — 页面级数据 / 函数 / 服务 / 数据流 管理面板
 *
 * 公开方法：
 *   setView(view)         切换视图: 'data' | 'fn' | 'svc' | 'flow'
 *   setCanvasHtml(html)   注入画布 HTML 供数据流图解析绑定关系
 *   getScriptBlock(pageId)       导出/运行用：完整 Web Component 封装脚本
 *   getSourceScriptPreview(pageId) 设计器「源码」区展示：直接函数 + 注释，无运行时封装
 *   mergeFnsFromDesignScript(text) 从源码脚本解析 function 声明并写入「函数」页（同名覆盖）
 */
import { DesignerBaseComponent } from './designer-base-component.js';
import { TabManager } from '../utils/tab-manager.js';
import { parseDesignPageFunctionDeclarations } from '../utils/parse-design-script-fns.js';
import { buildCmxScriptBlockFromPageState } from '../utils/build-cmx-page-script-block.js';
import { DESIGNER_PAGE_DATA_SHELL_STYLE } from './designer-page-data/designer-page-data-shell-style.js';
import { DESIGNER_PAGE_DATA_SHELL_TEMPLATE } from './designer-page-data/designer-page-data-shell-template.js';
import { bindDataPanel, renderDataRows } from './designer-page-data/page-data-panel-data.js';
import {
  bindFnPanel,
  refreshFnDetailVarCheckboxes,
  renderFnList,
} from './designer-page-data/page-data-panel-fn.js';
import { bindSvcPanel, renderSvcList } from './designer-page-data/page-data-panel-svc.js';
import { bindFlowPanel, renderFlowDiagram } from './designer-page-data/page-data-panel-flow.js';
import {
  bindTestPanel,
  setTestData as applyTestPanelData,
} from './designer-page-data/page-data-panel-test.js';
import { bindDepsPanel, renderDepsList } from './designer-page-data/page-data-panel-deps.js';
import { bindIfacePanel, renderIfaceList } from './designer-page-data/page-data-panel-iface.js';
import { bindModelsPanel, renderModelsList, getModelsState, setModelsState } from './designer-page-data/page-data-panel-models.js';
import { normalizePageInterfaces } from './designer-page-data/page-interface-registry.js';
import { cleanupCodeMirrorEditors } from './designer-page-data/page-data-codemirror.js';

export class DesignerPageData extends DesignerBaseComponent {
  constructor() {
    super();
    this._pageData       = [];
    this._pageFns        = [];
    this._pageServices   = [];
    this._pageDeps       = [];
    this._pageInterfaces = [];
    this._dataSources    = [];     // CMX DataSource 注册表（cmx-data-comp / 主从协调器）
    this._dataFlow       = { schema: [], aggregations: [], relations: [] };  // CmxMasterSlave 协调器配置
    this._canvasHtml     = '';
    this._testFns        = [];
    this._testSvcs       = [];
    this._fnCmEditors    = [];
    this._svcCmEditors   = [];
    this._ifaceCmEditors = [];
    /** 函数 / 服务主从布局：当前选中的列表项下标 */
    this._fnSelectedIndex    = 0;
    this._svcSelectedIndex   = 0;
    this._ifaceSelectedName  = '';
    /** 右侧 CodeMirror 当前绑定到的列表下标（persist 用，勿与切换后的 _fnSelectedIndex 混淆） */
    this._fnCmBoundIndex    = -1;
    this._svcCmBoundIndex   = -1;
    this._ifaceCmBoundName  = '';
  }

  styles() { return DESIGNER_PAGE_DATA_SHELL_STYLE; }

  template() { return DESIGNER_PAGE_DATA_SHELL_TEMPLATE; }

  init() {
    this._fnListGen = 0;
    this._svcListGen = 0;
    this._ifaceListGen = 0;
    this._panes = new TabManager(this.shadowRoot, null, '.pane');
    bindDataPanel(this);
    bindFnPanel(this);
    bindSvcPanel(this);
    bindFlowPanel(this);
    bindTestPanel(this);
    bindDepsPanel(this);
    bindIfacePanel(this);
    bindModelsPanel(this);
    void renderFnList(this).catch((e) => console.error('[designer-page-data] renderFnList', e));
    void renderSvcList(this).catch((e) => console.error('[designer-page-data] renderSvcList', e));
    void renderIfaceList(this).catch((e) => console.error('[designer-page-data] renderIfaceList', e));
  }

  /* ── 公开方法 ──────────────────────────────────────────────────────────── */

  setView(view) {
    const map = {
      data:  'dataPane',
      fn:    'fnPane',
      svc:   'svcPane',
      iface: 'ifacePane',
      flow:  'flowPane',
      test:  'testPane',
      deps:    'depsPane',
      models:  'modelsPane',
    };
    this._panes.activate(map[view]);
    if (view === 'fn') refreshFnDetailVarCheckboxes(this);
    if (view === 'flow') renderFlowDiagram(this);
  }

  setCanvasHtml(html) {
    this._canvasHtml = html || '';
  }

  refreshModelsList(skipProps = true) {
    renderModelsList(this, skipProps);
  }

  getState() {
    return {
      pageData:       this._pageData,
      pageFns:        this._pageFns,
      pageServices:   this._pageServices,
      pageDeps:       this._pageDeps,
      pageInterfaces: this._pageInterfaces,
      dataSources:    this._dataSources,
      dataFlow:       this._dataFlow,
      models:         getModelsState(this),
    };
  }

  setState(state) {
    if (!state) return;
    this._pageData = state.pageData ?? [];
    this._pageFns = (state.pageFns ?? []).map((f) => ({
      name: f.name ?? '',
      params: f.params ?? '',
      body: f.body ?? '',
      readsVars: f.readsVars ?? [],
      writesVars: f.writesVars ?? [],
    }));
    this._pageServices = (state.pageServices ?? []).map((s) => ({
      name: s.name ?? '',
      type: s.type || 'rest',
      url: s.url ?? '',
      method: s.method || 'GET',
      rpcMethod: s.rpcMethod ?? '',
      headers: s.headers ?? '',
      bodyTemplate: s.bodyTemplate ?? '',
      responseTo: s.responseTo ?? '',
      responseTransform: s.responseTransform ?? '',
    }));
    this._pageDeps = state.pageDeps ?? [];
    this._pageInterfaces = normalizePageInterfaces(state.pageInterfaces);
    this._dataSources = Array.isArray(state.dataSources) ? state.dataSources : [];
    setModelsState(this, state.models || []);
    this._dataFlow = state.dataFlow && typeof state.dataFlow === 'object'
      ? {
          schema:       Array.isArray(state.dataFlow.schema)       ? state.dataFlow.schema       : [],
          aggregations: Array.isArray(state.dataFlow.aggregations) ? state.dataFlow.aggregations : [],
          relations:    Array.isArray(state.dataFlow.relations)    ? state.dataFlow.relations    : [],
        }
      : { schema: [], aggregations: [], relations: [] };
    this._fnSelectedIndex = 0;
    this._svcSelectedIndex = 0;
    this._ifaceSelectedName = '';
    cleanupCodeMirrorEditors(this);
    renderDataRows(this);
    renderDepsList(this);
    void Promise.all([
      renderFnList(this),
      renderSvcList(this),
      renderIfaceList(this),
    ]).then(() => {
      this._emitPageDataChanged();
    });
  }

  getDeps() {
    return this._pageDeps;
  }

  /** CMX 数据字典：DataSource 数组（供 dataFlow / cmx-revo-grid 等消费） */
  getDataSources() {
    return Array.isArray(this._dataSources) ? this._dataSources : [];
  }

  setDataSources(arr) {
    this._dataSources = Array.isArray(arr) ? arr : [];
    this._emitPageDataChanged();
  }

  /** CMX 主从协调器声明：{ schema, aggregations, relations } */
  getDataFlow() {
    return this._dataFlow || { schema: [], aggregations: [], relations: [] };
  }

  setDataFlow(flow) {
    this._dataFlow = flow && typeof flow === 'object'
      ? {
          schema:       Array.isArray(flow.schema)       ? flow.schema       : [],
          aggregations: Array.isArray(flow.aggregations) ? flow.aggregations : [],
          relations:    Array.isArray(flow.relations)    ? flow.relations    : [],
        }
      : { schema: [], aggregations: [], relations: [] };
    this._emitPageDataChanged();
  }

  mergeFnsFromDesignScript(scriptText) {
    // 若元数据中已有函数定义，优先使用元数据，不用脚本解析覆盖
    // 脚本解析仅用于没有 __designer_meta__ 的老格式页面
    if (this._pageFns.length > 0) return 0;

    const parsed = parseDesignPageFunctionDeclarations(scriptText);
    const validId = /^[a-zA-Z_$][\w$]*$/;
    let n = 0;
    for (const p of parsed) {
      if (!p.name || !validId.test(p.name)) continue;
      const idx = this._pageFns.findIndex((f) => f.name === p.name);
      const row = {
        name: p.name,
        params: p.params,
        body: p.body,
        readsVars: [],
        writesVars: [],
      };
      if (idx >= 0) {
        this._pageFns[idx] = {
          ...this._pageFns[idx],
          ...row,
          readsVars: this._pageFns[idx].readsVars ?? [],
          writesVars: this._pageFns[idx].writesVars ?? [],
        };
      } else {
        this._pageFns.push(row);
      }
      n++;
    }
    if (n > 0) {
      void renderFnList(this).then(() => this._emitPageDataChanged());
    }
    return n;
  }


  getScriptBlock(pageId = 'unnamed') {
    return buildCmxScriptBlockFromPageState(this.getState(), pageId);
  }


  getSourceScriptPreview(pageId = 'unnamed') {
    const validId = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;
    const validData = this._pageData.filter((d) => d.name && validId.test(d.name));
    const validFns = this._pageFns.filter((f) => f.name && validId.test(f.name));
    const validSvcs = this._pageServices.filter((s) => s.name && validId.test(s.name));
    if (!validData.length && !validFns.length && !validSvcs.length) return '';

    const lines = [];
    lines.push(
      '/* 设计时脚本预览：以下为直接函数/说明；导出/预览/运行时会由设计器注入 Web Component 封装。 */',
    );
    lines.push(`/* pageId: ${String(pageId).trim() || 'unnamed'} */`);
    lines.push('');

    if (validData.length) {
      lines.push('// --- 页面数据（运行时在组件内注入 $data，见「数据」面板）---');
      for (const d of validData) {
        const dv = String(d.defaultValue ?? '').replace(/\n/g, ' ');
        const short = dv.length > 96 ? `${dv.slice(0, 96)}…` : dv;
        lines.push(`// $data.${d.name}  (${d.type || 'string'})  默认: ${short}`);
      }
      lines.push('');
    }

    if (validFns.length) {
      lines.push('// --- 页面函数 ---');
      for (const f of validFns) {
        lines.push(`function ${f.name}(${f.params || ''}) {`);
        if (f.body) f.body.split('\n').forEach((l) => lines.push(`  ${l}`));
        lines.push('}');
        lines.push('');
      }
    }

    if (validSvcs.length) {
      lines.push('// --- 页面服务（导出时自动生成 host.服务名 与请求逻辑，见「服务」面板）---');
      for (const s of validSvcs) {
        const u = (s.url || '').trim();
        const parts = [s.type || 'rest'];
        if (u) parts.push(u);
        if (s.type === 'rest' && s.method) parts.push(String(s.method));
        lines.push(`// ${s.name}: ${parts.join(' · ')}`);
      }
      lines.push('');
    }

    return lines.join('\n').replace(/\n+$/, '');
  }


  _emitPageDataChanged() {
    this.dispatchEvent(new CustomEvent('page-data-changed', { bubbles: true, composed: true }));
  }

  cleanup() {
    cleanupCodeMirrorEditors(this);
  }

  setTestData(fns, svcs) {
    applyTestPanelData(this, fns, svcs);
  }
}

customElements.define('designer-page-data', DesignerPageData);
