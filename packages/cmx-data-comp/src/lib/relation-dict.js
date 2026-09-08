/**
 * relation-dict — 关系字典（dictKind='RELATION'）的编译 / 诊断 / 骨架（领域无关、纯函数，编辑器侧）
 *
 * 详见 docs/relation-dict-completion-design.md。关系字典把「主字典（分组）的节点」与「辅字典（业务）
 * 的条目」多对多地关联起来：一行 = 「某主节点 ⊇ 某辅条目」。
 *
 * 设计要点：
 *   - 主辅绑定不散在 fieldRefDicts，而由 dictMeta.relation 显式声明（单一事实源、可校验、可驱动 UI）。
 *   - relation 是「作者可读的高层声明」；编译期展开为 relationCommonFields 两个 dimension 槽（master_id /
 *     aux_id）的字段级 refDict——复用现有 fieldOverrides 全链路，不新造运行机制。
 *   - 编译产物是 fieldOverrides delta，交 materializeTable 物化；因用正确槽位键，从根上避免
 *     OVERRIDE_FIELD_NOT_FOUND（消除设计文档 G1）。
 *
 * 主要 API：
 *   RELATION_KIND / RELATION_FIELDSET / RELATION_SLOTS   常量
 *   isRelationDict(table)                                 -> boolean
 *   compileRelationOverrides(table)                       -> { fieldOverrides }（relation → 两槽 refDict）
 *   applyRelationCompile(table)                            -> table'（把编译产物并入 fieldOverrides）
 *   diagnoseRelation(table, { resolveDict })              -> { errors, warnings, valid }
 *   newRelationDict({ dictCode, dictName })               -> 新建关系字典骨架
 *   migrateLegacyRelation(table)                           -> table'（旧 fieldRefDicts → relation，删旧键）
 */
import { deepMerge } from './flc-overlay.js'
import { effectiveDictId } from './drn.js'

/** 关系字典的 dictKind 值。 */
export const RELATION_KIND = 'RELATION'
/** 关系公共字段集名（定义在 base_dct_meta_v1.json）。 */
export const RELATION_FIELDSET = 'relationCommonFields'

/**
 * relationCommonFields 的两个 dimension 槽 + 各自冗余的 code/name 列（中性命名 master_/aux_ 前缀）。
 * idField 是绑字典的挂载点（dimType='dimension'）；valueField/labelField 落到 code/name 冗余列。
 */
export const RELATION_SLOTS = Object.freeze({
  master: Object.freeze({ idField: 'master_id', codeField: 'master_code', nameField: 'master_name' }),
  auxiliary: Object.freeze({ idField: 'aux_id', codeField: 'aux_code', nameField: 'aux_name' }),
})

/** 本模块支持的基数（先只多对多；一对多/一对一后置，见设计文档 §10.3）。 */
export const RELATION_CARDINALITY_DEFAULT = 'many-to-many'

/** dictKind 归一取值。 */
function kindOf (table) {
  return String(table?.dictMeta?.dictKind || '').toUpperCase()
}

/** 该表是否关系字典。 */
export function isRelationDict (table) {
  return kindOf(table) === RELATION_KIND
}

/** 读 relation 声明（非对象→null）。 */
function relationOf (table) {
  const r = table?.dictMeta?.relation
  return r && typeof r === 'object' ? r : null
}

/**
 * 把 relation 的一端（master/auxiliary）编译成对应槽位的字段级覆盖。
 * @param {object} side   relation.master 或 relation.auxiliary
 * @param {object} slot   RELATION_SLOTS.master 或 .auxiliary
 * @param {object} [ctx]  { from, imports } 供 DRN 归一
 * @returns {object|null} { [idField]: { refDict, refField, displayField } } | null（未配 dict）
 */
function compileSide (side, slot, ctx) {
  const dict = side && typeof side === 'object' ? String(side.dict || '').trim() : ''
  if (!dict) return null
  const refDict = effectiveDictId(dict, ctx || {})
  const ov = { refDict }
  // valueField → 字典侧作为 key 的列（落到 refField）；labelField → 展示列（落到 displayField）。
  if (side.valueField) ov.refField = String(side.valueField)
  if (side.labelField) ov.displayField = String(side.labelField)
  return { [slot.idField]: ov }
}

/**
 * 编译 dictMeta.relation → relationCommonFields 两个 dimension 槽的字段级覆盖（fieldOverrides 形态）。
 * 非关系字典 / 无 relation → 返回空覆盖（恒等，安全无副作用）。
 * @param {object} table  字典表对象
 * @param {object} [ctx]  { from, imports } 供 DRN 跨 DAM 归一
 * @returns {{ fieldOverrides: object }}
 */
export function compileRelationOverrides (table, ctx) {
  const out = {}
  if (!isRelationDict(table)) return { fieldOverrides: out }
  const rel = relationOf(table)
  if (!rel) return { fieldOverrides: out }
  const m = compileSide(rel.master, RELATION_SLOTS.master, ctx)
  const a = compileSide(rel.auxiliary, RELATION_SLOTS.auxiliary, ctx)
  if (m) Object.assign(out, m)
  if (a) Object.assign(out, a)
  return { fieldOverrides: out }
}

/**
 * 把 relation 编译产物并入表的 fieldOverrides（作者手填的覆盖优先，故 relation 编译为低优先底铺）。
 * 产出新表副本（不改入参）；无编译产物时返回原表。
 * @param {object} table
 * @param {object} [ctx]
 * @returns {object} 新表
 */
export function applyRelationCompile (table, ctx) {
  const { fieldOverrides } = compileRelationOverrides(table, ctx)
  if (!Object.keys(fieldOverrides).length) return table
  const existing = table.fieldOverrides && typeof table.fieldOverrides === 'object' ? table.fieldOverrides : {}
  // relation 编译（底）⊕ 手填覆盖（顶）：手填优先，relation 只补 refDict 挂载。
  return { ...table, fieldOverrides: deepMerge(fieldOverrides, existing) }
}

// ─── 诊断（编辑器保存期 + 校验，与 field-override diagnoseTableOverrides 同构） ────────────

/**
 * 关系字典诊断。
 * @param {object} table
 * @param {object} [opts]
 * @param {(dictCode:string)=>boolean} [opts.resolveDict]  判定主/辅字典是否可解析（存在/可见）；缺省不判存在性
 * @param {(setName:string)=>object[]} [opts.resolveSetFields]  取 fieldSet 字段（判槽位是否在 relationCommonFields）
 * @param {(table:object)=>string[]} [opts.listSetNames]  取该表引用的 fieldSet 名
 * @returns {{errors:{path,code,message}[], warnings:{path,code,message}[], valid:boolean}}
 */
export function diagnoseRelation (table, opts = {}) {
  const errors = []; const warnings = []
  if (!isRelationDict(table)) return { errors, warnings, valid: true }
  const tableId = table.dictMeta?.dictCode || table.dictMeta?.tableName || table.tableName || '关系字典'
  const P = `${tableId}.dictMeta.relation`
  const rel = relationOf(table)
  const { resolveDict, resolveSetFields, listSetNames } = opts

  // G(缺骨架)：RELATION 字典未引用 relationCommonFields
  const setNames = (typeof listSetNames === 'function' ? (listSetNames(table) || []) : [])
  if (typeof listSetNames === 'function' && !setNames.includes(RELATION_FIELDSET)) {
    warnings.push({ path: `${tableId}.extraFieldSets`, code: 'RELATION_FIELDSET_NOT_REFERENCED', message: `关系字典未引用 ${RELATION_FIELDSET}，缺关系骨架` })
  }

  const master = rel?.master && typeof rel.master === 'object' ? rel.master : null
  const aux = rel?.auxiliary && typeof rel.auxiliary === 'object' ? rel.auxiliary : null
  const masterDict = master ? String(master.dict || '').trim() : ''
  const auxDict = aux ? String(aux.dict || '').trim() : ''

  // 主/辅缺失或解析不到
  if (!masterDict) {
    errors.push({ path: `${P}.master.dict`, code: 'RELATION_MASTER_MISSING', message: '关系字典未配置主字典（relation.master.dict）' })
  } else if (typeof resolveDict === 'function' && !resolveDict(effectiveDictId(masterDict))) {
    errors.push({ path: `${P}.master.dict`, code: 'RELATION_MASTER_MISSING', message: `主字典 ${masterDict} 解析不到（不存在或不可见）` })
  }
  if (!auxDict) {
    errors.push({ path: `${P}.auxiliary.dict`, code: 'RELATION_AUX_MISSING', message: '关系字典未配置辅字典（relation.auxiliary.dict）' })
  } else if (typeof resolveDict === 'function' && !resolveDict(effectiveDictId(auxDict))) {
    errors.push({ path: `${P}.auxiliary.dict`, code: 'RELATION_AUX_MISSING', message: `辅字典 ${auxDict} 解析不到（不存在或不可见）` })
  }

  // 槽位是否真在 relationCommonFields（防 G1 复发：手写 nodeField/memberField 覆盖默认槽时校验）
  if (typeof resolveSetFields === 'function') {
    const relFields = new Set((resolveSetFields(RELATION_FIELDSET) || []).map((f) => String(f?.id || f?.name || '')))
    const checkSlot = (side, defaultSlot, label, pathKey) => {
      const slot = side && side.nodeField ? String(side.nodeField)
        : side && side.memberField ? String(side.memberField)
        : defaultSlot
      if (relFields.size && !relFields.has(slot)) {
        errors.push({ path: `${P}.${pathKey}`, code: 'RELATION_SLOT_NOT_IN_FIELDSET', message: `${label}槽位 ${slot} 不在 ${RELATION_FIELDSET} 中` })
      }
    }
    if (master) checkSlot(master, RELATION_SLOTS.master.idField, '主', 'master')
    if (aux) checkSlot(aux, RELATION_SLOTS.auxiliary.idField, '辅', 'auxiliary')
  }

  // 自引用：主辅指向同一字典（可能配置笔误）
  if (masterDict && auxDict && effectiveDictId(masterDict) === effectiveDictId(auxDict)) {
    warnings.push({ path: P, code: 'RELATION_SELF_REFERENCE', message: `主辅指向同一字典 ${masterDict}（自关系？请确认非笔误）` })
  }

  return { errors, warnings, valid: errors.length === 0 }
}

// ─── 新建骨架（补 G2） ────────────────────────────────────────────────────────

/**
 * 生成关系字典的规范骨架：relationCommonFields + 审计/生效/禁用字段集 + 空 relation 占位。
 * @param {object} [opts]
 * @param {string} [opts.dictCode]  字典编码（同时作规范物理表名）
 * @param {string} [opts.dictName]  字典名称
 * @returns {object} 新字典表对象
 */
export function newRelationDict (opts = {}) {
  const dictCode = String(opts.dictCode || 'new_relation')
  const dictName = String(opts.dictName || '新关系字典')
  return {
    dictMeta: {
      dictCode,
      dictName,
      dictKind: RELATION_KIND,
      selfHierarchy: false,
      tableName: dictCode,           // 规范物理表名（不留 new_dict）
      idField: 'id',
      codeField: 'code',
      labelField: 'name',
      maxLevel: 1,
      codeStructure: '',
      codeRule: { mode: 'manual', field: 'code' },
      remark: '',
      relation: {                    // 空占位：master/auxiliary 待编辑器选定
        master: { dict: '', valueField: 'code', labelField: 'name' },
        auxiliary: { dict: '', valueField: 'code', labelField: 'name' },
        cardinality: RELATION_CARDINALITY_DEFAULT,
        uniqueMember: true,
      },
    },
    fields: [],
    extraFieldSets: [RELATION_FIELDSET, 'dictionaryAuditFields', 'dictionaryEffectiveFields', 'dictionaryDisableFields'],
  }
}

// ─── 迁移（补 G6，消 G1） ──────────────────────────────────────────────────────

/** 旧 fieldRefDicts 的主/辅逻辑键（半成品样例用 group_id/business_id）。 */
const LEGACY_MASTER_KEYS = ['group_id', 'hierarchy_node_id', 'master_id']
const LEGACY_AUX_KEYS = ['business_id', 'business_data_id', 'aux_id']

/**
 * 迁移半成品关系字典：旧 fieldRefDicts → dictMeta.relation，规范 tableName，删旧键。
 * 幂等：已含 relation 或非关系字典 → 原样返回。
 * @param {object} table
 * @returns {object} 新表副本
 */
export function migrateLegacyRelation (table) {
  if (!isRelationDict(table)) return table
  const meta = table.dictMeta || {}
  if (meta.relation && typeof meta.relation === 'object') return table  // 已迁移，幂等
  const refs = table.fieldRefDicts && typeof table.fieldRefDicts === 'object' ? table.fieldRefDicts : {}
  const pick = (keys) => { for (const k of keys) if (refs[k]) return String(refs[k]); return '' }
  const masterDict = pick(LEGACY_MASTER_KEYS)
  const auxDict = pick(LEGACY_AUX_KEYS)

  const newMeta = { ...meta }
  // 规范物理表名：半成品的 new_dict / 空 → 用 dictCode
  if (!newMeta.tableName || newMeta.tableName === 'new_dict') newMeta.tableName = String(meta.dictCode || table.tableName || 'new_relation')
  newMeta.relation = {
    master: { dict: masterDict, valueField: 'code', labelField: 'name' },
    auxiliary: { dict: auxDict, valueField: 'code', labelField: 'name' },
    cardinality: RELATION_CARDINALITY_DEFAULT,
    uniqueMember: true,
  }

  const out = { ...table, dictMeta: newMeta }
  delete out.fieldRefDicts  // 已由 relation 表达
  return out
}
