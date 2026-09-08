/**
 * esc — Designer 内共享 HTML 转义（单一出口）
 *
 * 转引 cmx-data-comp page-helpers：esc/escHtml/escAttr 同为最严格五字符集合（& < > " '）。
 * 属性面板各文件的 esc() 调用点文本/属性上下文混用，超集语义替换安全（同治理清单 B-03 口径）。
 * 禁止再在各面板文件内联定义 esc / escAttr / escHtml（语义漂移源，见 20260827 治理清单 C-01）。
 */
export { escHtml, escHtml as esc, escAttr } from 'cmx-data-comp/lib/cmx-page-helpers.js'
