# CMX 字典检索服务 — 后端实施方案与步骤

> 版本：1.0 · 日期：2026-05-22  
> 前置文档：`cmx-dict-service-design.md`

---

## 一、总体路线

```
阶段 1  JSON 文件存储（立即可运行，零外部依赖）
   └─ 完整实现所有 API 接口与业务逻辑
   └─ 建立「存储后端抽象层」，上层逻辑与存储完全解耦

阶段 2  Quickwit 存储后端（替换存储层，上层不变）
   └─ Quickwit 本地部署 & 索引配置
   └─ 实现 QuickwitRepo，替换 JsonFileRepo
   └─ 数据迁移工具（JSON → Quickwit）
```

全程保持**接口不变、存储可换**：所有路由、QueryBuilder、ResultTransformer、
多字典联查逻辑只写一次，换存储只换 Repo 实现。

---

## 二、最终目录结构

```
cmx-node-server/
├── lib/
│   └── dict/
│       ├── repo/
│       │   ├── IRepo.js               # 存储后端接口（JSDoc 约定）
│       │   ├── JsonFileRepo.js        # 阶段1：JSON 文件实现
│       │   └── QuickwitRepo.js        # 阶段2：Quickwit 实现
│       ├── DictRegistry.js            # 字典 schema 注册表
│       ├── QueryBuilder.js            # 查询条件 → Repo 查询参数
│       ├── ResultTransformer.js       # Repo 结果 → CmxDataSet 格式
│       ├── DictWriteService.js        # 写入条目（维护 path/level/fullText）
│       ├── MultiSearchExecutor.js     # 多字典联查执行器
│       └── dictRoutes.js              # Fastify 路由注册
├── data/
│   └── dict/
│       ├── registry.json              # 字典 schema 定义文件
│       └── entries/
│           ├── org.json               # 组织机构示例数据
│           ├── account.json           # 会计科目示例数据
│           └── costCenter.json        # 成本中心示例数据
└── portalManagerService.js            # 增加 dict 路由注册（3行）
```

---

## 三、阶段 1 详细步骤

### 步骤 1：定义存储后端抽象接口 `IRepo.js`

**目标**：所有上层逻辑只依赖此接口，换存储时只换实现。

```js
// lib/dict/repo/IRepo.js

/**
 * 存储后端抽象接口（JSDoc 约定，不使用 class 继承）
 *
 * 所有实现必须提供以下方法：
 *
 * ── Schema 管理 ──────────────────────────────────────────
 * getSchema(dictId)             → Promise<DictSchema|null>
 * putSchema(schema)             → Promise<void>
 * listSchemas()                 → Promise<DictSchema[]>
 *
 * ── 条目检索 ─────────────────────────────────────────────
 * search(dictId, query)         → Promise<SearchResult>
 *   query: {
 *     q?:          string,        // 全文/模糊
 *     filters?:    object,        // { field: value | value[] }
 *     parentId?:   string|null,   // 直接子节点（null=根）
 *     ancestorId?: string,        // 所有后代
 *     page?:       number,        // 默认 1
 *     pageSize?:   number,        // 默认 20
 *     sort?:       { field, order }
 *   }
 *   SearchResult: { hits: DictEntry[], total: number }
 *
 * ── 条目写入 ─────────────────────────────────────────────
 * upsertEntries(dictId, entries) → Promise<{ count: number }>
 *   entries: DictEntry[]（已含 path/level/fullText，由 DictWriteService 处理）
 *
 * deleteEntry(dictId, id)        → Promise<void>
 * clearEntries(dictId)           → Promise<void>
 */

export const REPO_INTERFACE_METHODS = [
  'getSchema', 'putSchema', 'listSchemas',
  'search',
  'upsertEntries', 'deleteEntry', 'clearEntries',
]

/** 运行时检查某对象是否满足 IRepo 约定 */
export function assertRepo(repo) {
  for (const m of REPO_INTERFACE_METHODS) {
    if (typeof repo[m] !== 'function') {
      throw new Error(`Repo 实现缺少方法：${m}`)
    }
  }
}
```

---

### 步骤 2：实现 `JsonFileRepo.js`

**数据文件组织：**

```
data/dict/registry.json          ← 所有字典 schema 数组
data/dict/entries/{dictId}.json  ← 每个字典的条目数组
```

**实现要点：**

- 所有写操作加文件级互斥锁（与 `htmlPagesStore.js` 保持同一模式）
- `search` 在内存中执行过滤，支持精确、通配符（`*`）、全文（字符串包含）、模糊（编辑距离 ≤ 2）
- 按需懒加载，首次读后缓存到内存，写时同时更新缓存和文件

```js
// lib/dict/repo/JsonFileRepo.js
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function dataRoot() {
  return process.env.CMX_DICT_DATA_DIR
    ? path.resolve(process.env.CMX_DICT_DATA_DIR)
    : path.join(__dirname, '..', '..', 'data', 'dict')
}

export class JsonFileRepo {
  // schema 缓存：Map<dictId, DictSchema>
  #schemas = null
  // entries 缓存：Map<dictId, DictEntry[]>
  #entries = new Map()
  // 文件锁
  #lock = Promise.resolve()

  // ── 私有工具 ──────────────────────────────────────────────────────────

  #withLock(fn) {
    const run = this.#lock.then(fn, fn)
    this.#lock = run.then(() => {}, () => {})
    return run
  }

  async #loadSchemas() {
    if (this.#schemas) return this.#schemas
    const file = path.join(dataRoot(), 'registry.json')
    try {
      const raw = await readFile(file, 'utf8')
      const arr = JSON.parse(raw)
      this.#schemas = new Map(arr.map(s => [s.dictId, s]))
    } catch (e) {
      if (e.code === 'ENOENT') this.#schemas = new Map()
      else throw e
    }
    return this.#schemas
  }

  async #saveSchemas() {
    const file = path.join(dataRoot(), 'registry.json')
    await mkdir(path.dirname(file), { recursive: true })
    const arr = [...this.#schemas.values()]
    await writeFile(file, JSON.stringify(arr, null, 2), 'utf8')
  }

  async #loadEntries(dictId) {
    if (this.#entries.has(dictId)) return this.#entries.get(dictId)
    const file = path.join(dataRoot(), 'entries', `${dictId}.json`)
    let rows = []
    try {
      const raw = await readFile(file, 'utf8')
      rows = JSON.parse(raw)
    } catch (e) {
      if (e.code !== 'ENOENT') throw e
    }
    this.#entries.set(dictId, rows)
    return rows
  }

  async #saveEntries(dictId, rows) {
    const file = path.join(dataRoot(), 'entries', `${dictId}.json`)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, JSON.stringify(rows, null, 2), 'utf8')
    this.#entries.set(dictId, rows)
  }

  // ── Schema 管理 ───────────────────────────────────────────────────────

  async getSchema(dictId) {
    const map = await this.#loadSchemas()
    return map.get(dictId) ?? null
  }

  async putSchema(schema) {
    return this.#withLock(async () => {
      const map = await this.#loadSchemas()
      map.set(schema.dictId, schema)
      await this.#saveSchemas()
    })
  }

  async listSchemas() {
    const map = await this.#loadSchemas()
    return [...map.values()]
  }

  // ── 条目检索（内存查询引擎）────────────────────────────────────────────

  async search(dictId, query = {}) {
    const rows = await this.#loadEntries(dictId)
    const schemas = await this.#loadSchemas()
    const schema = schemas.get(dictId)
    const { q, filters = {}, parentId, ancestorId, page = 1, pageSize = 20, sort } = query

    let results = rows.slice()

    // ── 树形过滤 ──────────────────────────────────────────────────────
    if (schema?.hierarchical) {
      if (parentId !== undefined) {
        if (parentId === null) {
          results = results.filter(r => !r[schema.parentField] && r[schema.parentField] !== 0)
        } else {
          results = results.filter(r => String(r[schema.parentField]) === String(parentId))
        }
      }
      if (ancestorId !== undefined) {
        results = results.filter(r =>
          Array.isArray(r.path) && r.path.map(String).includes(String(ancestorId))
        )
      }
    }

    // ── 属性条件过滤 ─────────────────────────────────────────────────
    for (const [field, value] of Object.entries(filters)) {
      if (value === null || value === undefined || value === '') continue
      if (Array.isArray(value)) {
        const set = new Set(value.map(String))
        results = results.filter(r => set.has(String(r[field] ?? '')))
      } else if (typeof value === 'string' && value.includes('*')) {
        const re = new RegExp('^' + value.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$', 'i')
        results = results.filter(r => re.test(String(r[field] ?? '')))
      } else {
        results = results.filter(r => String(r[field] ?? '') === String(value))
      }
    }

    // ── 全文 / 模糊检索 ───────────────────────────────────────────────
    if (q && q.trim()) {
      const term = q.trim().toLowerCase()
      results = results.filter(r => {
        const ft = String(r.fullText || Object.values(r).join(' ')).toLowerCase()
        // 包含匹配（含拼音）
        if (ft.includes(term)) return true
        // 简易模糊：编辑距离 ≤ 2（仅对短词，避免过度匹配）
        if (term.length >= 2 && term.length <= 6) return levenshtein(ft, term) <= 2
        return false
      })
    }

    // ── 排序 ─────────────────────────────────────────────────────────
    const sortField = sort?.field ?? 'sortKey'
    const sortOrder = sort?.order === 'desc' ? -1 : 1
    results.sort((a, b) => {
      const av = String(a[sortField] ?? '')
      const bv = String(b[sortField] ?? '')
      return av < bv ? -sortOrder : av > bv ? sortOrder : 0
    })

    // ── 分页 ─────────────────────────────────────────────────────────
    const total = results.length
    const from = (page - 1) * pageSize
    const hits = results.slice(from, from + pageSize)

    return { hits, total }
  }

  // ── 条目写入 ──────────────────────────────────────────────────────────

  async upsertEntries(dictId, entries) {
    return this.#withLock(async () => {
      const rows = await this.#loadEntries(dictId)
      const schema = (await this.#loadSchemas()).get(dictId)
      const idField = schema?.idField ?? 'id'
      const map = new Map(rows.map(r => [String(r[idField]), r]))
      for (const e of entries) {
        map.set(String(e[idField]), e)
      }
      const next = [...map.values()]
      await this.#saveEntries(dictId, next)
      return { count: entries.length }
    })
  }

  async deleteEntry(dictId, id) {
    return this.#withLock(async () => {
      const rows = await this.#loadEntries(dictId)
      const schema = (await this.#loadSchemas()).get(dictId)
      const idField = schema?.idField ?? 'id'
      const next = rows.filter(r => String(r[idField]) !== String(id))
      await this.#saveEntries(dictId, next)
    })
  }

  async clearEntries(dictId) {
    return this.#withLock(async () => {
      await this.#saveEntries(dictId, [])
    })
  }
}

// ── 工具：简易 Levenshtein（仅用于短词模糊） ─────────────────────────────
function levenshtein(text, pattern) {
  if (text.includes(pattern)) return 0
  if (pattern.length > text.length) return pattern.length
  let prev = Array.from({ length: pattern.length + 1 }, (_, i) => i)
  for (let i = 0; i < Math.min(text.length, 200); i++) {
    const curr = [i + 1]
    for (let j = 0; j < pattern.length; j++) {
      curr.push(text[i] === pattern[j]
        ? prev[j]
        : 1 + Math.min(prev[j], prev[j + 1], curr[j]))
    }
    if (Math.min(...curr) > 2) return 3  // 提前退出
    prev = curr
  }
  return prev[pattern.length]
}
```

---

### 步骤 3：实现 `DictWriteService.js`

**职责**：写入前计算并填充 `path`、`level`、`sortKey`、`fullText`，封装拼音生成（可选）。

```js
// lib/dict/DictWriteService.js

export class DictWriteService {
  #repo

  constructor(repo) { this.#repo = repo }

  /**
   * 写入条目数组，自动维护树形辅助字段
   * @param {string} dictId
   * @param {object[]} rawEntries   原始业务数据
   * @param {boolean} [rebuild]    true = 全量重建（重新计算所有条目的 path/level）
   */
  async upsert(dictId, rawEntries, rebuild = false) {
    const schema = await this.#repo.getSchema(dictId)
    if (!schema) throw Object.assign(new Error(`字典 ${dictId} 未注册`), { statusCode: 404 })

    const idField    = schema.idField    ?? 'id'
    const parentField = schema.parentField ?? 'parentId'
    const labelField = schema.labelField ?? 'name'

    if (rebuild) {
      // 全量重建：加载全部已有条目 + 本次新条目，重新计算所有 path/level
      const { hits: existing } = await this.#repo.search(dictId, { pageSize: 99999 })
      const merged = mergeById(existing, rawEntries, idField)
      const enriched = buildTreeFields(merged, idField, parentField)
        .map(e => this.#enrichFullText(e, schema, labelField))
      return this.#repo.upsertEntries(dictId, enriched)
    }

    // 增量：仅处理本次条目，path/level 依赖父节点已有数据
    const parentIds = [...new Set(rawEntries.map(e => e[parentField]).filter(Boolean))]
    const { hits: parents } = parentIds.length
      ? await this.#repo.search(dictId, { filters: { [idField]: parentIds }, pageSize: 9999 })
      : { hits: [] }
    const parentMap = new Map(parents.map(p => [String(p[idField]), p]))

    const enriched = rawEntries.map(e => {
      const parent = parentMap.get(String(e[parentField] ?? ''))
      const level  = parent ? (parent.level ?? 1) + 1 : 1
      const path   = parent ? [...(parent.path ?? [parent[idField]]), String(e[idField])] : [String(e[idField])]
      return this.#enrichFullText({ ...e, level, path, pathStr: path.join('/'), sortKey: e.sortKey ?? String(e[idField]) }, schema, labelField)
    })
    return this.#repo.upsertEntries(dictId, enriched)
  }

  #enrichFullText(entry, schema, labelField) {
    const parts = []
    for (const f of (schema.fullTextFields ?? [labelField, schema.idField])) {
      if (entry[f] != null) parts.push(String(entry[f]))
    }
    // 拼音：如项目已安装 pinyin-pro，取消注释
    // const nameVal = entry[labelField]
    // if (nameVal) {
    //   const { pinyin } = await import('pinyin-pro')
    //   parts.push(pinyin(nameVal, { toneType: 'none', separator: '' }))
    //   parts.push(pinyin(nameVal, { pattern: 'first', separator: '' }))
    // }
    return { ...entry, fullText: parts.join(' ') }
  }
}

// ── 工具 ──────────────────────────────────────────────────────────────────

function mergeById(existing, incoming, idField) {
  const map = new Map(existing.map(r => [String(r[idField]), r]))
  for (const e of incoming) map.set(String(e[idField]), e)
  return [...map.values()]
}

function buildTreeFields(rows, idField, parentField) {
  // 拓扑排序：父节点先于子节点处理
  const map = new Map(rows.map(r => [String(r[idField]), { ...r }]))
  const result = []
  const visited = new Set()

  function visit(id) {
    if (visited.has(id)) return
    visited.add(id)
    const node = map.get(id)
    if (!node) return
    const pid = node[parentField]
    if (pid && map.has(String(pid))) visit(String(pid))
    const parent = pid ? map.get(String(pid)) : null
    node.level   = parent ? (parent.level ?? 1) + 1 : 1
    node.path    = parent ? [...(parent.path ?? [String(pid)]), id] : [id]
    node.pathStr = node.path.join('/')
    node.sortKey = node.sortKey ?? id
    result.push(node)
  }

  for (const id of map.keys()) visit(id)
  return result
}
```

---

### 步骤 4：实现 `DictRegistry.js`

```js
// lib/dict/DictRegistry.js

export class DictRegistry {
  #cache = new Map()
  #repo
  #ttlMs

  constructor(repo, ttlSeconds = 300) {
    this.#repo  = repo
    this.#ttlMs = ttlSeconds * 1000
  }

  async get(dictId) {
    const cached = this.#cache.get(dictId)
    if (cached && Date.now() - cached.ts < this.#ttlMs) return cached.schema

    const schema = await this.#repo.getSchema(dictId)
    if (!schema) {
      const e = new Error(`字典 "${dictId}" 未注册`); e.statusCode = 404; throw e
    }
    this.#cache.set(dictId, { schema, ts: Date.now() })
    return schema
  }

  async list() {
    return this.#repo.listSchemas()
  }

  async register(schema) {
    await this.#repo.putSchema(schema)
    this.#cache.delete(schema.dictId)
  }

  invalidate(dictId) {
    if (dictId) this.#cache.delete(dictId)
    else this.#cache.clear()
  }
}
```

---

### 步骤 5：实现 `ResultTransformer.js`

```js
// lib/dict/ResultTransformer.js

export const ResultTransformer = {

  toPagedResult(hits, total, page, pageSize) {
    return {
      rows: hits,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    }
  },

  toTreeResult(hits, total, schema, params) {
    const { page = 1, pageSize = total || 1, treeMode } = params
    if (!treeMode) {
      return { rows: hits, total, page, pageSize, totalPages: Math.ceil(total / pageSize) }
    }

    const idField     = schema.idField     ?? 'id'
    const parentField = schema.parentField ?? 'parentId'

    // 按 level 升序排后构树
    const sorted = hits.slice().sort((a, b) => (a.level ?? 0) - (b.level ?? 0))
    const map    = new Map(sorted.map(r => [String(r[idField]), { ...r, children: [] }]))
    const roots  = []

    for (const node of map.values()) {
      const pid = node[parentField]
      if (pid != null && pid !== '' && map.has(String(pid))) {
        map.get(String(pid)).children.push(node)
      } else {
        roots.push(node)
      }
    }

    return {
      treeMode: true,
      rows: pruneEmptyChildren(roots),
      total,
      page,
      pageSize,
    }
  },
}

function pruneEmptyChildren(nodes) {
  return nodes.map(n => {
    if (!n.children?.length) {
      const { children, ...rest } = n
      return rest
    }
    return { ...n, children: pruneEmptyChildren(n.children) }
  })
}
```

---

### 步骤 6：实现 `MultiSearchExecutor.js`

```js
// lib/dict/MultiSearchExecutor.js

const MAX_JOIN_BATCH = Number(process.env.CMX_DICT_MAX_JOIN_BATCH || 200)

export class MultiSearchExecutor {
  #repo
  #registry
  #transformer

  constructor(repo, registry, transformer) {
    this.#repo        = repo
    this.#registry    = registry
    this.#transformer = transformer
  }

  /**
   * 执行多字典联查
   * @param {object} body  - { q?, query: QueryNode }
   * @returns {Promise<object>}
   */
  async execute(body) {
    const { q, query: rootNode, propagateQ = false } = body
    const result = await this.#executeNode(rootNode, q, propagateQ, null)
    return { [rootNode.dictId]: result }
  }

  async #executeNode(node, globalQ, propagateQ, parentJoinValues) {
    const schema = await this.#registry.get(node.dictId)
    const { filters = {}, treeMode, select, parentId, ancestorId,
            page = 1, pageSize = 50, sort, q: nodeQ } = node

    // 注入父节点 join 条件
    const effectiveFilters = { ...filters }
    if (node.joinOn && parentJoinValues?.length) {
      effectiveFilters[node.joinOn.parentField] = parentJoinValues
    }

    // 全文 q 决策：节点自带 > propagate > 不传
    const effectiveQ = nodeQ ?? (propagateQ ? globalQ : undefined)

    const query = {
      q: effectiveQ, filters: effectiveFilters, parentId, ancestorId,
      page, pageSize, sort,
    }
    const { hits, total } = await this.#repo.search(node.dictId, query)

    // 处理子字典
    const childNodes = Array.isArray(node.children) ? node.children : []
    let enrichedHits = hits

    if (childNodes.length) {
      enrichedHits = await this.#joinChildren(hits, childNodes, schema, globalQ, propagateQ)
    }

    const result = schema.hierarchical && treeMode
      ? this.#transformer.toTreeResult(enrichedHits, total, schema, { page, pageSize, treeMode })
      : this.#transformer.toPagedResult(enrichedHits, total, page, pageSize)

    // select：只保留指定字段（join 后不影响子字典结果）
    if (Array.isArray(select) && select.length) {
      result.rows = result.rows.map(r => {
        const picked = {}
        for (const f of select) if (f in r) picked[f] = r[f]
        // 保留子字典结果
        for (const cn of childNodes) if (cn.dictId in r) picked[cn.dictId] = r[cn.dictId]
        return picked
      })
    }

    return result
  }

  async #joinChildren(parentHits, childNodes, parentSchema, globalQ, propagateQ) {
    return Promise.all(
      childNodes.map(async childNode => {
        const fromField = childNode.joinOn?.fromField ?? parentSchema.idField ?? 'id'
        const joinValues = [...new Set(parentHits.map(r => r[fromField]).filter(v => v != null).map(String))]

        if (!joinValues.length) {
          // 无父节点值，子查询跳过，每行子字典置为空
          return parentHits.map(r => ({ ...r, [childNode.dictId]: { rows: [], total: 0 } }))
        }

        // 分批执行（避免 join 值过多）
        const batches = []
        for (let i = 0; i < joinValues.length; i += MAX_JOIN_BATCH) {
          batches.push(joinValues.slice(i, i + MAX_JOIN_BATCH))
        }

        // 并发执行各批
        const batchResults = await Promise.all(
          batches.map(batch => this.#executeNode(
            { ...childNode, pageSize: 9999 },
            globalQ, propagateQ, batch
          ))
        )

        // 合并所有批次 rows
        const allChildRows = batchResults.flatMap(r => r.rows ?? [])

        // 按父节点的 fromField 值分组回填
        const childField = childNode.joinOn?.parentField ?? 'parentId'
        const grouped = new Map()
        for (const cr of allChildRows) {
          const key = String(cr[childField] ?? '')
          if (!grouped.has(key)) grouped.set(key, [])
          grouped.get(key).push(cr)
        }

        return parentHits.map(r => {
          const key = String(r[fromField] ?? '')
          const childRows = grouped.get(key) ?? []
          return {
            ...r,
            [childNode.dictId]: { rows: childRows, total: childRows.length }
          }
        })
      })
    ).then(results => {
      // 多个子字典的结果合并到同一个父行上
      if (!results.length) return parentHits
      return parentHits.map((r, i) => {
        let merged = r
        for (const childResult of results) merged = { ...merged, ...childResult[i] }
        return merged
      })
    })
  }
}
```

---

### 步骤 7：实现 `dictRoutes.js`

```js
// lib/dict/dictRoutes.js
import { DictWriteService }     from './DictWriteService.js'
import { MultiSearchExecutor }  from './MultiSearchExecutor.js'
import { ResultTransformer }    from './ResultTransformer.js'

export function registerDictRoutes(fastify, registry, repo) {
  const writer   = new DictWriteService(repo)
  const executor = new MultiSearchExecutor(repo, registry, ResultTransformer)

  // ── 单字典检索 ────────────────────────────────────────────────────────
  fastify.post('/api/dict/:dictId/search', async (req, reply) => {
    try {
      const schema = await registry.get(req.params.dictId)
      const params = req.body ?? {}
      const { hits, total } = await repo.search(req.params.dictId, params)
      return schema.hierarchical && params.treeMode
        ? ResultTransformer.toTreeResult(hits, total, schema, params)
        : ResultTransformer.toPagedResult(hits, total, params.page ?? 1, params.pageSize ?? 20)
    } catch (e) { return reply.code(e.statusCode || 500).send({ error: e.message }) }
  })

  // ── 自动补全（简单前缀匹配，Quickwit 阶段升级为 completion） ──────────
  fastify.get('/api/dict/:dictId/suggest', async (req, reply) => {
    try {
      const schema = await registry.get(req.params.dictId)
      const q = (req.query.q ?? '').trim()
      if (!q) return { suggestions: [] }
      const labelField = schema.labelField ?? 'name'
      const { hits } = await repo.search(req.params.dictId, { q, pageSize: 10 })
      return {
        suggestions: hits.map(h => ({ text: h[labelField], source: h }))
      }
    } catch (e) { return reply.code(e.statusCode || 500).send({ error: e.message }) }
  })

  // ── 多字典联查 ────────────────────────────────────────────────────────
  fastify.post('/api/dict/multi-search', async (req, reply) => {
    try {
      return await executor.execute(req.body ?? {})
    } catch (e) { return reply.code(e.statusCode || 500).send({ error: e.message }) }
  })

  // ── Schema 注册 / 查询 ───────────────────────────────────────────────
  fastify.get('/api/dict/_schemas', async (_req, reply) => {
    try { return { schemas: await registry.list() } }
    catch (e) { return reply.code(e.statusCode || 500).send({ error: e.message }) }
  })

  fastify.post('/api/dict/_schema', async (req, reply) => {
    try {
      await registry.register(req.body)
      return { ok: true, dictId: req.body.dictId }
    } catch (e) { return reply.code(e.statusCode || 500).send({ error: e.message }) }
  })

  // ── 条目写入 ─────────────────────────────────────────────────────────
  fastify.post('/api/dict/:dictId/entries', async (req, reply) => {
    try {
      const entries = Array.isArray(req.body) ? req.body : [req.body]
      const rebuild = req.query.rebuild === 'true'
      const result  = await writer.upsert(req.params.dictId, entries, rebuild)
      return result
    } catch (e) { return reply.code(e.statusCode || 500).send({ error: e.message }) }
  })

  fastify.delete('/api/dict/:dictId/entries/:id', async (req, reply) => {
    try {
      await repo.deleteEntry(req.params.dictId, req.params.id)
      return { ok: true }
    } catch (e) { return reply.code(e.statusCode || 500).send({ error: e.message }) }
  })
}
```

---

### 步骤 8：在 `portalManagerService.js` 注册路由

在文件头部 import 区末尾追加三行：

```js
import { JsonFileRepo }       from './lib/dict/repo/JsonFileRepo.js'
import { DictRegistry }       from './lib/dict/DictRegistry.js'
import { registerDictRoutes } from './lib/dict/dictRoutes.js'
```

在 `const rest = service.register(RestPlugin, ...)` 之前追加：

```js
const dictRepo     = new JsonFileRepo()
const dictRegistry = new DictRegistry(dictRepo)
registerDictRoutes(app, dictRegistry, dictRepo)  // app = service.fastify
```

---

### 步骤 9：准备示例数据

**`data/dict/registry.json`**

```json
[
  {
    "dictId": "org",
    "label": "组织机构",
    "hierarchical": true,
    "idField": "code",
    "parentField": "parentCode",
    "labelField": "name",
    "fullTextFields": ["code", "name"],
    "filterFields": ["type", "level", "parentCode"]
  },
  {
    "dictId": "account",
    "label": "会计科目",
    "hierarchical": true,
    "idField": "code",
    "parentField": "parentCode",
    "labelField": "name",
    "fullTextFields": ["code", "name"],
    "filterFields": ["orgCode", "type", "level", "parentCode"]
  },
  {
    "dictId": "costCenter",
    "label": "成本中心",
    "hierarchical": false,
    "idField": "code",
    "parentField": null,
    "labelField": "name",
    "fullTextFields": ["code", "name"],
    "filterFields": ["accountCode", "orgCode"]
  }
]
```

**`data/dict/entries/org.json`**（片段，`DictWriteService` 导入后自动补全 path/level）

```json
[
  { "code": "HQ",     "name": "总部",     "parentCode": null,  "type": "group",  "sortKey": "001" },
  { "code": "HQ-FIN", "name": "财务部",   "parentCode": "HQ",  "type": "dept",   "sortKey": "001001" },
  { "code": "HQ-IT",  "name": "信息技术部","parentCode": "HQ",  "type": "dept",   "sortKey": "001002" },
  { "code": "BJ",     "name": "北京分公司","parentCode": null,  "type": "branch", "sortKey": "002" }
]
```

---

## 四、阶段 2 — 接入 Quickwit

### 步骤 10：了解 Quickwit 与 ES 的关键差异

| 维度 | Elasticsearch | Quickwit |
|------|--------------|---------|
| 语言 | Java / JVM | Rust，内存占用低 10x+ |
| 写入模型 | 近实时（1s）| 提交式（commit），写后不立即可查 |
| API 风格 | REST JSON | REST JSON，兼容 ES 检索语法子集 |
| Query DSL | 完整 ES DSL | 支持 `match`、`term`、`terms`、`bool`、`range`、`query_string` |
| 全文分析 | 插件化 Analyzer | 内置 `default`、`chinese`（CJK bigram）等，不支持 IK |
| Completion | ✓ | ✗（需前端自行实现前缀过滤） |
| 索引创建 | PUT mapping | PUT `/api/v1/indexes`（DocMapper YAML/JSON） |
| 批量写入 | `_bulk` API | `POST /api/v1/{index}/ingest` |
| 查询入口 | `POST /{index}/_search` | `POST /api/v1/{index}/search` |

> **重要**：Quickwit 中文全文分析使用 CJK bigram（字符级二元组），不依赖 IK 插件，
> 对中文词语检索效果略逊于 IK，但对于字典检索场景（通常是精确或短词匹配）完全够用。

### 步骤 11：Quickwit 索引配置

每个字典对应一个 Quickwit 索引，创建时 `PUT /api/v1/indexes`：

```json
{
  "version": "0.7",
  "index_id": "cmx_dict_account",
  "doc_mapping": {
    "field_mappings": [
      { "name": "dictId",     "type": "text",    "tokenizer": "raw",    "indexed": true },
      { "name": "code",       "type": "text",    "tokenizer": "raw",    "indexed": true, "stored": true },
      { "name": "name",       "type": "text",    "tokenizer": "default","indexed": true, "stored": true },
      { "name": "parentCode", "type": "text",    "tokenizer": "raw",    "indexed": true },
      { "name": "level",      "type": "u64",     "indexed": true },
      { "name": "path",       "type": "array<text>", "tokenizer": "raw","indexed": true },
      { "name": "pathStr",    "type": "text",    "tokenizer": "raw",    "indexed": true },
      { "name": "sortKey",    "type": "text",    "tokenizer": "raw",    "indexed": true, "fast": true },
      { "name": "orgCode",    "type": "text",    "tokenizer": "raw",    "indexed": true },
      { "name": "type",       "type": "text",    "tokenizer": "raw",    "indexed": true },
      { "name": "fullText",   "type": "text",    "tokenizer": "chinese","indexed": true }
    ],
    "dynamic_mapping": { "indexed": false, "stored": true, "tokenizer": "raw" }
  },
  "search_settings": { "default_search_fields": ["fullText", "name"] },
  "indexing_settings": { "commit_timeout_secs": 5 }
}
```

> `commit_timeout_secs: 5` 让写入 5 秒内可查，适合字典数据（写少读多）。

### 步骤 12：实现 `QuickwitRepo.js`

与 `JsonFileRepo` 实现**相同接口**，内部调用 Quickwit REST API：

```js
// lib/dict/repo/QuickwitRepo.js

const QW_BASE   = () => (process.env.CMX_QW_URL   || 'http://localhost:7280')
const QW_PREFIX = 'cmx_dict_'

export class QuickwitRepo {

  // ── 工具 ──────────────────────────────────────────────────────────────

  async #qwFetch(method, path, body) {
    const url = `${QW_BASE()}${path}`
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body != null ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
      const text = await res.text()
      throw Object.assign(new Error(`Quickwit ${method} ${path} → ${res.status}: ${text}`), { statusCode: res.status })
    }
    return res.json()
  }

  #indexId(dictId)    { return `${QW_PREFIX}${dictId}` }
  #registryIndexId()  { return `${QW_PREFIX}registry` }

  // ── Schema 管理（存储在 cmx_dict_registry 索引）────────────────────────

  async getSchema(dictId) {
    try {
      const result = await this.#qwFetch('POST',
        `/api/v1/${this.#registryIndexId()}/search`,
        { query: `dictId:"${dictId}"`, max_hits: 1 }
      )
      return result.hits?.[0] ?? null
    } catch (e) {
      if (e.statusCode === 404) return null
      throw e
    }
  }

  async putSchema(schema) {
    const ndjson = JSON.stringify(schema) + '\n'
    await this.#qwFetch('POST', `/api/v1/${this.#registryIndexId()}/ingest`, ndjson)
  }

  async listSchemas() {
    const result = await this.#qwFetch('POST',
      `/api/v1/${this.#registryIndexId()}/search`,
      { query: '*', max_hits: 500 }
    )
    return result.hits ?? []
  }

  // ── 条目检索 ──────────────────────────────────────────────────────────

  async search(dictId, query = {}) {
    const { q, filters = {}, parentId, ancestorId, page = 1, pageSize = 20, sort } = query

    // 构造 Quickwit query_string
    const clauses = []

    if (q?.trim()) clauses.push(`fullText:${q.trim()}`)

    for (const [field, value] of Object.entries(filters)) {
      if (value === null || value === undefined || value === '') continue
      if (Array.isArray(value)) {
        clauses.push(`(${value.map(v => `${field}:"${v}"`).join(' OR ')})`)
      } else if (typeof value === 'string' && value.includes('*')) {
        clauses.push(`${field}:${value}`)
      } else {
        clauses.push(`${field}:"${value}"`)
      }
    }

    if (parentId !== undefined) {
      if (parentId === null) {
        clauses.push('NOT _exists_:parentCode')
      } else {
        clauses.push(`parentCode:"${parentId}"`)
      }
    }

    if (ancestorId !== undefined) {
      clauses.push(`path:"${ancestorId}"`)
    }

    const qStr = clauses.length ? clauses.join(' AND ') : '*'

    const body = {
      query: qStr,
      max_hits: pageSize,
      start_offset: (page - 1) * pageSize,
      sort_by: sort?.field ?? 'sortKey',
    }

    const result = await this.#qwFetch('POST',
      `/api/v1/${this.#indexId(dictId)}/search`, body
    )

    return {
      hits: result.hits ?? [],
      total: result.num_hits ?? 0,
    }
  }

  // ── 条目写入 ──────────────────────────────────────────────────────────

  async upsertEntries(dictId, entries) {
    const ndjson = entries.map(e => JSON.stringify(e)).join('\n') + '\n'
    await this.#qwFetch('POST', `/api/v1/${this.#indexId(dictId)}/ingest?commit=force`, ndjson)
    return { count: entries.length }
  }

  async deleteEntry(dictId, id) {
    // Quickwit 通过 delete task 实现，异步删除
    await this.#qwFetch('POST', `/api/v1/${this.#indexId(dictId)}/delete-tasks`,
      { query: `_id:"${id}"` }
    )
  }

  async clearEntries(dictId) {
    // 重建索引（先删后建）是最快的清空方式
    try { await this.#qwFetch('DELETE', `/api/v1/indexes/${this.#indexId(dictId)}`) } catch (_) {}
    // 自动创建逻辑由调用方或管理 API 负责（本实现中 schema 提前由 CLI 工具建好）
  }
}
```

### 步骤 13：数据迁移工具

```
cmx-node-server/scripts/dict-migrate-to-qw.js
```

```js
// 用法：node scripts/dict-migrate-to-qw.js
import { JsonFileRepo }  from '../lib/dict/repo/JsonFileRepo.js'
import { QuickwitRepo }  from '../lib/dict/repo/QuickwitRepo.js'

const src = new JsonFileRepo()
const dst = new QuickwitRepo()

const schemas = await src.listSchemas()
for (const schema of schemas) {
  console.log(`迁移字典：${schema.dictId}`)
  await dst.putSchema(schema)

  let page = 1
  while (true) {
    const { hits, total } = await src.search(schema.dictId, { page, pageSize: 500 })
    if (!hits.length) break
    await dst.upsertEntries(schema.dictId, hits)
    console.log(`  已写入 ${Math.min(page * 500, total)} / ${total}`)
    if (page * 500 >= total) break
    page++
  }
}
console.log('迁移完成')
```

### 步骤 14：运行时切换 Repo

在 `portalManagerService.js` 中根据环境变量选择 Repo：

```js
import { JsonFileRepo }  from './lib/dict/repo/JsonFileRepo.js'
import { QuickwitRepo }  from './lib/dict/repo/QuickwitRepo.js'

const dictRepo = process.env.CMX_DICT_BACKEND === 'quickwit'
  ? new QuickwitRepo()
  : new JsonFileRepo()
```

切换命令：

```bash
# 使用 JSON 文件（默认）
node cmx-node-server/portalManagerService.js

# 切换到 Quickwit
CMX_DICT_BACKEND=quickwit node cmx-node-server/portalManagerService.js
```

---

## 五、执行顺序总览

```
阶段 1 — JSON 文件存储（顺序执行）
  步骤 1  lib/dict/repo/IRepo.js              接口约定
  步骤 2  lib/dict/repo/JsonFileRepo.js       JSON 存储实现
  步骤 3  lib/dict/DictWriteService.js        path/level/fullText 维护
  步骤 4  lib/dict/DictRegistry.js            schema 缓存注册表
  步骤 5  lib/dict/ResultTransformer.js       结果转换（分页 / 树形）
  步骤 6  lib/dict/MultiSearchExecutor.js     多字典联查
  步骤 7  lib/dict/dictRoutes.js              Fastify 路由注册
  步骤 8  portalManagerService.js             3 行接入
  步骤 9  data/dict/registry.json + entries/  示例数据

阶段 2 — 接入 Quickwit（在阶段 1 完成后）
  步骤 10 理解 Quickwit vs ES 差异
  步骤 11 配置 Quickwit 索引（cmx_dict_{dictId}）
  步骤 12 lib/dict/repo/QuickwitRepo.js       Quickwit 存储实现
  步骤 13 scripts/dict-migrate-to-qw.js       JSON → Quickwit 迁移
  步骤 14 portalManagerService.js             环境变量切换
```

---

## 六、关键设计决策说明

| 决策 | 原因 |
|------|------|
| IRepo 接口抽象 | 两个阶段共用全部业务逻辑，切换存储改一行环境变量 |
| path 数组字段 | 树形祖先/后代查询 O(1)，无需递归 SQL，在 JSON 和 Quickwit 中均高效 |
| fullText 预处理 | 避免查询时多字段联合计算，拼音在写入时一次性处理 |
| 应用层 Join | Quickwit 不支持 join 查询，统一用应用层实现，两阶段行为一致 |
| commit=force | Quickwit 写字典数据后立即提交，满足字典管理的实时性要求 |
| 无 completion API | Quickwit 无原生 completion，suggest 接口降级为全文前缀，足够字典场景 |

---

*文档结束*
