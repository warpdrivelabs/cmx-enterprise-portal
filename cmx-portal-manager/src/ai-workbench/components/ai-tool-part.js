/**
 * 工具调用 part —— opencode 风格:TextShimmer 扫光标题 + 可折叠卡片。
 *
 * pending/running:标题用扫光动画,隐藏参数与折叠箭头。
 * completed/error:常驻标题,可点击展开 output/error 详情。
 *
 * 行结构:icon(16px) + 标题 + arg(muted);右侧 chevron(hover 显示)。
 * 展开内容为 opencode tool-output 风格:mono 13px,max-h 240px,滚动隐藏滚动条。
 */
import { LitElement, html, css } from 'lit'
import { unsafeHTML } from 'lit/directives/unsafe-html.js'
import { sharedTokens } from '../theme/shared-styles.js'
import { textShimmerCss, renderTextShimmer } from '../utils/text-shimmer.js'
import { renderMarkdownSync, renderMarkdown, highlightCode, langFromPath } from '../utils/markdown.js'
import { handleCodeCopyClick } from '../utils/clipboard.js'
import './ai-copy-button.js'

// 工具标题(对齐 opencode i18n:Read/Shell/Write/Edit/Grep/Glob/Webfetch/...)。
// opencode 标准工具不渲染 icon,仅展示标题 + 完成后的副标题。
const TOOL_LABELS = {
  bash: 'Shell', shell: 'Shell', exec: 'Shell',
  read: 'Read', list: 'List',
  grep: 'Grep', glob: 'Glob',
  write: 'Write', edit: 'Edit', apply_patch: 'Patch',
  webfetch: 'Webfetch', websearch: 'Websearch',
  task: 'Task', skill: 'Skill', todowrite: 'To-dos',
}

// Todo 状态图标(等宽字符,跟随状态着色)
const TODO_ICONS = {
  completed: '✓',
  in_progress: '●',
  pending: '○',
}
// 优先级中文标签
const PRIORITY_LABELS = {
  high: '高',
  medium: '中',
  low: '低',
}

export class AiToolPart extends LitElement {
  static properties = {
    tool: { type: String },
    state: { type: String },      // pending/running/completed/error
    output: { type: String },
    input: { type: Object },
    metadata: { type: Object },   // question 工具的 answers 等
    startTime: { type: Number },
    endTime: { type: Number },
    _expanded: { state: true },
    _hlHtml: { state: true },   // shiki 高亮后的 HTML(异步填充,未就绪时空串走 fallback)
  }

  static styles = [
    sharedTokens,
    textShimmerCss,
    css`
      :host {
        display: block;
        font-size: var(--oc-font-size-base);
        line-height: 1.5;
      }
      .trigger {
        display: flex;
        align-items: center;
        gap: 0;
        width: 100%;
        min-height: 32px;
        padding: 0;
        border-radius: var(--oc-radius-sm);
        transition: background-color 0.15s ease;
        background: transparent;
        border: none;
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: default;
      }
      .trigger[data-clickable="true"] { cursor: pointer; }
      .trigger[data-clickable="true"]:hover { background: var(--oc-layer-01); }

      .trigger-content {
        display: flex;
        align-items: baseline;
        gap: 8px;
        max-width: calc(100% - 24px);
        min-width: 0;
        font-size: var(--oc-font-size-base);
        font-weight: 500;
      }
      .arg {
        font-size: var(--oc-font-size-base);
        font-weight: 400;
        color: var(--oc-text-muted);
        font-variant-numeric: tabular-nums;
        text-overflow: ellipsis;
        overflow: hidden;
        white-space: nowrap;
        min-width: 0;
      }
      .arrow {
        flex-shrink: 0;
        margin-left: auto;
        width: 24px;
        height: 24px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: var(--oc-text-faint);
        font-size: 10px;
        opacity: 0;
        transition: opacity 0.15s ease, transform 0.15s ease;
      }
      .trigger:hover .arrow,
      .trigger[aria-expanded="true"] .arrow { opacity: 1; }
      .arrow.expanded { transform: rotate(90deg); }

      /* 展开内容容器(对齐 opencode collapsible-content:无额外 padding/背景) */
      .body {
        margin: 4px 0 0;
      }

      /* bash-output(对齐 opencode):带边框圆角的命令+输出块,hover 显示复制按钮 */
      .bash-output {
        width: 100%;
        position: relative;
        border: 0.5px solid var(--oc-border-base);
        border-radius: 6px;
        background: var(--oc-code-bg);
        overflow: hidden;
        -webkit-user-select: text;
        user-select: text;
      }
      .bash-output .copy-slot {
        position: absolute;
        top: 4px;
        right: 4px;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.15s ease;
        z-index: 1;
      }
      .bash-output:hover .copy-slot,
      .bash-output:focus-within .copy-slot { opacity: 1; pointer-events: auto; }
      .bash-scroll {
        width: 100%;
        overflow-y: auto;
        overflow-x: hidden;
        max-height: 240px;
        scrollbar-width: none;
      }
      .bash-scroll::-webkit-scrollbar { display: none; }
      .bash-output pre {
        margin: 0;
        padding: 12px;
      }
      .bash-output code {
        font-family: var(--oc-font-mono);
        font-size: 13px;
        line-height: 1.5;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        color: var(--oc-code-fg);
      }

      /* Shiki 高亮容器:OpenCode 主题(纯 CSS 变量),背景/前景跟随明暗主题切换。
         高亮就绪前由纯文本 fallback 占位(fallback 用同样的 --oc-code-bg,避免闪烁)。 */
      .code-hl {
        border-radius: 6px;
        overflow: hidden;
      }
      .code-hl pre.shiki {
        margin: 0;
        padding: 12px;
        border: none !important;
        border-radius: 0;
        font-family: var(--oc-font-mono);
        font-size: 13px;
        line-height: 1.5;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
      .code-hl pre.shiki code {
        font-family: var(--oc-font-mono);
        font-size: 13px;
        line-height: 1.5;
        background: none;
        padding: 0;
        color: inherit;
      }
      .code-content .code-hl pre.shiki {
        white-space: pre;
        overflow-x: auto;
        scrollbar-width: none;
      }
      .code-content .code-hl pre.shiki::-webkit-scrollbar { display: none; }

      /* read 工具"已加载文件"提示(对齐 opencode tool-loaded-file):
         非等宽、muted 色、回车图标,仅作路径提示。 */
      .loaded-files {
        display: flex; flex-direction: column;
        padding: 4px 0 4px 24px;
      }
      .loaded-file {
        display: flex; align-items: center; gap: 8px;
        font-family: var(--oc-font-sans);
        font-size: var(--oc-font-size-small);
        line-height: 20px;
        color: var(--oc-text-muted);
      }
      .loaded-file .lf-icon { flex-shrink: 0; color: var(--oc-text-faint); }

      /* tool-output(对齐 opencode):generic 工具 output 经 markdown 渲染 */
      .tool-output {
        width: 100%;
        max-height: 240px;
        overflow-y: auto;
        scrollbar-width: none;
        -webkit-user-select: text;
        user-select: text;
      }
      .tool-output::-webkit-scrollbar { display: none; }
      .tool-output .md { font-size: 13px; line-height: 1.5; }
      .tool-output .md :first-child { margin-top: 0; }
      .tool-output .md :last-child { margin-bottom: 0; }
      .tool-output .md p { margin: 0 0 8px; }
      /* 代码块容器(带语言标签 + 复制按钮) —— 对齐 text-part/reasoning-part */
      .tool-output .md .code-block { position: relative; margin: 8px 0; }
      .tool-output .md .code-block .code-copy {
        position: absolute; top: 4px; right: 4px; z-index: 1;
        padding: 1px 6px; font-size: 11px; font-family: var(--oc-font-sans);
        color: var(--oc-text-muted); background: var(--oc-bg-base);
        border: 0.5px solid var(--oc-border-base); border-radius: var(--oc-radius-sm);
        cursor: pointer; opacity: 0; transition: opacity 0.15s ease, color 0.15s ease;
      }
      .tool-output .md .code-block:hover .code-copy,
      .tool-output .md .code-block:focus-within .code-copy { opacity: 1; }
      .tool-output .md .code-block .code-copy:hover { color: var(--oc-text-base); }
      .tool-output .md .code-block .code-copy.copied { color: var(--oc-success); border-color: var(--oc-success); }
      .tool-output .md .code-block::before {
        content: attr(data-lang); position: absolute; top: 4px; left: 10px; z-index: 1;
        font-family: var(--oc-font-mono); font-size: 11px; color: var(--oc-text-faint);
        text-transform: lowercase; pointer-events: none;
      }
      .tool-output .md .code-block pre,
      .tool-output .md pre {
        font-family: var(--oc-font-mono); font-size: 13px; line-height: 1.5;
        padding: 20px 10px 10px; margin: 0; border-radius: var(--oc-radius-sm);
        border: 0.5px solid var(--oc-border-base); background: var(--oc-code-bg);
        overflow-x: auto; scrollbar-width: none;
      }
      .tool-output .md pre::-webkit-scrollbar { display: none; }
      .tool-output .md .code-block pre code,
      .tool-output .md code {
        font-family: var(--oc-font-mono); font-size: 13px; background: none; padding: 0;
      }
      .tool-output .md :not(pre) > code {
        padding: 1px 4px; border-radius: var(--oc-radius-sm);
        background: color-mix(in oklch, var(--oc-text-base) 8%, transparent);
      }
      /* 已完成但无文本输出的空态提示 */
      .empty-output {
        padding: 8px 12px;
        font-size: var(--oc-font-size-small);
        color: var(--oc-text-faint);
        font-style: italic;
      }

      /* error 卡片(对齐 opencode ToolErrorCard) */
      .error-card {
        padding: 8px 12px;
        border-radius: 6px;
        border: 0.5px solid var(--oc-error-border);
        background: var(--oc-error-bg);
        color: var(--oc-error-fg);
        font-size: 13px;
        line-height: 1.5;
        white-space: pre-wrap;
        word-break: break-word;
        -webkit-user-select: text;
        user-select: text;
      }

      /* write/edit 内容代码块 */
      .code-content {
        border: 0.5px solid var(--oc-border-base);
        border-radius: 6px;
        background: var(--oc-code-bg);
        max-height: 240px;
        overflow-y: auto;
        scrollbar-width: none;
        -webkit-user-select: text;
        user-select: text;
      }
      .code-content::-webkit-scrollbar { display: none; }
      .code-content pre {
        margin: 0;
        padding: 12px;
        font-family: var(--oc-font-mono);
        font-size: 13px;
        line-height: 1.5;
        white-space: pre-wrap;
        word-break: break-word;
        color: var(--oc-code-fg);
      }

      /* question 已回答:标题行的 icon + 标题(仅此分支使用) */
      .icon {
        flex-shrink: 0;
        width: 16px;
        text-align: center;
        font-family: var(--oc-font-mono);
        font-weight: 600;
        font-size: 13px;
        color: var(--oc-text-muted);
        line-height: 1.5;
      }
      .title { font-size: var(--oc-font-size-base); font-weight: 500; color: var(--oc-text-base); white-space: nowrap; }

      /* question 已回答:轻量问答列表(对齐 opencode question-answers) */
      .qa {
        display: flex; flex-direction: column; gap: 12px;
        padding: 8px 0 4px 24px;
        margin: 0;
        font-family: var(--oc-font-sans);
      }
      .qa-item {
        display: flex; flex-direction: column; gap: 2px;
        font-size: var(--oc-font-size-small);
      }
      .qa-question { color: var(--oc-text-muted); }
      .qa-answer { color: var(--oc-text-base); }

      /* skill 工具:hideDetails 卡片(对齐 opencode BasicTool hideDetails)。
         无 icon、不可点击、无箭头;仅一行技能名标题(pending/running 扫光)。 */
      .skill-trigger {
        cursor: default;
        min-height: 32px;
      }
      .skill-trigger:hover { background: transparent; }
      .skill-title {
        font-size: var(--oc-font-size-base);
        font-weight: 500;
        color: var(--oc-text-base);
        text-transform: capitalize;
      }

      /* todowrite 工具:待办清单(对齐 opencode todos 渲染) */
      .todo-list {
        display: flex; flex-direction: column;
        gap: 2px;
        padding: 8px 0 4px 24px;
        margin: 0;
        font-family: var(--oc-font-sans);
        -webkit-user-select: text;
        user-select: text;
      }
      .todo-item {
        display: flex; align-items: flex-start; gap: 8px;
        font-size: var(--oc-font-size-small);
        line-height: 1.5;
        padding: 1px 0;
      }
      .todo-icon {
        flex-shrink: 0;
        width: 16px; height: 20px;
        display: inline-flex; align-items: center; justify-content: center;
        font-family: var(--oc-font-mono);
        font-size: 13px;
        line-height: 1.5;
      }
      .todo-text {
        flex: 1; min-width: 0;
        word-break: break-word;
      }
      .todo-prio {
        flex-shrink: 0;
        padding: 0 5px;
        font-size: 11px;
        line-height: 16px;
        border-radius: var(--oc-radius-xs);
        border: 0.5px solid var(--oc-border-base);
        color: var(--oc-text-muted);
        font-variant-numeric: tabular-nums;
      }
      /* 状态着色 */
      .todo-completed .todo-icon { color: var(--oc-success); }
      .todo-completed .todo-text {
        color: var(--oc-text-faint);
        text-decoration: line-through;
      }
      .todo-in_progress .todo-icon { color: var(--oc-accent-text); }
      .todo-in_progress .todo-text { color: var(--oc-text-base); font-weight: 500; }
      .todo-pending .todo-icon { color: var(--oc-text-faint); }
      .todo-pending .todo-text { color: var(--oc-text-muted); }
      /* 优先级标签 */
      .prio-high { color: var(--oc-error-fg); border-color: var(--oc-error-border); }
      .prio-medium { color: var(--oc-warning); border-color: var(--oc-warning-bg); }
      .prio-low { color: var(--oc-text-faint); }
    `,
  ]

  constructor () {
    super()
    this.tool = 'unknown'
    this.state = 'running'
    this.output = ''
    this.input = {}
    this.metadata = {}
    this.startTime = 0
    this.endTime = 0
    this._expanded = null   // null = 未初始化(question 默认展开,其它默认折叠)
    this._hlHtml = ''       // shiki 高亮 HTML(空串时走纯文本 fallback)
    this._hlKey = ''        // 当前正在高亮的内容指纹,避免竞态覆盖
  }

  connectedCallback () {
    super.connectedCallback()
    // 事件委托:tool-output 内代码块复制按钮(innerHTML 重渲染后仍生效)
    this.addEventListener('click', handleCodeCopyClick)
  }

  disconnectedCallback () {
    this.removeEventListener('click', handleCodeCopyClick)
    super.disconnectedCallback()
  }

  updated (changed) {
    // generic 工具 output:仅在 output 内容变化或首次可见时同步渲染(占位),再异步补高亮。
    // 避免每次属性变更(展开/折叠/_hlHtml 异步回填等)都重跑 markdown-it、覆盖用户选区。
    const el = this.renderRoot?.querySelector('.tool-output')
    if (el && this.output && (changed.has('output') || changed.has('_expanded'))) {
      el.innerHTML = renderMarkdownSync(this.output)
      this._hydrateMarkdownHighlight(el, this.output)
    }

    // 代码类展开(bash/write/edit):异步用 shiki 高亮替换纯文本 fallback
    this._applyHighlight()
  }

  /** 异步用带高亮的 markdown 替换 .tool-output 内容(指纹防重复)。 */
  async _hydrateMarkdownHighlight (el, text) {
    const key = `md::${text.length}::${text.slice(-16)}`
    if (el._hlKey === key) return
    el._hlKey = key
    const html = await renderMarkdown(text)
    if (el._hlKey !== key || !el.isConnected) return
    el.innerHTML = html
  }

  /**
   * 异步 shiki 高亮:bash → bash,write/edit → 按文件扩展名,read/generic 已走 markdown。
   * 未就绪时保留纯文本 <pre><code> fallback,就绪后整体替换为 .code-hl 容器。
   * 用指纹(_hlKey)避免流式/重展开时旧结果覆盖新内容。
   */
  async _applyHighlight () {
    if (!this._isOpen || !this._hasDetail) return
    if (this.state === 'error') return
    const lang = this._hlLang
    const code = this._hlCode
    if (!lang || !code) return
    const key = `${lang}::${code.length}::${code.slice(-16)}`
    if (key === this._hlKey) return
    this._hlKey = key
    const html = await highlightCode(code, lang)
    // 竞态守卫:若期间内容已变,丢弃本次结果
    if (this._hlKey !== key) return
    this._hlHtml = html || ''
  }

  /** 高亮目标语言:bash → bash;write/edit/apply_patch → 按文件路径推断;其它无。 */
  get _hlLang () {
    if (this._isBash) return 'bash'
    if (['write', 'edit', 'apply_patch'].includes(this.tool)) {
      const i = this.input || {}
      return langFromPath(i.filePath || i.file_path || i.path || '') || 'text'
    }
    return ''
  }

  /** 高亮目标代码:bash → $ command\n\noutput;write/edit → content。 */
  get _hlCode () {
    if (this._isBash) return this._bashText
    if (this.tool === 'write' || this.tool === 'edit') return this._codeContent
    if (this.tool === 'apply_patch') return this._codeContent
    return ''
  }

  _toggle () {
    if (!this._hasDetail) return
    // null 视为"默认态"(question 展开=true,其它折叠=false),toggle 时取反默认
    const cur = this._expanded === null ? this._isQuestionAnswered : this._expanded
    this._expanded = !cur
    // 重新展开时清空旧高亮,触发 updated → _applyHighlight 重跑
    if (this._expanded) { this._hlHtml = ''; this._hlKey = '' }
  }

  /** 当前展开态(null 时 question 默认展开,其它默认折叠)。 */
  get _isOpen () {
    return this._expanded === null ? this._isQuestionAnswered : this._expanded
  }

  get _label () { return TOOL_LABELS[this.tool] || this.tool }

  /** 取文件名(opencode 用 getFilename,仅 basename)。 */
  _basename (p) {
    if (!p) return ''
    const parts = String(p).replace(/\\/g, '/').split('/')
    return parts[parts.length - 1] || ''
  }

  /** 副标题(对齐 opencode:read/write/edit 显示 basename,bash 显示 command,...)。 */
  get _argText () {
    const i = this.input || {}
    if (['read', 'write', 'edit', 'apply_patch'].includes(this.tool)) {
      const p = i.filePath || i.file_path || i.path || this._pathFromOutput || ''
      return this._basename(p)
    }
    if (['bash', 'shell', 'exec'].includes(this.tool)) return i.command || ''
    if (this.tool === 'grep' || this.tool === 'glob') return i.pattern || ''
    if (this.tool === 'webfetch') return i.url || ''
    if (this.tool === 'websearch') return i.query || ''
    if (this._isTodoWrite) {
      const todos = this._todos
      if (!todos.length) return ''
      const done = todos.filter((t) => t.status === 'completed').length
      return `${done}/${todos.length} 已完成`
    }
    return ''
  }

  /** 从 output 的 <path>...</path> 兜底提取文件路径(input 缺失时用)。 */
  get _pathFromOutput () {
    const m = (this.output || '').match(/<path>([\s\S]*?)<\/path>/)
    return m ? m[1].trim() : ''
  }

  get _isPending () { return this.state === 'pending' || this.state === 'running' }
  /** 是否为 question 已回答(completed + 有 input.questions 或 metadata.answers)。 */
  get _isQuestionAnswered () {
    return this.tool === 'question' && this.state === 'completed'
  }
  /** 是否为 skill 工具(对齐 opencode:hideDetails,仅展示技能名标题,不展开 output)。 */
  get _isSkill () { return this.tool === 'skill' }
  /** skill 名称:优先取 input.name(对齐 opencode),首字母大写;兜底"技能"。 */
  get _skillTitle () {
    const name = (this.input && this.input.name) ? String(this.input.name) : ''
    if (!name) return '技能'
    return name.charAt(0).toUpperCase() + name.slice(1)
  }
  get _hasDetail () {
    if (this._isQuestionAnswered) return true
    if (this._isSkill) return false   // skill:hideDetails,不可展开
    if (this._isPending) return false // 运行中不可展开(opencode pending 隐藏箭头)
    if (this.state === 'error') return true
    // read:对齐 opencode —— 不渲染 output,不可展开(仅 trigger 下显示已加载文件提示)
    if (this.tool === 'read') return false
    // bash/shell:有 command 或 output 即可展开
    if (this._isBash) return !!(this._bashText)
    // write/edit:有 content/oldString+newString 即可展开
    if (this.tool === 'write' || this.tool === 'edit') {
      const i = this.input || {}
      return !!(i.content || (i.oldString && i.newString) || i.old_string || i.new_string)
    }
    // 已完成的工具：无论 output 是否为空都可展开。
    // 修复「工具执行完无法点击展开」：OpenCode 很多工具 completed 时 output 为空串，
    // 原 `!!(this.output)` 判定为无详情 → 展开箭头不渲染、_toggle 直接 return，
    // 表现为「有时能展开有时不能」。已完成态即可查看（无 output 时展示空态提示）。
    if (this.state === 'completed') return true
    // 其它状态兜底：有 output 即可展开
    return !!(this.output)
  }

  get _isBash () { return this.tool === 'bash' || this.tool === 'shell' || this.tool === 'exec' }

  get _isTodoWrite () { return this.tool === 'todowrite' }

  /** todowrite 工具的待办列表(对齐 opencode todos 工具渲染)。
   *  数据来源:优先 input.todos(完整对象数组);回退解析 output(JSON 字符串)。 */
  get _todos () {
    if (!this._isTodoWrite) return []
    // 优先从 input.todos 读取(结构化数据)
    const fromInput = this.input && Array.isArray(this.input.todos) ? this.input.todos : null
    if (fromInput && fromInput.length) return fromInput
    // 回退:解析 output JSON 字符串(todos 工具的 output 常是 JSON 数组)
    const raw = this.output || ''
    if (raw) {
      try {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) return parsed
      } catch { /* output 非 JSON,走通用 markdown 渲染 */ }
    }
    return []
  }

  /** bash 展开文本:$ command\n\noutput(对齐 opencode bash renderer)。 */
  get _bashText () {
    const i = this.input || {}
    const cmd = i.command || (this.metadata && this.metadata.command) || ''
    const out = (this.output || (this.metadata && this.metadata.output) || '').replace(/\r\n?/g, '\n')
    return `$ ${cmd}${out ? '\n\n' + out : ''}`
  }

  /** write/edit 展开内容。 */
  get _codeContent () {
    const i = this.input || {}
    if (this.tool === 'write') return i.content || ''
    if (this.tool === 'edit') {
      // edit:展示 newString(新内容);如有 oldString 可做简易 diff 提示
      return i.newString || i.new_string || ''
    }
    return ''
  }

  /** question 的问题+答案列表(用于已回答展开渲染)。 */
  get _questionPairs () {
    const questions = (this.input && Array.isArray(this.input.questions)) ? this.input.questions : []
    const answers = (this.metadata && Array.isArray(this.metadata.answers)) ? this.metadata.answers : []
    return questions.map((q, i) => ({
      question: q.question || q.header || '',
      answer: (answers[i] || []).join(', ') || '(无回答)',
    }))
  }

  render () {
    // question 已回答:专用渲染(标题"询问" + 副标题"已回答",默认展开)
    if (this._isQuestionAnswered) {
      const pairs = this._questionPairs
      const n = pairs.length || 1
      return html`
        <button class="trigger" data-clickable="true" aria-expanded=${this._isOpen ? 'true' : 'false'} @click=${this._toggle}>
          <span class="trigger-content">
            <span class="icon">?</span>
            <span class="title">询问</span>
            <span class="arg">${n} 已回答</span>
          </span>
          <span class="arrow ${this._isOpen ? 'expanded' : ''}">▶</span>
        </button>
        ${this._isOpen ? html`
          <div class="qa">
            ${pairs.length ? pairs.map(p => html`
              <div class="qa-item">
                <div class="qa-question">${p.question}</div>
                <div class="qa-answer">${p.answer}</div>
              </div>
            `) : html`<div class="qa-item"><div class="qa-answer">(无回答)</div></div>`}
          </div>
        ` : ''}
      `
    }
    // skill 工具:对齐 opencode hideDetails —— 仅展示技能名标题(pending/running 扫光),
    // 无 icon、无 arg、无展开箭头、无 output body(skill_content 仅供模型,不在时间线展示)。
    if (this._isSkill) {
      return html`
        <div class="trigger skill-trigger">
          <span class="trigger-content">
            <span class="skill-title">${renderTextShimmer(this._skillTitle, this._isPending)}</span>
          </span>
        </div>
      `
    }
    // 通用工具(对齐 opencode BasicTool):仅标题 + 完成后的副标题/args + 展开箭头。
    // 无 icon(opencode 标准工具不渲染 icon)、无 duration(opencode 工具行不显示耗时)。
    // pending/running:仅扫光标题;completed:常驻标题 + 副标题 + 可展开 output。
    return html`
      <button
        class="trigger"
        data-clickable=${this._hasDetail ? 'true' : 'false'}
        aria-expanded=${this._isOpen ? 'true' : 'false'}
        @click=${this._toggle}
      >
        <span class="trigger-content">
          ${renderTextShimmer(this._label, this._isPending)}
          ${this._argText ? html`<span class="arg">${this._argText}</span>` : ''}
        </span>
        ${this._hasDetail ? html`<span class="arrow ${this._isOpen ? 'expanded' : ''}">▶</span>` : ''}
      </button>
      ${this._isOpen && this._hasDetail ? html`<div class="body">${this._renderBody()}</div>` : ''}
      ${this._loadedFiles.length ? html`<div class="loaded-files">
        ${this._loadedFiles.map(f => html`<div class="loaded-file"><span class="lf-icon">⏎</span><span class="lf-text">已加载 ${f}</span></div>`)}
      </div>` : ''}
    `
  }

  /**
   * read 工具已加载的文件列表(对齐 opencode metadata.loaded)。
   * 优先取 metadata.loaded(数组);回退到 input.filePath(单文件)。
   */
  get _loadedFiles () {
    if (this.tool !== 'read' || this._isPending) return []
    const md = this.metadata || {}
    if (Array.isArray(md.loaded)) {
      return md.loaded.filter(x => typeof x === 'string' && x)
    }
    const i = this.input || {}
    const p = i.filePath || i.file_path || i.path || ''
    return p ? [this._basename(p)] : []
  }

  /** 展开内容:按工具类型分别渲染(对齐 opencode 各工具 renderer)。 */
  _renderBody () {
    // 错误:对齐 opencode ToolErrorCard
    if (this.state === 'error') {
      return html`<div class="error-card">${this.output || '执行失败'}</div>`
    }
    // bash/shell:bash-output 块(命令+输出,带复制按钮)
    if (this._isBash) {
      const text = this._bashText
      return html`<div class="bash-output">
        <div class="copy-slot">
          <ai-copy-button .getText=${() => text} label="复制" copiedLabel="已复制"></ai-copy-button>
        </div>
        <div class="bash-scroll">
          ${this._hlHtml
            ? html`<div class="code-hl">${unsafeHTML(this._hlHtml)}</div>`
            : html`<pre><code>${text}</code></pre>`}
        </div>
      </div>`
    }
    // write/edit/apply_patch:代码内容块
    if (this.tool === 'write' || this.tool === 'edit' || this.tool === 'apply_patch') {
      const content = this._codeContent
      if (!content) return ''
      return html`<div class="code-content">
        ${this._hlHtml
          ? html`<div class="code-hl">${unsafeHTML(this._hlHtml)}</div>`
          : html`<pre>${content}</pre>`}
      </div>`
    }
    // 通用:output 经 markdown 渲染(对齐 opencode tool-output)
    if (this.output) {
      // todowrite:解析 todos 列表,渲染为带状态图标的清单(而非原始 JSON)
      if (this._isTodoWrite && this._todos.length) {
        return html`<div class="todo-list">
          ${this._todos.map((t) => {
            const st = t.status || 'pending'
            const icon = TODO_ICONS[st] || '○'
            const prio = t.priority || ''
            return html`<div class="todo-item todo-${st}">
              <span class="todo-icon">${icon}</span>
              <span class="todo-text">${t.content || '(无描述)'}</span>
              ${prio ? html`<span class="todo-prio prio-${prio}">${PRIORITY_LABELS[prio] || prio}</span>` : ''}
            </div>`
          })}
        </div>`
      }
      return html`<div class="tool-output"></div>`
    }
    // 已完成但无文本输出：展示空态提示，避免展开后空白。
    if (this.state === 'completed') {
      return html`<div class="empty-output">（无输出）</div>`
    }
    return ''
  }
}
customElements.define('ai-tool-part', AiToolPart)
