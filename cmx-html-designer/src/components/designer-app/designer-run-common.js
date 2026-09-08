import { wrapHtmlDocument } from '../../utils/html-utils.js';

/**
 * @param {{
 *   getPageId: () => string,
 *   getDesignBodyHtmlForExportAndRun: () => string,
 *   pageData: { getScriptBlock?: (id: string) => string, getDeps?: () => unknown[] },
 * }} ctx
 */
export function buildWrappedDesignerPageHtml(ctx) {
  const pageId = ctx.getPageId();
  const scriptBlock = ctx.pageData.getScriptBlock?.(pageId) ?? '';
  const deps = ctx.pageData.getDeps?.() ?? [];
  return wrapHtmlDocument(
    ctx.getDesignBodyHtmlForExportAndRun(),
    scriptBlock,
    '',
    deps,
    pageId,
  );
}
