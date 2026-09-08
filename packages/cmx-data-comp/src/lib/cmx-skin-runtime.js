/**
 * cmx-skin-runtime — CMX 皮肤激活运行时（共享助手）
 *
 * 把"读 data-cmx-skin → 决定皮肤 → 注入 <style> → 切激活 class"的通用逻辑抽成一份，
 * 供 cmx-ui5-form / cmx-revo-grid / 展示类组件（cmx-panel / cmx-toolbar / ...）共用。
 * 遵循前端复用规范总则第 2 条「同一逻辑只允许存在一份实现」（见 cmx-components-guide 技能 frontend-conventions.md）。
 *
 * 设计要点：
 * - 纯函数 + 传参（不依赖 this），既可被组件方法外壳委托，也可在组件内部直接调用；
 * - 皮肤按 layer 分区（base < neo < page < custom），靠 append 顺序保证后者覆盖前者；
 * - resolveSkin 的优先级链：显式 data-cmx-skin → 逃生舱口属性 → 全局默认 → fallback。
 */

/** 皮肤 <style> 的 layer → 元素 id 映射规则（与 form/grid 历史约定一致） */
function skinStyleId (idBase, layer) {
  if (layer === 'neo') return `${idBase}-skin-neo`
  if (layer === 'page') return `${idBase}-skin-page`
  return `${idBase}-skin-custom`
}

/**
 * 注入皮肤 CSS 到指定 ShadowRoot（layer 分区，后 append 覆盖前）。
 * 复用既有节点（按 id 查找），无则创建并 append；cssText 为空时移除既有节点。
 *
 * @param {ShadowRoot|null|undefined} shadow 目标 ShadowRoot；空则直接返回
 * @param {string} idBase  id 前缀，如 'cmx-panel'（生成 'cmx-panel-skin-neo'）
 * @param {string} cssText 皮肤 CSS 文本；空串/假值则移除该 layer 的既有节点
 * @param {'neo'|'page'|'custom'} [layer='custom']
 * @returns {void}
 */
export function setSkinStyle (shadow, idBase, cssText, layer = 'custom') {
  if (!shadow) return
  const id = skinStyleId(idBase, layer)
  let el = shadow.getElementById(id)
  if (!cssText) {
    if (el) el.remove()
    return
  }
  if (!el) {
    el = document.createElement('style')
    el.id = id
    shadow.appendChild(el)
  }
  el.textContent = cssText
}

/**
 * 解析当前应生效的皮肤名。优先级：
 *   1. 显式 `data-cmx-skin` 属性（'neo'/'flat'/'none' 等）；
 *   2. 未设显式属性时，取 globalThis[globalKey]（门户启动时注入，如 '__cmxDefaultPanelSkin'）；
 *   3. 全局默认缺失则用 fallback（通常 'neo'）。
 *
 * 注意：逃生舱口属性（optOutAttrs，如 form 的 data-neo-form-lane）由调用方自行判断是否
 * 跳过本函数（grid 还有 data-neo-grid-tone 等），本函数不处理 opt-out，保持单一职责。
 *
 * @param {HTMLElement} host      宿主元素（读 data-cmx-skin）
 * @param {string} globalKey      全局默认键名，如 '__cmxDefaultPanelSkin'
 * @param {string} fallback       全局默认缺失时的兜底，通常 'neo'
 * @returns {string} 归一化小写皮肤名（'neo' / 'flat' / 'none' / ...）
 */
export function resolveSkin (host, globalKey, fallback = 'neo') {
  const raw = host.getAttribute('data-cmx-skin')
  if (raw != null && raw.trim() !== '') return raw.trim().toLowerCase()
  const globalDefault = globalThis[globalKey]
  if (typeof globalDefault === 'string' && globalDefault.trim()) {
    return globalDefault.trim().toLowerCase()
  }
  return fallback
}

/**
 * 一站式：解析皮肤 → 若为 neo 则注入 neo 皮肤 CSS + 加激活 class → 返回生效皮肤名。
 * 供组件 `_applySkin()` 单行调用，消除 form/grid/展示组件里的复制粘贴。
 *
 * 调用方负责：
 * - 在 neo 之外的特殊分支（grid 的 flat/embed）自行处理后再调用本函数；
 * - optOutAttrs（逃生舱口）命中时不要调用本函数；
 * - page 级 `data-cmx-style-id` 覆盖由 `applyPageStyleId` 单独处理。
 *
 * @param {object} opts
 * @param {HTMLElement} opts.host        宿主元素（加激活 class）
 * @param {ShadowRoot} opts.shadow       目标 ShadowRoot（注入 <style>）
 * @param {string} opts.idBase           id 前缀，如 'cmx-panel'
 * @param {string} opts.neoCss           neo 皮肤 CSS 文本
 * @param {string} opts.globalKey        全局默认键名，如 '__cmxDefaultPanelSkin'
 * @param {string} [opts.fallback='neo'] 全局默认缺失时的兜底
 * @param {string} [opts.activeClass]    neo 激活 class，如 'cmx-panel-neo'（默认 `${idBase}-neo`）
 * @param {(tone:string)=>string|null} [opts.toneClass] 可选，按 data-cmx-skin-tone 生成变体 class（如 'cmx-grid-neo--mint'）；返回 null/空则不加
 * @returns {string} 实际生效的皮肤名（'neo' / 'flat' / 'none' ...）
 */
export function applyNeoSkin (opts) {
  const {
    host, shadow, idBase, neoCss, globalKey,
    fallback = 'neo',
    activeClass = `${idBase}-neo`,
    toneClass,
  } = opts
  const skin = resolveSkin(host, globalKey, fallback)
  if (skin === 'neo') {
    host.classList.add(activeClass)
    if (typeof toneClass === 'function') {
      const tone = (host.getAttribute('data-cmx-skin-tone') || '').trim().toLowerCase()
      const cls = toneClass(tone)
      if (cls) host.classList.add(cls)
    }
    setSkinStyle(shadow, idBase, neoCss, 'neo')
  }
  return skin
}

/**
 * 读取 `data-cmx-style-id` 指向的同页 `<template>` / `<style>` 节点 CSS，
 * 作为页面级覆盖皮肤注入（layer='page'）。
 * 查找范围：先在宿主所在根节点（含 ShadowRoot）找，再降级到 document。
 *
 * @param {HTMLElement} host   宿主元素（读 data-cmx-style-id + getRootNode）
 * @param {ShadowRoot} shadow  目标 ShadowRoot（注入 <style>）
 * @param {string} idBase      id 前缀
 * @returns {void}
 */
export function applyPageStyleId (host, shadow, idBase) {
  const styleId = host.getAttribute('data-cmx-style-id')
  if (!styleId) return
  const root = host.getRootNode()
  const node = (root && typeof root.getElementById === 'function' && root.getElementById(styleId))
    || document.getElementById(styleId)
  if (!node) return
  const css = node instanceof HTMLTemplateElement ? node.innerHTML : (node.textContent || '')
  if (css.trim()) setSkinStyle(shadow, idBase, css, 'page')
}
