/**
 * datacomp-subset-entry.js —— W0 子集入口（onto 双端组件底座）。
 *
 * 从 cmx-data-comp 挑选**零 UI5 依赖**的五个能力打成独立 IIFE，供 onto 三页在
 * 独立 :8097（无门户 `__cmxDataComp` 注入）下引导。改清单前必须核依赖图仍零 UI5 / 零三方：
 *   node scripts/bundle-datacomp-subset.mjs  （external: [] 即会在打包期暴露裸导入）
 *
 * 挂载形态对齐门户 import-ui5-and-app.js：
 *   - `globalThis.__cmxDataCompSubset` = { showCmxToast, showCmxError, escHtml }
 *   - 组件 import 副作用自注册（cmx-toolbar / cmx-status-tag / cmx-kpi-card / cmx-desc-list）
 *   - 展示类组件默认 Neo 皮肤（`__cmxDefault*Skin = 'neo'`），onto 页不写 data-cmx-skin
 */
import '../packages/cmx-data-comp/src/components/cmx-toolbar.js'
import '../packages/cmx-data-comp/src/components/cmx-status-tag.js'
import '../packages/cmx-data-comp/src/components/cmx-kpi-card.js'
import '../packages/cmx-data-comp/src/components/cmx-desc-list.js'
import { showCmxError, showCmxToast } from '../packages/cmx-data-comp/src/lib/cmx-toast.js'
import { escHtml } from '../packages/cmx-data-comp/src/lib/cmx-page-helpers.js'

/* 展示类组件默认 Neo 皮肤：独立 :8097 与门户同向（页内一律不写 data-cmx-skin）。 */
globalThis.__cmxDefaultToolbarSkin = 'neo'
globalThis.__cmxDefaultStatusTagSkin = 'neo'
globalThis.__cmxDefaultDescListSkin = 'neo'
globalThis.__cmxDefaultKpiCardSkin = 'neo'

/* 必须显式挂 globalThis：IIFE 的 var 声明在 blob import（ESM 模块作用域）下不落全局。 */
globalThis.__cmxDataCompSubset = { showCmxToast, showCmxError, escHtml }

