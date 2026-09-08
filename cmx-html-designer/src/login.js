/**
 * 登录页脚本：提交 → 调 login() → 成功后回跳 redirect 参数（默认主页）。
 */

import { login, isLoggedIn } from './lib/auth.js'

const form = document.getElementById('login-form')
const errorEl = document.getElementById('error')
const submitBtn = document.getElementById('submit')

/** 解析回跳地址（防开放重定向：只接受站内绝对路径）。 */
function safeRedirect () {
  const raw = new URLSearchParams(window.location.search).get('redirect') || ''
  const decoded = (() => { try { return decodeURIComponent(raw) } catch { return '' } })()
  // 仅允许以单个 / 开头的站内路径，拒绝 //host、http(s):// 等
  if (decoded.startsWith('/') && !decoded.startsWith('//')) return decoded
  // 兜底回到应用 base（dev=/，prod 同源托管=/html/），不要落到站点根（/ 未托管 → 白屏）。
  return (import.meta.env && import.meta.env.BASE_URL) || '/'
}

// 已登录则直接回跳（避免重复登录）。
if (isLoggedIn()) {
  window.location.replace(safeRedirect())
}

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  errorEl.textContent = ''
  submitBtn.disabled = true
  submitBtn.textContent = '登录中…'
  try {
    const username = form.username.value.trim()
    const password = form.password.value
    if (!username || !password) {
      errorEl.textContent = '请输入用户名和密码'
      return
    }
    await login({ username, password })
    window.location.replace(safeRedirect())
  } catch (err) {
    errorEl.textContent = err?.message || '登录失败，请重试'
  } finally {
    submitBtn.disabled = false
    submitBtn.textContent = '登 录'
  }
})
