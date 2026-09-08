/**
 * <service-catalog-picker> — 服务目录选择对话框。
 *
 * 左侧 DAM 树（domain/app/module，数据来自 /api/registry/dam），右侧服务列表（/api/service-catalog，
 * 按选中范围过滤）。选中一条服务 → 派发 `service-picked` 事件，detail 为服务目录条目。
 *
 * 用法：
 *   const picker = document.createElement('service-catalog-picker');
 *   document.body.appendChild(picker);
 *   picker.addEventListener('service-picked', (e) => { 用 e.detail 投影到 pageServices });
 *   picker.open();
 *
 * 复用 runtime 已注册的 ui5-dialog / ui5-tree / ui5-tree-item / ui5-button / ui5-message-strip。
 */
import { getRegistryDam } from '../../api/registry-api.js';
import { listServices } from '../../api/service-catalog-api.js';

const STYLE = `
:host { display: contents; }
.scp-body { display: flex; flex-direction: row; gap: 5px; min-height: 0; height: 60vh; box-sizing: border-box; }
.scp-tree-pane { flex: 0 0 240px; min-width: 180px; max-width: 320px; display: flex; flex-direction: column; min-height: 0; border-right: 1px solid var(--sapGroup_TitleBorderColor, #ddd); padding-right: 5px; }
.scp-scope { font-size: 0.78rem; color: var(--sapContent_LabelColor, #6a6d70); padding: 2px 2px 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.scp-tree { flex: 1 1 auto; min-height: 0; overflow: auto; }
.scp-main { flex: 1 1 auto; display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.scp-list { flex: 1 1 auto; min-height: 0; overflow: auto; }
.scp-item { display: flex; flex-direction: column; gap: 2px; padding: 6px 8px; border-bottom: 1px solid var(--sapList_BorderColor, #ededed); cursor: pointer; }
.scp-item:hover { background: var(--sapList_Hover_Background, #f5f5f5); }
.scp-item.active { background: var(--sapList_SelectionBackgroundColor, #e8f0fe); }
.scp-item-title { font-size: 0.85rem; font-weight: 600; color: var(--sapTextColor, #32363a); }
.scp-item-meta { font-size: 0.72rem; color: var(--sapContent_LabelColor, #6a6d70); display: flex; gap: 8px; flex-wrap: wrap; }
.scp-badge { display: inline-block; padding: 0 6px; border-radius: 3px; font-size: 0.68rem; line-height: 1.5; background: var(--sapNeutralBackground, #eaecee); color: var(--sapTextColor, #32363a); }
.scp-empty { padding: 16px; font-size: 0.8rem; color: var(--sapContent_LabelColor, #6a6d70); text-align: center; }
`;

export class ServiceCatalogPicker extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._all = [];            // 全部服务（缓存一次）
    this._filtered = [];
    this._selected = null;     // 选中的服务条目
    this._dam = null;
    this._loaded = false;
  }

  connectedCallback() {
    if (this._wired) return;
    this._wired = true;
    // eslint-disable-next-line no-restricted-syntax -- shadow 模板，静态 + 受控
    this.shadowRoot.innerHTML = `
      <style>${STYLE}</style>
      <ui5-dialog id="scpDlg" header-text="从服务目录选择" resizable draggable style="width:820px;max-width:96vw">
        <div class="scp-body">
          <div class="scp-tree-pane">
            <div class="scp-scope" id="scpScope">全部服务</div>
            <ui5-tree id="scpTree" mode="SingleSelect" class="scp-tree"></ui5-tree>
          </div>
          <div class="scp-main">
            <ui5-message-strip id="scpStrip" design="Information" hide-close-button hidden></ui5-message-strip>
            <div class="scp-list" id="scpList"></div>
          </div>
        </div>
        <div slot="footer" style="display:flex;width:100%;box-sizing:border-box;align-items:center;justify-content:flex-end;gap:8px;padding:6px 8px">
          <ui5-button id="scpCancel" design="Transparent">取消</ui5-button>
          <ui5-button id="scpApply" design="Emphasized" icon="accept" disabled>插入此服务</ui5-button>
        </div>
      </ui5-dialog>
    `;
    const sr = this.shadowRoot;
    this._dlg = sr.getElementById('scpDlg');
    this._tree = sr.getElementById('scpTree');
    this._listEl = sr.getElementById('scpList');
    this._scopeEl = sr.getElementById('scpScope');
    this._strip = sr.getElementById('scpStrip');
    this._applyBtn = sr.getElementById('scpApply');

    sr.getElementById('scpCancel').addEventListener('click', () => { this._dlg.open = false; });
    this._applyBtn.addEventListener('click', () => this._commit());
    this._tree.addEventListener('item-click', (e) => this._onTreeSelect(e));
    this._tree.addEventListener('selection-change', (e) => {
      const it = e.detail?.selectedItems?.[0];
      if (it) this._onTreeSelect({ detail: { item: it } });
    });
  }

  _setStrip(text, design = 'Information') {
    if (!text) { this._strip.hidden = true; this._strip.replaceChildren(); return; }
    this._strip.hidden = false;
    this._strip.design = design;
    this._strip.replaceChildren(document.createTextNode(text));
  }

  _makeTreeItem(text, { level, domain, app, module, scopeText, expanded, icon }) {
    const it = document.createElement('ui5-tree-item');
    it.setAttribute('text', text);
    if (expanded) it.setAttribute('expanded', '');
    if (icon) it.setAttribute('icon', String(icon));
    it.dataset.level = level;
    if (domain != null) it.dataset.domain = domain;
    if (app != null) it.dataset.app = app;
    if (module != null) it.dataset.module = module;
    it.dataset.scopeText = scopeText;
    return it;
  }

  async _buildTree() {
    const tree = this._tree;
    tree.replaceChildren();
    const allItem = this._makeTreeItem('全部服务', { level: 'all', scopeText: '全部服务', expanded: true, icon: 'list' });
    tree.appendChild(allItem);
    try {
      const dam = await getRegistryDam();
      const domains = Array.isArray(dam.domains) ? dam.domains : [];
      const apps = Array.isArray(dam.apps) ? dam.apps : [];
      const modules = Array.isArray(dam.modules) ? dam.modules : [];
      for (const d of domains) {
        const domainId = String(d.id ?? '').trim();
        if (!domainId) continue;
        const dDisplay = d.label ? `${domainId} — ${d.label}` : domainId;
        const dPath = `域：${d.label ? `${domainId}-${d.label}` : domainId}`;
        const dItem = this._makeTreeItem(dDisplay, { level: 'domain', domain: domainId, scopeText: dPath, icon: d.icon ? String(d.icon) : '' });
        for (const a of apps.filter((x) => String(x.domain) === domainId)) {
          const appId = String(a.id ?? '').trim();
          if (!appId) continue;
          const aDisplay = a.label ? `${appId} — ${a.label}` : appId;
          const aPath = `应用：${a.label ? `${appId}-${a.label}` : appId}`;
          const aItem = this._makeTreeItem(aDisplay, { level: 'app', domain: domainId, app: appId, scopeText: `${dPath}/${aPath}`, icon: a.icon ? String(a.icon) : '' });
          for (const m of modules.filter((x) => String(x.domain) === domainId && String(x.app) === appId)) {
            const moduleId = String(m.id ?? '').trim();
            if (!moduleId) continue;
            const mDisplay = m.label ? `${moduleId} — ${m.label}` : moduleId;
            const mPath = `模块：${m.label ? `${moduleId} — ${m.label}` : moduleId}`;
            aItem.appendChild(this._makeTreeItem(mDisplay, { level: 'module', domain: domainId, app: appId, module: moduleId, scopeText: `${dPath}/${aPath}/${mPath}`, icon: m.icon ? String(m.icon) : '' }));
          }
          dItem.appendChild(aItem);
        }
        tree.appendChild(dItem);
      }
    } catch (err) {
      this._setStrip(`范围树加载失败（仅显示全部）：${err.message || err}`, 'Warning');
    }
  }

  _onTreeSelect(e) {
    const item = e.detail?.item || e.target;
    if (!item || !item.dataset) return;
    const lvl = item.dataset.level;
    if (lvl === 'all') this._scopeFilter = {};
    else if (lvl === 'domain') this._scopeFilter = { domain: item.dataset.domain };
    else if (lvl === 'app') this._scopeFilter = { domain: item.dataset.domain, app: item.dataset.app };
    else if (lvl === 'module') this._scopeFilter = { domain: item.dataset.domain, app: item.dataset.app, module: item.dataset.module };
    else return;
    this._scopeEl.textContent = item.dataset.scopeText || '全部服务';
    this._applyFilterAndRender();
  }

  _applyFilterAndRender() {
    const f = this._scopeFilter || {};
    this._filtered = this._all.filter((s) =>
      (!f.domain || String(s.domain) === f.domain)
      && (!f.app || String(s.app) === f.app)
      && (!f.module || String(s.module) === f.module));
    this._selected = null;
    this._applyBtn.disabled = true;
    this._renderList();
  }

  _renderList() {
    const list = this._listEl;
    list.replaceChildren();
    if (!this._filtered.length) {
      const empty = document.createElement('div');
      empty.className = 'scp-empty';
      empty.textContent = '该范围下没有服务。';
      list.appendChild(empty);
      return;
    }
    for (const s of this._filtered) {
      const row = document.createElement('div');
      row.className = 'scp-item';
      row.dataset.id = s.id;
      const title = document.createElement('div');
      title.className = 'scp-item-title';
      title.textContent = s.label || s.id;
      const meta = document.createElement('div');
      meta.className = 'scp-item-meta';
      const badge = document.createElement('span');
      badge.className = 'scp-badge';
      badge.textContent = String(s.type || '').toUpperCase() + (s.method ? ` ${s.method}` : '');
      const urlSpan = document.createElement('span');
      urlSpan.textContent = s.urlPreview || s.url || '';
      meta.append(badge, urlSpan);
      row.append(title, meta);
      if (s.description) { row.title = s.description; }
      row.addEventListener('click', () => {
        list.querySelectorAll('.scp-item.active').forEach((r) => r.classList.remove('active'));
        row.classList.add('active');
        this._selected = s;
        this._applyBtn.disabled = false;
      });
      row.addEventListener('dblclick', () => { this._selected = s; this._commit(); });
      list.appendChild(row);
    }
  }

  _commit() {
    if (!this._selected) return;
    this.dispatchEvent(new CustomEvent('service-picked', {
      bubbles: true, composed: true, detail: this._selected,
    }));
    this._dlg.open = false;
  }

  async open() {
    if (!this._dlg) return;
    this._setStrip('');
    this._scopeFilter = {};
    this._scopeEl.textContent = '全部服务';
    this._dlg.open = true;
    // 首次打开加载：DAM 树 + 全部服务
    if (!this._loaded) {
      try {
        this._all = await listServices();
        this._loaded = true;
      } catch (err) {
        this._setStrip(`加载服务目录失败：${err.message || err}`, 'Negative');
        this._all = [];
      }
      await this._buildTree();
    }
    this._applyFilterAndRender();
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('service-catalog-picker')) {
  customElements.define('service-catalog-picker', ServiceCatalogPicker);
}
