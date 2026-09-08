import { deepClone } from 'cmx-data-comp/lib/cmx-deep-clone.js'

// 帮助中心菜单节点（借鉴 dam-registry-menu-node.js）。
//
// 与 DAM 注册中心同构：同一个 native_page(`portal.help.center`) 的三个 view
// 分别挂到 workspace 的 explorer / content / property 三区，页面内共享 state 联动。
export const PORTAL_HELP_CENTER_MENU_NODE = Object.freeze({
  id: 'portal-help-center',
  name: 'help-center',
  caption: '帮助中心',
  type: 'workspace-node',
  permissionId: null,
  icon: 'sys-help',
  workspace: {
    explorer: {
      caption: '帮助目录',
      icon: 'tree',
      views: [
        {
          tabLabel: '目录',
          icon: 'tree',
          type: 'native_pages',
          native_page: 'portal.help.center',
          view: 'explorer',
          props: {},
        },
      ],
    },
    content: {
      caption: '帮助中心',
      icon: 'sys-help',
      views: [
        {
          tabLabel: '详细内容',
          icon: 'sys-help',
          type: 'native_pages',
          native_page: 'portal.help.center',
          view: 'content',
          props: {},
        },
      ],
    },
    property: {
      caption: '样例 / 示例',
      icon: 'example',
      views: [
        {
          tabLabel: '样例',
          icon: 'example',
          type: 'native_pages',
          native_page: 'portal.help.center',
          view: 'property',
          props: {},
        },
      ],
    },
  },
})

export function createPortalHelpCenterMenuNode () {
  return deepClone(PORTAL_HELP_CENTER_MENU_NODE)
}
