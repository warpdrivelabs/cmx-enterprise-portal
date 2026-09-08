/**
 * 多级表头修正 mixin（D 组）。
 *
 * 从 cmx-revo-grid.js 拆出——对抗 revo-grid 多级表头渲染缺陷：
 * 写 CSS 变量驱动表头行高 + 标记孤立叶列的纵向合并行数。
 * _hasPinnedLeaf / _scanLeafOrphans 作为模块内部函数，由 mixin 方法和外部 G 组引用。
 */

// 检测列树里是否有任一叶列带 pin（colPinStart/colPinEnd 冻结）。
export function _hasPinnedLeaf (revoColumns) {
  const walk = (cols) => {
    for (const c of cols || []) {
      if (Array.isArray(c?.children) && c.children.length) { if (walk(c.children)) return true }
      else if (c?.pin === 'colPinStart' || c?.pin === 'colPinEnd') return true
    }
    return false
  }
  return walk(revoColumns)
}

export function _scanLeafOrphans (revoColumns) {
  let groupingDepth = 0
  const leafOrphanCounts = []
  const walk = (nodes, parentLevel /* level of nearest non-empty ancestor; -1 if none */, currentLevel) => {
    for (const n of (nodes || [])) {
      if (n && Array.isArray(n.children)) {
        const hasCaption = (n.name != null && String(n.name).length > 0)
        const myLevel    = hasCaption ? currentLevel : parentLevel
        const nextParent = hasCaption ? currentLevel : parentLevel
        // 每嵌一层 group，currentLevel+1 总是要跟着走的（决定 groupingDepth）
        if (currentLevel + 1 > groupingDepth) groupingDepth = currentLevel + 1
        walk(n.children, nextParent, currentLevel + 1)
      } else {
        // 叶子：父最深 level = parentLevel；当下还没把这个 leaf 的 row 计入 groupingDepth
        leafOrphanCounts.push(parentLevel)   // 暂存父 level；下面再换算成 orphan 行数
      }
    }
  }
  walk(revoColumns, -1, 0)
  // 换算：orphan = groupingDepth - 1 - parentLevel，且 ≥ 0
  for (let i = 0; i < leafOrphanCounts.length; i++) {
    const pl = leafOrphanCounts[i]
    leafOrphanCounts[i] = Math.max(0, groupingDepth - 1 - pl)
  }
  return { groupingDepth, leafOrphanCounts }
}

export const revoGridMultiHeaderMixin = {
  _scheduleMultiHeaderNormalize() {
    if (this._multiHeaderRaf) return
    this._multiHeaderRaf = requestAnimationFrame(() => {
      this._multiHeaderRaf = 0
      this._normalizeMultiHeader()
    })
  },

  /**
   * 多级表头实际 DOM 修正：
   *   - 写 --cmx-header-row-h / --cmx-main-header-h CSS 变量驱动表头行高；
   *   - 遍历 revo-grid 渲染出的 .actual-rgRow 叶 cell，按 _scanLeafOrphans 给出的
   *     orphan 行数写 data-cmx-leaf-orphan-rows 属性，由 CSS 完成孤立叶的纵向合并。
   * 跳过 rowHeaders 那一份表头（由独立 CSS 全高拉伸）。
   */
  _normalizeMultiHeader() {
    if (!this._revo) return
    const rowH = this._opts.rowHeight || 32
    this._revo.style.setProperty('--cmx-header-row-h', `${rowH}px`)

    const { groupingDepth, leafOrphanCounts } = _scanLeafOrphans(this._revoColumns || [])
    // 序号侧（rowHeaders）revogr-header 拉伸到与主表头同高 = (groupingDepth+1)*rowH
    this._revo.style.setProperty('--cmx-main-header-h', `${(groupingDepth + 1) * rowH}px`)

    const headers = this._revo.querySelectorAll('revogr-header .actual-rgRow')
    headers.forEach((row) => {
      // 排除 rowHeaders 那一份 revogr-header（它只有一个序号 cell，由独立 CSS 全高拉伸即可，
      // 不参与 orphan-rows 这条数据属性驱动的合并）
      if (row.closest('.rowHeaders')) return
      const cells = row.querySelectorAll(':scope > .rgHeaderCell')
      let idx = 0
      cells.forEach((cell) => {
        const orphan = leafOrphanCounts[idx] || 0
        if (groupingDepth > 0 && orphan > 0) cell.setAttribute('data-cmx-leaf-orphan-rows', String(orphan))
        else cell.removeAttribute('data-cmx-leaf-orphan-rows')
        idx++
      })
    })
  },

  /** 安装 afterheaderrender 监听：revo 内部重渲后重做 orphan 标记 */
  _bindHeaderRenderListener() {
    if (!this._revo || this._afterHeaderRenderBound) return
    this._afterHeaderRenderBound = () => {
      this._scheduleMultiHeaderNormalize()
      // 必填列 columnTemplate 兜底：revo-grid 内部 column.service 处理列时可能丢失函数引用
      // （before/aftercolumnsset 之间），在 afterheaderrender 阶段重新挂一次
      if (this._opts.showRequiredMark && Array.isArray(this._revoColumns)) {
        const cols = this._applyRequiredMarks(this._revoColumns)
        // 找到 revo 内部 colData store（不同 revo 版本存储路径不同，遍历找带 columnTemplate 标记的）
        try {
          const revo = this._revo
          const stores = []
          // 1) columnService.source
          if (revo.columnService && revo.columnService.source) {
            const s = revo.columnService.source
            if (s && typeof s.get === 'function') {
              const src = s.get('source')
              if (Array.isArray(src)) stores.push(src)
            }
          }
          // 2) columnProvider.stores[*].store
          if (revo.columnProvider && revo.columnProvider.stores) {
            for (const k in revo.columnProvider.stores) {
              const st = revo.columnProvider.stores[k] && revo.columnProvider.stores[k].store
              if (st && typeof st.get === 'function') {
                const src = st.get('source')
                if (Array.isArray(src)) stores.push(src)
              }
            }
          }
          // 用 _revoColumns 的 columnTemplate 重新覆盖
          for (const arr of stores) {
            for (let i = 0; i < arr.length && i < cols.length; i++) {
              if (cols[i] && cols[i].columnTemplate) {
                arr[i].columnTemplate = cols[i].columnTemplate
              }
            }
          }
        } catch (e) { /* ignore */ }
      }
    }
    this._revo.addEventListener('afterheaderrender', this._afterHeaderRenderBound)
  },

  /** 解绑 afterheaderrender 监听（disconnectedCallback 调用）。 */
  _unbindHeaderRenderListener() {
    if (this._revo && this._afterHeaderRenderBound) {
      this._revo.removeEventListener('afterheaderrender', this._afterHeaderRenderBound)
      this._afterHeaderRenderBound = null
    }
  }

}
