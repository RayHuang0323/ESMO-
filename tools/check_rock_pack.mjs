// ============================================================================
//  tools/check_rock_pack.mjs — Rock Pack 靜態/程式驗證（Milestone B）
//
//  在 Node 驗證 Rock Pack（THREE 幾何生成為純 JS，不需 WebGL）：
//   · 8 件、每件 LOD0/LOD1、tris 在預算內
//   · Geometry 與 Material 重用（單例快取）
//   · 不使用 Math.random()（靜態掃描原始碼）
//   · 同 seed 一致、不同 seed 不同
//   · Bounding volume 有效
//   · pivot 底部中心（最低點 Y≈0）
//  （FPS/draw call 需瀏覽器；本腳本不涵蓋。）
// ============================================================================
import * as THREE from "three";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { getAllRocks, getRock, rockMeta, ROCK_NAMES } from "../src/environment/assets/rocks/index.js";
import { buildRockGeometries } from "../src/environment/assets/rocks/rockGeometry.js";
import { ROCK_TEST_CASES, ROCK_PLACEMENT } from "../src/debug/EnvironmentRuntime/rockTestCases.js";
import { generate } from "../src/environment/placement/PlacementGenerator.js";
import { TEST_AREA } from "../src/debug/EnvironmentRuntime/testCases.js";

const __dir = dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("❌ " + m); } };

// 1) 8 件
const rocks = getAllRocks();
ok(ROCK_NAMES.length === 8, `資產數量應為 8，實得 ${ROCK_NAMES.length}`);
ok(Object.keys(rocks).length === 8, "getAllRocks 應回 8 件");

// 2) 每件 LOD0/LOD1、tris>0 且在預算內（ASSET_BUDGET：LOD0 ≤300 / LOD1 ≤150）
const meta = rockMeta();
for (const m of meta) {
  ok(m.lod0Tris > 0 && m.lod1Tris > 0, `${m.name} LOD0/LOD1 tris 應 >0（${m.lod0Tris}/${m.lod1Tris}）`);
  ok(m.lod0Tris <= 300, `${m.name} LOD0 ${m.lod0Tris} 應 ≤300`);
  ok(m.lod1Tris <= 150, `${m.name} LOD1 ${m.lod1Tris} 應 ≤150`);
  ok(m.lod1Tris <= m.lod0Tris, `${m.name} LOD1 應 ≤ LOD0`);
}

// 3) Geometry 重用（快取單例）＋ Material 單例共用
ok(getRock("Rock_Large_A") === getRock("Rock_Large_A"), "getRock 應回快取同一物件");
const mats = new Set(ROCK_NAMES.map((n) => getRock(n).mat));
ok(mats.size === 1, `全 8 件應共用 1 個材質，實得 ${mats.size}`);
ok(getRock("Rock_Small_A").mat.name === "mat_env_stone", "材質名應為 mat_env_stone");

// 4) 不使用 Math.random()（掃 rock 原始碼；先去除註解避免誤判說明文字）
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
for (const f of ["rockGeometry.js", "rockMaterial.js", "index.js"]) {
  const src = stripComments(readFileSync(resolve(__dir, "../src/environment/assets/rocks/", f), "utf8"));
  ok(!/Math\.random\s*\(/.test(src), `${f} 不應使用 Math.random()`);
}

// 5) 決定性：重新 build 同名 → tris 與首頂點一致；不同名 → 不同
const a1 = buildRockGeometries("Rock_Medium_A");
const a2 = buildRockGeometries("Rock_Medium_A");
const firstV = (g) => Array.from(g.attributes.position.array.slice(0, 9));
ok(a1.lod0.userData.tris === a2.lod0.userData.tris, "同名 rebuild tris 應一致");
ok(JSON.stringify(firstV(a1.lod0)) === JSON.stringify(firstV(a2.lod0)), "同名 rebuild 頂點應一致（決定性）");
const b1 = buildRockGeometries("Rock_Large_B");
ok(JSON.stringify(firstV(a1.lod0)) !== JSON.stringify(firstV(b1.lod0)), "不同石頭頂點應不同（非單純縮放）");

// 6) Bounding volume 有效 + pivot 底部中心（最低點 Y≈0）
for (const n of ROCK_NAMES) {
  const g = getRock(n).lod0;
  g.computeBoundingBox(); g.computeBoundingSphere();
  const bb = g.boundingBox, bs = g.boundingSphere;
  ok(bs && isFinite(bs.radius) && bs.radius > 0, `${n} boundingSphere 應有效`);
  ok(Math.abs(bb.min.y) < 0.02, `${n} pivot 應貼地（min.y≈0，實得 ${bb.min.y.toFixed(3)}）`);
  const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
  ok(Math.abs(cx) < 0.05 && Math.abs(cz) < 0.05, `${n} pivot 應水平置中`);
}

// 7) 頂點色存在（instance color variation 之外的 base 色）
ok(getRock("Rock_Large_A").lod0.attributes.color, "石頭應有頂點色屬性");

// 8) Rock 測試情境擺放：各案例實例數正確、決定性、Scale/Color 範圍、不沿用
function placeCase(tid, seed = "esmo-001") {
  const tc = ROCK_TEST_CASES[tid];
  if (tc.showcase) return { total: 8, per: {} };
  const per = {}; let total = 0; const all = [];
  for (const name of Object.keys(tc.counts)) {
    const p = ROCK_PLACEMENT[name];
    const r = generate({ seed: `${seed}:${name}`, count: tc.counts[name], area: TEST_AREA,
      minDist: p.minDist, scale: p.scale, rotate: true, color: p.color });
    per[name] = r.transforms.length; total += r.transforms.length; all.push(...r.transforms);
  }
  return { total, per, all };
}
const single = placeCase("rockSingle");
ok(single.total >= 900, `rockSingle 應約 1000（單一資產），實得 ${single.total}`);
const mix8 = placeCase("rockMix8");
ok(Object.keys(mix8.per).length === 8, "rockMix8 應含 8 種石頭");
const stress = placeCase("rockStress2600");
ok(stress.total !== mix8.total, `rockStress2600(${stress.total}) 與 rockMix8(${mix8.total}) 應不同`);
// 決定性：同 seed 重算一致
ok(placeCase("rockMix8").total === mix8.total, "rockMix8 同 seed 重算應一致");
ok(JSON.stringify(placeCase("rockMix8").per) === JSON.stringify(mix8.per), "rockMix8 同 seed per-asset 應一致");
// Scale / rotation / color 範圍
ok(mix8.all.every((t) => t.scale >= 0.7 && t.scale <= 1.4), "石頭 instance scale 應在 [0.7,1.4]");
ok(mix8.all.every((t) => t.rotY >= 0 && t.rotY <= Math.PI * 2 + 1e-6), "rotY 應在 [0,2π]");
ok(mix8.all.every((t) => t.color && t.color.every((v) => v >= 0 && v <= 1)), "instance color 應在 [0,1]");

console.log(`\nRock Pack 檢查：${pass} 通過、${fail} 失敗`);
console.log("— 8 件 tris（LOD0/LOD1）：");
for (const m of meta) console.log(`   ${m.name.padEnd(18)} ${m.lod0Tris}/${m.lod1Tris}  [${m.zone}]`);
process.exit(fail === 0 ? 0 : 1);
