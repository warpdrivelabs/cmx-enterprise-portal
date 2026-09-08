/**
 * Ignite UI for Web Components — 注册入口 + cmx-ignite-* 封装组件。
 *
 * 用法：
 *   import { registerIgniteComponents, CmxIgniteGrid } from 'cmx-data-comp/components/ignite/index.js'
 *   registerIgniteComponents()
 */
export {
  registerIgniteInputs,
  IgcComboComponent,
  IgcDropdownComponent,
  IgcDropdownGroupComponent,
  IgcDropdownHeaderComponent,
  IgcDropdownItemComponent,
  IgcInputComponent,
} from './register-inputs.js'

export {
  registerIgniteLists,
  IgcListComponent,
  IgcListHeaderComponent,
  IgcListItemComponent,
} from './register-lists.js'

export {
  registerIgniteGrids,
  IgcGridComponent,
  IgcTreeGridComponent,
  IgcHierarchicalGridComponent,
  IgcPivotGridComponent,
  IgcColumnComponent,
  IgcColumnGroupComponent,
  IgcColumnLayoutComponent,
  IgcPaginatorComponent,
  IgcActionStripComponent,
} from './register-grids.js'

export {
  registerIgniteGauges,
  IgcBulletGraphComponent,
  IgcLinearGaugeComponent,
  IgcRadialGaugeComponent,
} from './register-gauges.js'

export { CmxIgniteGrid } from './cmx-ignite-grid.js'
export { CmxIgniteInput } from './cmx-ignite-input.js'
export { CmxIgniteCombo } from './cmx-ignite-combo.js'
export { CmxIgniteList } from './cmx-ignite-list.js'
export { CmxIgniteGauge } from './cmx-ignite-gauge.js'

/* 开源组件薄封装工厂 + 批量注册（cmx-ignite-* 全组件） */
export { defineThinIgnite, igcEventToCmx } from './cmx-ignite-factory.js'
export { registerCmxIgniteThin, THIN_SPECS } from './cmx-ignite-thin.js'

import { registerIgniteInputs } from './register-inputs.js'
import { registerIgniteLists } from './register-lists.js'
import { registerIgniteGrids } from './register-grids.js'
import { registerIgniteGauges } from './register-gauges.js'

/** 注册全部 Ignite 原生组件（幂等） */
export function registerIgniteComponents (opts = {}) {
  const {
    inputs = true,
    lists = true,
    grids = true,
    gauges = true,
  } = opts

  if (inputs) registerIgniteInputs()
  if (lists) registerIgniteLists()
  if (grids) registerIgniteGrids()
  if (gauges) registerIgniteGauges()
}

/** 注册 Ignite 原生组件 + 全部 cmx-ignite-* 自定义元素 */
export function registerCmxIgniteComponents (opts = {}) {
  registerIgniteComponents(opts)
  import('./cmx-ignite-grid.js')
  import('./cmx-ignite-input.js')
  import('./cmx-ignite-combo.js')
  import('./cmx-ignite-list.js')
  import('./cmx-ignite-gauge.js')
}
