// ============================================================================
//  tools/bench_moba_baseline.mjs — 模擬結果分布基準線（Milestone H.2）
//
//  【為什麼需要這一支】H.2 要把英雄碰撞從 `gameData.WALLS`（28 個手寫圓）換成
//  `mapPassability` 的格點距離場。那會**真的改變英雄走的路線** ⇒ 時長、破塔數、
//  擊殺數的分布一定會動。使用者已同意（方案 A：以公平性為準、允許分布改變），
//  但要求「修改前先保存並記錄基準，修改後重跑足夠 seeds 比較前後差異」。
//
//  這支就是那個基準：跑固定的一組 seeds，輸出
//    勝率（藍/紅）、平均時長、**中位時長**、擊殺數、破塔數、結束率
//  以及公平性指標（陣列順序是否影響勝負、藍紅是否鏡像對稱）。
//
//  用法：
//    node tools/bench_moba_baseline.mjs                    # 跑並印出
//    node tools/bench_moba_baseline.mjs --out review/moba-runtime/h2/baseline.json
//    node tools/bench_moba_baseline.mjs --seeds 60         # 加大樣本
//    node tools/bench_moba_baseline.mjs --compare a.json   # 與先前基準對照
//
//  ⚠ 只讀引擎、不改任何模擬常數。零 Math.random（seed 由 LogicEngine 自帶的 rng 決定）。
// ============================================================================
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NEXUS_HP } from "../src/gameData.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, "..");
const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};

const DT = 0.5;
//  ⚠ 30 分鐘是**遊戲設計上限**（sudden death 之後仍未結束就算未分出）。
//  但診斷「比賽是真的膠著，還是只是被上限截斷」時要放寬，否則勝率會被 censoring 汙染
//  ⇒ `--maxt 2700` 可放到 45 分鐘。判定 H.2 是否公平時務必兩種都看。
const MAX_T = Number(arg("--maxt", "1800"));
const SEED_COUNT = Number(arg("--seeds", "40"));
const ENGINE = arg("--engine", "../src/LogicEngine.js");
const OUT = arg("--out", "");
const COMPARE = arg("--compare", "");

const { LogicEngine } = await import(ENGINE);

/** 固定 seed 序列（不用 Math.random ⇒ 前後兩次跑的是同一組對局）。 */
const seedsOf = (n) => {
  const base = [1, 2, 3, 7, 42, 99, 123, 777, 2024, 5555, 314, 271, 1618, 8080, 4242];
  const out = base.slice(0, Math.min(n, base.length));
  //  超過內建清單就用確定性遞推補齊（不是亂數）
  let s = 90210;
  while (out.length < n) { s = (s * 1103515245 + 12345) % 2147483648; out.push(s % 100000); }
  return out;
};

const median = (a) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

/**
 * 跑一場。
 * @param reverse 反轉 players 陣列順序（公平性檢定：順序不得決定勝負）
 */
function runOne(seed, { reverse = false } = {}) {
  const e = new LogicEngine(seed);
  if (reverse) e.players.reverse();
  let minNexus = NEXUS_HP;
  for (let t = DT; t <= MAX_T && !e.over; t += DT) {
    e.tick(DT);
    minNexus = Math.min(minNexus, e.towers.blue_nexus.hp, e.towers.red_nexus.hp);
  }
  const towersBroke = Object.values(e.towers).filter((t) => t.lane !== "nexus" && t.hp <= 0).length;
  return {
    seed,
    over: !!e.over,
    winner: e.winner ?? null,
    minutes: e.t / 60,
    kills: e.bK + e.rK,
    blueKills: e.bK,
    redKills: e.rK,
    towersBroke,
    minNexus,
  };
}

const seeds = seedsOf(SEED_COUNT);
const rows = seeds.map((s) => runOne(s));
const rev = seeds.map((s) => runOne(s, { reverse: true }));

const blueWins = rows.filter((r) => r.winner === "blue").length;
const redWins = rows.filter((r) => r.winner === "red").length;
const blueWinsRev = rev.filter((r) => r.winner === "blue").length;

const summary = {
  generatedAt: new Date().toISOString(),
  engine: ENGINE,
  seeds: seeds.length,
  dt: DT,
  finishRate: `${rows.filter((r) => r.over).length}/${rows.length}`,
  finishedCount: rows.filter((r) => r.over).length,
  //  ── 使用者指定要記錄的五項 ──────────────────────────────────
  winRate: {
    bluePct: +((blueWins / rows.length) * 100).toFixed(1),
    redPct: +((redWins / rows.length) * 100).toFixed(1),
    blue: blueWins, red: redWins, draw: rows.length - blueWins - redWins,
  },
  durationMin: {
    mean: +mean(rows.map((r) => r.minutes)).toFixed(2),
    median: +median(rows.map((r) => r.minutes)).toFixed(2),
    min: +Math.min(...rows.map((r) => r.minutes)).toFixed(2),
    max: +Math.max(...rows.map((r) => r.minutes)).toFixed(2),
  },
  kills: {
    mean: +mean(rows.map((r) => r.kills)).toFixed(2),
    median: +median(rows.map((r) => r.kills)).toFixed(2),
    zeroKillGames: rows.filter((r) => r.kills === 0).length,
  },
  towersBroke: {
    mean: +mean(rows.map((r) => r.towersBroke)).toFixed(2),
    median: +median(rows.map((r) => r.towersBroke)).toFixed(2),
  },
  //  ── 公平性（方案 A 的守門條件；分布可以變，這幾項不可以）────────
  fairness: {
    //  藍方勝率必須落在合理區間
    blueWinPct: +((blueWins / rows.length) * 100).toFixed(1),
    //  反轉 players 陣列順序後的藍方勝率：與正序的差距就是「順序偏差」
    blueWinPctReversed: +((blueWinsRev / rev.length) * 100).toFixed(1),
    orderBiasPp: +Math.abs((blueWins / rows.length) * 100 - (blueWinsRev / rev.length) * 100).toFixed(1),
  },
  rows,
};

console.log(`\n=== MOBA 結果分布基準（${seeds.length} seeds, engine=${ENGINE}）===`);
console.log(`結束率      ${summary.finishRate}`);
console.log(`勝率        藍 ${summary.winRate.bluePct}% / 紅 ${summary.winRate.redPct}%（未分出 ${summary.winRate.draw}）`);
console.log(`時長(分)    平均 ${summary.durationMin.mean}｜中位 ${summary.durationMin.median}｜範圍 ${summary.durationMin.min}–${summary.durationMin.max}`);
console.log(`擊殺數      平均 ${summary.kills.mean}｜中位 ${summary.kills.median}｜0 殺場 ${summary.kills.zeroKillGames}`);
console.log(`破塔數      平均 ${summary.towersBroke.mean}｜中位 ${summary.towersBroke.median}（滿 12）`);
console.log(`公平性      藍勝 正序 ${summary.fairness.blueWinPct}% / 反序 ${summary.fairness.blueWinPctReversed}% ⇒ 順序偏差 ${summary.fairness.orderBiasPp}pp`);

if (COMPARE && existsSync(resolve(ROOT, COMPARE))) {
  const before = JSON.parse(readFileSync(resolve(ROOT, COMPARE), "utf8"));
  const d = (a, b) => { const v = b - a; return `${v >= 0 ? "+" : ""}${v.toFixed(2)}`; };
  console.log(`\n=== 與 ${COMPARE} 對照（前 → 後）===`);
  console.log(`勝率(藍)    ${before.winRate.bluePct}% → ${summary.winRate.bluePct}%   (${d(before.winRate.bluePct, summary.winRate.bluePct)}pp)`);
  console.log(`平均時長    ${before.durationMin.mean} → ${summary.durationMin.mean} 分 (${d(before.durationMin.mean, summary.durationMin.mean)})`);
  console.log(`中位時長    ${before.durationMin.median} → ${summary.durationMin.median} 分 (${d(before.durationMin.median, summary.durationMin.median)})`);
  console.log(`平均擊殺    ${before.kills.mean} → ${summary.kills.mean} (${d(before.kills.mean, summary.kills.mean)})`);
  console.log(`平均破塔    ${before.towersBroke.mean} → ${summary.towersBroke.mean} (${d(before.towersBroke.mean, summary.towersBroke.mean)})`);
  console.log(`結束率      ${before.finishRate} → ${summary.finishRate}`);
  console.log(`順序偏差    ${before.fairness.orderBiasPp}pp → ${summary.fairness.orderBiasPp}pp`);
}

if (OUT) {
  const p = resolve(ROOT, OUT);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(summary, null, 2), "utf8");
  console.log(`\n已寫入 ${OUT}`);
}
