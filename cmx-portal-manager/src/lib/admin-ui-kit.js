/**
 * 管理页共享 UI 底座——六页统一风格真源。
 *
 * 覆盖：定义中心（dict/doc/base-dct/base-doc）、弹性组合、编码规则三家的公共视觉与操作范式：
 *   - 主题变量：选中/强调色统一锚定 neo 青（对齐激活映射配置页设计语言），四档 color-mix 派生
 *   - 按钮：adm-icon-btn 轻实底带边框（primary 青 / danger 红），配 ui5-icon 使用
 *   - 列表区壳：adm-search 搜索行 + adm-row 行范式（状态圆点 + 主/副标题 + 徽标 + 选中左边条）
 *     + cmx-pager 分页容器 + 带引导的空态 / 搜索无结果态
 *   - 分区卡片：adm-section（h3 圆点装饰）+ adm-kv 网格（88px 标签列）+ 字段级校验红框
 *   - 消息：adm-msg 内嵌状态行（ok 绿 / err 红 / warn 黄）
 *
 * 类名统一 adm- 前缀（命名空间隔离，避免与各家存量同名类互相覆盖）；
 * 各组件把本模块 CSS 拼进自身 <style> 尾部，HTML 侧逐步替换旧类。
 */

import { getStoredPortalUi5Theme, portalThemeInfo } from './portal-ui5-theme.js'
import { mainapp } from './mainapp.js'

/** 管理页列表分页大小（统一 10/页）。 */
export const ADM_PAGE_SIZE = 10

/** 动态 color-scheme：跟随门户 UI5 主题存储（dark/light）；无记录时回退混合值由系统偏好决定。 */
export function admColorScheme () {
  try {
    const stored = portalThemeInfo(getStoredPortalUi5Theme())
    if (stored) return stored.dark ? 'dark' : 'light'
  } catch { /* fallthrough */ }
  return 'light dark'
}

/** 动态 color-scheme 的 :host 覆盖片段（拼在 <style> 尾部，覆盖静态声明）。 */
export function admColorSchemeCss () {
  return `:host{color-scheme:${admColorScheme()}}`
}

/**
 * 取组件所属 tab 的入口 DAM（短名键 domain/application/module，值可空串）。
 * 沿 DOM（穿 shadow 边界）找 data-cmx-workspace-id 标记的 tab pane，
 * 经 mainapp.workspaces 取 context 读三键——列表筛选「默认选中当前模块」用。
 */
export function admEntryDam (el) {
  let node = el instanceof Element ? el : null
  while (node) {
    if (node instanceof HTMLElement) {
      const scopeId = node.dataset ? node.dataset.cmxWorkspaceId : ''
      const ws = scopeId && mainapp.workspaces ? mainapp.workspaces[scopeId] : null
      if (ws && ws.context) {
        const get = (k) => {
          try { return String(ws.context.get(k) || '') } catch { return '' }
        }
        return { domain: get('domain'), application: get('application'), module: get('module') }
      }
    }
    if (node.parentElement) { node = node.parentElement; continue }
    const root = typeof node.getRootNode === 'function' ? node.getRootNode() : null
    node = root && root.host ? root.host : null
  }
  return { domain: '', application: '', module: '' }
}

/** 主题变量 + 按钮体系（各家 :host 内变量锚定与按钮统一形态）。 */
export const ADM_THEME_CSS = `
  .adm-icon-btn{display:inline-flex;align-items:center;justify-content:center;height:26px;min-width:26px;padding:0 8px;
    border:1px solid var(--sapButton_BorderColor,#89919a);border-radius:5px;background:var(--sapButton_Background,#fff);
    color:var(--sapButton_TextColor,var(--sapTextColor,#1d2d3e));cursor:pointer;font:inherit;font-size:12px;line-height:1;
    transition:background-color .12s,border-color .12s,color .12s}
  .adm-icon-btn ui5-icon{width:15px;height:15px;pointer-events:none}
  .adm-icon-btn:hover{background:var(--sapButton_Hover_Background,rgba(0,0,0,.06))}
  .adm-icon-btn:focus-visible{outline:2px solid var(--cmx-selection-color,var(--neo-cyan,#00b4d8));outline-offset:1px}
  .adm-icon-btn[disabled]{opacity:.45;cursor:default;pointer-events:none}
  .adm-icon-btn.primary{background:var(--cmx-selection-color,var(--neo-cyan,#00b4d8));color: #fff;border-color:transparent;font-weight:600}
  .adm-icon-btn.primary ui5-icon{color:#fff} /* 品牌底上的图标恒白：ui5-icon 默认取 --sapContent_IconColor，亮色下是深色不协调 */
  .adm-icon-btn.primary:hover{filter:brightness(1.06)}
  .adm-icon-btn.danger{color:var(--sapNegativeColor,#bb0000);border-color:color-mix(in srgb,var(--sapNegativeColor,#bb0000) 45%,var(--sapButton_BorderColor,#89919a))}
  .adm-icon-btn.danger:hover{background:color-mix(in srgb,var(--sapNegativeColor,#bb0000) 10%,transparent)}
  .adm-icon-btn.ghost{background:transparent;border-color:transparent}
  .adm-icon-btn.ghost:hover{background:var(--sapButton_Hover_Background,rgba(0,0,0,.06))}
`

/** 列表区壳：头部 + 搜索行 + 行范式 + 空态 + 分页容器（依赖 ADM_THEME_CSS 的选中变量）。 */
export const ADM_LIST_CSS = `
  .adm-head{height:40px;display:flex;align-items:center;gap:6px;padding:0 10px;
    border-bottom:1px solid var(--sapGroup_TitleBorderColor,#d9d9d9);box-sizing:border-box;flex-shrink:0}
  .adm-head .adm-title{font-weight:700;font-size:13px;flex:1;min-width:0;
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .adm-search{flex:0 0 auto;padding:8px 10px 4px;display:flex;gap:6px;align-items:center}
  .adm-search input{flex:1 1 auto;min-width:0;box-sizing:border-box;padding:7px 10px;font-size:12px;
    border:1px solid var(--sapField_BorderColor,#89919a);border-radius:4px;
    background:var(--sapField_Background,#fff);color:var(--sapTextColor,#1d2d3e)}
  .adm-search input:focus{outline:none;border-color:var(--cmx-selection-color,var(--neo-cyan,#00b4d8))}
  .adm-rows{flex:1 1 auto;min-height:0;overflow-y:auto;display:flex;flex-direction:column;padding:4px 6px;gap:2px}
  .adm-row{display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:5px;cursor:pointer;
    border:1px solid transparent;border-left:3px solid transparent;position:relative;
    font:inherit;text-align:left;width:100%;background:transparent;color:inherit}
  .adm-row:hover{background:var(--sapList_Hover_Background,rgba(0,0,0,.045))}
  .adm-row.is-current{border-color:var(--cmx-selection-border,rgba(0,180,216,.54));
    border-left-color:var(--cmx-selection-color,var(--neo-cyan,#00b4d8));
    background:var(--cmx-selection-bg-soft,rgba(0,180,216,.08))}
  .adm-row .adm-dot{flex:none;width:8px;height:8px;border-radius:50%;background:var(--adm-dot-color,var(--neo-green,#2e7d32))}
  .adm-row .adm-dot.off{background:var(--sapContent_LabelColor,#6a6d70);opacity:.55}
  .adm-row .adm-main{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:1px}
  .adm-row .adm-name{font-size:13px;font-weight:600;color:inherit;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .adm-row.is-current .adm-name{color:var(--cmx-selection-text,inherit)}
  .adm-row .adm-sub{font-size:11px;color:var(--sapContent_LabelColor,#6a6d70);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .adm-row .adm-badge{flex:none;font-size:10px;font-weight:700;line-height:16px;padding:0 7px;border-radius:9px;white-space:nowrap;
    background:color-mix(in srgb,var(--cmx-selection-color,var(--neo-cyan,#00b4d8)) 14%,transparent);
    color:var(--cmx-selection-color,var(--neo-cyan,#00b4d8))}
  .adm-empty{padding:18px 12px;text-align:center;color:var(--sapContent_LabelColor,#6a6d70);font-size:12px;line-height:1.7}
  .adm-empty .adm-empty-hint{font-size:11px;opacity:.85}
  .adm-pager{flex:0 0 auto;padding:4px 8px;border-top:1px solid var(--sapGroup_TitleBorderColor,#d9d9d9)}
`

/** 分区卡片 + 表单网格 + 字段级校验（inspector / 属性表单通用）。 */
export const ADM_SECTION_CSS = `
  .adm-section{border:1px solid var(--sapGroup_TitleBorderColor,#d9d9d9);border-radius:6px;margin-bottom:8px;
    background:var(--sapGroup_ContentBackground,rgba(250,250,250,.6));overflow:hidden}
  .adm-section>h3{margin:0;padding:8px 12px;font-size:12px;font-weight:700;color:var(--sapTextColor,#1d2d3e);
    background:color-mix(in srgb,var(--cmx-selection-color,var(--neo-cyan,#00b4d8)) 6%,transparent);
    border-bottom:1px solid var(--sapGroup_TitleBorderColor,#d9d9d9);display:flex;align-items:center;gap:7px}
  .adm-section>h3::before{content:'';width:6px;height:6px;border-radius:50%;flex:none;
    background:var(--cmx-selection-color,var(--neo-cyan,#00b4d8))}
  .adm-section .adm-section-body{padding:10px 12px}
  .adm-kv{display:grid;grid-template-columns:88px minmax(0,1fr);gap:6px 8px;font-size:12px;align-items:center}
  .adm-kv label{color:var(--sapContent_LabelColor,#6a6d70)}
  .adm-kv input,.adm-kv select,.adm-kv textarea{width:100%;box-sizing:border-box;
    border:1px solid var(--sapField_BorderColor,#89919a);border-radius:4px;padding:5px 8px;font:inherit;font-size:12px;
    background:var(--sapField_Background,#fff);color:var(--sapTextColor,#1d2d3e)}
  .adm-kv textarea{resize:vertical;min-height:44px}
  .adm-kv input:focus,.adm-kv select:focus,.adm-kv textarea:focus{outline:none;border-color:var(--cmx-selection-color,var(--neo-cyan,#00b4d8))}
  .adm-kv .is-invalid{border-color:var(--sapNegativeColor,#bb0000);box-shadow:0 0 0 1px color-mix(in srgb,var(--sapNegativeColor,#bb0000) 35%,transparent)}
  .adm-kv .adm-kv-err{grid-column:2;font-size:11px;color:var(--sapNegativeColor,#bb0000)}
  .adm-kv-check{display:flex;align-items:center;gap:6px;font-size:12px;grid-column:1 / -1;cursor:pointer}
  .adm-kv-check input{width:auto}
`

/** 内嵌消息行（操作结果反馈；严重错误仍走 notify 对话框）。 */
export const ADM_MSG_CSS = `
  .adm-msg{flex-basis:100%;margin:0;padding:6px 10px;border-radius:5px;font-size:12px;line-height:1.5;
    border:1px solid transparent;display:flex;align-items:center;gap:6px}
  .adm-msg:empty{display:none}
  .adm-msg.ok{color:var(--sapPositiveColor,#107e3e);background:color-mix(in srgb,var(--sapPositiveColor,#107e3e) 8%,transparent);
    border-color:color-mix(in srgb,var(--sapPositiveColor,#107e3e) 30%,transparent)}
  .adm-msg.err{color:var(--sapNegativeColor,#bb0000);background:color-mix(in srgb,var(--sapNegativeColor,#bb0000) 8%,transparent);
    border-color:color-mix(in srgb,var(--sapNegativeColor,#bb0000) 30%,transparent)}
  .adm-msg.warn{color:var(--sapCriticalColor,#e9730c);background:color-mix(in srgb,var(--sapCriticalColor,#e9730c) 8%,transparent);
    border-color:color-mix(in srgb,var(--sapCriticalColor,#e9730c) 30%,transparent)}
  .adm-msg .adm-msg-close{margin-left:auto;flex:none;border:0;background:transparent;color:inherit;cursor:pointer;
    font:inherit;font-size:11px;line-height:1;padding:2px 4px;border-radius:3px;opacity:.7}
  .adm-msg .adm-msg-close:hover{opacity:1;background:color-mix(in srgb,currentColor 12%,transparent)}
  .adm-confirm-body{padding:14px 16px;font-size:13px;line-height:1.7;color:var(--sapTextColor,#1d2d3e);
    font-family:var(--sapFontFamily,Arial,sans-serif);white-space:pre-wrap;word-break:break-all}
`

/** 全量拼接（变量 + 全部样式块）。 */
export const ADM_ALL_CSS = ADM_THEME_CSS + ADM_LIST_CSS + ADM_SECTION_CSS + ADM_MSG_CSS

/** 计数标题：`字典（3/12）`——过滤数/总数，无过滤时两者相等。 */
export function admCountTitle (label, filtered, total) {
  const f = Number.isFinite(filtered) ? filtered : 0
  const t = Number.isFinite(total) ? total : f
  return `${label}（${f}/${t}）`
}

/**
 * 列表空态 HTML。三种形态：
 *   - 无任何条目：引导文案（带新建按钮提示）
 *   - 有关键字无命中：搜索无结果态
 *   - 传入 icon 时标题前加 ui5-icon（可选）
 * @param {{ total:number, keyword?:string, itemLabel?:string, actionLabel?:string, icon?:string }} p
 */
export function admEmptyHtml (p) {
  const label = p.itemLabel || '条目'
  const action = p.actionLabel || '新建'
  if (p.keyword && p.keyword.trim()) {
    return `<div class="adm-empty">无匹配「${escapeText(p.keyword.trim())}」的${label}<div class="adm-empty-hint">调整关键词或清空搜索框</div></div>`
  }
  if (!p.total) {
    return `<div class="adm-empty">暂无${label}<div class="adm-empty-hint">点击「${escapeText(action)}」开始创建</div></div>`
  }
  return ''
}

/** 轻量转义（空态文案用；组件内已有 escHtml 的可直接传转义后的串）。 */
function escapeText (s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c))
}

/**
 * 统一确认对话框（替代 window.confirm）：基于 cmx-floating-dialog，Promise 风格。
 * message 经 textContent 注入（无注入面）；danger=true 时确认按钮文案默认「删除」。
 * @param {{ title:string, message:string, confirmText?:string, cancelText?:string, danger?:boolean, icon?:string }} p
 * @returns {Promise<boolean>} true=确认 false=取消
 */
export function admConfirm (p) {
  return new Promise((resolve) => {
    let settled = false
    const done = (ok) => { if (!settled) { settled = true; resolve(ok) } }
    const dlg = document.createElement('cmx-floating-dialog')
    dlg.configure({
      title: p.title || '确认操作',
      icon: p.icon || (p.danger ? 'delete' : 'question-mark'),
      showConfirm: true,
      showCancel: true,
      confirmText: p.confirmText || (p.danger ? '删除' : '确认'),
      cancelText: p.cancelText || '取消',
      dialogWidth: '420px',
      dialogHeight: '190px',
      beforeClose: ({ action }) => { done(action === 'confirm'); return true },
    })
    const body = document.createElement('div')
    body.className = 'adm-confirm-body'
    body.textContent = p.message || ''
    dlg.setContent(body)
    document.body.appendChild(dlg)
    void dlg.openModal().then(() => { done(false); dlg.remove() }).catch(() => { done(false); dlg.remove() })
  })
}
