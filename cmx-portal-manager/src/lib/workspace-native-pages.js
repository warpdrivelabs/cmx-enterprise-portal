/**
 * Native Pages runtime.
 *
 * 与 html_pages 分离：`native_pages` 视图只渲染一个宿主元素，宿主元素自行从后端
 * `/api/native-pages/:id` 动态加载 JS / HTML 源文件并挂载。
 */
import { escAttr, escHtml } from './escape.js'
import { deletePage, getPage, putPage, requestPersistentStorage } from './page-cache.js'
import { registerWorkspaceViewType } from './workspace-view-renderer.js'
import { getScope, scopeIdFromDom } from './mainapp.js'

// 启动即请求持久化存储（best-effort，防浏览器低压淘汰页面缓存）。
if (typeof navigator !== 'undefined') {
  requestPersistentStorage().catch(() => {})
}

/** @type {Map<string, Promise<Record<string, unknown>>>} */
const _pageDefCache = new Map()
/**
 * JS 模块按 workspace scope 缓存：WeakMap<scope, Map<pageId, Promise<page>>>。
 * - 同一 workspace 的 explorer/content/property 多区域宿主共用一份模块实例，
 *   保留 native 页通过模块级 state 做跨区域联动的既有契约（如 flow todo-center）。
 * - 不同 workspace（如并列 tab 双开 cr-form）各有 scope，模块级 state 天然隔离。
 * - 无 scope 的独立宿主退化为每次 import，避免跨宿主串状态。
 */
const _scopeModuleCache = new WeakMap()

let _registered = false

export function registerNativePagesWorkspaceViewType () {
  defineNativePagesHost()
  if (_registered) return
  _registered = true
  registerWorkspaceViewType('native_pages', renderNativePagesWorkspaceView)
}

/** 值转字符串并 trim；null/undefined → ''（spec 字段读取口径，trim 后为空由调用方判真值）。 */
function nonEmptyTrimmed (v) {
  if (v == null) return ''
  return String(v).trim()
}

/**
 * @param {import('./workspace-view-config.js').WorkspaceViewSpec} spec
 */
function nativePageIdFromSpec (spec) {
  const o = spec && typeof spec === 'object' ? /** @type {Record<string, unknown>} */ (spec) : {}
  const direct = nonEmptyTrimmed(o.native_page) || nonEmptyTrimmed(o.nativePageId)
  if (direct) return direct
  const d = o.data && typeof o.data === 'object' ? /** @type {Record<string, unknown>} */ (o.data) : null
  return nonEmptyTrimmed(d?.native_page) || nonEmptyTrimmed(d?.nativePageId)
}

/**
 * @param {string} region
 * @param {import('./workspace-view-config.js').WorkspaceViewSpec} spec
 */
function renderNativePagesWorkspaceView (region, spec) {
  const o = spec && typeof spec === 'object' ? /** @type {Record<string, unknown>} */ (spec) : {}
  const pageId = nativePageIdFromSpec(spec)
  const view = String(o.view ?? o.nativeView ?? '').trim()
  const props = o.props && typeof o.props === 'object' ? o.props : {}
  const native = o.native && typeof o.native === 'object' ? o.native : {}
  const propsJson = JSON.stringify(props)
  const nativeJson = JSON.stringify(native)

  return `<cmx-native-pages-host
    native-page="${escAttr(pageId)}"
    view="${escAttr(view)}"
    region="${escAttr(region)}"
    props="${escAttr(propsJson)}"
    native="${escAttr(nativeJson)}"
    style="display:flex;flex:1 1 auto;align-self:stretch;width:100%;height:100%;min-width:0;min-height:0;position:relative"
  ></cmx-native-pages-host>`
}

function defineNativePagesHost () {
  if (customElements.get('cmx-native-pages-host')) return

  class CmxNativePagesHost extends HTMLElement {
    constructor () {
      super()
      // 自己的 CE + shadowRoot：每个 native 页是独立 CE 实例，shadowRoot 天然隔离 DOM id 与 CSS，
      // 从根上避免多区域/多页之间的命名冲突（与 html_pages 的 CE 编译无关，不用 __designer_meta__）。
      this.attachShadow({ mode: 'open' })
      this._seq = 0
      // position:relative：宿主自建定位上下文，错误空态 .np-err（absolute inset:0）不得外溢到 tab 条等祖先容器
      this.style.cssText = 'display:flex;flex:1 1 auto;align-self:stretch;width:100%;height:100%;min-width:0;min-height:0;box-sizing:border-box;position:relative'
    }

    static get observedAttributes () {
      return ['native-page', 'view', 'props', 'native', 'region']
    }

    connectedCallback () {
      this._load()
    }

    disconnectedCallback () {
      // 自 DOM 移除：bump _seq 使任何 in-flight _load 在其 await 点之后失效，
      // 防止 detached 实例继续执行页面脚本（如发业务接口、写 DOM）。
      this._seq++
      this._clearLoadingHint()
      // 页面脚本可挂 host.onDispose 做清理（如解绑 workspace.context 订阅），从 DOM 移除时调用
      if (typeof this.onDispose === 'function') {
        try { this.onDispose() } catch (err) { console.warn('[native_pages] onDispose 异常:', err) }
        this.onDispose = null
      }
    }

    attributeChangedCallback () {
      if (this.isConnected) this._load()
    }

    /**
     * 强制重载：可选绕过 `loadNativePageDef` 的 in-memory 缓存，
     * 重新向 `/api/native-pages/:id` 拉取最新 source 并重新执行渲染 / 脚本。
     * 用于顶部 tab-bar「刷新」按钮触发，确保拿到 server 最新版本。
     * @param {{ bustCache?: boolean, cacheOnly?: boolean }} [options]
     *   `cacheOnly: true` 时仅清缓存（bustCache）不触发 `_load`——供「刷新路径会整体重建 CE」
     *   的场景使用：新实例的 connectedCallback 会单次 _load，此处再 _load 会造成页面脚本
     *   （业务接口）被执行两次。
     */
    async _reload (options = {}) {
      const bustCache = !!(options && options.bustCache)
      if (bustCache) {
        const pid = trimmedAttr(this, 'native-page')
        if (pid) {
          _pageDefCache.delete(pid)
          clearScopeNativePageModule(this.workspace, pid)
          // 源码级缓存由 _pageDefCache/deletePage 覆盖
          // 同步清 IndexedDB 持久缓存，使下次加载强制走网络拿最新版本
          deletePage(pid).catch(() => {})
        }
      }
      // 仅清缓存不重载：刷新路径随后会重建 CE，把加载交给新实例的 connectedCallback，
      // 避免旧实例 _load 与新实例 connectedCallback 各执行一次导致业务接口双调。
      if (options && options.cacheOnly) return
      await this._load()
    }

    /** 当前所属 workspace scope（scope.context 是各区域 native CE 共享的中间对象，用于跨区域交互）。 */
    get workspace () {
      const scopeId = scopeIdFromDom(this)
      return scopeId ? getScope(scopeId) : null
    }

    async _load () {
      const seq = ++this._seq
      const pageId = trimmedAttr(this, 'native-page')
      const view = trimmedAttr(this, 'view')
      const region = trimmedAttr(this, 'region')
      const props = parseJsonAttr(this.getAttribute('props'))
      const native = parseJsonAttr(this.getAttribute('native'))
      if (!pageId) {
        this._renderMessage('native_pages 需提供 native_page 或 nativePageId。', true)
        return
      }
      // 加载占位延迟上屏（_armLoadingHint）：缓存命中等快路径完全不闪占位，慢路径才出现居中转圈
      this._armLoadingHint(pageId, seq)
      try {
        // 页面定义源码全局缓存；JS module 按 workspace scope materialize，
        // 兼顾多区域视图共享 state 与并列 workspace 之间的状态隔离。
        const pageDef = await loadNativePageDef(pageId)
        if (seq !== this._seq) return
        const page = await materializeNativePage(pageDef, this.workspace)
        if (seq !== this._seq) return
        const html = await renderNativePage(page, { pageId, view, region, props, native, host: this })
        if (seq !== this._seq) return
        /* 两条路径（native 页 = 手写/大模型生成的普通 HTML，<script> 原样保留、可手工编辑）：
           1) 完整文档(<!doctype>/<html>) → iframe 承载，脚本/样式隔离运行。
           2) 片段（含 JS 模块页 render 返回的串）→ 挂进本 CE 的 shadowRoot（DOM/CSS 隔离），
              其中 <script> 由本组件包函数作用域执行（普通脚本，非 __designer_meta__/pageFns 模式）。 */
        if (page?.sourceType === 'html' && isFullHtmlDocument(html)) {
          this._renderIframe(html)
        } else {
          this._renderHtml(html)
        }
      } catch (err) {
        if (seq !== this._seq) return
        const msg = err instanceof Error ? err.message : String(err)
        this._renderErrorState(msg, pageId)
      }
    }

    /** 片段 HTML → 挂进 shadowRoot 的 .native-page-root；其中 <script>（任意深度）由 _runScripts 执行。 */
    _renderHtml (html) {
      this._clearLoadingHint()
      // eslint-disable-next-line no-restricted-syntax -- native-page 宿主渲染机制：静态字面量模板（无动态插值）
      this.shadowRoot.innerHTML = '<div class="native-page-root" style="display:flex;flex-direction:column;flex:1 1 auto;align-self:stretch;width:100%;height:100%;min-width:0;min-height:0;overflow:auto;box-sizing:border-box;color:var(--sapTextColor,inherit);background:var(--sapBackgroundColor,transparent)"></div>'
      const root = this.shadowRoot.querySelector('.native-page-root')
      // 渲染根：脚本用 host.renderRoot.querySelector(...) 查本页 DOM（shadow 内，id 不与他页冲突）
      this.renderRoot = root
      // 整段片段先挂入（innerHTML 不会执行其中 <script>，仅静态 DOM 生效）
      const tpl = document.createElement('template')
      // eslint-disable-next-line no-restricted-syntax -- native-page 宿主机制：挂入仓内页面资产 HTML（<script> 随后摘除，不由此执行）
      tpl.innerHTML = String(html ?? '')
      root.appendChild(tpl.content)
      // 再收集片段内所有 <script>（任意嵌套层级），从 DOM 摘下后由 _runScripts 执行
      // （querySelectorAll 返回静态 NodeList，可边遍历边摘除）
      const scripts = root.querySelectorAll('script')
      for (const s of scripts) s.remove()
      this._runScripts(scripts)
    }

    /** 顺序执行片段里的 <script>。
     *  - 内联普通脚本（主路径）：包进函数作用域执行 `function(workspace, host, ctx){ ...原脚本... }`，
     *    顶层 var/function 不泄漏全局、多个 native 页互不冲突；workspace/host 常驻闭包，异步回调里仍可用。
     *    脚本查本页 DOM 用 host.renderRoot.querySelector(...)（在本 CE 的 shadowRoot 内，id 隔离）。
     *  - type=module / 外链 src：shadowRoot 内的 <script> 不执行，故挂到 document.head 执行；
     *    通过 globalThis.__cmxNativeHost 取当前 host（仅同步执行窗口有效）。 */
    _runScripts (scripts) {
      if (!scripts.length) return
      const ws = this.workspace
      const host = this
      // 同步循环内属性不可变，pageId 只读一次（dataset / sourceURL / 报错文案三处共用）
      const pageId = this.getAttribute('native-page') || ''
      const g = typeof globalThis !== 'undefined' ? globalThis : undefined
      for (const old of scripts) {
        const type = trimmedAttr(old, 'type').toLowerCase()
        const isModule = type === 'module'
        const isPlain = !type || type === 'text/javascript' || type === 'application/javascript'
        if (old.src || isModule || !isPlain) {
          // module / 外链 / 其它类型：挂 document.head 才会执行；用全局桥提供 host
          const hadHost = g && Object.prototype.hasOwnProperty.call(g, '__cmxNativeHost')
          const prevHost = hadHost ? g.__cmxNativeHost : undefined
          if (g) g.__cmxNativeHost = host
          try {
            const s = document.createElement('script')
            if (type) s.type = old.getAttribute('type')
            for (const { name, value } of Array.from(old.attributes)) {
              if (name === 'type') continue
              s.setAttribute(name, value)
            }
            if (old.src) s.src = old.src; else s.textContent = old.textContent || ''
            s.dataset.cmxNativeScript = pageId || '1'
            document.head.appendChild(s)
            if (!old.src) s.remove() // 内联已同步执行完，立即摘除保持 head 干净（外链留着等加载）
          } finally {
            if (g) { if (hadHost) g.__cmxNativeHost = prevHost; else Reflect.deleteProperty(g, '__cmxNativeHost') }
          }
          continue
        }
        // 内联普通脚本：包函数作用域，注入 workspace/host/ctx，隔离全局、闭包常驻
        const code = old.textContent || ''
        try {
          // eslint-disable-next-line no-restricted-syntax -- native-page 内联脚本编译既定机制（输入为仓内页面资产）
          const fn = new Function('workspace', 'host', 'ctx', `'use strict';\n${code}\n//# sourceURL=native-page/${pageId || 'page'}.js`)
          fn.call(host, ws, host, { workspace: ws, host, region: host.getAttribute('region') || '' })
        } catch (err) {
          console.error('[native_pages] 内联脚本执行失败:', err)
          // 脚本执行异常此前只进 console → 用户看到半渲染/空白页面无从得知原因。
          // 以红字占位替代（半渲染 UI 通常已不可用），提示页面 id 与错误信息。
          this._renderMessage(`原生页面${pageId ? `「${pageId}」` : ''}脚本执行失败：${err instanceof Error ? err.message : String(err)}`, true)
          return // 后续脚本依赖已中断的上下文，不再继续执行
        }
      }
    }

    /** 整页 HTML 文档：用 iframe srcdoc 承载，脚本/样式在独立文档内运行，与门户隔离。 */
    _renderIframe (html) {
      this._clearLoadingHint()
      // eslint-disable-next-line no-restricted-syntax -- iframe 承载整页 HTML：静态字面量模板，内容走 sandbox 隔离的 srcdoc
      this.shadowRoot.innerHTML = `<iframe class="native-page-frame" sandbox="allow-scripts allow-forms allow-popups allow-modals allow-same-origin" referrerpolicy="no-referrer" style="flex:1 1 auto;align-self:stretch;width:100%;height:100%;min-width:0;min-height:0;border:0;display:block;background:var(--sapGroup_ContentBorderColor, #ffffff)"></iframe>`
      const frame = this.shadowRoot.querySelector('iframe.native-page-frame')
      if (frame) frame.srcdoc = html
    }

    /** 加载占位延迟上屏阈值：源码缓存命中等快路径（低于该值）完全不闪占位；与 html-pages 批量加载遮罩的 200ms 对齐。 */
    static get LOADING_HINT_DELAY_MS () { return 200 }

    /**
     * 延迟加载占位：超时前加载完成则永不上屏，超时后才渲染居中转圈。
     * seq 失效守卫与 _load 的 await 点同款；渲染侧（_renderHtml/_renderIframe/
     * _renderErrorState/_renderMessage）各自 _clearLoadingHint，防迟到的定时器覆盖已上屏内容。
     */
    _armLoadingHint (pageId, seq) {
      this._clearLoadingHint()
      this._loadingTimer = setTimeout(() => {
        this._loadingTimer = null
        if (seq !== this._seq) return
        this._renderLoading(pageId)
      }, CmxNativePagesHost.LOADING_HINT_DELAY_MS)
    }

    _clearLoadingHint () {
      if (this._loadingTimer) {
        clearTimeout(this._loadingTimer)
        this._loadingTimer = null
      }
    }

    /** 居中加载占位：Neo 极光底 + 青→紫渐变发光圆环，令牌驱动亮/暗自适应；pageId 折进 title 悬浮提示不占版面。 */
    _renderLoading (pageId) {
      // eslint-disable-next-line no-restricted-syntax -- 加载占位模板：静态令牌模板，pageId 经 escAttr 进 title
      this.shadowRoot.innerHTML = `
        <style>
          .np-load {
            position: absolute; inset: 0; display: flex; flex-direction: column;
            align-items: center; justify-content: center; gap: 18px;
            contain: layout paint style;
            background:
              radial-gradient(ellipse 120% 70% at 0% 0%, color-mix(in srgb, var(--neo-cyan, #00b4d8) 5%, transparent), transparent 55%),
              radial-gradient(ellipse 90% 60% at 100% 100%, color-mix(in srgb, var(--neo-violet, #7c3aed) 4%, transparent), transparent 50%);
            animation: np-load-fade .18s ease-out;
          }
          @keyframes np-load-fade { from { opacity: 0; } to { opacity: 1; } }
          .np-load__spinner {
            width: 36px; height: 36px; border-radius: 999px;
            background: conic-gradient(from 0deg, transparent 12%, var(--neo-cyan, #00b4d8) 42%, var(--neo-violet, #7c3aed) 100%);
            -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3.5px));
            mask: radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3.5px));
            animation: np-load-spin .9s linear infinite;
            filter: drop-shadow(0 0 8px color-mix(in srgb, var(--neo-cyan, #00b4d8) 30%, transparent));
          }
          @keyframes np-load-spin { to { transform: rotate(360deg); } }
          @media (prefers-reduced-motion: reduce) {
            .np-load { animation: none; }
            .np-load__spinner { animation: none; filter: none; }
          }
          .np-load__text {
            font-size: 13px; font-weight: 500; letter-spacing: .02em;
            color: var(--sapContent_LabelColor, #6a6d70);
          }
        </style>
        <div class="np-load" role="status"${pageId ? ` title="正在加载：${escAttr(pageId)}"` : ''}>
          <div class="np-load__spinner"></div>
          <div class="np-load__text">正在加载页面…</div>
        </div>`
    }

    _renderMessage (message, error) {
      this._clearLoadingHint()
      const color = error ? '#b00' : 'var(--sapContent_LabelColor,#6a6d70)'
      // eslint-disable-next-line no-restricted-syntax -- 消息文案经 escHtml 转义；color 为内部字面量
      this.shadowRoot.innerHTML = `<div style="padding:10px;font-size:12px;color:${color};box-sizing:border-box">${escHtml(message)}</div>`
    }

    /**
     * 友好的错误空状态（替代原来一行刺眼红字）。
     *
     * 语义分级：能力中心未启动 / 反代不可达（含 "error sending request"、"不可达"、
     * "未配置"、5xx 网关码）→ 归为「服务未就绪」，给人性化文案 + 重试，原始技术串折进
     * 「技术详情」details，不直接甩给用户；其余错误走通用「页面打不开」文案。
     *
     * 视觉对齐门户 Neo 空状态：sap/neo 令牌驱动，亮/暗自适应，纯静态无动画。
     */
    _renderErrorState (rawMsg, pageId) {
      this._clearLoadingHint()
      const raw = String(rawMsg || '').trim()
      // 是否「服务未就绪」类：微服务没起 / 反代失败 / 网关错误
      const unreachable = /不可达|未配置|error sending request|connection refused|failed to connect|dns error|timed?\s?out|HTTP\s*(502|503|504)|ECONNREFUSED|ETIMEDOUT|Failed to fetch|NetworkError/i.test(raw)

      const theme = unreachable
        ? {
            icon: 'disconnected',
            accent: 'var(--neo-amber, #f59e0b)',
            title: '此功能所在的能力中心暂未就绪',
            desc: '对应的后端微服务尚未启动或暂时无法连接。启动该服务后点击「重试」即可正常使用，其它功能不受影响。',
          }
        : {
            icon: 'sys-help-2',
            accent: 'var(--neo-violet, #7c3aed)',
            title: '这个页面暂时打不开',
            desc: '页面加载时遇到了问题。可以稍后重试；若持续出现，请联系管理员。',
          }

      // eslint-disable-next-line no-restricted-syntax -- 错误空态模板：动态值仅内部主题色（CSS 上下文）
      this.shadowRoot.innerHTML = `
        <style>
          .np-err {
            position: absolute; inset: 0; display: flex; flex-direction: column;
            align-items: center; justify-content: center; gap: 20px;
            padding: 32px 24px; box-sizing: border-box; overflow: auto;
            text-align: center; contain: layout paint style;
            background:
              radial-gradient(ellipse 120% 70% at 0% 0%, color-mix(in srgb, ${theme.accent} 8%, transparent), transparent 52%),
              radial-gradient(ellipse 90% 60% at 100% 100%, color-mix(in srgb, var(--neo-cyan, #00b4d8) 6%, transparent), transparent 48%),
              var(--portal-workspace-bg, var(--sapBackgroundColor, #f5f6f7));
            color: var(--sapTextColor, #32363a);
          }
          .np-err__icon {
            width: 88px; height: 88px; border-radius: 999px;
            display: flex; align-items: center; justify-content: center;
            background: color-mix(in srgb, ${theme.accent} 12%, transparent);
            border: 1px solid color-mix(in srgb, ${theme.accent} 30%, transparent);
            color: ${theme.accent};
          }
          .np-err__icon ui5-icon { width: 40px; height: 40px; }
          .np-err__title { font-size: 17px; font-weight: 600; color: var(--sapTextColor, #32363a); margin: 0; }
          .np-err__desc { max-width: 460px; margin: 0; font-size: 13px; line-height: 1.6; color: var(--sapContent_LabelColor, #6a6d70); }
          .np-err__actions { display: flex; gap: 10px; align-items: center; margin-top: 2px; }
          .np-err__btn {
            display: inline-flex; align-items: center; gap: 6px;
            padding: 7px 18px; border-radius: 8px; cursor: pointer;
            font-size: 13px; font-weight: 600; font-family: inherit;
            border: 1px solid ${theme.accent};
            background: ${theme.accent}; color: #fff;
            transition: filter .15s ease;
          }
          .np-err__btn:hover { filter: brightness(1.08); }
          .np-err__btn ui5-icon { width: 15px; height: 15px; color: #fff; }
          .np-err__details { max-width: 560px; width: 100%; margin-top: 4px; }
          .np-err__details summary {
            cursor: pointer; font-size: 12px; list-style: none;
            color: var(--sapContent_LabelColor, #6a6d70); user-select: none; opacity: .8;
          }
          .np-err__details summary:hover { opacity: 1; }
          .np-err__details summary::-webkit-details-marker { display: none; }
          .np-err__code {
            margin-top: 8px; padding: 10px 12px; border-radius: 8px;
            background: color-mix(in srgb, var(--sapContent_LabelColor, #6a6d70) 8%, transparent);
            border: 1px solid var(--sapField_BorderColor, color-mix(in srgb, currentColor 14%, transparent));
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            font-size: 11.5px; line-height: 1.5; text-align: left; word-break: break-all;
            color: var(--sapContent_LabelColor, #6a6d70);
          }
        </style>
        <div class="np-err" role="alert">
          <div class="np-err__icon"><ui5-icon name="${escAttr(theme.icon)}"></ui5-icon></div>
          <h3 class="np-err__title">${escHtml(theme.title)}</h3>
          <p class="np-err__desc">${escHtml(theme.desc)}</p>
          <div class="np-err__actions">
            <button class="np-err__btn" type="button" data-np-retry>
              <ui5-icon name="refresh"></ui5-icon> 重试
            </button>
          </div>
          <details class="np-err__details">
            <summary>技术详情</summary>
            <div class="np-err__code">${escHtml(pageId ? `页面：${pageId}\n` : '')}${escHtml(raw || '未知错误')}</div>
          </details>
        </div>`
      const btn = this.shadowRoot.querySelector('[data-np-retry]')
      if (btn) {
        btn.addEventListener('click', () => {
          // 不再立即替换错误态：快路径直通内容，慢路径由 _load 内的延迟占位接管
          this._load()
        })
      }
    }
  }

  customElements.define('cmx-native-pages-host', CmxNativePagesHost)
}

function parseJsonAttr (text) {
  if (!text) return {}
  try {
    const v = JSON.parse(text)
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

/** 读元素属性并 trim，缺省返回空串（_load/_reload/_runScripts 共用的属性读取口径）。 */
function trimmedAttr (el, name) {
  return String(el.getAttribute(name) || '').trim()
}

/** 判定一段 HTML 是否「完整文档」（含 <!doctype>/<html>/<head>/<body>）。
 *  完整文档 → iframe 承载（脚本/样式隔离运行，适合大模型整页）；
 *  片段（含带 <script> 的可交互片段）→ 走 html_pages CE 管线（脚本经 inject 新建 script 执行 + 接 workspace.context）。 */
function isFullHtmlDocument (html) {
  const s = String(html || '')
  if (/<!doctype\s+html/i.test(s)) return true
  if (/<html[\s>]/i.test(s) || /<head[\s>]/i.test(s) || /<body[\s>]/i.test(s)) return true
  return false
}

async function loadNativePageDef (pageId) {
  let pending = _pageDefCache.get(pageId)
  if (!pending) {
    pending = loadNativePageDefWithCache(pageId)
    _pageDefCache.set(pageId, pending)
  }
  return pending
}

/**
 * 带 IndexedDB 持久缓存 + ETag/304 的 native page 加载。
 *
 * 流程：先查 IndexedDB 拿本地 rev → 带 `If-None-Match` 请求 `/api/native-pages/:id`：
 * - 200 → 用新响应（含 source + rev），写回 IndexedDB；
 * - 304 → rev 命中，复用 IndexedDB 里的 source（0 body 传输）；
 * - 本地无缓存 → 普通请求（无 If-None-Match），200 后写回。
 * @param {string} pageId
 * @returns {Promise<Record<string, unknown>>} 含 source/sourceType/rev 的 page 定义
 */
async function loadNativePageDefWithCache (pageId) {
  const cached = await getPage(pageId)
  const headers = { Accept: 'application/json' }
  if (cached && cached.rev) headers['If-None-Match'] = `"${cached.rev}"`
  const res = await fetch(`/api/native-pages/${encodeURIComponent(pageId)}`, {
    headers,
    credentials: 'same-origin',
  })
  // 304：rev 命中，复用 IndexedDB source（拦截器对 304 透传，res.ok=false 在此特判）。
  // B2 例外：条件请求须读 Response.status 判 304，apiFetch 无法表达，保持 raw fetch。
  if (res.status === 304) {
    if (cached && cached.source) {
      return { id: pageId, sourceType: sourceTypeFromCache(cached), source: cached.source, rev: cached.rev }
    }
    // 304 但本地无可用缓存（异常）：退化为无条件重取
    const res2 = await fetch(`/api/native-pages/${encodeURIComponent(pageId)}`, {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    })
    if (!res2.ok) throw new Error(await nativeErrorMessage(pageId, res2))
    return persistNativePage(pageId, await res2.json())
  }
  if (!res.ok) throw new Error(await nativeErrorMessage(pageId, res))
  return persistNativePage(pageId, await res.json())
}

/**
 * 把服务端 page 响应写回 IndexedDB 并返回标准化的 page 定义。
 * @param {string} pageId
 * @param {Record<string, unknown>} page
 * @returns {Record<string, unknown>}
 */
async function persistNativePage (pageId, page) {
  const source = String(page?.source ?? '')
  const rev = String(page?.rev ?? '')
  const relPath = String(page?.relPath ?? '')
  const sourceType = String(page?.sourceType ?? '')
  if (source && rev) {
    await putPage(pageId, { rev, source, relPath, sourceType }).catch(() => {})
  }
  return page
}

/** 从缓存条目取 sourceType：优先缓存字段，缺失时由 relPath 扩展名推断（兼容旧缓存）。 */
function sourceTypeFromCache (cached) {
  const st = String(cached?.sourceType || '').trim().toLowerCase()
  if (st === 'html' || st === 'js') return st
  const rel = String(cached?.relPath || '').toLowerCase()
  if (rel.endsWith('.html') || rel.endsWith('.htm')) return 'html'
  return 'js'
}

/** 读取 native page 错误响应的可读消息。 */
async function nativeErrorMessage (pageId, res) {
  let msg = `native-pages/${pageId} HTTP ${res.status}`
  try {
    const j = await res.json()
    if (j?.error) msg = String(j.error)
  } catch {}
  return msg
}

/**
 * 取某个 workspace scope 的 native JS 模块缓存；scope 被 mainapp 释放后可整体 GC。
 * @param {Record<string, unknown> | null} scope
 * @returns {Map<string, Promise<Record<string, unknown>>> | null}
 */
function scopeNativePageModuleCache (scope) {
  if (!scope || (typeof scope !== 'object' && typeof scope !== 'function')) return null
  let cache = /** @type {Map<string, Promise<Record<string, unknown>>> | undefined} */ (_scopeModuleCache.get(scope))
  if (!cache) {
    cache = new Map()
    _scopeModuleCache.set(scope, cache)
  }
  return cache
}

/**
 * 清当前 scope 内某 page 的模块实例缓存（刷新页面源码时配合 _pageDefCache 使用）。
 * @param {Record<string, unknown> | null} scope
 * @param {string} pageId
 */
function clearScopeNativePageModule (scope, pageId) {
  if (!scope || (typeof scope !== 'object' && typeof scope !== 'function')) return
  _scopeModuleCache.get(scope)?.delete(String(pageId || ''))
}

async function materializeNativePage (page, scope = null) {
  const sourceType = String(page?.sourceType || '').trim().toLowerCase()
  const source = String(page?.source ?? '')
  if (sourceType === 'html') {
    return {
      id: page.id,
      defaultView: 'default',
      // 标记为 HTML 源：渲染层据此决定整页文档走 iframe、片段走 innerHTML
      sourceType: 'html',
      views: {
        default: () => source,
      },
    }
  }
  if (sourceType === 'js') {
    const pageId = String(page.id || '')
    const cache = scopeNativePageModuleCache(scope)
    if (!cache) return importNativePageModule(pageId, source)
    let importing = cache.get(pageId)
    if (!importing) {
      importing = importNativePageModule(pageId, source)
      cache.set(pageId, importing)
      importing.catch(() => cache.delete(pageId))
    }
    return importing
  }
  throw new Error(`不支持的原生页面类型：${sourceType || 'unknown'}`)
}

/**
 * 执行一次 JS 源码并返回页面定义。调用方决定缓存粒度：
 * 同 scope 复用（多区域联动），无 scope 每次 import（独立宿主隔离）。
 * @param {string} pageId 仅用于报错文案
 * @param {string} source JS 源码
 * @returns {Promise<Record<string, unknown>>} 页面定义 {defaultView, views}
 */
async function importNativePageModule (pageId, source) {
  const blob = new Blob([source], { type: 'text/javascript' })
  const url = URL.createObjectURL(blob)
  try {
    const mod = await import(/* @vite-ignore */ url)
    if (typeof mod.render === 'function') {
      return { defaultView: 'default', views: { default: mod.render } }
    }
    const def = mod.default || mod.nativePage || mod.page
    if (!def || typeof def !== 'object') {
      throw new Error(`原生页面模块 ${pageId} 未导出页面定义`)
    }
    return /** @type {Record<string, unknown>} */ (def)
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function renderNativePage (page, ctx) {
  const views = page.views && typeof page.views === 'object' ? /** @type {Record<string, unknown>} */ (page.views) : {}
  const viewName = ctx.view || String(page.defaultView || 'default')
  const renderer = views[viewName] || views.default
  if (typeof renderer !== 'function') {
    throw new Error(`原生页面 ${ctx.pageId} 未提供视图：${viewName}`)
  }
  const out = await renderer(ctx)
  return String(out ?? '')
}
