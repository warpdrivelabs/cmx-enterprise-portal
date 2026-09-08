import { describe, it, expect } from 'vitest'
import {
  parseDrn, normalizeDrn, formatDrn, drnToPath, sameDefinition, drnVisibleFrom, effectiveDictId,
  DRN_KINDS, DRN_VISIBILITY,
} from '../drn.js'

describe('drn — parseDrn', () => {
  it('解析完整绝对 DRN（含版本与深链）', () => {
    const p = parseDrn('drn:fi/cmxfico/gl/DOC/gl_md_doc_meta@2#voucher_detail.cashflow_item_id')
    expect(p).toMatchObject({
      domain: 'fi', app: 'cmxfico', module: 'gl', kind: 'DOC',
      name: 'gl_md_doc_meta', version: 2, table: 'voucher_detail', field: 'cashflow_item_id',
    })
    expect(p.isAlias).toBe(false)
  })

  it('裸 code = 全段缺省的退化 DRN', () => {
    const p = parseDrn('cost_center')
    expect(p.name).toBe('cost_center')
    expect(p.domain).toBeNull(); expect(p.app).toBeNull(); expect(p.module).toBeNull(); expect(p.kind).toBeNull()
  })

  it('两段简写 kind/name', () => {
    const p = parseDrn('DCT/cost_center')
    expect(p.kind).toBe('DCT'); expect(p.name).toBe('cost_center')
  })

  it('别名 @cc 标记为 alias', () => {
    const p = parseDrn('@cc')
    expect(p.isAlias).toBe(true); expect(p.alias).toBe('cc')
  })

  it('深链只到表（无 .field）', () => {
    const p = parseDrn('drn:fi/cmxfico/gl/DOC/gl_md_doc_meta#voucher_detail')
    expect(p.table).toBe('voucher_detail'); expect(p.field).toBeNull()
  })

  it.each([
    ['', '空'],
    ['drn:fi/cmxfico/gl/DOC', '带前缀但段数不足'],
    ['drn:fi/cmxfico/gl/XXX/name', '非法 kind'],
    ['drn:fi/cmxfico/gl/DOC/name@x', '版本非数字'],
    ['a/b/c', '无前缀 3 段（非 1/2/5）'],
    ['DCT/na me', '段含空格'],
    ['drn:fi/cmxfico/gl/DOC/name#', '空深链'],
  ])('非法输入抛错：%s（%s）', (bad) => {
    expect(() => parseDrn(bad)).toThrow()
  })
})

describe('drn — normalizeDrn（补全 + 别名展开）', () => {
  const from = { domain: 'fi', app: 'cmxfico', module: 'gl' }

  it('裸 code 继承 from + 默认 kind', () => {
    const abs = normalizeDrn('cost_center', { from, kind: 'DCT' })
    expect(abs).toMatchObject({ domain: 'fi', app: 'cmxfico', module: 'gl', kind: 'DCT', name: 'cost_center' })
  })

  it('绝对 DRN 忽略 from（跨应用引用保持目标 DAM）', () => {
    const abs = normalizeDrn('drn:fi/shared-md/masterdata/DCT/cost_center@1', { from })
    expect(abs).toMatchObject({ app: 'shared-md', module: 'masterdata', version: 1 })
  })

  it('别名展开到绝对 DRN', () => {
    const imports = [{ alias: 'cc', drn: 'drn:fi/shared-md/masterdata/DCT/cost_center' }]
    const abs = normalizeDrn('@cc', { from, imports })
    expect(abs).toMatchObject({ app: 'shared-md', module: 'masterdata', kind: 'DCT', name: 'cost_center' })
  })

  it('别名带深链片段 @cc#t.f 合并到展开结果', () => {
    const imports = [{ alias: 'v', drn: 'drn:fi/cmxfico/gl/DOC/gl_md_doc_meta' }]
    const abs = normalizeDrn('@v#voucher_detail.amount', { from, imports })
    expect(abs.table).toBe('voucher_detail'); expect(abs.field).toBe('amount')
  })

  it('BASE 定义落 base/_/_ 占位 DAM', () => {
    const abs = normalizeDrn('BASE/base_doc_meta', { from })
    expect(abs).toMatchObject({ domain: 'base', app: '_', module: '_', kind: 'BASE', name: 'base_doc_meta' })
  })

  it('缺 kind 且无默认 → 抛错', () => {
    expect(() => normalizeDrn('cost_center', { from })).toThrow(/kind/)
  })

  it('缺 DAM 且无 from → 抛错', () => {
    expect(() => normalizeDrn('DCT/cost_center', {})).toThrow(/DAM/)
  })

  it('别名未声明 → 抛错', () => {
    expect(() => normalizeDrn('@nope', { from, imports: [] })).toThrow(/别名/)
  })
})

describe('drn — format / path 往返', () => {
  it('normalize → format 往返稳定', () => {
    const s = 'drn:fi/shared-md/masterdata/DCT/cost_center@1'
    expect(formatDrn(normalizeDrn(s))).toBe(s)
  })

  it('format 省略 version/深链', () => {
    const abs = normalizeDrn('drn:fi/cmxfico/gl/DOC/gl_md_doc_meta')
    expect(formatDrn(abs)).toBe('drn:fi/cmxfico/gl/DOC/gl_md_doc_meta')
  })

  it('drnToPath 默认不带版本', () => {
    const abs = normalizeDrn('drn:fi/cmxfico/gl/DOC/gl_md_doc_meta@2')
    expect(drnToPath(abs)).toBe('fi/cmxfico/gl/DOC/gl_md_doc_meta.json')
    expect(drnToPath(abs, { withVersion: true })).toBe('fi/cmxfico/gl/DOC/gl_md_doc_meta_v2.json')
  })

  it('sameDefinition 忽略版本与深链', () => {
    const a = normalizeDrn('drn:fi/cmxfico/gl/DOC/m@1#t.f')
    const b = normalizeDrn('drn:fi/cmxfico/gl/DOC/m@2')
    expect(sameDefinition(a, b)).toBe(true)
  })
})

describe('drn — 可见性', () => {
  const target = { domain: 'fi', app: 'shared-md', module: 'masterdata' }
  const sameModule = { domain: 'fi', app: 'shared-md', module: 'masterdata' }
  const sameApp = { domain: 'fi', app: 'shared-md', module: 'other' }
  const sameDomain = { domain: 'fi', app: 'cmxfico', module: 'gl' }
  const otherDomain = { domain: 'hr', app: 'x', module: 'y' }

  it('private 仅同模块', () => {
    expect(drnVisibleFrom('private', target, sameModule)).toBe(true)
    expect(drnVisibleFrom('private', target, sameApp)).toBe(false)
  })
  it('app 同应用跨模块', () => {
    expect(drnVisibleFrom('app', target, sameApp)).toBe(true)
    expect(drnVisibleFrom('app', target, sameDomain)).toBe(false)
  })
  it('domain 同域跨应用', () => {
    expect(drnVisibleFrom('domain', target, sameDomain)).toBe(true)
    expect(drnVisibleFrom('domain', target, otherDomain)).toBe(false)
  })
  it('public / 缺省 全放行', () => {
    expect(drnVisibleFrom('public', target, otherDomain)).toBe(true)
    expect(drnVisibleFrom(undefined, target, otherDomain)).toBe(true)
  })
})

describe('drn — 常量', () => {
  it('kinds / visibility 值域', () => {
    expect(DRN_KINDS).toContain('FLC')
    expect(DRN_KINDS).not.toContain('CTX')
    expect(DRN_VISIBILITY).toEqual(['private', 'app', 'domain', 'public'])
  })
})

describe('drn — effectiveDictId（两种写法）', () => {
  const from = { domain: 'fi', app: 'cmxfico', module: 'gl' }

  it('裸 code 原样（向后兼容，无需 from）', () => {
    expect(effectiveDictId('cost_center')).toBe('cost_center')
    expect(effectiveDictId('cost_center', {})).toBe('cost_center')
  })

  it('绝对 DRN → name 段', () => {
    expect(effectiveDictId('drn:fi/shared-md/masterdata/DCT/cost_center@1', { from })).toBe('cost_center')
  })

  it('别名 → 展开后 name 段', () => {
    const imports = [{ alias: 'cc', drn: 'drn:fi/shared-md/masterdata/DCT/currency' }]
    expect(effectiveDictId('@cc', { from, imports })).toBe('currency')
  })

  it('两段简写 DCT/x → name 段', () => {
    expect(effectiveDictId('DCT/partner', { from })).toBe('partner')
  })

  it('无法归一（未声明别名）→ 退回原值，不阻断', () => {
    expect(effectiveDictId('@nope', { from, imports: [] })).toBe('@nope')
  })
})
