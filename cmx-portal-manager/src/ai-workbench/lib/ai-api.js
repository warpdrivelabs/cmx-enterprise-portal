/**
 * cmx-ai REST 客户端 —— 对接后端 7 个 AI 接口。
 *
 * 接口清单（经 http://127.0.0.1:8080/api-docs/openapi.json 核实）：
 *   POST   /api/ai/sessions                  创建会话
 *   DELETE /api/ai/sessions/{sid}            删除会话
 *   POST   /api/ai/sessions/{sid}/messages   异步发送消息（结果走 SSE）
 *   POST   /api/ai/sessions/{sid}/abort      中止当前生成
 *   POST   /api/ai/sessions/{sid}/answer     回答 AI 询问（转发 question/reply）
 *   POST   /api/ai/sessions/{sid}/approval   审批决策（转发 permission/reply）
 *   GET    /api/ai/events?session_id=&access_token=  SSE 事件流（见 sse-client.js）
 *
 * 所有方法走 apiFetch（自动拆 {code,msg,data} 信封 + Bearer 注入 + 401 跳转）。
 */

// 复用 Portal 统一 API 客户端（同源信封拆解 + Bearer 注入 + 401 跳登录），避免双拦截器。
import { apiPost, apiDelete } from 'cmx-ui5-runtime/api-client'

const AI_BASE = '/api/ai'

/**
 * 创建新会话。
 * @param {string} [title] 会话标题（可选，一期 OpenCode 自动生成）
 * @returns {Promise<{sessionId: string, title?: string|null, createdAt?: number|null}>}
 */
export function createSession (title) {
  return apiPost(`${AI_BASE}/sessions`, title ? { title } : {})
}

/**
 * 异步发送消息，触发 AI 生成（结果经 SSE 推送）。
 * @param {string} sid 会话 id（ses_*）
 * @param {string} text 用户输入文本
 * @returns {Promise<any>} 202 已接受；抛错时 err.status 可能为 409（已有活跃流）或 503（AI 未就绪）
 */
export function sendMessage (sid, text) {
  return apiPost(`${AI_BASE}/sessions/${encodeURIComponent(sid)}/messages`, {
    parts: [{ type: 'text', text }],
  })
}

/**
 * 回答 AI 询问（对应 ask_user 事件）。
 * @param {string} sid 会话 id
 * @param {string} questionId 询问 id（que_*，来自 ask_user 事件）
 * @param {string[][]} answers 二维数组：按问题顺序，每问一个被选 label 数组。单选时内层也只有一个元素。
 */
export function answerQuestion (sid, questionId, answers) {
  return apiPost(`${AI_BASE}/sessions/${encodeURIComponent(sid)}/answer`, {
    question_id: questionId,
    answers,
  })
}

/**
 * 审批决策（对应 require_approval 事件）。
 * @param {string} sid 会话 id
 * @param {string} approvalId 审批 id（per_*，来自 require_approval 事件）
 * @param {'approve'|'reject'} decision 决策
 * @param {string} [comment] 备注（可选）
 */
export function approveDecision (sid, approvalId, decision, comment) {
  return apiPost(`${AI_BASE}/sessions/${encodeURIComponent(sid)}/approval`, {
    approval_id: approvalId,
    decision,
    comment: comment || null,
  })
}

/** 中止当前生成。 */
export function abortSession (sid) {
  return apiPost(`${AI_BASE}/sessions/${encodeURIComponent(sid)}/abort`, {})
}

/**
 * 隐式上下文回传：前端收到 context_request SSE 后，自动收集当前页面信息并回传。
 * 后端收到后解除对应插件工具的挂起（oneshot channel 桥接），工具拿到页面信息继续执行。
 * @param {string} sid 会话 id
 * @param {string} requestId 请求 id（来自 context_request 事件）
 * @param {unknown} data 前端收集的当前页面信息（menuId/menuLabel/htmlPage 等）
 */
export function answerContextRequest (sid, requestId, data) {
  return apiPost(`${AI_BASE}/sessions/${encodeURIComponent(sid)}/context-response`, {
    request_id: requestId,
    data,
  })
}

/** 删除会话。 */
export function deleteSession (sid) {
  return apiDelete(`${AI_BASE}/sessions/${encodeURIComponent(sid)}`)
}
