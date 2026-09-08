import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const pkgRoot = path.dirname(fileURLToPath(import.meta.url))
const presentationRoot = path.resolve(pkgRoot, '../..')
const defaultManifestPath = path.join(pkgRoot, 'dist/manifest.json')
const defaultRuntimeDist = path.join(pkgRoot, 'dist')
const ui5SideEffectShim = path.resolve(pkgRoot, 'src/ui5-side-effect-shim.js')
const ui5JsxRuntime = path.resolve(
  presentationRoot,
  'node_modules/@ui5/webcomponents-base/dist/jsx-runtime.js',
)

/** @param {string} id */
export function isUi5JsxRuntimeImport(id) {
  return id === '@ui5/webcomponents-base/jsx-runtime'
    || id.startsWith('@ui5/webcomponents-base/jsx-runtime/')
}

/** 匹配 i18n bundle (Assets.js) / 组件聚合 (bundle.esm.js) / 图标聚合 (AllIcons.js)。
 *  这些是 install.js 关键依赖，不能被 shim 成空；shim 只能针对"仅 side-effect 注册"的组件文件。 */
const UI5_FUNCTIONAL_MODULE = /(?:\/|^)(?:Assets|bundle\.esm|AllIcons)\.js$/

/** @param {string} id */
export function isUi5SideEffectImport(id) {
  if (!id || id.startsWith('\0')) return false
  if (isUi5JsxRuntimeImport(id)) return false
  if (id.includes('@ui5/webcomponents-theming') && id.endsWith('.json')) return false
  if (!id.includes('@ui5/webcomponents')) return false
  /* base / localization 包：纯功能模块（Boot.js / Render.js / DateFormat.js /
     registerLocaleDataLoader 等），被 shim 会导致运行时拿不到关键 API。 */
  if (id.includes('@ui5/webcomponents-base')) return false
  if (id.includes('@ui5/webcomponents-localization')) return false
  /* i18n bundle / 组件聚合 / 图标聚合：被 shim 会破坏 install.js 的 Assets/bundle/AllIcons 加载。 */
  if (UI5_FUNCTIONAL_MODULE.test(id)) return false
  /* 剩余命中：纯 side-effect 自定义元素注册（Button.js / Dialog.js / Menu.js 等），
     bundle.esm.js 已涵盖，由 runtime 统一注册，此处 shim 成空避免双实例。 */
  return /\/dist\/[^?]+\.js$/.test(id)
}

/** @param {string} id */
function resolveUi5AppImport(id) {
  if (isUi5JsxRuntimeImport(id)) return ui5JsxRuntime
  if (isUi5SideEffectImport(id)) return ui5SideEffectShim
  return null
}

/** 将 side-effect / jsx-runtime 解析为本地文件，避免 Rollup external 留下裸模块名。
 *  build 模式生效：应用代码 import `@ui5/webcomponents/dist/Button.js` 等组件文件时统一 shim 成空，
 *  自定义元素注册由 cmx-ui5-runtime 的 install.js（通过 bundle.esm.js）完成，
 *  避免应用代码与 runtime 各跑一份 bundle.esm.js 导致的"Multiple UI5 Web Components instances detected"双实例问题。
 *  `isUi5SideEffectImport` 已排除 Assets.js / bundle.esm.js / AllIcons.js / base / localization，
 *  install.js 的关键依赖（i18n bundle / 组件聚合 / 功能 API）仍走真实文件。
 *
 *  dev 模式跳过：install.js 走 Vite alias 解析源码，与应用代码共享同一份 ES module 实例，
 *  无需 shim（shim 会导致 fiori bundle.esm.js 内部的 `import Dialog from '@ui5/webcomponents/dist/Dialog.js'`
 *  等 default import 失败，因为 shim 模块没有 default export）。 */
export function cmxUi5SideEffectShimPlugin() {
  let isDev = false
  return {
    name: 'cmx-ui5-side-effect-shim',
    enforce: 'pre',
    configResolved(config) { isDev = config.command === 'serve' },
    resolveId(id) {
      if (isDev) return null
      return resolveUi5AppImport(id)
    },
  }
}

const MIME = {
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
}

/** Tabler 桥接仅由 cmx-ui5-runtime install 加载；应用侧工具函数应打包进 bundle。 */
function isCmxIconResourceRuntimeExternal(id) {
  return id === 'cmx-icon-resource/ui5'
    || id === 'cmx-icon-resource/ui5/index.js'
    || id === 'cmx-icon-resource/ui5/register-tabler'
}

/** @param {string} id */
export function isCmxUi5RuntimeExternal(id) {
  if (!id) return false
  if (id.startsWith('\0')) return false
  if (isUi5JsxRuntimeImport(id)) return false
  if (isUi5SideEffectImport(id)) return false
  if (id.includes('@ui5/webcomponents-theming') && id.endsWith('.json')) return false
  if (id.includes('@ui5/webcomponents')) return true
  if (isCmxIconResourceRuntimeExternal(id)) return true
  return false
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  return MIME[ext] ?? 'application/octet-stream'
}

function serveRuntimeStatic(root) {
  const absRoot = path.resolve(root)
  return (req, res, next) => {
    if (!req.url) return next()
    const urlPath = decodeURIComponent(req.url.split('?')[0])
    const rel = urlPath.replace(/^\/shared\/?/, '').replace(/^\//, '')
    const file = path.normalize(path.join(absRoot, rel))
    if (!file.startsWith(absRoot) || !existsSync(file) || !statSync(file).isFile()) {
      return next()
    }
    res.setHeader('Content-Type', contentType(file))
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    createReadStream(file).pipe(res)
  }
}

/**
 * Portal / HTMLDesigner 构建插件：external UI5，注入 runtime entry URL，dev 托管 /shared/。
 *
 * dev 模式下不 external UI5、不注入 runtime entry：Vite 原生解析全部模块，
 * 应用代码与 UI5 组件共享同一份 ES module 实例（消除双实例）。
 * runtime 的 install.js 源码由 client.js 直接 import（走 Vite alias）。
 *
 * @param {object} [options]
 * @param {string} [options.manifestPath]
 * @param {string} [options.runtimeDist]
 * @param {string} [options.runtimeBase]
 */
export function cmxUi5RuntimeAppPlugin(options = {}) {
  const manifestPath = options.manifestPath ?? defaultManifestPath
  const runtimeDist = options.runtimeDist ?? defaultRuntimeDist
  const runtimeBase = options.runtimeBase ?? '/shared/'

  /** @type {string} */
  let runtimeEntry = `${runtimeBase.replace(/\/?$/, '/') }assets/install.js`
  let isDev = false

  return {
    name: 'cmx-ui5-runtime-app',
    enforce: 'pre',
    configResolved(config) {
      isDev = config.command === 'serve'
    },
    resolveId(id) {
      // side-effect 解析已由 cmxUi5SideEffectShimPlugin 统一处理；此处让 Vite 默认解析其它模块。
      return null
    },
    /**
     * build 模式注入 runtime entry：把 client.js 里的 __CMX_UI5_RUNTIME_ENTRY__ 替换为 hash URL。
     * dev 模式跳过：client.js 用 import.meta.env.DEV 分支走 Vite alias 解析源码 install.js，
     * 不需要 hash URL（也不需要 dist/manifest.json）。
     */
    transform(code, id) {
      if (isDev) return
      if (!id || !id.endsWith('/cmx-ui5-runtime/src/client.js')) return
      if (!code.includes('__CMX_UI5_RUNTIME_ENTRY__')) return
      return { code: code.replaceAll('__CMX_UI5_RUNTIME_ENTRY__', JSON.stringify(runtimeEntry)), map: null }
    },
    config(_config, { command }) {
      // build 模式需要从 dist/manifest.json 拿到正确的 hash 路径。
      if (command === 'build' && existsSync(manifestPath)) {
        try {
          const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
          if (manifest.entry) {
            runtimeEntry = `${runtimeBase.replace(/\/?$/, '/')}${manifest.entry.replace(/^\//, '')}`
          }
        } catch (err) {
          console.warn('[cmx-ui5-runtime] 读取 manifest 失败:', err)
        }
      } else if (command === 'build' && !existsSync(manifestPath)) {
        console.warn(
          '[cmx-ui5-runtime] dist/manifest.json 不存在，请先执行: npm run build -w cmx-ui5-runtime',
        )
      }

      if (command !== 'build') {
        // dev 模式：client.js 的 build 分支不执行，但 Vite parser 需要能解析标识符，
        // define 为空字符串避免 ReferenceError。
        return {
          define: {
            __CMX_UI5_RUNTIME_ENTRY__: JSON.stringify(''),
          },
        }
      }

      return {
        define: {
          __CMX_UI5_RUNTIME_ENTRY__: JSON.stringify(runtimeEntry),
        },
        build: {
          rollupOptions: {
            /* runtimeEntry（/shared/assets/install-*.js）由浏览器运行时通过 <script> 加载，
               不属于源码依赖。`@vite-ignore` 注释仅对 Vite 解析器有效，
               Rollup 仍会尝试解析这个 URL，导致"failed to resolve import"报错。
               必须在 external 中显式标记，让 Rollup 保留为外部 URL。 */
            external: (id) => isCmxUi5RuntimeExternal(id) || id === runtimeEntry,
          },
        },
      }
    },
    configureServer(server) {
      // dev 模式仍托管 /shared/（用于静态资源如图片，runtime chunk 本身不再被 import）
      if (existsSync(runtimeDist)) {
        server.middlewares.use('/shared', serveRuntimeStatic(runtimeDist))
      }
    },
  }
}
