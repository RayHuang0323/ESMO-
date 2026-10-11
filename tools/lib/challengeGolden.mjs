// ============================================================================
//  tools/lib/challengeGolden.mjs — v20 golden 的 Challenge 輸入重建（Phase 3a Task 5）
//
//  把 tools/fixtures/match_golden_v20.json 的 challenge 案例（params）重建成 runChallenge 的真實輸入：
//  兩份 SquadSnapshot.v1、凍結的 ChallengeInstance.v1、（有 draft 時）凍結的 DraftResult.v1。
//  步驟與 tools/capture_match_golden_v20.mjs 的 challengeInputs() 逐步相同（golden 就是那樣產生的）。
//
//  共用者：check_match_assembler_3a（組裝器直接組：setup 編碼）與 check_challenge_setup_3a（走真實 runChallenge）。
//  兩邊吃同一份重建 ⇒ 「輸入重建」不可能在兩支 gate 間悄悄分歧。
// ============================================================================
import { CHAMPIONS_100, heroById } from "../../src/data/heroDatabase.js";
import { snapshotHashOf, SNAPSHOT_INPUTS, snapshotCovers } from "../../src/platform/contracts/squadSnapshot.js";
import { mobaTacticById } from "../../src/platform/contracts/MobaTacticConfig.js";
import { fixtureSnapshot, FIXTURE_OPPONENTS } from "../../src/platform/challenge/fixtureOpponents.js";
import { createDraftResult } from "../../src/platform/challenge/draftResult.js";
import { assignDraft } from "../../src/battle/moba/mobaDraftAssignment.js";
import { heroTags } from "../../src/data/heroClassification.js";
import { createChallengeInstance } from "../../src/platform/contracts/challengeInstance.js";
import { SNAPSHOT_AUTHORITY } from "../../src/platform/challenge/snapshotAuthority.js";

export const GOLDEN_POOL = CHAMPIONS_100.map((h) => h.id).sort();
const laneOf = (id) => heroById(id)?.lane ?? null;
export const FIXTURE_KEYS = FIXTURE_OPPONENTS.map((o) => o.key);

export const withTactic = (snap, tacticId) => {
  const s = { ...snap, standingOrders: { ...snap.standingOrders, tacticId } };
  s.hash = snapshotHashOf(s);
  return s;
};
export const withoutDraftPolicy = (snap) => {
  const s = { ...snap, capturedInputs: snap.capturedInputs.filter((x) => x !== SNAPSHOT_INPUTS.draftPolicy) };
  s.hash = snapshotHashOf(s);
  return s;
};

/**
 * buildChallengeMatchSetup 的入參（與 runChallenge 的內部決定相同：快照宣告了才組）。
 * Phase 3a T7 由 check_challenge_setup_3a 抽出，check_match_setup_3a 共用。
 * @param {ReturnType<typeof challengeGoldenInputs>} v
 * @param {boolean} withDraft  false ⇒ 不帶 draftResult（英雄層不組）
 */
export function challengeBuilderArgs(v, withDraft) {
  const use = {
    loadout: snapshotCovers(v.challenger, SNAPSHOT_INPUTS.heroLoadout) && snapshotCovers(v.defender, SNAPSHOT_INPUTS.heroLoadout),
    stats: snapshotCovers(v.challenger, SNAPSHOT_INPUTS.playerStats) && snapshotCovers(v.defender, SNAPSHOT_INPUTS.playerStats),
    tactic: snapshotCovers(v.challenger, SNAPSHOT_INPUTS.tactic) && snapshotCovers(v.defender, SNAPSHOT_INPUTS.tactic),
  };
  return {
    seed: v.challenge.matchSeed, opponentKey: v.challenge.opponentKey ?? null,
    challengerSnapshot: v.challenger, defenderSnapshot: v.defender, use,
    tactics: use.tactic ? { blue: mobaTacticById(v.challenge.challengerTacticId), red: mobaTacticById(v.challenge.defenderTacticId) } : null,
    draftResult: withDraft ? v.draftResult : null, heroOf: heroById,
  };
}

/**
 * @param {{ id: string, params: { index: number, seed: number, draft: boolean, tacticIds: [string, string] } }} c  golden challenge 案例
 * @returns {{ challenger: object, defender: object, challenge: object, draftResult: object|null, keyA: string, keyB: string }}
 */
export function challengeGoldenInputs(c) {
  const p = c.params;
  const keyA = FIXTURE_KEYS[p.index % FIXTURE_KEYS.length], keyB = FIXTURE_KEYS[(p.index + 2) % FIXTURE_KEYS.length];
  let a = withTactic(fixtureSnapshot(keyA, { playerMasteryLevel: 1 }).snapshot, p.tacticIds[0]);
  let d = withTactic(fixtureSnapshot(keyB, { playerMasteryLevel: 1 }).snapshot, p.tacticIds[1]);
  if (!p.draft) { a = withoutDraftPolicy(a); d = withoutDraftPolicy(d); }
  let draftResult = null;
  if (p.draft) {
    const r = createDraftResult({
      challengerActions: [], defenderPolicy: d.standingOrders.draftPolicy, challengerPolicy: a.standingOrders.draftPolicy,
      pool: GOLDEN_POOL, challengerSnapshot: a, defenderSnapshot: d, assign: assignDraft, tagsOf: heroTags, heroOf: heroById, laneOf,
    });
    if (!r.ok) throw new Error(`draft failed for ${c.id}`);
    draftResult = r.draft;
  }
  const inst = createChallengeInstance({
    challenger: a, defender: d, challengerTacticId: p.tacticIds[0], seedSource: p.seed, createdAt: 1757000000000,
    issuedBy: SNAPSHOT_AUTHORITY.id, nonce: `golden-${c.id}`, opponentKey: keyB, draftResult,
  });
  if (!inst.ok) throw new Error(`challenge instance failed for ${c.id}`);
  return { challenger: a, defender: d, challenge: inst.challenge, draftResult, keyA, keyB };
}
