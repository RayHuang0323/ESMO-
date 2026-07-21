// ============================================================================
//  tools/check_moba_map.mjs — 正式 MOBA 地圖 Blockout 驗證（Milestone D）
//
//  驗證 blockout 結構與既有模擬座標一致、拓撲完整、無模擬邏輯混入。
//  （座標真相來源 src/gameData.js；FPS/視覺需瀏覽器人工目視。）
// ============================================================================
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { buildMobaLayout } from "../src/battle/moba/map/mobaMapLayout.js";
import { buildLandmarks } from "../src/battle/moba/map/mapLandmarks.js";
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

// 9) 無 Math.random；renderer 不含模擬邏輯（不 import LogicEngine/store）
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const mapDir = resolve(__dir, "../src/battle/moba/map/");
for (const f of ["mobaMapLayout.js", "mapZones.js", "coordinateMapping.js", "mapLandmarks.js", "MobaMapBlockout.jsx"]) {
  const src = strip(readFileSync(resolve(mapDir, f), "utf8"));
  ok(!/Math\.random\s*\(/.test(src), `${f} 不應使用 Math.random()`);
}
const renderer = strip(readFileSync(resolve(mapDir, "MobaMapBlockout.jsx"), "utf8"));
ok(!/\b(LogicEngine|useGameStore|useLocalServer)\b/.test(renderer), "Blockout renderer 不應 import 模擬/戰鬥邏輯");
ok(/from ["'].*gameData/.test(readFileSync(resolve(mapDir, "coordinateMapping.js"), "utf8")) ||
   /from ["'].*gameData/.test(readFileSync(resolve(mapDir, "mobaMapLayout.js"), "utf8")),
   "layout/mapping 應取自 gameData（唯一真相來源）");

console.log(`\nMOBA Map Blockout 檢查：${pass} 通過、${fail} 失敗`);
console.log(`— 塔 ${L.towers.length}（含 2 nexus）｜lane top/mid/bot=${L.lanes.top.length}/${L.lanes.mid.length}/${L.lanes.bot.length} 點｜camps ${L.camps.length}｜walls ${L.walls.length}｜bushes ${L.bushes.length}`);
console.log(`— Dragon(${L.pits.dragon.x},${L.pits.dragon.y}) Baron(${L.pits.baron.x},${L.pits.baron.y})`);
process.exit(fail === 0 ? 0 : 1);
