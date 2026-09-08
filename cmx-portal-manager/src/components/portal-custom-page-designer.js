import { apiFetch, apiPost } from 'cmx-ui5-runtime/api-client'
import { registerWorkspaceViewType } from '../lib/workspace-view-renderer.js'
import { escAttr, escHtml } from '../lib/escape.js'

const PAGE_ID_SAFE = /^[a-zA-Z0-9._-]{1,128}$/

function designerUrl (id = '', dam = null) {
  const u = new URL('/html/', window.location.origin)
  if (id) u.searchParams.set('id', id)
  /* C6②：裸开设计器（无 id，将新建页）时附带当前过滤的业务坐标，
     设计器侧 _readDamFromUrl 预填三下拉，消除裸建页缺坐标。 */
  if (dam && typeof dam === 'object') {
    for (const key of ['domain', 'app', 'module']) {
      const value = String(dam[key] || '').trim()
      if (value) u.searchParams.set(key, value)
    }
  }
  return u.toString()
}

function emptyPageHtml (id, name) {
  const title = escHtml(name || id || '新页面')
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
</head>
<body>
  <section data-node-id="page-root" style="box-sizing:border-box;min-height:100%;padding:24px;background:var(--sapBackgroundColor,#fff);color:var(--sapTextColor,#1d2d3e);font-family:var(--sapFontFamily,Arial,sans-serif);">
    <h1 data-node-id="page-title" style="margin:0;font-size:20px;font-weight:600;">${title}</h1>
  </section>
  <script type="application/json" id="__designer_meta__">{"pageData":[],"pageFns":[],"pageServices":[],"pageDeps":[],"pageInterfaces":[{"name":"initPage","enabled":true,"body":""},{"name":"onActivate","enabled":true,"body":""},{"name":"isDirty","enabled":true,"body":"return false;"},{"name":"getState","enabled":true,"body":"return {};"},{"name":"validate","enabled":true,"body":"return { valid: true };"}],"dataSources":[],"dataFlow":{"schema":[],"aggregations":[],"relations":[]},"models":[]}</script>
</body>
</html>`
}

export class PortalCustomPageDesigner extends HTMLElement {
  constructor () {
    super()
    this.attachShadow({ mode: 'open' })
    this._items = []
    this._total = 0
    this._page = 1
    this._pageSize = 20
    this._loading = false
    this._message = ''
    this._error = ''
    this._newOpen = false
    this._filters = { domain: '', app: '', module: '' }
    this._onClick = (e) => this._handleClick(e)
    this._onSubmit = (e) => this._handleSubmit(e)
    this._onInput = (e) => this._handleInput(e)
  }

  connectedCallback () {
    this._render()
    this.shadowRoot.addEventListener('click', this._onClick)
    this.shadowRoot.addEventListener('submit', this._onSubmit)
    this.shadowRoot.addEventListener('input', this._onInput)
    void this._load()
  }

  disconnectedCallback () {
    this.shadowRoot.removeEventListener('click', this._onClick)
    this.shadowRoot.removeEventListener('submit', this._onSubmit)
    this.shadowRoot.removeEventListener('input', this._onInput)
  }

  async _load () {
    this._loading = true
    this._error = ''
    this._render()
    try {
      const u = new URL('/api/html-pages', window.location.origin)
      u.searchParams.set('page', String(this._page))
      u.searchParams.set('pageSize', String(this._pageSize))
      for (const key of ['domain', 'app', 'module']) {
        const value = this._filters[key]?.trim()
        if (value) u.searchParams.set(key, value)
      }
      const data = (await apiFetch(u.toString())) || {}
      this._items = Array.isArray(data.items) ? data.items : []
      this._total = Number(data.total || this._items.length || 0)
      this._page = Number(data.page || this._page || 1)
      this._pageSize = Number(data.pageSize || this._pageSize || 20)
    } catch (err) {
      this._error = err instanceof Error ? err.message : String(err)
    } finally {
      this._loading = false
      this._render()
    }
  }

  _handleInput (e) {
    const t = e.target
    if (!(t instanceof HTMLInputElement)) return
    const field = t.dataset.filter
    if (field && Object.prototype.hasOwnProperty.call(this._filters, field)) {
      this._filters[field] = t.value
    }
  }

  _handleClick (e) {
    const el = e.target instanceof Element ? e.target.closest('[data-action]') : null
    if (!(el instanceof HTMLElement)) return
    const action = el.dataset.action
    if (action === 'refresh') {
      void this._load()
    } else if (action === 'open-designer') {
      const id = el.dataset.id || ''
      /* 无 id（顶部"打开设计器"按钮）= 新建场景：带上当前过滤坐标（C6②） */
      window.open(designerUrl(id, id ? null : this._filters), '_blank', 'noopener,noreferrer')
    } else if (action === 'new') {
      this._newOpen = true
      this._message = ''
      this._error = ''
      this._render()
      queueMicrotask(() => this.shadowRoot.getElementById('new-id')?.focus?.())
    } else if (action === 'cancel-new') {
      this._newOpen = false
      this._render()
    } else if (action === 'prev' && this._page > 1) {
      this._page -= 1
      void this._load()
    } else if (action === 'next' && this._page < this._pageCount()) {
      this._page += 1
      void this._load()
    }
  }

  async _handleSubmit (e) {
    e.preventDefault()
    const form = e.target
    if (!(form instanceof HTMLFormElement) || form.dataset.form !== 'new-page') return
    const fd = new FormData(form)
    const id = String(fd.get('id') || '').trim()
    const name = String(fd.get('name') || '').trim() || id
    if (!PAGE_ID_SAFE.test(id)) {
      this._error = '页面 ID 仅允许字母、数字、点、下划线、中横线，长度 1-128。'
      this._render()
      return
    }
    this._loading = true
    this._error = ''
    this._message = ''
    this._render()
    try {
      const body = {
        id,
        name,
        details: String(fd.get('details') || '').trim(),
        html: emptyPageHtml(id, name),
      }
      for (const key of ['domain', 'app', 'module']) {
        const value = String(fd.get(key) || '').trim()
        if (value) body[key] = value
      }
      await apiPost('/api/html-pages', body)
      this._newOpen = false
      this._message = `已创建页面 ${id}`
      await this._load()
      window.open(designerUrl(id), '_blank', 'noopener,noreferrer')
    } catch (err) {
      this._error = err instanceof Error ? err.message : String(err)
    } finally {
      this._loading = false
      this._render()
    }
  }

  _pageCount () {
    return Math.max(1, Math.ceil(this._total / this._pageSize))
  }

  _renderRows () {
    if (this._loading && !this._items.length) {
      return '<tr><td colspan="7" class="empty">加载中...</td></tr>'
    }
    if (!this._items.length) {
      return '<tr><td colspan="7" class="empty">暂无自定义页面</td></tr>'
    }
    return this._items.map((it) => {
      const id = String(it.id || '')
      const name = String(it.name || '')
      return `<tr>
        <td class="mono">${escHtml(id)}</td>
        <td>${escHtml(name || id)}</td>
        <td>${escHtml(it.domain || '')}</td>
        <td>${escHtml(it.app || '')}</td>
        <td>${escHtml(it.module || '')}</td>
        <td>${escHtml(it.timestamp || '')}</td>
        <td class="actions"><ui5-button icon="edit" design="Transparent" data-action="open-designer" data-id="${escAttr(id)}" tooltip="在 HTML 设计器中打开"></ui5-button></td>
      </tr>`
    }).join('')
  }

  _renderNewDialog () {
    if (!this._newOpen) return ''
    return `<div class="overlay" role="presentation">
      <form class="dialog" data-form="new-page">
        <header>
          <h2>新建自定义页面</h2>
          <ui5-button icon="decline" design="Transparent" data-action="cancel-new" tooltip="关闭"></ui5-button>
        </header>
        <label>页面 ID<input id="new-id" name="id" required maxlength="128" placeholder="fi.cmxfico.gl.demo-page"></label>
        <label>名称<input name="name" maxlength="80" placeholder="页面名称"></label>
        <label>说明<input name="details" maxlength="200" placeholder="页面用途"></label>
        <div class="grid3">
          <label>Domain<input name="domain" value="${escAttr(this._filters.domain)}" placeholder="fi"></label>
          <label>App<input name="app" value="${escAttr(this._filters.app)}" placeholder="gl"></label>
          <label>Module<input name="module" value="${escAttr(this._filters.module)}" placeholder="gl"></label>
        </div>
        <footer>
          <ui5-button data-action="cancel-new">取消</ui5-button>
          <ui5-button design="Emphasized" type="Submit" icon="add">创建并设计</ui5-button>
        </footer>
      </form>
    </div>`
  }

  _render () {
    const pageCount = this._pageCount()
    // eslint-disable-next-line no-restricted-syntax
    this.shadowRoot.innerHTML = `
      <style>
        :host{display:flex;flex-direction:column;min-height:0;height:100%;background:var(--sapBackgroundColor,#fff);color:var(--sapTextColor,#1d2d3e);font:13px/1.45 var(--sapFontFamily,Arial,sans-serif)}
        .bar{display:flex;align-items:end;gap:8px;padding:10px;border-bottom:1px solid var(--sapGroup_TitleBorderColor,#d9dfe5);background:var(--sapShell_Background,#f7f7f7);flex-wrap:wrap}
        label{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--sapContent_LabelColor,#6a6d70)}
        input{height:30px;box-sizing:border-box;border:1px solid var(--sapField_BorderColor,#89919a);border-radius:6px;background:var(--sapField_Background,#fff);color:var(--sapField_TextColor,#1d2d3e);padding:0 8px;font:inherit;min-width:120px}
        .spacer{flex:1 1 auto}
        .status{min-height:28px;padding:6px 10px;box-sizing:border-box;color:var(--sapContent_LabelColor,#6a6d70);border-bottom:1px solid var(--sapGroup_TitleBorderColor,#d9dfe5)}
        .status.error{color:var(--sapNegativeTextColor,#bb0000)}
        .status.ok{color:var(--sapPositiveTextColor,#107e3e)}
        .table-wrap{flex:1 1 auto;min-height:0;overflow:auto}
        table{width:100%;border-collapse:collapse;table-layout:fixed}
        th,td{border-bottom:1px solid var(--sapList_BorderColor,#e5e5e5);padding:7px 10px;text-align:left;vertical-align:middle;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        th{position:sticky;top:0;z-index:1;background:var(--sapList_HeaderBackground,#f7f7f7);font-size:12px;color:var(--sapContent_LabelColor,#6a6d70);font-weight:600}
        tbody tr:hover{background:var(--sapList_Hover_Background,#f5f6f7)}
        .mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
        .actions{width:58px;text-align:center}
        .empty{padding:24px;text-align:center;color:var(--sapContent_LabelColor,#6a6d70)}
        .pager{display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:8px 10px;border-top:1px solid var(--sapGroup_TitleBorderColor,#d9dfe5);background:var(--sapShell_Background,#f7f7f7)}
        .overlay{position:fixed;inset:0;z-index:10;background:rgba(0,0,0,.28);display:flex;align-items:flex-start;justify-content:center;padding-top:11vh}
        .dialog{width:min(620px,calc(100vw - 32px));box-sizing:border-box;border:1px solid var(--sapGroup_TitleBorderColor,#d9dfe5);border-radius:8px;background:var(--sapGroup_ContentBackground,#fff);box-shadow:var(--sapContent_Shadow2,0 16px 48px rgba(0,0,0,.22));padding:14px;display:flex;flex-direction:column;gap:12px}
        .dialog header,.dialog footer{display:flex;align-items:center;gap:8px}
        .dialog header h2{margin:0;font-size:16px;font-weight:600;flex:1 1 auto}
        .dialog input{width:100%;min-width:0}
        .grid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
        .dialog footer{justify-content:flex-end;border-top:1px solid var(--sapGroup_TitleBorderColor,#d9dfe5);padding-top:10px}
        @media (max-width: 760px){.grid3{grid-template-columns:1fr}.bar{align-items:stretch}.bar label{flex:1 1 100%}.spacer{display:none}th:nth-child(3),td:nth-child(3),th:nth-child(4),td:nth-child(4),th:nth-child(5),td:nth-child(5){display:none}}
      </style>
      <div class="bar">
        <label>Domain<input data-filter="domain" value="${escAttr(this._filters.domain)}" placeholder="fi"></label>
        <label>App<input data-filter="app" value="${escAttr(this._filters.app)}" placeholder="gl"></label>
        <label>Module<input data-filter="module" value="${escAttr(this._filters.module)}" placeholder="gl"></label>
        <ui5-button icon="search" design="Transparent" data-action="refresh">查询</ui5-button>
        <span class="spacer"></span>
        <ui5-button icon="add" design="Emphasized" data-action="new">新建页面</ui5-button>
        <ui5-button icon="action" data-action="open-designer" tooltip="打开 HTML 设计器">打开设计器</ui5-button>
      </div>
      <div class="status ${this._error ? 'error' : (this._message ? 'ok' : '')}">${escHtml(this._error || this._message || `共 ${this._total} 个页面`)}</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>ID</th><th>名称</th><th>Domain</th><th>App</th><th>Module</th><th>更新时间</th><th class="actions"></th></tr></thead>
          <tbody>${this._renderRows()}</tbody>
        </table>
      </div>
      <div class="pager">
        <ui5-button icon="navigation-left-arrow" data-action="prev"${this._page <= 1 ? ' disabled' : ''}></ui5-button>
        <span>${this._page} / ${pageCount}</span>
        <ui5-button icon="navigation-right-arrow" data-action="next"${this._page >= pageCount ? ' disabled' : ''}></ui5-button>
      </div>
      ${this._renderNewDialog()}
    `
  }
}

if (!customElements.get('portal-custom-page-designer')) customElements.define('portal-custom-page-designer', PortalCustomPageDesigner)

registerWorkspaceViewType('custom-page-designer', () => '<portal-custom-page-designer></portal-custom-page-designer>')
