/**
 * 从本包或 monorepo 根 node_modules 启动 Vite CLI。
 * 避免 npm 将 vite 复制到 .bin 后相对路径 `../dist/node/cli.js` 解析失败。
 */
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const viteBinCandidates = [
  path.join(pkgRoot, 'node_modules', 'vite', 'bin', 'vite.js'),
  path.join(pkgRoot, '..', 'node_modules', 'vite', 'bin', 'vite.js'),
]

const viteBin = viteBinCandidates.find(existsSync)
if (!viteBin) {
  console.error(
    '[cmx-html-designer] 未找到 vite。请在仓库根目录执行: npm install',
  )
  process.exit(1)
}

const result = spawnSync(process.execPath, [viteBin, ...process.argv.slice(2)], {
  stdio: 'inherit',
  cwd: pkgRoot,
  env: process.env,
})

process.exit(result.status ?? 1)
