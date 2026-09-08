import { resolveDesignerShellPage } from '../../utils/designer-shell-url.js';
import { buildWrappedDesignerPageHtml } from './designer-run-common.js';

/**
 * @param {{
 *   getPageId: () => string,
 *   getDesignBodyHtmlForExportAndRun: () => string,
 *   pageData: { getScriptBlock?: (id: string) => string, getDeps?: () => unknown[] },
 *   log: (msg: string) => void,
 *   window?: Window,
 * }} ctx
 */
export function openDesignerRunInNewWindow(ctx) {
  const win = ctx.window ?? window;
  const pageId = ctx.getPageId();
  const html = buildWrappedDesignerPageHtml(ctx);
  win.sessionStorage.removeItem('__designer_run_batch__');
  win.sessionStorage.setItem(
    '__designer_run__',
    JSON.stringify({ html, pageId }),
  );
  const opened = win.open(resolveDesignerShellPage('debug.html'), '_blank');
  if (!opened) ctx.log('调试窗口被浏览器拦截，请允许弹出窗口后重试');
  else ctx.log('已在新窗口中打开调试页');
}

/**
 * 在新窗口打开 debug.html，按多标签加载多页（与 {@link openDesignerRunInNewWindow} 互斥 session 键）。
 * @param {{
 *   pages: { id: string, name?: string, details?: string, timestamp?: string, html: string }[],
 *   log?: (msg: string) => void,
 *   window?: Window,
 * }} ctx `pages` 须为 `getHtmlPagesBatch` 返回项（含 `html`）。
 */
export function openDesignerMultiPagesRunInNewWindow (ctx) {
  const win = ctx.window ?? window;
  const log = ctx.log;
  const rows = ctx.pages || [];
  const serializable = rows.map((p) => ({
    pageId: p.id,
    html: p.html,
    name: typeof p.name === 'string' ? p.name : '',
    details: typeof p.details === 'string' ? p.details : '',
    timestamp: typeof p.timestamp === 'string' ? p.timestamp : '',
  }));
  win.sessionStorage.removeItem('__designer_run__');
  win.sessionStorage.setItem('__designer_run_batch__', JSON.stringify({ pages: serializable }));
  const opened = win.open(resolveDesignerShellPage('debug.html'), '_blank');
  if (!opened) log?.('调试窗口被浏览器拦截，请允许弹出窗口后重试');
  else log?.(`已在新窗口打开调试页（${serializable.length} 个页面）`);
}
