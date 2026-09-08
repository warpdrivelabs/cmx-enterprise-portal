function tablerCollection(variant) {
  return `tabler-${variant}`
}

/**
 * @param {string | undefined | null} name ui5-icon name
 * @returns {{ variant: string, iconName: string } | null}
 */
export function parseTablerIconName(name) {
  if (!name) return null
  let m = name.match(/^tabler-(outline|filled)\/([a-z0-9-]+)$/i)
  if (m) return { variant: m[1].toLowerCase(), iconName: m[2] }
  m = name.match(/^tabler\/(outline|filled)\/([a-z0-9-]+)$/i)
  if (m) return { variant: m[1].toLowerCase(), iconName: m[2] }
  return null
}

/** UI5 registry / name 属性使用的规范写法 */
export function formatTablerUi5IconName(variant, iconName) {
  return `${tablerCollection(variant)}/${iconName}`
}

function parseSvgRootAttrs(openTag) {
  /** @type {Record<string, string>} */
  const attrs = {}
  const re = /\b([a-zA-Z][\w-]*)\s*=\s*"([^"]*)"/g
  let m
  while ((m = re.exec(openTag))) {
    attrs[m[1].toLowerCase()] = m[2]
  }
  return attrs
}

/** Tabler 占位 path，在 UI5 fill:currentColor 下会变成整块黑底 */
function stripTablerBoundingPath(inner) {
  return inner.replace(
    /<path\b[^>]*\bd=["']M0\s0h24v24H0z["'][^>]*\/?>\s*/gi,
    '',
  )
}

/** outline 子元素缺 fill 时会继承 UI5 host 的 fill:currentColor → 实心黑块 */
function addFillNoneWhereMissing(inner) {
  return inner.replace(
    /<(path|polyline|polygon|line|rect|circle|ellipse)(\s[^>]*?)(\s*\/?>)/gi,
    (full, tag, attrs, end) => {
      if (/\bfill\s*=/.test(attrs)) return full
      return `<${tag}${attrs} fill="none"${end}`
    },
  )
}

function wrapOutlineStrokeGroup(inner, rootAttrs) {
  const stroke = rootAttrs.stroke ?? 'currentColor'
  const strokeWidth = rootAttrs['stroke-width'] ?? '2'
  const strokeLinecap = rootAttrs['stroke-linecap'] ?? 'round'
  const strokeLinejoin = rootAttrs['stroke-linejoin'] ?? 'round'
  return `<g stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="${strokeLinecap}" stroke-linejoin="${strokeLinejoin}">${inner}</g>`
}

/**
 * 从 Tabler SVG 提取 UI5 customTemplateAsString 可用片段。
 * outline 需补 stroke 组 + fill="none"，否则在 UI5 里会被 currentColor 填成黑块。
 */
export function prepareTablerSvgForUi5(svg, variant) {
  const openTagMatch = svg.match(/^[\s\S]*?<svg[^>]*>/i)
  if (!openTagMatch) return { viewBox: '0 0 24 24', inner: svg.trim() }

  const viewBoxMatch = svg.match(/\bviewBox="([^"]+)"/i)
  const viewBox = viewBoxMatch?.[1] ?? '0 0 24 24'
  const rootAttrs = parseSvgRootAttrs(openTagMatch[0])

  let inner = svg
    .slice(openTagMatch[0].length)
    .replace(/<\/svg>\s*$/i, '')
    .trim()

  inner = stripTablerBoundingPath(inner)

  if (String(variant).toLowerCase() === 'outline') {
    inner = addFillNoneWhereMissing(inner)
    inner = wrapOutlineStrokeGroup(inner, rootAttrs)
  }

  return { viewBox, inner }
}
