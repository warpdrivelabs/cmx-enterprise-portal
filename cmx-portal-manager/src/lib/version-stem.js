/**
 * 多版本文件 / 场景的「逻辑档案聚合」工具集。
 *
 * 历史背景：弹性组合（flc）按 scenario 命名版本，单据定义（def/doc）按 file 命名版本，
 * 三套算法各自一份副本散落在两个 manager 文件里。这里仅做物理集中——**保持三套实现
 * 原样不动**，不做参数化合并（那会改变行为，留待后续重构）。函数行为与原文件逐字一致。
 *
 * 三套：
 *   - fc*  （弹性组合）：scenario 末尾 `_v<N>`，版本 1 即 bare stem
 *   - doc* （引用单据）：file 末尾 `_v<N>.json`
 *   - def* （字典/单据定义）：file 末尾 `_v<N>.json`
 *
 * doc* 与 def* 算法几乎相同，仅个别字段回退不同，保留两份以避免合并风险。
 */

// ─── 弹性组合（flc）：scenario ⇄ 版本号 + 逻辑档案聚合 ──────────────────────
/** 解析 scenario 末尾的 `_v<N>` 版本后缀 → { stem, version }；无后缀则 version=null。 */
export function fcScenarioParts (scenario) {
  const s = String(scenario || '')
  const m = s.match(/^(.*)_v(\d+)$/)
  if (m) return { stem: m[1], version: Number(m[2]) }
  return { stem: s, version: null }
}
/** 由 stem + 版本号拼回 scenario（版本 1 即 bare stem，避免破坏既有 account.json 等）。 */
export const fcScenarioForVersion = (stem, version) => (Number(version) <= 1 ? stem : `${stem}_v${version}`)
/** 列表项版本号（优先后端 isDefault 同源的文件名解析，回退顶层 version，再回退 1）。 */
export const fcItemVersion = (it) => {
  const p = fcScenarioParts(it?.scenario).version
  if (Number.isFinite(p) && p > 0) return p
  return 1
}
/** 列表项是否默认版本。 */
export const fcItemIsDefault = (it) => it?.isDefault === true
/** 逻辑档案聚合键：domain/app/module/stem。 */
export const fcStemKey = (it) => `${it?.domain || ''}/${it?.app || ''}/${it?.module || ''}/${it?.stem ?? fcScenarioParts(it?.scenario).stem}`
/**
 * 把扁平档案列表（一文件一项）聚合成逻辑档案（一档案一组，含多版本）。
 * @returns {{ key, stem, domain, app, module, versions[], latest, default }[]}
 */
export function groupFcItemsByStem (items) {
  const groups = new Map()
  for (const it of (Array.isArray(items) ? items : [])) {
    const key = fcStemKey(it)
    if (!groups.has(key)) {
      groups.set(key, { key, stem: it.stem ?? fcScenarioParts(it.scenario).stem, domain: it.domain, app: it.app, module: it.module, versions: [] })
    }
    groups.get(key).versions.push(it)
  }
  const out = []
  for (const g of groups.values()) {
    g.versions.sort((a, b) => fcItemVersion(a) - fcItemVersion(b))
    g.latest = g.versions[g.versions.length - 1]
    g.default = g.versions.find(fcItemIsDefault) || g.latest
    out.push(g)
  }
  return out
}

// ─── 引用单据（DOC 定义）按版本分层展示 ──────────────────────────────────────
/** 解析 DOC 定义文件名末尾的 `_v<N>.json` → { stem, version }。 */
export function docFileParts (file) {
  const base = String(file || '').replace(/\.json$/i, '')
  const m = base.match(/^(.*)_v(\d+)$/)
  if (m) return { stem: m[1], version: Number(m[2]) }
  return { stem: base, version: null }
}
/** DOC 列表项版本号（优先后端 version，回退文件名解析，再回退 1）。 */
export const docItemVersion = (it) => {
  const v = Number(it?.version)
  if (Number.isFinite(v) && v > 0) return v
  const p = docFileParts(it?.file).version
  return Number.isFinite(p) && p > 0 ? p : 1
}
export const docItemIsDefault = (it) => it?.isDefault === true
/** DOC 聚合键：domain/app/module/stem。 */
export const docStemKey = (it) => `${it?.domain || ''}/${it?.application || it?.app || ''}/${it?.module || ''}/${it?.stem ?? docFileParts(it?.file).stem}`
/** 把 DOC 列表（一文件一项）聚合成逻辑单据（一单据一组，含多版本，供分层下拉）。 */
export function groupDocItemsByStem (items) {
  const groups = new Map()
  for (const it of (Array.isArray(items) ? items : [])) {
    const key = docStemKey(it)
    if (!groups.has(key)) {
      groups.set(key, { key, stem: it.stem ?? docFileParts(it.file).stem, domain: it.domain, application: it.application || it.app || '', module: it.module, title: it.title || it.stem || it.file, versions: [] })
    }
    groups.get(key).versions.push(it)
  }
  const out = []
  for (const g of groups.values()) {
    g.versions.sort((a, b) => docItemVersion(a) - docItemVersion(b))
    g.default = g.versions.find(docItemIsDefault) || g.versions[g.versions.length - 1]
    out.push(g)
  }
  return out
}

// ─── 字典/单据定义（def）：file ⇄ 版本号 + 逻辑定义聚合 ─────────────────────
/** def 专用：列表项的 application 字段（兼容 application/app 两种命名）。 */
export const itemApplication = (it) => it?.application || it?.app || ''
/** 解析定义文件名末尾的 `_v<N>.json` 版本后缀 → { stem, version }；无后缀则 version=null。 */
export function defFileParts (file) {
  const base = String(file || '').replace(/\.json$/i, '')
  const m = base.match(/^(.*)_v(\d+)$/)
  if (m) return { stem: m[1], version: Number(m[2]) }
  return { stem: base, version: null }
}
/** 由 stem + 版本号拼回文件名（与 _addFile / 后端命名约定一致）。 */
export const defFileForVersion = (stem, version) => `${stem}_v${version}.json`
/** 逻辑定义聚合键：domain/app/module/stem（同一定义的多版本共享）。 */
export const defStemKey = (it) => `${it.domain}/${itemApplication(it)}/${it.module}/${it.stem ?? defFileParts(it.file).stem}`
/** 列表项的版本号（优先后端 version，回退文件名解析，再回退 1）。 */
export const defItemVersion = (it) => {
  const v = Number(it?.version)
  if (Number.isFinite(v) && v > 0) return v
  const p = defFileParts(it?.file).version
  return Number.isFinite(p) && p > 0 ? p : 1
}
/** 列表项是否默认版本（后端 summarize 输出 isDefault）。 */
export const defItemIsDefault = (it) => it?.isDefault === true
/**
 * 把扁平列表（一文件一项）聚合成逻辑定义（一定义一组，含多版本）。
 * @returns {{ key, stem, domain, application, module, versions: object[], latest: object, default: object }[]}
 *   versions 按版本号升序；latest=版本号最大的项；default=标记为默认的项（无则回退 latest）。
 */
export function groupDefItemsByStem (items) {
  const groups = new Map()
  for (const it of (Array.isArray(items) ? items : [])) {
    const key = defStemKey(it)
    if (!groups.has(key)) {
      groups.set(key, { key, stem: it.stem ?? defFileParts(it.file).stem, domain: it.domain, application: itemApplication(it), module: it.module, versions: [] })
    }
    groups.get(key).versions.push(it)
  }
  const out = []
  for (const g of groups.values()) {
    g.versions.sort((a, b) => defItemVersion(a) - defItemVersion(b))
    g.latest = g.versions[g.versions.length - 1]
    g.default = g.versions.find(defItemIsDefault) || g.latest
    out.push(g)
  }
  return out
}
