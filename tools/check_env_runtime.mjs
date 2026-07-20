// ============================================================================
//  tools/check_env_runtime.mjs — Environment Runtime 純邏輯驗證（Milestone A）
//
//  在 Node 端驗證 seededRandom / PlacementGenerator / lodRings 的正確性：
//   · 同 seed ⇒ 完全相同 transforms（可重現）
//   · 不同 seed ⇒ 結果不同
//   · 最小間距（不重疊）確實被遵守
//   · count / LOD 分類邊界正確
//  （渲染面：draw call / FPS 需瀏覽器 sandbox，本腳本不涵蓋。）
// ============================================================================
import { generate } from "../src/environment/placement/PlacementGenerator.js";
import { classifyDistance, LOD_PRESETS } from "../src/environment/placement/lodRings.js";
import { makeRng } from "../src/environment/placement/seededRandom.js";
import { TEST_CASES, ASSET_PLACEMENT, TEST_AREA } from "../src/debug/EnvironmentRuntime/testCases.js";

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.error("❌ " + msg); } };

// 1) 決定性：同 seed 兩次 → 深度相等
const cfg = { seed: "esmo-001:rock", count: 400, area: { x0: -30, z0: -30, x1: 30, z1: 30 }, minDist: 1.1, scale: [0.7, 1.4], rotate: true, color: { base: [0.44, 0.43, 0.41], vary: 0.06 } };
const a = generate(cfg), b = generate(cfg);
ok(JSON.stringify(a.transforms) === JSON.stringify(b.transforms), "同 seed 應產生完全相同 transforms");

// 2) 不同 seed → 不同
const c = generate({ ...cfg, seed: "esmo-002:rock" });
ok(JSON.stringify(a.transforms) !== JSON.stringify(c.transforms), "不同 seed 應產生不同 transforms");

// 3) 最小間距：任兩點距離 ≥ minDist（抽樣全檢，數量不大）
let minFound = Infinity;
for (let i = 0; i < a.transforms.length; i++) {
  for (let j = i + 1; j < a.transforms.length; j++) {
    const [x1, , z1] = a.transforms[i].pos, [x2, , z2] = a.transforms[j].pos;
    const d = Math.hypot(x1 - x2, z1 - z2);
    if (d < minFound) minFound = d;
  }
}
ok(minFound >= cfg.minDist - 1e-6, `最小間距應 ≥ ${cfg.minDist}，實得 ${minFound.toFixed(3)}`);

// 4) 縮放/顏色範圍
ok(a.transforms.every((t) => t.scale >= 0.7 - 1e-6 && t.scale <= 1.4 + 1e-6), "scale 應落在 [0.7,1.4]");
ok(a.transforms.every((t) => t.color && t.color.every((v) => v >= 0 && v <= 1)), "color 應在 [0,1]");

// 5) makeRng 決定性
const r1 = makeRng("x"), r2 = makeRng("x");
ok([r1(), r1(), r1()].join() === [r2(), r2(), r2()].join(), "makeRng 同 seed 序列一致");

// 6) LOD 分類邊界（desktop：0–35 / 35–70 / cull 70）
const ring = LOD_PRESETS.desktop;
ok(classifyDistance(10, ring) === "lod0", "10m 應 LOD0");
ok(classifyDistance(50, ring) === "lod1", "50m 應 LOD1");
ok(classifyDistance(80, ring) === "culled", "80m 應 culled");
ok(classifyDistance(80, ring, { cullOnly: true }) === "culled", "cullOnly 80m 應 culled");
ok(classifyDistance(20, ring, { cullOnly: true }) === "lod0", "cullOnly 20m 應 LOD0");

// 7) 泊松盤在密集需求下仍回報 placed（可能 < requested 但 >0）
const dense = generate({ ...cfg, count: 5000, minDist: 1.1 });
ok(dense.transforms.length > 0 && dense.stats.placed === dense.transforms.length, "高密度請求應回報實際 placed");

// 8) Benchmark 資料層：各 test case 的實例數應「不同且對應本案例」（不沿用上一案例）
function placedFor(tid, seed = "esmo-001") {
  const cs = TEST_CASES[tid].counts; const per = {}; let total = 0;
  for (const name of Object.keys(cs)) {
    const p = ASSET_PLACEMENT[name];
    const r = generate({ seed: `${seed}:${name}`, count: cs[name], area: TEST_AREA,
      minDist: p.minDist, scale: p.scale, rotate: true, color: p.color });
    per[name] = r.transforms.length; total += r.transforms.length;
  }
  return { total, per };
}
const pA = placedFor("A"), pB = placedFor("B"), pC = placedFor("C"), pD = placedFor("D");
ok(pA.per.rock >= 900, `A 應約 1000 石，實得 ${pA.per.rock}`);
ok(pC.per.grass >= 2500, `C 應約 3000 地被，實得 ${pC.per.grass}`);
ok(pB.total !== pC.total, `B(${pB.total}) 與 C(${pC.total}) 實例數應不同（不沿用上一案例）`);
ok(pD.total !== pC.total && pD.total !== pB.total, `D(${pD.total}) 應與 B/C 不同`);
// 同案例重算需一致（決定性 → benchmark 可重現）
ok(placedFor("C").total === pC.total, "同案例重算實例數應一致");

console.log(`\nEnvironment Runtime 純邏輯檢查：${pass} 通過、${fail} 失敗`);
process.exit(fail === 0 ? 0 : 1);
