/**
 * 「设置」工作区菜单节点（占位骨架）。
 *
 * 原 shellbar「设置」走 findActivityIdByMenuPage('setting-menu')，但 activities 全 DAM 派生后
 * 已无 setting-menu 条目（死代码）。本次改为 openWorkspaceNode 打开此节点，与 _openDamRegistryCenter
 * / _openHelpCenter 同链路。当前为占位 view，后续接入真实设置页（native_pages/html_pages）。
 */
import { deepClone } from 'cmx-data-comp/lib/cmx-deep-clone.js'

export const PORTAL_SETTINGS_MENU_NODE = Object.freeze({
  id: 'portal-settings',
  name: 'settings',
  caption: '设置',
  type: 'workspace-node',
  permissionId: null,
  icon: 'settings',
  workspace: {
    content: {
      caption: '设置',
      icon: 'settings',
      views: [
        {
          tabLabel: '设置',
          icon: 'settings',
          type: 'placeholder',
          data: { title: '设置' },
        },
      ],
    },
  },
})

export function createPortalSettingsMenuNode () {
  return deepClone(PORTAL_SETTINGS_MENU_NODE)
}
