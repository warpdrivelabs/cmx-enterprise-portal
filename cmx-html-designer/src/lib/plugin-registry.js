/**
 * definePlugin — 动态注册自定义组件插件
 *
 * 插件对象结构：
 * {
 *   id: string,                    // 必填，唯一插件标识
 *   groups?: GroupDef[],           // 可选，新增组定义
 *   components: ComponentMeta[],   // 必填，组件元数据数组
 * }
 *
 * GroupDef: { id, label, icon, order?, collapsed? }
 *
 * ComponentMeta: 与 src/metadata/tags/**\/*.json 格式相同：
 *   { tag, group, label, description, canNest, isVoid,
 *     attrs?, styleGroups?, eventPreset?, extraEvents?, defaults? }
 *
 * 注册成功后在 window 上派发 'cmx:plugin-registered' 事件，
 * designer-left-panel 监听此事件并自动刷新调色板。
 *
 * 示例：
 *   import { definePlugin } from './src/lib/plugin-registry.js';
 *
 *   definePlugin({
 *     id: 'my-components',
 *     groups: [{ id: 'custom', label: '自定义', icon: '★', order: 10 }],
 *     components: [
 *       {
 *         tag: 'my-button',
 *         group: 'custom',
 *         label: '<my-button>',
 *         description: '我的按钮组件',
 *         canNest: false,
 *         isVoid: false,
 *         attrs: [
 *           { name: 'label',    label: 'label',    type: 'text' },
 *           { name: 'disabled', label: 'disabled', type: 'boolean' },
 *         ],
 *         defaults: { attributes: { label: '按钮' } },
 *       },
 *     ],
 *   });
 */
import registry from '../metadata/tag-registry.js';

/** 已注册插件 id 集合，防止重复注册 */
const _registered = new Set();

/**
 * tag → customInspector 渲染函数
 * 渲染函数签名：(ctx) => void
 *   ctx = { node, meta, mount, pageData, onChange }
 *   - node:      当前选中的 DOM 元素
 *   - meta:      ComponentMeta
 *   - mount:     Inspector 属性面板根节点（已被清空）；自定义面板把 DOM 挂在这里
 *   - pageData:  designer-page-data 组件（可读 pageData / dataSources / dataFlow）
 *   - onChange:  调用以触发 inspector-change 事件，让 pageData 标记 dirty
 */
const _customInspectors = new Map();

export function definePlugin(plugin) {
  if (!plugin?.id)  throw new Error('plugin.id 为必填');
  if (!plugin.components?.length) throw new Error('plugin.components 不能为空');

  const isReRegister = _registered.has(plugin.id);
  if (isReRegister) {
    /* 重注册（HMR 场景）：不 skip，沿用现有 group；按 tag 覆盖 component meta；
       customInspectors 也按 tag 覆盖。这样 dev 时修改 plugin 文件能立刻在调色板生效。 */
    console.info(`[cmx:plugin] 重新注册插件 "${plugin.id}"（HMR）`);
  }

  // 注册自定义组（registerGroup 内部对同 id 已自动 skip）
  (plugin.groups || []).forEach(g => registry.registerGroup(g));

  // 注册组件元数据（registry.register 内部按 tag 覆盖，符合重注册预期）
  plugin.components.forEach(meta => registry.register(meta));

  // 注册 customInspectors（可选）：{ [tag]: (ctx) => void }
  if (plugin.customInspectors) {
    for (const [tag, fn] of Object.entries(plugin.customInspectors)) {
      if (typeof fn === 'function') _customInspectors.set(tag, fn);
    }
  }

  _registered.add(plugin.id);

  window.dispatchEvent(new CustomEvent('cmx:plugin-registered', {
    detail: { pluginId: plugin.id, count: plugin.components.length, reRegister: isReRegister },
  }));
}

/** 取得指定 tag 的自定义 Inspector 渲染函数；无则返回 null */
export function getCustomInspector(tag) {
  return _customInspectors.get(tag) || null;
}
