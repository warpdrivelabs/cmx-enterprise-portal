// @vitest-environment jsdom
//
// cmx-doc-error-presenter 测试：DCT/DOC 存储服务错误 → 专业对话框 的翻译与展示。
// 覆盖四类错误形态：取消(abort) / 冲突(conflict) / 校验(validation) / 普通(generic)，
// 以及 presentDocError 真的弹出对话框、静默取消、按 kind 返回。

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { describeDocError, presentDocError } from '../cmx-doc-error-presenter.js'

/** 构造一个带标记的存储层错误（模仿 cmx-doc-source.js 的 throw）。 */
function makeErr (message, extra = {}) {
  const e = new Error(message)
  Object.assign(e, extra)
  return e
}

describe('describeDocError: 纯映射（不碰 DOM）', () => {
  it('AbortError → 静默忽略', () => {
    const d = describeDocError(makeErr('canceled', { name: 'AbortError' }))
    expect(d).toEqual({ kind: 'abort', ignore: true })
  })

  it('silentAbort:false → 取消也当普通错误展示', () => {
    const d = describeDocError(makeErr('canceled', { name: 'AbortError' }), { silentAbort: false })
    expect(d.kind).toBe('generic')
    expect(d.ignore).toBeFalsy()
  })

  it('err.conflict（409）→ warning + 刷新提示 + 冲突帮助码', () => {
    const d = describeDocError(makeErr('[saveDocData] 保存冲突: 409', { conflict: true }))
    expect(d.kind).toBe('conflict')
    expect(d.level).toBe('warning')
    expect(d.title).toBe('保存冲突')
    expect(d.message).toContain('他人修改')
    expect(d.helpCode).toBe('DOC_SAVE_CONFLICT')
  })

  it('err.validation + violations（422）→ error + 逐行明细 + 首条 code 作帮助码', () => {
    const violations = [
      { table: 'cv_batch', column: 'batch_name', code: 'VALUE_TOO_LONG', code_num: 1002, message: '「凭证批名称」长度超限：最多 50 个字符，实际 60 个' },
      { table: 'cv_line', column: 'amount', code: 'PRECISION', code_num: 1005, message: '「金额」精度超限：最多 2 位小数' },
    ]
    const d = describeDocError(makeErr('数据校验未通过', { validation: true, violations }), {
      tableNames: { cv_batch: '凭证批', cv_line: '凭证行' },
    })
    expect(d.kind).toBe('validation')
    expect(d.level).toBe('error')
    expect(d.details).toHaveLength(2)
    expect(d.details[0]).toContain('凭证批(cv_batch)')      // 层前缀（中文名(表名)）
    expect(d.details[0]).toContain('长度超限')
    expect(d.details[0]).toContain('[1002-VALUE_TOO_LONG]') // 明细行末尾附 数字-字符串 错误码
    expect(d.details[1]).toContain('[1005-PRECISION]')
    expect(d.helpCode).toBe('VALUE_TOO_LONG')               // 首条 violation.code
  })

  it('validation 但只有内嵌多行 message（无 violations 数组）→ 从 message 拆出明细', () => {
    const d = describeDocError(makeErr('数据校验未通过\n• 第1行超长\n• 第2行必填', { validation: true }))
    expect(d.kind).toBe('validation')
    expect(d.details).toEqual(['• 第1行超长', '• 第2行必填'])
  })

  it('普通失败 → error，剥掉 [funcName] 技术前缀', () => {
    const d = describeDocError(makeErr('[saveDocData] 保存失败: 服务器 500'))
    expect(d.kind).toBe('generic')
    expect(d.level).toBe('error')
    expect(d.title).toBe('保存失败')                        // 从 saveDocData 前缀推断 action=save
    expect(d.message).toBe('保存失败: 服务器 500')          // 前缀 [saveDocData] 已剥掉
    expect(d.helpCode).toBe('DOC_SAVE_FAILED')
  })

  it('从 loadDocData 前缀推断 action=load → 装载失败标题/帮助码', () => {
    const d = describeDocError(makeErr('[loadDocData] 装载失败: 404'))
    expect(d.title).toBe('装载失败')
    expect(d.helpCode).toBe('DOC_LOAD_FAILED')
  })

  it('显式 opts.action / title / helpCode 覆盖推断值', () => {
    const d = describeDocError(makeErr('boom'), { action: 'delete', title: '删不掉', helpCode: 'X1' })
    expect(d.title).toBe('删不掉')
    expect(d.helpCode).toBe('X1')
  })

  it('空消息兜底文案', () => {
    const d = describeDocError(makeErr(''))
    expect(d.message).toContain('服务器处理失败')
  })

  it('非 Error 值（字符串）也能处理', () => {
    const d = describeDocError('直接抛字符串')
    expect(d.kind).toBe('generic')
    expect(d.message).toBe('直接抛字符串')
  })
})

describe('presentDocError: 弹对话框 + 按 kind 返回', () => {
  beforeEach(() => { document.body.replaceChildren() })
  afterEach(() => { document.body.replaceChildren() })

  function currentDialog () {
    const host = document.querySelector('[data-cmx-message-dialog]')
    return { host, sh: host && host.shadowRoot }
  }
  function clickAct (sh, act) {
    sh.querySelector(`[data-act="${act}"]`).dispatchEvent(new window.MouseEvent('click', { bubbles: true, composed: true }))
  }

  it('冲突 → 弹 warning 对话框，点确定 resolve {kind:"conflict", choice:"ok"}', async () => {
    const p = presentDocError(makeErr('保存冲突', { conflict: true }))
    const { host, sh } = currentDialog()
    expect(host.getAttribute('data-cmx-message-dialog')).toBe('warning')
    expect(sh.querySelector('.title').textContent).toBe('保存冲突')
    expect(sh.querySelector('[data-act="help"]')).toBeTruthy()   // warning 带获取帮助
    clickAct(sh, 'ok')
    await expect(p).resolves.toEqual({ kind: 'conflict', choice: 'ok' })
  })

  it('校验失败 → error 对话框含明细列表', async () => {
    const violations = [{ table: 'cv_line', column: 'amount', code: 'X', message: '金额必填' }]
    const p = presentDocError(makeErr('校验未通过', { validation: true, violations }))
    const { host, sh } = currentDialog()
    expect(host.getAttribute('data-cmx-message-dialog')).toBe('error')
    expect(sh.querySelectorAll('.details li').length).toBe(1)
    expect(sh.querySelector('.details li').textContent).toContain('金额必填')
    clickAct(sh, 'ok')
    await expect(p).resolves.toEqual({ kind: 'validation', choice: 'ok' })
  })

  it('取消/中断 → 静默，不弹对话框，resolve null', async () => {
    const r = await presentDocError(makeErr('canceled', { name: 'AbortError' }))
    expect(r).toBeNull()
    expect(document.querySelector('[data-cmx-message-dialog]')).toBeFalsy()
  })
})
