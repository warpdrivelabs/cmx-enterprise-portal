/**
 * 标签分组元数据定义
 * 每个分组包含：id、显示名称、iconName（SAP UI 图标名）、描述、排序
 */
export const GROUPS = [
  {
    id: 'ui5',
    label: 'UI5标签',
    iconName: 'sap-ui5',
    description: 'SAP UI5 Web Components 标签',
    order: 2,
    collapsed: false,
  },
  {
    id: 'fiori',
    label: 'Fiori标签',
    iconName: 'business-objects-experience',
    description: 'SAP Fiori 专用标签',
    order: 3,
    collapsed: false,
  },
  {
    id: 'default',
    label: '默认标签',
    iconName: 'attachment-html',
    description: '标准 HTML 默认标签',
    order: 4,
    collapsed: false,
  },

];
