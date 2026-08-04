#!/usr/bin/env node
// ============================================================================
//  tools/check_condition_o2.mjs — Milestone O2：出賽與養成回饋閉環
//
//  執行：repo 根目錄 `node tools/check_condition_o2.mjs`；**失敗時 exit 1**。
//
//  驗的是這個閉環的五個要害：
//    ① **只有實際出賽的選手**拿到經驗與損耗；替補／未登錄一律零
//    ② MOBA 與 CS 都依實際陣容的 playerId 回寫
//    ③ 連續出賽有代價（體力遞減加速、受傷風險上升），休息／訓練可恢復
//    ④ 體力過低或傷停 ⇒ 出賽閘門擋下並說明理由
//    ⑤ 成長與受傷**完全決定性** ⇒ 伺服器可獨立重算，不必信任前端提交的數值
// ============================================================================
import {
  CONDITION, conditionText, deterministicRoll, applyMatchWear, applyDailyRecovery,
  matchFitness, isMatchFit, conditionSummary,
} from "../src/platform/condition/playerCondition.js";
import { applyProgressToState } from "../src/platform/progress/applyMatchProgress.js";
import { createMatchProgressTransaction } from "../src/platform/contracts/matchProgressTransaction.js";
import { mobaResultToTransaction } from "../src/platform/progress/adapters/mobaProgressAdapter.js";
import { csResultToTransaction } from "../src/platform/progress/adapters/csProgressAdapter.js";
import { validateSquad, autoFillSquad } from "../src/platform/contracts/matchSquad.js";
import { ENGINE_SEATS } from "../src/platform/contracts/matchLineup.js";
import { levelFromTotalXp } from "../src/platform/progress/playerLevel.js";

let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`✅ ${name}${detail ? "　" + detail : ""}`); }
  else { fail++; console.log(`❌ ${name}${detail ? "　" + detail : ""}`); }
};

const statsAll = (v) => Object.fromEntries(
  ["reflex", "accuracy", "apm", "positioning", "mapAware", "tacticalIQ", "decision", "adaptability",
    "courage", "clutch", "focus", "resilience", "comms", "leadership", "synergy", "learning"].map((k) => [k, v]));
const mkPlayer = (id, role, over = {}) => ({
  id, name: `P-${id}`, role, lv: 5, xp: 200, energy: 100, morale: 80,
  personality: "steady", condition: "精神飽滿", stats: statsAll(70), rosterTier: "active", ...over,
});
const LANES = ["上路", "打野", "中路", "下路", "輔助"];
const STARTERS = LANES.map((lane, i) => mkPlayer(`s${i + 1}`, lane));
const BENCH = [mkPlayer("b1x", "中路", { rosterTier: "bench" }), mkPlayer("u1x", "上路", { rosterTier: "unlisted" })];
const ALL = [...STARTERS, ...BENCH];
const LINEUP = Object.fromEntries(ENGINE_SEATS.map((s, i) => [s, STARTERS[i].id]));
const mkState = (over = {}) => ({
  meta: { days: 1, week: 1, season: 1, fans: 1000, reputation: 40 },
  finance: { funds: 1_000_000, transactions: [] },
  players: ALL.map((p) => ({ ...p })),
  economy: { settledWeeks: {}, lastSettledWeek: 0, scenario: "standard", formLog: [] },
  processedMatchTransactions: {},
  ...over,
});
const mkBattleResult = (matchId) => ({
  schema: "BattleResult.v2", winner: "blue", durationSec: 1500, mvpId: "b1", matchId,
  players: [...ENGINE_SEATS.map((s) => ({ id: s, side: "blue", k: 5, d: 2, a: 7, rating: 6.5, participation: 0.6, gold: 10000, dmg: 20000 })),
    { id: "r1", side: "red", k: 3, d: 5, a: 4, rating: 5, participation: 0.5, gold: 8000, dmg: 15000 }],
});

console.log("══ Milestone O2：出賽與養成回饋 ══\n");

// ── 1) 只有實際出賽的人拿到經驗與損耗 ───────────────────────────────────
{
  const st = mkState();
  const tx = mobaResultToTransaction(mkBattleResult("m-1"), { players: ALL, lineup: LINEUP });
  const { nextState, receipt } = applyProgressToState(st, tx);
  const byId = new Map(nextState.players.map((p) => [p.id, p]));

  ck("1) 五名先發都拿到經驗",
    STARTERS.every((p) => byId.get(p.id).xp > 200), receipt.players.map((r) => r.xpGained).join("/"));
  ck("1b) 替補沒有拿到任何經驗",
    byId.get("b1x").xp === 200 && byId.get("b1x").lv === 5);
  ck("1c) 未登錄選手沒有拿到任何經驗",
    byId.get("u1x").xp === 200);
  ck("1d) 替補與未登錄的體力完全沒動（不誤吃出賽損耗）",
    byId.get("b1x").energy === 100 && byId.get("u1x").energy === 100 &&
    (byId.get("b1x").matchStreak ?? 0) === 0);
  ck("1e) 先發的體力有下降且狀態文字同步",
    STARTERS.every((p) => byId.get(p.id).energy < 100 &&
      byId.get(p.id).condition === conditionText(byId.get(p.id).energy)),
    `${byId.get("s1").energy}（${byId.get("s1").condition}）`);
  ck("1f) receipt 逐人回報狀態變化（可稽核／可顯示）",
    receipt.players.every((r) => r.condition && Number.isFinite(r.condition.drained)),
    `扣 ${receipt.players[0].condition.drained} 體力`);
  ck("1g) receipt 只包含實際出賽的 5 人",
    receipt.players.length === 5 && !receipt.players.some((r) => r.playerId === "b1x" || r.playerId === "u1x"));
}

// ── 2) MOBA / CS 都依實際陣容的 playerId 回寫 ──────────────────────────
{
  //  MOBA：把先發 s3 換成替補 b1x ⇒ 經驗與損耗都要落在 b1x
  const swapped = { ...LINEUP, b3: "b1x" };
  const st = mkState();
  const tx = mobaResultToTransaction(mkBattleResult("m-2"), { players: ALL, lineup: swapped });
  const { nextState } = applyProgressToState(st, tx);
  const byId = new Map(nextState.players.map((p) => [p.id, p]));
  ck("2) MOBA 換上替補 → 經驗寫給替補，原先發沒拿到",
    byId.get("b1x").xp > 200 && byId.get("s3").xp === 200);
  ck("2b) MOBA 換上替補 → 損耗也落在替補",
    byId.get("b1x").energy < 100 && byId.get("s3").energy === 100,
    `替補 ${byId.get("b1x").energy} / 原先發 ${byId.get("s3").energy}`);

  //  CS：roster 的 _gid 決定回寫對象
  const cr = {
    schema: "CsMatchResult.v1", matchId: "cs-1", winner: "us", ourScore: 16, enemyScore: 9,
    mapId: "dust2", mapName: "Dust II",
    players: [
      { playerId: "s1", k: 20, d: 10, a: 5, rating: 1.3, kast: 75, adr: 90 },
      { playerId: "s2", k: 15, d: 12, a: 6, rating: 1.1, kast: 70, adr: 80 },
      { playerId: null, k: 10, d: 14, a: 3, rating: 0.9, kast: 60, adr: 60 },
    ],
    mvp: { playerId: "s1" },
  };
  const csTx = csResultToTransaction(cr, { players: ALL });
  const ids = (csTx?.playerProgress ?? []).map((x) => x.playerId);
  ck("2c) CS 依 playerId 回寫，且不虛構選手（playerId 為 null 的不發）",
    ids.includes("s1") && ids.includes("s2") && ids.length === 2, ids.join(","));
  const csApplied = applyProgressToState(mkState(), csTx);
  const csById = new Map(csApplied.nextState.players.map((p) => [p.id, p]));
  ck("2d) CS 出賽者同樣有經驗與損耗，未出賽者不動",
    csById.get("s1").xp > 200 && csById.get("s1").energy < 100 &&
    csById.get("s3").xp === 200 && csById.get("s3").energy === 100);
}

// ── 3) 連續出賽有代價；休息／訓練可恢復 ────────────────────────────────
{
  let p = mkPlayer("x", "中路");
  const drains = [];
  for (let i = 0; i < 4; i++) {
    const w = applyMatchWear(p, `k-${i}`);
    drains.push(w.drained);
    p = w.player;
  }
  ck("3) 連續出賽的單場體力消耗遞增",
    drains.every((d, i) => i === 0 || d > drains[i - 1]), drains.join(" → "));
  ck("3b) 連續出賽計數累加", p.matchStreak === 4, `streak=${p.matchStreak}`);
  ck("3c) 連打四場後體力顯著下降",
    p.energy <= 100 - CONDITION.matchEnergyCost * 4, `energy=${p.energy}`);
  //  受傷機率隨連續出賽上升（用同一組 key 比較兩種 streak 的 chance）
  const lowStreak = applyMatchWear(mkPlayer("y", "中路", { matchStreak: 0 }), "same-key");
  const highStreak = applyMatchWear(mkPlayer("y", "中路", { matchStreak: 5 }), "same-key");
  ck("3d) 受傷機率隨連續出賽上升",
    highStreak.chance > lowStreak.chance, `${lowStreak.chance.toFixed(3)} → ${highStreak.chance.toFixed(3)}`);
  ck("3e) 受傷機率有上限（不會必定受傷）",
    applyMatchWear(mkPlayer("z", "中路", { matchStreak: 99, energy: 20 }), "k").chance <= CONDITION.injury.max);
  //  恢復
  const rested = applyDailyRecovery(p);
  ck("3f) 休息一天回體力，連續出賽計數歸零",
    rested.energy === Math.min(100, p.energy + CONDITION.restPerDay) && rested.matchStreak === 0,
    `${p.energy} → ${rested.energy}`);
  const training = applyDailyRecovery({ ...p, training: { courseId: "aim", daysLeft: 2 } });
  ck("3g) 有排訓練的人不重複回體力（避免與 applyCourse 雙算）",
    training.energy === p.energy);
  const hurt = applyDailyRecovery({ ...p, injuryDays: 3 });
  ck("3h) 每天消化一天傷勢", hurt.injuryDays === 2);
}

// ── 4) 不可出賽時，閘門要擋下並說明理由 ────────────────────────────────
{
  const tired = mkPlayer("t1", "中路", { energy: CONDITION.unfitBelow - 1 });
  const hurt = mkPlayer("t2", "中路", { injuryDays: 3 });
  ck("4) 體力過低 → 不可出賽且有理由",
    !isMatchFit(tired) && matchFitness(tired).code === "exhausted",
    matchFitness(tired).message);
  ck("4b) 傷停 → 不可出賽且有理由",
    !isMatchFit(hurt) && matchFitness(hurt).code === "injured",
    matchFitness(hurt).message);
  ck("4c) 體力剛好在門檻上仍可出賽（邊界不誤擋）",
    isMatchFit(mkPlayer("t3", "中路", { energy: CONDITION.unfitBelow })));
  //  陣容閘門
  const roster = [...STARTERS.slice(1), hurt];
  const seats = { ...LINEUP, b1: "t2" };
  const v = validateSquad({ mode: "moba", seats, players: [...roster, hurt] });
  ck("4d) 陣容含傷停選手 → 出賽被擋，理由可直接顯示",
    !v.ok && v.errors.some((e) => e.code === "injured"),
    v.errors.find((e) => e.code === "injured")?.message);
  ck("4e) 自動填入不會選到不可出賽的人",
    !Object.values(autoFillSquad({ mode: "moba", seats: {}, players: [...STARTERS, hurt, tired] }))
      .some((id) => id === "t1" || id === "t2"));
  ck("4f) 狀態摘要可直接給畫面用",
    (() => { const c = conditionSummary(hurt); return c.canPlay === false && c.injured === true && typeof c.reason === "string"; })());
}

// ── 5) 決定性：伺服器可獨立重算 ────────────────────────────────────────
{
  ck("5) 同一個 key 的判定永遠相同",
    deterministicRoll("abc") === deterministicRoll("abc") && deterministicRoll("abc") !== deterministicRoll("abd"));
  const a = applyMatchWear(mkPlayer("d1", "中路"), "tx:1:p1");
  const b = applyMatchWear(mkPlayer("d1", "中路"), "tx:1:p1");
  ck("5b) 同一場比賽對同一位選手重播 → 逐欄相同（無亂數、無時鐘）",
    JSON.stringify(a) === JSON.stringify(b));
  //  整段結算重播
  const tx = mobaResultToTransaction(mkBattleResult("m-3"), { players: ALL, lineup: LINEUP });
  const r1 = applyProgressToState(mkState(), tx).nextState.players;
  const r2 = applyProgressToState(mkState(), tx).nextState.players;
  ck("5c) 整段賽後結算重播 → 選手狀態逐欄相同",
    JSON.stringify(r1) === JSON.stringify(r2));
  //  冪等：同一場再結算一次不得重複扣體力／發經驗
  const st = mkState();
  const first = applyProgressToState(st, tx);
  const after = { ...st, ...first.nextState };
  const second = applyProgressToState(after, tx);
  ck("5d) 同一場再結算 → 完全不寫入（不重複發經驗、不重複扣體力）",
    second.nextState === null && second.receipt.alreadyApplied === true);
  //  成長數值由 Store 現值重算，不盲信 transaction
  const inflated = createMatchProgressTransaction({
    mode: "moba", matchId: "m-4", sourceResultVersion: "BattleResult.v2",
    teamRewards: { money: 0, fans: 0, reputation: 0 },
    playerProgress: [{ playerId: "s1", xpGained: 100, previousXp: 999999, newXp: 999999, previousLevel: 90, newLevel: 99, levelsGained: 9, talentPointsGained: 9, reasons: [] }],
    metadata: { winner: "us" },
  });
  const infl = applyProgressToState(mkState(), inflated);
  const s1 = infl.nextState.players.find((p) => p.id === "s1");
  ck("5e) 前端灌水的 previousXp / newLevel 一律無效（以 Store 現值重算）",
    s1.xp === 300 && s1.lv === levelFromTotalXp(300),
    `xp=${s1.xp} lv=${s1.lv}（交易單宣稱 lv99）`);
}

console.log("\n── 設定摘要 ──────────────────────────────────────────────────");
console.log(`   單場體力 −${CONDITION.matchEnergyCost}（連續每多一場再 −${CONDITION.streakEnergyStep}）｜每日恢復 +${CONDITION.restPerDay}`);
console.log(`   不可出賽門檻 體力 < ${CONDITION.unfitBelow}｜傷停 ${CONDITION.injury.minDays}–${CONDITION.injury.maxDays} 天`);
console.log(`   受傷機率 基礎 ${CONDITION.injury.base} / 低體力 ${CONDITION.injury.lowEnergy} / 每連場 +${CONDITION.injury.perStreak}（上限 ${CONDITION.injury.max}）`);

console.log(`\n${pass}/${pass + fail} 通過`);
process.exit(fail === 0 ? 0 : 1);
