// ============================================================================
//  platform/contracts/fixtureOutcome.js — FixtureOutcome.v1（Milestone Q2b）
//
//  ── 這是什麼 ──────────────────────────────────────────────────────────────
//  一場賽程場次的**正式賽果**。兩種來源：
//    · `engine`     玩家實打，另有完整 `BattleResult.v2`
//    · `simulated`  AI vs AI 的決定性快速模擬
//
//  ── 為什麼 AI 場次刻意不產生 BattleResult.v2 ─────────────────────────────
//  BattleResult 有 10 人逐項 KDA／金錢／傷害，快速模擬編不出來，編了就是假資料。
//  本專案已有「誠實佔位不編造」的先例（CS 補兵數顯示「—」、`reputation` 永遠 0）。
//  Standings 只需要勝負與比分，所以 FixtureOutcome 刻意精簡。
//
//  ── 兩類 Analytics 的分界（規格修正 2）──────────────────────────────────
//    · **Competition Analytics**（勝敗／Standings／晉級／積分／獎金／賽季歷史）
//      → engine + simulated **一視同仁**。AI 模擬結果是正式賽果。
//    · **Combat / Balance Analytics**（KDA／場均擊殺／龍／巴龍／引擎平衡校準）
//      → **只吃 engine**。模擬資料不得用來反推引擎平衡。
//  本檔提供 `competitionOutcomes()` / `combatOutcomes()` 兩個明確出口，
//  讓這條界線是**結構上的**，不是靠呼叫端自律。
//
//  ── 不可變（規格 D11）────────────────────────────────────────────────────
//  賽果一經寫入即不可變。本檔**刻意不提供任何修改函式**——沒有 update、
//  沒有 patch、沒有 transition。`simulatorVersion` 是稽核欄位，
//  **不用於重算**：模擬器升版不得讓三年前的冠軍換人。
//
//  純函式：不 import React / zustand / localStorage。
// ============================================================================

export const FIXTURE_OUTCOME_VERSION = "FixtureOutcome.v1";

/** 賽果來源。**只有兩種**，呼叫端不得自創第三種。 */
export const RESULT_SOURCES = Object.freeze({
  engine: "engine",
  simulated: "simulated",
});

export function resultSourceLabel(s) {
  return ({ engine: "實際對戰", simulated: "快速模擬" })[s] ?? s;
}

/**
 * 建立賽果。
 *
 * ⚠ `sideA` / `sideB` 是**從 fixture 複製過來的快照**，不是重複的真相。
 *   理由：賽果不可變、但賽程可由 seed 重算——若賽程產生器日後改版，
 *   舊賽果仍必須說得出「當時是誰打誰」。自帶雙方 id 才是可稽核的紀錄。
 *   `validateFixtureOutcome(o, fixture)` 會在 fixture 在手時比對一致性。
 *
 * @param {object} p
 * @param {object} p.fixture          Fixture.v1
 * @param {string} p.resultSource     RESULT_SOURCES 之一
 * @param {string} p.winner           勝方 teamId（必須是 sideA 或 sideB）
 * @param {object} p.score            { a, b } 對應 sideA / sideB
 * @param {number} p.duration         秒
 * @param {number} p.seed             engine = 場次 seed；simulated = 模擬 seed
 * @param {string|null} p.simulatorVersion  simulated 必填；engine 必須為 null
 * @param {Array}  [p.highlights]     關鍵事件摘要（純文字標籤，無數值語意）
 */
export function createFixtureOutcome({
  fixture, resultSource, winner, score, duration, seed,
  simulatorVersion = null, highlights = [],
} = {}) {
  const errors = [];
  if (!fixture?.id) errors.push({ code: "fixture", message: "缺少賽程場次，無法建立賽果" });
  if (!RESULT_SOURCES[resultSource]) errors.push({ code: "source", message: `未知的賽果來源：${resultSource}` });
  if (fixture && winner && winner !== fixture.sideA && winner !== fixture.sideB) {
    errors.push({ code: "winner", message: "勝方必須是本場的對戰雙方之一" });
  }
  if (!winner) errors.push({ code: "winner", message: "賽果缺少勝方" });
  if (!score || !Number.isFinite(score.a) || !Number.isFinite(score.b)) {
    errors.push({ code: "score", message: "賽果缺少比分" });
  }
  if (typeof seed !== "number" || !Number.isFinite(seed)) {
    errors.push({ code: "seed", message: "賽果缺少種子（可重現性的前提）" });
  }
  //  來源與 simulatorVersion 必須相符——這是稽核欄位，不得含糊
  if (resultSource === RESULT_SOURCES.simulated && !simulatorVersion) {
    errors.push({ code: "simulator_version", message: "模擬賽果必須標明模擬器版本" });
  }
  if (resultSource === RESULT_SOURCES.engine && simulatorVersion) {
    errors.push({ code: "simulator_version", message: "實際對戰的賽果不得標記模擬器版本" });
  }
  if (errors.length) return { ok: false, outcome: null, errors };

  return {
    ok: true,
    errors: [],
    outcome: Object.freeze({
      schema: FIXTURE_OUTCOME_VERSION,
      //  ── provenance：這筆賽果是誰、在什麼條件下產生的 ──
      fixtureId: fixture.id,
      gameMode: fixture.gameMode,
      seed,
      simulatorVersion,
      resultSource,
      //  ── 對戰雙方快照（見上方說明）──
      sideA: fixture.sideA,
      sideB: fixture.sideB,
      //  ── 賽果本體 ──
      winner,
      score: Object.freeze({ a: score.a, b: score.b }),
      duration,
      highlights: Object.freeze([...highlights]),
    }),
  };
}

/**
 * 驗證賽果。傳入 `fixture` 時會一併比對「這筆賽果是不是這場的」。
 */
export function validateFixtureOutcome(o, fixture = null) {
  const errors = [];
  if (!o || typeof o !== "object") return { ok: false, errors: [{ code: "invalid", message: "賽果不是物件" }] };
  if (o.schema !== FIXTURE_OUTCOME_VERSION) errors.push({ code: "schema", message: `schema 必須為 ${FIXTURE_OUTCOME_VERSION}` });

  //  provenance 五項缺一不可（規格修正 3）
  if (!o.fixtureId) errors.push({ code: "fixture_id", message: "賽果缺少場次識別碼" });
  if (o.gameMode !== "moba" && o.gameMode !== "cs") errors.push({ code: "mode", message: "賽果的 gameMode 不合法" });
  if (typeof o.seed !== "number" || !Number.isFinite(o.seed)) errors.push({ code: "seed", message: "賽果缺少種子" });
  if (!RESULT_SOURCES[o.resultSource]) errors.push({ code: "source", message: "賽果來源不合法" });
  if (o.resultSource === RESULT_SOURCES.simulated && !o.simulatorVersion) {
    errors.push({ code: "simulator_version", message: "模擬賽果必須標明模擬器版本" });
  }
  if (o.resultSource === RESULT_SOURCES.engine && o.simulatorVersion) {
    errors.push({ code: "simulator_version", message: "實際對戰的賽果不得標記模擬器版本" });
  }

  if (!o.sideA || !o.sideB) errors.push({ code: "sides", message: "賽果缺少對戰雙方" });
  if (o.winner !== o.sideA && o.winner !== o.sideB) errors.push({ code: "winner", message: "勝方必須是對戰雙方之一" });
  if (!o.score || !Number.isFinite(o.score.a) || !Number.isFinite(o.score.b)) {
    errors.push({ code: "score", message: "賽果缺少比分" });
  }

  if (fixture) {
    if (o.fixtureId !== fixture.id) errors.push({ code: "fixture_mismatch", message: "賽果與賽程場次不符" });
    if (o.sideA !== fixture.sideA || o.sideB !== fixture.sideB) {
      errors.push({ code: "sides_mismatch", message: "賽果的對戰雙方與賽程場次不符" });
    }
  }
  return { ok: errors.length === 0, errors };
}

/** 敗方（純推導，不另存欄位）。 */
export const loserOf = (o) => (o?.winner === o?.sideA ? o?.sideB : o?.sideA);

/** 這筆是不是實際對戰的結果。 */
export const isEngineOutcome = (o) => o?.resultSource === RESULT_SOURCES.engine;
/** 這筆是不是快速模擬的結果。 */
export const isSimulatedOutcome = (o) => o?.resultSource === RESULT_SOURCES.simulated;

/**
 * **Competition Analytics 的出口**：勝敗／Standings／晉級／積分／獎金／賽季歷史。
 * engine 與 simulated **一視同仁**——AI 模擬結果是正式賽果。
 */
export function competitionOutcomes(outcomes) {
  return (outcomes ?? []).filter((o) => validateFixtureOutcome(o).ok);
}

/**
 * **Combat / Balance Analytics 的出口**：KDA／場均擊殺／龍／巴龍／引擎平衡校準。
 * **只吃 engine**——模擬資料不得用來反推引擎平衡（規格修正 2）。
 */
export function combatOutcomes(outcomes) {
  return (outcomes ?? []).filter((o) => validateFixtureOutcome(o).ok && isEngineOutcome(o));
}
