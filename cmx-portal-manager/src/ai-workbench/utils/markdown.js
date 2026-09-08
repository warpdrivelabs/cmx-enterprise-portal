/**
 * Markdown 渲染工具 —— markdown-it + Shiki 代码高亮。
 *
 * Shiki 是异步的（需加载语言 grammar），首次调用时初始化，之后缓存。
 * 提供 renderMarkdown(text) → Promise<html>。
 * 流式场景下前端组件用 debounce 避免每帧都跑高亮。
 */

import MarkdownIt from 'markdown-it'
import { createHighlighterCore } from 'shiki/core'

let md = null
let highlighterPromise = null
// 高亮器加载完成后缓存于此，供 fence 规则【同步】读取。
// 关键：不再 mutate 共享 md.options.highlight —— 流式 renderMarkdownSync 与完成时
// renderMarkdown 并发调用时，互相覆盖 options.highlight 会导致代码块间歇性丢失高亮。
// 改为 fence 规则直接读取此缓存（加载完成即命中，未完成回退纯文本），彻底消除竞态。
let cachedHighlighter = null

/**
 * 自定义 fence 渲染器：把代码块包成
 *   <div class="code-block" data-lang="javascript">
 *     <button class="code-copy">复制</button>
 *     <pre ...><code ...>...</code></pre>
 *   </div>
 * 高亮就绪时 token 为 Shiki 输出的 <pre>;未就绪时为默认转义的 <pre><code>。
 * 复制按钮的点击由 text-part 的事件委托处理(读相邻 pre 的 textContent)。
 */
function wrapCodeBlock (lang, highlighted) {
  const langLabel = lang || 'text'
  return `<div class="code-block" data-lang="${langLabel}">` +
    `<button class="code-copy" type="button" title="复制代码">复制</button>` +
    highlighted +
    `</div>`
}

/** markdown-it 实例（同步可用，代码高亮在 highlighter 就绪后异步替换）。 */
function getMd () {
  if (md) return md
  md = new MarkdownIt({
    html: false,
    linkify: true,
    // breaks: true —— 段落内单个换行渲染为 <br>。
    // AI 助手场景下，LLM 常用单换行排版（如命名空间树、逐行清单）而非严格 markdown 列表语法，
    // breaks:false 会把这些行折叠成一行导致排版错乱。代码块（fence/indented）不受影响，仍原样保留换行。
    breaks: true,
    typographer: false,
  })
  // 自定义 fence：始终包成带复制按钮+语言标签的容器
  // 高亮直接读 cachedHighlighter（同步），不再依赖会被并发覆盖的 md.options.highlight。
  md.renderer.rules.fence = (tokens, idx, _options, _env, _slf) => {
    const token = tokens[idx]
    const lang = token.info.trim()
    let highlighted = ''
    if (cachedHighlighter) {
      const language = normalizeLang(lang)
      try {
        if (cachedHighlighter.getLoadedLanguages().includes(language)) {
          highlighted = cachedHighlighter.codeToHtml(token.content, { lang: language, theme: 'OpenCode' })
        }
      } catch { /* 高亮失败回退纯文本 */ }
    }
    if (!highlighted) {
      // 默认转义
      const esc = md.utils.escapeHtml(token.content)
      const langClass = lang ? ` class="language-${md.utils.escapeHtml(lang)}"` : ''
      highlighted = `<pre class="shiki"><code${langClass}>${esc}</code></pre>`
    }
    return wrapCodeBlock(lang, highlighted) + '\n'
  }
  return md
}

/**
 * 懒加载 Shiki highlighter（只注册常用语言，减小体积）。
 * 用 core API 避免拉入全量语言 bundle。
 */
/**
 * opencode 自定义 shiki 主题 "OpenCode"(对齐 marked.tsx OpenCodeTheme)。
 * 所有颜色用 CSS 变量(--oc-syntax-xxx / --oc-code-xxx),跟随明暗主题切换,
 * 浅色主题下代码块是浅色背景,深色主题下才是深色 —— 不再固定深色背景。
 * 变量定义在 shared-styles.js 的 :host 上,shadow DOM 内的内联 style 可解析。
 */
const OPENCODE_THEME = {
  name: 'OpenCode',
  bg: 'var(--oc-code-bg)',
  fg: 'var(--oc-code-fg)',
  colors: {
    'editor.background': 'var(--oc-code-bg)',
    'editor.foreground': 'var(--oc-code-fg)',
  },
  tokenColors: [
    { scope: ['comment', 'punctuation.definition.comment', 'string.comment'], settings: { foreground: 'var(--oc-syntax-comment)' } },
    { scope: ['string'], settings: { foreground: 'var(--oc-syntax-string)' } },
    { scope: ['constant.numeric', 'constant.language', 'constant'], settings: { foreground: 'var(--oc-syntax-constant)' } },
    { scope: ['keyword', 'storage', 'storage.type', 'variable.language', 'keyword.control'], settings: { foreground: 'var(--oc-syntax-keyword)' } },
    { scope: ['keyword.operator', 'keyword.operator.assignment', 'punctuation.separator'], settings: { foreground: 'var(--oc-syntax-operator)' } },
    { scope: ['entity.name.function', 'support.function'], settings: { foreground: 'var(--oc-syntax-primitive)' } },
    { scope: ['support.type.primitive', 'support.class', 'entity.name.type', 'entity.name.class'], settings: { foreground: 'var(--oc-syntax-type)' } },
    { scope: ['entity.other.inherited-class', 'entity.name.type.class'], settings: { foreground: 'var(--oc-syntax-type)' } },
    { scope: ['variable', 'meta.definition.variable'], settings: { foreground: 'var(--oc-syntax-variable)' } },
    { scope: ['variable.parameter', 'meta.block', 'meta.template.expression'], settings: { foreground: 'var(--oc-syntax-punctuation)' } },
    { scope: ['entity.other.attribute-name', 'meta.object-literal.key', 'meta.object.member'], settings: { foreground: 'var(--oc-syntax-property)' } },
    { scope: ['entity.name.tag', 'entity.name.section'], settings: { foreground: 'var(--oc-syntax-primitive)' } },
    { scope: ['markup.heading', 'markup.bold'], settings: { foreground: 'var(--oc-syntax-keyword)' } },
    { scope: ['markup.italic'], settings: { foreground: 'var(--oc-syntax-info)' } },
    { scope: ['punctuation'], settings: { foreground: 'var(--oc-syntax-punctuation)' } },
  ],
}

async function getHighlighter () {
  if (highlighterPromise) return highlighterPromise
  highlighterPromise = (async () => {
    const [
      { createOnigurumaEngine },
      htmlWasm,
      jsWasm,
      tsWasm,
      jsonWasm,
      cssWasm,
      bashWasm,
      xmlWasm,
      rustWasm,
      pythonWasm,
      yamlWasm,
      mdWasm,
    ] = await Promise.all([
      import('shiki/engine/oniguruma'),
      import('shiki/langs/html.mjs'),
      import('shiki/langs/javascript.mjs'),
      import('shiki/langs/typescript.mjs'),
      import('shiki/langs/json.mjs'),
      import('shiki/langs/css.mjs'),
      import('shiki/langs/bash.mjs'),
      import('shiki/langs/xml.mjs'),
      import('shiki/langs/rust.mjs'),
      import('shiki/langs/python.mjs'),
      import('shiki/langs/yaml.mjs'),
      import('shiki/langs/markdown.mjs'),
    ])
    return createHighlighterCore({
      themes: [OPENCODE_THEME],
      langs: [
        htmlWasm.default, jsWasm.default, tsWasm.default, jsonWasm.default,
        cssWasm.default, bashWasm.default, xmlWasm.default, rustWasm.default,
        pythonWasm.default, yamlWasm.default, mdWasm.default,
      ],
      engine: createOnigurumaEngine(import('shiki/wasm')),
    }).then((hl) => {
      // 加载完成后缓存，fence 规则即同步命中，无需再 mutate md.options.highlight。
      cachedHighlighter = hl
      return hl
    })
  })()
  return highlighterPromise
}

/**
 * 高亮单段代码（共享上面的 highlighter，markdown 与工具卡片复用同一实例）。
 * 返回 shiki 输出的 <pre>...</pre> HTML；无法高亮时返回 null（调用方回退纯文本）。
 */
export async function highlightCode (code, lang) {
  if (!code) return null
  try {
    const hl = await getHighlighter()
    const language = normalizeLang(lang)
    if (language && hl.getLoadedLanguages().includes(language)) {
      return hl.codeToHtml(code, { lang: language, theme: 'OpenCode' })
    }
  } catch (e) {
    console.warn('[markdown] highlightCode 失败，回退纯文本', e)
  }
  return null
}

/**
 * 同步渲染 markdown（不含代码高亮，代码块用占位 class）。
 * 用于流式过程中快速预览，高亮在 idle 时异步补全。
 * 注：fence 规则读 cachedHighlighter；高亮器未就绪时自动回退纯文本，无竞态。
 */
export function renderMarkdownSync (text) {
  if (!text) return ''
  return getMd().render(text)
}

/**
 * 异步渲染 markdown（含 Shiki 代码高亮）。
 * 确保 highlighter 就绪（写入 cachedHighlighter）后再 render，使 fence 命中高亮。
 * 高亮失败时回退到纯文本（不阻塞渲染）。
 */
export async function renderMarkdown (text) {
  if (!text) return ''
  try { await getHighlighter() }
  catch (e) { console.warn('[markdown] Shiki 初始化失败，回退纯文本代码块', e) }
  return getMd().render(text)
}

/** 语言别名归一化（也按文件扩展名识别）。 */
export function normalizeLang (lang) {
  const l = (lang || '').toLowerCase().trim()
  const alias = {
    js: 'javascript', mjs: 'javascript', cjs: 'javascript',
    ts: 'typescript', mts: 'typescript', cts: 'typescript',
    sh: 'bash', shell: 'bash', zsh: 'bash',
    py: 'python', rb: 'ruby',
    yml: 'yaml', toml: 'toml',
    html: 'html', htm: 'html', xml: 'xml', svg: 'xml',
    rs: 'rust', go: 'go',
    md: 'markdown', markdown: 'markdown',
  }
  return alias[l] || l || 'text'
}

/** 按文件路径/文件名推断语言（用于 read/write/edit 工具卡片高亮）。 */
export function langFromPath (p) {
  if (!p) return ''
  const base = String(p).replace(/\\/g, '/').split('/').pop() || ''
  const m = base.match(/\.([a-z0-9]+)$/i)
  if (!m) return ''
  return normalizeLang(m[1])
}
