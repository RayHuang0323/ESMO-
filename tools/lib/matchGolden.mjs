// ============================================================================
//  tools/lib/matchGolden.mjs — v20 golden baseline: shared hashing helpers + case list
//
//  Phase 3a Task 0 (G-A0). Shared by:
//    · tools/capture_match_golden_v20.mjs  (runs ONCE on v20 code, writes the fixture)
//    · later parity gates T3-T7            (rebuild the same cases, compare to the fixture)
//
//  Nothing here imports from src/ — pure helpers, so a gate can import it before
//  deciding which engine tree to load.
// ============================================================================

export const fnv = (s, h = 0x811c9dc5) => {
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h;
};

/** Stream-hash sample: positions (mm), hp, kills, deaths of every player. */
const sampleOf = (engine) => JSON.stringify(
  engine.players.map((p) => [Math.round(p.pos.x * 1000), Math.round(p.pos.y * 1000), Math.round(p.hp), p.k, p.d]),
);

/** Incremental stream hasher: call `sample(engine)` once per tick, hashes every `every`-th tick. */
export function createStreamHasher(every = 20) {
  let h = 0x811c9dc5, n = 0;
  return {
    sample(engine) { n++; if (n % every === 0) h = fnv(sampleOf(engine), h); },
    get ticks() { return n; },
    get hex() { return h.toString(16); },
  };
}

/**
 * Attach a stream hasher to ONE engine instance (wraps that instance's own `tick`).
 * Returns the hasher; read `.hex` after the run. Does not touch the prototype.
 */
export function engineStreamHash(engine, everyTicks = 20) {
  const hasher = createStreamHasher(everyTicks);
  const orig = engine.tick.bind(engine);
  engine.tick = (...args) => { const r = orig(...args); hasher.sample(engine); return r; };
  return hasher;
}

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
//        Challenge（有／無 draft、雙方素質、各種模板）、balance runner（off／standard、skills on/off）。
//
//  Deviations from the brief's literal list (each one fixes a branch that was dead code):
//   · every seed in [3,7,11,19,23,29] is odd, so `seed % 2 === 0` (talents) was never true and
//     `seed % 3 === 0` (strategy) was true for seed 3 only.  → talents/strategy now follow the
//     case INDEX (i): talents on for i even; strategy cycles early / standard / survival.
//   · "aggressive" is not a build strategy (BUILD_STRATEGIES = standard|early|scaling|counter|
//     survival); normalizeBuildStrategy() would silently map it to "standard".  → "early".
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
