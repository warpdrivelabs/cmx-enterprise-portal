import { defineConfig, loadEnv } from 'vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { cmxUi5RuntimeAppPlugin, cmxUi5SideEffectShimPlugin } from 'cmx-ui5-runtime/vite-app'
import { localeDataWhitelistPlugin } from 'cmx-ui5-runtime/vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(path.join(__dirname, 'package.json'), 'utf-8'))

/** 与 CMXHTMLDesigner `vite.config.js` 一致，供 ShellBar 副标题 `v{version} · {时间}` */
const now = new Date()
const buildTime = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`

/**
 * vite 配置：使用函数形式以便按 mode 加载 .env 文件。
 *
 * 环境变量分层：
 *   - .env             所有 mode 共享的默认值（如 CMX_APP_BASE=/）
 *   - .env.development dev 模式覆盖（vite dev 加载，当前未使用）
 *   - .env.production  生产构建覆盖（vite build 加载，CMX_APP_BASE=/portal/）
 *   - shell 环境变量   优先级最高，可临时覆盖 .env（CI/CD 场景）
 *
 * loadEnv 第三个参数 '' 表示加载所有前缀的变量（默认只加载 VITE_ 前缀）。
 * CMX_ 前缀变量仅在 vite.config.js 中可见，不暴露给前端代码。
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '')
  /** 应用基础路径。dev=/，prod=/portal/（也可被 shell CMX_APP_BASE 临时覆盖） */
  const appBase = env.CMX_APP_BASE || './'
  /** 与 `npm run dev:server`（cmx-node-server/portalManagerService）联调；可覆盖端口 */
  const backendTarget = env.CMX_VITE_BACKEND || 'http://127.0.0.1:8080'

  return {
    define: {
      __APP_VERSION__: JSON.stringify(String(pkg.version ?? '0.0.0')),
      __BUILD_TIME__: JSON.stringify(buildTime),
    },
    /** 生产构建用绝对 base（/portal/），避免 /portal 无尾斜杠时相对路径解析到 /assets/ */
    base: appBase,
    plugins: [cmxUi5SideEffectShimPlugin(), cmxUi5RuntimeAppPlugin(), localeDataWhitelistPlugin],
    resolve: {
      alias: [
        { find: '@cmx-form-designer', replacement: path.resolve(__dirname, '../CMXFormDesigner') },
        { find: '@cmx-html-designer', replacement: path.resolve(__dirname, '../CMXHTMLDesigner') },
        {
          find: /^cmx-data-comp\/lib\/(.+)$/,
          replacement: path.resolve(__dirname, '../packages/cmx-data-comp/src/lib/$1'),
        },
        {
          find: /^cmx-data-comp\/components\/(.+)$/,
          replacement: path.resolve(__dirname, '../packages/cmx-data-comp/src/components/$1'),
        },
        {
          find: /^cmx-data-comp$/,
          replacement: path.resolve(__dirname, '../packages/cmx-data-comp/src/index.js'),
        },
        /* dev 模式下 client.js fallback import 'cmx-ui5-runtime/src/install.js'，
           需要能解析到 runtime 源码（含顶层 await，Vite dev 原生支持）。
           注意：不能只 alias 包根目录（会破坏 exports 子路径），需逐一映射。 */
        { find: /^cmx-ui5-runtime\/src\/(.+)$/, replacement: path.resolve(__dirname, '../packages/cmx-ui5-runtime/src/$1') },
        { find: /^cmx-ui5-runtime\/client$/, replacement: path.resolve(__dirname, '../packages/cmx-ui5-runtime/src/client.js') },
        { find: /^cmx-ui5-runtime\/api-client$/, replacement: path.resolve(__dirname, '../packages/cmx-ui5-runtime/src/api-client.js') },
        { find: /^cmx-ui5-runtime\/vite-app$/, replacement: path.resolve(__dirname, '../packages/cmx-ui5-runtime/vite-app.js') },
        { find: /^cmx-ui5-runtime\/vite$/, replacement: path.resolve(__dirname, '../packages/cmx-ui5-runtime/vite.js') },
      ],
      dedupe: [
        '@ui5/webcomponents',
        '@ui5/webcomponents-base',
        '@ui5/webcomponents-fiori',
        '@ui5/webcomponents-icons',
        '@ui5/webcomponents-icons-tnt',
        '@ui5/webcomponents-icons-business-suite',
        '@ui5/webcomponents-localization',
        '@ui5/webcomponents-theming',
        'cmx-icon-resource',
        'cmx-ui5-runtime',
        /* 内嵌的 ai-workbench 用 Lit；dedupe 确保全应用只解析一份 lit，避免双实例导致的 reactive 失效。 */
        'lit',
        'lit-html',
        'lit-element',
        '@lit/reactive-element',
      ],
    },
    server: {
      fs: {
        allow: [path.resolve(__dirname, '..')],
      },
      proxy: {
        '/shared': { target: backendTarget, changeOrigin: true },
        '/api': { target: backendTarget, changeOrigin: true },
        '/rpc': { target: backendTarget, changeOrigin: true },
        '/trpc': { target: backendTarget, changeOrigin: true },
        '/sse': { target: backendTarget, changeOrigin: true },
        '/ws': { target: backendTarget, ws: true },
      },
    },
    build: {
      target: 'es2022',
      sourcemap: true,
      chunkSizeWarningLimit: 1500,
      /* 首屏 modulePreload 精细化：过滤掉仅在动态 import 路径上的重型 vendor chunk。
         这些 chunk（如 vendor-ignite-spreadsheet 6.4MB）只在报表页用到，
         Rolldown 把它们列进了 entry 的间接依赖，但首屏不该 preload 它们。 */
      modulePreload: {
        resolveDependencies: (_filename, deps) => deps.filter((d) => !/vendor-ignite-spreadsheet/.test(d)),
      },
      /* 实际安装的是 Vite 6（Rollup），只认 rollupOptions；下面的 rolldownOptions 仅 Vite 8/Rolldown
         生效。缺此段时多入口 input 不被读取 → 只产出 index.html、login.html 丢失 → 访问
         /portal/login.html 被 ServeDir 兜底成 index → 主 app 在 login 路径反复 401 →
         ?redirect= 指数叠加 → HTTP 414。manualChunks 等价于 rolldown 的 codeSplitting.groups
         （按原 priority 降序匹配，高优先级更具体的库先命中）。 */
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
          login: path.resolve(__dirname, 'login.html'),
        },
        output: {
          manualChunks (id) {
            if (!id.includes('node_modules')) return undefined
            // priority 30（最具体，先匹配）
            if (/node_modules[\\/]@infragistics[\\/](?:igniteui-webcomponents-spreadsheet|igniteui-webcomponents-excel)/.test(id)) return 'vendor-ignite-spreadsheet'
            if (/node_modules[\\/]@infragistics[\\/]igniteui-webcomponents-grids/.test(id)) return 'vendor-ignite-grids'
            if (/node_modules[\\/]@infragistics[\\/]igniteui-webcomponents-gauges/.test(id)) return 'vendor-ignite-gauges'
            // priority 25
            if (/node_modules[\\/](?:igniteui-webcomponents|@infragistics[\\/]igniteui-webcomponents[\\/]|igniteui-i18n)/.test(id)) return 'vendor-ignite'
            // priority 20
            if (/node_modules[\\/]tabulator-tables/.test(id)) return 'vendor-tabulator'
            if (/node_modules[\\/]@revolist[\\/]revogrid/.test(id)) return 'vendor-revogrid'
            if (/node_modules[\\/]@keenmate[\\/]web-treeview/.test(id)) return 'vendor-treeview'
            if (/node_modules[\\/](?:lit-html|lit-element|@lit|@lit-labs|lit)[\\/]/.test(id)) return 'vendor-lit'
            if (/node_modules[\\/](?:markdown-it|entities|linkify-it|mdurl)/.test(id)) return 'vendor-markdown'
            if (/node_modules[\\/](?:shiki|@shikijs)/.test(id)) return 'vendor-shiki'
            if (/node_modules[\\/]@floating-ui/.test(id)) return 'vendor-floating-ui'
            return undefined
          },
        },
      },
      rolldownOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
          login: path.resolve(__dirname, 'login.html'),
        },
        output: {
          /* 把重型第三方组件库各自拆成独立 chunk（Vite 8 / Rolldown 的 codeSplitting）:
             - 原 cmx-data-comp barrel 把 igniteui-webcomponents(~978 文件)+ tabulator(整库)+ lit 等
               全合进一个 3MB chunk,Firefox 解析慢。拆开后:① 每库独立、内容哈希、可永久缓存(immutable);
               ② 浏览器并行解析多个小文件;③ 用不到的库(如某工作台不用 tabulator)不必随主 chunk 一起解析。
             priority 越大越先匹配：更具体的库(spreadsheets/grids/gauges)优先级高于 igniteui-webcomponents 主库。 */
          codeSplitting: {
            groups: [
              // Spreadsheet(商业)：excel 数据模型 + spreadsheet 视图，体量大且仅报表页用，须在 igniteui-webcomponents 主库之前匹配
              { name: 'vendor-ignite-spreadsheet', test: /node_modules[\\/]@infragistics[\\/](?:igniteui-webcomponents-spreadsheet|igniteui-webcomponents-excel)/, priority: 30 },
              { name: 'vendor-ignite-grids', test: /node_modules[\\/]@infragistics[\\/]igniteui-webcomponents-grids/, priority: 30 },
              { name: 'vendor-ignite-gauges', test: /node_modules[\\/]@infragistics[\\/]igniteui-webcomponents-gauges/, priority: 30 },
              // ignite 主库 + i18n 合并
              { name: 'vendor-ignite', test: /node_modules[\\/](?:igniteui-webcomponents|@infragistics[\\/]igniteui-webcomponents[\\/]|igniteui-i18n)/, priority: 25 },
              { name: 'vendor-tabulator', test: /node_modules[\\/]tabulator-tables/, priority: 20 },
              { name: 'vendor-revogrid', test: /node_modules[\\/]@revolist[\\/]revogrid/, priority: 20 },
              { name: 'vendor-treeview', test: /node_modules[\\/]@keenmate[\\/]web-treeview/, priority: 20 },
              { name: 'vendor-lit', test: /node_modules[\\/](?:lit-html|lit-element|@lit|@lit-labs|lit)[\\/]/, priority: 20 },
              // ai-workbench 独占：markdown-it(+依赖) 与 shiki 拆独立 chunk，按需懒加载，不进首屏
              { name: 'vendor-markdown', test: /node_modules[\\/](?:markdown-it|entities|linkify-it|mdurl)/, priority: 20 },
              { name: 'vendor-shiki', test: /node_modules[\\/](?:shiki|@shikijs)/, priority: 20 },
              { name: 'vendor-floating-ui', test: /node_modules[\\/]@floating-ui/, priority: 20 },
            ],
          },
        },
      },
    },
    optimizeDeps: {
      exclude: [
        '@ui5/webcomponents',
        '@ui5/webcomponents-base',
        '@ui5/webcomponents-fiori',
        '@ui5/webcomponents-icons',
        '@ui5/webcomponents-icons-tnt',
        '@ui5/webcomponents-icons-business-suite',
        '@ui5/webcomponents-localization',
        '@ui5/webcomponents-theming',
      ],
    },
  }
})
