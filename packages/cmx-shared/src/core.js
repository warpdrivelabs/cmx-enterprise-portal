/**
 * cmx-shared —— CMX 平台共享纯工具域注册中心。
 *
 * 运行时统一命名空间：`globalThis.cmx.{domain}`（如 `cmx.datetime`，后续 `cmx.esc`、
 * `cmx.format`… 各成一个域）。宿主入口（CMXPortalManager / CMXHTMLDesigner）只需
 * `await import('cmx-shared')` 一行——本包 import 副作用自挂全局，无需宿主再赋值。
 *
 * 为什么走全局命名空间：native-pages / html-pages 是资产文本，宿主经 Blob URL 动态
 * import 执行（无模块解析能力，页面内静态/相对 import 均不可用），全局对象是资产页
 * 取用共享代码的唯一通路（`__cmxDataComp` 同理——但它承载组件库 API 面，纯工具不进）。
 *
 * 扩展新工具域：包内新增 `src/<domain>.js`（实现 + 文件尾 `registerShared(domain, api)`），
 * 再在 `src/index.js` 加一行副作用 import 即可，宿主零改动。
 *
 * 命名空间常量：如需全局改名（如 `_shared`），只改 NAMESPACE 一处 + 本注释。
 */

const NAMESPACE = 'cmx'

/**
 * 注册一个工具域到 `globalThis[NAMESPACE][domain]`。
 * 幂等：同名域已注册时直接返回既有对象（防 HMR / 双入口重复装配）。
 *
 * @param {string} domain 域名（如 'datetime'）
 * @param {object} api 域 API 对象（纯函数集合，禁止持有 UI / 组件实例）
 * @returns {object} 生效的域 API
 */
export function registerShared (domain, api) {
  if (typeof globalThis === 'undefined') return api
  const root = globalThis[NAMESPACE] || (globalThis[NAMESPACE] = {})
  if (root[domain]) return root[domain]
  root[domain] = api
  return api
}
