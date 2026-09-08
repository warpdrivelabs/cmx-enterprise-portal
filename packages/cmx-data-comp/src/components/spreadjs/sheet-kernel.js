/**
 * sheet-kernel.js —— <cmx-spreadjs-sheet> 内核择核开关（M6）。
 *
 * 电子表格组件有两套内核实现，共用同一标签 <cmx-spreadjs-sheet>（消费方零改）：
 *  - 'mega'（默认）：cmx-spreadjs-sheet-mega.js，内核自研 cmx-megasheet（零依赖，Apache-2.0）。
 *  - 'spreadjs'：cmx-spreadjs-sheet.js，内核 @mescius/spread-sheets（商业，回退用）。
 *
 * 择核优先级（先到先得）：
 *  ① 全局显式：globalThis.__CMX_SHEET_KERNEL__ === 'mega' | 'spreadjs'
 *  ② 本地开关：localStorage['__cmx_sheet_kernel__']（真机灰度/回退用，翻页不丢）
 *  ③ 默认：'mega'（M6 E2E 绿后翻默认到自研内核；要回退商业核设 localStorage['__cmx_sheet_kernel__']='spreadjs'）
 *
 * barrel（index.js）据此决定把哪个类导出为 CmxSpreadjsSheet 并注册到标签。
 */

export function resolveSheetKernel () {
  try {
    const g = (typeof globalThis !== 'undefined' && globalThis.__CMX_SHEET_KERNEL__) || null
    if (g === 'mega' || g === 'spreadjs') return g
  } catch (_) {}
  try {
    const ls = (typeof localStorage !== 'undefined' && localStorage.getItem('__cmx_sheet_kernel__')) || null
    if (ls === 'mega' || ls === 'spreadjs') return ls
  } catch (_) {}
  return 'mega'
}
