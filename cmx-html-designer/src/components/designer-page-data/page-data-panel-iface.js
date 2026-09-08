import { escapeHtml } from '../../utils/html-utils.js';
import {
  CM_RESIZE_HOST_CLASS,
  detachCodeMirrorResize,
} from '../../utils/codemirror-resize.js';
import { loadCodeMirrorJsBundle } from '../../lib/codemirror-loader.js';
import { createJsEditor, fnBodyCompletionSource } from './page-data-codemirror.js';
import { bindPageDataJsCmToolbar } from './page-data-js-cm-toolbar.js';
import {
  INTERFACE_BY_NAME,
  INTERFACE_GROUPS,
  PAGE_INTERFACE_REGISTRY,
} from './page-interface-registry.js';

/** 取（或惰性创建）作者侧存储项 */
function getOrCreateModelEntry(pd, name) {
  const def = INTERFACE_BY_NAME[name];
  if (!def) return null;
  let item = pd._pageInterfaces.find((x) => x.name === name);
  if (!item) {
    item = { name, enabled: !!def.defaultEnabled, body: '' };
    pd._pageInterfaces.push(item);
  }
  return item;
}

function isEntryActive(item) {
  return !!(item && item.enabled && typeof item.body === 'string' && item.body.trim());
}

function badgeForName(pd, name) {
  const def = INTERFACE_BY_NAME[name];
  if (!def) return '';
  const item = pd._pageInterfaces.find((x) => x.name === name);
  if (isEntryActive(item)) {
    return '<span class="iface-badge iface-badge--on" title="已启用自定义实现">已实现</span>';
  }
  if (def.defaultBody !== null) {
    return '<span class="iface-badge iface-badge--default" title="未启用；运行时使用默认实现">默认</span>';
  }
  return '<span class="iface-badge iface-badge--off" title="未启用且无默认实现">未启用</span>';
}

function signatureHtml(def) {
  const params = ['$data', 'host', ...(def.params ? def.params.split(',').map((s) => s.trim()).filter(Boolean) : [])];
  return `(${params.map((p) => escapeHtml(p)).join(', ')})`;
}

/** 将 CodeMirror 内容写回模型（切换接口或整体重绘前调用） */
export function persistIfaceEditorToModel(pd) {
  const ed = pd._ifaceCmEditors[0];
  const name = pd._ifaceCmBoundName;
  if (!ed || !name) return;
  const item = getOrCreateModelEntry(pd, name);
  if (item) item.body = ed.state.doc.toString();
}

let _ifaceDetailFormWired = false;
let _ifaceCmToolbarWired  = false;

function wireIfaceDetailFormOnce(pd) {
  if (_ifaceDetailFormWired) return;
  _ifaceDetailFormWired = true;
  const sr = pd.shadowRoot;

  sr.getElementById('ifaceDetailEnabled')?.addEventListener('change', (e) => {
    const name = pd._ifaceSelectedName;
    if (!name) return;
    const item = getOrCreateModelEntry(pd, name);
    if (!item) return;
    item.enabled = !!(/** @type {HTMLInputElement} */ (e.target).checked);
    updateIfaceSidebarBadge(pd, name);
    pd._emitPageDataChanged();
  });

  sr.getElementById('ifaceCmTbResetDefault')?.addEventListener('click', () => {
    const name = pd._ifaceSelectedName;
    if (!name) return;
    const def = INTERFACE_BY_NAME[name];
    if (!def) return;
    const ed = pd._ifaceCmEditors[0];
    const seed = def.defaultBody ?? '';
    if (ed) {
      ed.dispatch({ changes: { from: 0, to: ed.state.doc.length, insert: seed } });
      ed.focus();
    }
    const item = getOrCreateModelEntry(pd, name);
    if (item) item.body = seed;
    updateIfaceSidebarBadge(pd, name);
    pd._emitPageDataChanged();
  });
}

function updateIfaceSidebarBadge(pd, name) {
  const list = pd.shadowRoot.getElementById('ifaceList');
  if (!list) return;
  const slot = list.querySelector(`[data-iface-badge="${CSS.escape(name)}"]`);
  if (slot) slot.innerHTML = badgeForName(pd, name);
}

export function bindIfacePanel(pd) {
  wireIfaceDetailFormOnce(pd);
  if (!_ifaceCmToolbarWired) {
    _ifaceCmToolbarWired = true;
    bindPageDataJsCmToolbar(pd, {
      idPrefix: 'ifaceCmTb',
      debuggerBtnId: 'ifaceInsertDebuggerBtn',
      getView: () => pd._ifaceCmEditors[0],
      persist: () => persistIfaceEditorToModel(pd),
    });
  }
}

export async function renderIfaceList(pd) {
  const gen = ++pd._ifaceListGen;
  persistIfaceEditorToModel(pd);
  pd._ifaceCmEditors.forEach((v) => {
    detachCodeMirrorResize(v);
    v.destroy();
  });
  pd._ifaceCmEditors = [];

  const sr = pd.shadowRoot;
  const list = sr.getElementById('ifaceList');
  const detailForm = sr.getElementById('ifaceDetailForm');
  const detailEmpty = sr.getElementById('ifaceDetailEmpty');
  if (!list) return;

  if (!pd._ifaceSelectedName) {
    pd._ifaceSelectedName = PAGE_INTERFACE_REGISTRY[0]?.name || '';
  }

  list.innerHTML = '';
  for (const group of INTERFACE_GROUPS) {
    const header = document.createElement('div');
    header.className = 'iface-group-header';
    header.innerHTML = `${escapeHtml(group.label)}<span class="iface-group-header__hint">${escapeHtml(group.hint)}</span>`;
    list.appendChild(header);

    const items = PAGE_INTERFACE_REGISTRY.filter((d) => d.group === group.key);
    for (const def of items) {
      const row = document.createElement('div');
      row.className = 'sidebar-item-row iface-item';
      const badge = document.createElement('span');
      badge.dataset.ifaceBadge = def.name;
      badge.innerHTML = badgeForName(pd, def.name);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sidebar-item' + (def.name === pd._ifaceSelectedName ? ' active' : '');
      btn.dataset.ifaceName = def.name;
      btn.title = def.description;
      btn.textContent = def.name;
      btn.addEventListener('click', () => {
        if (pd._ifaceSelectedName === def.name) return;
        pd._ifaceSelectedName = def.name;
        void renderIfaceList(pd);
      });
      row.append(badge, btn);
      list.appendChild(row);
    }
  }

  const def = INTERFACE_BY_NAME[pd._ifaceSelectedName];
  if (!def) {
    pd._ifaceCmBoundName = '';
    if (detailForm) detailForm.hidden = true;
    if (detailEmpty) detailEmpty.hidden = false;
    return;
  }
  if (detailEmpty) detailEmpty.hidden = true;
  if (detailForm) detailForm.hidden = false;

  const nameEl = sr.getElementById('ifaceDetailName');
  const sigEl  = sr.getElementById('ifaceDetailSig');
  const descEl = sr.getElementById('ifaceDetailDesc');
  const contractEl = sr.getElementById('ifaceDetailContract');
  const enabledEl = /** @type {HTMLInputElement|null} */ (sr.getElementById('ifaceDetailEnabled'));
  if (nameEl) nameEl.textContent = def.name;
  if (sigEl)  sigEl.textContent  = signatureHtml(def).replace(/<[^>]+>/g, '');
  if (descEl) descEl.textContent = def.description;
  if (contractEl) contractEl.innerHTML = renderContractHtml(def);
  const item = pd._pageInterfaces.find((x) => x.name === def.name);
  if (enabledEl) enabledEl.checked = item ? !!item.enabled : !!def.defaultEnabled;

  const host = sr.getElementById('ifaceDetailCmHost');
  if (!host) {
    pd._ifaceCmBoundName = '';
    return;
  }
  host.classList.add(CM_RESIZE_HOST_CLASS);
  const cm = await loadCodeMirrorJsBundle();
  if (gen !== pd._ifaceListGen || !host.isConnected) return;
  const initial = (item && item.body) || def.defaultBody || '';
  const view = createJsEditor(
    pd,
    cm,
    host,
    initial,
    (code) => {
      const cur = getOrCreateModelEntry(pd, def.name);
      if (cur) cur.body = code;
      updateIfaceSidebarBadge(pd, def.name);
      pd._emitPageDataChanged();
    },
    (ctx) => fnBodyCompletionSource(pd, ctx),
  );
  if (gen !== pd._ifaceListGen) {
    detachCodeMirrorResize(view);
    view.destroy();
    return;
  }
  pd._ifaceCmEditors.push(view);
  pd._ifaceCmBoundName = def.name;
}

function renderContractHtml(def) {
  const sig = signatureHtml(def);
  const parts = [];
  parts.push(`<div><code>${escapeHtml(def.name + sig)}</code></div>`);
  if (def.contract) parts.push(`<div>${def.contract.replace(/`([^`]+)`/g, (_m, s) => `<code>${escapeHtml(s)}</code>`)}</div>`);
  if (def.defaultBody === null) {
    parts.push('<div><em>无默认实现：未启用时宿主调用此接口返回 <code>undefined</code>。</em></div>');
  } else {
    parts.push('<div><em>未启用时使用默认实现（见编辑器初始内容）。</em></div>');
  }
  return parts.join('');
}
