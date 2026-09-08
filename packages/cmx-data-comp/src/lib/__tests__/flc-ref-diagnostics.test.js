import { describe, it, expect } from 'vitest'
import { diagnoseReferences } from '../flc-ref-diagnostics.js'

const cols = [
  { id: 'amount', dataType: 'DECIMAL', fieldLength: 20, dimType: 'measure', nullable: false },
  { id: 'cost_center_id', dataType: 'BIGINT', dimType: 'dimension', refDict: 'cost_center', nullable: true },
  { id: 'remark', dataType: 'VARCHAR', fieldLength: 512, dimType: 'attribute', nullable: true },
]
const tableCols = (t) => (t === 'voucher_detail' ? cols : null)
const docRef = { domain: 'fi', app: 'cmxfico', module: 'gl', file: 'gl_md_doc_meta_v1.json' }

const codes = (r) => [...r.errors, ...r.warnings].map((d) => d.code)

describe('flc-ref-diagnostics — overlay 引用', () => {
  it('干净的 use:"*" 无诊断', () => {
    const c = { docRef, rules: [{ id: 'r', detail: { table: 'voucher_detail', use: '*' } }] }
    const r = diagnoseReferences(c, { tableCols })
    expect(r.valid).toBe(true)
    expect(r.errors).toEqual([])
  })

  it('用 overlay 但无 docRef → REF_WITHOUT_DOCREF', () => {
    const c = { rules: [{ id: 'r', detail: { table: 'voucher_detail', use: '*' } }] }
    const r = diagnoseReferences(c, { tableCols })
    expect(codes(r)).toContain('REF_WITHOUT_DOCREF')
  })

  it('表不在单据 → REF_TABLE_NOT_IN_DOC', () => {
    const c = { docRef, rules: [{ id: 'r', detail: { table: 'ghost_table', use: '*' } }] }
    const r = diagnoseReferences(c, { tableCols })
    expect(codes(r)).toContain('REF_TABLE_NOT_IN_DOC')
  })

  it('pick 的列不存在 → REF_COLUMN_NOT_IN_TABLE', () => {
    const c = { docRef, rules: [{ id: 'r', detail: { table: 'voucher_detail', pick: [{ ref: 'voucher_detail.ghost' }] } }] }
    const r = diagnoseReferences(c, { tableCols })
    expect(codes(r)).toContain('REF_COLUMN_NOT_IN_TABLE')
  })

  it('use over 补丁列不存在 → REF_COLUMN_NOT_IN_TABLE', () => {
    const c = { docRef, rules: [{ id: 'r', detail: { table: 'voucher_detail', use: '*', over: { ghost: { edit: { required: true } } } } }] }
    const r = diagnoseReferences(c, { tableCols })
    expect(codes(r)).toContain('REF_COLUMN_NOT_IN_TABLE')
  })

  it('over 改物理类型 → OVER_CHANGES_PHYSICAL_TYPE', () => {
    const c = { docRef, rules: [{ id: 'r', detail: { table: 'voucher_detail', pick: [{ ref: 'voucher_detail.amount', over: { dataType: 'VARCHAR' } }] } }] }
    const r = diagnoseReferences(c, { tableCols })
    expect(codes(r)).toContain('OVER_CHANGES_PHYSICAL_TYPE')
  })

  it('over 放松非空列必填 → OVER_RELAXES_NULLABLE (warning)', () => {
    const c = { docRef, rules: [{ id: 'r', detail: { table: 'voucher_detail', pick: [{ ref: 'voucher_detail.amount', over: { edit: { required: false } } }] } }] }
    const r = diagnoseReferences(c, { tableCols })
    expect(r.warnings.map((w) => w.code)).toContain('OVER_RELAXES_NULLABLE')
    expect(r.valid).toBe(true)  // warning 不致命
  })

  it('over 显示精度不算物理类型（放行）', () => {
    const c = { docRef, rules: [{ id: 'r', detail: { table: 'voucher_detail', pick: [{ ref: 'voucher_detail.amount', over: { display: { decimalDigits: 4 } } }] } }] }
    const r = diagnoseReferences(c, { tableCols })
    expect(r.errors).toEqual([])
  })

  it('纯 inline 规则不触发引用诊断', () => {
    const c = { docRef, rules: [{ id: 'r', detail: { fields: [{ id: 'x' }] } }] }
    const r = diagnoseReferences(c, { tableCols })
    expect(r.errors).toEqual([])
  })
})

describe('flc-ref-diagnostics — 跨 DAM 可见性', () => {
  const from = { domain: 'fi', app: 'cmxfico', module: 'gl' }

  it('imports 目标不可见 → REF_VISIBILITY_DENIED', () => {
    const c = {
      docRef, from,
      imports: [{ alias: 'cc', drn: 'drn:fi/other-app/md/DCT/cost_center' }],
      rules: [],
    }
    const resolveDrn = () => ({ dam: { domain: 'fi', app: 'other-app', module: 'md' }, visibility: 'private' })
    const r = diagnoseReferences(c, { tableCols, from, resolveDrn })
    expect(codes(r)).toContain('REF_VISIBILITY_DENIED')
  })

  it('imports 目标 public 放行', () => {
    const c = { docRef, imports: [{ alias: 'cc', drn: 'drn:fi/shared-md/md/DCT/currency' }], rules: [] }
    const resolveDrn = () => ({ dam: { domain: 'fi', app: 'shared-md', module: 'md' }, visibility: 'public' })
    const r = diagnoseReferences(c, { tableCols, from, resolveDrn })
    expect(r.errors).toEqual([])
  })

  it('imports 解析不到 → REF_TARGET_NOT_FOUND', () => {
    const c = { docRef, imports: [{ alias: 'x', drn: 'drn:fi/nope/md/DCT/ghost' }], rules: [] }
    const r = diagnoseReferences(c, { tableCols, from, resolveDrn: () => null })
    expect(codes(r)).toContain('REF_TARGET_NOT_FOUND')
  })
})
