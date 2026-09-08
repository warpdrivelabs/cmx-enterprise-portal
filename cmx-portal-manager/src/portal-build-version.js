/**
 * 与 CMXHTMLDesigner `src/components/designer-topbar.js` 一致：
 * `__APP_VERSION__`、`__BUILD_TIME__` 由 Vite `define` 注入（见根目录 `vite.config.js`）。
 */
const _ver = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : ''
const _built = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : ''

export const PORTAL_APP_VERSION = _ver || 'dev'
export const PORTAL_BUILD_TIME = _built || ''

/**
 * ShellBar `secondary-title`：`v{version} · {YYYYMMDD-HHmm}`（无构建时间则仅 `v{version}`）
 */
export const PORTAL_SHELLBAR_SECONDARY_TITLE = `v${_ver}${_built ? ' · ' + _built : ''}`
