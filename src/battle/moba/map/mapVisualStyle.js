// ============================================================================
//  battle/moba/map/mapVisualStyle.js — MOBA 地圖視覺原型 v1 的色彩與量體語言
//
//  Milestone F。把「顏色 / 高度 / 寬度」從 renderer 抽出成單一調色盤，讓
//  renderer、rasterizer（tools/preview_moba_map.mjs）與 verifier 讀同一份數值。
//
//  art direction（ESMO 自有，不照抄任何既有 MOBA 地圖）：
//   · 底色偏冷暗橄欖綠，讓「路（暖沙）」與「河（冷灰藍）」成為畫面唯二亮帶。
//   · 岩體一律低飽和暖灰，藍紅只出現在基地/塔/目標，避免整張圖變彩色。
//   · 同一類地形至少兩個明度階（例：草地 4 階），避免大面積單色。
//  ⚠ 純資料，無 THREE / React。
// ============================================================================

/** 色票（0xRRGGBB）。分組即「地表語言」的層級。 */
export const PALETTE = Object.freeze({
  // ── 岩體 / 地圖外緣 ──────────────────────────────────────────────
  bedrock: 0x1b1f1a,        // 地圖邊界外的岩盤（框住競技場）
  cliff_face: 0x4f4a42,     // 崖壁側面（暖灰）
  cliff_top: 0x6a6257,      // 崖頂受光面
  cliff_shadow: 0x33302b,   // 崖腳陰影投影帶

  // ── 草地（4 階，避免一大片單色綠）────────────────────────────────
  grass_arena: 0x33421f,    // 競技場主草地
  grass_jungle: 0x27351a,   // 野區（較暗，讀成樹蔭下）
  grass_jungle_alt: 0x2c3d1d, // 野區次色（相鄰象限交替，破除單色）
  grass_clearing: 0x415227,  // 野區空地（camp / buff 所在）
  grass_grove: 0x1e2a12,     // 樹叢暗斑（只是地面暗塊，不是 Bush/Tree Pack）

  // ── 路（暖沙，畫面最亮）──────────────────────────────────────────
  lane_surface: 0xd8bb82,   // 路面
  lane_inlay: 0xe6cf9d,     // 路心亮帶（讓 mid 更突出）
  lane_edge: 0x5c4826,      // 路緣深色輪廓（壓深，讓路面浮起來）
  lane_shoulder: 0x7b6839,  // 路肩土色（路與草之間的過渡）

  // ── 河（冷灰藍，低飽和；不要塑膠亮藍）────────────────────────────
  river_water: 0x36657a,    // 水面主色
  river_deep: 0x2d4d5c,     // 深水
  river_shallow: 0x4d7d90,  // 淺灘
  river_bed: 0x22343d,      // 河床輪廓
  river_bank: 0x5b5c39,     // 河岸泥地
  river_stone: 0x555044,    // 河岸石

  // ── 目標區 ───────────────────────────────────────────────────────
  pit_floor: 0x1d1a24,      // 坑底（兩坑共用，靠形狀分辨）
  pit_dragon: 0x8f63d6,     // Dragon 紫（僅用於光環/中央造型）
  pit_baron: 0xc98a2c,      // Baron 琥珀

  // ── 基地 / 高地 ──────────────────────────────────────────────────
  // 平台刻意低飽和（偏石材而非隊色）：隊色留給主堡晶體與塔冠，
  // 否則基地會讀成「一塊藍色 UI 區塊」而不是高地地形。
  high_blue: 0x3a4a5e,      // 藍方高地平台（石材帶藍）
  high_red: 0x5e403f,       // 紅方高地平台（石材帶紅）
  high_blue_top: 0x4d6076,  // 平台受光面
  high_red_top: 0x765250,
  nexus_blue: 0x4d95f0,
  nexus_red: 0xf0574d,

  // ── 塔 ───────────────────────────────────────────────────────────
  tower_stone: 0x5c564d,    // 塔身石材（雙方共用，靠冠色分辨）
  tower_plinth: 0x3f3a34,   // 塔基座
  camp_marker: 0x8ec63f,    // 野怪營地
});

/**
 * 量體（牆段）的側面/頂面色。key = wallItem.kind。
 * 同為岩石但分四階明度：崖 > 野區牆 > 坑壁 > 基地 rim，讓「量體的種類」也能靠色辨識。
 */
export const VOLUME_COLOR = Object.freeze({
  cliff: { face: 0x4f4a42, top: 0x6f665a },
  cliff_mass: { face: 0x4a453d, top: 0x6a6156 },
  wall: { face: 0x574f46, top: 0x6b6157 },
  pit_wall: { face: 0x453f38, top: 0x5a5249 },
  base_rim: { face: 0x514b43, top: 0x655e54 },
  river_stone: { face: 0x555044, top: 0x6a6353 },
});

/** 取色。renderer / rasterizer / verifier 一律走這個函式，避免各處硬寫 hex。 */
export const color = (key) => {
  const c = PALETTE[key];
  if (c === undefined) throw new Error(`mapVisualStyle: 未定義的色票 "${key}"`);
  return c;
};

/** 各地形帶的寬度（模擬單位，1 sim ≈ 1.7 世界單位）。 */
export const WIDTH = Object.freeze({
  lane_shoulder: 26,
  lane_edge: 20,
  lane_surface: 13,
  lane_surface_mid: 16,   // mid lane 略寬 ⇒ 成為最明顯的對角線
  lane_inlay: 5,
  lane_block_margin: 6,   // 牆體禁區 = 路面寬 + 此值（用同一 seed，確保禁區恆比路面寬）
  river_bank: 50,
  river_bed: 38,
  river_water: 29,
  river_shallow: 12,
  pit_spur: 22,           // 坑口併入河道的河灣
});

/** 各量體的高度（three.js 世界單位；垂直不套 WORLD_SCALE）。 */
export const HEIGHT = Object.freeze({
  cliff_rim: 17,          // 競技場外緣崖
  cliff_corner: 21,       // 對角死角的崖體（形成戰場輪廓）
  jungle_wall: 9.5,       // 野區岩壁
  jungle_wall_var: 3.6,   // 逐段起伏幅度
  river_stone: 2.8,       // 河岸石
  pit_wall_dragon: 9.5,   // Dragon 坑壁（較矮、開口大）
  pit_wall_baron: 13.5,   // Baron 坑壁（較高、較封閉）
  base_rim: 7.5,
  base_platform: 3.6,     // 高地平台厚度
});

/**
 * 地面圖層的 y 高度（同一平面靠 y 排序決定覆蓋；間距 ≥0.04 避免 z-fighting）。
 *
 * ⚠ 河道刻意排在「路肩/路緣之上、路面之下」：
 *   河與 lane 幾何上必然交叉，若河整體在路之下，河會被 34 寬的路肩截成好幾段
 *   （v1 首版光柵圖實測：河被切成兩截、完全讀不出「一條貫穿中段的河」）。
 *   排在中間 ⇒ 河保持連續，只有窄窄的路面像涉水點一樣跨過去。
 */
export const LAYER_Y = Object.freeze({
  bedrock: 0.0,
  cliff_shadow: 0.02,
  arena: 0.06,
  jungle: 0.12,
  clearing: 0.18,
  lane_shoulder: 0.24,
  lane_edge: 0.32,
  river_bank: 0.40,
  river_bed: 0.46,
  river_water: 0.52,
  river_shallow: 0.58,
  lane_surface: 0.64,
  lane_inlay: 0.70,
  pit_floor: 0.80,
  pit_ring: 0.86,
  tower_pad: 0.94,
  base_apron: 1.02,
});
