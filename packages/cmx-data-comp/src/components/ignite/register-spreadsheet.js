/**
 * Ignite UI — Spreadsheet 注册（商业许可 igniteui-webcomponents-spreadsheet）。
 * 依赖 excel（Workbook 数据模型）+ spreadsheet（igc-spreadsheet 视图）+ core（ModuleManager）。
 *
 * 与 register-grids.js 的 defineComponents 不同：spreadsheet 走 core 的 ModuleManager.register。
 * 关键：注册 IgcSpreadsheetCoreModule 才会定义 <igc-spreadsheet> 自定义元素（它内部调
 * IgcSpreadsheetComponent.register + IgcExcelCoreModule）；IgcSpreadsheetModule 再补齐
 * Excel 完整功能（xls/xlsx/functions）+ shapes + 渲染容器。两者都要。
 */
import { ModuleManager } from '@infragistics/igniteui-webcomponents-core'
import {
  IgcSpreadsheetCoreModule,
  IgcSpreadsheetModule,
} from '@infragistics/igniteui-webcomponents-spreadsheet'

let _registered = false

/** 注册 Spreadsheet 所需模块（幂等）。 */
export function registerIgniteSpreadsheet () {
  if (_registered) return
  ModuleManager.register(IgcSpreadsheetCoreModule, IgcSpreadsheetModule)
  _registered = true
}
