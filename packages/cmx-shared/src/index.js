/**
 * cmx-shared barrel：import 即完成 `globalThis.cmx.{domain}` 全域装配（副作用注册）。
 *
 * 新增工具域：实现 `src/<domain>.js`（文件尾 `registerShared(domain, api)`）+ 在此加一行
 * 副作用 import + 按需 re-export（供组件库 / 宿主源码具名 import，资产页仍走全局）。
 */
import './datetime.js'

export { registerShared } from './core.js'
export { cmxDatetime } from './datetime.js'
