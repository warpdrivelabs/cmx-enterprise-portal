/**
 * 列宽 stretch 计算 mixin（B 组）。
 *
 * 从 cmx-revo-grid.js 拆出——当所有数据列自然宽度小于视口时按比例放大，
 * 超过视口时保留原宽支持横向滚动。支持百分比列宽（width: '20%'）：
 * 百分比列固定占主区的 percent/100，普通 px 列在剩余空间内 stretch 放大。
 *
 * 冻结列（pin=colPinStart/colPinEnd）与 stretch 共存：冻结列保持各自固定宽度
 * （用户拖动锁定值优先，否则取 base size），不参与拉伸；主区列在
 * (视口宽 - 冻结列总宽) 内按三档（百分比/用户锁定/px stretch）分配。
 * 这样右侧冻结操作列 + 主区铺满屏幕两者兼得。
 *
 * Object.assign 到 CmxRevoGrid.prototype 后，this 指向组件实例，
 * 实例字段（_opts/_revo/_revoColumns/_host）由构造器初始化。
 */
export const revoGridStretchMixin = {
  _columnsForViewport() {
    if (!this._opts.stretch || !this._revo || !Array.isArray(this._revoColumns) || !this._revoColumns.length) {
      return this._revoColumns
    }

    const available = this._dataColumnViewportWidth()
    if (!Number.isFinite(available) || available <= 1) return this._revoColumns

    const leaves = []
    const collectLeaves = (cols) => {
      for (const col of cols || []) {
        if (Array.isArray(col?.children) && col.children.length) collectLeaves(col.children)
        else if (col) leaves.push(col)
      }
    }
    collectLeaves(this._revoColumns)
    if (!leaves.length) return this._revoColumns

    const finalSizes = new Array(leaves.length).fill(0)

    // 第一遍：冻结列固定宽度（写入 finalSizes）；主区列下标收集到 mainIndices。
    // 冻结列不参与 stretch：用户拖动锁定值优先，否则取 base size（含 minSize/maxSize 夹取）。
    // available 已是「主区净宽」（不含冻结列，由 _dataColumnViewportWidth 统一扣除），
    // 故此处不再扣冻结列宽度。
    const mainIndices = []
    for (let i = 0; i < leaves.length; i++) {
      const col = leaves[i]
      if (col?.pin === 'colPinStart' || col?.pin === 'colPinEnd') {
        const userW = col?.prop && this._userColSizes?.has(col.prop) ? this._userColSizes.get(col.prop) : null
        const w = Number.isFinite(userW) && userW > 0 ? userW : this._baseColumnSize(col)
        finalSizes[i] = w
      } else {
        mainIndices.push(i)
      }
    }

    // 第二遍：主区列在 available（主区净宽）内按三档分配。
    // 固定宽度列（不参与 stretch 放大）有两类：
    //  - 百分比列（_cmxPercent）：固定 = floor(mainAvailable * percent / 100)
    //  - 用户拖动锁定列（_userColSizes）：固定 = 用户拖出的像素宽（resize 开启后回写）
    // 其余普通 px/flex/默认列：base size 待定，在剩余空间内按比例 stretch
    if (mainIndices.length) {
      // available 已是「主区净宽」（不含冻结列），直接用；勿再减冻结列宽度（会重复扣）。
      const mainAvailable = Math.max(0, available)
      const mainFinal = new Array(mainIndices.length).fill(0)
      const pxIndices = []
      const pxBaseSizes = []
      let fixedTotal = 0
      for (let k = 0; k < mainIndices.length; k++) {
        const col = leaves[mainIndices[k]]
        const p = col?._cmxPercent
        if (Number.isFinite(p) && p > 0) {
          const w = Math.max(1, Math.floor((mainAvailable * p) / 100))
          mainFinal[k] = w
          fixedTotal += w
        } else if (col?.prop && this._userColSizes?.has(col.prop)) {
          // 用户手动拖动锁定的列：保持用户给定的尺寸，不参与 stretch 再分配
          const w = this._userColSizes.get(col.prop)
          mainFinal[k] = w
          fixedTotal += w
        } else {
          pxIndices.push(k)
          pxBaseSizes.push(this._baseColumnSize(col))
        }
      }

      if (pxIndices.length) {
        const pxAvailable = Math.max(0, mainAvailable - fixedTotal)
        const pxBaseTotal = pxBaseSizes.reduce((sum, s) => sum + s, 0)
        // 是否把 px 列按比例缩放到 pxAvailable（放大或收缩）以精确铺满：
        //  - 有固定列（百分比 / 用户拖动锁定，fixedTotal>0）且 pxAvailable>0：px 列收缩/放大精确
        //    铺满剩余空间，避免"百分比占位 + px base 略超"产生擦边横向滚动条（cr-todo 20% 场景）。
        //  - 纯 px 场景：base 总和 < available 时放大铺满；>= available 时保持原宽（列多 → 横向滚动）。
        //  - pxAvailable<=0（固定列已占满主区）：保持原宽，允许滚动。
        const hasFixed = fixedTotal > 0
        const shouldScale = pxBaseTotal > 0 && pxAvailable > 0 && (hasFixed || pxBaseTotal < pxAvailable)
        const pxFinal = shouldScale ? this._scaleColumnSizes(pxBaseSizes, pxAvailable) : pxBaseSizes
        for (let k = 0; k < pxIndices.length; k++) mainFinal[pxIndices[k]] = pxFinal[k]
      }
      for (let k = 0; k < mainIndices.length; k++) finalSizes[mainIndices[k]] = mainFinal[k]
    }

    // 行为小结：
    //  - 纯 px 列、总和 < 主区：放大铺满；总和 ≥ 主区：保持原宽（列多 → 横向滚动）。
    //  - 有固定列（百分比/锁定）+ px 列：px 列放大或收缩精确填满 (主区 - 固定列)，不产生擦边滚动条。
    //  - 全是固定列、fixedTotal < 主区：剩余留白（固定列是用户/百分比明确意图，不强制铺满）。
    //  - 固定列已占满主区（pxAvailable<=0）、又存在 px 列：px 列保持原宽，允许总宽超出 → 横向滚动。

    let idx = 0
    const cloneWithSizes = (cols) => (cols || []).map((col) => {
      if (Array.isArray(col?.children) && col.children.length) {
        return { ...col, children: cloneWithSizes(col.children) }
      }
      return { ...col, size: finalSizes[idx++] }
    })
    return cloneWithSizes(this._revoColumns)
  },

  /**
   * 计算「主区净宽」——主区列可分配宽度（不含冻结列、不含序号列、不含垂直滚动条占位）。
   *
   * 统一用「容器整宽 − 序号列 − 滚动条 − 冻结列总宽」估算。曾经优先读
   * revogr-viewport-scroll.rgCol.clientWidth（mainVp）作精确值，但：
   *  1) 有冻结列时它与列实际可用宽度对不齐（偏高），导致切换页面返回后主区列总宽溢出、
   *     出现横向滚动条；
   *  2) 它与 fallback 估算（首次渲染用）不一致，造成「首次正常、返回异常」。
   * 统一为单一估算，保证「首次渲染」与「页面切换返回」走同一套计算、结果必然一致
   * （display:none 切换不重置 revo 的 clientWidth，两时刻输入相同 → 输出相同）。
   *
   * 垂直滚动条按数据量判断（max(数据行, minRows) × rowHeight > 视口高 → 扣 16）：
   * revo-grid 虚拟滚动，DOM scrollHeight 只含可见行不可靠，故用数据量而非 DOM 判断。
   */
  _dataColumnViewportWidth() {
    const revo = this._revo
    const full = Math.floor(revo?.clientWidth || this._host?.clientWidth || 0)
    if (!full) return 0
    const rowHeaderWidth = this._opts.showRowIndex ? Number(this._opts.rowIndexWidth || 40) : 0
    const rowCount = Math.max(this._rows?.length || 0, this._opts.minRows || 0)
    const rowSize = Number(this._opts.rowHeight) || 32
    const viewportH = Math.floor(revo?.clientHeight || this._host?.clientHeight || 0)
    const hasVScroll = viewportH > 0 && rowCount * rowSize > viewportH
    const pinnedTotal = this._sumPinnedBaseWidth()
    return Math.max(0, Math.floor(full - rowHeaderWidth - (hasVScroll ? 16 : 0) - pinnedTotal))
  },

  /** 累加冻结列（pin=colPinStart/colPinEnd）基础宽度：用户拖动锁定值优先，否则 _baseColumnSize。
   *  供 _dataColumnViewportWidth 扣除冻结列，口径与 _columnsForViewport 第一遍遍历完全一致
   *  （userW 优先 → base size），保证两者对冻结列宽度的认定不产生偏差。 */
  _sumPinnedBaseWidth() {
    const leaves = []
    const walk = (cols) => {
      for (const col of cols || []) {
        if (Array.isArray(col?.children) && col.children.length) walk(col.children)
        else if (col) leaves.push(col)
      }
    }
    walk(this._revoColumns)
    let total = 0
    for (const col of leaves) {
      if (col?.pin !== 'colPinStart' && col?.pin !== 'colPinEnd') continue
      const userW = col?.prop && this._userColSizes?.has(col.prop) ? this._userColSizes.get(col.prop) : null
      total += Number.isFinite(userW) && userW > 0 ? userW : this._baseColumnSize(col)
    }
    return total
  },

  /**
   * 取列的基础宽度：优先 col.size，缺省 100；再按 minSize/maxSize 夹取。
   * @param {object} col  revo-grid 列对象
   * @returns {number}
   */
  _baseColumnSize(col) {
    const explicit = Number(col?.size)
    const min = Number(col?.minSize)
    const max = Number(col?.maxSize)
    let size = Number.isFinite(explicit) && explicit > 0 ? explicit : 100
    if (Number.isFinite(min) && min > 0) size = Math.max(size, min)
    if (Number.isFinite(max) && max > 0) size = Math.min(size, max)
    return size
  },

  /**
   * 把各列基础宽度按比例缩放到 available 总宽，并把取整余数按小数部分大小分摊回去。
   * @param {number[]} baseSizes  各列原始宽度
   * @param {number} available    可用总宽度
   * @returns {number[]}          各列缩放后的整数宽度（总和尽量等于 available）
   */
  _scaleColumnSizes(baseSizes, available) {
    const total = baseSizes.reduce((sum, size) => sum + size, 0)
    const scale = available / total
    const raw = baseSizes.map((size) => size * scale)
    const out = raw.map((size) => Math.max(1, Math.floor(size)))
    let remainder = available - out.reduce((sum, size) => sum + size, 0)
    const order = raw
        .map((size, idx) => ({ idx, frac: size - Math.floor(size) }))
        .sort((a, b) => b.frac - a.frac)
    for (let i = 0; remainder > 0 && order.length; i = (i + 1) % order.length) {
      out[order[i].idx] += 1
      remainder -= 1
    }
    return out
  },
}
