/**
 * RevoGrid 属性写入 + 同步 mixin（G 组）。
 *
 * 从 cmx-revo-grid.js 拆出——带签名比对的 prop 赋值（避免无谓重渲）+ 列/数据/选项一次性同步。
 * _syncToRevo 是全组件的同步中枢：调用 A 组的 _applyRequiredMarks/_displaySource/_resolveReadonly/
 * _resolveTheme/_syncHostResizeObserver、B 组的 _columnsForViewport、D 组的 _scheduleMultiHeaderNormalize、
 * E 组的 _renderTotals——全部经 this 解析，Object.assign 后无静态依赖问题。
 */
import { getRegisteredGridEditors } from '../../lib/cmx-form-field-registry.js'
import { getFieldType } from '../../lib/cmx-form-field-registry.js'

/** 列类型注册表叠加：列命中 cmx-form-field-registry 类型时补 editor 名 + cellTemplate（无侵入：已有不覆盖）。 */
function applyRegisteredFieldTypesToColumns (columns) {
  if (!Array.isArray(columns) || !columns.length) return columns
  return columns.map((c) => {
    if (c && Array.isArray(c.children)) {
      return { ...c, children: applyRegisteredFieldTypesToColumns(c.children) }
    }
    const typeName = (c && (c._cmxType || (c._cmxCol && c._cmxCol.type))) || null
    if (!typeName) return c
    const def = getFieldType(typeName)
    if (!def || !def.grid) return c
    const patch = {}
    if (typeof def.grid.editor === 'function' && !c.editor) patch.editor = typeName
    if (typeof def.grid.cellTemplate === 'function' && !c.cellTemplate) patch.cellTemplate = def.grid.cellTemplate
    return Object.keys(patch).length ? { ...c, ...patch } : c
  })
}

export const revoGridSyncMixin = {
  _setRevoProp(name, value, signature = value) {
    if (!this._revo) return false
    const sigKey = `prop:${name}`
    const comparable = value == null || ['string', 'number', 'boolean'].includes(typeof value)
    const current = this._revoPropSigs[sigKey]
    const nextSig = comparable ? value : signature
    if (current === nextSig) return false
    if (Array.isArray(value) && value.length === 0 && Array.isArray(this._revo[name]) && this._revo[name].length === 0) {
      this._revoPropSigs[sigKey] = nextSig
      return false
    }
    if (comparable && this._revo[name] === value) {
      this._revoPropSigs[sigKey] = nextSig
      return false
    }
    this._revo[name] = value
    this._revoPropSigs[sigKey] = nextSig
    return true
  }
,
  /**
   * 计算列树的签名串（name/prop/size/min/max/readonly/有无模板）。
   * 函数类型的模板无法序列化，用布尔标记纳入签名，确保模板变化能被 _setRevoProp 捕获。
   * @param {object[]} cols
   * @returns {string}
   */
  _columnsSignature(cols) {
    const walk = (items) => (items || []).map((col) => {
      if (Array.isArray(col?.children) && col.children.length) {
        return {
          name: col.name,
          prop: col.prop,
          size: col.size,
          // columnTemplate/cellTemplate 等是函数无法序列化，用布尔标记纳入签名，
          // 否则仅模板变化（如 showRequiredMark 开关切换挂/卸必填标识）会被判定为无变化而跳过赋值。
          hasHeaderTpl: !!col.columnTemplate,
          hasCellTpl: !!col.cellTemplate,
          children: walk(col.children),
        }
      }
      return {
        name: col?.name,
        prop: col?.prop,
        size: col?.size,
        minSize: col?.minSize,
        maxSize: col?.maxSize,
        readonly: col?.readonly,
        pin: col?.pin,
        hasHeaderTpl: !!col?.columnTemplate,
        hasCellTpl: !!col?.cellTemplate,
      }
    })
    try { return JSON.stringify(walk(cols)) } catch (_) { return String(Date.now()) }
  }
,
  /** 序号列（rowHeaders）配置的签名：false / 空 / {name,size} 三态。 */
  _rowHeadersSignature(value) {
    if (value === false) return 'false'
    if (!value) return ''
    return `${value.name || ''}:${Number(value.size || 0)}`
  }
,
  /** 数据源签名：用于 _setRevoProp 同值跳过。
   *  只看版本号 + 行数 + minRows + 显示行数，不拼全表 id 串。
   *  - _assignSource 每次都自增 _sourceRevision，签名必变 → 一定会写入，不会被误跳过。
   *  - 选中态（__cmxRowClass）变化走 _syncSelection + refresh('all')，不走 _assignSource，
   *    因此签名里不必纳入行类标识。大数据量下省去 O(N) 字符串拼接与 GC 压力。 */
  _sourceSignature(rows) {
    const minR = this._opts.minRows ?? 0
    return `rev:${this._sourceRevision}:${this._rows?.length || 0}:${minR}:${rows?.length || 0}`
  }
,
  /** 自增 _sourceRevision 后，把 rows 经 _setRevoProp 赋给 revo-grid.source（带签名比对）。 */
  _assignSource(rows) {
    this._sourceRevision += 1
    this._setRevoProp('source', rows, this._sourceSignature(rows))
  }
,
  /**
   * 将当前列定义、数据源与选项一次性写入内部 revo-grid 实例。
   */
  _syncToRevo() {
    if (!this._revo) return

    // 重新合并注册表里的 grid.editor：覆盖晚于 grid 挂载才注册的字段类型（如 select/date/combo），
    // 确保列上 editor:'<type>' 始终能在 revo-grid.editors 中找到对应编辑器。
    this._revo.editors = { ...this._revo.editors, ...getRegisteredGridEditors() }

    // 注册表叠加：列若命中 cmx-form-field-registry 里的类型，则补 editor 名 + cellTemplate（无侵入：列已自带这些字段时不覆盖）
    this._revoColumns = applyRegisteredFieldTypesToColumns(this._revoColumns)

    // 冻结列与 stretch 共存：不再因有冻结列就强制关闭 stretch。
    // _columnsForViewport 会把冻结列按固定宽度扣除，主区列在剩余宽度内 stretch 铺满，
    // 兼顾"右侧冻结操作列 + 主区铺满屏幕"。需要精确宽度不拉伸时由调用方设 stretch:false。

    /* cmx-revo-grid 自己按比例分配剩余宽度；必须在 columns 赋值前关闭 RevoGrid 原生 stretch，
       避免其在 beforecolumnapplied 阶段把剩余宽度集中追加到最后一列。 */
    this._setRevoProp('stretch', false)
    /* 列宽手动拖动：revo-grid 的 resize prop 无 @Watch，变化后不会自动重渲表头，
       拖把（canResize=this.resize）在首次 header 渲染时确定。故必须在 columns 赋值前设置，
       且 resize 变化时清 columns 签名强制重赋 → 触发 header 重渲带上新 canResize。 */
    const resizeChanged = this._setRevoProp('resize', !!this._opts.resize)
    if (resizeChanged && this._revoPropSigs['prop:columns'] !== undefined) {
      delete this._revoPropSigs['prop:columns']
    }
    // 序号列会占用视口宽度，先设置 rowHeaders，再计算数据列可用宽度。
    let rowHeaders = false
    if (this._opts.showRowIndex) {
      rowHeaders = {
        name: this._opts.rowIndexLabel || '序号',
        size: this._opts.rowIndexWidth || 40,
        cellTemplate: (h, { rowIndex }) => h('span', {}, String(rowIndex + 1)),
      }
    }
    this._setRevoProp('rowHeaders', rowHeaders, this._rowHeadersSignature(rowHeaders))

    const columns = this._applyRequiredMarks(this._columnsForViewport())
    // 必填标识（columnTemplate）是纯视觉态，必须确保 revo 收到最新列定义。
    // _setRevoProp 的签名比对在 template 变化时可能因时序问题漏赋值，故 showRequiredMark 开启时
    // 强制直接赋值并刷新签名，绕过签名跳过逻辑。
    if (this._opts.showRequiredMark) {
      this._revo.columns = columns
      this._revoPropSigs['prop:columns'] = this._columnsSignature(columns)
    } else {
      this._setRevoProp('columns', columns, this._columnsSignature(columns))
    }
    const source = this._displaySource()
    this._setRevoProp('source', source, this._sourceSignature(source))
    this._setRevoProp('readonly', this._resolveReadonly())
    this._setRevoProp('theme', this._resolveTheme())
    this._setRevoProp('rowSize', this._opts.rowHeight)
    /* 数据行单元格的 line-height = rowHeight，让纯文本垂直居中。
       revo-grid 内置 .rgRow{line-height:27px} 太小；这里通过 CSS 变量驱动 _css() 里的规则。 */
    if (Number.isFinite(this._opts.rowHeight) && this._opts.rowHeight > 0) {
      this._revo.style.setProperty('--cmx-rg-row-h', `${this._opts.rowHeight}px`)
    } else {
      this._revo.style.removeProperty('--cmx-rg-row-h')
    }
    /* 表头行高：默认与数据行高一致（headerRowHeight 为 null 时取 rowHeight）；
       显式给数字时用该值。通过 CSS 变量驱动内置 _css() 里的 revogr-header / .header-rgRow 高度规则。 */
    {
      const hh = Number(this._opts.headerRowHeight) > 0
          ? Number(this._opts.headerRowHeight)
          : (Number(this._opts.rowHeight) > 0 ? Number(this._opts.rowHeight) : null)
      if (hh != null) this._revo.style.setProperty('--cmx-rg-header-h', `${hh}px`)
      else this._revo.style.removeProperty('--cmx-rg-header-h')
    }
    this._syncHostResizeObserver()
    // revo-grid 的 range 属性是"单元格区间选择 + autoFill"（Excel 式框选）。
    // 不能在 multi 模式自动启用：range=true 时 Shift 鼠标点击会被 onElementMouseDown
    // 走 focus(cell, true) 进 RangeArea 路径并启动 autoFill，既出现单元格蓝框，
    // 又劫持了 Shift，使本组件的行级 _selectRange 连选失效。行级多选完全由
    // selectionMode='multi' + _computeMultiSelection 在 JS 层实现，无需 revo-grid range。
    const range = !!this._opts.range
    if (range || this._revoPropSigs['prop:range'] !== undefined) this._setRevoProp('range', range)
    const disableVirtual = !this._opts.virtualScroll
    if (disableVirtual || this._revoPropSigs['prop:disableVirtualY'] !== undefined) {
      this._setRevoProp('disableVirtualY', disableVirtual)
      this._setRevoProp('disableVirtualX', disableVirtual)
    }
    // 当前行高亮：rowClass 属性名指向行数据中的 __cmxRowClass 字段
    this._setRevoProp('rowClass', '__cmxRowClass')

    this._renderTotals()
    this._scheduleMultiHeaderNormalize()
  }

}
