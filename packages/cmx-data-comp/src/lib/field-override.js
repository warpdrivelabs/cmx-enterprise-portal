/**
 * field-override — DCT/DOC 引用字段的「字段级 overlay」（领域无关、纯函数，编辑器侧）
 *
 * 详见 docs/dct-doc-field-override-design.md。DCT/DOC 引用 base 元数据字段集后，本模块让「字典/单据
 * 定义编辑器」能对引用来的字段做详细覆盖设置。
 *
 * 存储决策（已定）：**存物化，展开只在编辑器内**。
 *   - 磁盘：保存时把覆盖「物化」进字段定义——被覆盖的引用字段落成完整内联字段（带 `_materializedFrom`
 *     标记供加载逆物化识别），删除 fieldOverrides/fieldRefDicts。运行时消费方拿到完整字段，无需展开逻辑。
 *   - 编辑器：加载时临时展开（引用字段 base ⊕ 表上暂存的覆盖）供 UI 显示/编辑；覆盖以 delta 暂存在
 *     内存工作态，保存时物化。
 *
 * 与 flc-overlay 同构：复用同一套 deepMerge 语义（覆盖/递归/null 删除/'key+' 追加）。额外处理：
 *   - 限定键消歧：两个 fieldSet 含同 id 字段时，键写 `<fieldSetName>.<fieldId>`；裸 fieldId 为通配。
 *   - fieldRefDicts 归并：旧 `{ fieldId → refDict }` 视作 `{ fieldId: { refDict } }` 并入（新 override 优先）。
 *
 * 主要 API：
 *   deepMerge(base, over)                                   见 flc-overlay，等价复用导出
 *   normalizeFieldOverrides(overridesRaw, fieldRefDicts)    -> { byId, byQualified }（含旧 fieldRefDicts 归并）
 *   overrideForField(overrides, fieldId, fieldSetName)      -> 覆盖对象 | null（限定优先于裸键）
 *   effectiveField(baseField, override)                     -> 新字段对象（base ⊕ override）
 *   diffOverride(baseField, editedField)                    -> 覆盖 delta | null（编辑器算增量用）
 *   materializeTable(table, resolveSetFields, listSetNames) -> table'（存时物化：覆盖字段落内联 + `_materializedFrom` 标记，删覆盖键）
 *   dematerializeTable(table, resolveSetFields, listSetNames) -> table'（加载时逆物化：标记字段按 base 求 delta 重建 fieldOverrides）
 */
import { deepMerge } from './flc-overlay.js'
import { fieldId as metaFieldId } from './cmx-field-meta.js'

export { deepMerge }

/** 深比较（用于 diff/冗余判定）。 */
function jsonEq (a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

/**
 * 归一 fieldOverrides（含旧 fieldRefDicts 兼容归并）。
 * @param {object} overridesRaw  表上的 fieldOverrides 对象
 * @param {object} [fieldRefDicts]  旧 { fieldId → refDict } 映射（兼容）
 * @returns {{ byId: Map<string,object>, byQualified: Map<string,object> }}
 */
export function normalizeFieldOverrides (overridesRaw, fieldRefDicts) {
  const byId = new Map()
  const byQualified = new Map()

  // 旧 fieldRefDicts 低优先：先铺
  if (fieldRefDicts && typeof fieldRefDicts === 'object') {
    for (const [fid, refDict] of Object.entries(fieldRefDicts)) {
      if (refDict != null && refDict !== '') byId.set(fid, { refDict })
    }
  }
  // 新 fieldOverrides：裸键 / 限定键（含 '.'）。裸键与 fieldRefDicts 归并（override 优先）。
  if (overridesRaw && typeof overridesRaw === 'object') {
    for (const [key, ov] of Object.entries(overridesRaw)) {
      if (!ov || typeof ov !== 'object') continue
      if (key.includes('.')) byQualified.set(key, ov)
      else byId.set(key, byId.has(key) ? deepMerge(byId.get(key), ov) : ov)
    }
  }
  return { byId, byQualified }
}

/**
 * 取某字段的有效覆盖：限定键 `<setName>.<fieldId>` 优先于裸 `fieldId`；两者都有则深合并（限定优先）。
 */
export function overrideForField (overrides, fieldId, fieldSetName) {
  if (!overrides) return null
  const bare = overrides.byId.get(fieldId) || null
  const qualified = fieldSetName ? (overrides.byQualified.get(`${fieldSetName}.${fieldId}`) || null) : null
  if (bare && qualified) return deepMerge(bare, qualified)
  return qualified || bare
}

/** 有效字段 = base ⊕ override（不改 base）。override 空则返回 base 本身。 */
export function effectiveField (baseField, override) {
  return override ? deepMerge(baseField, override) : baseField
}

/**
 * 编辑器算增量：给定 base 字段与用户编辑后的整字段，产出最小覆盖 delta（仅含与 base 不同的顶层键）。
 * 顶层键值不同即整键纳入 delta（不做深层最小化，简单可控）；完全相同返回 null（无覆盖）。
 * base 有而 edited 无的键 → 记为删除（delta[key] = null）。
 * @returns {object|null}
 */
export function diffOverride (baseField, editedField) {
  if (!editedField || typeof editedField !== 'object') return null
  const b = baseField && typeof baseField === 'object' ? baseField : {}
  const delta = {}
  for (const k of Object.keys(editedField)) {
    if (!jsonEq(editedField[k], b[k])) delta[k] = editedField[k]
  }
  for (const k of Object.keys(b)) {
    if (!(k in editedField)) delta[k] = null  // 删除语义
  }
  return Object.keys(delta).length ? delta : null
}

/**
 * 存时物化：把覆盖应用到引用字段，产出「覆盖字段已内联」的表副本，并删除 fieldOverrides/fieldRefDicts。
 * 未覆盖的引用字段**不物化**（继续走 fieldSet 引用，保 base 单一事实源）；仅被覆盖的落成内联字段。
 *
 * @param {object} table  原始表对象（含 fieldOverrides / 旧 fieldRefDicts）
 * @param {(setName:string)=>object[]} resolveSetFields  取某 fieldSet 的 base 字段数组
 * @param {(table:object)=>string[]} listSetNames  取该表引用的 fieldSet 名（有序）
 * @returns {object}  新表
 */
export function materializeTable (table, resolveSetFields, listSetNames) {
  if (!table || typeof table !== 'object') return table
  const overrides = normalizeFieldOverrides(table.fieldOverrides, table.fieldRefDicts)
  if (!overrides.byId.size && !overrides.byQualified.size) return table  // 无覆盖，恒等

  const setNames = (typeof listSetNames === 'function' ? listSetNames(table) : []) || []
  const materialized = []
  const seen = new Set()
  const consumedBare = new Set()      // 已成功物化的裸 id
  const consumedQualified = new Set() // 已成功物化的限定键
  for (const setName of setNames) {
    const fields = (typeof resolveSetFields === 'function' ? resolveSetFields(setName) : []) || []
    for (const f of fields) {
      const fid = metaFieldId(f)
      if (!fid || seen.has(fid)) continue
      seen.add(fid)
      const qKey = `${setName}.${fid}`
      const hasQ = overrides.byQualified.has(qKey)
      const hasB = overrides.byId.has(fid)
      const ov = overrideForField(overrides, fid, setName)
      if (ov) {
        // 打 _materializedFrom 标记（值=fieldSet 名），供加载时 dematerializeTable 识别并还原为覆盖态
        materialized.push(effectiveField(f, { ...ov, _materializedFrom: setName }))
        if (hasQ) consumedQualified.add(qKey)
        if (hasB) consumedBare.add(fid)
      }
    }
  }
  const out = { ...table }
  const inline = Array.isArray(table.fields) ? table.fields : []
  out.fields = [...inline, ...materialized]

  // 非破坏性：只删已物化的覆盖键；无法解析到 base 字段的覆盖（如指向逻辑别名的旧 fieldRefDicts）
  // 保留在 fieldOverrides 里，由 diagnoseTableOverrides 报 OVERRIDE_FIELD_NOT_FOUND，交人工处理，不静默丢失。
  const leftover = {}
  if (table.fieldOverrides && typeof table.fieldOverrides === 'object') {
    for (const [k, v] of Object.entries(table.fieldOverrides)) {
      const done = k.includes('.') ? consumedQualified.has(k) : consumedBare.has(k)
      if (!done) leftover[k] = v
    }
  }
  if (table.fieldRefDicts && typeof table.fieldRefDicts === 'object') {
    for (const [fid, refDict] of Object.entries(table.fieldRefDicts)) {
      if (!consumedBare.has(fid) && refDict != null && refDict !== '') {
        // 旧 fieldRefDicts 未能物化 → 归一为 fieldOverrides 形态保留（迁移后 fieldRefDicts 统一废弃）
        leftover[fid] = leftover[fid] ? deepMerge({ refDict }, leftover[fid]) : { refDict }
      }
    }
  }
  if (Object.keys(leftover).length) out.fieldOverrides = leftover
  else delete out.fieldOverrides
  delete out.fieldRefDicts
  return out
}

/**
 * 加载时反向物化：把 materializeTable 物化时打的 `_materializedFrom` 标记字段还原为 fieldOverrides 覆盖态。
 * 与 materializeTable 互为逆——物化字段（带标记）按 base 求 delta 重建 fieldOverrides，并从 fields 移除
 * （恢复为引用字段，由 fieldSet 引用提供）；无标记字段保持本表内联。无标记字段时恒等返回原 table。
 *
 * 容错：setName 失效或 id 不匹配（base 已删/改名）→ 去标记降级为本表字段，不静默丢失。
 *
 * @param {object} table  加载自磁盘的表（fields 可能含 _materializedFrom 标记的物化字段）
 * @param {(setName:string)=>object[]} resolveSetFields  取某 fieldSet 的 base 字段数组
 * @param {(table:object)=>string[]} listSetNames  取该表引用的 fieldSet 名（有序）
 * @returns {object}  新表（物化字段还原为 fieldOverrides；无标记字段则恒等返回原 table）
 */
export function dematerializeTable (table, resolveSetFields, listSetNames) {
  if (!table || typeof table !== 'object') return table
  const inline = Array.isArray(table.fields) ? table.fields : []
  const tagged = []
  const own = []
  for (const f of inline) {
    if (f && typeof f === 'object' && typeof f._materializedFrom === 'string' && f._materializedFrom) tagged.push(f)
    else own.push(f)
  }
  if (!tagged.length) return table  // 无物化字段，恒等

  const setNames = (typeof listSetNames === 'function' ? listSetNames(table) : []) || []
  // 预建 fid → 出现的 fieldSet 名集合（判断限定键消歧：多 set 含同 id → 限定键）
  const fidSets = new Map()
  for (const setName of setNames) {
    for (const b of (resolveSetFields(setName) || [])) {
      const fid = metaFieldId(b)
      if (!fid) continue
      if (!fidSets.has(fid)) fidSets.set(fid, new Set())
      fidSets.get(fid).add(setName)
    }
  }

  const restored = {}      // 从标记字段反求的覆盖（限定/裸键）
  const demoted = []       // setName 失效/找不到 base → 去标记降级为本表字段
  for (const m of tagged) {
    const setName = m._materializedFrom
    const baseFields = (typeof resolveSetFields === 'function' ? resolveSetFields(setName) : []) || []
    const f = baseFields.find((b) => metaFieldId(b) === metaFieldId(m))
    const cleaned = { ...m }                      // 去标记后的字段
    delete cleaned._materializedFrom
    if (!f) { demoted.push(cleaned); continue }   // base 解析失败 → 降级，不静默丢失
    const delta = diffOverride(f, cleaned)
    if (!delta) continue                          // 字段=base 副本 → 纯引用字段，不生成覆盖也不回 fields
    const fid = metaFieldId(m)
    const sets = fidSets.get(fid)
    restored[(sets && sets.size > 1) ? `${setName}.${fid}` : fid] = delta
  }

  // 合并磁盘已有 fieldOverrides（未物化的覆盖）；restored 反映实际物化内容，冲突时优先
  const merged = { ...(table.fieldOverrides || {}), ...restored }
  const out = { ...table, fields: [...own, ...demoted] }
  if (Object.keys(merged).length) out.fieldOverrides = merged
  else delete out.fieldOverrides
  return out
}

// ─── 覆盖诊断（编辑器保存期 + 校验） ──────────────────────────────────────────

/** 物理类型键（禁在覆盖中修改，base 主权）。显示精度 display.* 不在此列，可改。 */
const PHYSICAL_KEYS = ['dataType', 'fieldLength', 'intDigits', 'decimalDigits']
/** 身份键（禁改，改了=换字段）。 */
const IDENTITY_KEYS = ['id', 'name']

/**
 * 对一个字段的覆盖做合法性诊断（与 flc-ref-diagnostics 同构）。
 * @param {object} baseField  被覆盖的 base 字段
 * @param {object} override    覆盖 delta
 * @param {string} path        诊断路径前缀（如 `voucher_header.fieldOverrides.doc_no`）
 * @returns {{errors:{path,code,message}[], warnings:{path,code,message}[]}}
 */
export function diagnoseOverride (baseField, override, path) {
  const errors = []; const warnings = []
  if (!override || typeof override !== 'object') return { errors, warnings }
  const b = baseField || {}

  for (const k of IDENTITY_KEYS) {
    if (override[k] !== undefined && override[k] !== b[k]) {
      errors.push({ path: `${path}.${k}`, code: 'OVERRIDE_CHANGES_IDENTITY', message: `不能覆盖字段身份 ${k}（改 id/name 等于换字段，请改用自有字段）` })
    }
  }
  for (const k of PHYSICAL_KEYS) {
    if (override[k] !== undefined && override[k] !== b[k]) {
      errors.push({ path: `${path}.${k}`, code: 'OVERRIDE_CHANGES_PHYSICAL_TYPE', message: `不能覆盖物理类型 ${k}（base 主权；显示精度请用 display.decimalDigits）` })
    }
  }
  // 约束放松：base 非空 → 覆盖为可空
  if (b.nullable === false && override.nullable === true) {
    warnings.push({ path: `${path}.nullable`, code: 'OVERRIDE_RELAXES_CONSTRAINT', message: `字段在 base 中为非空，覆盖放松为可空` })
  }
  // 冗余覆盖：某键与 base 完全相同
  for (const [k, v] of Object.entries(override)) {
    if (v !== null && jsonEq(v, b[k])) {
      warnings.push({ path: `${path}.${k}`, code: 'OVERRIDE_REDUNDANT', message: `覆盖值与 base 相同，建议删除该覆盖：${k}` })
    }
  }
  return { errors, warnings }
}

/**
 * 对整表的 fieldOverrides 做诊断：解析每个覆盖键对应的 base 字段，跑 diagnoseOverride；
 * 覆盖键指向不存在的字段 → OVERRIDE_FIELD_NOT_FOUND。
 * @param {object} table
 * @param {(setName:string)=>object[]} resolveSetFields
 * @param {(table:object)=>string[]} listSetNames
 */
export function diagnoseTableOverrides (table, resolveSetFields, listSetNames) {
  const errors = []; const warnings = []
  if (!table || typeof table !== 'object') return { errors, warnings, valid: true }
  const overrides = normalizeFieldOverrides(table.fieldOverrides, table.fieldRefDicts)
  if (!overrides.byId.size && !overrides.byQualified.size) return { errors, warnings, valid: true }

  const setNames = (typeof listSetNames === 'function' ? listSetNames(table) : []) || []
  // 建 (fieldSetName, fieldId) → base 字段索引 + 裸 id → 首个 base 字段
  const bySet = new Map()  // `${set}.${id}` → field
  const byBareId = new Map()
  for (const setName of setNames) {
    for (const f of (resolveSetFields(setName) || [])) {
      const fid = metaFieldId(f)
      if (!fid) continue
      bySet.set(`${setName}.${fid}`, f)
      if (!byBareId.has(fid)) byBareId.set(fid, f)
    }
  }
  const tableId = table.tableName || table.dictMeta?.tableName || '表'

  const check = (baseField, ov, keyPath) => {
    const d = diagnoseOverride(baseField, ov, `${tableId}.fieldOverrides.${keyPath}`)
    errors.push(...d.errors); warnings.push(...d.warnings)
  }
  for (const [fid, ov] of overrides.byId) {
    const base = byBareId.get(fid)
    if (!base) errors.push({ path: `${tableId}.fieldOverrides.${fid}`, code: 'OVERRIDE_FIELD_NOT_FOUND', message: `覆盖的字段 ${fid} 不在该表任何引用字段集中` })
    else check(base, ov, fid)
  }
  for (const [qkey, ov] of overrides.byQualified) {
    const base = bySet.get(qkey)
    if (!base) errors.push({ path: `${tableId}.fieldOverrides.${qkey}`, code: 'OVERRIDE_FIELD_NOT_FOUND', message: `限定覆盖 ${qkey} 未命中任何引用字段` })
    else check(base, ov, qkey)
  }
  return { errors, warnings, valid: errors.length === 0 }
}
