/**
 * 消息状态管理 —— SSE 事件 → part 累积模型。
 *
 * 借鉴 opencode 的 part 驱动设计：AI 消息是一个有序 part 列表，
 * 不同类型 part（text/reasoning/tool）按到达顺序累积。
 * 当 part 类型切换时（如 text→tool→text），新建独立 part，
 * 保持顺序清晰，便于按 part 分别渲染。
 *
 * Lit 组件通过订阅 store 的 messages 数组响应式更新。
 */

/**
 * @typedef {Object} Part
 * @property {'text'|'reasoning'|'tool'} type
 * @property {string} [text]          - text/reasoning 的累积文本
 * @property {string} [tool]          - tool 名（read/write/bash...）
 * @property {string} [state]         - tool 状态（pending/running/completed/error）
 * @property {string} [output]        - tool 输出（completed 时）
 * @property {number} [startTime]     - tool/reasoning 起始时间
 * @property {number} [endTime]       - tool/reasoning 结束时间
 * @property {boolean} [running]      - 是否进行中
 */

/**
 * @typedef {Object} Message
 * @property {'user'|'assistant'} role
 * @property {Part[]} parts
 * @property {string} [text]          - user 消息的纯文本
 * @property {string} [error]         - 错误消息
 * @property {boolean} [done]         - AI 消息是否完成
 * @property {Object} [result]        - result 事件数据
 */

export class MessageStore {
  constructor () {
    /** @type {Message[]} */
    this.messages = []
    /** 当前活跃 assistant 消息在 messages 中的 index */
    this._activeIdx = -1
    /** 当前活跃 part 的类型（用于判断是否需新建 part） */
    this._lastPartType = null
    /** result 事件（完成时下发，独立于 parts） */
    this._pendingResult = null
  }

  /** 添加用户消息。 */
  addUserMessage (text) {
    this.messages = [...this.messages, { role: 'user', text, parts: [] }]
    this._notify()
  }

  /** 开始一个新的 assistant 消息（发送消息时调用）。 */
  startAssistantMessage () {
    this.messages = [...this.messages, { role: 'assistant', parts: [], done: false }]
    this._activeIdx = this.messages.length - 1
    this._lastPartType = null
    this._pendingResult = null
    this._notify()
  }

  /** 取当前活跃 assistant 消息（无则 null）。 */
  _activeMsg () {
    return this._activeIdx >= 0 ? this.messages[this._activeIdx] : null
  }

  /**
   * 追加文本/推理增量到当前活跃 part。
   * 若上一个 part 类型不同，则新建 part（保证 text/tool/reasoning 各自独立段落）。
   *
   * 重要：用不可变更新（创建新 part 对象 + 新 parts 数组 + 新 message 对象），
   * 让 Lit 的 property 变更检测能感知到变化（Lit 对数组/对象做引用比较）。
   */
  _appendDelta (type, content) {
    const msg = this._activeMsg()
    if (!msg || !content) return
    const oldParts = msg.parts
    const last = oldParts[oldParts.length - 1]
    const now = Date.now()
    let newParts
    if (last && last.type === type) {
      // 同类型：复制最后一个 part，更新 text
      const updatedLast = { ...last, text: (last.text || '') + content }
      newParts = [...oldParts.slice(0, -1), updatedLast]
    } else {
      // 新类型：先终结上一个 part 的 running 态（对齐 opencode reasoning.ended 语义——
      // 当模型从思考转入工具调用/文本,上一段思考即视为结束）。
      // 这修复了"多轮思考时前一轮仍显示思考中"的 bug。
      const finalized = oldParts.map((p) =>
        p.running ? { ...p, running: false, endTime: now } : p
      )
      // 新建 part
      const newPart = { type, text: content, startTime: now, running: true }
      newParts = [...finalized, newPart]
    }
    // 用新 parts 数组替换当前 message（不可变更新）
    this.messages[this._activeIdx] = { ...msg, parts: newParts }
    this._lastPartType = type
    this._notify()
  }

  /**
   * 更新工具 part 的状态。
   * 同名工具复用同一 part（pending→running→completed），
   * 不同工具或新一轮调用则新建。
   *
   * 同样用不可变更新，确保 Lit 感知变化。
   */
  /**
   * 判断 input 是否"实质为空"(null / 空对象 / 无任何自身键)。
   * 用于更新现有 tool part 时:空 input 不覆盖已有的有效 input,
   * 避免同名工具合并错误时把 filePath 等关键字段冲掉。
   */
  _isEmptyInput (input) {
    if (input == null) return true
    if (typeof input !== 'object') return false
    return Object.keys(input).length === 0
  }

  updateToolCall (tool, state, data = {}) {
    let msg = this._activeMsg()
    const partId = data.part_id || data.partId || ''

    // 修复「工具执行完无法点击展开」的竞态路径：done 事件会把 _activeIdx 置为 -1，
    // 但 OpenCode 的 tool completed 事件偶尔会在 done 之后到达（SSE 分帧/慢工具）。
    // 此时 _activeMsg() 返回 null 会直接 return，导致 part 的 output 永远拿不到 →
    // 前端 state=completed 但 output 为空 → 无法展开。
    // 兜底：无活跃消息时，按 partId 在所有消息里找回该 part 所属的消息原地更新。
    if (!msg) {
      if (!partId) return
      // 倒序查找（最近的消息优先）包含该 partId 的 assistant 消息。
      for (let mi = this.messages.length - 1; mi >= 0; mi--) {
        const m = this.messages[mi]
        if (m && m.role === 'assistant' && Array.isArray(m.parts) &&
            m.parts.some(p => p.type === 'tool' && p.partId === partId)) {
          this._updateToolCallInMessage(mi, tool, state, data, partId)
          return
        }
      }
      return
    }

    this._updateToolCallInMessage(this._activeIdx, tool, state, data, partId)
  }

  /**
   * 在指定消息上执行工具 part 更新（不可变）。
   * @param {number} msgIdx 消息在 messages 中的索引
   * @param {string} tool 工具名
   * @param {string} state 状态
   * @param {object} data SSE 事件数据
   * @param {string} partId part id
   */
  _updateToolCallInMessage (msgIdx, tool, state, data, partId) {
    const msg = this.messages[msgIdx]
    if (!msg) return
    const oldParts = msg.parts
    // 有 partId 时:严格按 partId 匹配,匹配不到就新建,绝不走同名回退
    // (否则多个同名工具的 pending 帧会互相错误命中、覆盖,导致只显示一个)。
    // 仅旧后端(无 part_id)才回退到"最后一个同名且未完成的 tool part"。
    let targetIdx = -1
    if (partId) {
      for (let i = oldParts.length - 1; i >= 0; i--) {
        const p = oldParts[i]
        if (p.type === 'tool' && p.partId === partId) { targetIdx = i; break }
      }
    } else {
      for (let i = oldParts.length - 1; i >= 0; i--) {
        const p = oldParts[i]
        if (p.type === 'tool' && p.tool === tool && p.state !== 'completed' && p.state !== 'error') {
          targetIdx = i
          break
        }
      }
    }
    const now = Date.now()
    let newParts
    if (targetIdx === -1) {
      // 新工具 part：先终结上一个非 tool part 的 running 态（思考/文本段视为结束）
      const finalized = oldParts.map((p) =>
        (p.type !== 'tool' && p.running) ? { ...p, running: false, endTime: now } : p
      )
      const newPart = { type: 'tool', tool, partId, state, startTime: now, running: state === 'running' || state === 'pending' }
      // completed/error:终结态,带完整数据(question 已回答、skill output 等)
      if ((state === 'completed' || state === 'error') && data) {
        newPart.endTime = now
        newPart.running = false
      }
      // 任意态:只要后端下发了 input/output/metadata 就写入
      // (skill 在 pending/running 时就带 input.name,前端据此渲染扫光技能名标题)
      if (data) {
        if (data.input !== undefined) newPart.input = data.input
        if (data.output !== undefined) newPart.output = data.output
        if (data.metadata !== undefined) newPart.metadata = data.metadata
      }
      newParts = [...finalized, newPart]
    } else {
      // 更新现有 tool part（复制）
      const old = oldParts[targetIdx]
      const updated = { ...old, state, running: state === 'running' || state === 'pending' }
      if (state === 'completed' || state === 'error') {
        updated.endTime = now
        updated.running = false
      }
      // 写入后端下发的 input/output/metadata。
      // 空 input(null/{})不覆盖已有有效 input —— 避免同名工具合并错误时
      // 把前一个工具的 filePath 等字段冲掉(导致 read 不显示文件名)。
      if (data) {
        if (data.input !== undefined && (this._isEmptyInput(data.input) ? !updated.input : true)) {
          updated.input = data.input
        }
        if (data.output !== undefined) updated.output = data.output
        if (data.metadata !== undefined) updated.metadata = data.metadata
      }
      newParts = [...oldParts.slice(0, targetIdx), updated, ...oldParts.slice(targetIdx + 1)]
    }
    this.messages[msgIdx] = { ...msg, parts: newParts }
    this._lastPartType = 'tool'
    this._notify()
  }

  /** 处理 SSE 事件（由 chat 组件调用）。 */
  handleSseEvent (type, data) {
    switch (type) {
      case 'text_delta':
        this._appendDelta('text', data.content || '')
        break
      case 'reasoning_delta':
        this._appendDelta('reasoning', data.content || '')
        break
      case 'tool_call':
        // 防御：SSE 超大帧被代理截断时，_dispatch 的 JSON.parse 失败会回退为原始字符串。
        // 此时 data 不是对象 → 无法提取 tool/state/part_id → 创建幽灵 part（tool=unknown,state=running）
        // → 前端永久卡 pending。这里直接丢弃坏帧，等合法帧到达。
        if (!data || typeof data !== 'object') {
          console.warn('[MessageStore] 丢弃格式异常的 tool_call 帧（可能 SSE 超大帧被截断）')
          break
        }
        this.updateToolCall(data.tool || 'unknown', data.state || 'running', data)
        break
      case 'json_chunk':
        // 一期暂不单独渲染 json_chunk 预览，累积进 text（与后端 text_delta 同时下发一致）
        break
      case 'result':
        this._pendingResult = data
        // 同时标记最后一个 text part 完成
        this._finalizeRunningParts()
        this._notify()
        break
      case 'done':
        this._finalizeMessage()
        break
      case 'error':
        this._handleError(data)
        break
      case 'ask_user':
      case 'require_approval':
        // 由 chat 组件单独处理（询问卡片），不进 part 模型
        break
    }
  }

  /**
   * 标记所有 running 的 part 为完成(不可变更新)。
   * 关键:tool part 不仅设 running:false,还要把 state 从 pending/running 推进到 completed,
   * 否则前端 ai-tool-part 的 _isPending(看 state 字段)仍判定为进行中,标题持续 shimmer。
   * 对齐 opencode cleanup:会话结束时残留的 running tool 被标记为终态。
   */
  _finalizeRunningParts () {
    const msg = this._activeMsg()
    if (!msg) return
    const now = Date.now()
    let changed = false
    const newParts = msg.parts.map((p) => {
      if (p.running) {
        changed = true
        const updated = { ...p, running: false, endTime: now }
        // tool part:state 推进到 completed(有 output)或 completed(无 output 也算结束)
        if (p.type === 'tool' && (p.state === 'running' || p.state === 'pending')) {
          updated.state = 'completed'
        }
        return updated
      }
      return p
    })
    if (changed) {
      this.messages[this._activeIdx] = { ...msg, parts: newParts }
    }
  }

  /** 完成当前 assistant 消息（不可变更新）。空消息(无 parts/无 error)直接移除。 */
  _finalizeMessage () {
    const msg = this._activeMsg()
    if (!msg) return
    this._finalizeRunningParts()
    const fresh = this.messages[this._activeIdx] || msg
    // 空回复(无正文、无工具、无错误)不保留空气泡
    const isEmpty = (!fresh.parts || fresh.parts.length === 0) && !fresh.error
    if (isEmpty) {
      this.messages = this.messages.filter((_, i) => i !== this._activeIdx)
      this._activeIdx = -1
      this._notify()
      return
    }
    const updates = { done: true }
    if (this._pendingResult) {
      updates.result = this._pendingResult
      this._pendingResult = null
    }
    this.messages[this._activeIdx] = { ...fresh, ...updates }
    this._activeIdx = -1
    this._notify()
  }

  /**
   * 用户主动中断:若有内容则按正常完成保留(后端会补发 done),
   * 无内容则移除空气泡。状态归位由调用方(app)处理。
   */
  _abortActive () {
    const msg = this._activeMsg()
    if (!msg) return
    this._finalizeRunningParts()
    const fresh = this.messages[this._activeIdx] || msg
    const hasContent = (fresh.parts || []).some(p => p.type === 'text' || p.type === 'tool')
    if (hasContent) {
      this.messages[this._activeIdx] = { ...fresh, done: true }
    } else {
      this.messages = this.messages.filter((_, i) => i !== this._activeIdx)
    }
    this._activeIdx = -1
    this._notify()
  }

  /** 处理错误。code===499 视为用户中断(柔和提示，文案固定"已中断")，其余为真实错误。 */
  _handleError (data) {
    const msg = this._activeMsg()
    const code = data && data.code
    const aborted = code === 499
    // 中断时后端的 data.message 可能是英文（如 "Aborted"/"The operation was aborted"），
    // 一律归一化为中文"已中断"，不透传英文。
    const errMsg = aborted ? '已中断' : ((data && (data.message || data.msg)) || '生成过程出错')
    if (msg) {
      this._finalizeRunningParts()
      const fresh = this.messages[this._activeIdx] || msg
      this.messages[this._activeIdx] = { ...fresh, error: errMsg, aborted, done: true }
    } else {
      // 中断但无内容：不新建空消息，静默归位（对齐 opencode：空回复的中断不打扰用户）。
      if (aborted) {
        this._activeIdx = -1
        return
      }
      this.messages = [...this.messages, { role: 'assistant', parts: [], done: true, error: errMsg }]
    }
    this._activeIdx = -1
    this._notify()
  }

  /** 清空所有消息（新会话）。 */
  clear () {
    this.messages = []
    this._activeIdx = -1
    this._lastPartType = null
    this._pendingResult = null
    this._notify()
  }

  /** 订阅回调列表。 */
  _listeners = new Set()

  /** 订阅消息变化。返回取消订阅函数。 */
  subscribe (fn) {
    this._listeners.add(fn)
    return () => this._listeners.delete(fn)
  }

  /** 通知所有订阅者。 */
  _notify () {
    for (const fn of this._listeners) {
      try { fn(this.messages) } catch (e) { console.error('[MessageStore] subscriber error', e) }
    }
  }
}
