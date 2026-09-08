/**
 * 弹性组合的"列表(explorer 区) ↔ 主体(content 区)"共享总线。
 *
 * 列表组件 <portal-flexible-combination-list> 在侧栏、主体 <portal-flexible-combination-manager>
 * 在 content 区，二者分属不同 ShadowDOM 子树，无法用 DOM 父子关系联动。这里用一个
 * 模块级单例 EventTarget 作中枢：两端 import 同一模块即共享它，且状态(items/selectedKey)
 * 同步保存在总线上——晚挂载的一端可直接读当前状态，避免错过事件造成的竞态。
 *
 * 事件：
 *   'items'    detail:{ items }            列表已加载，items 变化
 *   'select'   detail:{ key }              用户在列表里选中某弹性组合（新建落盘后也经此选中进编辑态）
 *   'changed'  detail:{ }                  主体保存后，列表需重拉
 *   'refresh'  detail:{ }                  用户在列表里点"刷新"，请求主体重拉列表
 *   'state'    detail:{ }                  主体状态变化（combination/选中字段/诊断/预览），property 面板需重渲
 *   'controller' detail:{ }                主体（控制器）挂载/卸载，property 面板需重新取 controller 重渲
 */
export class FlexibleCombinationBus extends EventTarget {
  constructor () {
    super()
    this.items = []
    this.selectedKey = ''
    /** 主体作为控制器：检查器/校验预览面板把渲染与事件委托给它。 */
    this.controller = null
  }

  setItems (items) {
    this.items = Array.isArray(items) ? items : []
    this.dispatchEvent(new CustomEvent('items', { detail: { items: this.items } }))
  }

  select (key) {
    const k = key || ''
    // key 未变且列表非空 → 不重复广播（去重：避免对同一档案反复触发 _loadCombination）
    if (this.selectedKey === k && this.items.length) return
    this.selectedKey = k
    this.dispatchEvent(new CustomEvent('select', { detail: { key: this.selectedKey } }))
  }

  requestRefresh () { this.dispatchEvent(new CustomEvent('refresh', { detail: {} })) }

  notifyChanged () {
    this.dispatchEvent(new CustomEvent('changed', { detail: {} }))
  }

  setController (c) {
    this.controller = c
    this.dispatchEvent(new CustomEvent('controller', { detail: {} }))
  }

  clearController (c) {
    if (this.controller === c) { this.controller = null; this.dispatchEvent(new CustomEvent('controller', { detail: {} })) }
  }

  /** 主体状态变化 → 通知 property 面板重渲（面板只读取 controller 的渲染方法，不形成回环）。force=true 时面板无视焦点保护强制重建（如匹配条件切列需立刻换值控件）。 */
  emitState (force = false) { this.dispatchEvent(new CustomEvent('state', { detail: { force } })) }

  /** 轻量"内容已变"通知：仅源码视图订阅（它有 hasFocus 保护），用于设计区打字时同步源码。 */
  emitDirty () { this.dispatchEvent(new CustomEvent('dirty', { detail: {} })) }
}

/** 全局单例：跨多次组件挂载/卸载持续存在（同一 bundle 内共享）。 */
export const combinationBus = (globalThis.__cmxFlexibleCombinationBus instanceof FlexibleCombinationBus)
  ? globalThis.__cmxFlexibleCombinationBus
  : (globalThis.__cmxFlexibleCombinationBus = new FlexibleCombinationBus())

/** 作用域总线：空 scope=全局单例（真实功能页，行为不变）；非空 scope=页面私有实例（嵌入只读复用隔离）。 */
const _combinationBuses = (globalThis.__cmxFlexibleCombinationBuses instanceof Map) ? globalThis.__cmxFlexibleCombinationBuses : (globalThis.__cmxFlexibleCombinationBuses = new Map())
export function combinationBusFor (scope = '') {
  if (!scope) return combinationBus
  if (!_combinationBuses.has(scope)) _combinationBuses.set(scope, new FlexibleCombinationBus())
  return _combinationBuses.get(scope)
}
