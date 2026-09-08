import { buildWrappedDesignerPageHtml } from './designer-run-common.js';
import { openDialogCentered } from './dialog-center.js';

/**
 * @param {{ shadowRoot: ShadowRoot, onDialogClosed: () => void }} opts
 */
export function bindDesignerInlineRunDialog(opts) {
  const { shadowRoot, onDialogClosed } = opts;
  const dlg = shadowRoot.getElementById('inlineRunDlg');
  const mount = shadowRoot.getElementById('inlineRunMount');
  const btnClose = shadowRoot.getElementById('inlineRunCloseBtn');
  if (!dlg || !mount || !btnClose) return;

  const clearInlineRunMount = () => {
    try {
      mount.replaceChildren();
    } catch (_) {
      /* ignore */
    }
  };
  const onInlineRunDlgClosed = () => {
    clearInlineRunMount();
    onDialogClosed();
  };
  btnClose.addEventListener('click', () => {
    dlg.open = false;
  });
  dlg.addEventListener('close', onInlineRunDlgClosed);
  dlg.addEventListener('ui5-close', onInlineRunDlgClosed);
}

/**
 * @param {{
 *   getPageId: () => string,
 *   getDesignBodyHtmlForExportAndRun: () => string,
 *   pageData: { getScriptBlock?: (id: string) => string, getDeps?: () => unknown[] },
 *   shadowRoot: ShadowRoot,
 *   setInlineRunDesignLocked: (locked: boolean) => void,
 *   log: (msg: string) => void,
 * }} ctx
 */
export function openDesignerInlineRunDialog(ctx) {
  const html = buildWrappedDesignerPageHtml(ctx);
  const sr = ctx.shadowRoot;
  const dlg = sr.getElementById('inlineRunDlg');
  const mount = sr.getElementById('inlineRunMount');
  if (!dlg || !mount) {
    ctx.log('页内运行对话框未就绪');
    return;
  }

  ctx.setInlineRunDesignLocked(true);
  mount.replaceChildren();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const bodyEl = doc.body;
  if (!bodyEl) {
    ctx.setInlineRunDesignLocked(false);
    ctx.log('页内运行：解析 HTML 失败');
    return;
  }

  const scriptEls = Array.from(bodyEl.querySelectorAll('script')).filter(
    (s) => !s.type || s.type === 'text/javascript',
  );
  scriptEls.forEach((s) => s.remove());

  const g = globalThis;
  const prevRoot = g.__cmxTemplateRoot;
  g.__cmxTemplateRoot = mount;
  try {
    while (bodyEl.firstChild) {
      mount.appendChild(bodyEl.firstChild);
    }
    scriptEls.forEach((orig) => {
      const s = document.createElement('script');
      s.textContent = orig.textContent;
      mount.appendChild(s);
    });
  } catch (err) {
    ctx.setInlineRunDesignLocked(false);
    mount.replaceChildren();
    ctx.log(`页内运行：注入失败 ${err?.message || err}`);
    return;
  } finally {
    if (prevRoot === undefined) delete g.__cmxTemplateRoot;
    else g.__cmxTemplateRoot = prevRoot;
  }

  openDialogCentered(dlg);
  ctx.log('已在页内对话框中加载当前设计页面（主应用已含 UI5，与独立运行页行为一致）');
}
