/**
 * @keenmate/web-treeview 封装组件（<cmx-web-treeview>），集成 CmxDataSet + CmxColumnModel 的树形视图。
 *
 * 封装模式与 CmxRevoGrid 一致：
 *   - connectedCallback 里同步 attachShadow + 创建内部组件，用 this.shadowRoot 守卫防重复
 *   - 内部 web-treeview 在 Shadow DOM 里，设计器 querySelectorAll('*') 扫不到
 *
 * 数据转换规则：
 *   - display-value-member 字段：model.getTitleColIds() 对应字段值空格拼接
 *   - icon（ui5-icon）：model.iconCol 字段值，通过 renderNodeCallback 渲染为 <ui5-icon>
 *   - 无 model 时 display-value-member 属性指向的字段直接使用
 *
 * 主题：
 *   web-treeview 使用 Shadow DOM，CSS 变量可从外部 _inner.style.setProperty 穿透注入。
 *   检测逻辑与 CmxRevoGrid 一致：connectedCallback 延一帧读 --sapBackgroundColor，
 *   暗色时覆盖 --tv-* 变量；门户切换主题时监听 cmx-portal-theme-change 重新 apply。
 *
 * @component
 *
 * 内部 web-treeview 事件转发至外部（bubbles + composed）：
 *
 * @fires node-clicked           - detail:{ node } 节点点击时转发（同时同步 CmxDataSet 当前行）
 * @fires node-drop              - 节点拖拽放置时转发
 * @fires selected-node-changed  - 选中节点变化时转发
 * @fires tree-changed           - 树结构变化时转发
 *
 * 关键属性（透传至内部 web-treeview）：
 *   id-member / path-member / parent-path-member / display-value-member / icon-member / badge-member
 *   expand-level / tree-path-separator / should-toggle-on-node-click / is-sorted
 *   drag-drop-mode / virtual-scroll / use-flat-rendering 等
 *   data-cmx-skin / data-cmx-accent-color / data-cmx-tree-lines / data-cmx-sync-current-row
 *
 * Cmx 集成命令式 API（在原生 web-treeview 基础上新增）：
 *   setDataSet(ds)        绑定 CmxDataSet，rows 变更时自动刷新树
 *   setColumnModel(model) 绑定 CmxColumnModel，控制显示字段与图标字段
 */

import { setCategoryLevel } from '@keenmate/web-treeview'
import { detectDarkMode } from '../lib/cmx-theme-detect.js'

setCategoryLevel?.('TREEVIEW:INIT', 'silent')

const OBSERVED_ATTRS = [
  'tree-id',
  'id-member',
  'path-member',
  'parent-path-member',
  'level-member',
  'is-expanded-member',
  'is-selected-member',
  'is-draggable-member',
  'is-drop-allowed-member',
  'has-children-member',
  'children-loading-member',
  'display-value-member',
  'search-value-member',
  'is-selectable-member',
  'is-collapsible-member',
  'order-member',
  'allowed-drop-positions-member',
  'expand-level',
  'tree-path-separator',
  'should-toggle-on-node-click',
  'is-sorted',
  'should-use-internal-search-index',
  'indexer-batch-size',
  'indexer-timeout',
  'body-class',
  'selected-node-class',
  'drag-over-node-class',
  'expand-icon-class',
  'collapse-icon-class',
  'leaf-icon-class',
  'toggle-icon-mode',
  'scroll-highlight-timeout',
  'scroll-highlight-class',
  'search-text',
  'context-menu-x-offset',
  'context-menu-y-offset',
  'should-display-debug-information',
  'is-loading',
  'drag-drop-mode',
  'drop-zone-mode',
  'drop-zone-layout',
  'drop-zone-start',
  'drop-zone-max-width',
  'allow-copy',
  'auto-handle-copy',
  'use-flat-rendering',
  'flat-indent-size',
  'progressive-render',
  'initial-batch-size',
  'max-batch-size',
  'virtual-scroll',
  'virtual-row-height',
  'virtual-overscan',
  'virtual-container-height',
  'icon-member',
  'align-node-icons',
  'badge-member',
  'data-cmx-skin',
  'data-cmx-accent-color',
  'data-cmx-tree-lines',
  'data-cmx-sync-current-row',
]

/** cmx-web-treeview 自有属性集合：不透传给内部 web-treeview，由本组件自行消费 */
const CMX_OWN_ATTRS = new Set([
  'badge-member',
  'data-cmx-skin',
  'data-cmx-accent-color',
  'data-cmx-tree-lines',
  'data-cmx-sync-current-row',
])

/** 需要从内部 web-treeview 转发到外部的 DOM 事件名列表（转发时带 bubbles + composed） */
const FORWARDED_EVENTS = [
  'node-clicked',
  'node-drop',
  'selected-node-changed',
  'tree-changed',
]

export class CmxWebTreeview extends HTMLElement {
  /** 返回需要监听的 attribute 列表（驱动 attributeChangedCallback） */
  static get observedAttributes () {
    return OBSERVED_ATTRS
  }

  constructor () {
    super()
    /** @type {HTMLElement|null} 内部 web-treeview 实例 */
    this._inner = null
    /** @type {Array<{name:string, handler:Function}>} 已绑定的事件清理记录（用于 disconnect 时解绑） */
    this._eventCleanup = []
    /** @type {import('../lib/cmx-data-set.js').CmxDataSet|null} 绑定的数据集，rows 变更时自动刷新树 */
    this._ds = null
    /** @type {import('../lib/cmx-column-model.js').CmxColumnModel|null} 绑定的列模型，控制显示字段与图标字段 */
    this._columnModel = null
    /** @type {{added:Function, removed:Function, changed:Function}|null} CmxDataSet 监听器句柄 */
    this._dsListeners = null
    /** @type {Function|null} 门户主题切换事件回调句柄 */
    this._onPortalThemeChange = null
  }

  // ── 生命周期 ──────────────────────────────────────────────────────────────

  /**
   * 挂载时初始化 Shadow DOM、内部 web-treeview、事件绑定与主题。
   * 支持 reconnect（Shadow DOM 已存在时仅恢复引用，不重复创建）。
   */
  connectedCallback () {
    if (this.shadowRoot) {
      // reconnect（如标签页切换后重新挂载）：Shadow DOM 已存在，恢复 _inner 引用和事件绑定
      if (!this._inner) {
        this._inner = this.shadowRoot.querySelector('web-treeview')
        if (this._inner) {
          this._bindEvents()
          if (this._ds && !this._dsListeners) this._bindDsListeners()
          if (this._ds) this._syncToInner()
        }
      }
      if (!this._onPortalThemeChange) {
        this._onPortalThemeChange = () => { if (this._inner) this._applyTheme() }
        window.addEventListener('cmx-portal-theme-change', this._onPortalThemeChange)
        requestAnimationFrame(() => { if (this._inner) this._applyTheme() })
      }
      this._applyDefaultToggleIcons()
      this._installTreeLineStyle()
      this._installSkinStyle()
      return
    }

    // 首次连接：创建 Shadow DOM 并构造内部 web-treeview
    this.attachShadow({ mode: 'open' })

    this._inner = document.createElement('web-treeview')
    this._inner.style.cssText = 'display:block;width:100%;height:100%;'

    // 同步 HTML attributes 到内部组件
    for (const attr of OBSERVED_ATTRS) {
      if (!CMX_OWN_ATTRS.has(attr) && this.hasAttribute(attr)) {
        this._inner.setAttribute(attr, this.getAttribute(attr))
      }
    }
    this._applyDefaultToggleIcons()

    // 图标渲染：web-treeview 的 iconCallback 只能返回 CSS class 字符串，
    // 渲染 DOM 节点（<ui5-icon>）必须用 renderNodeCallback
    this._inner.renderNodeCallback = (node, contentEl) => {
      contentEl.innerHTML = ''
      contentEl.style.cssText = [
        'display:flex',
        'align-items:center',
        'width:100%',
        'min-width:0',
        'box-sizing:border-box',
      ].join(';')
      this._applySelectionState(node, contentEl)
      const iconField = this._columnModel?.iconCol || this.getAttribute('icon-member') || 'icon'
      const iconName = node?.data?.[iconField]
      if (iconName) {
        const ic = document.createElement('ui5-icon')
        ic.setAttribute('name', String(iconName))
        ic.style.cssText = 'width:1rem;height:1rem;flex-shrink:0;margin-right:6px;vertical-align:middle;'
        contentEl.appendChild(ic)
      }
      const label = document.createElement('span')
      label.className = 'ltree-node-label'
      label.style.cssText = 'flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;'
      const displayMember = this.getAttribute('display-value-member') || 'displayValue'
      label.textContent = node?.data?.[displayMember] ?? String(node?.id ?? '')
      contentEl.appendChild(label)

      // 角标：badge-member 属性指定字段名，值 > 0 时以蓝色气泡显示在右侧
      const badgeMember = this.getAttribute('badge-member')
      if (badgeMember) {
        const badgeVal = node?.data?.[badgeMember]
        const n = Number(badgeVal)
        if (n > 0) {
          const badge = document.createElement('span')
          badge.textContent = String(n > 99 ? '99+' : n)
          badge.style.cssText = [
            'flex-shrink:0',
            'margin-left:6px',
            'min-width:1.25rem',
            'height:1.25rem',
            'padding:0 0.35rem',
            'border-radius:0.625rem',
            'background:var(--sapHighlightColor,#0070f2)',
            'color: #fff',
            'font-size:0.7rem',
            'font-weight:600',
            'line-height:1.25rem',
            'text-align:center',
            'white-space:nowrap',
            'box-sizing:border-box',
            'display:inline-flex',
            'align-items:center',
            'justify-content:center',
          ].join(';')
          contentEl.appendChild(badge)
        }
      }
      this._applyLoadingToggle(node, contentEl)
    }

    this.shadowRoot.appendChild(this._inner)
    this._installTreeLineStyle()
    this._installSkinStyle()
    this._bindEvents()

    // 主题：与 cmx-revo-grid 相同的方式，延一帧等 UI5 adoptedStyleSheets 生效后检测
    requestAnimationFrame(() => { if (this._inner) this._applyTheme() })
    this._onPortalThemeChange = () => { if (this._inner) this._applyTheme() }
    window.addEventListener('cmx-portal-theme-change', this._onPortalThemeChange)

    // 若已提前调用 setDataSet，立即同步数据
    if (this._ds) this._syncToInner()
  }

  /** 卸载时解绑数据集监听、事件转发、主题监听，并清空内部引用 */
  disconnectedCallback () {
    this._unbindDsListeners()
    this._unbindEvents()
    if (this._onPortalThemeChange) {
      window.removeEventListener('cmx-portal-theme-change', this._onPortalThemeChange)
      this._onPortalThemeChange = null
    }
    this._inner = null
  }

  /**
   * attribute 变化回调：CMX 自有属性本地消费，其余透传给内部 web-treeview。
   * @param {string} name 变化的属性名
   * @param {string|null} oldVal 旧值
   * @param {string|null} newVal 新值
   */
  attributeChangedCallback (name, oldVal, newVal) {
    if (oldVal === newVal || !this._inner) return
    // cmx-web-treeview 自有属性，不透传给内部 web-treeview
    if (CMX_OWN_ATTRS.has(name)) {
      if (name === 'data-cmx-skin' || name === 'data-cmx-accent-color' || name === 'data-cmx-tree-lines') {
        this._installTreeLineStyle()
        this._installSkinStyle()
      }
      this._syncToInner()
      return
    }
    if (newVal === null) {
      this._inner.removeAttribute(name)
    } else {
      this._inner.setAttribute(name, newVal)
    }
    if (name === 'expand-icon-class' || name === 'collapse-icon-class') this._applyDefaultToggleIcons()
  }

  // ── 属性代理 ──────────────────────────────────────────────────────────────

  /** @type {Array} 树数据（透传至内部 web-treeview.data） */
  get data ()  { return this._inner?.data }
  set data (v) { if (this._inner) this._inner.data = v }

  /** @type {boolean} 加载态（透传至内部 web-treeview.isLoading） */
  get isLoading ()  { return this._inner?.isLoading }
  set isLoading (v) { if (this._inner) this._inner.isLoading = v }

  /** @type {string} 搜索文本（透传至内部 web-treeview.searchText） */
  get searchText ()  { return this._inner?.searchText }
  set searchText (v) { if (this._inner) this._inner.searchText = v }

  /** @type {Function} 自定义节点渲染回调（透传至内部 web-treeview.renderNodeCallback） */
  get renderNodeCallback ()  { return this._inner?.renderNodeCallback }
  set renderNodeCallback (v) { if (this._inner) this._inner.renderNodeCallback = v }

  // ── 方法代理 ──────────────────────────────────────────────────────────────

  /**
   * 展开全部节点。
   * @param {object} [opts] 展开选项（透传给内部 web-treeview）
   */
  expandAll (opts)        { this._inner?.expandAll(opts) }
  /**
   * 折叠全部节点。
   * @param {object} [opts] 折叠选项（透传给内部 web-treeview）
   */
  collapseAll (opts)      { this._inner?.collapseAll(opts) }
  /**
   * 展开指定路径集合的节点。
   * @param {Array<string>} paths 节点路径数组
   */
  expandNodes (paths)     { this._inner?.expandNodes(paths) }
  /**
   * 折叠指定路径集合的节点。
   * @param {Array<string>} paths 节点路径数组
   */
  collapseNodes (paths)   { this._inner?.collapseNodes(paths) }
  /**
   * 按文本过滤节点。
   * @param {string} text 过滤关键字
   */
  filterNodes (text)      { this._inner?.filterNodes(text) }
  /**
   * 滚动到指定路径的节点。
   * @param {string} path 目标节点路径
   * @param {object} [opts] 滚动选项
   * @returns {Promise<boolean>} 是否滚动成功
   */
  scrollToPath (path, opts) { return this._inner?.scrollToPath(path, opts) ?? Promise.resolve(false) }
  /**
   * 根据路径获取节点对象。
   * @param {string} path 节点路径
   * @returns {object|null} 节点对象，无匹配时返回 null
   */
  getNodeByPath (path)    { return this._inner?.getNodeByPath(path) ?? null }
  /**
   * 获取当前已展开的路径集合。
   * @returns {Array<string>} 展开路径数组
   */
  getExpandedPaths ()     { return this._inner?.getExpandedPaths?.() ?? [] }
  /**
   * 设置展开路径集合。
   * @param {Array<string>} paths 需要展开的路径数组
   */
  setExpandedPaths (paths) { this._inner?.setExpandedPaths?.(paths) }
  /**
   * 用配置对象增量更新内部 web-treeview。
   * @param {object} config 配置项
   */
  update (config)         { this._inner?.update(config) }
  /**
   * 获取内部树结构对象。
   * @returns {object|undefined} 树结构
   */
  getTree ()              { return this._inner?.getTree() }

  // ── CmxDataSet / CmxColumnModel 集成 ─────────────────────────────────────

  /**
   * 绑定 CmxDataSet，切换时自动解绑旧监听。
   * @param {import('../lib/cmx-data-set.js').CmxDataSet|null} ds
   */
  setDataSet (ds) {
    this._unbindDsListeners()
    this._ds = ds || null
    if (this._ds) this._bindDsListeners()
    this._syncToInner()
  }

  /**
   * 绑定 CmxColumnModel，控制 displayValue 与图标字段。
   * @param {import('../lib/cmx-column-model.js').CmxColumnModel|null} model
   */
  setColumnModel (model) {
    this._columnModel = model || null
    this._syncToInner()
  }

  // ── 内部：数据同步 ────────────────────────────────────────────────────────

  /**
   * 将 CmxDataSet.rows 转换为 web-treeview 节点并刷新内部树。
   * 保留当前展开路径，刷新后归一化已渲染节点的选中态。
   */
  _syncToInner () {
    if (!this._inner) return
    const expandedPaths = this._captureExpandedPaths()
    const rows = this._ds?.rows || []
    this._inner.data = rows.map((row) => this._toNode(row))
    this._restoreExpandedPaths(expandedPaths)
    this._normalizeRenderedSelection()
  }

  /** 捕获内部 web-treeview 当前展开路径（用于刷新后恢复），无值时返回 null */
  _captureExpandedPaths () {
    if (!this._inner || typeof this._inner.getExpandedPaths !== 'function') return null
    try {
      const paths = this._inner.getExpandedPaths()
      return Array.isArray(paths) && paths.length ? paths : null
    } catch (_) {
      return null
    }
  }

  /** 在下一帧恢复之前捕获的展开路径（等内部 DOM 渲染完成后再调用 setExpandedPaths） */
  _restoreExpandedPaths (paths) {
    if (!paths || !this._inner || typeof this._inner.setExpandedPaths !== 'function') return
    requestAnimationFrame(() => {
      try { this._inner?.setExpandedPaths(paths) } catch (_) {}
    })
  }

  /**
   * 将一行数据转换为 web-treeview 节点对象。
   * displayValue 由 model.getTitleColIds() 拼接写入 display-value-member 字段。
   * @param {object} row CmxDataSet 行对象（支持 toPlainObject）
   * @returns {object} web-treeview 节点数据
   */
  _toNode (row) {
    const plain = typeof row.toPlainObject === 'function' ? row.toPlainObject() : { ...row }
    delete plain._children

    if (this._columnModel) {
      // 标题字段：取列模型标题列 id，空格拼接写入 display 成员字段
      const titleIds = this._columnModel.getTitleColIds()
      if (titleIds.length) {
        const displayMember = this._inner?.displayValueMember || 'displayValue'
        plain[displayMember] = titleIds.map((k) => plain[k] ?? '').filter(Boolean).join(' ')
      }
      // 图标字段：列模型 iconCol 不为 'icon' 时映射到标准 icon 字段
      if (this._columnModel.iconCol && this._columnModel.iconCol !== 'icon') {
        plain['icon'] = plain[this._columnModel.iconCol] ?? ''
      }
    }

    return plain
  }

  /**
   * 判断节点是否处于选中态（读取 is-selected-member 指定字段的布尔语义值）。
   * @param {object} node web-treeview 节点
   * @returns {boolean}
   */
  _isNodeSelected (node) {
    const member = this.getAttribute('is-selected-member')
    if (!member) return false
    const value = node?.data?.[member]
    return value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true'
  }

  /**
   * 将节点选中态应用到渲染容器元素（背景、圆角、行级 class 与 aria-selected）。
   * @param {object} node web-treeview 节点
   * @param {HTMLElement} contentEl 节点内容容器
   */
  _applySelectionState (node, contentEl) {
    if (!contentEl) return
    const selected = this._isNodeSelected(node)
    contentEl.dataset.cmxTreeSelected = selected ? '1' : '0'
    contentEl.style.background = selected
      ? 'var(--tv-selected-bg,var(--sapList_SelectionBackgroundColor,#e5f2fd))'
      : ''
    contentEl.style.borderRadius = selected ? '3px' : ''

    const applyRowState = () => {
      const rowEl = contentEl.closest?.('.ltree-node-row')
      if (!rowEl) return
      rowEl.classList.toggle('cmx-tree-node-selected', selected)
      if (!selected) {
        const selectedClass = this.getAttribute('selected-node-class') || ''
        selectedClass.split(/\s+/).filter(Boolean).forEach((className) => rowEl.classList.remove(className))
        rowEl.removeAttribute('aria-selected')
      } else {
        rowEl.setAttribute('aria-selected', 'true')
      }
    }
    applyRowState()
    requestAnimationFrame(applyRowState)
  }

  /** 在下一帧归一化已渲染行的选中态 class 与 aria-selected（同步 selected-node-class 与 data-cmx-tree-selected） */
  _normalizeRenderedSelection () {
    if (!this._inner) return
    const apply = () => {
      const root = this._inner?.shadowRoot || this._inner
      if (!root?.querySelectorAll) return
      const selectedClass = this.getAttribute('selected-node-class') || ''
      const extraClasses = selectedClass.split(/\s+/).filter(Boolean)
      root.querySelectorAll('.ltree-node-row').forEach((rowEl) => {
        const selectedContent = rowEl.querySelector?.('[data-cmx-tree-selected="1"]')
        const selected = !!selectedContent
        rowEl.classList.toggle('cmx-tree-node-selected', selected)
        if (selected) {
          rowEl.setAttribute('aria-selected', 'true')
        } else {
          extraClasses.forEach((className) => rowEl.classList.remove(className))
          rowEl.removeAttribute('aria-selected')
        }
      })
    }
    requestAnimationFrame(apply)
  }

  /**
   * 判断节点的子节点是否处于加载中（读取 children-loading-member 指定字段）。
   * @param {object} node web-treeview 节点
   * @returns {boolean}
   */
  _isChildrenLoading (node) {
    const member = this.getAttribute('children-loading-member')
    if (!member) return false
    const value = node?.data?.[member]
    return value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true'
  }

  /**
   * 给展开/折叠图标叠加加载旋转动画（子节点异步加载场景）。
   * @param {object} node web-treeview 节点
   * @param {HTMLElement} contentEl 节点内容容器
   */
  _applyLoadingToggle (node, contentEl) {
    const apply = () => {
      const rowEl = contentEl?.closest?.('.ltree-node-row')
      const toggleEl = rowEl?.querySelector?.('.ltree-toggle-icon')
      if (!toggleEl) return
      toggleEl.classList.remove('cmx-tree-toggle-loading')
      toggleEl.querySelector?.('.cmx-tree-toggle-spinner')?.remove()
      if (!this._isChildrenLoading(node)) return
      toggleEl.classList.add('cmx-tree-toggle-loading')
      toggleEl.classList.remove('ltree-icon-expand', 'ltree-icon-collapse', 'expanded')
      toggleEl.textContent = ''
      const spinner = document.createElement('span')
      spinner.className = 'cmx-tree-toggle-spinner'
      spinner.style.cssText = [
        'width:0.78rem',
        'height:0.78rem',
        'box-sizing:border-box',
        'border:2px solid color-mix(in srgb,var(--tv-toggle-color,#6a6d70) 35%,transparent)',
        'border-top-color:var(--tv-accent-color,var(--sapHighlightColor,#0070f2))',
        'border-radius:50%',
        'animation:ltree-spin .8s linear infinite',
      ].join(';')
      toggleEl.appendChild(spinner)
    }
    apply()
    requestAnimationFrame(apply)
  }

  /** 未自定义展开/折叠图标时，设置默认的 +/- 图标 class */
  _applyDefaultToggleIcons () {
    if (!this._inner) return
    if (!this.hasAttribute('expand-icon-class')) {
      this._inner.setAttribute('expand-icon-class', 'ltree-icon-expand-plus')
    }
    if (!this.hasAttribute('collapse-icon-class')) {
      this._inner.setAttribute('collapse-icon-class', 'ltree-icon-collapse-minus')
    }
  }

  /** 注入经典树形连接线样式（+/- 方框图标 + 可选关闭连接线），支持 data-cmx-tree-lines=false */
  _installTreeLineStyle () {
    const install = () => {
      const root = this._inner?.shadowRoot
      if (!root || root.getElementById('cmx-treeview-classic-lines')) return
      const style = document.createElement('style')
      style.id = 'cmx-treeview-classic-lines'
      style.textContent = `
        :host {
          --cmx-tree-line-color: color-mix(in srgb, var(--tv-border-color,#d9e1ec) 82%, var(--tv-text-color-2,#6a6d70));
        }
        :host([data-cmx-tree-lines="false"]) .ltree-node::before,
        :host([data-cmx-tree-lines="false"]) .ltree-node::after {
          display: none !important;
        }
        .ltree-node .ltree-toggle-icon {
          position: relative;
          z-index: 1;
          transform: none !important;
          color: var(--tv-toggle-color,#6a6d70);
        }
        .ltree-node .ltree-toggle-icon.ltree-icon-expand-plus::before,
        .ltree-node .ltree-toggle-icon.ltree-icon-collapse-minus::before {
          width: calc(var(--tv-rem,10px) * 1.25);
          height: calc(var(--tv-rem,10px) * 1.25);
          box-sizing: border-box;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--cmx-tree-line-color);
          border-radius: 2px;
          background: var(--tv-bg-color,#fff);
          color: var(--tv-text-color-2,#6a6d70);
          font-size: calc(var(--tv-rem,10px) * 1.05);
          font-weight: 700;
          line-height: 1;
        }
        .ltree-node .ltree-toggle-icon.cmx-tree-toggle-loading::before {
          content: none !important;
        }
      `
      root.appendChild(style)
    }
    install()
    requestAnimationFrame(install)
  }

  _installSkinStyle () {
    const install = () => {
      const root = this._inner?.shadowRoot
      if (!root) return
      let style = root.getElementById('cmx-treeview-skin')
      if (!style) {
        style = document.createElement('style')
        style.id = 'cmx-treeview-skin'
        root.appendChild(style)
      }
      const skin = (this.getAttribute('data-cmx-skin') || '').trim().toLowerCase()
      const accent = this.getAttribute('data-cmx-accent-color') || 'var(--sapHighlightColor,#0070f2)'
      const noLines = String(this.getAttribute('data-cmx-tree-lines') || '').toLowerCase() === 'false'
      style.textContent = `
        :host{--tv-accent-color:${accent};--tv-accent-color-hover:${accent};}
        ${skin === 'colored' ? `
        .ltree-node-row{border-radius:5px;margin:1px 6px 1px 4px;transition:background .18s ease,box-shadow .18s ease,transform .18s ease;}
        .ltree-node-row:hover{background:color-mix(in srgb,var(--tv-accent-color) 7%,transparent)!important;transform:translateX(2px);}
        .ltree-node-row.cmx-tree-node-selected,.ltree-node-row.acctws-tree-selected{background:linear-gradient(90deg,color-mix(in srgb,var(--tv-accent-color) 14%,transparent),color-mix(in srgb,var(--tv-accent-color) 7%,transparent))!important;box-shadow:inset 3px 0 0 var(--tv-accent-color),0 2px 10px color-mix(in srgb,var(--tv-accent-color) 10%,transparent);}
        .ltree-node-row.cmx-tree-node-selected .ltree-node-label,.ltree-node-row.acctws-tree-selected .ltree-node-label{font-weight:700;color:color-mix(in srgb,var(--tv-accent-color) 85%,var(--tv-text-color,#223548));}
        .ltree-node-label{font-size:.82rem;transition:color .15s ease,font-weight .15s ease;}
        .ltree-node-row ui5-icon{transition:transform .2s ease,filter .2s ease,color .15s ease;color:color-mix(in srgb,var(--tv-accent-color) 70%,var(--tv-text-color-2,#6a6d70));}
        .ltree-node-row:hover ui5-icon{transform:scale(1.1);filter:drop-shadow(0 0 5px color-mix(in srgb,var(--tv-accent-color) 45%,transparent));}
        ` : ''}
        ${noLines ? '.ltree-node::before,.ltree-node::after{display:none!important;}' : ''}
      `
    }
    install()
    requestAnimationFrame(install)
  }

  /** 绑定 CmxDataSet 的行增删改监听（任一变化都触发整树刷新） */
  _bindDsListeners () {
    if (!this._ds) return
    const sync = () => this._syncToInner()
    this._dsListeners = { added: sync, removed: sync, changed: sync }
    this._ds.addEventListener('ds-row-added',   this._dsListeners.added)
    this._ds.addEventListener('ds-row-removed', this._dsListeners.removed)
    this._ds.addEventListener('row-changed',    this._dsListeners.changed)
  }

  /** 解绑 CmxDataSet 监听并清空句柄 */
  _unbindDsListeners () {
    if (!this._ds || !this._dsListeners) return
    this._ds.removeEventListener('ds-row-added',   this._dsListeners.added)
    this._ds.removeEventListener('ds-row-removed', this._dsListeners.removed)
    this._ds.removeEventListener('row-changed',    this._dsListeners.changed)
    this._dsListeners = null
  }

  // ── 内部：事件转发 ────────────────────────────────────────────────────────

  /** 绑定 FORWARDED_EVENTS 中的事件转发（内部 → 外部，带 bubbles + composed） */
  _bindEvents () {
    for (const name of FORWARDED_EVENTS) {
      const handler = (e) => {
        // node-clicked 额外同步 CmxDataSet 当前行
        if (name === 'node-clicked') this._syncCurrentRowFromNode(e?.detail?.node)
        this.dispatchEvent(new CustomEvent(name, {
          bubbles: true, composed: true, detail: e.detail,
        }))
      }
      this._inner.addEventListener(name, handler)
      this._eventCleanup.push({ name, handler })
    }
  }

  /**
   * 节点点击时同步 CmxDataSet 当前行（受 data-cmx-sync-current-row=false 关闭）。
   * @param {object} node 被点击的 web-treeview 节点
   */
  _syncCurrentRowFromNode (node) {
    const raw = this.getAttribute('data-cmx-sync-current-row')
    // 显式关闭则不同步
    if (raw != null && String(raw).toLowerCase() === 'false') return
    if (!this._ds || !node) return
    const id = node.id ?? node.data?.[this.getAttribute('id-member') || 'id']
    if (id == null || typeof this._ds.moveToId !== 'function') return
    try {
      if (this._ds.getRow && this._ds.getRow(id)) this._ds.moveToId(id)
      else this._ds.moveToId(String(id))
    } catch (_) {}
  }

  /** 解绑所有已转发事件并清空清理记录 */
  _unbindEvents () {
    for (const { name, handler } of this._eventCleanup) {
      this._inner?.removeEventListener(name, handler)
    }
    this._eventCleanup = []
  }

  // ── 内部：主题 ────────────────────────────────────────────────────────────

  /**
   * 检测当前是否暗色主题：优先读 --sapBackgroundColor 的亮度，
   * 无法解析时回退到 prefers-color-scheme 媒体查询。
   * @returns {boolean}
   */
  _detectDarkMode () {
    return detectDarkMode()
  }

  /**
   * 根据暗色检测结果注入/移除内部 web-treeview 的 --tv-* 主题变量。
   * 暗色时覆盖全部 --tv-* 变量；亮色时移除覆盖，恢复库默认。
   */
  _applyTheme () {
    if (!this._inner) return
    const dark = this._detectDarkMode()
    if (dark) {
      // 暗色主题：按库变量语义逐项覆盖 --tv-*（文字=浅色、背景=深色，全部由 --sap* 派生）
      this._inner.style.setProperty('--tv-bg-color',           'var(--sapList_Background, #1d232a)')
      this._inner.style.setProperty('--tv-text-color',         'var(--sapTextColor, #f5f6f7)')
      this._inner.style.setProperty('--tv-text-color-2',       'var(--sapContent_LabelColor, #a9b4be)')
      this._inner.style.setProperty('--tv-border-color',       'var(--sapList_BorderColor, #354a5e)')
      this._inner.style.setProperty('--tv-hover-bg',           'var(--sapList_Hover_Background, #222b35)')
      this._inner.style.setProperty('--tv-active-bg',          'color-mix(in srgb, var(--sapList_Hover_Background, #222b35) 88%, var(--sapTextColor, #f5f6f7))')
      this._inner.style.setProperty('--tv-light-bg',           'color-mix(in srgb, var(--sapList_Background, #252d36) 94%, var(--sapTextColor, #f5f6f7))')
      this._inner.style.setProperty('--tv-accent-color',       'var(--sapHighlightColor, #4db1ff)')
      this._inner.style.setProperty('--tv-accent-color-hover', 'color-mix(in srgb, var(--sapHighlightColor, #4db1ff) 70%, var(--sapTextColor, #fff))')
      this._inner.style.setProperty('--tv-selected-bg',        'color-mix(in srgb, var(--sapHighlightColor, #4db1ff) 15%, transparent)')
      this._inner.style.setProperty('--tv-loading-bg',         'color-mix(in srgb, var(--sapList_Background, #1d232a) 85%, transparent)')
    } else {
      // 亮色主题：移除所有覆盖，恢复 web-treeview 库默认 --tv-* 变量
      this._inner.style.removeProperty('--tv-bg-color')
      this._inner.style.removeProperty('--tv-text-color')
      this._inner.style.removeProperty('--tv-text-color-2')
      this._inner.style.removeProperty('--tv-border-color')
      this._inner.style.removeProperty('--tv-hover-bg')
      this._inner.style.removeProperty('--tv-active-bg')
      this._inner.style.removeProperty('--tv-light-bg')
      this._inner.style.removeProperty('--tv-accent-color')
      this._inner.style.removeProperty('--tv-accent-color-hover')
      this._inner.style.removeProperty('--tv-selected-bg')
      this._inner.style.removeProperty('--tv-loading-bg')
    }
  }
}

customElements.define('cmx-web-treeview', CmxWebTreeview)
