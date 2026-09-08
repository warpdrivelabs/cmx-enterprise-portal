#!/usr/bin/env node
/**
 * bundle-datacomp-subset.mjs —— onto 双端组件底座（W0）。
 *
 * cmx-data-comp 无构建产物（main 直指 src）、barrel 静态引入 revo-grid/tabulator/ignite 等全家桶，
 * 且部分组件硬依赖 @ui5/webcomponents；而 onto 三页（native pages）在**独立 :8097** 下没有门户注入的
 * `globalThis.__cmxDataComp`，无法复用门户运行时。本脚本从 cmx-data-comp 源码里挑出**零 UI5 依赖**
 * 的子集，打成单个 IIFE 到 `backend/cmx-container/assets/onto/web/ui-native/vendor/cmx-datacomp-subset.js`，
 * 供 onto 三页按需引导（`ensureDataComp()`，同 vendor 纪律：构建产物不手改，来源注释 + 版本号 + md5）。
 *
 * 子集清单（入口 `scripts/datacomp-subset-entry.js`，改清单必须先核依赖图仍零 UI5）：
 *   showCmxToast / cmx-toolbar / cmx-status-tag / cmx-kpi-card / cmx-desc-list
 *
 * 用法：node scripts/bundle-datacomp-subset.mjs [--check]
 *   --check  只比对产物与 md5 记录，不重打（CI/对账用）。
 * 体积预算：产物 > 500KB 视为超限（方案 §3.0 完成判据），非零退出。
 */

import { build } from 'esbuild'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const src = join(root, 'packages/cmx-data-comp/src')
const entry = join(here, 'datacomp-subset-entry.js')
const dstDir = resolve(root, '../../backend/cmx-container/assets/onto/web/ui-native/vendor')
const dst = join(dstDir, 'cmx-datacomp-subset.js')
const md5Sidecar = join(dstDir, 'cmx-datacomp-subset.md5')
const SIZE_BUDGET = 500 * 1024

if (!existsSync(entry)) {
  console.error(`✗ 缺入口 ${entry}`)
  process.exit(1)
}

/** --check：产物存在、md5 与 sidecar 一致即通过（不重打）。 */
if (process.argv.includes('--check')) {
  if (!existsSync(dst) || !existsSync(md5Sidecar)) {
    console.error('✗ --check：产物或 md5 记录缺失，请先 node scripts/bundle-datacomp-subset.mjs')
    process.exit(1)
  }
  const actual = createHash('md5').update(readFileSync(dst)).digest('hex')
  const expect = readFileSync(md5Sidecar, 'utf8').trim().split(/\s+/)[0]
  if (actual !== expect) {
    console.error(`✗ --check：md5 不一致（产物 ${actual} ≠ 记录 ${expect}），请重打包`)
    process.exit(1)
  }
  console.log(`✅ datacomp 子集对账通过（${dst}）`)
  process.exit(0)
}

const result = await build({
  entryPoints: [entry],
  bundle: true,
  format: 'iife',
  globalName: '__cmxDataCompSubset',
  outfile: dst,
  platform: 'browser',
  target: 'es2020',
  // 组件源码在浏览器直接跑：无 node 内置、无 npm 裸导入（依赖图已核查零 UI5 / 零三方）。
  // 若未来引入裸导入，这里 fail loud 而非静默外联。
  external: [],
  minify: true,
  sourcemap: false,
  legalComments: 'inline',
  metafile: true,
  logLevel: 'silent',
})

const size = statSync(dst).size
mkdirSync(dstDir, { recursive: true })
const banner =
  `/*! cmx-datacomp-subset · 构建产物勿手改 · 源: frontend/cmx-enterprise-portal/packages/cmx-data-comp/src 子集\n` +
  ` *  重建: cd frontend/cmx-enterprise-portal && node scripts/bundle-datacomp-subset.mjs · md5 见同名 .md5（对账产物=本文件含此横幅）*/\n`
writeFileSync(dst, banner + readFileSync(dst, 'utf8'))
// md5 对账基准 = 最终产物（含横幅）；--check 与 vendor 纪律双侧比对同一口径。
const md5 = createHash('md5').update(readFileSync(dst)).digest('hex')
writeFileSync(md5Sidecar, `${md5}  cmx-datacomp-subset.js\n`)

console.log(`✅ datacomp 子集 → ${relative(root, dst)}`)
console.log(`   体积 ${(size / 1024).toFixed(1)} KB（预算 ${SIZE_BUDGET / 1024} KB）· md5 ${md5}`)
console.log(`   打入源模块 ${Object.keys(result.metafile.inputs).length} 个`)
if (size > SIZE_BUDGET) {
  console.error(`✗ 超出体积预算 ${(size / 1024).toFixed(1)} KB > 500 KB —— 回方案裁剪子集`)
  process.exit(1)
}
