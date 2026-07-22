// ============================================================================
//  tools/check_moba_map.mjs — MOBA 地圖驗證（Milestone D 拓撲 + Milestone F 視覺結構）
//
//  驗證 blockout 結構與既有模擬座標一致、拓撲完整、無模擬邏輯混入，並驗證
//  mapTerrainShapes 產出的「視覺原型 v1」形狀（三路/河道/坑/基地/塔/野區通道）
//  確實存在、在界內、無 NaN。
//  （座標真相來源 src/gameData.js；最終畫面仍需瀏覽器人工目視。）
// ============================================================================
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { buildMobaLayout } from "../src/battle/moba/map/mobaMapLayout.js";
import { buildLandmarks } from "../src/battle/moba/map/mapLandmarks.js";
import { buildTerrainShapes } from "../src/battle/moba/map/mapTerrainShapes.js";
import { pointInPoly } from "../src/battle/moba/map/mapShapePrimitives.js";
import { worldX, worldZ } from "../src/battle/moba/map/coordinateMapping.js";
import { TOWER_T, FOUNTAIN, WORLD_BOUNDS } from "../src/gameData.js";

const __dir = dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
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

// 8) 地標（Milestone E）：keys 唯一、界內、無 NaN
const LM = buildLandmarks(L);
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
//  Milestone F：視覺原型 v1 的形狀結構
// ══════════════════════════════════════════════════════════════════════════
const T = buildTerrainShapes(L);
const layerIds = new Set(T.groundLayers.map((g) => g.id));
const allPts = T.groundLayers.flatMap((g) => g.poly);

// F1) 地面色塊：無 NaN、全部在界內（容 1 單位誤差，帶狀邊緣可能貼齊邊界）
ok(T.groundLayers.length >= 40, `地面色塊應 ≥40 層（實得 ${T.groundLayers.length}）`);
ok(allPts.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)), "地面色塊座標不應含 NaN");
const outside = allPts.filter((p) => p.x < -1 || p.y < -1 || p.x > WORLD_BOUNDS.maxX + 1 || p.y > WORLD_BOUNDS.maxY + 1);
ok(outside.length === 0, `地面色塊應全部在地圖界內（越界 ${outside.length} 點）`);

// F2) 三路：三條各有 路肩/路緣/路面 三層，且路面帶連接雙方基地
for (const ln of ["top", "mid", "bot"]) {
  for (const part of ["shoulder", "edge", "surface"]) {
    ok(layerIds.has(`lane_${ln}_${part}`), `三路應有 ${ln} 的 ${part} 帶狀地形`);
  }
  const surf = T.groundLayers.find((g) => g.id === `lane_${ln}_surface`);
  ok(pointInPoly(L.bases.blue.x, L.bases.blue.y, surf.poly), `${ln} 路面應覆蓋藍方基地（＝路連到出口）`);
  ok(pointInPoly(L.bases.red.x, L.bases.red.y, surf.poly), `${ln} 路面應覆蓋紅方基地`);
}
ok(layerIds.has("lane_mid_inlay"), "mid lane 應有路心亮帶（最明顯的對角線）");

// F3) 河道：四層帶存在；河道覆蓋地圖中心；兩坑各有河灣與河道相接
for (const part of ["bank", "bed", "water", "shallow"]) ok(layerIds.has(`river_${part}`), `河道應有 ${part} 層`);
const water = T.groundLayers.find((g) => g.id === "river_water");
ok(pointInPoly(WORLD_BOUNDS.centerX, WORLD_BOUNDS.centerY, water.poly), "河道應貫穿地圖中段（覆蓋中心點）");
for (const k of ["dragon", "baron"]) {
  ok(layerIds.has(`river_spur_${k}`), `${k} 應有河灣與河道相接`);
  const spur = T.groundLayers.find((g) => g.id === `river_spur_${k}`);
  ok(pointInPoly(L.pits[k].x, L.pits[k].y, spur.poly), `${k} 坑心應被河灣覆蓋（坑貼著河道）`);
}
// 河道與 mid lane 交叉，故必須畫在路肩之上、路面之下，否則會被截斷
const yOf = (id) => T.groundLayers.find((g) => g.id === id).y;
ok(yOf("river_water") > yOf("lane_mid_shoulder") && yOf("river_water") < yOf("lane_mid_surface"),
  "河道圖層應介於路肩與路面之間（否則河會被路肩截成兩段）");

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
  const near = T.gates.filter((g) => g.key.startsWith(`ent_${k}`));
  ok(near.length === 2, `${k} 應有 2 個入口`);
  // 入口朝河：入口點應落在河道帶（bank）之內
  const bank = T.groundLayers.find((g) => g.id === "river_bank");
  ok(near.every((g) => pointInPoly(g.x, g.y, bank.poly)), `${k} 的入口應朝向河道`);
}

// F5) 基地/高地：平台存在、有三路出口坡道與門
for (const side of ["blue", "red"]) {
  ok(layerIds.has(`base_${side}_apron`), `${side} 應有高地平台`);
  const ramps = ["top", "mid", "bot"].filter((ln) => layerIds.has(`ramp_${side}_${ln}`));
  ok(ramps.length === 3, `${side} 應有三條出口坡道（實得 ${ramps.length}）`);
  const gates = T.gates.filter((g) => g.key.startsWith(`baseent_${side}`));
  ok(gates.length === 3, `${side} 應有三個高地出口（實得 ${gates.length}）`);
  const apron = T.groundLayers.find((g) => g.id === `base_${side}_apron`);
  ok(pointInPoly(L.bases[side].x, L.bases[side].y, apron.poly), `${side} 平台應包住主堡`);
}
ok(T.wallItems.some((w) => w.kind === "base_rim"), "基地應有邊界 rim 量體");

// F6) 塔：18 座、三種等級以底座大小區分、每座都在自己那條路的路面帶上
ok(T.towers.length === 18, `塔標記應 18 座（實得 ${T.towers.length}）`);
const padOf = (kind) => T.towers.find((t) => t.kind === kind)?.padR ?? 0;
ok(padOf("highground") > padOf("inner") && padOf("inner") > padOf("outer"), "高地塔 > 二塔 > 外塔（底座大小）");
for (const t of T.towers) {
  const surf = T.groundLayers.find((g) => g.id === `lane_${t.lane}_surface`);
  ok(pointInPoly(t.x, t.y, surf.poly), `塔 ${t.id} 應落在 ${t.lane} 路面上`);
  ok(layerIds.has(`towerpad_${t.id}`), `塔 ${t.id} 應有底座色塊`);
}

// F7) 野區：四象限色塊、camp 空地、通道牆、每個 camp 有入口
ok(L.quadrants.every((q) => layerIds.has(`jungle_${q.id}`)), "四個野區應各有草地色塊");
ok(L.camps.every((c) => layerIds.has(`clearing_${c.id}`)), "每個 camp/buff 應有野區空地");
for (const c of L.camps) {
  const cl = T.groundLayers.find((g) => g.id === `clearing_${c.id}`);
  ok(pointInPoly(c.x, c.y, cl.poly), `camp ${c.id} 應位於自己的空地內`);
  ok(T.gates.some((g) => g.key === `junent_${c.id}`), `camp ${c.id} 應有野區入口`);
}
const jungleWalls = T.wallItems.filter((w) => w.kind === "wall");
ok(jungleWalls.length >= 120, `野區通道牆應 ≥120 段（短段多段才不像積木；實得 ${jungleWalls.length}）`);
const avgLen = jungleWalls.reduce((m, w) => m + w.len, 0) / Math.max(1, jungleWalls.length);
ok(avgLen < 4, `野區牆平均段長應 <4 模擬單位（實得 ${avgLen.toFixed(2)}）`);

// F8) 牆體不得長在路面/河面/基地平台上
const blockers = [
  ...["top", "mid", "bot"].map((ln) => T.groundLayers.find((g) => g.id === `lane_${ln}_surface`).poly),
  ...["blue", "red"].map((s) => T.groundLayers.find((g) => g.id === `base_${s}_apron`).poly),
];
const onRoad = T.wallItems.filter((w) => w.kind !== "cliff" && w.kind !== "cliff_mass")
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
  "mapVisualStyle.js", "mapShapePrimitives.js", "mapTerrainShapes.js", "MobaMapBlockout.jsx"]) {
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

console.log(`\nMOBA Map 檢查（D 拓撲 + F 視覺結構）：${pass} 通過、${fail} 失敗`);
console.log(`— 塔 ${L.towers.length}（含 2 nexus）｜lane top/mid/bot=${L.lanes.top.length}/${L.lanes.mid.length}/${L.lanes.bot.length} 點｜camps ${L.camps.length}｜walls ${L.walls.length}｜bushes ${L.bushes.length}`);
console.log(`— Dragon(${L.pits.dragon.x},${L.pits.dragon.y}) Baron(${L.pits.baron.x},${L.pits.baron.y})`);
console.log(`— 視覺原型：地面色塊 ${T.groundLayers.length} 層｜量體 ${T.wallItems.length} 段（野區牆平均段長 ${avgLen.toFixed(2)}）｜塔標記 ${T.towers.length}｜入口 ${T.gates.length}｜裝飾岩 ${T.rocks.length}`);
process.exit(fail === 0 ? 0 : 1);
