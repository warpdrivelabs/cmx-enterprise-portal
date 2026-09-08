/**
 * 启动顺序：登录门 → 共用 UI5 runtime → 注册 Portal 组件 → 主题 → 语言 → reRender。
 *
 * @see packages/cmx-ui5-runtime/src/install.js
 * @see src/import-ui5-and-app.js
 */
import './app-shell.css'
import { ensureCmxUi5Runtime } from 'cmx-ui5-runtime/client'
import { initPortalUi5Theme } from './lib/portal-ui5-theme.js'
import { initPortalUi5Language } from './lib/portal-ui5-locale.js'
import { installConsoleBridge } from './lib/console-bridge.js'
import { requireAuthOrRedirect, fetchCurrentUser, syncUserIdentity } from './lib/auth.js'
import { installAuthFetchInterceptor } from 'cmx-ui5-runtime/api-client'
import { showCmxError, installGlobalErrorToast, showCmxFatalScreen } from 'cmx-data-comp/lib/cmx-toast.js'

installConsoleBridge()
// 全局 fetch 拦截：给所有 /api/* 请求带上 Bearer token + 统一 401 处理（须在任何 API 调用前安装）。
installAuthFetchInterceptor()
// 全局错误兜底：unhandledrejection / 脚本错误 → 轻量 toast（此前只进日志面板，用户不可见）。
installGlobalErrorToast()

async function bootstrapPortalShell () {
  // 登录门：未登录直接跳 /login，中止后续启动（全局必登录）。
  if (!requireAuthOrRedirect()) return
  // 拉取当前用户信息挂 globalThis，供 native-page 字符串模板经 globalThis.__cmxUser 读取
  //（fetchCurrentUser 已拆 ApiResp 信封，返回 { user_id, username, nickname, ... }）。
  try {
    const user = await fetchCurrentUser()
    if (user) globalThis.__cmxUser = user
    // 已登录会话补写 cmx_user_id/cmx_username（流程待办中心按人过滤的约定 key；
    // 老会话登录时还没有该逻辑，此处兜底）。
    await syncUserIdentity()
  } catch (e) {
    // 获取失败不阻断启动；部分页面功能（按人过滤等）会降级
    showCmxError('用户信息获取失败', e)
  }
  await ensureCmxUi5Runtime()
  await import('./import-ui5-and-app.js')
  await initPortalUi5Theme()
  await initPortalUi5Language()
  const { reRenderAllUI5Elements } = globalThis.__cmxUi5
  await reRenderAllUI5Elements({ themeAware: true, languageAware: true })
}

void bootstrapPortalShell().catch((err) => {
  console.error('[CMXPortalManager] bootstrap failed:', err)
  showCmxFatalScreen('门户启动失败', err)
})
