// 3b-M2: Event / Season sealing boundaries.
//
// This module is deliberately small and reducer-like. Competition.v1 remains
// authoritative for fixtures, outcomes, stages and FinalStandings. The v2
// objects only receive status and references; settlement ledgers are separate.

import { isFixtureTerminal } from "../contracts/competition.js";
import { validateFinalStandings } from "../contracts/finalStandings.js";
import { applySealSeason, canSealSeason } from "./seasonState.js";
import {
  EVENT_STATUS,
  POINTS_STATUS,
  SEASON_STATUS,
  normalizeSeasonStateV2,
  validateSeasonStateV2,
} from "./seasonStateV2.js";
import { settleCompetitionAwardInState } from "../economy/competitionAward.js";

export const CIRCUIT_POINTS_SETTLEMENT_SCHEMA = "CircuitPointsSettlement.v1";
export const CIRCUIT_POINTS_POLICY_SCHEMA = "CircuitPointsPolicy.v1";

const objectOf = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : null;
const integer = (value) => Number.isInteger(Number(value)) ? Number(value) : null;
const ids = (items, key = "id") => (Array.isArray(items) ? items : []).map((item) => item?.[key] ?? null);
const sameIds = (a, b) => JSON.stringify(a ?? []) === JSON.stringify(b ?? []);

export function allFixturesTerminal(legacyState) {
  const fixtures = Array.isArray(legacyState?.fixtures) ? legacyState.fixtures : [];
  return fixtures.length > 0 && fixtures.every(isFixtureTerminal);
}

export function validateCircuitPointsPolicy(policy) {
  const errors = [];
  if (!objectOf(policy)) errors.push({ code: "points_policy", message: "Circuit Points policy missing" });
  if (policy?.schema !== CIRCUIT_POINTS_POLICY_SCHEMA) {
    errors.push({ code: "points_policy_schema", message: "Circuit Points policy schema missing" });
  }
  if (!policy?.id || typeof policy.id !== "string") {
    errors.push({ code: "points_policy_id", message: "Circuit Points policy id missing" });
  }
  if (!objectOf(policy?.pointsByRank)) {
    errors.push({ code: "points_policy_values", message: "No rank to points policy has been approved" });
  } else {
    for (const [rank, value] of Object.entries(policy.pointsByRank)) {
      const r = integer(rank);
      const points = integer(value);
      if (!r || r < 1 || points == null || points < 0) {
        errors.push({ code: "points_policy_values", message: "Circuit Points policy contains invalid rank/value" });
        break;
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

export function pointsSettlementKey(event, final, policy) {
  return `points:${event?.id ?? "event"}:${final?.id ?? "final"}:${policy?.id ?? "policy"}`;
}

export function settleCircuitPoints({ ledger = {}, event, final, policy, sealedAtDay = null } = {}) {
  const finalCheck = validateFinalStandings(final);
  if (!finalCheck.ok) return { ok: false, alreadySettled: false, receipt: null, nextLedger: ledger, errors: finalCheck.errors };
  const policyCheck = validateCircuitPointsPolicy(policy);
  if (!policyCheck.ok) return { ok: false, alreadySettled: false, receipt: null, nextLedger: ledger, errors: policyCheck.errors };
  if (!event?.id || !event?.circuitId || event.competitionRef?.id !== final.competitionId) {
    return {
      ok: false,
      alreadySettled: false,
      receipt: null,
      nextLedger: ledger,
      errors: [{ code: "points_scope", message: "Event / Competition / Final scope mismatch" }],
    };
  }
  if (!event.pointsPolicyRef || event.pointsPolicyRef.id !== policy.id) {
    return {
      ok: false,
      alreadySettled: false,
      receipt: null,
      nextLedger: ledger,
      errors: [{ code: "points_policy_ref", message: "Event pointsPolicyRef does not match the supplied policy" }],
    };
  }
  const settlementKey = pointsSettlementKey(event, final, policy);
  const existing = objectOf(ledger?.[settlementKey]);
  if (existing) return { ok: true, alreadySettled: true, receipt: existing, nextLedger: ledger, errors: [] };

  const entries = [];
  for (const row of final.rows) {
    const points = integer(policy.pointsByRank?.[String(row.rank)] ?? policy.pointsByRank?.[row.rank]);
    if (points == null || points < 0) {
      return {
        ok: false,
        alreadySettled: false,
        receipt: null,
        nextLedger: ledger,
        errors: [{ code: "points_policy_rank", message: `Circuit Points policy has no value for rank ${row.rank}` }],
      };
    }
    entries.push({ rank: row.rank, teamId: row.teamId, points });
  }
  const receipt = {
    schema: CIRCUIT_POINTS_SETTLEMENT_SCHEMA,
    id: settlementKey,
    settlementKey,
    eventId: event.id,
    circuitId: event.circuitId,
    competitionId: final.competitionId,
    finalId: final.id,
    policyRef: { schema: policy.schema, id: policy.id },
    entries,
    sealedAtDay: integer(sealedAtDay),
  };
  return {
    ok: true,
    alreadySettled: false,
    receipt,
    nextLedger: { ...(ledger ?? {}), [settlementKey]: receipt },
    errors: [],
  };
}

export function finalReferenceEnvelope(final, awardReceipt = null) {
  if (!final?.id) return null;
  const sourceRef = {
    schema: final.schema ?? "FinalStandings.v1",
    id: final.id,
    path: "final",
    competitionId: final.competitionId ?? null,
  };
  const receipt = objectOf(awardReceipt);
  return {
    sourceRef,
    awardReceiptRef: receipt
      ? {
          schema: receipt.schema ?? null,
          id: receipt.awardId ?? receipt.id ?? receipt.receiptId ?? final.id,
          path: "processedCompetitionAwards",
          competitionId: receipt.competitionId ?? final.competitionId ?? null,
          key: final.id,
        }
      : null,
    awardSummary: receipt
      ? {
          settled: receipt.settled === true,
          amount: Number.isFinite(Number(receipt.amount)) ? Number(receipt.amount) : null,
          rank: Number.isFinite(Number(receipt.rank)) ? Number(receipt.rank) : null,
        }
      : null,
  };
}

function updateEvent(seasonStateV2, eventId, update) {
  const normalized = normalizeSeasonStateV2(seasonStateV2);
  return {
    ...normalized,
    gameModes: normalized.gameModes.map((mode) => ({
      ...mode,
      circuits: mode.circuits.map((circuit) => ({
        ...circuit,
        events: circuit.events.map((event) => event.id === eventId ? { ...event, ...update } : event),
      })),
    })),
  };
}

function eventOf(seasonStateV2, eventId = null) {
  const normalized = normalizeSeasonStateV2(seasonStateV2);
  const events = normalized?.gameModes?.flatMap((mode) => mode.circuits?.flatMap((circuit) => circuit.events ?? []) ?? []) ?? [];
  return eventId ? events.find((event) => event.id === eventId) ?? null : events.length === 1 ? events[0] : null;
}

export function sealEventBoundary({
  seasonStateV2,
  legacyState,
  profileState = {},
  eventId = null,
  sealedAtDay = null,
  pointsPolicy = null,
  allowUnscored = true,
} = {}) {
  const normalized = normalizeSeasonStateV2(seasonStateV2);
  const v2Check = validateSeasonStateV2(normalized);
  if (!v2Check.ok) return { ok: false, reason: "invalid_season_state_v2", errors: v2Check.errors };
  const event = eventOf(normalized, eventId);
  if (!event) return { ok: false, reason: "event_not_found", errors: [{ code: "event_not_found", message: "Event not found" }] };
  if (!legacyState?.competition?.id || event.competitionRef?.id !== legacyState.competition.id) {
    return { ok: false, reason: "competition_scope_mismatch", errors: [{ code: "competition_scope", message: "Event competitionRef does not match legacy Competition" }] };
  }
  if (!sameIds(event.fixtureIds, ids(legacyState.fixtures)) || !sameIds(event.outcomeIds, ids(legacyState.outcomes, "id"))) {
    return { ok: false, reason: "legacy_index_mismatch", errors: [{ code: "legacy_index", message: "Event fixture/outcome index does not match legacy Competition" }] };
  }
  if (event.status === EVENT_STATUS.sealed) {
    if (!legacyState.final || event.finalId !== legacyState.final.id) {
      return { ok: false, reason: "final_scope_mismatch", errors: [{ code: "final_scope", message: "Sealed Event final does not match legacy FinalStandings" }] };
    }
    if (event.pointsStatus !== POINTS_STATUS.settled && pointsPolicy) {
      const points = settleCircuitPoints({
        ledger: profileState?.circuitPointsLedger ?? {},
        event,
        final: legacyState.final,
        policy: pointsPolicy,
        sealedAtDay,
      });
      if (!points.ok) return { ok: false, reason: "points_failed", errors: points.errors };
      const nextSeasonStateV2 = updateEvent(normalized, event.id, {
        pointsSettlementRef: { schema: points.receipt.schema, id: points.receipt.id, path: "circuitPointsLedger", eventId: event.id, circuitId: event.circuitId },
        pointsStatus: POINTS_STATUS.settled,
      });
      return {
        ok: true,
        alreadySealed: true,
        event: eventOf(nextSeasonStateV2, event.id),
        final: legacyState.final,
        awardReceipt: profileState?.processedCompetitionAwards?.[legacyState.final.id] ?? null,
        pointsReceipt: points.receipt,
        seasonStateV2: nextSeasonStateV2,
        legacyState,
        nextState: { circuitPointsLedger: points.nextLedger },
        errors: [],
      };
    }
    return {
      ok: true,
      alreadySealed: true,
      event,
      final: legacyState?.final ?? null,
      awardReceipt: profileState?.processedCompetitionAwards?.[legacyState?.final?.id] ?? null,
      pointsReceipt: event.pointsSettlementRef ? profileState?.circuitPointsLedger?.[event.pointsSettlementRef.id] ?? null : null,
      seasonStateV2: normalized,
      legacyState,
      nextState: null,
      errors: [],
    };
  }
  if (!allFixturesTerminal(legacyState)) {
    return { ok: false, reason: "fixtures_not_terminal", errors: [{ code: "fixtures_not_terminal", message: "All Event fixtures must be terminal" }] };
  }
  let nextLegacy = legacyState;
  let final = legacyState.final ?? null;
  if (!final) {
    const can = canSealSeason(legacyState);
    if (!can.ok && !can.sealed) return { ok: false, reason: "final_not_ready", errors: [{ code: "final_not_ready", message: can.reason }] };
    const applied = applySealSeason(legacyState, integer(sealedAtDay) ?? 1);
    if (!applied.ok) return { ok: false, reason: "final_failed", errors: applied.errors ?? [] };
    nextLegacy = applied.state;
    final = applied.final;
  }
  const finalCheck = validateFinalStandings(final);
  if (!finalCheck.ok) return { ok: false, reason: "invalid_final", errors: finalCheck.errors };

  let nextProfile = null;
  let awardReceipt = null;
  if (event.prizePolicyRef) {
    const award = settleCompetitionAwardInState(profileState, { final, day: sealedAtDay });
    if (!award.receipt?.ok && !award.receipt?.alreadySettled) {
      return { ok: false, reason: "award_failed", errors: award.receipt?.errors ?? [] };
    }
    awardReceipt = award.receipt;
    nextProfile = award.nextState;
  }

  let pointsReceipt = null;
  let nextPointsLedger = profileState?.circuitPointsLedger ?? {};
  let pointsStatus = POINTS_STATUS.policyRequired;
  if (pointsPolicy) {
    const points = settleCircuitPoints({ ledger: nextPointsLedger, event, final, policy: pointsPolicy, sealedAtDay });
    if (!points.ok) return { ok: false, reason: "points_failed", errors: points.errors };
    pointsReceipt = points.receipt;
    nextPointsLedger = points.nextLedger;
    pointsStatus = POINTS_STATUS.settled;
  } else if (!allowUnscored) {
    return { ok: false, reason: "points_policy_required", errors: [{ code: "points_policy_required", message: "Circuit Points policy is not sealed" }] };
  }

  const nextV2 = updateEvent(normalized, event.id, {
    status: EVENT_STATUS.sealed,
    sealedAtDay: integer(sealedAtDay) ?? final.sealedAtDay ?? null,
    finalId: final.id,
    final: finalReferenceEnvelope(final, event.prizePolicyRef ? awardReceipt : null),
    pointsSettlementRef: pointsReceipt ? { schema: pointsReceipt.schema, id: pointsReceipt.id, path: "circuitPointsLedger", eventId: event.id, circuitId: event.circuitId, competitionId: final.competitionId } : null,
    pointsStatus,
  });
  const profilePatch = nextProfile ? { ...nextProfile, circuitPointsLedger: nextPointsLedger } : { circuitPointsLedger: nextPointsLedger };
  return {
    ok: true,
    alreadySealed: false,
    event: eventOf(nextV2, event.id),
    final,
    awardReceipt,
    pointsReceipt,
    seasonStateV2: nextV2,
    legacyState: nextLegacy,
    nextState: profilePatch,
    errors: [],
  };
}

export function sealSeasonBoundary({ seasonStateV2, requiredEventIds = null } = {}) {
  const normalized = normalizeSeasonStateV2(seasonStateV2);
  const v2Check = validateSeasonStateV2(normalized);
  if (!v2Check.ok) return { ok: false, reason: "invalid_season_state_v2", errors: v2Check.errors };
  if (normalized.status === SEASON_STATUS.sealed) {
    return { ok: true, alreadySealed: true, seasonStateV2: normalized, errors: [] };
  }
  const events = normalized.gameModes.flatMap((mode) => mode.circuits.flatMap((circuit) => circuit.events));
  if (events.length === 0) {
    return { ok: false, reason: "no_events", errors: [{ code: "no_events", message: "Season has no Event to seal" }] };
  }
  const required = requiredEventIds ?? events.map((event) => event.id);
  const missing = required.filter((id) => !events.some((event) => event.id === id));
  if (missing.length) return { ok: false, reason: "event_not_found", errors: [{ code: "event_not_found", message: "Required Event not found" }] };
  const open = required.filter((id) => events.find((event) => event.id === id)?.status !== EVENT_STATUS.sealed);
  if (open.length) return { ok: false, reason: "events_not_sealed", errors: [{ code: "events_not_sealed", message: "Required Events are not sealed" }] };
  return {
    ok: true,
    alreadySealed: false,
    seasonStateV2: { ...normalized, status: SEASON_STATUS.sealed, active: null },
    errors: [],
  };
}
