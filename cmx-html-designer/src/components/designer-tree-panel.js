/**
 * <designer-tree-panel> — 画布结构树
 *
 * 公开方法:
 *   setScaler(el)        — 传入画布 scaler 元素（初始化一次）
 *   refresh()            — 与画布同步（复用已有行节点，避免整段 innerHTML）
 *   highlightNode(nodeId)— 高亮指定行（可选；默认不与画布选区联动）
 *
 * 派发事件:
 *   tree-select  detail: { nodeId }
 */

import { DesignerBaseComponent } from './designer-base-component.js';

const TREE_INDENT_BASE_PX = 6;
const TREE_INDENT_STEP_PX = 14;

const STYLE = `
  :host {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    background: var(--sapBackgroundColor, #111827);
  }

  .header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    background: var(--sapGroup_TitleBackground, #0b1220);
    border-top: 1px solid var(--sapGroup_TitleBorderColor, #334155);
    border-bottom: 1px solid var(--sapGroup_TitleBorderColor, #334155);
    font-size: 11px;
    font-weight: 600;
    color: var(--sapContent_LabelColor, #8fa7c0);
    flex-shrink: 0;
    user-select: none;
  }

  .scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-width: thin;
    padding: 2px 0;
  }

  .empty {
    padding: 12px 12px;
    font-size: 11px;
    color: var(--sapContent_NonInteractiveIconColor, #6c8093);
    font-style: italic;
  }

  .node-row {
    display: flex;
    align-items: center;
    height: 22px;
    cursor: pointer;
    user-select: none;
    position: relative;
    border-radius: 3px;
    margin: 0 3px;
  }
  .node-row:hover { background: var(--sapList_Hover_Background, #1a2b40); }
  .node-row.selected {
    background: var(--sapList_SelectionBackgroundColor, #0f2d5e);
    outline: 1px solid var(--sapHighlightColor, #0070f2);
    outline-offset: -1px;
  }

  .toggle {
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 8px;
    color: var(--sapContent_NonInteractiveIconColor, #6c8093);
    flex-shrink: 0;
    border-radius: 2px;
    transition: color 0.1s;
    cursor: pointer;
  }
  .toggle:hover { color: var(--sapTextColor, #e2e8f0); }
  .toggle.leaf { color: transparent; cursor: default; pointer-events: none; }

  .tag {
    font-family: Consolas, 'Courier New', monospace;
    font-size: 11px;
    color: var(--sapContent_LabelColor, #8fa7c0);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
  }
  .tag.is-ui5 { color: var(--sapBrandColor, #0070f2); }
  .tag.is-fiori { color: var(--sapLinkColor, #a78bfa); }
`;

export class DesignerTreePanel extends DesignerBaseComponent {
  constructor() {
    super();
    this._scaler    = null;
    this._collapsed = new Set();
    this._selected  = null;
  }

  styles() { return STYLE; }

  template() {
    return `
      <div class="header">
        <ui5-icon name="tree" style="font-size:13px"></ui5-icon>
        结构树
      </div>
      <div class="scroll" id="scroll">
        <div class="empty">画布为空</div>
      </div>`;
  }

  init() {
    this._scroll = this.shadowRoot.getElementById('scroll');
    this._scroll.addEventListener('click', (e) => this._onClick(e));
  }

  // ── 公开方法 ──────────────────────────────────────────────────────────────

  setScaler(el) {
    this._scaler = el;
    this.refresh();
  }

  refresh() {
    if (!this._scroll) return;
    if (!this._scaler) {
      this._setEmptyState();
      return;
    }
    const specs = this._collectVisibleRows();
    if (!specs.length) {
      this._setEmptyState();
      return;
    }

    this._scroll.querySelector('.empty')?.remove();

    const prevRows = [...this._scroll.querySelectorAll('.node-row')];
    const pool = new Map(prevRows.map((r) => [r.dataset.nodeId, r]));
    for (const r of prevRows) r.remove();

    const frag = document.createDocumentFragment();
    for (const spec of specs) {
      let row = pool.get(spec.nodeId);
      if (row) this._updateRowElement(row, spec);
      else row = this._createRowElement(spec);
      frag.appendChild(row);
    }

    this._scroll.appendChild(frag);
    if (this._selected) this._applySelection(this._selected);
  }

  highlightNode(nodeId) {
    this._selected = nodeId;
    if (!nodeId) {
      this._applySelection(null);
      return;
    }
    // 若该节点在折叠的父节点下，先展开路径再高亮
    this._ensureVisible(nodeId);
    this._applySelection(nodeId);
    const row = this._scroll?.querySelector(`.node-row[data-node-id="${CSS.escape(String(nodeId))}"]`);
    row?.scrollIntoView({ block: 'nearest' });
  }

  /** 若 nodeId 对应的节点被折叠的祖先遮住，展开所有祖先并重新 refresh */
  _ensureVisible(nodeId) {
    if (!this._scaler) return;
    // 在 scaler 里找对应元素，沿 DOM 向上收集所有祖先的 nodeId
    const target = this._scaler.querySelector(`[data-node-id="${CSS.escape(String(nodeId))}"]`);
    if (!target) return;
    let el = target.parentElement;
    let needRefresh = false;
    while (el && el !== this._scaler) {
      const id = el.dataset?.nodeId;
      if (id && this._collapsed.has(id)) {
        this._collapsed.delete(id);
        needRefresh = true;
      }
      el = el.parentElement;
    }
    if (needRefresh) this.refresh();
  }

  // ── 内部 ──────────────────────────────────────────────────────────────────

  _setEmptyState() {
    this._scroll.replaceChildren();
    const d = document.createElement('div');
    d.className = 'empty';
    d.textContent = '画布为空';
    this._scroll.append(d);
  }

  /** 按当前折叠状态，深度优先收集可见行 */
  _collectVisibleRows() {
    const out = [];
    const roots = [...this._scaler.children].filter((c) => c.dataset?.designNode);
    const walk = (el, depth) => {
      const nodeId = el.dataset?.nodeId;
      if (!nodeId) return;
      const tag = el.tagName.toLowerCase();
      const childEls = [...el.children].filter((c) => c.dataset?.designNode);
      const hasKids = childEls.length > 0;
      const collapsed = this._collapsed.has(nodeId);
      out.push({ nodeId, tag, depth, hasKids, collapsed });
      if (hasKids && !collapsed) childEls.forEach((c) => walk(c, depth + 1));
    };
    roots.forEach((r) => walk(r, 0));
    return out;
  }

  _createRowElement(spec) {
    const row = document.createElement('div');
    row.className = 'node-row';
    row.dataset.nodeId = spec.nodeId;
    const toggle = document.createElement('span');
    toggle.className = 'toggle';
    const tag = document.createElement('span');
    tag.className = 'tag';
    row.append(toggle, tag);
    this._updateRowElement(row, spec);
    return row;
  }

  _updateRowElement(row, spec) {
    const indent = `${TREE_INDENT_BASE_PX + spec.depth * TREE_INDENT_STEP_PX}px`;
    if (row.style.paddingLeft !== indent) row.style.paddingLeft = indent;

    const toggle = row.querySelector('.toggle');
    const tagEl = row.querySelector('.tag');
    if (!toggle || !tagEl) return;

    const tChar = spec.hasKids ? (spec.collapsed ? '▶' : '▼') : '';
    if (toggle.textContent !== tChar) toggle.textContent = tChar;
    toggle.className = `toggle${spec.hasKids ? '' : ' leaf'}`;
    if (spec.hasKids) toggle.dataset.toggle = spec.nodeId;
    else delete toggle.dataset.toggle;

    const isUi5   = spec.tag.startsWith('ui5-') && !this._isFiori(spec.tag);
    const isFiori = this._isFiori(spec.tag);
    const tagClass = (isUi5 ? 'is-ui5' : (isFiori ? 'is-fiori' : '')).trim();
    const nextTagClass = `tag${tagClass ? ` ${tagClass}` : ''}`;
    if (tagEl.className !== nextTagClass) tagEl.className = nextTagClass;

    const label = `<${spec.tag}>`;
    if (tagEl.textContent !== label) tagEl.textContent = label;
  }

  _isFiori(tag) {
    const FIORI_PREFIXES = ['ui5-shellbar', 'ui5-dynamic', 'ui5-flexible', 'ui5-media', 'ui5-navigation',
      'ui5-notification', 'ui5-page', 'ui5-product', 'ui5-search', 'ui5-side-navigation', 'ui5-sort',
      'ui5-filter', 'ui5-timeline', 'ui5-upload', 'ui5-user', 'ui5-view-settings', 'ui5-wizard',
      'ui5-illustrated', 'ui5-barcode', 'ui5-upload'];
    return FIORI_PREFIXES.some((p) => tag.startsWith(p));
  }

  _applySelection(nodeId) {
    if (!this._scroll) return;
    this._scroll.querySelectorAll('.node-row.selected').forEach((r) => r.classList.remove('selected'));
    if (nodeId) {
      const row = this._scroll.querySelector(`.node-row[data-node-id="${CSS.escape(String(nodeId))}"]`);
      row?.classList.add('selected');
    }
  }

  _onClick(e) {
    // Toggle expand/collapse
    const toggleEl = e.target.closest('.toggle:not(.leaf)');
    if (toggleEl) {
      const nodeId = toggleEl.dataset.toggle;
      if (this._collapsed.has(nodeId)) this._collapsed.delete(nodeId);
      else this._collapsed.add(nodeId);
      this.refresh();
      e.stopPropagation();
      return;
    }

    // Select node
    const row = e.target.closest('.node-row');
    if (!row) return;
    const nodeId = row.dataset.nodeId;
    this._selected = nodeId;
    this._applySelection(nodeId);
    this.dispatchEvent(new CustomEvent('tree-select', {
      bubbles: true, composed: true,
      detail: { nodeId },
    }));
  }
}

customElements.define('designer-tree-panel', DesignerTreePanel);
