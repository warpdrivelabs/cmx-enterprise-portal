# cmx-icon-resource

图标资源包，集中存放 CMX 系列项目共用的 SVG 等图标文件（当前含 Tabler Icons 的 `filled` / `outline` 两套）。

## 像 UI5 一样用字符串名称

与 SAP Icons 相同，在应用启动时安装 Tabler 桥接后，可直接在 `<ui5-icon>` 或带 `icon` 属性的 UI5 组件上写 `name`：

```html
<ui5-icon name="tabler-outline/home"></ui5-icon>
<ui5-button icon="tabler-filled/heart"></ui5-button>
```

也支持三段的写法（会自动规范化）：

```html
<ui5-icon name="tabler/outline/home"></ui5-icon>
```

### 命名规则

| 写法 | 说明 |
|------|------|
| `tabler-outline/home` | 线框图标（推荐，与 `tnt/antenna` 风格一致） |
| `tabler-filled/heart` | 实心图标 |
| `tabler/outline/home` | 同上，三段式别名 |

图标名称为 Tabler 文件名（不含 `.svg`），例如 `home`、`arrow-right`、`brand-github`。

### 在项目中启用

**CMXHTMLDesigner / CMXPortalManager 已内置**，其他 Vite 应用需：

1. 依赖：`"cmx-icon-resource": "*"`
2. Vite 合并别名：`import { cmxIconResourceResolveAliases } from 'cmx-icon-resource/vite'`
3. UI5 bundle 加载后：

```js
import { installTablerUi5Icons } from 'cmx-icon-resource/ui5'
await installTablerUi5Icons()
```

图标**按需懒加载**：只有页面实际用到的 Tabler 图标才会被打包/下载，不会一次性加载 5000+ 个。

## 静态 import（`<img>` / 内联 SVG）

```js
import homeUrl from 'tabler/outline/home.svg'
import homeSvg from 'tabler/outline/home.svg?raw'
```

## 目录结构

```
cmx-icon-resource/
├── src/
│   ├── icons/tabler/{outline,filled}/
│   ├── ui5/                  # Tabler → UI5 registry 桥接
│   └── index.js
├── vite.js                   # Vite resolve.alias
└── package.json
```
