/**
 * CmxRowSet — 数据树中一行的容器
 *
 * 字段值直接作为实例属性存储，无 Proxy，V8 可完整优化。
 * _children 挂子 CmxDataSet，形成可无限深的树形结构。
 *
 * 修改字段统一调 row.set(key, value)，由 _ds 向上通知，
 * CmxMasterSlave 监听后执行 calcFormula 并触发聚合。
 */
export class CmxRowSet {
  /**
   * @param {object} data     行字段值 { id, ...fields }
   * @param {object} children { childId: CmxDataSet }
   * @param {object} ds       所属 CmxDataSet（内部用）
   */
  constructor(data = {}, children = {}, ds = null) {
    Object.assign(this, data)
    this._children = { ...children }
    this._ds       = ds
  }

  /**
   * 修改字段的统一入口。
   * 写属性后通过 _ds._notifyChange 向上冒泡，
   * CmxMasterSlave 的监听器负责执行 calcFormula、触发聚合。
   *
   * @param {string} key
   * @param {any}    value
   */
  set(key, value) {
    this[key] = value
    this._ds?._notifyChange(this, key, value)
  }

  /** 批量设置多个字段，所有变更合并为一次 row-changed 通知 */
  setValues(kvMap = {}) {
    for (const [k, v] of Object.entries(kvMap)) this[k] = v
    if (this._ds) {
      for (const [k, v] of Object.entries(kvMap)) {
        this._ds._notifyChange(this, k, v)
      }
    }
  }

  /** 以普通 JS 对象导出（过滤所有 _ 前缀内部属性） */
  toPlainObject() {
    const obj = {}
    for (const k of Object.keys(this)) {
      if (!k.startsWith('_')) obj[k] = this[k]
    }
    return obj
  }
}
