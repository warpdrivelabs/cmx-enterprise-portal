/** 标签元数据静态路径，与 Vite base 一致（生产 /html/metadata/） */
function metadataBaseUrl() {
  const base = import.meta.env.BASE_URL || '/'
  return `${base}metadata`.replace(/([^:]\/)\/+/g, '$1')
}

/**
 * @param {string} relativePath 如 `tag-index.json` 或 `tags/ui5/ui5-button.json`
 */
export async function fetchDesignerMetadataJson(relativePath) {
  const rel = String(relativePath).replace(/^\//, '')
  const url = `${metadataBaseUrl()}/${rel}`
  // B2 例外：静态资源（非 /api），不适用 apiFetch 的鉴权/信封语义。
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(
      `[designer-metadata] 加载失败 ${res.status}: ${url}（请先构建 HTML 设计器）`,
    )
  }
  return res.json()
}
