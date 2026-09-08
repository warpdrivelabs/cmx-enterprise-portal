/**
 * cmx-doc-meta-loader 单测：通用元数据 → schema / path / 列模型 构建。
 * 核心保证「通用性」——同一构建器对 3 层与 5 层单据都正确，零业务假设。
 *
 * 关键：schema 按 **layerOrder 相邻层**建父子链（与后端 DocLoader 一致），
 * 不依赖 relations 的 parent/child 名字（定义里那是逻辑名，与层 id 不一致）。
 */
import { describe, it, expect } from 'vitest'
import {
  buildMasterSlaveSchema, layerPaths, buildColumnModel, orderColumns,
} from '../cmx-doc-meta-loader.js'

// 极简 mock CMX 类（只覆盖构建器用到的字段）
class CmxColumn {
  constructor (p = {}) { Object.assign(this, p) }
}
class CmxColumnModel {
  constructor (p = {}) { this.datasetId = p.datasetId; this.members = p.members || [] }
}
const C = { CmxColumn, CmxColumnModel }

/**
 * 造一个 N 层单据元数据。relations 故意用「逻辑名」（跟层 id 不一致），
 * 复刻真实 cmxfico 定义（relations.child = headers/account_lines，层 id = cv_header/cv_acc_line），
 * 以证明 schema 只认 layerOrder、不被 relations 名字带偏。
 */
function nLayerMeta (ids) {
  const layers = ids.map((id, i) => ({
    id, level: `L${i + 1}`, levelName: `层${i + 1}`,
    columns: [
      { name: 'id', caption: 'ID', dataType: 'BIGINT', isPrimaryKey: true },
      { name: 'upper_id', caption: '父ID', dataType: 'BIGINT' },
      { name: `biz_${id}`, caption: `业务_${id}`, dataType: 'VARCHAR' },
      { name: 'amount', caption: '金额', dataType: 'DECIMAL' },
      { name: 'create_time', caption: '创建时间', dataType: 'DATETIME' },
    ],
  }))
  // relations 用逻辑名（child_N），与层 id 无关；只提供 childKey
  const relations = []
  for (let i = 0; i < ids.length - 1; i++) {
    relations.push({ parent: `logical_${i}`, child: `logical_${i + 1}`, parentKey: 'id', childKey: 'upper_id' })
  }
  return { layerOrder: ids.slice(), layers, relations }
}

describe('buildMasterSlaveSchema', () => {
  it('3 层：按 layerOrder 相邻层建父子链（层 id，非 relations 名）', () => {
    const s = buildMasterSlaveSchema(nLayerMeta(['cv_batch', 'cv_header', 'cv_line']))
    expect(s.length).toBe(1)
    expect(s[0].id).toBe('cv_batch')
    expect(s[0].children[0].id).toBe('cv_header')
    expect(s[0].children[0].children[0].id).toBe('cv_line')
    expect(s[0].children[0].children[0].children.length).toBe(0)
  })

  it('5 层：同一构建器无需改动即支持更深层数', () => {
    const s = buildMasterSlaveSchema(nLayerMeta(['L1', 'L2', 'L3', 'L4', 'L5']))
    let node = s[0]; let depth = 1
    while (node.children.length) { node = node.children[0]; depth++ }
    expect(depth).toBe(5)
    expect(node.id).toBe('L5')
  })

  it('relations 用逻辑名也不影响：schema 只认 layerOrder', () => {
    // 即便 relations 的 child 名字（logical_*）跟层 id 完全不同，schema 仍正确
    const s = buildMasterSlaveSchema(nLayerMeta(['a', 'b', 'c']))
    expect(s[0].id).toBe('a')
    expect(s[0].children[0].id).toBe('b')
    expect(s[0].children[0].children[0].id).toBe('c')
  })

  it('单层单据：只有根、无子', () => {
    const s = buildMasterSlaveSchema(nLayerMeta(['only']))
    expect(s.length).toBe(1)
    expect(s[0].id).toBe('only')
    expect(s[0].children.length).toBe(0)
  })

  it('空元数据：返回空', () => {
    expect(buildMasterSlaveSchema({ layers: [], relations: [] })).toEqual([])
  })

  it('无 layerOrder 时回退用 layers 顺序', () => {
    const meta = nLayerMeta(['x', 'y'])
    delete meta.layerOrder
    const s = buildMasterSlaveSchema(meta)
    expect(s[0].id).toBe('x')
    expect(s[0].children[0].id).toBe('y')
  })
})

describe('layerPaths', () => {
  it('点式 path 深度优先、父在前；path 段用层 id（= 数据包 childRows 的键）', () => {
    const paths = layerPaths(nLayerMeta(['cv_batch', 'cv_header', 'cv_line']))
    expect(paths.map((p) => p.path)).toEqual([
      'cv_batch', 'cv_batch.cv_header', 'cv_batch.cv_header.cv_line',
    ])
    expect(paths[1].levelName).toBe('层2')
    expect(paths[2].columns.length).toBe(5)
  })
})

describe('buildColumnModel', () => {
  it('列头 caption/类型/宽度来自元数据；业务列前置、系统列后置', () => {
    const meta = nLayerMeta(['a', 'b'])
    const m = buildColumnModel(C, 'a', meta.layers[0].columns)
    expect(m.datasetId).toBe('a')
    const ids = m.members.map((c) => c.id)
    expect(ids.indexOf('biz_a')).toBeLessThan(ids.indexOf('id'))
    expect(ids.indexOf('amount')).toBeLessThan(ids.indexOf('create_time'))
    const amount = m.members.find((c) => c.id === 'amount')
    expect(amount.caption).toBe('金额')
    expect(amount.align).toBe('right') // DECIMAL 靠右
    expect(m.members.find((c) => c.id === 'id').editMode).toBe('readonly')
  })

  it('includeSystem:false 时隐藏系统列', () => {
    const meta = nLayerMeta(['a'])
    const m = buildColumnModel(C, 'a', meta.layers[0].columns, { includeSystem: false })
    const ids = m.members.map((c) => c.id)
    expect(ids).not.toContain('id')
    expect(ids).not.toContain('create_time')
    expect(ids).toContain('biz_a')
  })
})

describe('orderColumns', () => {
  it('业务列在前、系统列在后，各自保序', () => {
    const cols = [
      { name: 'id' }, { name: 'name' }, { name: 'upper_id' }, { name: 'amount' }, { name: 'create_by' },
    ]
    const out = orderColumns(cols).map((c) => c.name)
    expect(out).toEqual(['name', 'amount', 'id', 'upper_id', 'create_by'])
  })
})

