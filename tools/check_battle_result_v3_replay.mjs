import assert from "node:assert/strict";
import { LogicEngine } from "../src/LogicEngine.js";
import { snapshotToBattleResult } from "../src/battle/battleResult.js";
import { beginReplayCapture, captureReplayFrame, finalizeReplay, clearReplay } from "../src/battle/moba/replay/replayBuffer.js";
import { createReplaySource } from "../src/battle/moba/replay/replayPresentationSource.js";
import { validateMobaReplay } from "../src/platform/contracts/mobaReplay.js";
import {
  BATTLE_RESULT_VERSION,
  LEGACY_BATTLE_RESULT_VERSIONS,
  deserializeBattleResult,
  isBattleResult,
  serializeBattleResult,
} from "../src/platform/contracts/battleResultVersion.js";

const engine = new LogicEngine(90210);
const base = engine.snapshot();
const players = base.players.map((player, index) => index === 0 ? {
  ...player,
  heroSkills: {
    Q: { level: { current: 2, next: 3, nextAt: 5 } },
    W: { level: { current: 1, next: 2, nextAt: 3 } },
    E: { level: { current: 1, next: 2, nextAt: 3 } },
    R: { level: { current: 1, next: 2, nextAt: 6 } },
  },
} : player);
const running = { ...base, players };
const terminal = { ...running, ts: 2.5, over: true, winner: "blue" };

const result = snapshotToBattleResult(terminal, []);
assert.equal(result.schema, BATTLE_RESULT_VERSION);
assert.equal(result.players[0].heroSkillLevels.Q, 2);
assert.equal(result.players[0].heroSkillLevels.R, 1);
assert.equal(isBattleResult(result), true);

const roundTrip = deserializeBattleResult(serializeBattleResult(result));
assert.deepEqual(roundTrip, result);
for (const legacyVersion of LEGACY_BATTLE_RESULT_VERSIONS) {
  const legacy = { ...result, schema: legacyVersion };
  assert.equal(isBattleResult(legacy), true);
  assert.equal(deserializeBattleResult(JSON.stringify(legacy)).schema, legacyVersion);
}
assert.equal(deserializeBattleResult("not-json"), null);
assert.equal(deserializeBattleResult({ schema: "BattleResult.v1" }), null);

clearReplay();
beginReplayCapture({ seed: 90210, config: { source: "battle-result-v3-targeted" } });
captureReplayFrame(running);
captureReplayFrame(terminal);
const replay = finalizeReplay({
  matchId: "battle-result-v3-targeted",
  resultSummary: {
    resultSchema: result.schema,
    winner: result.winner,
    score: { ...result.score },
    duration: result.duration,
    mvpId: result.mvpId,
  },
});
assert(replay);
assert.equal(replay.resultSummary.resultSchema, BATTLE_RESULT_VERSION);
assert.equal(validateMobaReplay(replay).ok, true);
const source = createReplaySource(replay);
source.seek(replay.duration);
assert.equal(source.getState().snapshot.players.length, 10);

// Replays written before the additive resultSchema field remain valid.
const legacyReplay = { ...replay, resultSummary: { ...replay.resultSummary } };
delete legacyReplay.resultSummary.resultSchema;
assert.equal(validateMobaReplay(legacyReplay).ok, true);
const invalidReplay = { ...replay, resultSummary: { ...replay.resultSummary, resultSchema: "BattleResult.v1" } };
assert.equal(validateMobaReplay(invalidReplay).ok, false);
clearReplay();

console.log(`BattleResult v3 / Replay targeted PASS: ${BATTLE_RESULT_VERSION} + v2 legacy read + resultSummary schema`);
