/**
 * 应用侧加载共用 UI5 运行时。
 * - dev 模式：import `cmx-ui5-runtime/src/install.js` 源码（走 Vite alias 解析），
 *   与应用代码共享同一份 ES module 实例（消除双实例）。
 * - 生产构建：import `/shared/assets/install-XXXX.js`（构建时注入 hash URL）。
 */

/** @type {Promise<import('./runtime-api.js').CmxUi5RuntimeApi> | null} */
let loadPromise = null

/**
 * @returns {Promise<import('./runtime-api.js').CmxUi5RuntimeApi>}
 */
export function ensureCmxUi5Runtime() {
  if (globalThis.__cmxUi5) {
    return Promise.resolve(globalThis.__cmxUi5)
  }
  if (!loadPromise) {
    /* dev 模式：不带 @vite-ignore，让 Vite 解析 bare specifier 走 alias -> 源码 install.js，
     *   与应用代码共享同一份 ES module 实例（消除双实例）。
     * build 模式：@vite-ignore 让浏览器直接加载 runtime chunk（/shared/assets/install-XXX.js）。 */
    const installer = import.meta.env.DEV
      ? import('cmx-ui5-runtime/src/install.js')
      : import(/* @vite-ignore */ __CMX_UI5_RUNTIME_ENTRY__)
    loadPromise = installer.then((mod) => {
      const api = mod.default ?? globalThis.__cmxUi5
      if (!api) {
        throw new Error('[cmx-ui5-runtime] install chunk 未设置 globalThis.__cmxUi5')
      }
      return api
    })
  }
  return loadPromise
}

/**
 * @returns {import('./runtime-api.js').CmxUi5RuntimeApi | null}
 */
export function getCmxUi5RuntimeSync() {
  return globalThis.__cmxUi5 ?? null
}
