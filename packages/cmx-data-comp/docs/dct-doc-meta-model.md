# CmxDCTMeta / CmxDOCMeta 元数据模型

`CmxDCTMeta` 和 `CmxDOCMeta` 是 `cmx-data-comp` 的不可视模型，用于在页面运行时加载后端 JSON 元数据，并以只读对象方式访问表、字段、字段集及其属性。

## 设计目标

- 完整保留后端 JSON，不做字段裁剪；`toJSON()` 返回原始结构。
- 支持 `fieldSets` 共享访问：字段集只在模型中保存一份，表字段展开时返回轻量 `CmxMetaFieldRef`，其 `field` 指向共享字段对象。
- 支持 DCT/DOC 的领域入口：DCT 访问 `dictionaryTables`，DOC 访问 `voucherTables`。
- 支持页面设计器模型面板配置，并通过 `initPageModels` 自动挂到 `host[instanceId]`。

## 构造与加载

```js
import { CmxDCTMeta, CmxDOCMeta } from 'cmx-data-comp'

const dct = new CmxDCTMeta({ json: dctMetaJson, baseMeta: baseDctMetaJson })
const doc = new CmxDOCMeta({ json: docMetaJson, baseMeta: baseDocMetaJson })

dct.load(nextModuleMetaJson)
dct.mergeFieldSets(baseMetaJson)
await dct.loadById('gl_module_meta_v1.json')
```

构造参数：

| 参数 | 说明 |
| --- | --- |
| `json` / `meta` / `raw` | 后端完整模块元数据 JSON；字符串或对象均可 |
| `baseMeta` | 可选，共享基础元数据 JSON，通常包含 `fieldSets` |
| `fieldSets` | 可选，直接传入字段集对象 |
| `sourceName` | 可选，来源名称，仅用于调用方标记 |
| `id` / `metaId` / `file` | 可选，后端元数据标识；`loadById()` 不传参数时使用 |
| `domain` / `module` | 可选，默认 definitions API 查询参数 |
| `apiPath` | 可选，元数据加载 API，默认 `/api/definitions/config` |
| `baseApiPath` | 可选，基础字段集加载 API，默认同 `apiPath` |
| `serviceFn` / `baseServiceFn` | 可选，运行在页面 host 上的 pageService 函数名，优先于默认 fetch |
| `resolver` / `baseResolver` | 可选，自定义异步加载函数，最高优先级 |
| `autoLoad` | 可选，设计器运行时初始化后按 `id/metaId/file` 自动加载 |

## 后端服务加载 API

> 真实定义文件位于 `data/meta/definitions/<domain>/<module>/<file>`，base 字段集在 `base/<file>`。
> 例：GL 字典是 `domain:'fi', module:'gl', file:'gl_md_dct_meta_v1.json'`。
> 默认走 `/api/definitions/config` 时 **`domain` 必填、非 base 还需 `module`**，缺失会被后端拒绝（HTTP 400）。
> `loadById` 现在会在缺 `domain` 时抛出清晰错误，提示配置 domain/module 或改用 `loadMetaBatch`。

```js
const dct = new CmxDCTMeta({
  id: 'gl_md_dct_meta_v1.json',
  domain: 'fi',
  module: 'gl',
})

await dct.loadById()
await dct.loadById('gl_md_dct_meta_v1.json', { domain: 'fi', module: 'gl' })
await dct.loadBaseById('base_dct_meta_v1.json')
```

加载优先级：

1. `resolver(request)` / `baseResolver(request)`
2. `host[serviceFn](request)` / `host[baseServiceFn](request)`，需先 `bindHost(host)`
3. 默认 `fetch(apiPath?...query)` / `fetch(baseApiPath?...query)`

默认请求参数：

| 参数 | 说明 |
| --- | --- |
| `kind` | `DCT` / `DOC`；基础字段集为 `BASE` |
| `id` | 当前元数据 id |
| `domain` | 业务域 |
| `module` | 模块 |
| `file` | 文件名；未设置时等于 `id` |

`loadById(id, options)` 默认会在主元数据加载后继续加载基础字段集。基础字段集 id 从 `baseDctMetaRef.file` / `baseDocMetaRef.file` 推断；没有声明时分别回退到 `base_dct_meta_v1.json` / `base_doc_meta_v1.json`。如不需要自动加载基础字段集，可传：

```js
await dct.loadById('gl_md_dct_meta_v1.json', { domain: 'fi', module: 'gl', loadBase: false })
```

如已通过 `loadMetaBatch` 拿到一批 `bases`，可传 `bundle` 复用，跳过单独的 base 网络请求：

```js
await dct.loadById('gl_md_dct_meta_v1.json', { domain: 'fi', module: 'gl', bundle })
```

## 批量一次性加载（loadMetaBatch）

`loadMetaBatch(refs, options)` 用 **单次** `POST /api/definitions/batch` 加载多个元数据对象 **及其引用的 base 字段集**（字段集去重、不单独加载），是页面同时用到多个元数据时的首选——避免逐个、逐字段集多次往返。

```js
import { loadMetaBatch } from 'cmx-data-comp'

const bundle = await loadMetaBatch([
  { domain: 'fi', module: 'gl', file: 'gl_md_dct_meta_v1.json' },
  { domain: 'fi', module: 'gl', file: 'gl_md_doc_meta_v1.json' },
], { host })   // host 可选，绑定到各模型供 serviceFn 用

bundle.get('gl_md_dct_meta_v1.json').getDictionary('gl_account').getField('code')
bundle.dct   // CmxDCTMeta[]
bundle.doc   // CmxDOCMeta[]
```

返回对象：

| 字段 | 说明 |
| --- | --- |
| `models` | 所有已实例化的元数据模型（`CmxDCTMeta` / `CmxDOCMeta`） |
| `byFile` / `get(file)` | 按文件名取模型 |
| `byKind` / `dct` / `doc` | 按 kind 分组 |
| `bases` | 本批共享的 base 字段集原始 JSON（按文件名） |
| `errors` | 单个 ref 失败信息（不影响其它，不整体失败） |

`options`：`apiPath`（默认 `/api/definitions/batch`）、`includeBase`（默认 `true`）、`host`、`resolver(body, signal)`（自定义加载器，便于测试）、`signal`。

后端 `POST /api/definitions/batch` 请求体 `{ refs:[{domain,module,file}], includeBase }`，响应 `{ items:[{domain,module,file,kind,doc}], bases:{[file]:doc}, errors:[{ref,error}] }`。

## 后端单文件加载 API

`request` 对象形态：

```js
{
  kind: 'DCT',
  id: 'gl_module_meta_v1.json',
  domain: 'gl',
  module: 'gl',
  file: 'gl_module_meta_v1.json',
  params: {},
  signal
}
```

## 通用 API

| 方法 / 属性 | 返回 |
| --- | --- |
| `model.meta` | 顶层 `dctMeta` / `baseMeta` 摘要对象 |
| `model.raw` | 冻结后的完整原始 JSON |
| `model.listTables()` | `CmxMetaTable[]` |
| `model.getTable(id)` | 按字典/单据编码取表 |
| `model.listFieldSets()` | `CmxMetaFieldSet[]` |
| `model.getFieldSet(id)` | 共享字段集 |
| `model.listFields(tableId, options)` | 展开后的字段对象数组 |
| `model.listFieldRefs(tableId, options)` | 展开后的字段引用数组 |
| `model.getField(tableId, fieldId)` | 字段对象 |
| `model.getFieldRef(tableId, fieldId)` | 字段引用对象 |
| `model.getPath('a.b.c')` | 从原始 JSON 按路径读取 |
| `model.getSummary()` | `{ kind, metaCode, version, tables, fieldSets, inlineFields }` |
| `model.bindHost(host)` | 绑定页面 host，供 `serviceFn/baseServiceFn` 调用 |
| `model.loadById(id?, options?)` | 按具体 id 从后端加载主元数据并可自动合并基础字段集 |
| `model.loadBaseById(id?, options?)` | 按具体 id 加载并合并基础字段集 |
| `model.getLastLoad()` | 最近一次主元数据加载请求摘要 |

`listFields/listFieldRefs` 的 `options` 支持：

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `includeFieldSets` | `true` | 是否包含字段集展开字段 |
| `includeInline` | `true` | 是否包含表内 `fields` 字段 |

## DCT 专用 API

```js
const table = dct.getDictionary('gl_account')
const tables = dct.listDictionaries()
```

DCT 表编码优先级：`dictMeta.dictCode` -> `dictCode` -> `tableName`。

DCT 字段集引用会识别：`baseFieldSet`、`hierarchyFieldSet`、`auditFieldSet`、`scopeFieldSet`、`effectiveFieldSet`、`disableFieldSet`、`systemFieldSet`。

## DOC 专用 API

```js
const table = doc.getDocument('voucher_header')
const tables = doc.listDocuments()
```

DOC 表编码优先级：`voucherMeta.voucherCode` -> `docMeta.docCode` -> `documentMeta.documentCode` -> `tableCode` -> `tableName`。

DOC 字段集引用会识别：顶层 `voucherCommonFieldSet`，以及表级 `documentFieldSets`、`voucherCommonFieldSet`、`baseFieldSet`、`technicalFieldSet`、`identityFieldSet`、`sourceFieldSet`、`lifecycleFieldSet`、`commonFieldSet`。

## 表、字段集与字段引用

`CmxMetaTable`：

| 方法 / 属性 | 说明 |
| --- | --- |
| `id` / `name` / `tableName` | 表标识、显示名、物理表名 |
| `raw` | 原始表 JSON |
| `listFieldSetIds()` | 表引用的字段集 id |
| `listFieldSets()` | 表引用的字段集对象 |
| `listInlineFields()` | 表内直接声明的 `fields` |
| `listFields()` / `listFieldRefs()` | 展开字段 |
| `getField(id)` / `getFieldRef(id)` | 单字段读取 |
| `getPath(path)` | 从表 JSON 按路径读取 |

`CmxMetaFieldSet`：

| 方法 / 属性 | 说明 |
| --- | --- |
| `id` / `remark` | 字段集标识与说明 |
| `fields` | 字段数组，模型内共享保存 |
| `getField(id)` / `hasField(id)` / `listFields()` | 字段访问 |

`CmxMetaFieldRef`：

| 方法 / 属性 | 说明 |
| --- | --- |
| `field` | 字段对象；字段集字段指向共享字段对象 |
| `table` | 所属表 |
| `fieldSet` / `fieldSetId` | 来源字段集；内联字段为空 |
| `source` | `fieldSet` 或 `inline` |
| `id` / `fieldName` | 字段标识 |
| `get(prop)` / `getPath(path)` | 读取字段属性 |
| `isFromFieldSet()` | 是否来自共享字段集 |

## 设计器注册

`cmx-html-designer` 的 `CMX 模型` 调色板已注册：

- `CmxDCTMeta`
- `CmxDOCMeta`

拖入 Models 面板后，可在属性区粘贴元数据 JSON 与共享字段集 JSON。页面运行时由 `initPageModels` 创建实例：

```js
host.dctMeta.getDictionary('gl_account').getField('code')
host.docMeta.getDocument('voucher_header').listFieldRefs()
```
