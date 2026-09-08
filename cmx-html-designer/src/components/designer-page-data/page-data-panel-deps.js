export function bindDepsPanel(pd) {
  pd.shadowRoot.getElementById('addDepBtn').addEventListener('click', () => {
    pd._pageDeps.push({ name: '', url: '', loadType: 'script', globalName: '' });
    renderDepsList(pd);
    pd._emitPageDataChanged();
  });
  renderDepsList(pd);
}

export function renderDepsList(pd) {
  const list  = pd.shadowRoot.getElementById('depList');
  const empty = pd.shadowRoot.getElementById('depsEmpty');
  if (!list) return;
  list.innerHTML = '';
  empty.style.display = pd._pageDeps.length ? 'none' : '';

  pd._pageDeps.forEach((dep, i) => {
    const card = document.createElement('div');
    card.className = 'dep-card';
    card.innerHTML = `
      <div class="dep-card-header">
        <span class="dep-title">${dep.name || '(未命名)'}</span>
        <span class="load-type-badge ${dep.loadType}">${dep.loadType.toUpperCase()}</span>
        <button class="del-row-btn" title="删除">×</button>
      </div>
      <div class="dep-card-body">
        <div class="field-row">
          <ui5-label>库名</ui5-label>
          <input class="data-inp dep-name" placeholder="例如 lodash"/>
        </div>
        <div class="field-row">
          <ui5-label>加载方式</ui5-label>
          <select class="data-inp dep-load-type">
            <option value="script">script（UMD / 全局变量）</option>
            <option value="module">module（ES Module / importmap）</option>
          </select>
        </div>
        <div class="field-row">
          <ui5-label>CDN URL</ui5-label>
          <input class="data-inp dep-url" placeholder="https://cdn.jsdelivr.net/npm/lodash@4/lodash.min.js"/>
        </div>
        <div class="field-row dep-global-row">
          <ui5-label>全局变量名</ui5-label>
          <input class="data-inp dep-global" placeholder="例如 _ （可选，仅供提示）"/>
        </div>
        <div class="dep-hint dep-script-hint">
          加载后库挂载到 <code>window</code>，函数体中可直接使用全局变量（如 <code>_</code>、<code>dayjs</code>）。
        </div>
        <div class="dep-hint dep-module-hint">
          库名将注入 importmap，函数体中可通过 <code>import ... from '库名'</code> 调用。
        </div>
      </div>`;

    const nameInp    = card.querySelector('.dep-name');
    const typeSelect = card.querySelector('.dep-load-type');
    const urlInp     = card.querySelector('.dep-url');
    const globalInp  = card.querySelector('.dep-global');
    const titleSpan  = card.querySelector('.dep-title');
    const badge      = card.querySelector('.load-type-badge');

    nameInp.value    = dep.name     || '';
    typeSelect.value = dep.loadType || 'script';
    urlInp.value     = dep.url      || '';
    globalInp.value  = dep.globalName || '';
    updateDepCardVis(pd, card, dep.loadType);

    nameInp.addEventListener('input', (e) => {
      pd._pageDeps[i].name = e.target.value.trim();
      titleSpan.textContent  = e.target.value.trim() || '(未命名)';
      pd._emitPageDataChanged();
    });
    typeSelect.addEventListener('change', (e) => {
      pd._pageDeps[i].loadType = e.target.value;
      badge.className   = `load-type-badge ${e.target.value}`;
      badge.textContent = e.target.value.toUpperCase();
        updateDepCardVis(pd, card, e.target.value);
      pd._emitPageDataChanged();
    });
    urlInp.addEventListener('input',    (e) => { pd._pageDeps[i].url        = e.target.value; pd._emitPageDataChanged(); });
    globalInp.addEventListener('input', (e) => { pd._pageDeps[i].globalName = e.target.value; pd._emitPageDataChanged(); });
    card.querySelector('.del-row-btn').addEventListener('click', () => {
      pd._pageDeps.splice(i, 1);
        renderDepsList(pd);
      pd._emitPageDataChanged();
    });
    list.appendChild(card);
  });
}

export function updateDepCardVis(pd, card, loadType) {
  const isScript = loadType === 'script';
  card.querySelector('.dep-global-row').style.display  = isScript ? '' : 'none';
  card.querySelector('.dep-script-hint').style.display = isScript ? '' : 'none';
  card.querySelector('.dep-module-hint').style.display = isScript ? 'none' : '';
}
