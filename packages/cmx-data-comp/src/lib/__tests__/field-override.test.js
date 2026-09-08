import { describe, it, expect } from 'vitest'
import {
  normalizeFieldOverrides, overrideForField, effectiveField, diffOverride, materializeTable, dematerializeTable,
  diagnoseOverride, diagnoseTableOverrides,
} from '../field-override.js'

// 模拟 base fieldSet 字段
const identityFields = [
  { id: 'doc_no', dataType: 'VARCHAR', fieldLength: 64, nullable: false, dimType: 'attribute', caption: { zh_CN: '单据号' } },
  { id: 'doc_type_id', dataType: 'BIGINT', nullable: false, dimType: 'dimension', caption: { zh_CN: '单据类型ID' } },
]
const technicalFields = [
  { id: 'create_time', dataType: 'DATETIME', nullable: false, caption: { zh_CN: '创建时间' } },
  { id: 'doc_no', dataType: 'VARCHAR', fieldLength: 20, caption: { zh_CN: '技术号（同名）' } }, // 与 identity 同 id，触发限定键
]
const resolveSetFields = (name) =>
  name === 'documentIdentityFields' ? identityFields : name === 'documentTechnicalFields' ? technicalFields : []
const listSetNames = (t) => t.documentFieldSets || []

describe('field-override — normalizeFieldOverrides', () => {
  it('裸键 + 限定键分流', () => {
    const { byId, byQualified } = normalizeFieldOverrides({
      doc_no: { caption: { zh_CN: '凭证号' } },
      'documentTechnicalFields.doc_no': { fieldLength: 32 },
    })
    expect(byId.get('doc_no')).toEqual({ caption: { zh_CN: '凭证号' } })
    expect(byQualified.get('documentTechnicalFields.doc_no')).toEqual({ fieldLength: 32 })
  })

  it('旧 fieldRefDicts 归并为 { refDict }', () => {
    const { byId } = normalizeFieldOverrides(null, { doc_type_id: 'voucher_type' })
    expect(byId.get('doc_type_id')).toEqual({ refDict: 'voucher_type' })
  })

  it('新 fieldOverrides 覆盖 fieldRefDicts（深合并，override 优先）', () => {
    const { byId } = normalizeFieldOverrides(
      { doc_type_id: { refDict: 'other_dict', caption: { zh_CN: '类型' } } },
      { doc_type_id: 'voucher_type' },
    )
    expect(byId.get('doc_type_id')).toEqual({ refDict: 'other_dict', caption: { zh_CN: '类型' } })
  })
})

describe('field-override — overrideForField（限定优先）', () => {
  const overrides = normalizeFieldOverrides({
    doc_no: { caption: { zh_CN: '通配号' } },
    'documentTechnicalFields.doc_no': { fieldLength: 32 },
  })

  it('无来源 fieldSet → 只取裸键', () => {
    expect(overrideForField(overrides, 'doc_no')).toEqual({ caption: { zh_CN: '通配号' } })
  })
  it('限定 + 裸键都命中 → 深合并（限定优先）', () => {
    expect(overrideForField(overrides, 'doc_no', 'documentTechnicalFields'))
      .toEqual({ caption: { zh_CN: '通配号' }, fieldLength: 32 })
  })
  it('限定不命中 → 回退裸键', () => {
    expect(overrideForField(overrides, 'doc_no', 'documentIdentityFields'))
      .toEqual({ caption: { zh_CN: '通配号' } })
  })
})

describe('field-override — effectiveField', () => {
  it('base ⊕ override（递归、不改 base）', () => {
    const base = identityFields[0]
    const f = effectiveField(base, { caption: { zh_CN: '凭证号' }, fieldLength: 32, pattern: '^GL' })
    expect(f).toMatchObject({ id: 'doc_no', dataType: 'VARCHAR', fieldLength: 32, caption: { zh_CN: '凭证号' }, pattern: '^GL' })
    expect(base.fieldLength).toBe(64) // base 未被改
  })
  it('override 空 → 返回 base 本身', () => {
    expect(effectiveField(identityFields[0], null)).toBe(identityFields[0])
  })
  it('null 删除键', () => {
    const f = effectiveField({ id: 'x', unique: true }, { unique: null })
    expect(f.unique).toBeUndefined()
  })
})

describe('field-override — diffOverride（编辑器算增量）', () => {
  it('仅提取与 base 不同的顶层键', () => {
    const base = { id: 'doc_no', dataType: 'VARCHAR', fieldLength: 64, caption: { zh_CN: '单据号' } }
    const edited = { id: 'doc_no', dataType: 'VARCHAR', fieldLength: 32, caption: { zh_CN: '凭证号' } }
    expect(diffOverride(base, edited)).toEqual({ fieldLength: 32, caption: { zh_CN: '凭证号' } })
  })
  it('完全相同 → null（无覆盖）', () => {
    const base = { id: 'x', a: 1 }
    expect(diffOverride(base, { id: 'x', a: 1 })).toBeNull()
  })
  it('base 有 edited 无的键 → 删除语义 null', () => {
    expect(diffOverride({ id: 'x', unique: true }, { id: 'x' })).toEqual({ unique: null })
  })
})

describe('field-override — materializeTable（存时物化）', () => {
  it('仅被覆盖的引用字段落内联，删覆盖键', () => {
    const table = {
      tableName: 'voucher_header',
      documentFieldSets: ['documentIdentityFields'],
      fields: [{ id: 'own_field', dataType: 'VARCHAR' }],
      fieldOverrides: { doc_no: { caption: { zh_CN: '凭证号' }, fieldLength: 32 } },
    }
    const out = materializeTable(table, resolveSetFields, listSetNames)
    expect(out.fieldOverrides).toBeUndefined()
    expect(out.fieldRefDicts).toBeUndefined()
    // 原内联 + 物化的 doc_no
    expect(out.fields.map((f) => f.id)).toEqual(['own_field', 'doc_no'])
    const docNo = out.fields.find((f) => f.id === 'doc_no')
    expect(docNo).toMatchObject({ dataType: 'VARCHAR', fieldLength: 32, caption: { zh_CN: '凭证号' } })
    // 未覆盖的 doc_type_id 不物化（仍走 fieldSet 引用）
    expect(out.fields.find((f) => f.id === 'doc_type_id')).toBeUndefined()
  })

  it('旧 fieldRefDicts 也参与物化', () => {
    const table = {
      documentFieldSets: ['documentIdentityFields'],
      fieldRefDicts: { doc_type_id: 'voucher_type' },
    }
    const out = materializeTable(table, resolveSetFields, listSetNames)
    const dt = out.fields.find((f) => f.id === 'doc_type_id')
    expect(dt.refDict).toBe('voucher_type')
    expect(out.fieldRefDicts).toBeUndefined()
  })

  it('限定键消歧：同名字段按 fieldSet 各自物化', () => {
    const table = {
      documentFieldSets: ['documentIdentityFields', 'documentTechnicalFields'],
      fieldOverrides: {
        'documentIdentityFields.doc_no': { caption: { zh_CN: '身份号' } },
        'documentTechnicalFields.doc_no': { caption: { zh_CN: '技术号' } },
      },
    }
    const out = materializeTable(table, resolveSetFields, listSetNames)
    // 只保留首次出现的 doc_no（identity 在前），其覆盖生效；技术组同 id 被 seen 去重
    const docNos = out.fields.filter((f) => f.id === 'doc_no')
    expect(docNos).toHaveLength(1)
    expect(docNos[0].caption).toEqual({ zh_CN: '身份号' })
  })

  it('无覆盖 → 恒等返回', () => {
    const table = { documentFieldSets: ['documentIdentityFields'], fields: [] }
    expect(materializeTable(table, resolveSetFields, listSetNames)).toBe(table)
  })
})

describe('field-override — dematerializeTable（加载时逆物化）', () => {
  it('materialize → dematerialize 还原 fieldOverrides，清标记、字段回归引用态', () => {
    const table = {
      tableName: 'voucher_header',
      documentFieldSets: ['documentIdentityFields'],
      fields: [{ id: 'own_field', dataType: 'VARCHAR' }],
      fieldOverrides: { doc_no: { caption: { zh_CN: '凭证号' }, fieldLength: 32 } },
    }
    const materialized = materializeTable(table, resolveSetFields, listSetNames)
    // 物化后：带 _materializedFrom 标记、无 fieldOverrides
    const matDocNo = materialized.fields.find((f) => f.id === 'doc_no')
    expect(matDocNo._materializedFrom).toBe('documentIdentityFields')
    expect(materialized.fieldOverrides).toBeUndefined()
    // dematerialize 还原
    const out = dematerializeTable(materialized, resolveSetFields, listSetNames)
    // fieldOverrides 重建（裸键：doc_no 仅在 identity 出现）
    expect(out.fieldOverrides).toEqual({ doc_no: { caption: { zh_CN: '凭证号' }, fieldLength: 32 } })
    // 物化字段回归引用态：从 fields 移除（仅剩本表 own_field）
    expect(out.fields.map((f) => f.id)).toEqual(['own_field'])
    expect(out.fields.find((f) => f.id === 'doc_no')).toBeUndefined()
  })

  it('同 id 在多 fieldSet → dematerialize 重建限定键', () => {
    const table = {
      documentFieldSets: ['documentIdentityFields', 'documentTechnicalFields'],
      fieldOverrides: { 'documentIdentityFields.doc_no': { caption: { zh_CN: '身份号' } } },
    }
    const materialized = materializeTable(table, resolveSetFields, listSetNames)
    const out = dematerializeTable(materialized, resolveSetFields, listSetNames)
    // doc_no 在 identity + technical 都出现 → 限定键
    expect(out.fieldOverrides).toHaveProperty('documentIdentityFields.doc_no')
    expect(out.fieldOverrides['documentIdentityFields.doc_no']).toEqual({ caption: { zh_CN: '身份号' } })
  })

  it('物化字段与 base 完全相同（冗余覆盖产物）→ 不生成覆盖、字段回归引用', () => {
    const table = {
      documentFieldSets: ['documentIdentityFields'],
      // doc_type_id 内容与 base 完全一致（冗余覆盖物化后的产物），带标记
      fields: [{ ...identityFields[1], _materializedFrom: 'documentIdentityFields' }],
    }
    const out = dematerializeTable(table, resolveSetFields, listSetNames)
    expect(out.fieldOverrides).toBeUndefined()   // diffOverride=null → 无覆盖
    expect(out.fields).toHaveLength(0)            // 字段回归引用态（移除）
  })

  it('无 _materializedFrom 标记字段 → 恒等返回', () => {
    const table = {
      documentFieldSets: ['documentIdentityFields'],
      fields: [{ id: 'own_field', dataType: 'VARCHAR' }],
    }
    expect(dematerializeTable(table, resolveSetFields, listSetNames)).toBe(table)
  })

  it('setName 失效（base 已删/改名）→ 去标记降级为本表字段，不静默丢失', () => {
    const table = {
      documentFieldSets: ['documentIdentityFields'],
      fields: [
        { id: 'own_field', dataType: 'VARCHAR' },
        { id: 'ghost_field', dataType: 'VARCHAR', _materializedFrom: 'documentIdentityFields' }, // base 里无此 id
      ],
    }
    const out = dematerializeTable(table, resolveSetFields, listSetNames)
    expect(out.fields.map((f) => f.id)).toEqual(['own_field', 'ghost_field'])  // 降级保留
    expect(out.fields.find((f) => f.id === 'ghost_field')._materializedFrom).toBeUndefined()
    expect(out.fieldOverrides).toBeUndefined()
  })
})

describe('field-override — diagnoseOverride', () => {
  const base = { id: 'doc_no', name: 'doc_no', dataType: 'VARCHAR', fieldLength: 64, nullable: false }

  it('改物理类型 → error', () => {
    const d = diagnoseOverride(base, { dataType: 'INT' }, 'p')
    expect(d.errors.map((e) => e.code)).toContain('OVERRIDE_CHANGES_PHYSICAL_TYPE')
  })
  it('改 fieldLength → error（物理）', () => {
    const d = diagnoseOverride(base, { fieldLength: 32 }, 'p')
    expect(d.errors.map((e) => e.code)).toContain('OVERRIDE_CHANGES_PHYSICAL_TYPE')
  })
  it('改 id/name → error（身份）', () => {
    const d = diagnoseOverride(base, { id: 'other' }, 'p')
    expect(d.errors.map((e) => e.code)).toContain('OVERRIDE_CHANGES_IDENTITY')
  })
  it('显示精度 display.decimalDigits 可改（不报错）', () => {
    const d = diagnoseOverride(base, { display: { decimalDigits: 4 } }, 'p')
    expect(d.errors).toEqual([])
  })
  it('放松非空 → warning', () => {
    const d = diagnoseOverride(base, { nullable: true }, 'p')
    expect(d.warnings.map((w) => w.code)).toContain('OVERRIDE_RELAXES_CONSTRAINT')
  })
  it('冗余覆盖（值同 base）→ warning', () => {
    const d = diagnoseOverride(base, { nullable: false }, 'p')
    expect(d.warnings.map((w) => w.code)).toContain('OVERRIDE_REDUNDANT')
  })
  it('纯显示覆盖（caption）→ 无诊断', () => {
    const d = diagnoseOverride(base, { caption: { zh_CN: '凭证号' } }, 'p')
    expect(d.errors).toEqual([]); expect(d.warnings).toEqual([])
  })
})

describe('field-override — diagnoseTableOverrides', () => {
  const resolveSetFields = (name) =>
    name === 'documentIdentityFields'
      ? [{ id: 'doc_no', dataType: 'VARCHAR', fieldLength: 64, nullable: false }]
      : []
  const listSetNames = (t) => t.documentFieldSets || []

  it('覆盖不存在字段 → OVERRIDE_FIELD_NOT_FOUND', () => {
    const table = { tableName: 't', documentFieldSets: ['documentIdentityFields'], fieldOverrides: { ghost: { caption: {} } } }
    const r = diagnoseTableOverrides(table, resolveSetFields, listSetNames)
    expect(r.valid).toBe(false)
    expect(r.errors.map((e) => e.code)).toContain('OVERRIDE_FIELD_NOT_FOUND')
  })
  it('合法覆盖 → valid', () => {
    const table = { tableName: 't', documentFieldSets: ['documentIdentityFields'], fieldOverrides: { doc_no: { caption: { zh_CN: '凭证号' } } } }
    const r = diagnoseTableOverrides(table, resolveSetFields, listSetNames)
    expect(r.valid).toBe(true)
  })
})

describe('field-override — materializeTable 非破坏性（指向别名/不存在字段的旧覆盖保留）', () => {
  const resolveSetFields = (name) =>
    name === 'documentIdentityFields'
      ? [{ id: 'entity_id', dataType: 'BIGINT', nullable: true }]
      : []
  const listSetNames = (t) => t.documentFieldSets || []

  it('fieldRefDicts 里真实字段物化、别名字段保留为 fieldOverrides + 删 fieldRefDicts', () => {
    const table = {
      tableName: 'voucher_header',
      documentFieldSets: ['documentIdentityFields'],
      // entity_id 是真实 base 字段；document_type_id 是逻辑别名（base 无此 id）
      fieldRefDicts: { entity_id: 'acct_entity', document_type_id: 'voucher_type' },
    }
    const out = materializeTable(table, resolveSetFields, listSetNames)
    // 真实字段物化为完整内联（继承 base 物理属性）
    const ent = out.fields.find((f) => f.id === 'entity_id')
    expect(ent).toMatchObject({ refDict: 'acct_entity', dataType: 'BIGINT' })
    // fieldRefDicts 统一废弃
    expect(out.fieldRefDicts).toBeUndefined()
    // 未能解析的别名覆盖非破坏性保留在 fieldOverrides（而非静默丢失）
    expect(out.fieldOverrides).toEqual({ document_type_id: { refDict: 'voucher_type' } })
  })

  it('保留的悬空覆盖被 diagnoseTableOverrides 标记', () => {
    const out = {
      tableName: 't', documentFieldSets: ['documentIdentityFields'],
      fieldOverrides: { document_type_id: { refDict: 'voucher_type' } },
    }
    const diag = diagnoseTableOverrides(out, resolveSetFields, listSetNames)
    expect(diag.errors.map((e) => e.code)).toContain('OVERRIDE_FIELD_NOT_FOUND')
  })
})
