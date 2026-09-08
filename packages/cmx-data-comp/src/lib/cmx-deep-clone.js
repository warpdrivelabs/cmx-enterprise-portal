/**
 * cmx-deep-clone — 深拷贝唯一出口（治理清单 C-05）
 *
 * 收敛此前四处同名异义副本：clonePlain(portal-definition-manager) / cloneJson(cmx-meta-model) /
 * clone(flc-overlay) / cloneArray(cmx-field-clipboard)。语义取最完整变体（原 cloneJson）：
 * null/undefined 原样透传；优先 structuredClone（可保 Date/Map/Set 等富类型）；不可克隆时
 * 回退 JSON 往返（纯 JSON 数据行为与旧副本一致）。原生页面经 barrel 取用，应用侧走子路径 import。
 */

/** 深拷贝任意值；null/undefined 原样返回。 */
export function deepClone (value) {
  if (value == null) return value
  try {
    return structuredClone(value)
  } catch (_) {
    return JSON.parse(JSON.stringify(value))
  }
}

/** 深拷贝数组；非数组输入归一为 []（原 cloneArray 语义，剪贴板容错用）。 */
export function deepCloneArray (value) {
  return deepClone(Array.isArray(value) ? value : [])
}
