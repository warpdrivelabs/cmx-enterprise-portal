/**
 * cmx-checkbox-field-type - 复选框/布尔字段类型（grid 端）
 *
 * 副作用注册 'checkbox' 类型：TINYINT 0/1 勾选，行内编辑用 <ui5-checkbox>，显示态渲染 ✓/空心框。
 * form 端不注册--cmx-ui5-form 内置 switch 已处理 checkbox（commit 布尔语义），此处不覆盖以免破坏。
 *
 * 独立成模块（同 cmx-dict-field-type.js 模式）：便于单独 import 启用（不拉 combo/ignite 等重依赖），
 * 也便于单测（测试 import 本文件即可验证注册，不必加载 igniteui-webcomponents）。
 *
 * 视觉：全部用 --sap* 主题变量，跟随 Fiori/Horizon/Neo 主题。
 *   - 显示态：已勾选 -> 绿色 ✓（--sapPositiveColor）；未勾选 -> 灰色空心框（--sapNeutralBorderColor），
 *     避免单元格空白；列需 display.align='center' 让内容水平居中（由调用方 buildColumnModel 设置）。
 *   - 编辑态：<ui5-checkbox> 居中，editor 槽背景透明（:has 规则见 cmx-revo-grid），融入行背景。
 *
 * 交互链路：
 *   点击单元格 -> revo 渲染 editor -> componentDidRender 挂 <ui5-checkbox>（聚焦）
 *   -> change -> save(0/1) + close -> revo afteredit -> cmx-cell-changed（data-editor 收集变更）。
 */
import { registerFieldType } from './cmx-form-field-registry.js'
import '@ui5/webcomponents/dist/CheckBox.js'
import '@ui5/webcomponents/dist/Icon.js'

/** 布尔值归一：1 / '1' / true / 'true' -> true，其余 false。 */
const _toBool = (v) => v === 1 || v === true || v === '1' || v === 'true'

registerFieldType('checkbox', {
  description: '复选框/布尔（TINYINT 0/1 勾选；grid 行内编辑 <ui5-checkbox>）',
  grid: {
    editor (colData, save, close) {
      const prop = colData?.prop ?? colData?.column?.prop
      const initial = colData?.model ? colData.model[prop] : null
      const ed = {
        el: null,
        render (h) {
          // class 故意不含 "-editor-slot"：避开 cmx-revo-grid shadow CSS 的
          // `revogr-edit > [class*="-editor-slot"] { display:block !important }` 撑满规则，
          // 改用 flex 居中 + 透明背景，让 <ui5-checkbox> 紧凑居中、融入行主题（无大白底）。
          return h('div', { class: 'cmx-checkbox-edit',
            style: { display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '100%', height: '100%', boxSizing: 'border-box', background: 'transparent' } })
        },
        componentDidRender () {
          if (ed.el && ed.el.isConnected) return
          const root = this.element
          if (!root) return
          const mount = (root.querySelector && root.querySelector('.cmx-checkbox-edit')) || root
          const cb = document.createElement('ui5-checkbox')
          cb.checked = _toBool(initial)
          cb.addEventListener('change', () => { save(cb.checked ? 1 : 0); close() })
          mount.appendChild(cb)
          ed.el = cb
          requestAnimationFrame(() => { try { cb.focus?.() } catch (_) {} })
        },
        getValue () { return ed.el ? (ed.el.checked ? 1 : 0) : initial },
        beforeAutoSave (val) { return Number(val) !== Number(initial) },
      }
      return ed
    },
    cellTemplate (h, props) {
      const v = props.model?.[props.prop]
      if (_toBool(v)) {
        // 已勾选：绿色 ✓（主题正色）
        return h('ui5-icon', { name: 'accept',
          style: { color: 'var(--sapPositiveColor,#107e3e)', width: '.9rem', height: '.9rem' } })
      }
      // 未勾选：灰色空心框（视觉占位，避免单元格空白；主题中性边色）
      return h('span', { class: 'cmx-cb-empty',
        style: { display: 'inline-block', width: '.85rem', height: '.85rem',
          border: '1.5px solid var(--sapNeutralBorderColor,#89919e)',
          borderRadius: '2px', background: 'transparent',
          verticalAlign: 'middle', boxSizing: 'border-box' } })
    },
  },
})
