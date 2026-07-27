// ============================================================================
//  battle/moba/map/mapMonsterShapes.js — 野怪 / 史詩野怪的 low poly 3D blockout
//  Milestone G.2 建立、G.3 全面重做（尺寸、articulation、群體站位）。
//
//  【G.2 的問題】剪影太小、組件太少：Buff 主怪伸展半徑只有 4.8、狼 3.3、石頭怪 2.2，
//  但營地空地半徑有 10.5~14 ⇒ 遠看就只是空地中間一個小點，讀成 marker 而不是怪。
//
//  【G.3 的目標】真正的 low poly **3D 實體**：有頭、頸、軀幹、四肢、尾、翼、
//  群體大小差。等級仍然只到 blockout（沒有動畫、沒有 AI、沒有血量、沒有貼圖），
//  但必須「一眼看得出是什麼生物」。
//
//  【單位約定】沿用專案慣例（同 wallItems）：
//    · dx / dy / r / w / d  = **模擬座標單位**（renderer 會乘 WORLD_SCALE）
//      dx = 生物的正前方、dy = 生物的側向（左右成對一律用 ±dy）
//    · z / h                = **世界高度單位**（垂直不套 WORLD_SCALE），z 是組件底部
//    · rot = 繞垂直軸；tiltF = 往正前方倒；tiltS = 往側邊倒
//
//  【血條預留】每隻怪都輸出 `headroom`（＝模型最高點 + HEADROOM_MARGIN）。
//  之後掛血條 / 名牌一律用這個高度，不用再重新量模型。
//
//  ⚠ 純資料、無 THREE/React、不使用 Math.random()（形體必須每次相同）。
//  ⚠ 座標來自 gameData 的 CAMPS / PITS（經 layout 傳入），不新增、不改動任何模擬實體。
//    群體站位是「同一個營地座標周邊的呈現用聚合」，不是新的模擬怪。
// ============================================================================

/** 用色（低彩度；重點色只給結晶 / 角 / 冠 / 眼，避免整隻怪變螢光）。 */
export const MONSTER_COLOR = Object.freeze({
  hide_dark: 0x3b352c,     // 深色皮 / 腹面 / 四肢
  hide: 0x584d3f,          // 主體皮
  hide_light: 0x6e6252,    // 受光面 / 背脊
  fur_dark: 0x413b34,      // 狼群暗毛
  fur: 0x5c5346,           // 狼群主毛
  rock: 0x565046,          // 岩石型野怪
  rock_light: 0x6d6458,
  moss: 0x44502c,          // 岩怪 / 蛤蟆身上的苔
  bone: 0x9e9584,          // 角 / 骨刺 / 冠 / 爪
  blue_crystal: 0x38bdf8,  // Blue Buff 結晶（＝ gameData 的 blueBuff 色）
  red_ember: 0xf97316,     // Red Buff 餘燼（＝ gameData 的 redBuff 色）
  camp_accent: 0x9bd13c,   // 一般野怪的眼
  dragon_accent: 0xc084fc, // Dragon（＝ gameData 的 dragon 色）
  baron_accent: 0xf59e0b,  // Baron（＝ gameData 的 baron 色）
});

// ── 組件建構子（G.9：加入橢球 sph 與膠囊 cap ⇒ 輪廓更圓，不再是方塊堆）──────────
//   z 一律是「組件底部」的高度。box 只留給翼膜 / 薄板；octa 只留給結晶重點；ico 留給岩塊。
const box = (dx, dy, z, w, d, h, color, rot = 0, tiltF = 0, tiltS = 0) =>
  ({ shape: "box", dx, dy, z, w, d, h, color, rot, tiltF, tiltS });
//  G.9：cyl / cone 段數提高（6→9 / 6→8）⇒ 圓柱不再是六角柱。
const cyl = (dx, dy, z, rTop, rBot, h, color, seg = 9) =>
  ({ shape: "cyl", dx, dy, z, rTop, rBot, r: Math.max(rTop, rBot), h, color, seg, rot: 0 });
const cone = (dx, dy, z, r, h, color, tiltF = 0, tiltS = 0, seg = 8) =>
  ({ shape: "cone", dx, dy, z, r, h, color, rot: 0, tiltF, tiltS, seg });
//  橢球（scaled sphere）：身體 / 頭 / 肩 / 眼 / 圓岩面——主要的「去菱角」武器。
const sph = (dx, dy, z, rx, ry, rz, color, rot = 0) =>
  ({ shape: "sph", dx, dy, z, rx, ry, rz, color, rot, r: Math.max(rx, rz), h: ry * 2 });
//  膠囊（兩端半圓的柱）：四肢 / 頸 / 尾節——比純柱子有生物感。
const cap = (dx, dy, z, r, len, color, tiltF = 0, tiltS = 0) =>
  ({ shape: "cap", dx, dy, z, r, len, color, tiltF, tiltS, h: len + r * 2 });
const octa = (dx, dy, z, r, color, rot = 0) =>
  ({ shape: "octa", dx, dy, z, r, h: r * 1.6, color, rot });
const ico = (dx, dy, z, r, color) =>
  ({ shape: "ico", dx, dy, z, r, h: r * 1.7, color, rot: 0 });

/** 四足獸的腿：改用膠囊（圓角）⇒ 低模也看得出是「四足」且不菱角。 */
const quadLegs = (fwd, back, halfW, rF, rB, hF, hB, color) => [
  cap(+fwd, -halfW, 0, rF, hF, color),
  cap(+fwd, +halfW, 0, rF, hF, color),
  cap(-back, -halfW, 0, rB, hB, color),
  cap(-back, +halfW, 0, rB, hB, color),
];

/** 一對左右對稱的組件（傳入以 k = ±1 為參數的建構式）。 */
const pair = (make) => [make(+1), make(-1)];

// ══ Blue Buff — 結晶石巨（直立、肩寬、背後結晶）═══════════════════════════
//  識別點：**站著**、頭小肩寬、背上三根藍結晶。與 Red Buff 的「趴低」完全相反。
function sentinelParts(s = 1) {
  const C = MONSTER_COLOR;
  return [
    // 雙腿（圓角石柱膠囊，中間留空 ⇒ 看得出是兩條腿）
    ...pair((k) => cap(-0.9 * s, k * 2.1 * s, 0, 1.45 * s, 2.8 * s, C.hide_dark)),
    // 軀幹：腹 + 胸兩段橢球，胸比腹寬 ⇒ 倒三角魔像身
    sph(0, 0, 3.6 * s, 2.7 * s, 2.0 * s, 3.0 * s, C.hide),
    sph(0.3 * s, 0, 6.2 * s, 3.2 * s, 2.4 * s, 3.9 * s, C.hide_light),
    // 肩（球）
    ...pair((k) => sph(0.2 * s, k * 3.7 * s, 7.9 * s, 1.8 * s, 1.6 * s, 1.8 * s, C.rock_light)),
    // 手臂：上臂 + 前臂膠囊 + 拳球
    ...pair((k) => cap(0.4 * s, k * 4.1 * s, 5.0 * s, 1.15 * s, 3.4 * s, C.hide_dark)),
    ...pair((k) => cap(0.9 * s, k * 4.2 * s, 1.9 * s, 1.2 * s, 3.0 * s, C.hide)),
    ...pair((k) => sph(1.1 * s, k * 4.3 * s, 0.9 * s, 1.5 * s, 1.3 * s, 1.5 * s, C.rock_light)),
    // 頸 + 頭（橢球，頭刻意小襯托身體量體）
    cap(0.4 * s, 0, 9.4 * s, 1.15 * s, 1.0 * s, C.hide_dark),
    sph(0.7 * s, 0, 10.7 * s, 1.7 * s, 1.5 * s, 1.8 * s, C.hide_light),
    ...pair((k) => sph(1.8 * s, k * 0.8 * s, 11.7 * s, 0.42 * s, 0.42 * s, 0.42 * s, C.blue_crystal)),
    // 背後三根結晶（保留 octa 稜角 ⇒ 讀成結晶，也是最高點）
    octa(-2.6 * s, 0, 10.6 * s, 2.1 * s, C.blue_crystal),
    octa(-2.2 * s, -2.4 * s, 9.0 * s, 1.5 * s, C.blue_crystal),
    octa(-2.2 * s, +2.4 * s, 9.0 * s, 1.5 * s, C.blue_crystal),
  ];
}

// ══ Red Buff — 棘背獸（趴低、橫寬、背脊棘刺、前方雙角）════════════════════
function bramblebackParts(s = 1) {
  const C = MONSTER_COLOR;
  return [
    ...quadLegs(3.4 * s, 3.2 * s, 3.2 * s, 1.15 * s, 1.35 * s, 2.4 * s, 2.7 * s, C.hide_dark),
    // 軀幹：胸 + 腹兩段橢球（趴低橫寬），前高後低
    sph(1.4 * s, 0, 2.4 * s, 3.4 * s, 2.2 * s, 3.4 * s, C.hide),
    sph(-3.2 * s, 0, 2.2 * s, 2.7 * s, 1.8 * s, 2.9 * s, C.hide_dark),
    sph(0.2 * s, 0, 5.0 * s, 4.6 * s, 1.2 * s, 2.9 * s, C.hide_light),   // 背甲隆起
    // 頸 + 頭（前伸，橢球頭 + 錐吻）
    cap(4.9 * s, 0, 2.8 * s, 1.9 * s, 2.0 * s, C.hide, 0, Math.PI / 2),
    sph(6.2 * s, 0, 2.8 * s, 1.9 * s, 1.7 * s, 2.0 * s, C.hide_light),
    cone(8.2 * s, 0, 3.0 * s, 1.5 * s, 2.6 * s, C.hide_light, Math.PI / 2, 0),
    ...pair((k) => sph(7.4 * s, k * 1.2 * s, 4.5 * s, 0.4 * s, 0.4 * s, 0.4 * s, C.red_ember)),  // 眼
    // 雙角（往外上方張開）
    ...pair((k) => cone(6.2 * s, k * 1.5 * s, 5.0 * s, 0.85 * s, 3.2 * s, C.bone, 0, -k * 0.55)),
    // 背脊棘刺（高彩度重點，由大到小）
    cone(2.2 * s, 0, 6.4 * s, 1.15 * s, 3.6 * s, C.red_ember),
    cone(-0.4 * s, 0, 6.2 * s, 0.95 * s, 2.9 * s, C.red_ember),
    cone(-2.8 * s, 0, 5.6 * s, 0.75 * s, 2.2 * s, C.red_ember),
    ...pair((k) => cone(0.6 * s, k * 2.0 * s, 5.6 * s, 0.55 * s, 1.7 * s, C.bone, 0, -k * 0.5)),
    // 尾（膠囊 + 錐尖翹起）
    cap(-5.6 * s, 0, 2.6 * s, 0.9 * s, 1.6 * s, C.hide_dark, -0.5),
    cone(-7.4 * s, 0, 2.8 * s, 0.7 * s, 2.6 * s, C.hide_dark, -1.1, 0),
  ];
}

// ══ Buff 營地的小型守衛（跟主怪同種的縮小版 ⇒ 營地讀成「一窩」而不是「一隻」）══
function sentinelWhelpParts(s = 1) {
  const C = MONSTER_COLOR;
  return [
    ...pair((k) => cap(-0.4 * s, k * 1.1 * s, 0, 0.78 * s, 1.4 * s, C.hide_dark)),
    sph(0, 0, 1.4 * s, 1.4 * s, 1.2 * s, 1.5 * s, C.hide),
    sph(0.3 * s, 0, 3.2 * s, 0.95 * s, 0.9 * s, 1.05 * s, C.hide_light),
    ...pair((k) => sph(1.0 * s, k * 0.6 * s, 4.0 * s, 0.28 * s, 0.28 * s, 0.28 * s, C.blue_crystal)),
    octa(-1.3 * s, 0, 3.2 * s, 1.0 * s, C.blue_crystal),
  ];
}
function bramblingParts(s = 1) {
  const C = MONSTER_COLOR;
  return [
    ...quadLegs(1.6 * s, 1.5 * s, 1.5 * s, 0.55 * s, 0.62 * s, 1.1 * s, 1.2 * s, C.hide_dark),
    sph(0.4 * s, 0, 1.2 * s, 1.7 * s, 1.1 * s, 1.6 * s, C.hide),
    sph(2.4 * s, 0, 1.5 * s, 1.0 * s, 0.95 * s, 1.0 * s, C.hide_light),
    cone(3.6 * s, 0, 1.6 * s, 0.75 * s, 1.4 * s, C.hide_light, Math.PI / 2, 0),
    cone(0.6 * s, 0, 2.6 * s, 0.6 * s, 1.7 * s, C.red_ember),
    ...pair((k) => sph(3.0 * s, k * 0.7 * s, 2.5 * s, 0.24 * s, 0.24 * s, 0.24 * s, C.red_ember)),
  ];
}

// ══ 狼群（頭狼 + 兩隻小狼）═══════════════════════════════════════════════
//  識別點：細長身體 + 前伸的頭 + 豎耳 + 翹尾，三隻呈追獵隊形。
function wolfParts(s, coat) {
  const C = MONSTER_COLOR;
  return [
    ...quadLegs(1.9 * s, 1.9 * s, 1.35 * s, 0.5 * s, 0.55 * s, 1.8 * s, 2.0 * s, C.fur_dark),
    sph(0, 0, 1.9 * s, 2.5 * s, 1.15 * s, 1.4 * s, coat),                                 // 細長身
    sph(1.9 * s, 0, 3.3 * s, 1.2 * s, 1.0 * s, 1.2 * s, C.fur_dark),                      // 肩鬃
    cap(2.7 * s, 0, 2.7 * s, 0.8 * s, 1.0 * s, coat, 0, 0.7),                             // 頸（前傾）
    sph(3.5 * s, 0, 2.6 * s, 1.0 * s, 0.9 * s, 0.9 * s, coat),                            // 頭
    cone(4.7 * s, 0, 2.7 * s, 0.58 * s, 1.5 * s, C.hide_light, Math.PI / 2, 0),           // 吻
    ...pair((k) => cone(3.1 * s, k * 0.62 * s, 3.7 * s, 0.4 * s, 1.15 * s, C.fur_dark)),  // 耳
    ...pair((k) => sph(4.1 * s, k * 0.7 * s, 3.2 * s, 0.22 * s, 0.22 * s, 0.22 * s, C.camp_accent)), // 眼
    cap(-2.6 * s, 0, 2.6 * s, 0.5 * s, 1.0 * s, C.fur_dark, -0.6),
    cone(-3.7 * s, 0, 2.9 * s, 0.52 * s, 2.2 * s, coat, -0.95, 0),                        // 尾
  ];
}
const wolfPack = () => [
  { dx: 3.0, dy: 0.4, rot: 0, scale: 1.15, coat: "fur" },        // 頭狼（明顯較大）
  { dx: -2.6, dy: -3.6, rot: 0.55, scale: 0.74, coat: "fur_dark" },
  { dx: -3.0, dy: +3.4, rot: -0.5, scale: 0.74, coat: "fur_dark" },
];

// ══ 石頭怪 Krug（大石頭怪 + 兩隻小石頭怪）════════════════════════════════
//  識別點：稜角分明的岩塊堆 + 短粗四肢 + 苔痕，跟毛茸茸的狼群完全不同調。
function krugParts(s, seedRot) {
  const C = MONSTER_COLOR;
  // 石甲蟲：岩塊本體用 ico（多面圓岩），四肢用膠囊 ⇒ 比純方塊有塊面感又不菱角。
  return [
    ...pair((k) => cap(-0.6 * s, k * 1.9 * s, 0, 0.85 * s, 1.5 * s, C.rock)),
    ...pair((k) => cap(1.8 * s, k * 2.2 * s, 0, 0.8 * s, 2.2 * s, C.rock)),
    ico(0, 0, 1.4 * s, 2.6 * s, C.rock_light),
    ico(0.5 * s, 0.3 * s, 4.2 * s, 1.9 * s, C.rock),
    ico(-1.2 * s, -0.5 * s, 2.4 * s, 1.3 * s, C.moss),
    sph(0.2 * s, 0, 5.8 * s, 1.4 * s, 1.2 * s, 1.4 * s, C.rock_light),
    ...pair((k) => sph(1.1 * s, k * 0.7 * s, 6.4 * s, 0.3 * s, 0.3 * s, 0.3 * s, C.camp_accent)),
    cone(1.5 * s, -1.1 * s, 4.0 * s, 0.6 * s, 1.9 * s, C.rock_light, 0, 0.45),
    cone(-1.4 * s, +1.2 * s, 3.8 * s, 0.55 * s, 1.6 * s, C.rock_light, 0, -0.45),
  ];
}
const krugPack = () => [
  { dx: 2.2, dy: -0.8, rot: 0.3, scale: 1.0 },     // 大石頭怪
  { dx: -3.4, dy: 2.8, rot: 1.15, scale: 0.55 },   // 小石頭怪
  { dx: -2.8, dy: -3.4, rot: 2.1, scale: 0.45 },
];

// ══ 鳥群 Raptors（大鳥 + 四隻小鳥）══════════════════════════════════════
function raptorParts(s, coat) {
  const C = MONSTER_COLOR;
  return [
    ...pair((k) => cap(0.2 * s, k * 0.9 * s, 0, 0.35 * s, 1.5 * s, C.bone)),                  // 雙腿
    sph(0, 0, 1.5 * s, 1.5 * s, 1.0 * s, 1.0 * s, coat),                                       // 身
    ...pair((k) => box(-0.2 * s, k * 1.5 * s, 2.0 * s, 2.6 * s, 1.4 * s, 0.42 * s, C.hide_dark, 0, 0, -k * 0.5)), // 收翅
    cap(1.3 * s, 0, 2.8 * s, 0.6 * s, 1.2 * s, coat, 0, 0.6),                                  // 頸
    sph(1.8 * s, 0, 4.0 * s, 0.75 * s, 0.7 * s, 0.7 * s, C.hide_light),                        // 頭
    cone(2.8 * s, 0, 4.1 * s, 0.42 * s, 1.3 * s, C.bone, Math.PI / 2, 0),                      // 喙
    cone(1.0 * s, 0, 4.9 * s, 0.45 * s, 1.2 * s, C.camp_accent, -0.5, 0),                      // 冠羽
    ...pair((k) => sph(2.3 * s, k * 0.5 * s, 4.5 * s, 0.2 * s, 0.2 * s, 0.2 * s, C.camp_accent)), // 眼
    cone(-2.0 * s, 0, 1.9 * s, 0.7 * s, 2.4 * s, coat, -1.35, 0),                              // 尾
  ];
}
const raptorFlock = () => [
  { dx: 2.4, dy: 0, rot: 0, scale: 1.25, coat: "hide" },
  { dx: -2.2, dy: -3.0, rot: 0.6, scale: 0.62, coat: "hide_dark" },
  { dx: -2.6, dy: +2.9, rot: -0.55, scale: 0.62, coat: "hide_dark" },
  { dx: -0.4, dy: -4.4, rot: 1.1, scale: 0.55, coat: "hide_dark" },
  { dx: -0.8, dy: +4.3, rot: -1.05, scale: 0.55, coat: "hide_dark" },
];

// ══ 蛤蟆 Gromp（圓厚單體）═══════════════════════════════════════════════
function grompParts(s = 1) {
  const C = MONSTER_COLOR;
  return [
    // 後腿：大腿外張（膠囊）+ 蹼足（薄橢球）——蟾蜍招牌的誇張後腿
    ...pair((k) => cap(-1.6 * s, k * 3.0 * s, 0.6 * s, 1.25 * s, 1.6 * s, C.moss, 0, -k * 0.4)),
    ...pair((k) => sph(1.0 * s, k * 3.4 * s, 0, 1.3 * s, 0.35 * s, 1.0 * s, C.hide_dark)),
    // 前腿：短、往前撐
    ...pair((k) => cap(2.4 * s, k * 1.9 * s, 0, 0.7 * s, 1.7 * s, C.hide_dark)),
    ...pair((k) => sph(3.1 * s, k * 1.9 * s, 0, 0.9 * s, 0.3 * s, 0.7 * s, C.hide_dark)),
    // 圓厚主體：腹（低而寬的大橢球）+ 背隆起
    sph(0, 0, 0.6 * s, 3.4 * s, 2.6 * s, 3.6 * s, C.moss),
    sph(-0.4 * s, 0, 4.2 * s, 2.6 * s, 1.2 * s, 2.9 * s, C.hide_light),   // 背
    // 寬嘴頭：下顎 + 上顎（扁橢球）+ 鼻端
    sph(3.0 * s, 0, 1.0 * s, 1.6 * s, 0.7 * s, 2.3 * s, C.hide_dark),
    sph(2.9 * s, 0, 2.2 * s, 1.5 * s, 0.9 * s, 2.1 * s, C.moss),
    cone(4.6 * s, 0, 2.2 * s, 1.0 * s, 1.6 * s, C.hide_light, Math.PI / 2, 0),
    // 凸眼（蟾蜍最好認的部位）
    ...pair((k) => sph(3.0 * s, k * 1.6 * s, 3.6 * s, 0.95 * s, 0.95 * s, 0.95 * s, C.hide_light)),
    ...pair((k) => sph(3.4 * s, k * 1.6 * s, 4.3 * s, 0.32 * s, 0.32 * s, 0.32 * s, C.camp_accent)),
    // 背疣（大小交錯的圓瘤）
    ...pair((k) => sph(-0.6 * s, k * 2.2 * s, 4.8 * s, 0.6 * s, 0.55 * s, 0.6 * s, C.bone)),
    ...pair((k) => sph(-2.2 * s, k * 1.5 * s, 3.6 * s, 0.45 * s, 0.42 * s, 0.45 * s, C.bone)),
    sph(0.6 * s, 0, 5.2 * s, 0.7 * s, 0.6 * s, 0.7 * s, C.moss),
  ];
}

// ══ Dragon — 寬翼飛龍（gameData 宣告 silhouette: "wide-winged"）════════════
//  識別點：**橫向展開的雙翼**。俯視時翼展就是識別特徵，跟 Baron 的「高」相反。
function drakeParts() {
  const C = MONSTER_COLOR;
  return [
    // 四肢：後腿粗（膠囊）+ 前肢 + 爪
    ...pair((k) => cap(-2.6, k * 2.8, 0, 1.3, 3.0, C.hide_dark)),
    ...pair((k) => cap(+3.0, k * 2.2, 0, 0.95, 2.4, C.hide_dark)),
    ...pair((k) => sph(+3.5, k * 2.2, 0.2, 1.0, 0.8, 1.0, C.bone)),
    // 軀幹：胸 + 腹兩段橢球 + 背脊
    sph(1.4, 0, 2.6, 3.1, 2.1, 2.9, C.hide),
    sph(-3.2, 0, 2.4, 2.7, 1.8, 2.4, C.hide_dark),
    sph(0.2, 0, 5.4, 4.6, 1.0, 2.2, C.hide_light),
    ...pair((k) => cone(-1.2, k * 0.9, 6.6, 0.5, 1.8, C.bone, 0, -k * 0.35)),
    // 頸（兩節上揚膠囊）+ 頭橢球 + 吻
    cap(4.6, 0, 3.4, 1.4, 2.4, C.hide, 0, 0.5),
    cap(5.9, 0, 6.0, 1.1, 2.0, C.hide, 0, 0.35),
    sph(7.0, 0, 8.0, 1.4, 1.2, 1.3, C.hide_light),
    cone(8.9, 0, 8.2, 1.1, 2.4, C.hide_light, Math.PI / 2, 0),
    ...pair((k) => cone(6.6, k * 1.1, 9.6, 0.45, 2.2, C.bone, -0.6, -k * 0.4)),  // 角
    ...pair((k) => sph(8.0, k * 0.9, 9.2, 0.34, 0.34, 0.34, C.dragon_accent)),   // 眼
    // 雙翼：肩骨（膠囊）+ 兩片膜（薄板，往外上張開 ⇒ 俯視寬）+ 翼指
    ...pair((k) => cap(0.6, k * 3.2, 5.8, 0.7, 2.0, C.hide_dark, 0, -k * 0.9)),
    ...pair((k) => box(0.2, k * 6.4, 7.0, 8.2, 6.2, 0.5, C.hide_dark, 0, 0, -k * 0.30)),
    ...pair((k) => box(-1.4, k * 10.2, 8.0, 6.0, 3.2, 0.45, C.hide, 0, 0, -k * 0.42)),
    ...pair((k) => cone(3.6, k * 4.2, 7.2, 0.4, 2.6, C.bone, -1.2, -k * 0.5)),   // 翼指
    // 尾（膠囊三節收窄 + 錐尖，微彎）
    cap(-6.4, 0, 2.4, 1.1, 1.8, C.hide_dark, -0.3),
    cap(-8.4, 0, 2.2, 0.8, 1.6, C.hide_dark, -0.5),
    cone(-10.6, 0, 2.2, 0.7, 3.2, C.hide_dark, -Math.PI / 2, 0),
    // 重點色：胸口核心 + 翼骨節點（保留 octa 稜角＝結晶）
    octa(2.6, 0, 5.0, 1.5, C.dragon_accent),
    ...pair((k) => octa(0.4, k * 4.0, 6.8, 0.8, C.dragon_accent)),
  ];
}

// ══ Baron — 盤踞高聳的冠蛇（gameData 宣告 silhouette: "tall-serpent"）═══════
//  識別點：**垂直的高度 + 頭冠**。體積與高度都必須明顯壓過所有一般野怪。
function baronParts() {
  const C = MONSTER_COLOR;
  return [
    // 盤起的蛇身：兩圈粗圓柱（高段數）+ 一圈橢球，逐層縮小偏移 ⇒ 讀成「盤」
    cyl(0, 0, 0, 8.0, 9.0, 3.0, C.hide_dark, 16),
    cyl(0.8, 0.6, 2.9, 6.0, 7.2, 2.8, C.hide, 16),
    sph(-0.4, -0.6, 5.4, 4.8, 1.5, 4.8, C.hide),
    cap(-6.0, 3.2, 3.0, 1.0, 3.2, C.hide_dark, -1.0),           // 尾翹出
    cone(-8.2, 4.4, 3.2, 0.9, 3.0, C.hide_dark, -1.2, 0),       // 尾尖
    // 直立上身：三節膠囊逐漸收窄、微彎（不是一根方柱）
    cap(0, 0, 7.0, 3.6, 3.4, C.hide),
    cap(0.4, 0, 11.0, 2.7, 3.4, C.hide_light, 0, 0.12),
    cap(0.9, 0, 14.8, 2.0, 2.4, C.hide_light, 0, 0.18),
    // 兩隻前肢（膠囊，往前撐）
    ...pair((k) => cap(3.0, k * 3.4, 6.0, 1.1, 4.0, C.hide_dark, 0, -k * 0.5)),
    ...pair((k) => sph(4.2, k * 3.6, 5.4, 1.2, 1.0, 1.2, C.bone)),
    // 頭橢球 + 顎錐
    sph(1.4, 0, 17.8, 2.0, 1.7, 1.9, C.hide_light),
    cone(3.8, 0, 18.0, 1.3, 2.8, C.hide_light, Math.PI / 2, 0),
    ...pair((k) => sph(2.8, k * 1.2, 19.0, 0.45, 0.45, 0.45, C.baron_accent)),  // 眼
    // 頭冠：五根往外張的骨刺（Baron 招牌）
    cone(0.4, 0, 20.2, 0.62, 3.6, C.bone, -0.25, 0),
    ...pair((k) => cone(0.2, k * 1.7, 19.9, 0.55, 3.0, C.bone, 0, -k * 0.55)),
    ...pair((k) => cone(-1.1, k * 1.0, 19.7, 0.5, 2.4, C.bone, 0.4, -k * 0.3)),
    // 背脊骨板
    ...pair((k) => cone(-1.6, k * 0.9, 9.8, 0.55, 2.2, C.bone, 0.5, -k * 0.45)),
    ...pair((k) => cone(-1.2, k * 0.7, 13.4, 0.48, 1.9, C.bone, 0.5, -k * 0.45)),
    // 重點色：胸口核心 + 冠心
    octa(2.0, 0, 12.6, 1.6, C.baron_accent),
    octa(0.6, 0, 21.9, 1.0, C.baron_accent),
  ];
}

// ══ 原型表 ══════════════════════════════════════════════════════════════
const ARCHETYPES = {
  sentinel: {
    label: "藍 Buff（結晶石巨）", top: 13.6,
    group: () => [
      { dx: 0, dy: 0, rot: 0, scale: 1 },
      { dx: -5.0, dy: -5.2, rot: 0.7, scale: 0.85, whelp: true },
      { dx: -5.4, dy: +5.0, rot: -0.65, scale: 0.85, whelp: true },
    ],
    member: (m) => (m.whelp ? sentinelWhelpParts(m.scale) : sentinelParts(m.scale)),
  },
  brambleback: {
    label: "紅 Buff（棘背獸）", top: 10.8,
    group: () => [
      { dx: 0, dy: 0, rot: 0, scale: 1 },
      { dx: -5.6, dy: -5.4, rot: 0.6, scale: 0.8, whelp: true },
      { dx: -5.2, dy: +5.6, rot: -0.55, scale: 0.8, whelp: true },
    ],
    member: (m) => (m.whelp ? bramblingParts(m.scale) : bramblebackParts(m.scale)),
  },
  wolves: {
    label: "狼營", top: 5.3,
    group: wolfPack,
    member: (m) => wolfParts(m.scale, MONSTER_COLOR[m.coat]),
  },
  krug: {
    label: "石甲蟲", top: 7.9,
    group: krugPack,
    member: (m) => krugParts(m.scale, m.rot),
  },
  raptors: {
    label: "鳥營", top: 6.4,
    group: raptorFlock,
    member: (m) => raptorParts(m.scale, MONSTER_COLOR[m.coat]),
  },
  gromp: {
    label: "蟾蜍", top: 6.8,
    group: () => [{ dx: 0, dy: 0, rot: 0, scale: 1 }],
    member: (m) => grompParts(m.scale),
  },
  drake: { label: "小龍", top: 11.3, parts: drakeParts },
  baron: { label: "巴龍", top: 23.6, parts: baronParts },
};

/**
 * ⚠ G.4 起，「哪個營地放哪一種怪」已經移到 `mapCampLayout.js`（連同座標與位移一起管）。
 *   本檔只負責「原型 → 量體組成」。這裡列出目前有哪些原型可用：
 *     sentinel（藍 Buff）／brambleback（紅 Buff）／wolves（狼營）／
 *     krug（石甲蟲）／raptors（鳥營）／gromp（蟾蜍）／drake（小龍）／baron（巴龍）
 */
export const ARCHETYPE_KEYS = Object.freeze(Object.keys(ARCHETYPES));

/**
 * G.7 比例校正：整隻怪的統一縮放係數（by kind）。
 *   · 一般野怪 −15%（0.85）：不再壓迫營地空間、給英雄 / 血條 / 技能範圍讓位。
 *   · Buff −8%（0.92）：仍保持可辨識（Buff 要一眼認出來），但不撐滿口袋。
 *   · 史詩 −5%（0.95）：確保伸展半徑與最高點都塞得進坑、不遮住加寬後的坑口。
 * 縮放同時套用在 render（group scale）、佔地半徑（monsterReach）、垂直高度（top/anchor），
 * 三者一致 ⇒ verifier「塞得進空地 / 坑」與畫面完全對得起來。
 */
//  G.11：整體再略縮（地圖偏擠、物件偏大）——一般野怪 −5%、Buff/史詩 −4%，仍是明確 3D 實體。
export const MONSTER_SIZE_K = Object.freeze({ camp: 0.81, buff: 0.88, epic: 0.91 });

/** 血條 / 名牌預留高度＝模型最高點再往上留的餘裕（世界單位）。 */
export const HEADROOM_MARGIN = 3.5;
/** 血條掛在模型冠頂再往上一點；名牌再更高一階（＝headroom）。 */
export const HP_MARGIN = 1.5;

function instance(id, kind, archetype, x, y, facing) {
  const A = ARCHETYPES[archetype];
  const members = A.group
    ? A.group().map((m) => ({ ...m, parts: A.member(m) }))
    : [{ dx: 0, dy: 0, rot: 0, scale: 1, parts: A.parts() }];
  const k = MONSTER_SIZE_K[kind] ?? 1;      // G.7 比例校正（by kind）
  const top = A.top * k;
  const headroom = top + HEADROOM_MARGIN;
  return {
    id, kind, archetype, label: A.label,
    x, y, facing, sizeK: k,
    members,
    top,
    headroom,
    //  ⚠ G.6：血條 / 名牌掛點預留。之後接血條 UI 一律用這兩個 anchor，不再重量模型。
    //    anchor = { x, y, z }：x/y 是怪的地面座標（世界層再乘 WORLD_SCALE），
    //    z 是世界高度（垂直不乘 scale）。hpAnchor 貼在冠頂上方、labelAnchor 再高一階。
    hpAnchor: { x, y, z: top + HP_MARGIN },
    labelAnchor: { x, y, z: headroom },
  };
}

/** 單隻怪（含群體站位）的佔地半徑；營地空地 / 坑必須放得下它。已套 G.7 sizeK。 */
export function monsterReach(m) {
  const k = m.sizeK ?? 1;
  return k * Math.max(...m.members.flatMap((mem) => mem.parts.map((p) =>
    Math.hypot(mem.dx + p.dx, mem.dy + p.dy) +
    Math.max(p.r ?? 0, (p.w ?? 0) / 2, (p.d ?? 0) / 2))));
}

/**
 * 建立地圖上所有野怪。
 * @param L        buildMobaLayout() 的輸出（pits 座標來自 gameData）
 * @param campPlan buildCampPlan() 的輸出（含位移後的呈現座標與呈現用營地）
 * @returns [{ id, kind:'buff'|'camp'|'epic', archetype, label, x, y, facing,
 *             members, top, headroom, isPresentation }]
 */
export function buildMonsters(L, campPlan) {
  const cx = L.bounds.centerX, cy = L.bounds.centerY;
  const faceCenter = (x, y) => Math.atan2(cy - y, cx - x);
  const out = [];

  for (const c of campPlan) {
    const m = instance(`mon_${c.id}`, c.type === "buff" ? "buff" : "camp",
      c.archetype, c.x, c.y, c.facing);
    m.label = c.label;
    m.isPresentation = c.isPresentation;
    out.push(m);
  }

  // 史詩野怪：坑心，面向地圖中心 ⇒ 兩隻都「看著」中央交戰區。
  for (const [id, key] of [["dragon", "drake"], ["baron", "baron"]]) {
    const p = L.pits[id];
    const m = instance(`mon_${id}`, "epic", key, p.x, p.y, faceCenter(p.x, p.y));
    m.isPresentation = false;
    out.push(m);
  }

  return out;
}
