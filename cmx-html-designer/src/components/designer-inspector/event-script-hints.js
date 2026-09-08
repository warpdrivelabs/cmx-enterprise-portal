import { escapeHtml } from '../../utils/html-utils.js';

/** 各事件名下「event」对象常用成员说明（脚本形参固定为 event） */
const EVENT_OBJECT_HINTS = {
  _default:
    'Event：<code>type</code>、<code>target</code>、<code>currentTarget</code>；UI5 组件多为 CustomEvent，请结合文档查看 <code>event.detail</code>。',
  click:
    'MouseEvent：<code>target</code>、<code>currentTarget</code>、<code>clientX</code> / <code>clientY</code>、<code>button</code>、<code>preventDefault()</code> 等。',
  dblclick:
    'MouseEvent：同 click；<code>detail</code> 为连续点击次数。',
  contextmenu:
    'MouseEvent：右键菜单；常配合 <code>event.preventDefault()</code> 阻止默认菜单。',
  mouseover: 'MouseEvent：<code>relatedTarget</code>、<code>target</code> 等。',
  mouseout: 'MouseEvent：<code>relatedTarget</code>、<code>target</code> 等。',
  mouseenter: 'MouseEvent：从元素外进入时触发。',
  mouseleave: 'MouseEvent：指针离开元素边界时触发。',
  keydown:
    'KeyboardEvent：<code>key</code>、<code>code</code>、<code>repeat</code>、<code>ctrlKey</code> / <code>shiftKey</code> / <code>altKey</code> / <code>metaKey</code> 等。',
  keyup: 'KeyboardEvent：键抬起时触发，成员同 keydown。',
  focus: 'FocusEvent：<code>relatedTarget</code>（失焦目标，若有）。',
  blur: 'FocusEvent：<code>relatedTarget</code>（下一个聚焦目标，若有）。',
  focusin: 'FocusEvent：冒泡阶段焦点进入。',
  focusout: 'FocusEvent：冒泡阶段焦点离开。',
  input:
    'InputEvent / Event：原生控件常用 <code>event.target</code> 取值；UI5 输入类多为 CustomEvent，注意 <code>event.detail</code> 与组件 API。',
  change:
    'Event：值已提交变更；原生可取 <code>event.target</code>；UI5 请查看 <code>event.detail</code>。',
  submit: 'SubmitEvent：<code>submitter</code>（触发提交的按钮，若有）。',
  reset: 'Event：表单被重置。',
  invalid: 'Event：校验未通过，常作用于表单控件。',
  select: 'Event：文本选区变化（input/textarea）。',
  'selection-change':
    'UI5 CustomEvent：<code>event.detail</code> 含选中项等信息（以具体组件文档为准）。',
  play: 'Event / 媒体事件：<code>target</code> 为媒体元素。',
  pause: 'Event / 媒体事件：播放暂停。',
  ended: 'Event / 媒体事件：播放结束。',
  loadeddata: 'Event / 媒体事件：当前帧数据已加载。',
  timeupdate: 'Event / 媒体事件：可读取 <code>currentTarget.currentTime</code> 等。',
  volumechange: 'Event / 媒体事件：音量变化。',
  error: 'Event / ErrorEvent：加载或执行失败时触发。',
  canplay: 'Event / 媒体事件：可开始播放。',
  // cmx-revo-grid 事件
  'cmx-row-selected':
    'CustomEvent：单选模式下行被选中。<code>event.detail.id</code> — 选中行的 id。',
  'cmx-row-selection-change':
    'CustomEvent：多选模式下选择集合变化。<code>event.detail.ids</code> — 当前已选行 id 数组。',
  'cmx-row-added':
    'CustomEvent：新行已添加。<code>event.detail.id</code> — 新行 id；<code>event.detail.row</code> — 行数据对象；<code>event.detail.index</code> — 在数据源中的索引。',
  'cmx-row-removed':
    'CustomEvent：行已删除。<code>event.detail.ids</code> — 被删除行 id 数组；<code>event.detail.rows</code> — 被删除行数据对象数组。',
  'cmx-cell-changed':
    'CustomEvent：单元格值已修改。<code>event.detail.id</code> — 行 id；<code>event.detail.key</code> — 列字段名；<code>event.detail.value</code> — 新值；<code>event.detail.row</code> — 完整行对象。',
  // cmx-ui5-form 事件
  'cmx-ui5-form-changed':
    'CustomEvent（cmx-ui5-form）：表单字段值已变更。<code>event.detail.key</code> — 字段 key；<code>event.detail.value</code> — 新值；<code>event.detail.row</code> — 完整行对象。',
  // cmx-web-treeview 事件
  'node-clicked':
    'CustomEvent（cmx-web-treeview）：节点被点击。<code>event.detail</code> 含节点数据（同底层 web-treeview 组件）。',
  'selected-node-changed':
    'CustomEvent（cmx-web-treeview）：选中节点变化。<code>event.detail</code> 含选中节点数据。',
  'tree-changed':
    'CustomEvent（cmx-web-treeview）：树结构发生变化（拖拽排序等）。<code>event.detail</code> 含变更描述。',
  'node-drop':
    'CustomEvent（cmx-web-treeview）：节点拖拽放下。<code>event.detail</code> 含被拖节点与目标节点信息。',
};

function getObjectHintLine(eventKey) {
  const k = String(eventKey || '').toLowerCase();
  return EVENT_OBJECT_HINTS[k] ?? EVENT_OBJECT_HINTS._default;
}

/**
 * 生成事件脚本区上方说明 HTML（仅白名单文案 + escapeHtml(eventName)）。
 * @param {string} eventName 当前编辑的事件名（含自定义）
 */
export function getEventScriptHintHtml(eventName) {
  const name = String(eventName || '').trim() || '（事件）';
  const objectLine = getObjectHintLine(name);
  const title = escapeHtml(name);

  return `
    <div class="evt-script-hint__title">当前事件：<strong>${title}</strong></div>
    <div class="evt-script-hint__block">
      <span class="evt-script-hint__label">形参变量</span>
      <span class="evt-script-hint__body">固定为 <code>event</code>（设计器以 <code>new Function('event', 函数体)</code> 执行，即监听回调的第一个参数）。</span>
    </div>
    <div class="evt-script-hint__block">
      <span class="evt-script-hint__label">本事件 · event 常用成员</span>
      <span class="evt-script-hint__body">${objectLine}</span>
    </div>
    <div class="evt-script-hint__block">
      <span class="evt-script-hint__label">上下文变量</span>
      <span class="evt-script-hint__body">
        <code>this</code> — 当前绑定监听器的 DOM 节点（本元素）；
        <code>$data</code> — 页面数据对象（运行时注入，见「数据」面板）；
        另可直接调用「数据」面板中声明的<strong>页面函数名</strong>、<strong>服务名</strong>（与源码补全一致）。
      </span>
    </div>
  `;
}
