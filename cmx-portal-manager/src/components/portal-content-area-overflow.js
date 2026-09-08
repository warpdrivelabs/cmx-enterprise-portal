import {
  TAB_OVERFLOW_BTN_RESERVE,
  computeVisibleTabRange,
  hiddenTabIndices,
} from '../lib/tab-strip-overflow.js'
import { safeUi5IconName } from '../lib/workspace-node.js'

export function wireTabOverflowRoot (host) {
  /* 标签栏尾部的停靠面板切换按钮（属性/日志）：与快捷键 Ctrl+P / Ctrl+J 同一开关 */
  for (const [id, fn] of [['dock-toggle-property', '_toggleProperty']]) {
    const b = host.shadowRoot.getElementById(id)
    if (b && !b.dataset.portalDockBound) {
      b.dataset.portalDockBound = '1'
      // host 是 content-area 组件；开关方法在宿主 portal-app 上（content-area 挂在其 shadow 内）
      b.addEventListener('click', () => {
        const app = (typeof host.getRootNode === 'function' && host.getRootNode()?.host) || host
        if (typeof app[fn] === 'function') app[fn]()
      })
    }
  }
  const menu = host.shadowRoot.getElementById('tab-overflow-menu')
  const btn = host.shadowRoot.getElementById('tab-bar-overflow-btn')
  if (menu && !menu.dataset.portalOverflowBound) {
    menu.dataset.portalOverflowBound = '1'
    menu.addEventListener('item-click', (e) => {
      const item = e.detail?.item
      const tid = item?.getAttribute?.('data-tab-id') || item?.dataset?.tabId
      if (tid) {
        host._selectTab(tid)
        menu.open = false
      }
    })
  }
  if (btn && !btn.dataset.portalOverflowBound) {
    btn.dataset.portalOverflowBound = '1'
    btn.addEventListener('click', () => {
      if (!menu) return
      menu.opener = btn
      menu.open = true
    })
  }
}

export function layoutTabStripOverflow (host) {
  const row = host.shadowRoot.getElementById('tab-bar-row')
  const strip = host.shadowRoot.getElementById('tab-bar-strip')
  const wrap = host.shadowRoot.getElementById('tab-bar-overflow-wrap')
  const btn = host.shadowRoot.getElementById('tab-bar-overflow-btn')
  const menu = host.shadowRoot.getElementById('tab-overflow-menu')
  if (!row || !strip || !wrap || !btn || !menu) return
  const items = [...strip.querySelectorAll('.tab-item')]
  if (!items.length) {
    wrap.style.display = 'none'
    return
  }
  items.forEach((el) => {
    el.style.display = 'flex'
    el.style.flexShrink = '0'
  })
  const widths = items.map((el) => el.getBoundingClientRect().width)
  const ai = host._tabs.findIndex(t => t.id === host._activeTab)
  const activeIdx = ai >= 0 ? ai : 0
  const { start, end, needsOverflow } = computeVisibleTabRange(
    widths,
    activeIdx === -1 ? 0 : activeIdx,
    row.clientWidth,
    TAB_OVERFLOW_BTN_RESERVE
  )
  for (let i = 0; i < items.length; i++) {
    items[i].style.display = i >= start && i < end ? 'flex' : 'none'
  }
  wrap.style.display = needsOverflow ? '' : 'none'
  while (menu.firstChild) menu.removeChild(menu.firstChild)
  if (needsOverflow) {
    const hidden = hiddenTabIndices(host._tabs.length, start, end)
    for (const i of hidden) {
      const tab = host._tabs[i]
      if (!tab) continue
      const mi = document.createElement('ui5-menu-item')
      mi.setAttribute('text', tab.text)
      mi.setAttribute('icon', safeUi5IconName(tab.icon))
      mi.setAttribute('data-tab-id', tab.id)
      menu.appendChild(mi)
    }
  }
}
