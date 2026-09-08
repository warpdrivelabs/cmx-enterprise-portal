/**
 * FlexibleCombination validator — generic diagnostics for context combination metadata.
 *
 * The validator is intentionally domain-neutral. Account auxiliary accounting,
 * transaction detail combinations, project combinations and anchor tuples all use the
 * same schema checks here.
 */
import { compileFormula } from './formula-eval.js'
import { fieldId } from './cmx-field-meta.js'

// 统一维度语义值域（dimType）：dimension/measure/attribute/relation（含空=无语义）
const FIELD_KINDS = new Set(['dimension', 'attribute', 'measure', 'relation', ''])

// 附加属性枚举（与 CmxColumn / CmxColumnGroup / CmxColumnModel 对齐；仅校验取值合法性，
// 不限制未知键，保证元模型向前兼容、零代码扩展。）
const COLUMN_TYPES = new Set(['text', 'number', 'date', 'boolean', 'select', 'ref', 'combo', 'dict-select'])
const COLUMN_ALIGNS = new Set(['left', 'center', 'right'])
const COLUMN_AGGS = new Set(['sum', 'count', 'avg', 'max', 'min'])
const DISPLAY_MODES = new Set(['text', 'badge', 'link', 'icon'])
const EDIT_MODES = new Set(['cmx-text-input', 'cmx-textarea-input', 'cmx-richtext-input', 'cmx-number-input', 'cmx-date-input', 'cmx-datetime-input', 'select', 'ref', 'combo', 'ignite-combo', 'cmx-dict-select', 'checkbox', 'image', 'video', 'readonly', 'none', 'computed', 'tree-ref'])
const GROUP_AGG_KEYS = new Set(['sum', 'avg', 'max', 'min', 'count'])
const GROUP_AGG_POSITIONS = new Set(['before', 'after'])

export function validateFlexibleCombination (combination = {}) {
  const diagnostics = { valid: true, errors: [], warnings: [] }
  const error = (path, code, message) => diagnostics.errors.push({ path, code, message })
  const warn = (path, code, message) => diagnostics.warnings.push({ path, code, message })

  if (!combination || typeof combination !== 'object') {
    error('', 'COMBINATION_OBJECT_REQUIRED', 'FlexibleCombination 必须是对象')
    return finish(diagnostics)
  }

  const dimensions = combination.dimensions
  const rules = combination.rules
  if (!dimensions || typeof dimensions !== 'object' || Array.isArray(dimensions)) {
    error('dimensions', 'DIMENSIONS_REQUIRED', '缺少 dimensions 对象')
  }
  if (!Array.isArray(rules)) {
    error('rules', 'RULES_REQUIRED', '缺少 rules 数组')
  }
  if (diagnostics.errors.length) return finish(diagnostics)

  const dimCodes = new Set(Object.keys(dimensions))
  if (!dimCodes.size) warn('dimensions', 'NO_DIMENSIONS', '未定义任何上下文维度')

  for (const [dimCode, dim] of Object.entries(dimensions)) {
    const base = `dimensions.${dimCode}`
    if (!dim || typeof dim !== 'object') {
      error(base, 'DIMENSION_OBJECT_REQUIRED', '维度定义必须是对象')
      continue
    }
    if (!dim.name && !dim.caption) warn(base, 'DIMENSION_NAME_MISSING', `维度 ${dimCode} 未设置 name/caption`)
    if (dim.attributes != null && !Array.isArray(dim.attributes) && typeof dim.attributes !== 'object') {
      error(`${base}.attributes`, 'DIMENSION_ATTRIBUTES_INVALID', 'attributes 必须是数组或对象')
    }
    if (dim.values != null && !Array.isArray(dim.values)) {
      error(`${base}.values`, 'DIMENSION_VALUES_INVALID', 'values 必须是数组')
    }
  }

  const combinationAnchorDims = Array.isArray(combination.anchorDimensions) ? combination.anchorDimensions : []
  // 档案级 anchorDimensions：锚点维度，须在 dimensions 中定义
  combinationAnchorDims.forEach((d, i) => {
    if (!dimCodes.has(d)) error(`anchorDimensions.${i}`, 'ANCHOR_DIMENSION_UNKNOWN', `锚点维度 ${d} 未在 dimensions 中定义`)
  })

  // 模型级附加属性（combination.columnModel）—— 整份档案编译出的 CmxColumnModel 属性
  validateColumnModelProps(combination.columnModel, 'columnModel', error, warn)

  const ruleIds = new Set()
  rules.forEach((rule, ruleIndex) => {
    const rPath = `rules.${ruleIndex}`
    if (!rule || typeof rule !== 'object') {
      error(rPath, 'RULE_OBJECT_REQUIRED', '规则必须是对象')
      return
    }
    if (!rule.id) warn(`${rPath}.id`, 'RULE_ID_MISSING', '规则未设置 id')
    else if (ruleIds.has(rule.id)) error(`${rPath}.id`, 'RULE_ID_DUPLICATE', `规则 id 重复：${rule.id}`)
    else ruleIds.add(rule.id)

    // anchor.dimensions：锚点维度，须在 dimensions 中定义
    const anchorDims = Array.isArray(rule.anchor?.dimensions) ? rule.anchor.dimensions : combinationAnchorDims
    anchorDims.forEach((d, i) => {
      if (!dimCodes.has(d)) error(`${rPath}.anchor.dimensions.${i}`, 'ANCHOR_DIMENSION_UNKNOWN', `锚点维度 ${d} 未在 dimensions 中定义`)
    })
    // anchor.columns：锚点列（规则所在表的列）→ 仅校验为非空字符串
    const anchorCols = Array.isArray(rule.anchor?.columns) ? rule.anchor.columns : []
    anchorCols.forEach((c, i) => {
      if (typeof c !== 'string' || !c.trim()) error(`${rPath}.anchor.columns.${i}`, 'ANCHOR_COLUMN_INVALID', `锚点列必须是非空字符串`)
    })
    if (!anchorDims.length && !anchorCols.length) warn(`${rPath}.anchor`, 'ANCHOR_EMPTY', '规则未声明锚点维度/列，解析时只能作为兜底规则')
    // match 的键可用：锚点列、锚点维度本身、以及锚点维度的属性列（维度面板 attributes，记为 维度.属性）
    const validMatchKeys = [...anchorCols, ...anchorDims]
    for (const d of anchorDims) {
      const dim = dimensions[d]
      const attrs = Array.isArray(dim?.attributes) ? dim.attributes : (dim?.attributes && typeof dim.attributes === 'object' ? Object.keys(dim.attributes) : [])
      for (const a of attrs) validMatchKeys.push(`${d}.${a}`)
    }
    checkMatchObject(rule.anchor?.match, `${rPath}.anchor.match`, validMatchKeys, error)

    // 规则级附加属性（rule.columnModel 覆盖 combination.columnModel）
    validateColumnModelProps(rule.columnModel, `${rPath}.columnModel`, error, warn)

    // overlay 形态（use:"*" / pick[]）在编译期展开为 fields，结构上不要求 detail.fields；
    // 三入口至少有其一即可。纯 inline 规则仍要求 fields 为数组。
    const hasOverlay = rule.detail?.use != null || Array.isArray(rule.detail?.pick)
    const fields = Array.isArray(rule.detail?.fields) ? rule.detail.fields : []
    if (!hasOverlay && !Array.isArray(rule.detail?.fields)) {
      error(`${rPath}.detail.fields`, 'FIELDS_REQUIRED', '规则缺少 detail.fields 数组（或改用 overlay 的 use/pick）')
    }
    validateFields(fields, rPath, dimensions, dimCodes, error, warn)
    // 分组成员存在性依赖展开后的字段：overlay 规则跳过（成员由 ref 展开后产生，
    // 由 diagnoseReferences/编译期保证），纯 inline 规则照常校验。
    if (!hasOverlay) validateGroups(rule.detail?.groups, fields, rPath, error, warn)
  })

  return finish(diagnostics)
}

export function previewFlexibleCombination (combination = {}, { anchor = {}, sampleRows = [] } = {}) {
  const diagnostics = validateFlexibleCombination(combination)
  const rows = Array.isArray(sampleRows) ? sampleRows : []
  return { diagnostics, anchor, sampleRows: rows }
}

function validateFields (fields, rPath, dimensions, dimCodes, error, warn) {
  const fieldCodes = new Set()
  const computed = []

  fields.forEach((field, fieldIndex) => {
    const fPath = `${rPath}.detail.fields.${fieldIndex}`
    if (!field || typeof field !== 'object') {
      error(fPath, 'FIELD_OBJECT_REQUIRED', '字段必须是对象')
      return
    }
    const id = fieldId(field)
    if (!id) {
      error(`${fPath}.id`, 'FIELD_CODE_REQUIRED', '字段缺少 id')
    } else if (fieldCodes.has(id)) {
      error(`${fPath}.id`, 'FIELD_CODE_DUPLICATE', `字段 id 重复：${id}`)
    } else {
      fieldCodes.add(id)
    }
    if (field.dimType && !FIELD_KINDS.has(field.dimType)) {
      warn(`${fPath}.dimType`, 'FIELD_KIND_UNKNOWN', `未知字段 dimType：${field.dimType}`)
    }

    if (field.dimType === 'dimension') {
      const dimCode = field.refDict || id
      if (!dimCodes.has(dimCode)) error(`${fPath}.refDict`, 'FIELD_DIMENSION_UNKNOWN', `字段引用的维度 ${dimCode} 未定义`)
    }
    if (field.source?.dimension) {
      if (!dimCodes.has(field.source.dimension)) error(`${fPath}.source.dimension`, 'SOURCE_DIMENSION_UNKNOWN', `source.dimension ${field.source.dimension} 未定义`)
      else if (field.source.attribute && !hasDimensionAttribute(dimensions[field.source.dimension], field.source.attribute)) {
        warn(`${fPath}.source.attribute`, 'SOURCE_ATTRIBUTE_NOT_DECLARED', `维度 ${field.source.dimension} 未声明属性 ${field.source.attribute}`)
      }
    }
    if (field.defaultFrom?.dimension) {
      if (!dimCodes.has(field.defaultFrom.dimension)) error(`${fPath}.defaultFrom.dimension`, 'DEFAULT_DIMENSION_UNKNOWN', `defaultFrom.dimension ${field.defaultFrom.dimension} 未定义`)
      else if (field.defaultFrom.attribute && !hasDimensionAttribute(dimensions[field.defaultFrom.dimension], field.defaultFrom.attribute)) {
        warn(`${fPath}.defaultFrom.attribute`, 'DEFAULT_ATTRIBUTE_NOT_DECLARED', `维度 ${field.defaultFrom.dimension} 未声明属性 ${field.defaultFrom.attribute}`)
      }
    }
    if (field.formula) {
      computed.push(field)
      try { compileFormula(field.formula) } catch (err) {
        error(`${fPath}.formula`, 'FORMULA_INVALID', err?.message || `公式无效：${field.formula}`)
      }
    }
    if (Array.isArray(field.dependsOn)) {
      field.dependsOn.forEach((dep, depIndex) => {
        if (!fieldCodes.has(dep) && !fields.some((f) => fieldId(f) === dep)) {
          error(`${fPath}.dependsOn.${depIndex}`, 'DEPENDENCY_UNKNOWN', `依赖字段 ${dep} 不存在`)
        }
      })
    }
    if (Array.isArray(field.validations)) {
      field.validations.forEach((rule, validationIndex) => {
        if (!rule?.expr) {
          error(`${fPath}.validations.${validationIndex}.expr`, 'VALIDATION_EXPR_REQUIRED', '校验规则缺少 expr')
        } else {
          try { compileFormula(rule.expr) } catch (err) {
            error(`${fPath}.validations.${validationIndex}.expr`, 'VALIDATION_EXPR_INVALID', err?.message || `校验公式无效：${rule.expr}`)
          }
        }
      })
    }

    // 列级附加属性（扁平 key：agg/frozen/visible/width/display/edit）—— 透传到编译出的 CmxColumn。
    validateColumnProps(field, fPath, error, warn)
  })

  detectFormulaCycles(computed, rPath, error)
}

function validateGroups (groups, fields, rPath, error, warn) {
  if (groups == null) return
  if (!Array.isArray(groups)) {
    error(`${rPath}.detail.groups`, 'GROUPS_ARRAY_REQUIRED', 'groups 必须是数组')
    return
  }
  const fieldCodes = new Set(fields.map((f) => fieldId(f)).filter(Boolean))
  const seen = new Set()
  const walk = (node, path) => {
    if (!node || typeof node !== 'object') {
      error(path, 'GROUP_OBJECT_REQUIRED', '分组节点必须是对象')
      return
    }
    if (!Array.isArray(node.members)) {
      error(`${path}.members`, 'GROUP_MEMBERS_REQUIRED', '分组缺少 members 数组')
      return
    }
    // 分组级附加属性（CmxColumnGroup.aggregate / aggregatePosition）
    validateGroupProps(node, path, error, warn)
    node.members.forEach((member, index) => {
      const mPath = `${path}.members.${index}`
      if (typeof member === 'string') {
        if (!fieldCodes.has(member)) error(mPath, 'GROUP_FIELD_UNKNOWN', `分组引用了不存在的字段 ${member}`)
        else if (seen.has(member)) warn(mPath, 'GROUP_FIELD_DUPLICATE', `字段 ${member} 被多个分组引用，将只使用首次出现`)
        else seen.add(member)
      } else {
        walk(member, mPath)
      }
    })
  }
  groups.forEach((g, i) => walk(g, `${rPath}.detail.groups.${i}`))
}

function checkMatchObject (match, path, validKeys, error) {
  if (match == null) return
  if (typeof match !== 'object' || Array.isArray(match)) {
    error(path, 'MATCH_OBJECT_REQUIRED', 'anchor.match 必须是对象')
    return
  }
  const keySet = new Set(validKeys)
  for (const [dim, cond] of Object.entries(match)) {
    // match 的键必须是：锚点列、锚点维度、或锚点维度的属性列（维度.属性）
    if (keySet.size && !keySet.has(dim)) error(`${path}.${dim}`, 'MATCH_KEY_NOT_IN_ANCHOR', `匹配列 ${dim} 不在锚点列、锚点维度或其属性列中`)
    if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
      const ops = Object.keys(cond).filter((k) => k.startsWith('$'))
      const attrs = Object.keys(cond).filter((k) => !k.startsWith('$'))
      if (ops.length && attrs.length) error(`${path}.${dim}`, 'MATCH_OPERATOR_MIXED', '匹配条件不能同时混用操作符和属性条件')
    }
  }
}

// ─── 附加属性校验（未知键放行，仅校验取值合法性） ─────────────────────

/**
 * 列级附加属性（扁平 key：agg/width/frozen/visible/display/edit）—— 透传到编译出的 CmxColumn。
 * 直接校验字段对象本身（扁平化后字段即列），仅校验已知键取值合法性，未知键一律放行。
 */
function validateColumnProps (column, path, error, warn) {
  if (column == null) return
  if (typeof column !== 'object' || Array.isArray(column)) {
    error(path, 'COLUMN_OBJECT_REQUIRED', '字段定义必须是对象')
    return
  }
  if (column.type != null && !COLUMN_TYPES.has(column.type)) {
    warn(`${path}.type`, 'COLUMN_TYPE_UNKNOWN', `未知列类型：${column.type}`)
  }
  if (column.agg != null && !COLUMN_AGGS.has(column.agg)) {
    error(`${path}.agg`, 'COLUMN_AGG_INVALID', `agg 必须是 sum/count/avg/max/min，实际：${column.agg}`)
  }
  // frozen 支持左/右冻结：空串(无)/'left'/'right'/布尔(旧兼容，true=left)
  if (column.frozen != null && column.frozen !== '' && column.frozen !== 'left' && column.frozen !== 'right' && typeof column.frozen !== 'boolean') {
    error(`${path}.frozen`, 'COLUMN_FROZEN_INVALID', `frozen 必须是 ''/'left'/'right' 或布尔(旧兼容)，实际：${column.frozen}`)
  }
  if (column.visible != null && typeof column.visible !== 'boolean') {
    error(`${path}.visible`, 'COLUMN_VISIBLE_INVALID', 'visible 必须是布尔值')
  }
  if (column.width != null && typeof column.width !== 'string' && typeof column.width !== 'number' && typeof column.width !== 'object') {
    error(`${path}.width`, 'COLUMN_WIDTH_INVALID', 'width 必须是字符串/数字/对象')
  }
  if (column.display != null) {
    if (typeof column.display !== 'object' || Array.isArray(column.display)) {
      error(`${path}.display`, 'COLUMN_DISPLAY_INVALID', 'display 必须是对象')
    } else {
      if (column.display.align != null && !COLUMN_ALIGNS.has(column.display.align)) {
        error(`${path}.display.align`, 'COLUMN_DISPLAY_ALIGN_INVALID', 'display.align 必须是 left/center/right')
      }
      if (column.display.mode != null && !DISPLAY_MODES.has(column.display.mode)) {
        warn(`${path}.display.mode`, 'COLUMN_DISPLAY_MODE_UNKNOWN', `未知 display.mode：${column.display.mode}`)
      }
      if (column.display.cellStyle != null && !Array.isArray(column.display.cellStyle)) {
        error(`${path}.display.cellStyle`, 'COLUMN_CELLSTYLE_INVALID', 'display.cellStyle 必须是数组')
      } else if (Array.isArray(column.display.cellStyle)) {
        column.display.cellStyle.forEach((rule, i) => {
          if (rule && rule.when) {
            try { compileFormula(rule.when) } catch (err) {
              error(`${path}.display.cellStyle.${i}.when`, 'COLUMN_CELLSTYLE_WHEN_INVALID', err?.message || `条件表达式无效：${rule.when}`)
            }
          }
        })
      }
    }
  }
  if (column.edit != null) {
    if (typeof column.edit !== 'object' || Array.isArray(column.edit)) {
      error(`${path}.edit`, 'COLUMN_EDIT_INVALID', 'edit 必须是对象')
    } else {
      if (column.edit.mode != null && !EDIT_MODES.has(column.edit.mode)) {
        warn(`${path}.edit.mode`, 'COLUMN_EDIT_MODE_UNKNOWN', `未知 edit.mode：${column.edit.mode}`)
      }
      for (const [key, expr] of [['requiredWhen', column.edit.requiredWhen], ['readonlyWhen', column.edit.readonlyWhen], ['validateWhen', column.edit.validateWhen]]) {
        if (expr) {
          try { compileFormula(expr) } catch (err) {
            error(`${path}.edit.${key}`, 'COLUMN_EDIT_EXPR_INVALID', err?.message || `${key} 表达式无效：${expr}`)
          }
        }
      }
    }
  }
}

/**
 * 分组级附加属性 CmxColumnGroup.aggregate / aggregatePosition。
 */
function validateGroupProps (node, path, error, warn) {
  if (node.aggregate != null) {
    if (typeof node.aggregate !== 'object' || Array.isArray(node.aggregate)) {
      error(`${path}.aggregate`, 'GROUP_AGGREGATE_INVALID', 'aggregate 必须是对象，如 { sum:true }')
    } else {
      for (const [k, v] of Object.entries(node.aggregate)) {
        if (!GROUP_AGG_KEYS.has(k)) warn(`${path}.aggregate.${k}`, 'GROUP_AGGREGATE_KEY_UNKNOWN', `未知聚合类型：${k}（支持 sum/avg/max/min/count）`)
        else if (typeof v !== 'boolean') error(`${path}.aggregate.${k}`, 'GROUP_AGGREGATE_VALUE_INVALID', `aggregate.${k} 必须是布尔值`)
      }
    }
  }
  if (node.aggregatePosition != null && !GROUP_AGG_POSITIONS.has(node.aggregatePosition)) {
    error(`${path}.aggregatePosition`, 'GROUP_AGGREGATE_POSITION_INVALID', `aggregatePosition 必须是 before/after，实际：${node.aggregatePosition}`)
  }
}

/**
 * 模型级附加属性 combination.columnModel / rule.columnModel —— 合并为 CmxColumnModel 属性。
 */
function validateColumnModelProps (cm, path, error, _warn) {
  if (cm == null) return
  if (typeof cm !== 'object' || Array.isArray(cm)) {
    error(path, 'COLUMN_MODEL_OBJECT_REQUIRED', 'columnModel 必须是对象')
    return
  }
  for (const key of ['caption', 'datasetId', 'toTitleCols', 'iconCol']) {
    if (cm[key] != null && typeof cm[key] !== 'string') {
      error(`${path}.${key}`, 'COLUMN_MODEL_FIELD_INVALID', `columnModel.${key} 必须是字符串`)
    }
  }
}

function hasDimensionAttribute (dim, attr) {
  if (!dim || !attr) return true
  if (Array.isArray(dim.attributes)) return dim.attributes.includes(attr)
  if (dim.attributes && typeof dim.attributes === 'object') return Object.prototype.hasOwnProperty.call(dim.attributes, attr)
  return false
}

function detectFormulaCycles (computed, rPath, error) {
  const byCode = new Map(computed.map((f) => [fieldId(f), f]).filter(([id]) => id))
  const visiting = new Set()
  const visited = new Set()
  const stack = []
  const visit = (field) => {
    const id = fieldId(field)
    if (!id || visited.has(id)) return
    if (visiting.has(id)) {
      const start = stack.indexOf(id)
      const cycle = [...stack.slice(Math.max(0, start)), id].join(' -> ')
      error(`${rPath}.detail.fields.${id}.dependsOn`, 'FORMULA_DEPENDENCY_CYCLE', `计算公式存在循环依赖：${cycle}`)
      return
    }
    visiting.add(id)
    stack.push(id)
    for (const dep of (field.dependsOn || [])) {
      if (byCode.has(dep)) visit(byCode.get(dep))
    }
    stack.pop()
    visiting.delete(id)
    visited.add(id)
  }
  computed.forEach(visit)
}

function finish (diagnostics) {
  diagnostics.valid = diagnostics.errors.length === 0
  return diagnostics
}
