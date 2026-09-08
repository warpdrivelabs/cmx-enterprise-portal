/**
 * 列宽实时拖动 mixin（J 组）。
 *
 * 背景：revo-grid 的 ResizeDirective 在拖动过程中只移动拖把元素自身，不更新列宽
 * （header-cell-renderer 的回调只在 resize:end 时调 onResize）。原生体验是"松手才落实"。
 * 本 mixin 在 cmx 层接管拖动，实现"按住拖动时列宽实时跟手变化"。
 *
 * 实现：
 *  - capture 阶段在 _host 上监听 pointerdown，命中 .resizable 时 preventDefault +
 *    stopImmediatePropagation 旁路 revo-grid 的 ResizeDirective（.resizable DOM 仍由
 *    resize:true 生成，但拖动逻辑由本 mixin 接管，revo-grid 的 aftercolumnresize 不再触发）。
 *  - document mousemove 用 requestAnimationFrame 节流（每帧最多一次重算），算出 newWidth
 *    （minSize/maxSize 夹取）→ 更新 _revoColumns 叶 size + _userColSizes → 清 columns 签名
 *    重赋 columns → revo-grid 重渲，列宽实时变化。
 *  - mouseup 解绑，恢复 cursor。
 *
 * 列宽不足时单元格文本被 ellipsis 裁剪的，配合 cellTooltip（默认开）可悬浮看全文。
 *
 * Object.assign 到 CmxRevoGrid.prototype 后，this 指向组件实例。
 */

export const revoGridResizeMixin = {
  _bindRealtimeResize () {
    if (this._rtResizeBound) return
    this._rtResizeBound = true

    this._onHostPointerDownForResize = (e) => {
      if (!this._opts.resize || e.button !== 0) return // 仅左键
      // 跨 ShadowRoot 找 .resizable（仅 capture 阶段才能抢在 revo-grid 之前）
      const path = e.composedPath?.() || []
      let handle = null
      let headerCell = null
      for (const el of path) {
        if (!el || el === this._host || el === this._revo) break
        if (!handle && typeof el.classList?.contains === 'function' && el.classList.contains('resizable')) {
          handle = el
        }
        if (!headerCell && typeof el.classList?.contains === 'function' && el.classList.contains('rgHeaderCell')) {
          headerCell = el
        }
        if (handle && headerCell) break
      }
      if (!handle || !headerCell) return

      // data-rgCol 是 revo-grid header cell 的列索引（扁平叶子序号）
      const colIndex = parseInt(
        headerCell.getAttribute('data-rgCol') ?? headerCell.dataset?.rgCol ?? '-1', 10)
      if (!Number.isFinite(colIndex) || colIndex < 0) return

      // 收集叶列（与 _columnsForViewport 的 collectLeaves 同序）
      const leaves = []
      const collectLeaves = (cols) => {
        for (const c of cols || []) {
          if (Array.isArray(c?.children) && c.children.length) collectLeaves(c.children)
          else if (c) leaves.push(c)
        }
      }
      collectLeaves(this._revoColumns)
      const leaf = leaves[colIndex]
      if (!leaf || leaf.prop == null) return

      // 旁路 revo-grid 的 ResizeDirective：preventDefault 让其 handleDown 早退（L183 defaultPrevented）
      // + stopImmediatePropagation 阻止 .resizable 上的 mousedown 监听
      e.preventDefault()
      e.stopImmediatePropagation()

      const initWidth = Number.isFinite(Number(leaf.size)) && Number(leaf.size) > 0
        ? Number(leaf.size)
        : this._baseColumnSize(leaf)
      this._rtResize = {
        prop: leaf.prop,
        startX: e.clientX,
        initWidth,
        minSize: Number(leaf.minSize) || 0,
        maxSize: Number(leaf.maxSize) || 0,
      }
      document.body.style.cursor = 'ew-resize'
      document.body.style.userSelect = 'none'
      this._rtResizeRaf = null
      this._rtResizeLastX = e.clientX
      document.addEventListener('mousemove', this._onDocMouseMoveForResize, true)
      document.addEventListener('mouseup', this._onDocMouseUpForResize, true)
    }

    this._onDocMouseMoveForResize = (e) => {
      if (!this._rtResize) return
      this._rtResizeLastX = e.clientX
      if (this._rtResizeRaf) return // 已排队，等 rAF 合并
      this._rtResizeRaf = requestAnimationFrame(() => {
        this._rtResizeRaf = null
        if (!this._rtResize) return
        const delta = this._rtResizeLastX - this._rtResize.startX
        let w = this._rtResize.initWidth + delta
        if (this._rtResize.minSize > 0) w = Math.max(w, this._rtResize.minSize)
        if (Number.isFinite(this._rtResize.maxSize) && this._rtResize.maxSize > 0) w = Math.min(w, this._rtResize.maxSize)
        w = Math.max(1, Math.round(w))
        this._refreshColumnsForResize(this._rtResize.prop, w)
      })
    }

    this._onDocMouseUpForResize = () => {
      if (!this._rtResize) return
      document.removeEventListener('mousemove', this._onDocMouseMoveForResize, true)
      document.removeEventListener('mouseup', this._onDocMouseUpForResize, true)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      this._rtResize = null
      if (this._rtResizeRaf) { cancelAnimationFrame(this._rtResizeRaf); this._rtResizeRaf = null }
    }

    // mousedown capture：抢在 revo-grid 的 .resizable onMouseDown 之前
    this._host.addEventListener('mousedown', this._onHostPointerDownForResize, true)
  },

  /**
   * 实时把新列宽应用到 revo-grid：更新列源 size + _userColSizes，清 columns 签名重赋，
   * 触发 revo-grid 重渲让列宽即时变化。rAF 节流保证每帧最多一次。
   */
  _refreshColumnsForResize (prop, newWidth) {
    const leaf = this._findRevoCol(prop)
    if (leaf) leaf.size = newWidth
    if (this._userColSizes) this._userColSizes.set(prop, newWidth)
    // 重新计算并克隆列树。stretch=false 时 _columnsForViewport 直接返回 _revoColumns 同引用，
    // 不克隆则 revo-grid 的 columns prop setter 因引用相同不触发 @Watch → 列宽不重渲。
    const raw = this._applyRequiredMarks(this._columnsForViewport())
    const columns = raw.map((c) => {
      if (Array.isArray(c?.children) && c.children.length) {
        return { ...c, children: c.children.map((cc) => ({ ...cc })) }
      }
      return { ...c }
    })
    delete this._revoPropSigs['prop:columns']
    this._setRevoProp('columns', columns, this._columnsSignature(columns))
  },

  _unbindRealtimeResize () {
    if (this._onHostPointerDownForResize) {
      this._host.removeEventListener('mousedown', this._onHostPointerDownForResize, true)
    }
    if (this._onDocMouseMoveForResize) {
      document.removeEventListener('mousemove', this._onDocMouseMoveForResize, true)
      document.removeEventListener('mouseup', this._onDocMouseUpForResize, true)
    }
    if (this._rtResizeRaf) cancelAnimationFrame(this._rtResizeRaf)
    this._rtResizeRaf = null
    this._rtResize = null
    this._rtResizeBound = false
  },
}
