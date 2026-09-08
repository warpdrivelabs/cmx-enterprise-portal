export function portalDisplayText (value, fallback = '') {
  if (value == null) return fallback
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    const text = String(value).trim()
    return text || fallback
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value
    const text = obj.zh_CN ?? obj['zh-CN'] ?? obj.zh ?? obj.default ?? obj.en_US ?? obj.en
    if (text != null && String(text).trim() !== '') return String(text).trim()
    const first = Object.values(obj).find((v) => v != null && String(v).trim() !== '')
    if (first != null) return String(first).trim()
  }
  return fallback
}
