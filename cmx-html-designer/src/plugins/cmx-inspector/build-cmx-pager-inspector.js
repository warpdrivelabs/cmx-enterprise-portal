/**
 * cmx-pager 专用 Inspector：
 *   - 模式切换（独立 / 协作）由 master-slave-id 是否填写自动判定
 *   - 协作字段：协调器实例、分页层
 *   - 通用字段：初始每页大小、每页大小选项、紧凑模式
 *   - 独立字段：总条数（仅独立模式有意义，协作模式下灰显并提示）
 *
 * UI 风格与 build-cmx-web-treeview-inspector.js 一致（中文 label、sap 变量配色）。
 *
 * 当用户切换 master-slave-id（进入/退出协作模式）时，整个面板会重渲染，
 * 让"总条数"等字段根据模式启用/灰显。
 */
import { buildModelSelectRow } from './model-select-helper.js'

function buildTextRow ({ label, placeholder, currentVal, onInput, type = 'text', disabled = false, hint = '' }) {
  const wrap = document.createElement('div')
  wrap.style.cssText = 'margin-bottom: 0.35rem;'

  const lbl = document.createElement('div')
  lbl.style.cssText = 'font-size: 0.72rem; color: var(--sapContent_LabelColor); font-weight: 500; margin-bottom: 2px;'
  lbl.textContent = label
  wrap.appendChild(lbl)

  const inp = document.createElement('input')
  inp.className = 'model-attr-input'
  inp.type = type
  inp.style.cssText = 'width: 100%; padding: 0.1rem 0.3rem; border: 1px solid var(--sapField_BorderColor, #8fb4d9); border-radius: 3px; background: var(--sapField_Background, #1a2b40); color: var(--sapField_TextColor, #e2e8f0); font-size: 0.78rem; box-sizing: border-box;'
  if (disabled) {
    inp.disabled = true
    inp.style.opacity = '0.5'
    inp.style.cursor = 'not-allowed'
  }
  inp.placeholder = placeholder
  inp.value = currentVal || ''
  inp.addEventListener('input', (e) => onInput(e.target.value))
  wrap.appendChild(inp)

  if (hint) {
    const h = document.createElement('div')
    h.style.cssText = 'font-size: 0.68rem; color: var(--sapContent_LabelColor); opacity: 0.7; margin-top: 2px;'
    h.textContent = hint
    wrap.appendChild(h)
  }

  return wrap
}

function buildToggleRow ({ label, currentVal, onInput }) {
  const wrap = document.createElement('div')
  wrap.style.cssText = 'margin-bottom: 0.35rem; display: flex; align-items: center; gap: 6px;'

  const cb = document.createElement('input')
  cb.type = 'checkbox'
  // 默认未设属性 = false；只有显式 compact="true" 才勾选
  cb.checked = currentVal === 'true'
  cb.style.cssText = 'cursor: pointer;'
  cb.addEventListener('change', (e) => onInput(e.target.checked ? 'true' : ''))

  const lbl = document.createElement('label')
  lbl.style.cssText = 'font-size: 0.78rem; color: var(--sapField_TextColor, #e2e8f0); cursor: pointer;'
  lbl.textContent = label
  lbl.addEventListener('click', () => { cb.click() })

  wrap.appendChild(cb)
  wrap.appendChild(lbl)
  return wrap
}

function buildSectionTitle (text) {
  const t = document.createElement('div')
  t.style.cssText = 'font-size: 0.72rem; color: var(--sapContent_LabelColor); font-weight: 600; margin: 0.6rem 0 0.3rem; padding-bottom: 2px; border-bottom: 1px dashed var(--sapList_BorderColor, #3a4a5e);'
  t.textContent = text
  return t
}

export function buildCmxPagerInspector (ctx) {
  const { node, mount, onChange, pageData } = ctx

  // 局部重渲染：切换 master-slave-id 时让面板整体重建（字段启用/灰显跟随模式变化）
  // onChange 只派事件给外层框架，不会自动重渲染本面板，所以这里自己实现。
  const render = () => {
    mount.innerHTML = ''

    // 顶部说明
    const head = document.createElement('div')
    head.style.cssText = 'padding: 0.4rem 0 0.6rem; color: var(--sapContent_LabelColor); font-size: 0.78rem; line-height: 1.4;'
    head.textContent = '分页栏（cmx-pager）。默认独立工作（自管页码/总数状态，派发 page-change 事件）；填写「协调器实例」后自动进入协作模式，操作转发到协调器。'
    mount.appendChild(head)

    const isCoop = !!node.getAttribute('master-slave-id')

    // ─── 协作模式字段 ─────────────────────────────────────────────
    mount.appendChild(buildSectionTitle('协作模式（可选）'))
    mount.appendChild(buildModelSelectRow({
      pageData,
      modelType:   'CmxMasterSlave',
      label:       '协调器实例（留空 = 独立模式）',
      placeholder: '例如 ms',
      currentVal:  node.getAttribute('master-slave-id') || '',
      onInput: (v) => {
        v ? node.setAttribute('master-slave-id', v) : node.removeAttribute('master-slave-id')
        render()         // 模式切换，整体重建
        onChange()
      },
    }))
    mount.appendChild(buildTextRow({
      label:       '分页层（可选）',
      placeholder: '留空自动用根层',
      currentVal:  node.getAttribute('layer') || '',
      disabled:    !isCoop,
      hint:        isCoop ? '留空时自动取协调器根层（推荐）；显式填写可覆盖' : '仅在协作模式下有效',
      onInput: (v) => {
        v ? node.setAttribute('layer', v) : node.removeAttribute('layer')
        onChange()
      },
    }))

    // ─── 通用字段 ─────────────────────────────────────────────────
    mount.appendChild(buildSectionTitle('通用'))
    mount.appendChild(buildTextRow({
      label:       '初始每页大小',
      placeholder: '50',
      type:        'number',
      currentVal:  node.getAttribute('page-size') || '',
      hint:        isCoop ? '协作模式下首次加载的每页条数（分页的唯一来源）' : '组件首次加载的每页条数',
      onInput: (v) => {
        v ? node.setAttribute('page-size', v) : node.removeAttribute('page-size')
        onChange()
      },
    }))
    mount.appendChild(buildTextRow({
      label:       '每页大小选项',
      placeholder: '50,100,200',
      currentVal:  node.getAttribute('page-sizes') || '',
      hint:        'CSV 格式，下拉框的可选条数',
      onInput: (v) => {
        v ? node.setAttribute('page-sizes', v) : node.removeAttribute('page-sizes')
        onChange()
      },
    }))
    mount.appendChild(buildToggleRow({
      label:      '紧凑模式（隐藏首页/末页按钮）',
      currentVal: node.getAttribute('compact') || '',
      onInput: (v) => {
        v ? node.setAttribute('compact', v) : node.removeAttribute('compact')
        onChange()
      },
    }))

    // ─── 独立模式字段 ─────────────────────────────────────────────
    mount.appendChild(buildSectionTitle('独立模式（仅独立模式生效）'))
    mount.appendChild(buildTextRow({
      label:       '总条数',
      placeholder: '留空 = 未知（运行时回填）',
      type:        'number',
      currentVal:  node.getAttribute('total') || '',
      disabled:    isCoop,
      hint:        isCoop
        ? '协作模式下由协调器自动覆盖，此处不可用'
        : '静态总数。运行时可用 pager.total = N 回填，组件会自动算总页数',
      onInput: (v) => {
        v ? node.setAttribute('total', v) : node.removeAttribute('total')
        onChange()
      },
    }))

    // 模式提示
    const modeHint = document.createElement('div')
    modeHint.style.cssText = 'margin-top: 0.4rem; padding: 0.3rem 0.4rem; font-size: 0.7rem; border-radius: 3px; background: var(--sapInformation_Background, #1c2c45); color: var(--sapContent_LabelColor);'
    if (isCoop) {
      modeHint.innerHTML = '📌 当前：<b>协作模式</b>。操作自动转发到协调器，状态由协调器同步。'
    } else {
      modeHint.innerHTML = '📌 当前：<b>独立模式</b>。组件自管状态，需监听 page-change 事件实现数据加载。'
    }
    mount.appendChild(modeHint)
  }

  render()
}
