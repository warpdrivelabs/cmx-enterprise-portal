/**
 * Workspace 浮动视图窗口（floatview）：
 *
 *   - 常驻：右下角 48×48 圆形悬浮球，主页面打开即可见，与任何 workspace / content tab 无关；
 *   - 可移动：用户可拖拽悬浮球到任意位置；位置持久化到 localStorage；
 *   - 可作为 drop target：任何 workspace 视图拖到球上都会先触发视图移动到 `'floatview'` 区，再自动展开为窗口；
 *   - 单击球：展开为浮动窗口，与球互斥显示；
 *   - 窗口：标题条可拖动 + 右上角关闭（变回球）；底部 Tab 栏：
 *       1) 第一个 Tab 固定为「AI 助手」智能体对话视图（不可拖拽 / 不可清除）；
 *       2) 第二个 Tab 固定为智能体事件详情视图（不可拖拽 / 不可清除）；
 *       3) 之后是当前 content tab 的 workspace `floatview` 视图（每个 view 单独成 tab）。
 *   - 切换 content tab 时由宿主调 {@link setState} 刷新工作区 tab 列表（AI tab 保留）；
 *   - 不混合不同 workspace：宿主的 setState 仅传当前 tab 的 floatview spec。
 */
import {
  normalizeWorkspaceRegionViews,
  safeUi5IconName,
  workspaceRegionViewsWrapper,
} from '../lib/workspace-node.js'
import { DROP_TARGET_CLASS, wireWorkspacePanelDnd } from '../lib/workspace-dock-layout.js'
import { wireTabStripReorder, reorderByCssOrder } from '../lib/tab-strip-reorder.js'
import { wireWorkspaceRegionTabContextMenu } from '../lib/workspace-region-tab-ctxmenu.js'
import {
  clearFloatWindowPersistence,
  ensureFloatBallPos,
  ensureFloatWindowRect,
  readFloatBallPos,
  readFloatWindowRect,
  writeFloatBallPos,
  writeFloatWindowRect,
} from '../lib/portal-float-window-persistence.js'
import {
  buildFloatWindowTabs,
  renderFloatWindowTabBarHtml,
  syncFloatWindowTabBarState,
  syncFloatWorkspacePaneState,
} from '../lib/portal-float-window-tabs.js'
import {
  attachFloatWorkspaceMount,
  clearFloatWorkspacePane,
  hydrateFloatWorkspacePane,
  renderFloatWorkspaceFallback,
} from '../lib/portal-float-window-mount.js'
import {
  finishFloatDrag,
  startFloatDrag,
  updateFloatDrag,
} from '../lib/portal-float-window-drag.js'
import { escHtml } from '../lib/escape.js'
import './portal-agent-console.js'

const DEFAULT_WIDTH = 520
const DEFAULT_HEIGHT = 620
const TITLE_BAR_HEIGHT = 34
const BALL_SIZE = 48
const BALL_MARGIN = 24
const POS_STORAGE_KEY = 'cmx-portal:floatBallPos:v1'
const WIN_STORAGE_KEY = 'cmx-portal:floatWindow:v1'
const AGENT_EMPTY_DETAIL_HTML = '<div class="empty-detail">暂无详情，选择左侧事件后显示。</div>'

export class PortalWorkspaceFloatWindow extends HTMLElement {
  constructor () {
    super()
    this.attachShadow({ mode: 'open' })
    /** @type {string} */
    this._title = ''
    /** @type {string} */
    this._icon = 'popup-window'
    /** @type {unknown} */
    this._spec = null
    /** @type {HTMLElement|null} */
    this._mountRoot = null
    /** @type {boolean} 窗口是否展开（false=只显示球） */
    this._open = false
    /** @type {'ai-dev'|'ai'|'detail'|number} 当前激活 tab：'ai-dev' / 'ai' / 'detail' / workspace 视图 index */
    this._activeTab = 'ai'
    /** @type {boolean} AI 开发助手组件树是否正在懒加载（防重复 import） */
    this._aiWorkbenchLoading = false
    /** 球位置（持久化） */
    this._ballPos = readFloatBallPos(POS_STORAGE_KEY)
    /** 窗口位置/尺寸（持久化） */
    this._winRect = readFloatWindowRect(WIN_STORAGE_KEY)
    /** @type {() => void|null} */
    this._dndUnwire = null
    /** @type {boolean} 标记最近一次 drop 是落在球上 → 展开后聚焦最后一个工作区视图 */
    this._pendingFocusLast = false
    /** @type {{ pointerX: number, pointerY: number, left: number, top: number }|null} */
    this._dragStart = null
    /** @type {'ball'|'title'|null} */
    this._draggingKind = null
    /** @type {string} */
    this._agentDetailHtml = AGENT_EMPTY_DETAIL_HTML
    this._onDragStartTitle = this._onDragStartTitle.bind(this)
    this._onDragStartBall = this._onDragStartBall.bind(this)
    this._onDragMove = this._onDragMove.bind(this)
    this._onDragEnd = this._onDragEnd.bind(this)
    this._onWinResizeObserve = this._onWinResizeObserve.bind(this)
    this._onViewportResize = this._onViewportResize.bind(this)
  }

  connectedCallback () {
    this._render()
    this._wireEvents()
    this._wireDnd()
    this._wireCtxMenu()
    this._applyVisibility()
    window.addEventListener('resize', this._onViewportResize)
  }

  disconnectedCallback () {
    this._dndUnwire?.()
    this._dndUnwire = null
    this._ctxMenuUnwire?.()
    this._ctxMenuUnwire = null
    window.removeEventListener('pointermove', this._onDragMove)
    window.removeEventListener('pointerup', this._onDragEnd)
    window.removeEventListener('resize', this._onViewportResize)
    if (this._winResizeObserver) {
      this._winResizeObserver.disconnect()
      this._winResizeObserver = null
    }
  }

  /**
   * 宿主（portal-app）调用：传入当前 content tab 的 floatview spec / mountRoot。
   * 传 `null` 表示当前 tab 无 floatview 视图（球只显示 AI tab）。
   *
   * @param {{
   *   title?: string,
   *   icon?: string,
   *   spec?: unknown,
   *   mountRoot?: HTMLElement|null,
   * }|null} state
   */
  setState (state) {
    const next = state || {}
    if (typeof next.title === 'string') this._title = next.title
    if (typeof next.icon === 'string' && next.icon) this._icon = next.icon
    const nextSpec = next.spec ?? null
    const nextMount = next.mountRoot || null
    /* 引用未变 + mountRoot 已挂载（或都无）→ 跳过重挂、重新渲染 tab bar，避免闪烁。 */
    const specSame = nextSpec === this._spec
    const wsPane = this.shadowRoot.getElementById('cmx-ws-float-pane-workspace')
    const mountSame = nextMount
      ? this._mountRoot === nextMount && (!wsPane || nextMount.parentElement === wsPane)
      : this._mountRoot === null
    if (specSame && mountSame) {
      this._syncIcons()
      return
    }
    this._spec = nextSpec
    const views = this._workspaceViews()
    /* 当前激活 tab 越界回落：跨 content tab 切换、views 数量变化时复位 */
    if (this._activeTab !== 'ai-dev' && this._activeTab !== 'ai' && this._activeTab !== 'detail' && (this._activeTab >= views.length || this._activeTab < 0)) {
      this._activeTab = views.length > 0 ? 0 : 'ai'
    }
    this._syncIcons()
    this._attachMountRoot(nextMount)
    this._renderTabBar()
    this._applyActiveTab()
  }

  /** @returns {boolean} */
  isOpen () {
    return this._open
  }

  /** 公开方法：展开浮动窗口（球态 → 视图态）。已展开则 no-op。 */
  open () {
    this._setOpen(true)
  }

  /** 公开方法：收起为浮动球（视图态 → 球态）。已收起则 no-op。 */
  close () {
    this._setOpen(false)
  }

  /** @returns {unknown} */
  getSpec () {
    return this._spec
  }

  /**
   * 激活指定索引的 workspace floatview 视图。负数 / 越界 / 无视图时退回 AI。
   * @param {number|'ai-dev'|'ai'|'detail'} idx
   */
  activateView (idx) {
    if (idx === 'ai-dev') {
      this._activeTab = 'ai-dev'
      this._ensureAiWorkbench()
    } else if (idx === 'ai') {
      this._activeTab = 'ai'
    } else if (idx === 'detail') {
      this._activeTab = 'detail'
    } else {
      const views = this._workspaceViews()
      const n = Math.max(0, Math.floor(Number(idx) || 0))
      this._activeTab = n < views.length ? n : 'ai'
    }
    if (!this._open) this._setOpen(true)
    this._applyActiveTab()
  }

  /**
   * 懒加载 AI 开发助手（cmx-ai-workbench）组件树。仅在首次切到「AI 开发助手」tab 时触发，
   * 避免把 markdown-it / shiki 等重组件塞进首屏。幂等：已注册则直接 resolve。
   * @returns {Promise<void>}
   */
  _ensureAiWorkbench () {
    if (this._aiWorkbenchLoading || customElements.get('ai-app')) return Promise.resolve()
    this._aiWorkbenchLoading = true
    return import('../ai-workbench/components/ai-app.js').catch((err) => {
      this._aiWorkbenchLoading = false
      console.warn('[float-window] AI 开发助手组件加载失败:', err)
    })
  }

  _workspaceViews () {
    return normalizeWorkspaceRegionViews(/** @type {any} */ (this._spec))
  }

  _render () {
    // eslint-disable-next-line no-restricted-syntax -- 模板静态文本 + escape 过的动态片段
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          position: fixed;
          inset: auto;
          z-index: 1400;
          display: block;
          overflow: visible;
          --neo-cyan: #00b4d8;
          --neo-violet: #7c3aed;
          --neo-mint: #10b981;
          --neo-warn: #f59e0b;
          --neo-glass: color-mix(in srgb, var(--sapList_Background, #fff) 88%, transparent);
          --neo-border: color-mix(in srgb, var(--neo-cyan) 32%, var(--sapGroup_ContentBorderColor, #d9d9d9));
        }

        @keyframes neo-float-aurora {
          0%, 100% { transform: rotate(0deg) scale(1); opacity: 0.72; }
          50% { transform: rotate(8deg) scale(1.04); opacity: 0.92; }
        }

        /* ===== 悬浮球 ===== */
        .ball-wrap {
          position: fixed;
          width: ${BALL_SIZE}px;
          height: ${BALL_SIZE}px;
          overflow: visible;
          pointer-events: none;
        }
        .ball-wrap .ball { pointer-events: auto; }
        :host(.window-open) .ball-wrap { display: none; }
        .ball {
          position: relative;
          width: ${BALL_SIZE}px;
          height: ${BALL_SIZE}px;
          border-radius: 50%;
          background:
            conic-gradient(from 210deg,
              var(--neo-violet) 0deg,
              var(--neo-cyan) 120deg,
              var(--neo-mint) 240deg,
              var(--neo-violet) 360deg);
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: grab;
          box-shadow:
            0 4px 18px color-mix(in srgb, var(--neo-violet) 35%, transparent),
            0 0 24px color-mix(in srgb, var(--neo-cyan) 22%, transparent),
            inset 0 1px 0 color-mix(in srgb, #fff 45%, transparent);
          transition: transform 0.2s ease, box-shadow 0.22s ease;
          user-select: none;
          touch-action: none;
          overflow: hidden;
        }
        .ball::before {
          content: '';
          position: absolute;
          inset: 3px;
          border-radius: 50%;
          background: color-mix(in srgb, var(--neo-violet) 18%, transparent);
          filter: blur(6px);
          animation: neo-float-aurora 10s ease-in-out infinite;
          pointer-events: none;
        }
        .ball::after {
          content: '';
          position: absolute;
          inset: 4px;
          border-radius: 50%;
          background: color-mix(in srgb, var(--sapList_Background, #fff) 12%, transparent);
          border: 1px solid color-mix(in srgb, #fff 35%, transparent);
          pointer-events: none;
        }
        .ball:hover {
          transform: scale(1.08);
          box-shadow:
            0 6px 22px color-mix(in srgb, var(--neo-violet) 42%, transparent),
            0 0 32px color-mix(in srgb, var(--neo-cyan) 30%, transparent);
        }
        .ball.dragging { cursor: grabbing; transition: none; }
        .ball.${DROP_TARGET_CLASS} {
          outline: 2px dashed var(--neo-cyan);
          outline-offset: 3px;
          box-shadow: 0 0 0 4px color-mix(in srgb, var(--neo-cyan) 18%, transparent);
        }
        .ball ui5-icon {
          position: relative;
          z-index: 1;
          width: 22px;
          height: 22px;
          color: #fff;
          filter: drop-shadow(0 0 6px color-mix(in srgb, #fff 55%, transparent));
          pointer-events: none;
        }
        .ball-badge {
          position: absolute;
          z-index: 3;
          bottom: -2px;
          right: -2px;
          min-width: 18px;
          height: 18px;
          padding: 0 5px;
          border-radius: 9px;
          background: linear-gradient(135deg, var(--neo-warn), #ea580c);
          color: #fff;
          font-size: 10px;
          font-weight: 800;
          font-family: ui-monospace, monospace;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 8px color-mix(in srgb, var(--neo-warn) 45%, transparent);
          pointer-events: none;
        }

        /* ===== 浮动窗口 ===== */
        .frame {
          position: fixed;
          box-sizing: border-box;
          display: none;
          flex-direction: column;
          background:
            linear-gradient(165deg,
              color-mix(in srgb, var(--neo-violet) 4%, var(--sapList_Background, #fff)),
              color-mix(in srgb, var(--neo-cyan) 3%, var(--sapList_Background, #fff)) 45%,
              var(--sapList_Background, #fff));
          border: 1px solid color-mix(in srgb, var(--neo-cyan) 28%, var(--neo-violet) 14%);
          border-radius: 14px;
          box-shadow:
            0 12px 40px color-mix(in srgb, var(--neo-violet) 14%, transparent),
            0 4px 16px color-mix(in srgb, var(--neo-cyan) 10%, transparent),
            inset 0 1px 0 color-mix(in srgb, #fff 50%, transparent);
          backdrop-filter: blur(16px);
          resize: both;
          overflow: hidden;
          min-width: 280px;
          min-height: 220px;
        }
        :host(.window-open) .frame { display: flex; }
        .frame.${DROP_TARGET_CLASS} {
          outline: 2px dashed var(--neo-cyan);
          outline-offset: -2px;
          box-shadow: 0 0 0 4px color-mix(in srgb, var(--neo-cyan) 12%, transparent);
        }
        .title-bar {
          display: flex;
          align-items: center;
          gap: 8px;
          height: ${TITLE_BAR_HEIGHT}px;
          padding: 0 10px 0 12px;
          background:
            linear-gradient(95deg,
              color-mix(in srgb, var(--neo-violet) 16%, var(--sapObjectHeader_Background, #f5f6f7)),
              color-mix(in srgb, var(--neo-cyan) 12%, var(--sapObjectHeader_Background, #f5f6f7)) 55%,
              color-mix(in srgb, var(--neo-mint) 8%, var(--sapObjectHeader_Background, #f5f6f7)));
          border-bottom: 1px solid color-mix(in srgb, var(--neo-cyan) 22%, var(--sapGroup_TitleBorderColor, #ddd));
          cursor: grab;
          user-select: none;
          flex-shrink: 0;
          position: relative;
        }
        .title-bar::after {
          content: '';
          position: absolute;
          left: 12px; right: 12px; bottom: 0;
          height: 1px;
          background: linear-gradient(90deg, var(--neo-violet), var(--neo-cyan), var(--neo-mint), transparent 85%);
          opacity: 0.75;
          pointer-events: none;
        }
        .title-bar.dragging { cursor: grabbing; }
        .title-bar ui5-icon {
          width: 16px;
          height: 16px;
          flex-shrink: 0;
          color: var(--neo-cyan);
          filter: drop-shadow(0 0 4px color-mix(in srgb, var(--neo-cyan) 40%, transparent));
        }
        .title-text {
          font-size: 0.82rem;
          font-weight: 800;
          letter-spacing: 0.03em;
          font-family: ui-monospace, system-ui, sans-serif;
          background: linear-gradient(90deg, var(--sapTitleColor, #223548), var(--neo-cyan));
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          flex: 1 1 auto;
          min-width: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .title-actions { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
        .title-bar.${DROP_TARGET_CLASS} {
          background: color-mix(in srgb, var(--neo-cyan) 18%, var(--sapObjectHeader_Background, #f5f6f7));
        }

        .body {
          flex: 1 1 auto;
          min-height: 0;
          min-width: 0;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          background:
            radial-gradient(ellipse 80% 60% at 100% 0%, color-mix(in srgb, var(--neo-violet) 8%, transparent), transparent 55%),
            radial-gradient(ellipse 70% 50% at 0% 100%, color-mix(in srgb, var(--neo-cyan) 7%, transparent), transparent 50%),
            var(--sapList_Background, #fff);
          position: relative;
        }
        .body::before {
          content: '';
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(color-mix(in srgb, var(--neo-cyan) 5%, transparent) 1px, transparent 1px),
            linear-gradient(90deg, color-mix(in srgb, var(--neo-cyan) 5%, transparent) 1px, transparent 1px);
          background-size: 24px 24px;
          mask-image: linear-gradient(180deg, rgba(0,0,0,0.22) 0%, transparent 65%);
          pointer-events: none;
          z-index: 0;
        }
        .pane {
          position: absolute;
          inset: 0;
          display: none;
          flex-direction: column;
          overflow: auto;
          z-index: 1;
        }
        .pane.active { display: flex; }
        .pane-ai {
          color: var(--sapTextColor, #333);
          overflow: hidden;
          background: var(--sapBackgroundColor, #fff);
        }
        portal-agent-console {
          flex: 1 1 auto;
          min-height: 0;
          width: 100%;
        }
        .pane-ai-dev {
          overflow: hidden;
          background: var(--oc-bg-base, var(--sapBackgroundColor, #fff));
        }
        /* ai-app（cmx-ai-workbench）是 Lit 组件，自带 --oc-* 主题；撑满浮窗面板即可。 */
        .pane-ai-dev > ai-app {
          flex: 1 1 auto;
          min-height: 0;
          width: 100%;
          display: flex;
        }
        .pane-detail {
          background: var(--sapBackgroundColor, #fff);
          color: var(--sapTextColor, #1d2d3e);
          padding: 0;
          overflow: hidden;
          box-sizing: border-box;
          font: 13px/1.45 var(--sapFontFamily, Arial, sans-serif);
        }
        .agent-detail-toolbar {
          flex: 0 0 auto;
          height: 32px;
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 0 8px 0 10px;
          border-bottom: 1px solid var(--sapList_BorderColor, #e5eaf0);
          background: color-mix(in srgb, var(--neo-cyan) 5%, var(--sapObjectHeader_Background, #f7f9fb));
          box-sizing: border-box;
        }
        .agent-detail-title {
          flex: 1 1 auto;
          min-width: 0;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: var(--sapContent_LabelColor, #6a6d70);
          font-size: 12px;
          font-weight: 700;
        }
        .agent-detail-title ui5-icon {
          width: 14px;
          height: 14px;
          color: var(--neo-cyan);
        }
        .agent-detail-action {
          width: 26px;
          height: 26px;
          padding: 0;
          border: 1px solid transparent;
          border-radius: 6px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: var(--sapContent_IconColor, #5b6b7a);
          background: transparent;
          cursor: pointer;
        }
        .agent-detail-action:hover {
          color: var(--sapButton_Emphasized_Background, var(--neo-cyan));
          background: color-mix(in srgb, var(--neo-cyan) 9%, transparent);
          border-color: color-mix(in srgb, var(--neo-cyan) 18%, transparent);
        }
        .agent-detail-action ui5-icon {
          width: 14px;
          height: 14px;
          pointer-events: none;
        }
        .agent-detail-body {
          flex: 1 1 auto;
          min-height: 0;
          overflow: auto;
          padding: 10px;
          box-sizing: border-box;
        }
        .agent-detail-body pre {
          margin: 0;
          border: 1px solid var(--sapList_BorderColor, #e5eaf0);
          border-radius: 8px;
          background: var(--sapShell_Background, #f7f9fb);
          padding: 10px;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
          color: var(--sapTextColor, #1d2d3e);
        }
        .agent-detail-body pre.diff {
          white-space: pre;
          overflow: auto;
        }
        .agent-detail-body .diff span { display: block; min-height: 1.45em; }
        .agent-detail-body .diff .add { color: var(--sapPositiveTextColor, var(--sapPositiveColor, #107e3e)); background: color-mix(in srgb, var(--sapPositiveColor, #107e3e) 10%, transparent); }
        .agent-detail-body .diff .del { color: var(--sapNegativeTextColor, var(--sapNegativeColor, #bb0000)); background: color-mix(in srgb, var(--sapNegativeColor, #bb0000) 10%, transparent); }
        .agent-detail-body .diff .hunk { color: var(--sapInformativeTextColor, var(--sapHighlightColor, #0a6ed1)); font-weight: 700; }
        .agent-detail-body .kv { display: grid; grid-template-columns: 76px 1fr; gap: 6px 10px; margin-bottom: 10px; font-size: 12px; }
        .agent-detail-body .kv label { color: var(--sapContent_LabelColor, #6a6d70); font-weight: 700; }
        .agent-detail-body .kv span { min-width: 0; overflow-wrap: anywhere; }
        .agent-detail-body .diagnostics { display: grid; gap: 8px; margin: 0 0 10px; }
        .agent-detail-body .diag { border: 1px solid var(--sapList_BorderColor, #e5eaf0); border-left-width: 3px; border-radius: 6px; padding: 8px; background: var(--sapTile_Background, #fff); font-size: 12px; }
        .agent-detail-body .diag.warning { border-left-color: var(--sapCriticalColor, #df6e0c); }
        .agent-detail-body .diag.error { border-left-color: var(--sapNegativeColor, #bb0000); }
        .agent-detail-body .diag strong { display: inline-block; min-width: 52px; text-transform: uppercase; }
        .agent-detail-body .diag span,
        .empty-detail { color: var(--sapContent_LabelColor, #6a6d70); }
        .agent-detail-body .diag p { margin: 4px 0; overflow-wrap: anywhere; }
        .agent-detail-body .detail-plan { margin: 0; padding-left: 22px; }
        .agent-detail-body .workflow-detail h3 { margin: 0 0 8px; font-size: 14px; }
        .agent-detail-body .steps { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
        .agent-detail-body .step { display: inline-flex; align-items: center; height: 24px; padding: 0 8px; border: 1px solid var(--sapList_BorderColor, #e5eaf0); border-radius: 999px; background: var(--sapShell_Background, #f7f9fb); font-size: 12px; color: var(--sapContent_LabelColor, #6a6d70); }
        /* workspace 区域内 mount root 的内层 tab 栏隐藏：外层 tab 栏统一驱动 */
        .pane-workspace .cmx-ws-region-tabs-top,
        .pane-workspace .cmx-ws-region-tabs-bottom {
          display: none !important;
        }

        /* ===== 底部 Tab 栏 ===== */
        .tab-bar {
          flex-shrink: 0;
          display: flex;
          flex-wrap: nowrap;
          align-items: stretch;
          gap: 0;
          border-top: 1px solid color-mix(in srgb, var(--neo-cyan) 22%, var(--sapPageHeader_BorderColor, #ddd));
          background:
            linear-gradient(180deg,
              color-mix(in srgb, var(--neo-violet) 4%, var(--sapObjectHeader_Background, #fff)),
              var(--sapObjectHeader_Background, #fff));
          overflow-x: auto;
          overflow-y: hidden;
        }
        .tab-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          flex: 0 0 auto;
          padding: 0 14px 0 10px;
          height: 34px;
          font-size: 0.72rem;
          font-weight: 600;
          font-family: ui-monospace, system-ui, sans-serif;
          letter-spacing: 0.04em;
          cursor: pointer;
          border: none;
          background: transparent;
          color: var(--sapContent_LabelColor, #6a6d70);
          border-top: 2px solid transparent;
          transition: color 0.18s ease, background 0.18s ease, border-color 0.18s ease;
        }
        .tab-btn:hover:not(.active) {
          color: var(--sapTitleColor, #223548);
          background: color-mix(in srgb, var(--neo-cyan) 6%, transparent);
        }
        .tab-btn.active {
          color: var(--sapTitleColor, #223548);
          font-weight: 800;
          background: color-mix(in srgb, var(--neo-cyan) 8%, var(--sapList_Background, #fff));
        }
        .tab-btn ui5-icon {
          width: 14px;
          height: 14px;
          flex-shrink: 0;
          pointer-events: none;
          color: inherit;
        }
        .tab-btn-ai-dev {
          background: color-mix(in srgb, var(--neo-warn) 6%, var(--sapList_Background, #fafafa));
          border-right: 1px solid color-mix(in srgb, var(--neo-warn) 18%, var(--sapPageHeader_BorderColor, #eee));
        }
        .tab-btn-ai-dev ui5-icon { color: var(--neo-warn); }
        .tab-btn-ai-dev.active {
          border-top-color: var(--neo-warn);
          background: color-mix(in srgb, var(--neo-warn) 10%, var(--sapList_Background, #fff));
        }
        .tab-btn-ai-dev.active ui5-icon {
          color: var(--neo-warn);
          filter: drop-shadow(0 0 4px color-mix(in srgb, var(--neo-warn) 35%, transparent));
        }
        .tab-btn-ai {
          background: color-mix(in srgb, var(--neo-violet) 6%, var(--sapList_Background, #fafafa));
          border-right: 1px solid color-mix(in srgb, var(--neo-violet) 18%, var(--sapPageHeader_BorderColor, #eee));
        }
        .tab-btn-ai ui5-icon { color: var(--neo-violet); }
        .tab-btn-ai.active {
          border-top-color: var(--neo-violet);
          background: color-mix(in srgb, var(--neo-violet) 10%, var(--sapList_Background, #fff));
        }
        .tab-btn-ai.active ui5-icon {
          color: var(--neo-violet);
          filter: drop-shadow(0 0 4px color-mix(in srgb, var(--neo-violet) 35%, transparent));
        }
        .tab-btn-detail {
          border-right: 1px solid color-mix(in srgb, var(--neo-cyan) 14%, var(--sapPageHeader_BorderColor, #eee));
        }
        .tab-btn-detail.active {
          border-top-color: var(--neo-cyan);
          background: color-mix(in srgb, var(--neo-cyan) 9%, var(--sapList_Background, #fff));
        }
        .tab-btn-detail.active ui5-icon {
          color: var(--neo-cyan);
        }
        .tab-btn.cmx-ws-tab-btn.active {
          border-top-color: var(--neo-mint);
          background: color-mix(in srgb, var(--neo-mint) 9%, var(--sapList_Background, #fff));
        }
        .tab-btn.cmx-ws-tab-btn.active ui5-icon {
          color: var(--neo-mint);
        }

        @media (prefers-reduced-motion: reduce) {
          .ball::before { animation: none; }
        }
      </style>

      <!-- 悬浮球（默认形态） -->
      <div class="ball-wrap" id="cmx-ws-float-ball-wrap">
        <div class="ball" id="cmx-ws-float-ball" tabindex="0" role="button" aria-label="AI 助手 / 浮动视图">
          <ui5-icon id="cmx-ws-float-ball-icon" name="ai"></ui5-icon>
        </div>
        <span class="ball-badge" id="cmx-ws-float-ball-badge" hidden></span>
      </div>

      <!-- 浮动窗口 -->
      <div class="frame" id="cmx-ws-float-frame">
        <div class="title-bar" id="cmx-ws-float-title">
          <ui5-icon id="cmx-ws-float-icon" name="ai"></ui5-icon>
          <span class="title-text" id="cmx-ws-float-title-text"></span>
          <div class="title-actions">
            <ui5-button id="cmx-ws-float-close" design="Transparent" icon="decline" tooltip="收起为悬浮球"></ui5-button>
          </div>
        </div>
        <div class="body" id="cmx-ws-float-body">
          <div class="pane pane-ai-dev" data-pane="ai-dev" id="cmx-ws-float-pane-ai-dev">
            <ai-app id="cmx-ws-ai-workbench" layout="compact"></ai-app>
          </div>
          <div class="pane pane-ai active" data-pane="ai" id="cmx-ws-float-pane-ai">
            <portal-agent-console id="cmx-ws-agent-console" layout="compact"></portal-agent-console>
          </div>
          <div class="pane pane-detail" data-pane="detail" id="cmx-ws-float-pane-detail">
            <div class="agent-detail-toolbar">
              <span class="agent-detail-title"><ui5-icon name="detail-view"></ui5-icon><span>详情</span></span>
              <button type="button" class="agent-detail-action" data-detail-action="clear" title="清除" aria-label="清除详情">
                <ui5-icon name="delete"></ui5-icon>
              </button>
              <button type="button" class="agent-detail-action" data-detail-action="export" title="导出文件" aria-label="导出详情文件">
                <ui5-icon name="download"></ui5-icon>
              </button>
            </div>
            <div class="agent-detail-body" id="cmx-ws-agent-detail">${this._agentDetailHtml}</div>
          </div>
          <div class="pane pane-workspace" data-pane="workspace" id="cmx-ws-float-pane-workspace"></div>
        </div>
        <div class="tab-bar" id="cmx-ws-float-tab-bar" role="tablist"></div>
      </div>
    `
    this._renderTabBar()
    this._renderAgentDetail()
    this._applyBallBounds()
    this._applyWindowBounds()
  }

  _wireEvents () {
    const sr = this.shadowRoot
    const title = sr.getElementById('cmx-ws-float-title')
    const closeBtn = sr.getElementById('cmx-ws-float-close')
    const ball = sr.getElementById('cmx-ws-float-ball')
    const tabBar = sr.getElementById('cmx-ws-float-tab-bar')
    const agent = sr.getElementById('cmx-ws-agent-console')
    const detailPane = sr.getElementById('cmx-ws-float-pane-detail')
    if (title) title.addEventListener('pointerdown', this._onDragStartTitle)
    if (ball) {
      ball.addEventListener('pointerdown', this._onDragStartBall)
      ball.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          this._setOpen(true)
        }
      })
    }
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this._setOpen(false))
    }
    if (tabBar) {
      tabBar.addEventListener('click', (e) => {
        const t = /** @type {Element|null} */ (e.target)
        const btn = t && t.closest('.tab-btn')
        if (!(btn instanceof HTMLElement)) return
        const key = btn.dataset.tabKey
        if (key === 'ai-dev') {
          this._activeTab = 'ai-dev'
          void this._ensureAiWorkbench()
        } else if (key === 'ai') {
          this._activeTab = 'ai'
        } else if (key === 'detail') {
          this._activeTab = 'detail'
        } else {
          const idx = parseInt(String(key ?? ''), 10)
          if (Number.isNaN(idx)) return
          this._activeTab = idx
        }
        this._applyActiveTab()
      })
    }
    if (agent) {
      agent.addEventListener('portal-agent-detail-change', (e) => {
        const html = /** @type {CustomEvent<{ html?: string }>} */ (e).detail?.html
        this._agentDetailHtml = typeof html === 'string' && html ? html : AGENT_EMPTY_DETAIL_HTML
        this._renderAgentDetail()
      })
    }
    if (detailPane) {
      detailPane.addEventListener('click', (e) => {
        const t = /** @type {Element|null} */ (e.target)
        const btn = t && t.closest('[data-detail-action]')
        if (!(btn instanceof HTMLElement)) return
        const action = btn.dataset.detailAction
        if (action === 'clear') this._clearAgentDetail()
        if (action === 'export') this._exportAgentDetail()
      })
    }
    /* 窗口尺寸变化（resize: both）→ 持久化 */
    const frame = sr.getElementById('cmx-ws-float-frame')
    if (frame instanceof HTMLElement && typeof ResizeObserver === 'function') {
      this._winResizeObserver = new ResizeObserver(this._onWinResizeObserve)
      this._winResizeObserver.observe(frame)
    }
  }

  _renderAgentDetail () {
    const box = this.shadowRoot.getElementById('cmx-ws-agent-detail')
    if (!(box instanceof HTMLElement)) return
    // eslint-disable-next-line no-restricted-syntax -- HTML 由 portal-agent-console 内部转义后生成。
    box.innerHTML = this._agentDetailHtml || AGENT_EMPTY_DETAIL_HTML
  }

  _clearAgentDetail () {
    this._agentDetailHtml = AGENT_EMPTY_DETAIL_HTML
    this._renderAgentDetail()
  }

  _exportAgentDetail () {
    const html = this._agentDetailHtml || AGENT_EMPTY_DETAIL_HTML
    const title = `CMX AI 助手详情 ${new Date().toLocaleString()}`
    const doc = this._buildAgentDetailExportHtml(title, html)
    this._downloadTextFile(`cmx-agent-detail-${this._timestampForFile()}.html`, doc, 'text/html;charset=utf-8')
  }

  /**
   * @param {string} title
   * @param {string} bodyHtml
   * @returns {string}
   */
  _buildAgentDetailExportHtml (title, bodyHtml) {
    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escHtml(title)}</title>
  <style>
    :root { color-scheme: light dark; }
    body { margin: 0; padding: 20px; font: 13px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; color: CanvasText; background: Canvas; }
    main { max-width: 1080px; margin: 0 auto; }
    h1 { margin: 0 0 14px; font-size: 18px; }
    pre { margin: 0; border: 1px solid color-mix(in srgb, CanvasText 16%, transparent); border-radius: 8px; background: color-mix(in srgb, CanvasText 5%, Canvas); padding: 10px; white-space: pre-wrap; overflow-wrap: anywhere; font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
    pre.diff { white-space: pre; overflow: auto; }
    .diff span { display: block; min-height: 1.45em; }
    .diff .add { color: var(--sapPositiveElementColor, #188038); background: color-mix(in srgb, var(--sapPositiveTextColor, #188038) 10%, transparent); }
    .diff .del { color: var(--sapNegativeElementColor, #b3261e); background: color-mix(in srgb, var(--sapNegativeTextColor, #b3261e) 10%, transparent); }
    .diff .hunk { color: var(--sapLinkColor, #0b57d0); font-weight: 700; }
    .kv { display: grid; grid-template-columns: 76px 1fr; gap: 6px 10px; margin-bottom: 10px; font-size: 12px; }
    .kv label { opacity: .72; font-weight: 700; }
    .kv span { min-width: 0; overflow-wrap: anywhere; }
    .diagnostics { display: grid; gap: 8px; margin: 0 0 10px; }
    .diag { border: 1px solid color-mix(in srgb, CanvasText 14%, transparent); border-left-width: 3px; border-radius: 6px; padding: 8px; font-size: 12px; }
    .diag.warning { border-left-color: var(--sapCriticalElementColor, #b95000); }
    .diag.error { border-left-color: var(--sapNegativeElementColor, #b3261e); }
    .diag strong { display: inline-block; min-width: 52px; text-transform: uppercase; }
    .diag p { margin: 4px 0; overflow-wrap: anywhere; }
    .detail-plan { margin: 0; padding-left: 22px; }
    .workflow-detail h3 { margin: 0 0 8px; font-size: 14px; }
    .steps { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
    .step { display: inline-flex; align-items: center; min-height: 24px; padding: 0 8px; border: 1px solid color-mix(in srgb, CanvasText 14%, transparent); border-radius: 999px; font-size: 12px; opacity: .82; }
    .empty-detail { opacity: .72; }
  </style>
</head>
<body>
  <main>
    <h1>${escHtml(title)}</h1>
    ${bodyHtml}
  </main>
</body>
</html>`
  }

  /**
   * @param {string} filename
   * @param {string} text
   * @param {string} type
   */
  _downloadTextFile (filename, text, type) {
    const blob = new Blob([text], { type })
    const a = document.createElement('a')
    const url = URL.createObjectURL(blob)
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  /** @returns {string} */
  _timestampForFile () {
    const d = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  }

  _onWinResizeObserve () {
    if (!this._open) return
    const frame = this.shadowRoot.getElementById('cmx-ws-float-frame')
    if (!(frame instanceof HTMLElement)) return
    const r = frame.getBoundingClientRect()
    if (r.width <= 0 || r.height <= 0) return
    this._winRect = {
      left: this._winRect?.left ?? r.left,
      top: this._winRect?.top ?? r.top,
      w: r.width,
      h: r.height,
    }
    writeFloatWindowRect(WIN_STORAGE_KEY, this._winRect)
    if (this._activeTab === 'ai') this._scrollAgentToLatest()
  }

  _wireDnd () {
    if (this._dndUnwire) return
    /* shadowRoot 级 dnd：dragstart/dragover/dragleave/drop。
       pane 取整个 frame，使得底部 tab-bar 上的 `.cmx-ws-tab-btn` 也能作为拖拽源；
       drop 命中区内 tab 按钮时按水平中线决定 insertIndex。 */
    this._dndUnwire = wireWorkspacePanelDnd(
      this.shadowRoot,
      () => this.shadowRoot.getElementById('cmx-ws-float-frame'),
      /** @type {any} */ ('floatview'),
      () => this._readActiveWsTabId(),
      () => /** @type {Record<string, unknown>|null} */ (this._spec || null),
      (detail) => {
        this.dispatchEvent(new CustomEvent('portal-workspace-view-dropped', {
          bubbles: true,
          composed: true,
          detail,
        }))
      },
    )
    /* 标题栏：作为追加 drop 区（视觉反馈） */
    const title = this.shadowRoot.getElementById('cmx-ws-float-title')
    if (title instanceof HTMLElement) {
      title.addEventListener('dragover', (e) => {
        if (!this._isWsPayload(e)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        title.classList.add(DROP_TARGET_CLASS)
      })
      title.addEventListener('dragleave', (e) => {
        const rel = /** @type {Element|null} */ (e.relatedTarget)
        if (rel && title.contains(rel)) return
        title.classList.remove(DROP_TARGET_CLASS)
      })
      title.addEventListener('drop', () => {
        title.classList.remove(DROP_TARGET_CLASS)
      })
    }
    /* 球：drop target 视觉 + 自动展开。drop 事件由 shadowRoot-level 处理器同步派发，无需重复。 */
    const ball = this.shadowRoot.getElementById('cmx-ws-float-ball')
    if (ball instanceof HTMLElement) {
      ball.addEventListener('dragover', (e) => {
        if (!this._isWsPayload(e)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        ball.classList.add(DROP_TARGET_CLASS)
      })
      ball.addEventListener('dragleave', (e) => {
        const rel = /** @type {Element|null} */ (e.relatedTarget)
        if (rel && ball.contains(rel)) return
        ball.classList.remove(DROP_TARGET_CLASS)
      })
      ball.addEventListener('drop', (e) => {
        if (!this._isWsPayload(e)) return
        ball.classList.remove(DROP_TARGET_CLASS)
        this._pendingFocusLast = true
        this._setOpen(true)
      })
    }
  }

  /** @param {DragEvent} e */
  _isWsPayload (e) {
    const types = e.dataTransfer?.types
    if (!types) return false
    for (const t of types) if (t === 'application/x-cmx-ws-view-move') return true
    return false
  }

  /** @returns {string} */
  _readActiveWsTabId () {
    const app = document.querySelector('cmx-portal-app')
    return (app instanceof HTMLElement && app.dataset?.cmxActiveWsTab) || ''
  }

  _wireCtxMenu () {
    if (this._ctxMenuUnwire) return
    /* 仅 workspace pane（含底部 tab-bar 上的 `.cmx-ws-tab-btn`）参与；AI tab 与标题/球皆不触发。 */
    this._ctxMenuUnwire = wireWorkspaceRegionTabContextMenu(
      this.shadowRoot,
      () => {
        const bar = this.shadowRoot.getElementById('cmx-ws-float-tab-bar')
        const wsPane = this.shadowRoot.getElementById('cmx-ws-float-pane-workspace')
        /* 返回一个临时 fragment 容器：判断 contains 时 helper 会在 pane 内查找；
           我们直接返回 frame 作为最大可视范围，再由 helper 内部限制到 `.cmx-ws-tab-btn`。 */
        return bar || wsPane || null
      },
      /** @type {any} */ ('floatview'),
      () => this._readActiveWsTabId(),
      () => /** @type {Record<string, unknown>|null} */ (this._spec || null),
    )
  }

  _syncIcons () {
    const sr = this.shadowRoot
    const titleIcon = sr.getElementById('cmx-ws-float-icon')
    const titleText = sr.getElementById('cmx-ws-float-title-text')
    const wsIcon = safeUi5IconName(this._icon || 'popup-window')
    /* 标题永远显示当前 content tab 的 caption（由宿主传入）；空时退回 AI 提示 */
    const cap = this._captionText()
    if (titleIcon instanceof HTMLElement) titleIcon.setAttribute('name', this._workspaceViews().length ? wsIcon : 'ai')
    if (titleText instanceof HTMLElement) titleText.textContent = cap
    /* 球的 icon 始终为 `ai`（首要功能），右上角小红点显示 workspace 视图数 */
    const badge = sr.getElementById('cmx-ws-float-ball-badge')
    const n = this._workspaceViews().length
    if (badge instanceof HTMLElement) {
      if (n > 0) {
        badge.textContent = String(n)
        badge.hidden = false
      } else {
        badge.textContent = ''
        badge.hidden = true
      }
    }
  }

  _captionText () {
    const wrap = workspaceRegionViewsWrapper(/** @type {any} */ (this._spec))
    const wrapCaption = wrap && wrap.caption != null ? String(wrap.caption).trim() : ''
    if (wrapCaption) return wrapCaption
    return this._title || 'AI 助手'
  }

  _renderTabBar () {
    const bar = this.shadowRoot.getElementById('cmx-ws-float-tab-bar')
    if (!(bar instanceof HTMLElement)) return
    const tabs = buildFloatWindowTabs(this._workspaceViews(), this._activeTab)
    // eslint-disable-next-line no-restricted-syntax -- tab html 已在 helper 内做 escape / icon 安全处理
    bar.innerHTML = renderFloatWindowTabBarHtml(tabs)
    /* floatview tab bar 同条带 reorder：itemSelector 选 .cmx-ws-tab-btn 自动排除 AI tab（无此 class）。
       与 dock 用不同 mime + stopPropagation 互不干扰。
       **用 CSS order** 视觉重排，DOM 不变——避免 CE disconnect 导致 unregisterView（跨视图 API 失效）。 */
    wireTabStripReorder(bar, {
      itemSelector: '.cmx-ws-tab-btn',
      onReorder: (fromIdx, toIdx) => {
        const mountRoot = this._mountRoot
        const region = mountRoot instanceof HTMLElement ? mountRoot.querySelector('.cmx-ws-region') : null
        const body = region ? region.querySelector('.cmx-ws-region-body') : null
        reorderByCssOrder(
          bar,
          body instanceof HTMLElement ? body : (mountRoot instanceof HTMLElement ? mountRoot : null),
          '.cmx-ws-tab-btn',
          '.cmx-ws-tab-pane',
          fromIdx,
          toIdx,
        )
      },
    })
  }

  _applyActiveTab () {
    const sr = this.shadowRoot
    const aiDevPane = sr.getElementById('cmx-ws-float-pane-ai-dev')
    const aiPane = sr.getElementById('cmx-ws-float-pane-ai')
    const detailPane = sr.getElementById('cmx-ws-float-pane-detail')
    const wsPane = sr.getElementById('cmx-ws-float-pane-workspace')
    const aiDevActive = this._activeTab === 'ai-dev'
    const aiActive = this._activeTab === 'ai'
    const detailActive = this._activeTab === 'detail'
    if (aiDevPane instanceof HTMLElement) aiDevPane.classList.toggle('active', aiDevActive)
    if (aiPane instanceof HTMLElement) aiPane.classList.toggle('active', aiActive)
    if (detailPane instanceof HTMLElement) detailPane.classList.toggle('active', detailActive)
    if (wsPane instanceof HTMLElement) wsPane.classList.toggle('active', !aiDevActive && !aiActive && !detailActive)
    syncFloatWindowTabBarState(/** @type {HTMLElement|null} */ (sr.getElementById('cmx-ws-float-tab-bar')), this._activeTab)
    if (!aiDevActive && !aiActive && !detailActive) syncFloatWorkspacePaneState(this._mountRoot, this._activeTab)
    if (aiActive && this._open) this._scrollAgentToLatest()
  }

  _scrollAgentToLatest () {
    const agent = this.shadowRoot.getElementById('cmx-ws-agent-console')
    if (!agent || typeof agent.scrollToLatest !== 'function') return
    agent.scrollToLatest()
  }

  /** @param {HTMLElement|null} mountRoot */
  _attachMountRoot (mountRoot) {
    const wsPane = /** @type {HTMLElement|null} */ (this.shadowRoot.getElementById('cmx-ws-float-pane-workspace'))
    if (!(wsPane instanceof HTMLElement)) return
    if (mountRoot) {
      this._mountRoot = attachFloatWorkspaceMount({
        wsPane,
        mountRoot,
        prevMountRoot: this._mountRoot,
      })
      hydrateFloatWorkspacePane(wsPane)
      return
    }
    /* mountRoot=null + 已有 prevMount 挂载：保留 DOM 不动，避免缓存根内 CE disconnect 风暴；
       浮动窗口本身由 _applyVisibility 收起（class window-open 移除）即可遮蔽视图。 */
    if (this._mountRoot && this._mountRoot.parentElement === wsPane) {
      return
    }
    this._mountRoot = null
    clearFloatWorkspacePane(wsPane)
    if (this._workspaceViews().length > 0) {
      renderFloatWorkspaceFallback({
        wsPane,
        spec: this._spec,
        region: 'floatview',
      })
      hydrateFloatWorkspacePane(wsPane)
    }
  }

  _applyVisibility () {
    if (this._open) {
      this.classList.add('window-open')
      this._applyWindowBounds()
    } else {
      this.classList.remove('window-open')
      this._applyBallBounds()
    }
  }

  /** @param {boolean} open */
  _setOpen (open) {
    if (this._open === open) {
      if (open && this._pendingFocusLast) this._focusLastWsTabIfAny()
      if (open && this._activeTab === 'ai') this._scrollAgentToLatest()
      return
    }
    this._open = !!open
    if (open) {
      if (this._pendingFocusLast) this._focusLastWsTabIfAny()
    }
    this._applyVisibility()
    this._applyActiveTab()
    if (this._open && this._activeTab === 'ai') this._scrollAgentToLatest()
    /* 通知外部（shellbar AI 按钮等）真实开/收状态。涵盖所有路径：
       球点击 / 拖拽 drop 自动展开 / 关闭按钮 / `open()`/`close()` 公开调用。 */
    this.dispatchEvent(new CustomEvent('portal-workspace-float-state-change', {
      bubbles: true,
      composed: true,
      detail: { open: this._open },
    }))
  }

  _focusLastWsTabIfAny () {
    this._pendingFocusLast = false
    const views = this._workspaceViews()
    if (views.length > 0) {
      this._activeTab = views.length - 1
    }
  }

  _ensureBallPos () {
    const { pos, shouldPersist } = ensureFloatBallPos(this._ballPos, {
      width: window.innerWidth,
      height: window.innerHeight,
    }, {
      ballSize: BALL_SIZE,
      ballMargin: BALL_MARGIN,
    })
    this._ballPos = pos
    if (shouldPersist) writeFloatBallPos(POS_STORAGE_KEY, pos)
  }

  _applyBallBounds () {
    this._ensureBallPos()
    const wrap = this.shadowRoot.getElementById('cmx-ws-float-ball-wrap')
    if (!(wrap instanceof HTMLElement)) return
    wrap.style.left = `${this._ballPos.left}px`
    wrap.style.top = `${this._ballPos.top}px`
  }

  _ensureWinRect () {
    const { rect, shouldPersist } = ensureFloatWindowRect(this._winRect, {
      width: window.innerWidth,
      height: window.innerHeight,
    }, {
      defaultWidth: DEFAULT_WIDTH,
      defaultHeight: DEFAULT_HEIGHT,
      titleBarHeight: TITLE_BAR_HEIGHT,
    })
    this._winRect = rect
    if (shouldPersist) writeFloatWindowRect(WIN_STORAGE_KEY, rect)
  }

  /** 公开方法：把球与窗口重置到当前视口右下角（同时清除持久化）。 */
  resetPosition () {
    this._ballPos = null
    this._winRect = null
    clearFloatWindowPersistence({
      ballPosKey: POS_STORAGE_KEY,
      windowRectKey: WIN_STORAGE_KEY,
    })
    this._applyBallBounds()
    this._applyWindowBounds()
  }

  _onViewportResize () {
    if (this._open) this._applyWindowBounds()
    else this._applyBallBounds()
  }

  _applyWindowBounds () {
    this._ensureWinRect()
    const frame = this.shadowRoot.getElementById('cmx-ws-float-frame')
    if (!(frame instanceof HTMLElement)) return
    frame.style.left = `${this._winRect.left}px`
    frame.style.top = `${this._winRect.top}px`
    frame.style.width = `${this._winRect.w}px`
    frame.style.height = `${this._winRect.h}px`
  }

  /** @param {PointerEvent} e */
  _onDragStartBall (e) {
    if (e.button !== 0) return
    /* 普通点击（无拖动）→ 打开窗口；拖动距离阈值在 pointermove 中判定 */
    const ball = this.shadowRoot.getElementById('cmx-ws-float-ball')
    if (!(ball instanceof HTMLElement)) return
    this._ensureBallPos()
    this._dragStart = startFloatDrag('ball', e, {
      left: this._ballPos.left,
      top: this._ballPos.top,
    })
    this._draggingKind = 'ball'
    this._dragMoved = false
    try { ball.setPointerCapture(e.pointerId) } catch { /* ignore */ }
    window.addEventListener('pointermove', this._onDragMove)
    window.addEventListener('pointerup', this._onDragEnd, { once: true })
    e.preventDefault()
  }

  /** @param {PointerEvent} e */
  _onDragStartTitle (e) {
    if (e.button !== 0) return
    const t = /** @type {Element|null} */ (e.target)
    if (t && t.closest('ui5-button')) return
    const title = this.shadowRoot.getElementById('cmx-ws-float-title')
    if (!(title instanceof HTMLElement)) return
    this._ensureWinRect()
    this._dragStart = startFloatDrag('title', e, {
      left: this._winRect.left,
      top: this._winRect.top,
    })
    this._draggingKind = 'title'
    title.classList.add('dragging')
    try { title.setPointerCapture(e.pointerId) } catch { /* ignore */ }
    window.addEventListener('pointermove', this._onDragMove)
    window.addEventListener('pointerup', this._onDragEnd, { once: true })
    e.preventDefault()
  }

  /** @param {PointerEvent} e */
  _onDragMove (e) {
    if (!this._dragStart) return
    const next = updateFloatDrag(this._dragStart, e, {
      width: window.innerWidth,
      height: window.innerHeight,
    }, {
      ballSize: BALL_SIZE,
      titleBarHeight: TITLE_BAR_HEIGHT,
    })
    if (!next) return
    this._dragMoved = !!next.moved
    if (this._draggingKind === 'ball') {
      this._ballPos = { left: next.left, top: next.top }
      const ball = this.shadowRoot.getElementById('cmx-ws-float-ball')
      if (ball instanceof HTMLElement) ball.classList.add('dragging')
      this._applyBallBounds()
    } else if (this._draggingKind === 'title') {
      this._winRect = { ...this._winRect, left: next.left, top: next.top }
      this._applyWindowBounds()
    }
  }

  _onDragEnd () {
    const result = finishFloatDrag(this._dragStart)
    if (this._draggingKind === 'ball') {
      const ball = this.shadowRoot.getElementById('cmx-ws-float-ball')
      if (ball instanceof HTMLElement) ball.classList.remove('dragging')
      if (result.clicked) {
        /* 视为点击：打开窗口 */
        this._setOpen(true)
      } else if (this._ballPos) {
        writeFloatBallPos(POS_STORAGE_KEY, this._ballPos)
      }
    } else if (this._draggingKind === 'title') {
      const title = this.shadowRoot.getElementById('cmx-ws-float-title')
      if (title instanceof HTMLElement) title.classList.remove('dragging')
      if (this._winRect) writeFloatWindowRect(WIN_STORAGE_KEY, this._winRect)
    }
    this._draggingKind = null
    this._dragStart = null
    this._dragMoved = false
    window.removeEventListener('pointermove', this._onDragMove)
  }
}

customElements.define('portal-workspace-float-window', PortalWorkspaceFloatWindow)
