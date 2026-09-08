import { describe, it, expect } from 'vitest'
import { FIELD_SCHEMA, ENDS, fieldsFor, panelSectionsFor, inlineFieldsFor, placementOf } from '../cmx-field-schema.js'

describe('cmx-field-schema — 统一列定义 schema', () => {
  it('每个属性都声明 key/label/control/section/placement/appliesTo', () => {
    for (const f of FIELD_SCHEMA) {
      expect(f.key, JSON.stringify(f)).toBeTruthy()
      expect(f.label).toBeTruthy()
      expect(f.control).toBeTruthy()
      expect(f.section).toBeTruthy()
      // placement 可为字符串或 {end:placement} map
      const pl = typeof f.placement === 'object' ? Object.values(f.placement) : [f.placement]
      for (const p of pl) expect(['inline', 'panel', 'both']).toContain(p)
      expect(Array.isArray(f.appliesTo) && f.appliesTo.length).toBeTruthy()
    }
  })

  it('key 在每个端内唯一（同 key 不同端可共存，如 dataType/dimType）', () => {
    for (const end of [ENDS.DCT, ENDS.DOC, ENDS.FLC]) {
      const keys = FIELD_SCHEMA.filter((f) => f.appliesTo.includes(end)).map((f) => f.key)
      expect(new Set(keys).size, `端 ${end} 内 key 重复`).toBe(keys.length)
    }
  })

  // 命名统一不变式：同一种属性在三端只有一个名字，且一个名字只指向一个属性。
  it('key ↔ label 一一对应（同一属性一个名字，一个名字一个属性）', () => {
    const labelsOfKey = new Map()   // key   -> Set<label>
    const keysOfLabel = new Map()   // label -> Set<key>
    for (const f of FIELD_SCHEMA) {
      if (!labelsOfKey.has(f.key)) labelsOfKey.set(f.key, new Set())
      labelsOfKey.get(f.key).add(f.label)
      if (!keysOfLabel.has(f.label)) keysOfLabel.set(f.label, new Set())
      keysOfLabel.get(f.label).add(f.key)
    }
    // 每个 key 只有一个 label
    for (const [key, labels] of labelsOfKey) {
      expect([...labels].length, `key '${key}' 出现多个 label：${[...labels].join(' / ')}`).toBe(1)
    }
    // 每个 label 只对应一个 key
    for (const [label, keys] of keysOfLabel) {
      expect([...keys].length, `label '${label}' 对应多个 key：${[...keys].join(' / ')}`).toBe(1)
    }
  })

  it('DCT 内联列含基本字段（ID/Name/标题/类型/长度/可空）', () => {
    const keys = inlineFieldsFor(ENDS.DCT).map((f) => f.key)
    expect(keys).toEqual(expect.arrayContaining(['id', 'name', 'caption', 'dataType', 'fieldLength', 'nullable']))
    // DCT 不应出现 CTX 专有的 formula
    expect(keys).not.toContain('formula')
  })

  it('CTX 内联列：ID/Name/标题/数据类型(只读)；类型/录入控件/公式移到面板', () => {
    const keys = inlineFieldsFor(ENDS.FLC).map((f) => f.key)
    expect(keys).toEqual(expect.arrayContaining(['id', 'name', 'caption', 'dataType']))
    expect(keys).not.toContain('fieldLength')
    // 类型(dimType)/录入控件/公式/依赖 不在表格内联
    expect(keys).not.toContain('dimType')
    expect(keys).not.toContain('edit.mode')
    expect(keys).not.toContain('formula')
    expect(keys).not.toContain('dependsOn')
    // CTX dataType 表格内只读（enableWhen=false）
    const ctxDt = FIELD_SCHEMA.find((f) => f.key === 'dataType' && f.appliesTo.includes(ENDS.FLC))
    expect(ctxDt.enableWhen()).toBe(false)
  })
  it('DCT 详编分区含 引用字典/约束校验/数据治理/字段控制/显示/计算与带出/列布局', () => {
    const secs = panelSectionsFor(ENDS.DCT).map((s) => s.id)
    expect(secs).toEqual(expect.arrayContaining(['reference', 'constraint', 'governance', 'control']))
    // display/compute/flcLayout 均下沉为三端共享
    expect(secs).toContain('display')
    expect(secs).toContain('compute')
    expect(secs).toContain('flcLayout')
  })

  it('CTX 详编：共享区(基本/引用字典/编辑/约束校验/数据治理/字段控制/显示/计算与带出/列布局)', () => {
    const secs = panelSectionsFor(ENDS.FLC).map((s) => s.id)
    // 三端共享区，CTX 也继承
    expect(secs).toEqual(expect.arrayContaining(['basic', 'reference', 'edit', 'constraint', 'governance', 'control', 'display', 'compute', 'flcLayout']))
    expect(secs).not.toContain('advanced')
  })

  it('DCT/DOC 详编含 compute(formula/dependsOn/unitField) + flcLayout(width/frozen/visible)，agg 三端统一', () => {
    for (const e of [ENDS.DCT, ENDS.DOC]) {
      const keys = fieldsFor(e, 'panel').map((f) => f.key)
      // compute 三端共享部分
      expect(keys).toContain('formula')
      expect(keys).toContain('dependsOn')
      expect(keys).toContain('unitField')
      // source.*/defaultFrom.* 仍 FLC 独有
      expect(keys).not.toContain('source.dimension')
      expect(keys).not.toContain('defaultFrom.attribute')
      // flcLayout 三端共享（扁平 key，无 column. 前缀）
      expect(keys).toContain('width')
      expect(keys).toContain('frozen')
      expect(keys).toContain('visible')
      // column.* 旧嵌套 key 已消除
      expect(keys).not.toContain('column.width')
      expect(keys).not.toContain('column.agg')
      // agg 三端统一在 constraint（不再有 flcLayout 的 column.agg 冗余）
      expect(keys).toContain('agg')
    }
  })

  it('fieldsFor 按端过滤 + placement 过滤', () => {
    const ctxPanel = fieldsFor(ENDS.FLC, 'panel').map((f) => f.key)
    expect(ctxPanel).toContain('display.mode')
    expect(ctxPanel).toContain('edit.mode') // CTX 录入控件在详编面板
    expect(ctxPanel).toContain('formula')  // CTX 公式在详编面板
  })

  it('录入控件 edit.mode 在三端详编面板都出现', () => {
    expect(fieldsFor(ENDS.DCT, 'panel').map((f) => f.key)).toContain('edit.mode')
    expect(fieldsFor(ENDS.DOC, 'panel').map((f) => f.key)).toContain('edit.mode')
    expect(fieldsFor(ENDS.FLC, 'panel').map((f) => f.key)).toContain('edit.mode')
    const em = FIELD_SCHEMA.find((f) => f.key === 'edit.mode')
    expect(placementOf(em, ENDS.FLC)).toBe('panel')
    expect(placementOf(em, ENDS.DCT)).toBe('panel')
  })

  it('refDict 三件套（引用字典/引用字段/显示字段）三端统一出现', () => {
    for (const e of [ENDS.DCT, ENDS.DOC, ENDS.FLC]) {
      const keys = fieldsFor(e, 'panel').map((f) => f.key)
      expect(keys).toEqual(expect.arrayContaining(['refDict', 'refField', 'displayField']))
    }
  })

  it('CTX 继承字典/单据的约束·治理·字段控制属性', () => {
    const keys = fieldsFor(ENDS.FLC, 'panel').map((f) => f.key)
    expect(keys).toEqual(expect.arrayContaining(['defaultValue', 'unique', 'pattern', 'enumValues'])) // 约束
    expect(keys).toEqual(expect.arrayContaining(['label', 'searchable', 'filterable', 'sensitive', 'i18n'])) // 治理
    expect(keys).toContain('edit.requiredWhen') // 字段控制统一
  })

  it('display 数值属性按 display.mode 联动显隐', () => {
    // 纯数值属性：text/badge/link/icon 模式隐藏，''/number 模式显示
    const numProps = ['display.decimalDigits', 'display.thousandSeparator', 'display.zeroAsBlank', 'display.negativeColor']
    const visOf = (row, key) => {
      const f = FIELD_SCHEMA.find((x) => x.key === key)
      return f.visibleWhen ? f.visibleWhen(row, {}) : true
    }
    // 未选 mode（缺省）→ 数值属性全显（让用户能看到可选项）
    const noMode = { display: {} }
    for (const k of numProps) expect(visOf(noMode, k)).toBe(true)
    // number 模式 → 数值属性全显
    const numMode = { display: { mode: 'number' } }
    for (const k of numProps) expect(visOf(numMode, k)).toBe(true)
    // text 模式 → 纯数值属性全隐（原样字符串，无需小数位/千分位）
    const textMode = { display: { mode: 'text' } }
    for (const k of numProps) expect(visOf(textMode, k)).toBe(false)
    // badge/link/icon 模式 → 纯数值属性全隐
    for (const m of ['badge', 'link', 'icon']) {
      const row = { display: { mode: m } }
      for (const k of numProps) expect(visOf(row, k)).toBe(false)
    }
    // display.format 是通用预设（thousands/percent/currency/date/datetime），
    // 在 ''/number/text 模式都可见（text 模式用于日期/时间字段的日期格式化）
    for (const row of [noMode, numMode, textMode]) {
      expect(visOf(row, 'display.format')).toBe(true)
    }
    for (const m of ['badge', 'link', 'icon']) {
      expect(visOf({ display: { mode: m } }, 'display.format')).toBe(false)
    }
    // display.format 为「下拉+文本框」复合控件（select-text），options 按 display.mode 动态分组：
    //   number/缺省 → 千分位/百分比/货币（货币符号可在文本框手改成 $/€ 等）
    //   text → 日期/时间各档格式（不可编辑时间字段走这里；任意格式可在文本框手改）
    const fmtDef = FIELD_SCHEMA.find((x) => x.key === 'display.format')
    expect(fmtDef.control).toBe('select-text')
    const numFmt = fmtDef.options({}, numMode).map((o) => o.value)
    const textFmt = fmtDef.options({}, textMode).map((o) => o.value)
    expect(numFmt).toEqual(expect.arrayContaining(['', 'thousands', 'percent', 'currency:¥']))
    expect(numFmt).not.toContain('date:YYYY-MM-DD')   // number 不给日期选项
    expect(textFmt).toEqual(expect.arrayContaining(['', 'date:YYYY-MM-DD', 'datetime:YYYY-MM-DD HH:mm:ss']))
    expect(textFmt).not.toContain('percent')           // text 不给数值选项
    // align 与 mode 无关，始终显示
    for (const row of [noMode, numMode, textMode, { display: { mode: 'badge' } }]) {
      expect(visOf(row, 'display.align')).toBe(true)
    }
  })
})
