/**
 * 编码规则管理的「列表 ↔ 主体 ↔ 检视器」共享总线。
 *
 * 结构与 definition-bus.js 的 DefinitionBus 对齐——三区组件通过同一 bus 实例联动：
 *   list(左) 点选 → bus.select(code) → controller(中) 加载规则 → bus.emitState() → inspector(右) 重渲染
 *
 * 单例缓存到 globalThis，保证 list / controller / inspector 三组件解析到同一实例。
 */
export class CodeRuleBus extends EventTarget {
  constructor () {
    super()
    this.items = []          // 规则列表 [{ ruleCode, ruleName, domainCode, moduleCode, mode, isActive }]
    this.selectedCode = ''   // 当前选中的规则编码（空=新建态/未选）
    this.controller = null   // CmxCodeRuleManager 实例（持有 _currentRule/_segments）
    // 规则可见范围（DAM 三级筛选）：null=未初始化；初始化后 { domain, application, module }，
    // 空串=该级不过滤。列表加载与查看/保存/删除的请求头共用此值——列表里看得到的规则
    // 必然匹配当前筛选，对它操作带同样筛选头不会错配；新建时空 body 由后端按头补归属。
    this.damFilter = null
  }

  setItems (items) {
    this.items = Array.isArray(items) ? items : []
    this.dispatchEvent(new CustomEvent('items', { detail: { items: this.items } }))
  }

  select (code) {
    this.selectedCode = code || ''
    this.dispatchEvent(new CustomEvent('select', { detail: { code: this.selectedCode } }))
  }

  emitState (force = false) {
    this.dispatchEvent(new CustomEvent('state', { detail: { force } }))
  }

  setController (c) {
    this.controller = c
    this.dispatchEvent(new CustomEvent('controller', { detail: {} }))
  }

  clearController (c) {
    if (this.controller === c) {
      this.controller = null
      this.dispatchEvent(new CustomEvent('controller', { detail: {} }))
    }
  }
}

const _bus = (globalThis.__cmxCodeRuleBus instanceof CodeRuleBus)
  ? globalThis.__cmxCodeRuleBus
  : (globalThis.__cmxCodeRuleBus = new CodeRuleBus())

/** 编码规则总线单例（整个应用唯一，不区分 kind）。 */
export function busForCodeRule () {
  return _bus
}
