import {
  hydrateHtmlPagesWorkspaceViewsInRoot,
  renderWorkspaceRegionViewsHtml,
} from './workspace-node.js'

function clearChildren (el) {
  while (el.firstChild) el.removeChild(el.firstChild)
}

/**
 * @param {{ wsPane: HTMLElement|null, mountRoot: HTMLElement|null, prevMountRoot: HTMLElement|null }} opts
 * @returns {HTMLElement|null}
 */
export function attachFloatWorkspaceMount ({ wsPane, mountRoot, prevMountRoot }) {
  if (!(wsPane instanceof HTMLElement)) return prevMountRoot
  /* mountRoot=null（切到无 floatview 的 content tab）：保留 prevMountRoot 挂载，仅由调用方
     收起浮动窗口可见性即可。这样内部 html_pages CE 不会触发 disconnect → dispose 风暴。
     下次切到另一个有 floatview 的 tab 时，下方分支会发现 mountRoot ≠ prevMountRoot 再正常替换。 */
  if (!(mountRoot instanceof HTMLElement)) return prevMountRoot
  if (prevMountRoot && prevMountRoot !== mountRoot && prevMountRoot.parentElement === wsPane) {
    wsPane.removeChild(prevMountRoot)
  }
  if (mountRoot.parentElement !== wsPane) {
    clearChildren(wsPane)
    wsPane.appendChild(mountRoot)
  }
  return mountRoot
}

/** @param {HTMLElement|null} wsPane */
export function hydrateFloatWorkspacePane (wsPane) {
  if (!(wsPane instanceof HTMLElement)) return
  queueMicrotask(() => hydrateHtmlPagesWorkspaceViewsInRoot(wsPane))
}

/**
 * @param {{ wsPane: HTMLElement|null, spec: unknown, region: 'floatview' }} opts
 */
export function renderFloatWorkspaceFallback ({ wsPane, spec, region }) {
  if (!(wsPane instanceof HTMLElement)) return
  clearChildren(wsPane)
  // eslint-disable-next-line no-restricted-syntax -- renderWorkspaceRegionViewsHtml 已 escape
  wsPane.innerHTML = renderWorkspaceRegionViewsHtml(region, /** @type {any} */ (spec))
}

/** @param {HTMLElement|null} wsPane */
export function clearFloatWorkspacePane (wsPane) {
  if (!(wsPane instanceof HTMLElement)) return
  clearChildren(wsPane)
}
