# CMX 通用数据字典检索服务设计方案

> 版本：1.0 · 日期：2026-05-22

---

## 目录

1. [背景与目标](#1-背景与目标)
2. [核心概念](#2-核心概念)
3. [整体架构](#3-整体架构)
4. [Elasticsearch 数据模型](#4-elasticsearch-数据模型)
5. [Node.js 服务层设计](#5-nodejs-服务层设计)
6. [API 接口规范](#6-api-接口规范)
7. [前端数据适配（CmxDataSet 形式）](#7-前端数据适配cmxdataset-形式)
8. [多字典联查方案](#8-多字典联查方案)
9. [全文与模糊检索策略](#9-全文与模糊检索策略)
10. [部署与配置](#10-部署与配置)
11. [扩展点](#11-扩展点)

---

## 1 背景与目标

业务系统中存在大量「数据字典」类数据，如：组织机构、会计科目、物料分类、地区码、状态码等。它们有如下共同特征：

- 条目数量从数十到数十万不等
- 部分为**平铺枚举**，部分为**多级树形**结构
- 经常需要在表单下拉、表格筛选、全文搜索场景中按条件检索
- 不同字典之间存在**联查**关系（如「先选组织机构，再过滤该机构下的科目」）

目标：

| # | 目标 |
|---|------|
| G1 | 统一的单字典检索接口，支持任意属性条件、模糊检索、全文检索 |
| G2 | 树形字典按层次返回，结构与 CmxDataSet 层级数据一致，前端零适配 |
| G3 | 多字典联查接口，支持父子字典级联、跨字典联合检索 |
| G4 | 底层使用 Elasticsearch，具备高并发检索、倒排索引能力 |
| G5 | 服务层使用 Node.js（Fastify），与现有 CMXPortalManager 架构对齐 |

---

## 2 核心概念

### 2.1 字典定义（DictSchema）

每种字典在服务启动前通过**字典注册表**（`dict-registry.json` 或数据库）预先声明：

```jsonc
{
  "dictId": "account",           // 字典唯一标识
  "label": "会计科目",
  "esIndex": "cmx_dict_account", // ES 索引名
  "hierarchical": true,          // 是否树形字典
  "parentField": "parentCode",   // 树形时父节点字段名
  "idField": "code",             // 节点 ID 字段
  "labelField": "name",          // 节点显示字段
  "fullTextFields": ["code", "name", "pinyin"], // 全文检索字段
  "filterFields": ["orgCode", "type", "level"], // 支持条件过滤的字段
  "childDicts": ["costCenter"]   // 本节点可关联的子字典列表
}
```

### 2.2 字典条目（DictEntry）

ES 中每个字典条目的通用结构：

```jsonc
{
  "_id": "account:1001",         // ES 文档 ID：{dictId}:{idField 值}
  "dictId": "account",
  "code": "1001",
  "name": "货币资金",
  "parentCode": null,            // 根节点
  "level": 1,
  "path": ["1001"],              // 从根到自身的 ID 路径，用于祖先查询
  "pathStr": "1001",             // path.join('/') 便于前缀匹配
  "orgCode": "HQ",
  "type": "asset",
  "fullText": "货币资金 huobi zijin 1001", // 预处理好的全文字段
  "sortKey": "1001"
}
```

> **path / pathStr** 字段是树形查询的关键，写入时由服务层维护，无需前端感知。

---

## 3 整体架构

```
┌──────────────────────────────────────────────────────┐
│                   前端 / Portal                       │
│  CmxDataSet  ←  DictQueryClient  ←  HTTP / tRPC      │
└─────────────────────────┬────────────────────────────┘
                          │ REST  /  tRPC
┌─────────────────────────▼────────────────────────────┐
│              Node.js  DictService (Fastify)           │
│                                                       │
│  ┌────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ DictRouter │  │ DictRegistry │  │ QueryBuilder │  │
│  └─────┬──────┘  └──────┬───────┘  └──────┬───────┘  │
│        └────────────────┴──────────────────┘          │
│                         │                             │
│              ┌──────────▼──────────┐                  │
│              │   ElasticsearchRepo │                  │
│              └──────────┬──────────┘                  │
└─────────────────────────┼────────────────────────────┘
                          │ ES REST API (8.x)
┌─────────────────────────▼────────────────────────────┐
│              Elasticsearch  Cluster                   │
│   cmx_dict_{dictId}  ×N   +  cmx_dict_registry       │
└──────────────────────────────────────────────────────┘
```

**数据流说明：**

1. 前端通过 `DictQueryClient` 调用 `/api/dict/search`（单字典）或 `/api/dict/multi-search`（多字典联查）
2. `DictRouter` 解析请求，从 `DictRegistry` 取字典 schema
3. `QueryBuilder` 根据 schema 与请求参数组装 ES DSL
4. `ElasticsearchRepo` 执行查询，结果经 `ResultTransformer` 转为 CmxDataSet 格式返回

---

## 4 Elasticsearch 数据模型

### 4.1 字典注册索引

```
索引名：cmx_dict_registry
```

```json
{
  "mappings": {
    "properties": {
      "dictId":         { "type": "keyword" },
      "label":          { "type": "keyword" },
      "esIndex":        { "type": "keyword" },
      "hierarchical":   { "type": "boolean" },
      "parentField":    { "type": "keyword" },
      "idField":        { "type": "keyword" },
      "labelField":     { "type": "keyword" },
      "fullTextFields": { "type": "keyword" },
      "filterFields":   { "type": "keyword" },
      "childDicts":     { "type": "keyword" }
    }
  }
}
```

### 4.2 字典数据索引模板

```
索引名：cmx_dict_{dictId}（如 cmx_dict_account）
```

```json
{
  "mappings": {
    "dynamic": true,
    "properties": {
      "dictId":    { "type": "keyword" },
      "level":     { "type": "integer" },
      "path":      { "type": "keyword" },
      "pathStr":   { "type": "keyword" },
      "sortKey":   { "type": "keyword" },
      "fullText":  {
        "type": "text",
        "analyzer": "ik_max_word",
        "search_analyzer": "ik_smart",
        "fields": {
          "keyword": { "type": "keyword", "ignore_above": 256 },
          "suggest": { "type": "completion" }
        }
      }
    }
  },
  "settings": {
    "analysis": {
      "analyzer": {
        "ik_max_word": { "type": "custom", "tokenizer": "ik_max_word" },
        "ik_smart":    { "type": "custom", "tokenizer": "ik_smart" }
      }
    }
  }
}
```

> **说明**：业务字段（code、name、orgCode 等）由 `dynamic: true` 自动映射，`fullText` 字段做分词，业务字段做 keyword 精确匹配与聚合。

### 4.3 树形数据写入规范

写入树形字典时，服务层需自动计算并维护以下字段：

| 字段 | 类型 | 规则 |
|------|------|------|
| `level` | integer | 根节点为 1，每深一层 +1 |
| `path` | keyword[] | 从根到自身 idField 值的有序数组，如 `["1000", "1001", "10010001"]` |
| `pathStr` | keyword | `path.join('/')` 便于前缀过滤，如 `"1000/1001"` |

---

## 5 Node.js 服务层设计

### 5.1 目录结构

```
cmx-node-server/
└── lib/
    └── dict/
        ├── DictRegistry.js       # 字典注册表（内存+ES缓存）
        ├── ElasticsearchRepo.js  # ES 客户端封装
        ├── QueryBuilder.js       # ES DSL 组装
        ├── ResultTransformer.js  # 结果 → CmxDataSet 格式转换
        ├── DictWriteService.js   # 写入/更新字典条目（含 path 维护）
        └── dictRoutes.js         # Fastify 路由注册
```

### 5.2 DictRegistry

```js
// DictRegistry.js
export class DictRegistry {
  #cache = new Map()
  #repo

  constructor(repo) { this.#repo = repo }

  async get(dictId) {
    if (this.#cache.has(dictId)) return this.#cache.get(dictId)
    const schema = await this.#repo.getSchema(dictId)
    if (!schema) throw Object.assign(new Error(`字典 ${dictId} 未注册`), { statusCode: 404 })
    this.#cache.set(dictId, schema)
    return schema
  }

  async invalidate(dictId) { this.#cache.delete(dictId) }
}
```

### 5.3 QueryBuilder

核心方法：`buildSearchDsl(schema, params)` → ES Request Body

```js
// QueryBuilder.js
export class QueryBuilder {

  /**
   * 单字典检索 DSL
   * @param {object} schema   - 字典 schema
   * @param {object} params   - 检索参数（见 API 规范）
   */
  buildSearchDsl(schema, params) {
    const { q, filters = {}, parentId, ancestorId, page = 1, pageSize = 20, sort } = params
    const must = []
    const filter = []

    // ── 全文检索 ──────────────────────────────────────────
    if (q && q.trim()) {
      must.push({
        multi_match: {
          query: q.trim(),
          fields: schema.fullTextFields.map(f => f === 'fullText' ? 'fullText' : f),
          type: 'best_fields',
          fuzziness: 'AUTO',       // 模糊匹配
          prefix_length: 1,
          minimum_should_match: '75%'
        }
      })
    }

    // ── 属性条件过滤 ──────────────────────────────────────
    for (const [field, value] of Object.entries(filters)) {
      if (!schema.filterFields.includes(field)) continue
      if (value === null || value === undefined || value === '') continue
      if (Array.isArray(value)) {
        filter.push({ terms: { [field]: value } })
      } else if (typeof value === 'string' && value.includes('*')) {
        filter.push({ wildcard: { [field]: { value, case_insensitive: true } } })
      } else {
        filter.push({ term: { [field]: value } })
      }
    }

    // ── 树形：仅返回指定父节点的直接子节点 ────────────────
    if (schema.hierarchical && parentId !== undefined) {
      if (parentId === null) {
        filter.push({ bool: { must_not: { exists: { field: schema.parentField } } } })
      } else {
        filter.push({ term: { [schema.parentField]: parentId } })
      }
    }

    // ── 树形：返回指定祖先节点的所有后代 ─────────────────
    if (schema.hierarchical && ancestorId !== undefined) {
      filter.push({ term: { path: ancestorId } })
    }

    const query = must.length || filter.length
      ? { bool: { ...(must.length ? { must } : {}), ...(filter.length ? { filter } : {}) } }
      : { match_all: {} }

    return {
      index: schema.esIndex,
      body: {
        query,
        sort: sort
          ? [{ [sort.field]: { order: sort.order || 'asc' } }]
          : [{ sortKey: 'asc' }],
        from: (page - 1) * pageSize,
        size: pageSize,
        track_total_hits: true
      }
    }
  }

  /**
   * 模糊/前缀自动补全 DSL
   */
  buildSuggestDsl(schema, prefix) {
    return {
      index: schema.esIndex,
      body: {
        suggest: {
          dict_suggest: {
            prefix,
            completion: {
              field: 'fullText.suggest',
              size: 10,
              skip_duplicates: true,
              fuzzy: { fuzziness: 1 }
            }
          }
        }
      }
    }
  }
}
```

### 5.4 ResultTransformer

将 ES hits 转换为 CmxDataSet 树形层级格式：

```js
// ResultTransformer.js

/**
 * 平铺列表 → CmxDataSet 分页格式（非树形字典）
 */
export function toPagedResult(hits, total, page, pageSize) {
  return {
    rows: hits.map(h => h._source),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize)
  }
}

/**
 * 平铺列表 → CmxDataSet 树形格式（hierarchical 字典）
 *
 * 仅当 params.treeMode === true 且未指定 parentId / q 时返回完整树；
 * 否则返回平铺列表（带 path 供前端自行构树）。
 *
 * 树形结构：
 * {
 *   rows: [
 *     { id, label, level, path, children: [...], ...业务字段 },
 *     ...
 *   ],
 *   total, page, pageSize
 * }
 */
export function toTreeResult(hits, total, schema, params) {
  const rows = hits.map(h => ({ ...h._source }))

  if (!params.treeMode) {
    return { rows, total, page: params.page, pageSize: params.pageSize }
  }

  // 按 level 升序排列后构树
  rows.sort((a, b) => (a.level ?? 0) - (b.level ?? 0))

  const idField = schema.idField
  const parentField = schema.parentField
  const map = new Map(rows.map(r => [r[idField], { ...r, children: [] }]))
  const roots = []

  for (const node of map.values()) {
    const pid = node[parentField]
    if (pid && map.has(pid)) {
      map.get(pid).children.push(node)
    } else {
      roots.push(node)
    }
  }

  // 剔除空 children 数组（保持干净输出）
  const prune = (nodes) => nodes.map(n => {
    if (!n.children.length) { const { children, ...rest } = n; return rest }
    return { ...n, children: prune(n.children) }
  })

  return {
    rows: prune(roots),
    total,
    page: params.page ?? 1,
    pageSize: params.pageSize ?? total,
    treeMode: true
  }
}
```

### 5.5 dictRoutes.js

```js
// dictRoutes.js  —  注册到 Fastify
import { QueryBuilder } from './QueryBuilder.js'
import { ResultTransformer } from './ResultTransformer.js'

const qb = new QueryBuilder()

export async function registerDictRoutes(fastify, registry, esRepo) {

  // ── 单字典检索 ─────────────────────────────────────────
  fastify.post('/api/dict/:dictId/search', async (req, reply) => {
    const schema = await registry.get(req.params.dictId)
    const dsl = qb.buildSearchDsl(schema, req.body ?? {})
    const esResult = await esRepo.search(dsl)
    const hits = esResult.hits.hits
    const total = esResult.hits.total.value
    const params = req.body ?? {}

    return schema.hierarchical
      ? ResultTransformer.toTreeResult(hits, total, schema, params)
      : ResultTransformer.toPagedResult(hits, total, params.page ?? 1, params.pageSize ?? 20)
  })

  // ── 单字典自动补全 ─────────────────────────────────────
  fastify.get('/api/dict/:dictId/suggest', async (req, reply) => {
    const schema = await registry.get(req.params.dictId)
    const prefix = req.query.q ?? ''
    if (!prefix) return { suggestions: [] }
    const dsl = qb.buildSuggestDsl(schema, prefix)
    const esResult = await esRepo.search(dsl)
    const options = esResult.suggest?.dict_suggest?.[0]?.options ?? []
    return { suggestions: options.map(o => ({ text: o.text, source: o._source })) }
  })

  // ── 多字典联查 ─────────────────────────────────────────
  fastify.post('/api/dict/multi-search', async (req, reply) => {
    return multiSearch(req.body, registry, esRepo)
  })

  // ── 字典 schema 注册（管理接口）────────────────────────
  fastify.post('/api/dict/_schema', async (req, reply) => {
    await esRepo.putSchema(req.body)
    await registry.invalidate(req.body.dictId)
    return { ok: true }
  })

  // ── 字典条目写入（管理接口）────────────────────────────
  fastify.post('/api/dict/:dictId/entries', async (req, reply) => {
    const schema = await registry.get(req.params.dictId)
    const entries = Array.isArray(req.body) ? req.body : [req.body]
    const result = await esRepo.bulkUpsert(schema, entries)
    return { indexed: result.length }
  })
}
```

---

## 6 API 接口规范

### 6.1 单字典检索

```
POST /api/dict/{dictId}/search
```

**Request Body：**

```jsonc
{
  // 全文检索（模糊匹配，支持中文分词、拼音）
  "q": "货币",

  // 任意属性精确/范围/通配符过滤
  "filters": {
    "orgCode": "HQ",              // 精确匹配
    "type": ["asset", "equity"],  // IN 查询
    "name": "货*"                 // 通配符
  },

  // 树形字典：仅返回指定节点的直接子节点（null = 根节点）
  "parentId": null,

  // 树形字典：返回指定祖先节点的所有后代（含多级）
  "ancestorId": "1000",

  // 是否以树形结构返回（仅 hierarchical 字典有效）
  "treeMode": true,

  // 分页
  "page": 1,
  "pageSize": 50,

  // 排序
  "sort": { "field": "sortKey", "order": "asc" }
}
```

**Response（平铺分页）：**

```jsonc
{
  "rows": [
    { "code": "1001", "name": "货币资金", "level": 1, "path": ["1001"], ... }
  ],
  "total": 128,
  "page": 1,
  "pageSize": 50,
  "totalPages": 3
}
```

**Response（treeMode=true）：**

```jsonc
{
  "treeMode": true,
  "rows": [
    {
      "code": "1000",
      "name": "流动资产",
      "level": 1,
      "children": [
        { "code": "1001", "name": "货币资金", "level": 2 },
        { "code": "1002", "name": "交易性金融资产", "level": 2,
          "children": [
            { "code": "100201", "name": "股票", "level": 3 }
          ]
        }
      ]
    }
  ],
  "total": 45,
  "page": 1,
  "pageSize": 45
}
```

---

### 6.2 自动补全

```
GET /api/dict/{dictId}/suggest?q={前缀}
```

**Response：**

```jsonc
{
  "suggestions": [
    { "text": "货币资金", "source": { "code": "1001", "name": "货币资金" } },
    { "text": "货物运输", "source": { "code": "5031", "name": "货物运输" } }
  ]
}
```

---

### 6.3 多字典联查

```
POST /api/dict/multi-search
```

联查通过一棵 **QueryNode 树** 描述，每个节点代表一个字典，子节点代表依赖父节点结果的下级字典。

**Request Body：**

```jsonc
{
  // 全局全文检索词（应用到所有 leaf 节点）
  "q": "研发",

  // QueryNode 树
  "query": {
    "dictId": "org",                  // 先查组织机构字典
    "filters": { "type": "dept" },
    "treeMode": true,
    "select": ["code", "name"],       // 仅取这些字段用于 join
    "children": [
      {
        "dictId": "account",          // 再用 org.code 关联科目字典
        "joinOn": {
          "parentField": "orgCode",   // account 中的关联字段
          "fromField": "code"         // 从父查询结果取哪个字段
        },
        "filters": { "type": "asset" },
        "treeMode": true,
        "children": [
          {
            "dictId": "costCenter",   // 科目下再关联成本中心字典
            "joinOn": {
              "parentField": "accountCode",
              "fromField": "code"
            }
          }
        ]
      }
    ]
  }
}
```

**Response：**

```jsonc
{
  "org": {
    "rows": [
      {
        "code": "HQ", "name": "总部",
        "account": {
          "rows": [
            {
              "code": "1001", "name": "货币资金", "orgCode": "HQ",
              "costCenter": {
                "rows": [
                  { "code": "CC001", "name": "研发中心", "accountCode": "1001" }
                ],
                "total": 1
              }
            }
          ],
          "total": 12
        }
      }
    ],
    "total": 3
  }
}
```

---

## 7 前端数据适配（CmxDataSet 形式）

服务返回的 `rows` 结构与 `CmxDataSet` 的层级数据约定完全对齐：

| 服务端字段 | CmxDataSet 对应 | 说明 |
|-----------|----------------|------|
| `rows` | `ds.rows` | 数据行数组 |
| `rows[].children` | 子 DataSet 的 `rows` | 树形子节点，`CmxMasterSlave` 可直接消费 |
| `total` | 分页信息 | 用于前端分页控件 |
| `rows[].{dictId}` | 嵌套子 DataSet | 多字典联查时子字典以 dictId 为 key 嵌套 |

**前端 DictQueryClient 示例：**

```js
export class DictQueryClient {
  constructor(baseUrl = '') { this.baseUrl = baseUrl }

  async search(dictId, params = {}) {
    const res = await fetch(`${this.baseUrl}/api/dict/${dictId}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    })
    if (!res.ok) throw new Error(`Dict search failed: ${res.status}`)
    return res.json()
  }

  async multiSearch(params = {}) {
    const res = await fetch(`${this.baseUrl}/api/dict/multi-search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    })
    if (!res.ok) throw new Error(`Dict multi-search failed: ${res.status}`)
    return res.json()
  }

  /**
   * 返回值可直接赋给 CmxDataSet：
   *   const result = await client.search('account', { treeMode: true })
   *   ds.setData(result.rows)
   */
}
```

---

## 8 多字典联查方案

### 8.1 执行策略

多字典联查采用**应用层 Join**（Application-Side Join），步骤如下：

```
1. 递归遍历 QueryNode 树（广度优先）
2. 执行父节点查询，取结果中 joinOn.fromField 的全部值（去重）
3. 将该值集合注入子节点查询的 filters[joinOn.parentField] = values[]（terms 查询）
4. 递归执行子节点查询
5. 将子节点结果按 joinOn.parentField 分组，回填到父节点对应行的 childDictId 属性上
```

**适用场景：** 字典层级不超过 4 层，单层结果集不超过 1000 条（ES terms 查询上限建议 <= 1024）。

**超量处理：** 当父节点结果 > 500 条时，自动切换为**批量分页 join**：每批取 200 条父节点 ID，并发执行子查询，结果合并后回填。

### 8.2 全局 q 的传播规则

多字典联查时 `q` 参数的传播逻辑：

| 场景 | 行为 |
|------|------|
| 根节点有 `q` | 仅在根节点执行全文检索，子节点不传播 `q`（避免语义漂移） |
| 子节点自带 `q` | 使用子节点自己的 `q` |
| `propagateQ: true` | 将根 `q` 传播到所有叶节点同时检索，结果取并集后按层级回填 |

---

## 9 全文与模糊检索策略

### 9.1 检索方式对比

| 方式 | 触发条件 | ES 查询类型 | 特点 |
|------|---------|------------|------|
| 精确匹配 | `filters.field = "value"` | `term` | 毫秒级，适合 code/id |
| 前缀匹配 | `filters.field = "val*"` | `wildcard` | 适合编码前缀 |
| 全文检索 | `q = "关键词"` | `multi_match` + IK | 中文分词，语义检索 |
| 模糊匹配 | `q = "货壁资金"（错别字）` | `fuzziness: AUTO` | 容错 1-2 个字符 |
| 拼音检索 | `q = "huobi"` | `fullText` 字段含拼音 | 拼音首字母/全拼 |
| 自动补全 | suggest 接口 | `completion` | 实时补全，< 10ms |

### 9.2 fullText 字段的预处理

写入字典条目时，服务层自动生成 `fullText` 字段：

```js
// DictWriteService.js
function buildFullText(entry, schema) {
  const parts = []
  // 1. 业务字段原文
  for (const f of schema.fullTextFields) {
    if (entry[f]) parts.push(String(entry[f]))
  }
  // 2. 拼音（需引入 pinyin 库，如 pinyin-pro）
  const nameVal = entry[schema.labelField]
  if (nameVal) {
    parts.push(toPinyin(nameVal, { toneType: 'none' }))         // 全拼：huobiZijin
    parts.push(toPinyinInitials(nameVal))                        // 首字母：hbzj
  }
  return parts.join(' ')
}
```

### 9.3 IK 分词器配置建议

```json
{
  "analysis": {
    "analyzer": {
      "cmx_ik_index": {
        "type": "custom",
        "tokenizer": "ik_max_word",
        "filter": ["lowercase", "cmx_pinyin"]
      },
      "cmx_ik_search": {
        "type": "custom",
        "tokenizer": "ik_smart",
        "filter": ["lowercase", "cmx_pinyin"]
      }
    },
    "filter": {
      "cmx_pinyin": {
        "type": "pinyin",
        "keep_full_pinyin": true,
        "keep_joined_full_pinyin": true,
        "keep_original": true,
        "limit_first_letter_length": 16,
        "remove_duplicated_term": true
      }
    }
  }
}
```

> 需要 ES 安装 `analysis-ik` 和 `analysis-pinyin` 插件。

---

## 10 部署与配置

### 10.1 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `CMX_ES_URL` | `http://localhost:9200` | ES 集群地址 |
| `CMX_ES_USERNAME` | — | ES 认证用户名（可选） |
| `CMX_ES_PASSWORD` | — | ES 认证密码（可选） |
| `CMX_DICT_REGISTRY_FILE` | `cmx-node-server/data/dict/registry.json` | 字典注册文件路径（与 ES 互为备份） |
| `CMX_DICT_CACHE_TTL` | `300` | 字典 schema 内存缓存秒数 |
| `CMX_DICT_MAX_JOIN_BATCH` | `200` | 应用层 join 每批父节点 ID 数 |

### 10.2 与现有 CMXPortalManager 集成

在 `portalManagerService.js` 中增加如下注册：

```js
import { ElasticsearchRepo } from './lib/dict/ElasticsearchRepo.js'
import { DictRegistry }       from './lib/dict/DictRegistry.js'
import { registerDictRoutes } from './lib/dict/dictRoutes.js'

const esRepo = new ElasticsearchRepo({
  node: process.env.CMX_ES_URL || 'http://localhost:9200'
})
const dictRegistry = new DictRegistry(esRepo)

// 在 CMXService start 之前注册路由
registerDictRoutes(service.fastify, dictRegistry, esRepo)
```

### 10.3 字典数据初始化

提供 CLI 工具 `cmx-dict-import`，支持从 JSON / CSV 批量导入字典数据：

```bash
# 注册字典 schema
node cmx-dict-import schema --file registry/account.schema.json

# 批量导入条目（自动维护 path/level/fullText）
node cmx-dict-import entries --dict account --file data/account.json

# 从 CSV 导入
node cmx-dict-import entries --dict org --file data/org.csv --id-field code --parent-field parentCode
```

---

## 11 扩展点

### 11.1 权限过滤

在 `DictRouter` 层注入 `authFilter`，根据当前用户 token 自动追加 `filters` 条件（如只能看到自己组织下的科目）：

```js
// 伪代码
const authFilters = await getAuthFilters(req.user, dictId)
params.filters = { ...params.filters, ...authFilters }
```

### 11.2 数据字典变更订阅

字典数据变更时通过 SSE（`/sse/dict/:dictId/changes`）推送变更事件，前端 `CmxDataSet` 可监听后自动刷新。

### 11.3 离线缓存

对小体量字典（< 500 条），支持前端 `IndexedDB` 全量缓存 + 版本戳校验，首次加载后完全离线检索。

### 11.4 多租户

通过 `tenantId` 字段 + ES 索引别名实现多租户隔离，`DictRegistry` 按租户动态路由到对应索引。

---

*文档结束*
