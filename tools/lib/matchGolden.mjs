// ============================================================================
//  tools/lib/matchGolden.mjs — v20 golden baseline: shared hashing helpers + case list
//
//  Phase 3a Task 0 (G-A0). Shared by:
//    · tools/capture_match_golden_v20.mjs  (runs ONCE on v20 code, writes the fixture)
//    · later parity gates T3-T7            (rebuild the same cases, compare to the fixture)
//
//  Hashing lives in src/battle/moba/debug/engineStreamHash.js (single implementation: the Live hook loads the same
//  functions under ?shot= for the browser parity gate, and production code must not import from tools/).
//  That module imports nothing, so a gate can still import this file before deciding which engine tree to load.
// ============================================================================
import { fnv, createStreamHasher, engineStreamHash, engineStateHash } from "../../src/battle/moba/debug/engineStreamHash.js";

export { fnv, createStreamHasher, engineStreamHash, engineStateHash };

/** Tick until the match is over or `maxT` simulated seconds elapsed. */
export function runToEnd(engine, { dt = 0.5, maxT = 3600 } = {}) {
  while (!engine.over && engine.t < maxT) engine.tick(dt);
  return engine;
}

/** Final-state digest: time:winner:blueKills:redKills:blueGold:redGold. */
export const finalDigest = (engine) =>
  `${engine.t.toFixed(1)}:${engine.winner}:${engine.bK}:${engine.rK}:${Math.round(engine.bGold)}:${Math.round(engine.rGold)}`;

/** Reference implementation: run to the end while hashing the stream. */
export function runAndHash(engine, { dt = 0.5, maxT = 3600, every = 20 } = {}) {
  const hasher = createStreamHasher(every);
  while (!engine.over && engine.t < maxT) { engine.tick(dt); hasher.sample(engine); }
  return { streamHash: hasher.hex, digest: finalDigest(engine) };
}

//  情境：Live 等價（career.v20：有／無天賦選擇、有／無出裝、藍方有選手素質）、
//        Challenge（有／無 draft、雙方素質、各種模板）、balance runner（off／standard／策略、skills on/off）。
//
//  Deviations from the brief's literal list (each one fixes a branch that was dead code):
//   · every seed in [3,7,11,19,23,29] is odd, so `seed % 2 === 0` (talents) was never true and
//     `seed % 3 === 0` (strategy) was true for seed 3 only.  → talents/strategy now follow the
//     case INDEX (i): talents on for i even; strategy cycles early / standard / survival.
//   · "aggressive" is not a build strategy (BUILD_STRATEGIES = standard|early|scaling|counter|
//     survival); normalizeBuildStrategy() would silently map it to "standard".  → "early".
//   · Fix round 1 (appended AFTER the 30 original cases, which are unchanged):
//       - runner per-side strategy branch (runner:146-151, `config !== "standard"`) now has cases:
//         early on seeds 3,7 (odd → strategySide "red") and 10,14 (even → "blue"); counter on 6 (even) / 15 (odd).
//       - Live short-circuit paths: no tactic (configureMatch skipped), no blue players (configurePlayers
//         skipped), no roster (heroes/skills/archetypes/spells/items all skipped — reachable in the hook,
//         opts.roster is optional: "debug harness / old path").
//   · `opponent`: Live red tactic source. null = STANDARD_OPP_TACTIC, "ai" = an AI league team's
//     style (resolved by the capture script from AI_TEAMS[i % AI_TEAMS.length]).
const SEEDS = [3, 7, 11, 19, 23, 29];
const STRATEGY_CYCLE = ["early", "standard", "survival"];

export const GOLDEN_CASES = SEEDS.flatMap((seed, i) => [
  { id: `live-m${seed % 8 + 1}-${seed}`, path: "live", seed, tacticId: `m${seed % 8 + 1}`,
    talents: i % 2 === 0, buildStrategy: STRATEGY_CYCLE[i % 3], opponent: i % 3 === 0 ? null : "ai", index: i },
  { id: `challenge-draft-${seed}`, path: "challenge", seed, draft: true,
    tacticIds: [`m${seed % 8 + 1}`, `m${(seed + 3) % 8 + 1}`], index: i },
  { id: `challenge-nodraft-${seed}`, path: "challenge", seed, draft: false, tacticIds: ["m4", "m7"], index: i },
  { id: `runner-standard-${seed}`, path: "runner", seed, config: "standard", skills: true, talents: true, index: i },
  { id: `runner-off-${seed}`, path: "runner", seed, config: "off", skills: false, talents: false, index: i },
]);

const RUNNER_STRATEGY = [["early", [3, 7, 10, 14]], ["counter", [6, 15]]];
GOLDEN_CASES.push(
  ...RUNNER_STRATEGY.flatMap(([config, seeds]) => seeds.map((seed, i) =>
    ({ id: `runner-${config}-${seed}`, path: "runner", seed, config, skills: true, talents: true, index: i }))),
  { id: "live-notactic-13", path: "live", seed: 13, tacticId: null, talents: true, buildStrategy: "survival", opponent: "ai", index: 6 },
  { id: "live-noplayers-17", path: "live", seed: 17, tacticId: "m5", talents: true, buildStrategy: "early", opponent: "ai", noPlayers: true, index: 7 },
  { id: "live-noroster-21", path: "live", seed: 21, tacticId: "m2", talents: false, buildStrategy: "standard", opponent: "ai", noRoster: true, index: 8 },
);
