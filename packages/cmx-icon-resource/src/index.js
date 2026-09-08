/**
 * cmx-icon-resource — 图标资源入口
 *
 * UI5 用法（推荐，与 SAP Icons 一样写 name 字符串）：
 *   import { installTablerUi5Icons } from 'cmx-icon-resource/ui5'
 *   await installTablerUi5Icons()
 *   // <ui5-icon name="tabler-outline/home"></ui5-icon>
 *
 * 静态资源 import：
 *   import homeUrl from 'tabler/outline/home.svg'
 */

export {
  installTablerUi5Icons,
  ensureTablerUi5Icon,
  loadTablerSvg,
  applyTablerSvgToUi5Icon,
  parseTablerIconName,
  formatTablerUi5IconName,
} from './ui5/index.js'

/** Tabler 图标子集 */
export const TABLER_VARIANTS = ['filled', 'outline']

/**
 * Tabler SVG 文件 import 路径（不含查询参数）。
 * @param {'filled'|'outline'} variant
 * @param {string} name 文件名，不含 .svg
 */
export function tablerIconPath(variant, name) {
  return `tabler/${variant}/${name}.svg`
}
