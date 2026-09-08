/**
 * ESLint flat config — 与 CMXPortalManager/eslint.config.js 对齐：仅约束最关键的
 * 安全/一致性规则（禁止裸 innerHTML 注入与 eval / new Function），不强推风格规则。
 *
 * cmx-data-comp 既在浏览器（Web Components）也在 node（后端复用引擎/校验器）运行，
 * 故同时放开 browser + node 全局；测试文件额外放开 vitest 全局。
 *
 * 与 PortalManager 的差异：本包的核心机制即"转义后写 shadowRoot.innerHTML 渲染模板"与
 * "用 new Function 编译页面函数"（见 CLAUDE.md），属既定设计，故这两条降为 warn（仍提示、
 * 不阻断 CI）；真正危险的 eval / implied-eval 保持 error。
 */
import js from '@eslint/js'
import globals from 'globals'

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '**/*.min.js',
      // 第三方 vendored 产物（megasheet.esm.js 等）——不适用本仓规则，误扫会产生 20+ error 阻断 lint
      'src/components/spreadjs/vendor/**',
    ],
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      'no-restricted-syntax': [
        'warn',
        {
          selector: "AssignmentExpression[left.type='MemberExpression'][left.property.name='innerHTML']",
          message: '裸 `innerHTML =` 赋值请确保动态片段已经 escHtml/escAttr 转义，或改用 textContent / DOM API。',
        },
        {
          selector: "AssignmentExpression[left.type='MemberExpression'][left.property.name='outerHTML']",
          message: '裸 `outerHTML =` 赋值请确保动态片段已转义；同 innerHTML 规则。',
        },
        {
          selector: "CallExpression[callee.property.name='insertAdjacentHTML']",
          message: '`insertAdjacentHTML(...)` 请确保片段已 escAttr/escHtml 转义或改用 DOM API。',
        },
        {
          selector: "NewExpression[callee.name='Function']",
          message: '`new Function(...)` 是本包页面函数编译的既定机制；新增使用请确认输入可信。',
        },
      ],
      'no-eval': 'error',
      'no-implied-eval': 'error',

      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-prototype-builtins': 'off',
      'no-async-promise-executor': 'warn',
    },
  },
  {
    files: ['**/*.test.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
]
