// ============================================================================
//  platform/competition/asiaCircuit.js — 第一條可運作的亞洲巡迴賽（Q7a-3d）
//
//  ── 這一支存在的理由 ──────────────────────────────────────────────────────
//  3c 把巡迴積分整套做完了，但正式站**沒有任何 Circuit 帶政策** ⇒ 機制休眠。
//  本檔造出第一條真的會跑的巡迴賽：一條 Circuit、三站 Event、掛上
//  `DEFAULT_POINTS_POLICY`，於是「Event 封存 → 給分 → 跨站累積 → Top 4 晉級」
//  這條鏈第一次在真實賽季裡走完。
//
//  ── 三站怎麼排 ────────────────────────────────────────────────────────────
//  分散在賽季的三個區段（產品規則 1），**不刻意安排同日多場**。
//  同日多場的能力保留著（3b 之後本來就支援），但這裡會主動把**玩家自己的**
//  場次錯開已經有比賽的日子——「支援」與「刻意製造」是兩回事。
//
//  ⚠ AI 對 AI 的場次不做錯開：它們會在推進天數時自動模擬，撞在同一天沒有代價，
//    而為了它們去搬日期只會讓賽程變形。
//
//  ── 不做的事 ──────────────────────────────────────────────────────────────
//  不碰既有聯賽的任何一場、不改任何既有 id、不發獎金（三站都 `prizePolicy: null`，
//  正好走一次「沒有獎金的 Event 不得被迫生出假獎金」）、不排季後賽
//  （`expectsPlayoff: false`，否則封存會永遠等一個不存在的季後賽）。
//
//  純函式：不 import React / zustand / localStorage / 亂數 / 時鐘。
// ============================================================================
import { createStage, createCompetition, STAGE_FORMATS, involvesTeam } from "../contracts/competition.js";
import { createCircuit, createEvent, competitionIdForEvent, ID_SCHEMES } from "../contracts/circuit.js";
import { generateSchedule } from "./scheduleGenerator.js";
import { seedForSeason } from "../identity/teamIdentity.js";
import { leagueParticipants } from "./aiTeams.js";
import { DEFAULT_POINTS_POLICY } from "./circuitPoints.js";
import { SEASON_DAYS } from "./regularSeason.js";

/** 這條巡迴賽的 key（`circuit.id` 由它推導）。 */
export const ASIA_CIRCUIT_KEY = "asia";
export const ASIA_CIRCUIT_NAME = "亞洲巡迴賽";

/**
 * 三站的設定。**層級只用 3c 已定義倍率的那三個**——
 * `regular` 1.0 / `major` 1.5 / `championship` 2.0。
 * ⚠ 不得在這裡新增 `cup` 之類的層級：3c 查不到倍率會回 `policy_required`，
 *   那一站就永遠結算不了，整條巡迴賽的晉級資格也跟著永遠發不出來。
 *
 * 日期窗口刻意留白：頭尾各空幾天，三段之間各空 5 天，
 * 讓「賽季有節奏」而不是從第 1 天塞到第 84 天。
 */
export const ASIA_EVENTS = Object.freeze([
  Object.freeze({ key: "spring", name: "春季站", tier: "regular",      dayRange: Object.freeze({ from: 4,  to: 26 }) }),
  Object.freeze({ key: "summer", name: "夏季站", tier: "major",        dayRange: Object.freeze({ from: 32, to: 54 }) }),
  Object.freeze({ key: "autumn", name: "秋季總站", tier: "championship", dayRange: Object.freeze({ from: 60, to: 82 }) }),
]);

/** 這條巡迴賽在某個賽季的 id（與 `createCircuit` 的推導一致）。 */
export const asiaCircuitIdFor = (gameMode, season) => `circuit:${gameMode}:s${season}:${ASIA_CIRCUIT_KEY}`;

function gameModeOf(state) {
  const first = Object.values(state?.competitions ?? {})[0];
  return first?.competition?.gameMode ?? "moba";
}

/** 這個賽季狀態裡有沒有亞洲巡迴賽（冪等判定用）。 */
export const hasAsiaCircuit = (state) =>
  !!state?.circuits?.[asiaCircuitIdFor(gameModeOf(state), state?.season)];

/** 玩家已經有比賽的日子（賽季日，不是遊戲日）。 */
function playerBusyDays(fixtures, playerTeamId) {
  const days = new Set();
  for (const f of fixtures ?? []) if (involvesTeam(f, playerTeamId)) days.add(f.day);
  return days;
}

/**
 * 把「玩家有份、卻撞到已排比賽」的整個輪次搬到最近的空日。
 *
 * ⚠ **搬整個輪次而不是搬單一場**：同一輪的四場是同一批對戰，拆開會讓
 *   賽程表變成一天一場的碎片，也會讓「第幾輪」與日期失去對應關係。
 * ⚠ 只在 `dayRange` 內找，找不到就**維持原樣**——寧可同日兩場，
 *   也不要把場次丟到賽季區段之外（那才是真的會壞掉的事）。
 */
function relocateBusyRounds(fixtures, playerTeamId, busy, dayRange) {
  const byRound = new Map();
  for (const f of fixtures) {
    if (!byRound.has(f.round)) byRound.set(f.round, { day: f.day, hasPlayer: false });
    if (involvesTeam(f, playerTeamId)) byRound.get(f.round).hasPlayer = true;
  }
  const used = new Set([...byRound.values()].map((r) => r.day));
  const moved = new Map();

  //  依輪次順序處理，結果才與輸入順序無關（決定性）
  for (const round of [...byRound.keys()].sort((a, b) => a - b)) {
    const info = byRound.get(round);
    if (!info.hasPlayer || !busy.has(info.day)) { busy.add(info.day); continue; }
    let picked = null;
    //  由近而遠往兩側找：+1, −1, +2, −2……（同距離先取往後，賽程不倒退）
    for (let d = 1; d <= SEASON_DAYS && picked == null; d++) {
      for (const cand of [info.day + d, info.day - d]) {
        if (cand < dayRange.from || cand > dayRange.to) continue;
        if (busy.has(cand) || used.has(cand)) continue;
        picked = cand; break;
      }
    }
    if (picked == null) { busy.add(info.day); continue; }
    used.delete(info.day); used.add(picked);
    busy.add(picked);
    moved.set(round, picked);
  }
  if (moved.size === 0) return { fixtures, moved: 0 };
  //  ⚠ 只改 `day`。`fixture.id` 由 stage/round/雙方推導，**不含日期** ⇒ 搬日期
  //    不會換 id，已經寫好的賽果與 seed 也不受影響。
  return {
    fixtures: fixtures.map((f) => (moved.has(f.round) ? { ...f, day: moved.get(f.round) } : f)),
    moved: moved.size,
  };
}

/**
 * 造出一站：Event + Competition + Stage + 賽程。
 *
 * ⚠ 單循環（`legs: 1`）：8 隊 ⇒ 7 輪 7 場（玩家自己打 7 場）。
 *   雙循環會讓玩家一季多打 42 場，那不是「加一條巡迴賽」，那是換一個遊戲。
 */
function buildStop({ circuit, stop, participants, seasonSeed, season, playerTeamId, busy }) {
  const event = createEvent({ circuit, eventKey: stop.key, name: `${ASIA_CIRCUIT_NAME} ${stop.name}`, tier: stop.tier });
  if (!event.ok) return { ok: false, errors: event.errors };

  const base = createCompetition({ gameMode: circuit.gameMode, season, organizerId: ASIA_CIRCUIT_KEY, tier: stop.tier });
  if (!base.ok) return { ok: false, errors: base.errors };
  //  Q7a-3a 定義的 v2 推導：id 由**賽事身分**決定，不再是「賽季＋主辦＋層級」
  const competition = {
    ...base.competition,
    id: competitionIdForEvent(event.event, stop.tier),
    eventId: event.event.id,
    circuitId: circuit.id,
    idScheme: ID_SCHEMES.event,
  };

  const stg = createStage({
    competition, format: STAGE_FORMATS.round_robin, participants,
    legs: 1, key: stop.key, dayRange: stop.dayRange,
  });
  if (!stg.ok) return { ok: false, errors: stg.errors };

  //  每一站各自派生種子 ⇒ 三站的對戰順序不會長得一模一樣
  const sch = generateSchedule({ stage: stg.stage, seed: seedForSeason(seasonSeed, `${season}:${ASIA_CIRCUIT_KEY}:${stop.key}`) });
  if (!sch.ok) return { ok: false, errors: sch.errors };

  const spread = relocateBusyRounds(sch.fixtures, playerTeamId, busy, stop.dayRange);

  return {
    ok: true,
    errors: [],
    event: {
      ...event.event,
      competitionIds: [competition.id],
      //  一站只有一個賽制 ⇒ 名次來源可以自動指定（3b 的規則）
      rankingCompetitionId: competition.id,
      //  ⚠ **沒有獎金**。巡迴賽給的是積分，不是錢——這也正好讓
      //    「沒有 prizePolicy 的 Event 不得被迫生出假獎金」走一次真實情境。
      prizePolicy: null,
      final: null,
    },
    entry: {
      competition: { ...competition, stageIds: [stg.stage.id] },
      stage: stg.stage,
      playoff: null,
      //  ⚠ 沒有季後賽。宣告成 true 的話，封存會永遠等一個不會出現的季後賽。
      expectsPlayoff: false,
    },
    fixtures: spread.fixtures,
    moved: spread.moved,
  };
}

/**
 * 把亞洲巡迴賽加進一個**剛建好的**賽季狀態。
 *
 * ⚠ **冪等**：已經有這條巡迴賽就原樣回傳同一個參考。
 * ⚠ **只加不改**：既有的 `competitions` / `events` / `fixtures` 一個都不動，
 *   聯賽的 56 場與它們的 id 完全不受影響。
 *
 * @param {object} p.playerTeam  需要 `id`
 * @param {number} p.seasonSeed  meta.seasonSeed
 */
export function applyAsiaCircuit(state, { playerTeam, seasonSeed } = {}) {
  if (!state?.schema) return { ok: false, state, added: 0, errors: [{ code: "no_season", message: "目前沒有賽季" }] };
  const gameMode = gameModeOf(state);
  const circuitId = asiaCircuitIdFor(gameMode, state.season);
  if (state.circuits?.[circuitId]) {
    return { ok: true, state, added: 0, alreadyApplied: true, circuitId, errors: [] };
  }
  if (!playerTeam?.id) return { ok: false, state, added: 0, errors: [{ code: "team", message: "缺少隊伍識別碼" }] };
  if (typeof seasonSeed !== "number" || !Number.isFinite(seasonSeed)) {
    return { ok: false, state, added: 0, errors: [{ code: "season_seed", message: "缺少賽季種子" }] };
  }

  const made = createCircuit({
    gameMode, season: state.season, circuitKey: ASIA_CIRCUIT_KEY, name: ASIA_CIRCUIT_NAME,
    //  ⚠ 3c 的政策**原封不動拿來用**，不在這裡新增任何數字
    pointsPolicy: DEFAULT_POINTS_POLICY,
  });
  if (!made.ok) return { ok: false, state, added: 0, errors: made.errors };

  const participants = leagueParticipants(playerTeam);
  const busy = playerBusyDays(state.fixtures, playerTeam.id);

  const events = {}; const entries = {}; const fixtures = []; const eventIds = [];
  let moved = 0;
  for (const stop of ASIA_EVENTS) {
    const built = buildStop({
      circuit: made.circuit, stop, participants,
      seasonSeed, season: state.season, playerTeamId: playerTeam.id, busy,
    });
    if (!built.ok) return { ok: false, state, added: 0, errors: built.errors };
    events[built.event.id] = built.event;
    entries[built.entry.competition.id] = built.entry;
    fixtures.push(...built.fixtures);
    eventIds.push(built.event.id);
    moved += built.moved;
  }

  return {
    ok: true,
    errors: [],
    alreadyApplied: false,
    circuitId,
    added: fixtures.length,
    movedRounds: moved,
    state: {
      ...state,
      circuits: { ...state.circuits, [made.circuit.id]: { ...made.circuit, eventIds } },
      events: { ...state.events, ...events },
      competitions: { ...state.competitions, ...entries },
      fixtures: [...state.fixtures, ...fixtures],
    },
  };
}
