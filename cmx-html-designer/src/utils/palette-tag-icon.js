import { PALETTE_ICON_POOL } from './palette-icon-pool.js';

/**
 * @param {string} str
 * @returns {number}
 */
function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * @param {number} seed
 * @returns {() => number}
 */
function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), seed | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** @template T @param {T[]} items @param {number} seed */
function seededShuffle(items, seed) {
  const out = items.slice();
  const rnd = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const poolLen = PALETTE_ICON_POOL.length;

/**
 * 左侧调色板每项图标的图标名（SAP UI Icons v4，与 `<ui5-icon name>` 一致）。
 * - 可选元数据字段 `paletteIcon` 手动指定；
 * - 否则在同一分组内按标签名排序后的序号，从该分组种子打乱的池中依次分配，尽量不重复。
 *
 * @param {{ tag?: string, paletteIcon?: string }} meta
 * @param {string} groupId 分组 id（如 ui5 / default）
 * @param {number} sortedIndexInGroup 在该分组排序后列表中的下标（从 0 起）
 * @returns {string}
 */
export function resolvePaletteTagIconName(meta, groupId, sortedIndexInGroup) {
  if (meta?.paletteIcon) return meta.paletteIcon;
  const seed = hashString(`${groupId}\npalette-tags`);
  const order = seededShuffle(PALETTE_ICON_POOL, seed);
  const idx = sortedIndexInGroup % poolLen;
  return order[idx];
}
