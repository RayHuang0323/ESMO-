#!/usr/bin/env node
// ============================================================================
//  tools/measure_teamstrength_pricing_v1.mjs
//  Team Strength Pricing Calibration Assessment v1 — 量測工具
//
//  執行：`node tools/measure_teamstrength_pricing_v1.mjs [--seeds N]`
//
//  ── 這支要回答什麼 ───────────────────────────────────────────────────────
//  `teamStrength.v1` 是否足以當未來 Online 的 server-authoritative squad pricing？
//
//  三個實驗，全部 deterministic（固定 seed，可重跑逐值相同）：
//    A 靜態交叉表：每一項能力的**定價權重** vs **引擎影響力**
//    B 定價方向性：不同陣容 archetype 的 Δ定價 vs 真實勝率
//    C 免費戰力  ：定價**完全相同**（同 stats）但英雄熟練不同 ⇒ 勝率差
//
//  ⚠ 本輪是 Assessment，**不調任何平衡**。不改 COMBINE、不改 STAT_MAP、
//    不改引擎、不改 player stats。只量、只報。
//  ⚠ CS 無法在本輪量測（見輸出末段的 §4 說明）：CS 的真實對戰是
//    `EsportsFPS3D.jsx`（React + Three），無法在 Node headless 跑；
//    而 `simulateFixture` 用的就是 teamStrength 本身 ⇒ 拿它當基準是循環論證。
// ============================================================================
import { LogicEngine } from "../src/LogicEngine.js";
import { toEnginePlayerMods, STAT_MAP } from "../src/battle/moba/mobaPlayerStats.js";
import { teamStrength } from "../src/platform/competition/teamStrength.js";
import { STAT_DEF, MOBA_WEIGHTS, FPS_WEIGHTS, calcPower } from "../src/data/playerModel.js";

const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? Number(process.argv[i + 1]) : dflt;
};
const SEEDS_N = arg("--seeds", 9);
const SEEDS = [1, 2, 3, 7, 42, 99, 123, 777, 2024, 5555, 314, 271].slice(0, SEEDS_N);
const DT = 0.5, MAX_T = 1800;
const KEYS = STAT_DEF.map((s) => s.key);
const NEUTRAL = 70;
const r2 = (x) => Math.round(x * 100) / 100;
const pct = (x) => `${(x * 100).toFixed(1)}%`;

// ── 陣容建構 ──────────────────────────────────────────────────────────────
const flat = (v) => Object.fromEntries(KEYS.map((k) => [k, v]));
const withCat = (base, cat, v) => {
  const out = flat(base);
  for (const s of STAT_DEF) if (s.cat === cat) out[s.key] = v;
  return out;
};
/** 五名選手 → engine slots ＋ 可定價的 player 物件（同一份 stats，兩邊同源）。 */
const squad = (side, statsList) => statsList.map((stats, i) => ({
  id: side + (i + 1), stats,
  //  定價用的 player 形狀：中性士氣與狀態 ⇒ 定價不吃波動狀態（契約 I13 的方向）
  player: { id: side + (i + 1), stats, morale: NEUTRAL, condition: "正常" },
}));
const same = (side, stats) => squad(side, [stats, stats, stats, stats, stats]);

const CATS = [...new Set(STAT_DEF.map((s) => s.cat))];
const ARCHETYPES = {
  "平均 70": () => same("x", flat(70)),
  "平均 85": () => same("x", flat(85)),
  "平均 55": () => same("x", flat(55)),
  ...Object.fromEntries(CATS.map((c) => [`偏科 ${c} 90`, () => same("x", withCat(58, c, 90))])),
  "單一明星": () => squad("x", [flat(96), flat(60), flat(60), flat(60), flat(60)]),
  "三明星": () => squad("x", [flat(88), flat(88), flat(88), flat(52), flat(52)]),
  "高 synergy": () => same("x", { ...flat(70), synergy: 95 }),
  "低 synergy": () => same("x", { ...flat(70), synergy: 40 }),
};

const priceOf = (sq) => teamStrength(sq.map((s) => s.player), "moba");

/** 跑一場：blue vs red，回傳 winner。loadout 可選（英雄熟練 → power/tough）。 */
function playMatch(seed, blueSq, redSq, loadout = null) {
  const e = new LogicEngine(seed, loadout);
  const mods = toEnginePlayerMods({
    blue: blueSq.map((s) => ({ id: s.id, stats: s.stats })),
    red: redSq.map((s) => ({ id: s.id, stats: s.stats })),
  });
  if (mods) e.configurePlayers(mods);
  for (let t = DT; t <= MAX_T && !e.over; t += DT) e.tick(DT);
  return { winner: e.winner, over: e.over, bK: e.bK, rK: e.rK, minutes: e.t / 60 };
}

/** 單一 stats 物件 ⇒ 廣播成五名；已經是陣列就原樣用。 */
const five = (x) => (Array.isArray(x) ? x : [x, x, x, x, x]);

/**
 * A 隊對 B 隊的勝率。
 *
 * ⚠ **每個 seed 打兩場，A 各當一次藍方與紅方**，再合併。
 *   引擎為了打破鏡像局有刻意的兩側不對稱（見 LogicEngine constructor 註解），
 *   只讓受測隊固定當藍方，會把**側邊偏差**算成「定價誤差」。
 *   本檔第一版就是那樣寫的，量出來的「定價反向」有一半可能只是側邊偏差 ——
 *   換邊對打是唯一能把它消掉的做法。
 *
 * @param loadoutMult `[powerMult, toughMult]` —— 熟練加成掛在 **A 隊**身上，跟著 A 換邊
 */
function winRate(aStats, bStats, loadoutMult = null) {
  const A = five(aStats), B = five(bStats);
  let aWins = 0, done = 0, kA = 0, kB = 0, n = 0;
  const mkLo = (side) => (loadoutMult === null ? null : Object.fromEntries(
    [1, 2, 3, 4, 5].map((i) => [side + i, { powerMult: loadoutMult[0], toughMult: loadoutMult[1], level: 10 }]),
  ));
  for (const seed of SEEDS) {
    let m = playMatch(seed, squad("b", A), squad("r", B), mkLo("b"));   // A 當藍方
    n++; if (m.over) done++; if (m.winner === "blue") aWins++;
    kA += m.bK; kB += m.rK;
    m = playMatch(seed, squad("b", B), squad("r", A), mkLo("r"));       // A 當紅方
    n++; if (m.over) done++; if (m.winner === "red") aWins++;
    kA += m.rK; kB += m.bK;
  }
  return { rate: aWins / n, aWins, n, finished: done, avgKillDiff: r2((kA - kB) / n) };
}

/** 側邊偏差對照：兩側完全相同 ⇒ 理論上 50%。偏離越大，固定側量測越不可信。 */
function sideBias() {
  const S = five(flat(70));
  let blueWins = 0;
  for (const seed of SEEDS) {
    const m = playMatch(seed, squad("b", S), squad("r", S), null);
    if (m.winner === "blue") blueWins++;
  }
  return blueWins / SEEDS.length;
}

console.log("Team Strength Pricing Calibration Assessment v1");
console.log(`seeds = ${SEEDS.length}（${SEEDS.join(",")}）　DT = ${DT}　上限 ${MAX_T}s\n`);

// ══ §1 靜態交叉表：定價權重 vs 引擎影響力 ════════════════════════════════
console.log("══ §1 定價權重 vs 引擎影響力（靜態，MOBA）══");
//  引擎影響力 = 該能力在 STAT_MAP 所有作用點的絕對權重總和。
//  ⚠ 這是**相對量級**的比較，不是「1 點能力 = 多少勝率」——後者由 §2/§3 量。
const engineInfluence = {};
for (const key of KEYS) engineInfluence[key] = 0;
for (const [, map] of Object.entries(STAT_MAP)) {
  for (const [stat, w] of Object.entries(map ?? {})) {
    if (engineInfluence[stat] === undefined) engineInfluence[stat] = 0;
    engineInfluence[stat] += Math.abs(w);
  }
}
const priceSum = KEYS.reduce((s, k) => s + (MOBA_WEIGHTS[k] ?? 0), 0);
const infSum = KEYS.reduce((s, k) => s + engineInfluence[k], 0);
const rows = KEYS.map((k) => {
  const priceShare = (MOBA_WEIGHTS[k] ?? 0) / priceSum;
  const infShare = infSum > 0 ? engineInfluence[k] / infSum : 0;
  return { key: k, cat: STAT_DEF.find((s) => s.key === k)?.cat, priceShare, infShare, delta: priceShare - infShare };
}).sort((a, b) => a.delta - b.delta);
console.log("  能力            分類   定價佔比  引擎佔比   差（定價−引擎）");
for (const r of rows) {
  const flag = r.infShare === 0 ? "  ← 引擎完全不吃" : (Math.abs(r.delta) > 0.04 ? "  ←★" : "");
  console.log(`  ${r.key.padEnd(14)}${(r.cat ?? "").padEnd(6)} ${pct(r.priceShare).padStart(7)} ${pct(r.infShare).padStart(8)} ${(r.delta >= 0 ? "+" : "") + pct(r.delta).padStart(7)}${flag}`);
}
const overpriced = rows.filter((r) => r.delta > 0.03).map((r) => r.key);
const underpriced = rows.filter((r) => r.delta < -0.03).map((r) => r.key);
const notInEngine = rows.filter((r) => r.infShare === 0).map((r) => r.key);
console.log(`\n  定價過高（定價佔比 ≫ 引擎影響）：${overpriced.join(", ") || "無"}`);
console.log(`  定價過低（引擎影響 ≫ 定價佔比）：${underpriced.join(", ") || "無"}`);
console.log(`  引擎完全不吃但仍被定價：${notInEngine.join(", ") || "無"}`);

// ══ §2 定價方向性：Δ定價 vs 真實勝率 ═════════════════════════════════════
console.log("\n══ §2 定價方向性（vs 平均 70 基準）══");
const baseline = ARCHETYPES["平均 70"]();
const basePrice = priceOf(baseline);
const bias = sideBias();
console.log(`  基準「平均 70」定價 = ${basePrice}`);
console.log(`  側邊偏差對照（兩側完全相同）：藍方勝率 ${pct(bias)}`
  + `　⇒ ${Math.abs(bias - 0.5) > 0.2 ? "**側邊偏差顯著**（本表已用兩側各打一次消除）" : "側邊偏差不顯著"}\n`);
console.log("  陣容               定價   Δ定價   該隊勝率   收尾   平均擊殺差");
const dirRows = [];
for (const [name, build] of Object.entries(ARCHETYPES)) {
  if (name === "平均 70") continue;
  const sq = build();
  const price = priceOf(sq);
  const w = winRate(sq.map((s) => s.stats), baseline.map((s) => s.stats));
  dirRows.push({ name, price, dPrice: r2(price - basePrice), rate: w.rate, kd: w.avgKillDiff });
  console.log(`  ${name.padEnd(18)}${String(price).padStart(6)} ${String(r2(price - basePrice)).padStart(7)} ${pct(w.rate).padStart(8)} ${(w.finished + "/" + w.n).padStart(7)} ${String(w.avgKillDiff).padStart(9)}`);
}
//  方向一致性：Δ定價 > 0 應該對應勝率 > 50%
const priced = dirRows.filter((r) => Math.abs(r.dPrice) >= 0.5);
const agree = priced.filter((r) => (r.dPrice > 0) === (r.rate > 0.5));
console.log(`\n  方向一致（Δ定價明顯者 |Δ| ≥ 0.5）：${agree.length}/${priced.length}`);
for (const r of priced.filter((x) => !agree.includes(x))) {
  console.log(`    ✗ ${r.name}：Δ定價 ${r.dPrice >= 0 ? "+" : ""}${r.dPrice} 但勝率 ${pct(r.rate)}`);
}

// ══ §3 免費戰力：定價相同、英雄熟練不同 ══════════════════════════════════
console.log("\n══ §3 免費戰力（定價完全相同）══");
//  ⚠ 兩側 stats 逐值相同 ⇒ teamStrength 差 = 0。唯一差異是英雄熟練 loadout
//    （引擎 constructor 直接乘上 power / tough）。任何偏離 50% 的勝率
//    都是**定價看不到的戰力**。
const evenStats = flat(70);
console.log("  A 隊英雄熟練加成    Δ定價    A 勝率     平均擊殺差");
const freeRows = [];
for (const [label, pm, tm] of [["無（對照）", 1.0, 1.0], ["power ×1.10", 1.10, 1.0],
  ["power ×1.25", 1.25, 1.0], ["power+tough ×1.25", 1.25, 1.25]]) {
  const lo = (pm === 1 && tm === 1) ? null : [pm, tm];
  const w = winRate(evenStats, evenStats, lo);
  freeRows.push({ label, rate: w.rate, kd: w.avgKillDiff });
  console.log(`  ${label.padEnd(20)}${"0.00".padStart(6)} ${pct(w.rate).padStart(9)} ${String(w.avgKillDiff).padStart(11)}`);
}
const control = freeRows[0].rate;
const maxFree = Math.max(...freeRows.slice(1).map((r) => Math.abs(r.rate - control)));
console.log(`\n  Δ定價 = 0 但勝率最大偏移 = ${pct(maxFree)}　⇒ 免費戰力${maxFree > 0.15 ? "**顯著存在**" : "不顯著"}`);

// ══ §4 相同定價、不同組成 ════════════════════════════════════════════════
console.log("\n══ §4 相近定價、不同能力組成 ══");
const pairs = [];
const entries = Object.entries(ARCHETYPES).map(([n, b]) => ({ n, sq: b(), p: priceOf(b()) }));
for (let i = 0; i < entries.length; i++) {
  for (let j = i + 1; j < entries.length; j++) {
    if (Math.abs(entries[i].p - entries[j].p) <= 1.0) pairs.push([entries[i], entries[j]]);
  }
}
if (!pairs.length) console.log("  （沒有定價相近的組合）");
for (const [a, b] of pairs.slice(0, 4)) {
  const w = winRate(a.sq.map((s) => s.stats), b.sq.map((s) => s.stats));
  console.log(`  ${a.n}（${a.p}） vs ${b.n}（${b.p}）　Δ定價 ${r2(a.p - b.p)}　勝率 ${pct(w.rate)}　擊殺差 ${w.avgKillDiff}`);
}

// ══ §5 CS ════════════════════════════════════════════════════════════════
console.log("\n══ §5 CS ══");
console.log("  ⚠ 本輪**無法量測 CS 定價品質**，原因是結構性的：");
console.log("    · CS 真實對戰是 `src/battle/fps/EsportsFPS3D.jsx`（React + Three），");
console.log("      無法在 Node headless 執行；且它是 Codex-owned runtime，本輪禁止修改。");
console.log("    · `simulateFixture` 雖可在 Node 跑，但它的勝負**就是** teamStrength 推導的");
console.log("      ⇒ 拿它當基準是循環論證，量出來必然「完美相關」，沒有資訊量。");
console.log("  ⇒ CS_PRICING_QUALITY = UNKNOWN。要量它需要一個 headless CS 解算器，");
console.log("    那是獨立的一輪工作，且必須與 CS owner 協調。");
console.log(`\n  靜態可說的部分：CS 定價用 FPS_WEIGHTS，與 MOBA 權重不同`);
const wDiff = KEYS.filter((k) => (MOBA_WEIGHTS[k] ?? 0) !== (FPS_WEIGHTS[k] ?? 0));
console.log(`    兩模式權重不同的能力：${wDiff.length}/${KEYS.length}（${wDiff.slice(0, 6).join(", ")}…）`);
console.log(`    ⇒ 定價本身已經 mode-aware；未定價的向度才是 mode 差異的來源`);

// ══ 摘要 ═════════════════════════════════════════════════════════════════
console.log("\n══ 摘要 ══");
console.log(`  §1 引擎完全不吃卻被定價的能力：${notInEngine.length} 項（${notInEngine.join(", ") || "無"}）`);
console.log(`  §2 定價方向一致率：${agree.length}/${priced.length}`);
console.log(`  §3 Δ定價 = 0 的最大勝率偏移：${pct(maxFree)}`);
console.log(`  §5 CS：UNKNOWN（無 headless 解算器）`);
