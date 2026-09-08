/**
 * <designer-app> — 主应用外壳，协调各子组件通信
 */
import './designer-topbar.js';
import './designer-left-panel.js';
import './designer-tree-panel.js';
import './designer-canvas.js';
import './designer-source-panel.js';
import './designer-inspector.js';
import './designer-page-data.js';
import { bindHorizontalDrag, bindVerticalDrag, clamp } from '../utils/drag-resize.js';
import {
  extractCmxPageDesignBodyFromScalerHtml,
  stripDesignScriptsFromHtmlFragment,
} from '../utils/html-utils.js';
import { DesignerBaseComponent } from './designer-base-component.js';
import { TabManager } from '../utils/tab-manager.js';
import { DESIGNER_EXPORT_PAGE_ID_SAFE } from './designer-app/designer-export-page-id.js';
import { openDesignerPreview } from './designer-app/designer-preview.js';
import { openDesignerRunInNewWindow, openDesignerMultiPagesRunInNewWindow } from './designer-app/designer-run.js';
import { getHtmlPagesBatch, getHtmlPage } from '../api/html-pages-api.js';
import { showCmxError, showCmxToast } from 'cmx-data-comp/lib/cmx-toast.js';
import { setDesignerDebugMode } from '../utils/user-code-debug.js';
import { normalizeServerPageHtmlForDebug } from '../utils/normalize-server-page-html-for-debug.js';
import {
  bindDesignerInlineRunDialog,
  openDesignerInlineRunDialog,
} from './designer-app/designer-inline-run.js';
import { bindDesignerServerImportDialog } from './designer-app/designer-server-import.js';
import { bindDesignerServerExportDialog } from './designer-app/designer-server-export.js';
import { bindDesignerMultiPagesDialog } from './designer-app/designer-multi-pages-dialog.js';
import './designer-app/designer-workspace-node-dialog.js';

import { WORKBENCH } from './designer-app/workbench-layout.js';
import { DESIGNER_APP_SHELL_STYLE } from './designer-app/designer-app-shell-style.js';
import { DESIGNER_APP_SHELL_TEMPLATE } from './designer-app/designer-app-shell-template.js';
import { installCmxConsoleTap, uninstallCmxConsoleTap } from '../utils/cmx-console.js';

export class DesignerApp extends DesignerBaseComponent {
  constructor() {
    super();
    this._layout = {
      leftWidth: WORKBENCH.leftWidth,
      rightWidth: WORKBENCH.rightWidth,
      treeHeight: WORKBENCH.treeHeight,
    };
    /** 页面子视图：canvas | source；源码仅在此为 source 或与保存/导出同步时写入编辑器 */
    this._pageSubView = 'canvas';
    /** 导出/保存对话框预填：从服务器打开页面或上次保存成功后更新 */
    this._exportPageMeta = { id: '', name: '', details: '', domain: '', app: '', module: '', doc: '', latestHtmlFile: '', timestamp: '' };
    /** @type {ReturnType<typeof setTimeout> | null} */
    this._exportSuccessCloseTimer = null;
    /** @type {{ openDialog: () => void } | null} */
    this._htmlServerImportCtl = null;
    /** @type {{ openExportDialog: () => void, dialogEl: Element | null } | null} */
    this._serverExportCtl = null;
    /** @type {{ openDialog: () => void } | null} */
    this._multiPagesCtl = null;
    /** 页内运行对话框打开期间为 true，画布/源码拒绝外部写入 */
    this._inlineRunDesignLocked = false;
    /** 从导入/应用源码中抽出的 `<script>` 文本；无 __designer_meta__ 函数时用于源码区展示 */
    this._importedScriptForSource = '';
    /** 源码区是否展示 `<script>`（默认否；保存/导入仍为完整 HTML+meta） */
    this._sourceShowScript = false;
    /** @type {{ bodyHtml: string, scriptSuffix: string, metaSuffix: string, full: string } | null} */
    this._sourceBundle = null;
    /** 各级别 console 是否同步到 inspector 调试区 */
    this._consoleMirrorLevels = { log: true, warn: true, error: true };
  }

  styles() { return DESIGNER_APP_SHELL_STYLE; }

  template() { return DESIGNER_APP_SHELL_TEMPLATE; }

  init() {
    this._canvas    = this.shadowRoot.getElementById('canvas');
    this._source    = this.shadowRoot.getElementById('source');
    this._inspector = this.shadowRoot.getElementById('inspector');
    this._pageData  = this.shadowRoot.getElementById('pageData');
    this._leftPane  = this.shadowRoot.getElementById('leftPane');
    this._rightPane = this.shadowRoot.getElementById('rightPane');
    this._sourceWrap= this.shadowRoot.getElementById('sourceWrap');
    this._treePanel = this.shadowRoot.getElementById('treePanel');
    this._leftTreeWrap = this.shadowRoot.getElementById('leftTreeWrap');

    this._canvas.setPageIdProvider?.(() =>
      (this._exportPageMeta?.id && String(this._exportPageMeta.id).trim()) || 'unnamed',
    );

    installCmxConsoleTap((level, line) => {
      const L = this._consoleMirrorLevels;
      if (!L || !L[level]) return;
      this._inspector?.log?.(line, level);
    });

    this._bindEvents();
    this._bindCenterTabs();
    this._htmlServerImportCtl = bindDesignerServerImportDialog({
      shadowRoot: this.shadowRoot,
      onPageOpened: (detail) => {
        this._exportPageMeta = {
          id: detail.id,
          name: detail.name,
          details: detail.details,
          /* 业务坐标透传（C6①）：保存时三下拉为空回落该值 */
          domain: detail.domain ?? '',
          app: detail.app ?? '',
          module: detail.module ?? '',
          doc: detail.doc ?? '',
          latestHtmlFile: detail.latestHtmlFile ?? '',
          timestamp: detail.timestamp ?? '',
        };
        this._applyImportedHtml(detail.html, `打开「${detail.name || detail.id}」`);
      },
      onOpenPageFailed: (message) => {
        console.warn(`打开页面失败: ${message}`);
      },
    });
    this._serverExportCtl = bindDesignerServerExportDialog({
      shadowRoot: this.shadowRoot,
      pageIdSafeRegex: DESIGNER_EXPORT_PAGE_ID_SAFE,
      getHtmlForSave: () => this._getDesignSourceViewHtml(),
      getExportPageMeta: () => this._exportPageMeta,
      getUrlDam: () => this._urlDam,
      syncSourceView: () => this._refreshSource(true),
      onSaved: (meta) => {
        /* 合并回写（不整替）：onSaved 只带本次生效的 id/name/details/坐标，
           doc 等未回传字段沿用打开时的值。 */
        this._exportPageMeta = { ...this._exportPageMeta, ...meta };
      },
      onSaveLog: (msg) => console.log(msg),
      clearSuccessTimer: () => {
        if (this._exportSuccessCloseTimer != null) {
          clearTimeout(this._exportSuccessCloseTimer);
          this._exportSuccessCloseTimer = null;
        }
      },
      scheduleSuccessClose: (fn, ms = 1600) => {
        if (this._exportSuccessCloseTimer != null) {
          clearTimeout(this._exportSuccessCloseTimer);
          this._exportSuccessCloseTimer = null;
        }
        this._exportSuccessCloseTimer = setTimeout(() => {
          this._exportSuccessCloseTimer = null;
          fn();
        }, ms);
      },
    });
    bindDesignerInlineRunDialog({
      shadowRoot: this.shadowRoot,
      onDialogClosed: () => this._setInlineRunDesignLocked(false),
    });
    this._multiPagesCtl = bindDesignerMultiPagesDialog({
      shadowRoot: this.shadowRoot,
      onConfirm: async (metaRows) => {
        const ids = metaRows.map((r) => r.id);
        const { pages, errors } = await getHtmlPagesBatch(ids);
        const byId = new Map(pages.map((p) => [p.id, p]));
        const ordered = ids.map((id) => byId.get(id)).filter(Boolean);
        if (errors?.length) {
          console.warn('[designer-app] 批量加载部分失败', errors);
          showCmxToast(errors.map((e) => `${e.id}: ${e.error ?? ''}`).filter((s) => s.trim().length > 2).join('\n'),
            { level: 'warning', title: '部分页面加载失败' });
        }
        if (!ordered.length) {
          const hint = errors?.length
            ? errors.map((e) => `${e.id}: ${e.error}`).join('；')
            : '无返回数据';
          throw new Error(`未能加载所选页面（${hint}）`);
        }
        const pagesForDebug = ordered.map((p) => ({
          ...p,
          html: normalizeServerPageHtmlForDebug(p.html ?? '', p.id),
        }));
        openDesignerMultiPagesRunInNewWindow({
          window,
          pages: pagesForDebug,
          log: (msg) => console.log(msg),
        });
        this.dispatchEvent(new CustomEvent('designer-multi-pages-confirm', {
          bubbles: true,
          composed: true,
          detail: { pages: pagesForDebug, errors: errors ?? [] },
        }));
      },
    });
    this._bindResize();
    this._bindPageSubTabs();
    this._applyLayout();
    this._inspector.setPageData(this._pageData);
    this._source.setPageData(this._pageData);
    this._refreshSource();
    // Give canvas time to initialize its shadow DOM before reading scaler
    requestAnimationFrame(() => this._treePanel.setScaler(this._canvas.getScaler()));

    const urlPageId = this._readPageIdFromUrl();
    this._urlDam = this._readDamFromUrl();
    if (urlPageId) void this._openPageByIdFromUrl(urlPageId);

    this._onBeforeUnload = (e) => {
      if (this._canvas?.hasDesignNodes?.()) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', this._onBeforeUnload);
  }

  /** 从 URL 查询串读取页面 ID，优先级 pageId > pageid > id；非法字符返回空串 */
  _readPageIdFromUrl() {
    if (typeof window === 'undefined' || !window.location) return '';
    const sp = new URLSearchParams(window.location.search);
    const raw = sp.get('pageId') ?? sp.get('pageid') ?? sp.get('id') ?? '';
    const id = String(raw).trim();
    return DESIGNER_EXPORT_PAGE_ID_SAFE.test(id) ? id : '';
  }

  /** 从 URL 读取 DAM 业务坐标（C6②：门户入口 ?domain=&app=&module=），供保存对话框预填三级下拉。
      app 兼容 application 别名；段值非法（非 [A-Za-z0-9_-]）归空串；三段全空返回 null。 */
  _readDamFromUrl() {
    if (typeof window === 'undefined' || !window.location) return null;
    const sp = new URLSearchParams(window.location.search);
    const safe = (v) => {
      const s = String(v ?? '').trim();
      return /^[A-Za-z0-9_-]*$/.test(s) ? s : '';
    };
    const domain = safe(sp.get('domain'));
    const app = safe(sp.get('app') ?? sp.get('application'));
    const module = safe(sp.get('module'));
    if (!domain && !app && !module) return null;
    return { domain, app, module };
  }

  /** 直接按 ID 从后端加载页面到设计器（与「服务器导入」单条加载等价） */
  async _openPageByIdFromUrl(id) {
    try {
      const data = await getHtmlPage(id);
      this._exportPageMeta = {
        id: data.id ?? id,
        name: typeof data.name === 'string' ? data.name : '',
        details: typeof data.details === 'string' ? data.details : '',
        /* 业务坐标四元组透传：保存时三下拉为空则回落该值（C6①，防坐标丢失走引擎 id 推导）。
           后端行字段 app/doc 可能为 null，归一为空串。 */
        domain: typeof data.domain === 'string' ? data.domain : '',
        app: typeof data.app === 'string' ? data.app : '',
        module: typeof data.module === 'string' ? data.module : '',
        doc: typeof data.doc === 'string' ? data.doc : '',
        latestHtmlFile: typeof data.latestHtmlFile === 'string' ? data.latestHtmlFile : '',
        timestamp: typeof data.timestamp === 'string' ? data.timestamp : '',
      };
      this._applyImportedHtml(
        data.html ?? '',
        `打开「${this._exportPageMeta.name || this._exportPageMeta.id}」`,
      );
    } catch (err) {
      // URL 深链打开失败此前只进 console → 用户看到空设计器无从得知；提示原因与补救。
      showCmxError(`打开页面失败（id: ${id}）`, err)
    }
  }

  _bindCenterTabs() {
    const pagePaneWrap = this.shadowRoot.getElementById('pagePaneWrap');
    const pageDataComp = this._pageData;

    new TabManager(this.shadowRoot, '.center-tabs .c-tab-btn', null, {
      dataAttr: 'view',
      onChange: (view) => {
        if (view === 'page') {
          pagePaneWrap.classList.add('active');
          pageDataComp.classList.remove('active');
        } else {
          pagePaneWrap.classList.remove('active');
          pageDataComp.classList.add('active');
          if (view === 'flow') pageDataComp.setCanvasHtml(this._canvas.getHtml());
          if (view === 'test') {
            const state = this._pageData.getState();
            pageDataComp.setTestData(state.pageFns, state.pageServices);
          }
          pageDataComp.setView(view);
        }
      },
    });

    const sr = this.shadowRoot;
    sr.getElementById('previewBtn').addEventListener('click', () => openDesignerPreview(this._ioRunCtx()));
    sr.getElementById('multiPagesBtn')?.addEventListener('click', () => this._multiPagesCtl?.openDialog());
    sr.getElementById('exportBtn').addEventListener('click',  () => this._openExportDialog());
    sr.getElementById('runBtn').addEventListener('click',     () => openDesignerRunInNewWindow(this._ioRunCtx()));
    sr.getElementById('inlineRunBtn').addEventListener('click', () => openDesignerInlineRunDialog(this._ioRunCtx()));
    sr.getElementById('importBtn').addEventListener('click',  () => {
      this._openServerImportDialog();
    });
  }

  _openServerImportDialog() {
    this._htmlServerImportCtl?.openDialog();
  }

  _openWorkspaceNodeDialog() {
    const dlg = this.shadowRoot.getElementById('wsNodeDlg');
    if (!dlg) return;
    dlg.setHtmlPagePicker?.((onPick) => {
      this._multiPagesCtl?.openDialog({
        mode: 'single',
        title: '选择 HTML 页面',
        onConfirm: (pages) => {
          const p = Array.isArray(pages) && pages.length ? pages[0] : null;
          if (p) onPick({ id: p.id, name: p.name });
        },
      });
    });
    dlg.open();
  }

  /**
   * @param {string} rawHtml 完整或片段 HTML 字符串
   * @param {string} [logLabel]
   */
  _applyImportedHtml(rawHtml, _logLabel = '导入') {
    const doc = new DOMParser().parseFromString(rawHtml, 'text/html');
    const meta = doc.getElementById('__designer_meta__');
    if (meta) {
      try {
        this._pageData.setState(JSON.parse(meta.textContent));
      } catch (_) {}
      meta.remove();
    }
    /** 设计器导出整页时 body 为 `<template id="cmx-page-template-…">设计区</template><cmx-html-pages-…>`，只应把模板内 HTML 放进画布 */
    const cmxTpl = doc.body?.querySelector('template[id^="cmx-page-template-"]');
    let body;
    if (cmxTpl) {
      body = cmxTpl.innerHTML;
    } else {
      body = doc.body ? doc.body.innerHTML : String(rawHtml ?? '');
    }
    const { html: bodyNoScript } = stripDesignScriptsFromHtmlFragment(body);
    this._canvas.setHtml(bodyNoScript);
    this._importedScriptForSource = '';
    this._pageData.setCanvasHtml?.(this._canvas.getHtml());
    this._refreshSource();
    this._inspector.clearNode();
    this._treePanel.refresh();
  }

  /** 预览 / 新窗口调试 / 页内运行模块使用的上下文 */
  _ioRunCtx() {
    return {
      getPageId: () => (this._exportPageMeta?.id && String(this._exportPageMeta.id).trim()) || 'unnamed',
      getDesignBodyHtmlForExportAndRun: () => this._getDesignBodyHtmlForExportAndRun(),
      pageData: this._pageData,
      log: (msg) => console.log(msg),
      shadowRoot: this.shadowRoot,
      setInlineRunDesignLocked: (locked) => this._setInlineRunDesignLocked(locked),
    };
  }

  _openExportDialog() {
    this._serverExportCtl?.openExportDialog();
  }

  /**
   * 构建保存/导入用的完整源码串，并缓存 script/meta 后缀供「仅 HTML」模式下应用源码时拼回。
   * @returns {{ bodyHtml: string, scriptSuffix: string, metaSuffix: string, full: string }}
   */
  _buildSourceBundle() {
    const bodyHtml = this._canvas.getHtmlWithIds();
    // 函数/数据定义全部存在 __designer_meta__，不再生成 <script> 预览块
    const scriptSuffix = '';
    let metaSuffix = '';
    try {
      const state = this._pageData.getState?.();
      if (state) {
        const json = JSON.stringify(state).replace(/</g, '\\u003c');
        metaSuffix = `\n<script type="application/json" id="__designer_meta__">${json}<\/script>`;
      }
    } catch (e) {
      console.warn('[designer-app] 导出 __designer_meta__ 失败', e);
    }
    const full = `${bodyHtml}${scriptSuffix}${metaSuffix}`;
    return { bodyHtml, scriptSuffix, metaSuffix, full };
  }

  /**
   * 保存到服务器：完整 HTML + script + __designer_meta__（与导入一致）。
   */
  _getDesignSourceViewHtml() {
    return this._buildSourceBundle().full;
  }

  /**
   * 画布序列化后若误含整页 `<template id="cmx-page-template-…">` 外壳，则只取模板内设计 HTML，
   * 避免再次 wrap 导致嵌套模板、运行态与导出不一致、组件「丢失」。
   */
  _getDesignBodyHtmlForExportAndRun() {
    const raw = this._canvas.getExportHtml();
    const extracted = extractCmxPageDesignBodyFromScalerHtml(raw);
    return extracted != null ? extracted : raw;
  }

  _bindEvents() {
    // 画布：节点选中 → 仅更新属性面板（源码 / 结构树不与画布选区联动）
    this._canvas.addEventListener('node-selected', (e) => {
      const node = e.detail.node;
      if (node) {
        this._inspector.setNode(node, this._canvas);
        this._treePanel.highlightNode(node.dataset?.nodeId);
      } else {
        this._inspector.clearNode();
        this._treePanel.highlightNode(null);
      }
    });

    // 画布：内容变化 → 仅同步结构树（不刷新源码区；结构树复用行节点、避免整段 innerHTML）
    this._canvas.addEventListener('canvas-changed', () => {
      this._scheduleRefresh({ tree: true });
    });

    // 属性面板变更不自动推送到源码区（与画布/源码联动切断；画布仍会 canvas-changed 更新结构树）

    // 属性 / 样式 / 事件变更 → 推送源码、更新结构树
    this._inspector.addEventListener('inspector-change', (e) => {
      const type = e.detail?.type;
      if (type === 'event') {
        // 事件绑定变更：写入 canvas 历史并触发 canvas-changed
        this._canvas._pushHistory?.();
        this._canvas._emitChanged?.();
      }
      this._scheduleRefresh({ source: true, tree: type === 'event' });
    });

    this._inspector.addEventListener('inspector-console-mirror-change', (e) => {
      const d = e.detail || {};
      this._consoleMirrorLevels = {
        log: !!d.log,
        warn: !!d.warn,
        error: !!d.error,
      };
    });

    // page-data 变化（数据/函数/服务）→ 更新源码
    this._pageData.addEventListener('page-data-changed', () => {
      this._scheduleRefresh({ source: true });
    });

    this._pageData.addEventListener('model-selected', (e) => {
      const model = e.detail?.model || null;
      if (model) this._inspector.setModel(model, this._pageData);
      else this._inspector.clearNode();
    });

    this._pageData.addEventListener('model-column-selected', (e) => {
      const d = e.detail || {};
      if (d.model && d.column) this._inspector.setModelColumn(d.model, d.column, d.path || '', this._pageData);
    });

    this._source.addEventListener('source-show-script-toggle', (e) => {
      this._sourceShowScript = !!e.detail?.show;
      this._scheduleRefresh({ source: true });
    });

    // 源码面板：应用 → 同步到画布（先应用 __designer_meta__ 再剥 script）
    this._source.addEventListener('source-apply', (e) => {
      if (this._inlineRunDesignLocked) {
        console.warn('页内运行进行中：已阻止「应用源码到画布」。');
        return;
      }
      let raw = e.detail.html;
      if (!this._sourceShowScript && this._sourceBundle) {
        raw = `${String(raw).trimEnd()}${this._sourceBundle.scriptSuffix}${this._sourceBundle.metaSuffix}`;
      }
      const wrapped = /<\s*html[\s>]/i.test(raw)
        ? raw
        : `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${raw}</body></html>`;
      const docFull = new DOMParser().parseFromString(wrapped, 'text/html');
      const metaEl = docFull.getElementById('__designer_meta__');
      if (metaEl) {
        try {
          this._pageData.setState(JSON.parse(metaEl.textContent));
        } catch (_) {}
        metaEl.remove();
      }
      const bodyHtmlForCanvasRaw = docFull.body ? docFull.body.innerHTML : raw;
      const bodyHtmlForCanvas = extractCmxPageDesignBodyFromScalerHtml(bodyHtmlForCanvasRaw)
        || bodyHtmlForCanvasRaw;
      const { html: bodyNoScript } = stripDesignScriptsFromHtmlFragment(bodyHtmlForCanvas);
      this._canvas.setHtml(bodyNoScript);
      this._importedScriptForSource = '';
      this._pageData.setCanvasHtml?.(this._canvas.getHtml());
      this._inspector.clearNode();
      this._treePanel.refresh();
      this._refreshSource();
    });

    // 结构树点击 → 选中画布节点（源码光标不与画布联动）
    this._treePanel.addEventListener('tree-select', (e) => {
      const id = e.detail?.nodeId;
      if (id) this._canvas.selectNodeById(id);
    });

    // 顶栏：导入文件 + ShellBar 扩展事件（与 Portal 对齐的占位反馈）
    this.shadowRoot.querySelector('designer-topbar').addEventListener('toolbar-action', async (e) => {
      const { type } = e.detail;
      if (type === 'help') return // 占位：文档/向导未接入

      if (type === 'settings') return // 占位：偏好设置未接入

      if (type === 'menu' || type === 'notifications-click' || type === 'product-switch-click') return // 占位反馈

      if (type === 'profile-account' || type === 'profile-settings' || type === 'profile-logout') return // 占位反馈

      if (type === 'ws-node') {
        this._openWorkspaceNodeDialog();
        return;
      }
      if (type === 'debug-mode-toggle') {
        setDesignerDebugMode(!!e.detail?.on);
        this._canvas?.rehydrateEvents?.();
        return;
      }
    });
  }

  _bindResize() {
    bindHorizontalDrag(this.shadowRoot.getElementById('splL'), (dx) => {
      this._layout.leftWidth = clamp(this._layout.leftWidth + dx, WORKBENCH.leftMin, WORKBENCH.leftMax);
      this._applyLayout();
    });

    bindHorizontalDrag(this.shadowRoot.getElementById('splR'), (dx) => {
      this._layout.rightWidth = clamp(this._layout.rightWidth - dx, WORKBENCH.rightMin, WORKBENCH.rightMax);
      this._applyLayout();
    });

    bindVerticalDrag(this.shadowRoot.getElementById('splTree'), (dy) => {
      this._layout.treeHeight = clamp(this._layout.treeHeight - dy, WORKBENCH.treeMin, WORKBENCH.treeMax);
      this._applyLayout();
    });
  }

  _applyLayout() {
    this._leftPane.style.width    = `${this._layout.leftWidth}px`;
    this._rightPane.style.width   = `${this._layout.rightWidth}px`;
    this._leftTreeWrap.style.flex = `0 0 ${this._layout.treeHeight}px`;
  }

  /** 底部「画布 / 源码」Tab：切换子视图；进入源码时从画布同步一次 */
  _bindPageSubTabs() {
    const sr = this.shadowRoot;
    const panes = {
      canvas: sr.getElementById('pageSubCanvas'),
      source: sr.getElementById('pageSubSource'),
    };
    const tabs = sr.querySelectorAll('.page-sub-tab-btn');
    const setView = (sub) => {
      if (sub !== 'canvas' && sub !== 'source') return;
      this._pageSubView = sub;
      for (const pane of Object.values(panes)) {
        if (!pane) continue;
        const on = pane.dataset.sub === sub;
        pane.classList.toggle('active', on);
      }
      for (const btn of tabs) {
        const on = btn.dataset.sub === sub;
        btn.classList.toggle('active', on);
        btn.setAttribute('aria-selected', on ? 'true' : 'false');
      }
      if (sub === 'source') this._refreshSource();
    };
    for (const btn of tabs) {
      btn.addEventListener('click', () => setView(btn.dataset.sub || 'canvas'));
    }
  }

  /**
   * 从画布重建源码 bundle；默认仅在「源码」子 Tab 激活时写入 CodeMirror。
   * @param {boolean} [forceEditor] 为 true 时无论当前子 Tab 均写入编辑器（保存/导出打开与提交前同步展示）
   */
  _refreshSource(forceEditor = false) {
    this._sourceBundle = this._buildSourceBundle();
    const display = this._sourceShowScript ? this._sourceBundle.full : this._sourceBundle.bodyHtml;
    this._source?.syncShowScriptSwitch?.(this._sourceShowScript);
    if (this._pageSubView === 'source' || forceEditor) {
      this._source.setContent(display, { bypassMutationLock: true });
    }
  }

  /**
   * 在下一帧合并执行 source/tree 刷新；同帧内多次 dragover/inspector/page-data
   * 变更只会触发一次重活，显著降低拖拽与连续编辑时的卡顿。
   * @param {{ source?: boolean, tree?: boolean }} flags
   */
  _scheduleRefresh(flags) {
    this._pendingRefresh = this._pendingRefresh || { source: false, tree: false };
    if (flags.source) this._pendingRefresh.source = true;
    if (flags.tree)   this._pendingRefresh.tree   = true;
    if (this._refreshScheduled) return;
    this._refreshScheduled = true;
    requestAnimationFrame(() => {
      this._refreshScheduled = false;
      const f = this._pendingRefresh;
      this._pendingRefresh = null;
      if (!f) return;
      if (f.source) this._refreshSource();
      if (f.tree)   this._treePanel?.refresh();
    });
  }

  _setInlineRunDesignLocked(locked) {
    this._inlineRunDesignLocked = !!locked;
    this._canvas?.setMutationLocked?.(locked);
    this._source?.setMutationLocked?.(locked);
  }

  cleanup() {
    if (this._onBeforeUnload) {
      window.removeEventListener('beforeunload', this._onBeforeUnload);
      this._onBeforeUnload = null;
    }
    uninstallCmxConsoleTap();
  }
}

customElements.define('designer-app', DesignerApp);
