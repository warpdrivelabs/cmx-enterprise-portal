import { escapeAttr } from '../../utils/html-utils.js';
import {
  CM_RESIZE_HOST_CLASS,
  detachCodeMirrorResize,
} from '../../utils/codemirror-resize.js';
import { loadCodeMirrorJsBundle } from '../../lib/codemirror-loader.js';
import { createJsEditor, fnBodyCompletionSource } from './page-data-codemirror.js';
import { bindPageDataJsCmToolbar } from './page-data-js-cm-toolbar.js';

/** 将当前 CodeMirror 内容写回模型（切换列表项或整体重绘前调用） */
export function persistFnEditorToModel(pd) {
  const ed = pd._fnCmEditors[0];
  const i = pd._fnCmBoundIndex;
  if (ed && i >= 0 && i < pd._pageFns.length) {
    pd._pageFns[i].body = ed.state.doc.toString();
  }
}

export function varCheckboxGroupHtml(pd, selected) {
  const names = pd._pageData.filter(d => d.name).map(d => d.name);
  if (!names.length) return '<span class="no-vars">暂无变量</span>';
  return names.map(n => `
    <label>
      <input type="checkbox" data-varname="${escapeAttr(n)}" ${selected.includes(n) ? 'checked' : ''}/>
      ${escapeAttr(n)}
    </label>`).join('');
}

/** 按当前「数据」变量列表重绘读写勾选区，不触碰 CodeMirror（如从「数据」切到「函数」） */
export function refreshFnDetailVarCheckboxes(pd) {
  if (!pd._pageFns.length) return;
  const i = pd._fnSelectedIndex | 0;
  if (i < 0 || i >= pd._pageFns.length) return;
  const f = pd._pageFns[i];
  const valid = new Set(pd._pageData.filter((d) => d.name).map((d) => d.name));
  const rv = f.readsVars || [];
  const wv = f.writesVars || [];
  const nr = rv.filter((n) => valid.has(n));
  const nw = wv.filter((n) => valid.has(n));
  const modelChanged =
    nr.length !== rv.length ||
    nw.length !== wv.length ||
    nr.some((n, j) => n !== rv[j]) ||
    nw.some((n, j) => n !== wv[j]);
  f.readsVars = nr;
  f.writesVars = nw;

  const sr = pd.shadowRoot;
  const reads = sr.getElementById('fnDetailReads');
  const writes = sr.getElementById('fnDetailWrites');
  if (reads) reads.innerHTML = varCheckboxGroupHtml(pd, f.readsVars);
  if (writes) writes.innerHTML = varCheckboxGroupHtml(pd, f.writesVars);
  if (modelChanged) pd._emitPageDataChanged();
}

function fnSidebarTitle(f) {
  return `${f.name || '(未命名)'}(${f.params || ''})`;
}

function updateFnSidebarLabels(pd) {
  const list = pd.shadowRoot.getElementById('fnList');
  if (!list) return;
  const rows = list.querySelectorAll('.sidebar-item-row');
  rows.forEach((row, i) => {
    const btn = row.querySelector('.sidebar-item');
    if (btn && pd._pageFns[i]) btn.textContent = fnSidebarTitle(pd._pageFns[i]);
  });
}

let _fnDetailFormWired = false;
let _fnCmToolbarWired = false;

function wireFnDetailFormOnce(pd) {
  if (_fnDetailFormWired) return;
  _fnDetailFormWired = true;
  const sr = pd.shadowRoot;
  const form = sr.getElementById('fnDetailForm');
  if (!form) return;

  form.addEventListener('input', (e) => {
    const t = /** @type {HTMLInputElement} */ (e.target);
    const i = pd._fnSelectedIndex;
    if (i < 0 || i >= pd._pageFns.length) return;
    if (t.id === 'fnDetailName') {
      pd._pageFns[i].name = t.value.trim();
      updateFnSidebarLabels(pd);
      pd._emitPageDataChanged();
    } else if (t.id === 'fnDetailParams') {
      pd._pageFns[i].params = t.value;
      updateFnSidebarLabels(pd);
      pd._emitPageDataChanged();
    }
  });

  form.addEventListener('change', (e) => {
    const t = /** @type {HTMLInputElement} */ (e.target);
    if (t.type !== 'checkbox') return;
    const i = pd._fnSelectedIndex;
    if (i < 0 || !pd._pageFns[i]) return;
    const readsEl = sr.getElementById('fnDetailReads');
    const writesEl = sr.getElementById('fnDetailWrites');
    const v = t.dataset.varname;
    if (!v) return;
    if (readsEl?.contains(t)) {
      const arr = [...(pd._pageFns[i].readsVars || [])];
      t.checked ? arr.push(v) : arr.splice(arr.indexOf(v), 1);
      pd._pageFns[i].readsVars = [...new Set(arr)];
      pd._emitPageDataChanged();
    }
    if (writesEl?.contains(t)) {
      const arr = [...(pd._pageFns[i].writesVars || [])];
      t.checked ? arr.push(v) : arr.splice(arr.indexOf(v), 1);
      pd._pageFns[i].writesVars = [...new Set(arr)];
      pd._emitPageDataChanged();
    }
  });

  sr.getElementById('fnDelCurrentBtn')?.addEventListener('click', () => {
    persistFnEditorToModel(pd);
    const i = pd._fnSelectedIndex;
    if (i < 0 || !pd._pageFns.length) return;
    pd._pageFns.splice(i, 1);
    if (pd._fnSelectedIndex >= pd._pageFns.length) {
      pd._fnSelectedIndex = Math.max(0, pd._pageFns.length - 1);
    }
    void renderFnList(pd).then(() => pd._emitPageDataChanged());
  });
}

export function bindFnPanel(pd) {
  wireFnDetailFormOnce(pd);
  if (!_fnCmToolbarWired) {
    _fnCmToolbarWired = true;
    bindPageDataJsCmToolbar(pd, {
      idPrefix: 'fnCmTb',
      debuggerBtnId: 'fnInsertDebuggerBtn',
      getView: () => pd._fnCmEditors[0],
      persist: () => persistFnEditorToModel(pd),
    });
  }
  pd.shadowRoot.getElementById('addFnBtn').addEventListener('click', () => {
    persistFnEditorToModel(pd);
    pd._pageFns.push({ name: '', params: '', body: '', readsVars: [], writesVars: [] });
    pd._fnSelectedIndex = pd._pageFns.length - 1;
    void renderFnList(pd).then(() => pd._emitPageDataChanged());
  });
}

export async function renderFnList(pd) {
  const gen = ++pd._fnListGen;
  persistFnEditorToModel(pd);
  pd._fnCmEditors.forEach((v) => {
    detachCodeMirrorResize(v);
    v.destroy();
  });
  pd._fnCmEditors = [];

  const sr = pd.shadowRoot;
  const split = sr.getElementById('fnSplit');
  const globalEmpty = sr.getElementById('fnGlobalEmpty');
  const list = sr.getElementById('fnList');
  const detailForm = sr.getElementById('fnDetailForm');
  const detailEmpty = sr.getElementById('fnDetailEmpty');

  if (!list || !split) return;

  if (!pd._pageFns.length) {
    split.style.display = 'none';
    if (globalEmpty) globalEmpty.style.display = '';
    if (detailForm) detailForm.hidden = true;
    if (detailEmpty) detailEmpty.hidden = true;
    list.innerHTML = '';
    pd._fnCmBoundIndex = -1;
    return;
  }

  if (globalEmpty) globalEmpty.style.display = 'none';
  split.style.display = 'flex';
  pd._fnSelectedIndex = Math.max(0, Math.min(pd._fnSelectedIndex | 0, pd._pageFns.length - 1));

  list.innerHTML = '';
  pd._pageFns.forEach((f, i) => {
    const row = document.createElement('div');
    row.className = 'sidebar-item-row';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sidebar-item' + (i === pd._fnSelectedIndex ? ' active' : '');
    btn.dataset.idx = String(i);
    btn.textContent = fnSidebarTitle(f);
    btn.addEventListener('click', () => {
      pd._fnSelectedIndex = i;
      void renderFnList(pd).then(() => pd._emitPageDataChanged());
    });
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'del-row-btn sidebar-item-del';
    del.title = '删除';
    del.textContent = '×';
    del.addEventListener('click', (ev) => {
      ev.stopPropagation();
      persistFnEditorToModel(pd);
      const wasSel = pd._fnSelectedIndex;
      pd._fnCmBoundIndex = -1;
      pd._pageFns.splice(i, 1);
      if (wasSel === i) pd._fnSelectedIndex = Math.min(i, pd._pageFns.length - 1);
      else if (wasSel > i) pd._fnSelectedIndex--;
      void renderFnList(pd).then(() => pd._emitPageDataChanged());
    });
    row.append(btn, del);
    list.appendChild(row);
  });

  const i = pd._fnSelectedIndex;
  const f = pd._pageFns[i];
  if (detailEmpty) detailEmpty.hidden = true;
  if (detailForm) {
    detailForm.hidden = false;
    const nameInp = sr.getElementById('fnDetailName');
    const paramsInp = sr.getElementById('fnDetailParams');
    if (nameInp) nameInp.value = f.name || '';
    if (paramsInp) paramsInp.value = f.params || '';
    const reads = sr.getElementById('fnDetailReads');
    const writes = sr.getElementById('fnDetailWrites');
    if (reads) reads.innerHTML = varCheckboxGroupHtml(pd, f.readsVars || []);
    if (writes) writes.innerHTML = varCheckboxGroupHtml(pd, f.writesVars || []);
  }

  const host = sr.getElementById('fnDetailCmHost');
  if (!host) {
    pd._fnCmBoundIndex = -1;
    return;
  }
  host.classList.add(CM_RESIZE_HOST_CLASS);
  const cm = await loadCodeMirrorJsBundle();
  if (gen !== pd._fnListGen || !host.isConnected) return;
  const view = createJsEditor(
    pd,
    cm,
    host,
    f.body || '',
    (code) => {
      if (pd._fnSelectedIndex >= 0 && pd._fnSelectedIndex < pd._pageFns.length) {
        pd._pageFns[pd._fnSelectedIndex].body = code;
      }
      pd._emitPageDataChanged();
    },
    (ctx) => fnBodyCompletionSource(pd, ctx),
  );
  if (gen !== pd._fnListGen) {
    detachCodeMirrorResize(view);
    view.destroy();
    return;
  }
  pd._fnCmEditors.push(view);
  pd._fnCmBoundIndex = i;
}
