/**
 * 共享设计 token —— 全部组件通过 static styles = [sharedTokens, css`...`] 注入。
 *
 * 取值忠实复刻 opencode 深浅双主题(packages/ui/src/v2/styles/colors.css + theme.css 实测)。
 * - 深色:中性灰阶 + 蓝强调(a2bcff 文字 / 3b5cf6 填充)
 * - 浅色:反相灰阶,强调蓝加深
 *
 * 切换机制:
 *   1. 默认跟随 prefers-color-scheme
 *   2. 根元素(host 或 documentElement)设置 data-color-scheme="light|dark" 强制覆盖
 *
 * 注意:Lit shadow DOM 不继承宿主 CSS 变量到 :host 外部,但变量本身是继承的——
 * 只要根文档(或 ai-app :host)定义了这些 --oc-* 变量,子组件就能 var() 引用。
 * 这里把定义放在 :host,并通过 ai-app 向下传递;同时给一个 fallback 默认(深色)。
 */
import { css } from 'lit'

export const sharedTokens = css`
  :host {
    /* 盒模型重置：shadow DOM 不继承文档级的 box-sizing，需在此显式声明，
       避免 height:100% + padding 的元素（如欢迎页 .empty）在 content-box 下溢出触发滚动。 */
    box-sizing: border-box;
    /* ---- 字体/排版 ---- */
    --oc-font-sans: "Inter", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    --oc-font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    --oc-font-size-small: 13px;
    --oc-font-size-base: 14px;
    --oc-font-size-large: 16px;
    --oc-font-size-xlarge: 20px;

    /* ---- 圆角 ---- */
    --oc-radius-xs: 2px;
    --oc-radius-sm: 4px;
    --oc-radius-md: 6px;
    --oc-radius-lg: 8px;
    --oc-radius-xl: 10px;

    /* ---- 深色(默认) ---- */
    --oc-bg-base: #161616;
    --oc-bg-deep: #080808;
    --oc-layer-01: #242424;
    --oc-layer-02: #2e2e2e;
    --oc-layer-03: #3a3a3a;

    --oc-text-base: #fafafa;
    --oc-text-muted: #aeaeae;
    --oc-text-faint: #808080;

    --oc-border-muted: rgba(255, 255, 255, 0.05);
    --oc-border-base: rgba(255, 255, 255, 0.10);
    --oc-border-strong: rgba(255, 255, 255, 0.20);

    --oc-accent-text: #a2bcff;
    --oc-accent-fill: #3b5cf6;
    --oc-accent-fill-hover: #4f6cf8;
    --oc-accent-focus: #7698fd;
    --oc-accent-tint: rgba(59, 92, 246, 0.14);

    --oc-error: #f17471;
    --oc-error-fg: #f17471;
    --oc-error-bg: rgba(241, 116, 113, 0.10);
    --oc-error-border: rgba(241, 116, 113, 0.30);

    --oc-success: #6bd586;
    --oc-success-bg: rgba(107, 213, 134, 0.10);

    --oc-warning: #f2cf76;
    --oc-warning-bg: rgba(242, 207, 118, 0.10);

    --oc-info-tint: rgba(118, 152, 253, 0.14);

    --oc-shadow-raised: 0 1px 2px rgba(0, 0, 0, 0.08), 0 4px 16px rgba(0, 0, 0, 0.24);
    --oc-shadow-border: 0 0 0 1px var(--oc-border-base);

    /* ---- opencode 语法高亮(深色,对齐 OpenCodeTheme + theme.css dark) ---- */
    --oc-code-bg: #151515;            /* 代码块背景 = background-stronger */
    --oc-code-fg: rgba(255,255,255,0.618);  /* text-base */
    --oc-syntax-comment: rgba(255,255,255,0.422);
    --oc-syntax-regexp: rgba(255,255,255,0.618);
    --oc-syntax-string: #00ceb9;
    --oc-syntax-keyword: rgba(255,255,255,0.422);
    --oc-syntax-primitive: #ffba92;
    --oc-syntax-operator: rgba(255,255,255,0.422);
    --oc-syntax-variable: rgba(255,255,255,0.936);
    --oc-syntax-property: #ff9ae2;
    --oc-syntax-type: #ecf58c;
    --oc-syntax-constant: #93e9f6;
    --oc-syntax-punctuation: rgba(255,255,255,0.422);
    --oc-syntax-object: rgba(255,255,255,0.936);
    --oc-syntax-info: #93e9f6;
    --oc-syntax-critical: #f54f36;
  }

  /* ---- 浅色 ---- */
  :host([data-color-scheme="light"]) {
    --oc-bg-base: #ffffff;
    --oc-bg-deep: #f7f7f7;
    --oc-layer-01: #f2f2f2;
    --oc-layer-02: #eeeeee;
    --oc-layer-03: #dbdbdb;

    --oc-text-base: #161616;
    --oc-text-muted: #5c5c5c;
    --oc-text-faint: #808080;

    --oc-border-muted: rgba(0, 0, 0, 0.06);
    --oc-border-base: rgba(0, 0, 0, 0.10);
    --oc-border-strong: rgba(0, 0, 0, 0.20);

    --oc-accent-text: #3b5cf6;
    --oc-accent-fill: #3b5cf6;
    --oc-accent-fill-hover: #2f4ad8;
    --oc-accent-focus: #3b5cf6;
    --oc-accent-tint: rgba(59, 92, 246, 0.08);

    --oc-error: #b82d35;
    --oc-error-fg: #b82d35;
    --oc-error-bg: rgba(184, 45, 53, 0.06);
    --oc-error-border: rgba(184, 45, 53, 0.25);

    --oc-success: #1d783c;
    --oc-success-bg: rgba(29, 120, 60, 0.08);

    --oc-warning: #946f00;
    --oc-warning-bg: rgba(148, 111, 0, 0.08);

    --oc-info-tint: rgba(59, 92, 246, 0.08);

    --oc-shadow-raised: 0 1px 2px rgba(0, 0, 0, 0.04), 0 4px 16px rgba(0, 0, 0, 0.08);

    /* ---- opencode 语法高亮(浅色,对齐 theme.css light) ---- */
    --oc-code-bg: #fcfcfc;
    --oc-code-fg: #6f6f6f;
    --oc-syntax-comment: #8f8f8f;
    --oc-syntax-regexp: #6f6f6f;
    --oc-syntax-string: #006656;
    --oc-syntax-keyword: #8f8f8f;
    --oc-syntax-primitive: #fb4804;
    --oc-syntax-operator: #6f6f6f;
    --oc-syntax-variable: #171717;
    --oc-syntax-property: #ed6dc8;
    --oc-syntax-type: #596600;
    --oc-syntax-constant: #007b80;
    --oc-syntax-punctuation: #6f6f6f;
    --oc-syntax-object: #171717;
    --oc-syntax-info: #0092a8;
    --oc-syntax-critical: #ed4831;
  }
  @media (prefers-color-scheme: light) {
    :host(:not([data-color-scheme="dark"])) {
      --oc-bg-base: #ffffff;
      --oc-bg-deep: #f7f7f7;
      --oc-layer-01: #f2f2f2;
      --oc-layer-02: #eeeeee;
      --oc-layer-03: #dbdbdb;

      --oc-text-base: #161616;
      --oc-text-muted: #5c5c5c;
      --oc-text-faint: #808080;

      --oc-border-muted: rgba(0, 0, 0, 0.06);
      --oc-border-base: rgba(0, 0, 0, 0.10);
      --oc-border-strong: rgba(0, 0, 0, 0.20);

      --oc-accent-text: #3b5cf6;
      --oc-accent-fill: #3b5cf6;
      --oc-accent-fill-hover: #2f4ad8;
      --oc-accent-focus: #3b5cf6;
      --oc-accent-tint: rgba(59, 92, 246, 0.08);

      --oc-error: #b82d35;
      --oc-error-fg: #b82d35;
      --oc-error-bg: rgba(184, 45, 53, 0.06);
      --oc-error-border: rgba(184, 45, 53, 0.25);

      --oc-success: #1d783c;
      --oc-success-bg: rgba(29, 120, 60, 0.08);

      --oc-warning: #946f00;
      --oc-warning-bg: rgba(148, 111, 0, 0.08);

      --oc-info-tint: rgba(59, 92, 246, 0.08);

      --oc-shadow-raised: 0 1px 2px rgba(0, 0, 0, 0.04), 0 4px 16px rgba(0, 0, 0, 0.08);

      /* ---- opencode 语法高亮(浅色) ---- */
      --oc-code-bg: #fcfcfc;
      --oc-code-fg: #6f6f6f;
      --oc-syntax-comment: #8f8f8f;
      --oc-syntax-regexp: #6f6f6f;
      --oc-syntax-string: #006656;
      --oc-syntax-keyword: #8f8f8f;
      --oc-syntax-primitive: #fb4804;
      --oc-syntax-operator: #6f6f6f;
      --oc-syntax-variable: #171717;
      --oc-syntax-property: #ed6dc8;
      --oc-syntax-type: #596600;
      --oc-syntax-constant: #007b80;
      --oc-syntax-punctuation: #6f6f6f;
      --oc-syntax-object: #171717;
      --oc-syntax-info: #0092a8;
      --oc-syntax-critical: #ed4831;
    }
  }
`
