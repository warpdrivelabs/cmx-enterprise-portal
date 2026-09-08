export function bindDataPanel(pd) {
  pd.shadowRoot.getElementById('addDataBtn').addEventListener('click', () => {
    pd._pageData.push({ name: '', type: 'string', defaultValue: '' });
    renderDataRows(pd);
    pd._emitPageDataChanged();
  });
  renderDataRows(pd);
}

export function renderDataRows(pd) {
  const tbody = pd.shadowRoot.getElementById('dataRows');
  const empty = pd.shadowRoot.getElementById('dataEmpty');
  if (!tbody) return;
  tbody.innerHTML = '';
  empty.style.display = pd._pageData.length ? 'none' : '';
  pd._pageData.forEach((d, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input class="data-inp" placeholder="变量名"/></td>
      <td>
        <select class="data-inp">
          ${['string','number','boolean','object','array'].map(t =>
            `<option value="${t}">${t}</option>`
          ).join('')}
        </select>
      </td>
      <td><input class="data-inp" placeholder="默认值"/></td>
      <td><button class="del-row-btn" title="删除">×</button></td>
    `;
    const nameInp    = tr.cells[0].querySelector('input');
    const typeSelect = tr.cells[1].querySelector('select');
    const defInp     = tr.cells[2].querySelector('input');
    nameInp.value    = d.name || '';
    typeSelect.value = d.type || 'string';
    defInp.value     = d.defaultValue || '';

    nameInp.addEventListener('input',    (e) => { pd._pageData[i].name = e.target.value.trim(); pd._emitPageDataChanged(); });
    typeSelect.addEventListener('change', (e) => { pd._pageData[i].type = e.target.value; pd._emitPageDataChanged(); });
    defInp.addEventListener('input',     (e) => { pd._pageData[i].defaultValue = e.target.value; pd._emitPageDataChanged(); });
    tr.querySelector('.del-row-btn').addEventListener('click', () => {
      pd._pageData.splice(i, 1);
      renderDataRows(pd);
      pd._emitPageDataChanged();
    });
    tbody.appendChild(tr);
  });
}
