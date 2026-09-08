/**
 * <cmx-view-tabs> — 轻量 tab 切换控制器，配合 slotted 面板使用。
 *
 * 将可点击元素放入 slot="tabs" 并设置 data-view="<id>"；
 * 将面板作为直接子元素（默认 slot），设置 data-view-panel="<id>"。
 * 切换时自动刷新激活面板内的 cmx-revo-grid / cmx-tabulator / cmx-ui5-form / cmx-web-treeview 布局。
 *
 * @component cmx-view-tabs
 * @slot tabs - tab 按钮区，子元素需带 data-view="<id>"
 * @slot (默认) - 面板区，直接子元素需带 data-view-panel="<id>"
 * @fires cmx-view-change - 切换激活视图，detail: { view }（bubbles + composed）
 * @attr {string} active - 当前激活的 view id；缺省取首个 tab
 */
export class CmxViewTabs extends HTMLElement {
  /** 监听 active 属性变化，变更后重新应用激活态 */
  static get observedAttributes() { return ['active'] }

  /**
   * 首次连接时创建 Shadow DOM、注入 slot 模板，并绑定 click / keydown 事件委托。
   * click / Enter / Space 命中带 data-view 的元素即切换视图。
   */
  connectedCallback() {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' })
      this.shadowRoot.innerHTML = `<style>${this._css()}</style><slot name="tabs"></slot><slot></slot>`
      // 事件委托：点击带 data-view 的 tab 元素时切换
      this.addEventListener('click', (ev) => {
        const tab = ev.target?.closest?.('[data-view]')
        if (!tab || !this.contains(tab)) return
        this.select(tab.getAttribute('data-view'))
      })
      // 键盘支持：Enter / Space 触发切换
      this.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Enter' && ev.key !== ' ') return
        const tab = ev.target?.closest?.('[data-view]')
        if (!tab || !this.contains(tab)) return
        ev.preventDefault()
        this.select(tab.getAttribute('data-view'))
      })
    }
    this._apply()
  }

  /** active 属性变化后重新应用激活态。 */
  attributeChangedCallback() {
    if (this.shadowRoot) this._apply()
  }

  /**
   * 切换到指定视图：更新 active 属性并派发 cmx-view-change 事件。
   * @param {string} id 目标视图 id
   */
  select(id) {
    if (!id) return
    this.setAttribute('active', id)
    this.dispatchEvent(new CustomEvent('cmx-view-change', { bubbles: true, composed: true, detail: { view: id } }))
  }

  /**
   * 应用当前激活态：读取 active 属性（缺省取首个 tab），切换 tab 的 active 类 / aria-selected，
   * 显示对应面板并隐藏其余，对激活面板内的表格 / 表单 / 树刷新布局。
   */
  _apply() {
    let active = this.getAttribute('active')
    const tabs = Array.from(this.querySelectorAll('[data-view]'))
    // 无 active 属性时默认激活第一个 tab，setAttribute 触发 attributeChangedCallback 再次 _apply
    if (!active && tabs[0]) {
      active = tabs[0].getAttribute('data-view')
      this.setAttribute('active', active)
      return
    }
    // 更新 tab 按钮的激活态与无障碍属性
    tabs.forEach((tab) => {
      const on = tab.getAttribute('data-view') === active
      tab.classList.toggle('active', on)
      tab.setAttribute('aria-selected', on ? 'true' : 'false')
      if (!tab.hasAttribute('tabindex')) tab.setAttribute('tabindex', '0')
    })
    // 切换面板可见性，并刷新激活面板内的布局
    this.querySelectorAll('[data-view-panel]').forEach((panel) => {
      panel.style.display = panel.getAttribute('data-view-panel') === active ? '' : 'none'
      if (panel.getAttribute('data-view-panel') === active) this._refresh(panel)
    })
  }

  /**
   * 延迟一帧刷新面板内数据组件的布局（display:none 切回可见后尺寸需要重算）。
   * @param {HTMLElement} panel 激活的面板元素
   */
  _refresh(panel) {
    setTimeout(() => {
      panel.querySelectorAll('cmx-revo-grid,cmx-tabulator,cmx-ui5-form,cmx-web-treeview').forEach((el) => {
        try {
          if (typeof el.refreshLayout === 'function') el.refreshLayout()
          else if (typeof el.redraw === 'function') el.redraw()
        } catch (_) {}
      })
    }, 0)
  }

  /** 返回组件内联样式表：默认 display:contents 透传；带 data-cmx-fill 时撑满父容器。 @returns {string} */
  _css() {
    return `
      :host{display:contents;}
      :host([data-cmx-fill]){
        display:flex;
        width:100%;
        height:100%;
        min-width:0;
        min-height:0;
        box-sizing:border-box;
      }
      :host([data-cmx-fill]) ::slotted([slot="tabs"]){flex:0 0 auto;min-width:0;min-height:0;}
      :host([data-cmx-fill]) ::slotted(:not([slot])){
        flex:1 1 0;
        min-width:0;
        min-height:0;
      }
    `
  }
}

if (!customElements.get('cmx-view-tabs')) customElements.define('cmx-view-tabs', CmxViewTabs)
