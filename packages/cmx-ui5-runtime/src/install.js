/**
 * CMX 共用 UI5 + Tabler 运行时入口。
 * 由 Portal / HTMLDesigner 通过 `cmx-ui5-runtime/client` 动态加载。
 * - dev 模式：client.js 直接 import 本文件源码（走 Vite alias），与应用代码共享同一份 ES module 实例。
 * - 生产构建：打包至 /shared/assets/install-*.js，由应用动态 import。
 *
 * 顺序与 CMXPortalManager import-ui5-and-app 一致：
 * boot → fetchCldr 预加载 → Assets → bundle / AllIcons → Tabler 桥接 → 暴露 API。
 */
import { boot } from '@ui5/webcomponents-base/dist/Boot.js'
import { reRenderAllUI5Elements } from '@ui5/webcomponents-base/dist/Render.js'
import { setTheme } from '@ui5/webcomponents-base/dist/config/Theme.js'
import { setLanguage, getLanguage } from '@ui5/webcomponents-base/dist/config/Language.js'
import { attachLanguageChange, detachLanguageChange } from '@ui5/webcomponents-base/dist/locale/languageChange.js'
import { fetchCldr } from '@ui5/webcomponents-base/dist/asset-registries/LocaleData.js'
import getLocale from '@ui5/webcomponents-base/dist/locale/getLocale.js'
import getCachedLocaleDataInstance from '@ui5/webcomponents-localization/dist/getCachedLocaleDataInstance.js'
import DateFormat from '@ui5/webcomponents-localization/dist/DateFormat.js'
import UI5Date from '@ui5/webcomponents-localization/dist/dates/UI5Date.js'

import './locale-data-whitelist.js'

/* 预加载 whitelist 内全部 locale 的 CLDR 数据（须在 boot() 之前）。
   Calendar / DateFormat 等在渲染期通过 getCachedLocaleDataInstance -> LocaleData -> loadData
   -> LoaderExtensions.loadResource -> getLocaleData 同步读 localeDataMap。
   若 boot() 阶段触发了 getCachedLocaleDataInstance，而此时 fetchCldr 尚未执行，
   LocaleData 实例会缓存空数据（mData 未设置），后续 fetchCldr 完成也无法刷新缓存，
   表现为 DatePicker 日历头月份/年份显示 undefined。
   将 fetchCldr 提前到 boot() 之前，确保 localeDataMap 在任何 getCachedLocaleDataInstance
   调用之前就已就绪。 */
await Promise.all([
  fetchCldr('zh', 'CN'),
  fetchCldr('zh', 'TW'),
  fetchCldr('en'),
])

await boot()

await Promise.all([
  import('@ui5/webcomponents/dist/Assets.js'),
  import('@ui5/webcomponents-fiori/dist/Assets.js'),
])

await Promise.all([
  import('@ui5/webcomponents/dist/bundle.esm.js'),
  import('@ui5/webcomponents-fiori/dist/bundle.esm.js'),
  import('@ui5/webcomponents-icons/dist/AllIcons.js'),
  import('@ui5/webcomponents-icons-tnt/dist/AllIcons.js'),
  import('@ui5/webcomponents-icons-business-suite/dist/AllIcons.js'),
])

const { installTablerUi5Icons } = await import('cmx-icon-resource/ui5')
await installTablerUi5Icons()

/* LocaleData 兜底：monkey-patch 内部如果 LocaleData 同步读取失败时使用。
   实际 fetchCldr 已预先加载（boot 之前），正常路径不会走到这里。 */
function getCalendarHeaderTexts (date) {
  const d = date || new Date()
  try {
    const loc = getLocale()
    const localeData = getCachedLocaleDataInstance(loc)
    const months = localeData.getMonthsStandAlone('wide', 'Gregorian')
    const yearFormat = DateFormat.getDateInstance({ format: 'y', calendarType: 'Gregorian' })
    const localDate = UI5Date.getInstance(d.getTime())
    return {
      monthText: months[d.getMonth()],
      yearText: String(yearFormat.format(localDate, true)),
    }
  } catch { return null }
}

/* 根因修复：monkey-patch `Calendar.prototype.onAfterRendering`。
   UI5 Render.js 的 whenDOMUpdated() 在 dev 模式下会**永久挂起**（队列非空时
   _resolveTaskPromise 不被调用），导致 Calendar 的 `await renderFinished()` 永远不返回，
   onAfterRendering 内设置 _headerMonthButtonText 的逻辑永远不执行。
   修复策略：把 `await renderFinished()` 替换为带 250ms 兜底的 `Promise.race`，
   无论 UI5 内部渲染队列状态如何，header 文本设置逻辑一定会执行。
   副作用：调用方可能在子 picker 还没渲染完时就继续，但 picker 的 connectedCallback
   是在 Calendar 渲染同步阶段触发的，下一帧内一定就绪，250ms 兜底对常见场景无影响。 */
function patchCalendarOnAfterRendering () {
  const CalClass = customElements.get('ui5-calendar')
  if (!CalClass) return false
  const proto = CalClass.prototype
  if (proto.__cmxPatched) return true
  if (typeof proto.onAfterRendering !== 'function') return false
  proto.onAfterRendering = async function cmxPatchedOnAfterRendering () {
    // 250ms 兜底：UI5 内部 renderFinished 在 dev 模式下可能永久挂起
    const timeout = new Promise(resolve => setTimeout(() => resolve('timeout'), 250))
    const { renderFinished } = await import('@ui5/webcomponents-base/dist/Render.js')
    try {
      await Promise.race([renderFinished(), timeout])
    } catch (_) { /* 渲染失败不影响 header 设置 */ }
    // 复刻 Calendar 原 onAfterRendering 后续逻辑（直接复用同一份 renderFinished module 引用）
    try {
      this._previousButtonDisabled = !this._currentPickerDOM._hasPreviousPage()
      this._nextButtonDisabled = !this._currentPickerDOM._hasNextPage()
    } catch (_) { /* picker 未就绪 */ }
    try {
      const loc = getLocale()
      const localeData = getCachedLocaleDataInstance(loc)
      const yearFormat = DateFormat.getDateInstance({ format: 'y', calendarType: this.primaryCalendarType })
      this._headerMonthButtonText = localeData.getMonthsStandAlone('wide', this.primaryCalendarType)[this._calendarDate.getMonth()]
      this._headerYearButtonText = String(yearFormat.format(this._localDate, true))
      const { rangeStartText, rangeEndText } = this._formatYearRangeText(this._currentYearRange)
      this._headerYearRangeButtonText = `${rangeStartText} - ${rangeEndText}`
      this._secondaryCalendarType && this._setSecondaryCalendarTypeButtonText()
    } catch (_) {
      // 极少见：用 getCalendarHeaderTexts 兜底（异常路径，文本可能与 Calendar 当前显示日期不一致，但保证非 undefined）
      const texts = getCalendarHeaderTexts(new Date())
      if (texts) {
        this._headerMonthButtonText = texts.monthText
        this._headerYearButtonText = texts.yearText
      }
    }
  }
  proto.__cmxPatched = true
  return true
}

patchCalendarOnAfterRendering()

/** @type {import('./runtime-api.js').CmxUi5RuntimeApi} */
const api = {
  boot,
  setTheme,
  setLanguage,
  getLanguage,
  attachLanguageChange,
  detachLanguageChange,
  reRenderAllUI5Elements,
}

globalThis.__cmxUi5 = api

export default api
