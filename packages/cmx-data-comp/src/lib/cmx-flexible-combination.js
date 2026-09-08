/**
 * CmxFlexibleCombination —— 弹性组合模型组件。
 *
 * 把"按锚点维度组合从后端取弹性组合 rule → 转成 CmxColumn[] → 写入目标 CmxColumnModel"
 * 这套流程封装为可声明、可在 Designer 模型面板编辑的模型。
 *
 * 与 CmxColumnModel 的关系（支持单绑定 / 按表多绑定）：
 *   - props.columnModelId 为 string：单绑定，命中的字段集0（rule.detail）写入该列模型；
 *   - props.columnModelId 为 { [表名]: 列模型ID }：按表多绑定——规则的每个字段集
 *     （detail + detail.fieldTabs[]，各带 table）按表名路由到对应列模型；
 *     `'*'` 键作为未命中表的兜底绑定。未匹配且无兜底的字段集 console.warn 跳过（不静默丢弃）。
 *   - 写入目标后由 CmxColumnModel 派发 `columns-changed` → 所有订阅该模型的可视组件
 *     （cmx-revo-grid 等）自动重新渲染。
 *
 * 与 FlexibleCombinationEngine 的关系：
 *   - 自身不分发：把规则委托给一个内置的 FlexibleCombinationEngine 微型实例（dimensions + [rule]），
 *     这样 buildMembers() 出来的列上仍带 calcFormula / onPickDimension 等交互闭包
 *
 * 数据来源（按优先级）：
 *   1. `props.resolver(anchorValues) -> Promise<{rule, dimensions}>` 显式注入
 *   2. props.serviceFn（host 上的 pageService 函数名）—— 设计器服务面板里声明的 REST 服务
 *   3. 默认 fetch('/api/flexible-combination/rule?...&<dim>=<v>')
 *
 * 缓存：按锚点签名缓存最近一次结果（含全部字段集的 members），重复锚点直接复用，不再请求后端。
 *
 * 事件：
 *   - `flexible-combination-loaded`  detail: { anchor, ruleId, fromCache }
 *   - `flexible-combination-error`   detail: { anchor, error }
 *   - `flexible-combination-cleared`
 */
import { FlexibleCombinationEngine } from './flexible-combination-engine.js'
import { readHttpErrorMessage } from './cmx-doc-source.js'

const DEFAULT_API_PATH = '/api/flexible-combination/rule'
const DEFAULT_CONFIG_PATH = '/api/flexible-combination/config'

export class CmxFlexibleCombination extends EventTarget {
  /**
   * @param {{
   *   domain?: string, app?: string, module?: string, scenario?: string,
   *   columnModelId?: string | Record<string,string>, // 同 host 下 CmxColumnModel 的 instanceId；对象形态为 表名→instanceId 多绑定
   *   apiPath?: string,          // 默认 /api/flexible-combination/rule
   *   serviceFn?: string,        // 优先：host[serviceFn](params) 取值
   *   resolver?: Function,       // 最高优先：自定义 (anchor) => Promise<{rule, dimensions}>
   *   anchorDimensions?: string[], // 当后端未配置 anchorDimensions 时的兜底
   * }} props
   */
  constructor (props = {}) {
    super()
    this.domain   = props.domain   || ''
    this.app      = props.app      || ''
    this.module   = props.module   || ''
    this.scenario = props.scenario || ''
    this.columnModelId   = props.columnModelId   || ''
    this.apiPath         = props.apiPath         || DEFAULT_API_PATH
    this.serviceFn       = props.serviceFn       || ''
    this.resolver        = typeof props.resolver === 'function' ? props.resolver : null
    this.anchorDimensions = Array.isArray(props.anchorDimensions) ? props.anchorDimensions.slice() : []

    /**
     * 绑定列表：[{ table: string|null, model, initialMembers }]
     *   - table === null：默认绑定（string 模式唯一目标 / 字段集0）
     *   - table === '*'：多绑定模式下的兜底
     *   - 其它：按字段集 table 精确路由
     */
    this._bindings = []
    this._host = null
    this._cache = new Map()              // anchorKey → { ruleId, fieldSets: [{index,table,name,members}] }
    this._currentRuleId = null
  }

  // ─── 绑定 ──────────────────────────────────────────────────────────────

  /**
   * 关联目标 CmxColumnModel（运行时初始化阶段调用）。
   * @param {import('./cmx-column-model.js').CmxColumnModel} model 目标列模型
   * @param {string|null} [table] 多绑定模式下该模型承接的字段集表名；'*' 为兜底；缺省为默认绑定（字段集0）
   */
  bindColumnModel (model, table = null) {
    if (!model) return this
    let binding = this._bindings.find((b) => b.table === table)
    if (!binding) {
      binding = { table, model: null, initialMembers: null }
      this._bindings.push(binding)
    }
    if (binding.model !== model) {
      // 首绑或换绑：以该模型当前 members 作为 clear()/失败回退的快照
      binding.model = model
      binding.initialMembers = (model.members || []).slice()
    }
    return this
  }

  /** 绑定 host，供 serviceFn 查找。 */
  bindHost (host) { this._host = host; return this }

  // ─── 加载 ──────────────────────────────────────────────────────────────

  /**
   * 按锚点维度值组合加载、应用并缓存弹性组合（全部字段集按绑定路由应用）。
   * @param {Record<string,string|number>} anchorValues
   * @returns {Promise<{ruleId:string|null, fromCache:boolean}>}
   */
  async loadByAnchor (anchorValues) {
    const anchor = this._cleanAnchor(anchorValues)
    const key    = this._cacheKey(anchor)

    // 命中缓存
    if (this._cache.has(key)) {
      const result = this._cache.get(key)
      this._applyResult(result)
      this._currentRuleId = result.ruleId || null
      this.dispatchEvent(new CustomEvent('flexible-combination-loaded', { detail: { anchor, ruleId: this._currentRuleId, fromCache: true } }))
      return { ruleId: this._currentRuleId, fromCache: true }
    }

    try {
      const res = await this._fetchRule(anchor)
      const result = this._buildResult(res)
      if (!result) throw new Error('取数结果不含 rule')
      this._cache.set(key, result)
      this._applyResult(result)
      this._currentRuleId = result.ruleId || null
      this.dispatchEvent(new CustomEvent('flexible-combination-loaded', { detail: { anchor, ruleId: this._currentRuleId, fromCache: false } }))
      return { ruleId: this._currentRuleId, fromCache: false }
    } catch (err) {
      this._restoreInitial()
      this.dispatchEvent(new CustomEvent('flexible-combination-error', { detail: { anchor, error: err } }))
      console.warn('[CmxFlexibleCombination] loadByAnchor failed:', err && err.message || err)
      return { ruleId: null, fromCache: false }
    }
  }

  /** 直接设置已有的 rule + dimensions（不经过 fetch；缓存仍按 anchor 写入）。 */
  setRule ({ rule, dimensions, anchor }) {
    const result = this._buildResult({ rule, dimensions })
    if (!result) {
      // 无有效规则：还原各绑定初始列（与旧实现"回到初始 members"语义一致）
      this._restoreInitial()
      this._currentRuleId = null
      return this
    }
    if (anchor) this._cache.set(this._cacheKey(this._cleanAnchor(anchor)), result)
    this._applyResult(result)
    this._currentRuleId = result.ruleId || null
    return this
  }

  /**
   * 按 scenario 坐标拉取弹性组合配置，取默认 rule（isDefault:true，否则第一条）直接出列。
   *
   * 用于"grid 声明一个 FLC 坐标就自动出列"的初始化路径（类似 DOC 的 columnsSource）：
   * 不经过 anchor 匹配，直接用默认 rule 编译列。失败静默（保持目标模型原列）。
   *
   * 走 `?expanded=1` 请求读时展开后的档案（overlay use/pick 已展开为 inline fields），
   * 与 /rule 返回同源，保证 pick/use 规则在无 docTables 的运行时也能出列。
   *
   * 需要 constructor 时传入 domain/app/module/scenario（或运行时 setCoord）。
   * @returns {Promise<{ruleId:string|null}>}
   */
  async loadDefaultRule () {
    if (!this.scenario || !this.module) return { ruleId: null }
    try {
      const params = new URLSearchParams({
        domain: this.domain, app: this.app, module: this.module, scenario: this.scenario,
        expanded: '1',
      })
      const r = await fetch(`${DEFAULT_CONFIG_PATH}?${params.toString()}`)
      if (!r.ok) throw await _httpError(r)
      const cfg = await r.json()
      const rules = Array.isArray(cfg?.rules) ? cfg.rules : []
      const dimensions = cfg?.dimensions || {}
      if (!rules.length) return { ruleId: null }
      // 默认 rule：isDefault:true 优先，否则第一条
      const rule = rules.find((x) => x && x.isDefault) || rules[0]
      this.setRule({ rule, dimensions })
      this.dispatchEvent(new CustomEvent('flexible-combination-loaded', {
        detail: { ruleId: rule && rule.id || null, fromCache: false, defaultRule: true },
      }))
      return { ruleId: rule && rule.id || null }
    } catch (err) {
      console.warn('[CmxFlexibleCombination] loadDefaultRule failed:', err && err.message || err)
      this.dispatchEvent(new CustomEvent('flexible-combination-error', { detail: { error: err } }))
      return { ruleId: null }
    }
  }

  /**
   * 直接通过 JSON 对象设置弹性组合（不经后端）。宽容接受两种形态：
   *
   *   1) 单规则：`{ rule, dimensions, anchor? }`
   *      —— 直接套这条 rule（等价于 setRule）。
   *
   *   2) 多规则配置：`{ rules, dimensions, anchor? }` 或 `{ config:{ rules, dimensions }, anchor? }`
   *      —— 用 FlexibleCombinationEngine 在多规则里按 anchor 解析一条；
   *         如果不传 anchor 但只有一条 rule，自动选它。
   *
   * 返回 `{ ruleId, found }`。
   */
  setCombination (json) {
    if (!json || typeof json !== 'object') return { ruleId: null, found: false }
    /* 形态 2：多规则配置（含 config 套层 / 直接 rules 字段） */
    const cfg = json.config && typeof json.config === 'object' ? json.config : json
    if (Array.isArray(cfg.rules)) {
      const dimensions = cfg.dimensions || {}
      const rules      = cfg.rules
      let rule = null
      if (json.anchor && typeof json.anchor === 'object') {
        const eng = new FlexibleCombinationEngine({ dimensions, rules })
        rule = eng.resolveMergedRule(this._cleanAnchor(json.anchor))
      } else if (rules.length === 1) {
        rule = rules[0]
      }
      if (!rule) {
        console.warn('[CmxFlexibleCombination] setCombination：未提供 anchor 或无法在 rules 里解析一条规则')
        return { ruleId: null, found: false }
      }
      this.setRule({ rule, dimensions, anchor: json.anchor })
      return { ruleId: rule.id, found: true }
    }
    /* 形态 1：单规则 */
    if (json.rule) {
      this.setRule({ rule: json.rule, dimensions: json.dimensions || {}, anchor: json.anchor })
      return { ruleId: json.rule.id || null, found: true }
    }
    console.warn('[CmxFlexibleCombination] setCombination：JSON 既不含 rule 也不含 rules')
    return { ruleId: null, found: false }
  }

  /** 还原到各绑定初始列，并清空缓存。 */
  clear () {
    this._cache.clear()
    this._currentRuleId = null
    this._restoreInitial()
    this.dispatchEvent(new CustomEvent('flexible-combination-cleared'))
    return this
  }

  /** 仅清缓存。 */
  invalidateCache (anchor) {
    if (anchor) this._cache.delete(this._cacheKey(this._cleanAnchor(anchor)))
    else this._cache.clear()
    return this
  }

  // ─── 内部：取值 / 转列 / 写入 ─────────────────────────────────────────

  _cleanAnchor (raw) {
    const a = {}
    if (raw && typeof raw === 'object') {
      for (const k of Object.keys(raw)) if (raw[k] != null) a[k] = String(raw[k])
    }
    return a
  }

  _cacheKey (anchor) {
    return Object.keys(anchor).sort().map((k) => `${k}=${anchor[k]}`).join('&')
  }

  async _fetchRule (anchor) {
    // 1) 显式 resolver 优先
    if (typeof this.resolver === 'function') return await this.resolver(anchor)
    // 2) serviceFn（pageService 名）次之
    if (this.serviceFn && this._host && typeof this._host[this.serviceFn] === 'function') {
      return await this._host[this.serviceFn]({
        domain: this.domain, app: this.app, module: this.module, scenario: this.scenario,
        ...anchor,
      })
    }
    // 3) 默认 fetch
    if (typeof fetch !== 'function') throw new Error('fetch 不可用，且未配置 resolver/serviceFn')
    const params = new URLSearchParams({
      domain: this.domain, app: this.app, module: this.module, scenario: this.scenario,
      ...anchor,
    })
    const r = await fetch(`${this.apiPath}?${params.toString()}`)
    if (!r.ok) throw await _httpError(r)
    return await r.json()
  }

  /**
   * 把 (rule + dimensions) 编译为"按字段集分组的 members"结果：
   *   { ruleId, fieldSets: [{ index, table, name, members }] }
   *
   * 每个字段集的 members 由 FlexibleCombinationEngine.buildMembers 生成——
   * 支持 rule.detail.groups 任意层嵌套；字段集0 = rule.detail，index≥1 = detail.fieldTabs[]。
   */
  _buildResult (res) {
    if (!res || !res.rule) return null
    const eng = new FlexibleCombinationEngine({ dimensions: res.dimensions || {}, rules: [res.rule] })
    const fieldSets = eng.fieldSetsOf(res.rule).map((fs) => ({
      index: fs.index,
      table: fs.table,
      name:  fs.name,
      members: eng.buildMembers({ ...res.rule, detail: fs.detail, columnModel: fs.columnModel }),
    }))
    return { ruleId: (res.ruleId != null ? res.ruleId : res.rule.id) || null, fieldSets }
  }

  /** 字段集表名 → 绑定（精确表名 → '*' 兜底 → 唯一默认绑定）；找不到返回 null。 */
  _bindingForTable (table) {
    if (table && this._bindings.some((b) => b.table === table)) {
      return this._bindings.find((b) => b.table === table)
    }
    if (this._bindings.some((b) => b.table === '*')) {
      return this._bindings.find((b) => b.table === '*')
    }
    // 默认绑定（table === null，即 string 模式）仅在没有任何表名绑定时兜底
    if (!this._bindings.some((b) => b.table != null)) {
      return this._bindings.find((b) => b.table === null) || null
    }
    return null
  }

  /** 把结果按绑定路由写入各目标列模型；未绑定的字段集显式 warn（不静默丢弃）。 */
  _applyResult (result) {
    const sets = (result && result.fieldSets) || []
    if (!this._bindings.length || !sets.length) return
    const singleDefault = this._bindings.length === 1 && this._bindings[0].table === null
    if (singleDefault) {
      // 单绑定（string 模式，向后兼容）：始终应用字段集0
      this._bindings[0].model.setMembers((sets[0] && sets[0].members) || [])
      if (sets.length > 1) {
        console.info(
          `[CmxFlexibleCombination] 命中规则含 ${sets.length} 个字段集，单绑定模式仅应用字段集0（${sets[0].table || '未命名表'}）。` +
          '如需全部应用，请把 columnModelId 配置为 { 表名: 列模型ID } 映射',
        )
      }
      return
    }
    for (const fs of sets) {
      const binding = this._bindingForTable(fs.table)
      if (!binding) {
        console.warn(`[CmxFlexibleCombination] 字段集「${fs.table || fs.name || `#${fs.index}`}」没有可用的绑定列模型（columnModelId 映射缺该表且无 '*' 兜底），已跳过`)
        continue
      }
      binding.model.setMembers(fs.members || [])
    }
  }

  /** 各绑定还原到初始 members（clear / 取数失败 / 无规则时）。 */
  _restoreInitial () {
    for (const b of this._bindings) {
      if (b.model) b.model.setMembers(b.initialMembers || [])
    }
  }
}

/**
 * 构造带后端文案的 HTTP 错误：读响应体 {error, msg}（门户拦截器对非 2xx 的产物 / 后端
 * ApiResp），文案逻辑复用 cmx-doc-source.readHttpErrorMessage（三处装载链路单一真源）。
 * 原先只抛 `HTTP ${status}` 会把后端错误文案（如校验失败原因）整个丢掉。
 */
async function _httpError (r) {
  const body = await r.json().catch(() => null)
  return new Error(readHttpErrorMessage(body, r))
}
