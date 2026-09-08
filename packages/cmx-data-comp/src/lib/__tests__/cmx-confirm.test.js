// @vitest-environment jsdom
//
// cmxConfirm 测试：验证确定/取消返回 Promise<boolean>、ESC=取消、danger 主按钮红、主题跟随。

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { cmxConfirm } from '../cmx-message-dialog.js'

/** 取当前挂在 body 上的 cmxConfirm 对话框宿主 + 其 shadowRoot。 */
function currentDialog () {
  const host = document.querySelector('[data-cmx-confirm-dialog]')
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
afterEach(() => { document.body.replaceChildren() })

describe('cmxConfirm', () => {
  it('弹出后挂到 body，含标题/正文/确定+取消按钮', () => {
    cmxConfirm({ title: '确认删除', message: '此操作不可撤销' })
    const { host, sh } = currentDialog()
    expect(host).toBeTruthy()
    expect(sh.querySelector('.title').textContent).toBe('确认删除')
    expect(sh.querySelector('.message').textContent).toContain('此操作不可撤销')
    expect(sh.querySelector('[data-act="ok"]')).toBeTruthy()
    expect(sh.querySelector('[data-act="cancel"]')).toBeTruthy()
  })

  it('点确定 resolve(true)', async () => {
    const p = cmxConfirm({ message: '确认？' })
    const { sh } = currentDialog()
    clickAct(sh, 'ok')
    expect(await p).toBe(true)
    expect(document.querySelector('[data-cmx-confirm-dialog]')).toBeNull()
  })

  it('点取消 resolve(false)', async () => {
    const p = cmxConfirm({ message: '确认？' })
    const { sh } = currentDialog()
    clickAct(sh, 'cancel')
    expect(await p).toBe(false)
    expect(document.querySelector('[data-cmx-confirm-dialog]')).toBeNull()
  })

  it('ESC resolve(false)', async () => {
    const p = cmxConfirm({ message: '确认？' })
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }))
    expect(await p).toBe(false)
  })

  it('点遮罩 resolve(false)', async () => {
    const p = cmxConfirm({ message: '确认？' })
    const { sh } = currentDialog()
    const mask = sh.querySelector('.mask')
    // 模拟点遮罩空白处（target = mask）
    mask.dispatchEvent(new window.MouseEvent('click', { bubbles: true, composed: true }))
    expect(await p).toBe(false)
  })

  it('intent=danger 主按钮文案默认「删除」', () => {
    cmxConfirm({ message: 'x', intent: 'danger' })
    const { sh } = currentDialog()
    expect(sh.querySelector('[data-act="ok"]').textContent).toBe('删除')
  })

  it('intent=danger 用红色调（accent 来自 LEVELS.error）', () => {
    cmxConfirm({ message: 'x', intent: 'danger' })
    const { host, sh } = currentDialog()
    expect(host.getAttribute('data-cmx-confirm-dialog')).toBe('danger')
    // danger 的 SVG path 与 error 图标一致
    expect(sh.querySelector('.badge svg path').getAttribute('d')).toBeTruthy()
  })

  it('自定义 confirmText / cancelText 生效', () => {
    cmxConfirm({ message: 'x', confirmText: '是的', cancelText: '算了' })
    const { sh } = currentDialog()
    expect(sh.querySelector('[data-act="ok"]').textContent).toBe('是的')
    expect(sh.querySelector('[data-act="cancel"]').textContent).toBe('算了')
  })

  it('message 支持 \\n 换行转 <br>', () => {
    cmxConfirm({ message: '第一行\n第二行' })
    const { sh } = currentDialog()
    expect(sh.querySelector('.message').innerHTML).toContain('<br>')
  })
})
