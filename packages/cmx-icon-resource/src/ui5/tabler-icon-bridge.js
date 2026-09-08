/**
 * Tabler SVG → UI5 `<ui5-icon>` 桥接（按需懒加载）
 *
 * 不依赖 UI5 icon registry 是否与 bundle 共用同一模块实例，
 * 在 ui5-icon.onBeforeRendering 中直接注入 SVG 内容。
 */
import getSharedResource from '@ui5/webcomponents-base/dist/getSharedResource.js'

import {
  formatTablerUi5IconName,
  parseTablerIconName,
  prepareTablerSvgForUi5,
} from './tabler-icon-svg.js'

export { formatTablerUi5IconName, parseTablerIconName, prepareTablerSvgForUi5 }

const PACKAGE = 'cmx-icon-resource'
const VARIANTS = ['outline', 'filled']

/** @type {Record<string, Record<string, () => Promise<string>>>} */
const svgLoaders = {
  outline: import.meta.glob('../icons/tabler/outline/*.svg', {
    query: '?raw',
    import: 'default',
  }),
  filled: import.meta.glob('../icons/tabler/filled/*.svg', {
    query: '?raw',
    import: 'default',
  }),
}

/** @type {Map<string, string>} */
const svgRawCache = new Map()
/** @type {Map<string, Promise<string | null>>} */
const inflight = new Map()

let ui5Patched = false
/** @type {Promise<typeof import('@ui5/webcomponents-base/dist/asset-registries/Icons.js')> | null} */
let iconsApiPromise = null

function tablerCollection(variant) {
  return `tabler-${variant}`
}

function extractSvgParts(svg, variant) {
  return prepareTablerSvgForUi5(svg, variant)
}

function loaderKey(variant, iconName) {
  return `../icons/tabler/${variant}/${iconName}.svg`
}

function findSvgLoader(variant, iconName) {
  const loaders = svgLoaders[variant]
  if (!loaders) return null
  const direct = loaders[loaderKey(variant, iconName)]
  if (direct) return direct
  const suffix = `/${iconName}.svg`
  const entry = Object.entries(loaders).find(([path]) => path.endsWith(suffix))
  return entry?.[1] ?? null
}

async function getIconsApi() {
  if (!iconsApiPromise) {
    iconsApiPromise = import('@ui5/webcomponents-base/dist/asset-registries/Icons.js')
  }
  return iconsApiPromise
}

function writeSharedRegistry(variant, iconName, viewBox, inner) {
  const collection = tablerCollection(variant)
  const key = `${collection}/${iconName}`
  const registry = getSharedResource('SVGIcons.registry', new Map())
  registry.set(key, {
    collection,
    packageName: PACKAGE,
    viewBox,
    customTemplateAsString: inner,
    ltr: true,
  })
}

async function registerStubLoaders() {
  const { registerIconLoader } = await getIconsApi()
  for (const variant of VARIANTS) {
    const collection = tablerCollection(variant)
    registerIconLoader(collection, async () => ({
      collection,
      packageName: PACKAGE,
      data: {},
    }))
  }
}

/**
 * 加载 Tabler SVG 原文。
 * @param {'outline'|'filled'} variant
 * @param {string} iconName
 */
export async function loadTablerSvg(variant, iconName) {
  const v = String(variant).toLowerCase()
  const n = String(iconName).trim()
  if (!VARIANTS.includes(v) || !n) return null

  const cacheKey = `${v}/${n}`
  if (svgRawCache.has(cacheKey)) return svgRawCache.get(cacheKey)

  if (inflight.has(cacheKey)) {
    await inflight.get(cacheKey)
    return svgRawCache.get(cacheKey) ?? null
  }

  const loadPromise = (async () => {
    const loadFn = findSvgLoader(v, n)
    if (!loadFn) {
      console.warn(`[cmx-icon-resource] Tabler icon not found: ${v}/${n}`)
      return null
    }
    const raw = await loadFn()
    if (typeof raw !== 'string' || !raw.trim()) {
      console.warn(`[cmx-icon-resource] Tabler icon empty: ${v}/${n}`)
      return null
    }
    svgRawCache.set(cacheKey, raw)
    return raw
  })()

  inflight.set(cacheKey, loadPromise)
  try {
    return await loadPromise
  } finally {
    inflight.delete(cacheKey)
  }
}

/**
 * 将 Tabler SVG 应用到 ui5-icon 实例（跳过 registry）。
 * @param {HTMLElement & Record<string, unknown>} iconEl
 */
export async function applyTablerSvgToUi5Icon(iconEl, variant, iconName) {
  const raw = await loadTablerSvg(variant, iconName)
  if (!raw) return false

  const { viewBox, inner } = extractSvgParts(raw, variant)
  writeSharedRegistry(variant, iconName, viewBox, inner)

  iconEl.viewBox = viewBox
  iconEl.customTemplateAsString = inner
  iconEl.customTemplate = undefined
  iconEl.pathData = []
  iconEl.invalid = false
  iconEl.ltr = true
  iconEl.packageName = PACKAGE
  iconEl.accData = undefined
  if (!iconEl.accessibleName) {
    iconEl.effectiveAccessibleName = undefined
  }
  return true
}

/**
 * 按需注册单个 Tabler 图标到 UI5 registry（供 getIconData 等 API 使用）。
 */
export async function ensureTablerUi5Icon(variant, iconName) {
  const v = String(variant).toLowerCase()
  const n = String(iconName).trim()
  if (!VARIANTS.includes(v) || !n) return false

  const raw = await loadTablerSvg(v, n)
  if (!raw) return false

  const { viewBox, inner } = extractSvgParts(raw, variant)
  writeSharedRegistry(v, n, viewBox, inner)

  const { unsafeRegisterIcon, getIconDataSync } = await getIconsApi()
  unsafeRegisterIcon(n, {
    collection: tablerCollection(v),
    packageName: PACKAGE,
    viewBox,
    customTemplateAsString: inner,
    ltr: true,
  })
  return Boolean(getIconDataSync(formatTablerUi5IconName(v, n)))
}

function patchUi5Icon() {
  if (ui5Patched) return
  const Icon = customElements.get('ui5-icon')
  if (!Icon?.prototype?.onBeforeRendering) {
    console.warn('[cmx-icon-resource] ui5-icon not found; Tabler icons unavailable')
    return
  }

  const original = Icon.prototype.onBeforeRendering
  Icon.prototype.onBeforeRendering = async function tablerOnBeforeRendering() {
    const parsed = parseTablerIconName(this.name)
    if (parsed) {
      const canonical = formatTablerUi5IconName(parsed.variant, parsed.iconName)
      if (this.name !== canonical) this.name = canonical
      if (await applyTablerSvgToUi5Icon(this, parsed.variant, parsed.iconName)) {
        return
      }
    }
    return original.call(this)
  }
  ui5Patched = true
}

/**
 * 安装 Tabler → UI5 图标桥接。在 UI5 bundle 加载后调用一次即可。
 * 之后可直接：`<ui5-icon name="tabler-outline/home"></ui5-icon>`
 */
export async function installTablerUi5Icons() {
  await registerStubLoaders()
  if (customElements.get('ui5-icon')) {
    patchUi5Icon()
    return
  }
  await customElements.whenDefined('ui5-icon')
  patchUi5Icon()
}
