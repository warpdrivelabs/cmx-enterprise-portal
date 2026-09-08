// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import '../cmx-desc-list.js'
import '../cmx-panel.js'
import '../cmx-toolbar.js'
import '../cmx-filter-bar.js'

describe('tone 不导致无限递归', () => {
  it('cmx-desc-list tone=cyan', () => {
    const el = document.createElement('cmx-desc-list')
    el.setAttribute('tone', 'cyan')
    document.body.appendChild(el)
    expect(el.getAttribute('data-cmx-skin-tone')).toBe('cyan')
  })
  it('cmx-panel tone=violet', () => {
    const el = document.createElement('cmx-panel')
    el.setAttribute('tone', 'violet')
    document.body.appendChild(el)
    expect(el.getAttribute('data-cmx-skin-tone')).toBe('violet')
  })
  it('cmx-toolbar tone=mint', () => {
    const el = document.createElement('cmx-toolbar')
    el.setAttribute('tone', 'mint')
    document.body.appendChild(el)
    expect(el.getAttribute('data-cmx-skin-tone')).toBe('mint')
  })
  it('cmx-filter-bar tone=azure', () => {
    const el = document.createElement('cmx-filter-bar')
    el.setAttribute('tone', 'azure')
    document.body.appendChild(el)
    expect(el.getAttribute('data-cmx-skin-tone')).toBe('azure')
  })
})
