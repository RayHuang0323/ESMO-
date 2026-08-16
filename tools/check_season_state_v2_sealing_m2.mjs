#!/usr/bin/env node
// 3b-M2 focused verifier: Event / Season sealing boundaries.
// It uses a frozen FinalStandings supplied by the legacy truth source so this
// verifier never invents a production Circuit Points policy.

const { wrapLegacySeasonState, normalizeSeasonStateV2, validateSeasonStateV2 } =
  await import("../src/platform/competition/seasonStateV2.js");
const { createFinalStandings, validateFinalStandings } =
  await import("../src/platform/contracts/finalStandings.js");
const {
  CIRCUIT_POINTS_POLICY_SCHEMA,
  sealEventBoundary,
  sealSeasonBoundary,
} = await import("../src/platform/competition/seasonSealingV2.js");

let pass = 0;
let fail = 0;
const ck = (name, ok, detail = "") => {
  if (ok) { pass += 1; console.log(`PASS ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail += 1; console.log(`FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};

const competition = { schema: "Competition.v1", id: "comp:moba:m2", gameMode: "moba", season: 1 };
const rows = Array.from({ length: 4 }, (_, i) => ({
  rank: i + 1,
  teamId: `team:m2:${i + 1}`,
  name: `M2 ${i + 1}`,
  tag: `M${i + 1}`,
  isAi: i > 0,
  played: 3,
  wins: 3 - i,
  losses: i,
  points: (3 - i) * 3,
  scoreFor: 30,
  scoreAgainst: 20,
  scoreDiff: 10,
  engineGames: 1,
  simulatedGames: 2,
  forfeitedGames: 0,
}));
const finalMade = createFinalStandings({
  standings: { rows, played: 12, rule: { id: "m2" } },
  competition,
  stageId: "stage:m2",
  sealedAtDay: 10,
  playerTeamId: rows[0].teamId,
});
if (!finalMade.ok) throw new Error(finalMade.errors.map((e) => e.message).join("; "));
const final = finalMade.final;
const legacy = {
  schema: "SeasonState.v1",
  season: 1,
  seed: 123,
  startDay: 1,
  competition,
  stage: { id: "stage:m2" },
  fixtures: [{ id: "fx:m2:1", status: "completed", sideA: rows[0].teamId, sideB: rows[1].teamId }],
  outcomes: [{ id: "out:m2:1", fixtureId: "fx:m2:1" }],
  final,
};
const base = wrapLegacySeasonState({ legacyState: legacy, awardLedger: {} });
const baseEvent = base.gameModes[0].circuits[0].events[0];
const activeV2 = (overrides = {}) => normalizeSeasonStateV2({
  ...base,
  status: "active",
  active: { gameMode: "moba", circuitId: baseEvent.circuitId, eventId: baseEvent.id },
  gameModes: [{
    ...base.gameModes[0],
    circuits: [{
      ...base.gameModes[0].circuits[0],
      events: [{
        ...baseEvent,
        status: "active",
        finalId: null,
        final: null,
        pointsSettlementRef: null,
        pointsStatus: "not_started",
        ...overrides,
      }],
    }],
  }],
});
const profile = {
  finance: { funds: 1000, transactions: [] },
  processedCompetitionAwards: {},
  circuitPointsLedger: {},
  matchmaking: { session: { id: "session:m2", state: "live_session" }, fixtureAssignment: { fixtureId: "fx:m2:1" } },
};

ck("legacy FinalStandings remains valid", validateFinalStandings(final).ok);
ck("baseline v2 validates", validateSeasonStateV2(activeV2()).ok);

const incomplete = { ...legacy, fixtures: [{ ...legacy.fixtures[0], status: "scheduled" }] };
const blocked = sealEventBoundary({ seasonStateV2: activeV2(), legacyState: incomplete, profileState: profile, sealedAtDay: 10 });
ck("incomplete Event cannot seal", blocked.ok === false && blocked.reason === "fixtures_not_terminal");

const awardRun = sealEventBoundary({ seasonStateV2: activeV2(), legacyState: legacy, profileState: profile, sealedAtDay: 10 });
ck("normal Event seal succeeds", awardRun.ok === true && awardRun.event.status === "sealed");
ck("Final reference does not copy rows", awardRun.event.final && !Object.prototype.hasOwnProperty.call(awardRun.event.final, "rows"));
ck("Final ID is preserved", awardRun.event.finalId === final.id && awardRun.final.id === final.id);
ck("legacy fixture/outcome IDs are untouched", awardRun.legacyState.fixtures[0].id === legacy.fixtures[0].id && awardRun.legacyState.outcomes[0].id === legacy.outcomes[0].id);
ck("award issued once", awardRun.awardReceipt?.settled === true && Object.keys(awardRun.nextState.processedCompetitionAwards).length === 1);
ck("award and points keys are separate", awardRun.awardReceipt?.awardId !== awardRun.pointsReceipt?.settlementKey);
const awardAgain = sealEventBoundary({ seasonStateV2: awardRun.seasonStateV2, legacyState: awardRun.legacyState, profileState: { ...profile, ...awardRun.nextState }, sealedAtDay: 10 });
ck("repeated Event seal is idempotent", awardAgain.ok && awardAgain.alreadySealed === true && awardAgain.nextState === null);

const noPrizeV2 = activeV2({ prizePolicyRef: null });
const noPrize = sealEventBoundary({ seasonStateV2: noPrizeV2, legacyState: legacy, profileState: profile, sealedAtDay: 10 });
ck("no-prize Event seals without fake receipt", noPrize.ok && noPrize.event.final.awardReceiptRef === null && noPrize.event.final.awardSummary === null);
ck("no-prize Event creates no finance transaction", noPrize.nextState.circuitPointsLedger && (noPrize.nextState.finance?.transactions ?? []).length === 0 && Object.keys(noPrize.nextState.processedCompetitionAwards ?? {}).length === 0);

const policy = {
  schema: CIRCUIT_POINTS_POLICY_SCHEMA,
  id: "policy:m2:test-only",
  pointsByRank: { 1: 10, 2: 6, 3: 3, 4: 1 },
};
const pointsV2 = activeV2({
  pointsPolicyRef: { schema: policy.schema, id: policy.id, path: "policy:test" },
});
const pointsRun = sealEventBoundary({ seasonStateV2: pointsV2, legacyState: legacy, profileState: profile, pointsPolicy: policy, sealedAtDay: 10 });
ck("Circuit Points settle through independent ledger", pointsRun.ok && pointsRun.pointsReceipt?.schema === "CircuitPointsSettlement.v1");
ck("Event stores points reference only", pointsRun.event.pointsSettlementRef?.id === pointsRun.pointsReceipt?.id && !pointsRun.event.pointsSettlementRef?.entries);
ck("Circuit Points settles once", Object.keys(pointsRun.nextState.circuitPointsLedger).length === 1);
const pointsAgain = sealEventBoundary({ seasonStateV2: pointsRun.seasonStateV2, legacyState: pointsRun.legacyState, profileState: { ...profile, ...pointsRun.nextState }, pointsPolicy: policy, sealedAtDay: 10 });
ck("repeated points settlement is idempotent", pointsAgain.ok && pointsAgain.alreadySealed === true);
const deferredPointsV2 = normalizeSeasonStateV2({
  ...awardRun.seasonStateV2,
  gameModes: [{
    ...awardRun.seasonStateV2.gameModes[0],
    circuits: [{
      ...awardRun.seasonStateV2.gameModes[0].circuits[0],
      events: [{ ...awardRun.event, pointsPolicyRef: { schema: policy.schema, id: policy.id, path: "policy:test" } }],
    }],
  }],
});
const deferredPoints = sealEventBoundary({ seasonStateV2: deferredPointsV2, legacyState: awardRun.legacyState, profileState: { ...profile, ...awardRun.nextState }, pointsPolicy: policy, sealedAtDay: 10 });
ck("a sealed Event can fill its missing points ledger once", deferredPoints.ok && deferredPoints.pointsReceipt?.schema === "CircuitPointsSettlement.v1" && deferredPoints.event.pointsStatus === "settled");

const seasonBlocked = sealSeasonBoundary({ seasonStateV2: activeV2() });
ck("Season cannot seal while required Event is open", seasonBlocked.ok === false && seasonBlocked.reason === "events_not_sealed");
const secondEvent = {
  ...awardRun.event,
  id: `${awardRun.event.id}:second`,
  competitionRef: { schema: "Competition.v1", id: "comp:moba:m2:second", path: "competition" },
  fixtureIds: ["fx:m2:second"],
  outcomeIds: ["out:m2:second"],
  finalId: null,
  final: null,
  status: "active",
  sealedAtDay: null,
  pointsPolicyRef: null,
  pointsSettlementRef: null,
  pointsStatus: "not_started",
};
const multiEventState = normalizeSeasonStateV2({
  ...awardRun.seasonStateV2,
  gameModes: [{
    ...awardRun.seasonStateV2.gameModes[0],
    circuits: [{
      ...awardRun.seasonStateV2.gameModes[0].circuits[0],
      eventIds: [awardRun.event.id, secondEvent.id],
      events: [awardRun.event, secondEvent],
    }],
  }],
});
const multiEventBlocked = sealSeasonBoundary({ seasonStateV2: multiEventState });
ck("Season does not ignore another open Event", multiEventBlocked.ok === false && multiEventBlocked.reason === "events_not_sealed");
const seasonSealed = sealSeasonBoundary({ seasonStateV2: awardRun.seasonStateV2, requiredEventIds: [baseEvent.id] });
ck("Season seals after Event", seasonSealed.ok && seasonSealed.seasonStateV2.status === "sealed" && seasonSealed.seasonStateV2.active === null);
const seasonAgain = sealSeasonBoundary({ seasonStateV2: seasonSealed.seasonStateV2, requiredEventIds: [baseEvent.id] });
ck("Season seal is idempotent and does not settle again", seasonAgain.ok && seasonAgain.alreadySealed === true && JSON.stringify(seasonAgain.seasonStateV2) === JSON.stringify(seasonSealed.seasonStateV2));

ck("live session payload is not rewritten by boundary", JSON.stringify(profile.matchmaking) === JSON.stringify({ session: { id: "session:m2", state: "live_session" }, fixtureAssignment: { fixtureId: "fx:m2:1" } }));
ck("history remains legacy-owned", JSON.stringify(base.history) === "[]");
const brokenScope = normalizeSeasonStateV2({
  ...pointsRun.seasonStateV2,
  gameModes: [{
    ...pointsRun.seasonStateV2.gameModes[0],
    circuits: [{
      ...pointsRun.seasonStateV2.gameModes[0].circuits[0],
      events: [{ ...pointsRun.event, pointsSettlementRef: { ...pointsRun.event.pointsSettlementRef, circuitId: "circuit:wrong" } }],
    }],
  }],
});
ck("points scope mismatch fails closed", validateSeasonStateV2(brokenScope).ok === false);

console.log(`\nSeasonState v2 M2 sealing: ${pass}/${pass + fail} PASS`);
process.exitCode = fail ? 1 : 0;
