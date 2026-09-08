/**
 * 事件桥接 + 编辑校验 + 合计行 mixin（F + E 组）。
 *
 * 从 cmx-revo-grid.js 拆出：
 *   F 组——绑定 revo-grid 事件 / 编辑后写回 DataSet / 焦点→选中 / click→编辑 / 空白关闭 / 列查找 / 变更通知 / 编辑校验
 *   E 组——合计行渲染（单遍历多聚合，写 pinnedBottomSource）
 *
 * 跨组调用全部经 this 解析（_setRevoProp/_columnsForViewport/_updateSelectionOnFocus 等由其他 mixin 或主文件提供）。
 */
import { evalFormula } from '../../lib/formula-eval.js'

/** 空数组常量（与主文件 EMPTY_ROWS 一致，避免每次新建数组）。 */
const EMPTY_ROWS = Object.freeze([])

/** rAF 兜底（非 DOM 环境如 SSR 同步执行）。与主文件 nextFrame 行为一致。 */
function nextFrame (fn) {
  if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(fn)
  return setTimeout(fn, 0)
}

export const revoGridEventsMixin = {
  /**
   * 绑定 RevoGrid 原生事件，并转换为 cmx-* 自定义事件。
   */
  _bindRevoEvents() {
    this._onAfterEditBound   = (e) => this._onAfterEdit(e)
    this._onAfterFocusBound  = (e) => this._onAfterFocus(e)
    /* pointerdown 早于 revo-grid 的 afterfocus，借 capture 阶段先把修饰键记下来，
       _onAfterFocus 再据此还原用户意图（无修饰 = 单选；Ctrl/Cmd = toggle；Shift = 区间）。 */
    this._onHostPointerDownForSelection = (e) => {
      this._lastClickModifiers = {
        ctrlKey: !!e.ctrlKey,
        shiftKey: !!e.shiftKey,
        metaKey: !!e.metaKey,
        time: Date.now(),
      }
    }
    this._onBeforeEditBound  = (e) => {
      const model = e.detail?.model
      if (model?.__cmxFiller) { e.preventDefault?.(); return }
      /* 列级条件只读 readonlyWhen：满足表达式时阻止进入编辑（行级动态只读） */
      const prop = e.detail?.prop ?? e.detail?.column?.prop
      const cmxCol = this._findRevoCol(prop)?._cmxCol
      const rw = cmxCol?.edit?.readonlyWhen ?? cmxCol?.readonlyWhen
      // scope：行字段铺平 + value（formula-eval 仅认单段标识符，条件用扁平字段名）
      if (rw && model && evalFormula(rw, { ...model, value: model[prop], __col: prop }, false)) {
        e.preventDefault?.()
        return
      }
      /* 编辑期标记：用于 CSS 临时锁住 revogr-viewport-scroll 的横向溢出（overflow-x:hidden），
         避免编辑器（如 cmx-combo-box）瞬时撑出 cell 触发宿主 grid 水平滚动条闪现 → 整张表抖动。
         editTrigger='click' 路径里 setCellEdit 会先发 beforeedit；afteredit / closeedit 退场。 */
      this.setAttribute('data-cmx-editing', '1')
    }
    this._onCloseEditBound = () => this.removeAttribute('data-cmx-editing')
    this._revo.addEventListener('afteredit',  this._onAfterEditBound)
    this._revo.addEventListener('afterfocus', this._onAfterFocusBound)
    this._revo.addEventListener('beforeedit', this._onBeforeEditBound)
    this._revo.addEventListener('closeedit',  this._onCloseEditBound)

    /* 列宽手动拖动结束：把用户拖出的新尺寸回写到 _userColSizes + _revoColumns。
       stretch mixin 的 _columnsForViewport 把这些列当"锁定值"排除出再分配，
       避免下次 _syncToRevo 重算时把用户刚调好的宽度按比例抹掉。
       detail 形如 { [index]: ColumnRegular }，每个 ColumnRegular 含 prop + size。 */
    this._onAfterColumnResizeBound = (e) => {
      const detail = e.detail || {}
      if (!this._userColSizes) this._userColSizes = new Map()
      for (const col of Object.values(detail)) {
        if (col && col.prop != null && Number.isFinite(Number(col.size)) && Number(col.size) > 0) {
          const size = Math.round(Number(col.size))
          this._userColSizes.set(col.prop, size)
          // 同步到 _revoColumns 树对应叶列，让 _baseColumnSize 立即读到新值
          const leaf = this._findRevoCol(col.prop)
          if (leaf) leaf.size = size
        }
      }
    }
    this._revo.addEventListener('aftercolumnresize', this._onAfterColumnResizeBound)

    /* 点击 revo-grid 内部"空白区"（没有数据行的下方/右侧滚动条/容器留白）时，
       revo-grid 的 onElementMouseDown 通过 getFocusCellBasedOnEvent 拿不到 cell 就直接 return，
       既不切焦点也不关编辑器，导致编辑器留在屏幕上。这里在 host 上拦一层 pointerdown：
       若目标不在任何 cell / 编辑器输入 / 表头 之内，就调 _revo.clearFocus() 收掉编辑器。 */
    this._onHostPointerDownBound = (e) => this._maybeCloseEditOnBlankClick(e)
    this._host.addEventListener('pointerdown', this._onHostPointerDownBound, true)
    this._host.addEventListener('pointerdown', this._onHostPointerDownForSelection, true)

    /* display.mode='link'/'actions' 单元格点击 → 派发 cmx-cell-link-click（带 actionRef，供业务路由 Action）。
       actions 列每个按钮带自己的 data-cmx-action，优先读取；link 列用列级 actionRef。 */
    this._onHostLinkClickBound = (e) => {
      const a = e.composedPath?.().find((el) => el instanceof HTMLElement && el.dataset && el.dataset.cmxLink != null)
      if (!a) return
      const prop = a.dataset.cmxLink
      const cmxCol = this._findRevoCol(prop)?._cmxCol
      const rowEl = e.composedPath().find((el) => el instanceof HTMLElement && el.classList?.contains('rgRow'))
      const rowId = rowEl?.getAttribute?.('data-rgrow') ?? null
      // 按钮级 actionRef（data-cmx-action，actions 列每按钮独立）优先；回落列级 link.actionRef/顶层 actionRef
      const actionRef = a.dataset.cmxAction ?? cmxCol?.display?.link?.actionRef ?? cmxCol?.actionRef ?? null
      this.dispatchEvent(new CustomEvent('cmx-cell-link-click', {
        bubbles: true, composed: true,
        detail: { key: prop, rowId, actionRef },
      }))
    }
    this._host.addEventListener('click', this._onHostLinkClickBound)
  },

  /**
   * 单元格编辑完成：写回行对象、触发列 onChange / dependents，并派发 cmx-cell-changed。
   * @param {CustomEvent} e  RevoGrid afteredit
   */
  _onAfterEdit(e) {
    /* 编辑结束（不论保存还是取消，afteredit 都会触发）：解除编辑期 overflow 锁。
       closeedit 路径也会触发同一个属性的清除，二者形成兜底。 */
    this.removeAttribute('data-cmx-editing')

    const d = e.detail
    if (!d) return
    const model = d.model
    const prop = d.prop ?? d.column?.prop
    /* 区域批量编辑（粘贴/拖拽填充）：detail 无单格 prop/model。
       单格编辑虽也可能带 data 映射，但一定有明确的 prop + model —— 据此区分，
       只有「无 prop 或无 model」的真正区域编辑才跳过，避免误跳过单格写回。 */
    if (prop == null || !model || model.__cmxFiller) return

    const val = d.val !== undefined ? d.val : model[prop]
    const colMeta = this._findRevoCol(prop)
    const cmxCol = colMeta?._cmxCol

    /* 编辑校验（required / validate，含条件 requiredWhen / validateWhen）。
       校验失败：派发 cmx-cell-invalid 事件并标记，不阻断写回（保持数据，由业务决定提交时拦截）。 */
    const verr = this._validateCellEdit(cmxCol, val, model)
    if (verr) {
      this.dispatchEvent(new CustomEvent('cmx-cell-invalid', {
        bubbles: true, composed: true,
        detail: { id: model.id, key: prop, value: val, row: model, message: verr },
      }))
    }

    // CmxRowSet 使用 .set；普通对象直接赋值
    if (typeof model.set === 'function') {
      model.set(prop, val)
    } else {
      model[prop] = colMeta?._cmxType === 'number' ? (Number(val) || 0) : val
    }

    // 列级联动：适配器挂在 _cmxOnChange，或 cmx 列上的 onChange
    if (colMeta?._cmxOnChange) {
      colMeta._cmxOnChange(model, val)
    } else if (cmxCol?.onChange) {
      cmxCol.onChange(model, val)
    }

    // dependents：为每个派生字段再派发 cmx-cell-changed，并刷新合计
    if (cmxCol?.dependents?.length) {
      for (const depKey of cmxCol.dependents) {
        this._notifyChange(model, depKey, model[depKey])
      }
      this._renderTotals()
    }

    this._notifyChange(model, prop, model[prop])
    /* RevoGrid 在某些状态下需要重设 source 才会刷新显示（特别是 cellTemplate 路径）。
       但每次都全表重设会触发整 stencil 重渲，旁列/边线短暂消失。
       折中：用同一个数组实例，避免引用切换让 stencil 误判为新数据，
       同时调 refresh('all') 显式触发一次视口重绘。 */
    if (this._revo.source !== this._rows && Array.isArray(this._rows)) {
      this._assignSource(this._rows)
    }
    if (typeof this._revo.refresh === 'function') {
      try { this._revo.refresh('all') } catch (_) { /* ignore */ }
    }
  },

  /**
   * 焦点落到某格后：按 selectionMode 更新选中并派发 cmx 行选事件。
   * @param {CustomEvent} e  RevoGrid afterfocus
   */
  _onAfterFocus(e) {
    const model = e.detail?.model
    if (!model || model.__cmxFiller || model.__cmxTotals) return

    const mode = this._opts.selectionMode
    /* 还原本次点击的修饰键：必须在 200ms 内（pointerdown 到 afterfocus 的窗口），
       否则视为无修饰键，避免键盘方向键 / 程序触发 focus 时误用陈旧 modifier 状态。 */
    const mods = this._lastClickModifiers
    const modifiers = (mods && (Date.now() - mods.time) < 200)
        ? { ctrlKey: mods.ctrlKey, shiftKey: mods.shiftKey, metaKey: mods.metaKey }
        : { ctrlKey: false, shiftKey: false, metaKey: false }
    this._updateSelectionOnFocus(model, mode, modifiers)
    this._maybeEditOnFocus(e)
  },




  /**
   * 单击进入编辑（editTrigger==='click'）：在 _onAfterFocus 流程之后再做一次"焦点 → 编辑"。
   * 仅对可编辑列生效；readonly 列、汇总行、占位行跳过。
   * 注意：column.readonly 可能是布尔也可能是函数（条件只读 readonlyWhen 翻译产物），
   *       命中布尔 true 才视为整列只读；函数形态交给 revo-grid 在 setCellEdit 内部按行判定。
   * @param {CustomEvent} e
   */
  _maybeEditOnFocus (e) {
    if (this._opts.readonly) return
    const detail = e?.detail
    const model = detail?.model
    if (!model || model.__cmxFiller || model.__cmxTotals) return
    const column = detail?.column
    if (!column) return
    if (column.readonly === true) return
    /* 编辑触发：列级 edit.trigger 覆盖全表 options.editTrigger。
       列级 'click'/'dblclick' 优先；'inherit' 或未设时跟随全表。仅 click 语义在 focus 时进编辑。 */
    const colTrigger = column._cmxCol?.edit?.trigger ?? column._cmxCol?.trigger
    const effective = (colTrigger && colTrigger !== 'inherit') ? colTrigger : this._opts.editTrigger
    if (effective !== 'click') return
    const rowIndex = detail.rowIndex
    const prop = column.prop
    if (rowIndex == null || prop == null) return
    /* 异步触发，避免与 afterfocus 同步流冲突（revo-grid 在 focus 后还会处理一些内部 cleanup） */
    queueMicrotask(() => {
      try {
        if (typeof this._revo?.setCellEdit === 'function') {
          this._revo.setCellEdit(rowIndex, String(prop))
        }
      } catch (_) { /* ignore */ }
    })
  },

  /**
   * 点击 revo-grid 容器内的"空白区"（视口下方留白 / 滚动条 / 数据行之外）时关闭编辑器。
   * 原生 revo-grid 在这种情况下 onElementMouseDown 早退，编辑器不会自动关闭。
   * 判定：目标既不在 .rgCell 内，也不在编辑器 host(revogr-edit 或带 .edit-input-wrapper 的元素) 里，
   *      也不在 revogr-header 内（表头点击有自己一套），就视为空白区。
   */
  _maybeCloseEditOnBlankClick (e) {
    if (!this._revo) return
    const path = e.composedPath?.() || []
    /* 用 composedPath 兼容跨 ShadowRoot 的命中检查；revo-grid 自己是 Shadow DOM 组件，
       cell/编辑器/表头都在它内部，从 path 上找标签名/类名即可。 */
    for (const node of path) {
      if (!node || node === window || node === document) continue
      // 命中数据 cell：交给 revo-grid 原生处理
      if (node.classList?.contains?.('rgCell')) return
      // 命中编辑器输入（revogr-edit 或自定义编辑器根，统一带 .edit-input-wrapper / EDIT_INPUT_WR）
      const tag = (node.tagName || '').toLowerCase()
      if (tag === 'revogr-edit') return
      if (node.classList?.contains?.('edit-input-wrapper')) return
      /* 命中自定义 web component 编辑器（cmx-combo-box / cmx-ignite-combo）或其下拉内部元素：
         这些组件的下拉（igc-popover / igc-combo-list 等）在自身 shadow 内，点击下拉项的
         pointerdown 会经过这些标签。不识别就会被当成"空白点击"误关编辑器，导致 save 丢失
         （尤其最后一行下拉 flip 后更易触发）。 */
      if (tag === 'cmx-combo-box' || tag === 'cmx-ignite-combo') return
      if (tag.startsWith('igc-')) return
      // 命中表头：让表头自身处理（排序/调整列宽等）
      if (tag === 'revogr-header') return
      if (node.classList?.contains?.('rgHeaderCell')) return
      // 命中 _revo 后停止上溯，避免误判 _revo 外层节点
      if (node === this._revo) break
    }
    /* 走到这里说明点击在 revo-grid 容器内但没有命中 cell/编辑器/表头：空白区，关闭编辑。 */
    try { this._revo.clearFocus?.() } catch (_) { /* ignore */ }
  },

  /**
   * 在 _revoColumns 树中按 prop 查找列元数据（含 _cmxCol、_cmxOnChange）。
   * @param {string} prop
   * @returns {object|null}
   */
  _findRevoCol(prop) {
    const walk = (cols) => {
      for (const c of cols || []) {
        if (c.children) {
          const found = walk(c.children)
          if (found) return found
        } else if (c.prop === prop) {
          return c
        }
      }
      return null
    }
    return walk(this._revoColumns)
  },

  /**
   * 派发 cmx-cell-changed，供 CmxMasterSlave 聚合与级联。
   * @param {object} row
   * @param {string} key
   * @param {*} value
   */
  _notifyChange(row, key, value) {
    this.dispatchEvent(new CustomEvent('cmx-cell-changed', {
      bubbles: true, composed: true,
      detail: { id: row.id, key, value, row },
    }))
  },

  /**
   * 编辑校验：返回错误信息字符串（校验失败）或 null（通过）。
   * 支持 required / requiredWhen（条件必填）、validate / validateWhen（条件校验）。
   * validate：函数 (value,row)=>true|errMsg；字符串=表达式(true 通过)；{preset,args} 预留。
   * @param {object} cmxCol 列元数据（_cmxCol）
   * @param {any} val 编辑后的值
   * @param {object} row 行模型
   * @returns {string|null}
   */
  _validateCellEdit(cmxCol, val, row) {
    if (!cmxCol) return null
    /* 兼容两条路径：真实 CmxColumn(字段在 .edit.* 下) 与合成描述符(字段在顶层) */
    const ec = cmxCol.edit || cmxCol
    const label = cmxCol.caption || cmxCol.id
    // scope：行字段铺平 + value（formula-eval 仅认单段标识符，条件用扁平字段名）
    const scope = { ...row, value: val, __col: cmxCol.id }
    // 必填（含条件必填）
    const requiredOn = ec.required === true
        || (ec.requiredWhen && evalFormula(ec.requiredWhen, scope, false))
    if (requiredOn && (val == null || val === '')) {
      return `${label} 为必填项`
    }
    // 校验（含条件校验）
    const validate = ec.validate
    if (validate) {
      const shouldRun = !ec.validateWhen || evalFormula(ec.validateWhen, scope, true)
      if (shouldRun) {
        if (typeof validate === 'function') {
          const r = validate(val, row)
          if (r !== true && r != null && r !== '') return typeof r === 'string' ? r : `${label} 校验未通过`
        } else if (typeof validate === 'string') {
          const ok = evalFormula(validate, scope, true)
          if (!ok) return `${label} 校验未通过`
        } else if (Array.isArray(validate)) {
          // 规则数组 [{expr,message} | {test,message}]：逐条求值，首条失败即返回其 message
          for (const rule of validate) {
            if (!rule) continue
            const ok = typeof rule.test === 'function'
                ? !!rule.test(val, row)
                : (rule.expr ? !!evalFormula(rule.expr, scope, true) : true)
            if (!ok) return rule.message || `${label} 校验未通过`
          }
        }
      }
    }
    return null
  },

  // ─── 合计行（原生 pinnedBottomSource）─────────────────────────────────

  /**
   * 渲染合计行（revo-grid pinnedBottomSource）。
   * showTotals=false 时清空；否则按 totals.columns 或全部数值列做聚合（sum/avg/max/min/count），
   * 支持 totals.extra 回调追加额外字段。合计行带 __cmxTotals 标记，编辑/聚焦逻辑会跳过。
   * 末尾会在下一帧重赋一次 columns，让 footer 列区铺满全表宽。
   */
  _renderTotals() {
    if (!this._revo) return
    // 显式关闭合计行：清空 pinnedBottom
    if (this._opts.showTotals === false) {
      this._setRevoProp('pinnedBottomSource', [], '[]')
      return
    }
    /* totals 配置：显式 setTotals 优先；否则在 showTotals 默认开启时自动汇总所有数值列。
       若既无显式 totals 又无数值列，则不渲染合计行（避免空合计）。 */
    const t = this._opts.totals || {}
    const sumKeys = Array.isArray(t.columns) && t.columns.length
        ? t.columns
        : this._columns.filter((c) => c.type === 'number').map((c) => c.key)
    if (!sumKeys.length) {
      this._setRevoProp('pinnedBottomSource', [], '[]')
      return
    }

    // 按列的聚合类型计算（sum/avg/max/min/count）；无 aggMap 时默认 sum（兼容旧行为）
    const aggMap = t.aggMap && typeof t.aggMap === 'object' ? t.aggMap : {}
    // 单次遍历所有行同时累加全部汇总列，避免 K 列 × N 行 的多次完整遍历。
    // sum/avg 共用累加器（avg = sum / 有效值个数）；max/min 在同一次遍历内比较；
    // count 统计非空值个数。聚合结果语义与旧的逐列 aggOf 完全一致。
    const aggs = {}        // key -> { sum, count, max, min, hasNum }
    for (const k of sumKeys) {
      aggs[k] = { sum: 0, count: 0, max: -Infinity, min: Infinity, nonEmpty: 0, hasNum: false }
    }
    const rows = this._rows || EMPTY_ROWS
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      for (let ki = 0; ki < sumKeys.length; ki++) {
        const k = sumKeys[ki]
        const raw = r[k]
        if (raw != null && raw !== '') aggs[k].nonEmpty++
        const v = Number(raw)
        if (Number.isFinite(v)) {
          const a = aggs[k]
          a.sum += v
          a.count++
          if (v > a.max) a.max = v
          if (v < a.min) a.min = v
          a.hasNum = true
        }
      }
    }
    const sums = {}
    for (const k of sumKeys) {
      const a = aggs[k]
      const agg = aggMap[k] || 'sum'
      switch (agg) {
        case 'avg':  sums[k] = a.count ? a.sum / a.count : 0; break
        case 'max':  sums[k] = a.hasNum ? a.max : 0; break
        case 'min':  sums[k] = a.hasNum ? a.min : 0; break
        case 'count': sums[k] = a.nonEmpty; break
        default:     sums[k] = a.sum
      }
    }
    const extra = typeof t.extra === 'function' ? t.extra(this._rows, sums) : null

    const row = { id: '__totals__', __cmxTotals: true }
    const firstKey = this._columns[0]?.key
    if (firstKey) row[firstKey] = (t.label || '合计') + (extra?.label ? `  ${extra.label}` : '')
    for (const k of sumKeys) row[k] = sums[k]
    this._setRevoProp('pinnedBottomSource', [row], JSON.stringify(row))
    /* RevoGrid 的 footer 分区(center)宽度有时不随 pinnedBottomSource 自动展开，
       只渲染出 row-header 区(仅序号列宽)。重新赋一次 columns 触发 footer 列区重算，
       让合计行铺满全表宽。用同实例数组避免误判为新列结构。 */
    if (Array.isArray(this._revoColumns) && this._revoColumns.length) {
      if (this._totalsColumnsRefreshPending) return
      this._totalsColumnsRefreshPending = true
      nextFrame(() => {
        this._totalsColumnsRefreshPending = false
        if (!this._revo) return
        const columns = this._columnsForViewport()
        this._setRevoProp('columns', columns, this._columnsSignature(columns))
      })
    }
  }

}
