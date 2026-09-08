import { describe, it, expect } from 'vitest'
import { normalizeDocCoord, docCoordQuery, docCoordKey, resolveCoord } from '../cmx-doc-coord.js'

describe('cmx-doc-coord — 单据坐标统一处理', () => {
  describe('normalizeDocCoord', () => {
    it('对象形态：app 兜底 application，db_id 兜底 dbId', () => {
      expect(normalizeDocCoord({ domain: 'fi', app: 'cmxfico', module: 'gl', db_id: 'db1' }))
        .toEqual({ domain: 'fi', application: 'cmxfico', module: 'gl', file: '', doc: '', dbId: 'db1' })
    })
    it('对象形态：doc 字段透传', () => {
      expect(normalizeDocCoord({ domain: 'fi', application: 'cmxfico', module: 'gl', doc: 'voucher' }))
        .toEqual({ domain: 'fi', application: 'cmxfico', module: 'gl', file: '', doc: 'voucher', dbId: '' })
    })
    it('斜杠字符串：domain/application/module[/file]，斜杠串不含 doc', () => {
      expect(normalizeDocCoord('fi/cmxfico/gl'))
        .toEqual({ domain: 'fi', application: 'cmxfico', module: 'gl', file: '', doc: '', dbId: '' })
      expect(normalizeDocCoord('fi/cmxfico/gl/x.json'))
        .toEqual({ domain: 'fi', application: 'cmxfico', module: 'gl', file: 'x.json', doc: '', dbId: '' })
    })
    it('空值返回全空对象', () => {
      const empty = { domain: '', application: '', module: '', file: '', doc: '', dbId: '' }
      expect(normalizeDocCoord(null)).toEqual(empty)
      expect(normalizeDocCoord('')).toEqual(empty)
    })
  })

  describe('docCoordQuery — file/doc 有值才拼，空/脏值不拼', () => {
    it('file 有值 → 带 file', () => {
      const qs = docCoordQuery({ domain: 'fi', application: 'cmxfico', module: 'gl', file: 'x.json' })
      expect(qs.get('file')).toBe('x.json')
      expect(qs.get('domain')).toBe('fi')
    })
    it('doc 有值 → 带 doc', () => {
      const qs = docCoordQuery({ domain: 'fi', application: 'cmxfico', module: 'gl', doc: 'voucher' })
      expect(qs.get('doc')).toBe('voucher')
    })
    it('doc 缺省 → 不带 doc', () => {
      const qs = docCoordQuery({ domain: 'fi', application: 'cmxfico', module: 'gl' })
      expect(qs.get('doc')).toBeNull()
    })
    it('file 空 → 不带 file（后端自动解析）', () => {
      const qs = docCoordQuery({ domain: 'fi', application: 'cmxfico', module: 'gl' })
      expect(qs.get('file')).toBeNull()
    })
    it('file 为 undefined → 不产生 file=undefined 脏值', () => {
      const qs = docCoordQuery({ domain: 'fi', application: 'cmxfico', module: 'gl', file: undefined })
      expect(qs.toString()).not.toMatch(/file=/)
    })
    it('file 为 "undefined" / "null" 字符串 → 也视为缺失', () => {
      expect(docCoordQuery({ domain: 'fi', application: 'cmxfico', module: 'gl', file: 'undefined' }).get('file')).toBeNull()
      expect(docCoordQuery({ domain: 'fi', application: 'cmxfico', module: 'gl', file: 'null' }).get('file')).toBeNull()
    })
    it('doc + file 同时有值 → 都带', () => {
      const qs = docCoordQuery({ domain: 'fi', application: 'cmxfico', module: 'gl', doc: 'voucher', file: 'x.json' })
      expect(qs.get('doc')).toBe('voucher')
      expect(qs.get('file')).toBe('x.json')
    })
    it('接受斜杠字符串输入', () => {
      const qs = docCoordQuery('fi/cmxfico/gl')
      expect(qs.get('domain')).toBe('fi')
      expect(qs.get('file')).toBeNull()
    })
  })

  describe('docCoordKey — 去重 key', () => {
    it('同坐标同 key（含 file）', () => {
      expect(docCoordKey({ domain: 'fi', application: 'cmxfico', module: 'gl', file: 'x.json' }))
        .toBe('fi/cmxfico/gl/x.json')
    })
    it('file 缺省 → key 不含 file 段', () => {
      expect(docCoordKey({ domain: 'fi', application: 'cmxfico', module: 'gl' })).toBe('fi/cmxfico/gl')
    })
    it('file 为脏值 → 与缺省同 key', () => {
      expect(docCoordKey({ domain: 'fi', application: 'cmxfico', module: 'gl', file: 'undefined' }))
        .toBe(docCoordKey({ domain: 'fi', application: 'cmxfico', module: 'gl' }))
    })
    it('doc 有值 → key 含 doc 段', () => {
      expect(docCoordKey({ domain: 'fi', application: 'cmxfico', module: 'gl', doc: 'voucher' }))
        .toBe('fi/cmxfico/gl/voucher')
    })
    it('doc + file 都有 → key 含两段', () => {
      expect(docCoordKey({ domain: 'fi', application: 'cmxfico', module: 'gl', doc: 'voucher', file: 'x.json' }))
        .toBe('fi/cmxfico/gl/voucher/x.json')
    })
    it('doc 不同 → key 不同（区分单据）', () => {
      expect(docCoordKey({ domain: 'fi', application: 'cmxfico', module: 'gl', doc: 'voucher' }))
        .not.toBe(docCoordKey({ domain: 'fi', application: 'cmxfico', module: 'gl', doc: 'transfer' }))
    })
  })

  describe('resolveCoord — 局部优先 + 全局兜底合并', () => {
    const global = { domain: 'fi', application: 'cmxfico', module: 'gl' }
    it('local 有值优先', () => {
      expect(resolveCoord({ domain: 'hr' }, global))
        .toEqual({ domain: 'hr', application: 'cmxfico', module: 'gl', file: '', doc: '', dbId: '' })
    })
    it('local 缺失 → global 兜底', () => {
      expect(resolveCoord({}, global))
        .toEqual({ domain: 'fi', application: 'cmxfico', module: 'gl', file: '', doc: '', dbId: '' })
    })
    it('local 和 global 各补一部分（逐字段合并）', () => {
      expect(resolveCoord({ application: 'cmxhr', file: 'x.json' }, global))
        .toEqual({ domain: 'fi', application: 'cmxhr', module: 'gl', file: 'x.json', doc: '', dbId: '' })
    })
    it('两者皆空 → 全空坐标', () => {
      expect(resolveCoord(null, null))
        .toEqual({ domain: '', application: '', module: '', file: '', doc: '', dbId: '' })
    })
    it('dbId 也参与合并', () => {
      expect(resolveCoord({}, { dbId: 'fico-db' }).dbId).toBe('fico-db')
      expect(resolveCoord({ dbId: 'a' }, { dbId: 'b' }).dbId).toBe('a')
    })
    it('doc 参与合并（local 优先）', () => {
      expect(resolveCoord({ doc: 'transfer' }, { doc: 'voucher' }).doc).toBe('transfer')
      expect(resolveCoord({}, { doc: 'voucher' }).doc).toBe('voucher')
    })
    it('接受斜杠字符串 local（自动归一）', () => {
      expect(resolveCoord('fi/cmxfico/gl', null).module).toBe('gl')
    })
  })
})
