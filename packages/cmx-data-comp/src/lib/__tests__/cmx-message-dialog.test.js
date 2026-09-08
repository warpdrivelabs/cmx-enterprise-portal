// @vitest-environment jsdom
//
// cmx-message-dialog 冒烟测试：验证「专业信息提示对话框」真的渲染出结构、三级别正确、
// 帮助事件与关闭行为可用 —— 因为它的价值在于「用户看得见」，光导出不算数。

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { showCmxMessage, cmxInfo, cmxWarn, cmxError } from '../cmx-message-dialog.js'

/** 取当前挂在 body 上的对话框宿主 + 其 shadowRoot。 */
function currentDialog () {
  const host = document.querySelector('[data-cmx-message-dialog]')
  return { host, sh: host && host.shadowRoot }
}

/** 点某个 data-act 按钮。 */
function clickAct (sh, act) {
  const btn = sh.querySelector(`[data-act="${act}"]`)
  btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true, composed: true }))
  return btn
}

beforeEach(() => {
  document.body.replaceChildren()
  try { localStorage.clear() } catch { /* noop */ }
})
afterEach(() => {
  document.body.replaceChildren()
})

describe('cmx-message-dialog: 渲染与三级别', () => {
  it('弹出后挂到 body，含标题/正文/确定按钮，居中遮罩', () => {
    showCmxMessage({ level: 'error', title: '保存失败', message: '字段超长' })
    const { host, sh } = currentDialog()
    expect(host).toBeTruthy()
    expect(host.getAttribute('data-cmx-message-dialog')).toBe('error')
    expect(sh.querySelector('.title').textContent).toBe('保存失败')
    expect(sh.querySelector('.message').textContent).toContain('字段超长')
    expect(sh.querySelector('.mask')).toBeTruthy()           // 遮罩（居中容器）
    expect(sh.querySelector('.dialog[role="alertdialog"]')).toBeTruthy()
    expect(sh.querySelector('[data-act="ok"]')).toBeTruthy()
  })

  it('error/warning 显示「获取帮助」，info 不显示', () => {
    cmxError('e', { title: '错误', helpCode: 'X' })
    expect(currentDialog().sh.querySelector('[data-act="help"]')).toBeTruthy()
    document.body.replaceChildren()

    cmxWarn('w', { title: '警告', helpCode: 'Y' })
    expect(currentDialog().sh.querySelector('[data-act="help"]')).toBeTruthy()
    document.body.replaceChildren()

    cmxInfo('i', { title: '信息' })
    expect(currentDialog().sh.querySelector('[data-act="help"]')).toBeFalsy()
  })

  it('details 渲染为逐行明细列表', () => {
    showCmxMessage({ level: 'error', title: '校验失败', details: ['• 第1行超长', '• 第2行必填'] })
    const items = currentDialog().sh.querySelectorAll('.details li')
    expect(items.length).toBe(2)
    expect(items[0].textContent).toContain('第1行超长')
  })

  it('非法 level 回退到 info', () => {
    showCmxMessage({ level: 'nope', title: 'T' })
    expect(currentDialog().host.getAttribute('data-cmx-message-dialog')).toBe('info')
  })
})

describe('cmx-message-dialog: 交互与关闭', () => {
  it('点「确定」resolve("ok") 并移除宿主', async () => {
    const p = showCmxMessage({ level: 'info', title: 'T', message: 'm' })
    clickAct(currentDialog().sh, 'ok')
    await expect(p).resolves.toBe('ok')
    expect(document.querySelector('[data-cmx-message-dialog]')).toBeFalsy()
  })

  it('ESC 关闭并 resolve("ok")', async () => {
    const p = showCmxMessage({ level: 'info', title: 'T' })
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await expect(p).resolves.toBe('ok')
  })

  it('onClose 回调收到关闭方式', async () => {
    const onClose = vi.fn()
    const p = showCmxMessage({ level: 'info', title: 'T', onClose })
    clickAct(currentDialog().sh, 'ok')
    await p
    expect(onClose).toHaveBeenCalledWith('ok')
  })
})

describe('cmx-message-dialog: 获取帮助事件桥', () => {
  it('点「获取帮助」派发 cmx-help-request（带 code/level/title），resolve("help")', async () => {
    const seen = []
    const onHelp = (e) => seen.push(e.detail)
    window.addEventListener('cmx-help-request', onHelp)
    try {
      const p = showCmxMessage({ level: 'error', title: '保存失败', helpCode: 'DEF_SAVE_FAILED' })
      clickAct(currentDialog().sh, 'help')
      await expect(p).resolves.toBe('help')
      expect(seen.length).toBe(1)
      expect(seen[0]).toMatchObject({ code: 'DEF_SAVE_FAILED', level: 'error', title: '保存失败' })
    } finally {
      window.removeEventListener('cmx-help-request', onHelp)
    }
  })

  it('点「获取帮助」后对话框关闭（帮助内容已打开，模态遮罩不残留）', async () => {
    const p = showCmxMessage({ level: 'error', title: '保存失败', helpCode: 'DOC_LOAD_FAILED' })
    const { sh } = currentDialog()
    clickAct(sh, 'help')
    await expect(p).resolves.toBe('help')
    expect(document.querySelector('[data-cmx-message-dialog]')).toBeFalsy()
  })

  it('监听方 preventDefault → 不回退 window.open（门户已接管）', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    const onHelp = (e) => e.preventDefault()   // 模拟 portal-app 接管
    window.addEventListener('cmx-help-request', onHelp)
    try {
      showCmxMessage({ level: 'error', title: 'T', helpCode: 'C', helpUrl: 'https://help.example/x' })
      clickAct(currentDialog().sh, 'help')
      expect(openSpy).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener('cmx-help-request', onHelp)
      openSpy.mockRestore()
    }
  })
})

describe('cmx-message-dialog: 主题', () => {
  // jsdom 的 storage 在本配置下不可用 → 用内存桩注入主题键，验证配色随主题切换。
  // 门户实际写 sessionStorage，故两处都要覆盖。
  let sessionStore, localStore
  const mkStore = (backing) => ({
    getItem: (k) => (k in backing ? backing[k] : null),
    setItem: (k, v) => { backing[k] = String(v) },
    removeItem: (k) => { delete backing[k] },
    clear: () => { for (const k of Object.keys(backing)) delete backing[k] },
  })
  beforeEach(() => {
    sessionStore = {}
    localStore = {}
    vi.stubGlobal('sessionStorage', mkStore(sessionStore))
    vi.stubGlobal('localStorage', mkStore(localStore))
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('门户写 sessionStorage 暗色 → 暗色背景令牌', () => {
    sessionStorage.setItem('__portal_ui5_theme__', 'sap_horizon_dark')
    showCmxMessage({ level: 'info', title: 'T' })
    const style = currentDialog().sh.querySelector('style').textContent
    expect(style).toContain('#1c2030')   // 暗色 bg 令牌
  })

  it('门户写 sessionStorage 亮色 → 浅色背景令牌（回归：修复前读 localStorage 落系统偏好）', () => {
    sessionStorage.setItem('__portal_ui5_theme__', 'sap_horizon')
    showCmxMessage({ level: 'info', title: 'T' })
    const style = currentDialog().sh.querySelector('style').textContent
    expect(style).toContain('#ffffff')   // 浅色 bg 令牌
  })

  it('localStorage 亦可（跨标签页/兼容路径）', () => {
    localStorage.setItem('__portal_ui5_theme__', 'sap_horizon_dark')
    showCmxMessage({ level: 'info', title: 'T' })
    const style = currentDialog().sh.querySelector('style').textContent
    expect(style).toContain('#1c2030')
  })

  it('sessionStorage 优先于 localStorage', () => {
    sessionStorage.setItem('__portal_ui5_theme__', 'sap_horizon')       // 亮
    localStorage.setItem('__portal_ui5_theme__', 'sap_horizon_dark')    // 暗
    showCmxMessage({ level: 'info', title: 'T' })
    const style = currentDialog().sh.querySelector('style').textContent
    expect(style).toContain('#ffffff')   // 取 sessionStorage 的亮色
  })
})
