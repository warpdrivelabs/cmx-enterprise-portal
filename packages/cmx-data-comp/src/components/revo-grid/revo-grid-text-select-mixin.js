/**
 * 只读单元格文本选择 mixin（I 组）。
 *
 * 背景：revo-grid host 元素自带 `user-select: none`（revo-grid-style.css），
 * `.rgCell` 继承导致默认无法用鼠标拖选单元格文本。revo-grid 又在 document 上
 * 监听 copy 事件，preventDefault 后写入"焦点单元格整值"——即便拖选到子串，
 * Ctrl+C 复制出的仍是整格值。
 *
 * 本 mixin 提供 allowTextSelect 能力（选项默认 false，只读展示页按需开启）：
 *  - _applyAllowTextSelect：给 _revo 加 .cmx-allow-text-select class，_css() 里的
 *    规则把 .rgCell 的 user-select 覆盖为 text → 鼠标可拖选文本。
 *  - _bindTextSelect：在 document 的 copy 事件 capture 阶段判定，若选区落在当前 grid
 *    宿主内且非空，stopImmediatePropagation 阻止 revo-grid 的 bubble 监听接管，
 *    并把选中子串写进剪贴板 → Ctrl+C 复制的是"选中部分"而非整格值。
 *
 * revo-grid 是 shadow:none（light DOM），.rgCell 可达，cmx shadow 的 CSS 能直接命中；
 * capture 阶段早于 revo-grid @Listen 的 bubble copy 监听，stopImmediatePropagation 生效。
 *
 * Object.assign 到 CmxRevoGrid.prototype 后，this 指向组件实例。
 */

/** 把纯文本转成可安全放进 text/html 的字符串（copy 时用）。 */
function escapeHtmlText (s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export const revoGridTextSelectMixin = {
  /** 按当前 _opts.allowTextSelect 切换 _revo 上的 class（_css() 据此开 user-select）。 */
  _applyAllowTextSelect () {
    if (!this._revo) return
    if (this._opts.allowTextSelect) this._revo.classList.add('cmx-allow-text-select')
    else this._revo.classList.remove('cmx-allow-text-select')
  },

  /**
   * 在 document 上注册 copy capture 监听。幂等（_textSelectBound 去重）。
   * 运行时切 allowTextSelect 无需重绑：handler 内部读 _opts 判定。
   */
  _bindTextSelect () {
    if (this._textSelectBound) return
    this._textSelectBound = true

    this._onCopyForTextSelect = (e) => {
      if (!this._opts.allowTextSelect) return
      const sel = typeof window !== 'undefined' && typeof window.getSelection === 'function'
        ? window.getSelection() : null
      // 没有选区（isCollapsed）→ 让 revo-grid 正常处理（复制焦点单元格整值）
      if (!sel || sel.isCollapsed) return
      const text = sel.toString()
      if (!text) return
      // 限定选区落在当前 grid 宿主内：否则会影响同页其它可复制区域
      const node = sel.anchorNode
      if (!node || typeof this._host.contains !== 'function' || !this._host.contains(node)) return
      // 命中：阻止 revo-grid 的 bubble copy 监听接管，放行原生 copy 写入选中子串
      e.stopImmediatePropagation()
      e.preventDefault()
      try {
        if (e.clipboardData) {
          e.clipboardData.setData('text/plain', text)
          e.clipboardData.setData('text/html', escapeHtmlText(text))
        } else if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          // 降级：clipboardData 不可用时走异步剪贴板 API
          navigator.clipboard.writeText(text)
        }
      } catch (_) { /* 剪贴板写入失败不阻断 */ }
    }

    document.addEventListener('copy', this._onCopyForTextSelect, true)
  },

  /** disconnectedCallback 调用：移除 document copy 监听。 */
  _unbindTextSelect () {
    if (this._onCopyForTextSelect) {
      document.removeEventListener('copy', this._onCopyForTextSelect, true)
      this._onCopyForTextSelect = null
    }
    this._textSelectBound = false
  },
}
