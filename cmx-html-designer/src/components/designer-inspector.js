/**
 * <designer-inspector> — 右侧属性/样式/事件/调试面板
 *
 * 使用 ui5-tab-container + ui5-tab 管理四个面板。
 * 表单控件全部使用 SAP UI5 Web Components。
 *
 * 公开方法：
 *   setNode(el, canvas)  绑定选中节点
 *   clearNode()          清除选中
 *   log(msg, level?)     写入调试日志；level 为 log | warn | error 时按级别着色（缺省 log）
 *
 * 派发事件：inspector-change  detail: { type }
 *          inspector-console-mirror-change  detail: { log, warn, error } — 各级别是否同步到调试日志
 */
import registry, { STYLE_GROUPS } from '../metadata/tag-registry.js';
import { getCustomInspector } from '../lib/plugin-registry.js';
import { escapeAttr, getStyleValue } from '../utils/html-utils.js';
import { DesignerBaseComponent } from './designer-base-component.js';
import { TabManager } from '../utils/tab-manager.js';
import {
  attachCodeMirrorResize,
  detachCodeMirrorResize,
  CM_RESIZE_HOST_CLASS,
} from '../utils/codemirror-resize.js';
import { BIND_POPOVER_LAYOUT } from './designer-inspector/bind-popover-layout.js';
import { DESIGNER_INSPECTOR_SHELL_STYLE } from './designer-inspector/designer-inspector-shell-style.js';
import { DESIGNER_INSPECTOR_SHELL_TEMPLATE } from './designer-inspector/designer-inspector-shell-template.js';
import { loadCodeMirrorJsBundle } from '../lib/codemirror-loader.js';
import { cmxCodeMirrorExtensions } from '../utils/codemirror-theme.js';
import { getEventScriptHintHtml } from './designer-inspector/event-script-hints.js';
import {
  MODEL_EVENT_PRESETS,
  getModelEventScriptHintHtml,
} from './designer-page-data/models-event-script-hints.js';
import {
  getModelInspectorMeta,
  renderColumnDetailPropsInspector,
  renderModelPropsInspector,
} from './designer-inspector/model-props-inspector.js';

/** 调试日志：时间戳 `toTimeString` 截取长度（hh:mm:ss）与总字符上限 */
const DEBUG_LOG = {
  timeSliceLen: 8,
  maxChars: 4000,
};

/* ─────────────────────────────── 组件 ───────────────────────────────────── */
export class DesignerInspector extends DesignerBaseComponent {
  constructor() {
    super();
    this._node = null;
    this._canvas = null;
    this._pageDataComp = null;
    this._model = null;
    this._modelColumn = null;
    this._modelColumnPath = '';
  }

  styles() { return DESIGNER_INSPECTOR_SHELL_STYLE; }

  template() { return DESIGNER_INSPECTOR_SHELL_TEMPLATE; }

  init() {
    this._nodeBadge  = this.shadowRoot.getElementById('nodeBadge');
    this._attrPanel  = this.shadowRoot.getElementById('attrPanel');
    this._stylePanel = this.shadowRoot.getElementById('stylePanel');
    this._eventPanel = this.shadowRoot.getElementById('eventPanel');
    this._debugLog   = this.shadowRoot.getElementById('debugLog');

    this._evtPanelGen = 0;
    this._evtCmLock = Promise.resolve();

    this._bindDebug();
  }

  /* ── 公开方法 ─────────────────────────────────────────────────────────── */

  setPageData(pageDataComponent) {
    this._pageDataComp = pageDataComponent;
  }

  setNode(node, canvas) {
    this._node   = node;
    this._canvas = canvas;
    this._model  = null;
    this._modelColumn = null;
    this._modelColumnPath = '';
    this._renderAll();
  }

  setModel(model, pageDataComponent = null) {
    this._node = null;
    this._canvas = null;
    this._model = model || null;
    this._modelColumn = null;
    this._modelColumnPath = '';
    if (pageDataComponent) this._pageDataComp = pageDataComponent;
    this._renderAll();
  }

  setModelColumn(model, column, path = '', pageDataComponent = null) {
    this._node = null;
    this._canvas = null;
    this._model = model || null;
    this._modelColumn = column || null;
    this._modelColumnPath = path || '';
    if (pageDataComponent) this._pageDataComp = pageDataComponent;
    this._renderAll();
  }

  clearNode() {
    this._node   = null;
    this._canvas = null;
    this._model  = null;
    this._modelColumn = null;
    this._modelColumnPath = '';
    this._renderEmpty();
  }

  /**
   * @param {string} msg
   * @param {'log' | 'warn' | 'error'} [level='log']
   */
  log(msg, level = 'log') {
    if (!this._debugLog) return;
    const t = new Date().toTimeString().slice(0, DEBUG_LOG.timeSliceLen);
    const lvl = level === 'warn' || level === 'error' ? level : 'log';
    const line = document.createElement('span');
    line.className = `debug-log-line debug-log-line--${lvl}`;
    line.textContent = `[${t}] ${String(msg)}`;
    this._debugLog.appendChild(line);
    while (this._debugLog.textContent.length > DEBUG_LOG.maxChars && this._debugLog.firstChild) {
      this._debugLog.removeChild(this._debugLog.firstChild);
    }
  }

  /* ── 调试按钮 ─────────────────────────────────────────────────────────── */

  _bindDebug() {
    /* Tab 切换 */
    new TabManager(this.shadowRoot, '.tab-btn', '.tab-panel');

    this.shadowRoot.getElementById('clearDebugLogBtn')?.addEventListener('click', () => {
      if (this._debugLog) this._debugLog.replaceChildren();
    });

    const mirrorIds = ['consoleMirrorLog', 'consoleMirrorWarn', 'consoleMirrorError'];
    const emitMirror = () => {
      const logSw = this.shadowRoot.getElementById('consoleMirrorLog');
      const warnSw = this.shadowRoot.getElementById('consoleMirrorWarn');
      const errSw = this.shadowRoot.getElementById('consoleMirrorError');
      if (!logSw && !warnSw && !errSw) return;
      this.dispatchEvent(
        new CustomEvent('inspector-console-mirror-change', {
          bubbles: true,
          composed: true,
          detail: {
            log: !!logSw?.checked,
            warn: !!warnSw?.checked,
            error: !!errSw?.checked,
          },
        }),
      );
    };
    mirrorIds.forEach((id) => {
      this.shadowRoot.getElementById(id)?.addEventListener('change', emitMirror);
    });
    queueMicrotask(emitMirror);
  }

  /* ── 渲染主流程 ───────────────────────────────────────────────────────── */

  _renderEmpty() {
    this._nodeBadge.className = 'node-badge empty';
    this._nodeBadge.textContent = '当前未选中元素';
    const hint = '<p style="color:var(--sapContent_NonInteractiveIconColor);font-size:12px">请先在设计区选中一个元素</p>';
    this._attrPanel.innerHTML  = hint;
    this._stylePanel.innerHTML = hint;
    this._eventPanel.innerHTML = hint;
  }

  _renderAll() {
    if (this._modelColumn) { this._renderModelColumnAll(); return; }
    if (this._model) { this._renderModelAll(); return; }
    if (!this._node) { this._renderEmpty(); return; }
    const tag  = this._node.tagName.toLowerCase();
    const id   = this._node.dataset.nodeId || '-';
    const meta = registry.get(tag);

    this._nodeBadge.className = 'node-badge';
    this._nodeBadge.innerHTML = `
      <span class="tag-name">&lt;${tag}&gt;</span>
      <span>${meta.description}</span>
      <span class="node-id">#${id}</span>`;

    this._renderAttrs(meta);
    this._renderStyles(meta);
    this._renderEvents(meta);
  }

  _renderModelAll() {
    const model = this._model;
    const meta = getModelInspectorMeta(model.modelType);
    this._evtPanelGen = (this._evtPanelGen || 0) + 1;
    this._currentEvtName = null;
    detachCodeMirrorResize(this._evtCmView);
    this._evtCmView?.destroy();
    this._evtCmView = null;

    this._nodeBadge.className = 'node-badge model';
    this._nodeBadge.innerHTML = `
      <span class="tag-name">${meta.label}</span>
      <span>页面级模型</span>
      <span class="node-id">${model.instanceId || '-'}</span>`;

    this._attrPanel.innerHTML = '';
    renderModelPropsInspector({
      model,
      pageData: this._pageDataComp || null,
      mount: this._attrPanel,
      onChange: () => {
        this._pageDataComp?._emitPageDataChanged?.();
        this._pageDataComp?.refreshModelsList?.(false);
        this._nodeBadge.querySelector('.node-id').textContent = model.instanceId || '-';
        this._emit('model');
      },
    });

    const hint = '<p style="color:var(--sapContent_NonInteractiveIconColor);font-size:12px">模型没有画布样式；结构型配置请在「模型」页继续编辑。</p>';
    this._stylePanel.innerHTML = hint;
    this._renderModelEvents(model);
  }

  _renderModelColumnAll() {
    const model = this._model;
    const column = this._modelColumn;
    this._evtPanelGen = (this._evtPanelGen || 0) + 1;
    this._currentEvtName = null;
    detachCodeMirrorResize(this._evtCmView);
    this._evtCmView?.destroy();
    this._evtCmView = null;

    this._nodeBadge.className = 'node-badge model';
    this._nodeBadge.innerHTML = `
      <span class="tag-name">CmxColumn</span>
      <span>${model?.instanceId || 'CmxColumnModel'}</span>
      <span class="node-id">${column?.id || '-'}</span>`;

    this._attrPanel.innerHTML = '';
    renderColumnDetailPropsInspector({
      model,
      column,
      path: this._modelColumnPath,
      mount: this._attrPanel,
      onChange: () => {
        this._pageDataComp?._emitPageDataChanged?.();
        this._pageDataComp?.refreshModelsList?.(true);
        this._nodeBadge.querySelector('.node-id').textContent = column?.id || '-';
        this._emit('model');
      },
    });

    const hint = '<p style="color:var(--sapContent_NonInteractiveIconColor);font-size:12px">列没有画布样式；分组和列顺序仍在「模型」页编辑。</p>';
    this._stylePanel.innerHTML = hint;
    this._eventPanel.innerHTML = '<p style="color:var(--sapContent_NonInteractiveIconColor);font-size:12px">列事件/脚本请通过模型或页面事件脚本组织。</p>';
  }

  /* ── 属性面板 ─────────────────────────────────────────────────────────── */

  _renderAttrs(meta) {
    const node = this._node;

    /* 插件 hook：tag 有专用 Inspector 渲染函数时优先使用 */
    const customFn = getCustomInspector(node.tagName.toLowerCase());
    if (customFn) {
      this._attrPanel.innerHTML = '';
      try {
        customFn({
          node,
          meta,
          mount: this._attrPanel,
          pageData: this._pageDataComp || null,
          onChange: () => {
            this.dispatchEvent(new CustomEvent('inspector-change', {
              bubbles: true, composed: true, detail: { type: 'attr' },
            }));
          },
        });
      } catch (err) {
        console.error('[designer-inspector] customInspector failed:', err);
      }
      return;
    }

    const isUi5 = node.tagName.toLowerCase().startsWith('ui5-');

    /* 直接文本节点（排除子元素，只取纯文本） */
    const directText = [...node.childNodes]
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent)
      .join('');
    const showText = directText.trim().length > 0 || node.children.length === 0;
    const textRow = showText ? `
      <div class="field-row">
        <ui5-label>文本内容</ui5-label>
        <ui5-input id="nodeTextContent" value="${escapeAttr(directText.trim())}" placeholder="元素显示文字"></ui5-input>
      </div>` : '';

    const metaRows = meta.attrs.map((a) => this._attrRow(a, node.getAttribute(a.name), node)).join('');
    const slotSection = isUi5 ? this._slotSection(meta, node) : '';

    this._attrPanel.innerHTML = `
      <div class="prop-card">
        <div class="prop-card-header">
          <ui5-title level="H6">元数据属性 · ${meta.description}</ui5-title>
        </div>
        <div class="prop-card-body" id="metaAttrs">
          ${textRow}
          ${metaRows}
          <div class="meta-source">来源: ${escapeAttr(meta.__metaPath || '内置默认元数据')}</div>
        </div>
      </div>
      <cmx-panel title="自定义属性" data-cmx-skin="none">
        <div class="prop-card-body">
          <div class="field-row">
            <ui5-label>属性名</ui5-label>
            <ui5-input id="custAttrName" placeholder="例如 data-x, aria-label"></ui5-input>
          </div>
          <div class="field-row">
            <ui5-label>属性值</ui5-label>
            <ui5-input id="custAttrVal" placeholder="属性值"></ui5-input>
          </div>
          <ui5-button id="setAttrBtn">设置 / 更新属性</ui5-button>
          <ui5-button design="Negative" id="rmAttrBtn">删除该属性</ui5-button>
        </div>
      </cmx-panel>
      ${slotSection}`;

    /* 文本内容字段 */
    const textInput = this._attrPanel.querySelector('#nodeTextContent');
    if (textInput) {
      textInput.addEventListener('change', () => {
        const newText = textInput.value;
        /* 替换所有直接文本节点，保留子元素 */
        [...node.childNodes]
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .forEach((n) => n.remove());
        if (newText) node.prepend(document.createTextNode(newText));
        this._emit('attr');
      });
    }

    /* 数据绑定按钮弹出层 */
    this._attrPanel.addEventListener('click', (e) => {
      const btn = e.target.closest('.bind-btn');
      if (!btn) { this._attrPanel.querySelector('.bind-popover')?.remove(); return; }
      e.stopPropagation();
      this._attrPanel.querySelector('.bind-popover')?.remove();

      const attrName = btn.dataset.bindAttr;
      const vars = (this._pageDataComp?._pageData || []).filter(d => d.name);

      const popover = document.createElement('div');
      popover.className = 'bind-popover';

      if (vars.length) {
        vars.forEach(d => {
          const item = document.createElement('div');
          item.className = 'bind-popover-item';
          item.textContent = `$data.${d.name}`;
          item.addEventListener('click', () => {
            node.setAttribute(`data-bind-${attrName}`, d.name);
            node.setAttribute(attrName, `{{${d.name}}}`);
            this._emit('attr');
            this._renderAttrs(registry.get(node.tagName.toLowerCase()));
          });
          popover.appendChild(item);
        });
      } else {
        const empty = document.createElement('div');
        empty.className = 'bind-popover-empty';
        empty.textContent = '暂无变量，请先在数据 Tab 添加';
        popover.appendChild(empty);
      }

      if (node.getAttribute(`data-bind-${attrName}`)) {
        const clear = document.createElement('div');
        clear.className = 'bind-popover-clear';
        clear.textContent = '× 清除绑定';
        clear.addEventListener('click', () => {
          node.removeAttribute(`data-bind-${attrName}`);
          if (/^\{\{[^}]+\}\}$/.test(node.getAttribute(attrName) || '')) node.removeAttribute(attrName);
          this._emit('attr');
          this._renderAttrs(registry.get(node.tagName.toLowerCase()));
        });
        popover.appendChild(clear);
      }

      const btnRect   = btn.getBoundingClientRect();
      const panelRect = this._attrPanel.getBoundingClientRect();
      const top = btnRect.bottom - panelRect.top + this._attrPanel.scrollTop + BIND_POPOVER_LAYOUT.gapBelowButtonPx;
      const left = Math.max(0, btnRect.right - panelRect.left - BIND_POPOVER_LAYOUT.minWidthPx);
      popover.style.cssText = `position:absolute;top:${top}px;left:${left}px;`;
      this._attrPanel.appendChild(popover);
    }, true);

    /* 元数据字段联动 */
    this._attrPanel.querySelector('#metaAttrs').addEventListener('change', (e) => {
      const el = e.target.closest('[data-attr]');
      if (!el) return;
      const name = el.dataset.attr;
      const tag  = el.tagName.toLowerCase();
      if (tag === 'ui5-checkbox') {
        el.checked ? node.setAttribute(name, '') : node.removeAttribute(name);
      } else if (tag === 'ui5-select') {
        const v = el.selectedOption?.value ?? '';
        v === '' ? node.removeAttribute(name) : node.setAttribute(name, v);
      } else {
        const v = el.value ?? '';
        v === '' ? node.removeAttribute(name) : node.setAttribute(name, v);
      }
      this._emit('attr');
    });

    this._attrPanel.querySelector('#setAttrBtn').addEventListener('click', () => {
      const name = this._attrPanel.querySelector('#custAttrName').value.trim();
      const val  = this._attrPanel.querySelector('#custAttrVal').value;
      if (!name) return;
      node.setAttribute(name, val);
      this._emit('attr');
      this.log(`属性已设置: ${name}="${val}"`);
    });
    this._attrPanel.querySelector('#rmAttrBtn').addEventListener('click', () => {
      const name = this._attrPanel.querySelector('#custAttrName').value.trim();
      if (!name) return;
      node.removeAttribute(name);
      this._emit('attr');
      this.log(`属性已删除: ${name}`);
    });

    if (isUi5) this._bindSlotSection(node);
  }

  _attrRow(meta, currentVal, node = null) {
    const val = currentVal ?? '';
    const esc = escapeAttr(val);

    if (meta.type === 'boolean') {
      return `<div class="field-row checkbox-row">
        <ui5-checkbox data-attr="${meta.name}" ${currentVal !== null ? 'checked' : ''} text="${escapeAttr(meta.label)}"></ui5-checkbox>
      </div>`;
    }
    if (meta.type === 'select') {
      const opts = (meta.options || []).map((o) =>
        `<ui5-option value="${escapeAttr(o)}" ${val === o ? 'selected' : ''}>${o === '' ? '— 请选择 —' : escapeAttr(o)}</ui5-option>`
      ).join('');
      return `<div class="field-row">
        <ui5-label>${escapeAttr(meta.label)}</ui5-label>
        <ui5-select data-attr="${meta.name}">${opts}</ui5-select>
      </div>`;
    }
    const itype = meta.type === 'number' ? 'Number' : meta.type === 'url' ? 'URL' : 'Text';
    const isBound = node ? !!node.getAttribute(`data-bind-${meta.name}`) : false;
    return `<div class="field-row">
      <ui5-label>${escapeAttr(meta.label)}</ui5-label>
      <div style="display:flex;gap:3px;align-items:center;min-width:0;">
        <ui5-input type="${itype}" data-attr="${meta.name}" value="${esc}"
          placeholder="${escapeAttr(meta.placeholder || '')}"
          style="flex:1;min-width:0;${isBound ? 'border-color:var(--sapPositiveColor,#30914c)' : ''}"></ui5-input>
        <button class="bind-btn${isBound ? ' bound' : ''}" data-bind-attr="${escapeAttr(meta.name)}" title="绑定数据变量">⇄</button>
      </div>
    </div>`;
  }

  _slotSection(meta, node) {
    const presets = Array.isArray(meta.slots) ? meta.slots : [];
    const chips = presets.length
      ? presets.map((s) => `<button class="slot-chip" data-slot="${escapeAttr(s)}">${escapeAttr(s)}</button>`).join('')
      : '<span style="font-size:11px;color:var(--sapContent_NonInteractiveIconColor)">无推荐 slot</span>';

    return `
      <div class="prop-card">
        <div class="prop-card-header"><ui5-title level="H6">UI5 Slot</ui5-title></div>
        <div class="prop-card-body">
          <div class="field-row">
            <ui5-label>slot 名称</ui5-label>
            <ui5-input id="slotName" value="${escapeAttr(node.getAttribute('slot') || '')}" placeholder="${presets[0] ? `例如 ${presets[0]}` : 'slot 名称'}"></ui5-input>
          </div>
          <div class="slot-chips" id="slotChips">${chips}</div>
          <ui5-button id="setSlotBtn">设置 slot</ui5-button>
          <ui5-button design="Negative" id="clearSlotBtn">清除 slot</ui5-button>
        </div>
      </div>`;
  }

  _bindSlotSection(node) {
    const slotName = this._attrPanel.querySelector('#slotName');
    if (!slotName) return;
    this._attrPanel.querySelector('#setSlotBtn')?.addEventListener('click', () => {
      const v = slotName.value.trim();
      if (!v) return;
      node.setAttribute('slot', v);
      this._emit('attr');
      this.log(`slot 已设置: ${v}`);
    });
    this._attrPanel.querySelector('#clearSlotBtn')?.addEventListener('click', () => {
      node.removeAttribute('slot');
      slotName.value = '';
      this._emit('attr');
      this.log('slot 已清除');
    });
    this._attrPanel.querySelector('#slotChips')?.querySelectorAll('.slot-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const v = btn.dataset.slot;
        node.setAttribute('slot', v);
        slotName.value = v;
        this._emit('attr');
        this.log(`slot 已设置: ${v}`);
      });
    });
  }

  /* ── 样式面板 ─────────────────────────────────────────────────────────── */

  _renderStyles(meta) {
    const node   = this._node;
    const groups = (meta.styles || STYLE_GROUPS).map((g) => {
      const rows = g.styles.map((s) => this._styleRow(s, node)).join('');
      const isLayout = g.id === 'layout';
      return `
        <details class="style-details" ${isLayout ? 'open' : ''}>
          <summary>${g.label}</summary>
          <div class="style-detail-body">${rows}</div>
        </details>`;
    }).join('');

    this._stylePanel.innerHTML = `
      ${groups}
      <div class="prop-card">
        <div class="prop-card-header"><ui5-title level="H6">原始 style</ui5-title></div>
        <div class="prop-card-body">
          <ui5-textarea id="rawStyle" rows="3"
            placeholder="color:red; padding:8px;"
            value="${escapeAttr(node.getAttribute('style') || '')}">
          </ui5-textarea>
          <ui5-button id="applyRawBtn">应用原始样式</ui5-button>
        </div>
      </div>`;

    /* style 变更：change 事件（ui5-select）+ input 事件（ui5-input） */
    const onStyleChange = (e) => {
      const el = e.target.closest('[data-style]');
      if (!el) return;
      const tag = el.tagName.toLowerCase();
      let v = '';
      if (tag === 'ui5-select') v = el.selectedOption?.value ?? '';
      else if (tag === 'input') v = el.value;
      else v = el.value ?? '';
      node.style[el.dataset.style] = v;
      this._stylePanel.querySelector('#rawStyle').value = node.getAttribute('style') || '';
      this._emit('style');
    };
    this._stylePanel.addEventListener('change', onStyleChange);
    this._stylePanel.addEventListener('input',  onStyleChange);

    this._stylePanel.querySelector('#applyRawBtn').addEventListener('click', () => {
      node.setAttribute('style', this._stylePanel.querySelector('#rawStyle').value.trim());
      this._renderStyles(meta);
      this._emit('style');
      this.log('原始样式已应用');
    });
  }

  _styleRow(meta, node) {
    const val = getStyleValue(node, meta.prop);

    if (meta.type === 'color') {
      return `<div class="field-row">
        <ui5-label>${escapeAttr(meta.label)}</ui5-label>
        <input type="color" data-style="${meta.prop}" value="${escapeAttr(val || '#000000')}"/>
      </div>`;
    }
    if (meta.type === 'select') {
      const opts = (meta.options || []).map((o) =>
        `<ui5-option value="${escapeAttr(o)}" ${val === o ? 'selected' : ''}>${o === '' ? '— 请选择 —' : escapeAttr(o)}</ui5-option>`
      ).join('');
      return `<div class="field-row">
        <ui5-label>${escapeAttr(meta.label)}</ui5-label>
        <ui5-select data-style="${meta.prop}">${opts}</ui5-select>
      </div>`;
    }
    return `<div class="field-row">
      <ui5-label>${escapeAttr(meta.label)}</ui5-label>
      <ui5-input type="${meta.type === 'number' ? 'Number' : 'Text'}" data-style="${meta.prop}"
        value="${escapeAttr(val)}" placeholder="${escapeAttr(meta.placeholder || '')}"></ui5-input>
    </div>`;
  }

  /* ── 事件面板 ─────────────────────────────────────────────────────────── */

  _renderEvents(meta) {
    this._evtPanelGen = (this._evtPanelGen || 0) + 1;
    this._currentEvtName = null;
    this._knownEvents = meta.events || [];
    detachCodeMirrorResize(this._evtCmView);
    this._evtCmView?.destroy();
    this._evtCmView = null;

    const node   = this._node;
    const events = meta.events || [];

    const chips = events.map((evt) => {
      const hasCode = !!node.getAttribute(`data-event${evt}`);
      return `<button class="event-chip ${hasCode ? 'bound' : ''}" data-evt="${evt}">${evt}${hasCode ? ' ✓' : ''}</button>`;
    }).join('');

    this._eventPanel.innerHTML = `
      <div class="prop-card">
        <div class="prop-card-header"><ui5-title level="H6">事件列表（点击编辑）</ui5-title></div>
        <div class="prop-card-body">
          <div class="event-chips" id="evtChips">
            ${chips || '<span style="font-size:11px;color:var(--sapContent_NonInteractiveIconColor)">该标签无推荐事件</span>'}
          </div>
          <div style="margin-top:6px">
            <ui5-button design="Transparent" id="evtAddCustomBtn" icon="add" style="font-size:11px;">自定义事件...</ui5-button>
          </div>
        </div>
      </div>
      <div class="prop-card" id="evtEditor" style="display:none">
        <div class="prop-card-header">
          <ui5-title level="H6" id="evtEditorTitle">编辑事件</ui5-title>
        </div>
        <div class="prop-card-body">
          <div class="field-row" id="customEvtRow" style="display:none">
            <ui5-label>自定义事件名</ui5-label>
            <ui5-input id="customEvtName" placeholder="例如 scroll"></ui5-input>
          </div>
          <div class="field-row full">
            <ui5-label>处理脚本（函数体）</ui5-label>
          </div>
          <div id="evtScriptHint" class="evt-script-hint" aria-live="polite"></div>
          <div class="cm-toolbar">
            <ui5-button id="evtInsertDebuggerBtn" design="Transparent" icon="developer-settings" tooltip="在光标处插入 debugger;">插入 debugger</ui5-button>
          </div>
          <div class="field-row full evt-cm-field">
            <div id="evtCmHost" class="evt-cm-host ${CM_RESIZE_HOST_CLASS}"></div>
          </div>
          <ui5-button id="bindEvtBtn" design="Emphasized">绑定事件</ui5-button>
          <ui5-button design="Negative" id="rmEvtBtn">移除事件</ui5-button>
        </div>
      </div>`;

    this._eventPanel.querySelector('#evtChips').addEventListener('click', (e) => {
      const chip = e.target.closest('.event-chip');
      if (!chip) return;
      void this._openEvtEditor(chip.dataset.evt, node.getAttribute(`data-event${chip.dataset.evt}`) || '');
    });

    // 自定义事件按钮：显示自定义事件名输入行，打开编辑器
    this._eventPanel.querySelector('#evtAddCustomBtn')?.addEventListener('click', () => {
      const customRow = this._eventPanel.querySelector('#customEvtRow');
      if (customRow) customRow.style.display = '';
      this._currentEvtName = '';
      void this._openEvtEditor('', '');
    });

    this._eventPanel.querySelector('#customEvtName')?.addEventListener('input', (e) => {
      const custom = e.target.value.trim();
      this._currentEvtName = custom || '';
      if (custom) this._updateEvtScriptHint(custom);
    });

    this._eventPanel.querySelector('#bindEvtBtn').addEventListener('click', () => {
      let evt = this._currentEvtName ?? '';
      const code = this._evtCmView?.state.doc.toString().trim() ?? '';
      if (!evt) return;
      node.setAttribute(`data-event${evt}`, code);
      this._canvas?.attachHandler(node, evt, code);
      this._renderEvents(meta);
      this._emit('event');
      this.log(`事件已绑定: ${evt}`);
    });

    this._eventPanel.querySelector('#rmEvtBtn').addEventListener('click', () => {
      const evt = this._currentEvtName ?? '';
      if (!evt) return;
      this._canvas?.detachHandler(node, evt);
      node.removeAttribute(`data-event${evt}`);
      this._currentEvtName = null;
      this._renderEvents(meta);
      this._emit('event');
      this.log(`事件已移除: ${evt}`);
    });

    this._eventPanel.querySelector('#evtInsertDebuggerBtn')?.addEventListener('click', () => {
      const view = this._evtCmView;
      if (!view) return;
      const head = view.state.selection.main.head;
      view.dispatch({
        changes: { from: head, to: head, insert: 'debugger;\n' },
        selection: { anchor: head + 'debugger;\n'.length },
      });
      requestAnimationFrame(() => view.focus());
    });
  }

  _renderModelEvents(model) {
    this._evtPanelGen = (this._evtPanelGen || 0) + 1;
    this._currentEvtName = null;
    this._knownEvents = MODEL_EVENT_PRESETS[model.modelType] || [];
    detachCodeMirrorResize(this._evtCmView);
    this._evtCmView?.destroy();
    this._evtCmView = null;

    if (!model.events || typeof model.events !== 'object') model.events = {};
    const presets = this._knownEvents;
    const boundNames = Object.keys(model.events).filter((n) => model.events[n]);
    const customNames = boundNames.filter((n) => !presets.includes(n));
    const allChipNames = [...presets, ...customNames];

    const chips = allChipNames.map((evt) => {
      const hasCode = !!(model.events[evt] && model.events[evt].trim());
      return `<button class="event-chip ${hasCode ? 'bound' : ''}" data-evt="${escapeAttr(evt)}">${escapeAttr(evt)}${hasCode ? ' ✓' : ''}</button>`;
    }).join('');

    this._eventPanel.innerHTML = `
      <div class="prop-card">
        <div class="prop-card-header"><ui5-title level="H6">模型事件（点击编辑）</ui5-title></div>
        <div class="prop-card-body">
          <div class="event-chips" id="evtChips">
            ${chips || '<span style="font-size:11px;color:var(--sapContent_NonInteractiveIconColor)">该模型类型无内置事件</span>'}
          </div>
          <div style="margin-top:6px">
            <ui5-button design="Transparent" id="evtAddCustomBtn" icon="add" style="font-size:11px;">自定义事件...</ui5-button>
          </div>
        </div>
      </div>
      <div class="prop-card" id="evtEditor" style="display:none">
        <div class="prop-card-header">
          <ui5-title level="H6" id="evtEditorTitle">编辑事件</ui5-title>
        </div>
        <div class="prop-card-body">
          <div class="field-row" id="customEvtRow" style="display:none">
            <ui5-label>自定义事件名</ui5-label>
            <ui5-input id="customEvtName" placeholder="例如 ready"></ui5-input>
          </div>
          <div class="field-row full">
            <ui5-label>处理脚本（函数体）</ui5-label>
          </div>
          <div id="evtScriptHint" class="evt-script-hint" aria-live="polite"></div>
          <div class="cm-toolbar">
            <ui5-button id="evtInsertDebuggerBtn" design="Transparent" icon="developer-settings" tooltip="在光标处插入 debugger;">插入 debugger</ui5-button>
          </div>
          <div class="field-row full evt-cm-field">
            <div id="evtCmHost" class="evt-cm-host ${CM_RESIZE_HOST_CLASS}"></div>
          </div>
          <ui5-button id="bindEvtBtn" design="Emphasized">绑定事件</ui5-button>
          <ui5-button design="Negative" id="rmEvtBtn">移除事件</ui5-button>
        </div>
      </div>`;

    this._eventPanel.querySelector('#evtChips')?.addEventListener('click', (e) => {
      const chip = e.target.closest('.event-chip');
      if (!chip) return;
      const evt = chip.dataset.evt || '';
      void this._openModelEvtEditor(model, evt, model.events[evt] || '');
    });

    this._eventPanel.querySelector('#evtAddCustomBtn')?.addEventListener('click', () => {
      const customRow = this._eventPanel.querySelector('#customEvtRow');
      if (customRow) customRow.style.display = '';
      this._currentEvtName = '';
      void this._openModelEvtEditor(model, '', '');
    });

    this._eventPanel.querySelector('#customEvtName')?.addEventListener('input', (e) => {
      const custom = e.target.value.trim();
      this._currentEvtName = custom || '';
      if (custom) this._updateModelEvtScriptHint(model, custom);
    });

    this._eventPanel.querySelector('#bindEvtBtn')?.addEventListener('click', () => {
      const evt = this._currentEvtName ?? '';
      if (!evt) return;
      const code = this._evtCmView?.state.doc.toString() ?? '';
      if (code.trim()) model.events[evt] = code;
      else delete model.events[evt];
      this._pageDataComp?._emitPageDataChanged?.();
      this._pageDataComp?.refreshModelsList?.(true);
      this._renderModelEvents(model);
      this._emit('model-event');
      this.log(`模型事件已绑定: ${model.instanceId || model.modelType}.${evt}`);
    });

    this._eventPanel.querySelector('#rmEvtBtn')?.addEventListener('click', () => {
      const evt = this._currentEvtName ?? '';
      if (!evt) return;
      delete model.events[evt];
      this._currentEvtName = null;
      this._pageDataComp?._emitPageDataChanged?.();
      this._pageDataComp?.refreshModelsList?.(true);
      this._renderModelEvents(model);
      this._emit('model-event');
      this.log(`模型事件已移除: ${model.instanceId || model.modelType}.${evt}`);
    });

    this._eventPanel.querySelector('#evtInsertDebuggerBtn')?.addEventListener('click', () => {
      const view = this._evtCmView;
      if (!view) return;
      const head = view.state.selection.main.head;
      view.dispatch({
        changes: { from: head, to: head, insert: 'debugger;\n' },
        selection: { anchor: head + 'debugger;\n'.length },
      });
      requestAnimationFrame(() => view.focus());
    });
  }

  _updateModelEvtScriptHint(model, evtName) {
    const hint = this._eventPanel?.querySelector('#evtScriptHint');
    if (!hint) return;
    hint.innerHTML = getModelEventScriptHintHtml(model.modelType, evtName);
  }

  async _openModelEvtEditor(model, evt, code) {
    const editor = this._eventPanel.querySelector('#evtEditor');
    if (!editor) return;
    this._currentEvtName = evt;
    editor.style.display = '';
    this._eventPanel.querySelector('#evtEditorTitle').textContent = `编辑事件：${evt || '(待命名)'}`;
    this._updateModelEvtScriptHint(model, evt);

    const customRow = this._eventPanel.querySelector('#customEvtRow');
    const customInput = this._eventPanel.querySelector('#customEvtName');
    if (customRow && customInput) {
      const isCustom = evt === '' || (evt && !this._knownEvents?.includes(evt));
      customRow.style.display = isCustom ? '' : 'none';
      customInput.value = isCustom && evt ? evt : '';
    }

    const host = this._eventPanel.querySelector('#evtCmHost');
    if (!host) return;
    if (!this._evtCmView) {
      const gen = this._evtPanelGen;
      this._evtCmLock = this._evtCmLock.then(async () => {
        if (this._evtCmView) return;
        const view = await this._createEvtEditor(host, code);
        if (gen !== this._evtPanelGen || !host.isConnected) {
          detachCodeMirrorResize(view);
          view.destroy();
          return;
        }
        this._evtCmView = view;
      });
      await this._evtCmLock;
    }
    this._evtCmView?.dispatch({
      changes: { from: 0, to: this._evtCmView.state.doc.length, insert: code },
    });
    requestAnimationFrame(() => this._evtCmView?.focus());
  }

  _updateEvtScriptHint(evtName) {
    const hint = this._eventPanel?.querySelector('#evtScriptHint');
    if (!hint) return;
    hint.innerHTML = getEventScriptHintHtml(evtName);
  }

  async _openEvtEditor(evt, code) {
    const editor = this._eventPanel.querySelector('#evtEditor');
    if (!editor) return;
    this._currentEvtName = evt;   // 记录当前编辑的事件名，供绑定/移除按钮使用
    editor.style.display = '';
    this._eventPanel.querySelector('#evtEditorTitle').textContent = `编辑事件：${evt}`;
    this._updateEvtScriptHint(evt);

    // 自定义事件时显示输入行，并回填事件名
    const customRow = this._eventPanel.querySelector('#customEvtRow');
    const customInput = this._eventPanel.querySelector('#customEvtName');
    if (customRow && customInput) {
      const isCustom = evt === '' || (evt && !this._knownEvents?.includes(evt));
      customRow.style.display = isCustom ? '' : 'none';
      if (isCustom && evt) customInput.value = evt;
    }

    const host = this._eventPanel.querySelector('#evtCmHost');
    if (!host) return;

    if (!this._evtCmView) {
      const gen = this._evtPanelGen;
      this._evtCmLock = this._evtCmLock.then(async () => {
        if (this._evtCmView) return;
        const view = await this._createEvtEditor(host, code);
        if (gen !== this._evtPanelGen || !host.isConnected) {
          detachCodeMirrorResize(view);
          view.destroy();
          return;
        }
        this._evtCmView = view;
      });
      await this._evtCmLock;
    }
    this._evtCmView?.dispatch({
      changes: { from: 0, to: this._evtCmView.state.doc.length, insert: code },
    });
    requestAnimationFrame(() => this._evtCmView?.focus());
  }

  /* ── 事件代码编辑器 ─────────────────────────────────────────────────────── */

  async _createEvtEditor(host, initCode) {
    const {
      EditorView,
      basicSetup,
      EditorState,
      javascript,
      oneDark,
    } = await loadCodeMirrorJsBundle();
    const jsSupport = javascript();
    const completionSource = this._evtCompletionSource.bind(this);
    const view = new EditorView({
      parent: host,
      root: this.shadowRoot,
      state: EditorState.create({
        doc: initCode || '',
        extensions: [
          basicSetup,
          jsSupport,
          jsSupport.language.data.of({ autocomplete: completionSource }),
          ...cmxCodeMirrorExtensions(EditorView, oneDark),
        ],
      }),
    });
    attachCodeMirrorResize(view);
    return view;
  }

  _evtCompletionSource(context) {
    // $data.xxx 成员补全
    const dataMember = context.matchBefore(/\$data\.\w*/);
    if (dataMember) {
      const pageData = this._pageDataComp?._pageData || [];
      return {
        from: dataMember.from + '$data.'.length,
        validFor: /^\w*$/,
        options: pageData.filter(d => d.name).map(d => ({
          label:  d.name,
          type:   'variable',
          detail: d.type || 'string',
          info:   `页面变量 $data.${d.name}`,
          boost:  10,
        })),
      };
    }

    // 顶层标识符补全
    const word = context.matchBefore(/[\$\w]+/);
    if (!word || (word.from === word.to && !context.explicit)) return null;

    const pageFns  = this._pageDataComp?._pageFns     || [];
    const pageSvcs = this._pageDataComp?._pageServices || [];
    const modelOthers = this._model
      ? (this._pageDataComp?._models || []).filter((m) => m.id !== this._model.id && m.instanceId)
      : [];

    const options = [
      { label: '$data',      type: 'variable', detail: '页面数据对象', boost: 12,
        apply: (view, completion, from, to) => {
          view.dispatch({ changes: { from, to, insert: '$data.' } });
        },
      },
      { label: 'event',      type: 'variable', detail: '触发事件对象', boost: 11 },
      { label: 'event.target',     type: 'property', detail: '事件目标元素', boost: 8 },
      { label: 'event.detail',     type: 'property', detail: '自定义事件数据', boost: 7 },
      { label: 'event.preventDefault()', type: 'method', detail: '阻止默认行为', boost: 6 },
      ...(this._model ? [
        { label: 'host', type: 'variable', detail: '页面 Web Component 实例', boost: 10 },
        { label: 'this', type: 'keyword', detail: `当前模型实例（${this._model.modelType}）`, boost: 11 },
      ] : []),
      { label: 'console.log()',    type: 'method',   detail: '控制台输出', boost: 4 },
      { label: 'alert()',          type: 'function', detail: '弹出提示框', boost: 3 },
      { label: 'setTimeout()',     type: 'function', detail: '延时执行', boost: 2 },
      { label: 'fetch()',          type: 'function', detail: '发起网络请求', boost: 2 },
      ...pageFns.filter(f => f.name).map(f => ({
        label:  f.name,
        type:   'function',
        detail: '页面函数',
        boost:  10,
        apply:  `${f.name}(`,
      })),
      ...pageSvcs.filter(s => s.name).map(s => ({
        label:  s.name,
        type:   'function',
        detail: '页面服务',
        boost:  9,
        apply:  `${s.name}(`,
      })),
      ...modelOthers.map((m) => ({
        label:  m.instanceId,
        type:   'variable',
        detail: `模型实例（${m.modelType}）`,
        boost:  9,
      })),
    ];

    return { from: word.from, validFor: /^[\$\w]*$/, options };
  }

  /* ── 工具 ─────────────────────────────────────────────────────────────── */

  _emit(type) {
    this.dispatchEvent(new CustomEvent('inspector-change', {
      bubbles: true, composed: true, detail: { type }
    }));
  }
}

customElements.define('designer-inspector', DesignerInspector);
