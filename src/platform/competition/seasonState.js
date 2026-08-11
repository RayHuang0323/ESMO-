// ============================================================================
//  platform/competition/seasonState.js — 賽季狀態純 reducer（Milestone Q3）
//
//  ── 為什麼要有這一層 ──────────────────────────────────────────────────────
//  Q3 要把賽事接上 `advanceDay`。如果那些規則直接寫進 `profileStore`，就只能
//  靠瀏覽器驗證，而本專案的驗收基礎是 Node 驗證器。所以規則全部放在這裡的
//  純函式，`profileStore` 只負責「讀狀態 → 呼叫本檔 → 寫回」。
//
//  ── 停在比賽日：本檔最重要的一條規則 ─────────────────────────────────────
//  規格 D15 明確否決了「照推並自動判棄權」——玩家會因為手滑丟掉整季。
//  所以推進的規則是：
//
//      **可以走進比賽日，但不能在比賽還沒打完時走出去。**
//
//  ⚠ 這與規格 §9 的算術舉例（「第 3 天有比賽 ⇒ 只推 2 天」）不同：那個算法
//    會停在比賽日的**前一天**，於是玩家永遠走不到比賽日，比賽也就永遠打不了。
//    採「走得進、走不出」＝ 推 3 天停在比賽日。這是刻意的偏離，已在 Q3 報告
//    與 handoff 標明。
//
//  棄權因此**不會自動發生**——要玩家自己按（`applyForfeit`）。唯一的例外是
//  `sweepOverdue`：任何「日期已過卻還沒收尾」的場次會被補判棄權，那是為了讓
//  「過去不存在未完成場次」這個不變式成立（例如舊存檔、或日後的賽季快進）。
//
//  純函式：不 import React / zustand / localStorage ⇒ 驗證器可直接 Node 測。
// ============================================================================
import {
  FIXTURE_STATES, isFixtureTerminal, transitionFixture, involvesTeam, opponentOf,
} from "../contracts/competition.js";
import {
  createFixtureOutcome, createForfeitOutcome, RESULT_SOURCES, validateFixtureOutcome,
} from "../contracts/fixtureOutcome.js";
import { buildRegularSeason, SEASON_DAYS } from "./regularSeason.js";
import { simulateFixture, simSeedFor } from "./simulateFixture.js";
import { AI_TEAMS } from "./aiTeams.js";
import { computeStandings } from "./standings.js";

export const SEASON_STATE_VERSION = "SeasonState.v1";
export { SEASON_DAYS };

/**
 * 建立賽季狀態。
 *
 * @param {object} p.playerTeam  profileStore.team（需要 Q1 的 `team.id`）
 * @param {number} p.season      meta.season
 * @param {number} p.seasonSeed  meta.seasonSeed
 */
export function createSeasonState({ playerTeam, season = 1, seasonSeed, gameMode = "moba", startDay = 1 } = {}) {
  const built = buildRegularSeason({ playerTeam, season, seasonSeed, gameMode });
  if (!built.ok) return { ok: false, state: null, errors: built.errors };
  return {
    ok: true,
    errors: [],
    state: {
      schema: SEASON_STATE_VERSION,
      season,
      seed: built.summary.seed,
      //  ⚠ 賽季錨定在**建立當天**（Q3.5 修）。
      //  賽程產生器排的是「賽季第 1–84 天」，但存檔的時鐘不一定從第 1 天開始
      //  （預設新局就是第 8 天）。若直接把賽程日當成 meta.days 比對，
      //  第 1–7 天的場次一建立就是「過期」⇒ 下次推進會被補判棄權，
      //  玩家連看都沒看到就先輸幾場。實測在瀏覽器抓到的。
      startDay: Math.max(1, Math.floor(Number(startDay) || 1)),
      playerTeamId: playerTeam.id,
      competition: built.competition,
      stage: built.stage,
      fixtures: built.fixtures,
      //  賽果一經寫入即不可變（D11）——本檔只 append，永遠不改既有元素
      outcomes: [],
    },
  };
}

/** 參賽者（隊名查詢用）。 */
export const participantsOf = (state) => state?.stage?.participants ?? [];

/**
 * 模擬用的 roster 表。
 * 玩家隊的 roster 由呼叫端傳入（`profileStore.players`），AI 的來自 `AI_TEAMS`。
 * ⚠ 這是 Q2b 紅線的延續：實力一律由 roster 的 16 項能力推導，
 *   `AI_TEAMS[].strength` 不進模擬。
 */
export function rostersFor(state, playerRoster = []) {
  const out = {};
  for (const t of AI_TEAMS) out[t.id] = t.roster;
  if (state?.playerTeamId) out[state.playerTeamId] = playerRoster;
  return out;
}

export const fixtureById = (state, id) => (state?.fixtures ?? []).find((f) => f.id === id) ?? null;

/**
 * 賽程日 → 遊戲日（`meta.days`）。
 * **所有跟時鐘比對的地方都要用這一支**，不得直接讀 `fixture.day`。
 */
export const absoluteDayOf = (state, fixture) =>
  (Number(state?.startDay) || 1) + (Number(fixture?.day) || 1) - 1;

export const fixturesOn = (state, day) =>
  (state?.fixtures ?? []).filter((f) => absoluteDayOf(state, f) === day);
export const outcomeFor = (state, fixtureId) =>
  (state?.outcomes ?? []).find((o) => o.fixtureId === fixtureId) ?? null;

/** 這場是不是玩家的（而不是 AI vs AI）。 */
export const isPlayerFixture = (state, f) => involvesTeam(f, state?.playerTeamId);

/**
 * 這場是不是「已經開打但還沒收尾」。
 * Store 用它判斷要不要走重新進場，不必自己認得狀態字串。
 */
export const isFixtureLaunched = (f) => f?.status === FIXTURE_STATES.launched;

/**
 * 這一天有沒有「還沒收尾的玩家場次」。
 * 有的話就是**推進的阻擋點**——走得進今天，但走不出去。
 */
export function pendingPlayerFixtureOn(state, day) {
  return fixturesOn(state, day).find((f) => isPlayerFixture(state, f) && !isFixtureTerminal(f)) ?? null;
}

/** 下一場玩家賽事（含今天）；沒有則 null。畫面用。 */
export function nextPlayerFixture(state, fromDay = 1) {
  return (state?.fixtures ?? [])
    .filter((f) => isPlayerFixture(state, f) && !isFixtureTerminal(f) && absoluteDayOf(state, f) >= fromDay)
    .sort((a, b) => a.day - b.day)[0] ?? null;
}

/** 內部：把一場 fixture 換掉，回傳新的 state（不改原物件）。 */
function withFixture(state, next) {
  return { ...state, fixtures: state.fixtures.map((f) => (f.id === next.id ? next : f)) };
}

/** 內部：append 一筆賽果（同一場只能有一筆）。 */
function withOutcome(state, outcome) {
  return { ...state, outcomes: [...state.outcomes, outcome] };
}

/**
 * 走進第 `day` 天：把當天所有 AI vs AI 的場次模擬掉。
 * 玩家的場次**不模擬**——那要玩家自己打（或自己棄權）。
 */
export function simulateAiFixturesOn(state, day, playerRoster = []) {
  const rosters = rostersFor(state, playerRoster);
  let next = state;
  const produced = [];
  for (const f of fixturesOn(state, day)) {
    if (isFixtureTerminal(f)) continue;
    if (isPlayerFixture(state, f)) continue;
    if (outcomeFor(next, f.id)) continue;                       // 防重（冪等）
    const sim = simulateFixture({
      fixture: f, rosters, seed: simSeedFor(state.seed, f.id),
    });
    if (!sim.ok) continue;
    //  scheduled → launched → completed：不跳過狀態機，否則轉移表形同虛設
    const lit = transitionFixture(f, FIXTURE_STATES.launched);
    const done = transitionFixture(lit.ok ? lit.fixture : f, FIXTURE_STATES.completed);
    next = withOutcome(withFixture(next, done.ok ? done.fixture : f), sim.outcome);
    produced.push(sim.outcome);
  }
  return { state: next, outcomes: produced };
}

/**
 * 補判棄權：所有「日期已過卻還沒收尾」的場次。
 *
 * 正常流程走不到這裡（推進會停在比賽日）。它的用途是讓
 * 「過去不存在未完成場次」這個不變式在任何情況下都成立——
 * 例如舊存檔、或日後的賽季快進。
 */
export function sweepOverdue(state, currentDay) {
  let next = state;
  const forfeited = [];
  for (const f of state.fixtures) {
    if (absoluteDayOf(state, f) >= currentDay || isFixtureTerminal(f)) continue;
    //  AI vs AI 逾期 ⇒ 主隊判負（沒有「誰缺席」可言，取一致規則即可）
    //  玩家場次逾期 ⇒ 玩家判負
    const loser = isPlayerFixture(next, f) ? next.playerTeamId : f.sideA;
    const made = createForfeitOutcome({ fixture: f, loser, reason: "逾期未出賽" });
    if (!made.ok) continue;
    const t = transitionFixture(f, FIXTURE_STATES.forfeited, { reason: "逾期未出賽" });
    next = withOutcome(withFixture(next, t.ok ? t.fixture : f), made.outcome);
    forfeited.push(made.outcome);
  }
  return { state: next, outcomes: forfeited };
}

/**
 * 推進賽季日曆。**唯一的推進規則**——`profileStore.advanceDay` 呼叫本函式，
 * 不自己判斷該不該停。
 *
 * @param {object} p.state
 * @param {number} p.fromDay  推進前的 `meta.days`
 * @param {number} p.days     想推進幾天
 * @param {Array}  [p.playerRoster]
 * @returns {{state, daysAdvanced:number, stoppedBy:object|null,
 *            simulated:Array, forfeited:Array}}
 */
export function advanceSeasonDays({ state, fromDay, days = 1, playerRoster = [] } = {}) {
  if (!state) return { state, daysAdvanced: days, stoppedBy: null, simulated: [], forfeited: [] };

  let next = state;
  const simulated = [];
  //  先補上任何過去遺留的未完成場次（不變式）
  const swept = sweepOverdue(next, fromDay);
  next = swept.state;

  let advanced = 0;
  let stoppedBy = null;

  for (let i = 0; i < days; i++) {
    const today = fromDay + advanced;
    //  ── 走不出去：今天還有沒打完的玩家賽事 ──
    const blocking = pendingPlayerFixtureOn(next, today);
    if (blocking) {
      stoppedBy = {
        code: "player_fixture",
        day: today,
        fixtureId: blocking.id,
        opponentId: opponentOf(blocking, next.playerTeamId),
        message: `第 ${today} 天有聯賽比賽，請先出賽或棄權`,
      };
      break;
    }
    //  ── 走進明天，把當天的 AI 場次模擬掉 ──
    const day = today + 1;
    const sim = simulateAiFixturesOn(next, day, playerRoster);
    next = sim.state;
    simulated.push(...sim.outcomes);
    advanced++;
  }

  return { state: next, daysAdvanced: advanced, stoppedBy, simulated, forfeited: swept.outcomes };
}

/**
 * 玩家出賽：`scheduled → launched`。
 * ⚠ 由 `competitionGateway.issueFor()` 簽發成功之後才呼叫——
 *   本函式不重複驗資格，那是 gateway 的責任，兩邊都驗會有兩份規則。
 */
export function applyLaunch(state, fixtureId) {
  const f = fixtureById(state, fixtureId);
  if (!f) return { ok: false, state, errors: [{ code: "fixture", message: "找不到這場賽程" }] };
  const t = transitionFixture(f, FIXTURE_STATES.launched);
  if (!t.ok) return { ok: false, state, errors: t.errors };
  return { ok: true, state: withFixture(state, t.fixture), errors: [] };
}

/**
 * 玩家打完：`launched → completed`，寫入 **engine** 賽果。
 *
 * @param {object} p.result { winner, score:{a,b}, duration, seed }
 *   —— 由 `BattleResult.v2` 換算而來（換算在呼叫端；本檔不解讀戰鬥資料）
 */
export function applyCompleted(state, { fixtureId, winner, score, duration, seed } = {}) {
  const f = fixtureById(state, fixtureId);
  if (!f) return { ok: false, state, errors: [{ code: "fixture", message: "找不到這場賽程" }] };
  if (outcomeFor(state, fixtureId)) {
    return { ok: false, state, errors: [{ code: "duplicate", message: "這場已經有賽果了，賽果不可覆寫" }] };
  }
  const made = createFixtureOutcome({
    fixture: f, resultSource: RESULT_SOURCES.engine, winner, score, duration, seed,
  });
  if (!made.ok) return { ok: false, state, errors: made.errors };
  const t = transitionFixture(f, FIXTURE_STATES.completed);
  if (!t.ok) return { ok: false, state, errors: t.errors };
  return { ok: true, state: withOutcome(withFixture(state, t.fixture), made.outcome), outcome: made.outcome, errors: [] };
}

/**
 * 棄權：`scheduled|launched → forfeited`，寫入 **forfeit** 賽果。
 * 預設棄權方是玩家（AI 不會自己棄權）。
 */
export function applyForfeit(state, { fixtureId, loser = null, reason = "玩家棄權" } = {}) {
  const f = fixtureById(state, fixtureId);
  if (!f) return { ok: false, state, errors: [{ code: "fixture", message: "找不到這場賽程" }] };
  if (outcomeFor(state, fixtureId)) {
    return { ok: false, state, errors: [{ code: "duplicate", message: "這場已經有賽果了，賽果不可覆寫" }] };
  }
  const made = createForfeitOutcome({ fixture: f, loser: loser ?? state.playerTeamId, reason });
  if (!made.ok) return { ok: false, state, errors: made.errors };
  const t = transitionFixture(f, FIXTURE_STATES.forfeited, { reason });
  if (!t.ok) return { ok: false, state, errors: t.errors };
  return { ok: true, state: withOutcome(withFixture(state, t.fixture), made.outcome), outcome: made.outcome, errors: [] };
}

/** 積分榜（唯一入口；畫面不得自己算）。 */
export function seasonStandings(state, rule = "win3") {
  return computeStandings({
    outcomes: state?.outcomes ?? [], participants: participantsOf(state), rule,
  });
}

/** 賽季進度摘要（畫面用）。 */
export function seasonProgress(state) {
  const fx = state?.fixtures ?? [];
  const done = fx.filter(isFixtureTerminal).length;
  const mine = fx.filter((f) => isPlayerFixture(state, f));
  return {
    total: fx.length,
    completed: done,
    remaining: fx.length - done,
    playerTotal: mine.length,
    playerCompleted: mine.filter(isFixtureTerminal).length,
    outcomes: (state?.outcomes ?? []).filter((o) => validateFixtureOutcome(o).ok).length,
    seasonDays: SEASON_DAYS,
  };
}
