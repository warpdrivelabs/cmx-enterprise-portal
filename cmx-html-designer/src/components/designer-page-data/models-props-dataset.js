import { esc } from '../../utils/esc.js'
/**
 * 数据集（CmxDataSet）在模型面板只作为资源项选中；属性统一到右侧属性区域编辑。
 */
export function buildDataSetProps({ instance, mount }) {
  mount.innerHTML = `
    <div class="props-header">
      <span class="props-type-badge" data-kind="dataset">数据集</span>
    </div>
    <div class="models-props-empty">
      已选中「${esc(instance.instanceId || '数据集')}」。实例名、数据来源、初始行数据、子数据集请在右侧属性区域编辑。
    </div>
  `
}

