/**
 * cmx-models-plugin — 调色板 CMX 模型分组
 *
 * 注册不可视数据层类到调色板（modelOnly:true，只能拖到 Models 面板）。
 * 运行时类统一来自 cmx-data-comp 工程。
 */
import { definePlugin } from '../lib/plugin-registry.js'
/* 整 barrel 挂全局：与门户 import-ui5-and-app.js 同契约（治理清单 B-02）——此前手挑 11 个成员，
   barrel 每新增导出都要手工同步，且同一原生页面在两端取到的 __cmxDataComp 能力边界不一致。
   可视组件 cmx-data-plugin 已全量副作用引入，整 barrel 的边际体积可忽略。 */
import * as cmxDataComp from 'cmx-data-comp'
import { initPageModels } from 'cmx-data-comp/lib/init-page-models.js'
/* 共享纯工具域注册中心：与门户同契约（import 副作用自挂 globalThis.cmx.{domain}） */
import 'cmx-shared'

/** 供 pageFns / 调试控制台使用的设计时模型类引用（与门户运行时同一份、同一形态） */
if (typeof globalThis !== 'undefined') {
  globalThis.__cmxDataComp = cmxDataComp
  globalThis.__cmxInitPageModels = initPageModels
}

definePlugin({
  id: 'cmx-models',
  groups: [{
    id:        'cmx-models',
    label:     'CMX 模型',
    icon:      'database',
    order:     0,
    collapsed: false,
  }],
  components: [
    {
      tag:         'CmxDataSet',
      group:       'cmx-models',
      label:       'CmxDataSet',
      description: '多级树形数据集（cmx-data-comp）',
      modelOnly:   true,
      isVoid:      true,
      canNest:     false,
      attrs:       [],
      styleGroups: [],
    },
    {
      tag:         'CmxMasterSlave',
      group:       'cmx-models',
      label:       'CmxMasterSlave',
      description: '主从协调器（cmx-data-comp）',
      modelOnly:   true,
      isVoid:      true,
      canNest:     false,
      attrs:       [],
      styleGroups: [],
    },
    {
      tag:         'CmxColumnModel',
      group:       'cmx-models',
      label:       'CmxColumnModel',
      description: '列模型，定义 cmx-revo-grid 列结构（cmx-data-comp）',
      modelOnly:   true,
      isVoid:      true,
      canNest:     false,
      attrs:       [],
      styleGroups: [],
    },
    {
      tag:         'CmxDCTMeta',
      group:       'cmx-models',
      label:       'CmxDCTMeta',
      description: '数据字典元数据模型：按 dictCode 加载单张字典表与共享 fieldSets（cmx-data-comp）',
      modelOnly:   true,
      isVoid:      true,
      canNest:     false,
      attrs:       [],
      styleGroups: [],
    },
    {
      tag:         'CmxDOCMeta',
      group:       'cmx-models',
      label:       'CmxDOCMeta',
      description: '业务单据元数据模型：加载 voucherTables 与共享 fieldSets（cmx-data-comp）',
      modelOnly:   true,
      isVoid:      true,
      canNest:     false,
      attrs:       [],
      styleGroups: [],
    },
    {
      tag:         'FlexibleCombination',
      group:       'cmx-models',
      label:       '弹性组合',
      description: '弹性组合：按业务场景从后端取规则，按锚点动态改写目标列模型（CmxColumnModel）的列',
      modelOnly:   true,
      isVoid:      true,
      canNest:     false,
      attrs:       [],
      styleGroups: [],
    },
  ],
  customInspectors: {},
})
