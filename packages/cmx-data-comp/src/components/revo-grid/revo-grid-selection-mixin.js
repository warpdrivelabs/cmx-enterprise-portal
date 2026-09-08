/**
 * 选中态管理 mixin（C 组）。
 *
 * 从 cmx-revo-grid.js 拆出——single/multi/Shift 区间/Ctrl toggle 选中语义。
 * _updateSelectionOnFocus 调用 A 组的 _syncSelection / getSelectedIds（公开 API），
 * 运行时通过 this 解析，Object.assign 后无静态依赖问题。
 */
export const revoGridSelectionMixin = {
  _updateSelectionOnFocus(model, mode, modifiers = { ctrlKey: false, shiftKey: false, metaKey: false }) {
    if (mode === 'none') return

    // 优先通过 dataset 游标驱动：ds.moveToId 会触发 cursor-changed，
    // cursor-changed 监听器再同步 _selectedId + _syncSelection，形成闭环。
    if (this._ds) {
      if (mode === 'multi') {
        // 算出新的 _selectedIds，再 moveToId 让 cursor-changed 兜底同步 _selectedId
        const newIds = this._computeMultiSelection(model.id, modifiers)
        const changed = !this._sameIdSet(newIds, this._selectedIds)
        this._selectedIds = newIds
        // Shift 区间不挪锚点；其它情况锚点 = 当前行。
        // _selectionAnchorId 统一存 String(id) 与 _selectRange/_pruneSelection 内部类型对齐，
        // 否则整数主键场景 _selectRange 的 ids.indexOf(anchorId) 查 string 数组返回 -1，
        // Shift 区间退化为单选。
        this._selectionAnchorId = modifiers.shiftKey ? this._selectionAnchorId : String(model.id)
        this._ds.moveToId(model.id)
        // moveToId 在"点击的就是当前游标行"时不触发 cursor-changed，高亮不会刷新；
        // 这里按选中集合是否变化显式补刷一次，保证 Shift 连选/Ctrl 反选的视觉即时更新。
        if (changed) this._syncSelection()
        if (changed) {
          this.dispatchEvent(new CustomEvent('cmx-row-selection-change', {
            bubbles: true, composed: true, detail: { ids: this.getSelectedIds() },
          }))
        }
        return
      }
      // single：游标移动 → cursor-changed → _selectedId 更新 → _syncSelection
      this._ds.moveToId(model.id)
      return
    }

    // 无 ds（纯数组模式）：直接维护 _selectedId
    if (mode === 'single') {
      if (this._selectedId === model.id) return
      this._selectedId = model.id
      // 同 multi 路径：锚点统一存 String(id)，保持内部类型契约一致
      this._selectionAnchorId = String(model.id)
      this._syncSelection()
      this.dispatchEvent(new CustomEvent('cmx-row-selected', {
        bubbles: true, composed: true, detail: { id: model.id },
      }))
    } else {
      // multi（纯数组模式）
      const newIds = this._computeMultiSelection(model.id, modifiers)
      this._selectedIds = newIds
      this._selectedId = model.id
      // 同 ds 路径：锚点统一存 String(id)，避免整数主键下 Shift 区间失效
      this._selectionAnchorId = modifiers.shiftKey ? this._selectionAnchorId : String(model.id)
      this._syncSelection()
      this.dispatchEvent(new CustomEvent('cmx-row-selection-change', {
        bubbles: true, composed: true, detail: { ids: this.getSelectedIds() },
      }))
    }
  }
,
  _computeMultiSelection(modelId, modifiers) {
    const idStr = modelId != null ? String(modelId) : null
    if (idStr == null) return new Set()
    const ctrl = !!(modifiers.ctrlKey || modifiers.metaKey)
    const shift = !!modifiers.shiftKey

    if (shift && this._selectionAnchorId != null) {
      return this._selectRange(this._selectionAnchorId, idStr)
    }
    if (ctrl) {
      const next = new Set(this._selectedIds)
      if (next.has(idStr)) next.delete(idStr)
      else next.add(idStr)
      return next
    }
    return new Set([idStr])
  }
,
  _selectRange(anchorId, currentId) {
    if (!this._rows.length) return new Set([currentId])
    const ids = this._rows.map((r) => r.id != null ? String(r.id) : null)
    const anchorIdx = ids.indexOf(anchorId)
    const currentIdx = ids.indexOf(currentId)
    if (currentIdx < 0) return new Set()
    if (anchorIdx < 0) return new Set([currentId])
    const start = Math.min(anchorIdx, currentIdx)
    const end = Math.max(anchorIdx, currentIdx)
    const result = new Set()
    for (let i = start; i <= end; i++) {
      if (ids[i] != null) result.add(ids[i])
    }
    return result
  }
,
  _sameIdSet(a, b) {
    if (a === b) return true
    if (!a || !b) return false
    if (a.size !== b.size) return false
    for (const x of a) if (!b.has(x)) return false
    return true
  }
,
  _pruneSelection() {
    const valid = new Set(this._rows.map((r) => r.id != null ? String(r.id) : null).filter((x) => x != null))
    if (this._selectedId != null && !valid.has(String(this._selectedId))) this._selectedId = null
    for (const id of [...this._selectedIds]) {
      if (!valid.has(id)) this._selectedIds.delete(id)
    }
    if (this._selectionAnchorId != null && !valid.has(String(this._selectionAnchorId))) {
      this._selectionAnchorId = null
    }
  }
}
