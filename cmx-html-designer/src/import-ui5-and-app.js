/**
 * 设计器业务模块（UI5 / Tabler 由 cmx-ui5-runtime 提供）。
 */
import { ensureTagRegistryLoaded } from './metadata/tag-registry.js'

await ensureTagRegistryLoaded()
await import('./plugins/cmx-models-plugin.js')
await import('./plugins/cmx-data-plugin.js')
await import('./plugins/cmx-ignite-plugin.js')
await import('./plugins/cmx-ignite-thin-plugin.js')
await import('./components/designer-app.js')
