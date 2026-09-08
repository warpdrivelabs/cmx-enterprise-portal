import { escapeHtml } from '../../utils/html-utils.js';
import { FLOW_DIAGRAM } from './page-data-flow-layout.js';
import { PAGE_DATA_STRINGS } from './page-data-static-strings.js';

export function bindFlowPanel(pd) {
  pd.shadowRoot.getElementById('refreshFlowBtn')?.addEventListener('click', () => {
    renderFlowDiagram(pd);
  });
}

export function parseBindings(pd) {
  const map = new Map();
  if (!pd._canvasHtml) return map;
  const doc = new DOMParser().parseFromString(`<body>${pd._canvasHtml}</body>`, 'text/html');
  doc.querySelectorAll('*').forEach(el => {
    Array.from(el.attributes).forEach(attr => {
      if (!attr.name.startsWith('data-bind-')) return;
      const attrName = attr.name.slice('data-bind-'.length);
      const varName  = attr.value;
      if (!varName) return;
      if (!map.has(varName)) map.set(varName, []);
      map.get(varName).push({ tag: el.tagName.toLowerCase(), attrName });
    });
  });
  return map;
}

export function renderFlowDiagram(pd) {
  const container = pd.shadowRoot.getElementById('flowDiagram');
  if (!container) return;

  const F = FLOW_DIAGRAM;
  const COL_W = F.colWidth;
  const NODE_H = F.nodeHeight;
  const NODE_R = F.nodeCornerRadius;
  const GAP_X = F.gapX;
  const GAP_Y = F.gapY;
  const PAD = F.pad;
  const HDR = F.headerBand;
  const COL1_X = PAD;
  const COL2_X = PAD + COL_W + GAP_X;
  const COL3_X = PAD + 2 * (COL_W + GAP_X);
  const SVG_W  = COL3_X + COL_W + PAD;

  const validSvcs = pd._pageServices.filter(s => s.name);
  const validFns  = pd._pageFns.filter(f => f.name);
  const validData = pd._pageData.filter(d => d.name);
  const bindings  = parseBindings(pd);

  const srcNodes  = [
    ...validSvcs.map(s => ({ kind: 'svc', label: s.name, obj: s })),
    ...validFns.map(f  => ({ kind: 'fn',  label: f.name, obj: f })),
  ];
  const bindNodes = [];
  bindings.forEach((els, varName) => {
    els.forEach(b => bindNodes.push({ label: `<${b.tag}>.${b.attrName}`, varName, tag: b.tag }));
  });

  const rows   = Math.max(srcNodes.length, validData.length, bindNodes.length, 1);
  const SVG_H  = PAD + HDR + rows * (NODE_H + GAP_Y) + PAD;
  const yOf    = (idx) => PAD + HDR + idx * (NODE_H + GAP_Y);

  const truncate = (s, max = F.labelTruncateMax) =>
    s.length > max ? s.slice(0, max - 1) + '…' : s;

  const mw = F.markerWidth;
  const mh = F.markerHeight;
  const mrx = F.markerRefX;
  const mry = F.markerRefY;
  const mMid = mh / 2;

  const p = [];
  p.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_W}" height="${SVG_H}">`);
  p.push(`<defs>`);
  p.push(`  <marker id="arr-blue"  markerWidth="${mw}" markerHeight="${mh}" refX="${mrx}" refY="${mry}" orient="auto"><polygon points="0 0,${mw} ${mMid},0 ${mh}" fill="var(--sapInformationElementColor, #38bdf8)" opacity=".8"/></marker>`);
  p.push(`  <marker id="arr-purp"  markerWidth="${mw}" markerHeight="${mh}" refX="${mrx}" refY="${mry}" orient="auto"><polygon points="0 0,${mw} ${mMid},0 ${mh}" fill="#c4b5fd" opacity=".8"/></marker>`);
  p.push(`  <marker id="arr-green" markerWidth="${mw}" markerHeight="${mh}" refX="${mrx}" refY="${mry}" orient="auto"><polygon points="0 0,${mw} ${mMid},0 ${mh}" fill="#6ee7b7" opacity=".8"/></marker>`);
  p.push(`</defs>`);

  // 列标题
  [
    { x: COL1_X, label: PAGE_DATA_STRINGS.flowColSvcFn },
    { x: COL2_X, label: PAGE_DATA_STRINGS.flowColData },
    { x: COL3_X, label: PAGE_DATA_STRINGS.flowColBind },
  ].forEach(h => {
    p.push(`<text x="${h.x + COL_W / 2}" y="${F.headerTextY}" text-anchor="middle" fill="var(--sapInformationElementColor, #8fa7c0)" font-family="Consolas,monospace" font-size="${F.headerFontSize}" font-weight="600">${h.label}</text>`);
    p.push(`<line x1="${h.x}" y1="${F.ruleLineY}" x2="${h.x + COL_W}" y2="${F.ruleLineY}" stroke="var(--sapInformationElementColor, #334155)" stroke-width="${F.headerRuleStrokeWidth}"/>`);
  });

  const drawNode = (x, y, label, fill, textColor) => {
    p.push(`<rect x="${x}" y="${y}" width="${COL_W}" height="${NODE_H}" rx="${NODE_R}" fill="${fill}" stroke="${fill}" stroke-width="${F.nodeStrokeWidth}" opacity=".9"/>`);
    p.push(`<text x="${x + COL_W / 2}" y="${y + NODE_H / 2 + F.textBaselineNudge}" text-anchor="middle" fill="${textColor}" font-family="Consolas,monospace" font-size="${F.nodeFontSize}">${escapeHtml(truncate(label))}</text>`);
  };

  const drawArrow = (x1col, y1, x2col, y2, color, marker) => {
    const sx = x1col + COL_W, sy = y1 + NODE_H / 2;
    const ex = x2col,          ey = y2 + NODE_H / 2;
    const cx = (sx + ex) / 2;
    p.push(`<path d="M ${sx} ${sy} C ${cx} ${sy}, ${cx} ${ey}, ${ex} ${ey}" stroke="${color}" stroke-width="${F.arrowStrokeWidth}" fill="none" opacity=".65" marker-end="url(#${marker})"/>`);
  };

  // 左列：服务（蓝）+ 函数（紫）
  srcNodes.forEach((src, i) => {
    const y      = yOf(i);
    const isSvc  = src.kind === 'svc';
    drawNode(COL1_X, y, src.label, isSvc ? 'var(--sapInformationElementColor, #0b2540)' : 'var(--sapInformationElementColor, #1a1040)', isSvc ? 'var(--sapInformationElementColor, #38bdf8)' : '#c4b5fd');

    if (isSvc && src.obj.responseTo) {
      const di = validData.findIndex(d => d.name === src.obj.responseTo);
      if (di >= 0) drawArrow(COL1_X, y, COL2_X, yOf(di), 'var(--sapInformationElementColor, #38bdf8)', 'arr-blue');
    }
    if (!isSvc) {
      (src.obj.writesVars || []).forEach(v => {
        const di = validData.findIndex(d => d.name === v);
        if (di >= 0) drawArrow(COL1_X, y, COL2_X, yOf(di), '#c4b5fd', 'arr-purp');
      });
    }
  });

  // 中列：数据变量（绿）
  validData.forEach((d, i) => {
    const y = yOf(i);
    drawNode(COL2_X, y, `$data.${d.name}`, 'var(--sapPositiveElementColor, #061f12)', '#6ee7b7');

    const targets = bindings.get(d.name) || [];
    targets.forEach(b => {
      const bi = bindNodes.findIndex(bn => bn.varName === d.name && bn.tag === b.tag && bn.label.includes(b.attrName));
      if (bi >= 0) drawArrow(COL2_X, y, COL3_X, yOf(bi), '#6ee7b7', 'arr-green');
    });
  });

  // 右列：组件绑定（青绿）
  bindNodes.forEach((b, i) => {
    drawNode(COL3_X, yOf(i), b.label, '#061a18', 'var(--sapPositiveElementColor, #34d399)');
  });

  // 空状态提示
  if (!srcNodes.length && !validData.length && !bindNodes.length) {
    p.push(`<text x="${SVG_W / 2}" y="${SVG_H / 2}" text-anchor="middle" fill="var(--sapInformationElementColor, #6c8093)" font-family="sans-serif" font-size="${F.emptyHintFontSize}">${PAGE_DATA_STRINGS.flowEmptyHint}</text>`);
  }

  p.push('</svg>');
  container.innerHTML = p.join('\n');
}
