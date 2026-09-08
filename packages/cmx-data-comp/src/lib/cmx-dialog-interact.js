/**
 * cmx-dialog-interact — 浮层对话框公共交互：标题栏拖拽 / 边角缩放 / 居中 / 像素吸附。
 *
 * 纯 DOM 实现，取自 CMXPortalManager 的 dialog-workspace-interact.js，抽到 cmx-data-comp
 * 作为单一真源，供 <cmx-floating-dialog> 与 PortalManager 的 dlg-box 系对话框共用。
 */

/**
 * 把对话框 box 的尺寸/位置固化为像素，便于后续拖拽缩放与 CSS 变量混用。
 * @param {HTMLElement} box
 * @param {HTMLElement} host
 */
export function snapDialogBoxToPixels (box, host) {
  const br = box.getBoundingClientRect()
  const hr = host.getBoundingClientRect()
  box.style.width = `${Math.round(br.width)}px`
  box.style.height = `${Math.round(br.height)}px`
  box.style.left = `${Math.round(br.left - hr.left)}px`
  box.style.top = `${Math.round(br.top - hr.top)}px`
}

/**
 * 在宿主视区内居中 .dlg-box；首帧尺寸尚未稳定时会尝试若干次。
 * @param {HTMLElement} box
 * @param {HTMLElement} host
 * @param {number} [attempt]
 */
export function centerDialogBox (box, host, attempt = 0) {
  if (!(box instanceof HTMLElement)) return
  const vw = host.clientWidth
  const vh = host.clientHeight
  const w = box.offsetWidth
  const h = box.offsetHeight
  if (w < 8 || h < 8) {
    if (attempt < 24) requestAnimationFrame(() => centerDialogBox(box, host, attempt + 1))
    return
  }
  const left = Math.max(0, (vw - w) / 2)
  const top = Math.max(0, (vh - h) / 2)
  box.style.left = `${left}px`
  box.style.top = `${top}px`
}

/**
 * 标题栏拖拽：按下 bar 平移 box；右侧按钮区可通过 ignoreEnd 排除。
 * @param {{
 *   bar: HTMLElement,
 *   box: HTMLElement,
 *   host: HTMLElement,
 *   signal: AbortSignal,
 *   ignoreEnd?: HTMLElement|null,
 * }} opts
 */
export function wireDialogBoxDrag (opts) {
  const { bar, box, host, signal, ignoreEnd } = opts
  if (!(bar instanceof HTMLElement) || !(box instanceof HTMLElement)) return

  /** @type {{ pid: number, sx: number, sy: number, ol: number, ot: number }|null} */
  let drag = null

  bar.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return
    const path = typeof e.composedPath === 'function' ? e.composedPath() : []
    if (ignoreEnd instanceof HTMLElement) {
      const onEnd = path.some((n) => n instanceof Node && ignoreEnd.contains(n))
      if (onEnd) return
    }
    const br = box.getBoundingClientRect()
    const hr = host.getBoundingClientRect()
    drag = {
      pid: e.pointerId,
      sx: e.clientX,
      sy: e.clientY,
      ol: br.left - hr.left,
      ot: br.top - hr.top,
    }
    bar.setPointerCapture(e.pointerId)
    e.preventDefault()
  }, { signal })

  bar.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pid) return
    const vw = host.clientWidth
    const vh = host.clientHeight
    const dw = box.offsetWidth
    const dh = box.offsetHeight
    let nl = drag.ol + (e.clientX - drag.sx)
    let nt = drag.ot + (e.clientY - drag.sy)
    nl = Math.max(0, Math.min(Math.max(0, vw - dw), nl))
    nt = Math.max(0, Math.min(Math.max(0, vh - dh), nt))
    box.style.left = `${nl}px`
    box.style.top = `${nt}px`
  }, { signal })

  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.pid) return
    try { bar.releasePointerCapture(e.pointerId) } catch { /* 已释放或非捕获指针 */ }
    drag = null
  }
  bar.addEventListener('pointerup', endDrag, { signal })
  bar.addEventListener('pointercancel', endDrag, { signal })
}

/**
 * 四边/四角拖拽缩放：rootEl 为内含 [data-dlg-resize] 手柄的容器（通常是 .dlg-resize-root）。
 * @param {{
 *   rootEl: HTMLElement,
 *   box: HTMLElement,
 *   host: HTMLElement,
 *   signal: AbortSignal,
 *   minWidth: number,
 *   minHeight: number,
 * }} opts
 */
export function wireDialogBoxResize (opts) {
  const { rootEl, box, host, signal, minWidth, minHeight } = opts
  if (!(rootEl instanceof HTMLElement) || !(box instanceof HTMLElement)) return

  rootEl.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return
    const path = typeof e.composedPath === 'function' ? e.composedPath() : []
    const hit = path.find(
      (n) => n instanceof HTMLElement && n.dataset.dlgResize != null && String(n.dataset.dlgResize).trim() !== '',
    )
    if (!(hit instanceof HTMLElement)) return
    const mode = String(hit.dataset.dlgResize || '').trim()
    if (!mode) return

    snapDialogBoxToPixels(box, host)

    const hr = host.getBoundingClientRect()
    const br = box.getBoundingClientRect()
    const start = {
      sw: Math.round(br.width),
      sh: Math.round(br.height),
      sl: Math.round(br.left - hr.left),
      st: Math.round(br.top - hr.top),
      sx: e.clientX,
      sy: e.clientY,
      mode,
    }
    const pid = e.pointerId

    const apply = (clientX, clientY) => {
      const dx = clientX - start.sx
      const dy = clientY - start.sy
      const m = start.mode
      let newW = start.sw
      let newH = start.sh
      let newL = start.sl
      let newT = start.st

      if (m.includes('e')) newW = start.sw + dx
      if (m.includes('w')) {
        newW = start.sw - dx
        newL = start.sl + dx
      }
      if (m.includes('s')) newH = start.sh + dy
      if (m.includes('n')) {
        newH = start.sh - dy
        newT = start.st + dy
      }

      const vw = host.clientWidth
      const vh = host.clientHeight

      newW = Math.max(minWidth, newW)
      newH = Math.max(minHeight, newH)
      newL = Math.max(0, Math.min(newL, vw - newW))
      newT = Math.max(0, Math.min(newT, vh - newH))
      newW = Math.min(newW, vw - newL)
      newH = Math.min(newH, vh - newT)
      newW = Math.max(minWidth, newW)
      newH = Math.max(minHeight, newH)

      box.style.left = `${Math.round(newL)}px`
      box.style.top = `${Math.round(newT)}px`
      box.style.width = `${Math.round(newW)}px`
      box.style.height = `${Math.round(newH)}px`
    }

    hit.setPointerCapture(pid)
    e.preventDefault()
    e.stopPropagation()

    const onMove = (ev) => {
      if (ev.pointerId !== pid) return
      apply(ev.clientX, ev.clientY)
    }
    const onEnd = (ev) => {
      if (ev.pointerId !== pid) return
      hit.removeEventListener('pointermove', onMove)
      hit.removeEventListener('pointerup', onEnd)
      hit.removeEventListener('pointercancel', onEnd)
      try { hit.releasePointerCapture(pid) } catch { /* 已释放 */ }
    }
    hit.addEventListener('pointermove', onMove)
    hit.addEventListener('pointerup', onEnd)
    hit.addEventListener('pointercancel', onEnd)
  }, { signal })
}
