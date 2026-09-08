import { describe, it, expect } from 'vitest'
import {
  RELATION_KIND, RELATION_FIELDSET, RELATION_SLOTS,
  isRelationDict, compileRelationOverrides, applyRelationCompile,
  diagnoseRelation, newRelationDict, migrateLegacyRelation,
} from '../relation-dict.js'
import { materializeTable } from '../field-override.js'

// base relationCommonFields 的槽位（中性命名，与 base_dct_meta_v1.json 对齐）
const relationCommonFields = [
  { id: 'id', dataType: 'BIGINT', nullable: false, isPrimaryKey: 1 },
  { id: 'code', dataType: 'VARCHAR', fieldLength: 64, nullable: false },
  { id: 'name', dataType: 'VARCHAR', fieldLength: 128, nullable: false },
  { id: 'master_id', dataType: 'BIGINT', nullable: false, dimType: 'dimension' },
  { id: 'master_code', dataType: 'VARCHAR', fieldLength: 64, refField: 'id', displayField: 'name', dimType: 'attribute' },
  { id: 'master_name', dataType: 'VARCHAR', fieldLength: 128 },
  { id: 'aux_id', dataType: 'BIGINT', nullable: false, dimType: 'dimension' },
  { id: 'aux_code', dataType: 'VARCHAR', fieldLength: 64, refField: 'id', displayField: 'name' },
  { id: 'aux_name', dataType: 'VARCHAR', fieldLength: 128 },
]
const resolveSetFields = (name) => (name === RELATION_FIELDSET ? relationCommonFields : [])
const listSetNames = (t) => (Array.isArray(t.extraFieldSets) ? t.extraFieldSets : [])

// 迁移后的规范关系字典
const relDict = () => ({
  dictMeta: {
    dictCode: 'acct_entity_group', dictName: '核算主体分组关系', dictKind: RELATION_KIND,
    tableName: 'gl_acct_entity_group', idField: 'id', codeField: 'code', labelField: 'name',
    relation: {
      master: { dict: 'acct_entity_hierarchy', valueField: 'code', labelField: 'name' },
      auxiliary: { dict: 'acct_entity', valueField: 'code', labelField: 'name' },
      cardinality: 'many-to-many', uniqueMember: true,
    },
  },
  fields: [],
  extraFieldSets: [RELATION_FIELDSET, 'dictionaryAuditFields'],
})

describe('relation-dict — 判定与常量', () => {
  it('isRelationDict 认 dictKind=RELATION（大小写无关）', () => {
    expect(isRelationDict(relDict())).toBe(true)
    expect(isRelationDict({ dictMeta: { dictKind: 'relation' } })).toBe(true)
    expect(isRelationDict({ dictMeta: { dictKind: 'BUSINESS' } })).toBe(false)
    expect(isRelationDict(null)).toBe(false)
  })
  it('RELATION_SLOTS 用中性槽位名', () => {
    expect(RELATION_SLOTS.master.idField).toBe('master_id')
    expect(RELATION_SLOTS.auxiliary.idField).toBe('aux_id')
  })
})

describe('relation-dict — compileRelationOverrides（relation → 两槽 refDict）', () => {
  it('编译两个 dimension 槽的 refDict，键用正确槽位名', () => {
    const { fieldOverrides } = compileRelationOverrides(relDict())
    expect(fieldOverrides.master_id).toEqual({ refDict: 'acct_entity_hierarchy', refField: 'code', displayField: 'name' })
    expect(fieldOverrides.aux_id).toEqual({ refDict: 'acct_entity', refField: 'code', displayField: 'name' })
  })
  it('非关系字典 → 空覆盖（恒等安全）', () => {
    expect(compileRelationOverrides({ dictMeta: { dictKind: 'BUSINESS' } }).fieldOverrides).toEqual({})
  })
  it('无 relation → 空覆盖', () => {
    expect(compileRelationOverrides({ dictMeta: { dictKind: RELATION_KIND } }).fieldOverrides).toEqual({})
  })
  it('只配主字典 → 只出主槽', () => {
    const t = relDict(); delete t.dictMeta.relation.auxiliary
    const { fieldOverrides } = compileRelationOverrides(t)
    expect(fieldOverrides.master_id).toBeTruthy()
    expect(fieldOverrides.aux_id).toBeUndefined()
  })
})

describe('relation-dict — 与 fieldOverrides 物化链路对齐（消除 G1）', () => {
  it('applyRelationCompile → materializeTable：两槽物化为带 refDict 的内联字段，无 OVERRIDE_FIELD_NOT_FOUND', () => {
    const compiled = applyRelationCompile(relDict())
    const out = materializeTable(compiled, resolveSetFields, listSetNames)
    const byId = Object.fromEntries((out.fields || []).map((f) => [f.id, f]))
    // 两个槽位被物化为内联字段，且带上正确的 refDict
    expect(byId.master_id?.refDict).toBe('acct_entity_hierarchy')
    expect(byId.master_id?.refField).toBe('code')
    expect(byId.aux_id?.refDict).toBe('acct_entity')
    // 物化后无残留未解析覆盖（旧 group_id/business_id 会残留，这里不应有）
    expect(out.fieldOverrides).toBeUndefined()
  })
  it('手填覆盖优先于 relation 编译（relation 只补 refDict 挂载）', () => {
    const t = relDict()
    t.fieldOverrides = { master_id: { caption: { zh_CN: '所属分组' } } }
    const compiled = applyRelationCompile(t)
    // 手填 caption 保留，同时 relation 补上 refDict
    expect(compiled.fieldOverrides.master_id.caption).toEqual({ zh_CN: '所属分组' })
    expect(compiled.fieldOverrides.master_id.refDict).toBe('acct_entity_hierarchy')
  })
})

describe('relation-dict — diagnoseRelation', () => {
  const resolveDict = (code) => ['acct_entity_hierarchy', 'acct_entity', 'acct_entity_self'].includes(code)

  it('规范关系字典 → 无错误', () => {
    const r = diagnoseRelation(relDict(), { resolveDict, resolveSetFields, listSetNames })
    expect(r.valid).toBe(true)
    expect(r.errors).toEqual([])
  })
  it('缺主字典 → RELATION_MASTER_MISSING', () => {
    const t = relDict(); t.dictMeta.relation.master.dict = ''
    const r = diagnoseRelation(t, { resolveDict })
    expect(r.errors.map((e) => e.code)).toContain('RELATION_MASTER_MISSING')
    expect(r.valid).toBe(false)
  })
  it('缺辅字典 → RELATION_AUX_MISSING', () => {
    const t = relDict(); delete t.dictMeta.relation.auxiliary
    const r = diagnoseRelation(t, { resolveDict })
    expect(r.errors.map((e) => e.code)).toContain('RELATION_AUX_MISSING')
  })
  it('主字典解析不到 → RELATION_MASTER_MISSING', () => {
    const t = relDict(); t.dictMeta.relation.master.dict = 'not_exist'
    const r = diagnoseRelation(t, { resolveDict })
    expect(r.errors.map((e) => e.code)).toContain('RELATION_MASTER_MISSING')
  })
  it('槽位不在 relationCommonFields → RELATION_SLOT_NOT_IN_FIELDSET', () => {
    const t = relDict(); t.dictMeta.relation.master.nodeField = 'group_id'  // G1 复发：错键
    const r = diagnoseRelation(t, { resolveDict, resolveSetFields, listSetNames })
    expect(r.errors.map((e) => e.code)).toContain('RELATION_SLOT_NOT_IN_FIELDSET')
  })
  it('未引用 relationCommonFields → RELATION_FIELDSET_NOT_REFERENCED（warning）', () => {
    const t = relDict(); t.extraFieldSets = ['dictionaryAuditFields']
    const r = diagnoseRelation(t, { resolveDict, resolveSetFields, listSetNames })
    expect(r.warnings.map((w) => w.code)).toContain('RELATION_FIELDSET_NOT_REFERENCED')
  })
  it('主辅同字典 → RELATION_SELF_REFERENCE（warning，不致命）', () => {
    const t = relDict()
    t.dictMeta.relation.master.dict = 'acct_entity_self'
    t.dictMeta.relation.auxiliary.dict = 'acct_entity_self'
    const r = diagnoseRelation(t, { resolveDict })
    expect(r.warnings.map((w) => w.code)).toContain('RELATION_SELF_REFERENCE')
    expect(r.valid).toBe(true)  // 自引用只是警告
  })
  it('非关系字典 → valid，无诊断', () => {
    const r = diagnoseRelation({ dictMeta: { dictKind: 'BUSINESS' } }, { resolveDict })
    expect(r.valid).toBe(true)
    expect(r.errors).toEqual([]); expect(r.warnings).toEqual([])
  })
})

describe('relation-dict — newRelationDict 骨架（补 G2）', () => {
  it('生成关系骨架：relationCommonFields + 空 relation 占位 + 规范 tableName', () => {
    const d = newRelationDict({ dictCode: 'acct_entity_group', dictName: '核算主体分组关系' })
    expect(d.dictMeta.dictKind).toBe(RELATION_KIND)
    expect(d.dictMeta.tableName).toBe('acct_entity_group')  // 用 dictCode，不留 new_dict
    expect(d.extraFieldSets).toContain(RELATION_FIELDSET)
    expect(d.dictMeta.relation.master.dict).toBe('')  // 占位待选
    expect(d.dictMeta.relation.cardinality).toBe('many-to-many')
    expect(d.dictMeta.relation.uniqueMember).toBe(true)
  })
  it('缺省参数也生成合法骨架', () => {
    const d = newRelationDict()
    expect(isRelationDict(d)).toBe(true)
    expect(d.dictMeta.tableName).toBe(d.dictMeta.dictCode)
  })
})

describe('relation-dict — migrateLegacyRelation（补 G6，消 G1）', () => {
  const legacy = () => ({
    dictMeta: {
      dictCode: 'acct_entity_group', dictKind: RELATION_KIND, tableName: 'new_dict',
      dictName: '核算主体管理层级', idField: 'id', codeField: 'code', labelField: 'name',
    },
    fields: [],
    extraFieldSets: [RELATION_FIELDSET, 'dictionaryAuditFields'],
    fieldRefDicts: { group_id: 'acct_entity_hierarchy', business_id: 'acct_entity' },
  })

  it('旧 fieldRefDicts → relation，删旧键，规范 tableName', () => {
    const out = migrateLegacyRelation(legacy())
    expect(out.dictMeta.relation.master.dict).toBe('acct_entity_hierarchy')
    expect(out.dictMeta.relation.auxiliary.dict).toBe('acct_entity')
    expect(out.dictMeta.tableName).toBe('acct_entity_group')  // new_dict → dictCode
    expect(out.fieldRefDicts).toBeUndefined()  // 旧键清除
  })
  it('迁移后编译等价：两槽 refDict 指向正确主/辅字典', () => {
    const out = migrateLegacyRelation(legacy())
    const { fieldOverrides } = compileRelationOverrides(out)
    expect(fieldOverrides.master_id.refDict).toBe('acct_entity_hierarchy')
    expect(fieldOverrides.aux_id.refDict).toBe('acct_entity')
  })
  it('幂等：已含 relation → 原样返回', () => {
    const already = relDict()
    expect(migrateLegacyRelation(already)).toBe(already)
  })
  it('非关系字典 → 原样返回', () => {
    const biz = { dictMeta: { dictKind: 'BUSINESS' } }
    expect(migrateLegacyRelation(biz)).toBe(biz)
  })
})
