import { resolveDesignerShellPage } from '../../utils/designer-shell-url.js';
import { buildWrappedDesignerPageHtml } from './designer-run-common.js';
import { showCmxToast } from 'cmx-data-comp/lib/cmx-toast.js';

/**
 * @param {{
 *   getPageId: () => string,
 *   getDesignBodyHtmlForExportAndRun: () => string,
 *   pageData: { getScriptBlock?: (id: string) => string, getDeps?: () => unknown[] },
 *   log: (msg: string) => void,
 *   window?: Window,
 * }} ctx
 */
export function openDesignerPreview(ctx) {
  const win = ctx.window ?? window;
  const html = buildWrappedDesignerPageHtml(ctx);
  win.sessionStorage.setItem('__designer_preview__', html);
  const opened = win.open(resolveDesignerShellPage('preview.html'), '_blank');
  if (!opened) {
    // ctx.log 实为 console.log（designer-app._ioRunCtx），用户看不到；toast 明示。
    ctx.log('预览窗口被浏览器拦截');
    showCmxToast('预览窗口被浏览器拦截，请允许本站弹出窗口后重试', { level: 'warning', title: '预览' });
  } else {
    ctx.log('已打开预览窗口');
  }
}
