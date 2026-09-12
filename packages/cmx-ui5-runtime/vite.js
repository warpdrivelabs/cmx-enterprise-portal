import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promises as fsp } from 'node:fs'
import zlib from 'node:zlib'
import { promisify } from 'node:util'
import {
  cmxIconResourceChunkFileNames,
  cmxIconResourceResolveAliases,
  cmxIconResourceStripIconSourceMapsPlugin,
} from 'cmx-icon-resource/vite'

const pkgRoot = path.dirname(fileURLToPath(import.meta.url))
const presentationRoot = path.resolve(pkgRoot, '../..')

const LOCALE_DATA_BARE_SOURCE =
  '@ui5/webcomponents-localization/dist/generated/json-imports/LocaleData.js'
const LOCALE_DATA_TARGET = path.resolve(pkgRoot, 'src/locale-data-whitelist.js')

/** locale data 白名单插件：将 UI5 的全量 LocaleData.js（~400 locale JSON）重定向到只含 zh_CN/zh_TW/en 的 shim。
 *  dev 模式下 Portal/Designer import install.js 时，需引入此插件避免加载全量 locale。
 *  build 模式下由 cmx-ui5-runtime 自身的 vite 构建引入。 */
export const localeDataWhitelistPlugin = {
  name: 'cmx-ui5-runtime-locale-data-whitelist',
  enforce: 'pre',
  async resolveId(source, importer) {
    if (source === LOCALE_DATA_BARE_SOURCE) return LOCALE_DATA_TARGET
    if (
      source.endsWith('/json-imports/LocaleData.js')
      && (source.includes('@ui5/webcomponents-localization')
        || (importer && importer.includes('@ui5/webcomponents-localization')))
    ) {
      return LOCALE_DATA_TARGET
    }
    return null
  },
}

const manifestPlugin = {
  name: 'cmx-ui5-runtime-manifest',
  generateBundle(_options, bundle) {
    const entry = Object.entries(bundle).find(
      ([name, item]) => item.type === 'chunk' && item.isEntry && name.startsWith('assets/'),
    )?.[0]
    if (!entry) {
      this.warn('[cmx-ui5-runtime] 未找到 entry chunk，跳过 manifest.json')
      return
    }
    this.emitFile({
      type: 'asset',
      fileName: 'manifest.json',
      source: JSON.stringify(
        {
          base: '/shared/',
          entry,
          builtAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    })
    this.emitFile({
      type: 'asset',
      fileName: 'index.html',
      source: `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>CMX UI5 Runtime</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 40rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.5; }
    code { background: #f4f4f5; padding: 0.1em 0.35em; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>CMX UI5 Runtime</h1>
  <p>Portal 与 HTML 设计器共用的 UI5 + Tabler 运行时包，由应用通过 <code>/shared/assets/install-*.js</code> 动态加载。</p>
  <ul>
    <li><a href="manifest.json">manifest.json</a> — 构建入口与版本信息</li>
  </ul>
</body>
</html>
`,
    })
  },
}

/** @returns {import('vite').UserConfig} */
export function defineCmxUi5RuntimeViteConfig() {
  return {
    base: '/shared/',
    plugins: [
      localeDataWhitelistPlugin,
      cmxIconResourceStripIconSourceMapsPlugin(),
      manifestPlugin,
      cmxPrecompressPlugin(),
    ],
    resolve: {
      alias: [
        ...cmxIconResourceResolveAliases(),
        {
          find: /^cmx-icon-resource\/ui5(?:\/index\.js)?$/,
          replacement: path.resolve(presentationRoot, 'packages/cmx-icon-resource/src/ui5/index.js'),
        },
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
      ],
    },
    build: {
      target: 'es2022',
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: true,
      chunkSizeWarningLimit: 1500,
      rollupOptions: {
        input: {
          install: path.resolve(pkgRoot, 'src/install.js'),
        },
        output: {
          entryFileNames: 'assets/install-[hash].js',
          chunkFileNames: cmxIconResourceChunkFileNames,
          manualChunks(id) {
            if (!id.includes('node_modules') && !id.includes('locale-data-whitelist')) return
            if (id.includes('@ui5/webcomponents-icons-business-suite')) return 'ui5-icons-bs'
            if (id.includes('@ui5/webcomponents-icons-tnt')) return 'ui5-icons-tnt'
            if (id.includes('@ui5/webcomponents-icons')) return 'ui5-icons-core'
            if (id.includes('@ui5/webcomponents-fiori')) return 'ui5-fiori'
            if (id.includes('@ui5/webcomponents-localization')) return 'ui5-localization'
            if (id.includes('locale-data-whitelist')) return 'ui5-localization'
            if (id.includes('@ui5/webcomponents-theming')) return 'ui5-theming'
            if (id.includes('@ui5/webcomponents-base')) return 'ui5-base'
            if (id.includes('@ui5/webcomponents')) return 'ui5-main'
            if (
              id.includes('/lit/')
              || id.includes('/lit-html/')
              || id.includes('/lit-element/')
              || id.includes('/@lit/')
            ) return 'lit'
          },
        },
      },
    },
    optimizeDeps: {
      exclude: [
        '@ui5/webcomponents',
        '@ui5/webcomponents-fiori',
        '@ui5/webcomponents-icons',
        '@ui5/webcomponents-icons-tnt',
        '@ui5/webcomponents-icons-business-suite',
      ],
    },
  }
}

/* 可压缩的文本类扩展名（woff/ttf 为裸字体，gzip 后约省一半；woff2/png 等已压缩格式不压）。 */
const PRECOMPRESS_EXTS = new Set([
  '.js', '.mjs', '.css', '.html', '.htm', '.json',
  '.svg', '.txt', '.xml', '.map', '.woff', '.ttf',
])
const PRECOMPRESS_MIN_BYTES = 1024
const PRECOMPRESS_CONCURRENCY = 8
/* brotli 质量：默认 9（比 gzip9 再小 ~10%，构建时间可接受）；发版构建可设
   CMX_PRECOMPRESS_BR_QUALITY=11 换极限体积（11 比 9 慢 ~4 倍）。 */
const PRECOMPRESS_BR_QUALITY = Number(process.env.CMX_PRECOMPRESS_BR_QUALITY || 9)

const gzipAsync = promisify(zlib.gzip)
const brotliAsync = promisify(zlib.brotliCompress)

/** @param {string} dir @returns {Promise<string[]>} */
async function collectPrecompressFiles(dir) {
  const files = []
  const walk = async (sub) => {
    for (const entry of await fsp.readdir(sub, { withFileTypes: true })) {
      const full = path.join(sub, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
      } else if (
        entry.isFile()
        && !entry.name.endsWith('.gz')
        && !entry.name.endsWith('.br')
        && PRECOMPRESS_EXTS.has(path.extname(entry.name).toLowerCase())
      ) {
        files.push(full)
      }
    }
  }
  await walk(dir)
  return files
}

/** 预压缩产物插件：build 收尾为 outDir 内文本类静态资源生成同名 `.gz` / `.br` 伴生文件，
 *  供服务端 ServeDir 的 precompressed_gzip/br 按 Accept-Encoding 直出（运行时零压缩 CPU 开销）。
 *  <1KB 小文件与已压缩格式跳过；预压缩文件缺失时服务端自动回退原文件，新旧 dist 混部安全。
 *  ui5-runtime / Portal / Designer 三处构建共享本插件。 */
export function cmxPrecompressPlugin() {
  /** @type {import('vite').ResolvedConfig} */
  let resolvedConfig
  return {
    name: 'cmx-precompress',
    apply: 'build',
    configResolved(config) { resolvedConfig = config },
    async closeBundle() {
      const outDir = path.resolve(resolvedConfig.root, resolvedConfig.build.outDir)
      const startedAt = Date.now()
      const files = await collectPrecompressFiles(outDir)
      const candidates = []
      for (const file of files) {
        if ((await fsp.stat(file)).size < PRECOMPRESS_MIN_BYTES) continue
        candidates.push(file)
      }
      if (candidates.length === 0) return
      console.log(`[cmx-precompress] 生成 .gz/.br 伴生文件：${candidates.length} 个文件…`)
      let srcBytes = 0
      let gzBytes = 0
      let brBytes = 0
      for (let i = 0; i < candidates.length; i += PRECOMPRESS_CONCURRENCY) {
        await Promise.all(candidates.slice(i, i + PRECOMPRESS_CONCURRENCY).map(async (file) => {
          const data = await fsp.readFile(file)
          const [gz, br] = await Promise.all([
            gzipAsync(data, { level: 9 }),
            brotliAsync(data, {
              params: { [zlib.constants.BROTLI_PARAM_QUALITY]: PRECOMPRESS_BR_QUALITY },
            }),
          ])
          await Promise.all([
            fsp.writeFile(`${file}.gz`, gz),
            fsp.writeFile(`${file}.br`, br),
          ])
          srcBytes += data.length
          gzBytes += gz.length
          brBytes += br.length
        }))
      }
      const mb = (n) => `${(n / 1024 / 1024).toFixed(1)}MB`
      console.log(
        `[cmx-precompress] 完成：${mb(srcBytes)} → gz ${mb(gzBytes)} / br ${mb(brBytes)}，`
        + `耗时 ${((Date.now() - startedAt) / 1000).toFixed(1)}s`,
      )
    },
  }
}
