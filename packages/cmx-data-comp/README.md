# cmx-data-comp

数据组件库，用于开发与数据相关的各类 Web Components。

本包以 **源码 ESM** 形式被 monorepo 内各应用引用（`package.json` 的 `exports` 指向 `src/`），不在此包内打包生成 `dist`。

## 目录结构

```
cmx-data-comp/
├── src/
│   ├── components/     # Web Components（cmx-revo-grid、cmx-ui5-form、cmx-tabulator 等）
│   ├── lib/            # CmxDataSet、CmxMasterSlave、列模型等
│   └── index.js        # 库入口
├── vite.config.js      # 仅用于本地 dev 别名（可选）
└── package.json
```

## 依赖

- `@revolist/revogrid`（`cmx-revo-grid`）
- 消费方应用负责 UI5 / Vite 打包（见 CMXHTMLDesigner、CMXPortalManager）

## 使用

```js
import 'cmx-data-comp/components/cmx-revo-grid.js'
import 'cmx-data-comp/components/cmx-ui5-form.js'
import { CmxMasterSlave } from 'cmx-data-comp/lib/cmx-master-slave.js'
```
