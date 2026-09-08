/**
 * 设计器主应用与 preview.html / debug.html 同目录部署时的基准路径（含末尾 /）。
 * 例：/html/index.html → /html/；/html/ → /html/；/ → /
 */
export function getAppHtmlBasePath() {
  let { pathname } = window.location;
  if (pathname.endsWith('/')) return pathname;
  const lastSeg = pathname.split('/').pop() ?? '';
  if (lastSeg.includes('.') && lastSeg !== '..') {
    const i = pathname.lastIndexOf('/');
    return (i < 0 ? '/' : pathname.slice(0, i + 1));
  }
  return `${pathname}/`;
}

/** 解析与当前设计器页面同级的 preview.html / debug.html 等绝对 URL */
export function resolveDesignerShellPage(filename) {
  const base = getAppHtmlBasePath();
  return new URL(filename, `${window.location.origin}${base}`).href;
}
