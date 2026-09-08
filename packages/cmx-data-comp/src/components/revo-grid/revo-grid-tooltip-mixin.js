/**
 * 单元格截断悬浮提示 mixin（H 组）。
 *
 * revo-grid 内置 .rgCell 已有 overflow:hidden + text-overflow:ellipsis + white-space:nowrap，
 * 列宽不足时单元格内容被裁剪看不到。本 mixin 在 _host 上做事件委托：鼠标悬浮数据单元格时，
 * 若 scrollWidth > clientWidth（确属截断），延迟 250ms 显示一个跟随鼠标的浮层展示完整文本；
 * 离开单元格或 host 区域立即隐藏。
 *
 * 设计要点：
 *  - 事件委托挂在 _host 上（参考 events-mixin 的 _onHostLinkClickBound），用 composedPath
 *    跨 ShadowRoot 找 .rgCell —— 虚拟滚动下 cell DOM 会被回收，委托是唯一可行方案。
 *  - 仅截断时显示（scrollWidth 判定），避免不截断的单元格也弹提示造成噪音。
 *  - 浮层挂 document.body + position:fixed：不受宿主 transform/filter 让 fixed 失真，
 *    高 z-index 盖在所有元素上；离开 host 或组件卸载时立即移除。
 *  - cellTooltip 选项运行时生效：handler 内部检查 _opts.cellTooltip，setOptions 切换无需重绑。
 *
 * Object.assign 到 CmxRevoGrid.prototype 后，this 指向组件实例，
 * 实例字段（_host/_opts）由 connectedCallback 初始化。
 */

/** 浮层显示延迟（ms）：避免鼠标快速划过时频繁弹出。 */
const TOOLTIP_SHOW_DELAY = 250

export const revoGridTooltipMixin = {
  /** 在 _host 上绑定 mouseover/mousemove/mouseout 委托。幂等（_tooltipBound 去重）。 */
  _bindCellTooltip () {
    if (this._tooltipBound) return
    this._tooltipBound = true
    this._tooltipEl = null
    this._tooltipCell = null
    this._tooltipTimer = null

    this._onHostHoverTooltip = (e) => {
      if (this._opts.cellTooltip === false) return
      const cell = this._cellFromEvent(e)
      if (!cell) { this._cancelTooltip(); return }
      // 同一 cell 内移动：保持现状（已显示的不重弹，未显示的继续等定时器）
      if (cell === this._tooltipCell) return
      // 切到新 cell：取消上一个未弹出的定时器，重新判定
      this._cancelTooltip()
      this._tooltipCell = cell
      // 截断判定：scrollWidth > clientWidth 说明文本被 ellipsis 裁剪
      if (cell.scrollWidth <= cell.clientWidth + 1) return
      const text = (cell.textContent || '').trim()
      if (!text) return
      const cx = e.clientX
      const cy = e.clientY
      this._tooltipTimer = setTimeout(() => this._showTooltip(text, cx, cy), TOOLTIP_SHOW_DELAY)
    }

    this._onHostMoveTooltip = (e) => {
      // 浮层已显示时跟随鼠标更新位置（未显示的等 mouseover 定时器，不在此处理）
      if (this._tooltipEl && this._tooltipEl.style.display === 'block') {
        this._positionTooltip(e.clientX, e.clientY)
      }
    }

    this._onHostOutTooltip = (e) => {
      // mouseout 在移到子元素时也会触发；只有真正离开 _host 区域才隐藏
      const rt = e.relatedTarget
      if (rt && typeof this._host.contains === 'function' && this._host.contains(rt)) return
      this._cancelTooltip()
    }

    this._host.addEventListener('mouseover', this._onHostHoverTooltip)
    this._host.addEventListener('mousemove', this._onHostMoveTooltip)
    this._host.addEventListener('mouseout', this._onHostOutTooltip)
  },

  /**
   * 从事件 composedPath 跨 ShadowRoot 取数据单元格（.rgCell），排除表头 / 序号列。
   * 遇到 _host / _revo 边界停止上溯，避免误判外层节点。
   * @param {MouseEvent} e
   * @returns {HTMLElement|null}
   */
  _cellFromEvent (e) {
    const path = e.composedPath?.() || []
    for (const el of path) {
      if (!el || el === this._host || el === this._revo) break
      if (typeof el.classList?.contains === 'function' && el.classList.contains('rgCell')) {
        // 表头单元格 / 序号列单元格不提示
        if (typeof el.closest === 'function') {
          if (el.closest('revogr-header')) return null
          if (el.closest('.rowHeaders')) return null
        }
        return el
      }
    }
    return null
  },

  /** 显示浮层（懒创建），设置文本并定位。 */
  _showTooltip (text, x, y) {
    const el = this._ensureTooltipEl()
    el.textContent = text
    el.style.display = 'block'
    this._positionTooltip(x, y)
  },

  /**
   * 把浮层定位到鼠标附近：默认显示在鼠标右上方，上方放不下时翻到下方，
   * 右边界溢出时左移。依赖 getBoundingClientRect 测量，故须先 display:block。
   */
  _positionTooltip (x, y) {
    const el = this._tooltipEl
    if (!el) return
    const rect = el.getBoundingClientRect()
    let left = x + 14
    let top = y - rect.height - 10
    if (top < 8) top = y + 20 // 上方放不下 → 显示在下方
    const maxLeft = window.innerWidth - rect.width - 8
    if (left > maxLeft) left = Math.max(8, maxLeft)
    el.style.left = `${Math.round(left)}px`
    el.style.top = `${Math.round(top)}px`
  },

  /** 取消未弹出的定时器 + 隐藏已弹出的浮层 + 清当前 cell 记录。 */
  _cancelTooltip () {
    if (this._tooltipTimer) { clearTimeout(this._tooltipTimer); this._tooltipTimer = null }
    this._tooltipCell = null
    if (this._tooltipEl) this._tooltipEl.style.display = 'none'
  },

  /** 懒创建浮层 DOM（挂 document.body，内联样式 + SAP 变量，避免被外部 CSS 污染）。 */
  _ensureTooltipEl () {
    if (this._tooltipEl && this._tooltipEl.isConnected) return this._tooltipEl
    const el = document.createElement('div')
    el.className = 'cmx-cell-tooltip'
    el.setAttribute('part', 'cell-tooltip')
    el.style.cssText = [
      'position:fixed',
      'z-index:2147483600',
      'display:none',
      'max-width:380px',
      'padding:6px 10px',
      'background:var(--sapTooltip_Background,#1d2d3e)',
      'color:var(--sapTooltip_TextColor,#fff)',
      'border:1px solid var(--sapTooltip_BorderColor,rgba(255,255,255,.14))',
      'border-radius:6px',
      'font:12px/1.55 var(--sapFontFamily,"72","Segoe UI",Arial,sans-serif)',
      'letter-spacing:0.02em',
      'white-space:normal',
      'word-break:break-word',
      'box-shadow:0 4px 14px rgba(0,0,0,.22)',
      'pointer-events:none',
    ].join(';')
    document.body.appendChild(el)
    this._tooltipEl = el
    return el
  },

  /** disconnectedCallback 调用：移除事件监听 + 清定时器 + 移除浮层 DOM。 */
  _unbindCellTooltip () {
    this._cancelTooltip()
    if (this._host) {
      if (this._onHostHoverTooltip) this._host.removeEventListener('mouseover', this._onHostHoverTooltip)
      if (this._onHostMoveTooltip) this._host.removeEventListener('mousemove', this._onHostMoveTooltip)
      if (this._onHostOutTooltip) this._host.removeEventListener('mouseout', this._onHostOutTooltip)
    }
    this._onHostHoverTooltip = null
    this._onHostMoveTooltip = null
    this._onHostOutTooltip = null
    if (this._tooltipEl && this._tooltipEl.isConnected) this._tooltipEl.remove()
    this._tooltipEl = null
    this._tooltipBound = false
  },
}
