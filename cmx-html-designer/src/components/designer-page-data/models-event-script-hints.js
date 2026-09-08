import { esc } from '../../utils/esc.js'
/**
 * 模型事件脚本提示
 *
 * 每个模型类自动派发的事件清单与 event.detail 形状，
 * 供「模型」面板事件 Tab 渲染 chips 与脚本上方的提示框。
 *
 * 注意：CmxColumnModel 不继承 EventTarget，没有内置事件 —— 允许用户填自定义事件名，
 * 但运行时绑定时会被 init-page-models.js 静默跳过（modelInstance.addEventListener 不存在）。
 */

export const MODEL_EVENT_PRESETS = {
  CmxDataSet:     ['ds-row-added', 'ds-row-removed', 'cursor-changed', 'row-changed'],
  CmxMasterSlave: ['change', 'select', 'aggregate'],
  CmxColumnModel: [],
  CmxDCTMeta:     ['meta-changed'],
  CmxDOCMeta:     ['meta-changed'],
};

/** 每个事件的 event.detail 字段说明 */
const MODEL_EVENT_DETAILS = {
  'ds-row-added':   { fields: [['row', '新增的行对象']] },
  'ds-row-removed': { fields: [['row', '被删除的行对象']] },
  'cursor-changed': { fields: [
    ['index',     '当前行下标（-1 表示无）'],
    ['prevIndex', '前一行下标'],
    ['row',       '当前行对象'],
    ['id',        '当前行 id'],
  ]},
  'row-changed':    { fields: [
    ['row',   '发生变更的行对象'],
    ['key',   '变更的字段名'],
    ['value', '变更后的新值'],
  ]},
  'change':         { fields: [
    ['path',  '路径节点 id'],
    ['id',    '行 id'],
    ['key',   '字段名'],
    ['value', '新值'],
    ['row',   '行对象'],
  ]},
  'select':         { fields: [
    ['path', '路径节点 id'],
    ['id',   '被选中的行 id'],
  ]},
  'aggregate':      { fields: [
    ['rule',     '触发的聚合规则'],
    ['value',    '聚合结果值'],
    ['targetId', '写入字段所在行 id'],
  ]},
  'meta-changed':   { fields: [
    ['reason', '变更原因：load / merge-field-sets'],
    ['model',  '当前元数据模型实例'],
  ]},
};


/**
 * 返回事件脚本提示 HTML：形参、event.detail、上下文。
 * @param {string} modelType - 'CmxDataSet' | 'CmxMasterSlave' | 'CmxColumnModel'
 * @param {string} eventName - 事件名（可为自定义）
 */
export function getModelEventScriptHintHtml(modelType, eventName) {
  const detail = MODEL_EVENT_DETAILS[eventName];
  const detailHtml = detail
    ? detail.fields.map(([k, desc]) =>
        `<div><code>event.detail.${esc(k)}</code> — ${esc(desc)}</div>`).join('')
    : `<div style="color:var(--sapContent_NonInteractiveIconColor,#6c8093)">自定义事件，detail 形状由派发方决定</div>`;

  return `
    <div class="evt-script-hint__title">事件脚本运行环境</div>
    <div class="evt-script-hint__block">
      <div class="evt-script-hint__label">形参变量</div>
      <div class="evt-script-hint__body">
        <div><code>event</code> — 触发的 CustomEvent 对象</div>
        <div><code>host</code> — 当前页面 Web Component 实例</div>
        <div style="margin-top:4px;color:var(--sapContent_NonInteractiveIconColor,#6c8093)">
          运行作用域：<code>function(event, host) { with (host) { … } }</code>
        </div>
      </div>
      <div class="evt-script-hint__label">event.detail</div>
      <div class="evt-script-hint__body">${detailHtml}</div>
      <div class="evt-script-hint__label">上下文变量</div>
      <div class="evt-script-hint__body">
        <div><code>this</code> — 当前模型实例（${esc(modelType)}）</div>
        <div><code>$data.xxx</code> — 页面变量</div>
        <div>其他模型实例可直接通过 <code>instanceId</code> 访问</div>
        <div>页面函数 / 服务名可直接调用</div>
      </div>
    </div>`;
}
