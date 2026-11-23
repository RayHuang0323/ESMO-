// ============================================================================
//  tools/lib/tactic_acceptance_v31.mjs — tactic acceptance contract v3.1 judge (tactic-acceptance.v3.1, DRAFT, NOT ENABLED; 2026-11-23).
//
//  Definition: review/tactic-book-3a/deterministic-math-c1/新版戰術驗收契約草案.md (Owner stage-E principles). Pure functions over
//  measurement records; no engine, no I/O. It is NOT wired into any product gate and must not be used to re-judge Sprint 2A or older data.
//
//  Unit of counting: one SIDE of one match ("side-match"). Each side-match is classified ONCE, before the match, from the engine's own pre-match
//  posture (battle/moba/tactics/tacticExecV24.js postureOf(knobs): invadeChance ≥ 0.7 ⇒ "auto", ≥ 0.3 ⇒ "conservative", else null; "aggressive" and
//  "allin" are the player-chosen postures reserved for Sprint 3):
//     A  posture ∈ {aggressive, allin}         — aggressive lean (it is also an invasion tactic: A takes PRIORITY over T)
//     T  posture ∈ {auto, conservative}        — invasion tactic
//     N  posture null                          — no invasion intent
//  A posture has exactly one value, so the three classes are mutually exclusive by construction; anything else (unknown posture) is rejected.
//
//  Activity: C1 = departures per side-match (mean); C2 = share of side-matches with at least one departure. 95% intervals by seed-cluster
//  bootstrap (all side-matches of a seed are resampled together), deterministic PRNG.
//     N  C1 upper ≤ 0.30 PASS · C1 lower > 0.30 FAIL · else INC                      (no minimum)
//     T  C1 within [0.30, 1.5] AND C2 ≥ 1/3 (both must PASS)
//     A  C1 within [0.6, 1.5] AND C2 ≥ 0.5 (historical targets, separate layer)
//  Why T needs both: C1 alone can be met by a few matches with many invasions (e.g. 10% of matches × 4 departures = C1 0.40 while 90% of players never
//  see an invasion); C2 alone can be met by exactly one token departure per match. Together they mean "at least one in three games shows the
//  tactic, and the average volume stays in the intended range".
//  Fewer than minSides side-matches in a class ⇒ that class is INCONCLUSIVE (sample too small), never PASS.
//  S5-abs (formal): paired differences vs off per side-match — tower-death upper ≤ +0.3 AND death upper ≤ +1.0 ⇒ PASS, else FAIL (unchanged threshold).
//  S5-rel (research review only, formalRelease:false): vs v1.3 — deaths upper < +0.5 NI / lower > +0.5 WORSE; tower deaths +0.15; camps lower > −0.5 NI.
// ============================================================================
export const TACTIC_ACCEPTANCE_VERSION = "tactic-acceptance.v3.1-draft";
export const INTENT_TABLE_VERSION = "tacticIntentTable.v1";
export const ENABLED = false;
export const THRESHOLDS = Object.freeze({
  N: Object.freeze({ c1Max: 0.30 }),
  T: Object.freeze({ c1Min: 0.30, c1Max: 1.5, c2Min: 1 / 3 }),
  A: Object.freeze({ c1Min: 0.6, c1Max: 1.5, c2Min: 0.5 }),
  minSides: 100,
  bootstrap: Object.freeze({ reps: 2000, seed: 20261123, level: 0.95 }),
  S5abs: Object.freeze({ towerDeathsUpperMax: 0.3, deathsUpperMax: 1.0 }),
  S5rel: Object.freeze({ deaths: 0.5, towerDeaths: 0.15, camps: -0.5 }),
});
const POSTURE_CLASS = Object.freeze({ aggressive: "A", allin: "A", auto: "T", conservative: "T" });

/** Pre-match intent class of one side. `posture` is the engine's pre-match posture (null = no invasion intent). */
export function intentClassOf(posture) {
  if (posture === null || posture === undefined) return "N";
  const c = POSTURE_CLASS[posture];
  if (!c) throw new Error(`intentClassOf: unknown posture "${posture}"`);
  return c;
}

/** Split side-match records ({ seed, side, posture, departures, … }) into N/T/A. Every record lands in exactly one class. */
export function classifyRecords(records) {
  const out = { N: [], T: [], A: [] }, seen = new Set();
  for (const r of records) {
    const key = `${r.seed}|${r.matchId ?? ""}|${r.side}`;
    if (seen.has(key)) throw new Error(`classifyRecords: side-match ${key} counted twice`);
    seen.add(key);
    out[intentClassOf(r.posture)].push(r);
  }
  return { ...out, counts: { N: out.N.length, T: out.T.length, A: out.A.length }, total: records.length };
}

function prng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
/** Seed-cluster bootstrap interval of stat(records). Deterministic for a given (records order, reps, seed). */
export function clusterBootstrap(records, stat, { reps = THRESHOLDS.bootstrap.reps, seed = THRESHOLDS.bootstrap.seed, level = THRESHOLDS.bootstrap.level } = {}) {
  const bySeed = new Map();
  for (const r of records) { if (!bySeed.has(r.seed)) bySeed.set(r.seed, []); bySeed.get(r.seed).push(r); }
  const groups = [...bySeed.values()], rnd = prng(seed), vals = [];
  for (let b = 0; b < reps; b++) { const sample = []; for (let i = 0; i < groups.length; i++) sample.push(...groups[Math.floor(rnd() * groups.length)]); vals.push(stat(sample)); }
  vals.sort((x, y) => x - y);
  const lo = vals[Math.floor(((1 - level) / 2) * reps)], hi = vals[Math.min(reps - 1, Math.ceil((1 - (1 - level) / 2) * reps) - 1)];
  return { point: stat(records), lower: lo, upper: hi };
}
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);
const C1 = (rs) => mean(rs.map((r) => r.departures));
const C2 = (rs) => mean(rs.map((r) => (r.departures >= 1 ? 1 : 0)));
const within = (ci, lo, hi) => (ci.lower >= lo && ci.upper <= hi ? "PASS" : ci.upper < lo || ci.lower > hi ? "FAIL" : "INCONCLUSIVE");
const atLeast = (ci, min) => (ci.lower >= min ? "PASS" : ci.upper < min ? "FAIL" : "INCONCLUSIVE");
const both = (a, b) => (a === "FAIL" || b === "FAIL" ? "FAIL" : a === "PASS" && b === "PASS" ? "PASS" : "INCONCLUSIVE");

/** Activity verdict for one class. */
export function judgeActivity(cls, records, opts = {}) {
  if (!["N", "T", "A"].includes(cls)) throw new Error(`judgeActivity: unknown class ${cls}`);
  if (records.some((r) => intentClassOf(r.posture) !== cls)) throw new Error(`judgeActivity: record of another class passed to ${cls}`);
  const n = records.length;
  if (n < THRESHOLDS.minSides) return { cls, n, verdict: "INCONCLUSIVE", reason: `sample < ${THRESHOLDS.minSides} side-matches` };
  const c1 = clusterBootstrap(records, C1, opts), c2 = clusterBootstrap(records, C2, opts);
  if (cls === "N") {
    const v = c1.upper <= THRESHOLDS.N.c1Max ? "PASS" : c1.lower > THRESHOLDS.N.c1Max ? "FAIL" : "INCONCLUSIVE";
    return { cls, n, c1, c2, verdict: v, parts: { c1Max: v } };
  }
  const T = THRESHOLDS[cls], p1 = within(c1, T.c1Min, T.c1Max), p2 = atLeast(c2, T.c2Min);
  return { cls, n, c1, c2, verdict: both(p1, p2), parts: { c1: p1, c2: p2 } };
}

/** S5-abs (formal): pairs { seed, deathsDiff, towerDeathsDiff } vs off. Threshold unchanged from the first-round registration. */
export function judgeS5Abs(pairs, opts = {}) {
  if (!pairs.length) return { verdict: "INCONCLUSIVE", reason: "no pairs" };
  const d = clusterBootstrap(pairs, (rs) => mean(rs.map((r) => r.deathsDiff)), opts), t = clusterBootstrap(pairs, (rs) => mean(rs.map((r) => r.towerDeathsDiff)), opts);
  const ok = t.upper <= THRESHOLDS.S5abs.towerDeathsUpperMax && d.upper <= THRESHOLDS.S5abs.deathsUpperMax;
  return { verdict: ok ? "PASS" : "FAIL", deaths: d, towerDeaths: t, formal: true };
}

/** S5-rel (research review only): pairs { seed, deathsDiff, towerDeathsDiff, campsDiff } vs v1.3. Never a release criterion. */
export function judgeS5Rel(pairs, opts = {}) {
  const M = THRESHOLDS.S5rel;
  if (!pairs.length) return { verdict: "INCONCLUSIVE", reason: "no pairs", researchOnly: true, formalRelease: false };
  const ci = (k) => clusterBootstrap(pairs, (rs) => mean(rs.map((r) => r[k])), opts);
  const d = ci("deathsDiff"), t = ci("towerDeathsDiff"), c = ci("campsDiff");
  const up = (x, m) => (x.upper < m ? "NI" : x.lower > m ? "WORSE" : "INCONCLUSIVE"), down = (x, m) => (x.lower > m ? "NI" : x.upper < m ? "WORSE" : "INCONCLUSIVE");
  const parts = { deaths: up(d, M.deaths), towerDeaths: up(t, M.towerDeaths), camps: down(c, M.camps) };
  const vs = Object.values(parts);
  return { verdict: vs.includes("WORSE") ? "WORSE" : vs.every((v) => v === "NI") ? "NON_INFERIOR" : "INCONCLUSIVE", parts, deaths: d, towerDeaths: t, camps: c, researchOnly: true, formalRelease: false };
}

/** Whole draft judgement: per-class activity + S5-abs (+ S5-rel reported as research only). */
export function judgeContract({ records, s5AbsPairs, s5RelPairs = null }, opts = {}) {
  const k = classifyRecords(records);
  const activity = Object.fromEntries(["N", "T", "A"].map((c) => [c, k[c].length ? judgeActivity(c, k[c], opts) : { cls: c, n: 0, verdict: "NOT_PRESENT" }]));
  const s5abs = judgeS5Abs(s5AbsPairs, opts);
  const present = Object.values(activity).filter((a) => a.verdict !== "NOT_PRESENT").map((a) => a.verdict);
  const absolute = [...present, s5abs.verdict].includes("FAIL") ? "FAIL" : [...present, s5abs.verdict].every((v) => v === "PASS") ? "PASS" : "INCONCLUSIVE";
  return { version: TACTIC_ACCEPTANCE_VERSION, enabled: ENABLED, counts: k.counts, activity, s5abs, s5rel: s5RelPairs ? judgeS5Rel(s5RelPairs, opts) : null,
    absoluteQuality: absolute, note: "draft — not a product gate; formal release additionally requires the cross-engine consistency gate" };
}
