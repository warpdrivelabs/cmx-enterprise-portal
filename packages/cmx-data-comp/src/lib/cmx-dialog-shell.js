/**
 * cmx-dialog-shell — 通用浮层对话框「纯视觉外壳」样式与模板。
 *
 * 样式取自 CMXPortalManager 的 dialog-worknode（portal-dialog-workspace-shell.js），
 * 抽到 cmx-data-comp 作为单一真源：保留 `.dlg-box / .dlg-bar / .dlg-region / .dlg-splitter /
 * [data-dlg-resize]` 等全部类名与视觉，确保两处外观一致。
 *
 * 本模块只负责「外壳」——标题栏、主体容器、底部按钮区、缩放手柄；
 * 具体内容（实时 DOM 或 html_pages）由使用方注入。
 */

export const DIALOG_SHELL_STYLES = `
:host {
  display: block;
  position: fixed;
  inset: 0;
  z-index: 900;
  background: rgba(0,0,0,0.45);
  animation: dlg-overlay-in 120ms ease;
  --dlg-border-color: var(--sapShell_BorderColor, #d9d9d9);
}
@keyframes dlg-overlay-in { from { opacity:0 } to { opacity:1 } }

.dlg-box {
  position: absolute;
  margin: 0;
  left: 0;
  top: 0;
  background: var(--sapBaseColor, #fff);
  border-radius: 4px;
  box-shadow: 0 12px 48px rgba(0,0,0,0.25);
  display: flex;
  flex-direction: column;
  width: var(--dlg-w, 85vw);
  height: var(--dlg-h, 80vh);
  min-width: 480px;
  min-height: 300px;
  max-width: calc(100vw - 8px);
  max-height: calc(100vh - 8px);
  overflow: hidden;
  animation: dlg-box-in 150ms cubic-bezier(0.25,0.46,0.45,0.94);
}

/* 边缘/角尺寸调整（根层 pointer-events:none，手柄单独开启） */
.dlg-resize-root {
  position: absolute;
  inset: 0;
  z-index: 25;
  pointer-events: none;
  border-radius: inherit;
}
[data-dlg-resize] {
  position: absolute;
  pointer-events: auto;
  box-sizing: border-box;
}
[data-dlg-resize="n"] { top: 0; left: 12px; right: 12px; height: 6px; cursor: ns-resize; }
[data-dlg-resize="s"] { bottom: 0; left: 12px; right: 12px; height: 8px; cursor: ns-resize; }
[data-dlg-resize="e"] { right: 0; top: 12px; bottom: 12px; width: 8px; cursor: ew-resize; }
[data-dlg-resize="w"] { left: 0; top: 12px; bottom: 12px; width: 8px; cursor: ew-resize; }
[data-dlg-resize="nw"] { top: 0; left: 0; width: 12px; height: 12px; cursor: nwse-resize; }
[data-dlg-resize="ne"] { top: 0; right: 0; width: 12px; height: 12px; cursor: nesw-resize; }
[data-dlg-resize="sw"] { bottom: 0; left: 0; width: 12px; height: 12px; cursor: nesw-resize; }
[data-dlg-resize="se"] { bottom: 0; right: 0; width: 12px; height: 12px; cursor: nwse-resize; }
[data-dlg-resize]:hover {
  background: color-mix(in srgb, var(--sapBrandColor,#0070f2) 18%, transparent);
}
@keyframes dlg-box-in { from { transform:scale(0.96) } to { transform:scale(1) } }

/* dock 抽屉模式：贴右/贴左滑入，高度撑满视口，固定宽度（覆盖居中定位与 min-width） */
.dlg-box[data-dock="right"] {
  left: auto !important; right: 0 !important; top: 0 !important;
  width: var(--dlg-w, 420px); min-width: 320px !important; max-width: 90vw;
  height: 100vh; max-height: 100vh; min-height: 0 !important;
  border-radius: 4px 0 0 0;
  animation: dlg-dock-right-in 220ms cubic-bezier(0.25,0.46,0.45,0.94);
  box-shadow: -12px 0 48px rgba(0,0,0,0.25);
}
.dlg-box[data-dock="left"] {
  left: 0 !important; right: auto !important; top: 0 !important;
  width: var(--dlg-w, 420px); min-width: 320px !important; max-width: 90vw;
  height: 100vh; max-height: 100vh; min-height: 0 !important;
  border-radius: 0 4px 0 0;
  animation: dlg-dock-left-in 220ms cubic-bezier(0.25,0.46,0.45,0.94);
  box-shadow: 12px 0 48px rgba(0,0,0,0.25);
}
@keyframes dlg-dock-right-in { from { transform: translateX(100%) } to { transform: translateX(0) } }
@keyframes dlg-dock-left-in  { from { transform: translateX(-100%) } to { transform: translateX(0) } }

/* 标题栏拖拽（右侧按钮区不触发移动） */
#dlg-bar {
  cursor: move;
  flex-shrink: 0;
  user-select: none;
  -webkit-user-select: none;
}
#dlg-bar-end {
  cursor: default;
  user-select: none;
  -webkit-user-select: none;
}
#dlg-bar-end ui5-button { cursor: pointer; }

/* ── Bar ── */
.dlg-bar-start {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  overflow: hidden;
}
.dlg-bar-icon { width:16px; height:16px; flex-shrink:0; color:var(--sapContent_IconColor,#0070f2); }
.dlg-bar-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--sapGroup_TitleTextColor, #32363a);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dlg-bar-desc {
  font-size: 12px;
  color: var(--sapContent_LabelColor, #6a6d70);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dlg-bar-end { display: inline-flex; align-items: center; gap: 4px; }

/* ── Body（容器，使用方注入内容） ── */
.dlg-body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: row;
  overflow: hidden;
  background: var(--sapGroup_ContentBackground, #fafafa);
  /* 锚定锚点：内容区内的 position:absolute 以内容区为包含块（不再是整个 dlg-box，
     避免使用方全区域铺内容时连标题栏一起盖住） */
  position: relative;
}

/* setContent 标准内容容器：提供伸展链 + 默认 padding（契约下沉，使用方零布局负担）。
   背景透明——露出 #dlg-body 既有底色，保持视觉零 diff */
.dlg-content {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: var(--dlg-content-padding, 14px 16px);
  box-sizing: border-box;
}
/* 全出血（setContent(el, { padding:false })）：grid 铺满等场景 */
.dlg-content[data-bleed="true"] { padding: 0; }

/* mask:false 非模态（对齐 EP modal:false）：遮罩透明、不拦截点击，仅对话框本体可交互 */
:host([data-mask="false"]) { background: transparent; animation: none; pointer-events: none; }
:host([data-mask="false"]) .dlg-box { pointer-events: auto; }

/* fullscreen：四周均匀 4px 缝铺满视口 */
.dlg-box[data-fullscreen="true"] {
  left: 4px !important; top: 4px !important;
  width: calc(100vw - 8px); height: calc(100vh - 8px);
}

/* resizable:false 隐藏八方位缩放手柄 */
.dlg-box[data-no-resize="true"] .dlg-resize-root { display: none; }

/* draggable:false 标题栏恢复普通光标 */
.dlg-box[data-no-drag="true"] #dlg-bar { cursor: default; }

/* 空 footer 折叠：无按钮且 extra 未使用时不渲染空条 */
.dlg-footer[data-collapsed="true"] { display: none; }

/* closable 标题栏关闭 ✕ */
#dlg-close-x { cursor: pointer; width: 16px; height: 16px; flex-shrink: 0;
  color: var(--sapContent_IconColor, #6a6d70); }
#dlg-close-x:hover { color: var(--sapButton_Emphasized_TextColor, var(--sapBrandColor, #0070f2)); }

/* ── Region panel（供左右分栏布局复用） ── */
.dlg-region {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  background: var(--sapBaseColor, #fff);
}
.dlg-region + .dlg-region,
.dlg-splitter + .dlg-region { border-left: 1px solid var(--dlg-border-color); }
.dlg-region-content { flex: 1 1 auto; min-width: 160px; }
.dlg-region-explorer,
.dlg-region-property  { flex-shrink: 0; min-width: 120px; max-width: 600px; }

/* Region header */
.dlg-region-header {
  height: 34px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 0 10px;
  gap: 6px;
  background: var(--sapGroup_TitleBackground, #f5f5f5);
  border-bottom: 1px solid var(--dlg-border-color);
}
.dlg-region-hdr-icon { width:14px; height:14px; flex-shrink:0; color:var(--sapContent_IconColor,#0070f2); }
.dlg-region-hdr-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--sapGroup_TitleTextColor, #32363a);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Region body（内容区，cmx-floating-dialog 注入实时 DOM） */
.dlg-region-body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

/* Views container（PortalManager html_pages 多视图用） */
.dlg-region-views {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

/* Per-view slot（PortalManager html_pages 多视图用） */
.dlg-view-slot {
  display: none;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
.dlg-view-slot.active { display: flex; }

/* ── Tab strip（底部，PortalManager 多视图切换用） ── */
.dlg-tab-strip {
  flex-shrink: 0;
  display: flex;
  flex-direction: row;
  overflow-x: auto;
  scrollbar-width: none;
  background: var(--sapGroup_TitleBackground, #f5f5f5);
  border-top: 1px solid var(--dlg-border-color);
}
.dlg-tab-strip::-webkit-scrollbar { display: none; }
.dlg-tab {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0 12px;
  height: 30px;
  font-size: 12px;
  cursor: pointer;
  color: var(--sapContent_LabelColor, #6a6d70);
  white-space: nowrap;
  flex-shrink: 0;
  border-right: 1px solid var(--dlg-border-color);
  transition: background 80ms;
}
.dlg-tab:hover { background: var(--sapButton_Hover_Background, #e8f0fe); }
.dlg-tab.active {
  color: var(--sapBrandColor, #0070f2);
  font-weight: 600;
  background: var(--sapBaseColor, #fff);
  border-bottom: 2px solid var(--sapBrandColor, #0070f2);
}
.dlg-tab-icon { width:12px; height:12px; flex-shrink:0; }

/* ── Splitter ── */
.dlg-splitter {
  flex-shrink: 0;
  width: 1px;
  cursor: col-resize;
  background: var(--dlg-border-color);
  transition: background 100ms;
  z-index: 1;
}
.dlg-splitter:hover, .dlg-splitter.dragging { background: var(--sapBrandColor, #0070f2); }

/* ── Footer ── */
.dlg-footer {
  flex-shrink: 0;
  display: flex;
  flex-direction: row;
  align-items: stretch;
  border-top: 1px solid var(--dlg-border-color);
  background: var(--sapGroup_ContentBackground, #fafafa);
}
.dlg-footer-extra {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  display: flex;
  align-items: center;
  padding: 0 12px;
  gap: 6px;
}
/* PortalManager html_pages 底部内容区（与 dlg-footer-extra 同槽位，类名兼容） */
.dlg-footer-bottom {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.dlg-footer-actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  align-self: flex-end;
}
`

/**
 * 通用浮层对话框 shadow DOM 静态骨架（bar + 空 body 容器 + footer + 缩放手柄）。
 * body 内容留空，由使用方通过 setContent / 自行填充 #dlg-body 注入。
 * @returns {string}
 */
export function createDialogShellTemplate () {
  return `<style>${DIALOG_SHELL_STYLES}</style>
<div class="dlg-box" id="dlg-box">
  <ui5-bar id="dlg-bar" design="Header">
    <div slot="startContent" class="dlg-bar-start" id="dlg-bar-start">
      <ui5-icon id="dlg-bar-icon" class="dlg-bar-icon" name="document"></ui5-icon>
      <span id="dlg-bar-title" class="dlg-bar-title"></span>
      <span id="dlg-bar-desc" class="dlg-bar-desc" hidden></span>
    </div>
    <div slot="endContent" class="dlg-bar-end" id="dlg-bar-end"></div>
  </ui5-bar>
  <div class="dlg-body" id="dlg-body"></div>
  <div class="dlg-footer" id="dlg-footer">
    <div class="dlg-footer-extra" id="dlg-footer-extra"></div>
    <div class="dlg-footer-actions" id="dlg-footer-actions">
      <ui5-button id="dlg-cancel-btn" design="Default">取消</ui5-button>
      <ui5-button id="dlg-confirm-btn" design="Emphasized">确定</ui5-button>
    </div>
  </div>
  <div class="dlg-resize-root" aria-hidden="true">
    <div data-dlg-resize="n"></div>
    <div data-dlg-resize="s"></div>
    <div data-dlg-resize="e"></div>
    <div data-dlg-resize="w"></div>
    <div data-dlg-resize="nw"></div>
    <div data-dlg-resize="ne"></div>
    <div data-dlg-resize="sw"></div>
    <div data-dlg-resize="se"></div>
  </div>
</div>`
}

/** 轻量 UI5 icon name 兜底：仅允许字母数字与连字符，非法值回退 'document'。 */
export function safeDialogIconName (name) {
  const s = String(name == null ? '' : name).trim()
  return /^[a-z0-9-]+$/i.test(s) ? s : 'document'
}

// ───────────────────────────────────────────────────────────────────────────
// PortalManager 兼容层：原 portal-dialog-workspace-shell.js 的导出别名 + 专用模板。
// PortalManager 的 shell 文件改为从本模块 re-export，单一真源落在这里。
// ───────────────────────────────────────────────────────────────────────────

/** @deprecated 用 DIALOG_SHELL_STYLES。保留别名供 PortalManager 兼容。 */
export const DIALOG_WORKSPACE_STYLES = DIALOG_SHELL_STYLES

/**
 * PortalManager 四区域对话框专用骨架（body 为空容器 + footer 含 dlg-footer-bottom + busy 指示器）。
 * 与原 portal-dialog-workspace-shell.createDialogWorkspaceTemplate 输出一致。
 * @returns {string}
 */
export function createDialogWorkspaceTemplate () {
  return `<style>${DIALOG_SHELL_STYLES}</style>
<div class="dlg-box" id="dlg-box">
  <ui5-bar id="dlg-bar" design="Header">
    <div slot="startContent" class="dlg-bar-start" id="dlg-bar-start">
      <ui5-icon id="dlg-bar-icon" class="dlg-bar-icon" name="document"></ui5-icon>
      <span id="dlg-bar-title" class="dlg-bar-title"></span>
      <span id="dlg-bar-desc" class="dlg-bar-desc" hidden></span>
    </div>
    <div slot="endContent" class="dlg-bar-end" id="dlg-bar-end"></div>
  </ui5-bar>
  <div class="dlg-body" id="dlg-body"></div>
  <div class="dlg-footer" id="dlg-footer">
    <div class="dlg-footer-bottom" id="dlg-footer-bottom"></div>
    <div class="dlg-footer-actions" id="dlg-footer-actions">
      <ui5-button id="dlg-cancel-btn" design="Default">取消</ui5-button>
      <ui5-button id="dlg-confirm-btn" design="Emphasized">确定</ui5-button>
    </div>
  </div>
  <div class="dlg-resize-root" aria-hidden="true">
    <div data-dlg-resize="n"></div>
    <div data-dlg-resize="s"></div>
    <div data-dlg-resize="e"></div>
    <div data-dlg-resize="w"></div>
    <div data-dlg-resize="nw"></div>
    <div data-dlg-resize="ne"></div>
    <div data-dlg-resize="sw"></div>
    <div data-dlg-resize="se"></div>
  </div>
  <ui5-busy-indicator id="dlg-busy" active delay="0" text="加载中…"
    style="position:absolute;inset:0;z-index:40;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--sapGroup_ContentBackground,#fafafa) 85%,transparent)">
  </ui5-busy-indicator>
</div>`
}
