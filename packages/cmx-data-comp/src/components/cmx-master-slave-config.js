/**
 * <cmx-master-slave-config> — 主从协调器声明式自启动元素
 *
 * 用法：在 HTML 中放一个本元素，内容为 JSON：
 *   {
 *     "schema":      [ { id, kind, selector?, children? } ],
 *     "aggregations":[ { from, agg, field?, to, toField, scope? } ],
 *     "relations":   [ { parent, child, parentKey?, childKey } ],
 *     "dataSources": [ { id, keyField, items, helper, ... } ],
 *     "initialData": { ... }    // 嵌套树形（直接喂 ms.setData）
 *   }
 *
 * connectedCallback 时：
 *   1. 解析 textContent JSON
 *   2. new CmxMasterSlave({ schema, aggregations, relations, dataSources })
 *   3. 按 schema 各节点的 selector 在 document（或最近的 root）里找到对应 cmx-ui5-form / cmx-ui5-table 实例，
 *      调 bindForm / bindTable
 *   4. setData(initialData)
 *
 * 通过 element.ms 暴露协调器引用，业务侧可外部访问。
 *
 * @component cmx-master-slave-config
 * @fires cmx-ms-ready - 主从协调器初始化并绑定完毕，detail: { ms }
 */

import { CmxMasterSlave } from '../lib/cmx-master-slave.js'

export class CmxMasterSlaveConfig extends HTMLElement {
  /** @type {boolean} 是否已 bootstrap 过（防重复初始化） —— connectedCallback 首次执行后置 true */
  // this._mounted  ——  懒初始化，缺省 undefined（falsy）
  /** @type {CmxMasterSlave|null} 主从协调器实例，业务侧可通过 element.ms 外部访问 */
  // this.ms  ——  在 _bootstrap 中赋值

  /** 元素插入 DOM：标记已挂载，在微任务中执行 bootstrap（等待子元素先渲染）。 */
  connectedCallback() {
    if (this._mounted) return
    this._mounted = true
    queueMicrotask(() => this._bootstrap())
  }

  /** 元素移出 DOM：重置挂载标记。 */
  disconnectedCallback() {
    this._mounted = false
  }

  /**
   * 解析 textContent JSON 配置，创建主从协调器并按 selector 绑定表单 / 表格组件，最后注入初始数据。
   * 解析失败或为空时仅打印警告，不抛异常。绑定完成后派发 cmx-ms-ready 事件。
   */
  _bootstrap() {
    const raw = (this.textContent || '').trim()
    if (!raw) {
      console.warn('[cmx-master-slave-config] empty content; nothing to do')
      return
    }
    let cfg
    try { cfg = JSON.parse(raw) }
    catch (e) {
      console.warn('[cmx-master-slave-config] invalid JSON:', e?.message || e)
      return
    }

    const schema       = Array.isArray(cfg.schema) ? cfg.schema : []
    const aggregations = Array.isArray(cfg.aggregations) ? cfg.aggregations : []
    const relations    = Array.isArray(cfg.relations) ? cfg.relations : []
    const dataSources  = Array.isArray(cfg.dataSources) ? cfg.dataSources : []
    const initialData  = cfg.initialData || null

    // schema 进协调器时去掉 selector（协调器不需要）
    const stripSelectors = (nodes) => nodes.map((n) => ({
      id: n.id, kind: n.kind,
      children: Array.isArray(n.children) ? stripSelectors(n.children) : undefined,
    }))

    const ms = new CmxMasterSlave({
      schema: stripSelectors(schema),
      aggregations,
      relations,
      dataSources,
    })
    this.ms = ms

    // 在哪个 root 查找 selector：默认 document；可由 host 元素的 data-scope 指定
    const scopeId = this.getAttribute('data-scope')
    const root = scopeId ? document.getElementById(scopeId) : document

    // 自动按 selector 绑定
    this._bindRecursive(ms, schema, root, '')

    // 初始数据
    if (initialData) ms.setData(initialData)

    this.dispatchEvent(new CustomEvent('cmx-ms-ready', {
      bubbles: true, composed: true, detail: { ms },
    }))
  }

  /**
   * 递归遍历 schema 节点树，按各节点的 selector 在 root 范围内查找组件并绑定到协调器。
   * @param {CmxMasterSlave} ms 主从协调器实例
   * @param {Array} nodes schema 节点数组（含 id/kind/selector/children）
   * @param {Document|HTMLElement} root 查找 selector 的根节点（document 或 data-scope 指定容器）
   * @param {string} prefix 父级路径前缀（用于拼接嵌套 path，如 'master.detail'）
   */
  _bindRecursive(ms, nodes, root, prefix) {
    for (const n of nodes) {
      const path = prefix ? `${prefix}.${n.id}` : n.id
      if (n.selector) {
        const el = root?.querySelector?.(n.selector)
        if (el) {
          // kind=single 绑定为表单（单条记录），其余绑定为表格（列表）
          if (n.kind === 'single') ms.bindForm(path, el)
          else ms.bindTable(path, el)
        } else {
          console.warn(`[cmx-master-slave-config] no element matches "${n.selector}" for path "${path}"`)
        }
      }
      if (Array.isArray(n.children) && n.children.length) {
        this._bindRecursive(ms, n.children, root, path)
      }
    }
  }
}

customElements.define('cmx-master-slave-config', CmxMasterSlaveConfig)
