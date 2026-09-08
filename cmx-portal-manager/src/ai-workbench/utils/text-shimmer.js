/**
 * TextShimmer —— opencode 标志性扫光标题动画。
 *
 * pending/running 的工具标题用此渲染:文字上有一道亮带从右向左扫过,循环。
 * 实现原理(简化版,源自 opencode text-shimmer.css):
 *   单层 span,文字透明(color:transparent + fill-color:transparent),
 *   叠加两层 background:底色实色 + 扫光线性渐变;background-clip:text 让渐变只作用于文字字形。
 *   @keyframes oc-shimmer-sweep 动画 background-position,1200ms linear infinite。
 *
 * 用法:
 *   import { textShimmerCss, renderTextShimmer } from '../utils/text-shimmer.js'
 *   static styles = [sharedTokens, textShimmerCss, css`...`]
 *   render: ${renderTextShimmer('读取', true)}   // 第二参 active=true 激活扫光
 *
 * active=false 时退化为普通 muted 文字,无动画。
 */
import { css, html } from 'lit'

export const textShimmerCss = css`
  .oc-shimmer {
    display: inline-block;
    color: var(--oc-text-muted);
    background-image: linear-gradient(
      90deg,
      var(--oc-text-faint) 0%,
      var(--oc-text-faint) calc(50% - 3ch),
      var(--oc-text-base) 50%,
      var(--oc-text-faint) calc(50% + 3ch),
      var(--oc-text-faint) 100%
    );
    background-size: 200% 100%;
    background-position: 100% 0;
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    color: transparent;
  }
  .oc-shimmer[data-active="true"] {
    animation: oc-shimmer-sweep 1200ms linear infinite;
    will-change: background-position;
  }
  @keyframes oc-shimmer-sweep {
    0% { background-position: 100% 0; }
    100% { background-position: 0% 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .oc-shimmer[data-active="true"] {
      animation: none;
      background-image: none;
      -webkit-text-fill-color: initial;
      color: var(--oc-text-muted);
    }
  }
`

/**
 * 渲染扫光文字。
 * @param {string} text 标题文字
 * @param {boolean} active 是否激活动画(pending/running)
 * @returns {import('lit').TemplateResult}
 */
export function renderTextShimmer (text, active = false) {
  return html`<span class="oc-shimmer" data-active=${active ? 'true' : 'false'}>${text}</span>`
}
