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
import { upgradeCompetitionIdentity } from "../contracts/circuit.js";
import { buildRegularSeason, SEASON_DAYS } from "./regularSeason.js";
import { simulateFixture, simSeedFor } from "./simulateFixture.js";
import { AI_TEAMS } from "./aiTeams.js";
import { computeStandings, outcomeSourceMix, TIEBREAKERS } from "./standings.js";
import { createFinalStandings } from "../contracts/finalStandings.js";
import {
  createQualification, createPlayoffStage, ensurePlayoffFixtures,
  playoffOrder, playoffBracket, PLAYOFF_STAGE_KEY, PLAYOFF_MATCHES,
} from "./playoffs.js";

export const SEASON_STATE_VERSION = "SeasonState.v2";
export const SEASON_STATE_VERSION_V1 = "SeasonState.v1";

// ── Q7a-3b：同季多賽事並存的存取層 ─────────────────────────────────────────
//
//  v2 把「賽制」從單數的 `competition` / `stage` / `playoff` 改成
//  `competitions: { [competitionId]: { competition, stage, playoff } }`。
//
//  ⚠ **`competitions{}` 是唯一真相**。頂層刻意**不留** stage / playoff 鏡像——
//    留鏡像就是兩個地方存同一份東西，遲早漂移。要拿就從這裡拿。
//  ⚠ `fixtures` / `outcomes` **維持頂層單一陣列，不拆進 competitions**：
//    ① `fixturesOn(day)` 必須跨賽事掃（同日多場的前提）
//    ② `fixture.stageId` 已經可以回推 competition → event → circuit
//    ③ 拆了就會每個 competition 一份副本 ⇒ 第二份真相

/**
 * Event 的獎金政策。**可以是 null**——不是每個 Event 都有獎金（產品規則），
 * 而且沒有獎金的 Event **不得被迫產生一筆 0 元的假獎金**。
 *
 * ⚠ 這裡只存**抽象政策**，不存金額、不算錢、**也不指名任何獎金表**。
 *   把表名寫在這裡會讓賽季層知道經濟層的東西——Q4 §4c／Q5 §7b 的守衛正是
 *   為了擋這件事，而且它抓到過（本輪第一版寫了表名，守衛立刻紅）。
 *   `table: "default"` 由經濟層自己對應到實際獎金表。
 * ⚠ legacy 的 MOBA 聯賽用 default 政策 ⇒ 舊存檔的發放時點與金額都不變。
 */
export const LEGACY_PRIZE_POLICY = Object.freeze({ kind: "rank_table", table: "default" });

/** 這個賽季裡的所有賽制條目（{competition, stage, playoff}）。 */
export const competitionEntries = (state) => Object.values(state?.competitions ?? {});

/** 用 id 取賽制條目。 */
export const competitionEntry = (state, competitionId) =>
  state?.competitions?.[competitionId] ?? null;

/**
 * 目前**聚焦**的賽制條目。
 *
 * ⚠ `activeEventId` 只決定「畫面看哪一個」，**不參與任何規則判定**。
 *   規則一律走完整集合，否則「玩家在看哪個賽事」會影響結算，那是災難。
 */
export function activeEntryOf(state) {
  const entries = competitionEntries(state);
  if (entries.length === 0) return null;
  const ev = state?.events?.[state?.activeEventId] ?? null;
  const ranked = ev?.rankingCompetitionId ? competitionEntry(state, ev.rankingCompetitionId) : null;
  return ranked ?? entries[0];
}
export const activeCompetitionOf = (state) => activeEntryOf(state)?.competition ?? null;
export const activeStageOf = (state) => activeEntryOf(state)?.stage ?? null;
export const activePlayoffOf = (state) => activeEntryOf(state)?.playoff ?? null;

/** 把某個賽制條目換掉，回傳新的 state（不改原物件）。 */
function withEntry(state, competitionId, next) {
  return { ...state, competitions: { ...state.competitions, [competitionId]: next } };
}

// ── 反向查詢：全部用推導，**不存反向索引**（存了就會漂移）─────────────────
export const stageIdsOfCompetition = (state, cid) => {
  const e = competitionEntry(state, cid);
  return [e?.stage?.id, e?.playoff?.stage?.id].filter(Boolean);
};
export const competitionIdOfFixture = (state, fixture) =>
  competitionEntries(state).find((e) =>
    e.stage?.id === fixture?.stageId || e.playoff?.stage?.id === fixture?.stageId)?.competition?.id ?? null;
export const fixturesOfCompetition = (state, cid) => {
  const ids = new Set(stageIdsOfCompetition(state, cid));
  return (state?.fixtures ?? []).filter((f) => ids.has(f.stageId));
};
export const outcomesOfCompetition = (state, cid) => {
  const ids = new Set(fixturesOfCompetition(state, cid).map((f) => f.id));
  return (state?.outcomes ?? []).filter((o) => ids.has(o.fixtureId));
};
export const competitionsOfEvent = (state, eventId) =>
  competitionEntries(state).filter((e) => e.competition?.eventId === eventId);
export const eventsOfCircuit = (state, circuitId) =>
  Object.values(state?.events ?? {}).filter((e) => e.circuitId === circuitId);
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
  //  Q7a-3a：新建的賽季也走同一條身分升級路徑，讓新舊存檔的形狀一致。
  //  ⚠ 這一輪仍然是 legacy 推導（`comp:{mode}:s{season}:{org}:{tier}`）——
  //    3a 只補身分欄位，**不改任何 id**。由 Event 推導 id 是 3b 的事。
  const up = upgradeCompetitionIdentity(built.competition);
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
      //  Q7a-3b：賽制放進 map，頂層不再有單數的 competition / stage / playoff
      competitions: { [up.competition.id]: { competition: up.competition, stage: built.stage, playoff: null } },
      circuits: up.circuit ? { [up.circuit.id]: up.circuit } : {},
      events: up.event
        ? { [up.event.id]: {
            ...up.event,
            competitionIds: [up.competition.id],
            //  Event 只有一個 Competition ⇒ 可以自動指定（產品規則）
            rankingCompetitionId: up.competition.id,
            //  legacy 的 MOBA 聯賽沿用既有名次獎金；其他 Event 預設沒有獎金
            prizePolicy: LEGACY_PRIZE_POLICY,
          } }
        : {},
      activeEventId: up.event?.id ?? null,
      fixtures: built.fixtures,
      //  賽果一經寫入即不可變（D11）——本檔只 append，永遠不改既有元素
      outcomes: [],
    },
  };
}

/**
 * 舊存檔的身分升級（Q7a-3a）。
 *
 * ⚠ **不改任何既有 id**：`competition.id`、`stage.id`、每一個 `fixture.id`、
 *   每一筆 `outcome.fixtureId` 都原樣保留。只補 `circuitId` / `eventId` /
 *   `idScheme`，並掛上合成的 legacy 容器。
 * ⚠ **冪等**：已升級過就**原樣回傳同一個物件參考**。不這樣的話每次載入都會
 *   產生新物件，害畫面白重繪，也會讓「重載後逐字未變」那類 JSON 比對失準。
 */
export function upgradeSeasonIdentity(state) {
  if (!state?.schema || !state.competition) return state;
  const up = upgradeCompetitionIdentity(state.competition);
  if (up.alreadyUpgraded) return state;
  return {
    ...state,
    competition: up.competition,
    circuits: { ...(state.circuits ?? {}), ...(up.circuit ? { [up.circuit.id]: up.circuit } : {}) },
    events: { ...(state.events ?? {}), ...(up.event ? { [up.event.id]: up.event } : {}) },
  };
}

/**
 * v1 → v2 形狀升級（Q7a-3b）。
 *
 * v1 的單數 `competition` / `stage` / `playoff` 包成 `competitions{}` 的一筆。
 *
 * ⚠ **`fixtures` / `outcomes` 用同一個參考**，不複製、不重建——它們是事實層，
 *   而且 Q1–Q6 有 25 處直接讀它們。
 * ⚠ **`state.final` 原樣保留不動**（Q6 是逐字比對）。legacy Event 的 `final`
 *   留 null，由 `eventFinalOf()` 在 legacy 情境回傳 `state.final` ⇒ 不產生
 *   兩份封存快照。
 * ⚠ **冪等**：已是 v2 就回傳同一個物件參考。
 */
export function upgradeSeasonShape(state) {
  if (!state?.schema) return state;
  if (state.competitions) return state;            // 已經是 v2
  const withId = upgradeSeasonIdentity(state);     // 先補 3a 的身分（冪等）
  const comp = withId.competition;
  if (!comp) return state;

  const eventId = comp.eventId ?? null;
  const events = { ...(withId.events ?? {}) };
  if (eventId && events[eventId]) {
    events[eventId] = {
      ...events[eventId],
      competitionIds: [comp.id],
      rankingCompetitionId: comp.id,               // 只有一個 ⇒ 可自動指定
      prizePolicy: LEGACY_PRIZE_POLICY,            // 舊聯賽沿用既有名次獎金
      final: events[eventId].final ?? null,        // 見上方說明：不複製 state.final
    };
  }

  const next = {
    ...withId,
    schema: SEASON_STATE_VERSION,
    competitions: { [comp.id]: { competition: comp, stage: withId.stage, playoff: withId.playoff ?? null } },
    events,
    activeEventId: withId.activeEventId ?? eventId ?? null,
  };
  //  頂層的單數欄位到此退場——`competitions{}` 是唯一真相，不留鏡像
  delete next.competition; delete next.stage; delete next.playoff;
  return next;
}

/**
 * 取某個 Event 的封存名次。
 * legacy（只有一個 Event 且沿用舊語意）回傳 `state.final`，避免同一份快照存兩次。
 */
export function eventFinalOf(state, eventId) {
  const ev = state?.events?.[eventId] ?? null;
  if (!ev) return null;
  if (ev.final) return ev.final;
  const onlyOne = Object.keys(state?.events ?? {}).length === 1;
  return onlyOne ? (state?.final ?? null) : null;
}

/** 參賽者（隊名查詢用）。 */
export const participantsOf = (state) => activeStageOf(state)?.participants ?? [];

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
 * 這一天**全部**還沒收尾的玩家場次（依既有順序，不重排）。
 *
 * ⚠ 同一天可以有多場：Q7a 的產品規則是「賽程與賽事可以並存、同一天也可以有
 *   多場玩家賽事」，只有**進行中的 battle session** 一次限一個。資料模型本來
 *   就放得下（`fixturesOn` 不限筆數），但先前只取第一場 ⇒ 第二場在畫面上
 *   看不見，玩家會卡在「今天走不出去、卻不知道還要打什麼」。
 */
export function pendingPlayerFixturesOn(state, day) {
  return fixturesOn(state, day).filter((f) => isPlayerFixture(state, f) && !isFixtureTerminal(f));
}

/**
 * 這一天有沒有「還沒收尾的玩家場次」——回傳**第一場**。
 * 有的話就是**推進的阻擋點**——走得進今天，但走不出去。
 *
 * ⚠ 一天多場時這裡只回第一場（沿用既有語意，避免動到既有呼叫端）。
 *   要列出全部請用 `pendingPlayerFixturesOn`。推進阻擋不受影響：
 *   只要當天還有任何一場沒收尾，這裡就仍然回傳非 null。
 */
export function pendingPlayerFixtureOn(state, day) {
  return pendingPlayerFixturesOn(state, day)[0] ?? null;
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

// ── Milestone Q4：賽季封存 ────────────────────────────────────────────────

/**
 * 這個賽季可以封存了嗎。
 *
 * 條件只有一條：**每一場都收尾了**（completed / forfeited）。
 * 刻意**不用「第 84 天到了」**當條件——賽程日與 `meta.days` 之間隔著
 * `startDay` 錨點（Q3.5 修的那件事），拿天數判會在舊存檔上判錯；
 * 而「場次全部收尾」是賽季真正結束的定義，與時鐘怎麼走無關。
 *
 * @returns {{ok:boolean, sealed:boolean, remaining:number, reason:string|null}}
 */
export function canSealSeason(state) {
  if (!state?.schema) return { ok: false, sealed: false, remaining: 0, reason: "目前沒有賽季" };
  if (state.final) return { ok: false, sealed: true, remaining: 0, reason: "這個賽季已經封存過了" };
  const fx = state.fixtures ?? [];
  const remaining = fx.filter((f) => !isFixtureTerminal(f)).length;
  if (remaining > 0) {
    return { ok: false, sealed: false, remaining, reason: `還有 ${remaining} 場沒有結果，賽季還沒結束` };
  }
  //  ⚠ Q6：常規賽打完**不等於**賽季結束——還有季後賽。
  //    少了這一道，常規賽最後一場收尾的當下就會封存，季後賽永遠排不出來
  //    （而且 Q5 的換季會在季後賽之前就開放）。
  if (!isPlayoffDone(state)) {
    return {
      ok: false, sealed: false, remaining: 0,
      reason: activePlayoffOf(state) ? "季後賽還沒打完" : "季後賽還沒排定",
    };
  }
  return { ok: true, sealed: false, remaining: 0, reason: null };
}

/**
 * 封存賽季：把**當下推導出來的** Standings 凍結成不可變的 `FinalStandings.v1`。
 *
 * ⚠ 一個賽季只能封存一次（D11）。已封存還再呼叫 ⇒ 回既有那一份、不覆寫。
 *   這與 `applyCompleted` 拒絕覆寫賽果是同一條紀律：**寫進去的就不會再變**。
 *
 * ⚠ 本檔**不發獎金**。獎金是經濟層的事（`economy/competitionAward.js`），
 *   賽季狀態不碰錢——否則錢就有第四個入口了。
 *
 * @param {object} state
 * @param {number} sealedAtDay  封存當下的遊戲日（`meta.days`）
 */
export function applySealSeason(state, sealedAtDay) {
  const can = canSealSeason(state);
  if (!can.ok) {
    //  已封存不算失敗——回既有那一份，讓呼叫端能安全重試
    if (can.sealed) return { ok: true, state, final: state.final, alreadySealed: true, errors: [] };
    return { ok: false, state, final: null, alreadySealed: false, errors: [{ code: "not_finished", message: can.reason }] };
  }
  const standings = seasonStandings(state);
  //  Q6：最終名次的**前四名由季後賽決定**（冠／亞／季／殿），5–8 名維持常規賽順序。
  //  ⚠ 常規賽的勝敗、積分、淨勝分**原樣保留在每一列裡**，只有 `rank` 會被重排，
  //    而且每一列都留著 `regularRank` ⇒ 常規賽成績不可能被季後賽覆寫。
  const po = playoffOrder({ fixtures: playoffFixturesOf(state), outcomes: state.outcomes ?? [] });
  const made = createFinalStandings({
    standings,
    competition: activeCompetitionOf(state),
    stageId: activeStageOf(state)?.id ?? null,
    sealedAtDay,
    tiebreakers: TIEBREAKERS,
    sourceMix: outcomeSourceMix(state.outcomes ?? []),
    playerTeamId: state.playerTeamId ?? null,
    playoffOrder: po.order,
    championTeamId: po.championTeamId,
    playoffStageId: activePlayoffOf(state)?.stage?.id ?? null,
  });
  if (!made.ok) return { ok: false, state, final: null, alreadySealed: false, errors: made.errors };
  return { ok: true, state: { ...state, final: made.final }, final: made.final, alreadySealed: false, errors: [] };
}

// ── Milestone Q5：跨賽季換季 ──────────────────────────────────────────────

/**
 * 可以換到下一季了嗎。
 *
 * 條件只有一條：**目前這一季已經封存**。封存本身已經保證「每一場都收尾」，
 * 所以這裡不再重數一次場次——那會變成第二份「賽季結束了沒」的規則。
 *
 * @returns {{ok:boolean, reason:string|null, nextSeason:number|null}}
 */
export function canRollSeason(state) {
  if (!state?.schema) return { ok: false, reason: "目前沒有賽季", nextSeason: null };
  if (!state.final) return { ok: false, reason: "這一季還沒結束，不能開下一季", nextSeason: null };
  return { ok: true, reason: null, nextSeason: (Number(state.season) || 1) + 1 };
}

/**
 * 換到下一個賽季。
 *
 * ── 這一支只做「換容器」──────────────────────────────────────────────────
 * 產生一個**全新的**賽季狀態（新 Competition／Stage／56 場賽程／空 outcomes），
 * 並把上一季**已封存的** `FinalStandings` 交給呼叫端存進歷史。
 * 選手、資金、成長、贊助合約**完全不碰**——那些不住在賽季狀態裡。
 *
 * ⚠ **賽季編號自己 +1，不讀 `meta.season`。**
 *   `meta.season` 是由 `meta.days` 導出的**經濟週期**（12 週一輪），
 *   而賽事賽季錨在「建立當天」（Q3.5 的 `startDay`），兩者本來就會逐季偏移。
 *   Q5 的決定：**賽季編號由賽事自己擁有**，畫面上的「賽季」只認這一個。
 *
 * ⚠ 新賽季的種子仍是 `seedForSeason(seasonSeed, 季號)`（Q1 就備好的派生函式）
 *   ⇒ 同一個存檔的 S2／S3／S4 賽程逐場決定性，重跑一模一樣。
 *
 * @param {object} p
 * @param {object} p.state       目前（已封存）的賽季狀態
 * @param {object} p.playerTeam  `profileStore.team`
 * @param {number} p.seasonSeed  `meta.seasonSeed`（不可變）
 * @param {number} p.startDay    新賽季錨在哪一天（＝換季當下的 `meta.days`）
 * @returns {{ok:boolean, state:object|null, archived:object|null, errors:Array}}
 *   `archived` = 上一季的 FinalStandings（呼叫端負責存進歷史）
 */
export function rollToNextSeason({ state, playerTeam, seasonSeed, startDay } = {}) {
  const can = canRollSeason(state);
  if (!can.ok) return { ok: false, state: null, archived: null, errors: [{ code: "cannot_roll", message: can.reason }] };

  const made = createSeasonState({
    playerTeam,
    season: can.nextSeason,
    seasonSeed,
    gameMode: activeCompetitionOf(state)?.gameMode ?? "moba",
    startDay,
  });
  if (!made.ok) return { ok: false, state: null, archived: null, errors: made.errors };

  //  新賽季不得繼承任何上一季的痕跡——這裡順手斷言一次，
  //  因為「歸零」是規格明列的驗收項，出錯要在這裡就爆，而不是三個畫面之後。
  if ((made.state.outcomes ?? []).length !== 0 || made.state.final) {
    return { ok: false, state: null, archived: null, errors: [{ code: "not_clean", message: "新賽季必須是乾淨的（無賽果、無封存）" }] };
  }
  return { ok: true, state: made.state, archived: state.final, errors: [] };
}

/**
 * 賽季相對進度（Q5 修的顯示問題）。
 *
 * 舊版畫面拿**絕對遊戲日**去對 84 天，於是賽季末會顯示「第 95 / 84 天」——
 * 因為賽季錨在建立當天（`startDay`），不是遊戲的第 1 天。
 * 這一支回傳的是**本賽季第幾天**，畫面只顯示它。
 */
export function seasonDayOf(state, currentDay) {
  const start = Number(state?.startDay) || 1;
  const d = Math.max(1, Math.floor(Number(currentDay) || 1) - start + 1);
  return { seasonDay: Math.min(d, SEASON_DAYS), seasonDays: SEASON_DAYS, overrun: d > SEASON_DAYS };
}

/**
 * 常規賽積分榜（唯一入口；畫面不得自己算）。
 *
 * ⚠ Q6：**只吃常規賽的賽果**。季後賽場次住在同一個 `state.fixtures`／`outcomes`
 *   裡（那是刻意的——所有既有機制因此不用改），但它們**不能進常規賽積分榜**。
 */
export function seasonStandings(state, rule = "win3") {
  return computeStandings({
    outcomes: state?.outcomes ?? [], participants: participantsOf(state), rule,
    stageId: activeStageOf(state)?.id ?? null,
  });
}

// ── Milestone Q6：季後賽 ──────────────────────────────────────────────────

/** 季後賽的場次（沒有季後賽 ⇒ 空陣列）。 */
export const playoffFixturesOf = (state) =>
  (state?.fixtures ?? []).filter((f) => f.stageId === activePlayoffOf(state)?.stage?.id);

/** 常規賽的場次。 */
export const regularFixturesOf = (state) =>
  (state?.fixtures ?? []).filter((f) => f.stageId === activeStageOf(state)?.id);

/** 常規賽是不是每一場都收尾了。 */
export const isRegularSeasonDone = (state) =>
  regularFixturesOf(state).length > 0 && regularFixturesOf(state).every(isFixtureTerminal);

/**
 * 常規賽結束 ⇒ 產生晉級資格與季後賽對戰表。**冪等、可重複呼叫。**
 *
 * 第一次呼叫建立賽段與兩場準決賽；準決賽都收尾後再呼叫，才補得出季軍戰與決賽
 * （決賽對手要等準決賽打完才知道——見 `playoffs.js` 檔頭）。
 *
 * ⚠ 常規賽沒打完就呼叫 ⇒ 什麼都不做。季後賽的種子順序來自**常規賽**積分榜，
 *   還沒打完就排等於用不完整的名次決定晉級。
 */
export function ensurePlayoffs(state) {
  if (!state?.schema) return { ok: false, state, added: 0, errors: [{ code: "no_season", message: "目前沒有賽季" }] };
  if (state.final) return { ok: true, state, added: 0, errors: [] };          // 已封存，不再動
  if (!isRegularSeasonDone(state)) return { ok: true, state, added: 0, errors: [] };

  let next = state;
  //  ① 還沒有季後賽賽段 ⇒ 依常規賽積分榜產生晉級資格與賽段
  if (!activePlayoffOf(next)) {
    const q = createQualification({
      standings: seasonStandings(next),
      stage: activeStageOf(next),
      toStageId: `stage:${activeCompetitionOf(next).id}:${PLAYOFF_STAGE_KEY}`,
    });
    if (!q.ok) return { ok: false, state, added: 0, errors: q.errors };
    //  季後賽接在**最後一場常規賽之後**。+2 是刻意留一天喘息，
    //  也讓「賽季第 N 天」讀起來像真的賽程表而不是連著打。
    const lastRegularDay = Math.max(...regularFixturesOf(next).map((f) => f.day), 1);
    const entry = activeEntryOf(next);
    const st2 = createPlayoffStage({
      competition: entry.competition,
      qualification: q.qualification,
      dayRange: { from: lastRegularDay + 2, to: lastRegularDay + 4 },
    });
    if (!st2.ok) return { ok: false, state, added: 0, errors: st2.errors };
    //  ⚠ Q7a-3b：季後賽住在**它自己那個賽制條目**裡，不是賽季頂層。
    next = withEntry(next, entry.competition.id, {
      ...entry,
      competition: { ...entry.competition, stageIds: [...(entry.competition.stageIds ?? []), st2.stage.id] },
      playoff: { stage: st2.stage, qualification: q.qualification, baseDay: lastRegularDay + 2 },
    });
  }

  //  ② 補出現在排得出來的場次
  const made = ensurePlayoffFixtures({
    stage: activePlayoffOf(next).stage,
    qualification: activePlayoffOf(next).qualification,
    fixtures: playoffFixturesOf(next),
    outcomes: next.outcomes ?? [],
    baseDay: activePlayoffOf(next).baseDay,
  });
  if (!made.ok) return { ok: false, state, added: 0, errors: made.errors };
  if (made.added.length) next = { ...next, fixtures: [...next.fixtures, ...made.added] };
  return { ok: true, state: next, added: made.added.length, errors: [] };
}

/** 季後賽是不是打完了（含季軍戰與決賽）。 */
export function isPlayoffDone(state) {
  if (!activePlayoffOf(state)) return false;
  const fx = playoffFixturesOf(state);
  //  四場都要在（sf1／sf2／bronze／final），而且都收尾
  return fx.length === PLAYOFF_MATCHES.length && fx.every(isFixtureTerminal);
}

/** 季後賽對戰表（畫面用）。 */
export function playoffView(state) {
  if (!activePlayoffOf(state)) return null;
  const fixtures = playoffFixturesOf(state);
  return {
    stageId: activePlayoffOf(state).stage.id,
    qualified: activePlayoffOf(state).qualification.qualified,
    bracket: playoffBracket({
      fixtures, outcomes: state.outcomes ?? [], participants: participantsOf(state),
    }),
    done: isPlayoffDone(state),
    ...playoffOrder({ fixtures, outcomes: state.outcomes ?? [] }),
  };
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
