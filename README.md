# CMX Enterprise Portal — 元数据驱动平台前端

> 元数据驱动的企业级平台前端：门户运行时 + 可视化设计器 + 数据层 Web Components。
> 后端与工作区总览见上级工作区 [`cmx-workspace`](../../README.md)（backend / frontend / launcher 三分结构）。

## 这是什么

**cmx-enterprise-portal** 是前端 npm workspace monorepo：

- **cmx-portal-manager**（门户运行时，路由 `/portal/`，UI5 WebComponents + Lit）
- **cmx-html-designer**（可视化设计器，路由 `/html/`）
- **packages/cmx-data-comp**（数据层 Web Components：主从表格、组合框、树表、公式编辑器、单据/字典/报表组件…，97 个自定义元素）
- **packages/cmx-ui5-runtime**（共享 UI5/Tabler 运行时，路由 `/shared/`，Portal / Designer 均依赖，构建须先建它）
- **packages/cmx-icon-resource**（共享图标资源：Tabler / SAP 图标）
- **packages/cmx-shared**（共享纯工具域注册中心：运行时挂 `globalThis.cmx.{domain}`，native/html 资产页经全局取用，与组件库解耦）

后端由工作区 `backend/` 下的 Rust 微服务群提供（门户主应用 :8080）：元数据驱动的单据（DOC）/ 数据字典（DCT）/ 报表（RPT）/ 流程（FLOW）存储与服务、异步任务中心、插件系统。

## 核心特性

- **元数据驱动**：换一份定义 JSON 即得一套 L1..Ln 单据的装载/回存/建表，零专属代码。
- **数据层组件**：主从协调（CmxMasterSlave）、列模型（CmxColumnModel）、数据集（CmxDataSet）、增量 changeset。
- **报表**：可视化设计器 + 应用器、自定义取数函数（QM/QC）、浮动行列动态展开、协同编辑。
- **无框架 Web Components**：组件层不依赖 React/Vue/Angular，可嵌入任意宿主。
- **双主题通路**：同时兼容 UI5 大主题（含暗色/高对比）与 Neo 皮肤/色调，禁止硬编码色值（接入指南见工作区技能 `cmx-components-guide`）。

## 快速开始

依赖：Node + npm（配合后端另需 Rust + PostgreSQL）。

```bash
npm install
npm run dev:portal        # 门户运行时（Vite，:5173）
npm run dev:html          # 可视化设计器
npm run build:apps        # 全量构建（runtime + Portal + Designer）
npm test                  # vitest（cmx-data-comp + cmx-html-designer）
npm run lint              # ESLint
```

联调账号：`admin / Admin@12345`；API 鉴权与服务地址见工作区 `AGENTS.md` §七。

## 架构

```
cmx-enterprise-portal（前端 monorepo）          backend（Rust 微服务群）
├─ cmx-portal-manager   /portal/                ├─ cmx-portalservice   门户主应用 :8080（HTTP 入口）
├─ cmx-html-designer    /html/                  ├─ cmx-container       公用库 + 资产真源 assets/<svc>/
├─ packages/cmx-data-comp     数据层组件         ├─ cmx-flowengine / cmx-report / cmx-model …
├─ packages/cmx-ui5-runtime   /shared/          └─ 页面/字典/元数据资产从 assets/<svc>/ 发布
└─ packages/cmx-shared        工具域注册
   构建产物 dist/ ← 门户同源托管 →
```

## 第三方与商业依赖（部署方必读）

本项目**核心**采用宽松开源依赖，但部分**增强组件**依赖商业授权库。开源产物**不打包**这些商业包；使用相关功能需自备合法授权：

| 组件 | 用途 | 授权 | 状态 |
|------|------|------|------|
| `@mescius/spread-sheets` · `spread-excelio`（SpreadJS） | 报表可视化设计器/应用器的电子表格引擎（主链路） | 商业 | 隔离在 `packages/cmx-data-comp/src/components/spreadjs/` 单一 wrapper 之后；替换/可选化方案评估中 |
| `@infragistics/*`（Ignite UI） | 部分输入/列表/仪表组件（`cmx-ignite-*` 薄封装系列）及兼容 spreadsheet | 商业 | 使用面盘点中；非报表主链路（报表主链路为 SpreadJS） |

> 未持有上述商业授权时，相关设计器功能不可用，但不影响其余组件与后端。自研电子表格引擎 `cmx-mega-sheet`（工作区 frontend/ 下）为长期替代方向之一。

## 参与贡献 / 安全

见工作区根 [`CONTRIBUTING.md`](../../CONTRIBUTING.md) · [`SECURITY.md`](../../SECURITY.md)（**勿开公开 Issue**）。
