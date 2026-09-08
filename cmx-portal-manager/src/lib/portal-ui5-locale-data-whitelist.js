/**
 * 替换 `@ui5/webcomponents-localization/dist/generated/json-imports/LocaleData.js` 的白名单 shim：
 * 仅注册 zh_CN / zh_TW / en 三种 CLDR，把 8.5M 的 `ui5-localization` chunk 缩到 ~440KB。
 *
 * 由 `vite.config.js` 的 `portalUi5LocaleDataWhitelistPlugin`（`enforce:'pre'` + `resolveId`）
 * 在构建期重定向；运行时未列入白名单的 locale 由 `getLocaleInstance`（base 包）回退到
 * `DEFAULT_LOCALE`，并在 console 打印一次性提示。
 *
 * 选型：**静态 import + .default**，让 vite 把 JSON 直接内联到本 chunk，不走 dynamic import 的额外分片。
 *
 * 维护：新增支持语言时同步 (a) `availableLocales` 列表 (b) 增一条 import + loader，二者必须保持一致。
 */

import zhCN from '@ui5/webcomponents-localization/dist/generated/assets/cldr/zh_CN.json'
import zhTW from '@ui5/webcomponents-localization/dist/generated/assets/cldr/zh_TW.json'
import en   from '@ui5/webcomponents-localization/dist/generated/assets/cldr/en.json'

import { registerLocaleDataLoader } from '@ui5/webcomponents-base/dist/asset-registries/LocaleData.js'

const LOCALE_DATA_MAP = {
  zh_CN: zhCN,
  zh_TW: zhTW,
  en,
}

const availableLocales = Object.keys(LOCALE_DATA_MAP)

availableLocales.forEach((localeId) => {
  registerLocaleDataLoader(localeId, async () => LOCALE_DATA_MAP[localeId])
})
