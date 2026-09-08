# cmx-combo-box 使用指南

## 概述

`<cmx-combo-box>` 是数据模型驱动的组合框 Web Component，下拉层支持三种渲染：**list / tree / grid**，背后复用 `<cmx-revo-grid>` 与 `<cmx-web-treeview>`；数据来源既能直接绑定本地 `CmxDataSet`，也能用 `createPageServiceDataSource(host, def)` 包装设计器"自定义服务（pageService）"做远端异步搜索。

适用场景：
- 选业务字段（客户、科目、维度值、组织、分类树等）—— list 模式
- 弹层级目录选叶子节点（科目表、菜单、组织树）—— tree 模式
- 弹带多列辅助信息的网格选行（带 code/name/描述/分类/状态的查找列表）—— grid 模式

---

## 一、独立用法（不走 field-type 注册）

适合页面里"摆一个 combo 让用户选某个值"。

```html
<cmx-combo-box id="customer" data-cmx-mode="list" data-cmx-placeholder="选择客户"></cmx-combo-box>

<script>
  // 在 setupCombos / initPage 之类的 pageFn 里：
  var C = globalThis.__cmxDataComp || host.__cmxClasses;
  var combo = host.shadowRoot.querySelector('#customer');

  // 1) 数据源 —— 三选一
  // 1a) 本地数据
  var ds = new C.CmxDataSet({ datasetId: 'customers' });
  ds.setRows([{ id: 'c1', code: 'C001', name: '上海科技' }]);
  combo.setDataSet(ds);

  // 1b) 远端 pageService（推荐）
  combo.setDataSource(C.createPageServiceDataSource(host, {
    id: 'customers',
    service: 'loadCustomers',           // host.loadCustomers（设计器配的 pageService）
    keyField: 'id', labelField: 'name',
    queryParam: 'q',
    responsePath: 'data.items',         // 从响应里取数组的点号路径
    extraParams: { domain: 'fi' }       // 固定参数
  }));

  // 1c) 任意 DataSource（自己实现 search/loadByKeys 的对象）
  combo.setDataSource({
    id: 'manual', keyField: 'id', labelField: 'name',
    search: async (q, opts) => fetch('/api/x?q=' + q, { signal: opts.signal }).then(r => r.json()),
  });

  // 2) 列模型 —— 决定列表/树/网格里"显示什么字段"
  var cm = new C.CmxColumnModel({
    datasetId: 'customers',
    toTitleCols: 'name,code',           // list 模式拼的标题列；tree 模式 displayValue
    iconCol: 'icon',                    // 可选：tree 模式显示左侧图标的字段
    members: [
      new C.CmxColumn({ id: 'code', caption: '编码', type: 'text', width: '110px', editMode: 'readonly' }),
      new C.CmxColumn({ id: 'name', caption: '名称', type: 'text', width: '140px', editMode: 'readonly' }),
      new C.CmxColumn({ id: 'region', caption: '地区', type: 'text', width: '90px', editMode: 'readonly' }),
    ],
  });
  combo.setColumnModel(cm);

  // 3) 监听选择
  combo.addEventListener('cmx-combo-value-change', (e) => {
    console.log('picked', e.detail.id, e.detail.row);
  });

  // 4) 程序设值
  combo.setValue('c1');
</script>
```

声明式属性（也可全在 attribute 上配）：

| 属性                      | 类型           | 说明                                  |
| ----------------------- | ------------ | ----------------------------------- |
| `data-cmx-mode`         | list/tree/grid | 弹出形式                                |
| `data-cmx-placeholder`  | string       | 输入框占位                               |
| `data-cmx-readonly`     | "true"/"false" | 只读                                  |
| `data-cmx-searchable`   | "true"/"false" | 是否启用输入即过滤（默认 true）                  |
| `data-cmx-value`        | string       | 初始 id                               |
| `data-cmx-rows`         | JSON 数组     | 静态行（与 setDataSet 等价）                |
| `data-cmx-options`      | JSON         | `{dropdownWidth, dropdownMaxHeight, emptyText}` |

---

## 二、在 cmx-ui5-form / cmx-revo-grid 单元格里用（field-type 路径）

定义 `CmxColumn` 时把 `editMode` 设成 `'combo'`，把所有数据源信息塞进 `editSettings`，form/grid 编辑器自动用 `<cmx-combo-box>`：

```js
new CmxColumn({
  id: 'customerId',
  caption: '客户',
  type: 'text',
  editMode: 'combo',
  editSettings: {
    // ── 数据源（与独立用法的 setDataSource 参数同构）
    source: {
      service: 'loadCustomers',
      keyField: 'id', labelField: 'name',
      queryParam: 'q',
      responsePath: 'data.items'
    },
    // ── 弹出形式（缺省按下面字段自动推断）
    dropdown: 'list' | 'tree' | 'grid',
    parentField: 'parentId',          // tree 模式专用：父子关系字段
    dropdownColumns: someCmxColumnModel, // grid 模式：自定义弹出层列模型

    // ── 行为
    valueField: 'id',                  // 写回行的字段，缺省 'id'
    displayTemplate: '${code} - ${name}', // 显示文本，缺省 toTitleCols 拼接

    // ── 外观
    placeholder: '请选择客户',
    dropdownWidth: '480px' | 'anchor', // 'anchor' = 与输入框同宽
    dropdownMaxHeight: '320px',
    emptyText: '无匹配数据',

    // ── 静态选项（不走 source）
    options: [{ value: 'A', label: '甲' }, { value: 'B', label: '乙' }],
  },
})
```

注册一次：在页面的 pageFn 或全局入口 `import 'cmx-data-comp/lib/cmx-builtin-field-types.js'`（barrel 已自动 import）。后续 form/grid 见到 `editMode:'combo'` 字段就自动用 `<cmx-combo-box>`，**零额外代码**。

---

## 三、pageService 远端搜索

### 1. 在设计器服务面板新建一个 pageService

例如 `loadCustomers`：
- type: `rest`
- url: `/api/customers/search`
- method: `GET`

构建器（`build-cmx-page-script-block.js`）会编译成 `host.loadCustomers(params, _opts)`，其中：
- `params` —— 自动拼成 query string（GET）或 JSON body（POST/PUT/PATCH）
- `_opts.signal` —— 自动透传到 `fetch(url, { signal: _opts.signal })`（**支持取消请求**）

### 2. 在页面里包装成 DataSource

```js
var src = C.createPageServiceDataSource(host, {
  service: 'loadCustomers',
  keyField: 'id', labelField: 'name',
  queryParam: 'q',                     // 搜索文本放进 params.q
  responsePath: 'data.items',          // 从 res.data.items 取数组
  // 复杂取数走 transform 函数（client-side）：
  transform: (res, ctx) => res.data.items.filter(it => it.region === ctx.query.split('@')[1]),
});
```

`createPageServiceDataSource` 配置：

| 字段             | 类型                                  | 说明                                |
| -------------- | ----------------------------------- | --------------------------------- |
| `service`      | string（必填）                          | pageService 函数名                   |
| `id`           | string                              | DataSource id，缺省同 service          |
| `keyField`     | string，缺省 `'id'`                    | 行主键字段                             |
| `labelField`   | string，缺省 `'name'`                  | 显示字段                              |
| `queryParam`   | string，缺省 `'q'`                     | search 时搜索文本放进 params 的哪个 key      |
| `keysParam`    | string，缺省 `'ids'`                   | loadByKeys 时 key 列表放进 params 的哪个 key |
| `responsePath` | string \| (res) => any[]            | 从响应取数组（点号路径或函数）                   |
| `transform`    | (res, ctx) => any[]                 | 本地变换：拿到响应后做 dict→array / 二次过滤 / 排序；优先级高于 responsePath |
| `extraParams`  | object \| (ctx) => object           | 固定额外参数                            |
| `pageSize`     | number，缺省 50                        | 透传给 cmx-async-source 缓存            |
| `debounceMs`   | number，缺省 250                       | 输入即过滤的 debounce                   |
| `cacheSize`    | number，缺省 200                       | LRU 缓存大小                          |

### 3. 异步行为

- 用户输入触发 debounce → `searchAsync(ds, q)`（LRU 命中跳过请求 / AbortController 自动取消前一次未完成请求）
- 拿到 items → `CmxDataSet.setRows(items)` → list/grid/tree 自动重渲染
- 用户选中行 → `cursor-changed` / `node-clicked` → 写回 input + 派发 `cmx-combo-value-change`
- 外部 `setValue(id)` 时 → `lookupByKeyAsync(ds, id)` 拿单条 → 写 input 文本（不需要先打开下拉）

---

## 四、事件

全部 `bubbles + composed`：

| 事件                      | detail                       | 触发                          |
| ----------------------- | ---------------------------- | --------------------------- |
| `cmx-combo-value-change`| `{ id, row, source }`        | 选中行变化（source: click/keyboard/api） |
| `cmx-combo-open`        | `{ mode }`                   | 弹出层打开                       |
| `cmx-combo-close`       | `{ committed }`              | 弹出层关闭（committed=true 表示用户提交了选择） |
| `cmx-combo-search`      | `{ text }`                   | 用户输入（已 debounce）            |
| `cmx-combo-search-error`| `{ error }`                  | 远端搜索抛错                      |

---

## 五、demo 页面

参考 `../../../cmx-html-designer`，三个面板分别展示 list / tree / grid 三种模式，共享 `loadDimensions` + `loadMenuTree` 两个 pageService。

跑起来：

```bash
# Portal（推荐）
cd CMXPortalManager && npm run dev
# 访问 / → 在 "我的测试页面" 区域找到 "cmx-combo-box 三模式演示"
```

---

## 六、注意事项 / 已知限制

1. **tree 模式键盘导航**：首版未实现树内 ↑↓ 与 ←→（折叠展开）的键盘联动；用户点击节点选择仍正常。
2. **`host` 自动查找**：field-type 路径下，combo-box 沿 `getRootNode().host` 链向上找带有 `host[serviceName]` 函数的 CE。多层嵌套场景没问题；若 host 在 light DOM 链路外，需显式调 `el.setHost(host)`。
3. **AbortSignal 透传**：依赖运行时是含本次更新的 `build-cmx-page-script-block.js`（生成的 pageService 签名是 `(params, _opts)` 而不是旧的 `(params)`）。旧页面无需重存，重打开即按新签名编译；服务函数本身行为不变。
4. **大数据**：list/grid 模式底层是 `<cmx-revo-grid>`，自带虚拟滚动；几万行 OK。tree 模式底层 `<cmx-web-treeview>` 在节点数 5k 内表现良好。
5. **dropdown 自动推断规则**（`editSettings.dropdown` 缺省时）：
   - `editSettings.parentField` 存在 → `'tree'`
   - `editSettings.dropdownColumns` 存在 → `'grid'`
   - 其它 → `'list'`
