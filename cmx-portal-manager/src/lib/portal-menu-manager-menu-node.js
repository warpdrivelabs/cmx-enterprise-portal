/**
 * 「菜单管理」内置菜单节点 -- 两段式工作区：
 *   explorer 区 → <portal-menu-tree>（menu_tree 视图类型）：DAM 三联选择 + 菜单树 + 拖拽换父。
 *   content  区 → <portal-menu-editor>（menu_editor 视图类型）：选中节点的表单编辑 / 新增 / 删除。
 * 二者经模块单例总线 `menu-manager-bus.js` 通信。
 * 由 shellbar「菜单管理」按钮经 Workspace.openWorkspaceNode 打开。
 */
import { deepClone } from 'cmx-data-comp/lib/cmx-deep-clone.js'

export const PORTAL_MENU_MANAGER_MENU_NODE = Object.freeze({
  id: 'portal-menu-manager',
  name: 'menu-manager',
  caption: '菜单管理',
  type: 'workspace-node',
  permissionId: null,
  icon: 'tree',
  workspace: {
    explorer: {
      caption: '菜单树',
      icon: 'tree',
      views: [
        {
          tabLabel: '菜单树',
          icon: 'tree',
          type: 'menu_tree',
        },
      ],
    },
    content: {
      caption: '菜单管理',
      icon: 'menu2',
      views: [
        {
          tabLabel: '节点编辑',
          icon: 'edit',
          type: 'menu_editor',
        },
      ],
    },
  },
})

export function createPortalMenuManagerMenuNode () {
  return deepClone(PORTAL_MENU_MANAGER_MENU_NODE)
}
