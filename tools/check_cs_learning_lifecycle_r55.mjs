#!/usr/bin/env node
// R55 Learning lifecycle verifier.
// 只驗證賽後 XP absorption / persistence boundary；不啟動 CS simulator。
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { csResultToTransaction } from "../src/platform/progress/adapters/csProgressAdapter.js";
import { applyProgressToState } from "../src/platform/progress/applyMatchProgress.js";
import {
  CS_LEARNING_LIFECYCLE_FORMULA_VERSION,
  learningAdjustedXp,
  learningMultiplierFor,
} from "../src/platform/progress/learningGrowth.js";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const FPS = resolve(ROOT, "src/battle/fps/EsportsFPS3D.jsx");
const LEARNING = resolve(ROOT, "src/platform/progress/learningGrowth.js");
const sha = (value) => createHash("sha256").update(value).digest("hex");
const source = (path) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const gate = (ok, code, detail = "") => {
  if (!ok) throw new Error(`[${code}]${detail ? ` ${detail}` : ""}`);
};

const RESULT = Object.freeze({
  schema: "CsMatchResult.v1",
  mode: "cs",
  matchId: "r55-learning-match",
  mapId: "inferno",
  winner: "us",
  ourScore: 13,
  enemyScore: 9,
  players: [{ playerId: "p1", playerName: "Learner", rating: 1.05, kast: 70 }],
  mvp: null,
});

function player(learning) {
  return {
    id: "p1",
    name: "Learner",
    xp: 0,
    lv: 1,
    talentPoints: 0,
    stats: { learning },
    potential: 99,
    energy: 100,
    morale: 70,
    growthLog: [],
  };
}

function state(learning) {
  return {
    players: [player(learning)],
    finance: { funds: 1000, transactions: [] },
    meta: { fans: 100, reputation: 1, days: 8 },
    processedMatchTransactions: {},
    economy: { formLog: [] },
  };
}

function txFor(learning) {
  return csResultToTransaction(RESULT, {
    players: [player(learning)],
    streak: 0,
    fansNow: 100,
    recordedAt: 1_757_900_000_000,
  });
}

function main() {
  gate(process.argv.length === 2, "CLI_FLAGS_FORBIDDEN");
  const fps = source(FPS);
  const simStart = fps.indexOf("function simulateFps(");
  const resultStart = fps.indexOf("function buildMatchResult");
  gate(simStart >= 0 && resultStart > simStart, "SIMULATOR_BOUNDARY");
  const sim = fps.slice(simStart, resultStart);
  gate(!/\b(?:learning|lrn)\b/.test(sim), "COMBAT_LEARNING_READ");
  gate(!/Math\.random\s*\(|\brand\s*\(/.test(source(LEARNING)), "LEARNING_RNG");

  const resultBefore = JSON.stringify(RESULT);
  const resultDigest = sha(resultBefore);
  const levels = { low: 40, baseline: 70, high: 95 };
  const cases = {};
  for (const [label, learning] of Object.entries(levels)) {
    const tx = txFor(learning);
    gate(tx?.metadata?.playerXpFormulaVersion?.includes(CS_LEARNING_LIFECYCLE_FORMULA_VERSION), "FORMULA_PROVENANCE");
    gate(tx.recordedAt === 1_757_900_000_000, "DETERMINISTIC_TIMESTAMP");
    const applied = applyProgressToState(state(learning), tx);
    gate(applied.nextState && applied.receipt?.ok && applied.receipt.applied, "SETTLEMENT_APPLY", label);
    const saved = JSON.parse(JSON.stringify(applied.nextState));
    const loaded = saved.players[0];
    const entry = loaded.growthLog[0];
    gate(loaded.xp === applied.receipt.players[0].newXp, "SAVE_LOAD_XP", label);
    gate(entry?.source === "match" && entry?.id === `${tx.transactionId}:p1`, "GROWTH_LOG_WRITE", label);
    gate(entry.xpGained === applied.receipt.players[0].xpGained, "GROWTH_LOG_XP", label);
    const duplicate = applyProgressToState(saved, tx);
    gate(!duplicate.nextState && duplicate.receipt?.alreadyApplied, "IDEMPOTENT_SETTLEMENT", label);
    gate(saved.players[0].growthLog.length === 1, "DUPLICATE_GROWTH_LOG", label);
    cases[label] = {
      learning,
      multiplier: learningMultiplierFor(learning),
      xpGained: applied.receipt.players[0].xpGained,
      xpAfter: loaded.xp,
      growthTotal: entry.total,
      transactionId: tx.transactionId,
    };
  }

  const increments = [40, 50, 60, 70].map((learning) => ({
    learning,
    multiplier: learningMultiplierFor(learning),
    xp: learningAdjustedXp({ baseXp: 53, learning }),
  }));
  gate(increments.every((x, i) => i === 0 || x.multiplier > increments[i - 1].multiplier), "LEARNING_MULTIPLIER_DIRECTION");
  gate(increments.slice(1).every((x, i) => x.xp > increments[i].xp), "LEARNING_XP_DIRECTION");
  gate(cases.low.xpGained < cases.baseline.xpGained && cases.baseline.xpGained < cases.high.xpGained, "LOW_BASE_HIGH_DIRECTION");
  gate(resultBefore === JSON.stringify(RESULT), "MATCH_RESULT_MUTATED");

  console.log(`schema: CsLearningLifecycle.v1 / formula=${CS_LEARNING_LIFECYCLE_FORMULA_VERSION}`);
  console.log(`coverage: low=${cases.low.learning} baseline=${cases.baseline.learning} high=${cases.high.learning}`);
  console.log(`settlement XP: low=${cases.low.xpGained} baseline=${cases.baseline.xpGained} high=${cases.high.xpGained}`);
  console.log(`+10 Learning: multiplier +${(10 * 0.002 * 100).toFixed(1)}%; sample 53 XP => ${increments.map((x) => `${x.learning}:${x.xp}`).join(", ")}`);
  console.log(`deterministic transaction: ${cases.baseline.transactionId}; result digest: ${resultDigest}`);
  console.log("save/load: PASS; duplicate settlement: idempotent; duplicate reward: blocked by transactionId");
  console.log("match digest impact: none; simulator Learning read: absent; new RNG: 0");
  console.log("growth owner: applyMatchProgress → players[].xp / growthLog → profileStore.save()");
  console.log("CS Learning Lifecycle R55: PASS");
}

main();
