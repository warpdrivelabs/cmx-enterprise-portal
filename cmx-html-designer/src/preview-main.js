/**
 * 预览页入口 — 加载共用 UI5 runtime 后注入 body 并执行内联脚本。
 */
import { ensureCmxUi5Runtime } from 'cmx-ui5-runtime/client'
import { library } from './lib/index.js'

async function bootstrapPreview () {
  await ensureCmxUi5Runtime()
  const theme = sessionStorage.getItem('__designer_theme__') || library.defaultTheme
  library.applyTheme(theme)

  const raw = sessionStorage.getItem('__designer_preview__')
  if (!raw) return

  const parser = new DOMParser()
  const doc = parser.parseFromString(raw, 'text/html')
  if (doc.title) document.title = doc.title
  if (doc.body.className) document.body.className = doc.body.className

  const bodyClone = doc.body.cloneNode(true)
  const scriptEls = Array.from(bodyClone.querySelectorAll('script')).filter(
    s => !s.type || s.type === 'text/javascript',
  )
  scriptEls.forEach(s => s.remove())

  document.body.innerHTML = bodyClone.innerHTML

  scriptEls.forEach(orig => {
    const el = document.createElement('script')
    el.textContent = orig.textContent
    document.body.appendChild(el)
  })
}

void bootstrapPreview().catch((err) => {
  console.error('[CMXHTMLDesigner] preview bootstrap failed:', err)
  // 预览是独立窗口：失败时页内错误占位（此前只 console → 用户看到空白预览窗）。
  const msg = (err && err.message) || String(err)
  document.body.innerHTML =
    '<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;'
    + 'background:#f4f5f9;font-family:-apple-system,\'Segoe UI\',\'PingFang SC\',\'Microsoft YaHei\',sans-serif">'
    + '<div style="max-width:480px;padding:24px 28px;background:var(--sapList_Background, #ffffff);border:1px solid #e0e4ee;'
    + 'border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.08)">'
    + '<h2 style="margin:0 0 10px;font-size:16px;color:var(--sapNegativeTextColor, #bb0000)">预览加载失败</h2>'
    + `<pre style="margin:0;font-size:12.5px;line-height:1.6;color:var(--sapLinkColor, #1a1d27);white-space:pre-wrap;word-break:break-word">${msg
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`
    + '</div></div>'
})
