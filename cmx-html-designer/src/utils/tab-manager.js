/**
 * TabManager — 通用 Tab 切换管理器
 *
 * 封装"全部失活，激活指定项"逻辑，消除三处重复的 classList.remove/add 模式。
 *
 * @param {Element}  root       — 查询范围（通常是 shadowRoot）
 * @param {string}   [btnSel]   — 按钮的 CSS 选择器（null 表示无按钮）
 * @param {string}   [panelSel] — 面板的 CSS 选择器（null 表示无面板）
 * @param {object}   [opts]
 * @param {string}   [opts.dataAttr='tab']  — 按钮上映射面板 id 的 data-* 属性名
 * @param {Function} [opts.onChange]        — (id: string) => void，激活后回调
 *
 * 典型用法：
 *   // 按钮 + 面板（Inspector）
 *   new TabManager(sr, '.tab-btn', '.tab-panel')
 *
 *   // 仅按钮 + 回调（App 中央 Tab 栏）
 *   new TabManager(sr, '.c-tab-btn', null, { dataAttr: 'view', onChange: (v) => ... })
 *
 *   // 仅面板，外部调用 activate()（PageData 视图切换）
 *   this._panes = new TabManager(sr, null, '.pane')
 *   this._panes.activate('dataPane')
 */
export class TabManager {
  constructor(root, btnSel, panelSel, { dataAttr = 'tab', onChange = null } = {}) {
    this._root      = root;
    this._btnSel    = btnSel   || null;
    this._panelSel  = panelSel || null;
    this._dataAttr  = dataAttr;
    this._onChange  = onChange;
    if (this._btnSel) this._bindButtons();
  }

  /** 激活 id 对应的按钮和面板，并触发回调 */
  activate(id) {
    if (this._btnSel) {
      this._root.querySelectorAll(this._btnSel).forEach(b => b.classList.remove('active'));
      const btn = [...this._root.querySelectorAll(this._btnSel)]
        .find(b => b.dataset[this._dataAttr] === id);
      btn?.classList.add('active');
    }
    if (this._panelSel) {
      this._root.querySelectorAll(this._panelSel).forEach(p => p.classList.remove('active'));
      this._root.getElementById(id)?.classList.add('active');
    }
    this._onChange?.(id);
  }

  _bindButtons() {
    this._root.querySelectorAll(this._btnSel).forEach((btn) => {
      btn.addEventListener('click', () => this.activate(btn.dataset[this._dataAttr]));
    });
  }
}
