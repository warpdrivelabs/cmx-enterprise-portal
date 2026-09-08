/**
 * 询问卡片 —— opencode DockShell 风格,一次一问(对齐 opencode 标签顺序呈现)。
 *
 * <ai-ask-card .data=${askUserEvent} @answer=${handler}></ai-ask-card>
 *
 * data 形态(对齐后端 AskUserEvent):
 *   { questionId, questions: [{ type, title, message, multiple, custom, options: [{label, description}] }] }
 *
 * 自定义答案(对齐 opencode):custom=true(默认)时,在预设选项末尾追加一个
 * "输入自己的答案"选项(单选 radio / 多选 checkbox)。选中后内联展开输入框,
 * 用户输入的文字即成为该问的答案(与预设 label 同等地位,无特殊标记)。
 *
 * 多问时一次只展示一问,点"下一题"/"确认"推进;最后一问提交时组装
 * answers = [[q1...], [q2...], ...](对齐 OpenCode reply 格式)。
 */
import { LitElement, html, css } from 'lit'
import { keyed } from 'lit/directives/keyed.js'
import { sharedTokens } from '../theme/shared-styles.js'

// 自定义选项的特殊 label(选中态判断用)
const CUSTOM_LABEL = '__custom__'

export class AiAskCard extends LitElement {
  static properties = {
    data: { type: Object },
    _currentIdx: { state: true },
    _submitted: { state: true },
    // 每问的作答状态,按问题 index 存放
    _selections: { state: true },   // Map<idx, Set<label>>  预设选项选择
    _customOn: { state: true },     // Set<idx>  自定义选项是否被勾选
    _customTexts: { state: true },  // Map<idx, string>  自定义输入文本
  }

  static styles = [
    sharedTokens,
    css`
      :host { display: block; }
      .dock {
        max-width: 800px;
        margin: 0 auto;
        background: var(--oc-bg-base);
        border-radius: var(--oc-radius-xl);
        box-shadow: var(--oc-shadow-raised);
        border: 0.5px solid var(--oc-border-base);
        overflow: clip;
      }
      .body { padding: 12px 12px 0; }
      .step {
        display: flex; align-items: center; justify-content: space-between;
        font-size: 12px; color: var(--oc-text-faint);
        font-family: var(--oc-font-sans);
        margin-bottom: 10px;
      }
      .step .label { color: var(--oc-text-muted); }
      .step .dots { display: inline-flex; align-items: center; gap: 6px; }
      .step .dot {
        width: 6px; height: 6px; border-radius: 50%;
        background: var(--oc-border-strong);
        transition: background-color 0.15s ease;
      }
      .step .dot.active { background: var(--oc-accent-fill); }
      .step .dot.done { background: var(--oc-success); }
      .q-title {
        font-size: var(--oc-font-size-base);
        font-weight: 600;
        color: var(--oc-text-base);
        margin-bottom: 4px;
        font-family: var(--oc-font-sans);
      }
      .q-message {
        font-size: var(--oc-font-size-small);
        color: var(--oc-text-muted);
        margin-bottom: 12px;
        line-height: 1.5;
      }
      .options {
        display: flex; flex-direction: column; gap: 6px;
      }
      .opt {
        display: flex; align-items: flex-start; gap: 8px;
        cursor: pointer;
        padding: 8px 8px 8px 10px;
        border: 0.5px solid var(--oc-border-base);
        border-radius: var(--oc-radius-md);
        background: var(--oc-layer-01);
        font-size: var(--oc-font-size-small);
        color: var(--oc-text-base);
        transition: background-color 0.15s ease, border-color 0.15s ease;
        font-family: var(--oc-font-sans);
      }
      .opt:hover { border-color: var(--oc-border-strong); }
      .opt.picked {
        background: var(--oc-info-tint);
        border-color: transparent;
      }
      .opt input { margin-top: 2px; accent-color: var(--oc-accent-fill); }
      .opt-main { flex: 1; min-width: 0; }
      .opt-label { display: block; }
      .opt-desc { display: block; color: var(--oc-text-muted); font-size: 12px; margin-top: 2px; }

      .custom-input {
        display: block; width: 100%; box-sizing: border-box;
        margin-top: 6px; margin-bottom: 8px; padding: 6px 8px;
        font-size: var(--oc-font-size-small); line-height: 1.5;
        font-family: var(--oc-font-sans);
        color: var(--oc-text-base); background: var(--oc-bg-base);
        border: 0.5px solid var(--oc-border-base);
        border-radius: var(--oc-radius-sm);
        resize: vertical; min-height: 32px; max-height: 120px;
        outline: none;
        scrollbar-width: thin;
      }
      .custom-input:focus { border-color: var(--oc-accent-focus); }
      .custom-input::placeholder { color: var(--oc-text-faint); }
      .custom-input::-webkit-scrollbar { width: 6px; }
      .custom-input::-webkit-scrollbar-thumb { background: var(--oc-border-strong); border-radius: 3px; }

      .footer {
        display: flex; justify-content: flex-end; gap: 8px;
        padding: 8px;
        background: var(--oc-layer-01);
        border-top: 0.5px solid var(--oc-border-muted);
      }
      .btn {
        padding: 6px 16px;
        font-size: var(--oc-font-size-small);
        font-weight: 500;
        border-radius: var(--oc-radius-md);
        cursor: pointer;
        transition: background-color 0.15s ease, opacity 0.15s ease;
        font-family: var(--oc-font-sans);
        border: none;
      }
      .btn-primary { background: var(--oc-accent-fill); color: #fff; }
      .btn-primary:hover:not(:disabled) { background: var(--oc-accent-fill-hover); }
      .btn-primary:disabled { opacity: 0.4; cursor: default; }
    `,
  ]

  constructor () {
    super()
    this.data = null
    this._currentIdx = 0
    this._submitted = false
    this._selections = new Map()
    this._customOn = new Set()
    this._customTexts = new Map()
  }

  willUpdate (changed) {
    if (changed.has('data') && this.data) {
      this._currentIdx = 0
      this._submitted = false
      this._selections = new Map()
      this._customOn = new Set()
      this._customTexts = new Map()
    }
  }

  get _questions () {
    return (this.data && Array.isArray(this.data.questions)) ? this.data.questions : []
  }
  get _questionId () { return this.data?.questionId || this.data?.question_id }
  get _current () { return this._questions[this._currentIdx] }
  _isMultiple (q) { return q?.multiple || q?.type === 'multi_choice' }
  _allowCustom (q) { return q?.custom !== undefined ? !!q.custom : true }
  _isTextOnly (q) { return !q?.options || q.options.length === 0 || q?.type === 'text' }

  /** 当前问是否勾选了自定义选项。 */
  _customChecked (idx) { return this._customOn.has(idx) }
  _customText (idx) { return this._customTexts.get(idx) || '' }

  /** 切换预设选项(单选时清空自定义勾选)。 */
  _toggleOption (label, q) {
    if (this._submitted) return
    const idx = this._currentIdx
    const multiple = this._isMultiple(q)
    const sel = new Set(this._selections.get(idx) || new Set())
    // 单选:选预设 → 取消自定义勾选
    if (!multiple && this._customChecked(idx)) {
      this._customOn = new Set([...this._customOn].filter(i => i !== idx))
    }
    if (multiple) {
      if (sel.has(label)) sel.delete(label)
      else sel.add(label)
    } else {
      sel.clear()
      sel.add(label)
    }
    this._selections = new Map(this._selections).set(idx, sel)
    this.requestUpdate()
  }

  /** 切换自定义选项勾选。 */
  _toggleCustom (q) {
    if (this._submitted) return
    const idx = this._currentIdx
    const multiple = this._isMultiple(q)
    const on = new Set(this._customOn)
    if (on.has(idx)) {
      // 取消勾选
      on.delete(idx)
      // 多选:从 answers 移除自定义文本(保留文本以便恢复)
      // 单选:取消即清空预设选择
      if (!multiple) this._selections.set(idx, new Set())
    } else {
      // 勾选
      on.add(idx)
      // 单选:选自定义 → 清空预设选择
      if (!multiple) this._selections.set(idx, new Set())
    }
    this._customOn = on
    this.requestUpdate()
  }

  _onCustomInput (e) {
    this._customTexts = new Map(this._customTexts).set(this._currentIdx, e.target.value)
  }

  /** 当前问是否已作答。 */
  get _currentAnswered () {
    const q = this._current
    if (!q) return false
    const idx = this._currentIdx
    // 自定义勾选且有文本
    if (this._customChecked(idx) && this._customText(idx).trim()) return true
    // 选了预设
    return (this._selections.get(idx) || new Set()).size > 0
  }

  /** 推进到下一问;已是最后一问则提交。 */
  _advance () {
    if (this._submitted || !this._currentAnswered) return
    if (this._currentIdx < this._questions.length - 1) {
      this._currentIdx++
    } else {
      this._submit()
    }
  }

  /** 组装某问的答案(内层数组)。 */
  _qAnswer (idx, q) {
    const sel = this._selections.get(idx) || new Set()
    const labels = [...sel]
    // 自定义勾选且有文本 → 追加自定义文本(与预设 label 同等)
    if (this._customChecked(idx) && this._customText(idx).trim()) {
      labels.push(this._customText(idx).trim())
    }
    return this._isMultiple(q) ? labels : [labels[0]]
  }

  _submit () {
    if (this._submitted) return
    this._submitted = true
    const answers = this._questions.map((q, idx) => this._qAnswer(idx, q))
    this.dispatchEvent(new CustomEvent('answer', { detail: answers }))
  }

  get _actionLabel () {
    return this._currentIdx < this._questions.length - 1 ? '下一步' : '提交'
  }

  /** 渲染单个选项行(预设 或 自定义)。 */
  _renderOption (q, idx, label, desc, isCustom) {
    const multiple = this._isMultiple(q)
    const sel = this._selections.get(idx) || new Set()
    const picked = isCustom ? this._customChecked(idx) : sel.has(label)
    const customText = this._customText(idx)
    return html`
      <label class="opt ${picked ? 'picked' : ''}">
        <input
          type=${multiple ? 'checkbox' : 'radio'}
          name="ask_${this._questionId}_${idx}"
          .checked=${picked}
          @change=${() => isCustom ? this._toggleCustom(q) : this._toggleOption(label, q)}
          ?disabled=${this._submitted}
        />
        <span class="opt-main">
          <span class="opt-label">${label}</span>
          ${isCustom
            // 自定义选项:勾选展开输入框;未勾选但有文本 → 显示已输入内容
            ? (picked
                ? html`<textarea
                    class="custom-input"
                    .value=${customText}
                    @input=${this._onCustomInput}
                    placeholder="输入你的答案..."
                    ?disabled=${this._submitted}
                    rows="2"
                  ></textarea>`
                : (customText ? html`<span class="opt-desc">${customText}</span>` : '')
              )
            : (desc ? html`<span class="opt-desc">${desc}</span>` : '')
          }
        </span>
      </label>
    `
  }

  render () {
    if (!this.data) return ''
    const qs = this._questions
    const q = this._current
    if (!q) return ''
    const idx = this._currentIdx
    const textOnly = this._isTextOnly(q)
    const allowCustom = this._allowCustom(q)
    const options = q.options || []
    return html`
      <div class="dock">
        ${keyed(idx, html`
        <div class="body">
          ${qs.length > 1 ? html`<div class="step">
            <span class="label">${idx + 1} / ${qs.length} 个问题</span>
            <span class="dots">
              ${qs.map((_, i) => html`<span class="dot ${i === idx ? 'active' : i < idx ? 'done' : ''}"></span>`)}
            </span>
          </div>` : ''}
          ${q.title ? html`<div class="q-title">${q.title}</div>` : ''}
          ${q.message ? html`<div class="q-message">${q.message}</div>` : ''}
          <div class="options">
            ${options.map(opt => this._renderOption(q, idx, opt.label, opt.description, false))}
            ${allowCustom ? this._renderOption(q, idx, '输入自己的答案', null, true) : ''}
          </div>
        </div>
        `)}
        <div class="footer">
          <button class="btn btn-primary" ?disabled=${!this._currentAnswered || this._submitted} @click=${() => this._advance()}>
            ${this._submitted ? '已提交' : this._actionLabel}
          </button>
        </div>
      </div>
    `
  }
}
customElements.define('ai-ask-card', AiAskCard)
