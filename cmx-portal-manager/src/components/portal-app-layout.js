import { normalizeWorkspaceRegionViews } from '../lib/workspace-node.js'

export const MIN_SIDENAV = 160
export const MAX_SIDENAV = 600
export const MIN_PROPERTY = 200
export const MAX_PROPERTY = 700
export const MIN_LOG = 80
export const MAX_LOG = 600

/**
 * 当前 Content 标签的 `workspaceShell` 是否包含某区域且至少有一个视图。
 * @param {Record<string, unknown>|null|undefined} sh
 * @param {'property'|'bottom'} key
 */
export function shellHasWorkspaceRegionViews (sh, key) {
  if (!sh || typeof sh !== 'object' || !Object.prototype.hasOwnProperty.call(sh, key)) return false
  return normalizeWorkspaceRegionViews(/** @type {import('../lib/workspace-node.js').WorkspaceRegionViewsInput} */ (sh[key])).length > 0
}

/**
 * 当前 Content 标签下是否显示属性 / 底部 dock：`shell` 有该区域视图且用户未显式收起（`pref !== false`）。
 * @param {boolean} shellHasViews
 * @param {boolean|undefined} pref
 */
export function dockOpenFromPref (shellHasViews, pref) {
  return !!shellHasViews && pref !== false
}

/**
 * 将 CSS 变量和 data-hidden 属性同步到 Shadow DOM，控制各面板显隐。
 * @param {HTMLElement} host
 */
export function applyLayout (host) {
  const root = host.shadowRoot.host
  root.style.setProperty('--sidenav-width', host._sideNavWidth + 'px')
  root.style.setProperty('--property-width', host._propertyWidth + 'px')
  root.style.setProperty('--log-height', host._logHeight + 'px')

  const sidenavPane = host.shadowRoot.getElementById('sidenav-pane')
  const splitterLeft = host.shadowRoot.getElementById('splitter-left')
  if (host._sideNavVisible) {
    sidenavPane.removeAttribute('data-hidden')
    splitterLeft.removeAttribute('data-hidden')
  } else {
    sidenavPane.setAttribute('data-hidden', '')
    splitterLeft.setAttribute('data-hidden', '')
  }

  const shellbar = host.shadowRoot.querySelector('portal-shellbar')
  shellbar?.setStartButtonIcon?.(host._sideNavVisible ? 'menu' : 'menu2')

  const propertyPane = host.shadowRoot.getElementById('property-pane')
  const splitterRight = host.shadowRoot.getElementById('splitter-right')
  if (host._propertyVisible) {
    propertyPane.removeAttribute('data-hidden')
    splitterRight.removeAttribute('data-hidden')
  } else {
    propertyPane.setAttribute('data-hidden', '')
    splitterRight.setAttribute('data-hidden', '')
  }

  const logPane = host.shadowRoot.getElementById('log-pane')
  const splitterBottom = host.shadowRoot.getElementById('splitter-bottom')
  if (host._logVisible) {
    logPane.removeAttribute('data-hidden')
    splitterBottom.removeAttribute('data-hidden')
  } else {
    logPane.setAttribute('data-hidden', '')
    splitterBottom.setAttribute('data-hidden', '')
  }
}

/**
 * 初始化单个 splitter 拖拽行为。
 * @param {HTMLElement|null} el
 * @param {'h'|'v'} direction  h=水平拖动（调宽度），v=垂直拖动（调高度）
 * @param {() => number} getSize
 * @param {(val: number) => void} setSize
 * @param {boolean} [invert]
 */
export function initSplitter (el, direction, getSize, setSize, invert = false) {
  if (!el) return
  el.addEventListener('mousedown', e => {
    e.preventDefault()
    const startPos = direction === 'v' ? e.clientY : e.clientX
    const startSize = getSize()
    el.classList.add('dragging')

    const onMove = e => {
      const delta = (direction === 'v' ? e.clientY : e.clientX) - startPos
      setSize(startSize + (invert ? -delta : delta))
    }
    const onUp = () => {
      el.classList.remove('dragging')
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  })
}

/**
 * 为 host 的三个 splitter（左/右/底）绑定拖拽调整逻辑。
 * @param {HTMLElement} host
 */
export function setupSplitters (host) {
  initSplitter(
    host.shadowRoot.getElementById('splitter-left'),
    'h',
    () => host._sideNavWidth,
    val => {
      host._sideNavWidth = Math.max(MIN_SIDENAV, Math.min(MAX_SIDENAV, val))
      host.shadowRoot.host.style.setProperty('--sidenav-width', host._sideNavWidth + 'px')
    }
  )
  initSplitter(
    host.shadowRoot.getElementById('splitter-right'),
    'h',
    () => host._propertyWidth,
    val => {
      host._propertyWidth = Math.max(MIN_PROPERTY, Math.min(MAX_PROPERTY, val))
      host.shadowRoot.host.style.setProperty('--property-width', host._propertyWidth + 'px')
    },
    true
  )
  initSplitter(
    host.shadowRoot.getElementById('splitter-bottom'),
    'v',
    () => host._logHeight,
    val => {
      host._logHeight = Math.max(MIN_LOG, Math.min(MAX_LOG, val))
      host.shadowRoot.host.style.setProperty('--log-height', host._logHeight + 'px')
    },
    true
  )
}

/**
 * 将当前激活 Content 标签的属性 / 底部 dock 显隐写入标签状态（仅当该标签的 shell 含对应区域视图时写入）。
 * @param {HTMLElement} host
 * @param {'property'|'bottom'} region
 * @param {boolean} visible
 */
export function persistActiveTabDockOpen (host, region, visible) {
  const sr = host.shadowRoot
  const content = sr.getElementById('content-area')
  const sh = content?.getActiveWorkspaceShell?.()
  const id = content?.getActiveTabId?.()
  if (!content || typeof content.setTabWorkspaceDockOpen !== 'function' || !id) return
  if (region === 'property' && !shellHasWorkspaceRegionViews(sh, 'property')) return
  if (region === 'bottom' && !shellHasWorkspaceRegionViews(sh, 'bottom')) return
  content.setTabWorkspaceDockOpen(id, { [region]: !!visible })
}
