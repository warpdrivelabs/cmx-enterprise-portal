import {
  PORTAL_TAB_OVERFLOW_STYLES,
  TAB_OVERFLOW_BTN_RESERVE,
  computeVisibleTabRange,
  hiddenTabIndices,
} from '../lib/tab-strip-overflow.js'
import {
  activateWorkspaceRegionViewByIndex,
  handleWorkspaceRegionTabBarClick,
  hydrateHtmlPagesWorkspaceViewsInRoot,
  normalizeWorkspaceRegionViews,
  renderWorkspaceRegionViewsHtml,
  safeUi5IconName,
  workspaceRegionOuterTabIcon,
  workspaceRegionOuterTabText,
} from '../lib/workspace-node.js'
import { DROP_TARGET_CLASS, wireWorkspacePanelDnd } from '../lib/workspace-dock-layout.js'
import { wireWorkspaceRegionTabContextMenu } from '../lib/workspace-region-tab-ctxmenu.js'
import { escAttr, escHtml } from '../lib/escape.js'
import { addConsoleSink } from '../lib/console-bridge.js'
import { PORTAL_NEO_DROP_TARGET, PORTAL_NEO_TAB_CHROME } from '../lib/portal-neo-theme.js'

const LOG_LEVELS = {
  info:    { icon: 'information', color: 'var(--sapLinkColor, #0070f2)', label: '信息' },
  warn:    { icon: 'warning',     color: 'var(--sapCriticalTextColor, #e9730c)', label: '警告' },
  error:   { icon: 'message-error', color: 'var(--sapNegativeTextColor, #bb0000)', label: '错误' },
  success: { icon: 'accept',      color: 'var(--sapPositiveTextColor, #107e3e)', label: '成功' },
  debug:   { icon: 'source-code', color: 'var(--sapContent_LabelColor, #6a6d70)', label: '调试' },
}

const MAX_LOG_ENTRIES = 1000
const MAX_PROBLEM_ENTRIES = 300

export class PortalLogPanel extends HTMLElement {
  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
    this._tabs = [
      { id: 'output',   text: '输出',        icon: 'log' },
      { id: 'problems', text: '问题',        icon: 'warning' },
      { id: 'terminal', text: '终端',        icon: 'command-line-interfaces' },
      { id: 'debug',    text: '调试控制台',   icon: 'source-code' },
    ]
    this._activeTab = 'output'
    this._logs = []
    this._problems = []
    this._autoScroll = true
    /** @type {import('../lib/workspace-node.js').WorkspaceRegionViewsInput|null} */
    this._workspaceBottomSpec = null
    /** @type {HTMLElement|null} 下一次 _renderTabs 时挂到 cmx_ws_bottom 面板的缓存根（由 Content 标签提供） */
    this._pendingBottomMountRoot = null
    /** @type {ResizeObserver|null} */
    this._logTabOverflowRo = null
    this._boundWorkspaceTabClick = (e) => handleWorkspaceRegionTabBarClick(e)
  }

  connectedCallback() {
    this._render()
    this._wireLogTabOverflowRoot()
    const row = this.shadowRoot.getElementById('log-tab-bar-row')
    if (row) {
      this._logTabOverflowRo = new ResizeObserver(() => this._layoutLogTabStripOverflow())
      this._logTabOverflowRo.observe(row)
    }
    queueMicrotask(() => this._layoutLogTabStripOverflow())
    this._addSampleLogs()
    this.shadowRoot.addEventListener('click', this._boundWorkspaceTabClick)
    this._unbindConsoleSink = addConsoleSink((entry) => {
      this.addLog(entry.message, entry.level, entry.source)
    })
    this._wireWorkspaceDnd()
    this._wireWorkspaceCtxMenu()
  }

  disconnectedCallback() {
    this.shadowRoot.removeEventListener('click', this._boundWorkspaceTabClick)
    this._logTabOverflowRo?.disconnect()
    this._logTabOverflowRo = null
    this._unbindConsoleSink?.()
    this._unbindConsoleSink = null
    this._dndUnwire?.()
    this._dndUnwire = null
    this._ctxMenuUnwire?.()
    this._ctxMenuUnwire = null
  }

  _wireWorkspaceDnd () {
    if (this._dndUnwire) return
    this._dndUnwire = wireWorkspacePanelDnd(
      this.shadowRoot,
      () => this.shadowRoot.querySelector('.tab-pane[data-id="cmx_ws_bottom"]'),
      'bottom',
      () => this._readActiveWsTabId(),
      () => /** @type {Record<string, unknown>|null} */ (this._workspaceBottomSpec),
      (detail) => {
        this.dispatchEvent(new CustomEvent('portal-workspace-view-dropped', {
          bubbles: true,
          composed: true,
          detail,
        }))
      },
    )
  }

  _wireWorkspaceCtxMenu () {
    if (this._ctxMenuUnwire) return
    this._ctxMenuUnwire = wireWorkspaceRegionTabContextMenu(
      this.shadowRoot,
      () => this.shadowRoot.querySelector('.tab-pane[data-id="cmx_ws_bottom"]'),
      'bottom',
      () => this._readActiveWsTabId(),
      () => /** @type {Record<string, unknown>|null} */ (this._workspaceBottomSpec),
      {
        getOuterTab: () => /** @type {HTMLElement|null} */ (
          this.shadowRoot.querySelector('.tab-btn[data-id="cmx_ws_bottom"]')
        ),
      },
    )
  }

  /** @returns {string} */
  _readActiveWsTabId () {
    const app = document.querySelector('cmx-portal-app')
    return (app instanceof HTMLElement && app.dataset?.cmxActiveWsTab) || ''
  }

  addLog(message, level = 'info', source = '') {
    const entry = {
      id: Date.now() + Math.random(),
      message,
      level,
      source,
      time: new Date().toLocaleTimeString()
    }
    this._logs.push(entry)
    if (this._logs.length > MAX_LOG_ENTRIES) {
      this._logs.splice(0, this._logs.length - MAX_LOG_ENTRIES)
      const container = this.shadowRoot.querySelector('.tab-pane[data-id="output"] #log-output')
        || this.shadowRoot.getElementById('log-output')
      if (container instanceof HTMLElement) {
        while (container.childElementCount > this._logs.length) {
          container.firstElementChild?.remove()
        }
      }
    }
    this._appendLogEntryDom(entry)
    if (this._activeTab !== 'output') this._showBadge('output')
  }

  addProblem(message, level = 'warn', file = '', line = '') {
    this._problems.push({ message, level, file, line })
    if (this._problems.length > MAX_PROBLEM_ENTRIES) {
      this._problems.splice(0, this._problems.length - MAX_PROBLEM_ENTRIES)
    }
    this._renderProblems()
    if (this._activeTab !== 'problems') this._showBadge('problems')
  }

  clearLogs() {
    this._logs = []
    const container = this.shadowRoot.querySelector('.tab-pane[data-id="output"] #log-output')
      || this.shadowRoot.getElementById('log-output')
    if (container) container.replaceChildren()
  }

  /**
   * @param {number} viewIndex
   */
  activateWorkspaceRegionView (viewIndex) {
    this._selectTab('cmx_ws_bottom')
    queueMicrotask(() => {
      const pane = this.shadowRoot.querySelector('.tab-pane[data-id="cmx_ws_bottom"]')
      if (pane) {
        activateWorkspaceRegionViewByIndex(pane, 'bottom', viewIndex)
      }
    })
  }

  /**
   * @param {import('../lib/workspace-node.js').WorkspaceRegionViewsInput|null} spec
   * @param {{ activateWorkspace?: boolean, mountRoot?: HTMLElement|null }} [options]
   * `mountRoot`：Content 标签缓存的根节点，切换时复用；不传则按 spec 渲染 HTML。
   */
  setWorkspaceBottom (spec, options = {}) {
    const mountRoot = options.mountRoot instanceof HTMLElement ? options.mountRoot : null
    const raw = spec != null && typeof spec === 'object' ? spec : null
    const views = normalizeWorkspaceRegionViews(raw)
    /* null/空 spec 清除路径：保留 cmx_ws_bottom pane 与缓存根 DOM，避免内部 CE disconnect 风暴；
       仅隐藏 cmx_ws_bottom 这颗 tab 按钮 + 把活跃签切回 output；
       外层 dock 由 portal-app-layout.applyLayout 的 _logVisible 通过 data-hidden 整体隐藏。
       _workspaceBottomSpec 故意保留旧值：下次切回同一工作区 tab 时 raw 引用相同 → 命中下方 specSame
       早返路径，整签条与缓存根 DOM 完全不动，零 detach。 */
    if (!raw || !views.length) {
      this._pendingBottomMountRoot = null
      const sr = this.shadowRoot
      const wsBtn = sr?.querySelector('.tab-btn[data-id="cmx_ws_bottom"]')
      const wsPane = sr?.querySelector('.tab-pane[data-id="cmx_ws_bottom"]')
      if (wsBtn instanceof HTMLElement) wsBtn.style.display = 'none'
      if (wsPane instanceof HTMLElement) wsPane.classList.remove('active')
      if (this._activeTab === 'cmx_ws_bottom') {
        this._activeTab = 'output'
        sr?.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.id === 'output'))
        sr?.querySelectorAll('.tab-pane').forEach(p => {
          if (p.dataset.id !== 'cmx_ws_bottom') p.classList.toggle('active', p.dataset.id === 'output')
        })
      }
      return
    }
    /* 早出：spec 引用未变 + （未传 mountRoot 或 mountRoot 已挂载到该 tab 面板）→ 跳过整签条重建，
       避免 drop/同标签重激活触发 output/problems/terminal/debug 一并重建造成的闪烁。 */
    if (raw === this._workspaceBottomSpec && !this._pendingBottomMountRoot) {
      const existingPane = this.shadowRoot?.querySelector('.tab-pane[data-id="cmx_ws_bottom"]')
      const sameMount = !mountRoot || (existingPane && mountRoot.parentElement === existingPane)
      if (sameMount) {
        /* 之前若走过 null-clear 隐藏了按钮，这里要恢复可见性。 */
        const wsBtn = this.shadowRoot?.querySelector('.tab-btn[data-id="cmx_ws_bottom"]')
        if (wsBtn instanceof HTMLElement) wsBtn.style.display = ''
        if (this._workspaceBottomSpec && options.activateWorkspace) {
          this._selectTab('cmx_ws_bottom')
        }
        return
      }
    }
    const prevBottom = this.shadowRoot?.querySelector('.tab-pane[data-id="cmx_ws_bottom"]')
    if (prevBottom) {
      while (prevBottom.firstChild) prevBottom.removeChild(prevBottom.firstChild)
    }
    this._tabs = this._tabs.filter((t) => t.id !== 'cmx_ws_bottom')
    this._workspaceBottomSpec = raw
    this._pendingBottomMountRoot = mountRoot
    this._tabs.push({
      id: 'cmx_ws_bottom',
      text: workspaceRegionOuterTabText(raw, '底部'),
      icon: workspaceRegionOuterTabIcon(raw, 'log'),
    })
    this._renderTabs()
    for (const entry of this._logs) {
      this._appendLogEntryDom(entry)
    }
    this._renderProblems()
    this._wireLogTabOverflowRoot()
    if (this._workspaceBottomSpec && options.activateWorkspace) {
      this._selectTab('cmx_ws_bottom')
    }
  }

  _addSampleLogs() {
    this.addLog('CMX Enterprise Portal 启动成功', 'success', 'System')
    this.addLog('正在加载 UI5 Web Components...', 'info', 'Loader')
    this.addLog('已连接到开发服务器 http://localhost:5173', 'info', 'DevServer')
    this.addProblem('发现未使用的变量 "temp"', 'warn', 'portal-app.js', '42')
  }

  _render() {
    // eslint-disable-next-line no-restricted-syntax -- shadow root 模板：内容为静态字面量，无外部输入
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow: hidden;
          background: var(--portal-panel-bg, var(--sapObjectHeader_Background, #fff));
          border-top: 1px solid var(--neo-border-subtle, var(--sapGroup_TitleBorderColor, #ddd));
          box-shadow: inset 0 1px 0 color-mix(in srgb, var(--neo-violet, #7c3aed) 6%, transparent);
        }
        ${PORTAL_NEO_TAB_CHROME}
        .panel-header {
          display: flex;
          flex-direction: row;
          align-items: stretch;
          border-bottom: 1px solid var(--neo-border-subtle, var(--sapGroup_TitleBorderColor, #ddd));
          flex-shrink: 0;
          background: var(--portal-tab-row-bg, var(--sapObjectHeader_Background, #fff));
          height: 35px;
          min-width: 0;
          backdrop-filter: blur(8px);
        }
        .log-tab-bar-row {
          --portal-tab-row-bg: var(--sapObjectHeader_Background, #fff);
          flex: 1 1 auto;
          min-width: 0;
          display: flex;
          flex-direction: row;
          align-items: stretch;
        }
        .log-tab-bar-strip {
          flex: 1 1 auto;
          min-width: 0;
          overflow: hidden;
          display: flex;
          align-items: stretch;
        }
        ${PORTAL_TAB_OVERFLOW_STYLES}
        .tab-btn {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 0 12px;
          cursor: pointer;
          font-size: 12px;
          color: var(--sapContent_LabelColor, #6a6d70);
          border: none;
          background: transparent;
          border-bottom: 2px solid transparent;
          outline: none;
          white-space: nowrap;
          position: relative;
          flex-shrink: 0;
        }
        .tab-btn:hover { color: var(--sapTextColor, #333); background: var(--sapHoverColor, #f5f5f5); }
        .tab-btn.active {
          color: var(--neo-cyan, var(--sapTextColor, #333));
          border-bottom-color: var(--neo-cyan, var(--sapHighlightColor, #0070f2));
        }
        .tab-btn ui5-icon { width: 13px; height: 13px; }
        .badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, var(--neo-cyan, #00b4d8), var(--neo-violet, var(--neo-violet, #7c3aed)));
          color: #fff;
          font-size: 10px;
          min-width: 16px;
          height: 16px;
          border-radius: 8px;
          padding: 0 4px;
        }
        .header-actions {
          flex: 0 0 auto;
          display: flex;
          align-items: center;
          padding: 0 4px;
          gap: 2px;
        }
        .panel-body {
          flex: 1 1 auto;
          overflow: hidden;
          min-height: 0;
          position: relative;
          display: flex;
          flex-direction: column;
        }
        .tab-pane {
          display: none;
          height: 100%;
          overflow-y: auto;
          overflow-x: hidden;
          scrollbar-width: thin;
        }
        .tab-pane.active {
          display: flex;
          flex-direction: column;
          min-height: 0;
          flex: 1 1 auto;
        }
        /* Bottom 工作区：外层不滚动，由内层 .cmx-ws-tab-pane 承担，避免与 log 签条双滚动条 */
        .tab-pane.active[data-id="cmx_ws_bottom"] {
          overflow: hidden;
        }
        .tab-pane[data-id="cmx_ws_bottom"] > .cmx-ws-tab-cache-root {
          flex: 1 1 auto;
          min-height: 0;
          min-width: 0;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          align-self: stretch;
        }
        .cmx-ws-tab-btn { cursor: grab; }
        .cmx-ws-tab-btn:active { cursor: grabbing; }
        .tab-pane[data-id="cmx_ws_bottom"].${DROP_TARGET_CLASS} {
          ${PORTAL_NEO_DROP_TARGET}
        }

        /* Log output */
        #log-output {
          padding: 4px 0;
          font-family: 'Consolas', 'Courier New', monospace;
          font-size: 12px;
        }
        .log-entry {
          display: flex;
          align-items: flex-start;
          gap: 6px;
          padding: 2px 12px;
          line-height: 1.5;
          transition: background 0.1s;
        }
        .log-entry:hover { background: var(--sapHoverColor, #f5f5f5); }
        .log-time { color: var(--sapContent_LabelColor, #999999); flex-shrink: 0; }
        .log-icon { flex-shrink: 0; width: 14px; height: 14px; margin-top: 2px; }
        .log-source { color: var(--sapContent_LabelColor, #888888); flex-shrink: 0; }
        .log-msg { flex: 1 1 auto; word-break: break-word; }

        /* Problems */
        #problems-list { padding: 4px 0; }
        .problem-entry {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 5px 12px;
          cursor: default;
          border-bottom: 1px solid var(--sapGroup_TitleBorderColor, #f0f0f0);
        }
        .problem-entry:hover { background: var(--sapHoverColor, #f5f5f5); }
        .problem-icon { width: 14px; height: 14px; flex-shrink: 0; }
        .problem-msg { flex: 1 1 auto; font-size: 12px; }
        .problem-loc { font-size: 11px; color: var(--sapContent_LabelColor, #888888); flex-shrink: 0; }

        /* Terminal placeholder */
        .terminal-placeholder {
          flex: 1 1 auto;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-direction: column;
          gap: 8px;
          color: var(--sapContent_LabelColor, #6a6d70);
        }
        .terminal-placeholder ui5-icon { width: 40px; height: 40px; }
      </style>
      <div class="panel-header" id="tab-bar">
        <div class="log-tab-bar-row" id="log-tab-bar-row">
          <div class="log-tab-bar-strip" id="log-tab-bar-strip"></div>
          <div class="portal-tab-overflow-wrap" id="log-tab-overflow-wrap" style="display:none">
            <button type="button" class="portal-tab-overflow-trigger" id="log-tab-overflow-btn" aria-label="更多" title="更多">
              <ui5-icon name="slim-arrow-down"></ui5-icon>
            </button>
          </div>
        </div>
        <ui5-menu id="log-tab-overflow-menu" horizontal-align="End"></ui5-menu>
        <div class="header-actions">
          <ui5-button icon="clear-all" design="Transparent" tooltip="清空日志" id="clear-btn"></ui5-button>
          <ui5-button icon="download" design="Transparent" tooltip="导出日志" id="export-btn"></ui5-button>
          <ui5-button icon="decline"  design="Transparent" tooltip="关闭面板"  id="close-btn"></ui5-button>
        </div>
      </div>
      <div class="panel-body" id="panel-body"></div>
    `
    this._renderTabs()
    this.shadowRoot.getElementById('clear-btn').addEventListener('click', () => this.clearLogs())
    this.shadowRoot.getElementById('close-btn').addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('panel-close', { bubbles: true, composed: true }))
    })
    this.shadowRoot.getElementById('export-btn').addEventListener('click', () => this._exportLogs())
  }

  _wireLogTabOverflowRoot () {
    const menu = this.shadowRoot.getElementById('log-tab-overflow-menu')
    const btn = this.shadowRoot.getElementById('log-tab-overflow-btn')
    if (menu && !menu.dataset.portalOverflowBound) {
      menu.dataset.portalOverflowBound = '1'
      menu.addEventListener('item-click', (e) => {
        const item = e.detail?.item
        const tid = item?.getAttribute?.('data-tab-id') || item?.dataset?.tabId
        if (!tid) return
        this._selectTab(tid)
        menu.open = false
        queueMicrotask(() => this._layoutLogTabStripOverflow())
      })
    }
    if (btn && !btn.dataset.portalOverflowBound) {
      btn.dataset.portalOverflowBound = '1'
      btn.addEventListener('click', () => {
        if (!menu) return
        menu.opener = btn
        menu.open = true
      })
    }
  }

  _layoutLogTabStripOverflow () {
    const row = this.shadowRoot.getElementById('log-tab-bar-row')
    const strip = this.shadowRoot.getElementById('log-tab-bar-strip')
    const wrap = this.shadowRoot.getElementById('log-tab-overflow-wrap')
    const btn = this.shadowRoot.getElementById('log-tab-overflow-btn')
    const menu = this.shadowRoot.getElementById('log-tab-overflow-menu')
    if (!row || !strip || !wrap || !btn || !menu) return
    const items = [...strip.querySelectorAll('.tab-btn')]
    if (!items.length) {
      wrap.style.display = 'none'
      return
    }
    items.forEach((el) => {
      el.style.display = 'flex'
      el.style.flexShrink = '0'
    })
    const widths = items.map((el) => el.getBoundingClientRect().width)
    const ai = this._tabs.findIndex(t => t.id === this._activeTab)
    const activeIdx = ai >= 0 ? ai : 0
    const { start, end, needsOverflow } = computeVisibleTabRange(
      widths,
      activeIdx,
      row.clientWidth,
      TAB_OVERFLOW_BTN_RESERVE
    )
    for (let i = 0; i < items.length; i++) {
      items[i].style.display = i >= start && i < end ? 'flex' : 'none'
    }
    wrap.style.display = needsOverflow ? '' : 'none'
    while (menu.firstChild) menu.removeChild(menu.firstChild)
    if (needsOverflow) {
      for (const i of hiddenTabIndices(this._tabs.length, start, end)) {
        const tab = this._tabs[i]
        if (!tab) continue
        const mi = document.createElement('ui5-menu-item')
        mi.setAttribute('text', tab.text)
        mi.setAttribute('icon', safeUi5IconName(tab.icon))
        mi.setAttribute('data-tab-id', tab.id)
        menu.appendChild(mi)
      }
    }
  }

  _renderTabs() {
    const strip = this.shadowRoot.getElementById('log-tab-bar-strip')
    const body = this.shadowRoot.getElementById('panel-body')
    if (!strip || !body) return
    strip.replaceChildren()
    body.replaceChildren()

    for (const tab of this._tabs) {
      const btn = document.createElement('button')
      btn.className = 'tab-btn' + (tab.id === this._activeTab ? ' active' : '')
      btn.dataset.id = tab.id
      // eslint-disable-next-line no-restricted-syntax -- icon 经 safeUi5IconName 白名单，text 经 escHtml
      btn.innerHTML = `<ui5-icon name="${safeUi5IconName(tab.icon)}"></ui5-icon>${escHtml(tab.text)}`
      btn.addEventListener('click', () => this._selectTab(tab.id))
      strip.appendChild(btn)

      const pane = document.createElement('div')
      pane.className = 'tab-pane' + (tab.id === this._activeTab ? ' active' : '')
      pane.dataset.id = tab.id
      if (tab.id === 'cmx_ws_bottom' && this._pendingBottomMountRoot) {
        const mr = this._pendingBottomMountRoot
        pane.appendChild(mr)
        this._pendingBottomMountRoot = null
        queueMicrotask(() => {
          hydrateHtmlPagesWorkspaceViewsInRoot(mr)
        })
      } else {
        // eslint-disable-next-line no-restricted-syntax -- _getPaneContent 返回静态/已 escHtml 转义的模板
        pane.innerHTML = this._getPaneContent(tab.id)
      }
      body.appendChild(pane)
    }
    hydrateHtmlPagesWorkspaceViewsInRoot(this.shadowRoot)
    queueMicrotask(() => this._layoutLogTabStripOverflow())
  }

  _getPaneContent(id) {
    if (id === 'output') return `<div id="log-output"></div>`
    if (id === 'problems') return `<div id="problems-list"></div>`
    if (id === 'terminal') return `
      <div class="terminal-placeholder">
        <ui5-icon name="command-line-interfaces"></ui5-icon>
        <span>终端功能即将上线</span>
      </div>
    `
    if (id === 'debug') return `<div id="log-output" style="color:var(--sapContent_LabelColor, #888888)"></div>`
    if (id === 'cmx_ws_bottom') {
      return renderWorkspaceRegionViewsHtml('bottom', this._workspaceBottomSpec)
    }
    return ''
  }

  _selectTab(id) {
    this._activeTab = id
    this.shadowRoot.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.id === id))
    this.shadowRoot.querySelectorAll('.tab-pane').forEach(p => p.classList.toggle('active', p.dataset.id === id))
    const badge = this.shadowRoot.querySelector(`.tab-btn[data-id="${id}"] .badge`)
    if (badge) badge.remove()
    queueMicrotask(() => this._layoutLogTabStripOverflow())
  }

  _showBadge(tabId) {
    const btn = this.shadowRoot.querySelector(`.tab-btn[data-id="${tabId}"]`)
    if (btn && !btn.querySelector('.badge')) {
      const badge = document.createElement('span')
      badge.className = 'badge'
      badge.textContent = '●'
      btn.appendChild(badge)
    }
  }

  _appendLogEntryDom (entry) {
    const container = this.shadowRoot.querySelector('.tab-pane[data-id="output"] #log-output')
      || this.shadowRoot.getElementById('log-output')
    if (!container) return
    const cfg = LOG_LEVELS[entry.level] || LOG_LEVELS.info
    const el = document.createElement('div')
    el.className = 'log-entry'
    // eslint-disable-next-line no-restricted-syntax -- 所有动态片段已用 escAttr/escHtml 转义；cfg 来自 LOG_LEVELS 字面量表
    el.innerHTML = `
      <span class="log-time">${escHtml(entry.time)}</span>
      <ui5-icon class="log-icon" name="${escAttr(cfg.icon)}" style="color:${escAttr(cfg.color)}"></ui5-icon>
      ${entry.source ? `<span class="log-source">[${escHtml(entry.source)}]</span>` : ''}
      <span class="log-msg">${escHtml(entry.message)}</span>
    `
    container.appendChild(el)
    if (this._autoScroll) container.scrollTop = container.scrollHeight
  }

  _renderProblems() {
    const container = this.shadowRoot.getElementById('problems-list')
    if (!container) return
    container.replaceChildren()
    for (const p of this._problems) {
      const cfg = LOG_LEVELS[p.level] || LOG_LEVELS.warn
      const el = document.createElement('div')
      el.className = 'problem-entry'
      // eslint-disable-next-line no-restricted-syntax -- 所有动态片段已转义
      el.innerHTML = `
        <ui5-icon class="problem-icon" name="${escAttr(cfg.icon)}" style="color:${escAttr(cfg.color)}"></ui5-icon>
        <span class="problem-msg">${escHtml(p.message)}</span>
        ${p.file ? `<span class="problem-loc">${escHtml(p.file)}${p.line ? ':' + escHtml(p.line) : ''}</span>` : ''}
      `
      container.appendChild(el)
    }
  }

  _exportLogs() {
    const text = this._logs.map(l => `[${l.time}] [${l.level.toUpperCase()}] ${l.source ? '[' + l.source + '] ' : ''}${l.message}`).join('\n')
    const blob = new Blob([text], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `portal-log-${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(a.href)
  }
}

customElements.define('portal-log-panel', PortalLogPanel)
