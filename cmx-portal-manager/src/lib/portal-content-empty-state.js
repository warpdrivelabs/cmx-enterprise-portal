/**
 * Content 区无打开标签时的空状态：Neo 高科技视觉，亮/暗主题通过 --sap* + --neo-* 适配。
 * 性能：纯静态渲染，无无限 CSS 动画。
 */

export const PORTAL_CONTENT_EMPTY_STYLES = `
  .content-empty {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    overflow: auto;
    padding: 32px 24px 40px;
    box-sizing: border-box;
    contain: layout paint style;
    background:
      radial-gradient(ellipse 120% 70% at 0% 0%, color-mix(in srgb, var(--neo-violet, var(--neo-violet, #7c3aed)) 9%, transparent), transparent 52%),
      radial-gradient(ellipse 90% 60% at 100% 100%, color-mix(in srgb, var(--neo-cyan, #00b4d8) 7%, transparent), transparent 48%),
      var(--portal-workspace-bg, var(--sapBackgroundColor, #f5f6f7));
    color: var(--sapTextColor, #32363a);
    z-index: 1;
  }
  .content-empty[hidden] { display: none !important; }
  .content-empty::before {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    opacity: 0.22;
    background-image:
      linear-gradient(color-mix(in srgb, var(--neo-cyan, #00b4d8) 6%, transparent) 1px, transparent 1px),
      linear-gradient(90deg, color-mix(in srgb, var(--neo-cyan, #00b4d8) 6%, transparent) 1px, transparent 1px);
    background-size: 40px 40px;
  }
  .content-empty__inner {
    position: relative;
    z-index: 1;
    width: min(920px, 100%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 28px;
    text-align: center;
  }
  .content-empty__viz {
    position: relative;
    width: 200px;
    height: 200px;
    flex-shrink: 0;
    contain: layout paint;
  }
  .content-empty__orbit {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    border: 1px dashed color-mix(in srgb, var(--neo-cyan, #00b4d8) 32%, transparent);
  }
  .content-empty__orbit--inner {
    inset: 18px;
    border-color: color-mix(in srgb, var(--neo-violet, var(--neo-violet, #7c3aed)) 28%, transparent);
  }
  .content-empty__core {
    position: absolute;
    inset: 52px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background:
      radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--neo-cyan, #00b4d8) 40%, var(--sapList_Background, #fff)), transparent 55%),
      radial-gradient(circle at 65% 70%, color-mix(in srgb, var(--neo-violet, var(--neo-violet, #7c3aed)) 30%, var(--sapList_Background, #fff)), transparent 50%),
      color-mix(in srgb, var(--sapList_Background, #fff) 92%, var(--neo-cyan, #00b4d8) 8%);
    border: 1px solid var(--neo-border-subtle, color-mix(in srgb, var(--neo-cyan, #00b4d8) 22%, var(--sapGroup_ContentBorderColor, #d9d9d9)));
    box-shadow: 0 0 20px color-mix(in srgb, var(--neo-cyan, #00b4d8) 14%, transparent);
  }
  .content-empty__core-ring {
    position: absolute;
    inset: -5px;
    border-radius: 50%;
    border: 2px solid transparent;
    border-top-color: var(--neo-cyan, #00b4d8);
    border-right-color: color-mix(in srgb, var(--neo-violet, var(--neo-violet, #7c3aed)) 65%, transparent);
    opacity: 0.8;
  }
  .content-empty__core ui5-icon {
    width: 2.5rem;
    height: 2.5rem;
    color: var(--neo-cyan, #00b4d8);
  }
  .content-empty__node {
    position: absolute;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--neo-mint, #10b981);
    box-shadow: 0 0 6px color-mix(in srgb, var(--neo-mint, #10b981) 45%, transparent);
  }
  .content-empty__node--1 { top: 8px; left: 50%; transform: translateX(-50%); }
  .content-empty__node--2 { bottom: 22px; left: 18px; background: var(--neo-cyan, #00b4d8); }
  .content-empty__node--3 { bottom: 22px; right: 18px; background: var(--neo-violet, var(--neo-violet, #7c3aed)); }
  .content-empty__badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 14px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--neo-cyan, #00b4d8);
    background: color-mix(in srgb, var(--neo-cyan, #00b4d8) 10%, var(--sapList_Background, #fff));
    border: 1px solid color-mix(in srgb, var(--neo-cyan, #00b4d8) 28%, var(--sapGroup_ContentBorderColor, #d9d9d9));
  }
  .content-empty__badge-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--neo-mint, #10b981);
    box-shadow: 0 0 6px color-mix(in srgb, var(--neo-mint, #10b981) 50%, transparent);
  }
  .content-empty__title {
    margin: 0;
    font-size: clamp(1.35rem, 3.2vw, 1.85rem);
    font-weight: 700;
    letter-spacing: 0.02em;
    line-height: 1.25;
    color: var(--sapTitleColor, var(--sapTextColor, #32363a));
  }
  .content-empty__title-shine {
    background: linear-gradient(
      105deg,
      var(--sapTitleColor, #32363a) 0%,
      var(--neo-cyan, #00b4d8) 42%,
      var(--neo-violet, var(--neo-violet, #7c3aed)) 58%,
      var(--sapTitleColor, #32363a) 100%
    );
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .content-empty__desc {
    margin: 0;
    max-width: 36rem;
    font-size: 14px;
    line-height: 1.65;
    color: var(--sapContent_LabelColor, #6a6d70);
  }
  .content-empty__cards {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    width: 100%;
    max-width: 720px;
  }
  @media (max-width: 640px) {
    .content-empty__cards { grid-template-columns: 1fr; }
    .content-empty__viz { width: 160px; height: 160px; }
  }
  .content-empty__card {
    padding: 14px 16px;
    border-radius: 12px;
    text-align: left;
    background: color-mix(in srgb, var(--sapList_Background, #fff) 90%, var(--neo-violet, var(--neo-violet, #7c3aed)) 10%);
    border: 1px solid var(--neo-border-subtle, color-mix(in srgb, var(--neo-cyan, #00b4d8) 14%, var(--sapGroup_TitleBorderColor, #ddd)));
    box-shadow: 0 2px 12px color-mix(in srgb, var(--neo-cyan, #00b4d8) 5%, transparent);
    transition: border-color 0.2s ease;
  }
  .content-empty__card:hover {
    border-color: color-mix(in srgb, var(--neo-cyan, #00b4d8) 38%, transparent);
  }
  .content-empty__card-head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
    font-size: 13px;
    font-weight: 600;
    color: var(--sapTextColor, #32363a);
  }
  .content-empty__card-head ui5-icon {
    width: 1rem;
    height: 1rem;
    color: var(--neo-cyan, #00b4d8);
  }
  .content-empty__card p {
    margin: 0;
    font-size: 12px;
    line-height: 1.5;
    color: var(--sapContent_LabelColor, #6a6d70);
  }
  .content-empty__actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 10px;
    margin-top: 4px;
  }
  .content-empty__hint {
    font-size: 12px;
    color: var(--sapContent_LabelColor, #6a6d70);
    opacity: 0.9;
  }
`

/** @returns {string} */
export function createContentEmptyStateMarkup () {
  return `
    <div id="content-empty-state" class="content-empty" hidden aria-hidden="true">
      <div class="content-empty__inner">
        <div class="content-empty__viz" aria-hidden="true">
          <div class="content-empty__orbit content-empty__orbit--outer"></div>
          <div class="content-empty__orbit content-empty__orbit--inner"></div>
          <span class="content-empty__node content-empty__node--1"></span>
          <span class="content-empty__node content-empty__node--2"></span>
          <span class="content-empty__node content-empty__node--3"></span>
          <div class="content-empty__core">
            <span class="content-empty__core-ring"></span>
            <ui5-icon name="ai" aria-hidden="true"></ui5-icon>
          </div>
        </div>
        <span class="content-empty__badge">
          <span class="content-empty__badge-dot" aria-hidden="true"></span>
          CMX Intelligent Portal
        </span>
        <h2 class="content-empty__title">
          <span class="content-empty__title-shine">智能工作区待命</span>
        </h2>
        <p class="content-empty__desc">
          从左侧资源管理器选择业务菜单，或通过活动栏切换工作域。
          门户将自动编排多区域视图、弹性组合与浮动工作窗口，为您构建沉浸式操作空间。
        </p>
        <div class="content-empty__cards">
          <div class="content-empty__card">
            <div class="content-empty__card-head">
              <ui5-icon name="connected" aria-hidden="true"></ui5-icon>
              上下文感知
            </div>
            <p>按场景动态解析档案规则，驱动表单、表格与字典联动。</p>
          </div>
          <div class="content-empty__card">
            <div class="content-empty__card-head">
              <ui5-icon name="grid" aria-hidden="true"></ui5-icon>
              多视图编排
            </div>
            <p>内容、资源、属性与日志区域可停靠、拆分与浮窗化。</p>
          </div>
          <div class="content-empty__card">
            <div class="content-empty__card-head">
              <ui5-icon name="lightbulb" aria-hidden="true"></ui5-icon>
              低代码扩展
            </div>
            <p>HTML 页面与设计器产物即插即用，脚本在受控运行时中执行。</p>
          </div>
        </div>
        <div class="content-empty__actions">
          <ui5-button id="content-empty-welcome-btn" design="Emphasized" icon="world">打开欢迎页</ui5-button>
          <span class="content-empty__hint">或点击顶栏 ShellBar 中的欢迎入口</span>
        </div>
      </div>
    </div>
  `
}

/**
 * 按当前 tab 数量显示/隐藏空状态。
 * @param {{ _tabs: unknown[], shadowRoot: ShadowRoot }} host
 */
export function syncContentEmptyState (host) {
  const el = host.shadowRoot.getElementById('content-empty-state')
  if (!el) return
  const empty = !host._tabs.length
  el.hidden = !empty
  el.setAttribute('aria-hidden', empty ? 'false' : 'true')
}

/**
 * 绑定空状态内交互（欢迎页按钮）。
 * @param {{ shadowRoot: ShadowRoot }} host
 */
export function wireContentEmptyState (host) {
  const btn = host.shadowRoot.getElementById('content-empty-welcome-btn')
  if (!btn || btn.dataset.cmxEmptyWired === '1') return
  btn.dataset.cmxEmptyWired = '1'
  btn.addEventListener('click', () => {
    host.dispatchEvent(new CustomEvent('portal-content-empty-welcome', {
      bubbles: true,
      composed: true,
    }))
  })
}
