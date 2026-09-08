import { stripDesignScriptsFromHtmlFragment, wrapHtmlDocument } from './html-utils.js';
import { buildCmxScriptBlockFromPageState } from './build-cmx-page-script-block.js';

/**
 * 服务端「保存到服务器」当前存的是源码包（画布 HTML + 设计时脚本预览 + __designer_meta__），
 * 不是 {@link wrapHtmlDocument} 整页。多页调试拉取后须包成与「调试」按钮一致的运行态 HTML，
 * 否则没有 __hydrateEvents / cmx-html-pages 宿主，data-event* 等不生效。
 *
 * @param {string} html 接口返回的 html 字段
 * @param {string|{id?:string, domain?:string, app?:string, module?:string}} pageMeta 页面 id 或含坐标的元信息
 * @returns {string} 可交给 debug.html 解析的完整文档字符串
 */
export function normalizeServerPageHtmlForDebug (html, pageMeta) {
  if (html == null || typeof html !== 'string') return '';
  const s = html.trim();
  if (!s) return s;
  // 兼容旧调用（仅传字符串 id）与新调用（含 domain/app/module 的对象）
  const pm = typeof pageMeta === 'string' ? { id: pageMeta } : (pageMeta || {});
  const pageId = pm.id != null && String(pm.id).trim() ? String(pm.id).trim() : 'unnamed';

  const looksRunnable =
    /\bfunction\s+__hydrateEvents\b/.test(s) && /\bcmx-html-pages-[a-z0-9-]+\b/i.test(s);
  if (looksRunnable) return html;

  const wrappedInput = /<\s*html[\s>]/i.test(s)
    ? s
    : `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${s}</body></html>`;
  const doc = new DOMParser().parseFromString(wrappedInput, 'text/html');
  const meta = doc.getElementById('__designer_meta__');
  /** @type {{ pageData?: unknown[], pageFns?: unknown[], pageServices?: unknown[], pageDeps?: unknown[], pageInterfaces?: unknown[], dataFlow?: object|null, dataSources?: unknown[], models?: unknown[] }} */
  let state = { pageData: [], pageFns: [], pageServices: [], pageDeps: [], pageInterfaces: [], dataFlow: null, dataSources: [], models: [] };
  if (meta?.textContent) {
    try {
      const o = JSON.parse(meta.textContent);
      state = {
        pageData: Array.isArray(o.pageData) ? o.pageData : [],
        pageFns: Array.isArray(o.pageFns) ? o.pageFns : [],
        pageServices: Array.isArray(o.pageServices) ? o.pageServices : [],
        pageDeps: Array.isArray(o.pageDeps) ? o.pageDeps : [],
        pageInterfaces: Array.isArray(o.pageInterfaces) ? o.pageInterfaces : [],
        dataFlow: o.dataFlow && typeof o.dataFlow === 'object' ? o.dataFlow : null,
        dataSources: Array.isArray(o.dataSources) ? o.dataSources : [],
        models: Array.isArray(o.models) ? o.models : [],
      };
    } catch {
      /* 保持默认空状态，仍可用仅 UI 的 wrap */
    }
  }

  const cmxTpl = doc.body?.querySelector('template[id^="cmx-page-template-"]');
  let designFragment;
  if (cmxTpl) {
    designFragment = cmxTpl.innerHTML;
  } else {
    const b = doc.body?.cloneNode(true);
    if (b) {
      b.querySelectorAll('script#__designer_meta__').forEach((el) => el.remove());
      const { html: stripped } = stripDesignScriptsFromHtmlFragment(b.innerHTML);
      designFragment = stripped;
    } else {
      designFragment = '';
    }
  }

  let metaJson = '';
  try {
    metaJson = JSON.stringify(state).replace(/</g, '\\u003c');
  } catch {
    metaJson = '';
  }

  const scriptBlock = buildCmxScriptBlockFromPageState(state, pm);
  const deps = Array.isArray(state.pageDeps) ? state.pageDeps : [];

  return wrapHtmlDocument(String(designFragment).trim(), scriptBlock, metaJson, deps, pm);
}
