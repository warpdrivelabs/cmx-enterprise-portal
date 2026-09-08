/**
 * 定义中心（DCT/DOC）的"列表 ↔ 主体 ↔ 检查器"共享总线。
 *
 * 每个 kind 一个 bus（DCT/DOC 互不串扰），通过 globalThis 保证跨模块解析到同一实例。
 * 结构与 FlexibleCombinationBus 对齐（照搬 controller / 焦点保护 / 局部刷新模式），
 * 额外带 kind 标识与 loadItems 去重。
 */
/** 每个 kind 一个 bus（DCT/DOC 互不串扰）。 */
export class DefinitionBus extends EventTarget {
  constructor (kind) {
    super()
    this.kind = kind
    this.items = []
    this.selectedKey = ''
    this.controller = null
    this._listPromise = null
  }

  setItems (items) { this.items = Array.isArray(items) ? items : []; this.dispatchEvent(new CustomEvent('items', { detail: { items: this.items } })) }
  select (key) { this.selectedKey = key || ''; this.dispatchEvent(new CustomEvent('select', { detail: { key: this.selectedKey } })) }
  requestRefresh () { this.dispatchEvent(new CustomEvent('refresh', { detail: {} })) }
  /** 请求删除当前选中的定义文件（中栏「删除」按钮触发，列表组件监听执行 _removeFile）。 */
  requestRemoveFile () { this.dispatchEvent(new CustomEvent('remove-file-request', { detail: {} })) }
  setController (c) { this.controller = c; this.dispatchEvent(new CustomEvent('controller', { detail: {} })) }
  clearController (c) { if (this.controller === c) { this.controller = null; this.dispatchEvent(new CustomEvent('controller', { detail: {} })) } }
  emitState (force = false) { this.dispatchEvent(new CustomEvent('state', { detail: { force } })) }
  emitDirty () { this.dispatchEvent(new CustomEvent('dirty', { detail: {} })) }

  loadItems (loader) {
    if (this._listPromise) return this._listPromise
    this._listPromise = Promise.resolve()
      .then(loader)
      .then((items) => {
        this.setItems(items)
        return this.items
      })
      .finally(() => { this._listPromise = null })
    return this._listPromise
  }
}

const _buses = (globalThis.__cmxDefinitionBuses instanceof Map) ? globalThis.__cmxDefinitionBuses : (globalThis.__cmxDefinitionBuses = new Map())
export function busFor (kind, scope = '') {
  const k = (scope ? `${scope}::` : '') + String(kind || 'DCT').toUpperCase()
  if (!_buses.has(k)) _buses.set(k, new DefinitionBus(String(kind || 'DCT').toUpperCase()))
  return _buses.get(k)
}
