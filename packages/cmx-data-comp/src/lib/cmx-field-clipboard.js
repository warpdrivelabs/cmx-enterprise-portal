import { deepCloneArray as cloneArray } from './cmx-deep-clone.js'
export const CMX_FIELD_CLIPBOARD_TYPE = 'cmx-context-fields-v1'

export function createFieldClipboardPayload ({ fields, groups, source = '' } = {}) {
  return {
    type: CMX_FIELD_CLIPBOARD_TYPE,
    version: 1,
    source,
    fields: cloneArray(fields),
    groups: cloneArray(groups),
  }
}

export function parseFieldClipboardText (text) {
  const raw = String(text || '').trim()
  if (!raw) throw new Error('剪贴板为空')
  let obj
  try {
    obj = JSON.parse(raw)
  } catch {
    throw new Error('剪贴板内容不是有效 JSON')
  }
  const source = obj && typeof obj === 'object' && obj.detail && typeof obj.detail === 'object' ? obj.detail : obj
  if (!source || typeof source !== 'object') throw new Error('剪贴板内容不是字段定义')
  if (source.type && source.type !== CMX_FIELD_CLIPBOARD_TYPE) throw new Error(`不支持的字段剪贴板类型：${source.type}`)
  if (!Array.isArray(source.fields) && !Array.isArray(source.groups)) throw new Error('剪贴板缺少 fields/groups')
  return createFieldClipboardPayload({
    source: source.source || '',
    fields: source.fields || [],
    groups: source.groups || [],
  })
}

export async function writeFieldClipboard (payload) {
  if (!navigator?.clipboard?.writeText) throw new Error('当前浏览器不支持剪贴板写入')
  await navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
}

export async function readFieldClipboard () {
  if (!navigator?.clipboard?.readText) throw new Error('当前浏览器不支持剪贴板读取')
  return parseFieldClipboardText(await navigator.clipboard.readText())
}
