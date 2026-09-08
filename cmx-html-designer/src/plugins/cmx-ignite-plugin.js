/**
 * cmx-ignite-plugin — Ignite 组件注册到设计器调色板
 *
 * 组件：
 *   <cmx-ignite-combo> — Ignite igc-combo 封装，绑定 CmxDataSet 当前行字段
 *   <cmx-ignite-list>  — Ignite igc-list 封装，绑定 CmxDataSet 行列表
 *   <cmx-spreadsheet>  — Ignite igc-spreadsheet 封装，Excel 式电子表格（报表表样）
 *   <cmx-spreadjs-sheet> — SpreadJS 电子表格封装（报表表样）
 *
 * 配置通过 data-cmx-* attribute 存储，运行时由组件 connectedCallback 读取。
 */
import { definePlugin } from '../lib/plugin-registry.js'

import 'cmx-data-comp/components/ignite/cmx-ignite-combo.js'
import 'cmx-data-comp/components/ignite/cmx-ignite-list.js'
import 'cmx-data-comp/components/ignite/cmx-spreadsheet.js'

definePlugin({
  id: 'cmx-ignite',
  groups: [{ id: 'cmx-ignite', label: 'Ignite 组件', icon: 'flame', order: 1.5, collapsed: false }],
  components: [
    {
      tag: 'cmx-ignite-combo',
      group: 'cmx-ignite',
      label: '<cmx-ignite-combo>',
      description: 'Ignite igc-combo 封装：绑定 CmxDataSet 当前行字段；亦可作为 cmx-ui5-form / cmx-revo-grid 的字段编辑器（editMode=ignite-combo）',
      canNest: false,
      isVoid: true,
      extraEvents: [
        'cmx-value-changed',
      ],
      attrs: [
        { name: 'data-cmx-field',  label: 'field (JSON)',  type: 'text',
          placeholder: '{"key":"status","label":"状态","options":[{"value":"A","label":"启用"}]}' },
        { name: 'data-cmx-items',  label: 'items (JSON 数组)', type: 'text',
          placeholder: '[{"value":"A","label":"启用"},{"value":"B","label":"停用"}]' },
        { name: 'data-cmx-row',    label: 'row（初始数据，JSON）', type: 'text',
          placeholder: '{"status":"A"}' },
      ],
      defaults: {
        attributes: {
          style: 'display:block;width:100%;',
        },
      },
      styleGroups: ['layout', 'flex', 'box', 'position'],
    },
    {
      tag: 'cmx-ignite-list',
      group: 'cmx-ignite',
      label: '<cmx-ignite-list>',
      description: '行列表：默认 igc-list；data-cmx-layout="card" 为卡片 DOM，外观由 data-cmx-style-id 指向的页面 <template> 注入',
      canNest: false,
      isVoid: true,
      extraEvents: [
        'cmx-row-selected',
        'cmx-item-selected',
      ],
      attrs: [
        { name: 'data-cmx-items',   label: 'items (JSON 数组)', type: 'text',
          placeholder: '[{"id":"1","title":"标题","subtitle":"副标题"}]' },
        { name: 'data-cmx-rows',    label: 'rows (JSON 数组，静态本地数据)', type: 'text',
          placeholder: '[{"id":"r1","title":"订单1"}]' },
        { name: 'data-cmx-options', label: 'options (JSON：titleKey / subtitleKey)', type: 'text',
          placeholder: '{"titleKey":"title","subtitleKey":"subtitle"}' },
        { name: 'data-cmx-layout', label: 'layout（card | 空=igc-list）', type: 'text', placeholder: 'card' },
        { name: 'data-cmx-style-id', label: 'style-id（同页 template 元素 id，注入列表皮肤 CSS）', type: 'text',
          placeholder: 'my-list-skin' },
        { name: 'data-cmx-density', label: 'density（compact）', type: 'text', placeholder: 'compact' },
      ],
      defaults: {
        attributes: {
          style: 'display:block;width:100%;',
        },
      },
      styleGroups: ['layout', 'flex', 'box', 'position'],
    },
    {
      tag: 'cmx-spreadsheet',
      group: 'cmx-ignite',
      label: '<cmx-spreadsheet>',
      description: 'Ignite igc-spreadsheet 封装：Excel 式电子表格，原生合并格/公式栏/单元格样式。用 data-cmx-report（{grid,cells}）驱动表样，或运行时调 setReportModel/setWorkbook。报表表样渲染专用。',
      canNest: false,
      isVoid: true,
      extraEvents: [
        'cmx-cell-selected',
      ],
      attrs: [
        { name: 'data-cmx-report', label: 'report (JSON：{grid,cells,meta})', type: 'text',
          placeholder: '{"grid":{"rows":12,"cols":6,"merges":["A1:F1"],"colWidths":{"A":220}},"cells":{"A1":{"type":"text","value":"资产负债表","class":"title"}}}' },
        { name: 'data-cmx-formula-bar', label: 'formula-bar（true|false，显示公式栏）', type: 'text', placeholder: 'true' },
      ],
      defaults: {
        attributes: {
          style: 'display:block;width:100%;height:480px;',
        },
      },
      styleGroups: ['layout', 'flex', 'box', 'position'],
    },
    {
      tag: 'cmx-spreadjs-sheet',
      group: 'cmx-ignite',
      label: '<cmx-spreadjs-sheet>',
      description: 'SpreadJS 电子表格封装：Excel 式单元格表样，支持 data-cmx-report（{grid,cells}）驱动报表模板，API/事件对齐 cmx-spreadsheet。',
      canNest: false,
      isVoid: true,
      extraEvents: [
        'cmx-cell-selected',
        'cmx-cell-edited',
        'cmx-sheet-changed',
      ],
      attrs: [
        { name: 'data-cmx-report', label: 'report (JSON：{grid,cells,meta})', type: 'text',
          placeholder: '{"grid":{"rows":12,"cols":6,"merges":["A1:F1"],"colWidths":{"A":220}},"cells":{"A1":{"type":"text","value":"资产负债表","class":"title"}}}' },
        { name: 'data-cmx-formula-bar', label: 'formula-bar（true|false，显示公式栏）', type: 'text', placeholder: 'true' },
      ],
      defaults: {
        attributes: {
          style: 'display:block;width:100%;height:480px;',
        },
      },
      styleGroups: ['layout', 'flex', 'box', 'position'],
    },
  ],
})
