/**
 * Ignite UI — List 列表组件注册。
 */
import {
  defineComponents,
  IgcListComponent,
  IgcListHeaderComponent,
  IgcListItemComponent,
} from 'igniteui-webcomponents'
import { ensureIgniteTheme } from './cmx-ignite-shared.js'

let _registered = false

/** 注册 List / ListHeader / ListItem（幂等） */
export function registerIgniteLists () {
  if (_registered) return
  ensureIgniteTheme()
  defineComponents(
    IgcListComponent,
    IgcListHeaderComponent,
    IgcListItemComponent,
  )
  _registered = true
}

export {
  IgcListComponent,
  IgcListHeaderComponent,
  IgcListItemComponent,
}
