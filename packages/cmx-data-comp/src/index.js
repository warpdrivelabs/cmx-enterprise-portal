/**
 * cmx-data-comp — 数据层入口
 *
 * 推荐按需 import 子路径：
 *   import 'cmx-data-comp/components/cmx-revo-grid.js'
 *   import { CmxMasterSlave } from 'cmx-data-comp/lib/cmx-master-slave.js'
 */

import './components/cmx-revo-grid.js'
import './components/cmx-embed-page.js'
import './components/cmx-ui5-form.js'
import './components/cmx-tabulator.js'
import './components/cmx-web-treeview.js'
import './components/cmx-split-pane.js'
import './components/cmx-view-tabs.js'
import './components/cmx-combo-box.js'
import './components/cmx-floating-dialog.js'
import './components/cmx-dict-select.js'
import './components/cmx-pager.js'
/* 基础输入列编辑器（form + grid 列编辑器；副作用注册自定义元素）。 */
import './components/cmx-text-input.js'
import './components/cmx-number-input.js'
import './components/cmx-date-input.js'
import './components/cmx-datetime-input.js'
/* Ignite 组件（igc-* 封装）：门户运行时通过 barrel 注册自定义元素。 */
import './components/ignite/cmx-ignite-combo.js'
import './components/ignite/cmx-ignite-list.js'
/* Ignite Spreadsheet + SpreadJS（电子表格内核，仅报表页用）：
   懒注册——不进 barrel 首屏，避免 6.4MB ignite-spreadsheet + spreadjs vendor 污染所有页面。
   页面首次出现 <cmx-spreadsheet> / <cmx-spreadjs-sheet> 标签时才动态 import 加载。
   报表页已确保使用前标签已注册（见 packages/cmx-data-comp/src/components/spreadjs/sheet-kernel.js）。 */
import { resolveSheetKernel } from './components/spreadjs/sheet-kernel.js'
const _SHEET_TAGS = ['cmx-spreadsheet', 'cmx-spreadjs-sheet']
let _sheetLoaded = false
function _loadSheetComponents () {
  if (_sheetLoaded) return
  _sheetLoaded = true
  import('./components/ignite/cmx-spreadsheet.js')
  import('./components/spreadjs/cmx-spreadjs-sheet.js').then(() => {
    import('./components/spreadjs/cmx-spreadjs-sheet-mega.js').then((m) => {
      if (resolveSheetKernel() === 'mega') {
        try { if (!customElements.get('cmx-spreadjs-sheet')) customElements.define('cmx-spreadjs-sheet', m.CmxSpreadjsSheet) } catch (_) {}
      }
    }).catch(() => {})
  }).catch(() => {})
}
// MutationObserver 监听文档：首次出现 sheet 标签时触发懒加载
if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
  const _check = () => { if (!_sheetLoaded && _SHEET_TAGS.some((t) => document.querySelector(t))) _loadSheetComponents() }
  _check()
  if (!_sheetLoaded) {
    const _obs = new MutationObserver(() => _check())
    _obs.observe(document.documentElement, { childList: true, subtree: true })
  }
}
// 允许消费方主动触发预加载（如报表页已知要用）
export { _loadSheetComponents as preloadSheetComponents }
/* fx 函数/公式编辑器：通用浮层，内置函数内建、取数函数由使用方注入。 */
import './components/cmx-fx-editor.js'
/* 全部开源 Ignite 薄封装（cmx-ignite-*），副作用 import 即注册自定义元素。 */
import './components/ignite/cmx-ignite-thin.js'
/* 注册内置字段类型（color/combo/ignite-combo/dict-select/select + text/number/date/datetime）。barrel 自动加载，业务页面无需手动 import。 */
import './lib/cmx-builtin-field-types.js'
/* 展示类组件（panel / toolbar / status-tag / empty-state / desc-list / filter-bar）：副作用注册自定义元素。 */
import './components/cmx-panel.js'
import './components/cmx-toolbar.js'
import './components/cmx-status-tag.js'
import './components/cmx-empty-state.js'
import './components/cmx-desc-list.js'
import './components/cmx-filter-bar.js'
import './components/cmx-kpi-card.js'
/* 流程审批轨迹（事件流口径，20260903 自 native 页三副本上收；副作用注册自定义元素）。 */
import './components/cmx-flow-trail.js'

export { CmxRevoGrid } from './components/cmx-revo-grid.js'
export { CmxEmbedPage } from './components/cmx-embed-page.js'
export { CmxUi5Form } from './components/cmx-ui5-form.js'
export { CmxTabulator } from './components/cmx-tabulator.js'
export { CmxWebTreeview } from './components/cmx-web-treeview.js'
export { CmxSplitPane } from './components/cmx-split-pane.js'
export { CmxViewTabs } from './components/cmx-view-tabs.js'
export { CmxComboBox } from './components/cmx-combo-box.js'
export { CmxFloatingDialog } from './components/cmx-floating-dialog.js'
export { CmxDictSelect } from './components/cmx-dict-select.js'
export { CmxPager } from './components/cmx-pager.js'
export { CmxPanel } from './components/cmx-panel.js'
export { CmxToolbar } from './components/cmx-toolbar.js'
export { CmxStatusTag } from './components/cmx-status-tag.js'
export { CmxEmptyState } from './components/cmx-empty-state.js'
export { CmxDescList, CmxDescItem } from './components/cmx-desc-list.js'
export { CmxFilterBar } from './components/cmx-filter-bar.js'
export { CmxKpiCard } from './components/cmx-kpi-card.js'
export { CmxFlowTrail, buildFlowTrailEvents } from './components/cmx-flow-trail.js'
export { CmxTextInput } from './components/cmx-text-input.js'
export { CmxNumberInput } from './components/cmx-number-input.js'
export { CmxDateInput } from './components/cmx-date-input.js'
export { CmxDatetimeInput } from './components/cmx-datetime-input.js'
export { CmxDictMru, createMruServiceFromPageService } from './lib/cmx-dict-personalization.js'
export { CmxIgniteCombo } from './components/ignite/cmx-ignite-combo.js'
export { CmxIgniteList } from './components/ignite/cmx-ignite-list.js'
// CmxSpreadsheet / CmxSpreadjsSheet 已改为懒注册（见文件顶部 _loadSheetComponents），
// 不再从 barrel 静态 export，避免 6.4MB vendor 进首屏。
// 如需直接引用类，用子路径：import { CmxSpreadsheet } from 'cmx-data-comp/components/ignite/cmx-spreadsheet.js'
export { resolveSheetKernel }
export { CmxFxEditor } from './components/cmx-fx-editor.js'
export { CmxMasterSlave } from './lib/cmx-master-slave.js'
export { loadDocData, saveDocData, saveDocDataBatch, ChangeSetCollector, loadChildren, formatViolations, extractViolations } from './lib/cmx-doc-source.js'
export {
  loadDictData, loadDictChildren, saveDictData, upsertDictEntries, deleteDictEntry,
  normalizeDictRow, sanitizeChangeSet, formatDictViolations,
} from './lib/cmx-dct-source.js'
export { useModelBridge } from './lib/cmx-workspace-bridge.js'
export { showCmxMessage, cmxInfo, cmxWarn, cmxError } from './lib/cmx-message-dialog.js'
export { cmxConfirm } from './lib/cmx-message-dialog.js'
export { showCmxToast, showCmxError, installGlobalErrorToast, showCmxFatalScreen } from './lib/cmx-toast.js'
/* 原生页面（native-pages）共享微工具：页面经 globalThis.__cmxDataComp 取用（治理清单 B-01）。 */
export { escHtml, escAttr, apiJson, apiGet, apiPost } from './lib/cmx-page-helpers.js'
/* fetch 流式 SSE 客户端：带 Authorization 头消费 text/event-stream（替代 EventSource 换票方案）。 */
export { openSseStream } from './lib/cmx-sse-stream.js'
/* 深拷贝唯一出口（治理清单 C-05，收敛 clonePlain/cloneJson/clone/cloneArray 四处副本）。 */
export { deepClone, deepCloneArray } from './lib/cmx-deep-clone.js'
export { describeDocError, presentDocError } from './lib/cmx-doc-error-presenter.js'
export { normalizeDocCoord, docCoordQuery, docCoordKey, resolveCoord } from './lib/cmx-doc-coord.js'
export { buildMasterSlaveSchema, layerPaths, buildColumnModel, orderColumns, defaultWidth, SYSTEM_COLS } from './lib/cmx-doc-meta-loader.js'
export {
  metaTableFieldsToColumns, isPrimaryKeyField, isBusinessKey, isRequiredCol,
  enumOptionsFromField, flatPropsFor, displayForMetaColumn, defaultWidthFor,
} from './lib/init-page-models.js'
export { OPERATORS, opsForType, coerceValue, buildLayerFilter, buildOrderBy, buildDocQuery, encodeCursor } from './lib/cmx-doc-query.js'
export { loadDocDataStream, FrameStreamParser } from './lib/cmx-doc-stream.js'
export { decodeMsgpack } from './lib/cmx-msgpack-decode.js'
export { CmxDictCache, collectRefDicts, makeDictResolver } from './lib/cmx-dict-cache.js'
export {
  registerColumnPreset, getColumnPreset, listColumnPresets, invokePreset,
} from './lib/cmx-column-presets.js'
export {
  searchAsync, lookupByKeyAsync, debounceForSource, getAsyncSourceCache,
} from './lib/cmx-async-source.js'
export { createPageServiceDataSource } from './lib/cmx-page-service-source.js'
export { createPageModelBridge } from './lib/cmx-page-model-bridge.js'
export { createDictDataSource, createLocalDictDataSource } from './lib/cmx-dict-data-source.js'
export { CmxColumn } from './lib/cmx-column.js'
export { CmxColumnGroup } from './lib/cmx-column-group.js'
export { CmxColumnModel } from './lib/cmx-column-model.js'
export { CmxDCTMeta } from './lib/cmx-dct-meta.js'
export { CmxDOCMeta } from './lib/cmx-doc-meta.js'
export { CmxBaseMeta, CmxMetaFieldRef, CmxMetaFieldSet, CmxMetaTable, CmxMetaSummary, loadMetaBatch, loadMetaModelsBatch, registerMetaModelKind } from './lib/cmx-meta-model.js'
export { CmxColumnAdapter } from './lib/cmx-column-adapter.js'
export { EDIT_MODES, EDIT_MODE_LABELS, editModeKind, editModeLabel, toEditMode, uiControlOptions } from './lib/cmx-field-uicontrol.js'
export {
  FIELD_SCHEMA, EDITOR_PROPERTY_SCHEMA, SECTIONS, ENDS,
  fieldsFor, panelSectionsFor, inlineFieldsFor, placementOf, editorPropsFor,
} from './lib/cmx-field-schema.js'
export { makeDctAdapter, makeFlcAdapter } from './lib/cmx-field-adapter.js'
export { renderFieldTable, renderFieldPanel } from './lib/cmx-field-ui.js'
export {
  DEFAULT_CAPTION_LOCALE,
  fieldCaption,
  fieldDisplayName,
  fieldId,
  normalizeFieldIdentity,
  setFieldCaption,
  setFieldId,
  setFieldName,
} from './lib/cmx-field-meta.js'
export {
  CMX_FIELD_CLIPBOARD_TYPE,
  createFieldClipboardPayload,
  parseFieldClipboardText,
  readFieldClipboard,
  writeFieldClipboard,
} from './lib/cmx-field-clipboard.js'
export { CmxRowSet } from './lib/cmx-row-set.js'
export { CmxDataSet } from './lib/cmx-data-set.js'
export { CmxDataSetView, buildPredicate } from './lib/cmx-data-set-view.js'
export {
  toPlainRow, buildTreeFromFlat, normalizeTreeData, walkTree, flattenTree, collectIds,
} from './lib/cmx-tree-data.js'
export { FlexibleCombinationEngine } from './lib/flexible-combination-engine.js'
export { validateFlexibleCombination, previewFlexibleCombination } from './lib/flexible-combination-validator.js'
export { CmxFlexibleCombination } from './lib/cmx-flexible-combination.js'
export {
  parseDrn, normalizeDrn, formatDrn, drnToPath, sameDefinition, drnVisibleFrom, effectiveDictId,
  DRN_KINDS, DRN_VISIBILITY,
} from './lib/drn.js'
export {
  deepMerge, expandRefField, expandRuleDetail, expandCombination,
} from './lib/flc-overlay.js'
export { diagnoseReferences } from './lib/flc-ref-diagnostics.js'
export {
  normalizeFieldOverrides, overrideForField, effectiveField, diffOverride,
  materializeTable, dematerializeTable, diagnoseOverride, diagnoseTableOverrides,
} from './lib/field-override.js'
export {
  RELATION_KIND, RELATION_FIELDSET, RELATION_SLOTS, RELATION_CARDINALITY_DEFAULT,
  isRelationDict, compileRelationOverrides, applyRelationCompile,
  diagnoseRelation, newRelationDict, migrateLegacyRelation,
} from './lib/relation-dict.js'
export { evalFormula, compileFormula } from './lib/formula-eval.js'
export {
  registerFieldType, unregisterFieldType, getFieldType, listFieldTypes,
  getRegisteredGridEditors, getRegisteredGridCellTemplate,
} from './lib/cmx-form-field-registry.js'
