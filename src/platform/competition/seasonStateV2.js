// SeasonState.v2 is a compatibility index around the existing SeasonState.v1.
//
// The legacy state remains the single source of truth for fixtures, outcomes,
// stages, finals and the Competition object. This module only adds stable
// Season -> Circuit -> Event references; it never copies or reorders gameplay
// data and it never creates a CS event.

export const SEASON_STATE_V2_SCHEMA = "SeasonState.v2";
export const SEASON_V2_SCHEMA = "Season.v1";
export const CIRCUIT_V2_SCHEMA = "Circuit.v1";
export const EVENT_V2_SCHEMA = "Event.v1";
export const EVENT_HISTORY_V2_SCHEMA = "EventHistory.v1";

const finite = (value, fallback = null) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const objectOf = (value) => value && typeof value === "object" ? value : null;
const idsOf = (items) => (Array.isArray(items) ? items : [])
  .map((item) => item?.id ?? item?.fixtureId ?? null)
  .filter((id) => id != null);

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

export function createEmptySeasonStateV2({ season = 1, seed = null, startDay = 1 } = {}) {
  return {
    schema: SEASON_STATE_V2_SCHEMA,
    version: 2,
    season: emptySeason({ season, seed, startDay }),
    active: null,
    gameModes: [],
    history: [],
  };
}

function historyRefs(history) {
  return (Array.isArray(history) ? history : []).map((final) => ({
    schema: EVENT_HISTORY_V2_SCHEMA,
    finalId: final?.id ?? null,
    competitionId: final?.competitionId ?? null,
    season: final?.season ?? null,
    // Keep only an identity reference; competitionHistory remains authoritative.
    legacyFinalRef: {
      id: final?.id ?? null,
      competitionId: final?.competitionId ?? null,
    },
  }));
}

function stageIdsOf(legacyState) {
  return [
    legacyState?.stage?.id,
    legacyState?.playoff?.stage?.id,
    legacyState?.playoff?.qualification?.id,
  ].filter((id, index, all) => id != null && all.indexOf(id) === index);
}

export function wrapLegacySeasonState({ legacyState, competitionHistory = [] } = {}) {
  if (!legacyState?.schema) {
    return createEmptySeasonStateV2({
      season: legacyState?.season,
      seed: legacyState?.seed,
      startDay: legacyState?.startDay,
    });
  }

  const season = emptySeason({
    season: legacyState.season,
    seed: legacyState.seed,
    startDay: legacyState.startDay,
  });
  const circuitId = circuitIdOf(season.id, "moba", "career");
  const eventId = eventIdOf(circuitId, "league");
  const legacyCompetition = objectOf(legacyState.competition);
  const event = {
    schema: EVENT_V2_SCHEMA,
    id: eventId,
    circuitId,
    gameMode: "moba",
    kind: "league",
    legacyStateSchema: legacyState.schema,
    legacyStatePath: "competition",
    legacyCompetitionRef: {
      schema: legacyCompetition?.schema ?? null,
      id: legacyCompetition?.id ?? null,
    },
    // Alias kept explicit for callers that use the product term.
    competitionRef: {
      schema: legacyCompetition?.schema ?? null,
      id: legacyCompetition?.id ?? null,
    },
    stageIds: stageIdsOf(legacyState),
    fixtureIds: idsOf(legacyState.fixtures),
    outcomeIds: idsOf(legacyState.outcomes),
    finalId: legacyState.final?.id ?? null,
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
    season,
    active: { gameMode: "moba", circuitId, eventId },
    // Exactly one MOBA career circuit/event is introduced by this migration.
    gameModes: [{ gameMode: "moba", circuits: [circuit] }],
    history: historyRefs(competitionHistory),
  };
}

export function isSeasonStateV2(value) {
  return value?.schema === SEASON_STATE_V2_SCHEMA && Number(value.version) === 2;
}

/**
 * Migrate or resynchronise the wrapper. Rebuilding this index is deterministic
 * and therefore idempotent; all legacy IDs are read, never generated anew.
 */
export function migrateSeasonStateV2({
  seasonStateV2,
  legacyState,
  competitionHistory = [],
  meta = {},
} = {}) {
  if (legacyState?.schema) {
    return wrapLegacySeasonState({ legacyState, competitionHistory });
  }
  if (isSeasonStateV2(seasonStateV2)) return seasonStateV2;
  return createEmptySeasonStateV2({
    season: meta?.season,
    seed: meta?.seasonSeed,
    startDay: meta?.days,
  });
}

export const syncSeasonStateV2 = migrateSeasonStateV2;

export function activeEventOf(seasonStateV2) {
  const active = seasonStateV2?.active;
  if (!active) return null;
  const mode = (seasonStateV2.gameModes ?? []).find((m) => m.gameMode === active.gameMode);
  const circuit = (mode?.circuits ?? []).find((c) => c.id === active.circuitId);
  return (circuit?.events ?? []).find((event) => event.id === active.eventId) ?? null;
}

/**
 * Compatibility adapter for old callers. They still receive the exact legacy
 * SeasonState.v1, while the active Event is available as metadata.
 */
export function activeEventAdapter({ seasonStateV2, legacyState } = {}) {
  const event = activeEventOf(seasonStateV2);
  const legacyCompetitionId = legacyState?.competition?.id ?? null;
  const compatible = !!event && event.legacyCompetitionRef?.id === legacyCompetitionId;
  return {
    seasonStateV2: seasonStateV2 ?? null,
    active: seasonStateV2?.active ?? null,
    event,
    legacyState: compatible ? legacyState : null,
    competition: compatible ? legacyState?.competition ?? null : null,
  };
}
