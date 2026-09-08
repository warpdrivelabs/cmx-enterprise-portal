/**
 * Ignite UI — Radial / Linear Gauge、Bullet Graph 注册。
 * 依赖 `igniteui-webcomponents-gauges` 与 `igniteui-webcomponents-core`（商业许可）。
 */
import {
  IgcBulletGraphModule,
  IgcLinearGaugeModule,
  IgcRadialGaugeModule,
  IgcBulletGraphComponent,
  IgcLinearGaugeComponent,
  IgcRadialGaugeComponent,
} from '@infragistics/igniteui-webcomponents-gauges'

let _registered = false

/** 注册三种 Gauge 模块（幂等） */
export function registerIgniteGauges () {
  if (_registered) return
  IgcRadialGaugeModule.register()
  IgcLinearGaugeModule.register()
  IgcBulletGraphModule.register()
  _registered = true
}

export {
  IgcBulletGraphComponent,
  IgcLinearGaugeComponent,
  IgcRadialGaugeComponent,
  IgcBulletGraphModule,
  IgcLinearGaugeModule,
  IgcRadialGaugeModule,
}
