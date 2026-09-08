import { cpSync, createReadStream, existsSync, mkdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const pkgRoot = path.dirname(fileURLToPath(import.meta.url))
const metadataSrc = path.join(pkgRoot, 'src/metadata')

const META_FILES = [
  'common-attrs.json',
  'style-groups.json',
  'event-presets.json',
  'tag-index.json',
]

function copyMetadataTo(outDir) {
  const dest = path.join(outDir, 'metadata')
  mkdirSync(dest, { recursive: true })
  for (const file of META_FILES) {
    cpSync(path.join(metadataSrc, file), path.join(dest, file))
  }
  cpSync(path.join(metadataSrc, 'tags'), path.join(dest, 'tags'), { recursive: true })
}

function serveMetadataStatic(root, urlPrefix) {
  const absRoot = path.resolve(root)
  const prefix = urlPrefix.replace(/\/$/, '')
  return (req, res, next) => {
    if (!req.url) return next()
    const urlPath = decodeURIComponent(req.url.split('?')[0])
    // 不依赖 connect 的 mount-path strip（server.middlewares.use(prefix, fn) 会改写 req.url），
    // 由 handler 自身完整匹配 prefix，与 serveRuntimeStatic 风格一致。
    if (!urlPath.startsWith(prefix)) return next()
    const rel = urlPath.slice(prefix.length).replace(/^\//, '')
    const file = path.normalize(path.join(absRoot, rel))
    if (!file.startsWith(absRoot) || !existsSync(file) || !statSync(file).isFile()) {
      return next()
    }
    res.setHeader('Content-Type', 'application/json')
    createReadStream(file).pipe(res)
  }
}

/** 构建时复制 src/metadata JSON 至 dist/metadata/；开发时托管 /metadata/ */
export function designerMetadataPlugin() {
  /** @type {string} */
  let outDir = 'dist'

  return {
    name: 'cmx-html-designer-metadata',
    configResolved(config) {
      outDir = config.build.outDir
    },
    closeBundle() {
      copyMetadataTo(path.resolve(outDir))
    },
    configureServer(server) {
      const base = server.config.base
      const prefix = base === './' || base === ''
        ? '/metadata'
        : `${base.replace(/\/?$/, '')}/metadata`
      // 不用 mount-path 形式（server.middlewares.use(prefix, fn) 会改写 req.url），
      // 由 serveMetadataStatic 自身完整匹配 prefix。
      server.middlewares.use(serveMetadataStatic(metadataSrc, prefix))
    },
  }
}
