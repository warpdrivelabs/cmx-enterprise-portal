/**
 * Tab 标签同条带内拖拽重排（content 顶部 tab-bar、各区域多视图 tab strip 复用）。
 *
 * 调用：
 *   wireTabStripReorder(strip, {
 *     itemSelector: '.tab-item',          // 一条 tab 元素的选择器
 *     onReorder: (fromIdx, toIdx) => {}   // 拖拽完成回调，由调用方处理数据顺序变更并重渲染
 *   })
 *
 * 设计：
 * - 只处理**同 strip 内**重排（dragstart 时记录 strip 引用，drop 时校验目标 strip 是同一个）。
 * - mime: `application/x-cmx-tab-reorder`（与 dock 跨区域拖拽 mime 不同，互不干扰）。
 * - dragover 时把目标项加 `.cmx-tab-reorder-target-before` / `-after` 显示插入指示线。
 * - 重复 wire 同一 strip 安全（用 dataset.cmxTabReorderWired 去重）。
 */
const REORDER_MIME = 'application/x-cmx-tab-reorder'
const TARGET_BEFORE = 'cmx-tab-reorder-target-before'
const TARGET_AFTER = 'cmx-tab-reorder-target-after'
const DRAGGING = 'cmx-tab-reorder-dragging'

/**
 * @param {HTMLElement} strip 条带容器
 * @param {{ itemSelector: string, onReorder: (fromIdx: number, toIdx: number) => void }} opts
 * @returns {() => void} unwire 函数
 */
export function wireTabStripReorder (strip, opts) {
  if (!(strip instanceof HTMLElement)) return () => {}
  if (strip.dataset.cmxTabReorderWired === '1') return () => {}
  strip.dataset.cmxTabReorderWired = '1'
  const { itemSelector, onReorder } = opts
  if (!itemSelector || typeof onReorder !== 'function') return () => {}

  const stripId = `__cmxTabStrip_${++_uid}`
  strip.dataset.cmxTabStripId = stripId

  /* 本条带是否正作为「重排拖拽源」：在本条带 onDragStart 置真、onDragEnd 置假。
     dragover 阶段浏览器禁止读取 dataTransfer 数据（getData 返回空），无法用 stripId 区分
     「本条带重排」与「别处拖来的 dock 落点」；故用此标志：仅当拖拽确实始于本条带时，
     dragover 才显示重排插入线并 preventDefault，避免给跨区域 dock 拖拽误加重排指示。 */
  let draggingFromThisStrip = false

  /** 把 strip 内所有匹配项设 draggable=true（已有 true 不动）。 */
  const ensureDraggable = () => {
    for (const el of strip.querySelectorAll(itemSelector)) {
      if (el instanceof HTMLElement && !el.draggable) el.draggable = true
    }
  }
  ensureDraggable()
  /* DOM 变更后（重渲染）保持 draggable。 */
  const mo = new MutationObserver(ensureDraggable)
  mo.observe(strip, { childList: true, subtree: true })

  /** 按 visual order 返回 strip 内匹配 itemSelector 的元素列表（CSS order 升序）。 */
  const visualItems = () => {
    const arr = Array.from(strip.querySelectorAll(itemSelector)).filter(
      (el) => el instanceof HTMLElement,
    )
    arr.sort((a, b) => {
      const oa = parseInt(a.style.order || '0', 10) || 0
      const ob = parseInt(b.style.order || '0', 10) || 0
      return oa - ob
    })
    return arr
  }

  const onDragStart = (e) => {
    const it = e.target instanceof Element ? e.target.closest(itemSelector) : null
    if (!(it instanceof HTMLElement) || it.parentElement?.closest('[data-cmx-tab-strip-id]') !== strip) return
    const items = visualItems()
    const idx = items.indexOf(it)
    if (idx < 0) return
    try {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData(REORDER_MIME, JSON.stringify({ stripId, fromIdx: idx }))
      /* 兼容某些浏览器要求至少一个 text 类型才能拖。 */
      e.dataTransfer.setData('text/plain', stripId)
    } catch { /* 忽略 */ }
    draggingFromThisStrip = true
    it.classList.add(DRAGGING)
  }

  const clearIndicators = () => {
    for (const el of strip.querySelectorAll(`.${TARGET_BEFORE},.${TARGET_AFTER}`)) {
      el.classList.remove(TARGET_BEFORE)
      el.classList.remove(TARGET_AFTER)
    }
  }

  /**
   * 清掉 strip 所在的 dock 面板高亮（`.cmx-ws-drop-target`）。
   * 同条带 reorder 因 stopPropagation 阻止了 dock 的 drop / dragleave，
   * 否则 dock 加上的蓝色虚线框残留在 pane 上。
   */
  const clearDockHighlight = () => {
    const sr = strip.getRootNode()
    const scope = sr instanceof ShadowRoot ? sr : strip.ownerDocument
    if (!scope || typeof scope.querySelectorAll !== 'function') return
    for (const el of scope.querySelectorAll('.cmx-ws-drop-target')) {
      el.classList.remove('cmx-ws-drop-target')
    }
  }

  /** 解析此次 drag 事件是否为本 strip 的 reorder（mime 类型 + stripId 比对）。 */
  const isOwnReorder = (e) => {
    const types = e.dataTransfer?.types
    if (!types) return false
    for (const t of types) if (t === REORDER_MIME) return true
    return false
  }

  const onDragOver = (e) => {
    if (!isOwnReorder(e)) return
    /* 只有「拖拽确实始于本条带」才作为重排处理；否则是别处拖来的 dock 落点，放行给外层 dock。 */
    if (!draggingFromThisStrip) return
    const it = e.target instanceof Element ? e.target.closest(itemSelector) : null
    if (!(it instanceof HTMLElement)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    /* 按指针 x（横排）或 y（竖排）决定 before/after：测元素中线判定。
       横排 strip 的 itemSelector 通常是 inline-flex，竖排（左/右 tab）少见——
       根据 strip 的 flex-direction 自动选择维度。 */
    const stripIsRow = isRowFlex(strip)
    const r = it.getBoundingClientRect()
    const before = stripIsRow ? (e.clientX < r.left + r.width / 2) : (e.clientY < r.top + r.height / 2)
    clearIndicators()
    it.classList.add(before ? TARGET_BEFORE : TARGET_AFTER)
  }

  const onDragLeave = (e) => {
    /* leave 到 strip 外才清；leave 到 strip 内的另一个 item 不清。 */
    const rel = e.relatedTarget
    if (rel instanceof Node && strip.contains(rel)) return
    clearIndicators()
  }

  const onDrop = (e) => {
    if (!isOwnReorder(e)) return
    let payload
    try { payload = JSON.parse(e.dataTransfer.getData(REORDER_MIME) || '{}') } catch { payload = null }
    /* 关键：每颗 `.cmx-ws-tab-btn` 同时被「同条带重排」(REORDER_MIME) 与「跨区域 dock」
       (PAYLOAD_MIME) 两套 DnD 绑定，故 drag payload 必然同时带这两个 mime。仅凭
       `isOwnReorder`（只判 REORDER_MIME 是否存在）无法区分「本条带重排」与「从别处拖到本条带的
       dock 落点」。必须先用 payload.stripId 比对：不是本条带的重排就**直接放行**——既不
       preventDefault 也不 stopPropagation，让事件继续冒泡到外层 dock / content 的 drop 监听
       完成停靠。否则跨区域拖到 tab 条/按钮上的 dock 会被这里吞掉（视图无法 dock）。 */
    if (!payload || payload.stripId !== stripId) { clearIndicators(); return }
    e.preventDefault()
    /* 确认是本条带重排后，才阻止冒泡到外层 dock drop 监听（同一落点不应再触发 dock 流）。 */
    e.stopPropagation()
    const fromIdx = Number(payload.fromIdx)
    const it = e.target instanceof Element ? e.target.closest(itemSelector) : null
    const items = visualItems()
    if (!Number.isFinite(fromIdx) || fromIdx < 0 || fromIdx >= items.length) { clearIndicators(); return }
    let toIdx
    if (it instanceof HTMLElement) {
      const targetIdx = items.indexOf(it)
      const stripIsRow = isRowFlex(strip)
      const r = it.getBoundingClientRect()
      const before = stripIsRow ? (e.clientX < r.left + r.width / 2) : (e.clientY < r.top + r.height / 2)
      toIdx = before ? targetIdx : targetIdx + 1
    } else {
      /* drop 落在 strip 末尾空白：放到末尾 */
      toIdx = items.length
    }
    /* 数组移动语义：先取出 fromIdx，再插入到原 toIdx 位置。
       因为取出后 toIdx 可能要 -1（当 toIdx > fromIdx 时）。 */
    if (toIdx > fromIdx) toIdx -= 1
    clearIndicators()
    clearDockHighlight()
    if (toIdx === fromIdx) return
    try { onReorder(fromIdx, toIdx) } catch (err) { console.warn('[tab-reorder] onReorder threw', err) }
  }

  const onDragEnd = () => {
    draggingFromThisStrip = false
    clearIndicators()
    clearDockHighlight()
    for (const el of strip.querySelectorAll(`.${DRAGGING}`)) el.classList.remove(DRAGGING)
  }

  strip.addEventListener('dragstart', onDragStart)
  strip.addEventListener('dragover', onDragOver)
  strip.addEventListener('dragleave', onDragLeave)
  strip.addEventListener('drop', onDrop)
  strip.addEventListener('dragend', onDragEnd)

  return () => {
    mo.disconnect()
    strip.removeEventListener('dragstart', onDragStart)
    strip.removeEventListener('dragover', onDragOver)
    strip.removeEventListener('dragleave', onDragLeave)
    strip.removeEventListener('drop', onDrop)
    strip.removeEventListener('dragend', onDragEnd)
    delete strip.dataset.cmxTabReorderWired
    delete strip.dataset.cmxTabStripId
  }
}

function isRowFlex (el) {
  try {
    const dir = getComputedStyle(el).flexDirection || 'row'
    return dir === 'row' || dir === 'row-reverse'
  } catch { return true }
}

let _uid = 0

/**
 * 启动全局 MutationObserver：监听 document 内新增的多视图 region tab strip，
 * 自动 wire 同条带 reorder。helper 内部 dataset 去重，重复绑定安全。
 * 进程内单例（多次调用只生效一次）。
 */
let _autoWireStarted = false
export function startGlobalMultiViewReorderAutoWire () {
  if (_autoWireStarted) return
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return
  _autoWireStarted = true
  /* 初始扫一遍当前 DOM。 */
  try { wireMultiViewTabReorderInRoot(document) } catch (e) { console.warn('[tab-reorder] initial scan threw', e) }
  /* 也扫所有已存在 shadowRoot 内（portal 各自宿主）：MutationObserver 不能跨 shadow，
     这里递归一次 + 后续依赖各宿主调用 hydrateHtmlPagesWorkspaceViewsInRoot 末尾的 auto wire。 */
  scanShadowRoots(document)
  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.addedNodes && m.addedNodes.length) {
        for (const n of m.addedNodes) {
          if (!(n instanceof Element)) continue
          try { wireMultiViewTabReorderInRoot(n) } catch { /* ignore */ }
          scanShadowRoots(n)
        }
      }
    }
  })
  mo.observe(document.documentElement || document.body, { childList: true, subtree: true })
}

function scanShadowRoots (root) {
  if (!root || typeof root.querySelectorAll !== 'function') return
  /* 找出 root 内所有带 shadowRoot 的 host 元素，递归到它们的 shadowRoot 扫一遍。 */
  const all = root.querySelectorAll('*')
  for (const el of all) {
    const sr = /** @type {any} */ (el).shadowRoot
    if (sr && typeof sr.querySelectorAll === 'function') {
      try { wireMultiViewTabReorderInRoot(sr) } catch { /* ignore */ }
      scanShadowRoots(sr)
    }
  }
}

/**
 * 便利：扫 root 内所有多视图 region 的 tab strip（顶/底），给每条装"同条带 reorder"。
 *
 * **关键实现**：用 CSS `order` 视觉重排，**DOM 顺序保持不变**——这是为了不触发 CE 的
 * disconnectedCallback。如果 DOM swap（insertBefore）会让 CE 临时 disconnect，触发
 * mainapp 的 `unregisterView` 把视图从 `workspace.pageview` 摘除，导致跨视图 API 调用失败。
 *
 * tab strip 是 flex row、region body 是 flex column —— 子元素 `style.order` 即可
 * 决定视觉顺序，DOM 顺序不变。
 *
 * 重复调用安全（每条 strip 已 wired 不重装）。返回 unwire 函数（断开本次新增的监听）。
 *
 * @param {ParentNode | null | undefined} root 根容器（如某区域宿主的 shadow root 或缓存根）
 * @returns {() => void}
 */
export function wireMultiViewTabReorderInRoot (root) {
  if (!root || typeof root.querySelectorAll !== 'function') return () => {}
  const unwires = []
  const strips = root.querySelectorAll('.cmx-ws-region-tabs-bottom, .cmx-ws-region-tabs-top')
  for (const strip of strips) {
    if (!(strip instanceof HTMLElement)) continue
    const region = strip.closest('.cmx-ws-region')
    if (!(region instanceof HTMLElement)) continue
    const body = region.querySelector('.cmx-ws-region-body')
    const unwire = wireTabStripReorder(strip, {
      itemSelector: '.cmx-ws-tab-btn',
      onReorder: (fromIdx, toIdx) => {
        reorderByCssOrder(strip, body instanceof HTMLElement ? body : null, '.cmx-ws-tab-btn', '.cmx-ws-tab-pane', fromIdx, toIdx)
      },
    })
    unwires.push(unwire)
  }
  return () => { for (const u of unwires) try { u() } catch { /* ignore */ } }
}

/**
 * 通用：用 CSS `order` 重排 strip 子元素 + body 内对应 pane（按 `pairAttr` 配对）。
 * 不改 DOM 顺序——CE 不 disconnect，视图 API 注册保持。
 *
 * fromIdx / toIdx 是 **visual** 索引（按当前 order 排序后的位置）。
 *
 * @param {HTMLElement} strip
 * @param {HTMLElement | null} body 含 pane 的容器（pane 用 `pairAttr` 与 btn 配对）；null 时不重排 pane
 * @param {string} btnSelector tab 按钮选择器
 * @param {string} paneSelector pane 选择器
 * @param {number} fromIdx
 * @param {number} toIdx
 * @param {{ pairAttr?: string }} [opts] `pairAttr` 默认 `data-pane-index`
 */
export function reorderByCssOrder (strip, body, btnSelector, paneSelector, fromIdx, toIdx, opts = {}) {
  if (!(strip instanceof HTMLElement)) return
  const pairAttr = String(opts.pairAttr || 'data-pane-index')
  /* 取**按当前 visual order 排序**的 btn 数组。 */
  const sorted = Array.from(strip.querySelectorAll(btnSelector)).filter(
    (el) => el instanceof HTMLElement,
  )
  sorted.sort((a, b) => visualOrderOf(a) - visualOrderOf(b))
  if (fromIdx < 0 || fromIdx >= sorted.length) return
  const moved = sorted.splice(fromIdx, 1)[0]
  const clampedTo = Math.max(0, Math.min(toIdx, sorted.length))
  sorted.splice(clampedTo, 0, moved)
  /* 重写 order：visual 第 i 位的 btn 设 order = i+1（避免与默认 0 混淆）。 */
  for (let i = 0; i < sorted.length; i++) {
    const btn = sorted[i]
    btn.style.order = String(i + 1)
    /* 同步对应 pane 的 order（按 pairAttr 配对）。 */
    if (body instanceof HTMLElement) {
      const key = btn.getAttribute(pairAttr) || ''
      if (key) {
        const pane = body.querySelector(`${paneSelector}[${pairAttr}="${CSS.escape(key)}"]`)
        if (pane instanceof HTMLElement) pane.style.order = String(i + 1)
      }
    }
  }
}

function visualOrderOf (el) {
  /* style.order 未设时为空串；computed 默认是 '0'，但我们的初始值也是 0，与 DOM 顺序一致。
     为避免 same-order 元素的稳定性问题，未设 order 的元素按 DOM 出现顺序使用一个递增 fallback。 */
  const v = parseInt(el.style.order || '0', 10)
  return Number.isFinite(v) ? v : 0
}


