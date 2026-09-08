import { deepClone } from 'cmx-data-comp/lib/cmx-deep-clone.js'

export const PORTAL_DAM_REGISTRY_MENU_NODE = Object.freeze({
  id: 'portal-dam-registry',
  name: 'dam-registry',
  caption: 'DAM 注册管理中心',
  type: 'workspace-node',
  permissionId: null,
  icon: 'tree',
  workspace: {
    explorer: {
      caption: 'DAM 导航',
      icon: 'tree',
      views: [
        {
          tabLabel: 'DAM',
          icon: 'tree',
          type: 'native_pages',
          native_page: 'portal.dam.registry-center',
          view: 'explorer',
          props: {},
        },
      ],
    },
    content: {
      caption: 'DAM 注册管理中心',
      icon: 'tree',
      views: [
        {
          tabLabel: '注册中心',
          icon: 'tree',
          type: 'native_pages',
          native_page: 'portal.dam.registry-center',
          view: 'manager',
          props: {},
        },
      ],
    },
    property: {
      caption: '资源',
      icon: 'documents',
      views: [
        {
          tabLabel: '资源',
          icon: 'documents',
          type: 'native_pages',
          native_page: 'portal.dam.registry-center',
          view: 'property',
          props: {},
        },
      ],
    },
  },
})

export function createPortalDamRegistryMenuNode () {
  return deepClone(PORTAL_DAM_REGISTRY_MENU_NODE)
}
