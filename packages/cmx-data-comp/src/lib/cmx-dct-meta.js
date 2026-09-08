import { CmxBaseMeta, registerMetaModelKind } from './cmx-meta-model.js'

export class CmxDCTMeta extends CmxBaseMeta {
  constructor(props = {}) {
    super({
      kind: 'DCT',
      props,
      tableProp: 'dictionaryTables',
      metaProp: 'moduleMeta',
    })
  }

  getDictionary(code) {
    return this.getTable(code)
  }

  listDictionaries() {
    return this.listTables()
  }
}

registerMetaModelKind('DCT', CmxDCTMeta)
