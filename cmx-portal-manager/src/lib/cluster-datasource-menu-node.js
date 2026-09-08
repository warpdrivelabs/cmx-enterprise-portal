/**
 * 集群数据源浏览 —— workspace-node 菜单节点（借鉴 dam-registry-menu-node.js）。
 *
 * 一个 native_page（portal.datasource.cluster）经 view 名分派到三区：
 *   explorer → DAM 下拉 + 数据库列表 + 数据库属性（只读）
 *   content  → 三个 tab：数据字典 / 业务单据 / 弹性组合（各含标题区档案+版本下拉，只读展示）
 *   property → 三个 tab：与 content 一一对应的只读详情检查器（同 data-bus-scope 联动）
 */
import { deepClone } from 'cmx-data-comp/lib/cmx-deep-clone.js'

export const PORTAL_CLUSTER_DATASOURCE_MENU_NODE = Object.freeze({
  id: 'portal-cluster-datasource',
  name: 'cluster-datasource',
  caption: '集群数据源浏览',
  type: 'workspace-node',
  permissionId: null,
  icon: 'database',
  workspace: {
    explorer: {
      caption: '数据源',
      icon: 'database',
      views: [
        {
          tabLabel: '数据源',
          icon: 'database',
          type: 'native_pages',
          native_page: 'portal.datasource.cluster',
          view: 'explorer',
          props: {},
        },
      ],
    },
    content: {
      caption: '集群数据源浏览',
      icon: 'database',
      views: [
        {
          tabLabel: '概览',
          icon: 'business-objects-experience',
          type: 'native_pages',
          native_page: 'portal.datasource.cluster',
          view: 'content-overview',
          hideProperty: true,
          props: {},
        },
        {
          tabLabel: '数据字典',
          icon: 'dimension',
          type: 'native_pages',
          native_page: 'portal.datasource.cluster',
          view: 'content-dct',
          syncPropertyView: 'property-dct',
          props: {},
        },
        {
          tabLabel: '业务单据',
          icon: 'document-text',
          type: 'native_pages',
          native_page: 'portal.datasource.cluster',
          view: 'content-doc',
          syncPropertyView: 'property-doc',
          props: {},
        },
        {
          tabLabel: '弹性组合',
          icon: 'tree',
          type: 'native_pages',
          native_page: 'portal.datasource.cluster',
          view: 'content-profile',
          syncPropertyView: 'property-profile',
          props: {},
        },
      ],
    },
    property: {
      caption: '详情',
      icon: 'detail-view',
      views: [
        {
          id: 'property-dct',
          tabLabel: '数据字典',
          icon: 'dimension',
          type: 'native_pages',
          native_page: 'portal.datasource.cluster',
          view: 'property-dct',
          props: {},
        },
        {
          id: 'property-doc',
          tabLabel: '业务单据',
          icon: 'document-text',
          type: 'native_pages',
          native_page: 'portal.datasource.cluster',
          view: 'property-doc',
          props: {},
        },
        {
          id: 'property-profile',
          tabLabel: '弹性组合',
          icon: 'tree',
          type: 'native_pages',
          native_page: 'portal.datasource.cluster',
          view: 'property-profile',
          props: {},
        },
      ],
    },
  },
})

export function createPortalClusterDatasourceMenuNode () {
  return deepClone(PORTAL_CLUSTER_DATASOURCE_MENU_NODE)
}
