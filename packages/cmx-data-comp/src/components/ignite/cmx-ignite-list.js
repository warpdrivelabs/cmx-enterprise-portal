/**
 * <cmx-ignite-list> — 行列表，绑定 CmxDataSet。
 *
 * 布局：data-cmx-layout="card" | 默认 igc-list
 * 外观：由页面注入，不内置业务皮肤
 *   - data-cmx-style-id="模板元素 id"（同根节点下 <template> 或 <style> 的文本）
 *   - setSkinStyles(cssText) 编程注入
 *
 * 事件：cmx-row-selected / cmx-item-selected  { id, row, index }
 */
import { registerIgniteLists } from './register-lists.js'
import {
  parseJsonAttr,
  isCmxDataSet,
  bindDataSetListeners,
  unbindDataSetListeners,
  dispatchCmx,
} from './cmx-ignite-shared.js'

const BASE_STYLES = `
:host { display: block; }
.cmx-list {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  min-width: 0;
}
.cmx-list-item {
  display: flex;
  align-items: center;
  box-sizing: border-box;
  cursor: pointer;
  min-width: 0;
}
.cmx-list-item__ic {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.cmx-list-item__ic ui5-icon { display: block; }
.cmx-list-item__body {
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
}
igc-list { width: 100%; }
:host([data-cmx-density="compact"]) igc-list-item::part(title) {
  font-size: var(--sapFontSize, 0.875rem);
  font-weight: 500;
}
:host([data-cmx-density="compact"]) igc-list-item::part(subtitle) {
  font-size: 0.75rem;
}
:host([data-cmx-density="compact"]) igc-list-item::part(start) ui5-icon {
  width: 0.875rem;
  height: 0.875rem;
}
`

export class CmxIgniteList extends HTMLElement {
  constructor () {
    super()
    this._items = []
    this._rows = []
    this._titleKey = 'title'
    this._subtitleKey = 'subtitle'
    this._selectedId = null
    this._cardLayout = false
  }

  connectedCallback () {
    if (this.shadowRoot) return
    this._cardLayout = this.getAttribute('data-cmx-layout') === 'card'
    if (!this._cardLayout) registerIgniteLists()
    this.attachShadow({ mode: 'open' })
    if (this._cardLayout) {
      this.shadowRoot.innerHTML = `<style id="cmx-list-base">${BASE_STYLES}</style><div id="list" class="cmx-list" role="list"></div>`
    } else {
      this.shadowRoot.innerHTML = `<style id="cmx-list-base">${BASE_STYLES}</style><igc-list id="list"></igc-list>`
    }
    this._list = this.shadowRoot.getElementById('list')
    this._list.addEventListener('click', (e) => this._onListClick(e))
    this._applyExternalSkin()
    this._bootstrapFromAttributes()
    this._renderItems()
  }

  disconnectedCallback () {
    this._detachDsRowListeners()
    unbindDataSetListeners(this)
  }

  /** 注入页面级 CSS（作用于组件 Shadow DOM 内 .cmx-list* 结构） */
  setSkinStyles (cssText) {
    if (!this.shadowRoot) return this
    let el = this.shadowRoot.getElementById('cmx-list-skin')
    if (!el) {
      el = document.createElement('style')
      el.id = 'cmx-list-skin'
      const base = this.shadowRoot.getElementById('cmx-list-base')
      if (base?.nextSibling) this.shadowRoot.insertBefore(el, base.nextSibling)
      else this.shadowRoot.appendChild(el)
    }
    el.textContent = cssText || ''
    return this
  }

  _applyExternalSkin () {
    const id = this.getAttribute('data-cmx-style-id')
    if (!id) return
    const root = this.getRootNode()
    const node = (root && typeof root.getElementById === 'function' && root.getElementById(id))
      || document.getElementById(id)
    if (!node) return
    const css = node instanceof HTMLTemplateElement
      ? node.innerHTML
      : (node.textContent || '')
    if (css.trim()) this.setSkinStyles(css)
  }

  setColumnModel (model) {
    if (!model) return
    this._titleKey = model.toTitleCols || model.toTitleCol || 'title'
    this._subtitleKey = model.iconCol || 'subtitle'
    this._renderItems()
  }

  setItems (items) {
    this._items = Array.isArray(items) ? items.slice() : []
    this._renderItems()
  }

  setDataSet (dsOrRows) {
    if (isCmxDataSet(dsOrRows)) {
      this._detachDsRowListeners()
      unbindDataSetListeners(this)
      this._ds = dsOrRows
      this._rows = dsOrRows.rows
      bindDataSetListeners(this, dsOrRows, {
        onCursor: (row) => {
          this._selectedId = row?.id ?? null
          this._renderItems()
        },
        onRowChanged: () => this._renderItems(),
      })
      this._onDsChanged = () => {
        this._rows = dsOrRows.rows
        this._renderItems()
      }
      dsOrRows.addEventListener('ds-row-added', this._onDsChanged)
      dsOrRows.addEventListener('ds-row-removed', this._onDsChanged)
    } else {
      this._detachDsRowListeners()
      unbindDataSetListeners(this)
      this._ds = null
      this._rows = Array.isArray(dsOrRows) ? dsOrRows : []
    }
    this._renderItems()
  }

  _detachDsRowListeners () {
    if (this._ds && this._onDsChanged) {
      this._ds.removeEventListener('ds-row-added', this._onDsChanged)
      this._ds.removeEventListener('ds-row-removed', this._onDsChanged)
    }
    this._onDsChanged = null
  }

  _bootstrapFromAttributes () {
    const items = parseJsonAttr(this, 'data-cmx-items')
    const rows = parseJsonAttr(this, 'data-cmx-rows')
    const opts = parseJsonAttr(this, 'data-cmx-options')
    if (opts?.titleKey) this._titleKey = opts.titleKey
    if (opts?.subtitleKey) this._subtitleKey = opts.subtitleKey
    if (items) this.setItems(items)
    if (rows) this.setDataSet(rows)
  }

  _rowTitle (row) {
    return row[this._titleKey] ?? row.title ?? row.label ?? row.id ?? ''
  }

  _rowSubtitle (row) {
    const sub = row[this._subtitleKey] ?? row.subtitle
    return sub != null && sub !== '' ? String(sub) : ''
  }

  _rowIcon (row) {
    return row.__icon ?? row.icon ?? row.cmxIcon ?? null
  }

  _renderItems () {
    if (!this._list) return
    if (this._cardLayout) this._renderCardItems()
    else this._renderIgclistItems()
  }

  _renderCardItems () {
    this._list.innerHTML = ''
    const source = this._rows.length ? this._rows : this._items
    source.forEach((item, index) => {
      const row = typeof item === 'object' ? item : { id: String(index), title: String(item) }
      const id = row.id ?? String(index)
      const selected = this._selectedId != null && String(row.id) === String(this._selectedId)

      const el = document.createElement('div')
      el.className = 'cmx-list-item' + (selected ? ' is-selected' : '')
      el.setAttribute('role', 'listitem')
      el.dataset.cmxId = id
      el.dataset.cmxIndex = String(index)

      const iconName = this._rowIcon(row)
      if (iconName) {
        const ic = document.createElement('div')
        ic.className = 'cmx-list-item__ic'
        const icon = document.createElement('ui5-icon')
        icon.setAttribute('name', String(iconName))
        icon.setAttribute('design', 'Default')
        icon.setAttribute('mode', 'Decorative')
        ic.appendChild(icon)
        el.appendChild(ic)
      }

      const body = document.createElement('div')
      body.className = 'cmx-list-item__body'
      const titleEl = document.createElement('div')
      titleEl.className = 'cmx-list-item__title'
      titleEl.textContent = this._rowTitle(row)
      body.appendChild(titleEl)
      const sub = this._rowSubtitle(row)
      if (sub) {
        const desc = document.createElement('div')
        desc.className = 'cmx-list-item__desc'
        desc.textContent = sub
        body.appendChild(desc)
      }
      el.appendChild(body)
      this._list.appendChild(el)
    })
  }

  _renderIgclistItems () {
    this._list.innerHTML = ''
    const source = this._rows.length ? this._rows : this._items
    source.forEach((item, index) => {
      const row = typeof item === 'object' ? item : { id: String(index), title: String(item) }
      const li = document.createElement('igc-list-item')
      li.dataset.cmxId = row.id ?? String(index)
      li.dataset.cmxIndex = String(index)
      li.selected = this._selectedId != null && String(row.id) === String(this._selectedId)
      const iconName = this._rowIcon(row)
      if (iconName) {
        const thumb = document.createElement('ui5-icon')
        thumb.slot = 'thumbnail'
        thumb.setAttribute('name', String(iconName))
        thumb.setAttribute('design', 'Default')
        thumb.setAttribute('mode', 'Decorative')
        li.appendChild(thumb)
      }
      const title = document.createElement('span')
      title.slot = 'title'
      title.textContent = this._rowTitle(row)
      li.appendChild(title)
      const sub = this._rowSubtitle(row)
      if (sub) {
        const subtitle = document.createElement('span')
        subtitle.slot = 'subtitle'
        subtitle.textContent = sub
        li.appendChild(subtitle)
      }
      this._list.appendChild(li)
    })
  }

  _onListClick (e) {
    const li = this._cardLayout
      ? e.target.closest('.cmx-list-item')
      : e.target.closest('igc-list-item')
    if (!li) return
    const id = li.dataset.cmxId
    const index = Number(li.dataset.cmxIndex)
    const row = this._rows[index] || this._items[index] || { id }
    this._selectedId = id
    if (this._ds?.moveToId) this._ds.moveToId(id)
    else if (this._ds?.moveTo) this._ds.moveTo(index)
    this._renderItems()
    const detail = { id, row, index }
    dispatchCmx(this, 'cmx-row-selected', detail)
    dispatchCmx(this, 'cmx-item-selected', detail)
  }
}

customElements.define('cmx-ignite-list', CmxIgniteList)
