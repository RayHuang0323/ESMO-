#!/usr/bin/env node
// ============================================================================
//  tools/careerstage_calibration.mjs — V4 生涯階段的量測工具（**不是 verifier**）
//
//  執行：`node tools/careerstage_calibration.mjs`
//
//  ── 這支在回答什麼 ───────────────────────────────────────────────────────
//  V4 要把「生涯階段」從 placeholder 變成真的值。使用者的要求是：
//    · 以 age 為主要依據
//    · 但**不要硬切成固定年齡模板**——早熟／晚熟要有不同節奏
//    · 一次訓練不得跳過多個階段
//
//  問題是「早熟／晚熟」**沒有存在選手身上**：`PROSPECT_TWISTS` 是生成時套用的
//  delta（core / room / age / learning），簽約後就只剩下結果。
//  ⇒ 所以偏移必須讀**選手現在實際走到哪**，而不是他出生時的標籤。
//
//  本檔量測候選訊號 `maturity = 主能力平均 / 潛力`：
//    ① 它 runtime 算得出來（只要 stats + potential，不需要歷史快照）
//    ② `careerSim.closureOf` 的註解警告過它「一入行就有 70%+」——
//       那個警告是針對**成長量測**的（看不出成長）。對**生涯位置**它反而正好，
//       但**鑑別力到底夠不夠，要量過才知道**，不能用猜的。
//
//  ⚠ 這支**不進 CI、不是 gate**。它的輸出是拿來訂常數的證據。
// ============================================================================
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import * as sim from "./lib/careerSim.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const W = await sim.loadWorld(ROOT);

const r2 = (v) => Math.round(v * 100) / 100;
const pct = (v) => `${Math.round(v * 100)}%`;
const quantile = (arr, q) => {
  if (!arr.length) return NaN;
  const s = [...arr].sort((a, b) => a - b);
  const i = (s.length - 1) * q;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (i - lo);
};

/** runtime 也算得出來的成熟度：主能力平均 / 潛力。 */
const maturityOf = (p) => {
  const pot = Number(p?.potential);
  if (!Number.isFinite(pot) || pot <= 0) return 0;
  return Math.min(1, Math.max(0, sim.mainAvgOf(W, p) / pot));
};

console.log("══ V4 生涯階段 calibration ══\n");

// ════════════════════════════════════════════════════════════════════════════
//  §1 入行當下：maturity 有沒有鑑別力
// ════════════════════════════════════════════════════════════════════════════
const pool = sim.prospectPool(W);
console.log(`【§1 新秀池入行當下】樣本 ${pool.length} 名`);

const atSign = pool.map((p) => ({
  age: p.age,
  maturity: maturityOf(p),
  room: p.potential - sim.mainAvgOf(W, p),
  learning: p.stats?.learning ?? 50,
}));

console.log(`  maturity 分佈：p10 ${r2(quantile(atSign.map((x) => x.maturity), 0.1))}`
  + ` / 中位 ${r2(quantile(atSign.map((x) => x.maturity), 0.5))}`
  + ` / p90 ${r2(quantile(atSign.map((x) => x.maturity), 0.9))}`);
console.log(`  年齡分佈：p10 ${quantile(atSign.map((x) => x.age), 0.1)}`
  + ` / 中位 ${quantile(atSign.map((x) => x.age), 0.5)}`
  + ` / p90 ${quantile(atSign.map((x) => x.age), 0.9)}`);

//  ⚠ 早熟 = 同齡中 maturity 高（core +10 / room −6）；晚熟 = 同齡中 maturity 低。
//    池子裡沒有標籤，所以用「同齡分位」還原這兩端。
console.log("\n  同齡分位（還原早熟／晚熟兩端）：");
console.log("  age   n    maturity p10 / 中位 / p90    兩端差距");
for (let age = 15; age <= 24; age++) {
  const g = atSign.filter((x) => x.age === age).map((x) => x.maturity);
  if (g.length < 5) continue;
  const lo = quantile(g, 0.1), mid = quantile(g, 0.5), hi = quantile(g, 0.9);
  console.log(`  ${String(age).padStart(3)} ${String(g.length).padStart(4)}    `
    + `${r2(lo)} / ${r2(mid)} / ${r2(hi)}          ${r2(hi - lo)}`);
}

// ════════════════════════════════════════════════════════════════════════════
//  §2 生涯軌跡：maturity 隨年齡怎麼走
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§2 生涯軌跡】12 年，正常玩法（trainRatio 0.6、勝率 0.5）");
const SAMPLE = 48;
const sample = pool.filter((_, i) => i % Math.max(1, Math.floor(pool.length / SAMPLE)) === 0).slice(0, SAMPLE);

const byAge = new Map();
const track = (age, m) => {
  if (!byAge.has(age)) byAge.set(age, []);
  byAge.get(age).push(m);
};

for (const p0 of sample) {
  track(p0.age, maturityOf(p0));
  let p = { ...p0, stats: { ...p0.stats } };
  for (let y = 1; y <= 12; y++) {
    const s = sim.simulateYear(W, p, { winRate: 0.5, trainRatio: 0.6, competitive: 8 });
    p = { ...s.player, age: (p.age ?? 20) + 1 };
    track(p.age, maturityOf(p));
  }
}

console.log("  age   n    maturity p10 / 中位 / p90");
const ages = [...byAge.keys()].sort((a, b) => a - b);
for (const age of ages) {
  const g = byAge.get(age);
  if (g.length < 4) continue;
  console.log(`  ${String(age).padStart(3)} ${String(g.length).padStart(4)}    `
    + `${r2(quantile(g, 0.1))} / ${r2(quantile(g, 0.5))} / ${r2(quantile(g, 0.9))}`);
}

// ════════════════════════════════════════════════════════════════════════════
//  §3 偏移量該多大
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§3 偏移量】effectiveAge = age + K × (maturity − 同齡期望值)");

//  ⚠ §2 顯示 maturity **在 24 歲之後就飽和了**（p10–p90 只剩 0.05）。
//    所以「全樣本中位數」當中性點是錯的——那會讓 15 歲的人一律吃到滿格負偏移。
//    正確做法是與**同齡期望值**比，殘差自然在青年期大、在成熟期趨近 0
//    ⇒ 偏移會**自己淡出**，不需要為老將特別寫規則。
const expected = new Map();
for (const age of ages) {
  const g = byAge.get(age);
  if (g.length >= 4) expected.set(age, quantile(g, 0.5));
}
console.log("  同齡期望 maturity（取中位，之後要寫進常數表）：");
console.log("  " + [...expected.entries()].map(([a, m]) => `${a}:${r2(m)}`).join("  "));

//  殘差 = maturity − 同齡期望值
const resid = new Map();
for (const [age, g] of byAge) {
  if (!expected.has(age) || g.length < 8) continue;
  resid.set(age, g.map((m) => m - expected.get(age)));
}
console.log("\n  殘差分佈（負=同齡中偏晚熟，正=偏早熟）：");
console.log("  age    p10 / p90      跨度");
for (const age of [...resid.keys()].sort((a, b) => a - b)) {
  const r = resid.get(age);
  const lo = quantile(r, 0.1), hi = quantile(r, 0.9);
  console.log(`  ${String(age).padStart(3)}   ${String(r2(lo)).padStart(5)} / ${String(r2(hi)).padStart(5)}    ${r2(hi - lo)}`);
}

//  K 用**青年期**（≤21 歲，鑑別力最大的區段）的殘差跨度來訂
const youngResid = [...resid.entries()].filter(([a]) => a <= 21).flatMap(([, r]) => r);
const youngSpread = quantile(youngResid, 0.9) - quantile(youngResid, 0.1);
console.log(`\n  青年期（≤21）殘差跨度 = ${r2(youngSpread)}`);
const KS = [1.5, 2, 2.5, 3].map((t) => [t, youngSpread > 0 ? (2 * t) / youngSpread : 0]);
for (const [t, K] of KS) console.log(`  想讓青年期兩端相差 ±${t} 年 ⇒ K ≈ ${r2(K)}`);

// ════════════════════════════════════════════════════════════════════════════
//  §4 單次訓練會讓 effectiveAge 動多少（防「一次訓練跳兩階」）
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§4 單次課程的衝擊】");
{
  //  ⚠ 課程在 `playerModel.TRAINING_COURSES` / `applyCourse`，不在 trainingCalculator。
  //    用**真的新秀**當樣本，不要用合成選手——合成選手 16 項全同值，
  //    會落在課程加成的邊界上，量到的結果沒有代表性。
  const courses = W.playerModel.TRAINING_COURSES.filter((c) => c.id !== "rest");
  let worst = 0, worstAt = null;
  for (const p0 of sample.slice(0, 24)) {
    const before = maturityOf(p0);
    for (const c of courses) {
      const after = maturityOf(W.playerModel.applyCourse(p0, c.id));
      const d = Math.abs(after - before);
      if (d > worst) { worst = d; worstAt = `${p0.age} 歲 / 潛力 ${p0.potential} / ${c.id}`; }
    }
  }
  console.log(`  最大單次課程 Δmaturity = ${r2(worst)}　（${worstAt}）`);
  for (const [t, K] of KS) {
    console.log(`  K ≈ ${r2(K)}（±${t} 年）⇒ 單次課程最多讓 effectiveAge 動 ${r2(worst * K)} 年`);
  }
  console.log("  ⇒ 只要**最窄的階段區間 > 這個數字**，一次訓練就不可能跳過一整階。");
}

// ════════════════════════════════════════════════════════════════════════════
//  §5 市場價值：年齡折舊該從幾歲開始
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§5 市場價值】年齡折舊的錨點");
console.log("  ageEfficiency（既有，成長效率）：");
for (const a of [18, 20, 22, 24, 26, 28, 30, 32, 34, 36]) {
  console.log(`    ${String(a).padStart(2)} 歲  ${W.training.ageEfficiency(a)}`);
}
console.log("  ⇒ 29 歲是既有曲線的轉折點（0.98 → 0.87 陡降起點）。");
console.log("  ⇒ 折舊若以既有轉折點為錨，資產價值與成長效率會說同一個故事，不會各講各的。");

console.log("\n══ 以上為訂常數的證據，本檔不進 CI ══");
