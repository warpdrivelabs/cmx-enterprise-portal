/**
 * Ignite UI — Data Grid / Tree Grid / Hierarchical Grid / Pivot Grid 注册。
 * 依赖 `igniteui-webcomponents-grids`（商业许可）。
 */
import {
  defineComponents,
  IgcActionStripComponent,
  IgcColumnComponent,
  IgcColumnGroupComponent,
  IgcColumnLayoutComponent,
  IgcGridComponent,
  IgcHierarchicalGridComponent,
  IgcPaginatorComponent,
  IgcPivotGridComponent,
  IgcTreeGridComponent,
} from '@infragistics/igniteui-webcomponents-grids'

let _registered = false

/** 注册常用 Grid 族组件及列、分页、操作条（幂等） */
export function registerIgniteGrids () {
  if (_registered) return
  defineComponents(
    IgcGridComponent,
    IgcTreeGridComponent,
    IgcHierarchicalGridComponent,
    IgcPivotGridComponent,
    IgcColumnComponent,
    IgcColumnGroupComponent,
    IgcColumnLayoutComponent,
    IgcPaginatorComponent,
    IgcActionStripComponent,
  )
  _registered = true
}

export {
  IgcGridComponent,
  IgcTreeGridComponent,
  IgcHierarchicalGridComponent,
  IgcPivotGridComponent,
  IgcColumnComponent,
  IgcColumnGroupComponent,
  IgcColumnLayoutComponent,
  IgcPaginatorComponent,
  IgcActionStripComponent,
}
