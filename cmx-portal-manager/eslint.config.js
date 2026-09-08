/**
 * ESLint flat config — 仅约束本仓库认为最关键的安全/一致性规则，避免一上来引入大量风格争议。
 *
 * 重点规则：
 * 1. no-restricted-syntax — 禁止裸 `el.innerHTML = ...` / `outerHTML =` / `insertAdjacentHTML(...)`
 *    与 `document.write(...)`，统一通过 `src/lib/escape.js` 转义后再赋值，或换 textContent / DOM API。
 * 2. no-restricted-globals / no-restricted-properties — 禁止直接调用 `eval` 与 `new Function(...)`。
 * 3. no-restricted-syntax — 禁止内联定义 `escHtml`/`escAttr`/`escAttrHtml`（统一从 src/lib/escape.js
 *    导入），禁止裸 `alert(...)`/`confirm(...)`/`prompt(...)`（改用 showCmxMessage / CmxFloatingDialog）。
 *
 * 例外：UI5 自定义元素的 ShadowRoot 模板初始化（`this.shadowRoot.innerHTML = ...`）确有合法
 * 需求；当数据完全是字面量、或已经过 `escHtml/escAttr` 转义时可使用单行
 * `// eslint-disable-next-line no-restricted-syntax` 显式豁免，提交评审时审核此豁免。
 */
import js from '@eslint/js'
import globals from 'globals'

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'cmx-node-server/cmx-service/**',
      '**/*.min.js',
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
        __APP_VERSION__: 'readonly',
        __BUILD_TIME__: 'readonly',
      },
    },
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "AssignmentExpression[left.type='MemberExpression'][left.property.name='innerHTML']",
          message: '禁止裸 `innerHTML =` 赋值；请用 src/lib/escape.js 的 escHtml/escAttr 转义所有动态片段，或改用 textContent / DOM API。如确需保留请在该行加 `// eslint-disable-next-line no-restricted-syntax` 显式豁免。',
        },
        {
          selector: "AssignmentExpression[left.type='MemberExpression'][left.property.name='outerHTML']",
          message: '禁止裸 `outerHTML =` 赋值；同 innerHTML 规则。',
        },
        {
          selector: "CallExpression[callee.property.name='insertAdjacentHTML']",
          message: '禁止 `insertAdjacentHTML(...)`；请用 escAttr/escHtml 后赋值或改用 DOM API。',
        },
        {
          selector: "CallExpression[callee.object.name='document'][callee.property.name='write']",
          message: '禁止 `document.write(...)`。',
        },
        {
          selector: "NewExpression[callee.name='Function']",
          message: '禁止 `new Function(...)`；动态执行字符串属于代码注入面。',
        },
        {
          selector: "FunctionDeclaration[id.name='escHtml']",
          message: '禁止内联定义 escHtml；统一从 src/lib/escape.js 导入，避免转义策略漂移。',
        },
        {
          selector: "FunctionDeclaration[id.name='escAttr']",
          message: '禁止内联定义 escAttr；统一从 src/lib/escape.js 导入，避免转义策略漂移。',
        },
        {
          selector: "FunctionDeclaration[id.name='escAttrHtml']",
          message: '禁止内联定义 escAttrHtml；统一从 src/lib/escape.js 导入，避免转义策略漂移。',
        },
        {
          selector: "CallExpression[callee.name='alert']",
          message: '禁止原生 alert；用 showCmxMessage / cmxWarn / CmxFloatingDialog（见 cmx-components-guide 技能 frontend-conventions.md）。',
        },
        {
          selector: "CallExpression[callee.name='confirm']",
          message: '禁止原生 confirm；用 CmxFloatingDialog（openModal 返回 confirm/cancel）。',
        },
        {
          selector: "CallExpression[callee.name='prompt']",
          message: '禁止原生 prompt；用 CmxFloatingDialog + ui5-input 表单。',
        },
      ],
      'no-eval': 'error',
      'no-implied-eval': 'error',

      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-prototype-builtins': 'off',
      'no-async-promise-executor': 'warn',
    },
  },
  {
    files: ['cmx-node-server/**/*.js', 'vite.config.js', 'eslint.config.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  {
    /* ai-workbench 整体从 cmx-ai-workbench 迁入：Lit 组件用 html 模板 + unsafeHTML 指令渲染
       markdown-it/shiki 已转义的受信任内容，其 innerHTML 赋值受 Lit 框架管控，不属于裸注入。
       关闭 Portal 的裸 innerHTML 规则以保持迁入代码原貌。 */
    files: ['src/ai-workbench/**/*.js'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  {
    /* escape.js 是 escHtml/escAttr/escAttrHtml 的权威定义所在，必然出现这三个函数声明；
       该文件本身是转义工具，不存在 XSS 注入面，整体豁免 no-restricted-syntax。 */
    files: ['src/lib/escape.js'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
]
