/**
 * 与 CMXPortalManager portal-ui5-locale-data-whitelist 一致：仅 zh_CN / zh_TW / en。
 * 构建期由 vite resolveId 重定向 LocaleData.js 到此 shim。
 */
import zhCN from '@ui5/webcomponents-localization/dist/generated/assets/cldr/zh_CN.json'
import zhTW from '@ui5/webcomponents-localization/dist/generated/assets/cldr/zh_TW.json'
import en from '@ui5/webcomponents-localization/dist/generated/assets/cldr/en.json'

import { registerLocaleDataLoader } from '@ui5/webcomponents-base/dist/asset-registries/LocaleData.js'

const LOCALE_DATA_MAP = {
  zh_CN: zhCN,
  zh_TW: zhTW,
  en,
}

Object.keys(LOCALE_DATA_MAP).forEach((localeId) => {
  registerLocaleDataLoader(localeId, async () => LOCALE_DATA_MAP[localeId])
})
