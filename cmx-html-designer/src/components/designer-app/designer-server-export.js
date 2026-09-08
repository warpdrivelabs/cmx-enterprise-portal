import { saveHtmlPage } from '../../api/html-pages-api.js';
import { getRegistryDam } from '../../api/registry-api.js';
import { openDialogCentered } from './dialog-center.js';

/**
 * @param {{
 *   shadowRoot: ShadowRoot,
 *   pageIdSafeRegex: RegExp,
 *   getHtmlForSave: () => string,
 *   getExportPageMeta: () => { id?: string, name?: string, details?: string, domain?: string, app?: string, module?: string, doc?: string },
 *   onSaved: (meta: { id: string, name: string, details: string, domain?: string, app?: string, module?: string, doc?: string }) => void,
 *   onSaveLog: (msg: string) => void,
 *   clearSuccessTimer: () => void,
 *   scheduleSuccessClose: (fn: () => void, ms?: number) => void,
 *   syncSourceView?: () => void,
 *   getUrlDam?: () => { domain: string, app: string, module: string } | null,
 * }} opts
 * @returns {{ openExportDialog: () => void, dialogEl: Element | null }}
 */
export function bindDesignerServerExportDialog(opts) {
  const {
    shadowRoot,
    pageIdSafeRegex,
    getHtmlForSave,
    getExportPageMeta,
    onSaved,
    onSaveLog,
    clearSuccessTimer,
    scheduleSuccessClose,
    syncSourceView,
    getUrlDam,
  } = opts;

  const dlg = shadowRoot.getElementById('serverExportDlg');
  const strip = shadowRoot.getElementById('serverExportStrip');
  const inpId = shadowRoot.getElementById('exportPageId');
  const inpName = shadowRoot.getElementById('exportPageName');
  const taDetails = shadowRoot.getElementById('exportPageDetails');
  const btnCancel = shadowRoot.getElementById('serverExportCancelBtn');
  const btnSave = shadowRoot.getElementById('serverExportSaveBtn');
  /* 三级联动 + 高级模式控件 */
  const selDomain = shadowRoot.getElementById('exportDomainSel');
  const selApp = shadowRoot.getElementById('exportAppSel');
  const selModule = shadowRoot.getElementById('exportModuleSel');
  const inpPageName = shadowRoot.getElementById('exportPageNameInp');
  const chkAdvanced = shadowRoot.getElementById('exportAdvancedChk');

  if (!dlg || !strip || !inpId || !inpName || !taDetails || !btnCancel || !btnSave) {
    return {
      openExportDialog() {},
      dialogEl: null,
    };
  }

  /* 注册表缓存（首次打开对话框时加载，之后复用）。 */
  /** @type {{ domains: any[], apps: any[], modules: any[] } | null} */
  let registry = null;

  const setStrip = (text, design = 'Information') => {
    strip.replaceChildren();
    if (!text) {
      strip.hidden = true;
      return;
    }
    strip.hidden = false;
    strip.design = design;
    strip.append(document.createTextNode(text));
  };

  /** 用 [{value, text}] 填充一个 ui5-select；保留首项可选的占位（value=""）。 */
  const fillSelect = (sel, items, placeholder = '— 请选择 —') => {
    if (!sel) return;
    sel.replaceChildren();
    const optPh = document.createElement('ui5-option');
    optPh.setAttribute('value', '');
    optPh.textContent = placeholder;
    sel.appendChild(optPh);
    for (const it of items) {
      const o = document.createElement('ui5-option');
      o.setAttribute('value', String(it.value));
      o.textContent = String(it.text);
      sel.appendChild(o);
    }
  };

  const currentDomain = () => String(selDomain?.value || '').trim();
  const currentApp = () => String(selApp?.value || '').trim();
  const currentModule = () => String(selModule?.value || '').trim();
  const currentPageName = () => String(inpPageName?.value || '').trim();

  /* 属主路由前缀表（与后端 cmx-common-api owner_service_of / cmx-rpt-api is_report_owned_page
     对齐；后端扩表需同步）。这些前缀是资产归属，不是业务 DAM 坐标。 */
  const OWNER_ID_PREFIXES = ['portal.mdm.', 'portal.flow.', 'portal.rules.', 'portal.rpt.', 'portal.consol.', 'portal.model.'];

  const refreshApps = () => {
    const d = currentDomain();
    if (!registry || !d) {
      fillSelect(selApp, [], '— 先选 Domain —');
      return;
    }
    const apps = registry.apps.filter((a) => String(a.domain) === d);
    fillSelect(selApp, apps.map((a) => ({
      value: String(a.id),
      text: a.label ? `${a.id} — ${a.label}` : String(a.id),
    })), '— 请选择 Application —');
  };

  const refreshModules = () => {
    const d = currentDomain();
    const a = currentApp();
    if (!registry || !d || !a) {
      fillSelect(selModule, [], '— 先选 Application —');
      return;
    }
    const mods = registry.modules.filter((m) => String(m.domain) === d && String(m.app) === a);
    fillSelect(selModule, mods.map((m) => ({
      value: String(m.id),
      text: m.label ? `${m.id} — ${m.label}` : String(m.id),
    })), '— 请选择 Module —');
  };

  /** 用三级 + pageName 拼成 id，写回 inpId；高级模式下不覆盖（用户手工编辑优先）。 */
  const composeIdFromParts = () => {
    if (chkAdvanced?.checked) return;
    const d = currentDomain();
    const a = currentApp();
    const m = currentModule();
    const p = currentPageName();
    const parts = [d, a, m, p].filter(Boolean);
    inpId.value = parts.join('.');
  };

  /** 从已存在的 id 反向解析三级 + pageName，回填到 select。 */
  const decomposeIdToParts = (id) => {
    if (!id || !id.includes('.') || !registry) return false;
    const segs = id.split('.').filter(Boolean);
    if (segs.length < 2) return false;
    /* 最后一段是 pageName；前面段对应 domain.app.module...（中间段允许多于 1，但我们的标准结构是 3 段） */
    const domainId = segs[0];
    const pageName = segs[segs.length - 1];
    const midSegs = segs.slice(1, -1);
    const appId = midSegs[0] || '';
    /* module id 可能是单段（"explorer-menu"）也可能含点（"_legacy.explorer-menu"），这里只取剩下段拼回原值 */
    const moduleId = midSegs.slice(1).join('.') || '';

    /* 先在 registry 中校验存在性；不存在则切回高级模式让用户手工编辑。 */
    const domainOk = registry.domains.some((x) => String(x.id) === domainId);
    if (!domainOk) return false;
    selDomain.value = domainId;
    refreshApps();
    const appOk = appId && registry.apps.some((x) => String(x.domain) === domainId && String(x.id) === appId);
    if (appOk) {
      selApp.value = appId;
      refreshModules();
      const moduleOk = moduleId && registry.modules.some(
        (x) => String(x.domain) === domainId && String(x.app) === appId && String(x.id) === moduleId,
      );
      if (moduleOk) selModule.value = moduleId;
    }
    if (inpPageName) inpPageName.value = pageName;
    return true;
  };

  /** 切到高级模式：select / pageName 禁用；高级关闭：恢复联动并按当前 select 重拼 id。 */
  const applyAdvancedMode = () => {
    const adv = !!chkAdvanced?.checked;
    if (selDomain) selDomain.disabled = adv;
    if (selApp) selApp.disabled = adv;
    if (selModule) selModule.disabled = adv;
    if (inpPageName) inpPageName.readonly = adv;
    inpId.readonly = !adv;
    if (!adv) composeIdFromParts();
  };

  const onExportDlgClosed = () => {
    clearSuccessTimer();
    btnSave.disabled = false;
    strip.replaceChildren();
    strip.hidden = true;
  };

  btnCancel.addEventListener('click', () => {
    clearSuccessTimer();
    dlg.open = false;
  });

  /* 联动：domain/app/module/pageName 任何一个变化都重新拼 id（高级模式下跳过）。 */
  selDomain?.addEventListener('change', () => {
    if (selApp) selApp.value = '';
    if (selModule) selModule.value = '';
    refreshApps();
    refreshModules();
    composeIdFromParts();
  });
  selApp?.addEventListener('change', () => {
    if (selModule) selModule.value = '';
    refreshModules();
    composeIdFromParts();
  });
  selModule?.addEventListener('change', composeIdFromParts);
  inpPageName?.addEventListener('input', composeIdFromParts);
  chkAdvanced?.addEventListener('change', applyAdvancedMode);

  btnSave.addEventListener('click', async () => {
    clearSuccessTimer();
    const id = (inpId.value ?? '').trim();
    const name = inpName.value ?? '';
    const details = taDetails.value ?? '';
    if (!id) {
      setStrip('请填写页面 ID（选择 domain/app/module 与页面名，或勾选高级模式手工填）。', 'Negative');
      return;
    }
    if (!pageIdSafeRegex.test(id)) {
      setStrip('页面 ID 仅允许字母、数字、._-，长度 1–128。', 'Negative');
      return;
    }
    const meta = getExportPageMeta() ?? {};
    /* 坐标三级：三下拉显式值 > 既有页 meta 坐标 > 空串（引擎按「显式入参 > 既有行 > id 推导」回退）。 */
    const domain = currentDomain() || String(meta.domain || '');
    const app = currentApp() || String(meta.app || '');
    const module = currentModule() || String(meta.module || '');
    /* C6③ 护栏：新建（id 与本次打开的既有页不同即按新建处理）+ 属主前缀 id + 三下拉与
       既有坐标全空 → 阻断。否则引擎三级回退落到「id 推导」，portal.model.gl.xxx 会被拆成
       domain=portal/app=model 的污染行。 */
    const isEditingExisting = !!meta.id && id === String(meta.id);
    const hasAnyCoord = !!(domain || app || module);
    if (!isEditingExisting && !hasAnyCoord && OWNER_ID_PREFIXES.some((p) => id.startsWith(p))) {
      setStrip('该 ID 前缀（portal.*）是资产属主前缀而非业务坐标：请先选择 Domain/Application/Module（或改用普通模式由坐标自动拼 ID），否则保存会产出 domain=portal 的无效坐标。', 'Negative');
      if (selDomain && !chkAdvanced?.checked) selDomain.focus();
      else inpId.focus();
      return;
    }
    btnSave.disabled = true;
    setStrip('正在保存…', 'Information');
    try {
      syncSourceView?.();
      const html = getHtmlForSave();
      /* 同时传 domain/app/module 字段：后端 saveHtmlPage 优先用这些归类；
         三级合并后仍为空（高级模式裸建无坐标页）则后端从既有行/id 解析。 */
      await saveHtmlPage({
        id, name, details, html,
        domain, app, module,
      });
      onSaved({ id, name, details, domain, app, module });
      setStrip('保存成功', 'Positive');
      onSaveLog(`页面已保存到服务器：${id}`);
      scheduleSuccessClose(() => {
        dlg.open = false;
      }, 1600);
    } catch (err) {
      setStrip(err.message || String(err), 'Negative');
      btnSave.disabled = false;
    }
  });

  dlg.addEventListener('close', onExportDlgClosed);
  dlg.addEventListener('ui5-close', onExportDlgClosed);

  /** 异步加载 registry（懒，首次打开对话框时拉一次）。 */
  const ensureRegistry = async () => {
    if (registry) return;
    try {
      registry = await getRegistryDam();
      fillSelect(selDomain, registry.domains.map((d) => ({
        value: String(d.id),
        text: d.label ? `${d.id} — ${d.label}` : String(d.id),
      })), '— 请选择 Domain —');
    } catch (err) {
      /* 加载失败：保留高级模式作为降级路径（用户仍能手填完整 id 保存）。 */
      registry = { domains: [], apps: [], modules: [] };
      setStrip(`加载 registry 失败，已切到高级模式：${err.message || err}`, 'Warning');
      if (chkAdvanced) {
        chkAdvanced.checked = true;
        applyAdvancedMode();
      }
    }
  };

  const openExportDialog = async () => {
    clearSuccessTimer();
    syncSourceView?.();
    const meta = getExportPageMeta() ?? { id: '', name: '', details: '' };
    inpName.value = meta.name || '';
    taDetails.value = meta.details || '';
    strip.replaceChildren();
    strip.hidden = true;
    btnSave.disabled = false;

    await ensureRegistry();

    /* 尝试从既有 id 反解填回三级；解析失败/不在 registry 内 → 切高级模式 */
    let restored = false;
    if (meta.id) {
      restored = decomposeIdToParts(meta.id);
      if (!restored) {
        /* 已有 id 但无法对到 registry：切高级模式，让用户直接编辑。 */
        if (chkAdvanced) chkAdvanced.checked = true;
        inpId.value = meta.id;
      }
    }
    if (!meta.id) {
      /* 新建页：清空三级 + pageName，等用户选 */
      if (selDomain) selDomain.value = '';
      if (selApp) selApp.value = '';
      if (selModule) selModule.value = '';
      if (inpPageName) inpPageName.value = '';
      inpId.value = '';
      if (chkAdvanced) chkAdvanced.checked = false;
      refreshApps();
      refreshModules();
      /* C6②：门户入口带过来的 DAM 上下文预填三级（registry 校验存在才填，防脏值）。
         新建页默认继承「用户当前所在业务位置」，普通模式随即由 composeIdFromParts 拼出坐标 id；
         高级模式同样预填但不锁定（applyAdvancedMode 仅禁用控件，值保留可读）。 */
      const urlDam = getUrlDam?.() || null;
      if (urlDam && registry) {
        if (urlDam.domain && registry.domains.some((x) => String(x.id) === urlDam.domain)) {
          selDomain.value = urlDam.domain;
          refreshApps();
          if (urlDam.app && registry.apps.some((x) => String(x.domain) === urlDam.domain && String(x.id) === urlDam.app)) {
            selApp.value = urlDam.app;
            refreshModules();
            if (urlDam.module && registry.modules.some((x) => String(x.domain) === urlDam.domain && String(x.app) === urlDam.app && String(x.id) === urlDam.module)) {
              selModule.value = urlDam.module;
            }
          }
        }
      }
    }
    applyAdvancedMode();

    openDialogCentered(dlg);
  };

  return { openExportDialog, dialogEl: dlg };
}
