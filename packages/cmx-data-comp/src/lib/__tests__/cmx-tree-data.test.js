import { describe, expect, it } from 'vitest'
import {
  toPlainRow,
  buildTreeFromFlat,
  normalizeTreeData,
  walkTree,
  flattenTree,
  collectIds,
} from '../cmx-tree-data.js'

describe('cmx-tree-data · toPlainRow', () => {
  it('clones plain objects without mutating the source', () => {
    const src = { id: 'a', name: 'A' }
    const out = toPlainRow(src)
    expect(out).toEqual({ id: 'a', name: 'A' })
    expect(out).not.toBe(src)
  })

  it('uses toPlainObject() when present (CmxRowSet) and strips _ keys', () => {
    const rowSet = {
      id: 'a',
      name: 'A',
      _ds: {},
      toPlainObject () { return { id: this.id, name: this.name } },
    }
    expect(toPlainRow(rowSet)).toEqual({ id: 'a', name: 'A' })
  })

  it('handles null / undefined gracefully', () => {
    expect(toPlainRow(null)).toEqual({})
    expect(toPlainRow(undefined)).toEqual({})
  })
})

describe('cmx-tree-data · buildTreeFromFlat', () => {
  const flat = [
    { id: '1', parentId: null, name: 'root' },
    { id: '1-1', parentId: '1', name: 'child-1' },
    { id: '1-2', parentId: '1', name: 'child-2' },
    { id: '1-1-1', parentId: '1-1', name: 'leaf' },
    { id: '2', parentId: '', name: 'root-2' },
  ]

  it('builds a nested tree honoring parentId links', () => {
    const tree = buildTreeFromFlat(flat)
    expect(tree).toHaveLength(2)
    const root = tree[0]
    expect(root.id).toBe('1')
    expect(root._children).toHaveLength(2)
    expect(root._children[0].id).toBe('1-1')
    expect(root._children[0]._children[0].id).toBe('1-1-1')
    expect(tree[1].id).toBe('2')
    expect(tree[1]._children).toBeUndefined()
  })

  it('does not mutate the input rows', () => {
    const src = flat.map((r) => ({ ...r }))
    buildTreeFromFlat(src)
    expect(src.every((r) => !('_children' in r))).toBe(true)
  })

  it('preserves sibling order from input', () => {
    const tree = buildTreeFromFlat(flat)
    expect(tree[0]._children.map((c) => c.id)).toEqual(['1-1', '1-2'])
  })

  it('treats a row whose parent is missing as a root', () => {
    const orphans = [
      { id: 'a', parentId: 'ghost' },
      { id: 'b', parentId: 'a' },
    ]
    const tree = buildTreeFromFlat(orphans)
    expect(tree.map((n) => n.id)).toContain('a')
    expect(tree.find((n) => n.id === 'a')._children[0].id).toBe('b')
  })

  it('does not infinite-loop on self reference', () => {
    const tree = buildTreeFromFlat([{ id: 'x', parentId: 'x' }])
    expect(tree).toHaveLength(1)
    expect(tree[0].id).toBe('x')
    expect(tree[0]._children).toBeUndefined()
  })

  it('does not lose rows that form a cycle (falls back to root)', () => {
    const cyclic = [
      { id: 'a', parentId: 'b' },
      { id: 'b', parentId: 'a' },
    ]
    const tree = buildTreeFromFlat(cyclic)
    expect(collectIds(tree).sort()).toEqual(['a', 'b'])
  })

  it('supports custom field names', () => {
    const rows = [
      { key: 'r', up: null },
      { key: 'c', up: 'r' },
    ]
    const tree = buildTreeFromFlat(rows, { idField: 'key', parentField: 'up', childField: 'kids' })
    expect(tree).toHaveLength(1)
    expect(tree[0].kids[0].key).toBe('c')
  })

  it('returns [] for empty / non-array input', () => {
    expect(buildTreeFromFlat([])).toEqual([])
    expect(buildTreeFromFlat(null)).toEqual([])
  })
})

describe('cmx-tree-data · normalizeTreeData', () => {
  it('rebuilds from flat rows when parent links exist and no nesting', () => {
    const flat = [
      { id: '1', parentId: null },
      { id: '1-1', parentId: '1' },
    ]
    const out = normalizeTreeData(flat)
    expect(out).toHaveLength(1)
    expect(out[0]._children[0].id).toBe('1-1')
  })

  it('passes through pre-nested data untouched (cloned)', () => {
    const nested = [{ id: '1', _children: [{ id: '1-1' }] }]
    const out = normalizeTreeData(nested)
    expect(out).toHaveLength(1)
    expect(out[0]._children[0].id).toBe('1-1')
    expect(out[0]).not.toBe(nested[0])
  })

  it('treats rows with neither nesting nor links as flat roots', () => {
    const rows = [{ id: 'a' }, { id: 'b' }]
    const out = normalizeTreeData(rows)
    expect(out).toHaveLength(2)
    expect(out[0]._children).toBeUndefined()
  })
})

describe('cmx-tree-data · walkTree / flattenTree / collectIds', () => {
  const tree = [
    { id: '1', _children: [
      { id: '1-1', _children: [{ id: '1-1-1' }] },
      { id: '1-2' },
    ] },
  ]

  it('walks in pre-order with depth and parent', () => {
    const visited = []
    walkTree(tree, (node, depth, parent) => visited.push([node.id, depth, parent?.id ?? null]))
    expect(visited).toEqual([
      ['1', 0, null],
      ['1-1', 1, '1'],
      ['1-1-1', 2, '1-1'],
      ['1-2', 1, '1'],
    ])
  })

  it('collects ids in pre-order', () => {
    expect(collectIds(tree)).toEqual(['1', '1-1', '1-1-1', '1-2'])
  })

  it('flattenTree is the inverse of buildTreeFromFlat (parentId restored)', () => {
    const flat = flattenTree(tree)
    expect(flat.find((r) => r.id === '1').parentId).toBeNull()
    expect(flat.find((r) => r.id === '1-1').parentId).toBe('1')
    expect(flat.find((r) => r.id === '1-1-1').parentId).toBe('1-1')
    expect(flat.every((r) => !('_children' in r))).toBe(true)

    // round-trip: flatten then rebuild yields the same id structure
    const rebuilt = buildTreeFromFlat(flat)
    expect(collectIds(rebuilt)).toEqual(collectIds(tree))
  })
})
