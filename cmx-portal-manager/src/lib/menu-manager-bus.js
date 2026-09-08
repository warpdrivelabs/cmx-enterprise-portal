/**
 * 菜单管理页跨区通信总线（模块级单例）。
 *
 * 「菜单管理」由两段式的两个自定义元素协作：
 *   - <portal-menu-tree>（explorer 区）：DAM 三联选择 + 菜单树 + 拖拽换父。
 *   - <portal-menu-editor>（content 区）：选中节点的表单编辑 / 新增 / 删除。
 *
 * 二者分处不同 shadow root（explorer 在侧栏 shadow，content 在工作区 shadow），
 * 采用**模块级单例**做跨区通信（ES module 在 Vite 包内天然单例，两处 import 同一实例）——
 * 与已发布的 native 页 `cluster-datasource.js`（三区共用一个模块 state）同构。
 * 菜单管理 tab 为单实例（addTab 按固定 id 去重），单例不会跨 tab 串台。
 *
 * 事件：
 *   - 'ctx'      DAM 上下文（域/应用/模块）变化：{ domain_code, application_code, module_code }
 *   - 'select'   选中节点变化（或进入新增态）：{ node|null, parent|null, isNew }
 *   - 'reload'   请求树重载（编辑区 CRUD 成功后触发）：{ reason?, selectId? }
 *   - 'saved'    树已重载完成，附最新树：{ tree }
 */

/** @typedef {{ domain_code: string, application_code: string, module_code: string }} MenuCtx */

class MenuManagerBus {
  constructor () {
    /** @type {MenuCtx} */
    this.ctx = { domain_code: '', application_code: '', module_code: '' }
    /** @type {any|null} 当前选中的树节点 data（null=空态/新建） */
    this.selected = null
    /** @type {any[]|null} 最近一次加载的菜单树（TreeNode[]），供编辑区解析父节点等 */
    this.tree = null
    /** @type {Map<string, Set<Function>>} */
    this._handlers = new Map()
  }

  /**
   * 订阅事件。
   * @param {'ctx'|'select'|'reload'|'saved'} evt
   * @param {(payload: any) => void} handler
   * @returns {() => void} 退订函数
   */
  on (evt, handler) {
    if (typeof handler !== 'function') return () => {}
    let set = this._handlers.get(evt)
    if (!set) { set = new Set(); this._handlers.set(evt, set) }
    set.add(handler)
    return () => this.off(evt, handler)
  }

  /**
   * @param {'ctx'|'select'|'reload'|'saved'} evt
   * @param {(payload: any) => void} handler
   */
  off (evt, handler) {
    const set = this._handlers.get(evt)
    if (set) set.delete(handler)
  }

  /**
   * @param {'ctx'|'select'|'reload'|'saved'} evt
   * @param {any} [payload]
   */
  emit (evt, payload) {
    const set = this._handlers.get(evt)
    if (!set) return
    for (const h of [...set]) {
      try { h(payload) } catch (e) { console.warn(`[menu-bus] handler error on '${evt}':`, e) }
    }
  }

  /** 更新 DAM 上下文并广播（同时清空选中，避免跨模块残留——修复「切换后表单残留」bug）。 */
  setCtx (ctx) {
    this.ctx = {
      domain_code: ctx?.domain_code || '',
      application_code: ctx?.application_code || '',
      module_code: ctx?.module_code || '',
    }
    // DAM 变更即清选中：编辑区据此复位到空态
    this.selected = null
    this.emit('ctx', this.ctx)
    this.emit('select', { node: null, parent: null, isNew: false })
  }

  /** 广播选中节点（编辑态）。 */
  setSelected (node) {
    this.selected = node || null
    this.emit('select', { node: this.selected, parent: null, isNew: false })
  }

  /** 广播「新增子节点」态（parent 为父节点 data，null=新增根节点）。 */
  setNewNode (parent) {
    this.selected = null
    this.emit('select', { node: null, parent: parent || null, isNew: true })
  }

  /** 编辑区请求树重载。 */
  requestReload (opts = {}) {
    this.emit('reload', opts)
  }

  /** 树重载完成后回填并广播（编辑区可据此刷新父节点带出等）。 */
  publishTree (tree) {
    this.tree = Array.isArray(tree) ? tree : null
    this.emit('saved', { tree: this.tree })
  }
}

/** 全局唯一实例（模块单例）。 */
export const menuBus = new MenuManagerBus()
