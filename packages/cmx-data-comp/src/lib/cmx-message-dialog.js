import { escHtml as esc } from './cmx-page-helpers.js'

/**
 * cmx-message-dialog — 通用信息提示对话框（信息 / 警告 / 错误 三级）。
 *
 * 设计目标：
 *   - **通用**：不绑定任何业务，任何页面（html-pages / native-pages / 组件内）都可调用。
 *   - **零依赖 / 自包含**：纯 DOM + Shadow DOM 隔离样式，不依赖 UI5 / 外部 CSS，不污染宿主。
 *   - **主题自适应**：跟随门户 UI5 主题（localStorage `__portal_ui5_theme__`）或系统
 *     `prefers-color-scheme`，light / dark 两套配色；主题切换时已开对话框实时跟随。
 *   - **专业**：图标 + 标题 + 正文 + 明细列表 + 页脚按钮；居中、适中尺寸、遮罩、圆角、投影、进入动画。
 *   - **可访问**：`role="alertdialog"`、`aria-*`、焦点锁定、ESC / 点遮罩 / 确定 三种关闭。
 *   - **警告 / 错误**可带「获取帮助」——派发 `cmx-help-request` 事件（门户帮助中心接管），
 *     或回退用 `window.open(helpUrl)` 新标签打开。
 *
 * 用法：
 *   showCmxMessage({ level:'error', title:'保存失败', message:'…',
 *                    details:['• 第 1 行 …','• 第 2 行 …'],
 *                    helpCode:'VALUE_TOO_LONG', helpUrl:'https://…',
 *                    onClose(){} })
 *   → 返回 Promise（点确定 resolve('ok')；点帮助 → 打开帮助内容并关闭对话框，resolve('help')）。
 *     帮助内容（帮助中心/新标签）打开后模态遮罩不应继续挡屏，故点帮助即关——
 *     用户看完帮助直接重操作即可，无需回对话框点确定。
 *
 * 便捷别名：cmxInfo(msg, opts) / cmxWarn(...) / cmxError(...)。
 */

const LEVELS = {
  info: {
    label: '信息',
    accent: 'var(--sapInformationElementColor, #0a6ed1)', accentDark: 'var(--sapInformationElementColor, #4db1ff)',
    // 徽章内白色图形的 SVG path（信息 i）——配合实心 accent 圆形徽章使用
    icon: 'M12 4.4a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm1.9 15.2h-3.8v-2h1.2v-5.2h-1.2v-2h3.8v2h-1.2v5.2h1.2z',
  },
  warning: {
    label: '警告',
    accent: 'var(--sapCriticalElementColor, #e9730c)', accentDark: 'var(--sapCriticalElementColor, #ffab4a)',
    // 圆角感叹号
    icon: 'M12 3.2c1.05 0 1.9.85 1.9 1.9v8.6a1.9 1.9 0 1 1-3.8 0V5.1c0-1.05.85-1.9 1.9-1.9zm0 17.2a2.1 2.1 0 1 1 0-4.2 2.1 2.1 0 0 1 0 4.2z',
  },
  error: {
    label: '错误',
    accent: 'var(--sapNegativeElementColor, #bb0000)', accentDark: 'var(--sapNegativeElementColor, #ff6d6d)',
    // 圆角叉
    icon: 'M6.4 4.98 12 10.58l5.6-5.6 1.42 1.42-5.6 5.6 5.6 5.6-1.42 1.42-5.6-5.6-5.6 5.6-1.42-1.42 5.6-5.6-5.6-5.6z',
  },
}

const THEME_KEY = '__portal_ui5_theme__'

/** 读门户当前 UI5 主题 id：门户写在 sessionStorage（portal-ui5-theme.js），少数场景在 localStorage；两处都查。 */
function readPortalTheme () {
  for (const store of ['sessionStorage', 'localStorage']) {
    try {
      const s = (typeof window !== 'undefined') && window[store]
      const t = s && s.getItem(THEME_KEY)
      if (t) return t
    } catch (e) { /* 存储不可用（隐私模式等）→ 试下一个 */ }
  }
  return ''
}

/** 判断当前是否暗色主题：优先门户 UI5 主题（session/localStorage），回退系统偏好。模块内导出供 cmx-toast 复用（主题判定单一真源）。 */
export function isDarkTheme () {
  const t = readPortalTheme()
  if (t) return /dark|hcb/i.test(t) // sap_horizon_dark / *_hcb（高对比黑）视为暗；亮色/hcw 为亮
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
  } catch (e) { return false }
}

/** 一套主题的配色令牌。 */
function palette (dark) {
  return dark
    ? { bg: 'var(--sapInformationElementColor, #1c2030)', fg: '#e6e9f0', sub: 'var(--sapInformationElementColor, #9aa3b8)', line: 'var(--sapInformationElementColor, #2b3040)', mask: 'rgba(0,0,0,.6)',
        btnBg: 'var(--sapInformationElementColor, #2a3042)', btnFg: '#e6e9f0', btnBorder: 'var(--sapInformationElementColor, #3a4155)',
        detailBg: 'var(--sapInformationElementColor, #12151f)', detailFg: '#c9d4ee' }
    : { bg: 'var(--sapList_Background, #ffffff)', fg: 'var(--sapInformationElementColor, #1a1d27)', sub: 'var(--sapInformationElementColor, #5b6478)', line: '#e4e7ef', mask: 'rgba(0,0,0,.35)',
        btnBg: '#f4f5f9', btnFg: 'var(--sapInformationElementColor, #1a1d27)', btnBorder: '#d0d5e2',
        detailBg: '#f7f8fb', detailFg: 'var(--sapInformationElementColor, #2a2f3a)' }
}

/**
 * 弹出通用信息对话框。
 *
 * @param {object} opts
 * @param {'info'|'warning'|'error'} [opts.level='info']
 * @param {string}  opts.title            标题（缺省用级别名）
 * @param {string}  [opts.message]        正文（支持多行 \n）
 * @param {string[]}[opts.details]        明细列表（每项一行，如各条 violation）
 * @param {string}  [opts.helpCode]       帮助定位码（如错误码）；warning/error 时显示「获取帮助」
 * @param {string}  [opts.helpUrl]        帮助 URL；无门户监听时回退 window.open
 * @param {string}  [opts.okText='确定']  主按钮文案
 * @param {boolean} [opts.allowCopy]      是否显示「复制详情」（error 默认 true）
 * @param {function}[opts.onClose]        关闭回调
 * @returns {Promise<'ok'|'help'>}        关闭方式
 */
export function showCmxMessage (opts) {
  opts = opts || {}
  const level = LEVELS[opts.level] ? opts.level : 'info'
  const L = LEVELS[level]
  const dark = isDarkTheme()
  const P = palette(dark)
  const accent = dark ? L.accentDark : L.accent
  const title = opts.title || L.label
  const details = Array.isArray(opts.details) ? opts.details.filter(Boolean) : []
  const showHelp = (level === 'warning' || level === 'error') && (opts.helpUrl || opts.helpCode)
  const allowCopy = opts.allowCopy != null ? opts.allowCopy : (level === 'error' && details.length > 0)

  return new Promise((resolve) => {
    // 宿主容器（挂到 body，Shadow DOM 隔离样式）
    const host = document.createElement('div')
    host.setAttribute('data-cmx-message-dialog', level)
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483000;'
    const sh = host.attachShadow({ mode: 'open' })

    const messageHtml = esc(opts.message).replace(/\n/g, '<br>')
    const detailItems = details.map((d) => `<li>${esc(d)}</li>`).join('')

    sh.innerHTML = `
      <style>
        :host { all: initial; }
        * { box-sizing: border-box; font-family: -apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif; }
        .mask {
          position: fixed; inset: 0; background: ${P.mask};
          display: flex; align-items: center; justify-content: center;
          animation: fade .15s ease; padding: 24px;
        }
        @keyframes fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes pop { from { opacity: 0; transform: translateY(8px) scale(.98) } to { opacity: 1; transform: none } }
        .dialog {
          width: 440px; max-width: 100%; max-height: calc(100vh - 48px);
          display: flex; flex-direction: column;
          background: ${P.bg}; color: ${P.fg};
          border-radius: 12px; overflow: hidden;
          box-shadow: 0 12px 48px rgba(0,0,0,.28), 0 2px 8px rgba(0,0,0,.16);
          border: 1px solid ${P.line};
          animation: pop .18s cubic-bezier(.2,.8,.2,1);
        }
        .header {
          display: flex; align-items: center; gap: 12px;
          padding: 18px 20px 14px; border-bottom: 1px solid ${P.line};
        }
        .badge {
          flex: none; width: 32px; height: 32px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          background: ${accent};
        }
        .badge svg { width: 15px; height: 15px; fill: var(--sapButton_Emphasized_TextColor, #fff); }
        .title { font-size: 16px; font-weight: 600; line-height: 1.3; margin: 0; flex: 1; word-break: break-word; }
        .body { padding: 16px 20px; overflow-y: auto; }
        .message { font-size: 13.5px; line-height: 1.65; color: ${P.fg}; margin: 0; word-break: break-word; }
        .details {
          margin: 12px 0 0; padding: 10px 12px; list-style: none;
          background: ${P.detailBg}; border: 1px solid ${P.line}; border-radius: 8px;
          font-size: 12.8px; line-height: 1.7; color: ${P.detailFg};
          max-height: 200px; overflow-y: auto;
        }
        .details li { margin: 2px 0; word-break: break-word; }
        .footer {
          display: flex; align-items: center; gap: 10px;
          padding: 12px 20px 16px; border-top: 1px solid ${P.line};
        }
        .spacer { flex: 1; }
        button {
          font-size: 13px; padding: 7px 16px; border-radius: 8px; cursor: pointer;
          border: 1px solid transparent; transition: filter .12s, background .12s;
        }
        button:focus-visible { outline: 2px solid ${accent}; outline-offset: 2px; }
        .btn-secondary { background: ${P.btnBg}; color: ${P.btnFg}; border-color: ${P.btnBorder}; }
        .btn-secondary:hover { filter: brightness(${dark ? 1.15 : .97}); }
        .btn-primary { background: var(--sapButton_Emphasized_Background, #0070f2); color: var(--sapButton_Emphasized_TextColor, #fff); font-weight: 600; }
        .btn-primary:hover { filter: brightness(1.08); }
        .btn-link {
          background: transparent; color: ${accent}; border: none; padding: 7px 8px;
          display: inline-flex; align-items: center; gap: 5px;
        }
        .btn-link:hover { text-decoration: underline; }
        .btn-link svg { width: 14px; height: 14px; fill: ${accent}; }
      </style>
      <div class="mask" part="mask">
        <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="t" aria-describedby="m">
          <div class="header">
            <span class="badge"><svg viewBox="0 0 24 24"><path d="${L.icon}"/></svg></span>
            <h2 class="title" id="t">${esc(title)}</h2>
          </div>
          <div class="body">
            ${messageHtml ? `<p class="message" id="m">${messageHtml}</p>` : ''}
            ${detailItems ? `<ul class="details">${detailItems}</ul>` : ''}
          </div>
          <div class="footer">
            ${showHelp ? `<button class="btn-link" data-act="help"><svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-2h2v2zm1.1-6.3-.9.92C12.4 12.35 12 13 12 14h-2v-.5c0-1 .4-1.65 1.2-2.4l1.24-1.26A1.5 1.5 0 1 0 9.9 8.7L8 8.36A3.5 3.5 0 1 1 14.1 10.7z"/></svg>获取帮助</button>` : ''}
            <span class="spacer"></span>
            ${allowCopy ? '<button class="btn-secondary" data-act="copy">复制详情</button>' : ''}
            <button class="btn-primary" data-act="ok">${esc(opts.okText || '确定')}</button>
          </div>
        </div>
      </div>
    `

    const mask = sh.querySelector('.mask')
    const dialog = sh.querySelector('.dialog')
    const prevActive = document.activeElement

    // 主题实时跟随：门户切主题写 sessionStorage 并派发 `cmx-portal-theme-change`（同标签页 storage 事件不触发）；
    // 另跨标签页改 localStorage 会来 storage 事件。任一信号触发：若明暗变了就关掉按新主题重开（保留内容）。
    function onThemeChange () {
      if (isDarkTheme() !== dark) { close('__rethemed__'); showCmxMessage(opts).then(resolve) }
    }

    function close (how) {
      document.removeEventListener('keydown', onKey, true)
      try { window.removeEventListener('storage', onThemeChange) } catch (e) {}
      try { window.removeEventListener('cmx-portal-theme-change', onThemeChange) } catch (e) {}
      try { host.remove() } catch (e) {}
      try { if (prevActive && prevActive.focus) prevActive.focus() } catch (e) {}
      // 重开导致的关闭不触发业务 onClose（避免误报）
      if (how !== '__rethemed__' && typeof opts.onClose === 'function') { try { opts.onClose(how) } catch (e) {} }
    }

    function doHelp () {
      // 优先派发门户事件（帮助中心接管）；无人处理再回退开 URL。
      let handled = false
      try {
        const ev = new CustomEvent('cmx-help-request', {
          bubbles: true, composed: true, cancelable: true,
          detail: { code: opts.helpCode || null, level, title, url: opts.helpUrl || null },
        })
        handled = (window.dispatchEvent(ev) === false) || ev.defaultPrevented
      } catch (e) {}
      if (!handled && opts.helpUrl) {
        try { window.open(opts.helpUrl, '_blank', 'noopener') } catch (e) {}
      }
      // 关闭由外层点击处理统一执行（点「获取帮助」即关，帮助内容已另行打开）。
    }

    function doCopy (btn) {
      const text = [title, opts.message || '', ...details].filter(Boolean).join('\n')
      const done = () => { if (btn) { const o = btn.textContent; btn.textContent = '已复制'; setTimeout(() => { btn.textContent = o }, 1200) } }
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(done, () => {}); return }
      } catch (e) {}
      try {
        const ta = document.createElement('textarea'); ta.value = text
        ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta)
        ta.select(); document.execCommand('copy'); ta.remove(); done()
      } catch (e) {}
    }

    sh.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')
      if (act) {
        const a = act.getAttribute('data-act')
        if (a === 'ok') { close('ok'); resolve('ok') }
        else if (a === 'help') {
          doHelp()
          close('help') // 帮助内容已打开，关闭模态对话框不再挡屏
          resolve('help')
        }
        else if (a === 'copy') doCopy(act)
      } else if (e.target === mask) {
        close('ok'); resolve('ok') // 点遮罩关闭
      }
    })

    function onKey (e) {
      if (e.key === 'Escape') { e.stopPropagation(); close('ok'); resolve('ok') }
      else if (e.key === 'Tab') {
        const f = sh.querySelectorAll('button')
        if (!f.length) return
        const first = f[0], last = f[f.length - 1]
        if (e.shiftKey && sh.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && sh.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey, true)
    try { window.addEventListener('storage', onThemeChange) } catch (e) {}
    try { window.addEventListener('cmx-portal-theme-change', onThemeChange) } catch (e) {}

    document.body.appendChild(host)
    const okBtn = sh.querySelector('.btn-primary')
    if (okBtn) setTimeout(() => { try { okBtn.focus() } catch (e) {} }, 0)
  })
}

/** 便捷别名。 */
export function cmxInfo (message, opts) { return showCmxMessage({ ...(opts || {}), level: 'info', message }) }
export function cmxWarn (message, opts) { return showCmxMessage({ ...(opts || {}), level: 'warning', message }) }
export function cmxError (message, opts) { return showCmxMessage({ ...(opts || {}), level: 'error', message }) }

/**
 * 弹出确认对话框（确定 / 取消 二选一），返回 Promise<boolean>。
 *
 * 与 showCmxMessage 的区别（故独立实现，不扩展 showCmxMessage）：
 *   - 返回 boolean（true=确定，false=取消）而非关闭方式字符串；
 *   - ESC / 点遮罩 = 取消（决策型语义），而非 showCmxMessage 的「确定」；
 *   - footer 是「取消 + 确定」二元按钮，确定按钮可按 intent 显示危险红。
 *
 * 复用 showCmxMessage 的基础设施：LEVELS 配色 / palette / isDarkTheme / 主题实时跟随。
 *
 * @param {object} opts
 * @param {string}  [opts.title='确认']     标题
 * @param {string}  opts.message            正文（支持多行 \n）
 * @param {string}  [opts.confirmText='确定'] 主按钮文案
 * @param {string}  [opts.cancelText='取消']  取消按钮文案
 * @param {'danger'|'normal'} [opts.intent='normal'] danger 时主按钮红色（删除/作废等危险操作）
 * @param {string}  [opts.icon]             图标 path（SVG path d 值）；默认按 intent 选
 * @returns {Promise<boolean>} true=确定，false=取消
 */
export function cmxConfirm (opts) {
  opts = opts || {}
  const intent = opts.intent === 'danger' ? 'danger' : 'normal'
  const dark = isDarkTheme()
  const P = palette(dark)
  // danger 用红色调，normal 用信息蓝调（复用 LEVELS.info 配色）
  const accent = intent === 'danger'
    ? (dark ? 'var(--sapNegativeElementColor, #ff6d6d)' : 'var(--sapNegativeElementColor, #bb0000)')
    : (dark ? LEVELS.info.accentDark : LEVELS.info.accent)
  const icon = opts.icon || (intent === 'danger'
    ? LEVELS.error.icon   // 圆形叉
    : LEVELS.info.icon)   // 信息 i
  const title = opts.title || '确认'
  const confirmText = opts.confirmText || (intent === 'danger' ? '删除' : '确定')
  const cancelText = opts.cancelText || '取消'

  return new Promise((resolve) => {
    const host = document.createElement('div')
    host.setAttribute('data-cmx-confirm-dialog', intent)
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483000;'
    const sh = host.attachShadow({ mode: 'open' })

    const messageHtml = esc(opts.message).replace(/\n/g, '<br>')

    sh.innerHTML = `
      <style>
        :host { all: initial; }
        * { box-sizing: border-box; font-family: -apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif; }
        .mask {
          position: fixed; inset: 0; background: ${P.mask};
          display: flex; align-items: center; justify-content: center;
          animation: fade .15s ease; padding: 24px;
        }
        @keyframes fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes pop { from { opacity: 0; transform: translateY(8px) scale(.98) } to { opacity: 1; transform: none } }
        .dialog {
          width: 420px; max-width: 100%; max-height: calc(100vh - 48px);
          display: flex; flex-direction: column;
          background: ${P.bg}; color: ${P.fg};
          border-radius: 12px; overflow: hidden;
          box-shadow: 0 12px 48px rgba(0,0,0,.28), 0 2px 8px rgba(0,0,0,.16);
          border: 1px solid ${P.line};
          animation: pop .18s cubic-bezier(.2,.8,.2,1);
        }
        .header { display: flex; align-items: center; gap: 12px; padding: 18px 20px 14px; border-bottom: 1px solid ${P.line}; }
        .badge { flex: none; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: ${accent}; }
        .badge svg { width: 15px; height: 15px; fill: var(--sapButton_Emphasized_TextColor, #fff); }
        .title { font-size: 16px; font-weight: 600; line-height: 1.3; margin: 0; flex: 1; word-break: break-word; }
        .body { padding: 16px 20px; }
        .message { font-size: 13.5px; line-height: 1.65; color: ${P.fg}; margin: 0; word-break: break-word; }
        .footer { display: flex; align-items: center; gap: 10px; padding: 12px 20px 16px; border-top: 1px solid ${P.line}; }
        .spacer { flex: 1; }
        button { font-size: 13px; padding: 7px 16px; border-radius: 8px; cursor: pointer; border: 1px solid transparent; transition: filter .12s, background .12s; }
        button:focus-visible { outline: 2px solid ${accent}; outline-offset: 2px; }
        .btn-secondary { background: ${P.btnBg}; color: ${P.btnFg}; border-color: ${P.btnBorder}; }
        .btn-secondary:hover { filter: brightness(${dark ? 1.15 : .97}); }
        .btn-primary { background: var(--sapButton_Emphasized_Background, #0070f2); color: var(--sapButton_Emphasized_TextColor, #fff); font-weight: 600; }
        .btn-primary:hover { filter: brightness(1.08); }
      </style>
      <div class="mask" part="mask">
        <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="t" aria-describedby="m">
          <div class="header">
            <span class="badge"><svg viewBox="0 0 24 24"><path d="${icon}"/></svg></span>
            <h2 class="title" id="t">${esc(title)}</h2>
          </div>
          <div class="body">
            ${messageHtml ? `<p class="message" id="m">${messageHtml}</p>` : ''}
          </div>
          <div class="footer">
            <span class="spacer"></span>
            <button class="btn-secondary" data-act="cancel">${esc(cancelText)}</button>
            <button class="btn-primary" data-act="ok">${esc(confirmText)}</button>
          </div>
        </div>
      </div>
    `

    const mask = sh.querySelector('.mask')
    const prevActive = document.activeElement

    function onThemeChange () {
      if (isDarkTheme() !== dark) { close('__rethemed__'); cmxConfirm(opts).then(resolve) }
    }

    function close (how) {
      document.removeEventListener('keydown', onKey, true)
      try { window.removeEventListener('storage', onThemeChange) } catch (e) {}
      try { window.removeEventListener('cmx-portal-theme-change', onThemeChange) } catch (e) {}
      try { host.remove() } catch (e) {}
      try { if (prevActive && prevActive.focus) prevActive.focus() } catch (e) {}
    }

    sh.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')
      if (act) {
        const a = act.getAttribute('data-act')
        if (a === 'ok') { close('ok'); resolve(true) }
        else if (a === 'cancel') { close('cancel'); resolve(false) }
      } else if (e.target === mask) {
        close('cancel'); resolve(false) // 点遮罩 = 取消
      }
    })

    function onKey (e) {
      if (e.key === 'Escape') { e.stopPropagation(); close('cancel'); resolve(false) } // ESC = 取消
      else if (e.key === 'Tab') {
        const f = sh.querySelectorAll('button')
        if (!f.length) return
        const first = f[0], last = f[f.length - 1]
        if (e.shiftKey && sh.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && sh.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey, true)
    try { window.addEventListener('storage', onThemeChange) } catch (e) {}
    try { window.addEventListener('cmx-portal-theme-change', onThemeChange) } catch (e) {}

    document.body.appendChild(host)
    const okBtn = sh.querySelector('.btn-primary')
    if (okBtn) setTimeout(() => { try { okBtn.focus() } catch (e) {} }, 0)
  })
}
