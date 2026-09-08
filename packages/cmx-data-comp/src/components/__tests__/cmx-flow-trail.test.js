// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { CmxFlowTrail, buildFlowTrailEvents } from '../cmx-flow-trail.js'

const nextFrame = () => new Promise((r) => requestAnimationFrame(r))

// 预置用户快照，跳过组件内部 /api/iam/users/list 兜底拉取（避免测试发网络请求）。
function seedUsers () {
  globalThis.__cmxFlowUsers = {
    7: { nickName: '张三', userName: 'zhangsan' },
    8: { nickName: '李四', userName: 'lisi' },
  }
}

const DEF = {
  nodes: [
    { id: 'start', kind: 'startEvent', name: '发起' },
    { id: 'apply', kind: 'userTask', name: '发起人确认' },
    { id: 'audit', kind: 'userTask', name: '主数据审批' },
  ],
  edges: [
    { from: 'start', to: 'apply' },
    { from: 'apply', to: 'audit' },
  ],
}

const COMMENTS = [
  /* 时间带 Z（模拟后端 UTC 真实形态，chrono to_rfc3339 恒带偏移）；本机 +8 显示 09:00/10:00 */
  { nodeBpmnId: 'apply', userId: 7, nickName: '张三', decision: 'submit', comment: '制单提交', createdAt: '2026-09-01T01:00:00Z' },
  { nodeBpmnId: 'audit', userId: 8, nickName: '李四', decision: 'return', comment: '资料退回', createdAt: '2026-09-01T02:00:00Z' },
]

// 退回场景：审批退回后流程回到 apply 等待发起人，audit 已办结过但要重走 → 待处理。
const ACTIVE_RETURNED = {
  state: 'ACTIVE',
  tokens: [{ nodeBpmnId: 'apply', state: 'ACTIVE' }],
  activeNodes: ['apply'],
  tasks: [
    { nodeBpmnId: 'audit', completed: true, assignee: 8 },
    { nodeBpmnId: 'apply', completed: false, assignee: 7 },
  ],
}

function mountTrail (data) {
  const el = new CmxFlowTrail()
  el.trail = data
  document.body.appendChild(el)
  return el
}

describe('cmx-flow-trail', () => {
  beforeEach(seedUsers)
  afterEach(() => { document.body.innerHTML = '' })

  it('注册为自定义元素', () => {
    expect(customElements.get('cmx-flow-trail')).toBe(CmxFlowTrail)
  })

  it('事件流：发起首条 + 意见事件 + 当前节点办理人 + 退回重走待处理', async () => {
    const el = mountTrail({ instance: ACTIVE_RETURNED, definition: DEF, comments: COMMENTS })
    await nextFrame()
    const root = el.shadowRoot
    const all = root.querySelectorAll('.node')
    expect(all.length).toBe(5)
    // 事件 3 条：发起 / 发起人确认·制单 / 主数据审批·退回
    const done = root.querySelectorAll('.node.done')
    expect(done.length).toBe(3)
    expect(done[0].querySelector('.title b').textContent).toBe('发起')
    const decs = Array.from(root.querySelectorAll('.dec')).map((x) => x.textContent)
    expect(decs).toEqual(['制单', '退回'])
    // 办理人经用户快照统一显示名（张三），当前节点 = 发起人确认
    const cur = root.querySelector('.node.current')
    expect(cur.querySelector('.title b').textContent).toBe('发起人确认')
    expect(cur.querySelector('.meta').textContent).toContain('张三')
    // 退回重走：audit 已办结但 active apply 可达 → 待处理
    const pend = root.querySelector('.node.pending')
    expect(pend.querySelector('.title b').textContent).toBe('主数据审批')
    expect(root.querySelector('.hint')).toBeNull()
  })

  it('TERMINATED 实例：仅历史事件 + 尾部终止提示，不补当前/待处理', async () => {
    const inst = { state: 'TERMINATED', tokens: [], activeNodes: [], tasks: ACTIVE_RETURNED.tasks }
    const el = mountTrail({ instance: inst, definition: DEF, comments: COMMENTS })
    await nextFrame()
    const root = el.shadowRoot
    expect(root.querySelectorAll('.node').length).toBe(3)
    expect(root.querySelector('.node.current')).toBeNull()
    expect(root.querySelector('.node.pending')).toBeNull()
    expect(root.querySelector('.hint').textContent).toContain('流程已终止')
  })

  it('空数据渲染占位文案', async () => {
    const el = mountTrail(null)
    await nextFrame()
    expect(el.shadowRoot.querySelector('.hint').textContent).toBe('暂无流转记录')
  })

  it('重绑 trail 重渲染且皮肤 class 保持', async () => {
    const el = mountTrail(null)
    await nextFrame()
    el.trail = { instance: ACTIVE_RETURNED, definition: DEF, comments: COMMENTS }
    await nextFrame()
    expect(el.shadowRoot.querySelectorAll('.node').length).toBe(5)
    expect(el.classList.contains('cmx-flow-trail-neo')).toBe(true)
  })

  it('neo 默认开启；tone 加变体 class；data-cmx-skin=none 回退关闭', async () => {
    const el = mountTrail(null)
    await nextFrame()
    expect(el.classList.contains('cmx-flow-trail-neo')).toBe(true)
    el.setAttribute('data-cmx-skin-tone', 'mint')
    await nextFrame()
    expect(el.classList.contains('cmx-flow-trail-neo--mint')).toBe(true)
    el.setAttribute('data-cmx-skin', 'none')
    await nextFrame()
    expect(el.classList.contains('cmx-flow-trail-neo')).toBe(false)
    expect(el.classList.contains('cmx-flow-trail-neo--mint')).toBe(false)
  })
})

describe('buildFlowTrailEvents（纯函数）', () => {
  beforeEach(seedUsers)

  it('事件按时间正序，发起取首条意见的人与时刻', () => {
    const { events, terminated } = buildFlowTrailEvents({ instance: ACTIVE_RETURNED, definition: DEF, comments: COMMENTS })
    expect(terminated).toBe(false)
    expect(events.map((e) => e.type)).toEqual(['event', 'event', 'event', 'current', 'pending'])
    expect(events[0]).toMatchObject({ title: '发起', actor: '张三', time: '2026-09-01 09:00' })
    expect(events[1]).toMatchObject({ title: '发起人确认' })
    expect(events[1].action).toMatchObject({ key: 'submit', label: '制单' })
    expect(events[3]).toMatchObject({ type: 'current', title: '发起人确认', actors: ['张三'] })
    expect(events[4]).toMatchObject({ type: 'pending', title: '主数据审批' })
  })

  it('无定义节点轴时兜底任务观察节点（节点名取任务 name）', () => {
    const inst = {
      state: 'ACTIVE',
      tokens: [{ nodeBpmnId: 'apply', state: 'ACTIVE' }],
      activeNodes: ['apply'],
      tasks: [
        { nodeBpmnId: 'audit', name: '主数据审批', completed: true, assignee: 8 },
        { nodeBpmnId: 'apply', name: '发起人确认', completed: false, assignee: 7 },
      ],
    }
    const { events } = buildFlowTrailEvents({ instance: inst, definition: null, comments: COMMENTS })
    expect(events.some((e) => e.title === '发起人确认')).toBe(true)
    expect(events.some((e) => e.title === '主数据审批')).toBe(true)
  })

  it('意见缺 decision 时 apply/start 节点推断为制单', () => {
    const { events } = buildFlowTrailEvents({
      instance: ACTIVE_RETURNED,
      definition: DEF,
      comments: [{ nodeBpmnId: 'apply', userId: 7, nickName: '张三', comment: '', createdAt: '2026-09-01T01:00:00Z' }],
    })
    expect(events[1].action).toMatchObject({ key: 'submit', label: '制单' })
    expect(events[1].text).toBe('制单提交')
  })
})
