//  由 raw sample 對「每場一個值」的欄位做真正的統計檢定。
//
//  為什麼需要：摘要只有每格平均，撤退／推塔／死亡／場長這些最關鍵的欄位
//  因此一直給不出信賴區間，先前所有關於它們的判定都只能停在「點估計方向」。
//
//  方法：
//    · 連續型（撤退、推塔、死亡、場長、等級…）→ Welch t 檢定（不假設等變異）
//      逐場值本身就是獨立樣本（不同 seed、藍紅鏡像各一場）。
//    · 比例型（勝率）→ 兩比例常態近似。
//    · **鏡像配對**：同一個 seed 的藍紅兩場共用隨機源，配對後可消掉一部分
//      場次間變異 ⇒ 另外附上配對 t 檢定（同 seed 的 40 與 90 相減）。
//
//  用法：node tools/analyze_sensitivity_raw.mjs <tag> [欄位,欄位,...]
//
//  ⚠ 只讀檔、不跑模擬、不改任何東西。

import fs from "fs";

const DIR = "review/moba-combat";
const TAG = process.argv[2];
if (!TAG) { console.error("用法：node tools/analyze_sensitivity_raw.mjs <tag> [fields]"); process.exit(1); }
const FIELDS = (process.argv[3] || "retreats,returns,towerPushes,splitPush,d,k,a,minutes,mlv,groupedFights,fightUptime,diveTry")
  .split(",").filter(Boolean);

const raw = JSON.parse(fs.readFileSync(`${DIR}/${TAG}.raw.json`, "utf8"));
const rows = raw.rows;
const stats = [...new Set(rows.map((r) => r.stat))].filter((s) => s !== "__baseline__");

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const varS = (a) => { const m = mean(a); return a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1); };

//  Welch t 檢定 + 95% CI（用常態近似取 1.96；n≈60 時與 t 分布差異 <3%）
function welch(a, b) {
  const ma = mean(a), mb = mean(b), va = varS(a), vb = varS(b);
  const se = Math.sqrt(va / a.length + vb / b.length);
  const d = mb - ma;
  return { d, se, lo: d - 1.96 * se, hi: d + 1.96 * se, sig: Math.abs(d) > 1.96 * se };
}

//  配對檢定：同 seed 同陣營的 90 場減 40 場
function paired(A, B, field) {
  const key = (r) => `${r.seed}|${r.side}`;
  const mapA = new Map(A.map((r) => [key(r), r]));
  const diffs = [];
  for (const rb of B) { const ra = mapA.get(key(rb)); if (ra) diffs.push((rb[field] ?? 0) - (ra[field] ?? 0)); }
  if (diffs.length < 3) return null;
  const m = mean(diffs), se = Math.sqrt(varS(diffs) / diffs.length);
  return { n: diffs.length, d: m, se, lo: m - 1.96 * se, hi: m + 1.96 * se, sig: Math.abs(m) > 1.96 * se };
}

const cell = (stat, v) => (v === 70
  ? rows.filter((r) => r.stat === "__baseline__")
  : rows.filter((r) => r.stat === stat && r.value === v));

console.log(`# raw 統計｜${TAG}｜情境 ${raw.scenario}｜${raw.seeds.length} seeds × 鏡像 = 每格 ${raw.matchesPerCell} 場`);
console.log(`# Welch = 獨立兩樣本；配對 = 同 seed 同陣營的 90 減 40（消掉場次間變異）`);

for (const stat of stats) {
  const A = cell(stat, 40), M = cell(stat, 70), B = cell(stat, 90);
  console.log(`\n## ${stat}`);
  console.log(`${"欄位".padEnd(15)}${"40".padStart(9)}${"70".padStart(9)}${"90".padStart(9)}${"Δ(90-40)".padStart(11)}${"Welch 95%CI".padStart(20)}  顯著  ${"配對 Δ [95%CI]".padStart(22)} 顯著`);
  for (const f of FIELDS) {
    if (!(f in (A[0] ?? {}))) continue;
    const va = A.map((r) => r[f] ?? 0), vm = M.map((r) => r[f] ?? 0), vb = B.map((r) => r[f] ?? 0);
    const w = welch(va, vb);
    const p = paired(A, B, f);
    console.log(
      f.padEnd(15) +
      mean(va).toFixed(3).padStart(9) + mean(vm).toFixed(3).padStart(9) + mean(vb).toFixed(3).padStart(9) +
      w.d.toFixed(3).padStart(11) +
      `[${w.lo.toFixed(3)}, ${w.hi.toFixed(3)}]`.padStart(20) +
      (w.sig ? "  ★  " : "  ·  ") +
      (p ? `${p.d.toFixed(3)} [${p.lo.toFixed(3)}, ${p.hi.toFixed(3)}]`.padStart(22) : "—".padStart(22)) +
      (p && p.sig ? "  ★" : "  ·"));
  }
  //  勝率：只算分出勝負的場次，兩比例常態近似
  const wr = (rs) => { const d = rs.filter((r) => r.decided); return { p: d.filter((r) => r.win).length / d.length, n: d.length }; };
  const wa = wr(A), wb = wr(B);
  const se = Math.sqrt(wa.p * (1 - wa.p) / wa.n + wb.p * (1 - wb.p) / wb.n);
  const dw = wb.p - wa.p;
  console.log(`${"winRate".padEnd(15)}${(wa.p * 100).toFixed(1).padStart(8)}%${(wr(M).p * 100).toFixed(1).padStart(8)}%${(wb.p * 100).toFixed(1).padStart(8)}%` +
    `${(dw * 100).toFixed(1).padStart(10)}pp` +
    `[${((dw - 1.96 * se) * 100).toFixed(1)}, ${((dw + 1.96 * se) * 100).toFixed(1)}]pp`.padStart(20) +
    (Math.abs(dw) > 1.96 * se ? "  ★" : "  ·"));
}
console.log(`\n★ = 95% CI 不含 0`);
