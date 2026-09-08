import { esc } from '../../utils/esc.js'
/**
 * 弹性组合（FlexibleCombination）普通属性统一到右侧 Property 编辑。
 */
export function buildFlexibleCombinationProps({ instance, mount }) {
  mount.innerHTML = `
    <div class="props-header">
      <span class="props-type-badge" data-kind="flc">弹性组合</span>
    </div>
    <div class="models-props-empty">
      已选中「${esc(instance.instanceId || '弹性组合')}」。业务场景、目标列模型、取数来源、锚点维度、内联规则等配置，请在右侧属性区域编辑。
    </div>
  `
}

