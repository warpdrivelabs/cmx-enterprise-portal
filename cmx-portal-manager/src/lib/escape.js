/**
 * 统一的 HTML / 属性转义工具（单一出口）——转引 cmx-data-comp page-helpers 共享真源。
 *
 * esc/escHtml/escAttr/escAttrHtml 同为最严格五字符集合（& < > " '）：
 * - escHtml：文本节点上下文；
 * - escAttr / escAttrHtml：属性上下文（含单双引号防御）。
 * 旧三分化语义（escHtml 不转引号等）已废弃——超集集合在任何上下文都安全（治理清单 C-01/B-03 口径）。
 * 禁止再在组件内内联定义 esc 变体（语义漂移源）。
 */
export { escHtml, escAttr, escHtml as escAttrHtml } from 'cmx-data-comp/lib/cmx-page-helpers.js'
