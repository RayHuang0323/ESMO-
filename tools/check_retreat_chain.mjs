#!/usr/bin/env node
//  撤退收益鏈專用 verifier —— 把「撤退 → 存活 → 再投入 → 推進」這條鏈
//  的健康度變成可執行的斷言。
//
//  背景：STAT_IMPACT_FINAL_R10.md §2 證明這條鏈斷掉——跨素質
//  r(Δ死亡, Δ推塔) = +0.87、r(Δ撤退, Δ推塔/作戰分) = −0.84，
//  也就是「少死換不回推進」。根因（RETREAT_CHAIN_FIX.md）：撤退只有一個終點＝泉水，
//  沒有「退到安全位置就地恢復」這一段，每次撤退都是整趟離場。
//
//  這支 verifier 用**固定 seed、決定性重跑**檢查修正後的生命週期性質。
//  它不驗「數值變好看」，驗的是**結構性質**：
//    §1 退守狀態真的存在且會被用到
//    §2 退守不是「原地無敵回血」——仍受安全距離與脫戰延遲管制
//    §3 撤退不再等於整趟回家
//    §4 高 decision / positioning 不再因為「更會撤退」而失去推進
//    §5 clutch 反向對照仍然保留原有差異
//    §6 決定性（同 seed 逐位元可重現）
//
//  用法：node tools/check_retreat_chain.mjs [--seeds=6]
//  ⚠ 這支會實跑模擬，seeds 越多越慢。預設 6 個 seed（12 場/格）約 2–3 分鐘。

import { LogicEngine } from "../src/LogicEngine.js";
import { toEnginePlayerMods } from "../src/battle/moba/mobaPlayerStats.js";
import { STAT_DEF } from "../src/data/playerModel.js";
import { FOUNTAIN } from "../src/gameData.js";

const argv = process.argv.slice(2);
const arg = (n, d) => { const h = argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const SEEDS_N = Number(arg("seeds", 6));
const SEEDS = [1, 2, 3, 7, 42, 99, 123, 777, 2024, 5555, 314, 271].slice(0, SEEDS_N);

const KEYS = STAT_DEF.map((s) => s.key);
const BLUE = ["b1", "b2", "b3", "b4", "b5"];
const RED = ["r1", "r2", "r3", "r4", "r5"];
const MAX_TICKS = 4200, DT = 0.5;
const statsWith = (key, v) => Object.fromEntries(KEYS.map((k) => [k, k === key ? v : 70]));
const spellsFor = (ids) =>
  Object.fromEntries(ids.map((id) => [id, (id === "b2" || id === "r2") ? ["flash", "smite"] : ["flash", "ignite"]]));
const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

let pass = 0, fail = 0;
const ok = (cond, msg, detail = "") => {
  if (cond) { pass++; console.log(`  ✓ ${msg}`); }
  else { fail++; console.log(`  ✗ ${msg}${detail ? `\n      ${detail}` : ""}`); }
};

/** 正式對局條件（逐鍵＝ toEngineTactic(STANDARD_OPP_TACTIC)）。 */
const STANDARD = (e) => ({ ...e._neutralKnobs(), joinFight: 0.6, dragonJoin: 0.65, baronJoin: 0.65,
  retreatAt: 0.25, splitPush: 0.1, splitLane: null, gankInterval: 45,
  invadeChance: 0.1, invadeWithMid: false, roamRate: 0.3 });

function run(seed, key, value, testSide) {
  const e = new LogicEngine(seed);
  const test = statsWith(key, value), base = statsWith(key, 70);
  e.configurePlayers(toEnginePlayerMods({
    blue: BLUE.map((id) => ({ id, stats: testSide === "blue" ? test : base })),
    red: RED.map((id) => ({ id, stats: testSide === "red" ? test : base })),
  }));
  e.configureHeroes({ blue: null, red: null, meta: null });
  e.configureSpells({ blue: spellsFor(BLUE), red: spellsFor(RED), meta: { version: "chk" } });
  const k = STANDARD(e);
  e.configureMatch({ blue: k, red: k, meta: { tacticId: "standard" } });

  const mine = e.players.filter((p) => p.side === testSide);
  const f = FOUNTAIN[testSide];
  let aliveT = 0, retreatT = 0, holdT = 0, holdRegenT = 0, homeIdleT = 0;
  let holdWhileEnemyNear = 0, holdWhileDamagedRecently = 0;
  const epsReachedFountain = []; let epsTotal = 0;
  const cur = new Map();

  for (let i = 0; i < MAX_TICKS && !e.over; i++) {
    e.tick(DT);
    for (const p of mine) {
      if (p.dead) { cur.delete(p.id); continue; }
      aliveT++;
      if (p.retreating) {
        retreatT++;
        if (p.retreatHolding) {
          holdT++;
          if (p.regenMode === "retreatHold") holdRegenT++;
          //  §2 安全性：退守中不得有敵人貼身（門檻用 retreatHoldSafeDist）
          if (e.players.some((q) => q.side !== p.side && !q.dead && d2(q.pos, p.pos) < 6)) holdWhileEnemyNear++;
          //  §2 脫戰延遲：剛被打就以退守速率回血 ⇒ 違反既有閘門。
          //  ⚠ `lastDamagedAt` 由 **tick 尾端**的統一比對點寫入（`LogicEngine.js:3919`），
          //     而回血速率在 tick 中段就決定了。本探針採樣在 `e.tick()` 回傳之後，
          //     所以「同一 tick 內先回血、後被打」會被看成 since === 0 的假違規——
          //     引擎當下用的是尚未被打的狀態，判斷是對的，下一 tick 就會自動改用
          //     交戰速率。因此只把 since > 0 的情況算違規。
          const since = e.t - (p.lastDamagedAt ?? -Infinity);
          if (p.regenMode === "retreatHold" && since > 0 && since < e.rules.regen.outOfCombatDelaySec) holdWhileDamagedRecently++;
        }
        if (!cur.has(p.id)) { cur.set(p.id, { reached: false }); epsTotal++; }
        if (d2(p.pos, f) < 12) cur.get(p.id).reached = true;
      } else {
        const c = cur.get(p.id);
        if (c) { epsReachedFountain.push(c.reached); cur.delete(p.id); }
        if (d2(p.pos, f) < 30) homeIdleT++;
      }
    }
  }
  const mineIdx = mine.map((p) => p.id);
  const sum = (f2) => mine.reduce((s, p) => s + (f2(p) ?? 0), 0);
  return {
    minutes: e.t / 60, over: e.over,
    aliveT, retreatT, holdT, holdRegenT, homeIdleT,
    holdWhileEnemyNear, holdWhileDamagedRecently,
    epsTotal, reachedFountainPct: epsReachedFountain.length
      ? (epsReachedFountain.filter(Boolean).length / epsReachedFountain.length) * 100 : null,
    towerPushes: e.exec?.[testSide]?.towerPushes ?? 0,
    deaths: sum((p) => p.d), kills: sum((p) => p.k),
    fightUptime: 1 - retreatT / aliveT,
    trueUptime: 1 - (retreatT + homeIdleT) / aliveT,
    mineIdx,
  };
}

/** 對一個素質跑 40/70/90 三格，回傳每格彙總。 */
function cells(key) {
  const out = {};
  for (const v of [40, 70, 90]) {
    const acc = { n: 0, towerPushes: 0, deaths: 0, kills: 0, minutes: 0, aliveT: 0, retreatT: 0,
      holdT: 0, holdRegenT: 0, homeIdleT: 0, epsTotal: 0, reached: 0, reachedN: 0,
      holdWhileEnemyNear: 0, holdWhileDamagedRecently: 0 };
    for (const seed of SEEDS) for (const side of ["blue", "red"]) {
      const r = run(seed, key, v, side);
      acc.n++; acc.towerPushes += r.towerPushes; acc.deaths += r.deaths; acc.kills += r.kills;
      acc.minutes += r.minutes; acc.aliveT += r.aliveT; acc.retreatT += r.retreatT;
      acc.holdT += r.holdT; acc.holdRegenT += r.holdRegenT; acc.homeIdleT += r.homeIdleT;
      acc.epsTotal += r.epsTotal;
      if (r.reachedFountainPct != null) { acc.reached += r.reachedFountainPct; acc.reachedN++; }
      acc.holdWhileEnemyNear += r.holdWhileEnemyNear;
      acc.holdWhileDamagedRecently += r.holdWhileDamagedRecently;
    }
    const activeMin = (acc.minutes / acc.n) * (1 - acc.retreatT / acc.aliveT);
    out[v] = {
      push: acc.towerPushes / acc.n,
      pushPerActiveMin: (acc.towerPushes / acc.n) / activeMin,
      deaths: acc.deaths / acc.n, kills: acc.kills / acc.n,
      minutes: acc.minutes / acc.n,
      retreatPct: (acc.retreatT / acc.aliveT) * 100,
      holdPct: (acc.holdT / acc.aliveT) * 100,
      holdRegenPct: (acc.holdRegenT / acc.aliveT) * 100,
      homeIdlePct: (acc.homeIdleT / acc.aliveT) * 100,
      reachedFountainPct: acc.reachedN ? acc.reached / acc.reachedN : null,
      holdWhileEnemyNear: acc.holdWhileEnemyNear,
      holdWhileDamagedRecently: acc.holdWhileDamagedRecently,
    };
  }
  return out;
}

console.log(`# check_retreat_chain｜${SEEDS.length} seeds × 藍紅鏡像 = 每格 ${SEEDS.length * 2} 場｜情境 standard\n`);

//  ⚠ Retreat Hold 目前預設關閉（見 matchProgression.js 的說明與
//  RETREAT_CHAIN_FIX.md）。關閉時 §1–§4 的斷言在定義上不可能通過——
//  退守狀態根本不存在。這時輸出「基準診斷」而不是一堆假的紅燈：
//  數字仍然照跑，讓這支在 flag 關閉時也能當回歸偵測用（數字變了就是有人動到撤退）。
const HOLD_ON = !!(new LogicEngine(1).rules.retreatHoldV1);
if (!HOLD_ON) {
  console.log("⚠ retreatHoldV1 = false（預設關閉）⇒ 只輸出基準診斷，不做 §1–§4 斷言。");
  console.log("  要驗證修正版行為：把 matchProgression.js 的 retreatHoldV1 設為 true 再跑這支。\n");
}

const D = cells("decision");
const P = cells("positioning");
const C = cells("clutch");
const show = (n, c) => console.log(
  `  ${n.padEnd(12)} 推塔 ${c.push.toFixed(2).padStart(6)}｜推塔/作戰分 ${c.pushPerActiveMin.toFixed(3)}｜死亡 ${c.deaths.toFixed(2).padStart(5)}` +
  `｜撤退時間 ${c.retreatPct.toFixed(1)}%｜退守 ${c.holdPct.toFixed(1)}%｜回泉水 ${c.reachedFountainPct?.toFixed(1) ?? "—"}%`);

console.log("## 量測（decision）"); for (const v of [40, 70, 90]) show(`decision ${v}`, D[v]);
console.log("## 量測（positioning）"); for (const v of [40, 70, 90]) show(`positioning ${v}`, P[v]);
console.log("## 量測（clutch）"); for (const v of [40, 70, 90]) show(`clutch ${v}`, C[v]);

if (!HOLD_ON) {
  console.log("\n⇒ 基準診斷完成（retreatHoldV1 關閉，未做斷言）。");
  process.exit(0);
}

console.log("\n## §1 退守狀態存在且會被用到");
ok(D[90].holdPct > 2, `高 decision 有可觀的退守時間（${D[90].holdPct.toFixed(1)}% > 2%）`);
ok(D[90].holdRegenPct > 0.5, `退守恢復速率真的有套用到（${D[90].holdRegenPct.toFixed(1)}% > 0.5%）`);
ok(P[90].holdPct > 2, `高 positioning 有可觀的退守時間（${P[90].holdPct.toFixed(1)}% > 2%）`);

console.log("\n## §2 退守不是「原地無敵回血」");
ok(D[90].holdWhileDamagedRecently === 0,
  `退守恢復仍受脫戰 7 秒延遲管制（違規 tick = ${D[90].holdWhileDamagedRecently}）`);
ok(C[90].holdWhileDamagedRecently === 0,
  `clutch 同上（違規 tick = ${C[90].holdWhileDamagedRecently}）`);
ok(D[90].holdWhileEnemyNear === 0,
  `退守時不會有敵人貼身到 6 單位內（違規 tick = ${D[90].holdWhileEnemyNear}）`,
  "退守位置的安全檢查（retreatHoldSafeDist）失效");

console.log("\n## §3 撤退不再等於整趟回家");
ok(D[90].reachedFountainPct < 60,
  `高 decision 撤退回到泉水的比例 < 60%（實測 ${D[90].reachedFountainPct.toFixed(1)}%；修正前 95.7%）`);
ok(D[90].homeIdlePct < D[40].homeIdlePct + 2,
  `高 decision 待在自家後場的時間沒有更長（${D[90].homeIdlePct.toFixed(1)}% vs ${D[40].homeIdlePct.toFixed(1)}%）`);

console.log("\n## §4 高 decision / positioning 不再因「更會撤退」失去推進");
//  核心斷言：推塔/作戰分不得隨能力顯著下降。門檻取 −5%（修正前 decision −10.6%、positioning −9.7%）。
const dPushEff = (D[90].pushPerActiveMin - D[40].pushPerActiveMin) / D[40].pushPerActiveMin * 100;
const pPushEff = (P[90].pushPerActiveMin - P[40].pushPerActiveMin) / P[40].pushPerActiveMin * 100;
ok(dPushEff > -5, `decision 推塔/作戰分 Δ(90−40) > −5%（實測 ${dPushEff.toFixed(1)}%；修正前 −10.6%）`);
ok(pPushEff > -5, `positioning 推塔/作戰分 Δ(90−40) > −5%（實測 ${pPushEff.toFixed(1)}%；修正前 −9.7%）`);
const dPush = (D[90].push - D[40].push) / D[40].push * 100;
const pPush = (P[90].push - P[40].push) / P[40].push * 100;
ok(dPush > -6, `decision 推塔絕對值 Δ(90−40) > −6%（實測 ${dPush.toFixed(1)}%；修正前 −10.8%）`);
ok(pPush > -6, `positioning 推塔絕對值 Δ(90−40) > −6%（實測 ${pPush.toFixed(1)}%；修正前 −11.2%）`);
ok(D[90].deaths <= D[40].deaths,
  `decision 高分死亡沒有惡化（${D[90].deaths.toFixed(2)} ≤ ${D[40].deaths.toFixed(2)}）`);
ok(P[90].deaths <= P[40].deaths,
  `positioning 高分死亡沒有惡化（${P[90].deaths.toFixed(2)} ≤ ${P[40].deaths.toFixed(2)}）`);

console.log("\n## §5 clutch 反向對照仍保留原有差異");
ok(C[90].deaths > C[40].deaths,
  `clutch 高分仍然死更多（${C[90].deaths.toFixed(2)} > ${C[40].deaths.toFixed(2)}）——硬撐的代價還在`);
ok(C[90].retreatPct < C[40].retreatPct,
  `clutch 高分仍然撤退時間較少（${C[90].retreatPct.toFixed(1)}% < ${C[40].retreatPct.toFixed(1)}%）`);

console.log("\n## §6 決定性");
const a = run(SEEDS[0], "decision", 90, "blue");
const b = run(SEEDS[0], "decision", 90, "blue");
const same = ["minutes", "towerPushes", "deaths", "kills", "aliveT", "retreatT", "holdT", "holdRegenT"]
  .every((k) => Object.is(a[k], b[k]));
ok(same, "同 seed 重跑逐欄位相同", JSON.stringify({ a: { m: a.minutes, p: a.towerPushes }, b: { m: b.minutes, p: b.towerPushes } }));

console.log(`\n${fail === 0 ? "PASS" : "FAIL"}  ${pass} 通過 / ${fail} 失敗`);
process.exit(fail === 0 ? 0 : 1);
