// SeasonState.v2 is a compatibility index around the existing SeasonState.v1.
//
// The legacy state remains the single source of truth for fixtures, outcomes,
// stages, finals and the Competition object. This module only adds stable
// Season -> Circuit -> Event references; it never copies or reorders gameplay
// data and it never creates a CS event.

import { fanPolicyRefFor } from "./awardPolicy.js";

export const SEASON_STATE_V2_SCHEMA = "SeasonState.v2";
export const SEASON_STATE_V1_SCHEMA = "SeasonState.v1";
export const SEASON_V2_SCHEMA = "Season.v1";
export const CIRCUIT_V2_SCHEMA = "Circuit.v1";
export const EVENT_V2_SCHEMA = "Event.v1";
export const EVENT_HISTORY_V2_SCHEMA = "EventHistory.v1";
export const EVENT_STATUS = Object.freeze({ active: "active", sealed: "sealed" });
export const SEASON_STATUS = Object.freeze({ active: "active", sealed: "sealed" });
export const POINTS_STATUS = Object.freeze({
  notStarted: "not_started",
  policyRequired: "policy_required",
  settled: "settled",
});

// Compatibility reference only. It points at the existing Q4 award algorithm
// and policy; it does not copy a prize table into SeasonState.v2.
export function legacyPrizePolicyRefFor(competitionId = null) {
  if (!competitionId) return null;
  return {
    schema: "CompetitionPrizePolicy.v1",
    id: "legacy:competition-prize:v1",
    path: "competitionAward:COMPETITION_PRIZE",
    competitionId,
  };
}

const finite = (value, fallback = null) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const stringOrNull = (value) => typeof value === "string" && value.length ? value : null;
const objectOf = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : null;
const idsOf = (items) => (Array.isArray(items) ? items : [])
  .map((item) => item?.id ?? item?.fixtureId ?? null)
  .filter((id) => id != null);
const sameIds = (a, b) => JSON.stringify(a ?? []) === JSON.stringify(b ?? []);

export const seasonIdOf = (season) => `season:s${Math.max(1, Math.floor(finite(season, 1)))}`;
export const circuitIdOf = (seasonId, gameMode = "moba", ladder = "career") =>
  `circuit:${seasonId}:${gameMode}:${ladder}`;
export const eventIdOf = (circuitId, eventKey = "league") => `event:${circuitId}:${eventKey}`;

function emptySeason({ season = 1, seed = null, startDay = 1 } = {}) {
  const number = Math.max(1, Math.floor(finite(season, 1)));
  return {
    schema: SEASON_V2_SCHEMA,
    id: seasonIdOf(number),
    number,
    seed: finite(seed),
    startDay: Math.max(1, Math.floor(finite(startDay, 1))),
  };
}

export function createEmptySeasonStateV2({ season = 1, seed = null, startDay = 1, history = [] } = {}) {
  return {
    schema: SEASON_STATE_V2_SCHEMA,
    version: 2,
    status: SEASON_STATUS.active,
    season: emptySeason({ season, seed, startDay }),
    active: null,
    gameModes: [],
    history: Array.isArray(history) ? history : [],
  };
}

function sourceRefOf(final, path = "competitionHistory") {
  const id = stringOrNull(final?.id);
  if (!id) return null;
  return {
    schema: final?.schema ?? "FinalStandings.v1",
    id,
    path,
    competitionId: final?.competitionId ?? null,
  };
}

function historyRefs(history) {
  return (Array.isArray(history) ? history : []).map((final) => {
    const sourceRef = sourceRefOf(final);
    return {
      schema: EVENT_HISTORY_V2_SCHEMA,
      finalId: final?.id ?? null,
      competitionId: final?.competitionId ?? null,
      season: final?.season ?? null,
      // Keep only an identity reference; competitionHistory remains authoritative.
      sourceRef,
    };
  });
}

function stageIdsOf(legacyState) {
  // Preserve legacy order exactly. This is an index, not a recomputation.
  return [
    legacyState?.stage?.id,
    legacyState?.playoff?.stage?.id,
    legacyState?.playoff?.qualification?.id,
  ].filter((id) => id != null);
}

function playoffRefOf(legacyState) {
  const playoff = objectOf(legacyState?.playoff);
  if (!playoff) return null;
  return {
    id: playoff.id ?? null,
    stageId: playoff.stage?.id ?? null,
    qualificationId: playoff.qualification?.id ?? null,
  };
}

function awardEnvelopeOf(final, awardLedger = {}) {
  const sourceRef = sourceRefOf(final, "final");
  if (!sourceRef) return null;
  const receipt = objectOf(awardLedger?.[final.id]);
  const awardReceiptRef = receipt
      ? {
        schema: receipt.schema ?? null,
        id: receipt.awardId ?? receipt.id ?? receipt.receiptId ?? final.id,
        path: "processedCompetitionAwards",
        competitionId: receipt.competitionId ?? final.competitionId ?? null,
        key: final.id,
      }
    : null;
  const awardSummary = receipt
    ? {
        settled: receipt.settled === true,
        amount: Number.isFinite(Number(receipt.amount)) ? Number(receipt.amount) : null,
        rank: Number.isFinite(Number(receipt.rank)) ? Number(receipt.rank) : null,
      }
    : null;
  return { sourceRef, awardReceiptRef, awardSummary };
}

// Pre-Q7a-3b shape: exactly one top-level Competition, no Event map. This is
// the original wrapper kept verbatim in behaviour so old saves and the
// existing M2 sealing verifier keep migrating the way they always did.
function wrapLegacySingleCompetition({ legacyState, awardLedger = {}, history = [] } = {}) {
  const legacyCompetition = objectOf(legacyState?.competition);
  const season = emptySeason({
    season: legacyState.season,
    seed: legacyState.seed,
    startDay: legacyState.startDay,
  });
  const circuitId = circuitIdOf(season.id, "moba", "career");
  const eventId = eventIdOf(circuitId, "league");
  const final = awardEnvelopeOf(legacyState.final, awardLedger);
  const prizePolicyRef = legacyPrizePolicyRefFor(legacyCompetition.id);
  //  F2.1：這條是**舊存檔的單一賽事**相容路徑。舊存檔不可能有 `fanPolicy`
  //  （F2.1 才出現）⇒ 一律 null，不亂補。行為與 F2.1 之前逐值相同。
  const fanPolicyRef = legacyState?.events
    ? null
    : (legacyState?.fanPolicy ? fanPolicyRefFor(legacyCompetition.id) : null);
  const event = {
    schema: EVENT_V2_SCHEMA,
    id: eventId,
    circuitId,
    gameMode: "moba",
    kind: "league",
    legacyStateSchema: legacyState.schema,
    legacyStatePath: "competition",
    competitionRef: {
      schema: legacyCompetition.schema ?? "Competition.v1",
      id: legacyCompetition.id,
      path: "competition",
    },
    stageIds: [
      legacyState?.stage?.id,
      legacyState?.playoff?.stage?.id,
      legacyState?.playoff?.qualification?.id,
    ].filter((id) => id != null),
    playoffRef: objectOf(legacyState?.playoff)
      ? {
        id: legacyState.playoff.id ?? null,
        stageId: legacyState.playoff.stage?.id ?? null,
        qualificationId: legacyState.playoff.qualification?.id ?? null,
      }
      : null,
    fixtureIds: idsOf(legacyState.fixtures),
    outcomeIds: idsOf(legacyState.outcomes),
    finalId: legacyState.final?.id ?? null,
    status: legacyState.final ? EVENT_STATUS.sealed : EVENT_STATUS.active,
    sealedAtDay: legacyState.final?.sealedAtDay ?? null,
    prizePolicyRef,
    fanPolicyRef,
    pointsPolicyRef: null,
    pointsSettlementRef: null,
    pointsStatus: legacyState.final ? POINTS_STATUS.policyRequired : POINTS_STATUS.notStarted,
    // Final is reference-only: never embed FinalStandings.rows here.
    final,
  };
  const circuit = {
    schema: CIRCUIT_V2_SCHEMA,
    id: circuitId,
    seasonId: season.id,
    gameMode: "moba",
    ladderId: "career",
    eventIds: [eventId],
    events: [event],
    points: null,
    pointsStatus: "not_started",
  };
  return {
    schema: SEASON_STATE_V2_SCHEMA,
    version: 2,
    status: SEASON_STATUS.active,
    season,
    active: { gameMode: "moba", circuitId, eventId },
    gameModes: [{ gameMode: "moba", circuits: [circuit] }],
    history,
  };
}

export function wrapLegacySeasonState({ legacyState, competitionHistory = [], awardLedger = {} } = {}) {
  const history = historyRefs(competitionHistory);
  const emptyFor = () => createEmptySeasonStateV2({
    season: legacyState?.season,
    seed: legacyState?.seed,
    startDay: legacyState?.startDay,
    history,
  });

  // The legacy season state has held its Competitions in a map since Q7a-3b;
  // there is no top-level `competition` property to read. Events are the unit
  // this projection mirrors, one v2 Event per legacy Event, and each Event
  // resolves its own Competition through `rankingCompetitionId`.
  const legacyEvents = objectOf(legacyState?.events) ?? {};
  const legacyCompetitions = objectOf(legacyState?.competitions) ?? {};
  const eventIds = Object.keys(legacyEvents);
  if (!legacyState?.schema) return emptyFor();
  // Pre-Q7a-3b saves have no Event map and carry a single top-level
  // Competition. Migration has to keep understanding that shape, so the
  // original single-Event wrapper stays as the path for it.
  if (!eventIds.length) {
    return objectOf(legacyState?.competition)?.id
      ? wrapLegacySingleCompetition({ legacyState, awardLedger, history })
      : emptyFor();
  }

  const season = emptySeason({
    season: legacyState.season,
    seed: legacyState.seed,
    startDay: legacyState.startDay,
  });
  const fixtures = Array.isArray(legacyState.fixtures) ? legacyState.fixtures : [];
  const outcomes = Array.isArray(legacyState.outcomes) ? legacyState.outcomes : [];
  // Single Event keeps the legacy equivalence where the Season final and the
  // Event final are the same object. Multi Event never borrows the Season
  // seal: that object carries no id and is only a sealing marker.
  const onlyOneEvent = eventIds.length === 1;

  const buildEvent = (eventId) => {
    const legacyEvent = objectOf(legacyEvents[eventId]);
    const competitionId = stringOrNull(legacyEvent?.rankingCompetitionId)
      ?? stringOrNull((legacyEvent?.competitionIds ?? [])[0]);
    const entry = competitionId ? objectOf(legacyCompetitions[competitionId]) : null;
    const competition = objectOf(entry?.competition);
    // No Competition means no scope. Skip rather than bind to a neighbour.
    if (!competition?.id) return null;

    const stageIds = [
      entry?.stage?.id,
      entry?.playoff?.stage?.id,
      entry?.playoff?.qualification?.id,
    ].filter((id) => id != null);
    const stageSet = new Set(stageIds);
    const eventFixtures = fixtures.filter((fixture) => stageSet.has(fixture?.stageId));
    const eventFixtureIds = idsOf(eventFixtures);
    const fixtureIdSet = new Set(eventFixtureIds);
    const eventOutcomes = outcomes.filter((outcome) => fixtureIdSet.has(outcome?.fixtureId));

    const legacyFinal = legacyEvent?.final ?? (onlyOneEvent ? (legacyState.final ?? null) : null);
    const final = awardEnvelopeOf(legacyFinal, awardLedger);

    return {
      schema: EVENT_V2_SCHEMA,
      id: eventId,
      circuitId: legacyEvent?.circuitId ?? circuitIdOf(season.id, legacyEvent?.gameMode ?? "moba", "career"),
      gameMode: legacyEvent?.gameMode ?? "moba",
      kind: legacyEvent?.eventKey ?? "league",
      legacyStateSchema: legacyState.schema,
      legacyStatePath: `competitions.${competition.id}`,
      // Exactly one reference slot. The Competition object itself stays in v1.
      competitionRef: {
        schema: competition.schema ?? "Competition.v1",
        id: competition.id,
        path: `competitions.${competition.id}.competition`,
      },
      stageIds,
      playoffRef: entry?.playoff
        ? {
          id: entry.playoff.id ?? null,
          stageId: entry.playoff.stage?.id ?? null,
          qualificationId: entry.playoff.qualification?.id ?? null,
        }
        : null,
      fixtureIds: eventFixtureIds,
      outcomeIds: idsOf(eventOutcomes),
      finalId: legacyFinal?.id ?? null,
      // Status is per Event. One season can hold a running league next to
      // sealed circuit stops, so the Season final cannot answer this.
      status: legacyFinal ? EVENT_STATUS.sealed : EVENT_STATUS.active,
      sealedAtDay: legacyFinal?.sealedAtDay ?? null,
      prizePolicyRef: legacyEvent?.prizePolicy ? legacyPrizePolicyRefFor(competition.id) : null,
      //  F2.1：fan-only 政策與獎金政策平行投影。兩者都沒有 ⇒ 兩個 ref 都是 null
      //  ⇒ 下方 `award_without_policy` 仍然擋住憑空產生的收據（fail-closed 不變）。
      fanPolicyRef: legacyEvent?.fanPolicy ? fanPolicyRefFor(competition.id) : null,
      pointsPolicyRef: null,
      pointsSettlementRef: null,
      pointsStatus: legacyFinal ? POINTS_STATUS.policyRequired : POINTS_STATUS.notStarted,
      // Final is reference-only: never embed FinalStandings.rows here.
      final,
    };
  };

  const events = eventIds.map(buildEvent).filter((event) => event != null);
  if (!events.length) return emptyFor();

  // Group by the legacy circuit ids the Events already carry. The validator
  // requires event.circuitId to equal its circuit, so this mirrors rather
  // than renames.
  const gameModes = [];
  for (const event of events) {
    let mode = gameModes.find((item) => item.gameMode === event.gameMode);
    if (!mode) { mode = { gameMode: event.gameMode, circuits: [] }; gameModes.push(mode); }
    let circuit = mode.circuits.find((item) => item.id === event.circuitId);
    if (!circuit) {
      circuit = {
        schema: CIRCUIT_V2_SCHEMA,
        id: event.circuitId,
        seasonId: season.id,
        gameMode: event.gameMode,
        ladderId: "career",
        eventIds: [],
        events: [],
        points: null,
        pointsStatus: "not_started",
      };
      mode.circuits.push(circuit);
    }
    circuit.eventIds.push(event.id);
    circuit.events.push(event);
  }

  // `activeEventId` is the legacy focus pointer; `careerEventId` is the career
  // main line and must never stand in for it. A sealed Season has no active
  // Event by contract, so the pointer is dropped rather than pointed at a
  // finished Event.
  const sealedSeason = legacyState.final != null;
  const focusId = stringOrNull(legacyState.activeEventId);
  const focus = focusId ? events.find((event) => event.id === focusId) ?? null : null;

  return {
    schema: SEASON_STATE_V2_SCHEMA,
    version: 2,
    status: sealedSeason ? SEASON_STATUS.sealed : SEASON_STATUS.active,
    season,
    active: (sealedSeason || !focus)
      ? null
      : { gameMode: focus.gameMode, circuitId: focus.circuitId, eventId: focus.id },
    gameModes,
    history,
  };
}

function normalizeRef(ref, fallback = null) {
  const source = objectOf(ref);
  if (!source) return fallback;
  const out = {
    schema: source.schema ?? null,
    id: source.id ?? null,
    path: source.path ?? null,
    competitionId: source.competitionId ?? null,
  };
  if (source.key != null) out.key = source.key;
  if (source.eventId != null) out.eventId = source.eventId;
  if (source.circuitId != null) out.circuitId = source.circuitId;
  if (source.competitionId != null) out.competitionId = source.competitionId;
  if (source.settlementKey != null) out.settlementKey = source.settlementKey;
  return out;
}

function normalizeFinalEnvelope(event) {
  const raw = objectOf(event?.final);
  // Q7b stored finalId only. It is upgraded to a reference-only envelope.
  const source = raw?.sourceRef ?? (event?.finalId ? {
    schema: "FinalStandings.v1", id: event.finalId, path: "final", competitionId: event.competitionRef?.id ?? null,
  } : null);
  if (!source) return null;
  return {
    sourceRef: normalizeRef(source),
    awardReceiptRef: normalizeRef(raw?.awardReceiptRef),
    awardSummary: objectOf(raw?.awardSummary) ? {
      settled: raw.awardSummary.settled === true,
      amount: Number.isFinite(Number(raw.awardSummary.amount)) ? Number(raw.awardSummary.amount) : null,
      rank: Number.isFinite(Number(raw.awardSummary.rank)) ? Number(raw.awardSummary.rank) : null,
    } : null,
  };
}

function normalizeHistoryRef(item) {
  const old = objectOf(item);
  if (!old) return item;
  const source = old.sourceRef ?? (old.legacyFinalRef ? {
    schema: old.legacyFinalRef.schema ?? "FinalStandings.v1",
    id: old.legacyFinalRef.id ?? old.finalId ?? null,
    path: old.legacyFinalRef.path ?? "competitionHistory",
    competitionId: old.legacyFinalRef.competitionId ?? old.competitionId ?? null,
  } : null) ?? (old.finalId ? {
    schema: "FinalStandings.v1", id: old.finalId, path: "competitionHistory", competitionId: old.competitionId ?? null,
  } : null);
  return {
    schema: EVENT_HISTORY_V2_SCHEMA,
    finalId: old.finalId ?? source?.id ?? null,
    competitionId: old.competitionId ?? source?.competitionId ?? null,
    season: old.season ?? null,
    sourceRef: normalizeRef(source, null),
  };
}

function normalizeEvent(event) {
  const source = objectOf(event);
  if (!source) return event;
  // A deprecated legacyCompetitionRef is accepted only as a migration alias.
  // If both refs exist they must agree; we never silently choose one.
  const canonical = objectOf(source.competitionRef);
  const deprecated = objectOf(source.legacyCompetitionRef);
  if (canonical && deprecated && (canonical.id !== deprecated.id || (canonical.schema ?? null) !== (deprecated.schema ?? null))) {
    return { ...source, __normalizationConflict: "competitionRef" };
  }
  const competitionRef = canonical ?? deprecated ?? null;
  const finalEnvelope = normalizeFinalEnvelope(source);
  // An older M1 v2 save may already contain the legacy award receipt but not
  // the explicit policy reference. That one compatibility case can be
  // recovered because the event is still bound to SeasonState.v1. Arbitrary
  // v2 events never infer a policy from a receipt.
  const prizePolicyRef = source.prizePolicyRef != null
    ? normalizeRef(source.prizePolicyRef)
    : (finalEnvelope?.awardReceiptRef && source.legacyStateSchema === SEASON_STATE_V1_SCHEMA
      ? legacyPrizePolicyRefFor(competitionRef?.id)
      : null);
  //  F2.1：fan policy 只由既有欄位正規化而來。
  //  ⚠ **刻意沒有任何 inference 分支**——「never infer a policy from a receipt」
  //    對 fan 政策一樣適用。獎金那支的 inference 是 M1 舊存檔的相容特例，
  //    fan 政策沒有舊存檔可相容（F2.1 才出現），所以不需要、也不該有。
  const fanPolicyRef = source.fanPolicyRef != null ? normalizeRef(source.fanPolicyRef) : null;
  const normalized = {
    schema: EVENT_V2_SCHEMA,
    id: source.id ?? null,
    // Scope is never inferred: a missing/mismatched scope must fail closed.
    circuitId: source.circuitId ?? null,
    gameMode: source.gameMode ?? null,
    kind: source.kind ?? "league",
    legacyStateSchema: source.legacyStateSchema ?? null,
    legacyStatePath: source.legacyStatePath ?? "competition",
    competitionRef: competitionRef ? {
      schema: competitionRef.schema ?? "Competition.v1",
      id: competitionRef.id ?? null,
      path: competitionRef.path ?? "competition",
    } : null,
    stageIds: Array.isArray(source.stageIds) ? [...source.stageIds] : [],
    playoffRef: objectOf(source.playoffRef) ? {
      id: source.playoffRef.id ?? null,
      stageId: source.playoffRef.stageId ?? null,
      qualificationId: source.playoffRef.qualificationId ?? null,
    } : null,
    fixtureIds: Array.isArray(source.fixtureIds) ? [...source.fixtureIds] : [],
    outcomeIds: Array.isArray(source.outcomeIds) ? [...source.outcomeIds] : [],
    finalId: source.finalId ?? source.final?.sourceRef?.id ?? null,
    status: source.status ?? (finalEnvelope ? EVENT_STATUS.sealed : EVENT_STATUS.active),
    sealedAtDay: source.sealedAtDay ?? null,
    prizePolicyRef,
    fanPolicyRef,
    pointsPolicyRef: source.pointsPolicyRef != null ? normalizeRef(source.pointsPolicyRef) : null,
    pointsSettlementRef: source.pointsSettlementRef != null ? normalizeRef(source.pointsSettlementRef) : null,
    pointsStatus: source.pointsStatus ?? (source.pointsSettlementRef ? POINTS_STATUS.settled : (finalEnvelope ? POINTS_STATUS.policyRequired : POINTS_STATUS.notStarted)),
    final: finalEnvelope,
    ...(source.__normalizationConflict ? { __normalizationConflict: source.__normalizationConflict } : {}),
  };
  if (Object.prototype.hasOwnProperty.call(source.final ?? {}, "rows")) {
    normalized.__normalizationConflict = normalized.__normalizationConflict ?? "final_rows";
  }
  return normalized;
}

function allEventsOf(seasonStateV2) {
  return (seasonStateV2?.gameModes ?? [])
    .flatMap((mode) => (mode?.circuits ?? []).flatMap((circuit) => circuit?.events ?? []));
}

// The legacy indexes that belong to **one** Event, resolved the same way
// `buildEvent` resolves them at wrap time.
//
// ⚠ Pre-Q7a-3b saves keep a single top-level Competition and own every
//   fixture. Since Q7a-3b, Events live in a map and each one reaches its own
//   Competition through `rankingCompetitionId`; `legacyState.competition` does
//   not exist in that shape, so it can neither scope an index nor be the thing
//   an index is compared against. Reading it froze every Event index — and had
//   the comparison passed, it would have handed one Event every other Event's
//   fixtures.
//
// Returns null when the Event has no resolvable Competition: that is missing
// scope, not an empty index.
function legacyIndexesFor(legacyState, eventId) {
  const legacyEvents = objectOf(legacyState?.events) ?? {};
  const eventIds = Object.keys(legacyEvents);
  if (!eventIds.length) {
    const competitionId = stringOrNull(objectOf(legacyState?.competition)?.id);
    if (!competitionId) return null;
    return {
      competitionId,
      stageIds: stageIdsOf(legacyState),
      playoffRef: playoffRefOf(legacyState),
      fixtureIds: idsOf(legacyState?.fixtures),
      outcomeIds: idsOf(legacyState?.outcomes),
      finalId: legacyState?.final?.id ?? null,
    };
  }
  const legacyEvent = objectOf(legacyEvents[eventId]);
  if (!legacyEvent) return null;
  const competitionId = stringOrNull(legacyEvent.rankingCompetitionId)
    ?? stringOrNull((legacyEvent.competitionIds ?? [])[0]);
  const entry = competitionId ? objectOf(objectOf(legacyState?.competitions)?.[competitionId]) : null;
  if (!entry) return null;
  // Stage ids scope the fixtures, fixtures scope the outcomes — the same chain
  // `buildEvent` walks, so refresh and wrap cannot drift apart.
  const stageIds = stageIdsOf(entry);
  const stageSet = new Set(stageIds);
  const fixtureIds = idsOf((Array.isArray(legacyState?.fixtures) ? legacyState.fixtures : [])
    .filter((fixture) => stageSet.has(fixture?.stageId)));
  const fixtureIdSet = new Set(fixtureIds);
  const outcomeIds = idsOf((Array.isArray(legacyState?.outcomes) ? legacyState.outcomes : [])
    .filter((outcome) => fixtureIdSet.has(outcome?.fixtureId)));
  // Single Event keeps the legacy equivalence where the Season final and the
  // Event final are the same object; multi Event never borrows the Season seal.
  const finalId = legacyEvent.final?.id
    ?? (eventIds.length === 1 ? (legacyState?.final?.id ?? null) : null)
    ?? null;
  return { competitionId, stageIds, playoffRef: playoffRefOf(entry), fixtureIds, outcomeIds, finalId };
}

// Legacy gameplay writes may append playoff fixtures/outcomes after the v2
// wrapper was first created. Refresh only the deterministic ID indexes, each
// Event against its own Competition; never change Event/Circuit/Competition
// scope or any sealing/settlement reference.
function refreshLegacyIndexes(seasonStateV2, legacyState) {
  const active = seasonStateV2?.active;
  if (!active) return seasonStateV2;
  const prefixOnly = (stored, canonical) => {
    const old = Array.isArray(stored) ? stored : [];
    return old.length <= canonical.length && old.every((id, index) => id === canonical[index]);
  };
  const bound = activeEventOf(seasonStateV2);
  if (!bound) return null;
  const usesEventMap = Object.keys(objectOf(legacyState?.events) ?? {}).length > 0;
  // The single Competition shape holds exactly one Event, so "the bound Event"
  // and "every Event" are the same set there and its scope stays verbatim.
  // ⚠ With an Event map, refreshing only the focused Event would tie index
  //   freshness to what the player happens to be *looking at* — the same class
  //   of defect as a stale active pointer.
  const targets = usesEventMap ? allEventsOf(seasonStateV2) : [bound];
  const canonicalById = new Map();
  for (const event of targets) {
    const canonical = legacyIndexesFor(legacyState, event.id);
    if (!canonical) {
      // Missing scope for the bound Event fails closed; for any other Event,
      // leave its stored index untouched rather than rebind it to a neighbour.
      if (event.id === bound.id) return null;
      continue;
    }
    // Scope is compared, never rewritten: a mismatch is corruption.
    if (event.competitionRef?.id !== canonical.competitionId) return null;
    if (!prefixOnly(event.stageIds, canonical.stageIds)
      || !prefixOnly(event.fixtureIds, canonical.fixtureIds)
      || !prefixOnly(event.outcomeIds, canonical.outcomeIds)) {
      // Legacy writes may append IDs (for example, playoff fixtures), but an
      // existing mismatch is corruption. Never repair/rebind it during load.
      return null;
    }
    canonicalById.set(event.id, canonical);
  }
  return {
    ...seasonStateV2,
    gameModes: (seasonStateV2.gameModes ?? []).map((mode) => ({
      ...mode,
      circuits: (mode.circuits ?? []).map((circuit) => ({
        ...circuit,
        events: (circuit.events ?? []).map((event) => {
          const canonical = canonicalById.get(event.id);
          if (!canonical) return event;
          return {
            ...event,
            stageIds: canonical.stageIds,
            playoffRef: canonical.playoffRef,
            fixtureIds: canonical.fixtureIds,
            outcomeIds: canonical.outcomeIds,
            // A missing legacy index may be filled from canonical state; an
            // existing finalId is never rebound to a different FinalStandings.
            finalId: event.finalId ?? canonical.finalId ?? null,
          };
        }),
      })),
    })),
  };
}

/**
 * Normalize only representation details from Q7b. It never repairs a scope:
 * mismatched event/circuit/competition/active IDs remain visible to the
 * validator and therefore fail closed.
 */
export function normalizeSeasonStateV2(value) {
  if (!value || typeof value !== "object") return value;
  if (value.schema !== SEASON_STATE_V2_SCHEMA || Number(value.version) !== 2) return value;
  const season = objectOf(value.season) ? {
    schema: value.season.schema ?? SEASON_V2_SCHEMA,
    id: value.season.id ?? null,
    number: value.season.number ?? null,
    seed: value.season.seed ?? null,
    startDay: value.season.startDay ?? null,
  } : value.season;
  const gameModes = Array.isArray(value.gameModes) ? value.gameModes.map((mode) => ({
    gameMode: mode?.gameMode ?? null,
    circuits: Array.isArray(mode?.circuits) ? mode.circuits.map((circuit) => ({
      schema: circuit?.schema ?? CIRCUIT_V2_SCHEMA,
      id: circuit?.id ?? null,
      seasonId: circuit?.seasonId ?? null,
      // Scope is never inferred from the parent during normalization.
      gameMode: circuit?.gameMode ?? null,
      ladderId: circuit?.ladderId ?? "career",
      eventIds: Array.isArray(circuit?.eventIds) ? [...circuit.eventIds] : [],
      events: Array.isArray(circuit?.events)
        ? circuit.events.map((event) => normalizeEvent(event))
        : [],
      points: circuit?.points ?? null,
      pointsStatus: circuit?.pointsStatus ?? "not_started",
    })) : [],
  })) : [];
  return {
    schema: SEASON_STATE_V2_SCHEMA,
    version: 2,
    status: value.status ?? SEASON_STATUS.active,
    season,
    active: value.active == null ? null : {
      gameMode: value.active.gameMode ?? null,
      circuitId: value.active.circuitId ?? null,
      eventId: value.active.eventId ?? null,
    },
    gameModes,
    history: Array.isArray(value.history) ? value.history.map(normalizeHistoryRef) : [],
  };
}

function validateCanonical(value) {
  const errors = [];
  if (value?.status != null && !Object.values(SEASON_STATUS).includes(value.status)) {
    errors.push({ code: "season_status", message: "invalid season status" });
  }
  if (!value || typeof value !== "object") return [{ code: "invalid", message: "SeasonState.v2 必須是物件" }];
  if (value.schema !== SEASON_STATE_V2_SCHEMA) errors.push({ code: "schema", message: "SeasonState.v2 schema 不符" });
  if (Number(value.version) !== 2) errors.push({ code: "version", message: "SeasonState.v2 version 不符" });
  if (!objectOf(value.season) || value.season.schema !== SEASON_V2_SCHEMA || !value.season.id) {
    errors.push({ code: "season", message: "Season reference 不完整" });
  }
  if (!Array.isArray(value.gameModes) || !Array.isArray(value.history)) {
    errors.push({ code: "shape", message: "gameModes/history 必須是陣列" });
  }

  const modeIds = new Set();
  const circuitIds = new Set();
  const eventIds = new Set();
  const competitionIds = new Set();
  const eventById = new Map();
  for (const mode of value.gameModes ?? []) {
    if (!objectOf(mode) || !stringOrNull(mode.gameMode)) {
      errors.push({ code: "mode", message: "gameMode scope 不完整" });
      continue;
    }
    if (modeIds.has(mode.gameMode)) errors.push({ code: "duplicate_mode", message: "gameMode scope 重複" });
    modeIds.add(mode.gameMode);
    if (!Array.isArray(mode.circuits)) {
      errors.push({ code: "circuits", message: "circuits 必須是陣列" });
      continue;
    }
    for (const circuit of mode.circuits) {
      if (!objectOf(circuit) || circuit.schema !== CIRCUIT_V2_SCHEMA || !stringOrNull(circuit.id)) {
        errors.push({ code: "circuit", message: "Circuit scope 不完整" });
        continue;
      }
      if (circuitIds.has(circuit.id)) errors.push({ code: "duplicate_circuit", message: "circuitId scope 重複" });
      circuitIds.add(circuit.id);
      if (circuit.seasonId !== value.season?.id) errors.push({ code: "circuit_season_mismatch", message: "Circuit 與 Season scope 不一致" });
      if (circuit.gameMode !== mode.gameMode) errors.push({ code: "circuit_mode_mismatch", message: "Circuit 與 gameMode scope 不一致" });
      if (!Array.isArray(circuit.eventIds) || !Array.isArray(circuit.events)) {
        errors.push({ code: "events", message: "eventIds/events 必須是陣列" });
        continue;
      }
      if (!sameIds(circuit.eventIds, circuit.events.map((event) => event?.id))) {
        errors.push({ code: "event_index_mismatch", message: "eventIds 與 events scope 不一致" });
      }
      for (const event of circuit.events) {
        if (!objectOf(event) || event.schema !== EVENT_V2_SCHEMA || !stringOrNull(event.id)) {
          errors.push({ code: "event", message: "Event scope 不完整" });
          continue;
        }
        if (eventIds.has(event.id)) errors.push({ code: "duplicate_event", message: "eventId scope 重複" });
        eventIds.add(event.id);
        eventById.set(event.id, event);
        if (event.__normalizationConflict) {
          errors.push({
            code: event.__normalizationConflict === "final_rows" ? "final_rows" : "competition_ref_conflict",
            message: event.__normalizationConflict === "final_rows"
              ? "Event.final 不得複製 FinalStandings.rows"
              : "Event competitionRef 有衝突，拒絕自動選擇",
          });
        }
        if (event.status != null && !Object.values(EVENT_STATUS).includes(event.status)) {
          errors.push({ code: "event_status", message: "invalid event status" });
        }
        if (event.pointsStatus != null && !Object.values(POINTS_STATUS).includes(event.pointsStatus)) {
          errors.push({ code: "points_status", message: "invalid points status" });
        }
        if (event.status === EVENT_STATUS.sealed && !event.final) {
          errors.push({ code: "sealed_without_final", message: "sealed event requires a final reference" });
        }
        if (event.pointsSettlementRef && event.pointsStatus !== POINTS_STATUS.settled) {
          errors.push({ code: "points_ref_status", message: "points settlement reference/status mismatch" });
        }
        if (event.pointsStatus === POINTS_STATUS.settled && !event.pointsSettlementRef) {
          errors.push({ code: "points_ref_missing", message: "settled points require a settlement reference" });
        }
        if (event.pointsStatus === POINTS_STATUS.settled && !event.pointsPolicyRef) {
          errors.push({ code: "points_policy_missing", message: "settled points require a points policy reference" });
        }
        if (event.pointsSettlementRef && event.pointsSettlementRef.eventId != null && event.pointsSettlementRef.eventId !== event.id) {
          errors.push({ code: "points_event_mismatch", message: "pointsSettlementRef event scope mismatch" });
        }
        if (event.pointsSettlementRef && event.pointsSettlementRef.circuitId != null && event.pointsSettlementRef.circuitId !== event.circuitId) {
          errors.push({ code: "points_circuit_mismatch", message: "pointsSettlementRef circuit scope mismatch" });
        }
        if (event.pointsSettlementRef && event.pointsSettlementRef.competitionId != null && event.pointsSettlementRef.competitionId !== event.competitionRef?.id) {
          errors.push({ code: "points_competition_mismatch", message: "pointsSettlementRef competition scope mismatch" });
        }
        //  F2.1：收據的合法性由**任一種**獎勵政策背書。
        //  · `prizePolicyRef` → 現金獎金　· `fanPolicyRef` → fan-only 品牌獎勵
        //  兩者都沒有 ⇒ 仍然拒絕。這是放寬「哪一種政策算數」，
        //  **不是**打開「沒有政策也可以有收據」——安全邊界一模一樣。
        if (!event.prizePolicyRef && !event.fanPolicyRef && event.final?.awardReceiptRef) {
          errors.push({ code: "award_without_policy", message: "award receipt requires a prize or fan policy reference" });
        }
        if (event.circuitId !== circuit.id) errors.push({ code: "event_circuit_mismatch", message: "Event 與 Circuit scope 不一致" });
        if (event.gameMode !== mode.gameMode) errors.push({ code: "event_mode_mismatch", message: "Event 與 gameMode scope 不一致" });
        if (Object.prototype.hasOwnProperty.call(event, "legacyCompetitionRef")) {
          errors.push({ code: "duplicate_competition_ref", message: "Event 不得同時保留 legacyCompetitionRef" });
        }
        if (!Object.prototype.hasOwnProperty.call(event, "competitionRef")) {
          errors.push({ code: "competition_ref", message: "Event 必須有唯一 competitionRef 欄位" });
        } else if (event.competitionRef != null) {
          if (!objectOf(event.competitionRef) || !stringOrNull(event.competitionRef.id)) {
            errors.push({ code: "competition_ref", message: "competitionRef 不完整" });
          } else if (competitionIds.has(event.competitionRef.id)) {
            errors.push({ code: "duplicate_competition", message: "同一 competitionId 不得綁定多個 Event" });
          } else {
            competitionIds.add(event.competitionRef.id);
          }
        } else {
          errors.push({ code: "competition_ref", message: "Event 必須有唯一 competitionRef reference" });
        }
        if (!Array.isArray(event.stageIds) || !Array.isArray(event.fixtureIds) || !Array.isArray(event.outcomeIds)) {
          errors.push({ code: "event_refs", message: "Event legacy ID references 不完整" });
        }
        const final = event.final;
        if (final != null) {
          if (!objectOf(final) || !objectOf(final.sourceRef) || !stringOrNull(final.sourceRef.id)) {
            errors.push({ code: "final_ref", message: "Event.final 必須是 reference-only envelope" });
          }
          if (Object.prototype.hasOwnProperty.call(final ?? {}, "rows")) {
            errors.push({ code: "final_rows", message: "Event.final 不得複製 FinalStandings.rows" });
          }
          if (event.finalId !== final?.sourceRef?.id) {
            errors.push({ code: "final_scope_mismatch", message: "finalId 與 final.sourceRef scope 不一致" });
          }
          if (final?.sourceRef?.competitionId && event.competitionRef?.id && final.sourceRef.competitionId !== event.competitionRef.id) {
            errors.push({ code: "final_competition_mismatch", message: "Final 與 Competition scope 不一致" });
          }
          if (final?.awardReceiptRef?.competitionId && event.competitionRef?.id && final.awardReceiptRef.competitionId !== event.competitionRef.id) {
            errors.push({ code: "award_competition_mismatch", message: "award receipt competition scope mismatch" });
          }
        } else if (event.finalId != null) {
          errors.push({ code: "final_ref", message: "有 finalId 時必須有 final reference envelope" });
        }
      }
    }
  }

  if (value.active != null) {
    if (!objectOf(value.active) || !stringOrNull(value.active.gameMode) || !stringOrNull(value.active.circuitId) || !stringOrNull(value.active.eventId)) {
      errors.push({ code: "active", message: "active scope 不完整" });
    } else {
      const mode = (value.gameModes ?? []).find((item) => item.gameMode === value.active.gameMode);
      const circuit = mode?.circuits?.find((item) => item.id === value.active.circuitId);
      const event = circuit?.events?.find((item) => item.id === value.active.eventId);
      if (!mode || !circuit || !event) errors.push({ code: "active_scope_mismatch", message: "active event scope 不存在" });
      if (event && (event.circuitId !== value.active.circuitId || event.gameMode !== value.active.gameMode)) {
        errors.push({ code: "active_scope_mismatch", message: "active 與 Event scope 不一致" });
      }
    }
  }
  if (value.status === SEASON_STATUS.sealed && value.active != null) {
    errors.push({ code: "sealed_active", message: "sealed season must have null active" });
  }
  return errors;
}

export function validateSeasonStateV2(value) {
  const errors = validateCanonical(value);
  return { ok: errors.length === 0, errors };
}

export function isSeasonStateV2(value) {
  return validateSeasonStateV2(normalizeSeasonStateV2(value)).ok;
}

// `active` is the projection of the legacy focus pointer (`activeEventId`),
// which `setActiveEvent` moves at runtime. The pointer is **derived**, so a
// legacy focus that has moved on is staleness in an index — not a scope
// conflict, and not something a stored wrapper may outvote.
//
// ⚠ Without this, switching Event kept v2 `active`, `activeEventAdapter` and
//   therefore `competitionView().activeEvent` on the previous Event while the
//   standings and next fixture already followed the new one, and the split
//   survived save/reload.
function realignActivePointer(seasonStateV2, legacyState) {
  // A sealed Season has no active Event by contract: whatever sealing left
  // behind stands, and the focus pointer does not resurrect it.
  if (legacyState?.final != null) return seasonStateV2;
  const focusId = stringOrNull(legacyState?.activeEventId);
  if (!focusId || seasonStateV2?.active?.eventId === focusId) return seasonStateV2;
  const focus = allEventsOf(seasonStateV2).find((event) => event.id === focusId);
  // An unknown focus id is not scope to invent. Keep the stored pointer so the
  // scope check downstream can still fail closed on it.
  if (!focus) return seasonStateV2;
  return {
    ...seasonStateV2,
    active: { gameMode: focus.gameMode, circuitId: focus.circuitId, eventId: focus.id },
  };
}

/**
 * Migrate or resynchronise the wrapper. Rebuilding this index is deterministic
 * and therefore idempotent; all legacy IDs are read, never generated anew.
 */
export function migrateSeasonStateV2({
  seasonStateV2,
  legacyState,
  competitionHistory = [],
  awardLedger = {},
  meta = {},
} = {}) {
  if (seasonStateV2?.schema === SEASON_STATE_V2_SCHEMA && Number(seasonStateV2.version) === 2) {
    const normalized = normalizeSeasonStateV2(seasonStateV2);
    // Do not auto-repair a bad scope. Preserve the value so the adapter fails
    // closed and a caller can surface the validator error instead of rebinding.
    if (!validateSeasonStateV2(normalized).ok) return seasonStateV2;
    const legacyEventMap = objectOf(legacyState?.events) ?? {};
    const hasLegacyScope = Object.keys(legacyEventMap).length > 0
      || objectOf(legacyState?.competition)?.id != null;
    if (legacyState?.schema && hasLegacyScope) {
      const expectedSeasonId = seasonIdOf(legacyState.season);
      // A new legacy season is the one supported rollover boundary: rebuild
      // the metadata wrapper for that new season without touching its IDs.
      if (normalized.season?.id !== expectedSeasonId || normalized.gameModes.length === 0) {
        return wrapLegacySeasonState({ legacyState, competitionHistory, awardLedger });
      }
      // Staleness, not corruption. The projection is derived, so when the
      // legacy Event set or any Event final has moved on — a circuit gets
      // attached, a season seals — the stored wrapper is simply out of date
      // and is rebuilt. Deterministic and idempotent: same legacy in, same
      // wrapper out. Scope conflicts are handled separately below.
      const usesEventMap = Object.keys(legacyEventMap).length > 0;
      const signature = (map) => JSON.stringify(Object.keys(map).sort().map((id) => [id, map[id] ?? null]));
      const legacySignature = signature(Object.fromEntries(
        Object.entries(legacyEventMap).map(([id, ev]) => [id, ev?.final?.id ?? null])));
      const indexedSignature = signature(Object.fromEntries(
        (normalized.gameModes ?? [])
          .flatMap((mode) => (mode.circuits ?? []).flatMap((circuit) => circuit.events ?? []))
          .map((event) => [event.id, event.finalId ?? null])));
      if (usesEventMap && legacySignature !== indexedSignature) {
        return wrapLegacySeasonState({ legacyState, competitionHistory, awardLedger });
      }
      // Legacy owns the focus pointer, so realign before anything reads the
      // active Event: the scope check below must judge the Event the player is
      // actually on, not the one the stored wrapper was written with.
      const aligned = usesEventMap ? realignActivePointer(normalized, legacyState) : normalized;
      // A valid v2 save may intentionally have no active Event; preserve it.
      if (aligned.active == null) return aligned;
      const indexedEvent = activeEventOf(aligned);
      // Within one season, a competition mismatch is corruption, not a cue to
      // rebind the Event. Keep the value and let the adapter fail closed.
      // Scope is compared against the Competition that this Event points at in
      // the legacy state, not a top-level property that no longer exists.
      const activeLegacyEvent = objectOf(legacyEventMap[indexedEvent?.id]);
      const activeLegacyCompetitionId = stringOrNull(activeLegacyEvent?.rankingCompetitionId)
        ?? stringOrNull((activeLegacyEvent?.competitionIds ?? [])[0])
        ?? (usesEventMap ? null : stringOrNull(objectOf(legacyState?.competition)?.id));
      if (!indexedEvent || indexedEvent.competitionRef?.id !== activeLegacyCompetitionId) return seasonStateV2;
      // Final IDs are immutable references. A conflicting stored ID is
      // corruption, not a stale index that migration may silently replace.
      if (indexedEvent.finalId != null && legacyState.final?.id != null && indexedEvent.finalId !== legacyState.final.id) return seasonStateV2;
      const refreshed = refreshLegacyIndexes(aligned, legacyState);
      if (!refreshed) return seasonStateV2;
      if (legacyState?.final?.id && refreshed.active) {
        const currentEvent = activeEventOf(refreshed);
        if (currentEvent && currentEvent.finalId === legacyState.final.id && currentEvent.status !== EVENT_STATUS.sealed) {
          return {
            ...refreshed,
            status: SEASON_STATUS.sealed,
            active: null,
            gameModes: refreshed.gameModes.map((mode) => ({
              ...mode,
              circuits: mode.circuits.map((circuit) => ({
                ...circuit,
                events: circuit.events.map((event) => event.id === currentEvent.id ? { ...event, status: EVENT_STATUS.sealed, sealedAtDay: legacyState.final.sealedAtDay ?? null, final: awardEnvelopeOf(legacyState.final, awardLedger) } : event),
              })),
            })),
          };
        }
      }
      return refreshed;
    }
    return normalized;
  }
  if (legacyState?.schema) {
    return wrapLegacySeasonState({ legacyState, competitionHistory, awardLedger });
  }
  return createEmptySeasonStateV2({
    season: meta?.season,
    seed: meta?.seasonSeed,
    startDay: meta?.days,
    history: historyRefs(competitionHistory),
  });
}

export const syncSeasonStateV2 = migrateSeasonStateV2;

function collectIndexes(seasonStateV2) {
  const normalized = normalizeSeasonStateV2(seasonStateV2);
  const validation = validateSeasonStateV2(normalized);
  if (!validation.ok) return { ok: false, indexes: null, errors: validation.errors };
  const indexes = {
    eventsById: Object.create(null),
    competitionsById: Object.create(null),
    circuitsById: Object.create(null),
  };
  for (const mode of normalized.gameModes) {
    for (const circuit of mode.circuits) {
      indexes.circuitsById[circuit.id] = { gameMode: mode.gameMode, circuit };
      for (const event of circuit.events) {
        indexes.eventsById[event.id] = { gameMode: mode.gameMode, circuitId: circuit.id, event };
        if (event.competitionRef?.id) {
          indexes.competitionsById[event.competitionRef.id] = {
            gameMode: mode.gameMode, circuitId: circuit.id, eventId: event.id, event,
          };
        }
      }
    }
  }
  return { ok: true, indexes, errors: [] };
}

export function buildSeasonStateV2Indexes(seasonStateV2) {
  return collectIndexes(seasonStateV2);
}

export const indexesOfSeasonStateV2 = buildSeasonStateV2Indexes;

export function eventById(seasonStateV2, eventId) {
  return collectIndexes(seasonStateV2).indexes?.eventsById?.[eventId]?.event ?? null;
}

export function eventByCompetitionId(seasonStateV2, competitionId) {
  return collectIndexes(seasonStateV2).indexes?.competitionsById?.[competitionId]?.event ?? null;
}

export function eventsByCircuitId(seasonStateV2, circuitId) {
  const found = collectIndexes(seasonStateV2).indexes?.circuitsById?.[circuitId];
  return found?.circuit?.events ?? [];
}

export function standingsScopeFor(seasonStateV2, { eventId, competitionId, stageId } = {}) {
  const built = collectIndexes(seasonStateV2);
  if (!built.ok) return { ok: false, scope: null, errors: built.errors };
  if (!eventId || !competitionId || !stageId) {
    return { ok: false, scope: null, errors: [{ code: "scope_required", message: "Standings scope 必須同時指定 eventId/competitionId/stageId" }] };
  }
  const indexed = built.indexes.eventsById[eventId];
  const event = indexed?.event;
  if (!event || event.competitionRef?.id !== competitionId || !event.stageIds.includes(stageId)) {
    return { ok: false, scope: null, errors: [{ code: "scope_mismatch", message: "eventId/competitionId/stageId scope 不一致" }] };
  }
  return {
    ok: true,
    errors: [],
    scope: { eventId, competitionId, circuitId: event.circuitId, gameMode: event.gameMode, stageId },
  };
}

export function activeEventOf(seasonStateV2) {
  const normalized = normalizeSeasonStateV2(seasonStateV2);
  if (!validateSeasonStateV2(normalized).ok) return null;
  const active = normalized?.active;
  if (!active) return null;
  return eventById(normalized, active.eventId);
}

/**
 * Compatibility adapter for old callers. They still receive the exact legacy
 * SeasonState.v1, while the active Event is available as metadata. Any scope
 * mismatch returns no legacy state; it never rebinds to another Competition.
 */
export function activeEventAdapter({ seasonStateV2, legacyState } = {}) {
  const normalized = normalizeSeasonStateV2(seasonStateV2);
  const validation = validateSeasonStateV2(normalized);
  let event = validation.ok ? activeEventOf(normalized) : null;
  if (validation.ok && !event && normalized?.active == null) {
    // A sealed Season has no active Event by contract, yet the old callers
    // still need one scoped Event to reach the legacy state. Resolve it from
    // the legacy focus pointer, which is an explicit value rather than a
    // guess, and let the scope check below reject it if it does not match.
    const focusId = stringOrNull(legacyState?.activeEventId);
    if (focusId) event = eventById(normalized, focusId) ?? null;
    if (!event) {
      // Retained for older v2 shapes that predate the focus lookup.
      const sealedEvents = (normalized.gameModes ?? [])
        .flatMap((mode) => (mode.circuits ?? []).flatMap((circuit) => circuit.events ?? []))
        .filter((candidate) => candidate?.status === EVENT_STATUS.sealed);
      if (sealedEvents.length === 1) event = sealedEvents[0];
    }
  }
  // Scope is checked against the Competition that this very Event points at in
  // the legacy state, not against a top-level property that no longer exists.
  const legacyEventEntry = objectOf(objectOf(legacyState?.events)?.[event?.id]);
  const legacyCompetitionId = stringOrNull(legacyEventEntry?.rankingCompetitionId)
    ?? stringOrNull((legacyEventEntry?.competitionIds ?? [])[0])
    ?? null;
  const compatible = !!event
    && !!event.competitionRef?.id
    && event.competitionRef.id === legacyCompetitionId;
  const activeCompatible = normalized?.active == null || compatible;
  return {
    ok: validation.ok && (normalized?.active == null ? (!event || compatible) : !!event && activeCompatible),
    errors: validation.errors,
    seasonStateV2: validation.ok ? normalized : seasonStateV2 ?? null,
    active: validation.ok ? normalized?.active ?? null : null,
    event: compatible ? event : null,
    competitionRef: compatible ? event.competitionRef : null,
    legacyState: compatible ? legacyState : null,
    competition: compatible ? legacyState?.competition ?? null : null,
  };
}
