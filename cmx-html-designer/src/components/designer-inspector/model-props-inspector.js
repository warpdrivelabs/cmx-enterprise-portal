/**
 * 右侧 Inspector 的模型属性编辑器。
 * 复杂结构仍留在模型面板：CmxColumnModel.columns、CmxMasterSlave.schema / aggregations。
 */
import { deepClone, fieldId, makeFlcAdapter, renderFieldPanel } from 'cmx-data-comp';
import { esc, escAttr } from '../../utils/esc.js'

const MODEL_META = {
  CmxDataSet:     { label: 'CmxDataSet', color: 'var(--sapLinkColor, #0070f2)', icon: 'database' },
  CmxMasterSlave: { label: 'CmxMasterSlave', color: 'var(--sapCriticalTextColor, #b45309)', icon: 'org-chart' },
  CmxColumnModel: { label: 'CmxColumnModel', color: 'var(--sapPositiveTextColor, #059669)', icon: 'table-view' },
  FlexibleCombination: { label: '弹性组合', color: 'var(--neo-violet, #7c3aed)', icon: 'target-group' },
};

export function renderModelPropsInspector({ model, pageData, mount, onChange }) {
  if (!model || !mount) return;
  if (!model.props || typeof model.props !== 'object') model.props = {};

  const renderer = {
    CmxDataSet: renderDataSet,
    CmxMasterSlave: renderMasterSlave,
    CmxColumnModel: renderColumnModel,
    FlexibleCombination: renderFlexibleCombination,
  }[model.modelType];

  if (!renderer) {
    mount.innerHTML = `<p class="model-prop-empty">该模型类型暂无右侧属性编辑器。</p>`;
    return;
  }

  renderer({ model, pageData, mount, onChange });
}

export function getModelInspectorMeta(modelType) {
  return MODEL_META[modelType] || { label: modelType || 'Model', color: 'var(--sapContent_LabelColor, #6b7280)', icon: 'database' };
}

export function renderColumnDetailPropsInspector({ model, column, path, mount, onChange }) {
  if (!column || !mount) return;
  normalizeColumn(column);
  const viewField = columnToContextField(column);

  mount.innerHTML = `
    <div class="model-prop-header">
      <span class="model-prop-type" style="color:var(--sapPositiveTextColor, #059669)">CmxColumn</span>
      <span class="model-prop-id">${esc(column.caption || column.id || path || '-')}</span>
    </div>
    ${renderFieldPanel(viewField, { end: 'FLC', adapter: makeFlcAdapter(), ctx: columnFieldCtx(model), keyOf: (f) => fieldId(f) })}
  `;

  mount.oninput = (e) => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement)) return;
    if (!t.dataset.fieldPath) return;
    const path = t.dataset.fieldPath;
    // enumValues.* 数组点路径：适配器 setPath 不支持数组下标，走专用写入
    if (path.startsWith('enumValues.')) {
      writeEnumPath(viewField, path, inputRawValue(t));
    } else {
      makeFlcAdapter().set(viewField, path, inputRawValue(t), t.dataset.valueType || 'string');
    }
    applyContextFieldToColumn(column, viewField);
    onChange();
  };
  // select 切换录入控件(edit.mode)时重渲染详编面板，让「录入控件属性」分区跟随新 mode。
  // 对齐定义中心 handlePanelChange 的做法（edit.mode 变化触发 emitState 重渲染）。
  mount.onchange = (e) => {
    const t = e.target;
    if (!(t instanceof HTMLSelectElement)) return;
    if (t.dataset.fieldPath !== 'edit.mode') return;
    renderColumnDetailPropsInspector({ model, column, path, mount, onChange });
  };
  mount.onclick = (e) => {
    const t = e.target instanceof Element ? e.target.closest('[data-action]') : null;
    const action = t?.dataset.action;
    if (action === 'add-validation') {
      column.validations = Array.isArray(column.validations) ? column.validations : [];
      column.validations.push({ expr: '', message: '' });
      onChange();
      renderColumnDetailPropsInspector({ model, column, path, mount, onChange });
    }
    if (action === 'remove-validation') {
      const index = Number(t.dataset.index);
      if (Array.isArray(column.validations) && index >= 0) {
        column.validations.splice(index, 1);
        if (!column.validations.length) delete column.validations;
        onChange();
        renderColumnDetailPropsInspector({ model, column, path, mount, onChange });
      }
    }
    // 枚举值（value+label）行编辑：增删枚举项（与 models-props-columnmodel 一致）
    if (action === 'add-enum') {
      viewField.enumValues = Array.isArray(viewField.enumValues) ? viewField.enumValues : [];
      viewField.enumValues.push({ value: '', label: '' });
      applyContextFieldToColumn(column, viewField);
      onChange();
      renderColumnDetailPropsInspector({ model, column, path, mount, onChange });
    }
    if (action === 'remove-enum') {
      const index = Number(t.dataset.index);
      if (Array.isArray(viewField.enumValues) && index >= 0) {
        if (!window.confirm('确定删除该枚举项？')) return;
        viewField.enumValues.splice(index, 1);
        if (!viewField.enumValues.length) delete viewField.enumValues;
        applyContextFieldToColumn(column, viewField);
        onChange();
        renderColumnDetailPropsInspector({ model, column, path, mount, onChange });
      }
    }
    if (action === 'show-field-tips') {
      const root = t.getRootNode();
      const text = t.dataset.fieldTips || '';
      let pop = root.querySelector('#cmx-field-tips-popover');
      if (!pop) {
        pop = document.createElement('ui5-popover');
        pop.id = 'cmx-field-tips-popover';
        pop.setAttribute('placement', 'Bottom');
        pop.style.maxWidth = '380px';
        const body = document.createElement('div');
        body.className = 'cmx-field-tips-body';
        pop.appendChild(body);
        root.appendChild(pop);
      }
      pop.querySelector('.cmx-field-tips-body').textContent = text;
      pop.opener = t;
      pop.open = true;
    }
  };
}

function renderHeader(model) {
  const meta = getModelInspectorMeta(model.modelType);
  return `
    <div class="model-prop-header">
      <span class="model-prop-type" style="color:${escAttr(meta.color)}">${esc(meta.label)}</span>
      <span class="model-prop-id">${esc(model.instanceId || '-')}</span>
    </div>
  `;
}

function renderDataSet(ctx) {
  const { model, mount, onChange } = ctx;
  const p = model.props;
  const rowsJson = Array.isArray(p.rows) && p.rows.length ? JSON.stringify(p.rows, null, 2) : '';
  mount.innerHTML = `
    ${renderHeader(model)}
    ${textRow('实例名', 'ds-instanceId', model.instanceId, '例如 itemsDs')}
    <div class="model-prop-section">初始数据来源</div>
    ${textRow('服务函数名', 'ds-dataSource', p.dataSource || '', '页面服务函数名（留空 = 手动装载）', 'page-services-list')}
    ${selectRow('调用时机', 'ds-event', p.dataSourceEvent || 'onInit', [
      ['onInit', '页面初始化时（onInit）'],
      ['manual', '手动调用（manual）'],
    ])}
    <div class="model-prop-section">初始行数据</div>
    ${textareaRow('JSON 数组', 'ds-rows', rowsJson, '[{"id":"r1","name":"行1"}]', 7)}
    <div id="ds-rows-error" class="model-prop-error" hidden></div>
    <div class="model-prop-section">子数据集</div>
    <div id="ds-children-list" class="model-prop-list"></div>
    <button class="model-prop-add-btn" id="ds-add-child" type="button">+ 添加子数据集</button>
    ${serviceDatalist(ctx.pageData)}
  `;

  bindModelId(mount, '#ds-instanceId', model, onChange);
  bindInput(mount, '#ds-dataSource', (v) => { p.dataSource = v; onChange(); });
  bindSelect(mount, '#ds-event', (v) => { p.dataSourceEvent = v || 'onInit'; onChange(); });

  const rowsEl = mount.querySelector('#ds-rows');
  const rowsErr = mount.querySelector('#ds-rows-error');
  rowsEl?.addEventListener('input', () => {
    const raw = rowsEl.value.trim();
    if (!raw) {
      delete p.rows;
      rowsErr.hidden = true;
      onChange();
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error('必须是 JSON 数组');
      p.rows = parsed;
      rowsErr.hidden = true;
      onChange();
    } catch (err) {
      rowsErr.textContent = 'JSON 格式错误：' + (err?.message || err);
      rowsErr.hidden = false;
    }
  });

  const renderChildren = () => {
    const list = mount.querySelector('#ds-children-list');
    if (!list) return;
    list.innerHTML = '';
    (p.children || []).forEach((ch, i) => {
      const row = document.createElement('div');
      row.className = 'model-prop-inline-row';
      row.innerHTML = `
        <input class="model-prop-input" placeholder="子集标识" value="${escAttr(ch.childId || '')}" title="父级 _children 中的 key" />
        <span class="model-prop-arrow">-></span>
        <input class="model-prop-input" placeholder="子数据集实例名" value="${escAttr(ch.instanceId || '')}" title="对应的 CmxDataSet 实例名" list="model-dataset-list" />
        <button class="model-prop-icon-btn" type="button" title="删除">x</button>
      `;
      const [childId, instanceId] = row.querySelectorAll('input');
      childId.addEventListener('input', () => { ch.childId = childId.value; onChange(); });
      instanceId.addEventListener('input', () => { ch.instanceId = instanceId.value; onChange(); });
      row.querySelector('button').addEventListener('click', () => {
        p.children.splice(i, 1);
        onChange();
        renderChildren();
      });
      list.appendChild(row);
    });
  };
  renderChildren();
  mount.querySelector('#ds-add-child')?.addEventListener('click', () => {
    if (!Array.isArray(p.children)) p.children = [];
    p.children.push({ childId: '', instanceId: '' });
    onChange();
    renderChildren();
  });
  mount.insertAdjacentHTML('beforeend', modelDatalist(ctx.pageData, 'CmxDataSet', 'model-dataset-list'));
}

function renderMasterSlave(ctx) {
  const { model, pageData, mount, onChange } = ctx;
  const p = model.props;
  // nullish 归一化（旧页面 props 没有新字段）
  if (p.autoLoad == null) p.autoLoad = false;
  if (p.loadKind == null) p.loadKind = '';
  if (!p.source || typeof p.source !== 'object') p.source = { moduleCode: '', dict: '', dbId: '', binary: false, apiPath: '', saveApiPath: '' };
  const src = p.source;
  const isList = p.loadKind === 'list';
  const isDetail = p.loadKind === 'detail';

  mount.innerHTML = `
    ${renderHeader(model)}
    ${textRow('实例名', 'ms-instanceId', model.instanceId, '例如 ms')}
    <p class="model-prop-empty">路径树与聚合规则仍在中间「模型」页编辑。</p>

    <div class="model-prop-section">自动加载（勾选后无需写 pageFn 脚本）</div>
    ${checkboxRow('启用自动加载', 'ms-autoLoad', p.autoLoad)}
    ${selectRow('加载形态', 'ms-loadKind', p.loadKind, [
      ['',       '（禁用，手写脚本）'],
      ['list',   '列表'],
      ['detail', '单行详情'],
    ])}
    <p class="model-prop-empty">说明：具体走单据加载（loadDoc）还是字典加载（loadDict），由元模型实例指向的种类（DOC/DCT）自动决定。</p>

    <div class="model-prop-section">数据源</div>
    ${textRow('元模型实例', 'ms-metaModelId', p.metaModelId || '', '选一个已声明的单据/字典元模型实例', 'model-meta-list')}
    ${textRow('模块编码', 'ms-src-moduleCode', src.moduleCode || '', '单据模块 / 字典分组模块，留空走默认')}
    ${textRow('字典编码', 'ms-src-dict', src.dict || '', '字典归属时必填，如 gl_account')}
    ${textRow('目标库标识', 'ms-src-dbId', src.dbId || '', '例如 fico-db（留空走后端默认库）')}
    ${checkboxRow('列式压缩（msgpack）', 'ms-src-binary', !!src.binary)}
    ${textRow('接口地址覆盖', 'ms-src-apiPath', src.apiPath || '', '读取端点，留空走默认')}
    ${textRow('保存接口覆盖', 'ms-src-saveApiPath', src.saveApiPath || '', '保存端点（字典/单据回存），留空走默认')}
    ${isList ? numberRow('分页大小', 'ms-pageSize', p.pageSize, '每页行数（0 或留空=不分页，一次性拉取受「行数上限」约束）') : ''}
    ${isList ? numberRow('行数上限', 'ms-limit', p.limit, '不分页时一次性拉取的行数上限；使用 cmx-pager 分页时此值被忽略') : ''}
    ${isList ? numberRow('装载深度', 'ms-depth', p.depth, '向下递归层数；留空=拉全树，填 1=只加载根层（下级不加载，按需懒下钻）') : ''}
    ${isDetail ? textRow('根层过滤', 'ms-filter', p.filter || '', '例如 id:${route.id}', '') : ''}
    ${isDetail ? numberRow('装载深度', 'ms-depth', p.depth, '例如 99') : ''}

    ${metaModelsDatalist(pageData, 'model-meta-list')}
  `;

  // 绑定
  bindModelId(mount, '#ms-instanceId', model, onChange);
  bindCheckbox(mount, '#ms-autoLoad', (v) => { p.autoLoad = v; onChange(); });
  bindSelect(mount, '#ms-loadKind', (v) => {
    p.loadKind = v;
    onChange();
    renderMasterSlave(ctx);   // 重新渲染让 limit vs filter/depth/paging 分区切换
  });

  // 数据源字段
  bindInput(mount, '#ms-metaModelId', (v) => { p.metaModelId = v; onChange(); });
  bindInput(mount, '#ms-src-moduleCode', (v) => { src.moduleCode = v; onChange(); });
  bindInput(mount, '#ms-src-dict', (v) => { src.dict = v; onChange(); });
  bindInput(mount, '#ms-src-dbId', (v) => { src.dbId = v; onChange(); });
  bindCheckbox(mount, '#ms-src-binary', (v) => { src.binary = v; onChange(); });
  bindInput(mount, '#ms-src-apiPath', (v) => { src.apiPath = v; onChange(); });
  bindInput(mount, '#ms-src-saveApiPath', (v) => { src.saveApiPath = v; onChange(); });
  if (isList) {
    bindNumber(mount, '#ms-pageSize', (v) => { p.pageSize = v; onChange(); });
    bindNumber(mount, '#ms-limit', (v) => { p.limit = v; onChange(); });
    bindNumber(mount, '#ms-depth', (v) => { p.depth = v; onChange(); });
  }
  if (isDetail) {
    bindInput(mount, '#ms-filter', (v) => { p.filter = v; onChange(); });
    bindNumber(mount, '#ms-depth', (v) => { p.depth = v; onChange(); });
  }
}

function renderColumnModel(ctx) {
  const { model, mount, onChange } = ctx;
  const p = model.props;
  // 兼容迁移：若旧数据仍带 columnsSource，清除（已统一改用 metaModelId 引用元数据模型）。
  if ('columnsSource' in p) delete p.columnsSource;
  mount.innerHTML = `
    ${renderHeader(model)}
    ${textRow('实例名', 'cm-instanceId', model.instanceId, '例如 itemsModel')}
    ${textRow('datasetId', 'cm-datasetId', p.datasetId || '', '对应 CmxDataSet 路径（如 orders 或 orders.details）', 'model-dataset-list')}
    ${textRow('toTitleCols', 'cm-toTitleCols', p.toTitleCols || '', '例如 code, name', 'model-column-list')}
    ${textRow('iconCol', 'cm-iconCol', p.iconCol || '', '例如 iconType', 'model-column-list')}
    <div class="model-prop-section">元数据来源（绑定后运行时自动从元数据模型生成列，无需手动定义列）</div>
    ${textRow('元数据模型', 'cm-metaModelId', p.metaModelId || '', '选一个已声明的 CmxDOCMeta / CmxDCTMeta 实例', 'model-meta-list')}
    ${textRow('表 / 字典编码', 'cm-metaTable', p.metaTable || '', 'DOC 填表名(如 cv_acc_line)，DCT 填字典编码(如 currency)')}
    <p class="model-prop-empty">未绑定时，列/组定义在中间「模型」页手动编辑。</p>
    ${modelDatalist(ctx.pageData, 'CmxDataSet', 'model-dataset-list')}
    ${metaModelsDatalist(ctx.pageData, 'model-meta-list')}
    ${fieldDatalist(p, 'model-column-list')}
  `;
  bindModelId(mount, '#cm-instanceId', model, onChange);
  bindInput(mount, '#cm-datasetId', (v) => { p.datasetId = v; onChange(); });
  bindInput(mount, '#cm-toTitleCols', (v) => { p.toTitleCols = v; onChange(); });
  bindInput(mount, '#cm-iconCol', (v) => { p.iconCol = v; onChange(); });
  bindInput(mount, '#cm-metaModelId', (v) => { p.metaModelId = v; onChange(); });
  bindInput(mount, '#cm-metaTable', (v) => { p.metaTable = v; onChange(); });
}

/** 列出页面中所有元数据模型实例（CmxDOCMeta + CmxDCTMeta），供列模型 metaModelId 选择。 */
function metaModelsDatalist(pageData, id) {
  const models = (pageData?._models || []).filter((m) => (m.modelType === 'CmxDOCMeta' || m.modelType === 'CmxDCTMeta') && m.instanceId);
  return `<datalist id="${escAttr(id)}">${models.map((m) => `<option value="${escAttr(m.instanceId)}"></option>`).join('')}</datalist>`;
}

function renderFlexibleCombination(ctx) {
  const { model, mount, onChange } = ctx;
  const p = model.props;
  // 本页已声明的 CmxColumnModel 实例（绑定候选 + 提示）
  const modelIds = (ctx.pageData?._models || [])
    .filter((m) => m.modelType === 'CmxColumnModel' && m.instanceId)
    .map((m) => m.instanceId);
  const modelIdsHint = modelIds.length
    ? `本页列模型：${modelIds.map((id) => esc(id)).join('、')}`
    : '本页尚未声明 CmxColumnModel（先在 Models 面板拖入一个）';
  mount.innerHTML = `
    ${renderHeader(model)}
    ${textRow('实例名', 'fc-instanceId', model.instanceId, '例如 detailFlexibleCombination')}
    <div class="model-prop-section">后端定位</div>
    <div class="model-prop-hint" style="margin-bottom:8px;">业务域 / 应用 / 模块由页面级全局坐标自动继承，无需配置（留空即用页面坐标）。锚点维度在弹性组合管理页的档案级配置里维护，页面侧无需声明。</div>
    ${textRow('业务场景', 'fc-scenario', p.scenario || '', '如 account / trade（必填）')}
    <div class="model-prop-section">目标列模型（按表绑定）</div>
    <div data-fc-rows>${fcBindingRowsHtml(fcBindingsView(p.columnModelId))}</div>
    <div style="margin-bottom:6px;">
      <button type="button" data-fc-add style="padding:2px 10px;font-size:12px;cursor:pointer;border:1px dashed var(--sapList_BorderColor,#c0c0c0);border-radius:4px;background:transparent;color:var(--sapButton_TextColor,#1d2d3e);">＋ 添加绑定</button>
    </div>
    <div class="model-prop-hint">每行 = 弹性组合档案里一张表（字段集）→ 本页列模型。表名填档案「字段集」页签关联的表（如 cv_acc_line / cv_aux_line）；表名填 <code>*</code> 的行为兜底——未命中表名的字段集写入它（档案只有一个字段集时兜底即字段集0）。${modelIdsHint}</div>
    <div id="fc-columnModelId-status" class="model-prop-hint" style="margin-top:6px;">${esc(fcTargetsHint(fcBindingsView(p.columnModelId)))}</div>
    <div class="model-prop-section">取数来源</div>
    ${textRow('页面服务函数', 'fc-serviceFn', p.serviceFn || '', '页面服务函数名，优先于默认接口', 'page-services-list')}
    ${textRow('默认接口地址', 'fc-apiPath', p.apiPath || '/api/flexible-combination/rule', '/api/flexible-combination/rule')}
    <details style="margin-top:10px;">
      <summary style="cursor:pointer;font-size:12px;color:var(--sapContent_LabelColor,#6a6d70);user-select:none;">高级 · 内联规则（${p.inlineData ? '已配置' : '未配置'}，不连后端直接出列）</summary>
      <div class="model-prop-hint" style="margin:8px 0 4px;">规则 JSON 内联在页面上，开页即出列且<b>不再请求后端档案</b>。仅支持 inline fields 方言（管理页导出的 use/pick 形态不展开，会出空列）；多规则须带 anchor 或只留一条。适用于设计器预览 / demo。</div>
      ${textareaRow('内联规则', 'fc-inlineData', p.inlineData ? JSON.stringify(p.inlineData, null, 2) : '', '{"rule":{...},"dimensions":{}}', 10)}
      <div id="fc-inlineData-status" class="model-prop-hint"></div>
    </details>
    ${modelDatalist(ctx.pageData, 'CmxColumnModel', 'model-columnmodel-list')}
    ${serviceDatalist(ctx.pageData)}
  `;
  bindModelId(mount, '#fc-instanceId', model, onChange);
  bindInput(mount, '#fc-scenario', (v) => { p.scenario = v; onChange(); });
  bindInput(mount, '#fc-serviceFn', (v) => { p.serviceFn = v; onChange(); });
  bindInput(mount, '#fc-apiPath', (v) => { p.apiPath = v; onChange(); });

  // ── 目标列模型：按表绑定行编辑器，提交为 { 表名: 列模型ID }（'*' 为兜底）──
  const statusEl = mount.querySelector('#fc-columnModelId-status');
  const rowsEl = mount.querySelector('[data-fc-rows]');
  const commitMulti = () => {
    const map = {};
    let incomplete = 0;
    mount.querySelectorAll('[data-fc-row]').forEach((row) => {
      const t = row.querySelector('[data-fc-table]').value.trim();
      const id = row.querySelector('[data-fc-model]').value.trim();
      if (t && id) map[t] = id;
      else if (t || id) incomplete++;
    });
    p.columnModelId = map;
    if (incomplete) {
      statusEl.className = 'model-prop-hint error';
      statusEl.textContent = `有 ${incomplete} 行未填完整（表名与列模型都填才生效）`;
    } else {
      statusEl.className = 'model-prop-hint ok';
      statusEl.textContent = fcTargetsHint(map);
    }
    onChange();
  };
  rowsEl?.addEventListener('input', (e) => {
    if (e.target.closest('[data-fc-row]')) commitMulti();
  });
  rowsEl?.addEventListener('click', (e) => {
    const del = e.target.closest('[data-fc-del]');
    if (del) {
      del.closest('[data-fc-row]').remove();
      commitMulti();
    }
  });
  mount.querySelector('[data-fc-add]')?.addEventListener('click', () => {
    rowsEl.insertAdjacentHTML('beforeend', fcBindingRowsHtml({ '': '' }));
    commitMulti();
  });

  const inlineEl = mount.querySelector('#fc-inlineData');
  const statusInline = mount.querySelector('#fc-inlineData-status');
  inlineEl?.addEventListener('input', () => {
    const txt = inlineEl.value.trim();
    if (!txt) {
      delete p.inlineData;
      statusInline.textContent = '';
      onChange();
      return;
    }
    try {
      const obj = JSON.parse(txt);
      if (!obj || typeof obj !== 'object') throw new Error('需要为 JSON 对象');
      p.inlineData = obj;
      statusInline.className = 'model-prop-hint ok';
      statusInline.textContent = Array.isArray(obj.rules) ? `多规则配置已就绪（${obj.rules.length} 条）` : 'JSON 已解析';
      onChange();
    } catch (err) {
      statusInline.className = 'model-prop-hint error';
      statusInline.textContent = 'JSON 解析失败：' + (err?.message || err);
    }
  });
}

/**
 * 显示视图归一：旧 string 值（单绑定）展示为 '*' 兜底行；object 原样；空值为空行。
 * 仅用于渲染，首次编辑后即落为对象形态提交（运行时两种形态均兼容）。
 */
function fcBindingsView (v) {
  if (v && typeof v === 'object') return v;
  if (typeof v === 'string' && v) return { '*': v };
  return {};
}

/** 多绑定行编辑器 HTML：每行「表名 → 列模型（datalist 候选）」；空 map 渲染一行空行。 */
function fcBindingRowsHtml (map) {
  const entries = Object.entries(map || {});
  const rows = entries.length ? entries : [['', '']];
  return rows.map(([t, id]) => `
    <div class="model-prop-row" data-fc-row style="display:flex;gap:4px;align-items:center;margin-bottom:4px;">
      <input data-fc-table value="${escAttr(t)}" placeholder="表名，如 cv_acc_line" class="model-prop-input" style="flex:1;min-width:0;">
      <span style="color:var(--sapContent_NonInteractiveIconColor,#89919a);">→</span>
      <input data-fc-model value="${escAttr(id)}" list="model-columnmodel-list" placeholder="列模型 instanceId" class="model-prop-input" style="flex:1;min-width:0;">
      <button type="button" data-fc-del title="删除该绑定" style="padding:2px 6px;cursor:pointer;border:none;background:transparent;color:var(--sapButton_Negative_TextColor,#bb0007);font-size:13px;">✕</button>
    </div>
  `).join('');
}

/** 绑定形态的状态提示文案。 */
function fcTargetsHint(v) {
  const map = v && typeof v === 'object' ? v : null;
  if (!map) return '';
  const keys = Object.keys(map);
  if (!keys.length) return '';
  const hasFallback = keys.includes('*');
  const named = hasFallback ? keys.filter((k) => k !== '*') : keys;
  const tail = hasFallback ? '，* 为兜底' : '';
  return `绑定 ${named.length} 张表${tail}：${named.map((k) => `${k}→${map[k]}`).join('、')}`;
}

function bindModelId(mount, selector, model, onChange) {
  const el = mount.querySelector(selector);
  if (!el) return;
  el.addEventListener('input', () => {
    model.instanceId = el.value;
    onChange();
  });
  el.addEventListener('change', () => {
    model.instanceId = String(el.value || '').trim();
    el.value = model.instanceId;
    onChange();
  });
}

function bindInput(mount, selector, write) {
  const el = mount.querySelector(selector);
  if (!el) return;
  el.addEventListener('input', () => write(el.value));
}

function bindSelect(mount, selector, write) {
  const el = mount.querySelector(selector);
  if (!el) return;
  el.addEventListener('change', () => write(el.value));
}

function bindCheckbox(mount, selector, write) {
  const el = mount.querySelector(selector);
  if (!el) return;
  el.addEventListener('change', () => write(!!el.checked));
}

function columnFieldCtx(model) {
  const fields = Array.isArray(model?.props?.columns) ? model.props.columns : (Array.isArray(model?.props?.fields) ? model.props.fields : []);
  const dims = fields
    .filter((f) => f?.dimType === 'dimension')
    .map((f) => f.refDict || fieldId(f))
    .filter(Boolean);
  const attrsOf = (dimCode) => {
    if (!dimCode) return [''];
    const dim = fields.find((f) => fieldId(f) === dimCode || f.refDict === dimCode);
    const attrs = Array.isArray(dim?.attributes) ? dim.attributes : Object.keys(dim?.attributes || {});
    return ['', ...attrs];
  };
  return {
    end: 'FLC',
    dimensionCodes: dims,
    attrOptions: (field, which) => attrsOf(which === 'defaultFrom' ? field?.defaultFrom?.dimension : field?.source?.dimension),
    refDictOptions: () => ['', ...dims],
    refFieldOptions: (field) => attrsOf(field?.refDict),
  };
}

function inputRawValue(el) {
  if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) return el.checked;
  return el.value;
}

/** 通用点路径写入（供 enumValues.* 等数组路径用）。适配器 setPath 不支持数组下标，故单独实现。 */
function writeEnumPath(field, path, rawValue) {
  const segs = path.split('.');
  const leaf = segs.pop();
  let node = field;
  for (let si = 0; si < segs.length; si++) {
    const seg = segs[si];
    const k = /^\d+$/.test(seg) ? Number(seg) : seg;
    const nextIsNum = /^\d+$/.test(segs[si + 1] || '');
    if (node[k] == null || typeof node[k] !== 'object') node[k] = nextIsNum ? [] : {};
    node = node[k];
  }
  const leafKey = /^\d+$/.test(leaf) ? Number(leaf) : leaf;
  if (rawValue === '' || rawValue == null) {
    if (Array.isArray(node)) node.splice(Number(leafKey), 1);
    else delete node[leafKey];
  } else {
    node[leafKey] = rawValue;
  }
}

function columnToContextField(column) {
  normalizeColumn(column);
  return {
    ...deepClone(column || {}),
    id: column.id || '',
    name: column.name || '',
    caption: column.caption && typeof column.caption === 'object' ? deepClone(column.caption) : { zh_CN: String(column.caption || column.id || '') },
    dataType: column.dataType || 'VARCHAR',
  };
}

function applyContextFieldToColumn(column, field) {
  const next = contextFieldToColumn(field);
  for (const key of Object.keys(column)) delete column[key];
  Object.assign(column, next);
  return column;
}

function contextFieldToColumn(field) {
  const src = deepClone(field || {});
  const id = src.id || '';
  const column = {
    ...src,
    id,
    caption: src.caption || { zh_CN: id },
    edit: { ...(src.edit || {}) },
    display: { ...(src.display || {}) },
    dataType: src.dataType || 'VARCHAR',
  };
  return normalizeColumn(column);
}

function normalizeColumn(column) {
  if (!column || typeof column !== 'object') return column;
  const id = column.id || '';
  column.id = id;
  column.caption = column.caption || { zh_CN: id };
  column.dataType = column.dataType || 'VARCHAR';
  column.edit = column.edit && typeof column.edit === 'object' ? column.edit : {};
  column.display = column.display && typeof column.display === 'object' ? column.display : {};
  if (column.edit.required != null) column.required = column.edit.required;
  if (column.display.decimalDigits != null) column.decimalDigits = column.display.decimalDigits;
  delete column.label;
  delete column.align;
  delete column.type;
  delete column.editMode;
  delete column.fieldName;
  delete column.fieldComment;
  return column;
}

function textRow(label, id, value, placeholder = '', list = '') {
  return `
    <div class="model-prop-row">
      <label class="model-prop-label" for="${escAttr(id)}">${esc(label)}</label>
      <input id="${escAttr(id)}" class="model-prop-input" value="${escAttr(value || '')}" placeholder="${escAttr(placeholder)}"${list ? ` list="${escAttr(list)}"` : ''} />
    </div>
  `;
}

function selectRow(label, id, value, options) {
  return `
    <div class="model-prop-row">
      <label class="model-prop-label" for="${escAttr(id)}">${esc(label)}</label>
      <select id="${escAttr(id)}" class="model-prop-input">
        ${options.map(([v, text]) => `<option value="${escAttr(v)}" ${value === v ? 'selected' : ''}>${esc(text)}</option>`).join('')}
      </select>
    </div>
  `;
}

function textareaRow(label, id, value, placeholder = '', rows = 6) {
  return `
    <div class="model-prop-row">
      <label class="model-prop-label" for="${escAttr(id)}">${esc(label)}</label>
      <textarea id="${escAttr(id)}" class="model-prop-input model-prop-textarea" rows="${rows}" placeholder="${escAttr(placeholder)}">${esc(value || '')}</textarea>
    </div>
  `;
}

function checkboxRow(label, id, checked) {
  return `
    <label class="model-prop-check">
      <input id="${escAttr(id)}" type="checkbox" ${checked ? 'checked' : ''} />
      <span>${esc(label)}</span>
    </label>
  `;
}

function numberRow(label, id, value, placeholder = '') {
  return `
    <div class="model-prop-row">
      <label class="model-prop-label" for="${escAttr(id)}">${esc(label)}</label>
      <input id="${escAttr(id)}" type="number" class="model-prop-input" value="${escAttr(value == null ? '' : value)}" placeholder="${escAttr(placeholder)}" />
    </div>
  `;
}

function bindNumber(mount, selector, write) {
  const el = mount.querySelector(selector);
  if (!el) return;
  el.addEventListener('input', () => {
    const raw = el.value.trim();
    if (!raw) { write(undefined); return; }
    const n = Number(raw);
    if (!Number.isNaN(n)) write(n);
  });
}

function setMaybe(obj, key, value) {
  if (!obj || typeof obj !== 'object') return;
  if (value === '' || value == null) delete obj[key];
  else obj[key] = value;
}

function setNumberMaybe(obj, key, value) {
  if (!obj || typeof obj !== 'object') return;
  const raw = String(value ?? '').trim();
  if (!raw) { delete obj[key]; return; }
  const n = Number(raw);
  if (!Number.isNaN(n)) obj[key] = n;
}

function textValue(value) {
  if (value == null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function syncCompat(column) {
  if (!column.display || typeof column.display !== 'object') column.display = {};
  if (!column.edit || typeof column.edit !== 'object') column.edit = {};
  column.displayMode = column.display.mode || column.displayMode || 'text';
  column.required = column.edit.required ?? column.required ?? false;
  delete column.label;
  delete column.align;
  delete column.type;
  delete column.editMode;
}

function modelDatalist(pageData, modelType, id) {
  const models = (pageData?._models || []).filter((m) => m.modelType === modelType && m.instanceId);
  return `<datalist id="${escAttr(id)}">${models.map((m) => `<option value="${escAttr(m.instanceId)}"></option>`).join('')}</datalist>`;
}

function serviceDatalist(pageData) {
  const services = (pageData?._pageServices || []).filter((s) => s.name);
  return `<datalist id="page-services-list">${services.map((s) => `<option value="${escAttr(s.name)}"></option>`).join('')}</datalist>`;
}

function columnDatalist(nodes, id) {
  return `<datalist id="${escAttr(id)}">${flatColumnIds(nodes).map((col) => `<option value="${escAttr(col)}"></option>`).join('')}</datalist>`;
}

function fieldDatalist(props, id) {
  const fields = Array.isArray(props?.columns) ? props.columns : (Array.isArray(props?.fields) ? props.fields : []);
  return `<datalist id="${escAttr(id)}">${fields.map((f) => fieldId(f)).filter(Boolean).map((col) => `<option value="${escAttr(col)}"></option>`).join('')}</datalist>`;
}

function flatColumnIds(nodes) {
  const ids = [];
  for (const n of nodes || []) {
    if (!n) continue;
    if (!n.__type && n.id) ids.push(n.id);
    if (Array.isArray(n.children)) ids.push(...flatColumnIds(n.children));
  }
  return ids;
}

