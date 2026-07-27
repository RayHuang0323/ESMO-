// ============================================================================
//  tools/check_moba_map.mjs — MOBA 地圖驗證（Milestone D 拓撲 + G.1 可讀性 + G.2 結構修正）
//
//  驗證 blockout 結構與既有模擬座標一致、拓撲完整、無模擬邏輯混入，並驗證
//  mapTerrainShapes 產出的「MOBA 地圖結構語言」確實成立：
//    三路四階層次｜河道收斂成中央涉水點＋兩條河臂＋兩個坑口水域｜
//    基地四階（主堡台/內庭/高地平台/城牆）＋三個張開的出口｜
//    塔位由基地往外＝門牙塔 → 高地塔 → 內塔 → 外塔｜中央交戰區留白｜
//    野怪 / 史詩野怪的低模剪影存在且塞得進自己的空間。
//
//  ⚠ 這支驗的是**結構是否成立**，不是美感。最終畫面仍需瀏覽器人工目視。
//  （座標真相來源 src/gameData.js。）
// ============================================================================
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { buildMobaLayout } from "../src/battle/moba/map/mobaMapLayout.js";
import { buildLandmarks } from "../src/battle/moba/map/mapLandmarks.js";
import { buildTerrainShapes } from "../src/battle/moba/map/mapTerrainShapes.js";
import { pointInPoly } from "../src/battle/moba/map/mapShapePrimitives.js";
import { WIDTH, HEIGHT, PALETTE } from "../src/battle/moba/map/mapVisualStyle.js";
import { TOWER_ORDER, DISPLAY_T, TOWER_CLEARANCE, TOWER_GAP, MIRROR_LANE } from "../src/battle/moba/map/mapTowerLayoutStyle.js";
import { monsterReach, MONSTER_SIZE_K, MONSTER_COLOR } from "../src/battle/moba/map/mapMonsterShapes.js";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { WORLD_SCALE } from "../src/battle/moba/map/coordinateMapping.js";
import { CAMP_CLEARANCE } from "../src/battle/moba/map/mapCampLayout.js";
import { buildPassability, CORRIDOR_MIN, HERO_RADIUS, HERO_DIAMETER } from "../src/battle/moba/map/mapPassability.js";
import { TOWER_SPEC } from "../src/battle/moba/map/mapTowerLayoutStyle.js";
import { buildLanePlan } from "../src/battle/moba/map/mapLaneStyle.js";
import { worldX, worldZ } from "../src/battle/moba/map/coordinateMapping.js";
import { TOWER_T, FOUNTAIN, WORLD_BOUNDS } from "../src/gameData.js";
import {
  buildBaseSymmetryReport, buildBaseHierarchyReport, buildBaseExitReport, EXIT_MIN_WIDTH,
  STRUCT_LAYER_RE, mirrorLayerId, buildBaseBlueprintReport, baseExitLine,
} from "../src/battle/moba/map/mapBaseSymmetry.js";
import { BASE_GEO, buildBaseExitWallModule } from "../src/battle/moba/map/mapBaseBlueprint.js";
import { measureBaseSymmetry } from "./lib/baseSymmetryRaster.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
let G14 = null;   // G.14 基地鏡射 / 層級 / 出口報告（結尾摘要用）
let G14RASTER = null;  // G.14-fix 基地畫面對稱光栅比對結果
let G15 = null;   // G.15 base blueprint 逐件對照報告
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("❌ " + m); } };
const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const inBounds = (p) => p.x >= WORLD_BOUNDS.minX && p.x <= WORLD_BOUNDS.maxX && p.y >= WORLD_BOUNDS.minY && p.y <= WORLD_BOUNDS.maxY;

const L = buildMobaLayout();

// 1) 雙基地 + 泉水存在、在界內
ok(L.bases.blue && L.bases.red, "Blue/Red Base 應存在");
ok(inBounds(L.bases.blue) && inBounds(L.bases.red), "雙基地應在地圖界內");
ok(L.fountains.blue && L.fountains.red, "雙泉水應存在");

// 2) 三條 lane 存在、各 ≥2 點、且連接雙方（起點近藍基地、終點近紅基地）
for (const ln of ["top", "mid", "bot"]) {
  const pts = L.lanes[ln];
  ok(Array.isArray(pts) && pts.length >= 2, `${ln} lane 應 ≥2 點`);
  ok(d2(pts[0], L.bases.blue) < 25, `${ln} 起點應接近藍基地（實得 ${d2(pts[0], L.bases.blue).toFixed(1)}）`);
  ok(d2(pts[pts.length - 1], L.bases.red) < 25, `${ln} 終點應接近紅基地`);
}

// 3) Dragon / Baron 存在、不重疊（>2×坑半徑 24）、互為 180° 鏡射
ok(L.pits.dragon && L.pits.baron, "Dragon/Baron 應存在");
ok(d2(L.pits.dragon, L.pits.baron) > 24, "Dragon/Baron 不應重疊");
ok(Math.abs(L.pits.baron.x - (220 - L.pits.dragon.x)) < 0.5 &&
   Math.abs(L.pits.baron.y - (220 - L.pits.dragon.y)) < 0.5, "Dragon/Baron 應互為 180° 鏡射");

// 4) 塔數量與模擬一致：3 路 × 2 方 × TOWER_T 座數 + 2 nexus
const expectTowers = 3 * 2 * TOWER_T.blue.length + 2;
ok(L.towers.length === expectTowers, `塔節點數應為 ${expectTowers}，實得 ${L.towers.length}`);
ok(L.towers.filter((t) => t.kind === "nexus").length === 2, "應有 2 座 Nexus");
ok(L.towers.filter((t) => t.kind !== "nexus").length === 18, "應有 18 座兵線塔");

// 5) 座標 mapping 無 NaN；所有重要節點在界內
const nodes = [L.bases.blue, L.bases.red, L.fountains.blue, L.fountains.red, L.pits.dragon, L.pits.baron, ...L.camps, ...L.towers];
for (const n of nodes) {
  ok(inBounds(n), `節點 (${n.x},${n.y}) 應在界內`);
  const w = [worldX(n.x), worldZ(n.y)];
  ok(w.every(Number.isFinite), `節點 (${n.x},${n.y}) 世界座標不應含 NaN`);
}

// 6) 基地近似對稱（紅 = 180° 鏡像藍）
ok(Math.abs(L.bases.red.x - (220 - L.bases.blue.x)) < 0.5 &&
   Math.abs(L.bases.red.y - (220 - L.bases.blue.y)) < 0.5, "雙基地應對稱（180° 鏡像）");

// 7) Dragon/Baron 公平性：每坑對雙方泉水等距（gameData 規則 <0.5，給 1.0 容差）
for (const [name, pit] of [["dragon", L.pits.dragon], ["baron", L.pits.baron]]) {
  const diff = Math.abs(d2(pit, FOUNTAIN.blue) - d2(pit, FOUNTAIN.red));
  ok(diff < 1.0, `${name} 對雙方泉水應近似等距（差 ${diff.toFixed(2)}）`);
}

// 8) 地標：keys 唯一、界內、無 NaN、**文字一律中文**（G.4）
//    先建 terrain（營地座標在裡面），地標才拿得到位移後的營地位置。
const T = buildTerrainShapes(L);
const LM = buildLandmarks(L, T.camps);
const allLm = [
  ...LM.labels, ...LM.buffs, ...LM.pitEntrances, ...LM.baseEntrances, ...LM.jungleEntrances,
];
const keys = allLm.map((m) => m.key);
ok(new Set(keys).size === keys.length, `地標 key 不應重複（${keys.length} 個）`);
ok(LM.buffs.length === 2, "應有 2 個 Buff 地標");
ok(LM.pitEntrances.length >= 2, "龍/巴龍坑應有入口地標");
for (const m of allLm) {
  ok(inBounds(m), `地標 ${m.key} (${m.x?.toFixed?.(1)},${m.y?.toFixed?.(1)}) 應在界內`);
  ok(Number.isFinite(m.x) && Number.isFinite(m.y), `地標 ${m.key} 不應含 NaN`);
}
for (const w of [...LM.pitWalls.dragon, ...LM.pitWalls.baron]) {
  ok(Number.isFinite(w.x) && Number.isFinite(w.y), "坑牆座標不應含 NaN");
}

// ══════════════════════════════════════════════════════════════════════════
//  Milestone G.1：MOBA Map Structure & Readability Pass
//  驗的是「地圖結構語言」是否成立（層次數、空間層級、收斂程度），不是像素美感。
// ══════════════════════════════════════════════════════════════════════════
const layerIds = new Set(T.groundLayers.map((g) => g.id));
const allPts = T.groundLayers.flatMap((g) => g.poly);
const layer = (id) => T.groundLayers.find((g) => g.id === id);
const polysWithPrefix = (pre) => T.groundLayers.filter((g) => g.id.startsWith(pre)).map((g) => g.poly);
const inAnyPoly = (x, y, polys) => polys.some((poly) => pointInPoly(x, y, poly));

// F1) 地面色塊：無 NaN、全部在界內（容 1 單位誤差，帶狀邊緣可能貼齊邊界）
ok(T.groundLayers.length >= 100, `地面色塊應 ≥100 層（實得 ${T.groundLayers.length}）`);
ok(allPts.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)), "地面色塊座標不應含 NaN");
const outsidePts = allPts.filter((p) => p.x < -1 || p.y < -1 || p.x > WORLD_BOUNDS.maxX + 1 || p.y > WORLD_BOUNDS.maxY + 1);
ok(outsidePts.length === 0, `地面色塊應全部在地圖界內（越界 ${outsidePts.length} 點）`);

// F2) 三路：四階帶狀（草緣/路肩/路緣/路面），且路面帶連接雙方基地
for (const ln of ["top", "mid", "bot"]) {
  for (const part of ["verge", "shoulder", "edge", "surface"]) {
    ok(layerIds.has(`lane_${ln}_${part}`), `三路應有 ${ln} 的 ${part} 帶狀地形（路 = 4 階層次）`);
  }
  const surf = layer(`lane_${ln}_surface`);
  ok(pointInPoly(L.bases.blue.x, L.bases.blue.y, surf.poly), `${ln} 路面應覆蓋藍方基地（＝路連到出口）`);
  ok(pointInPoly(L.bases.red.x, L.bases.red.y, surf.poly), `${ln} 路面應覆蓋紅方基地`);
}
ok(layerIds.has("lane_mid_inlay"), "mid lane 應有路心亮帶（＝基地連基地的主戰線最明顯）");
ok(layer("lane_mid_surface").colorKey === "lane_surface" &&
   layer("lane_top_surface").colorKey === "lane_surface_side",
  "中路路面應比上/下路亮一階（中路＝主戰線）");
ok(T.groundLayers.some((g) => g.id.startsWith("lanepatch_")), "路面應有色斑層次（不是平塗）");
// 路的總佔地要比 v1 收斂，否則上下路會連成一圈粗黃環
ok(WIDTH.lane_verge <= 24 && WIDTH.lane_surface <= 12,
  `路寬應收斂（草緣 ${WIDTH.lane_verge} / 路面 ${WIDTH.lane_surface}）`);

// F3) 河道：中央涉水點 + 兩條河臂 + 兩個坑口水域；且**不再貫穿全圖**
const RIVER_PARTS = ["arm_baron", "arm_dragon", "ford", "mouth_baron", "mouth_dragon"];
for (const part of RIVER_PARTS) {
  for (const band of ["bank", "shoal", "water"]) {
    ok(layerIds.has(`river_${band}_${part}`), `水系 ${part} 應有 ${band} 層`);
  }
  ok(layerIds.has(`river_wetgrass_${part}`), `水系 ${part} 應有濕草過渡層`);
}
// 深水只在河臂與坑口（涉水點刻意沒有深水 ⇒ 中路才能涉水而過）
for (const part of ["arm_baron", "arm_dragon", "mouth_baron", "mouth_dragon"]) {
  ok(layerIds.has(`river_deep_${part}`), `${part} 應有深水層`);
}
ok(!layerIds.has("river_deep_ford"), "中央涉水點不應有深水（否則中路會被河切斷）");
ok(T.groundLayers.some((g) => g.id.startsWith("sandbar_")), "河中應有沙洲（打破大片單色水面）");
// 水色層次：深水 / 淺水 / 淺灘 / 沙洲 / 泥岸 / 濕草
const riverColors = new Set(T.groundLayers
  .filter((g) => g.kind === "river" || g.kind === "river_wet").map((g) => g.colorKey));
ok(riverColors.size >= 5, `河道應至少 5 階色（實得 ${riverColors.size}：${[...riverColors].join("/")}）`);
// 中央：涉水點覆蓋地圖中心 ⇒ 河仍在中央交會
ok(pointInPoly(WORLD_BOUNDS.centerX, WORLD_BOUNDS.centerY, layer("river_shoal_ford").poly),
  "中央交會區應有水（涉水點覆蓋地圖中心）");
// 兩坑：坑心被自己的坑口水域覆蓋 ⇒ 坑與河自然相連
for (const k of ["dragon", "baron"]) {
  ok(pointInPoly(L.pits[k].x, L.pits[k].y, layer(`river_shoal_mouth_${k}`).poly),
    `${k} 坑心應被坑口水域覆蓋（坑與河系相連）`);
}
// 收斂：整個水系離地圖邊界至少 25 單位 ⇒ 不再是「從角落貫穿到角落的大藍帶」
{
  const rpts = T.groundLayers.filter((g) => g.kind === "river").flatMap((g) => g.poly);
  const margin = Math.min(...rpts.map((p) => Math.min(p.x, p.y, WORLD_BOUNDS.maxX - p.x, WORLD_BOUNDS.maxY - p.y)));
  ok(margin >= 25, `河道不應貫穿全圖（離邊界最近 ${margin.toFixed(1)}，要求 ≥25）`);
}
// 河道圖層必須夾在「路緣之上、路面之下」，否則河會被路截斷 / 中路會被河切斷
const yOf = (id) => layer(id).y;
ok(yOf("river_water_ford") > yOf("lane_mid_edge") && yOf("river_water_ford") < yOf("lane_mid_surface"),
  "河道圖層應介於路緣與路面之間");

// F4) 坑：厚壁 + 入口。Dragon 較寬開口較大、Baron 壁更厚更高
const pitWalls = T.wallItems.filter((w) => w.kind === "pit_wall");
ok(pitWalls.length >= 40, `坑壁段數應 ≥40（實得 ${pitWalls.length}）`);
const P = T.meta.pits;
ok(P.dragon.R > P.baron.R, "Dragon 坑應比 Baron 寬");
ok(P.dragon.gapHalf > P.baron.gapHalf, "Dragon 開口應比 Baron 大");
ok(P.baron.thick > P.dragon.thick, "Baron 坑壁應比 Dragon 厚");
ok(P.baron.h > P.dragon.h, "Baron 坑壁應比 Dragon 高");
ok(P.dragon.y > WORLD_BOUNDS.centerY && P.baron.y < WORLD_BOUNDS.centerY, "Dragon 應在下半區、Baron 在上半區");
for (const k of ["dragon", "baron"]) {
  const near = T.entrances.filter((g) => g.key.startsWith(`ent_${k}`));
  ok(near.length === 2, `${k} 應有 2 個入口`);
  ok(near.every((g) => inAnyPoly(g.x, g.y, polysWithPrefix("river_bank_"))), `${k} 的入口應朝向河道`);
}

// F5) 基地/高地：主堡台 → 內庭 → 高地平台 → 城牆 → 高地草地 → 高地走廊
for (const side of ["blue", "red"]) {
  for (const part of ["apron", "court", "keep"]) {
    ok(layerIds.has(`base_${side}_${part}`), `${side} 基地應有 ${part} 層（主堡台/內庭/高地平台三階）`);
  }
  ok(layerIds.has(`highland_${side}`), `${side} 應有高地草地`);
  const ramps = ["top", "mid", "bot"].filter((ln) => layerIds.has(`ramp_${side}_${ln}`));
  ok(ramps.length === 3, `${side} 應有三條出口坡道（實得 ${ramps.length}）`);
  const bgates = T.entrances.filter((g) => g.key.startsWith(`baseent_${side}`));
  ok(bgates.length === 3, `${side} 應有三個高地出口（實得 ${bgates.length}）`);
  // 三個出口必須真的張開（照 lane 起點取角度時只差 23°，三個出口會糊成一團）
  const angs = bgates.map((g) => g.angle);
  const spread = Math.max(...angs) - Math.min(...angs);
  ok(spread > 1.0, `${side} 三路出口應明顯張開（實得 ${(spread * 180 / Math.PI).toFixed(0)}°，要求 >57°）`);
  // 主堡與泉水都要落在自己的主堡台上
  const keep = layer(`base_${side}_keep`);
  ok(pointInPoly(L.bases[side].x, L.bases[side].y, keep.poly), `${side} 主堡台應包住主堡`);
  ok(pointInPoly(L.fountains[side].x, L.fountains[side].y, keep.poly), `${side} 主堡台應包住泉水`);
  ok(pointInPoly(L.bases[side].x, L.bases[side].y, layer(`base_${side}_apron`).poly), `${side} 高地平台應包住主堡`);
  // 高地走廊：每條路都要有一段高地草地延伸到自己的高地塔
  for (const ln of ["top", "mid", "bot"]) {
    ok(layerIds.has(`highland_${side}_${ln}`), `${side} 的 ${ln} 應有高地走廊`);
    const hg = T.towers.find((t) => t.side === side && t.lane === ln && t.kind === "highground");
    ok(pointInPoly(hg.x, hg.y, layer(`highland_${side}_${ln}`).poly),
      `${side} ${ln} 的高地塔應站在高地走廊上`);
  }
}
//  「城牆感」不再用段數判定（G.15-fix4 起牆段是等長短段，段數會隨 rimStep 變動而
//  失真），改量**實際的城牆覆蓋角度**：外牆是繞平台中心的同心弧，量兩方各自的
//  base_rim + base_gate 覆蓋了圓周幾度。三個模組首尾相接 ⇒ 應覆蓋 ≥150°。
{
  for (const side of ["blue", "red"]) {
    const C = T.baseBlueprint[side].find((i) => i.kind === "apron_center");
    const angs = T.baseBlueprint[side]
      .filter((i) => i.role === "wall" && (i.kind === "base_rim" || i.kind === "base_gate"))
      .map((i) => Math.atan2(i.y - C.y, i.x - C.x));
    const ref = angs[0];
    const rel = angs.map((a) => Math.atan2(Math.sin(a - ref), Math.cos(a - ref)));
    const cover = (Math.max(...rel) - Math.min(...rel)) * 180 / Math.PI;
    ok(cover >= 150, `${side} 基地城牆覆蓋角度應 ≥150°（實得 ${cover.toFixed(1)}°）`);
  }
  ok(T.wallItems.filter((w) => w.kind === "base_rim").length >= 18, "基地應有高地外牆（城牆感）");
}
ok(T.wallItems.filter((w) => w.kind === "base_keep").length >= 20, "基地應有主堡內牆（肩牆）");
ok(HEIGHT.base_rim > HEIGHT.base_keep, "高地外牆應比主堡內牆高（外圈才是防禦邊界）");

// F6) 塔位層級：由基地往外＝高地塔 → 內塔 → 外塔；量體與底座尺寸同序
ok(T.towers.length === 18, `塔標記應 18 座（實得 ${T.towers.length}）`);
for (const side of ["blue", "red"]) {
  for (const ln of ["top", "mid", "bot"]) {
    const three = T.towers.filter((t) => t.side === side && t.lane === ln)
      .sort((a, b) => a.distToOwnBase - b.distToOwnBase);
    ok(three.length === 3, `${side} ${ln} 應有 3 座塔`);
    ok(three.map((t) => t.kind).join(">") === TOWER_ORDER.join(">"),
      `${side} ${ln} 由基地往外應是 高地塔>內塔>外塔（實得 ${three.map((t) => `${t.kind}@${t.distToOwnBase.toFixed(0)}`).join(" > ")}）`);
  }
}
const specOf = (kind) => T.towers.find((t) => t.kind === kind);
ok(specOf("highground").padR > specOf("inner").padR && specOf("inner").padR > specOf("outer").padR,
  "底座大小應為 高地塔 > 內塔 > 外塔");
ok(specOf("highground").plazaR > specOf("inner").plazaR && specOf("inner").plazaR > specOf("outer").plazaR,
  "塔前廣場應為 高地塔 > 內塔 > 外塔");
ok(specOf("highground").tiers.length >= specOf("outer").tiers.length + 1, "高地塔的疊層數應多於外塔");
ok(new Set(T.towers.map((t) => t.plinth)).size === 3, "三種塔的底座色應各自不同");
for (const t of T.towers) {
  ok(pointInPoly(t.x, t.y, layer(`lane_${t.lane}_surface`).poly), `塔 ${t.id} 應落在 ${t.lane} 路面上`);
  ok(layerIds.has(`towerpad_${t.id}`) && layerIds.has(`plaza_${t.id}`), `塔 ${t.id} 應有底座與廣場色塊`);
}

// ── G.2 F6b) 門牙塔：雙方各 2 座、站在自己的主堡台上、比高地塔更靠近主堡 ──────
ok(T.nexusTurrets.length === 4, `門牙塔應 4 座（雙方各 2；實得 ${T.nexusTurrets.length}）`);
for (const side of ["blue", "red"]) {
  const nt = T.nexusTurrets.filter((t) => t.side === side);
  ok(nt.length === 2, `${side} 應有 2 座門牙塔`);
  const keep = layer(`base_${side}_keep`).poly;
  for (const t of nt) {
    ok(pointInPoly(t.x, t.y, keep), `門牙塔 ${t.id} 應站在主堡台上`);
    ok(layerIds.has(`towerpad_${t.id}`), `門牙塔 ${t.id} 應有底座色塊`);
  }
  // 兩座門牙塔必須分開站在主堡兩側，不能疊在一起
  ok(d2(nt[0], nt[1]) > 12, `${side} 兩座門牙塔應分立主堡兩側（實得 ${d2(nt[0], nt[1]).toFixed(1)}）`);
  // 完整防禦順序：主堡 → 門牙塔 → 高地塔 → 內塔 → 外塔
  const hg = Math.min(...T.towers.filter((t) => t.side === side && t.kind === "highground").map((t) => t.distToOwnBase));
  ok(nt[0].distToOwnBase < hg, `${side} 門牙塔應比高地塔更靠近主堡（${nt[0].distToOwnBase.toFixed(1)} < ${hg.toFixed(1)}）`);
}

// ── G.2 F6c) 高地塔要真的「在高地上」：離自己基地 ≤55，而且比內塔近得多 ────────
for (const t of T.towers.filter((x) => x.kind === "highground")) {
  ok(t.distToOwnBase <= 55, `高地塔 ${t.id} 應貼近基地（離基地 ${t.distToOwnBase.toFixed(1)}，要求 ≤55）`);
}

// ── G.2 F6d) 中央交戰區：中路兩座外塔必須拉開，中心要留得下未來的英雄/兵線 ────
{
  const midOuter = T.towers.filter((t) => t.lane === "mid" && t.kind === "outer");
  ok(midOuter.length === 2, "mid 應有 2 座外塔");
  const gap = d2(midOuter[0], midOuter[1]);
  const edgeGap = gap - midOuter[0].plazaR - midOuter[1].plazaR;
  ok(edgeGap >= TOWER_GAP.midCenter,
    `中路兩座外塔的**邊緣**應拉開（中心距 ${gap.toFixed(1)}、邊緣淨距 ${edgeGap.toFixed(1)}，要求 ≥${TOWER_GAP.midCenter}）`);
  for (const t of midOuter) {
    ok(t.distToCenter >= 12,
      `中路外塔 ${t.id} 應退離地圖中心（實得 ${t.distToCenter.toFixed(1)}，要求 ≥12）`);
  }
  ok(layerIds.has("center_arena"), "中央應有交戰空地鋪面");
  // 中央空地必須畫在河之下，否則會把中央涉水點整塊蓋掉、河被切成兩段
  ok(layer("center_arena").y < yOf("river_bank_ford"), "中央空地圖層應在河之下");
}

// ── G.2 F6e) 塔位淨空：不得壓在野怪營地 / 坑心上 ───────────────────────────
for (const t of [...T.towers, ...T.nexusTurrets]) {
  for (const c of T.camps) {
    ok(d2(t, c) >= TOWER_CLEARANCE.camp,
      `塔 ${t.id} 不應壓在 ${c.id} 上（實得 ${d2(t, c).toFixed(1)}，要求 ≥${TOWER_CLEARANCE.camp}）`);
  }
  for (const k of ["dragon", "baron"]) {
    ok(d2(t, L.pits[k]) >= TOWER_CLEARANCE.pit,
      `塔 ${t.id} 不應壓在 ${k} 坑上（實得 ${d2(t, L.pits[k]).toFixed(1)}）`);
  }
}

// ── G.2 F6f) 呈現座標 vs 模擬座標：每座塔都必須留下 sim 對照，且左右對稱 ───────
for (const t of T.towers) {
  ok(Number.isFinite(t.sim?.x) && Number.isFinite(t.sim?.y) && Number.isFinite(t.sim?.t),
    `塔 ${t.id} 應保留模擬座標對照 sim{t,x,y}`);
}
for (const lane of ["top", "mid", "bot"]) {
  ok(DISPLAY_T[lane].length === 3, `${lane} 應有 3 個呈現用 t`);
  for (let tier = 0; tier < 3; tier++) {
    const b = T.towers.find((t) => t.side === "blue" && t.lane === lane && t.tier === tier);
    const r = T.towers.find((t) => t.side === "red" && t.lane === lane && t.tier === tier);
    // 對稱的**真正判準**是上面那條：藍 t 與紅 t 必須互為 1−t（精確相等）。
    // 這裡再用座標驗一次。
    // ⚠ 配對方式：gameData 的 top lane 沿左/上緣走、bot lane 沿下/右緣走，
    //   兩者互為 180° 鏡像 ⇒ 要比的是「藍 top ↔ 紅 bot」，不是「藍 top ↔ 紅 top」。
    //   （mid 自己鏡射到自己。）拿同一條 lane 互比會得到 160+ 的誤差，那是配對錯，不是資料錯。
    //   ⚠ MIRROR_LANE 現在由 mapTowerLayoutStyle 匯出（G.14 的塔位鏡射校正也用它）。
    const rm = T.towers.find((t) => t.side === "red" && t.lane === MIRROR_LANE[lane] && t.tier === tier);
    const mirrorErr = Math.hypot((220 - b.x) - rm.x, (220 - b.y) - rm.y);
    //  G.14 起塔位已嚴格鏡射，門檻由 6 收到 0.05（回歸時第一時間就會紅）
    ok(mirrorErr < 0.05,
      `藍 ${lane} tier${tier} 的 180° 鏡像應落在紅 ${MIRROR_LANE[lane]} tier${tier} 上（誤差 ${mirrorErr.toFixed(1)}）`);
    ok(r.kind === b.kind, `${lane} tier${tier} 兩方塔的層級應相同`);
    ok(Math.abs(b.displayT - (1 - r.displayT)) < 1e-9, `${lane} tier${tier} 的呈現 t 應左右對稱`);
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  G.2 F6g) 野怪 / 史詩野怪的低模剪影
// ══════════════════════════════════════════════════════════════════════════
ok(T.monsters.length === T.camps.length + 2,
  `野怪應為 ${T.camps.length} 個營地 + 2 隻史詩（實得 ${T.monsters.length}）`);
for (const c of T.camps) {
  const m = T.monsters.find((x) => x.id === `mon_${c.id}`);
  ok(!!m, `${c.id} 應有野怪剪影`);
  ok(m && d2(m, c) < 0.001, `${c.id} 的野怪應站在營地的呈現座標上`);
  ok(m && pointInPoly(m.x, m.y, layer(`clearing_${c.id}`).poly), `${c.id} 的野怪應在自己的空地內`);
}
for (const k of ["dragon", "baron"]) {
  const m = T.monsters.find((x) => x.id === `mon_${k}`);
  ok(!!m && m.kind === "epic", `${k} 坑內應有史詩野怪本體`);
  ok(m && d2(m, L.pits[k]) < 0.001, `${k} 本體應在坑心`);
}
// 兩隻 Buff 的剪影必須不同原型（一個直立、一個趴低）⇒ 不能只有換顏色
{
  const bb = T.monsters.find((m) => m.id === "mon_camp_blue_buff");
  const rb = T.monsters.find((m) => m.id === "mon_camp_red_buff");
  ok(bb && rb && bb.archetype !== rb.archetype, "藍/紅 Buff 應是不同原型（不是同一個模型換色）");
  // 史詩兩隻也必須靠形狀分辨：Dragon 寬、Baron 高
  const dr = T.monsters.find((m) => m.id === "mon_dragon");
  const br = T.monsters.find((m) => m.id === "mon_baron");
  ok(br.top > dr.top * 1.5, `Baron 應明顯比 Dragon 高（${br.top} vs ${dr.top}）`);
  const spanY = (m) => Math.max(...m.members.flatMap((mm) => mm.parts.map((p) => Math.abs(p.dy) + (p.d ?? p.r ?? 0) / 2)));
  ok(spanY(dr) > spanY(br) * 1.4, `Dragon 應明顯比 Baron 寬（翼展 ${spanY(dr).toFixed(1)} vs ${spanY(br).toFixed(1)}）`);
}
// 一般野怪要是「群體」；每隻怪都要有血條預留高度；不得有 NaN
for (const m of T.monsters) {
  ok(Number.isFinite(m.x) && Number.isFinite(m.y) && Number.isFinite(m.facing), `野怪 ${m.id} 不應含 NaN`);
  ok(m.headroom > m.top, `野怪 ${m.id} 應保留血條空間（headroom ${m.headroom} > top ${m.top}）`);
  ok(m.members.length >= 1 && m.members.every((mm) => mm.parts.length >= 3),
    `野怪 ${m.id} 的每個成員應至少 3 個組件（才有剪影可言）`);
  for (const mm of m.members) {
    for (const p of mm.parts) {
      ok(["box", "cyl", "cone", "octa", "ico", "sph", "cap"].includes(p.shape), `野怪 ${m.id} 的組件形狀 ${p.shape} 未支援`);
      ok(Number.isFinite(p.dx) && Number.isFinite(p.dy) && Number.isFinite(p.z) && Number.isFinite(p.h),
        `野怪 ${m.id} 的組件不應含 NaN`);
      if (p.shape === "sph") ok(Number.isFinite(p.rx) && Number.isFinite(p.ry) && Number.isFinite(p.rz) && p.rx > 0 && p.ry > 0 && p.rz > 0, `野怪 ${m.id} 的橢球組件半徑應為正且無 NaN`);
      if (p.shape === "cap") ok(Number.isFinite(p.r) && Number.isFinite(p.len) && p.r > 0 && p.len > 0, `野怪 ${m.id} 的膠囊組件半徑/長度應為正且無 NaN`);
      ok(p.h > 0, `野怪 ${m.id} 的組件應有正高度`);
    }
  }
}
//  一般營地要嘛是群體，要嘛是「一隻夠大的單體」（蟾蜍就是單體，那是它的設計）。
for (const m of T.monsters.filter((x) => x.kind === "camp")) {
  ok(m.members.length >= 2 || m.top >= 5,
    `${m.id}（${m.label}）應是群體，或是體型夠大的單體（成員 ${m.members.length}、高 ${m.top}）`);
}
// 剪影必須完全塞得進自己的坑（不能穿牆）
for (const k of ["dragon", "baron"]) {
  const m = T.monsters.find((x) => x.id === `mon_${k}`);
  const reach = Math.max(...m.members.flatMap((mm) => mm.parts.map((p) =>
    Math.hypot(p.dx, p.dy) + Math.max(p.r ?? 0, (p.w ?? 0) / 2, (p.d ?? 0) / 2))));
  ok(reach <= T.meta.pits[k].R, `${k} 本體應塞得進坑內（伸展 ${reach.toFixed(1)} ≤ 坑半徑 ${T.meta.pits[k].R}）`);
}

// ══════════════════════════════════════════════════════════════════════════
//  Milestone G.3：塔距正規化 / 出口可通行 / 真 3D 野怪 / 溫泉可讀
// ══════════════════════════════════════════════════════════════════════════

// G1) 整條防禦鏈的**邊緣淨距**（中心距減兩塔的塔前廣場半徑）都要達標。
//     只看中心距會被「塔太胖」騙過去，這正是 G.2 中路踩到的坑。
const chainReport = [];
for (const side of ["blue", "red"]) {
  const nt = T.nexusTurrets.filter((t) => t.side === side);
  for (const lane of ["top", "mid", "bot"]) {
    const ch = T.towers.filter((t) => t.side === side && t.lane === lane)
      .sort((a, b) => a.distToOwnBase - b.distToOwnBase);
    const nearNT = nt.reduce((m, t) => Math.min(m, d2(t, ch[0])), Infinity);
    const links = [
      ["門牙→高地", nearNT - nt[0].padR - ch[0].plazaR],
      ["高地→內塔", d2(ch[0], ch[1]) - ch[0].plazaR - ch[1].plazaR],
      ["內塔→外塔", d2(ch[1], ch[2]) - ch[1].plazaR - ch[2].plazaR],
    ];
    for (const [name, edge] of links) {
      ok(edge >= TOWER_GAP.chain,
        `${side} ${lane} 的「${name}」邊緣淨距不足（實得 ${edge.toFixed(1)}，要求 ≥${TOWER_GAP.chain}）`);
    }
    chainReport.push([side, lane, nearNT, d2(ch[0], ch[1]), d2(ch[1], ch[2]), ch[2].distToCenter]);
  }
}
// 塔的體積本身也要收斂：最大的塔前廣場直徑不得超過地圖寬度的 9%
{
  const maxPlaza = Math.max(...T.towers.map((t) => t.plazaR)) * 2;
  ok(maxPlaza <= WORLD_BOUNDS.width * 0.09,
    `塔前廣場直徑應收斂（最大 ${maxPlaza.toFixed(1)} ≤ ${(WORLD_BOUNDS.width * 0.09).toFixed(1)}）`);
}

// G2) 入口不得再有「門柱」這類獨立造型物件；改用岩壁收口
ok(T.gates === undefined, "T.gates（門柱）應已移除，改用 T.entrances 純資料 + 岩壁收口");
ok(Array.isArray(T.entrances) && T.entrances.length >= 10, "入口節點資料應保留（供地形收口與驗證用）");
ok(T.entrances.every((e) => e.scale === undefined),
  "入口節點不應再帶造型參數（scale 是門柱時代的欄位）");
{
  const taper = T.wallItems.filter((w) => w.kind === "entrance_taper");
  ok(taper.length >= 40, `入口應以岩壁收口表達（entrance_taper 段數 ${taper.length}，要求 ≥40）`);
  // 收口必須比它所屬的主牆矮 ⇒ 讀成「牆收下去」而不是「多了兩根柱子」
  const maxTaper = Math.max(...taper.map((w) => w.h));
  const pitH = Math.max(HEIGHT.pit_wall_dragon, HEIGHT.pit_wall_baron);
  ok(maxTaper < pitH, `岩壁收口應比主牆矮（收口最高 ${maxTaper.toFixed(1)} < 坑壁 ${pitH}）`);
  for (const k of ["dragon", "baron"]) {
    const near = taper.filter((w) => d2(w, L.pits[k]) < T.meta.pits[k].R + 4);
    ok(near.length >= 8, `${k} 坑口應有岩壁收口（實得 ${near.length} 段）`);
  }
}

// G3) 高地出口必須「看得出可以走」：通道內不得有任何量體或裝飾岩
{
  const corridors = T.meta.exitCorridorPolys;
  ok(corridors.length === 6, `雙方應各有 3 條出口淨空通道（實得 ${corridors.length}）`);
  const blocked = T.wallItems.filter((w) => w.kind !== "fountain_rim")
    .filter((w) => corridors.some((poly) => pointInPoly(w.x, w.y, poly)));
  ok(blocked.length === 0, `高地出口通道內不應有任何牆體（實得 ${blocked.length} 段）`);
  const rockBlocked = T.rocks.filter((r) => corridors.some((poly) => pointInPoly(r.x, r.y, poly)));
  ok(rockBlocked.length === 0, `高地出口通道內不應有裝飾岩（實得 ${rockBlocked.length} 顆）`);
  for (const side of ["blue", "red"]) {
    for (const [li, ln] of ["top", "mid", "bot"].entries()) {
      const poly = T.meta.bases[side].exitCorridors[li].poly;
      const hg = T.towers.find((t) => t.side === side && t.lane === ln && t.kind === "highground");
      ok(pointInPoly(L.bases[side].x, L.bases[side].y, poly), `${side} ${ln} 通道應從主堡出發`);
      ok(pointInPoly(hg.x, hg.y, poly), `${side} ${ln} 通道應通到自己的高地塔`);
    }
  }
  const rockOnRoad = T.rocks.filter((r) => ["top", "mid", "bot"]
    .some((ln) => pointInPoly(r.x, r.y, layer(`lane_${ln}_surface`).poly)));
  ok(rockOnRoad.length === 0, `裝飾岩不應站在路面上（實得 ${rockOnRoad.length} 顆）`);
}

// G4) 溫泉 / 回補區可讀：平台 → 台階 → 水面 → 池緣矮牆
for (const side of ["blue", "red"]) {
  for (const part of ["pad", "step", "pool", "walk"]) {
    ok(layerIds.has(`fountain_${side}_${part}`), `${side} 溫泉應有 ${part} 層`);
  }
  const f = L.fountains[side];
  ok(pointInPoly(f.x, f.y, layer(`fountain_${side}_pool`).poly), `${side} 泉水座標應落在水池內`);
  ok(pointInPoly(f.x, f.y, layer(`base_${side}_apron`).poly), `${side} 溫泉應蓋在高地平台上`);
  const dc = (p) => Math.hypot(p.x - WORLD_BOUNDS.centerX, p.y - WORLD_BOUNDS.centerY);
  ok(dc(f) > dc(L.bases[side]), `${side} 溫泉應在主堡後方（離中心更遠）`);
  ok(pointInPoly(L.bases[side].x, L.bases[side].y, layer(`fountain_${side}_walk`).poly),
    `${side} 溫泉走道應接到主堡`);
}
ok(T.wallItems.filter((w) => w.kind === "fountain_rim").length >= 20, "溫泉應有池緣矮牆（結構感）");

// G5) 野怪必須是**真的 3D 實體**，不是點 / marker / 符號
for (const m of T.monsters) {
  const partCount = m.members.reduce((n, mm) => n + mm.parts.length, 0);
  ok(partCount >= 20, `野怪 ${m.id} 的組件數應 ≥20（實得 ${partCount}；marker 等級是 1~5）`);
  const shapes = new Set(m.members.flatMap((mm) => mm.parts.map((p) => p.shape)));
  ok(shapes.size >= 3, `野怪 ${m.id} 應由至少 3 種基本量體組成（實得 ${[...shapes].join("/")}）`);
  const zs = m.members.flatMap((mm) => mm.parts.map((p) => p.z));
  ok(Math.min(...zs) <= 0.5, `野怪 ${m.id} 應有貼地的肢體`);
  ok(Math.max(...zs) >= m.top * 0.45, `野怪 ${m.id} 應有明顯的高處部位（頭 / 冠 / 背刺）`);
  ok(m.headroom > m.top, `野怪 ${m.id} 應保留血條空間`);
}
// 群體怪必須有大小差（頭狼 / 大石頭怪要比小的大）
for (const id of ["mon_camp_blue_a", "mon_camp_blue_b"]) {
  const m = T.monsters.find((x) => x.id === id);
  const scales = m.members.map((mm) => mm.scale).sort((a, b) => b - a);
  ok(scales[0] >= scales[scales.length - 1] * 1.3,
    `${id} 應有明顯的主怪／小怪大小差（實得 ${scales.join("/")}）`);
}
// 佔地半徑必須放得進自己的空間
for (const c of T.camps) {
  const m = T.monsters.find((x) => x.id === `mon_${c.id}`);
  const clearR = Math.max(...layer(`clearing_${c.id}`).poly.map((p) => d2(p, c)));
  ok(monsterReach(m) <= clearR + 1,
    `${c.id} 的野怪應放得進自己的空地（伸展 ${monsterReach(m).toFixed(1)} ≤ ${clearR.toFixed(1)}）`);
}
for (const k of ["dragon", "baron"]) {
  const m = T.monsters.find((x) => x.id === `mon_${k}`);
  ok(monsterReach(m) <= T.meta.pits[k].R,
    `${k} 本體應塞得進坑內（伸展 ${monsterReach(m).toFixed(1)} ≤ ${T.meta.pits[k].R}）`);
}
// 史詩野怪必須明顯大於一般野怪
{
  const epicTop = Math.min(...T.monsters.filter((m) => m.kind === "epic").map((m) => m.top));
  const campTop = Math.max(...T.monsters.filter((m) => m.kind === "camp").map((m) => m.top));
  ok(epicTop > campTop * 1.35, `史詩野怪應明顯大於一般野怪（${epicTop} vs ${campTop}）`);
}

// G6) 營地要讀得出是營地：空地 + 踩踏地，而且必須畫在路的外圈之上
for (const c of T.camps) {
  ok(layerIds.has(`campfloor_${c.id}`), `${c.id} 應有踩踏地`);
  ok(layer(`clearing_${c.id}`).y > yOf("lane_mid_shoulder"),
    `${c.id} 的空地應畫在路肩之上（否則貼著中路的 Buff 營地會被路蓋掉）`);
  ok(layer(`clearing_${c.id}`).y < yOf("lane_mid_edge"),
    `${c.id} 的空地不應蓋到路緣 / 路面`);
}

// F7) 野區與草地層次
ok(L.quadrants.every((q) => layerIds.has(`jungle_${q.id}`)), "四個野區應各有草地色塊");
ok(T.camps.every((c) => layerIds.has(`clearing_${c.id}`)), "每個營地應有野區空地");
for (const c of T.camps) {
  ok(pointInPoly(c.x, c.y, layer(`clearing_${c.id}`).poly), `營地 ${c.id} 應位於自己的空地內`);
  ok(T.entrances.some((g) => g.key === `junent_${c.id}`), `營地 ${c.id} 應有野區入口`);
}
//  G.10：野區改成分散圓岩塊（rock）+ 短路線結構（jungle_struct），不再是長牆鏈。
const jungleWalls = T.wallItems.filter((w) => w.kind === "rock" || w.kind === "jungle_struct");
ok(jungleWalls.length >= 80, `野區岩體段（rock+結構）應 ≥80（實得 ${jungleWalls.length}）`);
const avgLen = jungleWalls.reduce((m, w) => m + w.len, 0) / Math.max(1, jungleWalls.length);
ok(avgLen < 5, `野區岩體平均段長應 <5（分散短塊；實得 ${avgLen.toFixed(2)}）`);
// 草地層次：一般 / 亮斑 / 暗斑 / 野區 ×2 / 樹蔭 / 空地 / 高地 ×2 / 濕草
const grassKeys = new Set(T.groundLayers.map((g) => g.colorKey).filter((k) => k && k.startsWith("grass_")));
ok(grassKeys.size >= 8, `草地應至少 8 階色（實得 ${grassKeys.size}：${[...grassKeys].join("/")}）`);

// ══════════════════════════════════════════════════════════════════════════
//  Milestone G.4：中文標籤 / 路面配色 / Buff 回野區 / 野區密度
// ══════════════════════════════════════════════════════════════════════════

// H1) 地圖上的文字一律繁體中文，不得中英混用
{
  // 允許：中文、數字、全形括號、空白、以及「Buff」這個已定案的專有名詞。
  const ALLOWED = /^[　-〿一-鿿0-9\s（）()／·、,.-]*(Buff)?[　-〿一-鿿0-9\s（）()／·、,.-]*$/;
  for (const l of LM.labels) {
    ok(typeof l.text === "string" && l.text.length > 0, `標籤 ${l.key} 應有文字`);
    ok(ALLOWED.test(l.text), `標籤「${l.text}」(${l.key}) 不應含中文以外的英文字（Buff 除外）`);
  }
  // 指名檢查使用者列出的每一個字樣
  const want = {
    lbl_top: "上路", lbl_mid: "中路", lbl_bot: "下路",
    lbl_dragon: "小龍", lbl_baron: "巴龍",
    lbl_base_blue: "藍方主堡", lbl_base_red: "紅方主堡",
    lbl_camp_blue_buff: "藍 Buff", lbl_camp_red_buff: "紅 Buff",
    lbl_camp_blue_a: "狼營", lbl_camp_blue_b: "石甲蟲",
    lbl_pcamp_blue_raptor: "鳥營", lbl_pcamp_blue_gromp: "蟾蜍",
  };
  for (const [key, text] of Object.entries(want)) {
    const l = LM.labels.find((x) => x.key === key);
    ok(l && l.text === text, `標籤 ${key} 應為「${text}」（實得「${l ? l.text : "不存在"}」）`);
  }
  // 兩側同名營地的標籤必須一致（不能一邊中文一邊英文）
  for (const key of ["a", "b"]) {
    const b = LM.labels.find((x) => x.key === `lbl_camp_blue_${key}`);
    const r = LM.labels.find((x) => x.key === `lbl_camp_red_${key}`);
    ok(b.text === r.text, `兩側 ${key} 營地的標籤應相同`);
  }
}

// H2) 路面配色：低彩度土石路，不是亮黃
{
  const chroma = (hex) => {
    const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
    return Math.max(r, g, b) - Math.min(r, g, b);
  };
  const lum = (hex) => (((hex >> 16) & 255) * 0.3 + ((hex >> 8) & 255) * 0.59 + (hex & 255) * 0.11);
  for (const key of ["lane_surface", "lane_surface_side", "lane_inlay", "lane_patch"]) {
    ok(chroma(PALETTE[key]) <= 45,
      `路面色 ${key} 的彩度應 ≤45（實得 ${chroma(PALETTE[key])}；G.3 的 #a38c62 是 65）`);
  }
  // 但仍要與草地拉開明度，否則路會消失
  ok(lum(PALETTE.lane_surface) - lum(PALETTE.grass_arena) >= 55,
    "路面仍須明顯亮於草地（靠明度而不是彩度來讀）");
  ok(lum(PALETTE.lane_surface) > lum(PALETTE.lane_surface_side),
    "中路路面仍須亮於上/下路");
}

// H3) Buff / 所有營地都不可站在路上
{
  const lanePlan = buildLanePlan(L);
  const lanePts = ["top", "mid", "bot"].flatMap((ln) => lanePlan.paths[ln]);
  const distLane = (p) => Math.min(...lanePts.map((q) => d2(p, q)));
  for (const c of T.camps) {
    const dl = distLane(c);
    ok(dl >= CAMP_CLEARANCE.lane,
      `營地 ${c.id} 距最近路線應 ≥${CAMP_CLEARANCE.lane}（實得 ${dl.toFixed(1)}）`);
    // 更硬的判準：怪物本體不得落在任何一條路的「草緣」帶之內
    for (const ln of ["top", "mid", "bot"]) {
      ok(!pointInPoly(c.x, c.y, layer(`lane_${ln}_verge`).poly),
        `營地 ${c.id} 不應落在 ${ln} 的路帶內`);
    }
  }
  // 位移必須左右對稱（藍方位移多少，紅方就位移多少）
  for (const key of ["buff", "a", "b"]) {
    const b = T.camps.find((c) => c.id === `camp_blue_${key}`);
    const r = T.camps.find((c) => c.id === `camp_red_${key}`);
    ok(Math.abs(b.offset - r.offset) < 0.01, `${key} 營地兩側的位移量應相同`);
    ok(Math.abs((220 - b.x) - r.x) < 0.01 && Math.abs((220 - b.y) - r.y) < 0.01,
      `${key} 營地兩側的呈現座標應互為 180° 鏡射`);
  }
  // 位移後仍必須保留模擬座標對照
  for (const c of T.camps.filter((x) => !x.isPresentation)) {
    ok(Number.isFinite(c.sim?.x) && Number.isFinite(c.sim?.y), `${c.id} 應保留模擬座標對照`);
  }
}

// H4) 每一側野區都要有 6 個營地，而且四個象限都不能是空的
{
  for (const side of ["blue", "red"]) {
    const mine = T.camps.filter((c) => c.side === side);
    //  每側 5 個營地 = 1 個 Buff + 4 種一般野怪（狼營 / 石甲蟲 / 鳥營 / 蟾蜍）。
    //  ⚠ 不是 6：gameData 每側只給了**一種** Buff（藍側只有藍 Buff、紅側只有紅 Buff）。
    //    要做到「每側都有藍紅兩種 Buff」必須由模擬層新增 Buff 實體 —— Buff 會影響戰力，
    //    在呈現層憑空多畫一個會直接誤導遊戲規則，所以刻意不做。
    ok(mine.length === 5, `${side} 側應有 5 個營地（實得 ${mine.length}）`);
    const kinds = new Set(mine.map((c) => c.archetype));
    ok(kinds.size === 5, `${side} 側的 5 個營地應是 5 種不同的怪（實得 ${[...kinds].join("/")}）`);
    ok(mine.filter((c) => c.type === "buff").length === 1, `${side} 側應有 1 個 Buff 營地`);
    for (const need of ["wolves", "krug", "raptors", "gromp"]) {
      ok(kinds.has(need), `${side} 側應有 ${need} 營地`);
    }
  }
  // 兩側的怪種類必須完全一樣（不製造單邊差異）
  //  一般野怪的種類兩側必須完全相同；Buff 本來就是一邊一種（藍側藍 Buff、紅側紅 Buff）。
  const neutralOf = (side) => [...new Set(T.camps
    .filter((c) => c.side === side && c.type !== "buff").map((c) => c.archetype))].sort().join(",");
  ok(neutralOf("blue") === neutralOf("red"), "兩側野區的一般野怪種類必須完全相同");
  // 四個象限都要有營地
  for (const q of L.quadrants) {
    const n = T.camps.filter((c) => d2(c, q) < q.r * 1.9).length;
    ok(n >= 1, `野區象限 ${q.id} 應至少有 1 個營地（實得 ${n}）`);
  }
  // 呈現用營地必須明確標記（它們沒有模擬實體）
  const pres = T.camps.filter((c) => c.isPresentation);
  ok(pres.length === 4, `呈現用營地應為 4 個（實得 ${pres.length}）`);
  ok(pres.every((c) => c.sim === null), "呈現用營地不應宣稱有模擬座標");
  // 有模擬實體的營地數必須跟 gameData 完全一致
  ok(T.camps.filter((c) => !c.isPresentation).length === L.camps.length,
    "有模擬實體的營地數必須與 gameData.CAMPS 一致（不得憑空增加模擬怪）");
}

// H5) 每個營地都要有 3D 實體、口袋牆、空地、踩踏地
for (const c of T.camps) {
  const m = T.monsters.find((x) => x.id === `mon_${c.id}`);
  ok(!!m, `${c.id} 應有野怪實體`);
  const parts = m.members.reduce((n, mm) => n + mm.parts.length, 0);
  ok(parts >= 20, `${c.id}（${c.label}）的野怪組件應 ≥20（實得 ${parts}）`);
  // G.10：營地不再被口袋牆包圍，改成**背面部分掩體**（≥2 顆分散岩塊），讀得出「營地」
  //  但不封死（sealed 檢查在 K12）。
  const cover = T.wallItems.filter((w) => {
    const d = d2(w, c);
    return (w.kind === "rock") && d > c.clearR * 0.7 && d < c.clearR * 2.2;
  });
  ok(cover.length >= 2, `${c.id} 應有背面部分掩體（≥2 顆岩塊；實得 ${cover.length}）`);
}

// H6) 野區密度：G.7 起「不以渲染小段數量為品質指標」——同心弧砍到 2 圈以求可走性。
//  野區結構＝弧牆 wall + 路線結構 jungle_struct 合計，仍要有足量短段（避免變回空地），
//  但真正的品質門檻在 J1（通行）/ J4（功能牆鏈）/ I5（路線結構），不再堆段數。
{
  const jungle = T.wallItems.filter((w) => w.kind === "rock" || w.kind === "jungle_struct");
  ok(jungle.length >= 80, `野區岩體段（rock+路線結構）應 ≥80（實得 ${jungle.length}）`);
  const avg = jungle.reduce((m, w) => m + w.len, 0) / jungle.length;
  ok(avg < 5, `野區岩體平均段長應 <5（實得 ${avg.toFixed(2)}）`);
  // 河岸兩側也要有結構，河與野區的交界不能是硬邊
  const nearRiver = jungle.filter((w) => {
    const arms = [...T.meta.river.meta.armPaths.baron, ...T.meta.river.meta.armPaths.dragon];
    return Math.min(...arms.map((p) => d2(w, p))) < 30;
  });
  ok(nearRiver.length >= 30, `河岸附近應有野區結構（實得 ${nearRiver.length} 段）`);
}

// ══════════════════════════════════════════════════════════════════════════
//  Milestone G.5 / G.6：結構完整性硬化 + 野區草叢（Cover）+ 血條掛點
// ══════════════════════════════════════════════════════════════════════════

// I1) G.5 結構完整性彙總（把使用者列的關鍵結構一次斷言齊全）
//     這些個別項目 G.1~G.3 已建，這裡集中把關「六路 × 四階塔 + 門牙塔 + 泉水」齊備。
{
  for (const side of ["blue", "red"]) {
    // 每側：3 路 ×（外/內/高地）= 9 座兵線塔 + 2 座門牙塔
    const mine = T.towers.filter((t) => t.side === side);
    ok(mine.length === 9, `${side} 應有 9 座兵線塔（3 路 × 3 階；實得 ${mine.length}）`);
    ok(T.nexusTurrets.filter((t) => t.side === side).length === 2, `${side} 應有 2 座門牙塔`);
    for (const kind of ["outer", "inner", "highground"]) {
      ok(mine.filter((t) => t.kind === kind).length === 3, `${side} 應有 3 座${kind}`);
    }
    // 泉水 / 重生區（主堡後方，四層）齊備 —— 前面 G4) 已細驗，這裡確認存在性
    ok(layerIds.has(`fountain_${side}_pool`), `${side} 應有泉水/重生區`);
  }
  // 完整防禦層級（由主堡往外）：門牙塔 → 高地塔 → 內塔 → 外塔，距基地嚴格遞增
  for (const side of ["blue", "red"]) {
    const rank = (kind) => Math.min(...T.towers.filter((t) => t.side === side && t.kind === kind).map((t) => t.distToOwnBase));
    const nt = Math.min(...T.nexusTurrets.filter((t) => t.side === side).map((t) => t.distToOwnBase));
    ok(nt < rank("highground") && rank("highground") < rank("inner") && rank("inner") < rank("outer"),
      `${side} 防禦層級距基地應遞增：門牙 ${nt.toFixed(0)} < 高地 ${rank("highground").toFixed(0)} < 內 ${rank("inner").toFixed(0)} < 外 ${rank("outer").toFixed(0)}`);
  }
}

// I2) G.6 草叢 / Cover：存在、可讀團塊、低矮、不擋路、對稱、每象限都有
{
  const bushes = T.bushClusters;
  ok(bushes.length >= 10, `草叢 / cover 節點應 ≥10（使用者要求 10~16；實得 ${bushes.length}）`);
  // 每一叢必須是「團塊」（中央大叢 + 環繞小叢），不是一個點
  for (const c of bushes) {
    ok(Array.isArray(c.blobs) && c.blobs.length >= 4,
      `草叢 ${c.id} 應由 ≥4 顆低模叢組成（實得 ${c.blobs?.length}）`);
    ok(c.blobs.every((b) => Number.isFinite(b.dx) && Number.isFinite(b.dy) && Number.isFinite(b.r) && Number.isFinite(b.h)),
      `草叢 ${c.id} 的組件不應含 NaN`);
    ok(c.blobs.every((b) => b.h > 0), `草叢 ${c.id} 的叢應有正高度`);
  }
  // 草叢必須「矮」：最高的叢仍要明顯低於最矮的野怪（英雄/野怪一律高過草，才不擋視線）
  const maxBushH = Math.max(...bushes.flatMap((c) => c.blobs.map((b) => b.h)));
  const minMonTop = Math.min(...T.monsters.map((m) => m.top));
  ok(maxBushH < minMonTop, `草叢應低於最矮野怪（草最高 ${maxBushH.toFixed(1)} < 野怪最矮 ${minMonTop}）`);
  // 不擋路：草叢中心不得落在路面 / 出口通道 / 水面 / 基地平台
  const bushForbid = [
    ...["top", "mid", "bot"].map((ln) => layer(`lane_${ln}_surface`).poly),
    ...T.meta.exitCorridorPolys,
    ...["blue", "red"].map((s) => layer(`base_${s}_apron`).poly),
    ...T.meta.river.waterPolys,
  ];
  const onPath = bushes.filter((c) => bushForbid.some((poly) => pointInPoly(c.x, c.y, poly)));
  ok(onPath.length === 0, `草叢不得壓在路面/通道/水面/基地平台上（實得 ${onPath.length} 叢）`);
  // 每個 cluster 都要有地面投影暗斑（俯視讀得出團塊坐在地上）
  for (const c of bushes) {
    ok(layerIds.has(`bushshade_${c.id}`), `草叢 ${c.id} 應有地面投影暗斑`);
  }
  // 對稱：呈現用 cover 藍紅必須互為 180° 鏡射
  const presBlue = bushes.filter((c) => c.isPresentation && c.side === "blue");
  ok(presBlue.length >= 3, `呈現用 cover（藍方）應 ≥3（實得 ${presBlue.length}）`);
  for (const c of presBlue) {
    const key = c.id.slice("bush_blue_".length);
    const m = bushes.find((x) => x.id === `bush_red_${key}`);
    ok(m && Math.abs((220 - c.x) - m.x) < 0.01 && Math.abs((220 - c.y) - m.y) < 0.01,
      `呈現用 cover ${c.id} 的紅方鏡射應存在且對稱`);
  }
  // gameData 視野草叢：有模擬對照、且過濾後仍成對鏡射（不製造單邊視野差）
  const gd = bushes.filter((c) => !c.isPresentation);
  ok(gd.every((c) => Number.isFinite(c.sim?.x) && Number.isFinite(c.sim?.y)),
    "gameData 視野草叢應保留模擬座標對照");
  for (const c of gd) {
    const hasMirror = gd.some((x) => Math.abs((220 - c.x) - x.x) < 0.6 && Math.abs((220 - c.y) - x.y) < 0.6);
    ok(hasMirror, `gameData 草叢 (${c.x},${c.y}) 過濾後應仍有鏡射對稱`);
  }
  // 四個野區象限都要有 cover（＝路線網感，不是一半野區沒得埋伏）
  for (const q of L.quadrants) {
    const n = bushes.filter((c) => d2(c, q) < q.r * 2.1).length;
    ok(n >= 1, `野區象限 ${q.id} 應至少有 1 個草叢 cover（實得 ${n}）`);
  }
  // G.6 v2：使用者明列的戰術遮蔽節點類別，藍紅兩側都必須各有一叢
  //  （河道草 / 河口·坑口草 / 三角草 / Buff 營地草 / 小野營草）
  for (const cat of ["river", "pit_mouth", "tri", "buff", "small_camp"]) {
    for (const side of ["blue", "red"]) {
      const n = bushes.filter((c) => c.isPresentation && c.side === side && c.cat === cat).length;
      ok(n >= 1, `${side} 應有「${cat}」類戰術草叢（實得 ${n}）`);
    }
  }
  // 決定性：草叢兩次建構完全相同（F11 也會整份再驗一次，這裡先就地驗草叢）
  const Tbush = buildTerrainShapes(buildMobaLayout());
  ok(JSON.stringify(Tbush.bushClusters) === JSON.stringify(T.bushClusters),
    "bushClusters 必須是決定性的");
}

// I3) G.6 野區結構節點密度census：可讀的中小型結構（口袋/坑/路線結構/草叢）
{
  const js = T.jungleStructures ?? [];
  const nodes = T.camps.length            // 營地口袋（含呈現用）
    + 2                                    // 兩個坑（龍/巴龍）
    + js.length                            // G.6 v2：野區路線結構節點
    + T.bushClusters.length;               // 草叢 cover 節點
  ok(nodes >= 24, `野區可讀結構節點應 ≥24（使用者要求 24~32；實得 ${nodes}：營地 ${T.camps.length} + 坑 2 + 路線結構 ${js.length} + 草叢 ${T.bushClusters.length}）`);
  // 「結構」（不含草叢那類遮蔽）本身也要夠：營地 + 坑 + 路線結構 ≥ 24（＝使用者要的牆體/分隔/路線節點）
  const structNodes = T.camps.length + 2 + js.length;
  ok(structNodes >= 24, `野區牆體/分隔/路線結構節點應 ≥24（實得 ${structNodes}：營地 ${T.camps.length} + 坑 2 + 路線結構 ${js.length}）`);
}

// I5) G.6 v2 野區路線結構：逐象限補足、可讀中小型、不侵入主通道
{
  const js = T.jungleStructures ?? [];
  ok(js.length >= 12, `野區路線結構節點應 ≥12（使用者要求補足結構密度；實得 ${js.length}）`);
  // 逐象限都要有結構（不得某區過空），且每象限至少 2 個
  for (const q of L.quadrants) {
    const n = js.filter((s) => s.quadrant === q.id).length;
    ok(n >= 2, `野區象限 ${q.id} 應至少有 2 個路線結構（不得某區過空；實得 ${n}）`);
  }
  // 四種路線語言（分隔 / 切入口 / 河道鉤 / 營地牆）在全圖都要出現
  for (const role of ["divider", "lane_cut", "river_hook", "camp_wall"]) {
    ok(js.some((s) => s.role === role), `野區路線結構應含「${role}」語言`);
  }
  // 這些是可讀的「中小型」結構：每個 jungle_struct 牆段落在其象限附近（不亂漂）
  const jsWalls = T.wallItems.filter((w) => w.kind === "jungle_struct");
  ok(jsWalls.length >= 40, `野區路線結構應由足量短牆段組成（實得 ${jsWalls.length} 段）`);
  const jsAvg = jsWalls.reduce((m, w) => m + w.len, 0) / Math.max(1, jsWalls.length);
  ok(jsAvg < 5, `野區路線結構平均段長應 <5（短段才不像積木；實得 ${jsAvg.toFixed(2)}）`);
  // 不侵入主要 path corridor：路線結構牆不得落在路面 / 出口通道 / 水面 / 基地平台上
  const corridorForbid = [
    ...["top", "mid", "bot"].map((ln) => layer(`lane_${ln}_surface`).poly),
    ...T.meta.exitCorridorPolys,
    ...["blue", "red"].map((s) => layer(`base_${s}_apron`).poly),
    ...T.meta.river.waterPolys,
  ];
  const intrude = jsWalls.filter((w) => corridorForbid.some((poly) => pointInPoly(w.x, w.y, poly)));
  ok(intrude.length === 0, `野區路線結構不得侵入主通道/河/基地平台（實得 ${intrude.length} 段）`);
}

// I6) G.6 v2 連通性硬證明：新增結構後，野區主要動線仍全部連通（flood-fill）
//     使用者把「野區主要連通性不能被破壞」「牆不得擋路」列為 Critical。
//     這裡用粗網格 flood-fill 實證：從中路涉水點出發，必須走得到每個營地空地、
//     兩個坑、四個象限中心（＝牆有留出路，沒有把野區封成孤島）。
{
  const B = WORLD_BOUNDS, cell = 1.6;
  const nx = Math.ceil((B.maxX - B.minX) / cell) + 1;
  const ny = Math.ceil((B.maxY - B.minY) / cell) + 1;
  const gx = (x) => Math.round((x - B.minX) / cell);
  const gy = (y) => Math.round((y - B.minY) / cell);
  const idx = (ix, iy) => iy * nx + ix;
  const blocked = new Uint8Array(nx * ny);
  const arena = T.meta.arenaSmooth;
  // 競技場外＝不可走（避免 flood 漏到地圖外，讓「被牆圍死」真的判為不連通）
  for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
    const x = B.minX + ix * cell, y = B.minY + iy * cell;
    if (!pointInPoly(x, y, arena)) blocked[idx(ix, iy)] = 1;
  }
  // 把每一段牆體（所有 kind）標成障礙：以段中心沿其長度、加半厚度為半徑打點
  //  草叢是可穿越的視野遮蔽 ⇒ 不算障礙（本來就是拿來走進去躲的）。
  for (const w of T.wallItems) {
    const half = w.len / 2, ux = Math.sin(w.angle), uy = Math.cos(w.angle);
    const rad = w.thick / 2;
    const steps = Math.max(1, Math.ceil(w.len / cell));
    for (let s = 0; s <= steps; s++) {
      const t = -half + (w.len * s) / steps;
      const bx = w.x + ux * t, by = w.y + uy * t;
      const rc = Math.ceil(rad / cell);
      for (let dyc = -rc; dyc <= rc; dyc++) for (let dxc = -rc; dxc <= rc; dxc++) {
        if (Math.hypot(dxc * cell, dyc * cell) > rad) continue;
        const ix = gx(bx) + dxc, iy = gy(by) + dyc;
        if (ix >= 0 && iy >= 0 && ix < nx && iy < ny) blocked[idx(ix, iy)] = 1;
      }
    }
  }
  // flood-fill 從中路涉水點（地圖中心，永遠可走）
  const seedX = gx(B.centerX), seedY = gy(B.centerY);
  const seen = new Uint8Array(nx * ny);
  const stack = [[seedX, seedY]];
  const reachable = (x, y, maxR = 2) => {
    const ix = gx(x), iy = gy(y);
    // 允許在 maxR 格範圍內找到可走格（目標點本身可能剛好落在空地邊緣的障礙格；
    // 象限中心是「示意 overlay」的名目點，容差放寬）
    for (let r = 0; r <= maxR; r++) for (let dyc = -r; dyc <= r; dyc++) for (let dxc = -r; dxc <= r; dxc++) {
      const jx = ix + dxc, jy = iy + dyc;
      if (jx >= 0 && jy >= 0 && jx < nx && jy < ny && seen[idx(jx, jy)]) return true;
    }
    return false;
  };
  if (!blocked[idx(seedX, seedY)]) {
    seen[idx(seedX, seedY)] = 1;
    while (stack.length) {
      const [ix, iy] = stack.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const jx = ix + dx, jy = iy + dy;
        if (jx < 0 || jy < 0 || jx >= nx || jy >= ny) continue;
        const id = idx(jx, jy);
        if (seen[id] || blocked[id]) continue;
        seen[id] = 1; stack.push([jx, jy]);
      }
    }
  }
  ok(seen[idx(seedX, seedY)] === 1, "中路涉水點應可走（flood-fill 種子）");
  for (const c of T.camps) ok(reachable(c.x, c.y), `營地 ${c.id} 空地應與中路連通（不得被牆圍死）`);
  for (const k of ["dragon", "baron"]) ok(reachable(L.pits[k].x, L.pits[k].y), `${k} 坑應與中路連通`);
  for (const q of L.quadrants) ok(reachable(q.x, q.y, 5), `野區象限 ${q.id} 中心應與中路連通`);
}

// I4) G.6 野怪血條 / 名牌掛點（hpAnchor / labelAnchor / headroom）齊備且合理
for (const m of T.monsters) {
  ok(m.hpAnchor && Number.isFinite(m.hpAnchor.z) && m.hpAnchor.x === m.x && m.hpAnchor.y === m.y,
    `野怪 ${m.id} 應有 hpAnchor{x,y,z}`);
  ok(m.labelAnchor && Number.isFinite(m.labelAnchor.z) && m.labelAnchor.x === m.x && m.labelAnchor.y === m.y,
    `野怪 ${m.id} 應有 labelAnchor{x,y,z}`);
  ok(m.hpAnchor.z > m.top && m.labelAnchor.z >= m.hpAnchor.z,
    `野怪 ${m.id} 掛點高度應遞增：top ${m.top} < hp ${m.hpAnchor.z} ≤ label ${m.labelAnchor.z}`);
  ok(Math.abs(m.labelAnchor.z - m.headroom) < 1e-9, `野怪 ${m.id} 的 labelAnchor 應等於 headroom`);
}

// ══════════════════════════════════════════════════════════════════════════
//  Milestone G.7：英雄通行驗證 + 尺度校正 + 功能性牆鏈 / 草叢群組數
// ══════════════════════════════════════════════════════════════════════════

// J1) 英雄通行：所有必要路線可達，且主要路線最低淨寬符合規格（考慮碰撞半徑 1.2）
const PASS = buildPassability(L, T);
{
  ok(PASS.routes.length >= 24, `必要路線應 ≥24 條（實得 ${PASS.routes.length}）`);
  const unreachable = PASS.routes.filter((r) => !r.reachable);
  ok(unreachable.length === 0, `所有必要路線都必須英雄可達（不可達 ${unreachable.length}：${unreachable.map((r) => r.label).join("、")}）`);
  const narrow = PASS.routes.filter((r) => r.reachable && !r.meetsSpec);
  ok(narrow.length === 0, `所有必要路線淨寬須達規格（未達 ${narrow.length}：${narrow.map((r) => `${r.label} ${r.narrowest}<${r.minWidth}`).join("；")}）`);
  // 每條路線輸出四項齊備（可達 / 最窄淨寬 / 阻擋牆 / 長度）
  for (const r of PASS.routes) {
    ok(typeof r.reachable === "boolean" && Number.isFinite(r.narrowest) && Array.isArray(r.blockingChains) && Number.isFinite(r.length === Infinity ? 0 : r.length),
      `路線 ${r.id} 應輸出 reachable/narrowest/blockingChains/length`);
  }
  // 基地三出口全部可走（baseExit 類，≥8.0）
  for (const side of ["blue", "red"]) for (const ln of ["top", "mid", "bot"]) {
    const r = PASS.routes.find((x) => x.id === `${side}_base_${ln}`);
    ok(r && r.reachable && r.narrowest >= CORRIDOR_MIN.baseExit, `${side} 基地→${ln} 出口應可走且淨寬 ≥${CORRIDOR_MIN.baseExit}（實得 ${r?.narrowest}）`);
  }
  // 河口 / 坑口類路線 ≥7.0
  for (const r of PASS.routes.filter((x) => x.type === "riverMouth")) {
    ok(r.narrowest >= CORRIDOR_MIN.riverMouth, `${r.label} 河口淨寬應 ≥${CORRIDOR_MIN.riverMouth}（實得 ${r.narrowest}）`);
  }
  // 決定性：passability 兩次結果一致（不得有 Math.random / 時間相依）
  const P2 = buildPassability(buildMobaLayout(), buildTerrainShapes(buildMobaLayout()));
  const sig = (P) => P.routes.map((r) => `${r.id}:${r.reachable}:${r.narrowest}`).join("|");
  ok(sig(PASS) === sig(P2), "passability 必須是決定性的");
}

// J2) 每個重要營地至少兩個入口（不再只有單一細縫）
{
  for (const c of T.camps) {
    const ents = T.entrances.filter((e) => e.key === `junent_${c.id}`);
    ok(ents.length >= 2, `營地 ${c.id} 應至少有 2 個入口（實得 ${ents.length}）`);
  }
  // Dragon / Baron Pit 各至少兩個入口
  for (const k of ["dragon", "baron"]) {
    const ents = T.entrances.filter((e) => e.kind === "pit" && e.key.startsWith(`ent_${k}`));
    ok(ents.length >= 2, `${k} 坑應至少有 2 個入口（實得 ${ents.length}）`);
  }
}

// J3) 草叢不作為實體障礙（可穿越）：bushClusters 不得混進 wallItems
{
  ok(T.wallItems.every((w) => w.kind !== "bush"), "草叢不得成為量體障礙（wallItems 不應含 bush kind）");
  const bushIds = new Set(T.bushClusters.map((c) => c.id));
  ok(T.wallItems.every((w) => !bushIds.has(w.struct)), "草叢 id 不應出現在任何牆段");
}

// J4) 功能性牆鏈數在 30~40（G.8 提高上限；不以渲染小段數量為品質指標）
{
  const chains = 8 /* gameData 8 牆鏈 */ + T.jungleStructures.length + T.camps.length + 2 /* 兩坑 */;
  ok(chains >= 30 && chains <= 40, `功能性牆鏈應在 30~40（實得 ${chains}：gameData 8 + 路線結構 ${T.jungleStructures.length} + 營地 ${T.camps.length} + 坑 2）`);
}

// J5) 草叢群組數在 20~28（G.8 提高）
ok(T.bushClusters.length >= 20 && T.bushClusters.length <= 28, `草叢群組應在 20~28（實得 ${T.bushClusters.length}）`);

// J6) 牆鏈不得互相穿插：任兩個營地口袋的中心淨距須 > 兩者空地半徑和（不重疊）
{
  let overlap = 0;
  for (let i = 0; i < T.camps.length; i++) for (let j = i + 1; j < T.camps.length; j++) {
    const a = T.camps[i], b = T.camps[j];
    if (d2(a, b) < (a.clearR + b.clearR)) overlap++;
  }
  ok(overlap === 0, `營地口袋不得互相重疊穿插（重疊 ${overlap} 對）`);
}

// J7) 野怪不得壓住營地出口：怪的佔地半徑須放得進空地，且中心貼營地中心（不在入口縫上）
for (const c of T.camps) {
  const mon = T.monsters.find((m) => m.id === `mon_${c.id}`);
  if (!mon) continue;
  ok(Math.hypot(mon.x - c.x, mon.y - c.y) < 1e-6, `野怪 ${mon.id} 應站在營地中心（不擋入口）`);
  ok(monsterReach(mon) <= c.clearR + 0.5, `野怪 ${mon.id} 佔地半徑 ${monsterReach(mon).toFixed(1)} 應放得進空地 ${c.clearR}`);
}

// J8) 尺度校正：塔 / 野怪 / 牆體比例符合新上限
{
  // 塔前廣場（最大＝高地塔）比 G.3 更小；塔前廣場直徑 ≤ 地圖寬度 8%（G.3 為 9%）
  ok(TOWER_SPEC.highground.plazaR <= 8.2, `高地塔塔前廣場應 ≤8.2（G.7 縮小；實得 ${TOWER_SPEC.highground.plazaR}）`);
  ok(TOWER_SPEC.highground.padR <= 5.6, `高地塔底座應 ≤5.6（實得 ${TOWER_SPEC.highground.padR}）`);
  // 野怪比例：一般 0.85、Buff 0.92、史詩 0.95；且史詩塞得進坑、不遮加寬後的坑口
  ok(MONSTER_SIZE_K.camp <= 0.85 && MONSTER_SIZE_K.buff <= 0.92 && MONSTER_SIZE_K.epic <= 0.95, "野怪縮放係數應符合 G.7 上限");
  const drake = T.monsters.find((m) => m.id === "mon_dragon"), baron = T.monsters.find((m) => m.id === "mon_baron");
  ok(monsterReach(drake) < 17, `小龍佔地半徑 ${monsterReach(drake).toFixed(1)} 須塞進龍坑(R17)`);
  ok(monsterReach(baron) < 14, `巴龍佔地半徑 ${monsterReach(baron).toFixed(1)} 須塞進巴龍坑(R14)`);
  // 一般野怪都要明顯縮小過（reach 不超過空地）
  for (const m of T.monsters.filter((x) => x.kind === "camp")) {
    const c = T.camps.find((cc) => `mon_${cc.id}` === m.id);
    ok(monsterReach(m) <= c.clearR + 0.5, `一般野怪 ${m.id} 佔地 ${monsterReach(m).toFixed(1)} 應 ≤ 空地 ${c.clearR}`);
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  Milestone G.8：恢復大型野怪 3D 實體 + 野區路線重設
// ══════════════════════════════════════════════════════════════════════════
const partCount = (m) => m.members.reduce((s, mem) => s + mem.parts.length, 0);

// K1) 大型野怪必須是可辨識 3D 生物（不是 marker / 點 / 晶體）：組件數達標
{
  const drake = T.monsters.find((m) => m.id === "mon_dragon");
  const baron = T.monsters.find((m) => m.id === "mon_baron");
  ok(partCount(drake) >= 10, `小龍應是 3D 生物、組件數 ≥10（實得 ${partCount(drake)}）`);
  ok(partCount(baron) >= 10, `巴龍應是 3D 生物、組件數 ≥10（實得 ${partCount(baron)}）`);
  // Dragon / Baron 必須同時有貼地肢體與高處部位（＝立體，不是一片扁的）
  for (const [nm, m] of [["小龍", drake], ["巴龍", baron]]) {
    const zs = m.members.flatMap((mem) => mem.parts.map((p) => p.z));
    ok(Math.min(...zs) < 3 && Math.max(...zs) > 6, `${nm} 應同時有貼地與高處部位（z ${Math.min(...zs).toFixed(1)}~${Math.max(...zs).toFixed(1)}）`);
  }
  // Baron 明顯高於 Dragon（史詩層級）
  ok(baron.top > drake.top * 1.3, `巴龍應明顯高於小龍（巴龍 ${baron.top.toFixed(1)} > 小龍 ${drake.top.toFixed(1)}×1.3）`);
}

// K2) Buff 必須是大型野怪實體（組件 ≥8）、且不在兵線/中路上、距中路 ≥8
{
  const midLane = layer("lane_mid_surface").poly;
  for (const bf of T.camps.filter((c) => c.type === "buff")) {
    const mon = T.monsters.find((m) => m.id === `mon_${bf.id}`);
    ok(partCount(mon) >= 8, `${bf.label} 應是大型實體、組件 ≥8（實得 ${partCount(mon)}）`);
    // 距三路中心線 ≥8（實際上 mapCampLayout 已保證 ≥18）
    const dLane = Math.min(...["top", "mid", "bot"].flatMap((ln) => L.lanes[ln].map((p) => d2(bf, p))));
    ok(dLane >= 8, `${bf.label} 距最近兵線應 ≥8（實得 ${dLane.toFixed(1)}）`);
    ok(!pointInPoly(bf.x, bf.y, midLane), `${bf.label} 不得站在中路路面上`);
  }
}

// K3) 每個一般營地：pack 型（狼/石甲蟲/鳥）至少 2 個個體；每組都有 3D 實體（組件 ≥8）
for (const c of T.camps) {
  const mon = T.monsters.find((m) => m.id === `mon_${c.id}`);
  ok(partCount(mon) >= 8, `營地 ${c.id}（${c.label}）應有 3D 實體、組件 ≥8（實得 ${partCount(mon)}）`);
  if (["wolves", "krug", "raptors"].includes(mon.archetype)) {
    ok(mon.members.length >= 2, `${c.label} 應是一群（成員 ≥2；實得 ${mon.members.length}）`);
  }
}

// K4) 英雄可繞每個野怪「半圈以上」：在怪周圍取樣一圈，可走取樣點須 >50%
{
  const F = PASS.field;
  const walkable = (x, y) => {
    const ix = F.gx(x), iy = F.gy(y);
    if (ix < 0 || iy < 0 || ix >= F.nx || iy >= F.ny) return false;
    return F.dist[F.idx(ix, iy)] * F.cellToSim >= HERO_RADIUS;
  };
  for (const c of T.camps) {
    const mon = T.monsters.find((m) => m.id === `mon_${c.id}`);
    const rr = monsterReach(mon) + HERO_RADIUS + 0.6;
    let okN = 0; const N = 24;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      if (walkable(c.x + Math.cos(a) * rr, c.y + Math.sin(a) * rr)) okN++;
    }
    ok(okN >= N * 0.5, `營地 ${c.id} 英雄應可繞野怪半圈以上（可走 ${okN}/${N}）`);
  }
}

// K5) 牆體不得生成在河道中央（河水核心）。
//  例外：坑口（Dragon/Baron pit mouth）的 pit_wall / entrance_taper——坑口本來就是
//  「河水伸進坑口」的地形，坑壁站在坑口水緣是正確結構，不是「堵住河道」。
//  ⇒ 只抓「離兩坑都遠」卻落在河水裡的牆（＝真的長在河道中央的牆）。
{
  const waterCore = T.meta.river.waterPolys;
  const nearPit = (w) => Math.min(d2(w, L.pits.dragon), d2(w, L.pits.baron)) < 22;
  const inWater = T.wallItems.filter((w) => w.kind !== "river_stone" && !nearPit(w))
    .filter((w) => waterCore.some((poly) => pointInPoly(w.x, w.y, poly)));
  ok(inWater.length === 0, `牆體不得生成在河道中央（離坑口遠仍落在河水的牆；實得 ${inWater.length} 段）`);
}

// K6) 中路兩座外塔之間要能容納交戰（2 英雄 + 6 小兵 + 1 技能提示）：中心距 ≥30
{
  const midOuter = T.towers.filter((t) => t.lane === "mid" && t.kind === "outer");
  ok(midOuter.length === 2, `中路應有 2 座外塔（實得 ${midOuter.length}）`);
  const gap = d2(midOuter[0], midOuter[1]);
  ok(gap >= 30, `中路兩外塔中心距應 ≥30（容納 2 英雄+6 小兵+技能；實得 ${gap.toFixed(1)}）`);
}

// K7) 每側野區完整性：每個象限至少 1 Buff 或 2 小營、≥1 草叢、≥2 路線結構
for (const q of L.quadrants) {
  const camps = T.camps.filter((c) => d2(c, q) < q.r * 2.05);
  const bushes = T.bushClusters.filter((c) => d2(c, q) < q.r * 2.1);
  const structs = T.jungleStructures.filter((s) => s.quadrant === q.id);
  ok(camps.length >= 1, `象限 ${q.id} 應至少有 1 個營地（實得 ${camps.length}）`);
  ok(bushes.length >= 2, `象限 ${q.id} 應至少有 2 段草叢遮蔽（實得 ${bushes.length}）`);
  ok(structs.length >= 2, `象限 ${q.id} 應至少有 2 個路線結構（實得 ${structs.length}）`);
}

// ══════════════════════════════════════════════════════════════════════════
//  Milestone G.9：有機野怪 body 不為 null + 圓弧形體 + 草叢上下半 + 石板地
// ══════════════════════════════════════════════════════════════════════════

// K8) 大型怪物 body 合併不可為 null（＝G.7 那種「只剩點/晶體」的回歸）。
//  直接用 three 複刻 renderer 的合併：混合 indexed/non-indexed 會回傳 null。
{
  const Sm = WORLD_SCALE;
  const ACC = new Set([MONSTER_COLOR.blue_crystal, MONSTER_COLOR.red_ember, MONSTER_COLOR.camp_accent, MONSTER_COLOR.dragon_accent, MONSTER_COLOR.baron_accent]);
  const partGeo = (p) => {
    let g;
    if (p.shape === "box") g = new THREE.BoxGeometry(p.d * Sm, p.h, p.w * Sm);
    else if (p.shape === "cyl") g = new THREE.CylinderGeometry(p.rTop * Sm, p.rBot * Sm, p.h, p.seg ?? 9);
    else if (p.shape === "cone") g = new THREE.ConeGeometry(p.r * Sm, p.h, p.seg ?? 8);
    else if (p.shape === "sph") g = new THREE.SphereGeometry(1, 9, 6).scale(p.rx * Sm, p.ry, p.rz * Sm);
    else if (p.shape === "cap") g = new THREE.CapsuleGeometry(p.r * Sm, p.len, 2, 8);
    else if (p.shape === "ico") g = new THREE.IcosahedronGeometry(p.r * Sm, 0);
    else g = new THREE.OctahedronGeometry(p.r * Sm, 0);
    if (g.index) g = g.toNonIndexed();
    const n = g.attributes.position.count;
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    return g;
  };
  for (const m of T.monsters) {
    const body = [], acc = [];
    for (const mem of m.members) for (const p of mem.parts) (ACC.has(p.color) ? acc : body).push(partGeo(p));
    const merged = body.length ? mergeGeometries(body, false) : null;
    ok(merged !== null && merged.attributes.position.count > 0,
      `野怪 ${m.id} 的 body 合併不可為 null（不得退回點/晶體）`);
    const mAcc = acc.length ? mergeGeometries(acc, false) : null;
    ok(acc.length === 0 || (mAcc !== null && mAcc.attributes.position.count > 0),
      `野怪 ${m.id} 的 accent 合併不可為 null`);
  }
}

// K9) 有機形體：每隻野怪都要有圓弧組件（sph/cap）⇒ 不是純方塊/錐堆；大型怪要有橢球身體
{
  for (const m of T.monsters) {
    const rounded = m.members.flatMap((mm) => mm.parts).filter((p) => p.shape === "sph" || p.shape === "cap").length;
    ok(rounded >= 3, `野怪 ${m.id} 應有圓弧組件（sph/cap ≥3；實得 ${rounded}）`);
  }
  for (const id of ["mon_dragon", "mon_baron", "mon_camp_blue_buff", "mon_camp_red_buff"]) {
    const m = T.monsters.find((x) => x.id === id);
    ok(m.members.some((mm) => mm.parts.some((p) => p.shape === "sph")), `${id} 應有橢球身體（sph）`);
  }
}

// K10) 草叢上/下半各 ≥10（上下半野區都要有掩體）
{
  const b = T.bushClusters;
  const top = b.filter((c) => c.y < 110).length, bot = b.filter((c) => c.y >= 110).length;
  ok(top >= 10, `上半野區草叢應 ≥10（實得 ${top}）`);
  ok(bot >= 10, `下半野區草叢應 ≥10（實得 ${bot}）`);
}

// K11) 基地石板地：主堡區要有石板地磚分層（不是一整塊隊色）
for (const side of ["blue", "red"]) {
  const slabs = T.groundLayers.filter((g) => g.id.startsWith(`slab_${side}_`)).length;
  ok(slabs >= 20, `${side} 主堡區應有石板地磚分層（實得 ${slabs} 塊）`);
}

// ══════════════════════════════════════════════════════════════════════════
//  Milestone G.10：野區 Porosity（孔隙率 / 開放度 / 流動性）——不只驗 31 條路線
// ══════════════════════════════════════════════════════════════════════════
// K12) 岩體連通群分析 + 封閉營地 + 野區開放度
let POROSITY = null;
{
  const W = T.wallItems.filter((w) => w.kind === "rock" || w.kind === "jungle_struct");
  const ends = (w) => { const ux = Math.sin(w.angle), uy = Math.cos(w.angle), h = w.len / 2; return [{ x: w.x - ux * h, y: w.y - uy * h }, { x: w.x + ux * h, y: w.y + uy * h }]; };
  const ptSeg = (p, q, r) => { const vx = r.x - q.x, vy = r.y - q.y, l2 = vx * vx + vy * vy; let t = l2 ? ((p.x - q.x) * vx + (p.y - q.y) * vy) / l2 : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(p.x - (q.x + t * vx), p.y - (q.y + t * vy)); };
  const segDist = (a, b) => { const [a1, a2] = ends(a), [b1, b2] = ends(b); return Math.min(ptSeg(a1, b1, b2), ptSeg(a2, b1, b2), ptSeg(b1, a1, a2), ptSeg(b2, a1, a2)); };
  const par = W.map((_, i) => i); const find = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  const GAP = 3.2, CELL = 8, grid = new Map();
  const gk = (x, y) => `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`;
  W.forEach((w, i) => { for (const p of [...ends(w), w]) { const k = gk(p.x, p.y); (grid.get(k) || grid.set(k, []).get(k)).push(i); } });
  W.forEach((w, i) => { const cells = new Set(); for (const p of [...ends(w), w]) { const gx = Math.floor(p.x / CELL), gy = Math.floor(p.y / CELL); for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) cells.add(`${gx + dx},${gy + dy}`); } for (const c of cells) for (const j of (grid.get(c) || [])) { if (j <= i) continue; if (segDist(w, W[j]) < GAP) par[find(i)] = find(j); } });
  const cm = new Map(); W.forEach((w, i) => { const r = find(i); (cm.get(r) || cm.set(r, []).get(r)).push(i); });
  const cl = [...cm.values()].map((idxs) => { const segs = idxs.map((i) => W[i]); const xs = segs.flatMap((w) => ends(w).map((e) => e.x)), ys = segs.flatMap((w) => ends(w).map((e) => e.y)); return { n: segs.length, bbox: Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)), cy: segs.reduce((s, w) => s + w.y, 0) / segs.length }; });
  const largest = Math.max(...cl.map((c) => c.n)), largestBbox = Math.max(...cl.map((c) => c.bbox));
  const upper = cl.filter((c) => c.cy < 110).length, lower = cl.filter((c) => c.cy >= 110).length;
  //  G.11：牆改回「連續但短段的彎岩壁」⇒ 允許 reference 長度的曲牆（bbox≤34），但仍嚴禁
  //  G.9 那種 bbox 40+ 的迷宮巨牆；連通群數維持在「多而分離」。
  ok(cl.length >= 18, `野區應由多段分離的短彎岩壁構成（連通群 ≥18；實得 ${cl.length}）`);
  ok(largest <= 24, `不得有巨型連通牆（最大連通群 ≤24 段；實得 ${largest}）`);
  ok(largestBbox <= 34, `不得有巨型連通牆（最大連通群 bbox ≤34；實得 ${largestBbox.toFixed(0)}）`);
  ok(upper >= 7 && lower >= 7, `上/下半野區都要有足夠分離岩壁（上 ${upper} / 下 ${lower}，各 ≥7）`);
  // sealed camp：營地被岩體包成封閉環（>70% 方位被擋 ⇒ 封死）
  let sealed = 0;
  for (const c of T.camps) {
    const R = c.clearR + 4; let blocked = 0; const N = 24;
    for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2, px = c.x + Math.cos(a) * R, py = c.y + Math.sin(a) * R; if (W.some((w) => Math.hypot(w.x - px, w.y - py) < w.thick / 2 + 2.5)) blocked++; }
    if (blocked / N > 0.7) sealed++;
  }
  ok(sealed === 0, `不得有被岩體封死的營地（sealed_camp_count = ${sealed}，目標 0）`);
  // 野區開放度：用 passability 距離場，量各象限「英雄站得下（clearance≥半徑）」的比例
  const F = PASS.field;
  const openness = (half) => {
    let open = 0, tot = 0;
    for (const q of L.quadrants.filter((qq) => (half === "up" ? qq.y < 110 : qq.y >= 110))) {
      const step = 2;
      for (let x = q.x - q.r * 1.6; x <= q.x + q.r * 1.6; x += step) for (let y = q.y - q.r * 1.6; y <= q.y + q.r * 1.6; y += step) {
        if (Math.hypot(x - q.x, y - q.y) > q.r * 1.6) continue;
        const ix = F.gx(x), iy = F.gy(y); if (ix < 0 || iy < 0 || ix >= F.nx || iy >= F.ny) continue;
        tot++; if (F.dist[F.idx(ix, iy)] * F.cellToSim >= HERO_RADIUS) open++;
      }
    }
    return tot ? open / tot : 0;
  };
  const upPor = openness("up"), loPor = openness("down");
  ok(upPor >= 0.5, `上半野區開放度應 ≥0.5（實得 ${upPor.toFixed(2)}）`);
  ok(loPor >= 0.5, `下半野區開放度應 ≥0.5（實得 ${loPor.toFixed(2)}）`);
  POROSITY = { wall_cluster_count: cl.length, largest_cluster_size: largest, largest_cluster_bbox: +largestBbox.toFixed(0), upper_clusters: upper, lower_clusters: lower, sealed_camp_count: sealed, upper_jungle_porosity: +upPor.toFixed(2), lower_jungle_porosity: +loPor.toFixed(2) };
}

// K14) G.12 基地鏡射對稱：紅方 = 藍方 180° 鏡射（中心 110,110），誤差極小
{
  const BS = T.meta.bases, mp = (p) => ({ x: 220 - p.x, y: 220 - p.y });
  const close = (a, b, tol = 0.02) => Math.hypot(a.x - b.x, a.y - b.y) < tol;
  ok(close(mp(BS.blue.center), BS.red.center), "主堡平台中心應鏡射對稱");
  ok(close(mp(BS.blue.fountain), BS.red.fountain), "泉水應鏡射對稱");
  ok(BS.blue.apronPoly.length === BS.red.apronPoly.length &&
    BS.blue.apronPoly.every((p, i) => close(mp(p), BS.red.apronPoly[i])), "高地平台外型應鏡射對稱");
  ok(BS.blue.rimRuns.length === BS.red.rimRuns.length, "高地外牆段數兩方應一致");
  ok(BS.blue.keepRuns.length === BS.red.keepRuns.length, "主堡內牆段數兩方應一致");
  ok(BS.blue.exitCorridors.length === 3 && BS.red.exitCorridors.length === 3, "雙方各 3 出口通道");
  //  ⚠ 出口通道陣列在鏡射時 top↔bot 反轉（180° 把上路映到下路）⇒ 紅[i] = 鏡射(藍[2−i])。
  ok(BS.blue.exitCorridors.every((c, i) => c.poly.every((p, j) => close(mp(p), BS.red.exitCorridors[2 - i].poly[j]))), "三出口通道應鏡射對稱（top↔bot 反轉）");
  // 門牙塔：藍方每座都要有紅方鏡射
  for (const t of T.nexusTurrets.filter((x) => x.side === "blue")) {
    ok(T.nexusTurrets.some((x) => x.side === "red" && close(mp(t), x, 0.6)), `門牙塔 (${t.x.toFixed(0)},${t.y.toFixed(0)}) 應有紅方鏡射對稱`);
  }
}

// K13) 每半邊野區主要穿梭路線 ≥6（不只驗固定 31 條，驗「半邊野區好不好穿梭」）
{
  const mid = (r) => ({ x: (r.from.x + r.to.x) / 2, y: (r.from.y + r.to.y) / 2 });
  const shuttles = PASS.routes.filter((r) => r.reachable && ["campLink", "jungleMain", "riverMouth"].includes(r.type));
  const up = shuttles.filter((r) => mid(r).y < 110).length, lo = shuttles.filter((r) => mid(r).y >= 110).length;
  ok(up >= 6, `上半野區主要穿梭路線應 ≥6（實得 ${up}）`);
  ok(lo >= 6, `下半野區主要穿梭路線應 ≥6（實得 ${lo}）`);
  if (POROSITY) { POROSITY.upper_shuttle_routes = up; POROSITY.lower_shuttle_routes = lo; }
}

// K15) 營地入口「實際可走」（不是只有節點）＋ 純視覺物件不參與碰撞
{
  const F = PASS.field;
  const walkable = (x, y) => { const ix = F.gx(x), iy = F.gy(y); return ix >= 0 && iy >= 0 && ix < F.nx && iy < F.ny && F.dist[F.idx(ix, iy)] * F.cellToSim >= HERO_RADIUS; };
  //  入口節點是名目標記；只要該方向附近（半徑 3.5）有可走格，就算「該方向可進出」。
  const openDir = (x, y) => { for (let d = 0; d <= 3.5; d += 1.5) for (let a = 0; a < 8; a++) { const ang = a / 8 * Math.PI * 2; if (walkable(x + Math.cos(ang) * d, y + Math.sin(ang) * d)) return true; } return false; };
  for (const c of T.camps) {
    const ents = T.entrances.filter((e) => e.key === `junent_${c.id}`);
    const openEnts = ents.filter((e) => openDir(e.x, e.y)).length;
    ok(openEnts >= 2, `營地 ${c.id} 應至少 2 個「肉眼可見且可走」的入口（實得 ${openEnts}/${ents.length}）`);
  }
  // 純視覺：草叢不得出現在碰撞 wallItems；裝飾石為獨立視覺層（passability 只吃 wallItems）
  const bushIds = new Set(T.bushClusters.map((c) => c.id));
  ok(T.wallItems.every((w) => w.kind !== "bush" && !bushIds.has(w.struct)), "草叢（純視覺）不得參與碰撞");
  ok(Array.isArray(T.rocks) && T.rocks.every((r) => Number.isFinite(r.x)), "裝飾石為獨立視覺層、不進 wallItems");
}

// ══════════════════════════════════════════════════════════════════════════
//  Milestone G.14：Base Symmetry & High Ground Layout Pass
//
//  這一章把「兩方基地是不是真的一模一樣」從零散斷言升級成硬證明。判準集中在
//  src/battle/moba/map/mapBaseSymmetry.js，debug 面板用的是同一份，避免
//  「verifier 綠、畫面歪」。三組報告：鏡射差異 / 閱讀層級 / 出口可走淨寬。
// ══════════════════════════════════════════════════════════════════════════
{
  const SYM = buildBaseSymmetryReport(L, T);
  const HIER = buildBaseHierarchyReport(L, T);
  const EXIT = buildBaseExitReport(L, T, PASS.field);

  // L1) 逐項鏡射差異：任何一項超過容差都要指名是哪一項、差多少
  for (const c of SYM.checks) {
    ok(c.ok, `G.14 基地鏡射「${c.label}」未對稱（誤差 ${c.err}${c.detail ? `；${c.detail}` : ""}）`);
  }
  ok(SYM.ok, `G.14 藍紅基地應嚴格 180° 鏡射（最大誤差 ${SYM.maxErr}）`);

  // L2) 牆段數硬條件：紅方不得比藍方多一塊（G.13 實測 base_rim 藍 25 / 紅 26）
  for (const kind of ["base_rim", "base_keep", "base_gate", "fountain_rim"]) {
    const all = T.wallItems.filter((w) => w.kind === kind);
    const bn = all.filter((w) => d2(w, L.bases.blue) < d2(w, L.bases.red)).length;
    ok(bn * 2 === all.length, `G.14 ${kind} 兩方段數應相同（藍 ${bn} / 共 ${all.length}）`);
  }

  // L3) 門牙塔每方 2 座、高地塔每方 3 座（使用者指名的數量條件）
  for (const side of ["blue", "red"]) {
    ok(T.nexusTurrets.filter((t) => t.side === side).length === 2, `G.14 ${side} 門牙塔應為 2 座`);
    ok(T.towers.filter((t) => t.side === side && t.kind === "highground").length === 3,
      `G.14 ${side} 高地塔應為 3 座`);
    // 三座高地塔必須一路一座（對應上/中/下三個出口），不得兩座擠同一路
    const lanes = T.towers.filter((t) => t.side === side && t.kind === "highground").map((t) => t.lane).sort();
    ok(lanes.join(",") === "bot,mid,top", `G.14 ${side} 三座高地塔應分屬上/中/下三路（實得 ${lanes.join("/")}）`);
  }

  // L4) 主堡 / 泉水 / 門牙塔 / 高地塔 的位置順序與層級距離
  for (const side of ["blue", "red"]) {
    for (const c of HIER.sides[side].checks) {
      ok(c.ok, `G.14 ${side} 基地層級「${c.label}」不成立`);
    }
  }
  ok(HIER.ok, "G.14 兩方主堡區的閱讀層級都應成立");

  // L5) 三路出口可走寬度：沿「主堡→城門→高地塔」中心線實測最窄淨寬
  //     ⚠ 這比 buildPassability 的 baseExit 路線更嚴：那條允許繞路，
  //       出口被堵死時仍可能從別的方向繞出去而判綠。
  for (const e of EXIT.exits) {
    ok(e.heroOk, `G.14 ${e.id} 出口中心線應讓英雄（半徑 ${HERO_RADIUS}）通過（最窄淨距 ${e.minClear}）`);
    ok(e.ok, `G.14 ${e.id} 出口可走淨寬應 ≥${EXIT_MIN_WIDTH}（實得 ${e.width}）`);
  }
  ok(EXIT.exits.length === 6, `G.14 雙方應各有 3 條出口（實得 ${EXIT.exits.length}）`);
  //  兩方對應出口的淨寬必須一模一樣（寬度不對稱＝一方比較好出門）。
  //  ⚠ 180° 鏡射把上路映到下路 ⇒ 要比的是「藍 top ↔ 紅 bot」，拿同名 lane 互比會誤判。
  for (const lane of ["top", "mid", "bot"]) {
    const b = EXIT.exits.find((e) => e.side === "blue" && e.lane === lane);
    const r = EXIT.exits.find((e) => e.side === "red" && e.lane === MIRROR_LANE[lane]);
    ok(Math.abs(b.width - r.width) < 0.5,
      `G.14 出口淨寬應鏡射相同（藍 ${lane} ${b.width} / 紅 ${MIRROR_LANE[lane]} ${r.width}）`);
  }

  // L6) 基地出口不被牆體堵住：城牆缺口必須真的落在出口通道上。
  //     量**出口通道中心線**（主堡 → 內庭轉折點 → 城門 → 高地塔，blueprint 自帶的
  //     `line`，也就是坡道與淨空通道用的同一條）與任何基地牆段（含長度，不只中心點）
  //     的最短距離，必須 > 英雄半徑（否則牆已經站在出口正中央）。
  //     ⚠ G.15-fix4 起不能再用「主堡→高地塔」直線：三個城門改成等角配置（三方向共用
  //       同一份牆體模組的前提），門心與那條直線最多差 4.7 單位，沿直線量會量到門柱側面。
  {
    const baseWalls = T.wallItems.filter((w) => ["base_rim", "base_keep", "base_gate"].includes(w.kind));
    //  點到牆段（有長有厚的長方體，近似成膠囊）的淨距
    const wallClear = (p, w) => {
      const ux = Math.sin(w.angle), uy = Math.cos(w.angle), h = w.len / 2;
      let t = (p.x - w.x) * ux + (p.y - w.y) * uy;
      t = Math.max(-h, Math.min(h, t));
      return Math.hypot(p.x - (w.x + ux * t), p.y - (w.y + uy * t)) - w.thick / 2;
    };
    for (const side of ["blue", "red"]) {
      for (const lane of ["top", "mid", "bot"]) {
        const line = baseExitLine(T, side, lane);
        let near = Infinity;
        for (let s = 0; s + 1 < line.length; s++) {
          const a = line[s], c = line[s + 1];
          const n = Math.max(2, Math.ceil(d2(a, c) / 1.0));
          for (let i = 0; i <= n; i++) {
            const p = { x: a.x + (c.x - a.x) * (i / n), y: a.y + (c.y - a.y) * (i / n) };
            for (const w of baseWalls) near = Math.min(near, wallClear(p, w));
          }
        }
        ok(near > HERO_RADIUS,
          `G.14 ${side} ${lane} 出口通道中心線不應被基地牆堵住（最近牆面 ${near.toFixed(2)}，要求 >${HERO_RADIUS}）`);
      }
    }
  }

  // L7) 高地牆體要讀成「短段、連續、有弧度的低牆」，不是隨機大石塊
  {
    for (const kind of ["base_rim", "base_keep"]) {
      const ws = T.wallItems.filter((w) => w.kind === kind);
      const avgLen = ws.reduce((s, w) => s + w.len, 0) / ws.length;
      const maxLen = Math.max(...ws.map((w) => w.len));
      ok(avgLen <= 4.5, `G.14 ${kind} 應是短段（平均段長 ${avgLen.toFixed(2)} ≤4.5）`);
      ok(maxLen <= 7, `G.14 ${kind} 不應出現大型牆塊（最長段 ${maxLen.toFixed(2)} ≤7）`);
      // 高低起伏收斂 ⇒ 牆頂連續，不是一顆顆石頭
      const hs = ws.map((w) => w.h);
      ok(Math.max(...hs) - Math.min(...hs) <= 1.6,
        `G.14 ${kind} 牆頂高度應連續（高低差 ${(Math.max(...hs) - Math.min(...hs)).toFixed(2)} ≤1.6）`);
    }
    ok(HEIGHT.base_rim <= 9.5, `G.14 高地外牆應是低牆（${HEIGHT.base_rim} ≤9.5）`);
    ok(HEIGHT.base_gate > HEIGHT.base_rim && HEIGHT.base_rim > HEIGHT.base_keep,
      "G.14 牆高層級仍應為 城門墩 > 高地外牆 > 主堡內牆");
  }

  // L8) 基地地表不得再有大片隊色 UI 色塊：平台 / 內庭 / 主堡台一律中性石材
  {
    const chroma = (hex) => { const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b2 = hex & 255; return Math.max(r, g, b2) - Math.min(r, g, b2); };
    for (const key of ["base_apron", "base_apron_top", "base_court", "base_slab", "base_slab_alt"]) {
      ok(PALETTE[key] !== undefined, `G.14 調色盤應有中性基地色 ${key}`);
      ok(chroma(PALETTE[key]) <= 16, `G.14 基地地表色 ${key} 應接近中性灰（彩度 ${chroma(PALETTE[key])} ≤16）`);
    }
    ok(PALETTE.high_blue === undefined && PALETTE.high_red === undefined,
      "G.14 舊的隊色平台色 high_blue / high_red 應已移除");
    // 隊色仍必須留在主堡晶體 / 泉水（＝分辨敵我的唯一來源）
    ok(chroma(PALETTE.nexus_blue) > 100 && chroma(PALETTE.nexus_red) > 100, "G.14 主堡晶體仍應是鮮明隊色");
    ok(PALETTE.fountain_water_blue !== PALETTE.fountain_water_red, "G.14 兩方泉水水色仍應可分辨");
    for (const side of ["blue", "red"]) {
      const meta = T.meta.nexus.find((n) => n.side === side);
      ok(meta.color === (side === "blue" ? PALETTE.nexus_blue : PALETTE.nexus_red), `G.14 ${side} 主堡晶體應用隊色`);
      ok(meta.platformColor === PALETTE.base_apron, `G.14 ${side} 平台量體應用中性石材色`);
    }
  }

  // L9) 決定性：報告本身兩次結果一致
  {
    const T3 = buildTerrainShapes(buildMobaLayout());
    const S3 = buildBaseSymmetryReport(buildMobaLayout(), T3);
    ok(JSON.stringify(S3.checks) === JSON.stringify(SYM.checks), "G.14 基地鏡射報告必須是決定性的");
  }

  G14 = { SYM, HIER, EXIT };
}

// ══════════════════════════════════════════════════════════════════════════
//  Milestone G.14-fix：Base Visual Symmetry Hard Fix
//
//  【G.14 為什麼「驗證器綠、畫面歪」】上一輪的鏡射檢查是**列舉式**的：手寫一份
//   id 前綴清單（base/slab/fountain/ramp/highland）＋4 種基地牆，逐項比對座標。
//   清單沒列到的東西一律不驗 —— 塔前廣場 plaza_ 就在清單外，而它是 blobRing，
//   外形不是旋轉對稱的，兩方各畫一次就長得不一樣（實測佔基地畫面不對稱 16.8%）。
//   結論：**座標對稱 ≠ 畫面對稱，列舉式檢查永遠會漏掉沒想到的東西。**
//
//  【本輪怎麼擋】改成「把畫面畫出來再比」：把基地結構件光柵化，取藍方視窗與
//   「同一視窗繞地圖中心 180° 取樣」的結果逐像素比對。這條不需要事先知道有哪些
//   物件，任何人新增一個不對稱的基地物件都會被抓到。
// ══════════════════════════════════════════════════════════════════════════
{
  // M1) 畫面層級：基地結構件必須逐像素鏡射相同
  const RS = measureBaseSymmetry(L, T, { px: 6, win: 100 });
  ok(RS.structDiff === 0,
    `G.14-fix 基地結構件的**畫面**必須完全鏡射（結構性不對稱 ${RS.structDiff} 像素 / ${RS.inkPx}）`);
  //  ⚠ G.15 把這條由「必須 0」改成「必須 ≤16 像素（占非背景 <0.02%）」。
  //   理由是 tools/lib/baseSymmetryRaster.mjs 自己文件裡就寫的那件事：掃描線光柵化
  //   在形狀邊緣會因浮點 ulp 差 1 個像素，那不是不對稱——所以才另外算 structDiff
  //   （3×3 鄰域全不符才計入）。G.15 重畫成乾淨圓之後實測殘留 2 像素，全部落在
  //   泉水平台 / 水面的邊界線上（sim (14,215)、(22,216)、(11.5,220)），
  //   structDiff 仍然是 0。把把關留在 structDiff，這條只當「別爆炸」的護欄。
  ok(RS.rawDiff <= 16,
    `G.14-fix 基地結構件光柵的邊緣差異應極小（原始差異 ${RS.rawDiff} 像素 / 非背景 ${RS.inkPx}）`);
  G14RASTER = RS;

  // M2) 單一 blueprint：紅方的每一個基地結構件都必須是藍方某一件的鏡射
  //     （id、頂點數、逐頂點座標三者全中，才算「由 blueprint 產生」）
  {
    const blue = T.groundLayers.filter((g) => STRUCT_LAYER_RE.test(g.id) && g.id.includes("blue"));
    const red = T.groundLayers.filter((g) => STRUCT_LAYER_RE.test(g.id) && g.id.includes("red"));
    ok(blue.length === red.length,
      `G.14-fix 基地結構地面層兩方數量應相同（藍 ${blue.length} / 紅 ${red.length}）`);
    const rMap = new Map(red.map((g) => [g.id, g]));
    let miss = 0, worst = 0, worstId = "";
    for (const g of blue) {
      const r = rMap.get(mirrorLayerId(g.id));
      if (!r || r.poly.length !== g.poly.length) { miss++; continue; }
      for (let i = 0; i < g.poly.length; i++) {
        const e = Math.hypot((220 - g.poly[i].x) - r.poly[i].x, (220 - g.poly[i].y) - r.poly[i].y);
        if (e > worst) { worst = e; worstId = g.id; }
      }
    }
    ok(miss === 0, `G.14-fix 每個藍方基地結構層都應有對應的紅方鏡射層（缺 ${miss} 層）`);
    ok(worst < 1e-9, `G.14-fix 基地結構層應逐頂點精確鏡射（最差 ${worstId} 誤差 ${worst.toExponential(2)}）`);
  }

  // M3) 牆段的 transform：數量 / 位置 / rotation / scale 逐段鏡射相等
  {
    const near = (w) => (d2(w, L.bases.blue) < d2(w, L.bases.red) ? "blue" : "red");
    for (const kind of ["base_rim", "base_keep", "base_gate", "fountain_rim"]) {
      const all = T.wallItems.filter((w) => w.kind === kind);
      const bw = all.filter((w) => near(w) === "blue"), rw = all.filter((w) => near(w) === "red");
      ok(bw.length === rw.length, `G.14-fix ${kind} 兩方段數應相同（藍 ${bw.length} / 紅 ${rw.length}）`);
      const used = new Uint8Array(rw.length);
      let posErr = 0, sizeErr = 0, rotErr = 0;
      for (const w of bw) {
        const m = { x: 220 - w.x, y: 220 - w.y };
        let bi = -1, bd = Infinity;
        for (let i = 0; i < rw.length; i++) {
          if (used[i]) continue;
          const e = d2(m, rw[i]); if (e < bd) { bd = e; bi = i; }
        }
        if (bi < 0) { posErr = Infinity; break; }
        used[bi] = 1; const r = rw[bi];
        posErr = Math.max(posErr, bd);
        // scale：長 / 厚 / 高一個字都不能差（鏡射不改變尺寸）
        sizeErr = Math.max(sizeErr, Math.abs(w.len - r.len), Math.abs(w.thick - r.thick), Math.abs(w.h - r.h));
        // rotation：長方體對 180° 自我重合 ⇒ 角度差取 mod π
        let da = Math.abs(w.angle - r.angle) % Math.PI;
        rotErr = Math.max(rotErr, Math.min(da, Math.PI - da));
      }
      ok(posErr < 1e-9, `G.14-fix ${kind} 牆段位置應精確鏡射（誤差 ${posErr.toExponential(2)}）`);
      ok(sizeErr < 1e-9, `G.14-fix ${kind} 牆段 scale（長/厚/高）應完全相同（誤差 ${sizeErr.toExponential(2)}）`);
      ok(rotErr < 1e-9, `G.14-fix ${kind} 牆段 rotation 應精確鏡射（誤差 ${rotErr.toExponential(2)}）`);
    }
  }

  // M4) 基地結構牆不得有 random jitter：每一種牆的高 / 厚只能是宣告好的固定值
  {
    const ALLOWED_H = {
      base_rim: [HEIGHT.base_rim], base_keep: [HEIGHT.base_keep],
      base_gate: [HEIGHT.base_gate, HEIGHT.base_bastion], fountain_rim: [HEIGHT.fountain_rim],
    };
    const ALLOWED_T = { base_rim: [BASE_GEO.rimThick], base_keep: [BASE_GEO.shoulderThick], base_gate: [BASE_GEO.pierArc], fountain_rim: [BASE_GEO.fountainRimThick] };
    for (const kind of Object.keys(ALLOWED_H)) {
      const ws = T.wallItems.filter((w) => w.kind === kind);
      const hs = [...new Set(ws.map((w) => +w.h.toFixed(9)))].sort((a, b) => a - b);
      const ts = [...new Set(ws.map((w) => +w.thick.toFixed(9)))].sort((a, b) => a - b);
      ok(hs.every((h) => ALLOWED_H[kind].some((v) => Math.abs(h - v) < 1e-9)),
        `G.14-fix ${kind} 的高度不得有 jitter（實得 ${hs.join("/")}，允許 ${ALLOWED_H[kind].join("/")}）`);
      ok(ts.every((t) => ALLOWED_T[kind].some((v) => Math.abs(t - v) < 1e-9)),
        `G.14-fix ${kind} 的厚度不得有 jitter（實得 ${ts.join("/")}，允許 ${ALLOWED_T[kind].join("/")}）`);
      ok(hs.length <= ALLOWED_H[kind].length && ts.length <= ALLOWED_T[kind].length,
        `G.14-fix ${kind} 的高/厚相異值個數應收斂（高 ${hs.length}、厚 ${ts.length}）`);
    }
  }

  // M5) 塔的呈現 transform 逐座鏡射相等（位置 / 底座 / 廣場 / 疊層 / 塔冠）
  for (const t of [...T.towers, ...T.nexusTurrets].filter((x) => x.side === "blue")) {
    const rid = t.lane === "nexus"
      ? t.id.replace("blue", "red")
      : `red_${MIRROR_LANE[t.lane]}_${t.tier}`;
    const r = [...T.towers, ...T.nexusTurrets].find((x) => x.id === rid);
    ok(!!r, `G.14-fix 塔 ${t.id} 應有紅方對應 ${rid}`);
    if (!r) continue;
    ok(Math.hypot((220 - t.x) - r.x, (220 - t.y) - r.y) < 1e-9, `G.14-fix 塔 ${t.id} 位置應精確鏡射`);
    ok(t.padR === r.padR && t.plazaR === r.plazaR && t.crown === r.crown,
      `G.14-fix 塔 ${t.id} 的 scale（底座/廣場/塔冠）應與紅方相同`);
    ok(t.tiers.length === r.tiers.length && t.tiers.every((x, i) => x.r === r.tiers[i].r && x.h === r.tiers[i].h),
      `G.14-fix 塔 ${t.id} 的疊層規格應與紅方相同`);
  }

  // M6) 三路出口開口寬度鏡射相等（藍 top ↔ 紅 bot）
  for (const lane of ["top", "mid", "bot"]) {
    const b = G14.EXIT.exits.find((e) => e.side === "blue" && e.lane === lane);
    const r = G14.EXIT.exits.find((e) => e.side === "red" && e.lane === MIRROR_LANE[lane]);
    ok(Math.abs(b.minClear - r.minClear) < 1e-6,
      `G.14-fix 出口開口寬度應精確鏡射（藍 ${lane} ${b.width} / 紅 ${MIRROR_LANE[lane]} ${r.width}）`);
  }

  // M7) 決定性：光柵比對兩次結果一致
  {
    const T4 = buildTerrainShapes(buildMobaLayout());
    const RS2 = measureBaseSymmetry(buildMobaLayout(), T4, { px: 6, win: 100 });
    ok(RS2.structDiff === RS.structDiff && RS2.rawDiff === RS.rawDiff,
      "G.14-fix 基地光柵對稱比對必須是決定性的");
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  Milestone G.15：Base Blueprint Reset
//
//  【G.14 / G.14-fix 驗到的是什麼、漏掉什麼】
//   G.14  驗「結果一樣」（多邊形、牆段逐項比對）
//   G.14-fix 驗「畫面一樣」（結構件光柵逐像素比對）
//   兩者都證明不了 **紅方是不是真的由藍方 blueprint 長出來的**：兩邊各自生成、
//   碰巧長得一樣，一樣全綠。而且**藍方自己的形狀壞掉**時（G.15 開場實測：三個
//   出口缺口互相重疊、外牆只切出 1 段、門墩左右半徑差 7 個單位、45 個牆點有 19 點
//   越界被丟掉），這兩種檢查也全綠——因為紅方也壞得一模一樣。
//
//  【G.15 驗什麼】驗「來源」與「藍方自己的形狀對不對」：
//   N1 逐件 blueprint 對照（id / kind / position / rotation / scale / height / thickness）
//   N2 基地的每一個渲染物件都必須來自 blueprint（不得有人繞過 blueprint 直接 push）
//   N3 外牆真的是「一圈牆開三個門」：弧數 / 門數 / 段長 / 無越界段
//   N4 基地淨空圓內不得有任何非基地物件（＝「出口旁不准有隨機大石塊」）
//   N5 基地核心結構零 jitter（len / thick / height 各只有一種值）
// ══════════════════════════════════════════════════════════════════════════
{
  const BPR = buildBaseBlueprintReport(T);
  G15 = BPR;

  // N1) 逐件對照
  for (const r of BPR.rows) {
    ok(r.ok, `G.15 base blueprint「${r.label}」不成立（${r.detail}）`);
  }
  ok(BPR.ok, "G.15 紅方基地必須 100% 由藍方 blueprint 鏡射而來");

  // N2) 基地的渲染物件必須全部來自 blueprint
  //     地面層：id 以基地前綴開頭的，都要在 blueprint 裡找得到同名 item
  {
    const bpIds = new Set([...T.baseBlueprint.blue, ...T.baseBlueprint.red].map((i) => i.id));
    const stray = T.groundLayers
      //  ⚠ towerpad_ 只認門牙塔的底座；兵線塔的底座（towerpad_blue_top_0…）
      //    是塔系統的東西，不歸基地 blueprint 管。
      .filter((g) => /^(base|slab|fountain|ramp|highland)_(blue|red)|^towerpad_(blue|red)_nexus_/.test(g.id))
      .filter((g) => !bpIds.has(g.id));
    ok(stray.length === 0,
      `G.15 基地地面層必須全部來自 blueprint（不明來源 ${stray.length} 層：${stray.slice(0, 3).map((g) => g.id).join(",")}）`);
    //  牆段：基地四種牆都必須帶 struct = blueprint id
    const bw = T.wallItems.filter((w) => ["base_rim", "base_keep", "base_gate", "fountain_rim"].includes(w.kind));
    const strayW = bw.filter((w) => !bpIds.has(w.struct));
    ok(strayW.length === 0, `G.15 基地牆段必須全部來自 blueprint（不明來源 ${strayW.length} 段）`);
    ok(bw.length === [...bpIds].filter((id) => /^wall_/.test(id)).length,
      `G.15 blueprint 的每一段基地牆都要出現在畫面上（blueprint ${[...bpIds].filter((id) => /^wall_/.test(id)).length} 段 / 實際 ${bw.length} 段）`);
  }

  // N3) 出口牆體模組（G.15-fix4）：三個出口必須由**同一份模組**旋轉而來
  //
  //  ⚠ 這裡刻意不再驗「弧要有幾段 / 門墩離中心線多遠」。那些判準量的是「每個門
  //    自己左右對不對稱」——三個門各自左右對稱、但彼此完全不同時仍會全綠，
  //    這正是 G.15~fix3 三輪畫面不合格卻測試全過的原因。
  //
  //  改驗「來源」：把每個出口的牆體轉回模組局部座標（繞平台中心 C 轉 −bearing），
  //  三個方向必須逐件重合。段數 / 門柱 / 翼牆 / 肩牆 / 牆高 / 牆厚 / 出口寬，
  //  任何一項不同都會被抓出來。共用報告 buildBaseBlueprintReport 的
  //  module_congruent / module_parts / module_lr_mirror / gate_clear /
  //  wall_single_source / wall_fan_mirror 已逐條驗過（N1），
  //  這裡從 blueprint 原始資料再獨立驗一次形狀與段數。
  const MODULE = buildBaseExitWallModule();
  for (const side of ["blue", "red"]) {
    const BPs = T.baseBlueprint[side];
    const C = BPs.find((i) => i.kind === "apron_center");
    const gates = BPs.filter((i) => i.kind === "gate");
    ok(gates.length === 3, `G.15-fix4 ${side} 應有 3 個出口節點（實得 ${gates.length}）`);

    //  ① 三個門等角：相鄰兩門的方位差必須都等於模組張角（⇒ 模組首尾相接、整道牆對中軸鏡射）
    {
      //  ⚠ 角度要先正規化到同一支（紅方的三個門會跨過 ±π，直接排序會算出 228°）
      const raw = gates.map((g) => Math.atan2(g.y - C.y, g.x - C.x));
      const angs = raw
        .map((a) => raw[0] + Math.atan2(Math.sin(a - raw[0]), Math.cos(a - raw[0])))
        .sort((a, b) => a - b);
      const gaps = [angs[1] - angs[0], angs[2] - angs[1]];
      const worst = Math.max(...gaps.map((g) => Math.abs(g - MODULE.span)));
      ok(worst < 1e-9,
        `G.15-fix4 ${side} 三個出口應等角排列且間距 = 模組張角 ${(MODULE.span * 180 / Math.PI).toFixed(2)}°（實得 ${gaps.map((g) => (g * 180 / Math.PI).toFixed(2)).join("/")}）`);
    }

    //  ② 每個出口的元件與段數：flankLeft/Right ×flankSegs、pierLeft/Right ×1、shoulderLeft/Right ×shoulderSegs
    const EXPECT = {
      flankLeft: BASE_GEO.flankSegs, flankRight: BASE_GEO.flankSegs,
      pierLeft: 1, pierRight: 1,
      shoulderLeft: BASE_GEO.shoulderSegs, shoulderRight: BASE_GEO.shoulderSegs,
    };
    for (const lane of ["top", "mid", "bot"]) {
      const parts = {};
      for (const it of BPs) {
        const m = new RegExp(`^wall_${side}_exit_${lane}_([A-Za-z]+)`).exec(it.id);
        if (m) parts[m[1]] = (parts[m[1]] ?? 0) + 1;
      }
      for (const [name, n] of Object.entries(EXPECT)) {
        ok(parts[name] === n,
          `G.15-fix4 ${side} ${lane} 的 ${name} 應為 ${n} 段（實得 ${parts[name] ?? 0}）`);
      }
      ok(Object.keys(parts).length === Object.keys(EXPECT).length,
        `G.15-fix4 ${side} ${lane} 不應有模組以外的牆體元件（實得 ${Object.keys(parts).join(",")}）`);
    }

    //  ③ 三個出口逐件重合（模組局部座標）：本輪的核心判準
    {
      const norm = (a) => Math.atan2(Math.sin(a), Math.cos(a));
      const localOf = (lane) => {
        const th = gates.find((g) => g.lane === lane).rot;
        const c = Math.cos(th), s = Math.sin(th);
        const out = new Map();
        for (const it of BPs) {
          const m = new RegExp(`^wall_${side}_exit_${lane}_(.+)$`).exec(it.id);
          if (!m) continue;
          const dx = it.x - C.x, dy = it.y - C.y;
          out.set(m[1], [dx * c + dy * s, -dx * s + dy * c, norm(it.rot + th), it.len, it.thick, it.h]);
        }
        return out;
      };
      const ref = localOf("top");
      for (const lane of ["mid", "bot"]) {
        const cur = localOf(lane);
        let worst = 0, missing = 0;
        for (const [k, a] of ref) {
          const v = cur.get(k);
          if (!v) { missing++; continue; }
          worst = Math.max(worst, ...a.map((x, i) => (i === 2 ? Math.abs(norm(x - v[i])) : Math.abs(x - v[i]))));
        }
        ok(missing === 0 && cur.size === ref.size && worst < 1e-9,
          `G.15-fix4 ${side} ${lane} 出口應與 top 出口逐件重合（缺 ${missing} 件、件數 ${cur.size}/${ref.size}、最大偏差 ${worst.toExponential(2)}）`);
      }
    }

    //  ④ 門柱規格：六根一律 pierRadial × pierArc，且長軸沿自己那個出口的方向
    {
      const piers = BPs.filter((i) => i.kind === "base_gate");
      ok(piers.length === 6, `G.15-fix4 ${side} 門柱應為 6 根（三個出口 × 左右各一；實得 ${piers.length}）`);
      const bad = piers.filter((p) => Math.abs(p.len - BASE_GEO.pierRadial) > 1e-9 || Math.abs(p.thick - BASE_GEO.pierArc) > 1e-9);
      ok(bad.length === 0, `G.15-fix4 ${side} 門柱規格應一律 ${BASE_GEO.pierRadial}×${BASE_GEO.pierArc}（不符 ${bad.length} 根）`);
    }

    //  ⑤ 基地牆體只有一個來源：每一段都屬於某個出口模組（泉水池緣除外）。
    //     這就是 Codex 第一輪 FAIL 的直接把關——當時模組之外還有後翼牆與一圈
    //     三路共用的主堡內牆，導致三個方向的可見牆廓不同。
    {
      const stray = BPs.filter((i) => i.role === "wall"
        && !/^wall_(?:blue|red)_(?:exit_(?:top|mid|bot)_|fountainrim_)/.test(i.id));
      ok(stray.length === 0,
        `G.15-fix4 ${side} 基地牆體只能來自三個出口模組（模組以外 ${stray.length} 段：${stray.slice(0, 3).map((s) => s.id).join(",")}）`);
      const oob = BPs.filter((i) => i.role === "wall" && (i.x < 0 || i.y < 0 || i.x > 220 || i.y > 220));
      ok(oob.length === 0, `G.15-fix4 ${side} 基地牆不得有越界段（實得 ${oob.length}）`);
    }

    //  ⑥ 每一段基地牆的長度完全相同（門柱除外）⇒ 沒有讀成石塊的殘段
    {
      const segs = BPs.filter((i) => i.role === "wall" && (i.kind === "base_rim" || i.kind === "base_keep"));
      ok(segs.every((w) => Math.abs(w.len - BASE_GEO.rimStep) < 1e-9),
        `G.15-fix4 ${side} 每一段基地牆的弦長都應 = rimStep（${BASE_GEO.rimStep}）`);
    }
  }

  // N4) 基地淨空圓內不得有任何非基地物件（＝「出口旁不准有隨機大石塊」）
  {
    const R = BASE_GEO.keepOutR;
    const BASE_KINDS = new Set(["base_rim", "base_keep", "base_gate", "fountain_rim"]);
    const near = (p) => Math.min(d2(p, L.bases.blue), d2(p, L.bases.red)) < R;
    const strayWall = T.wallItems.filter((w) => !BASE_KINDS.has(w.kind) && w.kind !== "cliff" && near(w));
    ok(strayWall.length === 0,
      `G.15 基地淨空圓（半徑 ${R}）內不得有野區岩壁 / 結構牆（實得 ${strayWall.length} 段）`);
    const strayRock = T.rocks.filter(near);
    ok(strayRock.length === 0, `G.15 基地淨空圓內不得有裝飾岩（實得 ${strayRock.length} 顆）`);
    //  兩方淨空圓內的「非基地地面裝飾層」數量必須相同（0 = 完全乾淨）
    const cen = (g) => g.poly.reduce((a, p) => ({ x: a.x + p.x / g.poly.length, y: a.y + p.y / g.poly.length }), { x: 0, y: 0 });
    const decor = T.groundLayers.filter((g) => !STRUCT_LAYER_RE.test(g.id) && g.id !== "bedrock" &&
      g.id !== "arena" && g.id !== "cliff_shadow");
    const nb = decor.filter((g) => d2(cen(g), L.bases.blue) < R).length;
    const nr = decor.filter((g) => d2(cen(g), L.bases.red) < R).length;
    ok(nb === nr, `G.15 兩方基地淨空圓內的裝飾地面層數應相同（藍 ${nb} / 紅 ${nr}）`);
  }
}

// F8) 牆體不得長在路面/基地平台上
//  例外：cliff / cliff_mass（外緣崖與路肩本來就相鄰）、base_rim / base_keep（基地自己的城牆）
//  fountain_rim：溫泉池緣本來就蓋在高地平台上（不是「長在路上」）
const WALL_EXEMPT = new Set(["cliff", "cliff_mass", "base_rim", "base_keep", "base_gate", "fountain_rim"]);
const blockers = [
  ...["top", "mid", "bot"].map((ln) => layer(`lane_${ln}_surface`).poly),
  ...["blue", "red"].map((s) => layer(`base_${s}_apron`).poly),
];
const onRoad = T.wallItems.filter((w) => !WALL_EXEMPT.has(w.kind))
  .filter((w) => blockers.some((poly) => pointInPoly(w.x, w.y, poly)));
ok(onRoad.length === 0, `牆體不應長在路面/基地平台上（實得 ${onRoad.length} 段）`);

// F9) 地圖輪廓：競技場外緣崖 + 兩個對角死角崖體
ok(T.wallItems.some((w) => w.kind === "cliff"), "應有競技場外緣崖");
const massif = T.wallItems.filter((w) => w.kind === "cliff_mass");
ok(massif.length >= 60, `對角死角應有崖體massif（實得 ${massif.length} 段）`);
ok(massif.some((w) => w.x + w.y < 80) && massif.some((w) => w.x + w.y > 360), "崖體應同時出現在左上與右下死角");

// F10) 量體整體：無 NaN、在界內、有高度
ok(T.wallItems.length >= 400, `量體段數應 ≥400（實得 ${T.wallItems.length}）`);
for (const w of T.wallItems) {
  if (!Number.isFinite(w.x) || !Number.isFinite(w.y) || !Number.isFinite(w.h) ||
      !Number.isFinite(w.len) || !Number.isFinite(w.thick) || !Number.isFinite(w.angle)) {
    ok(false, "量體不應含 NaN"); break;
  }
}
ok(T.wallItems.every((w) => w.h > 0.5 && w.thick > 0.5 && w.len > 0), "量體應有正的高/厚/長");
ok(T.wallItems.every((w) => w.x >= -2 && w.y >= -2 && w.x <= WORLD_BOUNDS.maxX + 2 && w.y <= WORLD_BOUNDS.maxY + 2),
  "量體應在地圖界內");
ok(T.rocks.length > 0 && T.rocks.every((r) => Number.isFinite(r.x) && Number.isFinite(r.y)), "裝飾岩應存在且無 NaN");

// F11) 決定性：同輸入兩次呼叫必須完全相同（不得有 Math.random / 時間相依）
const T2 = buildTerrainShapes(buildMobaLayout());
ok(JSON.stringify(T2.wallItems) === JSON.stringify(T.wallItems), "buildTerrainShapes 必須是決定性的（量體）");
ok(JSON.stringify(T2.groundLayers) === JSON.stringify(T.groundLayers), "buildTerrainShapes 必須是決定性的（地面）");

// 9) 無 Math.random；renderer 不含模擬邏輯（不 import LogicEngine/store）
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const mapDir = resolve(__dir, "../src/battle/moba/map/");
for (const f of ["mobaMapLayout.js", "mapZones.js", "coordinateMapping.js", "mapLandmarks.js",
  "mapVisualStyle.js", "mapShapePrimitives.js", "mapTerrainShapes.js",
  "mapLaneStyle.js", "mapRiverStyle.js", "mapBaseLayoutStyle.js", "mapTowerLayoutStyle.js",
  "mapMonsterShapes.js", "mapCampLayout.js", "mapBushCover.js", "mapJungleStructures.js",
  "mapPassability.js", "mapBaseSymmetry.js", "MobaMapBlockout.jsx"]) {
  const src = strip(readFileSync(resolve(mapDir, f), "utf8"));
  ok(!/Math\.random\s*\(/.test(src), `${f} 不應使用 Math.random()`);
}
const renderer = strip(readFileSync(resolve(mapDir, "MobaMapBlockout.jsx"), "utf8"));
ok(!/\b(LogicEngine|useGameStore|useLocalServer)\b/.test(renderer), "Blockout renderer 不應 import 模擬/戰鬥邏輯");
ok(/from ["'].*gameData/.test(readFileSync(resolve(mapDir, "coordinateMapping.js"), "utf8")) ||
   /from ["'].*gameData/.test(readFileSync(resolve(mapDir, "mobaMapLayout.js"), "utf8")),
   "layout/mapping 應取自 gameData（唯一真相來源）");

// 10) gameData.js 未被改動（座標真相來源）：抽查關鍵常數
const gd = readFileSync(resolve(__dir, "../src/gameData.js"), "utf8");
ok(/export const BASE = \{ blue: \{ x:22, y:202 \}, red: \{ x:198, y:18 \} \};/.test(gd), "gameData.js 的 BASE 不應被改動");
ok(/export const WALLS = \[\.\.\.BLUE_WALLS, \.\.\.RED_WALLS\];/.test(gd), "gameData.js 的 WALLS 不應被改動");
ok(/export const TOWER_T = \{ blue: \[0\.15, 0\.33, 0\.48\], red: \[0\.85, 0\.67, 0\.52\] \};/.test(gd), "gameData.js 的 TOWER_T 不應被改動");
ok(/export const RIVER = Object\.freeze\(\{/.test(gd), "gameData.js 的 RIVER 不應被改動");

console.log(`\nMOBA Map 檢查（D 拓撲 + G.1~G.6 結構/可讀性/野怪/中文化/草叢）：${pass} 通過、${fail} 失敗`);
console.log(`— 塔 ${L.towers.length}（含 2 nexus）｜lane top/mid/bot=${L.lanes.top.length}/${L.lanes.mid.length}/${L.lanes.bot.length} 點｜camps ${L.camps.length}｜walls ${L.walls.length}｜bushes ${L.bushes.length}`);
console.log(`— Dragon(${L.pits.dragon.x},${L.pits.dragon.y}) Baron(${L.pits.baron.x},${L.pits.baron.y})`);
console.log("— 各路塔距（中心距，模擬單位）：");
for (const [side, lane, nt, hi, io2, oc] of chainReport) {
  console.log(`   ${side} ${lane}：門牙→高地 ${nt.toFixed(1)}｜高地→內塔 ${hi.toFixed(1)}｜內塔→外塔 ${io2.toFixed(1)}｜外塔→中心 ${oc.toFixed(1)}`);
}
console.log("— 營地：" + T.camps.map((c) => `${c.label}${c.isPresentation ? "*" : ""}`).join("／") + "（* = 呈現用，無模擬實體）");
console.log(`— 塔 ${T.towers.length} 兵線塔 + ${T.nexusTurrets.length} 門牙塔｜野怪剪影 ${T.monsters.length}（${T.monsters.map((m) => m.archetype).join("/")}）`);
console.log(`— 地面色塊 ${T.groundLayers.length} 層（草 ${grassKeys.size} 階、水 ${riverColors.size} 階）｜量體 ${T.wallItems.length} 段（野區牆平均段長 ${avgLen.toFixed(2)}）｜塔標記 ${T.towers.length}｜入口 ${T.entrances.length}｜裝飾岩 ${T.rocks.length}`);
console.log(`— 草叢 cover ${T.bushClusters.length} 叢（gameData ${T.bushClusters.filter((c) => !c.isPresentation).length} + 呈現用 ${T.bushClusters.filter((c) => c.isPresentation).length}）`);
console.log(`— 野區路線結構 ${T.jungleStructures.length} 個（${["divider", "lane_cut", "river_hook", "camp_wall"].map((r) => `${r}:${T.jungleStructures.filter((s) => s.role === r).length}`).join("／")}）｜jungle_struct 牆 ${T.wallItems.filter((w) => w.kind === "jungle_struct").length} 段`);
console.log(`— 野區可讀結構節點 ${T.camps.length + 2 + T.jungleStructures.length + T.bushClusters.length}（營地 ${T.camps.length}＋坑 2＋路線結構 ${T.jungleStructures.length}＋草叢 ${T.bushClusters.length}）｜其中「牆體/分隔/路線」結構 ${T.camps.length + 2 + T.jungleStructures.length}`);
{
  const narrowest = Math.min(...PASS.routes.map((r) => r.narrowest));
  const b = T.bushClusters;
  console.log(`— G.9 功能牆鏈 ${8 + T.jungleStructures.length + T.camps.length + 2}（30~40）｜草叢 ${T.bushClusters.length}（20~28；上${b.filter((c) => c.y < 110).length}/下${b.filter((c) => c.y >= 110).length}）｜必要路線 ${PASS.routes.length} 全達標，最窄淨寬 ${narrowest.toFixed(2)}（英雄半徑 ${HERO_RADIUS}/直徑 ${HERO_DIAMETER}）`);
  const pc = (id) => { const m = T.monsters.find((x) => x.id === id); return m.members.reduce((s, me) => s + me.parts.length, 0); };
  const rc = (id) => { const m = T.monsters.find((x) => x.id === id); return m.members.flatMap((mm) => mm.parts).filter((p) => p.shape === "sph" || p.shape === "cap").length; };
  console.log(`— G.9 有機野怪組件（sph/cap 圓弧數）：小龍 ${pc("mon_dragon")}(${rc("mon_dragon")})｜巴龍 ${pc("mon_baron")}(${rc("mon_baron")})｜藍Buff ${pc("mon_camp_blue_buff")}(${rc("mon_camp_blue_buff")})｜body 全部非 null ✅`);
  if (POROSITY) console.log(`— G.11 Porosity：連通群 ${POROSITY.wall_cluster_count}（上${POROSITY.upper_clusters}/下${POROSITY.lower_clusters}）｜最大群 ${POROSITY.largest_cluster_size}段/bbox${POROSITY.largest_cluster_bbox}｜封閉營地 ${POROSITY.sealed_camp_count}｜開放度 上${POROSITY.upper_jungle_porosity}/下${POROSITY.lower_jungle_porosity}｜穿梭路線 上${POROSITY.upper_shuttle_routes}/下${POROSITY.lower_shuttle_routes}`);
  console.log(`— G.7 比例：塔前廣場(高地) ${TOWER_SPEC.highground.plazaR}｜野怪縮放 camp ${MONSTER_SIZE_K.camp}/buff ${MONSTER_SIZE_K.buff}/epic ${MONSTER_SIZE_K.epic}｜小龍reach ${monsterReach(T.monsters.find((m) => m.id === "mon_dragon")).toFixed(1)}<17｜巴龍reach ${monsterReach(T.monsters.find((m) => m.id === "mon_baron")).toFixed(1)}<14`);
}
if (G14) {
  const { SYM, HIER, EXIT } = G14;
  console.log(`— G.14 基地鏡射：${SYM.ok ? "✅ 全部對稱" : "❌ 有不對稱項"}（${SYM.checks.length} 項，最大誤差 ${SYM.maxErr}）`);
  console.log(`   牆段：${["base_rim", "base_keep", "base_gate", "fountain_rim"].map((k) => {
    const c = SYM.checks.find((x) => x.id === `wall_${k}`); return `${k} ${c.detail.split("｜")[0]}`;
  }).join("｜")}`);
  const hb = HIER.sides.blue.rows;
  console.log(`— G.14 主堡區層級（距主堡，兩方相同）：${hb.map((r) => `${r.label} ${r.value.toFixed(1)}`).join(" → ")}`);
  console.log(`— G.14 三路出口實測淨寬：${EXIT.exits.map((e) => `${e.id} ${e.width}`).join("｜")}（下限 ${EXIT_MIN_WIDTH}，英雄直徑 ${HERO_DIAMETER}）`);
}
if (G14RASTER) {
  const R = G14RASTER;
  console.log(`— G.14-fix 基地畫面逐像素鏡射：結構性不對稱 ${R.structDiff} px、原始差異 ${R.rawDiff} px / 非背景 ${R.inkPx} px（目標 0）`);
  console.log("   截圖：node tools/preview_base_symmetry.mjs → review/moba-map/base_symmetry_{blue,red,overlay,topdown}.png");
}
if (G15) {
  console.log(`— G.15 base blueprint：${G15.ok ? "✅ 紅方 100% 由藍方鏡射" : "❌ 有不符項"}（藍紅各 ${G15.count} 件，${G15.rows.length} 項判準全過）`);
  console.log(`   基地淨空圓 半徑 ${BASE_GEO.keepOutR}（圓心 = 主堡，兩方同半徑）內：野區岩壁 0 段、裝飾岩 0 顆`);
  console.log(`   出口左右牆面淨距：${G15.exits.filter((e) => e.side === "blue")
    .map((e) => `${e.lane} 左${e.left ?? "—"}/右${e.right ?? "—"}`).join("｜")}`);
  {
    //  G.15-fix4：出口牆體模組的實際結果（三個出口逐件相同，只有朝向不同）
    const M = buildBaseExitWallModule();
    const runsOf = (re) => {
      const m = new Map();
      for (const it of T.baseBlueprint.blue) {
        if (it.role !== "wall" || !re.test(it.id)) continue;
        const k = it.id.replace(/_\d+$/, "").replace(/^wall_blue_/, "");
        m.set(k, (m.get(k) ?? 0) + 1);
      }
      return [...m].map(([k, n]) => `${k} ${n}段`).join("／");
    };
    console.log("   G.15-fix4 出口牆體模組（唯一一份，三個方向各旋轉一次）：");
    console.log(`     模組張角 ${(M.span * 180 / Math.PI).toFixed(2)}°（＝三門等角間距）｜弧長 ${(M.span * M.rimR).toFixed(2)}｜外牆半徑 ${M.rimR}`);
    console.log(`     每個出口：翼牆 ${BASE_GEO.flankSegs}+${BASE_GEO.flankSegs} 段｜門柱 2 根（${BASE_GEO.pierRadial}×${BASE_GEO.pierArc}）｜出口淨寬 ${BASE_GEO.gateClear}｜肩牆 ${BASE_GEO.shoulderSegs}+${BASE_GEO.shoulderSegs} 段`);
    console.log(`     出口模組：${runsOf(/_exit_/)}`);
    console.log(`     整道城牆＝ 3 × 同一份模組，沒有後翼牆、沒有另一圈共用內牆`);
    console.log("   ※ 三個門改成等角配置（模組首尾相接）；門與「主堡→高地塔」直線的側距由");
    console.log("     出口通道折線吸收，淨寬沿通道中心線實測（見上方 G.14 三路出口實測淨寬）。");
  }
  console.log("   debug 檢視：?debug=moba-map-blockout → 「只看藍方 blueprint / 只看紅方鏡射 / 藍紅 overlay」");
}
process.exit(fail === 0 ? 0 : 1);
