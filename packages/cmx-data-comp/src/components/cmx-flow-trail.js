/**
 * <cmx-flow-trail> — 流程审批轨迹（事件流口径）
 *
 * 20260903 上收：原为 native 页内联三副本（mdm/cr-form、flow/task-form、flow/todo-center，
 * 沿革见 documents/plans/20260902_流程_审批入口与轨迹统一方案.md §十），现归库全局注册一次，
 * 页面只写标签 + 绑定数据。
 *
 * 事件流口径（钉钉/飞书「审批记录」同款）：一条意见一条事件按时间正序铺开，退回重走同节点
 * 出现多次；「发起」为人造首条（发起人 + 发起时刻取首条意见）；尾部补当前等待节点与待处理
 * 节点；TERMINATED 实例尾部留终止提示。纯呈现组件，不负责取实例数据——使用方组装后绑定：
 *
 *   el.trail = { instance, definition, comments }
 *   // instance：流程实例全量（POST /api/flow/instances/detail，含 tokens/tasks/activeNodes/state）
 *   // definition：流程定义（POST /api/flow/design/definitions 的单条，含 nodes/edges 节点轴）
 *   // comments：意见数组（flow-history 或实例意见接口，含 userId/nickName/decision/
 *   //   nodeBpmnId/comment/createdAt）
 *
 * 办理人显示名经 globalThis.__cmxFlowUsers 用户快照解析（与 flow 页面 loadUserSnapshots
 * 共用缓存口径，已填充则直接复用）；快照为空时组件内部自动拉 /api/iam/users/list 兜底，
 * 拉失败回退显示原始 id。
 *
 * @component cmx-flow-trail
 * @attr {string} data-cmx-skin - 皮肤：neo（默认）| plain/none（回退 UI5 基础样式）
 * @attr {string} data-cmx-skin-tone - neo 色调：cyan（默认）| mint | violet | azure
 * @attr {string} data-cmx-style-id - 页面级样式覆盖（同页 <template>/<style> 节点 id）
 */
import '@ui5/webcomponents/dist/Icon.js'
import { applyPageStyleId } from '../lib/cmx-skin-runtime.js'
import { escHtml, apiPost } from '../lib/cmx-page-helpers.js'
import { cmxDatetime } from 'cmx-shared/datetime'

const FT_NODE_KINDS = new Set(['startEvent', 'userTask', 'serviceTask', 'businessRuleTask', 'callActivity', 'subProcess'])
const FT_KIND_LABELS = { startEvent: '发起', serviceTask: '自动', businessRuleTask: '规则', callActivity: '子流程', subProcess: '子流程' }
const FT_ACTION_LABELS = { approve: '同意', reject: '驳回', return: '退回', submit: '制单', complete: '办结', transfer: '转签', withdraw: '取回', cancel: '撤销' }
const FT_TONE_CLASSES = ['cmx-flow-trail-neo--mint', 'cmx-flow-trail-neo--violet', 'cmx-flow-trail-neo--cyan', 'cmx-flow-trail-neo--azure']

function ftTime (iso) {
  // 时间显示统一走 cmx-shared/datetime 转当前时区；解析失败诚实显示原文，不再截取伪装本地时间
  if (!iso) return ''
  return cmxDatetime.fmtMinute(iso) || String(iso)
}

function ftUserName (id) {
  const u = globalThis.__cmxFlowUsers && globalThis.__cmxFlowUsers[String(id)]
  return (u && (u.nickName || u.userName)) || String(id)
}

function ftActor (row) {
  // 优先按 userId 查用户快照统一显示名：意见记录里的 nickName 是写入时的昵称快照，
  // 同一用户改过昵称后新旧意见会显示成两个名字，看起来像两个人的重复操作。
  const uid = row?.userId ?? row?.user_id
  if (uid != null && String(uid) && globalThis.__cmxFlowUsers && globalThis.__cmxFlowUsers[String(uid)]) {
    return ftUserName(uid)
  }
  return row?.nickName || row?.userName || row?.nickname || row?.username || String(uid ?? '') || row?.assignee || '—'
}

// 用户快照兜底拉取：快照已有则不拉；失败返回 false 由调用方回退显示原始 id。
// 模块级去重并发（多实例同时绑数据只发一次请求），失败后清空允许下次重试。
async function ftFetchUsers () {
  const rows = await apiPost('/api/iam/users/list', { pageSize: 200 })
  const map = {}
  for (const u of (Array.isArray(rows) ? rows : (rows && rows.items) || [])) {
    const id = String((u && (u.id ?? u.userId ?? u.user_id)) ?? '')
    if (id) map[id] = { nickName: (u && (u.nickName || u.nickname)) || '', userName: (u && (u.userName || u.username)) || '' }
  }
  globalThis.__cmxFlowUsers = map
  return true
}

let ftUsersReq = null
function ftEnsureUsers () {
  if (globalThis.__cmxFlowUsers && Object.keys(globalThis.__cmxFlowUsers).length) return Promise.resolve(false)
  if (!ftUsersReq) {
    ftUsersReq = ftFetchUsers().catch(() => false).finally(() => { ftUsersReq = null })
  }
  return ftUsersReq
}

function ftAction (row) {
  const raw = String(row?.decision ?? '').trim()
  const key = raw.toLowerCase()
  if (key && FT_ACTION_LABELS[key]) return { key, label: FT_ACTION_LABELS[key], tone: key === 'reject' ? 'rej' : (key === 'return' || key === 'withdraw' ? 'warn' : 'ok') }
  if (key) return { key, label: raw, tone: 'ok' }
  const isCreation = key === '' && (String(row?.nodeBpmnId || '') === 'apply' || String(row?.nodeBpmnId || '') === 'start')
  return isCreation ? { key: 'submit', label: '制单', tone: 'ok' } : { key: 'complete', label: '办理', tone: 'ok' }
}

function ftComment (row) {
  const action = ftAction(row)
  const text = String(row?.comment ?? '').trim()
  return {
    nodeId: String(row?.nodeBpmnId || ''),
    actor: ftActor(row),
    action,
    text: text || (action.key === 'submit' ? '制单提交' : '（未填写意见）'),
    time: ftTime(row?.createdAt),
    createdAt: row?.createdAt || '',
  }
}

// 事件流轨迹构建（钉钉/飞书「审批记录」同口径）：时间正序铺开每次实际发生的事件
// （一条意见 = 一条），退回重走同一节点出现多次；「发起」为人造首条。尾部补节点轴
// 当前态：当前等待节点（未办任务办理人）→ 待重走/未到达节点（待处理）；TERMINATED
// 实例尾部不补节点、由时间线末尾终止提示交代。
export function buildFlowTrailEvents ({ instance, definition, comments }) {
  const inst = instance || {}
  const activeIds = new Set([
    ...((inst.tokens || []).filter((x) => String(x?.state || '') !== 'ENDED').map((x) => String(x.nodeBpmnId || ''))),
    ...((inst.activeNodes || []).map((x) => String(x || ''))),
  ].filter(Boolean))
  const tasks = inst.tasks || []
  const completedIds = new Set(tasks.filter((x) => x.completed).map((x) => String(x.nodeBpmnId || '')).filter(Boolean))
  const observedIds = new Set([...activeIds, ...completedIds])

  // 节点轴（取名称/种类/后续待处理判定用）：定义优先，兜底任务观察到的节点。
  let nodes = []
  if (Array.isArray(definition?.nodes) && definition.nodes.length) {
    nodes = definition.nodes
      .filter((n) => FT_NODE_KINDS.has(String(n?.kind || '')) || observedIds.has(String(n?.id || '')))
      .map((n) => {
        const kind = String(n?.kind || '')
        return { id: String(n.id || ''), kind, name: n.name || (kind === 'startEvent' ? '发起' : '') || String(n.id || '') }
      })
  } else {
    const seen = new Set()
    nodes = tasks
      .map((x) => ({ id: String(x.nodeBpmnId || ''), name: x.name || x.nodeBpmnId, kind: 'userTask' }))
      .filter((n) => n.id && !seen.has(n.id) && seen.add(n.id))
  }
  for (const id of observedIds) {
    if (nodes.some((n) => n.id === id)) continue
    nodes.push({ id, name: tasks.find((x) => String(x.nodeBpmnId || '') === id)?.name || id, kind: 'userTask' })
  }
  const nameOf = (id) => { const n = nodes.find((x) => x.id === id); return (n && n.name) || id }

  const normalized = (comments || []).map((c) => ftComment(c)).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))

  // ① 已发生事件：发起（人造首条）→ 逐条意见正序铺开（含未知节点名的意见，名称兜底 nodeId）。
  const events = []
  const first = normalized[0] || null
  if (first) events.push({ type: 'event', title: '发起', action: null, actor: first.actor, time: first.time })
  for (const c of normalized) events.push({ type: 'event', title: nameOf(c.nodeId), action: c.action, actor: c.actor, time: c.time, text: c.text })

  // ② 尾部当前态（仅非终态实例）：当前等待节点 → 待重走/未到达节点（终局完成的不重复列）。
  const instanceTerminal = ['COMPLETED', 'TERMINATED'].includes(String(inst.state || ''))
  if (!instanceTerminal) {
    const adj = new Map()
    for (const e of (Array.isArray(definition?.edges) ? definition.edges : [])) {
      const from = String(e?.from || ''); const to = String(e?.to || '')
      if (!from || !to) continue
      if (!adj.has(from)) adj.set(from, [])
      adj.get(from).push(to)
    }
    const reachCache = new Map()
    const reachFrom = (start) => {
      if (!reachCache.has(start)) {
        const seen = new Set(); const queue = (adj.get(start) || []).slice()
        while (queue.length) {
          const cur = queue.pop()
          if (seen.has(cur)) continue
          seen.add(cur)
          for (const nx of (adj.get(cur) || [])) queue.push(nx)
        }
        reachCache.set(start, seen)
      }
      return reachCache.get(start)
    }
    // 活跃节点可达它 = 它被退回、还要重走。
    const willRevisit = (id) => nodes.some((n) => n.id !== id && activeIds.has(n.id) && reachFrom(n.id).has(id))
    for (const n of nodes) {
      if (n.kind === 'startEvent') continue
      if (activeIds.has(n.id)) {
        const actors = Array.from(new Set(tasks.filter((x) => String(x.nodeBpmnId || '') === n.id && !x.completed)
          .map((x) => ftUserName(x.assignee || x.ownerUserId)).filter(Boolean)))
        events.push({ type: 'current', title: n.name, actors, kindLabel: FT_KIND_LABELS[n.kind] || '' })
      } else if (!(completedIds.has(n.id) && !willRevisit(n.id))) {
        // 未到过、或办结过但被退回将重走 → 待处理（已出过事件的节点也再列一行表示将来还要走）。
        events.push({ type: 'pending', title: n.name, kindLabel: FT_KIND_LABELS[n.kind] || '' })
      }
    }
  }
  return { events, terminated: String(inst.state || '') === 'TERMINATED' }
}

export class CmxFlowTrail extends HTMLElement {
  static get observedAttributes () {
    return ['data-cmx-skin', 'data-cmx-skin-tone', 'data-cmx-style-id']
  }

  constructor () {
    super()
    this._data = null
    this._usersKick = null
  }

  /** @type {{instance:object, definition:object, comments:Array}|null} 轨迹数据（见文件头） */
  set trail (data) {
    this._data = data
    this._ensureUsers()
    if (this.isConnected) this._render()
  }

  get trail () { return this._data }

  connectedCallback () {
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' })
    this._render()
    this._ensureUsers()
  }

  attributeChangedCallback (name) {
    if (!this.shadowRoot) return
    if (name === 'data-cmx-skin' || name === 'data-cmx-skin-tone') this._applySkin()
    if (name === 'data-cmx-style-id') applyPageStyleId(this, this.shadowRoot, 'cmx-flow-trail')
  }

  // 用户快照兜底：快照已由页面 loadUserSnapshots 填充时零请求；否则拉一次并重渲染
  //（首帧可能短暂显示原始 id，快照到位后自动换成显示名）。
  _ensureUsers () {
    if (this._usersKick) return
    this._usersKick = ftEnsureUsers()
      .then((fetched) => { if (fetched && this.isConnected) this._render() })
      .catch(() => {})
      .finally(() => { this._usersKick = null })
  }

  _render () {
    const root = this.shadowRoot
    if (!root) return
    const d = this._data || {}
    const built = buildFlowTrailEvents({ instance: d.instance || {}, definition: d.definition, comments: d.comments || [] })
    root.innerHTML = `<style>${this.css()}</style>${this.html(built)}`
    this._applySkin()
  }

  /** Neo 皮肤（A 写法）：默认/显式 neo 加 class，强调色走 --neo-cyan（随 tone 切换）；plain/none 移除即回退 UI5 基础样式。 */
  _applySkin () {
    const raw = (this.getAttribute('data-cmx-skin') || '').trim().toLowerCase()
    const skin = raw || String(globalThis.__cmxDefaultFlowTrailSkin || 'neo').trim().toLowerCase()
    if (skin === 'plain' || skin === 'none') {
      this.classList.remove('cmx-flow-trail-neo', ...FT_TONE_CLASSES)
    } else {
      this.classList.add('cmx-flow-trail-neo')
      this.classList.remove(...FT_TONE_CLASSES)
      const tone = (this.getAttribute('data-cmx-skin-tone') || '').trim().toLowerCase()
      if (tone && tone !== 'default' && tone !== 'cyan') this.classList.add('cmx-flow-trail-neo--' + tone)
    }
    applyPageStyleId(this, this.shadowRoot, 'cmx-flow-trail')
  }

  // 事件流视图：时间正序铺开每次事件（节点名+动作徽标+办理人+时间+意见），
  // 尾部补当前等待节点与待处理节点；不渲染头部/摘要（宿主页面已有单据号与状态）。
  html (built) {
    const row = (e, i) => {
      const num = `<span class="step">${String(i + 1)}</span>`
      if (e.type === 'event') {
        return `<li class="node done"><div class="rail"><span class="step"><ui5-icon name="accept"></ui5-icon></span></div>
          <div class="body">
            <div class="title"><b>${escHtml(e.title)}</b>${e.action ? `<span class="dec ${e.action.tone}">${escHtml(e.action.label)}</span>` : ''}</div>
            <div class="meta">${e.actor ? `<span>${escHtml(e.actor)}</span>` : ''}${e.time ? `<span>${escHtml(e.time)}</span>` : ''}</div>
            ${e.text && e.text !== '（未填写意见）' ? `<div class="cmt"><div class="cmt-bd">${escHtml(e.text)}</div></div>` : ''}
          </div></li>`
      }
      if (e.type === 'current') {
        return `<li class="node current"><div class="rail">${num}</div>
          <div class="body">
            <div class="title"><b>${escHtml(e.title)}</b>${e.kindLabel ? `<span class="kind">${escHtml(e.kindLabel)}</span>` : ''}<span class="st">当前</span></div>
            ${(e.actors && e.actors.length) ? `<div class="meta"><span class="actors">办理人：${e.actors.map((x) => escHtml(x)).join('、')}</span></div>` : ''}
          </div></li>`
      }
      return `<li class="node pending"><div class="rail">${num}</div>
        <div class="body"><div class="title"><b>${escHtml(e.title)}</b>${e.kindLabel ? `<span class="kind">${escHtml(e.kindLabel)}</span>` : ''}<span class="st">待处理</span></div></div></li>`
    }
    const rows = built.events.map(row).join('')
    const termHint = built.terminated ? '<div class="hint">流程已终止，后续节点未执行</div>' : ''
    return built.events.length ? `<ol class="flow">${rows}</ol>${termHint}` : '<div class="hint">暂无流转记录</div>'
  }

  css () {
    return `
    :host { display:block; --t-brand: var(--sapButton_Emphasized_Background, var(--sapBrandColor, #0070f2));
      --t-brand-text: var(--sapButton_Emphasized_TextColor, var(--sapContent_ContrastTextColor, var(--sapBaseColor, #fff)));
      --t-ok: var(--sapSuccessColor, #107e3e); --t-warn: var(--sapWarningColor, #e9730c);
      --t-neg: var(--sapNegativeColor, #bb0000);
      --t-ink: var(--sapTextColor, var(--sapTitleColor, #32363a)); --t-muted: var(--sapContent_LabelColor, #6a6d70);
      --t-line: var(--sapList_BorderColor, #d8d8d8); --t-tile: var(--sapBaseColor, #ffffff); }
    :host([data-cmx-skin-tone="mint"]) { --neo-cyan: var(--neo-mint, #10b981); }
    :host([data-cmx-skin-tone="violet"]) { --neo-cyan: var(--neo-violet, #7c3aed); }
    :host([data-cmx-skin-tone="azure"]) { --neo-cyan: #0a6ed1; }
    :host(.cmx-flow-trail-neo) { --t-brand: var(--neo-cyan, #00b4d8); }
    :host(.cmx-flow-trail-neo) .node.current .step {
      box-shadow: 0 0 12px color-mix(in srgb, var(--t-brand) 32%, transparent); }
    .flow { list-style:none; margin:0; padding:0; }
    .node { display:grid; grid-template-columns:32px minmax(0,1fr); gap:0 10px; padding-bottom:14px; }
    .rail { position:relative; display:flex; justify-content:center; }
    .step { width:26px; height:26px; display:grid; place-items:center; border-radius:50%; border:1px solid var(--t-line);
      background:var(--t-tile); color:var(--t-muted); font-size:11.5px; font-weight:700;
      font-family: ui-monospace, var(--sapFontFamily, system-ui), monospace; }
    .step ui5-icon { width:.85rem; height:.85rem; }
    .node:not(:last-of-type) .rail::after { content:""; position:absolute; top:30px; bottom:0; width:2px;
      background:color-mix(in srgb, var(--t-muted) 32%, transparent); }
    .node.done:not(:last-of-type) .rail::after { background:color-mix(in srgb, var(--t-ok) 58%, transparent); }
    .node.done .step { color:var(--t-ok); border-color:color-mix(in srgb, var(--t-ok) 48%, var(--t-line)); }
    .node.current .step { color:var(--t-brand-text); border-color:var(--t-brand); background:var(--t-brand); }
    .node.pending .step { background:color-mix(in srgb, var(--t-muted) 4%, var(--t-tile)); }
    .body { min-width:0; padding-top:3px; }
    .title { display:flex; align-items:baseline; gap:8px; min-width:0; }
    .title b { flex:1 1 auto; min-width:0; font-size:13px; font-weight:600; color:var(--t-ink); overflow-wrap:anywhere; }
    .node.pending .title b { color:var(--t-muted); }
    .node.current .title b { color:var(--t-brand); font-weight:700; }
    .st { flex:none; font-size:10.5px; font-weight:600; color:var(--t-muted); white-space:nowrap; }
    .node.done .st { color:var(--t-ok); }
    .node.current .st { color:var(--t-brand); }
    .kind { flex:none; align-self:center; font-size:10px; font-weight:600; color:var(--t-muted);
      border:1px solid color-mix(in srgb, var(--t-muted) 45%, transparent); border-radius:999px; padding:1px 7px; white-space:nowrap; }
    .meta { display:flex; flex-wrap:wrap; align-items:center; gap:4px 8px; margin-top:3px; font-size:10.5px; color:var(--t-muted); }
    .actors { overflow-wrap:anywhere; }
    .cmt { margin-top:6px; padding:6px 9px; border-radius:7px; background:color-mix(in srgb, var(--t-muted) 6%, var(--t-tile));
      border:1px solid color-mix(in srgb, var(--t-muted) 10%, transparent); }
    .dec { flex:none; font-size:10.5px; font-weight:700; }
    .dec.ok { color:var(--t-ok); } .dec.warn { color:var(--t-warn); } .dec.rej { color:var(--t-neg); }
    .cmt-bd { font-size:11.5px; color:var(--t-ink); white-space:pre-wrap; word-break:break-word; }
    .hint { font-size:12px; color:var(--t-muted); padding:6px 0; }
    `
  }
}

if (!customElements.get('cmx-flow-trail')) customElements.define('cmx-flow-trail', CmxFlowTrail)
