/**
 * Focused integration gate for the P0 Competition runtime and R63 ActiveMatch.
 *
 * This is intentionally a direct, low-cost store-level gate. It does not alter
 * production code or verify.mjs. The browser release-gate gap is documented in
 * the handoff; this gate proves the persisted runtime contract and the official
 * fixture writeback path without inventing a second simulator.
 */
import fs from "node:fs";

const KEY = "esmo.profile.v1";
let persisted = null;
globalThis.localStorage = {
  getItem: (key) => (key === KEY ? persisted : null),
  setItem: (key, value) => { if (key === KEY) persisted = value; },
  removeItem: (key) => { if (key === KEY) persisted = null; },
};

const source = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const profileCode = source("src/platform/profileStore.js");

const { useProfileStore } = await import("../src/platform/profileStore.js");
const { activeCompetitionOf, fixturesOfCompetition } =
  await import("../src/platform/competition/seasonState.js");
const { isFixtureSession, fixtureIdOfSession } =
  await import("../src/platform/competition/fixtureResultBridge.js");
const { outcomeFromBattleResult } =
  await import("../src/platform/progress/settleMatchBoundary.js");
const { mobaResultToTransaction } =
  await import("../src/platform/progress/adapters/mobaProgressAdapter.js");

let pass = 0;
let fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) {
    pass += 1;
    console.log(`PASS ${label}${detail ? ` :: ${detail}` : ""}`);
  } else {
    fail += 1;
    console.log(`FAIL ${label}${detail ? ` :: ${detail}` : ""}`);
  }
};

const getState = () => useProfileStore.getState();
const competitionFixtureToday = () => {
  const competition = getState().competition;
  const active = activeCompetitionOf(competition);
  const ids = new Set(fixturesOfCompetition(competition, active?.id ?? null).map((f) => f.id));
  return (getState().competitionView().todayPending ?? []).find((f) => ids.has(f.id)) ?? null;
};

const advanceToFixture = (maxSteps = 60) => {
  for (let i = 0; i < maxSteps; i += 1) {
    const fixture = competitionFixtureToday();
    if (fixture) return fixture;
    const pending = getState().competitionView().todayPending ?? [];
    if (pending.length) {
      getState().forfeitFixture(pending[0].id);
      continue;
    }
    const advanced = getState().advanceDay(7);
    if (advanced.daysAdvanced === 0) break;
  }
  return null;
};

const launchFixture = (fixtureId) => {
  const started = getState().startFixtureMatch(fixtureId, 1000);
  if (!started.ok) return started;
  let now = 2000;
  for (let i = 0; i < 8; i += 1) {
    getState().pollMatchRoom(now);
    if (getState().matchmakingView(now).state === "ready_check") break;
    now += 1000;
  }
  const ready = getState().confirmMatchReady(now + 1000);
  if (!ready.ok) return ready;
  for (let i = 0; i < 12; i += 1) {
    now += 1500;
    getState().pollMatchRoom(now);
    if (getState().matchRoomView(now).state === "confirmed") break;
  }
  const made = getState().createMatchSession(now);
  if (!made.ok) return made;
  return getState().launchMatchSession(now + 1);
};

const battleResult = () => {
  const players = (getState().players ?? []).slice(0, 5).map((player, index) => ({
    id: player.id,
    side: "blue",
    role: player.role ?? "MID",
    heroId: null,
    lv: 12,
    k: 5,
    d: 2,
    a: 4,
    gold: 12000,
    dmg: 20000,
    heal: 0,
    twrDmg: 3000,
    participation: 0.7,
    rating: 7.5,
    won: true,
    mvp: index === 0,
  }));
  return {
    schema: "BattleResult.v2",
    mode: "moba",
    teams: { blue: { name: "player" }, red: { name: "opponent" } },
    winner: "blue",
    duration: 1832,
    score: { blue: 24, red: 17 },
    gold: { blue: 60000, red: 52000 },
    towers: { blue: 7, red: 3 },
    dragon: 2,
    baron: 1,
    tactic: null,
    tacticExecution: null,
    timeline: [],
    mvpId: players[0]?.id ?? null,
    players,
  };
};

// 1. Start from a fresh deterministic profile, then use a real Competition fixture.
getState().startNewGame("standard");
getState().ensureCompetitionSeason();
getState().advanceDay(30);
const fixture = competitionFixtureToday();
check("Competition fixture is available", !!fixture, fixture?.id ?? "none");

if (!fixture) {
  console.log(`R63 × Competition combined gate: ${pass}/${pass + fail} passed`);
  process.exitCode = 1;
} else {
  const playerTeamId = getState().competition.playerTeamId;
  const launch = launchFixture(fixture.id);
  const launched = getState().matchmaking.session;
  const active = launched?.activeMatch;
  check("startFixtureMatch launches the official fixture session", launch.ok && !!launched);
  check("ActiveMatch.v1 keeps fixture origin", isFixtureSession(launched) && fixtureIdOfSession(launched) === fixture.id);
  check("ActiveMatch identity is stable", !!active?.matchId && active.mode === "moba" && active.seed === launched.seed);
  const lineupPresent = active?.lineup && typeof active.lineup === "object" && Object.keys(active.lineup).length > 0;
  check("lineup and opponent are persisted", !!lineupPresent && active.opponent?.id === launched.opponent?.id,
    `lineup=${JSON.stringify(active?.lineup ?? null)} opponent=${active?.opponent?.id ?? null}`);

  const matchId = active?.matchId;
  const seed = launched?.seed;
  const lineup = JSON.stringify(active?.lineup ?? null);
  const opponentId = active?.opponent?.id ?? null;
  const saved = getState().pauseActiveMatch({
    mode: "moba",
    snapshot: { schema: "MobaSnapshot.v1", frame: 12, score: { blue: 3, red: 2 } },
    simulationTimeSec: 74,
    phase: "battle",
    now: 5000,
  });
  check("battle progress is saved as a paused snapshot", saved.ok && getState().activeMatchView().simulation?.timeSec === 74);
  check("Competition view exposes the same live fixture", getState().competitionView().live?.fixtureId === fixture.id);

  // Simulate browser reload using the persisted profile. A cache-busted module import
  // creates a second Zustand store from the same localStorage payload.
  const reloaded = await import(`../src/platform/profileStore.js?combined-reload=${Date.now()}`);
  const reloadState = () => reloaded.useProfileStore.getState();
  const restored = reloadState().matchmaking?.session;
  check("persisted reload restores the same match", restored?.activeMatch?.matchId === matchId);
  check("persisted reload keeps seed / lineup / opponent", restored?.seed === seed &&
    JSON.stringify(restored?.activeMatch?.lineup ?? null) === lineup &&
    restored?.activeMatch?.opponent?.id === opponentId);

  const resumed = reloadState().resumeMatchSession(6000);
  check("resume returns to the same active match", resumed.ok && reloadState().matchmaking.session.activeMatch.matchId === matchId);
  check("resume does not create a second session", reloadState().matchmaking.session.sessionId === launched.sessionId);

  // The fixture result below is a valid deterministic test fixture for the official
  // BattleResult -> MatchResult -> progress -> fixture writeback chain. The R63 gate
  // separately verifies normal/fast simulator equivalence; this gate verifies the
  // Competition boundary and idempotent store transaction together.
  const result = battleResult();
  const outcome = outcomeFromBattleResult(result, matchId);
  const transaction = mobaResultToTransaction(result, {
    players: reloadState().players,
    lineup: reloadState().lineup,
    streak: 0,
    fansNow: reloadState().meta?.fans ?? 0,
  });
  const first = reloadState().reportMatchResult(outcome, transaction, { now: 7000 });
  check("official result transaction succeeds", first.ok && first.receipt?.ok === true, first.errors?.[0]?.code ?? "");
  const completedFixture = reloadState().competition.fixtures.find((f) => f.id === fixture.id);
  const writtenOutcome = reloadState().competition.outcomes.find((o) => o.fixtureId === fixture.id);
  check("_writeFixtureResultFromMatch completes the fixture", completedFixture?.status === "completed");
  check("fixture outcome is written with the official engine result", writtenOutcome?.resultSource === "engine" && writtenOutcome?.fixtureId === fixture.id);
  check("standings / competition progress receive the outcome", !!writtenOutcome && writtenOutcome.winner === playerTeamId);

  const outcomeCount = reloadState().competition.outcomes.length;
  const processedCount = Object.keys(reloadState().processedMatchTransactions ?? {}).length;
  const fundsAfterFirst = reloadState().finance?.funds;
  const duplicate = reloadState().reportMatchResult(outcome, transaction, { now: 8000 });
  check("duplicate result does not create another outcome", reloadState().competition.outcomes.length === outcomeCount);
  check("duplicate result does not issue another settlement", Object.keys(reloadState().processedMatchTransactions ?? {}).length === processedCount &&
    reloadState().finance?.funds === fundsAfterFirst && (duplicate.receipt?.alreadyApplied === true || duplicate.receipt?.ok === true));

  check("integration source keeps P0 legacy Competition runtime truth",
    /const state = get\(\)\.competition;/.test(profileCode) &&
    /if \(P0_V2_SEALING_BOUNDARY\)/.test(profileCode) &&
    /const state = get\(\)\.competition;/.test(profileCode));
  check("no active Competition runtime path was rewired to v2 adapter",
    !/const state = get\(\)\.activeCompetitionEvent\(\)\.legacyState;/.test(profileCode));
}

console.log(`R63 × Competition combined gate: ${pass}/${pass + fail} passed`);
if (fail > 0) process.exitCode = 1;
