// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { CmxWebTreeview } from '../cmx-web-treeview.js'

describe('cmx-web-treeview selection rendering', () => {
  const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve))

  it('clears stale selected style when a virtual row is reused', () => {
    const tree = new CmxWebTreeview()
    tree.setAttribute('is-selected-member', 'is_selected')

    const row = document.createElement('div')
    row.className = 'ltree-node-row old-selected'
    const content = document.createElement('div')
    row.appendChild(content)
    document.body.appendChild(row)

    tree._applySelectionState({ data: { is_selected: 1 } }, content)
    expect(content.dataset.cmxTreeSelected).toBe('1')
    expect(content.style.background).toContain('--tv-selected-bg')
    expect(row.classList.contains('cmx-tree-node-selected')).toBe(true)

    tree.setAttribute('selected-node-class', 'old-selected')
    tree._applySelectionState({ data: { is_selected: 0 } }, content)

    expect(content.dataset.cmxTreeSelected).toBe('0')
    expect(content.style.background).toBe('')
    expect(content.style.borderRadius).toBe('')
    expect(row.classList.contains('cmx-tree-node-selected')).toBe(false)
    expect(row.classList.contains('old-selected')).toBe(false)
    expect(row.hasAttribute('aria-selected')).toBe(false)

    document.body.removeChild(row)
  })

  it('normalizes stale selected row classes after data sync', async () => {
    const tree = new CmxWebTreeview()
    tree.setAttribute('is-selected-member', 'is_selected')
    tree.attachShadow({ mode: 'open' })
    const inner = document.createElement('div')
    inner.getExpandedPaths = () => []
    inner.setExpandedPaths = () => {}
    tree.shadowRoot.appendChild(inner)
    tree._inner = inner

    const staleRow = document.createElement('div')
    staleRow.className = 'ltree-node-row cmx-tree-node-selected old-selected'
    staleRow.setAttribute('aria-selected', 'true')
    const staleContent = document.createElement('div')
    staleContent.dataset.cmxTreeSelected = '0'
    staleRow.appendChild(staleContent)

    const selectedRow = document.createElement('div')
    selectedRow.className = 'ltree-node-row'
    const selectedContent = document.createElement('div')
    selectedContent.dataset.cmxTreeSelected = '1'
    selectedRow.appendChild(selectedContent)
    inner.append(staleRow, selectedRow)

    tree.setAttribute('selected-node-class', 'old-selected')
    tree._normalizeRenderedSelection()
    await nextFrame()

    expect(staleRow.classList.contains('cmx-tree-node-selected')).toBe(false)
    expect(staleRow.classList.contains('old-selected')).toBe(false)
    expect(staleRow.hasAttribute('aria-selected')).toBe(false)
    expect(selectedRow.classList.contains('cmx-tree-node-selected')).toBe(true)
    expect(selectedRow.getAttribute('aria-selected')).toBe('true')
  })

  it('rebinds dataset listeners after reconnect', () => {
    const tree = new CmxWebTreeview()
    tree.attachShadow({ mode: 'open' })
    const inner = document.createElement('web-treeview')
    inner.update = () => {}
    inner.getExpandedPaths = () => []
    tree.shadowRoot.appendChild(inner)

    const listeners = new Map()
    const ds = {
      rows: [],
      addEventListener: (name, handler) => listeners.set(name, handler),
      removeEventListener: (name) => listeners.delete(name),
    }
    tree._ds = ds

    tree.connectedCallback()
    expect(listeners.has('row-changed')).toBe(true)

    tree.disconnectedCallback()
    expect(listeners.has('row-changed')).toBe(false)

    tree.connectedCallback()
    expect(listeners.has('row-changed')).toBe(true)
  })
})
