/**
 * 将服务端保存的 HTML 页（与 CMXHTMLDesigner 一致）规范为可运行整页，供门户 `html_pages` 视图在宿主文档内注入执行。
 * 依赖 Vite `resolve.alias`：`@cmx-html-designer` → CMXHTMLDesigner 根目录。
 */
import { normalizeServerPageHtmlForDebug } from '@cmx-html-designer/src/utils/normalize-server-page-html-for-debug.js'
import { getScope, registerView, unregisterView, scopeIdFromDom } from './mainapp.js'
import { ActionRegistry } from './action-registry.js'
import { wireMultiViewTabReorderInRoot } from './tab-strip-reorder.js'

/**
 * @param {string|{id?:string, domain?:string, app?:string, module?:string}} pageMeta 页面 id 或含坐标的元信息
 * @param {string} html 接口返回的 `html` 字段
 * @returns {string} 完整 HTML 文档（含 template、cmx-html-pages-* 宿主、__hydrateEvents 与可执行脚本）
 */
export function buildRunnableHtmlDocumentForPage (pageMeta, html) {
  // 统一成对象形态（normalize 内部也兼容字符串，这里归一便于日志/调试）
  const pm = typeof pageMeta === 'string' ? { id: pageMeta } : (pageMeta || {})
  return normalizeServerPageHtmlForDebug(String(html ?? ''), pm)
}

/**
 * 从整页 HTML 中拆出「仅结构展示」片段：`<template id="cmx-page-template-…">` 与紧随的 `cmx-html-pages-*` 宿主（不含可执行 script），
 * 用于在上部区域做静态结构预览（避免在门户主文档执行页面脚本）。
 * @param {string} fullDoc {@link buildRunnableHtmlDocumentForPage} 的返回值
 * @returns {{ structureHtml: string, scriptTexts: string[] }}
 */
export function extractTemplateHostAndScriptsFromFullDoc (fullDoc) {
  const doc = new DOMParser().parseFromString(String(fullDoc ?? ''), 'text/html')
  const tpl = doc.body?.querySelector('template[id^="cmx-page-template-"]')
  const host = doc.body?.querySelector('[data-cmx-html-page-host]')
  let structureHtml = ''
  if (tpl) structureHtml += tpl.outerHTML
  if (host) structureHtml += host.outerHTML

  /** @type {string[]} */
  const scriptTexts = []
  doc.querySelectorAll('script').forEach((s) => {
    const type = (s.getAttribute('type') || '').trim().toLowerCase()
    if (type && type !== 'text/javascript' && type !== 'application/javascript' && type !== 'module') return
    if (s.src) return
    const t = s.textContent ?? ''
    if (t.trim()) scriptTexts.push(t)
  })
  return { structureHtml, scriptTexts }
}

/**
 * 将单条接口返回的 HTML 页记录扩展为门户展示用字段（与 {@link buildRunnableHtmlDocumentForPage} / {@link extractTemplateHostAndScriptsFromFullDoc} 一致）。
 * @param {{ id?: string, html?: string, domain?: string, app?: string, module?: string }|null|undefined} page
 * @returns {{ runnableDoc: string, structureHtml: string, scriptTexts: string[], previewError: string }}
 */
export function enrichHtmlPageViewDataFields (page) {
  if (!page || typeof page !== 'object' || page.html == null) {
    return { runnableDoc: '', structureHtml: '', scriptTexts: [], previewError: '' }
  }
  // 组装页面元信息：id + 后端 batch 返回的 domain/app/module/doc，供运行时注入 host.$coord。
  const pageMeta = {
    id: page.id != null && String(page.id).trim() ? String(page.id).trim() : 'unnamed',
    domain: page.domain || '',
    app: page.app || '',
    module: page.module || '',
    doc: page.doc || '',
  }
  try {
    const full = buildRunnableHtmlDocumentForPage(pageMeta, String(page.html))
    const { structureHtml, scriptTexts } = extractTemplateHostAndScriptsFromFullDoc(full)
    return { runnableDoc: full, structureHtml, scriptTexts, previewError: '' }
  } catch (e) {
    return {
      runnableDoc: '',
      structureHtml: '',
      scriptTexts: [],
      previewError: e instanceof Error ? e.message : String(e),
    }
  }
}

/**
 * 批量为 `GET/POST html-pages` 返回的 `pages[]` 每一项附加 `htmlPageRunnableDoc` 等字段（原地合并到对象上）。
 * @param {unknown[]} pages
 */
export function enrichBatchHtmlPagesWithPreviewFields (pages) {
  if (!Array.isArray(pages)) return
  for (const p of pages) {
    if (!p || typeof p !== 'object') continue
    const o = /** @type {Record<string, unknown>} */ (p)
    const ex = enrichHtmlPageViewDataFields(/** @type {{ id?: string, html?: string }} */ (p))
    if (ex.runnableDoc) o.htmlPageRunnableDoc = ex.runnableDoc
    if (ex.structureHtml) o.htmlPagePreviewStructure = ex.structureHtml
    if (ex.scriptTexts.length) o.htmlPageExecutableScripts = ex.scriptTexts
    if (ex.previewError) o.htmlPagePreviewError = ex.previewError
  }
}

/**
 * 将已解析的整页 HTML 的 `body` 子节点顺序挂入占位槽并执行脚本（新建 `script` 节点才会执行）。
 *
 * mainapp 注册：
 * - 从 slot 向上找 `data-cmx-workspace-id`（wsId 或 `actv:<id>`）定位 scope；
 * - 找 `data-cmx-region` / `data-cmx-view-id`（渲染层包装所写，见 {@link renderWorkspaceRegionViewsHtml}）；
 * - 注入前设置 `globalThis.workspace = scope`，顶层脚本可 `const ws = workspace` 捕获；
 * - 注入后定位生成的 `cmx-html-pages-*` 宿主，`registerView(...)` 写入 `scope.views[viewId]`；
 * - 宿主被 `disconnectedCallback` 触发或从 DOM 移除时 `unregisterView(...)`。
 *
 * @param {HTMLElement} slot
 * @param {string} docStr
 * @param {typeof globalThis|undefined} g
 */
function injectParsedHtmlBodyIntoRunSlot (slot, docStr, g) {
  while (slot.firstChild) slot.removeChild(slot.firstChild)
  const trimmed = String(docStr ?? '').trim()
  if (!trimmed) return

  const parsed = new DOMParser().parseFromString(trimmed, 'text/html')
  const body = parsed.body
  if (!body) return

  /** @type {unknown} */
  const prevTr = g && Object.prototype.hasOwnProperty.call(g, '__cmxTemplateRoot')
    ? /** @type {{ __cmxTemplateRoot?: unknown }} */ (g).__cmxTemplateRoot
    : undefined
  /** @type {unknown} */
  const prevWs = g && Object.prototype.hasOwnProperty.call(g, 'workspace')
    ? /** @type {{ workspace?: unknown }} */ (g).workspace
    : undefined

  /* 向上找 scope & viewId；视图 wrapper 已在 renderWorkspaceRegionViewsHtml 写入 data-cmx-region/view-id。 */
  const scopeId = scopeIdFromDom(slot)
  const scope = scopeId ? getScope(scopeId) : null
  const viewWrapper = findAncestorWithDataset(slot, 'cmxViewId')
  const viewId = viewWrapper?.dataset?.cmxViewId || ''
  const region = /** @type {any} */ (viewWrapper?.dataset?.cmxRegion) || ''
  const htmlPageHostSpec = slot.closest('.cmx-html-pages-view')
  const pageId = htmlPageHostSpec instanceof HTMLElement
    ? (htmlPageHostSpec.dataset.cmxHtmlPageId || '')
    : ''

  if (g) /** @type {{ __cmxTemplateRoot?: unknown }} */ (g).__cmxTemplateRoot = slot
  if (g && scope) /** @type {{ workspace?: unknown }} */ (g).workspace = scope
  try {
    const nodes = Array.from(body.children)
    for (const child of nodes) {
      if (child.nodeName !== 'SCRIPT') {
        slot.appendChild(document.importNode(child, true))
        continue
      }
      const src = child.getAttribute('src')
      const s = document.createElement('script')
      const typ = child.getAttribute('type')
      if (typ) s.type = typ
      if (src) {
        s.src = src
        if (child.hasAttribute('async')) s.async = true
        if (child.hasAttribute('defer')) s.defer = true
        for (const { name, value } of Array.from(child.attributes)) {
          if (name === 'src' || name === 'type' || name === 'async' || name === 'defer') continue
          s.setAttribute(name, value)
        }
        slot.appendChild(s)
      } else {
        s.textContent = child.textContent ?? ''
        slot.appendChild(s)
      }
    }
    /* 刷新修复：CE 只 define 一次，IIFE 闭包捕获的 templateRoot 指向首次加载的旧 slot，
       导致 connectedCallback 从已脱离 DOM 的旧 slot 克隆旧模板。
       此处以当前 slot 中的 <template> 为准：若 shadow root 内容与当前模板不一致，
       用当前模板覆盖 shadow root 并重新水合事件，确保刷新后展示最新页面。 */
    const curTpl = /** @type {HTMLTemplateElement|null} */ (slot.querySelector('template[id^="cmx-page-template-"]'))
    if (curTpl && curTpl.content) {
      for (const host of /** @type {HTMLElement[]} */ ([...slot.querySelectorAll('[data-cmx-html-page-host]')])) {
        const sr = host.shadowRoot
        if (!sr) continue
        // 比较 shadow root（除 <style>）与当前模板内容；一致则跳过（首次加载正常路径）
        const srHtml = Array.from(sr.childNodes)
          .filter((n) => !(n.nodeType === 1 && /** @type {Element} */ (n).tagName === 'STYLE'))
          .map((n) => (n.nodeType === 1 ? /** @type {Element} */ (n).outerHTML : n.textContent))
          .join('')
        if (srHtml.trim() === curTpl.innerHTML.trim()) continue
        // 内容不一致（CE 使用了旧模板）→ 用当前模板替换
        const style = sr.querySelector('style')
        // eslint-disable-next-line no-restricted-syntax -- 清空容器（空串无内容），随后 appendChild 重建
        sr.innerHTML = ''
        if (style) sr.appendChild(style)
        sr.appendChild(curTpl.content.cloneNode(true))
        try {
          if (typeof globalThis.__hydrateEvents === 'function') globalThis.__hydrateEvents(sr, host)
        } catch (e) {
          console.warn('[cmx-html-pages] re-hydrate after template refresh failed', e)
        }
      }
    }
    /* 自主标签默认 display:inline，在侧栏/底部 flex 链里会塌成 0 高或不可见；显式占满槽宽 */
    slot.querySelectorAll('[data-cmx-html-page-host]').forEach((el) => {
      if (!(el instanceof HTMLElement)) return
      el.style.display = 'block'
      el.style.width = '100%'
      el.style.minWidth = '0'
      el.style.boxSizing = 'border-box'
      el.style.flex = '1 1 auto'
      el.style.minHeight = '0'
      el.style.alignSelf = 'stretch'
    })
    /* mainapp 注册：找生成的 CE 宿主。CMXHTMLDesigner 的 wrapHtmlDocument 会在 body 内写
       <cmx-html-pages-* data-cmx-html-page-host>。两条都可作识别标志。 */
    if (scope && viewId) {
      const hostEl = /** @type {HTMLElement|null} */ (
        slot.querySelector('[data-cmx-html-page-host]')
        || slot.querySelector('[class^="cmx-html-pages-"]')
      )
      if (hostEl instanceof HTMLElement) {
        registerView(scopeId, viewId, region || 'content', pageId, hostEl)
        /* 静态 props（菜单 view 配置）：从 shell div 的 data-cmx-page-props 回读，
           挂到 host.props 供 pageFns 读取（与 native_pages 的 ctx.props 对齐）。
           时序：此处与 script 注入同一同步执行流，initPageModels 是异步 .then()，
           pageInterface.initPage 在模型就绪后才被业务调用，故 host.props 早于 pageFns 实际读取。 */
        if (/** @type {any} */ (hostEl).props == null) {
          const propsJson = htmlPageHostSpec instanceof HTMLElement
            ? (htmlPageHostSpec.dataset.cmxPageProps || '')
            : ''
          if (propsJson) {
            try { /** @type {any} */ (hostEl).props = JSON.parse(propsJson) }
            catch (e) { console.warn('[cmx-html-pages] data-cmx-page-props JSON 解析失败', e) }
          } else {
            /** @type {any} */ (hostEl).props = {}
          }
        }
        /* 给 host 挂 lazy `actions` getter：脚本首次访问 host.actions 时建 host 级 registry，
           parent = 当前 workspace.actions，自动订阅 workspace.context 与父级 key。 */
        try {
          Object.defineProperty(hostEl, 'actions', {
            configurable: true,
            get () {
              if (!/** @type {any} */ (this).__hostActions) {
                /** @type {any} */ (this).__hostActions = new ActionRegistry({
                  parent: scope ? /** @type {any} */ (scope).actions : null,
                  helpers: { workspaceCtx: scope ? /** @type {any} */ (scope).context : undefined, workspace: scope, host: this },
                })
              }
              return /** @type {any} */ (this).__hostActions
            },
          })
        } catch { /* host 被冻结时忽略 */ }
        /* 卸载钩子：CMXHTMLDesigner 的 CE disconnectedCallback 会调 `this.__cmxDispose?.()`，我们在此链上注入
           注销逻辑；同时配合 MutationObserver 兜底——用户若没触发 disconnect（比如外层 innerHTML 直接清掉）也能摘除。 */
        const prevDispose = /** @type {any} */ (hostEl).__cmxDispose
        ;/** @type {any} */ (hostEl).__cmxDispose = function () {
          try {
            if (typeof prevDispose === 'function') prevDispose.call(this)
          } finally {
            disconnectHostRemovalObserver(hostEl)
            unregisterView(scopeId, viewId, hostEl)
            /* host 级 registry 释放：disconnect 是确定的销毁信号。 */
            const ha = /** @type {any} */ (hostEl).__hostActions
            if (ha && typeof ha.dispose === 'function') {
              try { ha.dispose() } catch (e) { console.warn('[mainapp] host.actions dispose threw', e) }
              /** @type {any} */ (hostEl).__hostActions = null
            }
          }
        }
        observeHostRemoval(hostEl, () => unregisterView(scopeId, viewId, hostEl))
      }
    }
  } finally {
    if (g) {
      if (prevTr !== undefined) /** @type {{ __cmxTemplateRoot?: unknown }} */ (g).__cmxTemplateRoot = prevTr
      else Reflect.deleteProperty(/** @type {object} */ (g), '__cmxTemplateRoot')
      if (prevWs !== undefined) /** @type {{ workspace?: unknown }} */ (g).workspace = prevWs
      else Reflect.deleteProperty(/** @type {object} */ (g), 'workspace')
    }
  }
}

/**
 * 向上寻找带指定 dataset 键的 HTMLElement 祖先（包含自身）。
 * @param {Node|null|undefined} node
 * @param {string} datasetKey camelCase（如 `cmxViewId`）
 * @returns {HTMLElement|null}
 */
function findAncestorWithDataset (node, datasetKey) {
  let cur = /** @type {Element|null} */ (node instanceof Element ? node : null)
  while (cur) {
    if (cur instanceof HTMLElement && cur.dataset && cur.dataset[datasetKey] != null) return cur
    cur = cur.parentElement
  }
  return null
}

function disconnectHostRemovalObserver (host) {
  const mo = /** @type {MutationObserver|undefined} */ (/** @type {any} */ (host).__cmxHostRemovalObserver)
  if (mo) {
    mo.disconnect()
    Reflect.deleteProperty(/** @type {object} */ (host), '__cmxHostRemovalObserver')
  }
}

/**
 * MutationObserver 兜底卸载：监听宿主元素 `isConnected` 变化；断开后执行一次 `onRemoved` 并自毁 observer。
 * 与 CE `disconnectedCallback` 链路并存；先到者触发 unregister（unregister 内会做 host 比对幂等）。
 * @param {HTMLElement} host
 * @param {() => void} onRemoved
 */
function observeHostRemoval (host, onRemoved) {
  if (typeof MutationObserver !== 'function') return
  disconnectHostRemovalObserver(host)
  const root = host.getRootNode()
  const target = root instanceof ShadowRoot ? root.host?.parentNode : host.parentNode
  if (!(target instanceof Node)) return
  const mo = new MutationObserver(() => {
    if (!host.isConnected) {
      try { onRemoved() } catch (e) { console.warn('[workspace-html-page-preview] removal handler error', e) }
      disconnectHostRemovalObserver(host)
    }
  })
  mo.observe(/** @type {Node} */ (target), { childList: true, subtree: true })
  ;/** @type {any} */ (host).__cmxHostRemovalObserver = mo
}

/**
 * 解析载荷并注入运行槽：载荷放在 **textarea** 中（经 `innerHTML` 写入仍保留于 DOM）；勿用 `script` 存 JSON——多数浏览器会丢弃通过 `innerHTML` 插入的 `script` 节点。
 * 设计器页组件依赖 `globalThis.__cmxTemplateRoot || document` 查找 `#cmx-page-template-*`，注入前将 `__cmxTemplateRoot` 设为该槽。
 *
 * 反闪烁：run-slot 在模板里以 `opacity:0` 渲染（见 `renderHtmlPagesWorkspaceView`），脚本注入完成后下一帧才置 1，
 * 避开「空槽 → 自定义元素首次 paint」之间的一帧空白；样式只在 inline 上设置以兼容 ShadowRoot/light DOM。
 * @param {ParentNode|null|undefined} root 含 `.cmx-html-pages-view` 的容器（可为 `ShadowRoot`）
 */
export function hydrateHtmlPagesWorkspaceViewsInRoot (root) {
  if (!root || typeof root.querySelectorAll !== 'function') return
  const g = typeof globalThis !== 'undefined' ? globalThis : undefined

  /** @type {HTMLElement[]} */
  const hydratedSlots = []

  const textareas = root.querySelectorAll('textarea[data-cmx-html-pages-payload]')
  for (let i = 0; i < textareas.length; i++) {
    const ta = textareas[i]
    if (!(ta instanceof HTMLTextAreaElement)) continue
    const view = ta.closest('.cmx-html-pages-view')
    const slot = view?.querySelector('[data-cmx-html-pages-run-slot]')
    if (!(slot instanceof HTMLElement)) {
      ta.remove()
      continue
    }
    /* 显式 CE 守卫：若 slot 内已有 CE 宿主（已 hydrate），仅消费 payload 元素，不重复构建。
       run-slot 由 innerHTML 整体替换产生，正常情况此 guard 不触发；防御复用/并发路径。 */
    if (slot.querySelector('[data-cmx-html-page-host]')) {
      ta.remove()
      continue
    }
    const docStr = ta.value != null ? String(ta.value) : ''
    ta.remove()
    try {
      injectParsedHtmlBodyIntoRunSlot(slot, docStr, g)
      hydratedSlots.push(slot)
    } catch (e) {
      console.warn('[hydrateHtmlPagesWorkspaceViewsInRoot] inject failed (textarea payload)', e)
      // 注入失败此前仅 console + 恢复透明度 → run-slot 空白。插入红字错误占位让失败可见。
      const errDiv = document.createElement('div')
      errDiv.style.cssText = 'padding:10px;font-size:12px;color:var(--sapNegativeTextColor, #bb0000)'
      errDiv.textContent = `页面注入失败：${e instanceof Error ? e.message : String(e)}`
      slot.replaceChildren(errDiv)
      slot.style.opacity = '1'
    }
  }

  /* 兼容旧版：script+JSON（仅当仍存在于 DOM 时，例如非 innerHTML 路径插入） */
  const scripts = root.querySelectorAll('script[type="application/json"][data-cmx-html-pages-payload]')
  for (let i = 0; i < scripts.length; i++) {
    const scriptEl = scripts[i]
    if (!(scriptEl instanceof HTMLScriptElement)) continue
    const view = scriptEl.closest('.cmx-html-pages-view')
    const slot = view?.querySelector('[data-cmx-html-pages-run-slot]')
    if (!(slot instanceof HTMLElement)) {
      scriptEl.remove()
      continue
    }
    /* 同上：slot 已有 CE 宿主则跳过 */
    if (slot.querySelector('[data-cmx-html-page-host]')) {
      scriptEl.remove()
      continue
    }
    let docStr = ''
    try {
      const payload = JSON.parse(scriptEl.textContent || '{}')
      docStr = typeof payload.doc === 'string' ? payload.doc : ''
    } catch (e) {
      console.warn('[hydrateHtmlPagesWorkspaceViewsInRoot] invalid JSON payload (script)', e)
    }
    scriptEl.remove()
    try {
      injectParsedHtmlBodyIntoRunSlot(slot, docStr, g)
      hydratedSlots.push(slot)
    } catch (e) {
      console.warn('[hydrateHtmlPagesWorkspaceViewsInRoot] inject failed (script payload)', e)
      slot.style.opacity = '1'
    }
  }

  if (hydratedSlots.length && typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        for (const slot of hydratedSlots) slot.style.opacity = '1'
      })
    })
  } else {
    for (const slot of hydratedSlots) slot.style.opacity = '1'
  }
  /* 给 root 内所有多视图 region 的 tab strip（顶/底）装"同条带 reorder + DOM swap"。
     helper 自带 dataset 去重，重复 hydrate 安全。 */
  try { wireMultiViewTabReorderInRoot(root) } catch (e) { console.warn('[hydrate] wireMultiViewTabReorderInRoot threw', e) }
}
