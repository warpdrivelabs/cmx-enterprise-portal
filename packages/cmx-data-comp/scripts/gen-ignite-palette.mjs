/**
 * gen-ignite-palette.mjs — 构建期一次性工具（不进运行时）。
 *
 * 读取 igniteui-webcomponents 的 custom-elements.json，按 CURATED 清单
 * 生成两份产物到 stdout：
 *   1) THIN_SPECS  —— 供 cmx-ignite-thin.js 的工厂批量定义
 *   2) PALETTE     —— 供 CMXHTMLDesigner 调色板插件的 components[] 元数据
 *
 * 用法：node packages/cmx-data-comp/scripts/gen-ignite-palette.mjs
 *
 * CURATED 是人工维护的"开源顶层 + 必要子元素"清单（含 innerTag、是否容器、
 * valueProp、必要子元素等无法从 manifest 100% 可靠推断的语义）；attrs/events/slots
 * 由 manifest 提供，避免手抄。
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MANIFEST = join(__dirname, '../../../node_modules/igniteui-webcomponents/custom-elements.json')

/** 解析 manifest → { tag: { attrs:[{n,t}], events:[], slots:[] } } */
function loadManifest () {
  const m = JSON.parse(readFileSync(MANIFEST, 'utf8'))
  const byTag = {}
  for (const mod of m.modules || []) {
    for (const d of mod.declarations || []) {
      if (d.customElement && d.tagName) {
        byTag[d.tagName] = {
          attrs: (d.attributes || []).map((a) => ({ n: a.name, t: a.type?.text || '' })),
          events: (d.events || []).map((e) => e.name).filter(Boolean),
          slots: (d.slots || []).map((s) => s.name || '').filter((v, i, a) => a.indexOf(v) === i),
        }
      }
    }
  }
  return byTag
}

/**
 * 人工维护的清单。kind:
 *   'input'     表单输入类（提供 getValue/setValue，valueProp 必填）→ isVoid:true canNest:false
 *   'container' 容器类（带 slot，可拖子元素）→ isVoid:false canNest:true
 *   'display'   展示/反馈类（无子节点拖放需求）→ isVoid:true canNest:false
 *   'child'     子元素（供容器 slot 内用，不进调色板顶层；多数 container 以便能放孙节点）
 * top: 是否进调色板顶层（child 一般 false）
 * label: 中文显示名
 */
const CURATED = [
  // ── 表单输入类 ──
  { tag: 'igc-input', kind: 'input', valueProp: 'value', label: '输入框' },
  { tag: 'igc-textarea', kind: 'input', valueProp: 'value', label: '多行文本' },
  { tag: 'igc-mask-input', kind: 'input', valueProp: 'value', label: '掩码输入' },
  { tag: 'igc-date-time-input', kind: 'input', valueProp: 'value', label: '日期时间输入' },
  { tag: 'igc-file-input', kind: 'input', valueProp: 'value', label: '文件输入' },
  { tag: 'igc-checkbox', kind: 'input', valueProp: 'checked', label: '复选框' },
  { tag: 'igc-switch', kind: 'input', valueProp: 'checked', label: '开关' },
  { tag: 'igc-radio-group', kind: 'container', label: '单选组', children: ['igc-radio'] },
  { tag: 'igc-select', kind: 'container', valueProp: 'value', label: '下拉选择', children: ['igc-select-item', 'igc-select-group', 'igc-select-header'] },
  { tag: 'igc-slider', kind: 'input', valueProp: 'value', label: '滑块' },
  { tag: 'igc-range-slider', kind: 'display', label: '范围滑块' },
  { tag: 'igc-rating', kind: 'input', valueProp: 'value', label: '评分', children: ['igc-rating-symbol'] },
  { tag: 'igc-calendar', kind: 'input', valueProp: 'value', label: '日历' },
  { tag: 'igc-date-picker', kind: 'input', valueProp: 'value', label: '日期选择' },
  { tag: 'igc-date-range-picker', kind: 'input', valueProp: 'value', label: '日期范围选择' },

  // ── 容器/复合类 ──
  { tag: 'igc-card', kind: 'container', label: '卡片', children: ['igc-card-header', 'igc-card-content', 'igc-card-media', 'igc-card-actions'] },
  { tag: 'igc-accordion', kind: 'container', label: '手风琴', children: ['igc-expansion-panel'] },
  { tag: 'igc-expansion-panel', kind: 'container', label: '展开面板', valueProp: 'open' },
  { tag: 'igc-tabs', kind: 'container', label: '标签页', children: ['igc-tab'] },
  { tag: 'igc-stepper', kind: 'container', label: '步骤器', children: ['igc-step'] },
  { tag: 'igc-tree', kind: 'container', label: '树', children: ['igc-tree-item'] },
  { tag: 'igc-dropdown', kind: 'container', valueProp: 'open', label: '下拉菜单', children: ['igc-dropdown-item', 'igc-dropdown-group', 'igc-dropdown-header'] },
  { tag: 'igc-carousel', kind: 'container', label: '轮播', children: ['igc-carousel-slide'] },
  { tag: 'igc-nav-drawer', kind: 'container', valueProp: 'open', label: '导航抽屉', children: ['igc-nav-drawer-item', 'igc-nav-drawer-header-item'] },
  { tag: 'igc-navbar', kind: 'container', label: '导航栏' },
  { tag: 'igc-button-group', kind: 'container', label: '按钮组', children: ['igc-toggle-button'] },
  { tag: 'igc-dialog', kind: 'container', valueProp: 'open', label: '对话框' },
  { tag: 'igc-splitter', kind: 'container', label: '分隔面板' },
  { tag: 'igc-tile-manager', kind: 'container', label: '磁贴管理', children: ['igc-tile'] },
  { tag: 'igc-chat', kind: 'container', label: '聊天' },

  // ── 展示/反馈类 ──
  { tag: 'igc-button', kind: 'container', label: '按钮', defaultText: '按钮' },
  { tag: 'igc-icon-button', kind: 'display', label: '图标按钮' },
  { tag: 'igc-icon', kind: 'display', label: '图标' },
  { tag: 'igc-avatar', kind: 'display', label: '头像' },
  { tag: 'igc-badge', kind: 'container', label: '徽标', defaultText: '1' },
  { tag: 'igc-chip', kind: 'container', valueProp: 'selected', label: '标签片', defaultText: 'Chip' },
  { tag: 'igc-divider', kind: 'display', label: '分隔线' },
  { tag: 'igc-banner', kind: 'container', valueProp: 'open', label: '横幅', defaultText: '横幅内容' },
  { tag: 'igc-snackbar', kind: 'container', valueProp: 'open', label: '消息条', defaultText: '消息' },
  { tag: 'igc-toast', kind: 'container', valueProp: 'open', label: '轻提示', defaultText: '提示' },
  { tag: 'igc-tooltip', kind: 'container', valueProp: 'open', label: '工具提示' },
  { tag: 'igc-linear-progress', kind: 'display', valueProp: 'value', label: '线性进度' },
  { tag: 'igc-circular-progress', kind: 'display', valueProp: 'value', label: '环形进度' },

  // ── 必要子元素（不进顶层调色板，仅注册供 slot 内用；多数当作 container 以便放孙节点）──
  { tag: 'igc-radio', kind: 'input', valueProp: 'checked', top: false, label: '单选项', defaultText: '选项' },
  { tag: 'igc-select-item', kind: 'container', valueProp: 'selected', top: false, label: '选项', defaultText: '选项' },
  { tag: 'igc-select-group', kind: 'container', top: false, label: '选项分组' },
  { tag: 'igc-select-header', kind: 'container', top: false, label: '选项标题', defaultText: '分组' },
  { tag: 'igc-rating-symbol', kind: 'container', top: false, label: '评分符号' },
  { tag: 'igc-card-header', kind: 'container', top: false, label: '卡片头' },
  { tag: 'igc-card-content', kind: 'container', top: false, label: '卡片内容' },
  { tag: 'igc-card-media', kind: 'container', top: false, label: '卡片媒体' },
  { tag: 'igc-card-actions', kind: 'container', top: false, label: '卡片操作' },
  { tag: 'igc-tab', kind: 'container', valueProp: 'selected', top: false, label: '标签', defaultText: '标签' },
  { tag: 'igc-step', kind: 'container', top: false, label: '步骤' },
  { tag: 'igc-tree-item', kind: 'container', valueProp: 'selected', top: false, label: '树节点' },
  { tag: 'igc-dropdown-item', kind: 'container', valueProp: 'selected', top: false, label: '菜单项', defaultText: '菜单项' },
  { tag: 'igc-dropdown-group', kind: 'container', top: false, label: '菜单分组' },
  { tag: 'igc-dropdown-header', kind: 'container', top: false, label: '菜单标题', defaultText: '分组' },
  { tag: 'igc-carousel-slide', kind: 'container', valueProp: 'active', top: false, label: '轮播页' },
  { tag: 'igc-nav-drawer-item', kind: 'container', valueProp: 'active', top: false, label: '抽屉项' },
  { tag: 'igc-nav-drawer-header-item', kind: 'container', top: false, label: '抽屉标题' },
  { tag: 'igc-toggle-button', kind: 'container', valueProp: 'selected', top: false, label: '切换按钮', defaultText: '按钮' },
  { tag: 'igc-tile', kind: 'container', top: false, label: '磁贴' },
  { tag: 'igc-expansion-panel-child', skip: true },
]

const KIND_NEST = { input: false, display: false, container: true, child: true }

/** igcXxx → cmx-xxx：igcChange→cmx-change, igcInput→cmx-input, igcOpening→cmx-opening ... */
function eventToCmx (igcEvent) {
  const base = igcEvent.replace(/^igc/, '')
  return 'cmx-' + base.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

/** union 字面量类型 "'a' | 'b' | 'c'" → ['a','b','c']；否则 null */
function enumOptions (typeText) {
  if (!typeText || !typeText.includes("'")) return null
  const opts = (typeText.match(/'([^']*)'/g) || []).map((s) => s.slice(1, -1))
  // 去掉 undefined 字面量噪声
  const filtered = opts.filter((o) => o && o !== 'undefined')
  return filtered.length >= 2 ? filtered : null
}

/** manifest attr type → 调色板 attr.type */
function attrType (typeText) {
  const t = (typeText || '').toLowerCase()
  if (t === 'boolean') return { type: 'boolean' }
  const opts = enumOptions(typeText)
  if (opts) return { type: 'select', options: opts }
  if (t.includes('number')) return { type: 'number' }
  return { type: 'text' }
}

function main () {
  const man = loadManifest()
  const thinSpecs = []
  const palette = []

  for (const c of CURATED) {
    if (c.skip) continue
    const md = man[c.tag]
    if (!md) { console.error('!! manifest 缺少', c.tag); continue }
    const cmxTag = 'cmx-' + c.tag.replace(/^igc-/, 'ignite-')
    const attrs = md.attrs.map((a) => a.n)
    const events = md.events
    const slots = md.slots
    const container = KIND_NEST[c.kind]
    const top = c.top !== false && c.kind !== 'child'

    // THIN_SPEC
    const spec = { cmxTag, innerTag: c.tag, attrs, events }
    if (c.valueProp) spec.valueProp = c.valueProp
    if (container) spec.container = true
    if (slots.length) spec.slots = slots
    if (c.defaultText) spec.defaultText = c.defaultText
    thinSpecs.push(spec)

    if (!top) continue

    // PALETTE component
    const paletteAttrs = md.attrs
      .filter((a) => !/^(value|checked|selected)$/.test(a.n)) // 运行时值，不在设计器静态编辑
      .map((a) => {
        const at = attrType(a.t)
        return { name: a.n, label: a.n, ...at }
      })
    const comp = {
      tag: cmxTag,
      group: 'cmx-ignite-thin',
      label: `<${cmxTag}>`,
      description: `Ignite ${c.tag} 封装（${c.label}）`,
      canNest: container,
      isVoid: !container,
      attrs: paletteAttrs,
      styleGroups: ['layout', 'flex', 'box', 'position'],
    }
    if (events.length) comp.extraEvents = events.map(eventToCmx)
    const defAttrs = { style: container ? 'display:block;' : 'display:inline-block;' }
    comp.defaults = { attributes: defAttrs }
    if (c.defaultText) comp.defaults.text = c.defaultText
    palette.push(comp)
  }

  console.log('// ====== THIN_SPECS ======')
  console.log(JSON.stringify(thinSpecs, null, 2))
  console.log('\n// ====== PALETTE ======')
  console.log(JSON.stringify(palette, null, 2))
  console.error(`\n[gen] thinSpecs=${thinSpecs.length} paletteTop=${palette.length}`)
}

main()
