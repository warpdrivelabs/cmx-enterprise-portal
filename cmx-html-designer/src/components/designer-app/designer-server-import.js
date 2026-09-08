import { listHtmlPages, getHtmlPage } from '../../api/html-pages-api.js';
import { getRegistryDam } from '../../api/registry-api.js';
import { openDialogCentered } from './dialog-center.js';

/**
 * @param {{
 *   shadowRoot: ShadowRoot,
 *   onPageOpened: (detail: { id: string, name: string, details: string, domain?: string, app?: string, module?: string, doc?: string, html: string, latestHtmlFile?: string, timestamp?: string }) => void | Promise<void>,
 *   onOpenPageFailed: (message: string) => void,
 * }} opts
 * @returns {{ openDialog: () => void }}
 */
export function bindDesignerServerImportDialog(opts) {
  const { shadowRoot, onPageOpened, onOpenPageFailed } = opts;
  const dlg = shadowRoot.getElementById('serverImportDlg');
  if (!dlg) {
    return { openDialog() {} };
  }
  const strip = shadowRoot.getElementById('serverImportStrip');
  const pageInfo = shadowRoot.getElementById('serverImportPageInfo');
  const tbody = shadowRoot.getElementById('serverImportTbody');
  const btnPrev = shadowRoot.getElementById('serverImportPrev');
  const btnNext = shadowRoot.getElementById('serverImportNext');
  const btnRefresh = shadowRoot.getElementById('serverImportRefresh');
  const btnClose = shadowRoot.getElementById('serverImportCloseBtn');
  const btnApply = shadowRoot.getElementById('serverImportApplyBtn');
  const tree = shadowRoot.getElementById('serverImportTree');
  const scopeHint = shadowRoot.getElementById('serverImportScopeHint');
  const searchInput = shadowRoot.getElementById('serverImportSearch');
  if (!strip || !pageInfo || !tbody || !btnPrev || !btnNext || !btnRefresh || !btnClose || !btnApply) {
    return { openDialog() {} };
  }

  /* filter：当前选中的范围（树节点）。空 = 全部。 */
  const state = {
    page: 1,
    pageSize: 10,
    total: 0,
    selectedId: /** @type {string | null} */ (null),
    filter: /** @type {{ domain?: string, app?: string, module?: string }} */ ({}),
    keyword: /** @type {string} */ (''),
    scopeText: '全部页面',
    treeLoaded: false,
  };

  const setStatus = (text, isError = false) => {
    strip.replaceChildren();
    if (!text) {
      strip.hidden = true;
      return;
    }
    strip.hidden = false;
    strip.design = isError ? 'Negative' : 'Information';
    strip.append(document.createTextNode(text));
  };

  const clearSelection = () => {
    state.selectedId = null;
    btnApply.disabled = true;
    tbody.querySelectorAll('tr.selected').forEach((tr) => tr.classList.remove('selected'));
  };

  const renderRows = (items) => {
    tbody.replaceChildren();
    for (const row of items) {
      const tr = document.createElement('tr');
      tr.dataset.id = row.id;
      const c1 = document.createElement('td');
      c1.className = 'col-id';
      c1.textContent = row.id ?? '';
      const c2 = document.createElement('td');
      c2.className = 'col-name';
      c2.textContent = row.name ?? '';
      const cTs = document.createElement('td');
      cTs.className = 'col-timestamp';
      cTs.textContent = typeof row.timestamp === 'string' ? row.timestamp : '';
      const c3 = document.createElement('td');
      c3.className = 'col-details';
      c3.textContent = row.details ?? '';
      tr.append(c1, c2, cTs, c3);
      tbody.appendChild(tr);
    }
  };

  const updatePagerUi = () => {
    const { page, pageSize, total } = state;
    const pages = Math.max(1, Math.ceil(total / pageSize) || 1);
    pageInfo.textContent = `第 ${page} / ${pages} 页，共 ${total} 条（每页 ${pageSize} 条）`;
    btnPrev.disabled = page <= 1;
    btnNext.disabled = page >= pages || total === 0;
    if (scopeHint) scopeHint.textContent = state.scopeText;
  };

  const loadPage = async () => {
    setStatus('加载中…', false);
    clearSelection();
    try {
      const filter = state.keyword
        ? { ...state.filter, keyword: state.keyword }
        : state.filter;
      const { items, total, page, pageSize } = await listHtmlPages(state.page, state.pageSize, filter);
      state.total = total;
      state.page = page;
      state.pageSize = pageSize;
      renderRows(items || []);
      updatePagerUi();
      setStatus(items?.length ? '' : '该范围下没有页面。', false);
    } catch (err) {
      renderRows([]);
      updatePagerUi();
      setStatus(err.message || String(err), true);
    }
  };

  /* ---- 左侧 DAM 树 ---- */

  /** 给 ui5-tree-item 附 dataset 范围信息（用于点击时设 filter）；可选 icon。 */
  const makeTreeItem = (text, { level, domain, app, module, scopeText, expanded, icon }) => {
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
  };

  const buildTree = async () => {
    if (!tree) return;
    tree.replaceChildren();
    /* 顶层「全部页面」节点（清空过滤）。 */
    const allItem = makeTreeItem('全部页面', { level: 'all', scopeText: '全部页面', expanded: true, icon: 'list' });
    tree.appendChild(allItem);
    try {
      const dam = await getRegistryDam();
      const domains = Array.isArray(dam.domains) ? dam.domains : [];
      const apps = Array.isArray(dam.apps) ? dam.apps : [];
      const modules = Array.isArray(dam.modules) ? dam.modules : [];
      for (const d of domains) {
        const domainId = String(d.id ?? '').trim();
        if (!domainId) continue;
        /* 节点显示文字（短）与路径片段（用于完整 scopeText）。 */
        const dDisplay = d.label ? `${domainId} — ${d.label}` : domainId;
        const dPath = `域：${d.label ? `${domainId}-${d.label}` : domainId}`;
        const dItem = makeTreeItem(dDisplay, {
          level: 'domain', domain: domainId,
          scopeText: dPath,
          icon: d.icon ? String(d.icon) : '',
        });
        for (const a of apps.filter((x) => String(x.domain) === domainId)) {
          const appId = String(a.id ?? '').trim();
          if (!appId) continue;
          const aDisplay = a.label ? `${appId} — ${a.label}` : appId;
          const aPath = `应用：${a.label ? `${appId}-${a.label}` : appId}`;
          const aItem = makeTreeItem(aDisplay, {
            level: 'app', domain: domainId, app: appId,
            scopeText: `${dPath}/${aPath}`,
            icon: a.icon ? String(a.icon) : '',
          });
          for (const m of modules.filter((x) => String(x.domain) === domainId && String(x.app) === appId)) {
            const moduleId = String(m.id ?? '').trim();
            if (!moduleId) continue;
            const mDisplay = m.label ? `${moduleId} — ${m.label}` : moduleId;
            const mPath = `模块：${m.label ? `${moduleId} — ${m.label}` : moduleId}`;
            const mItem = makeTreeItem(mDisplay, {
              level: 'module', domain: domainId, app: appId, module: moduleId,
              scopeText: `${dPath}/${aPath}/${mPath}`,
              icon: m.icon ? String(m.icon) : '',
            });
            aItem.appendChild(mItem);
          }
          dItem.appendChild(aItem);
        }
        tree.appendChild(dItem);
      }
      state.treeLoaded = true;
    } catch (err) {
      /* registry 加载失败：树只剩「全部页面」，列表仍可用（无过滤）。 */
      setStatus(`范围树加载失败（仅显示全部）：${err.message || err}`, true);
    }
  };

  /* ui5-tree 选中事件：item-click（单击行）。读 dataset 设 filter 并重载第一页。 */
  const onTreeSelect = (e) => {
    const item = e.detail?.item || e.target;
    if (!item || !item.dataset) return;
    const level = item.dataset.level;
    if (level === 'all') {
      state.filter = {};
    } else if (level === 'domain') {
      state.filter = { domain: item.dataset.domain };
    } else if (level === 'app') {
      state.filter = { domain: item.dataset.domain, app: item.dataset.app };
    } else if (level === 'module') {
      state.filter = { domain: item.dataset.domain, app: item.dataset.app, module: item.dataset.module };
    } else {
      return;
    }
    state.scopeText = item.dataset.scopeText || '全部页面';
    state.page = 1;
    void loadPage();
  };

  if (tree) {
    tree.addEventListener('item-click', onTreeSelect);
    tree.addEventListener('selection-change', (e) => {
      const item = e.detail?.selectedItems?.[0];
      if (item) onTreeSelect({ detail: { item } });
    });
  }

  tbody.addEventListener('click', (e) => {
    const tr = e.target.closest?.('tr');
    if (!tr || !tr.dataset.id) return;
    tbody.querySelectorAll('tr.selected').forEach((r) => r.classList.remove('selected'));
    tr.classList.add('selected');
    state.selectedId = tr.dataset.id;
    btnApply.disabled = false;
  });

  const applySelected = async (id) => {
    try {
      const data = await getHtmlPage(id);
      const html = data.html ?? '';
      await onPageOpened({
        id: data.id ?? id,
        name: typeof data.name === 'string' ? data.name : '',
        details: typeof data.details === 'string' ? data.details : '',
        /* 业务坐标透传（C6①）：保存时三下拉为空回落该值；null 归一空串 */
        domain: typeof data.domain === 'string' ? data.domain : '',
        app: typeof data.app === 'string' ? data.app : '',
        module: typeof data.module === 'string' ? data.module : '',
        doc: typeof data.doc === 'string' ? data.doc : '',
        html,
        latestHtmlFile: typeof data.latestHtmlFile === 'string' ? data.latestHtmlFile : '',
        timestamp: typeof data.timestamp === 'string' ? data.timestamp : '',
      });
      dlg.open = false;
    } catch (err) {
      onOpenPageFailed(err.message || String(err));
      setStatus(err.message || String(err), true);
    }
  };

  tbody.addEventListener('dblclick', async (e) => {
    const tr = e.target.closest?.('tr');
    if (!tr || !tr.dataset.id) return;
    await applySelected(tr.dataset.id);
  });

  btnPrev.addEventListener('click', async () => {
    if (state.page > 1) {
      state.page -= 1;
      await loadPage();
    }
  });

  btnNext.addEventListener('click', async () => {
    const { page, pageSize, total } = state;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    if (page < pages) {
      state.page += 1;
      await loadPage();
    }
  });

  btnRefresh.addEventListener('click', () => loadPage());

  /* 搜索：300ms 防抖；Enter 立即触发并清掉 pending 防抖。每次搜索重置到第 1 页。 */
  let searchTimer = null;
  const triggerSearch = () => {
    if (searchTimer) {
      clearTimeout(searchTimer);
      searchTimer = null;
    }
    state.page = 1;
    void loadPage();
  };
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      state.keyword = (searchInput.value || '').trim();
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(triggerSearch, 300);
    });
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        triggerSearch();
      }
    });
  }

  const onImportDlgClosed = () => {
    clearSelection();
    tbody.replaceChildren();
    pageInfo.textContent = '';
    strip.replaceChildren();
    strip.hidden = true;
    if (searchTimer) {
      clearTimeout(searchTimer);
      searchTimer = null;
    }
    state.keyword = '';
    if (searchInput) searchInput.value = '';
  };

  btnClose.addEventListener('click', () => {
    dlg.open = false;
  });

  btnApply.addEventListener('click', async () => {
    const id = state.selectedId;
    if (!id) return;
    await applySelected(id);
  });

  dlg.addEventListener('close', onImportDlgClosed);
  dlg.addEventListener('ui5-close', onImportDlgClosed);

  return {
    openDialog() {
      state.page = 1;
      state.pageSize = 10;
      state.total = 0;
      state.selectedId = null;
      state.filter = {};
      state.keyword = '';
      state.scopeText = '全部页面';
      if (searchInput) searchInput.value = '';
      openDialogCentered(dlg);
      /* 树每次打开重建（registry 可能变化）；列表先按全部加载。 */
      void buildTree();
      void loadPage();
    },
  };
}
