/**
 * 标签元数据注册表
 *
 * UI5/Fiori/HTML 标签的调色板元数据（JSON）构建至 HTMLDesigner dist/metadata/，
 * 运行时 fetch 加载，不打入 JS bundle。
 *
 * 实际 <ui5-*> 自定义元素实现仍在 /shared/ UI5 runtime。
 * 应用入口须在加载依赖 registry 的模块之前调用 await ensureTagRegistryLoaded()。
 */
import { fetchDesignerMetadataJson } from './fetch-metadata.js'
import { GROUPS } from './groups.js'

const DEFAULT_COMMON_EVENTS = ['click','dblclick','mouseover','mouseout','mouseenter','mouseleave','contextmenu','keydown','keyup','focus','blur']

class TagRegistry {
  constructor(commonAttrs, styleGroups, eventPresets) {
    this._tags        = new Map()
    this._commonAttrs = commonAttrs || []
    this._styleGroups = styleGroups || []
    this._eventPresets = eventPresets || {}
    this._groups      = [...GROUPS]
  }

  // ── 组管理 ──────────────────────────────────────────────────────────────────

  /**
   * 注册一个自定义组（插件调用）。若同 id 的组已存在则忽略。
   * @param {{ id: string, label: string, icon?: string, iconName?: string, order?: number, collapsed?: boolean }} group
   */
  registerGroup(group) {
    if (!group?.id) throw new Error('group.id 为必填')
    if (!this._groups.find(g => g.id === group.id)) {
      this._groups.push({ collapsed: false, order: 99, ...group })
    }
    return this
  }

  /** 返回所有已注册组（内置 + 插件），按 order 升序排列。 */
  getGroups() {
    return [...this._groups].sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
  }

  register(meta) {
    if (!meta || !meta.tag) throw new Error('tag 字段为必填')
    this._tags.set(meta.tag, {
      ...meta,
      attrs:        [...this._commonAttrs, ...(meta.attrs || [])],
      styles:       this._stylesFromMeta(meta),
      events:       this._eventsFromMeta(meta),
      defaultSetup: this._defaultSetupFromMeta(meta),
    })
    return this
  }

  registerAll(metas) { metas.forEach((m) => this.register(m)); return this }

  get(tag) {
    return this._tags.get(tag) ?? {
      tag, group: 'utility', label: `<${tag}>`, description: `${tag} 元素`,
      isVoid: false, canNest: true,
      attrs: [...this._commonAttrs],
      styles: this._styleGroups,
      events: DEFAULT_COMMON_EVENTS,
      defaultSetup(el) { el.textContent = tag },
    }
  }

  getByGroups() {
    const map = new Map()
    for (const meta of this._tags.values()) {
      const g = meta.group
      if (!map.has(g)) map.set(g, [])
      map.get(g).push(meta)
    }
    return map
  }

  getByGroup(groupId) { return [...this._tags.values()].filter((m) => m.group === groupId) }
  getAll()            { return [...this._tags.values()] }

  _defaultSetupFromMeta(meta) {
    return (el) => {
      const defaults = meta.defaults || {}
      Object.entries(defaults.attributes || {}).forEach(([name, value]) => {
        if (value !== null && value !== undefined) el.setAttribute(name, String(value))
      })
      if (defaults.text)       el.textContent = defaults.text
      else if (defaults.html)  el.innerHTML   = defaults.html
      Object.entries(defaults.style || {}).forEach(([prop, value]) => { el.style[prop] = value })
      if (!defaults.text && !defaults.html && !el.textContent && !meta.isVoid && !meta.canNest) {
        el.textContent = `${meta.tag} 内容`
      }
    }
  }

  _stylesFromMeta(meta) {
    const groupIds = Array.isArray(meta.styleGroups) && meta.styleGroups.length
      ? meta.styleGroups
      : this._styleGroups.map((g) => g.id)
    const allow = new Set(groupIds)
    return this._styleGroups.filter((g) => allow.has(g.id))
  }

  _eventsFromMeta(meta) {
    const presetName = meta.eventPreset || 'common'
    const base  = this._eventPresets[presetName] || this._eventPresets.common || DEFAULT_COMMON_EVENTS
    const extra = Array.isArray(meta.extraEvents) ? meta.extraEvents : []
    return [...new Set([...base, ...extra])]
  }
}

/** @type {Promise<void> | null} */
let _tagsLoadPromise = null

/** 样式组（ensureTagRegistryLoaded 完成后可用） */
export let STYLE_GROUPS = []

export const registry = new TagRegistry([], [], {})

/**
 * 从 dist/metadata/ 加载并注册全部标签元数据。多次调用返回同一 Promise。
 */
export function ensureTagRegistryLoaded() {
  if (!_tagsLoadPromise) {
    _tagsLoadPromise = (async () => {
      const [commonAttrs, styleGroups, eventPresets, tagIndex] = await Promise.all([
        fetchDesignerMetadataJson('common-attrs.json'),
        fetchDesignerMetadataJson('style-groups.json'),
        fetchDesignerMetadataJson('event-presets.json'),
        fetchDesignerMetadataJson('tag-index.json'),
      ])
      registry._commonAttrs = commonAttrs || []
      registry._styleGroups = styleGroups || []
      registry._eventPresets = eventPresets || {}
      STYLE_GROUPS = styleGroups || []
      const metas = await Promise.all(
        tagIndex.map(async ({ path: tagPath }) => {
          const data = await fetchDesignerMetadataJson(`tags/${tagPath}`)
          return { ...data, __metaPath: `tags/${tagPath}` }
        }),
      )
      registry.registerAll(metas)
    })()
  }
  return _tagsLoadPromise
}

export default registry
