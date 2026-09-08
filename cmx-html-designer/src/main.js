/**
 * 应用入口 — 登录门 → 加载共用 UI5 runtime 后启动设计器。
 */
import './style.css'
import { ensureCmxUi5Runtime } from 'cmx-ui5-runtime/client'
import { library } from './lib/index.js'
import { requireAuthOrRedirect } from './lib/auth.js'
import { installAuthFetchInterceptor } from 'cmx-ui5-runtime/api-client'
import { installGlobalErrorToast, showCmxFatalScreen } from 'cmx-data-comp/lib/cmx-toast.js'

// 全局 fetch 拦截：给所有 /api/* 请求带上 Bearer token + 统一 401 处理。
installAuthFetchInterceptor()
// 全局错误兜底：unhandledrejection / 脚本错误 → 轻量 toast（此前只进 DevTools，用户不可见）。
installGlobalErrorToast()

async function bootstrapDesigner () {
  // 登录门：未登录直接跳 /login，中止后续启动。
  if (!requireAuthOrRedirect()) return
  await ensureCmxUi5Runtime()
  const theme = sessionStorage.getItem('__designer_theme__') || library.defaultTheme
  library.applyTheme(theme)
  await import('./import-ui5-and-app.js')
}

void bootstrapDesigner().catch((err) => {
  console.error('[CMXHTMLDesigner] bootstrap failed:', err)
  showCmxFatalScreen('设计器启动失败', err)
})
