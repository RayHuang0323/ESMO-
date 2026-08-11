// ============================================================================
//  platform/contracts/fixtureOutcome.js — FixtureOutcome.v1（Milestone Q2b）
//
//  ── 這是什麼 ──────────────────────────────────────────────────────────────
//  一場賽程場次的**正式賽果**。三種來源：
//    · `engine`     玩家實打，另有完整 `BattleResult.v2`
//    · `simulated`  AI vs AI 的決定性快速模擬
//    · `forfeited`  棄權判負（Q3 新增；沒有比賽發生過）
//
//  ── 為什麼棄權要產生正式賽果（Q3 定案）─────────────────────────────────
//  另一個選項是讓 Standings 自己去讀 `fixture.status === "forfeited"`。
//  **那等於引入第二份勝敗真相**：積分榜同時要看賽果陣列和賽程狀態，
//  兩者不一致時沒人說得出聽誰的。棄權產生賽果，Standings 的輸入就永遠只有一個。
//
//  ── 為什麼 AI 場次刻意不產生 BattleResult.v2 ─────────────────────────────
//  BattleResult 有 10 人逐項 KDA／金錢／傷害，快速模擬編不出來，編了就是假資料。
//  本專案已有「誠實佔位不編造」的先例（CS 補兵數顯示「—」、`reputation` 永遠 0）。
//  Standings 只需要勝負與比分，所以 FixtureOutcome 刻意精簡。
//
//  ── 兩類 Analytics 的分界（規格修正 2；Q3 補上 forfeited）───────────────
//    · **Competition Analytics**（勝敗／Standings／晉級／積分／獎金／賽季歷史）
//      → engine + simulated + forfeited **一視同仁**。棄權就是一場正式敗場。
//    · **Combat / Balance Analytics**（KDA／場均擊殺／龍／巴龍／引擎平衡校準）
//      → **只吃 engine**。模擬與棄權都不得用來反推引擎平衡——
//        棄權連一場比賽都沒發生過，拿它算場均擊殺會直接汙染分母。
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

/** 賽果來源。**只有這三種**，呼叫端不得自創第四種。 */
export const RESULT_SOURCES = Object.freeze({
  engine: "engine",
  simulated: "simulated",
  forfeited: "forfeited",
});

export function resultSourceLabel(s) {
  return ({ engine: "實際對戰", simulated: "快速模擬", forfeited: "棄權判負" })[s] ?? s;
}

/**
 * 棄權賽果的固定比分。**不是「還沒填」，是「本來就沒有」。**
 * 沒有比賽發生過 ⇒ 沒有擊殺數。填任何非零值都是編造 Combat 資料。
 * 副作用是棄權對淨勝分零貢獻——這是正確的，勝方拿分不拿分差。
 */
export const FORFEIT_SCORE = Object.freeze({ a: 0, b: 0 });

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
 * @param {number} p.seed             engine = 場次 seed；simulated = 模擬 seed；
 *                                   forfeited **必須為 0**（沒有任何亂數過程）
 * @param {string|null} p.simulatorVersion  simulated 必填；engine／forfeited 必須為 null
 * @param {Array}  [p.highlights]     關鍵事件摘要（純文字標籤，無數值語意）
 * @param {string|null} [p.reason]    僅 forfeited 使用：棄權原因（中文，可顯示）
 */
export function createFixtureOutcome({
  fixture, resultSource, winner, score, duration, seed,
  simulatorVersion = null, highlights = [], reason = null,
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
  //  ── 棄權：沒有比賽發生過，所以不得帶任何 Combat 數值（Q3）──────────────
  if (resultSource === RESULT_SOURCES.forfeited) {
    if (simulatorVersion) {
      errors.push({ code: "simulator_version", message: "棄權賽果不得標記模擬器版本" });
    }
    if (score && (score.a !== 0 || score.b !== 0)) {
      errors.push({ code: "forfeit_score", message: "棄權賽果的比分必須是 0:0——沒有比賽發生過，任何非零比分都是編造的" });
    }
    if (duration) {
      errors.push({ code: "forfeit_duration", message: "棄權賽果的時長必須是 0——沒有比賽發生過" });
    }
    if (seed !== 0) {
      errors.push({ code: "forfeit_seed", message: "棄權賽果的種子必須是 0——棄權沒有任何亂數過程，非零種子會暗示一個不存在的隨機決定" });
    }
    if (highlights?.length) {
      errors.push({ code: "forfeit_highlights", message: "棄權賽果不得有關鍵事件摘要" });
    }
  }
  if (resultSource !== RESULT_SOURCES.forfeited && reason) {
    errors.push({ code: "reason", message: "只有棄權賽果可以帶棄權原因" });
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
      //  僅棄權使用；其餘來源恆為 null（形狀一致，呼叫端不必分兩種）
      reason: resultSource === RESULT_SOURCES.forfeited ? (reason ?? null) : null,
    }),
  };
}

/**
 * 建立棄權賽果（Q3）。**唯一的產生點**——呼叫端不得自己組 `createFixtureOutcome`
 * 再手填 0:0，否則「棄權長什麼樣」會有兩份定義。
 *
 * @param {object} p.fixture  Fixture.v1
 * @param {string} p.loser    棄權的一方（勝方由 fixture 推導，不另外傳）
 * @param {string} [p.reason] 中文原因，會顯示給玩家
 */
export function createForfeitOutcome({ fixture, loser, reason = "逾期未出賽" } = {}) {
  if (!fixture?.id || (loser !== fixture.sideA && loser !== fixture.sideB)) {
    return {
      ok: false, outcome: null,
      errors: [{ code: "loser", message: "棄權方必須是本場的對戰雙方之一" }],
    };
  }
  return createFixtureOutcome({
    fixture,
    resultSource: RESULT_SOURCES.forfeited,
    //  勝方是對手——棄權不是雙方都輸
    winner: loser === fixture.sideA ? fixture.sideB : fixture.sideA,
    score: { ...FORFEIT_SCORE },
    duration: 0,
    seed: 0,
    reason,
  });
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
  //  棄權賽果不得夾帶任何 Combat 數值（Q3）——驗證面也要擋，不能只靠建立面
  if (o.resultSource === RESULT_SOURCES.forfeited) {
    if (o.simulatorVersion) errors.push({ code: "simulator_version", message: "棄權賽果不得標記模擬器版本" });
    if (o.score && (o.score.a !== 0 || o.score.b !== 0)) {
      errors.push({ code: "forfeit_score", message: "棄權賽果的比分必須是 0:0" });
    }
    if (o.duration) errors.push({ code: "forfeit_duration", message: "棄權賽果的時長必須是 0" });
    if (o.seed !== 0) errors.push({ code: "forfeit_seed", message: "棄權賽果的種子必須是 0" });
    if (o.highlights?.length) errors.push({ code: "forfeit_highlights", message: "棄權賽果不得有關鍵事件摘要" });
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
/** 這筆是不是棄權判負（Q3）。 */
export const isForfeitOutcome = (o) => o?.resultSource === RESULT_SOURCES.forfeited;

/**
 * **Competition Analytics 的出口**：勝敗／Standings／晉級／積分／獎金／賽季歷史。
 * engine／simulated／forfeited **一視同仁**——棄權也是一場正式敗場。
 */
export function competitionOutcomes(outcomes) {
  return (outcomes ?? []).filter((o) => validateFixtureOutcome(o).ok);
}

/**
 * **Combat / Balance Analytics 的出口**：KDA／場均擊殺／龍／巴龍／引擎平衡校準。
 * **只吃 engine**——模擬與棄權都不得用來反推引擎平衡（規格修正 2 ＋ Q3）。
 */
export function combatOutcomes(outcomes) {
  return (outcomes ?? []).filter((o) => validateFixtureOutcome(o).ok && isEngineOutcome(o));
}
