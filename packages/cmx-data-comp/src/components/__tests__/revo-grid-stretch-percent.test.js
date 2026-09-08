import { describe, it, expect } from 'vitest'
import { revoGridStretchMixin } from '../revo-grid/revo-grid-stretch-mixin.js'

/**
 * 构造一个挂载 stretch mixin 的 mock 实例，给定「主区净宽」和叶列（可带 _cmxPercent / size / pin），
 * 返回 _columnsForViewport() 计算后的叶列 size 数组。
 * _dataColumnViewportWidth 被直接 mock 返回精确 viewportWidth（= 主区净宽，不含冻结列/序号/滚动条），
 * 让测试聚焦于 stretch 百分比算法本身。含冻结列的用例，viewportWidth 传主区净宽（总宽 - 冻结列）。
 */
function computeSizes (viewportWidth, leaves, opts = {}) {
  const inst = Object.create(revoGridStretchMixin)
  inst._opts = { stretch: true, showRowIndex: false, rowIndexWidth: 40, ...opts }
  inst._revoColumns = leaves.map((l) => ({ ...l }))
  inst._revo = { clientWidth: viewportWidth }
  inst._host = { clientWidth: viewportWidth }
  inst._dataColumnViewportWidth = () => viewportWidth
  const out = inst._columnsForViewport()
  // 展开叶列（_columnsForViewport 可能返回新树，这里全是叶）
  return out.map((c) => c.size)
}

describe('revo-grid-stretch-mixin._columnsForViewport — 百分比列宽', () => {
  it('百分比列固定占视口 percent/100，普通列在剩余空间内 stretch 放大', () => {
    // available=1000；a=20%→200，b=30%→300；c=100px 在剩余 700 内放大 7x→700
    const sizes = computeSizes(1000, [
      { prop: 'a', _cmxPercent: 20 },
      { prop: 'b', _cmxPercent: 30 },
      { prop: 'c', size: 100 },
    ])
    expect(sizes[0]).toBe(200)
    expect(sizes[1]).toBe(300)
    expect(sizes[2]).toBe(500) // 剩余 500，100 放大 5x
  })

  it('百分比之和 = 100% 时，普通列无剩余空间保持原 base size', () => {
    // a=60%→600, b=40%→400；剩余 0；c 保持原 120
    const sizes = computeSizes(1000, [
      { prop: 'a', _cmxPercent: 60 },
      { prop: 'b', _cmxPercent: 40 },
      { prop: 'c', size: 120 },
    ])
    expect(sizes[0]).toBe(600)
    expect(sizes[1]).toBe(400)
    expect(sizes[2]).toBe(120) // 剩余为 0，不放大；总宽 1120 > 1000 → 横向滚动
  })

  it('百分比之和 > 100% 时，百分比列仍按字面值，允许总宽超出视口', () => {
    const sizes = computeSizes(1000, [
      { prop: 'a', _cmxPercent: 60 },
      { prop: 'b', _cmxPercent: 60 },
    ])
    expect(sizes[0]).toBe(600)
    expect(sizes[1]).toBe(600) // 总 1200 > 1000
  })

  it('纯百分比列（无普通列）总和 < 100% 时，剩余留白不强制铺满', () => {
    const sizes = computeSizes(1000, [
      { prop: 'a', _cmxPercent: 20 },
      { prop: 'b', _cmxPercent: 30 },
    ])
    expect(sizes[0]).toBe(200)
    expect(sizes[1]).toBe(300) // 总 500，剩 500 留白
  })

  it('无百分比列（纯 px）退化为旧行为：总和 < 视口则按比例放大铺满', () => {
    const sizes = computeSizes(1000, [
      { prop: 'a', size: 100 },
      { prop: 'b', size: 200 },
    ])
    // total=300 < 1000，scale=1000/3 ≈ 3.33；a≈333, b≈667
    expect(sizes[0] + sizes[1]).toBe(1000)
    expect(sizes[1]).toBeGreaterThan(sizes[0])
  })

  it('无百分比列总和 ≥ 视口时保持原 size（横向滚动）', () => {
    const sizes = computeSizes(500, [
      { prop: 'a', size: 300 },
      { prop: 'b', size: 300 },
    ])
    expect(sizes[0]).toBe(300)
    expect(sizes[1]).toBe(300)
  })

  it('stretch=false 时直接返回原列（不做任何计算）', () => {
    const inst = Object.create(revoGridStretchMixin)
    inst._opts = { stretch: false }
    inst._revoColumns = [{ prop: 'a', _cmxPercent: 20 }]
    inst._revo = { clientWidth: 1000 }
    const out = inst._columnsForViewport()
    expect(out).toBe(inst._revoColumns) // 同引用，未克隆
  })

  it("百分比取整：available * percent / 100 向下取整，至少 1px", () => {
    const sizes = computeSizes(333, [
      { prop: 'a', _cmxPercent: 10 }, // 33.3 → 33
    ])
    expect(sizes[0]).toBe(33)
  })

  it('支持多级表头：只对叶列应用百分比，父分组列透传', () => {
    const inst = Object.create(revoGridStretchMixin)
    inst._opts = { stretch: true, showRowIndex: false }
    inst._revoColumns = [
      { name: 'g', children: [
        { prop: 'a', _cmxPercent: 50 },
        { prop: 'b', size: 100 },
      ] },
    ]
    inst._revo = { clientWidth: 1000 }
    inst._host = { clientWidth: 1000 }
    inst._dataColumnViewportWidth = () => 1000
    const out = inst._columnsForViewport()
    expect(out[0].children[0].size).toBe(500) // 50% of 1000
    expect(out[0].children[1].size).toBe(500) // 剩余 500，100 放大 5x
    expect(out[0].size).toBeUndefined() // 父分组列不设 size
  })

  it('用户手动拖动锁定的列（_userColSizes）固定宽度，其余列 stretch', () => {
    // available=1000；a 被用户拖到 300（锁定）；b=100、c=200 在剩余 700 内 stretch
    const inst = Object.create(revoGridStretchMixin)
    inst._opts = { stretch: true, showRowIndex: false }
    inst._revoColumns = [
      { prop: 'a', size: 150 },        // base 150，但用户拖到 300 → 锁定 300
      { prop: 'b', size: 100 },
      { prop: 'c', size: 200 },
    ]
    inst._revo = { clientWidth: 1000 }
    inst._host = { clientWidth: 1000 }
    inst._dataColumnViewportWidth = () => 1000
    inst._userColSizes = new Map([['a', 300]])
    const out = inst._columnsForViewport()
    expect(out[0].size).toBe(300)       // 锁定值
    // b+c base=300，剩余 700，放大 700/3 ≈ 2.33x
    expect(out[1].size + out[2].size).toBe(700)
    expect(out[2].size).toBeGreaterThan(out[1].size)
  })

  it('用户锁定列 + 百分比列共存：两者都固定，普通列在剩余空间 stretch', () => {
    const inst = Object.create(revoGridStretchMixin)
    inst._opts = { stretch: true, showRowIndex: false }
    inst._revoColumns = [
      { prop: 'a', _cmxPercent: 20 },  // 20% → 200
      { prop: 'b', size: 100 },         // 用户拖到 250 → 锁定
      { prop: 'c', size: 100 },         // 普通，在剩余 550 内 stretch
    ]
    inst._revo = { clientWidth: 1000 }
    inst._host = { clientWidth: 1000 }
    inst._dataColumnViewportWidth = () => 1000
    inst._userColSizes = new Map([['b', 250]])
    const out = inst._columnsForViewport()
    expect(out[0].size).toBe(200) // 百分比固定
    expect(out[1].size).toBe(250) // 用户锁定固定
    expect(out[2].size).toBe(550) // 剩余 550，100 放大 5.5x
  })

  it('_userColSizes 为空 Map 时退化为纯 px 行为（无回归）', () => {
    const sizes = computeSizes(1000, [
      { prop: 'a', size: 100 },
      { prop: 'b', size: 200 },
    ])
    // total=300<1000，按比例放大；a≈333, b≈667
    expect(sizes[0] + sizes[1]).toBe(1000)
    expect(sizes[1]).toBeGreaterThan(sizes[0])
  })

  // ── 冻结列与 stretch 共存 ────────────────────────────────────────────────
  // 冻结列（pin=colPinStart/colPinEnd）保持各自固定宽度不参与拉伸；
  // 主区列在 (视口宽 - 冻结列总宽) 内按三档分配。兼顾"右侧冻结操作列 + 主区铺满"。
  it('右冻结列固定宽度，主区 px 列在主区净宽内 stretch 铺满', () => {
    // 主区净宽=800（不含 act 冻结 200）；a=100、b=200 在 800 内放大
    const sizes = computeSizes(800, [
      { prop: 'a', size: 100 },
      { prop: 'b', size: 200 },
      { prop: 'act', size: 200, pin: 'colPinEnd' },
    ])
    expect(sizes[2]).toBe(200)              // 冻结列原宽不变
    expect(sizes[0] + sizes[1]).toBe(800)   // 主区铺满净宽 800
    expect(sizes[1]).toBeGreaterThan(sizes[0]) // 按比例：b>a
  })

  it('右冻结列 + 主区百分比列：百分比相对主区净宽', () => {
    // 主区净宽=800（不含 act 冻结 200）；a=50% → 400；b=100 在剩余 400 内放大 4x
    const sizes = computeSizes(800, [
      { prop: 'a', _cmxPercent: 50 },
      { prop: 'b', size: 100 },
      { prop: 'act', size: 200, pin: 'colPinEnd' },
    ])
    expect(sizes[2]).toBe(200) // 冻结
    expect(sizes[0]).toBe(400) // 50% of 800
    expect(sizes[1]).toBe(400) // 剩余 400，100 放大 4x
  })

  it('左冻结列（colPinStart）同样固定宽度，主区列在净宽内 stretch', () => {
    const sizes = computeSizes(940, [
      { prop: 'sel', size: 60, pin: 'colPinStart' },
      { prop: 'a', size: 100 },
      { prop: 'b', size: 200 },
    ])
    expect(sizes[0]).toBe(60)                // 左冻结原宽
    expect(sizes[1] + sizes[2]).toBe(940)    // 主区铺满净宽 940
  })

  it('冻结列宽度被用户拖动锁定时优先取锁定值', () => {
    const inst = Object.create(revoGridStretchMixin)
    inst._opts = { stretch: true, showRowIndex: false }
    inst._revoColumns = [
      { prop: 'a', size: 100 },
      { prop: 'act', size: 200, pin: 'colPinEnd' }, // base 200，但用户拖到 260
    ]
    inst._revo = { clientWidth: 1000 }
    inst._host = { clientWidth: 1000 }
    inst._dataColumnViewportWidth = () => 740 // 主区净宽（不含冻结列 260）
    inst._userColSizes = new Map([['act', 260]])
    const out = inst._columnsForViewport()
    expect(out[1].size).toBe(260) // 用户锁定值优先于 base 200
    expect(out[0].size).toBe(740) // 主区铺满净宽 740
  })

  it('主区列 base 总和 ≥ 主区净宽时不拉伸（保持原宽，横向滚动）', () => {
    // 主区净宽=400（不含 act 冻结 100）；a=300、b=300 总 600>400 → 不放大
    const sizes = computeSizes(400, [
      { prop: 'a', size: 300 },
      { prop: 'b', size: 300 },
      { prop: 'act', size: 100, pin: 'colPinEnd' },
    ])
    expect(sizes[2]).toBe(100) // 冻结
    expect(sizes[0]).toBe(300) // 主区不拉伸
    expect(sizes[1]).toBe(300)
  })

  it('无冻结列时行为与旧实现完全一致（主区=全视口）', () => {
    const sizes = computeSizes(1000, [
      { prop: 'a', _cmxPercent: 20 }, // 200
      { prop: 'b', size: 100 },        // 剩余 800 放大 8x
    ])
    expect(sizes[0]).toBe(200)
    expect(sizes[1]).toBe(800)
  })

  // ── 百分比 + px base 略超：px 列收缩精确铺满，避免擦边横向滚动条 ────────
  // 场景：cr-todo 用 20% 单据号 + 其余 px 列。百分比占位后留给 px 列的空间
  // 比 px base 总和略小，旧逻辑"base >= 剩余就保持原宽"会导致总和溢出主区 → 横向滚动条。
  // 修复：有固定列时 px 列按比例收缩到剩余空间，精确铺满。
  it('有百分比列 + px base 略超剩余空间 → px 列收缩精确铺满（无滚动条）', () => {
    // 主区 available=838；单据号 20%→167；px base(110+180+150+90+150=680) > pxAvailable(671)
    const sizes = computeSizes(838, [
      { prop: 'id', size: 110 },
      { prop: 'doc_no', _cmxPercent: 20 },
      { prop: 'name', size: 180 },
      { prop: 'type', size: 150 },
      { prop: 'status', size: 90 },
      { prop: 'time', size: 150 },
    ])
    const docNo = sizes[1]
    const pxSum = sizes[0] + sizes[2] + sizes[3] + sizes[4] + sizes[5]
    expect(docNo).toBe(167)              // floor(838 × 0.20)
    expect(docNo + pxSum).toBe(838)      // 精确铺满主区，无溢出 → 无滚动条
  })

  it('有百分比列 + 冻结列 + px base 略超 → 仍精确铺满主区', () => {
    // 主区净宽=839（不含 act 冻结 200）；单据号 20%→167；
    // px base(680) > pxAvailable(672) → 收缩到 672；主区总=167+672=839
    const sizes = computeSizes(839, [
      { prop: 'id', size: 110 },
      { prop: 'doc_no', _cmxPercent: 20 },
      { prop: 'name', size: 180 },
      { prop: 'type', size: 150 },
      { prop: 'status', size: 90 },
      { prop: 'time', size: 150 },
      { prop: 'act', size: 200, pin: 'colPinEnd' },
    ])
    expect(sizes[6]).toBe(200) // 冻结操作列原宽
    const mainSum = sizes[0] + sizes[1] + sizes[2] + sizes[3] + sizes[4] + sizes[5]
    expect(mainSum).toBe(839) // 主区精确铺满净宽
    expect(sizes[1]).toBe(167) // 单据号 20% of 839
  })

  // ── _dataColumnViewportWidth fallback 语义：含冻结列时扣除冻结列总宽 ──────
  // 不 mock _dataColumnViewportWidth，走真实 fallback（mainVp 不存在），验证 available
  // 已扣除冻结列（_sumPinnedBaseWidth），与 mainVp 路径语义一致——这是面包屑返回页面
  // 后 stretch 不失效的关键（mainVp 路径天然不含冻结列，fallback 必须对齐）。
  it('_dataColumnViewportWidth fallback 扣除冻结列总宽（与 mainVp 路径语义一致）', () => {
    const inst = Object.create(revoGridStretchMixin)
    inst._opts = { stretch: true, showRowIndex: false, rowHeight: 32, minRows: 0 }
    inst._revoColumns = [
      { prop: 'a', size: 100 },
      { prop: 'act', size: 200, pin: 'colPinEnd' },
    ]
    inst._revo = { clientWidth: 1000, clientHeight: 0 }
    inst._host = { clientWidth: 1000, clientHeight: 0 }
    inst._rows = []
    // 不 mock _dataColumnViewportWidth → 走 fallback
    const w = inst._dataColumnViewportWidth()
    // full(1000) - rowHeader(0) - vscroll(0，无数据) - pinned(200) = 800
    expect(w).toBe(800)
  })

  it('_dataColumnViewportWidth 即使 mainVp 存在也走估算（避免有冻结列时 mainVp 偏高导致返回页面滚动条）', () => {
    const inst = Object.create(revoGridStretchMixin)
    inst._opts = { stretch: true, showRowIndex: false, rowHeight: 32, minRows: 0 }
    inst._revoColumns = [
      { prop: 'a', size: 100 },
      { prop: 'act', size: 200, pin: 'colPinEnd' },
    ]
    // 模拟 mainVp 存在且 clientWidth 偏高（1360 > 估算的可用 1350）
    inst._revo = {
      clientWidth: 1550, clientHeight: 0,
      querySelector: () => ({ clientWidth: 1360 }),
    }
    inst._host = { clientWidth: 1550, clientHeight: 0 }
    inst._rows = []
    const w = inst._dataColumnViewportWidth()
    // 必须走估算 = 1550 - 0 - 0 - 200(pinned) = 1350，而非 mainVp 的 1360
    expect(w).toBe(1350)
  })
})
