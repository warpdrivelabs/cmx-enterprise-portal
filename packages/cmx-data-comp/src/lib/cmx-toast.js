/**
 * cmx-toast — 轻量非模态提示（右上角、自动消失、可叠放）。
 *
 * 与 cmx-message-dialog 的分工：
 *   - showCmxMessage / cmxError —— **模态**对话框：需要用户确认、或错误信息量大
 *     （violations 明细 / 冲突处理）时用；保存失败、装载失败（presentDocError）走这条路。
 *   - showCmxToast —— **非模态**轻提示：不打断操作，适合元数据加载失败兜底、全局
 *     unhandledrejection 兜底、后台动作结果反馈等"告知即可"的场景。
 *
 * 特性：
 *   - 右上角竖排叠放，最多同时 5 条（超出挤掉最老的）；
 *   - 自动消失（info 3.5s / warning 5s / error 6s，可 duration 覆盖），鼠标悬停暂停计时；
 *   - 同 level+文案 短窗内去重：重复触发只刷新已有条目的停留时间，不叠加新条目；
 *   - 点击条目立即关闭；`role="status"`（error 用 `role="alert"`）；
 *   - 主题自适应（复用 cmx-message-dialog 的门户主题判定）；toast 生命期短，已显示
 *     条目不随主题切换重绘（这点与对话框不同）。
 *
 * 用法：
 *   import { showCmxToast, showCmxError } from 'cmx-data-comp'
 *   showCmxToast('字典翻译部分失败，已按编码显示', { level: 'warning' })
 *   showCmxError('列表装载失败', err)                 // catch 样板一行：warn + 提取 message + toast
 *   // 宿主兜底：installGlobalErrorToast() / showCmxFatalScreen(title, err)
 */

import { isDarkTheme } from './cmx-message-dialog.js'
import { escHtml as esc } from './cmx-page-helpers.js'

const LEVELS = {
  info:    { accent: 'var(--sapInformationElementColor, #0a6ed1)', accentDark: 'var(--sapInformationElementColor, #4db1ff)' },
  success: { accent: 'var(--sapPositiveElementColor, #107e3e)', accentDark: 'var(--sapPositiveElementColor, #36a41a)' },
  warning: { accent: 'var(--sapCriticalElementColor, #e9730c)', accentDark: 'var(--sapCriticalElementColor, #ffab4a)' },
  error:   { accent: 'var(--sapNegativeElementColor, #bb0000)', accentDark: 'var(--sapNegativeElementColor, #ff6d6d)' },
}

const MAX_VISIBLE = 5
/** 同文案去重表：key → { el, timer }。 */
const ACTIVE = new Map()

/** 取/建全局 toast 容器（单例，Shadow DOM 隔离样式）。 */
function ensureRoot () {
  let host = document.querySelector('body > [data-cmx-toast-root]')
  if (!host) {
    host = document.createElement('div')
    host.setAttribute('data-cmx-toast-root', '')
    host.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483200;pointer-events:none;'
    const sh = host.attachShadow({ mode: 'open' })
    sh.innerHTML = `
      <style>
        :host { all: initial; }
        .stack {
          position: fixed; top: 16px; right: 16px;
          display: flex; flex-direction: column; gap: 8px; max-width: min(420px, calc(100vw - 32px));
        }
        .toast {
          pointer-events: auto; cursor: pointer;
          display: flex; align-items: stretch; overflow: hidden;
          border-radius: 10px; border: 1px solid var(--line);
          background: var(--bg); color: var(--fg);
          box-shadow: 0 6px 24px rgba(0,0,0,.22), 0 2px 6px rgba(0,0,0,.14);
          animation: cmx-toast-in .18s cubic-bezier(.2,.8,.2,1);
          transition: opacity .2s ease, transform .2s ease;
        }
        .toast.out { opacity: 0; transform: translateX(12px); }
        @keyframes cmx-toast-in { from { opacity: 0; transform: translateY(-6px) } to { opacity: 1; transform: none } }
        .bar { flex: none; width: 4px; background: var(--accent); }
        .text {
          padding: 9px 14px 9px 12px; font-size: 13px; line-height: 1.55;
          font-family: -apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;
          word-break: break-word; min-width: 0;
        }
        .title { display: block; font-weight: 600; margin-bottom: 2px; }
        .msg:empty { display: none; }
      </style>
      <div class="stack" role="log" aria-live="polite"></div>
    `
    document.body.appendChild(host)
  }
  return host.shadowRoot.querySelector('.stack')
}

/** 淡出并移除一条。 */
function dismiss (key) {
  const rec = ACTIVE.get(key)
  if (!rec) return
  ACTIVE.delete(key)
  clearTimeout(rec.timer)
  const el = rec.el
  el.classList.add('out')
  setTimeout(() => { try { el.remove() } catch (_) {} }, 220)
}

/**
 * 弹出一条轻量提示。
 *
 * @param {string|Error} message              文案（Error 自动取 message）
 * @param {object} [opts]
 * @param {'info'|'success'|'warning'|'error'} [opts.level='info']
 * @param {string}  [opts.title]              加粗小标题（可选）
 * @param {number}  [opts.duration]           停留毫秒数（缺省按级别）
 * @returns {boolean}                         是否真正展示了（重复文案只刷新计时，返回 true）
 */
export function showCmxToast (message, opts) {
  if (typeof document === 'undefined' || !document.body) return false
  opts = opts || {}
  const level = LEVELS[opts.level] ? opts.level : 'info'
  const L = LEVELS[level]
  const text = message instanceof Error ? (message.message || String(message)) : String(message == null ? '' : message)
  const title = opts.title != null ? String(opts.title) : ''
  const duration = opts.duration != null ? Number(opts.duration) || 3000
    : (level === 'error' ? 6000 : level === 'warning' ? 5000 : 3500)
  const key = level + '|' + title + '|' + text

  // 同文案去重：已有同 key 条目 → 只刷新停留时间
  const existed = ACTIVE.get(key)
  if (existed) {
    clearTimeout(existed.timer)
    existed.timer = setTimeout(() => dismiss(key), duration)
    return true
  }

  const stack = ensureRoot()
  // 限叠：超出 MAX_VISIBLE 挤掉最老的一条
  while (ACTIVE.size >= MAX_VISIBLE) {
    const oldest = ACTIVE.keys().next().value
    dismiss(oldest)
  }

  const dark = isDarkTheme()
  const el = document.createElement('div')
  el.className = 'toast'
  el.setAttribute('data-level', level)
  el.setAttribute('role', level === 'error' ? 'alert' : 'status')
  el.style.setProperty('--accent', dark ? L.accentDark : L.accent)
  el.style.setProperty('--bg', dark ? 'var(--sapInformationElementColor, #1c2030)' : 'var(--sapList_Background, #ffffff)')
  el.style.setProperty('--fg', dark ? '#e6e9f0' : 'var(--sapInformationElementColor, #1a1d27)')
  el.style.setProperty('--line', dark ? 'var(--sapInformationElementColor, #2b3040)' : '#e4e7ef')

  const textDiv = document.createElement('div')
  textDiv.className = 'text'
  textDiv.innerHTML = (title ? `<span class="title">${esc(title)}</span>` : '') +
    `<span class="msg">${esc(text).replace(/\n/g, '<br>')}</span>`
  const bar = document.createElement('span')
  bar.className = 'bar'
  el.appendChild(bar)
  el.appendChild(textDiv)

  el.addEventListener('click', () => dismiss(key))
  // 悬停暂停计时 / 移开恢复
  el.addEventListener('mouseenter', () => {
    const rec = ACTIVE.get(key)
    if (rec) clearTimeout(rec.timer)
  })
  el.addEventListener('mouseleave', () => {
    const rec = ACTIVE.get(key)
    if (rec) { clearTimeout(rec.timer); rec.timer = setTimeout(() => dismiss(key), duration) }
  })

  stack.appendChild(el)
  ACTIVE.set(key, { el, timer: setTimeout(() => dismiss(key), duration) })
  return true
}

/**
 * 统一错误 toast：提取 err.message + console.warn + error 级提示，三行 catch 样板合一。
 * 页面/宿主代码的 catch 里一行 `showCmxError('xx失败', err)` 即完成「日志 + 用户可见」。
 * @param {string} title   提示小标题（如「骨架加载」「页面加载」）
 * @param {Error|any} err  错误对象（Error 取 message，其它 String 化）
 * @param {object} [opts]  透传 showCmxToast 的选项（level/duration 覆盖）
 */
export function showCmxError (title, err, opts) {
  const msg = (err instanceof Error ? err.message : (err && err.message)) || String(err ?? '')
  console.warn(`[cmx] ${title}:`, err)
  showCmxToast(msg || '未知错误', { level: 'error', title, ...(opts || {}) })
}

/**
 * 全局错误兜底：unhandledrejection / window error → 轻量 toast。
 * 消灭散落各处 `.then()` 无 catch 的静默失败（此前只进 DevTools / 日志面板）。
 *
 * 去噪：已弹过对话框的错误（err.__presented）跳过；请求取消（AbortError）静默；
 * 资源加载错误（无 message 的 Event）不弹。Portal / Designer 的 main.js 各装一次。
 */
export function installGlobalErrorToast () {
  if (typeof window === 'undefined' || window.__cmxGlobalErrorToastPatched) return
  window.__cmxGlobalErrorToastPatched = true

  window.addEventListener('unhandledrejection', (ev) => {
    const err = ev && ev.reason
    if (err && err.__presented) return
    if (err && (err.name === 'AbortError' || err.code === 20 || err.code === 'ABORT_ERR')) return
    showCmxError('请求处理失败', err)
  })

  window.addEventListener('error', (ev) => {
    // ErrorEvent 才是脚本运行错误；资源加载失败是普通 Event（无 message），不弹
    if (!ev || !ev.message) return
    showCmxError('脚本运行错误', ev.error || ev.message)
  })
}

/**
 * 应用启动失败全屏占位：错误信息 + 重新加载按钮（替代只 console.error 的白屏）。
 * Portal / Designer 的 bootstrap catch 里一行调用。
 * @param {string} title 如「门户启动失败」/「设计器启动失败」
 * @param {Error|any} err
 */
export function showCmxFatalScreen (title, err) {
  if (typeof document === 'undefined') return
  const msg = (err instanceof Error ? err.message : (err && err.message)) || String(err ?? '')
  document.body.replaceChildren()
  const el = document.createElement('div')
  el.setAttribute('data-cmx-fatal-screen', '')
  el.style.cssText = [
    'position:fixed', 'inset:0', 'display:flex', 'align-items:center', 'justify-content:center',
    'background:#f4f5f9', 'font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',\'PingFang SC\',\'Microsoft YaHei\',sans-serif',
  ].join(';')
  const card = document.createElement('div')
  card.style.cssText = 'max-width:520px;padding:28px 32px;background:var(--sapList_Background, #ffffff);border:1px solid #e0e4ee;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.08);text-align:center;'
  const h2 = document.createElement('h2')
  h2.textContent = title
  h2.style.cssText = 'margin:0 0 12px;font-size:18px;color:var(--sapLinkColor, #1a1d27);'
  const detail = document.createElement('pre')
  detail.textContent = msg
  detail.style.cssText = 'margin:0 0 20px;padding:12px;background:#f7f8fb;border:1px solid #e4e7ef;border-radius:8px;color:var(--sapNegativeElementColor, #bb0000);font-size:12.5px;line-height:1.6;white-space:pre-wrap;word-break:break-word;text-align:left;max-height:40vh;overflow:auto;'
  const retry = document.createElement('button')
  retry.textContent = '重新加载'
  retry.style.cssText = 'padding:8px 28px;border:none;border-radius:8px;background:var(--sapInformationElementColor, #0a6ed1);color:var(--sapGroup_ContentBorderColor, #ffffff);font-size:14px;cursor:pointer;'
  retry.addEventListener('click', () => window.location.reload())
  card.appendChild(h2)
  card.appendChild(detail)
  card.appendChild(retry)
  el.appendChild(card)
  document.body.appendChild(el)
}
