import { CmxBaseMeta, registerMetaModelKind } from './cmx-meta-model.js'

export class CmxDOCMeta extends CmxBaseMeta {
  constructor(props = {}) {
    super({
      kind: 'DOC',
      props,
      tableProp: 'voucherTables',
      metaProp: 'moduleMeta',
    })
  }

  getDocument(code) {
    return this.getTable(code)
  }

  listDocuments() {
    return this.listTables()
  }

  /** 全部汇总表（跨所有单据表，扁平）。 */
  listSummaries() {
    return this.listTables().flatMap((t) => t.listSummaries())
  }

  /** 某层级下所有表的汇总表（按表 raw.level 过滤）。 */
  listSummariesByLevel(level) {
    const lv = String(level)
    return this.listTables()
      .filter((t) => String(t.get('level') || '') === lv)
      .flatMap((t) => t.listSummaries())
  }
}

registerMetaModelKind('DOC', CmxDOCMeta)
