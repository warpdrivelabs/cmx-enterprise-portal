/**
 * Ignite UI — Combo Box、Drop Down 等输入类组件注册。
 * @see https://www.infragistics.com/products/ignite-ui-web-components
 */
import {
  defineComponents,
  IgcComboComponent,
  IgcDropdownComponent,
  IgcDropdownGroupComponent,
  IgcDropdownHeaderComponent,
  IgcDropdownItemComponent,
  IgcInputComponent,
} from 'igniteui-webcomponents'
import { ensureIgniteTheme } from './cmx-ignite-shared.js'

let _registered = false

/** 注册 Combo、Drop Down 及其子元素（幂等） */
export function registerIgniteInputs () {
  if (_registered) return
  ensureIgniteTheme()
  defineComponents(
    IgcComboComponent,
    IgcDropdownComponent,
    IgcDropdownGroupComponent,
    IgcDropdownHeaderComponent,
    IgcDropdownItemComponent,
    IgcInputComponent,
  )
  _registered = true
}

export {
  IgcComboComponent,
  IgcDropdownComponent,
  IgcDropdownGroupComponent,
  IgcDropdownHeaderComponent,
  IgcDropdownItemComponent,
  IgcInputComponent,
}
