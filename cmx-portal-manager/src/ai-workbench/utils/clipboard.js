/**
 * 剪贴板工具 —— 代码块复制按钮复用。
 *
 * markdown 经 innerHTML 渲染后，复制按钮（.code-copy）用事件委托处理点击，
 * 避免每次重渲染重新绑定。本模块提供：
 *   - handleCodeCopyClick(e)：事件委托入口，从点击目标回溯到 .code-block 取代码文本。
 *   - copyText(text)：Promise 风格复制，带 execCommand 兜底。
 *
 * 用法（在组件 firstUpdated 里绑定）：
 *   this.renderRoot.addEventListener('click', handleCodeCopyClick)
 */

/**
 * 复制文本到剪贴板。优先用现代 Clipboard API，不可用时回退 execCommand。
 * @param {string} text
 * @returns {Promise<boolean>} 是否成功
 */
export async function copyText (text) {
  if (!text) return false
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch { /* 回退到 execCommand */ }
  }
  return fallbackCopy(text)
}

/** execCommand 兜底复制。 */
function fallbackCopy (text) {
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  let ok = false
  try { ok = document.execCommand('copy') } catch { /* ignore */ }
  ta.remove()
  return ok
}

/**
 * 代码块复制按钮点击事件委托。
 * 由调用方在 renderRoot 上 addEventListener('click', handleCodeCopyClick) 绑定。
 * 点击 .code-copy 时，回溯到最近的 .code-block，取其 code/pre 的 textContent 复制，
 * 并临时把按钮文案改为"已复制"。
 * @param {Event} e
 */
export function handleCodeCopyClick (e) {
  const btn = e.target instanceof Element ? e.target.closest('.code-copy') : null
  if (!btn) return
  const block = btn.closest('.code-block')
  const code = block?.querySelector('code') || block?.querySelector('pre')
  const text = code?.textContent || ''
  if (!text) return
  const done = () => {
    btn.textContent = '已复制'
    btn.classList.add('copied')
    setTimeout(() => { btn.textContent = '复制'; btn.classList.remove('copied') }, 2000)
  }
  copyText(text).then(done).catch(() => done())
}
