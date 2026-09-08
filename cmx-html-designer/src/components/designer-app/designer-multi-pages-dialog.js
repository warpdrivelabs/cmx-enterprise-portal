import { listHtmlPages } from '../../api/html-pages-api.js';
import { openDialogCentered } from './dialog-center.js';

/**
 * @typedef {{ id: string, name: string, details: string, timestamp: string }} MultiPageRowMeta
 */

/**
 * @param {{
 *   shadowRoot: ShadowRoot,
 *   onConfirm: (pages: MultiPageRowMeta[]) => void | Promise<void>,
 * }} opts
 * @returns {{ openDialog: (modeOpts?: { mode?: 'multi'|'single', title?: string, onConfirm?: (pages: MultiPageRowMeta[]) => void | Promise<void> }) => void }}
 */
export function bindDesignerMultiPagesDialog (opts) {
  const { shadowRoot, onConfirm: defaultOnConfirm } = opts
  const dlg = shadowRoot.getElementById('multiPagesDlg')
  if (!dlg) {
    return { openDialog () {} }
  }
  const strip = shadowRoot.getElementById('multiPagesStrip')
  const pageInfo = shadowRoot.getElementById('multiPagesPageInfo')
  const tbody = shadowRoot.getElementById('multiPagesTbody')
  const btnPrev = shadowRoot.getElementById('multiPagesPrev')
  const btnNext = shadowRoot.getElementById('multiPagesNext')
  const btnRefresh = shadowRoot.getElementById('multiPagesRefresh')
  const btnSelectPage = shadowRoot.getElementById('multiPagesSelectPage')
  const btnClearSel = shadowRoot.getElementById('multiPagesClearSel')
  const btnClose = shadowRoot.getElementById('multiPagesCloseBtn')
  const btnOk = shadowRoot.getElementById('multiPagesOkBtn')
  const searchInput = shadowRoot.getElementById('multiPagesSearch')
  if (!strip || !pageInfo || !tbody || !btnPrev || !btnNext || !btnRefresh || !btnSelectPage || !btnClearSel || !btnClose || !btnOk) {
    return { openDialog () {} }
  }

  const state = {
    page: 1,
    pageSize: 20,
    total: 0,
    keyword: /** @type {string} */ (''),
    /** @type {Map<string, MultiPageRowMeta>} */
    selection: new Map(),
    mode: /** @type {'multi'|'single'} */ ('multi'),
    /** @type {((pages: MultiPageRowMeta[]) => void | Promise<void>) | null} */
    onConfirmOverride: null,
  }

  const setStatus = (text, isError = false) => {
    strip.replaceChildren()
    if (!text) {
      strip.hidden = true
      return
    }
    strip.hidden = false
    strip.design = isError ? 'Negative' : 'Information'
    strip.append(document.createTextNode(text))
  }

  const syncOkButton = () => {
    btnOk.disabled = state.selection.size === 0
  }

  const renderRows = (items) => {
    tbody.replaceChildren()
    for (const row of items) {
      const tr = document.createElement('tr')
      tr.dataset.id = row.id
      const c0 = document.createElement('td')
      c0.className = 'col-mp-check'
      const cb = document.createElement('input')
      cb.type = state.mode === 'single' ? 'radio' : 'checkbox'
      cb.name = 'mp-row-check-group'
      cb.className = 'mp-row-check'
      cb.setAttribute('aria-label', '选择')
      const meta = {
        id: row.id,
        name: typeof row.name === 'string' ? row.name : '',
        details: typeof row.details === 'string' ? row.details : '',
        timestamp: typeof row.timestamp === 'string' ? row.timestamp : '',
      }
      cb.checked = state.selection.has(row.id)
      cb.addEventListener('change', () => {
        if (state.mode === 'single') {
          /* 单选：清空再写入 */
          state.selection.clear()
          if (cb.checked) state.selection.set(row.id, meta)
        } else {
          if (cb.checked) state.selection.set(row.id, meta)
          else state.selection.delete(row.id)
        }
        updatePagerUi()
        syncOkButton()
      })
      c0.appendChild(cb)
      const c1 = document.createElement('td')
      c1.className = 'col-id'
      c1.textContent = row.id ?? ''
      const c2 = document.createElement('td')
      c2.className = 'col-name'
      c2.textContent = row.name ?? ''
      const cTs = document.createElement('td')
      cTs.className = 'col-timestamp'
      cTs.textContent = meta.timestamp
      const c3 = document.createElement('td')
      c3.className = 'col-details'
      c3.textContent = row.details ?? ''
      tr.append(c0, c1, c2, cTs, c3)
      /* 单选模式下，行点击亦切换为选中（与原生 radio 行为一致） */
      if (state.mode === 'single') {
        tr.addEventListener('click', (e) => {
          if (e.target instanceof HTMLInputElement) return
          cb.checked = true
          cb.dispatchEvent(new Event('change'))
        })
      }
      tbody.appendChild(tr)
    }
    syncOkButton()
  }

  const updatePagerUi = () => {
    const { page, pageSize, total } = state
    const pages = Math.max(1, Math.ceil(total / pageSize) || 1)
    if (state.mode === 'single') {
      pageInfo.textContent = `第 ${page} / ${pages} 页，共 ${total} 条（每页 ${pageSize} 条）`
    } else {
      pageInfo.textContent = `第 ${page} / ${pages} 页，共 ${total} 条（每页 ${pageSize} 条），已选 ${state.selection.size} 个`
    }
    btnPrev.disabled = page <= 1
    btnNext.disabled = page >= pages || total === 0
  }

  const loadPage = async () => {
    setStatus('加载中…', false)
    try {
      const filter = state.keyword ? { keyword: state.keyword } : {}
      const { items, total, page, pageSize } = await listHtmlPages(state.page, state.pageSize, filter)
      state.total = total
      state.page = page
      state.pageSize = pageSize
      renderRows(items || [])
      updatePagerUi()
      setStatus(items?.length ? '' : '当前没有已保存的页面。', false)
    } catch (err) {
      renderRows([])
      updatePagerUi()
      setStatus(err.message || String(err), true)
    }
  }

  btnPrev.addEventListener('click', async () => {
    if (state.page > 1) {
      state.page -= 1
      await loadPage()
    }
  })

  btnNext.addEventListener('click', async () => {
    const { page, pageSize, total } = state
    const pages = Math.max(1, Math.ceil(total / pageSize))
    if (page < pages) {
      state.page += 1
      await loadPage()
    }
  })

  btnRefresh.addEventListener('click', () => loadPage())

  /* 搜索：300ms 防抖；Enter 立即触发并清掉 pending 防抖。每次搜索重置到第 1 页。 */
  let searchTimer = null
  const triggerSearch = () => {
    if (searchTimer) {
      clearTimeout(searchTimer)
      searchTimer = null
    }
    state.page = 1
    void loadPage()
  }
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      state.keyword = (searchInput.value || '').trim()
      if (searchTimer) clearTimeout(searchTimer)
      searchTimer = setTimeout(triggerSearch, 300)
    })
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        triggerSearch()
      }
    })
  }

  btnSelectPage.addEventListener('click', () => {
    const rows = tbody.querySelectorAll('tr[data-id]')
    rows.forEach((tr) => {
      const id = tr.dataset.id
      if (!id) return
      const cb = tr.querySelector('.mp-row-check')
      if (!(cb instanceof HTMLInputElement)) return
      cb.checked = true
      const name = tr.querySelector('.col-name')?.textContent ?? ''
      const details = tr.querySelector('.col-details')?.textContent ?? ''
      const timestamp = tr.querySelector('.col-timestamp')?.textContent ?? ''
      state.selection.set(id, { id, name, details, timestamp })
    })
    updatePagerUi()
    syncOkButton()
  })

  btnClearSel.addEventListener('click', () => {
    state.selection.clear()
    tbody.querySelectorAll('.mp-row-check').forEach((el) => {
      if (el instanceof HTMLInputElement) el.checked = false
    })
    updatePagerUi()
    syncOkButton()
  })

  btnClose.addEventListener('click', () => {
    dlg.open = false
  })

  btnOk.addEventListener('click', async () => {
    const pages = [...state.selection.values()]
    if (!pages.length) return
    setStatus('正在从服务器加载页面…', false)
    btnOk.disabled = true
    try {
      const cb = state.onConfirmOverride || defaultOnConfirm
      await Promise.resolve(cb(pages))
      dlg.open = false
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err), true)
    } finally {
      syncOkButton()
    }
  })

  const onDlgClosed = () => {
    setStatus('')
    strip.hidden = true
    tbody.replaceChildren()
    pageInfo.textContent = ''
    if (searchTimer) {
      clearTimeout(searchTimer)
      searchTimer = null
    }
    state.keyword = ''
    if (searchInput) searchInput.value = ''
  }

  dlg.addEventListener('close', onDlgClosed)
  dlg.addEventListener('ui5-close', onDlgClosed)

  return {
    openDialog (modeOpts) {
      const o = modeOpts && typeof modeOpts === 'object' ? modeOpts : {}
      state.mode = o.mode === 'single' ? 'single' : 'multi'
      state.onConfirmOverride = typeof o.onConfirm === 'function' ? o.onConfirm : null
      state.page = 1
      state.pageSize = 20
      state.total = 0
      state.keyword = ''
      state.selection.clear()
      if (searchInput) searchInput.value = ''

      /* 切换批量操作按钮可见性（单选模式下隐藏，全选/清空选择无意义） */
      const isSingle = state.mode === 'single'
      btnSelectPage.hidden = isSingle
      btnClearSel.hidden = isSingle

      /* 标题切换：用 modeOpts.title（如「选择 HTML 页面」），保留对话框头中已有 ui5-title 的覆盖 */
      const titleEl = dlg.querySelector('[slot="header"] ui5-title')
      if (titleEl) {
        titleEl.textContent = typeof o.title === 'string' && o.title
          ? o.title
          : (isSingle ? '选择一个页面' : '选择多个页面')
      }

      openDialogCentered(dlg)
      void loadPage()
    },
  }
}
