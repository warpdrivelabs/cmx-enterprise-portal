/**
 * cmx-doc-coord — 单据坐标（domain/application/module/file/doc）统一处理。
 *
 * 单据相关接口（/api/doc/meta、/api/doc/data/*、/api/doc/save）都以坐标定位定义文件。
 * 本模块收敛四件事，消除散落在 loadDocData/loadDocDataStream/loadChildren/saveDocData/
 * init-page-models 等处的重复拼装与不一致（尤其 file 空值变成 "undefined" 脏值的隐患）：
 *   ① normalizeDocCoord(raw) — 归一：对象/斜杠字符串/空 → 统一对象（含 file/doc/dbId）
 *   ② docCoordQuery(coord)   — 拼 URLSearchParams：file/doc 有值才带，空值不拼（避免 "undefined"）
 *   ③ docCoordKey(coord)     — 拼去重 key（"domain/app/module[/doc][/file]"），供批量请求去重
 *   ④ resolveCoord(local,global) — 合并局部与全局坐标（local 优先），供组件级覆盖全局坐标
 *
 * file 留空时后端自动解析该坐标下的默认 DOC 定义（resolve_doc_file，选 isDefault/最高版本）。
 * doc（moduleCode）有值时后端按 moduleMeta.moduleCode 精确定位（一模块多单据场景）；缺失则盲选默认。
 */

/** 系统/技术列不需要——本模块不涉及列，仅为保持与 doc-meta-loader 一致的导出风格而留空。 */

/**
 * 把任意形态的单据坐标归一为 { domain, application, module, file, doc, dbId }。
 *
 * 支持：
 *   - 对象 {domain, application, module, file?, doc?, dbId?, app?}（app 兜底 application）
 *   - 斜杠字符串 "domain/application/module[/file]"（如 "fi/cmxfico/gl" 或 "fi/cmxfico/gl/x.json"）——斜杠串不含 doc
 *   - 空（null/undefined/''）→ 全空对象（调用方据此判是否启用）
 *
 * @param {*} raw
 * @returns {{domain:string, application:string, module:string, file:string, doc:string, dbId:string}}
 */
export function normalizeDocCoord (raw) {
  const empty = { domain: '', application: '', module: '', file: '', doc: '', dbId: '' }
  if (!raw) return empty
  if (typeof raw === 'object') {
    return {
      domain: raw.domain || '',
      application: raw.application || raw.app || '',
      module: raw.module || '',
      file: raw.file || '',
      doc: raw.doc || '',
      dbId: raw.dbId || raw.db_id || '',
    }
  }
  if (typeof raw === 'string') {
    const s = raw.trim()
    if (!s) return empty
    const parts = s.split('/').map((x) => x.trim())
    return { domain: parts[0] || '', application: parts[1] || '', module: parts[2] || '', file: parts[3] || '', doc: '', dbId: '' }
  }
  return empty
}

/** file 是否视为「未指定」（空 / "undefined" / "null" 等脏值），应交给后端自动解析。 */
export function isFileAbsent (file) {
  const f = String(file == null ? '' : file).trim()
  return f === '' || f === 'undefined' || f === 'null'
}

/**
 * 把坐标拼成 URLSearchParams（domain/application/module 必带，file 有值才带）。
 *
 * 统一规则：file 缺省/空/脏值（"undefined"/"null"）时不拼，由后端自动解析默认 DOC 定义。
 * 这修复了旧代码里 `new URLSearchParams({ file: def.file })` 在 file 为 undefined 时
 * 产生 "file=undefined" 脏值导致后端 400 的问题。
 *
 * @param {*} coord 归一前或归一后的坐标（对象或斜杠字符串）
 * @returns {URLSearchParams}
 */
export function docCoordQuery (coord) {
  const c = normalizeDocCoord(coord)
  const qs = new URLSearchParams({
    domain: c.domain, application: c.application, module: c.module,
  })
  if (c.doc) qs.set('doc', c.doc)
  if (!isFileAbsent(c.file)) qs.set('file', c.file)
  return qs
}

/**
 * 合并坐标：local 有值优先，global 兜底。返回归一化完整坐标。
 *
 * 用于「全局页面坐标（host.$coord）+ 组件局部坐标」的统一合并——各消费点调用一次，
 * 消除散落在 CmxColumnModel/CmxDOCMeta/FlexibleCombination/字典列等处的 || 拼接。
 * 两端都归一化后再逐字段取「local 非空优先」，空值才回落 global。
 *
 * @param {*} local  组件级坐标（对象/斜杠字符串/空）
 * @param {*} global 页面级坐标（通常来自 host.$coord）
 * @returns {{domain:string, application:string, module:string, file:string, doc:string, dbId:string}}
 */
export function resolveCoord (local, global) {
  const l = normalizeDocCoord(local)
  const g = normalizeDocCoord(global)
  return {
    domain: l.domain || g.domain,
    application: l.application || g.application,
    module: l.module || g.module,
    file: l.file || g.file,
    doc: l.doc || g.doc,
    dbId: l.dbId || g.dbId,
  }
}

/**
 * 拼坐标去重 key（"domain/application/module[/doc][/file]"），供批量请求按坐标分组去重。
 * file/doc 缺省时 key 不含对应段（与后端自动解析语义一致）。
 *
 * @param {*} coord
 * @returns {string}
 */
export function docCoordKey (coord) {
  const c = normalizeDocCoord(coord)
  let key = `${c.domain}/${c.application}/${c.module}`
  if (c.doc) key += `/${c.doc}`
  if (!isFileAbsent(c.file)) key += `/${c.file}`
  return key
}
