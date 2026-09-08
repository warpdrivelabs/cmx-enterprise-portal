/**
 * <designer-left-panel> — 左侧标签调色板
 *
 * 使用自定义可折叠分组 + 可拖拽标签项。
 * 交互控件使用 ui5-title；不依赖 ui5-panel 的 slot 机制。
 */
import registry from '../metadata/tag-registry.js';
import { escapeAttr, escapeHtml } from '../utils/html-utils.js';
import { resolvePaletteTagIconName } from '../utils/palette-tag-icon.js';
import { DesignerBaseComponent } from './designer-base-component.js';

/** 分组标题用：优先 iconName；否则若 icon 为 kebab-case 则视为 SAP 图标名 */
function resolveGroupSymbolIconName(group) {
  if (group.iconName) return group.iconName;
  const legacy = group.icon != null ? String(group.icon).trim() : '';
  if (legacy && /^[a-z0-9]+(-[a-z0-9]+)*$/i.test(legacy)) return legacy;
  return null;
}

function groupSymbolHtml(group) {
  const name = resolveGroupSymbolIconName(group);
  if (name) return `<ui5-icon class="palette-group-symbol" name="${escapeAttr(name)}"></ui5-icon>`;
  const fallback = group.icon != null ? String(group.icon) : '◇';
  return `<span class="palette-group-symbol-fallback">${escapeHtml(fallback)}</span>`;
}

const STYLE = `
  :host {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  /* ── 滚动区 ── */
  .scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 0;
    /* block 布局：子项自然堆叠，不会被 flex shrink 压缩 */
    display: block;
    scrollbar-width: thin;
  }

  /* ── 分组 ── */
  .group {
    border: none;
    border-radius: 0;
    overflow: hidden;
  }

  .group-header {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 7px 10px;
    background: var(--sapGroup_TitleBackground, #0b1220);
    cursor: pointer;
    user-select: none;
    font-size: 12px;
    font-weight: 600;
    color: var(--sapContent_LabelColor, #8fa7c0);
    border-bottom: none;
    transition: background 0.15s;
  }
  .group-header:hover {
    background: var(--sapList_Hover_Background, #1a2b40);
    color: var(--sapTextColor, #e2e8f0);
  }
  .group-header.open {
    color: var(--sapTextColor, #e2e8f0);
  }

  .palette-group-symbol {
    flex-shrink: 0;
    font-size: 14px;
    color: var(--sapContent_IconColor, #a9b8c9);
    width: 1rem;
    height: 1rem;
  }
  .group[data-g="ui5"]   .palette-group-symbol,
  .group[data-g="fiori"] .palette-group-symbol {
    color: var(--sapBrandColor, #0070f2);
  }
  .palette-group-symbol-fallback { font-size: 13px; flex-shrink: 0; line-height: 1; }
  .group-label  { font-size: 12px; font-weight: 600; flex: 1; }
  .group-count  {
    font-size: 10px;
    background: var(--sapButton_Lite_Background, rgba(0, 112, 242, 0.10));
    color: var(--sapButton_Lite_TextColor, var(--sapHighlightColor, #0070f2));
    border: 1px solid var(--sapButton_Lite_BorderColor, rgba(0, 112, 242, 0.24));
    padding: 1px 6px;
    border-radius: 99px;
  }
  .palette-group-arrow {
    flex-shrink: 0;
    font-size: 12px;
    width: 0.875rem;
    height: 0.875rem;
    opacity: 0.55;
    color: var(--sapContent_NonInteractiveIconColor, #6c8093);
    transition: transform 0.2s;
  }
  .group-header.open .palette-group-arrow { transform: rotate(90deg); }

  /* ── 标签项列表 ── */
  .group-items {
    display: none;
    flex-direction: column;
    padding: 0;
    gap: 0;
    background: var(--sapBackgroundColor, #1d2d3e);
  }
  .group-items.open { display: flex; }

  .tag-item.model-only {
    border-left: 2px solid var(--sapCriticalElementColor, #b45309);
    opacity: 0.9;
  }
  .tag-item.model-only .tag-item-symbol { color: var(--sapCriticalTextColor, #b45309); }
  .tag-item.model-only::after {
    content: "MODEL";
    font-size: 9px;
    color: var(--sapCriticalTextColor, #b45309);
    border: 1px solid var(--sapCriticalElementColor, #b45309);
    border-radius: 2px;
    padding: 0 2px;
    margin-left: auto;
    flex-shrink: 0;
  }
  .group-empty {
    font-size: 11px;
    color: var(--sapContent_NonInteractiveIconColor, #6c8093);
    border: 1px dashed var(--sapGroup_TitleBorderColor, #2c4a6e);
    border-radius: 6px;
    padding: 8px 10px;
    background: var(--sapInformationElementColor, #13263a);
  }

  /* ── 搜索框 ── */
  .search-wrap {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    background: var(--sapGroup_TitleBackground, #0b1220);
    flex-shrink: 0;
  }
  .search-wrap .search-symbol {
    flex-shrink: 0;
    font-size: 14px;
    width: 1rem;
    height: 1rem;
    color: var(--sapContent_NonInteractiveIconColor, #6c8093);
  }
  .search-wrap ui5-input {
    flex: 1;
    min-width: 0;
  }

  /* ── 单个可拖拽标签项 ── */
  .tag-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 8px;
    cursor: grab;
    user-select: none;
    border: none;
    transition: background 0.12s;
  }
  .tag-item:hover {
    background: var(--sapList_Hover_Background, #1a2b40);
  }
  .tag-item:active { cursor: grabbing; }

  .tag-item-symbol {
    flex-shrink: 0;
    font-size: 13px;
    width: 0.875rem;
    height: 0.875rem;
    color: var(--sapContent_NonInteractiveIconColor, #6c8093);
  }
  .group[data-g="ui5"]   .tag-item-symbol,
  .group[data-g="fiori"] .tag-item-symbol {
    color: var(--sapBrandColor, #0070f2);
    opacity: 0.92;
  }

  /* 标签名：等宽字体，不同组颜色不同 */
  .tag-name {
    font-family: Consolas, 'Courier New', monospace;
    font-size: 11px;
    font-weight: 600;
    flex-shrink: 0;
    min-width: 96px;
    color: var(--sapContent_LabelColor, #8fa7c0);
  }
  .group[data-g="ui5"]   .tag-name,
  .group[data-g="fiori"] .tag-name {
    color: var(--sapBrandColor, #0070f2);
  }

  .tag-desc {
    font-size: 11px;
    color: var(--sapContent_NonInteractiveIconColor, #6c8093);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }
`;

export class DesignerLeftPanel extends DesignerBaseComponent {
  styles() { return STYLE; }

  template() {
    return `
      <div class="search-wrap">
        <ui5-icon class="search-symbol" name="search"></ui5-icon>
        <ui5-input id="search" placeholder="搜索标签..." show-clear-icon></ui5-input>
      </div>
      <div class="scroll" id="root"></div>
    `;
  }

  init() {
    this._render();
    this.shadowRoot.getElementById('search').addEventListener('input', (e) => {
      this._filter(e.target.value.trim().toLowerCase());
    });
    this._onPluginRegistered = () => this._render();
    window.addEventListener('cmx:plugin-registered', this._onPluginRegistered);
  }

  cleanup() {
    window.removeEventListener('cmx:plugin-registered', this._onPluginRegistered);
  }

  _filter(q) {
    const root = this.shadowRoot.getElementById('root');
    root.querySelectorAll('.group').forEach((group) => {
      let visible = 0;
      group.querySelectorAll('.tag-item').forEach((item) => {
        const tag  = item.dataset.tag.toLowerCase();
        const desc = item.querySelector('.tag-desc').textContent.toLowerCase();
        const show = !q || tag.includes(q) || desc.includes(q);
        item.style.display = show ? '' : 'none';
        if (show) visible++;
      });
      const header = group.querySelector('.group-header');
      const items  = group.querySelector('.group-items');
      if (q) {
        group.style.display = visible ? '' : 'none';
        if (visible) { header.classList.add('open'); items.classList.add('open'); }
      } else {
        group.style.display = '';
      }
    });
  }

  _render() {
    const root = this.shadowRoot.getElementById('root');
    const byGroup = registry.getByGroups();
    const sorted  = registry.getGroups();

    root.innerHTML = sorted.map((g) => {
      const tags = byGroup.get(g.id) || [];
      /** 调色板条目顺序仍为注册表原有顺序；仅按 tag 名排序得到每项的图标序号，保证同组内尽量不重复 */
      const orderForIcons = tags.slice().sort((a, b) => a.tag.localeCompare(b.tag));
      const iconByTag = new Map(
        orderForIcons.map((t, ti) => [t.tag, resolvePaletteTagIconName(t, g.id, ti)]),
      );
      const itemsHtml = tags.length
        ? tags.map((t) => {
          const icon = iconByTag.get(t.tag) ?? resolvePaletteTagIconName(t, g.id, 0);
          return `
            <div class="tag-item${t.modelOnly ? ' model-only' : ''}" draggable="true" data-tag="${escapeAttr(t.tag)}" data-model-only="${t.modelOnly ? '1' : ''}" title="${escapeAttr(t.description)}">
              <ui5-icon class="tag-item-symbol" name="${escapeAttr(icon)}"></ui5-icon>
              <span class="tag-name">${escapeHtml(t.label)}</span>
              <span class="tag-desc">${escapeHtml(t.description)}</span>
            </div>`;
        }).join('')
        : `<cmx-empty-state icon="tags" title="该分组当前无可用标签" size="sm"></cmx-empty-state>`;

      const openCls = g.collapsed ? '' : ' open';
      return `
        <div class="group" data-g="${g.id}">
          <div class="group-header${openCls}">
            ${groupSymbolHtml(g)}
            <span class="group-label">${escapeHtml(g.label)}</span>
            <span class="group-count">${tags.length}</span>
            <ui5-icon class="palette-group-arrow" name="slim-arrow-right"></ui5-icon>
          </div>
          <div class="group-items${openCls}">${itemsHtml}</div>
        </div>`;
    }).join('');

    /* 分组折叠/展开 */
    root.querySelectorAll('.group-header').forEach((header) => {
      header.addEventListener('click', () => {
        header.classList.toggle('open');
        header.nextElementSibling.classList.toggle('open');
      });
    });

    /* 拖拽：modelOnly 条目只携带 cmx-model-type，画布无法接受；普通条目携带 text/plain */
    root.querySelectorAll('.tag-item').forEach((el) => {
      el.addEventListener('dragstart', (e) => {
        if (el.dataset.modelOnly === '1') {
          e.dataTransfer.setData('cmx-model-type', el.dataset.tag);
          // text/plain 故意不设，画布的 isModelOnly 检测依赖此缺失
        } else {
          e.dataTransfer.setData('text/plain', el.dataset.tag);
        }
        e.dataTransfer.effectAllowed = 'copy';
      });
    });
  }
}

customElements.define('designer-left-panel', DesignerLeftPanel);
