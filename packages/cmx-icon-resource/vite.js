import path from 'node:path'
import { fileURLToPath } from 'node:url'

const pkgRoot = path.dirname(fileURLToPath(import.meta.url))
const iconsRoot = path.join(pkgRoot, 'src/icons')
const tablerRoot = path.join(iconsRoot, 'tabler')

/**
 * Vite resolve.alias 片段，供 CMXPortalManager、CMXHTMLDesigner 等消费方合并进配置。
 *
 * 启用后可写：
 *   import homeUrl from 'tabler/outline/home.svg'
 *   import homeUrl from 'cmx-icon-resource/tabler/outline/home.svg'
 */
const UI5_ICON_CHUNK_NAMES = new Set(['ui5-icons-core', 'ui5-icons-tnt', 'ui5-icons-bs'])

/**
 * Tabler SVG 懒加载 chunk（import.meta.glob ?raw）与 UI5 图标 bundle。
 * @param {import('rollup').PreRenderedChunk} chunkInfo
 */
export function isCmxIconRollupChunk(chunkInfo) {
  const chunkName = chunkInfo.name ?? ''
  if (UI5_ICON_CHUNK_NAMES.has(chunkName)) return true

  const moduleIds = [chunkInfo.facadeModuleId, ...(chunkInfo.moduleIds ?? [])].filter(Boolean)
  return moduleIds.some((id) => {
    const normalized = id.replace(/\\/g, '/')
    return /\/icons\/tabler\/.+\.svg(\?|$)/.test(normalized)
  })
}

/** Rollup chunkFileNames：图标 chunk → dist/images/，其余 → dist/assets/ */
export function cmxIconResourceChunkFileNames(chunkInfo) {
  return isCmxIconRollupChunk(chunkInfo)
    ? 'images/[name]-[hash].js'
    : 'assets/[name]-[hash].js'
}

/**
 * 构建时去掉 dist/images/ 下图标 chunk 的 source map（Tabler 懒加载 + UI5 图标包）。
 * 与 `build.sourcemap: true` 联用：assets/ 主包保留 map，images/ 不产出 .map。
 */
export function cmxIconResourceStripIconSourceMapsPlugin() {
  return {
    name: 'cmx-icon-resource-strip-icon-sourcemaps',
    generateBundle(_options, bundle) {
      for (const [fileName, item] of Object.entries(bundle)) {
        if (!fileName.startsWith('images/')) continue
        if (fileName.endsWith('.map')) {
          delete bundle[fileName]
          continue
        }
        if (item.type === 'chunk') {
          item.map = null
          item.code = item.code.replace(/\n\/\/# sourceMappingURL=.*$/m, '')
        }
      }
    },
  }
}

export function cmxIconResourceResolveAliases() {
  return [
    {
      find: /^tabler\/(.+)$/,
      replacement: `${tablerRoot}/$1`,
    },
    {
      find: /^cmx-icon-resource\/tabler\/(.+)$/,
      replacement: `${tablerRoot}/$1`,
    },
    {
      find: /^cmx-icon-resource\/icons\/(.+)$/,
      replacement: `${iconsRoot}/$1`,
    },
    {
      find: /^cmx-icon-resource$/,
      replacement: path.join(pkgRoot, 'src/index.js'),
    },
  ]
}
