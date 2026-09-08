// src/core/address.ts
var COL_LABEL_RE = /^[A-Za-z]+$/;
var ADDR_RE = /^([A-Za-z]+)(\d+)$/;
function colToLabel(index) {
  let n = Math.floor(index) + 1;
  if (!Number.isFinite(n) || n < 1) n = 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s || "A";
}
function labelToCol(label) {
  const s = String(label ?? "").toUpperCase();
  if (!s || !COL_LABEL_RE.test(s)) return -1;
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    n = n * 26 + (s.charCodeAt(i) - 64);
  }
  return n - 1;
}
function parseAddr(addr) {
  const m = ADDR_RE.exec(String(addr ?? "").trim());
  if (!m) return null;
  const col = labelToCol(m[1]);
  const row = Number(m[2]) - 1;
  if (col < 0 || row < 0 || !Number.isFinite(row)) return null;
  return { row, col };
}
function formatAddr(row, col) {
  return colToLabel(col) + (Math.floor(row) + 1);
}
function parseRange(range2) {
  const raw = String(range2 ?? "").trim();
  if (!raw) return null;
  const parts = raw.split(":");
  const a = parseAddr(parts[0]);
  const b = parseAddr(parts[1] ?? parts[0]);
  if (!a || !b) return null;
  return {
    r1: Math.min(a.row, b.row),
    c1: Math.min(a.col, b.col),
    r2: Math.max(a.row, b.row),
    c2: Math.max(a.col, b.col)
  };
}
function formatRange(range2) {
  const r1 = Math.min(range2.r1, range2.r2);
  const c1 = Math.min(range2.c1, range2.c2);
  const r2 = Math.max(range2.r1, range2.r2);
  const c2 = Math.max(range2.c1, range2.c2);
  const a = formatAddr(r1, c1);
  const b = formatAddr(r2, c2);
  return a === b ? a : `${a}:${b}`;
}

// src/core/Range.ts
var Range = class _Range {
  row;
  col;
  rowCount;
  colCount;
  /**
   * @param row 起始行（0-based）
   * @param col 起始列（0-based）
   * @param rowCount 行数（≥1；<1 归一为 1）
   * @param colCount 列数（≥1；<1 归一为 1）
   */
  constructor(row, col, rowCount = 1, colCount = 1) {
    this.row = Math.max(0, Math.floor(row));
    this.col = Math.max(0, Math.floor(col));
    this.rowCount = Math.max(1, Math.floor(rowCount));
    this.colCount = Math.max(1, Math.floor(colCount));
  }
  /** 末行索引（闭区间，含）。 */
  get lastRow() {
    return this.row + this.rowCount - 1;
  }
  /** 末列索引（闭区间，含）。 */
  get lastCol() {
    return this.col + this.colCount - 1;
  }
  /** 单元格数（rowCount × colCount）。 */
  get area() {
    return this.rowCount * this.colCount;
  }
  /** 是否单格（1×1）。 */
  get isSingleCell() {
    return this.rowCount === 1 && this.colCount === 1;
  }
  /** 从归一化坐标 {r1,c1,r2,c2} 构造。 */
  static fromCoord(coord) {
    const r1 = Math.min(coord.r1, coord.r2);
    const c1 = Math.min(coord.c1, coord.c2);
    const r2 = Math.max(coord.r1, coord.r2);
    const c2 = Math.max(coord.c1, coord.c2);
    return new _Range(r1, c1, r2 - r1 + 1, c2 - c1 + 1);
  }
  /** 从两个角点（任意顺序）构造。 */
  static fromCorners(row1, col1, row2, col2) {
    return _Range.fromCoord({ r1: row1, c1: col1, r2: row2, c2: col2 });
  }
  /** 从 A1 区域字符串构造（"A1:C3" / "B2"）；非法返回 null。 */
  static fromA1(a1) {
    const coord = parseRange(a1);
    return coord ? _Range.fromCoord(coord) : null;
  }
  /** 归一化坐标视图。 */
  toCoord() {
    return { r1: this.row, c1: this.col, r2: this.lastRow, c2: this.lastCol };
  }
  /** A1 区域字符串（单格无冒号）。 */
  toA1() {
    return formatRange(this.toCoord());
  }
  /** 是否包含单元格 (row,col)。 */
  containsCell(row, col) {
    return row >= this.row && row <= this.lastRow && col >= this.col && col <= this.lastCol;
  }
  /** 是否完全包含另一区域。 */
  containsRange(other) {
    return other.row >= this.row && other.col >= this.col && other.lastRow <= this.lastRow && other.lastCol <= this.lastCol;
  }
  /** 与另一区域是否相交（有公共单元格）。 */
  intersects(other) {
    return !(other.row > this.lastRow || other.lastRow < this.row || other.col > this.lastCol || other.lastCol < this.col);
  }
  /** 交集；无交返回 null。 */
  intersect(other) {
    if (!this.intersects(other)) return null;
    const r1 = Math.max(this.row, other.row);
    const c1 = Math.max(this.col, other.col);
    const r2 = Math.min(this.lastRow, other.lastRow);
    const c2 = Math.min(this.lastCol, other.lastCol);
    return _Range.fromCorners(r1, c1, r2, c2);
  }
  /** 包围盒并集（覆盖两区域的最小矩形；非集合并）。 */
  boundingUnion(other) {
    const r1 = Math.min(this.row, other.row);
    const c1 = Math.min(this.col, other.col);
    const r2 = Math.max(this.lastRow, other.lastRow);
    const c2 = Math.max(this.lastCol, other.lastCol);
    return _Range.fromCorners(r1, c1, r2, c2);
  }
  /** 值相等（四要素全等）。 */
  equals(other) {
    return this.row === other.row && this.col === other.col && this.rowCount === other.rowCount && this.colCount === other.colCount;
  }
  /** 平移（负数向上/左；结果行列被 clamp 到 ≥0）。 */
  translate(deltaRow, deltaCol) {
    return new _Range(this.row + deltaRow, this.col + deltaCol, this.rowCount, this.colCount);
  }
  /** 遍历每个单元格坐标（行优先）。 */
  forEachCell(fn) {
    for (let r = this.row; r <= this.lastRow; r++) {
      for (let c = this.col; c <= this.lastCol; c++) {
        fn(r, c);
      }
    }
  }
  /** 生成器：逐格坐标（行优先）。 */
  *cells() {
    for (let r = this.row; r <= this.lastRow; r++) {
      for (let c = this.col; c <= this.lastCol; c++) {
        yield { row: r, col: c };
      }
    }
  }
  toString() {
    return `Range(${this.toA1()})`;
  }
};

// src/core/SparseMatrix.ts
var SparseMatrix = class _SparseMatrix {
  map = /* @__PURE__ */ new Map();
  static key(row, col) {
    return `${row},${col}`;
  }
  /** 非空槽位数。 */
  get size() {
    return this.map.size;
  }
  get(row, col) {
    return this.map.get(_SparseMatrix.key(row, col));
  }
  has(row, col) {
    return this.map.has(_SparseMatrix.key(row, col));
  }
  /** 设值；value 为 undefined 时等价于 delete（不留空槽）。 */
  set(row, col, value) {
    const k = _SparseMatrix.key(row, col);
    if (value === void 0) {
      this.map.delete(k);
    } else {
      this.map.set(k, value);
    }
  }
  delete(row, col) {
    return this.map.delete(_SparseMatrix.key(row, col));
  }
  clear() {
    this.map.clear();
  }
  /** 遍历所有非空槽位（顺序 = 插入序，不保证行列有序）。 */
  forEach(fn) {
    for (const [k, v] of this.map) {
      const { row, col } = _SparseMatrix.parseKey(k);
      fn(v, row, col);
    }
  }
  /** 生成器：逐槽位 {row,col,value}。 */
  *entries() {
    for (const [k, v] of this.map) {
      const { row, col } = _SparseMatrix.parseKey(k);
      yield { row, col, value: v };
    }
  }
  static parseKey(k) {
    const i = k.indexOf(",");
    return { row: Number(k.slice(0, i)), col: Number(k.slice(i + 1)) };
  }
  /** 已占用的最大行索引（无数据返回 -1）。 */
  maxRow() {
    let m = -1;
    this.forEach((_v, row) => {
      if (row > m) m = row;
    });
    return m;
  }
  /** 已占用的最大列索引（无数据返回 -1）。 */
  maxCol() {
    let m = -1;
    this.forEach((_v, _row, col) => {
      if (col > m) m = col;
    });
    return m;
  }
  /**
   * 在 `before` 行之前插入 count 行：row ≥ before 的槽位整体下移 count。
   * before 处原有内容成为新行下方的内容（Excel 语义：在选中行上方插入）。
   */
  insertRows(before, count) {
    if (count <= 0) return;
    this.shiftRows(before, count);
  }
  /**
   * 删除 [start, start+count) 行：区间内槽位丢弃，row ≥ start+count 的上移 count。
   */
  deleteRows(start, count) {
    if (count <= 0) return;
    const doomed = [];
    for (const k of this.map.keys()) {
      const { row } = _SparseMatrix.parseKey(k);
      if (row >= start && row < start + count) doomed.push(k);
    }
    for (const k of doomed) this.map.delete(k);
    this.shiftRows(start + count, -count, start);
  }
  /** 在 `before` 列之前插入 count 列。 */
  insertColumns(before, count) {
    if (count <= 0) return;
    this.shiftCols(before, count);
  }
  /** 删除 [start, start+count) 列。 */
  deleteColumns(start, count) {
    if (count <= 0) return;
    const doomed = [];
    for (const k of this.map.keys()) {
      const { col } = _SparseMatrix.parseKey(k);
      if (col >= start && col < start + count) doomed.push(k);
    }
    for (const k of doomed) this.map.delete(k);
    this.shiftCols(start + count, -count, start);
  }
  /**
   * 把 row ≥ threshold 的槽位行号加 delta，重建 map（避免搬移途中键碰撞）。
   * @param threshold 受影响的最小原行号
   * @param delta 行号增量（正=下移，负=上移）
   * @param _minSafe 仅文档用途，标注删除后区间起点
   */
  shiftRows(threshold, delta, _minSafe) {
    if (delta === 0) return;
    const rebuilt = /* @__PURE__ */ new Map();
    for (const [k, v] of this.map) {
      const { row, col } = _SparseMatrix.parseKey(k);
      if (row >= threshold) {
        rebuilt.set(_SparseMatrix.key(row + delta, col), v);
      } else {
        rebuilt.set(k, v);
      }
    }
    this.map.clear();
    for (const [k, v] of rebuilt) this.map.set(k, v);
  }
  shiftCols(threshold, delta, _minSafe) {
    if (delta === 0) return;
    const rebuilt = /* @__PURE__ */ new Map();
    for (const [k, v] of this.map) {
      const { row, col } = _SparseMatrix.parseKey(k);
      if (col >= threshold) {
        rebuilt.set(_SparseMatrix.key(row, col + delta), v);
      } else {
        rebuilt.set(k, v);
      }
    }
    this.map.clear();
    for (const [k, v] of rebuilt) this.map.set(k, v);
  }
  /** 浅拷贝（值按引用复制）。 */
  clone() {
    const c = new _SparseMatrix();
    for (const [k, v] of this.map) c.map.set(k, v);
    return c;
  }
};

// src/core/Style.ts
var EMPTY_STYLE = Object.freeze({});
function isEmptyStyle(style) {
  if (!style) return true;
  for (const k in style) {
    const v = style[k];
    if (v !== void 0 && v !== null) {
      if (k === "borders" && isEmptyBorders(v)) continue;
      return false;
    }
  }
  return true;
}
function isEmptyBorders(b) {
  if (!b) return true;
  return !b.top && !b.bottom && !b.left && !b.right && !b.diagonalUp && !b.diagonalDown;
}
function mergeStyle(base, override) {
  if (!base) return override ? { ...override } : {};
  if (!override) return { ...base };
  const out = { ...base };
  for (const k in override) {
    const v = override[k];
    if (v === void 0) continue;
    if (k === "borders") {
      out.borders = mergeBorders(base.borders, override.borders);
    } else {
      ;
      out[k] = v;
    }
  }
  return out;
}
function mergeBorders(base, override) {
  const out = { ...base ?? {} };
  if (override) {
    for (const side of ["top", "bottom", "left", "right", "diagonalUp", "diagonalDown"]) {
      const e = override[side];
      if (e !== void 0) out[side] = e;
    }
  }
  return out;
}
var StyleSheet = class _StyleSheet {
  named = /* @__PURE__ */ new Map();
  /** 定义/覆盖一个命名样式。 */
  define(name, style) {
    this.named.set(name, { ...style });
  }
  /** 取命名样式（副本）；不存在返回 undefined。 */
  get(name) {
    const s = this.named.get(name);
    return s ? { ...s } : void 0;
  }
  has(name) {
    return this.named.has(name);
  }
  remove(name) {
    return this.named.delete(name);
  }
  names() {
    return [...this.named.keys()];
  }
  /**
   * 展开单个样式：若含 styleName，先取命名样式为底，叠加本对象其余键；
   * 否则原样返回副本。剥去 styleName 键（已展开）。
   */
  expand(style) {
    if (!style) return {};
    if (!style.styleName) {
      const { styleName: _drop2, ...rest2 } = style;
      return { ...rest2 };
    }
    const base = this.get(style.styleName) ?? {};
    const { styleName: _drop, ...rest } = style;
    return mergeStyle(base, rest);
  }
  /** 序列化命名样式表（供 snapshot）。 */
  toJSON() {
    const out = {};
    for (const [k, v] of this.named) out[k] = { ...v };
    return out;
  }
  /** 从 snapshot 恢复。 */
  static fromJSON(obj) {
    const ss = new _StyleSheet();
    if (obj) for (const k in obj) ss.define(k, obj[k]);
    return ss;
  }
};
function resolveStyle(sheet, layers) {
  let acc = {};
  for (const layer of layers) {
    if (!layer) continue;
    acc = mergeStyle(acc, sheet.expand(layer));
  }
  return acc;
}

// src/core/Cell.ts
function richToPlain(rich) {
  return rich.runs.map((r) => r.text).join("");
}
function toCellValue(v) {
  if (v === void 0 || v === null) return null;
  if (typeof v === "number" || typeof v === "boolean" || typeof v === "string") return v;
  return String(v);
}
function normalizeFormula(formula) {
  const f2 = String(formula ?? "").trim();
  if (!f2) return "";
  return f2.charAt(0) === "=" ? f2.slice(1).trim() : f2;
}
function sanitizeImportedFormula(formula) {
  let f2 = normalizeFormula(formula);
  if (!f2) return "";
  while (f2.charAt(0) === "@") f2 = f2.slice(1);
  f2 = f2.replace(/_xl(fn|ws)\.(_xl(fn|ws)\.)?/gi, "");
  return f2.trim();
}

// src/core/Worksheet.ts
var DEFAULT_ROW_COUNT = 40;
var DEFAULT_COL_COUNT = 12;
var DEFAULT_ROW_HEIGHT = 20;
var DEFAULT_COL_WIDTH = 62;
var OutlineAxis = class {
  groups = [];
  /** 成组 [start, start+count)。count<1 忽略。level 自动派生。已存在完全相同的段则忽略。 */
  group(start, count) {
    if (count < 1) return;
    const s = Math.max(0, Math.floor(start));
    const c = Math.floor(count);
    if (this.groups.some((g) => g.start === s && g.count === c)) return;
    this.groups.push({ start: s, count: c, collapsed: false, level: 0 });
    this.recomputeLevels();
  }
  /** 取消覆盖某索引的**最内层**分组（对齐 Excel：ungroup 从最深层剥）。 */
  ungroup(index) {
    const covering = this.groups.map((g, i) => ({ g, i })).filter(({ g }) => index >= g.start && index < g.start + g.count);
    if (!covering.length) return;
    covering.sort((a, b) => b.g.level - a.g.level);
    const target = covering[0].i;
    this.groups.splice(target, 1);
    this.recomputeLevels();
  }
  /** 移除完全等于 [start,count) 的分组（供 ungroupCommand 精确撤销）。 */
  removeExact(start, count) {
    const idx = this.groups.findIndex((g) => g.start === start && g.count === count);
    if (idx < 0) return false;
    this.groups.splice(idx, 1);
    this.recomputeLevels();
    return true;
  }
  /** 设某索引所在**最内层**分组的折叠态。 */
  setCollapsed(index, collapsed) {
    let best = null;
    for (const g of this.groups) {
      if (index >= g.start && index < g.start + g.count) {
        if (!best || g.level > best.level) best = g;
      }
    }
    if (best) best.collapsed = collapsed;
  }
  /** 直接设第 i 个分组折叠态（供交互按索引切）。 */
  setCollapsedAt(groupIndex, collapsed) {
    const g = this.groups[groupIndex];
    if (g) g.collapsed = collapsed;
  }
  list() {
    return this.groups;
  }
  clear() {
    this.groups = [];
  }
  /** 最深层级（无分组返回 -1）。层级按钮渲染 1..maxLevel+2。 */
  maxLevel() {
    let m = -1;
    for (const g of this.groups) if (g.level > m) m = g.level;
    return m;
  }
  /**
   * 层级折叠：折叠 level ≥ (n-1) 的所有分组，展开更浅的（`1 2 3…` 层级开关，n 为 1-based）。
   * n=1 全展开；n=maxLevel+2 全折叠。
   */
  collapseToLevel(n) {
    const threshold = n - 1;
    for (const g of this.groups) {
      g.collapsed = g.level >= threshold;
    }
  }
  /** 全部展开。 */
  expandAll() {
    for (const g of this.groups) g.collapsed = false;
  }
  /**
   * 当前折叠态下应隐藏的索引集合。折叠一个分组 → 隐藏其明细（不含汇总）。
   * @param summaryAfter true=汇总在末端（明细=[start, end-1)）；false=汇总在首端（明细=[start+1, end)）
   */
  hiddenIndices(summaryAfter) {
    const hidden = /* @__PURE__ */ new Set();
    for (const g of this.groups) {
      if (!g.collapsed) continue;
      const end = g.start + g.count;
      if (summaryAfter) {
        for (let i = g.start; i < end - 1; i++) hidden.add(i);
      } else {
        for (let i = g.start + 1; i < end; i++) hidden.add(i);
      }
    }
    return hidden;
  }
  /** 派生每个分组的 level = 被多少其它分组严格包含。 */
  recomputeLevels() {
    for (const g of this.groups) {
      let level = 0;
      for (const other of this.groups) {
        if (other === g) continue;
        if (other.start <= g.start && other.start + other.count >= g.start + g.count && !(other.start === g.start && other.count === g.count)) {
          level++;
        }
      }
      g.level = level;
    }
    this.groups.sort((a, b) => a.start - b.start || a.level - b.level);
  }
  /** 行列增删时搬移分组起点（与 SparseMatrix 同步）。 */
  shiftInsert(before, count) {
    for (const g of this.groups) {
      if (g.start >= before) g.start += count;
    }
  }
  shiftDelete(start, count) {
    const next = [];
    for (const g of this.groups) {
      if (g.start >= start + count) {
        g.start -= count;
        next.push(g);
      } else if (g.start + g.count <= start) {
        next.push(g);
      }
    }
    this.groups = next;
    this.recomputeLevels();
  }
};
var CellRange = class {
  constructor(sheet, range2) {
    this.sheet = sheet;
    this.range = range2;
  }
  value(v) {
    if (arguments.length === 0) {
      return this.sheet.getValue(this.range.row, this.range.col);
    }
    this.range.forEachCell((r, c) => this.sheet.setValue(r, c, v));
    return this;
  }
  formula(f2) {
    if (arguments.length === 0) {
      return this.sheet.getFormula(this.range.row, this.range.col);
    }
    this.range.forEachCell((r, c) => this.sheet.setFormula(r, c, f2));
    return this;
  }
  /** 叠加样式（与现有样式合并，非替换）。 */
  style(patch) {
    this.range.forEachCell((r, c) => {
      const cur = this.sheet.getStyle(r, c);
      this.sheet.setStyle(r, c, mergeStyle(cur, patch));
    });
    return this;
  }
  /** 读左上角解析后样式（含级联）。 */
  resolvedStyle() {
    return this.sheet.getResolvedStyle(this.range.row, this.range.col);
  }
};
var Worksheet = class {
  constructor(_name, opts) {
    this._name = _name;
    this._rowCount = Math.max(1, opts?.rowCount ?? DEFAULT_ROW_COUNT);
    this._colCount = Math.max(1, opts?.colCount ?? DEFAULT_COL_COUNT);
    this.styleSheet = opts?.styleSheet ?? new StyleSheet();
    this.selections = [new Range(0, 0, 1, 1)];
  }
  cells = new SparseMatrix();
  spans = [];
  rowHeights = /* @__PURE__ */ new Map();
  colWidths = /* @__PURE__ */ new Map();
  hiddenRows = /* @__PURE__ */ new Set();
  hiddenCols = /* @__PURE__ */ new Set();
  /** 大纲折叠导致的隐藏（与手动隐藏分账，applyOutlineVisibility 维护）。 */
  _outlineHiddenRows = /* @__PURE__ */ new Set();
  _outlineHiddenCols = /* @__PURE__ */ new Set();
  /** 自动筛选导致的隐藏行（与手动/大纲隐藏分账，applyFilterVisibility 维护）。M11。 */
  _filterHiddenRows = /* @__PURE__ */ new Set();
  /** 自动筛选态：区域 + 每列的筛选条件（M11）。null=无筛选。 */
  autoFilter = null;
  /** 数据验证规则（M12）。按区域，后加入优先（末条覆盖同格）。 */
  _validations = [];
  /** 超链接（M12）：格键 "r,c" → Hyperlink。 */
  _hyperlinks = /* @__PURE__ */ new Map();
  /** 条件格式规则（M13）。渲染时叠加计算，不改数据。 */
  _conditionalRules = [];
  /** 单元格批注（M14）：格键 "r,c" → CellComment。 */
  _comments = /* @__PURE__ */ new Map();
  /** 浮动对象（M14）：图片/图表/形状。 */
  _floatingObjects = [];
  /** 迷你图（M21）：格键 "r,c" → Sparkline。 */
  _sparklines = /* @__PURE__ */ new Map();
  /** 页面设置（M15）：打印/导出参数。null=默认。 */
  pageSetup = null;
  /** 工作表保护态（M20）：null=未保护；enabled 时锁定格拒交互编辑。 */
  protection = null;
  rowStyles = /* @__PURE__ */ new Map();
  colStyles = /* @__PURE__ */ new Map();
  defaultStyle = {};
  _rowCount;
  _colCount;
  selections = [];
  activeRow = 0;
  activeCol = 0;
  _zoom = 1;
  styleSheet;
  rowOutlines = new OutlineAxis();
  columnOutlines = new OutlineAxis();
  /** 汇总行在明细下方（Excel summaryBelow，默认 true）。折叠时保留末行为汇总。 */
  summaryBelow = true;
  /** 汇总列在明细右侧（Excel summaryRight，默认 true）。 */
  summaryRight = true;
  name(v) {
    if (v === void 0) return this._name;
    this._name = v;
    return this;
  }
  // ── 结构：行列数 ──────────────────────────────────────
  getRowCount() {
    return this._rowCount;
  }
  getColumnCount() {
    return this._colCount;
  }
  setRowCount(n) {
    const next = Math.max(1, Math.floor(n));
    if (next < this._rowCount) {
      this.cells.deleteRows(next, this._rowCount - next);
    }
    this._rowCount = next;
  }
  setColumnCount(n) {
    const next = Math.max(1, Math.floor(n));
    if (next < this._colCount) {
      this.cells.deleteColumns(next, this._colCount - next);
    }
    this._colCount = next;
  }
  // ── 单元格：值 / 公式 / 样式 ─────────────────────────
  getValue(row, col) {
    return this.cells.get(row, col)?.value ?? null;
  }
  setValue(row, col, value) {
    const v = toCellValue(value);
    const cur = this.cells.get(row, col);
    if (!cur) {
      if (v === null) return;
      this.cells.set(row, col, { value: v });
      return;
    }
    const next = { ...cur, value: v };
    delete next.formula;
    delete next.rich;
    this.pruneAndSet(row, col, next);
  }
  /** 富文本读（M13）：无富文本返回 null。 */
  getRichText(row, col) {
    return this.cells.get(row, col)?.rich ?? null;
  }
  /**
   * 富文本写（M13）：存 runs，同步把 value 设为拼接纯文本（供公式/查找/排序/TSV 兜底）。
   * rich=null 清富文本（保留标量 value）。
   */
  setRichText(row, col, rich) {
    const cur = this.cells.get(row, col);
    if (!rich) {
      if (cur?.rich) {
        const next2 = { ...cur };
        delete next2.rich;
        this.pruneAndSet(row, col, next2);
      }
      return;
    }
    const plain = richToPlain(rich);
    const next = { ...cur ?? {}, value: plain, rich };
    delete next.formula;
    this.pruneAndSet(row, col, next);
  }
  getFormula(row, col) {
    return this.cells.get(row, col)?.formula ?? "";
  }
  setFormula(row, col, formula) {
    const f2 = normalizeFormula(formula);
    const cur = this.cells.get(row, col);
    if (!f2) {
      if (cur) {
        const next = { ...cur };
        delete next.formula;
        this.pruneAndSet(row, col, next);
      }
      return;
    }
    this.cells.set(row, col, { ...cur ?? {}, formula: f2 });
  }
  /**
   * 写公式格的**计算值**（display value），保留 formula 源不动。
   * 供公式引擎重算后回填——getValue 随即返回此计算值，渲染层自动显示。
   * 非公式格调用等同 setValue。
   */
  setComputedValue(row, col, value) {
    const cur = this.cells.get(row, col);
    if (!cur) {
      if (value === null) return;
      this.cells.set(row, col, { value });
      return;
    }
    this.cells.set(row, col, { ...cur, value });
  }
  getStyle(row, col) {
    return this.cells.get(row, col)?.style;
  }
  setStyle(row, col, style) {
    const cur = this.cells.get(row, col);
    if (!cur) {
      if (!style) return;
      this.cells.set(row, col, { style });
      return;
    }
    const next = { ...cur };
    if (style) next.style = style;
    else delete next.style;
    this.pruneAndSet(row, col, next);
  }
  /** 读级联解析后的最终样式（sheet默认 < 列 < 行 < 单元格）。 */
  getResolvedStyle(row, col) {
    return resolveStyle(this.styleSheet, [
      this.defaultStyle,
      this.colStyles.get(col),
      this.rowStyles.get(row),
      this.getStyle(row, col)
    ]);
  }
  // ── M20 保护/锁定 ────────────────────────────────────
  /** 设/清工作表保护（null 或 {enabled:false} 均解除）。 */
  setProtection(p) {
    this.protection = p && p.enabled ? p : null;
  }
  /** 是否处于保护态。 */
  isProtected() {
    return !!this.protection?.enabled;
  }
  /** 单元格是否锁定（Excel 语义：locked 缺省视作 true，仅显式 false 才解锁）。 */
  isCellLocked(row, col) {
    return this.getResolvedStyle(row, col).locked !== false;
  }
  /** 交互层可否编辑该格：未保护恒可；保护时仅解锁格可编辑。 */
  canEditCell(row, col) {
    return !this.isProtected() || !this.isCellLocked(row, col);
  }
  /** 区域内是否有任一格不可编辑（供批量操作前置检查）。 */
  rangeHasLocked(row, col, rowCount, colCount) {
    if (!this.isProtected()) return false;
    for (let r = row; r < row + rowCount; r++) {
      for (let c = col; c < col + colCount; c++) {
        if (this.isCellLocked(r, c)) return true;
      }
    }
    return false;
  }
  /** 读整条单元格数据副本（含 value/formula/style），空返回 null。 */
  getCellData(row, col) {
    const c = this.cells.get(row, col);
    return c ? { ...c } : null;
  }
  /** 若单元格记录只剩空壳（无 value/formula/style/rich），删除以保持稀疏。 */
  pruneAndSet(row, col, data) {
    const empty = (data.value === void 0 || data.value === null) && !data.formula && !data.rich && (data.style === void 0 || Object.keys(data.style).length === 0);
    this.cells.set(row, col, empty ? void 0 : data);
  }
  // ── 链式句柄 ─────────────────────────────────────────
  getCell(row, col) {
    return new CellRange(this, new Range(row, col, 1, 1));
  }
  getRange(row, col, rowCount = 1, colCount = 1) {
    return new CellRange(this, new Range(row, col, rowCount, colCount));
  }
  // ── 合并 span ────────────────────────────────────────
  addSpan(row, col, rowCount, colCount) {
    if (rowCount < 1 || colCount < 1) return;
    if (rowCount === 1 && colCount === 1) return;
    const range2 = new Range(row, col, rowCount, colCount);
    this.spans = this.spans.filter((s) => !this.spanRange(s).intersects(range2));
    this.spans.push({ row: range2.row, col: range2.col, rowCount: range2.rowCount, colCount: range2.colCount });
  }
  /** 移除覆盖 (row,col) 的 span。 */
  removeSpan(row, col) {
    this.spans = this.spans.filter((s) => !this.spanRange(s).containsCell(row, col));
  }
  /** 取覆盖 (row,col) 的 span；无返回 null。 */
  getSpan(row, col) {
    for (const s of this.spans) {
      if (this.spanRange(s).containsCell(row, col)) return { ...s };
    }
    return null;
  }
  getSpans() {
    return this.spans.map((s) => ({ ...s }));
  }
  spanRange(s) {
    return new Range(s.row, s.col, s.rowCount, s.colCount);
  }
  /**
   * 把区域扩展到包含所有与之相交的合并区（迭代到不动点）。
   * 用于选区/命中：选中或点中合并区内任一格，应作用于整个合并区。
   */
  expandRangeToSpans(range2) {
    let cur = range2;
    let changed = true;
    let guard = 0;
    while (changed && guard++ < 64) {
      changed = false;
      for (const s of this.spans) {
        const sr = this.spanRange(s);
        if (sr.intersects(cur) && !cur.containsRange(sr)) {
          cur = cur.boundingUnion(sr);
          changed = true;
        }
      }
    }
    return cur;
  }
  // ── 行高 / 列宽 / 可见性 ─────────────────────────────
  getRowHeight(row) {
    return this.rowHeights.get(row) ?? DEFAULT_ROW_HEIGHT;
  }
  setRowHeight(row, px) {
    this.rowHeights.set(row, Math.max(0, px));
  }
  getColumnWidth(col) {
    return this.colWidths.get(col) ?? DEFAULT_COL_WIDTH;
  }
  setColumnWidth(col, px) {
    this.colWidths.set(col, Math.max(0, px));
  }
  isRowVisible(row) {
    return !this.hiddenRows.has(row);
  }
  setRowVisible(row, visible) {
    if (visible) this.hiddenRows.delete(row);
    else this.hiddenRows.add(row);
  }
  isColumnVisible(col) {
    return !this.hiddenCols.has(col);
  }
  setColumnVisible(col, visible) {
    if (visible) this.hiddenCols.delete(col);
    else this.hiddenCols.add(col);
  }
  /**
   * 按大纲折叠态刷新行列可见性。大纲隐藏与手动隐藏分开记账（_outlineHiddenRows/Cols），
   * 避免展开分组时误删用户手动隐藏的行。折叠/展开/层级切换后调用。
   */
  applyOutlineVisibility() {
    const nextRows = this.rowOutlines.hiddenIndices(this.summaryBelow);
    const nextCols = this.columnOutlines.hiddenIndices(this.summaryRight);
    for (const r of this._outlineHiddenRows) if (!nextRows.has(r)) this.hiddenRows.delete(r);
    for (const c of this._outlineHiddenCols) if (!nextCols.has(c)) this.hiddenCols.delete(c);
    for (const r of nextRows) this.hiddenRows.add(r);
    for (const c of nextCols) this.hiddenCols.add(c);
    this._outlineHiddenRows = nextRows;
    this._outlineHiddenCols = nextCols;
  }
  /**
   * 按自动筛选条件刷新行可见性（M11）。筛选隐藏与手动/大纲隐藏分开记账（_filterHiddenRows），
   * 清除筛选时只恢复筛选隐藏的行，不动手动/大纲隐藏。数据区首行为表头（不参与筛选）。
   */
  applyFilterVisibility() {
    const next = /* @__PURE__ */ new Set();
    const af = this.autoFilter;
    if (af && af.criteria.size > 0) {
      const headerRow = af.range.row;
      const r1 = af.range.row + 1;
      const r2 = af.range.row + af.range.rowCount - 1;
      const topThresholds = this.computeTopNThresholds(af, r1, r2);
      for (let r = r1; r <= r2; r++) {
        if (r === headerRow) continue;
        if (!this.rowPassesFilter(r, af, topThresholds)) next.add(r);
      }
    }
    for (const r of this._filterHiddenRows) if (!next.has(r) && !this._outlineHiddenRows.has(r)) this.hiddenRows.delete(r);
    for (const r of next) this.hiddenRows.add(r);
    this._filterHiddenRows = next;
  }
  /** 预计算各列 topN 阈值（第 N 大的值；不足 N 个则最小值）。 */
  computeTopNThresholds(af, r1, r2) {
    const out = /* @__PURE__ */ new Map();
    for (const [col, crit] of af.criteria) {
      if (crit.condition?.op !== "topN") continue;
      const n = Math.max(1, Number(crit.condition.value2 ?? crit.condition.value ?? 10));
      const nums2 = [];
      for (let r = r1; r <= r2; r++) {
        const v = this.getValue(r, col);
        if (typeof v === "number") nums2.push(v);
      }
      nums2.sort((a, b) => b - a);
      out.set(col, nums2.length ? nums2[Math.min(n, nums2.length) - 1] : -Infinity);
    }
    return out;
  }
  /** 某行是否通过所有列筛选条件（AND）。 */
  rowPassesFilter(row, af, topThresholds) {
    for (const [col, crit] of af.criteria) {
      const text = this.filterCellText(row, col);
      if (crit.values && crit.values.length > 0) {
        if (!crit.values.includes(text)) return false;
      }
      if (crit.condition) {
        if (crit.condition.op === "topN") {
          const v = this.getValue(row, col);
          const th = topThresholds.get(col) ?? -Infinity;
          if (typeof v !== "number" || v < th) return false;
        } else if (!this.matchCondition(text, this.getValue(row, col), crit.condition)) {
          return false;
        }
      }
    }
    return true;
  }
  filterCellText(row, col) {
    const v = this.getValue(row, col);
    if (v === null || v === void 0) return "";
    if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
    return String(v);
  }
  matchCondition(text, raw, cond) {
    const num3 = typeof raw === "number" ? raw : Number(text);
    const cv = cond.value;
    const cvNum = typeof cv === "number" ? cv : Number(cv);
    const t = text.toLowerCase();
    const cvStr = String(cv ?? "").toLowerCase();
    switch (cond.op) {
      case "eq":
        return typeof cv === "number" || Number.isFinite(cvNum) ? num3 === cvNum : t === cvStr;
      case "ne":
        return typeof cv === "number" || Number.isFinite(cvNum) ? num3 !== cvNum : t !== cvStr;
      case "gt":
        return num3 > cvNum;
      case "ge":
        return num3 >= cvNum;
      case "lt":
        return num3 < cvNum;
      case "le":
        return num3 <= cvNum;
      case "contains":
        return t.includes(cvStr);
      case "notContains":
        return !t.includes(cvStr);
      case "startsWith":
        return t.startsWith(cvStr);
      case "endsWith":
        return t.endsWith(cvStr);
      case "between": {
        const hi = typeof cond.value2 === "number" ? cond.value2 : Number(cond.value2);
        return num3 >= cvNum && num3 <= hi;
      }
      default:
        return true;
    }
  }
  /** 列出筛选区域内某列的唯一显示值（供筛选下拉）。M11。 */
  filterUniqueValues(col) {
    const af = this.autoFilter;
    if (!af) return [];
    const set = /* @__PURE__ */ new Set();
    const r1 = af.range.row + 1;
    const r2 = af.range.row + af.range.rowCount - 1;
    for (let r = r1; r <= r2; r++) set.add(this.filterCellText(r, col));
    return [...set].sort((a, b) => a.localeCompare(b));
  }
  // ── 数据验证（M12）─────────────────────────────────────
  /** 加/覆盖一条数据验证规则。 */
  setDataValidation(rule) {
    this._validations = this._validations.filter((v) => !sameRange(v.range, rule.range));
    this._validations.push(rule);
  }
  /** 命中某格的验证规则（后加入优先，返回最后一条覆盖该格的）。 */
  getValidationAt(row, col) {
    for (let i = this._validations.length - 1; i >= 0; i--) {
      const v = this._validations[i];
      const g = v.range;
      if (row >= g.row && row < g.row + g.rowCount && col >= g.col && col < g.col + g.colCount) return v;
    }
    return null;
  }
  /** 列出全部验证规则（IO 用）。 */
  listValidations() {
    return this._validations;
  }
  /** 清除某区域内的验证规则（缺省清全部）。 */
  clearDataValidation(range2) {
    if (!range2) {
      this._validations = [];
      return;
    }
    this._validations = this._validations.filter((v) => !sameRange(v.range, range2));
  }
  // ── 超链接（M12）───────────────────────────────────────
  setHyperlink(row, col, link) {
    const key2 = `${row},${col}`;
    if (link) this._hyperlinks.set(key2, link);
    else this._hyperlinks.delete(key2);
  }
  getHyperlink(row, col) {
    return this._hyperlinks.get(`${row},${col}`) ?? null;
  }
  /** 列出全部超链接（IO 用）。 */
  listHyperlinks() {
    const out = [];
    for (const [key2, link] of this._hyperlinks) {
      const [r, c] = key2.split(",").map(Number);
      out.push({ row: r, col: c, link });
    }
    return out;
  }
  // ── 条件格式（M13）───────────────────────────────────
  /** 加一条条件格式规则。 */
  addConditionalRule(rule) {
    this._conditionalRules.push(rule);
  }
  /** 移除第 index 条条件格式规则。 */
  removeConditionalRule(index) {
    if (index >= 0 && index < this._conditionalRules.length) this._conditionalRules.splice(index, 1);
  }
  /** 列出全部条件格式规则。 */
  listConditionalRules() {
    return this._conditionalRules;
  }
  /** 清除全部条件格式规则。 */
  clearConditionalRules() {
    this._conditionalRules = [];
  }
  // ── 单元格批注（M14）───────────────────────────────────
  setComment(row, col, comment) {
    const key2 = `${row},${col}`;
    if (comment) this._comments.set(key2, comment);
    else this._comments.delete(key2);
  }
  getComment(row, col) {
    return this._comments.get(`${row},${col}`) ?? null;
  }
  /** 列出全部批注（渲染标记 + IO 用）。 */
  listComments() {
    const out = [];
    for (const [key2, comment] of this._comments) {
      const [r, c] = key2.split(",").map(Number);
      out.push({ row: r, col: c, comment });
    }
    return out;
  }
  // ── 浮动对象（M14）─────────────────────────────────────
  addFloatingObject(obj) {
    this._floatingObjects = this._floatingObjects.filter((o) => o.id !== obj.id);
    this._floatingObjects.push(obj);
  }
  removeFloatingObject(id) {
    this._floatingObjects = this._floatingObjects.filter((o) => o.id !== id);
  }
  getFloatingObject(id) {
    return this._floatingObjects.find((o) => o.id === id) ?? null;
  }
  /** 列出全部浮动对象（按 z 升序，渲染顺序）。 */
  listFloatingObjects() {
    return [...this._floatingObjects].sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
  }
  clearFloatingObjects() {
    this._floatingObjects = [];
  }
  // ── 迷你图（M21）───────────────────────────────────────
  /** 设/覆盖某格迷你图。 */
  setSparkline(row, col, spec) {
    this._sparklines.set(`${row},${col}`, spec);
  }
  /** 读某格迷你图（副本），无返回 null。 */
  getSparkline(row, col) {
    const s = this._sparklines.get(`${row},${col}`);
    return s ? { ...s, dataRange: { ...s.dataRange } } : null;
  }
  /** 清除某格迷你图。 */
  clearSparkline(row, col) {
    this._sparklines.delete(`${row},${col}`);
  }
  /** 列出全部迷你图（IO 用）：[row, col, spec]。 */
  listSparklines() {
    const out = [];
    for (const [key2, spec] of this._sparklines) {
      const [r, c] = key2.split(",").map(Number);
      out.push([r, c, spec]);
    }
    return out;
  }
  // ── 页面设置（M15）─────────────────────────────────────
  /** 设页面设置（合并到现有）。 */
  setPageSetup(setup) {
    this.pageSetup = { ...this.pageSetup ?? {}, ...setup };
  }
  getPageSetup() {
    return this.pageSetup;
  }
  /** 设打印区域（便捷；等同 setPageSetup({printArea})）。 */
  setPrintArea(area) {
    if (area) this.setPageSetup({ printArea: area });
    else if (this.pageSetup) {
      const p = { ...this.pageSetup };
      delete p.printArea;
      this.pageSetup = p;
    }
  }
  /** 设自动筛选区域（M11）。清空条件。 */
  setAutoFilter(range2) {
    if (!range2) {
      this.autoFilter = null;
      this.applyFilterVisibility();
      return;
    }
    this.autoFilter = { range: range2, criteria: /* @__PURE__ */ new Map() };
    this.applyFilterVisibility();
  }
  /** 设某列筛选条件并刷新可见性（M11）。criterion=null 清该列。 */
  setFilterCriterion(col, criterion) {
    if (!this.autoFilter) return;
    if (criterion) this.autoFilter.criteria.set(col, criterion);
    else this.autoFilter.criteria.delete(col);
    this.applyFilterVisibility();
  }
  /** 清除全部筛选条件（保留筛选区域）并恢复行可见（M11）。 */
  clearFilters() {
    if (!this.autoFilter) return;
    this.autoFilter.criteria.clear();
    this.applyFilterVisibility();
  }
  // ── 行/列默认样式 & sheet 默认样式 ───────────────────
  setDefaultStyle(style) {
    this.defaultStyle = { ...style };
  }
  setRowStyle(row, style) {
    if (style) this.rowStyles.set(row, { ...style });
    else this.rowStyles.delete(row);
  }
  setColumnStyle(col, style) {
    if (style) this.colStyles.set(col, { ...style });
    else this.colStyles.delete(col);
  }
  // ── 行列增删（同步搬移一切）─────────────────────────
  addRows(before, count) {
    if (count < 1) return;
    this.cells.insertRows(before, count);
    this.shiftMapKeys(this.rowHeights, before, count);
    this.shiftSet(this.hiddenRows, before, count);
    this.shiftMapKeys(this.rowStyles, before, count);
    this.shiftSpansRow(before, count);
    this.rowOutlines.shiftInsert(before, count);
    this._rowCount += count;
  }
  deleteRows(start, count) {
    if (count < 1) return;
    this.cells.deleteRows(start, count);
    this.deleteMapKeys(this.rowHeights, start, count);
    this.deleteSet(this.hiddenRows, start, count);
    this.deleteMapKeys(this.rowStyles, start, count);
    this.deleteSpansRow(start, count);
    this.rowOutlines.shiftDelete(start, count);
    this._rowCount = Math.max(1, this._rowCount - count);
  }
  addColumns(before, count) {
    if (count < 1) return;
    this.cells.insertColumns(before, count);
    this.shiftMapKeys(this.colWidths, before, count);
    this.shiftSet(this.hiddenCols, before, count);
    this.shiftMapKeys(this.colStyles, before, count);
    this.shiftSpansCol(before, count);
    this.columnOutlines.shiftInsert(before, count);
    this._colCount += count;
  }
  deleteColumns(start, count) {
    if (count < 1) return;
    this.cells.deleteColumns(start, count);
    this.deleteMapKeys(this.colWidths, start, count);
    this.deleteSet(this.hiddenCols, start, count);
    this.deleteMapKeys(this.colStyles, start, count);
    this.deleteSpansCol(start, count);
    this.columnOutlines.shiftDelete(start, count);
    this._colCount = Math.max(1, this._colCount - count);
  }
  shiftMapKeys(m, before, count) {
    const next = /* @__PURE__ */ new Map();
    for (const [k, v] of m) next.set(k >= before ? k + count : k, v);
    m.clear();
    for (const [k, v] of next) m.set(k, v);
  }
  deleteMapKeys(m, start, count) {
    const next = /* @__PURE__ */ new Map();
    for (const [k, v] of m) {
      if (k >= start && k < start + count) continue;
      next.set(k >= start + count ? k - count : k, v);
    }
    m.clear();
    for (const [k, v] of next) m.set(k, v);
  }
  shiftSet(s, before, count) {
    const next = /* @__PURE__ */ new Set();
    for (const k of s) next.add(k >= before ? k + count : k);
    s.clear();
    for (const k of next) s.add(k);
  }
  deleteSet(s, start, count) {
    const next = /* @__PURE__ */ new Set();
    for (const k of s) {
      if (k >= start && k < start + count) continue;
      next.add(k >= start + count ? k - count : k);
    }
    s.clear();
    for (const k of next) s.add(k);
  }
  shiftSpansRow(before, count) {
    for (const s of this.spans) if (s.row >= before) s.row += count;
  }
  shiftSpansCol(before, count) {
    for (const s of this.spans) if (s.col >= before) s.col += count;
  }
  deleteSpansRow(start, count) {
    this.spans = this.spans.filter((s) => !(s.row >= start && s.row < start + count));
    for (const s of this.spans) if (s.row >= start + count) s.row -= count;
  }
  deleteSpansCol(start, count) {
    this.spans = this.spans.filter((s) => !(s.col >= start && s.col < start + count));
    for (const s of this.spans) if (s.col >= start + count) s.col -= count;
  }
  // ── 选区 ─────────────────────────────────────────────
  getSelections() {
    return this.selections.map((r) => new Range(r.row, r.col, r.rowCount, r.colCount));
  }
  setSelection(row, col, rowCount = 1, colCount = 1) {
    this.selections = [new Range(row, col, rowCount, colCount)];
    this.activeRow = row;
    this.activeCol = col;
  }
  addSelection(row, col, rowCount = 1, colCount = 1) {
    this.selections.push(new Range(row, col, rowCount, colCount));
    this.activeRow = row;
    this.activeCol = col;
  }
  clearSelections() {
    this.selections = [new Range(this.activeRow, this.activeCol, 1, 1)];
  }
  getActiveRowIndex() {
    return this.activeRow;
  }
  getActiveColumnIndex() {
    return this.activeCol;
  }
  setActiveCell(row, col) {
    this.activeRow = Math.max(0, Math.floor(row));
    this.activeCol = Math.max(0, Math.floor(col));
  }
  /** 活动格 A1 地址。 */
  getActiveAddr() {
    return formatAddr(this.activeRow, this.activeCol);
  }
  zoom(factor) {
    if (factor === void 0) return this._zoom;
    this._zoom = Math.min(4, Math.max(0.1, factor));
    return this;
  }
  // ── 快照读取（供 io 层中性 snapshot；只读副本，不暴露内部引用）──
  /** sheet 默认样式副本。 */
  getDefaultStyle() {
    return { ...this.defaultStyle };
  }
  /** 非默认行高 [rowIndex, px][]（按行升序）。 */
  getRowHeightEntries() {
    return [...this.rowHeights.entries()].sort((a, b) => a[0] - b[0]);
  }
  /** 非默认列宽 [colIndex, px][]（按列升序）。 */
  getColumnWidthEntries() {
    return [...this.colWidths.entries()].sort((a, b) => a[0] - b[0]);
  }
  /** 行默认样式 [rowIndex, style][]。 */
  getRowStyleEntries() {
    return [...this.rowStyles.entries()].map(([k, v]) => [k, { ...v }]);
  }
  /** 列默认样式 [colIndex, style][]。 */
  getColumnStyleEntries() {
    return [...this.colStyles.entries()].map(([k, v]) => [k, { ...v }]);
  }
  /** 手动隐藏的行（排除大纲折叠隐藏；供 snapshot 区分持久状态与派生状态）。 */
  getManualHiddenRows() {
    return [...this.hiddenRows].filter((r) => !this._outlineHiddenRows.has(r)).sort((a, b) => a - b);
  }
  /** 手动隐藏的列（排除大纲折叠隐藏）。 */
  getManualHiddenColumns() {
    return [...this.hiddenCols].filter((c) => !this._outlineHiddenCols.has(c)).sort((a, b) => a - b);
  }
  // ── 遍历非空单元格（供 snapshot / 重算）────────────
  forEachCell(fn) {
    this.cells.forEach((data, row, col) => fn(data, row, col));
  }
  /** 非空单元格数（调试/断言用）。 */
  get cellCount() {
    return this.cells.size;
  }
};
function sameRange(a, b) {
  return a.row === b.row && a.col === b.col && a.rowCount === b.rowCount && a.colCount === b.colCount;
}

// src/core/EventEmitter.ts
var EventEmitter = class {
  constructor(sender) {
    this.sender = sender;
  }
  handlers = /* @__PURE__ */ new Map();
  /** 订阅事件。 */
  bind(event, handler) {
    let set = this.handlers.get(event);
    if (!set) {
      set = /* @__PURE__ */ new Set();
      this.handlers.set(event, set);
    }
    set.add(handler);
  }
  /** 退订某事件的某回调；handler 省略则清空该事件全部回调。 */
  unbind(event, handler) {
    const set = this.handlers.get(event);
    if (!set) return;
    if (handler) set.delete(handler);
    else set.clear();
  }
  /** 清空全部订阅。 */
  unbindAll() {
    this.handlers.clear();
  }
  /** 派发事件（同步）。回调抛错被隔离，不影响其余订阅者。 */
  emit(event, args) {
    const set = this.handlers.get(event);
    if (!set || set.size === 0) return;
    for (const h of [...set]) {
      try {
        ;
        h(this.sender, args);
      } catch {
      }
    }
  }
  /** 某事件是否有订阅者。 */
  hasListeners(event) {
    const set = this.handlers.get(event);
    return !!set && set.size > 0;
  }
};

// src/core/Workbook.ts
var UndoManager = class {
  undoStack = [];
  redoStack = [];
  _maxSize = 100;
  maxSize(n) {
    if (n === void 0) return this._maxSize;
    this._maxSize = Math.max(0, Math.floor(n));
    this.trim();
  }
  /** 执行并压栈（清空 redo）。 */
  do(action) {
    action.execute();
    this.undoStack.push(action);
    this.redoStack = [];
    this.trim();
  }
  /** 仅压栈（动作已在外部执行），清空 redo。 */
  push(action) {
    this.undoStack.push(action);
    this.redoStack = [];
    this.trim();
  }
  canUndo() {
    return this.undoStack.length > 0;
  }
  canRedo() {
    return this.redoStack.length > 0;
  }
  /** 撤销栈顶（返回被撤销的动作，供调用方读结构元信息）；空栈返回 null。 */
  undo() {
    const a = this.undoStack.pop();
    if (!a) return null;
    a.undo();
    this.redoStack.push(a);
    return a;
  }
  /** 重做栈顶（返回被重做的动作）；空栈返回 null。 */
  redo() {
    const a = this.redoStack.pop();
    if (!a) return null;
    a.execute();
    this.undoStack.push(a);
    return a;
  }
  clear() {
    this.undoStack = [];
    this.redoStack = [];
  }
  getUndoStack() {
    return this.undoStack;
  }
  getRedoStack() {
    return this.redoStack;
  }
  trim() {
    while (this.undoStack.length > this._maxSize) this.undoStack.shift();
  }
};
var CommandManager = class {
  constructor(workbook, undoManager) {
    this.workbook = workbook;
    this.undoManager = undoManager;
  }
  commands = /* @__PURE__ */ new Map();
  register(name, command) {
    this.commands.set(name, command);
  }
  getCommand(name) {
    return this.commands.get(name);
  }
  /**
   * 执行命令。options.cmd 指定命令名。
   * 可撤销命令包装成 UndoableAction 入栈（execute 再跑一次会重复——故此处
   * 约定命令的 execute 幂等于「按 options 重放」，与 SpreadJS 事务模型一致）。
   */
  execute(options) {
    const cmd = this.commands.get(options.cmd);
    if (!cmd) return false;
    if (cmd.canUndo && cmd.undo) {
      const action = {
        name: String(options.name ?? options.cmd),
        execute: () => cmd.execute(this.workbook, options),
        undo: () => cmd.undo(this.workbook, options)
      };
      action.execute();
      this.undoManager.push(action);
    } else {
      cmd.execute(this.workbook, options);
    }
    return true;
  }
};
var Workbook = class {
  sheets = [];
  activeIndex = 0;
  paintSuspend = 0;
  /** 工作簿级共享命名样式表（新建 sheet 默认挂接）。 */
  styleSheet = new StyleSheet();
  events = new EventEmitter(this);
  _undoManager = new UndoManager();
  _commandManager;
  /**
   * 命名区域 / Defined Names（M8）。name（大写归一）→ { scope, refersTo }。
   * scope='workbook' 为工作簿级；scope=sheet 名为 sheet 级（同名时 sheet 级优先于当前 sheet）。
   * refersTo 为不含前导 '=' 的引用文本（如 'Sheet1!$A$1:$B$3' 或 'A1'）。
   */
  _definedNames = /* @__PURE__ */ new Map();
  /** 定义/覆盖命名区域。key 由 name（+scope）唯一。 */
  defineName(name, refersTo, scope = "workbook") {
    this._definedNames.set(this.nameKey(name, scope), { scope, refersTo: refersTo.replace(/^=/, "") });
  }
  /** 删除命名区域。 */
  deleteName(name, scope = "workbook") {
    return this._definedNames.delete(this.nameKey(name, scope));
  }
  /** 解析命名区域 refersTo：先查 sheet 级（当前 sheet 作用域），再查工作簿级。 */
  resolveName(name, sheetName) {
    const upper = name.toUpperCase();
    if (sheetName) {
      const local = this._definedNames.get(this.nameKey(upper, sheetName));
      if (local) return local.refersTo;
    }
    return this._definedNames.get(this.nameKey(upper, "workbook"))?.refersTo;
  }
  /** 列出所有命名区域（IO 往返用）。 */
  listNames() {
    const out = [];
    for (const [key2, v] of this._definedNames) {
      const name = key2.slice(key2.indexOf("\0") + 1);
      out.push({ name, scope: v.scope, refersTo: v.refersTo });
    }
    return out;
  }
  /** 清空全部命名区域（快照重建前用）。 */
  clearNames() {
    this._definedNames.clear();
  }
  nameKey(name, scope) {
    return `${scope}\0${name.toUpperCase()}`;
  }
  /**
   * 重算钩子：由公式引擎（FormulaEngine）注册，避免 core→formula 的模块环。
   * 编辑/命令层改动单元格后调 requestRecalc() 触发重算；未接引擎时为 no-op。
   */
  recalcHook = null;
  /** 注册重算钩子（FormulaEngine 装配时调）。 */
  setRecalcHook(hook) {
    this.recalcHook = hook;
  }
  /** 请求重算（编辑后调；无引擎则 no-op）。 */
  requestRecalc() {
    this.recalcHook?.();
  }
  /**
   * 增量重算钩子（M16）：编辑单格后调，只重算受影响闭包。由 FormulaEngine 注册。
   * 未接引擎或图未建时退化为全量 requestRecalc()。
   */
  recalcCellsHook = null;
  setRecalcCellsHook(hook) {
    this.recalcCellsHook = hook;
  }
  /** 请求增量重算指定格（M16）；无增量钩子则退化全量。 */
  requestRecalcCells(cells) {
    if (this.recalcCellsHook) this.recalcCellsHook(cells);
    else this.recalcHook?.();
  }
  constructor(opts) {
    this._commandManager = new CommandManager(this, this._undoManager);
    const n = Math.max(0, opts?.sheetCount ?? 1);
    for (let i = 0; i < n; i++) {
      this.sheets.push(new Worksheet(`Sheet${i + 1}`, { styleSheet: this.styleSheet }));
    }
  }
  // ── 工作表集合 ───────────────────────────────────────
  getSheetCount() {
    return this.sheets.length;
  }
  getSheet(index) {
    return this.sheets[index];
  }
  getActiveSheet() {
    return this.sheets[this.activeIndex];
  }
  getActiveSheetIndex() {
    return this.activeIndex;
  }
  setActiveSheetIndex(index) {
    const next = Math.min(Math.max(0, Math.floor(index)), Math.max(0, this.sheets.length - 1));
    if (next === this.activeIndex) return;
    const old = this.activeIndex;
    this.activeIndex = next;
    const sheet = this.sheets[next];
    if (sheet) {
      this.events.emit("ActiveSheetChanged", { oldIndex: old, newIndex: next, sheet });
    }
  }
  /** 在 index 处插入工作表（越界则追加）。返回该表。 */
  addSheet(index, sheet) {
    const ws = sheet ?? new Worksheet(`Sheet${this.sheets.length + 1}`, { styleSheet: this.styleSheet });
    const at = Math.min(Math.max(0, Math.floor(index)), this.sheets.length);
    this.sheets.splice(at, 0, ws);
    if (this.activeIndex >= at) this.activeIndex = Math.min(this.activeIndex + 1, this.sheets.length - 1);
    this.events.emit("SheetAdded", { index: at, sheet: ws });
    return ws;
  }
  /** 追加工作表。 */
  appendSheet(sheet) {
    return this.addSheet(this.sheets.length, sheet);
  }
  /** 移除 index 处工作表。 */
  removeSheet(index) {
    const ws = this.sheets[index];
    if (!ws) return;
    this.sheets.splice(index, 1);
    if (this.activeIndex >= this.sheets.length) {
      this.activeIndex = Math.max(0, this.sheets.length - 1);
    }
    this.events.emit("SheetRemoved", { index, name: ws.name() });
  }
  /**
   * 移动工作表：把 from 处的表移到 to 位置（页签拖拽排序）。
   * 活动表跟随其内容（按 identity 而非 index），保持选中的还是同一张表。
   */
  moveSheet(from, to) {
    const n = this.sheets.length;
    if (from < 0 || from >= n) return;
    const dest = Math.max(0, Math.min(to, n - 1));
    if (dest === from) return;
    const active = this.sheets[this.activeIndex];
    const [moved] = this.sheets.splice(from, 1);
    this.sheets.splice(dest, 0, moved);
    if (active) {
      const ni = this.sheets.indexOf(active);
      if (ni >= 0) this.activeIndex = ni;
    }
  }
  /** 清空所有工作表（对齐 wrapper.clearSheets）。 */
  clearSheets() {
    this.sheets = [];
    this.activeIndex = 0;
  }
  /** 全部工作表（只读视图）。 */
  getSheets() {
    return this.sheets;
  }
  /** 按名字找表。 */
  getSheetByName(name) {
    return this.sheets.find((s) => s.name() === name);
  }
  // ── 事件（对齐 spread.bind/unbind）──────────────────
  bind(event, handler) {
    this.events.bind(event, handler);
  }
  unbind(event, handler) {
    this.events.unbind(event, handler);
  }
  // ── 命令 / 撤销 ─────────────────────────────────────
  commandManager() {
    return this._commandManager;
  }
  undoManager() {
    return this._undoManager;
  }
  // ── 绘制抑制（M0 惰性计数，M1 渲染层接管）──────────
  suspendPaint() {
    this.paintSuspend++;
  }
  resumePaint() {
    if (this.paintSuspend > 0) this.paintSuspend--;
  }
  get isPaintSuspended() {
    return this.paintSuspend > 0;
  }
};

// src/core/SelectionModel.ts
var SelectionModel = class {
  constructor(rowCount, colCount, init) {
    this.rowCount = rowCount;
    this.colCount = colCount;
    this.ranges = init?.ranges?.length ? init.ranges.slice() : [new Range(0, 0, 1, 1)];
    this.activeRow = init?.activeRow ?? 0;
    this.activeCol = init?.activeCol ?? 0;
  }
  ranges;
  activeRow;
  activeCol;
  getState() {
    return {
      ranges: this.ranges.map((r) => new Range(r.row, r.col, r.rowCount, r.colCount)),
      activeRow: this.activeRow,
      activeCol: this.activeCol
    };
  }
  /** 当前（最后一个）选区。 */
  primary() {
    return this.ranges[this.ranges.length - 1];
  }
  getRanges() {
    return this.ranges.map((r) => new Range(r.row, r.col, r.rowCount, r.colCount));
  }
  getActive() {
    return { row: this.activeRow, col: this.activeCol };
  }
  clampRow(r) {
    return Math.max(0, Math.min(r, Math.max(0, this.rowCount() - 1)));
  }
  clampCol(c) {
    return Math.max(0, Math.min(c, Math.max(0, this.colCount() - 1)));
  }
  /** 单格选择（替换全部选区），活动格置于该格。 */
  select(row, col, rowCount = 1, colCount = 1) {
    const r = this.clampRow(row);
    const c = this.clampCol(col);
    this.ranges = [new Range(r, c, Math.max(1, rowCount), Math.max(1, colCount))];
    this.activeRow = r;
    this.activeCol = c;
  }
  /** 设选区为指定区域（保持活动格在区内左上）。 */
  selectRange(range2) {
    this.ranges = [new Range(range2.row, range2.col, range2.rowCount, range2.colCount)];
    this.activeRow = this.clampRow(range2.row);
    this.activeCol = this.clampCol(range2.col);
  }
  /** 追加一个选区（Ctrl+点击多选），活动格移到新区左上。 */
  addRange(row, col, rowCount = 1, colCount = 1) {
    const r = this.clampRow(row);
    const c = this.clampCol(col);
    this.ranges.push(new Range(r, c, Math.max(1, rowCount), Math.max(1, colCount)));
    this.activeRow = r;
    this.activeCol = c;
  }
  /** 只设活动格（不改选区形状）。 */
  setActive(row, col) {
    this.activeRow = this.clampRow(row);
    this.activeCol = this.clampCol(col);
  }
  /**
   * 移动活动格（方向键，不 Shift）：折叠为单格并移动。
   * 返回移动后的活动格。
   */
  move(dir) {
    const { row, col } = this.nextCell(this.activeRow, this.activeCol, dir);
    this.select(row, col, 1, 1);
    return { row, col };
  }
  /**
   * 扩展选区（Shift+方向键）：活动格不动，把选区边界朝方向推。
   * 以活动格为锚，另一角朝 dir 移动。
   */
  extend(dir) {
    const primary = this.primary();
    const anchorR = this.activeRow;
    const anchorC = this.activeCol;
    let floatR = primary.row === anchorR ? primary.lastRow : primary.row;
    let floatC = primary.col === anchorC ? primary.lastCol : primary.col;
    const moved = this.nextCell(floatR, floatC, dir);
    floatR = moved.row;
    floatC = moved.col;
    const range2 = Range.fromCorners(anchorR, anchorC, floatR, floatC);
    this.ranges[this.ranges.length - 1] = range2;
  }
  /** 选中整行（行头点击）。 */
  selectRow(row) {
    const r = this.clampRow(row);
    this.ranges = [new Range(r, 0, 1, Math.max(1, this.colCount()))];
    this.activeRow = r;
    this.activeCol = 0;
  }
  /** 选中整列（列头点击）。 */
  selectColumn(col) {
    const c = this.clampCol(col);
    this.ranges = [new Range(0, c, Math.max(1, this.rowCount()), 1)];
    this.activeRow = 0;
    this.activeCol = c;
  }
  /** 全选。 */
  selectAll() {
    this.ranges = [new Range(0, 0, Math.max(1, this.rowCount()), Math.max(1, this.colCount()))];
    this.activeRow = 0;
    this.activeCol = 0;
  }
  /**
   * 下一个单元格（钳制到网格边界，不环绕）。抽出供 move/extend 共用。
   */
  nextCell(row, col, dir) {
    let r = row;
    let c = col;
    switch (dir) {
      case "up":
        r = this.clampRow(row - 1);
        break;
      case "down":
        r = this.clampRow(row + 1);
        break;
      case "left":
        c = this.clampCol(col - 1);
        break;
      case "right":
        c = this.clampCol(col + 1);
        break;
    }
    return { row: r, col: c };
  }
  // ── M10 键盘导航补全 ─────────────────────────────────
  /**
   * Ctrl+方向键：跳到数据区边界。沿方向找非空/空的跳变点（Excel 语义）：
   *  - 当前格空 → 跳到该方向首个非空格（或轴末）。
   *  - 当前格非空、相邻非空 → 跳到连续非空段的末端。
   *  - 当前格非空、相邻空 → 跳到该方向下一个非空格（或轴末）。
   * isEmpty(r,c) 由调用方注入（读 sheet 值）。extendSel=true 时扩选而非移动。
   */
  jumpToEdge(dir, isEmpty, extendSel = false) {
    const from = extendSel ? this.floatCorner() : { row: this.activeRow, col: this.activeCol };
    const target = this.computeEdge(from.row, from.col, dir, isEmpty);
    if (extendSel) {
      const range2 = Range.fromCorners(this.activeRow, this.activeCol, target.row, target.col);
      this.ranges = [range2];
    } else {
      this.select(target.row, target.col, 1, 1);
    }
  }
  computeEdge(row, col, dir, isEmpty) {
    const dr = dir === "up" ? -1 : dir === "down" ? 1 : 0;
    const dc = dir === "left" ? -1 : dir === "right" ? 1 : 0;
    const maxR = Math.max(0, this.rowCount() - 1);
    const maxC = Math.max(0, this.colCount() - 1);
    const inBounds = (r2, c2) => r2 >= 0 && r2 <= maxR && c2 >= 0 && c2 <= maxC;
    let r = row, c = col;
    const next = (rr2, cc2) => ({ r: rr2 + dr, c: cc2 + dc });
    const n1 = next(r, c);
    if (!inBounds(n1.r, n1.c)) return { row: r, col: c };
    const curEmpty = isEmpty(r, c);
    const adjEmpty = isEmpty(n1.r, n1.c);
    if (curEmpty || adjEmpty) {
      let rr2 = n1.r, cc2 = n1.c;
      while (inBounds(rr2, cc2) && isEmpty(rr2, cc2)) {
        rr2 += dr;
        cc2 += dc;
      }
      if (!inBounds(rr2, cc2)) {
        return { row: this.clampRow(rr2 - dr), col: this.clampCol(cc2 - dc) };
      }
      return { row: rr2, col: cc2 };
    }
    let rr = r, cc = c;
    while (true) {
      const nx = next(rr, cc);
      if (!inBounds(nx.r, nx.c) || isEmpty(nx.r, nx.c)) break;
      rr = nx.r;
      cc = nx.c;
    }
    return { row: rr, col: cc };
  }
  /** 选区的浮动角（与活动格相对的另一角），供扩选跳边。 */
  floatCorner() {
    const p = this.primary();
    const r = p.row === this.activeRow ? p.lastRow : p.row;
    const c = p.col === this.activeCol ? p.lastCol : p.col;
    return { row: r, col: c };
  }
  /**
   * Enter/Tab 提交后在选区内回绕。选区为单格时退化为普通移动（下/右），
   * 多格时在区内游走（Enter 下移到底回列首并右移一列；Tab 右移到底回行首并下移一行）。
   * 返回移动后的活动格。
   */
  moveInSelection(dir, backward = false) {
    const p = this.primary();
    const multi = p.rowCount > 1 || p.colCount > 1;
    if (!multi) {
      const move = this.nextCell(this.activeRow, this.activeCol, backward ? dir === "down" ? "up" : "left" : dir);
      this.select(move.row, move.col, 1, 1);
      return move;
    }
    let rr = this.activeRow - p.row;
    let cc = this.activeCol - p.col;
    const R = p.rowCount, C = p.colCount;
    const step = backward ? -1 : 1;
    if (dir === "down") {
      rr += step;
      if (rr >= R) {
        rr = 0;
        cc += 1;
      } else if (rr < 0) {
        rr = R - 1;
        cc -= 1;
      }
      if (cc >= C) cc = 0;
      if (cc < 0) cc = C - 1;
    } else {
      cc += step;
      if (cc >= C) {
        cc = 0;
        rr += 1;
      } else if (cc < 0) {
        cc = C - 1;
        rr -= 1;
      }
      if (rr >= R) rr = 0;
      if (rr < 0) rr = R - 1;
    }
    this.activeRow = p.row + rr;
    this.activeCol = p.col + cc;
    return { row: this.activeRow, col: this.activeCol };
  }
  /** Home：移到当前行首列（col 0）。Ctrl+Home：移到 A1。 */
  moveToRowStart() {
    this.select(this.activeRow, 0, 1, 1);
  }
  moveToHome() {
    this.select(0, 0, 1, 1);
  }
  /** End / Ctrl+End：移到数据区末（这里用轴末，调用方可传数据边界覆盖）。 */
  moveToEnd(lastRow, lastCol) {
    this.select(lastRow ?? Math.max(0, this.rowCount() - 1), lastCol ?? Math.max(0, this.colCount() - 1), 1, 1);
  }
  /** PageUp/PageDown：按给定行数翻页移动活动格。 */
  pageMove(deltaRows, extendSel = false) {
    const target = this.clampRow(this.activeRow + deltaRows);
    if (extendSel) {
      const range2 = Range.fromCorners(this.activeRow, this.activeCol, target, this.activeCol);
      this.ranges = [range2];
      this.activeRow = this.activeRow;
    } else {
      this.select(target, this.activeCol, 1, 1);
    }
  }
  /** Ctrl+Space：选活动格所在整列。Shift+Space：选整行。 */
  selectWholeColumn() {
    this.selectColumn(this.activeCol);
  }
  selectWholeRow() {
    this.selectRow(this.activeRow);
  }
};

// src/core/sort.ts
function computeSortOrder(rows, keys) {
  const indexed = rows.map((r, i) => ({ r, i }));
  indexed.sort((a, b) => {
    for (let k = 0; k < keys.length; k++) {
      const asc = keys[k].ascending !== false;
      const av = a.r.values[k] ?? null;
      const bv = b.r.values[k] ?? null;
      const aEmpty = av === null || av === void 0 || av === "";
      const bEmpty = bv === null || bv === void 0 || bv === "";
      if (aEmpty && !bEmpty) return 1;
      if (!aEmpty && bEmpty) return -1;
      if (aEmpty && bEmpty) continue;
      const cmp = compareCellValues(av, bv);
      if (cmp !== 0) return asc ? cmp : -cmp;
    }
    return a.i - b.i;
  });
  return indexed.map((x) => x.r.row);
}
function compareCellValues(a, b) {
  const aEmpty = a === null || a === void 0 || a === "";
  const bEmpty = b === null || b === void 0 || b === "";
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;
  const aNum = typeof a === "number";
  const bNum = typeof b === "number";
  if (aNum && bNum) return a - b;
  if (aNum && !bNum) return -1;
  if (!aNum && bNum) return 1;
  const sa = typeof a === "boolean" ? a ? "TRUE" : "FALSE" : String(a);
  const sb = typeof b === "boolean" ? b ? "TRUE" : "FALSE" : String(b);
  return sa.localeCompare(sb);
}

// src/formula/Tokenizer.ts
var OP_CHARS = /* @__PURE__ */ new Set(["+", "-", "*", "/", "^", "&", "=", "<", ">"]);
var REF_RE = /^(?:('[^']+'|[A-Za-z_一-龥][A-Za-z0-9_一-龥]*)!)?(\$?[A-Za-z]{1,3})(\$?\d+)/;
var WHOLE_COL_RE = /^(?:('[^']+'|[A-Za-z_一-龥][A-Za-z0-9_一-龥]*)!)?(\$?[A-Za-z]{1,3}):(\$?[A-Za-z]{1,3})(?![A-Za-z0-9])/;
var WHOLE_ROW_RE = /^(?:('[^']+'|[A-Za-z_一-龥][A-Za-z0-9_一-龥]*)!)?(\$?\d+):(\$?\d+)(?![0-9])/;
var FormulaLexError = class extends Error {
  constructor(message, pos) {
    super(message);
    this.pos = pos;
    this.name = "FormulaLexError";
  }
};
function tokenize(input) {
  let src = String(input ?? "");
  if (src.charAt(0) === "=") src = src.slice(1);
  const tokens = [];
  let i = 0;
  const n = src.length;
  const isDigit = (c) => c >= "0" && c <= "9";
  const isIdentStart = (c) => c >= "A" && c <= "Z" || c >= "a" && c <= "z" || c === "_" || c >= "\u4E00";
  const isIdentPart = (c) => isIdentStart(c) || isDigit(c) || c === ".";
  while (i < n) {
    const c = src[i];
    if (c === " " || c === "	" || c === "\n" || c === "\r") {
      i++;
      continue;
    }
    if (c === "@") {
      i++;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      let str = "";
      let closed = false;
      while (j < n) {
        if (src[j] === '"') {
          if (src[j + 1] === '"') {
            str += '"';
            j += 2;
            continue;
          }
          closed = true;
          j++;
          break;
        }
        str += src[j];
        j++;
      }
      if (!closed) throw new FormulaLexError("\u672A\u95ED\u5408\u7684\u5B57\u7B26\u4E32", i);
      tokens.push({ type: "string", text: src.slice(i, j), pos: i, value: str });
      i = j;
      continue;
    }
    const wholeRowEarly = WHOLE_ROW_RE.exec(src.slice(i));
    if (wholeRowEarly) {
      const text = wholeRowEarly[0];
      tokens.push({ type: "range", text, pos: i, value: text });
      i += text.length;
      continue;
    }
    if (isDigit(c) || c === "." && isDigit(src[i + 1] ?? "")) {
      let j = i;
      while (j < n && isDigit(src[j])) j++;
      if (src[j] === ".") {
        j++;
        while (j < n && isDigit(src[j])) j++;
      }
      if (src[j] === "e" || src[j] === "E") {
        let k = j + 1;
        if (src[k] === "+" || src[k] === "-") k++;
        if (isDigit(src[k] ?? "")) {
          j = k;
          while (j < n && isDigit(src[j])) j++;
        }
      }
      const text = src.slice(i, j);
      tokens.push({ type: "number", text, pos: i, value: Number(text) });
      i = j;
      continue;
    }
    const slice = src.slice(i);
    const wholeCol = WHOLE_COL_RE.exec(slice);
    if (wholeCol) {
      const text = wholeCol[0];
      tokens.push({ type: "range", text, pos: i, value: text });
      i += text.length;
      continue;
    }
    const refMatch = REF_RE.exec(src.slice(i));
    if (refMatch && looksLikeRef(refMatch)) {
      const text = refMatch[0];
      const nx = src[i + text.length];
      const nextIsIdent = nx !== void 0 && (nx >= "A" && nx <= "Z" || nx >= "a" && nx <= "z" || nx === "_");
      if (nx !== "(" && !nextIsIdent) {
        tokens.push({ type: "ref", text, pos: i, value: text });
        i += text.length;
        continue;
      }
    }
    if (isIdentStart(c)) {
      let j = i + 1;
      while (j < n && isIdentPart(src[j])) j++;
      const text = src.slice(i, j);
      tokens.push({ type: "ident", text, pos: i });
      i = j;
      continue;
    }
    if (c === "(") {
      tokens.push({ type: "lparen", text: c, pos: i });
      i++;
      continue;
    }
    if (c === ")") {
      tokens.push({ type: "rparen", text: c, pos: i });
      i++;
      continue;
    }
    if (c === "{") {
      tokens.push({ type: "lbrace", text: c, pos: i });
      i++;
      continue;
    }
    if (c === "}") {
      tokens.push({ type: "rbrace", text: c, pos: i });
      i++;
      continue;
    }
    if (c === ",") {
      tokens.push({ type: "comma", text: c, pos: i });
      i++;
      continue;
    }
    if (c === ";") {
      tokens.push({ type: "semicolon", text: c, pos: i });
      i++;
      continue;
    }
    if (c === ":") {
      tokens.push({ type: "colon", text: c, pos: i });
      i++;
      continue;
    }
    if (c === "%") {
      tokens.push({ type: "percent", text: c, pos: i });
      i++;
      continue;
    }
    if (OP_CHARS.has(c)) {
      let text = c;
      const c2 = src[i + 1];
      if (c === "<" && (c2 === ">" || c2 === "=") || c === ">" && c2 === "=") {
        text = c + c2;
      }
      tokens.push({ type: "op", text, pos: i });
      i += text.length;
      continue;
    }
    throw new FormulaLexError(`\u65E0\u6CD5\u8BC6\u522B\u7684\u5B57\u7B26 '${c}'`, i);
  }
  tokens.push({ type: "eof", text: "", pos: n });
  return tokens;
}
function looksLikeRef(m) {
  const col = (m[2] ?? "").replace(/\$/g, "");
  return col.length >= 1 && col.length <= 3;
}

// src/formula/Parser.ts
var FormulaParseError = class extends Error {
  constructor(message, pos) {
    super(message);
    this.pos = pos;
    this.name = "FormulaParseError";
  }
};
var BIN_PREC = {
  "=": 1,
  "<>": 1,
  "<": 1,
  ">": 1,
  "<=": 1,
  ">=": 1,
  "&": 2,
  "+": 3,
  "-": 3,
  "*": 4,
  "/": 4,
  "^": 5
};
var RIGHT_ASSOC = /* @__PURE__ */ new Set(["^"]);
var Parser = class {
  constructor(tokens) {
    this.tokens = tokens;
  }
  i = 0;
  peek() {
    return this.tokens[this.i];
  }
  next() {
    return this.tokens[this.i++];
  }
  expect(type) {
    const t = this.peek();
    if (t.type !== type) throw new FormulaParseError(`\u671F\u671B ${type}\uFF0C\u9047\u5230 '${t.text || t.type}'`, t.pos);
    return this.next();
  }
  parse() {
    if (this.peek().type === "eof") {
      throw new FormulaParseError("\u7A7A\u516C\u5F0F", 0);
    }
    const node = this.parseExpr(0);
    if (this.peek().type !== "eof") {
      const t = this.peek();
      throw new FormulaParseError(`\u591A\u4F59\u7684\u8BB0\u53F7 '${t.text || t.type}'`, t.pos);
    }
    return node;
  }
  /** 优先级爬升：解析 ≥ minPrec 的中缀表达式。 */
  parseExpr(minPrec) {
    let left = this.parseUnary();
    for (; ; ) {
      const t = this.peek();
      if (t.type !== "op") break;
      const prec = BIN_PREC[t.text];
      if (prec === void 0 || prec < minPrec) break;
      this.next();
      const nextMin = RIGHT_ASSOC.has(t.text) ? prec : prec + 1;
      const right = this.parseExpr(nextMin);
      left = { kind: "binary", op: t.text, left, right };
    }
    return left;
  }
  /** 一元前缀（- +）+ 后缀百分号。 */
  parseUnary() {
    const t = this.peek();
    if (t.type === "op" && (t.text === "-" || t.text === "+")) {
      this.next();
      const operand = this.parseUnary();
      const node = t.text === "-" ? { kind: "unary", op: "-", operand } : operand;
      return this.parsePostfix(node);
    }
    return this.parsePostfix(this.parsePrimary());
  }
  /** 后缀百分号：x% → x/100（建模为 unary '%'）。 */
  parsePostfix(node) {
    let cur = node;
    while (this.peek().type === "percent") {
      this.next();
      cur = { kind: "unary", op: "%", operand: cur };
    }
    return cur;
  }
  parsePrimary() {
    const t = this.peek();
    switch (t.type) {
      case "number":
        this.next();
        return { kind: "number", value: t.value };
      case "string":
        this.next();
        return { kind: "string", value: t.value };
      case "lparen": {
        this.next();
        const inner = this.parseExpr(0);
        this.expect("rparen");
        return inner;
      }
      case "lbrace":
        return this.parseArray();
      case "ref":
        return this.parseRefOrRange();
      case "range":
        return this.parseWholeRange();
      case "ident":
        return this.parseIdent();
      default:
        throw new FormulaParseError(`\u610F\u5916\u7684\u8BB0\u53F7 '${t.text || t.type}'`, t.pos);
    }
  }
  /** 引用或区域：ref [':' ref] → range，否则 ref。 */
  parseRefOrRange() {
    const first = this.next();
    if (this.peek().type === "colon") {
      this.next();
      const second = this.expect("ref");
      return { kind: "range", start: String(first.value), end: String(second.value) };
    }
    return { kind: "ref", ref: String(first.value) };
  }
  /** 整列/整行区域 token（A:A / 1:1）→ range 节点。start/end 为无行/无列的端点，由访问器钳到 usedRange。 */
  parseWholeRange() {
    const t = this.next();
    const text = String(t.value);
    const bang = text.indexOf("!");
    const prefix = bang >= 0 ? text.slice(0, bang + 1) : "";
    const body = bang >= 0 ? text.slice(bang + 1) : text;
    const colon = body.indexOf(":");
    const a = body.slice(0, colon);
    const b = body.slice(colon + 1);
    return { kind: "range", start: prefix + a, end: prefix + b };
  }
  /** 数组字面量 {1,2;3,4}：逗号分列、分号分行。各元素为标量表达式。 */
  parseArray() {
    this.expect("lbrace");
    const rows = [];
    let row = [this.parseExpr(0)];
    while (this.peek().type === "comma" || this.peek().type === "semicolon") {
      const sep = this.next().type;
      if (sep === "semicolon") {
        rows.push(row);
        row = [];
      }
      row.push(this.parseExpr(0));
    }
    rows.push(row);
    this.expect("rbrace");
    return { kind: "array", rows };
  }
  /** 标识符：函数调用 name(...) 或命名/布尔字面。 */
  parseIdent() {
    const id = this.next();
    if (this.peek().type === "lparen") {
      this.next();
      const args = [];
      if (this.peek().type !== "rparen") {
        args.push(this.parseExpr(0));
        while (this.peek().type === "comma") {
          this.next();
          args.push(this.parseExpr(0));
        }
      }
      this.expect("rparen");
      return { kind: "call", name: id.text.toUpperCase(), args };
    }
    return { kind: "name", name: id.text };
  }
};
function parseFormula(input) {
  return new Parser(tokenize(input)).parse();
}

// src/formula/refTransform.ts
var LOCAL_RE = /^(\$?)([A-Za-z]{1,3})(\$?)(\d+)$/;
function parseStructRef(ref) {
  const raw = String(ref ?? "").trim();
  if (!raw) return null;
  let sheet = "";
  let sheetQuoted = false;
  let local = raw;
  const bang = raw.indexOf("!");
  if (bang >= 0) {
    let s = raw.slice(0, bang);
    local = raw.slice(bang + 1);
    if (s.charAt(0) === "'" && s.charAt(s.length - 1) === "'") {
      s = s.slice(1, -1).replace(/''/g, "'");
      sheetQuoted = true;
    }
    sheet = s;
  }
  const m = LOCAL_RE.exec(local);
  if (!m) return null;
  const col = labelToCol(m[2]);
  const row = Number(m[4]) - 1;
  if (col < 0 || row < 0 || !Number.isFinite(row)) return null;
  return { sheet, sheetQuoted, col, row, colAbs: m[1] === "$", rowAbs: m[3] === "$" };
}
function stringifyStructRef(r) {
  if (r.col < 0 || r.row < 0) return "#REF!";
  const local = `${r.colAbs ? "$" : ""}${colToLabel(r.col)}${r.rowAbs ? "$" : ""}${r.row + 1}`;
  if (!r.sheet) return local;
  const name = r.sheetQuoted ? `'${r.sheet.replace(/'/g, "''")}'` : r.sheet;
  return `${name}!${local}`;
}
var NEEDS_QUOTE_STR = /["]/g;
function stringifyString(s) {
  return `"${s.replace(NEEDS_QUOTE_STR, '""')}"`;
}
function stringifyNumber(n) {
  return String(n);
}
function stringifyAst(node) {
  switch (node.kind) {
    case "number":
      return stringifyNumber(node.value);
    case "string":
      return stringifyString(node.value);
    case "ref":
      return node.ref;
    case "range":
      return `${node.start}:${node.end}`;
    case "array":
      return `{${node.rows.map((row) => row.map((c) => stringifyAst(c)).join(",")).join(";")}}`;
    case "name":
      return node.name;
    case "unary":
      if (node.op === "%") return `${stringifyAst(node.operand)}%`;
      return `${node.op}${wrap(node.operand)}`;
    case "binary":
      return `${wrap(node.left)}${node.op}${wrap(node.right)}`;
    case "call":
      return `${node.name}(${node.args.map((a) => stringifyAst(a)).join(",")})`;
  }
}
function wrap(node) {
  if (node.kind === "binary" || node.kind === "unary" && node.op !== "%") {
    return `(${stringifyAst(node)})`;
  }
  return stringifyAst(node);
}
function mapRefs(node, map) {
  switch (node.kind) {
    case "ref": {
      const s = parseStructRef(node.ref);
      return s ? { kind: "ref", ref: stringifyStructRef(map(s)) } : node;
    }
    case "range": {
      const a = parseStructRef(node.start);
      const b = parseStructRef(node.end);
      if (!a || !b) return node;
      return { kind: "range", start: stringifyStructRef(map(a)), end: stringifyStructRef(map(b)) };
    }
    case "unary":
      return { kind: "unary", op: node.op, operand: mapRefs(node.operand, map) };
    case "binary":
      return { kind: "binary", op: node.op, left: mapRefs(node.left, map), right: mapRefs(node.right, map) };
    case "call":
      return { kind: "call", name: node.name, args: node.args.map((a) => mapRefs(a, map)) };
    case "array":
      return { kind: "array", rows: node.rows.map((row) => row.map((c) => mapRefs(c, map))) };
    default:
      return node;
  }
}
function translateFormula(formula, dRow, dCol) {
  const src = stripEq(formula);
  if (!src) return src;
  if (dRow === 0 && dCol === 0) return src;
  let ast;
  try {
    ast = parseFormula(src);
  } catch {
    return src;
  }
  const shifted = mapRefs(ast, (r) => ({
    ...r,
    row: r.rowAbs ? r.row : r.row + dRow,
    col: r.colAbs ? r.col : r.col + dCol
  }));
  return stringifyAst(shifted);
}
function adjustForStructural(formula, edit, formulaSheet) {
  const src = stripEq(formula);
  if (!src || edit.count <= 0) return src;
  let ast;
  try {
    ast = parseFormula(src);
  } catch {
    return src;
  }
  const adjusted = mapRefs(ast, (r) => {
    const targetSheet = r.sheet || formulaSheet;
    if (targetSheet !== edit.editSheet) return r;
    const pos = edit.axis === "row" ? r.row : r.col;
    const shifted = shiftIndex(pos, edit);
    if (edit.axis === "row") return { ...r, row: shifted };
    return { ...r, col: shifted };
  });
  return stringifyAst(adjusted);
}
function shiftIndex(pos, edit) {
  const { index, count, op } = edit;
  if (op === "insert") {
    return pos >= index ? pos + count : pos;
  }
  if (pos >= index && pos < index + count) return -1;
  if (pos >= index + count) return pos - count;
  return pos;
}
function stripEq(formula) {
  const f2 = String(formula ?? "").trim();
  if (!f2) return "";
  return f2.charAt(0) === "=" ? f2.slice(1).trim() : f2;
}

// src/core/EditCommands.ts
function snapshotRegion(sheet, ranges) {
  const seen = /* @__PURE__ */ new Set();
  const snaps = [];
  for (const r of ranges) {
    r.forEachCell((row, col) => {
      const key2 = `${row},${col}`;
      if (seen.has(key2)) return;
      seen.add(key2);
      snaps.push({ row, col, data: sheet.getCellData(row, col) });
    });
  }
  return snaps;
}
function adjustWorkbookFormulas(workbook, edit) {
  if (!workbook) return [];
  const edits = [];
  for (const ws of workbook.getSheets()) {
    const formulaSheet = ws.name();
    ws.forEachCell((data, row, col) => {
      if (!data.formula) return;
      const after = adjustForStructural(data.formula, edit, formulaSheet);
      if (after !== data.formula) {
        edits.push({ sheet: ws, row, col, before: data.formula, after });
      }
    });
  }
  for (const e of edits) e.sheet.setFormula(e.row, e.col, e.after);
  return edits;
}
function revertFormulaEdits(edits) {
  for (const e of edits) e.sheet.setFormula(e.row, e.col, e.before);
}
function restoreSnapshot(sheet, snaps) {
  for (const s of snaps) {
    if (s.data === null) {
      sheet.setValue(s.row, s.col, null);
      sheet.setFormula(s.row, s.col, null);
      sheet.setStyle(s.row, s.col, void 0);
    } else {
      sheet.setStyle(s.row, s.col, s.data.style);
      if (s.data.formula) {
        sheet.setFormula(s.row, s.col, s.data.formula);
      } else {
        sheet.setFormula(s.row, s.col, null);
        sheet.setValue(s.row, s.col, s.data.value ?? null);
      }
    }
  }
}
var SnapshotCommand = class {
  constructor(name, sheet, ranges, apply) {
    this.name = name;
    this.sheet = sheet;
    this.ranges = ranges;
    this.apply = apply;
  }
  before = null;
  execute() {
    if (this.before === null) {
      this.before = snapshotRegion(this.sheet, this.ranges);
    }
    this.apply(this.sheet);
  }
  undo() {
    if (this.before) restoreSnapshot(this.sheet, this.before);
  }
};
function setValueCommand(sheet, row, col, value) {
  return new SnapshotCommand("\u7F16\u8F91\u5355\u5143\u683C", sheet, [new Range(row, col, 1, 1)], (s) => s.setValue(row, col, value));
}
function setFormulaCommand(sheet, row, col, formula) {
  return new SnapshotCommand("\u7F16\u8F91\u516C\u5F0F", sheet, [new Range(row, col, 1, 1)], (s) => s.setFormula(row, col, formula));
}
function runUndoableCommand(sheet, ranges, mutator, label = "\u7F16\u8F91\u8868\u683C") {
  return new SnapshotCommand(label, sheet, ranges, () => mutator());
}
function applyStyleCommand(sheet, ranges, patch) {
  return new SnapshotCommand("\u8BBE\u7F6E\u5355\u5143\u683C\u683C\u5F0F", sheet, ranges, (s) => {
    for (const r of ranges) {
      r.forEachCell((row, col) => {
        s.setStyle(row, col, mergeStyle(s.getStyle(row, col), patch));
      });
    }
  });
}
function clearStyleKeysCommand(sheet, ranges, keys) {
  return new SnapshotCommand("\u6E05\u9664\u586B\u5145", sheet, ranges, (s) => {
    for (const r of ranges) {
      r.forEachCell((row, col) => {
        const cur = s.getStyle(row, col);
        if (!cur) return;
        const next = { ...cur };
        for (const k of keys) delete next[k];
        s.setStyle(row, col, next);
      });
    }
  });
}
function fillCommand(sheet, targetCells, filled) {
  const ranges = targetCells.map((t) => new Range(t.row, t.col, 1, 1));
  return new SnapshotCommand("\u586B\u5145", sheet, ranges, (s) => {
    for (let i = 0; i < targetCells.length; i++) {
      const t = targetCells[i];
      const d = filled[i];
      if (!d) continue;
      writeCellData(s, t.row, t.col, d);
    }
  });
}
function pasteFormatCommand(sheet, ranges, style) {
  return new SnapshotCommand("\u683C\u5F0F\u5237", sheet, ranges, (s) => {
    for (const r of ranges) r.forEachCell((row, col) => s.setStyle(row, col, style ? { ...style } : void 0));
  });
}
function pasteExternalCommand(sheet, targetRow, targetCol, grid) {
  const rows = grid.length;
  const cols = grid.reduce((m, r) => Math.max(m, r.length), 0);
  const range2 = new Range(targetRow, targetCol, Math.max(1, rows), Math.max(1, cols));
  return new SnapshotCommand("\u7C98\u8D34", sheet, [range2], (s) => {
    for (let r = 0; r < rows; r++) {
      const line = grid[r];
      for (let c = 0; c < line.length; c++) {
        const rr = targetRow + r, cc = targetCol + c;
        if (rr >= s.getRowCount() || cc >= s.getColumnCount()) continue;
        const raw = line[c];
        s.setFormula(rr, cc, null);
        if (raw !== "" && !Number.isNaN(Number(raw)) && raw.trim() !== "") s.setValue(rr, cc, Number(raw));
        else s.setValue(rr, cc, raw === "" ? null : raw);
      }
    }
  });
}
function moveRangeCommand(sheet, src, targetRow, targetCol) {
  const dst = new Range(targetRow, targetCol, src.rowCount, src.colCount);
  return new SnapshotCommand("\u79FB\u52A8", sheet, [src, dst], (s) => {
    const data = [];
    src.forEachCell((row, col) => data.push({ dr: row - src.row, dc: col - src.col, d: s.getCellData(row, col) }));
    src.forEachCell((row, col) => writeCellData(s, row, col, null));
    for (const { dr, dc, d } of data) writeCellData(s, targetRow + dr, targetCol + dc, d);
  });
}
function writeCellData(sheet, row, col, data) {
  if (row < 0 || col < 0 || row >= sheet.getRowCount() || col >= sheet.getColumnCount()) return;
  if (data === null) {
    sheet.setFormula(row, col, null);
    sheet.setValue(row, col, null);
    sheet.setStyle(row, col, void 0);
    return;
  }
  sheet.setStyle(row, col, data.style);
  if (data.formula) {
    sheet.setFormula(row, col, data.formula);
  } else {
    sheet.setFormula(row, col, null);
    sheet.setValue(row, col, data.value ?? null);
  }
}
function replaceCommand(sheet, hits, search, replace, matchCase = false) {
  const ranges = hits.map((h) => new Range(h.row, h.col, 1, 1));
  return new SnapshotCommand("\u66FF\u6362", sheet, ranges, (s) => {
    for (const h of hits) {
      const v = s.getValue(h.row, h.col);
      if (v === null || v === void 0 || typeof v === "boolean") continue;
      const text = String(v);
      const replaced = replaceText(text, search, replace, matchCase);
      if (replaced !== "" && !Number.isNaN(Number(replaced)) && replaced.trim() !== "") s.setValue(h.row, h.col, Number(replaced));
      else s.setValue(h.row, h.col, replaced);
    }
  });
}
function replaceText(text, search, replace, matchCase) {
  if (search === "") return text;
  if (matchCase) return text.split(search).join(replace);
  const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  return text.replace(re, replace);
}
function sortRangeCommand(sheet, range2, keys, hasHeader = false) {
  return new SnapshotCommand("\u6392\u5E8F", sheet, [range2], (s) => {
    const firstDataRow = range2.row + (hasHeader ? 1 : 0);
    const lastRow = range2.row + range2.rowCount - 1;
    const rowsMeta = [];
    const rowData = /* @__PURE__ */ new Map();
    for (let r = firstDataRow; r <= lastRow; r++) {
      const values = keys.map((k) => s.getValue(r, k.col));
      rowsMeta.push({ row: r, values });
      const cells = [];
      for (let c = range2.col; c < range2.col + range2.colCount; c++) cells.push(s.getCellData(r, c) ?? {});
      rowData.set(r, cells);
    }
    const order = computeSortOrder(rowsMeta, keys);
    for (let i = 0; i < order.length; i++) {
      const targetRow = firstDataRow + i;
      const srcRow = order[i];
      const cells = rowData.get(srcRow);
      for (let c = 0; c < cells.length; c++) writeCellData(s, targetRow, range2.col + c, cells[c]);
    }
  });
}
function applyBorderCommand(sheet, ranges, kind, color = "#8a8f94", lineStyle = "thin") {
  const edge = { style: lineStyle, color };
  const label = kind === "none" ? "\u6E05\u9664\u8FB9\u6846" : "\u8BBE\u7F6E\u8FB9\u6846";
  return new SnapshotCommand(label, sheet, ranges, (s) => {
    for (const r of ranges) {
      const r0 = r.row, c0 = r.col;
      const r1 = r.row + r.rowCount - 1, c1 = r.col + r.colCount - 1;
      const set = (row, col, sides) => {
        const cur = s.getStyle(row, col);
        s.setStyle(row, col, mergeStyle(cur, { borders: sides }));
      };
      const clear = (row, col) => {
        const none = { style: "none", color };
        set(row, col, { top: none, bottom: none, left: none, right: none });
      };
      switch (kind) {
        case "none":
          for (let row = r0; row <= r1; row++) for (let col = c0; col <= c1; col++) clear(row, col);
          break;
        case "all":
          for (let row = r0; row <= r1; row++) for (let col = c0; col <= c1; col++) {
            set(row, col, { top: edge, bottom: edge, left: edge, right: edge });
          }
          break;
        case "top":
          for (let col = c0; col <= c1; col++) set(r0, col, { top: edge });
          break;
        case "bottom":
          for (let col = c0; col <= c1; col++) set(r1, col, { bottom: edge });
          break;
        case "left":
          for (let row = r0; row <= r1; row++) set(row, c0, { left: edge });
          break;
        case "right":
          for (let row = r0; row <= r1; row++) set(row, c1, { right: edge });
          break;
        case "outline":
          for (let col = c0; col <= c1; col++) {
            set(r0, col, { top: edge });
            set(r1, col, { bottom: edge });
          }
          for (let row = r0; row <= r1; row++) {
            set(row, c0, { left: edge });
            set(row, c1, { right: edge });
          }
          break;
        case "inside":
          for (let row = r0; row <= r1; row++) for (let col = c0; col <= c1; col++) {
            if (row < r1) set(row, col, { bottom: edge });
            if (col < c1) set(row, col, { right: edge });
          }
          break;
        case "innerHorizontal":
          for (let row = r0; row < r1; row++) for (let col = c0; col <= c1; col++) set(row, col, { bottom: edge });
          break;
        case "innerVertical":
          for (let col = c0; col < c1; col++) for (let row = r0; row <= r1; row++) set(row, col, { right: edge });
          break;
      }
    }
  });
}
function clearCommand(sheet, ranges, mode2 = "all") {
  const label = mode2 === "format" ? "\u6E05\u9664\u683C\u5F0F" : mode2 === "value" ? "\u6E05\u9664\u5185\u5BB9" : "\u6E05\u9664";
  return new SnapshotCommand(label, sheet, ranges, (s) => {
    for (const r of ranges) {
      r.forEachCell((row, col) => {
        if (mode2 === "all" || mode2 === "value") {
          s.setFormula(row, col, null);
          s.setValue(row, col, null);
        }
        if (mode2 === "all" || mode2 === "format") {
          s.setStyle(row, col, void 0);
        }
      });
    }
  });
}
function mergeCommand(sheet, range2) {
  let removedSpans = [];
  let cellSnapshot = [];
  return {
    name: "\u5408\u5E76\u5355\u5143\u683C",
    execute() {
      removedSpans = sheet.getSpans().filter((sp) => {
        const spRange = new Range(sp.row, sp.col, sp.rowCount, sp.colCount);
        return spRange.intersects(range2);
      });
      cellSnapshot = snapshotRegion(sheet, [range2]);
      sheet.addSpan(range2.row, range2.col, range2.rowCount, range2.colCount);
    },
    undo() {
      sheet.removeSpan(range2.row, range2.col);
      for (const sp of removedSpans) sheet.addSpan(sp.row, sp.col, sp.rowCount, sp.colCount);
      restoreSnapshot(sheet, cellSnapshot);
    }
  };
}
function unmergeCommand(sheet, ranges) {
  let removed = [];
  return {
    name: "\u53D6\u6D88\u5408\u5E76",
    execute() {
      removed = [];
      for (const r of ranges) {
        for (const sp of sheet.getSpans()) {
          const spRange = new Range(sp.row, sp.col, sp.rowCount, sp.colCount);
          if (spRange.intersects(r) && !removed.some((x) => x.row === sp.row && x.col === sp.col)) {
            removed.push(sp);
            sheet.removeSpan(sp.row, sp.col);
          }
        }
      }
    },
    undo() {
      for (const sp of removed) sheet.addSpan(sp.row, sp.col, sp.rowCount, sp.colCount);
    }
  };
}
function insertRowsCommand(sheet, before, count, workbook) {
  const editSheet = sheet.name();
  let fEdits = [];
  return {
    name: "\u63D2\u5165\u884C",
    structural: { axis: "row", op: "insert", index: before, count, sheet: editSheet },
    execute() {
      sheet.addRows(before, count);
      fEdits = adjustWorkbookFormulas(workbook, { axis: "row", op: "insert", index: before, count, editSheet });
    },
    undo() {
      revertFormulaEdits(fEdits);
      sheet.deleteRows(before, count);
    }
  };
}
function insertColumnsCommand(sheet, before, count, workbook) {
  const editSheet = sheet.name();
  let fEdits = [];
  return {
    name: "\u63D2\u5165\u5217",
    structural: { axis: "col", op: "insert", index: before, count, sheet: editSheet },
    execute() {
      sheet.addColumns(before, count);
      fEdits = adjustWorkbookFormulas(workbook, { axis: "col", op: "insert", index: before, count, editSheet });
    },
    undo() {
      revertFormulaEdits(fEdits);
      sheet.deleteColumns(before, count);
    }
  };
}
function deleteRowsCommand(sheet, start, count, workbook) {
  const editSheet = sheet.name();
  let snap = [];
  let spanSnap = [];
  let fEdits = [];
  return {
    name: "\u5220\u9664\u884C",
    structural: { axis: "row", op: "delete", index: start, count, sheet: editSheet },
    execute() {
      const width = Math.max(1, sheet.getColumnCount());
      snap = snapshotRegion(sheet, [new Range(start, 0, count, width)]);
      spanSnap = sheet.getSpans().filter((sp) => sp.row >= start && sp.row < start + count);
      sheet.deleteRows(start, count);
      fEdits = adjustWorkbookFormulas(workbook, { axis: "row", op: "delete", index: start, count, editSheet });
    },
    undo() {
      revertFormulaEdits(fEdits);
      sheet.addRows(start, count);
      restoreSnapshot(sheet, snap);
      for (const sp of spanSnap) sheet.addSpan(sp.row, sp.col, sp.rowCount, sp.colCount);
    }
  };
}
function deleteColumnsCommand(sheet, start, count, workbook) {
  const editSheet = sheet.name();
  let snap = [];
  let spanSnap = [];
  let fEdits = [];
  return {
    name: "\u5220\u9664\u5217",
    structural: { axis: "col", op: "delete", index: start, count, sheet: editSheet },
    execute() {
      const height = Math.max(1, sheet.getRowCount());
      snap = snapshotRegion(sheet, [new Range(0, start, height, count)]);
      spanSnap = sheet.getSpans().filter((sp) => sp.col >= start && sp.col < start + count);
      sheet.deleteColumns(start, count);
      fEdits = adjustWorkbookFormulas(workbook, { axis: "col", op: "delete", index: start, count, editSheet });
    },
    undo() {
      revertFormulaEdits(fEdits);
      sheet.addColumns(start, count);
      restoreSnapshot(sheet, snap);
      for (const sp of spanSnap) sheet.addSpan(sp.row, sp.col, sp.rowCount, sp.colCount);
    }
  };
}
function groupRowsCommand(sheet, start, count) {
  return {
    name: "\u5206\u7EC4\u884C",
    execute() {
      sheet.rowOutlines.group(start, count);
      sheet.applyOutlineVisibility();
    },
    undo() {
      sheet.rowOutlines.removeExact(start, count);
      sheet.applyOutlineVisibility();
    }
  };
}
function groupColumnsCommand(sheet, start, count) {
  return {
    name: "\u5206\u7EC4\u5217",
    execute() {
      sheet.columnOutlines.group(start, count);
      sheet.applyOutlineVisibility();
    },
    undo() {
      sheet.columnOutlines.removeExact(start, count);
      sheet.applyOutlineVisibility();
    }
  };
}
function ungroupRowsCommand(sheet, index) {
  let removed = null;
  return {
    name: "\u53D6\u6D88\u884C\u5206\u7EC4",
    execute() {
      const covering = sheet.rowOutlines.list().filter((g) => index >= g.start && index < g.start + g.count).sort((a, b) => b.level - a.level);
      removed = covering[0] ? { start: covering[0].start, count: covering[0].count } : null;
      sheet.rowOutlines.ungroup(index);
      sheet.applyOutlineVisibility();
    },
    undo() {
      if (removed) {
        sheet.rowOutlines.group(removed.start, removed.count);
        sheet.applyOutlineVisibility();
      }
    }
  };
}
function ungroupColumnsCommand(sheet, index) {
  let removed = null;
  return {
    name: "\u53D6\u6D88\u5217\u5206\u7EC4",
    execute() {
      const covering = sheet.columnOutlines.list().filter((g) => index >= g.start && index < g.start + g.count).sort((a, b) => b.level - a.level);
      removed = covering[0] ? { start: covering[0].start, count: covering[0].count } : null;
      sheet.columnOutlines.ungroup(index);
      sheet.applyOutlineVisibility();
    },
    undo() {
      if (removed) {
        sheet.columnOutlines.group(removed.start, removed.count);
        sheet.applyOutlineVisibility();
      }
    }
  };
}
function toCellVal(raw) {
  if (raw === "") return null;
  if (raw.trim() !== "" && !Number.isNaN(Number(raw))) return Number(raw);
  return raw;
}
function textToColumnsCommand(sheet, range2, opts) {
  const splitOne = (text) => {
    if (opts.fixedWidths && opts.fixedWidths.length) {
      const out = [];
      let i = 0;
      for (const w of opts.fixedWidths) {
        out.push(text.slice(i, i + w));
        i += w;
      }
      if (i < text.length) out.push(text.slice(i));
      return out;
    }
    const d = opts.delimiter ?? ",";
    return d === "" ? [text] : text.split(d);
  };
  let maxParts = 1;
  for (let r = range2.row; r < range2.row + range2.rowCount; r++) {
    maxParts = Math.max(maxParts, splitOne(String(sheet.getValue(r, range2.col) ?? "")).length);
  }
  const snapRange = new Range(range2.row, range2.col, range2.rowCount, Math.max(range2.colCount, maxParts));
  return new SnapshotCommand("\u6587\u672C\u5206\u5217", sheet, [snapRange], (s) => {
    for (let r = range2.row; r < range2.row + range2.rowCount; r++) {
      const parts = splitOne(String(s.getValue(r, range2.col) ?? ""));
      for (let k = 0; k < maxParts; k++) {
        const cc = range2.col + k;
        if (cc >= s.getColumnCount()) break;
        s.setFormula(r, cc, null);
        s.setValue(r, cc, k < parts.length ? toCellVal(parts[k]) : null);
      }
    }
  });
}
function removeDuplicatesCommand(sheet, range2, opts = {}) {
  const startData = opts.hasHeader ? range2.row + 1 : range2.row;
  const keyCols = opts.keyCols && opts.keyCols.length ? opts.keyCols.map((k) => range2.col + k) : Array.from({ length: range2.colCount }, (_, k) => range2.col + k);
  const kept = [];
  const seen = /* @__PURE__ */ new Set();
  let removed = 0;
  for (let r = startData; r < range2.row + range2.rowCount; r++) {
    const key2 = keyCols.map((c) => {
      const v = sheet.getValue(r, c);
      return v === null || v === void 0 ? "" : String(v);
    }).join("");
    if (seen.has(key2)) {
      removed++;
      continue;
    }
    seen.add(key2);
    const rowData = [];
    for (let c = range2.col; c < range2.col + range2.colCount; c++) rowData.push(sheet.getCellData(r, c));
    kept.push(rowData);
  }
  const snapRange = new Range(startData, range2.col, range2.row + range2.rowCount - startData, range2.colCount);
  const command = new SnapshotCommand("\u5220\u9664\u91CD\u590D", sheet, [snapRange], (s) => {
    for (let i = 0; i < kept.length; i++) {
      const rowData = kept[i];
      const rr = startData + i;
      for (let k = 0; k < rowData.length; k++) writeCellData(s, rr, range2.col + k, rowData[k] ?? null);
    }
    for (let rr = startData + kept.length; rr < range2.row + range2.rowCount; rr++) {
      for (let c = range2.col; c < range2.col + range2.colCount; c++) {
        s.setFormula(rr, c, null);
        s.setValue(rr, c, null);
        s.setStyle(rr, c, void 0);
      }
    }
  });
  return { command, removed };
}
function consolidateCommand(sheet, targetRow, targetCol, sources, opts = {}) {
  const func = opts.func ?? "sum";
  const agg = (nums2) => {
    if (nums2.length === 0) return 0;
    switch (func) {
      case "sum":
        return nums2.reduce((a, b) => a + b, 0);
      case "average":
        return nums2.reduce((a, b) => a + b, 0) / nums2.length;
      case "count":
        return nums2.length;
      case "max":
        return Math.max(...nums2);
      case "min":
        return Math.min(...nums2);
      case "product":
        return nums2.reduce((a, b) => a * b, 1);
      default:
        return nums2.reduce((a, b) => a + b, 0);
    }
  };
  const numAt = (r, dr, dc) => {
    const v = sheet.getValue(r.row + dr, r.col + dc);
    if (typeof v === "number") return v;
    if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
    return null;
  };
  if (opts.byLabel) {
    const valCols = (sources[0]?.colCount ?? 1) - 1;
    const order = [];
    const map = /* @__PURE__ */ new Map();
    for (const src of sources) {
      for (let dr = 0; dr < src.rowCount; dr++) {
        const label = String(sheet.getValue(src.row + dr, src.col) ?? "");
        if (label === "") continue;
        if (!map.has(label)) {
          map.set(label, Array.from({ length: valCols }, () => []));
          order.push(label);
        }
        const bucket = map.get(label);
        for (let vc = 0; vc < valCols; vc++) {
          const n = numAt(src, dr, vc + 1);
          if (n !== null) bucket[vc].push(n);
        }
      }
    }
    const snapRange2 = new Range(targetRow, targetCol, Math.max(1, order.length), Math.max(1, valCols + 1));
    return new SnapshotCommand("\u5408\u5E76\u8BA1\u7B97", sheet, [snapRange2], (s) => {
      for (let i = 0; i < order.length; i++) {
        const label = order[i];
        const rr = targetRow + i;
        s.setFormula(rr, targetCol, null);
        s.setValue(rr, targetCol, label);
        const bucket = map.get(label);
        for (let vc = 0; vc < valCols; vc++) {
          const cc = targetCol + 1 + vc;
          s.setFormula(rr, cc, null);
          s.setValue(rr, cc, agg(bucket[vc]));
        }
      }
    });
  }
  const rows = sources.reduce((m, r) => Math.max(m, r.rowCount), 0);
  const cols = sources.reduce((m, r) => Math.max(m, r.colCount), 0);
  const snapRange = new Range(targetRow, targetCol, Math.max(1, rows), Math.max(1, cols));
  return new SnapshotCommand("\u5408\u5E76\u8BA1\u7B97", sheet, [snapRange], (s) => {
    for (let dr = 0; dr < rows; dr++) {
      for (let dc = 0; dc < cols; dc++) {
        const nums2 = [];
        for (const src of sources) {
          if (dr < src.rowCount && dc < src.colCount) {
            const n = numAt(src, dr, dc);
            if (n !== null) nums2.push(n);
          }
        }
        const rr = targetRow + dr, cc = targetCol + dc;
        if (rr >= s.getRowCount() || cc >= s.getColumnCount()) continue;
        s.setFormula(rr, cc, null);
        s.setValue(rr, cc, nums2.length ? agg(nums2) : null);
      }
    }
  });
}

// src/core/Clipboard.ts
var Clipboard = class {
  payload = null;
  /** 是否有可粘贴内容。 */
  get hasContent() {
    return this.payload !== null;
  }
  /** 剪贴板尺寸（无内容返回 null）。 */
  get size() {
    return this.payload ? { rowCount: this.payload.rowCount, colCount: this.payload.colCount } : null;
  }
  /** 复制区域（快照，不改源）。 */
  copy(sheet, range2) {
    this.payload = this.capture(sheet, range2, false);
  }
  /** 剪切区域（快照 + 标记 cut，源在粘贴时清空）。 */
  cut(sheet, range2) {
    this.payload = this.capture(sheet, range2, true);
  }
  capture(sheet, range2, isCut) {
    const cells = [];
    range2.forEachCell((row, col) => {
      cells.push({ dr: row - range2.row, dc: col - range2.col, data: sheet.getCellData(row, col) });
    });
    return {
      rowCount: range2.rowCount,
      colCount: range2.colCount,
      cells,
      isCut,
      source: new Range(range2.row, range2.col, range2.rowCount, range2.colCount)
    };
  }
  /**
   * 生成粘贴命令（可撤销）。以 targetRow/targetCol 为左上锚写入剪贴板内容。
   * 剪切模式下先清空源区。无内容返回 null。
   * @returns UndoableAction 及粘贴落区（供调用方更新选区）
   */
  createPasteCommand(sheet, targetRow, targetCol) {
    const p = this.payload;
    if (!p) return null;
    const pastedRange = new Range(targetRow, targetCol, p.rowCount, p.colCount);
    const affected = [pastedRange];
    if (p.isCut) affected.push(p.source);
    const before = this.snapshot(sheet, affected);
    const wasCut = p.isCut;
    const dRow = wasCut ? 0 : targetRow - p.source.row;
    const dCol = wasCut ? 0 : targetCol - p.source.col;
    const command = {
      name: "\u7C98\u8D34",
      execute: () => {
        if (wasCut) {
          p.source.forEachCell((row, col) => this.writeCell(sheet, row, col, null));
        }
        for (const c of p.cells) {
          this.writeCell(sheet, targetRow + c.dr, targetCol + c.dc, this.shiftFormula(c.data, dRow, dCol));
        }
      },
      undo: () => {
        this.restore(sheet, before);
      }
    };
    if (wasCut) this.payload = null;
    return { command, pastedRange };
  }
  /**
   * 生成选择性粘贴命令（M18，可撤销）。相较普通粘贴，支持：
   *  - content：粘贴内容（all/values/formulas/formats）——控制写值/公式/样式的取舍
   *  - operation：与目标现值做算术（none/add/subtract/multiply/divide）——仅作用于数值
   *  - transpose：行列转置（源 [dr,dc] → 目标 [dc,dr]，落区尺寸行列互换）
   *  - skipBlanks：源空格不覆盖目标
   * 选择性粘贴不清剪切源（Excel：Paste Special 不消费剪切），也不平移公式（保守，值/格式优先场景）。
   */
  createPasteSpecialCommand(sheet, targetRow, targetCol, options) {
    const p = this.payload;
    if (!p) return null;
    const content = options.content ?? "all";
    const operation = options.operation ?? "none";
    const transpose = options.transpose ?? false;
    const skipBlanks = options.skipBlanks ?? false;
    const outRows = transpose ? p.colCount : p.rowCount;
    const outCols = transpose ? p.rowCount : p.colCount;
    const pastedRange = new Range(targetRow, targetCol, outRows, outCols);
    const before = this.snapshot(sheet, [pastedRange]);
    const command = {
      name: "\u9009\u62E9\u6027\u7C98\u8D34",
      execute: () => {
        for (const c of p.cells) {
          const dr = transpose ? c.dc : c.dr;
          const dc = transpose ? c.dr : c.dc;
          const row = targetRow + dr;
          const col = targetCol + dc;
          if (skipBlanks && this.isBlankClip(c.data)) continue;
          this.writeCell(sheet, row, col, this.projectCell(sheet, row, col, c.data, content, operation));
        }
      },
      undo: () => {
        this.restore(sheet, before);
      }
    };
    return { command, pastedRange };
  }
  /** 剪贴格是否为空（无值无公式无样式）。 */
  isBlankClip(data) {
    if (!data) return true;
    return (data.value === null || data.value === void 0) && !data.formula;
  }
  /**
   * 按 content/operation 把一个剪贴格投影成要写入的 CellData。
   * content 决定保留哪些字段；operation 对数值做算术（与目标现值），非数值时退化为直接取源值。
   */
  projectCell(sheet, row, col, src, content, operation) {
    const target = sheet.getCellData(row, col);
    const keepValue = content === "all" || content === "values" || content === "formulas";
    const keepFormula = content === "all" || content === "formulas";
    const keepStyle = content === "all" || content === "formats";
    if (content === "formats") {
      return buildCell(target?.value ?? null, target?.formula, src?.style);
    }
    let value = keepValue ? src?.value ?? null : target?.value ?? null;
    let formula = keepFormula ? src?.formula : void 0;
    if (operation !== "none" && keepValue) {
      const a = typeof target?.value === "number" ? target.value : 0;
      const b = typeof src?.value === "number" ? src.value : NaN;
      if (Number.isFinite(b)) {
        value = this.applyOp(a, b, operation);
        formula = void 0;
      }
    }
    const style = keepStyle ? src?.style : target?.style;
    return buildCell(value, formula, style);
  }
  applyOp(a, b, op) {
    switch (op) {
      case "add":
        return a + b;
      case "subtract":
        return a - b;
      case "multiply":
        return a * b;
      case "divide":
        return b === 0 ? a : a / b;
      default:
        return b;
    }
  }
  /** 清空剪贴板。 */
  clear() {
    this.payload = null;
  }
  /**
   * 复制粘贴时按平移量重写单元格公式的相对引用（绝对分量不动）。
   * 无公式 / 零平移 → 原样返回，不额外分配。
   */
  shiftFormula(data, dRow, dCol) {
    if (!data || !data.formula || dRow === 0 && dCol === 0) return data;
    return { ...data, formula: translateFormula(data.formula, dRow, dCol) };
  }
  writeCell(sheet, row, col, data) {
    if (row < 0 || col < 0 || row >= sheet.getRowCount() || col >= sheet.getColumnCount()) return;
    if (data === null) {
      sheet.setFormula(row, col, null);
      sheet.setValue(row, col, null);
      sheet.setStyle(row, col, void 0);
      return;
    }
    sheet.setStyle(row, col, data.style);
    if (data.formula) {
      sheet.setFormula(row, col, data.formula);
    } else {
      sheet.setFormula(row, col, null);
      sheet.setValue(row, col, data.value ?? null);
    }
  }
  snapshot(sheet, ranges) {
    const seen = /* @__PURE__ */ new Set();
    const snaps = [];
    for (const r of ranges) {
      r.forEachCell((row, col) => {
        const key2 = `${row},${col}`;
        if (seen.has(key2)) return;
        seen.add(key2);
        if (row < sheet.getRowCount() && col < sheet.getColumnCount()) {
          snaps.push({ row, col, data: sheet.getCellData(row, col) });
        }
      });
    }
    return snaps;
  }
  restore(sheet, snaps) {
    for (const s of snaps) this.writeCell(sheet, s.row, s.col, s.data);
  }
};
function buildCell(value, formula, style) {
  const out = {};
  if (value !== void 0) out.value = value;
  if (formula !== void 0 && formula !== "") out.formula = formula;
  if (style !== void 0) out.style = style;
  return out;
}
function serializeTSV(sheet, range2) {
  const lines = [];
  for (let r = range2.row; r < range2.row + range2.rowCount; r++) {
    const cells = [];
    for (let c = range2.col; c < range2.col + range2.colCount; c++) {
      const v = sheet.getValue(r, c);
      cells.push(tsvCell(v));
    }
    lines.push(cells.join("	"));
  }
  return lines.join("\n");
}
function tsvCell(v) {
  if (v === null || v === void 0) return "";
  const s = typeof v === "boolean" ? v ? "TRUE" : "FALSE" : String(v);
  if (/[\t\n"]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}
function serializeHTML(sheet, range2) {
  const rows = [];
  for (let r = range2.row; r < range2.row + range2.rowCount; r++) {
    const cells = [];
    for (let c = range2.col; c < range2.col + range2.colCount; c++) {
      const span = sheet.getSpan(r, c);
      if (span && (span.row !== r || span.col !== c)) continue;
      const style = sheet.getResolvedStyle(r, c);
      const v = sheet.getValue(r, c);
      const attrs = [];
      if (span && span.rowCount > 1) attrs.push(`rowspan="${span.rowCount}"`);
      if (span && span.colCount > 1) attrs.push(`colspan="${span.colCount}"`);
      const css = [];
      if (style.bold) css.push("font-weight:bold");
      if (style.italic) css.push("font-style:italic");
      if (style.underline) css.push("text-decoration:underline");
      if (style.hAlign) css.push(`text-align:${style.hAlign}`);
      if (style.foreColor) css.push(`color:${style.foreColor}`);
      if (style.backColor) css.push(`background-color:${style.backColor}`);
      const styleAttr = css.length ? ` style="${css.join(";")}"` : "";
      const attrStr = attrs.length ? " " + attrs.join(" ") : "";
      cells.push(`<td${attrStr}${styleAttr}>${escapeHTML(tsvCell(v))}</td>`);
    }
    rows.push(`<tr>${cells.join("")}</tr>`);
  }
  return `<table><tbody>${rows.join("")}</tbody></table>`;
}
function escapeHTML(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function parseTSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === "	") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (ch === "\r") {
      i++;
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
function parseClipboardHTML(html) {
  const tableMatch = /<table[\s\S]*?<\/table>/i.exec(html);
  const src = tableMatch ? tableMatch[0] : html;
  const rows = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let tr;
  while ((tr = trRe.exec(src)) !== null) {
    const cells = [];
    const tdRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let td;
    while ((td = tdRe.exec(tr[1])) !== null) {
      cells.push(stripTags(td[1]));
    }
    if (cells.length) rows.push(cells);
  }
  return rows;
}
function stripTags(s) {
  return s.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/gi, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").trim();
}

// src/core/FillEngine.ts
var WEEKDAYS_EN = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
var WEEKDAYS_EN_ABBR = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
var MONTHS_EN = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
var MONTHS_EN_ABBR = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
var WEEKDAYS_CN = ["\u661F\u671F\u65E5", "\u661F\u671F\u4E00", "\u661F\u671F\u4E8C", "\u661F\u671F\u4E09", "\u661F\u671F\u56DB", "\u661F\u671F\u4E94", "\u661F\u671F\u516D"];
var WEEKDAYS_CN2 = ["\u5468\u65E5", "\u5468\u4E00", "\u5468\u4E8C", "\u5468\u4E09", "\u5468\u56DB", "\u5468\u4E94", "\u5468\u516D"];
function inferFill(source, count, axis, copyOnly = false) {
  if (source.length === 0 || count <= 0) return [];
  const out = [];
  if (source.some((s) => s.formula)) {
    for (let i = 0; i < count; i++) {
      const src = source[i % source.length];
      const seqPos = source.length + i;
      const srcPos = i % source.length;
      const delta = seqPos - srcPos;
      out.push(shiftFormulaData(src, axis, delta));
    }
    return out;
  }
  if (!copyOnly && source.every((s) => typeof s.value === "number")) {
    const nums2 = source.map((s) => s.value);
    const stepDelta = nums2.length >= 2 ? nums2[nums2.length - 1] - nums2[nums2.length - 2] : 1;
    let last = nums2[nums2.length - 1];
    for (let i = 0; i < count; i++) {
      last += stepDelta;
      out.push(mkCell(last, source[source.length - 1]));
    }
    return out;
  }
  if (!copyOnly && source.length >= 1) {
    const seq = trySequence(source);
    if (seq) {
      for (let i = 0; i < count; i++) out.push(mkCell(seq(i + 1), source[source.length - 1]));
      return out;
    }
  }
  for (let i = 0; i < count; i++) {
    const src = source[i % source.length];
    out.push(mkCell(src.value, src));
  }
  return out;
}
function mkCell(value, styleSrc) {
  const style = styleSrc.style;
  const d = {};
  if (value !== void 0) d.value = value;
  if (style) d.style = { ...style };
  return d;
}
function trySequence(source) {
  const lastVal = source[source.length - 1]?.value;
  if (typeof lastVal !== "string") return null;
  const last = lastVal.trim();
  const cyc = matchCyclic(last);
  if (cyc) return (step) => formatCyclic(cyc, step);
  const m = /^(.*?)(\d+)$/.exec(last);
  if (m) {
    const prefix = m[1];
    const start = Number(m[2]);
    const width = m[2].length;
    let stepDelta = 1;
    const prev = source[source.length - 2]?.value;
    if (typeof prev === "string") {
      const pm = /^(.*?)(\d+)$/.exec(prev.trim());
      if (pm && pm[1] === prefix) stepDelta = start - Number(pm[2]);
    }
    return (step) => prefix + String(start + stepDelta * step).padStart(width, "0");
  }
  return null;
}
function matchCyclic(s) {
  const lower = s.toLowerCase();
  const tables = [
    { list: WEEKDAYS_EN, display: WEEKDAYS_EN },
    { list: WEEKDAYS_EN_ABBR, display: WEEKDAYS_EN_ABBR },
    { list: MONTHS_EN, display: MONTHS_EN },
    { list: MONTHS_EN_ABBR, display: MONTHS_EN_ABBR }
  ];
  for (const t of tables) {
    const idx = t.list.indexOf(lower);
    if (idx >= 0) return { list: t.list, index: idx, original: s };
  }
  for (const list of [WEEKDAYS_CN, WEEKDAYS_CN2]) {
    const idx = list.indexOf(s);
    if (idx >= 0) return { list, index: idx, original: s };
  }
  return null;
}
function formatCyclic(cyc, step) {
  const len = cyc.list.length;
  const idx = ((cyc.index + step) % len + len) % len;
  const base = cyc.list[idx];
  if (/^[a-z]+$/i.test(cyc.original)) {
    if (cyc.original === cyc.original.toUpperCase()) return base.toUpperCase();
    if (cyc.original[0] === cyc.original[0].toUpperCase()) return base.charAt(0).toUpperCase() + base.slice(1);
    return base;
  }
  return base;
}
function shiftFormulaData(src, axis, delta) {
  if (!src.formula) return mkCell(src.value, src);
  const dRow = axis === "down" ? delta : axis === "up" ? -delta : 0;
  const dCol = axis === "right" ? delta : axis === "left" ? -delta : 0;
  const d = { formula: translateFormula(src.formula, dRow, dCol) };
  if (src.style) d.style = { ...src.style };
  return d;
}

// src/core/find.ts
function findAll(sheet, query, opts = {}) {
  const hits = [];
  if (query === "") return hits;
  const matcher = buildMatcher(query, opts);
  const inRange = (r, c) => {
    if (!opts.range) return true;
    const g = opts.range;
    return r >= g.row && r < g.row + g.rowCount && c >= g.col && c < g.col + g.colCount;
  };
  sheet.forEachCell((_data, row, col) => {
    if (!inRange(row, col)) return;
    const cellText2 = opts.searchFormula ? sheet.getFormula(row, col) || "" : cellDisplay(sheet.getValue(row, col));
    if (cellText2 === "") return;
    if (matcher(cellText2)) hits.push({ row, col, text: cellText2 });
  });
  hits.sort((a, b) => a.row - b.row || a.col - b.col);
  return hits;
}
function buildMatcher(query, opts) {
  if (opts.useRegex) {
    let re;
    try {
      re = new RegExp(query, opts.matchCase ? "" : "i");
    } catch {
      return literalMatcher(query, opts);
    }
    if (opts.wholeCell) {
      const anchored = new RegExp("^(?:" + query + ")$", opts.matchCase ? "" : "i");
      return (t) => anchored.test(t);
    }
    return (t) => re.test(t);
  }
  return literalMatcher(query, opts);
}
function literalMatcher(query, opts) {
  const q = opts.matchCase ? query : query.toLowerCase();
  return (text) => {
    const t = opts.matchCase ? text : text.toLowerCase();
    return opts.wholeCell ? t === q : t.includes(q);
  };
}
function cellDisplay(v) {
  if (v === null || v === void 0) return "";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  return String(v);
}

// src/core/validation.ts
function validateValue(rule, raw, customEval) {
  const allowBlank = rule.allowBlank !== false;
  if (raw === "" || raw == null) {
    return allowBlank ? { ok: true } : fail(rule, "\u4E0D\u5141\u8BB8\u7A7A\u503C");
  }
  switch (rule.type) {
    case "list": {
      const list = rule.list ?? [];
      return list.includes(raw) ? { ok: true } : fail(rule, `\u987B\u4E3A\u5217\u8868\u503C\u4E4B\u4E00\uFF1A${list.join("\u3001")}`);
    }
    case "whole": {
      const n = Number(raw);
      if (!Number.isFinite(n) || !Number.isInteger(n)) return fail(rule, "\u987B\u4E3A\u6574\u6570");
      return compareBound(n, rule.operator, num(rule.formula1), num(rule.formula2)) ? { ok: true } : fail(rule, "\u6574\u6570\u8D85\u51FA\u5141\u8BB8\u8303\u56F4");
    }
    case "decimal": {
      const n = Number(raw);
      if (!Number.isFinite(n)) return fail(rule, "\u987B\u4E3A\u6570\u5B57");
      return compareBound(n, rule.operator, num(rule.formula1), num(rule.formula2)) ? { ok: true } : fail(rule, "\u6570\u5B57\u8D85\u51FA\u5141\u8BB8\u8303\u56F4");
    }
    case "date": {
      const n = Number(raw);
      if (!Number.isFinite(n)) return fail(rule, "\u987B\u4E3A\u6709\u6548\u65E5\u671F");
      return compareBound(n, rule.operator, num(rule.formula1), num(rule.formula2)) ? { ok: true } : fail(rule, "\u65E5\u671F\u8D85\u51FA\u5141\u8BB8\u8303\u56F4");
    }
    case "textLength": {
      const len = raw.length;
      return compareBound(len, rule.operator, num(rule.formula1), num(rule.formula2)) ? { ok: true } : fail(rule, "\u6587\u672C\u957F\u5EA6\u8D85\u51FA\u5141\u8BB8\u8303\u56F4");
    }
    case "custom": {
      if (!customEval || typeof rule.formula1 !== "string") return { ok: true };
      return customEval(rule.formula1) ? { ok: true } : fail(rule, "\u81EA\u5B9A\u4E49\u9A8C\u8BC1\u672A\u901A\u8FC7");
    }
    default:
      return { ok: true };
  }
}
function compareBound(v, op, f1, f2) {
  switch (op) {
    case "between":
      return v >= Math.min(f1, f2) && v <= Math.max(f1, f2);
    case "notBetween":
      return v < Math.min(f1, f2) || v > Math.max(f1, f2);
    case "eq":
      return v === f1;
    case "ne":
      return v !== f1;
    case "gt":
      return v > f1;
    case "lt":
      return v < f1;
    case "ge":
      return v >= f1;
    case "le":
      return v <= f1;
    default:
      return true;
  }
}
function num(v) {
  return typeof v === "number" ? v : Number(v);
}
function fail(rule, def) {
  return { ok: false, message: rule.error || def };
}

// src/render/AxisMetrics.ts
var AxisMetrics = class {
  sizes;
  hidden;
  count;
  /** 累计像素前缀和：offsets[i] = 索引 0..i-1 的像素总和；长度 count+1。惰性构建。 */
  offsets = null;
  /**
   * @param count 轴上的元素数（行数或列数）
   * @param sizeOf 取第 i 个元素的默认/自定义尺寸（px）。隐藏与否由 hiddenOf 决定，此处返回其"可见时"尺寸。
   * @param hiddenOf 第 i 个元素是否隐藏（隐藏则占 0 像素）
   */
  constructor(count, sizeOf, hiddenOf) {
    this.count = Math.max(0, Math.floor(count));
    this.sizes = sizeOf;
    this.hidden = hiddenOf ?? (() => false);
  }
  /** 元素总数。 */
  get length() {
    return this.count;
  }
  /** 第 index 个元素的实际占用像素（隐藏为 0）。 */
  sizeAt(index) {
    if (index < 0 || index >= this.count) return 0;
    if (this.hidden(index)) return 0;
    const s = this.sizes(index);
    return Number.isFinite(s) && s > 0 ? s : 0;
  }
  /** 起始像素坐标（该元素上/左沿）。index==count 返回全轴总长。 */
  startOf(index) {
    this.ensureOffsets();
    const i = Math.min(Math.max(0, index), this.count);
    return this.offsets[i];
  }
  /** 结束像素坐标（该元素下/右沿，= startOf(index)+sizeAt(index)）。 */
  endOf(index) {
    return this.startOf(index) + this.sizeAt(index);
  }
  /** 全轴像素总长。 */
  totalSize() {
    return this.startOf(this.count);
  }
  /**
   * 像素坐标 → 命中的元素索引（二分）。
   * 落在某元素 [start, end) 内返回该索引；坐标 < 0 返回 0；
   * 坐标 ≥ 总长返回 count-1（最后一个元素）；空轴返回 -1。
   * 隐藏元素占 0 像素，二分时天然跳过。
   */
  indexAt(pixel) {
    if (this.count === 0) return -1;
    this.ensureOffsets();
    const offs = this.offsets;
    const total = offs[this.count];
    if (pixel < 0) return 0;
    if (pixel >= total) return this.count - 1;
    let lo = 0;
    let hi = this.count;
    while (lo < hi) {
      const mid = lo + hi >> 1;
      if (offs[mid] <= pixel) lo = mid + 1;
      else hi = mid;
    }
    let idx = lo - 1;
    while (idx > 0 && this.sizeAt(idx) === 0) idx--;
    return Math.max(0, Math.min(this.count - 1, idx));
  }
  /**
   * 构建前缀和（隐藏元素计 0）。任何影响尺寸/隐藏/数量的变化后须 invalidate 重建。
   */
  ensureOffsets() {
    if (this.offsets) return;
    const offs = new Array(this.count + 1);
    offs[0] = 0;
    for (let i = 0; i < this.count; i++) {
      offs[i + 1] = offs[i] + this.sizeAt(i);
    }
    this.offsets = offs;
  }
  /** 尺寸/隐藏/行列数变化后调用，令前缀和下次惰性重建。 */
  invalidate() {
    this.offsets = null;
  }
  /** 更新元素数量（增删行列后）。 */
  setCount(count) {
    this.count = Math.max(0, Math.floor(count));
    this.invalidate();
  }
  /**
   * 返回一段像素窗口 [startPx, endPx) 覆盖的索引区间 [first, last]（闭区间，含）。
   * 供视口可见范围计算。窗口右端半开：起始坐标恰等于 endPx 的元素不算可见。
   * 空轴返回 null。
   */
  rangeInWindow(startPx, endPx) {
    if (this.count === 0) return null;
    const first = this.indexAt(Math.max(0, startPx));
    const last = this.lastIndexStartingBefore(Math.max(0, endPx), first);
    return { first, last: Math.max(first, last) };
  }
  /**
   * 最大的索引 i 使 startOf(i) < pixel（严格小于）。用于半开视口窗口的尾端。
   * 无满足者返回 lowerBound。
   */
  lastIndexStartingBefore(pixel, lowerBound) {
    this.ensureOffsets();
    const offs = this.offsets;
    let lo = 0;
    let hi = this.count;
    while (lo < hi) {
      const mid = lo + hi >> 1;
      if (offs[mid] < pixel) lo = mid + 1;
      else hi = mid;
    }
    return Math.max(lowerBound, Math.min(this.count - 1, lo - 1));
  }
};

// src/render/Viewport.ts
var DEFAULT_ROW_HEADER_WIDTH = 46;
var DEFAULT_COL_HEADER_HEIGHT = 20;
var Viewport = class {
  scrollLeft = 0;
  scrollTop = 0;
  width = 0;
  height = 0;
  _zoom = 1;
  rowHeaderWidth = DEFAULT_ROW_HEADER_WIDTH;
  colHeaderHeight = DEFAULT_COL_HEADER_HEIGHT;
  /** 行大纲带宽（在行头左侧）。列大纲带高（在列头上方）。 */
  rowOutlineWidth = 0;
  colOutlineHeight = 0;
  /** 冻结行/列数（M9；0=无冻结）。 */
  frozenRowCount = 0;
  frozenColCount = 0;
  /** M19 尾冻结行/列数（钉视口末端；0=无）。 */
  trailingRowCount = 0;
  trailingColCount = 0;
  /** M19-step2 行/列拆分模式（冻结线是否为可拖拆分条）。 */
  splitRow = false;
  splitCol = false;
  /** 滚动条占位：竖条在右吃掉的宽、横条在底吃掉的高（0=该条不显示）。由几何层解析后回写。 */
  scrollbarGutterRight = 0;
  scrollbarGutterBottom = 0;
  /** 结构版本：行高/列宽/行列数变化时由外部 bump()，纳入签名。 */
  structureVersion = 0;
  constructor(init) {
    if (init) this.set(init);
  }
  get zoom() {
    return this._zoom;
  }
  set zoom(factor) {
    const f2 = Number.isFinite(factor) ? factor : 1;
    this._zoom = Math.min(4, Math.max(0.1, f2));
  }
  set(partial) {
    if (partial.scrollLeft !== void 0) this.scrollLeft = Math.max(0, partial.scrollLeft);
    if (partial.scrollTop !== void 0) this.scrollTop = Math.max(0, partial.scrollTop);
    if (partial.width !== void 0) this.width = Math.max(0, partial.width);
    if (partial.height !== void 0) this.height = Math.max(0, partial.height);
    if (partial.zoom !== void 0) this.zoom = partial.zoom;
    if (partial.rowHeaderWidth !== void 0) this.rowHeaderWidth = Math.max(0, partial.rowHeaderWidth);
    if (partial.colHeaderHeight !== void 0) this.colHeaderHeight = Math.max(0, partial.colHeaderHeight);
    if (partial.rowOutlineWidth !== void 0) this.rowOutlineWidth = Math.max(0, partial.rowOutlineWidth);
    if (partial.colOutlineHeight !== void 0) this.colOutlineHeight = Math.max(0, partial.colOutlineHeight);
    if (partial.frozenRowCount !== void 0) this.frozenRowCount = Math.max(0, Math.floor(partial.frozenRowCount));
    if (partial.frozenColCount !== void 0) this.frozenColCount = Math.max(0, Math.floor(partial.frozenColCount));
    if (partial.trailingRowCount !== void 0) this.trailingRowCount = Math.max(0, Math.floor(partial.trailingRowCount));
    if (partial.trailingColCount !== void 0) this.trailingColCount = Math.max(0, Math.floor(partial.trailingColCount));
    if (partial.splitRow !== void 0) this.splitRow = partial.splitRow;
    if (partial.splitCol !== void 0) this.splitCol = partial.splitCol;
  }
  /** 内容区左偏移 = 行大纲带 + 行头（内容区从这里开始）。 */
  get leftOffset() {
    return this.rowOutlineWidth + this.rowHeaderWidth;
  }
  /** 内容区上偏移 = 列大纲带 + 列头。 */
  get topOffset() {
    return this.colOutlineHeight + this.colHeaderHeight;
  }
  /** 结构变化后递增版本（影响签名，触发叠层刷新）。 */
  bumpStructure() {
    this.structureVersion++;
  }
  /** 可见区域宽度（扣除行大纲带 + 行头 + 竖滚动条占位，未缩放像素）。 */
  get contentWidth() {
    return Math.max(0, this.width - this.leftOffset - this.scrollbarGutterRight);
  }
  /** 可见区域高度（扣除列大纲带 + 列头 + 横滚动条占位，未缩放像素）。 */
  get contentHeight() {
    return Math.max(0, this.height - this.topOffset - this.scrollbarGutterBottom);
  }
  /**
   * 视口签名字符串：一切影响单元格屏幕位置的量的组合。
   * 变化即需重定位徽标叠层。数值取整避免亚像素抖动刷屏。
   */
  signature() {
    return [
      Math.round(this.scrollLeft),
      Math.round(this.scrollTop),
      Math.round(this.width),
      Math.round(this.height),
      this._zoom.toFixed(3),
      this.rowHeaderWidth,
      this.colHeaderHeight,
      this.rowOutlineWidth,
      this.colOutlineHeight,
      this.frozenRowCount,
      this.frozenColCount,
      this.trailingRowCount,
      this.trailingColCount,
      this.splitRow ? 1 : 0,
      this.splitCol ? 1 : 0,
      this.scrollbarGutterRight,
      this.scrollbarGutterBottom,
      this.structureVersion
    ].join("|");
  }
  toState() {
    return {
      scrollLeft: this.scrollLeft,
      scrollTop: this.scrollTop,
      width: this.width,
      height: this.height,
      zoom: this._zoom,
      rowHeaderWidth: this.rowHeaderWidth,
      colHeaderHeight: this.colHeaderHeight,
      rowOutlineWidth: this.rowOutlineWidth,
      colOutlineHeight: this.colOutlineHeight,
      frozenRowCount: this.frozenRowCount,
      frozenColCount: this.frozenColCount,
      trailingRowCount: this.trailingRowCount,
      trailingColCount: this.trailingColCount,
      splitRow: this.splitRow,
      splitCol: this.splitCol
    };
  }
};

// src/render/OutlineLayout.ts
var OUTLINE_LEVEL_STEP = 16;
var OUTLINE_PAD = 4;
var OUTLINE_BTN = 11;
var LEVEL_BTN_STEP = OUTLINE_BTN + 2;
var LEVEL_BTN_ORIGIN = 2;
function outlinePaneThickness(maxLevel, reserveCorner = false) {
  if (maxLevel < 0) return 0;
  const skip = reserveCorner ? 1 : 0;
  const slotsNeed = (maxLevel + 1) * OUTLINE_LEVEL_STEP + OUTLINE_PAD;
  const levelCount = maxLevel + 2 + skip;
  const levelsNeed = LEVEL_BTN_ORIGIN + levelCount * LEVEL_BTN_STEP + 2;
  return Math.max(slotsNeed, levelsNeed);
}
function levelSlotCenter(level) {
  return level * OUTLINE_LEVEL_STEP + OUTLINE_LEVEL_STEP / 2;
}
function rowOutlineButtons(groups, summaryBelow, rowScreenCenter, paneLeft = 0) {
  const out = [];
  groups.forEach((g, groupIndex) => {
    const summaryRow = summaryBelow ? g.start + g.count - 1 : g.start;
    const cy = rowScreenCenter(summaryRow);
    const cx = paneLeft + levelSlotCenter(g.level);
    out.push({
      x: cx - OUTLINE_BTN / 2,
      y: cy - OUTLINE_BTN / 2,
      w: OUTLINE_BTN,
      h: OUTLINE_BTN,
      groupIndex,
      collapsed: g.collapsed
    });
  });
  return out;
}
function colOutlineButtons(groups, summaryRight, colScreenCenter, paneTop = 0) {
  const out = [];
  groups.forEach((g, groupIndex) => {
    const summaryCol = summaryRight ? g.start + g.count - 1 : g.start;
    const cx = colScreenCenter(summaryCol);
    const cy = paneTop + levelSlotCenter(g.level);
    out.push({
      x: cx - OUTLINE_BTN / 2,
      y: cy - OUTLINE_BTN / 2,
      w: OUTLINE_BTN,
      h: OUTLINE_BTN,
      groupIndex,
      collapsed: g.collapsed
    });
  });
  return out;
}
function levelButtons(maxLevel, reserveCorner = false, originX = 0, originY = 0) {
  if (maxLevel < 0) return [];
  const count = maxLevel + 2;
  const out = [];
  const size = OUTLINE_BTN;
  const skip = reserveCorner ? 1 : 0;
  for (let i = 0; i < count; i++) {
    out.push({
      x: originX + LEVEL_BTN_ORIGIN + (i + skip) * LEVEL_BTN_STEP,
      y: originY + LEVEL_BTN_ORIGIN,
      w: size,
      h: size,
      level: i + 1
    });
  }
  return out;
}
function colLevelButtons(maxLevel, reserveCorner = false, originX = 0, originY = 0) {
  if (maxLevel < 0) return [];
  const count = maxLevel + 2;
  const out = [];
  const size = OUTLINE_BTN;
  const skip = reserveCorner ? 1 : 0;
  for (let i = 0; i < count; i++) {
    out.push({
      x: originX + LEVEL_BTN_ORIGIN,
      y: originY + LEVEL_BTN_ORIGIN + (i + skip) * LEVEL_BTN_STEP,
      w: size,
      h: size,
      level: i + 1
    });
  }
  return out;
}
function pointInRect(x, y, r) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}
function filterArrowBox(cellRect, colOutlineHeight, colHeaderHeight) {
  const w = Math.min(14, Math.max(10, cellRect.width * 0.4));
  const h = Math.min(14, colHeaderHeight - 2);
  const x = cellRect.x + cellRect.width - w - 1;
  const y = colOutlineHeight + (colHeaderHeight - h) / 2;
  return { x, y, w, h };
}
function checkboxBox(rect) {
  const size = Math.min(14, Math.max(10, Math.min(rect.width, rect.height) - 6));
  const x = rect.x + (rect.width - size) / 2;
  const y = rect.y + (rect.height - size) / 2;
  return { x, y, size };
}
function cellDropdownBox(rect) {
  const w = Math.min(16, Math.max(12, rect.width * 0.25));
  return { x: rect.x + rect.width - w, y: rect.y, w, h: rect.height };
}

// src/render/ScrollbarLayout.ts
var SCROLLBAR_SIZE = 12;
var SCROLLBAR_MIN_THUMB = 20;
var EMPTY_RECT = {
  visible: false,
  track: { x: 0, y: 0, width: 0, height: 0 },
  thumb: { x: 0, y: 0, width: 0, height: 0 }
};
function resolveScrollbars(m) {
  const sb = SCROLLBAR_SIZE;
  const viewportW0 = Math.max(0, m.viewWidth - m.leftOffset);
  const viewportH0 = Math.max(0, m.viewHeight - m.topOffset);
  const contentW = m.contentWidth;
  const contentH = m.contentHeight;
  let needV = contentH > viewportH0 + 0.5;
  let needH = contentW > viewportW0 + 0.5;
  const viewportWAfterV = viewportW0 - (needV ? sb : 0);
  const viewportHAfterH = viewportH0 - (needH ? sb : 0);
  if (!needH && contentW > viewportWAfterV + 0.5) needH = true;
  if (!needV && contentH > viewportHAfterH + 0.5) needV = true;
  const gutterRight = needV ? sb : 0;
  const gutterBottom = needH ? sb : 0;
  const vTrackY = m.topOffset;
  const vTrackH = Math.max(0, m.viewHeight - m.topOffset - gutterBottom);
  const hTrackX = m.leftOffset;
  const hTrackW = Math.max(0, m.viewWidth - m.leftOffset - gutterRight);
  const vertical = needV ? buildThumb("v", {
    trackX: m.viewWidth - sb,
    trackY: vTrackY,
    trackW: sb,
    trackH: vTrackH,
    content: contentH,
    viewport: vTrackH,
    scroll: m.scrollTop * m.zoom
  }) : EMPTY_RECT;
  const horizontal = needH ? buildThumb("h", {
    trackX: hTrackX,
    trackY: m.viewHeight - sb,
    trackW: hTrackW,
    trackH: sb,
    content: contentW,
    viewport: hTrackW,
    scroll: m.scrollLeft * m.zoom
  }) : EMPTY_RECT;
  return { vertical, horizontal, gutterRight, gutterBottom };
}
function buildThumb(axis, t) {
  const track = { x: t.trackX, y: t.trackY, width: t.trackW, height: t.trackH };
  const trackLen = axis === "v" ? t.trackH : t.trackW;
  if (trackLen <= 0 || t.content <= 0) {
    return { visible: true, track, thumb: { ...track } };
  }
  const ratio = Math.min(1, t.viewport / t.content);
  const thumbLen = Math.max(SCROLLBAR_MIN_THUMB, Math.round(trackLen * ratio));
  const maxScrollScreen = Math.max(0, t.content - t.viewport);
  const maxThumbTravel = Math.max(0, trackLen - thumbLen);
  const pos = maxScrollScreen > 0 ? Math.round(t.scroll / maxScrollScreen * maxThumbTravel) : 0;
  const clamped = Math.min(maxThumbTravel, Math.max(0, pos));
  const thumb = axis === "v" ? { x: t.trackX, y: t.trackY + clamped, width: t.trackW, height: thumbLen } : { x: t.trackX + clamped, y: t.trackY, width: thumbLen, height: t.trackH };
  return { visible: true, track, thumb };
}
function thumbPosToScroll(thumbPos, trackLen, thumbLen, content, viewport, zoom) {
  const maxThumbTravel = Math.max(0, trackLen - thumbLen);
  const maxScrollScreen = Math.max(0, content - viewport);
  if (maxThumbTravel <= 0) return 0;
  const frac = Math.min(1, Math.max(0, thumbPos / maxThumbTravel));
  return frac * maxScrollScreen / (zoom || 1);
}

// src/render/PaneLayout.ts
function frozenBandSize(p) {
  if (p.frozenCount <= 0) return 0;
  const f2 = Math.min(p.frozenCount, p.count);
  return p.startOf(f2) * p.zoom;
}
function freezeLineScreen(p) {
  return p.offset + frozenBandSize(p);
}
function trailN(p) {
  const t = p.trailingCount ?? 0;
  if (t <= 0) return 0;
  const room = p.count - Math.min(p.frozenCount, p.count);
  return Math.min(t, Math.max(0, room));
}
function trailStartIndex(p) {
  return p.count - trailN(p);
}
function trailingBandSize(p) {
  const t = trailN(p);
  if (t <= 0) return 0;
  return (p.startOf(p.count) - p.startOf(p.count - t)) * p.zoom;
}
function trailingLineScreen(p) {
  const band = trailingBandSize(p);
  if (band <= 0) return Number.POSITIVE_INFINITY;
  const view = p.viewSize ?? 0;
  return p.offset + view - band;
}
function isFrozen(index, frozenCount) {
  return frozenCount > 0 && index < frozenCount;
}
function indexStartToScreen(index, p) {
  const content = p.startOf(index);
  if (isFrozen(index, p.frozenCount)) {
    return p.offset + content * p.zoom;
  }
  if (trailN(p) > 0 && index >= trailStartIndex(p)) {
    const trailContent = p.startOf(trailStartIndex(p));
    return trailingLineScreen(p) + (content - trailContent) * p.zoom;
  }
  const frozenContent = p.frozenCount > 0 ? p.startOf(Math.min(p.frozenCount, p.count)) : 0;
  const line = freezeLineScreen(p);
  return line + (content - frozenContent - p.scroll) * p.zoom;
}
function screenToIndex(screen, p, indexAt) {
  const line = freezeLineScreen(p);
  const hasFrozen = p.frozenCount > 0 && frozenBandSize(p) > 0;
  const t = trailN(p);
  if (t > 0) {
    const trailLine = trailingLineScreen(p);
    if (screen >= trailLine) {
      const trailStartContent = p.startOf(trailStartIndex(p));
      const content2 = trailStartContent + (screen - trailLine) / p.zoom;
      const idx2 = clampIndex(indexAt(Math.max(0, content2)), p);
      return { index: Math.max(trailStartIndex(p), idx2), frozen: true };
    }
  }
  if (hasFrozen && screen < line) {
    const content2 = (screen - p.offset) / p.zoom;
    const idx2 = clampIndex(indexAt(Math.max(0, content2)), p);
    return { index: Math.min(idx2, Math.max(0, p.frozenCount - 1)), frozen: true };
  }
  const frozenContent = p.frozenCount > 0 ? p.startOf(Math.min(p.frozenCount, p.count)) : 0;
  const content = frozenContent + p.scroll + (screen - line) / p.zoom;
  const idx = clampIndex(indexAt(Math.max(0, content)), p);
  const scrollMax = t > 0 ? trailStartIndex(p) - 1 : p.count - 1;
  return { index: Math.max(p.frozenCount, Math.min(idx, Math.max(p.frozenCount, scrollMax))), frozen: false };
}
function clampIndex(idx, p) {
  if (p.count === 0) return 0;
  return Math.max(0, Math.min(p.count - 1, idx));
}
function scrollBandVisibleRange(p, viewSizeContent, rangeInWindow) {
  const frozenContent = p.frozenCount > 0 ? p.startOf(Math.min(p.frozenCount, p.count)) : 0;
  const t = trailN(p);
  const trailContentLen = t > 0 ? p.startOf(p.count) - p.startOf(p.count - t) : 0;
  const avail = Math.max(0, viewSizeContent - frozenContent - trailContentLen);
  const scrollUpper = p.count - t;
  if (avail <= 0 || p.frozenCount >= scrollUpper) return null;
  const start = frozenContent + p.scroll;
  const end = start + avail;
  const r = rangeInWindow(start, end);
  if (!r) return null;
  return {
    first: Math.max(p.frozenCount, r.first),
    last: Math.min(scrollUpper - 1, Math.max(p.frozenCount, r.last))
  };
}
function trailingBandRange(p) {
  const t = trailN(p);
  if (t <= 0) return null;
  return { first: trailStartIndex(p), last: p.count - 1 };
}

// src/render/SheetGeometry.ts
function maxLevelOf(groups) {
  let m = -1;
  for (const g of groups) if (g.level > m) m = g.level;
  return m;
}
var SheetGeometry = class {
  constructor(rows, cols, viewport) {
    this.rows = rows;
    this.cols = cols;
    this.viewport = viewport;
  }
  // ── 分带参数（PaneLayout，M9）────────────────────────
  /** 列轴分带参数（横轴：offset=leftOffset，冻结=frozenColCount，尾冻结=trailingColCount）。 */
  colPane() {
    const vp = this.viewport;
    const frozen = Math.min(vp.frozenColCount, this.cols.length);
    return {
      offset: vp.leftOffset,
      zoom: vp.zoom,
      scroll: vp.scrollLeft,
      frozenCount: frozen,
      count: this.cols.length,
      startOf: (i) => this.cols.startOf(i),
      sizeAt: (i) => this.cols.sizeAt(i),
      trailingCount: Math.min(vp.trailingColCount, Math.max(0, this.cols.length - frozen)),
      viewSize: vp.contentWidth
      // 尾冻结带钉在内容区右沿（offset + contentWidth）
    };
  }
  /** 行轴分带参数（纵轴：offset=topOffset，冻结=frozenRowCount，尾冻结=trailingRowCount）。 */
  rowPane() {
    const vp = this.viewport;
    const frozen = Math.min(vp.frozenRowCount, this.rows.length);
    return {
      offset: vp.topOffset,
      zoom: vp.zoom,
      scroll: vp.scrollTop,
      frozenCount: frozen,
      count: this.rows.length,
      startOf: (i) => this.rows.startOf(i),
      sizeAt: (i) => this.rows.sizeAt(i),
      trailingCount: Math.min(vp.trailingRowCount, Math.max(0, this.rows.length - frozen)),
      viewSize: vp.contentHeight
      // 尾冻结带钉在内容区下沿（offset + contentHeight）
    };
  }
  /** 冻结线屏幕坐标（列=竖线 x，行=横线 y）；无冻结返回 offset。供渲染分割线/交互。 */
  freezeLineX() {
    return freezeLineScreen(this.colPane());
  }
  freezeLineY() {
    return freezeLineScreen(this.rowPane());
  }
  hasFrozenCols() {
    return frozenBandSize(this.colPane()) > 0;
  }
  hasFrozenRows() {
    return frozenBandSize(this.rowPane()) > 0;
  }
  // ── M19 尾冻结访问器 ────────────────────────────────────
  /** 尾冻结带左沿屏幕 x（钉在内容区右侧）；无尾冻结返回 +∞。 */
  trailingLineX() {
    return trailingLineScreen(this.colPane());
  }
  /** 尾冻结带上沿屏幕 y（钉在内容区底部）；无尾冻结返回 +∞。 */
  trailingLineY() {
    return trailingLineScreen(this.rowPane());
  }
  hasTrailingCols() {
    return trailingBandSize(this.colPane()) > 0;
  }
  hasTrailingRows() {
    return trailingBandSize(this.rowPane()) > 0;
  }
  /** 尾冻结列数（钳到有效值）。 */
  trailingCols() {
    return this.colPane().trailingCount ?? 0;
  }
  /** 尾冻结行数（钳到有效值）。 */
  trailingRows() {
    return this.rowPane().trailingCount ?? 0;
  }
  /** 尾冻结列可见区间 [count-trail, count)；无返回 null。 */
  trailingColRange() {
    return trailingBandRange(this.colPane());
  }
  /** 尾冻结行可见区间；无返回 null。 */
  trailingRowRange() {
    return trailingBandRange(this.rowPane());
  }
  // ── M19-step2 拆分条（可拖冻结）─────────────────────────
  /** 命中竖拆分条（列冻结线 ±tol，且 y 在内容区）。仅 splitCol 模式有效。 */
  hitColumnSplit(screenX, screenY, tolerance = 4) {
    const vp = this.viewport;
    if (!vp.splitCol) return false;
    if (screenY < vp.topOffset) return false;
    return Math.abs(screenX - this.freezeLineX()) <= tolerance;
  }
  /** 命中横拆分条（行冻结线 ±tol，且 x 在内容区）。仅 splitRow 模式有效。 */
  hitRowSplit(screenX, screenY, tolerance = 4) {
    const vp = this.viewport;
    if (!vp.splitRow) return false;
    if (screenX < vp.leftOffset) return false;
    return Math.abs(screenY - this.freezeLineY()) <= tolerance;
  }
  /** 拖拽竖拆分条到屏幕 x → 新的冻结列数（拆分条落在该列左沿处）。钳到 [0, count]。 */
  splitColToIndex(screenX) {
    const vp = this.viewport;
    if (screenX <= vp.leftOffset) return 0;
    const contentX = (screenX - vp.leftOffset) / vp.zoom;
    const idx = this.cols.indexAt(Math.max(0, contentX));
    return Math.max(0, Math.min(this.cols.length, idx));
  }
  /** 拖拽横拆分条到屏幕 y → 新的冻结行数。钳到 [0, count]。 */
  splitRowToIndex(screenY) {
    const vp = this.viewport;
    if (screenY <= vp.topOffset) return 0;
    const contentY = (screenY - vp.topOffset) / vp.zoom;
    const idx = this.rows.indexAt(Math.max(0, contentY));
    return Math.max(0, Math.min(this.rows.length, idx));
  }
  // ── 内容坐标 → 屏幕坐标（无冻结时与旧变换等价；有头/尾冻结按点所在带）────
  contentXToScreen(contentX) {
    const vp = this.viewport;
    const fc = Math.min(vp.frozenColCount, this.cols.length);
    const tc = this.trailingCols();
    if (tc > 0) {
      const trailStartContent = this.cols.startOf(this.cols.length - tc);
      if (contentX >= trailStartContent) {
        return this.trailingLineX() + (contentX - trailStartContent) * vp.zoom;
      }
    }
    if (fc > 0) {
      const frozenLen = this.cols.startOf(fc);
      if (contentX < frozenLen) return vp.leftOffset + contentX * vp.zoom;
      return this.freezeLineX() + (contentX - frozenLen - vp.scrollLeft) * vp.zoom;
    }
    return (contentX - vp.scrollLeft) * vp.zoom + vp.leftOffset;
  }
  contentYToScreen(contentY) {
    const vp = this.viewport;
    const fr = Math.min(vp.frozenRowCount, this.rows.length);
    const tr = this.trailingRows();
    if (tr > 0) {
      const trailStartContent = this.rows.startOf(this.rows.length - tr);
      if (contentY >= trailStartContent) {
        return this.trailingLineY() + (contentY - trailStartContent) * vp.zoom;
      }
    }
    if (fr > 0) {
      const frozenLen = this.rows.startOf(fr);
      if (contentY < frozenLen) return vp.topOffset + contentY * vp.zoom;
      return this.freezeLineY() + (contentY - frozenLen - vp.scrollTop) * vp.zoom;
    }
    return (contentY - vp.scrollTop) * vp.zoom + vp.topOffset;
  }
  screenXToContent(screenX) {
    const vp = this.viewport;
    const fc = Math.min(vp.frozenColCount, this.cols.length);
    const tc = this.trailingCols();
    if (tc > 0 && screenX >= this.trailingLineX()) {
      const trailStartContent = this.cols.startOf(this.cols.length - tc);
      return trailStartContent + (screenX - this.trailingLineX()) / vp.zoom;
    }
    if (fc > 0 && screenX < this.freezeLineX()) {
      return (screenX - vp.leftOffset) / vp.zoom;
    }
    if (fc > 0) {
      const frozenLen = this.cols.startOf(fc);
      return frozenLen + vp.scrollLeft + (screenX - this.freezeLineX()) / vp.zoom;
    }
    return (screenX - vp.leftOffset) / vp.zoom + vp.scrollLeft;
  }
  screenYToContent(screenY) {
    const vp = this.viewport;
    const fr = Math.min(vp.frozenRowCount, this.rows.length);
    const tr = this.trailingRows();
    if (tr > 0 && screenY >= this.trailingLineY()) {
      const trailStartContent = this.rows.startOf(this.rows.length - tr);
      return trailStartContent + (screenY - this.trailingLineY()) / vp.zoom;
    }
    if (fr > 0 && screenY < this.freezeLineY()) {
      return (screenY - vp.topOffset) / vp.zoom;
    }
    if (fr > 0) {
      const frozenLen = this.rows.startOf(fr);
      return frozenLen + vp.scrollTop + (screenY - this.freezeLineY()) / vp.zoom;
    }
    return (screenY - vp.topOffset) / vp.zoom + vp.scrollTop;
  }
  /**
   * 单元格/合并区的屏幕矩形。rowCount/colCount>1 时返回覆盖整个跨度的矩形
   * （供合并格徽标定位）。坐标相对画布宿主，已含滚动/缩放/头偏移。
   */
  getCellRect(row, col, rowCount = 1, colCount = 1) {
    const zoom = this.viewport.zoom;
    const colP = this.colPane();
    const rowP = this.rowPane();
    const x = indexStartToScreen(col, colP);
    const y = indexStartToScreen(row, rowP);
    const cw = this.cols.startOf(col + Math.max(1, colCount)) - this.cols.startOf(col);
    const ch = this.rows.startOf(row + Math.max(1, rowCount)) - this.rows.startOf(row);
    return { x, y, width: cw * zoom, height: ch * zoom };
  }
  /**
   * 命中测试：屏幕坐标（相对画布宿主）→ 单元格 + 区域。
   * 落在行列头/角上返回对应区域；落在数据区返回 viewport。超出网格 clamp 到边缘格。
   */
  hitTest(screenX, screenY) {
    const vp = this.viewport;
    const inRowOutline = screenX < vp.rowOutlineWidth;
    const inColOutline = screenY < vp.colOutlineHeight;
    const inRowHeader = !inRowOutline && screenX < vp.leftOffset;
    const inColHeader = !inColOutline && screenY < vp.topOffset;
    const col = screenToIndex(screenX, this.colPane(), (px) => this.cols.indexAt(px)).index;
    const row = screenToIndex(screenY, this.rowPane(), (px) => this.rows.indexAt(px)).index;
    if (inRowOutline && inColOutline) return { area: "outlineCorner", row, col };
    if (inColOutline) return { area: "colOutline", row: 0, col };
    if (inRowOutline) return { area: "rowOutline", row, col: 0 };
    if (inRowHeader && inColHeader) return { area: "corner", row, col };
    if (inColHeader) return { area: "colHeader", row: 0, col };
    if (inRowHeader) return { area: "rowHeader", row, col: 0 };
    return { area: "viewport", row, col };
  }
  /**
   * 命中列头的「列边界」（用于拖拽调列宽）。返回该边界左侧的列索引（即被调整的列），
   * 命中不到返回 null。tolerance 为屏幕像素容差（不随缩放变，符合手感）。
   * 只在列头区（screenY < colHeaderHeight）内有效。
   */
  hitColumnBorder(screenX, screenY, tolerance = 4) {
    const vp = this.viewport;
    if (screenY >= vp.topOffset || screenX < vp.leftOffset) return null;
    const first = this.getViewportLeftColumn();
    const last = this.getViewportRightColumn();
    for (let c = first; c <= last; c++) {
      const rightContent = this.cols.startOf(c) + this.cols.sizeAt(c);
      const rightScreen = this.contentXToScreen(rightContent);
      if (Math.abs(screenX - rightScreen) <= tolerance) return c;
    }
    return null;
  }
  /**
   * 命中行头的「行边界」（用于拖拽调行高）。返回该边界上方的行索引。
   */
  hitRowBorder(screenX, screenY, tolerance = 4) {
    const vp = this.viewport;
    if (screenX >= vp.leftOffset || screenY < vp.topOffset) return null;
    const first = this.getViewportTopRow();
    const last = this.getViewportBottomRow();
    for (let r = first; r <= last; r++) {
      const bottomContent = this.rows.startOf(r) + this.rows.sizeAt(r);
      const bottomScreen = this.contentYToScreen(bottomContent);
      if (Math.abs(screenY - bottomScreen) <= tolerance) return r;
    }
    return null;
  }
  /** 列左沿的内容坐标（拖拽调宽时算新宽度用）。 */
  columnContentLeft(col) {
    return this.cols.startOf(col);
  }
  /** 行上沿的内容坐标。 */
  rowContentTop(row) {
    return this.rows.startOf(row);
  }
  /**
   * 命中自动填充手柄（选区右下角 6×6 小方块，M10）。传入选区区域，返回是否命中。
   * tolerance 屏幕像素容差（不随缩放）。手柄画在选区矩形右下角。
   */
  hitFillHandle(screenX, screenY, sel, tolerance = 5) {
    const rect = this.getCellRect(sel.row, sel.col, sel.rowCount, sel.colCount);
    const hx2 = rect.x + rect.width;
    const hy = rect.y + rect.height;
    return Math.abs(screenX - hx2) <= tolerance && Math.abs(screenY - hy) <= tolerance;
  }
  /**
   * 命中自动筛选箭头（M11）：给定筛选区列范围，返回命中的列号或 null。
   * 只在列头区（screenY 落在列头带内）有效。与渲染层 filterArrowBox 共用几何。
   */
  hitFilterArrow(screenX, screenY, filterCol1, filterCol2) {
    const vp = this.viewport;
    if (screenY < vp.colOutlineHeight || screenY >= vp.topOffset) return null;
    if (screenX < vp.leftOffset) return null;
    const first = Math.max(filterCol1, this.getViewportLeftColumn());
    const last = Math.min(filterCol2, this.getViewportRightColumn());
    const fc = this.frozenCols();
    const candidates = [];
    for (let c = filterCol1; c < Math.min(fc, filterCol2 + 1); c++) candidates.push(c);
    for (let c = first; c <= last; c++) candidates.push(c);
    for (const c of candidates) {
      const box = filterArrowBox(this.getCellRect(0, c), vp.colOutlineHeight, vp.colHeaderHeight);
      if (screenX >= box.x && screenX < box.x + box.w && screenY >= box.y && screenY < box.y + box.h) return c;
    }
    return null;
  }
  /** 命中单元格复选框（M12）：格中心 ~14px 方块。 */
  hitCheckbox(screenX, screenY, rect) {
    const box = checkboxBox(rect);
    return screenX >= box.x && screenX < box.x + box.size && screenY >= box.y && screenY < box.y + box.size;
  }
  /** 命中单元格右侧 list 验证下拉箭头（M12）：格右侧 ~16px 方块。 */
  hitCellDropdown(screenX, screenY, rect) {
    const box = cellDropdownBox(rect);
    return screenX >= box.x && screenX < box.x + box.w && screenY >= box.y && screenY < box.y + box.h;
  }
  // ── 大纲区命中（供交互折叠/层级）─────────────────────
  /** 某行竖直中心的屏幕 y（大纲按钮定位用）。 */
  rowCenterScreen(row) {
    const r = this.getCellRect(row, 0);
    return r.y + r.height / 2;
  }
  /** 某列水平中心的屏幕 x。 */
  colCenterScreen(col) {
    const r = this.getCellRect(0, col);
    return r.x + r.width / 2;
  }
  /**
   * 命中大纲区按钮：返回命中的 toggle（分组折叠钮）或 level（层级总开关）。
   * groups/summary 由调用方从 Worksheet 传入（几何层不持有 sheet）。
   */
  hitOutlineButton(screenX, screenY, rowGroups, colGroups, summaryBelow, summaryRight) {
    const vp = this.viewport;
    const inRowBand = screenX >= 0 && screenX < vp.rowOutlineWidth;
    const inColBand = screenY >= 0 && screenY < vp.colOutlineHeight;
    const rowMax = maxLevelOf(rowGroups);
    const colMax = maxLevelOf(colGroups);
    for (const b of levelButtons(rowMax, colMax >= 0)) {
      if (pointInRect(screenX, screenY, b)) return { kind: "level", axis: "row", level: b.level };
    }
    for (const b of colLevelButtons(colMax, rowMax >= 0)) {
      if (pointInRect(screenX, screenY, b)) return { kind: "level", axis: "col", level: b.level };
    }
    if (inRowBand) {
      const btns = rowOutlineButtons(rowGroups, summaryBelow, (r) => this.rowCenterScreen(r));
      for (const b of btns) {
        if (pointInRect(screenX, screenY, b)) return { kind: "toggle", axis: "row", groupIndex: b.groupIndex };
      }
      return null;
    }
    if (inColBand) {
      const btns = colOutlineButtons(colGroups, summaryRight, (c) => this.colCenterScreen(c));
      for (const b of btns) {
        if (pointInRect(screenX, screenY, b)) return { kind: "toggle", axis: "col", groupIndex: b.groupIndex };
      }
      return null;
    }
    return null;
  }
  // ── 视口可见范围（内容坐标窗口 → 索引区间）────────
  visibleRowRange() {
    const vp = this.viewport;
    const rowP = this.rowPane();
    if (rowP.frozenCount > 0) {
      return scrollBandVisibleRange(rowP, vp.contentHeight / vp.zoom, (a, b) => this.rows.rangeInWindow(a, b));
    }
    const top = vp.scrollTop;
    const bottom = top + vp.contentHeight / vp.zoom;
    return this.rows.rangeInWindow(top, bottom);
  }
  visibleColRange() {
    const vp = this.viewport;
    const colP = this.colPane();
    if (colP.frozenCount > 0) {
      return scrollBandVisibleRange(colP, vp.contentWidth / vp.zoom, (a, b) => this.cols.rangeInWindow(a, b));
    }
    const left = vp.scrollLeft;
    const right = left + vp.contentWidth / vp.zoom;
    return this.cols.rangeInWindow(left, right);
  }
  /** 滚动带可见行范围（冻结时跳过冻结带；无冻结即全可见范围）。渲染主区用。 */
  scrollRowRange() {
    return this.visibleRowRange();
  }
  scrollColRange() {
    return this.visibleColRange();
  }
  /** 冻结行/列数（钳到轴长）。渲染冻结区用。 */
  frozenRows() {
    return Math.min(this.viewport.frozenRowCount, this.rows.length);
  }
  frozenCols() {
    return Math.min(this.viewport.frozenColCount, this.cols.length);
  }
  /** 视口顶部可见行（对齐 ws.getViewportTopRow(1)）。冻结时返回滚动带首行。 */
  getViewportTopRow() {
    return this.visibleRowRange()?.first ?? this.frozenRows();
  }
  /** 视口底部可见行。 */
  getViewportBottomRow() {
    return this.visibleRowRange()?.last ?? this.frozenRows();
  }
  /** 视口左侧可见列。 */
  getViewportLeftColumn() {
    return this.visibleColRange()?.first ?? this.frozenCols();
  }
  /** 视口右侧可见列。 */
  getViewportRightColumn() {
    return this.visibleColRange()?.last ?? this.frozenCols();
  }
  /**
   * 计算把 (row,col) 滚到可见所需的新滚动位置（内容坐标），返回 {scrollLeft,scrollTop}。
   * 不直接改视口——由调用方 set，便于测试与撤销。
   * align: 'start' 置于左上；'center' 居中；'end' 置于右下。
   */
  computeScrollToShow(row, col, align = "start") {
    const vp = this.viewport;
    const cellLeft = this.cols.startOf(col);
    const cellTop = this.rows.startOf(row);
    const cellW = this.cols.sizeAt(col);
    const cellH = this.rows.sizeAt(row);
    const viewW = vp.contentWidth / vp.zoom;
    const viewH = vp.contentHeight / vp.zoom;
    let scrollLeft = vp.scrollLeft;
    let scrollTop = vp.scrollTop;
    if (align === "center") {
      scrollLeft = cellLeft - (viewW - cellW) / 2;
      scrollTop = cellTop - (viewH - cellH) / 2;
    } else if (align === "end") {
      scrollLeft = cellLeft + cellW - viewW;
      scrollTop = cellTop + cellH - viewH;
    } else {
      if (cellLeft < vp.scrollLeft) scrollLeft = cellLeft;
      else if (cellLeft + cellW > vp.scrollLeft + viewW) scrollLeft = cellLeft + cellW - viewW;
      if (cellTop < vp.scrollTop) scrollTop = cellTop;
      else if (cellTop + cellH > vp.scrollTop + viewH) scrollTop = cellTop + cellH - viewH;
    }
    return {
      scrollLeft: Math.max(0, Math.min(scrollLeft, Math.max(0, this.cols.totalSize() - viewW))),
      scrollTop: Math.max(0, Math.min(scrollTop, Math.max(0, this.rows.totalSize() - viewH)))
    };
  }
  /** 滚动使单元格可见（直接应用到视口）。 */
  showCell(row, col, align = "start") {
    const { scrollLeft, scrollTop } = this.computeScrollToShow(row, col, align);
    this.viewport.set({ scrollLeft, scrollTop });
  }
  // ── 滚动条 ───────────────────────────────────────────
  /**
   * 解析滚动条布局并把占位（gutter）回写到视口。
   * 需两趟（竖条吃横向、横条吃纵向），故传入**不含 gutter** 的视口尺寸让纯函数自行判定。
   * 调用时机：resize/滚动/缩放/结构变化后、draw 之前。返回布局供渲染层画、交互层命中。
   */
  resolveScrollbars() {
    const vp = this.viewport;
    const layout = resolveScrollbars({
      viewWidth: vp.width,
      viewHeight: vp.height,
      leftOffset: vp.leftOffset,
      topOffset: vp.topOffset,
      contentWidth: this.cols.totalSize() * vp.zoom,
      contentHeight: this.rows.totalSize() * vp.zoom,
      scrollLeft: vp.scrollLeft,
      scrollTop: vp.scrollTop,
      zoom: vp.zoom
    });
    vp.scrollbarGutterRight = layout.gutterRight;
    vp.scrollbarGutterBottom = layout.gutterBottom;
    return layout;
  }
  /** 最大滚动位置（内容像素，未缩放）。头/尾冻结带内容都不参与滚动，故各扣其内容长。 */
  maxScroll() {
    const vp = this.viewport;
    const fc = this.frozenCols(), fr = this.frozenRows();
    const tc = this.trailingCols(), tr = this.trailingRows();
    const frozenW = fc > 0 ? this.cols.startOf(fc) : 0;
    const frozenH = fr > 0 ? this.rows.startOf(fr) : 0;
    const trailW = tc > 0 ? this.cols.startOf(this.cols.length) - this.cols.startOf(this.cols.length - tc) : 0;
    const trailH = tr > 0 ? this.rows.startOf(this.rows.length) - this.rows.startOf(this.rows.length - tr) : 0;
    const availW = vp.contentWidth / vp.zoom - frozenW;
    const availH = vp.contentHeight / vp.zoom - frozenH;
    return {
      left: Math.max(0, this.cols.totalSize() - frozenW - trailW - availW),
      top: Math.max(0, this.rows.totalSize() - frozenH - trailH - availH)
    };
  }
  /** 把当前滚动位置钳到合法区间（内容变短/放大后避免滚过头露白）。 */
  clampScroll() {
    const vp = this.viewport;
    const m = this.maxScroll();
    vp.set({
      scrollLeft: Math.min(vp.scrollLeft, m.left),
      scrollTop: Math.min(vp.scrollTop, m.top)
    });
  }
  /**
   * 命中滚动条。返回命中的条 + 区（滑块/轨道空白）。需先 resolveScrollbars 拿到 layout。
   * 命中滑块 → 拖拽；命中轨道空白 → 翻页。
   */
  hitScrollbar(x, y, layout) {
    const inRect = (r) => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height;
    if (layout.vertical.visible && inRect(layout.vertical.track)) {
      return { axis: "v", part: inRect(layout.vertical.thumb) ? "thumb" : "track" };
    }
    if (layout.horizontal.visible && inRect(layout.horizontal.track)) {
      return { axis: "h", part: inRect(layout.horizontal.thumb) ? "thumb" : "track" };
    }
    return null;
  }
  /**
   * 拖拽竖条滑块：把滑块目标顶端 y（屏幕像素）换算成 scrollTop（内容像素）并应用。
   * @param thumbTopY 滑块新顶端相对画布的 y
   */
  dragVerticalThumb(thumbTopY, layout) {
    const vp = this.viewport;
    const tr = layout.vertical.track;
    const thumb = layout.vertical.thumb;
    const pos = thumbTopY - tr.y;
    const scrollTop = thumbPosToScroll(
      pos,
      tr.height,
      thumb.height,
      this.rows.totalSize() * vp.zoom,
      tr.height,
      vp.zoom
    );
    vp.set({ scrollTop });
  }
  /** 拖拽横条滑块：把滑块新左端 x 换算成 scrollLeft。 */
  dragHorizontalThumb(thumbLeftX, layout) {
    const vp = this.viewport;
    const tr = layout.horizontal.track;
    const thumb = layout.horizontal.thumb;
    const pos = thumbLeftX - tr.x;
    const scrollLeft = thumbPosToScroll(
      pos,
      tr.width,
      thumb.width,
      this.cols.totalSize() * vp.zoom,
      tr.width,
      vp.zoom
    );
    vp.set({ scrollLeft });
  }
};

// src/core/dateSerial.ts
var DAY_MS = 864e5;
var EPOCH_MS = Date.UTC(1899, 11, 31);
function serialToParts(serial) {
  const dayPart = Math.floor(serial);
  const shifted = dayPart >= 61 ? dayPart - 1 : dayPart;
  const frac = serial - dayPart;
  const secOfDay = Math.round(frac * 86400);
  const d = new Date(EPOCH_MS + shifted * DAY_MS + secOfDay * 1e3);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    weekday: d.getUTCDay(),
    hours: d.getUTCHours(),
    minutes: d.getUTCMinutes(),
    seconds: d.getUTCSeconds()
  };
}
function dateToSerial(year, month, day) {
  const ms = Date.UTC(year, month - 1, day);
  let s = Math.round((ms - EPOCH_MS) / DAY_MS);
  if (s >= 60) s += 1;
  return s;
}
function timeToFraction(hours, minutes, seconds) {
  return (hours * 3600 + minutes * 60 + seconds) / 86400;
}
function serialToTime(serial) {
  const { hours, minutes, seconds } = serialToParts(serial);
  return { hours, minutes, seconds };
}
function partsToSerial(year, month, day, hours = 0, minutes = 0, seconds = 0) {
  return dateToSerial(year, month, day) + timeToFraction(hours, minutes, seconds);
}

// src/render/numFmt/compile.ts
var NAMED_COLORS = {
  black: "#000000",
  blue: "#0000ff",
  cyan: "#00ffff",
  green: "#008000",
  magenta: "#ff00ff",
  red: "#ff0000",
  white: "#ffffff",
  yellow: "#ffff00"
};
var INDEXED_COLORS = {
  1: "#000000",
  2: "#ffffff",
  3: "#ff0000",
  4: "#00ff00",
  5: "#0000ff",
  6: "#ffff00",
  7: "#ff00ff",
  8: "#00ffff"
};
var compileCache = /* @__PURE__ */ new Map();
function compileFormat(formatter) {
  const key2 = formatter ?? "";
  let hit = compileCache.get(key2);
  if (!hit) {
    hit = build(key2);
    compileCache.set(key2, hit);
  }
  return hit;
}
function build(fmt) {
  const trimmed = fmt.trim();
  if (trimmed === "" || /^general$/i.test(trimmed)) {
    return { sections: [], isGeneral: true };
  }
  const rawSections = splitSections(fmt);
  const sections = rawSections.map(compileSection);
  return { sections, isGeneral: false };
}
function splitSections(fmt) {
  const out = [];
  let cur = "";
  let inStr = false;
  let inBracket = false;
  for (let i = 0; i < fmt.length; i++) {
    const ch = fmt[i];
    if (inStr) {
      cur += ch;
      if (ch === '"') inStr = false;
      continue;
    }
    if (inBracket) {
      cur += ch;
      if (ch === "]") inBracket = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      cur += ch;
    } else if (ch === "[") {
      inBracket = true;
      cur += ch;
    } else if (ch === ";") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}
var DATE_LETTERS = /* @__PURE__ */ new Set(["y", "m", "d", "h", "s"]);
function compileSection(raw) {
  const tokens = [];
  let color;
  let condition;
  let i = 0;
  while (i < raw.length) {
    const ch = raw[i];
    if (ch === "[") {
      const end = raw.indexOf("]", i);
      if (end < 0) {
        tokens.push({ t: "lit", s: ch });
        i++;
        continue;
      }
      const inner = raw.slice(i + 1, end);
      const parsed = parseBracket(inner);
      if (parsed.kind === "color") color = parsed.color;
      else if (parsed.kind === "condition") condition = parsed.condition;
      else if (parsed.kind === "elapsed") tokens.push({ t: "date", code: parsed.code });
      i = end + 1;
      continue;
    }
    if (ch === '"') {
      const end = raw.indexOf('"', i + 1);
      const lit = end < 0 ? raw.slice(i + 1) : raw.slice(i + 1, end);
      tokens.push({ t: "lit", s: lit });
      i = end < 0 ? raw.length : end + 1;
      continue;
    }
    if (ch === "\\") {
      const nxt = raw[i + 1];
      if (nxt !== void 0) tokens.push({ t: "lit", s: nxt });
      i += 2;
      continue;
    }
    if (ch === "_") {
      tokens.push({ t: "skip", c: raw[i + 1] ?? " " });
      i += 2;
      continue;
    }
    if (ch === "*") {
      tokens.push({ t: "fill", c: raw[i + 1] ?? " " });
      i += 2;
      continue;
    }
    if (ch === "0" || ch === "#" || ch === "?") {
      tokens.push({ t: "dig", c: ch });
      i++;
      continue;
    }
    if (ch === ".") {
      tokens.push({ t: "dot" });
      i++;
      continue;
    }
    if (ch === ",") {
      tokens.push({ t: "comma" });
      i++;
      continue;
    }
    if (ch === "%") {
      tokens.push({ t: "pct" });
      i++;
      continue;
    }
    if (ch === "/") {
      tokens.push({ t: "slash" });
      i++;
      continue;
    }
    if (ch === "@") {
      tokens.push({ t: "at" });
      i++;
      continue;
    }
    if ((ch === "E" || ch === "e") && (raw[i + 1] === "+" || raw[i + 1] === "-")) {
      tokens.push({ t: "sci", c: raw[i + 1] });
      i += 2;
      continue;
    }
    const low = ch.toLowerCase();
    if (DATE_LETTERS.has(low)) {
      let j = i;
      while (j < raw.length && raw[j].toLowerCase() === low) j++;
      tokens.push({ t: "date", code: low.repeat(j - i) });
      i = j;
      continue;
    }
    const ampm = matchAmPm(raw, i);
    if (ampm) {
      tokens.push({ t: "date", code: "am/pm" });
      i += ampm;
      continue;
    }
    tokens.push({ t: "lit", s: ch });
    i++;
  }
  disambiguateMinutes(tokens);
  const kind = classify(tokens);
  const plan = numberPlan(tokens);
  return {
    raw,
    tokens,
    kind,
    ...color ? { color } : {},
    ...condition ? { condition } : {},
    ...plan
  };
}
function parseBracket(inner) {
  const t = inner.trim();
  const lower = t.toLowerCase();
  if (NAMED_COLORS[lower]) return { kind: "color", color: NAMED_COLORS[lower] };
  const cIdx = /^color\s*(\d+)$/i.exec(t);
  if (cIdx) return { kind: "color", color: INDEXED_COLORS[Number(cIdx[1])] };
  const cond = /^(>=|<=|<>|>|<|=)\s*(-?\d+(?:\.\d+)?)$/.exec(t);
  if (cond) {
    return {
      kind: "condition",
      condition: { op: cond[1], value: Number(cond[2]) }
    };
  }
  if (/^h+$/i.test(t)) return { kind: "elapsed", code: "[h]" };
  if (/^m+$/i.test(t)) return { kind: "elapsed", code: "[m]" };
  if (/^s+$/i.test(t)) return { kind: "elapsed", code: "[s]" };
  return { kind: "unknown" };
}
function matchAmPm(raw, i) {
  const rest = raw.slice(i);
  if (/^am\/pm/i.test(rest)) return 5;
  if (/^a\/p/i.test(rest)) return 3;
  return 0;
}
function disambiguateMinutes(tokens) {
  const dateIdx = tokens.map((t, idx) => ({ t, idx })).filter((e) => e.t.t === "date").map((e) => e.idx);
  for (let k = 0; k < dateIdx.length; k++) {
    const tok = tokens[dateIdx[k]];
    if (tok.code !== "m" && tok.code !== "mm") continue;
    const prev = k > 0 ? tokens[dateIdx[k - 1]] : void 0;
    const next = k < dateIdx.length - 1 ? tokens[dateIdx[k + 1]] : void 0;
    const prevIsHour = prev && /^\[?h/.test(prev.code ?? "");
    const nextIsSec = next && /^\[?s/.test(next.code ?? "");
    if (prevIsHour || nextIsSec) tok.code = tok.code === "m" ? "n" : "nn";
  }
}
function classify(tokens) {
  let hasAt = false;
  let hasDate = false;
  let hasNum = false;
  for (const t of tokens) {
    if (t.t === "at") hasAt = true;
    else if (t.t === "date") hasDate = true;
    else if (t.t === "dig" || t.t === "sci" || t.t === "slash") hasNum = true;
  }
  if (hasDate) return "date";
  if (hasAt && !hasNum) return "text";
  return "number";
}
function numberPlan(tokens) {
  const dotIdx = tokens.findIndex((t) => t.t === "dot");
  const sciIdx = tokens.findIndex((t) => t.t === "sci");
  const slashIdx = tokens.findIndex((t) => t.t === "slash");
  let intMin = 0;
  let decimals = 0;
  let hasThousands = false;
  let hasPercent = false;
  let lastIntDigIdx = -1;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.t === "pct") hasPercent = true;
    if (t.t === "dig") {
      const beforeDot = dotIdx < 0 || i < dotIdx;
      const beforeSci = sciIdx < 0 || i < sciIdx;
      if (beforeDot) {
        if (t.c === "0") intMin++;
        lastIntDigIdx = i;
      } else if (beforeSci) {
        decimals++;
      }
    }
  }
  let scale = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.t !== "comma") continue;
    const beforeDot = dotIdx < 0 || i < dotIdx;
    if (!beforeDot) continue;
    if (lastIntDigIdx >= 0 && i < lastIntDigIdx) hasThousands = true;
    else if (lastIntDigIdx >= 0 && i > lastIntDigIdx) scale++;
  }
  const hasSci = sciIdx >= 0;
  let sciExpDigits = 0;
  if (hasSci) {
    for (let i = sciIdx + 1; i < tokens.length; i++) if (tokens[i].t === "dig") sciExpDigits++;
    if (sciExpDigits === 0) sciExpDigits = 2;
  }
  const hasFraction = slashIdx >= 0 && sciIdx < 0;
  let fracDenomDigits = 0;
  if (hasFraction) {
    for (let i = slashIdx + 1; i < tokens.length; i++) if (tokens[i].t === "dig") fracDenomDigits++;
    if (fracDenomDigits === 0) fracDenomDigits = 1;
  }
  return { decimals, intMin, hasThousands, scale, hasPercent, hasSci, sciExpDigits, hasFraction, fracDenomDigits };
}

// src/render/numFmt/apply.ts
var MONTHS_FULL = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];
var MONTHS_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
var WEEKDAYS_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
var WEEKDAYS_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function applyFormat(value, compiled) {
  if (value === null || value === void 0) return { text: "" };
  if (typeof value === "boolean") return { text: value ? "TRUE" : "FALSE" };
  if (compiled.isGeneral || compiled.sections.length === 0) {
    if (typeof value === "string") return { text: value };
    return { text: generalNumber(value) };
  }
  if (typeof value === "string") {
    const textSec = compiled.sections[3] ?? compiled.sections.find((s) => s.kind === "text");
    if (textSec) return renderText(value, textSec);
    return { text: value };
  }
  const num3 = value;
  if (!Number.isFinite(num3)) return { text: String(num3) };
  const pick = selectSection(num3, compiled.sections);
  if (!pick) return { text: generalNumber(num3) };
  const { section, useAbs, autoMinus } = pick;
  if (section.kind === "date") {
    return mk(renderDate(num3, section.tokens), section.color);
  }
  if (section.kind === "text") {
    return mk(renderText(generalNumber(num3), section).text, section.color);
  }
  const v = useAbs ? Math.abs(num3) : num3;
  let text = renderNumber(v, section);
  if (autoMinus && num3 < 0) text = "-" + text;
  return mk(text, section.color);
}
function mk(text, color) {
  return color ? { text, color } : { text };
}
function formatWith(value, formatter) {
  return applyFormat(value, compileFormat(formatter));
}
function selectSection(num3, sections) {
  const hasCond = sections.some((s) => s.condition);
  if (hasCond) {
    for (const s of sections) {
      if (s.condition) {
        if (matchCondition(num3, s.condition)) return { section: s, useAbs: num3 < 0, autoMinus: false };
      } else {
        return { section: s, useAbs: false, autoMinus: false };
      }
    }
    const last = sections[sections.length - 1];
    return last ? { section: last, useAbs: false, autoMinus: false } : null;
  }
  const n = sections.length;
  if (num3 > 0) {
    return sections[0] ? { section: sections[0], useAbs: false, autoMinus: false } : null;
  }
  if (num3 < 0) {
    if (n >= 2 && sections[1]) return { section: sections[1], useAbs: true, autoMinus: false };
    return sections[0] ? { section: sections[0], useAbs: true, autoMinus: true } : null;
  }
  if (n >= 3 && sections[2]) return { section: sections[2], useAbs: false, autoMinus: false };
  return sections[0] ? { section: sections[0], useAbs: false, autoMinus: false } : null;
}
function matchCondition(num3, cond) {
  switch (cond.op) {
    case ">=":
      return num3 >= cond.value;
    case "<=":
      return num3 <= cond.value;
    case ">":
      return num3 > cond.value;
    case "<":
      return num3 < cond.value;
    case "=":
      return num3 === cond.value;
    case "<>":
      return num3 !== cond.value;
  }
}
function renderNumber(abs, section) {
  let v = abs;
  if (section.scale > 0) v = v / Math.pow(1e3, section.scale);
  if (section.hasPercent) v = v * 100;
  const firstNumIdx = section.tokens.findIndex(isNumericToken);
  if (firstNumIdx < 0) return literalsOnly(section.tokens);
  const body = section.hasSci ? sciBody(v, section) : section.hasFraction ? fractionBody(v, section) : plainBody(v, section);
  let lastNumIdx = firstNumIdx;
  for (let i = section.tokens.length - 1; i > firstNumIdx; i--) {
    if (isNumericToken(section.tokens[i])) {
      lastNumIdx = i;
      break;
    }
  }
  let out = "";
  for (let i = 0; i < section.tokens.length; i++) {
    const t = section.tokens[i];
    if (i === firstNumIdx) {
      out += body;
      continue;
    }
    if (isNumericToken(t)) continue;
    if (i > firstNumIdx && i < lastNumIdx) continue;
    if (t.t === "pct") out += "%";
    else if (t.t === "lit") out += t.s ?? "";
    else if (t.t === "skip") out += " ";
    else if (t.t === "fill") out += t.c ?? " ";
  }
  return out;
}
function literalsOnly(tokens) {
  let out = "";
  for (const t of tokens) {
    if (t.t === "lit") out += t.s ?? "";
    else if (t.t === "pct") out += "%";
    else if (t.t === "skip") out += " ";
    else if (t.t === "fill") out += t.c ?? " ";
  }
  return out;
}
function isNumericToken(t) {
  return t.t === "dig" || t.t === "dot" || t.t === "comma" || t.t === "sci" || t.t === "slash";
}
function plainBody(abs, section) {
  const dec = section.decimals;
  const s = dec > 0 ? abs.toFixed(dec) : Math.round(abs).toString();
  const dot = s.indexOf(".");
  let intPart = dot >= 0 ? s.slice(0, dot) : s;
  const fracPart = dot >= 0 ? s.slice(dot + 1) : "";
  if (intPart.length < section.intMin) intPart = intPart.padStart(section.intMin, "0");
  if (section.hasThousands) intPart = addThousands(intPart);
  return dec > 0 ? intPart + "." + fracPart : intPart;
}
function sciBody(abs, section) {
  const dec = section.decimals;
  let exp = 0;
  let mant = abs;
  if (abs !== 0) {
    exp = Math.floor(Math.log10(abs));
    mant = abs / Math.pow(10, exp);
    const rounded = Number(mant.toFixed(dec));
    if (rounded >= 10) {
      mant = rounded / 10;
      exp += 1;
    }
  }
  const mantStr = mant.toFixed(dec);
  const sign = exp >= 0 ? "+" : "-";
  const expStr = Math.abs(exp).toString().padStart(section.sciExpDigits, "0");
  return `${mantStr}E${sign}${expStr}`;
}
function fractionBody(abs, section) {
  const whole = Math.floor(abs);
  const frac = abs - whole;
  const maxDen = Math.pow(10, section.fracDenomDigits) - 1;
  const { n, d } = bestFraction(frac, maxDen);
  if (n === 0) return String(whole);
  if (whole === 0) return `${n}/${d}`;
  return `${whole} ${n}/${d}`;
}
function bestFraction(frac, maxDen) {
  let bestN = 0;
  let bestD = 1;
  let bestErr = Math.abs(frac);
  for (let d = 1; d <= maxDen; d++) {
    const n = Math.round(frac * d);
    const err = Math.abs(frac - n / d);
    if (err < bestErr) {
      bestErr = err;
      bestN = n;
      bestD = d;
    }
  }
  return { n: bestN, d: bestD };
}
function addThousands(intDigits) {
  return intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
function renderDate(serial, tokens) {
  const p = serialToParts(serial);
  const is12h = tokens.some((t) => t.t === "date" && t.code === "am/pm");
  let out = "";
  for (const t of tokens) {
    if (t.t === "date") {
      out += renderDateToken(t.code, serial, p, is12h);
    } else if (t.t === "lit") {
      out += t.s ?? "";
    } else if (t.t === "skip") {
      out += " ";
    } else if (t.t === "fill") {
      out += t.c ?? " ";
    } else if (t.t === "slash") {
      out += "/";
    } else if (t.t === "comma") {
      out += ",";
    } else if (t.t === "dot") {
      out += ".";
    }
  }
  return out;
}
function renderDateToken(code, serial, p, is12h) {
  switch (code) {
    case "yyyy":
      return String(p.year).padStart(4, "0");
    case "yy":
      return String(p.year % 100).padStart(2, "0");
    case "mmmm":
      return MONTHS_FULL[p.month - 1] ?? "";
    case "mmm":
      return MONTHS_ABBR[p.month - 1] ?? "";
    case "mm":
      return String(p.month).padStart(2, "0");
    case "m":
      return String(p.month);
    case "dddd":
      return WEEKDAYS_FULL[p.weekday] ?? "";
    case "ddd":
      return WEEKDAYS_ABBR[p.weekday] ?? "";
    case "dd":
      return String(p.day).padStart(2, "0");
    case "d":
      return String(p.day);
    case "hh":
      return String(hour12(p.hours, is12h)).padStart(2, "0");
    case "h":
      return String(hour12(p.hours, is12h));
    case "nn":
      return String(p.minutes).padStart(2, "0");
    case "n":
      return String(p.minutes);
    case "ss":
      return String(p.seconds).padStart(2, "0");
    case "s":
      return String(p.seconds);
    case "am/pm":
      return p.hours < 12 ? "AM" : "PM";
    case "[h]":
      return String(Math.floor(serial * 24));
    case "[m]":
      return String(Math.floor(serial * 24 * 60));
    case "[s]":
      return String(Math.floor(serial * 24 * 60 * 60));
    default:
      return "";
  }
}
function hour12(h, is12h) {
  if (!is12h) return h;
  const r = h % 12;
  return r === 0 ? 12 : r;
}
function renderText(str, section) {
  let out = "";
  for (const t of section.tokens) {
    if (t.t === "at") out += str;
    else if (t.t === "lit") out += t.s ?? "";
    else if (t.t === "skip") out += " ";
    else if (t.t === "fill") out += t.c ?? " ";
  }
  return mk(out, section.color);
}
function generalNumber(n) {
  if (!Number.isFinite(n)) return String(n);
  if (Number.isInteger(n)) return String(n);
  return String(n);
}

// src/render/formatValue.ts
function formatCell(value, formatter) {
  return formatWith(value, formatter);
}
function formatValue(value, formatter) {
  return formatWith(value, formatter).text;
}

// src/render/condFormat.ts
function evaluateRules(sheet, rules) {
  const out = /* @__PURE__ */ new Map();
  for (const rule of rules) {
    const cells = rangeNumbers(sheet, rule.range);
    switch (rule.type) {
      case "cellValue":
        applyCellValue(sheet, rule, out);
        break;
      case "colorScale":
        applyColorScale(rule, cells, out);
        break;
      case "dataBar":
        applyDataBar(rule, cells, out);
        break;
      case "iconSet":
        applyIconSet(rule, cells, out);
        break;
    }
  }
  return out;
}
function rangeNumbers(sheet, g) {
  const out = [];
  for (let r = g.row; r < g.row + g.rowCount; r++) {
    for (let c = g.col; c < g.col + g.colCount; c++) {
      const v = sheet.getValue(r, c);
      const n = typeof v === "number" ? v : Number(v);
      if (v !== null && v !== "" && Number.isFinite(n)) out.push({ row: r, col: c, n });
    }
  }
  return out;
}
function key(r, c) {
  return `${r},${c}`;
}
function mergeStyle2(out, k, style) {
  const cur = out.get(k) ?? {};
  cur.style = { ...cur.style ?? {}, ...style };
  out.set(k, cur);
}
function applyCellValue(sheet, rule, out) {
  if (!rule.style) return;
  const g = rule.range;
  const cells = rangeNumbers(sheet, g);
  let topThreshold = 0, bottomThreshold = 0;
  const counts = /* @__PURE__ */ new Map();
  if (rule.operator === "top" || rule.operator === "bottom") {
    const n = Math.max(1, Number(rule.value1 ?? 10));
    const sorted = cells.map((c) => c.n).sort((a, b) => b - a);
    topThreshold = sorted[Math.min(n, sorted.length) - 1] ?? -Infinity;
    const asc = [...sorted].reverse();
    bottomThreshold = asc[Math.min(n, asc.length) - 1] ?? Infinity;
  }
  if (rule.operator === "duplicate" || rule.operator === "unique") {
    for (let r = g.row; r < g.row + g.rowCount; r++)
      for (let c = g.col; c < g.col + g.colCount; c++) {
        const t = cellText(sheet, r, c);
        if (t !== "") counts.set(t, (counts.get(t) ?? 0) + 1);
      }
  }
  for (let r = g.row; r < g.row + g.rowCount; r++) {
    for (let c = g.col; c < g.col + g.colCount; c++) {
      const v = sheet.getValue(r, c);
      if (matchCellValue(rule, v, topThreshold, bottomThreshold, counts, cellText(sheet, r, c))) {
        mergeStyle2(out, key(r, c), rule.style);
      }
    }
  }
}
function cellText(sheet, r, c) {
  const v = sheet.getValue(r, c);
  if (v === null || v === void 0) return "";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  return String(v);
}
function matchCellValue(rule, v, topTh, bottomTh, counts, text) {
  const n = typeof v === "number" ? v : Number(v);
  const numeric = v !== null && v !== "" && Number.isFinite(n);
  const v1 = Number(rule.value1);
  const v2 = Number(rule.value2);
  switch (rule.operator) {
    case "gt":
      return numeric && n > v1;
    case "ge":
      return numeric && n >= v1;
    case "lt":
      return numeric && n < v1;
    case "le":
      return numeric && n <= v1;
    case "eq":
      return numeric ? n === v1 : text === String(rule.value1 ?? "");
    case "ne":
      return numeric ? n !== v1 : text !== String(rule.value1 ?? "");
    case "between":
      return numeric && n >= Math.min(v1, v2) && n <= Math.max(v1, v2);
    case "notBetween":
      return numeric && (n < Math.min(v1, v2) || n > Math.max(v1, v2));
    case "contains":
      return text.toLowerCase().includes(String(rule.value1 ?? "").toLowerCase());
    case "notContains":
      return !text.toLowerCase().includes(String(rule.value1 ?? "").toLowerCase());
    case "top":
      return numeric && n >= topTh;
    case "bottom":
      return numeric && n <= bottomTh;
    case "duplicate":
      return text !== "" && (counts.get(text) ?? 0) > 1;
    case "unique":
      return text !== "" && (counts.get(text) ?? 0) === 1;
    default:
      return false;
  }
}
function applyColorScale(rule, cells, out) {
  if (cells.length === 0) return;
  const colors = rule.colors ?? ["#f8696b", "#ffeb84", "#63be7b"];
  const nums2 = cells.map((c) => c.n);
  const min = Math.min(...nums2), max = Math.max(...nums2);
  const range2 = max - min || 1;
  for (const c of cells) {
    const t = (c.n - min) / range2;
    const fill = colors.length >= 3 ? interpolate3(colors[0], colors[1], colors[2], t) : interpolate2(colors[0], colors[colors.length - 1], t);
    const cur = out.get(key(c.row, c.col)) ?? {};
    cur.fill = fill;
    out.set(key(c.row, c.col), cur);
  }
}
function applyDataBar(rule, cells, out) {
  if (cells.length === 0) return;
  const nums2 = cells.map((c) => c.n);
  const min = Math.min(0, ...nums2), max = Math.max(...nums2);
  const range2 = max - min || 1;
  const color = rule.barColor ?? "#638ec6";
  for (const c of cells) {
    const ratio = Math.max(0, Math.min(1, (c.n - min) / range2));
    const cur = out.get(key(c.row, c.col)) ?? {};
    cur.bar = { ratio, color };
    out.set(key(c.row, c.col), cur);
  }
}
function applyIconSet(rule, cells, out) {
  if (cells.length === 0) return;
  const set = rule.iconSet ?? "arrows";
  const nums2 = cells.map((c) => c.n).sort((a, b) => a - b);
  const t1 = nums2[Math.floor(nums2.length / 3)] ?? nums2[0];
  const t2 = nums2[Math.floor(2 * nums2.length / 3)] ?? nums2[nums2.length - 1];
  for (const c of cells) {
    const index = c.n >= t2 ? 2 : c.n >= t1 ? 1 : 0;
    const cur = out.get(key(c.row, c.col)) ?? {};
    cur.icon = { set, index };
    out.set(key(c.row, c.col), cur);
  }
}
function interpolate2(a, b, t) {
  const ca = hexToRgb(a), cb = hexToRgb(b);
  return rgbToHex(lerp(ca[0], cb[0], t), lerp(ca[1], cb[1], t), lerp(ca[2], cb[2], t));
}
function interpolate3(a, mid, b, t) {
  if (t <= 0.5) return interpolate2(a, mid, t / 0.5);
  return interpolate2(mid, b, (t - 0.5) / 0.5);
}
function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}
function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((x) => x + x).join("") : h;
  return [parseInt(full.slice(0, 2), 16) || 0, parseInt(full.slice(2, 4), 16) || 0, parseInt(full.slice(4, 6), 16) || 0];
}
function rgbToHex(r, g, b) {
  const h = (n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

// src/render/overlay/FloatingLayout.ts
function resolveObjectRect(anchor, getCellRect, zoom = 1) {
  const from = getCellRect(anchor.fromRow, anchor.fromCol);
  const to = getCellRect(anchor.toRow, anchor.toCol);
  const x1 = from.x + (anchor.fromDx ?? 0) * zoom;
  const y1 = from.y + (anchor.fromDy ?? 0) * zoom;
  const x2 = to.x + (anchor.toDx ?? 0) * zoom;
  const y2 = to.y + (anchor.toDy ?? 0) * zoom;
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
}
function hitObject(x, y, rect) {
  return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
}
function resizeHandles(rect) {
  const { x, y, width: w, height: h } = rect;
  const cx = x + w / 2, cy = y + h / 2, r = x + w, b = y + h;
  return [
    { name: "nw", x, y },
    { name: "n", x: cx, y },
    { name: "ne", x: r, y },
    { name: "e", x: r, y: cy },
    { name: "se", x: r, y: b },
    { name: "s", x: cx, y: b },
    { name: "sw", x, y: b },
    { name: "w", x, y: cy }
  ];
}
function hitHandle(x, y, rect, tol = 5) {
  for (const h of resizeHandles(rect)) {
    if (Math.abs(x - h.x) <= tol && Math.abs(y - h.y) <= tol) return h.name;
  }
  return null;
}
function commentMarker(cellRect) {
  const size = Math.min(7, cellRect.width * 0.4, cellRect.height * 0.5);
  return { x: cellRect.x + cellRect.width - size, y: cellRect.y, size };
}

// src/render/chart/drawChart.ts
var PALETTE = ["#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f", "#edc948", "#b07aa1", "#ff9da7"];
var LIGHT_CHART_THEME = {
  background: "#ffffff",
  border: "#d0d4da",
  title: "#333333",
  axis: "#c0c4ca",
  gridline: "#dde1e6",
  label: "#555555",
  legend: "#555555",
  neutralBand: "#e6e9ee",
  neutralLine: "#333333"
};
var DARK_CHART_THEME = {
  background: "#1e2228",
  border: "#3a3f45",
  title: "#e6e9ee",
  axis: "#5a616b",
  gridline: "#3a3f45",
  label: "#aab0b8",
  legend: "#aab0b8",
  neutralBand: "#3a3f45",
  neutralLine: "#c8ccd2"
};
function drawChart(ctx, rect, type, data, opts, theme = LIGHT_CHART_THEME) {
  ctx.fillStyle = theme.background;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  ctx.strokeStyle = theme.border;
  ctx.lineWidth = 1;
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1);
  const pad = 10;
  let top = rect.y + pad;
  if (data.title) {
    ctx.fillStyle = theme.title;
    ctx.font = "bold 12px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(data.title, rect.x + rect.width / 2, top);
    top += 18;
  }
  const legendH = opts?.legend && data.series.length ? 16 : 0;
  const plot = {
    x: rect.x + pad + 24,
    y: top,
    width: rect.width - pad * 2 - 24,
    height: rect.y + rect.height - pad - 16 - legendH - top
  };
  if (plot.width <= 0 || plot.height <= 0) return;
  switch (type) {
    case "pie":
      drawPie(ctx, plot, data, 0, theme);
      break;
    case "doughnut":
      drawPie(ctx, plot, data, opts?.holeRatio ?? 0.5, theme);
      break;
    case "bar":
      drawBars(ctx, plot, data, true, opts, theme);
      break;
    case "line":
      drawLine(ctx, plot, data, false, opts, theme);
      break;
    case "area":
      drawLine(ctx, plot, data, true, opts, theme);
      break;
    case "scatter":
      drawScatter(ctx, plot, data, false, opts, theme);
      break;
    case "bubble":
      drawScatter(ctx, plot, data, true, opts, theme);
      break;
    case "radar":
      drawRadar(ctx, plot, data, opts, theme);
      break;
    case "stock":
      drawStock(ctx, plot, data, theme);
      break;
    case "combo":
      drawCombo(ctx, plot, data, opts, theme);
      break;
    case "column":
    default:
      drawBars(ctx, plot, data, false, opts, theme);
      break;
  }
  if (opts?.legend && data.series.length) {
    drawLegend(ctx, { x: rect.x + pad, y: rect.y + rect.height - pad - legendH + 2, width: rect.width - pad * 2, height: legendH }, data, theme);
  }
}
function valueRange(data) {
  let min = 0, max = 0;
  for (const s of data.series) for (const v of s.values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (max === min) max = min + 1;
  return { min, max };
}
function valueRangeOf(series) {
  let min = 0, max = 0;
  for (const s of series) for (const v of s.values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (max === min) max = min + 1;
  return { min, max };
}
function drawBars(ctx, plot, data, horizontal, opts, theme) {
  const { min, max } = valueRange(data);
  const range2 = max - min;
  const nCat = data.categories.length || (data.series[0]?.values.length ?? 0);
  const nSer = data.series.length;
  if (nCat === 0 || nSer === 0) return;
  ctx.strokeStyle = theme.axis;
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (horizontal) {
    ctx.moveTo(plot.x, plot.y);
    ctx.lineTo(plot.x, plot.y + plot.height);
  } else {
    ctx.moveTo(plot.x, plot.y + plot.height);
    ctx.lineTo(plot.x + plot.width, plot.y + plot.height);
  }
  ctx.stroke();
  const groupSize = (horizontal ? plot.height : plot.width) / nCat;
  const barSize = groupSize * 0.8 / nSer;
  for (let ci = 0; ci < nCat; ci++) {
    for (let si = 0; si < nSer; si++) {
      const v = data.series[si].values[ci] ?? 0;
      ctx.fillStyle = PALETTE[si % PALETTE.length];
      if (horizontal) {
        const len = (v - 0) / (range2 || 1) * plot.width;
        const y = plot.y + ci * groupSize + groupSize * 0.1 + si * barSize;
        ctx.fillRect(plot.x, y, Math.max(0, len), barSize * 0.9);
        if (opts?.dataLabels) labelAt(ctx, String(v), plot.x + Math.max(0, len) + 2, y + barSize * 0.45, "left", theme);
      } else {
        const len = (v - 0) / (range2 || 1) * plot.height;
        const x = plot.x + ci * groupSize + groupSize * 0.1 + si * barSize;
        const yTop = plot.y + plot.height - Math.max(0, len);
        ctx.fillRect(x, yTop, barSize * 0.9, Math.max(0, len));
        if (opts?.dataLabels) labelAt(ctx, String(v), x + barSize * 0.45, yTop - 6, "center", theme);
      }
    }
  }
}
function drawLine(ctx, plot, data, fillArea, opts, theme) {
  const { min, max } = valueRange(data);
  const range2 = max - min || 1;
  const nCat = data.categories.length || (data.series[0]?.values.length ?? 0);
  if (nCat === 0) return;
  const stepX = nCat > 1 ? plot.width / (nCat - 1) : plot.width;
  const yOf = (v) => plot.y + plot.height - (v - min) / range2 * plot.height;
  for (let si = 0; si < data.series.length; si++) {
    const s = data.series[si];
    const color = PALETTE[si % PALETTE.length];
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < nCat; i++) {
      const x = plot.x + i * stepX, y = yOf(s.values[i] ?? 0);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    if (fillArea) {
      ctx.lineTo(plot.x + (nCat - 1) * stepX, plot.y + plot.height);
      ctx.lineTo(plot.x, plot.y + plot.height);
      ctx.closePath();
      const prev = ctx.globalAlpha ?? 1;
      ctx.globalAlpha = 0.25;
      ctx.fill();
      ctx.globalAlpha = prev;
    }
    if (opts?.dataLabels) for (let i = 0; i < nCat; i++) labelAt(ctx, String(s.values[i] ?? 0), plot.x + i * stepX, yOf(s.values[i] ?? 0) - 6, "center", theme);
    if (opts?.trendline) drawTrendline(ctx, plot, s.values, min, range2, opts.trendline, color);
  }
}
function drawPie(ctx, plot, data, holeRatio, theme) {
  const s = data.series[0];
  if (!s) return;
  const total = s.values.reduce((a, b) => a + Math.max(0, b), 0) || 1;
  const cx = plot.x + plot.width / 2, cy = plot.y + plot.height / 2;
  const r = Math.min(plot.width, plot.height) / 2 - 4;
  let a0 = -Math.PI / 2;
  for (let i = 0; i < s.values.length; i++) {
    const frac = Math.max(0, s.values[i] ?? 0) / total;
    const a1 = a0 + frac * Math.PI * 2;
    ctx.fillStyle = PALETTE[i % PALETTE.length];
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, a0, a1);
    ctx.closePath();
    ctx.fill();
    a0 = a1;
  }
  if (holeRatio > 0) {
    ctx.fillStyle = theme.background;
    ctx.beginPath();
    ctx.arc(cx, cy, r * Math.min(0.9, holeRatio), 0, Math.PI * 2);
    ctx.closePath();
    ctx.fill();
  }
}
function drawScatter(ctx, plot, data, bubble, opts, theme) {
  const xs = data.series[0]?.values ?? [];
  const ys = data.series[1]?.values ?? [];
  const sizes = bubble ? data.series[2]?.values ?? [] : [];
  const n = Math.min(xs.length, ys.length);
  if (n === 0) return;
  const xr = rangeOf(xs), yr = rangeOf(ys);
  const sr = bubble ? rangeOf(sizes) : { min: 0, max: 1 };
  ctx.strokeStyle = theme.axis;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(plot.x, plot.y);
  ctx.lineTo(plot.x, plot.y + plot.height);
  ctx.lineTo(plot.x + plot.width, plot.y + plot.height);
  ctx.stroke();
  const xOf = (v) => plot.x + (v - xr.min) / (xr.max - xr.min || 1) * plot.width;
  const yOf = (v) => plot.y + plot.height - (v - yr.min) / (yr.max - yr.min || 1) * plot.height;
  ctx.fillStyle = PALETTE[0];
  const prev = ctx.globalAlpha ?? 1;
  for (let i = 0; i < n; i++) {
    const x = xOf(xs[i]), y = yOf(ys[i]);
    let r = 3;
    if (bubble) {
      const sv = sizes[i] ?? 0;
      r = 3 + (sv - sr.min) / (sr.max - sr.min || 1) * 12;
      ctx.globalAlpha = 0.5;
    }
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fill();
    if (opts?.dataLabels) {
      ctx.globalAlpha = prev;
      labelAt(ctx, `(${xs[i]},${ys[i]})`, x + r + 2, y, "left", theme);
    }
  }
  ctx.globalAlpha = prev;
  if (opts?.trendline === "linear" && !bubble) drawScatterTrend(ctx, plot, xs, ys, xr, yr, theme);
}
function drawRadar(ctx, plot, data, opts, theme) {
  const nAxis = data.categories.length || (data.series[0]?.values.length ?? 0);
  if (nAxis < 3) return;
  const { max } = valueRange(data);
  const cx = plot.x + plot.width / 2, cy = plot.y + plot.height / 2;
  const R = Math.min(plot.width, plot.height) / 2 - 8;
  const angleOf = (i) => -Math.PI / 2 + i / nAxis * Math.PI * 2;
  ctx.strokeStyle = theme.gridline;
  ctx.lineWidth = 1;
  for (let ring = 1; ring <= 3; ring++) {
    const rr = R * ring / 3;
    ctx.beginPath();
    for (let i = 0; i <= nAxis; i++) {
      const a = angleOf(i % nAxis);
      const x = cx + rr * Math.cos(a), y = cy + rr * Math.sin(a);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  for (let i = 0; i < nAxis; i++) {
    const a = angleOf(i);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + R * Math.cos(a), cy + R * Math.sin(a));
    ctx.stroke();
  }
  for (let si = 0; si < data.series.length; si++) {
    const s = data.series[si];
    const color = PALETTE[si % PALETTE.length];
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < nAxis; i++) {
      const rr = Math.max(0, s.values[i] ?? 0) / (max || 1) * R;
      const a = angleOf(i);
      const x = cx + rr * Math.cos(a), y = cy + rr * Math.sin(a);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
    const prev = ctx.globalAlpha ?? 1;
    ctx.globalAlpha = 0.15;
    ctx.fill();
    ctx.globalAlpha = prev;
  }
  void opts;
}
function drawStock(ctx, plot, data, theme) {
  const open = data.series[0]?.values ?? [];
  const high = data.series[1]?.values ?? [];
  const low = data.series[2]?.values ?? [];
  const close = data.series[3]?.values ?? [];
  const n = Math.min(open.length, high.length, low.length, close.length);
  if (n === 0) return;
  let lo = Infinity, hi = -Infinity;
  for (const arr of [open, high, low, close]) for (const v of arr) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (!Number.isFinite(lo)) return;
  if (hi === lo) hi = lo + 1;
  ctx.strokeStyle = theme.axis;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(plot.x, plot.y + plot.height);
  ctx.lineTo(plot.x + plot.width, plot.y + plot.height);
  ctx.stroke();
  const step = plot.width / n;
  const yOf = (v) => plot.y + plot.height - (v - lo) / (hi - lo) * plot.height;
  for (let i = 0; i < n; i++) {
    const cx = plot.x + i * step + step / 2;
    const up = (close[i] ?? 0) >= (open[i] ?? 0);
    ctx.strokeStyle = up ? "#59a14f" : "#e15759";
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, yOf(high[i] ?? 0));
    ctx.lineTo(cx, yOf(low[i] ?? 0));
    ctx.stroke();
    const yo = yOf(open[i] ?? 0), yc = yOf(close[i] ?? 0);
    const bodyTop = Math.min(yo, yc), bodyH = Math.max(2, Math.abs(yc - yo));
    ctx.fillRect(cx - step * 0.3, bodyTop, step * 0.6, bodyH);
  }
}
function drawCombo(ctx, plot, data, opts, theme) {
  const nCat = data.categories.length || (data.series[0]?.values.length ?? 0);
  const nSer = data.series.length;
  if (nCat === 0 || nSer === 0) return;
  const secSet = new Set(opts?.secondaryAxis ?? []);
  const primSeries = data.series.filter((_, i) => !secSet.has(i));
  const secSeries = data.series.filter((_, i) => secSet.has(i));
  const pr = valueRangeOf(primSeries.length ? primSeries : data.series);
  const sr = secSeries.length ? valueRangeOf(secSeries) : pr;
  ctx.strokeStyle = theme.axis;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(plot.x, plot.y + plot.height);
  ctx.lineTo(plot.x + plot.width, plot.y + plot.height);
  ctx.stroke();
  const groupSize = plot.width / nCat;
  const colCount = data.series.filter((_, i) => (opts?.seriesTypes?.[i] ?? (i % 2 === 0 ? "column" : "line")) === "column").length || 1;
  const barSize = groupSize * 0.7 / colCount;
  let colIdx = 0;
  for (let si = 0; si < nSer; si++) {
    const s = data.series[si];
    const kind = opts?.seriesTypes?.[si] ?? (si % 2 === 0 ? "column" : "line");
    const useSec = secSet.has(si);
    const rng = useSec ? sr : pr;
    const yOf = (v) => plot.y + plot.height - (v - rng.min) / (rng.max - rng.min || 1) * plot.height;
    ctx.fillStyle = PALETTE[si % PALETTE.length];
    ctx.strokeStyle = ctx.fillStyle;
    if (kind === "column") {
      for (let ci = 0; ci < nCat; ci++) {
        const v = s.values[ci] ?? 0;
        const x = plot.x + ci * groupSize + groupSize * 0.15 + colIdx * barSize;
        const yt = yOf(v);
        ctx.fillRect(x, yt, barSize * 0.9, plot.y + plot.height - yt);
      }
      colIdx++;
    } else {
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let ci = 0; ci < nCat; ci++) {
        const x = plot.x + ci * groupSize + groupSize / 2, y = yOf(s.values[ci] ?? 0);
        if (ci === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
}
function drawLegend(ctx, box, data, theme) {
  ctx.font = "10px Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  let x = box.x;
  const y = box.y + box.height / 2;
  for (let si = 0; si < data.series.length; si++) {
    ctx.fillStyle = PALETTE[si % PALETTE.length];
    ctx.fillRect(x, y - 4, 9, 9);
    x += 12;
    ctx.fillStyle = theme.legend;
    const name = data.series[si].name || `\u7CFB\u5217${si + 1}`;
    ctx.fillText(name, x, y);
    x += (ctx.measureText?.(name).width ?? name.length * 6) + 12;
  }
}
function labelAt(ctx, text, x, y, align, theme) {
  ctx.fillStyle = theme.label;
  ctx.font = "9px Arial, sans-serif";
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y);
}
function drawTrendline(ctx, plot, values, min, range2, kind, color) {
  const n = values.length;
  if (n < 2) return;
  const stepX = n > 1 ? plot.width / (n - 1) : plot.width;
  const yOf = (v) => plot.y + plot.height - (v - min) / range2 * plot.height;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (kind === "linear") {
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let i = 0; i < n; i++) {
      sx += i;
      sy += values[i];
      sxx += i * i;
      sxy += i * values[i];
    }
    const b = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1);
    const a = (sy - b * sx) / n;
    ctx.moveTo(plot.x, yOf(a));
    ctx.lineTo(plot.x + (n - 1) * stepX, yOf(a + b * (n - 1)));
  } else {
    let started = false;
    for (let i = 0; i < n; i++) {
      const lo = Math.max(0, i - 1), hi = Math.min(n - 1, i + 1);
      let sum = 0;
      for (let k = lo; k <= hi; k++) sum += values[k];
      const avg = sum / (hi - lo + 1);
      const x = plot.x + i * stepX, y = yOf(avg);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
}
function drawScatterTrend(ctx, plot, xs, ys, xr, yr, theme) {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i];
    sy += ys[i];
    sxx += xs[i] * xs[i];
    sxy += xs[i] * ys[i];
  }
  const b = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1);
  const a = (sy - b * sx) / n;
  const xOf = (v) => plot.x + (v - xr.min) / (xr.max - xr.min || 1) * plot.width;
  const yOf = (v) => plot.y + plot.height - (v - yr.min) / (yr.max - yr.min || 1) * plot.height;
  ctx.strokeStyle = theme.neutralLine;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(xOf(xr.min), yOf(a + b * xr.min));
  ctx.lineTo(xOf(xr.max), yOf(a + b * xr.max));
  ctx.stroke();
}
function rangeOf(arr) {
  if (arr.length === 0) return { min: 0, max: 1 };
  let min = Infinity, max = -Infinity;
  for (const v of arr) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (min === max) {
    min -= 0.5;
    max += 0.5;
  }
  return { min, max };
}

// src/render/chart/drawSparkline.ts
var DEFAULT_COLOR = "#3b6cff";
var DEFAULT_NEG = "#e15759";
var MINI_PALETTE = ["#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f", "#edc948"];
function drawSparkline(ctx, rect, spec, values, theme = LIGHT_CHART_THEME) {
  const pad = 2;
  const r = { x: rect.x + pad, y: rect.y + pad, width: rect.width - pad * 2, height: rect.height - pad * 2 };
  if (r.width <= 1 || r.height <= 1 || values.length === 0) return;
  const color = spec.color || DEFAULT_COLOR;
  const neg = spec.negativeColor || DEFAULT_NEG;
  switch (spec.type) {
    case "line":
      sparkLine(ctx, r, values, color, false, spec);
      break;
    case "area":
      sparkLine(ctx, r, values, color, true, spec);
      break;
    case "column":
      sparkColumn(ctx, r, values, color, neg, false);
      break;
    case "winloss":
      sparkColumn(ctx, r, values, color, neg, true);
      break;
    case "bar":
      sparkBar(ctx, r, values, color);
      break;
    case "pie":
      sparkPie(ctx, r, values);
      break;
    case "bullet":
      sparkBullet(ctx, r, values, color, spec.target, theme);
      break;
  }
}
function range(values) {
  let min = Infinity, max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min)) return { min: 0, max: 1 };
  if (min === max) {
    min -= 0.5;
    max += 0.5;
  }
  return { min, max };
}
function sparkLine(ctx, r, values, color, fill, spec) {
  const { min, max } = range(values);
  const n = values.length;
  const stepX = n > 1 ? r.width / (n - 1) : r.width;
  const yOf = (v) => r.y + r.height - (v - min) / (max - min || 1) * r.height;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const x = r.x + i * stepX, y = yOf(values[i]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  if (fill) {
    ctx.lineTo(r.x + (n - 1) * stepX, r.y + r.height);
    ctx.lineTo(r.x, r.y + r.height);
    ctx.closePath();
    const prev = ctx.globalAlpha ?? 1;
    ctx.globalAlpha = 0.2;
    ctx.fill();
    ctx.globalAlpha = prev;
  }
  if (spec.markers || spec.highLow || spec.firstLast) {
    let hiIdx = 0, loIdx = 0;
    for (let i = 1; i < n; i++) {
      if (values[i] > values[hiIdx]) hiIdx = i;
      if (values[i] < values[loIdx]) loIdx = i;
    }
    for (let i = 0; i < n; i++) {
      const isHi = i === hiIdx, isLo = i === loIdx, isEnd = i === 0 || i === n - 1;
      const show = spec.markers || spec.highLow && (isHi || isLo) || spec.firstLast && isEnd;
      if (!show) continue;
      ctx.fillStyle = isHi ? "#59a14f" : isLo ? "#e15759" : color;
      const x = r.x + i * stepX, y = yOf(values[i]);
      ctx.beginPath();
      ctx.arc(x, y, 1.6, 0, Math.PI * 2);
      ctx.closePath();
      ctx.fill();
    }
  }
}
function sparkColumn(ctx, r, values, color, neg, winloss) {
  const n = values.length;
  const bw = r.width / n;
  if (winloss) {
    const h = r.height * 0.4;
    for (let i = 0; i < n; i++) {
      const v = values[i];
      ctx.fillStyle = v < 0 ? neg : color;
      const x = r.x + i * bw + bw * 0.1;
      const w = bw * 0.8;
      if (v > 0) ctx.fillRect(x, r.y + r.height / 2 - h, w, h);
      else if (v < 0) ctx.fillRect(x, r.y + r.height / 2, w, h);
    }
    return;
  }
  const { min, max } = range(values);
  const axMin = Math.min(0, min);
  const axMax = Math.max(0, max);
  const span = axMax - axMin || 1;
  const yOf = (v) => r.y + r.height - (v - axMin) / span * r.height;
  const zero = yOf(0);
  const bottom = r.y + r.height;
  for (let i = 0; i < n; i++) {
    const v = values[i];
    ctx.fillStyle = v < 0 ? neg : color;
    const x = r.x + i * bw + bw * 0.1;
    const w = bw * 0.8;
    const yv = yOf(v);
    let top = Math.min(yv, zero);
    let h = Math.abs(yv - zero);
    if (h < 1) {
      h = 1;
      if (top + h > bottom) top = bottom - h;
    }
    ctx.fillRect(x, top, w, h);
  }
}
function sparkBar(ctx, r, values, color) {
  const n = values.length;
  const bh = r.height / n;
  const { max } = range(values.map((v) => Math.abs(v)));
  for (let i = 0; i < n; i++) {
    const v = Math.abs(values[i]);
    ctx.fillStyle = color;
    const y = r.y + i * bh + bh * 0.1;
    ctx.fillRect(r.x, y, Math.max(1, v / (max || 1) * r.width), bh * 0.8);
  }
}
function sparkPie(ctx, r, values) {
  const total = values.reduce((a, b) => a + Math.max(0, b), 0) || 1;
  const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
  const rad = Math.min(r.width, r.height) / 2 - 1;
  let a0 = -Math.PI / 2;
  for (let i = 0; i < values.length; i++) {
    const frac = Math.max(0, values[i]) / total;
    const a1 = a0 + frac * Math.PI * 2;
    ctx.fillStyle = MINI_PALETTE[i % MINI_PALETTE.length];
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, rad, a0, a1);
    ctx.closePath();
    ctx.fill();
    a0 = a1;
  }
}
function sparkBullet(ctx, r, values, color, target, theme) {
  const actual = values[values.length - 1] ?? 0;
  const scaleMax = Math.max(actual, target ?? 0, ...values) || 1;
  ctx.fillStyle = theme.neutralBand;
  ctx.fillRect(r.x, r.y + r.height * 0.25, r.width, r.height * 0.5);
  ctx.fillStyle = color;
  ctx.fillRect(r.x, r.y + r.height * 0.35, actual / scaleMax * r.width, r.height * 0.3);
  if (target !== void 0) {
    ctx.strokeStyle = theme.neutralLine;
    ctx.lineWidth = 1.5;
    const tx = r.x + target / scaleMax * r.width;
    ctx.beginPath();
    ctx.moveTo(tx, r.y + r.height * 0.15);
    ctx.lineTo(tx, r.y + r.height * 0.85);
    ctx.stroke();
  }
}

// src/render/SheetRenderer.ts
var LIGHT_THEME = {
  gridline: "#e2e6ec",
  headerBack: "#f4f5f8",
  headerFore: "#3a3f45",
  headerLine: "#c8ccd2",
  headerActiveBack: "#cfe0fb",
  headerActiveFore: "#0a3d7a",
  sheetBack: "#ffffff",
  cellFore: "#1c2126",
  selectionBorder: "#0a6ed1",
  selectionFill: "rgba(10,110,209,0.14)",
  outlineBack: "#eef1f6",
  outlineLine: "#9aa3b0",
  outlineButtonBack: "#ffffff",
  outlineButtonFore: "#3a3f45",
  scrollbarTrack: "#f0f1f4",
  scrollbarThumb: "#c1c6cf",
  freezeLine: "#8a9099"
};
var DARK_THEME = {
  gridline: "#3a3f45",
  headerBack: "#2a2f36",
  headerFore: "#c8ccd2",
  headerLine: "#4a5058",
  headerActiveBack: "#1e4a5a",
  headerActiveFore: "#8fe0f0",
  sheetBack: "#1e2228",
  cellFore: "#e6e9ee",
  selectionBorder: "#2ea8c8",
  selectionFill: "rgba(0,166,200,0.22)",
  outlineBack: "#171a1f",
  outlineLine: "#5a6470",
  outlineButtonBack: "#2a2f36",
  outlineButtonFore: "#c8ccd2",
  scrollbarTrack: "#22262c",
  scrollbarThumb: "#454c56",
  freezeLine: "#6b7480"
};
var DEFAULT_FONT_PX = 13;
var DEFAULT_FONT_FAMILY = "Arial, sans-serif";
var SheetRenderer = class {
  constructor(sheet, geometry) {
    this.sheet = sheet;
    this.geometry = geometry;
  }
  theme = LIGHT_THEME;
  /** 图表/迷你图「外框」配色（背景/边框/坐标轴/标签…）。由 element 随 setTheme 同步为 LIGHT/DARK_CHART_THEME。 */
  chartTheme = LIGHT_CHART_THEME;
  showGridlines = true;
  showHeaders = true;
  /** 是否画自动填充手柄（选区右下角小方块）。M10。 */
  showFillHandle = true;
  /** 当前条件格式叠加（render 时算一次；null=无规则）。M13。 */
  condOverlays = null;
  /** 图片缓存（src → HTMLImageElement，由 element 注入；M14）。 */
  imageCache = null;
  /** 当前选中的浮动对象 id（画选框 + 句柄；M14）。 */
  selectedObjectId = null;
  /** 当前滚动条布局（由 element 每帧 resolveScrollbars 后注入；null=不画）。 */
  scrollbars = null;
  /**
   * 全量重绘可见区域。paintSuspended 为 true 时跳过（对齐 suspendPaint 语义）。
   * @param paintSuspended 由 Workbook.isPaintSuspended 传入
   */
  render(ctx, paintSuspended = false) {
    if (paintSuspended) return;
    const vp = this.geometry.viewport;
    ctx.fillStyle = this.theme.sheetBack;
    ctx.fillRect(0, 0, vp.width, vp.height);
    const rules = this.sheet.listConditionalRules();
    this.condOverlays = rules.length ? evaluateRules(this.sheet, rules) : null;
    const geo = this.geometry;
    const fr = geo.frozenRows();
    const fc = geo.frozenCols();
    const tr = geo.trailingRows();
    const tc = geo.trailingCols();
    const sTop = geo.getViewportTopRow();
    const sBot = geo.getViewportBottomRow();
    const sLeft = geo.getViewportLeftColumn();
    const sRight = geo.getViewportRightColumn();
    if (fr === 0 && fc === 0 && tr === 0 && tc === 0) {
      this.drawBody(ctx, sTop, sBot, sLeft, sRight);
    } else {
      const lineX = geo.freezeLineX();
      const lineY = geo.freezeLineY();
      const trailX = tc > 0 ? geo.trailingLineX() : vp.width;
      const trailY = tr > 0 ? geo.trailingLineY() : vp.height;
      const rowBands = [
        fr > 0 ? { range: { first: 0, last: fr - 1 }, y0: vp.topOffset, y1: lineY } : null,
        // 头冻结行
        { range: { first: sTop, last: sBot }, y0: lineY, y1: trailY },
        // 滚动行
        tr > 0 ? { range: geo.trailingRowRange(), y0: trailY, y1: vp.height } : null
        // 尾冻结行
      ];
      const colBands = [
        fc > 0 ? { range: { first: 0, last: fc - 1 }, x0: vp.leftOffset, x1: lineX } : null,
        // 头冻结列
        { range: { first: sLeft, last: sRight }, x0: lineX, x1: trailX },
        // 滚动列
        tc > 0 ? { range: geo.trailingColRange(), x0: trailX, x1: vp.width } : null
        // 尾冻结列
      ];
      for (const rb of rowBands) {
        if (!rb) continue;
        for (const cb of colBands) {
          if (!cb) continue;
          this.drawQuadrant(ctx, rb.range, cb.range, cb.x0, rb.y0, cb.x1, rb.y1);
        }
      }
    }
    this.drawSelection(ctx);
    this.drawFloatingObjects(ctx);
    this.drawCommentMarkers(ctx);
    if (this.showHeaders) this.drawHeaders(ctx, sTop, sBot, sLeft, sRight);
    this.drawOutlines(ctx);
    if (fr > 0 || fc > 0 || tr > 0 || tc > 0) this.drawFreezeLines(ctx);
    this.drawScrollbars(ctx);
  }
  /** 画一个象限的格+网格线+合并（clip 到屏幕矩形，防止越界漫画到相邻带）。 */
  drawQuadrant(ctx, rowRange, colRange, clipX, clipY, clipRight, clipBottom) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(clipX, clipY, Math.max(0, clipRight - clipX), Math.max(0, clipBottom - clipY));
    ctx.clip();
    this.drawBody(ctx, rowRange.first, rowRange.last, colRange.first, colRange.last);
    ctx.restore();
  }
  /** 一个矩形范围的格+网格线+合并（象限共用）。 */
  drawBody(ctx, top, bottom, left, right) {
    if (this.showGridlines) this.drawGridlines(ctx, top, bottom, left, right);
    this.drawCells(ctx, top, bottom, left, right);
    this.drawSpans(ctx, top, bottom, left, right);
  }
  /** 冻结分界线（比网格线粗/深）。M19 加尾冻结线；M19-step2 拆分模式画粗拆分条。 */
  drawFreezeLines(ctx) {
    const geo = this.geometry;
    const vp = geo.viewport;
    ctx.strokeStyle = this.theme.freezeLine;
    ctx.lineWidth = 1.5;
    if (geo.frozenCols() > 0) {
      const x = geo.freezeLineX();
      if (vp.splitCol) this.drawSplitBar(ctx, "col", x);
      else {
        const xr = Math.round(x) + 0.5;
        ctx.beginPath();
        ctx.moveTo(xr, vp.colOutlineHeight);
        ctx.lineTo(xr, vp.height);
        ctx.stroke();
      }
    }
    if (geo.frozenRows() > 0) {
      const y = geo.freezeLineY();
      if (vp.splitRow) this.drawSplitBar(ctx, "row", y);
      else {
        const yr = Math.round(y) + 0.5;
        ctx.beginPath();
        ctx.moveTo(vp.rowOutlineWidth, yr);
        ctx.lineTo(vp.width, yr);
        ctx.stroke();
      }
    }
    ctx.strokeStyle = this.theme.freezeLine;
    ctx.lineWidth = 1.5;
    if (geo.trailingCols() > 0) {
      const x = Math.round(geo.trailingLineX()) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, vp.colOutlineHeight);
      ctx.lineTo(x, vp.height);
      ctx.stroke();
    }
    if (geo.trailingRows() > 0) {
      const y = Math.round(geo.trailingLineY()) + 0.5;
      ctx.beginPath();
      ctx.moveTo(vp.rowOutlineWidth, y);
      ctx.lineTo(vp.width, y);
      ctx.stroke();
    }
  }
  /** M19-step2 拆分条：3px 粗浅带 + 中缝深线 + 抓握点（可拖，比冻结细线醒目）。 */
  drawSplitBar(ctx, axis, pos) {
    const vp = this.geometry.viewport;
    const half = 2;
    const p = Math.round(pos);
    if (axis === "col") {
      const y0 = vp.colOutlineHeight, y1 = vp.height;
      ctx.fillStyle = this.theme.headerBack;
      ctx.fillRect(p - half, y0, half * 2, y1 - y0);
      ctx.strokeStyle = this.theme.freezeLine;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p - half + 0.5, y0);
      ctx.lineTo(p - half + 0.5, y1);
      ctx.moveTo(p + half - 0.5, y0);
      ctx.lineTo(p + half - 0.5, y1);
      ctx.stroke();
      ctx.fillStyle = this.theme.freezeLine;
      const cy = (y0 + y1) / 2;
      for (const dy of [-6, 0, 6]) ctx.fillRect(p - 1, cy + dy - 1, 2, 2);
    } else {
      const x0 = vp.rowOutlineWidth, x1 = vp.width;
      ctx.fillStyle = this.theme.headerBack;
      ctx.fillRect(x0, p - half, x1 - x0, half * 2);
      ctx.strokeStyle = this.theme.freezeLine;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0, p - half + 0.5);
      ctx.lineTo(x1, p - half + 0.5);
      ctx.moveTo(x0, p + half - 0.5);
      ctx.lineTo(x1, p + half - 0.5);
      ctx.stroke();
      ctx.fillStyle = this.theme.freezeLine;
      const cx = (x0 + x1) / 2;
      for (const dx of [-6, 0, 6]) ctx.fillRect(cx + dx - 1, p - 1, 2, 2);
    }
  }
  /** 浮动对象叠加层（M14）：图片/图表/形状，位置经 getCellRect 锚定（滚动/缩放/冻结跟随）。 */
  drawFloatingObjects(ctx) {
    const objs = this.sheet.listFloatingObjects();
    if (objs.length === 0) return;
    const geo = this.geometry;
    const vp = geo.viewport;
    const getRect = (r, c) => geo.getCellRect(r, c);
    ctx.save();
    ctx.beginPath();
    ctx.rect(vp.leftOffset, vp.topOffset, Math.max(0, vp.width - vp.leftOffset), Math.max(0, vp.height - vp.topOffset));
    ctx.clip();
    for (const obj of objs) {
      const rect = resolveObjectRect(obj.anchor, getRect, vp.zoom);
      if (rect.width <= 0 || rect.height <= 0) continue;
      if (obj.kind === "image") this.drawFloatImage(ctx, obj, rect);
      else if (obj.kind === "chart" && obj.chart) drawChart(ctx, rect, obj.chart.chartType, this.buildChartData(obj.chart), obj.chart.options, this.chartTheme);
      else if (obj.kind === "shape") this.drawShape(ctx, obj, rect);
      if (obj.id === this.selectedObjectId) this.drawObjectSelection(ctx, rect);
    }
    ctx.restore();
  }
  drawFloatImage(ctx, obj, rect) {
    const img = obj.src ? this.imageCache?.get(obj.src) : void 0;
    if (img && typeof ctx.drawImage === "function") {
      try {
        ctx.drawImage(img, rect.x, rect.y, rect.width, rect.height);
        return;
      } catch {
      }
    }
    ctx.fillStyle = "#eef0f3";
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    ctx.strokeStyle = "#c0c4ca";
    ctx.lineWidth = 1;
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1);
  }
  drawShape(ctx, obj, rect) {
    const sh = obj.shape;
    if (!sh) return;
    ctx.fillStyle = sh.fill ?? "rgba(90,140,230,0.25)";
    ctx.strokeStyle = sh.stroke ?? "#5a8ce6";
    ctx.lineWidth = 1.5;
    if (sh.type === "ellipse") {
      ctx.beginPath();
      ctx.arc(rect.x + rect.width / 2, rect.y + rect.height / 2, Math.min(rect.width, rect.height) / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (sh.type === "line") {
      ctx.beginPath();
      ctx.moveTo(rect.x, rect.y);
      ctx.lineTo(rect.x + rect.width, rect.y + rect.height);
      ctx.stroke();
    } else {
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
      ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1);
    }
  }
  drawObjectSelection(ctx, rect) {
    ctx.strokeStyle = this.theme.selectionBorder;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
    ctx.fillStyle = "#ffffff";
    for (const h of resizeHandles(rect)) {
      ctx.fillRect(h.x - 3, h.y - 3, 6, 6);
      ctx.strokeRect(h.x - 3, h.y - 3, 6, 6);
    }
  }
  /** 从图表数据源区域取数（随格值重算刷新）。firstRowHeader/firstColHeader 拆表头/标签。 */
  buildChartData(spec) {
    const g = spec.dataRange;
    const rowHdr = spec.firstRowHeader ?? true;
    const colHdr = spec.firstColHeader ?? true;
    const categories = [];
    const series = [];
    const dataR0 = g.row + (rowHdr ? 1 : 0);
    const dataC0 = g.col + (colHdr ? 1 : 0);
    for (let r = dataR0; r < g.row + g.rowCount; r++) categories.push(String(this.sheet.getValue(r, g.col) ?? ""));
    for (let c = dataC0; c < g.col + g.colCount; c++) {
      const name = rowHdr ? String(this.sheet.getValue(g.row, c) ?? `\u5217${c}`) : `\u5217${c}`;
      const values = [];
      for (let r = dataR0; r < g.row + g.rowCount; r++) {
        const v = this.sheet.getValue(r, c);
        values.push(typeof v === "number" ? v : Number(v) || 0);
      }
      series.push({ name, values });
    }
    const out = { categories, series };
    if (spec.title) out.title = spec.title;
    return out;
  }
  /** 单元格批注三角标记（M14）：格右上角红三角。 */
  drawCommentMarkers(ctx) {
    const comments = this.sheet.listComments();
    if (comments.length === 0) return;
    const geo = this.geometry;
    const vp = geo.viewport;
    const top = geo.getViewportTopRow(), bottom = geo.getViewportBottomRow();
    const left = geo.getViewportLeftColumn(), right = geo.getViewportRightColumn();
    for (const { row, col } of comments) {
      const inFrozenRow = row < geo.frozenRows(), inFrozenCol = col < geo.frozenCols();
      const rowVis = inFrozenRow || row >= top && row <= bottom;
      const colVis = inFrozenCol || col >= left && col <= right;
      if (!rowVis || !colVis) continue;
      const rect = geo.getCellRect(row, col);
      const m = commentMarker(rect);
      ctx.fillStyle = "#d13438";
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(m.x + m.size, m.y);
      ctx.lineTo(m.x + m.size, m.y + m.size);
      ctx.closePath();
      ctx.fill();
    }
  }
  drawCells(ctx, top, bottom, left, right) {
    for (let r = top; r <= bottom; r++) {
      if (!this.sheet.isRowVisible(r)) continue;
      for (let c = left; c <= right; c++) {
        if (!this.sheet.isColumnVisible(c)) continue;
        if (this.sheet.getSpan(r, c)) continue;
        this.drawCell(ctx, r, c, 1, 1);
      }
    }
  }
  drawCell(ctx, row, col, rowSpan, colSpan) {
    const rect = this.geometry.getCellRect(row, col, rowSpan, colSpan);
    let style = this.sheet.getResolvedStyle(row, col);
    const overlay = this.condOverlays?.get(`${row},${col}`);
    if (overlay?.style) style = { ...style, ...overlay.style };
    if (overlay?.fill) {
      ctx.fillStyle = overlay.fill;
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    } else {
      this.paintCellBackground(ctx, rect, style);
    }
    const raw = this.sheet.getValue(row, col);
    if (style.cellType === "checkbox") {
      this.drawCheckbox(ctx, rect, raw === true || raw === "TRUE" || raw === 1);
      if (style.borders) this.drawCellBorders(ctx, rect, style.borders);
      return;
    }
    if (overlay?.bar) this.drawDataBar(ctx, rect, overlay.bar);
    let textInset = 0;
    if (overlay?.icon) {
      this.drawIcon(ctx, rect, overlay.icon);
      textInset = Math.min(18, rect.height);
    }
    const link = this.sheet.getHyperlink(row, col);
    const rich = this.sheet.getRichText(row, col);
    if (rich && rich.runs.length) {
      this.drawRichText(ctx, rich, rect, style);
      const dv = this.sheet.getValidationAt(row, col);
      if (dv && dv.type === "list" && dv.list?.length) this.drawCellDropdownArrow(ctx, rect);
      if (style.borders) this.drawCellBorders(ctx, rect, style.borders);
      return;
    }
    const textRect = textInset > 0 ? { x: rect.x + textInset, y: rect.y, width: rect.width - textInset, height: rect.height } : rect;
    const { text, color } = formatCell(raw, style.formatter);
    if (text !== "") {
      const linkStyle = link ? { ...style, foreColor: "#0563c1", underline: true } : style;
      const needClip = !style.wordWrap && !style.shrinkToFit;
      if (needClip && ctx.save && ctx.clip && ctx.rect) {
        const clip = this.overflowClipRect(row, col, textRect, style);
        ctx.save();
        ctx.beginPath();
        ctx.rect(clip.x, clip.y, clip.width, clip.height);
        ctx.clip();
        this.drawCellText(ctx, text, textRect, linkStyle, link ? "#0563c1" : color);
        ctx.restore();
      } else {
        this.drawCellText(ctx, text, textRect, linkStyle, link ? "#0563c1" : color);
      }
    }
    const rule = this.sheet.getValidationAt(row, col);
    if (rule && rule.type === "list" && rule.list?.length) {
      this.drawCellDropdownArrow(ctx, rect);
    }
    const spark = this.sheet.getSparkline(row, col);
    if (spark) drawSparkline(ctx, rect, spark, this.sparklineValues(spark.dataRange), this.chartTheme);
    if (style.borders) this.drawCellBorders(ctx, rect, style.borders);
  }
  /** 从单行/单列区域抽取迷你图数值序列（非数值→0）。 */
  sparklineValues(g) {
    const out = [];
    for (let r = g.row; r < g.row + g.rowCount; r++) {
      for (let c = g.col; c < g.col + g.colCount; c++) {
        const v = this.sheet.getValue(r, c);
        out.push(typeof v === "number" ? v : Number(v) || 0);
      }
    }
    return out;
  }
  /** 复选框绘制（M12）：居中方框，选中画勾。 */
  drawCheckbox(ctx, rect, checked) {
    const box = checkboxBox(rect);
    ctx.strokeStyle = this.theme.headerLine;
    ctx.lineWidth = 1;
    ctx.strokeRect(box.x + 0.5, box.y + 0.5, box.size - 1, box.size - 1);
    if (checked) {
      ctx.fillStyle = this.theme.selectionBorder;
      ctx.fillRect(box.x + 1, box.y + 1, box.size - 2, box.size - 2);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(box.x + box.size * 0.24, box.y + box.size * 0.52);
      ctx.lineTo(box.x + box.size * 0.42, box.y + box.size * 0.7);
      ctx.lineTo(box.x + box.size * 0.76, box.y + box.size * 0.3);
      ctx.stroke();
    }
  }
  /** 数据条（M13）：格内左对齐按比例画半透明条（文本可读，条在底）。 */
  drawDataBar(ctx, rect, bar) {
    const pad = 2;
    const w = Math.max(0, (rect.width - pad * 2) * bar.ratio);
    const prev = ctx.globalAlpha ?? 1;
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = bar.color;
    ctx.fillRect(rect.x + pad, rect.y + pad, w, rect.height - pad * 2);
    ctx.globalAlpha = prev;
  }
  /** 图标集（M13）：格左侧画简易图标（箭头/信号灯/评级），index 0=低 1=中 2=高。 */
  drawIcon(ctx, rect, icon) {
    const cx = rect.x + 9, cy = rect.y + rect.height / 2, r = Math.min(6, rect.height / 2 - 2);
    if (icon.set === "traffic") {
      ctx.fillStyle = icon.index === 2 ? "#63be7b" : icon.index === 1 ? "#ffc000" : "#f8696b";
      ctx.beginPath();
      ctx.rect(cx - r, cy - r, r * 2, r * 2);
      ctx.fill();
      ctx.fillStyle = icon.index === 2 ? "#2e9e52" : icon.index === 1 ? "#d99a00" : "#d13438";
    } else if (icon.set === "arrows") {
      ctx.strokeStyle = icon.index === 2 ? "#63be7b" : icon.index === 1 ? "#ffc000" : "#f8696b";
      ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath();
      if (icon.index === 2) {
        ctx.moveTo(cx, cy - r);
        ctx.lineTo(cx - r, cy + r);
        ctx.lineTo(cx + r, cy + r);
      } else if (icon.index === 0) {
        ctx.moveTo(cx, cy + r);
        ctx.lineTo(cx - r, cy - r);
        ctx.lineTo(cx + r, cy - r);
      } else {
        ctx.rect(cx - r, cy - 1.5, r * 2, 3);
      }
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillStyle = "#5b8def";
      ctx.beginPath();
      ctx.rect(cx - r, cy - r, r * 2 * ((icon.index + 1) / 3), r * 2);
      ctx.fill();
    }
  }
  /** list 验证下拉箭头（M12）：格右侧灰底 ▼。 */
  drawCellDropdownArrow(ctx, rect) {
    const box = cellDropdownBox(rect);
    ctx.fillStyle = this.theme.headerBack;
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.strokeStyle = this.theme.headerLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(box.x + 0.5, box.y);
    ctx.lineTo(box.x + 0.5, box.y + box.h);
    ctx.stroke();
    ctx.fillStyle = this.theme.headerFore;
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    ctx.beginPath();
    ctx.moveTo(cx - 3, cy - 1.5);
    ctx.lineTo(cx + 3, cy - 1.5);
    ctx.lineTo(cx, cy + 2.5);
    ctx.closePath();
    ctx.fill();
  }
  applyTextStyle(ctx, style) {
    const zoom = this.geometry.viewport.zoom;
    const size = (style.fontSize ?? DEFAULT_FONT_PX) * zoom;
    const family = style.fontFamily || DEFAULT_FONT_FAMILY;
    const weight = style.bold ? "bold" : "normal";
    const italic = style.italic ? "italic" : "normal";
    ctx.font = `${italic} ${weight} ${size}px ${family}`;
  }
  /**
   * 绘制单元格文本：支持 hAlign/vAlign、underline、wordWrap（自动换行 + 多行垂直定位）。
   * 抽出为共享方法，普通格与合并格复用同一套排版逻辑。
   * formatColor（M7 颜色段 [Red] 等）优先于 style.foreColor——负数标红等由格式串决定字色。
   */
  /**
   * 溢出裁剪矩形（Excel 语义）：非折行文本的可绘制横向范围。
   * 左对齐 → 可向右溢入连续空格；右对齐 → 向左溢入；居中 → 两侧溢入。
   * 遇到第一个有内容（值/富文本/迷你图）的格即止，避免覆盖邻格文字。
   * 只扩当前可见范围内的相邻格，最多各方向 32 格（够长标题，防极端遍历）。
   */
  overflowClipRect(row, col, rect, style) {
    const align = style.hAlign;
    const canRight = align !== "right";
    const canLeft = align === "right" || align === "center" || align === "centerContinuous";
    let x = rect.x;
    let right = rect.x + rect.width;
    const MAX = 32;
    if (canRight) {
      let c = col + 1, n = 0;
      while (n < MAX && c < this.sheet.getColumnCount()) {
        if (!this.sheet.isColumnVisible(c)) {
          c++;
          continue;
        }
        if (!this.isCellBlank(row, c)) break;
        const cr = this.geometry.getCellRect(row, c);
        right = cr.x + cr.width;
        c++;
        n++;
      }
    }
    if (canLeft) {
      let c = col - 1, n = 0;
      while (n < MAX && c >= 0) {
        if (!this.sheet.isColumnVisible(c)) {
          c--;
          continue;
        }
        if (!this.isCellBlank(row, c)) break;
        const cr = this.geometry.getCellRect(row, c);
        x = cr.x;
        c--;
        n++;
      }
    }
    return { x, y: rect.y, width: Math.max(rect.width, right - x), height: rect.height };
  }
  /** 格是否「空」——无标量值、无富文本、无迷你图（供溢出裁剪判断邻格）。 */
  isCellBlank(row, col) {
    const v = this.sheet.getValue(row, col);
    if (v !== null && v !== void 0 && v !== "") return false;
    const rich = this.sheet.getRichText(row, col);
    if (rich && rich.runs.length) return false;
    if (this.sheet.getSparkline(row, col)) return false;
    return true;
  }
  drawCellText(ctx, text, rect, style, formatColor) {
    const rot = style.textRotation;
    if (rot && rot !== 0 && ctx.translate && ctx.rotate) {
      const cx = rect.x + rect.width / 2;
      const cy = rect.y + rect.height / 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-rot * Math.PI / 180);
      const local = { x: -rect.width / 2, y: -rect.height / 2, width: rect.width, height: rect.height };
      this.drawCellTextFlat(ctx, text, local, style, formatColor);
      ctx.restore();
      return;
    }
    this.drawCellTextFlat(ctx, text, rect, style, formatColor);
  }
  /** 水平文本绘制核心（旋转时在已变换坐标系内调用）。 */
  drawCellTextFlat(ctx, text, rect, style, formatColor) {
    this.applyTextStyle(ctx, style);
    ctx.fillStyle = formatColor || style.foreColor || this.theme.cellFore;
    const zoom = this.geometry.viewport.zoom;
    const pad = 3 * zoom;
    let fontScale = 1;
    if (style.shrinkToFit && !style.wordWrap) {
      const w = ctx.measureText(text).width;
      const avail = rect.width - pad * 2;
      if (w > avail && avail > 0) {
        fontScale = Math.max(0.3, avail / w);
        const size = (style.fontSize ?? DEFAULT_FONT_PX) * zoom * fontScale;
        const family = style.fontFamily || DEFAULT_FONT_FAMILY;
        const weight = style.bold ? "bold" : "normal";
        const italic = style.italic ? "italic" : "normal";
        ctx.font = `${italic} ${weight} ${size}px ${family}`;
      }
    }
    const { tx, align } = this.textX(rect, style, pad);
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    const lineH = (style.fontSize ?? DEFAULT_FONT_PX) * zoom * fontScale * 1.3;
    const lines = style.wordWrap ? this.wrapText(ctx, text, rect.width - pad * 2) : [text];
    const blockH = lines.length * lineH;
    let cy;
    switch (style.vAlign) {
      case "top":
        cy = rect.y + pad + lineH / 2;
        break;
      case "bottom":
        cy = rect.y + rect.height - pad - blockH + lineH / 2;
        break;
      default:
        cy = rect.y + rect.height / 2 - blockH / 2 + lineH / 2;
    }
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i] ?? "";
      if (style.hAlign === "fill" && line !== "") {
        line = this.repeatToFill(ctx, line, rect.width - pad * 2);
      }
      const y = cy + i * lineH;
      ctx.fillText(line, tx, y);
      if (style.underline) this.drawUnderline(ctx, line, tx, y, align, lineH);
      if (style.strikethrough) this.drawStrike(ctx, line, tx, y, align);
    }
  }
  /** fill 对齐：把单元内容重复拼接到不超过可用宽度。 */
  repeatToFill(ctx, unit, avail) {
    const w = ctx.measureText(unit).width;
    if (w <= 0 || avail <= 0) return unit;
    const n = Math.max(1, Math.floor(avail / w));
    return unit.repeat(n);
  }
  /** 删除线：横穿文本中线，长度 = 量测宽度。 */
  drawStrike(ctx, line, tx, cy, align) {
    const w = ctx.measureText(line).width;
    let x0;
    if (align === "center") x0 = tx - w / 2;
    else if (align === "right") x0 = tx - w;
    else x0 = tx;
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = Math.max(1, w * 8e-3 + 0.8);
    ctx.beginPath();
    ctx.moveTo(x0, cy);
    ctx.lineTo(x0 + w, cy);
    ctx.stroke();
  }
  /** 下划线：按对齐方式定位起点，长度 = 文本量测宽度。 */
  drawUnderline(ctx, line, tx, cy, align, lineH) {
    const w = ctx.measureText(line).width;
    let x0;
    if (align === "center") x0 = tx - w / 2;
    else if (align === "right") x0 = tx - w;
    else x0 = tx;
    const uy = cy + lineH * 0.32;
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = Math.max(1, lineH * 0.06);
    ctx.beginPath();
    ctx.moveTo(x0, uy);
    ctx.lineTo(x0 + w, uy);
    ctx.stroke();
  }
  /**
   * 富文本分段绘制（M13）：逐 run 切字体/色，连续左对齐排布在垂直居中基线上。
   * 每个 run 用其 font 覆盖单元格样式；underline 逐 run 处理。简化：单行（不折行——
   * 富文本折行属低频，先支持单行渲染 + 换行符断行）。
   */
  drawRichText(ctx, rich, rect, baseStyle) {
    const zoom = this.geometry.viewport.zoom;
    const pad = 3 * zoom;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const lines = [[]];
    for (const run of rich.runs) {
      const st = { ...baseStyle, ...run.font ?? {} };
      const parts = run.text.split("\n");
      for (let i = 0; i < parts.length; i++) {
        if (i > 0) lines.push([]);
        if (parts[i] !== "") lines[lines.length - 1].push({ text: parts[i], st });
      }
    }
    const lineH = (baseStyle.fontSize ?? DEFAULT_FONT_PX) * zoom * 1.3;
    const blockH = lines.length * lineH;
    let cy = rect.y + rect.height / 2 - blockH / 2 + lineH / 2;
    if (baseStyle.vAlign === "top") cy = rect.y + pad + lineH / 2;
    else if (baseStyle.vAlign === "bottom") cy = rect.y + rect.height - pad - blockH + lineH / 2;
    for (const line of lines) {
      let x = rect.x + pad;
      for (const seg of line) {
        this.applyTextStyle(ctx, seg.st);
        ctx.fillStyle = seg.st.foreColor || this.theme.cellFore;
        ctx.fillText(seg.text, x, cy);
        const w = ctx.measureText(seg.text).width;
        if (seg.st.underline) this.drawUnderline(ctx, seg.text, x, cy, "left", lineH);
        x += w;
      }
      cy += lineH;
    }
  }
  /** 贪心按词折行；单词超宽则按字符硬切。返回至少一行。 */
  wrapText(ctx, text, maxWidth) {
    if (maxWidth <= 0) return [text];
    const out = [];
    for (const paragraph of text.split("\n")) {
      const words = paragraph.split(/(\s+)/).filter((w) => w !== "");
      let cur = "";
      const pushWord = (w) => {
        const test = cur ? cur + w : w;
        if (ctx.measureText(test).width <= maxWidth || cur === "") {
          cur = test;
        } else {
          out.push(cur.trimEnd());
          cur = w.trimStart();
        }
      };
      for (const w of words) {
        if (ctx.measureText(w).width > maxWidth) {
          for (const ch of w) {
            if (cur !== "" && ctx.measureText(cur + ch).width > maxWidth) {
              out.push(cur);
              cur = "";
            }
            cur += ch;
          }
        } else {
          pushWord(w);
        }
      }
      out.push(cur.trimEnd());
    }
    return out.length ? out : [text];
  }
  textX(rect, style, pad) {
    const zoom = this.geometry.viewport.zoom;
    const indentPx = style.indent && style.indent > 0 ? style.indent * (style.fontSize ?? DEFAULT_FONT_PX) * zoom : 0;
    switch (style.hAlign) {
      case "center":
      case "centerContinuous":
        return { tx: rect.x + rect.width / 2, align: "center" };
      case "right":
        return { tx: rect.x + rect.width - pad - indentPx, align: "right" };
      case "fill":
      // 重复填满：仍从左起，重复由 drawCellText 处理
      case "justify":
      // 两端对齐：多行按左对齐排布（末行左），先退化为左
      case "left":
        return { tx: rect.x + pad + indentPx, align: "left" };
      default:
        return { tx: rect.x + pad + indentPx, align: "left" };
    }
  }
  drawCellBorders(ctx, rect, borders) {
    const edges = [
      ["top", rect.x, rect.y, rect.x + rect.width, rect.y],
      ["bottom", rect.x, rect.y + rect.height, rect.x + rect.width, rect.y + rect.height],
      ["left", rect.x, rect.y, rect.x, rect.y + rect.height],
      ["right", rect.x + rect.width, rect.y, rect.x + rect.width, rect.y + rect.height]
    ];
    for (const [side, x1, y1, x2, y2] of edges) {
      const edge = borders[side];
      if (!edge || edge.style === "none") continue;
      const st = edge.style;
      ctx.strokeStyle = edge.color || "#000";
      if (ctx.setLineDash) {
        if (st === "dashed") ctx.setLineDash([4, 2]);
        else if (st === "dotted") ctx.setLineDash([1, 2]);
        else ctx.setLineDash([]);
      }
      if (st === "double") {
        ctx.lineWidth = 1;
        const nx = x1 === x2 ? 1 : 0;
        const ny = y1 === y2 ? 1 : 0;
        for (const o of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(x1 + nx * o, y1 + ny * o);
          ctx.lineTo(x2 + nx * o, y2 + ny * o);
          ctx.stroke();
        }
      } else {
        ctx.lineWidth = st === "thick" ? 2 : st === "medium" ? 1.5 : 1;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
    }
    const diagonals = [
      [borders.diagonalDown, rect.x, rect.y, rect.x + rect.width, rect.y + rect.height],
      [borders.diagonalUp, rect.x, rect.y + rect.height, rect.x + rect.width, rect.y]
    ];
    for (const [edge, x1, y1, x2, y2] of diagonals) {
      if (!edge || edge.style === "none") continue;
      const st = edge.style;
      ctx.strokeStyle = edge.color || "#000";
      ctx.lineWidth = st === "thick" ? 2 : st === "medium" || st === "double" ? 1.5 : 1;
      if (ctx.setLineDash) {
        if (st === "dashed") ctx.setLineDash([4, 2]);
        else if (st === "dotted") ctx.setLineDash([1, 2]);
        else ctx.setLineDash([]);
      }
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    if (ctx.setLineDash) ctx.setLineDash([]);
  }
  /**
   * M18 结构化填充绘制：backColor（solid 简写）优先，其次 style.fill。
   * pattern/gradient 全手写（clip 到格 rect + 手绘线/插值），不依赖 canvas 渐变 API，
   * 保 jsdom 桩安全。
   */
  paintCellBackground(ctx, rect, style) {
    if (style.backColor) {
      ctx.fillStyle = style.backColor;
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
      return;
    }
    const fill = style.fill;
    if (!fill) return;
    if (fill.type === "solid") {
      ctx.fillStyle = fill.color;
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    } else if (fill.type === "pattern") {
      this.paintPattern(ctx, rect, fill.pattern, fill.fgColor, fill.bgColor);
    } else {
      this.paintGradient(ctx, rect, fill);
    }
  }
  /** 图案填充：bgColor 打底，fgColor 手绘线族（clip 到 rect 内）。 */
  paintPattern(ctx, rect, pattern, fg, bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    if (pattern === "solid") {
      ctx.fillStyle = fg;
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
      return;
    }
    const grayAlpha = { gray75: 0.75, gray50: 0.5, gray25: 0.25, gray125: 0.125, gray0625: 0.0625 };
    if (pattern in grayAlpha) {
      const a = ctx.globalAlpha ?? 1;
      if (ctx.globalAlpha !== void 0) ctx.globalAlpha = grayAlpha[pattern];
      ctx.fillStyle = fg;
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
      if (ctx.globalAlpha !== void 0) ctx.globalAlpha = a;
      return;
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.width, rect.height);
    ctx.clip();
    ctx.strokeStyle = fg;
    ctx.lineWidth = pattern.startsWith("light") ? 0.6 : 1;
    const gap = pattern.startsWith("light") ? 6 : 4;
    const base = pattern.replace("light", "").replace(/^([A-Z])/, (m) => m.toLowerCase());
    const drawH = () => {
      for (let y = rect.y + gap; y < rect.y + rect.height; y += gap) {
        ctx.beginPath();
        ctx.moveTo(rect.x, y);
        ctx.lineTo(rect.x + rect.width, y);
        ctx.stroke();
      }
    };
    const drawV = () => {
      for (let x = rect.x + gap; x < rect.x + rect.width; x += gap) {
        ctx.beginPath();
        ctx.moveTo(x, rect.y);
        ctx.lineTo(x, rect.y + rect.height);
        ctx.stroke();
      }
    };
    const drawDown = () => {
      for (let d = -rect.height; d < rect.width; d += gap) {
        ctx.beginPath();
        ctx.moveTo(rect.x + d, rect.y);
        ctx.lineTo(rect.x + d + rect.height, rect.y + rect.height);
        ctx.stroke();
      }
    };
    const drawUp = () => {
      for (let d = 0; d < rect.width + rect.height; d += gap) {
        ctx.beginPath();
        ctx.moveTo(rect.x + d, rect.y);
        ctx.lineTo(rect.x + d - rect.height, rect.y + rect.height);
        ctx.stroke();
      }
    };
    const b = base;
    if (b === "horizontal") drawH();
    else if (b === "vertical") drawV();
    else if (b === "down") drawDown();
    else if (b === "up") drawUp();
    else if (b === "grid") {
      drawH();
      drawV();
    } else if (b === "trellis") {
      drawDown();
      drawUp();
    }
    ctx.restore();
  }
  /** 渐变填充：手写线性插值分带（不用 createLinearGradient，桩安全）。 */
  paintGradient(ctx, rect, fill) {
    const stops = [...fill.stops].sort((a, b) => a.pos - b.pos);
    if (stops.length === 0) return;
    if (stops.length === 1) {
      ctx.fillStyle = stops[0].color;
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
      return;
    }
    const deg = fill.degree ?? 0;
    const horizontal = Math.abs(Math.cos(deg * Math.PI / 180)) >= Math.abs(Math.sin(deg * Math.PI / 180));
    const steps = 24;
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      ctx.fillStyle = this.lerpStops(stops, t);
      if (horizontal) {
        const w = rect.width / steps;
        ctx.fillRect(rect.x + i * w, rect.y, w + 1, rect.height);
      } else {
        const hgt = rect.height / steps;
        ctx.fillRect(rect.x, rect.y + i * hgt, rect.width, hgt + 1);
      }
    }
  }
  /** 在停止点间线性插值取色（#rrggbb）。 */
  lerpStops(stops, t) {
    let a = stops[0], b = stops[stops.length - 1];
    for (let i = 0; i < stops.length - 1; i++) {
      if (t >= stops[i].pos && t <= stops[i + 1].pos) {
        a = stops[i];
        b = stops[i + 1];
        break;
      }
    }
    const span = b.pos - a.pos;
    const lt = span <= 0 ? 0 : (t - a.pos) / span;
    const ca = hexToRgb(a.color), cb = hexToRgb(b.color);
    const r = Math.round(ca[0] + (cb[0] - ca[0]) * lt);
    const g = Math.round(ca[1] + (cb[1] - ca[1]) * lt);
    const bl = Math.round(ca[2] + (cb[2] - ca[2]) * lt);
    return `rgb(${r}, ${g}, ${bl})`;
  }
  drawGridlines(ctx, top, bottom, left, right) {
    ctx.strokeStyle = this.theme.gridline;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let c = left; c <= right + 1; c++) {
      const r = this.geometry.getCellRect(top, c);
      ctx.moveTo(r.x, this.geometry.viewport.colHeaderHeight);
      ctx.lineTo(r.x, this.geometry.viewport.height);
    }
    for (let rr = top; rr <= bottom + 1; rr++) {
      const r = this.geometry.getCellRect(rr, left);
      ctx.moveTo(this.geometry.viewport.rowHeaderWidth, r.y);
      ctx.lineTo(this.geometry.viewport.width, r.y);
    }
    ctx.stroke();
  }
  drawSpans(ctx, top, bottom, left, right) {
    for (const span of this.sheet.getSpans()) {
      if (span.row > bottom || span.row + span.rowCount - 1 < top) continue;
      if (span.col > right || span.col + span.colCount - 1 < left) continue;
      const rect = this.geometry.getCellRect(span.row, span.col, span.rowCount, span.colCount);
      const style = this.sheet.getResolvedStyle(span.row, span.col);
      ctx.fillStyle = this.theme.sheetBack;
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
      this.paintCellBackground(ctx, rect, style);
      if (this.showGridlines) {
        ctx.strokeStyle = this.theme.gridline;
        ctx.lineWidth = 1;
        ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1);
      }
      const raw = this.sheet.getValue(span.row, span.col);
      const { text, color } = formatCell(raw, style.formatter);
      if (text !== "") this.drawCellText(ctx, text, rect, style, color);
      if (style.borders) this.drawCellBorders(ctx, rect, style.borders);
    }
  }
  drawSelection(ctx) {
    const sels = this.sheet.getSelections();
    for (let i = 0; i < sels.length; i++) {
      const sel = sels[i];
      const exp = this.sheet.expandRangeToSpans(sel);
      const rect = this.geometry.getCellRect(exp.row, exp.col, exp.rowCount, exp.colCount);
      ctx.fillStyle = this.theme.selectionFill;
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
      ctx.strokeStyle = this.theme.selectionBorder;
      ctx.lineWidth = 2;
      ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
      if (this.showFillHandle && i === sels.length - 1) {
        const hs = 6;
        ctx.fillStyle = this.theme.selectionBorder;
        ctx.fillRect(rect.x + rect.width - hs / 2, rect.y + rect.height - hs / 2, hs, hs);
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1;
        ctx.strokeRect(rect.x + rect.width - hs / 2, rect.y + rect.height - hs / 2, hs, hs);
      }
    }
  }
  /** 头绘制索引：冻结带 [0,frozen) + 滚动带 [first,last]（去重、有序）。 */
  headerIndices(first, last, frozen, trailStart, count) {
    const out = [];
    for (let i = 0; i < frozen; i++) out.push(i);
    const scrollLast = trailStart !== void 0 ? Math.min(last, trailStart - 1) : last;
    for (let i = Math.max(first, frozen); i <= scrollLast; i++) out.push(i);
    if (trailStart !== void 0 && count !== void 0) {
      for (let i = Math.max(trailStart, frozen); i < count; i++) out.push(i);
    }
    return out;
  }
  /** 自动筛选箭头：在筛选区每列表头右侧画 ▼（有活动条件的列高亮）。M11。 */
  drawFilterArrows(ctx, cols) {
    const af = this.sheet.autoFilter;
    if (!af) return;
    const vp = this.geometry.viewport;
    const c1 = af.range.col, c2 = af.range.col + af.range.colCount - 1;
    for (const c of cols) {
      if (c < c1 || c > c2) continue;
      if (!this.sheet.isColumnVisible(c)) continue;
      const box = filterArrowBox(this.geometry.getCellRect(0, c), vp.colOutlineHeight, vp.colHeaderHeight);
      const active = af.criteria.has(c);
      ctx.fillStyle = active ? this.theme.headerActiveBack : this.theme.headerBack;
      ctx.fillRect(box.x, box.y, box.w, box.h);
      ctx.strokeStyle = this.theme.headerLine;
      ctx.lineWidth = 1;
      ctx.strokeRect(box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1);
      ctx.fillStyle = active ? this.theme.headerActiveFore : this.theme.headerFore;
      const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
      ctx.beginPath();
      ctx.moveTo(cx - 3, cy - 1.5);
      ctx.lineTo(cx + 3, cy - 1.5);
      ctx.lineTo(cx, cy + 2.5);
      ctx.closePath();
      ctx.fill();
    }
  }
  drawHeaders(ctx, top, bottom, left, right) {
    const vp = this.geometry.viewport;
    const { rows: selRows, cols: selCols } = this.selectionCoverage();
    const tc = this.geometry.trailingCols();
    const tr = this.geometry.trailingRows();
    const nCols = this.sheet.getColumnCount();
    const nRows = this.sheet.getRowCount();
    const cols = this.headerIndices(left, right, this.geometry.frozenCols(), tc > 0 ? nCols - tc : void 0, tc > 0 ? nCols : void 0);
    const rows = this.headerIndices(top, bottom, this.geometry.frozenRows(), tr > 0 ? nRows - tr : void 0, tr > 0 ? nRows : void 0);
    ctx.fillStyle = this.theme.headerBack;
    ctx.fillRect(0, vp.colOutlineHeight, vp.width, vp.colHeaderHeight);
    for (const c of cols) {
      if (!this.sheet.isColumnVisible(c) || !selCols.has(c)) continue;
      const r = this.geometry.getCellRect(0, c);
      ctx.fillStyle = this.theme.headerActiveBack;
      ctx.fillRect(r.x, vp.colOutlineHeight, r.width, vp.colHeaderHeight);
    }
    ctx.strokeStyle = this.theme.headerLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const c of cols) {
      if (!this.sheet.isColumnVisible(c)) continue;
      const r = this.geometry.getCellRect(0, c);
      const x = Math.round(r.x + r.width) + 0.5;
      if (x <= vp.leftOffset) continue;
      ctx.moveTo(x, vp.colOutlineHeight);
      ctx.lineTo(x, vp.topOffset);
    }
    ctx.stroke();
    ctx.font = `normal normal ${12 * vp.zoom}px ${DEFAULT_FONT_FAMILY}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const c of cols) {
      if (!this.sheet.isColumnVisible(c)) continue;
      const r = this.geometry.getCellRect(0, c);
      ctx.fillStyle = selCols.has(c) ? this.theme.headerActiveFore : this.theme.headerFore;
      ctx.fillText(colLabel(c), r.x + r.width / 2, vp.colOutlineHeight + vp.colHeaderHeight / 2);
    }
    this.drawFilterArrows(ctx, cols);
    ctx.fillStyle = this.theme.headerBack;
    ctx.fillRect(vp.rowOutlineWidth, 0, vp.rowHeaderWidth, vp.height);
    for (const rr of rows) {
      if (!this.sheet.isRowVisible(rr) || !selRows.has(rr)) continue;
      const r = this.geometry.getCellRect(rr, 0);
      ctx.fillStyle = this.theme.headerActiveBack;
      ctx.fillRect(vp.rowOutlineWidth, r.y, vp.rowHeaderWidth, r.height);
    }
    ctx.strokeStyle = this.theme.headerLine;
    ctx.beginPath();
    for (const rr of rows) {
      if (!this.sheet.isRowVisible(rr)) continue;
      const r = this.geometry.getCellRect(rr, 0);
      const y = Math.round(r.y + r.height) + 0.5;
      if (y <= vp.topOffset) continue;
      ctx.moveTo(vp.rowOutlineWidth, y);
      ctx.lineTo(vp.leftOffset, y);
    }
    ctx.stroke();
    for (const rr of rows) {
      if (!this.sheet.isRowVisible(rr)) continue;
      const r = this.geometry.getCellRect(rr, 0);
      ctx.fillStyle = selRows.has(rr) ? this.theme.headerActiveFore : this.theme.headerFore;
      ctx.fillText(String(rr + 1), vp.rowOutlineWidth + vp.rowHeaderWidth / 2, r.y + r.height / 2);
    }
    ctx.fillStyle = this.theme.headerBack;
    ctx.fillRect(vp.rowOutlineWidth, vp.colOutlineHeight, vp.rowHeaderWidth, vp.colHeaderHeight);
    ctx.strokeStyle = this.theme.headerLine;
    ctx.beginPath();
    const hb = Math.round(vp.topOffset) + 0.5;
    ctx.moveTo(0, hb);
    ctx.lineTo(vp.width, hb);
    const rb = Math.round(vp.leftOffset) + 0.5;
    ctx.moveTo(rb, 0);
    ctx.lineTo(rb, vp.height);
    ctx.stroke();
  }
  /** 当前选区覆盖的行索引集合与列索引集合（供行列头高亮）。 */
  selectionCoverage() {
    const rows = /* @__PURE__ */ new Set();
    const cols = /* @__PURE__ */ new Set();
    for (const sel of this.sheet.getSelections()) {
      const exp = this.sheet.expandRangeToSpans(sel);
      for (let r = exp.row; r <= exp.lastRow; r++) rows.add(r);
      for (let c = exp.col; c <= exp.lastCol; c++) cols.add(c);
    }
    return { rows, cols };
  }
  // ── 大纲区绘制 ───────────────────────────────────────
  /** 画行/列大纲带（分组线 + [-]/[+] 按钮）+ 角上层级总开关。无分组则不画。 */
  drawOutlines(ctx) {
    const vp = this.geometry.viewport;
    const rowGroups = this.sheet.rowOutlines.list();
    const colGroups = this.sheet.columnOutlines.list();
    const hasRow = vp.rowOutlineWidth > 0 && rowGroups.length > 0;
    const hasCol = vp.colOutlineHeight > 0 && colGroups.length > 0;
    if (!hasRow && !hasCol) return;
    if (hasRow) {
      ctx.fillStyle = this.theme.outlineBack;
      ctx.fillRect(0, 0, vp.rowOutlineWidth, vp.height);
    }
    if (hasCol) {
      ctx.fillStyle = this.theme.outlineBack;
      ctx.fillRect(0, 0, vp.width, vp.colOutlineHeight);
    }
    if (hasRow) {
      const sortedByLevelDesc = [...rowGroups].sort((a, b) => b.level - a.level);
      for (const g of sortedByLevelDesc) {
        if (g.collapsed) continue;
        const slotX = levelSlotCenter(g.level) + 0.5;
        const yTop = this.geometry.rowCenterScreen(g.start);
        const yBot = this.geometry.rowCenterScreen(g.start + g.count - 1);
        ctx.strokeStyle = this.theme.outlineLine;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(slotX, yTop);
        ctx.lineTo(slotX, yBot);
        const hookY = this.sheet.summaryBelow ? yTop : yBot;
        ctx.moveTo(slotX, hookY);
        ctx.lineTo(slotX + 4, hookY);
        ctx.stroke();
      }
      const btns = rowOutlineButtons(rowGroups, this.sheet.summaryBelow, (r) => this.geometry.rowCenterScreen(r));
      for (let i = 0; i < btns.length; i++) {
        const g = rowGroups[i];
        if (!g) continue;
        const summaryRow = this.sheet.summaryBelow ? g.start + g.count - 1 : g.start;
        if (!this.sheet.isRowVisible(summaryRow)) continue;
        this.drawOutlineButton(ctx, btns[i].x, btns[i].y, btns[i].collapsed);
      }
    }
    if (hasCol) {
      const sortedByLevelDesc = [...colGroups].sort((a, b) => b.level - a.level);
      for (const g of sortedByLevelDesc) {
        if (g.collapsed) continue;
        const slotY = levelSlotCenter(g.level) + 0.5;
        const xLeft = this.geometry.colCenterScreen(g.start);
        const xRight = this.geometry.colCenterScreen(g.start + g.count - 1);
        ctx.strokeStyle = this.theme.outlineLine;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(xLeft, slotY);
        ctx.lineTo(xRight, slotY);
        const hookX = this.sheet.summaryRight ? xLeft : xRight;
        ctx.moveTo(hookX, slotY);
        ctx.lineTo(hookX, slotY + 4);
        ctx.stroke();
      }
      const btns = colOutlineButtons(colGroups, this.sheet.summaryRight, (c) => this.geometry.colCenterScreen(c));
      for (let i = 0; i < btns.length; i++) {
        const g = colGroups[i];
        if (!g) continue;
        const summaryCol = this.sheet.summaryRight ? g.start + g.count - 1 : g.start;
        if (!this.sheet.isColumnVisible(summaryCol)) continue;
        this.drawOutlineButton(ctx, btns[i].x, btns[i].y, btns[i].collapsed);
      }
    }
    if (hasRow || hasCol) {
      ctx.fillStyle = this.theme.outlineBack;
      if (hasRow) ctx.fillRect(0, 0, vp.rowOutlineWidth, vp.topOffset);
      if (hasCol) ctx.fillRect(0, 0, vp.leftOffset, vp.colOutlineHeight);
    }
    if (hasRow) {
      const rowMax = this.sheet.rowOutlines.maxLevel();
      for (const b of levelButtons(rowMax, hasCol)) this.drawLevelButton(ctx, b.x, b.y, b.level);
    }
    if (hasCol) {
      const colMax = this.sheet.columnOutlines.maxLevel();
      for (const b of colLevelButtons(colMax, hasRow)) this.drawLevelButton(ctx, b.x, b.y, b.level);
    }
  }
  /** 画一个 +/- 方钮：折叠态画 +，展开态画 -。 */
  drawOutlineButton(ctx, x, y, collapsed) {
    const s = OUTLINE_BTN;
    ctx.fillStyle = this.theme.outlineButtonBack;
    ctx.fillRect(x, y, s, s);
    ctx.strokeStyle = this.theme.outlineLine;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
    ctx.strokeStyle = this.theme.outlineButtonFore;
    ctx.beginPath();
    const cy = y + s / 2;
    ctx.moveTo(x + 2.5, cy);
    ctx.lineTo(x + s - 2.5, cy);
    if (collapsed) {
      const cx = x + s / 2;
      ctx.moveTo(cx, y + 2.5);
      ctx.lineTo(cx, y + s - 2.5);
    }
    ctx.stroke();
  }
  /** 画层级总开关按钮（角上 1 2 3…）。 */
  drawLevelButton(ctx, x, y, level) {
    const s = OUTLINE_BTN;
    ctx.fillStyle = this.theme.outlineButtonBack;
    ctx.fillRect(x, y, s, s);
    ctx.strokeStyle = this.theme.outlineLine;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
    ctx.fillStyle = this.theme.outlineButtonFore;
    ctx.font = `9px ${DEFAULT_FONT_FAMILY}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(level), x + s / 2, y + s / 2 + 0.5);
  }
  // ── 滚动条绘制 ───────────────────────────────────────
  /** 画竖/横滚动条（轨道 + 圆角滑块）+ 双条交汇的右下角。无需要则不画。 */
  drawScrollbars(ctx) {
    const sb = this.scrollbars;
    if (!sb) return;
    const vp = this.geometry.viewport;
    if (sb.vertical.visible && sb.horizontal.visible) {
      ctx.fillStyle = this.theme.scrollbarTrack;
      ctx.fillRect(vp.width - sb.gutterRight, vp.height - sb.gutterBottom, sb.gutterRight, sb.gutterBottom);
    }
    if (sb.vertical.visible) this.drawOneScrollbar(ctx, sb.vertical.track, sb.vertical.thumb);
    if (sb.horizontal.visible) this.drawOneScrollbar(ctx, sb.horizontal.track, sb.horizontal.thumb);
  }
  drawOneScrollbar(ctx, track, thumb) {
    ctx.fillStyle = this.theme.scrollbarTrack;
    ctx.fillRect(track.x, track.y, track.width, track.height);
    const pad = 2;
    ctx.fillStyle = this.theme.scrollbarThumb;
    ctx.fillRect(
      thumb.x + pad,
      thumb.y + pad,
      Math.max(1, thumb.width - pad * 2),
      Math.max(1, thumb.height - pad * 2)
    );
  }
};
function colLabel(index) {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// src/render/CellEditor.ts
var CellEditor = class {
  constructor(opts) {
    this.opts = opts;
    this.doc = opts.document ?? opts.host.ownerDocument;
  }
  input = null;
  editingRow = -1;
  editingCol = -1;
  editingRowSpan = 1;
  editingColSpan = 1;
  doc;
  get isEditing() {
    return this.input !== null;
  }
  get position() {
    return this.input ? { row: this.editingRow, col: this.editingCol } : null;
  }
  /**
   * 开始编辑。initial 非空则替换单元格原值（键入进入）；为 undefined 则沿用 currentText（双击进入）。
   * span 给出合并跨度（行×列），编辑器覆盖整个合并区；缺省 1×1。
   * spec.listValues 有值时用 <select> 下拉编辑器（list 验证，M12）。
   * 调用方（InteractionController）须已把 row/col 归一到合并区左上。
   */
  begin(row, col, currentText, initial, span, spec) {
    if (this.input) this.commit(false);
    this.editingRow = row;
    this.editingCol = col;
    this.editingRowSpan = Math.max(1, span?.rowCount ?? 1);
    this.editingColSpan = Math.max(1, span?.colCount ?? 1);
    if (spec?.listValues && spec.listValues.length > 0) {
      this.beginSelect(row, col, currentText, spec.listValues);
      return;
    }
    const input = this.doc.createElement("input");
    input.className = "cmx-cell-editor";
    input.type = "text";
    input.value = initial !== void 0 ? initial : currentText;
    this.styleInput(input, row, col);
    input.addEventListener("keydown", (e) => this.onKeyDown(e));
    input.addEventListener("blur", () => {
      if (this.input === input) this.commit(false);
    });
    this.opts.host.appendChild(input);
    this.input = input;
    input.focus();
    try {
      const len = input.value.length;
      input.setSelectionRange(len, len);
    } catch {
    }
  }
  /** 下拉编辑器（list 验证，M12）：<select> overlay，选择即提交。 */
  beginSelect(row, col, currentText, values) {
    const sel = this.doc.createElement("select");
    sel.className = "cmx-cell-editor cmx-cell-editor-select";
    for (const v of values) {
      const opt = this.doc.createElement("option");
      opt.value = v;
      opt.textContent = v;
      if (v === currentText) opt.selected = true;
      sel.appendChild(opt);
    }
    this.styleInput(sel, row, col);
    sel.addEventListener("change", () => this.commit(true));
    sel.addEventListener("keydown", (e) => this.onKeyDown(e));
    sel.addEventListener("blur", () => {
      if (this.input === sel) this.commit(false);
    });
    this.opts.host.appendChild(sel);
    this.input = sel;
    sel.focus();
  }
  /** 重定位（滚动/缩放后保持贴合单元格）。 */
  reposition() {
    if (this.input) this.styleInput(this.input, this.editingRow, this.editingCol);
  }
  styleInput(input, row, col) {
    const rect = this.opts.geometry.getCellRect(row, col, this.editingRowSpan, this.editingColSpan);
    const zoom = this.opts.geometry.viewport.zoom;
    const s = input.style;
    s.position = "absolute";
    s.left = `${rect.x}px`;
    s.top = `${rect.y}px`;
    s.width = `${Math.max(0, rect.width - 1)}px`;
    s.height = `${Math.max(0, rect.height - 1)}px`;
    s.boxSizing = "border-box";
    s.margin = "0";
    s.border = "2px solid #0a6ed1";
    s.outline = "none";
    s.padding = "0 3px";
    s.font = `${13 * zoom}px Arial, sans-serif`;
    s.zIndex = "50";
  }
  onKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      this.commit(true);
    } else if (e.key === "Escape") {
      e.preventDefault();
      this.cancel();
    } else if (e.key === "Tab") {
      e.preventDefault();
      this.commit(true);
    }
    e.stopPropagation();
  }
  /** 提交当前编辑。moveNext=true 时上层把活动格下移一格。 */
  commit(moveNext) {
    const input = this.input;
    if (!input) return;
    const raw = input.value;
    const row = this.editingRow;
    const col = this.editingCol;
    this.teardown();
    this.opts.onCommit(row, col, raw, moveNext);
  }
  /** 取消编辑（丢弃输入）。 */
  cancel() {
    const input = this.input;
    if (!input) return;
    const row = this.editingRow;
    const col = this.editingCol;
    this.teardown();
    this.opts.onCancel?.(row, col);
  }
  teardown() {
    if (this.input) {
      try {
        this.input.remove();
      } catch {
      }
    }
    this.input = null;
    this.editingRow = -1;
    this.editingCol = -1;
  }
  /** 当前编辑器的值（测试/调试用）。 */
  get value() {
    return this.input?.value ?? "";
  }
  set value(v) {
    if (this.input) this.input.value = v;
  }
};

// src/render/InteractionController.ts
var HANDLE_CURSOR = {
  nw: "nwse-resize",
  se: "nwse-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize"
};
var InteractionController = class {
  constructor(opts) {
    this.opts = opts;
    this.selection = new SelectionModel(
      () => opts.sheet.getRowCount(),
      () => opts.sheet.getColumnCount()
    );
    this.editor = new CellEditor({
      host: opts.host,
      geometry: opts.geometry,
      ...opts.document ? { document: opts.document } : {},
      onCommit: (row, col, raw, moveNext) => this.commitEdit(row, col, raw, moveNext),
      onCancel: () => this.opts.onChange()
    });
    this.syncSelectionToSheet();
    this.bindEvents();
  }
  selection;
  clipboard = new Clipboard();
  /** 可编辑开关（false=只读：选区/滚动仍可用，写入类操作短路）。 */
  editable = true;
  editor;
  dragging = false;
  anchor = null;
  disposed = false;
  bound = [];
  /** 行/列拖拽调整状态。 */
  resize = null;
  /** 滚动条滑块拖拽状态：记录按下时鼠标相对滑块起点的偏移（屏幕像素）。 */
  sbDrag = null;
  /** M19-step2 拆分条拖拽状态：拖动改冻结数（可拖冻结式拆分）。 */
  splitDrag = null;
  /** 自动填充手柄拖拽状态（M10）：源区 + 当前预览目标区。 */
  fillDrag = null;
  /** 拖拽移动选区块状态（M10）：源区 + 抓取偏移（格）。 */
  moveDrag = null;
  /** 浮动对象拖拽状态（M14）：对象 id + 抓取时的屏幕偏移。 */
  objDrag = null;
  /** 浮动对象缩放状态（M14）：对象 id + 句柄 + 抓取屏幕点 + 原锚点/原屏幕矩形。 */
  objResize = null;
  /** 当前选中的浮动对象 id（M14）。 */
  selectedObjectId = null;
  // ── 事件绑定 ─────────────────────────────────────────
  on(target, type, handler, opts) {
    target.addEventListener(type, handler, opts);
    this.bound.push([target, type, handler]);
  }
  bindEvents() {
    const { canvas, host } = this.opts;
    this.on(canvas, "mousedown", (e) => this.onMouseDown(e));
    this.on(canvas, "mousemove", (e) => this.onMouseMove(e));
    const doc = this.opts.document ?? host.ownerDocument;
    this.on(doc, "mousemove", (e) => this.onDocMouseMove(e));
    this.on(doc, "mouseup", () => this.onMouseUp());
    this.on(canvas, "dblclick", (e) => this.onDblClick(e));
    this.on(host, "wheel", (e) => this.onWheel(e), { passive: false });
    this.on(host, "keydown", (e) => this.onKeyDown(e));
    this.on(host, "copy", (e) => this.onSysCopy(e, false));
    this.on(host, "cut", (e) => this.onSysCopy(e, true));
    this.on(host, "paste", (e) => this.onSysPaste(e));
    this.on(canvas, "contextmenu", (e) => this.onContextMenu(e));
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.editor.isEditing) this.editor.cancel();
    for (const [t, type, h] of this.bound) t.removeEventListener(type, h);
    this.bound.length = 0;
  }
  // ── 鼠标 ─────────────────────────────────────────────
  localPoint(e) {
    const r = this.opts.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  onMouseDown(e) {
    if (this.editor.isEditing) this.editor.commit(false);
    const p = this.localPoint(e);
    if (this.handleScrollbarDown(p.x, p.y)) {
      e.preventDefault();
      return;
    }
    if (this.handleOutlineClick(p.x, p.y)) {
      e.preventDefault();
      return;
    }
    if (p.x >= this.opts.geometry.viewport.leftOffset && p.y >= this.opts.geometry.viewport.topOffset) {
      if (this.editable && this.selectedObjectId) {
        const sel = this.opts.sheet.getFloatingObject(this.selectedObjectId);
        if (sel) {
          const rect = resolveObjectRect(sel.anchor, (r, c) => this.opts.geometry.getCellRect(r, c), this.opts.geometry.viewport.zoom);
          const handle = hitHandle(p.x, p.y, rect);
          if (handle) {
            this.objResize = { id: sel.id, handle, grabX: p.x, grabY: p.y, origAnchor: { ...sel.anchor }, origRect: rect };
            e.preventDefault();
            return;
          }
        }
      }
      const obj = this.hitFloatingObject(p.x, p.y);
      if (obj) {
        this.selectedObjectId = obj.id;
        this.opts.onObjectSelect?.(obj.id);
        if (this.editable) this.objDrag = { id: obj.id, grabX: p.x, grabY: p.y, origAnchor: { ...obj.anchor } };
        this.opts.onChange();
        e.preventDefault();
        return;
      } else if (this.selectedObjectId) {
        this.selectedObjectId = null;
        this.opts.onObjectSelect?.(null);
        this.opts.onChange();
      }
    }
    const af = this.opts.sheet.autoFilter;
    if (af && this.opts.onFilterArrow) {
      const fcol = this.opts.geometry.hitFilterArrow(p.x, p.y, af.range.col, af.range.col + af.range.colCount - 1);
      if (fcol !== null) {
        e.preventDefault();
        this.opts.onFilterArrow(fcol, p.x, p.y);
        return;
      }
    }
    const geoV = this.opts.geometry;
    if (geoV.viewport.splitCol && geoV.hitColumnSplit(p.x, p.y)) {
      this.splitDrag = { axis: "col" };
      e.preventDefault();
      return;
    }
    if (geoV.viewport.splitRow && geoV.hitRowSplit(p.x, p.y)) {
      this.splitDrag = { axis: "row" };
      e.preventDefault();
      return;
    }
    const colB = this.opts.geometry.hitColumnBorder(p.x, p.y);
    if (colB !== null) {
      this.resize = { kind: "col", index: colB, startScreen: e.clientX, origSize: this.opts.sheet.getColumnWidth(colB) };
      e.preventDefault();
      return;
    }
    const rowB = this.opts.geometry.hitRowBorder(p.x, p.y);
    if (rowB !== null) {
      this.resize = { kind: "row", index: rowB, startScreen: e.clientY, origSize: this.opts.sheet.getRowHeight(rowB) };
      e.preventDefault();
      return;
    }
    const hit = this.opts.geometry.hitTest(p.x, p.y);
    if (hit.area === "viewport") {
      const comment = this.opts.sheet.getComment(hit.row, hit.col);
      if (comment && this.opts.onCommentClick) {
        const rect = this.opts.geometry.getCellRect(hit.row, hit.col);
        if (p.x >= rect.x + rect.width - 9 && p.y <= rect.y + 9) {
          this.opts.onCommentClick(hit.row, hit.col, rect.x + rect.width, rect.y);
          e.preventDefault();
          return;
        }
      }
      const style = this.opts.sheet.getResolvedStyle(hit.row, hit.col);
      if (style.cellType === "checkbox" && this.editable) {
        const rect = this.opts.geometry.getCellRect(hit.row, hit.col);
        if (this.opts.geometry.hitCheckbox(p.x, p.y, rect)) {
          this.toggleCheckbox(hit.row, hit.col);
          e.preventDefault();
          return;
        }
      }
      const link = this.opts.sheet.getHyperlink(hit.row, hit.col);
      if (link && this.opts.onHyperlink) {
        this.opts.onHyperlink(hit.row, hit.col, link.url);
      }
      const rule = this.opts.sheet.getValidationAt(hit.row, hit.col);
      if (rule && rule.type === "list" && rule.list?.length && this.editable) {
        const rect = this.opts.geometry.getCellRect(hit.row, hit.col);
        if (this.opts.geometry.hitCellDropdown(p.x, p.y, rect)) {
          this.selection.select(hit.row, hit.col, 1, 1);
          this.afterSelectionChange();
          this.beginEdit(hit.row, hit.col);
          e.preventDefault();
          return;
        }
      }
    }
    const primary = this.selection.primary();
    if (this.editable && this.opts.geometry.hitFillHandle(p.x, p.y, primary)) {
      this.fillDrag = { source: primary, current: primary };
      e.preventDefault();
      return;
    }
    if (this.editable && hit.area === "viewport" && this.selectionContains(hit.row, hit.col) && !e.shiftKey && !e.ctrlKey && !e.metaKey && (primary.rowCount > 1 || primary.colCount > 1 || this.onSelectionBorder(p, primary))) {
      if (this.onSelectionBorder(p, primary)) {
        this.moveDrag = { source: primary, grabRow: hit.row, grabCol: hit.col, target: { row: primary.row, col: primary.col } };
        e.preventDefault();
        return;
      }
    }
    if (hit.area === "colHeader") {
      this.selection.selectColumn(hit.col);
    } else if (hit.area === "rowHeader") {
      this.selection.selectRow(hit.row);
    } else if (hit.area === "corner") {
      this.selection.selectAll();
    } else {
      if (e.shiftKey) {
        const a = this.selection.getActive();
        this.selection.selectRange(Range.fromCorners(a.row, a.col, hit.row, hit.col));
        this.selection.setActive(a.row, a.col);
      } else if (e.ctrlKey || e.metaKey) {
        this.selection.addRange(hit.row, hit.col, 1, 1);
      } else {
        this.selection.select(hit.row, hit.col, 1, 1);
      }
      this.anchor = { row: hit.row, col: hit.col };
      this.dragging = true;
    }
    this.afterSelectionChange();
  }
  onMouseMove(e) {
    if (!this.dragging && !this.resize && !this.sbDrag && !this.splitDrag) {
      const p2 = this.localPoint(e);
      const geo = this.opts.geometry;
      const overScrollbar = geo.hitScrollbar(p2.x, p2.y, geo.resolveScrollbars()) !== null;
      let objCursor = null;
      if (!overScrollbar && this.selectedObjectId) {
        const obj = this.opts.sheet.getFloatingObject(this.selectedObjectId);
        if (obj) {
          const rect = resolveObjectRect(obj.anchor, (r, c) => geo.getCellRect(r, c), geo.viewport.zoom);
          const h = hitHandle(p2.x, p2.y, rect);
          if (h) objCursor = HANDLE_CURSOR[h];
        }
      }
      const overFillHandle = !overScrollbar && !objCursor && this.editable && geo.hitFillHandle(p2.x, p2.y, this.selection.primary());
      const overColSplit = !overScrollbar && !objCursor && !overFillHandle && geo.hitColumnSplit(p2.x, p2.y);
      const overRowSplit = !overScrollbar && !objCursor && !overFillHandle && geo.hitRowSplit(p2.x, p2.y);
      const overCol = !overScrollbar && !objCursor && !overFillHandle && !overColSplit && geo.hitColumnBorder(p2.x, p2.y) !== null;
      const overRow = !overScrollbar && !objCursor && !overFillHandle && !overRowSplit && geo.hitRowBorder(p2.x, p2.y) !== null;
      const cursor = objCursor ? objCursor : overScrollbar ? "default" : overFillHandle ? "crosshair" : overColSplit || overCol ? "col-resize" : overRowSplit || overRow ? "row-resize" : "cell";
      try {
        this.opts.canvas.style.cursor = cursor;
      } catch {
      }
    }
    if (!this.dragging || !this.anchor) return;
    const p = this.localPoint(e);
    const hit = this.opts.geometry.hitTest(p.x, p.y);
    if (hit.area !== "viewport") return;
    this.selection.selectRange(Range.fromCorners(this.anchor.row, this.anchor.col, hit.row, hit.col));
    this.selection.setActive(this.anchor.row, this.anchor.col);
    this.afterSelectionChange();
  }
  /**
   * 大纲区点击处理：命中折叠钮 → 切折叠（不入撤销栈）；命中层级钮 → collapseToLevel。
   * 之后刷新可见性 + invalidate 几何 + 重绘。返回 true 表示已处理。
   */
  handleOutlineClick(x, y) {
    const sheet = this.opts.sheet;
    const hit = this.opts.geometry.hitOutlineButton(
      x,
      y,
      sheet.rowOutlines.list(),
      sheet.columnOutlines.list(),
      sheet.summaryBelow,
      sheet.summaryRight
    );
    if (!hit) return false;
    if (hit.kind === "toggle") {
      const axis = hit.axis === "row" ? sheet.rowOutlines : sheet.columnOutlines;
      const g = axis.list()[hit.groupIndex];
      if (g) axis.setCollapsedAt(hit.groupIndex, !g.collapsed);
    } else {
      const axis = hit.axis === "row" ? sheet.rowOutlines : sheet.columnOutlines;
      axis.collapseToLevel(hit.level);
    }
    sheet.applyOutlineVisibility();
    this.opts.geometry.rows.invalidate();
    this.opts.geometry.cols.invalidate();
    this.opts.geometry.viewport.bumpStructure();
    this.opts.onChange();
    return true;
  }
  /**
   * 滚动条按下：命中滑块 → 记录抓取偏移进入拖拽；命中轨道空白 → 翻一页。返回 true 已处理。
   */
  handleScrollbarDown(x, y) {
    const geo = this.opts.geometry;
    const layout = geo.resolveScrollbars();
    const hit = geo.hitScrollbar(x, y, layout);
    if (!hit) return false;
    const vp = geo.viewport;
    if (hit.part === "thumb") {
      const thumb = hit.axis === "v" ? layout.vertical.thumb : layout.horizontal.thumb;
      this.sbDrag = { axis: hit.axis, grabOffset: hit.axis === "v" ? y - thumb.y : x - thumb.x };
      return true;
    }
    if (hit.axis === "v") {
      const page = vp.contentHeight / vp.zoom;
      const dir = y < layout.vertical.thumb.y ? -1 : 1;
      vp.set({ scrollTop: vp.scrollTop + dir * page });
    } else {
      const page = vp.contentWidth / vp.zoom;
      const dir = x < layout.horizontal.thumb.x ? -1 : 1;
      vp.set({ scrollLeft: vp.scrollLeft + dir * page });
    }
    geo.clampScroll();
    if (this.editor.isEditing) this.editor.reposition();
    this.opts.onChange();
    return true;
  }
  /** document 级 move：驱动行列拖拽调整 + 滚动条滑块拖拽（鼠标可移出画布）。 */
  onDocMouseMove(e) {
    if (this.splitDrag) {
      const p = this.localPoint(e);
      const geo = this.opts.geometry;
      const vp = geo.viewport;
      if (this.splitDrag.axis === "col") {
        const n = geo.splitColToIndex(p.x);
        vp.set({ frozenColCount: n, splitCol: n > 0 });
      } else {
        const n = geo.splitRowToIndex(p.y);
        vp.set({ frozenRowCount: n, splitRow: n > 0 });
      }
      vp.bumpStructure();
      geo.clampScroll();
      if (this.editor.isEditing) this.editor.reposition();
      this.opts.onChange();
      return;
    }
    if (this.objResize) {
      const p = this.localPoint(e);
      const obj = this.opts.sheet.getFloatingObject(this.objResize.id);
      if (obj) {
        const zoom2 = this.opts.geometry.viewport.zoom;
        const dx = (p.x - this.objResize.grabX) / zoom2;
        const dy = (p.y - this.objResize.grabY) / zoom2;
        const h = this.objResize.handle;
        const orig = this.objResize.origAnchor;
        let fromDx = orig.fromDx ?? 0, fromDy = orig.fromDy ?? 0;
        let toDx = orig.toDx ?? 0, toDy = orig.toDy ?? 0;
        const west = h === "nw" || h === "w" || h === "sw";
        const east = h === "ne" || h === "e" || h === "se";
        const north = h === "nw" || h === "n" || h === "ne";
        const south = h === "sw" || h === "s" || h === "se";
        const spanX = this.objResize.origRect.width / zoom2;
        const spanY = this.objResize.origRect.height / zoom2;
        if (west) fromDx = fromDx + Math.min(dx, spanX - 8);
        if (east) toDx = toDx + Math.max(dx, 8 - spanX);
        if (north) fromDy = fromDy + Math.min(dy, spanY - 8);
        if (south) toDy = toDy + Math.max(dy, 8 - spanY);
        obj.anchor = { ...orig, fromDx, fromDy, toDx, toDy };
        this.opts.onChange();
      }
      return;
    }
    if (this.objDrag) {
      const p = this.localPoint(e);
      const dx = p.x - this.objDrag.grabX, dy = p.y - this.objDrag.grabY;
      const obj = this.opts.sheet.getFloatingObject(this.objDrag.id);
      if (obj) {
        const orig = this.objDrag.origAnchor;
        const zoom2 = this.opts.geometry.viewport.zoom;
        obj.anchor = {
          ...orig,
          fromDx: (orig.fromDx ?? 0) + dx / zoom2,
          fromDy: (orig.fromDy ?? 0) + dy / zoom2,
          toDx: (orig.toDx ?? 0) + dx / zoom2,
          toDy: (orig.toDy ?? 0) + dy / zoom2
        };
        this.opts.onChange();
      }
      return;
    }
    if (this.fillDrag) {
      const p = this.localPoint(e);
      const hit = this.opts.geometry.hitTest(p.x, p.y);
      if (hit.area === "viewport") {
        this.fillDrag.current = this.computeFillTarget(this.fillDrag.source, hit.row, hit.col);
        this.selection.selectRange(this.fillDrag.current);
        this.afterSelectionChange();
      }
      return;
    }
    if (this.moveDrag) {
      const p = this.localPoint(e);
      const hit = this.opts.geometry.hitTest(p.x, p.y);
      if (hit.area === "viewport") {
        const dr = hit.row - this.moveDrag.grabRow;
        const dc = hit.col - this.moveDrag.grabCol;
        this.moveDrag.target = { row: this.moveDrag.source.row + dr, col: this.moveDrag.source.col + dc };
        this.selection.selectRange(new Range(this.moveDrag.target.row, this.moveDrag.target.col, this.moveDrag.source.rowCount, this.moveDrag.source.colCount));
        this.afterSelectionChange();
      }
      return;
    }
    if (this.sbDrag) {
      const geo = this.opts.geometry;
      const layout = geo.resolveScrollbars();
      const p = this.localPoint(e);
      if (this.sbDrag.axis === "v") {
        geo.dragVerticalThumb(p.y - this.sbDrag.grabOffset, layout);
      } else {
        geo.dragHorizontalThumb(p.x - this.sbDrag.grabOffset, layout);
      }
      geo.clampScroll();
      if (this.editor.isEditing) this.editor.reposition();
      this.opts.onChange();
      return;
    }
    if (!this.resize) return;
    const zoom = this.opts.geometry.viewport.zoom;
    if (this.resize.kind === "col") {
      const deltaScreen = e.clientX - this.resize.startScreen;
      const newSize = Math.max(MIN_COL_WIDTH, this.resize.origSize + deltaScreen / zoom);
      this.opts.sheet.setColumnWidth(this.resize.index, newSize);
    } else {
      const deltaScreen = e.clientY - this.resize.startScreen;
      const newSize = Math.max(MIN_ROW_HEIGHT, this.resize.origSize + deltaScreen / zoom);
      this.opts.sheet.setRowHeight(this.resize.index, newSize);
    }
    this.opts.geometry.rows.invalidate();
    this.opts.geometry.cols.invalidate();
    this.opts.geometry.viewport.bumpStructure();
    if (this.editor.isEditing) this.editor.reposition();
    this.opts.onChange();
  }
  onMouseUp() {
    if (this.splitDrag) {
      this.splitDrag = null;
      this.opts.onChange();
      return;
    }
    if (this.objResize) {
      this.objResize = null;
      this.opts.onChange();
      return;
    }
    if (this.objDrag) {
      this.objDrag = null;
      this.opts.onChange();
      return;
    }
    if (this.fillDrag) {
      this.applyFill(this.fillDrag.source, this.fillDrag.current);
      this.fillDrag = null;
      return;
    }
    if (this.moveDrag) {
      const md = this.moveDrag;
      this.moveDrag = null;
      if (md.target.row !== md.source.row || md.target.col !== md.source.col) {
        this.opts.workbook.undoManager().do(moveRangeCommand(this.opts.sheet, md.source, md.target.row, md.target.col));
        this.selection.selectRange(new Range(md.target.row, md.target.col, md.source.rowCount, md.source.colCount));
        this.emitEdited(md.target.row, md.target.col);
        this.afterSelectionChange();
      }
      return;
    }
    if (this.resize) {
      if (this.resize.kind === "col") {
        const col = this.resize.index;
        this.opts.emit("cmx-col-resized", {
          col,
          letter: colLetter(col),
          px: Math.round(this.opts.sheet.getColumnWidth(col))
        });
      } else {
        const row = this.resize.index;
        this.opts.emit("cmx-row-resized", {
          row,
          rowNo: row + 1,
          px: Math.round(this.opts.sheet.getRowHeight(row))
        });
      }
      this.resize = null;
    }
    this.sbDrag = null;
    this.dragging = false;
  }
  onDblClick(e) {
    const p = this.localPoint(e);
    const colB = this.opts.geometry.hitColumnBorder(p.x, p.y);
    if (colB !== null) {
      this.autoFitColumn(colB);
      e.preventDefault();
      return;
    }
    const rowB = this.opts.geometry.hitRowBorder(p.x, p.y);
    if (rowB !== null) {
      this.autoFitRow(rowB);
      e.preventDefault();
      return;
    }
    const hit = this.opts.geometry.hitTest(p.x, p.y);
    if (hit.area === "viewport") this.beginEdit(hit.row, hit.col);
  }
  /** 自适应列宽：量测该列所有非空格显示文本，取最宽 + padding（可撤销经 resize 事件语义）。 */
  autoFitColumn(col) {
    const sheet = this.opts.sheet;
    let maxW = 24;
    const measure = this.opts.measureText;
    if (measure) {
      sheet.forEachCell((_d, row, c) => {
        if (c !== col) return;
        const v = sheet.getValue(row, col);
        if (v == null) return;
        const w = measure(String(v), sheet.getResolvedStyle(row, col)) + 10;
        if (w > maxW) maxW = w;
      });
    }
    sheet.setColumnWidth(col, Math.ceil(maxW));
    this.opts.geometry.cols.invalidate();
    this.opts.geometry.viewport.bumpStructure();
    this.opts.emit("cmx-col-resized", { col, letter: colLetter(col), px: Math.round(maxW) });
    this.opts.onChange();
  }
  /** 自适应行高：按字号取默认行高（简化：不做多行量测，用最大字号 × 1.4）。 */
  autoFitRow(row) {
    const sheet = this.opts.sheet;
    let maxH = 18;
    sheet.forEachCell((_d, r, col) => {
      if (r !== row) return;
      const st = sheet.getResolvedStyle(row, col);
      const h = (st.fontSize ?? 13) * 1.5;
      if (h > maxH) maxH = h;
    });
    sheet.setRowHeight(row, Math.ceil(maxH));
    this.opts.geometry.rows.invalidate();
    this.opts.geometry.viewport.bumpStructure();
    this.opts.emit("cmx-row-resized", { row, rowNo: row + 1, px: Math.round(maxH) });
    this.opts.onChange();
  }
  // ── 自动填充（M10）─────────────────────────────────────
  /** 拖拽预览：从源区右下角朝主导轴扩展目标区（纵向拖多于横向→向下填，反之向右）。 */
  computeFillTarget(source, hitRow, hitCol) {
    const dDown = hitRow - (source.row + source.rowCount - 1);
    const dRight = hitCol - (source.col + source.colCount - 1);
    if (Math.abs(dDown) >= Math.abs(dRight)) {
      if (dDown > 0) return new Range(source.row, source.col, source.rowCount + dDown, source.colCount);
      return source;
    } else {
      if (dRight > 0) return new Range(source.row, source.col, source.rowCount, source.colCount + dRight);
      return source;
    }
  }
  /** 应用填充：把 source 区序列外推到 target 区多出的部分（可撤销）。 */
  applyFill(source, target) {
    if (target.rowCount === source.rowCount && target.colCount === source.colCount) return;
    if (!this.guardEdit(target.row, target.col, target.rowCount, target.colCount)) return;
    const sheet = this.opts.sheet;
    const down = target.rowCount > source.rowCount;
    const axis = down ? "down" : "right";
    const targets = [];
    const filledAll = [];
    if (down) {
      for (let c = source.col; c < source.col + source.colCount; c++) {
        const src = [];
        for (let r = source.row; r < source.row + source.rowCount; r++) src.push(sheet.getCellData(r, c) ?? {});
        const extra = target.rowCount - source.rowCount;
        const filled = inferFill(src, extra, axis);
        for (let i = 0; i < extra; i++) {
          targets.push({ row: source.row + source.rowCount + i, col: c });
          filledAll.push(filled[i]);
        }
      }
    } else {
      for (let r = source.row; r < source.row + source.rowCount; r++) {
        const src = [];
        for (let c = source.col; c < source.col + source.colCount; c++) src.push(sheet.getCellData(r, c) ?? {});
        const extra = target.colCount - source.colCount;
        const filled = inferFill(src, extra, axis);
        for (let i = 0; i < extra; i++) {
          targets.push({ row: r, col: source.col + source.colCount + i });
          filledAll.push(filled[i]);
        }
      }
    }
    this.opts.workbook.undoManager().do(fillCommand(sheet, targets, filledAll));
    this.selection.selectRange(target);
    this.emitEdited(source.row, source.col);
    this.afterSelectionChange();
  }
  /** 公共：程序化填充（把 primary 选区外推到 target 区）。供 element 门面/测试。 */
  fillTo(target) {
    if (!this.editable) return;
    this.applyFill(this.selection.primary(), target);
  }
  // ── 滚轮 ─────────────────────────────────────────────
  onWheel(e) {
    e.preventDefault();
    const vp = this.opts.geometry.viewport;
    if (e.ctrlKey || e.metaKey) {
      vp.zoom = vp.zoom * (e.deltaY < 0 ? 1.1 : 0.9);
    } else {
      vp.set({
        scrollLeft: Math.max(0, vp.scrollLeft + e.deltaX),
        scrollTop: Math.max(0, vp.scrollTop + e.deltaY)
      });
      this.opts.geometry.clampScroll();
    }
    if (this.editor.isEditing) this.editor.reposition();
    this.opts.onChange();
  }
  // ── 键盘 ─────────────────────────────────────────────
  onKeyDown(e) {
    if (this.editor.isEditing) return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl) {
      const k = e.key.toLowerCase();
      if (k === "z") {
        e.preventDefault();
        this.undo();
        return;
      }
      if (k === "y") {
        e.preventDefault();
        this.redo();
        return;
      }
      if (k === "c") {
        e.preventDefault();
        this.copy();
        return;
      }
      if (k === "x") {
        e.preventDefault();
        this.cut();
        return;
      }
      if (k === "v") {
        e.preventDefault();
        this.paste();
        return;
      }
      if (k === "a") {
        e.preventDefault();
        this.selection.selectAll();
        this.afterSelectionChange();
        return;
      }
    }
    if (e.key === " " || e.code === "Space") {
      if (ctrl && !e.shiftKey) {
        e.preventDefault();
        this.selection.selectWholeColumn();
        this.afterSelectionChange();
        return;
      }
      if (e.shiftKey && !ctrl) {
        e.preventDefault();
        this.selection.selectWholeRow();
        this.afterSelectionChange();
        return;
      }
    }
    const dir = arrowDir(e.key);
    if (dir) {
      e.preventDefault();
      if (ctrl) {
        const isEmpty = (r, c) => this.opts.sheet.getValue(r, c) == null && !this.opts.sheet.getFormula(r, c);
        this.selection.jumpToEdge(dir, isEmpty, e.shiftKey);
      } else if (e.shiftKey) {
        this.selection.extend(dir);
      } else {
        this.selection.move(dir);
      }
      const a = this.selection.getActive();
      this.opts.geometry.showCell(a.row, a.col, "start");
      this.afterSelectionChange();
      return;
    }
    if (e.key === "Home") {
      e.preventDefault();
      if (ctrl) this.selection.moveToHome();
      else this.selection.moveToRowStart();
      this.showActive();
      this.afterSelectionChange();
      return;
    }
    if (e.key === "End") {
      e.preventDefault();
      const edge = this.dataEdge();
      this.selection.moveToEnd(edge.row, edge.col);
      this.showActive();
      this.afterSelectionChange();
      return;
    }
    if (e.key === "PageUp" || e.key === "PageDown") {
      e.preventDefault();
      const visRows = Math.max(1, this.opts.geometry.getViewportBottomRow() - this.opts.geometry.getViewportTopRow());
      this.selection.pageMove(e.key === "PageDown" ? visRows : -visRows, e.shiftKey);
      this.showActive();
      this.afterSelectionChange();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const a = this.selection.getActive();
      this.beginEdit(a.row, a.col);
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      this.selection.moveInSelection("right", e.shiftKey);
      this.showActive();
      this.afterSelectionChange();
      return;
    }
    if (e.key === "F2") {
      e.preventDefault();
      const a = this.selection.getActive();
      this.beginEdit(a.row, a.col);
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      this.clearSelection();
      return;
    }
    if (e.key.length === 1 && !ctrl && !e.altKey) {
      const a = this.selection.getActive();
      this.beginEdit(a.row, a.col, e.key);
      e.preventDefault();
    }
  }
  /** 把活动格滚到可见。 */
  showActive() {
    const a = this.selection.getActive();
    this.opts.geometry.showCell(a.row, a.col, "start");
  }
  /** 数据区末端（最大非空行/列）——End/Ctrl+End 用；扫过用过区，无数据回 (0,0)。 */
  dataEdge() {
    const sheet = this.opts.sheet;
    let maxR = 0, maxC = 0;
    sheet.forEachCell((_data, row, col) => {
      if (row > maxR) maxR = row;
      if (col > maxC) maxC = col;
    });
    return { row: maxR, col: maxC };
  }
  // ── 编辑 ─────────────────────────────────────────────
  beginEdit(row, col, typed) {
    if (!this.editable) return;
    const cur = this.opts.sheet;
    if (!cur.canEditCell(row, col)) {
      this.opts.emit("cmx-edit-rejected", { addr: formatAddr(row, col), row, col, reason: "protected" });
      return;
    }
    let editRow = row;
    let editCol = col;
    let span;
    const sp = cur.getSpan(row, col);
    if (sp) {
      editRow = sp.row;
      editCol = sp.col;
      span = { rowCount: sp.rowCount, colCount: sp.colCount };
    }
    const formula = cur.getFormula(editRow, editCol);
    const text = formula ? `=${formula}` : String(cur.getValue(editRow, editCol) ?? "");
    const rule = cur.getValidationAt(editRow, editCol);
    const spec = rule && rule.type === "list" && rule.list?.length ? { listValues: rule.list } : void 0;
    this.editor.begin(editRow, editCol, text, typed, span, spec);
  }
  commitEdit(row, col, raw, moveNext) {
    if (raw.charAt(0) !== "=") {
      const rule = this.opts.sheet.getValidationAt(row, col);
      if (rule) {
        const res = validateValue(rule, raw);
        if (!res.ok) {
          this.opts.emit("cmx-cell-edited", { addr: formatAddr(row, col), row, col, rejected: true, message: res.message ?? "" });
          if (this.opts.onValidationError) this.opts.onValidationError(row, col, res.message ?? "\u9A8C\u8BC1\u5931\u8D25");
          this.afterSelectionChange();
          return;
        }
      }
    }
    const um = this.opts.workbook.undoManager();
    if (raw.charAt(0) === "=") {
      um.do(setFormulaCommand(this.opts.sheet, row, col, raw));
    } else if (raw === "") {
      um.do(clearCommand(this.opts.sheet, [new Range(row, col, 1, 1)], "value"));
    } else if (!Number.isNaN(Number(raw)) && raw.trim() !== "") {
      um.do(setValueCommand(this.opts.sheet, row, col, Number(raw)));
    } else {
      um.do(setValueCommand(this.opts.sheet, row, col, raw));
    }
    this.opts.emit("cmx-cell-edited", {
      addr: formatAddr(row, col),
      row,
      col,
      value: this.opts.sheet.getValue(row, col),
      formula: this.opts.sheet.getFormula(row, col) || void 0
    });
    if (moveNext) {
      this.selection.moveInSelection("down");
    }
    this.afterSelectionChange();
  }
  /** 切换复选框格的 bool 值（M12，可撤销）。 */
  toggleCheckbox(row, col) {
    if (!this.opts.sheet.canEditCell(row, col)) {
      this.opts.emit("cmx-edit-rejected", { addr: formatAddr(row, col), row, col, reason: "protected" });
      return;
    }
    const cur = this.opts.sheet.getValue(row, col);
    const next = !(cur === true || cur === "TRUE" || cur === 1);
    this.opts.workbook.undoManager().do(setValueCommand(this.opts.sheet, row, col, next));
    this.emitEdited(row, col);
    this.afterSelectionChange();
  }
  /** M20：目标区落在保护的锁定格上 → 拒绝并派发提示。true=允许。 */
  guardEdit(row, col, rowCount = 1, colCount = 1) {
    if (!this.opts.sheet.rangeHasLocked(row, col, rowCount, colCount)) return true;
    this.opts.emit("cmx-edit-rejected", { addr: formatAddr(row, col), row, col, reason: "protected" });
    return false;
  }
  // ── 剪贴板 ───────────────────────────────────────────
  copy() {
    this.clipboard.copy(this.opts.sheet, this.selection.primary());
  }
  cut() {
    if (!this.editable) return;
    const src = this.selection.primary();
    if (!this.guardEdit(src.row, src.col, src.rowCount, src.colCount)) return;
    this.clipboard.cut(this.opts.sheet, src);
  }
  paste() {
    if (!this.editable) return;
    const a = this.selection.getActive();
    const sz = this.clipboard.size;
    if (!this.guardEdit(a.row, a.col, sz?.rowCount ?? 1, sz?.colCount ?? 1)) return;
    const res = this.clipboard.createPasteCommand(this.opts.sheet, a.row, a.col);
    if (!res) return;
    this.opts.workbook.undoManager().do(res.command);
    this.selection.selectRange(res.pastedRange);
    this.emitEdited(a.row, a.col);
    this.afterSelectionChange();
  }
  /** 选择性粘贴（M18）：以活动格为锚，按 options 投影粘贴。返回是否落格。 */
  pasteSpecial(options) {
    if (!this.editable) return false;
    const a = this.selection.getActive();
    const sz = this.clipboard.size;
    if (!this.guardEdit(a.row, a.col, sz?.rowCount ?? 1, sz?.colCount ?? 1)) return false;
    const res = this.clipboard.createPasteSpecialCommand(this.opts.sheet, a.row, a.col, options);
    if (!res) return false;
    this.opts.workbook.undoManager().do(res.command);
    this.selection.selectRange(res.pastedRange);
    this.emitEdited(a.row, a.col);
    this.afterSelectionChange();
    return true;
  }
  /** 复制当前选区到内部剪贴板（M18：供选择性粘贴的编程入口，无需 DOM execCommand）。 */
  copySelection() {
    this.copy();
  }
  // ── 系统剪贴板互通（M10）──────────────────────────────
  /** copy/cut DOM 事件：写 clipboardData 的 TSV + HTML；同时更新内部剪贴板（格内互拷保真）。 */
  onSysCopy(e, isCut) {
    if (this.editor.isEditing) return;
    const range2 = this.selection.primary();
    const dt = e.clipboardData;
    if (dt) {
      dt.setData("text/plain", serializeTSV(this.opts.sheet, range2));
      try {
        dt.setData("text/html", serializeHTML(this.opts.sheet, range2));
      } catch {
      }
      e.preventDefault();
    }
    if (isCut && this.editable) this.clipboard.cut(this.opts.sheet, range2);
    else this.clipboard.copy(this.opts.sheet, range2);
  }
  /** paste DOM 事件：优先内部剪贴板（本组件内互拷全保真）；否则解析系统 TSV/HTML 落格。 */
  onSysPaste(e) {
    if (this.editor.isEditing) return;
    if (!this.editable) return;
    if (this.clipboard.hasContent) {
      e.preventDefault();
      this.paste();
      return;
    }
    const dt = e.clipboardData;
    if (!dt) return;
    const html = dt.getData("text/html");
    const tsv = dt.getData("text/plain");
    let grid = null;
    if (html) {
      const g = parseClipboardHTML(html);
      if (g.length) grid = g;
    }
    if (!grid && tsv) grid = parseTSV(tsv);
    if (!grid || grid.length === 0) return;
    e.preventDefault();
    const a = this.selection.getActive();
    this.opts.workbook.undoManager().do(pasteExternalCommand(this.opts.sheet, a.row, a.col, grid));
    this.selection.selectRange(new Range(a.row, a.col, grid.length, grid.reduce((m, r) => Math.max(m, r.length), 0)));
    this.emitEdited(a.row, a.col);
    this.afterSelectionChange();
  }
  /** 右键菜单：先把命中格设为选区（若不在当前选区内），再交上层 onContextMenu 弹菜单。 */
  onContextMenu(e) {
    const p = this.localPoint(e);
    const hit = this.opts.geometry.hitTest(p.x, p.y);
    if (hit.area === "viewport" && !this.selectionContains(hit.row, hit.col)) {
      this.selection.select(hit.row, hit.col, 1, 1);
      this.afterSelectionChange();
    }
    if (this.opts.onContextMenu) {
      e.preventDefault();
      this.opts.onContextMenu(p.x, p.y, { row: hit.row, col: hit.col, area: hit.area });
    }
  }
  selectionContains(row, col) {
    for (const r of this.selection.getRanges()) {
      if (row >= r.row && row < r.row + r.rowCount && col >= r.col && col < r.col + r.colCount) return true;
    }
    return false;
  }
  /** 命中浮动对象（M14，按 z 从上到下）。返回命中的对象或 null。 */
  hitFloatingObject(x, y) {
    const objs = this.opts.sheet.listFloatingObjects();
    const getRect = (r, c) => this.opts.geometry.getCellRect(r, c);
    const zoom = this.opts.geometry.viewport.zoom;
    for (let i = objs.length - 1; i >= 0; i--) {
      const obj = objs[i];
      const rect = resolveObjectRect(obj.anchor, getRect, zoom);
      if (hitObject(x, y, rect)) return obj;
    }
    return null;
  }
  /** 点是否落在选区外框附近（用于区分拖移 vs 点选）——移动手柄区不含右下填充手柄。 */
  onSelectionBorder(p, sel) {
    const rect = this.opts.geometry.getCellRect(sel.row, sel.col, sel.rowCount, sel.colCount);
    const tol = 4;
    const nearL = Math.abs(p.x - rect.x) <= tol;
    const nearR = Math.abs(p.x - (rect.x + rect.width)) <= tol;
    const nearT = Math.abs(p.y - rect.y) <= tol;
    const nearB = Math.abs(p.y - (rect.y + rect.height)) <= tol;
    const inX = p.x >= rect.x - tol && p.x <= rect.x + rect.width + tol;
    const inY = p.y >= rect.y - tol && p.y <= rect.y + rect.height + tol;
    const atFillCorner = nearR && nearB;
    return !atFillCorner && ((nearL || nearR) && inY || (nearT || nearB) && inX);
  }
  clearSelection() {
    if (!this.editable) return;
    for (const r of this.selection.getRanges()) {
      if (!this.guardEdit(r.row, r.col, r.rowCount, r.colCount)) return;
    }
    const um = this.opts.workbook.undoManager();
    um.do(clearCommand(this.opts.sheet, this.selection.getRanges(), "all"));
    const a = this.selection.getActive();
    this.emitEdited(a.row, a.col);
    this.opts.onChange();
  }
  // ── 撤销/重做 ───────────────────────────────────────
  undo() {
    const a = this.opts.workbook.undoManager().undo();
    if (a) {
      const act = this.selection.getActive();
      this.emitEdited(act.row, act.col);
      this.opts.onChange();
    }
    return a;
  }
  redo() {
    const a = this.opts.workbook.undoManager().redo();
    if (a) {
      const act = this.selection.getActive();
      this.emitEdited(act.row, act.col);
      this.opts.onChange();
    }
    return a;
  }
  // ── 选区同步 & 事件 ─────────────────────────────────
  /**
   * 选区归一：把当前选区扩展到覆盖相交的合并区；若活动格落在某合并区内，
   * 把活动格移到该合并区左上（编辑锚点，对齐 Excel）。所有选区变更的统一收口。
   */
  normalizeSelectionToSpans() {
    const primary = this.selection.primary();
    const expanded = this.opts.sheet.expandRangeToSpans(primary);
    if (!expanded.equals(primary)) {
      const active = this.selection.getActive();
      this.selection.selectRange(expanded);
      this.selection.setActive(active.row, active.col);
    }
    const a = this.selection.getActive();
    const span = this.opts.sheet.getSpan(a.row, a.col);
    if (span && (span.row !== a.row || span.col !== a.col)) {
      this.selection.setActive(span.row, span.col);
    }
  }
  /** 把 SelectionModel 状态写回 Worksheet（供渲染画选区）。 */
  syncSelectionToSheet() {
    const ranges = this.selection.getRanges();
    const first = ranges[0];
    this.opts.sheet.setSelection(first.row, first.col, first.rowCount, first.colCount);
    for (let i = 1; i < ranges.length; i++) {
      const r = ranges[i];
      this.opts.sheet.addSelection(r.row, r.col, r.rowCount, r.colCount);
    }
    const a = this.selection.getActive();
    this.opts.sheet.setActiveCell(a.row, a.col);
  }
  afterSelectionChange() {
    this.normalizeSelectionToSpans();
    this.syncSelectionToSheet();
    const a = this.selection.getActive();
    this.opts.emit("cmx-cell-selected", {
      addr: formatAddr(a.row, a.col),
      row: a.row,
      col: a.col,
      selection: this.primaryA1()
    });
    this.opts.onChange();
  }
  emitEdited(row, col) {
    this.opts.emit("cmx-cell-edited", {
      addr: formatAddr(row, col),
      row,
      col,
      value: this.opts.sheet.getValue(row, col),
      formula: this.opts.sheet.getFormula(row, col) || void 0
    });
  }
  primaryA1() {
    const p = this.selection.primary();
    const a = formatAddr(p.row, p.col);
    const b = formatAddr(p.lastRow, p.lastCol);
    return a === b ? a : `${a}:${b}`;
  }
  /** 当前活动格 A1（供公式栏等外部读取）。 */
  getActiveAddr() {
    const a = this.selection.getActive();
    return formatAddr(a.row, a.col);
  }
};
function arrowDir(key2) {
  switch (key2) {
    case "ArrowUp":
      return "up";
    case "ArrowDown":
      return "down";
    case "ArrowLeft":
      return "left";
    case "ArrowRight":
      return "right";
    default:
      return null;
  }
}
function colLetter(col) {
  return colToLabel(col);
}
var MIN_COL_WIDTH = 20;
var MIN_ROW_HEIGHT = 12;

// src/render/SheetTabStrip.ts
var SheetTabStrip = class {
  constructor(opts) {
    this.opts = opts;
    this.doc = opts.document ?? opts.host.ownerDocument;
    this.root = this.doc.createElement("div");
    this.root.className = "cmx-tabstrip";
    this.opts.host.appendChild(this.root);
    this.render();
  }
  doc;
  root;
  /** 拖拽排序：正在拖动的页签源索引。 */
  dragIndex = null;
  /** 换簿覆盖引用（io 导入后指向新簿；null 时用 opts.workbook）。 */
  wbOverride = null;
  /**
   * 切换到另一个工作簿（io 导入整体换簿后调用）。opts.workbook 是只读引用，
   * 故存一个可变覆盖引用，render/activate 等一律经 wb() 取当前簿。
   */
  setWorkbook(wb) {
    this.wbOverride = wb;
    this.render();
  }
  /** 当前工作簿（换簿覆盖优先）。 */
  wb() {
    return this.wbOverride ?? this.opts.workbook;
  }
  /** 重绘页签栏（sheet 增删/改名/切换后调用）。 */
  render() {
    const wb = this.wb();
    const active = wb.getActiveSheetIndex();
    const count = wb.getSheetCount();
    this.root.textContent = "";
    const navBtn = (label, title, disabled, on) => {
      const b = this.doc.createElement("button");
      b.className = "cmx-tab-nav";
      b.textContent = label;
      b.title = title;
      b.disabled = disabled;
      if (!disabled) b.addEventListener("click", on);
      this.root.appendChild(b);
      return b;
    };
    navBtn("\u23EE", "\u7B2C\u4E00\u4E2A", active <= 0, () => this.activate(0));
    navBtn("\u25C0", "\u4E0A\u4E00\u4E2A", active <= 0, () => this.activate(active - 1));
    const tabsWrap = this.doc.createElement("div");
    tabsWrap.className = "cmx-tabs";
    for (let i = 0; i < count; i++) {
      const sheet = wb.getSheet(i);
      if (!sheet) continue;
      const tab = this.doc.createElement("button");
      tab.className = "cmx-tab" + (i === active ? " active" : "");
      tab.textContent = sheet.name();
      tab.dataset.index = String(i);
      tab.draggable = true;
      tab.addEventListener("click", () => this.activate(i));
      tab.addEventListener("dblclick", () => this.rename(i));
      tab.addEventListener("dragstart", (e) => this.onDragStart(e, i));
      tab.addEventListener("dragover", (e) => this.onDragOver(e, tab));
      tab.addEventListener("dragleave", () => tab.classList.remove("cmx-tab-dropbefore", "cmx-tab-dropafter"));
      tab.addEventListener("drop", (e) => this.onDrop(e, i, tab));
      tab.addEventListener("dragend", () => this.clearDropMarkers());
      tabsWrap.appendChild(tab);
    }
    this.root.appendChild(tabsWrap);
    navBtn("\u25B6", "\u4E0B\u4E00\u4E2A", active >= count - 1, () => this.activate(active + 1));
    navBtn("\u23ED", "\u6700\u540E\u4E00\u4E2A", active >= count - 1, () => this.activate(count - 1));
    navBtn("\uFF0B", "\u65B0\u5EFA\u5DE5\u4F5C\u8868", false, () => this.addSheet());
    navBtn("\u2715", "\u5220\u9664\u5F53\u524D\u5DE5\u4F5C\u8868", count <= 1, () => this.removeSheet(active));
  }
  activate(index) {
    const wb = this.wb();
    const clamped = Math.max(0, Math.min(index, wb.getSheetCount() - 1));
    wb.setActiveSheetIndex(clamped);
    this.render();
    this.opts.onActiveChange(clamped);
    const sheet = wb.getSheet(clamped);
    if (sheet) this.opts.emit?.({ index: clamped, name: sheet.name() });
  }
  // ── 拖拽排序 ─────────────────────────────────────────
  onDragStart(e, index) {
    this.dragIndex = index;
    try {
      e.dataTransfer?.setData("text/plain", String(index));
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
    } catch {
    }
  }
  /** 拖到某页签上：按落点在页签左/右半边，标记插入位置。 */
  onDragOver(e, tab) {
    if (this.dragIndex === null) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    const rect = tab.getBoundingClientRect();
    const before = rect.width ? e.clientX - rect.left < rect.width / 2 : true;
    tab.classList.toggle("cmx-tab-dropbefore", before);
    tab.classList.toggle("cmx-tab-dropafter", !before);
  }
  onDrop(e, targetIndex, tab) {
    e.preventDefault();
    const from = this.dragIndex;
    this.clearDropMarkers();
    this.dragIndex = null;
    if (from === null || from === targetIndex) return;
    const rect = tab.getBoundingClientRect();
    const after = rect.width ? e.clientX - rect.left >= rect.width / 2 : false;
    let to = targetIndex + (after ? 1 : 0);
    if (from < to) to -= 1;
    this.wb().moveSheet(from, to);
    this.render();
    const wb = this.wb();
    const cur = wb.getActiveSheet();
    if (cur) this.opts.emit?.({ index: wb.getActiveSheetIndex(), name: cur.name() });
    this.opts.onActiveChange(wb.getActiveSheetIndex());
  }
  clearDropMarkers() {
    for (const el of Array.from(this.root.querySelectorAll(".cmx-tab-dropbefore, .cmx-tab-dropafter"))) {
      el.classList.remove("cmx-tab-dropbefore", "cmx-tab-dropafter");
    }
  }
  addSheet() {
    const wb = this.wb();
    const at = wb.getSheetCount();
    if (this.opts.createSheet) {
      this.opts.createSheet(at);
    } else {
      wb.appendSheet();
    }
    this.activate(at);
  }
  removeSheet(index) {
    const wb = this.wb();
    if (wb.getSheetCount() <= 1) return;
    wb.removeSheet(index);
    this.activate(Math.min(index, wb.getSheetCount() - 1));
  }
  rename(index) {
    const wb = this.wb();
    const sheet = wb.getSheet(index);
    if (!sheet) return;
    let next = null;
    try {
      next = this.doc.defaultView?.prompt?.("\u91CD\u547D\u540D\u5DE5\u4F5C\u8868", sheet.name()) ?? null;
    } catch {
      next = null;
    }
    if (next && next.trim()) {
      sheet.name(next.trim());
      this.render();
      this.opts.emit?.({ index, name: sheet.name() });
    }
  }
  dispose() {
    try {
      this.root.remove();
    } catch {
    }
  }
};

// src/formula/value.ts
var FORMULA_ERRORS = [
  "#DIV/0!",
  "#VALUE!",
  "#REF!",
  "#NAME?",
  "#NUM!",
  "#N/A",
  "#SPILL!",
  "#CIRC!"
];
function isError(v) {
  return typeof v === "string" && FORMULA_ERRORS.includes(v);
}
function isBlank(v) {
  return v === null || v === void 0 || v === "";
}
function toNumber(v) {
  if (isError(v)) return v;
  if (v === null || v === void 0 || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : "#NUM!";
  if (typeof v === "boolean") return v ? 1 : 0;
  const s = v.trim();
  if (s === "") return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : "#VALUE!";
}
function toText(v) {
  if (isError(v)) return v;
  if (v === null || v === void 0) return "";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "number") return numberToText(v);
  return v;
}
function toBoolean(v) {
  if (isError(v)) return v;
  if (v === null || v === void 0 || v === "") return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  const s = v.trim().toUpperCase();
  if (s === "TRUE") return true;
  if (s === "FALSE") return false;
  const n = Number(s);
  if (Number.isFinite(n)) return n !== 0;
  return "#VALUE!";
}
function numberToText(n) {
  if (!Number.isFinite(n)) return String(n);
  if (Number.isInteger(n)) return String(n);
  return String(Number(n.toPrecision(15)));
}
function compareValues(a, b, op) {
  if (isError(a)) return a;
  if (isError(b)) return b;
  const cmp = rawCompare(a, b);
  switch (op) {
    case "=":
      return cmp === 0;
    case "<>":
      return cmp !== 0;
    case "<":
      return cmp < 0;
    case ">":
      return cmp > 0;
    case "<=":
      return cmp <= 0;
    case ">=":
      return cmp >= 0;
    default:
      return "#VALUE!";
  }
}
function typeRank(v) {
  if (v === null || v === void 0 || v === "") return 0;
  if (typeof v === "number") return 0;
  if (typeof v === "string") return 1;
  return 2;
}
function rawCompare(a, b) {
  const ra = typeRank(a);
  const rb = typeRank(b);
  if (ra !== rb) return ra < rb ? -1 : 1;
  if (ra === 0) {
    const na = a === null || a === "" ? 0 : a;
    const nb = b === null || b === "" ? 0 : b;
    return na < nb ? -1 : na > nb ? 1 : 0;
  }
  if (ra === 1) {
    const sa = String(a).toUpperCase();
    const sb = String(b).toUpperCase();
    return sa < sb ? -1 : sa > sb ? 1 : 0;
  }
  const ba = a ? 1 : 0;
  const bb = b ? 1 : 0;
  return ba - bb;
}

// src/formula/Evaluator.ts
var TRUE_NAMES = { TRUE: true, FALSE: false };
var Evaluator = class {
  constructor(registry) {
    this.registry = registry;
  }
  /** 求值一个 AST → 标量 FormulaValue（区域在标量上下文取左上角）。 */
  evaluate(node, ctx) {
    const r = this.evalNode(node, ctx);
    if (r.kind === "range") {
      return r.values[0]?.[0] ?? null;
    }
    return r.value;
  }
  evalNode(node, ctx) {
    switch (node.kind) {
      case "number":
        return { kind: "value", value: node.value };
      case "string":
        return { kind: "value", value: node.value };
      case "name":
        return this.evalNameNode(node.name, ctx);
      case "ref":
        return { kind: "value", value: ctx.accessor.getCellValue(node.ref) };
      case "range":
        return { kind: "range", values: ctx.accessor.getRangeValues(node.start, node.end) };
      case "array":
        return { kind: "range", values: this.evalArray(node.rows, ctx) };
      case "unary":
        return { kind: "value", value: this.evalUnary(node.op, node.operand, ctx) };
      case "binary":
        return { kind: "value", value: this.evalBinary(node.op, node.left, node.right, ctx) };
      case "call":
        return { kind: "value", value: this.evalCall(node.name, node.args, ctx) };
    }
  }
  /** 数组字面量 {1,2;3,4} → 二维值（各元素按标量求值）。 */
  evalArray(rows, ctx) {
    return rows.map((row) => row.map((cell) => this.evaluate(cell, ctx)));
  }
  /**
   * 命名节点求值：先试 resolveNameRef（命名区域→引用文本，重解析为 ref/range，支持 SUM(myRange)），
   * 再退回标量 resolveName（TRUE/FALSE/标量命名）；都无 → #NAME?。
   */
  evalNameNode(name, ctx) {
    const upper = name.toUpperCase();
    if (upper in TRUE_NAMES) return { kind: "value", value: TRUE_NAMES[upper] };
    const ref = ctx.accessor.resolveNameRef?.(name);
    if (ref !== void 0) {
      const colon = splitTopRange(ref);
      if (colon) return { kind: "range", values: ctx.accessor.getRangeValues(colon.start, colon.end) };
      return { kind: "value", value: ctx.accessor.getCellValue(ref) };
    }
    const resolved = ctx.accessor.resolveName?.(name);
    return { kind: "value", value: resolved !== void 0 ? resolved : "#NAME?" };
  }
  evalUnary(op, operand, ctx) {
    const v = this.evaluate(operand, ctx);
    if (isError(v)) return v;
    if (op === "-") {
      const n = toNumber(v);
      return isError(n) ? n : -n;
    }
    if (op === "%") {
      const n = toNumber(v);
      return isError(n) ? n : n / 100;
    }
    return v;
  }
  evalBinary(op, left, right, ctx) {
    const a = this.evaluate(left, ctx);
    const b = this.evaluate(right, ctx);
    if (isError(a)) return a;
    if (isError(b)) return b;
    if (op === "=" || op === "<>" || op === "<" || op === ">" || op === "<=" || op === ">=") {
      return compareValues(a, b, op);
    }
    if (op === "&") {
      const ta = toText(a);
      if (isError(ta)) return ta;
      const tb = toText(b);
      if (isError(tb)) return tb;
      return ta + tb;
    }
    const na = toNumber(a);
    if (isError(na)) return na;
    const nb = toNumber(b);
    if (isError(nb)) return nb;
    switch (op) {
      case "+":
        return na + nb;
      case "-":
        return na - nb;
      case "*":
        return na * nb;
      case "/":
        return nb === 0 ? "#DIV/0!" : na / nb;
      case "^": {
        const r = Math.pow(na, nb);
        return Number.isFinite(r) ? r : "#NUM!";
      }
      default:
        return "#VALUE!";
    }
  }
  evalCall(name, argNodes, ctx) {
    const fn = this.registry.get(name);
    if (!fn) return "#NAME?";
    const args = argNodes.map((n) => this.evalNode(n, ctx));
    try {
      return fn(args, ctx);
    } catch {
      return "#VALUE!";
    }
  }
};
function flattenArg(arg) {
  if (arg.kind === "value") return [arg.value];
  const out = [];
  for (const row of arg.values) for (const v of row) out.push(v);
  return out;
}
function flattenArgs(args) {
  const out = [];
  for (const a of args) out.push(...flattenArg(a));
  return out;
}
function scalarArg(arg) {
  if (!arg) return null;
  if (arg.kind === "value") return arg.value;
  return arg.values[0]?.[0] ?? null;
}
function firstError(values) {
  for (const v of values) if (isError(v)) return v;
  return null;
}
function splitTopRange(ref) {
  const idx = ref.indexOf(":");
  if (idx < 0) return null;
  return { start: ref.slice(0, idx), end: ref.slice(idx + 1) };
}

// src/formula/builtins/helpers.ts
function isErr(x) {
  return typeof x === "string" && FORMULA_ERRORS.includes(x);
}
function reqNum(arg) {
  return toNumber(scalarArg(arg));
}
function optNum(arg, def) {
  if (arg === void 0) return def;
  const v = scalarArg(arg);
  if (isBlank(v)) return def;
  return toNumber(v);
}
function collectNumbers(args) {
  const out = [];
  for (const v of flattenArgs(args)) {
    if (isError(v)) return v;
    if (isBlank(v)) continue;
    if (typeof v === "number") {
      out.push(v);
      continue;
    }
    if (typeof v === "boolean") {
      out.push(v ? 1 : 0);
      continue;
    }
    const n = Number(String(v).trim());
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}
function strictNumbers(values) {
  const out = [];
  for (const v of values) {
    if (isError(v)) return v;
    if (isBlank(v)) continue;
    const n = toNumber(v);
    if (isError(n)) return n;
    out.push(n);
  }
  return out;
}
function isNums(x) {
  return Array.isArray(x);
}
function mean(ns) {
  return ns.reduce((a, b) => a + b, 0) / ns.length;
}

// src/formula/builtins/math.ts
var PI = Math.PI;
function finite(x) {
  return Number.isFinite(x) ? x : "#NUM!";
}
function m1(f2) {
  return (args) => {
    const n = reqNum(args[0]);
    if (isError(n)) return n;
    const r = f2(n);
    return typeof r === "number" ? finite(r) : r;
  };
}
function m2(f2) {
  return (args) => {
    const a = reqNum(args[0]);
    if (isError(a)) return a;
    const b = reqNum(args[1]);
    if (isError(b)) return b;
    const r = f2(a, b);
    return typeof r === "number" ? finite(r) : r;
  };
}
function factorial(n) {
  n = Math.trunc(n);
  if (n < 0) return "#NUM!";
  let r = 1;
  for (let i = 2; i <= n; i++) {
    r *= i;
    if (!Number.isFinite(r)) return "#NUM!";
  }
  return r;
}
function factDouble(n) {
  n = Math.trunc(n);
  if (n < -1) return "#NUM!";
  let r = 1;
  for (let i = n; i > 1; i -= 2) {
    r *= i;
    if (!Number.isFinite(r)) return "#NUM!";
  }
  return r;
}
function combin(n, k) {
  n = Math.trunc(n);
  k = Math.trunc(k);
  if (n < 0 || k < 0 || k > n) return "#NUM!";
  k = Math.min(k, n - k);
  let r = 1;
  for (let i = 1; i <= k; i++) {
    r = r * (n - k + i) / i;
    if (!Number.isFinite(r)) return "#NUM!";
  }
  return Math.round(r);
}
function permut(n, k) {
  n = Math.trunc(n);
  k = Math.trunc(k);
  if (n < 0 || k < 0 || k > n) return "#NUM!";
  let r = 1;
  for (let i = 0; i < k; i++) {
    r *= n - i;
    if (!Number.isFinite(r)) return "#NUM!";
  }
  return r;
}
function toBaseText(value, radix, minLen) {
  value = Math.trunc(value);
  radix = Math.trunc(radix);
  if (radix < 2 || radix > 36) return "#NUM!";
  if (value < 0) return "#NUM!";
  let s = value.toString(radix).toUpperCase();
  if (minLen > s.length) s = "0".repeat(minLen - s.length) + s;
  return s;
}
var ROMAN_MAP = [
  [1e3, "M"],
  [900, "CM"],
  [500, "D"],
  [400, "CD"],
  [100, "C"],
  [90, "XC"],
  [50, "L"],
  [40, "XL"],
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"]
];
function toRoman(n) {
  n = Math.trunc(n);
  if (n < 0 || n > 3999) return "#VALUE!";
  if (n === 0) return "";
  let out = "";
  for (const [v, sym] of ROMAN_MAP) {
    while (n >= v) {
      out += sym;
      n -= v;
    }
  }
  return out;
}
function fromRoman(text) {
  const s = text.trim().toUpperCase();
  const val = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1e3 };
  let total = 0, prev = 0, sign = 1;
  let str = s;
  if (str.startsWith("-")) {
    sign = -1;
    str = str.slice(1);
  }
  for (let i = str.length - 1; i >= 0; i--) {
    const c = str[i];
    const v = val[c];
    if (v === void 0) return "#VALUE!";
    if (v < prev) total -= v;
    else {
      total += v;
      prev = v;
    }
  }
  return sign * total;
}
var MATH_BUILTINS = {
  // 常量 / 指数 / 对数
  PI: () => PI,
  EXP: m1((x) => Math.exp(x)),
  LN: m1((x) => x <= 0 ? "#NUM!" : Math.log(x)),
  LOG10: m1((x) => x <= 0 ? "#NUM!" : Math.log10(x)),
  LOG: (args) => {
    const x = reqNum(args[0]);
    if (isError(x)) return x;
    const base = optNum(args[1], 10);
    if (isError(base)) return base;
    if (x <= 0 || base <= 0 || base === 1) return "#NUM!";
    return finite(Math.log(x) / Math.log(base));
  },
  SQRTPI: m1((x) => x < 0 ? "#NUM!" : Math.sqrt(x * PI)),
  // 三角
  SIN: m1((x) => Math.sin(x)),
  COS: m1((x) => Math.cos(x)),
  TAN: m1((x) => Math.tan(x)),
  ASIN: m1((x) => x < -1 || x > 1 ? "#NUM!" : Math.asin(x)),
  ACOS: m1((x) => x < -1 || x > 1 ? "#NUM!" : Math.acos(x)),
  ATAN: m1((x) => Math.atan(x)),
  ATAN2: m2((xnum, ynum) => xnum === 0 && ynum === 0 ? "#DIV/0!" : Math.atan2(ynum, xnum)),
  // Excel: ATAN2(x_num, y_num)
  SINH: m1((x) => Math.sinh(x)),
  COSH: m1((x) => Math.cosh(x)),
  TANH: m1((x) => Math.tanh(x)),
  ASINH: m1((x) => Math.asinh(x)),
  ACOSH: m1((x) => x < 1 ? "#NUM!" : Math.acosh(x)),
  ATANH: m1((x) => x <= -1 || x >= 1 ? "#NUM!" : Math.atanh(x)),
  SEC: m1((x) => 1 / Math.cos(x)),
  CSC: m1((x) => 1 / Math.sin(x)),
  COT: m1((x) => 1 / Math.tan(x)),
  SECH: m1((x) => 1 / Math.cosh(x)),
  CSCH: m1((x) => 1 / Math.sinh(x)),
  COTH: m1((x) => 1 / Math.tanh(x)),
  ACOT: m1((x) => PI / 2 - Math.atan(x)),
  // Excel ACOT ∈ (0, π)
  ACOTH: m1((x) => Math.abs(x) <= 1 ? "#NUM!" : Math.atanh(1 / x)),
  // 角度
  DEGREES: m1((x) => x * 180 / PI),
  RADIANS: m1((x) => x * PI / 180),
  // 组合数学
  FACT: (args) => {
    const n = reqNum(args[0]);
    return isError(n) ? n : factorial(n);
  },
  FACTDOUBLE: (args) => {
    const n = reqNum(args[0]);
    return isError(n) ? n : factDouble(n);
  },
  COMBIN: (args) => {
    const n = reqNum(args[0]);
    if (isError(n)) return n;
    const k = reqNum(args[1]);
    if (isError(k)) return k;
    return combin(n, k);
  },
  COMBINA: (args) => {
    const n = reqNum(args[0]);
    if (isError(n)) return n;
    const k = reqNum(args[1]);
    if (isError(k)) return k;
    const nn = Math.trunc(n), kk = Math.trunc(k);
    if (nn < 0 || kk < 0) return "#NUM!";
    if (nn === 0 && kk === 0) return 1;
    return combin(nn + kk - 1, kk);
  },
  PERMUT: (args) => {
    const n = reqNum(args[0]);
    if (isError(n)) return n;
    const k = reqNum(args[1]);
    if (isError(k)) return k;
    return permut(n, k);
  },
  PERMUTATIONA: (args) => {
    const n = reqNum(args[0]);
    if (isError(n)) return n;
    const k = reqNum(args[1]);
    if (isError(k)) return k;
    const nn = Math.trunc(n), kk = Math.trunc(k);
    if (nn < 0 || kk < 0) return "#NUM!";
    return finite(Math.pow(nn, kk));
  },
  MULTINOMIAL: (args) => {
    let sum = 0, denom = 1;
    for (const a of args) {
      for (const raw of flattenArg(a)) {
        const n = reqNum({ kind: "value", value: raw });
        if (isError(n)) return n;
        const t = Math.trunc(n);
        if (t < 0) return "#NUM!";
        sum += t;
        const f2 = factorial(t);
        if (isError(f2)) return f2;
        denom *= f2;
      }
    }
    const total = factorial(sum);
    if (isError(total)) return total;
    return finite(total / denom);
  },
  QUOTIENT: (args) => {
    const a = reqNum(args[0]);
    if (isError(a)) return a;
    const b = reqNum(args[1]);
    if (isError(b)) return b;
    return b === 0 ? "#DIV/0!" : Math.trunc(a / b);
  },
  // 取整兄弟（Excel 现代化家族）
  "CEILING.MATH": (args) => ceilingFloorMath(args, "ceil"),
  "FLOOR.MATH": (args) => ceilingFloorMath(args, "floor"),
  "CEILING.PRECISE": (args) => precise(args, "ceil"),
  "ISO.CEILING": (args) => precise(args, "ceil"),
  "FLOOR.PRECISE": (args) => precise(args, "floor"),
  // 进制
  BASE: (args) => {
    const v = reqNum(args[0]);
    if (isError(v)) return v;
    const radix = reqNum(args[1]);
    if (isError(radix)) return radix;
    const minLen = optNum(args[2], 0);
    if (isError(minLen)) return minLen;
    return toBaseText(v, radix, Math.trunc(minLen));
  },
  DECIMAL: (args) => {
    const t = toText(scalarArg(args[0]));
    if (isError(t)) return t;
    const radix = reqNum(args[1]);
    if (isError(radix)) return radix;
    const r = Math.trunc(radix);
    if (r < 2 || r > 36) return "#NUM!";
    const n = parseInt(t.trim(), r);
    return Number.isFinite(n) ? n : "#NUM!";
  },
  ROMAN: (args) => {
    const n = reqNum(args[0]);
    return isError(n) ? n : toRoman(n);
  },
  ARABIC: (args) => {
    const t = toText(scalarArg(args[0]));
    return isError(t) ? t : fromRoman(t);
  },
  // 幂级数
  SERIESSUM: (args) => {
    const x = reqNum(args[0]);
    if (isError(x)) return x;
    const nStart = reqNum(args[1]);
    if (isError(nStart)) return nStart;
    const m = reqNum(args[2]);
    if (isError(m)) return m;
    const coeffs = args[3] ? flattenArg(args[3]) : [];
    let total = 0;
    for (let i = 0; i < coeffs.length; i++) {
      const c = reqNum({ kind: "value", value: coeffs[i] });
      if (isError(c)) return c;
      total += c * Math.pow(x, nStart + i * m);
    }
    return finite(total);
  },
  // 随机（注：本引擎 NOW/TODAY 亦为非 volatile 内置，随重算刷新，不逐帧）
  RAND: () => Math.random(),
  RANDBETWEEN: (args) => {
    const lo = reqNum(args[0]);
    if (isError(lo)) return lo;
    const hi = reqNum(args[1]);
    if (isError(hi)) return hi;
    const a = Math.ceil(lo), b = Math.floor(hi);
    if (a > b) return "#NUM!";
    return a + Math.floor(Math.random() * (b - a + 1));
  }
};
function ceilingFloorMath(args, dir) {
  const x = reqNum(args[0]);
  if (isError(x)) return x;
  const sigRaw = optNum(args[1], 1);
  if (isError(sigRaw)) return sigRaw;
  const modeRaw = optNum(args[2], 0);
  if (isError(modeRaw)) return modeRaw;
  const s = Math.abs(sigRaw);
  if (s === 0) return 0;
  const q = x / s;
  let r;
  if (dir === "ceil") {
    r = x >= 0 || modeRaw === 0 ? Math.ceil(q) : Math.floor(q);
  } else {
    r = x >= 0 || modeRaw === 0 ? Math.floor(q) : Math.ceil(q);
  }
  return finite(r * s);
}
function precise(args, dir) {
  const x = reqNum(args[0]);
  if (isError(x)) return x;
  const sigRaw = optNum(args[1], 1);
  if (isError(sigRaw)) return sigRaw;
  const s = Math.abs(sigRaw);
  if (s === 0) return 0;
  const q = x / s;
  return finite((dir === "ceil" ? Math.ceil(q) : Math.floor(q)) * s);
}

// src/formula/builtins/financial.ts
function pow1p(rate, n) {
  return Math.pow(1 + rate, n);
}
function fvOf(rate, nper, pmt, pv, type) {
  if (rate === 0) return -(pv + pmt * nper);
  const f2 = pow1p(rate, nper);
  return -(pv * f2 + pmt * (1 + rate * type) * (f2 - 1) / rate);
}
function pmtOf(rate, nper, pv, fv, type) {
  if (nper === 0) return NaN;
  if (rate === 0) return -(pv + fv) / nper;
  const f2 = pow1p(rate, nper);
  return -(pv * f2 + fv) * rate / ((1 + rate * type) * (f2 - 1));
}
function pvOf(rate, nper, pmt, fv, type) {
  if (rate === 0) return -(fv + pmt * nper);
  const f2 = pow1p(rate, nper);
  return -(fv + pmt * (1 + rate * type) * (f2 - 1) / rate) / f2;
}
function nperOf(rate, pmt, pv, fv, type) {
  if (rate === 0) {
    if (pmt === 0) return NaN;
    return -(pv + fv) / pmt;
  }
  const t = pmt * (1 + rate * type) / rate;
  const num3 = t - fv;
  const den = pv + t;
  if (den === 0 || num3 / den <= 0) return NaN;
  return Math.log(num3 / den) / Math.log(1 + rate);
}
function ipmtOf(rate, per, nper, pv, fv, type) {
  if (per < 1 || per > nper) return "#NUM!";
  const pmt = pmtOf(rate, nper, pv, fv, type);
  let ip;
  if (type === 0) {
    const bal = fvOf(rate, per - 1, pmt, pv, 0);
    ip = bal * rate;
  } else {
    if (per === 1) ip = 0;
    else {
      const bal = fvOf(rate, per - 2, pmt, pv, 1);
      ip = bal * rate;
    }
  }
  return ip;
}
function solveRate(f2, guess) {
  let r = guess;
  for (let i = 0; i < 80; i++) {
    const y = f2(r);
    if (!Number.isFinite(y)) break;
    if (Math.abs(y) < 1e-9) return r;
    const dr = 1e-6;
    const dy = (f2(r + dr) - y) / dr;
    if (!Number.isFinite(dy) || dy === 0) break;
    const next = r - y / dy;
    if (!Number.isFinite(next)) break;
    if (Math.abs(next - r) < 1e-9) return next;
    r = next;
  }
  let lo = -0.999999, hi = 10;
  let flo = f2(lo);
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fm = f2(mid);
    if (!Number.isFinite(fm)) return NaN;
    if (Math.abs(fm) < 1e-9) return mid;
    if (flo < 0 !== fm < 0) {
      hi = mid;
    } else {
      lo = mid;
      flo = fm;
    }
  }
  return NaN;
}
function npvAt(rate, flows) {
  let sum = 0;
  for (let i = 0; i < flows.length; i++) sum += flows[i] / Math.pow(1 + rate, i + 1);
  return sum;
}
function xnpvAt(rate, flows, dates) {
  const d0 = dates[0];
  let sum = 0;
  for (let i = 0; i < flows.length; i++) {
    sum += flows[i] / Math.pow(1 + rate, (dates[i] - d0) / 365);
  }
  return sum;
}
function numResult(x) {
  return Number.isFinite(x) ? x : "#NUM!";
}
var FINANCIAL_BUILTINS = {
  PMT: (args) => {
    const rate = reqNum(args[0]);
    if (isError(rate)) return rate;
    const nper = reqNum(args[1]);
    if (isError(nper)) return nper;
    const pv = reqNum(args[2]);
    if (isError(pv)) return pv;
    const fv = optNum(args[3], 0);
    if (isError(fv)) return fv;
    const type = optNum(args[4], 0);
    if (isError(type)) return type;
    return numResult(pmtOf(rate, nper, pv, fv, type));
  },
  FV: (args) => {
    const rate = reqNum(args[0]);
    if (isError(rate)) return rate;
    const nper = reqNum(args[1]);
    if (isError(nper)) return nper;
    const pmt = reqNum(args[2]);
    if (isError(pmt)) return pmt;
    const pv = optNum(args[3], 0);
    if (isError(pv)) return pv;
    const type = optNum(args[4], 0);
    if (isError(type)) return type;
    return numResult(fvOf(rate, nper, pmt, pv, type));
  },
  PV: (args) => {
    const rate = reqNum(args[0]);
    if (isError(rate)) return rate;
    const nper = reqNum(args[1]);
    if (isError(nper)) return nper;
    const pmt = reqNum(args[2]);
    if (isError(pmt)) return pmt;
    const fv = optNum(args[3], 0);
    if (isError(fv)) return fv;
    const type = optNum(args[4], 0);
    if (isError(type)) return type;
    return numResult(pvOf(rate, nper, pmt, fv, type));
  },
  NPER: (args) => {
    const rate = reqNum(args[0]);
    if (isError(rate)) return rate;
    const pmt = reqNum(args[1]);
    if (isError(pmt)) return pmt;
    const pv = reqNum(args[2]);
    if (isError(pv)) return pv;
    const fv = optNum(args[3], 0);
    if (isError(fv)) return fv;
    const type = optNum(args[4], 0);
    if (isError(type)) return type;
    return numResult(nperOf(rate, pmt, pv, fv, type));
  },
  RATE: (args) => {
    const nper = reqNum(args[0]);
    if (isError(nper)) return nper;
    const pmt = reqNum(args[1]);
    if (isError(pmt)) return pmt;
    const pv = reqNum(args[2]);
    if (isError(pv)) return pv;
    const fv = optNum(args[3], 0);
    if (isError(fv)) return fv;
    const type = optNum(args[4], 0);
    if (isError(type)) return type;
    const guess = optNum(args[5], 0.1);
    if (isError(guess)) return guess;
    const r = solveRate((rr) => fvOf(rr, nper, pmt, pv, type) - fv, guess);
    return numResult(r);
  },
  IPMT: (args) => {
    const rate = reqNum(args[0]);
    if (isError(rate)) return rate;
    const per = reqNum(args[1]);
    if (isError(per)) return per;
    const nper = reqNum(args[2]);
    if (isError(nper)) return nper;
    const pv = reqNum(args[3]);
    if (isError(pv)) return pv;
    const fv = optNum(args[4], 0);
    if (isError(fv)) return fv;
    const type = optNum(args[5], 0);
    if (isError(type)) return type;
    const ip = ipmtOf(rate, Math.trunc(per), nper, pv, fv, type);
    return isError(ip) ? ip : numResult(ip);
  },
  PPMT: (args) => {
    const rate = reqNum(args[0]);
    if (isError(rate)) return rate;
    const per = reqNum(args[1]);
    if (isError(per)) return per;
    const nper = reqNum(args[2]);
    if (isError(nper)) return nper;
    const pv = reqNum(args[3]);
    if (isError(pv)) return pv;
    const fv = optNum(args[4], 0);
    if (isError(fv)) return fv;
    const type = optNum(args[5], 0);
    if (isError(type)) return type;
    const ip = ipmtOf(rate, Math.trunc(per), nper, pv, fv, type);
    if (isError(ip)) return ip;
    const pmt = pmtOf(rate, nper, pv, fv, type);
    return numResult(pmt - ip);
  },
  CUMIPMT: (args) => cumulative(args, "i"),
  CUMPRINC: (args) => cumulative(args, "p"),
  NPV: (args) => {
    const rate = reqNum(args[0]);
    if (isError(rate)) return rate;
    const flows = strictNumbers(flattenArg2(args.slice(1)));
    if (isErr(flows)) return flows;
    return numResult(npvAt(rate, flows));
  },
  IRR: (args) => {
    const flows = strictNumbers(flattenArg(args[0] ?? { kind: "value", value: null }));
    if (isErr(flows)) return flows;
    const guess = optNum(args[1], 0.1);
    if (isError(guess)) return guess;
    if (flows.length < 2) return "#NUM!";
    const r = solveRate((rr) => flows.reduce((s, cf, i) => s + cf / Math.pow(1 + rr, i), 0), guess);
    return numResult(r);
  },
  MIRR: (args) => {
    const flows = strictNumbers(flattenArg(args[0] ?? { kind: "value", value: null }));
    if (isErr(flows)) return flows;
    const financeRate = reqNum(args[1]);
    if (isError(financeRate)) return financeRate;
    const reinvestRate = reqNum(args[2]);
    if (isError(reinvestRate)) return reinvestRate;
    const n = flows.length;
    if (n < 2) return "#DIV/0!";
    let pvNeg = 0, fvPos = 0;
    for (let i = 0; i < n; i++) {
      const cf = flows[i];
      if (cf < 0) pvNeg += cf / Math.pow(1 + financeRate, i);
      else fvPos += cf * Math.pow(1 + reinvestRate, n - 1 - i);
    }
    if (pvNeg === 0 || fvPos === 0) return "#DIV/0!";
    return numResult(Math.pow(-fvPos / pvNeg, 1 / (n - 1)) - 1);
  },
  XNPV: (args) => {
    const rate = reqNum(args[0]);
    if (isError(rate)) return rate;
    const flows = strictNumbers(flattenArg(args[1] ?? { kind: "value", value: null }));
    if (isErr(flows)) return flows;
    const dates = strictNumbers(flattenArg(args[2] ?? { kind: "value", value: null }));
    if (isErr(dates)) return dates;
    if (flows.length !== dates.length || flows.length === 0) return "#NUM!";
    return numResult(xnpvAt(rate, flows, dates));
  },
  XIRR: (args) => {
    const flows = strictNumbers(flattenArg(args[0] ?? { kind: "value", value: null }));
    if (isErr(flows)) return flows;
    const dates = strictNumbers(flattenArg(args[1] ?? { kind: "value", value: null }));
    if (isErr(dates)) return dates;
    const guess = optNum(args[2], 0.1);
    if (isError(guess)) return guess;
    if (flows.length !== dates.length || flows.length < 2) return "#NUM!";
    const r = solveRate((rr) => xnpvAt(rr, flows, dates), guess);
    return numResult(r);
  },
  // 折旧
  SLN: (args) => {
    const cost = reqNum(args[0]);
    if (isError(cost)) return cost;
    const salvage = reqNum(args[1]);
    if (isError(salvage)) return salvage;
    const life = reqNum(args[2]);
    if (isError(life)) return life;
    return life === 0 ? "#DIV/0!" : (cost - salvage) / life;
  },
  SYD: (args) => {
    const cost = reqNum(args[0]);
    if (isError(cost)) return cost;
    const salvage = reqNum(args[1]);
    if (isError(salvage)) return salvage;
    const life = reqNum(args[2]);
    if (isError(life)) return life;
    const per = reqNum(args[3]);
    if (isError(per)) return per;
    if (life <= 0) return "#NUM!";
    if (per < 1 || per > life) return "#NUM!";
    return (cost - salvage) * (life - per + 1) * 2 / (life * (life + 1));
  },
  DDB: (args) => {
    const cost = reqNum(args[0]);
    if (isError(cost)) return cost;
    const salvage = reqNum(args[1]);
    if (isError(salvage)) return salvage;
    const life = reqNum(args[2]);
    if (isError(life)) return life;
    const per = reqNum(args[3]);
    if (isError(per)) return per;
    const factor = optNum(args[4], 2);
    if (isError(factor)) return factor;
    if (life <= 0 || per < 1 || per > life) return "#NUM!";
    let book = cost, dep = 0;
    for (let p = 1; p <= Math.trunc(per); p++) {
      dep = Math.min(book * factor / life, Math.max(0, book - salvage));
      book -= dep;
    }
    return numResult(dep);
  },
  DB: (args) => {
    const cost = reqNum(args[0]);
    if (isError(cost)) return cost;
    const salvage = reqNum(args[1]);
    if (isError(salvage)) return salvage;
    const life = reqNum(args[2]);
    if (isError(life)) return life;
    const per = reqNum(args[3]);
    if (isError(per)) return per;
    const month = optNum(args[4], 12);
    if (isError(month)) return month;
    if (life <= 0 || cost < 0) return "#NUM!";
    if (cost === 0) return 0;
    const rate = Math.round((1 - Math.pow(salvage / cost, 1 / life)) * 1e3) / 1e3;
    let book = cost, dep = 0;
    const pInt = Math.trunc(per);
    for (let p = 1; p <= pInt; p++) {
      if (p === 1) dep = cost * rate * month / 12;
      else if (p === Math.trunc(life) + 1) dep = book * rate * (12 - month) / 12;
      else dep = book * rate;
      book -= dep;
    }
    return numResult(dep);
  },
  // 利率换算
  EFFECT: (args) => {
    const nominal = reqNum(args[0]);
    if (isError(nominal)) return nominal;
    const npery = reqNum(args[1]);
    if (isError(npery)) return npery;
    const np = Math.trunc(npery);
    if (nominal <= 0 || np < 1) return "#NUM!";
    return Math.pow(1 + nominal / np, np) - 1;
  },
  NOMINAL: (args) => {
    const effect = reqNum(args[0]);
    if (isError(effect)) return effect;
    const npery = reqNum(args[1]);
    if (isError(npery)) return npery;
    const np = Math.trunc(npery);
    if (effect <= 0 || np < 1) return "#NUM!";
    return (Math.pow(1 + effect, 1 / np) - 1) * np;
  },
  DOLLARDE: (args) => {
    const frac = reqNum(args[0]);
    if (isError(frac)) return frac;
    const denom = reqNum(args[1]);
    if (isError(denom)) return denom;
    const d = Math.trunc(denom);
    if (d < 0) return "#NUM!";
    if (d === 0) return "#DIV/0!";
    const whole = Math.trunc(frac);
    const fracPart = frac - whole;
    const digits = Math.ceil(Math.log10(d));
    return whole + fracPart * Math.pow(10, digits) / d;
  },
  DOLLARFR: (args) => {
    const dec = reqNum(args[0]);
    if (isError(dec)) return dec;
    const denom = reqNum(args[1]);
    if (isError(denom)) return denom;
    const d = Math.trunc(denom);
    if (d < 0) return "#NUM!";
    if (d === 0) return "#DIV/0!";
    const whole = Math.trunc(dec);
    const fracPart = dec - whole;
    const digits = Math.ceil(Math.log10(d));
    return whole + fracPart * d / Math.pow(10, digits);
  },
  PDURATION: (args) => {
    const rate = reqNum(args[0]);
    if (isError(rate)) return rate;
    const pv = reqNum(args[1]);
    if (isError(pv)) return pv;
    const fv = reqNum(args[2]);
    if (isError(fv)) return fv;
    if (rate <= 0 || pv <= 0 || fv <= 0) return "#NUM!";
    return (Math.log(fv) - Math.log(pv)) / Math.log(1 + rate);
  },
  RRI: (args) => {
    const nper = reqNum(args[0]);
    if (isError(nper)) return nper;
    const pv = reqNum(args[1]);
    if (isError(pv)) return pv;
    const fv = reqNum(args[2]);
    if (isError(fv)) return fv;
    if (nper <= 0 || pv === 0) return "#NUM!";
    return numResult(Math.pow(fv / pv, 1 / nper) - 1);
  }
};
function flattenArg2(args) {
  const out = [];
  for (const a of args) out.push(...flattenArg(a));
  return out;
}
function cumulative(args, which) {
  const rate = reqNum(args[0]);
  if (isError(rate)) return rate;
  const nper = reqNum(args[1]);
  if (isError(nper)) return nper;
  const pv = reqNum(args[2]);
  if (isError(pv)) return pv;
  const start = reqNum(args[3]);
  if (isError(start)) return start;
  const end = reqNum(args[4]);
  if (isError(end)) return end;
  const type = optNum(args[5], 0);
  if (isError(type)) return type;
  const s = Math.trunc(start), e = Math.trunc(end);
  if (rate <= 0 || nper <= 0 || pv <= 0) return "#NUM!";
  if (s < 1 || e < s || e > nper) return "#NUM!";
  const pmt = pmtOf(rate, nper, pv, 0, type);
  let total = 0;
  for (let p = s; p <= e; p++) {
    const ip = ipmtOf(rate, p, nper, pv, 0, type);
    if (isError(ip)) return ip;
    total += which === "i" ? ip : pmt - ip;
  }
  return numResult(total);
}

// src/formula/builtins/statistical.ts
function collectNumbersA(args) {
  const out = [];
  for (const v of flattenArgs(args)) {
    if (isError(v)) return v;
    if (isBlank(v)) continue;
    if (typeof v === "number") {
      out.push(v);
      continue;
    }
    if (typeof v === "boolean") {
      out.push(v ? 1 : 0);
      continue;
    }
    const n = Number(String(v).trim());
    out.push(Number.isFinite(n) ? n : 0);
  }
  return out;
}
function pairVectors(a, b) {
  const ya = flattenArg(a ?? { kind: "value", value: null });
  const xb = flattenArg(b ?? { kind: "value", value: null });
  if (ya.length !== xb.length) return "#N/A";
  const xs = [], ys = [];
  for (let i = 0; i < ya.length; i++) {
    const yv = ya[i], xv = xb[i];
    if (isError(yv)) return yv;
    if (isError(xv)) return xv;
    if (isBlank(yv) || isBlank(xv)) continue;
    const yn = Number(typeof yv === "boolean" ? yv ? 1 : 0 : yv);
    const xn = Number(typeof xv === "boolean" ? xv ? 1 : 0 : xv);
    if (!Number.isFinite(yn) || !Number.isFinite(xn)) continue;
    ys.push(yn);
    xs.push(xn);
  }
  return { xs, ys };
}
function regress(xs, ys) {
  const n = xs.length;
  if (n < 2) return "#DIV/0!";
  const mx = mean(xs), my = mean(ys);
  let sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  if (sxx === 0) return "#DIV/0!";
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  const r = sxx === 0 || syy === 0 ? 0 : sxy / Math.sqrt(sxx * syy);
  return { slope, intercept, r, sxx, syy, sxy, n };
}
function normPdf(x, mu, sigma) {
  return Math.exp(-((x - mu) ** 2) / (2 * sigma * sigma)) / (sigma * Math.sqrt(2 * Math.PI));
}
function normSCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp(-z * z / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? 1 - p : p;
}
function normSInv(p) {
  if (p <= 0 || p >= 1) return "#NUM!";
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const plow = 0.02425, phigh = 1 - plow;
  let q, r, x;
  if (p < plow) {
    q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= phigh) {
    q = p - 0.5;
    r = q * q;
    x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  return x;
}
function finite2(x) {
  return Number.isFinite(x) ? x : "#NUM!";
}
function percentileInc(sorted, p) {
  const rank2 = p * (sorted.length - 1);
  const lo = Math.floor(rank2), hi = Math.ceil(rank2);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (rank2 - lo) * (sorted[hi] - sorted[lo]);
}
function percentileExc(sorted, p) {
  const n = sorted.length;
  const rank2 = p * (n + 1) - 1;
  if (rank2 < 0 || rank2 > n - 1) return "#NUM!";
  const lo = Math.floor(rank2), hi = Math.ceil(rank2);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (rank2 - lo) * (sorted[hi] - sorted[lo]);
}
var STATISTICAL_BUILTINS = {
  // 均值家族
  GEOMEAN: (args) => {
    const ns = collectNumbers(args);
    if (!isNums(ns)) return ns;
    if (ns.length === 0) return "#NUM!";
    let logsum = 0;
    for (const n of ns) {
      if (n <= 0) return "#NUM!";
      logsum += Math.log(n);
    }
    return finite2(Math.exp(logsum / ns.length));
  },
  HARMEAN: (args) => {
    const ns = collectNumbers(args);
    if (!isNums(ns)) return ns;
    if (ns.length === 0) return "#NUM!";
    let recip = 0;
    for (const n of ns) {
      if (n <= 0) return "#NUM!";
      recip += 1 / n;
    }
    return finite2(ns.length / recip);
  },
  TRIMMEAN: (args) => {
    const ns0 = flattenArg(args[0] ?? { kind: "value", value: null }).map((v) => Number(v)).filter((n) => Number.isFinite(n));
    const pct = reqNum(args[1]);
    if (isError(pct)) return pct;
    if (pct < 0 || pct >= 1) return "#NUM!";
    const s = [...ns0].sort((a, b) => a - b);
    const cut = Math.floor(s.length * pct / 2);
    const kept = s.slice(cut, s.length - cut);
    if (kept.length === 0) return "#NUM!";
    return mean(kept);
  },
  AVERAGEA: (args) => {
    const ns = collectNumbersA(args);
    if (!isNums(ns)) return ns;
    return ns.length ? mean(ns) : "#DIV/0!";
  },
  MAXA: (args) => {
    const ns = collectNumbersA(args);
    if (!isNums(ns)) return ns;
    return ns.length ? Math.max(...ns) : 0;
  },
  MINA: (args) => {
    const ns = collectNumbersA(args);
    if (!isNums(ns)) return ns;
    return ns.length ? Math.min(...ns) : 0;
  },
  STDEVA: (args) => {
    const ns = collectNumbersA(args);
    if (!isNums(ns)) return ns;
    return sampleStd(ns);
  },
  STDEVPA: (args) => {
    const ns = collectNumbersA(args);
    if (!isNums(ns)) return ns;
    return popStd(ns);
  },
  VARA: (args) => {
    const ns = collectNumbersA(args);
    if (!isNums(ns)) return ns;
    return sampleVar(ns);
  },
  VARPA: (args) => {
    const ns = collectNumbersA(args);
    if (!isNums(ns)) return ns;
    return popVar(ns);
  },
  // 离差
  DEVSQ: (args) => {
    const ns = collectNumbers(args);
    if (!isNums(ns)) return ns;
    if (ns.length === 0) return 0;
    const m = mean(ns);
    return ns.reduce((s, n) => s + (n - m) ** 2, 0);
  },
  AVEDEV: (args) => {
    const ns = collectNumbers(args);
    if (!isNums(ns)) return ns;
    if (ns.length === 0) return "#NUM!";
    const m = mean(ns);
    return ns.reduce((s, n) => s + Math.abs(n - m), 0) / ns.length;
  },
  SKEW: (args) => {
    const ns = collectNumbers(args);
    if (!isNums(ns)) return ns;
    const n = ns.length;
    if (n < 3) return "#DIV/0!";
    const m = mean(ns), sd = Math.sqrt(sampleVarRaw(ns));
    if (sd === 0) return "#DIV/0!";
    let sum = 0;
    for (const x of ns) sum += ((x - m) / sd) ** 3;
    return n / ((n - 1) * (n - 2)) * sum;
  },
  "SKEW.P": (args) => {
    const ns = collectNumbers(args);
    if (!isNums(ns)) return ns;
    const n = ns.length;
    if (n < 1) return "#DIV/0!";
    const m = mean(ns), sd = Math.sqrt(popVarRaw(ns));
    if (sd === 0) return "#DIV/0!";
    let sum = 0;
    for (const x of ns) sum += ((x - m) / sd) ** 3;
    return sum / n;
  },
  KURT: (args) => {
    const ns = collectNumbers(args);
    if (!isNums(ns)) return ns;
    const n = ns.length;
    if (n < 4) return "#DIV/0!";
    const m = mean(ns), sd = Math.sqrt(sampleVarRaw(ns));
    if (sd === 0) return "#DIV/0!";
    let sum = 0;
    for (const x of ns) sum += ((x - m) / sd) ** 4;
    return n * (n + 1) / ((n - 1) * (n - 2) * (n - 3)) * sum - 3 * (n - 1) ** 2 / ((n - 2) * (n - 3));
  },
  // 双变量
  CORREL: (args) => bivar(args, (r) => r.r),
  PEARSON: (args) => bivar(args, (r) => r.r),
  RSQ: (args) => bivar(args, (r) => r.r * r.r),
  SLOPE: (args) => bivar(args, (r) => r.slope),
  INTERCEPT: (args) => bivar(args, (r) => r.intercept),
  COVAR: (args) => bivarPop(args, false),
  "COVARIANCE.P": (args) => bivarPop(args, false),
  "COVARIANCE.S": (args) => bivarPop(args, true),
  STEYX: (args) => {
    const pv = pairVectors(args[0], args[1]);
    if (isErr(pv)) return pv;
    const reg = regress(pv.xs, pv.ys);
    if (isErr(reg)) return reg;
    const n = reg.n;
    if (n < 3) return "#DIV/0!";
    const seSq = (reg.syy - reg.sxy * reg.sxy / reg.sxx) / (n - 2);
    return finite2(Math.sqrt(Math.max(0, seSq)));
  },
  FORECAST: (args) => forecast(args),
  "FORECAST.LINEAR": (args) => forecast(args),
  // 次序 / 分位
  QUARTILE: (args) => quartile(args, "inc"),
  "QUARTILE.INC": (args) => quartile(args, "inc"),
  "QUARTILE.EXC": (args) => quartile(args, "exc"),
  "PERCENTILE.EXC": (args) => {
    const data = numsFrom(args[0]);
    const p = reqNum(args[1]);
    if (isError(p)) return p;
    if (data.length === 0) return "#NUM!";
    return percentileExc([...data].sort((a, b) => a - b), p);
  },
  PERCENTRANK: (args) => percentRank(args, "inc"),
  "PERCENTRANK.INC": (args) => percentRank(args, "inc"),
  "PERCENTRANK.EXC": (args) => percentRank(args, "exc"),
  "RANK.AVG": (args) => rankAvg(args),
  // 正态分布
  "NORM.DIST": (args) => normDist(args),
  NORMDIST: (args) => normDist(args),
  "NORM.S.DIST": (args) => {
    const z = reqNum(args[0]);
    if (isError(z)) return z;
    const cum = args[1] === void 0 ? true : toBool(args[1]);
    return cum ? normSCdf(z) : normPdf(z, 0, 1);
  },
  NORMSDIST: (args) => {
    const z = reqNum(args[0]);
    return isError(z) ? z : normSCdf(z);
  },
  "NORM.INV": (args) => normInv(args),
  NORMINV: (args) => normInv(args),
  "NORM.S.INV": (args) => {
    const p = reqNum(args[0]);
    if (isError(p)) return p;
    return normSInv(p);
  },
  NORMSINV: (args) => {
    const p = reqNum(args[0]);
    if (isError(p)) return p;
    return normSInv(p);
  },
  STANDARDIZE: (args) => {
    const x = reqNum(args[0]);
    if (isError(x)) return x;
    const mu = reqNum(args[1]);
    if (isError(mu)) return mu;
    const sigma = reqNum(args[2]);
    if (isError(sigma)) return sigma;
    if (sigma <= 0) return "#NUM!";
    return (x - mu) / sigma;
  },
  "CONFIDENCE.NORM": (args) => confidence(args),
  CONFIDENCE: (args) => confidence(args),
  GAUSS: (args) => {
    const z = reqNum(args[0]);
    if (isError(z)) return z;
    return normSCdf(z) - 0.5;
  },
  PHI: (args) => {
    const x = reqNum(args[0]);
    if (isError(x)) return x;
    return normPdf(x, 0, 1);
  }
};
function sampleVarRaw(ns) {
  const n = ns.length, m = mean(ns);
  return ns.reduce((s, x) => s + (x - m) ** 2, 0) / (n - 1);
}
function popVarRaw(ns) {
  const n = ns.length, m = mean(ns);
  return ns.reduce((s, x) => s + (x - m) ** 2, 0) / n;
}
function sampleVar(ns) {
  return ns.length < 2 ? "#DIV/0!" : sampleVarRaw(ns);
}
function popVar(ns) {
  return ns.length < 1 ? "#DIV/0!" : popVarRaw(ns);
}
function sampleStd(ns) {
  return ns.length < 2 ? "#DIV/0!" : Math.sqrt(sampleVarRaw(ns));
}
function popStd(ns) {
  return ns.length < 1 ? "#DIV/0!" : Math.sqrt(popVarRaw(ns));
}
function toBool(arg) {
  const v = scalarArg(arg);
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  return String(v).trim().toUpperCase() === "TRUE";
}
function numsFrom(arg) {
  return flattenArg(arg ?? { kind: "value", value: null }).filter((v) => !isBlank(v)).map((v) => Number(typeof v === "boolean" ? v ? 1 : 0 : v)).filter((n) => Number.isFinite(n));
}
function bivar(args, pick) {
  const pv = pairVectors(args[0], args[1]);
  if (isErr(pv)) return pv;
  const reg = regress(pv.xs, pv.ys);
  if (isErr(reg)) return reg;
  return finite2(pick(reg));
}
function bivarPop(args, sample) {
  const pv = pairVectors(args[0], args[1]);
  if (isErr(pv)) return pv;
  const { xs, ys } = pv;
  const n = xs.length;
  if (sample ? n < 2 : n < 1) return "#DIV/0!";
  const mx = mean(xs), my = mean(ys);
  let sxy = 0;
  for (let i = 0; i < n; i++) sxy += (xs[i] - mx) * (ys[i] - my);
  return sxy / (sample ? n - 1 : n);
}
function forecast(args) {
  const x = reqNum(args[0]);
  if (isError(x)) return x;
  const pv = pairVectors(args[1], args[2]);
  if (isErr(pv)) return pv;
  const reg = regress(pv.xs, pv.ys);
  if (isErr(reg)) return reg;
  return finite2(reg.intercept + reg.slope * x);
}
function quartile(args, mode2) {
  const data = numsFrom(args[0]);
  const q = reqNum(args[1]);
  if (isError(q)) return q;
  const qi = Math.trunc(q);
  if (data.length === 0) return "#NUM!";
  if (mode2 === "inc") {
    if (qi < 0 || qi > 4) return "#NUM!";
    return percentileInc([...data].sort((a, b) => a - b), qi / 4);
  }
  if (qi < 1 || qi > 3) return "#NUM!";
  return percentileExc([...data].sort((a, b) => a - b), qi / 4);
}
function percentRank(args, mode2) {
  const data = numsFrom(args[0]).sort((a, b) => a - b);
  const x = reqNum(args[1]);
  if (isError(x)) return x;
  const sig = optNum(args[2], 3);
  if (isError(sig)) return sig;
  const n = data.length;
  if (n === 0) return "#NUM!";
  if (x < data[0] || x > data[n - 1]) return "#N/A";
  let idx = -1;
  for (let i = 0; i < n; i++) {
    if (data[i] === x) {
      idx = i;
      break;
    }
  }
  let rank2;
  if (idx >= 0) {
    rank2 = mode2 === "inc" ? idx / (n - 1) : (idx + 1) / (n + 1);
  } else {
    let lo = 0;
    while (lo < n - 1 && data[lo + 1] < x) lo++;
    const frac = (x - data[lo]) / (data[lo + 1] - data[lo]);
    rank2 = mode2 === "inc" ? (lo + frac) / (n - 1) : (lo + 1 + frac) / (n + 1);
  }
  const f2 = Math.pow(10, Math.trunc(sig));
  return Math.floor(rank2 * f2) / f2;
}
function rankAvg(args) {
  const target = reqNum(args[0]);
  if (isError(target)) return target;
  const data = numsFrom(args[1]);
  const orderArg = optNum(args[2], 0);
  if (isError(orderArg)) return orderArg;
  const ascending = orderArg !== 0;
  const sorted = [...data].sort((a, b) => ascending ? a - b : b - a);
  let first = -1, count = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i] === target) {
      if (first < 0) first = i;
      count++;
    }
  }
  if (first < 0) return "#N/A";
  return first + 1 + (count - 1) / 2;
}
function normDist(args) {
  const x = reqNum(args[0]);
  if (isError(x)) return x;
  const mu = reqNum(args[1]);
  if (isError(mu)) return mu;
  const sigma = reqNum(args[2]);
  if (isError(sigma)) return sigma;
  if (sigma <= 0) return "#NUM!";
  const cum = args[3] === void 0 ? true : toBool(args[3]);
  if (cum) return normSCdf((x - mu) / sigma);
  return normPdf(x, mu, sigma);
}
function normInv(args) {
  const p = reqNum(args[0]);
  if (isError(p)) return p;
  const mu = reqNum(args[1]);
  if (isError(mu)) return mu;
  const sigma = reqNum(args[2]);
  if (isError(sigma)) return sigma;
  if (sigma <= 0) return "#NUM!";
  const z = normSInv(p);
  if (isError(z)) return z;
  return mu + sigma * z;
}
function confidence(args) {
  const alpha = reqNum(args[0]);
  if (isError(alpha)) return alpha;
  const sigma = reqNum(args[1]);
  if (isError(sigma)) return sigma;
  const size = reqNum(args[2]);
  if (isError(size)) return size;
  if (alpha <= 0 || alpha >= 1 || sigma <= 0 || size < 1) return "#NUM!";
  const z = normSInv(1 - alpha / 2);
  if (isError(z)) return z;
  return z * sigma / Math.sqrt(Math.trunc(size));
}

// src/formula/builtins/database.ts
function asMatrix(arg) {
  if (!arg) return [[null]];
  if (arg.kind === "range") return arg.values;
  return [[arg.value]];
}
function matchOne(cell, criteria) {
  if (isBlank(criteria)) return true;
  const cs = String(criteria).trim();
  const m = /^(>=|<=|<>|>|<|=)?(.*)$/.exec(cs);
  const opr = m?.[1] ?? "";
  const rhs = m?.[2] ?? "";
  const rhsNum = Number(rhs);
  const vNum = typeof cell === "number" ? cell : Number(String(cell));
  if (opr && Number.isFinite(rhsNum) && Number.isFinite(vNum)) {
    switch (opr) {
      case ">=":
        return vNum >= rhsNum;
      case "<=":
        return vNum <= rhsNum;
      case "<>":
        return vNum !== rhsNum;
      case ">":
        return vNum > rhsNum;
      case "<":
        return vNum < rhsNum;
      case "=":
        return vNum === rhsNum;
    }
  }
  const vs = String(cell ?? "");
  const target = opr === "=" || opr === "<>" ? rhs : cs;
  const hasWild = /[*?]/.test(target);
  let eq;
  if (hasWild) eq = wildcard(target).test(vs);
  else eq = vs.toUpperCase() === target.toUpperCase();
  return opr === "<>" ? !eq : eq;
}
function wildcard(pattern) {
  let out = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "~") {
      const nx = pattern[i + 1];
      if (nx) {
        out += nx.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        i++;
      }
      continue;
    }
    if (c === "*") {
      out += ".*";
      continue;
    }
    if (c === "?") {
      out += ".";
      continue;
    }
    out += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp("^" + out + "$", "i");
}
function headerIndex(headers, name) {
  const target = name.trim().toUpperCase();
  for (let c = 0; c < headers.length; c++) {
    if (String(headers[c] ?? "").trim().toUpperCase() === target) return c;
  }
  return -1;
}
function selectColumn(dbArg, fieldArg, critArg) {
  const db = asMatrix(dbArg);
  if (db.length < 1) return "#VALUE!";
  const headers = db[0];
  const fieldVal = scalarArg(fieldArg);
  let fieldIdx;
  if (typeof fieldVal === "number") {
    fieldIdx = Math.trunc(fieldVal) - 1;
  } else {
    fieldIdx = headerIndex(headers, String(fieldVal ?? ""));
  }
  if (fieldIdx < 0 || fieldIdx >= headers.length) return "#VALUE!";
  const crit = asMatrix(critArg);
  if (crit.length < 1) return "#VALUE!";
  const critHeaders = crit[0];
  const critColMap = critHeaders.map((h) => headerIndex(headers, String(h ?? "")));
  const out = [];
  for (let r = 1; r < db.length; r++) {
    const record = db[r];
    let selected;
    if (crit.length === 1) {
      selected = true;
    } else {
      selected = false;
      for (let cr = 1; cr < crit.length; cr++) {
        const condRow = crit[cr];
        let allOk = true;
        for (let cc = 0; cc < critHeaders.length; cc++) {
          const cond = condRow[cc];
          if (isBlank(cond ?? null)) continue;
          const dbCol = critColMap[cc];
          if (dbCol < 0) {
            allOk = false;
            break;
          }
          if (!matchOne(record[dbCol] ?? null, cond ?? null)) {
            allOk = false;
            break;
          }
        }
        if (allOk) {
          selected = true;
          break;
        }
      }
    }
    if (selected) out.push(record[fieldIdx] ?? null);
  }
  return out;
}
function nums(vals) {
  const out = [];
  for (const v of vals) {
    if (isBlank(v)) continue;
    const n = toNumber(v);
    if (!isError(n)) out.push(n);
  }
  return out;
}
function mean2(ns) {
  return ns.reduce((a, b) => a + b, 0) / ns.length;
}
function sampleVar2(ns) {
  const m = mean2(ns);
  return ns.reduce((s, x) => s + (x - m) ** 2, 0) / (ns.length - 1);
}
function popVar2(ns) {
  const m = mean2(ns);
  return ns.reduce((s, x) => s + (x - m) ** 2, 0) / ns.length;
}
function dfn(args, reduce) {
  const sel = selectColumn(args[0], args[1], args[2]);
  if (isErr(sel)) return sel;
  return reduce(sel);
}
var DATABASE_BUILTINS = {
  DSUM: (args) => dfn(args, (v) => nums(v).reduce((a, b) => a + b, 0)),
  DAVERAGE: (args) => dfn(args, (v) => {
    const n = nums(v);
    return n.length ? mean2(n) : "#DIV/0!";
  }),
  DCOUNT: (args) => dfn(args, (v) => nums(v).length),
  DCOUNTA: (args) => dfn(args, (v) => v.filter((x) => !isBlank(x)).length),
  DMAX: (args) => dfn(args, (v) => {
    const n = nums(v);
    return n.length ? Math.max(...n) : 0;
  }),
  DMIN: (args) => dfn(args, (v) => {
    const n = nums(v);
    return n.length ? Math.min(...n) : 0;
  }),
  DPRODUCT: (args) => dfn(args, (v) => {
    const n = nums(v);
    return n.length ? n.reduce((a, b) => a * b, 1) : 0;
  }),
  DGET: (args) => dfn(args, (v) => {
    const nonBlank = v.filter((x) => !isBlank(x));
    if (nonBlank.length === 0) return "#VALUE!";
    if (nonBlank.length > 1) return "#NUM!";
    return nonBlank[0];
  }),
  DSTDEV: (args) => dfn(args, (v) => {
    const n = nums(v);
    return n.length < 2 ? "#DIV/0!" : Math.sqrt(sampleVar2(n));
  }),
  DSTDEVP: (args) => dfn(args, (v) => {
    const n = nums(v);
    return n.length < 1 ? "#DIV/0!" : Math.sqrt(popVar2(n));
  }),
  DVAR: (args) => dfn(args, (v) => {
    const n = nums(v);
    return n.length < 2 ? "#DIV/0!" : sampleVar2(n);
  }),
  DVARP: (args) => dfn(args, (v) => {
    const n = nums(v);
    return n.length < 1 ? "#DIV/0!" : popVar2(n);
  })
};

// src/formula/builtins/textref.ts
function groupThousands(intPart) {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
function fixedFormat(value, decimals, commas) {
  const neg = value < 0;
  let abs = Math.abs(value);
  let s;
  if (decimals >= 0) {
    s = abs.toFixed(Math.min(decimals, 100));
  } else {
    const f2 = Math.pow(10, -decimals);
    abs = Math.round(abs / f2) * f2;
    s = abs.toFixed(0);
  }
  const dot = s.indexOf(".");
  let intPart = dot < 0 ? s : s.slice(0, dot);
  const fracPart = dot < 0 ? "" : s.slice(dot);
  if (commas) intPart = groupThousands(intPart);
  return (neg ? "-" : "") + intPart + fracPart;
}
function textSplit(args, which) {
  const text = toText(scalarArg(args[0]));
  if (isError(text)) return text;
  const delim = toText(scalarArg(args[1]));
  if (isError(delim)) return delim;
  const instance = optNum(args[2], 1);
  if (isError(instance)) return instance;
  const ifNotFound = args[3] !== void 0 ? scalarArg(args[3]) : "#N/A";
  if (delim === "") return which === "before" ? "" : text;
  const inst = Math.trunc(instance);
  const positions = [];
  let idx = -1;
  while ((idx = text.indexOf(delim, idx + 1)) >= 0) positions.push(idx);
  if (positions.length === 0) return ifNotFound;
  let hit;
  if (inst > 0) {
    if (inst > positions.length) return ifNotFound;
    hit = positions[inst - 1];
  } else if (inst < 0) {
    const k = positions.length + inst;
    if (k < 0) return ifNotFound;
    hit = positions[k];
  } else {
    return "#VALUE!";
  }
  return which === "before" ? text.slice(0, hit) : text.slice(hit + delim.length);
}
function address(args) {
  const row = reqNum(args[0]);
  if (isError(row)) return row;
  const col = reqNum(args[1]);
  if (isError(col)) return col;
  const absNum = optNum(args[2], 1);
  if (isError(absNum)) return absNum;
  const a1 = args[3] === void 0 ? true : boolOf(args[3]);
  const sheet = args[4] !== void 0 ? toText(scalarArg(args[4])) : "";
  if (isError(sheet)) return sheet;
  const r = Math.trunc(row), c = Math.trunc(col), ab = Math.trunc(absNum);
  if (r < 1 || c < 1 || ab < 1 || ab > 4) return "#VALUE!";
  const rowAbs = ab === 1 || ab === 2;
  const colAbs = ab === 1 || ab === 3;
  let core;
  if (a1) {
    core = (colAbs ? "$" : "") + colToLabel(c - 1) + (rowAbs ? "$" : "") + r;
  } else {
    const rPart = rowAbs ? `R${r}` : `R[${r}]`;
    const cPart = colAbs ? `C${c}` : `C[${c}]`;
    core = rPart + cPart;
  }
  if (sheet) {
    const needQuote = /[^A-Za-z0-9_]/.test(sheet);
    const sh = needQuote ? `'${sheet.replace(/'/g, "''")}'` : sheet;
    return `${sh}!${core}`;
  }
  return core;
}
function boolOf(arg) {
  const b = toBoolean(scalarArg(arg));
  return isError(b) ? true : b;
}
function indirect(args, ctx) {
  const refText = toText(scalarArg(args[0]));
  if (isError(refText)) return refText;
  const a1 = args[1] === void 0 ? true : boolOf(args[1]);
  let ref = refText.trim();
  if (!ref) return "#REF!";
  if (!a1) {
    const m = /^R(\d+)C(\d+)$/i.exec(ref);
    if (!m) return "#REF!";
    ref = colToLabel(Number(m[2]) - 1) + Number(m[1]);
  }
  const colon = ref.indexOf(":");
  if (colon >= 0) {
    const vals = ctx.accessor.getRangeValues(ref.slice(0, colon), ref.slice(colon + 1));
    return vals[0]?.[0] ?? null;
  }
  return ctx.accessor.getCellValue(ref);
}
var ERROR_TYPE_MAP = {
  "#NULL!": 1,
  "#DIV/0!": 2,
  "#VALUE!": 3,
  "#REF!": 4,
  "#NAME?": 5,
  "#NUM!": 6,
  "#N/A": 7
};
var TEXTREF_BUILTINS = {
  // 现代文本
  TEXTBEFORE: (args) => textSplit(args, "before"),
  TEXTAFTER: (args) => textSplit(args, "after"),
  FIXED: (args) => {
    const n = reqNum(args[0]);
    if (isError(n)) return n;
    const dec = optNum(args[1], 2);
    if (isError(dec)) return dec;
    const noCommas = args[2] !== void 0 ? boolOf(args[2]) : false;
    return fixedFormat(n, Math.trunc(dec), !noCommas);
  },
  DOLLAR: (args) => {
    const n = reqNum(args[0]);
    if (isError(n)) return n;
    const dec = optNum(args[1], 2);
    if (isError(dec)) return dec;
    const body = fixedFormat(Math.abs(n), Math.trunc(dec), true);
    return n < 0 ? `($${body})` : `$${body}`;
  },
  CLEAN: (args) => {
    const t = toText(scalarArg(args[0]));
    if (isError(t)) return t;
    let out = "";
    for (const ch of t) {
      if (ch.charCodeAt(0) >= 32) out += ch;
    }
    return out;
  },
  // 引用
  ADDRESS: (args) => address(args),
  INDIRECT: (args, ctx) => indirect(args, ctx),
  // 逻辑 / 信息
  XOR: (args) => {
    let count = 0;
    for (const a of args) {
      const flat = a.kind === "range" ? a.values.flat() : [a.value];
      for (const v of flat) {
        if (isBlank(v)) continue;
        const b = toBoolean(v);
        if (isError(b)) return b;
        if (b) count++;
      }
    }
    return count % 2 === 1;
  },
  "ERROR.TYPE": (args) => {
    const v = scalarArg(args[0]);
    if (isError(v)) return ERROR_TYPE_MAP[v] ?? "#N/A";
    return "#N/A";
  },
  ISREF: (args) => args[0]?.kind === "range" ? true : false
  // 区域视作引用；单值非引用（标量已求值）
};

// src/formula/builtins/engineering.ts
function finite3(x) {
  return Number.isFinite(x) ? x : "#NUM!";
}
function baseInfo(radix) {
  switch (radix) {
    case 2:
      return { radix: 2, neg: 1024 };
    // 2^10
    case 8:
      return { radix: 8, neg: 8 ** 10 };
    // 8^10
    case 16:
      return { radix: 16, neg: 16 ** 10 };
  }
}
function parseRadix(text, radix) {
  const t = text.trim().toUpperCase();
  if (t === "") return 0;
  if (t.length > 10) return "#NUM!";
  const re = radix === 2 ? /^[01]+$/ : radix === 8 ? /^[0-7]+$/ : /^[0-9A-F]+$/;
  if (!re.test(t)) return "#NUM!";
  const { neg } = baseInfo(radix);
  const val = parseInt(t, radix);
  if (t.length === 10 && val >= neg / 2) return val - neg;
  return val;
}
function toRadix(n, radix, places) {
  n = Math.trunc(n);
  const { neg } = baseInfo(radix);
  if (n < -neg / 2 || n > neg / 2 - 1) return "#NUM!";
  let s;
  if (n < 0) s = (n + neg).toString(radix).toUpperCase();
  else s = n.toString(radix).toUpperCase();
  if (places !== void 0) {
    if (n < 0) return s;
    if (places < 0 || places > 10) return "#NUM!";
    if (s.length > places) return "#NUM!";
    s = s.padStart(places, "0");
  }
  return s;
}
function conv(src, dst) {
  return (args) => {
    const t = toText(scalarArg(args[0]));
    if (isError(t)) return t;
    const dec = parseRadix(t, src);
    if (isError(dec)) return dec;
    if (dst === "dec") return dec;
    const places = args[1] !== void 0 ? reqNum(args[1]) : void 0;
    if (places !== void 0 && isError(places)) return places;
    return toRadix(dec, dst, places === void 0 ? void 0 : Math.trunc(places));
  };
}
var BIT_MAX = 281474976710655;
function bitCheck(n) {
  n = Math.trunc(n);
  if (n < 0 || n > BIT_MAX) return "#NUM!";
  return n;
}
function bitOp(f2) {
  return (args) => {
    const a = reqNum(args[0]);
    if (isError(a)) return a;
    const b = reqNum(args[1]);
    if (isError(b)) return b;
    const ca = bitCheck(a);
    if (isError(ca)) return ca;
    const cb = bitCheck(b);
    if (isError(cb)) return cb;
    const r = f2(BigInt(ca), BigInt(cb));
    if (r < 0n || r > BigInt(BIT_MAX)) return "#NUM!";
    return Number(r);
  };
}
function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax);
  return sign * y;
}
function erfc(x) {
  return 1 - erf(x);
}
function besselJ0(x) {
  const ax = Math.abs(x);
  if (ax < 8) {
    const y2 = x * x;
    const p12 = -2957821389 + y2 * (7062834065 + y2 * (-5123598036e-1 + y2 * (1087988129e-2 + y2 * (-86327.92757 + y2 * 228.4622733))));
    const p22 = 40076544269 + y2 * (7452499648e-1 + y2 * (7189466438e-3 + y2 * (47447.2647 + y2 * (226.1030244 + y2))));
    return p12 / p22;
  }
  const z = 8 / ax, y = z * z, xx = ax - 0.785398164;
  const p1 = 1 + y * (-0.001098628627 + y * (2734510407e-14 + y * (-2073370639e-15 + y * 2093887211e-16)));
  const p2 = -0.01562499995 + y * (1430488765e-13 + y * (-6911147651e-15 + y * (7621095161e-16 + y * -934935152e-16)));
  return Math.sqrt(0.636619772 / ax) * (Math.cos(xx) * p1 - z * Math.sin(xx) * p2);
}
function besselJ1(x) {
  const ax = Math.abs(x);
  let ans;
  if (ax < 8) {
    const y = x * x;
    const p1 = x * (72362614232 + y * (-7895059235 + y * (2423968531e-1 + y * (-2972611439e-3 + y * (15704.4826 + y * -30.16036606)))));
    const p2 = 144725228442 + y * (2300535178 + y * (1858330474e-2 + y * (99447.43394 + y * (376.9991397 + y))));
    ans = p1 / p2;
  } else {
    const z = 8 / ax, y = z * z, xx = ax - 2.356194491;
    const p1 = 1 + y * (183105e-8 + y * (-3516396496e-14 + y * (2457520174e-15 + y * -240337019e-15)));
    const p2 = 0.04687499995 + y * (-2002690873e-13 + y * (8449199096e-15 + y * (-88228987e-14 + y * 105787412e-15)));
    ans = Math.sqrt(0.636619772 / ax) * (Math.cos(xx) * p1 - z * Math.sin(xx) * p2);
    if (x < 0) ans = -ans;
  }
  return ans;
}
function besselJn(n, x) {
  n = Math.trunc(n);
  if (n < 0) return "#NUM!";
  if (n === 0) return besselJ0(x);
  if (n === 1) return besselJ1(x);
  if (x === 0) return 0;
  const ax = Math.abs(x);
  let ans = 0;
  if (ax > n) {
    let bjm = besselJ0(ax), bj = besselJ1(ax);
    const tox = 2 / ax;
    for (let j = 1; j < n; j++) {
      const bjp = j * tox * bj - bjm;
      bjm = bj;
      bj = bjp;
    }
    ans = bj;
  } else {
    const tox = 2 / ax;
    const m = 2 * Math.floor((n + Math.floor(Math.sqrt(40 * n))) / 2);
    let jsum = false, bjp = 0, bj = 1, sum = 0, bjm;
    for (let j = m; j > 0; j--) {
      bjm = j * tox * bj - bjp;
      bjp = bj;
      bj = bjm;
      if (Math.abs(bj) > 1e10) {
        bj *= 1e-10;
        bjp *= 1e-10;
        ans *= 1e-10;
        sum *= 1e-10;
      }
      if (jsum) sum += bj;
      jsum = !jsum;
      if (j === n) ans = bjp;
    }
    sum = 2 * sum - bj;
    ans /= sum;
  }
  return x < 0 && n % 2 === 1 ? -ans : ans;
}
function besselY0(x) {
  if (x < 8) {
    const y2 = x * x;
    const p12 = -2957821389 + y2 * (7062834065 + y2 * (-5123598036e-1 + y2 * (1087988129e-2 + y2 * (-86327.92757 + y2 * 228.4622733))));
    const p22 = 40076544269 + y2 * (7452499648e-1 + y2 * (7189466438e-3 + y2 * (47447.2647 + y2 * (226.1030244 + y2))));
    return p12 / p22 + 0.636619772 * besselJ0(x) * Math.log(x);
  }
  const z = 8 / x, y = z * z, xx = x - 0.785398164;
  const p1 = 1 + y * (-0.001098628627 + y * (2734510407e-14 + y * (-2073370639e-15 + y * 2093887211e-16)));
  const p2 = -0.01562499995 + y * (1430488765e-13 + y * (-6911147651e-15 + y * (7621095161e-16 + y * -934935152e-16)));
  return Math.sqrt(0.636619772 / x) * (Math.sin(xx) * p1 + z * Math.cos(xx) * p2);
}
function besselY1(x) {
  if (x < 8) {
    const y2 = x * x;
    const p12 = x * (-4900604943e4 + y2 * (127527439e5 + y2 * (-515343813900 + y2 * (7349264551 + y2 * (-4237922726e-2 + y2 * 85119.37935)))));
    const p22 = 249958057e6 + y2 * (4244419664e3 + y2 * (37336503670 + y2 * (2245904002e-1 + y2 * (102042605e-2 + y2 * (3549.632885 + y2)))));
    return p12 / p22 + 0.636619772 * (besselJ1(x) * Math.log(x) - 1 / x);
  }
  const z = 8 / x, y = z * z, xx = x - 2.356194491;
  const p1 = 1 + y * (183105e-8 + y * (-3516396496e-14 + y * (2457520174e-15 + y * -240337019e-15)));
  const p2 = 0.04687499995 + y * (-2002690873e-13 + y * (8449199096e-15 + y * (-88228987e-14 + y * 105787412e-15)));
  return Math.sqrt(0.636619772 / x) * (Math.sin(xx) * p1 + z * Math.cos(xx) * p2);
}
function besselYn(n, x) {
  n = Math.trunc(n);
  if (n < 0 || x <= 0) return "#NUM!";
  if (n === 0) return besselY0(x);
  if (n === 1) return besselY1(x);
  const tox = 2 / x;
  let by = besselY1(x), bym = besselY0(x);
  for (let j = 1; j < n; j++) {
    const byp = j * tox * by - bym;
    bym = by;
    by = byp;
  }
  return by;
}
function besselI0(x) {
  const ax = Math.abs(x);
  if (ax < 3.75) {
    const y2 = (x / 3.75) ** 2;
    return 1 + y2 * (3.5156229 + y2 * (3.0899424 + y2 * (1.2067492 + y2 * (0.2659732 + y2 * (0.0360768 + y2 * 45813e-7)))));
  }
  const y = 3.75 / ax;
  return Math.exp(ax) / Math.sqrt(ax) * (0.39894228 + y * (0.01328592 + y * (225319e-8 + y * (-157565e-8 + y * (916281e-8 + y * (-0.02057706 + y * (0.02635537 + y * (-0.01647633 + y * 392377e-8))))))));
}
function besselI1(x) {
  const ax = Math.abs(x);
  let ans;
  if (ax < 3.75) {
    const y = (x / 3.75) ** 2;
    ans = ax * (0.5 + y * (0.87890594 + y * (0.51498869 + y * (0.15084934 + y * (0.02658733 + y * (301532e-8 + y * 32411e-8))))));
  } else {
    const y = 3.75 / ax;
    const p = 0.02282967 + y * (-0.02895312 + y * (0.01787654 - y * 420059e-8));
    const q = 0.39894228 + y * (-0.03988024 + y * (-362018e-8 + y * (163801e-8 + y * (-0.01031555 + y * p))));
    ans = Math.exp(ax) / Math.sqrt(ax) * q;
  }
  return x < 0 ? -ans : ans;
}
function besselIn(n, x) {
  n = Math.trunc(n);
  if (n < 0) return "#NUM!";
  if (n === 0) return besselI0(x);
  if (n === 1) return besselI1(x);
  if (x === 0) return 0;
  const tox = 2 / Math.abs(x);
  let bip = 0, bi = 1, ans = 0;
  const m = 2 * (n + Math.floor(Math.sqrt(40 * n)));
  for (let j = m; j > 0; j--) {
    const bim = bip + j * tox * bi;
    bip = bi;
    bi = bim;
    if (Math.abs(bi) > 1e10) {
      ans *= 1e-10;
      bi *= 1e-10;
      bip *= 1e-10;
    }
    if (j === n) ans = bip;
  }
  ans *= besselI0(x) / bi;
  return x < 0 && n % 2 === 1 ? -ans : ans;
}
function besselK0(x) {
  if (x <= 2) {
    const y2 = x * x / 4;
    return -Math.log(x / 2) * besselI0(x) + (-0.57721566 + y2 * (0.4227842 + y2 * (0.23069756 + y2 * (0.0348859 + y2 * (262698e-8 + y2 * (1075e-7 + y2 * 74e-7))))));
  }
  const y = 2 / x;
  return Math.exp(-x) / Math.sqrt(x) * (1.25331414 + y * (-0.07832358 + y * (0.02189568 + y * (-0.01062446 + y * (587872e-8 + y * (-25154e-7 + y * 53208e-8))))));
}
function besselK1(x) {
  if (x <= 2) {
    const y2 = x * x / 4;
    return Math.log(x / 2) * besselI1(x) + 1 / x * (1 + y2 * (0.15443144 + y2 * (-0.67278579 + y2 * (-0.18156897 + y2 * (-0.01919402 + y2 * (-110404e-8 + y2 * -4686e-8))))));
  }
  const y = 2 / x;
  return Math.exp(-x) / Math.sqrt(x) * (1.25331414 + y * (0.23498619 + y * (-0.0365562 + y * (0.01504268 + y * (-780353e-8 + y * (325614e-8 + y * -68245e-8))))));
}
function besselKn(n, x) {
  n = Math.trunc(n);
  if (n < 0 || x <= 0) return "#NUM!";
  if (n === 0) return besselK0(x);
  if (n === 1) return besselK1(x);
  const tox = 2 / x;
  let bkm = besselK0(x), bk = besselK1(x);
  for (let j = 1; j < n; j++) {
    const bkp = bkm + j * tox * bk;
    bkm = bk;
    bk = bkp;
  }
  return bk;
}
function parseCx(text) {
  let t = text.trim();
  if (t === "") return "#NUM!";
  const asNum = Number(t);
  if (Number.isFinite(asNum) && !/[ij]$/i.test(t)) return { re: asNum, im: 0, suf: "i" };
  const suf = /j$/i.test(t) ? "j" : "i";
  const body = t.replace(/[ij]$/i, "");
  let split = -1;
  for (let k = 1; k < body.length; k++) {
    const c = body[k];
    if ((c === "+" || c === "-") && body[k - 1] !== "e" && body[k - 1] !== "E") split = k;
  }
  let reS, imS;
  if (split === -1) {
    reS = "";
    imS = body;
  } else {
    reS = body.slice(0, split);
    imS = body.slice(split);
  }
  const re = reS === "" ? 0 : Number(reS);
  let im;
  if (imS === "" || imS === "+") im = 1;
  else if (imS === "-") im = -1;
  else im = Number(imS);
  if (!Number.isFinite(re) || !Number.isFinite(im)) return "#NUM!";
  return { re, im, suf };
}
function fmtCx(re, im, suf) {
  const rn = (x) => {
    if (!Number.isFinite(x)) return "0";
    const s = String(x);
    return s;
  };
  if (im === 0) return rn(re);
  if (re === 0) {
    if (im === 1) return suf;
    if (im === -1) return "-" + suf;
    return rn(im) + suf;
  }
  const imPart = im === 1 ? "+" + suf : im === -1 ? "-" + suf : im > 0 ? "+" + rn(im) + suf : rn(im) + suf;
  return rn(re) + imPart;
}
function reqCx(arg) {
  const t = toText(scalarArg(arg));
  if (isError(t)) return t;
  return parseCx(t);
}
function cx1(f2) {
  return (args) => {
    const z = reqCx(args[0]);
    if (isError(z)) return z;
    const r = f2(z);
    if (isError(r)) return r;
    if (!Number.isFinite(r.re) || !Number.isFinite(r.im)) return "#NUM!";
    return fmtCx(r.re, r.im, z.suf);
  };
}
var UNIT = {
  // 重量 weight（基准 g）
  g: { q: "w", f: 1 },
  kg: { q: "w", f: 1e3 },
  mg: { q: "w", f: 1e-3 },
  lbm: { q: "w", f: 453.59237 },
  ozm: { q: "w", f: 28.349523125 },
  u: { q: "w", f: 166053886e-32 },
  sg: { q: "w", f: 14593.9029 },
  stone: { q: "w", f: 6350.29318 },
  ton: { q: "w", f: 907184.74 },
  // 距离 distance（基准 m）
  m: { q: "d", f: 1 },
  km: { q: "d", f: 1e3 },
  cm: { q: "d", f: 0.01 },
  mm: { q: "d", f: 1e-3 },
  mi: { q: "d", f: 1609.344 },
  in: { q: "d", f: 0.0254 },
  ft: { q: "d", f: 0.3048 },
  yd: { q: "d", f: 0.9144 },
  ang: { q: "d", f: 1e-10 },
  ly: { q: "d", f: 9460730472580800 },
  Nmi: { q: "d", f: 1852 },
  pica: { q: "d", f: 0.0254 / 6 },
  // 时间 time（基准 s）
  sec: { q: "t", f: 1 },
  s: { q: "t", f: 1 },
  min: { q: "t", f: 60 },
  hr: { q: "t", f: 3600 },
  day: { q: "t", f: 86400 },
  yr: { q: "t", f: 31557600 },
  // 压强 pressure（基准 Pa）
  Pa: { q: "p", f: 1 },
  atm: { q: "p", f: 101325 },
  mmHg: { q: "p", f: 133.322 },
  psi: { q: "p", f: 6894.75729 },
  Torr: { q: "p", f: 133.322368 },
  // 力 force（基准 N）
  N: { q: "F", f: 1 },
  dyn: { q: "F", f: 1e-5 },
  lbf: { q: "F", f: 4.4482216152605 },
  pond: { q: "F", f: 980665e-8 },
  // 能量 energy（基准 J）
  J: { q: "e", f: 1 },
  e: { q: "e", f: 1e-7 },
  cal: { q: "e", f: 4.1868 },
  c: { q: "e", f: 4.184 },
  eV: { q: "e", f: 1602176634e-28 },
  HPh: { q: "e", f: 2684519537696173e-9 },
  Wh: { q: "e", f: 3600 },
  flb: { q: "e", f: 1.3558179483314003 },
  BTU: { q: "e", f: 1055.05585262 },
  // 功率 power（基准 W）
  W: { q: "P", f: 1 },
  HP: { q: "P", f: 745.6998715822702 },
  PS: { q: "P", f: 735.49875 },
  // 体积 volume（基准 L）
  L: { q: "v", f: 1 },
  l: { q: "v", f: 1 },
  tsp: { q: "v", f: 0.00492892159375 },
  tbs: { q: "v", f: 0.01478676478125 },
  oz: { q: "v", f: 0.0295735295625 },
  cup: { q: "v", f: 0.2365882365 },
  pt: { q: "v", f: 0.473176473 },
  qt: { q: "v", f: 0.946352946 },
  gal: { q: "v", f: 3.785411784 },
  "m3": { q: "v", f: 1e3 }
};
function convert(val, from, to) {
  const TEMP = /* @__PURE__ */ new Set(["C", "F", "K", "cel", "fah", "kel"]);
  const norm = (u) => u === "cel" ? "C" : u === "fah" ? "F" : u === "kel" ? "K" : u;
  if (TEMP.has(from) || TEMP.has(to)) {
    const nf = norm(from), nt = norm(to);
    if (!TEMP.has(from) || !TEMP.has(to)) return "#N/A";
    let c;
    if (nf === "C") c = val;
    else if (nf === "F") c = (val - 32) * 5 / 9;
    else c = val - 273.15;
    if (nt === "C") return c;
    if (nt === "F") return c * 9 / 5 + 32;
    return c + 273.15;
  }
  const uf = UNIT[from], ut = UNIT[to];
  if (!uf || !ut) return "#N/A";
  if (uf.q !== ut.q) return "#N/A";
  return val * uf.f / ut.f;
}
var ENGINEERING_BUILTINS = {
  // ── 进制转换 ──
  BIN2DEC: conv(2, "dec"),
  BIN2OCT: conv(2, 8),
  BIN2HEX: conv(2, 16),
  OCT2DEC: conv(8, "dec"),
  OCT2BIN: conv(8, 2),
  OCT2HEX: conv(8, 16),
  HEX2DEC: conv(16, "dec"),
  HEX2BIN: conv(16, 2),
  HEX2OCT: conv(16, 8),
  DEC2BIN: (args) => {
    const n = reqNum(args[0]);
    if (isError(n)) return n;
    const places = args[1] !== void 0 ? reqNum(args[1]) : void 0;
    if (places !== void 0 && isError(places)) return places;
    return toRadix(n, 2, places === void 0 ? void 0 : Math.trunc(places));
  },
  DEC2OCT: (args) => {
    const n = reqNum(args[0]);
    if (isError(n)) return n;
    const places = args[1] !== void 0 ? reqNum(args[1]) : void 0;
    if (places !== void 0 && isError(places)) return places;
    return toRadix(n, 8, places === void 0 ? void 0 : Math.trunc(places));
  },
  DEC2HEX: (args) => {
    const n = reqNum(args[0]);
    if (isError(n)) return n;
    const places = args[1] !== void 0 ? reqNum(args[1]) : void 0;
    if (places !== void 0 && isError(places)) return places;
    return toRadix(n, 16, places === void 0 ? void 0 : Math.trunc(places));
  },
  // ── 位运算 ──
  BITAND: bitOp((a, b) => a & b),
  BITOR: bitOp((a, b) => a | b),
  BITXOR: bitOp((a, b) => a ^ b),
  BITLSHIFT: (args) => {
    const a = reqNum(args[0]);
    if (isError(a)) return a;
    const shift = reqNum(args[1]);
    if (isError(shift)) return shift;
    const ca = bitCheck(a);
    if (isError(ca)) return ca;
    const sh = Math.trunc(shift);
    if (Math.abs(sh) > 53) return "#NUM!";
    const r = sh >= 0 ? BigInt(ca) << BigInt(sh) : BigInt(ca) >> BigInt(-sh);
    if (r < 0n || r > BigInt(BIT_MAX)) return "#NUM!";
    return Number(r);
  },
  BITRSHIFT: (args) => {
    const a = reqNum(args[0]);
    if (isError(a)) return a;
    const shift = reqNum(args[1]);
    if (isError(shift)) return shift;
    const ca = bitCheck(a);
    if (isError(ca)) return ca;
    const sh = Math.trunc(shift);
    if (Math.abs(sh) > 53) return "#NUM!";
    const r = sh >= 0 ? BigInt(ca) >> BigInt(sh) : BigInt(ca) << BigInt(-sh);
    if (r < 0n || r > BigInt(BIT_MAX)) return "#NUM!";
    return Number(r);
  },
  // ── 比较 / 误差函数 ──
  DELTA: (args) => {
    const a = reqNum(args[0]);
    if (isError(a)) return a;
    const b = optNum(args[1], 0);
    if (isError(b)) return b;
    return a === b ? 1 : 0;
  },
  GESTEP: (args) => {
    const a = reqNum(args[0]);
    if (isError(a)) return a;
    const step = optNum(args[1], 0);
    if (isError(step)) return step;
    return a >= step ? 1 : 0;
  },
  ERF: (args) => {
    const lo = reqNum(args[0]);
    if (isError(lo)) return lo;
    if (args[1] !== void 0) {
      const hi = reqNum(args[1]);
      if (isError(hi)) return hi;
      return finite3(erf(hi) - erf(lo));
    }
    return finite3(erf(lo));
  },
  "ERF.PRECISE": (args) => {
    const x = reqNum(args[0]);
    if (isError(x)) return x;
    return finite3(erf(x));
  },
  ERFC: (args) => {
    const x = reqNum(args[0]);
    if (isError(x)) return x;
    return finite3(erfc(x));
  },
  "ERFC.PRECISE": (args) => {
    const x = reqNum(args[0]);
    if (isError(x)) return x;
    return finite3(erfc(x));
  },
  // ── 贝塞尔 ──
  BESSELJ: (args) => {
    const x = reqNum(args[0]);
    if (isError(x)) return x;
    const n = reqNum(args[1]);
    if (isError(n)) return n;
    const r = besselJn(n, x);
    return isError(r) ? r : finite3(r);
  },
  BESSELY: (args) => {
    const x = reqNum(args[0]);
    if (isError(x)) return x;
    const n = reqNum(args[1]);
    if (isError(n)) return n;
    const r = besselYn(n, x);
    return isError(r) ? r : finite3(r);
  },
  BESSELI: (args) => {
    const x = reqNum(args[0]);
    if (isError(x)) return x;
    const n = reqNum(args[1]);
    if (isError(n)) return n;
    const r = besselIn(n, x);
    return isError(r) ? r : finite3(r);
  },
  BESSELK: (args) => {
    const x = reqNum(args[0]);
    if (isError(x)) return x;
    const n = reqNum(args[1]);
    if (isError(n)) return n;
    const r = besselKn(n, x);
    return isError(r) ? r : finite3(r);
  },
  // ── CONVERT ──
  CONVERT: (args) => {
    const v = reqNum(args[0]);
    if (isError(v)) return v;
    const from = toText(scalarArg(args[1]));
    if (isError(from)) return from;
    const to = toText(scalarArg(args[2]));
    if (isError(to)) return to;
    return convert(v, from.trim(), to.trim());
  },
  // ── 复数 ──
  COMPLEX: (args) => {
    const re = reqNum(args[0]);
    if (isError(re)) return re;
    const im = reqNum(args[1]);
    if (isError(im)) return im;
    const suf = args[2] !== void 0 ? toText(scalarArg(args[2])) : "i";
    if (isError(suf)) return suf;
    if (suf !== "i" && suf !== "j") return "#VALUE!";
    return fmtCx(re, im, suf);
  },
  IMREAL: (args) => {
    const z = reqCx(args[0]);
    if (isError(z)) return z;
    return z.re;
  },
  IMAGINARY: (args) => {
    const z = reqCx(args[0]);
    if (isError(z)) return z;
    return z.im;
  },
  IMABS: (args) => {
    const z = reqCx(args[0]);
    if (isError(z)) return z;
    return finite3(Math.hypot(z.re, z.im));
  },
  IMARGUMENT: (args) => {
    const z = reqCx(args[0]);
    if (isError(z)) return z;
    if (z.re === 0 && z.im === 0) return "#DIV/0!";
    return Math.atan2(z.im, z.re);
  },
  IMCONJUGATE: cx1((z) => ({ re: z.re, im: -z.im })),
  IMSUM: (args) => imAgg(args, (a, b) => ({ re: a.re + b.re, im: a.im + b.im })),
  IMSUB: (args) => {
    const a = reqCx(args[0]);
    if (isError(a)) return a;
    const b = reqCx(args[1]);
    if (isError(b)) return b;
    return fmtCx(a.re - b.re, a.im - b.im, a.suf);
  },
  IMPRODUCT: (args) => imAgg(args, (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re })),
  IMDIV: (args) => {
    const a = reqCx(args[0]);
    if (isError(a)) return a;
    const b = reqCx(args[1]);
    if (isError(b)) return b;
    const d = b.re * b.re + b.im * b.im;
    if (d === 0) return "#NUM!";
    return fmtCx((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d, a.suf);
  },
  IMEXP: cx1((z) => {
    const e = Math.exp(z.re);
    return { re: e * Math.cos(z.im), im: e * Math.sin(z.im) };
  }),
  IMLN: cx1((z) => {
    const m = Math.hypot(z.re, z.im);
    if (m === 0) return "#NUM!";
    return { re: Math.log(m), im: Math.atan2(z.im, z.re) };
  }),
  IMLOG10: cx1((z) => {
    const m = Math.hypot(z.re, z.im);
    if (m === 0) return "#NUM!";
    return { re: Math.log10(m), im: Math.atan2(z.im, z.re) / Math.LN10 };
  }),
  IMLOG2: cx1((z) => {
    const m = Math.hypot(z.re, z.im);
    if (m === 0) return "#NUM!";
    return { re: Math.log2(m), im: Math.atan2(z.im, z.re) / Math.LN2 };
  }),
  IMSQRT: cx1((z) => {
    const m = Math.hypot(z.re, z.im);
    const arg = Math.atan2(z.im, z.re) / 2;
    const r = Math.sqrt(m);
    return { re: r * Math.cos(arg), im: r * Math.sin(arg) };
  }),
  IMPOWER: (args) => {
    const z = reqCx(args[0]);
    if (isError(z)) return z;
    const p = reqNum(args[1]);
    if (isError(p)) return p;
    const m = Math.hypot(z.re, z.im);
    const arg = Math.atan2(z.im, z.re);
    const rm = Math.pow(m, p), ra = arg * p;
    return fmtCx(rm * Math.cos(ra), rm * Math.sin(ra), z.suf);
  },
  IMSIN: cx1((z) => ({ re: Math.sin(z.re) * Math.cosh(z.im), im: Math.cos(z.re) * Math.sinh(z.im) })),
  IMCOS: cx1((z) => ({ re: Math.cos(z.re) * Math.cosh(z.im), im: -Math.sin(z.re) * Math.sinh(z.im) })),
  IMTAN: cx1((z) => cxTan(z)),
  IMSINH: cx1((z) => ({ re: Math.sinh(z.re) * Math.cos(z.im), im: Math.cosh(z.re) * Math.sin(z.im) })),
  IMCOSH: cx1((z) => ({ re: Math.cosh(z.re) * Math.cos(z.im), im: Math.sinh(z.re) * Math.sin(z.im) })),
  IMSEC: cx1((z) => cxRecip({ re: Math.cos(z.re) * Math.cosh(z.im), im: -Math.sin(z.re) * Math.sinh(z.im) })),
  IMCSC: cx1((z) => cxRecip({ re: Math.sin(z.re) * Math.cosh(z.im), im: Math.cos(z.re) * Math.sinh(z.im) })),
  IMCOT: cx1((z) => {
    const t = cxTan(z);
    return isError(t) ? t : cxRecip(t);
  }),
  IMSECH: cx1((z) => cxRecip({ re: Math.cosh(z.re) * Math.cos(z.im), im: Math.sinh(z.re) * Math.sin(z.im) })),
  IMCSCH: cx1((z) => cxRecip({ re: Math.sinh(z.re) * Math.cos(z.im), im: Math.cosh(z.re) * Math.sin(z.im) }))
};
function cxTan(z) {
  const s = { re: Math.sin(z.re) * Math.cosh(z.im), im: Math.cos(z.re) * Math.sinh(z.im) };
  const c = { re: Math.cos(z.re) * Math.cosh(z.im), im: -Math.sin(z.re) * Math.sinh(z.im) };
  const d = c.re * c.re + c.im * c.im;
  if (d === 0) return "#NUM!";
  return { re: (s.re * c.re + s.im * c.im) / d, im: (s.im * c.re - s.re * c.im) / d };
}
function cxRecip(z) {
  const d = z.re * z.re + z.im * z.im;
  if (d === 0) return "#NUM!";
  return { re: z.re / d, im: -z.im / d };
}
function imAgg(args, f2) {
  let acc = null;
  for (const a of args) {
    const z = reqCx(a);
    if (isError(z)) return z;
    acc = acc === null ? z : { ...f2(acc, z), suf: acc.suf };
  }
  if (acc === null) return "#VALUE!";
  return fmtCx(acc.re, acc.im, acc.suf);
}

// src/formula/functions.ts
function numericValues(args) {
  const out = [];
  for (const v of flattenArgs(args)) {
    if (isError(v)) return v;
    if (isBlank(v)) continue;
    if (typeof v === "number") {
      out.push(v);
      continue;
    }
    if (typeof v === "boolean") {
      out.push(v ? 1 : 0);
      continue;
    }
    const n = Number(String(v).trim());
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}
var num2 = (v) => toNumber(v);
var BUILTINS = {
  // 数学 / 聚合。numericValues 返回 number[] 或 FormulaError；用 Array.isArray 收窄
  //（isError 的谓词是针对 FormulaValue 的，不能收窄 number[]|FormulaError 联合）。
  SUM: (args) => {
    const ns = numericValues(args);
    return Array.isArray(ns) ? ns.reduce((a, b) => a + b, 0) : ns;
  },
  AVERAGE: (args) => {
    const ns = numericValues(args);
    if (!Array.isArray(ns)) return ns;
    return ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : "#DIV/0!";
  },
  COUNT: (args) => flattenArgs(args).filter((v) => typeof v === "number" || typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))).length,
  COUNTA: (args) => flattenArgs(args).filter((v) => !isBlank(v)).length,
  COUNTBLANK: (args) => flattenArgs(args).filter((v) => isBlank(v)).length,
  MAX: (args) => {
    const ns = numericValues(args);
    if (!Array.isArray(ns)) return ns;
    return ns.length ? Math.max(...ns) : 0;
  },
  MIN: (args) => {
    const ns = numericValues(args);
    if (!Array.isArray(ns)) return ns;
    return ns.length ? Math.min(...ns) : 0;
  },
  ABS: (args) => {
    const n = num2(scalarArg(args[0]));
    return isError(n) ? n : Math.abs(n);
  },
  ROUND: (args) => {
    const n = num2(scalarArg(args[0]));
    if (isError(n)) return n;
    const d = num2(scalarArg(args[1]));
    if (isError(d)) return d;
    return roundHalfAway(n, Math.trunc(d));
  },
  ROUNDDOWN: (args) => {
    const n = num2(scalarArg(args[0]));
    if (isError(n)) return n;
    const d = num2(scalarArg(args[1]));
    if (isError(d)) return d;
    const f2 = Math.pow(10, Math.trunc(d));
    return Math.trunc(n * f2) / f2;
  },
  ROUNDUP: (args) => {
    const n = num2(scalarArg(args[0]));
    if (isError(n)) return n;
    const d = num2(scalarArg(args[1]));
    if (isError(d)) return d;
    const f2 = Math.pow(10, Math.trunc(d));
    const x = n * f2;
    return (x < 0 ? Math.floor(x) : Math.ceil(x)) / f2;
  },
  INT: (args) => {
    const n = num2(scalarArg(args[0]));
    return isError(n) ? n : Math.floor(n);
  },
  TRUNC: (args) => {
    const n = num2(scalarArg(args[0]));
    return isError(n) ? n : Math.trunc(n);
  },
  MOD: (args) => {
    const a = num2(scalarArg(args[0]));
    if (isError(a)) return a;
    const b = num2(scalarArg(args[1]));
    if (isError(b)) return b;
    return b === 0 ? "#DIV/0!" : a - b * Math.floor(a / b);
  },
  POWER: (args) => {
    const a = num2(scalarArg(args[0]));
    if (isError(a)) return a;
    const b = num2(scalarArg(args[1]));
    if (isError(b)) return b;
    const r = Math.pow(a, b);
    return Number.isFinite(r) ? r : "#NUM!";
  },
  SQRT: (args) => {
    const n = num2(scalarArg(args[0]));
    if (isError(n)) return n;
    return n < 0 ? "#NUM!" : Math.sqrt(n);
  },
  SUMIF: (args) => sumIf(args),
  COUNTIF: (args) => countIf(args),
  SUBTOTAL: (args) => subtotal(args),
  // 多条件聚合（M8）
  SUMIFS: (args) => sumIfs(args),
  COUNTIFS: (args) => countIfs(args),
  AVERAGEIF: (args) => averageIf(args),
  AVERAGEIFS: (args) => averageIfs(args),
  MAXIFS: (args) => extremumIfs(args, "max"),
  MINIFS: (args) => extremumIfs(args, "min"),
  // 数学 / 取整扩容（M8）
  MROUND: (args) => {
    const n = num2(scalarArg(args[0]));
    if (isError(n)) return n;
    const m = num2(scalarArg(args[1]));
    if (isError(m)) return m;
    if (m === 0) return 0;
    if (n < 0 !== m < 0) return "#NUM!";
    return roundHalfAway(n / m, 0) * m;
  },
  CEILING: (args) => {
    const n = num2(scalarArg(args[0]));
    if (isError(n)) return n;
    const s = args[1] ? num2(scalarArg(args[1])) : 1;
    if (isError(s)) return s;
    if (s === 0) return 0;
    if (n < 0 !== s < 0 && n !== 0) return "#NUM!";
    return Math.ceil(n / s) * s;
  },
  FLOOR: (args) => {
    const n = num2(scalarArg(args[0]));
    if (isError(n)) return n;
    const s = args[1] ? num2(scalarArg(args[1])) : 1;
    if (isError(s)) return s;
    if (s === 0) return 0;
    if (n < 0 !== s < 0 && n !== 0) return "#NUM!";
    return Math.floor(n / s) * s;
  },
  EVEN: (args) => {
    const n = num2(scalarArg(args[0]));
    if (isError(n)) return n;
    const k = Math.ceil(Math.abs(n) / 2) * 2;
    return n < 0 ? -k : k;
  },
  ODD: (args) => {
    const n = num2(scalarArg(args[0]));
    if (isError(n)) return n;
    let k = Math.ceil(Math.abs(n));
    if (k % 2 === 0) k += 1;
    return n < 0 ? -k : k;
  },
  SIGN: (args) => {
    const n = num2(scalarArg(args[0]));
    if (isError(n)) return n;
    return n > 0 ? 1 : n < 0 ? -1 : 0;
  },
  GCD: (args) => {
    const ns = intList(args);
    if (!Array.isArray(ns)) return ns;
    return ns.reduce((a, b) => gcd2(a, b), 0);
  },
  LCM: (args) => {
    const ns = intList(args);
    if (!Array.isArray(ns)) return ns;
    return ns.reduce((a, b) => a === 0 || b === 0 ? 0 : Math.abs(a / gcd2(a, b) * b), 1);
  },
  SUMSQ: (args) => {
    const ns = numericValues(args);
    if (!Array.isArray(ns)) return ns;
    return ns.reduce((s, n) => s + n * n, 0);
  },
  PRODUCT: (args) => {
    const ns = numericValues(args);
    if (!Array.isArray(ns)) return ns;
    return ns.length ? ns.reduce((a, b) => a * b, 1) : 0;
  },
  SUMPRODUCT: (args) => sumProduct(args),
  MEDIAN: (args) => {
    const ns = numericValues(args);
    if (!Array.isArray(ns)) return ns;
    return median(ns);
  },
  MODE: (args) => {
    const ns = numericValues(args);
    if (!Array.isArray(ns)) return ns;
    return mode(ns);
  },
  "MODE.SNGL": (args) => {
    const ns = numericValues(args);
    if (!Array.isArray(ns)) return ns;
    return mode(ns);
  },
  STDEV: (args) => {
    const ns = numericValues(args);
    if (!Array.isArray(ns)) return ns;
    return variance(ns, true, Math.sqrt);
  },
  "STDEV.S": (args) => {
    const ns = numericValues(args);
    if (!Array.isArray(ns)) return ns;
    return variance(ns, true, Math.sqrt);
  },
  STDEVP: (args) => {
    const ns = numericValues(args);
    if (!Array.isArray(ns)) return ns;
    return variance(ns, false, Math.sqrt);
  },
  "STDEV.P": (args) => {
    const ns = numericValues(args);
    if (!Array.isArray(ns)) return ns;
    return variance(ns, false, Math.sqrt);
  },
  VAR: (args) => {
    const ns = numericValues(args);
    if (!Array.isArray(ns)) return ns;
    return variance(ns, true);
  },
  "VAR.S": (args) => {
    const ns = numericValues(args);
    if (!Array.isArray(ns)) return ns;
    return variance(ns, true);
  },
  VARP: (args) => {
    const ns = numericValues(args);
    if (!Array.isArray(ns)) return ns;
    return variance(ns, false);
  },
  "VAR.P": (args) => {
    const ns = numericValues(args);
    if (!Array.isArray(ns)) return ns;
    return variance(ns, false);
  },
  RANK: (args) => rank(args),
  "RANK.EQ": (args) => rank(args),
  LARGE: (args) => nthOrder(args, "large"),
  SMALL: (args) => nthOrder(args, "small"),
  PERCENTILE: (args) => percentile(args),
  "PERCENTILE.INC": (args) => percentile(args),
  // 逻辑
  IF: (args, ctx) => {
    const cond = toBoolean(scalarArg(args[0]));
    if (isError(cond)) return cond;
    const branch = cond ? args[1] : args[2];
    return branch ? scalarArg(branch) : cond ? true : false;
  },
  IFERROR: (args) => {
    const v = scalarArg(args[0]);
    return isError(v) ? scalarArg(args[1]) : v;
  },
  IFNA: (args) => {
    const v = scalarArg(args[0]);
    return v === "#N/A" ? scalarArg(args[1]) : v;
  },
  AND: (args) => {
    const vs = flattenArgs(args);
    const e = firstError(vs);
    if (e) return e;
    let any = false;
    for (const v of vs) {
      if (isBlank(v)) continue;
      const b = toBoolean(v);
      if (isError(b)) return b;
      any = true;
      if (!b) return false;
    }
    return any ? true : "#VALUE!";
  },
  OR: (args) => {
    const vs = flattenArgs(args);
    const e = firstError(vs);
    if (e) return e;
    for (const v of vs) {
      if (isBlank(v)) continue;
      const b = toBoolean(v);
      if (isError(b)) return b;
      if (b) return true;
    }
    return false;
  },
  NOT: (args) => {
    const b = toBoolean(scalarArg(args[0]));
    return isError(b) ? b : !b;
  },
  TRUE: () => true,
  FALSE: () => false,
  ISBLANK: (args) => isBlank(scalarArg(args[0])),
  ISERROR: (args) => isError(scalarArg(args[0])),
  ISNUMBER: (args) => typeof scalarArg(args[0]) === "number",
  ISTEXT: (args) => typeof scalarArg(args[0]) === "string" && !isError(scalarArg(args[0])),
  ISEMPTY: (args) => isBlank(scalarArg(args[0])),
  // 报表模板常用别名
  COALESCE: (args) => {
    for (const a of args) {
      const v = scalarArg(a);
      if (!isBlank(v)) return v;
    }
    return null;
  },
  // 逻辑 / 信息扩容（M8）
  IFS: (args) => {
    for (let i = 0; i + 1 < args.length; i += 2) {
      const cond = toBoolean(scalarArg(args[i]));
      if (isError(cond)) return cond;
      if (cond) return scalarArg(args[i + 1]);
    }
    return "#N/A";
  },
  SWITCH: (args) => {
    const target = scalarArg(args[0]);
    const n = args.length;
    for (let i = 1; i + 1 < n; i += 2) {
      if (compareEq(scalarArg(args[i]), target)) return scalarArg(args[i + 1]);
    }
    return (n - 1) % 2 === 1 ? scalarArg(args[n - 1]) : "#N/A";
  },
  ISNA: (args) => scalarArg(args[0]) === "#N/A",
  ISERR: (args) => {
    const v = scalarArg(args[0]);
    return isError(v) && v !== "#N/A";
  },
  ISLOGICAL: (args) => typeof scalarArg(args[0]) === "boolean",
  ISNONTEXT: (args) => {
    const v = scalarArg(args[0]);
    return typeof v !== "string" || isError(v);
  },
  ISODD: (args) => {
    const n = num2(scalarArg(args[0]));
    if (isError(n)) return n;
    return Math.trunc(Math.abs(n)) % 2 === 1;
  },
  ISEVEN: (args) => {
    const n = num2(scalarArg(args[0]));
    if (isError(n)) return n;
    return Math.trunc(Math.abs(n)) % 2 === 0;
  },
  NA: () => "#N/A",
  N: (args) => {
    const v = scalarArg(args[0]);
    if (isError(v)) return v;
    if (typeof v === "number") return v;
    if (typeof v === "boolean") return v ? 1 : 0;
    return 0;
  },
  T: (args) => {
    const v = scalarArg(args[0]);
    if (isError(v)) return v;
    return typeof v === "string" ? v : "";
  },
  TYPE: (args) => {
    const v = scalarArg(args[0]);
    if (isError(v)) return 16;
    if (typeof v === "number") return 1;
    if (typeof v === "string") return 2;
    if (typeof v === "boolean") return 4;
    return 1;
  },
  // 文本
  CONCATENATE: (args) => {
    let s = "";
    for (const v of flattenArgs(args)) {
      const t = toText(v);
      if (isError(t)) return t;
      s += t;
    }
    return s;
  },
  CONCAT: (args) => BUILTINS.CONCATENATE(args, {}),
  LEFT: (args) => {
    const t = toText(scalarArg(args[0]));
    if (isError(t)) return t;
    const n = args[1] ? num2(scalarArg(args[1])) : 1;
    if (isError(n)) return n;
    return t.slice(0, Math.max(0, Math.trunc(n)));
  },
  RIGHT: (args) => {
    const t = toText(scalarArg(args[0]));
    if (isError(t)) return t;
    const n = args[1] ? num2(scalarArg(args[1])) : 1;
    if (isError(n)) return n;
    const k = Math.max(0, Math.trunc(n));
    return k === 0 ? "" : t.slice(-k);
  },
  MID: (args) => {
    const t = toText(scalarArg(args[0]));
    if (isError(t)) return t;
    const start = num2(scalarArg(args[1]));
    if (isError(start)) return start;
    const len = num2(scalarArg(args[2]));
    if (isError(len)) return len;
    const s = Math.max(1, Math.trunc(start));
    return t.slice(s - 1, s - 1 + Math.max(0, Math.trunc(len)));
  },
  LEN: (args) => {
    const t = toText(scalarArg(args[0]));
    return isError(t) ? t : t.length;
  },
  TRIM: (args) => {
    const t = toText(scalarArg(args[0]));
    return isError(t) ? t : t.replace(/ +/g, " ").replace(/^ | $/g, "");
  },
  // Excel TRIM 只折叠 ASCII 空格,保留其他空白
  UPPER: (args) => {
    const t = toText(scalarArg(args[0]));
    return isError(t) ? t : t.toUpperCase();
  },
  LOWER: (args) => {
    const t = toText(scalarArg(args[0]));
    return isError(t) ? t : t.toLowerCase();
  },
  TEXT: (args) => textFormat(args),
  VALUE: (args) => {
    const n = num2(scalarArg(args[0]));
    return n;
  },
  // 文本扩容（M8）
  TEXTJOIN: (args) => textJoin(args),
  SUBSTITUTE: (args) => substitute(args),
  REPLACE: (args) => {
    const t = toText(scalarArg(args[0]));
    if (isError(t)) return t;
    const start = num2(scalarArg(args[1]));
    if (isError(start)) return start;
    const len = num2(scalarArg(args[2]));
    if (isError(len)) return len;
    const nw = toText(scalarArg(args[3]));
    if (isError(nw)) return nw;
    const s = Math.max(1, Math.trunc(start));
    return t.slice(0, s - 1) + nw + t.slice(s - 1 + Math.max(0, Math.trunc(len)));
  },
  FIND: (args) => findIn(args, true),
  SEARCH: (args) => findIn(args, false),
  REPT: (args) => {
    const t = toText(scalarArg(args[0]));
    if (isError(t)) return t;
    const n = num2(scalarArg(args[1]));
    if (isError(n)) return n;
    const k = Math.trunc(n);
    return k <= 0 ? "" : t.repeat(k);
  },
  PROPER: (args) => {
    const t = toText(scalarArg(args[0]));
    if (isError(t)) return t;
    return t.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\B\w/g, (c) => c.toLowerCase());
  },
  EXACT: (args) => {
    const a = toText(scalarArg(args[0]));
    if (isError(a)) return a;
    const b = toText(scalarArg(args[1]));
    if (isError(b)) return b;
    return a === b;
  },
  CHAR: (args) => {
    const n = num2(scalarArg(args[0]));
    if (isError(n)) return n;
    const k = Math.trunc(n);
    return k < 1 || k > 65535 ? "#VALUE!" : String.fromCharCode(k);
  },
  CODE: (args) => {
    const t = toText(scalarArg(args[0]));
    if (isError(t)) return t;
    return t.length === 0 ? "#VALUE!" : t.charCodeAt(0);
  },
  UNICHAR: (args) => {
    const n = num2(scalarArg(args[0]));
    if (isError(n)) return n;
    const k = Math.trunc(n);
    return k < 1 ? "#VALUE!" : String.fromCodePoint(k);
  },
  UNICODE: (args) => {
    const t = toText(scalarArg(args[0]));
    if (isError(t)) return t;
    return t.length === 0 ? "#VALUE!" : t.codePointAt(0);
  },
  NUMBERVALUE: (args) => numberValue(args),
  // 查找(基础)
  MATCH: (args) => matchFn(args),
  // 日期时间（M8，依赖 M7 dateSerial）
  DATE: (args) => {
    const y = num2(scalarArg(args[0]));
    if (isError(y)) return y;
    const m = num2(scalarArg(args[1]));
    if (isError(m)) return m;
    const d = num2(scalarArg(args[2]));
    if (isError(d)) return d;
    const yr = Math.trunc(y);
    const yy = yr >= 0 && yr < 1900 ? 1900 + yr : yr;
    return dateOverflow(yy, Math.trunc(m), Math.trunc(d));
  },
  TIME: (args) => {
    const h = num2(scalarArg(args[0]));
    if (isError(h)) return h;
    const mi = num2(scalarArg(args[1]));
    if (isError(mi)) return mi;
    const s = num2(scalarArg(args[2]));
    if (isError(s)) return s;
    const frac = timeToFraction(Math.trunc(h), Math.trunc(mi), Math.trunc(s));
    return frac - Math.floor(frac);
  },
  YEAR: (args) => datePart(args, "year"),
  MONTH: (args) => datePart(args, "month"),
  DAY: (args) => datePart(args, "day"),
  HOUR: (args) => datePart(args, "hours"),
  MINUTE: (args) => datePart(args, "minutes"),
  SECOND: (args) => datePart(args, "seconds"),
  WEEKDAY: (args) => weekday(args),
  EDATE: (args) => edate(args, false),
  EOMONTH: (args) => edate(args, true),
  DATEDIF: (args) => datedif(args),
  DATEVALUE: (args) => dateValue(args),
  TODAY: () => {
    const d = /* @__PURE__ */ new Date();
    return dateToSerial(d.getFullYear(), d.getMonth() + 1, d.getDate());
  },
  NOW: () => {
    const d = /* @__PURE__ */ new Date();
    return partsToSerial(d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds());
  },
  NETWORKDAYS: (args) => networkDays(args),
  // 日期扩容（工程/日期族补齐）
  DAYS: (args) => daysBetween(args),
  DAYS360: (args) => days360(args),
  YEARFRAC: (args) => yearFrac(args),
  WEEKNUM: (args) => weekNum(args),
  ISOWEEKNUM: (args) => isoWeekNum(args),
  TIMEVALUE: (args) => timeValue(args),
  WORKDAY: (args) => workday(args),
  "WORKDAY.INTL": (args) => workdayIntl(args),
  "NETWORKDAYS.INTL": (args) => networkDaysIntl(args),
  // 查找 / 引用扩容（M8）
  VLOOKUP: (args) => vlookup(args),
  HLOOKUP: (args) => hlookup(args),
  LOOKUP: (args) => lookup(args),
  INDEX: (args) => indexFn(args),
  CHOOSE: (args) => {
    const k = num2(scalarArg(args[0]));
    if (isError(k)) return k;
    const i = Math.trunc(k);
    return i >= 1 && i < args.length ? scalarArg(args[i]) : "#VALUE!";
  },
  XLOOKUP: (args) => xlookup(args),
  ROWS: (args) => dimOf(args[0], "rows"),
  COLUMNS: (args) => dimOf(args[0], "cols"),
  ROW: (args, ctx) => args[0] ? "#VALUE!" : ctx.row + 1,
  // 无参 = 当前格行号（1-based）
  COLUMN: (args, ctx) => args[0] ? "#VALUE!" : ctx.col + 1,
  // ── M17 函数库大扩容：按族汇入（math/financial/statistical/database/textref）──
  // 各族独立模块（builtins/*.ts），此处展开并入同一注册表。核心 123 保持不变；
  // 族名与核心零重叠（见 test/functionsM17.test.ts 的去重断言）。
  ...MATH_BUILTINS,
  ...FINANCIAL_BUILTINS,
  ...STATISTICAL_BUILTINS,
  ...DATABASE_BUILTINS,
  ...TEXTREF_BUILTINS,
  ...ENGINEERING_BUILTINS
};
function matchesCriteria(v, criteria) {
  if (isBlank(criteria)) return isBlank(v);
  const cs = String(criteria).trim();
  const m = /^(>=|<=|<>|>|<|=)?(.*)$/.exec(cs);
  const opr = m?.[1] ?? "";
  const rhs = m?.[2] ?? "";
  const rhsNum = Number(rhs);
  const vNum = typeof v === "number" ? v : Number(String(v));
  if (opr && Number.isFinite(rhsNum) && Number.isFinite(vNum)) {
    switch (opr) {
      case ">=":
        return vNum >= rhsNum;
      case "<=":
        return vNum <= rhsNum;
      case "<>":
        return vNum !== rhsNum;
      case ">":
        return vNum > rhsNum;
      case "<":
        return vNum < rhsNum;
      case "=":
        return vNum === rhsNum;
    }
  }
  const vs = String(v ?? "");
  const target = opr === "=" || opr === "<>" ? rhs : cs;
  const hasWild = /[*?]/.test(target);
  let eq;
  if (hasWild) eq = wildcardToRegExp(target, "i").test(vs);
  else eq = vs.toUpperCase() === target.toUpperCase();
  if (opr === "<>") return !eq;
  return eq;
}
function sumIf(args) {
  const rangeArg = args[0];
  const criteria = scalarArg(args[1]);
  if (!rangeArg || rangeArg.kind !== "range") return "#VALUE!";
  const sumArg = args[2] ?? rangeArg;
  const flatRange = flattenArg(rangeArg);
  const flatSum = flattenArg(sumArg);
  let total = 0;
  for (let i = 0; i < flatRange.length; i++) {
    if (matchesCriteria(flatRange[i], criteria)) {
      const n = toNumber(flatSum[i] ?? flatRange[i]);
      if (!isError(n)) total += n;
    }
  }
  return total;
}
function countIf(args) {
  const rangeArg = args[0];
  const criteria = scalarArg(args[1]);
  if (!rangeArg) return 0;
  return flattenArg(rangeArg).filter((v) => matchesCriteria(v, criteria)).length;
}
function subtotal(args) {
  const code = toNumber(scalarArg(args[0]));
  if (isError(code)) return code;
  const rest = args.slice(1);
  const c = Math.trunc(code) % 100;
  switch (c) {
    case 1:
      return BUILTINS.AVERAGE(rest, {});
    case 2:
      return BUILTINS.COUNT(rest, {});
    case 3:
      return BUILTINS.COUNTA(rest, {});
    case 4:
      return BUILTINS.MAX(rest, {});
    case 5:
      return BUILTINS.MIN(rest, {});
    case 6:
      return BUILTINS.PRODUCT(rest, {});
    case 7:
      return BUILTINS.STDEV(rest, {});
    case 8:
      return BUILTINS.STDEVP(rest, {});
    case 9:
      return BUILTINS.SUM(rest, {});
    case 10:
      return BUILTINS.VAR(rest, {});
    case 11:
      return BUILTINS.VARP(rest, {});
    default:
      return "#VALUE!";
  }
}
function textFormat(args) {
  const v = scalarArg(args[0]);
  if (isError(v)) return v;
  const fmt = toText(scalarArg(args[1]));
  if (isError(fmt)) return fmt;
  const cell = typeof v === "number" || typeof v === "boolean" ? v : String(v ?? "");
  return formatWith(cell, fmt).text;
}
function matchFn(args) {
  const target = scalarArg(args[0]);
  const rangeArg = args[1];
  if (!rangeArg) return "#N/A";
  const matchType = args[2] ? num2(scalarArg(args[2])) : 1;
  if (isError(matchType)) return matchType;
  const flat = flattenArg(rangeArg);
  const mt = Math.trunc(matchType);
  if (mt === 0) {
    for (let i = 0; i < flat.length; i++) if (matchExact(flat[i], target)) return i + 1;
    return "#N/A";
  }
  if (mt > 0) {
    let found2 = -1;
    for (let i = 0; i < flat.length; i++) {
      const c = compareLoose(flat[i], target);
      if (c !== null && c <= 0) found2 = i;
      else if (c !== null && c > 0) break;
    }
    return found2 < 0 ? "#N/A" : found2 + 1;
  }
  let found = -1;
  for (let i = 0; i < flat.length; i++) {
    const c = compareLoose(flat[i], target);
    if (c !== null && c >= 0) found = i;
    else if (c !== null && c < 0) break;
  }
  return found < 0 ? "#N/A" : found + 1;
}
function compareEq(a, b) {
  if (typeof a === "number" && typeof b === "number") return a === b;
  return String(a ?? "").toUpperCase() === String(b ?? "").toUpperCase();
}
function roundHalfAway(n, digits) {
  const f2 = Math.pow(10, digits);
  const x = n * f2;
  const r = x >= 0 ? Math.floor(x + 0.5) : Math.ceil(x - 0.5);
  return r / f2;
}
function gcd2(a, b) {
  a = Math.abs(Math.trunc(a));
  b = Math.abs(Math.trunc(b));
  while (b) {
    [a, b] = [b, a % b];
  }
  return a;
}
function intList(args) {
  const out = [];
  for (const v of flattenArgs(args)) {
    if (isBlank(v)) continue;
    const n = toNumber(v);
    if (isError(n)) return n;
    if (n < 0) return "#NUM!";
    out.push(Math.trunc(n));
  }
  return out;
}
function median(ns) {
  if (ns.length === 0) return "#NUM!";
  const s = [...ns].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
function mode(ns) {
  const count = /* @__PURE__ */ new Map();
  let best = null;
  let bestCount = 1;
  for (const n of ns) {
    const c = (count.get(n) ?? 0) + 1;
    count.set(n, c);
    if (c > bestCount) {
      bestCount = c;
      best = n;
    }
  }
  return best === null ? "#N/A" : best;
}
function variance(ns, sample, transform = (x) => x) {
  const n = ns.length;
  if (sample ? n < 2 : n < 1) return "#DIV/0!";
  const mean3 = ns.reduce((a, b) => a + b, 0) / n;
  const ss = ns.reduce((a, b) => a + (b - mean3) * (b - mean3), 0);
  return transform(ss / (sample ? n - 1 : n));
}
function rank(args) {
  const target = num2(scalarArg(args[0]));
  if (isError(target)) return target;
  const ns = flattenArg(args[1] ?? { kind: "value", value: null }).map(toNumber).filter((v) => !isError(v));
  const orderArg = args[2] ? num2(scalarArg(args[2])) : 0;
  const ascending = !isError(orderArg) && orderArg !== 0;
  const sorted = [...ns].sort((a, b) => ascending ? a - b : b - a);
  const idx = sorted.indexOf(target);
  return idx < 0 ? "#N/A" : idx + 1;
}
function nthOrder(args, which) {
  const ns = flattenArg(args[0] ?? { kind: "value", value: null }).map(toNumber).filter((v) => !isError(v));
  const k = num2(scalarArg(args[1]));
  if (isError(k)) return k;
  const i = Math.trunc(k);
  if (i < 1 || i > ns.length) return "#NUM!";
  const sorted = [...ns].sort((a, b) => which === "large" ? b - a : a - b);
  return sorted[i - 1];
}
function percentile(args) {
  const ns = flattenArg(args[0] ?? { kind: "value", value: null }).map(toNumber).filter((v) => !isError(v));
  const p = num2(scalarArg(args[1]));
  if (isError(p)) return p;
  if (p < 0 || p > 1 || ns.length === 0) return "#NUM!";
  const s = [...ns].sort((a, b) => a - b);
  const rank2 = p * (s.length - 1);
  const lo = Math.floor(rank2);
  const hi = Math.ceil(rank2);
  if (lo === hi) return s[lo];
  return s[lo] + (rank2 - lo) * (s[hi] - s[lo]);
}
function sumProduct(args) {
  const vectors = args.map((a) => flattenArg(a).map((v) => isBlank(v) ? 0 : typeof v === "number" ? v : Number(String(v)) || 0));
  if (vectors.length === 0) return 0;
  const len = vectors[0].length;
  for (const v of vectors) if (v.length !== len) return "#VALUE!";
  let total = 0;
  for (let i = 0; i < len; i++) {
    let prod = 1;
    for (const v of vectors) prod *= v[i];
    total += prod;
  }
  return total;
}
function buildMask(pairs) {
  if (pairs.length === 0) return [];
  const flats = pairs.map((p) => flattenArg(p.range));
  const len = flats[0].length;
  for (const f2 of flats) if (f2.length !== len) return "#VALUE!";
  const mask = [];
  for (let i = 0; i < len; i++) {
    let ok = true;
    for (let j = 0; j < pairs.length; j++) {
      if (!matchesCriteria(flats[j][i], pairs[j].crit)) {
        ok = false;
        break;
      }
    }
    mask.push(ok);
  }
  return mask;
}
function sumIfs(args) {
  const sumRange2 = flattenArg(args[0] ?? { kind: "value", value: null });
  const pairs = [];
  for (let i = 1; i + 1 < args.length; i += 2) pairs.push({ range: args[i], crit: scalarArg(args[i + 1]) });
  const mask = buildMask(pairs);
  if (!Array.isArray(mask)) return mask;
  let total = 0;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i]) {
      const n = toNumber(sumRange2[i] ?? 0);
      if (!isError(n)) total += n;
    }
  }
  return total;
}
function countIfs(args) {
  const pairs = [];
  for (let i = 0; i + 1 < args.length; i += 2) pairs.push({ range: args[i], crit: scalarArg(args[i + 1]) });
  const mask = buildMask(pairs);
  if (!Array.isArray(mask)) return mask;
  return mask.filter(Boolean).length;
}
function averageIf(args) {
  const rangeArg = args[0];
  const criteria = scalarArg(args[1]);
  if (!rangeArg) return "#DIV/0!";
  const avgArg = args[2] ?? rangeArg;
  const flatRange = flattenArg(rangeArg);
  const flatAvg = flattenArg(avgArg);
  let sum = 0, cnt = 0;
  for (let i = 0; i < flatRange.length; i++) {
    if (matchesCriteria(flatRange[i], criteria)) {
      const n = toNumber(flatAvg[i] ?? flatRange[i]);
      if (!isError(n)) {
        sum += n;
        cnt++;
      }
    }
  }
  return cnt === 0 ? "#DIV/0!" : sum / cnt;
}
function averageIfs(args) {
  const avgRange = flattenArg(args[0] ?? { kind: "value", value: null });
  const pairs = [];
  for (let i = 1; i + 1 < args.length; i += 2) pairs.push({ range: args[i], crit: scalarArg(args[i + 1]) });
  const mask = buildMask(pairs);
  if (!Array.isArray(mask)) return mask;
  let sum = 0, cnt = 0;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i]) {
      const n = toNumber(avgRange[i] ?? 0);
      if (!isError(n)) {
        sum += n;
        cnt++;
      }
    }
  }
  return cnt === 0 ? "#DIV/0!" : sum / cnt;
}
function extremumIfs(args, which) {
  const valRange = flattenArg(args[0] ?? { kind: "value", value: null });
  const pairs = [];
  for (let i = 1; i + 1 < args.length; i += 2) pairs.push({ range: args[i], crit: scalarArg(args[i + 1]) });
  const mask = buildMask(pairs);
  if (!Array.isArray(mask)) return mask;
  let best = null;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const n = toNumber(valRange[i] ?? 0);
    if (isError(n)) continue;
    if (best === null || (which === "max" ? n > best : n < best)) best = n;
  }
  return best === null ? 0 : best;
}
function textJoin(args) {
  const delim = toText(scalarArg(args[0]));
  if (isError(delim)) return delim;
  const ignoreEmpty = toBoolean(scalarArg(args[1]));
  if (isError(ignoreEmpty)) return ignoreEmpty;
  const parts = [];
  for (const v of flattenArgs(args.slice(2))) {
    if (ignoreEmpty && isBlank(v)) continue;
    const t = toText(v);
    if (isError(t)) return t;
    parts.push(t);
  }
  return parts.join(delim);
}
function substitute(args) {
  const t = toText(scalarArg(args[0]));
  if (isError(t)) return t;
  const oldT = toText(scalarArg(args[1]));
  if (isError(oldT)) return oldT;
  const newT = toText(scalarArg(args[2]));
  if (isError(newT)) return newT;
  if (oldT === "") return t;
  if (args[3] === void 0) return t.split(oldT).join(newT);
  const which = num2(scalarArg(args[3]));
  if (isError(which)) return which;
  const nth = Math.trunc(which);
  if (nth < 1) return "#VALUE!";
  let idx = -1, count = 0;
  while ((idx = t.indexOf(oldT, idx + 1)) >= 0) {
    if (++count === nth) return t.slice(0, idx) + newT + t.slice(idx + oldT.length);
  }
  return t;
}
function findIn(args, caseSensitive) {
  const needle = toText(scalarArg(args[0]));
  if (isError(needle)) return needle;
  const hay = toText(scalarArg(args[1]));
  if (isError(hay)) return hay;
  const start = args[2] ? num2(scalarArg(args[2])) : 1;
  if (isError(start)) return start;
  const from = Math.max(0, Math.trunc(start) - 1);
  if (caseSensitive) {
    const idx = hay.indexOf(needle, from);
    return idx < 0 ? "#VALUE!" : idx + 1;
  }
  const re = wildcardToRegExp(needle, "i", false);
  const sub = hay.slice(from);
  const m = re.exec(sub);
  return m ? from + m.index + 1 : "#VALUE!";
}
function numberValue(args) {
  const t = toText(scalarArg(args[0]));
  if (isError(t)) return t;
  const dec = args[1] ? toText(scalarArg(args[1])) : ".";
  const grp = args[2] ? toText(scalarArg(args[2])) : ",";
  if (isError(dec) || isError(grp)) return "#VALUE!";
  let s = t.split(grp).join("").replace(dec, ".").trim();
  s = s.replace(/%$/, "");
  const n = Number(s);
  if (!Number.isFinite(n)) return "#VALUE!";
  return t.trim().endsWith("%") ? n / 100 : n;
}
function wildcardToRegExp(pattern, flags, anchored = true) {
  let out = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "~") {
      const nx = pattern[i + 1];
      if (nx) {
        out += nx.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        i++;
      }
      continue;
    }
    if (c === "*") {
      out += ".*";
      continue;
    }
    if (c === "?") {
      out += ".";
      continue;
    }
    out += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(anchored ? "^" + out + "$" : out, flags);
}
function dateOverflow(year, month, day) {
  const ms = Date.UTC(year, month - 1, day);
  const d = new Date(ms);
  return dateToSerial(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}
function datePart(args, part) {
  const s = num2(scalarArg(args[0]));
  if (isError(s)) return s;
  if (s < 0) return "#NUM!";
  return serialToParts(s)[part];
}
function weekday(args) {
  const s = num2(scalarArg(args[0]));
  if (isError(s)) return s;
  const type = args[1] ? num2(scalarArg(args[1])) : 1;
  if (isError(type)) return type;
  const dow = serialToParts(s).weekday;
  switch (Math.trunc(type)) {
    case 1:
      return dow + 1;
    // 1=Sun..7=Sat
    case 2:
      return (dow + 6) % 7 + 1;
    // 1=Mon..7=Sun
    case 3:
      return (dow + 6) % 7;
    // 0=Mon..6=Sun
    default:
      return dow + 1;
  }
}
function edate(args, endOfMonth) {
  const s = num2(scalarArg(args[0]));
  if (isError(s)) return s;
  const months = num2(scalarArg(args[1]));
  if (isError(months)) return months;
  const p = serialToParts(s);
  const total = p.year * 12 + (p.month - 1) + Math.trunc(months);
  const yr = Math.floor(total / 12);
  const mo = total % 12 + 1;
  if (endOfMonth) {
    const lastDay2 = new Date(Date.UTC(yr, mo, 0)).getUTCDate();
    return dateToSerial(yr, mo, lastDay2);
  }
  const lastDay = new Date(Date.UTC(yr, mo, 0)).getUTCDate();
  return dateToSerial(yr, mo, Math.min(p.day, lastDay));
}
function datedif(args) {
  const s1 = num2(scalarArg(args[0]));
  if (isError(s1)) return s1;
  const s2 = num2(scalarArg(args[1]));
  if (isError(s2)) return s2;
  const unit = toText(scalarArg(args[2]));
  if (isError(unit)) return unit;
  if (s2 < s1) return "#NUM!";
  const a = serialToParts(s1), b = serialToParts(s2);
  switch (unit.toUpperCase()) {
    case "D":
      return Math.trunc(s2) - Math.trunc(s1);
    case "M": {
      let m = (b.year - a.year) * 12 + (b.month - a.month);
      if (b.day < a.day) m -= 1;
      return m;
    }
    case "Y": {
      let y = b.year - a.year;
      if (b.month < a.month || b.month === a.month && b.day < a.day) y -= 1;
      return y;
    }
    case "MD": {
      const ref = new Date(Date.UTC(b.year, b.month - 1, 0)).getUTCDate();
      return b.day >= a.day ? b.day - a.day : b.day + ref - a.day;
    }
    case "YM": {
      let m = b.month - a.month;
      if (b.day < a.day) m -= 1;
      if (m < 0) m += 12;
      return m;
    }
    case "YD": {
      const base = dateToSerial(b.year, a.month, Math.min(a.day, 28));
      return Math.trunc(s2) - (base <= s2 ? base : dateToSerial(b.year - 1, a.month, a.day));
    }
    default:
      return "#NUM!";
  }
}
function dateValue(args) {
  const t = toText(scalarArg(args[0]));
  if (isError(t)) return t;
  const m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(t.trim());
  if (m) return dateToSerial(Number(m[1]), Number(m[2]), Number(m[3]));
  const m22 = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(t.trim());
  if (m22) return dateToSerial(Number(m22[3]), Number(m22[1]), Number(m22[2]));
  return "#VALUE!";
}
function networkDays(args) {
  const s1 = num2(scalarArg(args[0]));
  if (isError(s1)) return s1;
  const s2 = num2(scalarArg(args[1]));
  if (isError(s2)) return s2;
  const holidays = /* @__PURE__ */ new Set();
  if (args[2]) for (const v of flattenArg(args[2])) {
    const n = toNumber(v);
    if (!isError(n)) holidays.add(Math.trunc(n));
  }
  const start = Math.min(Math.trunc(s1), Math.trunc(s2));
  const end = Math.max(Math.trunc(s1), Math.trunc(s2));
  let count = 0;
  for (let d = start; d <= end; d++) {
    const dow = serialToParts(d).weekday;
    if (dow === 0 || dow === 6) continue;
    if (holidays.has(d)) continue;
    count++;
  }
  return Math.trunc(s1) <= Math.trunc(s2) ? count : -count;
}
function daysBetween(args) {
  const end = num2(scalarArg(args[0]));
  if (isError(end)) return end;
  const start = num2(scalarArg(args[1]));
  if (isError(start)) return start;
  return Math.trunc(end) - Math.trunc(start);
}
function days360(args) {
  const s1 = num2(scalarArg(args[0]));
  if (isError(s1)) return s1;
  const s2 = num2(scalarArg(args[1]));
  if (isError(s2)) return s2;
  const euro = args[2] ? toBoolean(scalarArg(args[2])) : false;
  if (isError(euro)) return euro;
  const a = serialToParts(Math.trunc(s1)), b = serialToParts(Math.trunc(s2));
  let d1 = a.day, d2 = b.day;
  if (euro) {
    if (d1 === 31) d1 = 30;
    if (d2 === 31) d2 = 30;
  } else {
    if (d1 === 31) d1 = 30;
    if (d2 === 31) {
      if (d1 === 30) d2 = 30;
    }
  }
  return (b.year - a.year) * 360 + (b.month - a.month) * 30 + (d2 - d1);
}
function yearFrac(args) {
  let s1 = num2(scalarArg(args[0]));
  if (isError(s1)) return s1;
  let s2 = num2(scalarArg(args[1]));
  if (isError(s2)) return s2;
  const basis = args[2] ? num2(scalarArg(args[2])) : 0;
  if (isError(basis)) return basis;
  s1 = Math.trunc(s1);
  s2 = Math.trunc(s2);
  if (s1 === s2) return 0;
  if (s1 > s2) {
    const t = s1;
    s1 = s2;
    s2 = t;
  }
  const b = Math.trunc(basis);
  const a = serialToParts(s1), c = serialToParts(s2);
  switch (b) {
    case 0: {
      let d1 = a.day, d2 = c.day;
      if (d1 === 31) d1 = 30;
      if (d2 === 31 && d1 === 30) d2 = 30;
      const days = (c.year - a.year) * 360 + (c.month - a.month) * 30 + (d2 - d1);
      return days / 360;
    }
    case 1: {
      const yrs = c.year - a.year + 1;
      let daysInYears = 0;
      for (let y = a.year; y <= c.year; y++) daysInYears += isLeap(y) ? 366 : 365;
      const avg = daysInYears / yrs;
      return (s2 - s1) / avg;
    }
    case 2:
      return (s2 - s1) / 360;
    // actual/360
    case 3:
      return (s2 - s1) / 365;
    // actual/365
    case 4: {
      let d1 = a.day, d2 = c.day;
      if (d1 === 31) d1 = 30;
      if (d2 === 31) d2 = 30;
      const days = (c.year - a.year) * 360 + (c.month - a.month) * 30 + (d2 - d1);
      return days / 360;
    }
    default:
      return "#NUM!";
  }
}
function isLeap(y) {
  return y % 4 === 0 && y % 100 !== 0 || y % 400 === 0;
}
function weekNum(args) {
  const s = num2(scalarArg(args[0]));
  if (isError(s)) return s;
  const type = args[1] ? num2(scalarArg(args[1])) : 1;
  if (isError(type)) return type;
  const t = Math.trunc(type);
  if (t === 21) return isoWeekNum(args);
  const startMap = { 1: 0, 2: 1, 11: 1, 12: 2, 13: 3, 14: 4, 15: 5, 16: 6, 17: 0 };
  const startDow = startMap[t];
  if (startDow === void 0) return "#NUM!";
  const p = serialToParts(Math.trunc(s));
  const jan1 = dateToSerial(p.year, 1, 1);
  const jan1Dow = serialToParts(jan1).weekday;
  const offset = (jan1Dow - startDow + 7) % 7;
  const dayOfYear = Math.trunc(s) - jan1;
  return Math.floor((dayOfYear + offset) / 7) + 1;
}
function isoWeekNum(args) {
  const s = num2(scalarArg(args[0]));
  if (isError(s)) return s;
  const serial = Math.trunc(s);
  const dow = (serialToParts(serial).weekday + 6) % 7;
  const thursday = serial - dow + 3;
  const p = serialToParts(thursday);
  const jan1 = dateToSerial(p.year, 1, 1);
  return Math.floor((thursday - jan1) / 7) + 1;
}
function timeValue(args) {
  const t = toText(scalarArg(args[0]));
  if (isError(t)) return t;
  const m = /^\s*(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?\s*(AM|PM)?\s*$/i.exec(t);
  if (!m) return "#VALUE!";
  let h = Number(m[1]);
  const mi = Number(m[2]);
  const se = m[3] ? Number(m[3]) : 0;
  const ap = m[4] ? m[4].toUpperCase() : "";
  if (ap === "PM" && h < 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  if (h > 24 || mi > 59 || se > 59) return "#VALUE!";
  return (h * 3600 + mi * 60 + se) / 86400;
}
function weekendSet(weekend) {
  if (typeof weekend === "string" && /^[01]{7}$/.test(weekend)) {
    const set = /* @__PURE__ */ new Set();
    const dowByPos = [1, 2, 3, 4, 5, 6, 0];
    for (let i = 0; i < 7; i++) if (weekend[i] === "1") set.add(dowByPos[i]);
    return set;
  }
  const n = toNumber(weekend);
  if (isError(n)) return n;
  const code = Math.trunc(n);
  const two = { 1: [6, 0], 2: [0, 1], 3: [1, 2], 4: [2, 3], 5: [3, 4], 6: [4, 5], 7: [5, 6] };
  const one = { 11: 0, 12: 1, 13: 2, 14: 3, 15: 4, 16: 5, 17: 6 };
  if (two[code]) return new Set(two[code]);
  if (one[code] !== void 0) return /* @__PURE__ */ new Set([one[code]]);
  return "#NUM!";
}
function collectHolidays(arg) {
  const h = /* @__PURE__ */ new Set();
  if (arg) for (const v of flattenArg(arg)) {
    const n = toNumber(v);
    if (!isError(n)) h.add(Math.trunc(n));
  }
  return h;
}
function workday(args) {
  return workdayCore(args[0], args[1], /* @__PURE__ */ new Set([0, 6]), args[2]);
}
function workdayIntl(args) {
  const wk = args[2] !== void 0 ? weekendSet(scalarArg(args[2])) : /* @__PURE__ */ new Set([0, 6]);
  if (isError(wk)) return wk;
  return workdayCore(args[0], args[1], wk, args[3]);
}
function workdayCore(startArg, daysArg, weekend, holArg) {
  const s = num2(scalarArg(startArg));
  if (isError(s)) return s;
  const days = num2(scalarArg(daysArg));
  if (isError(days)) return days;
  if (weekend.size >= 7) return "#NUM!";
  const hol = collectHolidays(holArg);
  let d = Math.trunc(s);
  let remaining = Math.trunc(days);
  const step = remaining >= 0 ? 1 : -1;
  remaining = Math.abs(remaining);
  while (remaining > 0) {
    d += step;
    const dow = serialToParts(d).weekday;
    if (weekend.has(dow) || hol.has(d)) continue;
    remaining--;
  }
  return d;
}
function networkDaysIntl(args) {
  const s1 = num2(scalarArg(args[0]));
  if (isError(s1)) return s1;
  const s2 = num2(scalarArg(args[1]));
  if (isError(s2)) return s2;
  const weekend = args[2] !== void 0 ? weekendSet(scalarArg(args[2])) : /* @__PURE__ */ new Set([0, 6]);
  if (isError(weekend)) return weekend;
  const hol = collectHolidays(args[3]);
  const start = Math.min(Math.trunc(s1), Math.trunc(s2));
  const end = Math.max(Math.trunc(s1), Math.trunc(s2));
  let count = 0;
  for (let d = start; d <= end; d++) {
    const dow = serialToParts(d).weekday;
    if (weekend.has(dow) || hol.has(d)) continue;
    count++;
  }
  return Math.trunc(s1) <= Math.trunc(s2) ? count : -count;
}
function asMatrix2(arg) {
  if (!arg) return [[null]];
  if (arg.kind === "range") return arg.values;
  return [[arg.value]];
}
function vlookup(args) {
  const target = scalarArg(args[0]);
  const table = asMatrix2(args[1]);
  const colIdx = num2(scalarArg(args[2]));
  if (isError(colIdx)) return colIdx;
  const approx = args[3] ? toBoolean(scalarArg(args[3])) : true;
  const ci = Math.trunc(colIdx) - 1;
  if (ci < 0) return "#VALUE!";
  return lookupRowCol(table, target, ci, approx === true || isError(approx), "v");
}
function hlookup(args) {
  const target = scalarArg(args[0]);
  const table = asMatrix2(args[1]);
  const rowIdx = num2(scalarArg(args[2]));
  if (isError(rowIdx)) return rowIdx;
  const approx = args[3] ? toBoolean(scalarArg(args[3])) : true;
  const ri = Math.trunc(rowIdx) - 1;
  if (ri < 0) return "#VALUE!";
  return lookupRowCol(table, target, ri, approx === true || isError(approx), "h");
}
function lookupRowCol(table, target, idx, approx, dir) {
  const keys = dir === "v" ? table.map((r) => r[0]) : table[0] ?? [];
  const n = keys.length;
  if (approx) {
    let found = -1;
    for (let i = 0; i < n; i++) {
      const cmp = compareLoose(keys[i], target);
      if (cmp === null) continue;
      if (cmp <= 0) found = i;
      else break;
    }
    if (found < 0) return "#N/A";
    return dir === "v" ? table[found]?.[idx] ?? "#REF!" : table[idx]?.[found] ?? "#REF!";
  }
  for (let i = 0; i < n; i++) {
    if (matchExact(keys[i], target)) {
      return dir === "v" ? table[i]?.[idx] ?? "#REF!" : table[idx]?.[i] ?? "#REF!";
    }
  }
  return "#N/A";
}
function lookup(args) {
  const target = scalarArg(args[0]);
  const vector = flattenArg(args[1] ?? { kind: "value", value: null });
  const result = args[2] ? flattenArg(args[2]) : vector;
  let found = -1;
  for (let i = 0; i < vector.length; i++) {
    const cmp = compareLoose(vector[i], target);
    if (cmp === null) continue;
    if (cmp <= 0) found = i;
    else break;
  }
  return found < 0 ? "#N/A" : result[found] ?? "#N/A";
}
function indexFn(args) {
  const table = asMatrix2(args[0]);
  const rowN = num2(scalarArg(args[1]));
  if (isError(rowN)) return rowN;
  const colArg = args[2] ? num2(scalarArg(args[2])) : null;
  if (colArg !== null && isError(colArg)) return colArg;
  const r = Math.trunc(rowN);
  if (colArg === null) {
    if (table.length === 1) return table[0][r - 1] ?? "#REF!";
    if ((table[0]?.length ?? 0) === 1) return table[r - 1]?.[0] ?? "#REF!";
    return r >= 1 && r <= table.length ? table[r - 1] : "#REF!";
  }
  const c = Math.trunc(colArg);
  const rr = r === 0 ? 1 : r;
  const cc = c === 0 ? 1 : c;
  return table[rr - 1]?.[cc - 1] ?? "#REF!";
}
function xlookup(args) {
  const target = scalarArg(args[0]);
  const lookupArr = flattenArg(args[1] ?? { kind: "value", value: null });
  const returnArr = flattenArg(args[2] ?? { kind: "value", value: null });
  const ifNotFound = args[3] ? scalarArg(args[3]) : "#N/A";
  for (let i = 0; i < lookupArr.length; i++) {
    if (matchExact(lookupArr[i], target)) return returnArr[i] ?? "#N/A";
  }
  return ifNotFound;
}
function dimOf(arg, which) {
  const m = asMatrix2(arg);
  return which === "rows" ? m.length : m[0]?.length ?? 0;
}
function matchExact(a, b) {
  if (typeof a === "number" && typeof b === "number") return a === b;
  if (typeof b === "string" && /[*?]/.test(b)) return wildcardToRegExp(b, "i").test(String(a ?? ""));
  return String(a ?? "").toUpperCase() === String(b ?? "").toUpperCase();
}
function compareLoose(a, b) {
  if (isBlank(a)) return null;
  if (typeof a === "number" && typeof b === "number") return a === b ? 0 : a < b ? -1 : 1;
  const sa = String(a ?? "").toUpperCase();
  const sb = String(b ?? "").toUpperCase();
  return sa === sb ? 0 : sa < sb ? -1 : 1;
}
var BuiltinRegistry = class {
  fns = /* @__PURE__ */ new Map();
  volatiles = /* @__PURE__ */ new Set();
  constructor() {
    for (const [name, impl] of Object.entries(BUILTINS)) this.fns.set(name, impl);
  }
  get(name) {
    return this.fns.get(name.toUpperCase());
  }
  /** 注册/覆盖一个函数(供自定义函数 QM/QC/… 叠加)。 */
  register(name, impl, opts) {
    const up = name.toUpperCase();
    this.fns.set(up, impl);
    if (opts?.volatile) this.volatiles.add(up);
  }
  isVolatile(name) {
    return this.volatiles.has(name.toUpperCase());
  }
  /** 已注册函数名列表(调试)。 */
  names() {
    return [...this.fns.keys()];
  }
};
var BUILTIN_NAMES = Object.keys(BUILTINS);

// src/formula/DependencyGraph.ts
function cellKey(sheet, row, col) {
  return `${sheet}!${row},${col}`;
}
function extractDeps(node, defaultSheet, bounds) {
  const deps = /* @__PURE__ */ new Set();
  walk(node, defaultSheet, deps, bounds);
  return [...deps];
}
function refToKey(ref, defaultSheet) {
  const bang = ref.indexOf("!");
  let sheet = defaultSheet;
  let local = ref;
  if (bang >= 0) {
    sheet = ref.slice(0, bang).replace(/^'|'$/g, "");
    local = ref.slice(bang + 1);
  }
  const p = parseAddr(local.replace(/\$/g, ""));
  if (!p) return null;
  return cellKey(sheet, p.row, p.col);
}
function endpointOf(ref, defaultSheet) {
  const bang = ref.indexOf("!");
  let sheet = defaultSheet;
  let local = ref;
  if (bang >= 0) {
    sheet = ref.slice(0, bang).replace(/^'|'$/g, "");
    local = ref.slice(bang + 1);
  }
  local = local.replace(/\$/g, "");
  const full = parseAddr(local);
  if (full) return { sheet, row: full.row, col: full.col };
  if (/^[A-Za-z]{1,3}$/.test(local)) return { sheet, row: -1, col: labelToCol(local) };
  if (/^\d+$/.test(local)) return { sheet, row: Number(local) - 1, col: -1 };
  return { sheet, row: -1, col: -1 };
}
function walk(node, sheet, deps, bounds) {
  switch (node.kind) {
    case "ref": {
      const k = refToKey(node.ref, sheet);
      if (k) deps.add(k);
      break;
    }
    case "range": {
      const a = endpointOf(node.start, sheet);
      const b = endpointOf(node.end, sheet);
      const rangeSheet = a.sheet;
      const dim = bounds?.(rangeSheet) ?? { rows: 0, cols: 0 };
      const ar = a.row < 0 ? 0 : a.row, br = b.row < 0 ? Math.max(0, dim.rows - 1) : b.row;
      const ac = a.col < 0 ? 0 : a.col, bc = b.col < 0 ? Math.max(0, dim.cols - 1) : b.col;
      const r1 = Math.min(ar, br), r2 = Math.max(ar, br);
      const c1 = Math.min(ac, bc), c2 = Math.max(ac, bc);
      for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) deps.add(cellKey(rangeSheet, r, c));
      break;
    }
    case "unary":
      walk(node.operand, sheet, deps, bounds);
      break;
    case "binary":
      walk(node.left, sheet, deps, bounds);
      walk(node.right, sheet, deps, bounds);
      break;
    case "call":
      for (const a of node.args) walk(a, sheet, deps, bounds);
      break;
    case "array":
      for (const row of node.rows) for (const cell of row) walk(cell, sheet, deps, bounds);
      break;
  }
}
var DependencyGraph = class {
  /** 公式格 → 它依赖的格键集合。 */
  deps = /* @__PURE__ */ new Map();
  /** 反向：格键 → 依赖它的公式格集合（脏传播用）。 */
  dependents = /* @__PURE__ */ new Map();
  /** 设/更新一个公式格的依赖。 */
  setDeps(cell, deps) {
    this.clearDeps(cell);
    const set = new Set(deps);
    this.deps.set(cell, set);
    for (const d of set) {
      let back = this.dependents.get(d);
      if (!back) {
        back = /* @__PURE__ */ new Set();
        this.dependents.set(d, back);
      }
      back.add(cell);
    }
  }
  /** 移除一个公式格（改回普通值时）。 */
  clearDeps(cell) {
    const old = this.deps.get(cell);
    if (old) {
      for (const d of old) this.dependents.get(d)?.delete(cell);
      this.deps.delete(cell);
    }
  }
  hasFormula(cell) {
    return this.deps.has(cell);
  }
  /** 清空整张图（全量重算前重建用）。 */
  clearAll() {
    this.deps.clear();
    this.dependents.clear();
  }
  /** 直接依赖 cell 的公式格。 */
  getDependents(cell) {
    return [...this.dependents.get(cell) ?? []];
  }
  /**
   * 受一批种子格变化影响的所有公式格（传递闭包，含种子自身若是公式）。
   * 供增量重算：只重算受影响子集。
   */
  affectedBy(seeds) {
    const affected = /* @__PURE__ */ new Set();
    const stack = [...seeds];
    while (stack.length) {
      const cur = stack.pop();
      for (const dep of this.dependents.get(cur) ?? []) {
        if (!affected.has(dep)) {
          affected.add(dep);
          stack.push(dep);
        }
      }
    }
    return affected;
  }
  /**
   * 对给定公式格集合做拓扑排序（被依赖者在前）。
   * 三色 DFS：环上的格收集到 cyclic 集（标 #CIRC!），其余返回有序列表。
   * @returns { order: 无环格的拓扑序, cyclic: 环上格集合 }
   */
  topoSort(cells) {
    const targets = new Set(cells);
    const WHITE = 0, GREY = 1, BLACK = 2;
    const color = /* @__PURE__ */ new Map();
    const order = [];
    const cyclic = /* @__PURE__ */ new Set();
    const visit = (cell, path) => {
      color.set(cell, GREY);
      path.push(cell);
      let ok = true;
      for (const dep of this.deps.get(cell) ?? []) {
        if (!targets.has(dep) && !this.deps.has(dep)) continue;
        if (!targets.has(dep)) continue;
        const c = color.get(dep) ?? WHITE;
        if (c === GREY) {
          const idx = path.indexOf(dep);
          for (let k = idx; k < path.length; k++) cyclic.add(path[k]);
          ok = false;
        } else if (c === WHITE) {
          if (!visit(dep, path)) ok = false;
        }
      }
      path.pop();
      color.set(cell, BLACK);
      if (ok && !cyclic.has(cell)) order.push(cell);
      return ok;
    };
    for (const cell of targets) {
      if ((color.get(cell) ?? WHITE) === WHITE) visit(cell, []);
    }
    return { order: order.filter((c) => !cyclic.has(c)), cyclic };
  }
};

// src/formula/CustomFunction.ts
var REPORT_FETCH_NAMES = ["QM", "QC", "JE", "FS", "REF"];
var ReportValueMap = class {
  map = {};
  /**
   * 灌值。键归一：`sheetName!CELLREF`（cellRef 大写）；裸 CELLREF 按 activeSheet 补前缀。
   * @param raw 原始 map（键可为 `sheet!A1` 或裸 `A1`）
   * @param activeSheetName 裸键归属的 sheet 名
   */
  set(raw, activeSheetName) {
    const norm = {};
    for (const [k, v] of Object.entries(raw || {})) {
      const bang = k.indexOf("!");
      const nk = bang >= 0 ? `${k.slice(0, bang)}!${k.slice(bang + 1).toUpperCase()}` : `${activeSheetName}!${k.toUpperCase()}`;
      norm[nk] = v;
    }
    this.map = norm;
  }
  /** 按所在格取数值（缺/空/非数值 → 0，数字字符串 → 数字）。 */
  getNumber(sheetName, row, col) {
    const ref = colToLabel(col) + (row + 1);
    const v = this.map[`${sheetName}!${ref}`];
    if (v === null || v === void 0 || v === "") return 0;
    if (typeof v === "number") return Number.isFinite(v) ? v : 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  /** 读原始 map（调试）。 */
  raw() {
    return { ...this.map };
  }
  clear() {
    this.map = {};
  }
};
function registerReportFetchFunctions(registry, valueMap) {
  const impl = (_args, ctx) => {
    return valueMap.getNumber(ctx.sheetName, ctx.row, ctx.col);
  };
  for (const name of REPORT_FETCH_NAMES) {
    registry.register(name, impl, { volatile: true });
  }
}

// src/formula/FormulaEngine.ts
var FormulaEngine = class {
  constructor(wb) {
    this.wb = wb;
    registerReportFetchFunctions(this.registry, this.valueMap);
    this.evaluator = new Evaluator(this.registry);
    this.wb.setRecalcHook(() => this.recalcAll());
    this.wb.setRecalcCellsHook((cells) => this.recalcCells(cells));
  }
  registry = new BuiltinRegistry();
  valueMap = new ReportValueMap();
  graph = new DependencyGraph();
  evaluator;
  parseCache = /* @__PURE__ */ new Map();
  /** 持久公式格注册表（key → 元信息），供增量重算 M16。recalcAll 重建。 */
  formulaCellMap = /* @__PURE__ */ new Map();
  /** 是否已建过全量图（增量重算前置；未建则退化全量）。 */
  graphBuilt = false;
  /** 解绑（组件 dispose 时）。 */
  dispose() {
    this.wb.setRecalcHook(null);
    this.wb.setRecalcCellsHook(null);
  }
  /** 灌报表取数值表并重算（键 `sheet!CELLREF` 或裸 CELLREF）。 */
  setReportValueMap(raw) {
    const active = this.wb.getActiveSheet()?.name() ?? "";
    this.valueMap.set(raw, active);
    this.recalcAll();
  }
  parse(src) {
    let hit = this.parseCache.get(src);
    if (!hit) {
      try {
        hit = { ast: parseFormula(src), error: null };
      } catch (e) {
        hit = { ast: null, error: e instanceof Error ? e.message : "#ERROR" };
      }
      this.parseCache.set(src, hit);
    }
    return hit;
  }
  /** 某 sheet 的单元格访问器（读计算值/原始值）。 */
  accessorFor(sheetName) {
    const resolveSheet = (name) => name ? this.wb.getSheetByName(name) : this.wb.getSheetByName(sheetName);
    return {
      getCellValue: (ref) => {
        const { sheet, row, col } = this.splitRef(ref, sheetName);
        const ws = resolveSheet(sheet);
        if (!ws || row < 0 || col < 0) return "#REF!";
        return ws.getValue(row, col);
      },
      getRangeValues: (start, end) => {
        const a = this.splitEndpoint(start, sheetName);
        const b = this.splitEndpoint(end, sheetName);
        const ws = resolveSheet(a.sheet);
        if (!ws) return [["#REF!"]];
        const maxRow = ws.getRowCount() - 1;
        const maxCol = ws.getColumnCount() - 1;
        const ar = a.row < 0 ? 0 : a.row, br = b.row < 0 ? maxRow : b.row;
        const ac = a.col < 0 ? 0 : a.col, bc = b.col < 0 ? maxCol : b.col;
        const r1 = Math.min(ar, br), r2 = Math.max(ar, br);
        const c1 = Math.min(ac, bc), c2 = Math.max(ac, bc);
        const out = [];
        for (let r = r1; r <= r2; r++) {
          const rowVals = [];
          for (let c = c1; c <= c2; c++) rowVals.push(ws.getValue(r, c));
          out.push(rowVals);
        }
        return out;
      },
      resolveNameRef: (name) => this.wb.resolveName(name, sheetName)
    };
  }
  splitRef(ref, defaultSheet) {
    const bang = ref.indexOf("!");
    let sheet = defaultSheet;
    let local = ref;
    if (bang >= 0) {
      sheet = ref.slice(0, bang).replace(/^'|'$/g, "");
      local = ref.slice(bang + 1);
    }
    const p = parseAddr(local.replace(/\$/g, ""));
    return p ? { sheet, row: p.row, col: p.col } : { sheet, row: -1, col: -1 };
  }
  /**
   * 解析区域端点，支持整列（'A' → col=0,row=-1）/整行（'5' → row=4,col=-1）/整格（'A1'）。
   * row/col = -1 表该轴未指定（整列/整行由 getRangeValues 钳到 sheet 维度）。
   */
  splitEndpoint(ref, defaultSheet) {
    const bang = ref.indexOf("!");
    let sheet = defaultSheet;
    let local = ref;
    if (bang >= 0) {
      sheet = ref.slice(0, bang).replace(/^'|'$/g, "");
      local = ref.slice(bang + 1);
    }
    local = local.replace(/\$/g, "");
    const full = parseAddr(local);
    if (full) return { sheet, row: full.row, col: full.col };
    if (/^[A-Za-z]{1,3}$/.test(local)) return { sheet, row: -1, col: labelToCol(local) };
    if (/^\d+$/.test(local)) return { sheet, row: Number(local) - 1, col: -1 };
    return { sheet, row: -1, col: -1 };
  }
  /**
   * 全量重算：扫描所有 sheet 的公式格，重建依赖图，拓扑重算并回填计算值。
   * 环上格写 #CIRC!；解析失败写解析错误标记。
   */
  recalcAll() {
    const formulaCells = [];
    this.graph.clearAll();
    const sheets = this.wb.getSheets();
    const bounds = (name) => {
      const ws = this.wb.getSheetByName(name);
      return ws ? { rows: ws.getRowCount(), cols: ws.getColumnCount() } : { rows: 0, cols: 0 };
    };
    for (const ws of sheets) {
      const sheetName = ws.name();
      ws.forEachCell((data, row, col) => {
        if (!data.formula) return;
        const key2 = cellKey(sheetName, row, col);
        const parsed = this.parse(data.formula);
        if (parsed.ast) {
          this.graph.setDeps(key2, extractDeps(parsed.ast, sheetName, bounds));
        } else {
          this.graph.setDeps(key2, []);
        }
        formulaCells.push({ key: key2, sheet: ws, sheetName, row, col, ast: parsed.ast });
      });
    }
    if (formulaCells.length === 0) return;
    const allKeys = formulaCells.map((f2) => f2.key);
    const { order, cyclic } = this.graph.topoSort(allKeys);
    const byKey = new Map(formulaCells.map((f2) => [f2.key, f2]));
    this.formulaCellMap = byKey;
    this.graphBuilt = true;
    for (const key2 of cyclic) {
      const f2 = byKey.get(key2);
      if (f2) f2.sheet.setComputedValue(f2.row, f2.col, "#CIRC!");
    }
    for (const key2 of order) {
      const f2 = byKey.get(key2);
      if (!f2) continue;
      f2.sheet.setComputedValue(f2.row, f2.col, this.evalCell(f2));
    }
  }
  /**
   * 增量重算（M16）：编辑一批格后，只重算受影响的公式格闭包。
   * 步骤：①对每个种子格，若它现在是公式格则重新解析+更新其出边（图增量维护）；
   * ②算 affectedBy 传递闭包（含种子若是公式）；③对该子集拓扑排序、求值回填。
   * 图未建（未跑过 recalcAll）则退化全量。大表编辑从 O(全簿) 降到 O(受影响)。
   */
  recalcCells(seeds) {
    if (!this.graphBuilt) {
      this.recalcAll();
      return;
    }
    const bounds = (name) => {
      const ws = this.wb.getSheetByName(name);
      return ws ? { rows: ws.getRowCount(), cols: ws.getColumnCount() } : { rows: 0, cols: 0 };
    };
    const seedKeys = [];
    for (const s of seeds) {
      const ws = this.wb.getSheetByName(s.sheet);
      if (!ws) continue;
      const key2 = cellKey(s.sheet, s.row, s.col);
      seedKeys.push(key2);
      const data = ws.getCellData(s.row, s.col);
      if (data?.formula) {
        const parsed = this.parse(data.formula);
        this.graph.setDeps(key2, parsed.ast ? extractDeps(parsed.ast, s.sheet, bounds) : []);
        this.formulaCellMap.set(key2, { sheet: ws, sheetName: s.sheet, row: s.row, col: s.col, ast: parsed.ast });
      } else if (this.formulaCellMap.has(key2)) {
        this.graph.setDeps(key2, []);
        this.formulaCellMap.delete(key2);
      }
    }
    const affected = this.graph.affectedBy(seedKeys);
    for (const k of seedKeys) if (this.formulaCellMap.has(k)) affected.add(k);
    for (const [k, f2] of this.formulaCellMap) if (f2.ast && this.isVolatileAst(f2.ast)) affected.add(k);
    if (affected.size === 0) return;
    const { order, cyclic } = this.graph.topoSort(affected);
    for (const key2 of cyclic) {
      const f2 = this.formulaCellMap.get(key2);
      if (f2) f2.sheet.setComputedValue(f2.row, f2.col, "#CIRC!");
    }
    for (const key2 of order) {
      const f2 = this.formulaCellMap.get(key2);
      if (f2) f2.sheet.setComputedValue(f2.row, f2.col, this.evalCell(f2));
    }
  }
  /** AST 是否含 volatile 函数（QM/QC/NOW/TODAY/RAND…），增量时每次纳入。 */
  isVolatileAst(node) {
    switch (node.kind) {
      case "call": {
        if (this.registry.isVolatile?.(node.name)) return true;
        return node.args.some((a) => this.isVolatileAst(a));
      }
      case "unary":
        return this.isVolatileAst(node.operand);
      case "binary":
        return this.isVolatileAst(node.left) || this.isVolatileAst(node.right);
      case "array":
        return node.rows.some((r) => r.some((c) => this.isVolatileAst(c)));
      default:
        return false;
    }
  }
  evalCell(f2) {
    if (!f2.ast) return "#NAME?";
    const ctx = {
      accessor: this.accessorFor(f2.sheetName),
      row: f2.row,
      col: f2.col,
      sheetName: f2.sheetName
    };
    try {
      return this.evaluator.evaluate(f2.ast, ctx);
    } catch {
      return "#VALUE!";
    }
  }
  /**
   * 直接求值一个公式串（不落格），供聚合层/预览用。
   * @param sheetName 求值所在 sheet（引用解析基准）
   */
  evaluateFormula(sheetName, formula, row = 0, col = 0) {
    const parsed = this.parse(formula);
    if (!parsed.ast) return "#NAME?";
    const ctx = { accessor: this.accessorFor(sheetName), row, col, sheetName };
    try {
      return this.evaluator.evaluate(parsed.ast, ctx);
    } catch {
      return "#VALUE!";
    }
  }
};

// src/io/snapshot.ts
var SNAPSHOT_FORMAT = "cmx-megasheet";
var SNAPSHOT_VERSION = 1;
function sheetToJSON(ws) {
  const cells = [];
  ws.forEachCell((data, r, c) => {
    const cell = { r, c };
    if (data.value !== void 0 && data.value !== null) cell.v = data.value;
    if (data.formula) cell.f = data.formula;
    if (data.style && Object.keys(data.style).length > 0) cell.s = { ...data.style };
    if (data.rich) cell.rich = { runs: data.rich.runs.map((run) => ({ ...run })) };
    if (cell.v !== void 0 || cell.f !== void 0 || cell.s !== void 0 || cell.rich !== void 0) cells.push(cell);
  });
  cells.sort((a, b) => a.r - b.r || a.c - b.c);
  const snap = {
    name: ws.name(),
    rowCount: ws.getRowCount(),
    colCount: ws.getColumnCount(),
    cells
  };
  const spans = ws.getSpans();
  if (spans.length) snap.spans = spans;
  const rh = ws.getRowHeightEntries();
  if (rh.length) snap.rowHeights = rh;
  const cw = ws.getColumnWidthEntries();
  if (cw.length) snap.colWidths = cw;
  const rs = ws.getRowStyleEntries();
  if (rs.length) snap.rowStyles = rs;
  const cs = ws.getColumnStyleEntries();
  if (cs.length) snap.colStyles = cs;
  const ds = ws.getDefaultStyle();
  if (Object.keys(ds).length) snap.defaultStyle = ds;
  const hr = ws.getManualHiddenRows();
  if (hr.length) snap.hiddenRows = hr;
  const hc = ws.getManualHiddenColumns();
  if (hc.length) snap.hiddenCols = hc;
  const ro = outlinesToJSON(ws.rowOutlines.list());
  if (ro.length) snap.rowOutlines = ro;
  const co = outlinesToJSON(ws.columnOutlines.list());
  if (co.length) snap.colOutlines = co;
  if (!ws.summaryBelow) snap.summaryBelow = false;
  if (!ws.summaryRight) snap.summaryRight = false;
  if (ws.zoom() !== 1) snap.zoom = ws.zoom();
  const ar = ws.getActiveRowIndex();
  const ac = ws.getActiveColumnIndex();
  if (ar !== 0) snap.activeRow = ar;
  if (ac !== 0) snap.activeCol = ac;
  if (ws.autoFilter) {
    snap.autoFilter = {
      range: { ...ws.autoFilter.range },
      criteria: [...ws.autoFilter.criteria.entries()].map(([c, crit]) => [c, crit])
    };
  }
  const vals = ws.listValidations();
  if (vals.length) snap.validations = vals.map((v) => ({ ...v }));
  const links = ws.listHyperlinks();
  if (links.length) snap.hyperlinks = links.map((h) => [h.row, h.col, { ...h.link }]);
  const cRules = ws.listConditionalRules();
  if (cRules.length) snap.conditionalRules = cRules.map((r) => ({ ...r }));
  const comments = ws.listComments();
  if (comments.length) snap.comments = comments.map((c) => [c.row, c.col, { ...c.comment }]);
  const objs = ws.listFloatingObjects();
  if (objs.length) snap.floatingObjects = objs.map((o) => ({ ...o, anchor: { ...o.anchor } }));
  const sparks = ws.listSparklines();
  if (sparks.length) snap.sparklines = sparks.map(([r, c, s]) => [r, c, { ...s, dataRange: { ...s.dataRange } }]);
  if (ws.pageSetup) snap.pageSetup = { ...ws.pageSetup };
  if (ws.protection) snap.protection = { ...ws.protection };
  return snap;
}
function outlinesToJSON(groups) {
  return groups.map((g) => {
    const o = { start: g.start, count: g.count };
    if (g.collapsed) o.collapsed = true;
    return o;
  });
}
function sheetFromJSON(snap, styleSheet) {
  const ws = new Worksheet(snap.name, {
    rowCount: snap.rowCount,
    colCount: snap.colCount,
    ...styleSheet ? { styleSheet } : {}
  });
  if (snap.defaultStyle) ws.setDefaultStyle(snap.defaultStyle);
  for (const [r, px] of snap.rowHeights ?? []) ws.setRowHeight(r, px);
  for (const [c, px] of snap.colWidths ?? []) ws.setColumnWidth(c, px);
  for (const [r, st] of snap.rowStyles ?? []) ws.setRowStyle(r, st);
  for (const [c, st] of snap.colStyles ?? []) ws.setColumnStyle(c, st);
  for (const cell of snap.cells) {
    if (cell.f) ws.setFormula(cell.r, cell.c, cell.f);
    if (cell.v !== void 0 && cell.v !== null) {
      if (cell.f) ws.setComputedValue(cell.r, cell.c, cell.v);
      else ws.setValue(cell.r, cell.c, cell.v);
    }
    if (cell.s) ws.setStyle(cell.r, cell.c, cell.s);
    if (cell.rich) ws.setRichText(cell.r, cell.c, cell.rich);
  }
  for (const s of snap.spans ?? []) ws.addSpan(s.row, s.col, s.rowCount, s.colCount);
  for (const g of snap.rowOutlines ?? []) {
    ws.rowOutlines.group(g.start, g.count);
    if (g.collapsed) ws.rowOutlines.setCollapsed(g.start, true);
  }
  for (const g of snap.colOutlines ?? []) {
    ws.columnOutlines.group(g.start, g.count);
    if (g.collapsed) ws.columnOutlines.setCollapsed(g.start, true);
  }
  if (snap.summaryBelow === false) ws.summaryBelow = false;
  if (snap.summaryRight === false) ws.summaryRight = false;
  for (const r of snap.hiddenRows ?? []) ws.setRowVisible(r, false);
  for (const c of snap.hiddenCols ?? []) ws.setColumnVisible(c, false);
  ws.applyOutlineVisibility();
  if (snap.zoom !== void 0) ws.zoom(snap.zoom);
  ws.setSelection(snap.activeRow ?? 0, snap.activeCol ?? 0);
  if (snap.autoFilter) {
    ws.setAutoFilter(snap.autoFilter.range);
    for (const [c, crit] of snap.autoFilter.criteria) ws.setFilterCriterion(c, crit);
  }
  for (const v of snap.validations ?? []) ws.setDataValidation(v);
  for (const [r, c, link] of snap.hyperlinks ?? []) ws.setHyperlink(r, c, link);
  for (const rule of snap.conditionalRules ?? []) ws.addConditionalRule(rule);
  for (const [r, c, comment] of snap.comments ?? []) ws.setComment(r, c, comment);
  for (const obj of snap.floatingObjects ?? []) ws.addFloatingObject(obj);
  for (const [r, c, spec] of snap.sparklines ?? []) ws.setSparkline(r, c, spec);
  if (snap.pageSetup) ws.setPageSetup(snap.pageSetup);
  if (snap.protection) ws.setProtection(snap.protection);
  return ws;
}
function workbookToJSON(wb) {
  const styles = wb.styleSheet.toJSON();
  const snap = {
    format: SNAPSHOT_FORMAT,
    version: SNAPSHOT_VERSION,
    sheets: wb.getSheets().map((ws) => sheetToJSON(ws))
  };
  if (wb.getActiveSheetIndex() !== 0) snap.activeSheet = wb.getActiveSheetIndex();
  if (Object.keys(styles).length) snap.styles = styles;
  const names = wb.listNames();
  if (names.length) snap.definedNames = names;
  return snap;
}
function workbookFromJSON(snap) {
  const wb = new Workbook({ sheetCount: 0 });
  if (snap.styles) {
    for (const name in snap.styles) wb.styleSheet.define(name, snap.styles[name]);
  }
  for (const sheetSnap of snap.sheets) {
    wb.appendSheet(sheetFromJSON(sheetSnap, wb.styleSheet));
  }
  if (wb.getSheetCount() === 0) {
    wb.appendSheet(new Worksheet("Sheet1", { styleSheet: wb.styleSheet }));
  }
  if (snap.definedNames) {
    for (const n of snap.definedNames) wb.defineName(n.name, n.refersTo, n.scope);
  }
  wb.setActiveSheetIndex(snap.activeSheet ?? 0);
  return wb;
}
function stringifyWorkbook(wb, pretty = false) {
  return JSON.stringify(workbookToJSON(wb), null, pretty ? 2 : void 0);
}
function parseWorkbook(json) {
  const obj = JSON.parse(json);
  if (!obj || obj.format !== SNAPSHOT_FORMAT) {
    throw new Error(`not a ${SNAPSHOT_FORMAT} snapshot (format=${obj?.format})`);
  }
  return workbookFromJSON(obj);
}

// src/io/ssjson.ts
var H_ALIGN = { 0: "left", 1: "center", 2: "right", 3: "left" };
var V_ALIGN = { 0: "top", 1: "middle", 2: "bottom" };
var BORDER_STYLE = {
  0: "none",
  1: "thin",
  2: "medium",
  3: "dashed",
  4: "dotted",
  5: "thick",
  6: "double",
  7: "thin"
};
function parseFont(font) {
  if (!font) return {};
  const out = {};
  const parts = font.trim().split(/\s+/);
  const rest = [];
  for (const p of parts) {
    if (p === "bold") out.bold = true;
    else if (p === "italic" || p === "oblique") out.italic = true;
    else if (p === "normal") continue;
    else if (/^\d+(\.\d+)?(px|pt|em)?$/.test(p)) {
      const m = /^(\d+(?:\.\d+)?)(px|pt|em)?$/.exec(p);
      const n = parseFloat(m[1]);
      const unit = m[2] ?? "px";
      out.fontSize = unit === "pt" ? Math.round(n * 1.333) : unit === "em" ? Math.round(n * 16) : n;
    } else rest.push(p);
  }
  if (rest.length) out.fontFamily = rest.join(" ").replace(/^["']|["']$/g, "");
  return out;
}
function mapStyle(s) {
  const out = {};
  Object.assign(out, parseFont(s.font));
  if (s.foreColor) out.foreColor = s.foreColor;
  if (s.backColor) out.backColor = s.backColor;
  if (typeof s.hAlign === "number") {
    const h = H_ALIGN[s.hAlign];
    if (h) out.hAlign = h;
  }
  if (typeof s.vAlign === "number") {
    const v = V_ALIGN[s.vAlign];
    if (v) out.vAlign = v;
  }
  if (s.formatter) out.formatter = s.formatter;
  if (s.wordWrap) out.wordWrap = true;
  if (typeof s.textDecoration === "number" && (s.textDecoration & 1) !== 0) out.underline = true;
  const borders = mapBorders(s);
  if (borders) out.borders = borders;
  return out;
}
function mapBorders(s) {
  const b = {};
  const edges = [
    ["top", s.borderTop],
    ["bottom", s.borderBottom],
    ["left", s.borderLeft],
    ["right", s.borderRight]
  ];
  let any = false;
  for (const [side, e] of edges) {
    if (!e || typeof e.style !== "number" || e.style === 0) continue;
    b[side] = { style: BORDER_STYLE[e.style] ?? "thin", color: e.color ?? "#000" };
    any = true;
  }
  return any ? b : void 0;
}
function mapCellStyle(raw) {
  if (raw === void 0) return void 0;
  if (typeof raw === "string") return { styleName: raw };
  const st = mapStyle(raw);
  return Object.keys(st).length ? st : void 0;
}
function mapSheet(ss, fallbackName) {
  const rowCount = ss.rowCount ?? ss.data?.rowCount ?? 40;
  const colCount = ss.columnCount ?? ss.data?.colCount ?? 12;
  const cells = [];
  const table = ss.data?.dataTable ?? {};
  for (const rKey in table) {
    const r = Number(rKey);
    const rowObj = table[rKey];
    for (const cKey in rowObj) {
      const c = Number(cKey);
      const raw = rowObj[cKey];
      const cell = { r, c };
      if (raw.value !== void 0 && raw.value !== null) cell.v = raw.value;
      if (raw.formula) cell.f = sanitizeImportedFormula(String(raw.formula));
      const st = mapCellStyle(raw.style);
      if (st) cell.s = st;
      if (cell.v !== void 0 || cell.f !== void 0 || cell.s !== void 0) cells.push(cell);
    }
  }
  cells.sort((a, b) => a.r - b.r || a.c - b.c);
  const snap = { name: ss.name ?? fallbackName, rowCount, colCount, cells };
  if (ss.spans?.length) snap.spans = ss.spans.map((s) => ({ ...s }));
  const defRowH = ss.defaults?.rowHeight;
  const rowHeights = [];
  const hiddenRows = [];
  (ss.rows ?? []).forEach((ax, i) => {
    if (typeof ax?.size === "number" && ax.size !== defRowH) rowHeights.push([i, ax.size]);
    if (ax?.visible === false) hiddenRows.push(i);
  });
  if (rowHeights.length) snap.rowHeights = rowHeights;
  if (hiddenRows.length) snap.hiddenRows = hiddenRows;
  const defColW = ss.defaults?.colWidth;
  const colWidths = [];
  const hiddenCols = [];
  (ss.columns ?? []).forEach((ax, i) => {
    if (typeof ax?.size === "number" && ax.size !== defColW) colWidths.push([i, ax.size]);
    if (ax?.visible === false) hiddenCols.push(i);
  });
  if (colWidths.length) snap.colWidths = colWidths;
  if (hiddenCols.length) snap.hiddenCols = hiddenCols;
  const ro = mapOutlines(ss.rowOutlines);
  if (ro.length) snap.rowOutlines = ro;
  const co = mapOutlines(ss.columnOutlines);
  if (co.length) snap.colOutlines = co;
  if (typeof ss.activeRow === "number" && ss.activeRow > 0) snap.activeRow = ss.activeRow;
  if (typeof ss.activeCol === "number" && ss.activeCol > 0) snap.activeCol = ss.activeCol;
  return snap;
}
function mapOutlines(list) {
  if (!list?.length) return [];
  return list.map((o) => {
    const start = o.start ?? 0;
    const count = o.count ?? (o.end !== void 0 ? o.end - start + 1 : 1);
    const g = { start, count };
    if (o.collapsed) g.collapsed = true;
    return g;
  }).filter((g) => g.count >= 1);
}
function ssjsonToSnapshot(raw) {
  const wb = raw ?? {};
  const sheetsMap = wb.sheets ?? {};
  const entries = Object.entries(sheetsMap);
  entries.sort((a, b) => (a[1].index ?? 0) - (b[1].index ?? 0));
  const sheets = entries.map(([key2, ss], i) => mapSheet(ss, ss.name ?? key2 ?? `Sheet${i + 1}`));
  const snap = {
    format: SNAPSHOT_FORMAT,
    version: SNAPSHOT_VERSION,
    sheets: sheets.length ? sheets : [{ name: "Sheet1", rowCount: 40, colCount: 12, cells: [] }]
  };
  if (typeof wb.activeSheetIndex === "number" && wb.activeSheetIndex > 0) {
    snap.activeSheet = wb.activeSheetIndex;
  }
  const styles = mapNamedStyles(wb.namedStyles);
  if (Object.keys(styles).length) snap.styles = styles;
  return snap;
}
function mapNamedStyles(list) {
  const out = {};
  for (const ns of list ?? []) {
    if (!ns?.name) continue;
    out[ns.name] = mapStyle(ns);
  }
  return out;
}
function importSSJSON(raw) {
  const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
  return workbookFromJSON(ssjsonToSnapshot(obj));
}

// src/io/inflate.ts
var LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
var LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
var DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
var DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
var CODE_LEN_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
var BitReader = class {
  constructor(src) {
    this.src = src;
  }
  pos = 0;
  bitBuf = 0;
  bitCnt = 0;
  bit() {
    if (this.bitCnt === 0) {
      this.bitBuf = this.src[this.pos++] ?? 0;
      this.bitCnt = 8;
    }
    const b = this.bitBuf & 1;
    this.bitBuf >>= 1;
    this.bitCnt--;
    return b;
  }
  bits(n) {
    let v = 0;
    for (let i = 0; i < n; i++) v |= this.bit() << i;
    return v >>> 0;
  }
  /** 对齐到字节边界（stored 块前调用）。 */
  align() {
    this.bitCnt = 0;
  }
  /** 直接读 n 字节（stored 块）。 */
  readBytes(n) {
    const out = this.src.subarray(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }
};
function buildHuff(lengths, n) {
  const counts = new Int32Array(16);
  for (let i = 0; i < n; i++) {
    const len = lengths[i];
    counts[len] = counts[len] + 1;
  }
  counts[0] = 0;
  const offsets = new Int32Array(16);
  for (let i = 1; i < 16; i++) offsets[i] = offsets[i - 1] + counts[i - 1];
  const symbols = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const len = lengths[i];
    if (len) {
      symbols[offsets[len]] = i;
      offsets[len] = offsets[len] + 1;
    }
  }
  return { counts, symbols };
}
function decodeSym(br, table) {
  let code = 0;
  let first = 0;
  let index = 0;
  for (let len = 1; len <= 15; len++) {
    code |= br.bit();
    const count = table.counts[len];
    if (code - first < count) return table.symbols[index + (code - first)];
    index += count;
    first = first + count << 1;
    code <<= 1;
  }
  throw new Error("inflate: bad Huffman code");
}
var FIXED_LIT = null;
var FIXED_DIST = null;
function fixedTables() {
  if (!FIXED_LIT) {
    const litLen = new Int32Array(288);
    for (let i = 0; i < 144; i++) litLen[i] = 8;
    for (let i = 144; i < 256; i++) litLen[i] = 9;
    for (let i = 256; i < 280; i++) litLen[i] = 7;
    for (let i = 280; i < 288; i++) litLen[i] = 8;
    FIXED_LIT = buildHuff(litLen, 288);
    const distLen = new Int32Array(30).fill(5);
    FIXED_DIST = buildHuff(distLen, 30);
  }
  return { lit: FIXED_LIT, dist: FIXED_DIST };
}
function dynamicTables(br) {
  const hlit = br.bits(5) + 257;
  const hdist = br.bits(5) + 1;
  const hclen = br.bits(4) + 4;
  const clen = new Int32Array(19);
  for (let i2 = 0; i2 < hclen; i2++) clen[CODE_LEN_ORDER[i2]] = br.bits(3);
  const clTable = buildHuff(clen, 19);
  const lengths = new Int32Array(hlit + hdist);
  let i = 0;
  while (i < hlit + hdist) {
    const sym = decodeSym(br, clTable);
    if (sym < 16) {
      lengths[i++] = sym;
    } else if (sym === 16) {
      const prev = lengths[i - 1];
      let rep = 3 + br.bits(2);
      while (rep-- > 0) lengths[i++] = prev;
    } else if (sym === 17) {
      let rep = 3 + br.bits(3);
      while (rep-- > 0) lengths[i++] = 0;
    } else {
      let rep = 11 + br.bits(7);
      while (rep-- > 0) lengths[i++] = 0;
    }
  }
  return {
    lit: buildHuff(lengths.subarray(0, hlit), hlit),
    dist: buildHuff(lengths.subarray(hlit), hdist)
  };
}
function inflateRaw(src, expectedSize = 0) {
  const br = new BitReader(src);
  let out = new Uint8Array(expectedSize > 0 ? expectedSize : Math.max(64, src.length * 4));
  let outPos = 0;
  const ensure = (extra) => {
    if (outPos + extra <= out.length) return;
    let cap = out.length * 2;
    while (cap < outPos + extra) cap *= 2;
    const bigger = new Uint8Array(cap);
    bigger.set(out.subarray(0, outPos));
    out = bigger;
  };
  let final = 0;
  do {
    final = br.bit();
    const type = br.bits(2);
    if (type === 0) {
      br.align();
      const lenLo = br.readBytes(2);
      const len = lenLo[0] | lenLo[1] << 8;
      br.readBytes(2);
      const data = br.readBytes(len);
      ensure(len);
      out.set(data, outPos);
      outPos += len;
    } else {
      const { lit, dist } = type === 1 ? fixedTables() : dynamicTables(br);
      for (; ; ) {
        const sym = decodeSym(br, lit);
        if (sym === 256) break;
        if (sym < 256) {
          ensure(1);
          out[outPos++] = sym;
        } else {
          const li = sym - 257;
          const length = LEN_BASE[li] + br.bits(LEN_EXTRA[li]);
          const dsym = decodeSym(br, dist);
          const distance = DIST_BASE[dsym] + br.bits(DIST_EXTRA[dsym]);
          ensure(length);
          let from = outPos - distance;
          for (let k = 0; k < length; k++) out[outPos++] = out[from++];
        }
      }
    }
  } while (!final);
  return out.subarray(0, outPos);
}

// src/io/deflate.ts
var LEN_BASE2 = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
var LEN_EXTRA2 = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
var DIST_BASE2 = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
var DIST_EXTRA2 = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
var WINDOW = 32768;
var MIN_MATCH = 3;
var MAX_MATCH = 258;
var BitWriter = class {
  out = [];
  bitBuf = 0;
  bitCnt = 0;
  /** 写 n 位（值的低 n 位，LSB 先）。 */
  bits(value, n) {
    for (let i = 0; i < n; i++) {
      this.bitBuf |= (value >> i & 1) << this.bitCnt;
      this.bitCnt++;
      if (this.bitCnt === 8) {
        this.out.push(this.bitBuf & 255);
        this.bitBuf = 0;
        this.bitCnt = 0;
      }
    }
  }
  /** 写 Huffman 码（MSB 先——Huffman 码位序与数据位相反，RFC §3.1.1）。 */
  huff(code, len) {
    for (let i = len - 1; i >= 0; i--) {
      this.bitBuf |= (code >> i & 1) << this.bitCnt;
      this.bitCnt++;
      if (this.bitCnt === 8) {
        this.out.push(this.bitBuf & 255);
        this.bitBuf = 0;
        this.bitCnt = 0;
      }
    }
  }
  finish() {
    if (this.bitCnt > 0) {
      this.out.push(this.bitBuf & 255);
      this.bitBuf = 0;
      this.bitCnt = 0;
    }
    return Uint8Array.from(this.out);
  }
};
function fixedLitCode(sym) {
  if (sym <= 143) return { code: 48 + sym, len: 8 };
  if (sym <= 255) return { code: 400 + (sym - 144), len: 9 };
  if (sym <= 279) return { code: 0 + (sym - 256), len: 7 };
  return { code: 192 + (sym - 280), len: 8 };
}
function fixedDistCode(sym) {
  return { code: sym, len: 5 };
}
function lengthCode(len) {
  for (let i = LEN_BASE2.length - 1; i >= 0; i--) {
    if (len >= LEN_BASE2[i]) return { sym: 257 + i, extra: len - LEN_BASE2[i], extraBits: LEN_EXTRA2[i] };
  }
  return { sym: 257, extra: 0, extraBits: 0 };
}
function distCode(dist) {
  for (let i = DIST_BASE2.length - 1; i >= 0; i--) {
    if (dist >= DIST_BASE2[i]) return { sym: i, extra: dist - DIST_BASE2[i], extraBits: DIST_EXTRA2[i] };
  }
  return { sym: 0, extra: 0, extraBits: 0 };
}
function deflateRaw(src) {
  const n = src.length;
  const bw = new BitWriter();
  bw.bits(1, 1);
  bw.bits(1, 2);
  const hashHead = new Int32Array(65536).fill(-1);
  const hashPrev = new Int32Array(n).fill(-1);
  const hash3 = (i2) => n - i2 >= MIN_MATCH ? (src[i2] << 10 ^ src[i2 + 1] << 5 ^ src[i2 + 2]) & 65535 : 0;
  let i = 0;
  const emitLiteral = (byte) => {
    const { code, len } = fixedLitCode(byte);
    bw.huff(code, len);
  };
  const emitMatch = (len, dist) => {
    const lc = lengthCode(len);
    const litc = fixedLitCode(lc.sym);
    bw.huff(litc.code, litc.len);
    if (lc.extraBits) bw.bits(lc.extra, lc.extraBits);
    const dc = distCode(dist);
    const distc = fixedDistCode(dc.sym);
    bw.huff(distc.code, distc.len);
    if (dc.extraBits) bw.bits(dc.extra, dc.extraBits);
  };
  const MAX_CHAIN = 128;
  while (i < n) {
    let bestLen = 0;
    let bestDist = 0;
    if (n - i >= MIN_MATCH) {
      const h = hash3(i);
      let cand = hashHead[h];
      let chain = 0;
      const limit = Math.max(0, i - WINDOW);
      while (cand >= limit && cand >= 0 && chain < MAX_CHAIN) {
        let l = 0;
        const maxL = Math.min(MAX_MATCH, n - i);
        while (l < maxL && src[cand + l] === src[i + l]) l++;
        if (l > bestLen) {
          bestLen = l;
          bestDist = i - cand;
          if (l >= maxL) break;
        }
        cand = hashPrev[cand];
        chain++;
      }
    }
    if (bestLen >= MIN_MATCH) {
      emitMatch(bestLen, bestDist);
      const end = i + bestLen;
      while (i < end) {
        if (n - i >= MIN_MATCH) {
          const h = hash3(i);
          hashPrev[i] = hashHead[h];
          hashHead[h] = i;
        }
        i++;
      }
    } else {
      emitLiteral(src[i]);
      if (n - i >= MIN_MATCH) {
        const h = hash3(i);
        hashPrev[i] = hashHead[h];
        hashHead[h] = i;
      }
      i++;
    }
  }
  const eob = fixedLitCode(256);
  bw.huff(eob.code, eob.len);
  return bw.finish();
}

// src/io/zip.ts
var textEncoder = new TextEncoder();
var textDecoder = new TextDecoder();
var CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 4294967295;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ c >>> 8;
  return (c ^ 4294967295) >>> 0;
}
var ByteWriter = class {
  chunks = [];
  _len = 0;
  get length() {
    return this._len;
  }
  push(b) {
    this.chunks.push(b);
    this._len += b.length;
  }
  u16(n) {
    this.push(new Uint8Array([n & 255, n >>> 8 & 255]));
  }
  u32(n) {
    this.push(new Uint8Array([n & 255, n >>> 8 & 255, n >>> 16 & 255, n >>> 24 & 255]));
  }
  bytes(b) {
    this.push(b);
  }
  concat() {
    const out = new Uint8Array(this._len);
    let o = 0;
    for (const c of this.chunks) {
      out.set(c, o);
      o += c.length;
    }
    return out;
  }
};
function zipSync(entries) {
  const body = new ByteWriter();
  const central = new ByteWriter();
  const records = [];
  const DEFLATE_MIN = 256;
  for (const e of entries) {
    const nameBytes = textEncoder.encode(e.name);
    const crc = crc32(e.data);
    const offset = body.length;
    let payload = e.data;
    let method = 0;
    if (e.data.length >= DEFLATE_MIN) {
      const def = deflateRaw(e.data);
      if (def.length < e.data.length) {
        payload = def;
        method = 8;
      }
    }
    body.u32(67324752);
    body.u16(20);
    body.u16(0);
    body.u16(method);
    body.u16(0);
    body.u16(33);
    body.u32(crc);
    body.u32(payload.length);
    body.u32(e.data.length);
    body.u16(nameBytes.length);
    body.u16(0);
    body.bytes(nameBytes);
    body.bytes(payload);
    records.push({ name: nameBytes, crc, csize: payload.length, usize: e.data.length, offset, method });
  }
  const centralOffset = body.length;
  for (const r of records) {
    central.u32(33639248);
    central.u16(20);
    central.u16(20);
    central.u16(0);
    central.u16(r.method);
    central.u16(0);
    central.u16(33);
    central.u32(r.crc);
    central.u32(r.csize);
    central.u32(r.usize);
    central.u16(r.name.length);
    central.u16(0);
    central.u16(0);
    central.u16(0);
    central.u16(0);
    central.u32(0);
    central.u32(r.offset);
    central.bytes(r.name);
  }
  const centralBytes = central.concat();
  const eocd = new ByteWriter();
  eocd.u32(101010256);
  eocd.u16(0);
  eocd.u16(0);
  eocd.u16(records.length);
  eocd.u16(records.length);
  eocd.u32(centralBytes.length);
  eocd.u32(centralOffset);
  eocd.u16(0);
  const bodyBytes = body.concat();
  const eocdBytes = eocd.concat();
  const out = new Uint8Array(bodyBytes.length + centralBytes.length + eocdBytes.length);
  out.set(bodyBytes, 0);
  out.set(centralBytes, bodyBytes.length);
  out.set(eocdBytes, bodyBytes.length + centralBytes.length);
  return out;
}
function u16(b, o) {
  return b[o] | b[o + 1] << 8;
}
function u32(b, o) {
  return (b[o] | b[o + 1] << 8 | b[o + 2] << 16 | b[o + 3] << 24) >>> 0;
}
function unzipSync(zip) {
  const out = /* @__PURE__ */ new Map();
  let eocd = -1;
  for (let i = zip.length - 22; i >= 0; i--) {
    if (u32(zip, i) === 101010256) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("zip: EOCD not found (not a zip?)");
  const count = u16(zip, eocd + 10);
  let p = u32(zip, eocd + 16);
  for (let n = 0; n < count; n++) {
    if (u32(zip, p) !== 33639248) break;
    const method = u16(zip, p + 10);
    const compSize = u32(zip, p + 20);
    const uncompSize = u32(zip, p + 24);
    const nameLen = u16(zip, p + 28);
    const extraLen = u16(zip, p + 30);
    const commentLen = u16(zip, p + 32);
    const localOffset = u32(zip, p + 42);
    const name = textDecoder.decode(zip.subarray(p + 46, p + 46 + nameLen));
    const lhNameLen = u16(zip, localOffset + 26);
    const lhExtraLen = u16(zip, localOffset + 28);
    const dataStart = localOffset + 30 + lhNameLen + lhExtraLen;
    const raw = zip.subarray(dataStart, dataStart + compSize);
    let data;
    if (method === 0) data = raw.slice();
    else if (method === 8) data = inflateRaw(raw, uncompSize);
    else throw new Error(`zip: unsupported method ${method} for ${name}`);
    out.set(name, data);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}
function encodeUtf8(s) {
  return textEncoder.encode(s);
}
function decodeUtf8(b) {
  return textDecoder.decode(b);
}

// src/io/xlsx.ts
function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
var XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
var H_TO_XLSX = {
  left: "left",
  center: "center",
  right: "right",
  fill: "fill",
  justify: "justify",
  centerContinuous: "centerContinuous"
};
var V_TO_XLSX = { top: "top", middle: "center", bottom: "bottom" };
var H_FROM_XLSX = {
  left: "left",
  center: "center",
  right: "right",
  fill: "fill",
  justify: "justify",
  centerContinuous: "centerContinuous"
};
var V_FROM_XLSX = { top: "top", center: "middle", bottom: "bottom" };
var BORDER_TO_XLSX = {
  none: "none",
  thin: "thin",
  medium: "medium",
  thick: "thick",
  dashed: "dashed",
  dotted: "dotted",
  double: "double"
};
var BORDER_FROM_XLSX = {
  thin: "thin",
  medium: "medium",
  thick: "thick",
  dashed: "dashed",
  dotted: "dotted",
  double: "double",
  hair: "thin",
  mediumDashed: "dashed"
};
var PATTERN_TO_XLSX = {
  solid: "solid",
  gray75: "darkGray",
  gray50: "mediumGray",
  gray25: "lightGray",
  gray125: "gray125",
  gray0625: "gray0625",
  horizontal: "darkHorizontal",
  vertical: "darkVertical",
  down: "darkDown",
  up: "darkUp",
  grid: "darkGrid",
  trellis: "darkTrellis",
  lightHorizontal: "lightHorizontal",
  lightVertical: "lightVertical",
  lightDown: "lightDown",
  lightUp: "lightUp",
  lightGrid: "lightGrid",
  lightTrellis: "lightTrellis"
};
var PATTERN_FROM_XLSX = {
  darkGray: "gray75",
  mediumGray: "gray50",
  lightGray: "gray25",
  gray125: "gray125",
  gray0625: "gray0625",
  darkHorizontal: "horizontal",
  darkVertical: "vertical",
  darkDown: "down",
  darkUp: "up",
  darkGrid: "grid",
  darkTrellis: "trellis",
  lightHorizontal: "lightHorizontal",
  lightVertical: "lightVertical",
  lightDown: "lightDown",
  lightUp: "lightUp",
  lightGrid: "lightGrid",
  lightTrellis: "lightTrellis"
};
function toArgb(color) {
  let c = color.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(c)) c = c.split("").map((x) => x + x).join("");
  if (/^[0-9a-fA-F]{6}$/.test(c)) return ("FF" + c).toUpperCase();
  if (/^[0-9a-fA-F]{8}$/.test(c)) return c.toUpperCase();
  return "FF000000";
}
function fromArgb(argb) {
  if (!argb) return void 0;
  const c = argb.trim();
  if (/^[0-9a-fA-F]{8}$/.test(c)) return "#" + c.slice(2).toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(c)) return "#" + c.toLowerCase();
  return void 0;
}
var StyleRegistry = class {
  fonts = ['<font><sz val="11"/><name val="Calibri"/></font>'];
  fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
  borders = ["<border><left/><right/><top/><bottom/><diagonal/></border>"];
  numFmts = [];
  numFmtByCode = /* @__PURE__ */ new Map();
  xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
  xfByKey = /* @__PURE__ */ new Map();
  nextNumFmtId = 164;
  // 自定义 numFmt 从 164 起（0-163 内置）
  /** 解析后的完整样式（含级联展开）→ cellXfs 索引 s。空样式返回 0。 */
  intern(style) {
    if (!style || Object.keys(style).length === 0) return 0;
    const fontId = this.internFont(style);
    const fillId = this.internFill(style);
    const borderId = this.internBorder(style);
    const numFmtId = this.internNumFmt(style);
    const align = this.alignAttrs(style);
    const applyAlign = align ? ' applyAlignment="1"' : "";
    const unlocked = style.locked === false;
    const applyProt = unlocked ? ' applyProtection="1"' : "";
    const key2 = `${numFmtId}|${fontId}|${fillId}|${borderId}|${align}|${unlocked ? "u" : ""}`;
    const hit = this.xfByKey.get(key2);
    if (hit !== void 0) return hit;
    const applyFont = fontId ? ' applyFont="1"' : "";
    const applyFill = fillId ? ' applyFill="1"' : "";
    const applyBorder = borderId ? ' applyBorder="1"' : "";
    const applyNum = numFmtId ? ' applyNumberFormat="1"' : "";
    const inner = (align ? `<alignment ${align}/>` : "") + (unlocked ? '<protection locked="0"/>' : "");
    const body = inner ? `>${inner}</xf>` : "/>";
    this.xfs.push(
      `<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0"${applyNum}${applyFont}${applyFill}${applyBorder}${applyAlign}${applyProt}${body}`
    );
    const idx = this.xfs.length - 1;
    this.xfByKey.set(key2, idx);
    return idx;
  }
  internFont(s) {
    if (!s.bold && !s.italic && !s.underline && !s.strikethrough && !s.fontSize && !s.fontFamily && !s.foreColor) return 0;
    let f2 = "<font>";
    if (s.bold) f2 += "<b/>";
    if (s.italic) f2 += "<i/>";
    if (s.underline) f2 += "<u/>";
    if (s.strikethrough) f2 += "<strike/>";
    f2 += `<sz val="${s.fontSize ?? 11}"/>`;
    if (s.foreColor) f2 += `<color rgb="${toArgb(s.foreColor)}"/>`;
    f2 += `<name val="${esc(s.fontFamily ?? "Calibri")}"/>`;
    f2 += "</font>";
    return this.dedupe(this.fonts, f2);
  }
  internFill(s) {
    if (s.backColor) {
      const f3 = `<fill><patternFill patternType="solid"><fgColor rgb="${toArgb(s.backColor)}"/><bgColor indexed="64"/></patternFill></fill>`;
      return this.dedupe(this.fills, f3);
    }
    const fill = s.fill;
    if (!fill) return 0;
    if (fill.type === "solid") {
      const f3 = `<fill><patternFill patternType="solid"><fgColor rgb="${toArgb(fill.color)}"/><bgColor indexed="64"/></patternFill></fill>`;
      return this.dedupe(this.fills, f3);
    }
    if (fill.type === "pattern") {
      const pt = PATTERN_TO_XLSX[fill.pattern] ?? "solid";
      const f3 = `<fill><patternFill patternType="${pt}"><fgColor rgb="${toArgb(fill.fgColor)}"/><bgColor rgb="${toArgb(fill.bgColor)}"/></patternFill></fill>`;
      return this.dedupe(this.fills, f3);
    }
    const stops = [...fill.stops].sort((a, b) => a.pos - b.pos);
    const stopXml = stops.map((st) => `<stop position="${st.pos}"><color rgb="${toArgb(st.color)}"/></stop>`).join("");
    const deg = fill.kind === "linear" ? ` degree="${fill.degree ?? 0}"` : "";
    const f2 = `<fill><gradientFill${deg}>${stopXml}</gradientFill></fill>`;
    return this.dedupe(this.fills, f2);
  }
  internBorder(s) {
    if (!s.borders) return 0;
    const edge = (side) => {
      const e = s.borders?.[side];
      if (!e || e.style === "none") return `<${side}/>`;
      return `<${side} style="${BORDER_TO_XLSX[e.style] ?? "thin"}"><color rgb="${toArgb(e.color)}"/></${side}>`;
    };
    const up = s.borders.diagonalUp;
    const down = s.borders.diagonalDown;
    const diagEdge = up ?? down;
    const diagAttr = `${up ? ' diagonalUp="1"' : ""}${down ? ' diagonalDown="1"' : ""}`;
    const diag = diagEdge && diagEdge.style !== "none" ? `<diagonal style="${BORDER_TO_XLSX[diagEdge.style] ?? "thin"}"><color rgb="${toArgb(diagEdge.color)}"/></diagonal>` : "<diagonal/>";
    const b = `<border${diagAttr}>${edge("left")}${edge("right")}${edge("top")}${edge("bottom")}${diag}</border>`;
    return this.dedupe(this.borders, b);
  }
  internNumFmt(s) {
    if (!s.formatter) return 0;
    const code = s.formatter;
    const hit = this.numFmtByCode.get(code);
    if (hit !== void 0) return hit;
    const id = this.nextNumFmtId++;
    this.numFmts.push({ id, code });
    this.numFmtByCode.set(code, id);
    return id;
  }
  alignAttrs(s) {
    const parts = [];
    if (s.hAlign) parts.push(`horizontal="${H_TO_XLSX[s.hAlign]}"`);
    if (s.vAlign) parts.push(`vertical="${V_TO_XLSX[s.vAlign]}"`);
    if (s.wordWrap) parts.push('wrapText="1"');
    if (s.textRotation !== void 0 && s.textRotation !== 0) {
      const r = Math.trunc(s.textRotation);
      parts.push(`textRotation="${r >= 0 ? r : 90 - r}"`);
    }
    if (s.indent && s.indent > 0) parts.push(`indent="${Math.trunc(s.indent)}"`);
    if (s.shrinkToFit) parts.push('shrinkToFit="1"');
    return parts.join(" ");
  }
  dedupe(arr, xml) {
    const i = arr.indexOf(xml);
    if (i >= 0) return i;
    arr.push(xml);
    return arr.length - 1;
  }
  toXML() {
    const numFmtsXml = this.numFmts.length ? `<numFmts count="${this.numFmts.length}">${this.numFmts.map((n) => `<numFmt numFmtId="${n.id}" formatCode="${esc(n.code)}"/>`).join("")}</numFmts>` : "";
    return XML_DECL + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' + numFmtsXml + `<fonts count="${this.fonts.length}">${this.fonts.join("")}</fonts><fills count="${this.fills.length}">${this.fills.join("")}</fills><borders count="${this.borders.length}">${this.borders.join("")}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${this.xfs.length}">${this.xfs.join("")}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  }
};
var SharedStrings = class {
  list = [];
  byStr = /* @__PURE__ */ new Map();
  intern(s) {
    const hit = this.byStr.get(s);
    if (hit !== void 0) return hit;
    const i = this.list.length;
    this.list.push(s);
    this.byStr.set(s, i);
    return i;
  }
  get count() {
    return this.list.length;
  }
  toXML() {
    return XML_DECL + `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${this.count}" uniqueCount="${this.count}">` + this.list.map((s) => `<si><t xml:space="preserve">${esc(s)}</t></si>`).join("") + "</sst>";
  }
};
function resolveCellStyle(style, namedStyles) {
  if (!style) return {};
  if (!style.styleName) {
    const { styleName: _d2, ...rest2 } = style;
    return rest2;
  }
  const base = namedStyles?.[style.styleName] ?? {};
  const { styleName: _d, ...rest } = style;
  return { ...base, ...rest };
}
function detailLevelAt(groups, index, summaryAfter) {
  let n = 0;
  for (const g of groups) {
    const inDetail = summaryAfter ? index >= g.start && index < g.start + g.count - 1 : index > g.start && index < g.start + g.count;
    if (inDetail) n++;
  }
  return n;
}
function sheetToXml(snap, styles, sst, namedStyles, drawingRid) {
  const byRow = /* @__PURE__ */ new Map();
  for (const cell of snap.cells) {
    const arr = byRow.get(cell.r) ?? [];
    arr.push(cell);
    byRow.set(cell.r, arr);
  }
  const rowHeight = new Map(snap.rowHeights ?? []);
  const hiddenRows = new Set(snap.hiddenRows ?? []);
  const rowGroups = snap.rowOutlines ?? [];
  const colGroups = snap.colOutlines ?? [];
  const summaryBelow = snap.summaryBelow !== false;
  const summaryRight = snap.summaryRight !== false;
  const rowLevelAt = (r) => detailLevelAt(rowGroups, r, summaryBelow);
  const colLevelAt = (c) => detailLevelAt(colGroups, c, summaryRight);
  const lastCol = colToLabel(Math.max(0, snap.colCount - 1));
  const dimension = `A1:${lastCol}${snap.rowCount}`;
  const colWidth = new Map(snap.colWidths ?? []);
  const hiddenCols = new Set(snap.hiddenCols ?? []);
  let colsXml = "";
  const colLeveled = /* @__PURE__ */ new Set();
  for (let c = 0; c < snap.colCount; c++) if (colLevelAt(c) > 0) colLeveled.add(c);
  const colIndices = /* @__PURE__ */ new Set([...colWidth.keys(), ...hiddenCols, ...colLeveled]);
  if (colIndices.size) {
    const parts = [];
    for (const c of [...colIndices].sort((a, b) => a - b)) {
      const w = colWidth.get(c);
      const wAttr = w !== void 0 ? ` width="${(w / 7).toFixed(2)}" customWidth="1"` : "";
      const hAttr = hiddenCols.has(c) ? ' hidden="1"' : "";
      const lvl = colLevelAt(c);
      const lvlAttr = lvl > 0 ? ` outlineLevel="${lvl}"` : "";
      parts.push(`<col min="${c + 1}" max="${c + 1}"${wAttr}${lvlAttr}${hAttr}/>`);
    }
    colsXml = `<cols>${parts.join("")}</cols>`;
  }
  const rowsXml = [];
  const rowLeveled = /* @__PURE__ */ new Set();
  for (let r = 0; r < snap.rowCount; r++) if (rowLevelAt(r) > 0) rowLeveled.add(r);
  const rowNums = [.../* @__PURE__ */ new Set([...byRow.keys(), ...rowHeight.keys(), ...hiddenRows, ...rowLeveled])].sort((a, b) => a - b);
  for (const r of rowNums) {
    const cells = (byRow.get(r) ?? []).sort((a, b) => a.c - b.c);
    const ht = rowHeight.get(r);
    const htAttr = ht !== void 0 ? ` ht="${ht}" customHeight="1"` : "";
    const hidAttr = hiddenRows.has(r) ? ' hidden="1"' : "";
    const lvl = rowLevelAt(r);
    const lvlAttr = lvl > 0 ? ` outlineLevel="${lvl}"` : "";
    const cellsXml = cells.map((cell) => cellToXml(cell, r, styles, sst, namedStyles)).join("");
    rowsXml.push(`<row r="${r + 1}"${htAttr}${lvlAttr}${hidAttr}>${cellsXml}</row>`);
  }
  let mergeXml = "";
  if (snap.spans?.length) {
    const merges = snap.spans.map((s) => {
      const a = formatAddr(s.row, s.col);
      const b = formatAddr(s.row + s.rowCount - 1, s.col + s.colCount - 1);
      return `<mergeCell ref="${a}:${b}"/>`;
    });
    mergeXml = `<mergeCells count="${merges.length}">${merges.join("")}</mergeCells>`;
  }
  const hasOutline = rowGroups.length > 0 || colGroups.length > 0;
  const sheetPrXml = hasOutline || !summaryBelow || !summaryRight ? `<sheetPr><outlinePr summaryBelow="${summaryBelow ? 1 : 0}" summaryRight="${summaryRight ? 1 : 0}"/></sheetPr>` : "";
  const drawingXmlRef = drawingRid != null ? `<drawing xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId${drawingRid}"/>` : "";
  return XML_DECL + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' + sheetPrXml + sheetViewsXml(snap) + `<dimension ref="${dimension}"/>` + colsXml + `<sheetData>${rowsXml.join("")}</sheetData>` + sheetProtectionXml(snap) + autoFilterXml(snap) + mergeXml + dataValidationsXml(snap) + pageSetupXml(snap) + drawingXmlRef + sparklineExtLstXml(snap) + "</worksheet>";
}
function sheetProtectionXml(snap) {
  const p = snap.protection;
  if (!p || !p.enabled) return "";
  const noSort = p.allowSort ? ' sort="0"' : ' sort="1"';
  const noFilter = p.allowFilter ? ' autoFilter="0"' : ' autoFilter="1"';
  const noFmt = p.allowFormatCells ? ' formatCells="0"' : ' formatCells="1"';
  const noIns = p.allowInsertDelete ? "" : ' insertRows="1" insertColumns="1" deleteRows="1" deleteColumns="1"';
  return `<sheetProtection sheet="1" objects="1" scenarios="1"${noSort}${noFilter}${noFmt}${noIns}/>`;
}
function sheetViewsXml(snap) {
  const fr = snap.frozenRowCount ?? 0;
  const fc = snap.frozenColCount ?? 0;
  if (fr <= 0 && fc <= 0) return "";
  const topLeft = `${colToLabel(fc)}${fr + 1}`;
  const activePane = fr > 0 && fc > 0 ? "bottomRight" : fr > 0 ? "bottomLeft" : "topRight";
  const pane = `<pane xSplit="${fc}" ySplit="${fr}" topLeftCell="${topLeft}" activePane="${activePane}" state="frozen"/>`;
  return `<sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews>`;
}
function autoFilterXml(snap) {
  const af = snap.autoFilter;
  if (!af) return "";
  const a = formatAddr(af.range.row, af.range.col);
  const b = formatAddr(af.range.row + af.range.rowCount - 1, af.range.col + af.range.colCount - 1);
  return `<autoFilter ref="${a}:${b}"/>`;
}
function dataValidationsXml(snap) {
  const vals = snap.validations;
  if (!vals || !vals.length) return "";
  const parts = vals.map((v) => {
    const a = formatAddr(v.range.row, v.range.col);
    const b = formatAddr(v.range.row + v.range.rowCount - 1, v.range.col + v.range.colCount - 1);
    const sqref = `${a}:${b}`;
    const typeMap = { list: "list", whole: "whole", decimal: "decimal", date: "date", textLength: "textLength", custom: "custom" };
    const opMap = { between: "between", notBetween: "notBetween", eq: "equal", ne: "notEqual", gt: "greaterThan", lt: "lessThan", ge: "greaterThanOrEqual", le: "lessThanOrEqual" };
    const t = typeMap[v.type] ?? "custom";
    const opAttr = v.operator ? ` operator="${opMap[v.operator] ?? "between"}"` : "";
    const allow = v.allowBlank === false ? ' allowBlank="0"' : ' allowBlank="1"';
    let f1 = "";
    if (v.type === "list" && v.list) f1 = `<formula1>&quot;${esc(v.list.join(","))}&quot;</formula1>`;
    else if (v.formula1 != null) f1 = `<formula1>${esc(String(v.formula1))}</formula1>`;
    const f2 = v.formula2 != null ? `<formula2>${esc(String(v.formula2))}</formula2>` : "";
    return `<dataValidation type="${t}"${opAttr}${allow} sqref="${sqref}">${f1}${f2}</dataValidation>`;
  });
  return `<dataValidations count="${parts.length}">${parts.join("")}</dataValidations>`;
}
function quoteSheetName(name) {
  const safe = /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
  return safe ? name : `'${name.replace(/'/g, "''")}'`;
}
function absRegionA1(r) {
  const a = `$${colToLabel(r.col)}$${r.row + 1}`;
  if (r.rowCount <= 1 && r.colCount <= 1) return a;
  const b = `$${colToLabel(r.col + r.colCount - 1)}$${r.row + r.rowCount - 1 + 1}`;
  return `${a}:${b}`;
}
function nativeSparklineType(t) {
  if (t === "column" || t === "bar" || t === "bullet" || t === "pie") return "column";
  if (t === "winloss") return "stacked";
  return "line";
}
function sparklineExtLstXml(snap) {
  const sparks = snap.sparklines ?? [];
  if (!sparks.length) return "";
  const prefix = quoteSheetName(snap.name);
  const groups = sparks.map(([row, col, sp]) => {
    const native = nativeSparklineType(sp.type);
    const typeAttr = native === "line" ? "" : ` type="${native}"`;
    const markers = sp.markers ? ' markers="1"' : "";
    const dataRef = `${prefix}!${absRegionA1(sp.dataRange)}`;
    const loc = formatAddr(row, col);
    return `<x14:sparklineGroup${typeAttr}${markers} displayEmptyCellsAs="gap"><x14:sparklines><x14:sparkline><xm:f>${esc(dataRef)}</xm:f><xm:sqref>${loc}</xm:sqref></x14:sparkline></x14:sparklines></x14:sparklineGroup>`;
  }).join("");
  return `<extLst><ext xmlns:x14="http://schemas.microsoft.com/office/spreadsheetml/2009/9/main" uri="{05C60535-1F16-4fd2-B633-F4F36F0B64E0}"><x14:sparklineGroups xmlns:xm="http://schemas.microsoft.com/office/excel/2006/main">${groups}</x14:sparklineGroups></ext></extLst>`;
}
function pageSetupXml(snap) {
  const ps = snap.pageSetup;
  if (!ps) return "";
  const paperMap = { Letter: 1, Legal: 5, A3: 8, A4: 9 };
  const paper = paperMap[ps.paperSize ?? "A4"] ?? 9;
  const orient = ps.orientation ?? "portrait";
  const m = ps.margins ? { l: ps.margins.left / 72, r: ps.margins.right / 72, t: ps.margins.top / 72, b: ps.margins.bottom / 72 } : { l: 0.5, r: 0.5, t: 0.5, b: 0.5 };
  const marginsXml = `<pageMargins left="${m.l}" right="${m.r}" top="${m.t}" bottom="${m.b}" header="0.3" footer="0.3"/>`;
  const scaleAttr = ps.scale ? ` scale="${ps.scale}"` : "";
  const fitAttr = ps.fitToPages ? ` fitToWidth="${ps.fitToPages.width}" fitToHeight="${ps.fitToPages.height}"` : "";
  return `${marginsXml}<pageSetup paperSize="${paper}" orientation="${orient}"${scaleAttr}${fitAttr}/>`;
}
function cellToXml(cell, row, styles, sst, namedStyles) {
  const ref = formatAddr(row, cell.c);
  const resolved = resolveCellStyle(cell.s, namedStyles);
  const s = styles.intern(resolved);
  const sAttr = s ? ` s="${s}"` : "";
  if (cell.f) {
    const v2 = cell.v;
    let vXml = "";
    if (typeof v2 === "number") vXml = `<v>${v2}</v>`;
    else if (typeof v2 === "boolean") vXml = `<v>${v2 ? 1 : 0}</v>`;
    else if (typeof v2 === "string" && v2 !== "") vXml = `<v>${esc(v2)}</v>`;
    const tAttr = typeof v2 === "string" && v2 !== "" ? ' t="str"' : "";
    return `<c r="${ref}"${sAttr}${tAttr}><f>${esc(cell.f)}</f>${vXml}</c>`;
  }
  const v = cell.v;
  if (v === void 0 || v === null || v === "") {
    return s ? `<c r="${ref}"${sAttr}/>` : "";
  }
  if (typeof v === "number") return `<c r="${ref}"${sAttr}><v>${v}</v></c>`;
  if (typeof v === "boolean") return `<c r="${ref}"${sAttr} t="b"><v>${v ? 1 : 0}</v></c>`;
  const si = sst.intern(String(v));
  return `<c r="${ref}"${sAttr} t="s"><v>${si}</v></c>`;
}
function cellTextAt(snap, row, col) {
  const c = snap.cells.find((x) => x.r === row && x.c === col);
  if (!c || c.v == null) return void 0;
  return typeof c.v === "boolean" ? c.v ? "TRUE" : "FALSE" : String(c.v);
}
function seriesRefs(sheetName, spec, snap) {
  const g = spec.dataRange;
  const rowHdr = spec.firstRowHeader ?? true;
  const colHdr = spec.firstColHeader ?? true;
  const dataR0 = g.row + (rowHdr ? 1 : 0);
  const dataC0 = g.col + (colHdr ? 1 : 0);
  const lastRow = g.row + g.rowCount - 1;
  const prefix = quoteSheetName(sheetName);
  const catRef = `${prefix}!${absRegionA1({ row: dataR0, col: g.col, rowCount: g.rowCount - (rowHdr ? 1 : 0), colCount: 1 })}`;
  const out = [];
  for (let c = dataC0; c < g.col + g.colCount; c++) {
    const nameLit = rowHdr ? cellTextAt(snap, g.row, c) ?? `\u5217${c}` : `\u5217${c}`;
    out.push({
      nameRef: `${prefix}!$${colToLabel(c)}$${g.row + 1}`,
      nameLit,
      catRef,
      valRef: `${prefix}!${absRegionA1({ row: dataR0, col: c, rowCount: lastRow - dataR0 + 1, colCount: 1 })}`
    });
  }
  return out;
}
function serXml(idx, s, catTag, valTag) {
  return `<c:ser><c:idx val="${idx}"/><c:order val="${idx}"/><c:tx><c:strRef><c:f>${esc(s.nameRef)}</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${esc(s.nameLit)}</c:v></c:pt></c:strCache></c:strRef></c:tx><c:${catTag}><c:numRef><c:f>${esc(s.catRef)}</c:f></c:numRef></c:${catTag}><c:${valTag}><c:numRef><c:f>${esc(s.valRef)}</c:f></c:numRef></c:${valTag}></c:ser>`;
}
var AX_CAT = 111111111;
var AX_VAL = 222222222;
var AXES_XML = `<c:catAx><c:axId val="${AX_CAT}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:crossAx val="${AX_VAL}"/></c:catAx><c:valAx><c:axId val="${AX_VAL}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:crossAx val="${AX_CAT}"/></c:valAx>`;
function plotAreaXml(spec, series) {
  const sers = (catTag = "cat", valTag = "val") => series.map((s, i) => serXml(i, s, catTag, valTag)).join("");
  const axIds = `<c:axId val="${AX_CAT}"/><c:axId val="${AX_VAL}"/>`;
  switch (spec.chartType) {
    case "bar":
      return `<c:barChart><c:barDir val="bar"/><c:grouping val="clustered"/>${sers()}${axIds}</c:barChart>${AXES_XML}`;
    case "column":
      return `<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/>${sers()}${axIds}</c:barChart>${AXES_XML}`;
    case "line":
      return `<c:lineChart><c:grouping val="standard"/>${sers()}<c:marker val="1"/>${axIds}</c:lineChart>${AXES_XML}`;
    case "area":
      return `<c:areaChart><c:grouping val="standard"/>${sers()}${axIds}</c:areaChart>${AXES_XML}`;
    case "pie":
      return `<c:pieChart><c:varyColors val="1"/>${sers()}</c:pieChart>`;
    case "doughnut":
      return `<c:doughnutChart><c:varyColors val="1"/>${sers()}<c:holeSize val="50"/></c:doughnutChart>`;
    case "scatter":
    case "bubble": {
      const scatterSers = series.map((s, i) => `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:strRef><c:f>${esc(s.nameRef)}</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${esc(s.nameLit)}</c:v></c:pt></c:strCache></c:strRef></c:tx><c:xVal><c:numRef><c:f>${esc(s.catRef)}</c:f></c:numRef></c:xVal><c:yVal><c:numRef><c:f>${esc(s.valRef)}</c:f></c:numRef></c:yVal></c:ser>`).join("");
      return `<c:scatterChart><c:scatterStyle val="lineMarker"/>${scatterSers}${axIds}</c:scatterChart><c:valAx><c:axId val="${AX_CAT}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:crossAx val="${AX_VAL}"/></c:valAx><c:valAx><c:axId val="${AX_VAL}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:crossAx val="${AX_CAT}"/></c:valAx>`;
    }
    case "radar":
      return `<c:radarChart><c:radarStyle val="marker"/>${sers()}${axIds}</c:radarChart>${AXES_XML}`;
    case "stock":
      return `<c:stockChart>${sers()}${axIds}</c:stockChart>${AXES_XML}`;
    case "combo": {
      const [first, ...rest] = series;
      const bar = first ? `<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/>${serXml(0, first, "cat", "val")}${axIds}</c:barChart>` : "";
      const line = rest.length ? `<c:lineChart><c:grouping val="standard"/>${rest.map((s, i) => serXml(i + 1, s, "cat", "val")).join("")}<c:marker val="1"/>${axIds}</c:lineChart>` : "";
      return `${bar}${line}${AXES_XML}`;
    }
    default:
      return `<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/>${sers()}${axIds}</c:barChart>${AXES_XML}`;
  }
}
function chartXml(sheetName, spec, snap) {
  const series = seriesRefs(sheetName, spec, snap);
  const legend = spec.options?.legend ?? false;
  const title = spec.title ?? "";
  const titleXml = title ? `<c:title><c:tx><c:rich><a:bodyPr/><a:p><a:r><a:t>${esc(title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>` : '<c:autoTitleDeleted val="1"/>';
  const legendXml = legend ? '<c:legend><c:legendPos val="r"/><c:overlay val="0"/></c:legend>' : "";
  return XML_DECL + `<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:chart>${titleXml}<c:plotArea><c:layout/>${plotAreaXml(spec, series)}</c:plotArea>${legendXml}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>`;
}
function drawingXml(anchors) {
  const body = anchors.map(([rid, fromRow, fromCol, toRow, toCol]) => `<xdr:twoCellAnchor><xdr:from><xdr:col>${fromCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${fromRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${toCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${toRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${rid}" name="Chart ${rid}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId${rid}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`).join("");
  return XML_DECL + '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' + body + "</xdr:wsDr>";
}
function drawingRelsXml(chartFileIdx) {
  const rels = chartFileIdx.map((fileIdx, localRid) => `<Relationship Id="rId${localRid + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${fileIdx + 1}.xml"/>`).join("");
  return XML_DECL + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + rels + "</Relationships>";
}
function snapshotToXlsx(snap) {
  const styles = new StyleRegistry();
  const sst = new SharedStrings();
  const active = snap.activeSheet ?? 0;
  const sheetsForXml = snap.sheets.map((s, i) => {
    if (i === active && (snap.frozenRowCount || snap.frozenColCount)) {
      const withFreeze = { ...s };
      if (snap.frozenRowCount) withFreeze.frozenRowCount = snap.frozenRowCount;
      if (snap.frozenColCount) withFreeze.frozenColCount = snap.frozenColCount;
      return withFreeze;
    }
    return s;
  });
  const chartParts = [];
  const drawingParts = [];
  let nextDrawing = 1;
  const drawPlan = sheetsForXml.map((s) => {
    const charts = (s.floatingObjects ?? []).filter((o) => o.kind === "chart" && o.chart);
    if (!charts.length) return null;
    const chartFileIdx = [];
    const anchors = [];
    charts.forEach((o, localRid0) => {
      const fileIdx = chartParts.length;
      chartParts.push(chartXml(s.name, o.chart, s));
      chartFileIdx.push(fileIdx);
      const a = o.anchor;
      anchors.push([localRid0 + 1, a.fromRow, a.fromCol, a.toRow, a.toCol]);
    });
    const drawingIdx = nextDrawing++;
    drawingParts.push({ idx: drawingIdx, xml: drawingXml(anchors), rels: drawingRelsXml(chartFileIdx) });
    return { drawingIdx };
  });
  const sheetXmls = sheetsForXml.map((s, i) => sheetToXml(s, styles, sst, snap.styles, drawPlan[i] ? 1 : void 0));
  const sheetsXml = snap.sheets.map((s, i) => `<sheet name="${esc(s.name || `Sheet${i + 1}`)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("");
  const workbookXml = XML_DECL + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' + (active > 0 ? `<bookViews><workbookView activeTab="${active}"/></bookViews>` : "") + `<sheets>${sheetsXml}</sheets></workbook>`;
  const wbRelParts = snap.sheets.map(
    (_s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
  );
  const styleRid = snap.sheets.length + 1;
  const sstRid = snap.sheets.length + 2;
  wbRelParts.push(
    `<Relationship Id="rId${styleRid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
  );
  wbRelParts.push(
    `<Relationship Id="rId${sstRid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>`
  );
  const workbookRels = XML_DECL + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + wbRelParts.join("") + "</Relationships>";
  const sheetOverrides = snap.sheets.map(
    (_s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
  ).join("");
  const drawingOverrides = drawingParts.map((d) => `<Override PartName="/xl/drawings/drawing${d.idx}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`).join("");
  const chartOverrides = chartParts.map((_c, m) => `<Override PartName="/xl/charts/chart${m + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`).join("");
  const contentTypes = XML_DECL + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' + sheetOverrides + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>' + drawingOverrides + chartOverrides + "</Types>";
  const rootRels = XML_DECL + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
  const entries = [
    { name: "[Content_Types].xml", data: encodeUtf8(contentTypes) },
    { name: "_rels/.rels", data: encodeUtf8(rootRels) },
    { name: "xl/workbook.xml", data: encodeUtf8(workbookXml) },
    { name: "xl/_rels/workbook.xml.rels", data: encodeUtf8(workbookRels) },
    { name: "xl/styles.xml", data: encodeUtf8(styles.toXML()) },
    { name: "xl/sharedStrings.xml", data: encodeUtf8(sst.toXML()) },
    ...sheetXmls.map((xml, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: encodeUtf8(xml) }))
  ];
  drawPlan.forEach((plan, i) => {
    if (!plan) return;
    const wsRels = XML_DECL + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${plan.drawingIdx}.xml"/></Relationships>`;
    entries.push({ name: `xl/worksheets/_rels/sheet${i + 1}.xml.rels`, data: encodeUtf8(wsRels) });
  });
  for (const d of drawingParts) {
    entries.push({ name: `xl/drawings/drawing${d.idx}.xml`, data: encodeUtf8(d.xml) });
    entries.push({ name: `xl/drawings/_rels/drawing${d.idx}.xml.rels`, data: encodeUtf8(d.rels) });
  }
  chartParts.forEach((xml, m) => {
    entries.push({ name: `xl/charts/chart${m + 1}.xml`, data: encodeUtf8(xml) });
  });
  return zipSync(entries);
}
function exportXlsx(wb) {
  return snapshotToXlsx(workbookToJSON(wb));
}
function unesc(s) {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d))).replace(/&#x([0-9a-fA-F]+);/g, (_m, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&amp;/g, "&");
}
function attr(tag, name) {
  const m = new RegExp(`${name}="([^"]*)"`).exec(tag);
  return m ? m[1] : void 0;
}
function parseSharedStrings(xml) {
  if (!xml) return [];
  const out = [];
  const siRe = /<si>([\s\S]*?)<\/si>/g;
  let m;
  while (m = siRe.exec(xml)) {
    const inner = m[1];
    let text = "";
    const tRe = /<t[^>]*>([\s\S]*?)<\/t>/g;
    let tm;
    while (tm = tRe.exec(inner)) text += unesc(tm[1]);
    out.push(text);
  }
  return out;
}
function parseStyles(xml) {
  if (!xml) return { xf: [{}] };
  const numFmtById = /* @__PURE__ */ new Map();
  const nfRe = /<numFmt\s+([^/>]*)\/>/g;
  let m;
  while (m = nfRe.exec(xml)) {
    const id = Number(attr(m[1], "numFmtId"));
    const code = attr(m[1], "formatCode");
    if (Number.isFinite(id) && code !== void 0) numFmtById.set(id, unesc(code));
  }
  const fonts = [];
  const fontsBlock = /<fonts[^>]*>([\s\S]*?)<\/fonts>/.exec(xml)?.[1] ?? "";
  const fontRe = /<font>([\s\S]*?)<\/font>/g;
  while (m = fontRe.exec(fontsBlock)) {
    const f2 = m[1];
    const fp = {};
    if (/<b\/>|<b\s|<b>/.test(f2)) fp.bold = true;
    if (/<i\/>|<i\s|<i>/.test(f2)) fp.italic = true;
    if (/<u\/>|<u\s|<u>/.test(f2)) fp.underline = true;
    if (/<strike\/>|<strike\s|<strike>/.test(f2)) fp.strikethrough = true;
    const sz = /<sz val="([^"]*)"/.exec(f2)?.[1];
    if (sz) fp.fontSize = Number(sz);
    const name = /<name val="([^"]*)"/.exec(f2)?.[1];
    if (name) fp.fontFamily = unesc(name);
    const color = /<color[^>]*rgb="([^"]*)"/.exec(f2)?.[1];
    const fc = fromArgb(color);
    if (fc) fp.foreColor = fc;
    fonts.push(fp);
  }
  const fills = [];
  const fillsBlock = /<fills[^>]*>([\s\S]*?)<\/fills>/.exec(xml)?.[1] ?? "";
  const fillRe = /<fill>([\s\S]*?)<\/fill>/g;
  while (m = fillRe.exec(fillsBlock)) {
    const body = m[1];
    const grad = /<gradientFill([^>]*)>([\s\S]*?)<\/gradientFill>/.exec(body);
    if (grad) {
      const stops = [];
      const stopRe = /<stop\s+position="([^"]*)"[^>]*>(?:<color[^>]*rgb="([^"]*)")?/g;
      let sm;
      while (sm = stopRe.exec(grad[2])) stops.push({ pos: Number(sm[1]) || 0, color: fromArgb(sm[2]) ?? "#ffffff" });
      const degStr = /degree="([^"]*)"/.exec(grad[1])?.[1];
      fills.push({ fill: { type: "gradient", kind: "linear", degree: degStr ? Number(degStr) : 0, stops } });
      continue;
    }
    const ptMatch = /patternType="([^"]*)"/.exec(body)?.[1];
    const fg = /<fgColor[^>]*rgb="([^"]*)"/.exec(body)?.[1];
    const bg = /<bgColor[^>]*rgb="([^"]*)"/.exec(body)?.[1];
    if (ptMatch === "solid") {
      const c = fromArgb(fg);
      fills.push(c ? { backColor: c } : void 0);
    } else if (ptMatch && ptMatch !== "none" && PATTERN_FROM_XLSX[ptMatch]) {
      fills.push({ fill: { type: "pattern", pattern: PATTERN_FROM_XLSX[ptMatch], fgColor: fromArgb(fg) ?? "#000000", bgColor: fromArgb(bg) ?? "#ffffff" } });
    } else {
      fills.push(void 0);
    }
  }
  const borders = [];
  const bordersBlock = /<borders[^>]*>([\s\S]*?)<\/borders>/.exec(xml)?.[1] ?? "";
  const borderRe = /<border[^>]*>([\s\S]*?)<\/border>/g;
  while (m = borderRe.exec(bordersBlock)) {
    borders.push(parseBorderXml(m[1]));
  }
  const xf = [];
  const xfsBlock = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml)?.[1] ?? "";
  const xfRe = /<xf\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/xf>)/g;
  while (m = xfRe.exec(xfsBlock)) {
    const attrs = m[1];
    const inner = m[2] ?? "";
    const st = {};
    const fontId = Number(attr(attrs, "fontId") ?? "0");
    const fillId = Number(attr(attrs, "fillId") ?? "0");
    const borderId = Number(attr(attrs, "borderId") ?? "0");
    const numFmtId = Number(attr(attrs, "numFmtId") ?? "0");
    if (fontId && fonts[fontId]) Object.assign(st, fonts[fontId]);
    if (fillId && fills[fillId]) {
      const fdesc = fills[fillId];
      if (fdesc.backColor) st.backColor = fdesc.backColor;
      else if (fdesc.fill) st.fill = fdesc.fill;
    }
    if (borderId && borders[borderId]) st.borders = borders[borderId];
    const customFmt = numFmtById.get(numFmtId);
    if (numFmtId && customFmt) st.formatter = customFmt;
    else if (numFmtId && BUILTIN_NUMFMT[numFmtId]) st.formatter = BUILTIN_NUMFMT[numFmtId];
    const al = /<alignment\s+([^/>]*)\/>/.exec(inner)?.[1];
    if (al) {
      const h = attr(al, "horizontal");
      const v = attr(al, "vertical");
      if (h && H_FROM_XLSX[h]) st.hAlign = H_FROM_XLSX[h];
      if (v && V_FROM_XLSX[v]) st.vAlign = V_FROM_XLSX[v];
      if (attr(al, "wrapText") === "1") st.wordWrap = true;
      const tr = attr(al, "textRotation");
      if (tr !== void 0) {
        const r = Number(tr);
        if (Number.isFinite(r) && r !== 0) st.textRotation = r > 90 ? 90 - r : r;
      }
      const ind = attr(al, "indent");
      if (ind !== void 0) {
        const n = Number(ind);
        if (Number.isFinite(n) && n > 0) st.indent = n;
      }
      if (attr(al, "shrinkToFit") === "1") st.shrinkToFit = true;
    }
    if (/<protection[^>]*locked="0"/.test(inner)) st.locked = false;
    xf.push(st);
  }
  if (!xf.length) xf.push({});
  return { xf };
}
function parseBorderXml(inner) {
  const b = {};
  let any = false;
  for (const side of ["left", "right", "top", "bottom"]) {
    const re = new RegExp(`<${side}\\s+style="([^"]*)"[^>]*>(?:<color[^>]*rgb="([^"]*)")?`);
    const mm = re.exec(inner);
    if (mm && mm[1]) {
      b[side] = { style: BORDER_FROM_XLSX[mm[1]] ?? "thin", color: fromArgb(mm[2]) ?? "#000" };
      any = true;
    }
  }
  const dm = /<diagonal\s+style="([^"]*)"[^>]*>(?:<color[^>]*rgb="([^"]*)")?/.exec(inner);
  if (dm && dm[1]) {
    const edge = { style: BORDER_FROM_XLSX[dm[1]] ?? "thin", color: fromArgb(dm[2]) ?? "#000" };
    if (/diagonalUp="1"/.test(inner)) {
      b.diagonalUp = edge;
      any = true;
    }
    if (/diagonalDown="1"/.test(inner)) {
      b.diagonalDown = edge;
      any = true;
    }
    if (!/diagonalUp="1"|diagonalDown="1"/.test(inner)) {
      b.diagonalDown = edge;
      any = true;
    }
  }
  return any ? b : void 0;
}
var BUILTIN_NUMFMT = {
  1: "0",
  2: "0.00",
  3: "#,##0",
  4: "#,##0.00",
  9: "0%",
  10: "0.00%",
  44: "#,##0.00",
  // 44
  164: "#,##0.00"
};
function levelsToGroups(levels, collapsed, summaryAfter) {
  if (!levels.length) return [];
  const levelOf = new Map(levels);
  const maxLevel = Math.max(...levels.map(([, l]) => l));
  const maxIdx = Math.max(...levels.map(([i]) => i));
  const collapsedSet = new Set(collapsed);
  const out = [];
  for (let lvl = 1; lvl <= maxLevel; lvl++) {
    let start = null;
    for (let i = 0; i <= maxIdx + 1; i++) {
      const here = (levelOf.get(i) ?? 0) >= lvl;
      if (here && start === null) start = i;
      else if (!here && start !== null) {
        const gStart = summaryAfter ? start : start - 1;
        const gCount = i - start + 1;
        let isCollapsed = false;
        for (let x = gStart; x < gStart + gCount; x++) if (collapsedSet.has(x)) isCollapsed = true;
        const g = { start: gStart, count: gCount };
        if (isCollapsed) g.collapsed = true;
        out.push(g);
        start = null;
      }
    }
  }
  out.sort((a, b) => a.start - b.start || a.count - b.count);
  return out;
}
function chartTypeFromXml(chartXml2) {
  if (/<c:barChart>/.test(chartXml2)) {
    if (/<c:lineChart>/.test(chartXml2)) return "combo";
    return /<c:barDir\s+val="bar"/.test(chartXml2) ? "bar" : "column";
  }
  if (/<c:lineChart>/.test(chartXml2)) return "line";
  if (/<c:areaChart>/.test(chartXml2)) return "area";
  if (/<c:doughnutChart>/.test(chartXml2)) return "doughnut";
  if (/<c:pieChart>/.test(chartXml2)) return "pie";
  if (/<c:radarChart>/.test(chartXml2)) return "radar";
  if (/<c:stockChart>/.test(chartXml2)) return "stock";
  if (/<c:scatterChart>/.test(chartXml2)) return "scatter";
  return "column";
}
function dataRangeFromChartXml(chartXml2) {
  const fRe = /<c:f>([^<]*)<\/c:f>/g;
  let m;
  let minR = Infinity, minC = Infinity, maxR = -Infinity, maxC = -Infinity;
  while (m = fRe.exec(chartXml2)) {
    const ref = m[1].replace(/^[^!]*!/, "").replace(/\$/g, "");
    for (const part of ref.split(":")) {
      const coord = parseAddr(part.trim());
      if (!coord) continue;
      minR = Math.min(minR, coord.row);
      maxR = Math.max(maxR, coord.row);
      minC = Math.min(minC, coord.col);
      maxC = Math.max(maxC, coord.col);
    }
  }
  if (!Number.isFinite(minR)) return null;
  return { row: minR, col: minC, rowCount: maxR - minR + 1, colCount: maxC - minC + 1 };
}
function parseSheetCharts(sheetXml, sheetPath, get) {
  const drawM = /<drawing\s+[^>]*r:id="([^"]*)"/.exec(sheetXml);
  if (!drawM) return [];
  const drawRid = drawM[1];
  const wsRelsPath = sheetPath.replace(/\/([^/]+)$/, "/_rels/$1.rels");
  const wsRels = get(wsRelsPath);
  if (!wsRels) return [];
  const drawTarget = relTargetById(wsRels, drawRid);
  if (!drawTarget) return [];
  const drawPath = resolveRelPath(sheetPath, drawTarget);
  const drawingXml2 = get(drawPath);
  if (!drawingXml2) return [];
  const drawRelsPath = drawPath.replace(/\/([^/]+)$/, "/_rels/$1.rels");
  const drawRels = get(drawRelsPath) ?? "";
  const out = [];
  const anchorRe = /<xdr:twoCellAnchor>([\s\S]*?)<\/xdr:twoCellAnchor>/g;
  let am;
  let idx = 0;
  while (am = anchorRe.exec(drawingXml2)) {
    const body = am[1];
    const fromCol = Number(/<xdr:from>[\s\S]*?<xdr:col>(\d+)<\/xdr:col>/.exec(body)?.[1] ?? "0");
    const fromRow = Number(/<xdr:from>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/.exec(body)?.[1] ?? "0");
    const toCol = Number(/<xdr:to>[\s\S]*?<xdr:col>(\d+)<\/xdr:col>/.exec(body)?.[1] ?? "0");
    const toRow = Number(/<xdr:to>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/.exec(body)?.[1] ?? "0");
    const chartRid = /<c:chart\s+[^>]*r:id="([^"]*)"/.exec(body)?.[1];
    if (!chartRid) {
      idx++;
      continue;
    }
    const chartTarget = relTargetById(drawRels, chartRid);
    if (!chartTarget) {
      idx++;
      continue;
    }
    const chartPath = resolveRelPath(drawPath, chartTarget);
    const chartXml2 = get(chartPath);
    if (!chartXml2) {
      idx++;
      continue;
    }
    const chartType = chartTypeFromXml(chartXml2);
    const dataRange = dataRangeFromChartXml(chartXml2);
    if (!dataRange) {
      idx++;
      continue;
    }
    const titleM = /<c:title>[\s\S]*?<a:t>([^<]*)<\/a:t>/.exec(chartXml2);
    const legend = /<c:legend>/.test(chartXml2);
    const chart = {
      chartType,
      dataRange,
      firstRowHeader: true,
      firstColHeader: true
    };
    if (titleM) chart.title = unesc(titleM[1]);
    if (legend) chart.options = { legend: true };
    out.push({
      id: `chart-import-${idx}`,
      kind: "chart",
      anchor: { fromRow, fromCol, toRow, toCol },
      chart
    });
    idx++;
  }
  return out;
}
function relTargetById(relsXml, id) {
  const re = /<Relationship\s+([^>]*?)\/>/g;
  let m;
  while (m = re.exec(relsXml)) {
    if (attr(m[1], "Id") === id) return attr(m[1], "Target");
  }
  return void 0;
}
function resolveRelPath(baseFile, relTarget) {
  if (relTarget.startsWith("/")) return relTarget.replace(/^\//, "");
  const baseDir = baseFile.replace(/\/[^/]+$/, "");
  const parts = (baseDir + "/" + relTarget).split("/");
  const stack = [];
  for (const p of parts) {
    if (p === "..") stack.pop();
    else if (p !== "." && p !== "") stack.push(p);
  }
  return stack.join("/");
}
function parseSheetXml(xml, name, sst, styles) {
  const cells = [];
  let maxRow = 0;
  let maxCol = 0;
  const rowHeights = [];
  const hiddenRows = [];
  const rowLevels = [];
  const rowCollapsed = [];
  const sheetData = /<sheetData>([\s\S]*?)<\/sheetData>/.exec(xml)?.[1] ?? "";
  const rowRe = /<row\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
  let rm;
  while (rm = rowRe.exec(sheetData)) {
    const rAttrs = rm[1];
    const rIdx = Number(attr(rAttrs, "r") ?? "0") - 1;
    if (rIdx < 0) continue;
    maxRow = Math.max(maxRow, rIdx);
    const ht = attr(rAttrs, "ht");
    if (ht !== void 0 && attr(rAttrs, "customHeight") === "1") rowHeights.push([rIdx, Number(ht)]);
    if (attr(rAttrs, "hidden") === "1") hiddenRows.push(rIdx);
    const rLevel = Number(attr(rAttrs, "outlineLevel") ?? "0");
    if (rLevel > 0) rowLevels.push([rIdx, rLevel]);
    if (attr(rAttrs, "collapsed") === "1") rowCollapsed.push(rIdx);
    const rowInner = rm[2] ?? "";
    const cRe = /<c\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cm;
    while (cm = cRe.exec(rowInner)) {
      const cAttrs = cm[1];
      const cInner = cm[2] ?? "";
      const ref = attr(cAttrs, "r");
      if (!ref) continue;
      const coord = parseAddr(ref);
      if (!coord) continue;
      maxCol = Math.max(maxCol, coord.col);
      const t = attr(cAttrs, "t");
      const sIdx = Number(attr(cAttrs, "s") ?? "0");
      const cell = { r: coord.row, c: coord.col };
      const fMatch = /<f[^>]*>([\s\S]*?)<\/f>/.exec(cInner);
      if (fMatch) cell.f = sanitizeImportedFormula(unesc(fMatch[1]));
      const vMatch = /<v>([\s\S]*?)<\/v>/.exec(cInner);
      const isMatch = /<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>[\s\S]*?<\/is>/.exec(cInner);
      if (isMatch) {
        cell.v = unesc(isMatch[1]);
      } else if (vMatch) {
        const raw = vMatch[1];
        if (t === "s") cell.v = sst[Number(raw)] ?? "";
        else if (t === "b") cell.v = raw === "1";
        else if (t === "str") cell.v = unesc(raw);
        else cell.v = raw === "" ? null : Number(raw);
      }
      const st = styles.xf[sIdx];
      if (st && Object.keys(st).length) cell.s = { ...st };
      if (cell.v !== void 0 || cell.f !== void 0 || cell.s !== void 0) cells.push(cell);
    }
  }
  const colWidths = [];
  const hiddenCols = [];
  const colLevels = [];
  const colCollapsed = [];
  const colsBlock = /<cols>([\s\S]*?)<\/cols>/.exec(xml)?.[1] ?? "";
  const colRe = /<col\s+([^/>]*)\/>/g;
  let colm;
  while (colm = colRe.exec(colsBlock)) {
    const a = colm[1];
    const min = Number(attr(a, "min") ?? "1") - 1;
    const max = Number(attr(a, "max") ?? "1") - 1;
    const width = attr(a, "width");
    const hidden = attr(a, "hidden") === "1";
    const level = Number(attr(a, "outlineLevel") ?? "0");
    const collapsed = attr(a, "collapsed") === "1";
    for (let c = min; c <= max && c >= 0; c++) {
      if (width !== void 0 && attr(a, "customWidth") === "1") colWidths.push([c, Math.round(Number(width) * 7)]);
      if (hidden) hiddenCols.push(c);
      if (level > 0) colLevels.push([c, level]);
      if (collapsed) colCollapsed.push(c);
      maxCol = Math.max(maxCol, c);
    }
  }
  const spans = [];
  const mergeBlock = /<mergeCells[^>]*>([\s\S]*?)<\/mergeCells>/.exec(xml)?.[1] ?? "";
  const mergeRe = /<mergeCell\s+ref="([^"]*)"/g;
  let mm;
  while (mm = mergeRe.exec(mergeBlock)) {
    const [a, b] = mm[1].split(":");
    const ca = parseAddr(a);
    const cb = parseAddr(b ?? a);
    if (ca && cb) {
      spans.push({
        row: Math.min(ca.row, cb.row),
        col: Math.min(ca.col, cb.col),
        rowCount: Math.abs(cb.row - ca.row) + 1,
        colCount: Math.abs(cb.col - ca.col) + 1
      });
      maxRow = Math.max(maxRow, ca.row, cb.row);
      maxCol = Math.max(maxCol, ca.col, cb.col);
    }
  }
  const dim = /<dimension\s+ref="([^"]*)"/.exec(xml)?.[1];
  if (dim) {
    const parts = dim.split(":");
    const end = parseAddr(parts[1] ?? parts[0]);
    if (end) {
      maxRow = Math.max(maxRow, end.row);
      maxCol = Math.max(maxCol, end.col);
    }
  }
  const snap = {
    name,
    rowCount: Math.max(1, maxRow + 1),
    colCount: Math.max(1, maxCol + 1),
    cells: cells.sort((a, b) => a.r - b.r || a.c - b.c)
  };
  if (spans.length) snap.spans = spans;
  if (rowHeights.length) snap.rowHeights = rowHeights;
  if (colWidths.length) snap.colWidths = colWidths;
  if (hiddenRows.length) snap.hiddenRows = hiddenRows;
  if (hiddenCols.length) snap.hiddenCols = hiddenCols;
  const paneM = /<pane\s+([^>]*?)\/>/.exec(xml);
  if (paneM) {
    const x = Number(attr(paneM[1], "xSplit") ?? "0");
    const y = Number(attr(paneM[1], "ySplit") ?? "0");
    if (x > 0) snap.frozenColCount = x;
    if (y > 0) snap.frozenRowCount = y;
  }
  const afM = /<autoFilter\s+ref="([^"]*)"/.exec(xml);
  if (afM) {
    const [a, b] = afM[1].split(":");
    const ca = parseAddr(a), cb = parseAddr(b ?? a);
    if (ca && cb) snap.autoFilter = { range: { row: ca.row, col: ca.col, rowCount: cb.row - ca.row + 1, colCount: cb.col - ca.col + 1 }, criteria: [] };
  }
  const prot = /<sheetProtection\s+([^/>]*)\/?>/.exec(xml);
  if (prot && /sheet="1"/.test(prot[1])) {
    snap.protection = {
      enabled: true,
      allowSort: /sort="0"/.test(prot[1]),
      allowFilter: /autoFilter="0"/.test(prot[1]),
      allowFormatCells: /formatCells="0"/.test(prot[1])
    };
  }
  const dvs = parseDataValidations(xml);
  if (dvs.length) snap.validations = dvs;
  const ps = parsePageSetup(xml);
  if (ps) snap.pageSetup = ps;
  const opM = /<outlinePr\s+([^>]*?)\/?>/.exec(xml);
  const summaryBelow = opM ? attr(opM[1], "summaryBelow") !== "0" : true;
  const summaryRight = opM ? attr(opM[1], "summaryRight") !== "0" : true;
  const rowGroups = levelsToGroups(rowLevels, rowCollapsed, summaryBelow);
  const colGroups = levelsToGroups(colLevels, colCollapsed, summaryRight);
  if (rowGroups.length) snap.rowOutlines = rowGroups;
  if (colGroups.length) snap.colOutlines = colGroups;
  if (!summaryBelow) snap.summaryBelow = false;
  if (!summaryRight) snap.summaryRight = false;
  const sparklines = [];
  const sgRe = /<x14:sparklineGroup\b([^>]*)>([\s\S]*?)<\/x14:sparklineGroup>/g;
  let sg;
  while (sg = sgRe.exec(xml)) {
    const gAttrs = sg[1];
    const gInner = sg[2];
    const rawType = attr(gAttrs, "type");
    const type = rawType === "column" ? "column" : rawType === "stacked" ? "winloss" : "line";
    const markers = attr(gAttrs, "markers") === "1";
    const spRe = /<x14:sparkline>([\s\S]*?)<\/x14:sparkline>/g;
    let sp;
    while (sp = spRe.exec(gInner)) {
      const f2 = /<xm:f>([\s\S]*?)<\/xm:f>/.exec(sp[1])?.[1];
      const sqref = /<xm:sqref>([\s\S]*?)<\/xm:sqref>/.exec(sp[1])?.[1];
      if (!f2 || !sqref) continue;
      const loc = parseAddr(sqref.trim());
      if (!loc) continue;
      const ref = f2.replace(/^[^!]*!/, "").replace(/\$/g, "");
      const [a, b] = ref.split(":");
      const ca = parseAddr(a.trim()), cb = parseAddr((b ?? a).trim());
      if (!ca || !cb) continue;
      const dataRange = {
        row: Math.min(ca.row, cb.row),
        col: Math.min(ca.col, cb.col),
        rowCount: Math.abs(cb.row - ca.row) + 1,
        colCount: Math.abs(cb.col - ca.col) + 1
      };
      const spark = { type, dataRange };
      if (markers) spark.markers = true;
      sparklines.push([loc.row, loc.col, spark]);
    }
  }
  if (sparklines.length) snap.sparklines = sparklines;
  return snap;
}
function parseDataValidations(xml) {
  const out = [];
  const re = /<dataValidation\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/dataValidation>)/g;
  const opMap = { between: "between", notBetween: "notBetween", equal: "eq", notEqual: "ne", greaterThan: "gt", lessThan: "lt", greaterThanOrEqual: "ge", lessThanOrEqual: "le" };
  let m;
  while (m = re.exec(xml)) {
    const a = m[1];
    const inner = m[2] ?? "";
    const sqref = attr(a, "sqref");
    if (!sqref) continue;
    const [c0, c1] = sqref.split(" ")[0].split(":");
    const ca = parseAddr(c0), cb = parseAddr(c1 ?? c0);
    if (!ca || !cb) continue;
    const type = attr(a, "type") ?? "custom";
    const opRaw = attr(a, "operator");
    const f1 = /<formula1>([\s\S]*?)<\/formula1>/.exec(inner)?.[1];
    const f2 = /<formula2>([\s\S]*?)<\/formula2>/.exec(inner)?.[1];
    const rule = {
      range: { row: ca.row, col: ca.col, rowCount: cb.row - ca.row + 1, colCount: cb.col - ca.col + 1 },
      type,
      allowBlank: attr(a, "allowBlank") !== "0"
    };
    if (opRaw && opMap[opRaw]) rule.operator = opMap[opRaw];
    if (type === "list" && f1) {
      const list = unesc(f1).replace(/^&quot;|&quot;$/g, "").replace(/^"|"$/g, "").split(",").map((x) => x.trim()).filter((x) => x !== "");
      if (list.length) rule.list = list;
    } else {
      if (f1 != null) rule.formula1 = numOrStr(unesc(f1));
      if (f2 != null) rule.formula2 = numOrStr(unesc(f2));
    }
    out.push(rule);
  }
  return out;
}
function numOrStr(s) {
  const n = Number(s);
  return s.trim() !== "" && Number.isFinite(n) ? n : s;
}
function parsePageSetup(xml) {
  const psM = /<pageSetup\s+([^>]*?)\/>/.exec(xml);
  const pmM = /<pageMargins\s+([^>]*?)\/>/.exec(xml);
  if (!psM && !pmM) return null;
  const paperInv = { "1": "Letter", "5": "Legal", "8": "A3", "9": "A4" };
  const ps = {};
  if (psM) {
    const a = psM[1];
    const paper = attr(a, "paperSize");
    if (paper && paperInv[paper]) ps.paperSize = paperInv[paper];
    const orient = attr(a, "orientation");
    if (orient === "landscape" || orient === "portrait") ps.orientation = orient;
    const scale = attr(a, "scale");
    if (scale) ps.scale = Number(scale);
    const fw = attr(a, "fitToWidth"), fh = attr(a, "fitToHeight");
    if (fw != null || fh != null) ps.fitToPages = { width: Number(fw ?? 1), height: Number(fh ?? 1) };
  }
  if (pmM) {
    const a = pmM[1];
    const l = Number(attr(a, "left") ?? 0.5), r = Number(attr(a, "right") ?? 0.5), t = Number(attr(a, "top") ?? 0.5), b = Number(attr(a, "bottom") ?? 0.5);
    ps.margins = { left: l * 72, right: r * 72, top: t * 72, bottom: b * 72 };
  }
  return ps;
}
function xlsxToSnapshot(bytes) {
  const files = unzipSync(bytes);
  const get = (p) => {
    const f2 = files.get(p);
    return f2 ? decodeUtf8(f2) : void 0;
  };
  const sst = parseSharedStrings(get("xl/sharedStrings.xml"));
  const styles = parseStyles(get("xl/styles.xml"));
  const workbookXml = get("xl/workbook.xml") ?? "";
  const relsXml = get("xl/_rels/workbook.xml.rels") ?? "";
  const relTarget = /* @__PURE__ */ new Map();
  const relRe = /<Relationship\s+([^>]*?)\/>/g;
  let r;
  while (r = relRe.exec(relsXml)) {
    const id = attr(r[1], "Id");
    const target = attr(r[1], "Target");
    if (id && target) relTarget.set(id, target.replace(/^\/?xl\//, "").replace(/^\//, ""));
  }
  const sheets = [];
  const sheetRe = /<sheet\s+([^/>]*)\/>/g;
  let sm;
  while (sm = sheetRe.exec(workbookXml)) {
    const a = sm[1];
    const name = unesc(attr(a, "name") ?? `Sheet${sheets.length + 1}`);
    const rid = attr(a, "r:id") ?? attr(a, "id");
    let target = rid ? relTarget.get(rid) : void 0;
    if (!target) target = `worksheets/sheet${sheets.length + 1}.xml`;
    const sheetXml = get(`xl/${target}`);
    if (sheetXml) {
      const s = parseSheetXml(sheetXml, name, sst, styles);
      const charts = parseSheetCharts(sheetXml, `xl/${target}`, get);
      if (charts.length) s.floatingObjects = [...s.floatingObjects ?? [], ...charts];
      sheets.push(s);
    }
  }
  const snap = {
    format: "cmx-megasheet",
    version: 1,
    sheets: sheets.length ? sheets : [{ name: "Sheet1", rowCount: 40, colCount: 12, cells: [] }]
  };
  const activeTab = /<workbookView[^>]*activeTab="([^"]*)"/.exec(workbookXml)?.[1];
  if (activeTab && Number(activeTab) > 0) snap.activeSheet = Number(activeTab);
  const activeIdx = snap.activeSheet ?? 0;
  const activeSheet = snap.sheets[activeIdx] ?? snap.sheets.find((s) => s.frozenRowCount || s.frozenColCount);
  if (activeSheet?.frozenRowCount) snap.frozenRowCount = activeSheet.frozenRowCount;
  if (activeSheet?.frozenColCount) snap.frozenColCount = activeSheet.frozenColCount;
  return snap;
}
function importXlsx(bytes) {
  return workbookFromJSON(xlsxToSnapshot(bytes));
}

// src/io/csv.ts
function csvCell(v, delimiter) {
  if (v === null || v === void 0) return "";
  const s = typeof v === "boolean" ? v ? "TRUE" : "FALSE" : String(v);
  if (s.indexOf(delimiter) >= 0 || /["\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}
function serializeCsv(sheet, range2, opts = {}) {
  const delimiter = opts.delimiter ?? ",";
  const eol = opts.eol ?? "\n";
  const lines = [];
  for (let r = range2.row; r < range2.row + range2.rowCount; r++) {
    const cells = [];
    for (let c = range2.col; c < range2.col + range2.colCount; c++) {
      cells.push(csvCell(sheet.getValue(r, c), delimiter));
    }
    lines.push(cells.join(delimiter));
  }
  const body = lines.join(eol);
  return opts.bom ? "\uFEFF" + body : body;
}
function parseCsv(text, opts = {}) {
  const delimiter = (opts.delimiter ?? ",")[0] ?? ",";
  let src = String(text ?? "");
  if (src.charCodeAt(0) === 65279) src = src.slice(1);
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const n = src.length;
  while (i < n) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === delimiter) {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (ch === "\r") {
      i++;
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// src/io/paginate.ts
var PAPER_SIZES = {
  A4: { w: 595, h: 842 },
  A3: { w: 842, h: 1191 },
  Letter: { w: 612, h: 792 },
  Legal: { w: 612, h: 1008 }
};
var DEFAULT_MARGIN = 36;
var PX_TO_PT = 72 / 96;
function paginate(grid, setup) {
  const s = setup ?? {};
  const paper = PAPER_SIZES[s.paperSize ?? "A4"] ?? PAPER_SIZES.A4;
  const landscape = s.orientation === "landscape";
  const paperWidth = landscape ? paper.h : paper.w;
  const paperHeight = landscape ? paper.w : paper.h;
  const m = s.margins ?? { top: DEFAULT_MARGIN, right: DEFAULT_MARGIN, bottom: DEFAULT_MARGIN, left: DEFAULT_MARGIN };
  const printableWidth = Math.max(1, paperWidth - m.left - m.right);
  const printableHeight = Math.max(1, paperHeight - m.top - m.bottom);
  const area = s.printArea ?? { row: 0, col: 0, rowCount: grid.getRowCount(), colCount: grid.getColumnCount() };
  const r0 = area.row, r1 = area.row + area.rowCount - 1;
  const c0 = area.col, c1 = area.col + area.colCount - 1;
  const titleRows = s.printTitles && s.printTitles.rowStart != null && s.printTitles.rowEnd != null ? { start: s.printTitles.rowStart, end: s.printTitles.rowEnd } : null;
  const titleCols = s.printTitles && s.printTitles.colStart != null && s.printTitles.colEnd != null ? { start: s.printTitles.colStart, end: s.printTitles.colEnd } : null;
  const rowPt = (r) => grid.getRowHeight(r) * PX_TO_PT;
  const colPt = (c) => grid.getColumnWidth(c) * PX_TO_PT;
  let totalW = 0;
  for (let c = c0; c <= c1; c++) totalW += colPt(c);
  let totalH = 0;
  for (let r = r0; r <= r1; r++) totalH += rowPt(r);
  let scale = (s.scale ?? 100) / 100;
  if (s.fitToPages) {
    const fw = s.fitToPages.width, fh = s.fitToPages.height;
    const scaleW = fw > 0 ? printableWidth * fw / (totalW || 1) : Infinity;
    const scaleH = fh > 0 ? printableHeight * fh / (totalH || 1) : Infinity;
    scale = Math.min(scaleW, scaleH);
    if (!Number.isFinite(scale)) scale = 1;
    scale = Math.min(1, scale);
  }
  const titleRowsH = titleRows ? sumRange(titleRows.start, titleRows.end, rowPt) * scale : 0;
  const titleColsW = titleCols ? sumRange(titleCols.start, titleCols.end, colPt) * scale : 0;
  const bodyW = Math.max(1, printableWidth - titleColsW);
  const bodyH = Math.max(1, printableHeight - titleRowsH);
  const colSegs = splitAxis(c0, c1, (c) => colPt(c) * scale, bodyW, titleCols);
  const rowSegs = splitAxis(r0, r1, (r) => rowPt(r) * scale, bodyH, titleRows);
  const pages = [];
  let idx = 0;
  for (let pr = 0; pr < rowSegs.length; pr++) {
    for (let pc = 0; pc < colSegs.length; pc++) {
      pages.push({
        rowStart: rowSegs[pr].start,
        rowEnd: rowSegs[pr].end,
        colStart: colSegs[pc].start,
        colEnd: colSegs[pc].end,
        pageIndex: idx++,
        pageRow: pr,
        pageCol: pc
      });
    }
  }
  if (pages.length === 0) {
    pages.push({ rowStart: r0, rowEnd: r0, colStart: c0, colEnd: c0, pageIndex: 0, pageRow: 0, pageCol: 0 });
  }
  return {
    pages,
    scale,
    printableWidth,
    printableHeight,
    paperWidth,
    paperHeight,
    titleRows,
    titleCols,
    pagesWide: colSegs.length || 1,
    pagesTall: rowSegs.length || 1
  };
}
function sumRange(a, b, size) {
  let s = 0;
  for (let i = a; i <= b; i++) s += size(i);
  return s;
}
function splitAxis(start, end, sizePt, avail, titles) {
  const inTitle = (i) => titles != null && i >= titles.start && i <= titles.end;
  let bodyStart = start;
  while (bodyStart <= end && inTitle(bodyStart)) bodyStart++;
  if (bodyStart > end) return [{ start: bodyStart > end ? end : bodyStart, end }];
  const segs = [];
  let segStart = bodyStart;
  let acc = 0;
  const EPS = 0.5;
  for (let i = bodyStart; i <= end; i++) {
    if (inTitle(i)) continue;
    const sz = sizePt(i);
    if (acc > 0 && acc + sz > avail + EPS) {
      segs.push({ start: segStart, end: i - 1 });
      segStart = i;
      acc = 0;
    }
    acc += sz;
  }
  if (segStart <= end) segs.push({ start: segStart, end });
  return segs.length ? segs : [{ start: bodyStart, end }];
}

// src/io/exportHtml.ts
function exportHtml(sheet, opts = {}) {
  const g = opts.range ?? { row: 0, col: 0, rowCount: sheet.getRowCount(), colCount: sheet.getColumnCount() };
  const gridlines = opts.gridlines !== false;
  const overlays = evaluateRules(sheet, sheet.listConditionalRules());
  const rows = [];
  const cols = [];
  for (let c = g.col; c < g.col + g.colCount; c++) cols.push(`<col style="width:${Math.round(sheet.getColumnWidth(c))}px">`);
  for (let r = g.row; r < g.row + g.rowCount; r++) {
    const cells = [];
    const h = Math.round(sheet.getRowHeight(r));
    for (let c = g.col; c < g.col + g.colCount; c++) {
      const span = sheet.getSpan(r, c);
      if (span && (span.row !== r || span.col !== c)) continue;
      cells.push(cellHtml(sheet, r, c, span, overlays.get(`${r},${c}`)));
    }
    rows.push(`<tr style="height:${h}px">${cells.join("")}</tr>`);
  }
  const borderCss = gridlines ? "border-collapse:collapse;" : "";
  const table = `<table style="${borderCss}font-family:Arial,sans-serif;font-size:13px"><colgroup>${cols.join("")}</colgroup><tbody>${rows.join("")}</tbody></table>`;
  if (!opts.fullDocument) return table;
  const title = escapeHtml(opts.title ?? sheet.name());
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head><body>${table}</body></html>`;
}
function cellHtml(sheet, r, c, span, overlay) {
  let style = sheet.getResolvedStyle(r, c);
  if (overlay?.style) style = { ...style, ...overlay.style };
  const value = sheet.getValue(r, c);
  const { text, color } = formatCell(value, style.formatter);
  const css = [];
  if (style.bold) css.push("font-weight:bold");
  if (style.italic) css.push("font-style:italic");
  if (style.underline) css.push("text-decoration:underline");
  if (style.hAlign) css.push(`text-align:${style.hAlign}`);
  if (style.vAlign) css.push(`vertical-align:${style.vAlign === "middle" ? "middle" : style.vAlign}`);
  const bg = overlay?.fill ?? style.backColor;
  if (bg) css.push(`background-color:${bg}`);
  const fg = color ?? style.foreColor;
  if (fg) css.push(`color:${fg}`);
  if (style.fontSize) css.push(`font-size:${style.fontSize}px`);
  if (style.borders) {
    for (const side of ["top", "right", "bottom", "left"]) {
      const b = style.borders[side];
      if (b) css.push(`border-${side}:1px solid ${b.color ?? "#000"}`);
    }
  } else {
    css.push("border:1px solid #d0d4da");
  }
  const attrs = [];
  if (span && span.rowCount > 1) attrs.push(`rowspan="${span.rowCount}"`);
  if (span && span.colCount > 1) attrs.push(`colspan="${span.colCount}"`);
  const attrStr = attrs.length ? " " + attrs.join(" ") : "";
  return `<td${attrStr} style="${css.join(";")};padding:1px 4px">${escapeHtml(text)}</td>`;
}
function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// src/io/pdf.ts
var PdfPage = class {
  constructor(width, height) {
    this.width = width;
    this.height = height;
  }
  /** 内容流指令（PDF 操作符）。 */
  ops = [];
  /** 填充矩形。color=十六进制或 rgb。 */
  fillRect(x, y, w, h, color) {
    const [r, g, b] = parseColor(color);
    this.ops.push(`${r} ${g} ${b} rg`);
    this.ops.push(`${f(x)} ${f(this.height - y - h)} ${f(w)} ${f(h)} re f`);
  }
  /** 描边线。 */
  line(x1, y1, x2, y2, color = "#000", width = 0.5) {
    const [r, g, b] = parseColor(color);
    this.ops.push(`${r} ${g} ${b} RG ${f(width)} w`);
    this.ops.push(`${f(x1)} ${f(this.height - y1)} m ${f(x2)} ${f(this.height - y2)} l S`);
  }
  /** 描边矩形。 */
  strokeRect(x, y, w, h, color = "#000", width = 0.5) {
    const [r, g, b] = parseColor(color);
    this.ops.push(`${r} ${g} ${b} RG ${f(width)} w`);
    this.ops.push(`${f(x)} ${f(this.height - y - h)} ${f(w)} ${f(h)} re S`);
  }
  /** 文本（Helvetica，size pt，左基线在 (x, y+size)）。align: left/center/right 相对 x..x+w。 */
  text(str, x, y, size, color = "#000", opts) {
    if (str === "") return;
    const [r, g, b] = parseColor(color);
    const font = opts?.bold ? "F2" : "F1";
    let tx = x;
    if (opts?.w != null && opts.align && opts.align !== "left") {
      const tw = textWidth(str, size);
      tx = opts.align === "center" ? x + (opts.w - tw) / 2 : x + opts.w - tw;
    }
    const baselineY = this.height - (y + size * 0.8);
    this.ops.push(`BT /${font} ${f(size)} Tf ${r} ${g} ${b} rg ${f(tx)} ${f(baselineY)} Td (${escapePdfText(str)}) Tj ET`);
  }
  /** 裁剪矩形（后续绘制限制在内）。 */
  clip(x, y, w, h) {
    this.ops.push(`q ${f(x)} ${f(this.height - y - h)} ${f(w)} ${f(h)} re W n`);
  }
  endClip() {
    this.ops.push("Q");
  }
  _content() {
    return this.ops.join("\n");
  }
};
function buildPdf(pages) {
  const objects = [];
  const pageObjStart = 5;
  const pageIds = [];
  const contentIds = [];
  for (let i = 0; i < pages.length; i++) {
    pageIds.push(pageObjStart + i * 2);
    contentIds.push(pageObjStart + i * 2 + 1);
  }
  objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`;
  objects[4] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>`;
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const content = p._content();
    objects[pageIds[i]] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(p.width)} ${f(p.height)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentIds[i]} 0 R >>`;
    objects[contentIds[i]] = `<< /Length ${byteLen(content)} >>
stream
${content}
endstream`;
  }
  const enc = new TextEncoder();
  const chunks = [];
  let offset = 0;
  const push = (s) => {
    const b = enc.encode(s);
    chunks.push(b);
    offset += b.length;
  };
  const xref = [];
  push(`%PDF-1.4
%\xFF\xFF\xFF\xFF
`);
  const maxId = pageObjStart + pages.length * 2 - 1;
  for (let id = 1; id <= maxId; id++) {
    xref[id] = offset;
    push(`${id} 0 obj
${objects[id]}
endobj
`);
  }
  const xrefStart = offset;
  const count = maxId + 1;
  push(`xref
0 ${count}
`);
  push(`0000000000 65535 f 
`);
  for (let id = 1; id <= maxId; id++) {
    push(`${String(xref[id] ?? 0).padStart(10, "0")} 00000 n 
`);
  }
  push(`trailer
<< /Size ${count} /Root 1 0 R >>
startxref
${xrefStart}
%%EOF
`);
  const total = chunks.reduce((n, b) => n + b.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const b of chunks) {
    out.set(b, o);
    o += b.length;
  }
  return out;
}
function f(n) {
  return (Math.round(n * 1e3) / 1e3).toString();
}
function byteLen(s) {
  return new TextEncoder().encode(s).length;
}
function textWidth(str, size) {
  let w = 0;
  for (const ch of str) w += ch.charCodeAt(0) > 11904 ? 1 : 0.5;
  return w * size;
}
function escapePdfText(str) {
  let out = "";
  for (const ch of str) {
    const code = ch.charCodeAt(0);
    if (ch === "(" || ch === ")" || ch === "\\") out += "\\" + ch;
    else if (code < 128) out += ch;
    else out += "?";
  }
  return out;
}
function parseColor(color) {
  const c = color.trim();
  if (c.startsWith("#")) {
    const h = c.slice(1);
    const full = h.length === 3 ? h.split("").map((x) => x + x).join("") : h;
    return [hx(full, 0), hx(full, 2), hx(full, 4)];
  }
  const m = /rgba?\(([^)]+)\)/.exec(c);
  if (m) {
    const parts = m[1].split(",").map((x) => parseFloat(x));
    return [(parts[0] ?? 0) / 255, (parts[1] ?? 0) / 255, (parts[2] ?? 0) / 255];
  }
  return [0, 0, 0];
}
function hx(full, i) {
  return (parseInt(full.slice(i, i + 2), 16) || 0) / 255;
}

// src/io/exportPdf.ts
var PX_TO_PT2 = 72 / 96;
function exportPdf(sheet) {
  const setup = sheet.getPageSetup();
  const grid = {
    getRowHeight: (r) => sheet.getRowHeight(r),
    getColumnWidth: (c) => sheet.getColumnWidth(c),
    getRowCount: () => sheet.getRowCount(),
    getColumnCount: () => sheet.getColumnCount()
  };
  const pg = paginate(grid, setup);
  const overlays = evaluateRules(sheet, sheet.listConditionalRules());
  const showGrid = setup?.showGridlines !== false;
  const m = setup?.margins ?? { top: 36, right: 36, bottom: 36, left: 36 };
  const pages = [];
  for (const desc of pg.pages) {
    const page = new PdfPage(pg.paperWidth, pg.paperHeight);
    if (setup?.header) page.text(expandHeaderFooter(setup.header, desc.pageIndex + 1, pg.pages.length), m.left, m.top / 2, 9, "#666", { w: pg.printableWidth, align: "center" });
    if (setup?.footer) page.text(expandHeaderFooter(setup.footer, desc.pageIndex + 1, pg.pages.length), m.left, pg.paperHeight - m.bottom / 2 - 9, 9, "#666", { w: pg.printableWidth, align: "center" });
    let originX = m.left;
    let originY = m.top;
    const titleCols = pg.titleCols;
    const titleRows = pg.titleRows;
    const scale = pg.scale;
    let x = originX;
    const drawCellAt = (r, c, px, py) => {
      const w = sheet.getColumnWidth(c) * PX_TO_PT2 * scale;
      const h = sheet.getRowHeight(r) * PX_TO_PT2 * scale;
      let style = sheet.getResolvedStyle(r, c);
      const ov = overlays.get(`${r},${c}`);
      if (ov?.style) style = { ...style, ...ov.style };
      const bg = ov?.fill ?? style.backColor;
      if (bg) page.fillRect(px, py, w, h, bg);
      if (showGrid) page.strokeRect(px, py, w, h, "#d0d4da", 0.4);
      const { text, color } = formatCell(sheet.getValue(r, c), style.formatter);
      if (text) {
        const align = style.hAlign === "right" ? "right" : style.hAlign === "center" ? "center" : "left";
        page.text(text, px + 1, py + 1, Math.max(6, (style.fontSize ?? 11) * scale), color ?? style.foreColor ?? "#000", { w: w - 2, align, ...style.bold ? { bold: true } : {} });
      }
      return { w, h };
    };
    const titleColW = titleCols ? sumColsPt(sheet, titleCols.start, titleCols.end) * scale : 0;
    const titleRowH = titleRows ? sumRowsPt(sheet, titleRows.start, titleRows.end) * scale : 0;
    if (titleRows && titleCols) {
      let ty = originY;
      for (let r = titleRows.start; r <= titleRows.end; r++) {
        let tx = originX;
        for (let c = titleCols.start; c <= titleCols.end; c++) {
          const { w } = drawCellAt(r, c, tx, ty);
          tx += w;
        }
        ty += sheet.getRowHeight(r) * PX_TO_PT2 * scale;
      }
    }
    if (titleRows) {
      let ty = originY;
      for (let r = titleRows.start; r <= titleRows.end; r++) {
        let tx = originX + titleColW;
        for (let c = desc.colStart; c <= desc.colEnd; c++) {
          const { w } = drawCellAt(r, c, tx, ty);
          tx += w;
        }
        ty += sheet.getRowHeight(r) * PX_TO_PT2 * scale;
      }
    }
    if (titleCols) {
      let ty = originY + titleRowH;
      for (let r = desc.rowStart; r <= desc.rowEnd; r++) {
        let tx = originX;
        for (let c = titleCols.start; c <= titleCols.end; c++) {
          const { w } = drawCellAt(r, c, tx, ty);
          tx += w;
        }
        ty += sheet.getRowHeight(r) * PX_TO_PT2 * scale;
      }
    }
    let by = originY + titleRowH;
    for (let r = desc.rowStart; r <= desc.rowEnd; r++) {
      let bx = originX + titleColW;
      for (let c = desc.colStart; c <= desc.colEnd; c++) {
        const { w } = drawCellAt(r, c, bx, by);
        bx += w;
      }
      by += sheet.getRowHeight(r) * PX_TO_PT2 * scale;
    }
    void x;
    void originX;
    void originY;
    pages.push(page);
  }
  return buildPdf(pages);
}
function sumColsPt(sheet, a, b) {
  let s = 0;
  for (let c = a; c <= b; c++) s += sheet.getColumnWidth(c) * PX_TO_PT2;
  return s;
}
function sumRowsPt(sheet, a, b) {
  let s = 0;
  for (let r = a; r <= b; r++) s += sheet.getRowHeight(r) * PX_TO_PT2;
  return s;
}
function expandHeaderFooter(tmpl, page, total) {
  return tmpl.replace(/&P/g, String(page)).replace(/&N/g, String(total)).replace(/&D/g, "");
}
function computePages(sheet) {
  return paginate({
    getRowHeight: (r) => sheet.getRowHeight(r),
    getColumnWidth: (c) => sheet.getColumnWidth(c),
    getRowCount: () => sheet.getRowCount(),
    getColumnCount: () => sheet.getColumnCount()
  }, sheet.getPageSetup());
}

// src/element/cmx-megasheet.ts
var SHADOW_CSS = `
:host{display:block;min-height:200px}
.cmx-root{
  --cmx-strip:#f4f5f8; --cmx-field:#ffffff; --cmx-fore:#3a3f45; --cmx-dim:#8a9098;
  --cmx-line:#c8ccd2; --cmx-accent:#0a6ed1; --cmx-active-bg:#ffffff;
  display:flex; flex-direction:column; width:100%; height:100%; min-height:200px;
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;
}
.cmx-root.cmx-dark{
  --cmx-strip:#1a1d22; --cmx-field:#22262c; --cmx-fore:#c8ccd2; --cmx-dim:#7a828c;
  --cmx-line:#3a3f45; --cmx-accent:#2ea8c8; --cmx-active-bg:#1e2228;
}
/* \u516C\u5F0F\u680F\uFF1A\u8FB9\u8DDD 0\uFF0C\u5750\u6807\u533A + [\u2715 \u2713 fx] \u6309\u94AE\u7EC4 + fx \u8F93\u5165\uFF0C\u4E0E\u753B\u5E03\u9F50\u8FB9 */
.cmx-formulabar{flex:0 0 auto;display:flex;align-items:stretch;gap:0;padding:0;
  border-bottom:1px solid var(--cmx-line);background:var(--cmx-strip);box-sizing:border-box;height:30px}
.cmx-formulabar.cmx-hidden{display:none}
.cmx-addr{width:96px;flex:0 0 auto;display:flex;align-items:center;justify-content:center;
  border-right:1px solid var(--cmx-line);background:var(--cmx-field);color:var(--cmx-fore);
  font:12px 'SFMono-Regular',Consolas,Menlo,monospace;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;padding:0 6px}
/* \u2715 \u2713 fx \u4E09\u6309\u94AE\u7EC4 */
.cmx-fxbtns{flex:0 0 auto;display:flex;align-items:stretch;border-right:1px solid var(--cmx-line)}
.cmx-fxbtn{width:30px;flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;
  background:var(--cmx-strip);color:var(--cmx-dim);border:0;border-right:1px solid var(--cmx-line);
  font-size:14px;line-height:1;cursor:pointer;padding:0}
.cmx-fxbtn:last-child{border-right:0}
.cmx-fxbtn:hover:not(:disabled){color:var(--cmx-fore);background:color-mix(in srgb,var(--cmx-active-bg) 60%,transparent)}
.cmx-fxbtn:disabled{opacity:.4;cursor:default}
.cmx-fxbtn.cmx-fxbtn-cancel:hover:not(:disabled){color:#e5484d}
.cmx-fxbtn.cmx-fxbtn-confirm:hover:not(:disabled){color:#2ea043}
.cmx-fxbtn.cmx-fxbtn-fx{font:italic 600 13px 'SFMono-Regular',Consolas,Menlo,monospace}
.cmx-fx{flex:1;min-width:0;background:var(--cmx-field);border:0;
  color:var(--cmx-fore);font:13px 'SFMono-Regular',Consolas,Menlo,monospace;padding:0 10px;box-sizing:border-box}
.cmx-fx:focus{outline:none}
/* \u753B\u5E03\u821E\u53F0 */
.cmx-stage{flex:1 1 auto;position:relative;overflow:hidden;min-width:0;min-height:0}
.cmx-canvas{display:block;width:100%;height:100%;cursor:cell;outline:none}
/* \u53F3\u952E\u4E0A\u4E0B\u6587\u83DC\u5355\uFF08M10\uFF09 */
.cmx-context-menu{position:absolute;min-width:140px;background:var(--cmx-menu-bg,#fff);
  border:1px solid var(--cmx-menu-border,#d0d4da);border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,0.18);
  padding:4px 0;font-size:13px;user-select:none}
.cmx-root.cmx-dark .cmx-context-menu{--cmx-menu-bg:#2a2f36;--cmx-menu-border:#454c56;color:#e6e9ee}
.cmx-menu-item{padding:6px 16px;cursor:pointer;white-space:nowrap}
.cmx-menu-item:hover{background:var(--cmx-menu-hover,#eef2fb)}
.cmx-root.cmx-dark .cmx-menu-item:hover{background:#37404a}
.cmx-menu-sep{height:1px;margin:4px 0;background:var(--cmx-menu-border,#e2e6ec)}
/* \u7B5B\u9009\u4E0B\u62C9\u9762\u677F\uFF08M11\uFF09 */
.cmx-filter-panel{position:absolute;min-width:180px;background:var(--cmx-menu-bg,#fff);
  border:1px solid var(--cmx-menu-border,#d0d4da);border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,0.18);
  padding:6px;font-size:13px;user-select:none}
.cmx-root.cmx-dark .cmx-filter-panel{--cmx-menu-bg:#2a2f36;--cmx-menu-border:#454c56;color:#e6e9ee}
.cmx-filter-btn{padding:5px 10px;cursor:pointer;border-radius:4px}
.cmx-filter-btn:hover{background:var(--cmx-menu-hover,#eef2fb)}
.cmx-root.cmx-dark .cmx-filter-btn:hover{background:#37404a}
.cmx-filter-list{max-height:180px;overflow:auto;margin:4px 0;border:1px solid var(--cmx-menu-border,#e2e6ec);border-radius:4px;padding:4px}
.cmx-filter-item{display:flex;align-items:center;gap:6px;padding:2px 4px;cursor:pointer}
.cmx-filter-bar{display:flex;gap:6px;justify-content:flex-end;margin-top:4px}
.cmx-filter-apply,.cmx-filter-clear{padding:4px 12px;border-radius:4px;border:1px solid var(--cmx-menu-border,#d0d4da);cursor:pointer;background:transparent;color:inherit;font-size:12px}
.cmx-filter-apply{background:#3b82f6;color:#fff;border-color:#3b82f6}
/* \u67E5\u627E\u6846\uFF08M11\uFF09 */
.cmx-find-box{position:absolute;top:6px;right:6px;z-index:1001;display:flex;gap:4px;align-items:center;
  background:var(--cmx-menu-bg,#fff);border:1px solid var(--cmx-menu-border,#d0d4da);border-radius:6px;
  box-shadow:0 2px 10px rgba(0,0,0,0.15);padding:5px 8px}
.cmx-root.cmx-dark .cmx-find-box{--cmx-menu-bg:#2a2f36;--cmx-menu-border:#454c56;color:#e6e9ee}
.cmx-find-box input{width:140px;padding:3px 6px;border:1px solid var(--cmx-menu-border,#d0d4da);border-radius:4px;background:transparent;color:inherit;font-size:13px;outline:none}
.cmx-find-box button{padding:3px 8px;border:1px solid var(--cmx-menu-border,#d0d4da);border-radius:4px;background:transparent;color:inherit;cursor:pointer;font-size:12px}
.cmx-find-count{font-size:12px;color:#8a9099;min-width:40px;text-align:center}
/* \u6570\u636E\u9A8C\u8BC1\u63D0\u793A\u6C14\u6CE1\uFF08M12\uFF09 */
.cmx-validation-tip{max-width:240px;background:#d13438;color:#fff;font-size:12px;padding:6px 10px;
  border-radius:5px;box-shadow:0 3px 12px rgba(0,0,0,0.25);pointer-events:none}
/* \u5355\u5143\u683C\u6279\u6CE8\u6846\uFF08M14\uFF09 */
.cmx-comment-box{max-width:260px;background:#fffbe6;border:1px solid #e0d48a;color:#333;font-size:12px;
  padding:6px 10px;border-radius:5px;box-shadow:0 3px 12px rgba(0,0,0,0.22)}
.cmx-root.cmx-dark .cmx-comment-box{background:#3a3620;border-color:#5a5330;color:#e6e0c0}
.cmx-comment-author{font-weight:bold;margin-bottom:3px}
.cmx-comment-text{white-space:pre-wrap}
/* \u9875\u7B7E\u680F */
.cmx-tabstrip-host{flex:0 0 auto}
.cmx-tabstrip-host.cmx-hidden{display:none}
.cmx-tabstrip{display:flex;align-items:flex-start;gap:4px;padding:0 10px;height:32px;
  border-top:1px solid var(--cmx-line);background:var(--cmx-strip);overflow-x:auto;box-sizing:border-box}
.cmx-tabstrip .cmx-tabs{display:flex;gap:2px;align-items:flex-start}
/* \u9875\u7B7E\uFF1A\u4E0A\u65B9\u4E24\u65B9\u89D2\u3001\u4E0B\u65B9\u4E24\u5706\u89D2\uFF0C\u4ECE\u4E0A\u65B9 sheet \u5782\u4E0B */
.cmx-tab{background:transparent;color:var(--cmx-dim);border:1px solid transparent;border-top:0;
  border-radius:0 0 8px 8px;padding:6px 16px 7px;font:12.5px inherit;cursor:pointer;white-space:nowrap;margin-top:-1px}
.cmx-tab:hover{color:var(--cmx-fore);background:color-mix(in srgb,var(--cmx-active-bg) 55%,transparent)}
.cmx-tab.active{color:var(--cmx-accent);background:var(--cmx-active-bg);border-color:var(--cmx-line);border-top:0;font-weight:600}
.cmx-tab.cmx-tab-dropbefore{box-shadow:inset 2px 0 0 var(--cmx-accent)}
.cmx-tab.cmx-tab-dropafter{box-shadow:inset -2px 0 0 var(--cmx-accent)}
/* \u5BFC\u822A/\u589E\u5220\u6309\u94AE\uFF1A\u6B63\u65B9\u5F62 */
.cmx-tab-nav{align-self:center;flex:0 0 auto;width:26px;height:26px;padding:0;display:inline-flex;
  align-items:center;justify-content:center;background:transparent;color:var(--cmx-dim);
  border:1px solid var(--cmx-line);border-radius:6px;font-size:12px;line-height:1;cursor:pointer}
.cmx-tab-nav:hover:not(:disabled){border-color:var(--cmx-accent);color:var(--cmx-fore)}
.cmx-tab-nav:disabled{opacity:.35;cursor:not-allowed}
/* \u7F16\u8F91\u5668 overlay\uFF08InteractionController \u6302\u5230 stage\uFF09 */
.cmx-cell-editor{position:absolute}
`;
var ElementBase = typeof HTMLElement !== "undefined" ? HTMLElement : class {
};
var CmxMegasheet = class extends ElementBase {
  // ── 内核对象 ──
  wb = new Workbook({ sheetCount: 0 });
  engine = new FormulaEngine(this.wb);
  sheet = null;
  rows = null;
  cols = null;
  vp = null;
  geo = null;
  renderer = null;
  ctrl = null;
  tabstrip = null;
  /** 上次 setReportModel 的报表模型（getReportModel 返回）。 */
  _report = null;
  /** 可编辑开关（透传 InteractionController）。 */
  _editable = true;
  // ── DOM ──
  rootEl;
  barEl;
  addrEl;
  cancelBtn;
  confirmBtn;
  fxBtn;
  fxEl;
  stageEl;
  canvasEl;
  tabHostEl;
  ctx = null;
  // ── 状态 ──
  themeMode = "auto";
  darkResolved = false;
  dpr = 1;
  raf = 0;
  ro = null;
  io = null;
  mql = null;
  mqlHandler = null;
  built = false;
  connectedCallback() {
    if (this.built) return;
    this.built = true;
    this.buildDom();
    if (this.wb.getSheetCount() === 0) {
      this.wb.appendSheet();
    }
    this.buildView();
    this.setupTabStrip();
    this.setTheme(this.getAttribute("data-theme") || "auto");
    this.showFormulaBar(this.getAttribute("data-formula-bar") !== "false");
    this.setupObservers();
  }
  disconnectedCallback() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.ctrl?.dispose();
    this.engine.dispose();
    this.ro?.disconnect();
    this.io?.disconnect();
    if (this.mql && this.mqlHandler) {
      try {
        this.mql.removeEventListener("change", this.mqlHandler);
      } catch {
      }
    }
  }
  // ── shadow DOM 构建 ─────────────────────────────────
  buildDom() {
    const shadow = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = SHADOW_CSS;
    shadow.appendChild(style);
    this.rootEl = document.createElement("div");
    this.rootEl.className = "cmx-root";
    this.barEl = document.createElement("div");
    this.barEl.className = "cmx-formulabar";
    this.addrEl = document.createElement("div");
    this.addrEl.className = "cmx-addr";
    this.addrEl.textContent = "A1";
    const btns = document.createElement("div");
    btns.className = "cmx-fxbtns";
    this.cancelBtn = document.createElement("button");
    this.cancelBtn.className = "cmx-fxbtn cmx-fxbtn-cancel";
    this.cancelBtn.type = "button";
    this.cancelBtn.title = "\u53D6\u6D88";
    this.cancelBtn.textContent = "\u2715";
    this.confirmBtn = document.createElement("button");
    this.confirmBtn.className = "cmx-fxbtn cmx-fxbtn-confirm";
    this.confirmBtn.type = "button";
    this.confirmBtn.title = "\u786E\u8BA4";
    this.confirmBtn.textContent = "\u2713";
    this.fxBtn = document.createElement("button");
    this.fxBtn.className = "cmx-fxbtn cmx-fxbtn-fx";
    this.fxBtn.type = "button";
    this.fxBtn.title = "\u516C\u5F0F\u5B9A\u4E49";
    this.fxBtn.textContent = "fx";
    btns.append(this.cancelBtn, this.confirmBtn, this.fxBtn);
    this.fxEl = document.createElement("input");
    this.fxEl.className = "cmx-fx";
    this.fxEl.setAttribute("spellcheck", "false");
    this.fxEl.placeholder = "\u503C\u6216 =\u516C\u5F0F";
    this.barEl.append(this.addrEl, btns, this.fxEl);
    this.stageEl = document.createElement("div");
    this.stageEl.className = "cmx-stage";
    this.canvasEl = document.createElement("canvas");
    this.canvasEl.className = "cmx-canvas";
    this.canvasEl.tabIndex = 0;
    this.stageEl.appendChild(this.canvasEl);
    this.canvasEl.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        e.stopPropagation();
        this.showFindBox();
      }
    }, true);
    this.tabHostEl = document.createElement("div");
    this.tabHostEl.className = "cmx-tabstrip-host";
    this.rootEl.append(this.barEl, this.stageEl, this.tabHostEl);
    shadow.appendChild(this.rootEl);
    this.ctx = this.canvasEl.getContext("2d") ?? null;
    this.fxEl.addEventListener("keydown", (e) => {
      const k = e.key;
      if (k === "Enter") this.commitFormulaBar();
      else if (k === "Escape") this.cancelFormulaBar();
    });
    this.cancelBtn.addEventListener("click", () => this.cancelFormulaBar());
    this.confirmBtn.addEventListener("click", () => this.commitFormulaBar());
    this.fxBtn.addEventListener("click", () => this.startFormula());
  }
  // ── 装配活动 sheet 视图 ─────────────────────────────
  buildView() {
    this.ctrl?.dispose();
    const sheet = this.wb.getActiveSheet();
    if (!sheet) return;
    this.sheet = sheet;
    this.rows = new AxisMetrics(sheet.getRowCount(), (i) => sheet.getRowHeight(i), (i) => !sheet.isRowVisible(i));
    this.cols = new AxisMetrics(sheet.getColumnCount(), (i) => sheet.getColumnWidth(i), (i) => !sheet.isColumnVisible(i));
    this.vp = new Viewport({ rowHeaderWidth: 46, colHeaderHeight: 22 });
    this.geo = new SheetGeometry(this.rows, this.cols, this.vp);
    this.refreshOutlinePane();
    this.renderer = new SheetRenderer(sheet, this.geo);
    this.renderer.theme = this.darkResolved ? DARK_THEME : LIGHT_THEME;
    this.renderer.chartTheme = this.darkResolved ? DARK_CHART_THEME : LIGHT_CHART_THEME;
    this.ctrl = new InteractionController({
      workbook: this.wb,
      sheet,
      geometry: this.geo,
      canvas: this.canvasEl,
      host: this.stageEl,
      onChange: () => this.draw(),
      emit: (name, detail) => {
        if (name === "cmx-cell-edited") {
          const sheetName = this.sheet?.name() ?? "";
          if (typeof detail.row === "number" && typeof detail.col === "number") {
            this.wb.requestRecalcCells([{ sheet: sheetName, row: detail.row, col: detail.col }]);
          } else {
            this.wb.requestRecalc();
          }
        }
        this.forwardEvent(name, detail);
      },
      measureText: (text, style) => this.measureCellText(text, style),
      onContextMenu: (x, y, hit) => this.showContextMenu(x, y, hit),
      onFilterArrow: (col, x, y) => this.showFilterPanel(col, x, y),
      onValidationError: (row, col, msg) => this.showValidationTip(row, col, msg),
      onHyperlink: (row, col, url) => this.openHyperlink(row, col, url),
      onObjectSelect: (id) => {
        if (this.renderer) this.renderer.selectedObjectId = id;
      },
      onCommentClick: (row, col, x, y) => this.showCommentBox(row, col, x, y)
    });
    this.ctrl.editable = this._editable;
    this.resize();
  }
  setupTabStrip() {
    this.tabstrip = new SheetTabStrip({
      workbook: this.wb,
      host: this.tabHostEl,
      onActiveChange: () => {
        this.buildView();
        this.canvasEl.focus();
        this.draw();
      },
      emit: (d) => this.forwardEvent("cmx-sheet-changed", { index: d.index, name: d.name, addr: d.name })
    });
  }
  invalidateMetrics() {
    if (!this.sheet || !this.rows || !this.cols || !this.vp) return;
    this.rows.setCount(this.sheet.getRowCount());
    this.cols.setCount(this.sheet.getColumnCount());
    this.rows.invalidate();
    this.cols.invalidate();
    this.vp.bumpStructure();
  }
  /**
   * 自动行高（wordWrap）：对含换行单元格的行，按当前列宽量测折行数，把行高长到能容纳。
   * 只**增高**不缩小（不覆盖用户手动更矮的设定视为需要更高），幂等（重复调用结果稳定）。
   * 需真实 canvas ctx（量测文本宽度）；无 ctx（jsdom）时跳过。宿主灌数据后可显式调用。
   */
  applyAutoRowHeights() {
    const sheet = this.sheet;
    const ctx = this.ctx;
    if (!sheet || !ctx || !this.rows) return;
    const DEFAULT_H = 24;
    const colCount = sheet.getColumnCount();
    let changed = false;
    sheet.forEachCell((data, row, col) => {
      const st = sheet.getResolvedStyle(row, col);
      if (!st.wordWrap) return;
      const raw = sheet.getValue(row, col);
      if (raw === null || raw === "" || col >= colCount) return;
      const text = String(raw);
      const size = st.fontSize ?? 13;
      ctx.font = `${st.italic ? "italic" : "normal"} ${st.bold ? "bold" : "normal"} ${size}px ${st.fontFamily || "sans-serif"}`;
      const avail = sheet.getColumnWidth(col) - 6;
      const lines = this.countWrapLines(ctx, text, avail);
      const needed = Math.ceil(lines * size * 1.3 + 6);
      if (needed > sheet.getRowHeight(row)) {
        sheet.setRowHeight(row, needed);
        changed = true;
      }
    });
    if (changed) {
      this.invalidateMetrics();
      this.draw();
    }
  }
  /** 量测一段文本在给定宽度下的折行数（与 SheetRenderer.wrapText 同贪心逻辑）。 */
  countWrapLines(ctx, text, maxWidth) {
    if (maxWidth <= 0) return 1;
    let lines = 0;
    for (const paragraph of text.split("\n")) {
      const words = paragraph.split(/(\s+)/).filter((w) => w !== "");
      let cur = "";
      const flush = () => {
        lines++;
        cur = "";
      };
      for (const w of words) {
        if (ctx.measureText(w).width > maxWidth) {
          for (const ch of w) {
            if (cur !== "" && ctx.measureText(cur + ch).width > maxWidth) flush();
            cur += ch;
          }
        } else {
          const test = cur ? cur + w : w;
          if (ctx.measureText(test).width <= maxWidth || cur === "") cur = test;
          else {
            flush();
            cur = w.trimStart();
          }
        }
      }
      lines++;
    }
    return Math.max(1, lines);
  }
  // ── HiDPI 尺寸 ──────────────────────────────────────
  resize() {
    if (!this.vp) return;
    const r = this.stageEl.getBoundingClientRect();
    this.dpr = typeof window !== "undefined" && window.devicePixelRatio || 1;
    const w = Math.max(0, Math.round(r.width * this.dpr));
    const h = Math.max(0, Math.round(r.height * this.dpr));
    this.canvasEl.width = w;
    this.canvasEl.height = h;
    this.canvasEl.style.width = `${r.width}px`;
    this.canvasEl.style.height = `${r.height}px`;
    this.vp.set({ width: r.width, height: r.height });
    this.draw();
  }
  // ── rAF 重绘 ────────────────────────────────────────
  draw() {
    if (this.raf) return;
    const run = () => {
      this.raf = 0;
      if (this.ctx && this.renderer) {
        try {
          if (this.geo && this.renderer) {
            this.geo.clampScroll();
            this.renderer.scrollbars = this.geo.resolveScrollbars();
          }
          const anyCtx = this.ctx;
          if (typeof anyCtx.setTransform === "function") anyCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
          this.renderer.render(this.ctx, this.wb.isPaintSuspended);
        } catch {
        }
      }
      this.syncFormulaBar();
    };
    if (typeof requestAnimationFrame === "function") {
      this.raf = requestAnimationFrame(run);
    } else {
      run();
    }
  }
  /** 公式栏回填 + 坐标区同步（渲染后）。坐标区显示**选区**（单格显地址，多格显 A1:C3）。 */
  syncFormulaBar() {
    if (!this.sheet) return;
    const ar = this.sheet.getActiveRowIndex();
    const ac = this.sheet.getActiveColumnIndex();
    this.addrEl.textContent = this.readSelection();
    const f2 = this.sheet.getFormula(ar, ac);
    const val = f2 ? `=${f2}` : this.sheet.getValue(ar, ac);
    if (this.getRootDocument()?.activeElement !== this.fxEl) {
      this.fxEl.value = val === null || val === void 0 ? "" : String(val);
    }
  }
  getRootDocument() {
    try {
      return this.ownerDocument;
    } catch {
      return null;
    }
  }
  commitFormulaBar() {
    if (!this.sheet || !this.ctrl) return;
    const v = this.fxEl.value;
    const a = this.ctrl.selection.getActive();
    const um = this.wb.undoManager();
    if (v.charAt(0) === "=") um.do(setFormulaCommand(this.sheet, a.row, a.col, v));
    else if (v === "") um.do(clearCommand(this.sheet, [this.ctrl.selection.primary()], "value"));
    else if (v.trim() !== "" && !Number.isNaN(Number(v))) um.do(setValueCommand(this.sheet, a.row, a.col, Number(v)));
    else um.do(setValueCommand(this.sheet, a.row, a.col, v));
    this.wb.requestRecalc();
    this.fxEl.blur();
    this.canvasEl.focus();
    this.draw();
  }
  /** ✕ 取消：放弃公式栏编辑，还原为单元格当前值。 */
  cancelFormulaBar() {
    this.fxEl.blur();
    this.syncFormulaBar();
    this.canvasEl.focus();
  }
  /** fx 公式定义：以 '=' 引导进入公式编辑，聚焦公式栏（真正的函数向导留待 M3 formula 层）。 */
  startFormula() {
    if (this.fxEl.value.charAt(0) !== "=") this.fxEl.value = "=";
    this.fxEl.focus();
    try {
      const len = this.fxEl.value.length;
      this.fxEl.setSelectionRange(len, len);
    } catch {
    }
  }
  // ── 观察者（resize + 可见性补重绘）──────────────────
  setupObservers() {
    if (typeof ResizeObserver !== "undefined") {
      this.ro = new ResizeObserver(() => this.resize());
      try {
        this.ro.observe(this.stageEl);
      } catch {
      }
    }
    if (typeof IntersectionObserver !== "undefined") {
      let wasVisible = true;
      this.io = new IntersectionObserver((entries) => {
        const vis = entries.some((e) => e.isIntersecting && e.intersectionRatio > 0);
        if (vis && !wasVisible) requestAnimationFrame(() => this.resize());
        wasVisible = vis;
      }, { threshold: [0, 0.01] });
      try {
        this.io.observe(this);
      } catch {
      }
    }
  }
  // ── 事件转发 ────────────────────────────────────────
  forwardEvent(name, detail) {
    try {
      this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
    } catch {
    }
  }
  /** 结构事件单调序号（供消费方区分同一次插删的 do/undo/redo 时序）。 */
  _structSeq = 0;
  /**
   * 派发 `cmx-structural-changed`（插/删行列）。phase 区分正向/回退：
   *  - 'do'：正向执行；detail.op = 命令记录的 op（insert/delete）
   *  - 'undo'：撤销，op 取反（insert 的撤销 = delete 效果，反之亦然）
   *  - 'redo'：重做，op 同 'do'
   * 消费方（报表设计器）据此同步移位地址键映射（cellMap/regions）。
   */
  emitStructural(meta, phase) {
    const op = phase === "undo" ? meta.op === "insert" ? "delete" : "insert" : meta.op;
    this._structSeq += 1;
    this.forwardEvent("cmx-structural-changed", {
      axis: meta.axis,
      op,
      index: meta.index,
      count: meta.count,
      sheet: meta.sheet,
      seq: this._structSeq,
      phase
    });
  }
  // ══════════════════════════════════════════════════════
  // 公共方法（宿主/工具栏契约面）
  // ══════════════════════════════════════════════════════
  /** 底层工作簿（宿主填数据/高级操作的逃生舱）。 */
  getWorkbook() {
    return this.wb;
  }
  /** 当前滚动位置（内容像素，未缩放）。 */
  getScrollTop() {
    return this.vp?.scrollTop ?? 0;
  }
  getScrollLeft() {
    return this.vp?.scrollLeft ?? 0;
  }
  /** 滚动条当前状态（是否显示 + 占位），供宿主/测试读。无几何时返回全 false。 */
  getScrollbarState() {
    if (!this.geo) return { vertical: false, horizontal: false, gutterRight: 0, gutterBottom: 0 };
    const l = this.geo.resolveScrollbars();
    return {
      vertical: l.vertical.visible,
      horizontal: l.horizontal.visible,
      gutterRight: l.gutterRight,
      gutterBottom: l.gutterBottom
    };
  }
  /** 编程滚动到指定内容像素位置（钳到合法范围）。名 scrollToPixel 避与 HTMLElement.scrollTo 签名冲突。 */
  scrollToPixel(scrollLeft, scrollTop) {
    if (!this.vp || !this.geo) return;
    this.vp.set({ scrollLeft, scrollTop });
    this.geo.clampScroll();
    this.draw();
  }
  /** 当前活动工作表。 */
  getActiveSheetObject() {
    return this.sheet;
  }
  getActiveSheetIndex() {
    return this.wb.getActiveSheetIndex();
  }
  setActiveSheet(index) {
    this.wb.setActiveSheetIndex(index);
    this.tabstrip?.render();
    this.buildView();
    this.draw();
  }
  /**
   * 宿主填数据入口：回调拿到 workbook，填完组件重建视图 + 刷新页签。
   * 用法：el.loadWorkbook(wb => { wb.clearSheets(); wb.appendSheet(mySheet) })
   */
  loadWorkbook(fill) {
    fill(this.wb);
    if (this.wb.getSheetCount() === 0) this.wb.appendSheet();
    this.wb.requestRecalc();
    this.tabstrip?.render();
    this.buildView();
    this.draw();
  }
  /**
   * 整体替换内核工作簿（内部：io 导入/setWorkbookJson/setWorkbook 用）。
   * 旧引擎解绑、新引擎接管重算钩子，视图/页签/交互全量重建。
   */
  swapWorkbook(next) {
    if (next.getSheetCount() === 0) next.appendSheet();
    this.engine.dispose();
    this.wb = next;
    this.engine = new FormulaEngine(this.wb);
    this.wb.requestRecalc();
    this.tabstrip?.setWorkbook(this.wb);
    this.buildView();
    this.draw();
  }
  // ── io：存储 + XLSX（M4）──────────────────────────────
  /** 导出中性快照对象（主题无关、可 JSON 序列化）。冻结窗格（视口态）一并带出。 */
  toSnapshot() {
    const snap = workbookToJSON(this.wb);
    const fr = this.vp?.frozenRowCount ?? 0;
    const fc = this.vp?.frozenColCount ?? 0;
    if (fr > 0) snap.frozenRowCount = fr;
    if (fc > 0) snap.frozenColCount = fc;
    const tr = this.vp?.trailingRowCount ?? 0;
    const tc = this.vp?.trailingColCount ?? 0;
    if (tr > 0) snap.trailingRowCount = tr;
    if (tc > 0) snap.trailingColCount = tc;
    if (this.vp?.splitRow) snap.splitRow = true;
    if (this.vp?.splitCol) snap.splitCol = true;
    return snap;
  }
  /** 导出为 JSON 字符串。 */
  toJSON(pretty = false) {
    return stringifyWorkbook(this.wb, pretty);
  }
  /** 从中性快照对象载入（整体替换工作簿）。冻结窗格随快照恢复。 */
  fromSnapshot(snap) {
    this.swapWorkbook(workbookFromJSON(snap));
    this.vp?.set({
      frozenRowCount: snap.frozenRowCount ?? 0,
      frozenColCount: snap.frozenColCount ?? 0,
      trailingRowCount: snap.trailingRowCount ?? 0,
      trailingColCount: snap.trailingColCount ?? 0,
      splitRow: snap.splitRow ?? false,
      splitCol: snap.splitCol ?? false
    });
    this.draw();
  }
  /** 从 JSON 字符串载入。 */
  fromJSON(json) {
    this.swapWorkbook(parseWorkbook(json));
  }
  /** 导出 XLSX 字节（.xlsx 文件内容）。经 toSnapshot 带上冻结窗格（视口态，M16）。 */
  exportXlsx() {
    return snapshotToXlsx(this.toSnapshot());
  }
  /** 从 XLSX 字节载入（整体替换工作簿）。经 xlsxToSnapshot→fromSnapshot 复原冻结窗格（M16）。 */
  importXlsx(bytes) {
    this.fromSnapshot(xlsxToSnapshot(bytes));
  }
  /** 从 旧内核 SSJSON 迁移载入（整体替换工作簿）。 */
  importSSJSON(ssjson) {
    this.swapWorkbook(importSSJSON(ssjson));
  }
  // ── M26 CSV 导入导出 ─────────────────────────────────
  /**
   * 导出 CSV（M26）。缺省导出活动 sheet 的 usedRange；传 range 只导该区。
   * opts.delimiter/eol/bom 见 CsvSerializeOptions。
   */
  exportCsv(opts = {}) {
    if (!this.sheet) return "";
    const { range: range2, ...ser } = opts;
    const r = range2 ? new Range(range2.row, range2.col, range2.rowCount, range2.colCount) : new Range(0, 0, this.sheet.getRowCount(), this.sheet.getColumnCount());
    return serializeCsv(this.sheet, r, ser);
  }
  /**
   * 导入 CSV 文本（M26）：解析后从 targetRow/targetCol（缺省活动格）起铺格，可撤销。
   * 数字串自动转数（复用 pasteExternal 语义）。返回落区行列数。
   */
  importCsv(text, opts = {}) {
    if (!this.sheet) return { rows: 0, cols: 0 };
    const grid = parseCsv(text, opts);
    const r = opts.row ?? this.getActiveAddrRC().row;
    const c = opts.col ?? this.getActiveAddrRC().col;
    this.wb.undoManager().do(pasteExternalCommand(this.sheet, r, c, grid));
    this.wb.requestRecalc();
    this.draw();
    this.forwardEvent("cmx-cell-edited", { addr: this.getActiveAddr() });
    return { rows: grid.length, cols: grid.reduce((m, row) => Math.max(m, row.length), 0) };
  }
  // ── 契约门面（M5：对齐 cmx-旧内核-sheet.js 消费方零改验收单）──────
  /**
   * 灌报表模型：清空重建 sheets，按 ReportModel（meta/sheets/grid/cells/fetches）
   * 铺格 + 样式 + 合并 + 取数占位。对齐 wrapper.setReportModel。
   */
  setReportModel(report) {
    this._report = report ?? null;
    const sheets = report?.sheets?.length ? report.sheets : [{
      name: String(report?.meta?.reportName ?? report?.moduleMeta?.moduleName ?? "Sheet1"),
      grid: report?.grid ?? {},
      cells: report?.cells ?? {}
    }];
    const fetches = report?.fetches ?? {};
    this.loadWorkbook((wb) => {
      wb.clearSheets();
      sheets.forEach((def, idx) => {
        const ws = new Worksheet(def.name || `Sheet${idx + 1}`, {
          rowCount: Number(def.grid?.rows) || 40,
          colCount: Number(def.grid?.cols) || 12,
          styleSheet: wb.styleSheet
        });
        this.applySheetModel(ws, def, fetches);
        wb.appendSheet(ws);
      });
      wb.setActiveSheetIndex(0);
    });
  }
  /** 上次 setReportModel 的报表模型（原样返回）。 */
  getReportModel() {
    return this._report;
  }
  /** 把单个 SheetModel 铺进一张 Worksheet（grid/cells/styleClasses/merges/fetches）。 */
  applySheetModel(ws, def, fetches) {
    const grid = def.grid ?? {};
    const cells = def.cells ?? {};
    for (const [letter, px] of Object.entries(grid.colWidths ?? {})) {
      const c = labelToCol(letter);
      if (c >= 0) ws.setColumnWidth(c, Number(px) || 80);
    }
    for (const [rowNo, px] of Object.entries(grid.rowHeights ?? {})) {
      ws.setRowHeight((Number(rowNo) || 1) - 1, Number(px) || 24);
    }
    for (const range2 of grid.merges ?? []) {
      const r = parseRange(range2);
      if (r) ws.addSpan(r.r1, r.c1, r.r2 - r.r1 + 1, r.c2 - r.c1 + 1);
    }
    for (const [name, style] of Object.entries(grid.styleClasses ?? {})) {
      ws.styleSheet.define(name, style);
    }
    for (const [addr, cell] of Object.entries(cells)) {
      const p = parseAddr(addr);
      if (!p) continue;
      if (cell.formula) ws.setFormula(p.row, p.col, normalizeFormula(cell.formula));
      else if (cell.value !== void 0 && cell.value !== null) ws.setValue(p.row, p.col, cell.value);
      const style = { ...cell.styleName ? { styleName: cell.styleName } : {}, ...cell.style ?? {} };
      if (Object.keys(style).length) ws.setStyle(p.row, p.col, style);
      const key2 = cell.fetchKey || (cell.type === "fetch" ? cell.formula : "");
      if (key2 && Object.prototype.hasOwnProperty.call(fetches, key2)) {
        ws.setValue(p.row, p.col, fetches[key2] ?? null);
      }
    }
  }
  /** 导出中性 workbook JSON（对象）。对齐 wrapper.getWorkbookJson——本引擎快照天生中性。 */
  getWorkbookJson() {
    return this.toSnapshot();
  }
  /** 从中性 workbook JSON 复原；清撤销栈；返回 Promise（对齐 wrapper 契约）。 */
  setWorkbookJson(json) {
    try {
      const snap = typeof json === "string" ? JSON.parse(json) : json;
      this.swapWorkbook(workbookFromJSON(snap));
      this.vp?.set({
        frozenRowCount: snap.frozenRowCount ?? 0,
        frozenColCount: snap.frozenColCount ?? 0,
        trailingRowCount: snap.trailingRowCount ?? 0,
        trailingColCount: snap.trailingColCount ?? 0,
        splitRow: snap.splitRow ?? false,
        splitCol: snap.splitCol ?? false
      });
      this.wb.undoManager().clear();
      return Promise.resolve(true);
    } catch (err) {
      return Promise.reject(err instanceof Error ? err : new Error(String(err)));
    }
  }
  /** 用另一 workbook（或其快照）覆盖本体。对齐 wrapper.setWorkbook(spread)。 */
  setWorkbook(other) {
    if (!other) return;
    const snap = typeof other.toSnapshot === "function" ? other.toSnapshot() : other;
    this.swapWorkbook(workbookFromJSON(snap));
  }
  /**
   * 报表数据回填（模式二）：按 A1 覆盖显示值，保留版式与公式。数字串转 number。
   * 不入撤销栈（数据回填非用户编辑）。对齐 wrapper.setCellValues。
   */
  setCellValues(map) {
    if (!this.sheet || !map) return false;
    for (const [addr, v] of Object.entries(map)) {
      const p = parseAddr(addr);
      if (!p) continue;
      const num3 = typeof v === "string" && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : v;
      this.sheet.setComputedValue(p.row, p.col, num3 ?? null);
    }
    this.wb.requestRecalc();
    this.draw();
    return true;
  }
  /** 读回当前取数值表（sheet!CELLREF → 值）。对齐 wrapper.getReportValueMap。 */
  getReportValueMap() {
    return this.engine.valueMap.raw();
  }
  /** 只读开关（false=禁编辑器/键盘写入/粘贴，选区/滚动仍可用）。 */
  setEditable(editable) {
    this._editable = editable !== false;
    if (this.ctrl) this.ctrl.editable = this._editable;
  }
  /** 是否可编辑。 */
  isEditable() {
    return this._editable;
  }
  /** light/dark 配色（契约别名，= setTheme）。对齐 wrapper.setColorScheme。 */
  setColorScheme(mode2) {
    this.setTheme(mode2);
  }
  /** 对选区套边框（可撤销）。kind: all/none/top/bottom/left/right/outline/inside/innerHorizontal/innerVertical。 */
  applySelectionBorder(kind = "all", color = "#8a8f94", lineStyle = "thin") {
    if (!this.sheet || !this._editable) return;
    this.wb.undoManager().do(applyBorderCommand(this.sheet, this.ranges(), kind, color, lineStyle));
    this.draw();
  }
  /**
   * 把任意直接改内核 sheet 的变更包成一次可撤销命令（M6：对齐 wrapper._runUndoable）。
   * 消费方（designer.js/report-applier.js）经 getWorkbook().getActiveSheet() 直接 setFormula/setValue，
   * 再用 _runUndoable('editCell', fn) 让其进撤销栈。这里对整张活动 sheet 拍快照后运行 fn。
   */
  runUndoable(fn, label = "\u7F16\u8F91\u8868\u683C") {
    if (!this.sheet || typeof fn !== "function") {
      try {
        fn?.();
      } catch {
      }
      return false;
    }
    const full = [new Range(0, 0, this.sheet.getRowCount(), this.sheet.getColumnCount())];
    this.wb.undoManager().do(runUndoableCommand(this.sheet, full, fn, label));
    this.wb.requestRecalc();
    this.draw();
    this.forwardEvent("cmx-cell-edited", { addr: this.getActiveAddr() });
    return true;
  }
  /** 活动 sheet 索引（number，对齐 wrapper.getActiveSheet；对象用 getActiveSheetObject）。 */
  getActiveSheet() {
    return this.wb.getActiveSheetIndex();
  }
  /** 连撤 n 步。 */
  undoSteps(count = 1) {
    const n = Math.max(1, Math.floor(count) || 1);
    for (let i = 0; i < n && this.wb.undoManager().canUndo(); i++) this.undo();
  }
  /** 连重 n 步。 */
  redoSteps(count = 1) {
    const n = Math.max(1, Math.floor(count) || 1);
    for (let i = 0; i < n && this.wb.undoManager().canRedo(); i++) this.redo();
  }
  // 选区当前区域（供命令）
  ranges() {
    return this.ctrl?.selection.getRanges() ?? [];
  }
  primary() {
    return this.ctrl?.selection.primary() ?? null;
  }
  /** 编程设选区（驱动交互层选区模型 + 同步 sheet + 重绘）。对齐原生 setSelection。 */
  setSelection(row, col, rowCount = 1, colCount = 1) {
    this.ctrl?.selection.select(row, col, rowCount, colCount);
    this.sheet?.setSelection(row, col, rowCount, colCount);
    this.draw();
  }
  applySelectionStyle(patch) {
    if (!this.sheet) return;
    this.wb.undoManager().do(applyStyleCommand(this.sheet, this.ranges(), patch));
    this.draw();
  }
  /**
   * 对选区套填充（M18，可撤销）。fill 为判别联合：
   *  - string / {type:'solid',color} → 纯色（等价 backColor）
   *  - {type:'pattern',patternType,color,bgColor?} → 图案填充
   *  - {type:'gradient',angle?,stops:[{offset,color}]} → 线性渐变
   * null 清除填充。走通用 applySelectionStyle({fill}) 路径。
   */
  applySelectionFill(fill) {
    if (!this.sheet) return;
    const normalized = fill === null ? void 0 : typeof fill === "string" ? { type: "solid", color: fill } : fill;
    if (normalized === void 0) {
      this.wb.undoManager().do(clearStyleKeysCommand(this.sheet, this.ranges(), ["fill", "backColor"]));
      this.draw();
      return;
    }
    this.wb.undoManager().do(applyStyleCommand(this.sheet, this.ranges(), { fill: normalized }));
    this.draw();
  }
  /** 选择性粘贴（M18，可撤销）：以活动格为锚，按 options 投影内部剪贴板内容。返回是否落格。 */
  pasteSpecial(options = {}) {
    if (!this.ctrl) return false;
    const ok = this.ctrl.pasteSpecial(options);
    if (ok) {
      this.wb.requestRecalc();
      this.draw();
      this.forwardEvent("cmx-cell-edited", { addr: this.getActiveAddr() });
    }
    return ok;
  }
  /** 复制当前选区到内部剪贴板（M18：选择性粘贴的编程入口）。 */
  copySelection() {
    this.ctrl?.copySelection();
  }
  // ── M20 工作表保护 / 单元格锁定 ────────────────────────
  /**
   * 开启工作表保护（M20）。锁定格（locked !== false）在保护态下拒交互编辑并派发 cmx-edit-rejected。
   * opts 见 SheetProtection（allowSelectLocked/allowSort/…）。
   */
  protectSheet(opts = {}) {
    this.sheet?.setProtection({ enabled: true, ...opts });
    this.draw();
  }
  /** 解除工作表保护。 */
  unprotectSheet() {
    this.sheet?.setProtection(null);
    this.draw();
  }
  /** 是否处于保护态。 */
  isSheetProtected() {
    return this.sheet?.isProtected() ?? false;
  }
  /** 把选区设为锁定/解锁（走通用 applySelectionStyle，可撤销）。默认锁；传 false 解锁。 */
  setCellsLocked(locked) {
    if (!this.sheet) return;
    this.wb.undoManager().do(applyStyleCommand(this.sheet, this.ranges(), { locked }));
    this.draw();
  }
  /** 某格在当前保护态下可否编辑（供宿主 UI 判断）。 */
  canEditCell(row, col) {
    return this.sheet?.canEditCell(row, col) ?? true;
  }
  mergeSelection() {
    const s = this.primary();
    if (!this.sheet || !s || s.rowCount <= 1 && s.colCount <= 1) return;
    this.wb.undoManager().do(mergeCommand(this.sheet, s));
    this.draw();
  }
  unmergeSelection() {
    if (!this.sheet) return;
    this.wb.undoManager().do(unmergeCommand(this.sheet, this.ranges()));
    this.draw();
  }
  clearSelection(mode2 = "all") {
    if (!this.sheet) return;
    this.wb.undoManager().do(clearCommand(this.sheet, this.ranges(), mode2));
    this.wb.requestRecalc();
    this.draw();
  }
  insertRows(count = 1) {
    const s = this.primary();
    if (!this.sheet || !s) return;
    const cmd = insertRowsCommand(this.sheet, s.row, count, this.wb);
    this.wb.undoManager().do(cmd);
    this.wb.requestRecalc();
    this.invalidateMetrics();
    this.draw();
    if (cmd.structural) this.emitStructural(cmd.structural, "do");
  }
  deleteRows(count = 1) {
    const s = this.primary();
    if (!this.sheet || !s) return;
    const cmd = deleteRowsCommand(this.sheet, s.row, count, this.wb);
    this.wb.undoManager().do(cmd);
    this.wb.requestRecalc();
    this.invalidateMetrics();
    this.draw();
    if (cmd.structural) this.emitStructural(cmd.structural, "do");
  }
  insertColumns(count = 1) {
    const s = this.primary();
    if (!this.sheet || !s) return;
    const cmd = insertColumnsCommand(this.sheet, s.col, count, this.wb);
    this.wb.undoManager().do(cmd);
    this.wb.requestRecalc();
    this.invalidateMetrics();
    this.draw();
    if (cmd.structural) this.emitStructural(cmd.structural, "do");
  }
  deleteColumns(count = 1) {
    const s = this.primary();
    if (!this.sheet || !s) return;
    const cmd = deleteColumnsCommand(this.sheet, s.col, count, this.wb);
    this.wb.undoManager().do(cmd);
    this.wb.requestRecalc();
    this.invalidateMetrics();
    this.draw();
    if (cmd.structural) this.emitStructural(cmd.structural, "do");
  }
  undo() {
    const a = this.ctrl?.undo() ?? null;
    this.wb.requestRecalc();
    this.invalidateMetrics();
    this.draw();
    if (a?.structural) this.emitStructural(a.structural, "undo");
  }
  redo() {
    const a = this.ctrl?.redo() ?? null;
    this.wb.requestRecalc();
    this.invalidateMetrics();
    this.draw();
    if (a?.structural) this.emitStructural(a.structural, "redo");
  }
  canUndo() {
    return this.wb.undoManager().canUndo();
  }
  canRedo() {
    return this.wb.undoManager().canRedo();
  }
  getHistoryState() {
    const um = this.wb.undoManager();
    return { undo: um.getUndoStack().length, redo: um.getRedoStack().length };
  }
  /**
   * 灌报表取数值表（QM/QC/JE/FS/REF 从此按格取数）并触发重算。
   * 键 `sheetName!CELLREF` 或裸 `CELLREF`（按当前活动 sheet 归一）。
   */
  setReportValueMap(map) {
    this.engine.setReportValueMap(map);
    this.draw();
  }
  /** 直接求值一个公式串（不落格），供预览/聚合。 */
  evaluateFormula(formula, row = 0, col = 0) {
    const name = this.sheet?.name() ?? "";
    return this.engine.evaluateFormula(name, formula, row, col);
  }
  /** 强制全量重算公式。 */
  recalc() {
    this.wb.requestRecalc();
    this.draw();
  }
  /** 增量重算：只重算受一批格影响的公式闭包（M16）。 */
  recalcCells(cells) {
    const sheetName = this.sheet?.name() ?? "";
    this.wb.requestRecalcCells(cells.map((c) => ({ sheet: sheetName, row: c.row, col: c.col })));
    this.draw();
  }
  // ── 命名区域 / Defined Names（M8）────────────────────
  /** 定义/覆盖命名区域。refersTo 为引用文本（如 'Sheet1!A1:B3' 或 'A1'）。 */
  defineName(name, refersTo, scope = "workbook") {
    this.wb.defineName(name, refersTo, scope);
    this.wb.requestRecalc();
    this.draw();
  }
  /** 读命名区域 refersTo（sheet 级优先当前 sheet，再工作簿级）。 */
  getName(name) {
    return this.wb.resolveName(name, this.sheet?.name());
  }
  /** 删除命名区域。 */
  deleteName(name, scope = "workbook") {
    const ok = this.wb.deleteName(name, scope);
    this.wb.requestRecalc();
    this.draw();
    return ok;
  }
  /** 列出全部命名区域。 */
  listNames() {
    return this.wb.listNames();
  }
  // ── 大纲/分组 ────────────────────────────────────────
  /** 按当前分组最深层级刷新大纲带占位（有分组才占位）。 */
  refreshOutlinePane() {
    if (!this.vp || !this.sheet) return;
    const rowMax = this.sheet.rowOutlines.maxLevel();
    const colMax = this.sheet.columnOutlines.maxLevel();
    const hasRow = rowMax >= 0;
    const hasCol = colMax >= 0;
    this.vp.set({
      rowOutlineWidth: outlinePaneThickness(rowMax, hasCol),
      colOutlineHeight: outlinePaneThickness(colMax, hasRow)
    });
  }
  /** 分组重算：刷新占位 + 可见性 + 几何 + 重绘。 */
  afterOutlineChange() {
    this.refreshOutlinePane();
    this.sheet?.applyOutlineVisibility();
    this.invalidateMetrics();
    this.resize();
    this.draw();
  }
  /**
   * 公开的大纲刷新入口（P0.3）：供 getWorkbook() 逃生舱适配器在消费方直接改
   * ws.rowOutlines.group() + 置 wb.options.showRowOutline 后触发大纲带显隐与重绘。
   */
  refreshOutlines() {
    this.afterOutlineChange();
  }
  // ── 冻结窗格（M9）────────────────────────────────────
  /** 冻结顶部 rows 行 + 左侧 cols 列（0/0 解冻）。冻结区不随滚动移动。 */
  freezePanes(rows, cols) {
    if (!this.vp) return;
    this.vp.set({ frozenRowCount: Math.max(0, rows | 0), frozenColCount: Math.max(0, cols | 0) });
    this.vp.bumpStructure();
    this.geo?.clampScroll();
    this.draw();
  }
  /** 解冻（= freezePanes(0,0)）。 */
  unfreezePanes() {
    this.freezePanes(0, 0);
  }
  getFrozenRowCount() {
    return this.vp?.frozenRowCount ?? 0;
  }
  getFrozenColumnCount() {
    return this.vp?.frozenColCount ?? 0;
  }
  /** 冻结尾部 rows 行（钉底部）+ cols 列（钉右侧）（M19）。0/0 取消尾冻结。 */
  freezeTrailing(rows, cols) {
    if (!this.vp) return;
    this.vp.set({ trailingRowCount: Math.max(0, rows | 0), trailingColCount: Math.max(0, cols | 0) });
    this.vp.bumpStructure();
    this.geo?.clampScroll();
    this.draw();
  }
  /** 取消尾冻结（= freezeTrailing(0,0)）。 */
  unfreezeTrailing() {
    this.freezeTrailing(0, 0);
  }
  getTrailingRowCount() {
    return this.vp?.trailingRowCount ?? 0;
  }
  getTrailingColumnCount() {
    return this.vp?.trailingColCount ?? 0;
  }
  // ── M19-step2 拆分窗格（可拖冻结式）────────────────────
  /**
   * 拆分窗格（M19-step2）：顶部 row 行 + 左侧 col 列成为可拖拆分带。
   * 本质是「可拖动的冻结」——上下两段共享 scrollTop、左右共享 scrollLeft（对齐 Excel 拆分）。
   * 拆分条可用鼠标拖动实时改变位置。0/0 取消拆分。
   */
  splitPanes(row, col) {
    if (!this.vp) return;
    const r = Math.max(0, row | 0), c = Math.max(0, col | 0);
    this.vp.set({ frozenRowCount: r, frozenColCount: c, splitRow: r > 0, splitCol: c > 0 });
    this.vp.bumpStructure();
    this.geo?.clampScroll();
    this.draw();
  }
  /** 取消拆分（清拆分标记 + 冻结数）。 */
  removeSplit() {
    if (!this.vp) return;
    this.vp.set({ splitRow: false, splitCol: false, frozenRowCount: 0, frozenColCount: 0 });
    this.vp.bumpStructure();
    this.draw();
  }
  isSplitRow() {
    return this.vp?.splitRow ?? false;
  }
  isSplitCol() {
    return this.vp?.splitCol ?? false;
  }
  // ── 编辑体验 M10：格式刷 / autoFit / 填充 / 右键菜单 ──────
  _formatBrush = null;
  /** 格式刷：拷贝活动格样式（供后续 pasteFormat）。 */
  copyFormat() {
    if (!this.sheet) return;
    const a = this.getActiveAddrRC();
    this._formatBrush = this.sheet.getStyle(a.row, a.col);
  }
  /** 格式刷：把已拷样式施加到当前选区（只搬样式不搬值，可撤销）。 */
  pasteFormat() {
    if (!this.sheet || this._formatBrush === null) return;
    this.wb.undoManager().do(pasteFormatCommand(this.sheet, this.ranges(), this._formatBrush ?? void 0));
    this.wb.requestRecalc();
    this.draw();
  }
  /** 自适应列宽（量测最宽内容）。 */
  autoFitColumn(col) {
    this.ctrl?.autoFitColumn(col);
    this.draw();
  }
  /** 自适应行高。 */
  autoFitRow(row) {
    this.ctrl?.autoFitRow(row);
    this.draw();
  }
  /** 程序化把当前选区向下/右填充到 (lastRow,lastCol) 覆盖的目标区。 */
  fillTo(row, col) {
    if (!this.ctrl || !this.sheet) return;
    const p = this.ctrl.selection.primary();
    const target = new Range(
      Math.min(p.row, row),
      Math.min(p.col, col),
      Math.max(p.rowCount, row - p.row + 1),
      Math.max(p.colCount, col - p.col + 1)
    );
    this.ctrl.fillTo(target);
    this.draw();
  }
  getActiveAddrRC() {
    return this.ctrl ? this.ctrl.selection.getActive() : { row: 0, col: 0 };
  }
  /** 真 ctx 量测单元格文本宽度（autoFit 用；无 ctx 回退按字符估）。 */
  measureCellText(text, style) {
    if (this.ctx && typeof this.ctx.measureText === "function") {
      const size = style.fontSize ?? 13;
      const weight = style.bold ? "bold" : "normal";
      const italic = style.italic ? "italic" : "normal";
      this.ctx.font = `${italic} ${weight} ${size}px Arial, sans-serif`;
      return this.ctx.measureText(text).width;
    }
    return String(text).length * (style.fontSize ?? 13) * 0.6;
  }
  /** 右键上下文菜单：在 shadow DOM 内渲染一个简单菜单，项转调既有门面。 */
  showContextMenu(x, y, _hit) {
    const shadow = this.shadowRoot;
    if (!shadow) return;
    this.hideContextMenu();
    const doc = this.ownerDocument;
    const menu = doc.createElement("div");
    menu.className = "cmx-context-menu";
    menu.setAttribute("data-cmx-menu", "true");
    const items = [
      { label: "\u526A\u5207", act: () => this.execClipboard("cut") },
      { label: "\u590D\u5236", act: () => this.execClipboard("copy") },
      { label: "\u7C98\u8D34", act: () => this.execClipboard("paste") },
      "sep",
      { label: "\u63D2\u5165\u884C", act: () => this.insertRows(1) },
      { label: "\u63D2\u5165\u5217", act: () => this.insertColumns(1) },
      { label: "\u5220\u9664\u884C", act: () => this.deleteRows(1) },
      { label: "\u5220\u9664\u5217", act: () => this.deleteColumns(1) },
      "sep",
      { label: "\u5408\u5E76", act: () => this.mergeSelection() },
      { label: "\u53D6\u6D88\u5408\u5E76", act: () => this.unmergeSelection() },
      { label: "\u6E05\u9664\u5185\u5BB9", act: () => this.clearSelectionContent() }
    ];
    for (const it of items) {
      if (it === "sep") {
        const s = doc.createElement("div");
        s.className = "cmx-menu-sep";
        menu.appendChild(s);
        continue;
      }
      const el = doc.createElement("div");
      el.className = "cmx-menu-item";
      el.textContent = it.label;
      el.addEventListener("mousedown", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        try {
          it.act();
        } catch {
        }
        this.hideContextMenu();
      });
      menu.appendChild(el);
    }
    menu.style.cssText = `position:absolute;left:${x}px;top:${y}px;z-index:1000;`;
    this.stageEl.appendChild(menu);
    this._menuEl = menu;
    const close = () => {
      this.hideContextMenu();
      doc.removeEventListener("mousedown", close);
    };
    setTimeout(() => doc.addEventListener("mousedown", close), 0);
  }
  _menuEl = null;
  hideContextMenu() {
    if (this._menuEl && this._menuEl.parentNode) this._menuEl.parentNode.removeChild(this._menuEl);
    this._menuEl = null;
  }
  /** 菜单剪切/复制/粘贴：走系统剪贴板 API（异步）+ 内部剪贴板兜底。 */
  execClipboard(kind) {
    if (!this.ctrl) return;
    this.canvasEl.focus();
    try {
      this.ownerDocument.execCommand(kind);
    } catch {
    }
  }
  /** 清除选区内容（值，不清样式），供菜单。 */
  clearSelectionContent() {
    if (!this.sheet) return;
    this.wb.undoManager().do(clearCommand(this.sheet, this.ranges(), "value"));
    this.wb.requestRecalc();
    this.draw();
  }
  // ── M11 查找替换 / 排序 / 筛选 ─────────────────────────
  /** 查找所有命中格（当前 sheet）。 */
  find(query, opts = {}) {
    return this.sheet ? findAll(this.sheet, query, opts) : [];
  }
  /** 查找并定位第 index 个命中（0-based，滚到可见 + 设选区）。返回命中总数。 */
  findAndSelect(query, index, opts = {}) {
    if (!this.sheet) return 0;
    const hits = findAll(this.sheet, query, opts);
    if (hits.length === 0) return 0;
    const h = hits[(index % hits.length + hits.length) % hits.length];
    this.setSelection(h.row, h.col, 1, 1);
    this.geo?.showCell(h.row, h.col, "center");
    this.draw();
    return hits.length;
  }
  /** 替换所有命中（可撤销）。返回替换个数。 */
  replaceAll(search, replace, opts = {}) {
    if (!this.sheet) return 0;
    const hits = findAll(this.sheet, search, opts);
    if (hits.length === 0) return 0;
    this.wb.undoManager().do(replaceCommand(this.sheet, hits, search, replace, opts.matchCase ?? false));
    this.wb.requestRecalc();
    this.draw();
    return hits.length;
  }
  /** 排序区域（多关键字，可撤销）。 */
  sortRange(range2, keys, hasHeader = false) {
    if (!this.sheet) return;
    this.wb.undoManager().do(sortRangeCommand(this.sheet, new Range(range2.row, range2.col, range2.rowCount, range2.colCount), keys, hasHeader));
    this.wb.requestRecalc();
    this.draw();
  }
  // ── M26 数据工具（文本分列 / 删除重复 / 合并计算，均可撤销）──────
  /** 文本分列：把选区（或传入 range）首列按分隔符/定宽拆到右侧多列。 */
  textToColumns(opts, range2) {
    if (!this.sheet) return;
    const r = range2 ? new Range(range2.row, range2.col, range2.rowCount, range2.colCount) : this.primary() ?? new Range(0, 0, 1, 1);
    this.wb.undoManager().do(textToColumnsCommand(this.sheet, r, opts));
    this.wb.requestRecalc();
    this.draw();
    this.forwardEvent("cmx-cell-edited", { addr: this.getActiveAddr() });
  }
  /** 删除重复行：返回删除行数。 */
  removeDuplicates(opts = {}, range2) {
    if (!this.sheet) return 0;
    const r = range2 ? new Range(range2.row, range2.col, range2.rowCount, range2.colCount) : this.primary() ?? new Range(0, 0, 1, 1);
    const { command, removed } = removeDuplicatesCommand(this.sheet, r, opts);
    this.wb.undoManager().do(command);
    this.wb.requestRecalc();
    this.draw();
    this.forwardEvent("cmx-cell-edited", { addr: this.getActiveAddr() });
    return removed;
  }
  /** 合并计算：多源区按位置/分类聚合到 target 为左上的区域，可撤销。 */
  consolidate(target, sources, opts = {}) {
    if (!this.sheet) return;
    const srcRanges = sources.map((s) => new Range(s.row, s.col, s.rowCount, s.colCount));
    this.wb.undoManager().do(consolidateCommand(this.sheet, target.row, target.col, srcRanges, opts));
    this.wb.requestRecalc();
    this.draw();
    this.forwardEvent("cmx-cell-edited", { addr: this.getActiveAddr() });
  }
  /** 设自动筛选区域（首行为表头）。null 清除。 */
  setAutoFilter(range2) {
    this.sheet?.setAutoFilter(range2);
    this.afterFilterChange();
  }
  /** 设某列筛选条件并应用。 */
  applyFilter(col, criterion) {
    this.sheet?.setFilterCriterion(col, criterion);
    this.afterFilterChange();
  }
  /** 清除全部筛选条件（保留筛选区域）。 */
  clearFilter() {
    this.sheet?.clearFilters();
    this.afterFilterChange();
  }
  afterFilterChange() {
    this.rows?.invalidate();
    this.vp?.bumpStructure();
    this.draw();
  }
  /** 筛选下拉面板（M11）：列出唯一值多选 + 排序/清除。 */
  showFilterPanel(col, x, y) {
    if (!this.sheet || !this.shadowRoot) return;
    this.hideFilterPanel();
    const doc = this.ownerDocument;
    const af = this.sheet.autoFilter;
    if (!af) return;
    const panel = doc.createElement("div");
    panel.className = "cmx-filter-panel";
    panel.setAttribute("data-cmx-filter", "true");
    const uniques = this.sheet.filterUniqueValues(col);
    const existing = af.criteria.get(col)?.values;
    const sortAsc = doc.createElement("div");
    sortAsc.className = "cmx-filter-btn";
    sortAsc.textContent = "\u2191 \u5347\u5E8F";
    const sortDesc = doc.createElement("div");
    sortDesc.className = "cmx-filter-btn";
    sortDesc.textContent = "\u2193 \u964D\u5E8F";
    sortAsc.addEventListener("mousedown", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      this.sortByFilterCol(col, true);
      this.hideFilterPanel();
    });
    sortDesc.addEventListener("mousedown", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      this.sortByFilterCol(col, false);
      this.hideFilterPanel();
    });
    panel.appendChild(sortAsc);
    panel.appendChild(sortDesc);
    const sep = doc.createElement("div");
    sep.className = "cmx-menu-sep";
    panel.appendChild(sep);
    const list = doc.createElement("div");
    list.className = "cmx-filter-list";
    const checks = [];
    for (const v of uniques) {
      const row = doc.createElement("label");
      row.className = "cmx-filter-item";
      const cb = doc.createElement("input");
      cb.type = "checkbox";
      cb.checked = !existing || existing.includes(v);
      const span = doc.createElement("span");
      span.textContent = v === "" ? "(\u7A7A\u767D)" : v;
      row.appendChild(cb);
      row.appendChild(span);
      list.appendChild(row);
      checks.push({ v, cb });
    }
    panel.appendChild(list);
    const bar = doc.createElement("div");
    bar.className = "cmx-filter-bar";
    const apply = doc.createElement("button");
    apply.className = "cmx-filter-apply";
    apply.textContent = "\u786E\u5B9A";
    const clear = doc.createElement("button");
    clear.className = "cmx-filter-clear";
    clear.textContent = "\u6E05\u9664";
    apply.addEventListener("mousedown", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const selected = checks.filter((c) => c.cb.checked).map((c) => c.v);
      this.applyFilter(col, selected.length === checks.length ? null : { values: selected });
      this.hideFilterPanel();
    });
    clear.addEventListener("mousedown", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      this.applyFilter(col, null);
      this.hideFilterPanel();
    });
    bar.appendChild(apply);
    bar.appendChild(clear);
    panel.appendChild(bar);
    panel.style.cssText = `position:absolute;left:${x}px;top:${y}px;z-index:1000;`;
    this.stageEl.appendChild(panel);
    this._filterPanel = panel;
    const closeOnOut = (ev) => {
      if (this._filterPanel && !this._filterPanel.contains(ev.target)) {
        this.hideFilterPanel();
        doc.removeEventListener("mousedown", closeOnOut);
      }
    };
    setTimeout(() => doc.addEventListener("mousedown", closeOnOut), 0);
  }
  _filterPanel = null;
  hideFilterPanel() {
    if (this._filterPanel && this._filterPanel.parentNode) this._filterPanel.parentNode.removeChild(this._filterPanel);
    this._filterPanel = null;
  }
  sortByFilterCol(col, ascending) {
    const af = this.sheet?.autoFilter;
    if (!af) return;
    this.sortRange(af.range, [{ col, ascending }], true);
  }
  // ── M12 数据验证 / 超链接 / 复选框 ─────────────────────
  /** 设数据验证规则（M12）。 */
  setDataValidation(rule) {
    this.sheet?.setDataValidation(rule);
    this.draw();
  }
  /** 读命中某格的验证规则。 */
  getDataValidation(row, col) {
    return this.sheet?.getValidationAt(row, col) ?? null;
  }
  /** 清除验证规则（缺省清全部）。 */
  clearDataValidation(range2) {
    this.sheet?.clearDataValidation(range2);
    this.draw();
  }
  /** 设/清超链接。 */
  setHyperlink(row, col, link) {
    this.sheet?.setHyperlink(row, col, link);
    this.draw();
  }
  getHyperlink(row, col) {
    return this.sheet?.getHyperlink(row, col) ?? null;
  }
  // ── M13 富文本 / 条件格式 ─────────────────────────────
  /** 设富文本（M13）：runs 混合字体/色；value 同步纯文本。 */
  setRichText(row, col, rich) {
    this.sheet?.setRichText(row, col, rich);
    this.wb.requestRecalc();
    this.draw();
  }
  getRichText(row, col) {
    return this.sheet?.getRichText(row, col) ?? null;
  }
  /** 加条件格式规则（M13）。 */
  addConditionalRule(rule) {
    this.sheet?.addConditionalRule(rule);
    this.draw();
  }
  /** 移除第 index 条条件格式规则。 */
  removeConditionalRule(index) {
    this.sheet?.removeConditionalRule(index);
    this.draw();
  }
  /** 列出全部条件格式规则。 */
  listConditionalRules() {
    return this.sheet?.listConditionalRules() ?? [];
  }
  /** 清除全部条件格式规则。 */
  clearConditionalRules() {
    this.sheet?.clearConditionalRules();
    this.draw();
  }
  // ── M14 浮动对象 / 批注 ────────────────────────────────
  /** 批注 get/set。 */
  addComment(row, col, comment) {
    this.sheet?.setComment(row, col, comment);
    this.draw();
  }
  getComment(row, col) {
    return this.sheet?.getComment(row, col) ?? null;
  }
  removeComment(row, col) {
    this.sheet?.setComment(row, col, null);
    this.draw();
  }
  /** 插入图片（M14）：双格锚点 + base64/URL src。返回对象 id。 */
  insertImage(anchor, src, id) {
    const oid = id ?? this.nextObjectId("img");
    this.sheet?.addFloatingObject({ id: oid, kind: "image", anchor, src });
    if (src) this.loadImage(src);
    this.draw();
    return oid;
  }
  /** 插入图表（M14）：双格锚点 + 图表规格。返回对象 id。 */
  insertChart(anchor, chart, id) {
    const oid = id ?? this.nextObjectId("chart");
    this.sheet?.addFloatingObject({ id: oid, kind: "chart", anchor, chart });
    this.draw();
    return oid;
  }
  /** 插入形状（M14）。 */
  insertShape(anchor, shape, id) {
    const oid = id ?? this.nextObjectId("shape");
    this.sheet?.addFloatingObject({ id: oid, kind: "shape", anchor, shape });
    this.draw();
    return oid;
  }
  // ── M21 迷你图 ─────────────────────────────────────────
  /** 设某格迷你图（line/area/column/winloss/bar/pie/bullet + 数据源区域）。 */
  setSparkline(row, col, spec) {
    this.sheet?.setSparkline(row, col, spec);
    this.draw();
  }
  /** 读某格迷你图，无返回 null。 */
  getSparkline(row, col) {
    return this.sheet?.getSparkline(row, col) ?? null;
  }
  /** 清除某格迷你图。 */
  clearSparkline(row, col) {
    this.sheet?.clearSparkline(row, col);
    this.draw();
  }
  removeFloatingObject(id) {
    this.sheet?.removeFloatingObject(id);
    this.draw();
  }
  listFloatingObjects() {
    return this.sheet?.listFloatingObjects() ?? [];
  }
  _objSeq = 0;
  nextObjectId(prefix) {
    return `${prefix}_${++this._objSeq}`;
  }
  /** 图片缓存：加载 src → HTMLImageElement 供渲染 drawImage。 */
  _imageCache = /* @__PURE__ */ new Map();
  loadImage(src) {
    if (this._imageCache.has(src)) return;
    try {
      const img = new this.ownerDocument.defaultView.Image();
      img.onload = () => this.draw();
      img.src = src;
      this._imageCache.set(src, img);
      if (this.renderer) this.renderer.imageCache = this._imageCache;
    } catch {
    }
  }
  /** 批注弹框（M14）：点击三角标记时弹只读框（含作者）。 */
  showCommentBox(row, col, x, y) {
    if (!this.shadowRoot) return;
    this.hideCommentBox();
    const c = this.sheet?.getComment(row, col);
    if (!c) return;
    const doc = this.ownerDocument;
    const box = doc.createElement("div");
    box.className = "cmx-comment-box";
    if (c.author) {
      const a = doc.createElement("div");
      a.className = "cmx-comment-author";
      a.textContent = c.author;
      box.appendChild(a);
    }
    const t = doc.createElement("div");
    t.className = "cmx-comment-text";
    t.textContent = c.text;
    box.appendChild(t);
    box.style.cssText = `position:absolute;left:${x + 4}px;top:${y}px;z-index:1002;`;
    this.stageEl.appendChild(box);
    this._commentBox = box;
    const close = (ev) => {
      if (this._commentBox && !this._commentBox.contains(ev.target)) {
        this.hideCommentBox();
        doc.removeEventListener("mousedown", close);
      }
    };
    setTimeout(() => doc.addEventListener("mousedown", close), 0);
  }
  _commentBox = null;
  hideCommentBox() {
    if (this._commentBox && this._commentBox.parentNode) this._commentBox.parentNode.removeChild(this._commentBox);
    this._commentBox = null;
  }
  // ── M15 打印 / PDF / HTML 导出 ─────────────────────────
  /** 设页面设置（合并）。 */
  setPageSetup(setup) {
    this.sheet?.setPageSetup(setup);
  }
  getPageSetup() {
    return this.sheet?.getPageSetup() ?? null;
  }
  /** 设打印区域。 */
  setPrintArea(area) {
    this.sheet?.setPrintArea(area);
  }
  /** 导出 HTML（默认完整文档）。 */
  exportHtml(opts = {}) {
    return this.sheet ? exportHtml(this.sheet, { fullDocument: true, ...opts }) : "";
  }
  /** 导出 PDF 字节。 */
  exportPdf() {
    return this.sheet ? exportPdf(this.sheet) : new Uint8Array();
  }
  /** 预览分页数（{pagesWide, pagesTall, total}）。 */
  getPageCount() {
    if (!this.sheet) return { pagesWide: 0, pagesTall: 0, total: 0 };
    const pg = computePages(this.sheet);
    return { pagesWide: pg.pagesWide, pagesTall: pg.pagesTall, total: pg.pages.length };
  }
  /** 浏览器打印：把当前 sheet 渲染成打印友好 HTML，开新窗口 print。 */
  print() {
    if (!this.sheet) return;
    const html = exportHtml(this.sheet, { fullDocument: true, title: this.sheet.name() });
    const win = this.ownerDocument.defaultView?.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    try {
      win.focus();
      win.print();
    } catch {
    }
  }
  /** 把区域标记为复选框类型（M12，可撤销经 applyStyleCommand 语义——这里直接设样式）。 */
  setCheckbox(range2, on = true) {
    if (!this.sheet) return;
    const r = new Range(range2.row, range2.col, range2.rowCount, range2.colCount);
    const patch = on ? { cellType: "checkbox" } : {};
    this.wb.undoManager().do(applyStyleCommand(this.sheet, [r], patch));
    if (!on) r.forEachCell((rr, cc) => {
      const st = this.sheet.getStyle(rr, cc);
      if (st?.cellType) {
        const { cellType, ...rest } = st;
        void cellType;
        this.sheet.setStyle(rr, cc, rest);
      }
    });
    this.draw();
  }
  /** 超链接打开（宿主可经 cmx-hyperlink 事件拦截；默认 window.open）。 */
  openHyperlink(row, col, url) {
    const ev = new CustomEvent("cmx-hyperlink", { detail: { row, col, url }, bubbles: true, composed: true, cancelable: true });
    const notCancelled = this.dispatchEvent(ev);
    if (notCancelled) {
      try {
        this.ownerDocument.defaultView?.open(url, "_blank", "noopener");
      } catch {
      }
    }
  }
  /** 数据验证失败提示（M12）：短暂气泡提示。 */
  showValidationTip(row, col, message) {
    if (!this.shadowRoot) return;
    this.hideValidationTip();
    const rect = this.geo?.getCellRect(row, col);
    const doc = this.ownerDocument;
    const tip = doc.createElement("div");
    tip.className = "cmx-validation-tip";
    tip.textContent = message;
    tip.style.cssText = `position:absolute;left:${rect ? rect.x : 20}px;top:${rect ? rect.y + rect.height : 40}px;z-index:1002;`;
    this.stageEl.appendChild(tip);
    this._valTip = tip;
    setTimeout(() => this.hideValidationTip(), 2600);
  }
  _valTip = null;
  hideValidationTip() {
    if (this._valTip && this._valTip.parentNode) this._valTip.parentNode.removeChild(this._valTip);
    this._valTip = null;
  }
  /** 查找框（M11，Ctrl+F 唤起）：输入即高亮定位 + 上/下轮转 + 替换。 */
  showFindBox() {
    if (!this.shadowRoot || this._findBox) return;
    const doc = this.ownerDocument;
    const box = doc.createElement("div");
    box.className = "cmx-find-box";
    const input = doc.createElement("input");
    input.placeholder = "\u67E5\u627E\u2026";
    const count = doc.createElement("span");
    count.className = "cmx-find-count";
    count.textContent = "";
    const prev = doc.createElement("button");
    prev.textContent = "\u25B2";
    const next = doc.createElement("button");
    next.textContent = "\u25BC";
    const close = doc.createElement("button");
    close.textContent = "\u2715";
    let idx = 0;
    const run = (delta) => {
      const q = input.value;
      if (!q) {
        count.textContent = "";
        return;
      }
      idx += delta;
      const total = this.findAndSelect(q, idx, {});
      if (!total) {
        count.textContent = "0/0";
        return;
      }
      const cur = (idx % total + total) % total;
      count.textContent = `${cur + 1}/${total}`;
    };
    input.addEventListener("input", () => {
      idx = 0;
      run(0);
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        run(e.shiftKey ? -1 : 1);
      }
      if (e.key === "Escape") {
        e.preventDefault();
        this.hideFindBox();
      }
    });
    prev.addEventListener("mousedown", (e) => {
      e.preventDefault();
      run(-1);
    });
    next.addEventListener("mousedown", (e) => {
      e.preventDefault();
      run(1);
    });
    close.addEventListener("mousedown", (e) => {
      e.preventDefault();
      this.hideFindBox();
    });
    box.append(input, count, prev, next, close);
    this.stageEl.appendChild(box);
    this._findBox = box;
    input.focus();
  }
  _findBox = null;
  hideFindBox() {
    if (this._findBox && this._findBox.parentNode) this._findBox.parentNode.removeChild(this._findBox);
    this._findBox = null;
    this.canvasEl.focus();
  }
  /** 行分组（入撤销栈）。 */
  groupRows(start, count) {
    if (!this.sheet) return;
    this.wb.undoManager().do(groupRowsCommand(this.sheet, start, count));
    this.afterOutlineChange();
  }
  /** 列分组（入撤销栈）。 */
  groupColumns(start, count) {
    if (!this.sheet) return;
    this.wb.undoManager().do(groupColumnsCommand(this.sheet, start, count));
    this.afterOutlineChange();
  }
  /** 取消行分组（移除覆盖 index 的最内层，入栈）。 */
  ungroupRows(index) {
    if (!this.sheet) return;
    this.wb.undoManager().do(ungroupRowsCommand(this.sheet, index));
    this.afterOutlineChange();
  }
  /** 取消列分组（入栈）。 */
  ungroupColumns(index) {
    if (!this.sheet) return;
    this.wb.undoManager().do(ungroupColumnsCommand(this.sheet, index));
    this.afterOutlineChange();
  }
  /** 折叠/展开某轴第 index 个分组（视图态，不入栈）。 */
  collapseGroup(axis, groupIndex, collapsed) {
    if (!this.sheet) return;
    const ax = axis === "row" ? this.sheet.rowOutlines : this.sheet.columnOutlines;
    ax.setCollapsedAt(groupIndex, collapsed);
    this.afterOutlineChange();
  }
  /** 层级切换（1-based；1=最折叠，maxLevel+2=全展开）。不入栈。 */
  setOutlineLevel(axis, level) {
    if (!this.sheet) return;
    const ax = axis === "row" ? this.sheet.rowOutlines : this.sheet.columnOutlines;
    ax.collapseToLevel(level);
    this.afterOutlineChange();
  }
  /** 全部展开某轴。 */
  expandAll(axis) {
    if (!this.sheet) return;
    const ax = axis === "row" ? this.sheet.rowOutlines : this.sheet.columnOutlines;
    ax.expandAll();
    this.afterOutlineChange();
  }
  /** 汇总行位置（true=明细下方，默认）。重算占位/可见性。 */
  setSummaryBelow(below) {
    if (!this.sheet) return;
    this.sheet.summaryBelow = below !== false;
    this.afterOutlineChange();
  }
  /** 汇总列位置（true=明细右侧，默认）。 */
  setSummaryRight(right) {
    if (!this.sheet) return;
    this.sheet.summaryRight = right !== false;
    this.afterOutlineChange();
  }
  setZoom(z) {
    if (!this.vp) return;
    this.vp.zoom = z;
    this.draw();
  }
  getZoom() {
    return this.vp?.zoom ?? 1;
  }
  // ── 几何直通（M6：供 getWorkbook() 逃生舱适配器定位徽标/滚动/命中）──────
  // 消费方（designer.js/report-applier.js）经 wrapper.getWorkbook().getActiveSheet()
  // 调 旧内核 原生几何 API：getCellRect / getViewport*Row·Column / showCell / hitTest / zoom。
  // 这里把 SheetGeometry 薄薄暴露出来，坐标系与 旧内核 对齐（相对画布宿主、含滚动/缩放/头偏移）。
  /** 单元格/合并区屏幕矩形（相对画布宿主）。对齐 ws.getCellRect(r,c[,rs,cs])。 */
  getCellRect(row, col, rowCount = 1, colCount = 1) {
    return this.geo ? this.geo.getCellRect(row, col, rowCount, colCount) : null;
  }
  /** 视口顶部可见行（对齐 ws.getViewportTopRow(1)）。 */
  getViewportTopRow() {
    return this.geo?.getViewportTopRow() ?? 0;
  }
  /** 视口底部可见行。 */
  getViewportBottomRow() {
    return this.geo?.getViewportBottomRow() ?? 0;
  }
  /** 视口左侧可见列。 */
  getViewportLeftColumn() {
    return this.geo?.getViewportLeftColumn() ?? 0;
  }
  /** 视口右侧可见列。 */
  getViewportRightColumn() {
    return this.geo?.getViewportRightColumn() ?? 0;
  }
  /** 滚动使单元格可见。对齐 ws.showCell(row,col,vAlign,hAlign)——数字对齐参映射到 start/center/end。 */
  showCell(row, col, align = "start") {
    if (!this.geo || !this.vp) return;
    const a = typeof align === "number" ? align === 1 ? "center" : align === 0 ? "end" : "start" : align;
    this.geo.showCell(row, col, a);
    this.geo.clampScroll();
    this.draw();
  }
  /** 屏幕点（相对画布宿主）命中的单元格。落在数据区外返回 null。供 wb.hitTest 归一。 */
  hitTestPoint(x, y) {
    if (!this.geo) return null;
    const hi = this.geo.hitTest(x, y);
    if (hi.area !== "viewport" || hi.row < 0 || hi.col < 0) return null;
    return { row: hi.row, col: hi.col };
  }
  /** 缩放读写（对齐 ws.zoom()/ws.zoom(factor)）。无参读、带参写。 */
  zoom(factor) {
    if (factor === void 0) return this.getZoom();
    this.setZoom(factor);
    return factor;
  }
  showGridlines(on) {
    if (this.renderer) {
      this.renderer.showGridlines = on !== false;
      this.draw();
    }
  }
  showHeaders(on) {
    if (this.renderer) {
      this.renderer.showHeaders = on !== false;
      this.draw();
    }
  }
  showFormulaBar(on) {
    this.barEl.classList.toggle("cmx-hidden", on === false);
  }
  showTabs(on) {
    this.tabHostEl.classList.toggle("cmx-hidden", on === false);
  }
  /** 主题：'light' | 'dark' | 'auto'（auto 跟随宿主 prefers-color-scheme）。 */
  setTheme(mode2) {
    this.themeMode = mode2;
    if (this.mql && this.mqlHandler) {
      try {
        this.mql.removeEventListener("change", this.mqlHandler);
      } catch {
      }
      this.mql = null;
      this.mqlHandler = null;
    }
    if (mode2 === "auto" && typeof window !== "undefined" && window.matchMedia) {
      this.mql = window.matchMedia("(prefers-color-scheme: dark)");
      this.mqlHandler = () => this.applyResolvedTheme();
      try {
        this.mql.addEventListener("change", this.mqlHandler);
      } catch {
      }
    }
    this.applyResolvedTheme();
  }
  getTheme() {
    return this.themeMode;
  }
  applyResolvedTheme() {
    const dark = this.themeMode === "dark" ? true : this.themeMode === "light" ? false : !!(typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
    this.darkResolved = dark;
    this.rootEl.classList.toggle("cmx-dark", dark);
    if (this.renderer) {
      this.renderer.theme = dark ? DARK_THEME : LIGHT_THEME;
      this.renderer.chartTheme = dark ? DARK_CHART_THEME : LIGHT_CHART_THEME;
    }
    this.draw();
  }
  // 选区/读值（宿主读）
  getActiveAddr() {
    return this.ctrl?.getActiveAddr() ?? "A1";
  }
  readSelection() {
    const p = this.primary();
    if (!p) return this.getActiveAddr();
    const a = formatAddr(p.row, p.col);
    const b = formatAddr(p.lastRow, p.lastCol);
    return a === b ? a : `${a}:${b}`;
  }
  /** 活动格样式态（供属性面板/工具栏回显）。 */
  getSelectionState() {
    const empty = { addr: "A1", selection: "A1", style: {}, value: null, formula: "" };
    if (!this.sheet) return empty;
    const ar = this.sheet.getActiveRowIndex();
    const ac = this.sheet.getActiveColumnIndex();
    return {
      addr: formatAddr(ar, ac),
      selection: this.readSelection(),
      style: this.sheet.getResolvedStyle(ar, ac),
      value: this.sheet.getValue(ar, ac),
      formula: this.sheet.getFormula(ar, ac)
    };
  }
  /** 强制重绘（宿主改了 workbook 后调）。 */
  refresh() {
    this.tabstrip?.render();
    this.invalidateMetrics();
    this.draw();
  }
};
if (typeof customElements !== "undefined" && !customElements.get("cmx-megasheet")) {
  customElements.define("cmx-megasheet", CmxMegasheet);
}

// src/index.ts
var VERSION = "7.5.2";
export {
  AxisMetrics,
  BUILTIN_NAMES,
  BuiltinRegistry,
  CellEditor,
  CellRange,
  Clipboard,
  CmxMegasheet,
  CommandManager,
  DARK_CHART_THEME,
  DARK_THEME,
  DependencyGraph,
  EMPTY_STYLE,
  Evaluator,
  EventEmitter,
  FormulaEngine,
  InteractionController,
  LIGHT_CHART_THEME,
  LIGHT_THEME,
  OUTLINE_LEVEL_STEP,
  OutlineAxis,
  PdfPage,
  REPORT_FETCH_NAMES,
  Range,
  ReportValueMap,
  SCROLLBAR_SIZE,
  SNAPSHOT_FORMAT,
  SNAPSHOT_VERSION,
  SelectionModel,
  SheetGeometry,
  SheetRenderer,
  SheetTabStrip,
  SparseMatrix,
  StyleSheet,
  UndoManager,
  VERSION,
  Viewport,
  Workbook,
  Worksheet,
  applyBorderCommand,
  applyFormat,
  applyStyleCommand,
  buildPdf,
  cellKey,
  clearCommand,
  clearStyleKeysCommand,
  colToLabel,
  commentMarker,
  compareCellValues,
  compileFormat,
  computePages,
  computeSortOrder,
  consolidateCommand,
  crc32,
  dateToSerial,
  deflateRaw,
  deleteColumnsCommand,
  deleteRowsCommand,
  drawChart,
  drawSparkline,
  evaluateRules,
  exportHtml,
  exportPdf,
  exportXlsx,
  extractDeps,
  fillCommand,
  findAll,
  formatAddr,
  formatCell,
  formatRange,
  formatValue,
  formatWith,
  toNumber as formulaToNumber,
  toText as formulaToText,
  freezeLineScreen,
  frozenBandSize,
  groupColumnsCommand,
  groupRowsCommand,
  hitHandle,
  hitObject,
  importSSJSON,
  importXlsx,
  indexStartToScreen,
  inferFill,
  inflateRaw,
  insertColumnsCommand,
  insertRowsCommand,
  isEmptyStyle,
  isError as isFormulaError,
  labelToCol,
  mergeCommand,
  mergeStyle,
  moveRangeCommand,
  normalizeFormula,
  outlinePaneThickness,
  paginate,
  parseAddr,
  parseClipboardHTML,
  parseCsv,
  parseFormula,
  parseRange,
  parseTSV,
  parseWorkbook,
  partsToSerial,
  pasteExternalCommand,
  pasteFormatCommand,
  registerReportFetchFunctions,
  removeDuplicatesCommand,
  replaceCommand,
  resizeHandles,
  resolveObjectRect,
  resolveScrollbars,
  resolveStyle,
  richToPlain,
  runUndoableCommand,
  screenToIndex,
  serialToParts,
  serialToTime,
  serializeCsv,
  serializeHTML,
  serializeTSV,
  setFormulaCommand,
  setValueCommand,
  sheetFromJSON,
  sheetToJSON,
  snapshotToXlsx,
  sortRangeCommand,
  ssjsonToSnapshot,
  stringifyWorkbook,
  textToColumnsCommand,
  thumbPosToScroll,
  timeToFraction,
  toCellValue,
  tokenize,
  ungroupColumnsCommand,
  ungroupRowsCommand,
  unmergeCommand,
  unzipSync,
  validateValue,
  workbookFromJSON,
  workbookToJSON,
  xlsxToSnapshot,
  zipSync
};
