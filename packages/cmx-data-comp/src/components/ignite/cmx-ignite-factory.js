/**
 * cmx-ignite-factory — 薄封装工厂。
 *
 * defineThinIgnite(cmxTag, innerTag, opts) 生成一个轻量 web component：
 *   - 内部包一个 igc-* 原生元素；attribute 透传到内部（observedAttributes + attributeChangedCallback），
 *     设计器 Inspector 用 setAttribute 改属性时即时生效；
 *   - 用 <slot> 投影 light DOM 子节点（容器类按 opts.slots 渲染具名 slot + 默认 slot）；
 *   - igc 原生事件转发为 cmx-* 自定义事件（igcChange → cmx-change）；
 *   - opts.valueProp 存在时提供 getValue()/setValue(v)，读写内部 property。
 *
 * 不接 CmxDataSet —— 这是纯展示/输入壳。需要数据绑定用厚封装 combo/list/input。
 */
import { ensureIgniteTheme, dispatchCmx } from './cmx-ignite-shared.js'

/** 壳层自身用的属性，不透传给内部 igc-*。 */
const SHELL_ATTRS = new Set(['slot', 'style', 'class', 'id'])

/** igcXxx → cmx-xxx：igcChange→cmx-change, igcOpening→cmx-opening。 */
export function igcEventToCmx (igcEvent) {
  const base = igcEvent.replace(/^igc/, '')
  return 'cmx-' + base.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

/**
 * @param {string} cmxTag    自定义元素名，如 'cmx-ignite-button'
 * @param {string} innerTag  内部原生元素名，如 'igc-button'
 * @param {{
 *   attrs?: string[],       透传的 attribute 名（也作为 observedAttributes）
 *   events?: string[],      要转发的 igc 原生事件名
 *   valueProp?: string,     值属性名（value/checked/selected/open...）→ 提供 get/setValue
 *   container?: boolean,    是否容器（带 slot 投影子节点）
 *   slots?: string[],       具名 slot 列表（'' 表示默认 slot）
 * }} [opts]
 */
export function defineThinIgnite (cmxTag, innerTag, opts = {}) {
  if (customElements.get(cmxTag)) return customElements.get(cmxTag)

  const observed = Array.isArray(opts.attrs) ? opts.attrs.slice() : []
  const events = Array.isArray(opts.events) ? opts.events : []
  const valueProp = opts.valueProp || null
  const slots = Array.isArray(opts.slots) && opts.slots.length ? opts.slots : (opts.container ? [''] : null)

  class CmxThinIgnite extends HTMLElement {
    static get observedAttributes () { return observed }

    connectedCallback () {
      if (this.shadowRoot) { this._passthroughAttrs(); return }
      ensureIgniteTheme()
      this.attachShadow({ mode: 'open' })
      const slotHtml = slots
        ? slots.map((n) => (n ? `<slot name="${n}" slot="${n}"></slot>` : '<slot></slot>')).join('')
        : ''
      this.shadowRoot.innerHTML =
        `<style>:host{display:${opts.container ? 'block' : 'inline-block'}}</style>` +
        `<${innerTag} id="inner">${slotHtml}</${innerTag}>`
      this._inner = this.shadowRoot.getElementById('inner')
      for (const ev of events) {
        this._inner.addEventListener(ev, (e) => {
          dispatchCmx(this, igcEventToCmx(ev), e?.detail)
        })
      }
      this._passthroughAttrs()
    }

    attributeChangedCallback (name, _old, value) {
      if (!this._inner || SHELL_ATTRS.has(name)) return
      this._applyAttr(name, value)
    }

    /** 把当前壳上的全部受观察 attribute 同步到内部 igc-*。 */
    _passthroughAttrs () {
      if (!this._inner) return
      for (const name of observed) {
        if (SHELL_ATTRS.has(name)) continue
        if (this.hasAttribute(name)) this._applyAttr(name, this.getAttribute(name))
      }
    }

    /** attribute → 内部元素：布尔属性按存在性切换，其余直接 setAttribute。 */
    _applyAttr (name, value) {
      if (value === null) { this._inner.removeAttribute(name); return }
      // 空字符串布尔属性（如 disabled=""）：保留为存在性
      this._inner.setAttribute(name, value)
    }

    /** 输入类取值。 */
    getValue () {
      if (!valueProp || !this._inner) return undefined
      return this._inner[valueProp]
    }

    /** 输入类写值。 */
    setValue (v) {
      if (!valueProp || !this._inner) return this
      this._inner[valueProp] = v
      return this
    }

    /** 透传到内部原生元素（焦点/打开下拉等）。 */
    focus () { try { this._inner?.focus?.() } catch (_) {} }
  }

  customElements.define(cmxTag, CmxThinIgnite)
  return CmxThinIgnite
}
