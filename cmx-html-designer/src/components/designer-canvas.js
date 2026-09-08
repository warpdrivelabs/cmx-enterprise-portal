/**
 * <designer-canvas> — 设计画布组件
 *
 * 派发事件：
 *   node-selected   detail: { node: HTMLElement | null }
 *   canvas-changed
 */
import registry from '../metadata/tag-registry.js';
import {
  extractCmxPageDesignBodyFromScalerHtml,
  serializeDesignArea,
  serializeDesignAreaWithIds,
} from '../utils/html-utils.js';
import { CANVAS_STYLE as STYLE } from './designer-canvas-style.js';
import { DesignerBaseComponent } from './designer-base-component.js';
import {
  decorateUserCode,
  getDesignerDebugMode,
  makeSourceUrl,
} from '../utils/user-code-debug.js';

const RESIZE_HANDLE_INSET_PX = 4;

const CANVAS_ZOOM = {
  min: 0.1,
  max: 4,
  step: 0.1,
  reset: 1,
  percent: 100,
};

const UNDO_HISTORY_MAX_STEPS = 100;
const NODE_MIN_SIZE_PX = 20;
const DND_GHOST_OFFSET_PX = 14;
const DND_GHOST_Z_INDEX = 99999;
const STATE_PREVIEW_ACTIVE_VALUES = ['active', 'visible', 'shown', 'show', 'open', 'expanded', 'selected'];
const STATE_PREVIEW_DISPLAY_VALUES = ['block', 'flex', 'inline-flex', 'grid', 'inline-grid', 'inline-block', 'table'];

const HANDLES = [
  { id: 'nw', cursor: 'nw-resize', top:  -RESIZE_HANDLE_INSET_PX, left:  -RESIZE_HANDLE_INSET_PX },
  { id: 'n',  cursor: 'n-resize',  top:  -RESIZE_HANDLE_INSET_PX, left: '50%', ml: -RESIZE_HANDLE_INSET_PX },
  { id: 'ne', cursor: 'ne-resize', top:  -RESIZE_HANDLE_INSET_PX, right: -RESIZE_HANDLE_INSET_PX },
  { id: 'e',  cursor: 'e-resize',  top: '50%', mt: -RESIZE_HANDLE_INSET_PX, right: -RESIZE_HANDLE_INSET_PX },
  { id: 'se', cursor: 'se-resize', bottom: -RESIZE_HANDLE_INSET_PX, right: -RESIZE_HANDLE_INSET_PX },
  { id: 's',  cursor: 's-resize',  bottom: -RESIZE_HANDLE_INSET_PX, left: '50%', ml: -RESIZE_HANDLE_INSET_PX },
  { id: 'sw', cursor: 'sw-resize', bottom: -RESIZE_HANDLE_INSET_PX, left:  -RESIZE_HANDLE_INSET_PX },
  { id: 'w',  cursor: 'w-resize',  top: '50%', mt: -RESIZE_HANDLE_INSET_PX, left:  -RESIZE_HANDLE_INSET_PX },
];

export class DesignerCanvas extends DesignerBaseComponent {
  constructor() {
    super();
    this._counter    = 0;
    this._selectedEl = null;
    this._dropTarget = null;
    this._dragNodeId = null;
    this._activeSlot = null;
    this._activeSlotTarget = null;
    this._zoom       = 1;
    this._history    = [];
    this._historyIdx = -1;
  }

  styles() { return STYLE; }

  template() {
    return `
      <div class="toolbar">
        <ui5-button id="tbUndo"   design="Transparent" icon="undo"         title="撤销 (Ctrl+Z)"></ui5-button>
        <ui5-button id="tbRedo"   design="Transparent" icon="redo"         title="重做 (Ctrl+Y)"></ui5-button>
        <div class="tb-sep"></div>
        <ui5-button id="tbZoomO"  design="Transparent" icon="zoom-out"     title="缩小"></ui5-button>
        <span class="zoom-label"  id="zoomLabel">100%</span>
        <ui5-button id="tbZoomI"  design="Transparent" icon="zoom-in"      title="放大"></ui5-button>
        <ui5-button id="tbZoom1"  design="Transparent" icon="full-screen"  title="适应宽度"></ui5-button>
        <ui5-button id="tbZoomR"  design="Transparent" icon="exit-full-screen" title="重置 100%"></ui5-button>
        <div class="tb-sep"></div>
        <ui5-button id="tbAlignL" design="Transparent" icon="text-align-left"   title="左对齐"></ui5-button>
        <ui5-button id="tbAlignC" design="Transparent" icon="text-align-center" title="水平居中"></ui5-button>
        <ui5-button id="tbAlignR" design="Transparent" icon="text-align-right"  title="右对齐"></ui5-button>
        <ui5-button id="tbAlignT" design="Transparent" icon="arrow-top"         title="顶部对齐"></ui5-button>
        <ui5-button id="tbAlignM" design="Transparent" icon="horizontal-grip"   title="垂直居中"></ui5-button>
        <ui5-button id="tbAlignB" design="Transparent" icon="arrow-bottom"      title="底部对齐"></ui5-button>
        <div class="tb-sep"></div>
        <ui5-button id="tbGrid"   design="Transparent" icon="grid"              title="切换网格"></ui5-button>
      </div>
      <div class="design-area" id="da">
        <div class="design-scaler" id="scaler">
          <div class="sel-overlay" id="selOverlay">
            <div class="sel-move-handle" id="selDrag">⠿</div>
            ${HANDLES.map(h => `<div class="sel-handle" data-handle="${h.id}" style="cursor:${h.cursor}"></div>`).join('')}
          </div>
        </div>
      </div>`;
  }

  /** 页内运行等场景：阻止外部脚本通过公开 API 改写设计区 */
  init() {
    this._mutationLocked = false;
    this._da      = this.shadowRoot.getElementById('da');
    this._scaler  = this.shadowRoot.getElementById('scaler');
    this._overlay = this.shadowRoot.getElementById('selOverlay');
    this._selDrag = this.shadowRoot.getElementById('selDrag');

    this._dragoverRafScheduled = false;
    /** @type {{ path: EventTarget[], slotZoneEl: Element|null, isMove: boolean } | null} */
    this._pendingDragover = null;
    this._scrollRafScheduled = false;

    // 属性过滤器：只保留元数据中声明的属性（去除 UI5 自动附加的内部属性）
    this._attrFilter = (tag) => {
      const meta = registry.get(tag);
      return new Set(meta.attrs.map((a) => a.name));
    };
    this._positionHandles();
    this._bindToolbar();
    this._bindDrop();
    this._bindClick();
    this._bindResize();
    this._bindOverlayDrag();
    this._hideCanvasTransientOverlays = () => {
      this._overlay.classList.remove('visible');
      this._hideSlotBar();
    };
    this._shadowRootScrollGuard = (e) => {
      const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
      if (path.includes(this._da) || path.includes(this._scaler)) {
        this._hideCanvasTransientOverlays();
      }
    };
    this.shadowRoot.addEventListener('wheel', this._shadowRootScrollGuard, { capture: true, passive: true });
    this.shadowRoot.addEventListener('touchmove', this._shadowRootScrollGuard, { capture: true, passive: true });
    this._da.addEventListener('scroll', () => {
      if (this._scrollRafScheduled) return;
      this._scrollRafScheduled = true;
      requestAnimationFrame(() => {
        this._scrollRafScheduled = false;
        this._hideCanvasTransientOverlays();
      });
    }, { capture: true });

    // Del / Backspace 删除选中节点
    this._onKeyDown = (e) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      // Walk through nested shadow roots to find the truly focused element
      let active = document.activeElement;
      while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
      if (active) {
        const tag = active.tagName.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
        if (active.isContentEditable) return;
        if (tag.startsWith('ui5-')) return;
      }
      if (!this._selectedEl) return;
      if (this._mutationLocked) return;
      e.preventDefault();
      const node = this._selectedEl;
      this._selectNode(null);
      node.remove();
      this._pushHistory();
      this._emitChanged();
    };
    window.addEventListener('keydown', this._onKeyDown);
  }

  cleanup() {
    window.removeEventListener('keydown', this._onKeyDown);
    this.shadowRoot?.removeEventListener('wheel', this._shadowRootScrollGuard, { capture: true });
    this.shadowRoot?.removeEventListener('touchmove', this._shadowRootScrollGuard, { capture: true });
  }

  // ── 公开方法 ──────────────────────────────────────────────────────────────
  getHtml()        { return serializeDesignArea(this._scaler, false, this._attrFilter); }
  getExportHtml()  { return serializeDesignArea(this._scaler, true,  this._attrFilter); }
  getHtmlWithIds() { return serializeDesignAreaWithIds(this._scaler,  this._attrFilter); }
  getScaler()      { return this._scaler; }

  /** 画布设计区是否已有任何设计组件（用于刷新/关闭前的「未保存」提示判定）。 */
  hasDesignNodes() {
    return !!(this._scaler && this._scaler.querySelector('[data-design-node]'));
  }

  /** 为 true 时拒绝 setHtml/clear/撤销重做/事件绑定等会持久化到设计区的写入（页内运行脚本与主窗口同域） */
  setMutationLocked(locked) {
    this._mutationLocked = !!locked;
    this.toggleAttribute('data-mutation-locked', locked);
  }

  /** 注入 `() => string` 以便事件代码的 sourceURL 带上稳定的 pageId */
  setPageIdProvider(fn) {
    this._getPageIdForDebug = typeof fn === 'function' ? fn : null;
  }

  /** 调试模式切换后重新绑定当前画布全部事件（以便 debugger 首行注入生效） */
  rehydrateEvents() {
    if (!this._scaler) return;
    this._hydrateEvents();
  }

  selectNodeById(nodeId) {
    if (!nodeId) return;
    const el = this._scaler.querySelector(`[data-node-id="${nodeId}"]`);
    if (el) this._selectNode(el);
  }

  setHtml(html, pushHistory = true) {
    if (this._mutationLocked) return;
    const parser = new DOMParser();
    const canvasHtml = extractCmxPageDesignBodyFromScalerHtml(html) || html;
    const doc = parser.parseFromString(canvasHtml, 'text/html');
    this._scaler.innerHTML = doc.body ? doc.body.innerHTML : html;
    this._scaler.appendChild(this._overlay);
    this._normalizeNodes();
    this._hydrateEvents();
    this._selectNode(null);
    if (pushHistory) this._pushHistory();
    this._emitChanged();
  }

  clear() {
    if (this._mutationLocked) return;
    this._scaler.innerHTML = '';
    this._scaler.appendChild(this._overlay);
    this._selectNode(null);
    this._pushHistory();
    this._emitChanged();
  }

  get selectedNode() { return this._selectedEl; }

  // ── 历史记录 ─────────────────────────────────────────────────────────────
  _pushHistory() {
    const snap = this.getHtml();
    // 截断前进栈
    this._history = this._history.slice(0, this._historyIdx + 1);
    this._history.push(snap);
    if (this._history.length > UNDO_HISTORY_MAX_STEPS) this._history.shift();
    this._historyIdx = this._history.length - 1;
    this._updateUndoRedo();
  }

  _undo() {
    if (this._mutationLocked) return;
    if (this._historyIdx <= 0) return;
    this._historyIdx--;
    this.setHtml(this._history[this._historyIdx], false);
    this._updateUndoRedo();
  }

  _redo() {
    if (this._mutationLocked) return;
    if (this._historyIdx >= this._history.length - 1) return;
    this._historyIdx++;
    this.setHtml(this._history[this._historyIdx], false);
    this._updateUndoRedo();
  }

  _updateUndoRedo() {
    const sr = this.shadowRoot;
    const u = sr.getElementById('tbUndo');
    const r = sr.getElementById('tbRedo');
    if (u) u.disabled = this._historyIdx <= 0;
    if (r) r.disabled = this._historyIdx >= this._history.length - 1;
  }

  // ── 缩放 ─────────────────────────────────────────────────────────────────
  _setZoom(z) {
    this._zoom = Math.min(CANVAS_ZOOM.max, Math.max(CANVAS_ZOOM.min, z));
    this._scaler.style.transform = `scale(${this._zoom})`;
    this._scaler.style.width     = `${CANVAS_ZOOM.percent / this._zoom}%`;
    this.shadowRoot.getElementById('zoomLabel').textContent =
      `${Math.round(this._zoom * CANVAS_ZOOM.percent)}%`;
    this._updateOverlay();
  }

  // ── 对齐 ─────────────────────────────────────────────────────────────────
  _align(dir) {
    if (this._mutationLocked) return;
    const el = this._selectedEl;
    if (!el) return;
    const parent = el.parentElement;
    const pRect  = (parent === this._scaler ? this._da : parent).getBoundingClientRect();
    const eRect  = el.getBoundingClientRect();
    el.style.position = 'relative';
    switch (dir) {
      case 'left':   el.style.left = '0'; el.style.marginLeft = '0'; break;
      case 'center': el.style.margin = '0 auto'; el.style.display = el.style.display || 'block'; break;
      case 'right':  el.style.marginLeft = `${pRect.width - eRect.width}px`; break;
      case 'top':    el.style.top = '0'; el.style.marginTop = '0'; break;
      case 'middle': el.style.marginTop = `${(pRect.height - eRect.height) / 2}px`; break;
      case 'bottom': el.style.marginTop = `${pRect.height - eRect.height}px`; break;
    }
    this._updateOverlay();
    this._pushHistory();
    this._emitChanged();
  }

  // ── 工具栏绑定 ────────────────────────────────────────────────────────────
  _bindToolbar() {
    const sr = this.shadowRoot;
    sr.getElementById('tbUndo').addEventListener('click',   () => this._undo());
    sr.getElementById('tbRedo').addEventListener('click',   () => this._redo());
    sr.getElementById('tbZoomO').addEventListener('click',  () => this._setZoom(this._zoom - CANVAS_ZOOM.step));
    sr.getElementById('tbZoomI').addEventListener('click',  () => this._setZoom(this._zoom + CANVAS_ZOOM.step));
    sr.getElementById('tbZoom1').addEventListener('click',  () => {
      const ratio = this._da.clientWidth / this._scaler.scrollWidth;
      this._setZoom(ratio > 0 ? ratio : CANVAS_ZOOM.reset);
    });
    sr.getElementById('tbZoomR').addEventListener('click',  () => this._setZoom(CANVAS_ZOOM.reset));
    sr.getElementById('tbAlignL').addEventListener('click', () => this._align('left'));
    sr.getElementById('tbAlignC').addEventListener('click', () => this._align('center'));
    sr.getElementById('tbAlignR').addEventListener('click', () => this._align('right'));
    sr.getElementById('tbAlignT').addEventListener('click', () => this._align('top'));
    sr.getElementById('tbAlignM').addEventListener('click', () => this._align('middle'));
    sr.getElementById('tbAlignB').addEventListener('click', () => this._align('bottom'));
    sr.getElementById('tbGrid').addEventListener('click',   () => this._toggleGrid());

    // Ctrl+Z / Ctrl+Y
    this.shadowRoot.host.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); this._undo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); this._redo(); }
    });

    this._updateUndoRedo();
  }

  _toggleGrid() {
    const da = this._da;
    if (da.style.backgroundImage) {
      da.style.backgroundImage = '';
      da.style.backgroundSize  = '';
    } else {
      da.style.backgroundImage = `radial-gradient(circle, var(--sapInformationElementColor, #334155) 1px, transparent 1px)`;
      da.style.backgroundSize  = '24px 24px';
    }
  }

  // ── Overlay ───────────────────────────────────────────────────────────────
  _updateOverlay() {
    const el = this._selectedEl;
    if (!el) { this._overlay.classList.remove('visible'); return; }
    const scalerRect = this._scaler.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const zoom = this._zoom || CANVAS_ZOOM.reset;
    Object.assign(this._overlay.style, {
      top:    `${(elRect.top  - scalerRect.top)  / zoom}px`,
      left:   `${(elRect.left - scalerRect.left) / zoom}px`,
      width:  `${elRect.width  / zoom}px`,
      height: `${elRect.height / zoom}px`,
    });
    this._overlay.classList.add('visible');
  }

  _positionHandles() {
    HANDLES.forEach((h) => {
      const el = this._overlay.querySelector(`[data-handle="${h.id}"]`);
      if (!el) return;
      el.style.top    = h.top    !== undefined ? (typeof h.top    === 'string' ? h.top    : `${h.top}px`) : '';
      el.style.left   = h.left   !== undefined ? (typeof h.left   === 'string' ? h.left   : `${h.left}px`) : '';
      el.style.right  = h.right  !== undefined ? `${h.right}px` : '';
      el.style.bottom = h.bottom !== undefined ? `${h.bottom}px` : '';
      if (h.ml) el.style.marginLeft = `${h.ml}px`;
      if (h.mt) el.style.marginTop  = `${h.mt}px`;
    });
  }

  // ── 通过选择框拖拽移动节点 ────────────────────────────────────────────────
  _bindOverlayDrag() {
    const drag = this._selDrag;

    drag.addEventListener('pointerdown', (e) => {
      const el = this._selectedEl;
      if (!el) return;
      e.preventDefault();
      e.stopPropagation();
      const pid = e.pointerId;
      drag.setPointerCapture(pid);
      this._overlay.classList.remove('visible');
      document.body.style.cursor = 'grabbing';

      // 创建拖影
      const tagName = el.tagName.toLowerCase();
      const ghost = document.createElement('div');
      ghost.textContent = `<${tagName}>`;
      Object.assign(ghost.style, {
        position: 'fixed',
        pointerEvents: 'none',
        zIndex: String(DND_GHOST_Z_INDEX),
        padding: '4px 10px',
        borderRadius: '4px',
        background: 'var(--sapList_Background, #1c2833)',
        border: '1px solid var(--sapBrandColor, #0070f2)',
        color: tagName.startsWith('ui5-') ? 'var(--sapBrandColor, #0070f2)' : 'var(--sapContent_LabelColor, #8fa7c0)',
        fontFamily: "Consolas, 'Courier New', monospace",
        fontSize: '12px',
        fontWeight: '600',
        opacity: '0.9',
        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        left: `${e.clientX + DND_GHOST_OFFSET_PX}px`,
        top: `${e.clientY + DND_GHOST_OFFSET_PX}px`,
        userSelect: 'none',
        whiteSpace: 'nowrap',
      });
      document.body.appendChild(ghost);

      const hitAt = (cx, cy) => {
        const saved = el.style.pointerEvents;
        el.style.pointerEvents = 'none';
        const hit = this.shadowRoot.elementFromPoint(cx, cy);
        el.style.pointerEvents = saved;
        return hit;
      };

      const onMove = (ev) => {
        if (ev.pointerId !== pid) return;
        ghost.style.left = `${ev.clientX + DND_GHOST_OFFSET_PX}px`;
        ghost.style.top  = `${ev.clientY + DND_GHOST_OFFSET_PX}px`;
        const hit = hitAt(ev.clientX, ev.clientY);

        const zone = hit?.closest?.('.slot-zone');
        if (zone) {
          this._slotBar?.querySelectorAll('.slot-zone').forEach(z => z.classList.remove('active'));
          zone.classList.add('active');
          this._activeSlot = zone.dataset.slot;
          this._activeSlotTarget = this._slotBarHost;
          this._clearDropTarget();
          return;
        }
        this._activeSlot = null;
        this._activeSlotTarget = null;
        this._slotBar?.querySelectorAll('.slot-zone').forEach(z => z.classList.remove('active'));

        if (!hit) { this._clearDropTarget(); this._hideSlotBar(); return; }
        const container = this._resolveContainer(hit, el);
        this._setDropTarget(container);
        if (container && registry.get(container.tagName.toLowerCase())?.slots?.length) {
          if (this._slotBarHost !== container) this._showSlotBar(container);
        } else {
          this._hideSlotBar();
        }
      };

      const onUp = (ev) => {
        if (ev.pointerId !== pid) return;
        drag.removeEventListener('pointermove', onMove);
        drag.removeEventListener('pointerup', onUp);
        document.body.style.cursor = '';
        ghost.remove();

        const hit = hitAt(ev.clientX, ev.clientY);
        const slotName   = this._activeSlot;
        const slotTarget = this._activeSlotTarget;
        const dropTarget = slotTarget || (hit ? this._resolveContainer(hit, el) : null);

        if (slotName != null && slotName !== '') {
          el.setAttribute('slot', slotName);
        } else {
          el.removeAttribute('slot');
        }

        (dropTarget || this._scaler).appendChild(el);
        this._clearDropTarget();
        this._hideSlotBar();
        this._selectNode(el);
        this._pushHistory();
        this._emitChanged();
      };

      drag.addEventListener('pointermove', onMove);
      drag.addEventListener('pointerup', onUp);
    });
  }

  // ── slot 指示条 ───────────────────────────────────────────────────────────
  _showSlotBar(containerEl) {
    this._hideSlotBar();
    if (!containerEl) return;
    const meta  = registry.get(containerEl.tagName.toLowerCase());
    const slots = meta?.slots;
    if (!slots?.length) return;

    const daRect = this._da.getBoundingClientRect();
    const elRect = containerEl.getBoundingClientRect();
    const top    = elRect.top  - daRect.top  + this._da.scrollTop;
    const left   = elRect.left - daRect.left + this._da.scrollLeft;
    const width  = elRect.width;
    const height = elRect.height;

    const bar = document.createElement('div');
    const horizontal = meta.slotOrientation === 'horizontal';
    bar.className = 'slot-bar visible' + (horizontal ? ' slot-bar--row' : '');
    Object.assign(bar.style, {
      top: `${top}px`, left: `${left}px`,
      width: `${width}px`, height: `${height}px`,
    });

    const HORIZ_LABELS = { 'startContent': '← 左', '': '中间', 'endContent': '右 →' };
    slots.forEach((slot) => {
      const z = document.createElement('div');
      z.className = 'slot-zone slot-named';
      if (horizontal) {
        z.textContent = HORIZ_LABELS[slot] ?? `slot="${slot}"`;
      } else {
        z.textContent = slot === '' ? '默认内容' : `⬆ slot="${slot}"`;
      }
      z.dataset.slot = slot;
      bar.appendChild(z);
    });

    if (!horizontal && !slots.includes('')) {
      const defZone = document.createElement('div');
      defZone.className = 'slot-zone';
      defZone.textContent = '默认内容';
      defZone.dataset.slot = '';
      bar.appendChild(defZone);
    }

    this._da.appendChild(bar);
    this._slotBar = bar;
    this._slotBarHost = containerEl;
  }

  _hideSlotBar() {
    this._slotBar?.remove();
    this._slotBar = null;
    this._slotBarHost = null;
    this._activeSlot = null;
    this._activeSlotTarget = null;
  }

  // ── Drop（调色板拖入 + 画布内移动） ───────────────────────────────────────
  _bindDrop() {
    const da      = this._da;
    const scaler  = () => this._scaler;

    da.addEventListener('dragover', (e) => {
      // modelOnly 条目只携带 cmx-model-type，不携带 text/plain 和 text/node-move
      // 画布不接受，显式设 dropEffect='none' 让浏览器显示禁止光标
      const isModelOnly = e.dataTransfer.types.includes('cmx-model-type')
        && !e.dataTransfer.types.includes('text/node-move')
        && !e.dataTransfer.types.includes('text/plain');
      if (isModelOnly) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'none';
        return;
      }
      e.preventDefault();
      const isMove = e.dataTransfer.types.includes('text/node-move');
      e.dataTransfer.dropEffect = isMove ? 'move' : 'copy';

      this._pendingDragover = {
        path: e.composedPath(),
        slotZoneEl: e.target.closest?.('.slot-zone') ?? null,
        isMove,
      };
      if (this._dragoverRafScheduled) return;
      this._dragoverRafScheduled = true;
      requestAnimationFrame(() => {
        this._dragoverRafScheduled = false;
        const pending = this._pendingDragover;
        this._pendingDragover = null;
        if (!pending) return;
        this._handleDragoverFrame(pending);
      });
    });

    da.addEventListener('dragleave', (e) => {
      if (e.relatedTarget && da.contains(e.relatedTarget)) return;
      da.classList.remove('dragover');
      this._clearDropTarget();
      this._hideSlotBar();
    });

    da.addEventListener('drop', (e) => {
      if (this._mutationLocked) return;
      e.preventDefault();
      da.classList.remove('dragover');

      const nodeId = e.dataTransfer.getData('text/node-move');
      const tag    = e.dataTransfer.getData('text/plain');

      const slotName   = this._activeSlot;
      const slotTarget = this._activeSlotTarget;
      const movingEl   = nodeId ? scaler().querySelector(`[data-node-id="${nodeId}"]`) : null;
      const dropTarget = slotTarget || this._resolveContainerFromPath(e.composedPath(), movingEl);

      if (nodeId && movingEl) {
        if (movingEl !== dropTarget) {
          if (slotName) movingEl.setAttribute('slot', slotName);
          else          movingEl.removeAttribute('slot');
          if (slotName === 'header') movingEl.style.marginLeft = 'auto';
          (dropTarget || scaler()).appendChild(movingEl);
          this._selectNode(movingEl);
        }
      } else if (tag) {
        const node = this._createNode(tag);
        if (slotName) node.setAttribute('slot', slotName);
        if (slotName === 'header') node.style.marginLeft = 'auto';
        (dropTarget || scaler()).appendChild(node);
        this._selectNode(node);
      }

      this._clearDropTarget();
      this._hideSlotBar();
      this._pushHistory();
      this._emitChanged();
    });
  }

  /** dragover 经 rAF 节流后只处理最后一帧的命中数据，避免每个事件都重算 */
  _handleDragoverFrame(pending) {
    const da = this._da;
    const { path, slotZoneEl, isMove } = pending;

    if (slotZoneEl) {
      this._slotBar?.querySelectorAll('.slot-zone.active').forEach(z => z.classList.remove('active'));
      slotZoneEl.classList.add('active');
      this._activeSlot = slotZoneEl.dataset.slot;
      this._activeSlotTarget = this._slotBarHost;
      da.classList.remove('dragover');
      this._clearDropTarget();
      return;
    }
    this._activeSlot = null;
    this._activeSlotTarget = null;
    this._slotBar?.querySelectorAll('.slot-zone.active').forEach(z => z.classList.remove('active'));

    const movingEl = isMove && this._dragNodeId
      ? this._scaler.querySelector(`[data-node-id="${this._dragNodeId}"]`)
      : null;
    const container = this._resolveContainerFromPath(path, movingEl);
    this._setDropTarget(container);

    if (container && registry.get(container.tagName.toLowerCase())?.slots?.length) {
      if (this._slotBarHost !== container) this._showSlotBar(container);
    } else {
      this._hideSlotBar();
    }

    if (!container) da.classList.add('dragover');
    else da.classList.remove('dragover');
  }

  // ── Click ─────────────────────────────────────────────────────────────────
  _bindClick() {
    // 捕获阶段：先于 ui5 组件内部的 stopPropagation 触发
    this._da.addEventListener('click', (e) => {
      if (e.target.closest?.('.sel-overlay')) return;
      const node = this._findNodeFromEvent(e);
      this._selectNode(node || null);
    }, { capture: true });
  }

  // 通过 composedPath() 在事件路径里直接找最深的设计节点，O(路径长度)，
  // 避免对画布内所有元素做 getBoundingClientRect 强制布局。
  // 命中链顺序就是“最具体 → 外层”，因此第一个 design-node 即是目标。
  _findNodeFromEvent(ev) {
    const path = typeof ev.composedPath === 'function' ? ev.composedPath() : null;
    if (path?.length) {
      for (const el of path) {
        if (!(el instanceof Element)) continue;
        if (!this._scaler.contains(el)) continue;
        if (el.dataset?.designNode) return el;
      }
      return null;
    }
    return this._findNodeAt(ev.clientX, ev.clientY);
  }

  // 几何回退：仅在拿不到 composedPath() 时使用（保留原行为，处理 shadow DOM 重定向边界）。
  _findNodeAt(cx, cy) {
    const zFront = new Set();
    let zRank = 0;
    const zMap = new Map();
    for (const el of document.elementsFromPoint(cx, cy)) {
      if (el.dataset?.designNode && this._scaler.contains(el)) {
        zFront.add(el);
        zMap.set(el, zRank++);
      }
    }
    let best = null, bestArea = Infinity, bestZ = Infinity;
    for (const el of this._scaler.querySelectorAll('[data-design-node]')) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if (cx < r.left || cx > r.right || cy < r.top || cy > r.bottom) continue;
      const area = r.width * r.height;
      const z    = zMap.get(el) ?? Infinity;
      if (area < bestArea || (area === bestArea && z < bestZ)) {
        best = el; bestArea = area; bestZ = z;
      }
    }
    return best;
  }

  // ── Resize 手柄 ───────────────────────────────────────────────────────────
  _bindResize() {
    this._overlay.querySelectorAll('.sel-handle').forEach((handle) => {
      handle.addEventListener('pointerdown', (e) => {
        e.stopPropagation(); e.preventDefault();
        const dir    = handle.dataset.handle;
        const el     = this._selectedEl;
        if (!el) return;
        const rect   = el.getBoundingClientRect();
        const startX = e.clientX, startY = e.clientY;
        const startW = rect.width, startH = rect.height;
        const startT = el.offsetTop,  startL = el.offsetLeft;
        handle.setPointerCapture(e.pointerId);

        const onMove = (ev) => {
          const dx = ev.clientX - startX, dy = ev.clientY - startY;
          let nW = startW, nH = startH, nT = startT, nL = startL;
          if (dir.includes('e')) nW = Math.max(NODE_MIN_SIZE_PX, startW + dx);
          if (dir.includes('s')) nH = Math.max(NODE_MIN_SIZE_PX, startH + dy);
          if (dir.includes('w')) { nW = Math.max(NODE_MIN_SIZE_PX, startW - dx); nL = startL + (startW - nW); }
          if (dir.includes('n')) { nH = Math.max(NODE_MIN_SIZE_PX, startH - dy); nT = startT + (startH - nH); }
          if (dir.includes('e') || dir.includes('w')) el.style.width  = `${nW}px`;
          if (dir.includes('n') || dir.includes('s')) el.style.height = `${nH}px`;
          if (dir.includes('w')) { el.style.position = 'relative'; el.style.left = `${nL - startL}px`; }
          if (dir.includes('n')) { el.style.position = 'relative'; el.style.top  = `${nT - startT}px`; }
          this._updateOverlay();
        };
        const onUp = () => {
          handle.removeEventListener('pointermove', onMove);
          handle.removeEventListener('pointerup', onUp);
          this._pushHistory();
          this._emitChanged();
        };
        handle.addEventListener('pointermove', onMove);
        handle.addEventListener('pointerup', onUp);
      });
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  _createNode(tag) {
    const meta = registry.get(tag);
    const el   = document.createElement(tag);
    el.dataset.designNode = '1';
    el.dataset.nodeId     = `n-${++this._counter}`;
    meta.defaultSetup?.(el);
    return el;
  }

  _resolveContainer(target, excludeEl) {
    if (!target || target === this._overlay || this._overlay.contains(target)) return null;
    // target may be retargeted at shadow boundaries; walk up the light DOM
    // to find the nearest design-node ancestor that is inside _scaler.
    let el = target;
    while (el && el !== this._scaler) {
      if (el.dataset?.designNode && this._scaler.contains(el)) {
        if (excludeEl && (el === excludeEl || el.contains(excludeEl))) {
          el = el.parentElement;
          continue;
        }
        const meta = registry.get(el.tagName.toLowerCase());
        if (meta?.canNest) return el;
        el = el.parentElement;
        continue;
      }
      el = el.parentElement;
    }
    return null;
  }

  // Like _resolveContainer but uses composedPath() to pierce shadow DOM retargeting.
  // Drag events on da have e.target retargeted to the shadow host (e.g. ui5-bar) even
  // when the pointer is over a slotted child (e.g. ui5-button). composedPath() still
  // lists the actual innermost element first, so we find the correct canNest target.
  _resolveContainerFromPath(composedPath, excludeEl) {
    for (const el of composedPath) {
      if (!(el instanceof Element)) continue;
      if (!this._scaler.contains(el)) continue;
      if (!el.dataset?.designNode) continue;
      if (excludeEl && (el === excludeEl || el.contains(excludeEl))) continue;
      const meta = registry.get(el.tagName.toLowerCase());
      if (meta?.canNest) return el;
    }
    return null;
  }

  _setDropTarget(node) {
    if (this._dropTarget === node) return;
    this._clearDropTarget();
    this._dropTarget = node || null;
    this._dropTarget?.classList.add('drop-target');
  }

  _clearDropTarget() {
    this._dropTarget?.classList.remove('drop-target');
    this._dropTarget = null;
  }

  _selectNode(node) {
    this._selectedEl = node;
    // 延迟一帧等待浏览器完成布局再更新 overlay
    requestAnimationFrame(() => this._updateOverlay());
    this.dispatchEvent(new CustomEvent('node-selected', { bubbles: true, composed: true, detail: { node } }));
  }

  _emitChanged() {
    this.dispatchEvent(new CustomEvent('canvas-changed', { bubbles: true, composed: true }));
  }

  _normalizeNodes() {
    const seen = new Set();
    this._scaler.querySelectorAll('[data-designer-page-root]').forEach((el) => {
      el.removeAttribute('data-designer-page-root');
    });
    const pageRoot = Array.from(this._scaler.children).find((el) => (
      el !== this._overlay
      && el !== this._slotBar
      && !this._overlay.contains(el)
      && !this._slotBar?.contains(el)
      && !['STYLE', 'SCRIPT', 'TEMPLATE'].includes(el.tagName)
    ));
    pageRoot?.setAttribute('data-designer-page-root', '1');
    this._scaler.querySelectorAll('*').forEach((el) => {
      if (el === this._overlay || this._overlay.contains(el)) return;
      if (el === this._slotBar || this._slotBar?.contains(el)) return;
      el.classList.remove('selected', 'drop-target');
      el.dataset.designNode = '1';
      if (el.tagName.toLowerCase() === 'cmx-split-pane') {
        const h = String(el.style.height || el.getAttribute('height') || '').trim();
        const mh = String(el.style.minHeight || '').trim();
        const hasDefiniteHeight = !!mh || (!!h && !h.endsWith('%'));
        if (hasDefiniteHeight) el.removeAttribute('data-designer-auto-min-height');
        else el.setAttribute('data-designer-auto-min-height', '1');
      } else {
        el.removeAttribute('data-designer-auto-min-height');
      }
      // 若 nodeId 不存在或已被其他元素占用，重新分配
      if (!el.dataset.nodeId || seen.has(el.dataset.nodeId)) {
        el.dataset.nodeId = `n-${++this._counter}`;
      }
      seen.add(el.dataset.nodeId);
    });
    this._applyInertDesignPreviews();
  }

  _applyInertDesignPreviews() {
    this._scaler.querySelectorAll('[data-designer-preview-visible], [data-designer-preview-display]').forEach((el) => {
      el.removeAttribute('data-designer-preview-visible');
      el.removeAttribute('data-designer-preview-display');
    });
    this._previewInactiveStateGroups();
  }

  _previewInactiveStateGroups() {
    const groups = new Map();
    this._scaler.querySelectorAll('[data-state]').forEach((el) => {
      if (el === this._overlay || this._overlay.contains(el)) return;
      if (el === this._slotBar || this._slotBar?.contains(el)) return;
      if (!el.parentElement || el.parentElement === this._scaler) return;
      const state = String(el.getAttribute('data-state') || '').trim().toLowerCase();
      if (!state) return;
      const key = this._stateGroupKey(el);
      const items = groups.get(key) || [];
      items.push(el);
      groups.set(key, items);
    });

    groups.forEach((items) => {
      if (items.length < 2) return;
      if (items.some((el) => this._isElementRendered(el))) return;
      const representative = this._pickStatePreviewElement(items);
      if (!representative) return;
      const previewDisplay = this._inferStatePreviewDisplay(representative);
      if (!previewDisplay) return;
      representative.setAttribute('data-designer-preview-visible', '1');
      representative.setAttribute('data-designer-preview-display', previewDisplay);
    });
  }

  _stateGroupKey(el) {
    const parentId = el.parentElement.dataset.nodeId || '';
    const classKey = Array.from(el.classList)
      .filter((name) => !['selected', 'drop-target', 'dragging'].includes(name))
      .sort()
      .join('.');
    return `${parentId}|${el.tagName.toLowerCase()}|${classKey}`;
  }

  _pickStatePreviewElement(items) {
    return items.find((el) => String(el.textContent || '').trim())
      || items.find((el) => el.children.length)
      || items[0]
      || null;
  }

  _inferStatePreviewDisplay(el) {
    const originalState = el.getAttribute('data-state');
    for (const state of STATE_PREVIEW_ACTIVE_VALUES) {
      el.setAttribute('data-state', state);
      const display = getComputedStyle(el).display;
      if (display && display !== 'none') {
        el.setAttribute('data-state', originalState);
        return STATE_PREVIEW_DISPLAY_VALUES.includes(display) ? display : 'block';
      }
    }
    el.setAttribute('data-state', originalState);
    return null;
  }

  _isElementRendered(el) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.visibility === 'collapse') return false;
    if (Number(cs.opacity) === 0) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  _hydrateEvents() {
    // 设计器画布中不绑定事件监听器，事件仅用于属性面板展示和源码生成
  }

  _attachHandler(node, evt, code) {
    if (this._mutationLocked) return;
    if (!node.__evStore) node.__evStore = {};
    this._detachHandler(node, evt);
    if (!code) return;
    const pageId = this._getPageIdForDebug?.() || 'unnamed';
    const nodeId = node.dataset?.nodeId || 'node';
    const sourceUrl = makeSourceUrl('event', [pageId, nodeId, evt]);
    const decorated = decorateUserCode(code, sourceUrl, { breakOnEnter: getDesignerDebugMode() });
    let compiled;
    try { compiled = new Function('event', decorated); }
    catch (err) {
      console.error(`事件脚本编译失败(${evt}):`, err.message);
      return;
    }
    const fn = (event) => {
      try { compiled.call(node, event); }
      catch (err) { console.error(`事件脚本错误(${evt}):`, err.message); }
    };
    node.addEventListener(evt, fn);
    node.__evStore[evt] = fn;
  }

  _detachHandler(node, evt) {
    if (!node.__evStore?.[evt]) return;
    node.removeEventListener(evt, node.__evStore[evt]);
    delete node.__evStore[evt];
  }

  attachHandler(node, evt, code) { this._attachHandler(node, evt, code); }
  detachHandler(node, evt)       { this._detachHandler(node, evt); }
}

customElements.define('designer-canvas', DesignerCanvas);
