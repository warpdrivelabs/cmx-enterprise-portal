# CMXPortalManager 代码质量评估报告

> 评估日期：2026-06-02  
> 评估路径：`/Users/nanomesh/Workspace/presentation/CMXPortalManager`  
> 评估范围：`src/`、`cmx-node-server/`、构建与 ESLint 配置；排除 `node_modules/`、`dist/`、第三方/内嵌 `cmx-node-server/cmx-service/` 的详细审计。

## 1. 结论摘要

CMXPortalManager 当前代码整体处于“可维护但风险边界需要收紧”的阶段。前端的 Workspace 抽象、视图渲染注册、HTML 页面运行时、拖拽布局等能力已经模块化；后端文件存储对 HTML 页面、菜单页、弹性组合等路径输入做了较多白名单校验。项目也已引入 ESLint，并对 `innerHTML`、`eval`、`new Function` 等高风险语法设置了规则。

主要问题集中在四类：

1. 安全边界：服务默认 `0.0.0.0` 监听、全局 CORS `origin: true`、无鉴权、多个写接口公开；字典 `dictId` 进入文件路径前缺少白名单校验；HTML 运行时具备执行保存页面脚本的能力，需要明确权限模型和隔离策略。
2. 耦合性：`workspace-node.js`、`workspace-view-renderer.js`、`workspace-html-pages.js`、多个 `portal-*` 组件形成核心依赖网络；`portalManagerService.js` 同时承担静态托管、REST 路由、多协议示例和业务 API 编排。
3. 可测试性：当前未发现 `*.test.js`、`*.spec.js` 或 `tests/`，质量主要依赖人工验证、lint 和运行时路径。
4. 规范完整性：ESLint 规则偏安全底线，缺少格式化工具、复杂度阈值、导入顺序、重复代码检测、覆盖率门禁等工程约束。

综合评分：**7.0 / 10**。如果按生产环境上线标准，安全与测试项会拉低到 **6.0 / 10** 左右；如果定位为本地设计器/内部开发工具，当前结构基本可继续演进。

## 2. 项目规模与技术栈

### 2.1 基本规模

- 主要源码、配置、数据相关文件：约 127 个。
- `src/` + `cmx-node-server/` 中 `.js/.mjs/.css` 代码行数：约 17,785 行。
- JS/MJS 源文件数量：约 83 个，未计入 `cmx-service/` 内嵌服务包。
- 最大文件：
  - `src/components/portal-workspace-float-window.js`：878 行。
  - `src/components/portal-log-panel.js`：632 行。
  - `src/lib/workspace-dock-layout.js`：613 行。
  - `cmx-node-server/portalManagerService.js`：565 行。
  - `cmx-node-server/lib/htmlPagesStore.js`：560 行。
  - `src/lib/mainapp.js`：555 行。
  - `src/lib/action-registry.js`：530 行。

### 2.2 技术栈

- 前端：Vite、原生 Web Components、自定义元素、UI5 Web Components、Lit。
- 后端：Node.js ESM、Fastify、`@fastify/static`、`@fastify/cors`、WebSocket、SSE、tRPC、JSON-RPC。
- 存储：本地 JSON/HTML 文件存储，通过 `cmx-node-server/lib/*Store.js` 读写。
- 工程：`npm`、ESLint flat config。

`package.json` 中 `cmx-data-comp`、`cmx-icon-resource`、`cmx-ui5-runtime` 使用 `"*"` 版本；如果这些是 monorepo 内部包可以接受，但从可复现构建角度看，仍建议在锁文件与工作区发布策略上固定版本来源。

## 3. 静态检查与依赖审计结果

### 3.1 ESLint

执行命令：

```bash
npm run lint
```

结果：0 error，3 warning。

警告项：

- `cmx-node-server/lib/flexibleCombinationStore.js:59`：`e2` 未使用。
- `cmx-node-server/lib/dict/ResultTransformer.js:59`：`children` 未使用。
- `src/components/portal-app.js:4`：`isHtmlPageRuntimeCustomElementDefined` 未使用。

评价：Lint 结果干净，但规则集偏轻。`eslint.config.js` 明确说明当前只约束关键安全/一致性规则，重点禁止裸 `innerHTML`、`outerHTML`、`insertAdjacentHTML`、`document.write`、`eval`、`new Function`；同时又对 `cmx-node-server/**/*.js` 关闭了 `no-restricted-syntax`。这意味着服务端字符串拼装和 HTML 输出仍主要依赖人工评审。

### 3.2 npm audit

执行命令：

```bash
npm audit --json
npm audit --omit=dev --json
```

结果：生产依赖和全量依赖均为 **0 个已知漏洞**。

限制：`npm audit` 只能覆盖 npm advisory 数据库中已公开并被识别的依赖漏洞，不覆盖业务逻辑漏洞、错误配置、内部包风险和运行时权限问题。

### 3.3 测试

未发现以下测试文件或目录：

- `*.test.js`
- `*.spec.js`
- `test/`
- `tests/`

这是当前质量体系的主要短板。项目包含大量布局、拖拽、工作区状态、文件写入与安全边界逻辑，缺少自动化测试会导致重构成本持续升高。

## 4. 代码规范评估

### 4.1 优点

1. 命名整体一致，文件按领域分为 `api/`、`lib/`、`components/`、`cmx-node-server/lib/`。
2. 大部分复杂模块有中文注释解释设计意图，例如 HTML 页面存储、Workspace 视图、Action Registry。
3. 已集中提供转义函数：`src/lib/escape.js` 暴露 `escHtml`、`escAttr`、`escAttrHtml`，避免各组件重复实现转义逻辑。
4. ESLint 已纳入脚本，且对 DOM XSS 高风险写法有明确限制。
5. 主要服务端存储模块使用原子写入模式：先写临时文件，再 `rename`，降低写入中断导致文件损坏的概率。

### 4.2 问题

1. 无统一格式化工具。当前没有 Prettier 或等价 formatter 配置，代码风格依赖人工保持。
2. 函数复杂度未受控。多个文件分支数量高，后续维护难度大：
   - `src/components/portal-workspace-float-window.js`：约 82 个分支点。
   - `src/lib/workspace-dock-layout.js`：约 79 个分支点。
   - `src/lib/action-registry.js`：约 78 个分支点。
   - `cmx-node-server/lib/htmlPagesStore.js`：约 76 个分支点。
3. `eslint-disable-next-line no-restricted-syntax` 使用较多。虽然很多注释说明了已转义或模板静态，但这类豁免应定期审计，否则规则会逐步失效。
4. 缺少类型系统。项目使用 JSDoc 提供部分类型说明，但无法提供 TypeScript 级别的跨模块结构约束。
5. `cmx-node-server/**/*.js` 关闭了 `no-restricted-syntax`，这会让服务端 HTML 字符串拼接、动态输出、潜在注入点更难被工具发现。

### 4.3 建议

- 引入 Prettier 或 Biome，只做格式化，不和 ESLint 争夺语义规则。
- 在 ESLint 中增加复杂度和规模阈值：`complexity`、`max-lines-per-function`、`max-depth`。
- 对 `eslint-disable` 建立清单审计，要求每个豁免说明“输入来源”和“转义位置”。
- 逐步把核心配置结构迁移到 TypeScript 或至少引入 JSDoc typedef + `tsc --checkJs`。

## 5. 耦合性分析

### 5.1 前端核心耦合

前端架构围绕 Workspace 展开，核心模块依赖集中：

- `src/lib/workspace-node.js`：20 个 import，向外 re-export 多个 workspace 相关模块，是事实上的聚合入口。
- `src/lib/workspace-html-pages.js`：16 个 import，负责 HTML 页面视图水合、批量加载、运行时数据合并。
- `src/components/portal-app.js`：连接 Activity、SideNav、ContentArea、Workspace 操作，是 UI 编排核心。
- `src/components/portal-workspace-float-window.js`：同时依赖 workspace 渲染、拖拽、tab reorder、context menu、持久化、mount 等能力，功能密度偏高。

这种设计短期提升了集成效率，但核心模块越大，越容易出现“改一个 Workspace 能力影响全部区域”的风险。

### 5.2 后端核心耦合

`cmx-node-server/portalManagerService.js` 同时承担：

- 服务初始化。
- CORS 配置。
- 静态资源挂载。
- 首页 HTML 输出。
- REST 路由注册。
- flexible-combination 逻辑函数。
- JSON-RPC、tRPC、SSE、WebSocket 示例/能力注册。
- 进程启动与信号处理。

它有 22 个 import，是后端最大耦合点。建议拆分为：

- `server/createApp.js`
- `server/staticRoutes.js`
- `server/apiRoutes.js`
- `server/flexibleCombinationRoutes.js`
- `server/realtimeRoutes.js`
- `server/start.js`

### 5.3 循环依赖风险

已看到明显的双向语义依赖：

- `workspace-dock-layout.js` 从 `workspace-node.js` 导入。
- `workspace-node.js` 又从 `workspace-dock-layout.js` 导入。

这类循环在 ESM 下不一定立即出错，但会增加初始化顺序风险。建议把公共类型/纯函数下沉到 `workspace-view-config.js` 或新增 `workspace-layout-core.js`，避免聚合入口与底层算法互相依赖。

### 5.4 评分

耦合性评分：**6.5 / 10**。

主要扣分点不是模块数量，而是若干核心文件承载职责过多、依赖方向不够干净。

## 6. 复用度分析

### 6.1 复用亮点

1. Workspace 视图渲染注册：`registerWorkspaceViewType()` 允许扩展视图类型，设计合理。
2. 转义函数集中：`escape.js` 避免了多套 escaping 策略。
3. 文件存储模式复用：`htmlPagesStore.js`、`formPagesStore.js`、`flexibleCombinationStore.js` 都采用类似的校验、原子写、分页读取思路。
4. Action Registry 把按钮状态、可见性、依赖追踪抽成独立机制，减少每个页面手写状态同步。
5. Tab overflow、Tab reorder、浮窗拖拽、浮窗持久化等行为已经拆成独立模块。

### 6.2 复用不足

1. API 客户端层仍有重复的 fetch、错误处理、分页参数处理。建议抽 `requestJson()`。
2. 服务端路由 try/catch + `reply.code(...).send({ error })` 大量重复。建议抽统一路由包装器。
3. 本地文件存储的 `readJsonFile`、`atomicWriteJson`、`withLock` 在多个 store 中重复。建议提取 `lib/fileStoreUtils.js`。
4. 面板类组件有相似的 show/hide、render workspace region、DND wiring、context menu wiring，可提取组合函数。
5. 事件名、dataset key、storage key 分散，缺少集中常量模块。

### 6.3 评分

复用度评分：**7.0 / 10**。

代码已经有一批可复用基础设施，但跨 API、跨 store、跨面板组件的重复仍较明显。

## 7. 安全与漏洞评估

### 7.1 依赖漏洞

`npm audit` 当前报告 0 个已知漏洞。依赖层面没有立即需要修补的公开 CVE/公告项。

### 7.2 高风险：无鉴权 + 全局 CORS + 默认对外监听

证据：

- `portalManagerService.js:103`：`await app.register(fastifyCors, { origin: true })`
- `portalManagerService.js:525-527`：默认 `HOST` 为 `0.0.0.0` 并启动服务。
- `portalManagerService.js:303-350`：`POST /api/form-pages`、`POST /api/html-pages` 等写接口未见鉴权。
- `dictRoutes.js:57-85`：字典 schema 注册、条目写入、删除、清空均未见鉴权。

风险：

- 同网段用户可访问服务。
- 任意 Origin 可跨域调用 API。
- 写接口可修改本地页面、表单、字典数据。
- 如果门户运行了保存的 HTML 页面脚本，攻击者可进一步注入持久化脚本内容。

建议：

- 本地开发默认绑定 `127.0.0.1`，生产/内网显式配置 `HOST=0.0.0.0`。
- CORS 改为白名单：`origin: ['http://localhost:...', 'https://...']` 或函数校验。
- 对写接口引入最小鉴权：API token、session、反向代理鉴权至少选一种。
- 为 POST/DELETE 接口增加审计日志。

### 7.3 高风险：字典 `dictId` 缺少路径白名单

证据：

- `JsonFileRepo.js:17-19`：`entriesPath(dictId)` 直接拼接 `${dictId}.json`。
- `JsonFileRepo.js:114-123`：读写条目都调用 `entriesPath(dictId)`。
- `dictRoutes.js:65-85`：写入、删除、清空条目直接使用 `req.params.dictId`。
- `DictRegistry.js` 只检查 `schema.dictId` 是非空字符串，未限制字符集。

风险：

- 如果能注册或操作恶意 `dictId`，存在路径穿越或写入非预期位置的风险。
- 即使 Fastify 对路径参数做 URL 解码行为受限，也不应依赖框架路由细节作为文件系统安全边界。

建议：

- 定义 `SAFE_DICT_ID = /^[a-zA-Z0-9_-]{1,64}$/` 或明确允许点分后逐段校验。
- 在 `DictRegistry.register()`、`JsonFileRepo.getSchema()`、`JsonFileRepo.#loadEntries()`、所有 dict route 入口统一调用 `assertDictId()`。
- `entriesPath()` 中额外使用 `path.resolve` 后校验结果必须位于 `dataRoot()/entries` 下。

### 7.4 中高风险：HTML 页面运行时执行保存的脚本

证据：

- `workspace-html-page-preview.js:13-17`：构建“含可执行脚本”的完整 HTML 文档。
- `workspace-html-page-preview.js:139-155`：注入时重新创建 `script` 节点，内联脚本和外链脚本都会执行。
- `workspace-html-page-preview.js:130-131`：注入前会把 `globalThis.__cmxTemplateRoot`、`globalThis.workspace` 暴露给页面脚本。
- `workspace-view-renderer.js:39-40`：`type === 'html'` 时直接返回 `data.html`。
- `workspace-view-renderer.js:85-92`：`split.leftHtml/rightHtml` 直接拼入 DOM。

说明：

这可能是产品能力本身，因为 CMXHTMLDesigner 保存的页面需要在 Portal 中运行。但从安全角度，它等价于“受信任脚本执行平台”。如果保存页面来源不完全可信，就会变成持久化 XSS/RCE-in-browser 风险。

建议：

- 明确数据来源：只有可信设计器/管理员可以保存 HTML 页面。
- 对普通内容展示场景增加 `safeHtml` / `text` 模式，默认不执行脚本。
- 对 `iframe/link` 的 `src` 加协议白名单，拒绝 `javascript:`、`data:` 等危险协议。
- 若需要运行不可信页面，应改为沙箱 iframe：`<iframe sandbox="allow-scripts ...">`，并通过 `postMessage` 提供受控能力。
- 对 `workspace` 暴露能力做最小化，避免页面脚本直接获得过强操作面。

### 7.5 中风险：批量/树形查询可能导致资源消耗

证据：

- `dictRoutes.js:18`：树形模式 `fetchSize` 设置为 `99999`。
- `JsonFileRepo.js:219-221`：`pageSize` 由请求参数参与 slice，未见统一上限。
- `htmlPagesStore.js:507-510`：HTML 页面 batch 已有限制，最多 64 个，这一点是好的。

建议：

- 对所有 list/search 接口统一限制 `pageSize`，例如最大 200 或 1000。
- 树形结果也应分页或限制最大节点数。
- 对 `q`、`filters`、`sort.field` 做字段白名单或长度限制。

### 7.6 已做得较好的安全点

1. HTML 页面 ID 校验较完善：`SAFE_ID`、`SAFE_SEGMENT`、空段拒绝。
2. `resolveHtmlAbsPath()` 对 `relPath` 做了绝对路径、`..`、反斜杠、normalize 后检查。
3. 菜单页路径使用逐段白名单。
4. 弹性组合路径使用 `SAFE_SEGMENT`。
5. ESLint 禁止了裸 `eval`、`new Function`、危险 DOM 写法。
6. `npm audit` 当前没有公开依赖漏洞。

## 8. 可维护性评估

### 8.1 优点

- 模块命名清楚，领域边界基本可识别。
- 核心复杂逻辑有注释，不是完全“黑盒代码”。
- 本地文件存储的兼容策略描述详细，迁移成本可控。
- 多数前端组件使用自定义元素封装，宿主边界清晰。

### 8.2 问题

- 大文件多且职责复合，阅读成本偏高。
- 缺少测试导致维护者很难判断重构是否破坏拖拽、浮窗、tab、运行时注入等行为。
- 缺少架构决策记录，例如为什么同时保留 REST、JSON-RPC、tRPC、SSE、WebSocket。
- `globalThis.workspace`、`globalThis.__cmxTemplateRoot` 是运行时便利点，但也增加隐式依赖和测试难度。

### 8.3 建议

- 优先给 `htmlPagesStore`、`menuPagesStore`、`JsonFileRepo`、`workspace-view-renderer` 加单元测试。
- 用 Playwright 给关键 UI 工作流加最小 E2E：打开 Portal、切换 Activity、打开 HTML 页面、拖拽 tab、浮窗打开/关闭。
- 把 `portalManagerService.js` 拆路由文件，保留入口文件只做装配和启动。
- 给 Workspace 配置、ViewSpec、ActivityEntry 建立 schema，可用 Zod 或 TypeScript。

## 9. 性能评估

### 9.1 正面点

- 前端按模块拆分，Vite 构建友好。
- `import-ui5-and-app.js` 使用动态 import 加载组件。
- HTML 页面 batch 接口有数量上限。
- localStorage 持久化逻辑有容量上限/裁剪思路。

### 9.2 风险点

- 文件存储全量 JSON 读写，在数据量上来后会成为瓶颈。
- 字典搜索是内存数组过滤 + 排序，适合小数据，不适合大字典。
- 多处 `innerHTML` 整体替换会导致 DOM 重建，复杂页面下可能触发布局抖动。
- 全局 MutationObserver 扫 registry 元素，规模增大后需关注性能。

建议：如果字典/页面数据达到万级，应引入索引、SQLite、LiteFS 或服务端数据库，而不是继续扩展 JSON 文件。

## 10. 优先级改进清单

### P0：上线前必须处理

1. 写接口鉴权：`/api/html-pages`、`/api/form-pages`、`/api/dict/*`、`/api/flexible-combination/config`。
2. CORS 白名单，不使用 `origin: true`。
3. 默认 `HOST` 改为 `127.0.0.1`，对外监听必须显式配置。
4. 字典 `dictId` 白名单校验和路径 confinement。
5. 对 HTML 运行时能力写明信任边界；不可信内容必须 sandbox。

### P1：一个迭代内处理

1. 新增单元测试：路径穿越、HTML batch 限制、dictId 校验、菜单引用解析、弹性组合路径解析。
2. 拆分 `portalManagerService.js`。
3. 提取 `requestJson()`、`fileStoreUtils.js`、统一 route error wrapper。
4. 给 `pageSize`、`q`、`filters` 加统一上限。
5. 引入 formatter 和复杂度 lint。

### P2：持续优化

1. 逐步引入 TypeScript 或 `checkJs`。
2. 梳理 Workspace 依赖方向，消除循环依赖。
3. 建立 ADR 文档，说明多协议保留策略。
4. 为 UI 加 Playwright 冒烟测试和截图回归。
5. 根据数据规模评估从 JSON 文件迁移到数据库。

## 11. 分项评分

| 维度 | 分数 | 说明 |
|---|---:|---|
| 代码规范 | 7.0 | 命名和注释较好，ESLint 已有安全规则；格式化、复杂度、类型约束不足 |
| 架构清晰度 | 7.0 | Workspace 抽象明确；后端入口和部分核心前端文件职责过重 |
| 耦合控制 | 6.5 | 核心聚合模块依赖集中，存在循环依赖风险 |
| 复用度 | 7.0 | 已有 escape、ActionRegistry、workspace renderer 等复用点；API/store/面板重复仍多 |
| 安全性 | 6.0 | 依赖漏洞为 0；但无鉴权、CORS、dictId、HTML 执行边界风险明显 |
| 可测试性 | 4.0 | 未发现自动化测试 |
| 可维护性 | 7.0 | 注释充分、模块边界可识别；大文件和隐式全局状态影响维护 |
| 综合 | 7.0 | 适合作为内部工具继续演进；生产化需优先补安全和测试 |

## 12. 建议的近期落地方案

第一步先做低风险高收益的安全修复：

1. 新增 `cmx-node-server/lib/dict/assertDictId.js`。
2. 在 dict route 和 repo 入口统一校验。
3. 默认 host 改为 `127.0.0.1`。
4. CORS 从 `origin: true` 改成环境变量白名单。
5. 对写接口加简单 token middleware。

第二步补测试：

1. 选择 Node 内置 `node:test` 或 Vitest。
2. 先测纯函数和 store：`parsePageNamespace`、`parseMenuRef`、`resolveFlexibleCombinationPath`、`JsonFileRepo`。
3. 再测服务路由的鉴权和输入校验。

第三步降耦合：

1. 拆 `portalManagerService.js`。
2. 抽 `fileStoreUtils.js`。
3. 抽 `requestJson()`。
4. 梳理 `workspace-node.js` 与 `workspace-dock-layout.js` 的依赖方向。

