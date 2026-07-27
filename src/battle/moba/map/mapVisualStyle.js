// ============================================================================
//  battle/moba/map/mapVisualStyle.js — MOBA 地圖的色彩與量體語言
//
//  Milestone F 建立、Milestone G.1（Structure & Readability Pass）大改。
//  把「顏色 / 高度 / 寬度 / 疊層順序」從 renderer 抽出成單一調色盤，讓
//  renderer、rasterizer（tools/preview_moba_map.mjs）與 verifier 讀同一份數值。
//
//  art direction（ESMO 自有，不照抄任何既有 MOBA 地圖）：
//   · 底色偏冷暗橄欖綠；「路」是低彩度沙土（不是亮黃），「河」是低彩度灰藍綠
//     （不是塑膠藍）⇒ 兩者都靠**明度**與草地拉開，不靠彩度尖叫。
//   · 每一種地形至少三階：路 = 路面/路緣/路肩/草緣；河 = 深水/淺水/淺灘/泥岸/濕草。
//   · 岩體一律低飽和暖灰；藍紅只出現在主堡晶體、塔冠、Buff ⇒ 整張圖不會變彩色。
//
//  ⚠ 純資料，無 THREE / React。
// ============================================================================

/** 色票（0xRRGGBB）。分組即「地表語言」的層級。 */
export const PALETTE = Object.freeze({
  // ── 岩體 / 地圖外緣 ──────────────────────────────────────────────
  bedrock: 0x191d18,        // 地圖邊界外的岩盤（框住競技場）
  cliff_face: 0x4f4a42,     // 崖壁側面（暖灰）
  cliff_top: 0x6a6257,      // 崖頂受光面
  cliff_shadow: 0x2f2d28,   // 崖腳陰影投影帶

  // ── 草地（6 階：一般 / 斑塊 / 野區 ×2 / 樹蔭 / 空地）────────────────
  grass_arena: 0x35441f,     // 競技場主草地
  grass_arena_alt: 0x2b3818, // 主草地的暗斑塊（破除「一整片同色綠」）
  grass_arena_lit: 0x3c4c25, // 主草地的亮斑塊（受光坡面）
  grass_jungle: 0x27351a,    // 野區（較暗，讀成樹蔭下）
  grass_jungle_alt: 0x2c3d1d, // 野區次色（相鄰象限交替）
  grass_grove: 0x1d2a12,     // 樹叢暗斑（只是地面暗塊，不是 Bush/Tree Pack）
  grass_clearing: 0x455628,  // 野區空地（camp / buff 所在）

  // ── 高地草地（基地外圍，偏冷、偏亮 ⇒ 一眼看出「這裡是高地」）──────────
  grass_highland: 0x3d4b2c,
  grass_highland_alt: 0x455439,

  // ── 靠河潮濕帶（草 → 泥的第一階過渡）────────────────────────────
  grass_wet: 0x2c3a28,

  // ── 路（G.4：低彩度**土石路**，不是沙漠黃）───────────────────────────
  //  G.3 之前的路面是 #a38c62（彩度高、偏黃），在暗綠草地上讀成「亮黃測試色帶」。
  //  G.4 整組往灰褐移：保留與草地的**明度**落差（讀得出路），但把彩度壓掉一半，
  //  讓路看起來是被踩出來的碎石土路，而不是貼上去的顏色。
  //  G.9：再往「灰石土路」移一階（R 與 G 拉近 ⇒ 不再偏黃），仍保留與草地的明度落差。
  lane_surface: 0x7c776c,      // 中路路面（主戰線，最亮；灰褐石土）
  lane_surface_side: 0x686359, // 上/下路路面（壓暗一階 ⇒ 中路才是主戰線）
  lane_patch: 0x555046,        // 路面壓痕 / 車轍（使用痕跡，破除平塗）
  lane_inlay: 0x8a857a,        // 中路路心亮帶
  lane_edge: 0x4c483f,         // 路緣（碎石壓深一階 ⇒ 路面浮起來）
  lane_shoulder: 0x434430,     // 路肩（土草混合）
  lane_verge: 0x384021,        // 草緣（草地 → 路的最外一階）

  // ── 河（低彩度灰藍綠；深水 → 淺水 → 淺灘 → 泥岸 → 濕草，共 5 階）───────
  //  G.11：河水略降亮度 / 彩度（不要過亮），保留藍綠分層。
  river_deep: 0x264c58,     // 深水（河心）
  river_water: 0x39616d,    // 淺水（水面主色）
  river_shoal: 0x577880,    // 淺灘
  river_sand: 0x7c785c,     // 沙洲 / 淺瀨（河中露出的地）
  river_bank: 0x4a4a35,     // 泥岸
  river_stone: 0x555044,    // 河岸石 / 涉水點踏石

  // ── 目標區 ───────────────────────────────────────────────────────
  pit_floor: 0x262232,      // 坑底（兩坑共用，靠形狀分辨；G.2 提亮一階讓野怪剪影讀得出來）
  pit_dragon: 0x5b4480,     // Dragon 紫（僅用於光環/中央造型，刻意壓低彩度）
  pit_baron: 0x866423,      // Baron 琥珀（同上）

  // ── 基地 / 高地 ──────────────────────────────────────────────────
  // 平台刻意低飽和（偏石材而非隊色）：隊色留給主堡晶體與塔冠，
  // 否則基地會讀成「一塊藍色 UI 區塊」而不是高地地形。
  //  G.9：主堡平台大幅**去隊色**——改成中性灰石，只留極淡的冷/暖傾向。隊色留給
  //  主堡晶體 / 泉水 / 塔冠，基地地表才不會讀成「一整塊藍/紅 UI 色塊」。
  //  G.14：再往前一步——**兩方平台完全同色**的中性石板灰（原本 high_blue / high_red
  //  各帶一點冷／暖，兩邊地表就不可能真的對稱，而且遠看仍讀得出隊色）。
  //  陣營色現在只出現在：主堡晶體、泉水水面與水柱、塔冠、泉水點光源。
  base_apron: 0x4a4842,     // 高地平台（中性石板灰，兩方共用）
  base_apron_top: 0x5a5750, // 平台受光面 / 主堡內台（同色系亮一階）
  base_court: 0x4c4740,     // 高地內庭鋪面（中性石材，把平台切成三階）
  base_slab: 0x565049,      // G.9：石板地磚（受光縫）
  base_slab_alt: 0x413d37,  // G.9：石板地磚（暗縫，交錯 ⇒ 讀成一格一格石板）
  base_crack: 0x2c2a26,     // G.9：石板裂紋 / 縫隙暗線
  base_ramp: 0x6a6355,      // 三路出口坡道（土石鋪面，接得上路面色）
  nexus_blue: 0x4d95f0,
  nexus_red: 0xf0574d,

  // ── 塔（三種等級的底座明度不同 ⇒ 關掉標籤也讀得出層級）──────────────
  tower_stone: 0x5c564d,        // 塔身石材（雙方共用，靠冠色分辨）
  tower_plinth_outer: 0x3a352f, // 外塔（一塔）底座：最暗最小
  tower_plinth_inner: 0x474038, // 內塔（二塔）底座
  tower_plinth_high: 0x565045,  // 高地塔底座：最亮最大
  tower_plaza: 0x635c4c,        // 塔前廣場鋪面（比路面深一階，才讀得出「路口有個防禦節點」）
  camp_marker: 0x8ec63f,        // 野怪營地（保留給 minimap 等外部消費端）
  camp_floor: 0x4f4b31,         // 營地踩踏地（讓 camp 讀成「有東西住在這裡」）

  // ── 草叢 / Cover（G.6：低模草叢群，讀成「可藏人的遮蔽」而非平塗綠地）──────
  //  刻意壓在野區草地與空地之上一階、但比路面暗：草叢是「陰影下的視野遮蔽」，
  //  不是亮綠色貼紙。三階（暗叢 / 亮叢 / 地面投影）讓它在俯視也讀得出團塊感。
  bush_leaf: 0x2b3a1b,          // 草叢主葉（暗，讀成樹蔭下的灌木）
  bush_leaf_lit: 0x37481f,      // 草叢受光葉（頂部亮一階 ⇒ 有體積）
  bush_shade: 0x18220e,         // 草叢在地面的投影暗斑（讓團塊「坐」在地上）
  rock_shade: 0x1c2114,         // G.10：岩塊在地面的投影暗斑（讓散石「坐」在地上、與草地融合）
  grass_soft: 0x313f1e,         // G.10：草地柔和過渡斑（手繪感的中間色，破除硬色塊邊界）
  dirt_patch: 0x45412f,         // G.10：野區土斑（岩塊腳下的泥土，讓岩與草不是硬邊）

  // ── 溫泉 / 回補區 ────────────────────────────────────────────────
  fountain_pad: 0x6b675d,       // 溫泉平台石材
  fountain_step: 0x87816f,      // 池緣台階（平台與水面之間的一階）
  fountain_rim: 0x6d6a60,       // 池緣
  fountain_water_blue: 0x2b7fb8,// 藍方泉水
  fountain_water_red: 0xb8503f, // 紅方泉水
});

/**
 * 量體（牆段）的側面/頂面色。key = wallItem.kind。
 * 同為岩石但分五階明度：崖 > 野區牆 > 坑壁 > 基地城牆 > 主堡內牆。
 */
export const VOLUME_COLOR = Object.freeze({
  cliff: { face: 0x4f4a42, top: 0x6f665a },
  cliff_mass: { face: 0x4a453d, top: 0x6a6156 },
  wall: { face: 0x574f46, top: 0x6b6157 },
  //  G.10/G.11：野區短弧低岩壁——**灰褐**低模岩（比 G.10 再灰一階，不過度單一暖色）。
  rock: { face: 0x565049, top: 0x6e6659 },
  jungle_struct: { face: 0x5c5349, top: 0x746a5d },  // 野區路線結構（比同心弧牆亮半階 ⇒ 讀成「刻意的分隔牆」）
  pit_wall: { face: 0x453f38, top: 0x5a5249 },
  base_rim: { face: 0x565048, top: 0x6e6659 },      // 高地外牆（城牆感）
  base_keep: { face: 0x615a4f, top: 0x7b7263 },     // 主堡內牆
  base_gate: { face: 0x655d51, top: 0x847a68 },     // 城門墩 / 稜堡（最亮的石材）
  entrance_taper: { face: 0x4e4840, top: 0x635b50 },// 入口岩壁收口（比主牆暗一階）
  fountain_rim: { face: 0x605c53, top: 0x7a756a },  // 溫泉池緣
  river_stone: { face: 0x555044, top: 0x6a6353 },
});

/** 取色。renderer / rasterizer / verifier 一律走這個函式，避免各處硬寫 hex。 */
export const color = (key) => {
  const c = PALETTE[key];
  if (c === undefined) throw new Error(`mapVisualStyle: 未定義的色票 "${key}"`);
  return c;
};

/**
 * 各地形帶的寬度（模擬單位，1 sim ≈ 1.7 世界單位）。
 *
 * ⚠ G.1：路的總佔地由 26 → 22，河的泥岸由 50 → 22（且改成寬窄變化的河灣，
 *   見 mapRiverStyle.js）。舊版數值讓上下路連成一圈粗黃環、河連成一條粗藍帶，
 *   整張圖被這兩條帶主導 ⇒ 讀不出「基地 → 高地塔 → 內塔 → 外塔 → 河」的層級。
 */
export const WIDTH = Object.freeze({
  lane_verge: 22,          // 草緣（最外一階過渡）
  lane_shoulder: 16.5,     // 路肩
  lane_edge: 13,           // 路緣
  lane_surface: 10.5,      // 路面
  lane_surface_mid: 12.5,  // mid lane 略寬 ⇒ 主戰線最明顯
  lane_inlay: 3.4,         // mid 路心亮帶
  lane_block_margin: 6,    // 牆體禁區 = 路面寬 + 此值（用同一 seed，確保禁區恆比路面寬）

  // 河（基準寬，實際寬度 = 基準 × mapRiverStyle 的寬度曲線 0.6 ~ 1.5）
  river_wetgrass: 36,
  river_bank: 25,
  river_shoal: 18.5,
  river_water: 14,
  river_deep: 7.5,
  ford: 30,                // 中路涉水點：河在此收成淺灘，但**必須比中路路面帶寬**，
                           //   否則整段河會被路蓋住，河讀起來就變成兩條互不相連的小溪
  pit_mouth: 24,           // 坑口水域（把坑併進河道的短河灣）
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
  //  G.14：城牆整體降一階 ⇒ 讀成「短段連續的低牆」而不是一圈參差的高石塊。
  //  三階順序不變（門墩 > 外牆 > 內牆），俯視仍讀得出「城牆＋城門」的層級。
  base_rim: 8.6,          // 高地外牆（G.1 7.5→11.5 太高，G.14 收回到 8.6）
  base_keep: 6.0,         // 主堡內牆
  base_gate: 10.4,        // 城門墩（缺口兩側，比城牆再高一階）
  fountain_rim: 4.4,      // 溫泉池緣矮牆
  entrance_taper: 5.0,    // 入口處的岩壁收口（由牆高遞減下來，不是獨立柱子）
  base_bastion: 9.6,      // 稜堡角墩
  base_platform: 3.6,     // 高地平台厚度
});

/**
 * 地面圖層的 y 高度（同一平面靠 y 排序決定覆蓋；間距 ≥0.03 避免 z-fighting）。
 *
 * 疊層邏輯（由下往上）：
 *   岩盤 → 主草地 → 主草斑塊 → 高地草 → 濕草 → 野區草 → 樹蔭 → 空地
 *   → 路的外三階（草緣/路肩/路緣）
 *   → 河的五階（泥岸/淺灘/淺水/深水/沙洲）
 *   → 路的內三階（塔前廣場/路面/路心）
 *   → 坑底 → 塔基座 → 基地平台
 *
 * ⚠ 河刻意夾在「路緣之上、路面之下」：河與 mid lane 幾何上必然交叉。
 *   河若整體在路之下，會被路的外圈截成好幾段（v1 實測河被切成兩截）；
 *   河若整體在路之上，中路會被河切斷 ⇒ 違反「中路是基地連基地的主戰線」。
 *   夾在中間 ⇒ 河保持連續，路面像跨過淺灘的涉水點一樣穿過去。
 */
export const LAYER_Y = Object.freeze({
  bedrock: 0.0,
  cliff_shadow: 0.02,
  arena: 0.06,
  arena_mottle: 0.09,
  highland: 0.12,
  river_wetgrass: 0.15,
  jungle: 0.18,
  grove: 0.21,
  clearing: 0.24,
  grass_soft: 0.105,   // G.10：草地柔和過渡斑（貼著主草地，破硬邊）
  dirt_patch: 0.235,   // G.10：野區土斑（岩塊腳下）
  rock_shade: 0.242,   // G.10：岩塊地面投影
  bush_shade: 0.245,   // 草叢地面投影：坐在野區草／空地之上，仍在路帶之下
  lane_verge: 0.28,
  lane_shoulder: 0.32,
  //  ⚠ 營地空地刻意排在「路肩之上、路緣之下」：gameData 的 Blue/Red Buff 就長在
  //    中路旁邊（選點規則只保證距三路 ≥5.5），空地若排在路的外圈之下會被草緣與路肩
  //    整個蓋掉 ⇒ 畫面上變成「一隻怪站在路上」，看不出那是一個營地。
  clearing_over_lane: 0.335,
  lane_edge: 0.36,
  river_bank: 0.40,
  river_shoal: 0.44,
  river_water: 0.48,
  river_deep: 0.52,
  river_sand: 0.56,
  lane_plaza: 0.60,
  lane_surface: 0.64,
  lane_patch: 0.67,
  lane_inlay: 0.70,
  pit_floor: 0.80,
  pit_ring: 0.86,
  tower_pad: 0.94,
  base_apron: 1.02,
});

/**
 * 高地平台**頂面**上的鋪面圖層（世界高度，不是 0..1 的地面層）。
 * 3D 中平台是 extrude 出來的量體（厚度 HEIGHT.base_platform），
 * 內庭/坡道/主堡台若還放在 y≈1 會整個埋進平台裡看不到 ⇒ 一律抬到平台頂面。
 */
export const BASE_TOP_Y = Object.freeze({
  court: HEIGHT.base_platform + 0.08,
  ramp: HEIGHT.base_platform + 0.14,
  keep: HEIGHT.base_platform + 0.20,
  fountain_pad: HEIGHT.base_platform + 0.26,
  fountain_walk: HEIGHT.base_platform + 0.30,
  fountain_step: HEIGHT.base_platform + 0.34,
  fountain_pool: HEIGHT.base_platform + 0.38,
});
