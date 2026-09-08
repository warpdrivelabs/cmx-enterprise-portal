import { esc } from '../../utils/esc.js'
/**
 * CmxMasterSlave 属性设置面板
 *
 * 这里只保留 Schema 路径树与聚合规则；普通属性在右侧 Property 区域编辑。
 */
export function buildMasterSlaveProps({ instance, mount, allModels, onChange }) {
  const p = instance.props

  mount.innerHTML = `
    <div class="props-header">
      <span class="props-type-badge" data-kind="masterslave">主从协调器</span>
    </div>

    <div class="prop-section-title">路径树（Schema）</div>
    <div class="prop-hint">实例名在右侧属性区域编辑。</div>
    <div class="prop-hint">每行一个路径节点（支持子节点缩进表示层级）</div>
    <div id="ms-schema-list" class="schema-list"></div>
    <button class="prop-add-btn" id="ms-add-schema">＋ 添加根节点</button>

    <div class="prop-section-title">聚合规则</div>
    <div id="ms-agg-list" class="agg-list"></div>
    <button class="prop-add-btn" id="ms-add-agg">＋ 添加聚合规则</button>
  `

  // Schema 渲染（每个节点：id + 父节点选择）
  const renderSchema = () => {
    const list = mount.querySelector('#ms-schema-list')
    list.innerHTML = ''
    const nodes = p.schema || []
    const renderNode = (node, depth) => {
      const row = document.createElement('div')
      row.className = 'schema-row'
      row.style.paddingLeft = `${depth * 16}px`
      row.innerHTML = `
        <input class="prop-input-sm" placeholder="路径 id（如 orderForm）" value="${esc(node.id || '')}" />
        <span class="schema-arr">${depth > 0 ? '└' : '┐'}</span>
        <button class="prop-add-btn-xs" title="添加子节点" data-parent="${esc(node.id || '')}">+子</button>
        <button class="child-del-btn" title="删除">×</button>
      `
      const idInp = row.querySelector('.prop-input-sm')
      idInp.addEventListener('input', (e) => { node.id = e.target.value; onChange() })
      row.querySelector('[title="添加子节点"]').addEventListener('click', () => {
        if (!node.children) node.children = []
        node.children.push({ id: '' })
        onChange(); renderSchema()
      })
      row.querySelector('.child-del-btn').addEventListener('click', () => {
        _removeSchemaNode(nodes, node.id)
        onChange(); renderSchema()
      })
      list.appendChild(row)
      ;(node.children || []).forEach((ch) => renderNode(ch, depth + 1))
    }
    nodes.forEach((n) => renderNode(n, 0))
    // 重新绑定
    mount.querySelector('#ms-add-schema').onclick = () => {
      if (!p.schema) p.schema = []
      p.schema.push({ id: '' })
      onChange(); renderSchema()
    }
  }

  // 聚合规则渲染
  const AGG_OPTS = ['sum', 'avg', 'min', 'max', 'count']
  const renderAgg = () => {
    const list = mount.querySelector('#ms-agg-list')
    list.innerHTML = ''
    ;(p.aggregations || []).forEach((rule, i) => {
      const row = document.createElement('div')
      row.className = 'agg-row'
      row.innerHTML = `
        <div class="agg-fields">
          <div class="agg-field-group">
            <label>from</label>
            <input class="prop-input-xs" value="${esc(rule.from || '')}" placeholder="路径" />
          </div>
          <div class="agg-field-group">
            <label>agg</label>
            <select class="prop-select-xs">
              ${AGG_OPTS.map((a) => `<option value="${a}" ${rule.agg === a ? 'selected' : ''}>${a}</option>`).join('')}
            </select>
          </div>
          <div class="agg-field-group">
            <label>field</label>
            <input class="prop-input-xs" value="${esc(rule.field || '')}" placeholder="字段名" />
          </div>
          <div class="agg-field-group">
            <label>to</label>
            <input class="prop-input-xs" value="${esc(rule.to || '')}" placeholder="路径" />
          </div>
          <div class="agg-field-group">
            <label>toField</label>
            <input class="prop-input-xs" value="${esc(rule.toField || '')}" placeholder="写入字段" />
          </div>
        </div>
        <button class="child-del-btn" title="删除">×</button>
      `
      const [fromInp, aggSel, fieldInp, toInp, toFieldInp] = [
        ...row.querySelectorAll('.prop-input-xs'),
        row.querySelector('.prop-select-xs'),
      ]
      row.querySelectorAll('.prop-input-xs')[0].addEventListener('input', (e) => { rule.from    = e.target.value; onChange() })
      row.querySelector('.prop-select-xs').addEventListener('change',    (e) => { rule.agg     = e.target.value; onChange() })
      row.querySelectorAll('.prop-input-xs')[1].addEventListener('input', (e) => { rule.field   = e.target.value; onChange() })
      row.querySelectorAll('.prop-input-xs')[2].addEventListener('input', (e) => { rule.to      = e.target.value; onChange() })
      row.querySelectorAll('.prop-input-xs')[3].addEventListener('input', (e) => { rule.toField = e.target.value; onChange() })
      row.querySelector('.child-del-btn').addEventListener('click', () => {
        p.aggregations.splice(i, 1); onChange(); renderAgg()
      })
      list.appendChild(row)
    })
    mount.querySelector('#ms-add-agg').onclick = () => {
      if (!p.aggregations) p.aggregations = []
      p.aggregations.push({ from: '', agg: 'sum', field: '', to: '', toField: '' })
      onChange(); renderAgg()
    }
  }

  renderSchema()
  renderAgg()
}

function _removeSchemaNode(nodes, id) {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === id) { nodes.splice(i, 1); return true }
    if (nodes[i].children && _removeSchemaNode(nodes[i].children, id)) return true
  }
  return false
}

