/** @param {HTMLElement} host */
export function onProfileAccount (host) {
  const sr = host.shadowRoot
  const content = sr.getElementById('content-area')
  const logPanel = sr.getElementById('log-panel')
  if (content) {
    content.addTab({
      id: 'profile-account',
      text: '个人信息',
      icon: 'account',
      content: `<div style="padding:24px;color:var(--sapContent_LabelColor,#6a6d70);font-size:14px;line-height:1.6">
        <p style="margin:0 0 12px 0">账号与个人信息管理（占位）。后续可接入统一认证与用户中心。</p>
      </div>`,
    })
  }
  logPanel?.addLog('已打开：个人信息', 'info', 'Account')
}

/** @param {HTMLElement} host */
export function onProfileLogout (host) {
  const logPanel = host.shadowRoot.getElementById('log-panel')
  const ok = typeof window !== 'undefined' && window.confirm('确定要退出登录吗？')
  if (!ok) {
    logPanel?.addLog('已取消退出登录', 'info', 'Account')
    return
  }
  logPanel?.addLog('正在退出登录…', 'info', 'Account')
  import('../lib/auth.js')
    .then(({ logout, gotoLogin }) => logout().finally(() => gotoLogin()))
    .catch((err) => {
      logPanel?.addLog('退出登录失败：' + (err instanceof Error ? err.message : String(err)), 'warn', 'Account')
    })
}
