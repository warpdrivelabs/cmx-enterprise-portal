/**
 * DesignerBaseComponent — 所有设计器组件的基类
 *
 * 子类只需覆盖：
 *   styles()   — 返回 CSS 字符串（注入 <style> 标签）
 *   template() — 返回 Shadow DOM 的 HTML 主体字符串
 *   init()     — Shadow DOM 就绪后的初始化（查询元素、绑定监听器）
 *   cleanup()  — disconnectedCallback 时清理（如 window 级监听器）
 *
 * 注意：connectedCallback 有幂等保护，重新连接 DOM 时不会重复初始化。
 */
export class DesignerBaseComponent extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `<style>${this.styles()}</style>${this.template()}`;
    const maybe = this.init();
    if (maybe && typeof maybe.then === 'function') {
      maybe.catch((err) => console.error(`[${this.tagName}] init failed`, err));
    }
  }

  disconnectedCallback() {
    this.cleanup();
  }

  /** @returns {string} 组件私有 CSS */
  styles()   { return ''; }

  /** @returns {string} Shadow DOM HTML 主体 */
  template() { return ''; }

  /** Shadow DOM 就绪后调用 — 查询元素引用、绑定事件监听器 */
  init()     {}

  /** disconnectedCallback 时调用 — 清理 window 级监听器等外部副作用 */
  cleanup()  {}
}
