#!/usr/bin/env node
// Q7b focused verifier: SeasonState.v1 -> metadata-only SeasonState.v2.
// It deliberately checks identity and live-session invariants instead of
// asserting a second copy of gameplay data.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const KEY = "esmo.profile.v1";
let raw = null;
globalThis.localStorage = {
  getItem: (key) => key === KEY ? raw : null,
  setItem: (key, value) => { if (key === KEY) raw = value; },
  removeItem: (key) => { if (key === KEY) raw = null; },
};

const {
  createSeasonState,
} = await import("../src/platform/competition/seasonState.js");
const {
  migrateSeasonStateV2, activeEventOf, activeEventAdapter,
  validateSeasonStateV2, buildSeasonStateV2Indexes, standingsScopeFor,
} = await import("../src/platform/competition/seasonStateV2.js");

let pass = 0;
let fail = 0;
const ck = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`PASS ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail++; console.log(`FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};
const json = (value) => JSON.stringify(value);
const ids = (items) => (items ?? []).map((item) => item.id ?? item.fixtureId);

// 1) Pure legacy wrapping: IDs are references, not regenerated gameplay data.
const made = createSeasonState({
  playerTeam: { id: "team:q7b", name: "Q7b", tag: "Q7B" },
  season: 3,
  seasonSeed: 987654,
  startDay: 12,
});
const firstFixture = made.state.fixtures[0];
const legacy = {
  ...made.state,
  outcomes: [{ id: "outcome:legacy-q7b", fixtureId: firstFixture.id, winner: "team:q7b" }],
  final: { id: "final:legacy-q7b", season: 3, competitionId: made.state.competition.id },
};
const history = [{ id: "final:history-q7b", season: 2, competitionId: "comp:moba:s2:official:regular" }];
const v2 = migrateSeasonStateV2({ legacyState: legacy, competitionHistory: history });
const event = activeEventOf(v2);
ck("legacy state migrates", v2.schema === "SeasonState.v2" && v2.active?.gameMode === "moba");
ck("single MOBA career route", v2.gameModes.length === 1 && v2.gameModes[0].gameMode === "moba" &&
  v2.gameModes[0].circuits.length === 1 && v2.gameModes[0].circuits[0].ladderId === "career" &&
  v2.gameModes[0].circuits[0].events.length === 1 && v2.gameModes[0].circuits[0].events[0].kind === "league");
ck("legacy Competition reference", event?.competitionRef?.id === legacy.competition.id &&
  event?.legacyStatePath === "competition");
ck("fixture IDs preserved", json(event?.fixtureIds) === json(ids(legacy.fixtures)));
ck("outcome IDs preserved", json(event?.outcomeIds) === json(ids(legacy.outcomes)));
ck("stage/playoff/final references preserved", event?.stageIds.includes(legacy.stage.id) &&
  event?.finalId === legacy.final.id);
ck("competitionHistory references preserved", json(v2.history[0]?.sourceRef) === json({
  schema: "FinalStandings.v1", id: history[0].id, path: "competitionHistory", competitionId: history[0].competitionId,
}));
ck("reference-only final envelope", validateSeasonStateV2(v2).ok && event?.final?.sourceRef?.id === legacy.final.id &&
  !Object.prototype.hasOwnProperty.call(event?.final ?? {}, "rows"));
ck("deterministic indexes", (() => {
  const built = buildSeasonStateV2Indexes(v2);
  const scope = standingsScopeFor(v2, { eventId: event.id, competitionId: legacy.competition.id, stageId: legacy.stage.id });
  return built.ok && built.indexes.eventsById[event.id]?.event?.id === event.id && scope.ok && scope.scope.circuitId === event.circuitId;
})());
ck("scope mismatch fails closed", !standingsScopeFor(v2, {
  eventId: event.id, competitionId: "comp:wrong", stageId: legacy.stage.id,
}).ok);
ck("active null is valid", validateSeasonStateV2({ ...v2, active: null }).ok);
ck("no CS Event created", v2.gameModes.every((mode) => mode.gameMode !== "cs"));
const stateWithEvent = (transform) => {
  const copy = JSON.parse(json(v2));
  const circuit = copy.gameModes[0].circuits[0];
  circuit.events[0] = transform(circuit.events[0]);
  return copy;
};
ck("same Event has only one competitionRef", !validateSeasonStateV2(stateWithEvent((item) => ({
  ...item, legacyCompetitionRef: { ...item.competitionRef },
}))).ok);
ck("duplicate competition binding fails closed", (() => {
  const copy = JSON.parse(json(v2));
  const circuit = copy.gameModes[0].circuits[0];
  const second = { ...circuit.events[0], id: `${circuit.events[0].id}:duplicate` };
  circuit.events = [circuit.events[0], second];
  circuit.eventIds = circuit.events.map((item) => item.id);
  return !validateSeasonStateV2(copy).ok;
})());
ck("event/circuit scope mismatch fails closed", !validateSeasonStateV2(stateWithEvent((item) => ({
  ...item, circuitId: "circuit:wrong",
}))).ok);
ck("active scope mismatch fails closed", !validateSeasonStateV2({
  ...v2, active: { ...v2.active, circuitId: "circuit:wrong" },
}).ok);
ck("final rows fail closed", !validateSeasonStateV2(stateWithEvent((item) => ({
  ...item, final: { ...item.final, rows: [] },
}))).ok);
const mismatchedAdapter = activeEventAdapter({
  seasonStateV2: v2,
  legacyState: { ...legacy, competition: { ...legacy.competition, id: "comp:wrong" } },
});
ck("adapter competition mismatch fails closed", mismatchedAdapter.ok === false && mismatchedAdapter.legacyState === null);

// 2) v2 -> v2 must be byte-for-byte stable for the same legacy state.
const again = migrateSeasonStateV2({
  seasonStateV2: v2,
  legacyState: legacy,
  competitionHistory: history,
});
ck("v2 migration is idempotent", json(again) === json(v2));
const oldQ7bV2 = JSON.parse(json(v2));
const oldQ7bEvent = oldQ7bV2.gameModes[0].circuits[0].events[0];
oldQ7bEvent.legacyCompetitionRef = oldQ7bEvent.competitionRef;
delete oldQ7bEvent.competitionRef;
delete oldQ7bEvent.final;
oldQ7bV2.history[0].legacyFinalRef = oldQ7bV2.history[0].sourceRef;
delete oldQ7bV2.history[0].sourceRef;
const oldQ7bReloaded = migrateSeasonStateV2({ seasonStateV2: oldQ7bV2 });
ck("old v2 representation normalizes canonically", validateSeasonStateV2(oldQ7bReloaded).ok &&
  oldQ7bReloaded.gameModes[0].circuits[0].events[0].competitionRef.id === legacy.competition.id &&
  !Object.prototype.hasOwnProperty.call(oldQ7bReloaded.gameModes[0].circuits[0].events[0], "legacyCompetitionRef") &&
  oldQ7bReloaded.history[0].sourceRef.id === history[0].id);
const digestOf = (value) => createHash("sha256").update(json(value)).digest("hex");
const digestA = digestOf(migrateSeasonStateV2({ legacyState: legacy, competitionHistory: history }));
const digestB = digestOf(migrateSeasonStateV2({ legacyState: legacy, competitionHistory: history }));
ck("repeated deterministic digest", digestA === digestB, digestA);
const adapter = activeEventAdapter({ seasonStateV2: v2, legacyState: legacy });
ck("active Event adapter returns legacy state", adapter.event?.id === event.id && adapter.legacyState === legacy);

// 3) Empty profile migration does not invent a competition, circuit or event.
raw = JSON.stringify({ schemaVersion: 1, competition: null, competitionHistory: [] });
const emptyModule = await import("../src/platform/profileStore.js?q7b-empty");
const empty = emptyModule.useProfileStore.getState();
ck("empty state migration", empty.competition === null && empty.seasonStateV2?.schema === "SeasonState.v2" &&
  empty.seasonStateV2.active === null && empty.seasonStateV2.gameModes.length === 0);

// 4) Build an old save containing a live fixture session and immutable history.
raw = null;
const firstModule = await import("../src/platform/profileStore.js?q7b-legacy");
const store = () => firstModule.useProfileStore.getState();
store().startNewGame("standard");
store().ensureCompetitionSeason();
let current = store();
const fixture = current.competition.fixtures.find((f) => f.sideA === current.competition.playerTeamId || f.sideB === current.competition.playerTeamId);
const t0 = 8_000_000;
const started = store().startFixtureMatch(fixture.id, t0);
let tick = t0 + 200;
for (let i = 0; i < 30 && store().matchmaking.room?.state === "waiting"; i++) {
  tick += 500;
  store().pollMatchRoom(tick);
}
store().confirmMatchReady(tick + 10);
for (let i = 0; i < 30 && store().matchmaking.room?.state !== "confirmed"; i++) {
  tick += 400;
  store().pollMatchRoom(tick);
}
const sessionMade = store().createMatchSession(tick + 13_000);
const launched = sessionMade.ok ? store().launchMatchSession(tick + 13_100) : sessionMade;
current = store();
const legacyCompetition = current.competition;
const fixtureIdsBefore = ids(legacyCompetition.fixtures);
const outcomeIdsBefore = ids(legacyCompetition.outcomes);
const receipt = {
  receiptId: "receipt:q7b",
  finalId: "final:receipt-q7b",
  competitionId: legacyCompetition.competition.id,
};
const historyBefore = [{ id: "final:history-live", season: 1, competitionId: legacyCompetition.competition.id }];
firstModule.useProfileStore.setState({
  competitionHistory: historyBefore,
  processedCompetitionAwards: { [receipt.finalId]: receipt },
  competition: {
    ...legacyCompetition,
    final: { id: receipt.finalId, schema: "FinalStandings.v1", competitionId: legacyCompetition.competition.id },
    outcomes: [{ id: "outcome:live", fixtureId: fixture.id }],
  },
});
store().save();
const savedWithV2 = JSON.parse(raw);
const oldMatchmaking = savedWithV2.matchmaking;
delete savedWithV2.seasonStateV2;
raw = JSON.stringify(savedWithV2);
const oldFixtureIds = ids(savedWithV2.competition.fixtures);
const oldOutcomeIds = ids(savedWithV2.competition.outcomes);
const oldHistoryJson = json(savedWithV2.competitionHistory);
const oldAwardsJson = json(savedWithV2.processedCompetitionAwards);
const oldSessionId = savedWithV2.matchmaking.session?.sessionId;
const oldSeed = savedWithV2.matchmaking.session?.seed;
ck("live legacy fixture session prepared", started.ok && launched.ok && oldSessionId && oldSeed != null);

// 5) Load the old save: wrapper creation must not touch any old state or ID.
const secondModule = await import("../src/platform/profileStore.js?q7b-reload");
const reloaded = secondModule.useProfileStore.getState();
const loaded = secondModule.useProfileStore.getState();
const loadedFixtureIds = ids(loaded.competition?.fixtures);
const loadedOutcomeIds = ids(loaded.competition?.outcomes);
const mmIdentity = (mm) => ({
  ticket: mm?.ticket ?? null,
  room: mm?.room ?? null,
  session: mm?.session ?? null,
  launch: mm?.launch ?? null,
  fixtureAssignment: mm?.fixtureAssignment ?? null,
  lastResult: mm?.lastResult ?? null,
  settlements: mm?.settlements ?? {},
  lastSettlementError: mm?.lastSettlementError ?? null,
});
ck("legacy save loads", loaded.competition?.schema === "SeasonState.v1" && loaded.seasonStateV2?.schema === "SeasonState.v2");
ck("fixture/outcome IDs survive save load", json(loadedFixtureIds) === json(oldFixtureIds) && json(loadedOutcomeIds) === json(oldOutcomeIds));
ck("history survives save load", json(loaded.competitionHistory) === oldHistoryJson);
ck("settlement receipt survives save load", json(loaded.processedCompetitionAwards) === oldAwardsJson);
ck("live session binding survives save load", json(mmIdentity(loaded.matchmaking)) === json(mmIdentity(oldMatchmaking)) &&
  loaded.matchmaking.fixtureAssignment?.origin?.fixtureId === fixture.id);
ck("active Event points at loaded Competition", loaded.seasonStateV2.active?.eventId &&
  loaded.seasonStateV2.gameModes[0].circuits[0].events[0].competitionRef.id === loaded.competition.competition.id);
ck("award receipt reference survives migration", loaded.seasonStateV2.gameModes[0].circuits[0].events[0].final?.awardReceiptRef?.key === receipt.finalId &&
  loaded.seasonStateV2.gameModes[0].circuits[0].events[0].final.awardReceiptRef.id === receipt.receiptId &&
  loaded.seasonStateV2.gameModes[0].circuits[0].events[0].final.awardReceiptRef.competitionId === receipt.competitionId);

const resumed = secondModule.useProfileStore.getState().resumeMatchSession(tick + 13_500);
const resumedState = secondModule.useProfileStore.getState();
ck("live session resumes after migration", resumed.ok && resumedState.matchmaking.session?.state === "launched" &&
  resumedState.matchmaking.session.sessionId === oldSessionId && resumedState.matchmaking.session.seed === oldSeed);

// 6) Saving/reloading v2 does not append a duplicate event or alter history.
secondModule.useProfileStore.getState().save();
const v2Saved = JSON.parse(raw).seasonStateV2;
const thirdModule = await import("../src/platform/profileStore.js?q7b-v2again");
const v2Reloaded = thirdModule.useProfileStore.getState();
ck("v2 save reload is idempotent", json(v2Reloaded.seasonStateV2) === json(v2Saved) &&
  v2Reloaded.seasonStateV2.gameModes[0].circuits[0].events.length === 1 &&
  json(v2Reloaded.competitionHistory) === oldHistoryJson);

// 7) Re-run the Q7a live-session/same-day verifier and validate its exit shape.
const safety = spawnSync(process.execPath, ["tools/check_q7a_safety.mjs"], {
  cwd: process.cwd(), encoding: "utf8",
});
ck("single live session and same-day safety", safety.status === 0 && /18\/18/.test(safety.stdout ?? ""),
  `exit=${safety.status}`);

console.log(`\nSeasonState v2 Q7b: ${pass}/${pass + fail} PASS`);
process.exit(fail === 0 ? 0 : 1);
