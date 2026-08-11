// ============================================================================
//  platform/competition/simulateFixture.js — 決定性快速模擬（Milestone Q2b）
//
//  ── 為什麼需要它 ──────────────────────────────────────────────────────────
//  8 隊雙循環 56 場，其中 42 場是 AI vs AI。每場真跑 LogicEngine 要 20–30 分鐘
//  ⇒ 不可行（規格 D5）。本檔用隊伍實力 + seed 直接推出賽果。
//
//  ── 三條紅線 ──────────────────────────────────────────────────────────────
//  ① **不得使用 `AI_TEAMS[].strength`**。那是 Q2a 用來產生 roster 的錨點。
//     本檔一律由 `teamStrength(roster)` 從 16 項能力推導
//     ⇒ 改隊伍的 `strength` 欄位不會改變賽果；改選手能力才會（verifier 用行為證明）。
//  ② **不產生 `BattleResult.v2`**。模擬編不出 10 人逐項 KDA／金錢／傷害。
//  ③ **不碰 LogicEngine**。這裡沒有任何戰鬥模擬，只有勝負與比分的統計模型。
//
//  ── 決定性 ────────────────────────────────────────────────────────────────
//  亂數流由 `fixtureId + seed + simulatorVersion` 雜湊派生
//  ⇒ 同 fixture + 同 seed + 同版本，重跑逐值一致（伺服器可重播）。
//  無 `Math.random()`、無 `Date.now()`。
//
//  ── ⚠ MVP 明確不保證 ─────────────────────────────────────────────────────
//  模擬勝率**未與 LogicEngine 校準**（規格 D16／R10）。這是自覺取捨。
//
//  純函式：不 import React / zustand / localStorage。
// ============================================================================
import { createFixtureOutcome, RESULT_SOURCES } from "../contracts/fixtureOutcome.js";
import { teamStrength, TEAM_STRENGTH_VERSION } from "./teamStrength.js";

/**
 * 模擬器版本。**寫進每一筆賽果的 `simulatorVersion`，是稽核欄位。**
 * 改動下面任何一個參數或公式都必須升版——否則舊賽果會宣稱是這個版本算的。
 * ⚠ 升版**不重算歷史賽果**（規格 D11）。
 */
export const SIMULATOR_VERSION = `fixtureSim.v1+${TEAM_STRENGTH_VERSION}`;

/** 模型參數。集中在一處，調整時只改這裡。 */
export const SIM_PARAMS = Object.freeze({
  //  實力差 → 勝率的敏感度。差 `scale` 分約等於 73% 勝率
  scale: 8,
  //  勝率夾限：再弱的隊也有機會，再強的隊也不保證贏
  minWinRate: 0.12,
  maxWinRate: 0.88,
  //  主場優勢（加在勝率上，夾限後）
  homeEdge: 0.04,
  //  比分（MOBA 擊殺數）
  killsBase: 14,
  killsSpread: 12,
  //  勝方的擊殺優勢區間
  marginMin: 3,
  marginMax: 18,
  //  時長（秒）
  durationMin: 18 * 60,
  durationMax: 42 * 60,
});

/** FNV-1a → uint32（與 identity / aiTeams 同一套）。 */
function hash32(input) {
  const s = String(input);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/** 決定性 LCG（與 recruitPool / aiTeams / scheduleGenerator 同一套）。 */
const mkRng = (s) => { let x = (s >>> 0) || 1; return () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; }; };

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * 實力差 → 主場勝率（邏輯斯函數 + 主場優勢 + 夾限）。
 * 匯出供 verifier 與畫面檢視，不另算一套。
 */
export function winRateFor(strengthA, strengthB, params = SIM_PARAMS) {
  const raw = 1 / (1 + Math.exp(-(strengthA - strengthB) / params.scale));
  return clamp(raw + params.homeEdge, params.minWinRate, params.maxWinRate);
}

/**
 * 模擬一場賽程場次。
 *
 * @param {object} p
 * @param {object} p.fixture   Fixture.v1
 * @param {object} p.rosters   { [teamId]: Array<player> } —— **必須是 roster，不是實力值**
 * @param {number} p.seed      模擬種子（通常由賽季種子 + fixtureId 派生）
 * @param {object} [p.params]
 * @returns {{ok:boolean, outcome:object|null, errors:Array, detail:object|null}}
 */
export function simulateFixture({ fixture, rosters, seed, params = SIM_PARAMS } = {}) {
  const errors = [];
  if (!fixture?.id || !fixture.sideA || !fixture.sideB) {
    errors.push({ code: "fixture", message: "賽程場次無效，無法模擬" });
  }
  if (typeof seed !== "number" || !Number.isFinite(seed)) {
    errors.push({ code: "seed", message: "缺少模擬種子" });
  }
  if (errors.length) return { ok: false, outcome: null, detail: null, errors };

  //  ① 實力一律由 roster 的 16 項能力推導——**不接受外部傳入的實力值**
  const sA = teamStrength(rosters?.[fixture.sideA], fixture.gameMode);
  const sB = teamStrength(rosters?.[fixture.sideB], fixture.gameMode);
  if (sA === null || sB === null) {
    return {
      ok: false, outcome: null, detail: null,
      errors: [{ code: "roster", message: "對戰雙方都必須有可推導實力的名單" }],
    };
  }

  //  ② 決定性亂數流：fixtureId + seed + 模擬器版本
  const rng = mkRng(hash32(`${fixture.id}|${seed}|${SIMULATOR_VERSION}`));

  //  ③ 勝負
  const pA = winRateFor(sA, sB, params);
  const roll = rng();
  const aWins = roll < pA;
  const winner = aWins ? fixture.sideA : fixture.sideB;

  //  ④ 比分：敗方擊殺數為底，勝方加上優勢；優勢隨勝率差擴大
  const loserKills = Math.round(params.killsBase + rng() * params.killsSpread);
  const dominance = Math.abs(pA - 0.5) * 2;                       // 0..1
  const marginSpan = params.marginMax - params.marginMin;
  const margin = Math.round(params.marginMin + (0.45 + 0.55 * dominance) * rng() * marginSpan);
  const winnerKills = loserKills + margin;
  const score = aWins ? { a: winnerKills, b: loserKills } : { a: loserKills, b: winnerKills };

  //  ⑤ 時長：勢均力敵打得久
  const duration = Math.round(
    params.durationMin + (1 - dominance) * rng() * (params.durationMax - params.durationMin),
  );

  //  ⑥ 摘要：純標籤，**沒有數值語意**（不得被誤當成 Combat Analytics 資料）
  const highlights = [];
  if (margin >= 14) highlights.push("一面倒");
  else if (margin <= 5) highlights.push("鏖戰");
  if (duration >= 36 * 60) highlights.push("超長局");
  if (!aWins && pA > 0.65) highlights.push("爆冷");
  if (aWins && pA < 0.35) highlights.push("爆冷");

  const made = createFixtureOutcome({
    fixture,
    resultSource: RESULT_SOURCES.simulated,
    simulatorVersion: SIMULATOR_VERSION,
    winner,
    score,
    duration,
    seed,
    highlights,
  });
  if (!made.ok) return { ok: false, outcome: null, detail: null, errors: made.errors };

  return {
    ok: true,
    errors: [],
    outcome: made.outcome,
    //  除錯用；**不進賽果**（賽果不得夾帶實力數值）
    detail: { strengthA: sA, strengthB: sB, winRateA: pA, roll },
  };
}

/**
 * 模擬一整批場次（通常是 AI vs AI 的 42 場）。
 * 每場的種子由 `baseSeed` 與 `fixtureId` 派生 ⇒ 場次之間互不影響，
 * 增減任何一場都不會平移其他場的結果。
 */
export function simulateFixtures({ fixtures, rosters, baseSeed, params = SIM_PARAMS } = {}) {
  const outcomes = [];
  const errors = [];
  for (const f of fixtures ?? []) {
    const seed = hash32(`${baseSeed}|${f.id}`);
    const r = simulateFixture({ fixture: f, rosters, seed, params });
    if (!r.ok) { errors.push({ fixtureId: f.id, errors: r.errors }); continue; }
    outcomes.push(r.outcome);
  }
  return { ok: errors.length === 0, outcomes, errors };
}

/** 某場次的模擬種子（供呼叫端預先取得，與 `simulateFixtures` 同一套推導）。 */
export const simSeedFor = (baseSeed, fixtureId) => hash32(`${baseSeed}|${fixtureId}`);
